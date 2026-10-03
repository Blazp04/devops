/**
 * L20 "Četiri strategije, isti bug" – release lanes built from ordinary Kubernetes objects.
 *
 * - recreate / rolling: one Deployment; the native strategies (SIM 5 rules for rolling).
 * - blue-green: two Deployments (blue, green) and one Service whose selector is flipped once every green Pod
 *   is Ready. Only NEW connections follow the flip; keep-alive connections stay on blue until they close or
 *   blue goes away after scaleDownDelaySeconds (Argo Rollouts default 30 s). Rollback = flip back.
 * - canary-replicas: stable Deployment (N Pods) + canary Deployment (k Pods) behind one Service. The share is
 *   the Pod ratio per new connection, k / (N + k): requested steps snap to achievable ratios
 *   (k = ⌈p·N / (100 − p)⌉ → 5 % → 1 Pod ≈ 20 %, 25 % → 2 ≈ 33 %, 50 % → 4 = 50 %, then 100 %).
 * - canary-weights: Gateway API HTTPRoute weights – every request independently goes to the canary Service with
 *   p = weight / Σweights, independent of the Pod count.
 * Each canary step lasts stepS (30 s) once the canary Pods are Ready; with analysis on, an error rate of the new
 * version above abortErrorRate (2 %) aborts: weight 0 / canary scaled to 0. Nothing here is part of the
 * Deployment object – it is what a person (or Argo Rollouts / Flagger) does with two Deployments.
 */
import type { ClusterState, Deployment, PodTemplate, Release, ReleaseStrategy } from './types.ts'
import { findDeployment, rolloutUndo, updateTemplate } from './rollout.ts'
import { findService, setServiceSelector } from './service.ts'
import { Series } from '../../kit/sim/math.ts'
import { hr, hrCount, isAvailable, logEvent, matches } from './util.ts'

export const RELEASE_APP = 'klopa-api'
export const DEFAULT_CANARY_STEPS = [5, 25, 50, 100]

export interface ReleaseInit {
  strategy: ReleaseStrategy
  replicas: number
  stableVersion: string
  newVersion: string
  newTemplate: PodTemplate
  steps?: number[]
  stepS?: number
  abortErrorRate?: number
  analysis?: boolean
  scaleDownDelayS?: number
  /** length of the per-second exposure series (default 600) */
  seriesLengthS?: number
}

export function createRelease(o: ReleaseInit): Release {
  return {
    strategy: o.strategy,
    replicas: o.replicas,
    stableVersion: o.stableVersion,
    newVersion: o.newVersion,
    newTemplate: o.newTemplate,
    steps: (o.steps ?? DEFAULT_CANARY_STEPS).filter((p) => Number.isFinite(p) && p > 0).map((p) => Math.min(100, p)),
    stepS: o.stepS ?? 30,
    abortErrorRate: o.abortErrorRate ?? 0.02,
    analysis: o.analysis ?? true,
    scaleDownDelayS: o.scaleDownDelayS ?? 30,
    phase: 'idle',
    stepIndex: -1,
    requestedPct: 0,
    actualPct: 0,
    canaryReplicas: 0,
    stepStartedAt: null,
    startedAt: null,
    promotedAt: null,
    finishedAt: null,
    abortedAt: null,
    abortReason: '',
    metrics: { downtimeS: 0, mixedVersionS: 0, extraPodSeconds: 0, firstNewAt: null, rollbackAt: null, recoveredAt: null, stepOk: 0, stepFailed: 0, seenOk: 0, seenFailed: 0, exposureSeries: new Series(o.seriesLengthS ?? 600) },
  }
}

/**
 * Canary Pods needed for a requested share when the stable Deployment keeps N Pods:
 * the smallest k with k / (N + k) ≥ p (p < 100 %); 100 % = full promotion.
 */
export function canaryReplicasFor(pct: number, n: number): number {
  if (!Number.isFinite(pct) || !Number.isFinite(n) || n <= 0 || pct <= 0) return 0
  if (pct >= 100) return n
  return Math.max(1, Math.ceil((pct * n) / (100 - pct) - 1e-9))
}

