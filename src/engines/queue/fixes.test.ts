/// <reference types="node" />
/**
 * Regression tests for the second review of E2 „Red” (model + API lenses). Each test names its finding:
 * M1–M12 (model), A1–A16 (API). Run: node --test src/engines/queue/*.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRng } from '../../kit/sim/math.ts'
import {
  BROKER_FACTS,
  CEVAP_PETAK_PROFILE,
  CEVAP_PETAK_SEED,
  PRESETS,
  REAL_AUTOSCALER_TIMINGS,
  RESTART_CRASHLOOP,
  attemptsPerOrder,
  burstOutcome,
  consumerViews,
  controlsView,
  crashAllConsumers,
  crashConsumer,
  createPresetSim,
  createQueueSim,
  currentReplicaSet,
  deliveryLimitInfo,
  drainTrial,
  duplicateGuard,
  fanoutScript,
  finished,
  flightsView,
  getPreset,
  kafkaStepperScript,
  kubeEvents,
  markTotals,
  metrics,
  orderOutcome,
  orderTrace,
  podViews,
  publishBatch,
  publishPoison,
  readyView,
  repairConsumer,
  rolloutConsumers,
  rolloutView,
  runFor,
  runPreset,
  scalerView,
  setConfig,
  setConsumerFault,
  setConsumers,
  setFlightDuration,
  setSmsGateway,
  slowConsumer,
  startBurst,
  step,
  stepWithScript,
  syncConsumers,
  theory,
  tick,
  workerLogs,
  type ConsumerFault,
  type Message,
  type PresetId,
  type QueueConfigPatch,
  type QueueState,
} from './index.ts'

const hasEvent = (s: QueueState, re: RegExp) => s.events.some((e) => re.test(e.text))
const between = (v: number, lo: number, hi: number, msg: string) => assert.ok(v >= lo && v <= hi, `${msg}: ${v} ∉ [${lo}, ${hi}]`)
const quiet = (cfg: QueueConfigPatch = {}) => createQueueSim({ seed: 42, rate: 0, serviceDist: 'fixed', ...cfg })

/** Invariants that the fixes added (returns bookkeeping, chained flights, accounting with SQS without a DLQ). */
function checkInvariants(s: QueueState): void {
  const t = s.totals
  assert.ok(s.returnsAtHead >= 0 && s.returnsAtHead <= s.ready.size, 'returns bookkeeping within the queue')
  for (let i = 0; i < s.returnsAtHead; i++) assert.equal((s.ready.at(i) as Message).redelivered, true, 'only returns sit in the returns block')
  let autoHeld = 0
  let requests = 0
  for (const c of s.consumers) {
    autoHeld += c.buffer.filter((d) => d.autoAcked).length + (c.job?.delivery?.autoAcked ? 1 : 0)
    if (c.job?.request) requests++
  }
  const msgs = s.ready.size + s.delayed.length + s.unacked.size + autoHeld
  assert.equal(t.published, t.completed - t.directOk + t.dlq + t.dropped + t.lostAutoAck + msgs, 'every published message is accounted for')
  assert.equal(s.little.inSystem, msgs + requests, 'Little in-system count')
  assert.equal(t.failed5xx, t.failed500 + t.failed502, '5xx split')
  const active = new Set<number>()
  for (const f of flightsView(s)) {
    const key = f.msgId > 0 ? f.msgId : -f.orderId - 1e9 * (f.to === 'sms' ? 1 : 0)
    assert.ok(!active.has(key), 'one place per ticket')
    active.add(key)
    assert.notEqual(f.from, f.to)
  }
  assert.ok(s.events.length <= 50 && workerLogs(s).length <= 400 && s.workerLog.length < 500 && s.kubeEvents.length <= 100 && s.traces.size <= 300)
  const th = theory(s)
  for (const v of [th.capacity, th.mu, th.k, th.backlog]) assert.ok(Number.isFinite(v))
  for (const v of [th.rho, th.offered, th.growthPerS, th.drainTimeS]) assert.ok(!Number.isNaN(v))
  for (const [k, v] of Object.entries(metrics(s))) if (typeof v === 'number') assert.ok(Number.isFinite(v), `metrics.${k} = ${v}`)
}

/* ------------------------------------------------------------------ model lens */

test('M1: theory, the kμ chart and the narration use the consumers’ faults – all slow → ρ 20,5, unstable, „Red raste”', () => {
  const s = createQueueSim({ seed: 42 })
  setConsumerFault(s, 'all', 'slow')
  runFor(s, 100)
  const th = theory(s)
  const cap = 4 / 41
  assert.ok(Math.abs(th.capacity - cap) < 1e-12)
  assert.ok(Math.abs(s.series.capacity.last() - cap) < 1e-12, 'kμ chart')
  assert.ok(Math.abs(th.rho - 2 / cap) < 1e-9)
  assert.equal(th.stable, false)
  assert.equal(th.mmc, null)
  assert.ok(Math.abs(th.growthPerS - (2 - cap)) < 1e-9)
  assert.equal(th.drainTimeS, Infinity)
  assert.equal(th.slow, 4)
  assert.ok(metrics(s).backlog > 150, 'the queue really grows')
  assert.ok(hasEvent(s, /^Red raste: λ 2\/s > kμ 0,1\/s \(\+1,9 poruka\/s\) – potrošači spori: 4$/))
  // heterogeneous (the reviewer's v21): 2 of 4 slow at λ 2,5 → capacity 2 + 2/41 < λ
  const h = createQueueSim({ seed: 42, rate: 2.5 })
  setConsumerFault(h, 1, 'slow')
  setConsumerFault(h, 2, 'slow')
  runFor(h, 300)
  const t2 = theory(h)
  assert.ok(Math.abs(t2.capacity - (2 + 2 / 41)) < 1e-12)
  assert.equal(t2.homogeneous, false)
  assert.equal(t2.mmc, null, 'M/M/k hidden for heterogeneous consumers')
  assert.equal(t2.stable, false)
  assert.ok(metrics(h).backlog > 80, `backlog ${metrics(h).backlog}`)
  assert.ok(hasEvent(h, /^Red raste: .* – potrošači spori: 2$/))
  // OOM: zero throughput
  const o = createQueueSim({ seed: 42, consumerFault: 'oom' })
  assert.equal(theory(o).capacity, 0)
  assert.equal(theory(o).rho, Infinity)
  assert.equal(theory(o).oom, 4)
  assert.equal(theory(o).directLossErlangB, 1)
  // the healthy default is unchanged (exact M/M/4)
  const d = theory(createQueueSim({ seed: 42 }))
  assert.equal(d.rho, 0.5)
  assert.ok(d.mmc !== null && d.homogeneous && !d.approximate)
  assert.ok(Math.abs((d.mmc?.w ?? 0) - 1.0870) < 1e-3)
})

