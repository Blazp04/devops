/**
 * E3 Klaster – shared types.
 *
 * Units: time in seconds of simulated time, CPU in millicores (m), memory in MiB (Mi).
 * All entities carry stable string ids so UIs can animate them across frames.
 */
import type { Rng, Series } from '../../kit/sim/math.ts'

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral'

/** Croatian, human-readable log line for the kit's EventLog. */
export interface ClusterEvent {
  /** stable id (use as React key: identical texts can occur in one tick) */
  id: string
  t: number
  kind: string
  text: string
  tone: Tone
  /** Id of the object the event is about (pod/node/deployment id), for highlighting. */
  objectId?: string
  /** L10 day clock „03:00” (desired-state model only; the text never repeats it) */
  clock?: string
}

/** A `kubectl get events`-style record (English reason/message, like the real API). */
export interface KubeEvent {
  /** last seen */
  t: number
  firstT: number
  type: 'Normal' | 'Warning'
  reason: string
  /** e.g. "pod/klopa-api-7c9d8-x2kq" */
  object: string
  message: string
  count: number
}

export type ComponentName = 'apiServer' | 'etcd' | 'scheduler' | 'controllerManager'

/** Endpoint of an animated control-plane message (L11). kubelet/runtime ids carry the node name. */
export type Actor = 'kubectl' | 'apiserver' | 'etcd' | 'scheduler' | 'controller-manager' | `kubelet:${string}` | `runtime:${string}`

export interface ControlPlaneMessage {
  id: string
  /** Lecture step number 1–6 (Put jedne izjave), 0 = other traffic (watch notification, ack). */
  step: number
  from: Actor
  to: Actor
  /** Short Croatian label, e.g. "stvori Pod". */
  label: string
  /** start time; may lie slightly in the future (a write is visible only after the etcd ack) – see activeMessages() */
  t0: number
  duration: number
  /** the message this one answers or follows (kubectl → API → etcd → ack chain); null = a watch notification or a new action */
  parentId: string | null
  /** Name of the Pod the message is about (create / bind / start / status and their watch notifications); absent otherwise. */
  object?: string
}

// ---------------------------------------------------------------- resources

export interface Resources {
  /** millicores; undefined = not set */
  cpuM?: number
  /** MiB; undefined = not set */
  memMi?: number
}

export interface ResourceSpec {
  requests: Resources
  limits: Resources
}

export type QosClass = 'Guaranteed' | 'Burstable' | 'BestEffort'

// ---------------------------------------------------------------- app behaviour (what the code in the image does)

/** Simulated behaviour of the process inside the container image. */
export interface AppBehaviour {
  /** Version shown on traffic dots (1.3.2 blue, 1.4.0 violet, 1.5.0 rose). */
  version: string
  /** Seconds after container start until the process answers HTTP at all (/healthz). */
  bootS: number
  /** Seconds after container start until warmed up (/ready OK, real requests succeed). ≥ bootS. */
  warmS: number
  /** Process exits by itself this many seconds after each start (crash). null = never. */
  crashAfterS: number | null
  exitCode: number
  /** /ready never succeeds and real requests fail (broken build that never becomes ready). */
  neverReady: boolean
  /** Deadlock this many seconds after each start: process alive, every endpoint times out. */
  hangAfterS: number | null
  /** Order requests and /ready-db need the shared database. */
  dependsOnDb: boolean
  /** Share of otherwise successful requests answered with HTTP 500 (a bug). */
  bugRate: number
  /** SIGTERM handling: keep serving for drainS then exit, exit immediately, or ignore (SIGKILL after grace). */
  sigterm: 'drain' | 'exit' | 'ignore'
  drainS: number
  /** CPU time per request (fluid traffic model, HPA). */
  cpuPerRequestMs: number
  /** CPU demand when idle / fixed demand (L17 usage cards). */
  cpuDemandM: number
  /** Memory working set right after start. */
  memMi: number
  /** Memory growth (leak), MiB per second. */
  memGrowthMiPerS: number
  /** Database (L19): requests are writes ("narudžbe") into the data directory; the data dir is exclusively locked. */
  database: boolean
  /**
   * Column of the shared database this version reads (L20 expand/contract, e.g. 'cijena' vs 'cijena_s_pdv').
   * If the column does not exist, order requests fail with HTTP 500. null = no schema dependency.
   */
  readsColumn: string | null
}

// ---------------------------------------------------------------- probes

export type ProbePath = '/healthz' | '/ready' | '/ready-db'
export type ProbeKind = 'startup' | 'liveness' | 'readiness'

export interface ProbeSpec {
  path: ProbePath
  initialDelaySeconds: number
  periodSeconds: number
  timeoutSeconds: number
  successThreshold: number
  failureThreshold: number
}

export interface Probes {
  startup: ProbeSpec | null
  liveness: ProbeSpec | null
  readiness: ProbeSpec | null
}

