/**
 * Flagship simulation state: the E1 engine plus the lecture's goal trackers (pure TS, no React).
 * Goals (curriculum L04): 0 % errors at λ = 20 with Klopa's rack · 2 vCPU/4 GB vs 2 vCPU/8 GB · cheapest rack for λ = 25.
 */
import {
  createTraffic,
  mark,
  metrics,
  serversView,
  since,
  type Algo,
  type Mark,
  type ServerSpec,
  type ServerView,
  type TrafficState,
  type WorkloadId,
} from '../../../engines/traffic'
import { DEFAULT_PRICE, PATTERN_PROFILE, isKlopaRack, rackPrice, type Pattern } from '../lb'
import type { DavorSay, StageNote } from './RackStage'

export interface FlagSettings {
  rack: ServerSpec[]
  lambda: number
  pattern: Pattern
  workload: WorkloadId
  algo: Algo
  queueMax: number
  unbounded: boolean
}

interface GoalWindow {
  m: Mark | null
  done: boolean
  /** ms the condition has held (hold-type goals) */
  hold: number
}

export interface FlagState {
  tr: TrafficState
  g1: GoalWindow
  g2a: GoalWindow
  g2b: GoalWindow
  g3: GoalWindow
  lastCheck: number
}

const win = (): GoalWindow => ({ m: null, done: false, hold: 0 })

export function createFlag(set: FlagSettings): FlagState {
  const tr = createTraffic({
    seed: 42,
    // same arrivals whatever the algorithm („Ponovi isti promet” after switching is a fair comparison)
    rngStreams: 'split',
    mode: 'lb',
    servers: set.rack.map((r) => ({ ...r })),
    workload: set.workload,
    lambda: set.lambda,
    algo: set.algo,
    queueMax: set.queueMax,
    unboundedWorkers: set.unbounded,
    profile: PATTERN_PROFILE[set.pattern],
  })
  return { tr, g1: win(), g2a: win(), g2b: win(), g3: win(), lastCheck: 0 }
}

/** No break-it action is active (goals must be met on an honest run). */
function honest(s: TrafficState): boolean {
  return !s.cfg.unboundedWorkers && s.t >= s.burstUntil && s.servers.every((v) => v.slowFactor === 1 && v.proc === 'up') && s.cfg.algo !== 'manual'
}

/** A window that must run `seconds` without breaking `ok`; restarts whenever the precondition fails. */
function windowGoal(s: TrafficState, w: GoalWindow, pre: boolean, seconds: number, ok: (r: ReturnType<typeof since>) => boolean | null) {
  if (w.done) return
  if (!pre) {
    w.m = null
    return
  }
  if (!w.m) {
    w.m = mark(s)
    return
  }
  const r = since(s, w.m)
  const verdict = ok(r)
  if (verdict === false) w.m = mark(s)
  else if (verdict === true && r.durationS >= seconds) w.done = true
}

function find(views: ServerView[], vcpu: number, ramGB: number): ServerView | undefined {
  return views.find((v) => v.vcpu === vcpu && v.ramGB === ramGB && v.proc === 'up')
}

/** Called after every engine step; evaluates goals every 0,5 s of simulated time. */
export function updateGoals(st: FlagState) {
  const s = st.tr
  const dt = s.t - st.lastCheck
  if (dt < 500) return
  st.lastCheck = s.t
  const rack = s.servers
  // 1 · 0 % errors at λ ≥ 20 with Klopa's three servers, for 30 s
  windowGoal(s, st.g1, honest(s) && isKlopaRack(rack) && s.cfg.lambda >= 20 && s.cfg.profile.kind === 'constant', 30, (r) => (r.errors.total > 0 ? false : true))
  // 2a · API: 2/4 and 2/8 both near full CPU and handling the same (±15 %) for 8 s
  const views = serversView(s)
  const a = find(views, 2, 4)
  const b = find(views, 2, 8)
  const holdIf = (w: GoalWindow, cond: boolean, needMs: number) => {
    if (w.done) return
    w.hold = cond ? w.hold + dt : 0
    if (w.hold >= needMs) w.done = true
  }
  holdIf(
    st.g2a,
    !!a && !!b && s.cfg.workload === 'api' && a.cpuSmooth >= 0.85 && b.cpuSmooth >= 0.85 && Math.abs(a.handledPerSec - b.handledPerSec) <= 0.15 * Math.max(a.handledPerSec, b.handledPerSec),
    8000,
  )
  // 2b · some load where the 8 GB server handles ≥ 30 % more while the 4 GB one has every radnik busy
  holdIf(st.g2b, !!a && !!b && a.busy >= a.workers - 1 && b.handledPerSec >= 1.3 * a.handledPerSec && a.handledPerSec > 1, 8000)
  // 3 · λ ≥ 25: p95 < 1,5 s and < 1 % errors for 30 s on a rack cheaper than Klopa's 63 €
  windowGoal(s, st.g3, honest(s) && s.cfg.lambda >= 25 && s.cfg.profile.kind === 'constant' && rackPrice(rack) < DEFAULT_PRICE, 30, (r) => {
    if (r.errorRate >= 0.01) return false
    if (r.durationS < 30) return null
    return r.p95 !== null && r.p95 < 1500 ? true : false
  })
}

