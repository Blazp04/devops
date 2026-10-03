/**
 * Load-balancer simulation model (pure TS, no React).
 *
 * Simplified but qualitatively honest:
 *  - each request needs 0.4–0.8 s of CPU on ONE core (sim time, slowed down so it can be watched)
 *  - a server works on `cores` requests at once; the rest wait in a queue
 *  - every request held by a server (processing or waiting) occupies 0.5 GB of RAM,
 *    so RAM decides how many requests fit at once: queue = 3 × cores, total = ram / 0.5
 *  - a request that finds the queue full is rejected (503); one sent to a crashed server fails (502)
 *  - the LB counts a connection as active from the moment it dispatches it until it completes or fails
 *  - every network hop takes the same (slowed-down) time, so dots move linearly along each drawn line
 *  - a crash is noticed only after the health check fails for DETECT_S seconds
 */

export type Algo = 'rr' | 'lc'
export type FxKind = 'ok' | 'full' | 'down'

export interface ServerSpec {
  readonly name: string
  readonly cores: number
  readonly ram: number
}

export const SPECS: readonly ServerSpec[] = [
  { name: 'Mali', cores: 1, ram: 2 },
  { name: 'Srednji', cores: 2, ram: 4 },
  { name: 'Veliki', cores: 4, ram: 8 },
]

export const QUEUE_PER_CORE = 3
export const GB_PER_REQ = 0.5
export const DETECT_S = 2
export const CRASHABLE = 2
export const MAX_RATE = 16
export const DEFAULT_RATE = 4
export const SVC_MIN = 0.4
export const SVC_MAX = 0.8
/** Total capacity in requests per second (mean service time 0.6 s). */
export const CAPACITY = SPECS.reduce((a, s) => a + s.cores, 0) / ((SVC_MIN + SVC_MAX) / 2)

const FX_LIFE: Record<FxKind, number> = { ok: 0.6, full: 1.4, down: 1.4 }

interface Req {
  id: number
  /** -1 = travelling to the LB, otherwise index of the target server */
  route: number
  p: number
  arrived: number
  svc: number
  start: number
}

interface Server {
  spec: ServerSpec
  cores: (Req | null)[]
  queue: Req[]
  active: number
  crashed: boolean
  inRotation: boolean
  crashAt: number
  rejoinAt: number
}

interface Fx {
  id: number
  kind: FxKind
  srv: number
  slot: number
  born: number
}

export interface CoreView {
  id: number
  prog: number
}

export interface ServerView {
  busy: (CoreView | null)[]
  queue: number[]
  crashed: boolean
  inRotation: boolean
  /** 0..1 progress of the health check (detecting a crash, or confirming a repaired server); -1 when idle */
  health: number
  healthMode: 'detect' | 'rejoin' | null
  share: number
  active: number
}

export interface FxView {
  id: number
  kind: FxKind
  srv: number
  slot: number
  age: number
}

export interface Metrics {
  thr: number
  p95: number | null
  errPct: number
}

export interface SimView {
  t: number
  dots: { id: number; route: number; p: number }[]
  servers: ServerView[]
  fx: FxView[]
  target: number
  metrics: Metrics
  history: { thr: number[]; p95: number[]; err: number[] }
}

/** Network hops take a fixed (slowed-down) time, independent of how long the drawn line is. */
export const SRC_HOP = 0.45
export const SRV_HOP = 0.55

