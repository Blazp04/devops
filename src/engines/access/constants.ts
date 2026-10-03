/**
 * E5 „Tko vidi?” – constants: compressed timings (sim + real), actors, built-in roles, approaches,
 * encryption providers, graph nodes and lecture presets.
 */
import { fmt } from '../../kit/sim/math.ts'
import type {
  AccessConfigInput,
  ActorId,
  ActorInfo,
  Approach,
  GraphNodeId,
  GraphNodeInfo,
  ObjKind,
  GitForm,
  Provider,
  RoleId,
  RoleInfo,
  TimingSim,
  Verb,
} from './types.ts'

/** Internal fixed timestep (s). step(state, dt) accumulates dt and advances in DT steps. */
export const DT = 0.1
export const TICKS_PER_SECOND = 10
/** Largest dt accepted by one step() call (s); larger values are clamped. */
export const MAX_STEP_INPUT = 3600
export const MAX_EVENTS = 50
export const MAX_MARKS = 120
export const MAX_ATTEMPTS = 24
/** Decided attempts kept in `state.attemptLog` */
export const MAX_ATTEMPT_LOG = 50
export const MAX_FLOWS = 60
export const MAX_LOGS = 100
/** Exposure windows kept (oldest dropped first) */
export const MAX_EXPOSURE = 200
/** Argo CD Redis render records kept */
export const MAX_REDIS = 100
/** Metric series length (samples, 1 per simulated second) */
export const SERIES_LEN = 120
/** Finished attempts stay visible this long (s of wall clock: × state.animScale in simulated time) */
export const ATTEMPT_LINGER = 1.5
/** Duration of one hop of a cosmetic propagation token (s of wall clock: × state.animScale in simulated time) */
export const FLOW_HOP = 0.4
/** Range accepted by setAnimationScale (playback speed) */
export const ANIM_SCALE_MIN = 0.25
export const ANIM_SCALE_MAX = 64

/* ---------- Timing: classroom values with the real defaults ---------- */

/** A classroom value next to the real default, so UIs can label „10 s (sim) · stvarno: …”. */
export interface TimingValue {
  /** simulated seconds used by the engine */
  sim: number
  /** same as `sim` (field name shared with the other engines) */
  simValue: number
  /** real default in seconds (null if there is no single default) */
  real: number | null
  /** same as `real` */
  realValue: number | null
  unit: 's'
  /** Croatian badge text for the real value („stvarno: 2 min (rotation-poll-interval)”) */
  realLabel: string
  /** ready-made badge: `timingLabel(this)` („20 s (sim) · stvarno: 2 min (rotation-poll-interval)”) */
  label: string
  /** true when the sim value is not the real default (or there is no single real default) */
  compressed: boolean
  /**
   * Real seconds per simulated second for this mechanism – the time compression used by the real-time estimate of a
   * rotation (`RotationRecord.realElapsed`, `rotationEstimate`). 1 = not compressed.
   */
  ratio: number
  /**
   * true: the value is set in the Klopa manifest (a real, uncompressed setting – e.g. `refreshInterval: 30s`) and
   * `real` is the tool's default; the badge reads „30 s (u YAML-u) · zadano: 1 h”.
   */
  inManifest: boolean
  /** extra Croatian note for a DeepDive / tooltip */
  note?: string
}

function tv(sim: number, real: number | null, realLabel: string, opts: { note?: string; ratio?: number; inManifest?: boolean } = {}): TimingValue {
  const inManifest = opts.inManifest ?? false
  const ratio = opts.ratio ?? (inManifest || real === null ? 1 : real / sim)
  const v: TimingValue = { sim, simValue: sim, real, realValue: real, unit: 's', realLabel, label: '', compressed: real !== sim, ratio, inManifest }
  v.label = timingLabel(v)
  if (opts.note !== undefined) v.note = opts.note
  return v
}

/**
 * Classroom times. Show them as `TIMING.kubeletSync.label` / `timingLabel(TIMING.kubeletSync)` → „10 s (sim) · stvarno: …”.
 * Real defaults: kubelet syncFrequency 1 min, each Pod re-synced after a jittered 1–1,5 min (pod_workers.go:
 * wait.Jitter(resync, 0.5)) + Watch cache delay; Argo CD timeout.reconciliation 120 s + up to 60 s jitter;
 * Secrets Store CSI --rotation-poll-interval 2m (rotation is alpha and off by default); Sealed Secrets key renewal
 * every 30 days; argocd-repo-server --repo-cache-expiration 24h.
 * ESO is NOT compressed: the Klopa ExternalSecret sets `refreshInterval: 30s` (ESO's default is 1h) – the same framing
 * as E6 (src/engines/gitops/constants.ts → TIMINGS.esoRefresh).
 */
