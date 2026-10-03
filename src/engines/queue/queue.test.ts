/// <reference types="node" />
/** Behaviour, actions, edge cases and invariants of E2 „Red”. Run: node --test src/engines/queue/*.test.ts */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRng } from '../../kit/sim/math.ts'
import {
  BROKER_FACTS,
  COMPRESSED_DAY_PROFILE,
  DEFAULT_CONFIG,
  PRESETS,
  RESTART_CRASHLOOP,
  ackTimeoutInfo,
  consumerViews,
  crashAllConsumers,
  crashConsumer,
  createPresetSim,
  createQueueSim,
  delayedView,
  finished,
  flightsView,
  inflightView,
  little,
  metrics,
  publishBatch,
  publishPoison,
  rateAt,
  readyView,
  resetLittle,
  restartConsumerNow,
  runFor,
  runPreset,
  scalerView,
  setAckTimeout,
  setConfig,
  setConsumerFault,
  setConsumers,
  setSmsGateway,
  setStopAt,
  startBurst,
  step,
  stepWithScript,
  theory,
  type Message,
  type PresetId,
  type QueueConfigPatch,
  type QueueState,
} from './index.ts'

const sim = (cfg: QueueConfigPatch = {}) => createQueueSim({ seed: 42, ...cfg })
/** One message at a time, deterministic 1 s jobs, no producer. */
const quiet = (cfg: QueueConfigPatch = {}) => sim({ rate: 0, serviceDist: 'fixed', ...cfg })
const between = (v: number, lo: number, hi: number, msg: string) => assert.ok(v >= lo && v <= hi, `${msg}: ${v} ∉ [${lo}, ${hi}]`)
const hasEvent = (s: QueueState, re: RegExp) => s.events.some((e) => re.test(e.text))

/** Conservation and structural invariants – must hold after every tick. */
function checkInvariants(s: QueueState, prefetchCap = s.config.prefetch): void {
  const t = s.totals
  let autoHeld = 0
  let requests = 0
  for (const c of s.consumers) {
    // lowering prefetch at runtime does not revoke deliveries already held, hence the cap parameter
    assert.ok(c.buffer.length + (c.job ? 1 : 0) <= prefetchCap || c.status === 'stopping', `prefetch bound, consumer ${c.id}`)
    autoHeld += c.buffer.filter((d) => d.autoAcked).length + (c.job?.delivery?.autoAcked ? 1 : 0)
    if (c.job?.request) requests++
    if (c.status === 'crashed') assert.equal(c.job, null)
  }
  const msgsInSystem = s.ready.size + s.delayed.length + s.unacked.size + autoHeld
  assert.equal(t.published, t.completed - t.directOk + t.dlq + t.dropped + t.lostAutoAck + msgsInSystem, 'every published message is accounted for')
  assert.equal(s.little.inSystem, msgsInSystem + requests, 'Little in-system count')
  assert.equal(t.dlq, t.dlqDeliveryLimit + t.dlqMaxLength, 'DLQ split')
  const ids = new Set<number>()
  const seen = (m: Message) => {
    assert.ok(m.deliveryCount <= m.receiveCount, 'delivery-count counts failed deliveries only')
    assert.ok(!ids.has(m.id), 'no message in two places')
    ids.add(m.id)
  }
  s.ready.forEach((m: Message) => {
    assert.equal(m.status, 'ready')
    seen(m)
  })
  for (const m of s.delayed) {
    assert.equal(m.status, 'delayed')
    seen(m)
  }
  for (const d of s.unacked.values()) {
    assert.equal(d.stale, false)
    assert.equal(d.msg.status, 'inflight')
    seen(d.msg)
  }
  assert.ok(t.orders >= t.ordersAccepted + t.ordersFailed)
  assert.ok(s.events.length <= 50)
  assert.ok(s.flights.length <= 200)
  const keys = s.events.map((e) => `${e.t}-${e.text}`)
  assert.equal(new Set(keys).size, keys.length, 'EventLog keys `${t}-${text}` are unique')
  const m = metrics(s)
  for (const [k, v] of Object.entries(m)) if (typeof v === 'number') assert.ok(Number.isFinite(v), `metrics.${k} = ${v}`)
  for (const [k, v] of Object.entries(t)) assert.ok(Number.isInteger(v) && v >= 0, `totals.${k} = ${v}`)
  for (const v of consumerViews(s)) assert.ok(Number.isFinite(v.waitS) && v.progress >= 0 && v.progress <= 1)
}

/* ------------------------------------------------------------------ shape and stepping */

test('defaults follow sim-models SIM 2 (λ 2, k 4, Exp 1 s, 5 deliveries, full jitter 0,5 s / 30 s, manual ack)', () => {
  const c = DEFAULT_CONFIG
  assert.equal(c.rate, 2)
  assert.equal(c.consumers, 4)
  assert.equal(c.serviceMeanS, 1)
  assert.equal(c.serviceDist, 'exp')
  assert.equal(c.maxDeliveries, 5)
  assert.equal(c.backoffBaseS, 0.5)
  assert.equal(c.backoffCapS, 30)
  assert.equal(c.ackMode, 'manual')
  assert.equal(c.retryMode, 'backoff')
  assert.equal(c.maxQueue, Infinity)
  assert.equal(c.overflow, 'drop-head') // RabbitMQ default
  assert.equal(c.idempotent, false)
  assert.equal(c.smsOnFailure, 'retry-sms')
  assert.equal(c.visibilityTimeoutS, 30)
  assert.equal(c.consumerTimeoutS, 60)
  assert.equal(BROKER_FACTS.rabbitQuorumDeliveryLimit, 20)
  assert.equal(BROKER_FACTS.rabbitNackCountsTowardLimit, false)
  const s = sim()
  assert.equal(s.consumers.length, 4)
  assert.equal(ackTimeoutInfo(s).simS, 60)
  assert.equal(ackTimeoutInfo(s).label, '60 s (sim) · stvarno: 30 min')
  setConfig(s, { broker: 'sqs' })
  assert.equal(ackTimeoutInfo(s).simS, 30)
  assert.equal(ackTimeoutInfo(s).label, '30 s')
})

test('step(state, 1/60) plugs into useSimulation: fixed 10 ms ticks via an accumulator; bad dt is ignored', () => {
  const a = sim()
  for (let i = 0; i < 600; i++) step(a, 1 / 60)
  assert.equal(a.tick, 1000)
  const b = sim()
  runFor(b, 10)
  assert.deepEqual(a.totals, b.totals, 'frame stepping = headless run')
  for (const bad of [NaN, -1, 0, Infinity]) step(a, bad)
  assert.equal(a.tick, 1000)
  step(a, 1e9) // capped catch-up, no freeze
  assert.ok(a.tick <= 1000 + 200_000)
  assert.equal(a.acc, 0)
})

test('stepWithScript has the same 2000 s cap as step(): no backlog left in the accumulator (review)', () => {
  const p = PRESETS['l06-rabbit-crash-after']
  const w = createQueueSim(p.config)
  stepWithScript(w, 5000, p.script)
  assert.equal(w.tick, 200_000)
  assert.equal(w.acc, 0)
  stepWithScript(w, 1 / 60, p.script)
  assert.ok(w.tick <= 200_002, `one frame later t = ${w.t}`)
})

test('setStopAt / createPresetSim stop exactly at the card run length; finished() tells the UI (review)', () => {
  const s = createPresetSim('l06-cevap-petak-direct')
  for (let i = 0; i < 151 * 15; i++) stepWithScript(s, (1 / 60) * 4, undefined)
  assert.equal(s.tick, 15000)
  assert.equal(finished(s), true)
  const h = runPreset('l06-cevap-petak-direct')
  assert.deepEqual(s.totals, h.totals, 'live stepping at 4× = the headless card numbers')
  step(s, 1)
  runFor(s, 1)
  assert.equal(s.tick, 15000, 'no drift after the stop')
  setStopAt(s, null)
  step(s, 0.5)
  assert.equal(s.tick, 15050)
  assert.equal(finished(createQueueSim()), false)
})

