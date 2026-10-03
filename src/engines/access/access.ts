/**
 * E5 „Tko vidi?” – secret access-graph engine (lectures 16 and 23).
 *
 * State machine around one or more secrets (DB password, SMS key): where the value lives (approach), how
 * workloads consume it (env / volume / subPath), cluster controls (encryption at rest, RBAC), GitOps delivery
 * (Argo CD polling), ESO / CSI / Sealed Secrets behaviour, rotation and the leaks („break-it” actions).
 * Who can read what is computed by evaluate.ts from this state; this file advances time and applies actions.
 *
 * Usage: createAccess(config) or createAccessPreset('l16') → state; step(state, dt) with any dt (internal fixed
 * DT = 0.1 s); actions are plain functions mutating state (rotateSecret, commitPlainSecret, attempt, …).
 */
import { createRng, plural, Series } from '../../kit/sim/math.ts'
import {
  ACTORS,
  ANIM_SCALE_MAX,
  ANIM_SCALE_MIN,
  APPROACHES,
  ATTEMPT_LINGER,
  DB_SECRET,
  DEFAULT_TIMING,
  DT,
  FLOW_HOP,
  L16_ACTORS,
  L23_ACTORS,
  MAX_ATTEMPTS,
  MAX_ATTEMPT_LOG,
  MAX_EVENTS,
  MAX_EXPOSURE,
  MAX_FLOWS,
  MAX_LOGS,
  MAX_MARKS,
  MAX_REDIS,
  MAX_STEP_INPUT,
  PRESETS,
  PROVIDERS,
  ROLES,
  ROTATION_GOAL_REAL_S,
  SERIES_LEN,
  SMS_SECRET,
  TICKS_PER_SECOND,
  TIMING,
  fmtDuration,
  timingLabel,
} from './constants.ts'
import type { PresetName } from './constants.ts'
import { evaluateAccess, evaluateAll, verdictOf } from './evaluate.ts'
import {
  consumeOf,
  consumerPods,
  csiSyncActive,
  effectiveConsume,
  effectiveProvider,
  fakeSha,
  findSecret,
  findWorkload,
  fmtS,
  isUsable,
  keysReadableFrom,
  objKindFor,
  rendersPlaintext,
  roleLabel,
  rulesAllow,
  runningConsumers,
  storeBacked,
  templateKey,
  uniqSorted,
} from './shared.ts'
import type {
  AccessConfig,
  AccessConfigInput,
  AccessEvent,
  AccessState,
  ActorId,
  AppPod,
  AppPodStatus,
  Approach,
  Attempt,
  AttemptResolve,
  Channel,
  ConsumeMode,
  ControlId,
  EncryptionScope,
  EventKind,
  ExposureWindow,
  Flow,
  FlowKind,
  GitForm,
  GoalId,
  GraphNodeId,
  Hop,
  ObjKind,
  PolicyRule,
  Provider,
  Resource,
  RoleId,
  RotationMarkKind,
  RotationRecord,
  RotationWait,
  ScheduledOp,
  SecretConfig,
  SecretRuntime,
  StoreOutage,
  TimingSim,
  Tone,
  Verb,
  WorkloadConfig,
  WorkloadRuntime,
} from './types.ts'

const EPS = 1e-9

/* ======================================================================
 * Config
 * ==================================================================== */

function posNum(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback
}

function resolveSecret(input: Partial<SecretConfig> & { id: string }): SecretConfig {
  const base = input.id === DB_SECRET.id ? DB_SECRET : input.id === SMS_SECRET.id ? SMS_SECRET : null
  const label = input.label ?? base?.label ?? input.id
  return {
    id: input.id,
    name: input.name ?? base?.name ?? input.id,
    key: input.key ?? base?.key ?? input.id.toUpperCase().replace(/[^A-Z0-9]/g, '_'),
    label,
    labelAcc: input.labelAcc ?? base?.labelAcc ?? label.toLocaleLowerCase('hr'),
    initialValue: input.initialValue ?? base?.initialValue ?? `${input.id}-1`,
    approach: input.approach ?? base?.approach ?? 'secret',
  }
}

/** Fills defaults, clamps numbers and drops dangling references. */
export function resolveConfig(input: AccessConfigInput = {}): AccessConfig {
  const seen = new Set<string>()
  const secrets = (input.secrets ?? [{ ...DB_SECRET }]).filter((s) => {
    if (!s || typeof s.id !== 'string' || seen.has(s.id)) return false
    seen.add(s.id)
    return true
  }).map(resolveSecret)
  const ids = new Set(secrets.map((s) => s.id))
  const wseen = new Set<string>()
  const workloads: WorkloadConfig[] = (input.workloads ?? [{ id: 'api', name: 'klopa-api', replicas: 2, consume: 'env' as ConsumeMode, secretIds: secrets.slice(0, 1).map((s) => s.id) }])
    .filter((w) => {
      if (!w || typeof w.id !== 'string' || wseen.has(w.id)) return false
      wseen.add(w.id)
      return true
    })
    .map((w) => ({
      id: w.id,
      name: w.name ?? w.id,
      replicas: clampReplicas(w.replicas ?? 1),
      consume: w.consume ?? 'env',
      secretIds: (w.secretIds ?? []).filter((id) => ids.has(id)),
    }))
  const delivery = input.delivery ?? 'kubectl'
  const timing: TimingSim = { ...DEFAULT_TIMING }
  for (const k of Object.keys(DEFAULT_TIMING) as (keyof TimingSim)[]) timing[k] = posNum(input.timing?.[k], DEFAULT_TIMING[k])
  if (input.timing?.esoRefresh === 0) timing.esoRefresh = 0 // refreshInterval: 0 = sync once
  const focus = input.focusSecretId && ids.has(input.focusSecretId) ? input.focusSecretId : (secrets[0]?.id ?? '')
  return {
    seed: typeof input.seed === 'number' && Number.isFinite(input.seed) ? Math.floor(input.seed) : 42,
    goalSecretId: input.goalSecretId && ids.has(input.goalSecretId) ? input.goalSecretId : focus,
    leakedAtStart: [...new Set((input.leakedAtStart ?? []).filter((id) => ids.has(id)))],
    namespace: input.namespace ?? 'klopa',
    secrets,
    workloads,
    focusSecretId: focus,
    delivery,
    encryption: { provider: input.encryption?.provider ?? 'identity', scope: input.encryption?.scope ?? 'secrets' },
    leastPrivilege: input.leastPrivilege ?? false,
    appRereadsFiles: input.appRereadsFiles ?? true,
    autoRevoke: input.autoRevoke ?? true,
    whatIf: input.whatIf ?? false,
    sealed: { keyBackup: input.sealed?.keyBackup ?? false, autoRenew: input.sealed?.autoRenew ?? true },
    sops: { decryptor: input.sops?.decryptor ?? 'argocd-ksops' },
    csi: { rotation: input.csi?.rotation ?? false, syncSecret: input.csi?.syncSecret ?? false },
    argo: { webhook: input.argo?.webhook ?? false, autoSync: input.argo?.autoSync ?? true },
    store: { kind: input.store?.kind ?? 'openbao', available: input.store?.available ?? true },
    laptop: { diskEncrypted: input.laptop?.diskEncrypted ?? false, hasSopsKey: input.laptop?.hasSopsKey ?? true },
    exEmployeeKnowsInitial: input.exEmployeeKnowsInitial ?? false,
    timing,
    visibleActors: [...(input.visibleActors ?? (delivery === 'gitops' ? L23_ACTORS : L16_ACTORS))].filter((a) => a in ACTORS),
  }
}

function clampReplicas(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(20, Math.floor(n)))
}

/* ======================================================================
 * Creation
 * ==================================================================== */

export function createAccess(input: AccessConfigInput = {}): AccessState {
  const config = resolveConfig(input)
  const t0 = 0
  const state: AccessState = {
    config,
    t: t0,
    tick: 0,
    acc: 0,
    rngTiming: createRng(config.seed),
    rngValues: createRng((config.seed ^ 0x9e3779b9) >>> 0),
    secrets: [],
    workloads: config.workloads.map((w) => ({ ...w, secretIds: [...w.secretIds], podSeq: 0 })),
    pods: [],
    commits: [],
    images: [],
    sealedKeys: [{ id: 'k1', createdAt: t0, compromised: false, storedProvider: 'identity' }],
    leakedKeyIds: [],
    nextKeyRenewal: config.timing.sealedKeyRenewal,
    lastArgoPoll: t0,
    nextArgoPoll: 0,
    argoNotifiedSeq: 0,
    redisRendered: [],
    generation: 1,
    bindings: {
      'git-reader': [],
      'image-puller': [],
      'etcd-backup-thief': [],
      'cp-disk-thief': [],
      'view-user': ['view'],
      developer: [config.leastPrivilege ? 'view' : 'edit'],
      'pod-creator': ['deployer'],
      'compromised-pod': [],
      'log-reader': [],
      'ci-log-reader': [],
      'argocd-redis': [],
      'laptop-thief': [],
      'ex-employee': [],
    },
    customRules: {},
    podLogs: [],
    centralLogs: [],
    ciLogs: [],
    laptopFiles: [],
    exEmployeeKnows: [],
    attempts: [],
    attemptLog: [],
    flows: [],
    animScale: 1,
    events: [],
    marks: [],
    ops: [],
    metrics: {
      redEyes: new Series(SERIES_LEN),
      running: new Series(SERIES_LEN),
      stale: new Series(SERIES_LEN),
      authFailing: new Series(SERIES_LEN),
      nextSample: 0,
    },
    incidents: { outages: config.store.available ? [] : [{ from: t0, to: null, podsStarted: 0, podsBlocked: 0 }], rotationsRefused: 0, leaks: [] },
    exposure: [],
    achieved: {},
    seq: { commit: 0, attempt: 0, flow: 0, event: 0, op: 0, rotation: 0, image: 0, key: 1 },
  }
  state.sealedKeys[0].storedProvider = effectiveProvider(state, 'Secret')
  state.nextArgoPoll = state.rngTiming.range(0, config.timing.argoPoll + config.timing.argoJitter)

  for (const sc of config.secrets) {
    const s: SecretRuntime = {
      id: sc.id,
      name: sc.name,
      key: sc.key,
      label: sc.label,
      labelAcc: sc.labelAcc,
      approach: sc.approach,
      versions: [{ v: 1, value: sc.initialValue, createdAt: t0, revokedAt: null }],
      current: 1,
      obj: { exists: false, kind: null, version: null, storedProvider: 'identity', writtenAt: t0 },
      specVersion: null,
      storeVersion: null,
      lastSyncedAt: null,
      head: { version: null, form: null, keyId: null, commitSeq: 0 },
      appliedSeq: 0,
      sealedObj: null,
      esoStatus: null,
      lastRefresh: t0,
      nextRefresh: 0,
      lastCsiPoll: t0,
      nextCsiPoll: 0,
      avpRendered: null,
      avpRenderedAt: null,
      avpError: false,
      buildingVersion: null,
      rotation: null,
      rotations: [],
    }
    state.secrets.push(s)
    installApproach(state, s, { instant: true, quiet: true })
  }
  // the hook's leaked commit: the setup starts with a readable value in Git
  for (const id of config.leakedAtStart) {
    const s = findSecret(state, id)
    const c = s ? state.commits.find((x) => x.seq === s.head.commitSeq) : undefined
    if (s && c && c.version !== null && READABLE_FORMS.includes(c.form))
      state.incidents.leaks.push({ secretId: s.id, version: c.version, sha: c.sha, t: t0, closedAt: null, initial: true })
  }
  if (config.exEmployeeKnowsInitial) for (const s of state.secrets) state.exEmployeeKnows.push({ secretId: s.id, version: 1 })
  for (const w of state.workloads) for (let i = 0; i < w.replicas; i++) createPod(state, w, { instant: true })
  sampleMetrics(state)
  return state
}

/** Create from a lecture preset; `overrides` are merged on top (nested objects shallow-merged). */
export function createAccessPreset(name: PresetName, overrides: AccessConfigInput = {}): AccessState {
  const p = PRESETS[name]
  return createAccess({
    ...p,
    ...overrides,
    encryption: { ...p.encryption, ...overrides.encryption },
    sealed: { ...p.sealed, ...overrides.sealed },
    sops: { ...p.sops, ...overrides.sops },
    csi: { ...p.csi, ...overrides.csi },
    argo: { ...p.argo, ...overrides.argo },
    store: { ...p.store, ...overrides.store },
    laptop: { ...p.laptop, ...overrides.laptop },
    timing: { ...p.timing, ...overrides.timing },
  })
}

/* ======================================================================
 * Internal helpers: events, marks, flows, ops, commits, objects
 * ==================================================================== */

/**
 * Log an event. An identical event (same t, kind and text) already in the log is merged into one „… (×n)” entry
 * moved to the end, so (t, text) stays unique – the kit's EventLog keys rows by `${t}-${text}`.
 */
function emit(state: AccessState, kind: EventKind, tone: Tone, text: string, extra: Partial<Pick<AccessEvent, 'secretId' | 'actorId' | 'podId' | 'group'>> = {}) {
  if (extra.group !== undefined) {
    // one row per group: the newest replaces the older one (e.g. the growing key ring)
    const i = state.events.findIndex((e) => e.group === extra.group)
    if (i >= 0) state.events.splice(i, 1)
  }
  let count = 1
  for (let i = state.events.length - 1; i >= 0 && state.events[i].t === state.t; i--) {
    const prev = state.events[i]
    if (prev.kind === kind && (prev.text === text || prev.text === `${text} (×${prev.count})`)) {
      count = prev.count + 1
      state.events.splice(i, 1)
      break
    }
  }
  const e: AccessEvent = { id: ++state.seq.event, t: state.t, kind, tone, text: count > 1 ? `${text} (×${count})` : text, count, ...extra }
  state.events.push(e)
  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS)
}

function mark(state: AccessState, s: SecretRuntime, kind: RotationMarkKind, pod: AppPod | null, version: number) {
  const w = pod ? findWorkload(state, pod.workloadId) : undefined
  state.marks.push({
    t: state.t,
    secretId: s.id,
    podId: pod ? pod.id : null,
    workloadId: pod ? pod.workloadId : null,
    consume: pod && w ? effectiveConsume(s.approach, w.consume) : null,
    kind,
    version,
  })
  if (state.marks.length > MAX_MARKS) state.marks.splice(0, state.marks.length - MAX_MARKS)
}

/** Cosmetic token: starts AT hops[0] and travels hop to hop (hops.length − 1 segments of FLOW_HOP × animScale each). */
function addFlow(state: AccessState, kind: FlowKind, s: SecretRuntime, version: number, hops: GraphNodeId[]) {
  const segs = Math.max(1, hops.length - 1)
  const hopDur = FLOW_HOP * state.animScale
  const f: Flow = {
    id: `f${++state.seq.flow}`,
    kind,
    secretId: s.id,
    version,
    hops,
    hopDur,
    hopIndex: Math.min(1, hops.length - 1),
    hopProgress: 0,
    progress: 0,
    startedAt: state.t,
    duration: segs * hopDur,
  }
  state.flows.push(f)
  if (state.flows.length > MAX_FLOWS) state.flows.splice(0, state.flows.length - MAX_FLOWS)
}

/**
 * Argo CD generated manifests containing this secret's readable value (refresh, sync, hard refresh): remember
 * it in the Redis cache model. Re-rendering the same (version, approach) refreshes the entry.
 */
function noteRender(state: AccessState, s: SecretRuntime, version: number | null, animate = true) {
  if (version === null || !rendersPlaintext(state, s)) return
  const ttl = state.config.timing.argoCacheExpiry
  const i = state.redisRendered.findIndex((r) => r.secretId === s.id && r.version === version && r.approach === s.approach)
  const isNew = i < 0 || state.t - state.redisRendered[i].t >= ttl - EPS
  if (i >= 0) state.redisRendered.splice(i, 1)
  state.redisRendered.push({ secretId: s.id, version, approach: s.approach, t: state.t })
  if (isNew && animate) addFlow(state, 'cache', s, version, ['argocd', 'redis'])
  if (state.redisRendered.length > MAX_REDIS) state.redisRendered.splice(0, state.redisRendered.length - MAX_REDIS)
}

/** Version of the secret in the manifests Argo CD renders for Git HEAD (rendering approaches only). */
function headRenderVersion(s: SecretRuntime): number | null {
  if (s.approach === 'avp') return s.avpRendered
  return s.head.version
}

function currentOutage(state: AccessState): StoreOutage | null {
  const last = state.incidents.outages[state.incidents.outages.length - 1]
  return last && last.to === null ? last : null
}

/** Does this Pod consume a store-backed secret (ESO / CSI / AVP)? */
function consumesStore(state: AccessState, pod: AppPod): boolean {
  const w = findWorkload(state, pod.workloadId)
  return !!w && w.secretIds.some((id) => {
    const s = findSecret(state, id)
    return !!s && storeBacked(s)
  })
}