export const TIMING = {
  kubeletSync: tv(10, 90, 'stvarno: s odgodom sinkronizacije kubeleta (do oko minute i pol)', {
    note: 'sync-frequency kubeleta 1 min + do 50 % nasumičnog odmaka (do ~1,5 min) + kašnjenje predmemorije (zadana strategija Watch)',
  }),
  esoRefresh: tv(30, 3600, 'zadano: 1 h', {
    inManifest: true,
    note: 'refreshInterval: 30s upisan je u ExternalSecret; bez njega ESO osvježava jednom na sat (ili odmah uz oznaku force-sync)',
  }),
  argoPoll: tv(12, 120, 'stvarno: 120 s + do 60 s', { note: 'timeout.reconciliation; webhook skraćuje na oko 1 s' }),
  argoJitter: tv(6, 60, 'stvarno: do 60 s'),
  argoWebhook: tv(1, 1, 'stvarno: oko 1 s (webhook)'),
  csiRotationPoll: tv(20, 120, 'stvarno: 2 min (rotation-poll-interval)', {
    note: 'automatska rotacija u Secrets Store CSI Driveru je alfa i po zadanom isključena',
  }),
  argoCacheExpiry: tv(720, 24 * 3600, 'stvarno: 24 h (--repo-cache-expiration)', {
    note: 'generirani manifesti ostaju u Redisu Argo CD-a do isteka predmemorije – i nakon promjene alata',
  }),
  sealedKeyRenewal: tv(60, 30 * 24 * 3600, 'stvarno: 30 dana'),
  unseal: tv(1, null, 'stvarno: gotovo odmah (kontroler prati SealedSecrete)'),
  podStart: tv(3, null, 'stvarno: nekoliko sekundi (slika je već na čvoru)'),
  podTerminate: tv(1, null, 'stvarno: do terminationGracePeriodSeconds (zadano 30 s)'),
  imageBuild: tv(20, 600, 'stvarno: trajanje CI pipelinea (nekoliko minuta)'),
  attemptHop: tv(0.6, null, 'samo animacija', { note: 'u simuliranom vremenu × brzina reprodukcije (setAnimationScale), pa token traje jednako na zaslonu' }),
} satisfies Record<keyof TimingSim, TimingValue>

/** Goal „Rotirajte SMS ključ u < 5 min”: real-time limit (s) for `RotationRecord.realElapsed`. */
export const ROTATION_GOAL_REAL_S = 300

/* ---------- Sealed Secrets scopes (scene „Sealed Secrets”, static content) ---------- */

export type SealedScope = 'strict' | 'namespace-wide' | 'cluster-wide'

/**
 * `kubeseal --scope …` (or the annotations sealedsecrets.bitnami.com/namespace-wide / cluster-wide). The engine
 * models only the default `strict` scope; these labels are for the scene's static explanation.
 */
export const SEALED_SCOPES: Record<SealedScope, { label: string; note: string }> = {
  strict: { label: 'strict (zadano)', note: 'otpečaćuje se samo pod istim imenom i u istom Namespaceu' },
  'namespace-wide': { label: 'namespace-wide', note: 'smije se preimenovati, ali samo unutar istog Namespacea' },
  'cluster-wide': { label: 'cluster-wide', note: 'otpečaćuje se pod bilo kojim imenom i u bilo kojem Namespaceu' },
}

/* ---------- Secret facts (scene „Dekodirajte”, tech-facts §4.1) ---------- */

/** A Secret (like a ConfigMap) can hold at most 1 MiB. */
export const SECRET_MAX_BYTES = 1024 * 1024

/** Built-in Secret types (`type:` field); Opaque is the default. */
export const SECRET_TYPES = [
  'Opaque',
  'kubernetes.io/tls',
  'kubernetes.io/dockerconfigjson',
  'kubernetes.io/basic-auth',
  'kubernetes.io/ssh-auth',
  'kubernetes.io/service-account-token',
  'bootstrap.kubernetes.io/token',
] as const

