/**
 * Read-only views of the E2 state for UIs and tests. Cheap enough to call every render (30 fps).
 */
import { plural } from '../../kit/sim/math.ts'
import { ACK_TIMEOUT, BROKER_FACTS, DT, MIN_SAMPLES, controlDurationLabel, timingLabel } from './config.ts'
import {
  ackTimeoutOf,
  activeConsumers,
  attemptsPerOrder,
  burstCounts,
  capacityPerS,
  consumerMu,
  consumerPlace,
  deliveryLimitEnforced,
  effectiveFault,
  meanJobS,
  oldestAgeOf,
  podName,
  podSuffix,
  queueMetric,
  rateAt,
  replicaSetName,
  templateHashOf,
  WORKER_LOG_CAP,
} from './core.ts'
import { drainTimeS, erlangB, mmc, type MmcResult } from './theory.ts'
import type {
  Broker,
  BurstTrack,
  ConsumerFault,
  DrainRecord,
  Flight,
  JobPhase,
  KubeEvent,
  OverflowPolicy,
  QueueState,
  SmsGatewayState,
  Termination,
  Totals,
  TraceSpan,
  WorkerLogEntry,
} from './types.ts'

const EPS = 1e-9

export { attemptsPerOrder, capacityPerS, consumerMu, meanJobS, podSuffix, queueMetric }

export interface QueueMetrics {
  t: number
  /** Visible messages waiting in the queue. */
  ready: number
  /** Waiting for a retry delay (retry queue / SQS delay). */
  delayed: number
  /** Delivered, not yet acked (incl. prefetched and SQS orphans). */
  unacked: number
  /** ready + delayed. */
  backlog: number
  /** Everything accepted and not finished (Little's L counts this). */
  inSystem: number
  /** Age of the oldest visible message (s); 0 when empty. */
  oldestReadyAgeS: number
  /** Age of the oldest unfinished message anywhere in the broker (SQS ApproximateAgeOfOldestMessage-like). */
  oldestAgeS: number
  consumers: { total: number; running: number; busy: number; crashed: number; starting: number; stopping: number }
  /** Busy share of running consumers over the last 10 s. */
  utilization: number
  /** Arrivals / completions per second over the last 5 s. */
  rateIn: number
  rateOut: number
  /** RED „Errors” per second (5 s): failed attempts + crashes + 503 + reject-publish + client timeouts. */
  errorRate: number
  /** Retries + redeliveries per second (5 s). */
  retryRate: number
  /** Percentiles of successful latencies (publish → ack, or request → response) over the last 60 s; null when n < 20. */
  p50: number | null
  p95: number | null
  latN: number
  /**
   * Orders lost for good: client gave up + dropped without DLQ + auto-ack losses. Excludes the DLQ (both causes:
   * poison / delivery limit and max-length overflow – totals.dlq), see `unserved`.
   */
  lost: number
  /** lost + everything dead-lettered (totals.dlq): orders that will not be cooked unless someone redrives the DLQ. */
  unserved: number
  /** lost / orders (0 when there were none). */
  lostRatio: number
  /** Kitchen duplicates / unique cooked orders. */
  duplicateRatio: number
  /** Out-of-order first effects / unique cooked orders. */
  outOfOrderRatio: number
  /** SMS waiting in the retry relay. */
  smsPending: number
  lastDrain: DrainRecord | null
  totals: Totals
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : 0)

export function lostCount(s: QueueState): number {
  const t = s.totals
  return t.ordersFailed + t.dropped + t.lostAutoAck
}

export function metrics(s: QueueState): QueueMetrics {
  const t = s.t
  let oldestReady = Infinity
  s.ready.forEach((m) => {
    if (m.publishedAt < oldestReady) oldestReady = m.publishedAt
  })
  const cons = { total: s.consumers.length, running: 0, busy: 0, crashed: 0, starting: 0, stopping: 0 }
  for (const c of s.consumers) {
    if (c.status === 'running') cons.running++
    else if (c.status === 'crashed') cons.crashed++
    else if (c.status === 'starting') cons.starting++
    else cons.stopping++
    if (c.job) cons.busy++
  }
  const tot = s.totals
  const lost = lostCount(s)
  return {
    t,
    ready: s.ready.size,
    delayed: s.delayed.length,
    unacked: s.unacked.size,
    backlog: s.ready.size + s.delayed.length,
    inSystem: s.little.inSystem,
    oldestReadyAgeS: Number.isFinite(oldestReady) ? Math.max(0, t - oldestReady) : 0,
    oldestAgeS: oldestAgeOf(s),
    consumers: cons,
    utilization: s.live.utilization,
    rateIn: s.live.rateIn,
    rateOut: s.live.rateOut,
    errorRate: s.live.errorRate,
    retryRate: s.live.retryRate,
    p50: s.live.p50,
    p95: s.live.p95,
    latN: s.live.latN,
    lost,
    unserved: lost + tot.dlq,
    lostRatio: ratio(lost, tot.orders),
    duplicateRatio: ratio(tot.duplicates, tot.effectsUnique),
    outOfOrderRatio: ratio(tot.outOfOrder, tot.effectsUnique),
    smsPending: s.smsOutbox.length,
    lastDrain: s.drain.last,
    totals: tot,
  }
}