/**
 * Every store-backed secret this Pod consumes reached the cluster from the store before `t` (a Pod that starts during an
 * outage on a leftover Secret the store never delivered does not „survive” the outage).
 */
function syncedBefore(state: AccessState, pod: AppPod, t: number): boolean {
  const w = findWorkload(state, pod.workloadId)
  if (!w) return false
  return w.secretIds.every((id) => {
    const s = findSecret(state, id)
    return !s || !storeBacked(s) || (s.lastSyncedAt !== null && s.lastSyncedAt <= t + EPS)
  })
}

/** The active rotation of a secret (null when none or completed). */
function activeRotation(s: SecretRuntime | undefined): RotationRecord | null {
  return s && s.rotation && s.rotation.completedAt === null ? s.rotation : null
}

function schedule(state: AccessState, at: number, kind: ScheduledOp['kind'], secretId: string | null, version: number | null) {
  state.ops.push({ seq: ++state.seq.op, at, kind, secretId, version })
}

function newestKey(state: AccessState) {
  return state.sealedKeys[state.sealedKeys.length - 1]
}

function commit(state: AccessState, s: SecretRuntime, form: GitForm, version: number | null, file: string, message: string, opts: { leak?: boolean; keyId?: string | null; setHead?: boolean } = {}) {
  const seq = ++state.seq.commit
  state.commits.push({
    seq,
    sha: fakeSha(state.config.seed, seq),
    t: state.t,
    secretId: s.id,
    file,
    form,
    version,
    keyId: opts.keyId ?? null,
    leak: opts.leak ?? false,
    removedFromBranch: false,
    message,
  })
  if (opts.setHead !== false) s.head = { version, form, keyId: opts.keyId ?? null, commitSeq: seq }
  return state.commits[state.commits.length - 1]
}

/** Write the value-carrying object to the API (and so to etcd, with the current encryption provider). */
function writeObj(state: AccessState, s: SecretRuntime, version: number, kind: ObjKind) {
  s.obj = { exists: true, kind, version, storedProvider: effectiveProvider(state, kind), writtenAt: state.t }
  if (kind === 'Deployment') s.specVersion = version
  noteDelivered(state, s, version)
}

function noteDelivered(state: AccessState, s: SecretRuntime, version: number) {
  const r = s.rotation
  if (!r || r.completedAt !== null || r.deliveredAt !== null || version !== s.current) return
  r.deliveredAt = state.t
  mark(state, s, 'delivered', null, version)
  const pods = consumerPods(state, s.id)
  const envPods = pods.filter((p) => consumeOf(state, p, s) === 'env')
  const subPods = pods.filter((p) => consumeOf(state, p, s) === 'subPath')
  const staticEnv = s.approach === 'image' || s.approach === 'manifest-env'
  if (envPods.length && !staticEnv)
    emit(state, 'rotation', 'warn', `Podovi s varijablom okruženja zadržavaju staru vrijednost do ponovnog pokretanja (${envPods.map((p) => p.id).join(', ')}).`, { secretId: s.id })
  if (subPods.length) emit(state, 'rotation', 'warn', `subPath se nikad ne osvježava – potreban je novi Pod (${subPods.map((p) => p.id).join(', ')}).`, { secretId: s.id })
}

function deleteObj(s: SecretRuntime) {
  s.obj = { ...s.obj, exists: false, version: null }
}

function newVersion(state: AccessState, s: SecretRuntime): number {
  const v = s.current + 1
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  let suffix = ''
  for (let i = 0; i < 8; i++) suffix += chars[Math.floor(state.rngValues.next() * chars.length)]
  const base = s.versions[0].value.replace(/[-_][a-z0-9]{8}$/i, '')
  s.versions.push({ v, value: `${base}_${suffix}`, createdAt: state.t, revokedAt: null })
  s.current = v
  return v
}

/** Git forms that hold the value as plain text (base64 counts: it is an encoding). */
const READABLE_FORMS: readonly GitForm[] = ['base64', 'dockerfile-env', 'manifest-env', 'configmap']

/** Latch a goal (first time only). Key: `${goal}:${secretId}`, or the goal alone. */
function achieve(state: AccessState, goal: GoalId, secretId?: string) {
  const key = secretId === undefined ? goal : `${goal}:${secretId}`
  if (state.achieved[key] === undefined) state.achieved[key] = state.t
}

/** Simulated time a latched goal was first achieved (null = not yet). */
export function achievedAt(state: AccessState, goal: GoalId, secretId?: string): number | null {
  return state.achieved[secretId === undefined ? goal : `${goal}:${secretId}`] ?? null
}

/* ======================================================================
 * Approach installation / migration
 * ==================================================================== */

function gitFileFor(a: Approach): string {
  return APPROACHES[a].gitFile ?? 'secret.yaml'
}

/**
 * Put the current value into the carriers of the secret's approach.
 * instant: cluster objects are written now (initial state, explorer mode, migration).
 * A migration (not the initial state, not explorer mode) to ESO / CSI / argocd-vault-plugin while the store is down
 * cannot write the value to the store or read it back: ESO reports SecretSyncedError, Argo CD a ComparisonError, CSI
 * Pods cannot mount – nothing store-backed reaches the cluster until the store returns. A Secret left by the previous
 * approach keeps serving (Argo CD does not prune by default). Returns that Croatian reason, or null.
 */
function installApproach(state: AccessState, s: SecretRuntime, opts: { instant: boolean; quiet?: boolean }): string | null {
  const v = s.current
  const a = s.approach
  const info = APPROACHES[a]
  const t = state.t
  const storeDown = info.usesStore && !state.config.store.available && !opts.quiet && !state.config.whatIf
  const prevStore = s.storeVersion // the previous approach's store value (null unless it was store-backed)
  s.sealedObj = null
  s.esoStatus = null
  s.storeVersion = info.usesStore ? (storeDown ? prevStore : v) : null
  s.lastSyncedAt = info.usesStore && !storeDown ? t : null
  s.specVersion = null
  s.avpRendered = a === 'avp' && !storeDown ? v : null
  s.avpRenderedAt = a === 'avp' && !storeDown ? t : null
  s.avpError = false

  // 1) Git
  switch (a) {
    case 'image':
      commit(state, s, 'dockerfile-env', v, 'Dockerfile', `ENV ${s.key} u Dockerfileu`)
      state.images.push({ tag: imageTag(state), secretId: s.id, version: v, t })
      s.specVersion = v
      if (state.config.delivery === 'gitops') commit(state, s, 'image-tag', v, 'deployment.yaml', 'nova oznaka slike')
      else s.head = { ...s.head, version: v, form: 'image-tag' }
      break
    case 'manifest-env':
    case 'configmap':
    case 'git-secret':
    case 'sops':
      commit(state, s, info.gitForm as GitForm, v, gitFileFor(a), `dodaj ${gitFileFor(a)}`)
      break
    case 'sealed': {
      const k = newestKey(state)
      commit(state, s, 'sealed', v, 'sealedsecret.yaml', 'dodaj SealedSecret (kubeseal)', { keyId: k.id })
      break
    }
    case 'eso':
    case 'csi':
    case 'avp':
      commit(state, s, 'reference', null, gitFileFor(a), `dodaj ${gitFileFor(a)}`)
      break
    case 'secret':
      s.head = { version: null, form: null, keyId: null, commitSeq: s.head.commitSeq }
      state.laptopFiles.push({ secretId: s.id, version: v })
      break
  }
  s.appliedSeq = s.head.commitSeq

  // 2) Cluster objects
  const kind = objKindFor(state, s)
  if (a === 'manifest-env') s.specVersion = v
  let reason: string | null = null
  if (storeDown && (a === 'eso' || a === 'avp')) {
    if (!(s.obj.exists && s.obj.kind === 'Secret')) deleteObj(s)
    reason =
      a === 'eso'
        ? `ESO ne može dohvatiti ${s.name} iz trezora (SecretSyncedError): trezor je nedostupan.`
        : `Argo CD ne može generirati manifest za ${s.name}: trezor je nedostupan (ComparisonError).`
    if (a === 'avp') s.avpError = true
  } else if (kind !== null && opts.instant) writeObj(state, s, v, kind)
  else if (kind === null) deleteObj(s)
  if (storeDown && a === 'csi') reason = `CSI driver ne može dohvatiti ${s.name}: trezor je nedostupan – novi Podovi ne mogu montirati vrijednost.`
  if (a === 'sealed') s.sealedObj = { version: v, keyId: newestKey(state).id }
  if (a === 'eso') {
    s.esoStatus = storeDown ? 'SecretSyncedError' : 'Ready'
    const iv = state.config.timing.esoRefresh
    // seeded phase: the ExternalSecret was last refreshed somewhere within the past interval
    const phase = state.rngTiming.range(0, iv)
    s.lastRefresh = t - (iv - phase)
    s.nextRefresh = iv > 0 ? t + phase : Infinity
  }
  if (a === 'csi') {
    const phase = state.rngTiming.range(0, state.config.timing.csiRotationPoll)
    s.lastCsiPoll = t - (state.config.timing.csiRotationPoll - phase)
    s.nextCsiPoll = t + phase
  }
  if (reason && !opts.quiet) emit(state, a === 'eso' ? 'eso' : a === 'avp' ? 'sync' : 'csi', 'bad', reason, { secretId: s.id })
  // Argo CD rendered the manifests with the value (initial sync / migration commit)
  noteRender(state, s, a === 'manifest-env' ? s.specVersion : a === 'avp' ? s.avpRendered : v, !opts.quiet)
  return reason
}

function imageTag(state: AccessState): string {
  return `registry.klopa.example/klopa-api:build-${++state.seq.image}`
}

/* ======================================================================
 * Pods and workloads
 * ==================================================================== */

function createPod(state: AccessState, w: WorkloadRuntime, opts: { instant?: boolean } = {}): AppPod {
  const pod: AppPod = {
    id: `${w.name}-${++w.podSeq}`,
    workloadId: w.id,
    status: 'ContainerCreating',
    reason: null,
    message: null,
    createdAt: state.t,
    startAt: null,
    runningSince: null,
    terminateAt: null,
    generation: state.generation,
    outdated: false,
    specVersions: {},
    env: {},
    file: {},
    uses: {},
    nextSync: state.t + state.rngTiming.range(0, state.config.timing.kubeletSync),
    warnedNoReread: {},
  }
  for (const id of w.secretIds) {
    const s = findSecret(state, id)
    pod.specVersions[id] = s ? s.specVersion : null
    pod.env[id] = null
    pod.file[id] = null
    pod.uses[id] = null
    if (s?.rotation && s.rotation.completedAt === null && !opts.instant) s.rotation.restartsDuring++
  }
  state.pods.push(pod)
  tryStart(state, pod, opts.instant ?? false)
  return pod
}

function podDepsProblem(state: AccessState, pod: AppPod): { status: 'ContainerCreating' | 'CreateContainerConfigError'; reason: string; message: string; secretId: string } | null {
  const w = findWorkload(state, pod.workloadId)
  if (!w) return null
  // kubelet mounts volumes first …
  for (const id of w.secretIds) {
    const s = findSecret(state, id)
    if (!s) continue
    const mode = effectiveConsume(s.approach, w.consume)
    if (s.approach === 'csi') {
      if (!state.config.store.available)
        return {
          status: 'ContainerCreating',
          reason: 'FailedMount',
          message: 'MountVolume.SetUp failed for volume "secrets-store": rpc error: failed to mount secrets store objects',
          secretId: id,
        }
      continue
    }
    const kind = APPROACHES[s.approach].objKind
    if ((mode === 'volume' || mode === 'subPath') && (kind === 'Secret' || kind === 'ConfigMap') && !s.obj.exists) {
      const noun = kind === 'Secret' ? 'secret' : 'configmap'
      return { status: 'ContainerCreating', reason: 'FailedMount', message: `MountVolume.SetUp failed for volume "${s.name}" : ${noun} "${s.name}" not found`, secretId: id }
    }
  }
  // … then resolves env from secretKeyRef / configMapKeyRef
  for (const id of w.secretIds) {
    const s = findSecret(state, id)
    if (!s || s.approach === 'csi') continue
    const mode = effectiveConsume(s.approach, w.consume)
    const kind = APPROACHES[s.approach].objKind
    if (mode === 'env' && (kind === 'Secret' || kind === 'ConfigMap') && !s.obj.exists) {
      const noun = kind === 'Secret' ? 'secret' : 'configmap'
      return { status: 'CreateContainerConfigError', reason: 'CreateContainerConfigError', message: `Error: ${noun} "${s.name}" not found`, secretId: id }
    }
  }
  return null
}

function tryStart(state: AccessState, pod: AppPod, instant: boolean) {
  if (pod.status === 'Running' || pod.status === 'Terminating') return
  const problem = podDepsProblem(state, pod)
  if (problem) {
    const changed = pod.reason !== problem.reason
    pod.status = problem.status
    pod.reason = problem.reason
    pod.message = problem.message
    pod.startAt = null
    if (changed) {
      const label = problem.reason === 'FailedMount' ? 'stoji u ContainerCreating (FailedMount)' : 'ne može krenuti (CreateContainerConfigError)'
      emit(state, 'pod', 'bad', `${pod.id} ${label}: ${problem.message}`, { podId: pod.id, secretId: problem.secretId })
      const outage = currentOutage(state)
      const ps = findSecret(state, problem.secretId)
      if (outage && ps && storeBacked(ps)) outage.podsBlocked++
    }
    return
  }
  const wasFailing = pod.reason !== null
  pod.status = 'ContainerCreating'
  pod.reason = null
  pod.message = null
  if (instant) becomeRunning(state, pod)
  else {
    pod.startAt = state.t + state.config.timing.podStart
    if (wasFailing) emit(state, 'pod', 'info', `${pod.id}: ovisnosti su sada dostupne – kontejner se pokreće.`, { podId: pod.id })
  }
}

function becomeRunning(state: AccessState, pod: AppPod) {
  const problem = podDepsProblem(state, pod)
  if (problem) {
    pod.startAt = null
    tryStart(state, pod, false)
    return
  }
  const w = findWorkload(state, pod.workloadId)
  pod.status = 'Running'
  pod.startAt = null
  pod.runningSince = state.t
  const outage = currentOutage(state)
  if (outage && consumesStore(state, pod) && syncedBefore(state, pod, outage.from)) {
    outage.podsStarted++
    achieve(state, 'survivedStoreOutage')
  }
  if (!w) return
  for (const id of w.secretIds) {
    const s = findSecret(state, id)
    if (!s) continue
    const mode = effectiveConsume(s.approach, w.consume)
    let v: number | null
    if (s.approach === 'image' || s.approach === 'manifest-env') {
      v = pod.specVersions[id] ?? s.specVersion
      pod.env[id] = v
    } else if (s.approach === 'csi') {
      v = s.storeVersion
      if (v !== null) s.lastSyncedAt = state.t
      pod.file[id] = v
      if (mode === 'env') pod.env[id] = v
      if (v !== null && csiSyncActive(state, s) && (!s.obj.exists || s.obj.version !== v)) writeObj(state, s, v, 'Secret')
      if (v !== null) addFlow(state, 'csi', s, v, ['store', 'node', 'pod'])
    } else {
      v = s.obj.exists ? s.obj.version : null
      if (mode === 'env') pod.env[id] = v
      else pod.file[id] = v
    }
    pod.uses[id] = v
    if (s.rotation && s.rotation.completedAt === null && v !== null) mark(state, s, 'pod-started', pod, v)
  }
}

function terminatePod(state: AccessState, pod: AppPod) {
  if (pod.status === 'Terminating') return
  pod.status = 'Terminating'
  pod.reason = null
  pod.message = null
  pod.startAt = null
  pod.terminateAt = state.t + state.config.timing.podTerminate
}

/**
 * Scale-down (replicas lowered): removing a Running consumer Pod during a rotation counts as a restart – scaling
 * to 0 and back replaces every Pod, so it is no shortcut to „bez ponovnog pokretanja Poda”.
 */
function scaleDownPod(state: AccessState, w: WorkloadRuntime, pod: AppPod) {
  if (pod.status === 'Running') {
    for (const id of w.secretIds) {
      const r = activeRotation(findSecret(state, id))
      if (r) r.restartsDuring++
    }
  }
  terminatePod(state, pod)
}

/**
 * Kubernetes-style rolling replacement with maxSurge 1, maxUnavailable 0 (exact for 1–3 replicas with the 25 %
 * defaults), following pkg/controller/deployment/rolling.go:
 * - the new ReplicaSet scales up while the total stays ≤ replicas + maxSurge;
 * - old Pods are removed only within maxScaledDown = all − minAvailable − newUnavailable, **unhealthy old Pods
 *   first** (cleanupUnhealthyReplicas), healthy ones only while more than minAvailable (= replicas) are Running.
 * So a new Pod stuck on a missing Secret / store stalls the rollout and the Running Pods keep serving – also when a
 * second rollout starts on top of a stuck one (the stuck Pod is removed, never a Running one).
 */