export const DEFAULT_TIMING: TimingSim = {
  kubeletSync: TIMING.kubeletSync.sim,
  esoRefresh: TIMING.esoRefresh.sim,
  argoPoll: TIMING.argoPoll.sim,
  argoJitter: TIMING.argoJitter.sim,
  argoWebhook: TIMING.argoWebhook.sim,
  csiRotationPoll: TIMING.csiRotationPoll.sim,
  argoCacheExpiry: TIMING.argoCacheExpiry.sim,
  sealedKeyRenewal: TIMING.sealedKeyRenewal.sim,
  unseal: TIMING.unseal.sim,
  podStart: TIMING.podStart.sim,
  podTerminate: TIMING.podTerminate.sim,
  imageBuild: TIMING.imageBuild.sim,
  attemptHop: TIMING.attemptHop.sim,
}

/** „10 s (sim) · stvarno: s odgodom sinkronizacije kubeleta (…)”; a manifest value: „30 s (u YAML-u) · zadano: 1 h” */
export function timingLabel(t: TimingValue, simOverride?: number): string {
  const v = simOverride ?? t.sim
  return `${fmtDuration(v)} (${t.inManifest ? 'u YAML-u' : 'sim'}) · ${t.realLabel}`
}

/** „30 s”, „12 min”, „4,5 min”, „1 h”, „1,5 h”, „24 h 16 min” (decimal comma) */
export function fmtDuration(sec: number): string {
  if (!Number.isFinite(sec)) return '∞'
  const one = (x: number) => fmt.num(x, Number.isInteger(x) ? 0 : 1)
  if (sec >= 3600 && sec % 360 === 0) return `${one(sec / 3600)} h`
  if (sec >= 3600) {
    const total = Math.round(sec / 60)
    const h = Math.floor(total / 60)
    const m = total - h * 60
    return m ? `${h} h ${m} min` : `${h} h`
  }
  if (sec >= 120) return `${one(Math.round((sec / 60) * 10) / 10)} min`
  return `${one(Math.round(sec * 10) / 10)} s`
}

/* ---------- RBAC: built-in and custom roles ---------- */

const READ: readonly Verb[] = ['get', 'list', 'watch']
const WRITE: readonly Verb[] = ['create', 'update', 'patch', 'delete']

/**
 * Built-in `view` reads Pods, Deployments, ConfigMaps and pods/log but deliberately not Secrets.
 * Built-in `edit` allows accessing Secrets and running Pods (and pods/exec) in the namespace.
 * `deployer` is a custom least-privilege deploy role (CI bot): no verbs on secrets, but it may create
 * Deployments – which is enough to mount any Secret in the namespace.
 */
export const ROLES: Record<RoleId, RoleInfo> = {
  view: {
    id: 'view',
    label: 'view',
    description: 'ugrađena uloga: čita Podove, Deploymente, ConfigMape i logove – ne i Secrete',
    rules: [{ resources: ['configmaps', 'pods', 'deployments', 'pods/log'], verbs: READ }],
  },
  edit: {
    id: 'edit',
    label: 'edit',
    description: 'ugrađena uloga: čita i mijenja većinu objekata, uključujući Secrete; smije stvarati Podove i exec',
    rules: [
      { resources: ['configmaps', 'pods', 'deployments', 'secrets', 'pods/log'], verbs: READ },
      { resources: ['configmaps', 'pods', 'deployments', 'secrets'], verbs: WRITE },
      { resources: ['pods/exec'], verbs: ['create'] },
    ],
  },
  deployer: {
    id: 'deployer',
    label: 'deployer',
    description: 'vlastita uloga za postavljanje: mijenja Deploymente i čita Podove, bez prava na secrets',
    rules: [
      { resources: ['deployments'], verbs: ['get', 'list', 'watch', 'create', 'update', 'patch'] },
      { resources: ['pods'], verbs: READ },
    ],
  },
  'secret-lister': {
    id: 'secret-lister',
    label: 'list secrets',
    description: 'samo list na secrets (bez get) – list ipak vraća cijele objekte',
    rules: [{ resources: ['secrets'], verbs: ['list'] }],
  },
}

/* ---------- Actors (eyes) ---------- */

