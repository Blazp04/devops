/**
 * Lecture presets – each returns a ready-to-run ClusterState (call inside useSimulation's init).
 * Every preset is built from the same engine; presets only choose nodes, workloads and timings.
 */
import type { AppBehaviour, ClusterState, IntOrPercent, NodeSpec, PodTemplate, Probes, ReleaseStrategy, TrafficProfile, VersionRoles } from './types.ts'
import {
  API_IMAGE,
  COMPRESSED,
  COMPRESSED_FAILURE_TIMINGS,
  HPA_NODE,
  KLOPA_API_VERSIONS,
  L12_BEHAVIOURS,
  NO_PROBES,
  REGISTRY,
  SCHEDULER_NODES,
  appBehaviour,
  defaultAutoscaler,
  defaultKeda,
  klopaApiTemplate,
  nodeSpec,
  podTemplate,
  probe,
  resources,
} from './config.ts'
import type { KlopaApiVersion, L12Behaviour } from './config.ts'
import { createCluster, warmStart } from './core.ts'
import { createPodObject } from './pods.ts'
import { createDeployment } from './rollout.ts'
import { createService } from './service.ts'
import { addTrafficStream } from './traffic.ts'
import { createHpa } from './hpa.ts'
import { createPvc } from './storage.ts'
import { createStatefulSet } from './statefulset.ts'
import { newId, nextSeq, templateHash } from './util.ts'
import { createRelease, strategyLabel } from './release.ts'

const ALL_API_IMAGES = Object.values(KLOPA_API_VERSIONS).map((v) => v.image)
export const WORKER_IMAGE = `${REGISTRY}/klopa-worker:1.3.2`
/** the L14 client Pod's image (a frontend that calls klopa-api) */
export const WEB_IMAGE = `${REGISTRY}/klopa-web:1.3.2`
export const POSTGRES_IMAGE = 'postgres:18'

/** The next version in the course's story chain (presets colour it violet). */
export const NEXT_VERSION: Record<string, string> = { '1.3.2': '1.4.0', '1.4.0': '1.4.1', '1.4.1': '2.0.0', '2.0.0': '2.0.1' }

/** Colour roles for a lane that starts on `stable`: its successor violet, the broken 1.5.0 rose. */
export function storyRoles(stable: string): VersionRoles {
  const r: VersionRoles = { stable, broken: ['1.5.0'] }
  const next = NEXT_VERSION[stable]
  if (next) r.next = next
  return r
}
/** a tag that does not exist in the registry (L11 "Krivi tag slike", L12 "krivi tag") */
export const WRONG_TAG_IMAGE = `${API_IMAGE}:1.3.20`

// ---------------------------------------------------------------- L11

export interface ControlPlaneOptions {
  seed?: number
  replicas?: number
}

/**
 * L11 "Klaster pod mikroskopom": 3 nodes × 6 abstract slots (512Mi each – requests come in L17), a
 * ReplicaSet preview klopa-api (3 replicas) and one bare Pod klopa-worker that nothing recreates.
 * Watch notifications take 0,1–0,3 s and every hop is an animated numbered message.
 */
export function presetControlPlane(o: ControlPlaneOptions = {}): ClusterState {
  const slots = 6
  const node = (name: string) => nodeSpec(name, { allocatableMemMi: slots * 512 + 200, memMi: 4096, daemonSetMemMi: 200 })
  const s = createCluster({
    seed: o.seed ?? 42,
    preset: 'L11 Klaster pod mikroskopom',
    nodes: [node('node-1'), node('node-2'), node('node-3')],
    messages: true,
    registry: [...ALL_API_IMAGES, WORKER_IMAGE],
    timings: { ...COMPRESSED_FAILURE_TIMINGS, watchDelayS: [0.1, 0.3], scheduleDelayS: 0, containerCreateS: 1, imagePullS: 2 },
  })
  const apiTpl = klopaApiTemplate('1.3.2', { resources: resources(100, 512) })
  // ReplicaSet preview (no Deployment yet)
  const rsHash = templateHash(apiTpl)
  s.replicaSets.push({
    id: newId(s, 'rs'),
    name: 'klopa-api',
    namespace: 'klopa',
    selector: { app: 'klopa-api' },
    template: apiTpl,
    replicas: o.replicas ?? 3,
    owner: null,
    revision: 1,
    templateHash: rsHash,
    createdAt: 0,
    seq: nextSeq(s),
    desiredAnnotation: null,
    maxAnnotation: null,
    changeCause: '',
  })
  createPodObject(s, podTemplate({ labels: { app: 'klopa-worker' }, image: WORKER_IMAGE, resources: resources(100, 512), app: appBehaviour({ version: '1.3.2' }) }), { name: 'klopa-worker', namespace: 'klopa', owner: null })
  createService(s, { name: 'klopa-api', selector: { app: 'klopa-api' } })
  warmStart(s)
  return s
}

