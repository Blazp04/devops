/**
 * Rolling update (L13, L14, L20) – sim-models SIM 5 / proto/rollout-sim.ts.
 * Run: node --test src/engines/cluster/*.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ClusterState, IntOrPercent } from './types.ts'
import {
  advance,
  deploymentView,
  fenceposts,
  getProxyEndpoints,
  isActive,
  isAvailable,
  kubectlGetPods,
  pauseDeployment,
  presetRollout,
  presetService,
  processTick,
  replicaSetsOf,
  runUntil,
  scaleDeployment,
  setDeploymentStrategy,
  setDeploymentVersion,
  trafficTotals,
  undoRollout,
  validateStrategy,
  deleteDeploymentByName,
  setDeploymentProbes,
  scaledValue,
  createCluster,
  createDeployment,
  klopaApiTemplate,
  nodeSpec,
  patchDeploymentTemplate,
  podStatus,
  WRONG_TAG_IMAGE,
} from './index.ts'

function deploymentPods(s: ClusterState) {
  const d = s.deployments[0]
  const rss = replicaSetsOf(s, d)
  return s.pods.filter((p) => p.owner && rss.some((r) => r.id === p.owner!.id))
}

/** Run a rollout to 1.4.0, checking the two invariants on every tick. */
function rollout(maxSurge: IntOrPercent, maxUnavailable: IntOrPercent, n = 4) {
  const s = presetRollout({ maxSurge, maxUnavailable, replicas: n })
  const { surge, unavailable } = fenceposts(maxSurge, maxUnavailable, n)
  const r = setDeploymentVersion(s, 'klopa-api', '1.4.0')
  assert.equal(r.ok, true)
  const t0 = s.t
  for (let i = 0; i < 3000 && s.deployments[0].rollout?.settledAt == null; i++) {
    processTick(s)
    const d = s.deployments[0]
    const pods = deploymentPods(s)
    const active = pods.filter(isActive).length
    const avail = pods.filter((p) => isAvailable(p, s.t, d.minReadySeconds)).length
    const specSum = replicaSetsOf(s, d).reduce((a, x) => a + x.replicas, 0)
    assert.ok(active <= n + surge, `t=${s.t}: ${active} active Pods > N + surge = ${n + surge}`)
    assert.ok(specSum <= n + surge, `t=${s.t}: Σ spec.replicas ${specSum} > ${n + surge}`)
    assert.ok(avail >= n - unavailable, `t=${s.t}: available ${avail} < N − unavailable = ${n - unavailable}`)
  }
  const ro = s.deployments[0].rollout!
  assert.notEqual(ro.settledAt, null, 'rollout did not finish')
  return { s, ro, duration: ro.settledAt! - t0, complete: ro.completedAt! - t0 }
}

test('fence posts: maxSurge rounds up, maxUnavailable rounds down (25 %/25 % table)', () => {
  const table: Record<number, [number, number]> = { 1: [1, 0], 2: [1, 0], 3: [1, 0], 4: [1, 1], 5: [2, 1], 10: [3, 2] }
  for (const [n, [surge, unavail]] of Object.entries(table)) {
    assert.deepEqual(fenceposts('25%', '25%', Number(n)), { surge, unavailable: unavail }, `N=${n}`)
  }
  // both resolve to 0 → unavailable forced to 1
  assert.deepEqual(fenceposts('0%', '10%', 3), { surge: 0, unavailable: 1 })
  // N = 0 never divides by zero
  assert.deepEqual(fenceposts('25%', '25%', 0), { surge: 0, unavailable: 0 })
  assert.equal(scaledValue('50%', 3, true), 2)
  assert.equal(scaledValue('50%', 3, false), 1)
})

test('validation: explicit 0/0 is rejected with the Croatian message', () => {
  assert.equal(validateStrategy(0, 0), 'maxSurge i maxUnavailable ne mogu oba biti 0')
  assert.equal(validateStrategy('0%', 0), 'maxSurge i maxUnavailable ne mogu oba biti 0')
  assert.equal(validateStrategy(1, 0), null)
  assert.equal(validateStrategy(0, '110%'), 'maxUnavailable ne smije biti veći od 100 %')
  const s = presetRollout({ traffic: false })
  const r = setDeploymentStrategy(s, 'klopa-api', { maxSurge: 0, maxUnavailable: 0 })
  assert.equal(r.ok, false)
  assert.deepEqual(s.deployments[0].strategy, { type: 'RollingUpdate', maxSurge: '25%', maxUnavailable: '25%' })
})

