/**
 * Load-balancer model for the Nacrt prototype (pure TypeScript, time in ms, fixed 10 ms steps).
 *
 * Server (PHP-FPM / gunicorn style worker pool):
 *   - RAM sizes the pool: W = (RAM − 512 MB) / 256 MB  → Mali 6, Srednji 14, Veliki 30 requests at once;
 *   - every core works on one request at a time (the "orifice" of the key-idea section): a request needs
 *     140–260 ms of CPU (200 ms on average), waits its turn for a free core in arrival order, then waits
 *     IO_MS for the database; it holds its 256 MB the whole time;
 *   - beyond W requests wait in a FIFO queue of QUEUE_MAX; when that is full the server answers 503.
 * Capacity ≈ vCPU · 1000 / 200 → 5, 10 and 20 requests/s (35 in total).
 *
 * Load balancer: round robin over healthy servers, or least active connections. "Active" is what a real
 * balancer can count: connections it has opened and not yet seen answered (on the way + queued + in work).
 * Every outlet of the balancer is drawn the same length, so the trip to the server (≈ 0,2 s) costs every
 * server the same and does not favour any of them.
 * Health check every HC_EVERY ms; 2 failures → out of rotation, 2 passes → back in.
 * A crashed server refuses connections (502) until the health check notices — under least connections it
 * looks idle (0 connections), so it attracts even more traffic until then.
 *
 * p95 is the time a request spends at the server (queue + work) over the last 5 s, counted only for requests
 * the balancer forwarded under the current algorithm, so a reading never mixes two algorithms.
 */
import { makeRng, pointAt, type Pt, type Route } from './geom'

export const SPECS = [
  { name: 'Mali', vcpu: 1, ramGB: 2 },
  { name: 'Srednji', vcpu: 2, ramGB: 4 },
  { name: 'Veliki', vcpu: 4, ramGB: 8 },
] as const

export const CPU_MS = 200
/** CPU need is uniform in CPU_MS · [1 − CPU_SPREAD, 1 + CPU_SPREAD] */
const CPU_SPREAD = 0.3
export const IO_MS = 100
export const MEM_MB = 256
export const BASE_MB = 512
export const QUEUE_MAX = 8
export const HC_EVERY = 1000
export const HC_FAILS = 2
export const HC_OKS = 2
export const BOOT_MS = 1200
export const STEP_MS = 10
/** dot speed in drawing units per ms (one speed for every dot on the drawing) */
export const SPEED = 0.5
/** p95 target drawn on the dial */
export const SLA_MS = 1500
const MARK_MS = 900
const WINDOW_MS = 2000
export const P95_WINDOW_MS = 5000
export const TALLY_MS = 5000
export const SAMPLE_MS = 500
const SHARE_MS = 5000
/** 30 s of strip chart */
export const SERIES_LEN = 60
export const WARMUP_MS = 31000

export type Algo = 'rr' | 'lc'
export type Proc = 'up' | 'down' | 'boot'

interface Job {
  tArr: number
  cpu: number
  io: number
  epoch: number
}

export interface Server {
  name: string
  vcpu: number
  ramGB: number
  W: number
  proc: Proc
  bootUntil: number
  downSince: number
  healthy: boolean
  fails: number
  oks: number
  nextProbe: number
  probe: { t: number; ok: boolean } | null
  /** requests holding a worker (and 256 MB), in arrival order */
  work: Job[]
  queue: Job[]
  transit: number
  busy: number
  done: number
  /** when this server turned a request away because its queue was full (503), last TALLY_MS */
  rej: number[]
}

interface Flight {
  id: number
  leg: 'in' | 'out' | 'back'
  srv: number
  t0: number
  dur: number
  epoch: number
}

interface Mark {
  id: number
  t: number
  srv: number
  where: 'lb' | 'inlet' | 'queue' | 'box'
}

export interface Rev {
  id: number
  letter: string
  t: number
  text: string
  tone: 'line' | 'red' | 'pencil'
}

