/**
 * E1 Promet – regression tests for the second review (model + API lenses). One describe per finding.
 * Run: node --test src/engines/traffic/*.test.ts
 */
import {
  SCENARIOS,
  SLOW_FAULT_LABEL,
  TIMING,
  activeOf,
  addServer,
  affectedUsers,
  algoLabel,
  assignKeys,
  burst,
  capacityReport,
  configure,
  cpuOf,
  crashServer,
  createScenario,
  createTraffic,
  createYear,
  defaultConfig,
  defaultRack,
  drainServer,
  endpointSlice,
  errorLabel,
  findRequest,
  hangServer,
  finishYear,
  flightProgress,
  formulaAvailability,
  hitShares,
  keyShares,
  latencyFloorMs,
  mark,
  mergeConfigInput,
  metrics,
  nowMs,
  podSet,
  powerOff,
  probeTimeline,
  pushEvent,
  recentEvents,
  removeServer,
  resetHits,
  resetWeights,
  resolveYearConfig,
  routeManual,
  routeSequence,
  runPreset,
  runScenario,
  runUntil,
  sendRequest,
  serversView,
  setAlgo,
  setLbUp,
  setLeak,
  setMode,
  setReady,
  setRedisUp,
  setSelected,
  setServerSize,
  setSlow,
  setWeight,
  since,
  singleServer,
  step,
  terminateServer,
  tick,
  timeoutTradeoff,
  workersOf,
  yearReport,
  type TrafficConfigInput,
  type TrafficState,
} from './index.ts'
import { assert, describe, near, test, within } from './testing.ts'

const rack = (): TrafficConfigInput => ({ seed: 42, mode: 'lb', servers: defaultRack(), workload: 'api' })

function codes(s: TrafficState): Record<string, number> {
  const m: Record<string, number> = {}
  for (const e of s.errs) m[`${e.code}/${e.reason}`] = (m[`${e.code}/${e.reason}`] ?? 0) + 1
  return m
}

/* ====================================================================== */

describe('error codes follow the data path (model #1, api #2)', () => {
  test('Service mode: a crashed Pod and 0 endpoints are refused connections, never 502/503', () => {
    const s = createTraffic({ seed: 42, mode: 'service', servers: podSet(4), lambda: 8 })
    runUntil(s, 5000)
    crashServer(s, 'pod1', { autoRestart: false })
    runUntil(s, 8000)
    assert.ok(s.totals.refused > 0)
    for (const v of s.servers) setReady(s, v.id, false)
    runUntil(s, 30_000)
    assert.equal(s.totals.e502, 0)
    assert.equal(s.totals.e503, 0)
    assert.ok(s.errs.some((e) => e.code === 'refused' && e.reason === 'noBackend'))
    assert.ok(s.events.some((e) => e.text.includes('kube-proxy odbija vezu')))
  })
  test('L4 classic LB: crash → refused (no HTTP to send a 502 with); L7 → 502', () => {
    for (const layer of ['L4', 'L7'] as const) {
      const s = createTraffic({ ...rack(), layer, lambda: 15, algo: 'lc' })
      runUntil(s, 10_000)
      crashServer(s, 's3')
      runUntil(s, 20_000)
      if (layer === 'L4') {
        assert.equal(s.totals.e502, 0)
        assert.ok(s.totals.refused > 10)
      } else {
        assert.ok(s.totals.e502 > 10)
        assert.equal(s.totals.refused, 0)
      }
    }
  })
  test('errorLabel: a timeout without a proxy has no status code', () => {
    assert.equal(errorLabel(504), '504 isteklo vrijeme')
    assert.equal(errorLabel(504, 'lb'), '504 isteklo vrijeme')
    assert.equal(errorLabel(504, 'service'), 'isteklo vrijeme (klijent odustao)')
    assert.equal(errorLabel('refused', 'service'), 'odbijena veza')
  })
})

describe('passive check counts only connection failures (model #2)', () => {
  test('healthy rack, LC, λ 30, 300 s: passive on = passive off (0.60 %), no ejections – no cascade from client timeouts', () => {
    const off = runScenario({ config: { ...rack(), lambda: 30, algo: 'lc' }, measureS: 300 })
    const on = runScenario({ config: { ...rack(), lambda: 30, algo: 'lc', passive: { enabled: true } }, measureS: 300 })
    near(off.errPct, 0.6, 0.05)
    assert.equal(on.errors.total, off.errors.total)
    assert.equal(on.state.events.filter((e) => e.kind === 'ejected').length, 0)
  })
  test('L05 crash at λ 15: passive and retry each meet „< 2 % in the 30 s after” (retry + passive used to cascade to 4.77 %)', () => {
    const window = (cfg: TrafficConfigInput) => runScenario({ config: { ...rack(), lambda: 15, algo: 'lc', ...cfg }, warmupS: 20, measureS: 30, actions: [{ atS: 20, run: (s) => crashServer(s, 's3') }] })
    const none = window({})
    const retry = window({ retry: true })
    const passive = window({ passive: { enabled: true } })
    const both = window({ retry: true, passive: { enabled: true } })
    near(none.errPct, 9.6, 0.1, 'black hole without protection')
    for (const r of [retry, passive, both]) assert.ok(r.errPct < 2, `${r.errPct}`)
    assert.equal(both.incidents[0].failedBeforeDetection, 4, 'only the 4 requests inside S3 at the crash')
    assert.deepEqual(
      both.state.events.filter((e) => e.kind === 'ejected').map((e) => e.server),
      ['s3'],
      'only the crashed server is ejected – no cascade onto the busy survivors',
    )
  })
  test('a hung server is not passively ejected by client timeouts (only active probes catch a hang)', () => {
    const s = createTraffic({ ...rack(), lambda: 15, passive: { enabled: true }, healthCheck: { enabled: false } })
    runUntil(s, 5000)
    s.servers[2].proc = 'hung'
    runUntil(s, 20_000)
    assert.ok(s.totals.e504 > 0)
    assert.equal(s.servers[2].ejectedUntil, 0)
  })
})

