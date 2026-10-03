/**
 * HPA + Cluster Autoscaler + KEDA (L18) – sim-models E1 / SIM 4 and proto/hpa-sim.ts.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ClusterState } from './types.ts'
import {
  advance,
  hpaFormula,
  kubectlGetHpa,
  pendingUnschedulable,
  presetAutoscaling,
  publishMessages,
  removeCpuRequest,
  setClusterAutoscaler,
  setHpa,
  setQueueArrivalRate,
  setTrafficProfile,
  TRAFFIC_PRESETS,
  clusterCost,
  setColdImageCache,
  setCpuRequest,
} from './index.ts'

function readyPods(s: ClusterState, app = 'klopa-api'): number {
  return s.pods.filter((p) => p.labels.app === app && p.ready.status && !p.deletion).length
}

function replicasAt(s: ClusterState): number {
  return s.deployments.find((d) => d.name === 'klopa-api')!.replicas
}

test('formula: 3 Pods at 90 % with target 50 → 6; at 54 % → no change (tolerance 10 %)', () => {
  assert.deepEqual(hpaFormula(3, 90, 50), { ratio: 1.8, desired: 6, withinTolerance: false })
  const r = hpaFormula(3, 54, 50)
  assert.equal(r.withinTolerance, true)
  assert.equal(r.desired, 3)
  // edges: 55 % is still inside (1,10), 56 % is not
  assert.equal(hpaFormula(9, 55, 50).desired, 9)
  assert.equal(hpaFormula(9, 56, 50).desired, 11)
  assert.equal(hpaFormula(9, 45, 50).desired, 9)
  assert.equal(hpaFormula(9, 44, 50).desired, 8)
})

test('validated spike timeline: 2→3 (60), 3→7 (75, raw 8 capped by +4), 7→9 (90), CA at 80, node Ready 155, all Ready by ~180', () => {
  const s = presetAutoscaling({ seed: 42 })
  const scaleAt: Record<number, [number, number]> = {}
  let caAt: number | null = null
  let nodeReadyAt: number | null = null
  let allReadyAt: number | null = null
  for (let sec = 0; sec < 200; sec++) {
    advance(s, 1)
    for (const d of s.hpas[0].decisions) if (d.final !== d.current) scaleAt[d.t] = [d.current, d.final]
    if (caAt === null && s.nodes.length === 3) caAt = Math.round(s.t - 1)
    if (nodeReadyAt === null && s.nodes.some((n) => n.name === 'node-3' && n.machine === 'running')) nodeReadyAt = Math.round(s.t - 1)
    if (allReadyAt === null && replicasAt(s) === 9 && readyPods(s) === 9) allReadyAt = s.t
  }
  assert.deepEqual(scaleAt, { 60: [2, 3], 75: [3, 7], 90: [7, 9] })
  const d75 = s.hpas[0].decisions.find((d) => d.t === 75)!
  assert.equal(d75.raw, 8)
  assert.equal(d75.limitedBy, 'ScaleUpLimit')
  assert.equal(d75.unreadyPods, 1)
  const d90 = s.hpas[0].decisions.find((d) => d.t === 90)!
  assert.equal(d90.unreadyPods, 4, 'unready Pods (not Ready or inside the CPU initialisation window) count as 0 %')
  assert.equal(caAt, 80)
  assert.equal(nodeReadyAt, 155)
  assert.ok(allReadyAt !== null && allReadyAt <= 180, `all Ready at ${allReadyAt}`)
})

test('during t = 60–75 the two Pods are saturated: ρ ≈ 0,99 cap and latency ≈ 5 s (M/M/1 estimate)', () => {
  const s = presetAutoscaling({})
  advance(s, 66)
  const st = s.traffic[0]
  assert.ok(st.rho >= 0.99)
  assert.ok(Math.abs(st.latencyMs - 5000) < 1)
  assert.ok(st.dropped > 0, 'ρ > 1 drops 1 − 1/ρ of the requests')
})

test('dead band: stays at 9 (55 %, ratio 1,10 within tolerance) and scales down to 2 exactly at t = 720 (300 s window)', () => {
  const s = presetAutoscaling({})
  advance(s, 400)
  const d = s.hpas[0].decisions.find((x) => x.t === 390)!
  assert.equal(d.metric, 55)
  assert.equal(d.withinTolerance, true)
  assert.equal(replicasAt(s), 9)
  advance(s, 310) // t = 710
  assert.equal(replicasAt(s), 9, 'scale-down waits for the stabilisation window')
  assert.equal(s.hpas[0].decisions.find((x) => x.t === 435)!.limitedBy, 'stabilization')
  advance(s, 11) // t = 721
  assert.equal(replicasAt(s), 2)
  const down = s.hpas[0].decisions.find((x) => x.final !== x.current && x.t > 600)!
  assert.equal(down.t, 720)
})

test('Cluster Autoscaler removes the extra (empty) node after ≥ 10 min unneeded; never below minNodes', () => {
  const s = presetAutoscaling({})
  advance(s, 1300)
  assert.equal(s.nodes.length, 3)
  advance(s, 60)
  assert.equal(s.nodes.length, 2)
  assert.ok(s.events.some((e) => e.kind === 'ca-scale-down'))
  advance(s, 1500)
  assert.equal(s.nodes.length, 2)
})

test('"Ukloni CPU request": without requests the HPA cannot compute utilisation and stays put', () => {
  const s = presetAutoscaling({ cpuRequestM: null })
  advance(s, 200)
  assert.equal(replicasAt(s), 2)
  const last = s.hpas[0].decisions.at(-1)!
  assert.equal(last.limitedBy, 'error')
  assert.match(last.error!, /missing request for cpu/)
  assert.equal(s.hpas[0].status.scalingActive, false)
  assert.match(kubectlGetHpa(s)[1], /cpu: <unknown>\/50%/)
  // the break-it action on a running preset does the same through a rollout
  const s2 = presetAutoscaling({ profile: TRAFFIC_PRESETS.steady })
  assert.equal(removeCpuRequest(s2, 'klopa-api').ok, true)
  advance(s2, 120)
  assert.ok(s2.hpas[0].decisions.at(-1)!.error)
})

test('"maxReplicas = 4" caps capacity: the HPA wants more, requests are dropped', () => {
  const s = presetAutoscaling({ maxReplicas: 4 })
  advance(s, 200)
  assert.equal(replicasAt(s), 4)
  const d = s.hpas[0].decisions.find((x) => x.t === 105)!
  assert.ok(d.raw > 4)
  assert.equal(d.limitedBy, 'TooManyReplicas')
  // 100 rps over 4 Pods = 25 rps each < 40 rps at the limit: no drops after the burst, but latency is higher than with 9
  assert.ok(s.traffic[0].latencyMs > 100)
  setHpa(s, 'klopa-api', { maxReplicas: 20 })
  advance(s, 30)
  assert.ok(replicasAt(s) > 4)
})

test('flash crowd 20 → 200 with at most 6 nodes leaves Pods Pending (FailedScheduling) and drops requests', () => {
  const s = presetAutoscaling({ profile: TRAFFIC_PRESETS.flash })
  advance(s, 400)
  assert.equal(s.nodes.length, 6)
  assert.ok(pendingUnschedulable(s).length > 0)
  assert.match(pendingUnschedulable(s)[0].scheduled.message, /Insufficient cpu/)
  // 6 nodes × 3 Pods = 18 fit; the HPA wants more
  assert.ok(replicasAt(s) > 18, `replicas ${replicasAt(s)}`)
  assert.equal(readyPods(s), 18)
  assert.ok(s.events.some((e) => e.kind === 'ca-max'))
  assert.ok(s.traffic[0].dropped > 0)
})

test('Cluster Autoscaler off: Pending Pods stay Pending, no node is added', () => {
  const s = presetAutoscaling({ clusterAutoscaler: false })
  advance(s, 300)
  assert.equal(s.nodes.length, 2)
  assert.equal(readyPods(s), 6)
  assert.ok(pendingUnschedulable(s).length === 3)
  setClusterAutoscaler(s, { enabled: true })
  advance(s, 100)
  assert.equal(s.nodes.length, 3)
})

test('cold image cache lengthens every new node: Pods on node-3 start later', () => {
  const warm = presetAutoscaling({})
  advance(warm, 200)
  const cold = presetAutoscaling({})
  setColdImageCache(cold, true, 30)
  advance(cold, 200)
  const firstReady = (s: ClusterState) => Math.min(...s.pods.filter((p) => p.nodeName === 'node-3' && p.ready.status).map((p) => p.ready.since))
  assert.ok(firstReady(cold) - firstReady(warm) >= 24, `${firstReady(cold)} vs ${firstReady(warm)}`)
})

test('CPU request slider: a bigger request means fewer Pods per node (scheduler) and lower utilisation per Pod (HPA)', () => {
  const s = presetAutoscaling({ profile: TRAFFIC_PRESETS.steady })
  assert.equal(setCpuRequest(s, 'klopa-api', 800).ok, true)
  advance(s, 60)
  const tpl = s.deployments[0].template
  assert.equal(tpl.resources.requests.cpuM, 800)
  advance(s, 60)
  // 20 rps × 25 ms over 2 Pods = 250m each → 31 % of 800m → scale-down blocked by minReplicas 2
  assert.equal(replicasAt(s), 2)
})

test('cost: node-hours accumulate per second (provisioning nodes billed)', () => {
  const s = presetAutoscaling({ profile: TRAFFIC_PRESETS.steady })
  advance(s, 3600)
  const c = clusterCost(s, 0.1)
  assert.ok(Math.abs(c.nodeHours - 2) < 0.01)
  assert.ok(Math.abs(c.eur - 0.2) < 0.001)
  assert.equal(c.eurPerHourNow, 0.2)
})

test('daily wave scales up and back down', () => {
  const s = presetAutoscaling({ profile: TRAFFIC_PRESETS.daily })
  let max = 0
  for (let i = 0; i < 1800; i++) {
    advance(s, 1)
    max = Math.max(max, replicasAt(s))
  }
  assert.ok(max >= 8, `max ${max}`)
  setTrafficProfile(s, 'web', { kind: 'steady', rps: 10 })
  advance(s, 700)
  assert.equal(replicasAt(s), 2)
})

test('KEDA: worker at 0 at night; first message wakes it 0 → 1 at the next poll; HPA does 1 → N; back to 0 after cooldown', () => {
  const s = presetAutoscaling({ keda: true, profile: TRAFFIC_PRESETS.steady })
  const w = () => s.deployments.find((d) => d.name === 'klopa-worker')!.replicas
  advance(s, 25)
  assert.equal(w(), 0)
  publishMessages(s, 1)
  advance(s, 4) // t = 29: not polled yet
  assert.equal(w(), 0)
  advance(s, 2) // poll at t = 30
  assert.equal(w(), 1)
  advance(s, 20)
  assert.equal(s.cfg.keda!.queueLength, 0, 'the woken worker drains the queue')
  setQueueArrivalRate(s, 30)
  advance(s, 60)
  const hpa = s.hpas.find((h) => h.keda)!
  assert.ok(w() > 1, 'HPA scales the worker 1 → N on queue length')
  assert.match(hpa.decisions.find((d) => d.final > d.current)!.text, /u redu \d+ poruk/)
  setQueueArrivalRate(s, 0)
  const zeroAt = (() => {
    for (let i = 0; i < 1500; i++) {
      advance(s, 1)
      if (w() === 0) return s.t
    }
    return null
  })()
  assert.ok(zeroAt !== null)
  const lastActive = s.cfg.keda!.lastActiveAt!
  assert.ok(zeroAt! - lastActive >= 300 && zeroAt! - lastActive <= 331, `cooldown ${zeroAt! - lastActive}`)
})

test('HPA scale-up rate limit: max(+100 %, +4 Pods) per 15 s and scale-down 100 % per 15 s with stabilisation configurable', () => {
  const s = presetAutoscaling({ profile: { kind: 'spike', base: 20, peak: 400, startS: 30, endS: 200 }, maxNodes: 12 })
  s.cfg.autoscaler!.maxNodes = 12
  s.hpas[0].maxReplicas = 40
  s.hpas[0].behavior.scaleDown.stabilizationWindowSeconds = 60
  advance(s, 400)
  const ups = s.hpas[0].decisions.filter((d) => d.final > d.current)
  for (const d of ups) assert.ok(d.final <= Math.max(d.current * 2, d.current + 4), `${d.current} → ${d.final}`)
  const down = s.hpas[0].decisions.find((d) => d.final < d.current)!
  assert.ok(down.t - 200 <= 60 + 15 + 15, `scale-down after a 60 s window at ${down.t}`)
})