export interface Sample {
  thr: number
  err: number
  lam: number
}

export interface Sim {
  t: number
  rand: () => number
  nextArr: number
  lastLam: number
  nextId: number
  servers: Server[]
  flights: Flight[]
  marks: Mark[]
  rr: number
  lbTarget: number
  /** when the balancer last forwarded a request (drives the switch's pointer) */
  lbAt: number
  okT: number[]
  errT: number[]
  lat: { t: number; ms: number }[]
  okClient: number
  errClient: number
  series: Sample[]
  nextSample: number
  revs: Rev[]
  revN: number
  algo: Algo
  /** bumps whenever the algorithm changes */
  epoch: number
  /** when the LB forwarded a request to each server (last SHARE_MS) */
  routed: number[][]
}

export interface Params {
  lambda: number
  algo: Algo
}

/** Drawing geometry the model needs: pipe routes and where marks go. */
export interface Geo {
  inRoute: Route
  out: Route[]
  back: Route[]
  queueAt: (srv: number, k: number) => Pt
  lb: Pt
  boxCenter: Pt[]
  angles: number[]
}

export function workers(ramGB: number): number {
  return Math.max(1, Math.floor((ramGB * 1024 - BASE_MB) / MEM_MB))
}

export function createSim(algo: Algo, seed = 7): Sim {
  const servers: Server[] = SPECS.map((p, i) => ({
    name: p.name,
    vcpu: p.vcpu,
    ramGB: p.ramGB,
    W: workers(p.ramGB),
    proc: 'up',
    bootUntil: 0,
    downSince: 0,
    healthy: true,
    fails: 0,
    oks: 0,
    nextProbe: 400 + i * 333,
    probe: null,
    work: [],
    queue: [],
    transit: 0,
    busy: 0,
    done: 0,
    rej: [],
  }))
  return {
    t: 0,
    rand: makeRng(seed),
    nextArr: 0,
    lastLam: 0,
    nextId: 1,
    servers,
    flights: [],
    marks: [],
    rr: 0,
    lbTarget: 1,
    lbAt: -1e9,
    okT: [],
    errT: [],
    lat: [],
    okClient: 0,
    errClient: 0,
    series: [],
    nextSample: SAMPLE_MS,
    revs: [{ id: 0, letter: 'A', t: 0, text: 'Početno stanje: tri poslužitelja, svi zdravi.', tone: 'line' }],
    revN: 1,
    algo,
    epoch: 0,
    routed: servers.map(() => []),
  }
}

/** A sim that has already run for `ms` (so the strip chart and the pipes are never empty). */
export function warmSim(algo: Algo, lambda: number, geo: Geo, ms = WARMUP_MS, seed = 7): Sim {
  const sim = createSim(algo, seed)
  const p = { lambda, algo }
  for (let t = 0; t < ms; t += STEP_MS) step(sim, p, geo)
  sim.okClient = 0
  sim.errClient = 0
  for (const s of sim.servers) s.done = 0
  return sim
}

function addRev(sim: Sim, text: string, tone: Rev['tone']) {
  const letter = String.fromCharCode(65 + (sim.revN % 26))
  sim.revs.unshift({ id: sim.revN, letter, t: sim.t, text, tone })
  sim.revN++
  if (sim.revs.length > 4) sim.revs.length = 4
}

function fail(sim: Sim, srv: number, where: Mark['where']) {
  sim.errT.push(sim.t)
  sim.errClient++
  if (where === 'queue') sim.servers[srv].rej.push(sim.t)
  sim.marks.push({ id: sim.nextId++, t: sim.t, srv, where })
}

/** Connections the balancer has open to a server: forwarded and not yet answered. */
export function active(s: Server): number {
  return s.transit + s.work.length + s.queue.length
}

