/**
 * Defaults, real-vs-sim timings and config helpers for E2 „Red”.
 * Every compressed value has both numbers so a UI can label it: „60 s (sim) · stvarno: 30 min”.
 */
import type { AutoscalerConfig, QueueConfig, QueueConfigPatch, RestartPolicy } from './types.ts'

/** Internal fixed timestep: 10 ms of simulated time (sim-models: LB and queue sims need 10 ms resolution). */
export const DT = 0.01
/** Charts are sampled every 0,5 s; 240 samples = the last 2 minutes. */
export const SAMPLE_S = 0.5
export const SERIES_LEN = 240
/** Latency percentiles: sliding window of successful jobs; „n/a” below MIN_SAMPLES. */
export const LATENCY_WINDOW_S = 60
export const MIN_SAMPLES = 20
export const EVENT_CAP = 50
export const FLIGHT_CAP = 200
/** Default cosmetic hop duration (sim seconds); a UI can change it with setFlightDuration (e.g. 0,3 s × speed). */
export const FLIGHT_S = 0.3
/** Backlog peak that counts as a „nalet” for drain-time measurement. */
export const DRAIN_MIN_PEAK = 10

/** A timing the sim uses next to the value it stands for. Same field names as the other engines (simValue / realValue). */
export interface Timing {
  /** Value the sim uses by default (seconds). */
  sim: number
  simValue: number
  /** The value it stands for (seconds). */
  real: number
  realValue: number
  /**
   * 'default' = the product's real default (AWS, RabbitMQ, KEDA, Kubernetes).
   * 'model' = a classroom value of another engine's model (E3), not a product default – never label it „stvarno”.
   */
  realKind: 'default' | 'model'
  /** true when the sim runs it shorter than the value it stands for (a linear time compression real / sim). */
  compressed: boolean
  /** Where the value comes from. */
  source: string
  /** Badge for the default sim value, e.g. „60 s (sim) · stvarno: 30 min”. */
  label: string
}

function timing(sim: number, real: number, source: string, realKind: Timing['realKind'] = 'default'): Timing {
  const t: Timing = { sim, simValue: sim, real, realValue: real, realKind, compressed: sim !== real, source, label: '' }
  t.label = timingLabel(t)
  return t
}

/** Real defaults and the classroom values used in the sim. */
export const TIMINGS = {
  sqsVisibilityTimeout: timing(30, 30, 'AWS SQS (zadano 30 s, najviše 12 h)'),
  rabbitConsumerTimeout: timing(60, 1800, 'RabbitMQ consumer_timeout (zadano 30 min)'),
  kedaPollingInterval: timing(3, 30, 'KEDA pollingInterval'),
  kedaCooldownPeriod: timing(30, 300, 'KEDA cooldownPeriod'),
  hpaSyncPeriod: timing(1.5, 15, 'HPA --horizontal-pod-autoscaler-sync-period'),
  hpaScaleDownStabilization: timing(30, 300, 'HPA scaleDown.stabilizationWindowSeconds'),
  crashLoopBackoffBase: timing(1, 10, 'kubelet CrashLoopBackOff (prvo ponovno pokretanje odmah, zatim 10 s)'),
  crashLoopBackoffCap: timing(30, 300, 'kubelet CrashLoopBackOff (najviše 5 min)'),
  crashLoopBackoffReset: timing(60, 600, 'kubelet CrashLoopBackOff (reset nakon 10 min rada)'),
  workerPodStartup: timing(2, 12, 'model klastera E3 (sim-models SIM 4 „Pod start [sim]”): raspoređivanje 1 s + slika u predmemoriji 1 s + pokretanje 10 s', 'model'),
} as const satisfies Record<string, Timing>

/** Per-broker default ack deadline (sim seconds) – SQS visibility timeout vs RabbitMQ consumer_timeout. */
export const ACK_TIMEOUT = {
  sqs: TIMINGS.sqsVisibilityTimeout,
  rabbitmq: TIMINGS.rabbitConsumerTimeout,
} as const

