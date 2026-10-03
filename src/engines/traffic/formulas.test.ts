/** Closed-form models (sim-models §A2, §A5, §C). Run: node --test src/engines/traffic/*.test.ts */
import {
  NINES,
  amdahl,
  amdahlMax,
  availabilityFromMtbf,
  cacheAside,
  downtime,
  erlangB,
  erlangC,
  kOfN,
  littleL,
  mm1Number,
  mm1WaitFactor,
  mmc,
  mmcWaitFactor,
  mtbfFor,
  parallelAvailability,
  probAnyDown,
  seriesAvailability,
  sharedBottleneck,
  usl,
  uslPeak,
} from './formulas.ts'
import { assert, describe, near, test } from './testing.ts'

describe('queueing', () => {
  test('M/M/1 W/S = 1/(1−ρ): 2× at 0.5, 3.3× at 0.7, 5× at 0.8, 10× at 0.9, 20× at 0.95, 100× at 0.99', () => {
    near(mm1WaitFactor(0.5), 2, 1e-9)
    near(mm1WaitFactor(0.7), 3.333, 0.001)
    near(mm1WaitFactor(0.8), 5, 1e-9)
    near(mm1WaitFactor(0.9), 10, 1e-9)
    near(mm1WaitFactor(0.95), 20, 1e-9)
    near(mm1WaitFactor(0.99), 100, 1e-6)
    assert.equal(mm1WaitFactor(1), Infinity)
    assert.equal(mm1WaitFactor(1.5), Infinity)
    assert.ok(Number.isNaN(mm1WaitFactor(NaN)))
    assert.ok(Number.isNaN(mm1WaitFactor(-0.1)))
    near(mm1Number(0.5), 1, 1e-9)
    assert.equal(mm1Number(1), Infinity)
  })
  test('Erlang B: c = 4, A = 2 (50 % utilisation) loses 9.5 %; A = 3 loses 20.6 %', () => {
    near(erlangB(4, 2), 0.095, 0.0005)
    near(erlangB(4, 3), 0.206, 0.0005)
    assert.equal(erlangB(0, 2), 1)
    assert.equal(erlangB(4, 0), 0)
    assert.ok(Number.isNaN(erlangB(4, NaN)))
  })
  test('M/M/c (Erlang C), c = 4, μ = 1/s: W = 1.09 / 1.51 / 2.48 / 5.46 s at ρ 0.5 / 0.75 / 0.875 / 0.95', () => {
    near(mmc(4, 2, 1).w, 1.09, 0.005)
    near(mmc(4, 3, 1).w, 1.51, 0.005)
    near(mmc(4, 3.5, 1).w, 2.48, 0.005)
    near(mmc(4, 3.8, 1).w, 5.46, 0.005)
    near(mmcWaitFactor(4, 0.95), 5.46, 0.005)
    assert.equal(mmc(4, 4, 1).w, Infinity)
    assert.equal(erlangC(4, 5), 1)
    assert.ok(Number.isNaN(mmc(0, 1, 1).w))
    assert.ok(Number.isNaN(mmc(4, 1, 0).w))
    near(mmcWaitFactor(1, 0.9), mm1WaitFactor(0.9), 1e-9, 'c = 1 is M/M/1')
  })
  test("Little's law", () => {
    assert.equal(littleL(10, 0.5), 5)
    assert.ok(Number.isNaN(littleL(NaN, 1)))
  })
})

