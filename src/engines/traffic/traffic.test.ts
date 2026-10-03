/**
 * E1 Promet – engine tests. Run: node --test src/engines/traffic/*.test.ts
 * Validated numbers come from docs/research/sim-models.md (SIM 1) and the lectures' model fields.
 */
import { createRng } from '../../kit/sim/math.ts'
import {
  SCENARIOS,
  activeOf,
  addServer,
  advance,
  burst,
  capacityOf,
  capacityReport,
  compareAlgorithms,
  configure,
  cpuOf,
  crashServer,
  createScenario,
  createTraffic,
  defaultRack,
  drainServer,
  endpointSlice,
  hangServer,
  hitShares,
  lbInRotation,
  littleCheck,
  metrics,
  nPlusOne,
  nextBiggerSize,
  pickBackend,
  podSet,
  powerOff,
  powerOn,
  profileFactor,
  removeServer,
  resetHits,
  resizeServer,
  restartServer,
  routeManual,
  runPreset,
  runScenario,
  runUntil,
  serversView,
  sessionSummary,
  setDnsRecord,
  setLbUp,
  setLeak,
  setReady,
  setRedisUp,
  setSlow,
  setWeight,
  simRealLabel,
  singleServer,
  step,
  suggestedWeights,
  terminateServer,
  TIMING,
  undrainServer,
  visibleFlights,
  workersFor,
  workersOf,
  type Algo,
  type Mode,
  type TrafficConfigInput,
  type TrafficState,
} from './index.ts'
import { assert, describe, near, test, within } from './testing.ts'

/* ---------- helpers ---------- */

function outstanding(s: TrafficState): number {
  let n = 0
  for (const r of s.pending) if (!r.done) n++
  for (const v of s.servers) for (const list of [v.inflight, v.queue, v.parked, v.connecting]) for (const r of list) if (!r.done) n++
  return n
}

function checkInvariants(s: TrafficState, where: string, boundedWorkers = true) {
  const t = s.totals
  const failed = t.e502 + t.e503 + t.e504 + t.refused
  assert.equal(t.arrived, t.ok + failed + outstanding(s), `${where}: every request is counted exactly once`)
  const seen = new Set<number>()
  for (const v of s.servers) {
    for (const list of [v.inflight, v.queue, v.parked, v.connecting]) {
      for (const r of list) {
        assert.ok(!seen.has(r.id), `${where}: request ${r.id} is in two places`)
        seen.add(r.id)
      }
    }
    if (boundedWorkers) assert.ok(v.inflight.length <= workersOf(s, v), `${where}: ${v.id} inflight ${v.inflight.length} > W`)
    assert.ok(v.queue.length <= s.cfg.queueMax, `${where}: ${v.id} queue over max`)
    const c = cpuOf(v)
    assert.ok(c >= 0 && c <= 1 + 1e-9, `${where}: cpu ${c}`)
  }
  const m = metrics(s)
  for (const [k, val] of Object.entries(m)) {
    if (typeof val === 'number') assert.ok(Number.isFinite(val), `${where}: metrics.${k} = ${val}`)
  }
  if (m.p50 !== null && m.p95 !== null && m.p99 !== null) assert.ok(m.p50 <= m.p95 && m.p95 <= m.p99, `${where}: percentiles ordered`)
  assert.ok(s.events.length <= s.cfg.maxEvents, `${where}: events capped`)
  assert.ok(s.flights.length <= s.cfg.visual.maxFlights, `${where}: flights capped`)
  for (const o of s.oks) assert.ok(o.lat <= s.cfg.clientTimeoutMs, `${where}: a success slower than the timeout`)
}

const rack = (): TrafficConfigInput => ({ seed: 42, mode: 'lb', servers: defaultRack(), workload: 'api' })

/* ====================================================================== */

describe('capacity arithmetic (sim-models SIM 1)', () => {
  test('W = floor((RAM − 512) / 256): 1 GB→2, 2→6, 4→14, 8→30, 16→62; garbage → 1', () => {
    assert.deepEqual([1, 2, 4, 8, 16].map((g) => workersFor(g)), [2, 6, 14, 30, 62])
    assert.equal(workersFor(NaN), 1)
    assert.equal(workersFor(0), 1)
    assert.equal(workersFor(-4), 1)
  })
  test('API capacities: 1/2→5, 2/2→10, 2/4→10, 4/2→12 (RAM-bound), 4/8→20', () => {
    near(capacityOf(1, 2, 'api').cap, 5, 1e-9)
    near(capacityOf(2, 2, 'api').cap, 10, 1e-9)
    near(capacityOf(2, 4, 'api').cap, 10, 1e-9)
    near(capacityOf(2, 8, 'api').cap, 10, 1e-9)
    near(capacityOf(4, 2, 'api').cap, 12, 1e-9)
    assert.equal(capacityOf(4, 2, 'api').bound, 'ram')
    near(capacityOf(4, 8, 'api').cap, 20, 1e-9)
  })
  test('I/O preset: 4 vCPU/2 GB reaches only 5.7, 1 vCPU/8 GB reaches 20', () => {
    near(capacityOf(4, 2, 'io').cap, 5.714, 0.001)
    near(capacityOf(1, 8, 'io').cap, 20, 1e-9)
  })
  test('slow disk ×3 cuts CPU capacity to a third; zero vCPU → 0, not NaN', () => {
    near(capacityOf(4, 8, 'api', 3).cap, 20 / 3, 1e-9)
    assert.equal(capacityOf(0, 8, 'api').cap, 0)
    assert.equal(capacityOf(NaN, 8, 'api').cap, 0)
  })
  test('suggested weights for the default rack are 1 : 2 : 4', () => {
    assert.deepEqual(suggestedWeights(defaultRack(), 'api'), [1, 2, 4])
    assert.deepEqual(suggestedWeights([]), [])
  })
  test('N+1: 5 + 10 + 20 at λ 15 – losing the big one leaves exactly 100 %, which is NOT ok; ≤ 80 % is; 2 × 70 % → 143 %', () => {
    const r = nPlusOne([5, 10, 20], 15)
    assert.equal(r.total, 35)
    assert.equal(r.withoutLargest, 15)
    near(r.utilisationAfterFailure, 1, 1e-9)
    assert.equal(r.ok, false, 'survivors at ρ = 1 overload (L02 hockey stick)')
    assert.equal(r.maxUtilisation, 0.8)
    assert.ok(nPlusOne([5, 10, 20], 12).ok, 'ρ 0.8 after the failure is fine')
    assert.equal(nPlusOne([5, 10, 20], 12.1).ok, false)
    assert.ok(nPlusOne([5, 10, 20], 15, 1).ok, 'an explicit 100 % target accepts ρ = 1')
    assert.equal(nPlusOne([5, 10, 20], 1, NaN).maxUtilisation, 0.8, 'bad target → default')
    near(nPlusOne([0.7, 0.7], 1).utilisationAfterFailure, 1 / 0.7, 1e-9)
    const empty = nPlusOne([], 10)
    assert.equal(empty.total, 0)
    assert.equal(empty.ok, false)
    assert.equal(nPlusOne([5], NaN).offered, 0)
  })
  test('catalogue: 2/2 → 2/4 → 4/8 → 8/16 → „Nema većeg” (null)', () => {
    assert.deepEqual(nextBiggerSize(2, 2), { vcpu: 2, ramGB: 4 })
    assert.deepEqual(nextBiggerSize(2, 4), { vcpu: 4, ramGB: 8 })
    assert.deepEqual(nextBiggerSize(4, 8), { vcpu: 8, ramGB: 16 })
    assert.equal(nextBiggerSize(8, 16), null)
  })
  test('compressed-time badge text', () => {
    assert.equal(simRealLabel(TIMING.healthInterval), '2 s (sim) · stvarno: 30 s (AWS ALB)')
    assert.equal(simRealLabel(TIMING.connectTimeout), '1 s (sim) · stvarno: 60 s (NGINX proxy_connect_timeout)')
    assert.equal(simRealLabel(TIMING.resizeDowntime), '20 s (sim) · stvarno: minute')
    assert.equal(simRealLabel(TIMING.terminationGrace), '30 s (terminationGracePeriodSeconds)')
  })
})