/** Real broker facts (as of October 2026, RabbitMQ 4.3) the UI may show next to sliders. */
export const BROKER_FACTS = {
  /** Quorum `delivery-limit` default (4.0+). A message is dead-lettered when delivery-count EXCEEDS it… */
  rabbitQuorumDeliveryLimit: 20,
  /** …so the default allows 21 deliveries – the `maxDeliveries` value that matches the quorum default. */
  rabbitQuorumDefaultDeliveries: 21,
  rabbitConsumerTimeoutS: 1800,
  rabbitDefaultOverflow: 'drop-head',
  /** 4.3: `basic.nack` (requeue) and consumer_timeout do not increment delivery-count; reject and connection loss do. */
  rabbitNackCountsTowardLimit: false,
  /** 4.3 quorum queues: native linear delayed retry, delay = min(min · delivery-count, max). */
  rabbitDelayedRetryArgs: 'x-delayed-retry-type / x-delayed-retry-min / x-delayed-retry-max',
  sqsVisibilityDefaultS: 30,
  sqsVisibilityMaxS: 43200,
  /** SQS message retention: default 4 days, at most 14 days. Without a DLQ a failing message returns until then. */
  sqsRetentionDefaultS: 345600,
  sqsRetentionMaxS: 1209600,
  /** maxReceiveCount exists only in a redrive policy (which needs a DLQ). */
  sqsMaxReceiveCountNeedsDlq: true,
  /** Standard queue with a redrive policy and maxReceiveCount > 3: a message received ≥ 3 times moves to the back. */
  sqsBackOfQueueAfterReceives: 3,
  sqsFifoDedupWindowS: 300,
  kedaDefaultPollingS: 30,
  kedaDefaultCooldownS: 300,
} as const

/** Fixed 2 s restart (a supervised process outside Kubernetes) – the L06 default. */
export const RESTART_FIXED: RestartPolicy = { baseS: 2, capS: 2, resetAfterS: 60, immediateFirst: false, realPerSim: 1 }
/** Kubernetes CrashLoopBackOff, compressed ÷10 (stvarno: odmah, 10 s, 20 s, 40 s … najviše 300 s, reset nakon 10 min). */
export const RESTART_CRASHLOOP: RestartPolicy = {
  baseS: TIMINGS.crashLoopBackoffBase.sim,
  capS: TIMINGS.crashLoopBackoffCap.sim,
  resetAfterS: TIMINGS.crashLoopBackoffReset.sim,
  immediateFirst: true,
  realPerSim: TIMINGS.crashLoopBackoffBase.real / TIMINGS.crashLoopBackoffBase.sim,
}
export const RESTART_CRASHLOOP_REAL: RestartPolicy = {
  baseS: TIMINGS.crashLoopBackoffBase.real,
  capS: TIMINGS.crashLoopBackoffCap.real,
  resetAfterS: TIMINGS.crashLoopBackoffReset.real,
  immediateFirst: true,
  realPerSim: 1,
}

/** KEDA + HPA with compressed timings (÷10). maxReplicas 10 and target 10 as E3's defaultKeda. */
export const DEFAULT_AUTOSCALER: AutoscalerConfig = {
  enabled: false,
  targetQueueLength: 10,
  activationQueueLength: 0,
  minReplicas: 0,
  maxReplicas: 10,
  pollingIntervalS: TIMINGS.kedaPollingInterval.sim,
  cooldownPeriodS: TIMINGS.kedaCooldownPeriod.sim,
  hpaSyncS: TIMINGS.hpaSyncPeriod.sim,
  tolerance: 0.1,
  scaleDownStabilizationS: TIMINGS.hpaScaleDownStabilization.sim,
  scaleUpPercent: 100,
  scaleUpPods: 4,
  podStartupS: TIMINGS.workerPodStartup.sim,
  metric: 'ready+unacked',
  realPerSim: TIMINGS.kedaCooldownPeriod.real / TIMINGS.kedaCooldownPeriod.sim,
}

/** The same autoscaler with real (uncompressed) KEDA/HPA defaults; Pod start-up uses E3's 12 s model value. */
export const REAL_AUTOSCALER_TIMINGS: Partial<AutoscalerConfig> = {
  pollingIntervalS: TIMINGS.kedaPollingInterval.real,
  cooldownPeriodS: TIMINGS.kedaCooldownPeriod.real,
  hpaSyncS: TIMINGS.hpaSyncPeriod.real,
  scaleDownStabilizationS: TIMINGS.hpaScaleDownStabilization.real,
  podStartupS: TIMINGS.workerPodStartup.real,
  realPerSim: 1,
}

/** sim-models SIM 2 defaults. */
export const DEFAULT_CONFIG: QueueConfig = {
  seed: 42,
  mode: 'queue',
  broker: 'rabbitmq',
  rate: 2,
  profile: { kind: 'steady' },
  arrivals: 'poisson',
  consumers: 4,
  consumerSource: 'internal',
  serviceMeanS: 1,
  serviceDist: 'exp',
  prefetch: 1,
  pFail: 0,
  pPoison: 0,
  maxDeliveries: 5,
  dlqEnabled: true,
  retryMode: 'backoff',
  backoffBaseS: 0.5,
  backoffCapS: 30,
  visibilityTimeoutS: TIMINGS.sqsVisibilityTimeout.sim,
  consumerTimeoutS: TIMINGS.rabbitConsumerTimeout.sim,
  ackMode: 'manual',
  idempotent: false,
  smsGuard: 'none',
  smsOnFailure: 'retry-sms',
  smsGateway: 'ok',
  smsSlowS: 3,
  smsTimeoutS: 5,
  maxQueue: Infinity,
  overflow: 'drop-head',
  clientRetries: 0,
  clientTimeoutS: 10,
  slowExtraS: 40,
  consumerFault: 'none',
  restart: RESTART_FIXED,
  autoscaler: DEFAULT_AUTOSCALER,
  users: 500,
  sloS: 30,
  consumerNames: 'potrošač',
  podNamePrefix: 'klopa-worker',
}