// ---------------------------------------------------------------- L12

export interface PodHealthOptions {
  seed?: number
  behaviour?: L12Behaviour
  probes?: Partial<Probes>
  wrongTag?: boolean
  /** start already Running (default false: watch Pending → ContainerCreating → Running) */
  warm?: boolean
  rps?: number
  /** Overrides on top of the behaviour (e.g. `{ dependsOnDb: true }` so a DB outage reaches /ready-db). Default none. */
  app?: Partial<AppBehaviour>
}

/** L12 "Laboratorij zdravlja Poda": three bare klopa-api Pods, 20 rps only to Ready Pods, a shared database. */
export function presetPodHealth(o: PodHealthOptions = {}): ClusterState {
  const s = createCluster({
    seed: o.seed ?? 42,
    preset: 'L12 Laboratorij zdravlja Poda',
    nodes: [nodeSpec('node-1'), nodeSpec('node-2'), nodeSpec('node-3')],
    registry: ALL_API_IMAGES,
    cachedImages: [KLOPA_API_VERSIONS['1.3.2'].image],
    timings: { ...COMPRESSED_FAILURE_TIMINGS, scheduleDelayS: 0.5, containerCreateS: 1, imagePullS: 3 },
  })
  for (const n of s.nodes) n.images[KLOPA_API_VERSIONS['1.3.2'].image] = true
  const tpl = klopaApiTemplate('1.3.2', {
    app: { ...L12_BEHAVIOURS[o.behaviour ?? 'healthy'], ...(o.app ?? {}) },
    probes: { ...NO_PROBES, ...(o.probes ?? {}) },
    image: o.wrongTag ? WRONG_TAG_IMAGE : KLOPA_API_VERSIONS['1.3.2'].image,
  })
  for (const name of ['klopa-api-1', 'klopa-api-2', 'klopa-api-3']) createPodObject(s, tpl, { name, namespace: 'klopa', owner: null })
  createService(s, { name: 'klopa-api', selector: { app: 'klopa-api' } })
  addTrafficStream(s, { id: 'web', serviceName: 'klopa-api', rps: o.rps ?? 20 })
  if (o.warm) warmStart(s)
  return s
}

// ---------------------------------------------------------------- L13 / L14 / L20

export interface RolloutOptions {
  seed?: number
  replicas?: number
  version?: KlopaApiVersion
  maxSurge?: IntOrPercent
  maxUnavailable?: IntOrPercent
  strategy?: 'RollingUpdate' | 'Recreate'
  readinessProbe?: boolean
  /** SIGTERM handling of the app: 'drain' keeps serving 5 s (L13), 'exit' quits at once (L14 shutdown race) */
  sigterm?: 'drain' | 'exit' | 'ignore'
  preStopSleepS?: number
  rps?: number
  traffic?: boolean
  /** Deployment.spec.minReadySeconds (default 0): delays "Available", never traffic */
  minReadySeconds?: number
  /**
   * Nodes: default three large nodes (every slider value fits); 'small' = three nodes with room for 3 klopa-api Pods
   * each (100m requests), so replicas: 10 leaves one Pending – „replicas ≠ strojevi” (L13 scene 1); or your own list.
   */
  nodes?: NodeSpec[] | 'small'
  /** bare client Pod (fixed IP 10.244.1.7 on node-1) that sends the traffic – the source for sendRequest/tracePacket; null = none */
  clientPod?: string | null
  /** fixed ClusterIP of the Service (default derived; presetService uses 10.96.12.7 from the L14 text) */
  clusterIP?: string
  /** template labels app + version=<version> (Deployment selector stays app only) – L14 „Povlačenje oznaka (app, version)” */
  versionLabel?: boolean
  /** series length in seconds (default 600) */
  seriesLengthS?: number
}

