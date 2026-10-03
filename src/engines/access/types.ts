/**
 * E5 „Tko vidi?” – types of the secret access-graph engine (lectures 16 and 23).
 * Pure TypeScript: no React, no DOM. See README.md for the model.
 */
import type { Rng, Series } from '../../kit/sim/math.ts'

/* ---------- Where the value lives and how Pods get it ---------- */

/**
 * Where the secret value lives (L16 „Gdje je lozinka” + L23 „pristup”).
 * - `image`        – `ENV` line in the Dockerfile, baked into the image (Dockerfile is in Git)
 * - `manifest-env` – literal `env` value in deployment.yaml (Git + Deployment/Pod objects in etcd)
 * - `configmap`    – a ConfigMap (configmap.yaml in Git)
 * - `secret`       – a Secret applied by hand with kubectl from a local secret.yaml (not in Git)
 * - `git-secret`   – a plain Secret manifest (base64 `data`) stored in Git
 * - `sealed`       – SealedSecret in Git, unsealed by the in-cluster controller
 * - `sops`         – SOPS-encrypted file in Git (age), decrypted by the GitOps tool
 * - `eso`          – ExternalSecret reference in Git; External Secrets Operator copies the store value into a Secret
 * - `csi`          – Secrets Store CSI Driver mounts the store value as tmpfs at Pod start (optional sync to a Secret)
 * - `avp`          – argocd-vault-plugin: placeholders in Git, Argo CD renders plaintext at manifest generation
 */
export type Approach = 'image' | 'manifest-env' | 'configmap' | 'secret' | 'git-secret' | 'sealed' | 'sops' | 'eso' | 'csi' | 'avp'

/** How a workload consumes the value. `image` and `manifest-env` are always `env`. */
export type ConsumeMode = 'env' | 'volume' | 'subPath'

/** Encryption-at-rest provider (first provider in EncryptionConfiguration). kms v1 is deprecated and omitted. */
export type Provider = 'identity' | 'aescbc' | 'aesgcm' | 'secretbox' | 'kms-v2'

/** Which resources the EncryptionConfiguration lists. Typical self-managed setups list only `secrets`. */
export type EncryptionScope = 'secrets' | 'secrets+configmaps' | 'all'

/** How manifests reach the cluster: by hand with kubectl (L16) or through Argo CD polling Git (L23). */
export type Delivery = 'kubectl' | 'gitops'

export type StoreKind = 'openbao' | 'vault' | 'cloud'

/** Who decrypts SOPS files: Argo CD through a plugin (KSOPS, discouraged) or Flux natively. */
export type SopsDecryptor = 'argocd-ksops' | 'flux'

/* ---------- Actors and RBAC ---------- */

export type ActorId =
  | 'git-reader'
  | 'image-puller'
  | 'etcd-backup-thief'
  | 'cp-disk-thief'
  | 'view-user'
  | 'developer'
  | 'pod-creator'
  | 'compromised-pod'
  | 'log-reader'
  | 'ci-log-reader'
  | 'argocd-redis'
  | 'laptop-thief'
  | 'ex-employee'

export type Verb = 'get' | 'list' | 'watch' | 'create' | 'update' | 'patch' | 'delete'
export type Resource = 'secrets' | 'configmaps' | 'pods' | 'deployments' | 'pods/log' | 'pods/exec'
export type RoleId = 'view' | 'edit' | 'deployer' | 'secret-lister'

export interface PolicyRule {
  resources: readonly Resource[]
  verbs: readonly Verb[]
}

export interface RoleInfo {
  id: RoleId
  /** Name as in `kubectl` (e.g. `view`) */
  label: string
  /** Croatian one-liner */
  description: string
  rules: readonly PolicyRule[]
}

export interface ActorInfo {
  id: ActorId
  /** Croatian eye label, nominative („Kradljivac kopije baze etcd”) */
  label: string
  /** Croatian sentence subject for event texts („Korisnik koji smije stvarati Podove” čita …) */
  subject: string
  /** Croatian sub-label (who this is) */
  description: string
  /** Lectures whose flagship shows this eye by default */
  lectures: readonly ('16' | '23')[]
  /** Where the attempt animation starts (graph node the actor first touches) */
  entry: GraphNodeId
}