test('M1: the retry load (pFail, poison, delivery limit) is part of the offered load and matches the measured deliveries per message', () => {
  const expected = (0.98 * (1 - 0.1 ** 5)) / 0.9 + 0.02 * 5
  const s = createQueueSim({ seed: 254, pFail: 0.1, pPoison: 0.02 })
  assert.ok(Math.abs(attemptsPerOrder(s) - expected) < 1e-12)
  runFor(s, 2000)
  between(s.totals.delivered / s.totals.published, expected * 0.97, expected * 1.03, 'deliveries per message')
  const th = theory(s)
  assert.ok(Math.abs(th.offered - 2 * expected) < 1e-9)
  assert.equal(th.approximate, true)
  // failures that are never counted → unbounded load
  assert.equal(attemptsPerOrder(createQueueSim({ pPoison: 0.01, retryMode: 'nack-requeue' })), Infinity)
  assert.equal(attemptsPerOrder(createQueueSim({ pPoison: 0.01, broker: 'sqs', dlqEnabled: false })), Infinity)
  assert.equal(attemptsPerOrder(createQueueSim({ pFail: 0.5, broker: 'sqs', dlqEnabled: false })), 2)
  assert.equal(attemptsPerOrder(createQueueSim({ pPoison: 1 })), 5)
  assert.equal(attemptsPerOrder(createQueueSim({ pFail: 1 })), 5)
  assert.equal(attemptsPerOrder(createQueueSim({ mode: 'direct', pFail: 0.5 })), 1)
  assert.equal(attemptsPerOrder(createQueueSim({ ackMode: 'auto', pFail: 0.5 })), 1)
  const inf = theory(createQueueSim({ pPoison: 0.01, retryMode: 'nack-requeue' }))
  assert.equal(inf.rho, Infinity)
  assert.equal(inf.mmc, null)
  assert.equal(theory(createQueueSim({ consumers: 0, pPoison: 1, pFail: 1 })).rho, Infinity)
  assert.equal(theory(createQueueSim({ consumers: 0, rate: 0 })).rho, 0)
})

test('M1: a drain prediction uses the lowest capacity of the episode (a slow consumer counts 1 / (S + extra))', () => {
  const s = createQueueSim({ seed: CEVAP_PETAK_SEED, profile: CEVAP_PETAK_PROFILE, slowExtraS: 3 })
  setConsumerFault(s, 1, 'slow')
  runFor(s, 200)
  const d = s.drain.last
  assert.ok(d)
  assert.ok(Math.abs(d.capacityMin - 3.25) < 1e-12)
  const lam = d.arrivalsDuring / d.durationS
  assert.ok(d.predictedS !== null && Math.abs(d.predictedS - d.peak / (3.25 - lam)) < 1e-9)
})

