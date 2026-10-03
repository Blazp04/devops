/**
 * Read-only views of a TrafficState for UIs and tests: rolling-window metrics, per-server cards,
 * Little's-law check, EndpointSlice view, sessions, hit histogram and animation progress.
 * Nothing here mutates the state.
 */
import { activeOf } from './algorithms.ts'
import { capacityOf, nPlusOne, type Capacity, type NPlusOneReport } from './capacity.ts'
import { DT_MS, GOODPUT_WINDOW_MS, MIN_PERCENTILE_SAMPLES, N_PLUS_ONE_MAX_UTILISATION } from './constants.ts'
import { cpuOf, display, lbInRotation, nowMs, probeIntervalOf, ramUsedMB, routable, workersOf } from './engine.ts'
import type {
  CompletedReq,
  ErrTotals,
  EventKind,
  Flight,
  Incident,
  Mark,
  ProbeRecord,
  Proc,
  Req,
  RoutingState,
  ServerMeta,
  ServerState,
  Tone,
  TrafficEvent,
  TrafficState,
} from './types.ts'

/** Nearest-rank percentile of an ascending array: sorted[ceil(p·n) − 1]; p in 0..1. NaN for an empty array. */
export function nearestRank(sorted: readonly number[], p: number): number {
  if (!sorted.length) return NaN
  const q = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0.5
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]
}

export interface ErrorCounts {
  502: number
  503: number
  504: number
  refused: number
  total: number
}

export interface TrafficMetrics {
  /** Simulated seconds */
  t: number
  /** Offered rate right now (λ × profile × burst), req/s */
  offered: number
  /** Successful responses per second, last 5 s */
  goodput: number
  /** errors / (successes + errors), last 10 s; 0 when nothing happened */
  errorRate: number
  errorsPerSec: number
  /** Error counts in the last 10 s, split by code */
  errors: ErrorCounts
  /** Nearest-rank latency percentiles (ms) over successful requests of the last 10 s; null when fewer than 20 ("n/a") */
  p50: number | null
  p95: number | null
  p99: number | null
  mean: number | null
  /** Successful samples in the latency window */
  samples: number
  /** Requests inside servers or waiting at the LB right now */
  inSystem: number
}

/** Headline metrics over rolling windows. Never includes rejected requests in latency. */
export function metrics(s: TrafficState): TrafficMetrics {
  const t = s.t
  const lats: number[] = []
  let ok5 = 0
  for (const o of s.oks) {
    lats.push(o.lat)
    if (o.t > t - GOODPUT_WINDOW_MS) ok5++
  }
  const errors: ErrorCounts = { 502: 0, 503: 0, 504: 0, refused: 0, total: 0 }
  for (const e of s.errs) {
    if (e.code === 502) errors[502]++
    else if (e.code === 503) errors[503]++
    else if (e.code === 504) errors[504]++
    else errors.refused++
    errors.total++
  }
  lats.sort((a, b) => a - b)
  const enough = lats.length >= MIN_PERCENTILE_SAMPLES
  const span5 = Math.min(GOODPUT_WINDOW_MS / 1000, Math.max(0.5, t / 1000))
  const span10 = Math.min(10, Math.max(0.5, t / 1000))
  let inSystem = s.pending.length
  for (const v of s.servers) inSystem += activeOf(v)
  const n = lats.length + errors.total
  return {
    t: t / 1000,
    offered: s.offeredNow,
    goodput: ok5 / span5,
    errorRate: n ? errors.total / n : 0,
    errorsPerSec: errors.total / span10,
    errors,
    p50: enough ? nearestRank(lats, 0.5) : null,
    p95: enough ? nearestRank(lats, 0.95) : null,
    p99: enough ? nearestRank(lats, 0.99) : null,
    mean: enough ? lats.reduce((a, b) => a + b, 0) / lats.length : null,
    samples: lats.length,
    inSystem,
  }
}

