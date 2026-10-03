/**
 * Deployment controller – mirrors pkg/controller/deployment (rolling.go, recreate.go, sync.go, deployment_util.go).
 *
 * Fence posts: surge = maxSurge of N rounded UP, unavailable = maxUnavailable rounded DOWN, both 0 → unavailable 1.
 * Each sync does scale-up OR scale-down:
 *   maxTotal = N + surge; all = Σ rs.spec.replicas (terminating Pods are NOT counted)
 *   all < maxTotal → newRS += min(maxTotal − all, N − newRS)
 *   else minAvailable = N − unavailable; maxScaledDown = all − minAvailable − (newRS.spec − newRS.available)
 *        → clean up unhealthy old replicas first, then scale old (oldest first) by Σavailable − minAvailable.
 * Recreate: old → 0, wait until every old Pod is gone, then the new ReplicaSet.
 * No automatic rollback: after progressDeadlineSeconds without progress → Progressing=False/ProgressDeadlineExceeded.
 */
import type { ClusterState, Deployment, DeploymentCondition, DeploymentStatus, IntOrPercent, PodTemplate, ReplicaSet, RolloutRecord } from './types.ts'
import { podsOfReplicaSet, replicaSetStatus } from './replicaset.ts'
import { cloneTemplate, controllersUp, isActive, isAvailable, kubeEvent, logEvent, matches, newId, nextSeq, shortImage, templateHash, templateKey } from './util.ts'

// ---------------------------------------------------------------- fence posts

export function isPercent(v: IntOrPercent): v is `${number}%` {
  return typeof v === 'string'
}

/** intstr.GetScaledValueFromIntOrPercent */
export function scaledValue(v: IntOrPercent, total: number, roundUp: boolean): number {
  if (!isPercent(v)) return v
  const pct = parseFloat(v)
  const raw = (pct * total) / 100
  return (roundUp ? Math.ceil(raw - 1e-9) : Math.floor(raw + 1e-9)) || 0
}

/** ResolveFenceposts: surge rounds up, unavailable rounds down; both 0 → unavailable 1 (capped at N). */
export function fenceposts(maxSurge: IntOrPercent, maxUnavailable: IntOrPercent, n: number): { surge: number; unavailable: number } {
  const surge = scaledValue(maxSurge, n, true)
  let unavailable = scaledValue(maxUnavailable, n, false)
  if (surge === 0 && unavailable === 0) unavailable = 1
  return { surge, unavailable: Math.min(unavailable, n) }
}

/** IntOrString percent as the API accepts it (validation.IsValidPercent: `^[0-9]+%$`). */
const PERCENT = /^[0-9]+%$/

/** API validation of a RollingUpdate strategy; returns an error (Croatian, or the API's text) or null. */
export function validateStrategy(maxSurge: IntOrPercent, maxUnavailable: IntOrPercent): string | null {
  for (const [field, v] of [
    ['maxSurge', maxSurge],
    ['maxUnavailable', maxUnavailable],
  ] as const) {
    if (typeof v === 'string' && !PERCENT.test(v)) return `spec.strategy.rollingUpdate.${field}: Invalid value: "${v}": a valid percent string must be a numeric string followed by an ending '%' (e.g. '1%',  or '93%', regex used for validation is '[0-9]+%')`
    if (typeof v === 'number' && !Number.isInteger(v)) return `spec.strategy.rollingUpdate.${field}: Invalid value: ${v}: mora biti cijeli broj ili postotak`
    if (typeof v !== 'string' && typeof v !== 'number') return `spec.strategy.rollingUpdate.${field}: neispravna vrijednost`
  }
  const val = (v: IntOrPercent) => (isPercent(v) ? parseFloat(v) : v)
  if (val(maxSurge) < 0 || val(maxUnavailable) < 0) return 'maxSurge i maxUnavailable ne smiju biti negativni'
  if (isPercent(maxUnavailable) && val(maxUnavailable) > 100) return 'maxUnavailable ne smije biti veći od 100 %'
  if (val(maxSurge) === 0 && val(maxUnavailable) === 0) return 'maxSurge i maxUnavailable ne mogu oba biti 0'
  return null
}