/* ---------- reactions on the drawing ---------- */

/** One handwritten note on the drawing (≤ ~60 characters), chosen from what is happening right now. */
export function noteFor(s: TrafficState): StageNote {
  const views = serversView(s)
  const up = views.filter((v) => v.proc === 'up')
  const algo = s.cfg.algo
  const oom = views.find((v) => v.ooms > 0 && v.proc !== 'up')
  if (oom) return { key: `oom-${oom.id}`, text: `${oom.name}: radnika je više nego što stane u RAM – OOM, proces je pao.`, tone: 'red' }
  const slow = views.find((v) => v.slowFactor > 1)
  if (slow && (algo === 'wrr' || algo === 'rr' || algo === 'random'))
    return { key: `slow-${algo}`, text: `${slow.name} je spor, a i dalje dobiva isti dio prometa.`, tone: 'red' }
  if (slow && (algo === 'lc' || algo === 'wlc' || algo === 'p2c' || algo === 'lrt')) return { key: `slow-lc`, text: `${slow.name} sporije završava, pa dobiva manje novih zahtjeva.`, tone: 'pen' }
  if (algo === 'manual') return { key: 'manual', text: 'kliknite poslužitelj: tamo ide sljedeći pladanj', tone: 'pen' }
  if (up.length >= 2) {
    const hot = up.reduce((x, y) => (y.cpuSmooth > x.cpuSmooth ? y : x))
    const cold = up.reduce((x, y) => (y.cpuSmooth < x.cpuSmooth ? y : x))
    if (hot.cpuSmooth > 0.93 && cold.cpuSmooth < 0.5 && hot !== cold)
      return { key: `uneven-${hot.id}-${cold.id}`, text: `${hot.name} na ${Math.round(hot.cpuSmooth * 100)} %, ${cold.name} na ${Math.round(cold.cpuSmooth * 100)} %: raspodjela, ne kapacitet!`, tone: 'red' }
  }
  const m = metrics(s)
  if (m.errorRate > 0.01) return { key: 'overload', text: 'Prometa je više nego što poslužitelji stignu.', tone: 'red' }
  return { key: 'hint', text: 'svaki pladanj = jedan zahtjev', tone: 'ink' }
}

/** Davor on call: the pager buzzes while errors arrive; a short line in a speech bubble. */
export function davorFor(s: TrafficState): DavorSay {
  const views = serversView(s)
  const m = metrics(s)
  const dead = views.find((v) => v.proc === 'crashed' || v.proc === 'starting')
  if (dead && dead.ooms > 0) return { key: 'oom', lines: ['502!', `${dead.name} je pao!`], buzz: true, worried: true }
  if (m.errorRate > 0.05) {
    const worst = views.reduce((x, y) => (y.errors10s.full + y.errors10s.timeout > x.errors10s.full + x.errors10s.timeout ? y : x))
    return { key: `full-${worst.id}`, lines: [m.errors[503] >= m.errors[504] ? '503!' : '504!', `${worst.name} ne stiže!`], buzz: true, worried: true }
  }
  if (m.errorRate > 0.005) return { key: 'some', lines: ['Opet greške…'], buzz: true, worried: true }
  if (m.p95 !== null && m.p95 > 2000) return { key: 'slow', lines: ['Radi, ali', 'sporo.'], buzz: false, worried: true }
  return { key: 'calm', lines: [], buzz: false, worried: false }
}
