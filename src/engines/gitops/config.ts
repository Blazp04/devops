/** E6 configuration input, defaults and lecture presets. */
import type { Fields, HookPhase, IgnoreRule, ImageBehaviour, Manifest, PodTimings, RepoFiles, RepoProtection, ResolvedConfig, SelfHealTiming, SourcePlugin, SyncPolicy } from './types.ts'
import { DEFAULT_CONFIG, FILES, KLOPA, PATHS } from './constants.ts'

export type SecretsApproach = 'none' | 'plain' | 'sealed' | 'sops' | 'eso' | 'csi' | 'avp' | 'manual'

/** Where the DB migration Job runs: not at all, as a PreSync hook, or as a Sync hook in wave −1 (L22 DeepDive). */
export type MigrationMode = 'none' | 'presync' | 'wave'

export interface GitOpsConfig {
  /** RNG seed (poll jitter, Pod name suffixes). Default 22. */
  seed?: number
  /** 'pull' = GitOps with Argo CD (default); 'push' = CI applies to the cluster with its own credentials, no controller. */
  mode?: 'pull' | 'push'
  /** Override timings (sim seconds). Defaults: DEFAULT_CONFIG / TIMINGS. */
  timing?: Partial<Omit<ResolvedConfig, 'seed' | 'mode' | 'pod'>> & { pod?: Partial<PodTimings> }
  /** Application.spec.syncPolicy. Defaults = Argo CD defaults: manual sync, prune/selfHeal/allowEmpty off, retry not set. */
  policy?: Partial<SyncPolicy>
  ignoreDifferences?: IgnoreRule[]
  /** Git webhook to Argo CD configured (default false → polling only). */
  webhook?: boolean
  /** Config Management Plugin. Default: 'argocd-vault-plugin' for secrets 'avp', 'ksops' for secrets 'sops', else 'none'. */
  sourcePlugin?: SourcePlugin
  /** AppProject: restricted = only namespace klopa, no cluster-scoped kinds; sourceIntegrity gpg mode. Default: `default`-like project (allows everything), none. */
  project?: { restricted?: boolean; sourceIntegrity?: 'none' | 'head' | 'strict' }
  /** Git host branch protection on main (default: both off). */
  protection?: Partial<RepoProtection>
  /** klopa-api tag running at start (default 1.4.0, the version in production after L20's rollback). */
  initialTag?: string
  /** spec.replicas in Git (default 4); null = field omitted (HPA-managed). */
  replicas?: number | null
  /** add hpa.yaml (HorizontalPodAutoscaler klopa-api) to Git. */
  hpa?: { min: number; max: number } | null
  /** replicas the current load needs (HPA demand). Default: 6 when an HPA exists, else 0 (= no opinion). */
  hpaDemand?: number
  /** ConfigMap klopa-promo in Git (the file to delete for the prune demo). Default true. */
  promo?: boolean
  /** DB migration Job klopa-migracija: 'presync' hook or 'wave' (Sync hook, sync-wave −1). Default 'none'. */
  migration?: MigrationMode
  /** Deprecated alias: `migrationHook: true` = `migration: 'presync'`. */
  migrationHook?: boolean
  /** Extra plain sync waves: put the ConfigMap in wave -1 (ordering demo). Default false. */
  configMapWaveMinus1?: boolean
  /** L23 secret approach for the SMS gateway key (Secret klopa-sms, key kljuc). Default 'none'. */
  secrets?: SecretsApproach
  /** how klopa-api consumes the Secret: env (secretKeyRef) or volume. Default 'env'. */
  secretConsumption?: 'env' | 'volume'
  /**
   * Registry catalogue (klopa-api unless `repo` is given). Default: the E3 story chain – 1.3.2, 1.4.0, 2.0.1 ok;
   * 2.0.0 ok but 20 % of its requests fail (the L20 VAT bug, E3 KLOPA_API_VERSIONS); 1.5.0 crashes.
   */
  images?: ImageSpec[]
  /**
   * Extra files for the initial commit, applied like every other file (L24 „Uređivač config repozitorija”): any kind,
   * any path. A path outside the Application path (`app.path`) is in Git but not deployed.
   */
  extraFiles?: RepoFiles
  /** Argo CD Application name and repo path (default `klopa-api`, `apps/klopa-api`; `l24Full`: `klopa`, `apps` with directory.recurse). */
  app?: { name?: string; path?: string }
  /**
   * Extra keys in the external secret store (remote key → value) next to the SMS key, e.g. the database password
   * for `PRESETS.l24FullDetailed`. Default none.
   */
  storeValues?: Record<string, string>
}