export interface LatencyStats {
  n: number
  mean: number | null
  p50: number | null
  p95: number | null
  p99: number | null
}

/** Whole-run latency of successful jobs (nearest rank on a 10 ms histogram; exact because time is quantised). */
export function runLatency(s: QueueState): LatencyStats {
  const n = s.latN
  if (n === 0) return { n: 0, mean: null, p50: null, p95: null, p99: null }
  const q = (p: number) => {
    if (n < MIN_SAMPLES) return null
    const rank = Math.max(1, Math.ceil(p * n))
    let acc = 0
    for (let i = 0; i < s.latHist.length; i++) {
      acc += s.latHist[i]
      if (acc >= rank) return i * DT
    }
    return (s.latHist.length - 1) * DT
  }
  return { n, mean: s.latSum / n, p50: q(0.5), p95: q(0.95), p99: q(0.99) }
}

export interface LittleStats {
  /** Seconds measured (since start or resetLittle). */
  elapsedS: number
  /** Time-averaged number in the system. */
  L: number
  /** Departure rate (completed + DLQ + dropped + lost) per second. */
  lambda: number
  /** Mean time in the system of departed items (s). */
  W: number
  lambdaW: number
  departures: number
}

/** Live Little's-law panel: L (time average) vs λ·W (measured). They match for any stable system. */
export function little(s: QueueState): LittleStats {
  const l = s.little
  const elapsed = Math.max(0, s.t - l.since)
  const L = elapsed > 0 ? l.area / elapsed : 0
  const lambda = elapsed > 0 ? l.departures / elapsed : 0
  const W = l.departures > 0 ? l.sojournSum / l.departures : 0
  return { elapsedS: elapsed, L, lambda, W, lambdaW: lambda * W, departures: l.departures }
}

export interface TheoryView {
  /** Configured arrival rate now (profile + bursts). */
  lambda: number
  /** Expected processing attempts per order (retries and poison messages); Infinity when a failure loops forever. */
  attemptsPerOrder: number
  /** Offered load = λ × attemptsPerOrder (jobs/s) – what the consumers must process. */
  offered: number
  /** Service rate of one healthy consumer incl. the SMS delay (1 / mean job time). */
  mu: number
  /** Running consumers. */
  k: number
  /** Running consumers with fault 'slow' / 'oom'. */
  slow: number
  oom: number
  /** Capacity Σμ of the running consumers: a slow consumer counts 1 / (S + slowExtraS), an OOM-killed one 0. */
  capacity: number
  /** ρ = offered / capacity; Infinity with no capacity and λ > 0. */
  rho: number
  stable: boolean
  /** All running consumers have the same rate (M/M/k applies). */
  homogeneous: boolean
  /** The M/M/k numbers are an approximation (retry load folded into λ) – or null below. */
  approximate: boolean
  /** M/M/k prediction with the effective λ and μ; null when unstable or the consumers are heterogeneous. */
  mmc: MmcResult | null
  /** offered − capacity when positive: the backlog grows by this many messages per second, without bound. */
  growthPerS: number
  backlog: number
  /** backlog / (capacity − offered); Infinity when it cannot drain. */
  drainTimeS: number
  /** Direct mode (no waiting room): Erlang B share of requests answered 503 (mean μ of the running workers). */
  directLossErlangB: number
}

/**
 * Queueing theory for the live state. Every capacity term uses the consumers' effective faults, so a slow or
 * OOM-killed Deployment never shows ρ < 1 while its queue grows without bound.
 */
export function theory(s: QueueState): TheoryView {
  const lambda = rateAt(s, s.t)
  const mu = 1 / meanJobS(s)
  const running = s.consumers.filter((c) => c.status === 'running')
  const k = running.length
  const mus = running.map((c) => consumerMu(s, c))
  const capacity = mus.reduce((a, b) => a + b, 0)
  const homogeneous = mus.every((m) => Math.abs(m - mus[0]) < 1e-12)
  const attempts = attemptsPerOrder(s)
  const offered = lambda > 0 ? lambda * attempts : 0
  const rho = capacity > 0 ? offered / capacity : offered > 0 ? Infinity : 0
  const muEff = k > 0 ? mus[0] : mu
  const m = homogeneous && Number.isFinite(offered) ? mmc(k, offered, muEff) : null
  const backlog = s.ready.size + s.delayed.length
  const muMean = k > 0 ? capacity / k : mu
  return {
    lambda,
    attemptsPerOrder: attempts,
    offered,
    mu,
    k,
    slow: running.filter((c) => effectiveFault(s, c) === 'slow').length,
    oom: running.filter((c) => effectiveFault(s, c) === 'oom').length,
    capacity,
    rho,
    stable: rho < 1,
    homogeneous,
    approximate: attempts !== 1,
    mmc: m && m.stable ? m : null,
    growthPerS: Math.max(0, offered - capacity),
    backlog,
    drainTimeS: drainTimeS(backlog, 1, capacity, offered),
    directLossErlangB: k > 0 ? (muMean > 0 ? erlangB(k, lambda / muMean) : lambda > 0 ? 1 : 0) : lambda > 0 ? 1 : 0,
  }
}