/* ---------- Graph for the pipeline diagram and animations ---------- */

/** Nodes of the L23 pipeline (laptop → Git → CI → registry → Argo CD → API/etcd → node → Pod) plus side nodes. */
export type GraphNodeId =
  | 'laptop'
  | 'git'
  | 'ci'
  | 'ci-log'
  | 'registry'
  | 'argocd'
  | 'redis'
  | 'api'
  | 'etcd'
  | 'cp-disk'
  | 'kms'
  | 'controller'
  | 'store'
  | 'node'
  | 'pod'
  | 'logs'
  | 'memory'

export interface GraphNodeInfo {
  id: GraphNodeId
  label: string
  /** Suggested column 0..8 on the left-to-right pipeline; side nodes reuse a column with `lane` ≠ 0 */
  column: number
  /** 0 = main pipeline row, -1 above, 1 below */
  lane: -1 | 0 | 1
}

/** How an actor reaches the value. */
export type Channel =
  | 'git' // plain/base64/ENV/env literal/ConfigMap in Git history
  | 'git-sealed' // SealedSecret in Git + leaked controller key
  | 'git-sops' // SOPS file in Git + age key
  | 'image' // ENV in image layers / config
  | 'run-image' // create a Pod with the image and print env
  | 'etcd' // plaintext in an etcd copy
  | 'disk' // control-plane disk: etcd + local key file
  | 'api-get'
  | 'api-list'
  | 'api-watch'
  | 'pod-spec' // env literal readable from Deployment/Pod spec
  | 'mount' // create a Pod that mounts the Secret/ConfigMap/CSI volume
  | 'exec' // kubectl exec into the running app Pod
  | 'pod-inside' // attacker inside the app container
  | 'pod-log' // kubectl logs (pods/log)
  | 'log' // central log system
  | 'ci-log'
  | 'redis' // Argo CD manifest cache
  | 'laptop-file' // local plaintext secret.yaml
  | 'memory' // ex-employee remembers

/** Controls that can block a path (for „what closed this eye”). */
export type ControlId =
  | 'encryption-at-rest'
  | 'kms'
  | 'rbac'
  | 'no-value-in-git'
  | 'git-encryption'
  | 'no-value-in-image'
  | 'not-in-etcd'
  | 'rotation'
  | 'no-leak'
  | 'gitops-tool'
  | 'disk-encryption'
  | 'no-pod'
  | 'store-down'
  | 'not-applicable'

/**
 * Places where a copy of the value (or its ciphertext / a reference to it) lives – the „assets” of the threat model.
 * See assetsOf() in assets.ts.
 */
export type AssetKind =
  | 'git-plain' // Dockerfile ENV, env literal or ConfigMap in Git history (plain text)
  | 'git-base64' // Secret manifest in Git history (base64 = plain text)
  | 'git-sealed' // SealedSecret ciphertext in Git
  | 'git-sops' // SOPS-encrypted file in Git
  | 'git-reference' // ExternalSecret / SecretProviderClass / argocd-vault-plugin placeholder (no value)
  | 'image' // ENV in image layers in the registry
  | 'etcd' // the carrier object (Secret / ConfigMap / Deployment) in etcd, served by the API
  | 'sealed-object' // SealedSecret object in the cluster (ciphertext)
  | 'store' // external store: Vault / OpenBao / cloud secret manager
  | 'redis' // Argo CD manifest cache
  | 'pod-env' // environment variable of a running Pod
  | 'pod-file' // mounted file (volume / subPath / CSI tmpfs) of a running Pod
  | 'log' // Pod logs and the central log system
  | 'ci-log'
  | 'laptop-file' // local plaintext secret.yaml
  | 'memory' // what a former team member remembers

export type AssetForm = 'plain' | 'base64' | 'encrypted' | 'reference'

