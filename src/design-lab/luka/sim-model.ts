/**
 * Load-balancer simulation (pure TS, no React). Deliberately small, but qualitatively correct:
 *  - each request needs one core for SERVICE seconds and holds RAM_PER_REQ GB while it is on the server
 *    (under a crane = being processed, or in the yard = waiting); RAM slots = ramGb / RAM_PER_REQ
 *  - when the yard (RAM) is full, at most BACKLOG trucks may wait at the dock's door (the connection backlog);
 *    a request that finds the backlog full as well is rejected (error 503, counted at once)
 *  - round robin hands out requests in turn; least connections picks the server with the fewest open
 *    connections = dispatched by the gate and not yet answered by the server. The trip back is drawn in slow
 *    motion for clarity; in reality it takes milliseconds, so it does not count as an open connection.
 *  - health checks every HC_INTERVAL; HC_FAILS failures in a row remove a server, HC_OKS successes restore it
 *
 * Geometry: one compact "terminal" shared by the simulation and the step-through. The main road runs along +x
 * into the gate; behind the gate a junction fans out into three lanes of EQUAL length (so the time a request
 * spends on the road is the same for every server), each ending at a dock. Every truck drives at one constant
 * speed; a truck only stops behind another truck (car following) or at a dock's door.
 */
import { along, makePath, type Dir, type Path, type V2 } from './iso-math'

export type Algo = 'rr' | 'lc'
export type Status = 'req' | 'ok' | 'err'

export const SPEED = 4.2 // world units / s — trucks always drive at this speed
export const SLIDE = 4.2 // crate speed on a dock
export const SERVICE = 2.0 // s of one core per request
export const RAM_PER_REQ = 0.5 // GB held by a request while on the server
export const HC_INTERVAL = 0.5
export const HC_FAILS = 4
export const HC_OKS = 2
/** trucks that may wait at a dock's door while its yard (RAM) is full */
export const BACKLOG = 2
/** size of a truck in the yard drawings, and bumper-to-bumper spacing in a lane (world units) */
export const TRUCK_K = 0.95
export const QGAP = 1.1

export interface Spec {
  name: string
  cores: number
  ramGb: number
  cols: number
}
export const SPECS: Spec[] = [
  { name: 'Mali', cores: 1, ramGb: 2, cols: 3 },
  { name: 'Srednji', cores: 2, ramGb: 4, cols: 3 },
  { name: 'Veliki', cores: 4, ramGb: 8, cols: 4 },
]

/* ----------------------------------------------------------------- layout */

export const LANE = 0.25 // half distance between the two traffic lanes of a road
export const ROAD_W = 1.14
export const GATE_X = -1.45
export const SOURCE_X = -7.4
export const DOCK_H = 0.22
export const PITCH = 0.95
const MARGIN = 0.3
const GAP = 0.35
export const STOP = 0.5 // trucks stop this far before the dock edge
/** gate → dock entry, identical for all three lanes */
export const LANE_LEN = 5.0
const A_S = LANE_LEN + GATE_X // Srednji straight ahead
const A_M = A_S - 2 * LANE // Mali to the north (left turn crosses one lane less)
const A_V = A_S + 2 * LANE // Veliki to the south

export interface DockGeo {
  /** entry centre in world coordinates */
  ex: number
  ey: number
  /** inward (depth) and across axis, unit vectors along world x or y */
  V: V2
  U: V2
  w: number
  d: number
  /** slot centres in local (u, v) */
  bays: V2[]
  yard: V2[]
  uIn: number
  uOut: number
  /** world-space rectangle of the dock */
  x0: number
  y0: number
  x1: number
  y1: number
  /** dock-entry signal: post position and the far end of its boom (across the lane, just before the dock) */
  signal: V2
  boomTo: V2
  laneIn: Path
  laneOut: Path
  /** corner points of the way back (between the dock's out lane and the gate) */
  outPts: V2[]
}

export function toWorld(g: DockGeo, u: number, v: number): V2 {
  return [g.ex + g.U[0] * u + g.V[0] * v, g.ey + g.U[1] * u + g.V[1] * v]
}