export interface DeliveryLimitInfo {
  broker: Broker
  /** „Najviše isporuka” as set (deliveries until the DLQ). */
  maxDeliveries: number
  /** false for SQS without a DLQ: no redrive policy, no maxReceiveCount – a failing message returns until retention expires. */
  enforced: boolean
  /** The real setting it corresponds to. */
  argName: 'x-delivery-limit' | 'maxReceiveCount' | null
  /** RabbitMQ: maxDeliveries − 1 (dead-lettered when delivery-count EXCEEDS the limit); SQS: maxDeliveries. */
  argValue: number | null
  /** What happens over the limit. */
  overLimit: 'dlq' | 'dropped' | 'none'
  /** maxDeliveries that equals the product default (RabbitMQ quorum: 21 = delivery-limit 20); null for SQS (no default). */
  productDefaultDeliveries: number | null
  /** Badge, e.g. „5 isporuka = delivery-limit 4 · quorum zadano: 20 (21 isporuka)”. */
  label: string
}

/** What the „Najviše isporuka” slider means on the current broker (and whether it applies at all). */
export function deliveryLimitInfo(s: QueueState): DeliveryLimitInfo {
  const c = s.config
  const n = c.maxDeliveries
  const isporuka = (k: number) => plural(k, ['isporuka', 'isporuke', 'isporuka'])
  if (c.broker === 'rabbitmq') {
    const d = BROKER_FACTS.rabbitQuorumDeliveryLimit
    return {
      broker: 'rabbitmq',
      maxDeliveries: n,
      enforced: true,
      argName: 'x-delivery-limit',
      argValue: n - 1,
      overLimit: c.dlqEnabled ? 'dlq' : 'dropped',
      productDefaultDeliveries: BROKER_FACTS.rabbitQuorumDefaultDeliveries,
      label: `${isporuka(n)} = delivery-limit ${n - 1} · quorum zadano: ${d} (${isporuka(d + 1)})`,
    }
  }
  if (!c.dlqEnabled) {
    return {
      broker: 'sqs',
      maxDeliveries: n,
      enforced: deliveryLimitEnforced(s),
      argName: null,
      argValue: null,
      overLimit: 'none',
      productDefaultDeliveries: null,
      label: `SQS bez DLQ-a nema maxReceiveCount – poruka se vraća do isteka zadržavanja (zadano ${BROKER_FACTS.sqsRetentionDefaultS / 86400} dana)`,
    }
  }
  return {
    broker: 'sqs',
    maxDeliveries: n,
    enforced: true,
    argName: 'maxReceiveCount',
    argValue: n,
    overLimit: 'dlq',
    productDefaultDeliveries: null,
    label: `maxReceiveCount ${n} (redrive policy prema DLQ-u)`,
  }
}

export interface AckTimeoutInfo {
  broker: Broker
  /** What the deadline is called for this broker. */
  name: string
  /** Effective sim value (s) – what the slider shows. */
  simS: number
  /** The broker's sim default (SQS 30 s; RabbitMQ 60 s = compressed 30 min). */
  defaultSimS: number
  isDefault: boolean
  /** true for RabbitMQ (60 s sim stands for the 30 min default); SQS is simulated 1:1. */
  compressed: boolean
  /**
   * What simS stands for in real time: SQS the same value; RabbitMQ the real default (1800 s) at the default
   * value, else null – only consumer_timeout is compressed (jobs run 1:1), so a changed value has no
   * proportional real equivalent.
   */
  realEquivalentS: number | null
  /** The product default (SQS 30 s, RabbitMQ 30 min). */
  realDefaultS: number
  /** „30 s” · „2 s · zadano: 30 s” · „60 s (sim) · stvarno: 30 min” · „10 s (sim) · skraćeno; stvarno zadano: 30 min”. */
  label: string
}

export function ackTimeoutInfo(s: QueueState): AckTimeoutInfo {
  const b = s.config.broker
  const t = ACK_TIMEOUT[b]
  const simS = ackTimeoutOf(s)
  return {
    broker: b,
    name: b === 'sqs' ? 'rok vidljivosti (visibility timeout)' : 'consumer_timeout',
    simS,
    defaultSimS: t.sim,
    isDefault: simS === t.sim,
    compressed: t.compressed,
    realEquivalentS: !t.compressed ? simS : simS === t.sim ? t.real : null,
    realDefaultS: t.real,
    label: timingLabel(t, simS),
  }
}

export type ConsumerDisplayStatus = 'starting' | 'idle' | 'busy' | 'crashed' | 'crashloop' | 'stopping' | 'cancelled'

export interface ConsumerView {
  id: number
  /** External Pod name, or null. */
  key: string | null
  /** 'cancelled' = RabbitMQ consumer_timeout cancelled it; it re-subscribes after the current job. */
  status: ConsumerDisplayStatus
  /** 0..1 progress of the current job phase (linear in time). */
  progress: number
  phase: JobPhase | null
  orderId: number | null
  msgId: number | null
  poison: boolean
  /** The kitchen effect of the current job has committed (a crash now duplicates). */
  committed: boolean
  /** The broker no longer accepts this job's ack (it will be a late ack). */
  stale: boolean
  /** Prefetched deliveries waiting in the client. */
  buffered: number
  bufferedMsgIds: number[]
  restartCount: number
  /** Seconds until restart (crashed) or until ready (starting); 0 when another engine decides. */
  waitS: number
  lastTermination: Termination | null
  fault: ConsumerFault
  crashArmed: boolean
  processed: number
  /** The current job's ticket is still flying to this consumer (cosmetic: start drawing progress once it lands). */
  ticketArriving: boolean
  /** Pod name (for consoles); revision = ReplicaSet it belongs to. */
  pod: string
  revision: number
}