export interface ProbeResult {
  t: number
  ok: boolean
  /** 'ok' | 'http503' | 'timeout' | 'refused' */
  detail: 'ok' | 'http503' | 'timeout' | 'refused'
}

export interface ProbeState {
  nextAt: number
  successes: number
  failures: number
  /** last results (newest last), capped – for probe lanes ✓/✕ */
  history: ProbeResult[]
}

// ---------------------------------------------------------------- scheduling bits

export type TaintEffect = 'NoSchedule' | 'NoExecute' | 'PreferNoSchedule'
export interface Taint {
  key: string
  value?: string
  effect: TaintEffect
  addedAt: number
}
export interface Toleration {
  key?: string
  operator?: 'Exists' | 'Equal'
  value?: string
  effect?: TaintEffect
  tolerationSeconds?: number
}

export type VolumeSpec = { name: string; kind: 'emptyDir' } | { name: string; kind: 'pvc'; claimName: string }

/** Container env value: a literal or `valueFrom.secretKeyRef` (resolved by the kubelet when the container is created). */
export type EnvValue = string | { secretRef: string; key: string }

/** A Secret object (data in plain text – this is a simulation); version increments on every change. */
export interface SecretObject {
  name: string
  namespace: string
  data: Record<string, string>
  version: number
}

export interface PodTemplate {
  labels: Record<string, string>
  /** Full image reference, e.g. registry.klopa.example/klopa-api:1.4.0 */
  image: string
  app: AppBehaviour
  resources: ResourceSpec
  probes: Probes
  terminationGracePeriodSeconds: number
  /** lifecycle.preStop sleep (seconds), 0 = none */
  preStopSleepS: number
  volumes: VolumeSpec[]
  /** Name of the volume mounted at the app's data directory (databases). null = container filesystem. */
  dataVolume: string | null
  priority: number
  nodeSelector: Record<string, string>
  tolerations: Toleration[]
  /**
   * Shortcut for a broken Secret reference without modelling env (CreateContainerConfigError):
   * true / 'secret' = Secret klopa-secrets does not exist; 'key' = the Secret exists but key DB_PASSWORD does not.
   * Prefer `env` with a `secretRef` – the kubelet then resolves it against `s.secrets` (same messages).
   */
  missingSecret: boolean | 'secret' | 'key'
  /** Container env (part of the template: changing it creates a new ReplicaSet). */
  env: Record<string, EnvValue>
  /** kubernetes.io/change-cause annotation (copied to the ReplicaSet). */
  changeCause: string
  /** Pod template annotations (part of the template: `kubectl rollout restart` sets kubectl.kubernetes.io/restartedAt). */
  annotations: Record<string, string>
}

export interface OwnerRef {
  kind: 'ReplicaSet' | 'StatefulSet'
  id: string
  name: string
}

// ---------------------------------------------------------------- pods

export type PodPhase = 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown'

export interface ContainerStatus {
  state: 'waiting' | 'running' | 'terminated'
  /** waiting: ContainerCreating | ErrImagePull | ImagePullBackOff | CrashLoopBackOff | CreateContainerConfigError; terminated: Error | OOMKilled | Completed */
  reason: string
  message: string
  exitCode: number | null
  startedAt: number | null
  finishedAt: number | null
  restartCount: number
  lastRestartAt: number | null
  lastTermination: { reason: string; exitCode: number; finishedAt: number } | null
  /** Increments on every (re)start – identifies the container's writable layer. */
  instance: number
  ready: boolean
  /** startup probe passed (or none) */
  started: boolean
}

/** kubelet-internal per-pod bookkeeping. */
export interface KubeletPodState {
  stage: 'admit' | 'volumes' | 'config' | 'pulling' | 'pull-backoff' | 'creating' | 'running' | 'exited' | 'backoff' | 'stopping' | 'stopped'
  /** time when the current stage ends (pulling/creating/backoff/stopping) */
  until: number
  /** current pull attempt will fail (image not in the registry) */
  pullWillFail: boolean
  /** process exits by itself at this time (crash, lock conflict) */
  crashAt: number | null
  crashMessage: string
  /** process deadlocks at this time */
  hangAt: number | null
  /** exit code if the stop ends in SIGKILL */
  killedBySigkill: boolean
  imageBackoff: { delay: number; lastUpdate: number } | null
  crashBackoff: { delay: number; lastUpdate: number } | null
  probes: Record<ProbeKind, ProbeState>
  /** When the stop sequence started and why. */
  stopReason: 'delete' | 'liveness' | 'startup' | 'image-change' | null
  /** SIGTERM is delivered at this time (after preStop). */
  sigtermAt: number
  /** Process stopped answering requests (exit or drain end). */
  stoppedServingAt: number | null
  /** Pod admitted by kubelet (bound + seen). */
  startTime: number | null
  /** Image pulled for the current attempt. */
  imageReady: boolean
}

