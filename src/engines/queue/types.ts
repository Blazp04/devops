/**
 * E2 „Red” – types for the message-queue engine.
 * Pure TypeScript: no React, no DOM. All times are seconds of simulated time.
 */
import type { Rng, Series } from '../../kit/sim/math.ts'
import type { Fifo } from './fifo.ts'

/** 'queue' = API publishes to a broker, potrošači pull work. 'direct' = API does the work synchronously (no queue). */
export type Mode = 'queue' | 'direct'
/**
 * Redelivery semantics. RabbitMQ (4.3, quorum queue): requeue on connection loss + consumer_timeout,
 * `delivery-count` counts only failed deliveries. SQS: visibility timeout, every receive counts.
 */
export type Broker = 'rabbitmq' | 'sqs'
/** 'manual' = ack after processing (at-least-once). 'auto' = ack on delivery (at-most-once). */
export type AckMode = 'manual' | 'auto'
/**
 * What a consumer does when processing fails:
 * - 'backoff': full jitter random(0, min(cap, base·2ⁿ)) through a retry lane (SQS per-message delay;
 *   RabbitMQ retry queue with TTL + dead-letter exchange). Counts toward the delivery limit.
 * - 'immediate': back to the queue at once (RabbitMQ `basic.reject` requeue=true, SQS visibility 0). Counts.
 * - 'nack-requeue': RabbitMQ `basic.nack` requeue=true. Since RabbitMQ 4.3 a nack does NOT count toward the
 *   quorum `delivery-limit`, so a poison message loops forever (the pitfall). On SQS it behaves like 'immediate'.
 */
export type RetryMode = 'backoff' | 'immediate' | 'nack-requeue'
/** RabbitMQ x-overflow. The RabbitMQ default is drop-head. */
export type OverflowPolicy = 'drop-head' | 'reject-publish'
export type ArrivalProcess = 'poisson' | 'uniform'
export type ServiceDist = 'exp' | 'fixed'
/**
 * How the SMS (an external effect outside the DB transaction) is protected:
 * - 'none': send on every successful processing → a redelivery after the SMS was sent sends it again;
 * - 'record-first': mark „SMS poslan” in the same DB transaction as the kitchen effect, then send → no duplicates,
 *   but if the send fails and nobody retries it (smsOnFailure 'nack-message') the SMS is lost;
 * - 'provider-key': the SMS provider deduplicates by an idempotency key (order ID) → no duplicates, no loss.
 */
export type SmsGuard = 'none' | 'record-first' | 'provider-key'
/**
 * What a queue consumer does when the SMS call fails after the kitchen effect committed:
 * - 'retry-sms': ack the order and hand the SMS to a retry relay (outbox-like); the order is not cooked again.
 * - 'nack-message': the handler throws → the whole message is nacked and redelivered → cooked again unless idempotent.
 * Direct mode always answers 500 when the SMS fails (the synchronous chain).
 */
export type SmsOnFailure = 'retry-sms' | 'nack-message'
export type SmsGatewayState = 'ok' | 'slow' | 'down'
/** 'slow' adds `slowExtraS` to every job; 'oom' = container OOMKilled (exit 137) part-way through every job. */
export type ConsumerFault = 'none' | 'slow' | 'oom'
/** 'internal' = E2 creates, restarts and autoscales consumers. 'external' = another engine (E3 Pods) drives them. */
export type ConsumerSource = 'internal' | 'external'
export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral'

/** Producer rate profile. Rates in messages (orders) per second. */
export type RateProfile =
  /** Constant `config.rate`. */
  | { kind: 'steady' }
  /** `config.rate`, but at least `rate` during [startS, startS + durationS) – Ćevap-petak. */
  | { kind: 'burst'; startS: number; durationS: number; rate: number }
  /** Absolute piecewise-linear rate over time [tS, rate]; optional repeat period. `config.rate` is ignored. */
  | { kind: 'curve'; points: ReadonlyArray<readonly [number, number]>; repeatS?: number }