/** A crashed consumer waiting out a CrashLoopBackOff delay (kubectl shows CrashLoopBackOff). */
function inBackOff(s: QueueState, c: QueueState['consumers'][number]): boolean {
  return c.status === 'crashed' && s.config.restart.immediateFirst && Number.isFinite(c.restartAt) && c.restartAt - (c.lastTermination?.at ?? 0) > EPS
}

const waitOf = (s: QueueState, c: QueueState['consumers'][number]): number => {
  const until = c.status === 'crashed' ? c.restartAt : c.status === 'starting' ? c.readyAt : s.t
  return Number.isFinite(until) ? Math.max(0, until - s.t) : 0
}

export function consumerViews(s: QueueState): ConsumerView[] {
  const t = s.t
  return s.consumers.map((c) => {
    const place = consumerPlace(c.id)
    const msgId = c.job?.delivery?.msg.id ?? 0
    const orderId = c.job?.orderId ?? 0
    const ticketArriving = c.job !== null && s.flights.some((f) => f.to === place && f.t0 + f.dur > t + EPS && (msgId > 0 ? f.msgId === msgId : f.msgId === 0 && f.orderId === orderId))
    const job = c.job
    let status: ConsumerDisplayStatus
    if (c.status === 'crashed') status = inBackOff(s, c) ? 'crashloop' : 'crashed'
    else if (c.status === 'starting') status = 'starting'
    else if (c.status === 'stopping') status = 'stopping'
    else if (c.cancelled) status = 'cancelled'
    else status = job ? 'busy' : 'idle'
    const span = job ? job.phaseEnd - job.phaseStart : 0
    return {
      id: c.id,
      key: c.key,
      status,
      progress: job ? (span > 0 ? Math.min(1, Math.max(0, (t - job.phaseStart) / span)) : 1) : 0,
      phase: job ? job.phase : null,
      orderId: job ? job.orderId : null,
      msgId: job?.delivery ? job.delivery.msg.id : null,
      poison: job ? job.poison : false,
      committed: job ? job.committed : false,
      stale: job?.delivery ? job.delivery.stale : false,
      buffered: c.buffer.length,
      bufferedMsgIds: c.buffer.map((d) => d.msg.id),
      restartCount: c.restartCount,
      waitS: waitOf(s, c),
      lastTermination: c.lastTermination,
      fault: effectiveFault(s, c),
      crashArmed: c.crashArmed,
      processed: c.processed,
      ticketArriving,
      pod: podName(s, c),
      revision: c.revision,
    }
  })
}

/** kubectl STATUS column (named apart from the kit's PodShape `PodStatus`). */
export type KubectlPodStatus = 'Running' | 'ContainerCreating' | 'CrashLoopBackOff' | 'OOMKilled' | 'Error' | 'Terminating'
/** The kit's PodShape status for the same row (kit/diagram/k8s-helpers PodStatus; 'Error' is drawn as 'crash'). */
export type PodShapeStatus = 'running' | 'creating' | 'crash' | 'oom' | 'terminating'

const SHAPE: Record<KubectlPodStatus, PodShapeStatus> = {
  Running: 'running',
  ContainerCreating: 'creating',
  CrashLoopBackOff: 'crash',
  OOMKilled: 'oom',
  Error: 'crash',
  Terminating: 'terminating',
}

export interface PodView {
  /** kubectl NAME: the external key, or `${prefix}-${pod-template-hash}-${suffix}` like E3 (stable per consumer). */
  name: string
  consumerId: number
  /** ReplicaSet (`${prefix}-${pod-template-hash}`) and its revision. */
  replicaSet: string
  revision: number
  /** kubectl READY. */
  ready: '0/1' | '1/1'
  status: KubectlPodStatus
  /** Pass to the kit's PodShape. */
  shape: PodShapeStatus
  /** kubectl RESTARTS. */
  restarts: number
  /** Sim seconds since the last restart („RESTARTS 3 (12s ago)”), null if never restarted. */
  lastRestartAgoS: number | null
  ageS: number
  /** Back-off wait left in sim seconds and what it stands for in real time (compressed CrashLoopBackOff ×10). */
  waitS: number
  waitRealS: number
  lastTermination: Termination | null
}

