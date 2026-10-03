/**
 * E1 Promet – traffic and load-balancing engine (pure TypeScript, no React, no DOM).
 *
 * Model: docs/research/sim-models.md "SIM 1" (validated with docs/research/proto/lb-sim.ts).
 *   - worker-pool servers: RAM bounds how many requests are in progress (W radnika), cores bound throughput;
 *   - a request uses at most one core: share = min(1, vCPU / nCpu); CPU first, then I/O wait;
 *   - per-server FIFO queue (queueMax), then 503; client timeout 5 s → 504 (late completions = wasted work);
 *   - Poisson arrivals (rate changes rescale the pending gap: time-rescaling, no extra randomness);
 *   - four routing modes: direct (L02), dns (L03/L04 hook), lb (L04/L05), service (L14).
 *
 * Time is in ms; one tick = DT_MS = 10 ms. step(state, dtSeconds) accumulates real-sized steps from
 * useSimulation (1/60 s) into fixed ticks, so results never depend on the frame rate.
 * Same config + seed + same action sequence ⇒ identical run.
 *
 * Error categories (ErrCode): an L7 load balancer answers 502/503/504; without an HTTP proxy in the path
 * (direct, dns, Kubernetes Service, L4 LB) a dead backend is a refused or reset connection ('refused').
 */
import { createRng, plural, Series } from '../../kit/sim/math.ts'
import { activeOf, clientKey, pickBackend, ringPick } from './algorithms.ts'
import { suggestedWeights, workersFor } from './capacity.ts'
import {
  ALGO_NAME,
  BASE_RAM_MB,
  CPU_WINDOW_TICKS,
  DEFAULT_CLIENT_TIMEOUT_MS,
  DEFAULT_LAMBDA,
  DEFAULT_QUEUE_MAX,
  DEFAULT_SEED,
  DT_MS,
  ERROR_WINDOW_MS,
  GOODPUT_WINDOW_MS,
  LATENCY_WINDOW_MS,
  MAX_SERVERS,
  MAX_STEP_S,
  MIN_PERCENTILE_SAMPLES,
  OK_HISTORY_MAX,
  PROBE_HISTORY,
  QUEUE_MAX_LIMIT,
  RECENT_MAX,
  SERIES_EVERY_MS,
  SERIES_LEN,
  SERVICE_DEFAULT_LAMBDA,
  TIMING,
  WORKLOADS,
  defaultRack,
  fmtDuration,
  podSet,
  simRealLabel,
  singleServer,
} from './constants.ts'
import { deriveSeed } from './hashing.ts'
import type {
  Algo,
  Client,
  Conn,
  ErrCode,
  ErrReason,
  EventKind,
  Flight,
  IncidentKind,
  Mode,
  Place,
  ProbeRecord,
  Req,
  RuntimePatch,
  ServerSpec,
  ServerState,
  Tone,
  TrafficConfig,
  TrafficConfigInput,
  TrafficProfile,
  TrafficState,
} from './types.ts'

type Path = 'direct' | 'lb' | 'service'

/** Failures that count against a server for the passive check: the LB itself saw the connection fail. */
const PASSIVE_REASONS: ReadonlySet<ErrReason> = new Set<ErrReason>(['refused', 'reset', 'connectTimeout'])

const LITTLE_TICKS = 10_000 / DT_MS
const CPU_EMA = DT_MS / 2000

/* ====================================================================== */
/* Config                                                                  */
/* ====================================================================== */

/** Defaults for a mode (direct: one 2 vCPU / 2 GB server; service: 4 identical Pods; otherwise the S1/S2/S3 rack). */
export function defaultConfig(mode: Mode = 'lb'): TrafficConfig {
  return {
    seed: DEFAULT_SEED,
    mode,
    servers: mode === 'direct' ? singleServer() : mode === 'service' ? podSet(4) : defaultRack(),
    workload: 'api',
    lambda: mode === 'service' ? SERVICE_DEFAULT_LAMBDA : DEFAULT_LAMBDA,
    arrivals: 'poisson',
    profile: { kind: 'constant' },
    algo: 'rr',
    layer: 'L7',
    queueMax: DEFAULT_QUEUE_MAX,
    clientTimeoutMs: DEFAULT_CLIENT_TIMEOUT_MS,
    unboundedWorkers: false,
    rngStreams: 'shared',
    healthCheck: {
      enabled: true,
      intervalMs: TIMING.healthInterval.sim,
      timeoutMs: TIMING.healthTimeout.sim,
      unhealthyThreshold: TIMING.unhealthyThreshold.sim,
      healthyThreshold: TIMING.healthyThreshold.sim,
      stagger: true,
      probeQueues: false,
    },
    passive: { enabled: false, ejectMs: TIMING.passiveEject.sim },
    retry: false,
    failOpen: false,
    connectTimeoutMs: TIMING.connectTimeout.sim,
    lifecycle: {
      autoRestart: true,
      restartDelayMs: TIMING.restartDelay.sim,
      warmupMs: TIMING.warmup.sim,
      bootMs: TIMING.boot.sim,
      resizeDowntimeMs: TIMING.resizeDowntime.sim,
      deregistrationDelayMs: TIMING.deregistrationDelay.sim,
    },
    clients: { count: 20, mode: 'perRequest', poolSize: 4, nat: false, pinTo: null },
    sessions: { enabled: false, store: 'local', affinity: 'none', hashKey: 'user' },
    service: {
      propagationMs: TIMING.endpointPropagation.sim,
      sessionAffinity: 'None',
      affinityTimeoutS: TIMING.sessionAffinityTimeout.sim / 1000,
      readiness: {
        periodMs: TIMING.readinessPeriod.sim,
        timeoutMs: TIMING.readinessTimeout.sim,
        failureThreshold: TIMING.readinessFailureThreshold.sim,
        successThreshold: TIMING.readinessSuccessThreshold.sim,
      },
      preStopSleepS: 0,
      sigterm: 'graceful',
      terminationGraceS: TIMING.terminationGrace.sim / 1000,
    },
    dns: { ttlMs: TIMING.dnsTtl.sim, resolvers: 4, campusShare: 0 },
    burst: { factor: 3, durationMs: 30_000 },
    ewmaAlpha: 0.2,
    visual: { flights: true, flightMs: 450, maxFlights: 200 },
    maxEvents: 50,
    script: [],
  }
}

/** Finite number ≥ min (else fallback), optionally clamped to max. */
function num(v: unknown, fallback: number, min = 0, max = Infinity): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min ? Math.min(v, max) : fallback
}
function int(v: unknown, fallback: number, min = 0, max = Infinity): number {
  return Math.round(num(v, fallback, min, max))
}

function sanitizeProfile(p: TrafficProfile | undefined): TrafficProfile {
  if (!p) return { kind: 'constant' }
  if (p.kind === 'waves') return { kind: 'waves', amplitude: num(p.amplitude, 0.5, 0, 1), periodS: num(p.periodS, 20, 0.1) }
  if (p.kind === 'lunch')
    return {
      kind: 'lunch',
      startS: num(p.startS, 10),
      rampS: num(p.rampS, 5),
      peakFactor: num(p.peakFactor, 3),
      holdS: num(p.holdS, 30),
      decayS: num(p.decayS, 15),
    }
  return { kind: 'constant' }
}

const NESTED = ['healthCheck', 'passive', 'lifecycle', 'clients', 'sessions', 'dns', 'burst', 'visual'] as const

/**
 * Deep-merge two config inputs: nested objects (healthCheck, lifecycle, service.readiness …) are merged field by field,
 * so an override of one nested field never drops the base's other fields (presets rely on e.g. stagger: false).
 */
export function mergeConfigInput(base: TrafficConfigInput, over: TrafficConfigInput = {}): TrafficConfigInput {
  const out: TrafficConfigInput = { ...base, ...over }
  const o = out as Record<string, unknown>
  for (const k of NESTED) {
    if (base[k] || over[k]) o[k] = { ...base[k], ...over[k] }
  }
  if (base.service || over.service) {
    const readiness = base.service?.readiness || over.service?.readiness ? { ...base.service?.readiness, ...over.service?.readiness } : undefined
    out.service = { ...base.service, ...over.service, ...(readiness ? { readiness } : {}) }
  }
  return out
}

/** Merge a partial config over the mode's defaults and sanitise every number (NaN, negatives, out of range). */
export function resolveConfig(input: TrafficConfigInput = {}): TrafficConfig {
  const d = defaultConfig(input.mode ?? 'lb')
  const hc = { ...d.healthCheck, ...input.healthCheck }
  const lc = { ...d.lifecycle, ...input.lifecycle }
  const cl = { ...d.clients, ...input.clients }
  const svcIn = input.service ?? {}
  const rd = { ...d.service.readiness, ...svcIn.readiness }
  const svc = { ...d.service, ...svcIn, readiness: rd }
  const dns = { ...d.dns, ...input.dns }
  const burst = { ...d.burst, ...input.burst }
  const vis = { ...d.visual, ...input.visual }
  return {
    ...d,
    ...input,
    seed: Number.isFinite(input.seed) ? (input.seed as number) >>> 0 : d.seed,
    servers: (input.servers ?? d.servers).map((sp, i) => ({
      ...sp,
      id: sp.id || `s${i + 1}`,
      name: sp.name || `S${i + 1}`,
      vcpu: num(sp.vcpu, 1, 0.1, 128),
      ramGB: num(sp.ramGB, 2, 0.1, 1024),
    })),
    workload: input.workload && WORKLOADS[input.workload] ? input.workload : d.workload,
    lambda: num(input.lambda, d.lambda, 0, 10_000),
    profile: sanitizeProfile(input.profile ?? d.profile),
    queueMax: int(input.queueMax, d.queueMax, 0, QUEUE_MAX_LIMIT),
    clientTimeoutMs: num(input.clientTimeoutMs, d.clientTimeoutMs, DT_MS),
    connectTimeoutMs: num(input.connectTimeoutMs, d.connectTimeoutMs, DT_MS),
    ewmaAlpha: num(input.ewmaAlpha, d.ewmaAlpha, 0, 1),
    maxEvents: int(input.maxEvents, d.maxEvents, 1, 1000),
    script: input.script ?? [],
    healthCheck: {
      ...hc,
      intervalMs: num(hc.intervalMs, d.healthCheck.intervalMs, DT_MS),
      timeoutMs: num(hc.timeoutMs, d.healthCheck.timeoutMs, DT_MS),
      unhealthyThreshold: int(hc.unhealthyThreshold, 2, 1, 100),
      healthyThreshold: int(hc.healthyThreshold, 2, 1, 100),
    },
    passive: { ...d.passive, ...input.passive, ejectMs: num(input.passive?.ejectMs, d.passive.ejectMs, 0) },
    lifecycle: {
      ...lc,
      restartDelayMs: num(lc.restartDelayMs, d.lifecycle.restartDelayMs, 0),
      warmupMs: num(lc.warmupMs, d.lifecycle.warmupMs, 0),
      bootMs: num(lc.bootMs, d.lifecycle.bootMs, 0),
      resizeDowntimeMs: num(lc.resizeDowntimeMs, d.lifecycle.resizeDowntimeMs, 0),
      deregistrationDelayMs: num(lc.deregistrationDelayMs, d.lifecycle.deregistrationDelayMs, 0),
    },
    clients: {
      ...cl,
      count: int(cl.count, 20, 1, 10_000),
      poolSize: int(cl.poolSize, 4, 1, 64),
      pinTo: typeof cl.pinTo === 'string' && cl.pinTo ? cl.pinTo : null,
    },
    sessions: (() => {
      const ss = { ...d.sessions, ...input.sessions }
      return { ...ss, hashKey: ss.hashKey === 'ip' ? ('ip' as const) : ('user' as const) }
    })(),
    service: {
      ...svc,
      propagationMs: num(svc.propagationMs, d.service.propagationMs, 0),
      affinityTimeoutS: num(svc.affinityTimeoutS, d.service.affinityTimeoutS, 0),
      preStopSleepS: num(svc.preStopSleepS, 0, 0),
      terminationGraceS: num(svc.terminationGraceS, d.service.terminationGraceS, 0),
      readiness: {
        periodMs: num(rd.periodMs, d.service.readiness.periodMs, DT_MS),
        timeoutMs: num(rd.timeoutMs, d.service.readiness.timeoutMs, DT_MS),
        failureThreshold: int(rd.failureThreshold, 3, 1, 100),
        successThreshold: int(rd.successThreshold, 1, 1, 100),
      },
    },
    dns: { ...dns, ttlMs: num(dns.ttlMs, d.dns.ttlMs, 0), resolvers: int(dns.resolvers, 4, 1, 64), campusShare: num(dns.campusShare, 0, 0, 1) },
    burst: { factor: num(burst.factor, 3, 0, 100), durationMs: num(burst.durationMs, 30_000, 0) },
    visual: { ...vis, flightMs: num(vis.flightMs, 450, 1), maxFlights: int(vis.maxFlights, 200, 0, 10_000) },
  }
}

/* ====================================================================== */
/* Creation                                                                */
/* ====================================================================== */

function roundToTick(ms: number): number {
  return Math.round(ms / DT_MS) * DT_MS
}

function probeInterval(s: TrafficState): number {
  return s.cfg.mode === 'service' ? s.cfg.service.readiness.periodMs : s.cfg.healthCheck.intervalMs
}

/** Probe interval in force: health-check interval (lb) or readiness period (Service), ms. */
export function probeIntervalOf(s: TrafficState): number {
  return probeInterval(s)
}