/** Classroom burst: 15 narudžbi/s for 10 s (Ćevap-petak). */
export const BURST = { rate: 15, durationS: 10 } as const

/** Number from user input: NaN / non-numbers → fallback, then clamped (±Infinity clamps to the bounds). */
export const num = (v: unknown, fallback: number, min = -Infinity, max = Infinity): number => {
  const n = typeof v === 'number' && !Number.isNaN(v) ? v : fallback
  return Math.min(max, Math.max(min, n))
}
export const int = (v: unknown, fallback: number, min: number, max: number): number => Math.floor(num(v, fallback, min, max))

/** Merge a patch into a full config (nested autoscaler/restart merged field by field). */
export function mergeConfig(base: QueueConfig, patch: QueueConfigPatch = {}): QueueConfig {
  return {
    ...base,
    ...patch,
    profile: patch.profile ?? base.profile,
    restart: { ...base.restart, ...(patch.restart ?? {}) },
    autoscaler: { ...base.autoscaler, ...(patch.autoscaler ?? {}) },
  } as QueueConfig
}

/** Clamp every field into a safe range (NaN → default) so the engine never produces NaN. */
export function sanitizeConfig(c: QueueConfig): QueueConfig {
  const d = DEFAULT_CONFIG
  const a = c.autoscaler
  const da = DEFAULT_AUTOSCALER
  const minReplicas = int(a.minReplicas, da.minReplicas, 0, 100)
  return {
    ...c,
    seed: int(c.seed, d.seed, 0, 2 ** 32 - 1),
    mode: c.mode === 'direct' ? 'direct' : 'queue',
    broker: c.broker === 'sqs' ? 'sqs' : 'rabbitmq',
    rate: num(c.rate, d.rate, 0, 1000),
    arrivals: c.arrivals === 'uniform' ? 'uniform' : 'poisson',
    consumers: int(c.consumers, d.consumers, 0, 100),
    consumerSource: c.consumerSource === 'external' ? 'external' : 'internal',
    serviceMeanS: num(c.serviceMeanS, d.serviceMeanS, 0.01, 3600),
    serviceDist: c.serviceDist === 'fixed' ? 'fixed' : 'exp',
    prefetch: int(c.prefetch, d.prefetch, 1, 1000),
    pFail: num(c.pFail, 0, 0, 1),
    pPoison: num(c.pPoison, 0, 0, 1),
    maxDeliveries: int(c.maxDeliveries, d.maxDeliveries, 1, 1000),
    dlqEnabled: c.dlqEnabled !== false,
    retryMode: c.retryMode === 'immediate' || c.retryMode === 'nack-requeue' ? c.retryMode : 'backoff',
    backoffBaseS: num(c.backoffBaseS, d.backoffBaseS, 0, 3600),
    backoffCapS: num(c.backoffCapS, d.backoffCapS, 0, 43200),
    visibilityTimeoutS: num(c.visibilityTimeoutS, d.visibilityTimeoutS, DT, 43200),
    consumerTimeoutS: num(c.consumerTimeoutS, d.consumerTimeoutS, DT, 86400),
    ackMode: c.ackMode === 'auto' ? 'auto' : 'manual',
    idempotent: c.idempotent === true,
    smsGuard: c.smsGuard === 'record-first' || c.smsGuard === 'provider-key' ? c.smsGuard : 'none',
    smsOnFailure: c.smsOnFailure === 'nack-message' ? 'nack-message' : 'retry-sms',
    smsGateway: c.smsGateway === 'slow' || c.smsGateway === 'down' ? c.smsGateway : 'ok',
    smsSlowS: num(c.smsSlowS, d.smsSlowS, 0, 3600),
    smsTimeoutS: num(c.smsTimeoutS, d.smsTimeoutS, 0, 3600),
    maxQueue: c.maxQueue === Infinity ? Infinity : int(c.maxQueue, Infinity, 1, 1e9),
    overflow: c.overflow === 'reject-publish' ? 'reject-publish' : 'drop-head',
    clientRetries: int(c.clientRetries, 0, 0, 20),
    clientTimeoutS: num(c.clientTimeoutS, d.clientTimeoutS, DT, 3600),
    slowExtraS: num(c.slowExtraS, d.slowExtraS, 0, 3600),
    consumerFault: c.consumerFault === 'slow' || c.consumerFault === 'oom' ? c.consumerFault : 'none',
    restart: {
      baseS: num(c.restart.baseS, RESTART_FIXED.baseS, 0, 3600),
      capS: num(c.restart.capS, RESTART_FIXED.capS, 0, 3600),
      resetAfterS: num(c.restart.resetAfterS, RESTART_FIXED.resetAfterS, 0, 86400),
      immediateFirst: c.restart.immediateFirst === true,
      realPerSim: num(c.restart.realPerSim, 1, 0.001, 1e6),
    },
    autoscaler: {
      enabled: a.enabled === true,
      targetQueueLength: num(a.targetQueueLength, da.targetQueueLength, 0.001, 1e6),
      activationQueueLength: num(a.activationQueueLength, da.activationQueueLength, 0, 1e6),
      minReplicas,
      maxReplicas: int(a.maxReplicas, da.maxReplicas, Math.max(1, minReplicas), 100),
      pollingIntervalS: num(a.pollingIntervalS, da.pollingIntervalS, DT, 86400),
      cooldownPeriodS: num(a.cooldownPeriodS, da.cooldownPeriodS, 0, 86400),
      hpaSyncS: num(a.hpaSyncS, da.hpaSyncS, DT, 86400),
      tolerance: num(a.tolerance, da.tolerance, 0, 10),
      scaleDownStabilizationS: num(a.scaleDownStabilizationS, da.scaleDownStabilizationS, 0, 86400),
      scaleUpPercent: num(a.scaleUpPercent, da.scaleUpPercent, 0, 10000),
      scaleUpPods: int(a.scaleUpPods, da.scaleUpPods, 0, 1000),
      podStartupS: num(a.podStartupS, da.podStartupS, 0, 3600),
      metric: a.metric === 'ready' ? 'ready' : 'ready+unacked',
      realPerSim: num(a.realPerSim, da.realPerSim, 0.001, 1e6),
    },
    users: int(c.users, d.users, 1, 1e6),
    sloS: num(c.sloS, d.sloS, DT, 86400),
    consumerNames: c.consumerNames === 'pod' ? 'pod' : 'potrošač',
    podNamePrefix: typeof c.podNamePrefix === 'string' && /^[a-z0-9]([-a-z0-9]{0,40}[a-z0-9])?$/.test(c.podNamePrefix) ? c.podNamePrefix : d.podNamePrefix,
  }
}