/** kubectl-style rows for the worker Pods (L24 console). `namePrefix` defaults to config.podNamePrefix. */
export function podViews(s: QueueState, opts: { namePrefix?: string } = {}): PodView[] {
  const prefix = opts.namePrefix ?? s.config.podNamePrefix
  const scale = s.config.restart.realPerSim
  return s.consumers.map((c) => {
    let status: KubectlPodStatus
    if (c.status === 'running') status = 'Running'
    else if (c.status === 'starting') status = 'ContainerCreating'
    else if (c.status === 'stopping') status = 'Terminating'
    else if (inBackOff(s, c)) status = 'CrashLoopBackOff'
    else status = c.lastTermination?.reason === 'OOMKilled' ? 'OOMKilled' : 'Error'
    const waitS = c.status === 'crashed' ? waitOf(s, c) : 0
    return {
      name: podName(s, c, prefix),
      consumerId: c.id,
      replicaSet: c.key ?? `${prefix}-${templateHashOf(prefix, c.revision)}`,
      revision: c.revision,
      ready: c.status === 'running' ? '1/1' : '0/1',
      status,
      shape: SHAPE[status],
      restarts: c.restartCount,
      lastRestartAgoS: c.lastRestartAt === null ? null : Math.max(0, s.t - c.lastRestartAt),
      ageS: Math.max(0, s.t - c.createdAt),
      waitS,
      waitRealS: waitS * scale,
      lastTermination: c.lastTermination,
    }
  })
}

export interface MessageView {
  id: number
  orderId: number
  poison: boolean
  redelivered: boolean
  receiveCount: number
  /** RabbitMQ delivery-count (failed deliveries). */
  deliveryCount: number
  ageS: number
}

/** The first `limit` visible messages in queue order. */
export function readyView(s: QueueState, limit = 50): MessageView[] {
  return s.ready.slice(0, limit).map((m) => ({
    id: m.id,
    orderId: m.orderId,
    poison: m.poison,
    redelivered: m.redelivered,
    receiveCount: m.receiveCount,
    deliveryCount: m.deliveryCount,
    ageS: s.t - m.publishedAt,
  }))
}

export interface DelayedView extends MessageView {
  /** 0..1 of the retry delay elapsed. */
  progress: number
  remainingS: number
}

export function delayedView(s: QueueState): DelayedView[] {
  return [...s.delayed]
    .sort((a, b) => a.visibleAt - b.visibleAt)
    .map((m) => {
      const span = m.visibleAt - m.delayedAt
      return {
        id: m.id,
        orderId: m.orderId,
        poison: m.poison,
        redelivered: m.redelivered,
        receiveCount: m.receiveCount,
        deliveryCount: m.deliveryCount,
        ageS: s.t - m.publishedAt,
        progress: span > 0 ? Math.min(1, Math.max(0, (s.t - m.delayedAt) / span)) : 1,
        remainingS: Math.max(0, m.visibleAt - s.t),
      }
    })
}

export interface InflightView {
  deliveryId: number
  msgId: number
  orderId: number
  consumerId: number
  ageS: number
  /** Ack deadline (visibility timeout / consumer_timeout) and the time left. */
  timeoutS: number
  remainingS: number
  /** SQS: the consumer crashed; the message reappears only when the timer runs out. */
  orphan: boolean
}

export function inflightView(s: QueueState): InflightView[] {
  const timeout = ackTimeoutOf(s)
  return [...s.unacked.values()].map((d) => ({
    deliveryId: d.id,
    msgId: d.msg.id,
    orderId: d.msg.orderId,
    consumerId: d.consumerId,
    ageS: s.t - d.receivedAt,
    timeoutS: timeout,
    remainingS: Math.max(0, d.receivedAt + timeout - s.t),
    orphan: d.orphan,
  }))
}

export interface FlightView extends Flight {
  /** 0..1 along the hop – animate with linear easing. */
  progress: number
}

/**
 * Hops in progress right now (started, not finished) – at most one per message, because hops are chained.
 * A queued next hop of the same message is returned once the current one lands.
 */
export function flightsView(s: QueueState): FlightView[] {
  const out: FlightView[] = []
  for (const f of s.flights) {
    if (f.t0 > s.t + EPS || f.t0 + f.dur <= s.t + EPS) continue
    out.push({ ...f, progress: Math.min(1, Math.max(0, (s.t - f.t0) / f.dur)) })
  }
  return out
}

export interface ScalerView {
  enabled: boolean
  /** Desired replicas (Deployment spec.replicas). */
  replicas: number
  /** Consumers that are running / still starting. */
  ready: number
  starting: number
  /** The metric KEDA and the HPA see now. */
  metric: number
  /** ceil(metric / target) – what the HPA formula asks for right now. */
  formulaDesired: number
  active: boolean
  secondsUntilPoll: number
  secondsUntilHpa: number
  /** Seconds left of the KEDA cooldown before 1 → 0 (null when active or already 0). */
  cooldownLeftS: number | null
  /** The same countdowns on the real clock (× autoscaler.realPerSim: 10 with the ÷10 timings, 1 with real ones). */
  realPerSim: number
  secondsUntilPollRealS: number
  secondsUntilHpaRealS: number
  cooldownLeftRealS: number | null
  /** Badges: „3 s (sim · stvarno: 30 s)” … (plain „30 s” on the real clock). */
  labels: { polling: string; cooldown: string; hpaSync: string; stabilization: string }
  lastDecision: QueueState['scaler']['lastDecision']
  history: QueueState['scaler']['history']
}

