/**
 * E1 Promet: types shared by the traffic engine, its selectors, the headless runner and the presets.
 * Pure TypeScript: no React, no DOM.
 */
import type { Rng, Series } from '../../kit/sim/math.ts'
import type { HashRing } from './hashing.ts'

/* ---------- Workloads and servers ---------- */

export type WorkloadId = 'api' | 'io' | 'cpu'

export interface Workload {
  id: WorkloadId
  /** Short Croatian label for segmented controls */
  label: string
  /** One-sentence Croatian description */
  description: string
  /** Mean CPU time per request (exponentially distributed), ms */
  cpuMs: number
  /** Fixed time spent waiting for the database / other services, ms (holds a worker, not a core) */
  ioMs: number
  /** RAM held by one radnik (worker process) while it serves a request, MB */
  memMB: number
}

/** Static description of a server (or a Pod in Service mode). */
export interface ServerSpec {
  /** Stable id used by actions and UI keys, e.g. 's1' */
  id: string
  /** Short display name, e.g. 'S1' */
  name: string
  /** Optional size label, e.g. 'mali' → displayed as "S1 (mali)" */
  label?: string
  vcpu: number
  ramGB: number
  /** Weight for weighted algorithms; default ∝ capacity under the initial workload (smallest = 1) */
  weight?: number
  /** Listed in DNS (dns mode only). Default true. */
  inDns?: boolean
  /** Display data passed through to ServerView (L14: Pod version colour v1/v2, Pod IP, labels). Never used by the model. */
  meta?: ServerMeta
}

export interface ServerMeta {
  /** e.g. '1.4.0' – UIs colour v1 blue, v2 violet (AUTHORING §5) */
  version?: string
  /** e.g. '10.244.2.15' (packet stepper) */
  ip?: string
  labels?: Record<string, string>
}

/* ---------- Modes, algorithms, errors ---------- */

/**
 * - direct: clients talk to one server without a proxy (L02). Crash = connection refused.
 * - dns: clients pick a server from DNS A records cached by their resolver (L03 cliffhanger, L04 hook). No health awareness.
 * - lb: a classic load balancer with algorithms and health checks (L04, L05).
 * - service: a Kubernetes Service (kube-proxy iptables/nftables): random ready endpoint per new connection (L14).
 */
export type Mode = 'direct' | 'dns' | 'lb' | 'service'

export type Algo =
  | 'manual' // the student routes each request (L04 "Vi ste load balancer")
  | 'random'
  | 'rr' // round robin
  | 'wrr' // smooth weighted round robin (NGINX)
  | 'lc' // least connections: min(inflight + queued), random tie-break
  | 'wlc' // weighted least connections: min((active + 1) / weight)
  | 'p2c' // power of two choices
  | 'lrt' // least response time: min(EWMA latency · (active + 1))
  | 'hash' // hash(client) mod N over servers in rotation
  | 'chash' // consistent hash ring (virtual nodes) on the client key

/** L7 balances requests (it terminates client connections); L4 balances connections. */
export type Layer = 'L7' | 'L4'

export type ArrivalProcess = 'poisson' | 'uniform'

export type TrafficProfile =
  | { kind: 'constant' }
  /** λ·(1 + amplitude·sin(2πt/period)) */
  | { kind: 'waves'; amplitude: number; periodS: number }
  /** Lunch rush: λ until startS, linear ramp to λ·peakFactor over rampS, hold holdS, linear decay over decayS */
  | { kind: 'lunch'; startS: number; rampS: number; peakFactor: number; holdS: number; decayS: number }

/** Process / machine state (the truth, not what the load balancer believes). */
export type Proc =
  | 'up'
  | 'starting' // process warming up: port closed, probes fail
  | 'crashed' // process dead, machine on: port closed → RST → connection refused at once
  | 'hung' // process frozen: kernel accepts connections, nobody answers
  | 'off' // machine off / being resized: no RST, connections hang until a timeout
  | 'booting' // machine booting: like off
  | 'exited' // Pod's container exited after termination (Service mode); will be removed