export const ACTORS: Record<ActorId, ActorInfo> = {
  'git-reader': {
    id: 'git-reader',
    label: 'Čitatelj Git repozitorija',
    subject: 'Svatko s klonom repozitorija',
    description: 'svatko s klonom: tim, CI, forkovi, sigurnosne kopije',
    lectures: ['16', '23'],
    entry: 'git',
  },
  'image-puller': {
    id: 'image-puller',
    label: 'Tko povuče sliku',
    subject: 'Svatko tko povuče sliku',
    description: 'svatko s pristupom registru slika',
    lectures: ['16'],
    entry: 'registry',
  },
  'etcd-backup-thief': {
    id: 'etcd-backup-thief',
    label: 'Kradljivac kopije baze etcd',
    subject: 'Kradljivac kopije baze etcd',
    description: 'ukradena sigurnosna kopija (snapshot) baze etcd',
    lectures: ['16', '23'],
    entry: 'etcd',
  },
  'cp-disk-thief': {
    id: 'cp-disk-thief',
    label: 'Kradljivac diska upravljačke ravnine',
    subject: 'Kradljivac diska upravljačke ravnine',
    description: 'cijeli disk: baza etcd i konfiguracijske datoteke',
    lectures: ['16', '23'],
    entry: 'cp-disk',
  },
  'view-user': {
    id: 'view-user',
    label: 'Uloga view u Namespaceu',
    subject: 'Korisnik s ulogom view',
    description: 'čita Podove, Deploymente, ConfigMape i logove',
    lectures: ['16'],
    entry: 'api',
  },
  developer: {
    id: 'developer',
    label: 'Razvojni programer',
    subject: 'Razvojni programer',
    description: 'uloga edit (uz najmanje ovlasti: view)',
    lectures: ['16', '23'],
    entry: 'api',
  },
  'pod-creator': {
    id: 'pod-creator',
    label: 'Smije stvarati Podove',
    subject: 'Korisnik koji smije stvarati Podove',
    description: 'npr. CI bot s pravom postavljanja, bez prava na secrets',
    lectures: ['16', '23'],
    entry: 'api',
  },
  'compromised-pod': {
    id: 'compromised-pod',
    label: 'Kompromitirani Pod aplikacije',
    subject: 'Napadač u Podu aplikacije',
    description: 'napadač unutar kontejnera aplikacije',
    lectures: ['16', '23'],
    entry: 'pod',
  },
  'log-reader': {
    id: 'log-reader',
    label: 'Čitatelj logova',
    subject: 'Svatko s pristupom logovima',
    description: 'svatko s pristupom sustavu za logove',
    lectures: ['16'],
    entry: 'logs',
  },
  'ci-log-reader': {
    id: 'ci-log-reader',
    label: 'Čitatelj CI logova',
    subject: 'Svatko tko vidi CI logove',
    description: 'svatko tko vidi logove pipelinea',
    lectures: ['23'],
    entry: 'ci-log',
  },
  'argocd-redis': {
    id: 'argocd-redis',
    label: 'Pristup predmemoriji Argo CD-a',
    subject: 'Svatko s pristupom predmemoriji Argo CD-a',
    description: 'Redis u kojem Argo CD čuva generirane manifeste',
    lectures: ['23'],
    entry: 'redis',
  },
  'laptop-thief': {
    id: 'laptop-thief',
    label: 'Kradljivac laptopa',
    subject: 'Kradljivac laptopa',
    description: 'klon repozitorija, kubeconfig i lokalne datoteke razvojnog programera',
    lectures: ['23'],
    entry: 'laptop',
  },
  'ex-employee': {
    id: 'ex-employee',
    label: 'Bivši član tima',
    subject: 'Bivši član tima',
    description: 'pamti vrijednosti iz vremena svojeg rada u timu',
    lectures: ['23'],
    entry: 'memory',
  },
}

/** Evaluation / display order. */
export const ACTOR_ORDER: readonly ActorId[] = [
  'git-reader',
  'image-puller',
  'etcd-backup-thief',
  'cp-disk-thief',
  'view-user',
  'developer',
  'pod-creator',
  'compromised-pod',
  'log-reader',
  'ci-log-reader',
  'argocd-redis',
  'laptop-thief',
  'ex-employee',
]

export const L16_ACTORS: readonly ActorId[] = [
  'git-reader',
  'image-puller',
  'etcd-backup-thief',
  'cp-disk-thief',
  'view-user',
  'developer',
  'pod-creator',
  'compromised-pod',
  'log-reader',
]

