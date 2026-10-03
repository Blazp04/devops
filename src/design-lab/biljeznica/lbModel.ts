/**
 * "Redar na ulazu" — a deliberately small but honest load-balancer model.
 *
 *  - Every request needs CPU_MS of CPU time (±40 %) and then waits IO_MS for the database.
 *  - RAM bounds how many requests are in progress at once ("tanjuri"): slots = (RAM − 0,5 GB) / 0,5 GB.
 *  - CPU cores are shared by the requests that are currently computing (processor sharing, max 1 core each).
 *  - Each server has a small FIFO queue (QUEUE_MAX). A request that finds it full is rejected (503).
 *  - A crashed server refuses every request that reaches it (502) until the load balancer's
 *    health check notices: probes every HC_INTERVAL_MS (0,5 s), HC_FAILS (4) failures in a row → out of rotation,
 *    i.e. 1,5–2 s after the crash.
 *  - Least connections counts what the load balancer can see: requests on their way to the server,
 *    waiting in its queue and in progress.
 *
 * Time is in milliseconds. Pure TypeScript, no React.
 */

export type Algo = 'rr' | 'lc'
export type ServerKey = 'mali' | 'srednji' | 'veliki'
/** pun = queue full (503), srusen = server is down (502), nema = no healthy server (503 at the LB) */
export type ErrKind = 'pun' | 'srusen' | 'nema'

export interface ServerSpec {
  key: ServerKey
  name: string
  vcpu: number
  ramGB: number
  slots: number
}

export const SLOT_GB = 0.5
export const BASE_GB = 0.5

export const SERVER_SPECS: readonly ServerSpec[] = [
  { key: 'mali', name: 'Mali', vcpu: 1, ramGB: 2, slots: (2 - BASE_GB) / SLOT_GB },
  { key: 'srednji', name: 'Srednji', vcpu: 2, ramGB: 4, slots: (4 - BASE_GB) / SLOT_GB },
  { key: 'veliki', name: 'Veliki', vcpu: 4, ramGB: 8, slots: (8 - BASE_GB) / SLOT_GB },
]

export const CPU_MS = 200
export const IO_MS = 300
export const QUEUE_MAX = 6
export const HC_INTERVAL_MS = 500
export const HC_FAILS = 4
export const RATE_WINDOW_MS = 3000
export const P95_WINDOW_MS = 5000
export const MARK_MS = 900
export const TICK_MS = 650
export const STEP_MS = 10

/** Rough capacity (requests/s) of a server: min(CPU bound, RAM bound). */
export function capacityOf(s: ServerSpec): number {
  return Math.min((s.vcpu * 1000) / CPU_MS, (s.slots * 1000) / (CPU_MS + IO_MS))
}

interface Job {
  id: number
  /** arrival at the server (ms) — latency is measured from here */
  t0: number
  cpuLeft: number
  ioLeft: number
}

interface Flight {
  id: number
  leg: 'in' | 'out'
  srv: number
  t0: number
  dur: number
}

export interface Mark {
  id: number
  t: number
  /** −1 = at the load balancer */
  srv: number
  kind: ErrKind
  /** plate index when an in-progress request died with its server, −1 = at the door */
  slot: number
}

export interface Tick {
  id: number
  t: number
  srv: number
  slot: number
}

class Srv {
  spec: ServerSpec
  up = true
  /** the load balancer's view */
  healthy = true
  fails = 0
  /** requests the LB has sent that are still on their way */
  connecting = 0
  jobs: (Job | null)[]
  queue: Job[] = []
  busyAvg = 0
  downAt = -1
  detectedAt = -1
  lastProbeOk = true

  constructor(spec: ServerSpec) {
    this.spec = spec
    this.jobs = Array.from({ length: spec.slots }, () => null)
  }

  get inProgress(): number {
    let n = 0
    for (const j of this.jobs) if (j) n++
    return n
  }

  freeSlot(): number {
    return this.jobs.indexOf(null)
  }
}

export interface ServerSnap {
  busy: number
  plates: boolean[]
  queue: number
  up: boolean
  healthy: boolean
  fails: number
  downAt: number
  detectedAt: number
  active: number
  lastProbeOk: boolean
}

export interface FlightSnap {
  id: number
  leg: 'in' | 'out'
  srv: number
  p: number
}