test('M2: SQS without a DLQ has no maxReceiveCount – a poison message keeps coming back; RabbitMQ without a DLX still drops it', () => {
  const s = quiet({ consumers: 1, broker: 'sqs', dlqEnabled: false, serviceDist: 'exp' })
  publishPoison(s)
  runFor(s, 300)
  assert.equal(s.totals.dropped, 0)
  assert.equal(s.totals.dlq, 0)
  assert.equal(metrics(s).lost, 0)
  assert.ok(s.totals.delivered > 10, `${s.totals.delivered} deliveries`)
  assert.ok(hasEvent(s, /^SQS bez DLQ-a nema maxReceiveCount: narudžba #1 vraća se sve do isteka zadržavanja \(zadano 4 dana\)$/))
  assert.ok(hasEvent(s, /pokušaj \d+, bez ograničenja/))
  assert.equal(orderOutcome(s).pending, 1)
  const info = deliveryLimitInfo(s)
  assert.equal(info.enforced, false)
  assert.equal(info.overLimit, 'none')
  assert.equal(info.argName, null)
  assert.equal(controlsView(s).maxDeliveries.enabled, false)
  assert.match(controlsView(s).maxDeliveries.reason ?? '', /redrive policyju s DLQ-om/)
  assert.equal(BROKER_FACTS.sqsRetentionDefaultS, 4 * 86400)
  // with a DLQ: maxReceiveCount 5
  const d = quiet({ consumers: 1, broker: 'sqs' })
  publishPoison(d)
  runFor(d, 300)
  assert.equal(d.totals.dlq, 1)
  assert.equal(d.dlqRecent[0].receiveCount, 5)
  assert.equal(deliveryLimitInfo(d).argName, 'maxReceiveCount')
  assert.equal(deliveryLimitInfo(d).argValue, 5)
  // RabbitMQ without a dead-letter exchange: dropped (the pitfall)
  const r = quiet({ consumers: 1, dlqEnabled: false })
  publishPoison(r)
  runFor(r, 300)
  assert.equal(r.totals.dropped, 1)
  assert.equal(deliveryLimitInfo(r).overLimit, 'dropped')
  assert.equal(controlsView(r).maxDeliveries.enabled, true)
  // turning the DLQ on later dead-letters the message at its next return
  setConfig(s, { dlqEnabled: true })
  runFor(s, 120)
  assert.equal(s.totals.dlq, 1)
  checkInvariants(s)
})

test('M2: SQS moves a message received 3 times to the back only with a redrive policy whose maxReceiveCount > 3', () => {
  const run = (maxDeliveries: number) => {
    const s = quiet({ consumers: 1, broker: 'sqs', retryMode: 'immediate', maxDeliveries })
    publishPoison(s)
    publishBatch(s, 3)
    runFor(s, 20)
    return { dlqAt: s.dlqRecent[0]?.t ?? null, cooked: s.kitchen.filter((k) => k.kind === 'cooked').map((k) => [k.orderId, k.t]) }
  }
  // maxReceiveCount 5: after the 3rd receive the poison goes behind orders 2–4, then 2 more receives
  const five = run(5)
  assert.deepEqual(five.cooked, [
    [2, 4],
    [3, 5],
    [4, 6],
  ])
  assert.equal(five.dlqAt, 8)
  // maxReceiveCount 3: it reaches the DLQ on the 3rd receive, never moved
  const three = run(3)
  assert.equal(three.dlqAt, 3)
  assert.deepEqual(
    three.cooked.map((c) => c[0]),
    [2, 3, 4],
  )
})

test('M3: „Najviše isporuka” N = RabbitMQ x-delivery-limit N − 1 (dead-lettered when delivery-count EXCEEDS it); quorum default 20 = 21 deliveries', () => {
  const s = createQueueSim()
  const info = deliveryLimitInfo(s)
  assert.equal(info.argName, 'x-delivery-limit')
  assert.equal(info.argValue, 4)
  assert.equal(info.productDefaultDeliveries, 21)
  assert.equal(info.label, '5 isporuka = delivery-limit 4 · quorum zadano: 20 (21 isporuka)')
  assert.equal(controlsView(s).deliveryLimit.label, info.label)
  const q = quiet({ consumers: 1, retryMode: 'immediate', maxDeliveries: 21 })
  publishPoison(q)
  runFor(q, 30)
  assert.equal(q.totals.delivered, 21)
  assert.equal(q.dlqRecent[0].deliveryCount, 21)
  assert.ok(q.dlqRecent[0].deliveryCount > BROKER_FACTS.rabbitQuorumDeliveryLimit)
})

test('M4: the SMS retry relay covers gateway failures but is not a transactional outbox (a crash between commit and send loses the SMS under record-first)', () => {
  // gateway down, no crash: deferred, resent later, nothing lost
  const ok = quiet({ consumers: 1, smsGuard: 'record-first', smsOnFailure: 'retry-sms' })
  setSmsGateway(ok, 'down', 4)
  publishBatch(ok, 1)
  runFor(ok, 60)
  assert.equal(ok.totals.smsDeferred, 1)
  assert.equal(ok.totals.smsResent, 1)
  assert.equal(ok.totals.smsLost, 0)
  // the reviewer's v7: crash while the SMS call is in flight, after the commit
  const s = quiet({ consumers: 1, smsGuard: 'record-first', smsOnFailure: 'retry-sms' })
  setSmsGateway(s, 'slow', 4)
  publishBatch(s, 1)
  runFor(s, 1.5)
  assert.equal(s.consumers[0].job?.phase, 'sms')
  assert.equal(s.consumers[0].job?.committed, true)
  crashConsumer(s, s.consumers[0].id)
  runFor(s, 120)
  assert.equal(s.totals.smsSent, 0)
  assert.equal(s.totals.smsLost, 1)
  assert.deepEqual(
    s.smsLog.map((e) => e.kind),
    ['skipped', 'lost'],
  )
})

test('M5: metrics().unserved counts the orders a full queue sent to the DLQ (lost excludes the DLQ)', () => {
  const s = createQueueSim({ ...PRESETS['l06-cevap-petak-queue'].config, maxQueue: 50, overflow: 'drop-head' })
  runFor(s, 150)
  const m = metrics(s)
  assert.equal(m.lost, 0)
  assert.equal(m.totals.dlqMaxLength, 63)
  assert.equal(m.unserved, 63)
  assert.equal(orderOutcome(s).cooked + m.unserved + orderOutcome(s).pending, m.totals.orders)
})

test('M6: DLQ / overflow lines are aggregated per second, so a burst does not push the story out of the 50-row log', () => {
  const s = createQueueSim({ ...PRESETS['l06-cevap-petak-queue'].config, maxQueue: 50, overflow: 'drop-head' })
  runFor(s, 41)
  const overflow = s.events.filter((e) => e.kind === 'overflow')
  assert.ok(overflow.length <= 13, `${overflow.length} overflow lines`)
  assert.ok(overflow.some((e) => /^Red pun – u DLQ još \d+ narudžb/.test(e.text)))
  for (const k of ['start', 'burst', 'backlog-growing', 'burst-end'] as const) assert.ok(s.events.some((e) => e.kind === k), k)
  const nd = createQueueSim({ ...PRESETS['l06-cevap-petak-queue'].config, maxQueue: 50, overflow: 'drop-head', dlqEnabled: false })
  runFor(nd, 41)
  assert.ok(nd.events.filter((e) => e.kind === 'overflow').length <= 13)
  assert.ok(hasEvent(nd, /^Red pun – odbačeno još: \d+ narudžb/))
  // all-poison traffic: at most one DLQ line per second (+ the first)
  const p = createQueueSim({ seed: 42, pPoison: 1, retryMode: 'immediate' })
  runFor(p, 30)
  const dlq = p.events.filter((e) => e.kind === 'dlq')
  assert.ok(p.totals.dlq >= 15 && dlq.length <= 31 && dlq.length < p.totals.dlq, `${dlq.length} lines for ${p.totals.dlq}`)
})

test('M8: RabbitMQ returns come back in the order they were returned, ahead of regular messages (quorum returns queue)', () => {
  const s = quiet({ consumers: 2, serviceMeanS: 100 })
  publishBatch(s, 4)
  runFor(s, 0.02)
  crashConsumer(s, 1)
  runFor(s, 0.5)
  crashConsumer(s, 2)
  assert.deepEqual(
    readyView(s).map((m) => m.orderId),
    [1, 2, 3, 4],
  )
  assert.equal(s.returnsAtHead, 2)
  runFor(s, 3)
  assert.deepEqual(
    consumerViews(s).map((c) => c.orderId),
    [1, 2],
    'the restarted consumers take the returns first, in return order',
  )
  assert.equal(s.returnsAtHead, 0)
  checkInvariants(s)
})

test('M9 / A7: compressed KEDA/HPA durations are labelled with the real value; scalerView has real-clock countdowns', () => {
  const s = runPreset('l18-keda-day')
  const down = s.scaler.history.find((d) => d.reason === 'keda-cooldown')
  assert.equal(down?.text, 'KEDA: red prazan dulje od 30 s (sim · stvarno: 5 min) – potrošači 1 → 0')
  const v = scalerView(s)
  assert.equal(v.realPerSim, 10)
  assert.ok(Math.abs(v.secondsUntilPollRealS - v.secondsUntilPoll * 10) < 1e-9)
  assert.equal(v.labels.cooldown, '30 s (sim · stvarno: 5 min)')
  assert.equal(v.labels.polling, '3 s (sim · stvarno: 30 s)')
  const r = runPreset('l18-keda-day-real')
  const realDown = r.scaler.history.find((d) => d.reason === 'keda-cooldown')
  assert.equal(realDown?.text, 'KEDA: red prazan dulje od 5 min – potrošači 1 → 0')
  assert.equal(scalerView(r).labels.cooldown, '5 min')
  assert.equal(REAL_AUTOSCALER_TIMINGS.realPerSim, 1)
  const live = createQueueSim({ consumers: 2, autoscaler: { enabled: true } })
  runFor(live, 40)
  const lv = scalerView(live)
  if (lv.cooldownLeftS !== null) assert.ok(Math.abs((lv.cooldownLeftRealS ?? 0) - lv.cooldownLeftS * 10) < 1e-9)
})

test('M10: direct-mode errors are split by type – 500 (processing / SMS) and 502 (worker crashed); 504-like = clientTimeouts', () => {
  const s = createQueueSim({ seed: 42, mode: 'direct' })
  runFor(s, 5)
  crashConsumer(s)
  setSmsGateway(s, 'down')
  runFor(s, 30)
  const t = s.totals
  assert.ok(t.failed502 >= 1 && t.failed500 >= 5, `502 ${t.failed502}, 500 ${t.failed500}`)
  assert.equal(t.failed5xx, t.failed500 + t.failed502)
})

test('M11 / A15: the Kafka stepper says murmur2, agrees in number and only mentions a hot key when there is one', () => {
  const steps = kafkaStepperScript({})
  assert.ok(steps[0].body.includes('Kafkin zadani particioner koristi murmur2'))
  assert.ok(steps[0].body.includes('Vrući ključ'))
  assert.match(steps[1].body, /2 potrošača dijele 3 particije\.$/)
  assert.match(kafkaStepperScript({ consumers: 1, partitions: 1 })[1].body, /Jedan potrošač čita jedinu particiju\.$/)
  assert.match(kafkaStepperScript({ consumers: 1, partitions: 3 })[1].body, /Jedan potrošač čita sve particije \(3\)\.$/)
  assert.match(kafkaStepperScript({ consumers: 5, partitions: 5 })[1].body, /5 potrošača dijeli 5 particija\.$/)
  const few = kafkaStepperScript({ records: 3 })[3].body
  assert.ok(!/1 zapisa/.test(few), few)
  assert.ok(!kafkaStepperScript({ hotKeyShare: 0 })[0].body.includes('Vrući ključ'))
  assert.deepEqual(steps[1].consumerLabels, ['Potrošač 1', 'Potrošač 2'])
})

test('M12: the l06-poison-dlq preset reproduces the lecture’s numbers (DLQ 24, 236 retries) on its documented seed', () => {
  const p = getPreset('l06-poison-dlq')
  assert.equal(p.config.seed, 254)
  const s = runPreset('l06-poison-dlq')
  assert.deepEqual([s.totals.dlq, s.totals.retries, s.totals.orders], [24, 236, 1217])
  assert.equal(metrics(s).lost, 0)
})

/* ------------------------------------------------------------------ API lens */

test('A1: ack before/after processing × crash before/after cooking – the four cells of „Potvrda i ponovna isporuka”', () => {
  const cell = (ackMode: 'manual' | 'auto', when: 'before-effect' | 'after-effect') => {
    const s = quiet({ consumers: 1, ackMode })
    publishBatch(s, 1)
    if (when === 'after-effect') crashConsumer(s, undefined, 'after-effect')
    else {
      runFor(s, 0.5)
      crashConsumer(s)
    }
    runFor(s, 10)
    checkInvariants(s)
    return { cooked: s.cooked.get(1) ?? 0, lost: metrics(s).lost, duplicates: s.totals.duplicates, completed: s.totals.completed, inSystem: s.little.inSystem }
  }
  assert.deepEqual(cell('manual', 'before-effect'), { cooked: 1, lost: 0, duplicates: 0, completed: 1, inSystem: 0 })
  assert.deepEqual(cell('manual', 'after-effect'), { cooked: 2, lost: 0, duplicates: 1, completed: 1, inSystem: 0 })
  assert.deepEqual(cell('auto', 'before-effect'), { cooked: 0, lost: 1, duplicates: 0, completed: 0, inSystem: 0 })
  // the reviewer's blocker: auto-ack + crash after cooking = at-most-once done right: cooked once, nothing lost
  assert.deepEqual(cell('auto', 'after-effect'), { cooked: 1, lost: 0, duplicates: 0, completed: 1, inSystem: 0 })
  const s = quiet({ consumers: 1, ackMode: 'auto' })
  publishBatch(s, 1)
  crashConsumer(s, undefined, 'after-effect')
  runFor(s, 3)
  assert.ok(hasEvent(s, /^Potrošač 1 pao nakon kuhanja – poruka je potvrđena već pri isporuci, ništa se ne ponavlja$/))
  assert.ok(!hasEvent(s, /prije potvrde|izgubljena/))
  // auto-ack + a naive handler whose SMS call fails after the commit: cooked once, not lost, not redelivered
  const n = quiet({ consumers: 1, ackMode: 'auto', smsOnFailure: 'nack-message' })
  setSmsGateway(n, 'down')
  publishBatch(n, 1)
  runFor(n, 20)
  assert.deepEqual([n.cooked.get(1), n.totals.lostAutoAck, n.totals.completed, n.totals.delivered], [1, 0, 1, 1])
})

test('A2: burstOutcome latches per burst – no flicker, and losses or poison messages outside the burst do not block it', () => {
  const s = createQueueSim(PRESETS['l06-cevap-petak-queue'].config)
  let flips = 0
  let prev = false
  for (let i = 0; i < 150 * 30; i++) {
    step(s, 1 / 30)
    const done = burstOutcome(s)?.done ?? false
    if (done !== prev) flips++
    prev = done
  }
  assert.equal(flips, 1, 'false → true once, never back')
  const o = burstOutcome(s)
  assert.ok(o)
  assert.deepEqual([o.orders, o.cooked, o.lost, o.pending, o.servedBursts], [145, 145, 0, 0, 1])
  assert.ok(o.doneAt !== null && o.doneAt > 40 && o.doneAt < 99.6, `doneAt ${o.doneAt}`)
  assert.ok(hasEvent(s, /^Nalet obrađen do kraja: 145 narudžbi, nijedna izgubljena$/))
  // earlier losses (direct mode) and a poison message in the DLQ do not block a later burst
  const e = createQueueSim({ seed: 42, mode: 'direct', rate: 6 })
  runFor(e, 20)
  assert.ok(metrics(e).lost > 0)
  setConfig(e, { mode: 'queue', rate: 2 })
  publishPoison(e)
  runFor(e, 40)
  assert.equal(e.totals.dlq, 1)
  startBurst(e)
  runFor(e, 120)
  assert.equal(burstOutcome(e)?.done, true)
  assert.equal(orderOutcome(e).allServed, false, 'the whole-run outcome stays false – why it is not the goal check')
  // a burst that loses orders fails (latched) and does not count
  const f = createQueueSim({ ...PRESETS['l06-cevap-petak-queue'].config, maxQueue: 50, overflow: 'drop-head' })
  runFor(f, 150)
  assert.deepEqual([burstOutcome(f)?.failed, burstOutcome(f)?.done, burstOutcome(f)?.servedBursts], [true, false, 0])
  // zero consumers: everything pending, not done; no burst yet → null
  const z = createQueueSim({ seed: 42, consumers: 0 })
  startBurst(z)
  runFor(z, 30)
  const zo = burstOutcome(z)
  assert.ok(zo && !zo.done && zo.pending === zo.orders && zo.orders > 100)
  assert.equal(burstOutcome(createQueueSim()), null)
})

test('A2: duplicateGuard – „Nula dvostrukih narudžbi” needs the risky event to happen (doing nothing does not pass)', () => {
  const g = createQueueSim({ seed: 42, idempotent: true })
  const mark = markTotals(g)
  runFor(g, 10)
  assert.equal(duplicateGuard(g, mark).triggered, false)
  crashConsumer(g, undefined, 'after-effect')
  runFor(g, 15)
  assert.deepEqual(duplicateGuard(g, mark), { triggered: true, prevented: 1, duplicates: 0, smsDuplicates: 1 })
  const sqs = runPreset('l06-sqs-slow-consumer', { overrides: { idempotent: true } })
  const dg = duplicateGuard(sqs, { ...sqs.totals, alreadyCooked: 0, duplicates: 0, smsDuplicates: 0 })
  assert.ok(dg.triggered && dg.prevented >= 1 && dg.duplicates === 0)
  const naive = runPreset('l06-rabbit-crash-after')
  const nd = duplicateGuard(naive, { ...naive.totals, alreadyCooked: 0, duplicates: 0, smsDuplicates: 0 })
  assert.ok(nd.triggered && nd.duplicates === 1)
})

test('A3: one ticket in one place – hops are chained per message, finished hops are culled, SQS orphans use the invisible lane', () => {
  const s = createQueueSim({ seed: 42 })
  for (let i = 0; i < 120 * 30; i++) {
    step(s, 1 / 30)
    checkInvariants(s)
  }
  // consecutive hops of one message connect in time and place
  const byMsg = new Map<number, typeof s.flights>()
  for (const f of s.flights) if (f.msgId > 0) byMsg.set(f.msgId, [...(byMsg.get(f.msgId) ?? []), f])
  for (const hops of byMsg.values()) {
    for (let i = 1; i < hops.length; i++) {
      assert.ok(hops[i].t0 >= hops[i - 1].t0 + hops[i - 1].dur - 1e-9, 'a hop starts when the previous one lands')
      assert.equal(hops[i].from, hops[i - 1].to)
    }
  }
  // after a speed change nothing finished stays listed (the cap is not eaten by dead hops)
  setFlightDuration(s, 3)
  runFor(s, 5)
  setFlightDuration(s, 0.1)
  runFor(s, 0.5)
  assert.ok(s.flights.every((f) => f.t0 + f.dur > s.t - 1e-9))
  // SQS: crash → consumer → invisible; visibility expiry → invisible → queue (never queue → queue)
  const q = quiet({ consumers: 1, broker: 'sqs' })
  publishBatch(q, 1)
  runFor(q, 0.5)
  crashConsumer(q)
  assert.ok(q.flights.some((f) => f.from === 'consumer:1' && f.to === 'invisible'))
  runFor(q, 29.55)
  assert.ok(q.flights.some((f) => f.from === 'invisible' && f.to === 'queue'))
  assert.ok(!q.flights.some((f) => f.from === f.to))
  // the cook's ticket is still flying when the job starts; the UI can wait for it
  const t = quiet({ consumers: 1 })
  publishBatch(t, 1)
  runFor(t, 0.02)
  assert.equal(consumerViews(t)[0].ticketArriving, true)
  runFor(t, 0.6)
  assert.equal(consumerViews(t)[0].ticketArriving, false)
})

test('A5: L24 signals – worker logs with trace ids, Kubernetes events, an order’s trace waterfall and an errors/s series', () => {
  const s = runPreset('l24-poison')
  const id = s.dlqRecent[0].orderId
  const tr = orderTrace(s, id)
  assert.ok(tr)
  assert.match(tr.traceId, /^[0-9a-f]{32}$/)
  const names = tr.spans.map((x) => x.span)
  assert.equal(names.filter((n) => n === 'obrada').length, 5)
  assert.equal(names.filter((n) => n === 'čekanje na ponovni pokušaj').length, 4)
  assert.equal(names.at(-1), 'DLQ')
  assert.ok(tr.spans.filter((x) => x.span === 'obrada').every((x) => x.outcome === 'fail' && x.consumerId !== null))
  for (let i = 1; i < tr.spans.length; i++) assert.ok(Math.abs(tr.spans[i].start - tr.spans[i - 1].endS) < 1e-9, 'the waterfall has no gaps')
  const errs = workerLogs(s).filter((l) => l.orderId === id && l.level === 'ERROR')
  assert.ok(errs.length >= 1 && errs.every((l) => l.traceId === tr.traceId && /otrovna poruka/.test(l.text)))
  // a healthy order: red → obrada → SMS → potvrda
  const ok = orderTrace(s, 3)
  assert.deepEqual(
    ok?.spans.map((x) => x.span),
    ['red', 'obrada', 'SMS', 'potvrda'],
  )
  assert.ok(ok?.spans.every((x) => x.outcome === 'ok' && !x.open))
  // logs: filters and limits
  const c1 = workerLogs(s, { consumerId: 1, limit: 3 })
  assert.ok(c1.length === 3 && c1.every((l) => l.consumerId === 1))
  assert.ok(workerLogs(s, { sinceS: 50 }).every((l) => l.t >= 50))
  // OOM: BackOff events (counted), Started, no app line at the kill, objects match kubectl names
  const o = runPreset('l24-oom-worker')
  const ev = kubeEvents(o)
  const backoff = ev.filter((e) => e.reason === 'BackOff')
  assert.ok(backoff.length >= 1 && backoff.every((e) => e.type === 'Warning' && /^Back-off restarting failed container worker in pod klopa-worker-/.test(e.message)))
  assert.ok(backoff.some((e) => e.count > 1))
  assert.ok(ev.some((e) => e.reason === 'Started' && e.message === 'Started container worker'))
  const pods = new Set(podViews(o).map((p) => `pod/${p.name}`))
  assert.ok(backoff.every((e) => pods.has(e.object)))
  assert.ok(!workerLogs(o).some((l) => /iznimka/.test(l.text)), 'an OOM kill (SIGKILL) leaves no app log line')
  // RED: errors and retries per second
  const p = createQueueSim({ seed: 42, pFail: 0.3 })
  runFor(p, 30)
  assert.ok(metrics(p).errorRate > 0.3 && p.series.errors.last() > 0 && p.series.retries.last() > 0)
  assert.equal(metrics(createQueueSim()).errorRate, 0)
  // Killing on scale-down; external mode leaves the events to E3
  const k = createQueueSim({ seed: 42 })
  setConsumers(k, 2)
  assert.equal(kubeEvents(k).filter((e) => e.reason === 'Killing').length, 2)
  const x = createQueueSim({ consumerSource: 'external' })
  syncConsumers(x, [{ key: 'w-1', ready: true }])
  crashAllConsumers(x)
  assert.equal(kubeEvents(x).length, 0)
  assert.equal(orderTrace(s, 999_999), null)
})

test('A6: a fix by commit – rolloutConsumers replaces the OOM Pods with a new ReplicaSet (fresh names, RESTARTS 0) within maxSurge', () => {
  const s = createQueueSim(PRESETS['l24-oom-worker'].config)
  runFor(s, 90)
  const before = podViews(s)
  assert.ok(before.every((p) => p.restarts > 0))
  const oldRs = currentReplicaSet(s)
  assert.equal(rolloutConsumers(s), true)
  assert.equal(rolloutView(s)?.oldPods, 3)
  let doneAt: number | null = null
  for (let i = 0; i < 3000 && doneAt === null; i++) {
    tick(s)
    assert.ok(s.consumers.filter((c) => c.status !== 'stopping').length <= 4, 'maxSurge 1')
    if (s.rollout === null) doneAt = s.t
  }
  assert.ok(doneAt !== null && doneAt < 100, `rollout done at ${doneAt}`)
  const after = podViews(s)
  assert.equal(after.length, 3)
  assert.ok(after.every((p) => p.status === 'Running' && p.restarts === 0 && p.replicaSet !== oldRs && !before.some((b) => b.name === p.name)))
  assert.equal(after[0].replicaSet, currentReplicaSet(s))
  assert.ok(hasEvent(s, /^Rollout završen: 3 nova Poda/))
  assert.ok(kubeEvents(s).some((e) => e.reason === 'ScalingReplicaSet' && e.message === `Scaled down replica set ${oldRs} from 1 to 0`))
  const kills = s.totals.oomKills
  runFor(s, 300)
  assert.equal(s.totals.oomKills, kills, 'the new template has no OOM')
  assert.ok(s.ready.size < 20)
  // availability invariants of a healthy rollout
  for (const [maxSurge, maxUnavailable] of [
    [1, 0],
    [0, 1],
    [2, 1],
  ]) {
    const h = createQueueSim({ seed: 7, consumers: 4 })
    runFor(h, 5)
    rolloutConsumers(h, { maxSurge, maxUnavailable })
    while (h.rollout && h.t < 100) {
      tick(h)
      const act = h.consumers.filter((c) => c.status !== 'stopping')
      assert.ok(act.length <= 4 + maxSurge, `total ≤ N + maxSurge (${maxSurge}/${maxUnavailable})`)
      assert.ok(act.filter((c) => c.status === 'running').length >= 4 - maxUnavailable, `running ≥ N − maxUnavailable (${maxSurge}/${maxUnavailable})`)
    }
    assert.equal(h.rollout, null)
    assert.ok(h.consumers.filter((c) => c.status !== 'stopping').every((c) => c.revision === 2), 'old Pods only linger while Terminating')
    checkInvariants(h)
  }
  assert.equal(rolloutConsumers(createQueueSim({ consumerSource: 'external' })), false)
  assert.equal(rolloutConsumers(createQueueSim(), { fault: 'bogus' as ConsumerFault }), false)
})

test('A8: E3 can pass a Pod’s fault through the bridge; faults can target a Pod key; counts tell the UI what happened', () => {
  const s = createQueueSim({ seed: 42, rate: 0, consumerSource: 'external' })
  syncConsumers(s, [
    { key: 'w-a', ready: true, fault: 'oom' },
    { key: 'w-b', ready: true },
  ])
  assert.deepEqual(
    consumerViews(s).map((c) => c.fault),
    ['oom', 'none'],
  )
  assert.equal(setConsumerFault(s, 'w-b', 'slow'), 1)
  assert.equal(setConsumerFault(s, 'nope', 'slow'), 0)
  syncConsumers(s, [
    { key: 'w-a', ready: true, fault: 'none' },
    { key: 'w-b', ready: true },
  ])
  assert.deepEqual(
    consumerViews(s).map((c) => c.fault),
    ['none', 'slow'],
  )
  assert.equal(theory(s).slow, 1)
})

test('A9 / A11: presets – getPreset is typed, createPresetSim fires its script in step(), overrides, drainTrial, a „finished” event', () => {
  const id: PresetId = 'l06-rabbit-crash-after'
  const p = getPreset(id)
  assert.equal(p.script?.length, 1)
  const live = createPresetSim(id)
  for (let i = 0; i < p.runS * 60 + 60; i++) step(live, 1 / 60)
  assert.deepEqual(live.totals, runPreset(id).totals)
  assert.equal(finished(live), true)
  assert.equal(live.events.filter((e) => e.kind === 'finished').length, 1)
  assert.ok(hasEvent(live, /^Kraj scenarija \(30 s\)$/))
  const twice = createPresetSim(id)
  for (let i = 0; i < p.runS * 60; i++) stepWithScript(twice, 1 / 60, p.script)
  assert.deepEqual(twice.totals, live.totals, 'the stored script is not fired twice')
  const k6 = runPreset('l06-cevap-petak-queue', { overrides: { consumers: 6 } })
  assert.equal(Math.round((k6.drain.last?.durationS ?? 0) * 10) / 10, 24.2)
  assert.deepEqual(
    [4, 6, 7, 8].map((k) => Math.round((drainTrial(k)?.durationS ?? 0) * 10) / 10),
    [52.7, 24.2, 17.9, 13],
  )
  assert.equal(drainTrial(0), null)
  const keda = createPresetSim('l18-keda-day', { overrides: { autoscaler: { maxReplicas: 4 } }, stopAtEnd: false })
  assert.deepEqual([keda.config.autoscaler.enabled, keda.config.autoscaler.maxReplicas, keda.stopAtTick], [true, 4, null])
  for (const pid of Object.keys(PRESETS) as PresetId[]) assert.equal(getPreset(pid).id, pid)
})

test('A12: narration – a start line, the crash line says what went to the DLQ, slider drags merge into one row, a live preset moves within 10 s', () => {
  assert.equal(createQueueSim().events[0].text, 'Narudžbe stižu: λ 2/s; 4 potrošača, kapacitet 4/s')
  assert.equal(createQueueSim({ mode: 'direct' }).events[0].text, 'Narudžbe stižu: λ 2/s; 4 radnika API-ja bez reda, kapacitet 4/s')
  assert.equal(createQueueSim({ consumers: 1, consumerFault: 'slow' }).events[0].text, 'Narudžbe stižu: λ 2/s; 1 potrošač, kapacitet 0/s')
  const c = quiet({ consumers: 1, maxDeliveries: 1 })
  publishBatch(c, 1)
  runFor(c, 0.5)
  crashConsumer(c)
  assert.ok(hasEvent(c, /^RabbitMQ: veza zatvorena, nepotvrđene poruke \(1\): 1 u DLQ$/))
  assert.ok(!hasEvent(c, /odmah se vraćaju/))
  const m = createQueueSim()
  for (let v = 5; v <= 12; v++) setConsumers(m, v)
  for (let v = 11; v >= 4; v--) setConsumers(m, v)
  const rows = m.events.filter((e) => e.kind === 'consumers')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].text, 'Broj potrošača: 4 → 12 → 4')
  runFor(m, 2)
  setConsumers(m, 6)
  assert.equal(m.events.filter((e) => e.kind === 'consumers').length, 2, 'a later change is a new row')
  const l = runPreset('l06-cevap-petak-live', 10)
  assert.ok(l.ready.size > 30)
  assert.ok(hasEvent(l, /^Red raste/))
})

