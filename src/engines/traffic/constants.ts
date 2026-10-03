/**
 * E1 Promet: constants, workload presets, server sizes and Croatian labels.
 * Numbers follow docs/research/sim-models.md (SIM 1). Classroom values that shorten a real default are
 * exported as { sim, real } pairs so the UI can show "2 s (sim) · stvarno: 30 s (AWS ALB)".
 */
import type { Algo, ErrCode, ErrReason, HashKey, Layer, Mode, ServerSpec, Workload, WorkloadId } from './types.ts'

/** Fixed simulation step (sim-models §1: LB and queue sims need 10 ms resolution). */
export const DT_MS = 10
/** RAM used by the OS and the runtime before any radnik (worker) starts. */
export const BASE_RAM_MB = 512
export const DEFAULT_QUEUE_MAX = 10
export const QUEUE_MAX_LIMIT = 100
export const DEFAULT_CLIENT_TIMEOUT_MS = 5000
export const DEFAULT_LAMBDA = 10
/**
 * Service mode default λ: one 1 vCPU Pod (capacity 5 req/s) can carry a single keep-alive client at this rate,
 * so „one connection → 100 % on one Pod” is not muddied by overload.
 */
export const SERVICE_DEFAULT_LAMBDA = 4
export const LAMBDA_MAX = 50
export const DEFAULT_SEED = 42
export const VCPU_OPTIONS = [1, 2, 4, 8] as const
export const RAM_OPTIONS_GB = [1, 2, 4, 8, 16] as const
export const MAX_SERVERS = 8
/** Latency percentiles and error rate use a 10 s window; goodput a 5 s window. */
export const LATENCY_WINDOW_MS = 10_000
export const ERROR_WINDOW_MS = 10_000
export const GOODPUT_WINDOW_MS = 5_000
/** Percentiles are shown as "n/a" below this many successful samples. */
export const MIN_PERCENTILE_SAMPLES = 20
/** Chart sampling: one point per 0.5 s, 120 points = 60 s. */
export const SERIES_EVERY_MS = 500
export const SERIES_LEN = 120
/** CPU% window (1 s of ticks). */
export const CPU_WINDOW_TICKS = 100
/** Virtual nodes per weight unit on the consistent-hash ring (sim-models: ≥ 100). */
export const RING_VNODES = 100
/** Largest dt (s) one step() call will simulate (protects against a frozen tab returning). */
export const MAX_STEP_S = 60
/** Successes kept for mark()/since() percentiles (≈ 5 min at 20 req/s). */
export const OK_HISTORY_MAX = 6000
/** Finished requests kept in state.recent (trace waterfall, histograms). */
export const RECENT_MAX = 200
/** Probe results kept per server (L05 „Prozor otkrivanja” timeline). */
export const PROBE_HISTORY = 10
/**
 * N+1 headroom: the survivors of a lost server should stay at or below this utilisation.
 * Engine check (S1 + S2, API, 300 s): ρ 0.8 → WRR 0.3 % / LC 0.1 % errors; ρ 1.0 → WRR 6.1 % / LC 5.7 %, p95 ≈ 3.5 s.
 */
export const N_PLUS_ONE_MAX_UTILISATION = 0.8

/* ---------- Workload presets (sim-models SIM 1) ---------- */

export const WORKLOADS: Record<WorkloadId, Workload> = {
  api: {
    id: 'api',
    label: 'API',
    description: 'API: Django iza gunicorna, sinkroni radnici – 200 ms procesora i 300 ms čekanja na bazu po zahtjevu.',
    cpuMs: 200,
    ioMs: 300,
    memMB: 256,
  },
  io: {
    id: 'io',
    label: 'I/O (čeka bazu)',
    description: 'Zahtjev većinom čeka bazu: 50 ms procesora i 1000 ms čekanja. Radnik drži RAM, ali ne i jezgru.',
    cpuMs: 50,
    ioMs: 1000,
    memMB: 256,
  },
  cpu: {
    id: 'cpu',
    label: 'CPU (obrada fotografija)',
    description: 'Obrada fotografija: 400 ms procesora i 50 ms čekanja po zahtjevu.',
    cpuMs: 400,
    ioMs: 50,
    memMB: 256,
  },
}

/* ---------- Server sizes ---------- */

export const SERVER_SIZES = {
  mali: { vcpu: 1, ramGB: 2 },
  srednji: { vcpu: 2, ramGB: 4 },
  veliki: { vcpu: 4, ramGB: 8 },
} as const