export interface ImageSpec {
  tag: string
  behaviour: ImageBehaviour
  /** image repository (default the klopa-api repository) */
  repo?: string
  /** share of failing requests of a Ready build (see ImageInfo.bugRate) */
  bugRate?: number
}

export const DEFAULT_IMAGES: ImageSpec[] = [
  { tag: '1.3.2', behaviour: 'ok' },
  { tag: '1.4.0', behaviour: 'ok' },
  { tag: '1.4.1', behaviour: 'ok' },
  { tag: '1.5.0', behaviour: 'crash' },
  { tag: '2.0.0', behaviour: 'ok', bugRate: 0.2 },
  { tag: '2.0.1', behaviour: 'ok' },
]

/** Images of the other Klopa services (`l24Full`; same tags as E3). */
export const KLOPA_SERVICE_IMAGES: ImageSpec[] = [
  { repo: KLOPA.webRegistry, tag: '1.4.0', behaviour: 'ok' },
  { repo: KLOPA.workerRegistry, tag: '1.3.2', behaviour: 'ok' },
]

export const DEFAULT_POLICY: SyncPolicy = {
  automated: false,
  prune: false,
  selfHeal: false,
  allowEmpty: false,
  retry: null,
  respectIgnoreDifferences: false,
}

export const SMS = {
  secretName: 'klopa-sms',
  secretKey: 'kljuc',
  remoteKey: 'klopa/sms-kljuc',
  envName: 'SMS_API_KLJUC',
  store: 'klopa-trezor',
  initialValue: 'sms-kljuc-v1',
} as const

/** A finite number ≥ min, else the default (NaN, ±Infinity, strings → default). */
function num(v: unknown, def: number, min: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(min, v) : def
}

function selfHealTiming(v: unknown): SelfHealTiming {
  const d = DEFAULT_CONFIG.selfHeal
  if (typeof v !== 'object' || v === null) return { ...d }
  const o = v as Partial<Record<string, unknown>>
  if (o.mode === 'timeout') return { mode: 'timeout', timeoutS: num(o.timeoutS, 5, 0) }
  if (d.mode !== 'backoff') return { ...d }
  return { mode: 'backoff', initialS: num(o.initialS, d.initialS, 0), factor: num(o.factor, d.factor, 1), capS: num(o.capS, d.capS, 0) }
}

