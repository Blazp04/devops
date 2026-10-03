/**
 * E3 Klaster – defaults, real Kubernetes values, compressed-time pairs and building blocks
 * (app behaviours, node sizes, Pod templates) shared by every preset.
 */
import type { AppBehaviour, ClusterAutoscaler, Keda, NodeSpec, PodTemplate, ProbeSpec, Probes, ResourceSpec, Timings, TrafficProfile } from './types.ts'

/** Real Kubernetes defaults (Kubernetes 1.37, October 2026) that the engine uses or labels. */
export const REAL = {
  probePeriodS: 10,
  probeTimeoutS: 1,
  probeSuccessThreshold: 1,
  probeFailureThreshold: 3,
  probeInitialDelayS: 0,
  terminationGracePeriodS: 30,
  crashBackoffInitialS: 10,
  crashBackoffMaxS: 300,
  /** back-off resets after the container ran this long (2 × max) */
  crashBackoffResetS: 600,
  /** kube-controller-manager --node-monitor-grace-period (50 s since 1.32) */
  nodeMonitorGraceS: 50,
  /** default not-ready/unreachable toleration added to every Pod */
  podEvictionTolerationS: 300,
  /** attach/detach controller force-detaches after a Pod deletion has not succeeded for 6 min on an unhealthy node */
  forceDetachS: 360,
  progressDeadlineS: 600,
  revisionHistoryLimit: 10,
  maxSurge: '25%' as const,
  maxUnavailable: '25%' as const,
  hpaSyncS: 15,
  hpaTolerance: 0.1,
  hpaScaleDownWindowS: 300,
  hpaScaleUpWindowS: 0,
  hpaCpuInitializationS: 300,
  /** metrics-server --metric-resolution in the official manifest */
  metricResolutionS: 15,
  caScanS: 10,
  caUtilizationThreshold: 0.5,
  caUnneededS: 600,
  caDelayAfterAddS: 600,
  caMaxNodeProvisionS: 900,
  kedaPollingS: 30,
  kedaCooldownS: 300,
  housekeepingS: 10,
  evictionMemoryAvailableMi: 100,
  maxPods: 110,
  sessionAffinityTimeoutS: 10800,
  endpointPropagationNote: 'asinkrono, obično ispod sekunde do nekoliko sekundi',
} as const

/**
 * A value shortened for class next to its real default, for badges like "20 s (sim) · stvarno: 5 min".
 * Same shape as the other engines' timing values (sim/simValue, real/realValue, label, compressed).
 */
export interface Compressed {
  sim: number
  /** same as `sim` (field name shared with the other engines) */
  simValue: number
  /** real value in seconds, or null when it is not a single number */
  real: number | null
  /** same as `real` */
  realValue: number | null
  unit: 's'
  /** text used instead of a number for the real value (e.g. "minute, ovisi o oblaku") */
  realText?: string
  /** what it is (Croatian) */
  what: string
  /** ready-made badge, e.g. "20 s (sim) · stvarno: 5 min" */
  label: string
  /** true when the sim value differs from the real default */
  compressed: boolean
}

function cv(sim: number, real: number | null, what: string, realText?: string): Compressed {
  const c: Compressed = { sim, simValue: sim, real, realValue: real, unit: 's', what, label: '', compressed: real !== sim }
  if (realText !== undefined) c.realText = realText
  c.label = compressedLabel(c)
  return c
}

export const COMPRESSED = {
  nodeMonitorGrace: cv(10, REAL.nodeMonitorGraceS, 'čvor proglašen NotReady nakon izostanka javljanja'),
  podEvictionToleration: cv(20, REAL.podEvictionTolerationS, 'Podovi s nedostupnog čvora označeni za brisanje'),
  forceDetach: cv(24, REAL.forceDetachS, 'prisilno odspajanje diska s nedostupnog čvora'),
  pressureTransition: cv(30, 300, 'čvor ostaje pod pritiskom memorije'),
  rolloutReadinessPeriod: cv(2, REAL.probePeriodS, 'readinessProbe.periodSeconds u YAML-u'),
  rolloutProgressDeadline: cv(60, REAL.progressDeadlineS, 'progressDeadlineSeconds u YAML-u'),
  /** L12 may compress probe periods ×5 (10 s → 2 s) */
  probePeriod: cv(2, REAL.probePeriodS, 'periodSeconds provjere'),
  caProvision: cv(75, null, 'novi čvor spreman', 'minute, ovisi o oblaku'),
  l10LoopTick: cv(10, null, 'jedan prolaz petlje usklađivanja', 'sekunde'),
  /** L10 day clock: 1 s of simulation = 1 minute of the day (a 10 s loop pass = 10 day-minutes) */
  l10DayMinute: cv(1, 60, 'jedna minuta dana na satu L10', '1 min dana'),
  /** L18 'dnevni val' (TRAFFIC_PRESETS.daily): one day squeezed into 1200 s */
  l18Day: cv(1200, 86400, 'jedan dan dnevnog vala prometa'),
} satisfies Record<string, Compressed>