test('A13: slowConsumer / repairConsumer / setConsumerFault return what they did (unknown ids are not silent)', () => {
  const s = createQueueSim({ seed: 42 })
  assert.equal(slowConsumer(s), 1)
  assert.equal(slowConsumer(s), 2)
  assert.equal(slowConsumer(s, 1), null, 'already slow')
  assert.deepEqual(
    consumerViews(s).map((c) => c.fault),
    ['slow', 'slow', 'none', 'none'],
  )
  assert.equal(repairConsumer(s, 1), true)
  assert.equal(repairConsumer(s, 99), false)
  assert.equal(setConsumerFault(s, 99, 'slow'), 0)
  assert.equal(setConsumerFault(s, 1, 'bogus' as ConsumerFault), 0)
  assert.equal(setConsumerFault(s, podViews(s)[2].name, 'slow'), 1)
  assert.equal(consumerViews(s)[2].fault, 'slow')
  assert.equal(setConsumerFault(s, 'all', 'none'), 4)
  assert.equal(slowConsumer(createQueueSim({ consumers: 0 })), null)
})

test('A14: Pod names like E3 (<deployment>-<pod-template-hash>-<suffix>), events can name Pods, rows carry the kit PodShape status', () => {
  const s = createQueueSim({ seed: 42, consumers: 2, consumerFault: 'oom', restart: RESTART_CRASHLOOP, consumerNames: 'pod', rate: 4 })
  const seen = new Set<string>()
  for (let i = 0; i < 2000; i++) {
    tick(s)
    for (const p of podViews(s)) {
      seen.add(`${p.status}:${p.shape}`)
      assert.equal(p.replicaSet, currentReplicaSet(s))
    }
  }
  for (const pair of seen) assert.ok(['Running:running', 'CrashLoopBackOff:crash', 'OOMKilled:oom', 'Error:crash', 'ContainerCreating:creating', 'Terminating:terminating'].includes(pair), pair)
  assert.ok(seen.has('CrashLoopBackOff:crash'))
  const names = podViews(s).map((p) => p.name)
  const oom = s.events.filter((e) => e.kind === 'oom')
  assert.ok(oom.length > 0 && oom.every((e) => names.some((n) => e.text === `Pod ${n}: OOMKilled (izlazni kod 137)`)))
  assert.equal(createQueueSim({ podNamePrefix: 'Bad Name!' }).config.podNamePrefix, 'klopa-worker')
  assert.ok(podViews(createQueueSim({ podNamePrefix: 'menza-worker' }))[0].name.startsWith('menza-worker-'))
})

