/**
 * E3 Klaster – public API. Pure TypeScript (no React/DOM); plug into useSimulation({ init, step }).
 * See README.md for the full guide.
 */
export type * from './types.ts'

export { createCluster, stepCluster, advance, runUntil, processTick, warmStart, resolveConfig, seriesFor, dbEffectiveUp } from './core.ts'
export type { ClusterInit } from './core.ts'

export {
  REAL,
  COMPRESSED,
  COMPRESSED_FAILURE_TIMINGS,
  NODE_FAILURE_BADGE,
  DEFAULT_TIMINGS,
  compressedLabel,
  formatSeconds,
  appBehaviour,
  probe,
  NO_PROBES,
  nodeSpec,
  resources,
  podTemplate,
  klopaApiTemplate,
  KLOPA_API_VERSIONS,
  L12_BEHAVIOURS,
  SCHEDULER_NODES,
  HPA_NODE,
  API_IMAGE,
  REGISTRY,
  defaultAutoscaler,
  defaultKeda,
  QUEUE_DAY,
  LATENCY_MODEL,
  latencyFormulaText,
  ROLLOUT_DRAIN_S,
  KLOPA_SECRET,
  DB_PASSWORD_KEY,
} from './config.ts'
export type { Compressed, KlopaApiVersion, L12Behaviour } from './config.ts'

export {
  presetControlPlane,
  presetPodHealth,
  presetRollout,
  presetService,
  presetScheduler,
  presetAutoscaling,
  presetStorage,
  rolloutTemplate,
  cardTemplate,
  SCHEDULER_CARDS,
  TRAFFIC_PRESETS,
  ROLLOUT_READINESS,
  WRONG_TAG_IMAGE,
  WORKER_IMAGE,
  WEB_IMAGE,
  POSTGRES_IMAGE,
  NEXT_VERSION,
  storyRoles,
  SMALL_ROLLOUT_NODES,
  API_BURSTABLE_CARD,
  addPostgresDeployment,
  postgresTemplate,
} from './presets.ts'
export { presetRelease } from './presets.ts'
export type { ControlPlaneOptions, PodHealthOptions, RolloutOptions, SchedulerOptions, SchedulerCard, AutoscalingOptions, StorageOptions, ReleaseOptions } from './presets.ts'
export {
  startRelease,
  rollbackRelease,
  nextCanaryStep,
  releaseStats,
  migrateSchema,
  canaryReplicasFor,
  replicaSharePct,
  strategyLabel,
  createRelease,
  LANE,
  DEFAULT_CANARY_STEPS,
} from './release.ts'
export type { ReleaseStats, SchemaChange, ReleaseInit, ReleaseActionResult } from './release.ts'

export * from './actions.ts'

export { createPodObject, deletePodObject, forceDeletePod, podStatus, podReadyColumn, podRestartsColumn, humanDuration, apiPod, apiStatusStale } from './pods.ts'
export { addNode, findNode, removeNodeObject, UNREACHABLE, NOT_READY, OUT_OF_SERVICE, DRAIN_UNMANAGED, DRAIN_LOCAL_STORAGE } from './nodes.ts'
export { probeAnswer, serveAnswer, cfsLatencyMs, waterFill, waterFillLevel, memoryAvailable, nodeMemoryUsage, resizeFit, isHung, dbAuthFails } from './kubelet.ts'
export type { CfsResult } from './kubelet.ts'
export { explainScheduling, filterNode, scoreNode, failedSchedulingMessage, requestedOnNode, schedulableUniverse, NONZERO_CPU_M, NONZERO_MEM_MI } from './scheduler.ts'
export type { FilterResult, ScoreResult, SchedulingExplanation, NodeExplanation, NodeRequested } from './scheduler.ts'
export { rankForDeletion, replicaSetStatus, podsOfReplicaSet } from './replicaset.ts'
export type { ReplicaSetStatus } from './replicaset.ts'
export {
  fenceposts,
  scaledValue,
  validateStrategy,
  createDeployment,
  findDeployment,
  findNewReplicaSet,
  replicaSetsOf,
  rolloutHistory,
  rolloutUndo,
  pauseRollout,
  resumeRollout,
  updateTemplate,
  setStrategy,
  calcStatus,
  deploymentComplete,
} from './rollout.ts'
export type { RevisionInfo } from './rollout.ts'
export { createStatefulSet, findStatefulSet, claimName } from './statefulset.ts'
export { createPvc, findPvc, podsUsingPvc, podOrders } from './storage.ts'
export { createService, findService, getEndpointSlice, getProxyEndpoints, pickEndpoint, resolveDns, dnsCandidates, selectedPods, setServiceType, tracePacket, NODE_PORT_RANGE, CLUSTER_DOMAIN, NDOTS } from './service.ts'
export type { DnsAnswer, PacketHop } from './service.ts'
export { createTimeline, act, stepTimeline, seek, rewindTo, timelineTime, timelineIsLive, timelineMarks } from './replay.ts'
export type { Timeline, TimelineAction } from './replay.ts'
export {
  addTrafficStream,
  profileRate,
  streamRate,
  requestStats,
  redMetrics,
  fluidStats,
  serviceStats,
  trafficTotals,
  distinctUsersHit,
  hitShares,
  openConnections,
  pickRoute,
  setTrafficClient,
  setTrafficTarget,
  setTrafficRoutes,
  sendRequest,
  markWindow,
  windowStats,
  inFlightAt,
  P95_FACTOR,
  MAX_IN_FLIGHT,
  MAX_WINDOWS,
} from './traffic.ts'
export type { RequestStats, TrafficStreamOptions, TrafficClient, WindowStats } from './traffic.ts'
export { createHpa, defaultBehavior, hpaFormula, scrapeMetrics, syncHpa } from './hpa.ts'
export { pendingUnschedulable } from './autoscaler.ts'
export { publishMessages, setQueueArrivalRate, setQueueProfile, kedaQueueMetric, kedaArrivalRate } from './keda.ts'
export {
  formatTable,
  kubectlGetPods,
  kubectlGetNodes,
  kubectlGetDeployments,
  kubectlGetReplicaSets,
  kubectlGetEndpointSlices,
  kubectlGetEvents,
  kubectlGetHpa,
  kubectlGetPvc,
  kubectlGetServices,
  kubectlDescribePod,
  nodeStatusText,
  podView,
  podShapeStatus,
  podShapeView,
  nodeFrameStatus,
  versionTone,
  versionToneFor,
  VERSION_TONE,
  activeMessages,
  messageChain,
  kubectlLogs,
  podLeadTime,
  nodeView,
  deploymentView,
  messageProgress,
  requestProgress,
  crashLoopDelays,
  statusCounts,
  podByIp,
  clusterCost,
  KUBERNETES_VERSION,
} from './views.ts'
export type { PodView, ProbeLane, NodeView, DeploymentView, PodShapeStatus, VersionColour } from './views.ts'
export { qosClass, oomScoreAdj, effectiveRequests, templateHash, matches, isActive, isReady, isAvailable, safeCount, goDuration, renderTime, hrCount, PODS, API_REFUSED, ETCD_TIMEOUT } from './util.ts'

export * as desiredState from './desired-state.ts'
