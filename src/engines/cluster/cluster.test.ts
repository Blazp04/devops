/**
 * E3 Klaster – core loop, determinism, L10 desired state, L11 control plane, L12 Pod health, L14 Services,
 * invariants under random actions and edge cases.
 * Run: node --test src/engines/cluster/*.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ClusterState, ControlPlaneMessage, Pod } from './types.ts'
import {
  COMPRESSED,
  KLOPA_API_VERSIONS,
  WRONG_TAG_IMAGE,
  addTrafficStream,
  advance,
  applyBarePod,
  applyReplicaSetReplicas,
  canaryReplicasFor,
  cfsLatencyMs,
  clusterCost,
  compressedLabel,
  crashLoopDelays,
  createCluster,
  createDeployment,
  createService,
  deletePod,
  desiredState as D,
  failedSchedulingMessage,
  fenceposts,
  fillNodes,
  getEndpointSlice,
  getProxyEndpoints,
  goDuration,
  hangProcess,
  hitShares,
  hpaFormula,
  isReady,
  killContainer,
  klopaApiTemplate,
  kubectlGetEvents,
  kubectlGetNodes,
  kubectlGetPods,
  nodeSpec,
  nodeView,
  openConnections,
  pickRoute,
  podByIp,
  podReadyColumn,
  podStatus,
  podTemplate,
  podView,
  powerOffNode,
  powerOnNode,
  presetControlPlane,
  presetPodHealth,
  presetRollout,
  presetScheduler,
  presetService,
  presetStorage,
  probe,
  processTick,
  profileRate,
  requestStats,
  resolveDns,
  runUntil,
  scaleDeployment,
  scaleStatefulSet,
  setComponent,
  setDatabase,
  setDeploymentVersion,
  setKubelet,
  setPodLabel,
  setPodReadiness,
  setReplicaSetImage,
  setServiceSelectorByName,
  stepCluster,
  trafficTotals,
  waterFill,
  createTimeline,
  act,
  stepTimeline,
  rewindTo,
  setServiceTypeByName,
  kubectlGetServices,
  kubectlDescribePod,
  tracePacket,
  replaceBarePod,
  NO_PROBES,
  presetAutoscaling,
  setCpuRequest,
  setClusterAutoscaler,
  setHpa,
  setNodeExtraMemory,
  setPodUsage,
  podShapeStatus,
  versionTone,
} from './index.ts'

// ---------------------------------------------------------------- helpers

function apiPods(s: ClusterState): Pod[] {
  return s.pods.filter((p) => p.labels.app === 'klopa-api')
}

function pod(s: ClusterState, name: string): Pod {
  const p = s.pods.find((x) => x.name === name)
  assert.ok(p, `pod ${name}`)
  return p
}

/** Collect every animated control-plane message (they are pruned from the state after they arrive). */
function collectMessages(s: ClusterState, seconds: number): ControlPlaneMessage[] {
  const seen = new Map<string, ControlPlaneMessage>()
  for (let i = 0; i < Math.round(seconds / s.cfg.timings.dt); i++) {
    processTick(s)
    for (const m of s.messages) if (!seen.has(m.id)) seen.set(m.id, m)
  }
  return [...seen.values()]
}

/** JSON snapshot of everything observable (functions such as the RNG are dropped by JSON). */
function snapshot(s: ClusterState): string {
  return JSON.stringify({ t: s.t, pods: s.pods, rs: s.replicaSets, d: s.deployments, ev: s.events, kev: s.kubeEvents, traffic: s.traffic, slices: s.slices })
}

// ---------------------------------------------------------------- core loop

