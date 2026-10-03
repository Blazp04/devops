/**
 * E6 constants: real defaults vs classroom (sim) values, JSON-pointer paths and Klopa names.
 * Sources: docs/research/tech-facts.md §5 and the Argo CD v3.5.3 source (see README „Izvori”).
 */
import type { Kind, ResolvedConfig } from './types.ts'

/** Internal fixed step (s). Same 100 ms tick as the rollout model in sim-models.md (SIM 5). */
export const DT = 0.1

/** A value shortened for the classroom: show `label` next to it (AUTHORING §5 „Compressed time must be labelled”). */
export interface TimingValue {
  simValue: number
  realValue: number
  unit: 's'
  /** Croatian badge text, e.g. „12 s (sim) · stvarno: 120 s” */
  label: string
  /** true when simValue ≠ realValue */
  compressed: boolean
}

const tv = (simValue: number, realValue: number, label: string): TimingValue => ({ simValue, realValue, unit: 's', label, compressed: simValue !== realValue })

export const TIMINGS = {
  /** Argo CD `timeout.reconciliation` (Git polling). Real 120 s, compressed ÷10. */
  poll: tv(12, 120, '12 s (sim) · stvarno: 120 s'),
  /** `timeout.reconciliation.jitter`: up to 60 s extra (uniform). Compressed ÷10. */
  pollJitter: tv(6, 60, 'do 6 s (sim) · stvarno: do 60 s'),
  /** Poll interval + jitter, the ring label. */
  pollTotal: tv(18, 180, '12–18 s (sim) · stvarno: 120 s + do 60 s (najviše oko 3 min)'),
  /** Git webhook → Argo CD refresh. Real: about a second. */
  webhook: tv(1, 1, '≈ 1 s'),
  /** Argo CD watches the live cluster; the model re-compares the cached live state every second. */
  liveCompare: tv(1, 1, '≈ 1 s'),
  /**
   * First self-heal of a drift (Argo CD 3.x: --self-heal-timeout-seconds 0): as soon as the controller notices the change
   * (watch ≈ 1 s) plus the 0,5 s apply of the model → 1,6 s in the sim. Repeated drift on the same revision backs off.
   */
  selfHealFirst: tv(1.6, 1.6, 'čim Argo CD primijeti (≈ 1–2 s); ponovljeno odstupanje: 2 s, 6 s, 18 s … najviše 5 min'),
  /** Self-heal backoff in Argo CD 3.x (controller flags --self-heal-backoff-*): 2 s × 3, max 300 s. Not compressed. */
  selfHealBackoffInitial: tv(2, 2, '2 s, zatim 6 s, 18 s … najviše 5 min'),
  /** Legacy fixed self-heal timeout (--self-heal-timeout-seconds), described as „5 s” on the auto-sync docs page. */
  selfHealLegacyTimeout: tv(5, 5, '5 s'),
  /** Sync retry backoff (syncPolicy.retry.backoff defaults): 5 s × 2, max 3 min. Not compressed. */
  syncRetry: tv(5, 5, '5 s, 10 s, 20 s … najviše 3 min'),
  /** Delay between sync waves. */
  syncWaveDelay: tv(2, 2, '2 s'),
  /** progressDeadlineSeconds set in the Klopa manifest (legit field value); real default 600. */
  progressDeadline: tv(60, 600, '60 s (u YAML-u) · zadano: 600 s'),
  /** readinessProbe.periodSeconds set in the Klopa manifest; real default 10. */
  readinessPeriod: tv(2, 10, '2 s (u YAML-u) · zadano: 10 s'),
  /** HPA sync period (--horizontal-pod-autoscaler-sync-period). */
  hpaPeriod: tv(15, 15, '15 s'),
  /** HPA scale-down stabilisation window. */
  hpaDownStabilization: tv(300, 300, '300 s'),
  /** CI pipeline (build + test + push). Real: minutes (L21 target < 10 min). */
  ci: tv(10, 600, '10 s (sim) · stvarno: nekoliko minuta'),
  /** ExternalSecret refreshInterval used in the Klopa manifest (`30s`); ESO default is 1h. */
  esoRefresh: tv(30, 3600, '30 s (u YAML-u) · zadano: 1 h'),
  /** Secret volume update after a change: kubelet sync period + cache delay. */
  volumeSync: tv(10, 90, '10 s (sim) · stvarno: s odgodom sinkronizacije kubeleta (do oko minute i pol)'),
  /** Sealed Secrets controller: new sealing key every 30 days (old keys kept). Compressed like E5 (60 s sim). */
  sealingKeyRenewal: tv(60, 30 * 24 * 3600, '60 s (sim) · stvarno: svakih 30 dana'),
  /** Secrets Store CSI Driver `--rotation-poll-interval` (rotation is alpha and off by default). Same value as E5. */
  csiRotation: tv(20, 120, '20 s (sim) · stvarno: 2 min (rotation-poll-interval)'),
  /** Argo CD repo-server manifest cache in Redis (`--repo-cache-expiration`, default 24 h). Compressed like E5 (×120). */
  argoCacheExpiry: tv(720, 24 * 3600, '12 min (sim) · stvarno: 24 h (--repo-cache-expiration)'),
} as const