function maxSurgeOf(d: Deployment): number {
  if (d.strategy.type !== 'RollingUpdate') return 0
  return fenceposts(d.strategy.maxSurge, d.strategy.maxUnavailable, d.replicas).surge
}

function maxUnavailableOf(d: Deployment): number {
  if (d.strategy.type !== 'RollingUpdate' || d.replicas === 0) return 0
  return fenceposts(d.strategy.maxSurge, d.strategy.maxUnavailable, d.replicas).unavailable
}

// ---------------------------------------------------------------- lookups

export function replicaSetsOf(s: ClusterState, d: Deployment): ReplicaSet[] {
  return s.replicaSets.filter((r) => r.owner?.id === d.id)
}

/** The ReplicaSet whose template equals the Deployment's template (oldest if several). */
export function findNewReplicaSet(s: ClusterState, d: Deployment): ReplicaSet | null {
  const key = templateKey(d.template)
  const c = replicaSetsOf(s, d).filter((r) => templateKey(r.template) === key)
  c.sort((a, b) => a.createdAt - b.createdAt || a.seq - b.seq)
  return c[0] ?? null
}

function byAge(a: ReplicaSet, b: ReplicaSet): number {
  return a.createdAt - b.createdAt || a.seq - b.seq
}

function sumSpec(rss: ReplicaSet[]): number {
  return rss.reduce((a, r) => a + r.replicas, 0)
}

function availableOf(s: ClusterState, d: Deployment, rs: ReplicaSet): number {
  return replicaSetStatus(s, rs, d.minReadySeconds).available
}

// ---------------------------------------------------------------- scaling helpers

function scaleRS(s: ClusterState, d: Deployment, rs: ReplicaSet, n: number): boolean {
  const old = rs.replicas
  rs.desiredAnnotation = d.replicas
  rs.maxAnnotation = d.replicas + maxSurgeOf(d)
  if (old === n) return false
  rs.replicas = n
  const dir = n > old ? 'up' : 'down'
  kubeEvent(s, 'Normal', 'ScalingReplicaSet', `deployment/${d.name}`, `Scaled ${dir} replica set ${rs.name} from ${old} to ${n}`)
  logEvent(s, 'rs-scaled', `ReplicaSet ${rs.name} (${rs.template.app.version}): ${old} → ${n}`, 'info', rs.id)
  return true
}

function newRSNewReplicas(d: Deployment, all: ReplicaSet[], newRS: ReplicaSet | null): number {
  const cur = newRS?.replicas ?? 0
  if (d.strategy.type === 'Recreate') return d.replicas
  const surge = maxSurgeOf(d)
  const currentPodCount = sumSpec(all)
  const maxTotal = d.replicas + surge
  if (currentPodCount >= maxTotal) return cur
  const up = Math.min(maxTotal - currentPodCount, d.replicas - cur)
  return cur + up
}

function maxRevision(rss: ReplicaSet[]): number {
  return rss.reduce((m, r) => Math.max(m, r.revision), 0)
}

function startRollout(s: ClusterState, d: Deployment, from: number, to: number): void {
  const f = fenceposts(d.strategy.maxSurge, d.strategy.maxUnavailable, d.replicas)
  const rec: RolloutRecord = {
    startedAt: s.t,
    fromRevision: from,
    toRevision: to,
    strategy: d.strategy.type,
    surge: d.strategy.type === 'RollingUpdate' ? f.surge : 0,
    unavailable: d.strategy.type === 'RollingUpdate' ? f.unavailable : d.replicas,
    completedAt: null,
    settledAt: null,
    peakPods: 0,
    peakPodsInclTerminating: 0,
    minAvailable: Infinity,
    timedOutAt: null,
    requests: { ok: 0, failed: 0, byOutcome: { ok: 0, noEndpoints: 0, refused: 0, timeout: 0, http503: 0, http500: 0, http404: 0 } },
  }
  d.rollout = rec
}