export interface PodUsage {
  /** CPU demand (millicores) before limits/contention */
  cpuDemandM: number
  /** CPU actually received last second */
  cpuM: number
  /** share of demand removed by the CPU limit (CFS throttling) 0..1 */
  throttledPct: number
  /** share of demand lost to node contention 0..1 */
  contentionPct: number
  memMi: number
  /** override of AppBehaviour.memGrowthMiPerS (L17 "Curenje memorije") */
  memGrowthMiPerS: number | null
  /** override of AppBehaviour.cpuDemandM (L17 usage sliders) */
  cpuDemandOverrideM: number | null
  /** override of base memory (L17 usage sliders) */
  memBaseOverrideMi: number | null
  /**
   * CPU the container could have used last second (limit, node headroom and contention; the water-fill level):
   * the capacity the fluid latency estimate divides by. Equals cpuM for a Pod starved by its neighbours.
   */
  cpuCapacityM: number
}

export interface Pod {
  id: string
  name: string
  namespace: string
  labels: Record<string, string>
  owner: OwnerRef | null
  spec: PodTemplate
  nodeName: string | null
  ip: string | null
  createdAt: number
  /** Not handed to the scheduler before this time (scheduling latency + watch delay). */
  scheduleAfter: number
  boundAt: number | null
  phase: PodPhase
  /** pod.status.reason, e.g. 'Evicted' */
  reason: string
  message: string
  scheduled: { status: boolean | null; reason: string; message: string; lastAttemptGen: number }
  /** Pod Ready condition (with lastTransitionTime) */
  ready: { status: boolean; since: number }
  container: ContainerStatus
  kubelet: KubeletPodState
  /** deletionTimestamp + grace */
  deletion: { at: number; graceS: number; reason: string } | null
  /** The process really runs (independent of what the API says, e.g. dead node). */
  processUp: boolean
  /** Process began at (current instance) – for app timing. */
  processStartedAt: number | null
  usage: PodUsage
  /** per-second CPU samples (m) for metrics-server (last 15) */
  cpuSamples: number[]
  ordinal: number | null
  /** Template hash label value (Deployment pods). */
  templateHash: string | null
  /** Data store id the database process writes to (L19). */
  dataStoreId: string | null
  /** L14 "Podu padne readiness": false → /ready and /ready-db answer 503 (null = app decides) */
  readyOverride: boolean | null
  stats: { served: number; failed: number }
  /** Deterministic order of creation (tie-breaks) */
  seq: number
  /**
   * Status as last written to the API (what kubectl shows). While the API server or etcd is down the kubelet
   * cannot write, so this snapshot is frozen; null = the API is up and the live status is the reported one.
   */
  apiStatus: PodApiStatus | null
  /** env values the current container was created with (secretKeyRef resolved at container creation) */
  envResolved: Record<string, string>
  /** Secret versions captured at container creation (name → version) */
  envSecretVersions: Record<string, number>
  /** container stdout lines (newest last, capped) for `kubectl logs` */
  logs: PodLogLine[]
  /** lead-time stamps (L18 "Podovi u sekundama, čvorovi u minutama") */
  timeline: PodTimeline
  /** in-place resize (1.35 resize subresource) waiting for room on the node */
  resize: PodResize | null
}

export interface PodApiStatus {
  phase: PodPhase
  reason: string
  message: string
  ready: { status: boolean; since: number }
  container: ContainerStatus
}

export interface PodLogLine {
  t: number
  /** container instance (1 = first start) – `kubectl logs --previous` shows instance − 1 */
  instance: number
  line: string
}

export interface PodTimeline {
  createdAt: number
  /** first FailedScheduling (Unschedulable) */
  unschedulableAt: number | null
  /** Cluster Autoscaler TriggeredScaleUp for this Pod */
  scaleUpTriggeredAt: number | null
  boundAt: number | null
  /** image present (pulled or already cached) for the first start */
  pulledAt: number | null
  /** first container start */
  startedAt: number | null
  /** first Ready */
  readyAt: number | null
}

export interface PodResize {
  status: 'Deferred' | 'Infeasible'
  desired: ResourceSpec
  message: string
  since: number
}

// ---------------------------------------------------------------- nodes

export interface NodeSpec {
  name: string
  /** capacity */
  cpuM: number
  memMi: number
  allocatableCpuM: number
  allocatableMemMi: number
  /** DaemonSet block (requests == usage) */
  daemonSetCpuM: number
  daemonSetMemMi: number
  maxPods: number
  labels?: Record<string, string>
  /** images present at start */
  images?: string[]
}