function newServer(s: TrafficState, spec: ServerSpec, weight: number, index: number, count: number, running: boolean): ServerState {
  const wl = WORKLOADS[s.cfg.workload]
  const interval = probeInterval(s)
  const phase = probePhase(s, index, count, interval)
  const lbKnows = !s.cfg.healthCheck.enabled
  return {
    id: spec.id,
    name: spec.name,
    label: spec.label ?? '',
    meta: { ...spec.meta },
    vcpu: spec.vcpu,
    ramGB: spec.ramGB,
    weight: spec.weight !== undefined && Number.isFinite(spec.weight) && spec.weight > 0 ? spec.weight : weight,
    inDns: spec.inDns ?? true,
    proc: running ? 'up' : 'starting',
    procUntil: running ? -1 : s.t + s.cfg.lifecycle.warmupMs,
    slowFactor: 1,
    leakMBps: 0,
    leakMB: 0,
    accepting: true,
    inflight: [],
    queue: [],
    parked: [],
    connecting: [],
    healthy: running || lbKnows,
    hcFails: 0,
    hcOks: 0,
    nextProbe: s.t + (running ? phase : DT_MS),
    probeDueAt: -1,
    ejectedUntil: 0,
    draining: false,
    drained: false,
    drainStartedAt: -1,
    deregistered: false,
    everHealthy: running,
    forcedUnready: false,
    inSlice: true,
    kpInSlice: true,
    serving: running,
    terminating: false,
    kpReady: running,
    kpServing: running,
    kpTerminating: false,
    epQueue: [],
    termination: null,
    crashBackoff: null,
    crashedAt: -1,
    cw: 0,
    ewmaMs: wl.cpuMs + wl.ioMs,
    busy: new Float64Array(CPU_WINDOW_TICKS),
    busyIdx: 0,
    busySum: 0,
    cpuShown: 0,
    okTimes: [],
    routed: 0,
    hits: 0,
    handled: 0,
    ooms: 0,
    restarts: 0,
    busyCoreMsTotal: 0,
    cpuSeries: new Series(SERIES_LEN),
    queueSeries: new Series(SERIES_LEN),
    lastQueueFullLog: -Infinity,
    errTotals: { 502: 0, 503: 0, 504: 0, refused: 0 },
    probes: [],
  }
}

function makeClients(cfg: TrafficConfig): Client[] {
  const n = cfg.clients.count
  const campus = Math.round(cfg.dns.campusShare * n)
  const out: Client[] = []
  for (let i = 0; i < n; i++) {
    out.push({
      id: i,
      name: `K${i + 1}`,
      // 203.0.113.0/24 is a documentation range (RFC 5737): one public NAT address for a whole campus
      ip: cfg.clients.nat ? '203.0.113.10' : `10.244.${1 + Math.floor(i / 250)}.${(i % 250) + 2}`,
      resolver: i < campus ? 0 : i % cfg.dns.resolvers,
      conns: [],
      nextConn: 0,
      cookie: null,
      session: { home: null, cart: 0, wiped: false, loggedOut: false, lost: 0 },
      requests: 0,
      failed: 0,
      firstErrorAt: null,
      lastErrorAt: null,
    })
  }
  return out
}

/** Create a fresh simulation. Same input ⇒ same run. */
export function createTraffic(input: TrafficConfigInput = {}): TrafficState {
  const cfg = resolveConfig(input)
  const rngArr = createRng(cfg.seed)
  const rngAlgo = cfg.rngStreams === 'split' ? createRng(deriveSeed(cfg.seed, 1)) : rngArr
  const s: TrafficState = {
    cfg,
    t: 0,
    ticks: 0,
    acc: 0,
    rngArr,
    rngAlgo,
    rngClients: createRng(deriveSeed(cfg.seed, 2)),
    rngInject: createRng(deriveSeed(cfg.seed, 3)),
    servers: [],
    clients: makeClients(cfg),
    pending: [],
    nextArrival: Infinity,
    lastRate: 0,
    pendingUnits: 0,
    profileT0: 0,
    burstUntil: 0,
    burstFactor: 1,
    burstLogged: false,
    rr: 0,
    lbUp: true,
    redisUp: true,
    ipAffinity: new Map(),
    dnsResolvers: Array.from({ length: cfg.dns.resolvers }, () => ({ order: [], expiresAt: -1 })),
    dnsAuthIdx: 0,
    nextReqId: 1,
    nextFlightId: 1,
    nextEventId: 1,
    nextConnId: 1,
    nextIncidentId: 1,
    oks: [],
    errs: [],
    okHistory: [],
    recent: [],
    totals: { arrived: 0, ok: 0, e502: 0, e503: 0, e504: 0, refused: 0, wasted: 0, retried: 0, sessionLost: 0, connections: 0, manualRouted: 0, ooms: 0 },
    flights: [],
    events: [],
    series: { offered: new Series(SERIES_LEN), goodput: new Series(SERIES_LEN), errors: new Series(SERIES_LEN), p95: new Series(SERIES_LEN) },
    incidents: [],
    scheduled: [],
    littleRing: new Float64Array(LITTLE_TICKS),
    littleIdx: 0,
    littleSum: 0,
    departures: [],
    sampleAcc: 0,
    lastLog: {},
    offeredNow: 0,
    ring: null,
    sessionLostPending: 0,
    lastSessionLog: -Infinity,
  }
  const weights = suggestedWeights(cfg.servers, cfg.workload)
  s.servers = cfg.servers.map((sp, i) => newServer(s, sp, weights[i], i, cfg.servers.length, true))
  // first arrival: the very first draw of the arrival stream (as in the validated prototype)
  const rate = currentRate(s, 0)
  s.lastRate = rate
  s.offeredNow = rate
  if (rate > 0) s.nextArrival = cfg.arrivals === 'poisson' ? rngArr.exp(rate) * 1000 : 1000 / rate
  else s.pendingUnits = cfg.arrivals === 'poisson' ? rngArr.exp(1) : 1
  for (const a of cfg.script) schedule(s, a.atMs, a.run, a.label)
  const n = s.servers.length
  log(
    s,
    'start',
    `Start: ${fmtNum(cfg.lambda)} ${Number.isInteger(cfg.lambda) ? plural(cfg.lambda, ['zahtjev', 'zahtjeva', 'zahtjeva'], false) : 'zahtjeva'}/s, ${cfg.mode === 'lb' ? ALGO_NAME[cfg.algo] : modeText(cfg.mode)}, ${cfg.mode === 'service' ? plural(n, ['Pod', 'Poda', 'Podova']) : plural(n, ['poslužitelj', 'poslužitelja', 'poslužitelja'])}.`,
    'info',
  )
  return s
}

function modeText(m: Mode): string {
  return m === 'direct' ? 'bez load balancera' : m === 'dns' ? 'raspodjela preko DNS-a' : m === 'service' ? 'Kubernetes Service' : 'load balancer'
}

/* ====================================================================== */
/* Stepping                                                                */
/* ====================================================================== */

/**
 * Advance by dtSeconds of simulated time (plug into useSimulation's step). Internally runs whole 10 ms ticks;
 * the remainder is kept for the next call. NaN, negative or zero dt does nothing.
 */
export function step(s: TrafficState, dtSeconds: number): void {
  if (!(dtSeconds > 0)) return
  s.acc += Math.min(dtSeconds, MAX_STEP_S) * 1000
  while (s.acc >= DT_MS - 1e-9) {
    tick(s)
    s.acc -= DT_MS
  }
}

/** Run exactly round(ms / DT_MS) ticks (headless runs, tests). */
export function advance(s: TrafficState, ms: number): void {
  const n = Math.round(num(ms, 0) / DT_MS)
  for (let i = 0; i < n; i++) tick(s)
}

/** Run ticks until s.t ≥ tMs. */
export function runUntil(s: TrafficState, tMs: number): void {
  while (s.t < tMs) tick(s)
}

/** One fixed 10 ms step. Order matters and mirrors the prototype: actions → checks → arrivals → servers. */
export function tick(s: TrafficState): void {
  const t = s.t
  runScheduled(s, t)
  lifecycle(s, t)
  if (s.cfg.mode === 'service') terminationTimers(s, t)
  probes(s, t)
  if (s.cfg.mode === 'service') propagateEndpoints(s, t)
  updateIncidents(s, t)
  arrivals(s, t)
  waitTimers(s, t)
  for (const v of s.servers) processServer(s, v, t)
  if (s.cfg.mode === 'service') removeExited(s)
  bookkeeping(s, t)
  s.t = t + DT_MS
  s.ticks++
}

/* ====================================================================== */
/* Arrivals                                                                */
/* ====================================================================== */

/** Multiplier of the base λ at time tS (s) since the profile started. */
export function profileFactor(p: TrafficProfile, tS: number): number {
  switch (p.kind) {
    case 'waves':
      return Math.max(0, 1 + p.amplitude * Math.sin((2 * Math.PI * tS) / p.periodS))
    case 'lunch': {
      const peak = p.peakFactor
      if (tS < p.startS) return 1
      const a = tS - p.startS
      if (a < p.rampS) return 1 + ((peak - 1) * a) / p.rampS
      if (a < p.rampS + p.holdS) return peak
      const b = a - p.rampS - p.holdS
      if (b < p.decayS) return peak - ((peak - 1) * b) / p.decayS
      return 1
    }
    default:
      return 1
  }
}

/** Offered rate (req/s) at time t: λ × profile × burst. */
export function currentRate(s: TrafficState, t: number): number {
  const f = profileFactor(s.cfg.profile, (t - s.profileT0) / 1000)
  const b = t < s.burstUntil ? s.burstFactor : 1
  const r = s.cfg.lambda * f * b
  return Number.isFinite(r) && r > 0 ? r : 0
}

function arrivals(s: TrafficState, t: number) {
  const rate = currentRate(s, t)
  if (rate !== s.lastRate) {
    // Time rescaling: keep the remaining "unit" exponential mass, stretch it to the new rate (memoryless, no extra draw).
    const units = s.lastRate > 0 && Number.isFinite(s.nextArrival) ? ((s.nextArrival - t) * s.lastRate) / 1000 : s.pendingUnits
    if (rate > 0) s.nextArrival = t + (units / rate) * 1000
    else {
      s.pendingUnits = units
      s.nextArrival = Infinity
    }
    s.lastRate = rate
  }
  s.offeredNow = rate
  const wl = WORKLOADS[s.cfg.workload]
  while (s.nextArrival <= t) {
    const cpu = wl.cpuMs * s.rngArr.exp(1)
    const ci = Math.floor(s.rngClients.next() * s.clients.length)
    const c = s.clients[ci] ?? null
    const r = makeReq(s, c, cpu, wl.ioMs, false)
    s.totals.arrived++
    if (c) c.requests++
    admit(s, r, c)
    s.nextArrival += s.cfg.arrivals === 'poisson' ? s.rngArr.exp(rate) * 1000 : 1000 / rate
  }
}

function makeReq(s: TrafficState, c: Client | null, cpu: number, io: number, manual: boolean): Req {
  return {
    id: s.nextReqId++,
    client: c ? c.id : -1,
    t0: s.t,
    tRouted: s.t,
    tStart: -1,
    tCpuDone: -1,
    cpuTotal: cpu,
    cpuLeft: cpu,
    ioTotal: io,
    ioLeft: io,
    gaveUp: false,
    done: false,
    server: null,
    attempts: 0,
    connectUntil: -1,
    conn: null,
    visualArrive: s.t,
    manual,
  }
}

/**
 * „Pošalji zahtjev”: one request from a chosen client (default: the next client in turn), routed exactly like an arrival
 * (connections, ClientIP affinity, manual mode and every failure mode apply). Request size and client come from a
 * separate RNG stream, so the seeded arrival process is not disturbed. Returns the request id (follow it in
 * state.flights / server queues / state.recent), or null for an unknown client.
 */
export function sendRequest(s: TrafficState, opts: { client?: number; cpuMs?: number; ioMs?: number } = {}): number | null {
  const wl = WORKLOADS[s.cfg.workload]
  let c: Client | null = null
  if (opts.client !== undefined) {
    c = s.clients[opts.client] ?? null
    if (!c) return null
  } else if (s.clients.length) c = s.clients[Math.floor(s.rngInject.next() * s.clients.length)]
  const cpu = opts.cpuMs !== undefined ? num(opts.cpuMs, 0, 0, 600_000) : wl.cpuMs * s.rngInject.exp(1)
  const io = opts.ioMs !== undefined ? num(opts.ioMs, wl.ioMs, 0, 600_000) : wl.ioMs
  const r = makeReq(s, c, cpu, io, true)
  s.totals.arrived++
  if (c) c.requests++
  admit(s, r, c)
  return r.id
}

/* ====================================================================== */
/* Routing                                                                 */
/* ====================================================================== */

function admit(s: TrafficState, r: Req, c: Client | null): void {
  switch (s.cfg.mode) {
    case 'direct': {
      const v = s.servers[0]
      if (!v) return rejectAt(s, r, 'refused', 'noBackend', 'client')
      return deliver(s, r, v, 'direct', false)
    }
    case 'dns': {
      const v = dnsTarget(s, c)
      if (!v) return rejectAt(s, r, 'refused', 'noBackend', 'client')
      return deliver(s, r, v, 'direct', false)
    }
    case 'service': {
      const pin = s.cfg.clients.pinTo
      if (pin !== null) {
        // a hard-coded Pod IP: no Service, no kube-proxy – the client talks to that Pod or to nobody
        const p = findServer(s, pin)
        if (!p) {
          logEvery(s, 'noRoute', 4000, 'noBackend', `Klijent ima upisanu IP adresu Poda ${pin}, a taj Pod više ne postoji – veza ne uspijeva.`, 'bad')
          return rejectAt(s, r, 'refused', 'noRoute', 'client')
        }
        s.totals.connections++
        return deliver(s, r, p, 'service', false)
      }
      const v = connectionTarget(s, r, c, true, () => chooseService(s, c))
      if (!v) {
        // kube-proxy installs a REJECT rule for a Service without endpoints: the client sees „connection refused”
        logEvery(s, 'noBackend', 4000, 'noBackend', 'Service nema nijedan spreman endpoint – kube-proxy odbija vezu.', 'bad')
        return rejectAt(s, r, 'refused', 'noBackend', 'service')
      }
      return deliver(s, r, v, 'service', false)
    }
    default:
      return routeLb(s, r, c)
  }
}

