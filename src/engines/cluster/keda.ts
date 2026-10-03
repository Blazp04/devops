/**
 * KEDA for klopa-worker: the operator handles 0 ↔ 1 (activation when the queue has messages, checked every
 * pollingInterval 30 s; back to 0 after cooldownPeriod 300 s without any); the HPA it creates handles 1 ↔ N with an
 * external metric: desired = ceil(messages / target) (HPA tolerance and stabilisation apply).
 *
 * Queue model (fluid, every tick): messages arrive at `arrivalRate` (or along `profile`) into the READY part of the
 * queue; every Ready worker holds at most one delivered, not yet acknowledged message (prefetch 1) and finishes
 * `perWorkerRate` messages per second. The scaler metric is ready + unacked – what KEDA's RabbitMQ scaler reads over
 * the management (HTTP) API by default (excludeUnacknowledged: false) – so a worker that keeps up with a steady
 * stream (ready ≈ 0, but always something in hand) stays active and is never scaled to zero under load.
 * Messages held by a worker that disappears are redelivered (back to ready).
 */
import type { ClusterState, Keda, TrafficProfile } from './types.ts'
import { createHpa } from './hpa.ts'
import { findDeployment } from './rollout.ts'
import { profileRate } from './traffic.ts'
import { hrCount, isReady, kubeEvent, logEvent, matches } from './util.ts'

const MESSAGES: [string, string, string] = ['poruka', 'poruke', 'poruka']

/** Create the HPA that KEDA would create for the ScaledObject (min 1, external metric). */
export function setupKeda(s: ClusterState): void {
  const k = s.cfg.keda
  if (!k) return
  if (s.hpas.some((h) => h.name === k.hpaName)) return
  createHpa(s, {
    name: k.hpaName,
    namespace: k.namespace,
    target: k.deployment,
    minReplicas: Math.max(1, k.minReplicaCount),
    maxReplicas: k.maxReplicaCount,
    metric: { type: 'external', name: 's0-rabbitmq-orders', targetAverageValue: k.targetQueueLength },
    keda: true,
  })
}

/** Messages the scaler sees: ready + delivered-but-unacknowledged. */
export function kedaQueueMetric(k: Keda): number {
  return k.queueLength + (k.unacked ?? 0)
}

/** Current arrival rate (messages/s): the profile relative to its origin, or the constant rate. */
export function kedaArrivalRate(s: ClusterState, k: Keda): number {
  return k.profile ? profileRate(k.profile, s.t - k.profileT0) : k.arrivalRate
}

export function kedaTick(s: ClusterState): void {
  const k = s.cfg.keda
  if (!k || !k.enabled) return
  const dt = s.cfg.timings.dt
  const d = findDeployment(s, k.deployment, k.namespace)
  // queue dynamics
  const inflow = kedaArrivalRate(s, k) * dt
  k.queueLength += inflow
  k.totals.published += inflow
  const workers = d ? s.pods.filter((p) => p.namespace === k.namespace && matches(d.selector, p.labels) && isReady(p) && p.processUp).length : 0
  // a worker that went away returns its message to the queue (redelivery)
  if (k.unacked > workers) {
    k.queueLength += k.unacked - workers
    k.unacked = workers
  }
  // busy workers finish messages, then free workers take new ones (prefetch 1)
  const done = Math.min(k.unacked, k.unacked * k.perWorkerRate * dt)
  k.unacked -= done
  k.totals.processed += done
  const take = Math.min(k.queueLength, Math.max(0, workers - k.unacked))
  k.queueLength -= take
  k.unacked += take
  if (k.queueLength < 1e-9) k.queueLength = 0
  if (k.unacked < 1e-9) k.unacked = 0
  // operator polling (0 ↔ 1)
  if (s.t - k.lastPollAt + 1e-9 < k.pollingIntervalS) return
  k.lastPollAt = s.t
  if (!d || !s.components.apiServer || !s.components.etcd) return
  const metric = kedaQueueMetric(k)
  const active = metric > k.activationQueueLength + 1e-9
  if (active) k.lastActiveAt = s.t
  if (d.replicas === 0 && active) {
    d.replicas = Math.max(1, k.minReplicaCount)
    kubeEvent(s, 'Normal', 'KEDAScaleTargetActivated', `scaledobject/${k.deployment}`, `Scaled apps/v1.Deployment ${k.namespace}/${k.deployment} from 0 to ${d.replicas}, triggered by rabbitMQScaler`)
    logEvent(s, 'keda-up', `KEDA: u redu ${hrCount(Math.round(metric), MESSAGES)} → ${k.deployment} 0 → ${d.replicas}`, 'info')
    return
  }
  const idleSince = k.lastActiveAt ?? d.createdAt
  if (d.replicas > 0 && !active && k.minReplicaCount === 0 && s.t - idleSince + 1e-9 >= k.cooldownS) {
    const from = d.replicas
    d.replicas = 0
    kubeEvent(s, 'Normal', 'KEDAScaleTargetDeactivated', `scaledobject/${k.deployment}`, `Deactivated apps/v1.Deployment ${k.namespace}/${k.deployment} from ${from} to 0`)
    logEvent(s, 'keda-down', `KEDA: u redu nema poruka ${k.cooldownS} s → ${k.deployment} ${from} → 0`, 'neutral')
  }
}

/** Publish messages right now (e.g. "Pošalji narudžbu"). Rejects NaN, ±Infinity and negative counts. */
export function publishMessages(s: ClusterState, n: number): boolean {
  const k = s.cfg.keda
  if (!k || !Number.isFinite(n) || n < 0) return false
  k.queueLength += n
  k.totals.published += n
  return true
}

/** Constant arrival rate (messages/s); clears a profile. Rejects NaN, ±Infinity and negative rates. */
export function setQueueArrivalRate(s: ClusterState, rate: number): boolean {
  const k = s.cfg.keda
  if (!k || !Number.isFinite(rate) || rate < 0) return false
  k.arrivalRate = rate
  k.profile = null
  return true
}

/**
 * Arrival rate along a profile (e.g. QUEUE_DAY: nothing at night, orders by day), anchored at „now” by default;
 * null returns to the constant arrivalRate.
 */
export function setQueueProfile(s: ClusterState, profile: TrafficProfile | null, o: { anchor?: 'now' | 'absolute' } = {}): boolean {
  const k = s.cfg.keda
  if (!k) return false
  k.profile = profile ? { ...profile } : null
  k.profileT0 = (o.anchor ?? 'now') === 'now' ? s.t : 0
  return true
}