export const L23_ACTORS: readonly ActorId[] = [
  'git-reader',
  'ci-log-reader',
  'argocd-redis',
  'laptop-thief',
  'ex-employee',
  'etcd-backup-thief',
  'cp-disk-thief',
  'developer',
  'pod-creator',
  'compromised-pod',
]

/* ---------- Approaches ---------- */

export interface ApproachInfo {
  id: Approach
  /** Croatian label for a Segmented control */
  label: string
  /** Kubernetes object that carries the value in the cluster (null: none) */
  objKind: ObjKind | null
  /** What goes into Git and in which file */
  gitForm: GitForm | null
  gitFile: string | null
  /** value comes from an external store (Vault/OpenBao/cloud) */
  usesStore: boolean
  /** Pods always get it as an env var */
  envOnly: boolean
  /** the GitOps tool renders the plaintext value into manifests (cached in Argo CD's Redis) */
  rendersPlaintext: boolean
  /** Croatian one-liner: where the plaintext lives */
  plaintextLivesIn: string
}

export const APPROACHES: Record<Approach, ApproachInfo> = {
  image: {
    id: 'image',
    label: 'u slici (ENV)',
    objKind: null,
    gitForm: 'dockerfile-env',
    gitFile: 'Dockerfile',
    usesStore: false,
    envOnly: true,
    rendersPlaintext: false,
    plaintextLivesIn: 'Dockerfile u Gitu i slojevi slike u registru',
  },
  'manifest-env': {
    id: 'manifest-env',
    label: 'env u deployment.yaml',
    objKind: 'Deployment',
    gitForm: 'manifest-env',
    gitFile: 'deployment.yaml',
    usesStore: false,
    envOnly: true,
    rendersPlaintext: true,
    plaintextLivesIn: 'deployment.yaml u Gitu, Deployment i Pod u bazi etcd',
  },
  configmap: {
    id: 'configmap',
    label: 'ConfigMap',
    objKind: 'ConfigMap',
    gitForm: 'configmap',
    gitFile: 'configmap.yaml',
    usesStore: false,
    envOnly: false,
    rendersPlaintext: true,
    plaintextLivesIn: 'configmap.yaml u Gitu i ConfigMap u bazi etcd',
  },
  secret: {
    id: 'secret',
    label: 'Secret',
    objKind: 'Secret',
    gitForm: null,
    gitFile: null,
    usesStore: false,
    envOnly: false,
    rendersPlaintext: false,
    plaintextLivesIn: 'lokalni secret.yaml i Secret u bazi etcd',
  },
  'git-secret': {
    id: 'git-secret',
    label: 'običan Secret u Gitu',
    objKind: 'Secret',
    gitForm: 'base64',
    gitFile: 'secret.yaml',
    usesStore: false,
    envOnly: false,
    rendersPlaintext: true,
    plaintextLivesIn: 'secret.yaml u Gitu (base64) i Secret u bazi etcd',
  },
  sealed: {
    id: 'sealed',
    label: 'SealedSecret',
    objKind: 'Secret',
    gitForm: 'sealed',
    gitFile: 'sealedsecret.yaml',
    usesStore: false,
    envOnly: false,
    rendersPlaintext: false,
    plaintextLivesIn: 'samo Secret u klasteru (u Gitu je šifrat)',
  },
  sops: {
    id: 'sops',
    label: 'SOPS',
    objKind: 'Secret',
    gitForm: 'sops',
    gitFile: 'secret.enc.yaml',
    usesStore: false,
    envOnly: false,
    rendersPlaintext: true,
    plaintextLivesIn: 'Secret u klasteru; s Argo CD-om i u njegovoj predmemoriji (KSOPS)',
  },
  eso: {
    id: 'eso',
    label: 'ESO + trezor',
    objKind: 'Secret',
    gitForm: 'reference',
    gitFile: 'externalsecret.yaml',
    usesStore: true,
    envOnly: false,
    rendersPlaintext: false,
    plaintextLivesIn: 'trezor i Secret koji ESO stvara u klasteru',
  },
  csi: {
    id: 'csi',
    label: 'CSI driver',
    objKind: null,
    gitForm: 'reference',
    gitFile: 'secretproviderclass.yaml',
    usesStore: true,
    envOnly: false,
    rendersPlaintext: false,
    plaintextLivesIn: 'trezor i tmpfs u Podu (uz sinkronizaciju i Secret)',
  },
  avp: {
    id: 'avp',
    label: 'argocd-vault-plugin',
    objKind: 'Secret',
    gitForm: 'reference',
    gitFile: 'secret.yaml (<path:…>)',
    usesStore: true,
    envOnly: false,
    rendersPlaintext: true,
    plaintextLivesIn: 'trezor, predmemorija Argo CD-a (Redis) i Secret u klasteru',
  },
}