function reconcileWorkload(state: AccessState, w: WorkloadRuntime) {
  for (let guard = 0; guard < 50; guard++) {
    const active = state.pods.filter((p) => p.workloadId === w.id && p.status !== 'Terminating')
    const outdated = active.filter((p) => p.outdated)
    const fresh = active.filter((p) => !p.outdated)
    if (outdated.length === 0) {
      if (fresh.length < w.replicas) {
        createPod(state, w)
        continue
      }
      if (fresh.length > w.replicas) {
        const victim = [...fresh].sort((a, b) => Number(a.status === 'Running') - Number(b.status === 'Running') || b.createdAt - a.createdAt)[0]
        scaleDownPod(state, w, victim)
        continue
      }
      return
    }
    if (active.length > w.replicas + 1) {
      // scaled down mid-rollout: drop not-ready Pods first, then the oldest outdated ones
      const victim = [...outdated, ...fresh].sort((a, b) => Number(a.status === 'Running') - Number(b.status === 'Running') || Number(b.outdated) - Number(a.outdated))[0]
      scaleDownPod(state, w, victim)
      continue
    }
    // new ReplicaSet scales up within the surge
    if (fresh.length < w.replicas && active.length < w.replicas + 1) {
      createPod(state, w)
      continue
    }
    // old ReplicaSets scale down (maxUnavailable 0 → minAvailable = replicas)
    const minAvailable = w.replicas
    const newUnavailable = fresh.filter((p) => p.status !== 'Running').length
    const maxScaledDown = active.length - minAvailable - newUnavailable
    if (maxScaledDown <= 0) return
    const unhealthyOld = outdated.filter((p) => p.status !== 'Running')
    if (unhealthyOld.length) {
      terminatePod(state, unhealthyOld[0])
      continue
    }
    const available = active.filter((p) => p.status === 'Running').length
    if (available > minAvailable) {
      terminatePod(state, outdated[0])
      continue
    }
    return
  }
}

/**
 * Mark consumer Pods for replacement (new Pod template or `kubectl rollout restart`).
 * instant (explorer-mode configuration changes only): Pods take the new template immediately.
 */
function rolloutWorkloads(state: AccessState, workloadIds: string[], instant = false) {
  for (const wid of workloadIds) {
    const w = findWorkload(state, wid)
    if (!w) continue
    if (instant) {
      reconfigureInstant(state, w)
      continue
    }
    for (const p of state.pods) if (p.workloadId === w.id && p.status !== 'Terminating') p.outdated = true
    reconcileWorkload(state, w)
  }
}

function consumersOf(state: AccessState, s: SecretRuntime): string[] {
  return state.workloads.filter((w) => w.secretIds.includes(s.id)).map((w) => w.id)
}

/**
 * Explorer mode: Pods take the new configuration immediately (same ids, so the UI keeps them). Changing the Pod
 * template is a restart, so during a rotation it counts in `restartsDuring` (goal „bez ponovnog pokretanja Poda”).
 */
function reconfigureInstant(state: AccessState, w: WorkloadRuntime) {
  for (const p of state.pods) {
    if (p.workloadId !== w.id || p.status === 'Terminating') continue
    for (const id of w.secretIds) {
      const r = findSecret(state, id)?.rotation
      if (r && r.completedAt === null) r.restartsDuring++
    }
    p.outdated = false
    p.status = 'ContainerCreating'
    p.reason = null
    p.message = null
    p.startAt = null
    for (const id of w.secretIds) {
      const s = findSecret(state, id)
      p.specVersions[id] = s ? s.specVersion : null
      p.env[id] = null
      p.file[id] = null
      p.uses[id] = null
    }
    tryStart(state, p, true)
  }
  reconcileWorkload(state, w)
}

/* ======================================================================
 * GitOps delivery, ESO, CSI, Sealed Secrets
 * ==================================================================== */

/** Apply what Git HEAD holds for this secret to the cluster (kubectl apply or Argo CD sync). */
function applyFromHead(state: AccessState, s: SecretRuntime) {
  const h = s.head
  s.appliedSeq = h.commitSeq
  switch (s.approach) {
    case 'image':
      if (h.version !== null && h.version !== s.specVersion) {
        s.specVersion = h.version
        noteDelivered(state, s, h.version)
        rolloutWorkloads(state, consumersOf(state, s))
      }
      return
    case 'manifest-env':
      if (h.version !== null && h.version !== s.specVersion) {
        writeObj(state, s, h.version, 'Deployment')
        rolloutWorkloads(state, consumersOf(state, s))
      }
      return
    case 'configmap':
      if (h.version !== null) writeObj(state, s, h.version, 'ConfigMap')
      return
    case 'git-secret':
    case 'sops':
      if (h.version !== null) writeObj(state, s, h.version, 'Secret')
      return
    case 'sealed':
      if (h.version !== null && h.keyId !== null) {
        s.sealedObj = { version: h.version, keyId: h.keyId }
        schedule(state, state.t + state.config.timing.unseal, 'unseal', s.id, h.version)
      }
      return
    case 'avp':
      // a new commit is a new cache key: Argo CD generates the manifests again and reads the store
      if (renderAvp(state, s)) applyAvp(state, s)
      return
    default:
      return
  }
}

/**
 * argocd-vault-plugin: generate the manifests (reads the store). Returns false when the store is down
 * (ComparisonError – reported once per episode unless `report` is 'always', e.g. a hard refresh).
 */
function renderAvp(state: AccessState, s: SecretRuntime, report: 'once' | 'always' = 'once'): boolean {
  if (!state.config.store.available) {
    if (report === 'always' || !s.avpError)
      emit(state, 'sync', 'bad', `Argo CD ne može generirati manifest za ${s.name}: trezor je nedostupan (ComparisonError).`, { secretId: s.id })
    s.avpError = true
    return false
  }
  s.avpError = false
  if (s.storeVersion !== null) {
    s.avpRendered = s.storeVersion
    s.avpRenderedAt = state.t
    s.lastSyncedAt = state.t
    noteRender(state, s, s.avpRendered)
  }
  return true
}

/**
 * The argocd-vault-plugin rotation was waiting (counted ×1, as a hard refresh could have ended it) but the cache expiry
 * ended it: those simulated seconds were really the 24 h cache lifetime – re-weight them to its ratio.
 */
function reweightCacheWait(s: SecretRuntime) {
  const r = activeRotation(s)
  if (!r || r.deliveredAt !== null || s.avpRendered !== s.current) return
  const x = r.waits['argo-cache'] ?? 0
  if (x <= 0) return
  r.realElapsed = Math.round((r.realElapsed + x * (TIMING.argoCacheExpiry.ratio - WAIT_RATIO['argo-cache'])) * 1e6) / 1e6
}

/** Apply the last generated argocd-vault-plugin manifests (sync). */
function applyAvp(state: AccessState, s: SecretRuntime) {
  const v = s.avpRendered
  if (v !== null && (!s.obj.exists || s.obj.version !== v)) {
    writeObj(state, s, v, 'Secret')
    addFlow(state, 'sync', s, v, ['store', 'argocd', 'api'])
  }
}

/** kubectl: apply now; GitOps: webhook → refresh in ~1 s, otherwise the next Argo CD poll picks it up. */
function deliverGit(state: AccessState, s: SecretRuntime) {
  if (state.config.delivery === 'kubectl') {
    applyFromHead(state, s)
    return
  }
  if (state.config.argo.webhook) schedule(state, state.t + state.config.timing.argoWebhook, 'argo-sync', null, null)
}

/** Apply every pending commit (Argo CD sync). */
function argoSync(state: AccessState) {
  const pending = state.secrets.filter((s) => s.head.commitSeq > s.appliedSeq)
  if (pending.length === 0) return
  const lastSeq = Math.max(...pending.map((s) => s.head.commitSeq))
  const sha = state.commits.find((c) => c.seq === lastSeq)?.sha ?? ''
  emit(state, 'sync', 'info', `Argo CD je sinkronizirao commit ${sha}.`)
  state.argoNotifiedSeq = Math.max(state.argoNotifiedSeq, lastSeq)
  for (const s of pending) {
    addFlow(state, 'sync', s, s.head.version ?? s.current, ['git', 'argocd', 'api'])
    applyFromHead(state, s)
  }
}

/**
 * Argo CD refresh (poll, webhook): generate manifests for Git HEAD (so rendered values land in Redis even before a
 * sync), then sync if the Application has automated sync; otherwise only report OutOfSync once per new commit.
 */
function argoRefresh(state: AccessState) {
  const ttl = state.config.timing.argoCacheExpiry
  const regenerated: SecretRuntime[] = []
  for (const s of state.secrets) {
    if (s.approach === 'avp' && (s.avpRenderedAt === null || state.t - s.avpRenderedAt >= ttl - EPS)) {
      // argocd-vault-plugin: the cached manifests expired (--repo-cache-expiration) or were never generated – Argo CD
      // runs the plugin again, which reads the store: a value changed there is picked up now (or on a hard refresh)
      const before = s.avpRendered
      if (renderAvp(state, s)) {
        regenerated.push(s)
        if (s.avpRendered !== before) reweightCacheWait(s)
      }
      continue
    }
    noteRender(state, s, headRenderVersion(s))
  }
  if (state.config.argo.autoSync) {
    for (const s of regenerated) applyAvp(state, s)
    argoSync(state)
    return
  }
  const drift = regenerated.filter((s) => s.avpRendered !== null && (!s.obj.exists || s.obj.version !== s.avpRendered))
  if (drift.length)
    emit(state, 'sync', 'warn', `Argo CD: ponovno generirani manifest za ${drift.map((s) => s.name).join(', ')} razlikuje se od klastera (OutOfSync) – potreban je Sync.`)
  const pending = state.secrets.filter((s) => s.head.commitSeq > s.appliedSeq)
  if (pending.length === 0) return
  const lastSeq = Math.max(...pending.map((s) => s.head.commitSeq))
  if (lastSeq <= state.argoNotifiedSeq) return
  state.argoNotifiedSeq = lastSeq
  const sha = state.commits.find((c) => c.seq === lastSeq)?.sha ?? ''
  emit(state, 'sync', 'warn', `Argo CD: aplikacija je OutOfSync (commit ${sha}) – automatska sinkronizacija je isključena, potreban je Sync.`)
}

function esoRefresh(state: AccessState, s: SecretRuntime) {
  const iv = state.config.timing.esoRefresh
  s.lastRefresh = state.t
  // refreshInterval 0: sync once, never again (only a spec change or force-sync refreshes)
  s.nextRefresh = iv > 0 ? state.t + iv : Infinity
  if (!state.config.store.available) {
    if (s.esoStatus !== 'SecretSyncedError') {
      const what = !s.obj.exists ? 'ne može se stvoriti' : s.lastSyncedAt !== null ? 'zadržava zadnju sinkroniziranu vrijednost' : 'nije sinkroniziran iz trezora'
      emit(state, 'eso', 'warn', `ESO: trezor je nedostupan – Secret ${s.name} ${what}.`, { secretId: s.id })
    }
    if (s.rotation && s.rotation.completedAt === null) s.rotation.stalled = 'trezor je nedostupan – ESO ne može osvježiti Secret'
    s.esoStatus = 'SecretSyncedError'
    return
  }
  s.esoStatus = 'Ready'
  if (s.storeVersion !== null) s.lastSyncedAt = state.t
  if (s.rotation) s.rotation.stalled = null
  if (s.storeVersion !== null && (!s.obj.exists || s.obj.version !== s.storeVersion)) {
    const created = !s.obj.exists
    writeObj(state, s, s.storeVersion, 'Secret')
    addFlow(state, 'eso', s, s.storeVersion, ['store', 'controller', 'api'])
    emit(state, 'eso', 'ok', `ESO je ${created ? 'stvorio' : 'osvježio'} Secret ${s.name} iz trezora (v${s.storeVersion}).`, { secretId: s.id })
  }
}

function csiPoll(state: AccessState, s: SecretRuntime) {
  s.lastCsiPoll = state.t
  s.nextCsiPoll = state.t + state.config.timing.csiRotationPoll
  if (!state.config.csi.rotation || !state.config.store.available || s.storeVersion === null) return
  const v = s.storeVersion
  s.lastSyncedAt = state.t
  let updated = 0
  for (const p of runningConsumers(state, s.id)) {
    const mode = consumeOf(state, p, s)
    if (mode !== 'volume' && mode !== 'env') continue
    if (p.file[s.id] === v) continue
    p.file[s.id] = v
    updated++
    addFlow(state, 'csi', s, v, ['store', 'node', 'pod'])
    if (s.rotation && s.rotation.completedAt === null) mark(state, s, 'file', p, v)
    if (mode === 'volume') appSeesFile(state, p, s, v)
  }
  if (csiSyncActive(state, s) && s.obj.exists && s.obj.version !== v) writeObj(state, s, v, 'Secret')
  if (updated) emit(state, 'csi', 'ok', `CSI driver je osvježio datoteku ${s.name} (v${v}): ${plural(updated, ['Pod', 'Poda', 'Podova'])}.`, { secretId: s.id })
}

function appSeesFile(state: AccessState, p: AppPod, s: SecretRuntime, v: number) {
  if (state.config.appRereadsFiles) {
    p.uses[s.id] = v
    if (s.rotation && s.rotation.completedAt === null) mark(state, s, 'app', p, v)
    emit(state, 'pod', 'ok', `${p.id}: aplikacija je pročitala novu datoteku ${s.name} (v${v}).`, { podId: p.id, secretId: s.id })
  } else if (!p.warnedNoReread[s.id]) {
    p.warnedNoReread[s.id] = true
    emit(state, 'pod', 'warn', `${p.id}: datoteka ${s.name} je nova (v${v}), ali aplikacija je ne čita ponovno.`, { podId: p.id, secretId: s.id })
  }
}

function kubeletSync(state: AccessState, p: AppPod) {
  const period = state.config.timing.kubeletSync
  while (p.nextSync <= state.t + EPS) p.nextSync += period
  if (p.status === 'CreateContainerConfigError' || (p.status === 'ContainerCreating' && p.reason === 'FailedMount')) {
    tryStart(state, p, false)
    return
  }
  if (p.status !== 'Running') return
  const w = findWorkload(state, p.workloadId)
  if (!w) return
  for (const id of w.secretIds) {
    const s = findSecret(state, id)
    if (!s || s.approach === 'csi') continue
    const kind = APPROACHES[s.approach].objKind
    if (kind !== 'Secret' && kind !== 'ConfigMap') continue
    if (effectiveConsume(s.approach, w.consume) !== 'volume') continue // env: frozen at start; subPath: never updated
    if (!s.obj.exists || s.obj.version === null || s.obj.version === p.file[id]) continue
    const v = s.obj.version
    p.file[id] = v
    addFlow(state, 'kubelet', s, v, ['api', 'node', 'pod'])
    if (s.rotation && s.rotation.completedAt === null) mark(state, s, 'file', p, v)
    appSeesFile(state, p, s, v)
  }
}

function runOp(state: AccessState, op: ScheduledOp) {
  const s = findSecret(state, op.secretId ?? undefined)
  switch (op.kind) {
    case 'argo-sync':
      argoRefresh(state)
      return
    case 'eso-refresh':
      if (s && s.approach === 'eso') esoRefresh(state, s)
      return
    case 'image-built': {
      if (!s || s.approach !== 'image' || op.version === null) return
      s.buildingVersion = null
      state.images.push({ tag: imageTag(state), secretId: s.id, version: op.version, t: state.t })
      addFlow(state, 'build', s, op.version, ['git', 'ci', 'registry'])
      emit(state, 'rotation', 'info', `CI je izgradio novu sliku s ${s.key} (v${op.version}) – stara slika ostaje u registru.`, { secretId: s.id })
      if (state.config.delivery === 'gitops') {
        commit(state, s, 'image-tag', op.version, 'deployment.yaml', 'nova oznaka slike')
        deliverGit(state, s)
      } else {
        s.head = { ...s.head, version: op.version, form: 'image-tag' }
        applyFromHead(state, s)
      }
      return
    }
    case 'unseal': {
      if (!s || !s.sealedObj || s.approach !== 'sealed') return
      const so = s.sealedObj
      if (state.sealedKeys.some((k) => k.id === so.keyId)) {
        if (s.rotation && s.rotation.completedAt === null) s.rotation.stalled = null
        if (!s.obj.exists || s.obj.version !== so.version) {
          writeObj(state, s, so.version, 'Secret')
          addFlow(state, 'unseal', s, so.version, ['controller', 'api'])
          emit(state, 'sealed', 'ok', `Kontroler Sealed Secrets otpečatio je ${s.name} (v${so.version}).`, { secretId: s.id })
        }
      } else {
        emit(state, 'sealed', 'bad', `Kontroler ne može otpečatiti ${s.name}: nijedan ključ ne odgovara (no key could decrypt secret).`, { secretId: s.id })
        if (s.rotation && s.rotation.completedAt === null) s.rotation.stalled = 'kontroler nema ključ za otpečaćivanje'
      }
      return
    }
  }
}

