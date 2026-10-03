/// <reference types="node" />
/**
 * Reproduces the validated outcomes of sim-models.md „SIM 2 – Validated outcomes” and the
 * lecture 06 model field. Single-seed checks use the documented seeds; distribution checks average seeds.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createQueueSim, runFor } from './core.ts'
import { little, metrics, runLatency } from './selectors.ts'
import { erlangB, mmc, mmcSojournQuantile } from './theory.ts'
import { CEVAP_PETAK_PROFILE, CEVAP_PETAK_SEED, PRESETS, cardNumbers, runPreset, type PresetId, type QueuePreset } from './presets.ts'
import type { QueueConfigPatch, QueueState } from './types.ts'

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
const between = (v: number, lo: number, hi: number, msg: string) => assert.ok(v >= lo && v <= hi, `${msg}: ${v} ∉ [${lo}, ${hi}]`)

/** Run and track the backlog peak (ready + delayed). */
function runTracking(cfg: QueueConfigPatch, seconds: number): { s: QueueState; peak: number } {
  const s = createQueueSim(cfg)
  let peak = 0
  for (let i = 0; i < seconds * 10; i++) {
    runFor(s, 0.1)
    peak = Math.max(peak, s.ready.size + s.delayed.length)
  }
  return { s, peak }
}

test('direct calls, 2/s, k 4: ≈ 10 % answered 503 (validated 10,3 %; Erlang B 9,5 %) at only 50 % utilisation', () => {
  const s = createQueueSim({ seed: 42, mode: 'direct' })
  runFor(s, 2000)
  const lost = s.totals.ordersFailed / s.totals.orders
  between(lost, 0.08, 0.115, 'seed 42 loss')
  assert.equal(s.totals.ordersFailed, s.totals.rejected503)
  const losses: number[] = []
  for (let seed = 1; seed <= 6; seed++) {
    const r = createQueueSim({ seed, mode: 'direct' })
    runFor(r, 2000)
    losses.push(r.totals.ordersFailed / r.totals.orders)
  }
  between(mean(losses), erlangB(4, 2) - 0.006, erlangB(4, 2) + 0.008, 'mean loss vs Erlang B')
})

test('queue, same load: 0 lost, p50 ≈ 0,78 s, p95 ≈ 3,15 s (exact M/M/4), W ≈ 1,09 s', () => {
  const s = createQueueSim({ seed: 42 })
  runFor(s, 2000)
  const m = metrics(s)
  const lat = runLatency(s)
  assert.equal(m.lost, 0)
  const p50 = mmcSojournQuantile(4, 2, 1, 0.5)
  const p95 = mmcSojournQuantile(4, 2, 1, 0.95)
  between(lat.p50 as number, p50 * 0.92, p50 * 1.08, 'p50 vs theory 0,783')
  between(lat.p95 as number, p95 * 0.9, p95 * 1.1, 'p95 vs theory 3,150')
  between(lat.mean as number, 1.04, 1.14, 'W')
  const ws: number[] = []
  for (let seed = 1; seed <= 6; seed++) {
    const r = createQueueSim({ seed })
    runFor(r, 2000)
    ws.push(runLatency(r).mean as number)
  }
  between(mean(ws), mmc(4, 2, 1).w * 0.98, mmc(4, 2, 1).w * 1.03, 'mean W vs M/M/4')
})

test('incident cards: every preset card reproduces its printed numbers with its seed and run length (review)', () => {
  let cards = 0
  for (const id of Object.keys(PRESETS) as PresetId[]) {
    const p: QueuePreset = PRESETS[id]
    if (!p.card) continue
    cards++
    assert.equal(p.config.seed, p.card.seed, id)
    assert.equal(p.runS, p.card.runS, id)
    const got = cardNumbers(runPreset(id))
    for (const [k, v] of Object.entries(p.card.expect)) assert.equal(got[k as keyof typeof got], v, `${id}.${k}`)
  }
  assert.ok(cards >= 3)
  // the curriculum card says seed 42: under this engine seed 42 gives 414 / 142, not 445 / 152 (open question)
  const s42 = createQueueSim({ ...PRESETS['l06-cevap-petak-direct'].config, seed: 42 })
  runFor(s42, 150)
  assert.deepEqual([s42.totals.orders, s42.totals.ordersFailed], [414, 142])
})

test('L06 incident card: Ćevap-petak without a queue → 445 orders, 152 lost (seed 36343, 150 s)', () => {
  const s = runPreset('l06-cevap-petak-direct')
  assert.equal(PRESETS['l06-cevap-petak-direct'].config.seed, CEVAP_PETAK_SEED)
  assert.equal(s.totals.orders, 445)
  assert.equal(s.totals.ordersFailed, 152)
  assert.equal(s.totals.rejected503, 152)
  assert.equal(s.t, 150)
})