/**
 * Error categories as the client sees them.
 * - 502: an L7 load balancer could not get an answer (backend refused or reset the connection).
 * - 503: no healthy backend at an L7 LB, or a server whose workers and queue are full answers 503 itself.
 * - 504: a timeout – either the LB's connect timeout (a real 504 Gateway Timeout) or the client giving up after
 *   clientTimeoutMs (the course's "504 / isteklo vrijeme" category; see errorLabel(code, mode)).
 * - 'refused': no HTTP status at all – connection refused or reset. Used whenever no HTTP proxy is in the path:
 *   direct, dns, Kubernetes Service (kube-proxy only rewrites packets), an L4 load balancer, or the LB itself is down.
 */
export type ErrCode = 502 | 503 | 504 | 'refused'

export type ErrReason =
  | 'refused' // nothing listens on the port (crashed / starting / exited / listener closed)
  | 'reset' // connection reset: the process died while the request was inside
  | 'connectTimeout' // LB could not connect (machine off) within its connect timeout
  | 'queueFull' // all workers busy and the queue is full
  | 'noBackend' // no server / endpoint in rotation
  | 'timeout' // client timeout (5 s)
  | 'lbDown' // the load balancer itself is down
  | 'manualTimeout' // manual mode: request waited at the LB until the client gave up
  | 'noRoute' // the client dialled a Pod IP that no longer exists (clients.pinTo, L14 „Upiši IP”)

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral'

/** What the routing layer currently thinks of a server (for badges). */
export type RoutingState =
  | 'direct' // direct mode: no LB
  | 'inDns'
  | 'notInDns'
  | 'healthy'
  | 'unhealthy'
  | 'initial' // newly added, waiting for passing checks
  | 'ejected' // passive check
  | 'draining'
  | 'drained' // draining, nothing in progress and no connection pinned to it: safe to remove
  | 'ready' // Service: endpoint ready in kube-proxy's view
  | 'notReady'
  | 'terminating'
  | 'notSelected' // Service: the selector no longer matches the Pod (not in the EndpointSlice)

export type ClientMode =
  | 'perRequest' // a new connection for every request
  | 'keepAlive' // one long-lived connection per client
  | 'pool' // poolSize long-lived connections per client, used round robin

/**
 * Where sessions live. 'local' = the app process's memory (lost when the process crashes or restarts);
 * 'machine' = a store on each server (e.g. a Redis next to the app) – survives a process crash or restart and is wiped
 * only when the machine goes away (powerOff, removeServer, resizeServer); a user routed to another server still cannot
 * reach it there (counted as lost, like 'local'); 'redis' = one shared store.
 */
export type SessionStore = 'local' | 'machine' | 'redis'
export type SessionAffinity = 'none' | 'cookie' | 'hash'
/** What hash-based routing hashes: the user id (cookie / login) or the source IP (NGINX `hash $remote_addr`). */
export type HashKey = 'user' | 'ip'
export type SigtermBehaviour = 'graceful' | 'immediate' | 'ignore'

/* ---------- Config ---------- */

export interface HealthCheckConfig {
  /** Active checks by the LB (lb mode). */
  enabled: boolean
  intervalMs: number
  timeoutMs: number
  /** Consecutive failures before a server is taken out of rotation (U) */
  unhealthyThreshold: number
  /** Consecutive passes before it comes back (H) */
  healthyThreshold: number
  /** Spread probe phases across servers (cosmetic; false = every server probed at t % interval === 0) */
  stagger: boolean
  /** The probe waits in the same queue as requests: fails if the estimated wait exceeds the timeout */
  probeQueues: boolean
}

export interface PassiveConfig {
  /** NGINX max_fails=1 fail_timeout=10s: any 502/504 ejects the server for ejectMs */
  enabled: boolean
  ejectMs: number
}

export interface LifecycleConfig {
  /** A crashed process is restarted by its supervisor after restartDelayMs (manual crashes only if autoRestart) */
  autoRestart: boolean
  restartDelayMs: number
  /** Process warm-up: port closed, probes fail */
  warmupMs: number
  /** Machine boot after power-on */
  bootMs: number
  /** Machine down while being resized */
  resizeDowntimeMs: number
  /**
   * Drain: after this long the LB closes the connections still pinned to a draining server (L4 keep-alive / pool).
   * Real AWS ALB/NLB deregistration delay: 300 s (TIMING.deregistrationDelay).
   */
  deregistrationDelayMs: number
}