/** Defaults + overrides; every numeric field is checked (NaN / Infinity / negative → default or clamped), so a bad value can never stall the loop. */
export function resolveConfig(input: GitOpsConfig): ResolvedConfig {
  const t: Partial<Record<string, unknown>> = input.timing ?? {}
  const D = DEFAULT_CONFIG
  const pod: Partial<Record<string, unknown>> = (input.timing?.pod as Partial<Record<string, unknown>> | undefined) ?? {}
  const r = (input.timing?.autoSyncDefaultRetry ?? {}) as Partial<Record<string, unknown>>
  return {
    seed: Number.isFinite(input.seed) ? Number(input.seed) : D.seed,
    mode: input.mode === 'push' ? 'push' : 'pull',
    pollIntervalS: num(t.pollIntervalS, D.pollIntervalS, 0.1),
    pollJitterS: num(t.pollJitterS, D.pollJitterS, 0),
    webhookDelayS: num(t.webhookDelayS, D.webhookDelayS, 0),
    compareIntervalS: num(t.compareIntervalS, D.compareIntervalS, 0.1),
    applyS: num(t.applyS, D.applyS, 0),
    syncWaveDelayS: num(t.syncWaveDelayS, D.syncWaveDelayS, 0),
    selfHeal: selfHealTiming(t.selfHeal),
    autoSyncDefaultRetry: {
      limit: typeof r.limit === 'number' && Number.isInteger(r.limit) ? r.limit : D.autoSyncDefaultRetry.limit,
      durationS: num(r.durationS, D.autoSyncDefaultRetry.durationS, 0.1),
      factor: num(r.factor, D.autoSyncDefaultRetry.factor, 1),
      maxDurationS: num(r.maxDurationS, D.autoSyncDefaultRetry.maxDurationS, 0.1),
    },
    pod: {
      scheduleS: num(pod.scheduleS, D.pod.scheduleS, 0),
      pullS: num(pod.pullS, D.pod.pullS, 0),
      appStartS: num(pod.appStartS, D.pod.appStartS, 0),
      probePeriodS: num(pod.probePeriodS, D.pod.probePeriodS, 0.1),
      terminationS: num(pod.terminationS, D.pod.terminationS, 0),
      crashAfterS: num(pod.crashAfterS, D.pod.crashAfterS, 0.1),
    },
    hpaPeriodS: num(t.hpaPeriodS, D.hpaPeriodS, 0.1),
    hpaDownStabilizationS: num(t.hpaDownStabilizationS, D.hpaDownStabilizationS, 0),
    jobDurationS: num(t.jobDurationS, D.jobDurationS, 0.1),
    ciDurationS: num(t.ciDurationS, D.ciDurationS, 0.1),
    unsealS: num(t.unsealS, D.unsealS, 0),
    sealedResyncS: num(t.sealedResyncS, D.sealedResyncS, 0.1),
    sealingKeyAutoRenew: typeof t.sealingKeyAutoRenew === 'boolean' ? t.sealingKeyAutoRenew : D.sealingKeyAutoRenew,
    sealingKeyRenewalS: num(t.sealingKeyRenewalS, D.sealingKeyRenewalS, 1),
    volumeSyncS: num(t.volumeSyncS, D.volumeSyncS, 0),
    csiRotation: typeof t.csiRotation === 'boolean' ? t.csiRotation : D.csiRotation,
    csiRotationS: num(t.csiRotationS, D.csiRotationS, 0.1),
    argoCacheExpiryS: num(t.argoCacheExpiryS, D.argoCacheExpiryS, 1),
    podQuota: Math.floor(num(t.podQuota, D.podQuota, 0)),
    historyLimit: Math.floor(num(t.historyLimit, D.historyLimit, 1)),
    seriesLength: Math.floor(num(t.seriesLength, D.seriesLength, 2)),
  }
}

/** spec.replicas of the config: a non-negative integer, `null` (omitted) – anything else (NaN, -1, 2.5) → the default 4. */
export function configReplicas(input: GitOpsConfig): number | null {
  const r = input.replicas
  if (r === null) return null
  return typeof r === 'number' && Number.isInteger(r) && r >= 0 && r <= 2147483647 ? r : 4
}

export const imageRef = (tag: string) => `${KLOPA.registry}:${tag}`

/**
 * A valid apps/v1 Deployment as one object per file: selector + template labels, container name and port,
 * resources.requests (AUTHORING §4), readiness/liveness probes (paths as in E3: /ready, /healthz), rollout settings.
 */
export function workloadManifest(name: string, image: string, replicas: number | null, opts: { port?: number; memoryLimit?: string } = {}): Manifest {
  const port = opts.port ?? 8000
  const fields: Manifest['fields'] = {}
  if (replicas !== null) fields[PATHS.replicas] = replicas
  Object.assign(fields, {
    [PATHS.selectorApp]: name,
    [PATHS.progressDeadline]: 60,
    [PATHS.maxSurge]: '25%',
    [PATHS.maxUnavailable]: '25%',
    [PATHS.templateApp]: name,
    [PATHS.containerName]: name,
    [PATHS.image]: image,
    [PATHS.containerPort]: port,
    [PATHS.cpuRequest]: '100m',
    [PATHS.memoryRequest]: '128Mi',
    [PATHS.memoryLimit]: opts.memoryLimit ?? '256Mi',
    [PATHS.readinessPath]: '/ready',
    [PATHS.readinessPort]: port,
    [PATHS.readinessPeriod]: 2,
    [PATHS.livenessPath]: '/healthz',
    [PATHS.livenessPort]: port,
    [PATHS.livenessPeriod]: 10,
  })
  return { kind: 'Deployment', name, namespace: KLOPA.namespace, fields }
}