export interface Asset {
  /** Stable id (= kind; one asset per kind and secret) */
  id: AssetKind
  kind: AssetKind
  /** Graph node to highlight */
  node: GraphNodeId
  /** Croatian label („Secret klopa-db u bazi etcd”) */
  label: string
  /** How the value is stored there (etcd with `identity` is `plain`: base64 is only the API representation) */
  form: AssetForm
  /** Value versions present (empty for references) */
  versions: number[]
  /** Holds a version that is still valid (not revoked) */
  valid: boolean
  /** Croatian note on what protects it, or null („šifrirano: KMS v2 – ključ u vanjskom KMS-u”) */
  protection: string | null
  /** Actors that read a still-valid value through this asset (from the evaluation; every actor) */
  readers: ActorId[]
  /** `readers` restricted to the eyes shown by the UI (`config.visibleActors`) – use this on asset cards */
  visibleReaders: ActorId[]
}

export interface AccessPath {
  /** Stable id, e.g. `git:base64:secret.yaml` */
  id: string
  channel: Channel
  /** Asset(s) the value is read from (filled by the evaluator) */
  assets: AssetKind[]
  /** Route for the attempt animation (nodes visited in order) */
  hops: GraphNodeId[]
  /** Croatian label per hop (same length as hops) */
  steps: string[]
  /** Croatian one-line explanation of HOW */
  text: string
  /** Croatian short form of HOW (≤ 60 characters) for event texts („ključ za secretbox leži na istom disku”) */
  short: string
  /** What the actor does, as a command or a Croatian phrase (`kubectl get secrets -o yaml`) – for pickers */
  action: string
  /** Optional literal evidence (e.g. `DB_PASSWORD: a2xvcGFfZGI=`) */
  evidence?: string
  /** Value versions this path exposes */
  versions: number[]
  /** True if the path cannot be closed while the app needs the value (compromised Pod, Pod creators) */
  honestLimit: boolean
}

export interface BlockedAttempt {
  channel: Channel
  hops: GraphNodeId[]
  steps: string[]
  /** Index in `hops` where the attempt stops */
  blockedAt: number
  /** What the actor tries, as a command or a Croatian phrase (`kubectl get secrets -o yaml`) – for pickers */
  action: string
  /** Croatian reason („šifriranje u mirovanju (KMS v2): ključ je u vanjskom KMS-u”) */
  reason: string
  control: ControlId
}

export type VerdictLevel = 'reads' | 'stale' | 'none'

export interface Verdict {
  actorId: ActorId
  secretId: string
  /** red eye */
  reads: boolean
  /** reads = can read a still-valid value; stale = only revoked (rotated-out) values; none = nothing */
  level: VerdictLevel
  /** false when the actor does not exist in this setup (e.g. Argo CD cache with kubectl delivery) */
  applicable: boolean
  /** Paths that expose a still-valid value */
  paths: AccessPath[]
  /** Paths that expose only revoked values (harmless after rotation) */
  stalePaths: AccessPath[]
  /** Attempts that fail, with the control that stopped them */
  blocked: BlockedAttempt[]
  /** reads && every path is an honest limit (cannot be closed) */
  honestLimit: boolean
}

export interface AccessReport {
  secretId: string
  verdicts: Verdict[]
  /** Actors (all) that can read a valid value */
  red: ActorId[]
  /** Visible actors that can read / total visible actors */
  visibleRed: number
  visibleTotal: number
}

/* ---------- Config ---------- */

export interface SecretConfig {
  id: string
  /** Kubernetes object name, e.g. `klopa-db` */
  name: string
  /** Key / env var name, e.g. `DB_PASSWORD` */
  key: string
  /** Croatian label, nominative („Lozinka baze”) */
  label: string
  /** Croatian label, accusative lower-case („lozinku baze”) */
  labelAcc: string
  /** Value of version 1 */
  initialValue: string
  approach: Approach
}

export interface WorkloadConfig {
  id: string
  /** Deployment name; Pods are named `<name>-<n>` */
  name: string
  replicas: number
  consume: ConsumeMode
  secretIds: string[]
}

export interface TimingSim {
  kubeletSync: number
  esoRefresh: number
  argoPoll: number
  argoJitter: number
  argoWebhook: number
  csiRotationPoll: number
  /** Argo CD manifest cache lifetime (Redis); real `--repo-cache-expiration` 24 h */
  argoCacheExpiry: number
  sealedKeyRenewal: number
  unseal: number
  podStart: number
  podTerminate: number
  imageBuild: number
  attemptHop: number
}

