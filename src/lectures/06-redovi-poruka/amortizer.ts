/**
 * „Red kao amortizer”: the same seeded Ćevap-petak run twice through E2 – with direct calls and with a queue – for a
 * chosen burst rate and number of consumers. Headless (≈ 10–25 ms per pair), memoised by the component.
 */
import { CEVAP_PETAK_SEED, createQueueSim, metrics, runFor, type QueueState } from '../../engines/queue'

export const RUN_S = 150
export const SAMPLE_S = 0.5
export const BASE_RATE = 2
export const BURST_AT = 30
export const BURST_S = 10

export interface AmortizerRun {
  burstRate: number
  k: number
  depth: number[]
  lambda: number[]
  capacity: number[]
  orders: number
  lostDirect: number
  ordersDirect: number
  peak: number
  drainS: number | null
  maxWaitS: number
  lostQueue: number
}

const profile = (rate: number) => ({ kind: 'burst' as const, startS: BURST_AT, durationS: BURST_S, rate })

export function runAmortizer(burstRate: number, k: number): AmortizerRun {
  const q = createQueueSim({ seed: CEVAP_PETAK_SEED, mode: 'queue', consumers: k, profile: profile(burstRate) })
  const depth: number[] = []
  const lambda: number[] = []
  const capacity: number[] = []
  let peak = 0
  let maxWait = 0
  for (let t = 0; t < RUN_S; t += SAMPLE_S) {
    runFor(q, SAMPLE_S)
    const m = metrics(q)
    depth.push(m.backlog)
    const tt = t + SAMPLE_S
    lambda.push(tt > BURST_AT && tt <= BURST_AT + BURST_S ? Math.max(BASE_RATE, burstRate) : BASE_RATE)
    capacity.push(k)
    peak = Math.max(peak, m.backlog)
    maxWait = Math.max(maxWait, m.oldestReadyAgeS)
  }
  const d = createQueueSim({ seed: CEVAP_PETAK_SEED, mode: 'direct', consumers: k, profile: profile(burstRate) })
  runFor(d, RUN_S)
  const dt = d.totals
  return {
    burstRate,
    k,
    depth,
    lambda,
    capacity,
    orders: q.totals.orders,
    ordersDirect: dt.orders,
    lostDirect: dt.ordersFailed + dt.dropped + dt.lostAutoAck,
    peak,
    drainS: q.drain.last ? q.drain.last.durationS : null,
    maxWaitS: maxWait,
    lostQueue: q.totals.ordersFailed + q.totals.dropped + q.totals.lostAutoAck,
  }
}

/** The same seeded queue run frozen at `t` seconds – drawn as the kitchen rail under the charts (≈ 10 ms). */
export function snapshotAt(burstRate: number, k: number, t: number): QueueState {
  const q = createQueueSim({ seed: CEVAP_PETAK_SEED, mode: 'queue', consumers: k, profile: profile(burstRate) })
  runFor(q, Math.max(0, Math.min(RUN_S, t)))
  return q
}