/* ====================================================================== */

describe('validated table: default rack, API, seed 42, 300 s (sim-models SIM 1)', () => {
  // [λ, algo, err %, p95 s | null]
  const table: [number, Algo, number, number | null][] = [
    [10, 'rr', 0.1, 1.3], [10, 'wrr', 0, 0.9], [10, 'lc', 0, 1.1], [10, 'p2c', 0, 1.1], [10, 'lrt', 0, 1.0],
    [15, 'rr', 2.7, 3.2], [15, 'wrr', 0, 1.0], [15, 'lc', 0, 1.2], [15, 'p2c', 0, 1.3], [15, 'lrt', 0, 1.1],
    [20, 'rr', 10.6, 3.7], [20, 'wrr', 0, 1.1], [20, 'lc', 0.1, 1.5], [20, 'p2c', 0.1, 1.6], [20, 'lrt', 0, 1.3],
    [25, 'rr', 15.3, null], [25, 'wrr', 0, 1.3], [25, 'lc', 0.1, 1.9], [25, 'p2c', 0.2, 2.1], [25, 'lrt', 0, 1.5],
    [30, 'rr', 18.9, null], [30, 'wrr', 0.2, 2.0], [30, 'lc', 0.6, 2.5], [30, 'p2c', 1.5, 2.8], [30, 'lrt', 0.1, 1.9],
    [35, 'rr', 25.9, null], [35, 'wrr', 4, null], [35, 'lc', 4.6, null], [35, 'p2c', 8.7, null], [35, 'lrt', 3.5, null],
  ]
  const cache = new Map<string, ReturnType<typeof runScenario>>()
  const run = (lambda: number, algo: Algo) => {
    const k = `${lambda}-${algo}`
    if (!cache.has(k)) cache.set(k, runScenario({ config: { ...rack(), lambda, algo }, measureS: 300 }))
    return cache.get(k)!
  }
  for (const [lambda, algo, err, p95] of table) {
    test(`λ ${lambda}, ${algo}: ${err} % errors${p95 !== null ? `, p95 ${p95} s` : ''}`, () => {
      const r = run(lambda, algo)
      near(r.errPct, err, 0.1, 'error %')
      if (p95 !== null) near((r.p95 ?? NaN) / 1000, p95, 0.051, 'p95 s')
    })
  }
  test('random behaves like round robin (±1 pp at every λ)', () => {
    for (const lambda of [10, 15, 20, 25, 30, 35]) {
      const rr = run(lambda, 'rr')
      const rnd = runScenario({ config: { ...rack(), lambda, algo: 'random' }, measureS: 300 })
      near(rnd.errPct, rr.errPct, 1, `random vs rr at λ ${lambda}`)
    }
  })
  test('λ 15 round robin: S1 at ≈98 % CPU, S3 at ≈25 %', () => {
    const r = run(15, 'rr')
    within(r.servers[0].cpu, 0.96, 1, 'S1 CPU')
    within(r.servers[2].cpu, 0.22, 0.3, 'S3 CPU')
    for (const sv of r.servers) near(sv.share, 1 / 3, 0.01, 'RR share')
  })
  test('weighted round robin sends 1/7, 2/7, 4/7', () => {
    const r = run(15, 'wrr')
    near(r.servers[0].share, 1 / 7, 0.002)
    near(r.servers[1].share, 2 / 7, 0.002)
    near(r.servers[2].share, 4 / 7, 0.002)
  })
  test('percentiles never include rejected requests and are null below 20 samples', () => {
    const r = run(35, 'rr')
    assert.ok(r.errors[503] > 0)
    assert.ok((r.p99 ?? Infinity) <= 5000)
    const tiny = runScenario({ config: { ...rack(), lambda: 0.5 }, warmupS: 0, measureS: 10 })
    assert.equal(tiny.p95, null)
  })
  test("rngStreams 'split': deterministic algorithms are unchanged, randomised ones stay within noise", () => {
    for (const algo of ['rr', 'wrr', 'wlc', 'lrt'] as Algo[]) {
      const a = run(20, algo)
      const b = runScenario({ config: { ...rack(), lambda: 20, algo, rngStreams: 'split' }, measureS: 300 })
      assert.equal(b.errors.total, a.errors.total, algo)
      assert.equal(b.ok, a.ok, algo)
    }
    const lc = runScenario({ config: { ...rack(), lambda: 30, algo: 'lc', rngStreams: 'split' }, measureS: 300 })
    near(lc.errPct, 0.6, 0.6, 'split lc')
    const cmp = compareAlgorithms({ config: { ...rack(), lambda: 15, rngStreams: 'split' }, measureS: 60 }, ['rr', 'wrr', 'lc'])
    assert.equal(cmp.rr.arrived, cmp.lc.arrived, 'same arrivals for every algorithm')
    assert.equal(cmp.rr.arrived, cmp.wrr.arrived)
  })
})

/* ====================================================================== */