/**
 * Restart delay after a crash.
 * - immediateFirst false (a supervised process, e.g. RESTART_FIXED): delay = min(cap, base·2^(n−1)) for the n-th crash.
 * - immediateFirst true (kubelet CrashLoopBackOff): the first crash restarts at once, then base, 2·base … cap.
 * The back-off resets after `resetAfterS` of running since the last restart.
 */
export interface RestartPolicy {
  baseS: number
  capS: number
  resetAfterS: number
  immediateFirst: boolean
  /** Real seconds per simulated second (10 for the ÷10 compressed CrashLoopBackOff, 1 otherwise). */
  realPerSim: number
}

/** KEDA ScaledObject + the HPA it creates (external metric, AverageValue target). */
export interface AutoscalerConfig {
  enabled: boolean
  /** Messages per replica (KEDA `value`/`queueLength`); HPA desired = ceil(metric / target). */
  targetQueueLength: number
  /** KEDA activation threshold: active when metric > this (default 0 = the first message). */
  activationQueueLength: number
  /** KEDA minReplicaCount (0 allows scale to zero). */
  minReplicas: number
  /** KEDA maxReplicaCount (default 10, as in E3). */
  maxReplicas: number
  /** KEDA pollingInterval (0↔1 decisions). */
  pollingIntervalS: number
  /** KEDA cooldownPeriod: inactive this long → scale to 0. */
  cooldownPeriodS: number
  /** HPA sync period (1↔N decisions). */
  hpaSyncS: number
  /** HPA tolerance (default 0.1). */
  tolerance: number
  /** HPA scale-down stabilisation window (highest recommendation in the window wins). */
  scaleDownStabilizationS: number
  /** HPA default scale-up policies: max(+percent %, +pods) per sync period. */
  scaleUpPercent: number
  scaleUpPods: number
  /** Time from „replica added” to a consuming worker (schedule + pull + start). */
  podStartupS: number
  /**
   * Queue metric. KEDA's rabbitmq-queue scaler counts unacked messages only over the `http` protocol (management
   * API: `messages` = ready + unacked, unless `excludeUnacknowledged: true`); over `amqp` it sees ready messages
   * only. 'ready+unacked' therefore stands for an http host, 'ready' for an amqp host (or excludeUnacknowledged).
   */
  metric: 'ready+unacked' | 'ready'
  /**
   * Real seconds per simulated second of the KEDA/HPA control loop (10 for DEFAULT_AUTOSCALER's ÷10 timings,
   * 1 for REAL_AUTOSCALER_TIMINGS). Only used to label durations („30 s (sim · stvarno: 5 min)”).
   */
  realPerSim: number
}