export interface Node {
  id: string
  name: string
  index: number
  capacity: { cpuM: number; memMi: number; pods: number }
  allocatable: { cpuM: number; memMi: number; pods: number }
  daemonSet: { cpuM: number; memMi: number }
  labels: Record<string, string>
  taints: Taint[]
  unschedulable: boolean
  machine: 'running' | 'off' | 'provisioning'
  kubeletUp: boolean
  provisionReadyAt: number | null
  lastHeartbeat: number
  condition: { ready: 'True' | 'False' | 'Unknown'; since: number }
  memoryPressure: { status: boolean; since: number }
  images: Record<string, true>
  nextIp: number
  createdAt: number
  /** Cluster Autoscaler bookkeeping */
  ca: { managed: boolean; unneededSince: number | null; removing: boolean }
  /** kernel/kubelet memory accounting of non-pod usage beyond the reservation (L17 break-it) */
  extraSystemMemMi: number
  /** time the node (last) became Ready */
  readyAt: number
}

// ---------------------------------------------------------------- workloads

export type IntOrPercent = number | `${number}%`

export interface ReplicaSet {
  id: string
  name: string
  namespace: string
  selector: Record<string, string>
  template: PodTemplate
  replicas: number
  owner: { kind: 'Deployment'; id: string; name: string } | null
  revision: number
  templateHash: string
  createdAt: number
  seq: number
  /** deployment.kubernetes.io/desired-replicas and max-replicas annotations */
  desiredAnnotation: number | null
  maxAnnotation: number | null
  changeCause: string
}

export interface DeploymentCondition {
  status: 'True' | 'False' | 'Unknown'
  reason: string
  message: string
  lastUpdate: number
  lastTransition: number
}

export interface DeploymentStatus {
  replicas: number
  updatedReplicas: number
  readyReplicas: number
  availableReplicas: number
  unavailableReplicas: number
  terminatingReplicas: number
}

/** Bookkeeping of the current/last rollout for UIs and tests (not a Kubernetes field). */
export interface RolloutRecord {
  startedAt: number
  fromRevision: number
  toRevision: number
  strategy: 'RollingUpdate' | 'Recreate'
  surge: number
  unavailable: number
  /** K8s "complete": all replicas updated + available, no old replicas (terminating Pods not counted) – what `kubectl rollout status` waits for. */
  completedAt: number | null
  /** Also every old/terminating Pod is gone (the validated "duration" in sim-models SIM 5). */
  settledAt: number | null
  peakPods: number
  peakPodsInclTerminating: number
  minAvailable: number
  timedOutAt: number | null
  /**
   * Requests to the Services in front of this Deployment from the start of the rollout until every old Pod is gone
   * plus the kube-proxy propagation delay (L13 „bez ijednog neuspjelog zahtjeva”, L14 „s 0 grešaka”).
   */
  requests: { ok: number; failed: number; byOutcome: Record<RequestOutcome, number> }
}

export interface Deployment {
  id: string
  name: string
  namespace: string
  replicas: number
  selector: Record<string, string>
  template: PodTemplate
  strategy: { type: 'RollingUpdate' | 'Recreate'; maxSurge: IntOrPercent; maxUnavailable: IntOrPercent }
  minReadySeconds: number
  progressDeadlineSeconds: number
  revisionHistoryLimit: number
  paused: boolean
  generation: number
  createdAt: number
  status: DeploymentStatus
  conditions: { progressing: DeploymentCondition; available: DeploymentCondition }
  rollout: RolloutRecord | null
}

export interface VolumeClaimTemplate {
  name: string
  sizeGi: number
  accessMode: AccessMode
  storageClass: string
}

export interface StatefulSet {
  id: string
  name: string
  namespace: string
  replicas: number
  selector: Record<string, string>
  template: PodTemplate
  serviceName: string
  volumeClaimTemplates: VolumeClaimTemplate[]
  podManagementPolicy: 'OrderedReady' | 'Parallel'
  retention: { whenDeleted: 'Retain' | 'Delete'; whenScaled: 'Retain' | 'Delete' }
  createdAt: number
}

// ---------------------------------------------------------------- storage

export type AccessMode = 'RWO' | 'ROX' | 'RWX' | 'RWOP'

export interface StorageClass {
  name: string
  volumeBindingMode: 'WaitForFirstConsumer' | 'Immediate'
  reclaimPolicy: 'Delete' | 'Retain'
}

export interface PersistentVolumeClaim {
  id: string
  name: string
  namespace: string
  accessMode: AccessMode
  sizeGi: number
  storageClass: string
  phase: 'Pending' | 'Bound' | 'Lost'
  volumeId: string | null
  createdAt: number
  deletion: { at: number } | null
  /** Provisioning in progress (finishes at) */
  provisioningUntil: number | null
}

export interface PersistentVolume {
  id: string
  name: string
  sizeGi: number
  accessMode: AccessMode
  reclaimPolicy: 'Delete' | 'Retain'
  phase: 'Available' | 'Bound' | 'Released'
  claimId: string | null
  attachedNode: string | null
  attaching: { node: string; until: number } | null
  /** no Pod on the attached node needs it any more since… (detach timer) */
  detachRequestedAt: number | null
  createdAt: number
}