/** getNewReplicaSet: sync revision of an existing one, or create it. */
function getNewReplicaSet(s: ClusterState, d: Deployment, oldRSs: ReplicaSet[], existing: ReplicaSet | null, create: boolean): ReplicaSet | null {
  const maxOld = maxRevision(oldRSs)
  if (existing) {
    if (existing.revision <= maxOld) {
      // rolling back / reverting to an older template: it becomes the newest revision
      const from = maxOld
      existing.revision = maxOld + 1
      if (d.template.changeCause) existing.changeCause = d.template.changeCause
      startRollout(s, d, from, existing.revision)
      logEvent(s, 'rollout-start', `Deployment ${d.name}: ReplicaSet ${existing.name} postaje revizija ${existing.revision} (${existing.template.app.version})`, 'info', d.id)
    }
    return existing
  }
  if (!create) return null
  const hash = templateHash(d.template)
  const rs: ReplicaSet = {
    id: newId(s, 'rs'),
    name: `${d.name}-${hash}`,
    namespace: d.namespace,
    selector: { ...d.selector, 'pod-template-hash': hash },
    template: cloneTemplate(d.template),
    replicas: 0,
    owner: { kind: 'Deployment', id: d.id, name: d.name },
    revision: maxOld + 1,
    templateHash: hash,
    createdAt: s.t,
    seq: nextSeq(s),
    desiredAnnotation: d.replicas,
    maxAnnotation: d.replicas + maxSurgeOf(d),
    changeCause: d.template.changeCause,
  }
  const all = [...oldRSs, rs]
  rs.replicas = d.strategy.type === 'Recreate' ? 0 : newRSNewReplicas(d, all, rs)
  s.replicaSets.push(rs)
  if (!(d.rollout && d.rollout.settledAt === null && d.rollout.toRevision === rs.revision)) startRollout(s, d, maxOld, rs.revision)
  setCondition(d, 'progressing', 'True', 'NewReplicaSetCreated', `Created new replica set "${rs.name}"`, s.t, true)
  if (rs.replicas > 0) kubeEvent(s, 'Normal', 'ScalingReplicaSet', `deployment/${d.name}`, `Scaled up replica set ${rs.name} from 0 to ${rs.replicas}`)
  logEvent(s, 'rs-created', `Deployment ${d.name}: novi ReplicaSet ${rs.name} (${shortImage(rs.template.image)}), revizija ${rs.revision}`, 'info', rs.id)
  return rs
}

// ---------------------------------------------------------------- rolling update

function reconcileNewReplicaSet(s: ClusterState, d: Deployment, all: ReplicaSet[], newRS: ReplicaSet): boolean {
  if (newRS.replicas === d.replicas) return false
  if (newRS.replicas > d.replicas) return scaleRS(s, d, newRS, d.replicas)
  const n = newRSNewReplicas(d, all, newRS)
  return scaleRS(s, d, newRS, n)
}

function reconcileOldReplicaSets(s: ClusterState, d: Deployment, all: ReplicaSet[], oldRSs: ReplicaSet[], newRS: ReplicaSet): boolean {
  const oldCount = sumSpec(oldRSs)
  if (oldCount === 0) return false
  const allCount = sumSpec(all)
  const minAvailable = d.replicas - maxUnavailableOf(d)
  const newUnavailable = newRS.replicas - availableOf(s, d, newRS)
  const maxScaledDown = allCount - minAvailable - newUnavailable
  if (maxScaledDown <= 0) return false
  // 1) cleanupUnhealthyReplicas (oldest first)
  let cleaned = 0
  for (const rs of [...oldRSs].sort(byAge)) {
    if (cleaned >= maxScaledDown) break
    if (rs.replicas === 0) continue
    const avail = availableOf(s, d, rs)
    if (rs.replicas === avail) continue
    const down = Math.min(maxScaledDown - cleaned, rs.replicas - avail)
    scaleRS(s, d, rs, rs.replicas - down)
    cleaned += down
  }
  // 2) scaleDownOldReplicaSetsForRollingUpdate
  const availableNow = all.reduce((a, r) => a + availableOf(s, d, r), 0)
  let scaled = 0
  if (availableNow > minAvailable) {
    const total = availableNow - minAvailable
    for (const rs of [...oldRSs].sort(byAge)) {
      if (scaled >= total) break
      if (rs.replicas === 0) continue
      const down = Math.min(rs.replicas, total - scaled)
      scaleRS(s, d, rs, rs.replicas - down)
      scaled += down
    }
  }
  return cleaned + scaled > 0
}