export interface QueueConfig {
  /** Seed for every random stream. Fixed for the life of a state: change it with a new state (init + reset). */
  seed: number
  mode: Mode
  broker: Broker
  /** Producer rate λ (orders/s) used by the 'steady' and 'burst' profiles. */
  rate: number
  profile: RateProfile
  arrivals: ArrivalProcess
  /** Number of potrošači (or radnici API-ja in direct mode) when the autoscaler is off and the source is internal. */
  consumers: number
  consumerSource: ConsumerSource
  /** Mean processing („kuhanje”) time per job, seconds. Capacity = consumers / serviceMeanS. */
  serviceMeanS: number
  serviceDist: ServiceDist
  /** Max unacked deliveries per consumer (RabbitMQ basic.qos prefetch / SQS MaxNumberOfMessages). */
  prefetch: number
  /** Transient failure probability per processing attempt. */
  pFail: number
  /** Probability that a new order is a poison message (always fails). */
  pPoison: number
  /**
   * Delivery limit as a number of deliveries („Najviše isporuka”).
   * - SQS: the redrive policy's maxReceiveCount (every receive counts) – it exists only with a DLQ.
   * - RabbitMQ 4.3 quorum queue: dead-lettered when `delivery-count` (failed deliveries only) EXCEEDS the
   *   `delivery-limit` argument, so N deliveries = `x-delivery-limit: N − 1`; the quorum default 20 = 21
   *   deliveries (`BROKER_FACTS.rabbitQuorumDefaultDeliveries`, selector `deliveryLimitInfo`).
   */
  maxDeliveries: number
  /**
   * DLQ / dead-letter exchange configured.
   * - RabbitMQ without one: a message over the delivery limit is dropped (the pitfall).
   * - SQS without one: there is no redrive policy, hence no maxReceiveCount – the message keeps coming back
   *   until the retention period expires (default 4 days), whatever `maxDeliveries` says.
   */
  dlqEnabled: boolean
  retryMode: RetryMode
  backoffBaseS: number
  backoffCapS: number
  /** SQS visibility timeout (s). Not compressed: the real default is 30 s. */
  visibilityTimeoutS: number
  /** RabbitMQ consumer_timeout in sim seconds. Compressed ×30: default 60 s (sim) = 30 min real. */
  consumerTimeoutS: number
  ackMode: AckMode
  /** Idempotency key (order ID + unique constraint) for the kitchen effect – same DB transaction only. */
  idempotent: boolean
  smsGuard: SmsGuard
  smsOnFailure: SmsOnFailure
  /** Initial SMS-gateway state (live state: `state.sms`; the two are kept in sync). */
  smsGateway: SmsGatewayState
  /** Extra seconds per SMS while the gateway is slow. */
  smsSlowS: number
  /** Client timeout of an SMS call while the gateway is down (the call then fails). */
  smsTimeoutS: number
  /** Max ready messages (RabbitMQ max-length; unacked do not count). Infinity = unbounded. Ignored for SQS. */
  maxQueue: number
  overflow: OverflowPolicy
  /** Client-side retries of a failed order request (503/500/timeout/reject-publish). */
  clientRetries: number
  /** Client gives up waiting for the API after this many seconds (direct mode). */
  clientTimeoutS: number
  /** Extra seconds per job for a consumer with fault 'slow' (default 40 s > SQS default 30 s). */
  slowExtraS: number
  /** Deployment-wide fault applied to every consumer without its own override (e.g. L24 OOM). */
  consumerFault: ConsumerFault
  restart: RestartPolicy
  autoscaler: AutoscalerConfig
  /** Distinct users placing orders (seeded pool) – for „pogođeni korisnici” in L24. */
  users: number
  /** An order counts as an error for its user when it finishes (or is still waiting) later than this (L24). */
  sloS: number
  /** How events name a worker: „Potrošač 3” (L06) or its Pod name „Pod klopa-worker-…” (L18/L24 consoles). */
  consumerNames: 'potrošač' | 'pod'
  /** Deployment name for Pod names (`${prefix}-${templateHash}-${suffix}`), like E3. */
  podNamePrefix: string
}

/** Partial config for createQueueSim / setConfig (nested objects may be partial too). */
export type QueueConfigPatch = Partial<Omit<QueueConfig, 'autoscaler' | 'restart'>> & {
  autoscaler?: Partial<AutoscalerConfig>
  restart?: Partial<RestartPolicy>
}

export type MessageStatus = 'ready' | 'delayed' | 'inflight' | 'consumed' | 'done' | 'dlq' | 'dropped' | 'lost'