describe('validated scenarios', () => {
  test('RAM matters (2 vCPU, I/O, λ 30): 2 GB ≈5.7 at ~16 % CPU, 4 GB ≈13.3, 8 GB ≈26.9', () => {
    const r2 = runPreset('l02-ram-io-2gb')
    const r4 = runPreset('l02-ram-io-4gb')
    const r8 = runPreset('l02-ram-io-8gb')
    near(r2.okRps, 5.7, 0.1, '2 GB')
    within(r2.servers[0].cpu, 0.13, 0.18, '2 GB CPU')
    near(r4.okRps, 13.3, 0.15, '4 GB')
    near(r8.okRps, 26.9, 0.15, '8 GB')
  })
  test('RAM does not help a CPU-bound app: API capacity 10 at 2/4/8 GB; at overload 8 GB is not better than 4 GB', () => {
    const g = [2, 4, 8].map((ram) => runScenario({ config: { seed: 42, mode: 'direct', servers: singleServer(2, ram), workload: 'api', lambda: 12 }, measureS: 120 }))
    for (const r of g) within(r.okRps, 7.5, 9.6, 'goodput')
    assert.ok(g[2].okRps <= g[1].okRps + 0.05, '8 GB ≤ 4 GB')
    // the insight: more concurrency on the same cores → more timeouts
    const two = runScenario({ config: { seed: 42, mode: 'direct', servers: singleServer(2, 2), workload: 'api', lambda: 12 }, measureS: 300 })
    const eight = runScenario({ config: { seed: 42, mode: 'direct', servers: singleServer(2, 8), workload: 'api', lambda: 12 }, measureS: 300 })
    assert.equal(two.errors[504], 0)
    assert.ok(eight.errors[504] > 300, '8 GB shows many timeouts')
  })
  test('L02 hook (I/O, 2 vCPU/2 GB): λ 4 → 0 % errors, p95 ≈1.6 s, CPU ≈11 %; λ 12 → 5.67/s, ≈52 % errors, all 503, CPU ≈16 %', () => {
    const a = runPreset('l02-hook-1158')
    assert.equal(a.errors.total, 0)
    near((a.p95 ?? 0) / 1000, 1.6, 0.1, 'p95 at λ 4')
    within(a.servers[0].cpu, 0.09, 0.13, 'CPU at λ 4')
    const b = runPreset('l02-hook-1200')
    near(b.okRps, 5.67, 0.05)
    near(b.errPct, 52.4, 1)
    assert.equal(b.errors[503], b.errors.total, 'all errors are 503')
    near((b.p95 ?? 0) / 1000, 3.0, 0.1, 'p95 at λ 12')
    within(b.servers[0].cpu, 0.14, 0.18, 'CPU at λ 12')
  })
  test('L02 incident replay: the 30 s burst window shows ≈half 503s and p95 ≈3 s', () => {
    const r = runPreset('l02-incident')
    within(r.errPct, 45, 56, 'burst errors')
    near((r.p95 ?? 0) / 1000, 3.0, 0.15)
    assert.equal(r.errors[503], r.errors.total)
  })
  test('mixed servers, I/O (A 4/2 GB, B 1/8 GB), λ 15: RR 11.8 % vs LC 0.4 %; A saturates with ~8 % CPU', () => {
    const rr = runPreset('l04-mixed-io')
    const lc = runPreset('l04-mixed-io', { algo: 'lc' })
    near(rr.errPct, 11.8, 0.1)
    near(lc.errPct, 0.4, 0.1)
    within(rr.servers[0].cpu, 0.05, 0.1, 'A CPU')
  })
  test('unbounded workers – prototype timings reproduce exactly: 11 OOMs, 0.79 rps, 203 × 502, 182 × 503', () => {
    const r = runScenario({
      config: { seed: 42, mode: 'lb', servers: singleServer(1, 2), workload: 'api', lambda: 4, unboundedWorkers: true, lifecycle: { restartDelayMs: 5000, warmupMs: 0 }, healthCheck: { stagger: false } },
      measureS: 120,
    })
    assert.equal(r.state.totals.ooms, 11)
    near(r.okRps, 0.79, 0.01)
    assert.equal(r.errors[502], 203)
    assert.equal(r.errors[503], 182)
  })
  test('unbounded workers in L02 (no LB, restart 6 s + warm-up 3 s): OOM crash loop, ≈0.8 rps vs ≈3.9 bounded', () => {
    const r = runPreset('l02-unbounded')
    within(r.ooms, 7, 11, 'OOMs in 120 s')
    within(r.okRps, 0.6, 1, 'goodput')
    assert.ok(r.errors.refused > 0 && r.errors[502] === 0, 'no proxy: connection refused, not 502')
    const bounded = runPreset('l02-unbounded', { unboundedWorkers: false })
    near(bounded.okRps, 3.92, 0.1)
    assert.equal(bounded.ooms, 0)
  })
  test('bufferbloat: a 30-slot queue on 2 GB with the I/O preset collapses goodput to ≈0 (504s, wasted work)', () => {
    const r = runPreset('l02-bufferbloat')
    assert.ok(r.okRps < 0.2, `goodput ${r.okRps}`)
    assert.ok(r.errors[504] > 500 && r.wasted > 500)
    const q10 = runPreset('l02-bufferbloat', { queueMax: 10 })
    near(q10.okRps, 5.67, 0.1)
  })
  test('L04 incident (RR, λ 15) and the fix (WRR / LC: 0 % errors)', () => {
    const r = runPreset('l04-incident')
    near(r.errPct, 2.75, 0.05)
    assert.equal(r.p95, 3240)
    const wrr = runPreset('l04-incident', { algo: 'wrr' })
    const lc = runPreset('l04-incident', { algo: 'lc' })
    assert.equal(wrr.errors.total, 0)
    near((wrr.p95 ?? 0) / 1000, 0.98, 0.02)
    near(lc.errPct, 0, 0.05)
  })
  test('„Sporiji procesor” on S3: WRR keeps sending 4/7 and fails, least connections adapts', () => {
    const wrr = runPreset('l04-slow-disk')
    const lc = runPreset('l04-slow-disk', { algo: 'lc' })
    near(wrr.servers[2].share, 4 / 7, 0.005)
    assert.ok(wrr.errPct > 15, `wrr ${wrr.errPct}`)
    assert.ok(lc.errPct < 1, `lc ${lc.errPct}`)
    assert.ok(lc.servers[2].share < 0.35, 'LC moves load away from the slow server')
  })
  test('L05 kill S3 at λ 15 (unstaggered probes, as validated): RR 11 vs LC 37 failures before detection, detection 2 s', () => {
    const lc = runPreset('l05-incident')
    const rr = runPreset('l05-incident', { algo: 'rr' })
    const ilc = lc.incidents[0]
    const irr = rr.incidents[0]
    assert.equal(ilc.failedBeforeDetection, 37)
    assert.equal(irr.failedBeforeDetection, 11)
    assert.equal(ilc.detectedAt! - ilc.t0, 2000)
    assert.equal(lc.errors[502], 37, 'all 502s happen before detection')
    assert.equal(ilc.failedTotal, ilc.failedBeforeDetection)
    // N+1: afterwards the survivors carry 100 % of their capacity
    const s = createScenario('l05-incident')
    runUntil(s, 70_000)
    near(capacityReport(s).utilisationAfterFailure, 15 / 5, 1e-9, 'one more failure would be fatal')
    near(capacityReport(s).utilisation, 1, 1e-9, 'survivors at 100 %')
  })
  test('staggered probes: detection lands inside [(U−1)·interval, U·interval]; LC still loses more than RR', () => {
    const lc = runPreset('l05-incident', { healthCheck: { stagger: true } })
    const rr = runPreset('l05-incident', { healthCheck: { stagger: true }, algo: 'rr' })
    const d = lc.incidents[0].detectedAt! - lc.incidents[0].t0
    within(d, 2000, 4000, 'detection ms')
    assert.ok(lc.incidents[0].failedBeforeDetection > rr.incidents[0].failedBeforeDetection)
  })
})

/* ====================================================================== */

describe('stepping and determinism', () => {
  test('same config + seed + actions ⇒ identical run', () => {
    const mk = () => {
      const s = createTraffic({ ...rack(), lambda: 20, algo: 'p2c', sessions: { enabled: true } })
      runUntil(s, 20_000)
      crashServer(s, 's2')
      burst(s)
      runUntil(s, 60_000)
      return s
    }
    const a = mk()
    const b = mk()
    assert.deepEqual(a.totals, b.totals)
    assert.deepEqual(
      a.events.map((e) => e.text),
      b.events.map((e) => e.text),
    )
    assert.deepEqual(metrics(a), metrics(b))
  })
  test('different seeds give different runs', () => {
    const a = runScenario({ config: { ...rack(), lambda: 20, seed: 1 }, measureS: 30 })
    const b = runScenario({ config: { ...rack(), lambda: 20, seed: 2 }, measureS: 30 })
    assert.notEqual(a.arrived, b.arrived)
  })
  test('step(1/60) × 600 equals 1000 fixed ticks; one big step equals many small ones', () => {
    const a = createTraffic({ ...rack(), lambda: 15 })
    const b = createTraffic({ ...rack(), lambda: 15 })
    const c = createTraffic({ ...rack(), lambda: 15 })
    for (let i = 0; i < 600; i++) step(a, 1 / 60)
    advance(b, 10_000)
    step(c, 10)
    assert.equal(a.t, 10_000)
    assert.equal(b.t, 10_000)
    assert.equal(c.t, 10_000)
    assert.deepEqual(a.totals, b.totals)
    assert.deepEqual(c.totals, b.totals)
  })
  test('step ignores NaN, negative and zero dt', () => {
    const s = createTraffic(rack())
    step(s, NaN)
    step(s, -1)
    step(s, 0)
    assert.equal(s.t, 0)
  })
  test('uniform arrivals give exactly λ·T requests; Poisson is within 3σ', () => {
    const u = createTraffic({ ...rack(), lambda: 10, arrivals: 'uniform' })
    runUntil(u, 60_000)
    within(u.totals.arrived, 599, 600, 'uniform count')
    const p = createTraffic({ ...rack(), lambda: 10 })
    runUntil(p, 60_000)
    within(p.totals.arrived, 600 - 3 * Math.sqrt(600), 600 + 3 * Math.sqrt(600), 'Poisson count')
  })
  test('rate changes rescale the pending gap without extra randomness (λ 0 → no arrivals → resumes)', () => {
    const s = createTraffic({ ...rack(), lambda: 10 })
    runUntil(s, 5000)
    configure(s, { lambda: 0 })
    const n = s.totals.arrived
    runUntil(s, 15_000)
    assert.equal(s.totals.arrived, n)
    configure(s, { lambda: 10 })
    runUntil(s, 25_000)
    within(s.totals.arrived - n, 60, 140, 'arrivals after resuming')
  })
})

/* ====================================================================== */