/** Share of NEW connections the canary gets with k canary Pods next to N stable ones (percent). */
export function replicaSharePct(k: number, n: number): number {
  return k + n > 0 ? (100 * k) / (k + n) : 0
}

// ---------------------------------------------------------------- names

export const LANE = {
  service: RELEASE_APP,
  stableService: `${RELEASE_APP}-stable`,
  canaryService: `${RELEASE_APP}-canary`,
  blue: `${RELEASE_APP}-blue`,
  green: `${RELEASE_APP}-green`,
  stable: RELEASE_APP,
  canary: `${RELEASE_APP}-canary`,
} as const

function deploy(s: ClusterState, name: string): Deployment | undefined {
  return findDeployment(s, name)
}

function availableOf(s: ClusterState, d: Deployment | undefined): number {
  if (!d) return 0
  return s.pods.filter((p) => p.namespace === d.namespace && matches(d.selector, p.labels) && isAvailable(p, s.t, d.minReadySeconds) && p.spec.app.version === d.template.app.version).length
}

function podsOf(s: ClusterState, d: Deployment | undefined): number {
  if (!d) return 0
  return s.pods.filter((p) => p.namespace === d.namespace && matches(d.selector, p.labels)).length
}

function setWeights(s: ClusterState, stable: number, canary: number): void {
  for (const st of s.traffic) {
    if (!st.routes) continue
    for (const r of st.routes) {
      if (r.serviceName === LANE.stableService) r.weight = stable
      if (r.serviceName === LANE.canaryService) r.weight = canary
    }
  }
}

function newVersionTotals(s: ClusterState, version: string): { ok: number; failed: number } {
  let ok = 0
  let failed = 0
  for (const st of s.traffic) {
    ok += st.okByVersion[version] ?? 0
    failed += st.failByVersion[version] ?? 0
  }
  return { ok, failed }
}

// ---------------------------------------------------------------- actions

export interface ReleaseActionResult {
  ok: boolean
  message: string
}

/** "Uvedi 2.0.0": begin deploying the new version in this lane. */
export function startRelease(s: ClusterState): ReleaseActionResult {
  const r = s.release
  if (!r) return { ok: false, message: 'ovaj klaster nema traku izdanja' }
  if (r.phase !== 'idle') return { ok: false, message: 'uvođenje je već pokrenuto' }
  r.startedAt = s.t
  r.phase = 'deploying'
  switch (r.strategy) {
    case 'recreate':
    case 'rolling': {
      const d = deploy(s, LANE.stable)
      if (!d) return { ok: false, message: 'Deployment ne postoji' }
      const t = r.newTemplate
      updateTemplate(s, d, { image: t.image, app: { ...t.app }, changeCause: t.changeCause })
      break
    }
    case 'blue-green': {
      const g = deploy(s, LANE.green)
      if (!g) return { ok: false, message: 'Deployment klopa-api-green ne postoji' }
      g.replicas = r.replicas
      break
    }
    case 'canary-replicas':
    case 'canary-weights':
      r.phase = 'canary'
      enterStep(s, r, 0)
      break
  }
  logEvent(s, 'release-start', `Uvođenje ${r.newVersion} (${strategyLabel(r.strategy)}) je počelo`, 'info')
  return { ok: true, message: 'ok' }
}

function enterStep(s: ClusterState, r: Release, i: number): void {
  r.stepIndex = i
  r.stepStartedAt = null
  r.metrics.stepOk = 0
  r.metrics.stepFailed = 0
  const pct = r.steps[i] ?? 100
  r.requestedPct = pct
  const c = deploy(s, LANE.canary)
  if (!c) return
  if (pct >= 100) {
    promote(s, r)
    return
  }
  if (r.strategy === 'canary-replicas') {
    const k = canaryReplicasFor(pct, r.replicas)
    c.replicas = k
    r.canaryReplicas = k
    r.actualPct = replicaSharePct(k, r.replicas)
    logEvent(s, 'canary-step', `Canary korak ${i + 1}: traženo ${pct} % → stvarno ~${Math.round(r.actualPct)} % (${hrCount(k, ['canary Pod', 'canary Poda', 'canary Podova'])} uz ${hrCount(r.replicas, ['stabilni Pod', 'stabilna Poda', 'stabilnih Podova'])})`, 'info')
  } else {
    const k = Math.max(1, Math.ceil((r.replicas * pct) / 100 - 1e-9))
    c.replicas = k
    r.canaryReplicas = k
    r.actualPct = pct
    // the weight moves only once the canary Pods are Ready (see releaseTick)
    logEvent(s, 'canary-step', `Canary korak ${i + 1}: težina ${pct} % (HTTPRoute), ${hrCount(k, ['canary Pod', 'canary Poda', 'canary Podova'])}`, 'info')
  }
}