export function deploymentManifest(tag: string, replicas: number | null, secrets: SecretsApproach, consumption: 'env' | 'volume'): Manifest {
  const m = workloadManifest(KLOPA.app, imageRef(tag), replicas)
  const fields = m.fields
  fields[PATHS.envName(0)] = 'POPUST_CEVAP_PETAK'
  fields[PATHS.envValue(0)] = '20'
  if (secrets === 'csi') {
    fields[PATHS.volumeCsiClass] = SMS.remoteKey
  } else if (secrets !== 'none') {
    if (consumption === 'volume') fields[PATHS.volumeSecretName] = SMS.secretName
    else {
      fields[PATHS.envName(1)] = SMS.envName
      fields[PATHS.envSecretName(1)] = SMS.secretName
      fields[PATHS.envSecretKey(1)] = SMS.secretKey
    }
  }
  return m
}

export function serviceManifest(name: string = KLOPA.app, targetPort = 8000): Manifest {
  return {
    kind: 'Service',
    name,
    namespace: KLOPA.namespace,
    fields: { [PATHS.serviceSelector]: name, [PATHS.servicePort]: 80, [PATHS.serviceTargetPort]: targetPort },
  }
}

export function promoManifest(wave?: number): Manifest {
  return { kind: 'ConfigMap', name: 'klopa-promo', namespace: KLOPA.namespace, fields: { '/data/CEVAP_PETAK_POPUST': '20' }, ...(wave !== undefined ? { wave } : {}) }
}

export function hpaManifest(min: number, max: number, target: string = KLOPA.app): Manifest {
  return {
    kind: 'HorizontalPodAutoscaler',
    name: target,
    namespace: KLOPA.namespace,
    fields: {
      [PATHS.hpaTargetApi]: 'apps/v1',
      [PATHS.hpaTargetKind]: 'Deployment',
      [PATHS.hpaTarget]: target,
      [PATHS.hpaMin]: min,
      [PATHS.hpaMax]: max,
      [PATHS.hpaMetricType]: 'Resource',
      [PATHS.hpaMetricName]: 'cpu',
      [PATHS.hpaTargetType]: 'Utilization',
      [PATHS.hpaCpuUtilization]: 70,
    },
  }
}

/** Gateway API: the Klopa Gateway (HTTPS listener). */
export function gatewayManifest(): Manifest {
  return {
    kind: 'Gateway',
    name: KLOPA.gateway,
    namespace: KLOPA.namespace,
    fields: {
      '/spec/gatewayClassName': 'eg',
      '/spec/listeners/0/name': 'https',
      '/spec/listeners/0/protocol': 'HTTPS',
      '/spec/listeners/0/port': 443,
      '/spec/listeners/0/hostname': KLOPA.hostname,
      '/spec/listeners/0/tls/certificateRefs/0/name': 'klopa-tls',
    },
  }
}

/** HTTPRoute: /api → klopa-api, / → klopa-web (rule i: path prefix → Service). */
export function httpRouteManifest(rules: { path: string; service: string }[] = [
  { path: '/api', service: KLOPA.app },
  { path: '/', service: KLOPA.web },
]): Manifest {
  const fields: Manifest['fields'] = { [PATHS.routeParent]: KLOPA.gateway, [PATHS.routeHostname]: KLOPA.hostname }
  rules.forEach((r, i) => {
    fields[PATHS.routePathType(i)] = 'PathPrefix'
    fields[PATHS.routePath(i)] = r.path
    fields[PATHS.routeBackend(i)] = r.service
    fields[PATHS.routeBackendPort(i)] = 80
  })
  return { kind: 'HTTPRoute', name: KLOPA.route, namespace: KLOPA.namespace, fields }
}