test('stepCluster plugs into useSimulation: 600 × 1/60 s = 100 internal ticks (10,0 s); bad dt values are ignored', () => {
  const s = presetRollout({ traffic: false })
  for (let i = 0; i < 600; i++) stepCluster(s, 1 / 60)
  assert.equal(s.tick, 100)
  assert.equal(s.t, 10)
  for (const bad of [Number.NaN, -1, 0, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) stepCluster(s, bad)
  assert.equal(s.t, 10)
  // a huge frame (hidden tab) is clamped to 120 s of simulated time
  stepCluster(s, 1e9)
  assert.equal(s.t, 130)
})

test('determinism: same seed + same actions ⇒ identical state; another seed gives other Pod names', () => {
  const run = (seed: number) => {
    const s = presetPodHealth({ seed, behaviour: 'dependsOnDb', warm: true, probes: { liveness: probe('/ready-db'), readiness: probe('/ready') } })
    advance(s, 20)
    setDatabase(s, false, 30)
    advance(s, 40)
    deletePod(s, 'klopa-api-2')
    advance(s, 30)
    const r = presetRollout({ seed })
    setDeploymentVersion(r, 'klopa-api', '1.4.0')
    advance(r, 40)
    return snapshot(s) + snapshot(r)
  }
  assert.equal(run(7), run(7))
  assert.notEqual(run(7), run(8))
  const names = (seed: number) => apiPods(presetRollout({ seed, traffic: false })).map((p) => p.name).sort().join()
  assert.equal(names(1), names(1))
  assert.notEqual(names(1), names(2))
})

test('events: capped at 50, Croatian text, tone from the kit palette; kubectl events aggregate repeats', () => {
  const s = presetPodHealth({ behaviour: 'crashOnStart' })
  advance(s, 400)
  assert.ok(s.events.length <= 50)
  for (const e of s.events) {
    assert.ok(['ok', 'warn', 'bad', 'info', 'neutral'].includes(e.tone))
    assert.equal(typeof e.text, 'string')
    assert.ok(e.text.length > 0)
  }
  assert.ok(s.events.some((e) => /CrashLoopBackOff/.test(e.text)))
  const backoff = s.kubeEvents.find((e) => e.reason === 'BackOff')!
  assert.ok(backoff.count >= 3)
  assert.ok(kubectlGetEvents(s).some((l) => /BackOff .*\(x\d+\)/.test(l)))
})

// ---------------------------------------------------------------- L10 desired state

function atClock(s: D.DesiredStateSim, hhmm: string): void {
  const [h, m] = hhmm.split(':').map(Number)
  const target = h * 60 + m
  D.advanceDesiredState(s, (target - D.dayMinute(s)) / s.cfg.minutesPerSecond)
}

test('L10 baseline: 3 servers × 14 slots, api 9 + worker 12 + web 6 = 27 (9 per server)', () => {
  const s = D.createDesiredState()
  assert.equal(D.capacity(s), 42)
  assert.equal(s.instances.length, 27)
  for (const sv of s.servers) assert.equal(D.usedSlots(s, sv.id), 9)
  assert.equal(D.clock(s), '02:30')
  assert.equal(compressedLabel(COMPRESSED.l10LoopTick), '10 s (sim) · stvarno: sekunde')
})

test('L10 loop: 03:00 server-2 fails → 27 containers fit into 28 slots (one spare), restored within one pass + 5 s', () => {
  const s = D.createDesiredState({ mode: 'loop' })
  atClock(s, '03:00')
  D.advanceDesiredState(s, 0.2)
  assert.equal(s.servers[1].up, false)
  assert.equal(D.capacity(s), 28)
  assert.equal(D.deficit(s), 9)
  // ghosts (dashed) appear on the next pass and become solid 5 s later
  const fixedAt = (() => {
    for (let i = 0; i < 600; i++) {
      if (D.deficit(s) === 0) return D.dayMinute(s)
      D.advanceDesiredState(s, 0.1)
    }
    return null
  })()
  assert.ok(fixedAt !== null && fixedAt - 180 <= 10 + 5 + 0.2, `restored at minute ${fixedAt}`)
  assert.equal(s.instances.length, 27)
  assert.equal(D.usedSlots(s, 'server-1') + D.usedSlots(s, 'server-3'), 27)
  assert.ok(s.instances.every((i) => i.serverId !== 'server-2'))
})

test('L10 08:00 the repaired server comes back empty – nothing moves back; the next new work (10:00 version) lands there', () => {
  const s = D.createDesiredState({ mode: 'loop' })
  atClock(s, '09:59')
  assert.equal(s.servers[1].up, true)
  assert.equal(D.usedSlots(s, 'server-2'), 0, 'Kubernetes does not rebalance running workloads')
  atClock(s, '10:20')
  const onTwo = s.instances.filter((i) => i.serverId === 'server-2')
  assert.equal(onTwo.length, 9)
  assert.ok(onTwo.every((i) => i.app === 'api' && i.version === 2), 'new api instances land on the server with the most free slots')
  assert.equal(D.diffs(s).find((d) => d.app === 'api')!.outdated, 0, 'old version removed once the new one runs')
})

test('L10 12:00 lunch: api 9 → 15 and back at 13:00; with the seeded day the extra six spread over equally free servers', () => {
  const s = D.createDesiredState({ mode: 'loop' })
  atClock(s, '12:20')
  assert.equal(D.runningCount(s, 'api'), 15)
  assert.equal(D.deficit(s), 0)
  atClock(s, '13:20')
  assert.equal(D.runningCount(s, 'api'), 9)
  // a day without the 10:00 version: server-2 is still empty at 12:00, so the lunch instances land there
  const t = D.createDesiredState({ mode: 'loop', dayEvents: D.seededDay().filter((e) => e.kind !== 'new-version') })
  atClock(t, '12:20')
  const extra = t.instances.filter((i) => i.app === 'api' && i.createdAt >= (12 * 60 - t.cfg.startMinute) / t.cfg.minutesPerSecond - 1)
  assert.equal(extra.length, 6)
  assert.ok(extra.filter((i) => i.serverId === 'server-2').length >= 5, 'mostly on server-2 (most free slots)')
})

test('L10 scores: manual without help vs the loop (missing instance-minutes, Davor sleeps)', () => {
  const manual = D.createDesiredState({ mode: 'manual' })
  const loop = D.createDesiredState({ mode: 'loop' })
  for (const s of [manual, loop]) while (!s.finished) D.advanceDesiredState(s, 10)
  assert.ok(manual.scores.missingInstanceMinutes > 9 * 300, `manual ${manual.scores.missingInstanceMinutes}`)
  assert.ok(loop.scores.missingInstanceMinutes < 100, `loop ${loop.scores.missingInstanceMinutes}`)
  assert.deepEqual(D.davorSleep(loop), { nightMinutes: 270, sleptMinutes: 270 })
  assert.ok(D.davorSleep(manual).sleptMinutes <= 31, 'paged at 03:00 and awake until 07:00')
})

test('L10 lost event: the level-triggered loop does not care; a human operator is not woken', () => {
  const a = D.createDesiredState({ mode: 'loop' })
  const b = D.createDesiredState({ mode: 'loop' })
  D.loseNextEvent(b)
  for (const s of [a, b]) atClock(s, '04:00')
  assert.equal(D.deficit(b), 0)
  assert.equal(b.scores.missingInstanceMinutes, a.scores.missingInstanceMinutes)
  assert.ok(b.alerts[0].lost)
  const m = D.createDesiredState({ mode: 'manual' })
  D.loseNextEvent(m)
  atClock(m, '07:00')
  assert.equal(m.scores.sleepLostMinutes, 0, 'nobody paged…')
  assert.equal(D.deficit(m), 9, '…and the capacity is still missing')
})

test('L10 a desire changed mid-repair converges to the latest; asking for more than fits leaves ghosts "nema mjesta"', () => {
  const s = D.createDesiredState({ mode: 'loop', scripted: false })
  D.handOver(s)
  D.setDesired(s, 'api', 12)
  D.advanceDesiredState(s, 2)
  D.setDesired(s, 'api', 7)
  D.advanceDesiredState(s, 30)
  assert.equal(D.runningCount(s, 'api'), 7)
  assert.equal(s.instances.filter((i) => i.app === 'api').length, 7)
  D.setDesired(s, 'worker', 30)
  D.advanceDesiredState(s, 30)
  const w = D.diffs(s).find((d) => d.app === 'worker')!
  assert.equal(s.instances.filter((i) => i.serverId !== null).length, 42)
  assert.equal(w.unplaced, 30 + 7 + 6 - 42)
  assert.ok(s.events.some((e) => /nema mjesta/.test(e.text)))
  // NaN never corrupts the desire
  D.setDesired(s, 'web', Number.NaN)
  assert.equal(s.desired.web, 6)
})

test('L10 manual placement: a dead or full server counts as a wrong placement; handOver switches to the loop', () => {
  const s = D.createDesiredState({ mode: 'manual' })
  atClock(s, '03:01')
  assert.equal(D.placeInstance(s, 'api', 'server-2').ok, false)
  assert.equal(D.placeInstance(s, 'api', 'server-1').ok, true)
  for (let i = 0; i < 4; i++) D.placeInstance(s, 'worker', 'server-1')
  assert.equal(D.placeInstance(s, 'web', 'server-1').reason, 'poslužitelj je pun')
  assert.equal(s.scores.wrongPlacements, 2)
  D.handOver(s)
  D.advanceDesiredState(s, 30)
  assert.equal(D.deficit(s), 0)
  assert.equal(s.mode, 'loop')
})

// ---------------------------------------------------------------- L11 control plane

test('L11 kubectl apply → numbered pipeline 1–6 in order; a bare Pod skips step 3 (no controller)', () => {
  const s = presetControlPlane()
  assert.equal(applyReplicaSetReplicas(s, 'klopa-api', 4).ok, true)
  const msgs = collectMessages(s, 8)
  const first = (step: number) => msgs.find((m) => m.step === step)
  for (let i = 1; i <= 6; i++) assert.ok(first(i), `step ${i}`)
  for (let i = 2; i <= 6; i++) assert.ok(first(i)!.t0 >= first(i - 1)!.t0, `step ${i} after step ${i - 1}`)
  assert.equal(first(1)!.from, 'kubectl')
  assert.equal(first(2)!.to, 'etcd')
  assert.equal(first(3)!.from, 'controller-manager')
  assert.equal(first(4)!.from, 'scheduler')
  assert.match(first(5)!.from, /^kubelet:/)
  assert.equal(first(6)!.to, 'apiserver')
  // watchers react after 0,1–0,3 s
  assert.ok(first(3)!.t0 - first(2)!.t0 >= 0.1 - 1e-9)
  assert.equal(apiPods(s).filter((p) => p.processUp).length, 4)
  const t = presetControlPlane()
  applyBarePod(t, 'klopa-proba', klopaApiTemplate('1.3.2', { labels: { app: 'klopa-proba' } }))
  const bare = collectMessages(t, 8).map((m) => m.step)
  assert.ok(!bare.includes(3) && bare.includes(4) && bare.includes(6))
})

test('L11 API server off: kubectl is refused, nothing changes, running Pods keep serving', () => {
  const s = presetControlPlane()
  addTrafficStream(s, { id: 'web', serviceName: 'klopa-api', rps: 10 })
  setComponent(s, 'apiServer', false)
  const r = applyReplicaSetReplicas(s, 'klopa-api', 6)
  assert.equal(r.ok, false)
  assert.match(r.message, /connection to the server .* was refused/)
  advance(s, 30)
  assert.equal(s.replicaSets[0].replicas, 3)
  assert.equal(apiPods(s).length, 3)
  const t = trafficTotals(s)
  assert.ok(t.ok > 200)
  assert.equal(t.failed, 0, 'the data plane survives a control-plane outage')
  assert.equal(s.kubectlLog.at(-1)!.ok, false)
})

test('L11 etcd off: writes fail with an etcd timeout; switching it back on lets kubectl apply work', () => {
  const s = presetControlPlane()
  setComponent(s, 'etcd', false)
  const r = applyReplicaSetReplicas(s, 'klopa-api', 5)
  assert.equal(r.ok, false)
  assert.match(r.message, /etcdserver: request timed out/)
  advance(s, 10)
  assert.equal(apiPods(s).length, 3)
  setComponent(s, 'etcd', true)
  assert.equal(applyReplicaSetReplicas(s, 'klopa-api', 5).ok, true)
  advance(s, 10)
  assert.equal(apiPods(s).filter((p) => p.processUp).length, 5)
})

test('L11 scheduler off: new Pods stay Pending forever; on again → scheduled', () => {
  const s = presetControlPlane()
  setComponent(s, 'scheduler', false)
  applyReplicaSetReplicas(s, 'klopa-api', 5)
  advance(s, 120)
  const pending = apiPods(s).filter((p) => p.nodeName === null)
  assert.equal(pending.length, 2)
  for (const p of pending) assert.equal(podStatus(p), 'Pending')
  setComponent(s, 'scheduler', true)
  advance(s, 10)
  assert.equal(apiPods(s).filter((p) => p.processUp).length, 5)
})

test('L11 controller-manager off: a deleted ReplicaSet Pod is not replaced; the bare Pod is never replaced', () => {
  const s = presetControlPlane()
  setComponent(s, 'controllerManager', false)
  const victim = apiPods(s)[0].name
  deletePod(s, victim)
  advance(s, 30)
  assert.equal(apiPods(s).length, 2)
  setComponent(s, 'controllerManager', true)
  advance(s, 10)
  assert.equal(apiPods(s).filter(isReady).length, 3, 'the next pass sees the difference')
  assert.ok(!s.pods.some((p) => p.name === victim), 'a replacement has a new name')
  deletePod(s, 'klopa-worker')
  advance(s, 60)
  assert.equal(s.pods.some((p) => p.labels.app === 'klopa-worker'), false)
})

test('L11 wrong tag: ErrImagePull → ImagePullBackOff, retries back off 10 s → 20 s → 40 s → 80 s', () => {
  const s = presetControlPlane()
  setReplicaSetImage(s, 'klopa-api', WRONG_TAG_IMAGE)
  applyReplicaSetReplicas(s, 'klopa-api', 4)
  const statuses = new Set<string>()
  const delays: number[] = []
  for (let i = 0; i < 2000; i++) {
    processTick(s)
    const p = apiPods(s).find((x) => x.spec.image === WRONG_TAG_IMAGE)
    if (!p) continue
    statuses.add(podStatus(p))
    const d = p.kubelet.imageBackoff?.delay
    if (d !== undefined && delays.at(-1) !== d) delays.push(d)
  }
  assert.ok(statuses.has('ErrImagePull') && statuses.has('ImagePullBackOff'))
  assert.deepEqual(delays.slice(0, 4), [10, 20, 40, 80])
  const bad = apiPods(s).find((x) => x.spec.image === WRONG_TAG_IMAGE)!
  assert.equal(bad.phase, 'Pending', 'ImagePullBackOff happens in phase Pending')
  assert.equal(podReadyColumn(bad), '0/1')
  // existing Pods keep their image: a ReplicaSet never updates running Pods
  assert.equal(apiPods(s).filter((p) => p.spec.image === KLOPA_API_VERSIONS['1.3.2'].image && p.processUp).length, 3)
  // fixing the tag on the Pod lets it start
  assert.ok(s.kubeEvents.some((e) => e.reason === 'Failed' && /not found/.test(e.message)))
})

test('L11 kubelet off: NotReady after 10 s (sim · real 50 s); after the 20 s toleration (real 5 min) RS Pods are recreated elsewhere, old ones hang Terminating; the bare Pod is not recreated', () => {
  const s = presetControlPlane()
  const node = pod(s, 'klopa-worker').nodeName!
  const onNode = s.pods.filter((p) => p.nodeName === node).map((p) => p.name)
  setKubelet(s, node, false)
  const t0 = s.t
  const notReadyAt = runUntil(s, (x) => x.nodes.find((n) => n.name === node)!.condition.ready === 'Unknown', 60)
  assert.ok(notReadyAt !== null && Math.abs(notReadyAt - t0 - s.cfg.timings.nodeMonitorGraceS) <= 0.2, `NotReady after ${notReadyAt! - t0}`)
  assert.ok(kubectlGetNodes(s).some((l) => l.startsWith(node) && l.includes('NotReady')))
  // containers keep running, but they left the Service
  for (const n of onNode) assert.equal(pod(s, n).processUp, true)
  advance(s, s.cfg.timings.podEvictionTolerationS + 2)
  for (const n of onNode) assert.equal(podStatus(pod(s, n)), 'Terminating', `${n} stays Terminating – no kubelet confirms`)
  const live = apiPods(s).filter((p) => !p.deletion)
  assert.equal(live.length, 3, 'ReplicaSet Pods were recreated')
  assert.ok(live.every((p) => p.nodeName !== node))
  assert.equal(s.pods.filter((p) => p.labels.app === 'klopa-worker').length, 1, 'the bare Pod is not recreated')
  assert.equal(compressedLabel(COMPRESSED.nodeMonitorGrace), '10 s (sim) · stvarno: 50 s')
  assert.equal(COMPRESSED.podEvictionToleration.label, '20 s (sim) · stvarno: 5 min')
  assert.equal(COMPRESSED.podEvictionToleration.realValue, 300)
  // kubelet back: it stops the old containers and confirms the deletions
  setKubelet(s, node, true)
  advance(s, 10)
  for (const n of onNode) assert.equal(s.pods.some((p) => p.name === n), false)
})

test('L11 "Napuni čvorove" → FailedScheduling "0/3 nodes are available: 3 Insufficient memory."', () => {
  const s = presetControlPlane()
  assert.equal(fillNodes(s).ok, true)
  advance(s, 2)
  applyReplicaSetReplicas(s, 'klopa-api', 4)
  advance(s, 5)
  const p = apiPods(s).find((x) => x.nodeName === null)!
  assert.equal(p.scheduled.message, '0/3 nodes are available: 3 Insufficient memory. preemption: 0/3 nodes are available: 3 No preemption victims found for incoming pod.')
  assert.equal(podView(s, p).pendingMessage, p.scheduled.message)
  assert.ok(s.kubeEvents.some((e) => e.reason === 'FailedScheduling'))
})

test('L11 "Ugasi čvor": the machine and its containers are gone; the same control-plane sequence follows', () => {
  const s = presetControlPlane()
  addTrafficStream(s, { id: 'web', serviceName: 'klopa-api', rps: 20 })
  const node = apiPods(s)[0].nodeName!
  assert.equal(powerOffNode(s, node), true)
  assert.equal(powerOffNode(s, node), false, 'already off')
  for (const p of s.pods.filter((x) => x.nodeName === node)) assert.equal(p.processUp, false)
  advance(s, 40)
  assert.equal(apiPods(s).filter((p) => !p.deletion && p.processUp).length, 3)
  assert.ok(trafficTotals(s).timeout + trafficTotals(s).refused > 0, 'requests to the dead node fail until it leaves the endpoints')
  assert.equal(powerOnNode(s, node), true)
  advance(s, 5)
  assert.equal(s.pods.filter((p) => p.nodeName === node && p.deletion).length, 0)
})

// ---------------------------------------------------------------- L12 Pod health

test('L12 lifecycle: Pending → ContainerCreating → Running; phase, STATUS and READY change independently', () => {
  const s = presetPodHealth({ probes: { readiness: probe('/ready', { periodSeconds: 2 }) } })
  const seen: string[] = []
  for (let i = 0; i < 150; i++) {
    processTick(s)
    const p = pod(s, 'klopa-api-1')
    const row = `${p.phase}|${podStatus(p)}|${podReadyColumn(p)}`
    if (seen.at(-1) !== row) seen.push(row)
  }
  assert.deepEqual(seen, ['Pending|Pending|0/1', 'Pending|ContainerCreating|0/1', 'Running|Running|0/1', 'Running|Running|1/1'])
})

test('L12 crash on start: phase Running, STATUS CrashLoopBackOff; restarts immediately, then after 10, 20, 40, 80 s (cap 300 s)', () => {
  const s = presetPodHealth({ behaviour: 'crashOnStart' })
  const restarts: number[] = []
  const finished: number[] = []
  let last = 0
  for (let i = 0; i < 2000; i++) {
    processTick(s)
    const p = pod(s, 'klopa-api-1')
    if (p.container.restartCount !== last) {
      last = p.container.restartCount
      restarts.push(s.t)
      finished.push(p.container.lastTermination!.finishedAt)
    }
  }
  const p = pod(s, 'klopa-api-1')
  assert.equal(p.phase, 'Running')
  const waits = restarts.map((t, i) => Math.round(t - finished[i]))
  assert.deepEqual(waits.slice(0, 5), [1, 10, 20, 40, 80], 'first restart as soon as the kubelet notices (1 s sync), then the back-off doubles')
  assert.equal(p.container.lastTermination!.exitCode, 1)
  assert.deepEqual(crashLoopDelays(10), [0, 10, 20, 40, 80, 160, 300, 300, 300, 300])
  assert.ok(kubectlGetPods(s).some((l) => l.includes('CrashLoopBackOff')))
  assert.equal(goDuration(80), '1m20s')
  assert.equal(goDuration(300), '5m0s')
})

test('L12 back-off resets after 10 min of clean running', () => {
  const s = presetPodHealth({ warm: true })
  const name = 'klopa-api-1'
  killContainer(s, name)
  advance(s, 2)
  assert.equal(pod(s, name).container.restartCount, 1, 'first restart is immediate')
  killContainer(s, name)
  advance(s, 2)
  assert.equal(podStatus(pod(s, name)), 'CrashLoopBackOff')
  advance(s, 10)
  assert.equal(pod(s, name).container.restartCount, 2)
  advance(s, 700)
  killContainer(s, name)
  advance(s, 2)
  assert.equal(pod(s, name).container.restartCount, 3, 'after 10 min clean the back-off is forgotten')
})

test('L12 wrong tag: phase Pending, STATUS ImagePullBackOff, nothing to restart', () => {
  const s = presetPodHealth({ wrongTag: true })
  advance(s, 30)
  for (const p of apiPods(s)) {
    assert.equal(p.phase, 'Pending')
    assert.equal(podStatus(p), 'ImagePullBackOff')
    assert.equal(p.container.restartCount, 0)
  }
})

test('L12 slow start 40 s: aggressive liveness without a startup probe → CrashLoopBackOff; with a startup probe → Ready at ~41 s, no restarts', () => {
  const bad = presetPodHealth({ behaviour: 'slowStart', probes: { liveness: probe('/healthz'), readiness: probe('/ready') } })
  advance(bad, 150)
  const p = pod(bad, 'klopa-api-1')
  assert.ok(p.container.restartCount >= 2)
  assert.equal(p.ready.status, false)
  assert.ok(bad.events.some((e) => e.kind === 'liveness-kill'))
  const good = presetPodHealth({ behaviour: 'slowStart', probes: { startup: probe('/healthz', { failureThreshold: 6 }), liveness: probe('/healthz'), readiness: probe('/ready') } })
  const readyAt = runUntil(good, (x) => pod(x, 'klopa-api-1').ready.status, 120)
  assert.ok(readyAt !== null && readyAt >= 40 && readyAt <= 45, `ready at ${readyAt}`)
  assert.equal(pod(good, 'klopa-api-1').container.restartCount, 0)
  // while the startup probe has not passed, liveness and readiness do not run
  const lanes = podView(good, pod(good, 'klopa-api-1')).probes
  assert.ok(lanes.find((l) => l.kind === 'startup')!.history.length >= 4)
})

test('L12 deadlock after 60 s: readiness takes it out of traffic, liveness restarts it in place (same name and IP, restarts +1)', () => {
  const s = presetPodHealth({ behaviour: 'hangsAfter60', warm: true, probes: { liveness: probe('/healthz'), readiness: probe('/ready') } })
  const before = { name: 'klopa-api-1', ip: pod(s, 'klopa-api-1').ip }
  const notReadyAt = runUntil(s, (x) => !pod(x, 'klopa-api-1').ready.status, 120)!
  const restartedAt = runUntil(s, (x) => pod(x, 'klopa-api-1').container.restartCount === 1, 120)!
  assert.ok(notReadyAt > 60 && notReadyAt < 95, `not ready at ${notReadyAt}`)
  assert.ok(restartedAt - notReadyAt >= 25, 'SIGTERM is ignored by the stuck process → SIGKILL after the 30 s grace period')
  const after = pod(s, 'klopa-api-1')
  assert.equal(after.ip, before.ip)
  assert.equal(after.container.lastTermination!.exitCode, 137)
  assert.equal(hangProcess(s, 'nema'), false)
})

test('L12 DB outage 60 s – three probe designs (liveness on DB / readiness on DB / process-only)', () => {
  const scenario = (liveness: '/ready-db' | '/healthz', readiness: '/ready-db' | '/ready') => {
    const s = presetPodHealth({ behaviour: 'dependsOnDb', warm: true, probes: { liveness: probe(liveness), readiness: probe(readiness) } })
    advance(s, 30)
    setDatabase(s, false, 60)
    let zeroEndpoints = 0
    for (let i = 0; i < 1200; i++) {
      processTick(s)
      if (getProxyEndpoints(s, 'klopa-api').length === 0) zeroEndpoints += 0.1
    }
    return { s, restarts: apiPods(s).reduce((a, p) => a + p.container.restartCount, 0), zeroEndpoints, t: trafficTotals(s) }
  }
  const live = scenario('/ready-db', '/ready')
  assert.ok(apiPods(live.s).every((p) => p.container.restartCount >= 1), 'every Pod restarts')
  assert.ok(live.s.events.some((e) => e.kind === 'liveness-kill' && e.t < 30 + 35), 'the first restart comes about 30 s into the outage')
  const ready = scenario('/healthz', '/ready-db')
  assert.equal(ready.restarts, 0)
  assert.ok(ready.zeroEndpoints > 30, `0 endpoints for ${ready.zeroEndpoints} s`)
  assert.ok(ready.t.noEndpoints > 400, 'clients get connection errors instead of a clear 503')
  const good = scenario('/healthz', '/ready')
  assert.equal(good.restarts, 0)
  assert.equal(good.zeroEndpoints, 0)
  assert.equal(good.t.noEndpoints, 0)
  assert.ok(Math.abs(good.t.http503 - 60 * 20) < 150, `quick 503s during the outage: ${good.t.http503}`)
  assert.ok(live.t.failed > good.t.failed, 'the wrong question turns a blip into an outage')
})

test('L12 no readiness probe: Ready as soon as the container starts → warm-up requests fail', () => {
  const s = presetPodHealth({})
  advance(s, 12)
  assert.ok(trafficTotals(s).http503 > 0)
  const t = presetPodHealth({ probes: { readiness: probe('/ready', { periodSeconds: 2 }) } })
  advance(t, 12)
  assert.equal(trafficTotals(t).http503, 0)
})

test('L12 readiness failure: Ready=False and out of traffic, no restart', () => {
  const s = presetPodHealth({ warm: true, probes: { liveness: probe('/healthz'), readiness: probe('/ready') } })
  setPodReadiness(s, 'klopa-api-2', false)
  advance(s, 40)
  const p = pod(s, 'klopa-api-2')
  assert.equal(p.ready.status, false)
  assert.equal(p.container.restartCount, 0)
  assert.equal(getProxyEndpoints(s, 'klopa-api').length, 2)
  assert.equal(getEndpointSlice(s, 'klopa-api').find((e) => e.podName === 'klopa-api-2')!.ready, false)
})

test('L12 bare Pods: deleted → gone forever; node off longer than the toleration → never recreated', () => {
  const s = presetPodHealth({ warm: true })
  deletePod(s, 'klopa-api-1')
  advance(s, 40)
  assert.equal(s.pods.some((p) => p.name === 'klopa-api-1'), false)
  const node = pod(s, 'klopa-api-2').nodeName!
  powerOffNode(s, node)
  advance(s, 60)
  assert.equal(podStatus(pod(s, 'klopa-api-2')), 'Terminating')
  assert.equal(apiPods(s).filter((p) => !p.deletion).length, 1, 'nothing recreates bare Pods')
})

// ---------------------------------------------------------------- L14 Services

test('L14 EndpointSlice lists every matching Pod with ready / serving / terminating; kube-proxy uses only ready ones, 1 s later', () => {
  const s = presetService({ preStopSleepS: 5 })
  setDeploymentVersion(s, 'klopa-api', '1.4.1', { preStopSleepS: 5 })
  let sawNotReady = false
  let sawTerminatingServing = false
  for (let i = 0; i < 300; i++) {
    processTick(s)
    const slice = getEndpointSlice(s, 'klopa-api')
    const proxy = getProxyEndpoints(s, 'klopa-api')
    for (const e of slice) {
      const p = s.pods.find((x) => x.id === e.podId)!
      assert.equal(e.terminating, p.deletion !== null)
      if (e.terminating) assert.equal(e.ready, false)
      if (!e.ready && !e.terminating) sawNotReady = true
      if (e.terminating && e.serving) sawTerminatingServing = true
    }
    for (const e of proxy) assert.equal(e.ready, true)
  }
  assert.ok(sawNotReady, 'not-ready Pods are listed with ready: false')
  assert.ok(sawTerminatingServing, 'a draining Pod is terminating but still serving')
  assert.equal(trafficTotals(s).failed, 0, 'preStop sleep 5 → 0 errors during the rollout')
})

test('L14 selector typo → 0 endpoints while every Pod is healthy; fixing it restores traffic', () => {
  const s = presetService({})
  setServiceSelectorByName(s, 'klopa-api', { app: 'klopa-apii' })
  advance(s, 1.5)
  assert.equal(getEndpointSlice(s, 'klopa-api').length, 0)
  assert.equal(getProxyEndpoints(s, 'klopa-api').length, 0)
  assert.ok(apiPods(s).every((p) => isReady(p)))
  const before = trafficTotals(s).noEndpoints
  advance(s, 5)
  assert.ok(trafficTotals(s).noEndpoints - before > 50)
  setServiceSelectorByName(s, 'klopa-api', { app: 'klopa-api' })
  advance(s, 1.5)
  assert.equal(getProxyEndpoints(s, 'klopa-api').length, 4)
})

test('L14 connections: new connection per request → random spread; one keep-alive → 100 % on one Pod; 4 connections → 4 random picks', () => {
  const spread = presetService({ rps: 40 })
  advance(spread, 30)
  const shares = hitShares(spread, 30)
  assert.equal(shares.length, 4)
  for (const h of shares) assert.ok(h.share > 0.15 && h.share < 0.35, `share ${h.share}`)
  const one = presetService({ traffic: false })
  addTrafficStream(one, { id: 'ka', serviceName: 'klopa-api', rps: 20, keepAlive: { connections: 1, maxAgeS: null } })
  advance(one, 30)
  const h1 = hitShares(one, 30)
  assert.equal(h1.length, 1)
  assert.equal(h1[0].share, 1)
  assert.equal(openConnections(one, 'ka').length, 1)
  const four = presetService({ traffic: false, seed: 3 })
  addTrafficStream(four, { id: 'ka', serviceName: 'klopa-api', rps: 20, keepAlive: { connections: 4, maxAgeS: null } })
  advance(four, 30)
  const pinned = new Set(openConnections(four, 'ka').map((c) => c.podId))
  assert.equal(openConnections(four, 'ka').length, 4)
  assert.ok(pinned.size >= 1 && pinned.size <= 4)
  assert.equal(hitShares(four, 30).length, pinned.size)
})

test('L14 sessionAffinity ClientIP: a whole campus behind one NAT IP lands on one Pod', () => {
  const s = presetService({ traffic: false })
  s.services[0].sessionAffinity = 'ClientIP'
  addTrafficStream(s, { id: 'campus', serviceName: 'klopa-api', rps: 30, clientIp: '161.53.0.1' })
  advance(s, 30)
  assert.equal(hitShares(s, 30).length, 1)
  assert.equal(s.services[0].affinityTimeoutS, 10800)
})

test('L14 a hard-coded Pod IP breaks on the next rollout; the Service name keeps working', () => {
  const s = presetService({ preStopSleepS: 5 })
  const ip = apiPods(s)[0].ip!
  assert.ok(podByIp(s, ip))
  setDeploymentVersion(s, 'klopa-api', '1.4.1', { preStopSleepS: 5 })
  advance(s, 60)
  assert.equal(podByIp(s, ip), undefined)
  assert.equal(resolveDns(s, 'klopa-api').ips[0], s.services[0].clusterIP)
})

test('L14 DNS: the short name works only inside the Namespace; FQDN works everywhere', () => {
  const s = presetService({ traffic: false })
  assert.equal(resolveDns(s, 'klopa-api', 'klopa').kind, 'ClusterIP')
  assert.equal(resolveDns(s, 'klopa-api', 'klopa-staging').kind, 'NXDOMAIN')
  assert.equal(resolveDns(s, 'klopa-api.klopa', 'klopa-staging').kind, 'ClusterIP')
  assert.equal(resolveDns(s, 'klopa-api.klopa.svc.cluster.local', 'default').name, 'klopa-api.klopa.svc.cluster.local')
  assert.equal(resolveDns(s, 'a.b.c.d').kind, 'NXDOMAIN')
})

test('L13/L14 relabel a Pod: it escapes the ReplicaSet (a new one appears) and leaves the Service', () => {
  const s = presetService({ traffic: false })
  const p = apiPods(s)[0]
  setPodLabel(s, p.name, 'app', 'debug')
  advance(s, 15)
  assert.equal(p.owner, null)
  assert.equal(apiPods(s).filter((x) => x.processUp).length, 4, 'a new Pod replaces the escaped one')
  assert.equal(getEndpointSlice(s, 'klopa-api').some((e) => e.podId === p.id), false)
  assert.ok(s.pods.includes(p), 'the escaped Pod keeps running')
})

test('L11 timeline rewind: replaying the recorded actions rebuilds exactly the same past state', () => {
  const tl = createTimeline(() => presetControlPlane())
  for (let i = 0; i < 300; i++) stepTimeline(tl, 1 / 60)
  act(tl, 'kubectl apply replicas 5', (s) => applyReplicaSetReplicas(s, 'klopa-api', 5))
  for (let i = 0; i < 600; i++) stepTimeline(tl, 1 / 60)
  act(tl, 'scheduler off', (s) => setComponent(s, 'scheduler', false))
  act(tl, 'kubectl apply replicas 7', (s) => applyReplicaSetReplicas(s, 'klopa-api', 7))
  for (let i = 0; i < 600; i++) stepTimeline(tl, 1 / 60)
  const live = snapshot(tl.state)
  const tNow = tl.state.t
  const past = rewindTo(tl, 8)
  assert.equal(past.t, 8)
  assert.equal(tl.actions.length, 1, 'actions after the rewind point are dropped')
  assert.equal(apiPods(past).length, 5)
  // replaying again to the end without new actions gives a different future (the later actions were dropped) …
  const tl2 = createTimeline(() => presetControlPlane())
  for (let i = 0; i < 300; i++) stepTimeline(tl2, 1 / 60)
  act(tl2, 'kubectl apply replicas 5', (s) => applyReplicaSetReplicas(s, 'klopa-api', 5))
  for (let i = 0; i < 600; i++) stepTimeline(tl2, 1 / 60)
  act(tl2, 'scheduler off', (s) => setComponent(s, 'scheduler', false))
  act(tl2, 'kubectl apply replicas 7', (s) => applyReplicaSetReplicas(s, 'klopa-api', 7))
  const again = rewindTo(tl2, tNow)
  // … while rewinding to "now" with all actions reproduces the live state exactly
  assert.equal(snapshot(again), live)
  assert.equal(rewindTo(tl2, Number.NaN).t, 0)
})

test('L14 Service types: NodePort 30000–32767; LoadBalancer stays <pending> without a cloud controller (kind)', () => {
  const s = presetService({ traffic: false })
  assert.match(kubectlGetServices(s)[1], /^klopa-api\s+ClusterIP\s+10\.96\.\d+\.\d+\s+<none>\s+80\/TCP/)
  assert.equal(setServiceTypeByName(s, 'klopa-api', 'NodePort').ok, true)
  const np = s.services[0].nodePort!
  assert.ok(np >= 30000 && np <= 32767)
  setServiceTypeByName(s, 'klopa-api', 'LoadBalancer')
  assert.equal(s.services[0].nodePort, np, 'the node port is kept')
  assert.match(kubectlGetServices(s)[1], /LoadBalancer\s+\S+\s+<pending>\s+80:\d{5}\/TCP/)
  const cloud = createCluster({ cloudLoadBalancer: true })
  createService(cloud, { name: 'web', selector: { app: 'web' } })
  setServiceTypeByName(cloud, 'web', 'LoadBalancer')
  assert.match(cloud.services[0].loadBalancerIP!, /^203\.0\.113\./)
  setServiceTypeByName(cloud, 'web', 'ClusterIP')
  assert.equal(cloud.services[0].nodePort, null)
  assert.equal(setServiceTypeByName(cloud, 'nema', 'NodePort').ok, false)
})

test('L14 packet path: DNS → ClusterIP → DNAT on the client node → conntrack reply, with live addresses', () => {
  const s = presetService({ traffic: false })
  applyBarePod(s, 'klijent', klopaApiTemplate('1.3.2', { labels: { app: 'klijent' } }))
  advance(s, 5)
  const hops = tracePacket(s, 'klijent', 'klopa-api', 1)!
  const svc = s.services[0]
  const client = pod(s, 'klijent')
  assert.equal(hops.length, 4)
  assert.equal(hops[0].label, `DNS: klopa-api → klopa-api.klopa.svc.cluster.local → ${svc.clusterIP}`)
  assert.equal(hops[1].dst, `${svc.clusterIP}:80`)
  assert.ok(getProxyEndpoints(s, 'klopa-api').some((e) => `${e.ip}:8000` === hops[2].dst))
  assert.match(hops[2].label, new RegExp(`čvoru ${client.nodeName}`))
  assert.equal(hops[3].src, `${svc.clusterIP}:80`)
  setServiceSelectorByName(s, 'klopa-api', { app: 'tipfeler' })
  advance(s, 2)
  assert.match(tracePacket(s, 'klijent', 'klopa-api')!.at(-1)!.label, /nema spremnih endpointa/)
  assert.equal(tracePacket(s, 'nema', 'klopa-api'), null)
})

test('L12/L24 kubectl describe pod: state, last state (exit code), probes, conditions and events', () => {
  const s = presetPodHealth({ behaviour: 'crashOnStart', probes: { liveness: probe('/healthz') } })
  advance(s, 60)
  const out = kubectlDescribePod(s, 'klopa-api-1').join('\n')
  assert.match(out, /State: {10}Waiting\n {6}Reason: {7}CrashLoopBackOff/)
  assert.match(out, /Last State: {5}Terminated\n {6}Reason: {7}Error\n {6}Exit Code: {4}1/)
  assert.match(out, /Liveness: {7}http-get http:\/\/:8000\/healthz delay=0s timeout=1s period=10s #success=1 #failure=3/)
  assert.match(out, /Ready {13}False/)
  assert.match(out, /Warning +BackOff .*kubelet +Back-off restarting failed container klopa-api in pod klopa-api-1/)
  assert.match(out, /QoS Class: +Burstable/)
  assert.equal(kubectlDescribePod(s, 'nema')[0], 'Error from server (NotFound): pods "nema" not found')
})

test('L12 changing probes of a bare Pod replaces it (same name, new IP, restart count 0)', () => {
  const s = presetPodHealth({ behaviour: 'crashOnStart', warm: false })
  advance(s, 30)
  const before = pod(s, 'klopa-api-1')
  assert.ok(before.container.restartCount > 0)
  const r = replaceBarePod(s, 'klopa-api-1', { probes: { ...NO_PROBES, readiness: probe('/ready') }, app: { ...before.spec.app, crashAfterS: null } })
  assert.equal(r.ok, true)
  advance(s, 15)
  const after = pod(s, 'klopa-api-1')
  assert.notEqual(after.id, before.id)
  assert.equal(after.container.restartCount, 0)
  assert.equal(after.ready.status, true)
  assert.equal(replaceBarePod(s, 'nema', {}).ok, false)
})

// ---------------------------------------------------------------- invariants under random actions

test('invariants under random actions (requests ≤ allocatable, unique Pod IPs, terminating never ready, never two db-N, RS converges)', () => {
  for (const seed of [1, 2, 3]) {
    const presets: [string, ClusterState][] = [
      ['rollout', presetRollout({ seed })],
      ['control', presetControlPlane({ seed })],
      ['storage', presetStorage({ seed, part: 'statefulset' })],
      ['scheduler', presetScheduler({ seed, manual: false })],
    ]
    for (const [name, s] of presets) {
      const rnd = s.rng
      for (let step = 0; step < 60; step++) {
        const a = Math.floor(rnd.next() * 8)
        const nodes = s.nodes.map((n) => n.name)
        const pick = <T>(xs: T[]) => xs[Math.floor(rnd.next() * xs.length)]
        if (a === 0 && s.pods.length) deletePod(s, pick(s.pods).name)
        else if (a === 1 && s.deployments.length) scaleDeployment(s, s.deployments[0].name, Math.floor(rnd.next() * 7))
        else if (a === 2 && s.deployments.length) setDeploymentVersion(s, s.deployments[0].name, pick(['1.3.2', '1.4.0', '1.5.0-crash'] as const))
        else if (a === 3) powerOffNode(s, pick(nodes))
        else if (a === 4) powerOnNode(s, pick(nodes))
        else if (a === 5 && s.statefulSets.length) scaleStatefulSet(s, 'db', Math.floor(rnd.next() * 4))
        else if (a === 6 && s.replicaSets.length && !s.replicaSets[0].owner) applyReplicaSetReplicas(s, s.replicaSets[0].name, Math.floor(rnd.next() * 7))
        for (let i = 0; i < 30; i++) {
          processTick(s)
          for (const n of s.nodes) {
            const pods = s.pods.filter((p) => p.nodeName === n.name && p.phase !== 'Failed' && p.phase !== 'Succeeded')
            const cpu = n.daemonSet.cpuM + pods.reduce((x, p) => x + (p.spec.resources.requests.cpuM ?? p.spec.resources.limits.cpuM ?? 0), 0)
            const mem = n.daemonSet.memMi + pods.reduce((x, p) => x + (p.spec.resources.requests.memMi ?? p.spec.resources.limits.memMi ?? 0), 0)
            assert.ok(cpu <= n.allocatable.cpuM && mem <= n.allocatable.memMi, `${name}/${seed}: ${n.name} over-committed by requests`)
          }
          const ips = s.pods.filter((p) => p.ip && !p.deletion).map((p) => p.ip)
          assert.equal(new Set(ips).size, ips.length, `${name}/${seed}: duplicate Pod IP`)
          for (const svc of s.services) for (const e of s.slices[svc.id].endpoints) if (e.terminating) assert.equal(e.ready, false)
          const dbNames = s.pods.filter((p) => p.owner?.kind === 'StatefulSet').map((p) => p.name)
          assert.equal(new Set(dbNames).size, dbNames.length, `${name}/${seed}: two Pods with one StatefulSet identity`)
          assert.ok(s.events.length <= 50)
        }
      }
      // with every node back and enough time, ReplicaSets converge on spec.replicas
      for (const n of s.nodes) powerOnNode(s, n.name)
      advance(s, 120)
      for (const rs of s.replicaSets) {
        const active = s.pods.filter((p) => p.owner?.id === rs.id && !p.deletion && p.phase !== 'Failed').length
        assert.equal(active, rs.replicas, `${name}/${seed}: ReplicaSet ${rs.name} did not converge`)
      }
    }
  }
})

// ---------------------------------------------------------------- edge cases

test('edge cases: empty cluster, zero replicas, NaN inputs, division-by-zero helpers', () => {
  const empty = createCluster()
  advance(empty, 30)
  assert.equal(empty.t, 30)
  assert.equal(kubectlGetPods(empty)[0], 'No resources found in klopa namespace.')
  assert.deepEqual(clusterCost(empty, 0.1), { nodeHours: 0, eur: 0, eurPerHourNow: 0 })
  const st = requestStats(empty)
  assert.equal(st.total, 0)
  assert.equal(st.errorRate, 0)
  assert.equal(st.p95Ms, null, 'n/a below 20 successful requests')
  // a Service with no Pods and traffic → noEndpoints, never NaN
  createService(empty, { name: 'nic', selector: { app: 'nic' } })
  addTrafficStream(empty, { id: 'x', serviceName: 'nic', rps: 10 })
  addTrafficStream(empty, { id: 'y', serviceName: 'ne-postoji', rps: 10 })
  advance(empty, 5)
  assert.ok(trafficTotals(empty).noEndpoints > 50)
  assert.ok(Number.isFinite(requestStats(empty).errorRate))
  // zero replicas, negative and NaN scale requests
  const s = presetRollout({ traffic: false })
  const neg = scaleDeployment(s, 'klopa-api', -3)
  assert.equal(neg.ok, false)
  assert.equal(neg.message, 'The Deployment "klopa-api" is invalid: spec.replicas: Invalid value: -3: must be greater than or equal to 0')
  assert.equal(s.deployments[0].replicas, 4, 'a rejected scale changes nothing')
  assert.equal(scaleDeployment(s, 'klopa-api', 0).ok, true)
  advance(s, 10)
  assert.equal(s.deployments[0].replicas, 0)
  assert.equal(apiPods(s).length, 0)
  setDeploymentVersion(s, 'klopa-api', '1.4.0')
  advance(s, 5)
  assert.equal(s.deployments[0].status.replicas, 0)
  assert.equal(scaleDeployment(s, 'klopa-api', Number.NaN).ok, false)
  assert.equal(scaleDeployment(s, 'klopa-api', 2.5).ok, false)
  assert.equal(scaleDeployment(s, 'klopa-api', 1e9).ok, false, 'a stray huge value never creates a billion Pods')
  assert.equal(s.deployments[0].replicas, 0)
  // every node down: Pods go Pending with the upstream message
  const c = createCluster({ nodes: [nodeSpec('node-1')] })
  createDeployment(c, { name: 'klopa-api', replicas: 1, template: klopaApiTemplate('1.3.2') })
  advance(c, 5)
  powerOffNode(c, 'node-1')
  advance(c, 400)
  assert.ok(apiPods(c).some((p) => p.nodeName === null && /0\/1 nodes are available: 1 node\(s\) had untolerated taint \{node\.kubernetes\.io\/unreachable: \}/.test(p.scheduled.message)))
  // pure helpers
  assert.deepEqual(fenceposts('25%', '25%', 0), { surge: 0, unavailable: 0 })
  assert.deepEqual(waterFill([], [], 100), [])
  assert.deepEqual(waterFill([100, 100], [1, 1], 0), [0, 0])
  assert.ok(Number.isNaN(cfsLatencyMs(Number.NaN, 200).latencyMs))
  assert.equal(cfsLatencyMs(50, 0).latencyMs, Number.POSITIVE_INFINITY)
  assert.equal(failedSchedulingMessage(0, []), 'no nodes available to schedule pods')
  assert.equal(hpaFormula(0, 90, 50).desired, 0)
  assert.equal(canaryReplicasFor(Number.NaN, 4), 0)
  assert.equal(canaryReplicasFor(5, 0), 0)
  assert.equal(pickRoute([{ serviceName: 'a', weight: 0 }], 0.5), null)
  assert.equal(pickRoute([{ serviceName: 'a', weight: Number.NaN }, { serviceName: 'b', weight: 1 }], 0.1), 'b')
  assert.equal(profileRate({ kind: 'sine', min: 10, max: 80, periodS: 0 }, 5), 10)
  assert.equal(profileRate({ kind: 'steady', rps: -5 }, 0), 0)
  assert.equal(goDuration(Number.NaN), '0s')
  const v = nodeView(s, s.nodes[0])
  assert.equal(v.requested.pods, 0)
  assert.ok(Number.isFinite(v.memoryAvailableMi))
  // bare Pod template on a node that does not exist is just Pending
  const lone = createCluster({ nodes: [] })
  applyBarePod(lone, 'sam', podTemplate({ labels: { app: 'sam' }, image: KLOPA_API_VERSIONS['1.3.2'].image }))
  advance(lone, 3)
  assert.equal(podStatus(pod(lone, 'sam')), 'Pending')
})

test('actions reject NaN and impossible values instead of corrupting the state', () => {
  const s = presetScheduler({ manual: false })
  advance(s, 5)
  assert.equal(setPodUsage(s, 'web', { cpuM: Number.NaN, memMi: Number.POSITIVE_INFINITY }), true)
  assert.equal(pod(s, 'web').usage.cpuDemandOverrideM, null)
  assert.equal(setNodeExtraMemory(s, 'node-1', Number.NaN), false)
  advance(s, 15)
  for (const n of s.nodes) assert.ok(Number.isFinite(nodeView(s, n).memoryAvailableMi))
  for (const p of s.pods) assert.ok(Number.isFinite(p.usage.cpuM) && Number.isFinite(p.usage.memMi))
  const a = presetAutoscaling({})
  assert.equal(setCpuRequest(a, 'klopa-api', Number.NaN).ok, false)
  assert.equal(setCpuRequest(a, 'klopa-api', -100).ok, false)
  assert.equal(setHpa(a, 'klopa-api', { minReplicas: 10, maxReplicas: 4 }), false)
  assert.equal(setHpa(a, 'klopa-api', { targetUtilization: 0 }), false)
  assert.equal(setHpa(a, 'klopa-api', { minReplicas: 0 }), false, 'CPU-based HPA cannot scale to zero')
  assert.equal(setHpa(a, 'klopa-api', { maxReplicas: Number.NaN }), false)
  assert.equal(setHpa(a, 'nema', { maxReplicas: 4 }), false)
  assert.equal(setClusterAutoscaler(a, { minNodes: 5, maxNodes: 3 }), false)
  assert.equal(setClusterAutoscaler(a, { maxNodes: Number.NaN }), false)
  assert.equal(setClusterAutoscaler(a, { maxNodes: 4 }), true)
  assert.equal(a.cfg.autoscaler!.maxNodes, 4)
  advance(a, 120)
  assert.ok(a.hpas[0].decisions.every((d) => Number.isFinite(d.final)))
})

test('PodShape status and version colours for the kit (running / notready / pending / creating / crash / oom / terminating)', () => {
  const crash = presetPodHealth({ behaviour: 'crashOnStart' })
  advance(crash, 8)
  assert.equal(podShapeStatus(pod(crash, 'klopa-api-1')), 'crash')
  const tag = presetPodHealth({ wrongTag: true })
  advance(tag, 0.3)
  assert.equal(podShapeStatus(pod(tag, 'klopa-api-1')), 'pending')
  advance(tag, 0.5)
  assert.equal(podShapeStatus(pod(tag, 'klopa-api-1')), 'creating')
  advance(tag, 10)
  assert.equal(podShapeStatus(pod(tag, 'klopa-api-1')), 'crash')
  const ok = presetPodHealth({ warm: true, probes: { readiness: probe('/ready') } })
  assert.equal(podShapeStatus(pod(ok, 'klopa-api-1')), 'running')
  setPodReadiness(ok, 'klopa-api-1', false)
  advance(ok, 31)
  assert.equal(podShapeStatus(pod(ok, 'klopa-api-1')), 'notready')
  deletePod(ok, 'klopa-api-2')
  assert.equal(podShapeStatus(pod(ok, 'klopa-api-2')), 'terminating')
  const sch = presetScheduler({ manual: false })
  // second OOM kill (~64 s) → CrashLoopBackOff whose last termination was OOMKilled
  const oomAt = runUntil(sch, (x) => pod(x, 'leaky').container.restartCount === 1 && podStatus(pod(x, 'leaky')) === 'CrashLoopBackOff', 120)
  assert.ok(oomAt !== null)
  assert.equal(podView(sch, pod(sch, 'leaky')).shape, 'oom')
  assert.equal(versionTone('1.3.2'), 'blue')
  assert.equal(versionTone('1.4.0'), 'violet')
  assert.equal(versionTone('1.5.0'), 'rose')
  assert.equal(versionTone(null), 'blue')
})