function routeLb(s: TrafficState, r: Req, c: Client | null): void {
  if (!s.lbUp) return rejectAt(s, r, 'refused', 'lbDown', 'lb')
  if (s.cfg.algo === 'manual') {
    s.pending.push(r)
    addFlight(s, r, 'in', 'client', 'lb', null, 'waiting')
    return
  }
  const v = connectionTarget(s, r, c, s.cfg.layer === 'L4', () => chooseLb(s, c, null))
  if (!v) {
    if (s.cfg.layer === 'L4') {
      // an L4 balancer has no HTTP to answer with: it closes the client's connection
      logEvery(s, 'noBackend', 4000, 'noBackend', 'Nijedan poslužitelj nije ispravan – L4 load balancer zatvara veze.', 'bad')
      return rejectAt(s, r, 'refused', 'noBackend', 'lb')
    }
    logEvery(s, 'noBackend', 4000, 'noBackend', 'Nijedan poslužitelj nije ispravan – load balancer vraća 503.', 'bad')
    return rejectAt(s, r, 503, 'noBackend', 'lb')
  }
  deliver(s, r, v, 'lb', false)
}

/** Is this server a target for new requests in the LB's view? */
export function lbInRotation(s: TrafficState, v: ServerState): boolean {
  if (v.draining) return false
  if (s.cfg.healthCheck.enabled && !v.healthy) return false
  if (s.cfg.passive.enabled && s.t < v.ejectedUntil) return false
  return true
}

function chooseLb(s: TrafficState, c: Client | null, exclude: ServerState | null): ServerState | null {
  let cands = s.servers.filter((v) => v !== exclude && lbInRotation(s, v))
  if (!cands.length && s.cfg.failOpen) cands = s.servers.filter((v) => v !== exclude && !v.draining)
  if (!cands.length) return null
  const aff = s.cfg.sessions.affinity
  if (aff === 'cookie' && c && s.cfg.layer === 'L7') {
    if (c.cookie) {
      const v = cands.find((x) => x.id === c.cookie)
      if (v) return v
    }
    const v = pickBackend(s, cands, c)
    c.cookie = v.id
    return v
  }
  if (aff === 'hash' && c) return ringPick(s, cands, clientKey(c, s.cfg.sessions.hashKey))
  return pickBackend(s, cands, c)
}

/** Endpoints kube-proxy routes new connections to: ready ones, or – only if none is ready – serving-terminating ones. */
export function serviceCandidates(s: TrafficState): ServerState[] {
  const ready = s.servers.filter((v) => v.kpInSlice && v.kpReady)
  if (ready.length) return ready
  // kube-proxy falls back to endpoints that are terminating but still serving (pkg/proxy/topology.go CategorizeEndpoints)
  return s.servers.filter((v) => v.kpInSlice && v.kpServing && v.kpTerminating)
}

function chooseService(s: TrafficState, c: Client | null): ServerState | null {
  const cands = serviceCandidates(s)
  if (!cands.length) return null
  if (s.cfg.service.sessionAffinity === 'ClientIP' && c) {
    const a = s.ipAffinity.get(c.ip)
    if (a && s.t - a.lastUsed <= s.cfg.service.affinityTimeoutS * 1000) {
      const v = cands.find((x) => x.id === a.server)
      if (v) {
        a.lastUsed = s.t
        return v
      }
    }
    const v = cands[Math.floor(s.rngAlgo.next() * cands.length)]
    s.ipAffinity.set(c.ip, { server: v.id, lastUsed: s.t })
    return v
  }
  // kube-proxy (iptables / nftables): a uniformly random ready endpoint for each new connection
  return cands[Math.floor(s.rngAlgo.next() * cands.length)]
}

function dnsTarget(s: TrafficState, c: Client | null): ServerState | null {
  const res = s.dnsResolvers[c ? c.resolver % s.dnsResolvers.length : 0]
  if (!res) return null
  if (s.t >= res.expiresAt) {
    const records = s.servers.filter((v) => v.inDns).map((v) => v.id)
    if (records.length) {
      // the authoritative server rotates the order of the A records for every query
      const k = s.dnsAuthIdx++ % records.length
      res.order = [...records.slice(k), ...records.slice(0, k)]
    } else res.order = []
    res.expiresAt = s.t + s.cfg.dns.ttlMs
  }
  for (const id of res.order) {
    const v = findServer(s, id)
    if (v) return v
  }
  return null
}

/** Long-lived connections pin a client to one backend (L4 LB, Kubernetes Service). */
function connectionTarget(s: TrafficState, r: Req, c: Client | null, pinAllowed: boolean, chooseNew: () => ServerState | null): ServerState | null {
  if (!c || !pinAllowed || s.cfg.clients.mode === 'perRequest') {
    const v = chooseNew()
    if (v) s.totals.connections++
    return v
  }
  const size = s.cfg.clients.mode === 'keepAlive' ? 1 : s.cfg.clients.poolSize
  while (c.conns.length < size) c.conns.push({ id: s.nextConnId++, server: null, openedAt: 0, requests: 0 })
  if (c.conns.length > size) c.conns.length = size
  const conn = c.conns[c.nextConn % size]
  c.nextConn = (c.nextConn + 1) % size
  r.conn = conn
  if (conn.server !== null) {
    const v = findServer(s, conn.server)
    if (v) {
      conn.requests++
      return v
    }
    conn.server = null
  }
  const v = chooseNew()
  if (v) {
    conn.server = v.id
    conn.openedAt = s.t
    conn.requests = 1
    s.totals.connections++
  }
  return v
}

function closeConn(conn: Conn | null) {
  if (conn) conn.server = null
}

/** The backend closed (RST/FIN) every connection pinned to it; clients reconnect on their next request. */
function closeConnsTo(s: TrafficState, id: string) {
  for (const c of s.clients) for (const k of c.conns) if (k.server === id) k.server = null
}

/** What the client sees when the backend refuses or resets the connection: only an L7 LB turns that into a 502. */
function connFailCode(s: TrafficState, path: Path): ErrCode {
  return path === 'lb' && s.cfg.layer === 'L7' ? 502 : 'refused'
}

/** The LB could not connect within its connect timeout: an L7 LB answers 504 (NGINX, AWS ALB); an L4 one drops the connection. */
function connectFailCode(s: TrafficState): ErrCode {
  return s.cfg.layer === 'L7' ? 504 : 'refused'
}

function pathOf(s: TrafficState): Path {
  return s.cfg.mode === 'lb' ? 'lb' : s.cfg.mode === 'service' ? 'service' : 'direct'
}

/**
 * Only an L7 load balancer writes HTTP responses, so only there a client timeout is filed as „504”. Elsewhere (direct,
 * dns, Service, an L4 balancer) the client simply gives up: no status code (errorLabel(504, mode, layer) agrees).
 */
function httpLb(s: TrafficState): boolean {
  return s.cfg.mode === 'lb' && s.cfg.layer === 'L7'
}

/** „502” / „odbijenom vezom” for event texts. */
function refusedWord(s: TrafficState): string {
  return connFailCode(s, pathOf(s)) === 502 ? 's 502' : 'odbijenom vezom'
}

function deliver(s: TrafficState, r: Req, v: ServerState, path: Path, fromLb: boolean): void {
  r.server = v.id
  r.tRouted = s.t
  r.attempts++
  v.routed++
  v.hits++
  const from: Place = fromLb ? 'lb' : 'client'
  const via = path === 'lb' && !fromLb ? 'lb' : null
  switch (v.proc) {
    case 'crashed':
    case 'starting':
    case 'exited':
      return refusedAt(s, r, v, path, from, via)
    case 'off':
    case 'booting':
      addFlight(s, r, 'in', from, v.id, via, 'waiting')
      if (path === 'lb') {
        // no RST from a machine that is off: the LB waits for its connect timeout
        r.connectUntil = s.t + s.cfg.connectTimeoutMs
        v.connecting.push(r)
      } else v.parked.push(r)
      return
    case 'hung':
      addFlight(s, r, 'in', from, v.id, via, 'waiting')
      v.parked.push(r)
      return
    default: {
      if (!v.accepting) return refusedAt(s, r, v, path, from, via)
      if (v.inflight.length < workersOf(s, v)) {
        r.tStart = s.t
        v.inflight.push(r)
        addFlight(s, r, 'in', from, v.id, via, 'ok')
      } else if (v.queue.length < s.cfg.queueMax) {
        v.queue.push(r)
        addFlight(s, r, 'in', from, v.id, via, 'ok')
      } else {
        addFlight(s, r, 'in', from, v.id, via, 503)
        fail(s, r, 503, 'queueFull', v, true)
        if (s.t - v.lastQueueFullLog > 4000) {
          v.lastQueueFullLog = s.t
          log(s, 'queueFull', `${display(v)}: svi radnici zauzeti i red pun – odbija zahtjeve (503).`, 'bad', v.id)
        }
      }
    }
  }
}

/** Nothing listens on the port: connection refused. Behind an L7 LB with retry on, try once more elsewhere. */
function refusedAt(s: TrafficState, r: Req, v: ServerState, path: Path, from: Place, via: 'lb' | null): void {
  if (path === 'lb' && (s.cfg.algo === 'lc' || s.cfg.algo === 'wlc' || s.cfg.algo === 'p2c') && lbInRotation(s, v)) {
    logEvery(
      s,
      `blackHole-${v.id}`,
      6000,
      'blackHole',
      `${display(v)} ima 0 aktivnih zahtjeva jer ih odmah odbija – ${s.cfg.algo === 'p2c' ? 'dva nasumična izbora' : 'najmanje veza'} mu zato šalje sve više prometa (crna rupa).`,
      'bad',
      v.id,
    )
  }
  if (path === 'lb' && canRetry(s, r)) {
    passiveFail(s, v, 502)
    const alt = chooseLb(s, s.clients[r.client] ?? null, v)
    if (alt) {
      s.totals.retried++
      addFlight(s, r, 'in', from, v.id, via, 502)
      bounceFlight(s, r, v, 502)
      logEvery(s, 'retry', 4000, 'retry', `${display(v)} odbija vezu – load balancer ponavlja zahtjev na drugom poslužitelju.`, 'info', v.id)
      return deliver(s, r, alt, 'lb', true)
    }
  }
  const code = connFailCode(s, path)
  addFlight(s, r, 'in', from, v.id, via, code)
  fail(s, r, code, 'refused', v, true)
}

function canRetry(s: TrafficState, r: Req): boolean {
  return s.cfg.retry && s.cfg.layer === 'L7' && r.attempts < 2 && s.lbUp
}

/** Reject before reaching any server (no backend, LB down, Service without endpoints): the dot dies where it was refused. */
function rejectAt(s: TrafficState, r: Req, code: ErrCode, reason: ErrReason, at: 'client' | 'lb' | 'service') {
  if (at !== 'client') addFlight(s, r, 'in', 'client', at, null, code)
  fail(s, r, code, reason, null, true)
}

/* ====================================================================== */
/* Outcomes                                                                */
/* ====================================================================== */

function findServer(s: TrafficState, id: string | null): ServerState | undefined {
  if (id === null) return undefined
  for (const v of s.servers) if (v.id === id) return v
  return undefined
}

/** Count a failure. `leaves` = the request leaves the server (false for an in-flight timeout: the radnik keeps working). */
function fail(s: TrafficState, r: Req, code: ErrCode, reason: ErrReason, v: ServerState | null | undefined, leaves: boolean) {
  if (r.done) {
    if (leaves) depart(s, r)
    return
  }
  r.done = true
  const t = s.t
  s.errs.push({ t, code, reason, server: v ? v.id : null, client: r.client })
  if (code === 502) s.totals.e502++
  else if (code === 503) s.totals.e503++
  else if (code === 504) s.totals.e504++
  else s.totals.refused++
  if (v) v.errTotals[code]++
  const c = r.client >= 0 ? s.clients[r.client] : undefined
  if (c && c.id === r.client) {
    c.failed++
    if (c.firstErrorAt === null) c.firstErrorAt = t
    c.lastErrorAt = t
  }
  for (const inc of s.incidents) {
    if (inc.closed) continue
    if (!inc.after30s.done) inc.after30s.failed++
    if (v && inc.server === v.id) {
      inc.failedTotal++
      if (inc.detectedAt === null || r.tRouted < inc.detectedAt) inc.failedBeforeDetection++
    }
  }
  // Only connection-level failures count against the server. A client that gives up after 5 s is not a failed
  // attempt for the LB (NGINX logs 499 and frees the peer without marking it failed; its own read timeout is 60 s).
  if (v && PASSIVE_REASONS.has(reason)) passiveFail(s, v, code)
  if (reason === 'timeout' && v) {
    const what = httpLb(s) ? '504' : 'isteklo vrijeme'
    const after = fmtDuration(s.cfg.clientTimeoutMs)
    if (v.proc === 'up') {
      logEvery(s, 'timeout', 5000, 'timeout', `${display(v)}: klijenti odustaju nakon ${after} (${what}) – radnici i dalje rade za njih (uzaludan posao).`, 'warn', v.id)
    } else {
      logEvery(s, `timeoutStuck-${v.id}`, 5000, 'timeout', `${display(v)} ne odgovara – klijenti odustaju nakon ${after} (${what}).`, 'bad', v.id)
    }
    if (s.cfg.mode === 'service' && r.conn && r.conn.server !== null && s.cfg.clients.mode !== 'perRequest') {
      logEvery(s, 'timeoutRedial', 8000, 'timeout', 'Veza je zatvorena nakon isteka vremena – nova veza ide nasumičnom Podu.', 'info')
    }
  }
  // an HTTP error response (503 queue full) keeps a keep-alive connection open; connection-level failures close it
  if (reason !== 'queueFull') closeConn(r.conn)
  recordDone(s, r, code, reason)
  if (leaves) depart(s, r)
}

function succeed(s: TrafficState, r: Req, v: ServerState, lat: number) {
  r.done = true
  const t = s.t
  s.totals.ok++
  s.oks.push({ t, lat })
  s.okHistory.push({ t, lat })
  if (s.okHistory.length > OK_HISTORY_MAX) s.okHistory.splice(0, s.okHistory.length - OK_HISTORY_MAX)
  v.okTimes.push(t)
  for (const inc of s.incidents) if (!inc.closed && !inc.after30s.done) inc.after30s.ok++
  sessionOnSuccess(s, r, v)
  addFlight(s, r, 'out', v.id, 'client', s.cfg.mode === 'lb' ? 'lb' : null, 'ok')
  recordDone(s, r, 'ok', null)
  depart(s, r)
}

