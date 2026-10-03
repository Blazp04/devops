/**
 * Scheduler and resources (L17) – sim-models SIM 3.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ClusterState } from './types.ts'
import {
  advance,
  cfsLatencyMs,
  cordonNode,
  createCluster,
  createPodObject,
  explainScheduling,
  failedSchedulingMessage,
  memoryAvailable,
  nodeSpec,
  nodeView,
  oomScoreAdj,
  placePod,
  podStatus,
  podView,
  presetScheduler,
  qosClass,
  removeRequests,
  resources,
  setComponent,
  setNodeExtraMemory,
  setPodUsage,
  waterFill,
  podTemplate,
  appBehaviour,
  REGISTRY,
  SCHEDULER_CARDS,
  cardTemplate,
  crashLoopDelays,
  powerOffNode,
  advance as adv,
  setKubelet,
} from './index.ts'

function pod(s: ClusterState, name: string) {
  const p = s.pods.find((x) => x.name === name)
  assert.ok(p, `pod ${name}`)
  return p
}

test('big-db: the two-reason FailedScheduling message (sorted histogram + preemption)', () => {
  const s = presetScheduler({ testPods: false })
  const e = explainScheduling(s, pod(s, 'big-db'))
  assert.equal(e.message, '0/3 nodes are available: 2 Insufficient memory, 3 Insufficient cpu. preemption: 0/3 nodes are available: 3 No preemption victims found for incoming pod.')
  const rows = Object.fromEntries(e.rows.map((r) => [r.node, r.reasons]))
  assert.deepEqual(rows['node-1'], ['Insufficient cpu', 'Insufficient memory'])
  assert.deepEqual(rows['node-2'], ['Insufficient cpu'])
  assert.deepEqual(rows['node-3'], ['Insufficient cpu', 'Insufficient memory'])
})

test('automatic scheduling places everything except big-db and fragment; fragment is Pending although Σ free CPU ≥ 1500m', () => {
  const s = presetScheduler({})
  setComponent(s, 'scheduler', true)
  advance(s, 1)
  const pending = s.pods.filter((p) => p.nodeName === null).map((p) => p.name).sort()
  assert.deepEqual(pending, ['big-db', 'fragment'])
  assert.equal(pod(s, 'fragment').scheduled.message, '0/3 nodes are available: 3 Insufficient cpu. preemption: 0/3 nodes are available: 3 No preemption victims found for incoming pod.')
  const freeTotal = s.nodes.reduce((a, n) => a + (n.allocatable.cpuM - nodeView(s, n).requested.cpuM), 0)
  assert.ok(freeTotal >= 1500, `free CPU in total ${freeTotal}m`)
  for (const n of s.nodes) assert.ok(n.allocatable.cpuM - nodeView(s, n).requested.cpuM < 1500)
})

test('scheduling looks at requests only: a node 30 % used but 95 % requested rejects a new Pod', () => {
  const s = createCluster({ nodes: [nodeSpec('node-1')] })
  // reserved but idle
  createPodObject(s, podTemplate({ labels: { app: 'proba' }, image: `${REGISTRY}/x:1`, resources: resources(1700, 256), app: appBehaviour({ cpuDemandM: 400, warmS: 1 }) }), { name: 'proba', namespace: 'klopa', owner: null })
  advance(s, 10)
  const v = nodeView(s, s.nodes[0])
  assert.ok(v.used.cpuM / v.allocatable.cpuM < 0.35)
  assert.ok(v.requested.cpuM / v.allocatable.cpuM > 0.9)
  createPodObject(s, podTemplate({ labels: { app: 'novi' }, image: `${REGISTRY}/x:1`, resources: resources(250, 128) }), { name: 'novi', namespace: 'klopa', owner: null })
  advance(s, 2)
  assert.equal(pod(s, 'novi').nodeName, null)
  assert.match(pod(s, 'novi').scheduled.message, /1 Insufficient cpu/)
})

test('LeastAllocated scoring and tie-break; manual placement is refused with the filter reason', () => {
  const s = presetScheduler({ testPods: false })
  const e = explainScheduling(s, pod(s, 'web'))
  // node-2 is the biggest → most free in percent
  assert.deepEqual(e.best, ['node-2'])
  const n2 = e.rows.find((r) => r.node === 'node-2')!.score!
  // cpu: (3920 − (100 + 250)) · 100 / 3920 = 91; mem: (13622 − (200 + 256)) · 100 / 13622 = 96 → 93
  assert.deepEqual(n2, { cpuScore: 91, memScore: 96, score: 93 })
  const r = placePod(s, 'big-db', 'node-1')
  assert.equal(r.ok, false)
  assert.deepEqual(r.reasons, ['Insufficient cpu', 'Insufficient memory'])
  const ok = placePod(s, 'web', 'node-1')
  assert.equal(ok.ok, true)
  assert.equal(pod(s, 'web').nodeName, 'node-1')
})

test('QoS classes and oom_score_adj', () => {
  const tpl = (name: string) => cardTemplate(SCHEDULER_CARDS.find((c) => c.name === name)!)
  assert.equal(qosClass(tpl('api-guaranteed')), 'Guaranteed')
  assert.equal(qosClass(tpl('web')), 'Burstable')
  assert.equal(qosClass(tpl('besteffort')), 'BestEffort')
  assert.equal(oomScoreAdj(tpl('api-guaranteed'), 4096), -997)
  assert.equal(oomScoreAdj(tpl('besteffort'), 4096), 1000)
  // Burstable: kubelet's int64 maths 1000 − ⌊1000 · 256 / 4096⌋ = 1000 − ⌊62,5⌋ = 938 (pkg/kubelet/qos/policy.go)
  assert.equal(oomScoreAdj(tpl('web'), 4096), 938)
  // lower bound 1000 + (−997) = 3 (a Burstable Pod requesting nearly the whole node), upper bound 999
  assert.equal(oomScoreAdj(podTemplate({ labels: { app: 'x' }, image: 'x:1', resources: resources(100, 4090, 200) }), 4096), 3)
  assert.equal(oomScoreAdj(podTemplate({ labels: { app: 'x' }, image: 'x:1', resources: resources(100, 1, 200) }), 4096), 999)
  // only a limit → the request defaults to the limit
  const onlyLimit = podTemplate({ labels: { app: 'x' }, image: 'x:1', resources: resources(undefined, undefined, 500, 512) })
  assert.equal(qosClass(onlyLimit), 'Guaranteed')
})

test('CPU over the limit is throttled (cpu-burner 50 %), never killed; batch bursts into idle CPU', () => {
  const s = presetScheduler({})
  setComponent(s, 'scheduler', true)
  advance(s, 120)
  const b = podView(s, pod(s, 'cpu-burner'))
  assert.ok(Math.abs(b.cpu.throttledPct - 0.5) < 1e-9)
  assert.equal(b.cpu.usedM, 500)
  assert.equal(b.restarts, 0)
  const batch = podView(s, pod(s, 'batch'))
  assert.ok(batch.cpu.usedM > 1000, 'no CPU limit: uses idle CPU above its request')
})

test('leaky: OOMKilled (exit 137) about 31 s after start, then CrashLoopBackOff with growing delays; neighbours unharmed', () => {
  const s = presetScheduler({})
  setComponent(s, 'scheduler', true)
  let startedAt: number | null = null
  let oomAt: number | null = null
  for (let i = 0; i < 2000 && oomAt === null; i++) {
    adv(s, 0.1)
    const p = pod(s, 'leaky')
    if (startedAt === null && p.processUp) startedAt = p.processStartedAt
    if (p.container.lastTermination?.reason === 'OOMKilled') oomAt = p.container.lastTermination.finishedAt
  }
  assert.ok(startedAt !== null && oomAt !== null)
  assert.ok(Math.abs(oomAt - startedAt - 31.2) <= 0.2, `OOM after ${oomAt - startedAt}`)
  assert.equal(pod(s, 'leaky').container.lastTermination!.exitCode, 137)
  advance(s, 150)
  const v = podView(s, pod(s, 'leaky'))
  assert.ok(v.restarts >= 3)
  assert.ok(s.pods.filter((p) => p.name !== 'leaky').every((p) => p.container.restartCount === 0))
  assert.deepEqual(crashLoopDelays(8), [0, 10, 20, 40, 80, 160, 300, 300])
})

test('node memory pressure: eviction every 10 s ranks usage > request first → BestEffort goes first; BestEffort kept off the node', () => {
  const s = createCluster({ nodes: [nodeSpec('node-1', { memMi: 4096, allocatableMemMi: 2972 })], timings: { scheduleDelayS: 0, containerCreateS: 0.5, imagePullS: 0.5 } })
  const mk = (name: string, req: ReturnType<typeof resources>, mem: number) => createPodObject(s, podTemplate({ labels: { app: name }, image: `${REGISTRY}/${name}:1`, resources: req, app: appBehaviour({ memMi: mem, warmS: 1 }) }), { name, namespace: 'klopa', owner: null })
  mk('guaranteed', resources(200, 800, 200, 800), 700)
  mk('burstable', resources(200, 600, undefined, 1500), 500)
  mk('besteffort', resources(), 400)
  advance(s, 5)
  assert.ok(memoryAvailable(s, s.nodes[0]) > 100)
  // "Worker za fotografije" – memory outside the limits grows until the kubelet must evict
  setNodeExtraMemory(s, 'node-1', 1200)
  advance(s, 10.1)
  assert.equal(pod(s, 'besteffort').phase, 'Failed')
  assert.equal(podStatus(pod(s, 'besteffort')), 'Evicted')
  assert.equal(s.nodes[0].memoryPressure.status, true)
  // BestEffort Pods are not scheduled on a node under memory pressure; Burstable ones are
  mk('be2', resources(), 50)
  mk('bu2', resources(10, 10), 10)
  advance(s, 1)
  assert.equal(pod(s, 'be2').nodeName, null)
  assert.match(pod(s, 'be2').scheduled.message, /node\.kubernetes\.io\/memory-pressure/)
  assert.equal(pod(s, 'bu2').nodeName, 'node-1')
})

test('kernel OOM killer acts before the kubelet when memory runs out (highest oom_score)', () => {
  const s = createCluster({ nodes: [nodeSpec('node-1', { memMi: 4096, allocatableMemMi: 2972 })], timings: { scheduleDelayS: 0, containerCreateS: 0.5, imagePullS: 0.5 } })
  const mk = (name: string, req: ReturnType<typeof resources>, mem: number) => createPodObject(s, podTemplate({ labels: { app: name }, image: `${REGISTRY}/${name}:1`, resources: req, app: appBehaviour({ memMi: mem, warmS: 1 }) }), { name, namespace: 'klopa', owner: null })
  mk('guaranteed', resources(200, 1200, 200, 1200), 1100)
  mk('besteffort', resources(), 300)
  advance(s, 3.05)
  setNodeExtraMemory(s, 'node-1', 1800)
  advance(s, 0.2)
  assert.equal(pod(s, 'besteffort').container.lastTermination?.reason, 'OOMKilled')
  assert.equal(pod(s, 'guaranteed').container.restartCount, 0)
})

test('"Ukloni requests" turns a Pod into BestEffort (re-created; packed anywhere, evicted first)', () => {
  const s = presetScheduler({ testPods: false })
  assert.equal(removeRequests(s, 'web').ok, true)
  assert.equal(qosClass(pod(s, 'web').spec), 'BestEffort')
  setComponent(s, 'scheduler', true)
  advance(s, 3)
  assert.equal(removeRequests(s, 'web').ok, true, 'running Pod is replaced')
  assert.equal(qosClass(pod(s, 'web').spec), 'BestEffort')
  assert.equal(removeRequests(s, 'nope').ok, false)
})

test('usage sliders never change scheduling (requests do)', () => {
  const s = presetScheduler({ testPods: false })
  setPodUsage(s, 'web', { cpuM: 3000, memMi: 4000 })
  const before = explainScheduling(s, pod(s, 'web')).rows.map((r) => r.score)
  setPodUsage(s, 'web', { cpuM: 1, memMi: 1 })
  assert.deepEqual(explainScheduling(s, pod(s, 'web')).rows.map((r) => r.score), before)
})

test('cordon and unreachable nodes are filtered with upstream reasons', () => {
  const s = presetScheduler({ testPods: false })
  cordonNode(s, 'node-2', true)
  setKubelet(s, 'node-3', false)
  powerOffNode(s, 'node-1')
  advance(s, 11)
  const e = explainScheduling(s, pod(s, 'web'))
  assert.equal(
    e.message,
    '0/3 nodes are available: 1 node(s) were unschedulable, 2 node(s) had untolerated taint {node.kubernetes.io/unreachable: }. preemption: 0/3 nodes are available: 3 Preemption is not helpful for scheduling.',
  )
})

test('failedSchedulingMessage edge cases', () => {
  assert.equal(failedSchedulingMessage(0, []), 'no nodes available to schedule pods')
  assert.equal(
    failedSchedulingMessage(2, [
      { fits: false, reasons: ['Too many pods'], plugin: 'NodeResourcesFit', unresolvable: false },
      { fits: false, reasons: ['Insufficient memory'], plugin: 'NodeResourcesFit', unresolvable: false },
    ]),
    '0/2 nodes are available: 1 Insufficient memory, 1 Too many pods. preemption: 0/2 nodes are available: 2 No preemption victims found for incoming pod.',
  )
})

test('CFS quota: 200m limit, 50 ms of work → 210 ms (20 + 80 + 20 + 80 + 10)', () => {
  const r = cfsLatencyMs(50, 200)
  assert.equal(r.latencyMs, 210)
  assert.equal(r.throttledMs, 160)
  assert.deepEqual(
    r.periods.map((p) => [p.runMs, p.throttledMs]),
    [
      [20, 80],
      [20, 80],
      [10, 0],
    ],
  )
  assert.equal(cfsLatencyMs(50, 1000).latencyMs, 50)
  assert.equal(cfsLatencyMs(40, 200).latencyMs, 120)
  assert.equal(cfsLatencyMs(50, 0).latencyMs, Infinity)
  assert.ok(Number.isNaN(cfsLatencyMs(Number.NaN, 200).latencyMs))
  assert.equal(cfsLatencyMs(0, 200).latencyMs, 0)
})

test('water-fill: within capacity everyone gets the cap; oversubscribed → shares ∝ requests', () => {
  assert.deepEqual(waterFill([100, 200], [1, 1], 1000), [100, 200])
  const r = waterFill([1000, 1000], [250, 750], 1000)
  assert.ok(Math.abs(r[0] - 250) < 1e-9 && Math.abs(r[1] - 750) < 1e-9)
  // the small one is capped, the rest goes to the big one
  const r2 = waterFill([100, 2000], [500, 500], 1000)
  assert.ok(Math.abs(r2[0] - 100) < 1e-9 && Math.abs(r2[1] - 900) < 1e-9)
  assert.deepEqual(waterFill([500], [2], 0), [0])
  assert.deepEqual(waterFill([], [], 100), [])
})
