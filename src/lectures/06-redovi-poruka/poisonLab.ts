/** The poison-message lab („Otrovna poruka”): a calm E2 queue; the UI follows the last poison message it sent. */
import { createQueueSim, consumerViews, delayedView, publishPoison, readyView, type QueueState } from '../../engines/queue'
import { backoffWindowS, fullJitterS } from '../../engines/queue'
import { createRng } from '../../kit'

/** `done`: the lab's goals, latched once reached (changing a setting afterwards does not untick them). */
export type PoisonState = QueueState & { poison: number | null; maxSeen: number; done: { dlq: boolean; loop: boolean; drop: boolean } }

export function createPoisonLab(): PoisonState {
  const s = createQueueSim({ seed: 254, rate: 0.8, consumers: 2, maxDeliveries: 5, retryMode: 'backoff' }) as PoisonState
  s.poison = null
  s.maxSeen = 0
  s.done = { dlq: false, loop: false, drop: false }
  return s
}

export function sendPoison(s: PoisonState): void {
  s.poison = publishPoison(s)
  s.maxSeen = 0
}

export interface PoisonWhere {
  orderId: number
  where: 'red' | 'čeka ponovni pokušaj' | 'kod potrošača' | 'DLQ' | 'odbačena' | 'na putu'
  deliveries: number
  waitS: number | null
}

/** Where the followed poison message is now and how many times it has been delivered. */
export function poisonWhere(s: PoisonState): PoisonWhere | null {
  const id = s.poison
  if (id === null) return null
  const dlq = s.dlqRecent.find((e) => e.orderId === id)
  if (dlq) return { orderId: id, where: 'DLQ', deliveries: dlq.receiveCount, waitS: null }
  const r = readyView(s, 500).find((m) => m.orderId === id)
  if (r) return { orderId: id, where: 'red', deliveries: r.receiveCount, waitS: null }
  const d = delayedView(s).find((m) => m.orderId === id)
  if (d) return { orderId: id, where: 'čeka ponovni pokušaj', deliveries: d.receiveCount, waitS: d.remainingS }
  const c = consumerViews(s).find((x) => x.orderId === id)
  if (c) {
    // the delivery the consumer holds carries the engine's receive count (a nack-requeue loop never rests in the queue)
    let held: number | null = null
    for (const d of s.unacked.values()) if (d.msg.orderId === id) held = d.msg.receiveCount
    return { orderId: id, where: 'kod potrošača', deliveries: held ?? s.maxSeen + 1, waitS: null }
  }
  const dropped = s.totals.dropped > 0 && !s.config.dlqEnabled
  return { orderId: id, where: dropped ? 'odbačena' : 'na putu', deliveries: s.maxSeen, waitS: null }
}

/** After each engine step: remember how many times the followed message has been delivered and latch the goals. */
export function trackPoison(s: PoisonState): void {
  const w = poisonWhere(s)
  if (w && w.where !== 'odbačena' && w.where !== 'na putu') s.maxSeen = Math.max(s.maxSeen, w.deliveries)
  const rabbit = s.config.broker === 'rabbitmq'
  if (s.dlqRecent.some((e) => e.poison && e.reason === 'max-deliveries')) s.done.dlq = true
  if (rabbit && s.config.retryMode === 'nack-requeue' && w !== null && w.deliveries > s.config.maxDeliveries + 2) s.done.loop = true
  if (rabbit && !s.config.dlqEnabled && s.totals.dropped > 0) s.done.drop = true
}

export interface JitterRow {
  attempt: number
  windowS: number
  /** seeded full-jitter samples random(0, window) of 14 clients */
  samples: number[]
}

/** Full-jitter windows min(cap, base·2ⁿ) for attempts 1–6 (base 0,5 s, cap 30 s, as in the engine) with seeded samples. */
export function jitterRows(base = 0.5, cap = 30): JitterRow[] {
  const rng = createRng(4242)
  return [1, 2, 3, 4, 5, 6].map((n) => ({ attempt: n, windowS: backoffWindowS(n, base, cap), samples: Array.from({ length: 14 }, () => fullJitterS(rng, n, base, cap)) }))
}