describe('connect timeout is a 504 (model #3)', () => {
  test('powerOff behind an L7 LB: 504/connectTimeout after 1 s (sim); L4 closes the connection', () => {
    const s = createTraffic({ ...rack(), lambda: 15, algo: 'lc' })
    runUntil(s, 10_000)
    powerOff(s, 's3')
    runUntil(s, 20_000)
    const c = codes(s)
    assert.ok((c['504/connectTimeout'] ?? 0) > 0)
    assert.equal(c['502/connectTimeout'], undefined)
    assert.ok(s.events.some((e) => e.text.includes('504 Gateway Timeout')))
    const l4 = createTraffic({ ...rack(), layer: 'L4', lambda: 15, algo: 'lc' })
    runUntil(l4, 10_000)
    powerOff(l4, 's3')
    runUntil(l4, 20_000)
    assert.ok((codes(l4)['refused/connectTimeout'] ?? 0) > 0)
    assert.equal(TIMING.connectTimeoutAlb.real, 10_000)
  })
  test('retry after a connect timeout still works and counts for the passive check', () => {
    const s = createTraffic({ ...rack(), lambda: 15, retry: true, passive: { enabled: true }, healthCheck: { enabled: false } })
    runUntil(s, 10_000)
    powerOff(s, 's2')
    runUntil(s, 15_000)
    assert.ok(s.totals.retried > 0)
    assert.ok(s.servers[1].ejectedUntil > 0, 'ejected after the first connect timeout')
  })
})

describe('drain is live and has a deregistration delay (model #4, api #11)', () => {
  test('L4 keep-alive: pinned connections keep sending until the delay closes them; „safe” only after that; removal drops 0', () => {
    const s = createTraffic({ ...rack(), layer: 'L4', lambda: 10, algo: 'wrr', clients: { mode: 'keepAlive' } })
    runUntil(s, 20_000)
    assert.ok(drainServer(s, 's2'))
    const v = s.servers[1]
    let routedAfter = 0
    let safeWhileBusy = 0
    let r0 = v.routed
    while (s.t < 60_000) {
      tick(s)
      if (v.routed !== r0) {
        routedAfter += v.routed - r0
        r0 = v.routed
        assert.ok(s.t <= 20_000 + TIMING.deregistrationDelay.sim + 10, 'no request after the deregistration delay')
      }
      const sv = serversView(s)[1]
      if (sv.safeToRemove && sv.active > 0) safeWhileBusy++
    }
    assert.ok(routedAfter > 0, 'pinned connections still carried requests during the delay')
    assert.equal(safeWhileBusy, 0, 'never „sigurno za uklanjanje” with requests inside')
    assert.ok(v.drained && v.deregistered)
    assert.ok(s.events.some((e) => e.kind === 'deregister'))
    const failed = s.totals.e502 + s.totals.e503 + s.totals.e504 + s.totals.refused
    assert.ok(removeServer(s, 's2'))
    assert.equal(s.totals.e502 + s.totals.e503 + s.totals.e504 + s.totals.refused, failed, 'drain, then remove = 0 failures')
  })
  test('drained is recomputed (not latched); routeManual refuses a draining server', () => {
    const s = createTraffic({ ...rack(), lambda: 5, algo: 'manual' })
    runUntil(s, 2000)
    drainServer(s, 's1')
    assert.equal(routeManual(s, 's1'), false)
    assert.ok(routeManual(s, 's2'))
    const v = s.servers[0]
    runUntil(s, 3000)
    assert.ok(v.drained)
    v.inflight.push({ ...s.servers[1].inflight[0], id: 999_999, done: false })
    tick(s)
    assert.equal(v.drained, false, 'work inside → not safe')
    v.inflight.length = 0
    tick(s)
    assert.ok(v.drained)
  })
})

describe('presets deep-merge overrides (model #5, api #12)', () => {
  test('restating the default interval keeps the card number 37 and stagger: false', () => {
    assert.equal(runPreset('l05-incident', { healthCheck: { intervalMs: 2000 } }).incidents[0].failedBeforeDetection, 37)
    const s = createScenario('l05-incident', { healthCheck: { unhealthyThreshold: 2 }, lifecycle: { warmupMs: 3000 } })
    assert.equal(s.cfg.healthCheck.stagger, false)
    assert.equal(s.cfg.lifecycle.autoRestart, false)
    const m = mergeConfigInput({ service: { sigterm: 'immediate', readiness: { periodMs: 5000 } } }, { service: { readiness: { failureThreshold: 1 } } })
    assert.deepEqual(m.service, { sigterm: 'immediate', readiness: { periodMs: 5000, failureThreshold: 1 } })
  })
  test('live replays pre-roll so the incident shows within seconds; the run is identical to waiting', () => {
    const live = createScenario('l05-incident')
    assert.equal(live.t, 55_000)
    runUntil(live, 70_000)
    const waited = createScenario('l05-incident', {}, { prerollS: 0 })
    runUntil(waited, 70_000)
    assert.deepEqual(live.totals, waited.totals)
    assert.equal(live.incidents[0].failedBeforeDetection, 37)
    for (const sc of Object.values(SCENARIOS)) within((sc.actions[0]?.atS ?? 0) - ('prerollS' in sc ? sc.prerollS : 0), 0, 10, `${sc.id} action within 10 s`)
  })
})

describe('N+1 needs headroom (model #6)', () => {
  test('default rack at λ 15 fails N+1 (ρ = 1 after losing S3); at λ 12 it passes', () => {
    const s = createTraffic({ ...rack(), lambda: 15 })
    runUntil(s, 1000)
    const r = capacityReport(s)
    near(r.utilisationAfterFailure, 1, 1e-9)
    assert.equal(r.ok, false)
    configure(s, { lambda: 12 })
    runUntil(s, 2000)
    assert.ok(capacityReport(s).ok)
  })
  test('the 0.8 target is the engine’s own boundary: S1+S2 at ρ 0.8 < 1 % errors, at ρ 1 ≈ 6 %', () => {
    const servers = defaultRack().slice(0, 2)
    const ok = runScenario({ config: { seed: 42, mode: 'lb', servers, lambda: 12, algo: 'wrr' }, measureS: 300 })
    const full = runScenario({ config: { seed: 42, mode: 'lb', servers, lambda: 15, algo: 'wrr' }, measureS: 300 })
    assert.ok(ok.errPct < 1, `${ok.errPct}`)
    near(full.errPct, 6.1, 0.2)
  })
})

describe('changing the probe interval takes effect at once (model #7)', () => {
  test('10 s → 1 s, then crash: detected within U·interval = 2 s', () => {
    const s = createTraffic({ ...rack(), lambda: 15, algo: 'rr' })
    configure(s, { healthCheck: { intervalMs: 10_000 } })
    runUntil(s, 10_010)
    configure(s, { healthCheck: { intervalMs: 1000 } })
    for (const v of s.servers) assert.ok(v.nextProbe <= s.t + 1000)
    crashServer(s, 's1')
    const t0 = s.t
    runUntil(s, 30_000)
    within(s.incidents[0].detectedAt! - t0, 1000, 2000, 'detection ms')
  })
  test('Service readiness period change reschedules too', () => {
    const s = createTraffic({ seed: 42, mode: 'service', servers: podSet(2), lambda: 2, service: { readiness: { periodMs: 10_000 } } })
    runUntil(s, 1000)
    configure(s, { service: { readiness: { periodMs: 1000 } } })
    for (const v of s.servers) assert.ok(v.nextProbe <= s.t + 1000)
  })
})