/** 'small' rollout nodes: allocatable CPU fits exactly three 100m klopa-api Pods next to the 100m DaemonSet block. */
export const SMALL_ROLLOUT_NODES: NodeSpec[] = ['node-1', 'node-2', 'node-3'].map((n) => nodeSpec(n, { cpuM: 1000, memMi: 4096, allocatableCpuM: 400, allocatableMemMi: 2972 }))

/** readinessProbe in the L13 YAML: periodSeconds 2 (real default 10). */
export const ROLLOUT_READINESS = probe('/ready', { periodSeconds: COMPRESSED.rolloutReadinessPeriod.sim })

/**
 * L13 "Kontrolna ploča uvođenja" (also L14 rollout replay, L20 rolling lane): Deployment klopa-api N=4,
 * timings of sim-models SIM 5 – schedule 1 s, pull 4 s (new image, every Pod), start 6 s, readiness every 2 s,
 * graceful shutdown 5 s, progressDeadlineSeconds 60 (real 600).
 */
export function presetRollout(o: RolloutOptions = {}): ClusterState {
  const big = (name: string) => nodeSpec(name, { cpuM: 8000, memMi: 32768, allocatableCpuM: 7910, allocatableMemMi: 29000 })
  const v = o.version ?? '1.3.2'
  const nodes = o.nodes === 'small' ? SMALL_ROLLOUT_NODES : (o.nodes ?? [big('node-1'), big('node-2'), big('node-3')])
  const client = o.clientPod ?? null
  const s = createCluster({
    seed: o.seed ?? 42,
    preset: 'L13 Kontrolna ploča uvođenja',
    nodes,
    registry: [...ALL_API_IMAGES, WEB_IMAGE],
    cachedImages: [KLOPA_API_VERSIONS[v].image, WEB_IMAGE],
    timings: { scheduleDelayS: 1, containerCreateS: 0, imagePullS: 4, imageCache: 'pod', probeOffsetS: 0.1, endpointPropagationS: 1 },
    versionRoles: storyRoles(KLOPA_API_VERSIONS[v].app.version),
    seriesLengthS: o.seriesLengthS,
  })
  const template = rolloutTemplate(v, o)
  if (o.versionLabel) template.labels = { app: 'klopa-api', version: KLOPA_API_VERSIONS[v].app.version }
  createDeployment(s, {
    name: 'klopa-api',
    replicas: o.replicas ?? 4,
    template,
    selector: { app: 'klopa-api' },
    strategy: { type: o.strategy ?? 'RollingUpdate', maxSurge: o.maxSurge ?? '25%', maxUnavailable: o.maxUnavailable ?? '25%' },
    progressDeadlineSeconds: COMPRESSED.rolloutProgressDeadline.sim,
    minReadySeconds: o.minReadySeconds ?? 0,
  })
  const svc = { name: 'klopa-api', selector: { app: 'klopa-api' } }
  createService(s, o.clusterIP ? { ...svc, clusterIP: o.clusterIP } : svc)
  if (client && nodes.length) {
    const tpl = podTemplate({ labels: { app: client }, image: WEB_IMAGE, resources: resources(50, 64), app: appBehaviour({ version: '1.3.2', warmS: 1 }) })
    createPodObject(s, tpl, { name: client, namespace: 'klopa', owner: null, nodeName: nodes[0].name, ip: '10.244.1.7' })
  }
  if (o.traffic !== false) addTrafficStream(s, { id: 'web', serviceName: 'klopa-api', rps: o.rps ?? 20, fromPod: client })
  warmStart(s)
  return s
}

/** Template of a klopa-api version with the rollout lecture's probes and shutdown behaviour. */
export function rolloutTemplate(v: KlopaApiVersion, o: Pick<RolloutOptions, 'readinessProbe' | 'sigterm' | 'preStopSleepS'> = {}): PodTemplate {
  const t = klopaApiTemplate(v, {
    probes: { ...NO_PROBES, readiness: o.readinessProbe === false ? null : { ...ROLLOUT_READINESS } },
    preStopSleepS: o.preStopSleepS ?? 0,
    changeCause: `uvođenje ${KLOPA_API_VERSIONS[v].app.version}`,
  })
  t.app.sigterm = o.sigterm ?? 'drain'
  t.app.drainS = 5
  return t
}

