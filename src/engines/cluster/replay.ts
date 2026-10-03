/**
 * Timeline with rewind (L11 "Vremenska crta s premotavanjem"). The engine is deterministic, so a past moment is
 * rebuilt by re-running the same preset and replaying the recorded actions at the same internal tick.
 *
 * Use the TIMELINE as useSimulation's state (seek replaces tl.state, so a component must not hold the cluster):
 *
 *   const sim = useSimulation({ init: () => createTimeline(() => presetControlPlane()), step: (tl, dt) => stepTimeline(tl, dt) })
 *   sim.mutate((tl) => act(tl, 'kubectl apply', (s) => applyReplicaSetReplicas(s, 'klopa-api', 5)))
 *   sim.mutate((tl) => seek(tl, 12.5))     // look at t = 12,5 s; the later actions are kept
 *   // stepping on from there replays the recorded actions at their ticks and reaches the live state again;
 *   // acting in the past starts a new future (later actions are dropped)
 *   timelineTime(sim.state)                // show this instead of the hook's `time` (SimFrame showTime)
 */
import type { ClusterState } from './types.ts'
import { processTick } from './core.ts'

export interface TimelineAction {
  /** internal tick at which the action was applied (between ticks) */
  tick: number
  t: number
  label: string
  apply: (s: ClusterState) => void
}

export interface Timeline {
  init: () => ClusterState
  state: ClusterState
  /** recorded actions, in tick order */
  actions: TimelineAction[]
  /** how many recorded actions the current state already contains */
  cursor: number
  /** latest time ever reached (the live edge) */
  headT: number
}

export function createTimeline(init: () => ClusterState): Timeline {
  const state = init()
  return { init, state, actions: [], cursor: 0, headT: state.t }
}

/** Apply an action now and remember it for replays. Acting in the past discards the recorded future. */
export function act(tl: Timeline, label: string, apply: (s: ClusterState) => void): void {
  if (tl.cursor < tl.actions.length) {
    tl.actions = tl.actions.slice(0, tl.cursor)
    tl.headT = tl.state.t
  }
  tl.actions.push({ tick: tl.state.tick, t: tl.state.t, label, apply })
  tl.cursor = tl.actions.length
  apply(tl.state)
}

/** Recorded actions due at the current tick (replay after a seek). */
function applyDue(tl: Timeline): void {
  while (tl.cursor < tl.actions.length && tl.actions[tl.cursor].tick <= tl.state.tick) {
    tl.actions[tl.cursor].apply(tl.state)
    tl.cursor += 1
  }
}

/** useSimulation step: like stepCluster, but replays recorded actions at their ticks. */
export function stepTimeline(tl: Timeline, dtSeconds: number): void {
  const s = tl.state
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return
  s.acc += Math.min(dtSeconds, 120)
  const dt = s.cfg.timings.dt
  let n = 0
  while (s.acc + 1e-9 >= dt && n < 200_000) {
    applyDue(tl)
    processTick(s)
    s.acc -= dt
    n += 1
  }
  applyDue(tl)
  tl.headT = Math.max(tl.headT, s.t)
}

/** Rebuild the state at time t (≥ 0) from scratch, keeping every recorded action (non-destructive). */
export function seek(tl: Timeline, t: number): ClusterState {
  const s = tl.init()
  const target = Math.max(0, Math.round((Number.isFinite(t) ? t : 0) / s.cfg.timings.dt))
  tl.state = s
  tl.cursor = 0
  while (s.tick < target) {
    applyDue(tl)
    processTick(s)
  }
  applyDue(tl)
  return s
}

/** Rebuild the state at time t and DISCARD the actions recorded after it (the old destructive rewind). */
export function rewindTo(tl: Timeline, t: number): ClusterState {
  const s = seek(tl, t)
  tl.actions = tl.actions.slice(0, tl.cursor)
  tl.headT = s.t
  return s
}

/** Simulated time of the state shown. */
export function timelineTime(tl: Timeline): number {
  return tl.state.t
}

/** true when the state shown is the latest one (no seek into the past pending). */
export function timelineIsLive(tl: Timeline): boolean {
  return tl.cursor === tl.actions.length && tl.state.t + 1e-9 >= tl.headT
}

/** Scrubber ticks: one per recorded action. */
export function timelineMarks(tl: Timeline): { t: number; label: string }[] {
  return tl.actions.map((a) => ({ t: a.t, label: a.label }))
}