/* ======================================================================
 * Rotation bookkeeping
 * ==================================================================== */

function startRotation(state: AccessState, s: SecretRuntime, from: number, to: number) {
  if (s.rotation && s.rotation.completedAt === null) {
    s.rotation.toVersion = to
    s.rotation.deliveredAt = null
    s.rotation.stalled = null
    s.rotation.warning = null
    return
  }
  const r: RotationRecord = {
    id: ++state.seq.rotation,
    secretId: s.id,
    fromVersion: from,
    toVersion: to,
    startedAt: state.t,
    deliveredAt: null,
    completedAt: null,
    revokedAt: null,
    restartsDuring: 0,
    stalled: null,
    warning: null,
    realElapsed: 0,
    waits: {},
    consumersAtCompletion: 0,
  }
  s.rotation = r
  s.rotations.push(r)
  if (s.rotations.length > 20) s.rotations.splice(0, s.rotations.length - 20)
}

/**
 * A rotation completes once every Running consumer uses the newest value – and at least one does, unless no consumer
 * Pod exists at all (0 replicas). Consumer Pods that are only starting or stuck (ContainerCreating, FailedMount,
 * CreateContainerConfigError) defer it: „svi Podovi koriste v2” must never be said about Pods that do not run yet,
 * and the old value is not revoked before a consumer actually runs on the new one.
 */
function checkRotation(state: AccessState, s: SecretRuntime) {
  const r = s.rotation
  if (!r || r.completedAt !== null || r.deliveredAt === null) return
  const pods = consumerPods(state, s.id)
  const running = pods.filter((p) => p.status === 'Running')
  if (!running.every((p) => p.uses[s.id] === s.current)) return
  if (running.length === 0 && pods.length > 0) return
  r.completedAt = state.t
  r.consumersAtCompletion = running.length
  r.stalled = null
  mark(state, s, 'completed', null, s.current)
  const took = fmtS(r.completedAt - r.startedAt)
  emit(
    state,
    'rotation',
    'ok',
    running.length
      ? `${s.name}: rotacija je završena za ${took} – svi Podovi koriste v${s.current}.`
      : `${s.name}: rotacija je završena za ${took} – nijedan Pod trenutačno ne koristi vrijednost (v${s.current}).`,
    { secretId: s.id },
  )
  if (running.length > 0) {
    if (r.restartsDuring === 0) achieve(state, 'rotateWithoutRestart', s.id)
    if (r.realElapsed <= ROTATION_GOAL_REAL_S + 1e-9 && !versionInGit(state, s.id, r.toVersion)) achieve(state, 'rotateFast', s.id)
  }
  if (state.config.autoRevoke) revokeOlder(state, s)
}

function revokeOlder(state: AccessState, s: SecretRuntime): number {
  const revoked = s.versions.filter((v) => v.v < s.current && v.revokedAt === null)
  for (const v of revoked) {
    v.revokedAt = state.t
    mark(state, s, 'revoked', null, v.v)
  }
  if (revoked.length) {
    if (s.rotation && s.rotation.revokedAt === null) s.rotation.revokedAt = state.t
    const list = revoked.map((v) => `v${v.v}`).join(', ')
    emit(
      state,
      'rotation',
      'ok',
      revoked.length === 1
        ? `${s.name}: stara vrijednost ${list} je opozvana – tko zna samo nju, više je ne može iskoristiti.`
        : `${s.name}: stare vrijednosti ${list} su opozvane – tko zna samo njih, više ih ne može iskoristiti.`,
      { secretId: s.id },
    )
    const failing = runningConsumers(state, s.id).filter((p) => !isUsable(s, p.uses[s.id]))
    for (const p of failing) emit(state, 'pod', 'bad', `${p.id} koristi opozvanu vrijednost – prijava ne uspijeva.`, { podId: p.id, secretId: s.id })
  }
  return revoked.length
}

/** Real seconds per simulated second while a rotation waits for each mechanism (see TimingValue.ratio). */
export const WAIT_RATIO: Record<RotationWait, number> = {
  'argo-poll': TIMING.argoPoll.ratio,
  'argo-webhook': TIMING.argoWebhook.ratio,
  'manual-sync': 1,
  unseal: TIMING.unseal.ratio,
  'eso-refresh': TIMING.esoRefresh.ratio,
  'image-build': TIMING.imageBuild.ratio,
  kubelet: TIMING.kubeletSync.ratio,
  'csi-poll': TIMING.csiRotationPoll.ratio,
  // ×1 while a hard refresh could end the wait; re-weighted to TIMING.argoCacheExpiry.ratio if the cache expiry ends it
  'argo-cache': 1,
  'pod-start': TIMING.podStart.ratio,
  action: 1,
  blocked: 1,
}

/** Croatian label per wait kind (for a breakdown next to the real-time estimate). */
export const WAIT_LABELS: Record<RotationWait, string> = {
  'argo-poll': 'Argo CD provjerava Git',
  'argo-webhook': 'webhook prema Argo CD-u',
  'manual-sync': 'čeka ručni Sync u Argo CD-u',
  unseal: 'kontroler otpečaćuje',
  'eso-refresh': 'ESO čeka refreshInterval',
  'image-build': 'CI gradi sliku',
  kubelet: 'kubelet osvježava datoteku',
  'csi-poll': 'CSI driver provjerava trezor',
  'argo-cache': 'čeka hard refresh ili istek predmemorije Argo CD-a (24 h)',
  'pod-start': 'novi Podovi se pokreću',
  action: 'čeka vašu akciju (restart / hard refresh)',
  blocked: 'zastoj (trezor, ključ, refreshInterval: 0 ili Pod bez Secreta)',
}

/**
 * What an active rotation is waiting for right now (pure). Decides how a simulated second counts in real time.
 * Several waits at once (e.g. one Pod on the kubelet, one on a restart): the slowest mechanism (largest ratio).
 */
export function rotationWait(state: AccessState, secretId: string = state.config.focusSecretId): RotationWait | null {
  const s = findSecret(state, secretId)
  const r = activeRotation(s)
  if (!s || !r) return null
  const cfg = state.config
  if (r.deliveredAt === null) {
    // decided by the mechanism that is actually pending (a non-blocking `warning` never changes it)
    if (s.approach === 'image' && s.buildingVersion !== null) return 'image-build'
    if (s.approach === 'eso') return !cfg.store.available || !Number.isFinite(s.nextRefresh) ? 'blocked' : 'eso-refresh'
    if (cfg.delivery === 'gitops' && s.head.commitSeq > s.appliedSeq) {
      if (state.ops.some((o) => o.kind === 'argo-sync')) return cfg.argo.autoSync ? 'argo-webhook' : 'manual-sync'
      return cfg.argo.autoSync ? 'argo-poll' : 'manual-sync'
    }
    if (s.approach === 'avp') {
      if (s.avpRendered === s.current) return cfg.argo.autoSync ? 'argo-poll' : 'manual-sync' // generated, not applied yet
      return cfg.store.available ? 'argo-cache' : 'blocked'
    }
    if (s.approach === 'sealed' && state.ops.some((o) => o.kind === 'unseal' && o.secretId === s.id)) return 'unseal'
    return 'blocked'
  }
  const kinds: RotationWait[] = []
  for (const p of consumerPods(state, s.id)) {
    if (p.status === 'ContainerCreating' && p.startAt !== null) {
      kinds.push('pod-start')
      continue
    }
    if (p.status === 'CreateContainerConfigError' || (p.status === 'ContainerCreating' && p.reason !== null)) {
      // stuck: blocked while its Secret / store is missing, otherwise waiting for the kubelet to retry
      kinds.push(podDepsProblem(state, p) ? 'blocked' : 'kubelet')
      continue
    }
    if (p.status !== 'Running' || p.uses[s.id] === s.current) continue
    const mode = consumeOf(state, p, s)
    if (p.outdated) kinds.push('pod-start') // being replaced by a rollout
    else if (s.approach === 'csi') kinds.push(cfg.csi.rotation && mode === 'volume' && cfg.appRereadsFiles ? 'csi-poll' : 'action')
    else if (mode === 'volume' && p.file[s.id] !== s.current && s.obj.exists && s.obj.version === s.current) kinds.push('kubelet')
    else kinds.push('action')
  }
  // the slowest mechanism decides the wall clock; on a tie prefer the informative kind over „action”
  let best: RotationWait | null = null
  for (const k of kinds) if (best === null || WAIT_RATIO[k] > WAIT_RATIO[best] || (WAIT_RATIO[k] === WAIT_RATIO[best] && best === 'action')) best = k
  return best ?? 'action'
}

/* ======================================================================
 * step()
 * ==================================================================== */

/** Advance by dt seconds of simulated time (any dt; internal fixed step DT = 0.1 s). NaN/negative dt is ignored. */
export function step(state: AccessState, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return
  state.acc += Math.min(dt, MAX_STEP_INPUT)
  while (state.acc >= DT - EPS) {
    state.acc -= DT
    tick(state)
  }
  if (state.acc < 0) state.acc = 0
}

/**
 * Simulated seconds until the last attempt still in flight arrives (0 when none travels). An attempt covers
 * hops.length segments of hopDur each from its startedAt.
 */
export function attemptsRemainingS(state: AccessState): number {
  let need = 0
  for (const a of state.attempts) if (a.doneAt === null) need = Math.max(need, a.hops.length * a.hopDur - (state.t - a.startedAt))
  return Math.max(0, need)
}

/**
 * Resolve every attempt in flight now (a paused sim, prefers-reduced-motion): steps the state until the last token
 * has arrived (plus one internal tick) and returns the simulated seconds advanced (0 when nothing travels).
 * Everything else advances by the same time – exactly like calling step() for that long. With a UI hook, pass
 * attemptsRemainingS(state) + 0.1 to its own single-step function instead, so the hook stays in charge of time.
 */
export function settleAttempts(state: AccessState): number {
  const need = attemptsRemainingS(state)
  if (need <= 0) return 0
  const t0 = state.t
  step(state, need + DT)
  return state.t - t0
}

function tick(state: AccessState) {
  // 0) real-time weight of this tick for every active rotation (what it waits for during [t, t + DT))
  for (const s of state.secrets) {
    const r = activeRotation(s)
    if (!r) continue
    const w = rotationWait(state, s.id) ?? 'action'
    // rounded to µs so repeated 0,1 s steps do not drift (60 × 0,1 = 60, not 60,00000000000058)
    r.realElapsed = Math.round((r.realElapsed + DT * WAIT_RATIO[w]) * 1e6) / 1e6
    r.waits[w] = Math.round(((r.waits[w] ?? 0) + DT) * 1e6) / 1e6
  }

  state.tick++
  state.t = state.tick / TICKS_PER_SECOND
  const t = state.t
  const cfg = state.config

  // 1) scheduled operations (stable order: time, then insertion)
  if (state.ops.length) {
    const due = state.ops.filter((o) => o.at <= t + EPS).sort((a, b) => a.at - b.at || a.seq - b.seq)
    if (due.length) {
      state.ops = state.ops.filter((o) => o.at > t + EPS)
      for (const op of due) runOp(state, op)
    }
  }

  // 2) controllers on timers
  if (cfg.delivery === 'gitops' && t + EPS >= state.nextArgoPoll) {
    state.lastArgoPoll = t
    state.nextArgoPoll = t + cfg.timing.argoPoll + state.rngTiming.range(0, cfg.timing.argoJitter)
    argoRefresh(state)
  }
  for (const s of state.secrets) {
    if (s.approach === 'eso' && t + EPS >= s.nextRefresh) esoRefresh(state, s)
    if (s.approach === 'csi' && t + EPS >= s.nextCsiPoll) csiPoll(state, s)
  }
  if (t + EPS >= state.nextKeyRenewal) {
    while (state.nextKeyRenewal <= t + EPS) state.nextKeyRenewal += cfg.timing.sealedKeyRenewal
    if (cfg.sealed.autoRenew && state.secrets.some((s) => s.approach === 'sealed')) renewKey(state, 'auto')
  }

  // 3) Pods: terminate, start, kubelet sync
  if (state.pods.some((p) => p.status === 'Terminating' && p.terminateAt !== null && t + EPS >= p.terminateAt)) {
    state.pods = state.pods.filter((p) => !(p.status === 'Terminating' && p.terminateAt !== null && t + EPS >= p.terminateAt))
  }
  for (const p of state.pods) if (p.status === 'ContainerCreating' && p.startAt !== null && t + EPS >= p.startAt) becomeRunning(state, p)
  for (const p of state.pods) if (p.status !== 'Terminating' && t + EPS >= p.nextSync) kubeletSync(state, p)

  // 4) Deployments keep replicas / roll out
  for (const w of state.workloads) reconcileWorkload(state, w)

  // 5) CSI synced Secret lives only while a Pod mounts the volume
  for (const s of state.secrets) {
    if (s.approach !== 'csi' || !s.obj.exists) continue
    const mounted = consumerPods(state, s.id).some((p) => p.status === 'Running' || p.startAt !== null)
    if (!mounted || !csiSyncActive(state, s)) deleteObj(s)
  }

  // 6) rotations and leak follow-up
  for (const s of state.secrets) checkRotation(state, s)
  for (const l of state.incidents.leaks) {
    if (l.closedAt !== null) continue
    const s = findSecret(state, l.secretId)
    if (s && !isUsable(s, l.version) && !verdictOf(state, 'git-reader', s.id).reads) {
      l.closedAt = t
      emit(state, 'git', 'ok', `${s.name}: procurjela vrijednost (commit ${l.sha}) je opozvana i Git više ne otkriva važeću vrijednost.`, { secretId: s.id })
      if (state.incidents.leaks.every((x) => x.secretId !== s.id || x.closedAt !== null)) achieve(state, 'leakHandled', s.id)
    }
  }

  // 7) animations
  advanceAttempts(state)
  advanceFlows(state)

  // 8) metrics, once per simulated second
  if (t + EPS >= state.metrics.nextSample) sampleMetrics(state)
}

/** Where a token is after `elapsed` seconds (hopDur s per segment). Attempts: segment k goes to hops[k] (k = 0 from the actor's eye). Flows: from hops[0]. */
function hopAt(hops: readonly GraphNodeId[], fromActor: boolean, elapsed: number, hopDur: number): { hopIndex: number; hopProgress: number; progress: number } {
  const first = fromActor ? 0 : 1
  const segs = Math.max(1, hops.length - first)
  const total = segs * hopDur
  const e = Math.max(0, Math.min(elapsed, total))
  const k = Math.min(segs - 1, Math.floor(e / hopDur + EPS))
  return {
    progress: total > 0 ? e / total : 1,
    hopIndex: Math.min(hops.length - 1, first + k),
    hopProgress: Math.max(0, Math.min(1, (e - k * hopDur) / hopDur)),
  }
}

function advanceHop(h: Hop, fromActor: boolean, elapsed: number) {
  const p = hopAt(h.hops, fromActor, elapsed, h.hopDur)
  h.progress = p.progress
  h.hopIndex = p.hopIndex
  h.hopProgress = p.hopProgress
}

function advanceAttempts(state: AccessState) {
  if (!state.attempts.length) return
  for (const a of state.attempts) {
    advanceHop(a, true, state.t - a.startedAt)
    if (a.doneAt === null && a.progress >= 1 - EPS) {
      a.doneAt = state.t
      if (a.resolve === 'arrival') {
        // the attempt happens now: judge it on the state at arrival, not on the state at launch
        const s = findSecret(state, a.secretId)
        if (s) {
          const o = resolveOutcome(state, a.actorId, s, a.request)
          a.changedOnArrival = o.success !== a.success || o.pathId !== a.pathId
          a.success = o.success
          a.channel = o.channel
          a.text = o.text
          a.short = o.short
          a.pathId = o.pathId
          a.control = o.control
        }
        attemptDecided(state, a)
      }
      const s = findSecret(state, a.secretId)
      const subject = ACTORS[a.actorId].subject
      const what = s?.labelAcc ?? 'vrijednost'
      const when = a.resolve === 'launch' && a.decidedAt !== null && a.decidedAt < state.t - EPS ? ` (stanje u ${fmtS(a.decidedAt)})` : ''
      if (a.success) emit(state, 'attempt', 'bad', `${subject} čita ${what}: ${a.short}${when}.`, { actorId: a.actorId, secretId: a.secretId })
      else emit(state, 'attempt', 'ok', `${subject} ne može pročitati ${what}: ${CONTROL_LABELS[a.control ?? 'not-applicable']}${when}.`, { actorId: a.actorId, secretId: a.secretId })
    }
  }
  state.attempts = state.attempts.filter((a) => a.doneAt === null || state.t - a.doneAt < a.linger - EPS)
}

function advanceFlows(state: AccessState) {
  if (!state.flows.length) return
  for (const f of state.flows) advanceHop(f, false, state.t - f.startedAt)
  state.flows = state.flows.filter((f) => state.t - f.startedAt < f.duration - EPS)
}