export interface AccessConfig {
  seed: number
  /**
   * Secret the lecture goals refer to (L23: the SMS key, L16: the DB password). Default: the initial focus.
   * Unlike `focusSecretId` it does not follow setFocus(), so switching the eyes to another secret never re-judges a goal.
   */
  goalSecretId: string
  /**
   * Secrets whose initial Git commit is already a leak (L23 hook: the plain Secret someone stored in Git). Each gets a
   * LeakRecord (`initial: true`), so „Ispravno reagirajte na procurjeli commit” can be met without pressing a break-it.
   */
  leakedAtStart: string[]
  namespace: string
  secrets: SecretConfig[]
  workloads: WorkloadConfig[]
  /** Secret the eyes refer to by default */
  focusSecretId: string
  delivery: Delivery
  encryption: { provider: Provider; scope: EncryptionScope }
  /** Developer role: false = built-in `edit`, true = built-in `view` */
  leastPrivilege: boolean
  /** The app re-reads mounted files when they change (needed for rotation without restart) */
  appRereadsFiles: boolean
  /** Revoke older values automatically once every running consumer uses the new one */
  autoRevoke: boolean
  /**
   * Explorer mode (L16): switching approach/consumption rewrites the setup as if it had always been so
   * (history of that secret is reset, Pods reconfigured instantly). false (L23): history accumulates,
   * spec changes roll out new Pods.
   */
  whatIf: boolean
  sealed: { keyBackup: boolean; autoRenew: boolean }
  sops: { decryptor: SopsDecryptor }
  csi: { rotation: boolean; syncSecret: boolean }
  /**
   * Argo CD: `webhook` (Git push → refresh in ~1 s); `autoSync` = the Application has `syncPolicy.automated`
   * (default true here – the Klopa Application enables it; Argo CD's own default is manual sync). With autoSync
   * false a poll or webhook only reports OutOfSync; argoSyncNow() applies.
   */
  argo: { webhook: boolean; autoSync: boolean }
  store: { kind: StoreKind; available: boolean }
  laptop: { diskEncrypted: boolean; hasSopsKey: boolean }
  /** The ex-team-member eye starts knowing version 1 of every secret (L23 story: Davor left) */
  exEmployeeKnowsInitial: boolean
  timing: TimingSim
  /** Eyes shown by the UI (evaluation always covers every actor) */
  visibleActors: ActorId[]
}

/** Input to createAccess: every field optional, nested objects merged with defaults. */
export interface AccessConfigInput {
  seed?: number
  namespace?: string
  secrets?: (Partial<SecretConfig> & { id: string })[]
  workloads?: (Partial<WorkloadConfig> & { id: string })[]
  focusSecretId?: string
  goalSecretId?: string
  leakedAtStart?: string[]
  delivery?: Delivery
  encryption?: Partial<AccessConfig['encryption']>
  leastPrivilege?: boolean
  appRereadsFiles?: boolean
  autoRevoke?: boolean
  whatIf?: boolean
  sealed?: Partial<AccessConfig['sealed']>
  sops?: Partial<AccessConfig['sops']>
  csi?: Partial<AccessConfig['csi']>
  argo?: Partial<AccessConfig['argo']>
  store?: Partial<AccessConfig['store']>
  laptop?: Partial<AccessConfig['laptop']>
  exEmployeeKnowsInitial?: boolean
  timing?: Partial<TimingSim>
  visibleActors?: ActorId[]
}

/* ---------- Runtime state ---------- */

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral'

export type EventKind =
  | 'rotation'
  | 'leak'
  | 'attempt'
  | 'pod'
  | 'sync'
  | 'eso'
  | 'csi'
  | 'sealed'
  | 'rbac'
  | 'encryption'
  | 'store'
  | 'cluster'
  | 'config'
  | 'git'

