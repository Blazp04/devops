/**
 * E6 „Git ↔ klaster” – types.
 *
 * Everything is plain data so the state can be read during React render and mutated inside
 * `step` / `mutate`. Field paths are JSON pointers, exactly what Argo CD's `ignoreDifferences.jsonPointers` uses.
 */
import type { Rng, Series } from '../../kit/sim/math.ts'

export type FieldValue = string | number | boolean
/** JSON-pointer path → value, e.g. { '/spec/replicas': 4 }. Missing key = field not set. */
export type Fields = Record<string, FieldValue>

export type Kind =
  | 'Deployment'
  | 'Service'
  | 'HorizontalPodAutoscaler'
  | 'ConfigMap'
  | 'Secret'
  | 'SealedSecret'
  | 'ExternalSecret'
  | 'Job'
  | 'ClusterRoleBinding'
  /** Gateway API (L15/L24). E6 keeps them as objects; routing itself is simulated by E2/E3. */
  | 'HTTPRoute'
  | 'Gateway'
  /** Postgres in the course (L24 config repo). E6 keeps the object only; E3 simulates its Pods and volumes. */
  | 'StatefulSet'
  | 'PersistentVolumeClaim'

/** Argo CD resource hook phases (only Job hooks are modelled). */
export type HookPhase = 'PreSync' | 'Sync' | 'PostSync'

/** One Kubernetes object as written in a file of the config repository. */
export interface Manifest {
  kind: Kind
  name: string
  /** '' for cluster-scoped kinds (ClusterRoleBinding). */
  namespace: string
  fields: Fields
  /** `argocd.argoproj.io/sync-wave` (default 0). */
  wave?: number
  /** `argocd.argoproj.io/hook` – hooks are recreated on every full sync and excluded from diff/health. */
  hook?: HookPhase
}

/** path in repo → manifest (one object per file keeps the diff readable). */
export type RepoFiles = Record<string, Manifest>

export type Actor = string

export interface FieldChange {
  path: string
  before: FieldValue | undefined
  after: FieldValue | undefined
}

export interface FileChangeSummary {
  path: string
  change: 'added' | 'removed' | 'modified'
  fields: FieldChange[]
}

export interface Commit {
  /** 40 hex chars, deterministic (hash of parent + content + time). */
  sha: string
  short: string
  parent: string | null
  message: string
  author: Actor
  t: number
  files: RepoFiles
  /** GnuPG signature (key id + signer) or null when unsigned. */
  signature: { keyId: string; signer: Actor } | null
  kind: 'initial' | 'change' | 'revert' | 'ci' | 'attack'
  revertOf?: string
  changes: FileChangeSummary[]
  /** Pipeline timestamps for this commit (filled in by the engine). */
  seenAt: number | null
  seenVia: RefreshSource | null
  syncStartedAt: number | null
  /** the cluster matched this revision for the first time (after a sync, or at once when nothing had to be applied) */
  syncedAt: number | null
  healthyAt: number | null
  /** CI run that produced this commit (CI bot commits only) */
  ciRunId: string | null
  /** „Put jednog commita” stations stamped by the engine (see `commitTimeline`). */
  stations: Partial<Record<StationId, number>>
}

/** Stations of one commit on its way to running Pods (L24 „Put jednog commita”). */
export type StationId =
  | 'ci'
  | 'commit'
  | 'seen'
  | 'outOfSync'
  | 'syncStarted'
  | 'applied'
  | 'rsCreated'
  | 'firstScheduled'
  | 'imagePulled'
  | 'firstReady'
  | 'allReady'
  | 'healthy'

export interface RepoProtection {
  /** Branch protection: changes to `main` only through a reviewed pull request. */
  requirePullRequest: boolean
  /** Git host rejects unsigned commits. */
  requireSignedCommits: boolean
}

export interface Repo {
  url: string
  branch: string
  /** Application source path inside the repo (files outside it are not rendered). */
  appPath: string
  commits: Commit[]
  head: string
  protection: RepoProtection
  /** GnuPG public keys trusted by Argo CD (`sourceIntegrity.git.policies[].gpg.keys`). actor → keyId */
  trustedKeys: Record<Actor, string>
}