describe('traffic shape', () => {
  test('burst ×3 for 30 s, then back; events logged', () => {
    const s = createTraffic({ ...rack(), lambda: 4 })
    runUntil(s, 10_000)
    burst(s)
    runUntil(s, 11_000)
    assert.equal(metrics(s).offered, 12)
    runUntil(s, 41_000)
    assert.equal(metrics(s).offered, 4)
    assert.ok(s.events.some((e) => e.kind === 'burst') && s.events.some((e) => e.kind === 'burstEnd'))
  })
  test('lunch profile: 1 → ramp → peak → decay → 1; waves stay ≥ 0', () => {
    const p = { kind: 'lunch' as const, startS: 10, rampS: 5, peakFactor: 3, holdS: 30, decayS: 15 }
    assert.equal(profileFactor(p, 0), 1)
    near(profileFactor(p, 12.5), 2, 1e-9)
    assert.equal(profileFactor(p, 20), 3)
    near(profileFactor(p, 52.5), 2, 1e-9)
    assert.equal(profileFactor(p, 100), 1)
    const w = { kind: 'waves' as const, amplitude: 1, periodS: 20 }
    for (let t = 0; t < 40; t += 0.5) assert.ok(profileFactor(w, t) >= 0)
    const s = createTraffic({ ...rack(), lambda: 5, profile: p })
    runUntil(s, 25_000)
    near(metrics(s).offered, 15, 1e-9)
  })
})

/* ====================================================================== */

describe('algorithms', () => {
  test('smooth WRR with weights 1:2:4 picks 1, 2 and 4 of every 7 – and setWeight changes it', () => {
    const s = createTraffic({ ...rack(), algo: 'wrr' })
    const counts: Record<string, number> = { s1: 0, s2: 0, s3: 0 }
    for (let i = 0; i < 70; i++) counts[pickBackend(s, s.servers, null).id]++
    assert.deepEqual(counts, { s1: 10, s2: 20, s3: 40 })
    setWeight(s, 's1', 4)
    const c2: Record<string, number> = { s1: 0, s2: 0, s3: 0 }
    for (let i = 0; i < 100; i++) c2[pickBackend(s, s.servers, null).id]++
    assert.deepEqual(c2, { s1: 40, s2: 20, s3: 40 })
    assert.equal(setWeight(s, 's1', NaN), false)
  })
  test('least connections picks the least active; p2c never picks the same server twice', () => {
    const s = createTraffic({ ...rack(), lambda: 0, algo: 'lc' })
    s.servers[0].queue.length = 0
    for (let i = 0; i < 3; i++) s.servers[0].inflight.push({ ...fakeReq(i) })
    for (let i = 0; i < 2; i++) s.servers[1].inflight.push({ ...fakeReq(10 + i) })
    assert.equal(pickBackend(s, s.servers, null).id, 's3')
    configure(s, { algo: 'wlc' })
    // (active+1)/w: s1 4/1, s2 3/2, s3 1/4
    assert.equal(pickBackend(s, s.servers, null).id, 's3')
    configure(s, { algo: 'p2c' })
    for (let i = 0; i < 50; i++) assert.notEqual(pickBackend(s, s.servers, null).id, 's1', 'p2c: s1 is the busiest and always loses its duel')
  })
  test('hash and consistent hash: a client always lands on the same server', () => {
    for (const algo of ['hash', 'chash'] as Algo[]) {
      const s = createTraffic({ ...rack(), algo })
      const c = s.clients[3]
      const first = pickBackend(s, s.servers, c).id
      for (let i = 0; i < 20; i++) assert.equal(pickBackend(s, s.servers, c).id, first, algo)
    }
  })
  test('least response time prefers the server with the lowest EWMA × (active+1)', () => {
    const s = createTraffic({ ...rack(), algo: 'lrt' })
    s.servers[0].ewmaMs = 100
    s.servers[1].ewmaMs = 900
    s.servers[2].ewmaMs = 400
    assert.equal(pickBackend(s, s.servers, null).id, 's1')
  })
  test('manual mode: requests wait at the LB, routeManual sends them, the rest time out (504); switching to an algorithm drains the queue', () => {
    const s = createTraffic({ ...rack(), lambda: 5, algo: 'manual' })
    runUntil(s, 2000)
    assert.ok(s.pending.length > 0)
    assert.ok(routeManual(s, 's3'))
    assert.equal(s.totals.manualRouted, 1)
    runUntil(s, 12_000)
    assert.ok(s.totals.e504 > 0, 'requests waited too long')
    assert.ok(s.errs.some((e) => e.reason === 'manualTimeout'))
    configure(s, { algo: 'wrr' })
    assert.equal(s.pending.length, 0)
    assert.equal(routeManual(s, 's1'), false)
    checkInvariants(s, 'manual')
  })
})

function fakeReq(id: number) {
  return { id, client: 0, t0: 0, tRouted: 0, tStart: 0, tCpuDone: -1, cpuTotal: 1e9, cpuLeft: 1e9, ioTotal: 0, ioLeft: 0, gaveUp: false, done: false, server: null, attempts: 1, connectUntil: -1, conn: null, visualArrive: 0, manual: false }
}

/* ====================================================================== */