export interface RedMetrics {
  /** Requests answered per second (successes + errors), last 10 s */
  rate: number
  /** Errors per second, last 10 s */
  errors: number
  /** errors / rate */
  errorRatio: number
  /** Duration percentiles (ms) of successful requests, null below 20 samples */
  p50: number | null
  p95: number | null
  p99: number | null
}

/** RED view (Rate, Errors, Duration) for a per-service metrics panel (L24). */
export function redMetrics(s: TrafficState): RedMetrics {
  const m = metrics(s)
  const span10 = Math.min(10, Math.max(0.5, s.t / 1000))
  const answered = m.samples + m.errors.total
  return { rate: answered / span10, errors: m.errors.total / span10, errorRatio: m.errorRate, p50: m.p50, p95: m.p95, p99: m.p99 }
}

/** What the routing layer thinks of v (badge text in the UI). */
export function routingState(s: TrafficState, v: ServerState): RoutingState {
  switch (s.cfg.mode) {
    case 'direct':
      return 'direct'
    case 'dns':
      return v.inDns ? 'inDns' : 'notInDns'
    case 'service':
      if (!v.inSlice) return 'notSelected'
      return v.terminating ? 'terminating' : v.kpReady && v.kpInSlice ? 'ready' : 'notReady'
    default:
      if (v.draining) return v.drained ? 'drained' : 'draining'
      if (s.cfg.passive.enabled && s.t < v.ejectedUntil) return 'ejected'
      if (s.cfg.healthCheck.enabled && !v.healthy) return v.everHealthy ? 'unhealthy' : 'initial'
      return 'healthy'
  }
}

export const ROUTING_LABEL: Record<RoutingState, string> = {
  direct: 'izravno',
  inDns: 'u DNS-u',
  notInDns: 'nije u DNS-u',
  healthy: 'ispravan',
  unhealthy: 'neispravan',
  initial: 'čeka provjere',
  ejected: 'izbačen (pasivno)',
  draining: 'prazni se',
  drained: 'sigurno za uklanjanje',
  ready: 'spreman',
  notReady: 'nije spreman',
  terminating: 'gasi se',
  notSelected: 'selektor ne odgovara',
}

export const PROC_LABEL: Record<Proc, string> = {
  up: 'radi',
  starting: 'pokreće se',
  crashed: 'proces je pao',
  hung: 'zamrznut',
  off: 'ugašen',
  booting: 'stroj se pokreće',
  exited: 'izašao',
}

export interface ServerView {
  id: string
  name: string
  /** "S1 (mali)" */
  display: string
  vcpu: number
  ramGB: number
  weight: number
  proc: Proc
  routing: RoutingState
  /** Receives new requests right now */
  inRotation: boolean
  /** Radnici (W) for the maths; Infinity with unbounded workers – draw `slots`, print `workersLabel` */
  workers: number
  /** Finite number of radnik slots to draw: max(busy, W) – or max(busy, RAM-bound W) when unbounded (busy may exceed W right after setServerSize shrinks the RAM) */
  slots: number
  /** Worker pool not bounded by RAM (the „Neograničeni radnici” misconfiguration) */
  unbounded: boolean
  /** "6" or "∞" */
  workersLabel: string
  /** Radnici busy (requests in progress) */
  busy: number
  queue: number
  queueMax: number
  /** Accepted but never answered (hung / off) */
  parked: number
  connecting: number
  active: number
  /** CPU over the last 1 s, 0..1 */
  cpu: number
  /** Smoothed CPU for display (τ ≈ 2 s), 0 when the process is down */
  cpuSmooth: number
  ramUsedMB: number
  ramMB: number
  /** Successful responses per second from this server, last 5 s */
  handledPerSec: number
  routed: number
  hits: number
  ooms: number
  restarts: number
  slowFactor: number
  /** Errors attributed to this server in the last 10 s */
  errors10s: { refused: number; full: number; timeout: number }
  /** Errors attributed to this server since it was added, by code („S2 bez ijedne neuspjele narudžbe”) */
  errTotals: ErrTotals
  /** Display data from the ServerSpec (version, Pod IP, labels) */
  meta: ServerMeta
  capacity: Capacity
  /** Users whose session lives here (local store) */
  sessions: number
  /** Draining, nothing in progress and no client connection pinned to it */
  safeToRemove: boolean
  /** Service mode: EndpointSlice conditions (truth) and kube-proxy's lagged view */
  endpoint: {
    ready: boolean
    serving: boolean
    terminating: boolean
    /** The Service's selector matches the Pod */
    inSlice: boolean
    kubeProxyReady: boolean
    kubeProxyInSlice: boolean
    propagating: boolean
  }
}