describe('availability', () => {
  test('A = MTBF/(MTBF+MTTR) and back', () => {
    near(availabilityFromMtbf(396, 4), 0.99, 1e-12)
    near(mtbfFor(0.99, 4), 396, 1e-9)
    assert.equal(mtbfFor(1, 4), Infinity)
    assert.ok(Number.isNaN(availabilityFromMtbf(0, 0)))
  })
  test('series 2 × 99 % = 98.01 %; parallel 2 × 99 % = 99.99 %, 3 × = 99.9999 %', () => {
    near(seriesAvailability([0.99, 0.99]), 0.9801, 1e-12)
    near(parallelAvailability([0.99, 0.99]), 0.9999, 1e-12)
    near(parallelAvailability([0.99, 0.99, 0.99]), 0.999999, 1e-12)
    assert.equal(seriesAvailability([]), 1)
    assert.equal(parallelAvailability([]), 0)
    assert.equal(seriesAvailability([NaN]), 0)
  })
  test('LB 99.99 % × app pair (2 × 99 %) × DB 99.9 % ≈ 99.88 %', () => {
    near(seriesAvailability([0.9999, parallelAvailability([0.99, 0.99]), 0.999]), 0.9988, 0.00005)
  })
  test('10 servers at 99 %: at least one is down ≈9.6 % of the time', () => {
    near(probAnyDown(10, 0.99), 0.0956, 0.0001)
    assert.equal(probAnyDown(0, 0.99), 0)
  })
  test('k of n: need 2 of 2 = series, 1 of 2 = parallel', () => {
    near(kOfN(2, 2, 0.99), 0.9801, 1e-12)
    near(kOfN(1, 2, 0.99), 0.9999, 1e-12)
    assert.equal(kOfN(0, 2, 0.5), 1)
    assert.equal(kOfN(3, 2, 0.99), 0)
  })
  test('downtime table: 99 % 87.6 h/yr (7.2 h/30 d), 99.9 % 8.76 h (43.2 min), 99.99 % 52.6 min (4.3 min), 99.999 % 5.3 min (26 s)', () => {
    near(downtime(0.99).perYearH, 87.6, 1e-9)
    near(downtime(0.99).per30DaysMin / 60, 7.2, 1e-9)
    near(downtime(0.999).perYearH, 8.76, 1e-9)
    near(downtime(0.999).per30DaysMin, 43.2, 1e-9)
    near(downtime(0.9999).perYearMin, 52.56, 1e-6)
    near(downtime(0.9999).per30DaysMin, 4.32, 1e-6)
    near(downtime(0.99999).perYearMin, 5.256, 1e-6)
    near(downtime(0.99999).per30DaysMin * 60, 25.92, 1e-6)
    assert.deepEqual([...NINES], [0.99, 0.999, 0.9999, 0.99999])
    assert.equal(downtime(NaN).perYearH, 8760)
  })
})

describe('scaling', () => {
  test('Amdahl p = 0.95: max 20×; S(1) = 1', () => {
    near(amdahl(1, 0.95), 1, 1e-12)
    near(amdahlMax(0.95), 20, 1e-9)
    assert.ok(amdahl(1000, 0.95) < 20)
    assert.equal(amdahlMax(1), Infinity)
    assert.ok(Number.isNaN(amdahl(0, 0.95)))
  })
  test('USL α 0.05, β 0.001: peak at N ≈ 31, throughput falls after it', () => {
    const peak = uslPeak(0.05, 0.001)
    near(peak, 30.8, 0.05)
    assert.ok(usl(31, 0.05, 0.001) > usl(60, 0.05, 0.001))
    assert.ok(usl(31, 0.05, 0.001) > usl(10, 0.05, 0.001))
    assert.equal(uslPeak(0.05, 0), Infinity)
  })
  test('shared DB caps throughput', () => {
    assert.deepEqual(sharedBottleneck(2, 10, 50), { throughput: 20, bottleneck: 'app' })
    assert.deepEqual(sharedBottleneck(10, 10, 50), { throughput: 50, bottleneck: 'db' })
    assert.deepEqual(sharedBottleneck(NaN, 10, 50), { throughput: 0, bottleneck: 'app' })
  })
})

describe('cache-aside (L05)', () => {
  test('h 0.9, cache 1 ms, DB 20 ms → 3 ms average, 10 % of the load reaches the DB', () => {
    const r = cacheAside(0.9, 1, 20, 100)
    near(r.avgMs, 3, 1e-9)
    near(r.dbLoad, 10, 1e-9)
    assert.deepEqual(cacheAside(NaN, 1, 20, 1), { avgMs: 21, dbLoad: 1 })
  })
})