describe('failure modes (L05)', () => {
  test('„Sruši proces”: instant 502 until 2 failed probes; then 0 new 502s; auto-restart brings it back after warm-up + 2 passes', () => {
    const s = createTraffic({ ...rack(), lambda: 15, algo: 'rr', healthCheck: { stagger: false } })
    runUntil(s, 20_000)
    assert.ok(crashServer(s, 's3'))
    assert.equal(crashServer(s, 's3'), false, 'already crashed')
    runUntil(s, 21_000)
    const v = s.servers[2]
    assert.equal(v.proc, 'crashed')
    assert.ok(s.totals.e502 > 0)
    runUntil(s, 22_010)
    assert.equal(lbInRotation(s, v), false)
    const e502 = s.totals.e502
    runUntil(s, 25_000)
    assert.equal(s.totals.e502, e502, 'no 502 after detection')
    runUntil(s, 30_000)
    assert.equal(v.proc, 'up', 'restarted after 6 s + 3 s')
    runUntil(s, 34_010)
    assert.ok(lbInRotation(s, v), 'back after 2 passing probes')
    checkInvariants(s, 'crash')
  })
  test('„Zamrzni”: requests hang until the 5 s timeout (504), probes time out, LC stops sending there', () => {
    const s = createTraffic({ ...rack(), lambda: 15, algo: 'lc', healthCheck: { stagger: false } })
    runUntil(s, 20_000)
    assert.ok(hangServer(s, 's3'))
    assert.equal(hangServer(s, 's3'), false)
    runUntil(s, 24_000)
    assert.equal(s.totals.e504, 0, 'nobody has waited 5 s yet')
    const inc = s.incidents[0]
    assert.ok(inc.detectedAt !== null, 'probes timed out')
    // fails at 20 s (probe due at 21 s), at 22 s (due 23 s) → unhealthy at 23 s: (U−1)·interval + timeout
    assert.equal(inc.detectedAt! - inc.t0, 3000)
    runUntil(s, 30_000)
    assert.ok(s.totals.e504 > 0)
    assert.equal(s.servers[2].parked.length, 0, 'everyone gave up')
    assert.ok(s.errs.every((e) => e.code !== 502))
    assert.ok(restartServer(s, 's3'))
    runUntil(s, 40_000)
    assert.equal(s.servers[2].proc, 'up')
    checkInvariants(s, 'hang')
  })
  test('„Ugasi stroj”: no RST – the LB waits its 1 s connect timeout, then 504 Gateway Timeout (NGINX, ALB); in-flight requests end as 504', () => {
    const s = createTraffic({ ...rack(), lambda: 15, algo: 'rr', healthCheck: { stagger: false } })
    runUntil(s, 20_000)
    assert.ok(powerOff(s, 's3'))
    runUntil(s, 20_500)
    assert.equal(s.totals.e504, 0, 'still waiting for the handshake')
    runUntil(s, 23_000)
    assert.ok(s.errs.some((e) => e.reason === 'connectTimeout' && e.code === 504))
    assert.equal(s.totals.e502, 0, 'a connect timeout is never a 502')
    runUntil(s, 26_000)
    assert.ok(s.errs.some((e) => e.code === 504 && e.server === 's3'), 'requests that were inside hang until the client timeout')
    assert.equal(powerOff(s, 's3'), false)
    assert.ok(powerOn(s, 's3'))
    assert.equal(s.servers[2].proc, 'booting')
    runUntil(s, 26_000 + 10_000 + 3000 + 20)
    assert.equal(s.servers[2].proc, 'up')
    checkInvariants(s, 'off')
  })
  test('„Izvuci utikač” on the single L02 server: every request times out (504), no 502 without a proxy', () => {
    const s = createTraffic({ seed: 42, mode: 'direct', lambda: 5 })
    runUntil(s, 10_000)
    powerOff(s, 's1')
    runUntil(s, 30_000)
    const m = metrics(s)
    assert.equal(m.goodput, 0)
    assert.ok(s.totals.e504 > 50)
    assert.equal(s.totals.e502, 0)
  })
  test('crash in direct mode = „odbijena veza” (refused), not 502', () => {
    const s = createTraffic({ seed: 42, mode: 'direct', lambda: 5, lifecycle: { autoRestart: false } })
    runUntil(s, 5000)
    crashServer(s, 's1')
    runUntil(s, 10_000)
    assert.ok(s.totals.refused > 10)
    assert.equal(s.totals.e502, 0)
  })
  test('passive check ejects at the first 502 – far fewer failures than waiting for active probes', () => {
    const base = runPreset('l05-incident')
    const passive = runPreset('l05-incident', { passive: { enabled: true } })
    const inc = passive.incidents[0]
    assert.ok(inc.failedBeforeDetection < base.incidents[0].failedBeforeDetection / 3, `${inc.failedBeforeDetection}`)
    assert.ok(inc.detectedAt! - inc.t0 <= 10)
    assert.ok(passive.state.events.some((e) => e.kind === 'ejected'))
  })
  test('LB retry: refused requests are retried elsewhere; only the ones inside S3 at the crash are lost', () => {
    const base = runPreset('l05-incident')
    const retry = runPreset('l05-incident', { retry: true })
    const inc = retry.incidents[0]
    assert.ok(retry.retried > 0)
    assert.ok(inc.failedBeforeDetection < base.incidents[0].failedBeforeDetection / 3, `${inc.failedBeforeDetection}`)
  })
  test('LB retry also covers a machine that is off (after the connect timeout)', () => {
    const s = createTraffic({ ...rack(), lambda: 15, retry: true, healthCheck: { stagger: false } })
    runUntil(s, 20_000)
    powerOff(s, 's2')
    runUntil(s, 25_000)
    assert.ok(s.totals.retried > 0)
    assert.equal(s.errs.filter((e) => e.reason === 'connectTimeout').length, 0)
  })
  test('all servers unhealthy → 503 from the LB; fail-open sends to all anyway (here: 502)', () => {
    for (const failOpen of [false, true]) {
      const s = createTraffic({ ...rack(), lambda: 10, failOpen, lifecycle: { autoRestart: false } })
      runUntil(s, 5000)
      for (const id of ['s1', 's2', 's3']) crashServer(s, id)
      runUntil(s, 10_000)
      const before = { ...s.totals }
      runUntil(s, 15_000)
      if (failOpen) assert.ok(s.totals.e502 > before.e502 && s.totals.e503 === before.e503, 'fail-open')
      else assert.ok(s.totals.e503 > before.e503 && s.totals.e502 === before.e502, 'fail-closed')
      assert.equal(metrics(s).goodput, 0)
      checkInvariants(s, `all down failOpen=${failOpen}`)
    }
  })
  test('health checks off: a crashed server gets traffic forever', () => {
    const s = createTraffic({ ...rack(), lambda: 15, healthCheck: { enabled: false }, lifecycle: { autoRestart: false } })
    runUntil(s, 5000)
    crashServer(s, 's3')
    runUntil(s, 30_000)
    const late = s.errs.filter((e) => e.code === 502 && e.t > 25_000).length
    assert.ok(late > 10, `${late}`)
  })
  test('drain: no new requests, in-flight finish, „sigurno za uklanjanje”, zero failures; undrain returns it', () => {
    const r = runPreset('l05-drain')
    assert.equal(r.errors.total, 0)
    const s = createScenario('l05-drain')
    runUntil(s, 40_000)
    const v = s.servers[1]
    assert.ok(v.draining && v.drained)
    assert.equal(activeOf(v), 0)
    assert.ok(serversView(s)[1].safeToRemove)
    assert.ok(s.events.some((e) => e.kind === 'drained'))
    const routed = v.routed
    runUntil(s, 45_000)
    assert.equal(v.routed, routed)
    assert.ok(undrainServer(s, 's2'))
    assert.equal(undrainServer(s, 's2'), false)
    runUntil(s, 50_000)
    assert.ok(v.routed > routed)
    assert.ok(removeServer(s, 's2'))
    assert.equal(s.servers.length, 2)
  })
  test('restart while the LB thinks the server is healthy → 502s during warm-up', () => {
    const s = createTraffic({ ...rack(), lambda: 15, algo: 'rr' })
    runUntil(s, 10_000)
    assert.ok(restartServer(s, 's3'))
    assert.equal(s.servers[2].proc, 'starting')
    runUntil(s, 13_500)
    assert.ok(s.errs.some((e) => e.code === 502 && e.server === 's3'))
    runUntil(s, 20_000)
    assert.equal(s.servers[2].proc, 'up')
  })
  test('memory leak → OOM even with bounded workers, then restart', () => {
    const s = createTraffic({ ...rack(), lambda: 5 })
    assert.ok(setLeak(s, 's1', 200))
    runUntil(s, 15_000)
    assert.ok(s.servers[0].ooms >= 1)
    assert.ok(s.events.some((e) => e.kind === 'oom'))
    setLeak(s, 's1', 0)
    checkInvariants(s, 'leak')
  })
  test('„Ugasi load balancer”: every request fails although all servers run', () => {
    const s = createTraffic({ ...rack(), lambda: 10 })
    runUntil(s, 5000)
    setLbUp(s, false)
    runUntil(s, 10_000)
    assert.equal(metrics(s).goodput, 0)
    assert.ok(s.errs.some((e) => e.reason === 'lbDown'))
    checkInvariants(s, 'lb down')
    setLbUp(s, true)
    runUntil(s, 20_000)
    assert.ok(metrics(s).goodput > 5)
  })
})

/* ====================================================================== */

describe('sessions and carts (L05)', () => {
  const sess = (sessions: TrafficConfigInput['sessions']) => createTraffic({ ...rack(), lambda: 10, algo: 'wrr', sessions: { enabled: true, store: 'local', affinity: 'none', ...sessions } })
  test('local sessions without affinity: most requests land elsewhere → „sesija izgubljena”', () => {
    const r = runPreset('l05-sessions-local')
    assert.ok(r.sessionLost > r.ok * 0.4, `${r.sessionLost} of ${r.ok}`)
  })
  test('sticky cookie: no losses until a crash; the crash logs out that server’s users; uneven load', () => {
    const s = sess({ affinity: 'cookie' })
    runUntil(s, 30_000)
    assert.equal(s.totals.sessionLost, 0)
    const onS3 = sessionSummary(s).byHome.s3 ?? 0
    assert.ok(onS3 > 0)
    crashServer(s, 's3')
    runUntil(s, 60_000)
    within(s.totals.sessionLost, 1, onS3, 'lost = users whose session lived on S3')
    const cookies = s.clients.map((c) => c.cookie)
    assert.ok(cookies.every((c) => c === null || c !== 's3' || s.servers[2].healthy), 'cookies reassigned away from the unhealthy server')
  })
  test('Redis store: no losses with any routing; „Ugasi Redis” logs everyone out once', () => {
    const s = sess({ store: 'redis' })
    runUntil(s, 30_000)
    assert.equal(s.totals.sessionLost, 0)
    crashServer(s, 's2')
    runUntil(s, 40_000)
    assert.equal(s.totals.sessionLost, 0, 'servers are interchangeable')
    const users = s.clients.filter((c) => c.session.home === 'redis').length
    setRedisUp(s, false)
    runUntil(s, 60_000)
    within(s.totals.sessionLost, users - 2, users, 'each user lost the session once')
    const lost = s.totals.sessionLost
    runUntil(s, 70_000)
    assert.equal(s.totals.sessionLost, lost, 'no double counting while Redis is down')
    setRedisUp(s, true)
    runUntil(s, 80_000)
    assert.ok(s.clients.some((c) => c.session.home === 'redis' && c.session.cart > 0))
  })
  test('consistent-hash affinity: removing a server moves only its users', () => {
    const s = sess({ affinity: 'hash' })
    runUntil(s, 20_000)
    const before = new Map(s.clients.map((c) => [c.id, c.session.home]))
    drainServer(s, 's1')
    runUntil(s, 40_000)
    for (const c of s.clients) {
      if (before.get(c.id) !== 's1' && before.get(c.id) !== null) assert.equal(c.session.home, before.get(c.id), `${c.name} moved`)
    }
  })
})

