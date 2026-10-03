/**
 * Headless runs of the E3 engine for the lecture's step-by-step drawings and small multiples.
 * Nothing is re-modelled here: we only run presetRollout (seed 42) and copy what the engine produced.
 * Each run is computed once, on first use (a few thousand 0,1 s ticks – milliseconds).
 */
import {
  advance,
  deploymentView,
  kubectlGetPods,
  kubectlGetReplicaSets,
  presetRollout,
  processTick,
  rolloutHistory,
  setDeploymentVersion,
  undoRollout,
  type ClusterState,
  type IntOrPercent,
} from '../../../engines/cluster'
import { boardModel, servedByVersion, type BoardModel } from './board'

export interface Snapshot {
  /** seconds since `kubectl apply` */
  t: number
  board: BoardModel
  /** answered requests per version in the last 3 s */
  served: Record<string, number>
}

function snap(c: ClusterState, t0: number): Snapshot {
  return { t: Math.round((c.t - t0) * 10) / 10, board: boardModel(c), served: servedByVersion(c, 3) }
}

/**
 * The rolling update 1.3.2 → 1.4.0 with the defaults (N = 4, maxSurge 25 % → 1, maxUnavailable 25 % → 1),
 * captured at the moments where something visible changes (see the engine trace in the lecture's Stepper):
 * before, the first two syncs, waiting for readiness, the first new Pod Ready, both versions serving,
 * the last old Pod draining, done.
 */
export const STORY_TIMES = [0, 0.4, 5.4, 11.7, 16.6, 22.7, 27.6] as const

let storyCache: Snapshot[] | null = null
export function rolloutStory(): Snapshot[] {
  if (storyCache) return storyCache
  const c = presetRollout({ seed: 42 })
  advance(c, 3)
  const before = snap(c, c.t)
  const t0 = c.t
  setDeploymentVersion(c, 'klopa-api', '1.4.0')
  const out: Snapshot[] = [before]
  for (const t of STORY_TIMES.slice(1)) {
    while (c.t - t0 < t - 1e-6) processTick(c)
    out.push(snap(c, t0))
  }
  storyCache = out
  return out
}

export interface LaneSample {
  t: number
  oldReady: number
  oldNotReady: number
  newReady: number
  newNotReady: number
  terminating: number
}

export interface LaneRun {
  key: string
  maxSurge: IntOrPercent
  maxUnavailable: IntOrPercent
  surge: number
  unavailable: number
  /** until the last old Pod is gone (the validated SIM 5 duration) */
  durationS: number
  peakPods: number
  peakInclTerminating: number
  minAvailable: number
  samples: LaneSample[]
}

export const LANES: { maxSurge: IntOrPercent; maxUnavailable: IntOrPercent }[] = [
  { maxSurge: '25%', maxUnavailable: '25%' },
  { maxSurge: 1, maxUnavailable: 0 },
  { maxSurge: 0, maxUnavailable: 1 },
  { maxSurge: '100%', maxUnavailable: 0 },
]

const SAMPLE_S = 0.5

let laneCache: LaneRun[] | null = null
/** The four validated N = 4 rollouts of sim-models SIM 5 (28 / 51 / 46 / 17 s), sampled every 0,5 s. */
export function laneRuns(): LaneRun[] {
  if (laneCache) return laneCache
  laneCache = LANES.map(({ maxSurge, maxUnavailable }) => {
    const c = presetRollout({ seed: 42, maxSurge, maxUnavailable, traffic: false })
    const t0 = c.t
    setDeploymentVersion(c, 'klopa-api', '1.4.0')
    const samples: LaneSample[] = []
    let next = 0
    for (let i = 0; i < 1200; i++) {
      const t = c.t - t0
      if (t >= next - 1e-6) {
        samples.push(sample(c, t))
        next += SAMPLE_S
      }
      if (c.deployments[0].rollout?.settledAt != null) break
      processTick(c)
    }
    const ro = c.deployments[0].rollout!
    samples.push(sample(c, c.t - t0))
    const v = deploymentView(c, 'klopa-api')!
    return {
      key: `${maxSurge}/${maxUnavailable}`,
      maxSurge,
      maxUnavailable,
      surge: v.surge,
      unavailable: v.unavailable,
      durationS: (ro.settledAt ?? c.t) - ro.startedAt,
      peakPods: ro.peakPods,
      peakInclTerminating: ro.peakPodsInclTerminating,
      minAvailable: ro.minAvailable,
      samples,
    }
  })
  return laneCache
}

function sample(c: ClusterState, t: number): LaneSample {
  const b = boardModel(c)
  const s: LaneSample = { t: Math.round(t * 10) / 10, oldReady: 0, oldNotReady: 0, newReady: 0, newNotReady: 0, terminating: 0 }
  for (const r of b.rows) {
    for (const p of r.pods) {
      if (p.terminating) s.terminating += 1
      else if (r.isNew) {
        if (p.ready) s.newReady += 1
        else s.newNotReady += 1
      } else if (p.ready) s.oldReady += 1
      else s.oldNotReady += 1
    }
  }
  return s
}

export interface StallRun {
  board: BoardModel
  getRs: string[]
  getPods: string[]
  history: { revision: number; changeCause: string }[]
  /** seconds after `kubectl apply` of 1.5.0 when Progressing became False / ProgressDeadlineExceeded */
  timedOutAfterS: number
  /** time from `rollout undo` until the rollout is complete again */
  undoS: number
  historyAfterUndo: { revision: number; changeCause: string }[]
}

let stallCache: StallRun | null = null
/** 1.3.2 → 1.4.0 (done) → 1.5.0 that crashes: the stall at 3 old Ready + 2 new, then `kubectl rollout undo`. */
export function stallRun(): StallRun {
  if (stallCache) return stallCache
  const c = presetRollout({ seed: 42 })
  setDeploymentVersion(c, 'klopa-api', '1.4.0')
  advance(c, 40)
  const t0 = c.t
  setDeploymentVersion(c, 'klopa-api', '1.5.0-crash')
  advance(c, 70)
  const d = c.deployments[0]
  const ro = d.rollout!
  const board = boardModel(c)
  const getRs = kubectlGetReplicaSets(c)
  const getPods = kubectlGetPods(c)
  const history = rolloutHistory(c, d).map((h) => ({ revision: h.revision, changeCause: h.changeCause }))
  const timedOutAfterS = (ro.timedOutAt ?? c.t) - t0
  // the engine's own undo (kubectl rollout undo)
  const tu = c.t
  const undoResult = undoRollout(c, 'klopa-api').ok
  let undoS = Number.NaN
  if (undoResult) {
    for (let i = 0; i < 900; i++) {
      processTick(c)
      if (c.deployments[0].rollout?.completedAt != null) {
        undoS = c.t - tu
        break
      }
    }
  }
  const historyAfterUndo = rolloutHistory(c, c.deployments[0]).map((h) => ({ revision: h.revision, changeCause: h.changeCause }))
  stallCache = { board, getRs, getPods, history, timedOutAfterS, undoS, historyAfterUndo }
  return stallCache
}