/** Postgres for the course (StatefulSet + headless Service). In production: a managed database or an operator. */
export function postgresManifests(o: { detailed?: boolean } = {}): { statefulSet: Manifest; service: Manifest } {
  const detailed: Fields = o.detailed
    ? {
        '/spec/template/spec/containers/0/env/0/name': DB_SECRET.envName,
        [PATHS.envSecretName(0)]: DB_SECRET.secretName,
        [PATHS.envSecretKey(0)]: DB_SECRET.secretKey,
        '/spec/template/spec/containers/0/volumeMounts/0/name': 'podatci',
        '/spec/template/spec/containers/0/volumeMounts/0/mountPath': '/var/lib/postgresql',
      }
    : {}
  return {
    statefulSet: {
      kind: 'StatefulSet',
      name: KLOPA.db,
      namespace: KLOPA.namespace,
      fields: {
        '/spec/serviceName': KLOPA.db,
        '/spec/replicas': 1,
        '/spec/selector/matchLabels/app': KLOPA.db,
        '/spec/template/metadata/labels/app': KLOPA.db,
        '/spec/template/spec/containers/0/name': 'postgres',
        '/spec/template/spec/containers/0/image': KLOPA.postgresImage,
        '/spec/template/spec/containers/0/ports/0/containerPort': 5432,
        '/spec/template/spec/containers/0/resources/requests/cpu': '250m',
        '/spec/template/spec/containers/0/resources/requests/memory': '512Mi',
        ...detailed,
        '/spec/volumeClaimTemplates/0/metadata/name': 'podatci',
        '/spec/volumeClaimTemplates/0/spec/accessModes/0': 'ReadWriteOnce',
        '/spec/volumeClaimTemplates/0/spec/resources/requests/storage': '10Gi',
      },
    },
    service: { kind: 'Service', name: KLOPA.db, namespace: KLOPA.namespace, fields: { '/spec/clusterIP': 'None', [PATHS.serviceSelector]: KLOPA.db, '/spec/ports/0/port': 5432 } },
  }
}

/** The database password in the store and in the cluster (`PRESETS.l24FullDetailed`). */
export const DB_SECRET = {
  secretName: KLOPA.db,
  secretKey: 'password',
  remoteKey: 'klopa/db-lozinka',
  envName: 'POSTGRES_PASSWORD',
  initialValue: 'db-lozinka-v1',
} as const

/** ExternalSecret klopa-db: the store's klopa/db-lozinka → Secret klopa-db, key password. */
export function dbExternalSecretManifest(refresh = '1h'): Manifest {
  return {
    kind: 'ExternalSecret',
    name: DB_SECRET.secretName,
    namespace: KLOPA.namespace,
    fields: { [PATHS.esoRefresh]: refresh, [PATHS.esoStore]: SMS.store, [PATHS.esoRemoteKey]: DB_SECRET.remoteKey, [PATHS.esoSecretKey]: DB_SECRET.secretKey, [PATHS.esoTarget]: DB_SECRET.secretName },
  }
}

/**
 * The rest of Klopa for the L24 config repo: klopa-web (+ Service), klopa-worker, Gateway + HTTPRoute, Postgres.
 * { detailed: true } (`PRESETS.l24FullDetailed`) adds the database password: an ExternalSecret klopa-db, and on the
 * Postgres StatefulSet env POSTGRES_PASSWORD (secretKeyRef klopa-db/password) plus the volumeMount of `podatci`.
 */
export function klopaFullFiles(o: { detailed?: boolean } = {}): RepoFiles {
  const pg = postgresManifests(o)
  const detailed: RepoFiles = o.detailed ? { [FILES.dbExternalSecret]: dbExternalSecretManifest() } : {}
  return {
    ...detailed,
    [FILES.webDeployment]: workloadManifest(KLOPA.web, `${KLOPA.webRegistry}:1.4.0`, 2, { port: 3000 }),
    [FILES.webService]: serviceManifest(KLOPA.web, 3000),
    [FILES.workerDeployment]: workloadManifest(KLOPA.worker, `${KLOPA.workerRegistry}:1.3.2`, 2, { port: 9000, memoryLimit: '256Mi' }),
    [FILES.gateway]: gatewayManifest(),
    [FILES.httpRoute]: httpRouteManifest(),
    [FILES.dbStatefulSet]: pg.statefulSet,
    [FILES.dbService]: pg.service,
  }
}

