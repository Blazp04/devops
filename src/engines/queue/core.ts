/**
 * E2 „Red” – engine core: state, the fixed 10 ms tick and the internal operations shared with actions.
 * Model: sim-models.md SIM 2 + lecture 06 flagship „Kuhinjska šina” (+ KEDA for L18, OOM/CrashLoopBackOff for L24).
 */
import { createRng, plural, Series } from '../../kit/sim/math.ts'
import {
  DEFAULT_CONFIG,
  DRAIN_MIN_PEAK,
  DT,
  EVENT_CAP,
  FLIGHT_CAP,
  FLIGHT_S,
  LATENCY_WINDOW_S,
  MIN_SAMPLES,
  SAMPLE_S,
  SERIES_LEN,
  controlDurationLabel,
  formatDuration,
  mergeConfig,
  sanitizeConfig,
} from './config.ts'
import { Fifo } from './fifo.ts'
import { fullJitterS, hpaDesiredReplicas } from './theory.ts'
import type {
  Consumer,
  ConsumerFault,
  Delivery,
  DirectRequest,
  EventKind,
  Job,
  KubeEvent,
  Message,
  Order,
  Place,
  QueueConfigPatch,
  QueueState,
  ScalerDecision,
  SpanName,
  SpanOutcome,
  Tone,
  Totals,
  TraceRecord,
  WorkerLogEntry,
} from './types.ts'

const EPS = 1e-9
const SAMPLE_TICKS = Math.round(SAMPLE_S / DT)
const RATE_WINDOW = 10 // samples → 5 s
const UTIL_WINDOW = 20 // samples → 10 s
const LOG_CAP = 12
const DLQ_LOG_CAP = 30
const MAX_HIST = 360_000 // 1 h in ticks
const IMPACT_CAP = 1_000_000
const MAX_TICKS_PER_STEP = 200_000
/** A narration line („Red raste”, „Nema aktivnih potrošača”) is repeated at most every 10 s. */
const NARRATE_REARM_S = 10
/** Worker log ring buffer, Kubernetes events, traced orders and spans per order. */
export const WORKER_LOG_CAP = 400
export const KUBE_EVENT_CAP = 100
export const TRACE_CAP = 300
export const TRACE_SPAN_CAP = 80
/** A chained flight hop is never shorter than this share of the hop duration. */
const MIN_HOP_SHARE = 0.25
/** Slider changes of the consumer count within this many seconds merge into one event. */
export const CONSUMER_EVENT_MERGE_S = 1
const CONTAINER = 'worker'

/* ------------------------------------------------------------------ small helpers */

/** Current simulated time (seconds). */
export const nowS = (s: QueueState): number => s.tick * DT

export const secs = (v: number): string => `${v.toLocaleString('hr-HR', { maximumFractionDigits: v < 10 ? 1 : 0 })} s`
/** secs() without Intl for the per-job log lines (identical text; Intl only from 999,5 s on, which rounds to „1.000”). */
const fastSecs = (v: number): string => {
  if (!(v >= 0 && v < 999.5)) return secs(v)
  if (v < 10) {
    const r = Math.round(v * 10)
    const d = r % 10
    return `${(r - d) / 10}${d ? `,${d}` : ''} s`
  }
  return `${Math.round(v)} s`
}
const rate1 = (v: number): string => v.toLocaleString('hr-HR', { maximumFractionDigits: 1 })
/** Genitive after „nakon”: nakon 1 isporuke · 3 isporuke · 5 isporuka. */
const DELIVERIES: [string, string, string] = ['isporuke', 'isporuke', 'isporuka']
/** RabbitMQ counts failed deliveries: nakon 1 neuspjele isporuke · 3 neuspjele isporuke · 5 neuspjelih isporuka. */
const FAILED_DELIVERIES: [string, string, string] = ['neuspjele isporuke', 'neuspjele isporuke', 'neuspjelih isporuka']
const ORDERS: [string, string, string] = ['narudžba', 'narudžbe', 'narudžbi']
const CONSUMERS: [string, string, string] = ['potrošač', 'potrošača', 'potrošača']
const WORKERS: [string, string, string] = ['radnik API-ja', 'radnika API-ja', 'radnika API-ja']