test('validated N=4 timings and peaks (sim-models table, ±1 s)', () => {
  const cases: [IntOrPercent, IntOrPercent, number, number, number, number][] = [
    // surge, unavail, duration, peak non-terminating, peak incl. terminating, min available
    ['25%', '25%', 28, 5, 7, 3],
    [1, 0, 51, 5, 6, 4],
    [0, 1, 46, 4, 5, 3],
    ['100%', 0, 17, 8, 8, 4],
  ]
  for (const [ms, mu, dur, peak, peakT, minAvail] of cases) {
    const { ro, duration } = rollout(ms, mu)
    assert.ok(Math.abs(duration - dur) <= 1, `${ms}/${mu}: duration ${duration} vs ${dur}`)
    assert.equal(ro.peakPods, peak, `${ms}/${mu} peak`)
    assert.equal(ro.peakPodsInclTerminating, peakT, `${ms}/${mu} peak incl. terminating`)
    assert.equal(ro.minAvailable, minAvail, `${ms}/${mu} min available`)
  }
})

test('exact engine durations equal the prototype run with integer ticks (27.5 / 50.1 / 45.2 / 16.2 s)', () => {
  const expect: [IntOrPercent, IntOrPercent, number][] = [
    ['25%', '25%', 27.5],
    [1, 0, 50.1],
    [0, 1, 45.2],
    ['100%', 0, 16.2],
  ]
  for (const [ms, mu, d] of expect) assert.equal(Math.round(rollout(ms, mu).duration * 10) / 10, d)
})

test('kubectl rollout status would report "complete" before the last old Pod is gone (terminating not counted)', () => {
  const { duration, complete } = rollout('25%', '25%')
  assert.ok(complete < duration)
  assert.ok(Math.abs(duration - complete - 5) < 0.3, 'the gap is the 5 s graceful shutdown of the last old Pod')
})

test('a healthy rollout with readiness serves every request (L13 goal: 0 failed requests)', () => {
  const { s } = rollout('25%', '25%')
  advance(s, 5)
  const t = trafficTotals(s)
  assert.equal(t.failed, 0)
  assert.ok(t.ok > 400)
})

test('crashing 1.5.0 stalls at 3 old Ready + 2 new unready; ProgressDeadlineExceeded after 60 s; no auto rollback', () => {
  const s = presetRollout({})
  setDeploymentVersion(s, 'klopa-api', '1.5.0-crash')
  advance(s, 59)
  let v = deploymentView(s, 'klopa-api')!
  assert.notEqual(v.progressing.reason, 'ProgressDeadlineExceeded')
  advance(s, 61)
  v = deploymentView(s, 'klopa-api')!
  const byVersion = Object.fromEntries(v.replicaSets.map((r) => [r.version, r]))
  assert.equal(byVersion['1.3.2'].desired, 3)
  assert.equal(byVersion['1.3.2'].ready, 3)
  assert.equal(byVersion['1.5.0'].desired, 2)
  assert.equal(byVersion['1.5.0'].ready, 0)
  assert.equal(v.progressing.status, 'False')
  assert.equal(v.progressing.reason, 'ProgressDeadlineExceeded')
  const timedOut = s.deployments[0].rollout!.timedOutAt!
  assert.ok(timedOut > 60 && timedOut < 61.5, `timed out at ${timedOut}`)
  // nothing rolls back by itself: still the same after another 5 minutes
  advance(s, 300)
  v = deploymentView(s, 'klopa-api')!
  assert.equal(v.replicaSets.find((r) => r.isNew)!.version, '1.5.0')
  assert.equal(v.available, 3, 'service capacity stays at 75 %')
  assert.ok(kubectlGetPods(s).some((l) => l.includes('CrashLoopBackOff')))
})