test('determinism: same seed + same actions ⇒ identical run; another seed differs', () => {
  const scripted = (seed: number) => {
    const s = createQueueSim({ seed, pFail: 0.1, pPoison: 0.02, broker: 'sqs', prefetch: 2, visibilityTimeoutS: 4 })
    runFor(s, 20)
    crashConsumer(s)
    runFor(s, 5)
    crashConsumer(s, undefined, 'after-effect')
    startBurst(s)
    runFor(s, 30)
    publishPoison(s)
    setSmsGateway(s, 'down', 5)
    runFor(s, 30)
    return JSON.stringify({ totals: s.totals, events: s.events.map((e) => [e.t, e.text]), ready: readyView(s).map((m) => m.id) })
  }
  assert.equal(scripted(7), scripted(7))
  assert.notEqual(scripted(7), scripted(8))
})

test('arrivals are an independent stream: direct vs queue (or any feature toggle) see the same orders', () => {
  const a = sim({ mode: 'direct' })
  const b = sim({ pFail: 0.3, idempotent: true, broker: 'sqs', prefetch: 3, users: 7 })
  runFor(a, 200)
  runFor(b, 200)
  assert.equal(a.totals.orders, b.totals.orders)
})

test('profiles: steady, burst window, piecewise curve with repeat, manual burst', () => {
  const s = sim({ profile: { kind: 'burst', startS: 30, durationS: 10, rate: 15 } })
  assert.equal(rateAt(s, 29.99), 2)
  assert.equal(rateAt(s, 30), 15)
  assert.equal(rateAt(s, 39.99), 15)
  assert.equal(rateAt(s, 40), 2)
  const c = sim({ profile: COMPRESSED_DAY_PROFILE })
  assert.equal(rateAt(c, 10), 0)
  assert.equal(rateAt(c, 115), 6)
  assert.equal(rateAt(c, 90), 3.25)
  assert.equal(rateAt(c, 415), 6, 'repeats every 300 s')
  const m = sim()
  runFor(m, 5)
  assert.equal(startBurst(m, { rate: 15, durationS: 10 }), true)
  assert.equal(rateAt(m, 5), 15)
  assert.equal(rateAt(m, 15), 2)
  assert.ok(hasEvent(m, /Nalet: 15 narudžbi\/s tijekom 10 s/))
  const u = sim({ arrivals: 'uniform', rate: 4, consumers: 0 })
  runFor(u, 10)
  assert.equal(u.totals.orders, 40, 'uniform arrivals: exactly λ·t')
})

/* ------------------------------------------------------------------ redelivery semantics: RabbitMQ vs SQS */

test('RabbitMQ: crash before the effect → unacked delivery requeued immediately at the head (redelivered, delivery-count 1), no duplicate', () => {
  const s = quiet({ consumers: 1 })
  publishBatch(s, 3)
  runFor(s, 0.5)
  const m1 = s.consumers[0].job?.delivery?.msg as Message
  assert.equal(m1.orderId, 1)
  assert.deepEqual(crashConsumer(s), { id: 1, when: 'before-effect', phase: 'work', committed: false, armed: false })
  assert.equal(s.ready.peek(), m1, 'back at the head of the queue')
  assert.equal(m1.redelivered, true)
  assert.equal(m1.receiveCount, 1)
  assert.equal(m1.deliveryCount, 1, 'connection loss counts toward the quorum delivery limit')
  assert.equal(s.totals.redeliveries, 1)
  assert.ok(hasEvent(s, /RabbitMQ: veza zatvorena, nepotvrđene poruke \(1\) odmah se vraćaju u red/))
  assert.ok(hasEvent(s, /pao prije kuhanja/))
  assert.equal(consumerViews(s)[0].status, 'crashed')
  runFor(s, 2.01) // restart 2 s after the crash
  assert.equal(s.consumers[0].status, 'running')
  assert.equal(s.consumers[0].restartCount, 1)
  assert.equal(s.consumers[0].job?.orderId, 1, 'the redelivered order is processed first')
  runFor(s, 5)
  assert.equal(s.totals.completed, 3)
  assert.equal(s.totals.duplicates, 0)
  assert.equal(metrics(s).lost, 0)
})