/** Independent, reproducible random streams derived from one seed (toggling one feature does not reshuffle the others). */
export function streamSeed(seed: number, stream: number): number {
  let h = (seed ^ Math.imul(stream + 1, 0x9e3779b1)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

export function emptyTotals(): Totals {
  return {
    arrivals: 0,
    orders: 0,
    ordersAccepted: 0,
    ordersFailed: 0,
    published: 0,
    rejectedPublish: 0,
    droppedHead: 0,
    delivered: 0,
    redeliveries: 0,
    retries: 0,
    failedAttempts: 0,
    completed: 0,
    directOk: 0,
    dlq: 0,
    dlqDeliveryLimit: 0,
    dlqMaxLength: 0,
    dropped: 0,
    lostAutoAck: 0,
    rejected503: 0,
    failed5xx: 0,
    failed500: 0,
    failed502: 0,
    clientTimeouts: 0,
    clientRetries: 0,
    effects: 0,
    effectsUnique: 0,
    duplicates: 0,
    alreadyCooked: 0,
    smsSent: 0,
    smsUnique: 0,
    smsDuplicates: 0,
    smsDeduped: 0,
    smsLost: 0,
    smsDeferred: 0,
    smsResent: 0,
    outOfOrder: 0,
    staleAcks: 0,
    visibilityExpired: 0,
    consumerTimeouts: 0,
    crashes: 0,
    oomKills: 0,
    restarts: 0,
    scaleEvents: 0,
    lateOrders: 0,
  }
}

/* ------------------------------------------------------------------ creation */

/** Create a fresh simulation state. `patch` overrides DEFAULT_CONFIG (sim-models SIM 2 defaults). */
export function createQueueSim(patch: QueueConfigPatch = {}): QueueState {
  const config = sanitizeConfig(mergeConfig(DEFAULT_CONFIG, patch))
  const seed = config.seed
  const rng = {
    arrivals: createRng(streamSeed(seed, 1)),
    poison: createRng(streamSeed(seed, 2)),
    service: createRng(streamSeed(seed, 3)),
    fail: createRng(streamSeed(seed, 4)),
    jitter: createRng(streamSeed(seed, 5)),
    crash: createRng(streamSeed(seed, 6)),
    client: createRng(streamSeed(seed, 7)),
    users: createRng(streamSeed(seed, 8)),
    smsRelay: createRng(streamSeed(seed, 9)),
  }
  const series = () => new Series(SERIES_LEN)
  const s: QueueState = {
    config,
    tick: 0,
    t: 0,
    acc: 0,
    stopAtTick: null,
    script: null,
    rng,
    arrivalAcc: 0,
    nextE: 1,
    bursts: [],
    ids: { msg: 0, order: 0, delivery: 0, consumer: 0, request: 0, event: 0, flight: 0, entry: 0 },
    ready: new Fifo<Message>(),
    returnsAtHead: 0,
    delayed: [],
    unacked: new Map(),
    consumers: [],
    rr: 0,
    rrDirect: 0,
    orders: new Map(),
    clientRetryQueue: [],
    cooked: new Map(),
    smsSentBy: new Map(),
    smsRecorded: new Set(),
    smsProviderKeys: new Set(),
    smsLostIds: new Set(),
    smsOutbox: [],
    maxCookedOrder: 0,
    sms: { state: config.smsGateway, until: null },
    scaler: { replicas: 0, active: false, lastActiveAt: 0, lastMetric: 0, nextPollAt: 0, nextHpaAt: 0, recs: [], lastDecision: null, history: [] },
    totals: emptyTotals(),
    little: { since: 0, area: 0, departures: 0, sojournSum: 0, inSystem: 0 },
    latHist: [],
    latN: 0,
    latSum: 0,
    latWin: new Fifo<readonly [number, number]>(),
    win: { inD: [], outD: [], errD: [], retryD: [], busyD: [], aliveD: [], lastIn: 0, lastOut: 0, lastErr: 0, lastRetry: 0, busyAcc: 0, aliveAcc: 0 },
    live: { rateIn: 0, rateOut: 0, errorRate: 0, retryRate: 0, utilization: 0, p50: null, p95: null, latN: 0 },
    series: {
      ready: series(),
      delayed: series(),
      unacked: series(),
      inSystem: series(),
      busy: series(),
      replicas: series(),
      rateIn: series(),
      rateOut: series(),
      p95: series(),
      dlq: series(),
      duplicates: series(),
      lost: series(),
      oldestAgeS: series(),
      lambda: series(),
      capacity: series(),
      errors: series(),
      retries: series(),
    },
    drain: { active: false, startedAt: 0, peak: 0, peakAt: 0, consumersMin: 0, consumersMax: 0, capacityMin: 0, arrivalsAtPeak: 0, last: null },
    burst: {
      active: false,
      source: null,
      startedAt: null,
      lastEndedAt: null,
      rate: 0,
      arrivalsAtStart: 0,
      ordersDuring: 0,
      firstOrderId: null,
      lastOrderId: null,
      done: false,
      doneAt: null,
      failed: false,
      servedBursts: 0,
    },
    narr: { growing: false, noConsumers: false, growingAt: -Infinity, noConsumersAt: -Infinity },
    impactLog: { t: [], user: [], order: [] },
    badOrders: new Map(),
    terminations: [],
    flightS: FLIGHT_S,
    flightEnds: new Map(),
    nextFlightEnd: Infinity,
    revision: 1,
    rollout: null,
    consumerChange: null,
    events: [],
    eventAgg: new Map(),
    flights: [],
    kitchen: [],
    smsLog: [],
    dlqRecent: [],
    workerLog: [],
    kubeEvents: [],
    traces: new Map(),
  }
  s.nextE = config.arrivals === 'poisson' ? s.rng.arrivals.exp(1) : 1
  if (config.consumerSource === 'internal') {
    const a = config.autoscaler
    const initial = a.enabled ? Math.min(a.maxReplicas, Math.max(a.minReplicas, config.consumers)) : config.consumers
    for (let i = 0; i < initial; i++) addConsumer(s, false)
    s.scaler.replicas = initial
  }
  emit(s, 'start', 'info', startText(s))
  return s
}

/** The opening narration line: what arrives, who consumes it and the capacity (so the log is never empty). */
function startText(s: QueueState): string {
  const c = s.config
  const lam = rateAt(s, 0)
  const head = c.profile.kind === 'curve' ? `Narudžbe stižu po profilu (λ sada ${rate1(lam)}/s)` : `Narudžbe stižu: λ ${rate1(lam)}/s`
  if (c.consumerSource === 'external') return `${head}; Podove workera daje klaster`
  if (c.autoscaler.enabled) return `${head}; potrošače skalira KEDA (sada ${s.consumers.length})`
  const k = s.consumers.length
  const cap = capacityPerS(s)
  if (c.mode === 'direct') return `${head}; ${plural(k, WORKERS)} bez reda, kapacitet ${rate1(cap)}/s`
  return `${head}; ${plural(k, CONSUMERS)}, kapacitet ${rate1(cap)}/s`
}

/* ------------------------------------------------------------------ events, flights, logs */

/**
 * Append an event. An identical event (same kind and text) at the same instant is merged into the existing row
 * („… (×2)”), so `${t}-${text}` – the kit EventLog's React key – stays unique.
 */
export function emit(s: QueueState, kind: EventKind, tone: Tone, text: string): void {
  const t = nowS(s)
  for (let i = s.events.length - 1; i >= 0 && s.events[i].t === t; i--) {
    const e = s.events[i]
    const base = e.count > 1 ? e.text.slice(0, e.text.length - ` (×${e.count})`.length) : e.text
    if (e.kind === kind && base === text) {
      e.count++
      e.text = `${text} (×${e.count})`
      return
    }
  }
  s.events.push({ id: ++s.ids.event, t, kind, text, tone, count: 1 })
  if (s.events.length > EVENT_CAP) s.events.splice(0, s.events.length - EVENT_CAP)
}

/**
 * Frequent events are rate-limited: the first one is shown at once, later ones within 1 s are
 * summed into one line („503: još 7 odbijenih narudžbi”).
 */
export function note(s: QueueState, kind: EventKind, tone: Tone, first: string, more: (n: number) => string, windowS = 1): void {
  const agg = s.eventAgg.get(kind)
  if (agg) {
    agg.count++
    return
  }
  s.eventAgg.set(kind, { start: nowS(s), count: 0, tone, more, windowS })
  emit(s, kind, tone, first)
}

function flushEventAgg(s: QueueState, t: number): void {
  if (s.eventAgg.size === 0) return
  for (const [kind, agg] of s.eventAgg) {
    if (t - agg.start >= agg.windowS - EPS) {
      s.eventAgg.delete(kind)
      if (agg.count > 0) emit(s, kind, agg.tone, agg.more(agg.count))
    }
  }
}

/** Chain key of a flight: the message id, or −orderId for tokens without a message (direct requests, SMS). */
const flightKey = (msgId: number, orderId: number): number => (msgId > 0 ? msgId : -orderId)

/**
 * Cosmetic hop. Hops of one message are chained: a hop starts when the previous hop of the same message ends, and
 * a chain that fell behind is compressed so it still arrives `flightS` after the model event (never shorter than
 * a quarter hop). So one ticket is drawn in one place at a time. A hop from a place to itself is skipped.
 */
export function fly(s: QueueState, msgId: number, orderId: number, from: Place, to: Place, tone: Tone = 'info'): void {
  if (from === to) return
  const now = nowS(s)
  const key = flightKey(msgId, orderId)
  const prevEnd = s.flightEnds.get(key) ?? -Infinity
  const t0 = Math.max(now, prevEnd)
  const end = Math.max(t0 + s.flightS * MIN_HOP_SHARE, now + s.flightS)
  s.flightEnds.set(key, end)
  s.flights.push({ id: ++s.ids.flight, msgId, orderId, from, to, t0, dur: end - t0, tone })
  if (s.flights.length > FLIGHT_CAP) s.flights.splice(0, s.flights.length - FLIGHT_CAP)
  if (end < s.nextFlightEnd) s.nextFlightEnd = end
}

/** Drop finished hops (by end time, wherever they sit in the list) and their chain ends – only when one landed. */
function cullFlights(s: QueueState, t: number): void {
  if (t + EPS < s.nextFlightEnd) return
  s.flights = s.flights.filter((f) => f.t0 + f.dur > t + EPS)
  for (const [k, end] of s.flightEnds) if (end <= t + EPS) s.flightEnds.delete(k)
  let next = Infinity
  for (const f of s.flights) if (f.t0 + f.dur < next) next = f.t0 + f.dur
  s.nextFlightEnd = next
}

function pushCapped<T>(arr: T[], item: T, cap: number): void {
  arr.push(item)
  if (arr.length > cap) arr.splice(0, arr.length - cap)
}

export const consumerPlace = (id: number): Place => `consumer:${id}`

const SAFE_ALPHABET = 'bcdfghjklmnpqrstvwxz2456789'

/** Stable 5-character Pod-name suffix (the alphabet Kubernetes uses for generated names). */
export function podSuffix(id: number): string {
  let h = (Math.imul(id + 1, 0x9e3779b1) ^ 0x5bd1e995) >>> 0
  let out = ''
  for (let i = 0; i < 5; i++) {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0
    out += SAFE_ALPHABET[h % SAFE_ALPHABET.length]
  }
  return out
}

function fnv32a(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

const hashCache = new Map<string, string>()

/** pod-template-hash of a revision, encoded like Kubernetes (and E3): SafeEncodeString(decimal fnv32a). */
export function templateHashOf(prefix: string, revision: number): string {
  const key = `${prefix}|revision=${revision}`
  const hit = hashCache.get(key)
  if (hit !== undefined) return hit
  const dec = String(fnv32a(key))
  let out = ''
  for (const ch of dec) out += SAFE_ALPHABET[ch.charCodeAt(0) % SAFE_ALPHABET.length]
  if (hashCache.size < 1000) hashCache.set(key, out)
  return out
}

/** Pod name of a consumer: the external key, or `${prefix}-${templateHash}-${suffix}` like a Deployment's Pods. */
export function podName(s: QueueState, c: Consumer, prefix: string = s.config.podNamePrefix): string {
  return c.key ?? `${prefix}-${templateHashOf(prefix, c.revision)}-${podSuffix(c.id)}`
}

/** ReplicaSet name of a revision. */
export function replicaSetName(s: QueueState, revision: number): string {
  return `${s.config.podNamePrefix}-${templateHashOf(s.config.podNamePrefix, revision)}`
}

/**
 * How events name a worker: „Potrošač 3” in queue mode, „Radnik API-ja 3” in direct mode (a server's worker
 * process, as in L02/L04), or „Pod klopa-worker-…” with config.consumerNames 'pod' (L18/L24 consoles).
 */
export function who(s: QueueState, c: Consumer, midSentence = false): string {
  if (s.config.consumerNames === 'pod') return `Pod ${podName(s, c)}`
  if (s.config.mode === 'direct') return `${midSentence ? 'radnik' : 'Radnik'} API-ja ${c.id}`
  return `${midSentence ? 'potrošač' : 'Potrošač'} ${c.id}`
}

/** L24 impact: one bad outcome for an order and its user. */
function recordImpact(s: QueueState, orderId: number, userId: number): void {
  const L = s.impactLog
  if (L.t.length >= IMPACT_CAP) return
  L.t.push(nowS(s))
  L.user.push(userId)
  L.order.push(orderId)
}

function markBad(s: QueueState, orderId: number, why: 'failed' | 'dropped' | 'lost' | 'dlq'): void {
  if (s.badOrders.size < IMPACT_CAP && !s.badOrders.has(orderId)) s.badOrders.set(orderId, why)
}

/** W3C trace-id (32 hex characters) of an order – deterministic per seed. */
export function traceIdOf(s: QueueState, orderId: number): string {
  const base = (s.config.seed + Math.imul(orderId, 0x9e3779b1)) >>> 0
  let out = ''
  for (let i = 0; i < 4; i++) out += streamSeed(base, 100 + i).toString(16).padStart(8, '0')
  return out
}

/** Append a worker log line (`kubectl logs`). The ring buffer is trimmed in chunks (amortised O(1)). */
function wlog(s: QueueState, c: Consumer, level: WorkerLogEntry['level'], orderId: number | null, text: string): void {
  const traceId = orderId === null ? null : (s.traces.get(orderId)?.traceId ?? traceIdOf(s, orderId))
  s.workerLog.push({ id: ++s.ids.entry, t: nowS(s), consumerId: c.id, pod: podName(s, c), level, orderId, traceId, text })
  if (s.workerLog.length >= WORKER_LOG_CAP + 100) s.workerLog.splice(0, s.workerLog.length - WORKER_LOG_CAP)
}

/** Kubernetes event in E3's shape; repeats of the same object/reason/message only bump count and t. Internal consumers only. */
export function kubeEvent(s: QueueState, type: KubeEvent['type'], reason: string, object: string, message: string): void {
  if (s.config.consumerSource === 'external') return // the cluster engine (E3) owns the Pods and their events
  const t = Math.round(nowS(s) * 10) / 10
  const last = s.kubeEvents.findLast((e) => e.object === object && e.reason === reason && e.message === message)
  if (last) {
    last.count++
    last.t = t
    return
  }
  pushCapped(s.kubeEvents, { t, firstT: t, type, reason, object, message, count: 1 }, KUBE_EVENT_CAP)
}

const podRef = (s: QueueState, c: Consumer): string => `pod/${podName(s, c)}`

/* ------------------------------------------------------------------ traces */

/** Start (or continue, for a client retry) the trace of an order. */
function traceStart(s: QueueState, orderId: number): void {
  if (s.traces.has(orderId)) return
  const r: TraceRecord = { orderId, traceId: traceIdOf(s, orderId), spans: [], truncated: false }
  s.traces.set(orderId, r)
  if (s.traces.size > TRACE_CAP) s.traces.delete(s.traces.keys().next().value as number)
}

function spanOpen(s: QueueState, orderId: number, span: SpanName, start: number, consumerId: number | null, attempt: number): void {
  const r = s.traces.get(orderId)
  if (!r) return
  if (r.spans.length >= TRACE_SPAN_CAP) {
    r.truncated = true
    return
  }
  r.spans.push({ span, start, end: null, consumerId, attempt, outcome: null })
}

/** Close the newest open span of that name (of that consumer, if given). */
function spanClose(s: QueueState, orderId: number, span: SpanName, end: number, outcome: SpanOutcome, consumerId?: number): void {
  const r = s.traces.get(orderId)
  if (!r) return
  for (let i = r.spans.length - 1; i >= 0; i--) {
    const x = r.spans[i]
    if (x.end === null && x.span === span && (consumerId === undefined || x.consumerId === consumerId)) {
      x.end = Math.max(x.start, end)
      x.outcome = outcome
      return
    }
  }
}

/** A zero-length span (ack, response, DLQ). */
function spanMark(s: QueueState, orderId: number, span: SpanName, t: number, outcome: SpanOutcome, consumerId: number | null, attempt: number): void {
  spanOpen(s, orderId, span, t, consumerId, attempt)
  spanClose(s, orderId, span, t, outcome)
}

/** Close every open span of a consumer (crash). */
function spanCloseConsumer(s: QueueState, orderId: number, consumerId: number, end: number, outcome: SpanOutcome): void {
  const r = s.traces.get(orderId)
  if (!r) return
  for (const x of r.spans) {
    if (x.end === null && x.consumerId === consumerId) {
      x.end = Math.max(x.start, end)
      x.outcome = outcome
    }
  }
}

/* ------------------------------------------------------------------ config-derived values */

/** Effective ack deadline (sim seconds) for the current broker. */
export function ackTimeoutOf(s: QueueState): number {
  return s.config.broker === 'sqs' ? s.config.visibilityTimeoutS : s.config.consumerTimeoutS
}

/** Producer rate λ(t) incl. the profile and manual bursts. */
export function rateAt(s: QueueState, t: number): number {
  const c = s.config
  const p = c.profile
  let r = c.rate
  if (p.kind === 'burst') {
    if (t >= p.startS - EPS && t < p.startS + p.durationS - EPS) r = Math.max(r, p.rate)
  } else if (p.kind === 'curve') {
    r = curveRate(p.points, p.repeatS, t)
  }
  for (const b of s.bursts) if (t >= b.startS - EPS && t < b.startS + b.durationS - EPS) r = Math.max(r, b.rate)
  return Number.isFinite(r) && r > 0 ? r : 0
}

/** The burst (profile window or manual „Nalet”) active at time t, if any. */
export function burstAt(s: QueueState, t: number): { rate: number; source: 'profile' | 'manual'; endS: number } | null {
  let best: { rate: number; source: 'profile' | 'manual'; endS: number } | null = null
  const p = s.config.profile
  if (p.kind === 'burst' && t >= p.startS - EPS && t < p.startS + p.durationS - EPS) best = { rate: p.rate, source: 'profile', endS: p.startS + p.durationS }
  for (const b of s.bursts) {
    if (t >= b.startS - EPS && t < b.startS + b.durationS - EPS && (!best || b.rate > best.rate)) best = { rate: b.rate, source: 'manual', endS: b.startS + b.durationS }
  }
  return best
}

function curveRate(points: ReadonlyArray<readonly [number, number]>, repeatS: number | undefined, t: number): number {
  if (points.length === 0) return 0
  const x = repeatS && repeatS > 0 ? ((t % repeatS) + repeatS) % repeatS : t
  if (x <= points[0][0]) return points[0][1]
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i]
    if (x <= x1) {
      const [x0, y0] = points[i - 1]
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
    }
  }
  return points[points.length - 1][1]
}

export function effectiveFault(s: QueueState, c: Consumer): ConsumerFault {
  return c.fault ?? s.config.consumerFault
}

/** Mean seconds one job occupies a healthy consumer under the current SMS-gateway state (1/μ). */
export function meanJobS(s: QueueState): number {
  const c = s.config
  const sms = s.sms.state === 'slow' ? c.smsSlowS : s.sms.state === 'down' ? c.smsTimeoutS : 0
  return c.serviceMeanS + sms
}

/**
 * Service rate (jobs/s) of one consumer under its effective fault: 1 / (S + SMS delay) when healthy,
 * 1 / (S + SMS delay + slowExtraS) when 'slow', 0 when 'oom' (every job is killed before it finishes).
 */
export function consumerMu(s: QueueState, c: Consumer): number {
  const f = effectiveFault(s, c)
  if (f === 'oom') return 0
  return 1 / (meanJobS(s) + (f === 'slow' ? s.config.slowExtraS : 0))
}

/** Capacity Σμ (jobs/s) of the running consumers, faults included. */
export function capacityPerS(s: QueueState): number {
  let cap = 0
  for (const c of s.consumers) if (c.status === 'running') cap += consumerMu(s, c)
  return cap
}

/** The delivery limit is enforced (SQS without a DLQ has no redrive policy, hence no maxReceiveCount). */
export function deliveryLimitEnforced(s: QueueState): boolean {
  return s.config.broker === 'rabbitmq' || s.config.dlqEnabled
}

/**
 * Expected processing attempts per order (the retry load): non-poison orders retry a transient failure
 * geometrically (capped at maxDeliveries when the limit counts them), poison orders use up the whole limit.
 * Infinity when a failure is never counted (RabbitMQ 4.3 basic.nack, SQS without a DLQ) and pPoison > 0 (or pFail = 1).
 * Direct mode and auto-ack have no redelivery: 1.
 */
export function attemptsPerOrder(s: QueueState): number {
  const c = s.config
  if (c.mode === 'direct' || c.ackMode === 'auto') return 1
  const p = c.pFail
  const unlimited = !deliveryLimitEnforced(s) || (c.broker === 'rabbitmq' && c.retryMode === 'nack-requeue')
  const M = c.maxDeliveries
  const healthy = unlimited ? (p < 1 ? 1 / (1 - p) : Infinity) : p < 1 ? (1 - p ** M) / (1 - p) : M
  const poison = unlimited ? Infinity : M
  let a = 0
  if (c.pPoison < 1) a += (1 - c.pPoison) * healthy
  if (c.pPoison > 0) a += c.pPoison * poison
  return a
}

/** Consumers that count as replicas (not shutting down). */
export function activeConsumers(s: QueueState): Consumer[] {
  return s.consumers.filter((c) => c.status !== 'stopping')
}

export function runningCount(s: QueueState): number {
  let n = 0
  for (const c of s.consumers) if (c.status === 'running') n++
  return n
}

/** Unacked deliveries the broker still tracks (non-stale). */
export function unackedCount(s: QueueState): number {
  return s.unacked.size
}

/** Age of the oldest unfinished message anywhere in the broker (s); 0 when empty. */
export function oldestAgeOf(s: QueueState): number {
  let oldest = Infinity
  s.ready.forEach((m) => {
    if (m.publishedAt < oldest) oldest = m.publishedAt
  })
  for (const m of s.delayed) if (m.publishedAt < oldest) oldest = m.publishedAt
  for (const d of s.unacked.values()) if (d.msg.publishedAt < oldest) oldest = d.msg.publishedAt
  return Number.isFinite(oldest) ? Math.max(0, nowS(s) - oldest) : 0
}

/* ------------------------------------------------------------------ consumers */

export function addConsumer(s: QueueState, starting: boolean, key: string | null = null, startupS: number = s.config.autoscaler.podStartupS): Consumer {
  const t = nowS(s)
  // an external Pod becomes ready when its engine says so (syncConsumers)
  const readyAt = !starting ? t : key !== null ? Infinity : t + startupS
  const c: Consumer = {
    id: ++s.ids.consumer,
    key,
    revision: s.revision,
    status: starting ? 'starting' : 'running',
    buffer: [],
    job: null,
    fault: null,
    crashArmed: false,
    cancelled: false,
    restartAt: 0,
    readyAt,
    freeAt: starting ? readyAt : t,
    createdAt: t,
    runningSince: t,
    restartCount: 0,
    lastRestartAt: null,
    backoffLevel: 0,
    lastTermination: null,
    processed: 0,
    busyS: 0,
  }
  s.consumers.push(c)
  return c
}

function removeConsumer(s: QueueState, c: Consumer): void {
  const i = s.consumers.indexOf(c)
  if (i >= 0) s.consumers.splice(i, 1)
}

/** A starting Pod became ready (internal start-up timer). */
function podReady(s: QueueState, c: Consumer, t: number): void {
  c.status = 'running'
  c.runningSince = t
  c.freeAt = c.readyAt
  kubeEvent(s, 'Normal', 'Created', podRef(s, c), `Created container: ${CONTAINER}`)
  kubeEvent(s, 'Normal', 'Started', podRef(s, c), `Started container ${CONTAINER}`)
  wlog(s, c, 'INFO', null, s.config.mode === 'direct' ? 'API poslužitelj pokrenut' : 'Worker pokrenut – spajam se na red „narudzbe”')
  emit(s, 'pod-ready', 'ok', `${who(s, c)} spreman (Pod pokrenut)`)
}

/**
 * Graceful stop (scale-down / slider / Pod deleted / rollout): no new work, the current job finishes, unstarted
 * buffered deliveries go back explicitly (RabbitMQ basic.nack requeue – not counted toward the delivery limit;
 * SQS ChangeMessageVisibility 0 – the receive was already counted).
 */
export function stopConsumer(s: QueueState, c: Consumer): void {
  if (c.status === 'stopping') return
  kubeEvent(s, 'Normal', 'Killing', podRef(s, c), `Stopping container ${CONTAINER}`)
  if (c.status === 'crashed' || c.status === 'starting') {
    removeConsumer(s, c)
    return
  }
  c.status = 'stopping'
  c.crashArmed = false
  delete c.crashArmedPoint
  wlog(s, c, 'INFO', null, 'SIGTERM – dovršavam trenutnu narudžbu, ostale poruke vraćam u red')
  const keep: Delivery[] = []
  for (const d of c.buffer) {
    if (d.autoAcked) keep.push(d) // the app already owns auto-acked messages: process them before exit
    else if (!d.stale) {
      s.unacked.delete(d.id)
      d.stale = true
      returnOrDeadLetter(s, d.msg, 'shutdown', consumerPlace(c.id))
    }
  }
  c.buffer = keep
  if (!c.job && c.buffer.length === 0) removeConsumer(s, c)
}

/**
 * Set the number of consumers. Like a ReplicaSet scale-down: Pods of an older revision go first (during a rollout),
 * then not-ready Pods (starting / crashed), then the newest.
 */
export function setConsumerTarget(s: QueueState, n: number, starting: boolean): void {
  const target = Math.max(0, Math.floor(n))
  const active = activeConsumers(s)
  if (target > active.length) {
    for (let i = active.length; i < target; i++) addConsumer(s, starting)
  } else if (target < active.length) {
    const rank = (c: Consumer) => (c.status === 'running' ? 1 : 0)
    const victims = [...active].sort((a, b) => a.revision - b.revision || rank(a) - rank(b) || b.id - a.id).slice(0, active.length - target)
    for (const v of victims) stopConsumer(s, v)
  }
}

/** Replicas the Deployment wants: the HPA/KEDA decision, else the consumer setting. */
export function desiredReplicas(s: QueueState): number {
  return s.config.autoscaler.enabled ? s.scaler.replicas : s.config.consumers
}

function hasCapacity(s: QueueState, c: Consumer): boolean {
  if (c.status !== 'running' || c.cancelled) return false
  // direct mode drains a leftover backlog only through fully idle API workers, one message at a time
  if (s.config.mode === 'direct') return !c.job && c.buffer.length === 0
  return c.buffer.length + (c.job ? 1 : 0) < s.config.prefetch
}

/**
 * Restart delay for the next crash of `c` (and advance its back-off level).
 * CrashLoopBackOff (immediateFirst): 0, base, 2·base … cap – the kubelet restarts the first exit at once.
 */
function nextRestartDelay(s: QueueState, c: Consumer, t: number): number {
  const r = s.config.restart
  if (t - c.runningSince >= r.resetAfterS - EPS) c.backoffLevel = 0
  const level = c.backoffLevel
  c.backoffLevel++
  if (r.immediateFirst) return level === 0 ? 0 : Math.min(r.capS, r.baseS * 2 ** (level - 1))
  return Math.min(r.capS, r.baseS * 2 ** level)
}

/**
 * Crash a consumer process now. Returns false if it was not running.
 * `report` = record the termination for an external Pod engine (drainTerminations).
 */
export function crashNow(s: QueueState, c: Consumer, how: 'before-effect' | 'after-effect' | 'after-commit' | 'oom', report = true): boolean {
  if (c.status !== 'running' && c.status !== 'stopping') return false
  const t = nowS(s)
  const tot = s.totals
  const oom = how === 'oom'
  const external = s.config.consumerSource === 'external'
  // the app's last words; an OOM kill (SIGKILL by the kernel) and a kill decided by another engine leave none
  if (!oom && report) wlog(s, c, 'ERROR', c.job?.orderId ?? null, 'Neobrađena iznimka – proces završava (izlazni kod 1)')
  tot.crashes++
  if (oom) tot.oomKills++
  const delay = nextRestartDelay(s, c, t)
  c.lastTermination = { reason: oom ? 'OOMKilled' : 'Error', exitCode: oom ? 137 : 1, at: t }
  if (external && report) s.terminations.push({ key: c.key, consumerId: c.id, reason: c.lastTermination.reason, exitCode: c.lastTermination.exitCode, t })
  const wasStopping = c.status === 'stopping'
  c.status = 'crashed'
  c.restartAt = external ? Infinity : t + delay
  c.freeAt = external ? t : t + delay
  c.crashArmed = false
  delete c.crashArmedPoint
  c.cancelled = false

  const held: Delivery[] = []
  const job = c.job
  if (job?.delivery) held.push(job.delivery)
  held.push(...c.buffer)
  if (job) spanCloseConsumer(s, job.orderId, c.id, t, 'crash')
  if (job?.request) {
    const req = job.request
    if (!req.clientGaveUp) {
      tot.failed5xx++
      tot.failed502++
      spanMark(s, req.order.id, 'odgovor', t, 'fail', c.id, req.order.attempts)
      note(s, 'failed-5xx', 'bad', `502: ${who(s, c, true)} pao usred narudžbe #${req.order.id}`, (n) => `5xx: još ${plural(n, ['neuspjela narudžba', 'neuspjele narudžbe', 'neuspjelih narudžbi'])}`)
      clientAttemptFailed(s, req.order)
    }
    departure(s, req.arrivedAt, t)
  }
  c.job = null
  c.buffer = []

  // auto-ack: the job's message was acked at delivery; once its kitchen effect committed it is simply done
  const autoDone = job?.delivery?.autoAcked === true && job.committed
  if (oom) emit(s, 'oom', 'bad', `${who(s, c)}: OOMKilled (izlazni kod 137)`)
  else if (autoDone) emit(s, 'crash', 'bad', `${who(s, c)} pao nakon kuhanja – poruka je potvrđena već pri isporuci, ništa se ne ponavlja`)
  else if (how === 'after-commit') emit(s, 'crash', 'bad', `${who(s, c)} pao nakon kuhanja, prije SMS-a i potvrde`)
  else if (how === 'after-effect' || job?.committed) emit(s, 'crash', 'bad', `${who(s, c)} pao nakon kuhanja, prije potvrde`)
  else emit(s, 'crash', 'bad', `${who(s, c)} pao${job ? ' prije kuhanja' : ''}`)

  let requeued = 0
  let deadLettered = 0
  let dropped = 0
  const orphans: Delivery[] = []
  for (const d of held) {
    if (d.stale) continue
    if (d.autoAcked) {
      if (autoDone && d === job?.delivery) completeMessage(s, d.msg, c)
      else loseMessage(s, d.msg, `Automatska potvrda: narudžba #${d.msg.orderId} izgubljena (potrošač pao)`)
      continue
    }
    if (s.config.broker === 'rabbitmq') {
      s.unacked.delete(d.id)
      d.stale = true
      const r = returnOrDeadLetter(s, d.msg, 'crash', consumerPlace(c.id))
      if (r === 'dlq') deadLettered++
      else if (r === 'dropped') dropped++
      else requeued++
    } else {
      d.orphan = true
      orphans.push(d)
      fly(s, d.msg.id, d.msg.orderId, consumerPlace(c.id), 'invisible', 'warn')
      spanOpen(s, d.msg.orderId, 'nevidljivo do isteka roka', t, null, d.msg.receiveCount)
    }
  }
  const returned = requeued + deadLettered + dropped
  if (returned > 0) {
    if (requeued === returned) emit(s, 'requeue', 'warn', `RabbitMQ: veza zatvorena, nepotvrđene poruke (${requeued}) odmah se vraćaju u red`)
    else {
      const parts = [requeued > 0 ? `${requeued} natrag u red` : '', deadLettered > 0 ? `${deadLettered} u DLQ` : '', dropped > 0 ? `${dropped} odbačeno` : ''].filter(Boolean)
      emit(s, 'requeue', 'warn', `RabbitMQ: veza zatvorena, nepotvrđene poruke (${returned}): ${parts.join(', ')}`)
    }
  }
  for (const d of orphans) {
    const left = Math.max(0, d.receivedAt + ackTimeoutOf(s) - t)
    emit(s, 'orphan', 'info', `SQS: narudžba #${d.msg.orderId} ostaje nevidljiva do isteka roka (još ${secs(left)})`)
  }
  if (wasStopping) {
    removeConsumer(s, c)
    return true
  }
  if (!external && s.config.restart.immediateFirst && delay > 0) {
    const real = delay * s.config.restart.realPerSim
    const realText = s.config.restart.realPerSim !== 1 ? ` (stvarno: ${formatDuration(real)})` : ''
    kubeEvent(s, 'Warning', 'BackOff', podRef(s, c), `Back-off restarting failed container ${CONTAINER} in pod ${podName(s, c)}`)
    emit(s, 'crashloop', 'warn', `CrashLoopBackOff: ${who(s, c, true)} čeka ${secs(delay)}${realText} prije ponovnog pokretanja`)
  }
  return true
}

export function restartConsumer(s: QueueState, c: Consumer): void {
  const t = nowS(s)
  c.status = 'running'
  c.runningSince = t
  c.freeAt = Number.isFinite(c.restartAt) ? Math.min(t, c.restartAt) : t // the exact restart moment (no tick bias)
  c.restartCount++
  c.lastRestartAt = t
  s.totals.restarts++
  kubeEvent(s, 'Normal', 'Created', podRef(s, c), `Created container: ${CONTAINER}`)
  kubeEvent(s, 'Normal', 'Started', podRef(s, c), `Started container ${CONTAINER}`)
  wlog(s, c, 'INFO', null, s.config.mode === 'direct' ? 'API poslužitelj pokrenut' : 'Worker pokrenut – spajam se na red „narudzbe”')
  emit(s, 'restart', 'ok', `${who(s, c)} ponovno pokrenut (${plural(c.restartCount, ['ponovno pokretanje', 'ponovna pokretanja', 'ponovnih pokretanja'])})`)
}

/* ------------------------------------------------------------------ broker operations */

/** Little's-law bookkeeping for anything leaving the system. */
function departure(s: QueueState, enteredAt: number, t: number): void {
  const l = s.little
  l.inSystem = Math.max(0, l.inSystem - 1)
  l.departures++
  l.sojournSum += t - Math.max(enteredAt, l.since)
}

function recordLatency(s: QueueState, latency: number, t: number): void {
  const idx = Math.min(MAX_HIST, Math.max(0, Math.round(latency / DT)))
  while (s.latHist.length <= idx) s.latHist.push(0)
  s.latHist[idx]++
  s.latN++
  s.latSum += latency
  s.latWin.push([t, latency])
  if (s.latWin.size > 5000) s.latWin.shift()
  if (latency > s.config.sloS + EPS) s.totals.lateOrders++
}

/**
 * Make a message visible; `at` = exact time it became visible (≤ now). A return (`front`) goes after the returns
 * already at the head – returns come back in the order they were returned, before regular messages.
 */
function makeReady(s: QueueState, msg: Message, at: number = nowS(s), front = false): void {
  msg.status = 'ready'
  msg.visibleAt = at
  if (front) s.ready.insertAt(s.returnsAtHead++, msg)
  else s.ready.push(msg)
}

/** Take the head of the queue (keeps the returns bookkeeping). */
function takeReady(s: QueueState): Message | undefined {
  const m = s.ready.shift()
  if (m && s.returnsAtHead > 0) s.returnsAtHead--
  return m
}

function removeReady(s: QueueState, msg: Message): void {
  const i = s.ready.indexOf((m) => m === msg)
  if (i < 0) return
  s.ready.removeAt(i)
  if (i < s.returnsAtHead) s.returnsAtHead--
}

/**
 * Where a returned message re-enters the queue. RabbitMQ requeues to the quorum queue's returns queue (served
 * before regular messages, in return order); a retry through a retry queue (TTL + dead-letter exchange) is a new
 * publish (the tail). SQS: with a redrive policy whose maxReceiveCount > 3, a message received 3 or more times
 * moves to the back of the queue; otherwise it stays near the front.
 */
function returnsToFront(s: QueueState, msg: Message, viaRetryQueue: boolean): boolean {
  const c = s.config
  if (c.broker === 'rabbitmq') return !viaRetryQueue
  if (c.dlqEnabled && c.maxDeliveries > 3 && msg.receiveCount >= 3) return false
  return true
}

/** The counter the delivery limit is checked against: SQS receive count, RabbitMQ 4.3 delivery-count. */
export function attemptsOf(s: QueueState, msg: Message): number {
  return s.config.broker === 'sqs' ? msg.receiveCount : msg.deliveryCount
}

function deadLetter(s: QueueState, msg: Message, reason: 'max-deliveries' | 'max-length', fromPlace: Place): void {
  const t = nowS(s)
  const n = attemptsOf(s, msg)
  const cfg = s.config
  const rabbit = cfg.broker === 'rabbitmq'
  recordImpact(s, msg.orderId, msg.userId)
  spanClose(s, msg.orderId, 'red', t, cfg.dlqEnabled ? 'dlq' : 'lost')
  const after = rabbit ? `nakon ${plural(n, FAILED_DELIVERIES)} (delivery-limit ${cfg.maxDeliveries - 1})` : `nakon ${plural(n, DELIVERIES)} (maxReceiveCount ${cfg.maxDeliveries})`
  if (cfg.dlqEnabled) {
    msg.status = 'dlq'
    markBad(s, msg.orderId, 'dlq')
    s.totals.dlq++
    if (reason === 'max-length') s.totals.dlqMaxLength++
    else s.totals.dlqDeliveryLimit++
    pushCapped(
      s.dlqRecent,
      { id: ++s.ids.entry, t, msgId: msg.id, orderId: msg.orderId, receiveCount: msg.receiveCount, deliveryCount: msg.deliveryCount, poison: msg.poison, reason },
      DLQ_LOG_CAP,
    )
    spanMark(s, msg.orderId, 'DLQ', t, 'dlq', null, msg.receiveCount)
    fly(s, msg.id, msg.orderId, fromPlace, 'dlq', 'bad')
    if (reason === 'max-length') note(s, 'overflow', 'warn', `Red pun – najstarija narudžba (#${msg.orderId}) premještena u DLQ`, (k) => `Red pun – u DLQ još ${plural(k, ORDERS)}`)
    else note(s, 'dlq', 'bad', `Narudžba #${msg.orderId} premještena u DLQ ${after}`, (k) => `U DLQ još ${plural(k, ORDERS)} (iscrpljene isporuke)`)
  } else {
    msg.status = 'dropped'
    markBad(s, msg.orderId, 'dropped')
    s.totals.dropped++
    spanMark(s, msg.orderId, 'odbačeno', t, 'lost', null, msg.receiveCount)
    fly(s, msg.id, msg.orderId, fromPlace, 'lost', 'bad')
    if (reason === 'max-length') note(s, 'overflow', 'bad', `Red pun – najstarija narudžba (#${msg.orderId}) odbačena (drop-head, nema DLQ-a)`, (k) => `Red pun – odbačeno još: ${plural(k, ORDERS)}`)
    else note(s, 'dropped', 'bad', `Narudžba #${msg.orderId} odbačena ${after} – nema DLQ-a`, (k) => `Bez DLQ-a odbačeno još: ${plural(k, ORDERS)}`)
  }
  departure(s, msg.publishedAt, t)
}

function loseMessage(s: QueueState, msg: Message, text: string): void {
  msg.status = 'lost'
  s.totals.lostAutoAck++
  markBad(s, msg.orderId, 'lost')
  recordImpact(s, msg.orderId, msg.userId)
  spanMark(s, msg.orderId, 'odbačeno', nowS(s), 'lost', null, msg.receiveCount)
  note(s, 'auto-ack-lost', 'bad', text, (n) => `Automatska potvrda: još ${plural(n, ['izgubljena narudžba', 'izgubljene narudžbe', 'izgubljenih narudžbi'])}`)
  departure(s, msg.publishedAt, nowS(s))
}

export type FailReason = 'poison' | 'error' | 'sms'
const FAIL_TEXT: Record<FailReason, string> = { poison: 'otrovna poruka', error: 'greška pri obradi', sms: 'SMS-gateway ne odgovara' }

/** What happened to a returned message. */
export type ReturnResult = 'requeued' | 'delayed' | 'dlq' | 'dropped'

/**
 * A delivery came back without an ack.
 * - 'fail': processing failed (retry per retryMode). 'crash': connection lost. 'timeout': visibility timeout /
 *   consumer_timeout. 'shutdown': a graceful stop returned it.
 * RabbitMQ 4.3 increments delivery-count only for 'crash' and for failures returned with basic.reject or through
 * the retry queue (not for 'nack-requeue', consumer_timeout or a graceful return). Over the limit → DLQ (or
 * dropped). SQS without a DLQ has no limit: the message keeps coming back.
 */
export function returnOrDeadLetter(s: QueueState, msg: Message, why: 'fail' | 'crash' | 'timeout' | 'shutdown', from: Place, reason: FailReason | null = null): ReturnResult {
  const c = s.config
  const t = nowS(s)
  const rabbit = c.broker === 'rabbitmq'
  const nack = why === 'fail' && c.retryMode === 'nack-requeue'
  if (rabbit && (why === 'crash' || (why === 'fail' && !nack))) msg.deliveryCount++
  const attempts = attemptsOf(s, msg)
  const limited = deliveryLimitEnforced(s)
  if (limited && attempts >= c.maxDeliveries) {
    deadLetter(s, msg, 'max-deliveries', from)
    return c.dlqEnabled ? 'dlq' : 'dropped'
  }
  msg.redelivered = true
  if (!limited && why !== 'shutdown' && msg.receiveCount === c.maxDeliveries) {
    note(s, 'no-redrive', 'warn', `SQS bez DLQ-a nema maxReceiveCount: narudžba #${msg.orderId} vraća se sve do isteka zadržavanja (zadano 4 dana)`, (n) => `Još ${plural(n, ['poruka kruži', 'poruke kruže', 'poruka kruži'])} bez DLQ-a`)
  }
  if (why === 'fail') {
    s.totals.retries++
    const delay = c.retryMode === 'backoff' ? fullJitterS(s.rng.jitter, attempts, c.backoffBaseS, c.backoffCapS) : 0
    const tail = delay > 0 ? `novi pokušaj za ${secs(delay)}` : 'odmah natrag u red'
    const cause = reason ? `${FAIL_TEXT[reason]}; ` : ''
    const count = rabbit && nack ? `isporuka ${msg.receiveCount}, nack se ne broji` : limited ? `pokušaj ${attempts}/${c.maxDeliveries}` : `pokušaj ${attempts}, bez ograničenja`
    note(s, 'retry', 'warn', `Narudžba #${msg.orderId} nije obrađena (${cause}${count}) – ${tail}`, (n) => `Još ${plural(n, ['ponovni pokušaj', 'ponovna pokušaja', 'ponovnih pokušaja'])}`)
    if (rabbit && nack && msg.receiveCount === c.maxDeliveries) {
      note(s, 'nack-loop', 'bad', `RabbitMQ: basic.nack se ne broji u delivery-limit – narudžba #${msg.orderId} kruži bez kraja`, (n) => `Još ${plural(n, ['poruka kruži', 'poruke kruže', 'poruka kruži'])} bez kraja (nack)`)
    }
    if (delay > 0) {
      msg.status = 'delayed'
      msg.delayedAt = t
      msg.visibleAt = t + delay
      s.delayed.push(msg)
      spanOpen(s, msg.orderId, 'čekanje na ponovni pokušaj', t, null, msg.receiveCount)
      fly(s, msg.id, msg.orderId, from, 'retry', 'warn')
      return 'delayed'
    }
    spanOpen(s, msg.orderId, 'red', t, null, msg.receiveCount + 1)
    fly(s, msg.id, msg.orderId, from, 'queue', 'warn')
    makeReady(s, msg, t, returnsToFront(s, msg, false))
    return 'requeued'
  }
  s.totals.redeliveries++
  spanClose(s, msg.orderId, 'nevidljivo do isteka roka', t, 'timeout')
  spanOpen(s, msg.orderId, 'red', t, null, msg.receiveCount + 1)
  if (why !== 'shutdown') fly(s, msg.id, msg.orderId, from, 'queue', 'warn')
  makeReady(s, msg, t, returnsToFront(s, msg, false))
  return 'requeued'
}

/**
 * RabbitMQ 4.3 consumer_timeout on a quorum queue: the broker cancels the consumer (AMQP 0.9.1 clients with
 * consumer_cancel_notify – pika, the Java client) and returns its unacked deliveries; delivery-count is not
 * incremented. The job in progress still finishes; its ack has no effect. The client then re-subscribes.
 */
function consumerTimedOut(s: QueueState, c: Consumer): void {
  s.totals.consumerTimeouts++
  const held: Delivery[] = []
  if (c.job?.delivery) held.push(c.job.delivery)
  held.push(...c.buffer)
  for (const d of held) {
    if (d.stale || d.autoAcked) continue // auto-acked deliveries already belong to the client
    s.unacked.delete(d.id)
    d.stale = true
    returnOrDeadLetter(s, d.msg, 'timeout', consumerPlace(c.id))
  }
  c.buffer = c.buffer.filter((d) => d.autoAcked)
  c.cancelled = c.job !== null
  wlog(s, c, 'WARN', c.job?.orderId ?? null, 'Posrednik je otkazao potrošača (consumer_timeout) – ponovna pretplata nakon ove narudžbe')
  emit(s, 'consumer-timeout', 'warn', `RabbitMQ: ${who(s, c, true)} nije potvrdio u roku (consumer_timeout) – potrošač otkazan, poruke se vraćaju u red`)
}

function releaseDelayed(s: QueueState, t: number): void {
  if (s.delayed.length === 0) return
  let due: Message[] | null = null
  const keep: Message[] = []
  for (const m of s.delayed) {
    if (m.visibleAt <= t + EPS) (due ??= []).push(m)
    else keep.push(m)
  }
  if (!due) return
  s.delayed = keep
  due.sort((a, b) => a.visibleAt - b.visibleAt || a.id - b.id)
  for (const m of due) {
    spanClose(s, m.orderId, 'čekanje na ponovni pokušaj', m.visibleAt, 'ok')
    spanOpen(s, m.orderId, 'red', m.visibleAt, null, m.receiveCount + 1)
    fly(s, m.id, m.orderId, 'retry', 'queue', 'warn')
    makeReady(s, m, m.visibleAt, returnsToFront(s, m, true))
  }
}

/** Ack deadlines run whatever the current ack mode: `unacked` only ever holds manual deliveries. */
function checkAckTimeouts(s: QueueState, t: number): void {
  if (s.unacked.size === 0) return
  const timeout = ackTimeoutOf(s)
  if (s.config.broker === 'sqs') {
    let expired: Delivery[] | null = null
    for (const d of s.unacked.values()) if (t - d.receivedAt >= timeout - EPS) (expired ??= []).push(d)
    if (!expired) return
    for (const d of expired) {
      s.unacked.delete(d.id)
      d.stale = true
      s.totals.visibilityExpired++
      note(s, 'visibility', 'warn', `SQS: istekao rok vidljivosti – narudžba #${d.msg.orderId} ponovno je vidljiva`, (n) => `SQS: rok vidljivosti istekao za još ${plural(n, ['poruku', 'poruke', 'poruka'])}`)
      // the copy reappears from the in-flight lane; a slow consumer still holds (and cooks) its own copy
      returnOrDeadLetter(s, d.msg, 'timeout', 'invisible')
    }
    return
  }
  let toCancel: Set<Consumer> | null = null
  let ownerless: Delivery[] | null = null
  for (const d of s.unacked.values()) {
    if (t - d.receivedAt < timeout - EPS) continue
    const c = s.consumers.find((x) => x.id === d.consumerId && x.status !== 'crashed')
    if (c) (toCancel ??= new Set()).add(c)
    else (ownerless ??= []).push(d)
  }
  if (toCancel) for (const c of toCancel) consumerTimedOut(s, c)
  // safety net: a delivery whose consumer is gone is returned like a closed connection
  if (ownerless) {
    for (const d of ownerless) {
      if (!s.unacked.has(d.id)) continue
      s.unacked.delete(d.id)
      d.stale = true
      returnOrDeadLetter(s, d.msg, 'crash', 'queue')
    }
  }
}

/** After a switch to RabbitMQ, SQS orphans (deliveries of crashed consumers) are requeued like a closed connection. */
export function requeueOrphans(s: QueueState): void {
  const orphans = [...s.unacked.values()].filter((d) => d.orphan)
  for (const d of orphans) {
    s.unacked.delete(d.id)
    d.stale = true
    returnOrDeadLetter(s, d.msg, 'crash', 'invisible')
  }
}

/* ------------------------------------------------------------------ orders, publishing, direct calls */

/** A new order arrives at the API (from the producer profile, a batch or the poison button). */
export function newOrder(s: QueueState, forcePoison: boolean): Order {
  const t = nowS(s)
  const u = s.rng.poison.next()
  const userId = s.rng.users.int(1, s.config.users)
  const order: Order = { id: ++s.ids.order, userId, createdAt: t, attempts: 0, poison: forcePoison || u < s.config.pPoison, resolved: false }
  s.totals.orders++
  s.orders.set(order.id, order)
  traceStart(s, order.id)
  attemptOrder(s, order)
  return order
}

function resolveOrder(s: QueueState, order: Order, ok: boolean): void {
  if (order.resolved) return
  order.resolved = true
  s.orders.delete(order.id)
  if (ok) s.totals.ordersAccepted++
  else {
    s.totals.ordersFailed++
    markBad(s, order.id, 'failed')
    recordImpact(s, order.id, order.userId)
  }
}

function attemptOrder(s: QueueState, order: Order): void {
  order.attempts++
  s.totals.arrivals++
  if (s.config.mode === 'direct') dispatchRequest(s, order)
  else publish(s, order)
}

/** A client attempt failed (503 / 5xx / timeout / reject-publish): retry with backoff or give up. */
function clientAttemptFailed(s: QueueState, order: Order): void {
  if (order.resolved) return
  const c = s.config
  if (order.attempts <= c.clientRetries) {
    s.totals.clientRetries++
    const delay = c.retryMode === 'backoff' ? fullJitterS(s.rng.client, order.attempts, c.backoffBaseS, c.backoffCapS) : DT
    s.clientRetryQueue.push({ order, at: nowS(s) + delay })
    return
  }
  resolveOrder(s, order, false)
}

function publish(s: QueueState, order: Order): void {
  const c = s.config
  const t = nowS(s)
  if (c.broker === 'rabbitmq' && Number.isFinite(c.maxQueue) && s.ready.size >= c.maxQueue) {
    if (c.overflow === 'reject-publish') {
      s.totals.rejectedPublish++
      spanMark(s, order.id, 'odgovor', t, 'fail', null, order.attempts)
      fly(s, 0, order.id, 'producer', 'lost', 'bad')
      note(s, 'reject-publish', 'warn', `Red pun (${c.maxQueue}) – objava narudžbe #${order.id} odbijena (reject-publish)`, (n) => `Red pun – još ${plural(n, ['odbijena objava', 'odbijene objave', 'odbijenih objava'])}`)
      clientAttemptFailed(s, order)
      return
    }
    while (s.ready.size >= c.maxQueue) {
      const head = takeReady(s)
      if (!head) break
      s.totals.droppedHead++
      deadLetter(s, head, 'max-length', 'queue')
    }
  }
  const msg: Message = {
    id: ++s.ids.msg,
    orderId: order.id,
    userId: order.userId,
    publishedAt: t,
    poison: order.poison,
    receiveCount: 0,
    deliveryCount: 0,
    redelivered: false,
    status: 'ready',
    visibleAt: t,
    delayedAt: t,
    lastDeliveryId: 0,
  }
  s.ready.push(msg)
  s.totals.published++
  s.little.inSystem++
  spanOpen(s, order.id, 'red', t, null, 1)
  fly(s, msg.id, msg.orderId, 'producer', 'queue', msg.poison ? 'bad' : 'info')
  resolveOrder(s, order, true)
}

function pickFreeWorker(s: QueueState): Consumer | null {
  const n = s.consumers.length
  for (let k = 0; k < n; k++) {
    const i = (s.rrDirect + k) % n
    const c = s.consumers[i]
    if (c.status === 'running' && !c.job && c.buffer.length === 0 && !c.cancelled) {
      s.rrDirect = (i + 1) % n
      return c
    }
  }
  return null
}

/** Direct mode: a pure loss system – no waiting room; all workers busy → 503 at once (Erlang B). */
function dispatchRequest(s: QueueState, order: Order): void {
  const t = nowS(s)
  const c = pickFreeWorker(s)
  if (!c) {
    s.totals.rejected503++
    spanMark(s, order.id, 'odgovor', t, 'fail', null, order.attempts)
    fly(s, 0, order.id, 'producer', 'lost', 'bad')
    note(s, 'rejected-503', 'bad', `503: svi radnici API-ja zauzeti (nema čekaonice) – narudžba #${order.id} odbijena`, (n) => `503: još ${plural(n, ['odbijena narudžba', 'odbijene narudžbe', 'odbijenih narudžbi'])}`)
    clientAttemptFailed(s, order)
    return
  }
  const req: DirectRequest = { id: ++s.ids.request, order, arrivedAt: t, timeoutAt: t + s.config.clientTimeoutS, clientGaveUp: false }
  s.little.inSystem++
  fly(s, 0, order.id, 'producer', consumerPlace(c.id), order.poison ? 'bad' : 'info')
  startJob(s, c, null, req)
}

function clientTimers(s: QueueState, t: number): void {
  for (const c of s.consumers) {
    const req = c.job?.request
    if (!req || req.clientGaveUp || t < req.timeoutAt - EPS) continue
    req.clientGaveUp = true
    s.totals.clientTimeouts++
    spanMark(s, req.order.id, 'odgovor', t, 'timeout', c.id, req.order.attempts)
    note(s, 'client-timeout', 'warn', `Klijent odustao nakon ${secs(s.config.clientTimeoutS)} – ${who(s, c, true)} i dalje obrađuje narudžbu #${req.order.id}`, (n) => `Još ${plural(n, ['klijent odustao', 'klijenta odustala', 'klijenata odustalo'])} (timeout)`)
    clientAttemptFailed(s, req.order)
  }
  if (s.clientRetryQueue.length === 0) return
  const due = s.clientRetryQueue.filter((r) => r.at <= t + EPS)
  if (due.length === 0) return
  s.clientRetryQueue = s.clientRetryQueue.filter((r) => r.at > t + EPS)
  due.sort((a, b) => a.at - b.at || a.order.id - b.order.id)
  for (const r of due) {
    if (r.order.resolved) continue
    note(s, 'client-retry', 'info', `Klijent ponovno šalje narudžbu #${r.order.id} (pokušaj ${r.order.attempts + 1})`, (n) => `Klijenti: još ${plural(n, ['ponovni pokušaj', 'ponovna pokušaja', 'ponovnih pokušaja'])}`)
    attemptOrder(s, r.order)
  }
}

/* ------------------------------------------------------------------ deliveries and jobs */

function deliverTo(s: QueueState, c: Consumer, msg: Message): void {
  const t = nowS(s)
  const auto = s.config.ackMode === 'auto'
  const d: Delivery = { id: ++s.ids.delivery, msg, consumerId: c.id, receivedAt: t, stale: false, autoAcked: auto, orphan: false }
  msg.receiveCount++
  msg.lastDeliveryId = d.id
  msg.status = auto ? 'consumed' : 'inflight'
  s.totals.delivered++
  if (!auto) s.unacked.set(d.id, d)
  c.buffer.push(d)
  fly(s, msg.id, msg.orderId, 'queue', consumerPlace(c.id), msg.poison ? 'bad' : msg.redelivered ? 'warn' : 'info')
}

/** Broker pushes visible messages round-robin to consumers with free prefetch capacity. */
function deliver(s: QueueState): void {
  const n = s.consumers.length
  if (n === 0 || s.ready.size === 0) return
  let i = s.rr % n
  let misses = 0
  while (s.ready.size > 0 && misses < n) {
    const c = s.consumers[i]
    if (hasCapacity(s, c)) {
      deliverTo(s, c, takeReady(s) as Message)
      if (!c.job) startNext(s, c)
      misses = 0
    } else misses++
    i = (i + 1) % n
  }
  s.rr = i
}

function startNext(s: QueueState, c: Consumer): void {
  if (c.job || (c.status !== 'running' && c.status !== 'stopping')) return
  while (c.buffer.length > 0) {
    const d = c.buffer.shift() as Delivery
    if (d.stale && s.config.broker === 'rabbitmq') continue // returned by the broker: the client drops it
    startJob(s, c, d, null)
    return
  }
}

function startJob(s: QueueState, c: Consumer, d: Delivery | null, req: DirectRequest | null): void {
  // Start at the exact moment both the consumer and the work were available (never in the future).
  const t = Math.min(nowS(s), Math.max(c.freeAt, d ? Math.max(d.msg.visibleAt, d.msg.publishedAt) : nowS(s)))
  const cfg = s.config
  const draw = s.rng.service.exp(1 / cfg.serviceMeanS)
  const work = cfg.serviceDist === 'fixed' ? cfg.serviceMeanS : draw
  const fault = effectiveFault(s, c)
  const total = work + (fault === 'slow' ? cfg.slowExtraS : 0)
  const u = s.rng.crash.next()
  const orderId = d ? d.msg.orderId : (req as DirectRequest).order.id
  const job: Job = {
    kind: d ? 'message' : 'request',
    delivery: d,
    request: req,
    orderId,
    poison: d ? d.msg.poison : (req as DirectRequest).order.poison,
    startedAt: t,
    phase: 'work',
    phaseStart: t,
    phaseEnd: t + total,
    workS: total,
    crashAt: fault === 'oom' ? t + (0.2 + 0.7 * u) * total : Infinity,
    smsFails: false,
    committed: false,
    smsAlreadyRecorded: false,
  }
  c.job = job
  if (d) {
    spanClose(s, orderId, 'red', t, 'ok')
    spanOpen(s, orderId, 'obrada', t, c.id, d.msg.receiveCount)
    wlog(s, c, 'INFO', orderId, `Narudžba #${orderId}: kuham (isporuka ${d.msg.receiveCount}${d.msg.redelivered ? ', ponovljena' : ''})`)
  } else {
    const order = (req as DirectRequest).order
    spanOpen(s, orderId, 'obrada', t, c.id, order.attempts)
    wlog(s, c, 'INFO', orderId, `POST /narudzbe #${orderId}: kuham (pokušaj klijenta ${order.attempts})`)
  }
}

/** The kitchen effect commits in one DB transaction (with the optional idempotency key and SMS record). */
function commitEffects(s: QueueState, c: Consumer, job: Job): void {
  const t = nowS(s)
  const tot = s.totals
  const id = job.orderId
  const prev = s.cooked.get(id) ?? 0
  if (prev > 0 && s.config.idempotent) {
    tot.alreadyCooked++
    pushCapped(s.kitchen, { id: ++s.ids.entry, t, orderId: id, kind: 'deduped', outOfOrder: false }, LOG_CAP)
    wlog(s, c, 'INFO', id, `Narudžba #${id}: već skuhano – preskačem (ključ idempotentnosti)`)
    note(s, 'deduped', 'ok', `Narudžba #${id}: već skuhano – duplikat bez učinka`, (n) => `Idempotentnost: još ${plural(n, ['duplikat', 'duplikata', 'duplikata'])} bez učinka`)
  } else {
    s.cooked.set(id, prev + 1)
    tot.effects++
    if (prev === 0) {
      tot.effectsUnique++
      const outOfOrder = id < s.maxCookedOrder
      if (outOfOrder) tot.outOfOrder++
      else s.maxCookedOrder = id
      pushCapped(s.kitchen, { id: ++s.ids.entry, t, orderId: id, kind: 'cooked', outOfOrder }, LOG_CAP)
    } else {
      tot.duplicates++
      pushCapped(s.kitchen, { id: ++s.ids.entry, t, orderId: id, kind: 'duplicate', outOfOrder: false }, LOG_CAP)
      note(s, 'duplicate', 'bad', `Narudžba #${id} skuhana ${prev + 1 === 2 ? 'dvaput' : `${prev + 1} puta`}!`, (n) => `Još ${plural(n, ['dvostruka narudžba', 'dvostruke narudžbe', 'dvostrukih narudžbi'])}`)
    }
  }
  if (s.config.smsGuard === 'record-first') {
    job.smsAlreadyRecorded = s.smsRecorded.has(id)
    s.smsRecorded.add(id)
  }
  job.committed = true
}

function deliverSms(s: QueueState, orderId: number, late: boolean): void {
  const t = nowS(s)
  const prev = s.smsSentBy.get(orderId) ?? 0
  s.smsSentBy.set(orderId, prev + 1)
  s.totals.smsSent++
  if (s.smsLostIds.delete(orderId)) s.totals.smsLost-- // it did go out in the end
  if (prev === 0) {
    s.totals.smsUnique++
    pushCapped(s.smsLog, { id: ++s.ids.entry, t, orderId, kind: late ? 'resent' : 'sent' }, LOG_CAP)
  } else {
    s.totals.smsDuplicates++
    pushCapped(s.smsLog, { id: ++s.ids.entry, t, orderId, kind: 'duplicate' }, LOG_CAP)
    note(s, 'sms-duplicate', 'warn', `SMS za narudžbu #${orderId} poslan dvaput`, (n) => `Još ${plural(n, ['dvostruki SMS', 'dvostruka SMS-a', 'dvostrukih SMS-ova'])}`)
  }
}

function markSmsLost(s: QueueState, orderId: number): void {
  if (s.smsSentBy.has(orderId) || s.smsLostIds.has(orderId)) return
  if (s.smsOutbox.some((o) => o.orderId === orderId)) return
  s.smsLostIds.add(orderId)
  s.totals.smsLost++
  pushCapped(s.smsLog, { id: ++s.ids.entry, t: nowS(s), orderId, kind: 'lost' }, LOG_CAP)
  note(s, 'sms-lost', 'warn', `SMS za narudžbu #${orderId} zapisan kao poslan, ali nije otišao`, (n) => `Još ${plural(n, ['izgubljeni SMS', 'izgubljena SMS-a', 'izgubljenih SMS-ova'])}`)
}

/** Send through the provider (with its idempotency key when smsGuard is 'provider-key'). */
function providerSend(s: QueueState, orderId: number, late: boolean): void {
  if (s.config.smsGuard === 'provider-key') {
    if (s.smsProviderKeys.has(orderId)) {
      s.totals.smsDeduped++
      pushCapped(s.smsLog, { id: ++s.ids.entry, t: nowS(s), orderId, kind: 'deduped' }, LOG_CAP)
      return
    }
    s.smsProviderKeys.add(orderId)
  }
  deliverSms(s, orderId, late)
}

function sendSms(s: QueueState, job: Job): void {
  const id = job.orderId
  if (s.config.smsGuard === 'record-first' && job.smsAlreadyRecorded) {
    // recorded by an earlier delivery: skip – if that one never sent it, it is lost for good
    pushCapped(s.smsLog, { id: ++s.ids.entry, t: nowS(s), orderId: id, kind: 'skipped' }, LOG_CAP)
    markSmsLost(s, id)
    return
  }
  providerSend(s, id, false)
}

/** The SMS call failed and nobody retries it (direct mode, or smsOnFailure 'nack-message'). */
function smsFailed(s: QueueState, job: Job): void {
  const id = job.orderId
  pushCapped(s.smsLog, { id: ++s.ids.entry, t: nowS(s), orderId: id, kind: 'failed' }, LOG_CAP)
  // record then send: recorded in this transaction, never sent – and every retry will skip it
  if (s.config.smsGuard === 'record-first' && !job.smsAlreadyRecorded) markSmsLost(s, id)
}

/**
 * smsOnFailure 'retry-sms': the order is acked; the SMS goes to a retry relay with full jitter. The relay row is
 * written only when the call fails – it is not a transactional outbox (a crash between the commit and the SMS call
 * is not covered).
 */
function deferSms(s: QueueState, c: Consumer, job: Job): void {
  const id = job.orderId
  if (s.config.smsGuard === 'record-first' && job.smsAlreadyRecorded) {
    pushCapped(s.smsLog, { id: ++s.ids.entry, t: nowS(s), orderId: id, kind: 'skipped' }, LOG_CAP)
    markSmsLost(s, id)
    return
  }
  const cfg = s.config
  s.totals.smsDeferred++
  s.smsOutbox.push({ orderId: id, attempts: 1, at: nowS(s) + fullJitterS(s.rng.smsRelay, 1, cfg.backoffBaseS, cfg.backoffCapS) })
  pushCapped(s.smsLog, { id: ++s.ids.entry, t: nowS(s), orderId: id, kind: 'deferred' }, LOG_CAP)
  fly(s, 0, id, consumerPlace(c.id), 'sms', 'warn')
  note(s, 'sms-deferred', 'warn', `SMS za narudžbu #${id} nije poslan (SMS-gateway ne odgovara ${secs(cfg.smsTimeoutS)}) – narudžba je potvrđena, SMS čeka ponovno slanje`, (n) => `Još ${plural(n, ['SMS čeka', 'SMS-a čekaju', 'SMS-ova čeka'])} ponovno slanje`, 5)
}

/** The SMS retry relay: due items are tried again; while the gateway is down each try times out and backs off. */
function smsRelay(s: QueueState, t: number): void {
  if (s.smsOutbox.length === 0) return
  const cfg = s.config
  let sent = false
  for (const o of s.smsOutbox) {
    if (o.at > t + EPS) continue
    if (s.sms.state === 'down') {
      o.attempts++
      o.at = t + cfg.smsTimeoutS + fullJitterS(s.rng.smsRelay, o.attempts, cfg.backoffBaseS, cfg.backoffCapS)
      continue
    }
    o.at = -1
    sent = true
    s.totals.smsResent++
    providerSend(s, o.orderId, true)
    note(s, 'sms-resent', 'ok', `SMS za narudžbu #${o.orderId} poslan s odgodom`, (n) => `S odgodom poslano još ${plural(n, ['SMS', 'SMS-a', 'SMS-ova'])}`, 5)
  }
  if (sent) s.smsOutbox = s.smsOutbox.filter((o) => o.at >= 0)
}

function completeMessage(s: QueueState, msg: Message, c: Consumer | null): void {
  const t = nowS(s)
  msg.status = 'done'
  s.totals.completed++
  const latency = t - msg.publishedAt
  recordLatency(s, latency, t)
  if (latency > s.config.sloS + EPS) recordImpact(s, msg.orderId, msg.userId)
  departure(s, msg.publishedAt, t)
  spanMark(s, msg.orderId, 'potvrda', t, 'ok', c ? c.id : null, msg.receiveCount)
  fly(s, msg.id, msg.orderId, c ? consumerPlace(c.id) : 'queue', 'done', 'ok')
}

function lateAck(s: QueueState, d: Delivery, c: Consumer): void {
  const msg = d.msg
  s.totals.staleAcks++
  if (s.config.broker === 'sqs' && msg.lastDeliveryId === d.id && (msg.status === 'ready' || msg.status === 'delayed')) {
    // the receipt handle is still the latest one: the late DeleteMessage works
    if (msg.status === 'ready') removeReady(s, msg)
    else s.delayed = s.delayed.filter((m) => m !== msg)
    spanClose(s, msg.orderId, msg.status === 'ready' ? 'red' : 'čekanje na ponovni pokušaj', nowS(s), 'ok')
    completeMessage(s, msg, c)
    wlog(s, c, 'INFO', msg.orderId, `Narudžba #${msg.orderId}: DeleteMessage uspio (zakašnjelo, poruka još nije bila ponovno preuzeta)`)
    emit(s, 'late-ack', 'info', `SQS: zakašnjelo brisanje uspjelo – narudžba #${msg.orderId} još nije bila ponovno preuzeta`)
    return
  }
  spanMark(s, msg.orderId, 'potvrda', nowS(s), 'timeout', c.id, d.msg.receiveCount)
  if (s.config.broker === 'sqs') {
    wlog(s, c, 'WARN', msg.orderId, `Narudžba #${msg.orderId}: DeleteMessage sa starim ReceiptHandleom – poruka nije obrisana`)
    note(s, 'late-ack', 'warn', `SQS: zakašnjelo brisanje bez učinka – narudžba #${msg.orderId} već je ponovno isporučena`, (n) => `SQS: još ${plural(n, ['zakašnjelo brisanje', 'zakašnjela brisanja', 'zakašnjelih brisanja'])} bez učinka`)
  } else {
    wlog(s, c, 'WARN', msg.orderId, `Narudžba #${msg.orderId}: potvrda bez učinka – poruka je već vraćena u red`)
    note(s, 'late-ack', 'warn', `RabbitMQ: potvrda za narudžbu #${msg.orderId} bez učinka – poruka je već vraćena u red`, (n) => `RabbitMQ: još ${plural(n, ['zakašnjela potvrda', 'zakašnjele potvrde', 'zakašnjelih potvrda'])} bez učinka`)
  }
}

function endJob(s: QueueState, c: Consumer): void {
  if (c.job) c.freeAt = c.job.phaseEnd
  c.job = null
  c.processed++
  c.cancelled = false // the client re-subscribes after its job
  if (c.status === 'stopping') {
    if (c.buffer.length > 0) startNext(s, c)
    if (!c.job && c.buffer.length === 0) removeConsumer(s, c)
    return
  }
  startNext(s, c)
}

function finishSuccess(s: QueueState, c: Consumer, job: Job): void {
  const t = nowS(s)
  if (job.request) {
    const req = job.request
    if (!req.clientGaveUp) {
      s.totals.completed++
      s.totals.directOk++
      const latency = t - req.order.createdAt
      recordLatency(s, latency, t)
      if (latency > s.config.sloS + EPS) recordImpact(s, req.order.id, req.order.userId)
      resolveOrder(s, req.order, true)
      spanMark(s, req.order.id, 'odgovor', t, 'ok', c.id, req.order.attempts)
      wlog(s, c, 'INFO', req.order.id, `POST /narudzbe #${req.order.id} → 200 (${fastSecs(t - job.startedAt)})`)
      fly(s, 0, req.order.id, consumerPlace(c.id), 'done', 'ok')
    } else wlog(s, c, 'WARN', req.order.id, `POST /narudzbe #${req.order.id}: skuhano, ali klijent je već odustao`)
    departure(s, req.arrivedAt, t)
  } else if (job.delivery) {
    const d = job.delivery
    if (d.autoAcked || !d.stale) {
      if (!d.autoAcked) s.unacked.delete(d.id)
      wlog(s, c, 'INFO', d.msg.orderId, `Narudžba #${d.msg.orderId}: gotovo${d.autoAcked ? '' : ', potvrđeno'} (${fastSecs(t - job.startedAt)})`)
      completeMessage(s, d.msg, c)
    } else lateAck(s, d, c)
  }
  endJob(s, c)
}

function finishFailure(s: QueueState, c: Consumer, job: Job, reason: FailReason): void {
  const t = nowS(s)
  s.totals.failedAttempts++
  if (job.request) {
    const req = job.request
    wlog(s, c, 'ERROR', req.order.id, `POST /narudzbe #${req.order.id} → 500 (${FAIL_TEXT[reason]})`)
    if (!req.clientGaveUp) {
      s.totals.failed5xx++
      s.totals.failed500++
      spanMark(s, req.order.id, 'odgovor', t, 'fail', c.id, req.order.attempts)
      fly(s, 0, req.order.id, consumerPlace(c.id), 'lost', 'bad')
      note(s, 'failed-5xx', 'bad', `500: narudžba #${req.order.id} nije uspjela (${FAIL_TEXT[reason]})`, (n) => `5xx: još ${plural(n, ['neuspjela narudžba', 'neuspjele narudžbe', 'neuspjelih narudžbi'])}`)
      clientAttemptFailed(s, req.order)
    }
    departure(s, req.arrivedAt, t)
  } else if (job.delivery) {
    const d = job.delivery
    const id = d.msg.orderId
    if (d.autoAcked) {
      if (job.committed) {
        // the handler threw after the commit (SMS), but the message was acked at delivery: cooked, not redelivered
        wlog(s, c, 'ERROR', id, `Narudžba #${id}: skuhano, SMS nije poslan (${FAIL_TEXT[reason]}) – poruka je već potvrđena`)
        completeMessage(s, d.msg, c)
      } else {
        wlog(s, c, 'ERROR', id, `Narudžba #${id}: obrada nije uspjela (${FAIL_TEXT[reason]}) – poruka je potvrđena pri isporuci i gubi se`)
        loseMessage(s, d.msg, `Automatska potvrda: narudžba #${id} izgubljena (obrada nije uspjela)`)
      }
    } else if (!d.stale) {
      wlog(s, c, 'ERROR', id, reason === 'poison' ? `Narudžba #${id}: neispravan sadržaj poruke (otrovna poruka) – poruka se vraća` : `Narudžba #${id}: obrada nije uspjela (${FAIL_TEXT[reason]}) – poruka se vraća`)
      s.unacked.delete(d.id)
      returnOrDeadLetter(s, d.msg, 'fail', consumerPlace(c.id), reason)
    } else wlog(s, c, 'ERROR', id, `Narudžba #${id}: obrada nije uspjela (${FAIL_TEXT[reason]}); poruka je već vraćena u red`)
  }
  endJob(s, c)
}

/** Advance the consumer's job through work → commit → SMS → ack, handling crashes and failures. */
function advanceJob(s: QueueState, c: Consumer, t: number): void {
  for (let guard = 0; guard < 16 && c.job; guard++) {
    const job: Job = c.job
    if (job.phase === 'work') {
      if (job.crashAt <= t + EPS && job.crashAt < job.phaseEnd) {
        crashNow(s, c, 'oom')
        return
      }
      if (job.phaseEnd > t + EPS) return
      const u = s.rng.fail.next()
      if (job.poison || u < s.config.pFail) {
        // the broker sees the failure when the message is returned (this tick), so the next span starts there
        spanClose(s, job.orderId, 'obrada', t, 'fail', c.id)
        finishFailure(s, c, job, job.poison ? 'poison' : 'error')
        continue
      }
      spanClose(s, job.orderId, 'obrada', job.phaseEnd, 'ok', c.id)
      commitEffects(s, c, job)
      // the armed „after the commit, before the SMS call” crash: cooked and recorded, no SMS attempt, no ack
      if (c.crashArmed && c.crashArmedPoint === 'after-commit') {
        crashNow(s, c, 'after-commit')
        return
      }
      const gw = s.sms.state
      job.phase = 'sms'
      job.phaseStart = job.phaseEnd
      job.smsFails = gw === 'down'
      job.phaseEnd = job.phaseStart + (gw === 'ok' ? 0 : gw === 'slow' ? s.config.smsSlowS : s.config.smsTimeoutS)
      spanOpen(s, job.orderId, 'SMS', job.phaseStart, c.id, job.delivery ? job.delivery.msg.receiveCount : (job.request?.order.attempts ?? 1))
      continue
    }
    if (job.phaseEnd > t + EPS) return
    const direct = job.request !== null
    const relay = !direct && s.config.smsOnFailure === 'retry-sms'
    spanClose(s, job.orderId, 'SMS', job.phaseEnd, job.smsFails ? 'timeout' : 'ok', c.id)
    if (job.smsFails) {
      wlog(s, c, 'WARN', job.orderId, `Narudžba #${job.orderId}: SMS-gateway ne odgovara (timeout ${secs(s.config.smsTimeoutS)})${relay ? ' – SMS čeka ponovno slanje' : ''}`)
      if (relay) deferSms(s, c, job)
      else smsFailed(s, job)
    } else sendSms(s, job)
    // the armed „after cooking, before ack” crash fires after the SMS attempt, whatever its outcome
    if (c.crashArmed) {
      crashNow(s, c, 'after-effect')
      return
    }
    if (job.smsFails && !relay) finishFailure(s, c, job, 'sms')
    else finishSuccess(s, c, job)
  }
}

/* ------------------------------------------------------------------ KEDA + HPA */

/**
 * The queue metric KEDA / the HPA see: RabbitMQ `messages` (ready + unacked – KEDA's http protocol) or ready
 * only (amqp protocol, or excludeUnacknowledged).
 */
export function queueMetric(s: QueueState, kind: 'ready' | 'ready+unacked' = s.config.autoscaler.metric): number {
  return kind === 'ready' ? s.ready.size : s.ready.size + s.unacked.size
}

export function scaleTo(s: QueueState, n: number, reason: ScalerDecision['reason'], metric: number, text: string): void {
  const sc = s.scaler
  const from = sc.replicas
  sc.replicas = n
  setConsumerTarget(s, n, true)
  const decision: ScalerDecision = { t: nowS(s), from, to: n, metric, reason, text }
  sc.lastDecision = decision
  pushCapped(sc.history, decision, 50)
  s.totals.scaleEvents++
  const p = s.config.podNamePrefix
  if (reason === 'keda-activate') kubeEvent(s, 'Normal', 'KEDAScaleTargetActivated', `scaledobject/${p}`, `Scaled apps/v1.Deployment klopa/${p} from 0 to ${n}, triggered by rabbitMQScaler`)
  else if (reason === 'keda-cooldown') kubeEvent(s, 'Normal', 'KEDAScaleTargetDeactivated', `scaledobject/${p}`, `Deactivated apps/v1.Deployment klopa/${p} from ${from} to 0`)
  else kubeEvent(s, 'Normal', 'SuccessfulRescale', `horizontalpodautoscaler/keda-hpa-${p}`, `New size: ${n}; reason: external metric s0-rabbitmq-narudzbe ${n > from ? 'above' : 'below'} target`)
  kubeEvent(s, 'Normal', 'ScalingReplicaSet', `deployment/${p}`, `Scaled ${n > from ? 'up' : 'down'} replica set ${replicaSetName(s, s.revision)} from ${from} to ${n}`)
  emit(s, 'scale', 'info', text)
}

function autoscale(s: QueueState, t: number): void {
  const a = s.config.autoscaler
  const sc = s.scaler
  if (t >= sc.nextPollAt - EPS) {
    sc.nextPollAt = t + a.pollingIntervalS
    const m = queueMetric(s)
    sc.lastMetric = m
    sc.active = m > a.activationQueueLength
    if (sc.active) {
      sc.lastActiveAt = t
      if (sc.replicas === 0) {
        const to = Math.max(1, a.minReplicas)
        scaleTo(s, to, 'keda-activate', m, `KEDA: u redu ima poruka (${m}) – potrošači 0 → ${to}`)
      }
    } else if (sc.replicas > 0 && a.minReplicas === 0 && t - sc.lastActiveAt >= a.cooldownPeriodS - EPS) {
      scaleTo(s, 0, 'keda-cooldown', m, `KEDA: red prazan dulje od ${controlDurationLabel(a.cooldownPeriodS, a.realPerSim)} – potrošači ${sc.replicas} → 0`)
    }
  }
  if (t >= sc.nextHpaAt - EPS) {
    sc.nextHpaAt = t + a.hpaSyncS
    if (sc.replicas < 1) return
    const m = queueMetric(s)
    const cur = sc.replicas
    const minR = Math.max(1, a.minReplicas)
    // the HPA controller seeds its recommendations with the current replicas (recordInitialRecommendation)
    if (sc.recs.length === 0) sc.recs.push({ t, r: cur })
    const hpa = hpaDesiredReplicas(m, a.targetQueueLength, cur, a.tolerance)
    const rec = Math.min(a.maxReplicas, Math.max(minR, hpa.desired))
    sc.recs.push({ t, r: rec })
    sc.recs = sc.recs.filter((x) => x.t > t - a.scaleDownStabilizationS - EPS)
    let desired = rec
    if (rec < cur) desired = Math.min(cur, Math.max(...sc.recs.map((x) => x.r)))
    let limited = false
    if (desired > cur) {
      const limit = Math.max(Math.ceil(cur * (1 + a.scaleUpPercent / 100)), cur + a.scaleUpPods)
      if (desired > limit) {
        desired = limit
        limited = true
      }
    }
    if (desired === cur) return
    const fmtM = m.toLocaleString('hr-HR')
    const tgt = a.targetQueueLength.toLocaleString('hr-HR')
    const why = limited
      ? ' (ograničenje brzine skaliranja)'
      : rec < cur && desired !== rec
        ? ` (prozor stabilizacije: ${a.realPerSim === 1 ? formatDuration(a.scaleDownStabilizationS) : `${formatDuration(a.scaleDownStabilizationS)} sim, stvarno ${formatDuration(a.scaleDownStabilizationS * a.realPerSim)}`})`
        : hpa.desired > a.maxReplicas && desired === a.maxReplicas
          ? ` (maxReplicas = ${a.maxReplicas})`
          : hpa.desired < minR && desired === minR
            ? ` (HPA drži najmanje ${minR}; na 0 spušta KEDA)`
            : ''
    const text = hpa.withinTolerance
      ? `HPA: ${fmtM} / (${tgt} · ${cur}) unutar tolerancije – potrošači ${cur} → ${desired}`
      : `HPA: ceil(${fmtM} / ${tgt}) = ${hpa.desired} → potrošači ${cur} → ${desired}${why}`
    scaleTo(s, desired, 'hpa', m, text)
  }
}

/* ------------------------------------------------------------------ rollout (new ReplicaSet) */

/**
 * One step of a Deployment rolling update, like the deployment controller: scale the new ReplicaSet up while the
 * total stays ≤ desired + maxSurge; scale old Pods down by at most total − minAvailable − (new Pods not ready),
 * unhealthy old Pods first (removing them never lowers availability), healthy ones only while the running count
 * stays ≥ desired − maxUnavailable.
 */
function rolloutTick(s: QueueState): void {
  const ro = s.rollout
  if (!ro) return
  const N = desiredReplicas(s)
  const running = (xs: Consumer[]) => xs.filter((c) => c.status === 'running').length
  const rsNew = replicaSetName(s, ro.revision)
  const p = s.config.podNamePrefix
  let active = activeConsumers(s)
  let neu = active.filter((c) => c.revision === ro.revision)
  const add = Math.min(N - neu.length, N + ro.maxSurge - active.length)
  if (add > 0) {
    for (let i = 0; i < add; i++) addConsumer(s, true, null, ro.startupS)
    kubeEvent(s, 'Normal', 'ScalingReplicaSet', `deployment/${p}`, `Scaled up replica set ${rsNew} from ${neu.length} to ${neu.length + add}`)
  }
  active = activeConsumers(s)
  neu = active.filter((c) => c.revision === ro.revision)
  const old = active.filter((c) => c.revision !== ro.revision)
  const minAvailable = Math.max(0, N - ro.maxUnavailable)
  let budget = active.length - minAvailable - (neu.length - running(neu))
  if (budget > 0 && old.length > 0) {
    const removed = new Map<number, number>()
    const stop = (c: Consumer) => {
      stopConsumer(s, c)
      budget--
      removed.set(c.revision, (removed.get(c.revision) ?? 0) + 1)
    }
    for (const c of old.filter((x) => x.status !== 'running')) {
      if (budget <= 0) break
      stop(c)
    }
    let available = running(activeConsumers(s))
    for (const c of old.filter((x) => x.status === 'running').sort((a, b) => b.id - a.id)) {
      if (budget <= 0 || available - 1 < minAvailable) break
      stop(c)
      available--
    }
    for (const [rev, n] of removed) {
      const before = old.filter((c) => c.revision === rev).length
      kubeEvent(s, 'Normal', 'ScalingReplicaSet', `deployment/${p}`, `Scaled down replica set ${replicaSetName(s, rev)} from ${before} to ${before - n}`)
    }
  }
  const rest = activeConsumers(s)
  if (rest.every((c) => c.revision === ro.revision) && running(rest) >= N) {
    s.rollout = null
    emit(s, 'rollout', 'ok', `Rollout završen: ${plural(rest.length, ['novi Pod', 'nova Poda', 'novih Podova'])} (${rsNew}), stari ReplicaSet ugašen`)
  }
}

/* ------------------------------------------------------------------ the tick */

/** Orders of a burst range: cooked, lost for good (failed, dropped, auto-ack loss, DLQ) and still pending. */
export function burstCounts(s: QueueState, first: number, last: number): { orders: number; cooked: number; lost: number; pending: number } {
  let cooked = 0
  let lost = 0
  for (let id = first; id <= last; id++) {
    if (s.badOrders.has(id)) lost++
    else if (s.cooked.has(id)) cooked++
  }
  const orders = Math.max(0, last - first + 1)
  return { orders, cooked, lost, pending: orders - cooked - lost }
}

function trackBurst(s: QueueState, t: number): void {
  const b = burstAt(s, t)
  const tr = s.burst
  if (b && !tr.active) {
    tr.active = true
    tr.source = b.source
    tr.startedAt = t
    tr.rate = b.rate
    tr.arrivalsAtStart = s.totals.orders
    tr.ordersDuring = 0
    tr.firstOrderId = s.ids.order + 1
    tr.lastOrderId = null
    tr.done = false
    tr.doneAt = null
    tr.failed = false
    if (b.source === 'profile') emit(s, 'burst', 'info', `Nalet: ${plural(b.rate, ORDERS)}/s tijekom ${secs(b.endS - t)}`)
  } else if (!b && tr.active) {
    tr.active = false
    tr.lastEndedAt = t
    tr.lastOrderId = s.ids.order
    tr.ordersDuring = s.totals.orders - tr.arrivalsAtStart
    emit(s, 'burst-end', 'info', `Nalet završio: ${plural(tr.ordersDuring, ORDERS)} za ${secs(t - (tr.startedAt ?? t))}; λ opet ${rate1(rateAt(s, t))}/s`)
  } else if (tr.active) tr.ordersDuring = s.totals.orders - tr.arrivalsAtStart
}

/** Latch the outcome of the last burst once it ended: fully served (every order cooked, none lost) or failed. */
function evalBurst(s: QueueState, t: number): void {
  const tr = s.burst
  if (tr.active || tr.done || tr.failed || tr.firstOrderId === null || tr.lastOrderId === null) return
  const o = burstCounts(s, tr.firstOrderId, tr.lastOrderId)
  if (o.lost > 0) tr.failed = true
  else if (o.orders > 0 && o.cooked === o.orders) {
    tr.done = true
    tr.doneAt = t
    tr.servedBursts++
    emit(s, 'served', 'ok', `Nalet obrađen do kraja: ${plural(o.orders, ORDERS)}, nijedna izgubljena`)
  }
}

function arrivals(s: QueueState, t: number): void {
  const lam = rateAt(s, t)
  if (lam <= 0) return
  s.arrivalAcc += lam * DT
  for (let guard = 0; s.arrivalAcc >= s.nextE && guard < 100_000; guard++) {
    s.arrivalAcc -= s.nextE
    s.nextE = s.config.arrivals === 'poisson' ? s.rng.arrivals.exp(1) : 1
    newOrder(s, false)
  }
}

/** Write the current depth-like values into the newest chart sample (so a paused action shows at once). */
export function sampleNow(s: QueueState): void {
  const se = s.series
  const set = (x: Series, v: number) => {
    if (x.values.length === 0) x.push(v)
    else x.values[x.values.length - 1] = v
  }
  set(se.ready, s.ready.size)
  set(se.delayed, s.delayed.length)
  set(se.unacked, s.unacked.size)
  set(se.inSystem, s.little.inSystem)
  set(se.busy, s.consumers.filter((c) => c.job !== null).length)
  set(se.replicas, activeConsumers(s).length)
  set(se.dlq, s.totals.dlq)
  set(se.duplicates, s.totals.duplicates)
  set(se.lost, s.totals.ordersFailed + s.totals.dropped + s.totals.lostAutoAck)
  set(se.oldestAgeS, oldestAgeOf(s))
  set(se.lambda, rateAt(s, nowS(s)))
  set(se.capacity, capacityPerS(s))
}

/** Counter the RED „Errors” rate is built from. */
const errorCount = (t: Totals): number => t.failedAttempts + t.crashes + t.rejected503 + t.rejectedPublish + t.clientTimeouts

function sample(s: QueueState): void {
  const w = s.win
  const tot = s.totals
  const push = (arr: number[], v: number, cap: number) => {
    arr.push(v)
    if (arr.length > cap) arr.shift()
  }
  const errs = errorCount(tot)
  const rets = tot.retries + tot.redeliveries
  push(w.inD, tot.arrivals - w.lastIn, RATE_WINDOW)
  push(w.outD, tot.completed - w.lastOut, RATE_WINDOW)
  push(w.errD, errs - w.lastErr, RATE_WINDOW)
  push(w.retryD, rets - w.lastRetry, RATE_WINDOW)
  push(w.busyD, w.busyAcc, UTIL_WINDOW)
  push(w.aliveD, w.aliveAcc, UTIL_WINDOW)
  w.lastIn = tot.arrivals
  w.lastOut = tot.completed
  w.lastErr = errs
  w.lastRetry = rets
  w.busyAcc = 0
  w.aliveAcc = 0
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
  const span = w.inD.length * SAMPLE_S
  const t = nowS(s)
  while (s.latWin.size > 0 && (s.latWin.peek() as readonly [number, number])[0] < t - LATENCY_WINDOW_S - EPS) s.latWin.shift()
  const lat = s.latWin.slice().map((x) => x[1])
  lat.sort((a, b) => a - b)
  const pct = (p: number) => (lat.length >= MIN_SAMPLES ? lat[Math.min(lat.length - 1, Math.max(0, Math.ceil(p * lat.length) - 1))] : null)
  const alive = sum(w.aliveD)
  s.live = {
    rateIn: span > 0 ? sum(w.inD) / span : 0,
    rateOut: span > 0 ? sum(w.outD) / span : 0,
    errorRate: span > 0 ? sum(w.errD) / span : 0,
    retryRate: span > 0 ? sum(w.retryD) / span : 0,
    utilization: alive > 0 ? sum(w.busyD) / alive : 0,
    p50: pct(0.5),
    p95: pct(0.95),
    latN: lat.length,
  }
  const se = s.series
  for (const x of [se.ready, se.delayed, se.unacked, se.inSystem, se.busy, se.replicas, se.dlq, se.duplicates, se.lost, se.oldestAgeS, se.lambda, se.capacity]) x.push(0)
  se.rateIn.push(s.live.rateIn)
  se.rateOut.push(s.live.rateOut)
  se.p95.push(s.live.p95 ?? 0)
  se.errors.push(s.live.errorRate)
  se.retries.push(s.live.retryRate)
  sampleNow(s)
  evalBurst(s, t)
}

/**
 * One event per episode: the backlog starts growing (offered load λ × attempts per order > capacity Σμ of the
 * running consumers, faults included), or messages wait with no running consumer.
 */
function narrate(s: QueueState, t: number): void {
  if (s.config.mode !== 'queue') {
    s.narr.growing = false
    s.narr.noConsumers = false
    return
  }
  const n = s.narr
  const running = s.consumers.filter((c) => c.status === 'running')
  const k = running.length
  const lam = rateAt(s, t)
  const att = attemptsPerOrder(s)
  // a message that loops forever (nack / SQS without a DLQ) is narrated by its own line, not as infinite load
  const mult = Number.isFinite(att) ? att : 1
  const offered = lam * mult
  const kmu = capacityPerS(s)
  const growing = offered > kmu + 1e-6
  if (growing && !n.growing && t - n.growingAt >= NARRATE_REARM_S) {
    const slow = running.filter((c) => effectiveFault(s, c) === 'slow').length
    const oom = running.filter((c) => effectiveFault(s, c) === 'oom').length
    const faults = [slow > 0 ? `spori: ${slow}` : '', oom > 0 ? `OOM: ${oom}` : ''].filter(Boolean).join(', ')
    const load = mult > 1 + 5e-4 ? `λ ${rate1(lam)}/s × ${rate1(mult)} pokušaja = ${rate1(offered)}/s` : `λ ${rate1(lam)}/s`
    emit(s, 'backlog-growing', 'warn', `Red raste: ${load} > kμ ${rate1(kmu)}/s (+${rate1(offered - kmu)} poruka/s)${faults ? ` – potrošači ${faults}` : ''}`)
    n.growingAt = t
  }
  n.growing = growing
  const none = k === 0 && s.ready.size + s.delayed.length > 0
  if (none && !n.noConsumers && t - n.noConsumersAt >= NARRATE_REARM_S) {
    emit(s, 'no-consumers', 'warn', 'Nema aktivnih potrošača – poruke čekaju u redu')
    n.noConsumersAt = t
  }
  n.noConsumers = none
}

function trackDrain(s: QueueState, t: number, running: number): void {
  const backlog = s.ready.size + s.delayed.length
  const d = s.drain
  const cap = capacityPerS(s)
  const newPeak = () => {
    d.peak = backlog
    d.peakAt = t
    d.consumersMin = running
    d.consumersMax = running
    d.capacityMin = cap
    d.arrivalsAtPeak = s.totals.arrivals
  }
  if (backlog > 0) {
    if (!d.active) {
      d.active = true
      d.startedAt = t
      newPeak()
    } else if (backlog > d.peak) newPeak()
    else {
      d.consumersMin = Math.min(d.consumersMin, running)
      d.consumersMax = Math.max(d.consumersMax, running)
      d.capacityMin = Math.min(d.capacityMin, cap)
    }
  } else if (d.active) {
    d.active = false
    if (d.peak >= DRAIN_MIN_PEAK) {
      const durationS = t - d.peakAt
      const arrivalsDuring = s.totals.arrivals - d.arrivalsAtPeak
      const lam = durationS > 0 ? arrivalsDuring / durationS : 0
      const spare = d.capacityMin - lam
      d.last = {
        startedAt: d.startedAt,
        peak: d.peak,
        peakAt: d.peakAt,
        emptyAt: t,
        durationS,
        consumersMin: d.consumersMin,
        consumersMax: d.consumersMax,
        capacityMin: d.capacityMin,
        arrivalsDuring,
        predictedS: spare > 0 ? d.peak / spare : null,
      }
      emit(s, 'drained', 'ok', `Red ispražnjen: vrh ${plural(d.peak, ['poruka', 'poruke', 'poruka'])}, prazan ${rate1(durationS)} s nakon vrha`)
    }
    d.peak = 0
  }
}

/** Fire script entries whose time falls in the tick that is about to run. */
export function fireScript(s: QueueState, script: readonly { atS: number; run: (s: QueueState) => void }[] | null | undefined): void {
  if (!script) return
  const t0 = s.tick * DT
  for (const e of script) if (e.atS >= t0 - 1e-9 && e.atS < t0 + DT - 1e-9) e.run(s)
}

/** One fixed 10 ms step (fires the state's preset script first). */
export function tick(s: QueueState): void {
  fireScript(s, s.script)
  const t = s.tick * DT
  const c = s.config

  // 1. timers: SMS gateway recovery, consumer restarts and Pod start-ups
  if (s.sms.until !== null && t >= s.sms.until - EPS) {
    s.sms = { state: 'ok', until: null }
    s.config = { ...s.config, smsGateway: 'ok' }
    emit(s, 'sms-gateway', 'ok', 'SMS-gateway opet radi')
  }
  for (const con of s.consumers) {
    if (con.status === 'crashed' && t >= con.restartAt - EPS) restartConsumer(s, con)
    else if (con.status === 'starting' && t >= con.readyAt - EPS) podReady(s, con, t)
  }
  // 2. KEDA / HPA (only when E2 owns the consumers), then a rollout in progress
  if (c.autoscaler.enabled && c.consumerSource === 'internal') autoscale(s, t)
  if (s.rollout) rolloutTick(s)
  // 3. broker timers: retry delays, visibility timeout / consumer_timeout
  releaseDelayed(s, t)
  checkAckTimeouts(s, t)
  // 4. jobs: finish work, commit, SMS, ack / nack, OOM kills
  for (let i = 0; i < s.consumers.length; ) {
    const con = s.consumers[i]
    if (con.job) advanceJob(s, con, t)
    if (s.consumers[i] === con) i++
  }
  // 5. the SMS retry relay
  smsRelay(s, t)
  // 6. clients: timeouts and retries (direct mode / reject-publish)
  clientTimers(s, t)
  // 7. producers
  trackBurst(s, t)
  arrivals(s, t)
  // 8. broker → consumers (prefetch); in direct mode a leftover backlog still drains through idle workers
  if (s.config.mode === 'queue' || s.ready.size > 0) deliver(s)
  for (const con of s.consumers) if (!con.job && con.buffer.length > 0) startNext(s, con)

  // 9. accounting
  const l = s.little
  l.area += l.inSystem * DT
  let busy = 0
  let alive = 0
  let running = 0
  for (const con of s.consumers) {
    if (con.status === 'running' || con.status === 'stopping') alive++
    if (con.status === 'running') running++
    if (con.job) {
      busy++
      con.busyS += DT
    }
  }
  s.win.busyAcc += busy
  s.win.aliveAcc += alive
  trackDrain(s, t, running)
  flushEventAgg(s, t)
  cullFlights(s, t + DT)
  s.tick++
  s.t = s.tick * DT
  if (s.tick % SAMPLE_TICKS === 0) {
    sample(s)
    narrate(s, t) // λ of the tick just simulated (a burst starting now is announced first)
  }
  if (s.stopAtTick !== null && s.tick === s.stopAtTick) emit(s, 'finished', 'info', `Kraj scenarija (${secs(s.t)})`)
}

/** true once the state reached its stop time (setStopAt); step() and stepWithScript() then do nothing. */
export function finished(s: QueueState): boolean {
  return s.stopAtTick !== null && s.tick >= s.stopAtTick
}

/**
 * Advance by `dtSeconds` of simulated time using the fixed 10 ms tick (accumulator). `beforeTick` runs before
 * every tick (an extra script). Catch-up is capped at 2000 s per call; a stop time (setStopAt) is exact.
 */
export function advance(s: QueueState, dtSeconds: number, beforeTick: ((s: QueueState) => void) | null = null): void {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return
  if (finished(s)) {
    s.acc = 0
    return
  }
  s.acc += dtSeconds
  let n = 0
  while (s.acc >= DT - EPS && n < MAX_TICKS_PER_STEP) {
    if (finished(s)) {
      s.acc = 0
      return
    }
    if (beforeTick) beforeTick(s)
    tick(s)
    s.acc -= DT
    n++
  }
  if (n >= MAX_TICKS_PER_STEP) s.acc = 0
}

/**
 * Advance by `dtSeconds` of simulated time using the fixed 10 ms tick (accumulator), so it plugs
 * into the kit's useSimulation({ init, step }) which calls step(state, 1/60). Fires the state's preset script.
 */
export function step(s: QueueState, dtSeconds: number): void {
  advance(s, dtSeconds, null)
}

/** Headless helper: advance exactly round(seconds / DT) ticks (tests, presets, incident cards); stops at setStopAt. */
export function runFor(s: QueueState, seconds: number): void {
  const n = Math.max(0, Math.round(seconds / DT))
  for (let i = 0; i < n && !finished(s); i++) tick(s)
}