export interface AccessEvent {
  id: number
  /** simulated seconds */
  t: number
  kind: EventKind
  /** short Croatian sentence (identical repeats at the same t are merged: „… (×2)”) */
  text: string
  /** how many identical events were merged into this one (1 = none) */
  count: number
  /** events of one group replace each other (e.g. `key-renewal`: one row for the growing key ring) */
  group?: string
  tone: Tone
  secretId?: string
  actorId?: ActorId
  podId?: string
}

export interface SecretVersion {
  v: number
  value: string
  createdAt: number
  /** null while the backend (DB, SMS gateway) still accepts it */
  revokedAt: number | null
}

export type ObjKind = 'Secret' | 'ConfigMap' | 'Deployment'

/** The Kubernetes object that carries the value inside the cluster (stored in etcd). */
export interface ClusterObject {
  exists: boolean
  kind: ObjKind | null
  version: number | null
  /** Provider the object was written with (identity = plaintext in etcd) */
  storedProvider: Provider
  writtenAt: number
}

export type GitForm = 'dockerfile-env' | 'manifest-env' | 'configmap' | 'base64' | 'sealed' | 'sops' | 'reference' | 'image-tag'

export interface GitCommit {
  seq: number
  /** fake short hash, deterministic */
  sha: string
  t: number
  secretId: string
  file: string
  form: GitForm
  /** value version contained (null for pure references) */
  version: number | null
  /** sealing key used (form `sealed`) */
  keyId: string | null
  /** created by the „Spremi secret.yaml u Git” break-it */
  leak: boolean
  /** removed from the branch (force-push) – still present in every clone */
  removedFromBranch: boolean
  /** Croatian commit message */
  message: string
}

export interface ImageRecord {
  tag: string
  secretId: string
  version: number
  t: number
}

export interface SealingKey {
  id: string
  createdAt: number
  compromised: boolean
  /**
   * Provider the key's Secret (kube-system, label sealedsecrets.bitnami.com/sealed-secrets-key) was last written with:
   * the controller keeps its private keys as ordinary Secrets, so an etcd copy or disk can contain them.
   */
  storedProvider: Provider
}

export interface RotationRecord {
  id: number
  secretId: string
  fromVersion: number
  toVersion: number
  startedAt: number
  /** when the cluster-side carrier (Secret/ConfigMap/spec/store) first held the new value */
  deliveredAt: number | null
  /** when every running consumer used the new value */
  completedAt: number | null
  /** when older versions were revoked */
  revokedAt: number | null
  /**
   * Pods created for consuming workloads while the rotation was in progress, plus Running consumer Pods
   * removed by a scale-down (scaling to 0 and back replaces every Pod – that is a restart too)
   */
  restartsDuring: number
  /** Croatian reason when the rotation cannot progress right now (store down, no key to unseal, refreshInterval 0) */
  stalled: string | null
  /** Croatian caveat that does not block progress (e.g. the new value was sealed with a leaked key) */
  warning: string | null
  /**
   * Real-time equivalent of the elapsed time (s): every simulated second is weighted by the compression of the
   * mechanism the rotation was waiting for (Argo CD poll ×10, kubelet ×9, CSI poll ×6, CI build ×30; ESO
   * refreshInterval, webhook, unseal, Pod start and user actions ×1). See `RotationWait` and README.
   */
  realElapsed: number
  /** simulated seconds spent waiting for each mechanism */
  waits: Partial<Record<RotationWait, number>>
  /** running consumer Pods when the rotation completed (0 = it completed vacuously, e.g. no Pod was running) */
  consumersAtCompletion: number
}

/**
 * What an active rotation is waiting for (decides the real-time weight of a simulated second).
 * - `argo-poll` / `argo-webhook` / `manual-sync`: the new commit waits for Argo CD (poll, webhook, or a manual Sync)
 * - `unseal`: the Sealed Secrets controller · `eso-refresh`: the next ExternalSecret refresh · `image-build`: CI
 * - `kubelet`: a mounted Secret/ConfigMap file waits for the kubelet sync (also a stuck Pod whose Secret now exists,
 *   waiting for the kubelet to retry) · `csi-poll`: CSI rotation poll
 * - `argo-cache`: argocd-vault-plugin waits for Argo CD to regenerate the manifests (cache expiry, 24 h) – counted ×1
 *   while a hard refresh could end it; re-weighted to the cache ratio if the expiry ends it
 * - `pod-start`: new Pods are starting (rollout) · `action`: needs a user action (restart, hard refresh)
 * - `blocked`: cannot progress (store down, no key, refreshInterval 0, a consumer Pod stuck on a missing Secret)
 */
