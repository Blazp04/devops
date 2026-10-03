/**
 * E3 Klaster – state creation and the fixed-timestep loop.
 *
 * stepCluster(state, dt) accumulates simulated time and runs internal ticks of `timings.dt` (0,1 s).
 * Order inside one tick (matches the validated prototypes):
 *   node lifecycle → [whole second: traffic demand → CPU → served; metrics scrape; HPA] → KEDA →
 *   Deployment → StatefulSet → ReplicaSet → garbage collector → scheduler → storage → kubelets →
 *   EndpointSlices/kube-proxy → requests → Cluster Autoscaler → rollout bookkeeping → series.
 * Controllers therefore see Pod readiness one tick after the kubelet changed it, and each Deployment sync
 * does either a scale-up or a scale-down – as in sim-models SIM 5.
 */
import type { ClusterConfig, ClusterState, NodeSpec, Timings, WorkloadSeries } from './types.ts'
import { createRng, Series } from '../../kit/sim/math.ts'
import { DEFAULT_TIMINGS } from './config.ts'
import { addNode } from './nodes.ts'
import { cpuSecond, kubeletTick, warmRunPod } from './kubelet.ts'
import { scrapeMetrics, hpaTick } from './hpa.ts'
import { kedaTick, setupKeda } from './keda.ts'
import { deploymentTick, rolloutStatsTick } from './rollout.ts'
import { statefulSetTick } from './statefulset.ts'
import { garbageCollect, replicaSetTick } from './replicaset.ts'
import { schedulerTick } from './scheduler.ts'
import { storageTick } from './storage.ts'
import { endpointsTick, findService } from './service.ts'
import { fluidDemand, fluidServe, requestsTick, serviceStatsTick, streamRate } from './traffic.ts'
import { syncApiStatus } from './pods.ts'
import { clusterAutoscalerTick } from './autoscaler.ts'
import { releaseSecond, releaseTick } from './release.ts'
import { isActive, isReady, logEvent, matches } from './util.ts'
import { nodeLifecycleTick } from './nodes.ts'

export type ClusterInit = Partial<Omit<ClusterConfig, 'timings'>> & { timings?: Partial<Timings> }

export function resolveConfig(c: ClusterInit = {}): ClusterConfig {
  return {
    seed: c.seed ?? 42,
    preset: c.preset ?? 'custom',
    nodes: c.nodes ?? [],
    timings: { ...DEFAULT_TIMINGS, ...(c.timings ?? {}) },
    messages: c.messages ?? false,
    namespace: c.namespace ?? 'klopa',
    cachedImages: c.cachedImages ?? [],
    registry: c.registry ?? null,
    scoring: c.scoring ?? 'LeastAllocated',
    latency: c.latency ?? { baseMs: 50, rhoCap: 0.99 },
    metricResolutionS: c.metricResolutionS ?? 15,
    cpuInitializationPeriodS: c.cpuInitializationPeriodS ?? 300,
    autoscaler: c.autoscaler ?? null,
    keda: c.keda ?? null,
    cloudLoadBalancer: c.cloudLoadBalancer ?? false,
    versionRoles: c.versionRoles ? { ...c.versionRoles } : {},
    seriesFocus: c.seriesFocus ?? null,
    seriesLengthS: Number.isFinite(c.seriesLengthS) && (c.seriesLengthS ?? 0) >= 1 ? Math.round(c.seriesLengthS!) : 600,
  }
}

/** Create an empty cluster with the configured nodes (no workloads). */
export function createCluster(init: ClusterInit = {}): ClusterState {
  const cfg = resolveConfig(init)
  const len = cfg.seriesLengthS
  const s: ClusterState = {
    t: 0,
    tick: 0,
    acc: 0,
    cfg,
    rng: createRng(cfg.seed),
    seq: 0,
    components: { apiServer: true, etcd: true, scheduler: true, controllerManager: true },
    schedGen: 0,
    nodes: [],
    pods: [],
    replicaSets: [],
    deployments: [],
    statefulSets: [],
    services: [],
    slices: {},
    proxy: {},
    storageClasses: [{ name: 'standard', volumeBindingMode: 'WaitForFirstConsumer', reclaimPolicy: 'Delete' }],
    pvcs: [],
    pvs: [],
    dataStores: {},
    hpas: [],
    traffic: [],
    inFlight: [],
    recent: [],
    db: { up: true, downUntil: null, columns: ['cijena'], forcedDown: false, backing: null, password: null },
    secrets: {},
    podMetrics: {},
    lastScrapeAt: -Infinity,
    events: [],
    eventSeq: 0,
    kubeEvents: [],
    messages: [],
    watch: {},
    warned: {},
    series: {
      replicas: new Series(len),
      ready: new Series(len),
      pending: new Series(len),
      nodes: new Series(len),
      rps: new Series(len),
      okPerS: new Series(len),
      errPerS: new Series(len),
      utilization: new Series(len),
      latencyMs: new Series(len),
      p95Ms: new Series(len),
      queue: new Series(len),
      byDeployment: {},
    },
    serviceStats: {},
    windows: [],
    writeVisibleAt: 0,
    secondCounters: { ok: 0, err: 0, okByVersion: {} },
    usageTotals: { nodeSeconds: 0, podSeconds: 0 },
    kubectlLog: [],
    release: null,
  }
  for (const spec of cfg.nodes) addNode(s, spec)
  if (cfg.keda) setupKeda(s)
  return s
}