function choose(sim: Sim): number {
  const n = sim.servers.length
  if (sim.algo === 'rr') {
    for (let k = 0; k < n; k++) {
      const i = (sim.rr + k) % n
      if (sim.servers[i].healthy) {
        sim.rr = i + 1
        return i
      }
    }
    return -1
  }
  // least connections; ties are broken in rotation so equal servers share work
  let best = -1
  for (let k = 0; k < n; k++) {
    const i = (sim.rr + k) % n
    const s = sim.servers[i]
    if (!s.healthy) continue
    if (best < 0 || active(s) < active(sim.servers[best])) best = i
  }
  if (best >= 0) sim.rr = best + 1
  return best
}

function expo(rand: () => number): number {
  return -Math.log(1 - rand())
}

export function step(sim: Sim, p: Params, geo: Geo) {
  sim.t += STEP_MS
  const t = sim.t
  if (sim.algo !== p.algo) {
    sim.algo = p.algo
    sim.epoch++
    sim.lat = [] // p95 restarts: a reading never mixes two algorithms
    addRev(
      sim,
      p.algo === 'rr' ? 'Algoritam: kružno. Mjerenje p95 kreće ispočetka.' : 'Algoritam: najmanje aktivnih veza. Mjerenje p95 kreće ispočetka.',
      'pencil',
    )
  }

  // 1. arrivals (Poisson); a new rate takes effect immediately
  const lam = Math.max(0.5, p.lambda)
  if (sim.nextArr === 0 || lam !== sim.lastLam) {
    sim.nextArr = t + (expo(sim.rand) / lam) * 1000
    sim.lastLam = lam
  }
  while (sim.nextArr <= t) {
    sim.flights.push({ id: sim.nextId++, leg: 'in', srv: -1, t0: sim.nextArr, dur: geo.inRoute.len / SPEED, epoch: sim.epoch })
    sim.nextArr += (expo(sim.rand) / lam) * 1000
  }

  // 2. flights that arrived this step
  const still: Flight[] = []
  for (const f of sim.flights) {
    if (t < f.t0 + f.dur) {
      still.push(f)
      continue
    }
    if (f.leg === 'in') {
      const i = choose(sim)
      if (i < 0) {
        fail(sim, -1, 'lb') // no healthy server: the LB itself answers 503
        continue
      }
      sim.lbTarget = i
      sim.lbAt = t
      sim.routed[i].push(t)
      sim.servers[i].transit++
      still.push({ id: f.id, leg: 'out', srv: i, t0: f.t0 + f.dur, dur: geo.out[i].len / SPEED, epoch: sim.epoch })
    } else if (f.leg === 'out') {
      const s = sim.servers[f.srv]
      s.transit--
      if (s.proc !== 'up') fail(sim, f.srv, 'inlet') // connection refused → 502
      else {
        const job = { tArr: t, cpu: CPU_MS * (1 - CPU_SPREAD + 2 * CPU_SPREAD * sim.rand()), io: IO_MS, epoch: f.epoch }
        if (s.work.length < s.W) s.work.push(job)
        else if (s.queue.length < QUEUE_MAX) s.queue.push(job)
        else fail(sim, f.srv, 'queue') // queue full → 503
      }
    } else {
      sim.okClient++
    }
  }
  sim.flights = still

  // 3. servers
  for (let i = 0; i < sim.servers.length; i++) {
    const s = sim.servers[i]
    if (s.proc === 'boot' && t >= s.bootUntil) s.proc = 'up'
    let onCpu = 0
    if (s.proc === 'up') {
      const keep: Job[] = []
      for (const j of s.work) {
        if (j.cpu > 0) {
          // one request per core, in arrival order; the rest wait for a core (still holding RAM)
          if (onCpu < s.vcpu) {
            j.cpu -= STEP_MS
            onCpu++
          }
        } else j.io -= STEP_MS
        if (j.cpu <= 0 && j.io <= 0) {
          sim.okT.push(t)
          if (j.epoch === sim.epoch) sim.lat.push({ t, ms: t - j.tArr })
          s.done++
          sim.flights.push({ id: sim.nextId++, leg: 'back', srv: i, t0: t, dur: geo.back[i].len / SPEED, epoch: j.epoch })
        } else keep.push(j)
      }
      s.work = keep
      while (s.work.length < s.W && s.queue.length) s.work.push(s.queue.shift() as Job)
    }
    s.busy += (onCpu - s.busy) * (STEP_MS / 300)

    // 4. active health check
    if (t >= s.nextProbe) {
      s.nextProbe += HC_EVERY
      const ok = s.proc === 'up'
      s.probe = { t, ok }
      if (ok) {
        s.oks++
        s.fails = 0
        if (!s.healthy && s.oks >= HC_OKS) {
          s.healthy = true
          addRev(sim, `${s.name}: ${HC_OKS} uspješne provjere → vraćen u rotaciju.`, 'pencil')
        }
      } else {
        s.fails++
        s.oks = 0
        if (s.healthy && s.fails >= HC_FAILS) {
          s.healthy = false
          addRev(
            sim,
            `${s.name}: ${HC_FAILS} neuspjele provjere → isključen iz rotacije (${fmt((t - s.downSince) / 1000)} s nakon pada).`,
            'red',
          )
        }
      }
    }
    while (s.rej.length && s.rej[0] < t - TALLY_MS) s.rej.shift()
  }

  // 5. bookkeeping
  while (sim.okT.length && sim.okT[0] < t - WINDOW_MS) sim.okT.shift()
  while (sim.errT.length && sim.errT[0] < t - TALLY_MS) sim.errT.shift()
  while (sim.lat.length && sim.lat[0].t < t - P95_WINDOW_MS) sim.lat.shift()
  while (sim.marks.length && sim.marks[0].t < t - MARK_MS) sim.marks.shift()
  for (const r of sim.routed) while (r.length && r[0] < t - SHARE_MS) r.shift()
  if (t >= sim.nextSample) {
    sim.nextSample += SAMPLE_MS
    sim.series.push({ thr: (sim.okT.length * 1000) / WINDOW_MS, err: errRate(sim), lam: p.lambda })
    if (sim.series.length > SERIES_LEN + 2) sim.series.shift()
  }
}