/** Trace record of a finished request (state.recent, capped). */
function recordDone(s: TrafficState, r: Req, outcome: 'ok' | ErrCode, reason: ErrReason | null) {
  const tEnd = s.t + DT_MS
  const start = r.tStart >= 0 ? r.tStart : -1
  const cpuDone = r.tCpuDone >= 0 ? r.tCpuDone : start
  s.recent.push({
    id: r.id,
    client: r.client,
    server: r.server,
    t0: r.t0,
    tEnd,
    queueMs: start >= 0 ? start - r.t0 : tEnd - r.t0,
    cpuMs: start >= 0 ? Math.max(0, (cpuDone >= 0 ? Math.min(cpuDone, tEnd) : tEnd) - start) : 0,
    ioMs: start >= 0 && cpuDone >= 0 ? Math.max(0, tEnd - cpuDone) : 0,
    attempts: r.attempts,
    outcome,
    reason,
  })
  if (s.recent.length > RECENT_MAX) s.recent.shift()
}

function depart(s: TrafficState, r: Req) {
  s.departures.push({ t: s.t, sojourn: s.t + DT_MS - r.t0 })
}

/**
 * Passive check (NGINX max_fails=1 fail_timeout=10s): a failed connection attempt (refused, reset, connect timeout)
 * ejects the server for ejectMs. Client timeouts never count (see fail()).
 */
function passiveFail(s: TrafficState, v: ServerState, code: ErrCode) {
  if (s.cfg.mode !== 'lb' || !s.cfg.passive.enabled || s.t < v.ejectedUntil) return
  v.ejectedUntil = s.t + s.cfg.passive.ejectMs
  log(s, 'ejected', `${display(v)}: pasivna provjera – ${code === 'refused' ? 'odbijena veza' : `greška ${code}`}, load balancer ga izbacuje na ${fmtDuration(s.cfg.passive.ejectMs)}.`, 'warn', v.id)
}

/** Requests inside a server whose client is still waiting. */
function insideCount(v: ServerState): number {
  let n = 0
  for (const list of [v.inflight, v.queue, v.parked, v.connecting]) for (const r of list) if (!r.done && !r.gaveUp) n++
  return n
}

/** Fail every request still inside a server (crash, OOM, restart, removal). Returns how many clients saw an error. */
function dropAll(s: TrafficState, v: ServerState, reason: ErrReason): number {
  const code = connFailCode(s, pathOf(s))
  let lost = 0
  for (const list of [v.inflight, v.queue, v.parked, v.connecting]) {
    for (const r of list) {
      if (!r.done && !r.gaveUp) {
        lost++
        addFlight(s, r, 'out', v.id, 'client', s.cfg.mode === 'lb' ? 'lb' : null, code)
      }
      fail(s, r, code, reason, v, true)
    }
    list.length = 0
  }
  return lost
}

/* ---------- Sessions (L05) ---------- */

function sessionOnSuccess(s: TrafficState, r: Req, v: ServerState) {
  if (!s.cfg.sessions.enabled) return
  const c = s.clients[r.client]
  if (!c) return
  const ss = c.session
  const store = s.cfg.sessions.store
  const perServer = store === 'local' || store === 'machine'
  const available = perServer ? ss.home === v.id : s.redisUp && ss.home === 'redis'
  if (available) {
    ss.cart++
    return
  }
  const hadSession = ss.home !== null || ss.wiped
  if (hadSession && !ss.loggedOut) {
    ss.lost++
    s.totals.sessionLost++
    s.sessionLostPending++
    for (const inc of s.incidents) if (!inc.closed) inc.sessionsLost++
    flushSessionLog(s)
  }
  if (perServer || s.redisUp) {
    ss.home = perServer ? v.id : 'redis'
    ss.cart = 1
    ss.wiped = false
    ss.loggedOut = false
  } else {
    ss.home = null
    ss.cart = 0
    ss.wiped = false
    ss.loggedOut = true
  }
}

/** One summary line per 5 s instead of one line per lost session (keeps crash / probe events visible). */
function flushSessionLog(s: TrafficState) {
  if (s.sessionLostPending === 0 || s.t - s.lastSessionLog < 5000) return
  log(
    s,
    'sessionLost',
    `Sesije izgubljene u zadnjih 5 s: ${s.sessionLostPending} (ukupno ${s.totals.sessionLost}) – ti su korisnici odjavljeni, košarice su prazne.`,
    'bad',
  )
  s.sessionLostPending = 0
  s.lastSessionLog = s.t
}

/**
 * Sessions stored at `id` disappear. what = 'process' (crash, OOM, restart, exit) wipes only the 'local' store;
 * 'machine' (power off, removal, resize) also wipes the per-machine store. Redis passes its own id.
 */
function wipeSessions(s: TrafficState, id: string, what: 'process' | 'machine' = 'process') {
  if (what === 'process' && s.cfg.sessions.store === 'machine' && id !== 'redis') return
  for (const c of s.clients) {
    if (c.session.home === id) {
      c.session.home = null
      c.session.wiped = true
    }
  }
}

/* ====================================================================== */
/* Servers                                                                 */
/* ====================================================================== */

/** Worker pool size W (Infinity with the "unbounded workers" misconfiguration). */
export function workersOf(s: TrafficState, v: ServerState): number {
  return s.cfg.unboundedWorkers ? Infinity : workersFor(v.ramGB, WORKLOADS[s.cfg.workload].memMB)
}

/**
 * Radnici holding RAM. A bounded pool never holds more than W: after setServerSize() shrinks the RAM, the requests
 * already in progress finish (they do not cause an OOM). Only unbounded workers or a leak can run out of memory.
 */
function residentWorkers(s: TrafficState, v: ServerState): number {
  const n = v.inflight.length
  return s.cfg.unboundedWorkers ? n : Math.min(n, workersOf(s, v))
}

/** RAM in use: OS + runtime + leak + one worker per request in progress (bounded by W, see residentWorkers). */
export function ramUsedMB(s: TrafficState, v: ServerState): number {
  switch (v.proc) {
    case 'up':
    case 'hung':
      return BASE_RAM_MB + v.leakMB + residentWorkers(s, v) * WORKLOADS[s.cfg.workload].memMB
    case 'starting':
      return BASE_RAM_MB
    default:
      return 0
  }
}

function processServer(s: TrafficState, v: ServerState, t: number) {
  let busyNow = 0
  if (v.proc === 'up') busyNow = processUp(s, v, t)
  else if (v.proc === 'hung' || v.proc === 'off' || v.proc === 'booting') expireStuck(s, v, t)
  if (v.draining || v.drained) updateDrain(s, v)
  v.busySum += busyNow - v.busy[v.busyIdx]
  v.busy[v.busyIdx] = busyNow
  v.busyIdx = (v.busyIdx + 1) % CPU_WINDOW_TICKS
  v.busyCoreMsTotal += busyNow * DT_MS
  v.cpuShown += (cpuOf(v) - v.cpuShown) * CPU_EMA
  while (v.okTimes.length && v.okTimes[0] <= t - 5000) v.okTimes.shift()
}

/** CPU utilisation over the last 1 s, 0..1. */
export function cpuOf(v: ServerState): number {
  return v.vcpu > 0 ? v.busySum / (CPU_WINDOW_TICKS * v.vcpu) : 0
}

function processUp(s: TrafficState, v: ServerState, t: number): number {
  const wl = WORKLOADS[s.cfg.workload]
  const timeout = s.cfg.clientTimeoutMs
  if (v.leakMBps > 0) v.leakMB += (v.leakMBps * DT_MS) / 1000
  // Out of memory: only with the unbounded-workers misconfiguration or a leak (never in the default mode)
  if (BASE_RAM_MB + v.leakMB + residentWorkers(s, v) * wl.memMB > v.ramGB * 1024) {
    oom(s, v)
    return 0
  }
  // queued requests whose client already left
  for (let i = v.queue.length - 1; i >= 0; i--) {
    const r = v.queue[i]
    if (t - r.t0 > timeout) {
      v.queue.splice(i, 1)
      addFlight(s, r, 'out', v.id, 'client', s.cfg.mode === 'lb' ? 'lb' : null, 504)
      fail(s, r, 504, 'timeout', v, true)
    }
  }
  let nCpu = 0
  for (const r of v.inflight) {
    if (!r.gaveUp && t - r.t0 > timeout) {
      // the client gave up; the radnik does not know and keeps working (wasted work)
      r.gaveUp = true
      addFlight(s, r, 'out', v.id, 'client', s.cfg.mode === 'lb' ? 'lb' : null, 504)
      fail(s, r, 504, 'timeout', v, false)
    }
    if (r.cpuLeft > 0) nCpu++
  }
  // a request never uses more than one core
  const share = nCpu > 0 ? Math.min(1, v.vcpu / nCpu) : 0
  const cpuStep = v.slowFactor === 1 ? DT_MS * share : (DT_MS * share) / v.slowFactor
  let doneAny = false
  for (const r of v.inflight) {
    if (r.cpuLeft > 0) {
      r.cpuLeft -= cpuStep
      if (r.cpuLeft <= 0) r.tCpuDone = t + DT_MS
    } else r.ioLeft -= DT_MS
    if (r.cpuLeft <= 0 && r.ioLeft <= 0) doneAny = true
  }
  if (doneAny) {
    const keep: Req[] = []
    const a = s.cfg.ewmaAlpha
    for (const r of v.inflight) {
      if (r.cpuLeft <= 0 && r.ioLeft <= 0) {
        const lat = t + DT_MS - r.t0
        v.ewmaMs = (1 - a) * v.ewmaMs + a * lat
        v.handled++
        if (r.gaveUp) {
          s.totals.wasted++
          depart(s, r)
        } else if (lat > timeout) {
          s.totals.wasted++
          addFlight(s, r, 'out', v.id, 'client', s.cfg.mode === 'lb' ? 'lb' : null, 504)
          fail(s, r, 504, 'timeout', v, true)
        } else succeed(s, r, v, lat)
      } else keep.push(r)
    }
    v.inflight = keep
  }
  const W = workersOf(s, v)
  while (v.inflight.length < W && v.queue.length > 0) {
    const r = v.queue.shift()!
    r.tStart = t + DT_MS
    v.inflight.push(r)
  }
  // graceful shutdown finished: everything answered
  if (!v.accepting && v.inflight.length === 0 && v.queue.length === 0) exitProcess(s, v, 'dovršio je započete zahtjeve i izašao.')
  return Math.min(nCpu, v.vcpu)
}

/** Is any client connection still pinned to v (L4 keep-alive / pool, Service)? */
function pinnedTo(s: TrafficState, id: string): boolean {
  for (const c of s.clients) for (const k of c.conns) if (k.server === id) return true
  return false
}

/**
 * Drain state, recomputed every tick: „sigurno za uklanjanje” only while nothing is in progress AND no client
 * connection is pinned to the server (with L4 keep-alive those connections still carry new requests until the
 * deregistration delay closes them).
 */
function updateDrain(s: TrafficState, v: ServerState) {
  if (!v.draining) {
    v.drained = false
    return
  }
  if (!v.deregistered && s.t >= v.drainStartedAt + s.cfg.lifecycle.deregistrationDelayMs) {
    v.deregistered = true
    if (pinnedTo(s, v.id)) {
      closeConnsTo(s, v.id)
      log(
        s,
        'deregister',
        `${display(v)}: isteklo je kašnjenje odjave (${simRealLabel(TIMING.deregistrationDelay, s.cfg.lifecycle.deregistrationDelayMs)}) – load balancer zatvara preostale veze.`,
        'info',
        v.id,
      )
    }
  }
  const now = activeOf(v) === 0 && !pinnedTo(s, v.id)
  if (now && !v.drained) log(s, 'drained', `${display(v)}: nema zahtjeva u obradi ni otvorenih veza – sigurno za uklanjanje.`, 'ok', v.id)
  v.drained = now
}

/** Hung process or machine off: nothing progresses; every client gives up at its timeout. */
function expireStuck(s: TrafficState, v: ServerState, t: number) {
  const timeout = s.cfg.clientTimeoutMs
  for (const list of [v.parked, v.queue, v.inflight]) {
    for (let i = list.length - 1; i >= 0; i--) {
      const r = list[i]
      if (t - r.t0 > timeout) {
        list.splice(i, 1)
        if (!r.done) addFlight(s, r, 'out', v.id, 'client', s.cfg.mode === 'lb' ? 'lb' : null, 504)
        fail(s, r, 504, 'timeout', v, true)
      }
    }
  }
}

function oom(s: TrafficState, v: ServerState) {
  openIncident(s, v, 'oom')
  const delay = restartDelayFor(s, v)
  log(
    s,
    'oom',
    s.cfg.mode === 'service'
      ? `${display(v)}: OOMKilled – nestalo je RAM-a, kontejner je ubijen (izgubljeno zahtjeva: ${insideCount(v)}). ${restartText(delay)}`
      : `${display(v)}: nestalo je RAM-a (OOM) – proces je ubijen, izgubljeno zahtjeva: ${insideCount(v)}. Ponovno pokretanje za ${fmtDuration(delay)}.`,
    'bad',
    v.id,
  )
  dropAll(s, v, 'reset')
  v.proc = 'crashed'
  v.crashedAt = s.t
  v.procUntil = s.t + delay
  v.ooms++
  s.totals.ooms++
  v.leakMB = 0
  wipeSessions(s, v.id)
  closeConnsTo(s, v.id)
  if (s.cfg.mode === 'service') setServing(s, v, false, 'crash')
}

/**
 * Restart delay after a crash or OOM. Classic servers: the process supervisor's lifecycle.restartDelayMs.
 * Service mode: the kubelet's CrashLoopBackOff – 1st restart at once, then 10 s, 20 s, 40 s … 300 s; reset after
 * 10 min without a crash (mirrors E3 and flowcontrol.Backoff + doBackOff).
 */
function restartDelayFor(s: TrafficState, v: ServerState): number {
  if (s.cfg.mode !== 'service') return s.cfg.lifecycle.restartDelayMs
  const b = v.crashBackoff
  if (b && s.t - b.lastUpdate <= TIMING.crashBackoffReset.sim) return b.delay
  return 0
}