/** The L04/L05 rack: S1 mali (1 vCPU / 2 GB), S2 srednji (2 / 4), S3 veliki (4 / 8). */
export function defaultRack(): ServerSpec[] {
  return [
    { id: 's1', name: 'S1', label: 'mali', ...SERVER_SIZES.mali },
    { id: 's2', name: 'S2', label: 'srednji', ...SERVER_SIZES.srednji },
    { id: 's3', name: 'S3', label: 'veliki', ...SERVER_SIZES.veliki },
  ]
}

/** L02: Klopa's single VPS before the resize (2 vCPU / 2 GB). The size is shown from vcpu/ramGB, not baked into the name. */
export function singleServer(vcpu = 2, ramGB = 2): ServerSpec[] {
  return [{ id: 's1', name: 'Klopa', vcpu, ramGB }]
}

/** n identical Pods (Service mode), e.g. klopa-api-0 … */
export function podSet(n: number, vcpu = 1, ramGB = 2, prefix = 'klopa-api'): ServerSpec[] {
  const out: ServerSpec[] = []
  for (let i = 0; i < n; i++) out.push({ id: `pod${i + 1}`, name: `${prefix}-${i + 1}`, vcpu, ramGB })
  return out
}

/** L02 "Veći poslužitelj" catalogue (one general-purpose family). Price is illustrative and linear per vCPU. */
export const CATALOGUE = [
  { vcpu: 1, ramGB: 2 },
  { vcpu: 2, ramGB: 4 },
  { vcpu: 4, ramGB: 8 },
  { vcpu: 8, ramGB: 16 },
] as const

/** Illustrative monthly price (label it „ilustrativno”): linear in vCPU and RAM, never exponential. */
export function monthlyPriceEur(vcpu: number, ramGB: number): number {
  return 6 * vcpu + 1.5 * ramGB
}

/** Next bigger catalogue size (both resources ≥ current, at least one larger), or null = „Nema većeg”. */
export function nextBiggerSize(vcpu: number, ramGB: number): { vcpu: number; ramGB: number } | null {
  for (const c of CATALOGUE) {
    if (c.vcpu >= vcpu && c.ramGB >= ramGB && (c.vcpu > vcpu || c.ramGB > ramGB)) return { vcpu: c.vcpu, ramGB: c.ramGB }
  }
  return null
}

/* ---------- Compressed time: sim vs real ---------- */

export interface SimReal {
  /** Value used in the sim (ms for durations) */
  sim: number
  /** Real default (same unit), or null when there is no single real value */
  real: number | null
  unit: 'ms' | 'count'
  /** Where the real value comes from, or a Croatian phrase when real is null */
  source: string
}

/**
 * Every classroom value that differs from (or stands in for) a real default.
 * Sources: docs/research/sim-models.md §0 and §B, tech-facts.md §1.5.
 */