export function serverView(s: TrafficState, v: ServerState): ServerView {
  const errors10s = { refused: 0, full: 0, timeout: 0 }
  for (const e of s.errs) {
    if (e.server !== v.id) continue
    if (e.code === 504) errors10s.timeout++
    else if (e.reason === 'queueFull') errors10s.full++
    else errors10s.refused++
  }
  let sessions = 0
  for (const c of s.clients) if (c.session.home === v.id) sessions++
  let ok5 = 0
  for (let i = v.okTimes.length - 1; i >= 0 && v.okTimes[i] > s.t - GOODPUT_WINDOW_MS; i--) ok5++
  const down = v.proc !== 'up' && v.proc !== 'hung'
  const workers = workersOf(s, v)
  const boundW = capacityOf(v.vcpu, v.ramGB, s.cfg.workload).W
  return {
    id: v.id,
    name: v.name,
    display: display(v),
    vcpu: v.vcpu,
    ramGB: v.ramGB,
    weight: v.weight,
    proc: v.proc,
    routing: routingState(s, v),
    inRotation: routable(s, v),
    workers,
    slots: Math.max(v.inflight.length, Number.isFinite(workers) ? workers : boundW),
    unbounded: !Number.isFinite(workers),
    workersLabel: Number.isFinite(workers) ? String(workers) : '∞',
    busy: v.inflight.length,
    queue: v.queue.length,
    queueMax: s.cfg.queueMax,
    parked: v.parked.length,
    connecting: v.connecting.length,
    active: activeOf(v),
    cpu: cpuOf(v),
    cpuSmooth: down ? 0 : Math.min(1, Math.max(0, v.cpuShown)),
    ramUsedMB: ramUsedMB(s, v),
    ramMB: v.ramGB * 1024,
    handledPerSec: ok5 / Math.min(GOODPUT_WINDOW_MS / 1000, Math.max(0.5, s.t / 1000)),
    routed: v.routed,
    hits: v.hits,
    ooms: v.ooms,
    restarts: v.restarts,
    slowFactor: v.slowFactor,
    errors10s,
    errTotals: { ...v.errTotals },
    meta: v.meta,
    capacity: capacityOf(v.vcpu, v.ramGB, s.cfg.workload, v.slowFactor),
    sessions,
    safeToRemove: v.draining && v.drained,
    endpoint: {
      ready: v.serving && !v.terminating,
      serving: v.serving,
      terminating: v.terminating,
      inSlice: v.inSlice,
      kubeProxyReady: v.kpReady && v.kpInSlice,
      kubeProxyInSlice: v.kpInSlice,
      propagating: v.epQueue.length > 0,
    },
  }
}

export function serversView(s: TrafficState): ServerView[] {
  return s.servers.map((v) => serverView(s, v))
}

/**
 * Progress of a flight dot: 0..1 while visible, < 0 not started yet, > 1 finished. With via 'lb', 0.5 = at the LB.
 * Uses nowMs(s) (includes the sub-tick remainder), so dots move at a constant speed between renders.
 */
export function flightProgress(s: TrafficState, f: Flight): number {
  return f.durationMs > 0 ? (nowMs(s) - f.t0) / f.durationMs : 1
}

/** Visible flights with their progress (0..1). */
export function visibleFlights(s: TrafficState): { flight: Flight; progress: number }[] {
  const out: { flight: Flight; progress: number }[] = []
  for (const f of s.flights) {
    const p = flightProgress(s, f)
    if (p >= 0 && p <= 1) out.push({ flight: f, progress: p })
  }
  return out
}