/**
 * The back-off uses the kubelet's real values (sim = real), so no „(sim) · stvarno” badge: the 2nd delay really is 20 s.
 * (simRealLabel(crashBackoffInitial, 20 s) would wrongly print „20 s (sim) · stvarno: 10 s”.)
 */
function restartText(delay: number): string {
  if (delay <= 0) return 'kubelet ga odmah ponovno pokreće.'
  return `CrashLoopBackOff: kubelet ga ponovno pokreće za ${fmtDuration(delay)} (odgoda se udvostručuje, najviše ${fmtDuration(TIMING.crashBackoffMax.sim)}).`
}

/** kubelet Backoff.Next(): the delay doubles with every restart inside the reset window. */
function nextBackoff(s: TrafficState, v: ServerState) {
  const b = v.crashBackoff
  const finished = v.crashedAt >= 0 ? v.crashedAt : s.t
  if (!b || finished - b.lastUpdate > TIMING.crashBackoffReset.sim) v.crashBackoff = { delay: TIMING.crashBackoffInitial.sim, lastUpdate: s.t }
  else v.crashBackoff = { delay: Math.min(b.delay * 2, TIMING.crashBackoffMax.sim), lastUpdate: s.t }
}

/** Requests waiting outside a server: manual-mode queue at the LB, LB connects to machines that are off. */
function waitTimers(s: TrafficState, t: number) {
  const timeout = s.cfg.clientTimeoutMs
  while (s.pending.length && t - s.pending[0].t0 > timeout) {
    const r = s.pending.shift()!
    addFlight(s, r, 'out', 'lb', 'client', null, 504)
    fail(s, r, 504, 'manualTimeout', null, true)
    logEvery(s, 'manualTimeout', 4000, 'manual', `Zahtjev je čekao na load balanceru dulje od ${fmtDuration(timeout)} – klijent je odustao${httpLb(s) ? ' (504)' : ''}.`, 'warn')
  }
  for (const v of s.servers) {
    for (let i = v.connecting.length - 1; i >= 0; i--) {
      const r = v.connecting[i]
      if (r.done) {
        if (t - r.t0 > timeout || t >= r.connectUntil) {
          v.connecting.splice(i, 1)
          depart(s, r)
        }
      } else if (t - r.t0 > timeout) {
        v.connecting.splice(i, 1)
        addFlight(s, r, 'out', 'lb', 'client', null, 504)
        fail(s, r, 504, 'timeout', v, true)
      } else if (t >= r.connectUntil) {
        v.connecting.splice(i, 1)
        const code = connectFailCode(s)
        if (canRetry(s, r)) {
          passiveFail(s, v, code)
          const alt = chooseLb(s, s.clients[r.client] ?? null, v)
          if (alt) {
            s.totals.retried++
            bounceFlight(s, r, v, code)
            deliver(s, r, alt, 'lb', true)
            continue
          }
        }
        addFlight(s, r, 'out', 'lb', 'client', null, code)
        fail(s, r, code, 'connectTimeout', v, true)
        logEvery(
          s,
          `connectTimeout-${v.id}`,
          5000,
          'off',
          `${display(v)} ne odgovara na spajanje – nakon ${simRealLabel(TIMING.connectTimeout, s.cfg.connectTimeoutMs)} load balancer vraća ${code === 504 ? '504 Gateway Timeout' : 'zatvorenu vezu'}.`,
          'bad',
          v.id,
        )
      }
    }
  }
}

/* ====================================================================== */
/* Lifecycle                                                               */
/* ====================================================================== */

function startProcess(s: TrafficState, v: ServerState) {
  v.proc = 'starting'
  v.procUntil = s.t + s.cfg.lifecycle.warmupMs
  v.accepting = true
  v.restarts++
}

function lifecycle(s: TrafficState, t: number) {
  for (const v of s.servers) {
    if (v.procUntil >= 0 && t >= v.procUntil) {
      switch (v.proc) {
        case 'crashed':
          if (s.cfg.mode === 'service') {
            nextBackoff(s, v)
            startProcess(s, v)
            log(s, 'restart', `${display(v)}: kubelet ponovno pokreće kontejner (${v.restarts}. ponovno pokretanje, zagrijavanje ${fmtDuration(s.cfg.lifecycle.warmupMs)}).`, 'info', v.id)
          } else {
            startProcess(s, v)
            log(s, 'restart', `${display(v)}: nadzornik procesa ponovno ga pokreće (zagrijavanje ${fmtDuration(s.cfg.lifecycle.warmupMs)}).`, 'info', v.id)
          }
          break
        case 'off':
        case 'booting':
          // a rebooted machine has forgotten every old connection
          dropAll(s, v, 'reset')
          startProcess(s, v)
          break
        case 'starting':
          v.proc = 'up'
          v.procUntil = -1
          log(
            s,
            'up',
            s.cfg.mode === 'lb' && s.cfg.healthCheck.enabled && !v.healthy
              ? `${display(v)}: proces radi; promet dobiva nakon ${passesText(s.cfg.healthCheck.healthyThreshold)} zaredom.`
              : s.cfg.mode === 'service'
                ? `${display(v)}: kontejner radi; čeka uspješnu provjeru spremnosti.`
                : `${display(v)}: proces radi.`,
            'ok',
            v.id,
          )
          break
        default:
          v.procUntil = -1
      }
    }
    if (v.ejectedUntil > 0 && t >= v.ejectedUntil && t - DT_MS < v.ejectedUntil && s.cfg.passive.enabled) {
      log(s, 'ejectEnd', `${display(v)}: isteklo je pasivno izbacivanje – load balancer mu ponovno šalje promet.`, 'info', v.id)
    }
  }
  if (s.burstLogged && t >= s.burstUntil) {
    s.burstLogged = false
    log(s, 'burstEnd', 'Nalet je završio – promet je opet uobičajen.', 'info')
  }
}

/** „2 uspješne provjere”, „5 uspješnih provjera” */
function passesText(n: number): string {
  return plural(n, ['uspješne provjere', 'uspješne provjere', 'uspješnih provjera'])
}

/* ====================================================================== */
/* Health checks (lb) and readiness probes (service)                       */
/* ====================================================================== */

type ProbeOutcome = 'pass' | 'fail' | 'timeout'

function probeOutcome(s: TrafficState, v: ServerState, readiness: boolean): ProbeOutcome {
  switch (v.proc) {
    case 'up': {
      if (!v.accepting) return 'fail'
      if (readiness && v.forcedUnready) return 'fail'
      if (!readiness && s.cfg.healthCheck.probeQueues && estimatedWaitMs(s, v) > s.cfg.healthCheck.timeoutMs) return 'timeout'
      return 'pass'
    }
    case 'hung':
    case 'off':
    case 'booting':
      return 'timeout'
    default:
      return 'fail'
  }
}

/** Rough wait for a probe that has to queue behind requests: (queued + 1) · mean service time / W. */
export function estimatedWaitMs(s: TrafficState, v: ServerState): number {
  const W = workersOf(s, v)
  if (v.inflight.length < W) return 0
  const wl = WORKLOADS[s.cfg.workload]
  const service = wl.cpuMs * v.slowFactor * Math.max(1, v.inflight.length / Math.max(v.vcpu, 0.1)) + wl.ioMs
  return ((v.queue.length + 1) * service) / (Number.isFinite(W) ? W : Math.max(1, v.inflight.length))
}

function probes(s: TrafficState, t: number) {
  const service = s.cfg.mode === 'service'
  if (!service && !(s.cfg.mode === 'lb' && s.cfg.healthCheck.enabled)) return
  const interval = probeInterval(s)
  const timeout = service ? s.cfg.service.readiness.timeoutMs : s.cfg.healthCheck.timeoutMs
  for (const v of s.servers) {
    if (v.probeDueAt >= 0 && t >= v.probeDueAt) {
      v.probeDueAt = -1
      probeResult(s, v, false, service)
    }
    if (t >= v.nextProbe) {
      v.nextProbe += interval
      if (v.nextProbe <= t) v.nextProbe = t + interval
      const o = probeOutcome(s, v, service)
      recordProbe(v, { t, at: o === 'timeout' ? t + timeout : t, outcome: o })
      if (o === 'timeout') {
        if (v.probeDueAt < 0) v.probeDueAt = t + timeout
      } else probeResult(s, v, o === 'pass', service)
    }
  }
}

function recordProbe(v: ServerState, p: ProbeRecord) {
  v.probes.push(p)
  if (v.probes.length > PROBE_HISTORY) v.probes.shift()
}

/** Probe phase of server i (staggered: i·interval/N; otherwise 0). */
function probePhase(s: TrafficState, index: number, count: number, interval: number): number {
  return s.cfg.healthCheck.stagger ? roundToTick((index * interval) / Math.max(1, count)) % interval : 0
}

/** After an interval change the next probe follows the new interval at once (not after the old, longer one). */
function rescheduleProbes(s: TrafficState) {
  const interval = probeInterval(s)
  const n = s.servers.length
  s.servers.forEach((v, i) => {
    let next = s.t + probePhase(s, i, n, interval)
    if (next <= s.t) next = s.t + DT_MS
    if (next < v.nextProbe) v.nextProbe = next
  })
}

function probeResult(s: TrafficState, v: ServerState, pass: boolean, readiness: boolean) {
  if (readiness) {
    const r = s.cfg.service.readiness
    if (pass) {
      v.hcFails = 0
      v.hcOks++
      if (!v.serving && v.hcOks >= r.successThreshold && !v.terminating) setServing(s, v, true)
    } else {
      v.hcOks = 0
      v.hcFails++
      if (v.serving && v.hcFails >= r.failureThreshold) setServing(s, v, false)
    }
    return
  }
  const hc = s.cfg.healthCheck
  if (pass) {
    v.hcFails = 0
    v.hcOks++
    if (!v.healthy && v.hcOks >= hc.healthyThreshold) {
      const back = v.everHealthy
      v.healthy = true
      v.everHealthy = true
      log(s, 'healthy', `${display(v)}: ${hc.healthyThreshold}. uspješna provjera ispravnosti zaredom – ${back ? 'vraćen' : 'uključen'} u rotaciju.`, 'ok', v.id)
    }
  } else {
    v.hcOks = 0
    v.hcFails++
    if (v.healthy && v.hcFails >= hc.unhealthyThreshold) {
      v.healthy = false
      log(s, 'unhealthy', `${display(v)}: ${hc.unhealthyThreshold}. neuspjela provjera ispravnosti zaredom – izbačen iz rotacije.`, 'warn', v.id)
    } else if (v.healthy) {
      log(s, 'probeFail', `${display(v)}: provjera ispravnosti neuspjela (${v.hcFails}/${hc.unhealthyThreshold}) – i dalje prima promet.`, 'warn', v.id)
    }
  }
}

/* ---------- Service endpoints ---------- */

/**
 * Readiness as the kubelet reports it. `why` picks honest wording: a failing readiness probe never restarts anything,
 * a crashed container is restarted by the kubelet, a restart starts not-ready.
 */
function setServing(s: TrafficState, v: ServerState, serving: boolean, why: 'probe' | 'crash' | 'restart' = 'probe') {
  if (v.serving === serving) return
  v.serving = serving
  pushEndpoint(s, v)
  const lag = fmtDuration(s.cfg.service.propagationMs)
  const text = serving
    ? `${display(v)}: spreman (ready: true) – EndpointSlice se ažurira, kube-proxy za ${lag}.`
    : why === 'probe'
      ? `${display(v)}: provjera spremnosti ne prolazi – nije spreman (ready: false), bez ponovnog pokretanja; kube-proxy ga uklanja za ${lag}.`
      : why === 'crash'
        ? `${display(v)}: kontejner ne radi – Pod nije spreman (ready: false); kube-proxy ga uklanja za ${lag}.`
        : `${display(v)}: kontejner se ponovno pokreće – nije spreman (ready: false) dok ne prođe provjeru spremnosti.`
  log(s, 'endpoint', text, serving ? 'ok' : 'warn', v.id)
}

function pushEndpoint(s: TrafficState, v: ServerState) {
  v.epQueue.push({ at: s.t + s.cfg.service.propagationMs, ready: v.serving && !v.terminating, serving: v.serving, terminating: v.terminating, inSlice: v.inSlice })
}

function propagateEndpoints(s: TrafficState, t: number) {
  for (const v of s.servers) {
    while (v.epQueue.length && v.epQueue[0].at <= t) {
      const u = v.epQueue.shift()!
      const was = v.kpReady && v.kpInSlice
      const wasInSlice = v.kpInSlice
      v.kpReady = u.ready
      v.kpServing = u.serving
      v.kpTerminating = u.terminating
      v.kpInSlice = u.inSlice
      if (wasInSlice !== u.inSlice) {
        log(
          s,
          'selector',
          u.inSlice ? `kube-proxy: ${display(v)} je ponovno u EndpointSliceu.` : `kube-proxy: ${display(v)} više nije u EndpointSliceu – ne prima nove veze.`,
          u.inSlice ? 'info' : 'neutral',
          v.id,
        )
      } else if (was !== (u.ready && u.inSlice)) {
        log(
          s,
          'endpoint',
          u.ready ? `kube-proxy: ${display(v)} prima nove veze.` : `kube-proxy: ${display(v)} više ne prima nove veze${u.terminating ? ' (gasi se)' : ''}.`,
          u.ready ? 'info' : 'neutral',
          v.id,
        )
      }
    }
  }
}

function terminationTimers(s: TrafficState, t: number) {
  for (const v of s.servers) {
    const term = v.termination
    if (!term || v.proc === 'exited') continue
    if (!term.sigtermSent && t >= term.sigtermAt) {
      term.sigtermSent = true
      const how = s.cfg.service.sigterm
      if (how === 'immediate') {
        exitProcess(s, v, 'SIGTERM – aplikacija odmah izlazi, zahtjevi u obradi su prekinuti.')
      } else if (how === 'graceful') {
        v.accepting = false
        closeConnsTo(s, v.id)
        log(s, 'sigterm', `${display(v)}: SIGTERM – više ne prima nove veze, dovršava započete zahtjeve.`, 'info', v.id)
      } else {
        log(s, 'sigterm', `${display(v)}: SIGTERM – aplikacija ga ignorira i radi dalje.`, 'warn', v.id)
      }
    }
    if (!isExited(v) && t >= term.killAt) {
      const lost = dropAll(s, v, 'reset')
      v.proc = 'exited'
      v.accepting = false
      closeConnsTo(s, v.id)
      log(s, 'sigkill', `${display(v)}: isteklo je ${fmtDuration(s.cfg.service.terminationGraceS * 1000)} – SIGKILL, prekinuto zahtjeva: ${lost}.`, 'bad', v.id)
    }
  }
}