test('"never ready" 1.5.0 stalls the same way (Running but 0/1)', () => {
  const s = presetRollout({})
  setDeploymentVersion(s, 'klopa-api', '1.5.0-never-ready')
  advance(s, 90)
  const v = deploymentView(s, 'klopa-api')!
  assert.deepEqual(
    v.replicaSets.map((r) => [r.version, r.desired, r.ready]),
    [
      ['1.5.0', 2, 0],
      ['1.3.2', 3, 3],
    ],
  )
  assert.ok(kubectlGetPods(s).filter((l) => l.includes('0/1') && l.includes('Running')).length === 2)
})

test('N=10, surge 3, unavailable 2 with a broken image stalls at 8 old / 5 new (matches the docs example)', () => {
  const s = presetRollout({ replicas: 10, maxSurge: 3, maxUnavailable: 2, traffic: false })
  setDeploymentVersion(s, 'klopa-api', '1.5.0-crash')
  advance(s, 120)
  const v = deploymentView(s, 'klopa-api')!
  assert.deepEqual(
    v.replicaSets.map((r) => [r.version, r.desired]),
    [
      ['1.5.0', 5],
      ['1.3.2', 8],
    ],
  )
})

test('rollout undo from the stall recovers in < 30 s and re-numbers the revision (no automatic rollback before)', () => {
  const s = presetRollout({})
  setDeploymentVersion(s, 'klopa-api', '1.4.0')
  advance(s, 40)
  setDeploymentVersion(s, 'klopa-api', '1.5.0-crash')
  advance(s, 70)
  const t0 = s.t
  assert.equal(undoRollout(s, 'klopa-api').ok, true)
  const done = runUntil(s, (x) => x.deployments[0].rollout?.completedAt != null, 60)
  assert.ok(done !== null && done - t0 < 30, `recovered after ${done! - t0}`)
  const hist = deploymentView(s, 'klopa-api')!.history
  assert.deepEqual(
    hist.map((h) => [h.revision, h.version, h.current]),
    [
      [1, '1.3.2', false],
      [3, '1.5.0', false],
      [4, '1.4.0', true],
    ],
  )
  assert.match(hist[2].changeCause, /1\.4\.0/)
  // undo to a specific revision and an unknown one
  assert.equal(undoRollout(s, 'klopa-api', 1).ok, true)
  assert.equal(undoRollout(s, 'klopa-api', 99).ok, false)
})

test('undo without history and undo while paused are refused', () => {
  const s = presetRollout({ traffic: false })
  assert.equal(undoRollout(s, 'klopa-api').ok, false)
  pauseDeployment(s, 'klopa-api', true)
  assert.equal(undoRollout(s, 'klopa-api').ok, false)
  assert.equal(undoRollout(s, 'nope').ok, false)
})

test('changing replicas scales the existing ReplicaSet; changing the image creates a new one', () => {
  const s = presetRollout({ traffic: false })
  const before = replicaSetsOf(s, s.deployments[0]).map((r) => r.name)
  scaleDeployment(s, 'klopa-api', 6)
  advance(s, 15)
  assert.deepEqual(
    replicaSetsOf(s, s.deployments[0]).map((r) => r.name),
    before,
  )
  assert.equal(deploymentView(s, 'klopa-api')!.available, 6)
  setDeploymentVersion(s, 'klopa-api', '1.4.0')
  advance(s, 1)
  assert.equal(replicaSetsOf(s, s.deployments[0]).length, 2)
  // a NaN replica count is ignored
  scaleDeployment(s, 'klopa-api', Number.NaN)
  assert.equal(s.deployments[0].replicas, 6)
})

test('proportional scaling mid-rollout (4 → 8): both ReplicaSets grow within N + surge', () => {
  const s = presetRollout({ traffic: false })
  setDeploymentVersion(s, 'klopa-api', '1.4.0')
  advance(s, 12)
  const mid = deploymentView(s, 'klopa-api')!.replicaSets.map((r) => [r.version, r.desired])
  assert.deepEqual(mid, [
    ['1.4.0', 4],
    ['1.3.2', 1],
  ])
  scaleDeployment(s, 'klopa-api', 8)
  advance(s, 0.2)
  assert.deepEqual(
    deploymentView(s, 'klopa-api')!.replicaSets.map((r) => [r.version, r.desired]),
    [
      ['1.4.0', 8],
      ['1.3.2', 2],
    ],
  )
  advance(s, 60)
  const end = deploymentView(s, 'klopa-api')!
  assert.deepEqual(
    end.replicaSets.map((r) => [r.version, r.desired, r.ready]),
    [
      ['1.4.0', 8, 8],
      ['1.3.2', 0, 0],
    ],
  )
})