function rolloutRolling(s: ClusterState, d: Deployment, existing: ReplicaSet | null, oldRSs: ReplicaSet[]): ReplicaSet | null {
  const newRS = getNewReplicaSet(s, d, oldRSs, existing, true)!
  const all = [...oldRSs, newRS]
  if (existing === null) return newRS // creation already scaled it this sync
  if (reconcileNewReplicaSet(s, d, all, newRS)) return newRS
  if (reconcileOldReplicaSets(s, d, all, oldRSs.filter((r) => r.replicas > 0), newRS)) return newRS
  if (deploymentComplete(d, calcStatus(s, d, newRS, all))) cleanupHistory(s, d, oldRSs)
  return newRS
}

// ---------------------------------------------------------------- recreate

function rolloutRecreate(s: ClusterState, d: Deployment, existing: ReplicaSet | null, oldRSs: ReplicaSet[]): ReplicaSet | null {
  let newRS = getNewReplicaSet(s, d, oldRSs, existing, false)
  let scaledDown = false
  for (const rs of oldRSs) if (rs.replicas > 0) scaledDown = scaleRS(s, d, rs, 0) || scaledDown
  if (scaledDown) return newRS
  const oldPodsLeft = oldRSs.some((rs) => podsOfReplicaSet(s, rs).some((p) => p.phase !== 'Failed' && p.phase !== 'Succeeded'))
  if (oldPodsLeft) return newRS
  if (!newRS) {
    newRS = getNewReplicaSet(s, d, oldRSs, null, true)!
  }
  if (newRS.replicas !== d.replicas) scaleRS(s, d, newRS, d.replicas)
  if (deploymentComplete(d, calcStatus(s, d, newRS, [...oldRSs, newRS]))) cleanupHistory(s, d, oldRSs)
  return newRS
}

// ---------------------------------------------------------------- scaling events (replicas changed, HPA)

function isScalingEvent(d: Deployment, rss: ReplicaSet[]): boolean {
  return rss.some((r) => r.replicas > 0 && r.desiredAnnotation !== null && r.desiredAnnotation !== d.replicas)
}

/** dc.scale(): one active set takes the full count; otherwise proportional scaling within N + surge. */
function proportionalScale(s: ClusterState, d: Deployment, newRS: ReplicaSet | null, oldRSs: ReplicaSet[]): void {
  const all = newRS ? [...oldRSs, newRS] : [...oldRSs]
  const active = all.filter((r) => r.replicas > 0)
  let activeOrLatest: ReplicaSet | null = null
  if (active.length === 1) activeOrLatest = active[0]
  else if (active.length === 0) activeOrLatest = newRS ?? [...oldRSs].sort(byAge).at(-1) ?? null
  if (activeOrLatest) {
    if (activeOrLatest.replicas === d.replicas) {
      activeOrLatest.desiredAnnotation = d.replicas
      activeOrLatest.maxAnnotation = d.replicas + maxSurgeOf(d)
      return
    }
    scaleRS(s, d, activeOrLatest, d.replicas)
    return
  }
  // new RS saturated → old ones to 0
  if (newRS && newRS.replicas === d.replicas && newRS.desiredAnnotation === d.replicas && availableOf(s, d, newRS) === d.replicas) {
    for (const r of oldRSs) if (r.replicas > 0) scaleRS(s, d, r, 0)
    return
  }
  if (d.strategy.type !== 'RollingUpdate') return
  const allowed = d.replicas > 0 ? d.replicas + maxSurgeOf(d) : 0
  const toAdd = allowed - sumSpec(active)
  if (toAdd === 0) {
    for (const r of active) {
      r.desiredAnnotation = d.replicas
      r.maxAnnotation = allowed
    }
    return
  }
  // larger first; ties: newer first when scaling up, older first when scaling down
  const sorted = [...active].sort((a, b) => b.replicas - a.replicas || (toAdd > 0 ? b.createdAt - a.createdAt || b.seq - a.seq : a.createdAt - b.createdAt || a.seq - b.seq))
  let added = 0
  const target = new Map<string, number>()
  for (const r of sorted) {
    let prop = 0
    if (r.replicas > 0 && toAdd !== added) {
      if (d.replicas === 0) prop = -r.replicas
      else {
        const annotated = r.maxAnnotation && r.maxAnnotation > 0 ? r.maxAnnotation : Math.max(1, sumSpec(active))
        prop = Math.round((r.replicas * allowed) / annotated) - r.replicas
      }
      const left = toAdd - added
      prop = toAdd > 0 ? Math.min(prop, left) : Math.max(prop, left)
    }
    target.set(r.id, r.replicas + prop)
    added += prop
  }
  sorted.forEach((r, i) => {
    let n = target.get(r.id)!
    if (i === 0) n = Math.max(0, n + (toAdd - added))
    scaleRS(s, d, r, n)
  })
}