/**
 * L14: the same Deployment, but the app exits immediately on SIGTERM unless preStop sleeps (shutdown race). Adds the
 * lecture's addresses: client Pod `klopa-web` at 10.244.1.7 (the traffic source, so sendRequest/tracePacket have a
 * path), Service ClusterIP 10.96.12.7, and a `version` label on the Pods to drag (selector stays app=klopa-api).
 */
export function presetService(o: RolloutOptions = {}): ClusterState {
  const s = presetRollout({ sigterm: 'exit', preStopSleepS: 0, clientPod: 'klopa-web', clusterIP: '10.96.12.7', versionLabel: true, ...o })
  s.cfg.preset = 'L14 Laboratorij selektora'
  return s
}

// ---------------------------------------------------------------- L17

export interface SchedulerCard {
  name: string
  resources: ReturnType<typeof resources>
  cpuDemandM: number
  memMi: number
  memGrowthMiPerS?: number
  teaches: string
}

/** SIM 3 Pod cards (requests / limits / usage). */
export const SCHEDULER_CARDS: SchedulerCard[] = [
  { name: 'web', resources: resources(250, 256, 500, 512), cpuDemandM: 150, memMi: 200, teaches: 'Burstable' },
  { name: 'api-guaranteed', resources: resources(500, 512, 500, 512), cpuDemandM: 400, memMi: 400, teaches: 'Guaranteed' },
  { name: 'cpu-burner', resources: resources(250, 256, 500), cpuDemandM: 1000, memMi: 200, teaches: 'prigušen 50 %, nikad ubijen' },
  { name: 'batch', resources: resources(1000, 1024, undefined, 1024), cpuDemandM: 1500, memMi: 700, teaches: 'koristi slobodni CPU, natjecanje' },
  { name: 'leaky', resources: resources(100, 128, undefined, 256), cpuDemandM: 50, memMi: 100, memGrowthMiPerS: 5, teaches: 'OOMKilled oko 31 s, zatim CrashLoopBackOff' },
  { name: 'besteffort', resources: resources(), cpuDemandM: 200, memMi: 300, teaches: 'BestEffort – stane bilo gdje, izbacuje se prvi' },
  { name: 'big-db', resources: resources(4000, 8192, 4000, 8192), cpuDemandM: 2000, memMi: 6000, teaches: 'Pending: Insufficient cpu / memory' },
  { name: 'fragment', resources: resources(1500, 512), cpuDemandM: 1000, memMi: 400, teaches: 'Pending iako ukupno ima dovoljno CPU-a' },
]

export function cardTemplate(c: SchedulerCard): PodTemplate {
  return podTemplate({
    labels: { app: c.name },
    image: `${REGISTRY}/${c.name}:1.0.0`,
    resources: c.resources,
    app: appBehaviour({ version: '1.0.0', cpuDemandM: c.cpuDemandM, memMi: c.memMi, memGrowthMiPerS: c.memGrowthMiPerS ?? 0, warmS: 2 }),
  })
}

export interface SchedulerOptions {
  seed?: number
  /** start with the scheduler switched off so students place cards by hand (default true) */
  manual?: boolean
  /**
   * Iva's test Pods that reserve CPU they never use (cause of the L17 hook; default true). They are what makes
   * `fragment` Pending with "3 Insufficient cpu" although the free CPU summed over nodes is enough.
   */
  testPods?: boolean
  cards?: string[]
  /**
   * SIM 3 lists the api card as Guaranteed (default 'guaranteed': `api-guaranteed`, requests = limits 500m/512Mi).
   * 'burstable' replaces it with `api` (requests 500m/512Mi, limits 1000m/1Gi) for the task „Učinite api Guaranteed”.
   */
  apiCard?: 'guaranteed' | 'burstable'
}

/** The Burstable variant of the api card (presetScheduler({ apiCard: 'burstable' })). */
export const API_BURSTABLE_CARD: SchedulerCard = { name: 'api', resources: resources(500, 512, 1000, 1024), cpuDemandM: 400, memMi: 400, teaches: 'Burstable – izjednačite requests i limits pa postaje Guaranteed' }