function dock(i: number, ex: number, ey: number, V: V2, U: V2, uIn: number, inPts: V2[], outPts: V2[]): DockGeo {
  const sp = SPECS[i]
  const slots = sp.ramGb / RAM_PER_REQ
  const yardN = slots - sp.cores
  const rows = Math.ceil(yardN / sp.cols)
  const w = sp.cols * PITCH + 2 * MARGIN
  const d = MARGIN + PITCH + GAP + rows * PITCH + MARGIN
  const bays: V2[] = []
  for (let b = 0; b < sp.cores; b++) bays.push([(b - (sp.cores - 1) / 2) * PITCH, MARGIN + PITCH / 2])
  const yard: V2[] = []
  for (let k = 0; k < yardN; k++) {
    const r = Math.floor(k / sp.cols)
    const c = k % sp.cols
    yard.push([(c - (sp.cols - 1) / 2) * PITCH, MARGIN + PITCH + GAP + r * PITCH + PITCH / 2])
  }
  const g: DockGeo = {
    ex,
    ey,
    V,
    U,
    w,
    d,
    bays,
    yard,
    uIn,
    uOut: -uIn,
    x0: 0,
    y0: 0,
    x1: 0,
    y1: 0,
    signal: [0, 0],
    boomTo: [0, 0],
    laneIn: makePath([[GATE_X, LANE]]),
    laneOut: makePath([[GATE_X, -LANE]]),
    outPts,
  }
  const a = toWorld(g, -w / 2, 0)
  const b = toWorld(g, w / 2, d)
  g.x0 = Math.min(a[0], b[0])
  g.x1 = Math.max(a[0], b[0])
  g.y0 = Math.min(a[1], b[1])
  g.y1 = Math.max(a[1], b[1])
  const side = Math.sign(uIn)
  g.signal = toWorld(g, side * 0.78, -0.1)
  g.boomTo = toWorld(g, -side * 0.52, -0.1)
  const inEnd = toWorld(g, uIn, -STOP)
  const outStart = toWorld(g, -uIn, -STOP)
  g.laneIn = makePath([[GATE_X, LANE], ...inPts, inEnd])
  g.laneOut = makePath([outStart, ...outPts, [GATE_X, -LANE]])
  return g
}

export const DOCKS: DockGeo[] = [
  // Mali: north (−y). Left turn into the lane at x = +LANE, back on x = −LANE.
  dock(0, 0, -A_M, [0, -1], [1, 0], LANE, [[LANE, LANE]], [[-LANE, -LANE]]),
  // Srednji: straight ahead (+x).
  dock(1, A_S, 0, [1, 0], [0, 1], LANE, [], []),
  // Veliki: south (+y). Right turn into x = −LANE, back on x = +LANE.
  dock(2, 0, A_V, [0, 1], [1, 0], -LANE, [[-LANE, LANE]], [[LANE, -LANE]]),
]

/** U-turn from a point of a dock's in-lane (distance d along laneIn) over to its out-lane and back to the gate. */
export function turnBack(i: number, d: number): Path {
  const g = DOCKS[i]
  const v = -STOP - (g.laneIn.length - d)
  return makePath([toWorld(g, g.uIn, v), toWorld(g, g.uOut, v), ...g.outPts, [GATE_X, -LANE]])
}

export const MAIN_IN = makePath([
  [SOURCE_X, LANE],
  [GATE_X, LANE],
])
export const MAIN_OUT = makePath([
  [GATE_X, -LANE],
  [SOURCE_X, -LANE],
])
/** U-turn at the gate when no server is healthy */
const GATE_TURN = makePath([
  [GATE_X, LANE],
  [GATE_X, -LANE],
])

/* ------------------------------------------------------------------ state */

type Stage = 'main' | 'lane' | 'wait' | 'dock' | 'back' | 'turn' | 'mainBack'

/** what the gate's log says about one request */
export type Outcome = 'put' | 'obrada' | 'ceka' | 'vrata' | 'ok' | 'err'
export interface LogEntry {
  id: number
  /** −1 = turned back at the gate (no healthy server) */
  srv: number
  /** open connections the gate saw when it decided (least connections only) */
  conns: number[] | null
  outcome: Outcome
}
const LOG_LEN = 6

interface Req {
  id: number
  stage: Stage
  srv: number
  d: number
  status: Status
  algo: Algo
  /** way back after a rejection (U-turn from the queue) */
  back: Path | null
  // dock-local position & target
  u: number
  v: number
  tu: number
  tv: number
  moving: boolean
  leaving: boolean
  place: 'bay' | 'yard' | null
  slot: number
  arrived: number
  left: number
  log: LogEntry | null
}