export interface ClientsConfig {
  /** Number of distinct clients (users). Each request comes from a random client. */
  count: number
  mode: ClientMode
  poolSize: number
  /** All clients behind one NAT (one source IP), e.g. a campus or eduroam */
  nat: boolean
  /**
   * Service mode: every client dials this Pod id directly (a hard-coded Pod IP), bypassing the Service.
   * When that Pod is gone the request fails with 'refused' / reason 'noRoute'. null = use the Service.
   */
  pinTo: string | null
}

export interface SessionsConfig {
  enabled: boolean
  store: SessionStore
  /** lb mode only: 'cookie' = LB cookie (needs L7), 'hash' = consistent hash on `hashKey` */
  affinity: SessionAffinity
  /** Key for affinity 'hash' and the algorithms 'hash' / 'chash': user id (default) or source IP (NAT collapses it) */
  hashKey: HashKey
}

export interface ReadinessConfig {
  periodMs: number
  timeoutMs: number
  failureThreshold: number
  successThreshold: number
}

export interface ServiceConfig {
  /** EndpointSlice change → kube-proxy rules on every node */
  propagationMs: number
  sessionAffinity: 'None' | 'ClientIP'
  affinityTimeoutS: number
  readiness: ReadinessConfig
  /** preStop: sleep N seconds before SIGTERM */
  preStopSleepS: number
  sigterm: SigtermBehaviour
  terminationGraceS: number
}

export interface DnsConfig {
  ttlMs: number
  /** Number of caching resolvers; client i uses resolver i % resolvers (or 0 for the campus share) */
  resolvers: number
  /** Share of clients behind resolver 0 (one big campus resolver), 0..1 */
  campusShare: number
}

export interface BurstConfig {
  factor: number
  durationMs: number
}

export interface VisualConfig {
  /** Create flight entities for animation (off in headless runs) */
  flights: boolean
  flightMs: number
  maxFlights: number
}

export interface ScriptedAction {
  atMs: number
  label?: string
  run: (s: TrafficState) => void
}

export interface TrafficConfig {
  seed: number
  mode: Mode
  servers: ServerSpec[]
  workload: WorkloadId
  /** Offered load, requests per second */
  lambda: number
  arrivals: ArrivalProcess
  profile: TrafficProfile
  algo: Algo
  layer: Layer
  /** Per-server FIFO queue length (0–100) */
  queueMax: number
  clientTimeoutMs: number
  /** Misconfiguration: worker pool not bounded by RAM → OOM crash loop */
  unboundedWorkers: boolean
  /**
   * 'shared' (default): arrivals and algorithm randomness use one stream, exactly like the validated prototype.
   * 'split': separate streams, so every algorithm sees the very same arrivals (for side-by-side comparisons).
   */
  rngStreams: 'shared' | 'split'
  healthCheck: HealthCheckConfig
  passive: PassiveConfig
  /** LB retries a refused / unconnectable request once on another server (NGINX proxy_next_upstream error timeout; L7 only) */
  retry: boolean
  /** No healthy target → send to all registered targets anyway (AWS ALB behaviour) */
  failOpen: boolean
  /** LB → server connect timeout (machine off) */
  connectTimeoutMs: number
  lifecycle: LifecycleConfig
  clients: ClientsConfig
  sessions: SessionsConfig
  service: ServiceConfig
  dns: DnsConfig
  burst: BurstConfig
  /** EWMA smoothing for least response time */
  ewmaAlpha: number
  visual: VisualConfig
  maxEvents: number
  /** Scheduled actions (presets, incident replays, tests) */
  script: ScriptedAction[]
}

/** Input to createTraffic(): every field optional, nested objects partial (merged over the mode's defaults). */
export type TrafficConfigInput = Partial<
  Omit<TrafficConfig, 'healthCheck' | 'passive' | 'lifecycle' | 'clients' | 'sessions' | 'service' | 'dns' | 'burst' | 'visual'>
> & {
  healthCheck?: Partial<HealthCheckConfig>
  passive?: Partial<PassiveConfig>
  lifecycle?: Partial<LifecycleConfig>
  clients?: Partial<ClientsConfig>
  sessions?: Partial<SessionsConfig>
  service?: Partial<Omit<ServiceConfig, 'readiness'>> & { readiness?: Partial<ReadinessConfig> }
  dns?: Partial<DnsConfig>
  burst?: Partial<BurstConfig>
  visual?: Partial<VisualConfig>
}

