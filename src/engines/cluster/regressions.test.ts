/**
 * E3 Klaster – regression tests for the review findings (state initialisation, KEDA, fluid ρ, API outage, DNS,
 * drain, HPA, cgroup OOM, input guards, animation, L11 causality, L14/L17/L18/L19/L20 controls, windows, replay,
 * plurals, kit adapters). Run: node --test src/engines/cluster/*.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ClusterState, ControlPlaneMessage, IntOrPercent, Pod } from './types.ts'
import {
  API_REFUSED,
  ETCD_TIMEOUT,
  QUEUE_DAY,
  TRAFFIC_PRESETS,
  WRONG_TAG_IMAGE,
  activeMessages,
  advance,
  applyBarePod,
  applyPostgresDeployment,
  applyReplicaSetReplicas,
  applySecret,
  cfsLatencyMs,
  cordonNode,
  createCluster,
  createTimeline,
  act,
  deletePod,
  desiredState as D,
  dnsCandidates,
  drainNode,
  fillNodes,
  fluidStats,
  getProxyEndpoints,
  hitShares,
  inFlightAt,
  kedaQueueMetric,
  klopaApiTemplate,
  kubectlGetPods,
  kubectlRun,
  markWindow,
  messageChain,
  messageProgress,
  nodeFrameStatus,
  nodeView,
  patchDeploymentTemplate,
  placePod,
  podLeadTime,
  podOrders,
  podShapeView,
  podStatus,
  podView,
  powerOffNode,
  presetAutoscaling,
  presetControlPlane,
  presetPodHealth,
  presetRelease,
  presetRollout,
  presetScheduler,
  presetService,
  presetStorage,
  probe,
  processTick,
  publishMessages,
  qosClass,
  redMetrics,
  releaseStats,
  removeCpuRequest,
  renderTime,
  requestProgress,
  resetTrafficTotals,
  resizePod,
  resolveDns,
  resources,
  rewindTo,
  rolloutRestart,
  runUntil,
  scaleDeployment,
  scaleStatefulSet,
  seek,
  sendRequest,
  seriesFor,
  serviceStats,
  setComponent,
  setCpuRequest,
  setDatabase,
  setDatabaseBacking,
  setDatabasePassword,
  setDeploymentStrategy,
  setDeploymentVersion,
  setHpa,
  setKubelet,
  setNodeExtraMemory,
  setOutOfService,
  setPodLabel,
  setPodResources,
  setPodUsage,
  setQueueArrivalRate,
  setQueueProfile,
  setReplicaSetImage,
  setServiceSelectorByName,
  setServiceSessionAffinity,
  setTrafficClient,
  setTrafficProfile,
  setTrafficTarget,
  setVersionRoles,
  startRelease,
  stepCluster,
  stepTimeline,
  streamRate,
  syncHpa,
  timelineIsLive,
  timelineMarks,
  timelineTime,
  trafficTotals,
  validateStrategy,
  versionToneFor,
  windowStats,
  killContainer,
  hangProcess,
} from './index.ts'

function apiPods(s: ClusterState): Pod[] {
  return s.pods.filter((p) => p.labels.app === 'klopa-api')
}

function pod(s: ClusterState, name: string): Pod {
  const p = s.pods.find((x) => x.name === name)
  assert.ok(p, `pod ${name}`)
  return p
}

function snapshot(s: ClusterState): string {
  return JSON.stringify({ t: s.t, pods: s.pods, rs: s.replicaSets, d: s.deployments, ev: s.events, kev: s.kubeEvents, traffic: s.traffic, slices: s.slices })
}

// ---------------------------------------------------------------- state initialisation (blocker)

test('createCluster initialises every state and config field (no undefined → no NaN ids, no throwing actions)', () => {
  const s = createCluster()
  for (const k of ['eventSeq', 'secrets', 'serviceStats', 'windows', 'writeVisibleAt'] as const) assert.notEqual(s[k], undefined, k)
  assert.deepEqual({ ...s.db, columns: [] }, { up: true, downUntil: null, columns: [], forcedDown: false, backing: null, password: null })
  assert.ok(s.series.p95Ms && s.series.byDeployment)
  assert.deepEqual(s.cfg.versionRoles, {})
  assert.equal(s.cfg.seriesFocus, null)
  assert.equal(s.cfg.seriesLengthS, 600)
  assert.equal(createCluster({ seriesLengthS: Number.NaN }).cfg.seriesLengthS, 600)
  // event ids are unique and never NaN
  const r = presetRollout()
  setDeploymentVersion(r, 'klopa-api', '1.4.0')
  advance(r, 40)
  const ids = r.events.map((e) => e.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.every((id) => /^ev\d+$/.test(id)))
})

test('resetTrafficTotals works and serviceStats is ticked: L12 readiness on /ready-db empties the Service', () => {
  const s = presetPodHealth({ behaviour: 'dependsOnDb', warm: true, probes: { liveness: probe('/healthz'), readiness: probe('/ready-db') } })
  advance(s, 5)
  assert.deepEqual(serviceStats(s, 'klopa-api'), { readyNow: 3, minReady: 3, zeroReadySeconds: 0, since: 0 })
  setDatabase(s, false, 60)
  advance(s, 90)
  const st = serviceStats(s, 'klopa-api')!
  assert.equal(st.minReady, 0)
  assert.ok(st.zeroReadySeconds > 30 && st.zeroReadySeconds < 45, `0 endpoints for ${st.zeroReadySeconds} s`)
  assert.doesNotThrow(() => resetTrafficTotals(s))
  assert.equal(trafficTotals(s).total, 0)
  assert.equal(serviceStats(s, 'klopa-api')!.zeroReadySeconds, 0)
  assert.equal(serviceStats(s, 'nema'), null)
})

test('env from a Secret: missing → CreateContainerConfigError; created → Running; rotated → stale env until the Pod restarts (L24)', () => {
  const s = presetRollout()
  const env = { DB_PASSWORD: { secretRef: 'klopa-secrets', key: 'DB_PASSWORD' } }
  applyBarePod(s, 'brzi-test', klopaApiTemplate('1.3.2', { labels: { app: 'brzi-test' }, env }))
  assert.doesNotThrow(() => advance(s, 5))
  assert.equal(podStatus(pod(s, 'brzi-test')), 'CreateContainerConfigError')
  assert.equal(pod(s, 'brzi-test').container.message, 'secret "klopa-secrets" not found')
  assert.equal(applySecret(s, 'klopa-secrets', { DB_PASSWORD: 'stara' }).message, 'secret/klopa-secrets created')
  advance(s, 15)
  assert.equal(podStatus(pod(s, 'brzi-test')), 'Running')
  assert.equal(pod(s, 'brzi-test').envResolved.DB_PASSWORD, 'stara')
  // the Deployment reads the password from the Secret; the database accepts it
  setDatabasePassword(s, 'stara')
  const d = s.deployments[0]
  assert.equal(patchDeploymentTemplate(s, 'klopa-api', { env, app: { ...d.template.app, dependsOnDb: true } }).ok, true)
  advance(s, 40)
  const w = markWindow(s, 'prije rotacije')
  advance(s, 10)
  assert.equal(windowStats(s, w)!.totals.failed, 0)
  // rotation: Secret and database change, running containers keep the old env value
  assert.equal(applySecret(s, 'klopa-secrets', { DB_PASSWORD: 'nova' }).message, 'secret/klopa-secrets configured')
  assert.equal(applySecret(s, 'klopa-secrets', { DB_PASSWORD: 'nova' }).message, 'secret/klopa-secrets unchanged')
  setDatabasePassword(s, 'nova')
  const w2 = markWindow(s, 'nakon rotacije')
  advance(s, 10)
  assert.ok(windowStats(s, w2)!.totals.http500 > 100, 'password authentication failed')
  assert.ok(apiPods(s).some((p) => p.logs.some((l) => /password authentication failed/.test(l.line))))
  rolloutRestart(s, 'klopa-api')
  advance(s, 60)
  const w3 = markWindow(s, 'nakon restarta')
  advance(s, 10)
  assert.equal(windowStats(s, w3)!.totals.failed, 0, 'rollout restart re-reads the Secret')
})

test('per-Deployment series, seriesFocus and the configurable series length', () => {
  const s = presetAutoscaling()
  assert.equal(s.series.replicas.max, 1500, 'the whole validated spike story 0–720 s fits')
  assert.equal(s.series.p95Ms.max, 1500)
  advance(s, 100)
  assert.equal(seriesFor(s, 'klopa-api')!.replicas.values.length, s.series.replicas.values.length)
  assert.equal(seriesFor(s, 'nema'), null)
  assert.ok(s.series.p95Ms.values.some((v) => v > 1000), 'saturation shows up in the p95 series')
  const r = presetStorage({ part: 'volumes', postgresDeployment: 'no-volume' })
  r.cfg.seriesFocus = 'postgres'
  advance(r, 30)
  assert.equal(r.series.replicas.last(), 3, 'only the focused Deployment is counted')
  assert.equal(seriesFor(r, 'db-pvc')!.replicas.last(), 1)
})

// ---------------------------------------------------------------- KEDA

test('KEDA counts unacknowledged messages: a worker that keeps up with steady traffic is never scaled to 0', () => {
  for (const rate of [0.5, 1, 5]) {
    const s = presetAutoscaling({ keda: true, queueRate: rate, profile: TRAFFIC_PRESETS.steady })
    const w = () => s.deployments.find((d) => d.name === 'klopa-worker')!.replicas
    for (let i = 0; i < 900; i++) {
      advance(s, 1)
      if (s.t > 40) assert.ok(w() >= 1, `rate ${rate}: scaled to 0 under load at t=${s.t}`)
    }
    assert.ok(kedaQueueMetric(s.cfg.keda!) > 0, 'something is always being processed')
    assert.ok(s.cfg.keda!.queueLength < 60, `rate ${rate}: no runaway backlog (${s.cfg.keda!.queueLength})`)
  }
})

test('KEDA queue profile: no messages at night → worker 0, the first morning message wakes it; redelivery when workers vanish', () => {
  const s = presetAutoscaling({ keda: true, profile: TRAFFIC_PRESETS.steady, queueProfile: QUEUE_DAY })
  const w = () => s.deployments.find((d) => d.name === 'klopa-worker')!.replicas
  advance(s, 290)
  assert.equal(w(), 0, 'night: nothing to do')
  const woke = runUntil(s, () => w() >= 1, 60)
  assert.ok(woke !== null && woke >= 300 && woke <= 331, `woken at ${woke}`)
  advance(s, 400)
  assert.ok(w() >= 1, 'busy all day')
  advance(s, 600)
  assert.equal(w(), 0, 'night again after the cooldown')
  assert.equal(setQueueProfile(s, null), true)
  // redelivery: messages held by workers return to the queue when the workers go away
  const r = presetAutoscaling({ keda: true, queueRate: 5, profile: TRAFFIC_PRESETS.steady })
  advance(r, 125) // between two KEDA polls (every 30 s), so the operator does not re-activate it at once
  const k = r.cfg.keda!
  const before = k.queueLength + k.unacked
  assert.ok(k.unacked > 0)
  scaleDeployment(r, 'klopa-worker', 0)
  advance(r, 0.2)
  assert.equal(k.unacked, 0)
  assert.ok(k.queueLength >= before, 'unacked messages are redelivered')
})

test('KEDA and strategy inputs: NaN, ±Infinity, negatives and malformed percents are rejected without corrupting state', () => {
  const s = presetAutoscaling({ keda: true })
  assert.equal(publishMessages(s, Number.NaN), false)
  assert.equal(publishMessages(s, Number.POSITIVE_INFINITY), false)
  assert.equal(publishMessages(s, -5), false)
  assert.equal(setQueueArrivalRate(s, Number.NaN), false)
  assert.equal(setQueueArrivalRate(s, -1), false)
  advance(s, 40)
  assert.ok(Number.isFinite(s.cfg.keda!.queueLength) && Number.isFinite(s.cfg.keda!.totals.published))
  assert.equal(publishMessages(s, 3), true)
  for (const bad of ['abc%', 'NaN%', '2.5%', '-5%'] as IntOrPercent[]) assert.notEqual(validateStrategy(bad, '25%'), null, String(bad))
  assert.notEqual(validateStrategy(1.5, 0), null)
  assert.notEqual(validateStrategy(Number.NaN, 0), null)
  assert.equal(validateStrategy('25%', '0%'), null)
  const r = presetRollout()
  assert.equal(setDeploymentStrategy(r, 'klopa-api', { maxSurge: 'NaN%' as IntOrPercent }).ok, false)
  assert.equal(r.deployments[0].strategy.maxSurge, '25%')
  // replicas: kubectl/API validation, and a cap against stray huge values
  assert.equal(scaleDeployment(r, 'klopa-api', 1e9).ok, false)
  assert.equal(applyReplicaSetReplicas(presetControlPlane(), 'klopa-api', -1).ok, false)
  assert.equal(scaleStatefulSet(presetStorage({ part: 'statefulset' }), 'db', Number.NaN).ok, false)
  const d = D.createDesiredState()
  assert.deepEqual(D.setDesired(d, 'nope', 3), { ok: false, reason: 'nepoznata aplikacija' })
  assert.equal('nope' in d.desired, false)
  assert.equal(D.setDesired(d, 'api', Number.NaN).ok, false)
  assert.equal(D.placeInstance(d, 'nope', 'server-1').ok, false)
  assert.equal(D.newVersion(d, 'nope'), false)
})

// ---------------------------------------------------------------- fluid ρ (L18)

test('fluid model: whenever requests are dropped, ρ ≥ 1 (node CPU contention included); validated SIM 4 saturation unchanged', () => {
  const scenarios: [string, () => ClusterState][] = [
    ['flash', () => presetAutoscaling({ profile: TRAFFIC_PRESETS.flash })],
    [
      'flash without CPU requests',
      () => {
        const s = presetAutoscaling({ profile: TRAFFIC_PRESETS.flash })
        advance(s, 70)
        removeCpuRequest(s, 'klopa-api')
        return s
      },
    ],
    ['6 limitless Pods, 180 rps', () => presetAutoscaling({ profile: { kind: 'steady', rps: 180 }, cpuRequestM: null, minReplicas: 6, clusterAutoscaler: false })],
  ]
  for (const [name, mk] of scenarios) {
    const s = mk()
    const st = s.traffic[0]
    let prev = st.dropped
    let drops = 0
    for (let i = 0; i < 200; i++) {
      advance(s, 1)
      const d = st.dropped - prev
      prev = st.dropped
      if (d > 1e-6) {
        drops += 1
        assert.ok(st.rho >= 1, `${name} t=${s.t}: dropped ${d.toFixed(1)}/s but ρ ${st.rho.toFixed(2)}`)
        assert.ok(st.p95Ms >= 1000, `${name}: p95 ${st.p95Ms} while dropping`)
      }
    }
    assert.ok(drops > 0, `${name} drops something`)
  }
  const v = presetAutoscaling()
  advance(v, 62)
  assert.ok(v.traffic[0].rho >= 0.99)
  assert.equal(Math.round(v.traffic[0].latencyMs), 5000)
  const f = fluidStats(v, 'web')!
  assert.ok(f.worstP95Ms >= f.p95NowMs && f.dropped > 0)
  // a quiet Pod with free node CPU is far from saturation
  const q = presetAutoscaling({ profile: TRAFFIC_PRESETS.steady })
  advance(q, 30)
  assert.ok(q.traffic[0].rho > 0.2 && q.traffic[0].rho < 0.3, `ρ ${q.traffic[0].rho}`)
})

// ---------------------------------------------------------------- API server / etcd off (L11)

test('API server off: kubectl shows the frozen status (or refuses), every write is refused and nothing changes later', () => {
  const s = presetControlPlane()
  advance(s, 2)
  const name = apiPods(s)[0].name
  const node = pod(s, name).nodeName!
  const before = kubectlGetPods(s).find((l) => l.startsWith(name))!
  setComponent(s, 'apiServer', false)
  assert.equal(killContainer(s, name), true, 'physical events still happen')
  advance(s, 5)
  assert.equal(pod(s, name).container.restartCount, 1, 'the kubelet restarted it locally')
  assert.equal(kubectlGetPods(s).find((l) => l.startsWith(name))!.split(/\s+/)[3], before.split(/\s+/)[3], 'kubectl still shows the last reported restarts')
  const v = podView(s, pod(s, name))
  assert.equal(v.stale, true)
  assert.equal(v.restarts, 0)
  assert.equal(v.live.status, 'Running')
  assert.deepEqual(kubectlRun(s, 'get pods'), { ok: false, lines: [API_REFUSED] })
  const writes = [
    setPodLabel(s, name, 'app', 'x'),
    setServiceSelectorByName(s, 'klopa-api', { app: 'typo' }),
    cordonNode(s, node),
    drainNode(s, node, { force: true }),
    setOutOfService(s, node, true),
    fillNodes(s),
    setServiceSessionAffinity(s, 'klopa-api', 'ClientIP'),
    applySecret(s, 'x', { a: 'b' }),
    deletePod(s, name),
  ]
  for (const r of writes) assert.deepEqual(r, { ok: false, message: API_REFUSED })
  assert.deepEqual(placePod(s, name, 'node-1'), { ok: false, reasons: [API_REFUSED] })
  setComponent(s, 'apiServer', true)
  advance(s, 3)
  assert.deepEqual(s.services[0].selector, { app: 'klopa-api' })
  assert.equal(s.nodes.some((n) => n.unschedulable || n.taints.length), false)
  assert.equal(pod(s, name).labels.app, 'klopa-api')
  assert.equal(pod(s, name).owner?.kind, 'ReplicaSet')
  assert.equal(Object.keys(s.secrets).length, 0)
  assert.equal(s.pods.filter((p) => p.labels.app === 'ivina-proba').length, 0)
  assert.equal(podView(s, pod(s, name)).stale, false)
  assert.match(kubectlGetPods(s).find((l) => l.startsWith(name))!, /Running\s+1 \(\d+s ago\)/, 'the kubelet reports again')
  // etcd off: reads time out, writes time out, a manual Binding times out
  setComponent(s, 'etcd', false)
  assert.deepEqual(kubectlRun(s, 'get nodes'), { ok: false, lines: [ETCD_TIMEOUT] })
  assert.deepEqual(cordonNode(s, node), { ok: false, message: ETCD_TIMEOUT })
  assert.deepEqual(placePod(s, name, 'node-1').reasons, [ETCD_TIMEOUT])
  assert.equal(setHpa(presetAutoscaling(), 'klopa-api', { maxReplicas: 4 }), true)
  const a = presetAutoscaling()
  setComponent(a, 'apiServer', false)
  assert.equal(setHpa(a, 'klopa-api', { maxReplicas: 4 }), false)
})

test('kubectl console: get / describe / logs (incl. --previous) and errors; L11 "Krivi tag slike" with recreateOne', () => {
  const s = presetControlPlane()
  advance(s, 3)
  assert.match(kubectlRun(s, 'kubectl get pods -o wide').lines[0], /^NAME\s+READY\s+STATUS\s+RESTARTS\s+AGE\s+IP\s+NODE$/)
  assert.match(kubectlRun(s, 'get no').lines[0], /^NAME\s+STATUS/)
  assert.ok(kubectlRun(s, 'describe pod klopa-worker').lines.some((l) => l.startsWith('Name:') && l.includes('klopa-worker')))
  assert.match(kubectlRun(s, 'logs klopa-worker').lines[0], /starting klopa-worker/)
  assert.match(kubectlRun(s, 'logs klopa-worker --previous').lines[0], /previous terminated container "klopa-worker" in pod "klopa-worker" not found/)
  killContainer(s, 'klopa-worker')
  advance(s, 3)
  assert.match(kubectlRun(s, 'logs klopa-worker -p').lines[0], /starting klopa-worker/)
  assert.match(kubectlRun(s, 'logs klopa-worker --timestamps').lines[0], /^2026-10-01T12:\d\d:\d\d\.\d{3}Z /)
  assert.deepEqual(kubectlRun(s, 'get frobs'), { ok: true, lines: ['error: the server doesn\'t have a resource type "frobs"'] })
  assert.equal(kubectlRun(s, 'frobnicate').ok, false)
  assert.ok(s.kubectlLog.length > 0)
  // a ReplicaSet never updates existing Pods: recreateOne deletes one so the wrong tag shows up
  const r = setReplicaSetImage(s, 'klopa-api', WRONG_TAG_IMAGE, { recreateOne: true })
  assert.match(r.message, /^replicaset\.apps\/klopa-api configured\npod "klopa-api-\w+" deleted$/)
  advance(s, 15)
  assert.equal(apiPods(s).filter((p) => /ImagePullBackOff|ErrImagePull/.test(podStatus(p))).length, 1)
})

// ---------------------------------------------------------------- L11 causality

function collect(s: ClusterState, seconds: number): ControlPlaneMessage[] {
  const seen = new Map<string, ControlPlaneMessage>()
  for (let i = 0; i < Math.round(seconds / s.cfg.timings.dt); i++) {
    for (const m of s.messages) seen.set(m.id, m)
    processTick(s)
  }
  for (const m of s.messages) seen.set(m.id, m)
  return [...seen.values()]
}

test('L11 "Put jedne izjave" is causal: 2 starts when 1 lands, watchers react only after the etcd ack, each step after the previous one landed', () => {
  const s = presetControlPlane()
  assert.equal(applyReplicaSetReplicas(s, 'klopa-api', 4).ok, true)
  const msgs = collect(s, 8)
  const first = (pred: (m: ControlPlaneMessage) => boolean) => msgs.filter(pred).sort((a, b) => a.t0 - b.t0)[0]
  const end = (m: ControlPlaneMessage) => m.t0 + m.duration
  const m1 = first((m) => m.step === 1)
  const m2 = first((m) => m.step === 2)
  const ack = first((m) => m.from === 'etcd' && m.to === 'apiserver')
  const reply = first((m) => m.from === 'apiserver' && m.to === 'kubectl')
  const m3 = first((m) => m.step === 3)
  const m4 = first((m) => m.step === 4)
  const m5 = first((m) => m.step === 5)
  const m6 = first((m) => m.step === 6)
  assert.ok(Math.abs(m2.t0 - end(m1)) < 1e-9 && m2.parentId === m1.id)
  assert.ok(Math.abs(ack.t0 - end(m2)) < 1e-9 && ack.parentId === m2.id)
  assert.ok(Math.abs(reply.t0 - end(ack)) < 1e-9)
  assert.equal(reply.label, 'replicaset.apps/klopa-api configured')
  const notify = first((m) => m.from === 'apiserver' && m.to === 'controller-manager')
  assert.ok(notify.t0 >= end(ack) - 1e-9, 'the watch event leaves only after the ack')
  assert.ok(m3.t0 >= end(notify) - 1e-9 && m3.t0 - end(ack) >= 0.1 - 1e-9)
  assert.ok(m4.t0 >= end(m3) + 0.1 - 1e-9, 'the scheduler sees the Pod only after it was created')
  assert.ok(m5.t0 >= end(m4) - 1e-9, 'the kubelet sees the binding only after it was written')
  assert.ok(m6.t0 > m5.t0)
  // nothing in flight before its parent landed; draw only the active ones
  const t = presetControlPlane()
  applyReplicaSetReplicas(t, 'klopa-api', 5)
  advance(t, 0.4)
  const at = renderTime(t)
  const active = activeMessages(t, at)
  assert.ok(active.every((m) => m.t0 <= at && at <= m.t0 + m.duration))
  assert.ok(!active.some((m) => m.step === 3), 'step 3 cannot be in flight at 0,4 s')
  const chain = messageChain(t, t.messages.find((m) => m.step === 1)!.id)
  assert.equal(chain[0].step, 1)
  assert.ok(chain.every((m, i) => i === 0 || m.t0 >= chain[i - 1].t0))
  assert.deepEqual(messageChain(t, 'nema'), [])
  // a failed write never reaches etcd
  const u = presetControlPlane()
  applyReplicaSetReplicas(u, 'nema', 3)
  assert.deepEqual(u.messages.map((m) => `${m.from}->${m.to}`), ['kubectl->apiserver', 'apiserver->kubectl'])
})

test('animation: request dots and messages move smoothly at 60 fps (renderTime), reach progress 1, and only sent dots are drawn', () => {
  const s = presetRollout()
  advance(s, 2)
  let id = ''
  const seen: number[] = []
  for (let i = 0; i < 60; i++) {
    stepCluster(s, 1 / 60)
    if (!id) id = s.inFlight.find((r) => r.t0 <= renderTime(s) && requestProgress(s, r) < 0.1)?.id ?? ''
    const r = s.inFlight.find((x) => x.id === id)
    if (id && r) seen.push(requestProgress(s, r))
  }
  const distinct = new Set(seen.map((v) => v.toFixed(3)))
  assert.ok(distinct.size >= 20, `${distinct.size} distinct positions over one 0,4 s trip`)
  assert.ok(seen.every((v, i) => i === 0 || v >= seen[i - 1] - 1e-12), 'monotonic')
  assert.equal(seen.at(-1), 1, 'the dot reaches the Pod')
  for (const d of inFlightAt(s)) assert.ok(d.progress >= 0 && d.progress <= 1 && d.r.t0 <= renderTime(s) + 1e-9)
  const c = presetControlPlane()
  applyReplicaSetReplicas(c, 'klopa-api', 4)
  stepCluster(c, 0.15)
  const m1 = c.messages.find((m) => m.step === 1)!
  assert.ok(Math.abs(messageProgress(c, m1) - 0.5) < 0.01, `halfway at 0,15 s: ${messageProgress(c, m1)}`)
})

// ---------------------------------------------------------------- DNS (L14, L19)

test('DNS search path (ndots:5): db-1.db, db-1.db.klopa and db-1.db.klopa.svc resolve inside the Namespace', () => {
  const s = presetStorage({ part: 'statefulset' })
  const ip = pod(s, 'db-1').ip!
  for (const q of ['db-1.db', 'db-1.db.klopa', 'db-1.db.klopa.svc', 'db-1.db.klopa.svc.cluster.local', 'db-1.db.klopa.svc.cluster.local.']) {
    assert.deepEqual(resolveDns(s, q), { name: 'db-1.db.klopa.svc.cluster.local', kind: 'pod', ips: [ip] }, q)
  }
  assert.equal(resolveDns(s, 'db-1.db', 'drugi').kind, 'NXDOMAIN', 'another Namespace searches drugi.svc.cluster.local')
  assert.equal(resolveDns(s, 'db-1.db.klopa', 'drugi').kind, 'pod')
  assert.equal(resolveDns(s, 'db', 'drugi').kind, 'NXDOMAIN')
  assert.deepEqual(dnsCandidates('db-1.db', 'klopa'), ['db-1.db.klopa.svc.cluster.local', 'db-1.db.svc.cluster.local', 'db-1.db.cluster.local', 'db-1.db'])
  assert.deepEqual(dnsCandidates('a.b.c.d.e.f', 'klopa')[0], 'a.b.c.d.e.f', '≥ 5 dots: absolute first')
  assert.deepEqual(dnsCandidates('x.', 'klopa'), ['x'])
  assert.deepEqual(dnsCandidates('', 'klopa'), [])
  // a dead db-1 is NXDOMAIN through every spelling
  powerOffNode(s, pod(s, 'db-1').nodeName!)
  advance(s, 15)
  assert.equal(resolveDns(s, 'db-1.db').kind, 'NXDOMAIN')
})

// ---------------------------------------------------------------- drain (L11, L19)

test('kubectl drain refuses bare Pods and emptyDir Pods (cordon only) unless --force / --delete-emptydir-data', () => {
  const s = presetPodHealth({ warm: true })
  const node = s.pods[0].nodeName!
  const r = drainNode(s, node)
  assert.equal(r.ok, false)
  assert.match(r.message, /^node\/node-\d cordoned\nerror: unable to drain node "node-\d" due to error: cannot delete Pods declare no controller \(use --force to override\): klopa\/klopa-api-\d, continuing command\.\.\./)
  assert.equal(s.nodes.find((n) => n.name === node)!.unschedulable, true, 'the node is cordoned anyway')
  assert.equal(s.pods.filter((p) => p.deletion).length, 0, 'no bare Pod is deleted')
  const f = drainNode(s, node, { force: true })
  assert.equal(f.ok, true)
  assert.match(f.message, /Warning: deleting Pods that declare no controller: klopa\/klopa-api-\d/)
  assert.match(f.message, /node\/node-\d drained$/)
  const v = presetStorage({ part: 'volumes' })
  const emptyNode = v.pods.find((p) => p.labels.app === 'db-emptydir')!.nodeName!
  const e = drainNode(v, emptyNode)
  assert.equal(e.ok, false)
  assert.match(e.message, /cannot delete Pods with local storage \(use --delete-emptydir-data to override\): klopa\/db-emptydir-/)
  assert.equal(drainNode(v, emptyNode, { deleteEmptyDirData: true }).ok, true)
  assert.equal(drainNode(v, 'nema').ok, false)
})

// ---------------------------------------------------------------- HPA missing metrics at ratio 1

test('HPA: Pods without a metric are left out at exactly 100 % of target (upstream), fallback below, 0 % above', () => {
  const run = (cpuM: number) => {
    const s = presetAutoscaling({ minReplicas: 4, profile: TRAFFIC_PRESETS.steady, clusterAutoscaler: false })
    advance(s, 400)
    const h = s.hpas[0]
    assert.equal(setHpa(s, 'klopa-api', { minReplicas: 1 }), true)
    const pods = apiPods(s).filter((p) => !p.deletion)
    assert.equal(pods.length, 4)
    s.podMetrics = {}
    for (const p of pods.slice(0, 3)) s.podMetrics[p.id] = { cpuM, at: s.t - 30 }
    syncHpa(s, h)
    return h.decisions.at(-1)!
  }
  const at = run(250) // 50 % of a 50 % target
  assert.equal(at.ratio, 1)
  assert.equal(at.raw, 4, at.text)
  assert.equal(at.final, 4)
  assert.match(at.text, /1 Pod bez metrike \(ne broji se\)/)
  assert.match(run(100).text, /bez metrike kao 100 %/)
  assert.match(run(400).text, /bez metrike kao 0 %/)
})

// ---------------------------------------------------------------- memory limit without a kubelet

test('the memory limit is a kernel (cgroup) limit: OOMKilled even with the kubelet stopped; the kubelet restarts it later', () => {
  const s = presetScheduler({ manual: false, testPods: false, cards: ['leaky'] })
  advance(s, 10)
  const p = pod(s, 'leaky')
  setPodUsage(s, 'leaky', { memGrowthMiPerS: 50 })
  setKubelet(s, p.nodeName!, false)
  advance(s, 15) // NotReady after 10 s (sim); the 20 s toleration has not run out yet
  assert.equal(p.processUp, false)
  assert.ok(p.usage.memMi <= 261, `memory ${p.usage.memMi} never far past the 256Mi limit`)
  assert.equal(p.container.lastTermination?.reason, 'OOMKilled')
  assert.equal(p.container.lastTermination?.exitCode, 137)
  const restarts = p.container.restartCount
  setKubelet(s, p.nodeName!, true)
  advance(s, 2)
  assert.equal(p.container.restartCount, restarts + 1, 'the returning kubelet restarts the container')
  // node-pressure kills are narrated as such, not as „prekoračen limit”
  const k = presetScheduler({ manual: false, testPods: false, cards: ['api-guaranteed', 'web'] })
  advance(k, 10)
  setNodeExtraMemory(k, pod(k, 'web').nodeName!, 20000)
  advance(k, 1)
  const oom = k.events.filter((e) => e.kind === 'oom')
  assert.ok(oom.length > 0 && oom.every((e) => /čvoru je ponestalo memorije/.test(e.text) && !/prekoračen limit/.test(e.text)), oom.map((e) => e.text).join(' | '))
})

// ---------------------------------------------------------------- L14 controls

test('L14 preset: client Pod 10.244.1.7, ClusterIP 10.96.12.7, version label; sendRequest has a packet path', () => {
  const s = presetService()
  const client = pod(s, 'klopa-web')
  assert.equal(client.ip, '10.244.1.7')
  assert.equal(s.services[0].clusterIP, '10.96.12.7')
  assert.ok(apiPods(s).every((p) => p.labels.version === '1.3.2'))
  assert.deepEqual(s.deployments[0].selector, { app: 'klopa-api' })
  const r = sendRequest(s, 'web')!
  assert.ok(r.request.podId)
  assert.ok(r.hops && r.hops.length === 4)
  assert.equal(r.hops![0].src, '10.244.1.7')
  assert.equal(r.hops![1].dst, '10.96.12.7:80')
  assert.match(r.hops![2].dst, /^10\.244\.\d+\.\d+:8000$/)
  assert.equal(sendRequest(s, 'nema'), null)
  // the version label follows a rollout; the selector does not need to change
  setDeploymentVersion(s, 'klopa-api', '1.4.0')
  advance(s, 60)
  assert.ok(apiPods(s).every((p) => p.labels.version === '1.4.0'))
  // dragging a version label off a Pod keeps it in the Service (selector app only)
  const p = apiPods(s)[0]
  assert.equal(setPodLabel(s, p.name, 'version', null).ok, true)
  advance(s, 2)
  assert.ok(getProxyEndpoints(s, 'klopa-api').some((e) => e.podId === p.id))
})

test('L14 client modes and sessionAffinity actions: keep-alive with a max age reaches all 4 Pods; ClientIP pins the client Pod', () => {
  const s = presetService({ seed: 3 })
  assert.equal(setTrafficClient(s, 'web', { mode: 'keep-alive', connections: 1 }), true)
  advance(s, 30)
  assert.equal(hitShares(s, 20, 'web').length, 1, 'one long-lived connection → one Pod')
  setTrafficClient(s, 'web', { mode: 'keep-alive', connections: 4, maxAgeS: 2 })
  advance(s, 30)
  assert.equal(hitShares(s, 25, 'web').length, 4, 'reconnecting connections reach every Pod')
  assert.equal(setTrafficClient(s, 'nema', { mode: 'per-request' }), false)
  setTrafficClient(s, 'web', { mode: 'per-request' })
  assert.equal(setServiceSessionAffinity(s, 'klopa-api', 'ClientIP').message, 'service/klopa-api patched')
  advance(s, 30)
  assert.equal(hitShares(s, 20, 'web').length, 1, 'one source IP (the client Pod) → one Pod')
  assert.equal(setServiceSessionAffinity(s, 'klopa-api', 'None').ok, true)
  assert.deepEqual(s.proxy[s.services[0].id].affinity, {}, 'the affinity table is cleared')
  advance(s, 30)
  assert.equal(hitShares(s, 20, 'web').length, 4)
  assert.equal(setServiceSessionAffinity(s, 'nema', 'ClientIP').ok, false)
  // „Upiši IP pa uvedi novu verziju”
  const ip = apiPods(s)[0].ip!
  assert.equal(setTrafficTarget(s, 'web', ip), true)
  setDeploymentVersion(s, 'klopa-api', '1.4.1', { preStopSleepS: 5 })
  const w = markWindow(s, 'IP')
  advance(s, 60)
  assert.ok(windowStats(s, w)!.totals.refused > 100, 'the hard-coded address is gone after the rollout')
  setTrafficTarget(s, 'web', null)
  const w2 = markWindow(s, 'ime')
  advance(s, 10)
  assert.equal(windowStats(s, w2)!.totals.failed, 0)
  assert.ok(redMetrics(s, 'klopa-api', 10).rps > 15)
})

// ---------------------------------------------------------------- goal windows and per-rollout counters

test('per-rollout request counters: healthy rollout 0 failures; L14 enabling preStop is itself a rollout with failures; the next one has none', () => {
  const s = presetRollout()
  setDeploymentVersion(s, 'klopa-api', '1.4.0')
  advance(s, 60)
  const r = s.deployments[0].rollout!
  assert.ok(r.requests.ok > 400)
  assert.equal(r.requests.failed, 0, 'L13 „bez ijednog neuspjelog zahtjeva”')
  const c = presetService({ version: '1.4.0' })
  patchDeploymentTemplate(c, 'klopa-api', { preStopSleepS: 5 })
  advance(c, 60)
  const first = c.deployments[0].rollout!.requests
  assert.ok(first.failed > 0 && first.byOutcome.refused === first.failed, `turning preStop on replaces Pods that still exit at once: ${first.failed}`)
  setDeploymentVersion(c, 'klopa-api', '1.4.1', { preStopSleepS: 5 })
  advance(c, 60)
  assert.equal(c.deployments[0].rollout!.requests.failed, 0, 'L14 „Uvođenje 1.4.0 → 1.4.1 s 0 grešaka”')
  assert.ok(trafficTotals(c).failed >= first.failed, 'global totals are untouched')
  // per-version totals
  assert.equal(trafficTotals(c, { version: '1.4.1' }).failed, 0)
  assert.ok(trafficTotals(c, { version: '1.4.1' }).ok > 0)
  assert.equal(trafficTotals(c, { streamId: 'nema' }).total, 0)
  const rec = presetRollout({ strategy: 'Recreate' })
  setDeploymentVersion(rec, 'klopa-api', '1.4.0')
  advance(rec, 40)
  assert.ok(rec.deployments[0].rollout!.requests.byOutcome.noEndpoints > 180)
})

test('goal windows: L12 „Ispad baze od 60 s bez 0 endpointa” measured from the mark, users hit only inside the window', () => {
  const s = presetPodHealth({ behaviour: 'dependsOnDb', warm: true, probes: { liveness: probe('/healthz'), readiness: probe('/ready') } })
  advance(s, 20)
  const w = markWindow(s, 'ispad baze')
  setDatabase(s, false, 60)
  advance(s, 90)
  const st = windowStats(s, w)!
  assert.equal(st.label, 'ispad baze')
  assert.equal(st.durationS, 90)
  assert.equal(st.services['klopa-api'].zeroReadySeconds, 0, 'process-only probes: never 0 endpoints')
  assert.equal(st.services['klopa-api'].minReady, 3)
  assert.ok(Math.abs(st.totals.http503 - 1200) < 150)
  assert.equal(windowStats(s, 'nema'), null)
  // users: a release lane with users; the window counts only failures after the mark
  const r = presetRelease({ strategy: 'rolling' })
  advance(r, 5)
  startRelease(r)
  advance(r, 30)
  const hitBefore = Object.keys(r.traffic[0].usersHit).length
  const w2 = markWindow(r)
  advance(r, 10)
  const ws = windowStats(r, w2)!
  assert.ok(ws.usersHit > 0 && ws.usersHit <= Object.keys(r.traffic[0].usersHit).length)
  assert.ok(hitBefore > 0)
  assert.ok(ws.byVersion['2.0.0'].failed > 0)
  resetTrafficTotals(r)
  assert.equal(r.windows.length, 0)
})

// ---------------------------------------------------------------- L18 profiles, CPU request, lead time

test('traffic profiles are anchored when switched: a spike chosen at t = 500 starts 60 s later; absolute anchoring keeps the clock', () => {
  const s = presetAutoscaling({ profile: TRAFFIC_PRESETS.steady })
  advance(s, 500)
  assert.equal(setTrafficProfile(s, 'web', TRAFFIC_PRESETS.spike), true)
  advance(s, 59)
  assert.equal(streamRate(s, s.traffic[0]), 20)
  advance(s, 2)
  assert.equal(streamRate(s, s.traffic[0]), 100)
  advance(s, 60)
  assert.ok(s.deployments[0].replicas >= 7, `the HPA reacts: ${s.deployments[0].replicas}`)
  const a = presetAutoscaling({ profile: TRAFFIC_PRESETS.steady })
  advance(a, 500)
  setTrafficProfile(a, 'web', TRAFFIC_PRESETS.spike, { anchor: 'absolute' })
  advance(a, 60)
  assert.equal(streamRate(a, a.traffic[0]), 20, 'absolute: the spike (60–420 s) is long over')
  assert.equal(setTrafficProfile(a, 'nema', TRAFFIC_PRESETS.spike), false)
})

test('„Klizač CPU requests”: the limit follows the request (2×); request > limit is rejected with the API message', () => {
  const s = presetAutoscaling()
  assert.equal(setCpuRequest(s, 'klopa-api', 250).ok, true)
  assert.deepEqual(s.deployments[0].template.resources.limits, { cpuM: 500 })
  assert.equal(setCpuRequest(s, 'klopa-api', 300, { limit: 1200 }).ok, true)
  assert.deepEqual(s.deployments[0].template.resources.limits, { cpuM: 1200 })
  const r = setCpuRequest(s, 'klopa-api', 1500, { limit: 'keep' })
  assert.deepEqual(r, { ok: false, message: 'The Deployment "klopa-api" is invalid: spec.template.spec.containers[0].resources.requests: Invalid value: "1500m": must be less than or equal to cpu limit of 1200m' })
  assert.equal(setCpuRequest(s, 'klopa-api', 1500, { limit: 1000 }).message.endsWith('cpu limit of 1'), true)
  assert.equal(setCpuRequest(s, 'klopa-api', 400, { ratio: 3 }).ok, true)
  assert.deepEqual(s.deployments[0].template.resources, { requests: { cpuM: 400, memMi: 256 }, limits: { cpuM: 1200 } })
  assert.equal(setCpuRequest(s, 'nema', 400).ok, false)
})

test('lead time per Pod: Pending → CA scale-up → node → pull → start → Ready (L18 „Podovi u sekundama, čvorovi u minutama”)', () => {
  const s = presetAutoscaling()
  advance(s, 200)
  const p = s.pods.find((x) => x.timeline.scaleUpTriggeredAt !== null && x.timeline.readyAt !== null)!
  assert.ok(p)
  assert.equal(p.timeline.unschedulableAt, p.timeline.createdAt)
  const lt = podLeadTime(p)
  assert.equal(lt.waitSchedulerS, 5, 'Pending until the next CA scan (t = 80)')
  assert.equal(lt.waitNodeS, 75, 'node provisioning (sim) dominates')
  assert.equal(lt.pullS, 5)
  assert.ok(lt.readyS! > 9 && lt.readyS! < 15)
  assert.ok(Math.abs(lt.totalS! - (lt.waitSchedulerS! + lt.waitNodeS! + lt.pullS! + lt.startS! + lt.readyS!)) < 1e-6)
  const quick = s.pods.find((x) => x.timeline.scaleUpTriggeredAt === null && x.timeline.readyAt !== null && x.timeline.createdAt > 0)!
  assert.equal(podLeadTime(quick).waitNodeS, 0)
  const fresh = presetAutoscaling({ minReplicas: 2 })
  scaleDeployment(fresh, 'klopa-api', 3)
  advance(fresh, 0.5)
  const newest = fresh.pods.at(-1)!
  assert.equal(podLeadTime(newest).readyS, null)
})

// ---------------------------------------------------------------- L19 storage

test('L19 StatefulSet writes into every ordinal: scale 3 → 1 → 3 keeps db-2’s orders; Postgres Deployment mid-lesson', () => {
  const s = presetStorage({ part: 'statefulset' })
  advance(s, 60)
  const before = podOrders(s, pod(s, 'db-2'))!
  assert.ok(before > 50, `db-2 has its own orders (${before})`)
  scaleStatefulSet(s, 'db', 1)
  advance(s, 30)
  assert.deepEqual(s.pods.map((p) => p.name), ['db-0'])
  scaleStatefulSet(s, 'db', 3)
  advance(s, 60)
  assert.ok(podOrders(s, pod(s, 'db-2'))! >= before, 'the PVC data-db-2 kept its rows')
  const one = presetStorage({ part: 'statefulset', writes: 'db-0' })
  advance(one, 30)
  assert.equal(podOrders(one, pod(one, 'db-2')), 0)
  // „replicas: 3 za Postgres u Deploymentu” as a button
  const v = presetStorage({ part: 'volumes' })
  const r = applyPostgresDeployment(v, 'shared-pvc')
  assert.equal(r.message, 'persistentvolumeclaim/postgres-data created\ndeployment.apps/postgres created\nservice/postgres created')
  assert.equal(applyPostgresDeployment(v, 'shared-pvc').message, 'deployment.apps/postgres unchanged')
  advance(v, 40)
  assert.ok(v.events.some((e) => e.kind === 'db-lock') || v.pods.some((p) => p.labels.app === 'postgres' && podStatus(p) === 'ContainerCreating'))
})

test('database backed by a workload: up only while its Service has a ready endpoint', () => {
  const s = presetStorage({ part: 'statefulset' })
  setDatabaseBacking(s, 'db-0')
  assert.equal(s.db.up, true)
  powerOffNode(s, pod(s, 'db-0').nodeName!)
  advance(s, 15)
  assert.equal(s.db.up, false)
  assert.ok(s.events.some((e) => e.kind === 'db-down' && /Service db-0 nema spremnih endpointa/.test(e.text)))
  setDatabaseBacking(s, null)
  assert.equal(s.db.up, true)
  setDatabase(s, false, 5)
  assert.equal(s.db.up, false)
  advance(s, 6)
  assert.equal(s.db.up, true)
})

// ---------------------------------------------------------------- L17 in-place resize

test('L17 resizePod: in place (no new Pod, no restart, works with the scheduler off); QoS change rejected; Deferred until there is room', () => {
  const s = presetScheduler({ cards: ['leaky', 'web'] })
  assert.equal(placePod(s, 'leaky', 'node-1').ok, true)
  advance(s, 5)
  const p = pod(s, 'leaky')
  const ip = p.ip
  const r = resizePod(s, 'leaky', resources(100, 128, undefined, 1024))
  assert.deepEqual(r, { ok: true, message: 'pod/leaky patched' })
  assert.equal(pod(s, 'leaky'), p, 'the same Pod object')
  assert.equal(p.nodeName, 'node-1')
  assert.equal(p.ip, ip)
  assert.equal(p.container.restartCount, 0)
  assert.equal(p.spec.resources.limits.memMi, 1024)
  advance(s, 60)
  assert.equal(p.container.restartCount, 0, 'no more OOM loop')
  assert.equal(resizePod(s, 'leaky', resources()).message, 'The Pod "leaky" is invalid: spec: Invalid value: "Burstable": Pod QoS Class may not change as a result of resizing')
  assert.match(resizePod(s, 'leaky', resources(500, 128, 200, 1024)).message, /must be less than or equal to cpu limit of 200m/)
  // the classic way is a new Pod: with the scheduler off it waits to be placed again
  assert.equal(setPodResources(s, 'leaky', resources(100, 128, undefined, 2048)).ok, true)
  assert.equal(pod(s, 'leaky').nodeName, null)
  // Deferred while a neighbour holds the CPU, applied by the kubelet once it is gone; Infeasible beyond the node
  const t = presetScheduler({ manual: true, testPods: false, cards: ['web', 'api-guaranteed'] })
  assert.equal(placePod(t, 'web', 'node-1').ok, true)
  assert.equal(placePod(t, 'api-guaranteed', 'node-1').ok, true)
  advance(t, 5)
  const web = pod(t, 'web')
  const n1 = t.nodes[0]
  const free = n1.allocatable.cpuM - nodeView(t, n1).requested.cpuM + 250
  const want = resources(free + 50, 256, free + 300, 512)
  assert.equal(resizePod(t, 'web', want).ok, true)
  assert.equal(web.resize?.status, 'Deferred')
  assert.equal(web.spec.resources.requests.cpuM, 250, 'nothing changes until there is room')
  deletePod(t, 'api-guaranteed')
  advance(t, 40)
  assert.equal(web.resize, null)
  assert.equal(web.spec.resources.requests.cpuM, free + 50)
  assert.equal(web.container.restartCount, 0)
  assert.equal(resizePod(t, 'web', resources(9000, 256, 9000, 512)).ok, true)
  assert.equal(pod(t, 'web').resize?.status, 'Infeasible')
  assert.equal(resizePod(t, 'nema', resources(1, 1, 1, 1)).ok, false)
})

// ---------------------------------------------------------------- colours, presets, L10, L20

test('version colours follow the course grammar per preset (stable blue, next violet, broken rose, other teal)', () => {
  const l14 = presetService({ version: '1.4.0' })
  assert.deepEqual(['1.4.0', '1.4.1', '1.5.0', '2.0.1'].map((v) => versionToneFor(l14, v)), ['blue', 'violet', 'rose', 'teal'])
  const l20 = presetRelease()
  assert.deepEqual(['1.4.1', '2.0.0'].map((v) => versionToneFor(l20, v)), ['blue', 'violet'])
  const l13 = presetRollout()
  assert.deepEqual(['1.3.2', '1.4.0', '1.5.0'].map((v) => versionToneFor(l13, v)), ['blue', 'violet', 'rose'])
  setVersionRoles(l13, { stable: '1.4.0' })
  assert.equal(versionToneFor(l13, '1.4.0'), 'blue')
  assert.equal(versionToneFor(createCluster(), '1.4.0'), 'violet', 'no roles → fixed table')
  assert.equal(podView(l14, apiPods(l14)[0]).tone, 'blue')
})

test('presetRollout({ nodes: "small" }): replicas ≠ machines – the 10th Pod stays Pending (Insufficient cpu)', () => {
  const s = presetRollout({ nodes: 'small' })
  assert.equal(scaleDeployment(s, 'klopa-api', 10).ok, true)
  advance(s, 20)
  const pending = apiPods(s).filter((p) => p.nodeName === null)
  assert.equal(pending.length, 1)
  assert.match(pending[0].scheduled.message, /^0\/3 nodes are available: 3 Insufficient cpu\./)
  for (const n of s.nodes) assert.ok(nodeView(s, n).requested.cpuM <= n.allocatable.cpuM)
})

test('presetScheduler({ apiCard: "burstable" }): the api card starts Burstable and can be made Guaranteed', () => {
  const s = presetScheduler({ apiCard: 'burstable', cards: ['api'] })
  assert.equal(qosClass(pod(s, 'api').spec), 'Burstable')
  assert.equal(setPodResources(s, 'api', resources(500, 512, 500, 512)).ok, true)
  assert.equal(qosClass(pod(s, 'api').spec), 'Guaranteed')
  assert.equal(qosClass(pod(presetScheduler({ cards: ['api-guaranteed'] }), 'api-guaranteed').spec), 'Guaranteed', 'default = SIM 3 card')
})

test('L10 lunch: with the seeded day the six extra api instances spread 2/2/2; with the new version after lunch they land on server-2', () => {
  const lunch = (dayEvents: ReturnType<typeof D.seededDay> | null) => {
    const s = D.createDesiredState({ mode: 'loop', dayEvents })
    D.advanceDesiredState(s, 12 * 60 + 10 - 150)
    return s.servers.map((sv) => s.instances.filter((i) => i.serverId === sv.id && i.app === 'api' && i.createdAt >= 12 * 60 - 150 - 1e-9).length)
  }
  assert.deepEqual(lunch(null), [2, 2, 2])
  const later = D.seededDay().map((e) => (e.kind === 'new-version' ? { ...e, minute: 13 * 60 + 30, label: '13:30 nova verzija API-ja' } : e))
  const onServer2 = lunch(later)
  assert.ok(onServer2[1] >= 4, `mostly on server-2: ${onServer2}`)
  // events carry the clock separately
  const s = D.createDesiredState({ mode: 'loop' })
  D.advanceDesiredState(s, 60)
  const fail = s.events.find((e) => e.kind === 'server-fail')!
  assert.equal(fail.clock, '03:00')
  assert.equal(fail.text, 'poslužitelj-2 je pao – nestalo je 9 kontejnera')
})

test('L20: users hit and exposure – replicas ≈ 20 % vs weights ≈ 5 %; the hidden-mode exposure metric', () => {
  const lane = (strategy: 'canary-replicas' | 'canary-weights', analysis = true) => {
    const s = presetRelease({ strategy, analysis })
    advance(s, 5)
    startRelease(s)
    return s
  }
  const r = lane('canary-replicas')
  runUntil(r, (x) => x.release!.phase === 'aborted', 120)
  const w = lane('canary-weights')
  runUntil(w, (x) => x.release!.phase === 'aborted', 120)
  const sr = releaseStats(r)!
  const sw = releaseStats(w)!
  // curriculum goal „grešku vidi < 50 korisnika” – both pass at the model's defaults (20 rps, 30 s steps, bug 20 %);
  // a threshold of 15 separates them (see README → open question for the curriculum owner)
  assert.ok(sr.usersHit > 15 && sr.usersHit < 40, `replicas ${sr.usersHit}`)
  assert.ok(sw.usersHit < 15, `weights ${sw.usersHit}`)
  assert.ok(sr.exposurePct > sw.exposurePct)
  assert.ok(sr.requestsToNewPct > 8 && sw.requestsToNewPct < 6)
  assert.equal(sr.usersExposed, Object.keys(r.traffic[0].usersByVersion['2.0.0']).length)
  // hidden mode (no analysis): exposure series per second; weights stay under 10 % through the first step
  const h = lane('canary-weights', false)
  advance(h, 40)
  assert.ok(releaseStats(h)!.exposurePct < 10)
  assert.ok(h.release!.metrics.exposureSeries.values.length >= 40)
  const hr = lane('canary-replicas', false)
  advance(hr, 40)
  assert.ok(releaseStats(hr)!.exposurePct > 10, 'by replicas 10 % of users are reached within the first step')
})

// ---------------------------------------------------------------- replay

test('timeline: seek is non-destructive – stepping on from the past replays the actions and reaches the live state', () => {
  const tl = createTimeline(() => presetControlPlane())
  stepTimeline(tl, 5)
  act(tl, 'replicas 5', (s) => applyReplicaSetReplicas(s, 'klopa-api', 5))
  stepTimeline(tl, 4)
  act(tl, 'kubelet off', (s) => setKubelet(s, 'node-2', false))
  stepTimeline(tl, 6)
  const live = snapshot(tl.state)
  assert.equal(timelineTime(tl), 15)
  assert.deepEqual(timelineMarks(tl), [
    { t: 5, label: 'replicas 5' },
    { t: 9, label: 'kubelet off' },
  ])
  const past = seek(tl, 3)
  assert.equal(past.t, 3)
  assert.equal(tl.actions.length, 2, 'later actions are kept')
  assert.equal(timelineIsLive(tl), false)
  assert.equal(apiPods(past).length, 3)
  stepTimeline(tl, 12)
  assert.equal(snapshot(tl.state), live, 'replay reaches exactly the live state')
  assert.equal(timelineIsLive(tl), true)
  // acting in the past starts a new future
  seek(tl, 7)
  act(tl, 'replicas 2', (s) => applyReplicaSetReplicas(s, 'klopa-api', 2))
  assert.deepEqual(timelineMarks(tl).map((m) => m.label), ['replicas 5', 'replicas 2'])
  assert.equal(rewindTo(tl, 6).t, 6)
  assert.deepEqual(timelineMarks(tl).map((m) => m.label), ['replicas 5'])
  assert.equal(seek(tl, Number.NaN).t, 0)
})

// ---------------------------------------------------------------- plurals and kit adapters

test('Croatian plurals in narration (Intl.PluralRules("hr")): no „Pod(ova)”, „čvor(a)”, „2 Podova”', () => {
  const r = presetRelease({ strategy: 'canary-replicas' })
  advance(r, 5)
  startRelease(r)
  assert.ok(r.events.some((e) => e.text.includes('(1 canary Pod uz 4 stabilna Poda)')), r.events.map((e) => e.text).join(' | '))
  const a = presetAutoscaling()
  advance(a, 200)
  const texts = a.events.map((e) => e.text)
  assert.ok(texts.some((t) => /^HPA klopa-api: 2 → 3 Poda \(/.test(t)), texts.join(' | '))
  assert.ok(texts.some((t) => /^HPA klopa-api: 3 → 7 Podova \(/.test(t)))
  assert.ok(texts.some((t) => /^Cluster Autoscaler: \d+ (Pod čeka|Poda čekaju|Podova čeka) → dodaje 1 čvor,/.test(t)))
  for (const t of [...texts, ...r.events.map((e) => e.text)]) assert.ok(!/\((ova|a)\)/.test(t) && !/\b[2-4] Podova\b/.test(t), t)
  const c = presetControlPlane()
  fillNodes(c)
  assert.ok(c.events.some((e) => e.text === 'Iva je pokrenula 3 testna Poda koja zauzimaju sva slobodna mjesta'))
  const one = D.createDesiredState({ servers: 2, apps: [{ id: 'api', label: 'API', desired: 2 }], dayEvents: [{ minute: 3 * 60, kind: 'server-fail', server: 'server-2', label: '' }] })
  D.advanceDesiredState(one, 40)
  assert.ok(one.events.some((e) => e.text === 'poslužitelj-2 je pao – nestao je 1 kontejner'))
})

test('kit adapters: PodShape label = real STATUS; NodeFrame status; cfsLatencyMs named form', () => {
  const s = presetPodHealth({ wrongTag: true })
  advance(s, 15)
  const v = podShapeView(s.pods[0])
  assert.equal(v.status, 'crash')
  assert.equal(v.label, 'ImagePullBackOff', 'not the kit default „CrashLoopBackOff”')
  const n = presetRollout()
  cordonNode(n, 'node-1')
  assert.equal(nodeFrameStatus(n.nodes[0]), 'cordoned')
  assert.equal(nodeFrameStatus(nodeView(n, n.nodes[1])), 'ready')
  powerOffNode(n, 'node-2')
  advance(n, 60)
  assert.equal(nodeFrameStatus(n.nodes[1]), 'notready')
  assert.equal(cfsLatencyMs({ limitM: 200, workMs: 50 }).latencyMs, 210)
  assert.equal(cfsLatencyMs({ limitM: 200, workMs: 50, periodMs: 100 }).throttledMs, 160)
  assert.equal(cfsLatencyMs(50, 200).latencyMs, 210, 'the positional form is (workMs, limitM)')
})

test('hangProcess and usage sliders still behave with the new CPU capacity bookkeeping (finite everywhere)', () => {
  const s = presetScheduler({ manual: false })
  advance(s, 5)
  setPodUsage(s, 'cpu-burner', { cpuM: 5000 })
  hangProcess(s, 'web')
  advance(s, 20)
  for (const p of s.pods) assert.ok(Number.isFinite(p.usage.cpuCapacityM) && p.usage.cpuCapacityM >= 0, p.name)
  const burner = pod(s, 'cpu-burner')
  assert.equal(burner.usage.cpuM, 500, 'throttled at its limit')
  assert.equal(burner.usage.cpuCapacityM, 500)
})