test('SQS: crash before the effect → the message stays invisible until the visibility timeout, then reappears', () => {
  const s = quiet({ consumers: 1, broker: 'sqs', visibilityTimeoutS: 5 })
  publishBatch(s, 3)
  runFor(s, 0.5)
  const m1 = s.consumers[0].job?.delivery?.msg as Message
  crashConsumer(s)
  assert.equal(m1.status, 'inflight')
  assert.equal(s.ready.size, 2)
  const orphan = inflightView(s)[0]
  assert.equal(orphan.orphan, true)
  between(orphan.remainingS, 4.4, 4.6, 'remaining visibility')
  assert.ok(hasEvent(s, /SQS: narudžba #1 ostaje nevidljiva do isteka roka/))
  runFor(s, 4.4) // t = 4.9
  assert.equal(m1.status, 'inflight')
  runFor(s, 0.2) // t = 5.1
  assert.ok(m1.redelivered)
  assert.ok(hasEvent(s, /SQS: istekao rok vidljivosti – narudžba #1/))
  runFor(s, 5)
  assert.equal(s.totals.completed, 3)
  assert.equal(s.totals.duplicates, 0)
})

test('crash after cooking, before the ack → duplicate; idempotency stamps „već skuhano”, the SMS still goes twice', () => {
  const run = (cfg: QueueConfigPatch) => {
    const s = quiet({ consumers: 1, ...cfg })
    publishBatch(s, 1)
    runFor(s, 0.2)
    const r = crashConsumer(s, undefined, 'after-effect')
    assert.equal(r?.id, 1)
    assert.equal(r?.armed, true)
    runFor(s, 1)
    assert.ok(hasEvent(s, /pao nakon kuhanja, prije potvrde/))
    runFor(s, cfg.broker === 'sqs' ? 40 : 5)
    assert.equal(s.totals.completed, 1)
    return s.totals
  }
  const plain = run({})
  assert.equal(plain.duplicates, 1)
  assert.equal(plain.smsDuplicates, 1)
  const idem = run({ idempotent: true })
  assert.equal(idem.duplicates, 0)
  assert.equal(idem.alreadyCooked, 1)
  assert.equal(idem.smsDuplicates, 1, 'the SMS is outside the DB transaction')
  const key = run({ idempotent: true, smsGuard: 'provider-key' })
  assert.equal(key.smsDuplicates, 0)
  assert.equal(key.smsDeduped, 1)
  const rec = run({ idempotent: true, smsGuard: 'record-first' })
  assert.equal(rec.smsDuplicates, 0)
  const sqs = run({ broker: 'sqs' })
  assert.equal(sqs.duplicates, 1, 'SQS redelivers after the visibility timeout')
})

test('„Sruši prije kuhanja” never picks a consumer that already cooked; null when nobody is cooking or idle (review)', () => {
  // seed 5, slow SMS: consumers spend most of their time in the SMS phase (reviewer: 16/40 presses duplicated)
  let dupAfter = 0
  let nulls = 0
  const s = createQueueSim({ seed: 5, rate: 1 })
  setSmsGateway(s, 'slow')
  runFor(s, 20)
  for (let i = 0; i < 40; i++) {
    const before = s.totals.duplicates
    const r = crashConsumer(s)
    if (r === null) nulls++
    else {
      assert.equal(r.committed, false)
      assert.notEqual(r.phase, 'sms')
    }
    runFor(s, 10)
    if (s.totals.duplicates > before) dupAfter++
  }
  assert.equal(dupAfter, 0)
  assert.ok(nulls > 0 && nulls < 40, `nulls ${nulls}`)
  // explicit id in the SMS phase: crashes and reports that the effect had committed
  const x = quiet({ consumers: 1, smsGateway: 'slow' })
  publishBatch(x, 1)
  runFor(x, 1.5)
  assert.equal(consumerViews(x)[0].phase, 'sms')
  assert.equal(consumerViews(x)[0].committed, true)
  assert.equal(crashConsumer(x), null, 'no consumer still cooking, none idle')
  const r = crashConsumer(x, 1)
  assert.equal(r?.committed, true)
  assert.equal(r?.phase, 'sms')
  assert.ok(hasEvent(x, /pao nakon kuhanja, prije potvrde/))
})

test('the armed „after cooking” crash fires even while the SMS gateway is down (review)', () => {
  for (const smsOnFailure of ['retry-sms', 'nack-message'] as const) {
    const s = quiet({ consumers: 1, smsOnFailure })
    setSmsGateway(s, 'down')
    publishBatch(s, 1)
    runFor(s, 0.2)
    crashConsumer(s, undefined, 'after-effect')
    runFor(s, 7)
    assert.equal(s.totals.crashes, 1, smsOnFailure)
    assert.equal(s.consumers[0].crashArmed, false)
  }
})

test('„record then send”: with a naive handler (nack-message) a failed SMS is lost; the retry relay (outbox) sends it later', () => {
  const s = quiet({ consumers: 1, smsGuard: 'record-first', idempotent: true, smsOnFailure: 'nack-message' })
  setSmsGateway(s, 'down')
  publishBatch(s, 1)
  runFor(s, 7)
  setSmsGateway(s, 'ok')
  runFor(s, 10)
  assert.equal(s.totals.completed, 1)
  assert.equal(s.totals.smsLost, 1)
  assert.equal(s.totals.smsSent, 0)
  const n = quiet({ consumers: 1, idempotent: true, smsOnFailure: 'nack-message' }) // send-then-record: retried until sent
  setSmsGateway(n, 'down')
  publishBatch(n, 1)
  runFor(n, 7)
  setSmsGateway(n, 'ok')
  runFor(n, 10)
  assert.equal(n.totals.smsSent, 1)
  assert.equal(n.totals.smsLost, 0)
  const o = quiet({ consumers: 1, smsGuard: 'record-first' }) // record + relay = outbox: neither lost nor duplicated
  setSmsGateway(o, 'down', 20)
  publishBatch(o, 1)
  runFor(o, 7)
  assert.equal(o.totals.completed, 1, 'the order is acked; only the SMS waits')
  assert.equal(o.totals.smsDeferred, 1)
  assert.equal(metrics(o).smsPending, 1)
  runFor(o, 80)
  assert.equal(o.totals.smsSent, 1)
  assert.equal(o.totals.smsResent, 1)
  assert.equal(o.totals.smsLost, 0)
  assert.equal(o.smsOutbox.length, 0)
})

test('auto-ack (at-most-once): a crash or a failure loses the message; manual ack does not', () => {
  const s = quiet({ consumers: 1, ackMode: 'auto' })
  publishBatch(s, 1)
  runFor(s, 0.5)
  assert.equal(s.unacked.size, 0, 'the broker forgot it at delivery')
  crashConsumer(s)
  assert.equal(s.totals.lostAutoAck, 1)
  assert.equal(metrics(s).lost, 1)
  runFor(s, 5)
  assert.equal(s.totals.effects, 0)
  assert.equal(s.ready.size, 0)
  const p = quiet({ consumers: 1, ackMode: 'auto' })
  publishPoison(p)
  runFor(p, 3)
  assert.equal(p.totals.lostAutoAck, 1)
  assert.equal(p.totals.dlq, 0)
  const m = quiet({ consumers: 1 })
  publishBatch(m, 1)
  runFor(m, 0.5)
  crashConsumer(m)
  runFor(m, 5)
  assert.equal(metrics(m).lost, 0)
  assert.equal(m.totals.completed, 1)
})

test('ack deadlines keep running after a switch to auto-ack: an SQS orphan still reappears (review)', () => {
  const s = createQueueSim({ seed: 3, rate: 0, broker: 'sqs', consumers: 1 })
  publishBatch(s, 1)
  runFor(s, 0.05)
  crashConsumer(s)
  setConfig(s, { ackMode: 'auto' })
  runFor(s, 60)
  assert.equal(s.unacked.size, 0)
  assert.equal(s.totals.completed, 1)
  assert.equal(s.little.inSystem, 0)
  assert.equal(inflightView(s).length, 0)
})

test('RabbitMQ 4.3 consumer_timeout: the consumer is cancelled, the message requeued (not counted), the late ack has no effect', () => {
  const s = quiet({ consumers: 2, consumerTimeoutS: 10 })
  setConsumerFault(s, 1, 'slow')
  publishBatch(s, 1)
  runFor(s, 10.1)
  assert.equal(s.totals.consumerTimeouts, 1)
  assert.ok(hasEvent(s, /consumer_timeout\) – potrošač otkazan, poruke se vraćaju u red/))
  assert.equal(consumerViews(s)[0].stale, true)
  assert.equal(consumerViews(s)[0].status, 'cancelled')
  runFor(s, 1.5)
  assert.equal(s.totals.completed, 1, 'consumer 2 finished the requeued copy')
  runFor(s, 31)
  assert.equal(s.totals.duplicates, 1, 'the slow consumer still cooked it')
  assert.equal(s.totals.staleAcks, 1)
  assert.ok(hasEvent(s, /RabbitMQ: potvrda za narudžbu #1 bez učinka – poruka je već vraćena u red/))
  assert.equal(consumerViews(s)[0].status, 'idle', 're-subscribed after the job')
  // the real default (30 min, sim 60 s) tolerates a 41 s job
  const d = quiet({ consumers: 2 })
  setConsumerFault(d, 1, 'slow')
  publishBatch(d, 1)
  runFor(d, 50)
  assert.equal(d.totals.consumerTimeouts, 0)
  assert.equal(d.totals.duplicates, 0)
  assert.equal(d.totals.completed, 1)
})

test('RabbitMQ 4.3: consumer timeouts never dead-letter a message (delivery-count stays 0) – reviewer case DLQ at 91 s is gone', () => {
  const s = createQueueSim({ seed: 1, rate: 0, broker: 'rabbitmq', consumerTimeoutS: 10, consumers: 2, consumerFault: 'slow' })
  publishBatch(s, 1)
  runFor(s, 400)
  assert.ok(s.totals.consumerTimeouts >= 10)
  assert.equal(s.totals.dlq, 0)
  const msg = [...s.unacked.values()][0]?.msg ?? s.ready.peek()
  assert.ok(msg)
  assert.equal(msg.deliveryCount, 0)
  assert.ok(msg.receiveCount >= 10, 'x-acquired-count keeps rising')
  // SQS counts every receive: the same slow consumers do reach the DLQ
  const q = createQueueSim({ seed: 1, rate: 0, broker: 'sqs', visibilityTimeoutS: 10, consumers: 2, consumerFault: 'slow' })
  publishBatch(q, 1)
  runFor(q, 400)
  assert.equal(q.totals.dlq, 1)
  assert.equal(q.dlqRecent[0].receiveCount, 5)
})

test('SQS: a consumer slower than the visibility timeout causes a duplicate; a late delete still works if nobody re-received it', () => {
  const s = quiet({ consumers: 2, broker: 'sqs' })
  setConsumerFault(s, 1, 'slow')
  publishBatch(s, 1)
  runFor(s, 45)
  assert.equal(s.totals.visibilityExpired, 1)
  assert.equal(s.totals.duplicates, 1)
  assert.equal(s.totals.completed, 1)
  assert.ok(hasEvent(s, /zakašnjelo brisanje bez učinka/))
  const one = quiet({ consumers: 1, broker: 'sqs' })
  setConsumerFault(one, 1, 'slow')
  publishBatch(one, 1)
  runFor(one, 45)
  assert.equal(one.totals.visibilityExpired, 1)
  assert.equal(one.totals.duplicates, 0)
  assert.equal(one.totals.completed, 1)
  assert.equal(one.ready.size, 0)
  assert.ok(hasEvent(one, /zakašnjelo brisanje uspjelo/))
})

test('switching SQS → RabbitMQ requeues orphaned deliveries at once', () => {
  const s = quiet({ consumers: 1, broker: 'sqs' })
  publishBatch(s, 1)
  runFor(s, 0.3)
  crashConsumer(s)
  assert.equal(s.ready.size, 0)
  setConfig(s, { broker: 'rabbitmq' })
  assert.equal(s.ready.size, 1)
  assert.equal(s.unacked.size, 0)
  assert.ok(hasEvent(s, /Posrednik: RabbitMQ/))
})

test('each broker keeps its own ack deadline: an SQS visibility of 2 s does not become RabbitMQ consumer_timeout (review)', () => {
  const s = sim({ broker: 'sqs' })
  setAckTimeout(s, 2)
  assert.equal(s.config.visibilityTimeoutS, 2)
  assert.equal(ackTimeoutInfo(s).label, '2 s · zadano: 30 s')
  assert.equal(ackTimeoutInfo(s).compressed, false)
  setConfig(s, { broker: 'rabbitmq' })
  assert.equal(ackTimeoutInfo(s).simS, 60)
  assert.equal(ackTimeoutInfo(s).label, '60 s (sim) · stvarno: 30 min')
  runFor(s, 300)
  assert.equal(s.totals.consumerTimeouts, 0)
  assert.equal(s.totals.duplicates, 0)
  setAckTimeout(s, 10)
  const info = ackTimeoutInfo(s)
  // review: only consumer_timeout is compressed (jobs run 1:1), so a changed value has no proportional real equivalent
  assert.equal(info.realEquivalentS, null)
  assert.equal(info.label, '10 s (sim) · skraćeno; stvarno zadano: 30 min')
  setConfig(s, { broker: 'sqs' })
  assert.equal(ackTimeoutInfo(s).simS, 2, 'switching back restores the SQS value')
})

/* ------------------------------------------------------------------ retries, DLQ, poison */

test('poison message: full-jitter backoff between attempts, DLQ after exactly maxDeliveries', () => {
  const s = sim({ rate: 0, consumers: 1 })
  publishPoison(s)
  const seen = new Set<string>()
  for (let i = 0; i < 12000 && s.totals.dlq === 0; i++) {
    runFor(s, 0.01)
    for (const m of s.delayed) {
      const key = `${m.deliveryCount}`
      if (seen.has(key)) continue
      seen.add(key)
      const delay = m.visibleAt - m.delayedAt
      assert.ok(delay >= 0 && delay < Math.min(30, 0.5 * 2 ** m.deliveryCount), `delay ${delay} after attempt ${m.deliveryCount}`)
    }
  }
  assert.equal(s.totals.dlq, 1)
  assert.equal(s.totals.dlqDeliveryLimit, 1)
  assert.equal(s.totals.retries, 4)
  assert.equal(s.totals.failedAttempts, 5)
  assert.equal(s.dlqRecent[0].receiveCount, 5)
  assert.equal(s.dlqRecent[0].deliveryCount, 5)
  assert.equal(s.dlqRecent[0].reason, 'max-deliveries')
  assert.ok(hasEvent(s, /premještena u DLQ nakon 5 neuspjelih isporuka \(delivery-limit 4\)$/))
  assert.ok(hasEvent(s, /nije obrađena \(otrovna poruka; pokušaj 1\/5\)/), 'the retry line names the cause')
  assert.deepEqual([...seen].sort(), ['1', '2', '3', '4'])
})

test('RabbitMQ basic.reject (retryMode immediate) counts: the poison message burns through the quorum default delivery-limit 20 = 21 deliveries (review: count > limit)', () => {
  assert.equal(BROKER_FACTS.rabbitQuorumDefaultDeliveries, BROKER_FACTS.rabbitQuorumDeliveryLimit + 1)
  const s = quiet({ consumers: 1, retryMode: 'immediate', maxDeliveries: BROKER_FACTS.rabbitQuorumDefaultDeliveries })
  publishPoison(s)
  runFor(s, 30)
  assert.equal(s.totals.failedAttempts, 21)
  assert.equal(s.totals.dlq, 1)
  // a real quorum queue dead-letters when x-delivery-count (21) EXCEEDS delivery-limit (20)
  assert.equal(s.dlqRecent[0].deliveryCount, 21)
  assert.ok(s.dlqRecent[0].deliveryCount > BROKER_FACTS.rabbitQuorumDeliveryLimit)
  assert.ok(hasEvent(s, /nakon 21 neuspjele isporuke \(delivery-limit 20\)$/))
  assert.equal(s.delayed.length, 0)
})

test('RabbitMQ 4.3 basic.nack (requeue) is not counted: a poison message loops forever, never reaching the DLQ (review)', () => {
  const s = quiet({ consumers: 1, retryMode: 'nack-requeue', maxDeliveries: 20 })
  publishPoison(s)
  runFor(s, 60)
  assert.equal(s.totals.dlq, 0)
  assert.ok(s.totals.failedAttempts >= 55)
  assert.ok(hasEvent(s, /basic\.nack se ne broji u delivery-limit/))
  const msg = s.consumers[0].job?.delivery?.msg ?? s.ready.peek()
  assert.equal(msg?.deliveryCount, 0)
  // the same handler on SQS (visibility 0) still counts every receive
  const q = quiet({ consumers: 1, retryMode: 'nack-requeue', broker: 'sqs' })
  publishPoison(q)
  runFor(q, 10)
  assert.equal(q.totals.dlq, 1)
  const p = runPreset('l06-rabbit-nack-loop')
  assert.equal(p.totals.dlq, 0)
})

test('no DLQ configured → messages over the limit are dropped (lost)', () => {
  const s = quiet({ consumers: 1, retryMode: 'immediate', dlqEnabled: false })
  publishPoison(s)
  runFor(s, 10)
  assert.equal(s.totals.dlq, 0)
  assert.equal(s.totals.dropped, 1)
  assert.equal(metrics(s).lost, 1)
  assert.ok(hasEvent(s, /odbačena nakon 5 neuspjelih isporuka \(delivery-limit 4\) – nema DLQ-a/))
})

test('Croatian plural after „nakon”: 1 neuspjele isporuke · 3 neuspjele isporuke · 5 neuspjelih isporuka; SQS: isporuke / isporuka (review)', () => {
  for (const [n, word] of [
    [1, 'neuspjele isporuke'],
    [3, 'neuspjele isporuke'],
    [5, 'neuspjelih isporuka'],
  ] as const) {
    const s = quiet({ consumers: 1, retryMode: 'immediate', maxDeliveries: n })
    publishPoison(s)
    runFor(s, n + 2)
    assert.ok(hasEvent(s, new RegExp(`DLQ nakon ${n} ${word} \\(delivery-limit ${n - 1}\\)$`)), `n = ${n}`)
  }
  for (const [n, word] of [
    [1, 'isporuke'],
    [3, 'isporuke'],
    [5, 'isporuka'],
  ] as const) {
    const s = quiet({ consumers: 1, retryMode: 'immediate', maxDeliveries: n, broker: 'sqs' })
    publishPoison(s)
    runFor(s, n + 2)
    assert.ok(hasEvent(s, new RegExp(`DLQ nakon ${n} ${word} \\(maxReceiveCount ${n}\\)$`)), `SQS n = ${n}`)
  }
})

test('transient failures retry and succeed; one consumer + redelivery already breaks ordering', () => {
  const s = sim({ consumers: 1, rate: 0.5, pFail: 0.3 })
  runFor(s, 300)
  assert.ok(s.totals.retries > 10)
  assert.equal(metrics(s).lost, 0)
  assert.ok(s.totals.outOfOrder > 0)
  assert.ok(s.kitchen.some((k) => k.kind === 'cooked') && s.kitchen.every((k) => typeof k.outOfOrder === 'boolean'))
})

/* ------------------------------------------------------------------ ordering, overflow, prefetch, scaling down */

test('ordering: one consumer keeps FIFO, several consumers do not („redoslijed nije zajamčen”)', () => {
  const one = sim({ consumers: 1, rate: 0.6 })
  runFor(one, 300)
  assert.equal(one.totals.outOfOrder, 0)
  assert.ok(one.kitchen.every((k) => !k.outOfOrder))
  const four = sim()
  runFor(four, 300)
  assert.ok(metrics(four).outOfOrderRatio > 0.2)
})

test('RabbitMQ max-length 50: reject-publish refuses new orders; drop-head dead-letters the oldest (counted apart); SQS has no max-length', () => {
  const r = quiet({ consumers: 0, maxQueue: 50, overflow: 'reject-publish' })
  publishBatch(r, 100)
  assert.equal(r.totals.published, 50)
  assert.equal(r.totals.rejectedPublish, 50)
  assert.equal(r.totals.ordersFailed, 50)
  assert.equal(r.ready.size, 50)
  const d = quiet({ consumers: 0, maxQueue: 50 })
  publishBatch(d, 100)
  assert.equal(d.totals.published, 100)
  assert.equal(d.totals.droppedHead, 50)
  assert.equal(d.totals.dlq, 50)
  assert.equal(d.totals.dlqMaxLength, 50, 'overflow, not poison')
  assert.equal(d.totals.dlqDeliveryLimit, 0)
  assert.equal(d.ready.peek()?.orderId, 51)
  assert.equal(d.dlqRecent.at(-1)?.reason, 'max-length')
  const nd = quiet({ consumers: 0, maxQueue: 50, dlqEnabled: false })
  publishBatch(nd, 100)
  assert.equal(nd.totals.dropped, 50)
  assert.equal(metrics(nd).lost, 50)
  const q = quiet({ consumers: 0, maxQueue: 50, broker: 'sqs' })
  publishBatch(q, 100)
  assert.equal(q.ready.size, 100)
  checkInvariants(r)
  checkInvariants(d)
  checkInvariants(nd)
})

test('prefetch: each consumer holds ≤ prefetch deliveries; a RabbitMQ crash requeues all of them in order', () => {
  const s = quiet({ consumers: 2, prefetch: 5 })
  publishBatch(s, 20)
  runFor(s, 0.01)
  assert.deepEqual(
    s.consumers.map((c) => c.buffer.length + (c.job ? 1 : 0)),
    [5, 5],
  )
  assert.equal(s.ready.size, 10)
  assert.equal(inflightView(s).length, 10)
  assert.deepEqual(consumerViews(s)[0].bufferedMsgIds, s.consumers[0].buffer.map((d) => d.msg.id))
  const held = [s.consumers[0].job?.orderId, ...s.consumers[0].buffer.map((d) => d.msg.orderId)]
  crashConsumer(s, 1)
  assert.deepEqual(
    readyView(s, 5).map((m) => m.orderId),
    held,
  )
  checkInvariants(s)
})

test('SQS + large prefetch: buffered messages age past the visibility timeout → duplicates', () => {
  const s = quiet({ consumers: 1, prefetch: 10, broker: 'sqs', visibilityTimeoutS: 3 })
  publishBatch(s, 10)
  runFor(s, 30)
  assert.ok(s.totals.visibilityExpired > 0)
  assert.ok(s.totals.duplicates > 0)
})

test('graceful scale-down: stopping consumers finish their job, return buffered work (not counted), then disappear', () => {
  const s = quiet({ consumers: 4, prefetch: 3 })
  publishBatch(s, 12)
  runFor(s, 0.01)
  setConsumers(s, 2)
  assert.equal(consumerViews(s).filter((c) => c.status === 'stopping').length, 2)
  assert.ok(hasEvent(s, /Broj potrošača: 4 → 2/))
  assert.equal(s.totals.redeliveries, 4, 'two buffered deliveries per stopping consumer go back')
  s.ready.forEach((m) => assert.equal(m.deliveryCount, 0, 'a graceful return does not use up delivery attempts'))
  checkInvariants(s)
  runFor(s, 1.01)
  assert.equal(s.consumers.length, 2)
  runFor(s, 10)
  assert.equal(s.totals.completed, 12)
  assert.equal(s.totals.duplicates, 0)
})

/* ------------------------------------------------------------------ direct calls vs queue, SMS gateway, clients */

test('SMS gateway down: direct calls fail (500 / 503); the queue keeps accepting, grows, drains – no re-cooking by default (review)', () => {
  const d = sim({ mode: 'direct' })
  setSmsGateway(d, 'down')
  assert.ok(hasEvent(d, /SMS-gateway pao/))
  runFor(d, 60)
  // every request now holds an API worker 1 s + 5 s SMS timeout: a few get 500, most get 503
  assert.ok(d.totals.failed5xx > 20)
  assert.ok(d.totals.ordersFailed > 80)
  assert.equal(d.totals.smsSent, 0)
  assert.ok(hasEvent(d, /503: svi radnici API-ja zauzeti \(nema čekaonice\)/))
  const mid = runPreset('l06-sms-down-queue', 50)
  assert.ok(mid.ready.size + mid.delayed.length > 20, 'depth climbs while the gateway is down')
  assert.equal(mid.totals.ordersAccepted, mid.totals.orders)
  const end = runPreset('l06-sms-down-queue')
  assert.equal(metrics(end).lost, 0)
  assert.equal(end.totals.duplicates, 0, 'the order is acked, only the SMS is retried')
  assert.equal(end.totals.smsDeferred, end.totals.smsResent)
  assert.ok(end.totals.smsDeferred > 10)
  assert.equal(end.totals.smsUnique, end.totals.effectsUnique, 'every cooked order got its SMS in the end')
  assert.ok(end.ready.size + end.delayed.length < 5)
  assert.ok(end.drain.last && end.drain.last.peak > 20)
  assert.ok(hasEvent(end, /SMS-gateway opet radi/))
  assert.equal(end.config.smsGateway, 'ok', 'config follows the timed recovery')
  // the reviewer's seeds with the README button (down 30 s at 20 s): 0 duplicates instead of 21–22
  for (const seed of [42, 1, 2, 3]) {
    const s = createQueueSim({ seed })
    runFor(s, 20)
    setSmsGateway(s, 'down', 30)
    runFor(s, 130)
    assert.equal(s.totals.duplicates, 0, `seed ${seed}`)
  }
})

test('smsOnFailure „nack-message” (naive handler): an SMS failure redelivers a cooked order → duplicates unless idempotent', () => {
  const nack = runPreset('l06-sms-down-nack')
  assert.equal(nack.totals.duplicates, 21)
  const idem = createQueueSim({ ...PRESETS['l06-sms-down-nack'].config, idempotent: true })
  runFor(idem, 20)
  setSmsGateway(idem, 'down', 30)
  runFor(idem, 130)
  assert.equal(idem.totals.duplicates, 0)
  assert.equal(idem.totals.alreadyCooked, 21)
})

test('timed SMS recovery keeps s.config in sync; choosing „down” again afterwards works (review)', () => {
  const s = createQueueSim({ seed: 1 })
  assert.equal(setSmsGateway(s, 'down', 5), true)
  runFor(s, 6)
  assert.equal(s.sms.state, 'ok')
  assert.equal(s.config.smsGateway, 'ok')
  setConfig(s, { smsGateway: 'down' })
  assert.equal(s.sms.state, 'down')
  assert.equal(s.sms.until, null)
})

test('slow SMS gateway: direct API workers are held 1 + 3 s → loss ≈ Erlang B(4, 8) ≈ 57 %; μ drops to 1/4', () => {
  const s = runPreset('l06-sms-slow-direct')
  between(s.totals.ordersFailed / s.totals.orders, 0.48, 0.66, 'loss')
  const th = theory(s)
  assert.equal(th.mu, 0.25)
  between(th.directLossErlangB, 0.57, 0.58, 'Erlang B')
})

test('client timeouts + retries on direct calls create ghost orders → duplicates, unless idempotent', () => {
  const cfg: QueueConfigPatch = { mode: 'direct', smsGateway: 'slow', clientTimeoutS: 2, clientRetries: 2, rate: 0.5 }
  const s = sim(cfg)
  runFor(s, 120)
  assert.ok(s.totals.clientTimeouts > 10)
  assert.ok(s.totals.clientRetries > 10)
  assert.ok(s.totals.duplicates > 5)
  assert.ok(hasEvent(s, /Klijent odustao nakon 2 s – radnik API-ja \d/), 'direct mode names the API worker (no „aPI proces”)')
  const i = sim({ ...cfg, idempotent: true })
  runFor(i, 120)
  assert.equal(i.totals.duplicates, 0)
  assert.ok(i.totals.alreadyCooked > 5)
  const r = sim({ mode: 'direct', consumers: 1, rate: 3, clientRetries: 3 })
  runFor(r, 60)
  assert.ok(r.totals.arrivals > r.totals.orders, 'retries add load (retry storm)')
})

test('switching „s redom” → „bez reda” mid-run: the leftover backlog still drains through idle API workers (review)', () => {
  const s = sim()
  publishBatch(s, 100)
  runFor(s, 5)
  assert.ok(s.ready.size > 80)
  setConfig(s, { mode: 'direct' })
  assert.ok(hasEvent(s, /Način: bez reda \(izravni pozivi\) – zaostale poruke iz reda \(\d+\) obradit će slobodni radnici/))
  runFor(s, 120)
  assert.equal(s.ready.size, 0)
  assert.ok(metrics(s).oldestAgeS < 5)
  assert.ok(s.totals.directOk > 100, 'new orders still take the synchronous path')
  checkInvariants(s)
})

/* ------------------------------------------------------------------ capacity, Little, edge cases */

test('λ > kμ: the backlog grows without bound at λ − kμ per second, and the log says so', () => {
  const s = sim({ rate: 5 })
  runFor(s, 300)
  between(s.ready.size, 180, 420, 'backlog after 300 s')
  const th = theory(s)
  assert.equal(th.growthPerS, 1)
  assert.equal(th.stable, false)
  assert.equal(th.mmc, null)
  assert.equal(th.drainTimeS, Infinity)
  assert.equal(th.rho, 1.25)
  assert.ok(hasEvent(s, /^Red raste: λ 5\/s > kμ 4\/s \(\+1 poruka\/s\)$/))
  checkInvariants(s)
})

test('Little panel: L = λ·W live, and again after resetLittle', () => {
  const s = sim({ rate: 3 })
  runFor(s, 1500)
  const a = little(s)
  assert.ok(Math.abs(a.L - a.lambdaW) / a.L < 0.01)
  resetLittle(s)
  assert.equal(little(s).elapsedS, 0)
  assert.equal(little(s).L, 0)
  runFor(s, 1500)
  const b = little(s)
  assert.ok(Math.abs(b.L - b.lambdaW) / b.L < 0.02)
  between(b.elapsedS, 1499.9, 1500.1, 'elapsed')
})

test('zero consumers: the queue only grows (narrated), direct calls all fail, selectors stay finite', () => {
  const q = sim({ consumers: 0 })
  runFor(q, 60)
  between(q.ready.size, 90, 150, 'backlog')
  const m = metrics(q)
  assert.equal(m.utilization, 0)
  assert.equal(m.p50, null)
  assert.equal(m.rateOut, 0)
  between(m.oldestReadyAgeS, 55, 60, 'oldest age')
  const th = theory(q)
  assert.equal(th.rho, Infinity)
  assert.equal(th.drainTimeS, Infinity)
  assert.equal(th.directLossErlangB, 1)
  assert.ok(hasEvent(q, /Nema aktivnih potrošača – poruke čekaju u redu/))
  assert.equal(q.events.filter((e) => e.kind === 'no-consumers').length, 1, 'once per episode')
  checkInvariants(q)
  const d = sim({ consumers: 0, mode: 'direct' })
  runFor(d, 30)
  assert.equal(d.totals.ordersFailed, d.totals.orders)
  const idle = sim({ consumers: 0, rate: 0 })
  runFor(idle, 5)
  const ti = theory(idle)
  assert.equal(ti.rho, 0)
  assert.equal(ti.drainTimeS, 0)
  assert.equal(metrics(idle).lostRatio, 0)
  checkInvariants(idle)
})

test('all consumers crash: nothing is consumed until they restart (fixed 2 s outside Kubernetes)', () => {
  const s = sim()
  runFor(s, 20)
  const done = s.totals.completed
  assert.equal(crashAllConsumers(s), 4)
  assert.equal(crashAllConsumers(s), 0, 'already down')
  runFor(s, 1.9)
  assert.equal(s.totals.completed, done)
  assert.ok(consumerViews(s).every((c) => c.status === 'crashed' && c.waitS > 0))
  runFor(s, 10)
  assert.ok(s.totals.completed > done)
  assert.equal(s.totals.duplicates, 0)
  checkInvariants(s)
})

test('restartConsumerNow repairs a crashed consumer on the next tick', () => {
  const s = quiet({ consumers: 1 })
  crashConsumer(s)
  assert.equal(restartConsumerNow(s, 1), true)
  assert.equal(restartConsumerNow(s, 99), false)
  runFor(s, 0.01)
  assert.equal(s.consumers[0].status, 'running')
})

test('Kubernetes CrashLoopBackOff (compressed ÷10): first restart at once, then 1, 2, 4, 8, 16, 30 s; RESTARTS counts restarts (review)', () => {
  const s = sim({ consumers: 1, rate: 5, consumerFault: 'oom', restart: RESTART_CRASHLOOP })
  const delays: number[] = []
  let crashes = 0
  for (let i = 0; i < 20000 && delays.length < 8; i++) {
    runFor(s, 0.01)
    const c = s.consumers[0]
    if (s.totals.crashes > crashes) {
      crashes = s.totals.crashes
      delays.push(Math.round((c.restartAt - (c.lastTermination?.at ?? 0)) * 100) / 100)
      assert.equal(c.lastTermination?.reason, 'OOMKilled')
      assert.equal(c.lastTermination?.exitCode, 137)
      assert.equal(c.restartCount, crashes - 1, 'RESTARTS rises when the container restarts, not when it dies')
    }
  }
  assert.deepEqual(delays, [0, 1, 2, 4, 8, 16, 30, 30])
  assert.ok(hasEvent(s, /OOMKilled \(izlazni kod 137\)/))
  assert.ok(hasEvent(s, /CrashLoopBackOff: potrošač 1 čeka 30 s \(stvarno: 5 min\)/))
  assert.ok(s.totals.dlq >= 1, 'the message that kills the worker is redelivered first and ends in the DLQ')
  assert.ok(s.ready.size > 100, 'the queue grows')
  // fix the memory limit: after > 60 s of clean running the back-off resets – the next crash restarts at once
  setConsumerFault(s, 'all', 'none')
  for (let i = 0; i < 10000 && s.consumers[0].status !== 'running'; i++) runFor(s, 0.01)
  runFor(s, 100)
  setConsumerFault(s, 1, 'oom')
  for (let i = 0; i < 2000 && s.consumers[0].status === 'running'; i++) runFor(s, 0.01)
  const c = s.consumers[0]
  assert.equal(c.status, 'crashed')
  assert.equal(Math.round((c.restartAt - (c.lastTermination?.at ?? 0)) * 100) / 100, 0)
  checkInvariants(s)
})

/* ------------------------------------------------------------------ KEDA (L18) */

test('KEDA: 0 → 1 on the first message at the next polling interval, then the Pod starts', () => {
  const s = sim({ rate: 0, consumers: 0, autoscaler: { enabled: true } })
  assert.equal(s.consumers.length, 0)
  runFor(s, 5)
  assert.equal(scalerView(s).replicas, 0)
  publishBatch(s, 1)
  runFor(s, 0.95) // t = 5,95: polls at 0, 3, 6 s
  assert.equal(scalerView(s).replicas, 0)
  runFor(s, 0.1)
  const v = scalerView(s)
  assert.equal(v.replicas, 1)
  assert.equal(v.starting, 1)
  assert.equal(v.lastDecision?.reason, 'keda-activate')
  assert.ok(hasEvent(s, /KEDA: u redu ima poruka \(1\) – potrošači 0 → 1/))
  assert.equal(consumerViews(s)[0].status, 'starting')
  runFor(s, 2)
  assert.equal(consumerViews(s)[0].status !== 'starting', true)
  runFor(s, 10)
  assert.equal(s.totals.completed, 1)
})

test('KEDA HPA: desired = ceil(queue / 10), scale-up limited to max(+100 %, +4) per sync, slow scale-down, cooldown to 0', () => {
  const s = sim({ rate: 0, consumers: 1, autoscaler: { enabled: true, minReplicas: 0 } })
  runFor(s, 0.5)
  publishBatch(s, 95)
  runFor(s, 1.5) // next HPA sync at 1,5 s
  const first = scalerView(s).lastDecision
  assert.equal(first?.reason, 'hpa')
  assert.equal(first?.to, 5, 'ceil(95/10) = 10, limited to max(2·1, 1 + 4) = 5')
  assert.match(first?.text ?? '', /ograničenje brzine skaliranja/)
  runFor(s, 1.5)
  assert.ok(scalerView(s).replicas >= 8)
  // drain, then watch the slow way down
  let emptyAt = -1
  let replicasAtEmpty = 0
  for (let i = 0; i < 12000; i++) {
    runFor(s, 0.01)
    if (emptyAt < 0 && s.ready.size + s.unacked.size === 0) {
      emptyAt = s.t
      replicasAtEmpty = scalerView(s).replicas
    }
    if (emptyAt > 0 && s.t < emptyAt + 15) assert.equal(scalerView(s).replicas, replicasAtEmpty, 'stabilisation window holds the replicas')
    if (emptyAt > 0 && s.t > emptyAt + 120) break
  }
  assert.ok(replicasAtEmpty > 1)
  assert.equal(scalerView(s).replicas, 0, 'KEDA cooldown took it to zero')
  assert.equal(s.consumers.length, 0)
  assert.ok(s.scaler.history.some((d) => d.reason === 'keda-cooldown'))
  assert.equal(s.totals.completed, 95)
  checkInvariants(s)
})

test('HPA seeds its window with the current replicas: enabling KEDA does not drop 4 → 1 at once (review)', () => {
  const s = createQueueSim({ seed: 1, rate: 0.3, consumers: 4 })
  runFor(s, 10)
  setConfig(s, { autoscaler: { enabled: true, minReplicas: 1 } })
  runFor(s, 29)
  assert.equal(scalerView(s).replicas, 4, 'held for the 30 s (sim) stabilisation window')
  assert.equal(s.scaler.history.length, 0)
  runFor(s, 3)
  assert.equal(scalerView(s).replicas, 1)
})

test('HPA decision text names the stabilisation window before minReplicas (review)', () => {
  const s = runPreset('l18-keda-day', 600)
  for (const d of s.scaler.history) {
    if (d.reason !== 'hpa' || d.to >= d.from) continue
    if (/HPA drži najmanje/.test(d.text)) assert.equal(d.to, 1, d.text)
    else assert.match(d.text, /prozor stabilizacije|→ potrošači \d+ → 1$/, d.text)
  }
  // review: the window is labelled with the real value it stands for (compressed ÷10)
  assert.ok(s.scaler.history.some((d) => /4 → 3 \(prozor stabilizacije: 30 s sim, stvarno 5 min\)$/.test(d.text)))
})

test('KEDA metric: ready + unacked (default) or ready only; the consumer slider is ignored while autoscaling', () => {
  const s = quiet({ consumers: 2, autoscaler: { enabled: true, minReplicas: 2, maxReplicas: 2 } })
  publishBatch(s, 10)
  runFor(s, 0.01)
  assert.equal(scalerView(s).metric, 10)
  setConfig(s, { autoscaler: { metric: 'ready' } })
  assert.equal(scalerView(s).metric, 8)
  setConsumers(s, 6)
  assert.equal(s.consumers.length, 2)
  assert.equal(s.config.consumers, 2, 'not stored while the autoscaler owns the replicas')
  setConfig(s, { autoscaler: { enabled: false } })
  assert.equal(s.consumers.length, 2, 'removing the HPA keeps the current replicas')
  assert.equal(s.config.consumers, 2)
  setConsumers(s, 6)
  assert.equal(s.consumers.length, 6)
})

/* ------------------------------------------------------------------ actions with bad input, events */

test('actions ignore NaN / Infinity / negative input instead of producing NaN or stopping arrivals (review)', () => {
  const s = createQueueSim({ seed: 1, rate: 5 })
  runFor(s, 1)
  assert.equal(startBurst(s, { rate: NaN }), false)
  assert.equal(startBurst(s, { rate: Infinity, durationS: 1 }), false)
  assert.equal(startBurst(s, { rate: 10, durationS: -1 }), false)
  assert.equal(rateAt(s, s.t), 5)
  const before = s.totals.orders
  runFor(s, 10)
  assert.ok(s.totals.orders - before > 30, 'arrivals continue')
  assert.equal(publishBatch(s, NaN), 0)
  assert.equal(publishBatch(s, -5), 0)
  assert.equal(publishBatch(s, 1e9), 10_000)
  assert.equal(setSmsGateway(s, 'down', NaN), false)
  assert.equal(setSmsGateway(s, 'down', 0), false)
  assert.equal(s.sms.state, 'ok')
  assert.equal(setSmsGateway(s, 'down', Infinity), true)
  assert.equal(s.sms.until, null)
  assert.ok(!s.events.some((e) => /NaN|∞/.test(e.text)))
  setConfig(s, { seed: 7 })
  assert.equal(s.config.seed, 1, 'seed is fixed for the life of a state (init + reset to change it)')
  checkInvariants(s)
})

test('identical events at the same instant merge („×2”), so the kit EventLog keys stay unique (review)', () => {
  const s = sim()
  publishBatch(s, 100)
  publishBatch(s, 100)
  setSmsGateway(s, 'down', 30)
  setSmsGateway(s, 'down', 30)
  const batch = s.events.filter((e) => e.kind === 'batch')
  assert.equal(batch.length, 1)
  assert.equal(batch[0].text, 'Nalet: +100 narudžbi odjednom (×2)')
  assert.equal(batch[0].count, 2)
  assert.equal(s.events.filter((e) => e.kind === 'sms-gateway').length, 1)
  const keys = s.events.map((e) => `${e.t}-${e.text}`)
  assert.equal(new Set(keys).size, keys.length)
})

test('frequent events are aggregated per second and the log is capped at 50', () => {
  const s = sim({ mode: 'direct', profile: { kind: 'burst', startS: 0, durationS: 600, rate: 20 } })
  runFor(s, 600)
  assert.equal(s.events.length, 50)
  assert.ok(s.events.some((e) => /^503: još \d+ odbijen/.test(e.text)))
  assert.ok(s.events.every((e, i) => i === 0 || e.id > s.events[i - 1].id))
  assert.ok(s.events.every((e) => ['ok', 'warn', 'bad', 'info', 'neutral'].includes(e.tone)))
})

/* ------------------------------------------------------------------ views, presets, invariants */

test('views for the UI: progress 0..1, delayed lane, in-flight timers, flights', () => {
  const s = quiet({ consumers: 1, pPoison: 0, broker: 'sqs' })
  publishPoison(s)
  publishBatch(s, 2)
  runFor(s, 0.5)
  const cv = consumerViews(s)[0]
  assert.equal(cv.status, 'busy')
  assert.equal(cv.poison, true)
  between(cv.progress, 0.45, 0.55, 'progress')
  assert.equal(cv.phase, 'work')
  assert.equal(readyView(s, 1).length, 1)
  const inf = inflightView(s)[0]
  between(inf.remainingS, 29.4, 29.6, 'visibility left')
  runFor(s, 0.6)
  const dv = delayedView(s)
  assert.equal(dv.length, 1)
  assert.ok(dv[0].progress >= 0 && dv[0].progress <= 1)
  assert.ok(dv[0].remainingS < 1)
  for (const f of flightsView(s)) assert.ok(f.progress >= 0 && f.progress <= 1)
  assert.ok(s.flights.some((f) => f.to === 'retry'))
})

test('every preset runs, keeps the invariants and shows what it promises', () => {
  for (const id of Object.keys(PRESETS) as PresetId[]) {
    const s = runPreset(id)
    checkInvariants(s)
    assert.ok(s.totals.orders > 0, id)
  }
  const crash = runPreset('l06-rabbit-crash-after')
  assert.equal(crash.totals.duplicates, 1)
  assert.equal(crash.totals.smsDuplicates, 1)
  assert.equal(runPreset('l06-sqs-slow-consumer').totals.duplicates >= 1, true)
  const oom = runPreset('l24-oom-worker')
  assert.ok(oom.totals.oomKills > 10 && oom.totals.dlq >= 1 && oom.ready.size > 150)
  const poison = runPreset('l24-poison')
  assert.equal(poison.totals.dlq, 1)
  assert.equal(poison.totals.retries, 4)
  const day = runPreset('l18-keda-day')
  assert.equal(day.consumers.length, 0, 'night: scaled to zero')
  assert.ok(Math.max(...day.scaler.history.map((d) => d.to)) >= 4)
  assert.ok(day.scaler.history.some((d) => d.reason === 'keda-activate'))
})

test('L18 with real KEDA/HPA timings: the 1200 s day reaches 0 at night and wakes on the first message (review)', () => {
  const real = runPreset('l18-keda-day-real')
  const h = real.scaler.history
  const down = h.find((d) => d.reason === 'keda-cooldown')
  assert.ok(down, 'scaled to zero at night')
  between(down.t, 1100, 1250, '1 → 0')
  const wake = h.filter((d) => d.reason === 'keda-activate')
  assert.equal(wake.length, 2, 'morning and next morning')
  assert.ok(wake[1].t > down.t)
  assert.ok(Math.max(...h.map((d) => d.to)) <= 10)
  // the compressed day on real timings never reaches 0 (the reviewer's failure), which is why REAL_DAY_PROFILE exists
  const wrong = createQueueSim({ ...PRESETS['l18-keda-day-real'].config, profile: COMPRESSED_DAY_PROFILE })
  runFor(wrong, 1200)
  assert.ok(!wrong.scaler.history.some((d) => d.reason === 'keda-cooldown'))
})

test('stepWithScript (UI) reproduces runPreset (headless)', () => {
  const p = PRESETS['l06-rabbit-crash-after']
  const s = createQueueSim(p.config)
  for (let i = 0; i < p.runS * 60; i++) stepWithScript(s, 1 / 60, p.script)
  const h = runPreset('l06-rabbit-crash-after')
  assert.equal(s.tick, h.tick)
  assert.deepEqual(s.totals, h.totals)
})

test('stress: random actions every second keep every invariant on every tick; after recovery every message is accounted for (liveness)', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 90]) {
    const s = sim({ seed, prefetch: 3, pFail: 0.15, pPoison: 0.03, maxQueue: 30, visibilityTimeoutS: 3, consumerTimeoutS: 3, rate: 4, clientRetries: 1 })
    const r = createRng(1000 + seed)
    for (let sec = 0; sec < 240; sec++) {
      const k = r.int(0, 14)
      if (k === 0) crashConsumer(s)
      else if (k === 1) crashConsumer(s, undefined, 'after-effect')
      else if (k === 2) publishBatch(s, 20)
      else if (k === 3) publishPoison(s)
      else if (k === 4) setSmsGateway(s, r.pick(['ok', 'slow', 'down'] as const), r.int(1, 5))
      else if (k === 5) setConsumers(s, r.int(0, 6))
      else if (k === 6) setConfig(s, { broker: r.pick(['rabbitmq', 'sqs'] as const) })
      else if (k === 7) setConfig(s, { ackMode: r.pick(['manual', 'auto'] as const) })
      else if (k === 8) setConfig(s, { retryMode: r.pick(['backoff', 'immediate', 'nack-requeue'] as const), prefetch: r.int(1, 4) })
      else if (k === 9) setConfig(s, { mode: r.pick(['queue', 'direct'] as const) })
      else if (k === 10) setConsumerFault(s, r.int(1, 8), r.pick(['none', 'slow', 'oom'] as const))
      else if (k === 11) setConfig(s, { autoscaler: { enabled: r.chance(0.5) }, overflow: r.pick(['drop-head', 'reject-publish'] as const) })
      else if (k === 12) startBurst(s, { rate: 12, durationS: 3 })
      else if (k === 13) setConfig(s, { smsOnFailure: r.pick(['retry-sms', 'nack-message'] as const), smsGuard: r.pick(['none', 'record-first', 'provider-key'] as const) })
      else crashAllConsumers(s)
      for (let i = 0; i < 100; i++) {
        runFor(s, 0.01)
        checkInvariants(s, 4)
      }
    }
    assert.ok(s.totals.completed > 100)
    // recovery: a healthy system with no producer must empty completely
    setConfig(s, { rate: 0, mode: 'queue', retryMode: 'backoff', autoscaler: { enabled: false }, consumers: 4, consumerFault: 'none', smsGateway: 'ok' })
    for (const c of s.consumers) c.fault = null
    runFor(s, 3000)
    checkInvariants(s, 4)
    assert.equal(s.little.inSystem, 0, `seed ${seed}: everything accepted has left the system`)
    assert.equal(s.unacked.size, 0)
    assert.equal(s.smsOutbox.length, 0, 'every deferred SMS was sent')
  }
})