// ---------------------------------------------------------------- history

function cleanupHistory(s: ClusterState, d: Deployment, oldRSs: ReplicaSet[]): void {
  const cleanable = oldRSs.filter((r) => r.replicas === 0 && podsOfReplicaSet(s, r).length === 0).sort((a, b) => a.revision - b.revision)
  const diff = cleanable.length - d.revisionHistoryLimit
  for (let i = 0; i < diff; i++) {
    const r = cleanable[i]
    s.replicaSets.splice(s.replicaSets.indexOf(r), 1)
    logEvent(s, 'rs-gc', `Stari ReplicaSet ${r.name} (revizija ${r.revision}) obrisan – revisionHistoryLimit ${d.revisionHistoryLimit}`, 'neutral')
  }
}

// ---------------------------------------------------------------- status & conditions

export function calcStatus(s: ClusterState, d: Deployment, newRS: ReplicaSet | null, all: ReplicaSet[]): DeploymentStatus {
  let replicas = 0
  let ready = 0
  let available = 0
  let terminating = 0
  for (const rs of all) {
    const st = replicaSetStatus(s, rs, d.minReadySeconds)
    replicas += st.replicas
    ready += st.ready
    available += st.available
    terminating += st.terminating
  }
  const updated = newRS ? replicaSetStatus(s, newRS, d.minReadySeconds).replicas : 0
  return {
    replicas,
    updatedReplicas: updated,
    readyReplicas: ready,
    availableReplicas: available,
    unavailableReplicas: Math.max(d.replicas - available, 0),
    terminatingReplicas: terminating,
  }
}

export function deploymentComplete(d: Deployment, st: DeploymentStatus): boolean {
  return st.updatedReplicas === d.replicas && st.replicas === d.replicas && st.availableReplicas === d.replicas
}

function setCondition(d: Deployment, which: 'progressing' | 'available', status: DeploymentCondition['status'], reason: string, msg: string, t: number, force = false): void {
  const c = d.conditions[which]
  if (!force && c.status === status && c.reason === reason) return
  const transition = c.status !== status ? t : c.lastTransition
  d.conditions[which] = { status, reason, message: msg, lastUpdate: t, lastTransition: transition }
}