function promote(s: ClusterState, r: Release): void {
  r.phase = 'promoted'
  r.promotedAt = s.t
  r.requestedPct = 100
  r.actualPct = 100
  if (r.strategy === 'canary-replicas' || r.strategy === 'canary-weights') {
    const c = deploy(s, LANE.canary)
    if (c) c.replicas = r.replicas
    r.canaryReplicas = r.replicas
  }
  logEvent(s, 'release-promote', `Uvođenje ${r.newVersion} promovirano na 100 %`, 'ok')
}

/** Rollback / abort, the way each strategy does it. */
export function rollbackRelease(s: ClusterState, reason = 'ručno vraćanje'): ReleaseActionResult {
  const r = s.release
  if (!r) return { ok: false, message: 'ovaj klaster nema traku izdanja' }
  if (r.phase === 'idle' || r.phase === 'rolled-back' || r.phase === 'aborted') return { ok: false, message: 'nema uvođenja za vraćanje' }
  r.metrics.rollbackAt = s.t
  r.abortReason = reason
  switch (r.strategy) {
    case 'recreate':
    case 'rolling': {
      const d = deploy(s, LANE.stable)
      if (d) rolloutUndo(s, d)
      r.phase = 'rolled-back'
      break
    }
    case 'blue-green': {
      const svc = findService(s, LANE.service)
      const blue = deploy(s, LANE.blue)
      if (blue) blue.replicas = r.replicas
      // flip back at once if blue still runs, otherwise as soon as blue is available again (releaseTick)
      if (svc && svc.selector.track !== 'blue' && availableOf(s, blue) >= r.replicas) setServiceSelector(s, svc, { app: RELEASE_APP, track: 'blue' })
      r.phase = 'rolled-back'
      break
    }
    case 'canary-replicas':
    case 'canary-weights': {
      setWeights(s, 100, 0)
      const c = deploy(s, LANE.canary)
      const st = deploy(s, LANE.stable)
      if (st) st.replicas = r.replicas
      if (c) c.replicas = 0
      r.canaryReplicas = 0
      r.actualPct = 0
      r.phase = 'aborted'
      r.abortedAt = s.t
      break
    }
  }
  logEvent(s, 'release-rollback', `Vraćanje na ${r.stableVersion}: ${reason}`, 'warn')
  return { ok: true, message: 'ok' }
}

/** Skip the rest of the current canary step (manual "promote step"). */
export function nextCanaryStep(s: ClusterState): boolean {
  const r = s.release
  if (!r || r.phase !== 'canary') return false
  enterStep(s, r, r.stepIndex + 1)
  return true
}

// ---------------------------------------------------------------- controller (every tick)