/**
 * Fluid latency estimate of L18 (labelled as an M/M/1 approximation in the UI). The validated SIM 4 timeline
 * („≈ 5 s” at saturation) and the prototype use the cap 0,99; sim-models' parameter list and the L18 model text
 * say 0,95. Show `latencyFormulaText(cap)` next to the number so the badge always matches what is computed.
 */
export const LATENCY_MODEL = { baseMs: 50, rhoCap: 0.99 } as const

/** "≈ 50 ms / (1 − min(ρ; 0,99)) · aproksimacija M/M/1" */
export function latencyFormulaText(m: { baseMs: number; rhoCap: number } = LATENCY_MODEL): string {
  return `≈ ${String(m.baseMs).replace('.', ',')} ms / (1 − min(ρ; ${String(m.rhoCap).replace('.', ',')})) · aproksimacija M/M/1`
}

/**
 * Graceful shutdown of klopa-api in the L13/L14/L20 presets (keeps serving this long after SIGTERM, then exits).
 * The validated SIM 5 durations (28 / 51 / 46 / 17 s) come from the prototype's grace of 5 s; sim-models' timing
 * list says 2 s. presetRollout({ drainS }) switches it; label the value the UI shows with this constant.
 */
export const ROLLOUT_DRAIN_S = 5

/** Simulated wall clock for annotations and log timestamps (t = 0 is 1. 10. 2026. 12:00:00 UTC). */
export const SIM_EPOCH_MS = Date.UTC(2026, 9, 1, 12, 0, 0)

/** Secret used by klopa-api's DB_PASSWORD (L16/L23/L24). */
export const KLOPA_SECRET = 'klopa-secrets'
export const DB_PASSWORD_KEY = 'DB_PASSWORD'

/** L19 badge for a sudden node failure (toleration + force detach). */
export const NODE_FAILURE_BADGE = `${formatSeconds(COMPRESSED.podEvictionToleration.sim)} (sim) · stvarno: ≈ ${REAL.nodeMonitorGraceS} s + 5 min + do 6 min; StatefulSet čeka potvrdu da je čvor ugašen`

/** "20 s (sim) · stvarno: 5 min" */
export function compressedLabel(c: Pick<Compressed, 'sim' | 'real' | 'realText'>): string {
  const real = c.real === null ? (c.realText ?? '?') : formatSeconds(c.real)
  return `${formatSeconds(c.sim)} (sim) · stvarno: ${real}`
}

/** Croatian duration: 0,5 s · 45 s · 5 min · 6 min · 2 h 30 min */
export function formatSeconds(s: number): string {
  if (s < 60) return `${String(Math.round(s * 10) / 10).replace('.', ',')} s`
  if (s < 3600) {
    const m = Math.floor(s / 60)
    const r = Math.round(s - m * 60)
    return r ? `${m} min ${r} s` : `${m} min`
  }
  const h = Math.floor(s / 3600)
  const m = Math.round((s - h * 3600) / 60)
  return m ? `${h} h ${m} min` : `${h} h`
}

export const DEFAULT_TIMINGS: Timings = {
  dt: 0.1,
  scheduleDelayS: 1,
  containerCreateS: 1,
  imagePullS: 3,
  imageCache: 'node',
  imagePullFailS: 1,
  kubeletSyncS: 1,
  probeOffsetS: 0.1,
  backoffInitialS: REAL.crashBackoffInitialS,
  backoffMaxS: REAL.crashBackoffMaxS,
  endpointPropagationS: 1,
  nodeMonitorGraceS: REAL.nodeMonitorGraceS,
  podEvictionTolerationS: REAL.podEvictionTolerationS,
  forceDetachS: REAL.forceDetachS,
  attachS: 1,
  provisionVolumeS: 2,
  housekeepingS: REAL.housekeepingS,
  pressureTransitionS: 300,
  watchDelayS: [0, 0],
  requestTravelS: 0.4,
  requestTimeoutS: 5,
}