function errRate(sim: Sim): number {
  let n = 0
  for (let k = sim.errT.length - 1; k >= 0 && sim.errT[k] >= sim.t - WINDOW_MS; k--) n++
  return (n * 1000) / WINDOW_MS
}

function fmt(n: number): string {
  return n.toLocaleString('hr-HR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

export function crash(sim: Sim, i: number) {
  const s = sim.servers[i]
  if (s.proc === 'down') return
  const lost = s.work.length + s.queue.length
  for (let k = 0; k < lost; k++) fail(sim, i, 'box') // open connections are reset → 502
  s.work = []
  s.queue = []
  s.proc = 'down'
  s.downSince = sim.t
  addRev(sim, `${s.name} pao (proces ugašen). Load balancer to još ne zna.`, 'red')
}

export function repair(sim: Sim, i: number) {
  const s = sim.servers[i]
  if (s.proc !== 'down') return
  s.proc = 'boot'
  s.bootUntil = sim.t + BOOT_MS
  addRev(sim, `${s.name} ponovno pokrenut; čeka ${HC_OKS} uspješne provjere.`, 'line')
}

/* ---------- snapshot for rendering ---------- */

export interface SrvView {
  name: string
  vcpu: number
  ramGB: number
  W: number
  proc: Proc
  healthy: boolean
  fails: number
  oks: number
  busy: number
  /** cores working right now */
  onCpu: number
  /** requests in RAM that still need the processor (on a core or waiting for one) */
  cpuJobs: number
  work: number
  queue: number
  active: number
  probe: { ok: boolean; age: number } | null
  done: number
  downFor: number
  /** requests this server turned away with 503 (queue full) in the last 5 s */
  rej: number
}

export interface Snap {
  t: number
  dots: { id: number; x: number; y: number; k: 'req' | 'res' }[]
  marks: { id: number; x: number; y: number; a: number }[]
  servers: SrvView[]
  /** server the switch last sent a request to, and how long ago (ms) */
  target: number
  targetAge: number
  next: number
  thr: number
  err: number
  /** errors in the last TALLY_MS */
  errRecent: number
  p95: number | null
  /** successful requests the p95 is computed from */
  p95n: number
  okClient: number
  errClient: number
  series: Sample[]
  /** 0…1: how far the strip chart has moved since the last sample (smooth scrolling) */
  phase: number
  revs: Rev[]
  blackhole: boolean
  /** fraction of forwarded requests per server over the last 5 s (null before any traffic) */
  share: number[] | null
}

export function snapshot(sim: Sim, geo: Geo): Snap {
  const t = sim.t
  const dots: Snap['dots'] = []
  for (const f of sim.flights) {
    const r = f.leg === 'in' ? geo.inRoute : f.leg === 'out' ? geo.out[f.srv] : geo.back[f.srv]
    const prog = Math.max(0, Math.min(1, (t - f.t0) / f.dur))
    const [x, y] = pointAt(r, prog * r.len)
    dots.push({ id: f.id, x, y, k: f.leg === 'back' ? 'res' : 'req' })
  }
  const marks = sim.marks.map((m) => {
    let pt: Pt
    if (m.where === 'lb') pt = geo.lb
    else if (m.where === 'inlet') pt = geo.out[m.srv].pts[geo.out[m.srv].pts.length - 1]
    else if (m.where === 'queue') pt = geo.queueAt(m.srv, QUEUE_MAX)
    else {
      const c = geo.boxCenter[m.srv]
      pt = [c[0] + ((m.id * 37) % 90) - 45, c[1] + ((m.id * 53) % 30) - 15]
    }
    return { id: m.id, x: pt[0], y: pt[1], a: (t - m.t) / MARK_MS }
  })
  const lats = sim.lat.map((l) => l.ms).sort((a, b) => a - b)
  const p95 = lats.length >= 8 ? lats[Math.min(lats.length - 1, Math.floor(0.95 * (lats.length - 1)))] : null
  const servers = sim.servers.map((s) => {
    let need = 0
    for (const j of s.work) if (j.cpu > 0) need++
    return {
      name: s.name,
      vcpu: s.vcpu,
      ramGB: s.ramGB,
      W: s.W,
      proc: s.proc,
      healthy: s.healthy,
      fails: s.fails,
      oks: s.oks,
      busy: s.busy,
      onCpu: s.proc === 'up' ? Math.min(s.vcpu, need) : 0,
      cpuJobs: need,
      work: s.work.length,
      queue: s.queue.length,
      active: active(s),
      probe: s.probe ? { ok: s.probe.ok, age: t - s.probe.t } : null,
      done: s.done,
      downFor: s.proc === 'down' ? t - s.downSince : 0,
      rej: s.rej.length,
    }
  })
  const crashedIn = sim.servers.findIndex((s) => s.proc !== 'up' && s.healthy)
  // what the round-robin pointer will pick next (for the annotation)
  let next = -1
  for (let k = 0; k < sim.servers.length; k++) {
    const i = (sim.rr + k) % sim.servers.length
    if (sim.servers[i].healthy) {
      next = i
      break
    }
  }
  return {
    t,
    dots,
    marks,
    servers,
    target: sim.lbTarget,
    targetAge: t - sim.lbAt,
    next,
    thr: (sim.okT.length * 1000) / WINDOW_MS,
    err: errRate(sim),
    errRecent: sim.errT.length,
    p95,
    p95n: lats.length,
    okClient: sim.okClient,
    errClient: sim.errClient,
    series: sim.series.slice(-(SERIES_LEN + 1)),
    phase: Math.max(0, Math.min(1, 1 - (sim.nextSample - t) / SAMPLE_MS)),
    revs: sim.revs.slice(),
    blackhole: sim.algo === 'lc' && crashedIn >= 0,
    share: (() => {
      const n = sim.routed.reduce((a, r) => a + r.length, 0)
      return n ? sim.routed.map((r) => r.length / n) : null
    })(),
  }
}