/* ====================================================================== */

describe('rack changes', () => {
  test('addServer: starts warming up, no traffic until 2 passed checks; without checks gets traffic at once (502s)', () => {
    const s = createTraffic({ ...rack(), lambda: 15, algo: 'rr' })
    runUntil(s, 5000)
    assert.equal(addServer(s, { id: 's4', name: 'S4', vcpu: 2, ramGB: 4 }), 's4')
    assert.equal(addServer(s, { id: 's4', name: 'dup', vcpu: 1, ramGB: 1 }), null, 'duplicate id')
    const v = s.servers[3]
    assert.equal(serversView(s)[3].routing, 'initial')
    runUntil(s, 7000)
    assert.equal(v.routed, 0)
    runUntil(s, 15_000)
    assert.ok(v.routed > 0 && v.healthy)
    assert.equal(v.weight, 2)
    const t = createTraffic({ ...rack(), lambda: 15, healthCheck: { enabled: false } })
    runUntil(t, 5000)
    addServer(t, { id: 's4', name: 'S4', vcpu: 2, ramGB: 4 })
    runUntil(t, 7000)
    assert.ok(t.errs.some((e) => e.server === 's4' && e.code === 502))
  })
  test('removeServer fails what is inside; the LB keeps working', () => {
    const s = createTraffic({ ...rack(), lambda: 20 })
    runUntil(s, 5000)
    const inside = s.servers[2].inflight.length + s.servers[2].queue.length
    const e = s.totals.e502
    assert.ok(removeServer(s, 's3'))
    assert.equal(s.totals.e502 - e, inside)
    assert.equal(removeServer(s, 's3'), false)
    runUntil(s, 10_000)
    checkInvariants(s, 'remove')
  })
  test('resizeServer (L02 „Veći poslužitelj”): down for 20 s (sim), then bigger; requests meanwhile time out', () => {
    const s = createTraffic({ seed: 42, mode: 'direct', servers: singleServer(2, 2), workload: 'io', lambda: 4 })
    runUntil(s, 10_000)
    assert.ok(resizeServer(s, 's1', 4, 8))
    assert.equal(resizeServer(s, 's1', 4, 8), false, 'same size')
    assert.equal(resizeServer(s, 's1', NaN, 8), false)
    assert.equal(s.servers[0].proc, 'off')
    runUntil(s, 25_000)
    assert.ok(s.totals.e504 > 0)
    runUntil(s, 33_100)
    assert.equal(s.servers[0].proc, 'up')
    assert.equal(workersOf(s, s.servers[0]), 30)
    assert.ok(s.events.some((e) => e.kind === 'resize' && e.text.includes('stvarno: minute')))
  })
  test('zero servers: L7 lb → 503; L4 lb, direct, dns and Service (kube-proxy REJECT) → refused; metrics stay finite', () => {
    for (const mode of ['lb', 'direct', 'dns', 'service'] as Mode[]) {
      const s = createTraffic({ seed: 1, mode, servers: [], lambda: 10 })
      runUntil(s, 5000)
      assert.equal(s.totals.ok, 0)
      assert.ok(s.totals.arrived > 0)
      if (mode === 'lb') assert.equal(s.totals.e503, s.totals.arrived, mode)
      else assert.equal(s.totals.refused, s.totals.arrived, mode)
      const m = metrics(s)
      assert.equal(m.p95, null)
      assert.equal(m.errorRate, 1)
      checkInvariants(s, `zero servers ${mode}`)
    }
    const l4 = createTraffic({ seed: 1, mode: 'lb', layer: 'L4', servers: [], lambda: 10 })
    runUntil(l4, 5000)
    assert.equal(l4.totals.refused, l4.totals.arrived, 'an L4 balancer has no HTTP status to send')
  })
  test('λ = 0 and invalid numbers: no arrivals, no NaN, sane config', () => {
    const s = createTraffic({ ...rack(), lambda: 0 })
    runUntil(s, 10_000)
    const m = metrics(s)
    assert.equal(s.totals.arrived, 0)
    assert.equal(m.goodput, 0)
    assert.equal(m.errorRate, 0)
    assert.equal(m.p95, null)
    const bad = createTraffic({ lambda: NaN, queueMax: -3, clientTimeoutMs: NaN, seed: NaN, servers: [{ id: 'x', name: 'X', vcpu: NaN, ramGB: -1 }] })
    assert.equal(bad.cfg.lambda, 10)
    assert.equal(bad.cfg.queueMax, 10)
    assert.equal(bad.cfg.clientTimeoutMs, 5000)
    assert.equal(bad.cfg.seed, 42)
    assert.equal(bad.servers[0].vcpu, 1)
    configure(bad, { lambda: -5 })
    assert.equal(bad.cfg.lambda, 10)
    runUntil(bad, 5000)
    checkInvariants(bad, 'invalid numbers')
  })
  test('queue length 0: no queue at all, overflow goes straight to 503', () => {
    const s = createTraffic({ seed: 42, mode: 'direct', servers: singleServer(1, 1), lambda: 20, queueMax: 0 })
    runUntil(s, 10_000)
    assert.equal(s.servers[0].queue.length, 0)
    assert.ok(s.totals.e503 > 0)
  })
})

/* ====================================================================== */

describe('DNS mode (L03 cliffhanger, L04 hook)', () => {
  test('only S1 in DNS → S2 idles at 0 %', () => {
    const s = createTraffic({ seed: 42, mode: 'dns', lambda: 4, servers: [{ id: 's1', name: 'S1', vcpu: 4, ramGB: 8 }, { id: 's2', name: 'S2', vcpu: 2, ramGB: 4, inDns: false }] })
    runUntil(s, 30_000)
    assert.equal(s.servers[1].routed, 0)
    assert.ok(s.servers[0].routed > 80)
    assert.equal(serversView(s)[1].routing, 'notInDns')
  })
  test('several A records spread clients roughly evenly by count (not by capacity); a dead server keeps getting cached clients', () => {
    const s = createTraffic({ seed: 42, mode: 'dns', lambda: 10, dns: { resolvers: 6, ttlMs: 5000 } })
    runUntil(s, 120_000)
    const shares = hitShares(s).map((h) => h.share)
    for (const sh of shares) within(sh, 0.2, 0.47, 'DNS share')
    crashServer(s, 's3', { autoRestart: false })
    const e = s.totals.refused
    runUntil(s, 180_000)
    assert.ok(s.totals.refused - e > 50, 'DNS has no health checks')
    assert.ok(setDnsRecord(s, 's3', false))
    runUntil(s, 186_000)
    const r3 = s.servers[2].routed
    runUntil(s, 200_000)
    assert.equal(s.servers[2].routed, r3, 'after the TTL nobody uses the removed record')
  })
  test('one big campus resolver makes the split lumpy', () => {
    const s = createTraffic({ seed: 42, mode: 'dns', lambda: 10, dns: { resolvers: 4, campusShare: 0.8, ttlMs: 20_000 } })
    runUntil(s, 20_000)
    const shares = hitShares(s).map((h) => h.share)
    assert.ok(Math.max(...shares) > 0.7, `${shares}`)
  })
})

/* ====================================================================== */

