/**
 * Flagship „Kontrolna ploča uvođenja” – lecture-side bookkeeping around the E3 engine (no Kubernetes logic here):
 * the student's draft of deployment.yaml, `kubectl apply` of that draft through the engine's actions, the incident
 * preset, and the three goals measured from the engine's own rollout records.
 */
import {
  COMPRESSED,
  ROLLOUT_READINESS,
  createDeployment,
  findDeployment,
  getProxyEndpoints,
  presetRollout,
  rolloutTemplate,
  scaleDeployment,
  setDeploymentProbes,
  setDeploymentStrategy,
  setDeploymentVersion,
  stepCluster,
  validateStrategy,
  type ClusterState,
  type Deployment,
  type IntOrPercent,
  type KlopaApiVersion,
} from '../../../engines/cluster'
import { BROKEN } from './options'

export interface Draft {
  image: KlopaApiVersion
  replicas: number
  strategy: 'RollingUpdate' | 'Recreate'
  maxSurge: IntOrPercent
  maxUnavailable: IntOrPercent
  readiness: boolean
}

export const START_DRAFT: Draft = { image: '1.3.2', replicas: 4, strategy: 'RollingUpdate', maxSurge: '25%', maxUnavailable: '25%', readiness: true }

/** Incident 13: Davor's „obriši sve stare, pokreni nove” = strategy Recreate; 1.4.0 is applied 5 s after the start. */
export const INCIDENT_DRAFT: Draft = { ...START_DRAFT, image: '1.4.0', strategy: 'Recreate' }
export const INCIDENT_APPLY_AT = 5
export const SEED = 42

export type PresetId = 'start' | 'incident'

export interface BoardSim {
  c: ClusterState
  preset: PresetId
  /** a scheduled `kubectl apply` (the incident preset) */
  scheduled: { at: number; draft: Draft } | null
  /** the rollout record we are following (its startedAt) */
  seen: number | null
  from: string | null
  to: string | null
  /** seconds in which no Pod answered (kube-proxy had no endpoint at all), since the last rollout started */
  noPodS: number
  /** this rollout has been scored (goals) */
  scored: boolean
  /** start of the broken 1.5.0 rollout (goal 3 clock starts here) */
  brokenAt: number | null
  /** time of `rollout undo` away from a broken 1.5.0 (marks the recovery rollout) */
  undoAt: number | null
  recoverS: number | null
  goals: { clean: boolean; neverBelow: boolean; recover: boolean }
}

export function createBoard(preset: PresetId = 'start'): BoardSim {
  const c = presetRollout({ seed: SEED, strategy: preset === 'incident' ? 'Recreate' : 'RollingUpdate' })
  return {
    c,
    preset,
    scheduled: preset === 'incident' ? { at: INCIDENT_APPLY_AT, draft: INCIDENT_DRAFT } : null,
    seen: null,
    from: null,
    to: null,
    noPodS: 0,
    scored: false,
    brokenAt: null,
    undoAt: null,
    recoverS: null,
    goals: { clean: false, neverBelow: false, recover: false },
  }
}

/** The image key of a template (both 1.5.0 builds share the tag; the behaviour tells them apart). */
export function templateImage(d: Deployment): KlopaApiVersion {
  const v = d.template.app.version
  if (v === '1.5.0') return d.template.app.neverReady ? '1.5.0-never-ready' : '1.5.0-crash'
  return (['1.3.2', '1.4.0', '1.4.1', '2.0.0', '2.0.1'].includes(v) ? v : '1.3.2') as KlopaApiVersion
}

/** What is in the cluster now, in the same shape as the draft (null = no Deployment). */
export function appliedDraft(c: ClusterState): Draft | null {
  const d = findDeployment(c, 'klopa-api')
  if (!d) return null
  return {
    image: templateImage(d),
    replicas: d.replicas,
    strategy: d.strategy.type,
    maxSurge: d.strategy.maxSurge,
    maxUnavailable: d.strategy.maxUnavailable,
    readiness: d.template.probes.readiness !== null,
  }
}

export function sameDraft(a: Draft | null, b: Draft | null): boolean {
  if (!a || !b) return false
  return (
    a.image === b.image &&
    a.replicas === b.replicas &&
    a.strategy === b.strategy &&
    a.readiness === b.readiness &&
    (a.strategy === 'Recreate' || (String(a.maxSurge) === String(b.maxSurge) && String(a.maxUnavailable) === String(b.maxUnavailable)))
  )
}

/** Field names that differ between the file and the cluster (for the „datoteka ≠ klaster” note). */
export function draftDiff(file: Draft, cluster: Draft | null): string[] {
  if (!cluster) return ['Deployment ne postoji']
  const out: string[] = []
  if (file.image !== cluster.image) out.push('image')
  if (file.replicas !== cluster.replicas) out.push('replicas')
  if (file.strategy !== cluster.strategy) out.push('strategy')
  if (file.strategy === 'RollingUpdate' && (String(file.maxSurge) !== String(cluster.maxSurge) || String(file.maxUnavailable) !== String(cluster.maxUnavailable))) out.push('maxSurge / maxUnavailable')
  if (file.readiness !== cluster.readiness) out.push('readinessProbe')
  return out
}

/** API validation of the draft (the whole apply is refused, like the real API server). */
export function draftError(d: Draft): string | null {
  if (d.strategy !== 'RollingUpdate') return null
  return validateStrategy(d.maxSurge, d.maxUnavailable)
}