/** Where a database's rows actually live (container layer, emptyDir or a PersistentVolume). */
export interface DataStore {
  id: string
  kind: 'container' | 'emptyDir' | 'pv'
  orders: number
  /** Human label, e.g. "sloj kontejnera", "emptyDir", "PV pvc-…" */
  label: string
}

// ---------------------------------------------------------------- services

export interface Service {
  id: string
  name: string
  namespace: string
  selector: Record<string, string>
  type: 'ClusterIP' | 'NodePort' | 'LoadBalancer'
  clusterIP: string | null
  headless: boolean
  port: number
  targetPort: number
  sessionAffinity: 'None' | 'ClientIP'
  affinityTimeoutS: number
  /** NodePort / LoadBalancer: port opened on every node (30000–32767) */
  nodePort: number | null
  /** LoadBalancer: external address from the cloud controller; null = <pending> (e.g. kind without cloud-provider-kind) */
  loadBalancerIP: string | null
  /** headless only: publish DNS records of not-ready endpoints too (default false) */
  publishNotReadyAddresses: boolean
}

export interface Endpoint {
  podId: string
  podName: string
  ip: string
  nodeName: string | null
  ready: boolean
  serving: boolean
  terminating: boolean
}

export interface EndpointSlice {
  serviceId: string
  endpoints: Endpoint[]
  /** content version (increments when the list or a condition changes) */
  version: number
  updatedAt: number
}

/** What kube-proxy has programmed on the nodes (lags the EndpointSlice by the propagation delay). */
export interface ProxyRules {
  serviceId: string
  /**
   * Traffic targets: the ready endpoints; when there are none, the serving-and-terminating ones
   * (kube-proxy CategorizeEndpoints fallback, KEP-1669, GA in 1.28).
   */
  endpoints: Endpoint[]
  /** true when `endpoints` are the terminating fallback (no ready endpoint exists) */
  terminatingFallback: boolean
  version: number
  appliedAt: number
  pending: { at: number; version: number; endpoints: Endpoint[] }[]
  affinity: Record<string, { podId: string; until: number }>
}

// ---------------------------------------------------------------- traffic

/** http404: a Gateway (HTTPRoute) had no rule for the request (L15/L24). */
export type RequestOutcome = 'ok' | 'noEndpoints' | 'refused' | 'timeout' | 'http503' | 'http500' | 'http404'

export interface InFlightRequest {
  id: string
  streamId: string
  /** keep-alive connection that carried it (null = a new connection per request / Gateway) */
  connId: string | null
  /** simulated user (null = anonymous) */
  user: number | null
  /** arrival time (exact, between internal ticks) – animate with requestProgress(s, r) */
  t0: number
  /** travel time to the Pod (animation) */
  duration: number
  podId: string | null
  podName: string | null
  version: string | null
  outcome: RequestOutcome
}

export interface RequestRecord {
  /** arrival time */
  t: number
  streamId: string
  /** Service that received it (null: direct Pod IP, or no Gateway rule / unknown Service) */
  serviceName: string | null
  outcome: RequestOutcome
  version: string | null
  latencyMs: number
  podId: string | null
  user: number | null
}

/** A long-lived client connection (HTTP keep-alive / HTTP/2 / gRPC): every request on it goes to the same Pod. */
export interface ClientConnection {
  id: string
  serviceId: string
  podId: string
  podName: string
  openedAt: number
  requests: number
}

/** Gateway API HTTPRoute backendRef weight (L15/L20): per-request choice between Services. */
export interface RouteWeight {
  serviceName: string
  weight: number
}

export type TrafficProfile =
  | { kind: 'steady'; rps: number }
  | { kind: 'spike'; base: number; peak: number; startS: number; endS: number }
  | { kind: 'sine'; min: number; max: number; periodS: number; phaseS?: number }
  | { kind: 'flash'; base: number; peak: number; startS: number; endS: number }