/** L17 "Tetris raspoređivača": SIM 3 nodes and Pod cards; scheduler off until "Pokreni raspoređivač". */
export function presetScheduler(o: SchedulerOptions = {}): ClusterState {
  const s = createCluster({
    seed: o.seed ?? 42,
    preset: 'L17 Tetris raspoređivača',
    nodes: SCHEDULER_NODES,
    timings: { ...COMPRESSED_FAILURE_TIMINGS, scheduleDelayS: 0, containerCreateS: 1, imagePullS: 2, imageCache: 'node' },
  })
  if (o.testPods !== false) {
    const idle = (name: string, node: string, cpu: number) =>
      createPodObject(s, podTemplate({ labels: { app: 'ivina-proba' }, image: `${REGISTRY}/ivina-proba:0.1`, resources: resources(cpu, 256), app: appBehaviour({ cpuDemandM: 20, memMi: 120, warmS: 1 }) }), { name, namespace: 'klopa-staging', owner: null, nodeName: node })
    idle('ivina-proba-1', 'node-2', 1500)
    idle('ivina-proba-2', 'node-2', 1000)
    idle('ivina-proba-3', 'node-3', 1000)
    warmStart(s)
  }
  const deck = o.apiCard === 'burstable' ? SCHEDULER_CARDS.map((c) => (c.name === 'api-guaranteed' ? API_BURSTABLE_CARD : c)) : SCHEDULER_CARDS
  const pick = o.cards ? deck.filter((c) => o.cards!.includes(c.name)) : deck
  for (const c of pick) createPodObject(s, cardTemplate(c), { name: c.name, namespace: 'klopa', owner: null })
  if (o.manual !== false) s.components.scheduler = false
  return s
}

// ---------------------------------------------------------------- L18

export interface AutoscalingOptions {
  seed?: number
  profile?: TrafficProfile
  targetUtilization?: number
  minReplicas?: number
  maxReplicas?: number
  cpuRequestM?: number | null
  clusterAutoscaler?: boolean
  minNodes?: number
  maxNodes?: number
  keda?: boolean
  /** messages per second into the orders queue (KEDA panel) */
  queueRate?: number
  /** arrival profile of the queue instead of a constant rate (e.g. QUEUE_DAY) */
  queueProfile?: TrafficProfile
  /** series length in seconds (default 1500: the whole validated spike story 0–720 s and a 1200 s day fit) */
  seriesLengthS?: number
}

export const TRAFFIC_PRESETS: Record<'steady' | 'spike' | 'daily' | 'flash', TrafficProfile> = {
  steady: { kind: 'steady', rps: 20 },
  spike: { kind: 'spike', base: 20, peak: 100, startS: 60, endS: 420 },
  daily: { kind: 'sine', min: 10, max: 80, periodS: 1200 },
  flash: { kind: 'flash', base: 20, peak: 200, startS: 60, endS: 420 },
}

/**
 * L18 "Preživite ručak" (SIM 4): klopa-api request 500m / 256Mi, limit 1000m, 25 ms CPU per request,
 * HPA target 50 % (min 2, max 20), 2 nodes of 2 vCPU / 8 GiB (3 Pods each), Cluster Autoscaler 2–6 nodes
 * (new node Ready after 75 s sim), Pod start: cached image 1 s / new node 6 s, app 10 s, readiness every 5 s.
 */