/**
 * `kubectl apply -f deployment.yaml` with the draft: creates the Deployment when it is missing, otherwise writes the
 * changed fields through the engine (strategy, replicas, and one template change for image + readiness).
 */
export function applyDraft(c: ClusterState, draft: Draft): { ok: boolean; message: string } {
  const err = draftError(draft)
  if (err) return { ok: false, message: `The Deployment "klopa-api" is invalid: ${err}` }
  const d = findDeployment(c, 'klopa-api')
  if (!d) {
    createDeployment(c, {
      name: 'klopa-api',
      replicas: draft.replicas,
      template: rolloutTemplate(draft.image, { readinessProbe: draft.readiness }),
      selector: { app: 'klopa-api' },
      strategy: { type: draft.strategy, maxSurge: draft.maxSurge, maxUnavailable: draft.maxUnavailable },
      progressDeadlineSeconds: COMPRESSED.rolloutProgressDeadline.sim,
    })
    return { ok: true, message: 'deployment.apps/klopa-api created' }
  }
  const cur = appliedDraft(c)!
  const changed: string[] = []
  if (draft.strategy !== cur.strategy || String(draft.maxSurge) !== String(cur.maxSurge) || String(draft.maxUnavailable) !== String(cur.maxUnavailable)) {
    const r = setDeploymentStrategy(c, 'klopa-api', { type: draft.strategy, maxSurge: draft.maxSurge, maxUnavailable: draft.maxUnavailable })
    if (!r.ok) return r
    changed.push('strategy')
  }
  if (draft.replicas !== cur.replicas) {
    const r = scaleDeployment(c, 'klopa-api', draft.replicas)
    if (!r.ok) return r
    changed.push('replicas')
  }
  const readiness = draft.readiness ? { ...ROLLOUT_READINESS } : null
  if (draft.image !== cur.image) {
    const r = setDeploymentVersion(c, 'klopa-api', draft.image, { probes: { ...d.template.probes, readiness } })
    if (!r.ok) return r
    changed.push('image')
  } else if (draft.readiness !== cur.readiness) {
    const r = setDeploymentProbes(c, 'klopa-api', { readiness })
    if (!r.ok) return r
    changed.push('readinessProbe')
  }
  return { ok: true, message: changed.length ? 'deployment.apps/klopa-api configured' : 'deployment.apps/klopa-api unchanged' }
}

function versionOfRevision(c: ClusterState, d: Deployment, rev: number): string | null {
  const rs = c.replicaSets.find((r) => r.owner?.id === d.id && r.revision === rev)
  return rs ? rs.template.app.version : null
}

export function isBrokenVersion(v: string | null): boolean {
  return v === '1.5.0'
}

/** One frame: the scheduled apply, the engine, then the goal bookkeeping (all read from the engine's records). */
export function stepBoard(st: BoardSim, dt: number): void {
  const c = st.c
  if (st.scheduled && c.t >= st.scheduled.at - 1e-6) {
    applyDraft(c, st.scheduled.draft)
    st.scheduled = null
  }
  const before = c.t
  stepCluster(c, dt)
  const ticked = c.t - before
  observe(st, ticked)
}

/** Bookkeeping after a step or an action. */
export function observe(st: BoardSim, ticked = 0): void {
  const c = st.c
  const d = findDeployment(c, 'klopa-api')
  const ro = d?.rollout ?? null
  // no endpoint at all = no Pod answers (kube-proxy also keeps draining Pods while none is ready) – counted even
  // when the Deployment itself was deleted
  if (ticked > 0 && getProxyEndpoints(c, 'klopa-api').length === 0) st.noPodS += ticked
  if (!d || !ro) return
  if (ro.startedAt !== st.seen) {
    st.seen = ro.startedAt
    st.from = versionOfRevision(c, d, ro.fromRevision)
    st.to = d.template.app.version
    st.noPodS = 0
    st.scored = false
    if (isBrokenVersion(st.to)) st.brokenAt ??= ro.startedAt
    else if (st.undoAt === null) st.brokenAt = null // left 1.5.0 by applying the file, not by undo
  }
  if (!st.scored && ro.settledAt !== null) {
    st.scored = true
    if (st.from === '1.3.2' && st.to === '1.4.0' && ro.requests.failed === 0) st.goals.clean = true
    // capacity never dipped: four replicas and at least four available all the time (maxUnavailable 0)
    if (st.from !== st.to && !isBrokenVersion(st.to) && d.replicas === 4 && ro.minAvailable >= 4) st.goals.neverBelow = true
  }
  if (st.undoAt !== null && ro.startedAt >= st.undoAt - 1e-6 && ro.completedAt !== null) {
    if (!isBrokenVersion(st.to)) {
      // measured from applying 1.5.0, so noticing the stall is part of the task
      st.recoverS = ro.completedAt - (st.brokenAt ?? st.undoAt)
      if (st.recoverS < 30) st.goals.recover = true
    }
    st.undoAt = null
    st.brokenAt = null
  }
}

/** Call right before `rollout undo` / `--to-revision`: starts the goal-3 clock when we leave a broken 1.5.0. */
export function markUndo(st: BoardSim): void {
  const d = findDeployment(st.c, 'klopa-api')
  if (d && BROKEN.includes(templateImage(d))) st.undoAt = st.c.t
}