export function scalerView(s: QueueState): ScalerView {
  const a = s.config.autoscaler
  const sc = s.scaler
  const metric = queueMetric(s)
  const act = activeConsumers(s)
  const inactive = !sc.active && sc.replicas > 0 && a.minReplicas === 0
  const k = a.realPerSim
  const untilPoll = Math.max(0, sc.nextPollAt - s.t)
  const untilHpa = Math.max(0, sc.nextHpaAt - s.t)
  const cooldownLeft = inactive ? Math.max(0, sc.lastActiveAt + a.cooldownPeriodS - s.t) : null
  return {
    enabled: a.enabled,
    replicas: a.enabled ? sc.replicas : act.length,
    ready: act.filter((c) => c.status === 'running').length,
    starting: act.filter((c) => c.status === 'starting').length,
    metric,
    formulaDesired: Math.max(0, Math.ceil(metric / a.targetQueueLength - 1e-9)),
    active: sc.active,
    secondsUntilPoll: untilPoll,
    secondsUntilHpa: untilHpa,
    cooldownLeftS: cooldownLeft,
    realPerSim: k,
    secondsUntilPollRealS: untilPoll * k,
    secondsUntilHpaRealS: untilHpa * k,
    cooldownLeftRealS: cooldownLeft === null ? null : cooldownLeft * k,
    labels: {
      polling: controlDurationLabel(a.pollingIntervalS, k),
      cooldown: controlDurationLabel(a.cooldownPeriodS, k),
      hpaSync: controlDurationLabel(a.hpaSyncS, k),
      stabilization: controlDurationLabel(a.scaleDownStabilizationS, k),
    },
    lastDecision: sc.lastDecision,
    history: sc.history,
  }
}

/** Current producer rate λ(t). */
export function currentRate(s: QueueState): number {
  return rateAt(s, s.t)
}

export interface OrderOutcome {
  orders: number
  /** Distinct orders cooked at least once. */
  cooked: number
  /** Not finished yet: messages in the queue / retry lane / at consumers, direct requests and client retries in flight. */
  pending: number
  /** Dead-lettered (both causes) and split by cause. */
  inDlq: number
  dlqByDeliveryLimit: number
  dlqByMaxLength: number
  /** Destroyed without a DLQ. */
  dropped: number
  /** The client gave up (503 / 5xx / timeout / reject-publish after its retries). */
  failed: number
  /** Auto-ack losses. */
  lostAutoAck: number
  /** Every order so far was cooked, nothing pending, failed, dropped, dead-lettered or lost. */
  allServed: boolean
}

/**
 * Whole-run outcome. allServed is true only while the whole system is momentarily empty and nothing was ever lost,
 * so it is not a goal check – for „Ćevap-petak bez izgubljene narudžbe” use burstOutcome().
 */
export function orderOutcome(s: QueueState): OrderOutcome {
  const t = s.totals
  let autoHeld = 0
  let direct = 0
  for (const c of s.consumers) {
    autoHeld += c.buffer.filter((d) => d.autoAcked).length + (c.job?.delivery?.autoAcked ? 1 : 0)
    const req = c.job?.request
    if (req && !req.clientGaveUp && !req.order.resolved) direct++
  }
  const retries = s.clientRetryQueue.filter((r) => !r.order.resolved).length
  const pending = s.ready.size + s.delayed.length + s.unacked.size + autoHeld + direct + retries
  const cooked = s.cooked.size
  const bad = t.ordersFailed + t.dropped + t.dlq + t.lostAutoAck
  return {
    orders: t.orders,
    cooked,
    pending,
    inDlq: t.dlq,
    dlqByDeliveryLimit: t.dlqDeliveryLimit,
    dlqByMaxLength: t.dlqMaxLength,
    dropped: t.dropped,
    failed: t.ordersFailed,
    lostAutoAck: t.lostAutoAck,
    allServed: pending === 0 && bad === 0 && cooked === t.orders,
  }
}

export interface BurstState extends Omit<BurstTrack, 'arrivalsAtStart'> {
  /** At least one burst (profile window or „Nalet”) has started and ended. */
  happened: boolean
}

/** The current or last burst (profile window or manual „Nalet”). */
export function burstState(s: QueueState): BurstState {
  const { arrivalsAtStart: _skip, ...rest } = s.burst
  void _skip
  return { ...rest, happened: s.burst.lastEndedAt !== null }
}

export interface BurstOutcome {
  startedAt: number
  /** null while the burst still runs. */
  endedAt: number | null
  firstOrderId: number
  /** Last order of the burst so far (while it runs: the newest order). */
  lastOrderId: number
  orders: number
  /** Orders of the burst cooked at least once / lost for good (client gave up, dropped, auto-ack loss, DLQ) / neither yet. */
  cooked: number
  lost: number
  pending: number
  /** Latched once the burst ended and every order was cooked with none lost – never reverts for this burst. */
  done: boolean
  doneAt: number | null
  /** Latched once an order of this burst was lost – this burst can no longer be fully served. */
  failed: boolean
  /** Bursts fully served so far (monotonic) – „Ćevap-petak bez izgubljene narudžbe”: servedBursts > 0. */
  servedBursts: number
}

/**
 * Per-burst outcome over the burst's own order-ID range, latched by the engine (evaluated every 0,5 s). Earlier
 * losses or poison messages outside the burst do not matter, and the result does not flicker.
 * null before the first burst.
 */