export interface SimSnap {
  t: number
  flights: FlightSnap[]
  marks: (Mark & { age: number })[]
  ticks: (Tick & { age: number })[]
  servers: ServerSnap[]
  lastTarget: number
  probeAge: number
  okRate: number
  errRate: number
  p95: number | null
  /** errors per server in the rate window (index 3 = at the LB) */
  errBy: [number, number, number, number]
}

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

export class LbEngine {
  t = 0
  lambda: number
  algo: Algo
  servers: Srv[]
  private flights: Flight[] = []
  private marks: Mark[] = []
  private ticks: Tick[] = []
  private done: { t: number; lat: number }[] = []
  private errs: { t: number; srv: number }[] = []
  private rr = 0
  private nextId = 1
  private nextArrival = 0
  private nextProbe = HC_INTERVAL_MS
  private lastProbe = 0
  private lastTarget = -1
  private durIn = 420
  private durOut = [520, 520, 520]
  private rand: () => number
  private acc = 0

  constructor(lambda = 12, algo: Algo = 'rr', seed = 20261001) {
    this.lambda = lambda
    this.algo = algo
    this.rand = mulberry32(seed)
    this.servers = SERVER_SPECS.map((s) => new Srv(s))
    this.nextArrival = this.expo()
  }

  private expo(): number {
    const mean = 1000 / Math.max(0.1, this.lambda)
    return -Math.log(1 - this.rand()) * mean
  }

  setLambda(l: number) {
    if (l === this.lambda) return
    this.lambda = l
    this.nextArrival = this.t + this.expo()
  }

  setAlgo(a: Algo) {
    this.algo = a
  }

  /** Flight durations follow the drawing: distance / constant speed. */
  setDurations(durIn: number, durOut: number[]) {
    this.durIn = durIn
    this.durOut = durOut.slice(0, 3)
  }

  crash(i = 2) {
    const s = this.servers[i]
    if (!s.up) return
    s.up = false
    s.downAt = this.t
    s.detectedAt = -1
    s.jobs.forEach((j, slot) => {
      if (j) this.fail(i, 'srusen', slot)
    })
    s.queue.forEach(() => this.fail(i, 'srusen', -1))
    s.jobs = s.jobs.map(() => null)
    s.queue = []
    s.busyAvg = 0
  }

  repair(i = 2) {
    const s = this.servers[i]
    if (s.up) return
    s.up = true
    s.downAt = -1
    // the load balancer re-adds it only after the next successful health check
  }

  /** Advance by real milliseconds (fixed internal step). */
  advance(ms: number) {
    this.acc += Math.min(ms, 120)
    while (this.acc >= STEP_MS) {
      this.step(STEP_MS)
      this.acc -= STEP_MS
    }
  }

  private fail(srv: number, kind: ErrKind, slot: number) {
    this.marks.push({ id: this.nextId++, t: this.t, srv, kind, slot })
    this.errs.push({ t: this.t, srv })
  }

  private pick(): number {
    const cands: number[] = []
    this.servers.forEach((s, i) => s.healthy && cands.push(i))
    if (!cands.length) return -1
    if (this.algo === 'rr') {
      const i = cands[this.rr % cands.length]
      this.rr = (this.rr + 1) % 1_000_000
      return i
    }
    // least connections: fewest active; ties broken by a rotating pointer
    let best = Infinity
    for (const i of cands) {
      const s = this.servers[i]
      best = Math.min(best, s.connecting + s.inProgress + s.queue.length)
    }
    const tied = cands.filter((i) => {
      const s = this.servers[i]
      return s.connecting + s.inProgress + s.queue.length === best
    })
    const i = tied[this.rr % tied.length]
    this.rr = (this.rr + 1) % 1_000_000
    return i
  }

  private arrive(i: number) {
    const s = this.servers[i]
    s.connecting = Math.max(0, s.connecting - 1)
    if (!s.up) {
      this.fail(i, 'srusen', -1)
      return
    }
    const job: Job = { id: this.nextId++, t0: this.t, cpuLeft: CPU_MS * (0.6 + 0.8 * this.rand()), ioLeft: IO_MS }
    const slot = s.freeSlot()
    if (slot >= 0) s.jobs[slot] = job
    else if (s.queue.length < QUEUE_MAX) s.queue.push(job)
    else this.fail(i, 'pun', -1)
  }