/** How far a request inside a radnik has got: CPU part, then I/O wait. */
export function requestProgress(r: Req): { phase: 'cpu' | 'io' | 'done'; cpu: number; io: number; overall: number } {
  const cpuDone = r.cpuTotal > 0 ? Math.min(1, Math.max(0, 1 - r.cpuLeft / r.cpuTotal)) : 1
  const ioDone = r.ioTotal > 0 ? Math.min(1, Math.max(0, 1 - r.ioLeft / r.ioTotal)) : 1
  const total = r.cpuTotal + r.ioTotal
  return {
    phase: r.cpuLeft > 0 ? 'cpu' : r.ioLeft > 0 ? 'io' : 'done',
    cpu: cpuDone,
    io: ioDone,
    overall: total > 0 ? (cpuDone * r.cpuTotal + ioDone * r.ioTotal) / total : 1,
  }
}

export interface LittleCheck {
  /** Time-averaged number of requests in the system, last 10 s */
  L: number
  /** Departures per second, last 10 s */
  lambda: number
  /** Mean time in the system of those departures, s */
  W: number
  /** λ·W, should match L in a stable system */
  lambdaW: number
  departures: number
}

/** Live Little's-law panel: L ≈ λ·W. */
export function littleCheck(s: TrafficState): LittleCheck {
  const ticks = Math.min(s.ticks, s.littleRing.length)
  const L = ticks ? s.littleSum / ticks : 0
  const windowS = Math.min(10, s.t / 1000)
  const n = s.departures.length
  let sum = 0
  for (const d of s.departures) sum += d.sojourn
  const W = n ? sum / n / 1000 : 0
  const lambda = windowS > 0 ? n / windowS : 0
  return { L, lambda, W, lambdaW: lambda * W, departures: n }
}

export interface CapacityReport extends NPlusOneReport {
  servers: { id: string; display: string; capacity: Capacity; inRotation: boolean }[]
}

/**
 * Capacity of the servers in rotation vs offered load, and the N+1 check ("can we lose the biggest one and keep the
 * survivors at or below maxUtilisation?"). Show utilisationAfterFailure prominently (1 = 100 %).
 */
export function capacityReport(s: TrafficState, maxUtilisation: number = N_PLUS_ONE_MAX_UTILISATION): CapacityReport {
  const servers = s.servers.map((v) => ({
    id: v.id,
    display: display(v),
    capacity: capacityOf(v.vcpu, v.ramGB, s.cfg.workload, v.slowFactor),
    inRotation: routable(s, v) && (v.proc === 'up' || v.proc === 'hung'),
  }))
  const report = nPlusOne(
    servers.filter((x) => x.inRotation).map((x) => x.capacity.cap),
    s.offeredNow,
    maxUtilisation,
  )
  return { ...report, servers }
}

export interface EndpointView {
  id: string
  name: string
  /** EndpointSlice conditions as the API server has them */
  conditions: { ready: boolean; serving: boolean; terminating: boolean }
  /** What kube-proxy on the nodes currently uses (lags by propagationMs); inSlice false = already dropped from its rules */
  kubeProxy: { ready: boolean; serving: boolean; terminating: boolean; inSlice: boolean }
  propagating: boolean
  proc: Proc
  meta: ServerMeta
}

/**
 * Service mode: the EndpointSlice (Pods the selector matches – a Pod after setSelected(false) is not listed) and
 * kube-proxy's lagged view of each entry. serversView().endpoint also covers Pods outside the slice.
 */
export function endpointSlice(s: TrafficState): EndpointView[] {
  return s.servers
    .filter((v) => v.inSlice)
    .map((v) => ({
      id: v.id,
      name: v.name,
      conditions: { ready: v.serving && !v.terminating, serving: v.serving, terminating: v.terminating },
      kubeProxy: { ready: v.kpReady, serving: v.kpServing, terminating: v.kpTerminating, inSlice: v.kpInSlice },
      propagating: v.epQueue.length > 0,
      proc: v.proc,
      meta: v.meta,
    }))
}

