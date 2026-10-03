/**
 * Flagship „Četiri strategije, isti bug": a thin adapter over the cluster engine (E3) release lanes.
 * Every lane is its own ClusterState from presetRelease with the SAME seed, so arrivals, users and bug draws are
 * identical across lanes; all lanes are stepped with the same dt and the release starts in every lane at START_AT.
 * Nothing here models Kubernetes — it only starts the lanes, samples series, latches goals and merges the logs.
 */
import { Series, plural, type SimEvent } from '../../../kit'
import { presetRelease, releaseStats, rollbackRelease, startRelease, stepCluster, type ClusterState, type ReleaseStats, type ReleaseStrategy } from '../../../engines/cluster'
import { relabelEvent } from './labels'

export const SEED = 42
/** the release starts in every lane at this simulated second (story: petak, 11:30) */
export const START_AT = 3
export const USERS = 1000
export const RPS = 20
export const SERIES_S = 150

export type LaneKey = 'recreate' | 'rolling' | 'blue-green' | 'canary'
export type CanaryMode = 'replicas' | 'weights'
export type StepPlan = 'std' | 'fine' | 'coarse'

export const STEP_PLANS: Record<StepPlan, number[]> = {
  std: [5, 25, 50, 100],
  fine: [1, 5, 25, 100],
  coarse: [20, 50, 100],
}

export interface RaceParams {
  /** share of 2.0.0 requests with the VAT bug, percent */
  bugPct: number
  /**
   * „Sakrij grešku od analize": the analysis only counts HTTP 5xx and the wrong VAT answers 200 OK, so it sees nothing
   * (engine analysis off). By default the analysis measures the business metric (share of 2.0.0 orders with wrong VAT).
   */
  hidden: boolean
  canary: CanaryMode
  plan: StepPlan
  /** analysis abort threshold, percent */
  thresholdPct: number
}

export const DEFAULT_PARAMS: RaceParams = { bugPct: 20, hidden: false, canary: 'replicas', plan: 'std', thresholdPct: 2 }

export interface RollbackMark {
  at: number
  exposurePct: number
  /** the lane had already switched / promoted traffic to 2.0.0 */
  afterSwitch: boolean
}

export interface Lane {
  key: LaneKey
  strategy: ReleaseStrategy
  s: ClusterState
  /** distinct users who got a wrong bill (the VAT bug), sampled every second */
  hit: Series
  /** distinct users who got a wrong bill (the engine's bug outcome: HTTP 500 from the new version) */
  vat: Set<number>
  /** distinct users whose order got no answer (no endpoints, refused, timeout, 503) */
  noAnswer: Set<number>
  rollback: RollbackMark | null
}

export interface RaceGoals {
  fewUsers: boolean
  hiddenEarly: boolean
  bgFast: boolean
}

export interface Race {
  params: RaceParams
  lanes: Lane[]
  started: boolean
  goals: RaceGoals
  /** lecture-side notes merged into the engine logs */
  notes: SimEvent[]
  noteId: number
  lastSample: number
}

export const LANE_KEYS: LaneKey[] = ['recreate', 'rolling', 'blue-green', 'canary']

export function laneStrategy(key: LaneKey, canary: CanaryMode): ReleaseStrategy {
  if (key === 'canary') return canary === 'weights' ? 'canary-weights' : 'canary-replicas'
  return key
}

function createLane(key: LaneKey, p: RaceParams): Lane {
  const strategy = laneStrategy(key, p.canary)
  const s = presetRelease({
    strategy,
    seed: SEED,
    bugRate: p.bugPct / 100,
    rps: RPS,
    users: USERS,
    analysis: !p.hidden,
    steps: STEP_PLANS[p.plan],
    abortErrorRate: p.thresholdPct / 100,
  })
  return { key, strategy, s, hit: new Series(SERIES_S), vat: new Set(), noAnswer: new Set(), rollback: null }
}

/**
 * Splits the failed requests recorded since `since` (one tick) by cause. The engine models the VAT bug as an HTTP 500
 * from the new version; the lecture tells it as a wrong bill (200 OK). Everything else is an order without an answer.
 */
export function tallyFailures(s: ClusterState, since: number, vat: Set<number>, noAnswer: Set<number>): void {
  const next = s.release?.newVersion
  for (let i = s.recent.length - 1; i >= 0; i--) {
    const r = s.recent[i]
    if (r.t < since - 1e-9) break
    if (r.outcome === 'ok' || r.user === null) continue
    if (r.outcome === 'http500' && r.version === next) vat.add(r.user)
    else noAnswer.add(r.user)
  }
}

export function createRace(p: RaceParams, goals?: RaceGoals): Race {
  return {
    params: { ...p },
    lanes: LANE_KEYS.map((k) => createLane(k, p)),
    started: false,
    goals: goals ? { ...goals } : { fewUsers: false, hiddenEarly: false, bgFast: false },
    notes: [],
    noteId: 0,
    lastSample: -1,
  }
}