export type RotationWait =
  | 'argo-poll'
  | 'argo-webhook'
  | 'manual-sync'
  | 'unseal'
  | 'eso-refresh'
  | 'image-build'
  | 'kubelet'
  | 'csi-poll'
  | 'argo-cache'
  | 'pod-start'
  | 'action'
  | 'blocked'

export type RotationMarkKind = 'rotated' | 'delivered' | 'file' | 'app' | 'pod-started' | 'completed' | 'revoked'

export interface RotationMark {
  t: number
  secretId: string
  podId: string | null
  /** Deployment of the Pod (stable lane id for the timeline scene; null for secret-level marks) */
  workloadId: string | null
  /** how that Deployment consumed the value at the time of the mark (null for secret-level marks) */
  consume: ConsumeMode | null
  kind: RotationMarkKind
  version: number
}

export interface SecretRuntime {
  id: string
  name: string
  key: string
  label: string
  labelAcc: string
  approach: Approach
  versions: SecretVersion[]
  /** newest version (the one the source of truth holds) */
  current: number
  obj: ClusterObject
  /** image / manifest-env: version embedded in the Pod template */
  specVersion: number | null
  /** eso / csi / avp: version held by the external store (null: not written yet, e.g. migrated while the store was down) */
  storeVersion: number | null
  /** eso / csi / avp: when the store's value last reached the cluster (ESO sync, AVP render, CSI fetch); null = never */
  lastSyncedAt: number | null
  /** What Git HEAD holds for this secret's approach (`commitSeq` 0 = nothing) */
  head: { version: number | null; form: GitForm | null; keyId: string | null; commitSeq: number }
  /** last commit seq applied to the cluster (GitOps) */
  appliedSeq: number
  /** SealedSecret object in the cluster */
  sealedObj: { version: number; keyId: string } | null
  esoStatus: 'Ready' | 'SecretSyncedError' | null
  /** last ESO refresh (eso) */
  lastRefresh: number
  /** next ESO refresh (eso); Infinity with refreshInterval 0 („sync once”) */
  nextRefresh: number
  /** last / next CSI rotation poll (csi) */
  lastCsiPoll: number
  nextCsiPoll: number
  /** argocd-vault-plugin: store version in the manifests Argo CD last generated (null = never rendered) */
  avpRendered: number | null
  /** argocd-vault-plugin: when Argo CD last generated them from the store (null = never); regenerated at cache expiry */
  avpRenderedAt: number | null
  /** argocd-vault-plugin: the last generation failed (ComparisonError) – reported once per episode */
  avpError: boolean
  /** An image build is running for this version (image approach) */
  buildingVersion: number | null
  rotation: RotationRecord | null
  rotations: RotationRecord[]
}

/** kubectl STATUS of an app Pod (named AppPodStatus so it does not clash with the kit's PodStatus). */
export type AppPodStatus = 'ContainerCreating' | 'Running' | 'CreateContainerConfigError' | 'Terminating'

export interface AppPod {
  id: string
  workloadId: string
  status: AppPodStatus
  /** `FailedMount` while stuck in ContainerCreating, `CreateContainerConfigError`, or null */
  reason: string | null
  /** kubelet-style message (English, as kubectl shows it) */
  message: string | null
  createdAt: number
  /** container start scheduled at this time (null while waiting for dependencies) */
  startAt: number | null
  runningSince: number | null
  terminateAt: number | null
  /** cluster generation this Pod belongs to */
  generation: number
  /** replaced by a rollout */
  outdated: boolean
  /** template versions at creation (image / manifest-env) */
  specVersions: Record<string, number | null>
  /** env var value version captured at container start */
  env: Record<string, number | null>
  /** mounted file version (volume / subPath / CSI) */
  file: Record<string, number | null>
  /** version the app process actually uses */
  uses: Record<string, number | null>
  nextSync: number
  /** warned once that a file changed but the app does not re-read */
  warnedNoReread: Record<string, boolean>
}