/**
 * Patch for configure(): everything a slider or toggle may change while the sim runs.
 * The rack, seed, RNG streams, script and event cap are fixed at creation (use actions or createTraffic).
 */
export type RuntimePatch = Omit<TrafficConfigInput, 'servers' | 'seed' | 'rngStreams' | 'script' | 'maxEvents'>

/* ---------- Runtime entities ---------- */

export interface Conn {
  id: number
  /** Backend this connection is pinned to; null = closed */
  server: string | null
  openedAt: number
  requests: number
}

export interface Session {
  /** Where the session lives: a server id (local / machine store), 'redis', or null (none) */
  home: string | null
  /** Items in the cart (each successful request adds one) */
  cart: number
  /** The session data was destroyed (server crash, Redis restart) and the user has not noticed yet */
  wiped: boolean
  /** Logged out and already counted as lost; no new session yet (e.g. Redis down) */
  loggedOut: boolean
  /** Times this user lost the session */
  lost: number
}

export interface Client {
  id: number
  name: string
  ip: string
  resolver: number
  conns: Conn[]
  nextConn: number
  /** LB cookie affinity (AWSALB-like): server id */
  cookie: string | null
  session: Session
  requests: number
  /** Requests of this user that failed (any error) */
  failed: number
  /** Simulated ms of this user's first / latest failure; null = never */
  firstErrorAt: number | null
  lastErrorAt: number | null
}

export interface Req {
  id: number
  client: number
  /** Arrival at the LB / server, ms */
  t0: number
  /** Last time it was handed to a server, ms */
  tRouted: number
  /** Got a radnik (worker), ms; -1 = not yet */
  tStart: number
  /** CPU part finished, ms; -1 = not yet */
  tCpuDone: number
  cpuTotal: number
  cpuLeft: number
  ioTotal: number
  ioLeft: number
  /** Client already gave up (504); the radnik keeps working = wasted work */
  gaveUp: boolean
  /** Finished (success or counted failure) */
  done: boolean
  server: string | null
  attempts: number
  /** LB connect attempt to a machine that is off gives up at this time */
  connectUntil: number
  conn: Conn | null
  /** Visual: when the inbound dot reaches its target */
  visualArrive: number
  /** Sent with sendRequest() (not by the arrival process) */
  manual: boolean
}

/**
 * Where a flight dot starts or ends: 'client', 'lb', a server id, or 'service' – the Service's virtual IP as the
 * client node's kube-proxy rules see it (draw it right next to the client: it is not a box traffic passes through).
 */
export type Place = 'client' | 'lb' | 'service' | string

export interface Flight {
  id: number
  reqId: number
  dir: 'in' | 'out'
  from: Place
  to: Place
  /** 'lb': the dot passes the load balancer at progress 0.5 */
  via: 'lb' | null
  /** Visual start, ms (may lie in the future: a retry leaves the LB only after the first attempt bounced back) */
  t0: number
  durationMs: number
  outcome: 'ok' | 'waiting' | ErrCode
  /** A failed attempt travelling back from the server to the LB before a retry */
  bounce?: boolean
}

export interface EndpointUpdate {
  at: number
  ready: boolean
  serving: boolean
  terminating: boolean
  /** In the EndpointSlice at all (the Service's selector matches the Pod) */
  inSlice: boolean
}

export interface ProbeRecord {
  /** Probe sent, ms */
  t: number
  /** Result known, ms (t + timeout for a probe nobody answered) */
  at: number
  outcome: 'pass' | 'fail' | 'timeout'
}

export interface ErrTotals {
  502: number
  503: number
  504: number
  refused: number
}

export interface Termination {
  startedAt: number
  sigtermAt: number
  killAt: number
  sigtermSent: boolean
}