test('Recreate empties the app: every old Pod is gone before the first new one is created', () => {
  const s = presetRollout({ strategy: 'Recreate' })
  setDeploymentVersion(s, 'klopa-api', '1.4.0')
  let outage = 0
  let fallback = 0
  let overlap = false
  for (let i = 0; i < 400; i++) {
    processTick(s)
    const pr = s.proxy[s.services[0].id]
    if (pr.endpoints.length === 0) outage += 0.1
    else if (pr.terminatingFallback) fallback += 0.1
    const pods = deploymentPods(s)
    if (pods.some((p) => p.spec.app.version === '1.3.2') && pods.some((p) => p.spec.app.version === '1.4.0')) overlap = true
  }
  assert.equal(overlap, false)
  // the old Pods drain for 5 s and kube-proxy keeps sending to them (serving + terminating fallback, KEP-1669);
  // then no endpoint at all until the new Pods are Ready: schedule 1 + pull 4 + start 6 s ≈ 11 s (L20 model)
  assert.ok(fallback > 4 && fallback < 6.5, `terminating fallback ${fallback}`)
  assert.ok(outage > 10.5 && outage < 12.5, `0 endpoints ${outage}`)
  const t = trafficTotals(s)
  assert.ok(t.noEndpoints > 180, `clients see connection errors during the gap (${t.noEndpoints})`)
  assert.equal(s.deployments[0].rollout!.minAvailable, 0)
})

test('readiness probe off: new Pods get traffic while warming up → errors (L13 break-it)', () => {
  const s = presetRollout({ readinessProbe: false })
  setDeploymentVersion(s, 'klopa-api', '1.4.0')
  advance(s, 40)
  const t = trafficTotals(s)
  assert.ok(t.http503 > 50, `warm-up errors ${t.http503}`)
  // turning it back on is a template change → a new ReplicaSet
  const before = replicaSetsOf(s, s.deployments[0]).length
  setDeploymentProbes(s, 'klopa-api', { readiness: { path: '/ready', initialDelaySeconds: 0, periodSeconds: 2, timeoutSeconds: 1, successThreshold: 1, failureThreshold: 3 } })
  advance(s, 1)
  assert.equal(replicaSetsOf(s, s.deployments[0]).length, before + 1)
})

test('L14 shutdown race: immediate exit without preStop drops a few requests; preStop sleep 5 drops none', () => {
  const a = presetService({ preStopSleepS: 0 })
  setDeploymentVersion(a, 'klopa-api', '1.4.1', { preStopSleepS: 0 })
  advance(a, 60)
  const ta = trafficTotals(a)
  assert.ok(ta.refused > 5 && ta.refused < 80, `refused ${ta.refused}`)
  const b = presetService({ preStopSleepS: 5 })
  setDeploymentVersion(b, 'klopa-api', '1.4.1', { preStopSleepS: 5 })
  advance(b, 60)
  assert.equal(trafficTotals(b).failed, 0)
})

test('pause stops the rollout half-way; resume finishes it', () => {
  const s = presetRollout({ traffic: false })
  setDeploymentVersion(s, 'klopa-api', '1.4.0')
  advance(s, 3)
  assert.equal(pauseDeployment(s, 'klopa-api', true).ok, true)
  advance(s, 60)
  let v = deploymentView(s, 'klopa-api')!
  assert.equal(v.progressing.reason, 'DeploymentPaused')
  assert.notEqual(v.replicaSets.find((r) => r.version === '1.3.2')!.desired, 0)
  assert.equal(pauseDeployment(s, 'klopa-api', false).ok, true)
  advance(s, 60)
  v = deploymentView(s, 'klopa-api')!
  assert.equal(v.replicaSets.find((r) => r.version === '1.3.2')!.desired, 0)
  assert.equal(v.progressing.reason, 'NewReplicaSetAvailable')
})

