/// <reference types="node" />
/**
 * UI-facing API of E2 „Red”: goal selectors, narration, chart samples, kubectl-style views, L24 impact,
 * the external Pod bridge (E3) and the Kafka DeepDive helper. Run: node --test src/engines/queue/*.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CEVAP_PETAK_PROFILE,
  CEVAP_PETAK_SEED,
  PRESETS,
  RESTART_CRASHLOOP,
  burstState,
  consumerViews,
  controlsView,
  crashConsumer,
  createQueueSim,
  dayProfile,
  drainTerminations,
  fnv1a32,
  flightsView,
  impact,
  kafkaPartition,
  kafkaStepperScript,
  killConsumer,
  markTotals,
  metrics,
  orderOutcome,
  podSuffix,
  podViews,
  publishBatch,
  publishPoison,
  queueMetric,
  rangeAssign,
  rateAt,
  runFor,
  runPreset,
  setConfig,
  setConsumerFault,
  setConsumers,
  setFlightDuration,
  startBurst,
  syncConsumers,
  totalsSince,
  type QueueState,
} from './index.ts'

const hasEvent = (s: QueueState, re: RegExp) => s.events.some((e) => re.test(e.text))

test('orderOutcome + burstState: „Ćevap-petak bez izgubljene narudžbe” cannot be passed by doing nothing (review)', () => {
  const ok = runPreset('l06-cevap-petak-queue')
  const b = burstState(ok)
  assert.equal(b.happened, true)
  assert.equal(b.source, 'profile')
  assert.equal(b.startedAt, 30)
  assert.equal(b.lastEndedAt, 40)
  assert.equal(b.ordersDuring, 145)
  const o = orderOutcome(ok)
  assert.equal(o.orders, 445)
  assert.ok(o.pending <= 8, `pending ${o.pending} (steady 2/s keeps a few in flight)`)
  assert.equal(o.failed + o.dropped + o.inDlq + o.lostAutoAck, 0)
  // 0 consumers: nothing lost, nothing cooked – the old recipe `lost === 0` passed this
  const idle = createQueueSim({ ...PRESETS['l06-cevap-petak-queue'].config, consumers: 0 })
  runFor(idle, 150)
  assert.equal(metrics(idle).lost, 0)
  assert.equal(orderOutcome(idle).allServed, false)
  assert.equal(orderOutcome(idle).pending, 445)
  // max-length 50 with drop-head: uncooked orders go to the DLQ by overflow
  const capped = createQueueSim({ ...PRESETS['l06-cevap-petak-queue'].config, maxQueue: 50 })
  runFor(capped, 150)
  const oc = orderOutcome(capped)
  assert.equal(metrics(capped).lost, 0)
  assert.equal(oc.allServed, false)
  assert.ok(oc.dlqByMaxLength > 0 && oc.dlqByDeliveryLimit === 0)
  // a quiet tail: every order served
  const done = createQueueSim({ ...PRESETS['l06-cevap-petak-queue'].config, rate: 0 })
  runFor(done, 120)
  const od = orderOutcome(done)
  assert.equal(od.allServed, true)
  assert.equal(od.cooked, od.orders)
  // a manual „Nalet” is tracked too
  const m = createQueueSim({ seed: 1 })
  runFor(m, 5)
  startBurst(m, { rate: 10, durationS: 3 })
  assert.equal(burstState(m).happened, false)
  runFor(m, 3.5)
  const mb = burstState(m)
  assert.equal(mb.happened, true)
  assert.equal(mb.source, 'manual')
  assert.ok(mb.ordersDuring > 15)
  assert.ok(hasEvent(m, /^Nalet završio: \d+ narudžb/))
})

test('totalsSince: goals that must ignore earlier experiments (duplicates before the student turned idempotency on)', () => {
  const s = createQueueSim({ seed: 42, rate: 0, serviceDist: 'fixed', consumers: 1 })
  publishBatch(s, 1)
  runFor(s, 0.2)
  crashConsumer(s, undefined, 'after-effect')
  runFor(s, 5)
  assert.equal(s.totals.duplicates, 1)
  setConfig(s, { idempotent: true })
  const mark = markTotals(s)
  publishBatch(s, 1)
  runFor(s, 0.2)
  crashConsumer(s, undefined, 'after-effect')
  runFor(s, 5)
  const since = totalsSince(s, mark)
  assert.equal(since.duplicates, 0)
  assert.equal(since.alreadyCooked, 1)
  assert.equal(since.completed, 1)
  assert.equal(s.totals.duplicates, 1, 'the cumulative counter is unchanged')
})

test('narration: the queue incident run tells the story (burst, growth, end of burst, drained) (review)', () => {
  const s = runPreset('l06-cevap-petak-queue')
  const texts = s.events.map((e) => e.text)
  assert.deepEqual(texts, [
    'Narudžbe stižu: λ 2/s; 4 potrošača, kapacitet 4/s',
    'Nalet: 15 narudžbi/s tijekom 10 s',
    'Red raste: λ 15/s > kμ 4/s (+11 poruka/s)',
    'Nalet završio: 145 narudžbi za 10 s; λ opet 2/s',
    'Nalet obrađen do kraja: 145 narudžbi, nijedna izgubljena',
    'Red ispražnjen: vrh 113 poruka, prazan 52,7 s nakon vrha',
  ])
  const r = runPreset('l06-sms-down-nack')
  assert.ok(hasEvent(r, /nije obrađena \(SMS-gateway ne odgovara; pokušaj 1\/5\)/), 'the retry line names the cause')
  const k = runPreset('l18-keda-day')
  assert.ok(hasEvent(k, /Nema aktivnih potrošača – poruke čekaju u redu/), 'KEDA at 0 with a message waiting')
})

test('chart series include λ, kμ and the oldest age; actions update the newest sample while paused (review)', () => {
  const s = createQueueSim({ seed: 42, profile: CEVAP_PETAK_PROFILE })
  runFor(s, 35)
  assert.equal(s.series.lambda.last(), 15)
  assert.equal(s.series.capacity.last(), 4)
  assert.ok(s.series.oldestAgeS.last() > 0)
  const before = s.series.ready.values.length
  publishBatch(s, 100) // paused: no tick
  assert.equal(s.series.ready.values.length, before)
  assert.equal(s.series.ready.last(), s.ready.size)
  setConsumers(s, 8)
  assert.equal(s.series.replicas.last(), 8)
})

test('setFlightDuration: hops last longer for a fast UI without changing the model (review)', () => {
  const a = createQueueSim({ seed: 3 })
  const b = createQueueSim({ seed: 3 })
  setFlightDuration(b, 1.2)
  runFor(a, 20)
  runFor(b, 20)
  assert.deepEqual(a.totals, b.totals)
  // chained hops: a hop that queues behind the previous one of the same message is shortened, never below ¼ hop
  assert.ok(b.flights.every((f) => f.dur <= 1.2 + 1e-9 && f.dur >= 0.3 - 1e-9))
  assert.ok(b.flights.some((f) => Math.abs(f.dur - 1.2) < 1e-9))
  assert.ok(b.flights.length > a.flights.length)
  assert.ok(flightsView(b).every((f) => f.progress >= 0 && f.progress <= 1))
  setFlightDuration(b, NaN)
  assert.equal(b.flightS, 0.3)
})

test('controlsView: controls that have no effect are disabled with a reason (review)', () => {
  const s = createQueueSim({ broker: 'sqs' })
  const c = controlsView(s)
  assert.equal(c.maxQueue.enabled, false)
  assert.equal(c.maxQueue.reason, 'SQS nema najveću duljinu reda')
  assert.equal(c.seed.enabled, false)
  assert.equal(c.consumers.enabled, true)
  assert.equal(c.ackTimeout.name, 'rok vidljivosti (visibility timeout)')
  setConfig(s, { autoscaler: { enabled: true } })
  assert.equal(controlsView(s).consumers.enabled, false)
  assert.equal(controlsView(s).consumers.value, 4)
  const day = createQueueSim(PRESETS['l18-keda-day'].config)
  assert.equal(controlsView(day).rate.enabled, false)
})

test('L24: orders carry a user; impact counts failed orders, distinct users and MTTR (review)', () => {
  // direct mode with 8 API workers: no steady-state loss (Erlang B(8, 2) ≈ 0,09 %), only the burst fails orders
  const s = createQueueSim({ seed: 42, mode: 'direct', consumers: 8, profile: CEVAP_PETAK_PROFILE, users: 50 })
  runFor(s, 150)
  const im = impact(s)
  assert.equal(im.failedOrders, s.totals.ordersFailed)
  assert.ok(im.failedOrders > 20)
  assert.ok(im.affectedUsers > 10 && im.affectedUsers <= 50)
  assert.ok(im.firstErrorAt !== null && im.firstErrorAt >= 30 && im.firstErrorAt < 32, `first ${im.firstErrorAt}`)
  assert.ok(im.lastErrorAt !== null && im.lastErrorAt <= 41)
  assert.equal(im.recoveredAt, im.lastErrorAt, 'quiet for 30 s → recovered')
  assert.ok(im.mttrS !== null && im.mttrS > 5 && im.mttrS < 11, `mttr ${im.mttrS}`)
  assert.equal(impact(s, { sinceS: 140 }).failedOrders, 0)
  assert.equal(impact(s, { quietS: 1000 }).recoveredAt, null)
  // queue mode: messages waiting past the SLO already count, and recovery waits for them
  const q = runPreset('l24-oom-worker')
  const qi = impact(q)
  assert.ok(qi.failedOrders > 50)
  assert.equal(qi.recoveredAt, null)
  const ok = runPreset('l06-steady-queue')
  assert.equal(impact(ok).failedOrders, ok.totals.lateOrders)
})

test('podViews: kubectl-style rows with READY, STATUS, RESTARTS and the real back-off wait (review)', () => {
  const s = createQueueSim({ seed: 42, consumers: 2, consumerFault: 'oom', restart: RESTART_CRASHLOOP, rate: 5 })
  let sawLoop = false
  for (let i = 0; i < 3000; i++) {
    runFor(s, 0.01)
    for (const p of podViews(s)) {
      // like E3 and a real Deployment: <deployment>-<pod-template-hash>-<suffix>
      assert.match(p.name, /^klopa-worker-[bcdfghjklmnpqrstvwxz2456789]{6,10}-[bcdfghjklmnpqrstvwxz2456789]{5}$/)
      assert.equal(p.name.startsWith(`${p.replicaSet}-`), true)
      assert.ok(Number.isFinite(p.waitRealS))
      if (p.status === 'CrashLoopBackOff') {
        sawLoop = true
        assert.equal(p.ready, '0/1')
        assert.ok(Math.abs(p.waitRealS - p.waitS * 10) < 1e-9)
      }
    }
  }
  assert.ok(sawLoop)
  const rows = podViews(s, { namePrefix: 'worker' })
  assert.ok(rows.every((r) => r.name.startsWith('worker-') && r.restarts >= 1 && r.lastTermination?.exitCode === 137))
  assert.equal(podSuffix(1), podSuffix(1))
  assert.notEqual(podSuffix(1), podSuffix(2))
})

test('external consumers: E3 Pods drive E2 workers; OOM kills are reported back; KEDA reads queueMetric (review)', () => {
  const s = createQueueSim({ seed: 42, rate: 0, serviceDist: 'fixed', consumerSource: 'external', consumers: 4, autoscaler: { enabled: true } })
  assert.equal(s.consumers.length, 0, 'no internal workers in external mode')
  publishBatch(s, 10)
  runFor(s, 5)
  assert.equal(s.consumers.length, 0, 'the internal autoscaler is off: E3 owns scaling')
  assert.equal(queueMetric(s, 'ready+unacked'), 10)
  syncConsumers(s, [
    { key: 'klopa-worker-a', ready: false },
    { key: 'klopa-worker-b', ready: true },
  ])
  assert.deepEqual(
    consumerViews(s).map((c) => [c.key, c.status]),
    [
      ['klopa-worker-a', 'starting'],
      ['klopa-worker-b', 'idle'],
    ],
  )
  runFor(s, 30)
  assert.equal(consumerViews(s)[0].status, 'starting', 'stays starting until E3 says ready')
  assert.equal(s.totals.completed, 10, 'the ready Pod consumed everything')
  syncConsumers(s, [
    { key: 'klopa-worker-a', ready: true },
    { key: 'klopa-worker-b', ready: true },
  ])
  publishBatch(s, 10)
  runFor(s, 0.5)
  assert.equal(s.consumers.filter((c) => c.job).length, 2)
  // E3 decides a fault: kill a worker; it stays down until E3 reports the restarted container ready
  assert.equal(killConsumer(s, 'klopa-worker-a', 'OOMKilled'), true)
  assert.equal(killConsumer(s, 'nope'), false)
  assert.equal(drainTerminations(s).length, 0, 'not echoed back – E3 already knows')
  runFor(s, 60)
  assert.equal(s.consumers[0].status, 'crashed')
  assert.equal(consumerViews(s)[0].waitS, 0)
  syncConsumers(s, [
    { key: 'klopa-worker-a', ready: true },
    { key: 'klopa-worker-b', ready: true },
  ])
  assert.equal(s.consumers[0].status, 'running')
  assert.equal(s.consumers[0].restartCount, 1)
  // E2's own fault (memory limit) kills the container → reported for E3's kubelet
  setConsumerFault(s, 'all', 'oom')
  publishBatch(s, 4)
  runFor(s, 2)
  const term = drainTerminations(s)
  assert.ok(term.length >= 1)
  assert.ok(term.every((t) => t.reason === 'OOMKilled' && t.exitCode === 137 && t.key !== null))
  assert.equal(drainTerminations(s).length, 0, 'cleared')
  // a Pod that disappears is stopped gracefully; setConsumers is ignored
  setConsumerFault(s, 'all', 'none')
  syncConsumers(s, [{ key: 'klopa-worker-b', ready: true, terminating: true }])
  runFor(s, 3)
  assert.equal(s.consumers.length, 0)
  setConsumers(s, 5)
  assert.equal(s.consumers.length, 0)
  // a running worker reported not ready lost its process
  syncConsumers(s, [{ key: 'klopa-worker-c', ready: true }])
  publishBatch(s, 1)
  runFor(s, 0.1)
  syncConsumers(s, [{ key: 'klopa-worker-c', ready: false }])
  assert.equal(s.consumers[0].status, 'crashed')
  // internal mode ignores the bridge
  const internal = createQueueSim()
  syncConsumers(internal, [{ key: 'x', ready: true }])
  assert.equal(internal.consumers.length, 4)
})

test('dayProfile stretches the compressed day; the night grows with it', () => {
  const p = dayProfile(1200)
  const s = createQueueSim({ profile: p })
  assert.equal(rateAt(s, 100), 0)
  assert.equal(rateAt(s, 460), 6)
  assert.equal(rateAt(s, 1000), 0)
  assert.equal(rateAt(s, 1200 + 460), 6)
  assert.equal(rateAt(createQueueSim({ profile: dayProfile(NaN) }), 115), 6)
})

test('Kafka DeepDive: FNV-1a partitions, range assignment, idle consumers beyond P, lag = end − committed, replay', () => {
  assert.equal(fnv1a32(''), 0x811c9dc5)
  assert.equal(fnv1a32('a'), 0xe40c292c)
  assert.equal(kafkaPartition('korisnik-1', 3), fnv1a32('korisnik-1') % 3)
  assert.equal(kafkaPartition('x', 0), 0)
  assert.deepEqual(rangeAssign(3, 2), [[0, 1], [2]])
  assert.deepEqual(rangeAssign(3, 4), [[0], [1], [2], []])
  const steps = kafkaStepperScript()
  assert.equal(steps.length, 6)
  const first = steps[0]
  assert.equal(first.records.length, 12)
  assert.equal(
    first.end.reduce((a, b) => a + b, 0),
    12,
  )
  for (const r of first.records) assert.equal(r.partition, kafkaPartition(r.key, 3))
  // per-key order: within a partition a key's sequence numbers increase with the offset
  for (let p = 0; p < 3; p++) {
    const last = new Map<string, number>()
    for (const r of first.records.filter((x) => x.partition === p).sort((a, b) => a.offset - b.offset)) {
      assert.ok((last.get(r.key) ?? 0) < r.seq)
      last.set(r.key, r.seq)
    }
  }
  const hot = first.records.filter((r) => r.key === 'korisnik-1').length
  assert.ok(hot >= 4, `hot key share: ${hot}/12`)
  for (const st of steps) for (let p = 0; p < 3; p++) assert.equal(st.lag[p], st.end[p] - st.committed[p])
  assert.ok(steps[2].lag.some((l) => l > 0) && steps[2].analyticsCommitted.every((c, p) => c === steps[2].end[p]))
  assert.ok(steps[3].reprocessed > 0)
  assert.deepEqual(steps[4].committed, [0, 0, 0])
  assert.deepEqual(steps[5].idleConsumers, [3])
  assert.deepEqual(kafkaStepperScript({ seed: 7 }), kafkaStepperScript({ seed: 7 }))
  assert.deepEqual(kafkaStepperScript({ partitions: 1, consumers: 3 })[1].idleConsumers, [1, 2])
})

test('the incident seed is exported with the profile that reproduces the L06 card', () => {
  assert.equal(CEVAP_PETAK_SEED, 36343)
  assert.equal(PRESETS['l06-cevap-petak-direct'].card.seed, CEVAP_PETAK_SEED)
  const p = publishPoison(createQueueSim())
  assert.equal(p, 1)
})