interface Srv {
  up: boolean
  healthy: boolean
  fails: number
  oks: number
  conns: number
  bays: (Req | null)[]
  yard: (Req | null)[]
  /** containers in the yard, in arrival order */
  queue: Req[]
  /** trucks waiting at the door, in arrival order */
  wait: Req[]
  lastDispatch: number
  lastCheck: number
  lastCheckOk: boolean
  crashedAt: number
  healthAt: number
  lastReject: number
}

export interface TruckView {
  id: number
  x: number
  y: number
  dir: Dir
  status: Status
  /** standing in a dock's queue */
  waiting: boolean
}
export interface CrateView {
  id: number
  srv: number
  /** dock-local position */
  u: number
  v: number
  status: Status
  inBay: boolean
}
export interface ServerView {
  up: boolean
  healthy: boolean
  fails: number
  conns: number
  busy: number
  queued: number
  /** trucks waiting at the door */
  backlog: number
  used: number
  slots: number
  progress: number[]
  sinceDispatch: number
  sinceCheck: number
  lastCheckOk: boolean
  sinceCrash: number
  sinceHealth: number
  sinceReject: number
}
export interface Metrics {
  okRate: number | null
  errRate: number | null
  p95: number | null
}
export interface Snapshot {
  t: number
  algo: Algo
  /** server the gate would pick for the next request */
  next: number
  trucks: TruckView[]
  crates: CrateView[]
  servers: ServerView[]
  log: LogEntry[]
  /** live numbers for the current algorithm and the last numbers of the other one */
  score: Record<Algo, Metrics | null>
}

const WINDOW = 3
const P95_WINDOW = 6

export class LbSim {
  t = 0
  rate = 1.25
  private _algo: Algo = 'rr'
  private reqs: Req[] = []
  private srv: Srv[] = SPECS.map((sp) => ({
    up: true,
    healthy: true,
    fails: 0,
    oks: HC_OKS,
    conns: 0,
    bays: Array.from({ length: sp.cores }, () => null),
    yard: Array.from({ length: sp.ramGb / RAM_PER_REQ - sp.cores }, () => null),
    queue: [],
    wait: [],
    lastDispatch: -9,
    lastCheck: -9,
    lastCheckOk: true,
    crashedAt: -99,
    healthAt: -99,
    lastReject: -99,
  }))
  private nextSpawn = 0.2
  private nextId = 1
  private lastSpawned: Req | null = null
  private stepMove = 0
  private rr = 0
  private nextCheck = HC_INTERVAL
  private events: { t: number; ok: boolean; lat: number; algo: Algo }[] = []
  private since: Record<Algo, number> = { rr: 0, lc: 0 }
  private frozen: Record<Algo, Metrics | null> = { rr: null, lc: null }
  private log: LogEntry[] = []
  private rand: () => number

  constructor(seed = 7) {
    let s = seed
    this.rand = () => {
      s = (s * 16807) % 2147483647
      return (s - 1) / 2147483646
    }
  }

  get algo(): Algo {
    return this._algo
  }
  /** Switching freezes the old algorithm's numbers and starts a clean window for the new one. */
  set algo(a: Algo) {
    if (a === this._algo) return
    this.frozen[this._algo] = this.metricsFor(this._algo)
    this.since[a] = this.t
    this.frozen[a] = null
    this._algo = a
  }

  crash(i: number) {
    const sv = this.srv[i]
    if (!sv.up) return
    sv.up = false
    sv.crashedAt = this.t
    // everything held by the server is lost: those requests go back as errors
    for (const r of [...sv.bays, ...sv.yard]) {
      if (!r) continue
      r.status = 'err'
      sv.conns--
      this.record(false, 0, r.algo)
      this.setOutcome(r, 'err')
      this.startSlideOut(r)
    }
    sv.bays.fill(null)
    sv.yard.fill(null)
    sv.queue = []
    // trucks at the door get no answer either
    for (const r of sv.wait) this.reject(r, sv)
    sv.wait = []
  }

  repair(i: number) {
    const sv = this.srv[i]
    if (sv.up) return
    sv.up = true
    sv.oks = 0
  }