export const TIMING = {
  healthInterval: { sim: 2000, real: 30_000, unit: 'ms', source: 'AWS ALB' },
  healthTimeout: { sim: 1000, real: 5000, unit: 'ms', source: 'AWS ALB' },
  healthyThreshold: { sim: 2, real: 5, unit: 'count', source: 'AWS ALB' },
  unhealthyThreshold: { sim: 2, real: 2, unit: 'count', source: 'AWS ALB' },
  passiveEject: { sim: 10_000, real: 10_000, unit: 'ms', source: 'NGINX max_fails=1 fail_timeout=10s' },
  connectTimeout: { sim: 1000, real: 60_000, unit: 'ms', source: 'NGINX proxy_connect_timeout' },
  /** AWS ALB uses a fixed 10 s connect timeout to targets (then 504) */
  connectTimeoutAlb: { sim: 1000, real: 10_000, unit: 'ms', source: 'AWS ALB' },
  /** The LB's own read timeout; clients (5 s) give up long before it, so it never fires in the sim */
  lbReadTimeout: { sim: 60_000, real: 60_000, unit: 'ms', source: 'NGINX proxy_read_timeout' },
  clientTimeout: { sim: DEFAULT_CLIENT_TIMEOUT_MS, real: null, unit: 'ms', source: 'ovisi o klijentu' },
  restartDelay: { sim: 6000, real: null, unit: 'ms', source: 'ovisi o nadzorniku procesa' },
  warmup: { sim: 3000, real: null, unit: 'ms', source: 'ovisi o aplikaciji' },
  boot: { sim: 10_000, real: null, unit: 'ms', source: 'minute' },
  resizeDowntime: { sim: 20_000, real: null, unit: 'ms', source: 'minute' },
  deregistrationDelay: { sim: 10_000, real: 300_000, unit: 'ms', source: 'AWS ALB/NLB deregistration delay' },
  /** kubelet CrashLoopBackOff (Service mode): 1st restart at once, then 10 s, 20 s, 40 s … 300 s; same as E3 */
  crashBackoffInitial: { sim: 10_000, real: 10_000, unit: 'ms', source: 'kubelet CrashLoopBackOff' },
  crashBackoffMax: { sim: 300_000, real: 300_000, unit: 'ms', source: 'kubelet CrashLoopBackOff' },
  /** The back-off resets after the container ran this long without crashing (2 × max) */
  crashBackoffReset: { sim: 600_000, real: 600_000, unit: 'ms', source: 'kubelet CrashLoopBackOff' },
  readinessPeriod: { sim: 2000, real: 10_000, unit: 'ms', source: 'Kubernetes periodSeconds' },
  readinessTimeout: { sim: 1000, real: 1000, unit: 'ms', source: 'Kubernetes timeoutSeconds' },
  readinessFailureThreshold: { sim: 3, real: 3, unit: 'count', source: 'Kubernetes failureThreshold' },
  readinessSuccessThreshold: { sim: 1, real: 1, unit: 'count', source: 'Kubernetes successThreshold' },
  endpointPropagation: { sim: 1000, real: null, unit: 'ms', source: 'asinkrono, ovisi o klasteru' },
  terminationGrace: { sim: 30_000, real: 30_000, unit: 'ms', source: 'terminationGracePeriodSeconds' },
  sessionAffinityTimeout: { sim: 10_800_000, real: 10_800_000, unit: 'ms', source: 'sessionAffinityConfig.clientIP.timeoutSeconds' },
  dnsTtl: { sim: 20_000, real: 300_000, unit: 'ms', source: 'čest TTL zapisa' },
} as const satisfies Record<string, SimReal>

/** "1,5 s", "250 ms", "5 min", "3 h" with a Croatian decimal comma. */
export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms)) return '∞'
  const num = (v: number) => (Math.round(v * 10) / 10).toString().replace('.', ',')
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 120_000) return `${num(ms / 1000)} s`
  if (ms < 7_200_000) return `${num(ms / 60_000)} min`
  return `${num(ms / 3_600_000)} h`
}

/**
 * Badge text for a compressed value, e.g. "2 s (sim) · stvarno: 30 s (AWS ALB)".
 * Pass `simValue` to label the value currently set on a slider instead of the default.
 */
export function simRealLabel(v: SimReal, simValue: number = v.sim): string {
  const fmt = (x: number) => (v.unit === 'ms' ? fmtDuration(x) : String(x))
  if (v.real === null) return `${fmt(simValue)} (sim) · stvarno: ${v.source}`
  if (v.real === simValue) return `${fmt(simValue)} (${v.source})`
  return `${fmt(simValue)} (sim) · stvarno: ${fmt(v.real)} (${v.source})`
}

/* ---------- Croatian labels ---------- */

export const ALGO_LABEL: Record<Algo, string> = {
  manual: 'Ručno',
  random: 'Nasumično',
  rr: 'Kružno',
  wrr: 'Težinsko kružno',
  lc: 'Najmanje veza',
  wlc: 'Težinski najmanje veza',
  p2c: 'Dva nasumična izbora',
  lrt: 'Najkraće vrijeme odgovora',
  hash: 'Hash mod N',
  chash: 'Konzistentni hash',
}

/** Label for a segmented control; hash-based algorithms say what they hash („IP hash” with hashKey 'ip'). */
export function algoLabel(algo: Algo, hashKey: HashKey = 'user'): string {
  if (hashKey === 'ip' && algo === 'hash') return 'IP hash mod N'
  if (hashKey === 'ip' && algo === 'chash') return 'Konzistentni IP hash'
  return ALGO_LABEL[algo]
}

/** Noun phrases for sentences and the event log. */
export const ALGO_NAME: Record<Algo, string> = {
  manual: 'ručno raspoređivanje',
  random: 'nasumični odabir',
  rr: 'kružno raspoređivanje (round robin)',
  wrr: 'težinsko kružno raspoređivanje',
  lc: 'najmanje veza',
  wlc: 'težinski najmanje veza',
  p2c: 'dva nasumična izbora',
  lrt: 'najkraće vrijeme odgovora',
  hash: 'hash mod N',
  chash: 'konzistentni hash',
}