export function addNodes(s: ClusterState, specs: NodeSpec[]): void {
  for (const spec of specs) addNode(s, spec)
}

/** Ticks per simulated second (10 with dt = 0,1 s). */
function ticksPerSecond(s: ClusterState): number {
  return Math.max(1, Math.round(1 / s.cfg.timings.dt))
}

/**
 * Effective database state: the „Baza pala” switch (with its timer) and, when the database is a workload
 * (`db.backing`), at least one ready endpoint of that Service.
 */
export function dbEffectiveUp(s: ClusterState): boolean {
  const db = s.db
  if (db.forcedDown) return false
  if (db.backing === null) return true
  const svc = findService(s, db.backing)
  return !!svc && s.slices[svc.id].endpoints.some((e) => e.ready)
}

/** Expire the „Baza pala 60 s” timer and log transitions of the effective state. */
export function dbTick(s: ClusterState): void {
  const db = s.db
  if (db.forcedDown && db.downUntil !== null && s.t + 1e-9 >= db.downUntil) {
    db.forcedDown = false
    db.downUntil = null
  }
  const up = dbEffectiveUp(s)
  if (up === db.up) return
  db.up = up
  const why = !up && db.backing !== null && !db.forcedDown ? ` – Service ${db.backing} nema spremnih endpointa` : ''
  logEvent(s, up ? 'db-up' : 'db-down', up ? 'Baza ponovno radi' : `Baza ne radi${why}`, up ? 'ok' : 'bad')
}

/** One internal tick at time s.t. */
export function processTick(s: ClusterState): void {
  s.messages = s.messages.filter((m) => s.t - m.t0 <= m.duration + 0.6)
  syncApiStatus(s)
  dbTick(s)
  nodeLifecycleTick(s)
  const wholeSecond = s.tick % ticksPerSecond(s) === 0
  if (wholeSecond) {
    fluidDemand(s)
    cpuSecond(s)
    fluidServe(s)
    if (Math.round(s.t) % s.cfg.metricResolutionS === 0) scrapeMetrics(s)
    hpaTick(s)
  }
  kedaTick(s)
  deploymentTick(s)
  statefulSetTick(s)
  replicaSetTick(s)
  garbageCollect(s)
  schedulerTick(s)
  storageTick(s)
  kubeletTick(s)
  endpointsTick(s)
  serviceStatsTick(s)
  requestsTick(s)
  clusterAutoscalerTick(s)
  rolloutStatsTick(s)
  releaseTick(s)
  if (wholeSecond) sampleSeries(s)
  s.tick += 1
  s.t = Math.round(s.tick * s.cfg.timings.dt * 1e6) / 1e6
}

/**
 * Advance by dtSeconds of simulated time using the internal fixed step (accumulator).
 * Signature fits useSimulation({ step }) – call with dt = 1/60 s (possibly sped up).
 */
export function stepCluster(s: ClusterState, dtSeconds: number): void {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return
  s.acc += Math.min(dtSeconds, 120)
  const dt = s.cfg.timings.dt
  let n = 0
  while (s.acc + 1e-9 >= dt && n < 200_000) {
    processTick(s)
    s.acc -= dt
    n += 1
  }
}

/** Run exactly round(seconds / dt) ticks (tests, "Premotaj" buttons). */
export function advance(s: ClusterState, seconds: number): void {
  const n = Math.round(seconds / s.cfg.timings.dt)
  for (let i = 0; i < n; i++) processTick(s)
}

/** Run until predicate holds or the time limit passes; returns the time or null. */
export function runUntil(s: ClusterState, predicate: (s: ClusterState) => boolean, maxSeconds: number): number | null {
  const end = s.t + maxSeconds
  while (s.t <= end + 1e-9) {
    if (predicate(s)) return s.t
    processTick(s)
  }
  return null
}

function workloadSeries(len: number): WorkloadSeries {
  return { replicas: new Series(len), ready: new Series(len), pending: new Series(len) }
}