/**
 * Real-time factor of each compressed wait, for „X s (sim) · stvarno: Y” labels of a commit's journey (`commitTimeline`,
 * `commitLatency`). Polling ×10 (12 s ↔ 120 s), CI ×60 (10 s ↔ ~10 min); webhook, sync and Pods run in real time.
 */
export const REAL_FACTOR = {
  poll: TIMINGS.poll.realValue / TIMINGS.poll.simValue,
  ci: TIMINGS.ci.realValue / TIMINGS.ci.simValue,
  webhook: 1,
  sync: 1,
  pods: 1,
} as const

/** Pod lifecycle timings – identical to the validated rollout prototype (docs/research/proto/rollout-sim.ts). */
export const POD_TIMINGS = {
  scheduleS: 1,
  /** pull of an image not yet cached on the node; cached images start immediately */
  pullS: 4,
  appStartS: 6,
  /** readinessProbe.periodSeconds: 2 in the Klopa YAML (real default 10) */
  probePeriodS: 2,
  /** shutdown until the Pod object is gone (prototype value; terminating Pods are not counted by the rollout maths) */
  terminationS: 5,
  /** a crashing image exits this long after start */
  crashAfterS: 3,
} as const

/**
 * Entity caps (AUTHORING §5). The Klopa namespace has a ResourceQuota `pods: 50` (`KLOPA.quota`): any replica count is
 * accepted (spec.replicas is an int32), but the ReplicaSet controller cannot create Pods beyond the quota – exactly
 * what Kubernetes does (event FailedCreate „exceeded quota”, the rollout stalls). So a typo like `replicas: 60000`
 * shows real symptoms instead of freezing the browser.
 */
export const POD_QUOTA = 50
/** spec.replicas is an int32 in the API. */
export const MAX_INT32 = 2147483647
/** Deployment `revisionHistoryLimit` default: old ReplicaSets kept for rollback. */
export const REVISION_HISTORY_LIMIT = 10
/** Kubernetes events kept per Pod (`kubectl describe pod`) and per namespace (`kubectl get events`). */
export const POD_EVENT_CAP = 12
export const KUBE_EVENT_CAP = 100
/** Live-change feed entries kept until `drainLiveChanges` takes them. */
export const LIVE_CHANGE_CAP = 500

/** CrashLoopBackOff: 10 s, 20 s, 40 s … capped at 300 s (kubelet defaults). */
export const CRASH_BACKOFF = { initialS: 10, capS: 300 } as const

/** Argo CD sync retry defaults (pkg/apis/application/v1alpha1: DefaultSyncRetryDuration/Factor/MaxDuration). */
export const SYNC_RETRY_DEFAULTS = { durationS: 5, factor: 2, maxDurationS: 180 } as const
/** Automated syncs get `retry: { limit: 5 }` when `syncPolicy.retry` is not set (controller/appcontroller.go). */
export const AUTO_SYNC_DEFAULT_RETRY_LIMIT = 5

/** Argo CD health order (gitops-engine health.IsWorse): later = worse. */
export const HEALTH_ORDER = ['Healthy', 'Suspended', 'Progressing', 'Missing', 'Degraded', 'Unknown'] as const