export interface TokenSegment {
  /** where the current segment starts: a graph node, or `'actor'` (the attempting actor's eye) */
  from: GraphNodeId | 'actor'
  to: GraphNodeId
  /** 0..1 along the current segment (linear: latency-bearing movement) */
  f: number
  /** 0..1 along the whole route */
  progress: number
}

/**
 * Smooth position of an attempt or flow token, interpolated with the time not yet consumed by the 0,1 s tick
 * (`state.acc`) – call it every render frame. Attempts start at the actor's eye (`from: 'actor'`), flows at hops[0].
 */
export function tokenSegment(state: AccessState, tok: Attempt | Flow): TokenSegment {
  const isFlow = 'kind' in tok
  const elapsed = Math.round((state.t + state.acc - tok.startedAt) * 1e9) / 1e9
  const p = hopAt(tok.hops, !isFlow, elapsed, tok.hopDur)
  const first = isFlow ? 1 : 0
  const fromIdx = p.hopIndex - 1
  const from: GraphNodeId | 'actor' = p.hopIndex === first && !isFlow ? 'actor' : tok.hops[Math.max(0, fromIdx)]
  return { from, to: tok.hops[p.hopIndex], f: p.hopProgress, progress: p.progress }
}

function sampleMetrics(state: AccessState) {
  const m = state.metrics
  m.nextSample = Math.floor(state.t + EPS) + 1
  const report = evaluateAccess(state)
  const running = state.pods.filter((p) => p.status === 'Running')
  const s = findSecret(state, state.config.focusSecretId)
  m.redEyes.push(report.visibleRed)
  m.running.push(running.length)
  m.stale.push(s ? runningConsumers(state, s.id).filter((p) => p.uses[s.id] !== s.current).length : 0)
  m.authFailing.push(authFailingPods(state).length)
  sampleExposure(state, s ? { [s.id]: report } : {})
}

/** Open / extend / close exposure windows from the current verdicts (once per simulated second). */
function sampleExposure(state: AccessState, known: Record<string, ReturnType<typeof evaluateAccess>>) {
  const all = { ...evaluateAllExcept(state, Object.keys(known)), ...known }
  for (const [secretId, report] of Object.entries(all)) {
    for (const v of report.verdicts) {
      const open = findOpenWindow(state, v.actorId, secretId)
      if (v.reads) {
        const vs = v.paths.flatMap((p) => p.versions)
        if (open) open.versions = uniqSorted([...open.versions, ...vs])
        else {
          state.exposure.push({ actorId: v.actorId, secretId, from: state.t, to: null, versions: uniqSorted(vs) })
          if (state.exposure.length > MAX_EXPOSURE) state.exposure.splice(0, state.exposure.length - MAX_EXPOSURE)
        }
      } else if (open) open.to = state.t
    }
  }
}

function evaluateAllExcept(state: AccessState, skip: string[]): Record<string, ReturnType<typeof evaluateAccess>> {
  if (skip.length === 0) return evaluateAll(state)
  const out: Record<string, ReturnType<typeof evaluateAccess>> = {}
  for (const s of state.secrets) if (!skip.includes(s.id)) out[s.id] = evaluateAccess(state, s.id)
  return out
}

function findOpenWindow(state: AccessState, actorId: ActorId, secretId: string): ExposureWindow | undefined {
  for (let i = state.exposure.length - 1; i >= 0; i--) {
    const w = state.exposure[i]
    if (w.actorId === actorId && w.secretId === secretId && w.to === null) return w
  }
  return undefined
}

/* ======================================================================
 * Actions – rotation and recovery
 * ==================================================================== */

/** „Lozinka baze” → „lozinka baze” (label inside a sentence) */
function lc(label: string): string {
  return label.charAt(0).toLocaleLowerCase('hr') + label.slice(1)
}

/**
 * „Rotiraj lozinku / ključ”: a new value at the source of truth, then propagation per approach.
 * Old values stay valid until every running consumer uses the new one (autoRevoke), or revokeOld().
 * `'all'` rotates every secret. Returns false if nothing happened (unknown secret, store down for store-based
 * approaches; with 'all': none rotated).
 */
export function rotateSecret(state: AccessState, secretId: string | 'all' = state.config.focusSecretId): boolean {
  if (secretId === 'all') {
    let any = false
    for (const x of [...state.secrets]) any = rotateSecret(state, x.id) || any
    return any
  }
  const s = findSecret(state, secretId)
  if (!s) return false
  const info = APPROACHES[s.approach]
  if (info.usesStore && !state.config.store.available) {
    state.incidents.rotationsRefused++
    emit(state, 'rotation', 'warn', `Trezor je nedostupan – ${lc(s.label)} ne može dobiti novu vrijednost.`, { secretId: s.id })
    if (s.rotation && s.rotation.completedAt === null) s.rotation.stalled = 'trezor je nedostupan'
    return false
  }
  const from = s.current
  const v = newVersion(state, s)
  startRotation(state, s, from, v)
  mark(state, s, 'rotated', null, v)
  emit(state, 'rotation', 'info', `Rotacija: ${lc(s.label)} dobiva novu vrijednost (v${v}).`, { secretId: s.id })
  switch (s.approach) {
    case 'image':
      commit(state, s, 'dockerfile-env', v, 'Dockerfile', `nova vrijednost ${s.key} u Dockerfileu`, { setHead: false })
      s.buildingVersion = v
      addFlow(state, 'commit', s, v, ['laptop', 'git'])
      schedule(state, state.t + state.config.timing.imageBuild, 'image-built', s.id, v)
      break
    case 'manifest-env':
    case 'configmap':
    case 'git-secret':
    case 'sops':
      commit(state, s, info.gitForm as GitForm, v, gitFileFor(s.approach), `nova vrijednost u ${gitFileFor(s.approach)}`)
      addFlow(state, 'commit', s, v, ['laptop', 'git'])
      deliverGit(state, s)
      break
    case 'sealed': {
      const k = newestKey(state)
      if (k.compromised || state.leakedKeyIds.includes(k.id)) {
        emit(state, 'sealed', 'bad', `${s.name}: nova vrijednost zapečaćena je ključem ${k.id} koji je procurio – može se otpečatiti. Prvo treba obnoviti ključ.`, { secretId: s.id })
        // a caveat, not a stall: the commit → sync → unseal pipeline runs as usual
        if (s.rotation) s.rotation.warning = `zapečaćeno ključem ${k.id} koji je procurio`
      }
      commit(state, s, 'sealed', v, 'sealedsecret.yaml', 'kubeseal: nova vrijednost', { keyId: k.id })
      addFlow(state, 'commit', s, v, ['laptop', 'git'])
      deliverGit(state, s)
      break
    }
    case 'secret':
      state.laptopFiles.push({ secretId: s.id, version: v })
      emit(state, 'rotation', 'info', `kubectl apply -f secret.yaml: Secret ${s.name} je odmah promijenjen.`, { secretId: s.id })
      writeObj(state, s, v, 'Secret')
      addFlow(state, 'commit', s, v, ['laptop', 'api'])
      break
    case 'eso':
      s.storeVersion = v
      addFlow(state, 'store-write', s, v, ['laptop', 'store'])
      if (Number.isFinite(s.nextRefresh)) emit(state, 'rotation', 'info', `${s.name}: nova vrijednost upisana je u trezor; ESO je preuzima pri sljedećem osvježavanju.`, { secretId: s.id })
      else {
        emit(state, 'rotation', 'warn', `${s.name}: nova vrijednost upisana je u trezor, ali uz refreshInterval: 0 ESO ne osvježava Secret – potreban je force-sync.`, { secretId: s.id })
        if (s.rotation) s.rotation.stalled = 'refreshInterval: 0 – ESO ne osvježava Secret'
      }
      break
    case 'csi':
      s.storeVersion = v
      addFlow(state, 'store-write', s, v, ['laptop', 'store'])
      noteDelivered(state, s, v)
      emit(
        state,
        'rotation',
        state.config.csi.rotation ? 'info' : 'warn',
        state.config.csi.rotation
          ? `${s.name}: nova vrijednost upisana je u trezor; CSI driver je preuzima pri sljedećoj provjeri.`
          : `${s.name}: rotacija u CSI driveru je isključena – novu vrijednost dobivaju tek novi Podovi.`,
        { secretId: s.id },
      )
      break
    case 'avp':
      s.storeVersion = v
      addFlow(state, 'store-write', s, v, ['laptop', 'store'])
      emit(
        state,
        'rotation',
        'warn',
        `${s.name}: Argo CD ne zna da se trezor promijenio – novi manifest generira tek nakon hard refresha, novog commita ili isteka predmemorije (${TIMING.argoCacheExpiry.realLabel}).`,
        { secretId: s.id },
      )
      break
  }
  checkRotation(state, s)
  return true
}

/** Revoke every older version now (even if some Pods still use it → their logins fail). Returns the count. */
export function revokeOld(state: AccessState, secretId: string = state.config.focusSecretId): number {
  const s = findSecret(state, secretId)
  if (!s) return 0
  return revokeOlder(state, s)
}

/** `kubectl rollout restart deployment/<name>` (all consumer workloads when omitted). */
export function restartPods(state: AccessState, workloadId?: string): void {
  const ws = workloadId ? state.workloads.filter((w) => w.id === workloadId) : state.workloads
  if (!ws.length) return
  for (const w of ws) {
    emit(state, 'pod', 'info', `kubectl rollout restart deployment/${w.name}`)
    rolloutWorkloads(state, [w.id])
  }
}

/** ESO `force-sync` annotation: refresh now instead of waiting for refreshInterval. */
export function forceEsoSync(state: AccessState, secretId?: string): void {
  for (const s of state.secrets) if (s.approach === 'eso' && (!secretId || s.id === secretId)) esoRefresh(state, s)
}

/**
 * ExternalSecret `refreshInterval` in seconds – a real manifest value, not compressed (the Klopa YAML sets 30 s;
 * ESO's default is 1 h = 3600). Changing the spec bumps the ExternalSecret's generation, so ESO syncs at once
 * (externalsecret_controller.go: SyncedResourceVersion ≠ resource version → refresh). 0 = sync once, never refresh
 * again (rotation then stalls until force-sync). Values are clamped to ≤ 24 h; negative / NaN are ignored.
 * Returns the interval in use.
 */
export function setEsoRefreshInterval(state: AccessState, seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return state.config.timing.esoRefresh
  const sec = Math.min(seconds, 24 * 3600)
  state.config.timing.esoRefresh = sec
  emit(
    state,
    'config',
    sec === 0 ? 'warn' : 'info',
    sec === 0
      ? 'ESO refreshInterval: 0 – Secret se sinkronizira jednom i više se ne osvježava (osim uz force-sync).'
      : `ESO refreshInterval: ${fmtDuration(sec)} (zadano: 1 h) – promjena specifikacije odmah pokreće sinkronizaciju.`,
  )
  for (const s of state.secrets) if (s.approach === 'eso') esoRefresh(state, s)
  return sec
}

/**
 * Argo CD „Hard refresh”: manifests are generated again, bypassing the cache (argocd-vault-plugin re-reads the
 * store). With automated sync the result is applied at once; otherwise the app is OutOfSync until argoSyncNow().
 */
export function argoHardRefresh(state: AccessState): void {
  if (state.config.delivery !== 'gitops') return
  emit(state, 'sync', 'info', 'Argo CD: hard refresh – manifesti se ponovno generiraju.')
  for (const s of state.secrets) if (s.approach === 'avp') renderAvp(state, s, 'always')
  if (state.config.argo.autoSync) {
    for (const s of state.secrets) if (s.approach === 'avp') applyAvp(state, s)
  } else if (state.secrets.some((s) => s.approach === 'avp' && s.avpRendered !== null && s.obj.version !== s.avpRendered)) {
    emit(state, 'sync', 'warn', 'Argo CD: generirani manifest razlikuje se od klastera (OutOfSync) – automatska sinkronizacija je isključena, potreban je Sync.')
  }
  argoRefresh(state)
}

/** Sync now (Argo CD „Sync” button): applies pending commits and the last generated argocd-vault-plugin manifests. */
export function argoSyncNow(state: AccessState): void {
  if (state.config.delivery !== 'gitops') return
  for (const s of state.secrets) if (s.approach === 'avp') applyAvp(state, s)
  argoSync(state)
}

/** Argo CD `syncPolicy.automated` on/off (Argo CD's own default is off; the Klopa Application turns it on). */
export function setArgoAutoSync(state: AccessState, on: boolean): void {
  if (state.config.argo.autoSync === on) return
  state.config.argo.autoSync = on
  emit(
    state,
    'config',
    on ? 'info' : 'warn',
    on ? 'Argo CD: automatska sinkronizacija uključena (syncPolicy.automated).' : 'Argo CD: automatska sinkronizacija isključena (zadano u Argo CD-u) – promjene iz Gita primjenjuje tek Sync.',
  )
}

/* ======================================================================
 * Actions – Sealed Secrets keys
 * ==================================================================== */

/** A fresh sealing key, stored (as a Secret in kube-system) with the current encryption provider. */
function newKey(state: AccessState) {
  return { id: `k${++state.seq.key}`, createdAt: state.t, compromised: false, storedProvider: effectiveProvider(state, 'Secret') }
}

function renewKey(state: AccessState, why: 'auto' | 'early') {
  const k = newKey(state)
  state.sealedKeys.push(k)
  const n = state.sealedKeys.length
  if (why === 'auto')
    // one row for the growing ring (group): automatic renewals never push rotation / sync narration out of the log
    emit(
      state,
      'sealed',
      'info',
      `Kontroler ima ${plural(n, ['ključ', 'ključa', 'ključeva'])} za pečaćenje (najnoviji ${k.id}). Postojeći SealedSecreti i vrijednosti se ne mijenjaju.`,
      { group: 'key-renewal' },
    )
  else emit(state, 'sealed', 'info', `Rana obnova ključa (--key-cutoff-time): novi ključ ${k.id}. Ništa nije rotirano – stare vrijednosti i dalje vrijede.`)
}

/** Early key renewal (`--key-cutoff-time`). Adds a key; re-encrypts nothing and rotates nothing. */
export function renewSealingKey(state: AccessState): void {
  renewKey(state, 'early')
}

/** `kubeseal --re-encrypt`: same values sealed with the newest key. Old commits stay in history. */
export function reencryptSealed(state: AccessState): number {
  const k = newestKey(state)
  let n = 0
  for (const s of state.secrets) {
    if (s.approach !== 'sealed' || s.head.version === null) continue
    commit(state, s, 'sealed', s.head.version, 'sealedsecret.yaml', 'kubeseal --re-encrypt', { keyId: k.id })
    deliverGit(state, s)
    if (s.rotation && s.rotation.completedAt === null) s.rotation.stalled = null
    n++
  }
  if (n) emit(state, 'sealed', 'warn', `SealedSecreti su ponovno šifrirani ključem ${k.id}: vrijednosti su iste, a stari commitovi ostaju u povijesti Gita.`)
  return n
}

/** „Procurio privatni ključ kontrolera”: every key currently in the ring is compromised. */
export function leakControllerKey(state: AccessState): void {
  for (const k of state.sealedKeys) {
    k.compromised = true
    if (!state.leakedKeyIds.includes(k.id)) state.leakedKeyIds.push(k.id)
  }
  emit(state, 'leak', 'bad', 'Procurili su privatni ključevi kontrolera: svaki SealedSecret ikad spremljen u Git sada je čitljiv. Treba obnoviti ključ, a zatim rotirati vrijednosti.')
}

/**
 * „Izgubi privatni ključ kontrolera”: the controller's keys are gone (e.g. the cluster is rebuilt).
 * With a key backup they are restored; without one the new controller has a fresh key and cannot unseal.
 * rebuild (default true) recreates the cluster from Git, which is when the loss becomes visible.
 */
export function loseControllerKey(state: AccessState, opts: { rebuild?: boolean } = {}): void {
  if (state.config.sealed.keyBackup) {
    emit(state, 'sealed', 'ok', 'Ključevi kontrolera vraćeni su iz sigurnosne kopije (oznaka sealedsecrets.bitnami.com/sealed-secrets-key).')
  } else {
    const k = newKey(state)
    state.sealedKeys = [k]
    emit(state, 'sealed', 'bad', `Privatni ključevi kontrolera su izgubljeni, a sigurnosne kopije nema – novi kontroler ima samo ključ ${k.id}.`)
  }
  if (opts.rebuild ?? true) rebuildCluster(state, { keysAlreadyHandled: true })
}

/** Re-seal the current values with the newest key and commit (recovery after a lost key). */
export function resealAll(state: AccessState): number {
  const k = newestKey(state)
  let n = 0
  for (const s of state.secrets) {
    if (s.approach !== 'sealed') continue
    commit(state, s, 'sealed', s.current, 'sealedsecret.yaml', 'kubeseal: ponovno zapečaćeno novim ključem', { keyId: k.id })
    addFlow(state, 'commit', s, s.current, ['laptop', 'git'])
    deliverGit(state, s)
    if (s.rotation && s.rotation.completedAt === null) s.rotation.stalled = null
    n++
  }
  if (n) emit(state, 'sealed', 'info', `Vrijednosti su ponovno zapečaćene ključem ${k.id} i spremljene u Git.`)
  return n
}