describe('charts never show 0 ms for „no data” (model #8, api #13)', () => {
  test('p95 series is NaN during an outage; goodput series uses the 5 s stat window', () => {
    const s = createTraffic({ seed: 42, mode: 'direct', lambda: 5 })
    runUntil(s, 30_000)
    assert.ok(Number.isFinite(s.series.p95.last()))
    near(s.series.goodput.last(), metrics(s).goodput, 1e-9, 'chart = stat')
    powerOff(s, 's1')
    runUntil(s, 60_000)
    assert.ok(Number.isNaN(s.series.p95.last()))
    assert.equal(metrics(s).p95, null)
    assert.ok(s.series.p95.values.every((v) => Number.isNaN(v) || v > 0), 'never 0')
  })
})

describe('serving-terminating fallback (model #9)', () => {
  test('both Pods terminating with preStop sleep 10: requests keep succeeding, no refusals', () => {
    const s = createTraffic({ seed: 42, mode: 'service', servers: podSet(2), lambda: 6, service: { preStopSleepS: 10 } })
    runUntil(s, 10_000)
    terminateServer(s, 'pod1')
    terminateServer(s, 'pod2')
    const before = { ...s.totals }
    runUntil(s, 18_500)
    assert.ok(s.totals.ok - before.ok > 40)
    assert.equal(s.totals.refused - before.refused, 0)
    assert.equal(s.totals.e503 - before.e503, 0)
  })
  test('with a ready endpoint left, terminating ones get no new connections', () => {
    const s = createTraffic({ seed: 42, mode: 'service', servers: podSet(2), lambda: 6, service: { preStopSleepS: 10 } })
    runUntil(s, 10_000)
    terminateServer(s, 'pod1')
    runUntil(s, 11_100)
    resetHits(s)
    runUntil(s, 18_000)
    assert.equal(hitShares(s)[0].hits, 0)
  })
})

describe('Service crash narration and CrashLoopBackOff (model #10)', () => {
  test('restarts at once, then after 10, 20, 40, 80 s (kubelet back-off, same as E3); honest texts', () => {
    const s = createTraffic({ seed: 42, mode: 'service', servers: podSet(2), lambda: 2 })
    runUntil(s, 5000)
    const delays: number[] = []
    for (let k = 0; k < 5; k++) {
      crashServer(s, 'pod1')
      const t0 = s.t
      while (s.servers[0].proc === 'crashed') tick(s)
      delays.push(s.t - t0)
      runUntil(s, s.t + 5000)
    }
    assert.deepEqual(delays, [10, 10_010, 20_010, 40_010, 80_010])
    const texts = s.events.filter((e) => e.server === 'pod1').map((e) => e.text)
    assert.ok(!texts.some((t) => t.includes('bez ponovnog pokretanja')), 'a crash is not a readiness failure')
    assert.ok(texts.some((t) => t.includes('kubelet ponovno pokreće kontejner')))
    assert.ok(s.events.some((e) => e.text.includes('CrashLoopBackOff')))
    assert.ok(!texts.some((t) => t.includes('nadzornik')))
  })
  test('readiness failure says „bez ponovnog pokretanja”; LB mode keeps the 6 s supervisor restart', () => {
    const s = createTraffic({ seed: 42, mode: 'service', servers: podSet(2), lambda: 2 })
    setReady(s, 'pod1', false)
    runUntil(s, 10_000)
    assert.ok(s.events.some((e) => e.text.includes('bez ponovnog pokretanja')))
    const l = createTraffic(rack())
    crashServer(l, 's1')
    assert.equal(l.servers[0].procUntil, 6000)
  })
})

describe('CPU slowdown is labelled as a CPU fault (model #11)', () => {
  test('setSlow narrates a slower processor, not a slow disk; S3 shows 100 % CPU', () => {
    const s = createTraffic({ ...rack(), lambda: 15, algo: 'wrr' })
    runUntil(s, 10_000)
    setSlow(s, 's3', 3)
    runUntil(s, 40_000)
    const e = s.events.find((x) => x.kind === 'slow')!
    assert.ok(e.text.includes('procesor') && !e.text.includes('disk'))
    near(cpuOf(s.servers[2]), 1, 0.01)
    assert.equal(SLOW_FAULT_LABEL, 'Sporiji procesor')
    assert.ok(!SCENARIOS['l04-slow-disk'].title.includes('disk'))
  })
})

describe('consistent hash honours fractional weights (model #12)', () => {
  test('0.4 and 1.4 are no longer 1 and 1', () => {
    const keys = Array.from({ length: 20_000 }, (_, i) => `k${i}`)
    const share = (w: number) => keyShares(assignKeys(keys, [{ id: 's1', weight: w }, { id: 's2', weight: 1 }, { id: 's3', weight: 1 }], 'ring')).s1
    const s04 = share(0.4)
    const s1 = share(1)
    const s14 = share(1.4)
    assert.ok(s04 > 0.1 && s04 < s1 && s1 < s14, `${s04} < ${s1} < ${s14}`)
    near(s04, 0.4 / 2.4, 0.04)
  })
})

describe('hash on the source IP (model #13, api #15)', () => {
  test('hashKey ip: a NAT campus lands on one server; hashKey user spreads it', () => {
    const run = (hashKey: 'user' | 'ip', algo: 'hash' | 'chash') =>
      runScenario({ config: { ...rack(), lambda: 10, algo, clients: { nat: true }, sessions: { hashKey } }, measureS: 30 }).servers.map((x) => x.share)
    for (const algo of ['hash', 'chash'] as const) {
      assert.equal(Math.max(...run('ip', algo)), 1, algo)
      assert.equal(run('user', algo).filter((x) => x > 0.1).length, 3, `${algo}: 20 users spread over all 3 servers`)
    }
    assert.equal(algoLabel('hash', 'ip'), 'IP hash mod N')
    assert.equal(algoLabel('rr', 'ip'), 'Kružno')
    const bad = createTraffic({ sessions: { hashKey: 'nonsense' as 'ip' } })
    assert.equal(bad.cfg.sessions.hashKey, 'user')
  })
})