/** Croatian duration: 0,5 s · 30 s · 5 min · 30 min · 12 h. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '∞'
  const hr = (v: number, d = 1) => v.toLocaleString('hr-HR', { maximumFractionDigits: d })
  if (seconds <= 60) return `${hr(seconds)} s`
  if (seconds < 3600) return seconds % 60 === 0 ? `${hr(seconds / 60, 0)} min` : `${hr(seconds / 60)} min`
  return `${hr(seconds / 3600)} h`
}

/**
 * Badge text for a timing at `simValue` (default: its sim default):
 * - compressed default:      „60 s (sim) · stvarno: 30 min”
 * - compressed, changed:      „10 s (sim) · skraćeno; stvarno zadano: 30 min”
 * - not compressed, default: „30 s”;  changed: „2 s · zadano: 30 s”
 * - another engine's model:  „2 s (sim) · model klastera (E3): 12 s”
 * A changed compressed value gets no „≈ X stvarno”: only that one timer is compressed (jobs, the 40 s slow-job
 * extra and SQS run 1:1), so a proportional real equivalent would teach a wrong ratio between job and timeout.
 */
export function timingLabel(t: Pick<Timing, 'sim' | 'real' | 'realKind'>, simValue: number = t.sim): string {
  const v = formatDuration(simValue)
  if (t.realKind === 'model') return `${v} (sim) · model klastera (E3): ${formatDuration((simValue * t.real) / t.sim)}`
  if (t.sim === t.real) return simValue === t.real ? v : `${v} · zadano: ${formatDuration(t.real)}`
  if (simValue === t.sim) return `${v} (sim) · stvarno: ${formatDuration(t.real)}`
  return `${v} (sim) · skraćeno; stvarno zadano: ${formatDuration(t.real)}`
}

/**
 * A KEDA/HPA control-loop duration in sim seconds with what it stands for on the compressed control clock:
 * „30 s (sim · stvarno: 5 min)” when realPerSim ≠ 1, else „30 s”.
 */
export function controlDurationLabel(simS: number, realPerSim: number): string {
  const v = formatDuration(simS)
  return realPerSim === 1 ? v : `${v} (sim · stvarno: ${formatDuration(simS * realPerSim)})`
}