/** Classroom-compressed node-failure timings (labelled with COMPRESSED.*). */
export const COMPRESSED_FAILURE_TIMINGS: Partial<Timings> = {
  nodeMonitorGraceS: COMPRESSED.nodeMonitorGrace.sim,
  podEvictionTolerationS: COMPRESSED.podEvictionToleration.sim,
  forceDetachS: COMPRESSED.forceDetach.sim,
  pressureTransitionS: COMPRESSED.pressureTransition.sim,
}

// ---------------------------------------------------------------- app behaviour

export function appBehaviour(over: Partial<AppBehaviour> = {}): AppBehaviour {
  return {
    version: '1.3.2',
    bootS: 1,
    warmS: 6,
    crashAfterS: null,
    exitCode: 1,
    neverReady: false,
    hangAfterS: null,
    dependsOnDb: false,
    bugRate: 0,
    sigterm: 'drain',
    drainS: 5,
    cpuPerRequestMs: 25,
    cpuDemandM: 10,
    memMi: 180,
    memGrowthMiPerS: 0,
    database: false,
    readsColumn: null,
    ...over,
  }
}

export const REGISTRY = 'registry.klopa.example'
export const API_IMAGE = `${REGISTRY}/klopa-api`

/** klopa-api builds used across lectures (version chain from the course story). */
export const KLOPA_API_VERSIONS = {
  '1.3.2': { image: `${API_IMAGE}:1.3.2`, app: appBehaviour({ version: '1.3.2' }) },
  '1.4.0': { image: `${API_IMAGE}:1.4.0`, app: appBehaviour({ version: '1.4.0' }) },
  '1.4.1': { image: `${API_IMAGE}:1.4.1`, app: appBehaviour({ version: '1.4.1' }) },
  /** crashes 2 s after every start (exit 1) → CrashLoopBackOff */
  '1.5.0-crash': { image: `${API_IMAGE}:1.5.0`, app: appBehaviour({ version: '1.5.0', crashAfterS: 2, exitCode: 1 }) },
  /** starts but readiness never passes */
  '1.5.0-never-ready': { image: `${API_IMAGE}:1.5.0`, app: appBehaviour({ version: '1.5.0', neverReady: true }) },
  /** VAT bug: 20 % of requests fail (L20) */
  '2.0.0': { image: `${API_IMAGE}:2.0.0`, app: appBehaviour({ version: '2.0.0', bugRate: 0.2 }) },
  '2.0.1': { image: `${API_IMAGE}:2.0.1`, app: appBehaviour({ version: '2.0.1' }) },
} satisfies Record<string, { image: string; app: AppBehaviour }>

export type KlopaApiVersion = keyof typeof KLOPA_API_VERSIONS

/** L12 behaviour segment: zdrava / spori start 40 s / ruši se pri pokretanju / zaglavi nakon 60 s / ovisi o bazi */
export const L12_BEHAVIOURS = {
  healthy: appBehaviour({ version: '1.3.2', bootS: 1, warmS: 5 }),
  slowStart: appBehaviour({ version: '1.3.2', bootS: 40, warmS: 40 }),
  crashOnStart: appBehaviour({ version: '1.3.2', bootS: 1, warmS: 5, crashAfterS: 2, exitCode: 1 }),
  hangsAfter60: appBehaviour({ version: '1.3.2', bootS: 1, warmS: 5, hangAfterS: 60, sigterm: 'ignore' }),
  dependsOnDb: appBehaviour({ version: '1.3.2', bootS: 1, warmS: 5, dependsOnDb: true }),
} satisfies Record<string, AppBehaviour>

export type L12Behaviour = keyof typeof L12_BEHAVIOURS

// ---------------------------------------------------------------- probes

export function probe(path: ProbeSpec['path'], over: Partial<ProbeSpec> = {}): ProbeSpec {
  return {
    path,
    initialDelaySeconds: REAL.probeInitialDelayS,
    periodSeconds: REAL.probePeriodS,
    timeoutSeconds: REAL.probeTimeoutS,
    successThreshold: REAL.probeSuccessThreshold,
    failureThreshold: REAL.probeFailureThreshold,
    ...over,
  }
}

export const NO_PROBES: Probes = { startup: null, liveness: null, readiness: null }

// ---------------------------------------------------------------- nodes

export function nodeSpec(name: string, over: Partial<NodeSpec> = {}): NodeSpec {
  return {
    name,
    cpuM: 2000,
    memMi: 8192,
    allocatableCpuM: 1930,
    allocatableMemMi: 6249,
    daemonSetCpuM: 100,
    daemonSetMemMi: 200,
    maxPods: REAL.maxPods,
    ...over,
  }
}