export interface TrafficStream {
  id: string
  serviceName: string
  namespace: string
  /** 'requests' = discrete Poisson/uniform requests (animation, error counting); 'fluid' = per-second even split (HPA SIM 4). */
  model: 'requests' | 'fluid'
  profile: TrafficProfile
  arrival: 'poisson' | 'uniform'
  /** Single client IP (e.g. campus NAT) for sessionAffinity demos; null = many clients */
  clientIp: string | null
  /** Distinct simulated users; each request comes from a uniformly random user (0 = anonymous). */
  users: number
  /** Failed requests per user id – distinctUsersHit() counts the keys. */
  usersHit: Record<number, number>
  /**
   * Keep-alive client: `connections` long-lived connections used in turn, each pinned to the Pod kube-proxy chose
   * when it was opened (null = a new connection – and a new random backend – per request).
   * maxAgeS: the client closes and reopens a connection after this long (null = never).
   */
  keepAlive: { connections: number; maxAgeS: number | null } | null
  conns: (ClientConnection | null)[]
  connCursor: number
  /**
   * Gateway API weights: each request independently picks a Service with p = weight / Σweights (overrides
   * serviceName, no keep-alive pinning). An empty list = the HTTPRoute has no rule for this path → HTTP 404.
   */
  routes: RouteWeight[] | null
  /** client hard-coded a Pod IP (L14 "Upiši IP"): no Service, no kube-proxy; null = use the Service */
  targetIp: string | null
  /** client Pod (source address and node for tracePacket); null = a client outside the cluster */
  fromPod: string | null
  /** Per-stream RNG (arrivals, users, bug and route draws) so lanes with the same seed see identical traffic. */
  rng: Rng
  /** Successful / failed requests per app version since start (or resetTrafficTotals). */
  okByVersion: Record<string, number>
  failByVersion: Record<string, number>
  /** distinct users served (any outcome) per app version (keys = user ids) */
  usersByVersion: Record<string, Record<number, true>>
  enabled: boolean
  /** internal */
  nextArrivalAt: number
  carry: number
  totals: Record<RequestOutcome, number>
  /** fluid model: requests dropped because the Pods were saturated or none were ready */
  dropped: number
  served: number
  /** fluid model estimates (last second) */
  rho: number
  latencyMs: number
  p95Ms: number
  /** fluid model: worst p95 estimate since start (or resetTrafficTotals) */
  worstP95Ms: number
  /** profile time origin: profileRate(profile, t − profileT0) (setTrafficProfile anchors it at „now”) */
  profileT0: number
  /** outcomes per app version (requests that reached a Pod), for trafficTotals(s, { version }) */
  outcomesByVersion: Record<string, Record<RequestOutcome, number>>
}

// ---------------------------------------------------------------- autoscaling

export interface HpaPolicy {
  type: 'Percent' | 'Pods'
  value: number
  periodSeconds: number
}
export interface HpaRules {
  stabilizationWindowSeconds: number
  policies: HpaPolicy[]
  selectPolicy: 'Max' | 'Min' | 'Disabled'
  tolerance: number
}

export type HpaMetric = { type: 'cpu'; targetUtilization: number } | { type: 'external'; name: string; targetAverageValue: number }

export interface HpaDecision {
  t: number
  current: number
  /** observed metric: utilisation % (cpu) or total value (external) */
  metric: number | null
  readyPods: number
  unreadyPods: number
  missingPods: number
  ratio: number | null
  withinTolerance: boolean
  /** recommendation from the formula (before stabilisation / rate limits / min-max) */
  raw: number
  stabilized: number
  final: number
  limitedBy: 'none' | 'ScaleUpLimit' | 'ScaleDownLimit' | 'TooManyReplicas' | 'TooFewReplicas' | 'stabilization' | 'tolerance' | 'error'
  /** Croatian one-liner with the formula */
  text: string
  error: string | null
}

export interface Hpa {
  id: string
  name: string
  namespace: string
  targetDeployment: string
  minReplicas: number
  maxReplicas: number
  metric: HpaMetric
  behavior: { scaleUp: HpaRules; scaleDown: HpaRules }
  syncPeriodS: number
  recs: { t: number; v: number }[]
  upEvents: { t: number; d: number }[]
  downEvents: { t: number; d: number }[]
  decisions: HpaDecision[]
  lastScaleAt: number | null
  status: { currentReplicas: number; desiredReplicas: number; currentMetric: number | null; scalingActive: boolean; message: string }
  /** managed by KEDA (external metric from the queue) */
  keda: boolean
}

export interface ClusterAutoscaler {
  enabled: boolean
  minNodes: number
  maxNodes: number
  scanIntervalS: number
  provisionS: number
  utilizationThreshold: number
  unneededS: number
  delayAfterAddS: number
  template: NodeSpec
  lastScaleUpAt: number | null
  nextIndex: number
  /** node name prefix for new nodes */
  namePrefix: string
}

export interface Keda {
  enabled: boolean
  deployment: string
  namespace: string
  queueLength: number
  /** messages per second published (set by the lecture or a profile) */
  arrivalRate: number
  /** messages processed per second by one Ready worker */
  perWorkerRate: number
  targetQueueLength: number
  activationQueueLength: number
  pollingIntervalS: number
  cooldownS: number
  minReplicaCount: number
  maxReplicaCount: number
  lastActiveAt: number | null
  lastPollAt: number
  hpaName: string
  totals: { published: number; processed: number }
  /**
   * Messages delivered to a worker and not yet acknowledged (prefetch 1 per Ready worker). The scaler metric is
   * ready + unacked, as KEDA's RabbitMQ scaler counts them in HTTP mode (excludeUnacknowledged: false).
   */
  unacked: number
  /** arrival profile (null = constant arrivalRate) and its time origin */
  profile: TrafficProfile | null
  profileT0: number
}