export interface CommitInput {
  message: string
  author?: Actor
  changes: FileChange[]
  /** Default: the author's key if the author has one. `false` = unsigned. */
  signed?: boolean
  /** Default true. Direct pushes (false) are rejected when branch protection requires a pull request. */
  viaPullRequest?: boolean
  kind?: Commit['kind']
  revertOf?: string
  ciRunId?: string
}

/** `manifest: null` deletes the file; `set` patches fields of an existing file (`null` removes the field). */
export interface FileChange {
  path: string
  manifest?: Manifest | null
  set?: Record<string, FieldValue | null>
}

export type CommitResult = { ok: true; sha: string; commit: Commit } | { ok: false; reason: string }

// ─── Registry / CI ───────────────────────────────────────────────────────────

/** How a container built from this image behaves. `missing` is never stored – unknown tags are missing. */
export type ImageBehaviour = 'ok' | 'crash' | 'notReady'

export interface ImageInfo {
  tag: string
  digest: string
  behaviour: ImageBehaviour
  /**
   * Share of requests this build answers with an error although it runs and is Ready (e.g. the 2.0.0 VAT bug of L20:
   * 0.2). E6 does not serve traffic – Argo CD sees such a build as Healthy – but it carries the number so a traffic
   * engine (E3) gets the same behaviour through `deploymentSpec().bugRate`.
   */
  bugRate: number
}

export interface CiRun {
  id: string
  version: string
  behaviour: ImageBehaviour
  /** share of failing requests of the build (ImageInfo.bugRate) */
  bugRate: number
  startedAt: number
  durationS: number
  status: 'running' | 'done'
  /** 0..1 for the CI bot lane animation. */
  progress: number
  resultSha: string | null
}

// ─── Cluster ─────────────────────────────────────────────────────────────────

export type Writer = 'argocd' | 'hpa' | 'kubectl' | 'ci' | 'controller' | 'attacker'

export interface LiveObject {
  key: string
  kind: Kind
  name: string
  namespace: string
  fields: Fields
  /** What Argo CD applied last (the client-side-apply `last-applied-configuration`). */
  lastApplied: Fields | null
  /** Carries Argo CD's tracking annotation → part of the Application. */
  managed: boolean
  generation: number
  createdAt: number
  createdBy: Writer
  /** Owner (garbage collection), e.g. a Secret owned by its SealedSecret. */
  ownerKey: string | null
  wave: number
  hook?: HookPhase
  /** who last wrote each field (JSON pointer → writer); drives „was this a manual change?” */
  writers: Record<string, Writer>
  /** writer of the most recent change of this object */
  lastWriter: Writer
}

/** One field change of a live object – the engine-neutral feed for other engines (`drainLiveChanges`). */
export interface LiveChange {
  t: number
  key: string
  kind: Kind
  name: string
  /** JSON pointer; '' = the whole object was created or deleted */
  path: string
  before?: FieldValue
  after?: FieldValue
  by: Writer
}

/** Kubernetes event (`kubectl get events`, `kubectl describe pod`). */
export interface KubeEvent {
  t: number
  type: 'Normal' | 'Warning'
  reason: string
  /** involved object, e.g. `pod/klopa-api-5f7c9d8b6-x2k9p`, `deployment/klopa-api` */
  object: string
  /** reporting component (`default-scheduler`, `kubelet`, `deployment-controller` …) */
  source: string
  message: string
  /** how many times the same event repeated (kubectl shows „x3 over 2m”) */
  count: number
  firstT: number
}

export type PodStatus =
  | 'Pending'
  | 'ContainerCreating'
  | 'Running'
  | 'Ready'
  | 'CrashLoopBackOff'
  | 'ImagePullBackOff'
  | 'CreateContainerConfigError'
  | 'Terminating'
  | 'Completed'
  | 'Error'