export interface Message {
  /** Stable message id (one per successful publish). */
  id: number
  /** Business key = idempotency key; also the arrival order used by the ordering check. */
  orderId: number
  userId: number
  publishedAt: number
  poison: boolean
  /** Every delivery (SQS ApproximateReceiveCount; RabbitMQ x-acquired-count). */
  receiveCount: number
  /**
   * RabbitMQ quorum `delivery-count` (4.3): failed deliveries only – connection loss / crash, `basic.reject`,
   * a failure sent through the retry queue. Not incremented by consumer_timeout, `basic.nack` or a graceful return.
   */
  deliveryCount: number
  /** true after the first return to the queue (RabbitMQ `redelivered`). */
  redelivered: boolean
  status: MessageStatus
  /** For 'delayed': when it becomes visible again, and since when it waits. */
  visibleAt: number
  delayedAt: number
  /** Id of the latest delivery (the SQS receipt handle that can still delete it). */
  lastDeliveryId: number
}

export interface Delivery {
  id: number
  msg: Message
  consumerId: number
  receivedAt: number
  /** The broker no longer accepts this delivery's ack (visibility expired / consumer timed out / requeued). */
  stale: boolean
  /** Auto-ack: the broker forgot the message at delivery. */
  autoAcked: boolean
  /** SQS: the consumer holding it crashed – it waits for the visibility timeout. */
  orphan: boolean
}

export interface Order {
  id: number
  userId: number
  createdAt: number
  attempts: number
  poison: boolean
  resolved: boolean
}

export interface DirectRequest {
  id: number
  order: Order
  arrivedAt: number
  timeoutAt: number
  /** The client stopped waiting (timeout); the API worker keeps working (ghost order). */
  clientGaveUp: boolean
}

export type JobPhase = 'work' | 'sms'

export interface Job {
  kind: 'message' | 'request'
  delivery: Delivery | null
  request: DirectRequest | null
  orderId: number
  poison: boolean
  startedAt: number
  phase: JobPhase
  phaseStart: number
  phaseEnd: number
  /** Total planned work seconds (incl. 'slow' extra). */
  workS: number
  /** OOM kill time (Infinity if none). */
  crashAt: number
  smsFails: boolean
  committed: boolean
  smsAlreadyRecorded: boolean
}

export type ConsumerStatus = 'starting' | 'running' | 'crashed' | 'stopping'

export interface Termination {
  reason: 'Error' | 'OOMKilled'
  exitCode: number
  at: number
}

export interface Consumer {
  id: number
  /** External Pod name (consumerSource 'external'), else null. */
  key: string | null
  /** Pod template revision (ReplicaSet) it was created from (rolloutConsumers creates a new one). */
  revision: number
  status: ConsumerStatus
  /** Received but not yet started deliveries (prefetch buffer). */
  buffer: Delivery[]
  job: Job | null
  /** Own fault override; null → config.consumerFault. */
  fault: ConsumerFault | null
  /** Crash right after the next kitchen effect and SMS attempt, before the ack („nakon kuhanja, prije potvrde”). */
  crashArmed: boolean
  /**
   * Where the armed crash fires. Unset (default): after the SMS attempt. 'after-commit': right after the kitchen
   * commit, before the SMS call (crashConsumer(…, 'after-commit')).
   */
  crashArmedPoint?: 'after-commit'
  /**
   * RabbitMQ: the broker cancelled this consumer after consumer_timeout (AMQP 0.9.1 consumer_cancel_notify);
   * the client re-subscribes after its current job.
   */
  cancelled: boolean
  restartAt: number
  readyAt: number
  /** Exact time it last became free (a new job may start mid-tick at this time, so busy periods have no tick bias). */
  freeAt: number
  createdAt: number
  runningSince: number
  /** Restarts done so far (incremented when the process actually restarts, like kubectl RESTARTS). */
  restartCount: number
  lastRestartAt: number | null
  backoffLevel: number
  lastTermination: Termination | null
  processed: number
  busyS: number
}

/** 'invisible' = the SQS in-flight lane (received, hidden until the visibility timeout). */
export type Place = 'producer' | 'api' | 'queue' | 'retry' | 'invisible' | 'dlq' | 'done' | 'lost' | 'sms' | `consumer:${number}`