export function presetAutoscaling(o: AutoscalingOptions = {}): ClusterState {
  const caOn = o.clusterAutoscaler !== false
  const s = createCluster({
    seed: o.seed ?? 42,
    preset: 'L18 Preživite ručak',
    nodes: [{ ...HPA_NODE, name: 'node-1' }, { ...HPA_NODE, name: 'node-2' }],
    cachedImages: [KLOPA_API_VERSIONS['1.3.2'].image],
    timings: { scheduleDelayS: 0, containerCreateS: 1, imagePullS: 5, imageCache: 'node', probeOffsetS: 0.1, endpointPropagationS: 1 },
    latency: { baseMs: 50, rhoCap: 0.99 },
    autoscaler: defaultAutoscaler({ enabled: caOn, minNodes: o.minNodes ?? 2, maxNodes: o.maxNodes ?? 6, template: HPA_NODE }),
    keda: o.keda ? defaultKeda({ arrivalRate: o.queueRate ?? 0 }) : null,
    seriesLengthS: o.seriesLengthS ?? 1500,
  })
  if (s.cfg.keda && o.queueProfile) {
    s.cfg.keda.profile = { ...o.queueProfile }
    s.cfg.keda.profileT0 = 0
  }
  const req = o.cpuRequestM === undefined ? 500 : o.cpuRequestM
  const tpl = klopaApiTemplate('1.3.2', {
    resources: req === null ? resources(undefined, 256, undefined, undefined) : resources(req, 256, 1000),
    probes: { ...NO_PROBES, readiness: probe('/ready', { periodSeconds: 5 }) },
  })
  tpl.app.warmS = 10
  tpl.app.cpuDemandM = 0
  createDeployment(s, { name: 'klopa-api', replicas: o.minReplicas ?? 2, template: tpl })
  createService(s, { name: 'klopa-api', selector: { app: 'klopa-api' } })
  addTrafficStream(s, { id: 'web', serviceName: 'klopa-api', model: 'fluid', profile: o.profile ?? TRAFFIC_PRESETS.spike })
  createHpa(s, { target: 'klopa-api', name: 'klopa-api', minReplicas: o.minReplicas ?? 2, maxReplicas: o.maxReplicas ?? 20, metric: { type: 'cpu', targetUtilization: o.targetUtilization ?? 50 } })
  if (o.keda) {
    const wt = podTemplate({ labels: { app: 'klopa-worker' }, image: WORKER_IMAGE, resources: resources(100, 128, 500, 256), probes: { ...NO_PROBES, readiness: probe('/ready', { periodSeconds: 5 }) }, app: appBehaviour({ version: '1.3.2', warmS: 5 }) })
    createDeployment(s, { name: 'klopa-worker', replicas: 0, template: wt })
  }
  warmStart(s)
  return s
}

// ---------------------------------------------------------------- L19

export interface StorageOptions {
  seed?: number
  /** 'volumes' = three Postgres variants (container FS / emptyDir / PVC); 'statefulset' = db-0..2 with PVCs */
  part?: 'volumes' | 'statefulset'
  /** Postgres in a Deployment with replicas: 3 – without a volume, or all sharing one RWO PVC */
  postgresDeployment?: 'none' | 'no-volume' | 'shared-pvc'
  writesPerSecond?: number
  /**
   * StatefulSet part: 'per-ordinal' (default) writes into every db-N through its own Service db-N, so each PVC holds
   * its own orders (scale 3 → 1 → 3 shows db-2's data survived); 'db-0' writes only into the primary.
   */
  writes?: 'per-ordinal' | 'db-0'
}

export function postgresTemplate(labels: Record<string, string>, over: Partial<PodTemplate> = {}): PodTemplate {
  return podTemplate({
    labels,
    image: POSTGRES_IMAGE,
    resources: resources(250, 512, undefined, 1024),
    probes: { ...NO_PROBES, readiness: probe('/ready', { periodSeconds: 2 }) },
    app: appBehaviour({ version: '18', warmS: 3, database: true, sigterm: 'drain', drainS: 1 }),
    terminationGracePeriodSeconds: 30,
    ...over,
  })
}