test('same arrivals through a queue: 0 of 445 lost; backlog peaks ~110 and drains in ~50 s (predicted 110 / (4 − 2) = 55 s)', () => {
  const s = runPreset('l06-cevap-petak-queue')
  assert.equal(s.totals.orders, 445)
  assert.equal(metrics(s).lost, 0)
  const d = s.drain.last
  assert.ok(d)
  assert.equal(d.peak, 113)
  between(d.durationS, 50, 56, 'drain')
  // distribution over seeds
  const peaks: number[] = []
  const drains: number[] = []
  for (let seed = 1; seed <= 16; seed++) {
    const r = runTracking({ seed, profile: CEVAP_PETAK_PROFILE }, 150)
    peaks.push(r.peak)
    drains.push(r.s.drain.last?.durationS ?? NaN)
    assert.equal(metrics(r.s).lost, 0)
  }
  between(mean(peaks), 95, 125, 'mean peak (validated ~100)')
  between(mean(drains), 42, 68, 'mean drain (validated ~50, predicted 55)')
})

test('burst with 8 consumers: peak ≈ 66, drains in ≈ 15 s (predicted 70 / (8 − 2) ≈ 12 s)', () => {
  const r = runTracking({ seed: CEVAP_PETAK_SEED, profile: CEVAP_PETAK_PROFILE, consumers: 8 }, 150)
  between(r.peak, 55, 80, 'seed peak')
  between(r.s.drain.last?.durationS ?? NaN, 9, 18, 'seed drain')
  const peaks: number[] = []
  const drains: number[] = []
  for (let seed = 1; seed <= 16; seed++) {
    const x = runTracking({ seed, profile: CEVAP_PETAK_PROFILE, consumers: 8 }, 150)
    peaks.push(x.peak)
    drains.push(x.s.drain.last?.durationS ?? NaN)
  }
  between(mean(peaks), 58, 80, 'mean peak')
  between(mean(drains), 9, 16, 'mean drain')
})

test('„Ispraznite red u < 20 s s najmanje potrošača”: on the incident seed k 6 is too slow, k 7 is enough; the record carries k', () => {
  const k6 = runTracking({ seed: CEVAP_PETAK_SEED, profile: CEVAP_PETAK_PROFILE, consumers: 6 }, 150).s.drain.last
  const k7 = runTracking({ seed: CEVAP_PETAK_SEED, profile: CEVAP_PETAK_PROFILE, consumers: 7 }, 150).s.drain.last
  assert.ok(k6 && k7)
  assert.ok(k6.durationS > 20, `k6 ${k6.durationS}`)
  assert.ok(k7.durationS < 20, `k7 ${k7.durationS}`)
  assert.equal(Math.round(k6.durationS * 10) / 10, 24.2)
  assert.equal(Math.round(k7.durationS * 10) / 10, 17.9)
  // the goal check the README recommends
  const goal = (d: typeof k7) => d.consumersMax <= 7 && d.durationS < 20
  assert.equal(goal(k7), true)
  assert.equal(goal(k6), false)
  assert.equal(k7.consumersMin, 7)
  assert.ok(k7.startedAt >= 30 && k7.startedAt < 32 && k7.peakAt >= 39 && k7.peakAt <= 41)
  assert.ok(k7.arrivalsDuring > 0)
  assert.ok(k7.predictedS !== null && k7.predictedS > 10 && k7.predictedS < 25, `predicted ${k7.predictedS}`)
})

test('a live „Nalet” drain time is stochastic: k 7 sometimes misses 20 s and k 6 sometimes makes it (why the goal uses the seeded preset)', () => {
  let k7miss = 0
  let k6hit = 0
  for (let seed = 1; seed <= 30; seed++) {
    for (const k of [6, 7]) {
      const s = createQueueSim({ seed, consumers: k, profile: CEVAP_PETAK_PROFILE })
      runFor(s, 150)
      const d = s.drain.last?.durationS ?? Infinity
      if (k === 7 && d >= 20) k7miss++
      if (k === 6 && d < 20) k6hit++
    }
  }
  assert.ok(k7miss >= 1, `k 7 misses in ${k7miss}/30`)
  assert.ok(k6hit >= 1, `k 6 makes it in ${k6hit}/30`)
})