describe('sendRequest / findRequest / routeSequence (model #14, api #4)', () => {
  test('one request, followed by id; seeded arrivals are not disturbed', () => {
    const a = createTraffic({ ...rack(), lambda: 10 })
    const b = createTraffic({ ...rack(), lambda: 10 })
    runUntil(a, 5000)
    runUntil(b, 5000)
    const id = sendRequest(b, { client: 3 })!
    assert.ok(id > 0)
    const loc = findRequest(b, id)!
    assert.equal(loc.phase, 'inflight')
    assert.equal(loc.req!.client, 3)
    assert.ok(loc.req!.manual)
    runUntil(a, 20_000)
    runUntil(b, 20_000)
    assert.equal(b.totals.arrived, a.totals.arrived + 1)
    assert.equal(findRequest(b, id)!.phase, 'done')
    assert.equal(sendRequest(b, { client: 999 }), null)
    assert.equal(findRequest(b, -5), null)
  })
  test('works in every mode: manual waits at the LB, Service picks a ready Pod, 0 endpoints is refused', () => {
    const m = createTraffic({ ...rack(), lambda: 0, algo: 'manual' })
    const id = sendRequest(m)!
    assert.equal(findRequest(m, id)!.phase, 'pending')
    const svc = createTraffic({ seed: 42, mode: 'service', servers: podSet(3), lambda: 0 })
    const sid = sendRequest(svc, { cpuMs: 50, ioMs: 0 })!
    assert.ok(findRequest(svc, sid)!.server!.startsWith('pod'))
    runUntil(svc, 1000)
    assert.equal(findRequest(svc, sid)!.done!.outcome, 'ok')
    const empty = createTraffic({ seed: 42, mode: 'service', servers: [], lambda: 0 })
    const eid = sendRequest(empty)!
    assert.equal(findRequest(empty, eid)!.done!.outcome, 'refused')
  })
  test('ladder: the same 12 requests for every algorithm; RR cycles, WRR follows 1:2:4', () => {
    const rr = routeSequence({ ...rack(), algo: 'rr' })
    const wrr = routeSequence({ ...rack(), algo: 'wrr' })
    const lc = routeSequence({ ...rack(), algo: 'lc' })
    assert.equal(rr.length, 12)
    assert.deepEqual(rr.map((x) => x.cpuMs), lc.map((x) => x.cpuMs))
    assert.deepEqual(rr.map((x) => x.server).join(','), 's1,s2,s3,s1,s2,s3,s1,s2,s3,s1,s2,s3')
    const n3 = wrr.filter((x) => x.server === 's3').length
    within(n3, 6, 8, 'WRR sends ≈4/7 to S3')
    assert.deepEqual(routeSequence({ ...rack(), algo: 'lc' }), lc, 'deterministic')
    assert.deepEqual(routeSequence(rack(), NaN), [])
  })
})

describe('configure every frame (api #1)', () => {
  test('an unchanged profile does not restart the profile clock (waves keep moving)', () => {
    const WAVES = { kind: 'waves' as const, amplitude: 0.5, periodS: 10 }
    const a = createTraffic({ ...rack(), lambda: 10 })
    const b = createTraffic({ ...rack(), lambda: 10, profile: WAVES })
    const offered: number[] = []
    for (let i = 0; i < 1200; i++) {
      configure(a, { lambda: 10, profile: WAVES, arrivals: 'poisson' })
      step(a, 1 / 60)
      step(b, 1 / 60)
      if (i % 120 === 0) offered.push(a.offeredNow)
    }
    assert.ok(Math.max(...offered) > 14 && Math.min(...offered) < 6, offered.join(' '))
    near(a.offeredNow, b.offeredNow, 1e-9)
    configure(a, { profile: { kind: 'waves', amplitude: 0.3, periodS: 10 } })
    assert.equal(a.profileT0, a.t, 'a changed profile restarts the clock')
  })
  test('runtime patch type excludes fields that only work at creation', () => {
    const s = createTraffic(rack())
    // @ts-expect-error servers are changed with addServer / removeServer / setServerSize, not configure()
    configure(s, { servers: [] })
    assert.equal(s.servers.length, 3)
  })
})

describe('Service lab support: selector, Pod metadata, hard-coded Pod IP (api #3)', () => {
  test('setSelected(false): Pod leaves the EndpointSlice after the lag, stays up and ready; all unselected → refused', () => {
    const s = createTraffic({ seed: 42, mode: 'service', servers: podSet(2), lambda: 6 })
    runUntil(s, 3000)
    assert.ok(setSelected(s, 'pod1', false))
    assert.equal(setSelected(s, 'pod1', false), false)
    assert.deepEqual(endpointSlice(s).map((e) => e.id), ['pod2'])
    assert.equal(serversView(s)[0].routing, 'notSelected')
    runUntil(s, 4010)
    resetHits(s)
    runUntil(s, 10_000)
    assert.equal(s.servers[0].hits, 0)
    assert.equal(s.servers[0].proc, 'up')
    assert.ok(s.servers[0].serving, 'still Ready – only the selector changed')
    setSelected(s, 'pod2', false)
    runUntil(s, 12_000)
    const before = s.totals.refused
    runUntil(s, 15_000)
    assert.ok(s.totals.refused - before > 10, '0 endpoints while every Pod is healthy')
    assert.ok(s.events.some((e) => e.kind === 'selector' && e.text.includes('Pod radi i spreman je')))
    setSelected(s, 'pod1', true)
    runUntil(s, 17_000)
    assert.ok(metrics(s).goodput > 0)
  })
  test('meta passes through; pinTo dials one Pod directly and breaks when that Pod is gone', () => {
    const servers = podSet(3).map((p, i) => ({ ...p, meta: { version: '1.4.0', ip: `10.244.2.${15 + i}` } }))
    const s = createTraffic({ seed: 42, mode: 'service', servers, lambda: 4, clients: { pinTo: 'pod2' }, service: { sigterm: 'immediate' } })
    assert.equal(serversView(s)[1].meta.ip, '10.244.2.16')
    assert.equal(endpointSlice(s)[0].meta.version, '1.4.0')
    runUntil(s, 10_000)
    assert.equal(hitShares(s).find((h) => h.id === 'pod2')!.share, 1)
    terminateServer(s, 'pod2')
    runUntil(s, 15_000)
    assert.ok(!s.servers.some((v) => v.id === 'pod2'))
    const before = s.totals.refused
    runUntil(s, 20_000)
    assert.ok(s.totals.refused - before > 10)
    assert.ok(s.errs.some((e) => e.reason === 'noRoute'))
    configure(s, { clients: { pinTo: null } })
    runUntil(s, 25_000)
    assert.ok(metrics(s).goodput > 2, 'through the Service again')
  })
})