export interface PodRT {
  /** Stable id = Pod name (klopa-api-5f7c9d8b6-x2k9p). */
  id: string
  owner: string
  ownerKind: 'ReplicaSet' | 'Job'
  deployment: string | null
  image: string
  tag: string
  status: PodStatus
  ready: boolean
  since: number
  readySince: number | null
  startedAt: number | null
  pullUntil: number | null
  nextProbeAt: number
  nextRetryAt: number
  restarts: number
  goneAt: number | null
  createdAt: number
  /** Last kubelet event reason for this Pod (FailedMount, BackOff, …). */
  reason: string
  /** Secret value the container sees (env: captured at start; volume/CSI: follows updates with a delay). */
  secretValue: string | null
  secretSource: 'env' | 'volume' | 'csi' | null
  /** this Pod's Kubernetes events, newest last (≤ POD_EVENT_CAP) – `kubectl describe pod` */
  events: KubeEvent[]
}

export interface ReplicaSetRT {
  name: string
  deployment: string
  hash: string
  template: Fields
  image: string
  tag: string
  revision: number
  replicas: number
  createdAt: number
  /**
   * Image already on the nodes for this ReplicaSet's Pods. A brand-new image is pulled by every Pod created during
   * its rollout (as in the validated prototype); once the rollout completes – or for an image that ran before – Pods start without a pull.
   */
  warm: boolean
  /** Git revision whose sync made this the Deployment's current ReplicaSet (null = a manual change or the initial state) */
  revisionSha: string | null
  /**
   * `deployment.kubernetes.io/desired-replicas`: the Deployment's spec.replicas when the controller last scaled this
   * ReplicaSet. An active ReplicaSet whose value differs from spec.replicas marks a scaling event (sync.go isScalingEvent).
   */
  desiredAnno: number | null
  /** `deployment.kubernetes.io/max-replicas`: spec.replicas + maxSurge at that moment (base of proportional scaling) */
  maxAnno: number | null
}

export type DeploymentReason = 'NewReplicaSetCreated' | 'ReplicaSetUpdated' | 'NewReplicaSetAvailable' | 'ProgressDeadlineExceeded'

export interface DeploymentStatus {
  replicas: number
  updatedReplicas: number
  readyReplicas: number
  availableReplicas: number
  terminatingReplicas: number
}

export interface DeploymentRT {
  name: string
  observedGeneration: number
  reason: DeploymentReason
  lastProgressAt: number
  status: DeploymentStatus
  revisionCounter: number
  /** revision whose apply changed the Pod template last (null = kubectl / initial) – stamps the commit's stations */
  rolloutRevision: string | null
  /** Pods reported by an external workload model (E3 bridge); [] when E6 simulates the Pods itself */
  externalPods: ExternalPod[]
  /** template hash the external model reported as observed (E3 bridge) */
  externalObservedHash: string | null
}

export interface HpaRT {
  name: string
  nextEvalAt: number
  recommendations: { t: number; n: number }[]
  lastDesired: number | null
  /** another engine (E3) computes the desired replicas and writes them with `setHpaDesired`; E6's own HPA maths is off */
  external: boolean
  /** ScalingActive=False „ScalingDisabled”: the target has 0 replicas and minReplicas > 0 */
  scalingDisabled: boolean
  /**
   * status.conditions in the order the HPA controller adds them (AbleToScale, ScalingActive, ScalingLimited).
   * Empty until the first evaluation → Argo CD health Progressing „Waiting to Autoscale”.
   */
  conditions: HpaCondition[]
}

export interface HpaCondition {
  type: 'AbleToScale' | 'ScalingActive' | 'ScalingLimited'
  status: 'True' | 'False'
  reason: string
  message: string
}

export interface JobRT {
  key: string
  name: string
  startedAt: number
  finishesAt: number
  status: 'Running' | 'Complete' | 'Failed'
  podId: string
}

export interface ReplicaWrite {
  t: number
  by: Writer
  from: number
  to: number
}