test('A16: fanoutScript – a command goes to one queue and one consumer; an event is copied into every subscriber’s queue', () => {
  const w = fanoutScript({ mode: 'work-queue', messages: 4, consumersPerQueue: 2 })
  const wl = w[w.length - 1]
  assert.deepEqual(wl.queues, ['narudzbe'])
  assert.deepEqual(
    wl.deliveries.map((d) => [d.msg, d.consumer]),
    [
      [1, 1],
      [2, 2],
      [3, 1],
      [4, 2],
    ],
  )
  assert.match(w[1].title, /„Skuhaj narudžbu 42”/)
  assert.ok(w.every((st, i) => i === 0 || st.deliveries.length >= w[i - 1].deliveries.length), 'snapshots accumulate')
  const f = fanoutScript({ mode: 'fanout', messages: 3 })
  const fl = f[f.length - 1]
  assert.deepEqual(fl.queues, ['kuhinja', 'sms', 'analitika'])
  assert.equal(fl.deliveries.length, 9)
  for (const q of fl.queues) assert.deepEqual(fl.deliveries.filter((d) => d.queue === q).map((d) => d.msg), [1, 2, 3])
  assert.match(fl.deliveries[0].label, /^NarudzbaZaprimljena #42$/)
  assert.match(fl.body, /3 događaja → 9 isporuka/)
  const odd = fanoutScript({ mode: 'work-queue', messages: NaN, consumersPerQueue: 0 })
  assert.equal(odd[odd.length - 1].deliveries.length, 3)
  assert.ok(odd[odd.length - 1].deliveries.every((d) => d.consumer === 1))
  assert.match(odd[0].body, /Jedan kuhar uzima poruke redom/)
})

test('stress (review 2): random faults, rollouts, DLQ toggles and broker switches keep every invariant; a healthy system then empties', () => {
  for (const seed of [11, 12, 13, 14]) {
    const s = createQueueSim({ seed, prefetch: 2, pFail: 0.1, pPoison: 0.03, maxQueue: 40, visibilityTimeoutS: 4, consumerTimeoutS: 4, rate: 3, clientRetries: 1, consumerNames: seed % 2 ? 'pod' : 'potrošač' })
    const r = createRng(500 + seed)
    for (let sec = 0; sec < 200; sec++) {
      const k = r.int(0, 11)
      if (k === 0) crashConsumer(s, undefined, r.pick(['before-effect', 'after-effect'] as const))
      else if (k === 1) setConfig(s, { dlqEnabled: r.chance(0.6), broker: r.pick(['rabbitmq', 'sqs'] as const) })
      else if (k === 2) rolloutConsumers(s, { fault: r.pick(['none', 'none', 'slow', 'oom'] as const), maxSurge: r.int(0, 2), maxUnavailable: r.int(0, 2) })
      else if (k === 3) slowConsumer(s)
      else if (k === 4) setConsumers(s, r.int(0, 6))
      else if (k === 5) setConfig(s, { ackMode: r.pick(['manual', 'auto'] as const), retryMode: r.pick(['backoff', 'immediate', 'nack-requeue'] as const) })
      else if (k === 6) publishBatch(s, 15)
      else if (k === 7) publishPoison(s)
      else if (k === 8) setSmsGateway(s, r.pick(['ok', 'slow', 'down'] as const), r.int(1, 5))
      else if (k === 9) setConfig(s, { mode: r.pick(['queue', 'direct'] as const), overflow: r.pick(['drop-head', 'reject-publish'] as const) })
      else if (k === 10) startBurst(s, { rate: 10, durationS: 3 })
      else setConfig(s, { autoscaler: { enabled: r.chance(0.4) } })
      for (let i = 0; i < 100; i++) {
        tick(s)
        if (i % 10 === 0) checkInvariants(s)
      }
    }
    setConfig(s, { rate: 0, mode: 'queue', retryMode: 'backoff', dlqEnabled: true, autoscaler: { enabled: false }, consumers: 4, smsGateway: 'ok' })
    rolloutConsumers(s, { fault: 'none' })
    runFor(s, 3000)
    checkInvariants(s)
    assert.equal(s.little.inSystem, 0, `seed ${seed}: everything accepted has left the system`)
    assert.equal(s.returnsAtHead, 0)
    assert.equal(s.rollout, null)
  }
})