function sampleSeries(s: ClusterState): void {
  const se = s.series
  const len = s.cfg.seriesLengthS
  const pendingPod = (p: (typeof s.pods)[number]) => p.phase === 'Pending' && p.nodeName === null && !p.deletion
  for (const d of s.deployments) {
    const w = (se.byDeployment[d.name] ??= workloadSeries(len))
    const pods = s.pods.filter((p) => p.namespace === d.namespace && matches(d.selector, p.labels) && isActive(p))
    w.replicas.push(d.replicas)
    w.ready.push(pods.filter(isReady).length)
    w.pending.push(pods.filter(pendingPod).length)
  }
  const focus = s.cfg.seriesFocus !== null ? se.byDeployment[s.cfg.seriesFocus] : undefined
  if (focus) {
    se.replicas.push(focus.replicas.last())
    se.ready.push(focus.ready.last())
    se.pending.push(focus.pending.last())
  } else {
    se.replicas.push(s.deployments.reduce((a, d) => a + d.replicas, 0))
    se.ready.push(s.pods.filter((p) => p.ready.status && !p.deletion).length)
    se.pending.push(s.pods.filter(pendingPod).length)
  }
  const readyNodes = s.nodes.filter((n) => n.machine === 'running' && n.condition.ready === 'True').length
  se.nodes.push(readyNodes)
  // a provisioning machine is already billed
  s.usageTotals.nodeSeconds += readyNodes + s.nodes.filter((n) => n.machine === 'provisioning').length
  s.usageTotals.podSeconds += s.pods.filter((p) => p.processUp).length
  se.rps.push(s.traffic.filter((t) => t.enabled).reduce((a, t) => a + streamRate(s, t), 0))
  se.okPerS.push(s.secondCounters.ok)
  se.errPerS.push(s.secondCounters.err)
  releaseSecond(s)
  s.secondCounters = { ok: 0, err: 0, okByVersion: {} }
  const h = s.hpas.find((x) => x.metric.type === 'cpu')
  se.utilization.push(h?.status.currentMetric ?? 0)
  const fluid = s.traffic.find((t) => t.model === 'fluid' && t.enabled)
  se.latencyMs.push(fluid ? fluid.latencyMs : 0)
  se.p95Ms.push(fluid ? fluid.p95Ms : 0)
  const k = s.cfg.keda
  se.queue.push(k ? k.queueLength + k.unacked : 0)
}

/** Per-Deployment replicas / ready / pending series (null until the first whole second). */
export function seriesFor(s: ClusterState, deployment: string): WorkloadSeries | null {
  return s.series.byDeployment[deployment] ?? null
}

/**
 * Settle the initial workloads instantly (preset start state): controllers create Pods, the scheduler binds
 * them, and every bound Pod is Running/Ready as if it had been up for a long time. Time stays at 0.
 */
export function warmStart(s: ClusterState): void {
  const saved = s.cfg.timings
  const savedMessages = s.cfg.messages
  // time stands still here: no animated hops and no write-visibility hold (it would postpone every watch forever)
  s.cfg.messages = false
  s.cfg.timings = { ...saved, watchDelayS: [0, 0], scheduleDelayS: 0, provisionVolumeS: 0, attachS: 0 }
  for (let i = 0; i < 40; i++) {
    deploymentTick(s)
    statefulSetTick(s)
    replicaSetTick(s)
    for (const p of s.pods) if (p.nodeName === null) p.scheduleAfter = -Infinity
    schedulerTick(s)
    storageTick(s)
    storageTick(s)
    let changed = false
    for (const p of s.pods) {
      if (p.nodeName && p.kubelet.stage === 'admit' && !p.deletion) {
        const blocked = p.spec.volumes.some((v) => {
          if (v.kind !== 'pvc') return false
          const pvc = s.pvcs.find((c) => c.name === v.claimName && c.namespace === p.namespace)
          const pv = pvc && s.pvs.find((x) => x.id === pvc.volumeId)
          if (!pv) return true
          if (pv.accessMode === 'RWO' || pv.accessMode === 'RWOP') {
            if (pv.attachedNode === null) pv.attachedNode = p.nodeName
            return pv.attachedNode !== p.nodeName
          }
          return false
        })
        if (blocked) continue
        // a second database process on the same data directory must go through a real start (and fail on the lock)
        const claim = p.spec.app.database ? p.spec.volumes.find((v) => v.kind === 'pvc' && v.name === p.spec.dataVolume) : undefined
        if (claim && claim.kind === 'pvc' && s.pods.some((o) => o !== p && o.processUp && o.spec.volumes.some((v) => v.kind === 'pvc' && v.claimName === claim.claimName))) continue
        warmRunPod(s, p)
        changed = true
      }
    }
    if (!changed && s.pods.every((p) => p.nodeName !== null || p.deletion)) break
  }
  endpointsTick(s)
  for (const svc of s.services) {
    const pr = s.proxy[svc.id]
    if (pr.pending.length) {
      const last = pr.pending[pr.pending.length - 1]
      pr.endpoints = last.endpoints
      pr.version = last.version
      pr.pending = []
    }
  }
  for (const d of s.deployments) {
    d.rollout = null
    deploymentTick(s)
    d.rollout = null
    d.conditions.progressing = { status: 'True', reason: 'NewReplicaSetAvailable', message: `ReplicaSet has successfully progressed.`, lastUpdate: s.t, lastTransition: s.t }
  }
  s.cfg.timings = saved
  s.cfg.messages = savedMessages
  s.watch = {}
  s.events = []
  s.kubeEvents = []
  s.messages = []
  s.writeVisibleAt = 0
  s.warned = {}
  logEvent(s, 'ready', 'Klaster je spreman', 'ok')
}