function isExited(v: ServerState): boolean {
  return v.proc === 'exited'
}

function exitProcess(s: TrafficState, v: ServerState, why: string) {
  const lost = dropAll(s, v, 'reset')
  v.proc = 'exited'
  v.procUntil = -1
  v.accepting = false
  closeConnsTo(s, v.id)
  wipeSessions(s, v.id)
  if (s.cfg.mode === 'service' && v.serving) {
    v.serving = false
    pushEndpoint(s, v)
  }
  log(s, 'exit', `${display(v)}: ${why}${lost ? ` Prekinuto zahtjeva: ${lost}.` : ''}`, lost ? 'warn' : 'info', v.id)
}

/** A terminated Pod disappears once its container exited and kube-proxy stopped routing to it. */
function removeExited(s: TrafficState) {
  for (let i = s.servers.length - 1; i >= 0; i--) {
    const v = s.servers[i]
    if (v.proc === 'exited' && v.termination && !v.kpReady && v.epQueue.length === 0) {
      s.servers.splice(i, 1)
      log(s, 'remove', `${display(v)}: Pod je uklonjen.`, 'neutral', v.id)
    }
  }
}

/* ====================================================================== */
/* Incidents                                                               */
/* ====================================================================== */

function openIncident(s: TrafficState, v: ServerState, kind: IncidentKind) {
  // a new failure of the same server supersedes the previous incident (no double counting)
  for (const inc of s.incidents) if (!inc.closed && inc.server === v.id) inc.closed = true
  s.incidents.push({
    id: s.nextIncidentId++,
    server: v.id,
    kind,
    t0: s.t,
    detectedAt: null,
    failedBeforeDetection: 0,
    failedTotal: 0,
    sessionsLost: 0,
    after30s: { ok: 0, failed: 0, done: false },
    closed: false,
  })
  while (s.incidents.length > 20) s.incidents.shift()
}

/** Does the routing layer still send new requests to v? */
export function routable(s: TrafficState, v: ServerState): boolean {
  switch (s.cfg.mode) {
    case 'lb':
      return lbInRotation(s, v)
    case 'service':
      return v.kpInSlice && v.kpReady
    case 'dns':
      return v.inDns
    default:
      return true
  }
}

function updateIncidents(s: TrafficState, t: number) {
  for (const inc of s.incidents) {
    if (inc.closed) continue
    const v = findServer(s, inc.server)
    if (inc.detectedAt === null && (s.cfg.mode === 'lb' || s.cfg.mode === 'service') && (!v || !routable(s, v))) inc.detectedAt = t
    if (!inc.after30s.done && t >= inc.t0 + 30_000) inc.after30s.done = true
    const detects = s.cfg.mode === 'lb' || s.cfg.mode === 'service'
    const recovered = !!v && v.proc === 'up' && routable(s, v) && (!detects || inc.detectedAt !== null)
    if (inc.after30s.done && (!v || t >= inc.t0 + 120_000 || recovered)) inc.closed = true
  }
}

/* ====================================================================== */
/* Bookkeeping, events, flights                                            */
/* ====================================================================== */

function bookkeeping(s: TrafficState, t: number) {
  while (s.oks.length && s.oks[0].t <= t - LATENCY_WINDOW_MS) s.oks.shift()
  while (s.errs.length && s.errs[0].t <= t - ERROR_WINDOW_MS) s.errs.shift()
  while (s.departures.length && s.departures[0].t <= t - 10_000) s.departures.shift()
  let inSys = s.pending.length
  for (const v of s.servers) inSys += activeOf(v)
  s.littleSum += inSys - s.littleRing[s.littleIdx]
  s.littleRing[s.littleIdx] = inSys
  s.littleIdx = (s.littleIdx + 1) % LITTLE_TICKS
  if (s.flights.length) {
    let k = 0
    for (const f of s.flights) if (t - f.t0 <= f.durationMs) s.flights[k++] = f
    s.flights.length = k
  }
  flushSessionLog(s)
  s.sampleAcc += DT_MS
  if (s.sampleAcc >= SERIES_EVERY_MS) {
    s.sampleAcc = 0
    // same 5 s window as metrics().goodput, so the chart and the stat next to it agree
    let okW = 0
    let errW = 0
    for (let i = s.oks.length - 1; i >= 0 && s.oks[i].t > t - GOODPUT_WINDOW_MS; i--) okW++
    for (let i = s.errs.length - 1; i >= 0 && s.errs[i].t > t - GOODPUT_WINDOW_MS; i--) errW++
    const span = Math.min(GOODPUT_WINDOW_MS / 1000, Math.max(0.5, t / 1000))
    s.series.offered.push(s.offeredNow)
    s.series.goodput.push(okW / span)
    s.series.errors.push(errW / span)
    s.series.p95.push(p95Now(s))
    for (const v of s.servers) {
      v.cpuSeries.push(cpuOf(v))
      v.queueSeries.push(v.queue.length)
    }
  }
}

/** p95 of the last 10 s of successes; NaN („n/a”) below MIN_PERCENTILE_SAMPLES – never 0 for „no data”. */
function p95Now(s: TrafficState): number {
  if (s.oks.length < MIN_PERCENTILE_SAMPLES) return NaN
  const lats = s.oks.map((o) => o.lat).sort((a, b) => a - b)
  return lats[Math.min(lats.length - 1, Math.ceil(0.95 * lats.length) - 1)]
}

/**
 * Visual dot for a request. Constant speed: one hop (client↔LB, LB↔server, client→Service VIP) takes flightMs/2;
 * client↔server (direct or through the LB) takes flightMs. A dot that does not start at the client leaves only when
 * the request's previous dot has arrived (r.visualArrive), so a retry leaves the LB after the failed attempt bounced back.
 */
function addFlight(s: TrafficState, r: Req, dir: 'in' | 'out', from: Place, to: Place, via: 'lb' | null, outcome: Flight['outcome'], bounce = false) {
  if (!s.cfg.visual.flights || s.cfg.visual.maxFlights === 0) return
  const full = s.cfg.visual.flightMs
  const oneHop = from === 'lb' || to === 'lb' || to === 'service'
  const d = oneHop && via === null ? full / 2 : full
  const t0 = dir === 'in' && from === 'client' ? s.t : Math.max(s.t, r.visualArrive)
  if (dir === 'in' || bounce) r.visualArrive = t0 + d
  const f: Flight = { id: s.nextFlightId++, reqId: r.id, dir, from, to, via, t0, durationMs: d, outcome }
  if (bounce) f.bounce = true
  s.flights.push(f)
  if (s.flights.length > s.cfg.visual.maxFlights) s.flights.shift()
}

/** The failed attempt travels back from the server to the LB before the retry leaves. */
function bounceFlight(s: TrafficState, r: Req, v: ServerState, code: ErrCode) {
  addFlight(s, r, 'out', v.id, 'lb', null, code, true)
}

/** Simulated time for drawing, ms: s.t plus the not-yet-simulated remainder, so dots move smoothly between 10 ms ticks. */
export function nowMs(s: TrafficState): number {
  return s.t + Math.max(0, Math.min(DT_MS, s.acc))
}

export function display(v: ServerState): string {
  return v.label ? `${v.name} (${v.label})` : v.name
}

function fmtNum(v: number): string {
  return (Math.round(v * 10) / 10).toString().replace('.', ',')
}

/** Append an event to the log (capped at cfg.maxEvents). */
export function log(s: TrafficState, kind: EventKind, text: string, tone: Tone = 'neutral', server?: string) {
  s.events.push({ id: s.nextEventId++, t: Math.round(s.t / 100) / 10, kind, text, tone, server })
  while (s.events.length > s.cfg.maxEvents) s.events.shift()
}

/** A lecture's own narration line in the same log („Davor otvara htop…”). Kind defaults to 'note'. */
export function pushEvent(s: TrafficState, text: string, tone: Tone = 'info', kind: EventKind = 'note', server?: string) {
  log(s, kind, text, tone, server)
}

function logEvery(s: TrafficState, key: string, everyMs: number, kind: EventKind, text: string, tone: Tone, server?: string) {
  const last = s.lastLog[key] ?? -Infinity
  if (s.t - last < everyMs) return
  s.lastLog[key] = s.t
  log(s, kind, text, tone, server)
}

/* ====================================================================== */
/* Actions                                                                 */
/* ====================================================================== */

function srv(s: TrafficState, id: string): ServerState | undefined {
  return findServer(s, id)
}

/** Run `run(state)` at simulated time atMs (start of that tick). Used by presets, incident replays and tests. */
export function schedule(s: TrafficState, atMs: number, run: (s: TrafficState) => void, label?: string) {
  s.scheduled.push({ atMs: num(atMs, 0), run, label, done: false })
  s.scheduled.sort((a, b) => a.atMs - b.atMs)
}

function runScheduled(s: TrafficState, t: number) {
  for (const a of s.scheduled) {
    if (!a.done && t >= a.atMs) {
      a.done = true
      a.run(s)
    }
  }
}

/** „Sruši proces”: the process dies, the machine stays on → port closed → RST → instant 502 (or „odbijena veza” without an LB). */
export function crashServer(s: TrafficState, id: string, opts: { autoRestart?: boolean } = {}): boolean {
  const v = srv(s, id)
  if (!v || v.proc === 'crashed' || v.proc === 'exited' || v.proc === 'off' || v.proc === 'booting') return false
  openIncident(s, v, 'crash')
  const lost = insideCount(v)
  const auto = opts.autoRestart ?? s.cfg.lifecycle.autoRestart
  const delay = restartDelayFor(s, v)
  const l7 = s.cfg.layer === 'L7'
  const tail =
    s.cfg.mode === 'lb'
      ? s.cfg.passive.enabled
        ? ' Pasivna provjera ga izbacuje već na prvom neuspjelom zahtjevu.'
        : s.cfg.healthCheck.enabled
          ? s.cfg.retry && l7
            ? ' Load balancer to još ne zna, ali odbijene zahtjeve ponavlja na drugim poslužiteljima.'
            : ` Load balancer to još ne zna – dok ga provjere ne izbace, zahtjevi završavaju ${refusedWord(s)}.`
          : ' Bez provjera ispravnosti load balancer mu šalje promet i dalje.'
      : s.cfg.mode === 'service'
        ? ` Kontejner je izašao: Pod odmah nije spreman. ${auto ? restartText(delay) : 'Ne pokreće se ponovno.'}`
        : ' Nova spajanja se odmah odbijaju.'
  log(s, 'crash', `${display(v)}: proces se srušio${lost ? ` (prekinuto zahtjeva: ${lost})` : ''}.${tail}`, 'bad', v.id)
  dropAll(s, v, 'reset')
  v.proc = 'crashed'
  v.crashedAt = s.t
  v.procUntil = auto ? s.t + delay : -1
  v.probeDueAt = -1
  v.leakMB = 0
  wipeSessions(s, v.id)
  closeConnsTo(s, v.id)
  if (s.cfg.mode === 'service') setServing(s, v, false, 'crash')
  return true
}

/** „Zamrzni”: the process hangs – connections are accepted, nobody answers; requests wait until the 5 s client timeout. */
export function hangServer(s: TrafficState, id: string): boolean {
  const v = srv(s, id)
  if (!v || v.proc !== 'up') return false
  v.proc = 'hung'
  openIncident(s, v, 'hang')
  log(s, 'hang', `${display(v)}: proces se zamrznuo – prima veze, ali ne odgovara. Zahtjevi čekaju do isteka vremena${httpLb(s) ? ' (504)' : ''}.`, 'bad', v.id)
  return true
}

/** „Ugasi stroj” / „Izvuci utikač”: no RST; requests hang until a timeout. Not modelled in Service mode (node failure is E3). */
export function powerOff(s: TrafficState, id: string): boolean {
  const v = srv(s, id)
  if (!v || v.proc === 'off' || v.proc === 'exited') return false
  if (s.cfg.mode === 'service') {
    log(s, 'off', 'Gašenje čvora nije dio ovog modela (vidi simulaciju klastera).', 'info', v.id)
    return false
  }
  for (const r of [...v.inflight, ...v.queue]) v.parked.push(r)
  v.inflight = []
  v.queue = []
  v.proc = 'off'
  v.procUntil = -1
  v.probeDueAt = -1
  v.leakMB = 0
  wipeSessions(s, v.id, 'machine')
  openIncident(s, v, 'off')
  log(
    s,
    'off',
    s.cfg.mode === 'lb'
      ? `${display(v)}: stroj je ugašen – nema ni odgovora ni odbijanja. Load balancer čeka spajanje ${simRealLabel(TIMING.connectTimeout, s.cfg.connectTimeoutMs)}, zatim ${s.cfg.layer === 'L7' ? 'vraća 504' : 'zatvara vezu'}.`
      : `${display(v)}: stroj je ugašen – klijenti čekaju do isteka vremena.`,
    'bad',
    v.id,
  )
  return true
}

/** Power the machine back on: boot, then the process warms up. */
export function powerOn(s: TrafficState, id: string): boolean {
  const v = srv(s, id)
  if (!v || v.proc !== 'off') return false
  v.proc = 'booting'
  v.procUntil = s.t + s.cfg.lifecycle.bootMs
  log(s, 'on', `${display(v)}: stroj se pokreće (${simRealLabel(TIMING.boot, s.cfg.lifecycle.bootMs)}).`, 'info', v.id)
  return true
}