/**
 * Cosmetic movement token for the UI (does not affect the model). Hops of one message are chained: a hop starts
 * when the previous hop of the same message ends, so one ticket is never drawn in two places.
 */
export interface Flight {
  id: number
  msgId: number
  orderId: number
  from: Place
  to: Place
  t0: number
  dur: number
  tone: Tone
}

export type EventKind =
  | 'burst'
  | 'burst-end'
  | 'batch'
  | 'poison'
  | 'crash'
  | 'oom'
  | 'crashloop'
  | 'restart'
  | 'requeue'
  | 'orphan'
  | 'visibility'
  | 'consumer-timeout'
  | 'late-ack'
  | 'duplicate'
  | 'deduped'
  | 'sms-duplicate'
  | 'sms-lost'
  | 'sms-deferred'
  | 'sms-resent'
  | 'retry'
  | 'nack-loop'
  | 'dlq'
  | 'dropped'
  | 'overflow'
  | 'no-redrive'
  | 'reject-publish'
  | 'rejected-503'
  | 'failed-5xx'
  | 'client-timeout'
  | 'client-retry'
  | 'auto-ack-lost'
  | 'sms-gateway'
  | 'scale'
  | 'pod-ready'
  | 'consumers'
  | 'config'
  | 'fault'
  | 'backlog-growing'
  | 'drained'
  | 'served'
  | 'no-consumers'
  | 'start'
  | 'finished'
  | 'rollout'

/** Compatible with the kit's SimEvent ({ t, text, tone }) + a stable id, a kind and a repeat count. */
export interface QueueEvent {
  id: number
  t: number
  kind: EventKind
  /** Identical events at the same instant are merged into one row: „… (×2)”, so `${t}-${text}` stays unique. */
  text: string
  tone: Tone
  count: number
}

export interface KitchenEntry {
  id: number
  t: number
  orderId: number
  /** cooked = first time; duplicate = cooked again; deduped = stamped „već skuhano”. */
  kind: 'cooked' | 'duplicate' | 'deduped'
  /** First cooking of an order with a lower ID than one already cooked („redoslijed nije zajamčen”). */
  outOfOrder: boolean
}

export interface SmsEntry {
  id: number
  t: number
  orderId: number
  /** deferred = handed to the SMS retry relay; resent = sent later by the relay. */
  kind: 'sent' | 'duplicate' | 'deduped' | 'skipped' | 'failed' | 'lost' | 'deferred' | 'resent'
}

export interface DlqEntry {
  id: number
  t: number
  msgId: number
  orderId: number
  receiveCount: number
  deliveryCount: number
  poison: boolean
  reason: 'max-deliveries' | 'max-length'
}

export interface Totals {
  /** Order attempts that reached the API (incl. client retries). */
  arrivals: number
  /** Distinct orders. */
  orders: number
  /** Orders the user got a positive answer for (202 in queue mode, 200 in direct mode). */
  ordersAccepted: number
  /** Orders the client gave up on (all attempts rejected/failed/timed out). */
  ordersFailed: number
  published: number
  rejectedPublish: number
  droppedHead: number
  delivered: number
  /** Returns to the queue without a processing failure (crash, consumer timeout, visibility timeout, shutdown). */
  redeliveries: number
  /** Processing failures that were scheduled for another attempt. */
  retries: number
  failedAttempts: number
  /** Successfully processed and removed from the broker, plus direct-mode answers (directOk). */
  completed: number
  /** Direct mode: requests answered 200 while the client was still waiting. */
  directOk: number
  /** Everything dead-lettered = dlqDeliveryLimit + dlqMaxLength. */
  dlq: number
  /** Dead-lettered because the delivery limit was reached (poison messages). */
  dlqDeliveryLimit: number
  /** Dead-lettered by overflow (drop-head with a dead-letter exchange). */
  dlqMaxLength: number
  /** Destroyed without a DLQ (delivery limit or drop-head without DLX). */
  dropped: number
  lostAutoAck: number
  rejected503: number
  /** Direct mode: 500 (processing or SMS failure) + 502 (the API worker crashed mid-request). */
  failed5xx: number
  failed500: number
  failed502: number
  clientTimeouts: number
  clientRetries: number
  effects: number
  effectsUnique: number
  duplicates: number
  alreadyCooked: number
  smsSent: number
  smsUnique: number
  smsDuplicates: number
  smsDeduped: number
  smsLost: number
  /** SMS calls that failed in a consumer and went to the retry relay (smsOnFailure 'retry-sms'). */
  smsDeferred: number
  /** SMS sent later by the retry relay. */
  smsResent: number
  outOfOrder: number
  staleAcks: number
  visibilityExpired: number
  /** RabbitMQ consumer_timeout firings (consumer cancelled, deliveries returned). */
  consumerTimeouts: number
  crashes: number
  oomKills: number
  restarts: number
  scaleEvents: number
  /** Orders that finished later than config.sloS (L24 impact). */
  lateOrders: number
}