// ---------------------------------------------------------------- config & state

export interface Timings {
  /** internal fixed step */
  dt: number
  /** creation → scheduler sees the Pod */
  scheduleDelayS: number
  /** sandbox + container create when the image is present */
  containerCreateS: number
  /** image pull when the image is not cached on the node */
  imagePullS: number
  /** 'node' = images cached per node after the first pull; 'pod' = every Pod of a non-precached image pulls (SIM 5 proto). */
  imageCache: 'node' | 'pod'
  /** time until a wrong tag fails (registry answers "not found") */
  imagePullFailS: number
  /** kubelet notices an exited container (PLEG relist) */
  kubeletSyncS: number
  /** first probe runs this long after container start + initialDelaySeconds */
  probeOffsetS: number
  backoffInitialS: number
  backoffMaxS: number
  /** EndpointSlice → kube-proxy rules on every node */
  endpointPropagationS: number
  nodeMonitorGraceS: number
  podEvictionTolerationS: number
  forceDetachS: number
  attachS: number
  provisionVolumeS: number
  housekeepingS: number
  pressureTransitionS: number
  /** watch notification delay range (L11 control-plane pipeline); [0,0] = same tick */
  watchDelayS: [number, number]
  /** request travel time for animation */
  requestTravelS: number
  /** client timeout for hung Pods / dead nodes */
  requestTimeoutS: number
}

export interface ClusterConfig {
  seed: number
  /** label of the preset, for UIs */
  preset: string
  nodes: NodeSpec[]
  timings: Timings
  /** emit animated control-plane messages (L11) */
  messages: boolean
  /** default namespace */
  namespace: string
  /** pre-cached images on every node at start */
  cachedImages: string[]
  /** images that exist in the registry (others → ErrImagePull). null = every image exists except tags ending in an invalid marker. */
  registry: string[] | null
  /** scheduler score plugins */
  scoring: 'LeastAllocated' | 'MostAllocated'
  /** fluid latency model: base latency and ρ cap */
  latency: { baseMs: number; rhoCap: number }
  /** metrics-server resolution */
  metricResolutionS: number
  /** HPA cpu-initialization-period */
  cpuInitializationPeriodS: number
  autoscaler: ClusterAutoscaler | null
  keda: Keda | null
  /** a cloud controller (or add-on) provisions LoadBalancer Services; false = like kind: EXTERNAL-IP stays <pending> */
  cloudLoadBalancer: boolean
  /** roles for version colours (versionToneFor): stable blue, next violet, broken rose */
  versionRoles: VersionRoles
  /** global `s.series.replicas/ready/pending` count only this Deployment (null = every workload) */
  seriesFocus: string | null
  /** length of every series in seconds (default 600) */
  seriesLengthS: number
}

export interface VersionRoles {
  stable?: string
  next?: string
  broken?: string[]
}

/** A goal window (markWindow): totals at the mark, compared with the live totals by windowStats(). */
export interface GoalWindow {
  id: string
  label: string
  t: number
  /** per stream: totals and per-user failure counts at the mark */
  streams: Record<string, { totals: Record<RequestOutcome, number>; usersHit: Record<number, number>; okByVersion: Record<string, number>; failByVersion: Record<string, number> }>
  /** per Service: ready endpoints minimum and seconds with 0 ready endpoints since the mark */
  services: Record<string, { minReady: number; zeroReadySeconds: number }>
}

/** Per-Service health accumulated every tick (L12 „bez 0 endpointa”, L24 RED panel). */
export interface ServiceStats {
  /** ready endpoints kube-proxy has programmed now */
  readyNow: number
  minReady: number
  /** seconds with 0 ready endpoints since `since` */
  zeroReadySeconds: number
  since: number
}

export interface WorkloadSeries {
  replicas: Series
  ready: Series
  pending: Series
}