/** „Ponovno pokreni”: restart the process (or power on a machine that is off). In-flight requests are lost. */
export function restartServer(s: TrafficState, id: string): boolean {
  const v = srv(s, id)
  if (!v || v.proc === 'exited' || v.proc === 'booting') return false
  if (v.proc === 'off') return powerOn(s, id)
  const lost = insideCount(v)
  const lbBlind = s.cfg.mode === 'lb' && (!s.cfg.healthCheck.enabled || v.healthy)
  log(
    s,
    'restart',
    `${display(v)}: ponovno pokretanje (zagrijavanje ${fmtDuration(s.cfg.lifecycle.warmupMs)})${lost ? `, prekinuto zahtjeva: ${lost}` : ''}.${lbBlind ? ` Load balancer to ne zna: dok ga provjere ne izbace, zahtjevi prema njemu završavaju ${refusedWord(s)}.` : ''}`,
    'info',
    v.id,
  )
  dropAll(s, v, 'reset')
  wipeSessions(s, v.id)
  closeConnsTo(s, v.id)
  v.leakMB = 0
  v.probeDueAt = -1
  startProcess(s, v)
  if (s.cfg.mode === 'service') setServing(s, v, false, 'restart')
  return true
}

/**
 * „Isprazni”: deregister from the LB. No new connections; in-flight requests finish. Connections still pinned to it
 * (L4 keep-alive / pool) keep carrying requests until lifecycle.deregistrationDelayMs, then the LB closes them.
 * „Sigurno za uklanjanje” (drained) only when nothing is in progress and no connection is pinned – recomputed every tick.
 */
export function drainServer(s: TrafficState, id: string): boolean {
  const v = srv(s, id)
  if (!v || v.draining) return false
  if (s.cfg.mode !== 'lb') {
    // only a load balancer can deregister a target; without one, „pražnjenje” would be a false story
    log(
      s,
      'drain',
      s.cfg.mode === 'service'
        ? `Kubernetes nema „isprazni” za ${display(v)}: Pod se briše (preStop, SIGTERM) ili mu selektor prestane odgovarati – tek tada kube-proxy ne šalje nove veze.`
        : s.cfg.mode === 'dns'
          ? `Bez load balancera nema pražnjenja: A zapis za ${display(v)} uklanja se iz DNS-a, a klijenti ga pamte do isteka TTL-a.`
          : 'Bez load balancera nema pražnjenja: jedini poslužitelj prima sav promet.',
      'info',
      v.id,
    )
    return false
  }
  v.draining = true
  v.drained = false
  v.drainStartedAt = s.t
  v.deregistered = false
  const pinned = pinnedTo(s, v.id)
  log(
    s,
    'drain',
    pinned
      ? `${display(v)}: pražnjenje – nove veze ne dobiva, ali postojeće veze i dalje nose zahtjeve do isteka kašnjenja odjave (${simRealLabel(TIMING.deregistrationDelay, s.cfg.lifecycle.deregistrationDelayMs)}).`
      : `${display(v)}: pražnjenje – ne prima nove zahtjeve, dovršava započete.`,
    'info',
    v.id,
  )
  updateDrain(s, v)
  return true
}

/** Put a draining server back into rotation. */
export function undrainServer(s: TrafficState, id: string): boolean {
  const v = srv(s, id)
  if (!v || !v.draining) return false
  v.draining = false
  v.drained = false
  v.drainStartedAt = -1
  v.deregistered = false
  log(s, 'drain', `${display(v)}: ponovno u rotaciji.`, 'info', v.id)
  return true
}

/** Servers that count towards MAX_SERVERS (a terminating or exited Pod is on its way out). */
function liveCount(s: TrafficState): number {
  let n = 0
  for (const v of s.servers) if (!v.termination && v.proc !== 'exited') n++
  return n
}

/**
 * Add a server (starts warming up; with checks on it receives traffic only after passing them).
 * id and name are optional (generated: 's4' / 'S4', or 'podN' / 'klopa-api-N' in Service mode).
 * Returns the new id, or null (rack full – MAX_SERVERS live servers – or the id exists).
 */
export function addServer(s: TrafficState, spec: Omit<ServerSpec, 'id' | 'name'> & Partial<Pick<ServerSpec, 'id' | 'name'>>): string | null {
  if (liveCount(s) >= MAX_SERVERS) return null
  let id = spec.id
  let name = spec.name
  if (!id) {
    const prefix = s.cfg.mode === 'service' ? 'pod' : 's'
    let k = s.servers.length + 1
    while (srv(s, `${prefix}${k}`)) k++
    id = `${prefix}${k}`
    name = name || (s.cfg.mode === 'service' ? `klopa-api-${k}` : `S${k}`)
  }
  if (srv(s, id)) return null
  const clean: ServerSpec = { ...spec, id, name: name || id, vcpu: num(spec.vcpu, 1, 0.1, 128), ramGB: num(spec.ramGB, 2, 0.1, 1024) }
  const all = [...s.servers.map((v) => ({ vcpu: v.vcpu, ramGB: v.ramGB })), clean]
  const w = suggestedWeights(all, s.cfg.workload)
  const v = newServer(s, clean, w[w.length - 1], s.servers.length, s.servers.length + 1, false)
  s.servers.push(v)
  log(
    s,
    'add',
    s.cfg.mode === 'lb' && s.cfg.healthCheck.enabled
      ? `Dodan ${display(v)}: pokreće se, a promet dobiva tek nakon ${passesText(s.cfg.healthCheck.healthyThreshold)} ispravnosti.`
      : s.cfg.mode === 'lb'
        ? `Dodan ${display(v)}: bez provjera odmah je u rotaciji, iako se još pokreće.`
        : s.cfg.mode === 'service'
          ? `Novi Pod ${display(v)}: pokreće se; u Service ulazi kad prođe provjeru spremnosti.`
          : `Dodan ${display(v)}.`,
    'info',
    v.id,
  )
  return v.id
}

/** Remove a server immediately (requests inside it fail). Drain first for a clean removal. */
export function removeServer(s: TrafficState, id: string): boolean {
  const v = srv(s, id)
  if (!v) return false
  const lost = insideCount(v)
  log(s, 'remove', `${display(v)} uklonjen${lost ? ` – prekinuto zahtjeva: ${lost}` : ''}.`, lost ? 'warn' : 'neutral', v.id)
  dropAll(s, v, 'reset')
  wipeSessions(s, v.id, 'machine')
  closeConnsTo(s, v.id)
  s.servers = s.servers.filter((x) => x !== v)
  for (const c of s.clients) if (c.cookie === v.id) c.cookie = null
  return true
}

/** Resize (L02 „Veći poslužitelj”): the machine stops, is resized and boots again – a downtime gap. Weights stay as they were. */
export function resizeServer(s: TrafficState, id: string, vcpu: number, ramGB: number): boolean {
  const v = srv(s, id)
  if (!v || !(vcpu > 0) || !(ramGB > 0) || (v.vcpu === vcpu && v.ramGB === ramGB) || v.proc === 'exited') return false
  const lost = insideCount(v)
  const from = `${display(v)} (${fmtNum(v.vcpu)} vCPU / ${fmtNum(v.ramGB)} GB)`
  log(
    s,
    'resize',
    `${from} → ${fmtNum(vcpu)} vCPU / ${fmtNum(ramGB)} GB: promjena veličine znači gašenje i ponovno pokretanje – nedostupan ${simRealLabel(TIMING.resizeDowntime, s.cfg.lifecycle.resizeDowntimeMs)}${lost ? `; prekinuto zahtjeva: ${lost}` : ''}.`,
    'warn',
    v.id,
  )
  dropAll(s, v, 'reset')
  wipeSessions(s, v.id, 'machine')
  closeConnsTo(s, v.id)
  v.vcpu = vcpu
  v.ramGB = ramGB
  v.busy.fill(0)
  v.busySum = 0
  v.cpuShown = 0
  v.proc = 'off'
  v.procUntil = s.t + s.cfg.lifecycle.resizeDowntimeMs
  v.probeDueAt = -1
  v.leakMB = 0
  return true
}

/**
 * CPU work on this server ×factor (1 = repaired). The extra time holds a core, so the server shows 100 % CPU –
 * a CPU-side slowdown (noisy neighbour, throttled CPU), not a slow disk (that would be I/O wait with idle cores).
 * Label it SLOW_FAULT_LABEL („Sporiji procesor”).
 */
export function setSlow(s: TrafficState, id: string, factor = 3): boolean {
  const v = srv(s, id)
  if (!v) return false
  const f = num(factor, 1, 0.01, 100)
  if (f === v.slowFactor) return false
  v.slowFactor = f
  log(
    s,
    'slow',
    f === 1
      ? `${display(v)}: procesor opet radi punom brzinom.`
      : `${display(v)}: procesor radi ${fmtNum(f)}× sporije (npr. bučni susjed) – isti posao dulje drži jezgru, procesor je stalno pun.`,
    f === 1 ? 'ok' : 'warn',
    v.id,
  )
  return true
}

/**
 * Change a server's size at once, without downtime (L02 vCPU / RAM selectors, L04 „Prilagođeni” builder).
 * W follows the new RAM: requests already in progress finish, new ones wait until fewer than W are busy.
 * With { downtime: true } this is resizeServer() („Veći poslužitelj”: stop, resize, boot).
 */
export function setServerSize(s: TrafficState, id: string, size: { vcpu?: number; ramGB?: number }, opts: { downtime?: boolean } = {}): boolean {
  const v = srv(s, id)
  if (!v || v.proc === 'exited') return false
  const vcpu = size.vcpu === undefined ? v.vcpu : num(size.vcpu, NaN, 0.1, 128)
  const ramGB = size.ramGB === undefined ? v.ramGB : num(size.ramGB, NaN, 0.1, 1024)
  if (!Number.isFinite(vcpu) || !Number.isFinite(ramGB) || (vcpu === v.vcpu && ramGB === v.ramGB)) return false
  if (opts.downtime) return resizeServer(s, id, vcpu, ramGB)
  v.vcpu = vcpu
  v.ramGB = ramGB
  // the 1 s CPU window: a tick can never have used more cores than the server now has
  let sum = 0
  for (let i = 0; i < v.busy.length; i++) {
    v.busy[i] = Math.min(v.busy[i], vcpu)
    sum += v.busy[i]
  }
  v.busySum = sum
  v.cpuShown = Math.min(1, v.cpuShown)
  const W = workersOf(s, v)
  log(s, 'resize', `${display(v)}: ${fmtNum(vcpu)} vCPU / ${fmtNum(ramGB)} GB (${Number.isFinite(W) ? plural(W, ['radnik', 'radnika', 'radnika']) : 'radnici neograničeni'}).`, 'info', v.id)
  return true
}

/** Set every weight to the capacity-based suggestion for the current rack and workload (1 : 2 : 4 on the default rack). */
export function resetWeights(s: TrafficState): boolean {
  if (!s.servers.length) return false
  const w = suggestedWeights(s.servers, s.cfg.workload)
  s.servers.forEach((v, i) => {
    v.weight = w[i]
    v.cw = 0
  })
  log(s, 'weight', `Težine prema kapacitetu: ${s.servers.map((v) => `${v.name} ${v.weight}`).join(', ')}.`, 'info')
  return true
}

/** Memory leak: RAM grows by mbPerS while the process runs, until OOM (0 = fixed). */
export function setLeak(s: TrafficState, id: string, mbPerS: number): boolean {
  const v = srv(s, id)
  if (!v) return false
  v.leakMBps = num(mbPerS, 0, 0, 10_000)
  log(s, 'leak', v.leakMBps > 0 ? `${display(v)}: curenje memorije +${fmtNum(v.leakMBps)} MB/s.` : `${display(v)}: curenje memorije popravljeno.`, v.leakMBps > 0 ? 'warn' : 'ok', v.id)
  return true
}

/** Weight for wrr / wlc / chash (> 0). */
export function setWeight(s: TrafficState, id: string, weight: number): boolean {
  const v = srv(s, id)
  if (!v || !(weight > 0) || !Number.isFinite(weight)) return false
  if (v.weight === weight) return false
  v.weight = weight
  v.cw = 0
  log(s, 'weight', `${display(v)}: težina ${fmtNum(weight)}.`, 'info', v.id)
  return true
}

/**
 * Service mode: per-Pod readiness switch („Podu padne readiness”): the app's /ready starts failing (or recovers).
 * The kubelet notices after failureThreshold probes, then kube-proxy after the propagation lag. Nothing restarts.
 */
export function setReady(s: TrafficState, id: string, ready: boolean): boolean {
  const v = srv(s, id)
  if (!v || v.forcedUnready === !ready) return false
  v.forcedUnready = !ready
  const r = s.cfg.service.readiness
  log(
    s,
    'readiness',
    ready
      ? `${display(v)}: /ready opet odgovara – kubelet to vidi nakon ${plural(r.successThreshold, ['uspješne provjere', 'uspješne provjere', 'uspješnih provjera'])}.`
      : `${display(v)}: /ready počinje vraćati grešku – kubelet to vidi nakon ${plural(r.failureThreshold, ['neuspjele provjere', 'neuspjele provjere', 'neuspjelih provjera'])} (svake ${fmtDuration(r.periodMs)}).`,
    ready ? 'info' : 'warn',
    v.id,
  )
  return true
}

/**
 * Service mode: does the Service's selector match this Pod? false = „Greška u selektoru”: the Pod leaves the
 * EndpointSlice (kube-proxy stops new connections after propagationMs) while it keeps running and stays Ready.
 */
export function setSelected(s: TrafficState, id: string, selected: boolean): boolean {
  const v = srv(s, id)
  if (!v || v.inSlice === selected) return false
  v.inSlice = selected
  pushEndpoint(s, v)
  log(
    s,
    'selector',
    selected
      ? `Selektor opet odgovara Podu ${v.name} – vraća se u EndpointSlice.`
      : `Selektor više ne odgovara Podu ${v.name} (Pod radi i spreman je) – ispada iz EndpointSlicea.`,
    selected ? 'info' : 'warn',
    v.id,
  )
  return true
}

/**
 * Service mode: delete a Pod. The EndpointSlice marks it terminating (kube-proxy stops new connections after the lag)
 * and, at the same time, preStop sleep → SIGTERM → (graceful | immediate | ignore) → SIGKILL after the grace period.
 */