export function burstOutcome(s: QueueState): BurstOutcome | null {
  const b = s.burst
  if (b.firstOrderId === null || b.startedAt === null) return null
  const last = b.lastOrderId ?? s.ids.order
  const o = burstCounts(s, b.firstOrderId, last)
  return {
    startedAt: b.startedAt,
    endedAt: b.active ? null : b.lastEndedAt,
    firstOrderId: b.firstOrderId,
    lastOrderId: last,
    ...o,
    done: b.done,
    doneAt: b.doneAt,
    failed: b.failed,
    servedBursts: b.servedBursts,
  }
}

export interface DuplicateGuard {
  /** An already cooked order was delivered again since the mark (the risky event happened). */
  triggered: boolean
  /** Redeliveries the idempotency key stamped „već skuhano”. */
  prevented: number
  /** Kitchen duplicates / duplicate SMS since the mark. */
  duplicates: number
  smsDuplicates: number
}

/**
 * „Nula dvostrukih narudžbi kad potrošač padne nakon kuhanja (RabbitMQ) ili kad obrada traje dulje od roka (SQS)”:
 * done = triggered && duplicates === 0 (doing nothing does not pass).
 */
export function duplicateGuard(s: QueueState, mark: Totals): DuplicateGuard {
  const since = totalsSince(s, mark)
  return {
    triggered: since.alreadyCooked + since.duplicates > 0,
    prevented: since.alreadyCooked,
    duplicates: since.duplicates,
    smsDuplicates: since.smsDuplicates,
  }
}

/** Snapshot of the counters – pair with totalsSince for goals that must ignore earlier experiments. */
export function markTotals(s: QueueState): Totals {
  return { ...s.totals }
}

/** Counters since a snapshot (e.g. „nula dvostrukih narudžbi” since the student switched idempotency on). */
export function totalsSince(s: QueueState, mark: Totals): Totals {
  const out = { ...s.totals }
  for (const k of Object.keys(out) as (keyof Totals)[]) out[k] = s.totals[k] - (mark[k] ?? 0)
  return out
}

export interface ControlState<T> {
  value: T
  enabled: boolean
  /** Croatian reason when disabled (for a tooltip). */
  reason: string | null
}

export interface ControlsView {
  rate: ControlState<number>
  consumers: ControlState<number>
  /** „Najviše isporuka”: disabled for SQS without a DLQ (no redrive policy, no maxReceiveCount). */
  maxDeliveries: ControlState<number>
  deliveryLimit: DeliveryLimitInfo
  /** DLQ toggle: RabbitMQ off → over the limit dropped; SQS off → no limit at all. */
  dlqEnabled: ControlState<boolean>
  maxQueue: ControlState<number>
  overflow: ControlState<OverflowPolicy>
  ackTimeout: AckTimeoutInfo
  smsGateway: ControlState<SmsGatewayState>
  seed: ControlState<number>
}

/** What every control should show and whether it currently has an effect. */
export function controlsView(s: QueueState): ControlsView {
  const c = s.config
  const owned = c.consumerSource === 'external' ? 'Podove workera određuje klaster (E3)' : c.autoscaler.enabled ? 'Broj potrošača određuje KEDA/HPA' : null
  const sqs = c.broker === 'sqs' ? 'SQS nema najveću duljinu reda' : null
  return {
    rate: { value: c.rate, enabled: c.profile.kind !== 'curve', reason: c.profile.kind === 'curve' ? 'Profil prometa (krivulja) određuje λ' : null },
    consumers: { value: owned ? activeConsumers(s).length : c.consumers, enabled: owned === null, reason: owned },
    maxDeliveries: {
      value: c.maxDeliveries,
      enabled: deliveryLimitEnforced(s),
      reason: deliveryLimitEnforced(s) ? null : 'SQS: maxReceiveCount postoji samo u redrive policyju s DLQ-om',
    },
    deliveryLimit: deliveryLimitInfo(s),
    dlqEnabled: {
      value: c.dlqEnabled,
      enabled: true,
      reason: c.dlqEnabled ? null : c.broker === 'sqs' ? 'Bez DLQ-a SQS nema ograničenja isporuka' : 'Bez dead-letter exchangea poruka preko ograničenja se odbacuje',
    },
    maxQueue: { value: c.maxQueue, enabled: sqs === null, reason: sqs },
    overflow: { value: c.overflow, enabled: sqs === null && Number.isFinite(c.maxQueue), reason: sqs ?? (Number.isFinite(c.maxQueue) ? null : 'Red nema ograničenja duljine') },
    ackTimeout: ackTimeoutInfo(s),
    smsGateway: { value: s.sms.state, enabled: true, reason: null },
    seed: { value: c.seed, enabled: false, reason: 'Sjeme se mijenja novim pokretanjem (reset)' },
  }
}

export interface Impact {
  /** Distinct orders with a bad outcome since `sinceS`: failed, dropped, lost, dead-lettered, late (> sloS) or overdue. */
  failedOrders: number
  /** Distinct users behind those orders. */
  affectedUsers: number
  firstErrorAt: number | null
  lastErrorAt: number | null
  /** lastErrorAt once nothing went wrong for `quietS` and nothing is overdue; null while still failing. */
  recoveredAt: number | null
  /** recoveredAt − firstErrorAt (L24 MTTR „from first error to recovery”). */
  mttrS: number | null
}