export function releaseTick(s: ClusterState): void {
  const r = s.release
  if (!r) return
  const tot = newVersionTotals(s, r.newVersion)
  const m = r.metrics
  m.stepOk += Math.max(0, tot.ok - m.seenOk)
  m.stepFailed += Math.max(0, tot.failed - m.seenFailed)
  m.seenOk = tot.ok
  m.seenFailed = tot.failed

  switch (r.strategy) {
    case 'recreate':
    case 'rolling': {
      const d = deploy(s, LANE.stable)
      if (r.phase === 'deploying' && d?.rollout?.completedAt != null && d.template.app.version === r.newVersion) {
        r.phase = 'done'
        r.finishedAt = s.t
      }
      break
    }
    case 'blue-green': {
      const svc = findService(s, LANE.service)
      const blue = deploy(s, LANE.blue)
      const green = deploy(s, LANE.green)
      if (r.phase === 'deploying' && svc && availableOf(s, green) >= r.replicas) {
        setServiceSelector(s, svc, { app: RELEASE_APP, track: 'green' })
        r.phase = 'promoted'
        r.promotedAt = s.t
        logEvent(s, 'bg-switch', `Selektor prebačen na green (${r.newVersion}) – nove veze idu na green, postojeće ostaju na blue dok se ne zatvore`, 'info')
      } else if (r.phase === 'promoted' && blue && r.promotedAt !== null && s.t - r.promotedAt + 1e-9 >= r.scaleDownDelayS && blue.replicas > 0) {
        blue.replicas = 0
        logEvent(s, 'bg-scale-down', `Blue (${r.stableVersion}) smanjen na 0 nakon ${r.scaleDownDelayS} s`, 'neutral')
      } else if (r.phase === 'promoted' && blue && blue.replicas === 0 && podsOf(s, blue) === 0) {
        r.phase = 'done'
        r.finishedAt = s.t
      } else if (r.phase === 'rolled-back' && svc && svc.selector.track !== 'blue' && availableOf(s, blue) >= r.replicas) {
        setServiceSelector(s, svc, { app: RELEASE_APP, track: 'blue' })
      }
      if (r.phase === 'rolled-back' && green && svc?.selector.track === 'blue' && green.replicas > 0) green.replicas = 0
      break
    }
    case 'canary-replicas':
    case 'canary-weights': {
      const c = deploy(s, LANE.canary)
      const stable = deploy(s, LANE.stable)
      if (r.phase === 'canary' && c) {
        const ready = availableOf(s, c) >= c.replicas && c.replicas > 0
        if (r.stepStartedAt === null && ready) {
          r.stepStartedAt = s.t
          m.stepOk = 0
          m.stepFailed = 0
          if (r.strategy === 'canary-weights') setWeights(s, 100 - r.requestedPct, r.requestedPct)
        }
        if (r.stepStartedAt !== null) {
          const n = m.stepOk + m.stepFailed
          const rate = n > 0 ? m.stepFailed / n : 0
          if (r.analysis && n >= 5 && rate > r.abortErrorRate && s.t - r.stepStartedAt + 1e-9 >= r.stepS) {
            rollbackRelease(s, `analiza: ${hr(rate * 100, 1)} % grešaka nove verzije > prag ${hr(r.abortErrorRate * 100, 1)} %`)
          } else if (s.t - r.stepStartedAt + 1e-9 >= r.stepS) {
            enterStep(s, r, r.stepIndex + 1)
          }
        }
      } else if (r.phase === 'promoted' && c && stable) {
        if (availableOf(s, c) >= r.replicas) {
          if (r.strategy === 'canary-weights') setWeights(s, 0, 100)
          if (stable.replicas > 0) stable.replicas = 0
        }
        if (stable.replicas === 0 && podsOf(s, stable) === 0) {
          r.phase = 'done'
          r.finishedAt = s.t
        }
      }
      break
    }
  }
}

/** Whole-second bookkeeping (called before the per-second counters are reset). */
export function releaseSecond(s: ClusterState): void {
  const r = s.release
  if (!r) return
  const m = r.metrics
  const c = s.secondCounters
  if (c.ok + c.err > 0 && c.ok === 0) m.downtimeS += 1
  const newOk = c.okByVersion[r.newVersion] ?? 0
  const oldOk = c.okByVersion[r.stableVersion] ?? 0
  if (newOk > 0 && oldOk > 0) m.mixedVersionS += 1
  if (newOk > 0 && m.firstNewAt === null) m.firstNewAt = s.t
  const running = s.pods.filter((p) => p.labels.app === RELEASE_APP && p.processUp).length
  m.extraPodSeconds += Math.max(0, running - r.replicas)
  if (m.rollbackAt !== null && m.recoveredAt === null && s.t > m.rollbackAt && newOk === 0 && oldOk > 0) m.recoveredAt = s.t
  m.exposureSeries.push(exposure(s, r).exposurePct)
}