export function terminateServer(s: TrafficState, id: string): boolean {
  const v = srv(s, id)
  if (!v || s.cfg.mode !== 'service' || v.termination || v.proc === 'exited') return false
  const svc = s.cfg.service
  v.terminating = true
  pushEndpoint(s, v)
  v.termination = { startedAt: s.t, sigtermAt: s.t + svc.preStopSleepS * 1000, killAt: s.t + svc.terminationGraceS * 1000, sigtermSent: false }
  log(
    s,
    'terminate',
    svc.preStopSleepS > 0
      ? `${display(v)}: brisanje Poda – preStop sleep ${fmtNum(svc.preStopSleepS)} s, zatim SIGTERM; endpoint je terminating.`
      : `${display(v)}: brisanje Poda – SIGTERM odmah, a kube-proxy ga uklanja tek za ${fmtDuration(svc.propagationMs)}.`,
    'info',
    v.id,
  )
  return true
}

/** DNS mode: add or remove a server's A record (cached answers keep it until their TTL expires). */
export function setDnsRecord(s: TrafficState, id: string, present: boolean): boolean {
  const v = srv(s, id)
  if (!v || v.inDns === present) return false
  v.inDns = present
  log(s, 'dns', present ? `DNS: dodan A zapis za ${display(v)}.` : `DNS: uklonjen A zapis za ${display(v)} – klijenti ga pamte još do ${fmtDuration(s.cfg.dns.ttlMs)}.`, 'info', v.id)
  return true
}

/**
 * „Ugasi load balancer”: every request fails (the LB is a single point of failure). Only in lb mode – direct, dns and
 * Service have no load balancer to switch off (returns false with an explanatory event). Switching it back on always works.
 */
export function setLbUp(s: TrafficState, up: boolean): boolean {
  if (s.lbUp === up) return false
  if (!up && s.cfg.mode !== 'lb') {
    log(s, 'lb', s.cfg.mode === 'service' ? 'Service nije load balancer koji se može ugasiti: kube-proxy pravila su na svakom čvoru.' : 'U ovom načinu rada nema load balancera.', 'info')
    return false
  }
  s.lbUp = up
  if (!up) {
    // client connections through the LB break; workers finish but nobody receives the answer
    for (const v of s.servers) {
      for (const r of [...v.inflight, ...v.queue, ...v.parked, ...v.connecting]) {
        if (!r.done && !r.gaveUp) {
          r.gaveUp = true
          fail(s, r, 'refused', 'lbDown', null, false)
        }
      }
    }
    for (const r of s.pending) fail(s, r, 'refused', 'lbDown', null, true)
    s.pending = []
  }
  log(s, 'lb', up ? 'Load balancer ponovno radi.' : 'Load balancer je ugašen – nijedan zahtjev ne prolazi, iako svi poslužitelji rade.', up ? 'ok' : 'bad')
  return true
}

/** „Ugasi Redis”: with the Redis session store every session is gone (no persistence) – everyone is logged out. */
export function setRedisUp(s: TrafficState, up: boolean): boolean {
  if (s.redisUp === up) return false
  s.redisUp = up
  if (!up) wipeSessions(s, 'redis')
  log(s, 'redis', up ? 'Redis ponovno radi – nove sesije se spremaju.' : 'Redis je ugašen – sve sesije su izgubljene, korisnici su odjavljeni.', up ? 'ok' : 'bad')
  return true
}

/** „Nalet u 12:00”: λ × factor for durationMs (defaults from cfg.burst: ×3 for 30 s). */
export function burst(s: TrafficState, factor = s.cfg.burst.factor, durationMs = s.cfg.burst.durationMs): boolean {
  s.burstFactor = num(factor, 1, 0, 100)
  s.burstUntil = s.t + num(durationMs, 0, 0)
  s.burstLogged = true
  log(s, 'burst', `Nalet: promet ×${fmtNum(s.burstFactor)} tijekom ${fmtDuration(num(durationMs, 0, 0))}.`, 'warn')
  return true
}

/**
 * Manual mode: send the oldest request waiting at the LB to server `id`. A draining server is deregistered, so it is
 * refused (false); any other server may be chosen – sending to a dead one fails like a real LB would.
 */
export function routeManual(s: TrafficState, id: string): boolean {
  const v = srv(s, id)
  if (!v || !s.pending.length || v.draining) return false
  const r = s.pending.shift()!
  s.totals.manualRouted++
  if (v.proc !== 'up') logEvery(s, `manualDown-${v.id}`, 4000, 'manual', `Zahtjev je poslan na ${display(v)}, a on ${v.proc === 'hung' ? 'ne odgovara' : 'ne radi'}.`, 'warn', v.id)
  deliver(s, r, v, 'lb', true)
  return true
}

/** Reset the per-server hit counters (L14 hit histogram). */
export function resetHits(s: TrafficState): boolean {
  for (const v of s.servers) v.hits = 0
  return s.servers.length > 0
}

/** Switch the algorithm. Leaving manual mode hands the waiting requests to the new algorithm. */
export function setAlgo(s: TrafficState, algo: Algo): boolean {
  if (s.cfg.algo === algo) return false
  const wasManual = s.cfg.algo === 'manual'
  s.cfg.algo = algo
  for (const v of s.servers) v.cw = 0
  if (s.cfg.mode === 'lb') log(s, 'algo', `Algoritam: ${ALGO_NAME[algo]}.`, 'info')
  if (wasManual && s.pending.length) {
    const waiting = s.pending
    s.pending = []
    for (const r of waiting) {
      const v = chooseLb(s, s.clients[r.client] ?? null, null)
      if (v) deliver(s, r, v, 'lb', true)
      else rejectAt(s, r, s.cfg.layer === 'L7' ? 503 : 'refused', 'noBackend', 'lb')
    }
  }
  return true
}

/** Switch between modes at run time (e.g. L14 „Klasični LB / Kubernetes Service”). */
export function setMode(s: TrafficState, mode: Mode): boolean {
  if (s.cfg.mode === mode) return false
  s.cfg.mode = mode
  for (const c of s.clients) for (const k of c.conns) k.server = null
  for (const v of s.servers) {
    v.hcFails = 0
    v.hcOks = 0
    v.probeDueAt = -1
    v.nextProbe = s.t + DT_MS
    if (mode === 'service') {
      v.serving = v.proc === 'up' && v.accepting && !v.forcedUnready
      v.kpReady = v.serving && !v.terminating
      v.kpServing = v.serving
      v.kpTerminating = v.terminating
      v.kpInSlice = v.inSlice
      v.epQueue = []
    }
  }
  log(s, 'config', `Način rada: ${modeText(mode)}.`, 'info')
  return true
}

function sameProfile(a: TrafficProfile, b: TrafficProfile): boolean {
  if (a.kind !== b.kind) return false
  const ra = a as Record<string, unknown>
  const rb = b as Record<string, unknown>
  for (const k of Object.keys(ra)) if (ra[k] !== rb[k]) return false
  return true
}

/**
 * Apply slider / toggle values at run time. Safe to call every frame with every control value: a field equal to the
 * current value has no effect (in particular an unchanged `profile` does not restart the profile clock).
 * Structural changes use actions: addServer, removeServer, setServerSize, resizeServer, setMode (also accepted here).
 */
export function configure(s: TrafficState, patch: RuntimePatch) {
  const c = s.cfg
  // nested objects: ignore patches that change nothing (UIs may call configure every frame)
  const same = (a: object | undefined, b: object) => !a || Object.entries(a).every(([k, v]) => (b as Record<string, unknown>)[k] === v)
  if (same(patch.healthCheck, c.healthCheck)) patch = { ...patch, healthCheck: undefined }
  if (same(patch.passive, c.passive)) patch = { ...patch, passive: undefined }
  if (same(patch.lifecycle, c.lifecycle)) patch = { ...patch, lifecycle: undefined }
  if (same(patch.sessions, c.sessions)) patch = { ...patch, sessions: undefined }
  if (same(patch.dns, c.dns)) patch = { ...patch, dns: undefined }
  if (same(patch.burst, c.burst)) patch = { ...patch, burst: undefined }
  if (same(patch.visual, c.visual)) patch = { ...patch, visual: undefined }
  if (same(patch.clients, c.clients)) patch = { ...patch, clients: undefined }
  if (patch.service) {
    const { readiness, ...rest } = patch.service
    if (same(rest, c.service) && same(readiness, c.service.readiness)) patch = { ...patch, service: undefined }
  }
  if (patch.mode !== undefined) setMode(s, patch.mode)
  if (patch.algo !== undefined) setAlgo(s, patch.algo)
  if (patch.lambda !== undefined) c.lambda = num(patch.lambda, c.lambda, 0, 10_000)
  if (patch.workload !== undefined && WORKLOADS[patch.workload] && patch.workload !== c.workload) {
    c.workload = patch.workload
    log(s, 'config', `Opterećenje: ${WORKLOADS[patch.workload].label}.`, 'info')
  }
  if (patch.arrivals !== undefined && patch.arrivals !== c.arrivals && (patch.arrivals === 'poisson' || patch.arrivals === 'uniform')) c.arrivals = patch.arrivals
  if (patch.profile !== undefined) {
    const p = sanitizeProfile(patch.profile)
    if (!sameProfile(p, c.profile)) {
      c.profile = p
      s.profileT0 = s.t
    }
  }
  if (patch.layer !== undefined && patch.layer !== c.layer) {
    c.layer = patch.layer
    for (const cl of s.clients) for (const k of cl.conns) k.server = null
  }
  if (patch.queueMax !== undefined) c.queueMax = int(patch.queueMax, c.queueMax, 0, QUEUE_MAX_LIMIT)
  if (patch.clientTimeoutMs !== undefined) c.clientTimeoutMs = num(patch.clientTimeoutMs, c.clientTimeoutMs, DT_MS)
  if (patch.connectTimeoutMs !== undefined) c.connectTimeoutMs = num(patch.connectTimeoutMs, c.connectTimeoutMs, DT_MS)
  if (patch.unboundedWorkers !== undefined && patch.unboundedWorkers !== c.unboundedWorkers) {
    c.unboundedWorkers = patch.unboundedWorkers
    log(s, 'config', patch.unboundedWorkers ? 'Neograničeni radnici: broj radnika više ne ovisi o RAM-u.' : 'Broj radnika ponovno je ograničen RAM-om.', patch.unboundedWorkers ? 'warn' : 'info')
  }
  if (patch.retry !== undefined) c.retry = patch.retry
  if (patch.failOpen !== undefined) c.failOpen = patch.failOpen
  if (patch.ewmaAlpha !== undefined) c.ewmaAlpha = num(patch.ewmaAlpha, c.ewmaAlpha, 0, 1)
  if (patch.healthCheck) {
    const wasOn = c.healthCheck.enabled
    const oldInterval = c.healthCheck.intervalMs
    const merged = resolveConfig({ healthCheck: { ...c.healthCheck, ...patch.healthCheck } }).healthCheck
    c.healthCheck = merged
    if (merged.enabled !== wasOn) {
      for (const v of s.servers) {
        v.hcFails = 0
        v.hcOks = 0
        v.probeDueAt = -1
        if (!merged.enabled) v.healthy = true
        else v.nextProbe = s.t + DT_MS
      }
      log(s, 'config', merged.enabled ? 'Provjere ispravnosti uključene.' : 'Provjere ispravnosti isključene: load balancer više ne zna tko je živ.', merged.enabled ? 'info' : 'warn')
    } else if (merged.intervalMs !== oldInterval && c.mode !== 'service') rescheduleProbes(s)
  }
  if (patch.passive) c.passive = { ...c.passive, ...patch.passive, ejectMs: num(patch.passive.ejectMs, c.passive.ejectMs, 0) }
  if (patch.lifecycle) c.lifecycle = resolveConfig({ lifecycle: { ...c.lifecycle, ...patch.lifecycle } }).lifecycle
  if (patch.sessions) {
    const oldStore = c.sessions.store
    c.sessions = resolveConfig({ sessions: { ...c.sessions, ...patch.sessions } }).sessions
    if (c.sessions.store !== oldStore) {
      // a different session store starts empty; switching is a configuration change, not a crash – not counted as lost
      for (const cl of s.clients) cl.session = { home: null, cart: 0, wiped: false, loggedOut: false, lost: cl.session.lost }
      log(
        s,
        'config',
        c.sessions.store === 'redis'
          ? 'Sesije se od sada spremaju u Redis (postojeće košarice se ne prenose).'
          : c.sessions.store === 'machine'
            ? 'Sesije se od sada spremaju na svakom poslužitelju zasebno (postojeće košarice se ne prenose).'
            : 'Sesije se od sada spremaju u memoriju poslužitelja (postojeće košarice se ne prenose).',
        'info',
      )
    }
  }
  if (patch.service) {
    const oldPeriod = c.service.readiness.periodMs
    const svc = resolveConfig({ service: { ...c.service, ...patch.service, readiness: { ...c.service.readiness, ...patch.service.readiness } } }).service
    c.service = svc
    if (svc.readiness.periodMs !== oldPeriod && c.mode === 'service') rescheduleProbes(s)
  }
  if (patch.dns) {
    c.dns = resolveConfig({ dns: { ...c.dns, ...patch.dns } }).dns
    while (s.dnsResolvers.length < c.dns.resolvers) s.dnsResolvers.push({ order: [], expiresAt: -1 })
  }
  if (patch.burst) c.burst = resolveConfig({ burst: { ...c.burst, ...patch.burst } }).burst
  if (patch.visual) c.visual = resolveConfig({ visual: { ...c.visual, ...patch.visual } }).visual
  if (patch.clients) {
    const next = resolveConfig({ clients: { ...c.clients, ...patch.clients } }).clients
    const rebuild = next.count !== c.clients.count || next.nat !== c.clients.nat
    const modeChanged = next.mode !== c.clients.mode || next.poolSize !== c.clients.poolSize || next.pinTo !== c.clients.pinTo
    c.clients = next
    if (rebuild) s.clients = makeClients(c)
    else if (modeChanged) for (const cl of s.clients) cl.conns = []
  }
}