  step(dt: number) {
    this.t += dt
    const t = this.t
    // arrivals: a new truck leaves the plaza once the road in front of it is clear
    if (t - this.nextSpawn > 1) this.nextSpawn = t - 1
    while (this.nextSpawn <= t) {
      const last = this.lastSpawned
      if (last && last.stage === 'main' && last.d < QGAP) break
      const r: Req = {
        id: this.nextId++,
        stage: 'main',
        srv: -1,
        d: 0,
        status: 'req',
        algo: this._algo,
        back: null,
        u: 0,
        v: 0,
        tu: 0,
        tv: 0,
        moving: false,
        leaving: false,
        place: null,
        slot: -1,
        arrived: 0,
        left: 0,
        log: null,
      }
      this.reqs.push(r)
      this.lastSpawned = r
      const gap = (1 / Math.max(0.1, this.rate)) * (0.7 + 0.6 * this.rand())
      this.nextSpawn += gap
    }
    // health checks
    while (this.nextCheck <= t) {
      this.nextCheck += HC_INTERVAL
      for (const sv of this.srv) {
        sv.lastCheck = t
        sv.lastCheckOk = sv.up
        if (sv.up) {
          sv.fails = 0
          sv.oks++
          if (!sv.healthy && sv.oks >= HC_OKS) {
            sv.healthy = true
            sv.healthAt = t
          }
        } else {
          sv.oks = 0
          sv.fails++
          if (sv.healthy && sv.fails >= HC_FAILS) {
            sv.healthy = false
            sv.healthAt = t
          }
        }
      }
    }
    // processing under the cranes
    for (const sv of this.srv) {
      sv.bays.forEach((r, b) => {
        if (!r) return
        r.left -= dt
        if (r.left > 0) return
        sv.bays[b] = null
        sv.conns--
        r.status = 'ok'
        this.record(true, t - r.arrived, r.algo)
        this.setOutcome(r, 'ok')
        this.startSlideOut(r)
        // the first one waiting in the yard moves under the free crane
        const nxt = sv.queue.shift()
        if (nxt) {
          sv.yard[nxt.slot] = null
          this.toBay(nxt, sv, b)
        }
      })
    }
    // movement
    const move = SPEED * dt
    this.stepMove = move
    const done: Req[] = []
    for (const r of this.reqs) {
      switch (r.stage) {
        case 'main':
          r.d += move
          if (r.d >= MAIN_IN.length) this.dispatch(r)
          break
        case 'dock': {
          if (!r.moving) break
          const du = r.tu - r.u
          const dv = r.tv - r.v
          const dist = Math.hypot(du, dv)
          const m = SLIDE * dt
          if (dist <= m) {
            r.u = r.tu
            r.v = r.tv
            r.moving = false
            if (r.leaving) {
              r.stage = 'back'
              r.d = 0
            }
          } else {
            r.u += (du / dist) * m
            r.v += (dv / dist) * m
          }
          break
        }
        case 'back': {
          r.d += move
          const p = r.back ?? DOCKS[r.srv].laneOut
          if (r.d >= p.length) {
            r.stage = 'mainBack'
            r.d = 0
          }
          break
        }
        case 'turn':
          r.d += move * 0.5
          if (r.d >= GATE_TURN.length) {
            r.stage = 'mainBack'
            r.d = 0
          }
          break
        case 'mainBack':
          r.d += move
          if (r.d >= MAIN_OUT.length) done.push(r)
          break
      }
    }
    // the lanes: trucks keep their distance, queue at the door, and hand over their container when there is room
    for (let i = 0; i < 3; i++) this.driveLane(i, move)
    if (done.length) this.reqs = this.reqs.filter((r) => !done.includes(r))
    const cut = t - P95_WINDOW - 1
    while (this.events.length && this.events[0].t < cut) this.events.shift()
  }

  private driveLane(i: number, move: number) {
    const sv = this.srv[i]
    const L = DOCKS[i].laneIn.length
    const lane = this.reqs.filter((r) => r.srv === i && (r.stage === 'lane' || r.stage === 'wait')).sort((a, b) => b.d - a.d)
    let limit = L
    for (const r of lane) {
      if (r.stage === 'wait') {
        const k = sv.wait.indexOf(r)
        r.d = Math.min(L - k * QGAP, r.d + move, limit)
        // the first truck at the door hands its container over as soon as the yard has room
        if (k === 0 && r.d >= L - 1e-6 && this.admit(r, sv)) {
          sv.wait.shift()
          continue
        }
      } else {
        r.d = Math.min(r.d + move, limit)
        const tail = L - sv.wait.length * QGAP
        if (r.d >= tail - 1e-6) this.arrive(r, sv)
      }
      if (r.stage === 'lane' || r.stage === 'wait') limit = r.d - QGAP
    }
  }