/** Users who have been served the new version at least once (any outcome), and shares of users and requests. */
function exposure(s: ClusterState, r: Release): { usersExposed: number; exposurePct: number; requestsToNewPct: number } {
  let exposed = 0
  let users = 0
  let all = 0
  let toNew = 0
  for (const st of s.traffic) {
    users += st.users
    exposed += Object.keys(st.usersByVersion[r.newVersion] ?? {}).length
    for (const v of Object.values(st.totals)) all += v
    for (const v of Object.values(st.outcomesByVersion[r.newVersion] ?? {})) toNew += v
  }
  return { usersExposed: exposed, exposurePct: users > 0 ? (100 * exposed) / users : 0, requestsToNewPct: all > 0 ? (100 * toNew) / all : 0 }
}

export interface ReleaseStats {
  strategy: ReleaseStrategy
  phase: Release['phase']
  requestedPct: number
  actualPct: number
  downtimeS: number
  mixedVersionS: number
  /** Pod-hours above N (multiply by the €/Pod-hour the lecture uses) */
  extraPodHours: number
  usersHit: number
  failed: number
  /** seconds from the rollback click until every successful request is served by the stable version again */
  timeToRollbackS: number | null
  newVersionErrorRate: number
  /** distinct users served by the new version at least once (L20 „prije 10 % izloženosti”) */
  usersExposed: number
  /** usersExposed / all users, percent */
  exposurePct: number
  /** share of all requests that reached the new version, percent */
  requestsToNewPct: number
}

export function releaseStats(s: ClusterState): ReleaseStats | null {
  const r = s.release
  if (!r) return null
  let usersHit = 0
  let failed = 0
  for (const st of s.traffic) {
    usersHit += Object.keys(st.usersHit).length
    failed += st.totals.noEndpoints + st.totals.refused + st.totals.timeout + st.totals.http503 + st.totals.http500
  }
  const tot = newVersionTotals(s, r.newVersion)
  const m = r.metrics
  return {
    strategy: r.strategy,
    phase: r.phase,
    requestedPct: r.requestedPct,
    actualPct: r.actualPct,
    downtimeS: m.downtimeS,
    mixedVersionS: m.mixedVersionS,
    extraPodHours: m.extraPodSeconds / 3600,
    usersHit,
    failed,
    timeToRollbackS: m.rollbackAt !== null && m.recoveredAt !== null ? m.recoveredAt - m.rollbackAt : null,
    newVersionErrorRate: tot.ok + tot.failed > 0 ? tot.failed / (tot.ok + tot.failed) : 0,
    ...exposure(s, r),
  }
}

export function strategyLabel(st: ReleaseStrategy): string {
  return { recreate: 'Recreate', rolling: 'RollingUpdate', 'blue-green': 'plavo-zeleno', 'canary-replicas': 'canary po replikama', 'canary-weights': 'canary po težinama Gatewaya' }[st]
}

// ---------------------------------------------------------------- expand / contract (database schema)

export type SchemaChange = { kind: 'add'; column: string } | { kind: 'drop'; column: string } | { kind: 'rename'; from: string; to: string }

/** "Baza ne ide unatrag": change the shared database's columns (instant, like a migration job). */
export function migrateSchema(s: ClusterState, change: SchemaChange): boolean {
  const cols = s.db.columns
  if (change.kind === 'add') {
    if (cols.includes(change.column)) return false
    cols.push(change.column)
    logEvent(s, 'schema', `Migracija: dodan stupac ${change.column}`, 'info')
    return true
  }
  if (change.kind === 'drop') {
    const i = cols.indexOf(change.column)
    if (i < 0) return false
    cols.splice(i, 1)
    logEvent(s, 'schema', `Migracija: obrisan stupac ${change.column} – nepovratno`, 'warn')
    return true
  }
  const i = cols.indexOf(change.from)
  if (i < 0 || cols.includes(change.to)) return false
  cols[i] = change.to
  logEvent(s, 'schema', `Migracija u jednom koraku: ${change.from} → ${change.to}`, 'warn')
  return true
}