export interface ScalerDecision {
  t: number
  from: number
  to: number
  metric: number
  reason: 'keda-activate' | 'keda-cooldown' | 'hpa'
  text: string
}

export interface ScalerState {
  /** Desired replicas (Deployment spec.replicas). */
  replicas: number
  active: boolean
  lastActiveAt: number
  lastMetric: number
  nextPollAt: number
  nextHpaAt: number
  /** HPA recommendations in the scale-down window (seeded with the current replicas, like the HPA controller). */
  recs: { t: number; r: number }[]
  lastDecision: ScalerDecision | null
  history: ScalerDecision[]
}

export interface DrainRecord {
  /** When the backlog episode began (backlog went from 0 to > 0). */
  startedAt: number
  peak: number
  peakAt: number
  emptyAt: number
  /** Seconds from the peak backlog to an empty queue. */
  durationS: number
  /** Fewest / most running consumers between the peak and the empty queue. */
  consumersMin: number
  consumersMax: number
  /** Lowest capacity Σμ (jobs/s) of the running consumers in that span (faults included). */
  capacityMin: number
  /** Orders that arrived between the peak and the empty queue. */
  arrivalsDuring: number
  /** Theory for the same drain: peak / (capacityMin − λ̄), λ̄ = arrivalsDuring / durationS; null when it cannot drain. */
  predictedS: number | null
}

export interface LiveMetrics {
  rateIn: number
  rateOut: number
  /** RED „Errors” per second over the last 5 s: failed attempts + crashes + 503 + reject-publish + client timeouts. */
  errorRate: number
  /** Retries + redeliveries per second over the last 5 s. */
  retryRate: number
  utilization: number
  p50: number | null
  p95: number | null
  latN: number
}

export interface QueueSeries {
  ready: Series
  delayed: Series
  unacked: Series
  inSystem: Series
  busy: Series
  replicas: Series
  rateIn: Series
  rateOut: Series
  p95: Series
  dlq: Series
  duplicates: Series
  lost: Series
  /** Age of the oldest unfinished message (s). */
  oldestAgeS: Series
  /** Configured arrival rate λ(t). */
  lambda: Series
  /** Capacity Σμ of the running consumers (a 'slow' consumer counts 1 / (S + 40 s), an 'oom' one 0). */
  capacity: Series
  /** Errors per second (LiveMetrics.errorRate) – the RED „E”. */
  errors: Series
  /** Retries + redeliveries per second. */
  retries: Series
}

export interface EventAgg {
  start: number
  count: number
  tone: Tone
  more: (n: number) => string
  /** Lines of this kind within this many seconds are summed into one. */
  windowS: number
}

export interface QueueRngs {
  arrivals: Rng
  poison: Rng
  service: Rng
  fail: Rng
  jitter: Rng
  crash: Rng
  client: Rng
  users: Rng
  smsRelay: Rng
}