/** New parameters: the race starts over (same seed), the ticked goals stay. */
export function rebuildRace(r: Race, p: RaceParams, why: string): void {
  const next = createRace(p, r.goals)
  r.params = next.params
  r.lanes = next.lanes
  r.started = false
  r.lastSample = -1
  r.notes = []
  note(r, `${why} – utrka kreće ispočetka`, 'info')
}

export function raceTime(r: Race): number {
  return r.lanes[0]?.s.t ?? 0
}

function note(r: Race, text: string, tone: SimEvent['tone']): void {
  r.notes.push({ id: `n${r.noteId++}`, t: raceTime(r), text, tone })
  if (r.notes.length > 20) r.notes.shift()
}

export function stepRace(r: Race, dt: number): void {
  for (const lane of r.lanes) {
    const t0 = lane.s.t
    stepCluster(lane.s, dt)
    tallyFailures(lane.s, t0, lane.vat, lane.noAnswer)
  }
  const t = raceTime(r)
  if (!r.started && t >= START_AT - 1e-9) {
    r.started = true
    for (const lane of r.lanes) startRelease(lane.s)
  }
  const sec = Math.floor(t + 1e-9)
  if (sec !== r.lastSample) {
    r.lastSample = sec
    for (const lane of r.lanes) lane.hit.push(lane.vat.size)
  }
  checkGoals(r)
}

export function laneStats(lane: Lane): ReleaseStats {
  return releaseStats(lane.s)!
}

/** „Vrati" on one lane (a person pressing the button, or Argo Rollouts' abort). */
export function rollbackLane(r: Race, key: LaneKey): boolean {
  const lane = r.lanes.find((l) => l.key === key)
  if (!lane) return false
  const st = laneStats(lane)
  const rel = lane.s.release!
  const afterSwitch = rel.promotedAt !== null || (lane.strategy !== 'blue-green' && st.requestsToNewPct > 0)
  const res = rollbackRelease(lane.s)
  if (!res.ok) return false
  lane.rollback = { at: lane.s.t, exposurePct: st.exposurePct, afterSwitch }
  checkGoals(r)
  return true
}

function checkGoals(r: Race): void {
  const g = r.goals
  const p = r.params
  for (const lane of r.lanes) {
    const st = releaseStats(lane.s)
    if (!st) continue
    const rel = lane.s.release!
    if (!g.fewUsers && lane.key === 'canary' && !p.hidden && p.bugPct >= 20 && st.phase === 'aborted' && rel.abortReason.startsWith('analiza') && lane.vat.size < 15) {
      g.fewUsers = true
      note(r, `Zadatak 1: analiza je zaustavila 2.0.0; krivi račun: ${plural(lane.vat.size, ['student', 'studenta', 'studenata'])}`, 'ok')
    }
    if (!g.hiddenEarly && lane.key === 'canary' && p.hidden && p.bugPct > 0 && lane.rollback && lane.rollback.exposurePct < 10) {
      g.hiddenEarly = true
      note(r, `Zadatak 2: canary vraćen dok je 2.0.0 vidjelo ${lane.rollback.exposurePct.toFixed(1).replace('.', ',')} % studenata`, 'ok')
    }
    if (!g.bgFast && lane.key === 'blue-green' && p.bugPct > 0 && lane.rollback?.afterSwitch && st.timeToRollbackS !== null && st.timeToRollbackS < 5) {
      g.bgFast = true
      note(r, `Zadatak 3: plavo-zeleno vraćeno za ${st.timeToRollbackS.toFixed(1).replace('.', ',')} s`, 'ok')
    }
  }
}

const RELEASE_KINDS = new Set(['release-start', 'canary-step', 'release-promote', 'release-rollback', 'bg-switch', 'bg-scale-down', 'rollout-done'])

export const LANE_SHORT: Record<LaneKey, string> = {
  recreate: 'Recreate',
  rolling: 'Postupno',
  'blue-green': 'Plavo-zeleno',
  canary: 'Canary',
}

/** Engine release events of all lanes + the lecture's notes, oldest first. */
export function raceLog(r: Race): SimEvent[] {
  const out: SimEvent[] = []
  for (const lane of r.lanes) {
    for (const e of lane.s.events) {
      if (!RELEASE_KINDS.has(e.kind) || e.t < START_AT - 0.5) continue
      out.push({ id: `${lane.key}-${e.id}`, t: e.t, text: `${LANE_SHORT[lane.key]}: ${relabelEvent(e.text)}`, tone: e.tone === 'info' || e.tone === 'ok' || e.tone === 'warn' || e.tone === 'bad' ? e.tone : 'neutral' })
    }
  }
  out.push(...r.notes)
  return out.sort((a, b) => a.t - b.t)
}