function syncRolloutStatus(s: ClusterState, d: Deployment, newRS: ReplicaSet | null, all: ReplicaSet[]): void {
  const prev = d.status
  const st = calcStatus(s, d, newRS, all)
  const minAvail = d.replicas - maxUnavailableOf(d)
  if (st.availableReplicas >= minAvail) setCondition(d, 'available', 'True', 'MinimumReplicasAvailable', 'Deployment has minimum availability.', s.t)
  else setCondition(d, 'available', 'False', 'MinimumReplicasUnavailable', 'Deployment does not have minimum availability.', s.t)

  const cond = d.conditions.progressing
  if (d.paused) {
    setCondition(d, 'progressing', 'Unknown', 'DeploymentPaused', 'Deployment is paused', s.t)
  } else {
    const isComplete = st.replicas === st.updatedReplicas && cond.reason === 'NewReplicaSetAvailable'
    if (!isComplete) {
      const rsName = newRS ? newRS.name : d.name
      if (deploymentComplete(d, st)) {
        setCondition(d, 'progressing', 'True', 'NewReplicaSetAvailable', `ReplicaSet "${rsName}" has successfully progressed.`, s.t)
      } else if (
        st.updatedReplicas > prev.updatedReplicas ||
        st.replicas - st.updatedReplicas < prev.replicas - prev.updatedReplicas ||
        st.readyReplicas > prev.readyReplicas ||
        st.availableReplicas > prev.availableReplicas
      ) {
        setCondition(d, 'progressing', 'True', 'ReplicaSetUpdated', `ReplicaSet "${rsName}" is progressing.`, s.t, true)
      } else if (cond.reason !== 'ProgressDeadlineExceeded' && cond.reason !== 'NewReplicaSetAvailable' && s.t > cond.lastUpdate + d.progressDeadlineSeconds) {
        setCondition(d, 'progressing', 'False', 'ProgressDeadlineExceeded', `ReplicaSet "${rsName}" has timed out progressing.`, s.t)
        if (d.rollout && d.rollout.timedOutAt === null) d.rollout.timedOutAt = s.t
        kubeEvent(s, 'Warning', 'ProgressDeadlineExceeded', `deployment/${d.name}`, `ReplicaSet "${rsName}" has timed out progressing.`)
        logEvent(s, 'deadline', `Deployment ${d.name}: ProgressDeadlineExceeded – uvođenje stoji, nema automatskog vraćanja`, 'bad', d.id)
      }
    }
  }
  d.status = st
}

// ---------------------------------------------------------------- controller entry

export function deploymentTick(s: ClusterState): void {
  if (!controllersUp(s)) return
  for (const d of s.deployments) syncDeployment(s, d)
}

function syncDeployment(s: ClusterState, d: Deployment): void {
  const rss = replicaSetsOf(s, d)
  const existing = findNewReplicaSet(s, d)
  const oldRSs = rss.filter((r) => r !== existing)
  let newRS: ReplicaSet | null
  if (!existing && !d.paused && oldRSs.length > 0) {
    // template changed: the rollout starts now (Recreate creates its ReplicaSet only after the old Pods are gone)
    const next = maxRevision(oldRSs) + 1
    if (!(d.rollout && d.rollout.settledAt === null && d.rollout.toRevision === next)) startRollout(s, d, next - 1, next)
  }
  if (d.paused || isScalingEvent(d, rss)) {
    newRS = getNewReplicaSet(s, d, oldRSs, existing, false)
    proportionalScale(s, d, newRS, oldRSs)
  } else if (d.strategy.type === 'Recreate') {
    newRS = rolloutRecreate(s, d, existing, oldRSs)
  } else {
    newRS = rolloutRolling(s, d, existing, oldRSs)
  }
  const all = replicaSetsOf(s, d)
  syncRolloutStatus(s, d, newRS, all)
}

/** Rollout bookkeeping, evaluated at the end of every tick (after the kubelets acted). */
export function rolloutStatsTick(s: ClusterState): void {
  for (const d of s.deployments) {
    const r = d.rollout
    if (!r || r.settledAt !== null) continue
    const rss = replicaSetsOf(s, d)
    const pods = s.pods.filter((p) => p.owner?.kind === 'ReplicaSet' && rss.some((x) => x.id === p.owner!.id))
    const active = pods.filter(isActive)
    r.peakPods = Math.max(r.peakPods, active.length)
    r.peakPodsInclTerminating = Math.max(r.peakPodsInclTerminating, pods.length)
    r.minAvailable = Math.min(r.minAvailable, active.filter((p) => isAvailable(p, s.t, d.minReadySeconds)).length)
    const newRS = findNewReplicaSet(s, d)
    const st = calcStatus(s, d, newRS, rss)
    const oldSpec = rss.filter((x) => x !== newRS).reduce((a, x) => a + x.replicas, 0)
    if (r.completedAt === null && newRS && oldSpec === 0 && deploymentComplete(d, st)) {
      r.completedAt = s.t
      kubeEvent(s, 'Normal', 'RolloutComplete', `deployment/${d.name}`, `deployment "${d.name}" successfully rolled out`)
    }
    if (r.completedAt !== null && pods.length === d.replicas && pods.every((p) => p.owner!.id === newRS!.id)) {
      r.settledAt = s.t
      logEvent(s, 'rollout-done', `Uvođenje revizije ${r.toRevision} završeno za ${String(Math.round((s.t - r.startedAt) * 10) / 10).replace('.', ',')} s`, 'ok', d.id)
    }
  }
}