export function setKeyBackup(state: AccessState, on: boolean): void {
  state.config.sealed.keyBackup = on
  emit(state, 'config', on ? 'ok' : 'warn', on ? 'Sigurnosna kopija ključeva kontrolera čuva se izvan klastera.' : 'Bez sigurnosne kopije ključeva kontrolera.')
}

/* ======================================================================
 * Actions – disaster
 * ==================================================================== */

/**
 * The cluster is recreated and everything in Git is applied again (GitOps bootstrap or kubectl apply -f).
 * Secrets applied by hand are gone; SealedSecrets unseal only if the keys came back; ESO/AVP need the store;
 * every Pod is new, so missing Secrets show CreateContainerConfigError (env) or FailedMount (volume).
 */
export function rebuildCluster(state: AccessState, opts: { keysAlreadyHandled?: boolean } = {}): void {
  const cfg = state.config
  state.generation++
  if (!opts.keysAlreadyHandled && !cfg.sealed.keyBackup && state.secrets.some((s) => s.approach === 'sealed')) {
    const k = newKey(state)
    state.sealedKeys = [k]
    emit(state, 'sealed', 'bad', `Novi klaster, novi kontroler: bez sigurnosne kopije postoji samo ključ ${k.id}.`)
  }
  // the key Secrets are written again in the new cluster's etcd, with its encryption provider
  for (const k of state.sealedKeys) k.storedProvider = effectiveProvider(state, 'Secret')
  emit(state, 'cluster', 'warn', `Klaster je ponovno izgrađen (generacija ${state.generation}): sve se primjenjuje iz Gita.`)
  state.pods = []
  state.podLogs = []
  state.flows = []
  state.redisRendered = [] // Argo CD (and its Redis) is reinstalled with the cluster
  state.ops = state.ops.filter((o) => o.kind === 'image-built')
  for (const s of state.secrets) {
    s.obj = { exists: false, kind: null, version: null, storedProvider: 'identity', writtenAt: state.t }
    s.sealedObj = null
    s.esoStatus = null
    s.appliedSeq = 0
    s.lastSyncedAt = null // nothing in the new cluster came from the store yet
    switch (s.approach) {
      case 'secret':
        emit(state, 'cluster', 'bad', `Secret ${s.name} bio je primijenjen ručno – u novom klasteru ne postoji.`, { secretId: s.id })
        break
      case 'image':
        // the Deployment in Git points at the image tag that holds the value
        s.appliedSeq = s.head.commitSeq
        break
      case 'eso':
        s.nextRefresh = state.t + DT
        s.appliedSeq = s.head.commitSeq
        break
      case 'csi':
        s.appliedSeq = s.head.commitSeq
        break
      default: {
        // manifest-env, configmap, git-secret, sops, sealed, avp: bootstrap from Git HEAD
        const h = s.head
        s.appliedSeq = h.commitSeq
        if (s.approach === 'avp') {
          s.avpRendered = null
          s.avpRenderedAt = null
          s.avpError = false
          if (renderAvp(state, s)) applyAvp(state, s)
        } else if (s.approach === 'sealed') {
          if (h.version !== null && h.keyId !== null) {
            s.sealedObj = { version: h.version, keyId: h.keyId }
            schedule(state, state.t + cfg.timing.unseal, 'unseal', s.id, h.version)
          }
        } else if (h.version !== null) writeObj(state, s, h.version, s.approach === 'manifest-env' ? 'Deployment' : s.approach === 'configmap' ? 'ConfigMap' : 'Secret')
        if (s.approach !== 'avp') noteRender(state, s, h.version)
      }
    }
  }
  for (const w of state.workloads) for (let i = 0; i < w.replicas; i++) createPod(state, w)
}

/** Re-apply secret.yaml from the laptop (works only if the laptop still has it). */
export function applySecretManually(state: AccessState, secretId: string = state.config.focusSecretId): boolean {
  const s = findSecret(state, secretId)
  if (!s) return false
  const files = state.laptopFiles.filter((f) => f.secretId === s.id)
  if (!files.length) {
    emit(state, 'cluster', 'warn', `Na laptopu nema datoteke secret.yaml za ${s.name}.`, { secretId: s.id })
    return false
  }
  const v = files[files.length - 1].version
  writeObj(state, s, v, objKindFor(state, s) === 'ConfigMap' ? 'ConfigMap' : 'Secret')
  addFlow(state, 'restore', s, v, ['laptop', 'api'])
  emit(state, 'cluster', isUsable(s, v) ? 'info' : 'bad', `kubectl apply -f secret.yaml: Secret ${s.name} ponovno postoji (v${v})${isUsable(s, v) ? '' : ' – ali ta je vrijednost opozvana'}.`, { secretId: s.id })
  return true
}

/* ======================================================================
 * Actions – leaks (break-it)
 * ==================================================================== */

/** „Spremi secret.yaml u Git” / „Spremi običan Secret u Git”: the current value, base64, in Git history. */
export function commitPlainSecret(state: AccessState, secretId: string = state.config.focusSecretId): boolean {
  const s = findSecret(state, secretId)
  if (!s) return false
  const c = commit(state, s, 'base64', s.current, 'secret.yaml', 'dodaj secret.yaml', { leak: true, setHead: false })
  state.incidents.leaks.push({ secretId: s.id, version: s.current, sha: c.sha, t: state.t, closedAt: null, initial: false })
  addFlow(state, 'commit', s, s.current, ['laptop', 'git'])
  emit(state, 'leak', 'bad', `secret.yaml je spremljen u Git (commit ${c.sha}): base64 može dekodirati svatko s klonom.`, { secretId: s.id })
  return true
}

/**
 * „Obrisao sam commit”: removes the leaked commits (commitPlainSecret) from the branch – clones keep them, the eye
 * stays red. `allPlain` also rewrites older readable commits of the secret out of the branch (history rewrite);
 * the commit Git HEAD deploys is never touched (deleting it would delete the app's configuration).
 * Returns the number of commits removed.
 */
export function deleteLeakedCommit(state: AccessState, secretId: string = state.config.focusSecretId, opts: { allPlain?: boolean } = {}): number {
  const s = findSecret(state, secretId)
  const leakedShas = new Set(state.incidents.leaks.filter((l) => l.secretId === secretId).map((l) => l.sha))
  let n = 0
  let headLeak: string | null = null
  for (const c of state.commits) {
    if (c.secretId !== secretId || c.removedFromBranch) continue
    const readable = READABLE_FORMS.includes(c.form)
    const isHead = s !== undefined && c.seq === s.head.commitSeq
    const leaked = c.leak || leakedShas.has(c.sha)
    if (leaked && isHead) {
      headLeak = c.sha // the commit Git HEAD deploys: removing it would remove the app's configuration
      continue
    }
    if (leaked || (opts.allPlain && readable && !isHead)) {
      c.removedFromBranch = true
      n++
    }
  }
  const name = s?.name ?? secretId
  emit(
    state,
    'git',
    n || headLeak ? 'warn' : 'info',
    n
      ? `${name}: commit uklonjen iz grane (force push), ali klonovi, forkovi i sigurnosne kopije ga i dalje imaju – pomaže samo rotacija.`
      : headLeak
        ? `${name}: commit ${headLeak} je trenutačna konfiguracija (HEAD) – najprije premjestite tajnu iz Gita (npr. u SealedSecret), a zatim je rotirajte.`
        : `${name}: nema commita s vrijednošću za uklanjanje.`,
    { secretId },
  )
  return n
}

/** „Ispiši env u log”: every running Pod that holds the value in an env var prints it. Returns entries written. */
export function leakEnvToLog(state: AccessState): number {
  let n = 0
  for (const p of state.pods) {
    if (p.status !== 'Running') continue
    const w = findWorkload(state, p.workloadId)
    if (!w) continue
    for (const id of w.secretIds) {
      const s = findSecret(state, id)
      const v = p.env[id]
      if (!s || v === null || v === undefined) continue
      if (effectiveConsume(s.approach, w.consume) !== 'env') continue
      const entry = { t: state.t, secretId: id, version: v, podId: p.id }
      state.podLogs.push(entry)
      state.centralLogs.push({ ...entry })
      addFlow(state, 'log', s, v, ['pod', 'logs'])
      n++
    }
  }
  if (state.podLogs.length > MAX_LOGS) state.podLogs.splice(0, state.podLogs.length - MAX_LOGS)
  if (state.centralLogs.length > MAX_LOGS) state.centralLogs.splice(0, state.centralLogs.length - MAX_LOGS)
  if (n) emit(state, 'leak', 'bad', `Aplikacija je ispisala okruženje u log – vrijednost je u ${n === 1 ? 'jednom zapisu' : `${n} zapisa`}.`)
  else emit(state, 'leak', 'ok', 'Nijedan Pod nema vrijednost u varijablama okruženja – ispis okruženja je ne otkriva.')
  return n
}

/** „Token u CI logu”: the pipeline printed the current value. */
export function leakToCiLog(state: AccessState, secretId: string = state.config.focusSecretId): boolean {
  const s = findSecret(state, secretId)
  if (!s) return false
  state.ciLogs.push({ t: state.t, secretId: s.id, version: s.current, podId: null })
  if (state.ciLogs.length > MAX_LOGS) state.ciLogs.splice(0, state.ciLogs.length - MAX_LOGS)
  addFlow(state, 'ci-log', s, s.current, ['ci', 'ci-log'])
  emit(state, 'leak', 'bad', `Pipeline je ispisao ${s.key} u CI log.`, { secretId: s.id })
  return true
}

/** A team member leaves knowing every current value (the ex-employee eye). */
export function memberLeaves(state: AccessState): void {
  for (const s of state.secrets) {
    if (!state.exEmployeeKnows.some((k) => k.secretId === s.id && k.version === s.current)) state.exEmployeeKnows.push({ secretId: s.id, version: s.current })
  }
  emit(state, 'config', 'warn', 'Član tima odlazi: pristupi su ukinuti, ali vrijednosti koje zna vrijede do rotacije.')
}

/* ======================================================================
 * Actions – configuration toggles
 * ==================================================================== */

/**
 * Switch where the value lives. Explorer mode (whatIf): as if it had always been so (this secret's Git history,
 * images, laptop files and Argo CD cache entries reset; explicit leaks kept). Otherwise a migration: the new carrier
 * gets the CURRENT value at once (with GitOps delivery the commit → sync → controller path is animated with flows,
 * but not delayed – see README „Deliberate simplifications”); old Git history and old Argo CD cache entries stay, so
 * old values remain readable until rotated.
 * Pods are replaced only when the Pod template changes (templateKey): moving between Secret-backed approaches
 * (Secret, plain Secret in Git, SealedSecret, SOPS, ESO, argocd-vault-plugin) keeps `secretKeyRef` / the secret
 * volume by name, so running Pods keep running.
 * A migration to ESO / CSI / argocd-vault-plugin while the store is down changes Git, but nothing store-backed reaches
 * the cluster until the store returns (`reason` says so; see installApproach).
 */
export function setApproach(state: AccessState, secretId: string | 'all', approach: Approach): SetApproachResult {
  const targets = secretId === 'all' ? state.secrets : state.secrets.filter((s) => s.id === secretId)
  let applied = false
  let reason: string | null = null
  for (const s of targets) {
    if (!(approach in APPROACHES) || s.approach === approach) continue
    applied = true
    const prev = s.approach
    s.approach = approach
    if (state.config.whatIf) {
      state.commits = state.commits.filter((c) => c.secretId !== s.id || c.leak)
      state.images = state.images.filter((i) => i.secretId !== s.id)
      state.laptopFiles = state.laptopFiles.filter((f) => f.secretId !== s.id)
      state.redisRendered = state.redisRendered.filter((r) => r.secretId !== s.id)
      state.exposure = state.exposure.filter((w) => w.secretId !== s.id)
      // as if it had always been so: the setup's initial leak goes with the history (explicit leaks stay)
      state.incidents.leaks = state.incidents.leaks.filter((l) => l.secretId !== s.id || !l.initial)
      s.head = { version: null, form: null, keyId: null, commitSeq: 0 }
    }
    const r = installApproach(state, s, { instant: true })
    reason = reason ?? r
    emit(state, 'config', 'info', `${s.label}: ${APPROACHES[prev].label} → ${APPROACHES[approach].label}.`, { secretId: s.id })
    if (!state.config.whatIf && verdictOf(state, 'git-reader', s.id).reads && APPROACHES[approach].gitForm !== 'base64')
      emit(state, 'git', 'warn', `${s.name}: stara vrijednost i dalje je u povijesti Gita – vrijedi do rotacije.`, { secretId: s.id })
    if (!state.config.whatIf && state.config.delivery === 'gitops') migrationFlows(state, s)
    if (templateKey(prev) !== templateKey(approach)) rolloutWorkloads(state, consumersOf(state, s), state.config.whatIf)
  }
  if (state.config.whatIf && targets.length) sampleExposure(state, {}) // explorer mode: exposure starts now
  return { applied, reason }
}

export interface SetApproachResult {
  /** at least one secret changed approach */
  applied: boolean
  /** Croatian caveat (e.g. the store is down, so the value cannot reach the cluster yet), or null */
  reason: string | null
}

/** Cosmetic pipeline tokens for a GitOps migration (the cluster side has already been applied). */
function migrationFlows(state: AccessState, s: SecretRuntime) {
  const v = s.current
  addFlow(state, 'commit', s, v, ['laptop', 'git'])
  addFlow(state, 'sync', s, v, ['git', 'argocd', 'api'])
  if (s.approach === 'sealed') addFlow(state, 'unseal', s, v, ['controller', 'api'])
  if (!state.config.store.available) return // nothing comes out of the store
  if (s.approach === 'eso') addFlow(state, 'eso', s, v, ['store', 'controller', 'api'])
  if (s.approach === 'avp') addFlow(state, 'sync', s, v, ['store', 'argocd', 'api'])
}

/**
 * Consumption env / volume / subPath for a Deployment (a Pod-template change → rollout; explorer mode: instant).
 * For values that are always env vars (image ENV, env literal) the setting is stored for later but changes
 * nothing now – bind UIs to effectiveConsumeOf().
 */
export function setConsume(state: AccessState, workloadId: string | 'all', mode: ConsumeMode): void {
  const ws = workloadId === 'all' ? state.workloads : state.workloads.filter((w) => w.id === workloadId)
  for (const w of ws) {
    if (w.consume === mode) continue
    w.consume = mode
    const secrets = w.secretIds.map((id) => findSecret(state, id)).filter((x): x is SecretRuntime => x !== undefined)
    if (secrets.length && secrets.every((x) => APPROACHES[x.approach].envOnly)) {
      emit(state, 'config', 'info', `${w.name}: u slici i u env literalu vrijednost je uvijek varijabla okruženja – način čitanja se ne mijenja.`)
      continue
    }
    emit(state, 'config', 'info', `${w.name}: vrijednost se čita kao ${mode === 'env' ? 'varijabla okruženja' : mode === 'volume' ? 'datoteka (volumen)' : 'datoteka (subPath)'}.`)
    rolloutWorkloads(state, [w.id], state.config.whatIf)
  }
}

/**
 * Encryption at rest. rewrite (default true) = `kubectl get secrets -A -o json | kubectl replace -f -`: existing
 * objects are written again with the new provider; without it only new writes are encrypted.
 */
export function setEncryption(state: AccessState, provider: Provider, opts: { scope?: EncryptionScope; rewrite?: boolean } = {}): void {
  if (!(provider in PROVIDERS)) return
  state.config.encryption.provider = provider
  if (opts.scope) state.config.encryption.scope = opts.scope
  const rewrite = opts.rewrite ?? true
  if (rewrite) {
    for (const s of state.secrets) if (s.obj.exists && s.obj.kind) s.obj.storedProvider = effectiveProvider(state, s.obj.kind)
    // `kubectl get secrets -A … | kubectl replace` also rewrites the controller's key Secrets in kube-system
    for (const k of state.sealedKeys) k.storedProvider = effectiveProvider(state, 'Secret')
  }
  const info = PROVIDERS[provider]
  const tone: Tone = provider === 'identity' ? 'warn' : info.recommended ? 'ok' : provider === 'aescbc' ? 'warn' : 'info'
  const scopeNote = provider === 'identity' ? '' : state.config.encryption.scope === 'secrets' ? ' Šifriraju se samo Secreti.' : ''
  const rw = provider !== 'identity' && !rewrite ? ' Postojeći objekti ostaju nešifrirani dok se ponovno ne zapišu.' : ''
  emit(state, 'encryption', tone, `Šifriranje u mirovanju: ${info.label} – ${info.note}.${scopeNote}${rw}`)
}