export interface ClusterState {
  t: number
  tick: number
  acc: number
  cfg: ClusterConfig
  rng: Rng
  seq: number
  components: Record<ComponentName, boolean>
  /** kube-scheduler retry generation (bumped on cluster changes) */
  schedGen: number
  nodes: Node[]
  pods: Pod[]
  replicaSets: ReplicaSet[]
  deployments: Deployment[]
  statefulSets: StatefulSet[]
  services: Service[]
  slices: Record<string, EndpointSlice>
  proxy: Record<string, ProxyRules>
  storageClasses: StorageClass[]
  pvcs: PersistentVolumeClaim[]
  pvs: PersistentVolume[]
  dataStores: Record<string, DataStore>
  hpas: Hpa[]
  traffic: TrafficStream[]
  inFlight: InFlightRequest[]
  recent: RequestRecord[]
  /**
   * Shared database for dependsOnDb apps (L12) and its schema columns (L20 expand/contract).
   * up = effective state; forcedDown = „Baza pala” switch (setDatabase); backing = Service whose ready endpoints ARE
   * the database (setDatabaseBacking, e.g. a Postgres StatefulSet) – then up also needs ≥ 1 ready endpoint.
   * password = what the database accepts (L24 Secret rotation; null = no authentication modelled).
   */
  db: { up: boolean; downUntil: number | null; columns: string[]; forcedDown: boolean; backing: string | null; password: string | null }
  /** Secret objects by `${namespace}/${name}` */
  secrets: Record<string, SecretObject>
  /** metrics-server snapshot: pod id → mean CPU (m) over the last resolution window */
  podMetrics: Record<string, { cpuM: number; at: number }>
  lastScrapeAt: number
  events: ClusterEvent[]
  /** id counter for events (separate from `seq` so ids never shift Pod/RS sequence numbers) */
  eventSeq: number
  kubeEvents: KubeEvent[]
  messages: ControlPlaneMessage[]
  /** watch observation bookkeeping: key → { since, delay } */
  watch: Record<string, { since: number; delay: number }>
  /** one-shot warnings already logged (avoid log spam) */
  warned: Record<string, number>
  series: {
    replicas: Series
    ready: Series
    pending: Series
    nodes: Series
    rps: Series
    okPerS: Series
    errPerS: Series
    utilization: Series
    latencyMs: Series
    /** fluid p95 estimate */
    p95Ms: Series
    queue: Series
    /** per-Deployment replicas / ready / pending (seriesFor(s, name)) */
    byDeployment: Record<string, WorkloadSeries>
  }
  /** per-Service ready-endpoint history (serviceStats(s, name)) */
  serviceStats: Record<string, ServiceStats>
  /** goal windows (markWindow / windowStats), newest last, at most 20 */
  windows: GoalWindow[]
  /**
   * L11 causality: a write is visible to watchers only once it is committed (the message carrying it has landed /
   * etcd acknowledged it). Watch observations that would start earlier start at this time instead.
   */
  writeVisibleAt: number
  /** per-second counters being accumulated */
  secondCounters: { ok: number; err: number; okByVersion: Record<string, number> }
  /** cumulative Ready-node seconds and running-Pod seconds (cost: nodeSeconds / 3600 × €/h) */
  usageTotals: { nodeSeconds: number; podSeconds: number }
  /** last kubectl-ish output lines (L11 terminal) */
  kubectlLog: { t: number; cmd: string; out: string[]; ok: boolean }[]
  /** L20 release lane (Recreate / Rolling / Blue-green / Canary), null when the preset has none */
  release: Release | null
}

// ---------------------------------------------------------------- release strategies (L20)

export type ReleaseStrategy = 'recreate' | 'rolling' | 'blue-green' | 'canary-replicas' | 'canary-weights'

export type ReleasePhase = 'idle' | 'deploying' | 'canary' | 'promoted' | 'done' | 'aborted' | 'rolled-back'

export interface ReleaseMetrics {
  /** seconds in which requests arrived and none succeeded */
  downtimeS: number
  /** seconds in which both the stable and the new version served successful requests */
  mixedVersionS: number
  /** Pod-seconds above the steady replica count (blue-green doubles the Pods) */
  extraPodSeconds: number
  /** first second with a successful request of the new version */
  firstNewAt: number | null
  /** rollback requested at / all traffic back on the stable version at */
  rollbackAt: number | null
  recoveredAt: number | null
  /** requests of the new version within the current canary step (analysis window) */
  stepOk: number
  stepFailed: number
  /** new-version totals already counted (internal) */
  seenOk: number
  seenFailed: number
  /** share of users (percent) who have been served the new version at least once, sampled every second */
  exposureSeries: Series
}

export interface Release {
  strategy: ReleaseStrategy
  /** steady replica count N */
  replicas: number
  stableVersion: string
  newVersion: string
  /** Pod template of the new version (labels of the stable Deployment) – used by recreate / rolling */
  newTemplate: PodTemplate
  /** canary steps in percent of traffic, e.g. [5, 25, 50, 100] */
  steps: number[]
  stepS: number
  /** abort when the new version's error rate in a step exceeds this (0,02 = 2 %) */
  abortErrorRate: number
  /** automatic analysis (abort on threshold) */
  analysis: boolean
  /** blue-green: keep blue this long after the switch (Argo Rollouts scaleDownDelaySeconds, default 30) */
  scaleDownDelayS: number
  phase: ReleasePhase
  stepIndex: number
  /** canary share asked for (percent) and the share the mechanism can deliver (replicas: k/(N+k)) */
  requestedPct: number
  actualPct: number
  canaryReplicas: number
  stepStartedAt: number | null
  startedAt: number | null
  promotedAt: number | null
  finishedAt: number | null
  abortedAt: number | null
  abortReason: string
  metrics: ReleaseMetrics
}