// ---------------------------------------------------------------- user actions (kubectl)

export interface ActionResult {
  ok: boolean
  /** Croatian message for the UI */
  message: string
}

export function createDeployment(
  s: ClusterState,
  o: {
    name: string
    namespace?: string
    replicas: number
    template: PodTemplate
    /** default: the template's labels (a subset is allowed – e.g. app only, while the template also has version) */
    selector?: Record<string, string>
    strategy?: Partial<Deployment['strategy']>
    minReadySeconds?: number
    progressDeadlineSeconds?: number
    revisionHistoryLimit?: number
  },
): Deployment {
  const d: Deployment = {
    id: newId(s, 'deploy'),
    name: o.name,
    namespace: o.namespace ?? s.cfg.namespace,
    replicas: o.replicas,
    selector: { ...(o.selector ?? o.template.labels) },
    template: cloneTemplate(o.template),
    strategy: { type: 'RollingUpdate', maxSurge: '25%', maxUnavailable: '25%', ...(o.strategy ?? {}) },
    minReadySeconds: o.minReadySeconds ?? 0,
    progressDeadlineSeconds: o.progressDeadlineSeconds ?? 600,
    revisionHistoryLimit: o.revisionHistoryLimit ?? 10,
    paused: false,
    generation: 1,
    createdAt: s.t,
    status: { replicas: 0, updatedReplicas: 0, readyReplicas: 0, availableReplicas: 0, unavailableReplicas: 0, terminatingReplicas: 0 },
    conditions: {
      progressing: { status: 'Unknown', reason: '', message: '', lastUpdate: s.t, lastTransition: s.t },
      available: { status: 'Unknown', reason: '', message: '', lastUpdate: s.t, lastTransition: s.t },
    },
    rollout: null,
  }
  s.deployments.push(d)
  return d
}

export function findDeployment(s: ClusterState, name: string, namespace?: string): Deployment | undefined {
  return s.deployments.find((d) => d.name === name && (namespace === undefined || d.namespace === namespace))
}

/** Change the Pod template (image, behaviour, probes…). A changed template creates/selects another ReplicaSet. */
export function updateTemplate(s: ClusterState, d: Deployment, patch: Partial<PodTemplate>): ActionResult {
  const next = { ...cloneTemplate(d.template), ...JSON.parse(JSON.stringify(patch)) } as PodTemplate
  // the selector is immutable; template labels may change as long as they still match it (API validation)
  if (patch.labels && !matches(d.selector, next.labels)) {
    return { ok: false, message: `The Deployment "${d.name}" is invalid: spec.template.metadata.labels: Invalid value: ${JSON.stringify(next.labels)}: \`selector\` does not match template \`labels\`` }
  }
  if (templateKey(next) === templateKey(d.template)) {
    d.template.changeCause = next.changeCause
    return { ok: true, message: 'deployment.apps/' + d.name + ' unchanged' }
  }
  d.template = next
  d.generation += 1
  logEvent(s, 'template', `Deployment ${d.name}: novi predložak Poda (${shortImage(next.image)}) – kreće uvođenje`, 'info', d.id)
  return { ok: true, message: `deployment.apps/${d.name} configured` }
}