export const L16_APPROACHES: readonly Approach[] = ['image', 'manifest-env', 'configmap', 'secret']
export const L23_APPROACHES: readonly Approach[] = ['git-secret', 'sealed', 'sops', 'eso', 'csi', 'avp']

/* ---------- Encryption providers ---------- */

export interface ProviderInfo {
  id: Provider
  label: string
  /** where the key lives */
  keyLocation: 'none' | 'control-plane-file' | 'external-kms'
  recommended: boolean
  /** Croatian note (from the Kubernetes docs' provider table) – no software versions, safe for event texts */
  note: string
  /** software-version fact for a fact callout only (style guide: versions never in story/event text), or null */
  versionNote: string | null
}

export const PROVIDERS: Record<Provider, ProviderInfo> = {
  identity: {
    id: 'identity',
    label: 'identity (bez šifriranja)',
    keyLocation: 'none',
    recommended: false,
    note: 'zadano: podatci se zapisuju bez šifriranja',
    versionNote: null,
  },
  aescbc: {
    id: 'aescbc',
    label: 'aescbc',
    keyLocation: 'control-plane-file',
    recommended: false,
    note: 'ne preporučuje se zbog napada padding oracle; ključ je u datoteci na upravljačkoj ravnini',
    versionNote: null,
  },
  aesgcm: {
    id: 'aesgcm',
    label: 'aesgcm',
    keyLocation: 'control-plane-file',
    recommended: false,
    note: 'ključ treba mijenjati svakih 200 000 zapisa; ključ je u datoteci na upravljačkoj ravnini',
    versionNote: null,
  },
  secretbox: {
    id: 'secretbox',
    label: 'secretbox',
    keyLocation: 'control-plane-file',
    recommended: false,
    note: 'snažan algoritam, ali ključ je u datoteci na upravljačkoj ravnini',
    versionNote: null,
  },
  'kms-v2': {
    id: 'kms-v2',
    label: 'KMS v2',
    keyLocation: 'external-kms',
    recommended: true,
    note: 'preporučeno: omotnica DEK/KEK, ključ (KEK) je u vanjskom KMS-u',
    versionNote: 'KMS v2 je stabilan od Kubernetesa 1.29 (stanje: listopad 2026.)',
  },
}

/* ---------- Graph nodes ---------- */

export const GRAPH_NODES: Record<GraphNodeId, GraphNodeInfo> = {
  laptop: { id: 'laptop', label: 'Laptop', column: 0, lane: 0 },
  git: { id: 'git', label: 'Git', column: 1, lane: 0 },
  ci: { id: 'ci', label: 'CI', column: 2, lane: 0 },
  'ci-log': { id: 'ci-log', label: 'CI log', column: 2, lane: 1 },
  registry: { id: 'registry', label: 'Registar slika', column: 3, lane: 0 },
  argocd: { id: 'argocd', label: 'Argo CD', column: 4, lane: 0 },
  redis: { id: 'redis', label: 'Redis (Argo CD)', column: 4, lane: 1 },
  api: { id: 'api', label: 'API poslužitelj', column: 5, lane: 0 },
  controller: { id: 'controller', label: 'Kontroler (ESO / Sealed Secrets)', column: 5, lane: -1 },
  store: { id: 'store', label: 'Trezor', column: 4, lane: -1 },
  etcd: { id: 'etcd', label: 'etcd', column: 6, lane: 0 },
  'cp-disk': { id: 'cp-disk', label: 'Disk upravljačke ravnine', column: 6, lane: 1 },
  kms: { id: 'kms', label: 'Vanjski KMS', column: 6, lane: -1 },
  node: { id: 'node', label: 'Čvor (kubelet)', column: 7, lane: 0 },
  pod: { id: 'pod', label: 'Pod', column: 8, lane: 0 },
  logs: { id: 'logs', label: 'Logovi', column: 8, lane: 1 },
  memory: { id: 'memory', label: 'Sjećanje', column: 0, lane: 1 },
}