describe('Kubernetes Service mode (L14)', () => {
  test('random per connection among ready endpoints = the L04 „random” numbers exactly (≈2.8 % at λ 15)', () => {
    const svc = runPreset('l14-rack')
    const rnd = runScenario({ config: { ...rack(), lambda: 15, algo: 'random' }, measureS: 300 })
    assert.equal(svc.errors.total, rnd.errors.total)
    assert.equal(svc.ok, rnd.ok)
    near(svc.errPct, 2.8, 0.1)
    for (const sv of svc.servers) near(sv.share, 1 / 3, 0.02, 'no weights, node size ignored')
  })
  test('one keep-alive connection → 100 % on one Pod; N connections → at most N Pods; new connection per request → all Pods', () => {
    const one = runPreset('l14-keepalive')
    assert.equal(Math.max(...one.servers.map((x) => x.share)), 1)
    const pool = runPreset('l14-keepalive', { clients: { count: 1, mode: 'pool', poolSize: 2 } })
    assert.ok(pool.servers.filter((x) => x.share > 0).length <= 2)
    const per = runPreset('l14-keepalive', { clients: { count: 1, mode: 'perRequest' } })
    assert.equal(per.servers.filter((x) => x.share > 0.15).length, 4)
  })
  test('sessionAffinity ClientIP behind one NAT sends the whole campus to one Pod; without NAT it spreads', () => {
    const nat = createTraffic({ seed: 42, mode: 'service', servers: podSet(4), lambda: 8, clients: { count: 20, nat: true }, service: { sessionAffinity: 'ClientIP' } })
    runUntil(nat, 30_000)
    assert.equal(Math.max(...hitShares(nat).map((h) => h.share)), 1)
    const spread = createTraffic({ seed: 42, mode: 'service', servers: podSet(4), lambda: 8, clients: { count: 20, nat: false }, service: { sessionAffinity: 'ClientIP' } })
    runUntil(spread, 30_000)
    assert.ok(Math.max(...hitShares(spread).map((h) => h.share)) < 0.6)
  })
  test('readiness false: removed from endpoints after the probe threshold + 1 s propagation, no restart', () => {
    const s = createTraffic({ seed: 42, mode: 'service', servers: podSet(4), lambda: 8, healthCheck: { stagger: false } })
    runUntil(s, 5000)
    assert.ok(setReady(s, 'pod2', false))
    runUntil(s, 6000)
    assert.ok(endpointSlice(s)[1].kubeProxy.ready, 'not noticed yet')
    // probes at 6, 8, 10 s fail (failureThreshold 3) → ready: false at 10 s → kube-proxy at 11 s
    runUntil(s, 10_010)
    assert.equal(endpointSlice(s)[1].conditions.ready, false)
    assert.ok(endpointSlice(s)[1].kubeProxy.ready, 'propagating')
    runUntil(s, 11_010)
    assert.equal(endpointSlice(s)[1].kubeProxy.ready, false)
    resetHits(s)
    runUntil(s, 20_000)
    assert.equal(s.servers[1].hits, 0)
    assert.equal(s.servers[1].proc, 'up', 'readiness never restarts')
    setReady(s, 'pod2', true)
    runUntil(s, 25_000)
    assert.ok(endpointSlice(s)[1].kubeProxy.ready)
  })
  test('an established keep-alive connection keeps using a Pod that became not-ready (conntrack)', () => {
    const s = createTraffic({ seed: 42, mode: 'service', servers: podSet(4), lambda: 4, clients: { count: 1, mode: 'keepAlive' } })
    runUntil(s, 3000)
    const pinned = s.clients[0].conns[0].server!
    setReady(s, pinned, false)
    runUntil(s, 20_000)
    assert.equal(s.clients[0].conns[0].server, pinned)
    resetHits(s)
    runUntil(s, 25_000)
    assert.equal(hitShares(s).find((h) => h.id === pinned)!.share, 1)
  })
  test('0 ready endpoints (all unready) → every request is refused by kube-proxy (no HTTP status: a Service is not a proxy)', () => {
    const s = createTraffic({ seed: 42, mode: 'service', servers: podSet(2), lambda: 5 })
    for (const v of s.servers) setReady(s, v.id, false)
    runUntil(s, 15_000)
    const before = { ...s.totals }
    runUntil(s, 20_000)
    assert.ok(s.totals.refused - before.refused > 15)
    assert.equal(s.totals.e503, before.e503, 'never a 503 from a Service')
    assert.equal(s.totals.e502, before.e502)
    assert.ok(s.errs.every((e) => e.reason === 'noBackend' && e.code === 'refused'))
    assert.equal(metrics(s).goodput, 0)
  })
  test('Pod deletion: immediate exit drops 10 requests in the 1 s lag; graceful still refuses new connections (4); preStop sleep 5 → 0', () => {
    const run = (svc: TrafficConfigInput['service']) => runPreset('l14-shutdown', { service: svc }).errors
    const immediate = run({ sigterm: 'immediate', preStopSleepS: 0 })
    const graceful = run({ sigterm: 'graceful', preStopSleepS: 0 })
    const preStop = run({ sigterm: 'graceful', preStopSleepS: 5 })
    assert.equal(immediate.refused, 10, 'refused / reset connections – no proxy, no 502')
    assert.equal(immediate[502], 0)
    assert.equal(immediate.total, 10, 'the only errors are the shutdown drops')
    assert.equal(graceful.refused, 4)
    assert.equal(preStop.total, 0)
    const s = createScenario('l14-shutdown')
    runUntil(s, 25_000)
    assert.equal(s.servers.length, 3, 'Pod removed after exit + propagation')
    assert.ok(s.events.some((e) => e.kind === 'exit') && s.events.some((e) => e.kind === 'remove'))
    assert.equal(terminateServer(s, 'nope'), false)
  })
  test('SIGTERM ignored → SIGKILL after the 30 s grace period', () => {
    const s = createTraffic({ seed: 42, mode: 'service', servers: podSet(3), lambda: 6, service: { sigterm: 'ignore' } })
    runUntil(s, 5000)
    terminateServer(s, 'pod1')
    runUntil(s, 34_000)
    assert.ok(s.servers.find((v) => v.id === 'pod1'))
    runUntil(s, 37_000)
    assert.ok(!s.servers.find((v) => v.id === 'pod1'))
    assert.ok(s.events.some((e) => e.kind === 'sigkill'))
    assert.equal(terminateServer(createTraffic(rack()), 's1'), false, 'lb mode has no Pods')
  })
  test('crash in Service mode: Pod not ready at once, kube-proxy after 1 s; powerOff is not modelled here', () => {
    const s = createTraffic({ seed: 42, mode: 'service', servers: podSet(3), lambda: 9 })
    runUntil(s, 5000)
    crashServer(s, 'pod1')
    assert.equal(endpointSlice(s)[0].conditions.ready, false)
    runUntil(s, 6010)
    assert.equal(endpointSlice(s)[0].kubeProxy.ready, false)
    assert.equal(powerOff(s, 'pod2'), false)
  })
  test('switching L04 rack between classic LB and Service at run time', () => {
    const s = createTraffic({ ...rack(), lambda: 15, algo: 'wrr' })
    runUntil(s, 10_000)
    configure(s, { mode: 'service' })
    resetHits(s)
    runUntil(s, 70_000)
    for (const h of hitShares(s)) near(h.share, 1 / 3, 0.06, 'Service ignores weights')
    configure(s, { mode: 'lb' })
    resetHits(s)
    runUntil(s, 130_000)
    near(hitShares(s)[2].share, 4 / 7, 0.02)
    checkInvariants(s, 'mode switch')
  })
  test('L4 classic LB with keep-alive pins clients; L7 balances every request', () => {
    const l4 = createTraffic({ ...rack(), lambda: 3, layer: 'L4', clients: { count: 1, mode: 'keepAlive' } })
    runUntil(l4, 20_000)
    assert.equal(Math.max(...hitShares(l4).map((h) => h.share)), 1)
    const l7 = createTraffic({ ...rack(), lambda: 3, layer: 'L7', clients: { count: 1, mode: 'keepAlive' } })
    runUntil(l7, 20_000)
    assert.ok(Math.max(...hitShares(l7).map((h) => h.share)) < 0.5)
  })
})

/* ====================================================================== */