describe('instant resize and weights (api #5)', () => {
  test('setServerSize changes W at once, no downtime, no failures, CPU stays ≤ 100 %', () => {
    const s = createTraffic({ seed: 42, mode: 'direct', servers: singleServer(8, 16), workload: 'api', lambda: 30 })
    runUntil(s, 10_000)
    const failed = s.totals.e503 + s.totals.e504 + s.totals.refused
    assert.ok(setServerSize(s, 's1', { vcpu: 1, ramGB: 2 }))
    assert.equal(s.servers[0].proc, 'up')
    assert.equal(workersOf(s, s.servers[0]), 6)
    assert.ok(cpuOf(s.servers[0]) <= 1)
    assert.equal(s.totals.e503 + s.totals.e504 + s.totals.refused, failed, 'nothing dropped by the resize itself')
    runUntil(s, 12_000)
    assert.ok(s.servers[0].inflight.length <= 6)
    assert.equal(setServerSize(s, 's1', { vcpu: 1 }), false, 'same size')
    assert.equal(setServerSize(s, 's1', { vcpu: NaN }), false)
    assert.ok(setServerSize(s, 's1', { ramGB: 8 }, { downtime: true }))
    assert.equal(s.servers[0].proc, 'off', 'downtime → resizeServer')
  })
  test('resetWeights recomputes 1 : 2 : 4 after a change; setWeight logs and refuses no-ops', () => {
    const s = createTraffic({ ...rack(), algo: 'wrr' })
    assert.ok(setWeight(s, 's1', 5))
    assert.equal(setWeight(s, 's1', 5), false)
    assert.ok(s.events.some((e) => e.kind === 'weight'))
    assert.ok(resetWeights(s))
    assert.deepEqual(s.servers.map((v) => v.weight), [1, 2, 4])
    setServerSize(s, 's1', { vcpu: 4, ramGB: 8 })
    resetWeights(s)
    assert.deepEqual(s.servers.map((v) => v.weight), [2, 1, 2])
  })
})

describe('accounting for goals and the capstone (api #7)', () => {
  test('per-user failures, affected users, per-server totals, mark/since, sessions lost per incident', () => {
    const s = createTraffic({ ...rack(), lambda: 15, algo: 'lc', sessions: { enabled: true, store: 'local', affinity: 'cookie' } })
    runUntil(s, 10_000)
    assert.equal(affectedUsers(s), 0)
    const m = mark(s)
    crashServer(s, 's3')
    runUntil(s, 40_000)
    const w = since(s, m)
    assert.equal(w.errors.total, s.totals.e502 + s.totals.e503 + s.totals.e504 + s.totals.refused)
    assert.equal(w.ok + w.errors.total + (w.arrived - w.ok - w.errors.total), w.arrived)
    near(w.durationS, 30, 1e-9)
    assert.ok(w.p95 !== null)
    const affected = affectedUsers(s, m.t)
    assert.ok(affected > 0 && affected <= 20)
    assert.equal(s.clients.reduce((a, c) => a + c.failed, 0), w.errors.total)
    assert.ok(s.servers[2].errTotals[502] > 0)
    assert.equal(s.servers[2].errTotals[502], s.totals.e502, 'every 502 came from the crashed S3 (errs only keeps 10 s; errTotals keeps all)')
    assert.equal(s.servers[0].errTotals[502] + s.servers[1].errTotals[502], 0)
    assert.equal(serversView(s)[2].errTotals[502], s.servers[2].errTotals[502])
    const inc = s.incidents[0]
    assert.ok(inc.sessionsLost > 0, 'cookie users of S3 lost their carts')
    assert.ok(inc.sessionsLost <= s.totals.sessionLost)
    assert.ok(s.errs.every((e) => e.client >= 0))
  })
  test('state.recent: queue + CPU + I/O = latency for every success (trace waterfall)', () => {
    const s = createTraffic({ ...rack(), lambda: 15, algo: 'rr' })
    runUntil(s, 30_000)
    assert.equal(s.recent.length, 200)
    const oks = s.recent.filter((d) => d.outcome === 'ok')
    assert.ok(oks.length > 150)
    for (const d of oks) {
      near(d.queueMs + d.cpuMs + d.ioMs, d.tEnd - d.t0, 1e-6, `req ${d.id}`)
      near(d.ioMs, 300, 1e-6, 'API I/O is a fixed 300 ms')
      assert.ok(d.cpuMs > 0 && d.queueMs >= 0)
    }
  })
  test('switching the session store is a config change, not 20 lost sessions', () => {
    const s = createTraffic({ ...rack(), lambda: 10, algo: 'wrr', sessions: { enabled: true, store: 'local', affinity: 'cookie' } })
    runUntil(s, 20_000)
    const lost = s.totals.sessionLost
    configure(s, { sessions: { store: 'redis' } })
    runUntil(s, 40_000)
    assert.equal(s.totals.sessionLost, lost)
    setRedisUp(s, false)
    runUntil(s, 50_000)
    assert.ok(s.totals.sessionLost > lost, 'Redis down still logs everyone out')
  })
})