export interface ServerState {
  id: string
  name: string
  label: string
  meta: ServerMeta
  vcpu: number
  ramGB: number
  weight: number
  inDns: boolean
  proc: Proc
  /** Time of the next automatic lifecycle transition, -1 = none */
  procUntil: number
  /** CPU demand multiplier ('Sporiji procesor' = 3) */
  slowFactor: number
  /** Memory leak, MB per second of uptime */
  leakMBps: number
  leakMB: number
  /** false during graceful shutdown: listener closed, in-flight requests finish */
  accepting: boolean
  inflight: Req[]
  queue: Req[]
  /** Accepted by the kernel but never answered (hung process, machine off in direct/dns/service mode) */
  parked: Req[]
  /** LB is waiting for a TCP handshake with a machine that is off */
  connecting: Req[]
  /* LB view (lb mode) */
  healthy: boolean
  hcFails: number
  hcOks: number
  nextProbe: number
  /** A probe is waiting for its timeout (hung / off); result (fail) at this time, -1 = none */
  probeDueAt: number
  ejectedUntil: number
  draining: boolean
  /** Live: draining, nothing in progress and no client connection pinned to it (recomputed every tick) */
  drained: boolean
  /** When draining started, ms (-1 = not draining) */
  drainStartedAt: number
  /** The deregistration delay expired and the pinned connections were closed */
  deregistered: boolean
  /** Ever passed checks since it was added (to tell 'initial' from 'unhealthy') */
  everHealthy: boolean
  /* Kubernetes endpoint (service mode) */
  forcedUnready: boolean
  /** The Service's selector matches this Pod (it is in the EndpointSlice) – setSelected() */
  inSlice: boolean
  /** kube-proxy's (lagged) view of inSlice */
  kpInSlice: boolean
  /** Readiness as the kubelet reports it (EndpointSlice condition serving) */
  serving: boolean
  terminating: boolean
  /** kube-proxy's (lagged) view */
  kpReady: boolean
  kpServing: boolean
  kpTerminating: boolean
  epQueue: EndpointUpdate[]
  termination: Termination | null
  /** kubelet CrashLoopBackOff entry (Service mode): current delay and last restart, ms */
  crashBackoff: { delay: number; lastUpdate: number } | null
  /** When the process last died (crash / OOM), ms; -1 = never */
  crashedAt: number
  /* algorithm state */
  cw: number
  ewmaMs: number
  /* stats */
  busy: Float64Array
  busyIdx: number
  busySum: number
  /** Display CPU (EMA of the 1 s window, τ ≈ 2 s) */
  cpuShown: number
  /** Completion times of successful requests, last 5 s */
  okTimes: number[]
  routed: number
  /** Requests routed here since the last resetHits() (hit histogram) */
  hits: number
  handled: number
  ooms: number
  restarts: number
  /** Busy core-ms since creation (for utilisation over a run) */
  busyCoreMsTotal: number
  cpuSeries: Series
  queueSeries: Series
  lastQueueFullLog: number
  /** Failures attributed to this server since creation, by code */
  errTotals: ErrTotals
  /** Last 10 probes (health checks in lb mode, readiness probes in Service mode), oldest first */
  probes: ProbeRecord[]
}

export interface OkSample {
  t: number
  lat: number
}

export interface ErrSample {
  t: number
  code: ErrCode
  reason: ErrReason
  server: string | null
  /** Client (user) index, -1 = none */
  client: number
}

/** One finished request (success or counted failure) for trace waterfalls and histograms. */
export interface CompletedReq {
  id: number
  client: number
  /** Last server it was sent to (null = never reached one) */
  server: string | null
  t0: number
  tEnd: number
  /** Arrival → got a radnik (LB wait, connect wait, server queue), ms */
  queueMs: number
  /** Wall-clock CPU part, including sharing cores with other requests, ms */
  cpuMs: number
  /** I/O wait (database), ms */
  ioMs: number
  attempts: number
  outcome: 'ok' | ErrCode
  reason: ErrReason | null
}

export interface Totals {
  arrived: number
  ok: number
  e502: number
  e503: number
  e504: number
  refused: number
  /** Completed after the client already gave up */
  wasted: number
  retried: number
  sessionLost: number
  connections: number
  manualRouted: number
  ooms: number
}

export type EventKind =
  | 'start'
  | 'config'
  | 'algo'
  | 'crash'
  | 'oom'
  | 'hang'
  | 'off'
  | 'on'
  | 'restart'
  | 'up'
  | 'resize'
  | 'add'
  | 'remove'
  | 'slow'
  | 'leak'
  | 'probeFail'
  | 'unhealthy'
  | 'healthy'
  | 'ejected'
  | 'ejectEnd'
  | 'drain'
  | 'drained'
  | 'queueFull'
  | 'noBackend'
  | 'burst'
  | 'burstEnd'
  | 'sessionLost'
  | 'redis'
  | 'lb'
  | 'retry'
  | 'endpoint'
  | 'terminate'
  | 'sigterm'
  | 'sigkill'
  | 'exit'
  | 'dns'
  | 'manual'
  | 'timeout'
  | 'blackHole'
  | 'selector'
  | 'weight'
  | 'readiness'
  | 'deregister'
  | 'note'