  private step(dt: number) {
    this.t += dt
    const t = this.t

    // 1. students send requests (Poisson arrivals)
    while (this.nextArrival <= t) {
      this.flights.push({ id: this.nextId++, leg: 'in', srv: -1, t0: this.nextArrival, dur: this.durIn })
      this.nextArrival += this.expo()
    }

    // 2. requests in flight
    const still: Flight[] = []
    for (const f of this.flights) {
      if (t < f.t0 + f.dur) {
        still.push(f)
        continue
      }
      if (f.leg === 'in') {
        const i = this.pick()
        if (i < 0) {
          this.fail(-1, 'nema', -1)
          continue
        }
        this.lastTarget = i
        this.servers[i].connecting++
        still.push({ id: f.id, leg: 'out', srv: i, t0: f.t0 + f.dur, dur: this.durOut[i] })
      } else {
        this.arrive(f.srv)
      }
    }
    this.flights = still

    // 3. servers work
    const k = 1 - Math.exp(-dt / 350)
    this.servers.forEach((s, i) => {
      if (!s.up) return
      let computing = 0
      for (const j of s.jobs) if (j && j.cpuLeft > 0) computing++
      const share = computing ? Math.min(1, s.spec.vcpu / computing) : 0
      s.jobs.forEach((j, slot) => {
        if (!j) return
        if (j.cpuLeft > 0) {
          j.cpuLeft -= dt * share
          return
        }
        j.ioLeft -= dt
        if (j.ioLeft <= 0) {
          this.done.push({ t, lat: t - j.t0 })
          this.ticks.push({ id: j.id, t, srv: i, slot })
          s.jobs[slot] = s.queue.shift() ?? null
        }
      })
      s.busyAvg += (Math.min(s.spec.vcpu, computing) - s.busyAvg) * k
    })

    // 4. health checks
    if (t >= this.nextProbe) {
      this.nextProbe += HC_INTERVAL_MS
      this.lastProbe = t
      for (const s of this.servers) {
        s.lastProbeOk = s.up
        if (s.up) {
          s.fails = 0
          if (!s.healthy) {
            s.healthy = true
            s.detectedAt = -1
          }
        } else {
          s.fails++
          if (s.fails >= HC_FAILS && s.healthy) {
            s.healthy = false
            s.detectedAt = t
          }
        }
      }
    }

    // 5. forget old things
    if (this.marks.length && t - this.marks[0].t > MARK_MS) this.marks = this.marks.filter((m) => t - m.t <= MARK_MS)
    if (this.ticks.length && t - this.ticks[0].t > TICK_MS) this.ticks = this.ticks.filter((m) => t - m.t <= TICK_MS)
    if (this.done.length && t - this.done[0].t > P95_WINDOW_MS) this.done = this.done.filter((d) => t - d.t <= P95_WINDOW_MS)
    if (this.errs.length && t - this.errs[0].t > RATE_WINDOW_MS) this.errs = this.errs.filter((d) => t - d.t <= RATE_WINDOW_MS)
  }

  snapshot(): SimSnap {
    const t = this.t
    const win = Math.min(RATE_WINDOW_MS, Math.max(t, 1))
    let okN = 0
    const lats: number[] = []
    for (const d of this.done) {
      if (t - d.t <= RATE_WINDOW_MS) okN++
      lats.push(d.lat)
    }
    lats.sort((a, b) => a - b)
    const errBy: [number, number, number, number] = [0, 0, 0, 0]
    for (const e of this.errs) errBy[e.srv < 0 ? 3 : e.srv]++
    return {
      t,
      flights: this.flights.map((f) => ({ id: f.id, leg: f.leg, srv: f.srv, p: Math.max(0, Math.min(1, (t - f.t0) / f.dur)) })),
      marks: this.marks.map((m) => ({ ...m, age: t - m.t })),
      ticks: this.ticks.map((m) => ({ ...m, age: t - m.t })),
      servers: this.servers.map((s) => ({
        busy: s.busyAvg,
        plates: s.jobs.map((j) => j !== null),
        queue: s.queue.length,
        up: s.up,
        healthy: s.healthy,
        fails: s.fails,
        downAt: s.downAt,
        detectedAt: s.detectedAt,
        active: s.connecting + s.inProgress + s.queue.length,
        lastProbeOk: s.lastProbeOk,
      })),
      lastTarget: this.lastTarget,
      probeAge: t - this.lastProbe,
      okRate: (okN * 1000) / win,
      errRate: (this.errs.length * 1000) / win,
      p95: lats.length >= 3 ? lats[Math.min(lats.length - 1, Math.floor(lats.length * 0.95))] : null,
      errBy,
    }
  }
}

/** Croatian number formatting: decimal comma. */
export function hr(n: number, digits = 1): string {
  return n.toFixed(digits).replace('.', ',')
}