export interface WorkloadRuntime {
  id: string
  name: string
  replicas: number
  consume: ConsumeMode
  secretIds: string[]
  podSeq: number
}

export interface LogEntry {
  t: number
  secretId: string
  version: number
  /** null for CI logs */
  podId: string | null
}

/**
 * A moving token. Attempts start at the actor's eye and travel to hops[0], hops[1], … (hops.length segments);
 * flows start AT hops[0] and travel to hops[1], … (hops.length − 1 segments). Values are updated on the internal
 * 0,1 s tick – for smooth 60 fps animation use the pure selector `tokenSegment(state, token)`.
 */
export interface Hop {
  hops: GraphNodeId[]
  /** simulated seconds per segment (base hop × `state.animScale` at creation, so tokens keep their wall-clock pace) */
  hopDur: number
  /** index of the hop the token is travelling to (flows: ≥ 1) */
  hopIndex: number
  /** 0..1 progress along the current segment */
  hopProgress: number
  /** 0..1 progress along the whole route */
  progress: number
}

/** When an attempt's outcome is decided: when the token arrives (default – the theft happens then) or at launch. */
export type AttemptResolve = 'arrival' | 'launch'

export interface Attempt extends Hop {
  id: string
  actorId: ActorId
  secretId: string
  steps: string[]
  /** outcome; preliminary (as at launch) until `decidedAt` is set when `resolve` is `arrival` */
  success: boolean
  channel: Channel
  /** Croatian explanation of the outcome */
  text: string
  /** Croatian short form (≤ 60 characters) used in the event „<subject> čita <secret>: <short>.” */
  short: string
  /** id of the AccessPath followed (success) or `blocked:<channel>:<i>` (blocked) – see attemptOptions() */
  pathId: string
  /** control that blocked it (blocked attempts) */
  control: ControlId | null
  startedAt: number
  doneAt: number | null
  resolve: AttemptResolve
  /** when the outcome was decided (launch, or arrival); null while a token with `resolve: 'arrival'` travels */
  decidedAt: number | null
  /** the outcome at arrival differs from the one shown at launch (the state changed during the flight) */
  changedOnArrival: boolean
  /** the route asked for (re-resolved at arrival) */
  request: { pathId: string | null; channel: Channel | null; strict: boolean }
  /** finished tokens stay visible this long (simulated s; ATTEMPT_LINGER × animScale) */
  linger: number
}

/** A decided attempt (kept after the token is gone; ≤ MAX_ATTEMPT_LOG). */
export interface AttemptLogEntry {
  id: string
  t: number
  actorId: ActorId
  secretId: string
  channel: Channel
  pathId: string
  success: boolean
}

/** Goals latched in `state.achieved` (per secret, except `survivedStoreOutage`). */
export type GoalId = 'rotateWithoutRestart' | 'rotateFast' | 'leakHandled' | 'survivedStoreOutage' | 'podCreatorShown'

export type FlowKind =
  | 'commit'
  | 'sync'
  | 'eso'
  | 'unseal'
  | 'kubelet'
  | 'csi'
  | 'build'
  | 'log'
  | 'ci-log'
  | 'restore'
  | 'store-write' // laptop → store: a new value written to the external store
  | 'cache' // argocd → redis: a newly generated manifest with a readable value lands in Argo CD's cache

/** Cosmetic propagation token (e.g. store → ESO → API). The model effect has already happened. */
export interface Flow extends Hop {
  id: string
  kind: FlowKind
  secretId: string
  version: number
  startedAt: number
  duration: number
}

/** Manifest Argo CD generated with a readable value; kept in its Redis cache until `argoCacheExpiry`. */
export interface RedisRender {
  secretId: string
  version: number
  approach: Approach
  t: number
}

/** One „Trezor nedostupan” period (goal „Preživite nedostupan trezor”). */
export interface StoreOutage {
  from: number
  /** null while the store is still down */
  to: number | null
  /**
   * consumer Pods of a store-backed secret (ESO / CSI / AVP) that reached Running during the outage on a value the
   * store had delivered BEFORE the outage (a Pod running on a leftover non-store Secret does not count)
   */
  podsStarted: number
  /** consumer Pods of a store-backed secret that got stuck (FailedMount / CreateContainerConfigError) during it */
  podsBlocked: number
}