export function setStrategy(s: ClusterState, d: Deployment, strategy: Partial<Deployment['strategy']>): ActionResult {
  const next = { ...d.strategy, ...strategy }
  if (next.type === 'RollingUpdate') {
    const err = validateStrategy(next.maxSurge, next.maxUnavailable)
    if (err) return { ok: false, message: err }
  }
  d.strategy = next
  d.generation += 1
  logEvent(s, 'strategy', `Deployment ${d.name}: strategija ${next.type}${next.type === 'RollingUpdate' ? ` (maxSurge ${next.maxSurge}, maxUnavailable ${next.maxUnavailable})` : ''}`, 'info', d.id)
  return { ok: true, message: `deployment.apps/${d.name} configured` }
}

export interface RevisionInfo {
  revision: number
  replicaSet: string
  image: string
  version: string
  changeCause: string
  replicas: number
  current: boolean
}

/** kubectl rollout history */
export function rolloutHistory(s: ClusterState, d: Deployment): RevisionInfo[] {
  const cur = findNewReplicaSet(s, d)
  return replicaSetsOf(s, d)
    .map((r) => ({ revision: r.revision, replicaSet: r.name, image: r.template.image, version: r.template.app.version, changeCause: r.changeCause, replicas: r.replicas, current: r === cur }))
    .sort((a, b) => a.revision - b.revision)
}

/** kubectl rollout undo [--to-revision=N]: copy that ReplicaSet's template back into the Deployment. */
export function rolloutUndo(s: ClusterState, d: Deployment, toRevision?: number): ActionResult {
  if (d.paused) return { ok: false, message: 'Deployment je pauziran – najprije ga nastavite (rollout resume)' }
  const rss = replicaSetsOf(s, d)
  const cur = findNewReplicaSet(s, d)
  let target: ReplicaSet | undefined
  if (toRevision === undefined || toRevision === 0) {
    target = rss.filter((r) => r !== cur && (!cur || r.revision < cur.revision)).sort((a, b) => b.revision - a.revision)[0]
    if (!target) return { ok: false, message: 'nema prethodne revizije (no rollout history found)' }
  } else {
    target = rss.find((r) => r.revision === toRevision)
    if (!target) return { ok: false, message: `revizija ${toRevision} ne postoji` }
  }
  if (target === cur) return { ok: false, message: `revizija ${target.revision} je već trenutačna` }
  const tpl = cloneTemplate(target.template)
  tpl.changeCause = target.changeCause
  d.template = tpl
  d.generation += 1
  logEvent(s, 'rollback', `kubectl rollout undo: ${d.name} se vraća na reviziju ${target.revision} (${target.template.app.version})`, 'warn', d.id)
  kubeEvent(s, 'Normal', 'DeploymentRollback', `deployment/${d.name}`, `Rolled back deployment "${d.name}" to revision ${target.revision}`)
  return { ok: true, message: `deployment.apps/${d.name} rolled back` }
}

export function pauseRollout(s: ClusterState, d: Deployment): ActionResult {
  if (d.paused) return { ok: false, message: 'već je pauziran' }
  d.paused = true
  logEvent(s, 'paused', `Deployment ${d.name} pauziran`, 'info', d.id)
  return { ok: true, message: `deployment.apps/${d.name} paused` }
}

export function resumeRollout(s: ClusterState, d: Deployment): ActionResult {
  if (!d.paused) return { ok: false, message: 'nije pauziran' }
  d.paused = false
  d.conditions.progressing = { status: 'Unknown', reason: 'DeploymentResumed', message: 'Deployment is resumed', lastUpdate: s.t, lastTransition: s.t }
  logEvent(s, 'resumed', `Deployment ${d.name} nastavljen`, 'info', d.id)
  return { ok: true, message: `deployment.apps/${d.name} resumed` }
}

/** kubectl delete deployment: the object goes, the garbage collector removes ReplicaSets and Pods. */
export function deleteDeployment(s: ClusterState, d: Deployment): ActionResult {
  s.deployments.splice(s.deployments.indexOf(d), 1)
  logEvent(s, 'deploy-deleted', `Deployment ${d.name} obrisan – ReplicaSetovi i Podovi idu za njim`, 'bad', d.id)
  return { ok: true, message: `deployment.apps "${d.name}" deleted` }
}