/** One-sentence rule per algorithm (L04 "Ljestve algoritama"). */
export const ALGO_RULE: Record<Algo, string> = {
  manual: 'Svaki zahtjev raspoređujete sami.',
  random: 'Svaki zahtjev ide nasumično odabranom ispravnom poslužitelju.',
  rr: 'Poslužitelji dobivaju zahtjeve redom, jedan po jedan.',
  wrr: 'Redom, ali jači poslužitelj dobiva više zahtjeva prema težini.',
  lc: 'Zahtjev ide poslužitelju s najmanje zahtjeva u obradi i u redu.',
  wlc: 'Najmanje (aktivnih + 1) / težina.',
  p2c: 'Izvuku se dva nasumična poslužitelja; ide manje opterećenom.',
  lrt: 'Najmanje prosječno vrijeme odgovora × (aktivni + 1).',
  hash: 'Hash ključa (npr. korisnika) mod broj poslužitelja.',
  chash: 'Ključ se smješta na prsten virtualnih čvorova; pri promjeni se seli samo dio ključeva.',
}

export const MODE_LABEL: Record<Mode, string> = {
  direct: 'Bez load balancera',
  dns: 'DNS (više A zapisa)',
  lb: 'Klasični load balancer',
  service: 'Kubernetes Service',
}

/**
 * Croatian label of an error code. Pass the mode (and the LB layer) to label timeouts honestly: without an HTTP proxy
 * in the path (direct, dns, Service, an L4 balancer) the client simply gives up – there is no 504 response, so the
 * label drops the status code. Without arguments it uses the course's category name „504 isteklo vrijeme”.
 */
export function errorLabel(code: ErrCode, mode?: Mode, layer?: Layer): string {
  switch (code) {
    case 502:
      return '502 Bad Gateway'
    case 503:
      return '503 Service Unavailable'
    case 504:
      return mode && (mode !== 'lb' || layer === 'L4') ? 'isteklo vrijeme (klijent odustao)' : '504 isteklo vrijeme'
    default:
      return 'odbijena veza'
  }
}

export const REASON_LABEL: Record<ErrReason, string> = {
  refused: 'veza odbijena (port zatvoren)',
  reset: 'veza prekinuta (proces je pao)',
  connectTimeout: 'spajanje nije uspjelo (stroj ne odgovara)',
  queueFull: 'svi radnici zauzeti i red pun',
  noBackend: 'nema ispravnog poslužitelja',
  timeout: 'klijent je odustao nakon 5 s',
  lbDown: 'load balancer ne radi',
  manualTimeout: 'zahtjev je predugo čekao na load balanceru',
  noRoute: 'adresa Poda više ne postoji',
}

/**
 * setSlow() multiplies the CPU work, so the server shows 100 % CPU – label it as a CPU-side slowdown, not a slow disk
 * (a slow disk would show as I/O wait with idle cores).
 */
export const SLOW_FAULT_LABEL = 'Sporiji procesor'
export const SLOW_FAULT_DESCRIPTION =
  'Procesor radi 3× sporije (npr. bučni susjed na istom fizičkom stroju ili prigušen procesor): isti posao dulje drži jezgru, pa je procesor stalno pun.'

/** Model labels the UI must show next to formulas and sims (AUTHORING §5). */
export const MODEL_NOTES = {
  workerPool:
    'Model: Klopin API je Django iza gunicorna sa sinkronim radnicima – jedan radnik obrađuje jedan zahtjev i zauzima ≈256 MB (kao PHP-FPM, ili Puma s jednom dretvom po procesu).',
  asyncNote:
    'Asinkroni poslužitelji (Node.js, Go, async Python) jednim procesom poslužuju mnogo zahtjeva i trebaju puno manje RAM-a po zahtjevu.',
  mm1: 'model M/M/1 (jedan poslužitelj, slučajni dolasci i trajanja)',
  mmc: 'model M/M/c (Erlang C): c paralelnih radnika, slučajni dolasci i trajanja',
  erlangB: 'model Erlang B: c radnika bez reda čekanja',
  little: 'Littleov zakon L = λ·W vrijedi za svaki stabilan sustav.',
  service: 'Kubernetes Service (kube-proxy, iptables/nftables): nasumičan spreman Pod za svaku novu vezu, bez težina.',
  price: 'ilustrativno',
} as const