/** Small deterministic PRNG so every visit starts from the same picture. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const HIST = 36

export class LbSim {
  private t = 0
  private nextId = 1
  private rate = DEFAULT_RATE
  private algo: Algo = 'rr'
  private nextArrival = 0
  private flying: Req[] = []
  private srv: Server[]
  private fx: Fx[] = []
  private rr = 0
  private target = -1
  private done: { t: number; lat: number }[] = []
  private fails: number[] = []
  private dispatched: { t: number; s: number }[] = []
  private metrics: Metrics = { thr: 0, p95: null, errPct: 0 }
  private lastMetrics = -1
  private lastHist = 0
  private hist: { thr: number[]; p95: number[]; err: number[] } = { thr: [], p95: [], err: [] }
  private rand: () => number

  constructor(seed = 7) {
    this.rand = mulberry32(seed)
    this.srv = SPECS.map((spec) => ({
      spec,
      cores: Array.from({ length: spec.cores }, () => null),
      queue: [],
      active: 0,
      crashed: false,
      inRotation: true,
      crashAt: 0,
      rejoinAt: 0,
    }))
    this.nextArrival = this.expo()
  }

  private expo() {
    return this.rate > 0 ? -Math.log(1 - this.rand()) / this.rate : Infinity
  }

  getAlgo() {
    return this.algo
  }

  getRate() {
    return this.rate
  }

  setRate(r: number) {
    this.rate = Math.max(0, Math.min(MAX_RATE, r))
    this.nextArrival = this.t + this.expo()
  }

  setAlgo(a: Algo) {
    this.algo = a
  }

  crash(i = CRASHABLE) {
    const s = this.srv[i]
    if (s.crashed) return
    s.crashed = true
    s.crashAt = this.t
    // Everything the server was holding is lost.
    s.cores.forEach((r, c) => {
      if (r) this.fail(i, c, 'down')
    })
    s.queue.forEach(() => this.fail(i, -1, 'down'))
    s.cores = s.cores.map(() => null)
    s.queue = []
  }

  repair(i = CRASHABLE) {
    const s = this.srv[i]
    if (!s.crashed) return
    s.crashed = false
    // If the LB already took it out, it comes back only after a passing health check.
    if (!s.inRotation) s.rejoinAt = this.t + DETECT_S
  }

  private fail(i: number, slot: number, kind: FxKind) {
    const s = this.srv[i]
    s.active = Math.max(0, s.active - 1)
    this.fails.push(this.t)
    this.fx.push({ id: this.nextId++, kind, srv: i, slot, born: this.t })
  }

  private pick(): number {
    const n = this.srv.length
    let best = Infinity
    if (this.algo === 'lc') {
      for (const s of this.srv) if (s.inRotation) best = Math.min(best, s.active)
    }
    // Round robin pointer is also the tie-breaker for least connections.
    for (let k = 0; k < n; k++) {
      const i = (this.rr + k) % n
      const s = this.srv[i]
      if (!s.inRotation) continue
      if (this.algo === 'lc' && s.active !== best) continue
      this.rr = (i + 1) % n
      return i
    }
    return -1
  }

  private arrive(r: Req, i: number) {
    const s = this.srv[i]
    if (s.crashed) {
      this.fail(i, -1, 'down')
      return
    }
    r.arrived = this.t
    const free = s.cores.indexOf(null)
    if (free >= 0) {
      r.start = this.t
      s.cores[free] = r
    } else if (s.queue.length < s.spec.cores * QUEUE_PER_CORE) {
      s.queue.push(r)
    } else {
      this.fail(i, s.queue.length, 'full')
    }
  }

  step(dt: number) {
    this.t += dt
    const t = this.t

    while (this.nextArrival <= t) {
      this.flying.push({ id: this.nextId++, route: -1, p: 0, arrived: 0, svc: 0, start: 0 })
      this.nextArrival += this.expo()
    }

    const still: Req[] = []
    for (const r of this.flying) {
      r.p += dt / (r.route < 0 ? SRC_HOP : SRV_HOP)
      if (r.p < 1) {
        still.push(r)
        continue
      }
      if (r.route < 0) {
        const i = this.pick()
        if (i < 0) continue
        r.route = i
        r.p = 0
        r.svc = SVC_MIN + this.rand() * (SVC_MAX - SVC_MIN)
        this.srv[i].active++
        this.target = i
        this.dispatched.push({ t, s: i })
        still.push(r)
      } else {
        this.arrive(r, r.route)
      }
    }
    this.flying = still

    this.srv.forEach((s, i) => {
      s.cores.forEach((r, c) => {
        if (!r || t - r.start < r.svc) return
        this.done.push({ t, lat: t - r.arrived })
        this.fx.push({ id: this.nextId++, kind: 'ok', srv: i, slot: c, born: t })
        s.active = Math.max(0, s.active - 1)
        const next = s.queue.shift() ?? null
        if (next) next.start = t
        s.cores[c] = next
      })
      if (s.crashed && s.inRotation && t - s.crashAt >= DETECT_S) s.inRotation = false
      if (!s.crashed && !s.inRotation && t >= s.rejoinAt) s.inRotation = true
    })

    this.fx = this.fx.filter((f) => t - f.born < FX_LIFE[f.kind]).slice(-80)

    if (t - this.lastMetrics >= 0.25) this.updateMetrics()
    if (t - this.lastHist >= 1) {
      this.lastHist = t
      this.pushHist()
    }
  }

  private updateMetrics() {
    const t = this.t
    this.lastMetrics = t
    this.done = this.done.filter((d) => t - d.t < 6)
    this.fails = this.fails.filter((f) => t - f < 6)
    this.dispatched = this.dispatched.filter((d) => t - d.t < 5)
    const thrWin = Math.min(5, Math.max(t, 0.5))
    const recent = this.done.filter((d) => t - d.t < thrWin)
    const lats = this.done
      .filter((d) => t - d.t < 4)
      .map((d) => d.lat)
      .sort((a, b) => a - b)
    const errs = this.fails.filter((f) => t - f < 3).length
    const oks = this.done.filter((d) => t - d.t < 3).length
    this.metrics = {
      thr: recent.length / thrWin,
      p95: lats.length ? lats[Math.max(0, Math.ceil(lats.length * 0.95) - 1)] : null,
      errPct: errs + oks ? (100 * errs) / (errs + oks) : 0,
    }
  }

  private pushHist() {
    const h = this.hist
    h.thr = [...h.thr, this.metrics.thr].slice(-HIST)
    h.p95 = [...h.p95, this.metrics.p95 ?? 0].slice(-HIST)
    h.err = [...h.err, this.metrics.errPct].slice(-HIST)
  }

  view(): SimView {
    const t = this.t
    const total = this.dispatched.length
    return {
      t,
      dots: this.flying.map((r) => ({ id: r.id, route: r.route, p: r.p })),
      servers: this.srv.map((s, i) => {
        let health = -1
        let healthMode: ServerView['healthMode'] = null
        if (s.crashed && s.inRotation) {
          health = Math.min(1, (t - s.crashAt) / DETECT_S)
          healthMode = 'detect'
        } else if (!s.crashed && !s.inRotation) {
          health = Math.min(1, 1 - (s.rejoinAt - t) / DETECT_S)
          healthMode = 'rejoin'
        }
        return {
          busy: s.cores.map((r) => (r ? { id: r.id, prog: Math.min(1, (t - r.start) / r.svc) } : null)),
          queue: s.queue.map((r) => r.id),
          crashed: s.crashed,
          inRotation: s.inRotation,
          health,
          healthMode,
          share: total ? this.dispatched.filter((d) => d.s === i).length / total : 0,
          active: s.active,
        }
      }),
      fx: this.fx.map((f) => ({ id: f.id, kind: f.kind, srv: f.srv, slot: f.slot, age: (t - f.born) / FX_LIFE[f.kind] })),
      target: this.target,
      metrics: this.metrics,
      history: this.hist,
    }
  }
}