/** L24 score inputs: failed orders × distinct users, and MTTR. */
export function impact(s: QueueState, opts: { sinceS?: number; quietS?: number } = {}): Impact {
  const since = opts.sinceS ?? 0
  const quiet = opts.quietS ?? 30
  const L = s.impactLog
  const orders = new Set<number>()
  const users = new Set<number>()
  let first: number | null = null
  let last: number | null = null
  for (let i = 0; i < L.t.length; i++) {
    const t = L.t[i]
    if (t < since - EPS) continue
    orders.add(L.order[i])
    users.add(L.user[i])
    if (first === null || t < first) first = t
    if (last === null || t > last) last = t
  }
  // messages still waiting past the SLO already hurt their users
  let overdue = false
  const slo = s.config.sloS
  const check = (m: { publishedAt: number; orderId: number; userId: number }) => {
    const due = m.publishedAt + slo
    if (s.t - m.publishedAt <= slo + EPS || due < since - EPS) return
    overdue = true
    orders.add(m.orderId)
    users.add(m.userId)
    if (first === null || due < first) first = due
    last = s.t
  }
  s.ready.forEach(check)
  for (const m of s.delayed) check(m)
  for (const d of s.unacked.values()) check(d.msg)
  const recoveredAt = last !== null && !overdue && s.t - last >= quiet - EPS ? last : null
  return {
    failedOrders: orders.size,
    affectedUsers: users.size,
    firstErrorAt: first,
    lastErrorAt: last,
    recoveredAt,
    mttrS: recoveredAt !== null && first !== null ? recoveredAt - first : null,
  }
}

/* ------------------------------------------------------------------ L24: logs, Kubernetes events, traces */

/**
 * `kubectl logs`: the last 400 worker log lines (newest last), optionally for one consumer (id or Pod name) and
 * since a time.
 * An OOM-killed container's log simply stops – the reason is in podViews().lastTermination / describe.
 */
export function workerLogs(s: QueueState, opts: { consumerId?: number; pod?: string; sinceS?: number; limit?: number } = {}): WorkerLogEntry[] {
  const since = opts.sinceS ?? -Infinity
  const kept = s.workerLog.length > WORKER_LOG_CAP ? s.workerLog.slice(s.workerLog.length - WORKER_LOG_CAP) : s.workerLog
  const out = kept.filter((e) => e.t >= since - EPS && (opts.consumerId === undefined || e.consumerId === opts.consumerId) && (opts.pod === undefined || e.pod === opts.pod))
  const limit = opts.limit ?? Infinity
  return Number.isFinite(limit) && limit >= 0 ? out.slice(Math.max(0, out.length - Math.floor(limit))) : out
}

/** `kubectl get events` for the worker Pods (E3's KubeEvent shape; empty in external mode – E3 owns those). */
export function kubeEvents(s: QueueState, opts: { sinceS?: number } = {}): KubeEvent[] {
  const since = opts.sinceS ?? -Infinity
  return s.kubeEvents.filter((e) => e.t >= since - EPS)
}

export interface TraceSpanView extends TraceSpan {
  /** end, or the current time for a span still open. */
  endS: number
  open: boolean
  /** Pod of the consumer, if still known. */
  pod: string | null
}

export interface OrderTrace {
  orderId: number
  traceId: string
  /** First span start → last span end. */
  startS: number
  endS: number
  spans: TraceSpanView[]
  truncated: boolean
}

/** The waterfall of one order (kept for the last 300 orders): red → obrada → SMS → potvrda, with retries and DLQ. */
export function orderTrace(s: QueueState, orderId: number): OrderTrace | null {
  const r = s.traces.get(orderId)
  if (!r) return null
  const pods = new Map(s.consumers.map((c) => [c.id, podName(s, c)] as const))
  const spans = r.spans.map((x) => ({ ...x, endS: x.end ?? s.t, open: x.end === null, pod: x.consumerId !== null ? (pods.get(x.consumerId) ?? null) : null }))
  const startS = spans.length > 0 ? Math.min(...spans.map((x) => x.start)) : 0
  const endS = spans.length > 0 ? Math.max(...spans.map((x) => x.endS)) : 0
  return { orderId, traceId: r.traceId, startS, endS, spans, truncated: r.truncated }
}

/** Order ids that still have a trace, newest last. */
export function tracedOrders(s: QueueState): number[] {
  return [...s.traces.keys()]
}

/** ReplicaSet name of the current Pod template. */
export function currentReplicaSet(s: QueueState): string {
  return replicaSetName(s, s.revision)
}

/** A rollout in progress (rolloutConsumers), or null. */
export function rolloutView(s: QueueState): { revision: number; replicaSet: string; startedAt: number; oldPods: number; newPods: number; newReady: number } | null {
  const ro = s.rollout
  if (!ro) return null
  const active = activeConsumers(s)
  const neu = active.filter((c) => c.revision === ro.revision)
  return {
    revision: ro.revision,
    replicaSet: replicaSetName(s, ro.revision),
    startedAt: ro.startedAt,
    oldPods: active.length - neu.length,
    newPods: neu.length,
    newReady: neu.filter((c) => c.status === 'running').length,
  }
}