export function setLeastPrivilege(state: AccessState, on: boolean): void {
  state.config.leastPrivilege = on
  state.bindings.developer = [on ? 'view' : 'edit']
  emit(state, 'rbac', on ? 'ok' : 'warn', on ? 'RBAC s najmanjim ovlastima: razvojni programer dobiva ulogu view (bez Secreta).' : 'Razvojni programer ima ulogu edit (čita Secrete, stvara Podove i smije exec).')
}

/** Replace an actor's role bindings (RBAC is additive: the union of all bound roles applies). */
export function setActorRoles(state: AccessState, actorId: ActorId, roles: RoleId[]): void {
  if (actorId === 'laptop-thief' || !(actorId in state.bindings)) return
  state.bindings[actorId] = [...new Set(roles)]
}

/**
 * Bind per-verb rules to an actor (unioned with its roles), e.g. only `watch` on secrets, only `get`, or only
 * `create` on pods – for the scene „Tko može pročitati?”. Empty `rules` removes them. `label` names them in
 * roleLabel()/actorLabel() (default: „vlastita pravila: watch na secrets”).
 */
export function setActorRules(state: AccessState, actorId: ActorId, rules: PolicyRule[], label?: string): void {
  if (actorId === 'laptop-thief' || !(actorId in state.bindings)) return
  const clean = rules
    .map((r) => ({ resources: [...new Set(r.resources)], verbs: [...new Set(r.verbs)] }))
    .filter((r) => r.resources.length > 0 && r.verbs.length > 0)
  if (clean.length === 0) {
    delete state.customRules[actorId]
    return
  }
  const auto = `vlastita pravila: ${clean.map((r) => `${r.verbs.join(', ')} na ${r.resources.join(', ')}`).join('; ')}`
  state.customRules[actorId] = { rules: clean, label: label ?? auto }
}

/**
 * Eye label that stays true after rebinding: the RBAC eyes „Uloga view u Namespaceu” / „Smije stvarati Podove”
 * become „Uloga <roles> u Namespaceu” once their roles or rules differ from the defaults.
 */
export function actorLabel(state: AccessState, actorId: ActorId): string {
  const base = ACTORS[actorId]?.label ?? actorId
  if (actorId !== 'view-user' && actorId !== 'pod-creator') return base
  const def: RoleId[] = actorId === 'view-user' ? ['view'] : ['deployer']
  const b = state.bindings[actorId] ?? []
  const same = b.length === def.length && b.every((r, i) => r === def[i]) && !state.customRules[actorId]
  if (same) return base
  // still able to create Pods? keep the pod-creator wording
  const rules = [...b.flatMap((r) => ROLES[r].rules), ...(state.customRules[actorId]?.rules ?? [])]
  if (actorId === 'pod-creator' && (rulesAllow(rules, 'create', 'pods') || rulesAllow(rules, 'create', 'deployments'))) return base
  return `Uloga ${roleLabel(state, actorId)} u Namespaceu`
}

/**
 * „Aplikacija ponovno čita datoteku”. Turning it on also lets apps pick up a mounted file that already changed while
 * they did not re-read (otherwise a rotation would wait for a restart forever).
 */
export function setAppRereads(state: AccessState, on: boolean): void {
  if (state.config.appRereadsFiles === on) return
  state.config.appRereadsFiles = on
  emit(state, 'config', 'info', on ? 'Aplikacija ponovno čita montiranu datoteku kad se promijeni.' : 'Aplikacija čita montiranu datoteku samo pri pokretanju.')
  if (!on) return
  for (const p of state.pods) {
    if (p.status !== 'Running') continue
    for (const s of state.secrets) {
      if (!(s.id in p.file) || consumeOf(state, p, s) !== 'volume') continue
      const f = p.file[s.id]
      if (f !== null && f !== undefined && f !== p.uses[s.id]) appSeesFile(state, p, s, f)
    }
  }
}

/**
 * Cosmetic: pass the playback speed (sim.speed). Hop and linger durations of new tokens are multiplied by it, so at 4×
 * an attempt or a flow still takes the same wall-clock time. Never changes a model outcome. Clamped to 0,25–64.
 */
export function setAnimationScale(state: AccessState, playbackSpeed: number): void {
  if (!Number.isFinite(playbackSpeed) || playbackSpeed <= 0) return
  state.animScale = Math.max(ANIM_SCALE_MIN, Math.min(ANIM_SCALE_MAX, playbackSpeed))
}

/**
 * RBAC rules of the app's ServiceAccount, whose token is mounted into every app Pod (= the compromised-Pod eye's API
 * identity). Default: none. `[]` removes them. Same as setActorRules(s, 'compromised-pod', …).
 */
export function setServiceAccountRules(state: AccessState, rules: PolicyRule[], label?: string): void {
  setActorRules(state, 'compromised-pod', rules, label)
}

export function setReplicas(state: AccessState, workloadId: string, replicas: number): void {
  const w = findWorkload(state, workloadId)
  if (!w || !Number.isFinite(replicas)) return
  w.replicas = clampReplicas(replicas)
  reconcileWorkload(state, w)
}

/** „Trezor nedostupan” / back up. Each outage is recorded in `state.incidents.outages`. */
export function setStoreAvailable(state: AccessState, on: boolean): void {
  if (state.config.store.available === on) return
  state.config.store.available = on
  if (on) {
    const o = currentOutage(state)
    if (o) o.to = state.t
  } else state.incidents.outages.push({ from: state.t, to: null, podsStarted: 0, podsBlocked: 0 })
  emit(state, 'store', on ? 'ok' : 'bad', on ? 'Trezor je ponovno dostupan.' : 'Trezor je nedostupan.')
  if (!on) return
  // a migration during the outage could not write the value to the store: it is written now
  for (const s of state.secrets) {
    if (!storeBacked(s) || s.storeVersion !== null) continue
    s.storeVersion = s.current
    addFlow(state, 'store-write', s, s.current, ['laptop', 'store'])
    emit(state, 'store', 'info', `${s.name}: vrijednost je upisana u trezor (v${s.current}).`, { secretId: s.id })
  }
}

export function setCsiRotation(state: AccessState, on: boolean): void {
  state.config.csi.rotation = on
}

export function setCsiSync(state: AccessState, on: boolean): void {
  state.config.csi.syncSecret = on
  for (const s of state.secrets) {
    if (s.approach !== 'csi') continue
    if (csiSyncActive(state, s)) {
      const vs = runningConsumers(state, s.id).map((p) => p.file[s.id]).filter((v): v is number => v !== null && v !== undefined)
      if (vs.length) writeObj(state, s, Math.max(...vs), 'Secret')
    } else deleteObj(s)
  }
}

export function setArgoWebhook(state: AccessState, on: boolean): void {
  state.config.argo.webhook = on
}

export function setLaptop(state: AccessState, patch: Partial<AccessConfig['laptop']>): void {
  state.config.laptop = { ...state.config.laptop, ...patch }
}

export function setFocus(state: AccessState, secretId: string): void {
  if (findSecret(state, secretId)) state.config.focusSecretId = secretId
}

export function setVisibleActors(state: AccessState, actors: ActorId[]): void {
  state.config.visibleActors = actors.filter((a) => a in ACTORS)
}

/* ======================================================================
 * Attempts (animated „pokušaj”)
 * ==================================================================== */

/** Croatian short names of controls (for event texts and badges). */
export const CONTROL_LABELS: Record<ControlId, string> = {
  'encryption-at-rest': 'šifriranje u mirovanju',
  kms: 'ključ je u vanjskom KMS-u',
  rbac: 'RBAC',
  'no-value-in-git': 'u Gitu nema vrijednosti',
  'git-encryption': 'u Gitu je samo šifrat',
  'no-value-in-image': 'slika ne sadrži vrijednost',
  'not-in-etcd': 'vrijednost nije u bazi etcd',
  rotation: 'vrijednost je opozvana',
  'no-leak': 'vrijednost nije procurila',
  'gitops-tool': 'Argo CD ne vidi vrijednost',
  'disk-encryption': 'šifrirani disk',
  'no-pod': 'nijedan Pod ne radi',
  'store-down': 'trezor je nedostupan',
  'not-applicable': 'nije primjenjivo',
}

export interface AttemptOption {
  /** AccessPath.id (works), `stale:<path id>` (only revoked values) or `blocked:<channel>:<i>` (stopped) */
  pathId: string
  channel: Channel
  /** true = reads a still-valid value */
  ok: boolean
  /** what the actor does: a command or a Croatian phrase („kubectl get secrets -o yaml”) */
  action: string
  /** Croatian outcome: „čita v1”, „RBAC: 403 Forbidden”, „vrijednost je opozvana”, „ključ je u vanjskom KMS-u” */
  outcome: string
  /** Croatian one-line label for a picker: `${action} → ${outcome}` */
  label: string
}

function outcomeLabel(control: ControlId): string {
  return control === 'rbac' ? 'RBAC: 403 Forbidden' : CONTROL_LABELS[control]
}

/**
 * Every route an actor could try against a secret – working ones first, then rotated-out (revoked) ones, then
 * blocked ones (one per denied RBAC verb) – so a UI can show „list → 403” next to „watch → čita”.
 */
export function attemptOptions(state: AccessState, actorId: ActorId, secretId: string = state.config.focusSecretId): AttemptOption[] {
  if (!(actorId in ACTORS) || !findSecret(state, secretId)) return []
  const v = verdictOf(state, actorId, secretId)
  const opt = (pathId: string, channel: Channel, ok: boolean, action: string, outcome: string): AttemptOption => ({ pathId, channel, ok, action, outcome, label: `${action} → ${outcome}` })
  return [
    ...v.paths.map((p) => opt(p.id, p.channel, true, p.action, `čita ${p.versions.map((x) => `v${x}`).join(', ')}`)),
    ...v.stalePaths.map((p) => opt(`stale:${p.id}`, p.channel, false, p.action, CONTROL_LABELS.rotation)),
    ...v.blocked.map((b, i) => opt(`blocked:${b.channel}:${i}`, b.channel, false, b.action, outcomeLabel(b.control))),
  ]
}

type AttemptRequest = Attempt['request']

interface AttemptOutcome {
  hops: GraphNodeId[]
  steps: string[]
  success: boolean
  channel: Channel
  text: string
  short: string
  pathId: string
  control: ControlId | null
}

/**
 * The outcome of an attempt on the current state: the requested route (pathId, or the first route with that channel),
 * else the first working route, else the first blocked one. `strict` (tryVerb): a channel with no route at all is a
 * failure, never a fallback to another route.
 */
function resolveOutcome(state: AccessState, actorId: ActorId, s: SecretRuntime, req: AttemptRequest): AttemptOutcome {
  const v = verdictOf(state, actorId, s.id)
  const byChannel = req.channel !== null
  const chosen = req.pathId !== null ? v.paths.find((p) => p.id === req.pathId) : byChannel ? v.paths.find((p) => p.channel === req.channel) : undefined
  const blockedIdx =
    req.pathId !== null
      ? v.blocked.findIndex((b, i) => `blocked:${b.channel}:${i}` === req.pathId)
      : byChannel && !v.paths.some((p) => p.channel === req.channel)
        ? v.blocked.findIndex((b) => b.channel === req.channel)
        : -1
  const stale = req.pathId?.startsWith('stale:') ? v.stalePaths.find((p) => `stale:${p.id}` === req.pathId) : byChannel && !chosen && blockedIdx < 0 ? v.stalePaths.find((p) => p.channel === req.channel) : undefined
  if (stale) return { hops: [...stale.hops], steps: [...stale.steps], success: false, channel: stale.channel, text: `${stale.text} Vrijednost je opozvana.`, short: stale.short, pathId: `stale:${stale.id}`, control: 'rotation' }
  const unmatched = req.strict && byChannel && !chosen && blockedIdx < 0
  if (!unmatched && (chosen || (blockedIdx < 0 && v.paths.length))) {
    const p = chosen ?? v.paths[0]
    return { hops: [...p.hops], steps: [...p.steps], success: true, channel: p.channel, text: p.text, short: p.short, pathId: p.id, control: null }
  }
  if (!unmatched && v.blocked.length) {
    const i = blockedIdx >= 0 ? blockedIdx : 0
    const b = v.blocked[i]
    return { hops: b.hops.slice(0, b.blockedAt + 1), steps: b.steps.slice(0, b.blockedAt + 1), success: false, channel: b.channel, text: b.reason, short: CONTROL_LABELS[b.control], pathId: `blocked:${b.channel}:${i}`, control: b.control }
  }
  return {
    hops: [ACTORS[actorId].entry],
    steps: [''],
    success: false,
    channel: req.channel ?? 'memory',
    text: unmatched ? 'Ta ovlast ne vodi do vrijednosti.' : 'Nema puta do vrijednosti.',
    short: CONTROL_LABELS['not-applicable'],
    pathId: 'none',
    control: 'not-applicable',
  }
}

/**
 * Consequences of a decided attempt: the log entry; a stolen etcd copy / disk also carries the Sealed Secrets keys
 * stored readable in it (every SealedSecret sealed with them becomes readable); goal „Objasnite zašto oko „smije
 * stvarati Podove” ostaje crveno” once the Pod creator mounts the value while only honest limits are red.
 */
function attemptDecided(state: AccessState, a: Attempt) {
  a.decidedAt = state.t
  state.attemptLog.push({ id: a.id, t: state.t, actorId: a.actorId, secretId: a.secretId, channel: a.channel, pathId: a.pathId, success: a.success })
  if (state.attemptLog.length > MAX_ATTEMPT_LOG) state.attemptLog.splice(0, state.attemptLog.length - MAX_ATTEMPT_LOG)
  if (a.actorId === 'etcd-backup-thief' || a.actorId === 'cp-disk-thief') {
    const fresh = keysReadableFrom(state, a.actorId === 'etcd-backup-thief' ? 'backup' : 'disk').filter((id) => !state.leakedKeyIds.includes(id))
    for (const id of fresh) {
      state.leakedKeyIds.push(id)
      const k = state.sealedKeys.find((x) => x.id === id)
      if (k) k.compromised = true
    }
    if (fresh.length)
      emit(
        state,
        'leak',
        'bad',
        `${a.actorId === 'etcd-backup-thief' ? 'Kopija baze etcd' : 'Disk upravljačke ravnine'} sadrži i privatne ključeve kontrolera Sealed Secrets (Secreti u kube-system): SealedSecreti zapečaćeni ključem ${fresh.join(', ')} sada su čitljivi. Treba obnoviti ključ, a zatim rotirati vrijednosti.`,
        { actorId: a.actorId },
      )
  }
  if (a.actorId === 'pod-creator' && a.success && a.channel === 'mount') {
    const e = eyeSummary(state, a.secretId)
    if (e.red > 0 && e.red === e.honestLimit) achieve(state, 'podCreatorShown', a.secretId)
  }
}

/**
 * Launch an animated attempt of one actor against one secret (default: focused). By default it follows the first
 * path that works, or the first blocked attempt up to the control that stops it; `opts.pathId` (from
 * attemptOptions) or `opts.channel` picks a specific route (falls back to the default when it does not exist).
 * `resolve: 'arrival'` (default): the attempt happens when the token arrives – its outcome is judged then (a theft
 * launched just before KMS v2 was turned on fails), and `success` is preliminary until `decidedAt` is set.
 * `resolve: 'launch'`: snapshot at launch; the event names that time. Returns null for unknown actor/secret.
 */
export function attempt(
  state: AccessState,
  actorId: ActorId,
  secretId: string = state.config.focusSecretId,
  opts: { pathId?: string; channel?: Channel; resolve?: AttemptResolve; strict?: boolean } = {},
): Attempt | null {
  if (!(actorId in ACTORS)) return null
  const s = findSecret(state, secretId)
  if (!s) return null
  const request: AttemptRequest = { pathId: opts.pathId ?? null, channel: opts.channel ?? null, strict: opts.strict ?? false }
  const resolve = opts.resolve ?? 'arrival'
  const o = resolveOutcome(state, actorId, s, request)
  const a: Attempt = {
    id: `a${++state.seq.attempt}`,
    actorId,
    secretId: s.id,
    hopDur: state.config.timing.attemptHop * state.animScale,
    hopIndex: 0,
    hopProgress: 0,
    progress: 0,
    startedAt: state.t,
    doneAt: null,
    resolve,
    decidedAt: null,
    changedOnArrival: false,
    request,
    linger: ATTEMPT_LINGER * state.animScale,
    ...o,
  }
  state.attempts.push(a)
  if (state.attempts.length > MAX_ATTEMPTS) state.attempts.splice(0, state.attempts.length - MAX_ATTEMPTS)
  if (resolve === 'launch') attemptDecided(state, a)
  return a
}

/** The channel a single RBAC permission leads to (null: it does not lead to a value). */
function verbChannel(verb: Verb, resource: Resource): Channel | null {
  if (resource === 'secrets' || resource === 'configmaps') return verb === 'get' ? 'api-get' : verb === 'list' ? 'api-list' : verb === 'watch' ? 'api-watch' : null
  if ((resource === 'pods' || resource === 'deployments') && verb === 'create') return 'mount'
  if ((resource === 'pods' || resource === 'deployments') && (verb === 'get' || verb === 'list' || verb === 'watch')) return 'pod-spec'
  if (resource === 'pods/exec' && verb === 'create') return 'exec'
  if (resource === 'pods/log' && verb === 'get') return 'pod-log'
  return null
}