/** JSON pointers used by the Klopa manifests. */
export const PATHS = {
  replicas: '/spec/replicas',
  image: '/spec/template/spec/containers/0/image',
  progressDeadline: '/spec/progressDeadlineSeconds',
  maxSurge: '/spec/strategy/rollingUpdate/maxSurge',
  maxUnavailable: '/spec/strategy/rollingUpdate/maxUnavailable',
  readinessPeriod: '/spec/template/spec/containers/0/readinessProbe/periodSeconds',
  envName: (i: number) => `/spec/template/spec/containers/0/env/${i}/name`,
  envValue: (i: number) => `/spec/template/spec/containers/0/env/${i}/value`,
  envSecretName: (i: number) => `/spec/template/spec/containers/0/env/${i}/valueFrom/secretKeyRef/name`,
  envSecretKey: (i: number) => `/spec/template/spec/containers/0/env/${i}/valueFrom/secretKeyRef/key`,
  volumeSecretName: '/spec/template/spec/volumes/0/secret/secretName',
  volumeCsiClass: '/spec/template/spec/volumes/0/csi/volumeAttributes/secretProviderClass',
  restartedAt: '/spec/template/metadata/annotations/kubectl.kubernetes.io~1restartedAt',
  selectorApp: '/spec/selector/matchLabels/app',
  templateApp: '/spec/template/metadata/labels/app',
  containerName: '/spec/template/spec/containers/0/name',
  containerPort: '/spec/template/spec/containers/0/ports/0/containerPort',
  cpuRequest: '/spec/template/spec/containers/0/resources/requests/cpu',
  memoryRequest: '/spec/template/spec/containers/0/resources/requests/memory',
  memoryLimit: '/spec/template/spec/containers/0/resources/limits/memory',
  readinessPath: '/spec/template/spec/containers/0/readinessProbe/httpGet/path',
  readinessPort: '/spec/template/spec/containers/0/readinessProbe/httpGet/port',
  livenessPath: '/spec/template/spec/containers/0/livenessProbe/httpGet/path',
  livenessPort: '/spec/template/spec/containers/0/livenessProbe/httpGet/port',
  livenessPeriod: '/spec/template/spec/containers/0/livenessProbe/periodSeconds',
  /** `kubectl rollout pause` – Argo CD health Suspended */
  paused: '/spec/paused',
  hpaMin: '/spec/minReplicas',
  hpaMax: '/spec/maxReplicas',
  hpaTarget: '/spec/scaleTargetRef/name',
  hpaTargetKind: '/spec/scaleTargetRef/kind',
  hpaTargetApi: '/spec/scaleTargetRef/apiVersion',
  hpaMetricType: '/spec/metrics/0/type',
  hpaMetricName: '/spec/metrics/0/resource/name',
  hpaTargetType: '/spec/metrics/0/resource/target/type',
  hpaCpuUtilization: '/spec/metrics/0/resource/target/averageUtilization',
  servicePort: '/spec/ports/0/port',
  serviceTargetPort: '/spec/ports/0/targetPort',
  serviceSelector: '/spec/selector/app',
  /** HTTPRoute rule i → backend Service name / port, path prefix */
  routeBackend: (i: number) => `/spec/rules/${i}/backendRefs/0/name`,
  routeBackendPort: (i: number) => `/spec/rules/${i}/backendRefs/0/port`,
  routePath: (i: number) => `/spec/rules/${i}/matches/0/path/value`,
  routePathType: (i: number) => `/spec/rules/${i}/matches/0/path/type`,
  routeParent: '/spec/parentRefs/0/name',
  routeHostname: '/spec/hostnames/0',
  jobImage: '/spec/template/spec/containers/0/image',
  jobBackoffLimit: '/spec/backoffLimit',
  data: (key: string) => `/data/${key}`,
  encryptedData: (key: string) => `/spec/encryptedData/${key}`,
  esoRefresh: '/spec/refreshInterval',
  esoStore: '/spec/secretStoreRef/name',
  esoRemoteKey: '/spec/data/0/remoteRef/key',
  esoSecretKey: '/spec/data/0/secretKey',
  esoTarget: '/spec/target/name',
} as const

/** Kubernetes defaults applied by the API server when a field is absent. */
export const API_DEFAULTS: Partial<Record<string, Record<string, number | string>>> = {
  Deployment: { [PATHS.replicas]: 1, [PATHS.progressDeadline]: 600, [PATHS.maxSurge]: '25%', [PATHS.maxUnavailable]: '25%' },
}

/** Klopa names (curriculum runningExample). */
export const KLOPA = {
  namespace: 'klopa',
  app: 'klopa-api',
  project: 'klopa',
  repoUrl: 'https://git.klopa.example/klopa/klopa-config.git',
  appPath: 'apps/klopa-api',
  registry: 'registry.klopa.example/klopa-api',
  ciBot: 'ci-bot',
  attacker: 'nepoznati-korisnik',
  /** namespace ResourceQuota (pods: POD_QUOTA) */
  quota: 'klopa-kvota',
  web: 'klopa-web',
  worker: 'klopa-worker',
  db: 'klopa-db',
  gateway: 'klopa-gateway',
  route: 'klopa',
  hostname: 'klopa.example',
  webRegistry: 'registry.klopa.example/klopa-web',
  workerRegistry: 'registry.klopa.example/klopa-worker',
  /** same pinned tag as E3 (src/engines/cluster/presets.ts POSTGRES_IMAGE) */
  postgresImage: 'postgres:18',
} as const

