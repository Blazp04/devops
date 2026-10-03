/**
 * E3 – regression tests for the post-lecture review: rollout wording, client names, Iva's namespace, kubectl views
 * (ReplicaSet AGE, HPA REPLICAS and column widths), the eviction message, ControlPlaneMessage.object and small
 * additive helpers. Run: node --test src/engines/cluster/*.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ControlPlaneMessage } from './types.ts'
import {
  NODE_FAILURE_BADGE,
  REGISTRY,
  advance,
  appBehaviour,
  applyReplicaSetReplicas,
  createCluster,
  createPodObject,
  dbAuthFails,
  isHung,
  kubectlGetHpa,
  kubectlGetPods,
  kubectlGetReplicaSets,
  kubectlRun,
  nodeSpec,
  podTemplate,
  presetAutoscaling,
  presetControlPlane,
  presetPodHealth,
  presetRelease,
  presetRollout,
  presetScheduler,
  presetService,
  processTick,
  requestStats,
  resources,
  setDeploymentVersion,
  setNodeExtraMemory,
  setTrafficClient,
  setTrafficRoutes,
  setTrafficTarget,
  startRelease,
} from './index.ts'

test('release events say „Uvođenje” (rollout), not „Izdanje” (release)', () => {
  for (const strategy of ['rolling', 'canary-weights'] as const) {
    const s = presetRelease({ strategy })
    advance(s, 5)
    assert.equal(startRelease(s).ok, true)
    const again = startRelease(s)
    assert.equal(again.ok, false)
    assert.equal(again.message, 'uvođenje je već pokrenuto')
    advance(s, 400)
    const texts = s.events.map((e) => e.text)
    assert.ok(texts.some((t) => /^Uvođenje 2\.0\.0 \(.+\) je počelo$/.test(t)), `${strategy}: start`)
    assert.ok(!texts.some((t) => t.startsWith('Izdanje ')), `${strategy}: no „Izdanje”`)
  }
  const c = presetRelease({ strategy: 'canary-weights', bugRate: 0 })
  advance(c, 5)
  startRelease(c)
  advance(c, 900)
  assert.ok(c.events.some((e) => e.text === 'Uvođenje 2.0.0 promovirano na 100 %'))
})

test('presetService: the client is named by its Pod (klopa-web); the stream id stays web', () => {
  const s = presetService()
  assert.ok(s.traffic.some((t) => t.id === 'web'))
  setTrafficClient(s, 'web', { mode: 'keep-alive', connections: 1 })
  assert.match(s.events.at(-1)!.text, /^Klijent klopa-web: jedna dugotrajna veza/)
  const ip = s.pods.find((p) => p.labels.app === 'klopa-api' && p.ip)!.ip!
  setTrafficTarget(s, 'web', ip)
  assert.match(s.events.at(-1)!.text, /^Klijent klopa-web šalje ravno na IP Poda/)
  // without a client Pod the stream id is still the name
  const r = presetRollout()
  setTrafficClient(r, 'web', { mode: 'per-request' })
  assert.match(r.events.at(-1)!.text, /^Klijent web: nova veza po zahtjevu/)
})

test("presetScheduler: Iva's test Pods live in klopa-staging", () => {
  const s = presetScheduler()
  const iva = s.pods.filter((p) => p.name.startsWith('ivina-proba'))
  assert.equal(iva.length, 3)
  assert.ok(iva.every((p) => p.namespace === 'klopa-staging'))
  assert.ok(!kubectlGetPods(s, { namespace: 'klopa' }).some((l) => l.startsWith('ivina-proba')))
  assert.equal(kubectlGetPods(s, { namespace: 'klopa-staging' }).length, 4)
  // `kubectl get pods` through kubectlRun still lists every Pod (L17 splits the listing itself)
  assert.equal(kubectlRun(s, 'get pods').lines.filter((l) => l.startsWith('ivina-proba')).length, 3)
})

test('kubectl get rs: a ReplicaSet created during the sim is dated from its creation (never older than its Pods)', () => {
  const s = presetRollout({ traffic: false })
  advance(s, 100)
  assert.equal(setDeploymentVersion(s, 'klopa-api', '1.4.0').ok, true)
  advance(s, 30)
  const rows = kubectlGetReplicaSets(s).slice(1)
  assert.equal(rows.length, 2)
  const ages = rows.map((r) => r.split(/\s+/).at(-1))
  assert.ok(ages.includes('30s'), `new ReplicaSet: ${ages}`)
  assert.ok(ages.includes('62m'), `preset ReplicaSet keeps its hour: ${ages}`)
})

test('kubectl get hpa: REPLICAS = status.currentReplicas; TARGETS keeps one width so -w rows line up', () => {
  const s = presetAutoscaling({ seed: 42 })
  const first = kubectlGetHpa(s)
  assert.equal(first[1].split(/\s{2,}/)[5], '2', 'before the first sync: the Deployment replicas')
  const col = first[0].indexOf('MINPODS')
  let sawLag = false
  for (let i = 0; i < 12; i++) {
    advance(s, 15)
    const h = s.hpas[0]
    const t = kubectlGetHpa(s)
    assert.equal(t[0].indexOf('MINPODS'), col, 'header stays the same')
    assert.equal(t[1].slice(col, col + 2), String(h.minReplicas).padEnd(2), 'MINPODS starts under its header')
    const deployment = s.deployments.find((d) => d.name === h.targetDeployment)!
    assert.equal(t[1].split(/\s{2,}/)[5], String(h.status.currentReplicas > 0 ? h.status.currentReplicas : deployment.replicas))
    if (h.status.currentReplicas !== h.status.desiredReplicas) sawLag = true
  }
  assert.ok(sawLag, 'during the spike REPLICAS lags the new desired count by one sync')
})

test('Evicted message: the container clause only when usage > request; a zero request prints as 0', () => {
  const run = (req: ReturnType<typeof resources>, mem: number) => {
    const s = createCluster({ nodes: [nodeSpec('node-1', { memMi: 4096, allocatableMemMi: 2972 })], timings: { scheduleDelayS: 0, containerCreateS: 0.5, imagePullS: 0.5 } })
    createPodObject(s, podTemplate({ labels: { app: 'x' }, image: `${REGISTRY}/x:1`, resources: req, app: appBehaviour({ memMi: mem, warmS: 1 }) }), { name: 'x', namespace: 'klopa', owner: null })
    advance(s, 5)
    // memory.available 2972 − 400 (system) − usage; leave ≈ 50Mi: below the 100Mi threshold, above the kernel OOM
    setNodeExtraMemory(s, 'node-1', 2572 + 300 - mem - 50)
    advance(s, 10.1)
    const p = s.pods.find((q) => q.name === 'x')!
    assert.equal(p.reason, 'Evicted')
    return p.message
  }
  const be = run(resources(), 300)
  assert.match(be, /Container x was using 300Mi, request is 0, has larger consumption of memory\.$/)
  const within = run(resources(100, 800), 300)
  assert.ok(!within.includes('Container'), within)
  assert.match(within, /^The node was low on resource: memory\. Threshold quantity: 100Mi, available: \d+Mi\.$/)
})

test('ControlPlaneMessage.object names the Pod for create / bind / start / status messages', () => {
  const s = presetControlPlane()
  assert.equal(applyReplicaSetReplicas(s, 'klopa-api', 4).ok, true)
  const seen = new Map<string, ControlPlaneMessage>()
  for (let i = 0; i < Math.round(8 / s.cfg.timings.dt); i++) {
    processTick(s)
    for (const m of s.messages) if (!seen.has(m.id)) seen.set(m.id, m)
  }
  const msgs = [...seen.values()]
  const created = msgs.find((m) => m.step === 3)!
  assert.ok(created.object && s.pods.some((p) => p.name === created.object))
  for (const step of [4, 5, 6]) {
    const m = msgs.filter((x) => x.step === step)
    assert.ok(m.length > 0 && m.every((x) => x.object === created.object || s.pods.some((p) => p.name === x.object)), `step ${step}`)
  }
  assert.equal(msgs.find((m) => m.step === 1)!.object, undefined, 'kubectl → API carries no Pod')
})

test('small additive helpers: setTrafficRoutes, isHung, dbAuthFails, node-failure badge', () => {
  const s = presetRollout()
  assert.equal(setTrafficRoutes(s, 'nope', []), false)
  assert.equal(setTrafficRoutes(s, 'web', []), true)
  advance(s, 5)
  assert.ok(requestStats(s, 5, 'web').errors.http404 > 0)
  const routes = [{ serviceName: 'klopa-api', weight: 1 }]
  setTrafficRoutes(s, 'web', routes)
  routes[0].weight = 0
  assert.equal(s.traffic[0].routes![0].weight, 1, 'routes are copied')
  setTrafficRoutes(s, 'web', null)
  assert.equal(s.traffic[0].routes, null)
  const p = s.pods.find((x) => x.processUp)!
  assert.equal(isHung(s, p), false)
  assert.equal(dbAuthFails(s, p), false)
  assert.match(NODE_FAILURE_BADGE, /stvarno: ≈ 50 s \+ 5 min \+ do 6 min/)
})

test('presetPodHealth({ app }) overrides the behaviour on every Pod; without it nothing changes', () => {
  const plain = presetPodHealth()
  const db = presetPodHealth({ app: { dependsOnDb: true } })
  assert.ok(db.pods.length === 3 && db.pods.every((p) => p.spec.app.dependsOnDb === true))
  assert.deepEqual(
    plain.pods.map((p) => p.spec.app),
    presetPodHealth({}).pods.map((p) => p.spec.app),
  )
  assert.equal(JSON.stringify({ ...db.pods[0].spec.app, dependsOnDb: plain.pods[0].spec.app.dependsOnDb }), JSON.stringify(plain.pods[0].spec.app))
})