/** Hit histogram since the last resetHits(): count and share per backend. */
export function hitShares(s: TrafficState): { id: string; name: string; hits: number; share: number }[] {
  let total = 0
  for (const v of s.servers) total += v.hits
  return s.servers.map((v) => ({ id: v.id, name: v.name, hits: v.hits, share: total ? v.hits / total : 0 }))
}

export interface SessionSummary {
  /** How many users have their session in each place (server id, 'redis') or none */
  byHome: Record<string, number>
  users: { id: number; name: string; home: string | null; cart: number; lost: number; cookie: string | null }[]
  lostTotal: number
}

export function sessionSummary(s: TrafficState): SessionSummary {
  const byHome: Record<string, number> = {}
  for (const c of s.clients) {
    const k = c.session.home ?? 'none'
    byHome[k] = (byHome[k] ?? 0) + 1
  }
  return {
    byHome,
    users: s.clients.map((c) => ({ id: c.id, name: c.name, home: c.session.home, cart: c.session.cart, lost: c.session.lost, cookie: c.cookie })),
    lostTotal: s.totals.sessionLost,
  }
}

/** Connections of each client (L14: keep-alive pinning). */
export function connectionMap(s: TrafficState): { client: string; ip: string; conns: { id: number; server: string | null; requests: number }[] }[] {
  return s.clients.map((c) => ({ client: c.name, ip: c.ip, conns: c.conns.map((k) => ({ id: k.id, server: k.server, requests: k.requests })) }))
}

/** The most recent incident (crash / OOM / hang / off), or null. */
export function lastIncident(s: TrafficState): Incident | null {
  return s.incidents.length ? s.incidents[s.incidents.length - 1] : null
}

/** Detection delay of an incident in ms (null while undetected). */
export function detectionDelayMs(inc: Incident): number | null {
  return inc.detectedAt === null ? null : inc.detectedAt - inc.t0
}

/** Is v a target for new requests in the LB's view (lb mode)? Re-exported for UIs. */
export function inLbRotation(s: TrafficState, v: ServerState): boolean {
  return lbInRotation(s, v)
}

/* ---------- Goals, scores and windows (L05 tasks, L24 capstone) ---------- */

/** Start a measurement window (a goal such as „drži 30 s pri λ = 20”, or an incident's MTTR). */
export function mark(s: TrafficState): Mark {
  return { t: s.t, totals: { ...s.totals } }
}

export interface WindowReport {
  durationS: number
  arrived: number
  ok: number
  errors: ErrorCounts
  /** errors / (ok + errors); 0 when nothing finished */
  errorRate: number
  /** Nearest-rank p95 of the successes in the window; null below 20 (or if the window is older than the kept history) */
  p95: number | null
  sessionLost: number
  wasted: number
}

/** Everything that happened since `m` (counts from totals; p95 from the last OK_HISTORY_MAX successes). */
export function since(s: TrafficState, m: Mark): WindowReport {
  const d = (k: keyof Mark['totals']) => s.totals[k] - m.totals[k]
  const errors: ErrorCounts = { 502: d('e502'), 503: d('e503'), 504: d('e504'), refused: d('refused'), total: 0 }
  errors.total = errors[502] + errors[503] + errors[504] + errors.refused
  const ok = d('ok')
  const lats: number[] = []
  for (let i = s.okHistory.length - 1; i >= 0 && s.okHistory[i].t >= m.t; i--) lats.push(s.okHistory[i].lat)
  lats.sort((a, b) => a - b)
  const complete = lats.length === ok
  return {
    durationS: (s.t - m.t) / 1000,
    arrived: d('arrived'),
    ok,
    errors,
    errorRate: ok + errors.total > 0 ? errors.total / (ok + errors.total) : 0,
    p95: complete && lats.length >= MIN_PERCENTILE_SAMPLES ? nearestRank(lats, 0.95) : null,
    sessionLost: d('sessionLost'),
    wasted: d('wasted'),
  }
}