export interface BurstTrack {
  active: boolean
  source: 'profile' | 'manual' | null
  startedAt: number | null
  lastEndedAt: number | null
  rate: number
  arrivalsAtStart: number
  /** Order attempts that arrived during the current (or last) burst. */
  ordersDuring: number
  /** Order-ID range of the current (or last) burst; lastOrderId is null while it runs. */
  firstOrderId: number | null
  lastOrderId: number | null
  /** Latched: every order of the last burst was cooked and none was lost (never reverts for that burst). */
  done: boolean
  doneAt: number | null
  /** Latched: an order of the last burst was lost / dead-lettered (it can no longer be fully served). */
  failed: boolean
  /** Bursts fully served so far (monotonic – a goal can use servedBursts > 0). */
  servedBursts: number
}

/** A preset script entry: an action fired before the tick that starts at `atS`. */
export interface ScriptEntry {
  /** Simulated second at which the action fires (before the tick that starts at this time). */
  atS: number
  /** Croatian label for a timeline. */
  label: string
  run: (s: QueueState) => void
}

/** One application log line of a worker (`kubectl logs`). */
export interface WorkerLogEntry {
  id: number
  t: number
  consumerId: number
  pod: string
  level: 'INFO' | 'WARN' | 'ERROR'
  orderId: number | null
  /** W3C trace-id (32 hex) of the order, links the log line to orderTrace(). */
  traceId: string | null
  text: string
}

/** Kubernetes event in E3's shape (`kubectl get events`), internal consumers only. */
export interface KubeEvent {
  /** Last seen. */
  t: number
  firstT: number
  type: 'Normal' | 'Warning'
  reason: string
  /** e.g. "pod/klopa-worker-6d5f8c7b9-x2kq4" */
  object: string
  message: string
  count: number
}

export type SpanName = 'red' | 'čekanje na ponovni pokušaj' | 'nevidljivo do isteka roka' | 'obrada' | 'SMS' | 'potvrda' | 'odgovor' | 'DLQ' | 'odbačeno'
export type SpanOutcome = 'ok' | 'fail' | 'crash' | 'timeout' | 'dlq' | 'lost'

/** One span of an order's trace (the „Put jednog zahtjeva” waterfall). */
export interface TraceSpan {
  span: SpanName
  start: number
  /** null while open. */
  end: number | null
  consumerId: number | null
  /** Delivery number (receive count) the span belongs to; 1 for the first. */
  attempt: number
  outcome: SpanOutcome | null
}

export interface TraceRecord {
  orderId: number
  traceId: string
  spans: TraceSpan[]
  /** Spans beyond the per-order cap were not recorded (a message looping forever). */
  truncated: boolean
}

/** A Deployment rollout of the workers (new ReplicaSet). */
export interface RolloutState {
  revision: number
  startedAt: number
  maxSurge: number
  maxUnavailable: number
  startupS: number
}

export interface ConsumerTermination {
  key: string | null
  consumerId: number
  reason: Termination['reason']
  exitCode: number
  t: number
}