describe('flights tell cause and effect (api #8)', () => {
  test('a retry leaves the LB only after the failed attempt bounced back', () => {
    const s = createTraffic({ ...rack(), lambda: 15, algo: 'lc', retry: true, healthCheck: { stagger: false } })
    runUntil(s, 5000)
    crashServer(s, 's3')
    let checked = 0
    for (let i = 0; i < 100 && checked === 0; i++) {
      tick(s)
      for (const b of s.flights.filter((f) => f.bounce)) {
        const first = s.flights.find((f) => f.reqId === b.reqId && f.dir === 'in' && f.to === 's3')
        const retry = s.flights.find((f) => f.reqId === b.reqId && f.dir === 'in' && f.from === 'lb')
        if (!first || !retry) continue
        assert.equal(b.t0, first.t0 + first.durationMs, 'bounce starts when the first dot arrives')
        assert.equal(retry.t0, b.t0 + b.durationMs, 'retry starts when the bounce reaches the LB')
        checked++
      }
    }
    assert.ok(checked > 0)
  })
  test('LB down and a Service without endpoints still draw dots that die where they were refused', () => {
    const s = createTraffic({ ...rack(), lambda: 15 })
    runUntil(s, 5000)
    setLbUp(s, false)
    const id0 = s.nextFlightId
    runUntil(s, 7000)
    assert.ok(s.nextFlightId - id0 > 20, 'a dot for every refused request (flights leave the array when they land)')
    const made = s.flights.filter((f) => f.id >= id0)
    assert.ok(made.length > 0 && made.every((f) => f.dir === 'in' && f.from === 'client' && f.to === 'lb' && f.outcome === 'refused'))
    const svc = createTraffic({ seed: 42, mode: 'service', servers: [], lambda: 10 })
    runUntil(svc, 2000)
    assert.ok(svc.flights.length > 0 && svc.flights.every((f) => f.to === 'service' && f.outcome === 'refused'))
  })
  test('dot speed is constant between 30 fps renders (progress uses the sub-tick remainder)', () => {
    const s = createTraffic({ ...rack(), lambda: 15 })
    runUntil(s, 3000)
    const f = s.flights[s.flights.length - 1]
    const ps: number[] = []
    for (let i = 0; i < 6; i++) {
      ps.push(flightProgress(s, f))
      step(s, 1 / 30)
    }
    const d = ps.slice(1).map((p, i) => p - ps[i])
    for (const x of d) near(x, d[0], 1e-3, 'equal steps')
    assert.ok(nowMs(s) >= s.t && nowMs(s) < s.t + 10)
  })
  test('probe history for the detection-window timeline', () => {
    const s = createTraffic({ ...rack(), lambda: 15, healthCheck: { stagger: false } })
    runUntil(s, 10_500)
    crashServer(s, 's3')
    runUntil(s, 14_010)
    const tl = probeTimeline(s, 's3')!
    assert.equal(tl.intervalMs, 2000)
    assert.equal(tl.failureThreshold, 2)
    assert.ok(tl.probes.length <= 10)
    assert.deepEqual(tl.probes.slice(-3).map((p) => p.outcome), ['pass', 'fail', 'fail'])
    assert.deepEqual(tl.probes.slice(-2).map((p) => p.t), [12_000, 14_000])
    assert.equal(probeTimeline(s, 'nope'), null)
    const hung = createTraffic({ ...rack(), lambda: 5, healthCheck: { stagger: false } })
    runUntil(hung, 1000)
    hung.servers[0].proc = 'hung'
    runUntil(hung, 2010)
    const p = probeTimeline(hung, 's1')!.probes.at(-1)!
    assert.equal(p.outcome, 'timeout')
    assert.equal(p.at, p.t + 1000)
  })
})

describe('event log narrates the lesson (api #9)', () => {
  test('session losses: one summary line per 5 s, so crash and probe events stay visible', () => {
    const r = runPreset('l05-sessions-local')
    const lines = r.state.events.filter((e) => e.kind === 'sessionLost')
    within(lines.length, 12, 15, 'lines in 70 s')
    assert.ok(lines.at(-1)!.text.startsWith('Sesije izgubljene u zadnjih 5 s:'))
  })
  test('timeouts and wasted work are narrated (bufferbloat), plurals are Croatian, the burst is „Nalet”', () => {
    const r = runPreset('l02-bufferbloat')
    assert.ok(r.state.events.some((e) => e.kind === 'timeout' && e.text.includes('uzaludan posao')))
    const s = createTraffic({ ...rack(), lambda: 5, healthCheck: { healthyThreshold: 5 } })
    addServer(s, { vcpu: 1, ramGB: 2 })
    assert.ok(s.events.at(-1)!.text.includes('5 uspješnih provjera'))
    burst(s)
    assert.ok(s.events.at(-1)!.text.startsWith('Nalet:'))
    runUntil(s, 31_000)
    assert.ok(s.events.some((e) => e.kind === 'burstEnd' && e.text.startsWith('Nalet je završio')))
  })
  test('black hole, manual timeouts, setReady and hung servers are narrated', () => {
    const lc = createTraffic({ ...rack(), lambda: 15, algo: 'lc', healthCheck: { stagger: false } })
    runUntil(lc, 5000)
    crashServer(lc, 's3')
    runUntil(lc, 7000)
    assert.ok(lc.events.some((e) => e.kind === 'blackHole' && e.text.includes('crna rupa')))
    const m = createTraffic({ ...rack(), lambda: 3, algo: 'manual' })
    runUntil(m, 7000)
    assert.ok(m.events.some((e) => e.kind === 'manual'))
    const svc = createTraffic({ seed: 42, mode: 'service', servers: podSet(2), lambda: 2 })
    assert.ok(setReady(svc, 'pod1', false))
    assert.ok(svc.events.at(-1)!.text.includes('3 neuspjele provjere'))
    const off = createTraffic({ seed: 42, mode: 'direct', lambda: 5 })
    runUntil(off, 1000)
    powerOff(off, 's1')
    runUntil(off, 8000)
    assert.ok(off.events.some((e) => e.kind === 'timeout' && e.text.includes('ne odgovara')))
  })
  test('recentEvents filters by kind, server, tone and count; pushEvent adds lecture narration', () => {
    const s = createTraffic({ ...rack(), lambda: 15 })
    runUntil(s, 2000)
    crashServer(s, 's2')
    pushEvent(s, 'Davor otvara htop.')
    runUntil(s, 10_000)
    assert.equal(recentEvents(s, { kinds: ['note'] })[0].text, 'Davor otvara htop.')
    assert.ok(recentEvents(s, { server: 's2' }).every((e) => e.server === 's2'))
    assert.ok(recentEvents(s, { minTone: 'warn' }).every((e) => e.tone === 'warn' || e.tone === 'bad'))
    assert.equal(recentEvents(s, { max: 2 }).length, 2)
    assert.deepEqual(recentEvents(s, { max: 2 }), s.events.slice(-2))
  })
})

describe('unbounded workers are drawable (api #10)', () => {
  test('slots is finite, workersLabel is ∞', () => {
    const s = createTraffic({ ...rack(), unboundedWorkers: true, lambda: 5 })
    runUntil(s, 2000)
    for (const v of serversView(s)) {
      assert.equal(v.workers, Infinity)
      assert.ok(Number.isFinite(v.slots) && v.slots >= v.busy)
      assert.equal(v.unbounded, true)
      assert.equal(v.workersLabel, '∞')
      assert.equal(Array.from({ length: v.slots }).length, v.slots)
    }
    assert.equal(serversView(createTraffic(rack()))[0].workersLabel, '6')
  })
})