test('revisionHistoryLimit keeps only that many old ReplicaSets', () => {
  const s = presetRollout({ traffic: false })
  s.deployments[0].revisionHistoryLimit = 2
  for (const v of ['1.4.0', '1.4.1', '2.0.1', '1.4.0', '2.0.0'] as const) {
    setDeploymentVersion(s, 'klopa-api', v)
    advance(s, 40)
  }
  const rss = replicaSetsOf(s, s.deployments[0])
  assert.equal(rss.filter((r) => r.replicas === 0).length, 2)
  assert.equal(rss.length, 3)
})

test('deleting the Deployment cascades to ReplicaSets and Pods', () => {
  const s = presetRollout({})
  assert.equal(deleteDeploymentByName(s, 'klopa-api').ok, true)
  advance(s, 10)
  assert.equal(s.replicaSets.length, 0)
  assert.equal(s.pods.length, 0)
  assert.equal(deleteDeploymentByName(s, 'klopa-api').ok, false)
})

test('a Deployment on a cluster without nodes stays Pending with the upstream message', () => {
  const s = createCluster({ nodes: [] })
  createDeployment(s, { name: 'klopa-api', replicas: 2, template: klopaApiTemplate('1.3.2') })
  advance(s, 5)
  assert.equal(s.pods.length, 2)
  for (const p of s.pods) assert.equal(p.scheduled.message, 'no nodes available to schedule pods')
  // and with a node it schedules
  const s2 = createCluster({ nodes: [nodeSpec('node-1')] })
  createDeployment(s2, { name: 'klopa-api', replicas: 0, template: klopaApiTemplate('1.3.2') })
  advance(s2, 5)
  assert.equal(s2.pods.length, 0)
})

test('minReadySeconds delays "Available" (and so the rollout), never traffic: new Pods serve as soon as they are Ready', () => {
  const plain = rollout('25%', '25%').duration
  const s = presetRollout({ minReadySeconds: 10 })
  setDeploymentVersion(s, 'klopa-api', '1.4.0')
  let servedBeforeAvailable = false
  for (let i = 0; i < 1500 && s.deployments[0].rollout?.settledAt == null; i++) {
    processTick(s)
    const d = s.deployments[0]
    const fresh = deploymentPods(s).filter((p) => p.spec.app.version === '1.4.0' && p.ready.status && !isAvailable(p, s.t, d.minReadySeconds))
    if (fresh.some((p) => getProxyEndpoints(s, 'klopa-api').some((e) => e.podId === p.id))) servedBeforeAvailable = true
  }
  const slow = s.deployments[0].rollout!
  assert.ok(slow.settledAt! - slow.startedAt > plain + 15, `${slow.settledAt! - slow.startedAt} vs ${plain}`)
  assert.equal(servedBeforeAvailable, true)
  assert.equal(trafficTotals(s).failed, 0)
})

test('L24 fault deck: a tag typo → ImagePullBackOff and ProgressDeadlineExceeded; a missing Secret key → CreateContainerConfigError; old Pods keep serving', () => {
  const s = presetRollout({})
  assert.equal(patchDeploymentTemplate(s, 'klopa-api', { image: WRONG_TAG_IMAGE }).ok, true)
  advance(s, 75)
  const v = deploymentView(s, 'klopa-api')!
  assert.equal(v.progressing.reason, 'ProgressDeadlineExceeded')
  const fresh = deploymentPods(s).filter((p) => p.spec.image === WRONG_TAG_IMAGE)
  assert.equal(fresh.length, 2)
  assert.ok(fresh.every((p) => ['ImagePullBackOff', 'ErrImagePull'].includes(podStatus(p))))
  assert.equal(v.available, 3)
  const t = presetRollout({})
  patchDeploymentTemplate(t, 'klopa-api', { missingSecret: true })
  advance(t, 20)
  const bad = deploymentPods(t).filter((p) => p.spec.missingSecret)
  assert.ok(bad.length > 0 && bad.every((p) => podStatus(p) === 'CreateContainerConfigError'))
  assert.ok(t.kubeEvents.some((e) => e.message === 'Error: secret "klopa-secrets" not found'))
  assert.equal(trafficTotals(t).failed, 0, 'the rollout stalls, the old Pods keep serving')
})