export interface QueueState {
  config: QueueConfig
  /** Fixed 10 ms ticks done so far. */
  tick: number
  /** Simulated seconds = tick · DT. */
  t: number
  /** Accumulator for step(). */
  acc: number
  /** step()/stepWithScript() stop at this tick (setStopAt); null = run forever. */
  stopAtTick: number | null
  /** Preset script fired by tick() (createPresetSim / runPreset set it); null = none. */
  script: readonly ScriptEntry[] | null
  rng: QueueRngs
  arrivalAcc: number
  nextE: number
  bursts: { startS: number; durationS: number; rate: number }[]
  ids: { msg: number; order: number; delivery: number; consumer: number; request: number; event: number; flight: number; entry: number }
  /** Visible messages in FIFO order. */
  ready: Fifo<Message>
  /**
   * How many messages at the head of `ready` are returns. A return is inserted after them, so returns come
   * back in the order they were returned (RabbitMQ's quorum-queue returns queue), ahead of regular messages.
   */
  returnsAtHead: number
  /** Messages waiting for a retry delay (SQS per-message delay / RabbitMQ retry queue with TTL + DLX). */
  delayed: Message[]
  /** Deliveries the broker still waits an ack for (incl. SQS orphans of crashed consumers). */
  unacked: Map<number, Delivery>
  consumers: Consumer[]
  rr: number
  rrDirect: number
  orders: Map<number, Order>
  clientRetryQueue: { order: Order; at: number }[]
  cooked: Map<number, number>
  smsSentBy: Map<number, number>
  smsRecorded: Set<number>
  smsProviderKeys: Set<number>
  smsLostIds: Set<number>
  /** SMS retry relay (smsOnFailure 'retry-sms'). */
  smsOutbox: { orderId: number; attempts: number; at: number }[]
  maxCookedOrder: number
  sms: { state: SmsGatewayState; until: number | null }
  scaler: ScalerState
  totals: Totals
  little: { since: number; area: number; departures: number; sojournSum: number; inSystem: number }
  /** Whole-run latency histogram in ticks (index = round(latency / DT)). */
  latHist: number[]
  latN: number
  latSum: number
  /** Sliding window of successful latencies [t, seconds]. */
  latWin: Fifo<readonly [number, number]>
  win: {
    inD: number[]
    outD: number[]
    errD: number[]
    retryD: number[]
    busyD: number[]
    aliveD: number[]
    lastIn: number
    lastOut: number
    lastErr: number
    lastRetry: number
    busyAcc: number
    aliveAcc: number
  }
  live: LiveMetrics
  series: QueueSeries
  drain: {
    active: boolean
    startedAt: number
    peak: number
    peakAt: number
    consumersMin: number
    consumersMax: number
    capacityMin: number
    arrivalsAtPeak: number
    last: DrainRecord | null
  }
  burst: BurstTrack
  /** Narration latches (one event per episode). */
  narr: { growing: boolean; noConsumers: boolean; growingAt: number; noConsumersAt: number }
  /** L24 impact: every bad outcome (failed, dropped, lost, DLQ, late) with its user. */
  impactLog: { t: number[]; user: number[]; order: number[] }
  /** Orders with a final bad outcome (client gave up, dropped, auto-ack loss, DLQ) – for burstOutcome. */
  badOrders: Map<number, 'failed' | 'dropped' | 'lost' | 'dlq'>
  /** Terminations not yet collected by an external Pod engine (drainTerminations). */
  terminations: ConsumerTermination[]
  /** Cosmetic: seconds one flight hop takes (setFlightDuration). */
  flightS: number
  /** Cosmetic: when the last hop of each message (key msgId, or −orderId for direct requests) ends. */
  flightEnds: Map<number, number>
  /** Cosmetic: earliest end of a listed hop (culling runs only once it has passed). */
  nextFlightEnd: number
  /** Pod template revision of new consumers; rollout in progress (rolloutConsumers). */
  revision: number
  rollout: RolloutState | null
  /** The last „Broj potrošača” event, merged while a slider is dragged. */
  consumerChange: { eventId: number; t: number; values: number[] } | null
  events: QueueEvent[]
  eventAgg: Map<EventKind, EventAgg>
  flights: Flight[]
  kitchen: KitchenEntry[]
  smsLog: SmsEntry[]
  dlqRecent: DlqEntry[]
  /** Ring buffer of worker log lines (workerLogs). */
  workerLog: WorkerLogEntry[]
  /** Kubernetes events of internal consumers (kubeEvents). */
  kubeEvents: KubeEvent[]
  /** Traces of the most recent orders (orderTrace), oldest evicted first. */
  traces: Map<number, TraceRecord>
}
