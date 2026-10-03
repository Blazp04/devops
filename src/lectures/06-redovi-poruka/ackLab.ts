/**
 * The acknowledgement / idempotency lab (scenes „Potvrda i ponovna isporuka” and „Ključ idempotentnosti”):
 * a calm E2 queue with two consumers and fixed 3 s cooking, plus a log of crash experiments and what became of
 * the order (cooked once, twice, or lost). All queue behaviour is the engine's; this file only bookkeeps.
 *
 * Crash 'sms' („dok šalje SMS”) is a thin adapter: E2 has no crash point between the kitchen commit and the SMS call
 * (with a healthy gateway the call takes no time), so the lab makes the gateway slow for a moment and crashes the
 * consumer while it waits for it – the order is recorded, the SMS has not gone out.
 */
import {
  consumerViews,
  crashConsumer,
  createQueueSim,
  delayedView,
  inflightView,
  publishBatch,
  readyView,
  setSmsGateway,
  step,
  type Broker,
  type AckMode,
  type QueueState,
  type SmsGuard,
} from '../../engines/queue'

export type CrashWhen = 'before' | 'after' | 'sms'
export type ExpResult = 'once' | 'twice' | 'lost'

export interface Experiment {
  id: number
  orderId: number
  broker: Broker
  ack: AckMode
  when: CrashWhen
  idempotent: boolean
  smsGuard: SmsGuard
  startedAt: number
  result: ExpResult | null
  cooked: number
  deduped: number
  sms: number
}

/** `pending`: a crash button was pressed while nobody was cooking a fresh order – the crash fires when one starts. */
export type LabState = QueueState & { exps: Experiment[]; expId: number; pending: CrashWhen | null }

export const LAB_COOK_S = 3
export const LAB_VISIBILITY_S = 10

export function createLab(opts: { idempotent?: boolean; smsGuard?: SmsGuard } = {}): LabState {
  const s = createQueueSim({
    seed: 606,
    mode: 'queue',
    rate: 0,
    consumers: 2,
    serviceDist: 'fixed',
    serviceMeanS: LAB_COOK_S,
    visibilityTimeoutS: LAB_VISIBILITY_S,
    idempotent: opts.idempotent ?? false,
    smsGuard: opts.smsGuard ?? 'none',
  }) as LabState
  s.exps = []
  s.expId = 1
  s.pending = null
  return s
}

/** Is this order still somewhere in the broker or in a consumer's hands? */
function inFlight(s: QueueState, orderId: number): boolean {
  if (readyView(s, 200).some((m) => m.orderId === orderId)) return true
  if (delayedView(s).some((m) => m.orderId === orderId)) return true
  if (inflightView(s).some((d) => d.orderId === orderId)) return true
  if (consumerViews(s).some((c) => c.orderId === orderId || c.crashArmed)) return true
  return s.flights.some((f) => f.orderId === orderId && f.t0 + f.dur > s.t)
}

function tally(s: QueueState, e: Experiment) {
  const k = s.kitchen.filter((x) => x.orderId === e.orderId)
  e.cooked = k.filter((x) => x.kind === 'cooked' || x.kind === 'duplicate').length
  e.deduped = k.filter((x) => x.kind === 'deduped').length
  e.sms = s.smsLog.filter((x) => x.orderId === e.orderId && (x.kind === 'sent' || x.kind === 'duplicate' || x.kind === 'resent')).length
}

/** step() for useSimulation: the engine's step, then settle the experiments whose order has come to rest. */
export function labStep(s: LabState, dt: number): void {
  step(s, dt)
  if (s.pending !== null && runCrash(s, s.pending)) s.pending = null
  for (const e of s.exps) {
    if (e.result !== null) continue
    tally(s, e)
    if (s.t - e.startedAt < 0.5 || inFlight(s, e.orderId)) continue
    e.result = e.cooked === 0 ? 'lost' : e.cooked > 1 ? 'twice' : 'once'
  }
}

/**
 * The consumer a crash button would hit: one that is cooking a fresh order (no experiment yet – a redelivered order
 * is the outcome of an earlier experiment, not a new one) and has not committed yet.
 */
export function crashTarget(s: LabState): { id: number; orderId: number } | null {
  const used = new Set(s.exps.map((e) => e.orderId))
  const c = consumerViews(s).find((x) => x.status === 'busy' && x.phase === 'work' && !x.committed && !x.crashArmed && !x.ticketArriving && x.orderId !== null && !used.has(x.orderId))
  return c && c.orderId !== null ? { id: c.id, orderId: c.orderId } : null
}

/** The consumer that has just recorded a fresh order and is waiting for the SMS gateway. */
function smsTarget(s: LabState): { id: number; orderId: number } | null {
  const used = new Set(s.exps.map((e) => e.orderId))
  const c = consumerViews(s).find((x) => x.status === 'busy' && x.phase === 'sms' && x.committed && !x.crashArmed && x.orderId !== null && !used.has(x.orderId))
  return c && c.orderId !== null ? { id: c.id, orderId: c.orderId } : null
}

/** A crash button: crash the cook of a fresh order now, or send a new order and crash its cook when cooking starts. */
export function requestCrash(s: LabState, when: CrashWhen): void {
  // 'sms' needs a gateway that takes a moment; any other crash gets the healthy gateway back
  setSmsGateway(s, when === 'sms' ? 'slow' : 'ok')
  if (runCrash(s, when)) return
  if (s.pending === null) publishBatch(s, 1)
  s.pending = when
}

export function runCrash(s: LabState, when: CrashWhen): boolean {
  const target = when === 'sms' ? smsTarget(s) : crashTarget(s)
  if (!target) return false
  const r = crashConsumer(s, target.id, when === 'after' ? 'after-effect' : 'before-effect')
  if (!r) return false
  if (when === 'sms') setSmsGateway(s, 'ok')
  s.exps.push({
    id: s.expId++,
    orderId: target.orderId,
    broker: s.config.broker,
    ack: s.config.ackMode,
    when,
    idempotent: s.config.idempotent,
    smsGuard: s.config.smsGuard,
    startedAt: s.t,
    result: null,
    cooked: 0,
    deduped: 0,
    sms: 0,
  })
  if (s.exps.length > 12) s.exps.shift()
  return true
}

/** Is an experiment for this cell still waiting for its outcome? */
export function cellPending(s: LabState, ack: AckMode, when: CrashWhen): boolean {
  return s.exps.some((e) => e.result === null && e.ack === ack && e.when === when)
}

/** The newest settled experiment for one cell of the ack matrix (any broker unless given). */
export function cell(s: LabState, ack: AckMode, when: CrashWhen, broker?: Broker): Experiment | null {
  for (let i = s.exps.length - 1; i >= 0; i--) {
    const e = s.exps[i]
    if (e.result !== null && e.ack === ack && e.when === when && (broker === undefined || e.broker === broker)) return e
  }
  return null
}