/** Distinct users who saw at least one failed request at or after sinceMs (L24 score: failed requests × users). */
export function affectedUsers(s: TrafficState, sinceMs = 0): number {
  let n = 0
  for (const c of s.clients) if (c.lastErrorAt !== null && c.lastErrorAt >= sinceMs) n++
  return n
}

const TONE_RANK: Record<Tone, number> = { neutral: 0, info: 1, ok: 1, warn: 2, bad: 3 }

/** Filtered event log, newest last (e.g. only one server, or only warnings and worse). */
export function recentEvents(s: TrafficState, opts: { kinds?: readonly EventKind[]; server?: string; minTone?: Tone; max?: number } = {}): TrafficEvent[] {
  const min = opts.minTone ? TONE_RANK[opts.minTone] : 0
  const out = s.events.filter(
    (e) => (!opts.kinds || opts.kinds.includes(e.kind)) && (opts.server === undefined || e.server === opts.server) && TONE_RANK[e.tone] >= min,
  )
  const max = opts.max !== undefined && opts.max >= 0 ? Math.floor(opts.max) : out.length
  return out.slice(Math.max(0, out.length - max))
}

export interface ProbeTimeline {
  /** Probe interval (health check in lb mode, readiness period in Service mode), ms */
  intervalMs: number
  timeoutMs: number
  /** Consecutive failures that take the server out (U, or the readiness failureThreshold) */
  failureThreshold: number
  successThreshold: number
  /** Last probes, oldest first; a 'timeout' probe's result arrives at `at` */
  probes: ProbeRecord[]
  /** Next probe, ms */
  nextProbe: number
  fails: number
  passes: number
}

/** L05 „Prozor otkrivanja”: probe ticks of one server. null for an unknown id. */
export function probeTimeline(s: TrafficState, id: string): ProbeTimeline | null {
  const v = s.servers.find((x) => x.id === id)
  if (!v) return null
  const svc = s.cfg.mode === 'service'
  return {
    intervalMs: probeIntervalOf(s),
    timeoutMs: svc ? s.cfg.service.readiness.timeoutMs : s.cfg.healthCheck.timeoutMs,
    failureThreshold: svc ? s.cfg.service.readiness.failureThreshold : s.cfg.healthCheck.unhealthyThreshold,
    successThreshold: svc ? s.cfg.service.readiness.successThreshold : s.cfg.healthCheck.healthyThreshold,
    probes: v.probes.slice(),
    nextProbe: v.nextProbe,
    fails: v.hcFails,
    passes: v.hcOks,
  }
}

export interface RequestLocation {
  /** Where the request is now */
  phase: 'pending' | 'connecting' | 'parked' | 'queue' | 'inflight' | 'done'
  /** Server it is at / ended at; null = at the LB or never reached a server */
  server: string | null
  /** The live request (not 'done') – use requestProgress(req) for a radnik slot */
  req: Req | null
  /** The finished record ('done', while it is still in state.recent) */
  done: CompletedReq | null
}

/** Follow one request (e.g. the id sendRequest() returned): waiting at the LB, at a server, or finished. null = unknown / too old. */
export function findRequest(s: TrafficState, id: number): RequestLocation | null {
  for (const r of s.pending) if (r.id === id) return { phase: 'pending', server: null, req: r, done: null }
  for (const v of s.servers) {
    for (const [phase, list] of [
      ['inflight', v.inflight],
      ['queue', v.queue],
      ['parked', v.parked],
      ['connecting', v.connecting],
    ] as const) {
      for (const r of list) if (r.id === id && !r.done) return { phase, server: v.id, req: r, done: null }
    }
  }
  for (let i = s.recent.length - 1; i >= 0; i--) {
    const d = s.recent[i]
    if (d.id === id) return { phase: 'done', server: d.server, req: null, done: d }
  }
  return null
}

/** Simulated seconds of a state as a number with one decimal (for clocks). */
export function simSeconds(s: TrafficState): number {
  return Math.round(s.t / 100) / 10
}

/** Tick length, re-exported for UIs that animate between ticks. */
export const TICK_MS = DT_MS
