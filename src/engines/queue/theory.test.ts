/// <reference types="node" />
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRng } from '../../kit/sim/math.ts'
import { backoffWindowS, drainTimeS, erlangB, erlangC, fullJitterS, growthPerS, hpaDesiredReplicas, littleL, mm1, mmc, mmcSojournCdf, mmcSojournQuantile } from './theory.ts'
import { formatDuration, sanitizeConfig, DEFAULT_CONFIG, TIMINGS, timingLabel, mergeConfig } from './config.ts'

const close = (a: number, b: number, tol: number, msg?: string) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} ≉ ${b} (±${tol})`)

test('Erlang B: c=4, A=2 → 9,5 %; A=3 → 20,6 %; c=8, A=4 → 3,0 % (sim-models C)', () => {
  close(erlangB(4, 2), 0.095, 0.0005)
  close(erlangB(4, 3), 0.206, 0.0005)
  close(erlangB(8, 4), 0.03, 0.0005)
  close(erlangB(4, 8), 0.5746, 0.0005) // slow SMS: 1 s + 3 s per request at 2/s
})

test('Erlang B / C edge cases: no load, no servers, NaN', () => {
  assert.equal(erlangB(4, 0), 0)
  assert.equal(erlangB(0, 2), 1)
  assert.equal(erlangB(NaN, NaN), 0)
  assert.equal(erlangC(4, 0), 0)
  assert.equal(erlangC(4, 4), 1)
  assert.equal(erlangC(0, 1), 1)
  assert.ok(erlangC(4, 2) > erlangB(4, 2)) // waiting is likelier than blocking
})

test('M/M/4 with μ = 1/s: W = 1,09 / 1,51 / 2,48 / 5,46 s at ρ 0,5 / 0,75 / 0,875 / 0,95', () => {
  close(mmc(4, 2, 1).w, 1.09, 0.005)
  close(mmc(4, 3, 1).w, 1.51, 0.005)
  close(mmc(4, 3.5, 1).w, 2.48, 0.005)
  close(mmc(4, 3.8, 1).w, 5.46, 0.005)
  const r = mmc(4, 2, 1)
  close(r.l, littleL(2, r.w), 1e-12, 'Little')
  close(r.rho, 0.5, 1e-12)
  assert.equal(r.stable, true)
})

test('M/M/1: W/S = 2×, 5×, 10×, 20×, 100× at ρ 0,5 / 0,8 / 0,9 / 0,95 / 0,99', () => {
  for (const [rho, mult] of [
    [0.5, 2],
    [0.8, 5],
    [0.9, 10],
    [0.95, 20],
    [0.99, 100],
  ]) {
    close(mm1(rho, 1).w, mult, 1e-6, `ρ ${rho}`)
  }
})

test('M/M/c is unstable for ρ ≥ 1, zero servers or zero service rate; λ = 0 is trivially stable', () => {
  for (const r of [mmc(4, 4, 1), mmc(4, 5, 1), mmc(0, 1, 1), mmc(4, 1, 0)]) {
    assert.equal(r.stable, false)
    assert.equal(r.w, Infinity)
  }
  const idle = mmc(4, 0, 1)
  assert.equal(idle.stable, true)
  assert.equal(idle.l, 0)
  assert.equal(mmc(0, 0, 1).rho, 0)
  assert.equal(mmc(NaN, NaN, NaN).rho, 0)
})

test('drain time = backlog / (kμ − λ): 110 / (4 − 2) = 55 s; ∞ when kμ ≤ λ', () => {
  assert.equal(drainTimeS(110, 4, 1, 2), 55)
  assert.equal(drainTimeS(70, 8, 1, 2), 70 / 6)
  assert.equal(drainTimeS(10, 2, 1, 2), Infinity)
  assert.equal(drainTimeS(10, 0, 1, 0), Infinity)
  assert.equal(drainTimeS(0, 0, 1, 5), 0)
  assert.equal(drainTimeS(NaN, 4, 1, 2), 0)
  assert.equal(growthPerS(4, 1, 5), 1)
  assert.equal(growthPerS(4, 1, 3), 0)
})

test('full jitter: random(0, min(cap, base·2ⁿ)) with base 0,5 s, cap 30 s', () => {
  assert.equal(backoffWindowS(1, 0.5, 30), 1)
  assert.equal(backoffWindowS(4, 0.5, 30), 8)
  assert.equal(backoffWindowS(10, 0.5, 30), 30)
  assert.equal(backoffWindowS(-1, 0.5, 30), 0.5)
  assert.equal(backoffWindowS(NaN, 0.5, 30), 0.5)
  const rng = createRng(1)
  let max = 0
  let sum = 0
  for (let i = 0; i < 5000; i++) {
    const d = fullJitterS(rng, 3, 0.5, 30)
    assert.ok(d >= 0 && d < 4)
    max = Math.max(max, d)
    sum += d
  }
  assert.ok(max > 3.9, 'covers the whole window')
  close(sum / 5000, 2, 0.1, 'mean = window / 2')
})

test('HPA external AverageValue: ceil(metric / target) unless within 10 % tolerance', () => {
  assert.deepEqual(hpaDesiredReplicas(45, 10, 3).desired, 5)
  assert.equal(hpaDesiredReplicas(31, 10, 3).desired, 3) // ratio 1,033 → within tolerance
  assert.equal(hpaDesiredReplicas(31, 10, 3).withinTolerance, true)
  assert.equal(hpaDesiredReplicas(34, 10, 3).desired, 4) // ratio 1,133
  assert.equal(hpaDesiredReplicas(0, 10, 4).desired, 0)
  assert.equal(hpaDesiredReplicas(30, 10, 3).desired, 3)
  assert.equal(hpaDesiredReplicas(5, 10, 0).desired, 1)
  assert.equal(hpaDesiredReplicas(5, 0, 1).desired, 5) // target ≤ 0 → treated as 1
  assert.equal(hpaDesiredReplicas(NaN, 10, 2).desired, 0)
})

test('compressed timings carry both values; labels read „60 s (sim) · stvarno: 30 min”', () => {
  assert.equal(TIMINGS.rabbitConsumerTimeout.real, 1800)
  assert.equal(TIMINGS.sqsVisibilityTimeout.real, 30)
  assert.equal(TIMINGS.kedaPollingInterval.real, 30)
  assert.equal(TIMINGS.kedaCooldownPeriod.real, 300)
  assert.equal(TIMINGS.hpaSyncPeriod.real, 15)
  assert.equal(TIMINGS.crashLoopBackoffCap.real, 300)
  assert.equal(timingLabel(TIMINGS.rabbitConsumerTimeout), '60 s (sim) · stvarno: 30 min')
  assert.equal(TIMINGS.rabbitConsumerTimeout.label, '60 s (sim) · stvarno: 30 min')
  assert.equal(timingLabel(TIMINGS.sqsVisibilityTimeout), '30 s')
  assert.equal(timingLabel(TIMINGS.hpaSyncPeriod), '1,5 s (sim) · stvarno: 15 s')
  // review: an uncompressed value that differs from the default is not „(sim) · stvarno”
  assert.equal(TIMINGS.sqsVisibilityTimeout.compressed, false)
  assert.equal(timingLabel(TIMINGS.sqsVisibilityTimeout, 2), '2 s · zadano: 30 s')
  // review (2nd): only that timer is compressed – no proportional „≈ 5 min stvarno”, just the real default
  assert.equal(timingLabel(TIMINGS.rabbitConsumerTimeout, 10), '10 s (sim) · skraćeno; stvarno zadano: 30 min')
  // review: E3's Pod start-up is a model value, never „stvarno”
  assert.equal(TIMINGS.workerPodStartup.realKind, 'model')
  assert.equal(timingLabel(TIMINGS.workerPodStartup), '2 s (sim) · model klastera (E3): 12 s')
  for (const t of Object.values(TIMINGS)) {
    assert.equal(t.simValue, t.sim)
    assert.equal(t.realValue, t.real)
    assert.equal(t.compressed, t.sim !== t.real)
    assert.ok(t.source.length > 0)
  }
  assert.equal(formatDuration(43200), '12 h')
  assert.equal(formatDuration(90), '1,5 min')
  assert.equal(formatDuration(Infinity), '∞')
})

test('sanitizeConfig clamps NaN / negative / absurd values to safe ranges', () => {
  const c = sanitizeConfig(
    mergeConfig(DEFAULT_CONFIG, {
      rate: NaN,
      consumers: -3,
      prefetch: 0,
      pFail: 7,
      pPoison: -1,
      maxDeliveries: 0,
      serviceMeanS: 0,
      maxQueue: -5,
      visibilityTimeoutS: -1,
      consumerTimeoutS: NaN,
      retryMode: 'bogus' as never,
      smsOnFailure: 'bogus' as never,
      users: 0,
      restart: { realPerSim: NaN, immediateFirst: 'yes' as never },
      autoscaler: { minReplicas: 5, maxReplicas: 2, targetQueueLength: 0 },
    }),
  )
  assert.equal(c.rate, DEFAULT_CONFIG.rate)
  assert.equal(c.consumers, 0)
  assert.equal(c.prefetch, 1)
  assert.equal(c.pFail, 1)
  assert.equal(c.pPoison, 0)
  assert.equal(c.maxDeliveries, 1)
  assert.ok(c.serviceMeanS > 0)
  assert.equal(c.maxQueue, 1)
  assert.ok(c.visibilityTimeoutS > 0)
  assert.equal(c.consumerTimeoutS, DEFAULT_CONFIG.consumerTimeoutS)
  assert.equal(c.retryMode, 'backoff')
  assert.equal(c.smsOnFailure, 'retry-sms')
  assert.equal(c.users, 1)
  assert.equal(c.restart.realPerSim, 1)
  assert.equal(c.restart.immediateFirst, false)
  assert.ok(c.autoscaler.maxReplicas >= c.autoscaler.minReplicas)
  assert.ok(c.autoscaler.targetQueueLength > 0)
  assert.equal(sanitizeConfig(DEFAULT_CONFIG).maxQueue, Infinity)
})

test('M/M/c time in system: exact p50 / p95 (review: the curriculum p50s come from a tick-biased prototype)', () => {
  const p50 = [2, 3, 3.5, 3.8].map((lam) => Math.round(mmcSojournQuantile(4, lam, 1, 0.5) * 1000) / 1000)
  assert.deepEqual(p50, [0.783, 1.156, 1.898, 3.986])
  close(mmcSojournQuantile(4, 2, 1, 0.95), 3.15, 0.0005, 'p95 at ρ 0,5')
  close(mmcSojournCdf(4, 2, 1, mmcSojournQuantile(4, 2, 1, 0.9)), 0.9, 1e-9)
  // c = 1: T ~ Exp(μ − λ)
  close(mmcSojournQuantile(1, 0.5, 1, 0.5), Math.log(2) / 0.5, 1e-9, 'M/M/1 median')
  // the special case a = cμ − λ = μ
  close(mmcSojournCdf(2, 1, 1, 1), 1 - (1 - 1 / 3) * Math.exp(-1) - (1 / 3) * Math.exp(-1) * 2, 1e-9, 'a = μ')
  assert.equal(mmcSojournQuantile(4, 5, 1, 0.5), Infinity)
  assert.equal(mmcSojournQuantile(4, 2, 1, 0), 0)
  assert.equal(mmcSojournCdf(4, 5, 1, 3), 0)
  assert.ok(Number.isFinite(mmcSojournQuantile(4, 2, 1, NaN)))
})