export const FILES = {
  deployment: `${KLOPA.appPath}/deployment.yaml`,
  service: `${KLOPA.appPath}/service.yaml`,
  promo: `${KLOPA.appPath}/configmap-promo.yaml`,
  hpa: `${KLOPA.appPath}/hpa.yaml`,
  migration: `${KLOPA.appPath}/migracija-job.yaml`,
  secret: `${KLOPA.appPath}/secret-sms.yaml`,
  sealedSecret: `${KLOPA.appPath}/sealedsecret-sms.yaml`,
  externalSecret: `${KLOPA.appPath}/externalsecret-sms.yaml`,
  sopsSecret: `${KLOPA.appPath}/secret-sms.enc.yaml`,
  /** L24 full config repo (`PRESETS.l24Full`, Application path `apps`, directory.recurse) */
  webDeployment: 'apps/klopa-web/deployment.yaml',
  webService: 'apps/klopa-web/service.yaml',
  workerDeployment: 'apps/klopa-worker/deployment.yaml',
  gateway: 'apps/gateway/gateway.yaml',
  httpRoute: 'apps/gateway/httproute.yaml',
  dbStatefulSet: 'apps/postgres/statefulset.yaml',
  dbService: 'apps/postgres/service.yaml',
  /** `PRESETS.l24FullDetailed`: the database password from the store (ExternalSecret klopa-db) */
  dbExternalSecret: 'apps/postgres/externalsecret-db.yaml',
} as const

/** apiVersion of every kind (YAML view, `argocd app diff`, `kubectl describe`). */
export const API_VERSIONS: Record<Kind, string> = {
  Deployment: 'apps/v1',
  Service: 'v1',
  HorizontalPodAutoscaler: 'autoscaling/v2',
  ConfigMap: 'v1',
  Secret: 'v1',
  SealedSecret: 'bitnami.com/v1alpha1',
  ExternalSecret: 'external-secrets.io/v1',
  Job: 'batch/v1',
  ClusterRoleBinding: 'rbac.authorization.k8s.io/v1',
  HTTPRoute: 'gateway.networking.k8s.io/v1',
  Gateway: 'gateway.networking.k8s.io/v1',
  StatefulSet: 'apps/v1',
  PersistentVolumeClaim: 'v1',
}

/** GnuPG key ids (fictional) of people/bots whose public keys are in Argo CD's keyring and in the AppProject policy. */
export const TRUSTED_KEYS: Record<string, string> = {
  Lana: '3B7E91C40D2A58F6',
  Davor: '9F3C2E71B0D4A615',
  [KLOPA.ciBot]: 'C1B07A5E2D9F4431',
}

/**
 * `syncPolicy.retry` values for a „retry” control. `notSet` is Argo CD's default: automated syncs still retry
 * 5× (argo-cd controller/appcontroller.go `Retry: RetryStrategy{Limit: 5}`), manual syncs never. `none` disables
 * retries for automated syncs too. Back-off is always 5 s × 2ⁿ, at most 3 min unless `backoff` is given.
 */
export const RETRY_PRESETS = {
  notSet: null,
  none: { limit: 0 },
  five: { limit: 5 },
  unlimited: { limit: -1 },
} as const

export type RetryPresetId = keyof typeof RETRY_PRESETS

/** Croatian labels for a „retry” Segmented control (a plain on/off Toggle cannot show „not set” = automatic 5×). */
export const RETRY_LABELS: Record<RetryPresetId, string> = {
  notSet: 'nije postavljen (automatska 5×, ručna 0)',
  none: 'isključen (limit: 0)',
  five: '5× (limit: 5)',
  unlimited: 'neograničeno (limit: -1)',
}

export const DEFAULT_CONFIG: ResolvedConfig = {
  seed: 22,
  mode: 'pull',
  pollIntervalS: TIMINGS.poll.simValue,
  pollJitterS: TIMINGS.pollJitter.simValue,
  webhookDelayS: TIMINGS.webhook.simValue,
  compareIntervalS: TIMINGS.liveCompare.simValue,
  applyS: 0.5,
  syncWaveDelayS: TIMINGS.syncWaveDelay.simValue,
  selfHeal: { mode: 'backoff', initialS: 2, factor: 3, capS: 300 },
  autoSyncDefaultRetry: { limit: AUTO_SYNC_DEFAULT_RETRY_LIMIT, ...SYNC_RETRY_DEFAULTS },
  pod: { ...POD_TIMINGS },
  hpaPeriodS: TIMINGS.hpaPeriod.simValue,
  hpaDownStabilizationS: TIMINGS.hpaDownStabilization.simValue,
  jobDurationS: 3,
  ciDurationS: TIMINGS.ci.simValue,
  unsealS: 1,
  sealedResyncS: 5,
  sealingKeyAutoRenew: false,
  sealingKeyRenewalS: TIMINGS.sealingKeyRenewal.simValue,
  volumeSyncS: TIMINGS.volumeSync.simValue,
  csiRotation: false,
  csiRotationS: TIMINGS.csiRotation.simValue,
  argoCacheExpiryS: TIMINGS.argoCacheExpiry.simValue,
  podQuota: POD_QUOTA,
  historyLimit: 10,
  seriesLength: 240,
}