export interface ClusterState {
  objects: Record<string, LiveObject>
  deployments: Record<string, DeploymentRT>
  replicaSets: ReplicaSetRT[]
  pods: PodRT[]
  hpas: Record<string, HpaRT>
  jobs: Record<string, JobRT>
  /** Image refs already pulled on the nodes (image cache, cluster-wide simplification). */
  imageCache: string[]
  /** HPA demand: replicas the current load needs (abstracts CPU utilisation, see README). */
  hpaDemand: number
  databaseDown: boolean
  /** Secret controllers' bookkeeping */
  unsealAt: Record<string, number>
  esoNextRefreshAt: Record<string, number>
  /** time a Secret's data last changed (for volume propagation) */
  secretChangedAt: Record<string, number>
  replicaWrites: ReplicaWrite[]
  /** SealedSecret / ExternalSecret controller status (→ Argo CD health of those objects) */
  controllerStatus: Record<string, { ok: boolean; message: string; gen: number }>
  /** Sealed Secrets controller: next periodic re-reconcile of a SealedSecret whose Secret is missing or refused */
  sealedResyncAt: Record<string, number>
  /**
   * Deployments whose ReplicaSets/Pods are simulated by another engine (e.g. E3). E6 keeps the object and its spec,
   * stops its own rollout model for it and takes the status from `setExternalWorkloadStatus`.
   */
  external: Record<string, boolean>
  /** Kubernetes events of the namespace, newest last (≤ KUBE_EVENT_CAP) */
  kubeEvents: KubeEvent[]
  /** field changes not yet taken by `drainLiveChanges` (≤ LIVE_CHANGE_CAP, oldest dropped) */
  liveChanges: LiveChange[]
  /** who deleted an object last (key → writer) – a self-heal that recreates it reverts a manual change */
  deletedBy: Record<string, Writer>
}

/** One Pod as an external workload model reports it (E3 bridge) – E6's Pod views fall back to these. */
export interface ExternalPod {
  id: string
  /** kubectl STATUS column text: Running, Pending, ContainerCreating, CrashLoopBackOff … */
  status: string
  ready: boolean
  /** image tag of the Pod's container */
  tag: string
  restarts?: number
  /** Pod age in seconds */
  ageS?: number
  terminating?: boolean
  /** belongs to the ReplicaSet of the current Pod template */
  current?: boolean
}

/** Status reported by an external workload model (E3) for one Deployment. */
export interface ExternalWorkloadStatus {
  replicas: number
  updatedReplicas: number
  readyReplicas: number
  availableReplicas: number
  terminatingReplicas?: number
  /**
   * Generation the external controller has processed. Without it (and without `observedTemplateHash`) the report is
   * NOT treated as current: Argo CD stays Progressing („observed deployment generation less than desired generation”).
   */
  observedGeneration?: number
  /**
   * Echo of `deploymentSpec().templateHash` the external model has rolled out. A report whose hash differs from the live
   * template is stale (sent before the new spec reached the external model) and keeps the app Progressing.
   */
  observedTemplateHash?: string
  /** Progressing condition reason ProgressDeadlineExceeded */
  progressDeadlineExceeded?: boolean
  /** the Pods, so E6's Pod views (podsView, kubectlGetPods, resourceTree, capacity) can show them */
  pods?: ExternalPod[]
}

/** The Deployment spec as it is live in the cluster (what Argo CD or kubectl last wrote) – input for an external workload model. */
export interface DeploymentSpecView {
  name: string
  generation: number
  /** increments on every spec change (= metadata.generation); a glue loop pushes to E3 only when this changed */
  specVersion: number
  /** who wrote the spec last: 'argocd' (sync / self-heal), 'hpa', 'kubectl' (incl. `reportExternalSpec`) … */
  lastWriter: Writer
  /** null when the field is absent (API default 1 applies) */
  replicas: number | null
  effectiveReplicas: number
  /** image as written in the manifest (CI bot commits carry `tag@sha256:…`) */
  image: string
  /** the same image without the digest (`registry/klopa-api:2.0.1`) – what a model keyed by tag (E3) understands */
  imageRef: string
  tag: string
  digest: string | null
  /** how the build behaves in E6's registry ('missing' = cannot be pulled) */
  behaviour: ImageBehaviour | 'missing'
  /** share of failing requests of a Ready build (2.0.0: 0.2) – see ImageInfo.bugRate */
  bugRate: number
  maxSurge: FieldValue
  maxUnavailable: FieldValue
  progressDeadlineSeconds: number
  paused: boolean
  /** hash of the Pod template: changes ⇔ a new rollout is needed */
  templateHash: string
}