  /** Which server the gate would choose right now. */
  private choose(): number {
    if (this._algo === 'rr') {
      for (let k = 0; k < 3; k++) {
        const i = (this.rr + k) % 3
        if (this.srv[i].healthy) return i
      }
      return -1
    }
    let pick = -1
    let best = Infinity
    for (let k = 0; k < 3; k++) {
      const i = (this.rr + k) % 3 // ties are broken in turn
      const sv = this.srv[i]
      if (sv.healthy && sv.conns < best) {
        best = sv.conns
        pick = i
      }
    }
    return pick
  }

  private dispatch(r: Req) {
    r.algo = this._algo
    const pick = this.choose()
    const entry: LogEntry = {
      id: r.id,
      srv: pick,
      conns: this._algo === 'lc' ? this.srv.map((sv) => (sv.healthy ? sv.conns : -1)) : null,
      outcome: pick < 0 ? 'err' : 'put',
    }
    this.log = [entry, ...this.log].slice(0, LOG_LEN)
    r.log = entry
    if (pick < 0) {
      r.status = 'err'
      r.stage = 'turn'
      r.d = 0
      this.record(false, 0, r.algo)
      return
    }
    this.rr = (pick + 1) % 3
    const sv = this.srv[pick]
    sv.conns++
    sv.lastDispatch = this.t
    r.srv = pick
    r.stage = 'lane'
    // carry the overshoot past the gate; driveLane() moves it on in this same step
    r.d = r.d - MAIN_IN.length - this.stepMove
  }

  /** A truck reached the end of its dock's queue. */
  private arrive(r: Req, sv: Srv) {
    if (!sv.up) {
      this.reject(r, sv)
      return
    }
    r.arrived = this.t
    if (sv.wait.length === 0 && this.admit(r, sv)) return
    if (sv.wait.length < BACKLOG) {
      sv.wait.push(r)
      r.stage = 'wait'
      this.setOutcome(r, 'vrata')
      return
    }
    // yard (RAM) and door are both full: rejected on the spot
    this.reject(r, sv)
  }

  /** The truck at the door hands its container to the dock if a RAM slot is free. */
  private admit(r: Req, sv: Srv): boolean {
    const g = DOCKS[r.srv]
    const freeBay = sv.bays.findIndex((b) => b === null)
    const freeYard = sv.yard.findIndex((y) => y === null)
    if (freeBay < 0 && freeYard < 0) return false
    r.stage = 'dock'
    r.u = g.uIn
    r.v = 0.12
    if (freeBay >= 0) {
      this.toBay(r, sv, freeBay)
      return true
    }
    sv.yard[freeYard] = r
    sv.queue.push(r)
    r.place = 'yard'
    r.slot = freeYard
    ;[r.tu, r.tv] = g.yard[freeYard]
    r.moving = true
    this.setOutcome(r, 'ceka')
    return true
  }

  private reject(r: Req, sv: Srv) {
    r.status = 'err'
    r.back = turnBack(r.srv, r.d)
    r.stage = 'back'
    r.d = 0
    sv.conns--
    sv.lastReject = this.t
    this.record(false, 0, r.algo)
    this.setOutcome(r, 'err')
  }

  private toBay(r: Req, sv: Srv, b: number) {
    sv.bays[b] = r
    r.place = 'bay'
    r.slot = b
    r.left = SERVICE
    ;[r.tu, r.tv] = DOCKS[r.srv].bays[b]
    r.moving = true
    this.setOutcome(r, 'obrada')
  }

  private startSlideOut(r: Req) {
    const g = DOCKS[r.srv]
    r.tu = g.uOut
    r.tv = 0.12
    r.place = null
    r.moving = true
    r.leaving = true
  }

  private setOutcome(r: Req, o: Outcome) {
    if (r.log) r.log.outcome = o
  }

  private tally: { ok: number; err: number; lats: number[] } | null = null

  private record(ok: boolean, lat: number, algo: Algo) {
    this.events.push({ t: this.t, ok, lat, algo })
    if (this.tally) {
      if (ok) {
        this.tally.ok++
        this.tally.lats.push(lat)
      } else this.tally.err++
    }
  }

  /** Start counting every finished request (used by the steady-state comparison). */
  startTally() {
    this.tally = { ok: 0, err: 0, lats: [] }
  }
  takeTally() {
    const t = this.tally
    this.tally = null
    return t ?? { ok: 0, err: 0, lats: [] }
  }

