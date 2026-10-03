/**
 * L20 release lanes (Recreate / Rolling / Blue-green / Canary) and expand/contract – curriculum L20 model.
 * Also: rollout restart (L16/L24) and Gateway weights.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ClusterState, ReleaseStrategy } from './types.ts'
import {
  advance,
  canaryReplicasFor,
  createRelease,
  findService,
  getProxyEndpoints,
  klopaApiTemplate,
  migrateSchema,
  nextCanaryStep,
  openConnections,
  presetRelease,
  presetRollout,
  processTick,
  releaseStats,
  replicaSetsOf,
  replicaSharePct,
  rollbackRelease,
  rolloutRestart,
  runUntil,
  startRelease,
  trafficTotals,
} from './index.ts'

function lane(strategy: ReleaseStrategy, o: Parameters<typeof presetRelease>[0] = {}): ClusterState {
  const s = presetRelease({ strategy, ...o })
  advance(s, 5)
  assert.equal(startRelease(s).ok, true)
  assert.equal(startRelease(s).ok, false, 'already started')
  return s
}

function versionsOfEndpoints(s: ClusterState, service = 'klopa-api'): string[] {
  return getProxyEndpoints(s, service).map((e) => s.pods.find((p) => p.id === e.podId)!.spec.app.version)
}

test('canary by replicas: requested steps snap to Pod ratios (5 → 20 %, 25 → 33 %, 50 → 50 %, 100 %)', () => {
  const k = [5, 25, 50, 100].map((p) => canaryReplicasFor(p, 4))
  assert.deepEqual(k, [1, 2, 4, 4])
  assert.deepEqual(
    [1, 2, 4].map((x) => Math.round(replicaSharePct(x, 4))),
    [20, 33, 50],
  )
  assert.equal(canaryReplicasFor(0, 4), 0)
})

test('Recreate lane: old Pods drain (still serving), then a full outage until the new ones are Ready (≈ 12 s), the bug then reaches everyone', () => {
  const s = lane('recreate')
  advance(s, 60)
  const st = releaseStats(s)!
  assert.equal(st.phase, 'done')
  // L20 model: gap = schedule 1 + pull 4 + start 6 s; the 5 s drain is served through the terminating fallback
  assert.ok(st.downtimeS >= 11 && st.downtimeS <= 13, `downtime ${st.downtimeS} s`)
  assert.equal(st.mixedVersionS, 0, 'never two versions at once')
  assert.equal(st.extraPodHours, 0)
  assert.ok(st.usersHit > 300, `users hit ${st.usersHit}`)
  assert.ok(Math.abs(st.newVersionErrorRate - 0.2) < 0.04)
})

test('Rolling lane: no downtime, both versions serve for a while, the bug spreads to everyone; rollback = undo', () => {
  const s = lane('rolling')
  advance(s, 40)
  const st = releaseStats(s)!
  assert.equal(st.phase, 'done')
  assert.equal(st.downtimeS, 0)
  assert.ok(st.mixedVersionS >= 8, `mixed-version window ${st.mixedVersionS} s`)
  assert.ok(st.usersHit >= 80, `users hit ${st.usersHit}`)
  const r = lane('rolling')
  advance(r, 40)
  assert.equal(rollbackRelease(r).ok, true)
  advance(r, 60)
  const rs = releaseStats(r)!
  assert.equal(rs.phase, 'rolled-back')
  assert.ok(rs.timeToRollbackS !== null && rs.timeToRollbackS < 30, `rollback took ${rs.timeToRollbackS}`)
  assert.deepEqual([...new Set(versionsOfEndpoints(r))], ['1.4.1'])
})

test('Blue-green lane: the switch waits for every green Pod, doubles the Pods for 30 s, rollback right after the switch is a selector flip', () => {
  const s = lane('blue-green')
  const switchedAt = runUntil(s, (x) => x.release!.phase === 'promoted', 60)!
  assert.ok(switchedAt - 5 >= 11 && switchedAt - 5 <= 13, `switched ${switchedAt - 5} s after start (1 + 4 + 6 s start + readiness)`)
  assert.equal(findService(s, 'klopa-api')!.selector.track, 'green')
  advance(s, 2)
  assert.deepEqual([...new Set(versionsOfEndpoints(s))], ['2.0.0'], 'new connections go to green at once')
  advance(s, 45)
  const st = releaseStats(s)!
  assert.equal(st.phase, 'done')
  assert.equal(st.downtimeS, 0)
  assert.ok(st.mixedVersionS <= 2, 'the switch is (almost) instantaneous')
  assert.ok(st.extraPodHours * 3600 > 4 * 30, `extra Pod-seconds ${st.extraPodHours * 3600}`)
  // rollback inside the scale-down delay: blue is still there → instant
  const r = lane('blue-green')
  runUntil(r, (x) => x.release!.phase === 'promoted', 60)
  advance(r, 5)
  assert.equal(rollbackRelease(r).ok, true)
  assert.equal(findService(r, 'klopa-api')!.selector.track, 'blue')
  advance(r, 10)
  const rr = releaseStats(r)!
  assert.ok(rr.timeToRollbackS !== null && rr.timeToRollbackS <= 3, `rollback took ${rr.timeToRollbackS} s (selector flip + 1 s kube-proxy propagation)`)
  assert.deepEqual([...new Set(versionsOfEndpoints(r))], ['1.4.1'])
  assert.equal(rollbackRelease(r).ok, false, 'nothing left to roll back')
})

test('Blue-green with keep-alive clients: existing connections stay on blue after the switch until blue goes away', () => {
  const s = lane('blue-green', { keepAlive: { connections: 8, maxAgeS: null } })
  const switchedAt = runUntil(s, (x) => x.release!.phase === 'promoted', 60)!
  advance(s, 10)
  const ver = () => openConnections(s, 'web').map((c) => s.pods.find((p) => p.id === c.podId)?.spec.app.version)
  assert.ok(ver().every((v) => v === '1.4.1'), 'the selector flip changes only new connections')
  assert.equal(s.traffic[0].okByVersion['2.0.0'] ?? 0, 0)
  runUntil(s, (x) => x.release!.phase === 'done', 120)
  advance(s, 2)
  assert.ok(ver().every((v) => v === '2.0.0'), 'blue scaled down → connections closed and reopened to green')
  assert.ok(s.release!.finishedAt! - switchedAt >= 30)
  assert.equal(trafficTotals(s).refused, 0, 'graceful: a terminating server answers and closes the connection')
})

test('Canary by replicas: 1 canary Pod next to 4 stable ≈ 20 % of connections; analysis aborts the first step (bug 20 % > 2 %)', () => {
  const s = lane('canary-replicas')
  assert.equal(s.release!.requestedPct, 5)
  assert.equal(Math.round(s.release!.actualPct), 20)
  assert.equal(s.release!.canaryReplicas, 1)
  const abortedAt = runUntil(s, (x) => x.release!.phase === 'aborted', 120)
  assert.ok(abortedAt !== null)
  const st = releaseStats(s)!
  assert.ok(st.usersHit > 10 && st.usersHit < 40, `users hit ${st.usersHit}`)
  const v2 = s.traffic[0].okByVersion['2.0.0'] + s.traffic[0].failByVersion['2.0.0']
  const all = Object.values(s.traffic[0].okByVersion).reduce((a, b) => a + b, 0) + Object.values(s.traffic[0].failByVersion).reduce((a, b) => a + b, 0)
  assert.ok(v2 / all > 0.08, 'a fifth of the step traffic reached the canary')
  advance(s, 10)
  assert.deepEqual([...new Set(versionsOfEndpoints(s))], ['1.4.1'], 'canary scaled to 0')
  assert.match(s.release!.abortReason, /analiza/)
})

test('Canary by Gateway weights: ≈ 5 % of requests independent of Pod count → fewer users hit than by replicas', () => {
  const w = lane('canary-weights')
  runUntil(w, (x) => x.release!.phase === 'aborted', 120)
  const r = lane('canary-replicas')
  runUntil(r, (x) => x.release!.phase === 'aborted', 120)
  const sw = releaseStats(w)!
  const sr = releaseStats(r)!
  assert.ok(sw.usersHit < sr.usersHit, `weights ${sw.usersHit} vs replicas ${sr.usersHit}`)
  assert.ok(sw.usersHit <= 15)
  const t = w.traffic[0]
  const canary = (t.okByVersion['2.0.0'] ?? 0) + (t.failByVersion['2.0.0'] ?? 0)
  const stepRequests = 30 * 20
  assert.ok(canary > stepRequests * 0.02 && canary < stepRequests * 0.1, `canary got ${canary} of ~${stepRequests}`)
})

test('Canary without a bug walks 5 → 25 → 50 → 100 % and retires the stable Deployment; manual "next step" skips waiting', () => {
  for (const strategy of ['canary-replicas', 'canary-weights'] as const) {
    const s = lane(strategy, { bugRate: 0 })
    const seen: number[] = []
    for (let i = 0; i < 2000 && s.release!.phase !== 'done'; i++) {
      processTick(s)
      if (seen.at(-1) !== s.release!.requestedPct) seen.push(s.release!.requestedPct)
    }
    assert.deepEqual(seen, [5, 25, 50, 100], strategy)
    assert.equal(s.release!.phase, 'done')
    assert.deepEqual([...new Set(versionsOfEndpoints(s))], ['2.0.0'])
    assert.equal(trafficTotals(s).failed, 0)
  }
  const m = lane('canary-replicas', { bugRate: 0, analysis: false })
  assert.equal(nextCanaryStep(m), true)
  assert.equal(m.release!.requestedPct, 25)
  assert.equal(m.release!.canaryReplicas, 2)
})

test('expand/contract: a one-step rename breaks v1 mid-rollout; add → roll out → drop gives 0 errors; rollback after the drop breaks v1', () => {
  const rename = presetRelease({ strategy: 'rolling', schema: true })
  advance(rename, 5)
  assert.equal(migrateSchema(rename, { kind: 'rename', from: 'cijena', to: 'cijena_s_pdv' }), true)
  startRelease(rename)
  advance(rename, 40)
  assert.ok((rename.traffic[0].failByVersion['1.4.1'] ?? 0) > 100, 'v1 Pods fail until the rollout ends')
  assert.equal(rename.traffic[0].failByVersion['2.0.0'] ?? 0, 0)

  const safe = presetRelease({ strategy: 'rolling', schema: true })
  advance(safe, 5)
  migrateSchema(safe, { kind: 'add', column: 'cijena_s_pdv' })
  startRelease(safe)
  advance(safe, 40)
  migrateSchema(safe, { kind: 'drop', column: 'cijena' })
  advance(safe, 10)
  assert.equal(trafficTotals(safe).failed, 0)
  rollbackRelease(safe)
  advance(safe, 40)
  assert.ok((safe.traffic[0].failByVersion['1.4.1'] ?? 0) > 100, 'the database does not go back')
  assert.equal(migrateSchema(safe, { kind: 'drop', column: 'nema' }), false)
  assert.equal(migrateSchema(safe, { kind: 'add', column: 'cijena_s_pdv' }), false)
})

test('every lane with the same seed sees the same traffic (arrivals and users)', () => {
  const a = lane('rolling')
  const b = lane('canary-weights')
  advance(a, 20)
  advance(b, 20)
  const users = (s: ClusterState) => s.recent.filter((r) => r.t < 20).map((r) => `${Math.round(r.t * 10)}:${r.user}`)
  assert.deepEqual(users(a), users(b))
})

test('kubectl rollout restart: a new ReplicaSet with a restartedAt annotation, Pods replaced by the rolling rules', () => {
  const s = presetRollout({})
  const before = replicaSetsOf(s, s.deployments[0]).length
  const r = rolloutRestart(s, 'klopa-api')
  assert.equal(r.ok, true)
  assert.match(s.deployments[0].template.annotations['kubectl.kubernetes.io/restartedAt'], /^2026-10-01T12:00:\d\dZ$/)
  advance(s, 40)
  assert.equal(replicaSetsOf(s, s.deployments[0]).length, before + 1)
  assert.equal(trafficTotals(s).failed, 0)
  assert.equal(rolloutRestart(s, 'nema').ok, false)
})

test('release helpers without a lane are refused cleanly', () => {
  const s = presetRollout({ traffic: false })
  assert.equal(startRelease(s).ok, false)
  assert.equal(rollbackRelease(s).ok, false)
  assert.equal(nextCanaryStep(s), false)
  assert.equal(releaseStats(s), null)
  const r = createRelease({ strategy: 'canary-weights', replicas: 4, stableVersion: '1', newVersion: '2', newTemplate: klopaApiTemplate('2.0.0'), steps: [5, Number.NaN, -3, 250] })
  assert.deepEqual(r.steps, [5, 100])
  const idle = presetRelease({ strategy: 'blue-green' })
  assert.equal(rollbackRelease(idle).ok, false, 'nothing to roll back before the release starts')
})