/** L19 "Preživljavaju li podatci?" – node failure timings compressed (20 s (sim) · stvarno: 5 min + do 6 min). */
export function presetStorage(o: StorageOptions = {}): ClusterState {
  const s = createCluster({
    seed: o.seed ?? 42,
    preset: 'L19 Preživljavaju li podatci?',
    nodes: [nodeSpec('node-1'), nodeSpec('node-2'), nodeSpec('node-3')],
    cachedImages: [POSTGRES_IMAGE],
    timings: { ...COMPRESSED_FAILURE_TIMINGS, scheduleDelayS: 0.5, containerCreateS: 1, imagePullS: 3 },
  })
  const w = o.writesPerSecond ?? 2
  if ((o.part ?? 'volumes') === 'volumes') {
    const variants: { name: string; tpl: PodTemplate }[] = [
      { name: 'db-kontejner', tpl: postgresTemplate({ app: 'db-kontejner' }) },
      { name: 'db-emptydir', tpl: postgresTemplate({ app: 'db-emptydir' }, { volumes: [{ name: 'data', kind: 'emptyDir' }], dataVolume: 'data' }) },
      { name: 'db-pvc', tpl: postgresTemplate({ app: 'db-pvc' }, { volumes: [{ name: 'data', kind: 'pvc', claimName: 'db-pvc-data' }], dataVolume: 'data' }) },
    ]
    createPvc(s, { name: 'db-pvc-data', sizeGi: 10 })
    for (const v of variants) {
      createDeployment(s, { name: v.name, replicas: 1, template: v.tpl, strategy: { type: 'Recreate' } })
      createService(s, { name: v.name, selector: { app: v.name } })
      addTrafficStream(s, { id: v.name, serviceName: v.name, rps: w })
    }
  } else {
    createService(s, { name: 'db', selector: { app: 'db' }, headless: true, port: 5432, targetPort: 5432 })
    const ordinals = (o.writes ?? 'per-ordinal') === 'per-ordinal' ? [0, 1, 2] : [0]
    for (const i of ordinals) createService(s, { name: `db-${i}`, selector: { 'statefulset.kubernetes.io/pod-name': `db-${i}` }, port: 5432, targetPort: 5432 })
    createStatefulSet(s, {
      name: 'db',
      replicas: 3,
      serviceName: 'db',
      template: postgresTemplate({ app: 'db' }, { dataVolume: 'data' }),
      volumeClaimTemplates: [{ name: 'data', sizeGi: 10, accessMode: 'RWO', storageClass: 'standard' }],
    })
    for (const i of ordinals) addTrafficStream(s, { id: `db-${i}`, serviceName: `db-${i}`, rps: w })
  }
  if (o.postgresDeployment && o.postgresDeployment !== 'none') addPostgresDeployment(s, o.postgresDeployment, w)
  warmStart(s)
  return s
}

/**
 * „replicas: 3 za Postgres u Deploymentu”: Deployment postgres (3 replicas) + Service + traffic at 2 × writes/s –
 * without a volume (three independent databases) or all sharing one RWO PVC (Multi-Attach / data-directory lock).
 * Used by presetStorage and, mid-lesson, by applyPostgresDeployment.
 */
export function addPostgresDeployment(s: ClusterState, variant: 'no-volume' | 'shared-pvc', writesPerSecond = 2): void {
  const shared = variant === 'shared-pvc'
  if (shared) createPvc(s, { name: 'postgres-data', sizeGi: 10 })
  createDeployment(s, {
    name: 'postgres',
    replicas: 3,
    template: postgresTemplate({ app: 'postgres' }, shared ? { volumes: [{ name: 'data', kind: 'pvc', claimName: 'postgres-data' }], dataVolume: 'data' } : {}),
  })
  createService(s, { name: 'postgres', selector: { app: 'postgres' }, port: 5432, targetPort: 5432 })
  addTrafficStream(s, { id: 'postgres', serviceName: 'postgres', rps: writesPerSecond * 2 })
}

// ---------------------------------------------------------------- L20

export interface ReleaseOptions {
  seed?: number
  strategy?: ReleaseStrategy
  /** steady replica count N (default 4) */
  replicas?: number
  /** share of the new version's requests that hit the bug (default 0,2 = 20 %) */
  bugRate?: number
  rps?: number
  /** distinct simulated users (default 1000) – "users hit" counts those who saw an error */
  users?: number
  steps?: number[]
  stepS?: number
  abortErrorRate?: number
  analysis?: boolean
  scaleDownDelayS?: number
  /** client keep-alive connections (blue-green: existing connections stay on blue); null = new connection per request */
  keepAlive?: { connections: number; maxAgeS: number | null } | null
  /** expand/contract lesson: 1.4.1 reads `cijena`, 2.0.0 reads `cijena_s_pdv` (and has no bug) */
  schema?: boolean
}

/**
 * L20 "Četiri strategije, isti bug": one lane per ClusterState, all with the same seed, so the traffic (arrivals,
 * users, bug draws) is identical across lanes. Stable 1.4.1 (N = 4) → 2.0.0 with a bug in `bugRate` of requests.
 * Timings as in L13 (schedule 1 s, pull 4 s, start 6 s, readiness every 2 s). Start with startRelease(s).
 */