/** DB migration Job. 'presync' = PreSync hook; 'wave' = Sync hook in sync-wave −1 (runs before wave 0, Argo CD waits for it). */
export function migrationManifest(tag: string, mode: Exclude<MigrationMode, 'none'> = 'presync'): Manifest {
  const hook: HookPhase = mode === 'presync' ? 'PreSync' : 'Sync'
  return {
    kind: 'Job',
    name: 'klopa-migracija',
    namespace: KLOPA.namespace,
    hook,
    ...(mode === 'wave' ? { wave: -1 } : {}),
    fields: { [PATHS.jobImage]: imageRef(tag), [PATHS.jobBackoffLimit]: 0, '/spec/template/spec/containers/0/command/0': 'python', '/spec/template/spec/containers/0/command/1': 'manage.py', '/spec/template/spec/containers/0/command/2': 'migrate' },
  }
}

export function externalSecretManifest(refresh = '30s'): Manifest {
  return {
    kind: 'ExternalSecret',
    name: SMS.secretName,
    namespace: KLOPA.namespace,
    fields: { [PATHS.esoRefresh]: refresh, [PATHS.esoStore]: SMS.store, [PATHS.esoRemoteKey]: SMS.remoteKey, [PATHS.esoSecretKey]: SMS.secretKey, [PATHS.esoTarget]: SMS.secretName },
  }
}

export function plainSecretManifest(value: string): Manifest {
  return { kind: 'Secret', name: SMS.secretName, namespace: KLOPA.namespace, fields: { [PATHS.data(SMS.secretKey)]: value } }
}

export function sealedSecretManifest(token: string): Manifest {
  return { kind: 'SealedSecret', name: SMS.secretName, namespace: KLOPA.namespace, fields: { [PATHS.encryptedData(SMS.secretKey)]: token } }
}

/** A Secret whose values SOPS encrypted (`ENC[AES256_GCM,…]`); keys and the age recipient stay readable. */
export function sopsSecretManifest(token: string, recipient: string): Manifest {
  return { kind: 'Secret', name: SMS.secretName, namespace: KLOPA.namespace, fields: { [PATHS.data(SMS.secretKey)]: token, '/sops/age/0/recipient': recipient } }
}

export const isSopsToken = (v: unknown): v is string => typeof v === 'string' && v.startsWith('ENC[')
export const isVaultPlaceholder = (v: unknown): v is string => typeof v === 'string' && v.startsWith('<path:')

/** Resolved migration mode of a config (handles the `migrationHook` alias). */
export function migrationModeOf(input: GitOpsConfig): MigrationMode {
  return input.migration ?? (input.migrationHook ? 'presync' : 'none')
}

/** Initial repository files for a config (sealed/SOPS tokens are produced by the engine). */
export function initialFiles(input: GitOpsConfig, sealedToken: string | null, sops: { token: string; recipient: string } | null = null): RepoFiles {
  const tag = input.initialTag ?? '1.4.0'
  const replicas = configReplicas(input)
  const secrets = input.secrets ?? 'none'
  const files: RepoFiles = {
    [FILES.deployment]: deploymentManifest(tag, replicas, secrets, input.secretConsumption ?? 'env'),
    [FILES.service]: serviceManifest(),
  }
  if (input.promo ?? true) files[FILES.promo] = promoManifest(input.configMapWaveMinus1 ? -1 : undefined)
  if (input.hpa) files[FILES.hpa] = hpaManifest(input.hpa.min, input.hpa.max)
  const migration = migrationModeOf(input)
  if (migration !== 'none') files[FILES.migration] = migrationManifest(tag, migration)
  if (secrets === 'plain') files[FILES.secret] = plainSecretManifest(SMS.initialValue)
  if (secrets === 'avp') files[FILES.secret] = plainSecretManifest(`<path:${SMS.remoteKey}#${SMS.secretKey}>`)
  if (secrets === 'sealed' && sealedToken) files[FILES.sealedSecret] = sealedSecretManifest(sealedToken)
  if (secrets === 'sops' && sops) files[FILES.sopsSecret] = sopsSecretManifest(sops.token, sops.recipient)
  if (secrets === 'eso') files[FILES.externalSecret] = externalSecretManifest()
  for (const [p, m] of Object.entries(input.extraFiles ?? {})) files[p] = { ...m, fields: { ...m.fields } }
  return files
}