test('burst through direct calls loses about a third (validated 152 of 445) – averaged over seeds', () => {
  const fr: number[] = []
  for (let seed = 1; seed <= 16; seed++) {
    const s = createQueueSim({ seed, mode: 'direct', profile: CEVAP_PETAK_PROFILE })
    runFor(s, 150)
    fr.push(s.totals.ordersFailed / s.totals.orders)
  }
  between(mean(fr), 0.29, 0.38, 'mean loss fraction')
})

test('pFail 10 %, poison 2 %: DLQ ≈ 2 % (validated 24 of ~1245), retries ≈ 236', () => {
  const s = createQueueSim({ seed: 42, pFail: 0.1, pPoison: 0.02 })
  runFor(s, 600)
  const t = s.totals
  between(t.dlq / t.orders, 0.01, 0.035, 'DLQ share')
  between(t.retries, 180, 300, 'retries')
  assert.equal(metrics(s).lost, 0)
  for (const e of s.dlqRecent) assert.equal(e.receiveCount, 5)
  assert.ok(s.dlqRecent.every((e) => e.poison && e.reason === 'max-deliveries'), 'only poison messages exhaust 5 deliveries at pFail 10 %')
  assert.equal(t.dlqDeliveryLimit, t.dlq)
  assert.equal(t.dlqMaxLength, 0)
  const d: number[] = []
  const r: number[] = []
  for (let seed = 1; seed <= 6; seed++) {
    const x = createQueueSim({ seed, pFail: 0.1, pPoison: 0.02 })
    runFor(x, 600)
    d.push(x.totals.dlq)
    r.push(x.totals.retries)
  }
  between(mean(d), 18, 30, 'mean DLQ')
  between(mean(r), 190, 260, 'mean retries')
})

test('SQS visibility timeout 2 s with mean service 1 s → ≈ 13 % duplicate effects (e⁻² ≈ 13,5 %); idempotency → 0', () => {
  const s = createQueueSim({ seed: 42, broker: 'sqs', visibilityTimeoutS: 2 })
  runFor(s, 600)
  const m = metrics(s)
  between(m.duplicateRatio, 0.11, 0.16, 'duplicate ratio')
  assert.ok(s.totals.visibilityExpired > 0)
  const idem = createQueueSim({ seed: 42, broker: 'sqs', visibilityTimeoutS: 2, idempotent: true })
  runFor(idem, 600)
  assert.equal(idem.totals.duplicates, 0)
  assert.equal(idem.totals.alreadyCooked, s.totals.duplicates, 'the same redeliveries are now stamped „već skuhano”')
  assert.equal(idem.totals.effectsUnique, s.totals.effectsUnique)
  const ratios: number[] = []
  for (let seed = 1; seed <= 6; seed++) {
    const x = createQueueSim({ seed, broker: 'sqs', visibilityTimeoutS: 2 })
    runFor(x, 1000)
    ratios.push(metrics(x).duplicateRatio)
  }
  between(mean(ratios), 0.12, 0.15, 'mean duplicate ratio')
})

test('utilisation 0,5 / 0,75 / 0,875 / 0,95 → p50 follows exact M/M/4 (0,783 / 1,156 / 1,898 / 3,986 s; prototype said 0,77 / 1,12 / 1,86 / 3,88); Little L = λW', () => {
  const cases = [
    { lam: 2, tol: 0.04 },
    { lam: 3, tol: 0.04 },
    { lam: 3.5, tol: 0.06 },
    { lam: 3.8, tol: 0.1 },
  ]
  for (const c of cases) {
    const p50s: number[] = []
    for (let seed = 1; seed <= 4; seed++) {
      const s = createQueueSim({ seed, rate: c.lam })
      runFor(s, 3000)
      p50s.push(runLatency(s).p50 as number)
      const l = little(s)
      assert.ok(Math.abs(l.L - l.lambdaW) < 0.01 * l.L + 0.01, `Little at ρ ${c.lam / 4}: L ${l.L} vs λW ${l.lambdaW}`)
    }
    const th = mmcSojournQuantile(4, c.lam, 1, 0.5)
    between(mean(p50s), th * (1 - c.tol), th * (1 + c.tol), `mean p50 at ρ ${c.lam / 4} vs theory ${th.toFixed(3)}`)
  }
})

test('mean time in system follows the M/M/4 curve (no tick bias): averaged over seeds', () => {
  for (const [lam, tol] of [
    [3, 0.04],
    [3.5, 0.1],
  ] as const) {
    const ws: number[] = []
    for (let seed = 1; seed <= 6; seed++) {
      const s = createQueueSim({ seed, rate: lam })
      runFor(s, 3000)
      ws.push(runLatency(s).mean as number)
    }
    const th = mmc(4, lam, 1).w
    between(mean(ws), th * (1 - tol), th * (1 + tol), `W at λ ${lam}`)
  }
})