describe('selectors', () => {
  test('metrics windows, Little’s law L ≈ λ·W in steady state', () => {
    const s = createTraffic({ ...rack(), lambda: 12, algo: 'wrr' })
    runUntil(s, 60_000)
    const m = metrics(s)
    near(m.goodput, 12, 2.5, 'goodput')
    assert.equal(m.errorRate, 0)
    assert.ok(m.p50! <= m.p95! && m.p95! <= m.p99!)
    const l = littleCheck(s)
    near(l.lambdaW, l.L, l.L * 0.08, 'Little')
  })
  test('server view: workers, RAM, routing badge, capacity', () => {
    const s = createTraffic({ ...rack(), lambda: 10 })
    runUntil(s, 10_000)
    const v = serversView(s)
    assert.deepEqual(
      v.map((x) => x.workers),
      [6, 14, 30],
    )
    assert.equal(v[0].routing, 'healthy')
    assert.ok(v[2].ramUsedMB >= 512 && v[2].ramUsedMB <= 8192)
    near(v[2].capacity.cap, 20, 1e-9)
    assert.equal(v[0].display, 'S1 (mali)')
  })
  test('flights: progress 0..1, capped, off in headless runs', () => {
    const s = createTraffic({ ...rack(), lambda: 50, visual: { maxFlights: 30 } })
    runUntil(s, 5000)
    assert.ok(s.flights.length <= 30)
    for (const { progress } of visibleFlights(s)) within(progress, 0, 1)
    assert.equal(runScenario({ config: rack(), measureS: 5 }).state.flights.length, 0)
  })
  test('events: Croatian text, tone, capped at 50', () => {
    const s = createTraffic({ ...rack(), lambda: 30, passive: { enabled: true } })
    for (let i = 0; i < 40; i++) {
      runUntil(s, s.t + 2000)
      crashServer(s, 's1')
      restartServer(s, 's1')
    }
    assert.ok(s.events.length <= 50)
    assert.ok(s.events.every((e) => typeof e.text === 'string' && e.text.length > 0 && ['ok', 'warn', 'bad', 'info', 'neutral'].includes(e.tone)))
    assert.ok(s.events.some((e) => e.text.includes('provjer') || e.text.includes('proces')))
  })
})

/* ====================================================================== */

describe('invariants under random actions (all modes)', () => {
  const ids = (s: TrafficState) => s.servers.map((v) => v.id)
  const algos: Algo[] = ['rr', 'wrr', 'lc', 'wlc', 'p2c', 'lrt', 'random', 'hash', 'chash', 'manual']
  for (const mode of ['direct', 'dns', 'lb', 'service'] as Mode[]) {
    test(`fuzz ${mode}: conservation, W and queue bounds, finite metrics, capped logs`, () => {
      for (let seed = 1; seed <= 5; seed++) {
        const rng = createRng(1000 + seed)
        const s = createTraffic({ seed, mode, servers: mode === 'direct' ? singleServer() : mode === 'service' ? podSet(3) : defaultRack(), lambda: 15, sessions: { enabled: true } })
        let everUnbounded = false
        const pickId = () => rng.pick(ids(s).length ? ids(s) : ['none'])
        const actions: ((s: TrafficState) => void)[] = [
          (x) => crashServer(x, pickId()),
          (x) => crashServer(x, pickId(), { autoRestart: false }),
          (x) => hangServer(x, pickId()),
          (x) => powerOff(x, pickId()),
          (x) => powerOn(x, pickId()),
          (x) => restartServer(x, pickId()),
          (x) => drainServer(x, pickId()),
          (x) => undrainServer(x, pickId()),
          (x) => setSlow(x, pickId(), rng.chance(0.5) ? 3 : 1),
          (x) => setLeak(x, pickId(), rng.chance(0.3) ? 100 : 0),
          (x) => burst(x, 2, 5000),
          (x) => setLbUp(x, rng.chance(0.7)),
          (x) => setRedisUp(x, rng.chance(0.5)),
          (x) => configure(x, { algo: rng.pick(algos) }),
          (x) => configure(x, { lambda: rng.range(0, 40) }),
          (x) => configure(x, { workload: rng.pick(['api', 'io', 'cpu'] as const) }),
          (x) => configure(x, { healthCheck: { enabled: rng.chance(0.7), intervalMs: rng.pick([1000, 2000, 5000]), unhealthyThreshold: rng.int(1, 4) } }),
          (x) => configure(x, { passive: { enabled: rng.chance(0.5) }, retry: rng.chance(0.5), failOpen: rng.chance(0.3) }),
          (x) => configure(x, { sessions: { affinity: rng.pick(['none', 'cookie', 'hash'] as const), store: rng.pick(['local', 'redis'] as const) } }),
          (x) => configure(x, { clients: { mode: rng.pick(['perRequest', 'keepAlive', 'pool'] as const) }, layer: rng.pick(['L4', 'L7'] as const) }),
          (x) => {
            everUnbounded = true
            configure(x, { unboundedWorkers: rng.chance(0.5) })
          },
          (x) => addServer(x, { id: `n${x.t}`, name: 'N', vcpu: rng.pick([1, 2, 4]), ramGB: rng.pick([1, 2, 4, 8]) }),
          (x) => removeServer(x, pickId()),
          (x) => resizeServer(x, pickId(), rng.pick([1, 2, 4]), rng.pick([2, 4, 8])),
          (x) => setReady(x, pickId(), rng.chance(0.5)),
          (x) => terminateServer(x, pickId()),
          (x) => setDnsRecord(x, pickId(), rng.chance(0.5)),
          (x) => routeManual(x, pickId()),
          (x) => configure(x, { profile: rng.pick([{ kind: 'constant' }, { kind: 'waves', amplitude: 0.8, periodS: 10 }] as const) }),
        ]
        for (let k = 0; k < 80; k++) {
          runUntil(s, s.t + 1500)
          rng.pick(actions)(s)
          checkInvariants(s, `${mode} seed ${seed} action ${k}`, !everUnbounded)
        }
      }
    })
  }
})

/* ====================================================================== */

describe('presets', () => {
  test('every printed `expected` number is what the engine produces', () => {
    for (const [id, sc] of Object.entries(SCENARIOS)) {
      const r = runPreset(id as keyof typeof SCENARIOS)
      const ex = sc.expected as Record<string, number>
      const check = (key: string, actual: number, tol: number) => {
        if (key in ex) near(actual, ex[key], tol, `${id}.${key}`)
      }
      check('okRps', r.okRps, 0.05)
      check('errPct', r.errPct, 0.1)
      check('p95Ms', r.p95 ?? NaN, 10)
      check('cpuPct', 100 * (r.servers[0]?.cpu ?? NaN), 1)
      check('ooms', r.ooms, 0)
      check('sessionLost', r.sessionLost, 0)
      check('ok', r.ok, 0)
      check('maxShare', Math.max(...r.servers.map((x) => x.share)), 1e-9)
      check('droppedRefused', r.errors.refused, 0)
      check('failedBeforeDetection', r.incidents[0]?.failedBeforeDetection ?? NaN, 0)
      check('detectionMs', r.incidents[0] ? r.incidents[0].detectedAt! - r.incidents[0].t0 : NaN, 0)
      check('s3Share', r.servers[2]?.share ?? NaN, 0.005)
      if ('okRpsBelow' in ex) assert.ok(r.okRps < ex.okRpsBelow, id)
    }
    near(runPreset('l05-sessions-local', { sessions: { enabled: true, store: 'local', affinity: 'cookie' } }).sessionLost, 0, 0)
    near(runPreset('l05-sessions-local', { sessions: { enabled: true, store: 'redis', affinity: 'none' } }).sessionLost, 0, 0)
    near(runPreset('l04-slow-disk', { algo: 'lc' }).errPct, 0.1, 0.05)
    const shut = SCENARIOS['l14-shutdown'].expected
    assert.equal(runPreset('l14-shutdown', { service: { sigterm: 'graceful' } }).errors.refused, shut.gracefulDroppedRefused)
    assert.equal(runPreset('l14-shutdown', { service: { sigterm: 'graceful', preStopSleepS: 5 } }).errors.total, shut.preStopDroppedRefused)
  })
  test('every scenario runs and is reproducible', () => {
    for (const id of Object.keys(SCENARIOS) as (keyof typeof SCENARIOS)[]) {
      const a = runPreset(id)
      const b = runPreset(id)
      assert.equal(a.ok, b.ok, id)
      assert.equal(a.errors.total, b.errors.total, id)
      checkInvariants(a.state, id)
    }
  })
  test('createScenario schedules the scripted actions for a live replay', () => {
    const s = createScenario('l05-incident')
    runUntil(s, 61_000)
    assert.equal(s.servers[2].proc, 'crashed')
  })
})