// ─── Secrets backends (L23) ──────────────────────────────────────────────────

export interface SecretsState {
  /** External secret store (Vault/OpenBao/cloud secret manager). remoteKey → current value */
  store: { available: boolean; values: Record<string, string>; versions: Record<string, number> }
  /** Sealed Secrets controller keys. */
  sealing: {
    /** all sealing key ids ever generated, oldest first; the newest is used by kubeseal */
    keys: { id: string; createdAt: number }[]
    /** private keys present in the current cluster */
    clusterKeyIds: string[]
    /** private keys backed up outside the cluster */
    backupKeyIds: string[]
    /** some sealing key has leaked (any); which ones: `leakedKeyIds` */
    leaked: boolean
    /** private keys an attacker has – only SealedSecrets sealed with one of these are readable from Git */
    leakedKeyIds: string[]
    /** ciphertext → plaintext + key (the "maths" of asymmetric encryption, kept out of sight) */
    ciphertexts: Record<string, { value: string; keyId: string }>
    /** next automatic key renewal (sim s); null = automatic renewal off */
    nextRenewalAt: number | null
  }
  /** SOPS with an age key: values encrypted in Git, keys readable; Argo CD decrypts only through the KSOPS plugin. */
  sops: {
    /** age recipient (public key) `sops --encrypt` uses now */
    recipient: string
    /** every age recipient ever used, oldest first */
    recipients: string[]
    /** the repo-server (KSOPS) has the age private keys – otherwise rendering fails */
    argoHasKey: boolean
    /** some age private key leaked; which ones: `leakedRecipients` */
    leaked: boolean
    /** age keys an attacker has – only SOPS values encrypted for one of these are readable from Git */
    leakedRecipients: string[]
    /** ENC[…] token → plaintext + the age recipient it was encrypted for */
    ciphertexts: Record<string, { value: string; recipient: string }>
  }
}

// ─── Argo CD ─────────────────────────────────────────────────────────────────

export type SyncCode = 'Synced' | 'OutOfSync' | 'Unknown'
export type SourcePlugin = 'none' | 'argocd-vault-plugin' | 'ksops'
export type HealthCode = 'Healthy' | 'Progressing' | 'Degraded' | 'Suspended' | 'Missing' | 'Unknown'
export type RefreshSource = 'poll' | 'webhook' | 'manual' | 'sync'

export interface IgnoreRule {
  kind: Kind
  name?: string
  jsonPointers: string[]
}

export interface RetryStrategy {
  /** Retries after the first failure; negative = unlimited; 0 = none. */
  limit: number
  backoff?: { durationS?: number; factor?: number; maxDurationS?: number }
  /** Use the latest revision on retry instead of the original one (default false). */
  refresh?: boolean
}

export type SelfHealTiming = { mode: 'backoff'; initialS: number; factor: number; capS: number } | { mode: 'timeout'; timeoutS: number }

export interface SyncPolicy {
  automated: boolean
  prune: boolean
  selfHeal: boolean
  allowEmpty: boolean
  /** `syncPolicy.retry` – null = not set (automated syncs then still retry 5×, manual syncs don't). */
  retry: RetryStrategy | null
  /** syncOptions: RespectIgnoreDifferences=true */
  respectIgnoreDifferences: boolean
}

export interface DiffEntry {
  key: string
  kind: Kind
  name: string
  path: string
  /** readable field name for UIs and events (`fieldLabel`): „slika (image)”, „replicas”, `spec.template.spec.containers[0].env[1].value` */
  field: string
  git: FieldValue | undefined
  live: FieldValue | undefined
  /** matched by ignoreDifferences – shown greyed, does not cause OutOfSync */
  ignored: boolean
  change: 'changed' | 'missing-live' | 'removed-from-git' | 'extra-live'
}

export interface ResourceStatus {
  key: string
  kind: Kind
  name: string
  status: SyncCode
  health: HealthCode | null
  healthMessage: string
  requiresPruning: boolean
  hook?: HookPhase
}

export type OperationPhase = 'Running' | 'Succeeded' | 'Failed' | 'Error' | 'Terminating'
export type Initiator = 'auto' | 'selfHeal' | 'manual'