/**
 * Try one permission („kubectl auth can-i”, then use it): get / list / watch on secrets, create on pods, create on
 * pods/exec, get on pods/log … – for verb buttons in „Tko može pročitati?”. A permission that leads nowhere is a
 * failed attempt, never another route.
 */
export function tryVerb(state: AccessState, actorId: ActorId, verb: Verb, resource: Resource, secretId: string = state.config.focusSecretId): Attempt | null {
  const s = findSecret(state, secretId)
  let channel = verbChannel(verb, resource)
  if (channel === 'mount' && s?.approach === 'image') channel = 'run-image'
  return attempt(state, actorId, secretId, { channel: channel ?? 'memory', strict: true })
}

/** Attempt with every visible actor (e.g. a „Napadni” demo). */
export function attemptAll(state: AccessState, secretId: string = state.config.focusSecretId): Attempt[] {
  return state.config.visibleActors.map((id) => attempt(state, id, secretId)).filter((a): a is Attempt => a !== null)
}

/** „Ukradi kopiju baze etcd” */
export function stealEtcdBackup(state: AccessState, secretId?: string): Attempt | null {
  return attempt(state, 'etcd-backup-thief', secretId)
}

/** „Ukradi disk upravljačke ravnine” */
export function stealControlPlaneDisk(state: AccessState, secretId?: string): Attempt | null {
  return attempt(state, 'cp-disk-thief', secretId)
}

/* ======================================================================
 * Selectors
 * ==================================================================== */

/** Running consumer Pods using a revoked value (logins fail). */
export function authFailingPods(state: AccessState): { podId: string; secretId: string; version: number }[] {
  const out: { podId: string; secretId: string; version: number }[] = []
  for (const p of state.pods) {
    if (p.status !== 'Running') continue
    for (const [id, v] of Object.entries(p.uses)) {
      const s = findSecret(state, id)
      if (s && v !== null && !isUsable(s, v)) out.push({ podId: p.id, secretId: id, version: v })
    }
  }
  return out
}

/** Running consumers not (yet) using the newest value. */
export function staleConsumers(state: AccessState, secretId: string = state.config.focusSecretId): AppPod[] {
  const s = findSecret(state, secretId)
  if (!s) return []
  return runningConsumers(state, s.id).filter((p) => p.uses[s.id] !== s.current)
}

export type RotationPhase = 'idle' | 'waiting-delivery' | 'propagating' | 'done'

export interface RotationStatus {
  phase: RotationPhase
  record: RotationRecord | null
  /** simulated seconds since start (active) or total duration (done); 0 when idle */
  elapsed: number
  /**
   * real-time equivalent of `elapsed` (s, rounded to 0,1): each simulated second weighted by the compression of what
   * the rotation waited for (see RotationRecord.realElapsed). Judge „< 5 min” goals on this, never on `elapsed`.
   */
  realElapsed: number
  /** Croatian badge: „6,7 s (sim) ≈ 1,1 min stvarno” */
  label: string
  /** what it is waiting for now (null when idle or done) */
  waiting: RotationWait | null
  stalePodIds: string[]
  /** Croatian reason it cannot progress right now (null when progressing or done) */
  stalled: string | null
  /** Croatian caveat that does not block it (e.g. sealed with a leaked key) – kept after completion */
  warning: string | null
}

export function rotationStatus(state: AccessState, secretId: string = state.config.focusSecretId): RotationStatus {
  const s = findSecret(state, secretId)
  const r = s?.rotation ?? null
  if (!s || !r) return { phase: 'idle', record: null, elapsed: 0, realElapsed: 0, label: '', waiting: null, stalePodIds: [], stalled: null, warning: null }
  const done = r.completedAt !== null
  const elapsed = Math.round(((done ? (r.completedAt as number) : state.t) - r.startedAt) * 10) / 10
  const realElapsed = Math.round(r.realElapsed * 10) / 10
  return {
    phase: done ? 'done' : r.deliveredAt === null ? 'waiting-delivery' : 'propagating',
    record: r,
    elapsed,
    realElapsed,
    label: `${fmtS(elapsed)} (sim) ≈ ${fmtDuration(realElapsed)} stvarno`,
    waiting: done ? null : rotationWait(state, s.id),
    stalePodIds: staleConsumers(state, s.id).map((p) => p.id),
    stalled: done ? null : r.stalled,
    warning: r.warning,
  }
}

export interface PodSummary {
  total: number
  running: number
  creating: number
  failing: number
  terminating: number
  /** running consumers of the focused secret not on the newest value */
  stale: number
  authFailing: number
}

export function podSummary(state: AccessState): PodSummary {
  const ps = state.pods
  return {
    total: ps.length,
    running: ps.filter((p) => p.status === 'Running').length,
    creating: ps.filter((p) => p.status === 'ContainerCreating' && p.reason === null).length,
    failing: ps.filter((p) => p.status === 'CreateContainerConfigError' || p.reason === 'FailedMount').length,
    terminating: ps.filter((p) => p.status === 'Terminating').length,
    stale: staleConsumers(state).length,
    authFailing: authFailingPods(state).length,
  }
}

export interface EyeSummary {
  red: number
  grey: number
  total: number
  /** red eyes that are honest limits (cannot be closed while the app needs the value) */
  honestLimit: number
  redIds: ActorId[]
}

/** Visible eyes for the secret (default: focused). Share of red = red / total (0 when total is 0). */
export function eyeSummary(state: AccessState, secretId: string = state.config.focusSecretId): EyeSummary {
  const visible = new Set(state.config.visibleActors)
  const vs = evaluateAccess(state, secretId).verdicts.filter((v) => visible.has(v.actorId))
  const red = vs.filter((v) => v.reads)
  return { red: red.length, grey: vs.length - red.length, total: vs.length, honestLimit: red.filter((v) => v.honestLimit).length, redIds: red.map((v) => v.actorId) }
}

/** Subset of the kit's PodShape statuses this engine maps to (no import from the kit: engines stay React-free). */
export type KitPodStatus = 'running' | 'creating' | 'pending' | 'terminating'

export interface PodView {
  id: string
  workloadId: string
  /**
   * PodShape status. A missing Secret is never a crash: CreateContainerConfigError → 'pending' (the container was
   * never created), ContainerCreating with FailedMount → 'creating' – show `label` / `reason` next to the shape.
   */
  kitStatus: KitPodStatus
  /** kubectl STATUS column */
  label: AppPodStatus
  reason: string | null
  message: string | null
  /** status tone (for a badge): stuck / failing logins = bad, starting / stale = warn */
  statusTone: 'ok' | 'warn' | 'bad' | 'idle'
  /**
   * PodShape `tone` (AUTHORING §5: v1 = blue, v2 = violet, broken = rose): the newest value after a rotation = violet,
   * an older value (or no rotation yet) = blue, a revoked value (logins fail) = rose
   */
  versionTone: 'blue' | 'violet' | 'rose'
  /** version of the focused (or given) secret the app uses (null: none / not a consumer) */
  usesVersion: number | null
  /** running but not on the newest value */
  stale: boolean
  /** uses a revoked value – logins fail */
  authFailing: boolean
  /** being replaced by a rollout */
  outdated: boolean
  /** 0..1 container start progress while starting (null otherwise) */
  startProgress: number | null
}

/** Render-ready Pods (stable ids) for PodShape, for the focused secret by default. */
export function podView(state: AccessState, secretId: string = state.config.focusSecretId): PodView[] {
  const s = findSecret(state, secretId)
  const podStart = state.config.timing.podStart
  return state.pods.map((p) => {
    const uses = s && s.id in p.uses ? (p.uses[s.id] ?? null) : null
    const running = p.status === 'Running'
    const failing = p.status === 'CreateContainerConfigError' || p.reason === 'FailedMount'
    const authFailing = running && s !== undefined && uses !== null && !isUsable(s, uses)
    const kitStatus: KitPodStatus =
      p.status === 'Running' ? 'running' : p.status === 'Terminating' ? 'terminating' : p.status === 'CreateContainerConfigError' ? 'pending' : 'creating'
    return {
      id: p.id,
      workloadId: p.workloadId,
      kitStatus,
      label: p.status,
      reason: p.reason,
      message: p.message,
      statusTone: failing || authFailing ? 'bad' : p.status === 'Terminating' ? 'idle' : running ? (s && uses !== null && uses !== s.current ? 'warn' : 'ok') : 'warn',
      versionTone: authFailing ? 'rose' : s && uses !== null && uses === s.current && s.current > 1 ? 'violet' : 'blue',
      usesVersion: uses,
      stale: running && s !== undefined && uses !== null && uses !== s.current,
      authFailing,
      outdated: p.outdated,
      startProgress: p.status === 'ContainerCreating' && p.startAt !== null ? Math.max(0, Math.min(1, 1 - (p.startAt - state.t - state.acc) / podStart)) : null,
    }
  })
}

export interface Ring {
  /** 0..1 of the current interval elapsed */
  progress: number
  /** seconds to the next event (null: never, e.g. refreshInterval 0) */
  nextInS: number | null
  intervalS: number
  label: string
}

export interface Rings {
  /** Argo CD Git poll (gitops delivery only) */
  argo: Ring | null
  /** ExternalSecret refresh per ESO secret, with its status */
  eso: Record<string, Ring & { status: 'Ready' | 'SecretSyncedError' | null }>
  /** CSI rotation poll per CSI secret (null while rotation is off) */
  csi: Record<string, Ring | null>
  /** Sealed Secrets key renewal */
  keyRenewal: Ring & { keys: number }
}

function ring(t: number, last: number, next: number, label: string): Ring {
  const interval = next - last
  if (!Number.isFinite(next)) return { progress: 0, nextInS: null, intervalS: 0, label }
  return { progress: interval > 0 ? Math.max(0, Math.min(1, (t - last) / interval)) : 1, nextInS: Math.max(0, next - t), intervalS: interval, label }
}

/** Countdown rings for the pipeline UI (Argo CD poll, ESO refresh, CSI poll, key renewal) – pure. */
export function rings(state: AccessState): Rings {
  const t = state.t + state.acc
  const cfg = state.config
  const eso: Rings['eso'] = {}
  const csi: Rings['csi'] = {}
  for (const s of state.secrets) {
    if (s.approach === 'eso') eso[s.id] = { ...ring(t, s.lastRefresh, s.nextRefresh, timingLabel(TIMING.esoRefresh, cfg.timing.esoRefresh)), status: s.esoStatus }
    if (s.approach === 'csi') csi[s.id] = cfg.csi.rotation ? ring(t, s.lastCsiPoll, s.nextCsiPoll, timingLabel(TIMING.csiRotationPoll, cfg.timing.csiRotationPoll)) : null
  }
  const period = cfg.timing.sealedKeyRenewal
  return {
    argo: cfg.delivery === 'gitops' ? ring(t, state.lastArgoPoll, state.nextArgoPoll, cfg.argo.webhook ? TIMING.argoWebhook.label : TIMING.argoPoll.label) : null,
    eso,
    csi,
    keyRenewal: { ...ring(t, state.nextKeyRenewal - period, state.nextKeyRenewal, TIMING.sealedKeyRenewal.label), keys: state.sealedKeys.length },
  }
}

/**
 * Periods during which actors could read a still-valid value of the secret (default: focused), sampled once per
 * simulated second; `to` is null while still open. `onlyVisible` (default true) keeps the eyes shown by the UI.
 */
export function exposure(state: AccessState, secretId: string = state.config.focusSecretId, onlyVisible = true): (ExposureWindow & { duration: number })[] {
  const visible = new Set(state.config.visibleActors)
  return state.exposure
    .filter((w) => w.secretId === secretId && (!onlyVisible || visible.has(w.actorId)))
    .map((w) => ({ ...w, versions: [...w.versions], duration: Math.round(((w.to ?? state.t) - w.from) * 10) / 10 }))
}

/**
 * Is the consumption control (env / volume / subPath) meaningful for this Deployment? Locked when every secret it
 * consumes is an image ENV or an env literal (always env vars) – show `reason` next to a disabled Segmented.
 */
export function consumeLocked(state: AccessState, workloadId: string): { locked: boolean; reason: string | null } {
  const w = findWorkload(state, workloadId)
  const secrets = (w?.secretIds ?? []).map((id) => findSecret(state, id)).filter((x): x is SecretRuntime => x !== undefined)
  if (!secrets.length || !secrets.every((x) => APPROACHES[x.approach].envOnly)) return { locked: false, reason: null }
  return { locked: true, reason: 'U slici i u env literalu vrijednost je uvijek varijabla okruženja.' }
}

export interface EncryptionScopeInfo {
  provider: Provider
  scope: EncryptionScope
  /** Croatian: „Šifriraju se samo Secreti”, „Šifriraju se Secreti i ConfigMapovi”, „Šifrira se sve”, „Šifriranje je isključeno” */
  label: string
  /** object kinds this engine stores that the EncryptionConfiguration does not cover (written plaintext) */
  uncoveredKinds: ObjKind[]
}

/** What encryption at rest covers right now – show it next to the toggle (an L16 ConfigMap stays readable with KMS v2). */
export function encryptionScopeInfo(state: AccessState): EncryptionScopeInfo {
  const { provider, scope } = state.config.encryption
  const kinds: ObjKind[] = ['Secret', 'ConfigMap', 'Deployment']
  const uncovered = kinds.filter((k) => effectiveProvider(state, k) === 'identity')
  const label =
    provider === 'identity'
      ? 'Šifriranje je isključeno'
      : scope === 'secrets'
        ? 'Šifriraju se samo Secreti'
        : scope === 'secrets+configmaps'
          ? 'Šifriraju se Secreti i ConfigMapovi'
          : 'Šifrira se sve'
  return { provider, scope, label, uncoveredKinds: uncovered }
}

export interface StoreOutageStatus {
  /** the store is down now */
  active: boolean
  /** start of the current outage (null when the store is up) */
  since: number | null
  /** current outage: store-backed consumer Pods that started on a pre-outage sync / that got stuck */
  podsStarted: number
  podsBlocked: number
  /** „Preživite nedostupan trezor” is done (latched) */
  survived: boolean
  /** Croatian hint for the next step, or null when the goal is done */
  next: string | null
}

/** Progress of „Preživite nedostupan trezor” for a hint next to the goal. */
export function storeOutageStatus(state: AccessState): StoreOutageStatus {
  const o = currentOutage(state)
  const survived = achievedAt(state, 'survivedStoreOutage') !== null
  const storeSecrets = state.secrets.filter((s) => storeBacked(s))
  let next: string | null = null
  if (!survived) {
    if (!storeSecrets.length) next = 'Odaberite pristup s vanjskim trezorom (ESO, CSI driver ili argocd-vault-plugin).'
    else if (!o) next = 'Pritisnite „Trezor nedostupan”, a zatim ponovno pokrenite Podove.'
    else if (o.podsBlocked > 0 && o.podsStarted === 0) next = 'Novi Podovi ne mogu krenuti – odaberite pristup koji zadržava zadnju sinkroniziranu vrijednost (ESO).'
    else if (storeSecrets.every((s) => s.lastSyncedAt === null || s.lastSyncedAt > o.from)) next = 'Vrijednost nikad nije stigla iz trezora – vratite trezor i pričekajte sinkronizaciju.'
    else next = 'Ponovno pokrenite Podove dok je trezor nedostupan.'
  }
  return { active: o !== null, since: o ? o.from : null, podsStarted: o ? o.podsStarted : 0, podsBlocked: o ? o.podsBlocked : 0, survived, next }
}

/** Value of a version (default current) – for the „Dekodiraj” scene. */
export function secretValue(state: AccessState, secretId: string = state.config.focusSecretId, version?: number): string | null {
  const s = findSecret(state, secretId)
  if (!s) return null
  return s.versions.find((v) => v.v === (version ?? s.current))?.value ?? null
}

/** Is this value version readable from Git history (plain / base64 / env literal / ConfigMap, or sealed with a leaked key)? */
export function versionInGit(state: AccessState, secretId: string, version: number): boolean {
  return gitLog(state, secretId).some((c) => c.readable && c.version === version)
}

/** Git log for a secret, newest first, with what a clone reveals. */
export function gitLog(state: AccessState, secretId: string = state.config.focusSecretId) {
  const s = findSecret(state, secretId)
  if (!s) return []
  const compromised = new Set(state.leakedKeyIds)
  return state.commits
    .filter((c) => c.secretId === s.id)
    .map((c) => {
      const plain = READABLE_FORMS.includes(c.form)
      const readable = c.version !== null && (plain || (c.form === 'sealed' && c.keyId !== null && compromised.has(c.keyId)))
      return { ...c, readable, valid: readable && isUsable(s, c.version) }
    })
    .reverse()
}