/** SIM 3 nodes (GKE allocatable formula, labelled as an example; DaemonSet block 100m/200Mi). */
export const SCHEDULER_NODES: NodeSpec[] = [
  nodeSpec('node-1', { cpuM: 2000, memMi: 4096, allocatableCpuM: 1930, allocatableMemMi: 2972 }),
  nodeSpec('node-2', { cpuM: 4000, memMi: 16384, allocatableCpuM: 3920, allocatableMemMi: 13622 }),
  nodeSpec('node-3', { cpuM: 2000, memMi: 8192, allocatableCpuM: 1930, allocatableMemMi: 6249 }),
]

/** SIM 4 node: 2 vCPU / 8 GiB → 1930m / 6249Mi allocatable, DaemonSets 200m / 300Mi → 3 klopa-api Pods per node. */
export const HPA_NODE = nodeSpec('node', { cpuM: 2000, memMi: 8192, allocatableCpuM: 1930, allocatableMemMi: 6249, daemonSetCpuM: 200, daemonSetMemMi: 300 })

// ---------------------------------------------------------------- templates

export function resources(reqCpuM?: number, reqMemMi?: number, limCpuM?: number, limMemMi?: number): ResourceSpec {
  const r: ResourceSpec = { requests: {}, limits: {} }
  if (reqCpuM !== undefined) r.requests.cpuM = reqCpuM
  if (reqMemMi !== undefined) r.requests.memMi = reqMemMi
  if (limCpuM !== undefined) r.limits.cpuM = limCpuM
  if (limMemMi !== undefined) r.limits.memMi = limMemMi
  return r
}

export function podTemplate(over: Partial<PodTemplate> & { image: string; labels: Record<string, string> }): PodTemplate {
  return {
    app: appBehaviour(),
    resources: resources(100, 128),
    probes: { ...NO_PROBES },
    terminationGracePeriodSeconds: REAL.terminationGracePeriodS,
    preStopSleepS: 0,
    volumes: [],
    dataVolume: null,
    priority: 0,
    nodeSelector: {},
    tolerations: [],
    missingSecret: false,
    env: {},
    changeCause: '',
    annotations: {},
    ...over,
  }
}

/** klopa-api Pod template for a version from the story chain. */
export function klopaApiTemplate(version: KlopaApiVersion, over: Partial<PodTemplate> = {}): PodTemplate {
  const v = KLOPA_API_VERSIONS[version]
  return podTemplate({
    labels: { app: 'klopa-api' },
    image: v.image,
    app: { ...v.app },
    ...over,
  })
}

export function defaultAutoscaler(over: Partial<ClusterAutoscaler> = {}): ClusterAutoscaler {
  return {
    enabled: true,
    minNodes: 2,
    maxNodes: 6,
    scanIntervalS: REAL.caScanS,
    provisionS: COMPRESSED.caProvision.sim,
    utilizationThreshold: REAL.caUtilizationThreshold,
    unneededS: REAL.caUnneededS,
    delayAfterAddS: REAL.caDelayAfterAddS,
    template: HPA_NODE,
    lastScaleUpAt: null,
    nextIndex: 3,
    namePrefix: 'node-',
    ...over,
  }
}

export function defaultKeda(over: Partial<Keda> = {}): Keda {
  return {
    enabled: true,
    deployment: 'klopa-worker',
    namespace: 'klopa',
    queueLength: 0,
    arrivalRate: 0,
    perWorkerRate: 2,
    targetQueueLength: 10,
    activationQueueLength: 0,
    pollingIntervalS: REAL.kedaPollingS,
    cooldownS: REAL.kedaCooldownS,
    minReplicaCount: 0,
    maxReplicaCount: 10,
    lastActiveAt: null,
    lastPollAt: -Infinity,
    hpaName: 'keda-hpa-klopa-worker',
    totals: { published: 0, processed: 0 },
    unacked: 0,
    profile: null,
    profileT0: 0,
    ...over,
  }
}

/**
 * KEDA queue day (setQueueProfile): no orders for the first 300 s („noć”), 3 messages/s until 900 s, then night again
 * – a true zero, so the worker can go to 0 at night and wake on the first morning message.
 */
export const QUEUE_DAY = { kind: 'spike', base: 0, peak: 3, startS: 300, endS: 900 } as const satisfies TrafficProfile