/* ---------- Default secrets, workloads and presets ---------- */

export const DB_SECRET = {
  id: 'db',
  name: 'klopa-db',
  key: 'DB_PASSWORD',
  label: 'Lozinka baze',
  labelAcc: 'lozinku baze',
  initialValue: 'klopa_db',
  approach: 'secret' as Approach,
}

export const SMS_SECRET = {
  id: 'sms',
  name: 'klopa-sms',
  key: 'SMS_API_KEY',
  label: 'Ključ za SMS-gateway',
  labelAcc: 'ključ za SMS-gateway',
  initialValue: 'sms-7f3a9c2e',
  approach: 'git-secret' as Approach,
}

export type PresetName = 'l16' | 'l16-timeline' | 'l23' | 'l23-rebuild'

/**
 * Lecture presets (pass to createAccessPreset(name, overrides)).
 * - l16: DB password as a Secret applied with kubectl, consumed as env by 2 klopa-api Pods; no encryption at rest,
 *        developer has `edit`; explorer mode (whatIf).
 * - l16-timeline: three single-replica Deployments consuming the same Secret as env / volume / subPath (update timeline scene).
 * - l23: GitOps (Argo CD); DB password and SMS key both start as plain Secrets in Git – the leaked commit of the hook
 *        (`leakedAtStart`, so „Ispravno reagirajte na procurjeli commit” is reachable without a break-it press);
 *        klopa-api uses the DB password, klopa-worker the SMS key; the ex-team member knows version 1; goals refer to
 *        the SMS key (`goalSecretId: 'sms'`).
 * - l23-rebuild: the L23 hook – DB password applied by hand (not in Git), ready for rebuildCluster(); the SMS key is
 *        the leaked plain Secret in Git.
 */
export const PRESETS: Record<PresetName, AccessConfigInput> = {
  l16: {
    seed: 42,
    secrets: [{ ...DB_SECRET }],
    workloads: [{ id: 'api', name: 'klopa-api', replicas: 2, consume: 'env', secretIds: ['db'] }],
    focusSecretId: 'db',
    delivery: 'kubectl',
    whatIf: true,
    visibleActors: [...L16_ACTORS],
  },
  'l16-timeline': {
    seed: 42,
    secrets: [{ ...DB_SECRET }],
    workloads: [
      { id: 'env', name: 'api-env', replicas: 1, consume: 'env', secretIds: ['db'] },
      { id: 'volume', name: 'api-volume', replicas: 1, consume: 'volume', secretIds: ['db'] },
      { id: 'subpath', name: 'api-subpath', replicas: 1, consume: 'subPath', secretIds: ['db'] },
    ],
    focusSecretId: 'db',
    delivery: 'kubectl',
    whatIf: true,
    visibleActors: [...L16_ACTORS],
  },
  l23: {
    seed: 42,
    secrets: [
      { ...DB_SECRET, approach: 'git-secret' },
      { ...SMS_SECRET, approach: 'git-secret' },
    ],
    workloads: [
      { id: 'api', name: 'klopa-api', replicas: 2, consume: 'volume', secretIds: ['db'] },
      { id: 'worker', name: 'klopa-worker', replicas: 1, consume: 'volume', secretIds: ['sms'] },
    ],
    focusSecretId: 'sms',
    goalSecretId: 'sms',
    leakedAtStart: ['db', 'sms'],
    delivery: 'gitops',
    whatIf: false,
    exEmployeeKnowsInitial: true,
    sealed: { keyBackup: false, autoRenew: true },
    visibleActors: [...L23_ACTORS],
  },
  'l23-rebuild': {
    seed: 42,
    secrets: [
      { ...DB_SECRET, approach: 'secret' },
      { ...SMS_SECRET, approach: 'git-secret' },
    ],
    workloads: [
      { id: 'api', name: 'klopa-api', replicas: 2, consume: 'env', secretIds: ['db'] },
      { id: 'worker', name: 'klopa-worker', replicas: 1, consume: 'env', secretIds: ['sms'] },
    ],
    focusSecretId: 'db',
    leakedAtStart: ['sms'],
    delivery: 'gitops',
    whatIf: false,
    exEmployeeKnowsInitial: true,
    visibleActors: [...L23_ACTORS],
  },
}
