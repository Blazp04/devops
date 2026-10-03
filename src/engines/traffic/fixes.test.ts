/**
 * E1 Promet – regression tests for the post-lecture engine fixes (wording, 'machine' session store, opt-in
 * failover-window weighting). Run: node --test src/engines/traffic/*.test.ts
 */
import {
  ALGO_NAME,
  MODEL_NOTES,
  WORKLOADS,
  YEAR_CAUSE_LABEL,
  crashServer,
  createTraffic,
  createYear,
  defaultRack,
  finishYear,
  powerOff,
  rackFailure,
  restartServer,
  runUntil,
  runYear,
  stepYear,
  type TrafficConfigInput,
} from './index.ts'
import { assert, describe, test } from './testing.ts'

const rack = (): TrafficConfigInput => ({ seed: 42, mode: 'lb', servers: defaultRack(), workload: 'api' })

describe('wording (post-lecture review)', () => {
  test('the start line uses plural(): „1 zahtjev/s”, „3 zahtjeva/s”, „2,5 zahtjeva/s”', () => {
    const one = createTraffic({ ...rack(), lambda: 1 })
    assert.ok(one.events[0].text.startsWith('Start: 1 zahtjev/s,'), one.events[0].text)
    const three = createTraffic({ ...rack(), lambda: 3 })
    assert.ok(three.events[0].text.startsWith('Start: 3 zahtjeva/s,'), three.events[0].text)
    const half = createTraffic({ ...rack(), lambda: 2.5 })
    assert.ok(half.events[0].text.startsWith('Start: 2,5 zahtjeva/s,'), half.events[0].text)
  })
  test('algorithm names match the lectures („najmanje veza”)', () => {
    assert.equal(ALGO_NAME.lc, 'najmanje veza')
    assert.equal(ALGO_NAME.wlc, 'težinski najmanje veza')
    const s = createTraffic({ ...rack(), lambda: 10, algo: 'lc' })
    assert.ok(s.events[0].text.includes('najmanje veza') && !s.events[0].text.includes('aktivnih'))
  })
  test('neutral entry label, PHP-FPM/Puma note, API workload not presented as klopa-api', () => {
    assert.equal(YEAR_CAUSE_LABEL.entry, 'ulaz')
    assert.ok(MODEL_NOTES.workerPool.includes('Puma s jednom dretvom po procesu'))
    assert.ok(!WORKLOADS.api.description.startsWith('klopa-api'))
  })
})

describe("sessions.store 'machine' (L05: a Redis on each server)", () => {
  // no health checks: the LB keeps the cookie users on their server, so they come back to it after the restart
  const cfg = (store: 'local' | 'machine'): TrafficConfigInput => ({
    ...rack(),
    lambda: 10,
    algo: 'wrr',
    healthCheck: { enabled: false },
    sessions: { enabled: true, store, affinity: 'cookie' },
  })
  test('a process crash or restart keeps the carts on that machine; the local store loses them', () => {
    const local = createTraffic(cfg('local'))
    const machine = createTraffic(cfg('machine'))
    for (const s of [local, machine]) {
      runUntil(s, 20_000)
      crashServer(s, 's3')
      runUntil(s, 40_000)
      restartServer(s, 's2')
      runUntil(s, 60_000)
    }
    assert.ok(local.totals.sessionLost > 0, 'local store: crash wipes the sessions')
    assert.equal(machine.totals.sessionLost, 0, 'machine store survives a process crash and a restart')
    assert.ok(machine.clients.some((c) => c.session.cart > 5), 'carts keep growing')
  })
  test('powering the machine off wipes the machine store', () => {
    const s = createTraffic(cfg('machine'))
    runUntil(s, 20_000)
    const onS3 = s.clients.filter((c) => c.session.home === 's3')
    assert.ok(onS3.length > 0)
    crashServer(s, 's3')
    assert.ok(onS3.every((c) => c.session.home === 's3' && !c.session.wiped), 'a crash keeps the machine store')
    powerOff(s, 's3')
    assert.ok(onS3.every((c) => c.session.home === null && c.session.wiped), 'power off wipes it')
  })
})

describe('L03 year: opt-in failover-window weighting', () => {
  test("default 'full' is unchanged: same report as before the option existed", () => {
    const a = runYear({ seed: 42, detectionMin: 30 })
    const b = runYear({ seed: 42, detectionMin: 30, detectionWeight: 'full' })
    assert.deepEqual(a, b)
    assert.equal(createYear().cfg.detectionWeight, 'full')
    assert.equal(createYear({ detectionWeight: 'nonsense' as 'share' }).cfg.detectionWeight, 'full')
  })
  test("'share' counts only the dead server's share: more servers no longer mean more failover downtime", () => {
    const det = (count: number, w: 'full' | 'share') => {
      let sum = 0
      for (let seed = 1; seed <= 20; seed++) sum += runYear({ seed, detectionMin: 30, detectionWeight: w, app: { count, availability: 0.99, capacityShare: 1 } }).downByCause.detection
      return sum / 20
    }
    const full2 = det(2, 'full')
    const full6 = det(6, 'full')
    const share2 = det(2, 'share')
    const share6 = det(6, 'share')
    assert.ok(full6 > full2 * 2, `full: 6 servers pay ~3× the windows (${full2} → ${full6})`)
    assert.ok(share2 < full2 && share6 < full6)
    assert.ok(share6 < full6 / 4, `share: 6 servers ≈ 1/6 of the window each (${share6} vs ${full6})`)
  })
  test('rackFailure skips the failover window by default; { countDetection: true } pays it on the next hour', () => {
    const run = (count: boolean) => {
      const y = createYear({ seed: 42, detectionMin: 30, app: { count: 2, availability: 1, capacityShare: 1 }, entry: 1, db: 1 })
      stepYear(y, 100 / y.cfg.hoursPerSecond)
      rackFailure(y, { countDetection: count })
      return finishYear(y)
    }
    assert.equal(run(false).downByCause.detection, 0)
    assert.equal(run(true).downByCause.detection, 0.5, '30 min window, one forced failure')
  })
})