export function presetRelease(o: ReleaseOptions = {}): ClusterState {
  const strategy = o.strategy ?? 'rolling'
  const n = o.replicas ?? 4
  const big = (name: string) => nodeSpec(name, { cpuM: 8000, memMi: 32768, allocatableCpuM: 7910, allocatableMemMi: 29000 })
  const s = createCluster({
    seed: o.seed ?? 42,
    preset: `L20 ${strategyLabel(strategy)}`,
    nodes: [big('node-1'), big('node-2'), big('node-3')],
    registry: ALL_API_IMAGES,
    cachedImages: [KLOPA_API_VERSIONS['1.4.1'].image],
    timings: { scheduleDelayS: 1, containerCreateS: 0, imagePullS: 4, imageCache: 'pod', probeOffsetS: 0.1, endpointPropagationS: 1 },
    versionRoles: { stable: '1.4.1', next: '2.0.0', broken: ['1.5.0'] },
  })
  const stableTpl = (labels: Record<string, string>): PodTemplate => {
    const t = rolloutTemplate('1.4.1')
    t.labels = labels
    if (o.schema) t.app.readsColumn = 'cijena'
    return t
  }
  const newTpl = (labels: Record<string, string>): PodTemplate => {
    const t = rolloutTemplate('2.0.0')
    t.labels = labels
    t.app.bugRate = o.schema ? 0 : (o.bugRate ?? 0.2)
    if (o.schema) t.app.readsColumn = 'cijena_s_pdv'
    return t
  }
  const app = { app: 'klopa-api' }
  const strategyFor = (type: 'RollingUpdate' | 'Recreate') => ({ type, maxSurge: '25%' as IntOrPercent, maxUnavailable: '25%' as IntOrPercent })
  const pd = COMPRESSED.rolloutProgressDeadline.sim
  let newTemplate: PodTemplate = newTpl(app)
  const routes = strategy === 'canary-weights' ? [{ serviceName: 'klopa-api-stable', weight: 100 }, { serviceName: 'klopa-api-canary', weight: 0 }] : null
  switch (strategy) {
    case 'recreate':
    case 'rolling':
      createDeployment(s, { name: 'klopa-api', replicas: n, template: stableTpl(app), strategy: strategyFor(strategy === 'recreate' ? 'Recreate' : 'RollingUpdate'), progressDeadlineSeconds: pd })
      createService(s, { name: 'klopa-api', selector: app })
      break
    case 'blue-green':
      createDeployment(s, { name: 'klopa-api-blue', replicas: n, template: stableTpl({ app: 'klopa-api', track: 'blue' }), progressDeadlineSeconds: pd })
      newTemplate = newTpl({ app: 'klopa-api', track: 'green' })
      createDeployment(s, { name: 'klopa-api-green', replicas: 0, template: newTemplate, progressDeadlineSeconds: pd })
      createService(s, { name: 'klopa-api', selector: { app: 'klopa-api', track: 'blue' } })
      break
    case 'canary-replicas':
    case 'canary-weights':
      createDeployment(s, { name: 'klopa-api', replicas: n, template: stableTpl({ app: 'klopa-api', track: 'stable' }), progressDeadlineSeconds: pd })
      newTemplate = newTpl({ app: 'klopa-api', track: 'canary' })
      createDeployment(s, { name: 'klopa-api-canary', replicas: 0, template: newTemplate, progressDeadlineSeconds: pd })
      createService(s, { name: 'klopa-api', selector: app })
      createService(s, { name: 'klopa-api-stable', selector: { app: 'klopa-api', track: 'stable' } })
      createService(s, { name: 'klopa-api-canary', selector: { app: 'klopa-api', track: 'canary' } })
      break
  }
  if (o.schema) s.db.columns = ['cijena']
  addTrafficStream(s, { id: 'web', serviceName: 'klopa-api', rps: o.rps ?? 20, users: o.users ?? 1000, keepAlive: o.keepAlive ?? null, routes })
  s.release = createRelease({
    strategy,
    replicas: n,
    stableVersion: '1.4.1',
    newVersion: '2.0.0',
    newTemplate,
    steps: o.steps,
    stepS: o.stepS,
    abortErrorRate: o.abortErrorRate,
    analysis: o.analysis,
    scaleDownDelayS: o.scaleDownDelayS,
  })
  warmStart(s)
  return s
}