export interface SyncStep {
  phase: HookPhase
  wave: number
  keys: string[]
}

export interface ResourceResult {
  key: string
  result: 'Synced' | 'SyncFailed' | 'Pruned' | 'PruneSkipped'
  message: string
}

export interface SyncOperation {
  id: number
  revision: string
  initiatedBy: Initiator
  selfHealAttemptsCount: number
  prune: boolean
  /** selective sync (self-heal syncs only out-of-sync resources; hooks don't run) */
  onlyKeys: string[] | null
  retry: { limit: number; durationS: number; factor: number; maxDurationS: number; refresh: boolean }
  retryCount: number
  /** this self-heal sync overwrote a field kubectl had set (or recreated an object kubectl deleted) */
  revertedManual: boolean
  phase: OperationPhase
  message: string
  startedAt: number
  /** set when completed – and while a failed attempt waits for its retry */
  finishedAt: number | null
  nextRetryAt: number | null
  steps: SyncStep[]
  stepIdx: number
  stage: 'start' | 'apply' | 'wait' | 'delay' | 'prune' | 'retryWait' | 'done'
  stageUntil: number
  results: ResourceResult[]
}

export interface HistoryEntry {
  id: number
  revision: string
  deployedAt: number
  initiatedBy: Initiator
}

export interface AppCondition {
  type: 'ComparisonError' | 'SyncError'
  message: string
}