  private metricsFor(algo: Algo): Metrics {
    const t = this.t
    const from = this.since[algo]
    const win = Math.min(WINDOW, t - from)
    let ok = 0
    let err = 0
    const lats: number[] = []
    for (const e of this.events) {
      if (e.algo !== algo || e.t < from) continue
      if (e.ok && e.t >= t - P95_WINDOW) lats.push(e.lat)
      if (e.t < t - win) continue
      if (e.ok) ok++
      else err++
    }
    lats.sort((a, b) => a - b)
    const p95 = lats.length >= 3 ? lats[Math.min(lats.length - 1, Math.floor(lats.length * 0.95))] : null
    if (win < 0.75) return { okRate: null, errRate: null, p95 }
    return { okRate: ok / win, errRate: err / win, p95 }
  }

  metrics(): Record<Algo, Metrics | null> {
    const cur = this.metricsFor(this._algo)
    return this._algo === 'rr' ? { rr: cur, lc: this.frozen.lc } : { rr: this.frozen.rr, lc: cur }
  }

  snapshot(score: Record<Algo, Metrics | null>): Snapshot {
    const trucks: TruckView[] = []
    const crates: CrateView[] = []
    for (const r of this.reqs) {
      let p: ReturnType<typeof along> | null = null
      switch (r.stage) {
        case 'main':
          p = along(MAIN_IN, r.d)
          break
        case 'lane':
        case 'wait':
          p = along(DOCKS[r.srv].laneIn, r.d)
          break
        case 'back':
          p = along(r.back ?? DOCKS[r.srv].laneOut, r.d)
          break
        case 'turn':
          p = { ...along(GATE_TURN, r.d), dir: 'x-' }
          break
        case 'mainBack':
          p = along(MAIN_OUT, r.d)
          break
        case 'dock':
          crates.push({ id: r.id, srv: r.srv, u: r.u, v: r.v, status: r.status, inBay: r.place === 'bay' && !r.moving })
      }
      if (p) trucks.push({ id: r.id, x: p.x, y: p.y, dir: p.dir, status: r.status, waiting: r.stage === 'wait' })
    }
    trucks.sort((a, b) => a.x + a.y - (b.x + b.y))
    const servers: ServerView[] = this.srv.map((sv, i) => {
      const busy = sv.bays.filter(Boolean).length
      const queued = sv.queue.length
      return {
        up: sv.up,
        healthy: sv.healthy,
        fails: sv.fails,
        conns: sv.conns,
        busy,
        queued,
        backlog: sv.wait.length,
        used: busy + queued,
        slots: SPECS[i].ramGb / RAM_PER_REQ,
        progress: sv.bays.map((r) => (r ? 1 - Math.max(0, r.left) / SERVICE : -1)),
        sinceDispatch: this.t - sv.lastDispatch,
        sinceCheck: this.t - sv.lastCheck,
        lastCheckOk: sv.lastCheckOk,
        sinceCrash: this.t - sv.crashedAt,
        sinceHealth: this.t - sv.healthAt,
        sinceReject: this.t - sv.lastReject,
      }
    })
    return {
      t: this.t,
      algo: this._algo,
      next: this.choose(),
      trucks,
      crates,
      servers,
      log: this.log.map((e) => ({ ...e, conns: e.conns ? [...e.conns] : null })),
      score,
    }
  }
}

/**
 * Steady-state comparison at a given traffic level: both algorithms run on a fresh, healthy terminal for
 * WARM seconds, then are measured for MEASURE seconds (two seeds each). Deterministic and fast (no rendering),
 * so the comparison is fair no matter what the live simulation went through.
 */
const WARM = 20
const MEASURE = 40
export interface Steady {
  errRate: number
  p95: number
  okRate: number
}
export function steadyScore(rate: number): Record<Algo, Steady> {
  const out = {} as Record<Algo, Steady>
  for (const algo of ['rr', 'lc'] as const) {
    let ok = 0
    let err = 0
    const lats: number[] = []
    const seeds = [7, 23]
    for (const seed of seeds) {
      const sim = new LbSim(seed)
      sim.rate = rate
      sim.algo = algo
      const dt = 1 / 30
      for (let k = 0; k < WARM / dt; k++) sim.step(dt)
      sim.startTally()
      for (let k = 0; k < MEASURE / dt; k++) sim.step(dt)
      const tl = sim.takeTally()
      ok += tl.ok
      err += tl.err
      lats.push(...tl.lats)
    }
    lats.sort((a, b) => a - b)
    const secs = MEASURE * seeds.length
    out[algo] = { okRate: ok / secs, errRate: err / secs, p95: lats.length ? lats[Math.min(lats.length - 1, Math.floor(lats.length * 0.95))] : 0 }
  }
  return out
}