describe('Service defaults keep the keep-alive lesson clean (api #14)', () => {
  test('default λ is 4 in Service mode; one keep-alive client → 100 % on one Pod with no errors', () => {
    assert.equal(defaultConfig('service').lambda, 4)
    assert.equal(defaultConfig('lb').lambda, 10)
    const s = createTraffic({ mode: 'service', clients: { count: 1, mode: 'keepAlive' } })
    runUntil(s, 60_000)
    assert.equal(Math.max(...hitShares(s).map((h) => h.share)), 1)
    assert.equal(s.totals.e503 + s.totals.e504 + s.totals.refused, 0)
  })
})

describe('API consistency (api #16)', () => {
  test('every action returns a boolean (or the new id); addServer generates ids; terminating Pods do not count toward 8', () => {
    const s = createTraffic(rack())
    assert.equal(setLbUp(s, true), false)
    assert.equal(setLbUp(s, false), true)
    assert.equal(setRedisUp(s, true), false)
    assert.equal(burst(s), true)
    assert.equal(setAlgo(s, 'rr'), false)
    assert.equal(setAlgo(s, 'lc'), true)
    assert.equal(setMode(s, 'lb'), false)
    assert.equal(resetHits(s), true)
    assert.equal(addServer(s, { vcpu: 2, ramGB: 4 }), 's4')
    assert.equal(s.servers[3].name, 'S4')
    const p = createTraffic({ seed: 1, mode: 'service', servers: podSet(8), lambda: 1 })
    assert.equal(addServer(p, { vcpu: 1, ramGB: 2 }), null, 'full')
    terminateServer(p, 'pod1')
    assert.equal(addServer(p, { vcpu: 1, ramGB: 2 }), 'pod9')
    assert.equal(p.servers.at(-1)!.name, 'klopa-api-9')
  })
  test('YearEvent has t (seconds of the 10 s animation)', () => {
    const y = finishYear(createYear({ seed: 7 }))
    assert.ok(y.events.length > 0)
    for (const e of y.events) near(e.t, Math.round((e.h / y.cfg.hoursPerSecond) * 10) / 10, 1e-9)
    assert.ok(y.events.every((e) => e.t >= 0 && e.t <= 10))
  })
})

describe('L03 helpers (api #17) and latency floors (api #6)', () => {
  test('naive formula vs rack-aware formula', () => {
    const cfg = resolveYearConfig({ sameRack: true })
    const naive = formulaAvailability(cfg, { naive: true })
    const rackAware = formulaAvailability(cfg)
    near(rackAware, naive * 0.999, 1e-12)
    const r = yearReport(createYear({ sameRack: true }))
    assert.equal(r.naiveFormulaAvailability, naive)
    assert.equal(formulaAvailability(resolveYearConfig({ sameRack: false }), { naive: true }), formulaAvailability(resolveYearConfig({ sameRack: false })))
  })
  test('„Spor ili mrtav?”: longer timeouts → fewer false alarms, longer waits; seeded; total on bad input', () => {
    const rows = [200, 500, 1000, 2000, 5000].map((timeoutMs) => timeoutTradeoff({ timeoutMs }))
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i].falseAlarms <= rows[i - 1].falseAlarms)
      assert.ok(rows[i].meanUserWaitMs >= rows[i - 1].meanUserWaitMs)
      assert.equal(rows[i].crashes, rows[0].crashes, 'same hidden faults for every timeout')
    }
    assert.equal(rows[4].byCause.gcPause, 0, 'a 5 s timeout outlasts every GC pause (≤ 3 s)')
    assert.ok(rows[0].byCause.slow > 100, '200 ms flags slow-but-alive servers')
    assert.deepEqual(timeoutTradeoff({ timeoutMs: 1000, seed: 3 }), timeoutTradeoff({ timeoutMs: 1000, seed: 3 }))
    const bad = timeoutTradeoff({ timeoutMs: NaN, n: -5, latencyMs: NaN, faults: { crash: NaN, gcPauseMs: [NaN, 1] } })
    assert.equal(bad.n, 0)
    assert.equal(bad.meanUserWaitMs, 0)
  })
  test('latency floor: API p95 ≈ 899 ms, I/O p95 ≈ 1150 ms (the L02 „p95 < 1 s” goal is impossible on I/O)', () => {
    near(latencyFloorMs('api', 0.95), 899.1, 0.1)
    near(latencyFloorMs('io', 0.95), 1149.8, 0.1)
    assert.ok(Number.isNaN(latencyFloorMs('api', NaN)))
    const best = runScenario({ config: { seed: 42, mode: 'direct', servers: singleServer(8, 16), workload: 'io', lambda: 4 }, measureS: 60 })
    within(best.p95!, latencyFloorMs('io', 0.95) - 50, latencyFloorMs('io', 0.95) + 50, 'even the biggest server')
  })
})

describe('invariants still hold with the new actions', () => {
  test('conservation with sendRequest, setSelected, setServerSize, pinTo and drains mixed in', () => {
    const s = createTraffic({ seed: 9, mode: 'service', servers: podSet(4), lambda: 8, sessions: { enabled: true } })
    for (let k = 0; k < 60; k++) {
      runUntil(s, s.t + 700)
      const ids = s.servers.map((v) => v.id)
      const id = ids[k % Math.max(1, ids.length)] ?? 'none'
      switch (k % 7) {
        case 0:
          sendRequest(s)
          break
        case 1:
          setSelected(s, id, k % 2 === 0)
          break
        case 2:
          setServerSize(s, id, { vcpu: 1 + (k % 4), ramGB: 2 + (k % 3) * 2 })
          break
        case 3:
          configure(s, { clients: { pinTo: k % 3 === 0 ? id : null } })
          break
        case 4:
          drainServer(s, id)
          break
        case 5:
          crashServer(s, id)
          break
        default:
          setMode(s, k % 2 ? 'lb' : 'service')
      }
      let inside = s.pending.filter((r) => !r.done).length
      for (const v of s.servers) for (const list of [v.inflight, v.queue, v.parked, v.connecting]) for (const r of list) if (!r.done) inside++
      const t = s.totals
      assert.equal(t.arrived, t.ok + t.e502 + t.e503 + t.e504 + t.refused + inside, `step ${k}`)
      for (const v of s.servers) {
        assert.ok(cpuOf(v) <= 1 + 1e-9)
        assert.ok(v.inflight.length <= Math.max(workersOf(s, v), activeOf(v)))
      }
    }
  })
})

/* ====================================================================== */
/* Verification pass: residual defects found while re-checking the fixes above                              */
/* ====================================================================== */