export interface ArgoState {
  appName: string
  project: { name: string; restricted: boolean; sourceIntegrity: 'none' | 'head' | 'strict' }
  policy: SyncPolicy
  ignoreDifferences: IgnoreRule[]
  /** Config Management Plugin that renders secrets into manifests: argocd-vault-plugin or KSOPS (both discouraged; see L23). */
  sourcePlugin: SourcePlugin
  webhook: boolean
  /** revision resolved at the last Git refresh – Argo CD knows nothing newer */
  knownRevision: string | null
  lastGitRefreshAt: number
  pollStartedAt: number
  nextPollAt: number
  webhookRefreshAt: number | null
  nextCompareAt: number
  compareRequested: boolean
  /** rendered target for knownRevision */
  target: Record<string, Manifest>
  renderError: string | null
  /**
   * AppProject sourceIntegrity verdict for `knownRevision` (null = passed or not configured). Argo CD 3.5 still renders
   * and diffs the revision, adds a ComparisonError condition and refuses to sync it (operation phase Error).
   */
  integrityError: string | null
  /**
   * Readable secret values the repo-server/Redis manifest cache holds (plain Secret from Git, argocd-vault-plugin, KSOPS):
   * value → sim time it was last rendered. Entries older than `cfg.argoCacheExpiryS` have expired (24 h real).
   */
  plaintextCache: Record<string, number>
  renderCache: Record<string, { target: Record<string, Manifest>; error: string | null; plaintext: boolean; plaintextValues: string[] }>
  sync: { status: SyncCode; revision: string | null }
  health: { status: HealthCode; message: string }
  resources: ResourceStatus[]
  diffs: DiffEntry[]
  conditions: AppCondition[]
  operation: SyncOperation | null
  lastOperation: SyncOperation | null
  history: HistoryEntry[]
  nextOpId: number
  /** why automated sync is (not) acting right now – for the UI */
  lastAutoSyncNote: string
  lastAutoSyncKey: string
  outOfSyncSince: number | null
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export type EventTone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral'
export type EventKind =
  | 'commit'
  | 'git'
  | 'refresh'
  | 'sync'
  | 'syncFailed'
  | 'retry'
  | 'autosync'
  | 'status'
  | 'health'
  | 'drift'
  | 'hpa'
  | 'prune'
  | 'pod'
  | 'ci'
  | 'security'
  | 'secret'
  | 'config'

export interface GitOpsEvent {
  id: number
  t: number
  kind: EventKind
  text: string
  tone: EventTone
}

export interface Stats {
  commits: number
  kubectlChanges: number
  /** kubectl changes of a Deployment's image (a release done by hand, not through Git) */
  kubectlImageChanges: number
  driftsDetected: number
  driftsReverted: number
  autoSyncs: number
  selfHealSyncs: number
  /** self-heal syncs that undid a manual (kubectl) change – not the ones that only fought the HPA */
  kubectlDriftsReverted: number
  manualSyncs: number
  failedSyncs: number
  retries: number
  prunes: number
  orphans: number
  reverts: number
  /** Argo CD and the HPA overwrote each other's spec.replicas */
  replicaFights: number
  lastFightAt: number | null
  rejectedCommits: number
  blockedBySourceIntegrity: number
  /** spec.replicas removed from Git without the migration step: the Deployment dropped to the API default once */
  replicaDrops: number
  /** since when `ignoreDifferences` on /spec/replicas + RespectIgnoreDifferences are both on (null = not both) – `l22Goals.hpaPeace` */
  hpaIgnoreFixAt: number | null
}

export interface PodTimings {
  scheduleS: number
  pullS: number
  appStartS: number
  probePeriodS: number
  terminationS: number
  crashAfterS: number
}

export interface ResolvedConfig {
  seed: number
  mode: 'pull' | 'push'
  pollIntervalS: number
  pollJitterS: number
  webhookDelayS: number
  compareIntervalS: number
  applyS: number
  syncWaveDelayS: number
  selfHeal: SelfHealTiming
  autoSyncDefaultRetry: { limit: number; durationS: number; factor: number; maxDurationS: number }
  pod: PodTimings
  hpaPeriodS: number
  hpaDownStabilizationS: number
  jobDurationS: number
  ciDurationS: number
  unsealS: number
  /** Sealed Secrets controller re-checks a SealedSecret whose Secret is missing or refused (periodic resync, sim s) */
  sealedResyncS: number
  /** automatic sealing-key renewal on/off and its period (sim s; real 30 days) */
  sealingKeyAutoRenew: boolean
  sealingKeyRenewalS: number
  volumeSyncS: number
  csiRotation: boolean
  csiRotationS: number
  /** Argo CD manifest cache lifetime (`--repo-cache-expiration`): sim 12 min ↔ real 24 h, same as E5 */
  argoCacheExpiryS: number
  /** Pods the namespace ResourceQuota allows (caps entity counts; extra Pods fail with FailedCreate „exceeded quota”) */
  podQuota: number
  historyLimit: number
  seriesLength: number
}

/** Rolling 1-s samples for the kit LineChart (never NaN). */
export interface GitOpsMetrics {
  liveReplicas: Series
  /**
   * spec.replicas in the rendered Git target. When Git has no `replicas` the last value is held and
   * `gitReplicasPresent` is 0 – draw that stretch dashed or hide it instead of a false drop to 0.
   */
  gitReplicas: Series
  /** 1 = spec.replicas is in Git, 0 = it is not (HPA-managed) */
  gitReplicasPresent: Series
  /** what the HPA wants (its last recommendation); held, 0 before the first evaluation or without an HPA */
  hpaDesired: Series
  /** cumulative Argo CD ↔ HPA fights (stats.replicaFights) */
  fights: Series
  readyPods: Series
  /** 1 = Synced, 0 = OutOfSync (and push mode), 0.5 = Unknown */
  synced: Series
  /** 1 = Healthy, 0.5 = Progressing/Suspended, 0 = Degraded/Missing/Unknown */
  healthy: Series
  lastSampleAt: number
}

export interface Security {
  /** push model: CI holds a long-lived cluster-admin kubeconfig */
  ciCredentialLeaked: boolean
  clusterCompromised: boolean
}

export interface GitOpsState {
  t: number
  tick: number
  acc: number
  cfg: ResolvedConfig
  rng: Rng
  mode: 'pull' | 'push'
  repo: Repo
  registry: Record<string, ImageInfo>
  cluster: ClusterState
  argo: ArgoState
  secrets: SecretsState
  ci: { runs: CiRun[]; nextId: number }
  stats: Stats
  security: Security
  metrics: GitOpsMetrics
  events: GitOpsEvent[]
  nextEventId: number
  /** name of the main Deployment the helpers act on */
  mainDeployment: string
  /** tag running when the engine was created (= "v1" colour) */
  baselineTag: string
}