/** Lecture presets. Spread and override: createGitOps({ ...PRESETS.l22, webhook: true }). */
export const PRESETS = {
  /** L22 „Git je istina”: Argo CD defaults – manual sync, prune and selfHeal off, polling only. */
  l22: { seed: 22 } satisfies GitOpsConfig,
  /** L22 with automated sync on (prune/selfHeal still off – the „Predvidi” question). */
  l22Auto: { seed: 22, policy: { automated: true } } satisfies GitOpsConfig,
  /** L22 „Argo CD i HPA”: replicas: 4 in Git + HPA 2–10 needing 6 Pods, automated + selfHeal → tug of war. */
  l22Hpa: { seed: 22, policy: { automated: true, selfHeal: true }, hpa: { min: 2, max: 10 }, hpaDemand: 6 } satisfies GitOpsConfig,
  /** L22 DeepDive „sync waves”: migration Job in wave −1 runs (and must finish) before the Deployment in wave 0. */
  l22Waves: { seed: 22, policy: { automated: true }, migration: 'wave' } satisfies GitOpsConfig,
  /** L22 scene 1: push model – CI holds cluster credentials, no controller, drift unnoticed. */
  l22Push: { seed: 22, mode: 'push' } satisfies GitOpsConfig,
  /** L23 „Put tajne (2. dio)”: SealedSecret for the SMS key, auto-sync with selfHeal and prune. */
  l23: { seed: 23, policy: { automated: true, selfHeal: true, prune: true }, secrets: 'sealed', initialTag: '2.0.1' } satisfies GitOpsConfig,
  /** L24 „Incident u 12:00”: webhook on, automated + selfHeal + prune, ESO for secrets, 2.0.1 running. */
  l24: { seed: 24, webhook: true, policy: { automated: true, selfHeal: true, prune: true }, secrets: 'eso', initialTag: '2.0.1' } satisfies GitOpsConfig,
  /**
   * L24 „Incident u 12:00” – the whole Klopa config repo as one Application `klopa` (path `apps`, directory.recurse):
   * klopa-api (no replicas in Git, HPA 2–10 needing 4, ESO for the SMS key), klopa-web + Service, klopa-worker,
   * Gateway + HTTPRoute, Postgres StatefulSet + Service. Webhook on, automated + selfHeal + prune. Every fix is a commit
   * (`commitField` / `commitChanges`); other engines read the applied changes with `drainLiveChanges`.
   */
  l24Full: {
    seed: 24,
    webhook: true,
    policy: { automated: true, selfHeal: true, prune: true },
    secrets: 'eso',
    initialTag: '2.0.1',
    replicas: null,
    hpa: { min: 2, max: 10 },
    hpaDemand: 4,
    promo: false,
    app: { name: 'klopa', path: 'apps' },
    images: [...DEFAULT_IMAGES, ...KLOPA_SERVICE_IMAGES],
    extraFiles: klopaFullFiles(),
  } satisfies GitOpsConfig,
  /**
   * `l24Full` as the lecture's YAML shows it (additive – l24Full is unchanged): the ConfigMap klopa-promo
   * (Ćevap-petak popust), apps/postgres/externalsecret-db.yaml, and on the Postgres StatefulSet env
   * POSTGRES_PASSWORD from Secret klopa-db plus the volumeMount /var/lib/postgresql. The store holds the password.
   */
  l24FullDetailed: {
    seed: 24,
    webhook: true,
    policy: { automated: true, selfHeal: true, prune: true },
    secrets: 'eso',
    initialTag: '2.0.1',
    replicas: null,
    hpa: { min: 2, max: 10 },
    hpaDemand: 4,
    promo: true,
    app: { name: 'klopa', path: 'apps' },
    images: [...DEFAULT_IMAGES, ...KLOPA_SERVICE_IMAGES],
    extraFiles: klopaFullFiles({ detailed: true }),
    storeValues: { [DB_SECRET.remoteKey]: DB_SECRET.initialValue },
  } satisfies GitOpsConfig,
} as const