export interface TrafficEvent {
  id: number
  /** Simulated seconds, one decimal */
  t: number
  kind: EventKind
  /** Short Croatian sentence */
  text: string
  tone: Tone
  server?: string
}

export type IncidentKind = 'crash' | 'oom' | 'hang' | 'off'

/** Opened when a server fails; answers "how many requests failed before the LB noticed?" */
export interface Incident {
  id: number
  server: string
  kind: IncidentKind
  t0: number
  /** When the routing layer stopped sending new requests to it (LB checks, passive ejection, kube-proxy); null = not yet / never (direct, dns) */
  detectedAt: number | null
  /** Requests sent to the server before detection (incl. those inside it at t0) that failed */
  failedBeforeDetection: number
  /** All failures attributed to this server since t0 */
  failedTotal: number
  /** Sessions lost anywhere in the system while this incident was open (L05 „Nula izgubljenih sesija nakon pada”) */
  sessionsLost: number
  /** System-wide outcome in the 30 s after t0 */
  after30s: { ok: number; failed: number; done: boolean }
  closed: boolean
}

export interface DnsResolver {
  order: string[]
  expiresAt: number
}

export interface ScheduledAction {
  atMs: number
  label?: string
  run: (s: TrafficState) => void
  done: boolean
}

export interface TrafficSeries {
  /** Offered λ (req/s), one point per 0.5 s, 60 s */
  offered: Series
  /** Successes per second over the last 5 s (same window as metrics().goodput) */
  goodput: Series
  /** Errors per second over the last 5 s */
  errors: Series
  /** p95 (ms) over the last 10 s; NaN when n < 20 („n/a”) – a chart must break the line there, never draw 0 */
  p95: Series
}

/** Snapshot for since(): totals and time at the moment a goal or incident window starts. */
export interface Mark {
  t: number
  totals: Totals
}

export interface TrafficState {
  cfg: TrafficConfig
  /** Simulated time, ms (multiple of DT_MS) */
  t: number
  ticks: number
  /** Accumulator for step(): ms not yet simulated */
  acc: number
  rngArr: Rng
  rngAlgo: Rng
  rngClients: Rng
  /** sendRequest(): request sizes and clients, so manual requests never disturb the seeded arrivals */
  rngInject: Rng
  servers: ServerState[]
  clients: Client[]
  /** Manual mode: requests waiting at the LB */
  pending: Req[]
  nextArrival: number
  lastRate: number
  /** Unit-rate exponential mass left when the rate dropped to 0 */
  pendingUnits: number
  profileT0: number
  burstUntil: number
  burstFactor: number
  burstLogged: boolean
  rr: number
  lbUp: boolean
  redisUp: boolean
  /** ClientIP session affinity: source IP → backend and last use */
  ipAffinity: Map<string, { server: string; lastUsed: number }>
  dnsResolvers: DnsResolver[]
  dnsAuthIdx: number
  nextReqId: number
  nextFlightId: number
  nextEventId: number
  nextConnId: number
  nextIncidentId: number
  oks: OkSample[]
  errs: ErrSample[]
  /** Successes of the last OK_HISTORY_MAX (mark/since percentiles) */
  okHistory: OkSample[]
  /** Last RECENT_MAX finished requests (trace waterfall, histogram) */
  recent: CompletedReq[]
  totals: Totals
  flights: Flight[]
  events: TrafficEvent[]
  series: TrafficSeries
  incidents: Incident[]
  scheduled: ScheduledAction[]
  /** Little's law bookkeeping: number in system per tick (ring, 10 s) and departures (10 s) */
  littleRing: Float64Array
  littleIdx: number
  littleSum: number
  departures: { t: number; sojourn: number }[]
  sampleAcc: number
  lastLog: Record<string, number>
  /** Current offered rate (req/s) */
  offeredNow: number
  /** Cached consistent-hash ring for 'chash' */
  ring: HashRing | null
  /** Session losses not yet narrated (one summary line per 5 s) */
  sessionLostPending: number
  lastSessionLog: number
}