/** A „Spremi (običan) Secret u Git” leak (goal „Ispravno reagirajte na procurjeli commit”). */
export interface LeakRecord {
  secretId: string
  /** leaked value version */
  version: number
  sha: string
  t: number
  /** when the leaked value was revoked and Git no longer exposed a valid value (null = still open) */
  closedAt: number | null
  /** the setup started with this leak (config.leakedAtStart) – not a break-it press */
  initial: boolean
}

export interface Incidents {
  outages: StoreOutage[]
  /** rotations refused because the store was down */
  rotationsRefused: number
  leaks: LeakRecord[]
}

/** A period during which an actor could read a still-valid value (sampled once per simulated second). */
export interface ExposureWindow {
  actorId: ActorId
  secretId: string
  from: number
  /** null while still open */
  to: number | null
  /** valid versions readable during the window */
  versions: number[]
}

export interface ScheduledOp {
  seq: number
  at: number
  kind: 'image-built' | 'unseal' | 'argo-sync' | 'eso-refresh'
  secretId: string | null
  version: number | null
}

export interface AccessMetrics {
  /** visible red eyes for the focused secret, one sample per simulated second */
  redEyes: Series
  /** running app Pods */
  running: Series
  /** running consumers whose value is not the newest (focused secret) */
  stale: Series
  /** running consumers using a revoked value (failing logins) */
  authFailing: Series
  nextSample: number
}

export interface AccessState {
  config: AccessConfig
  /** simulated seconds */
  t: number
  tick: number
  acc: number
  rngTiming: Rng
  rngValues: Rng
  secrets: SecretRuntime[]
  workloads: WorkloadRuntime[]
  pods: AppPod[]
  commits: GitCommit[]
  images: ImageRecord[]
  sealedKeys: SealingKey[]
  /**
   * Ids of sealing keys whose private part leaked (leakControllerKey, or an etcd copy / disk that held the key Secrets
   * readable) – stays leaked even if the ring is later lost or replaced
   */
  leakedKeyIds: string[]
  nextKeyRenewal: number
  lastArgoPoll: number
  nextArgoPoll: number
  /** last commit seq already reported as OutOfSync (autoSync off) */
  argoNotifiedSeq: number
  /** manifests with readable values in Argo CD's Redis cache (gitops delivery only) */
  redisRendered: RedisRender[]
  /** cluster rebuild counter */
  generation: number
  bindings: Record<ActorId, RoleId[]>
  /** extra per-verb RBAC rules bound to an actor (setActorRules), unioned with `bindings`, with a Croatian label */
  customRules: Partial<Record<ActorId, { rules: PolicyRule[]; label: string }>>
  podLogs: LogEntry[]
  centralLogs: LogEntry[]
  ciLogs: LogEntry[]
  /** plaintext secret.yaml on the developer laptop */
  laptopFiles: { secretId: string; version: number }[]
  exEmployeeKnows: { secretId: string; version: number }[]
  attempts: Attempt[]
  /** decided attempts, newest last (≤ MAX_ATTEMPT_LOG) – survives the tokens */
  attemptLog: AttemptLogEntry[]
  flows: Flow[]
  /**
   * Cosmetic: hop and linger durations of NEW tokens are multiplied by it (set it to the playback speed with
   * setAnimationScale, so tokens keep a constant wall-clock pace at 4×). Never changes a model outcome.
   */
  animScale: number
  events: AccessEvent[]
  marks: RotationMark[]
  ops: ScheduledOp[]
  metrics: AccessMetrics
  incidents: Incidents
  /** who could read which secret, when (sampled once per simulated second, ≤ MAX_EXPOSURE windows) */
  exposure: ExposureWindow[]
  /** latched goals: `${GoalId}:${secretId}` (or `survivedStoreOutage`) → simulated time first achieved */
  achieved: Record<string, number>
  seq: { commit: number; attempt: number; flow: number; event: number; op: number; rotation: number; image: number; key: number }
}