describe('verification pass: residual defects', () => {
  test('session affinity „hash” uses sessions.hashKey too: hashKey ip behind one NAT → one server', () => {
    const shares = (hashKey: 'user' | 'ip') =>
      runScenario({ config: { ...rack(), lambda: 10, algo: 'rr', clients: { nat: true }, sessions: { enabled: true, affinity: 'hash', hashKey } }, measureS: 30 }).servers.map((x) => x.share)
    assert.equal(Math.max(...shares('ip')), 1, 'the whole campus has one source IP')
    assert.ok(shares('user').filter((x) => x > 0.1).length >= 2, '20 users spread')
  })

  test('CrashLoopBackOff narration uses the real delays: no false „(sim) · stvarno: 10 s” badge', () => {
    const s = createTraffic({ seed: 42, mode: 'service', servers: podSet(2), lambda: 2, maxEvents: 200 })
    runUntil(s, 5000)
    for (let k = 0; k < 3; k++) {
      crashServer(s, 'pod1')
      while (s.servers[0].proc !== 'up') tick(s)
      runUntil(s, s.t + 2000)
    }
    const texts = s.events.filter((e) => e.kind === 'crash' && e.server === 'pod1').map((e) => e.text)
    assert.equal(texts.length, 3)
    assert.ok(texts[0].endsWith('kubelet ga odmah ponovno pokreće.'))
    assert.ok(texts[1].includes('za 10 s (odgoda se udvostručuje, najviše 5 min)'), texts[1])
    assert.ok(texts[2].includes('za 20 s (odgoda se udvostručuje, najviše 5 min)'), texts[2])
    assert.ok(!s.events.some((e) => e.text.includes('(sim) · stvarno: 10 s (kubelet')))
  })

  test('drainServer is a load-balancer action: refused (with an explanation) in Service, DNS and direct mode', () => {
    const svc = createTraffic({ seed: 42, mode: 'service', servers: podSet(3), lambda: 4 })
    runUntil(svc, 5000)
    assert.equal(drainServer(svc, 'pod1'), false)
    assert.ok(svc.events.at(-1)!.text.startsWith('Kubernetes nema „isprazni”'))
    assert.equal(svc.servers[0].draining, false, 'no false „pražnjenje” state')
    resetHits(svc)
    runUntil(svc, 20_000)
    assert.ok(svc.servers[0].hits > 0, 'kube-proxy keeps routing to it – the log must not claim otherwise')
    const dns = createTraffic({ seed: 42, mode: 'dns', lambda: 4 })
    assert.equal(drainServer(dns, 's1'), false)
    assert.ok(dns.events.at(-1)!.text.includes('A zapis'))
    const direct = createTraffic({ seed: 42, mode: 'direct', lambda: 4 })
    assert.equal(drainServer(direct, 's1'), false)
    assert.ok(drainServer(createTraffic(rack()), 's2'), 'still works behind the LB')
  })

  test('setLbUp(false) needs a load balancer; switching it back on always works', () => {
    const svc = createTraffic({ seed: 42, mode: 'service', servers: podSet(3), lambda: 8 })
    runUntil(svc, 5000)
    const before = { ...svc.totals }
    assert.equal(setLbUp(svc, false), false)
    assert.equal(svc.totals.refused, before.refused, 'no request fails because of an LB that does not exist')
    assert.ok(svc.lbUp)
    assert.ok(svc.events.at(-1)!.text.includes('kube-proxy'))
    const lb = createTraffic({ ...rack(), lambda: 8 })
    assert.ok(setLbUp(lb, false))
    setMode(lb, 'service')
    assert.ok(setLbUp(lb, true), 'restoring is allowed in any mode')
    setMode(lb, 'lb')
    runUntil(lb, 10_000)
    assert.ok(metrics(lb).goodput > 4)
  })

  test('client timeouts carry „504” only behind an L7 load balancer (L4, Service and direct: no status code)', () => {
    assert.equal(errorLabel(504, 'lb', 'L7'), '504 isteklo vrijeme')
    assert.equal(errorLabel(504, 'lb', 'L4'), 'isteklo vrijeme (klijent odustao)')
    assert.equal(errorLabel(504, 'lb'), '504 isteklo vrijeme', 'layer defaults to the L7 wording')
    const narrated = (layer: 'L4' | 'L7') => {
      const s = createTraffic({ ...rack(), layer, lambda: 30, algo: 'rr' })
      runUntil(s, 30_000)
      return s.events.find((e) => e.kind === 'timeout')!.text
    }
    assert.ok(narrated('L7').includes('(504)'))
    assert.ok(!narrated('L4').includes('504') && narrated('L4').includes('(isteklo vrijeme)'))
    const svc = createTraffic({ seed: 42, mode: 'service', servers: podSet(2), lambda: 2 })
    hangServer(svc, 'pod1')
    assert.ok(!svc.events.at(-1)!.text.includes('504'))
    const l7 = createTraffic(rack())
    hangServer(l7, 's1')
    assert.ok(l7.events.at(-1)!.text.includes('(504)'))
  })

  test('setServerSize shrinking RAM: requests in progress finish (no OOM, no resets); RAM shown ≤ RAM; slots ≥ busy', () => {
    const s = createTraffic({ seed: 42, mode: 'direct', servers: singleServer(8, 16), workload: 'api', lambda: 30 })
    runUntil(s, 10_000)
    const busyBefore = s.servers[0].inflight.length
    assert.ok(busyBefore > 6, `${busyBefore} in progress, more than the new W`)
    assert.ok(setServerSize(s, 's1', { vcpu: 1, ramGB: 2 }))
    const v = serversView(s)[0]
    assert.ok(v.slots >= v.busy && v.busy === busyBefore, 'draw every busy radnik')
    assert.ok(v.ramUsedMB <= v.ramMB, `${v.ramUsedMB} ≤ ${v.ramMB}`)
    runUntil(s, 20_000)
    assert.equal(s.servers[0].ooms, 0)
    assert.equal(s.servers[0].proc, 'up')
    assert.equal(s.totals.refused, 0, 'nothing reset by the resize')
    assert.ok(s.servers[0].inflight.length <= 6)
    // a leak and unbounded workers still run out of memory
    const leak = createTraffic({ seed: 42, mode: 'direct', lambda: 4 })
    setLeak(leak, 's1', 300)
    runUntil(leak, 10_000)
    assert.ok(leak.servers[0].ooms > 0)
    assert.equal(runPreset('l02-unbounded').ooms, SCENARIOS['l02-unbounded'].expected.ooms)
  })
})
