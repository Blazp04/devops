/**
 * Minimal cluster model behind Argo CD: live objects, a Deployment/ReplicaSet controller that follows
 * rolling.go (same rules and timings as the validated rollout prototype), kubelet Pod lifecycle with Kubernetes
 * events, a namespace Pod quota, HPA, Jobs (sync hooks) and the two Secret controllers needed in L23
 * (Sealed Secrets, External Secrets Operator). Deliberately independent of E3 – see README „Combining with E3”.
 */
import type {
  ClusterState,
  Commit,
  DeploymentReason,
  DeploymentRT,
  DeploymentSpecView,
  DeploymentStatus,
  ExternalPod,
  ExternalWorkloadStatus,
  FieldValue,
  Fields,
  GitOpsState,
  HealthCode,
  HpaCondition,
  HpaRT,
  ImageInfo,
  LiveChange,
  Kind,
  KubeEvent,
  LiveObject,
  Manifest,
  PodRT,
  PodStatus,
  ReplicaSetRT,
  StationId,
  Writer,
} from './types.ts'
import { API_DEFAULTS, CRASH_BACKOFF, KLOPA, KUBE_EVENT_CAP, LIVE_CHANGE_CAP, MAX_INT32, PATHS, POD_EVENT_CAP, REVISION_HISTORY_LIMIT } from './constants.ts'
import { findCommit } from './git.ts'
import { asReplicas, emit, fenceposts, fieldsEqual, objKey, parseDurationS, parseImage, plural, safeRandom, templateHash, templateOf } from './util.ts'

export function createClusterState(): ClusterState {
  return {
    objects: {},
    deployments: {},
    replicaSets: [],
    pods: [],
    hpas: {},
    jobs: {},
    imageCache: [],
    hpaDemand: 0,
    databaseDown: false,
    unsealAt: {},
    esoNextRefreshAt: {},
    secretChangedAt: {},
    replicaWrites: [],
    controllerStatus: {},
    sealedResyncAt: {},
    external: {},
    kubeEvents: [],
    liveChanges: [],
    deletedBy: {},
  }
}

/** Per-object controller status for SealedSecret / ExternalSecret (shown as Argo CD health). */
function ctrlStatus(c: ClusterState) {
  return c.controllerStatus
}

export const CLUSTER_SCOPED: Kind[] = ['ClusterRoleBinding']

/**
 * Kinds with an Argo CD health check: gitops-engine Go checks (Deployment, StatefulSet, Service, HPA, Job, PVC) and the
 * bundled Lua checks (SealedSecret, ExternalSecret, Gateway API HTTPRoute/Gateway). ConfigMap, Secret and RBAC have none.
 */
const HEALTH_CHECKED: Kind[] = ['Deployment', 'Service', 'HorizontalPodAutoscaler', 'Job', 'SealedSecret', 'ExternalSecret', 'HTTPRoute', 'Gateway', 'StatefulSet', 'PersistentVolumeClaim']
export const hasHealthCheck = (kind: Kind) => HEALTH_CHECKED.includes(kind)

// ─── Registry ────────────────────────────────────────────────────────────────

export function registryKey(repo: string, tag: string) {
  return `${repo}:${tag}`
}

/** Look an image up the way the kubelet does: by digest if given (tag ignored), else by tag. null = cannot be pulled. */
export function imageInfo(state: GitOpsState, ref: string): ImageInfo | null {
  const { repo, tag, digest } = parseImage(ref)
  if (digest) {
    for (const [k, info] of Object.entries(state.registry)) if (k.startsWith(`${repo}:`) && info.digest === digest) return info
    return null
  }
  return state.registry[registryKey(repo, tag)] ?? null
}

// ─── Validation (API server dry-run) ─────────────────────────────────────────

/** Kubernetes `validation.IsValidPercent` message (apimachinery RegexError). */
const PERCENT_ERROR = "a valid percent string must be a numeric string followed by an ending '%' (e.g. '1%',  or '93%', regex used for validation is '[0-9]+%')"

/** Go `%v` of an IntOrString in a field.Invalid message: strings quoted, numbers bare. */
const shown = (v: FieldValue) => (typeof v === 'string' ? `"${v}"` : String(v))

/** apps/v1 validation of one rollingUpdate value (ValidatePositiveIntOrPercent + IsNotMoreThan100Percent for maxUnavailable). */
function intOrPercentProblem(v: FieldValue | undefined, field: string, maxUnavailable: boolean): string | null {
  if (v === undefined) return null
  if (typeof v === 'boolean') return `${field}: Invalid value: "${String(v)}": ${field} in body must be of type int-or-string: "boolean"`
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) return `${field}: Invalid value: "${v}": ${field} in body must be of type int-or-string: "number"`
    if (v < 0) return `${field}: Invalid value: ${v}: must be greater than or equal to 0`
    return null
  }
  if (!/^[0-9]+%$/.test(v)) return `${field}: Invalid value: "${v}": ${PERCENT_ERROR}`
  if (maxUnavailable && Number(v.slice(0, -1)) > 100) return `${field}: Invalid value: "${v}": must not be greater than 100%`
  return null
}

const isZeroIntOrPercent = (v: FieldValue | undefined) => v === 0 || (typeof v === 'string' && /^0+%$/.test(v))

/** Schema validation the API server would do on `kubectl apply --dry-run=server`. Returns an error or null. */
export function validateManifest(m: Manifest): string | null {
  if (m.kind === 'Deployment' || m.kind === 'StatefulSet') {
    const group = m.kind === 'Deployment' ? 'Deployment.apps' : 'StatefulSet.apps'
    const r = m.fields[PATHS.replicas]
    if (typeof r === 'number' && Number.isInteger(r) && r < 0) return `${group} "${m.name}" is invalid: spec.replicas: Invalid value: ${r}: must be greater than or equal to 0`
    if (r !== undefined && asReplicas(r) === null) {
      return `${group} "${m.name}" is invalid: spec.replicas: Invalid value: "${String(r)}": spec.replicas in body must be of type integer: "${typeof r}"`
    }
    if (typeof r === 'number' && r > MAX_INT32) return `${group} "${m.name}" is invalid: spec.replicas: Invalid value: ${r}: must be less than or equal to 2147483647`
    const img = m.fields[PATHS.image]
    if (typeof img !== 'string' || img.trim() === '') return `${group} "${m.name}" is invalid: spec.template.spec.containers[0].image: Required value`
    if (m.kind === 'Deployment') {
      const surge = m.fields[PATHS.maxSurge]
      const unav = m.fields[PATHS.maxUnavailable]
      const p = intOrPercentProblem(surge, 'spec.strategy.rollingUpdate.maxSurge', false) ?? intOrPercentProblem(unav, 'spec.strategy.rollingUpdate.maxUnavailable', true)
      if (p) return `${group} "${m.name}" is invalid: ${p}`
      // validation.go ValidateRollingUpdateDeployment: both may not be 0 (a fence post would make no progress)
      if (isZeroIntOrPercent(surge) && isZeroIntOrPercent(unav)) {
        return `${group} "${m.name}" is invalid: spec.strategy.rollingUpdate.maxUnavailable: Invalid value: ${shown(unav as FieldValue)}: may not be 0 when \`maxSurge\` is 0`
      }
    }
  }
  if (m.kind === 'Secret') {
    // a SOPS file applied without decryption (Argo CD has no native SOPS support): ENC[…] is not base64
    for (const [p, v] of Object.entries(m.fields)) {
      if (p.startsWith('/data/') && typeof v === 'string' && v.startsWith('ENC[')) {
        return `Secret "${m.name}" is invalid: data[${p.slice(6)}]: Invalid value: "ENC[…]": illegal base64 data at input byte 3`
      }
    }
  }
  if (m.kind === 'HorizontalPodAutoscaler') {
    const min = asReplicas(m.fields[PATHS.hpaMin] ?? 1)
    const max = asReplicas(m.fields[PATHS.hpaMax])
    if (min === null || max === null || max < Math.max(1, min)) return `HorizontalPodAutoscaler "${m.name}" is invalid: spec.maxReplicas must be >= minReplicas`
  }
  return null
}

// ─── Object writes ───────────────────────────────────────────────────────────

function withDefaults(kind: Kind, fields: Fields): Fields {
  const out: Fields = { ...fields }
  const d = API_DEFAULTS[kind]
  if (d) for (const [k, v] of Object.entries(d)) if (out[k] === undefined) out[k] = v
  return out
}

function specChanged(a: Fields, b: Fields): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) if (k.startsWith('/spec/') && a[k] !== b[k]) return true
  return false
}

function templateChanged(a: Fields, b: Fields): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) if (k.startsWith('/spec/template/') && a[k] !== b[k]) return true
  return false
}

function pushLiveChange(state: GitOpsState, o: LiveObject, path: string, before: FieldValue | undefined, after: FieldValue | undefined, by: Writer) {
  const feed = state.cluster.liveChanges
  feed.push({ t: state.t, key: o.key, kind: o.kind, name: o.name, path, ...(before !== undefined ? { before } : {}), ...(after !== undefined ? { after } : {}), by })
  if (feed.length > LIVE_CHANGE_CAP) feed.splice(0, feed.length - LIVE_CHANGE_CAP)
}

/** Record who wrote which field; returns the previous writers of the changed fields. */
function trackWrites(state: GitOpsState, o: LiveObject, before: Fields, after: Fields, by: Writer): Writer[] {
  const overwritten: Writer[] = []
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[k] === after[k]) continue
    const prev = o.writers[k]
    if (prev) overwritten.push(prev)
    if (after[k] === undefined) delete o.writers[k]
    else o.writers[k] = by
    pushLiveChange(state, o, k, before[k], after[k], by)
  }
  o.lastWriter = by
  return overwritten
}

/**
 * Track spec.replicas writes of the main Deployment. Argo CD overwriting a value the HPA set is a fight – except the
 * one-time drop to the API default when spec.replicas is removed from Git (`drop`), which is not a fight over the value.
 */
function recordReplicaWrite(state: GitOpsState, obj: LiveObject, from: FieldValue | undefined, to: FieldValue | undefined, by: Writer, drop = false) {
  if (obj.kind !== 'Deployment' || from === to || typeof from !== 'number' || typeof to !== 'number') return
  if (obj.name !== state.mainDeployment) return
  const writes = state.cluster.replicaWrites
  const prev = writes.length ? writes[writes.length - 1] : null
  writes.push({ t: state.t, by, from, to })
  if (writes.length > 50) writes.splice(0, writes.length - 50)
  if (by === 'argocd' && prev && prev.by === 'hpa' && !drop) {
    state.stats.replicaFights++
    state.stats.lastFightAt = state.t
    emit(state, 'hpa', `Borba: Argo CD vraća spec.replicas ${from} → ${to} iz Gita, a HPA je upravo postavio ${from}.`, 'bad')
  }
}

export interface ApplyOptions {
  by: Writer
  /** RespectIgnoreDifferences: for these paths keep the live value instead of Git's */
  keepLive?: (path: string) => boolean
  managed?: boolean
  /** Git revision being applied (Argo CD) – a Pod-template change stamps this commit's rollout stations */
  revision?: string
}

export interface ApplyResult {
  created: boolean
  changed: boolean
  /** previous writers of the fields this apply changed (or the deleter of a recreated object) */
  overwritten: Writer[]
}

function newLiveObject(state: GitOpsState, m: Manifest, fields: Fields, by: Writer, managed: boolean, lastApplied: Fields | null): LiveObject {
  const writers: Record<string, Writer> = {}
  for (const k of Object.keys(fields)) writers[k] = by
  return {
    key: objKey(m.kind, m.name),
    kind: m.kind,
    name: m.name,
    namespace: m.namespace,
    fields,
    lastApplied,
    managed,
    generation: 1,
    createdAt: state.t,
    createdBy: by,
    ownerKey: null,
    wave: m.wave ?? 0,
    hook: m.hook,
    writers,
    lastWriter: by,
  }
}

/**
 * Client-side apply (what Argo CD does by default): set every field from the manifest, remove fields that
 * were in the previous last-applied configuration but are no longer in the manifest (→ API default, e.g. replicas 1).
 */
export function applyManifest(state: GitOpsState, m: Manifest, opts: ApplyOptions): ApplyResult {
  const key = objKey(m.kind, m.name)
  const live = state.cluster.objects[key]
  if (!live) {
    const fields = withDefaults(m.kind, m.fields)
    const o = newLiveObject(state, m, fields, opts.by, opts.managed ?? opts.by === 'argocd', opts.by === 'argocd' ? { ...m.fields } : null)
    state.cluster.objects[key] = o
    const deleter = state.cluster.deletedBy[key]
    delete state.cluster.deletedBy[key]
    pushLiveChange(state, o, '', undefined, undefined, opts.by)
    if (o.kind === 'Deployment') setRolloutRevision(state, o.name, opts.revision ?? null)
    onCreated(state, o)
    return { created: true, changed: true, overwritten: deleter ? [deleter] : [] }
  }
  const desired: Fields = { ...m.fields }
  if (opts.keepLive) {
    for (const p of Object.keys(desired)) if (opts.keepLive(p)) delete desired[p]
    for (const p of Object.keys(live.fields)) if (opts.keepLive(p)) desired[p] = live.fields[p]
  }
  const next: Fields = { ...live.fields }
  for (const [p, v] of Object.entries(desired)) next[p] = v
  const prevApplied = live.lastApplied
  for (const p of Object.keys(prevApplied ?? {})) if (!(p in desired)) delete next[p]
  const finalFields = withDefaults(m.kind, next)
  const before = live.fields
  const changed = !fieldsEqual(before, finalFields)
  if (opts.by === 'argocd') live.lastApplied = desired
  live.managed = live.managed || (opts.managed ?? opts.by === 'argocd')
  live.wave = m.wave ?? 0
  let overwritten: Writer[] = []
  if (changed) {
    live.fields = finalFields
    overwritten = trackWrites(state, live, before, finalFields, opts.by)
    if (specChanged(before, finalFields)) live.generation++
    if (live.kind === 'Deployment' && templateChanged(before, finalFields)) setRolloutRevision(state, live.name, opts.revision ?? null)
    // spec.replicas was in the last-applied configuration but is no longer in the manifest → removed → API default 1
    const dropped = live.kind === 'Deployment' && !(PATHS.replicas in desired) && PATHS.replicas in (prevApplied ?? {}) && before[PATHS.replicas] !== finalFields[PATHS.replicas]
    recordReplicaWrite(state, live, before[PATHS.replicas], finalFields[PATHS.replicas], opts.by, dropped)
    if (dropped) {
      state.stats.replicaDrops++
      const from = before[PATHS.replicas]
      const to = finalFields[PATHS.replicas]
      emit(state, 'hpa', `spec.replicas uklonjen iz Gita → vrijedi zadano ${String(to)}: Deployment ${live.name} pada s ${String(from)} na ${plural(Number(to), ['Pod', 'Poda', 'Podova'])} (jednokratno, dok HPA ne reagira). Postupak migracije to sprječava.`, 'bad')
    }
    onChanged(state, live, before)
  }
  return { created: false, changed, overwritten }
}

/** Imperative change of a single field (kubectl edit / scale, HPA). Does not touch last-applied. */
export function writeField(state: GitOpsState, key: string, path: string, value: FieldValue | null, by: Writer): boolean {
  const live = state.cluster.objects[key]
  if (!live) return false
  const before = live.fields
  const next: Fields = { ...before }
  if (value === null) delete next[path]
  else next[path] = value
  const finalFields = withDefaults(live.kind, next)
  if (fieldsEqual(before, finalFields)) return false
  live.fields = finalFields
  trackWrites(state, live, before, finalFields, by)
  if (specChanged(before, finalFields)) live.generation++
  if (live.kind === 'Deployment' && templateChanged(before, finalFields)) setRolloutRevision(state, live.name, null)
  recordReplicaWrite(state, live, before[PATHS.replicas], finalFields[PATHS.replicas], by)
  onChanged(state, live, before)
  return true
}

/** Delete an object; cascades to owned objects (ReplicaSets/Pods of a Deployment, Secret of a SealedSecret…). */
export function deleteObject(state: GitOpsState, key: string, by: Writer = 'controller'): boolean {
  const c = state.cluster
  const live = c.objects[key]
  if (!live) return false
  delete c.objects[key]
  c.deletedBy[key] = by
  pushLiveChange(state, live, '', undefined, undefined, by)
  if (live.kind === 'Deployment') {
    for (const rs of c.replicaSets.filter((r) => r.deployment === live.name)) terminatePods(state, (p) => p.owner === rs.name)
    c.replicaSets = c.replicaSets.filter((r) => r.deployment !== live.name)
    delete c.deployments[live.name]
  }
  if (live.kind === 'HorizontalPodAutoscaler') delete c.hpas[live.name]
  if (live.kind === 'Job') {
    terminatePods(state, (p) => p.owner === live.name && p.ownerKind === 'Job')
    delete c.jobs[key]
  }
  if (live.kind === 'Secret') c.secretChangedAt[live.name] = state.t
  delete c.unsealAt[key]
  delete c.esoNextRefreshAt[key]
  delete c.sealedResyncAt[key]
  delete ctrlStatus(c)[key]
  for (const o of Object.values(c.objects)) if (o.ownerKey === key) deleteObject(state, o.key, 'controller')
  return true
}

function onCreated(state: GitOpsState, o: LiveObject) {
  const c = state.cluster
  if (o.kind === 'SealedSecret') c.unsealAt[o.key] = state.t + state.cfg.unsealS
  if (o.kind === 'ExternalSecret') c.esoNextRefreshAt[o.key] = state.t + 1
  if (o.kind === 'Secret') c.secretChangedAt[o.name] = state.t
  // the HPA controller's queue adds every HPA with the resync delay, so a new HPA is first evaluated one period later
  if (o.kind === 'HorizontalPodAutoscaler') c.hpas[o.name] = { name: o.name, nextEvalAt: state.t + state.cfg.hpaPeriodS, recommendations: [], lastDesired: null, external: false, scalingDisabled: false, conditions: [] }
  if (o.kind === 'Job') startJob(state, o)
}

function onChanged(state: GitOpsState, o: LiveObject, before: Fields) {
  const c = state.cluster
  if (o.kind === 'SealedSecret') c.unsealAt[o.key] = state.t + state.cfg.unsealS
  if (o.kind === 'ExternalSecret') c.esoNextRefreshAt[o.key] = state.t + 1
  if (o.kind === 'Secret') {
    const changedData = Object.keys({ ...before, ...o.fields }).some((k) => k.startsWith('/data/') && before[k] !== o.fields[k])
    if (changedData) c.secretChangedAt[o.name] = state.t
  }
}

/**
 * Secret upsert by an in-cluster controller (owned, not tracked by Argo CD). `adopt: false` (Sealed Secrets) refuses a
 * Secret it does not own; ESO adopts it. Returns 'created' | 'updated' | 'same' | 'refused'.
 */
function upsertOwnedSecret(state: GitOpsState, name: string, namespace: string, data: Record<string, string>, ownerKey: string, adopt: boolean): 'created' | 'updated' | 'same' | 'refused' {
  const key = objKey('Secret', name)
  const fields: Fields = {}
  for (const [k, v] of Object.entries(data)) fields[`/data/${k}`] = v
  const live = state.cluster.objects[key]
  if (!live) {
    const o = newLiveObject(state, { kind: 'Secret', name, namespace, fields }, fields, 'controller', false, null)
    o.ownerKey = ownerKey
    state.cluster.objects[key] = o
    delete state.cluster.deletedBy[key]
    pushLiveChange(state, o, '', undefined, undefined, 'controller')
    state.cluster.secretChangedAt[name] = state.t
    return 'created'
  }
  if (live.ownerKey !== ownerKey && !adopt) return 'refused'
  live.ownerKey = ownerKey
  if (fieldsEqual(live.fields, fields)) return 'same'
  const before = live.fields
  live.fields = fields
  trackWrites(state, live, before, fields, 'controller')
  state.cluster.secretChangedAt[name] = state.t
  return 'updated'
}

export function secretData(state: GitOpsState, name: string): Record<string, string> | null {
  const live = state.cluster.objects[objKey('Secret', name)]
  if (!live) return null
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(live.fields)) if (k.startsWith('/data/')) out[k.slice(6)] = String(v)
  return out
}

// ─── Kubernetes events ───────────────────────────────────────────────────────

/** Record a Kubernetes event (merged with an identical previous one, like the API server's event series). */
export function kubeEvent(state: GitOpsState, object: string, type: KubeEvent['type'], reason: string, message: string, source: string, pod?: PodRT): void {
  const push = (list: KubeEvent[], cap: number) => {
    const same = list.find((e) => e.object === object && e.reason === reason && e.message === message)
    if (same) {
      same.count++
      same.t = state.t
      return
    }
    list.push({ t: state.t, firstT: state.t, type, reason, object, source, message, count: 1 })
    if (list.length > cap) list.splice(0, list.length - cap)
  }
  push(state.cluster.kubeEvents, KUBE_EVENT_CAP)
  if (pod) push(pod.events, POD_EVENT_CAP)
}

const podRef = (p: PodRT) => `pod/${p.id}`
const NODES = ['cvor-1', 'cvor-2', 'cvor-3'] as const

// ─── Health (Argo CD built-in checks) ────────────────────────────────────────

export interface HealthResult {
  status: HealthCode | null
  message: string
}

/** Health of a live object as Argo CD computes it; null = kind has no health check (ConfigMap, Secret…). */
export function objectHealth(state: GitOpsState, key: string): HealthResult {
  const o = state.cluster.objects[key]
  if (!o) return { status: 'Missing', message: '' }
  switch (o.kind) {
    case 'Deployment':
      return deploymentHealth(state, o)
    case 'HorizontalPodAutoscaler':
      return hpaHealth(state.cluster.hpas[o.name]?.conditions ?? [])
    case 'Service':
    case 'Gateway':
    case 'PersistentVolumeClaim':
      return { status: 'Healthy', message: '' }
    case 'StatefulSet':
      // E6 keeps the object only (E3 simulates its Pods): reported as rolled out
      return { status: 'Healthy', message: 'partitioned roll out complete' }
    case 'HTTPRoute': {
      // bundled Lua check: ResolvedRefs=False (backend Service missing) → Degraded
      for (let i = 0; i < 8; i++) {
        const svc = o.fields[PATHS.routeBackend(i)]
        if (typeof svc === 'string' && !state.cluster.objects[objKey('Service', svc)]) {
          return { status: 'Degraded', message: `Parent ${String(o.fields[PATHS.routeParent] ?? '')}: Service "${svc}" not found` }
        }
      }
      return { status: 'Healthy', message: 'HTTPRoute is healthy' }
    }
    case 'Job': {
      const j = state.cluster.jobs[key]
      if (!j || j.status === 'Running') return { status: 'Progressing', message: 'job is running' }
      return j.status === 'Complete' ? { status: 'Healthy', message: 'job completed' } : { status: 'Degraded', message: 'Job has reached the specified backoff limit' }
    }
    case 'SealedSecret':
    case 'ExternalSecret': {
      const s = ctrlStatus(state.cluster)[key]
      if (!s) return { status: 'Progressing', message: 'waiting for controller' }
      return s.ok ? { status: 'Healthy', message: s.message } : { status: 'Degraded', message: s.message }
    }
    default:
      return { status: null, message: '' }
  }
}

/** HPA conditions Argo CD treats as Degraded (gitops-engine health_hpa.go isDegraded). */
const HPA_DEGRADED: [HpaCondition['type'], string][] = [
  ['AbleToScale', 'FailedGetScale'],
  ['AbleToScale', 'FailedUpdateScale'],
  ['ScalingActive', 'FailedGetResourceMetric'],
  ['ScalingActive', 'FailedGetObjectMetric'],
  ['ScalingActive', 'FailedGetPodsMetric'],
  ['ScalingActive', 'FailedGetExternalMetric'],
  ['ScalingActive', 'FailedComputeMetricsReplicas'],
  ['ScalingActive', 'InvalidSelector'],
]

/**
 * gitops-engine health_hpa.go checkConditions: any degraded condition → Degraded; else the first True AbleToScale or
 * ScalingLimited → Healthy (its message); no conditions yet → Progressing „Waiting to Autoscale”.
 */
export function hpaHealth(conditions: HpaCondition[]): HealthResult {
  for (const c of conditions) if (HPA_DEGRADED.some(([t, r]) => c.type === t && c.reason === r)) return { status: 'Degraded', message: c.message }
  for (const c of conditions) if ((c.type === 'AbleToScale' || c.type === 'ScalingLimited') && c.status === 'True') return { status: 'Healthy', message: c.message }
  return { status: 'Progressing', message: 'Waiting to Autoscale' }
}

/** gitops-engine health_deployment.go */
export function deploymentHealth(state: GitOpsState, o: LiveObject): HealthResult {
  const rt = state.cluster.deployments[o.name]
  const replicas = asReplicas(o.fields[PATHS.replicas]) ?? 1
  if (o.fields[PATHS.paused] === true) return { status: 'Suspended', message: 'Deployment is paused' }
  if (!rt || rt.observedGeneration < o.generation) return { status: 'Progressing', message: 'Waiting for rollout to finish: observed deployment generation less than desired generation' }
  const s = rt.status
  if (rt.reason === 'ProgressDeadlineExceeded') return { status: 'Degraded', message: `Deployment "${o.name}" exceeded its progress deadline` }
  if (s.updatedReplicas < replicas) return { status: 'Progressing', message: `Waiting for rollout to finish: ${s.updatedReplicas} out of ${replicas} new replicas have been updated...` }
  if (s.replicas > s.updatedReplicas) return { status: 'Progressing', message: `Waiting for rollout to finish: ${s.replicas - s.updatedReplicas} old replicas are pending termination...` }
  if (s.availableReplicas < s.updatedReplicas) return { status: 'Progressing', message: `Waiting for rollout to finish: ${s.availableReplicas} of ${s.updatedReplicas} updated replicas are available...` }
  return { status: 'Healthy', message: '' }
}

// ─── Commit stations (L24 „Put jednog commita”) ──────────────────────────────

/** Stamp a station of a commit once (first time wins). */
export function stamp(state: GitOpsState, sha: string | null, station: StationId): void {
  if (!sha) return
  const c: Commit | undefined = findCommit(state.repo, sha)
  if (c && c.stations[station] === undefined) c.stations[station] = state.t
}

function setRolloutRevision(state: GitOpsState, name: string, revision: string | null) {
  const rt = state.cluster.deployments[name]
  if (rt) rt.rolloutRevision = revision
  else deploymentRT(state, name).rolloutRevision = revision
}

// ─── Controllers ─────────────────────────────────────────────────────────────

const active = (p: PodRT) => p.status !== 'Terminating'
const isAvailable = (p: PodRT) => p.ready && p.status === 'Ready'

function podsOf(state: GitOpsState, rsName: string): PodRT[] {
  return state.cluster.pods.filter((p) => p.owner === rsName && p.ownerKind === 'ReplicaSet' && active(p))
}

function availableOf(state: GitOpsState, rsName: string): number {
  return podsOf(state, rsName).filter(isAvailable).length
}

function terminatePods(state: GitOpsState, pred: (p: PodRT) => boolean) {
  for (const p of state.cluster.pods) {
    if (pred(p) && p.status !== 'Terminating') {
      p.status = 'Terminating'
      p.ready = false
      p.readySince = null
      p.since = state.t
      p.goneAt = state.t + state.cfg.pod.terminationS
      kubeEvent(state, podRef(p), 'Normal', 'Killing', `Stopping container ${containerName(p)}`, 'kubelet', p)
    }
  }
}

function containerName(p: PodRT): string {
  return p.deployment ?? p.owner
}

function deploymentRT(state: GitOpsState, name: string): DeploymentRT {
  let rt = state.cluster.deployments[name]
  if (!rt) {
    rt = {
      name,
      observedGeneration: 0,
      reason: 'NewReplicaSetCreated',
      lastProgressAt: state.t,
      status: { replicas: 0, updatedReplicas: 0, readyReplicas: 0, availableReplicas: 0, terminatingReplicas: 0 },
      revisionCounter: 0,
      rolloutRevision: null,
      externalPods: [],
      externalObservedHash: null,
    }
    state.cluster.deployments[name] = rt
  }
  return rt
}

function markProgress(state: GitOpsState, rt: DeploymentRT, reason: DeploymentReason) {
  rt.lastProgressAt = state.t
  rt.reason = reason
}

/** scaleReplicaSetAndRecordEvent: resize (no-op when equal) and stamp the desired/max-replicas annotations. */
function scaleRs(state: GitOpsState, d: LiveObject, rs: ReplicaSetRT, to: number, n: number, surge: number) {
  if (rs.replicas === to) return
  setReplicasAnnotations(rs, n, surge)
  const from = rs.replicas
  rs.replicas = to
  kubeEvent(state, `deployment/${d.name}`, 'Normal', 'ScalingReplicaSet', `Scaled ${to > from ? 'up' : 'down'} replica set ${rs.name} from ${from} to ${to}`, 'deployment-controller')
}

function setReplicasAnnotations(rs: ReplicaSetRT, n: number, surge: number) {
  rs.desiredAnno = n
  rs.maxAnno = n + surge
}

/** deployment_util.go getReplicaSetFraction: this ReplicaSet's share of the new maximum size, minus its size now. */
function replicaSetFraction(rs: ReplicaSetRT, n: number, surge: number, statusReplicas: number): number {
  if (n === 0) return -rs.replicas
  const before = rs.maxAnno !== null && rs.maxAnno > 0 ? rs.maxAnno : statusReplicas
  if (before === 0) return 0
  // integer.RoundToInt32 = math.Round (half away from zero); sizes are positive here, so Math.round agrees
  return Math.round((rs.replicas * (n + surge)) / before) - rs.replicas
}

/**
 * sync.go `scale()`: runs on a scaling event (an active ReplicaSet's desired-replicas annotation ≠ spec.replicas) and
 * while paused. One active ReplicaSet → it gets spec.replicas; a saturated new ReplicaSet → old ones go to 0; otherwise
 * the difference to spec.replicas + maxSurge is spread over the active ReplicaSets in proportion to their size
 * („proportional scaling”, so scaling a stalled rollout does not pile the extra Pods onto the broken version).
 */
function scaleDeploymentProportionally(state: GitOpsState, d: LiveObject, newRS: ReplicaSetRT | undefined, olds: ReplicaSetRT[], n: number, surge: number) {
  const rt = deploymentRT(state, d.name)
  const activeRs = [...olds, ...(newRS ? [newRS] : [])].filter((r) => r.replicas > 0)
  // FindActiveOrLatest: exactly one active ReplicaSet, or none → the newest one
  const sole = activeRs.length === 1 ? activeRs[0] : activeRs.length === 0 ? (newRS ?? [...olds].sort((a, b) => b.createdAt - a.createdAt)[0]) : undefined
  if (sole) {
    // (Kubernetes leaves the annotations alone when the size already matches; refreshing them here avoids a scaling event that never ends)
    if (sole.replicas === n) setReplicasAnnotations(sole, n, surge)
    else scaleRs(state, d, sole, n, n, surge)
    return
  }
  if (newRS && newRS.replicas === n && newRS.desiredAnno === n && availableOf(state, newRS.name) === n) {
    // IsSaturated: the new ReplicaSet is complete – old ReplicaSets are scaled down fully
    for (const rs of olds) if (rs.replicas > 0) scaleRs(state, d, rs, 0, n, surge)
    return
  }
  const total = activeRs.reduce((s, r) => s + r.replicas, 0)
  const allowed = n > 0 ? n + surge : 0
  const toAdd = allowed - total
  // up: larger first, newer first on a tie (ReplicaSetsBySizeNewer); down: larger first, older first (BySizeOlder)
  const sorted = [...activeRs].sort((a, b) => b.replicas - a.replicas || (toAdd > 0 ? b.createdAt - a.createdAt : a.createdAt - b.createdAt))
  const sizes = new Map<ReplicaSetRT, number>()
  let added = 0
  for (const rs of sorted) {
    if (toAdd === 0 || toAdd === added) {
      sizes.set(rs, rs.replicas)
      continue
    }
    const fraction = replicaSetFraction(rs, n, surge, rt.status.replicas)
    const left = toAdd - added
    const proportion = toAdd > 0 ? Math.min(fraction, left) : Math.max(fraction, left)
    sizes.set(rs, rs.replicas + proportion)
    added += proportion
  }
  sorted.forEach((rs, i) => {
    let size = sizes.get(rs) ?? rs.replicas
    // leftovers (rounding) go to the largest ReplicaSet
    if (i === 0 && toAdd !== 0) size = Math.max(0, size + toAdd - added)
    // scaleReplicaSet: the annotations are refreshed on every active ReplicaSet, which ends the scaling event
    setReplicasAnnotations(rs, n, surge)
    scaleRs(state, d, rs, size, n, surge)
  })
}

/**
 * One Deployment-controller reconcile (deployment_controller.go syncDeployment): paused or a scaling event → `sync()`
 * (proportional scaling only); otherwise rolling.go: scale up the new ReplicaSet OR scale down old ones.
 */
function reconcileDeployment(state: GitOpsState, d: LiveObject) {
  const c = state.cluster
  const rt = deploymentRT(state, d.name)
  const n = asReplicas(d.fields[PATHS.replicas]) ?? 1
  const hash = templateHash(d.fields)
  const rss = c.replicaSets.filter((r) => r.deployment === d.name)
  let newRS = rss.find((r) => r.hash === hash)
  const maxRev = rss.reduce((m, r) => Math.max(m, r.revision), 0)
  const { surge, unavailable } = fenceposts(d.fields[PATHS.maxSurge], d.fields[PATHS.maxUnavailable], n)
  const scalingEvent = rss.some((r) => r.replicas > 0 && r.desiredAnno !== null && r.desiredAnno !== n)
  if (d.fields[PATHS.paused] === true || scalingEvent) {
    // paused: template changes do not roll out, but scaling does (proportionally)
    scaleDeploymentProportionally(state, d, newRS, rss.filter((r) => r !== newRS), n, surge)
    rt.observedGeneration = d.generation
    return
  }
  if (!newRS) {
    const image = String(d.fields[PATHS.image] ?? '')
    newRS = {
      name: `${d.name}-${hash}`,
      deployment: d.name,
      hash,
      template: templateOf(d.fields),
      image,
      tag: parseImage(image).tag,
      revision: ++rt.revisionCounter,
      replicas: 0,
      createdAt: state.t,
      warm: c.imageCache.includes(image),
      revisionSha: rt.rolloutRevision,
      // SetNewReplicaSetAnnotations: a new ReplicaSet starts with the current desired/max replicas
      desiredAnno: n,
      maxAnno: n + surge,
    }
    c.replicaSets.push(newRS)
    stamp(state, rt.rolloutRevision, 'rsCreated')
    markProgress(state, rt, 'NewReplicaSetCreated')
  } else if (newRS.revision < maxRev) {
    // rolling back to an existing template: Kubernetes reuses that ReplicaSet and gives it the newest revision
    newRS.revision = ++rt.revisionCounter
    newRS.revisionSha = rt.rolloutRevision
    stamp(state, rt.rolloutRevision, 'rsCreated')
    markProgress(state, rt, 'ReplicaSetUpdated')
  }
  const olds = c.replicaSets.filter((r) => r.deployment === d.name && r !== newRS).sort((a, b) => a.createdAt - b.createdAt)
  const oldTotal = olds.reduce((s, r) => s + r.replicas, 0)
  if (oldTotal === 0) {
    if (newRS.replicas !== n) {
      scaleRs(state, d, newRS, n, n, surge)
      markProgress(state, rt, 'ReplicaSetUpdated')
    }
  } else {
    const all = newRS.replicas + oldTotal
    let scaled = false
    if (newRS.replicas < n) {
      const maxTotal = n + surge
      if (all < maxTotal) {
        scaleRs(state, d, newRS, newRS.replicas + Math.min(maxTotal - all, n - newRS.replicas), n, surge)
        scaled = true
        markProgress(state, rt, 'ReplicaSetUpdated')
      }
    } else if (newRS.replicas > n) {
      scaleRs(state, d, newRS, n, n, surge)
      scaled = true
    }
    if (!scaled) {
      const minAvailable = n - unavailable
      const newUnavailable = newRS.replicas - availableOf(state, newRS.name)
      const maxScaledDown = all - minAvailable - newUnavailable
      if (maxScaledDown > 0) {
        let cleaned = 0
        for (const rs of olds) {
          if (cleaned >= maxScaledDown) break
          const unhealthy = rs.replicas - availableOf(state, rs.name)
          if (unhealthy <= 0) continue
          const down = Math.min(maxScaledDown - cleaned, unhealthy)
          scaleRs(state, d, rs, rs.replicas - down, n, surge)
          cleaned += down
        }
        const avail = availableOf(state, newRS.name) + olds.reduce((s, r) => s + Math.min(r.replicas, availableOf(state, r.name)), 0)
        if (avail > minAvailable) {
          const total = avail - minAvailable
          let done = 0
          for (const rs of olds) {
            if (done >= total) break
            if (rs.replicas === 0) continue
            const down = Math.min(rs.replicas, total - done)
            scaleRs(state, d, rs, rs.replicas - down, n, surge)
            done += down
          }
        }
      }
    }
  }
  rt.observedGeneration = d.generation
}

const STATUS_RANK: Record<PodStatus, number> = {
  Pending: 0,
  ContainerCreating: 1,
  ImagePullBackOff: 1,
  CreateContainerConfigError: 1,
  CrashLoopBackOff: 2,
  Running: 2,
  Error: 2,
  Ready: 3,
  Completed: 3,
  Terminating: 9,
}

/** Pods counted by the namespace quota: not terminating, not finished (Succeeded/Failed phase). */
function quotaUsed(state: GitOpsState): number {
  let n = 0
  for (const p of state.cluster.pods) if (p.status !== 'Terminating' && p.status !== 'Completed' && !(p.ownerKind === 'Job' && p.status === 'Error')) n++
  return n
}

/** ReplicaSet controller: create or delete Pods to match replicas (deletes not-ready first, then most recently ready). Pod creation respects the namespace quota. */
function reconcileReplicaSet(state: GitOpsState, rs: ReplicaSetRT) {
  const pods = podsOf(state, rs.name)
  if (pods.length < rs.replicas) {
    const quota = state.cfg.podQuota
    let used = quotaUsed(state)
    const taken = new Set(state.cluster.pods.map((p) => p.id))
    for (let i = pods.length; i < rs.replicas; i++) {
      if (used >= quota) {
        kubeEvent(state, `replicaset/${rs.name}`, 'Warning', 'FailedCreate', `Error creating: pods "${rs.name}-${safeRandom(() => 0.5, 5)}" is forbidden: exceeded quota: ${KLOPA.quota}, requested: pods=1, used: pods=${used}, limited: pods=${quota}`, 'replicaset-controller')
        break
      }
      const p = newPod(state, rs.name, 'ReplicaSet', rs.deployment, rs.image, taken)
      state.cluster.pods.push(p)
      used++
      kubeEvent(state, `replicaset/${rs.name}`, 'Normal', 'SuccessfulCreate', `Created pod: ${p.id}`, 'replicaset-controller')
    }
  } else if (pods.length > rs.replicas) {
    const order = [...pods].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || (b.readySince ?? 0) - (a.readySince ?? 0))
    const victims = new Set(order.slice(0, pods.length - rs.replicas).map((p) => p.id))
    for (const id of victims) kubeEvent(state, `replicaset/${rs.name}`, 'Normal', 'SuccessfulDelete', `Deleted pod: ${id}`, 'replicaset-controller')
    terminatePods(state, (p) => victims.has(p.id))
  }
}

function newPod(state: GitOpsState, owner: string, ownerKind: PodRT['ownerKind'], deployment: string | null, image: string, taken?: Set<string>): PodRT {
  const ids = taken ?? new Set(state.cluster.pods.map((p) => p.id))
  let id = `${owner}-${safeRandom(state.rng.next, 5)}`
  while (ids.has(id)) id = `${owner}-${safeRandom(state.rng.next, 5)}`
  ids.add(id)
  return {
    id,
    owner,
    ownerKind,
    deployment,
    image,
    tag: parseImage(image).tag,
    status: 'Pending',
    ready: false,
    since: state.t,
    readySince: null,
    startedAt: null,
    pullUntil: null,
    nextProbeAt: 0,
    nextRetryAt: 0,
    restarts: 0,
    goneAt: null,
    createdAt: state.t,
    reason: 'Scheduled',
    secretValue: null,
    secretSource: null,
    events: [],
  }
}

function rsOf(state: GitOpsState, p: PodRT): ReplicaSetRT | undefined {
  return p.ownerKind === 'ReplicaSet' ? state.cluster.replicaSets.find((r) => r.name === p.owner) : undefined
}

function templateFor(state: GitOpsState, p: PodRT): Fields {
  return rsOf(state, p)?.template ?? {}
}

/** Mount check: secret volume needs the Secret, CSI volume needs the external store. */
function mountProblem(state: GitOpsState, tpl: Fields): string | null {
  const vol = tpl[PATHS.volumeSecretName]
  if (typeof vol === 'string' && !secretData(state, vol)) return `MountVolume.SetUp failed for volume "secret": secret "${vol}" not found`
  const csi = tpl[PATHS.volumeCsiClass]
  if (typeof csi === 'string' && !state.secrets.store.available) return `MountVolume.SetUp failed for volume "secrets-store": rpc error: failed to get secret ${csi} from the store`
  return null
}

/** Env check: every secretKeyRef must resolve, else CreateContainerConfigError. */
function envProblem(state: GitOpsState, tpl: Fields): string | null {
  for (let i = 0; i < 8; i++) {
    const name = tpl[PATHS.envSecretName(i)]
    if (typeof name !== 'string') continue
    const key = String(tpl[PATHS.envSecretKey(i)] ?? '')
    const data = secretData(state, name)
    if (!data) return `Error: secret "${name}" not found`
    if (!(key in data)) return `Error: couldn't find key ${key} in Secret ${KLOPA.namespace}/${name}`
  }
  return null
}

function secretValueFor(state: GitOpsState, tpl: Fields): { value: string | null; source: PodRT['secretSource'] } {
  for (let i = 0; i < 8; i++) {
    const name = tpl[PATHS.envSecretName(i)]
    if (typeof name !== 'string') continue
    const data = secretData(state, name)
    return { value: data?.[String(tpl[PATHS.envSecretKey(i)] ?? '')] ?? null, source: 'env' }
  }
  const vol = tpl[PATHS.volumeSecretName]
  if (typeof vol === 'string') {
    const data = secretData(state, vol)
    const first = data ? Object.keys(data).sort()[0] : undefined
    return { value: first !== undefined && data ? data[first] : null, source: 'volume' }
  }
  const csi = tpl[PATHS.volumeCsiClass]
  if (typeof csi === 'string') return { value: state.secrets.store.values[csi] ?? null, source: 'csi' }
  return { value: null, source: null }
}

function setStatus(state: GitOpsState, p: PodRT, status: PodStatus, reason: string) {
  if (p.status === status && p.reason === reason) return
  const firstTime = p.reason !== reason
  p.status = status
  p.reason = reason
  p.since = state.t
  if (firstTime && (status === 'ImagePullBackOff' || status === 'CreateContainerConfigError' || (status === 'ContainerCreating' && reason.startsWith('FailedMount')) || (status === 'CrashLoopBackOff' && p.restarts === 1))) {
    const text =
      status === 'ImagePullBackOff'
        ? `Pod ${p.id}: ImagePullBackOff – slika ${p.tag} ne postoji u registru.`
        : status === 'CreateContainerConfigError'
          ? `Pod ${p.id}: CreateContainerConfigError – nedostaje Secret ili ključ u njemu.`
          : status === 'CrashLoopBackOff'
            ? `Pod ${p.id}: CrashLoopBackOff – kontejner se ruši nakon pokretanja.`
            : `Pod ${p.id}: ContainerCreating (FailedMount) – volumen s tajnom se ne može spojiti.`
    emit(state, 'pod', text, 'bad')
  }
}

/** kubelet: Pod lifecycle (schedule 1 s → pull 4 s / cached 0 s → start 6 s, readiness every 2 s). */
function tickPod(state: GitOpsState, p: PodRT) {
  const T = state.cfg.pod
  const t = state.t
  if (p.ownerKind === 'Job') return
  const rs = rsOf(state, p)
  const tpl = rs?.template ?? {}
  const name = containerName(p)
  switch (p.status) {
    case 'Pending':
      if (t - p.since >= T.scheduleS - 1e-9) {
        kubeEvent(state, podRef(p), 'Normal', 'Scheduled', `Successfully assigned ${KLOPA.namespace}/${p.id} to ${NODES[p.id.charCodeAt(p.id.length - 1) % NODES.length]}`, 'default-scheduler', p)
        stamp(state, rs?.revisionSha ?? null, 'firstScheduled')
        setStatus(state, p, 'ContainerCreating', 'Pulling')
      }
      return
    case 'ContainerCreating': {
      const mp = mountProblem(state, tpl)
      if (mp) {
        p.pullUntil = null
        if (!p.reason.startsWith('FailedMount')) kubeEvent(state, podRef(p), 'Warning', 'FailedMount', mp, 'kubelet', p)
        setStatus(state, p, 'ContainerCreating', `FailedMount: ${mp}`)
        return
      }
      if (p.pullUntil === null) {
        const cached = rs?.warm ?? false
        p.pullUntil = t + (cached ? 0 : T.pullS)
        kubeEvent(state, podRef(p), 'Normal', cached ? 'Pulled' : 'Pulling', cached ? `Container image "${p.image}" already present on machine` : `Pulling image "${p.image}"`, 'kubelet', p)
        if (p.reason !== 'Pulling') setStatus(state, p, 'ContainerCreating', 'Pulling')
      }
      if (t < p.pullUntil - 1e-9) return
      if (!imageInfo(state, p.image)) {
        // every failed pull repeats these events (merged into „xN” by kubeEvent)
        kubeEvent(state, podRef(p), 'Warning', 'Failed', `Failed to pull image "${p.image}": rpc error: code = NotFound desc = failed to pull and unpack image "${p.image}": not found`, 'kubelet', p)
        kubeEvent(state, podRef(p), 'Warning', 'Failed', 'Error: ErrImagePull', 'kubelet', p)
        kubeEvent(state, podRef(p), 'Normal', 'BackOff', `Back-off pulling image "${p.image}"`, 'kubelet', p)
        kubeEvent(state, podRef(p), 'Warning', 'Failed', 'Error: ImagePullBackOff', 'kubelet', p)
        setStatus(state, p, 'ImagePullBackOff', `Back-off pulling image "${p.image}"`)
        p.nextRetryAt = t + 10
        return
      }
      if (!state.cluster.imageCache.includes(p.image)) {
        state.cluster.imageCache.push(p.image)
        kubeEvent(state, podRef(p), 'Normal', 'Pulled', `Successfully pulled image "${p.image}" in ${Math.round(T.pullS)}s`, 'kubelet', p)
      } else if (!(rs?.warm ?? false) && T.pullS > 0) {
        kubeEvent(state, podRef(p), 'Normal', 'Pulled', `Successfully pulled image "${p.image}" in ${Math.round(T.pullS)}s`, 'kubelet', p)
      }
      stamp(state, rs?.revisionSha ?? null, 'imagePulled')
      startContainer(state, p, tpl)
      return
    }
    case 'ImagePullBackOff':
      if (t >= p.nextRetryAt && imageInfo(state, p.image)) {
        p.pullUntil = null
        setStatus(state, p, 'ContainerCreating', 'Pulling')
      } else if (t >= p.nextRetryAt) {
        p.nextRetryAt = t + 10
        kubeEvent(state, podRef(p), 'Normal', 'BackOff', `Back-off pulling image "${p.image}"`, 'kubelet', p)
      }
      return
    case 'CreateContainerConfigError':
      if (t >= p.nextRetryAt) {
        p.nextRetryAt = t + T.probePeriodS
        startContainer(state, p, tpl)
      }
      return
    case 'Running': {
      const info = imageInfo(state, p.image)
      if (info?.behaviour === 'crash' && p.startedAt !== null && t - p.startedAt >= T.crashAfterS - 1e-9) {
        p.restarts++
        p.ready = false
        p.nextRetryAt = t + Math.min(CRASH_BACKOFF.capS, CRASH_BACKOFF.initialS * 2 ** (p.restarts - 1))
        kubeEvent(state, podRef(p), 'Warning', 'BackOff', `Back-off restarting failed container ${name} in pod ${p.id}_${KLOPA.namespace}`, 'kubelet', p)
        setStatus(state, p, 'CrashLoopBackOff', `Back-off restarting failed container (exit code 1)`)
        return
      }
      if (t >= p.nextProbeAt - 1e-9) {
        p.nextProbeAt += T.probePeriodS
        if (info?.behaviour === 'ok' && p.startedAt !== null && t - p.startedAt >= T.appStartS - 1e-9) {
          p.ready = true
          p.readySince = t
          stamp(state, rs?.revisionSha ?? null, 'firstReady')
          setStatus(state, p, 'Ready', 'Started')
        } else if (info?.behaviour === 'notReady' && p.startedAt !== null && t - p.startedAt >= T.appStartS - 1e-9) {
          kubeEvent(state, podRef(p), 'Warning', 'Unhealthy', `Readiness probe failed: HTTP probe failed with statuscode: 503`, 'kubelet', p)
        }
      }
      return
    }
    case 'CrashLoopBackOff':
      if (t >= p.nextRetryAt) {
        p.startedAt = t
        p.nextProbeAt = t
        kubeEvent(state, podRef(p), 'Normal', 'Pulled', `Container image "${p.image}" already present on machine`, 'kubelet', p)
        kubeEvent(state, podRef(p), 'Normal', 'Started', `Started container ${name}`, 'kubelet', p)
        setStatus(state, p, 'Running', 'Started')
      }
      return
    case 'Ready': {
      // volume / CSI secret updates propagate with a delay; env never changes without a restart
      if (p.secretSource === 'volume') {
        const vol = tpl[PATHS.volumeSecretName]
        const changedAt = typeof vol === 'string' ? (state.cluster.secretChangedAt[vol] ?? 0) : 0
        if (t - changedAt >= state.cfg.volumeSyncS - 1e-9) {
          const v = secretValueFor(state, tpl).value
          if (v !== null && v !== p.secretValue) p.secretValue = v
        }
      }
      return
    }
    default:
      return
  }
}

function startContainer(state: GitOpsState, p: PodRT, tpl: Fields) {
  const ep = envProblem(state, tpl)
  if (ep) {
    p.nextRetryAt = state.t + state.cfg.pod.probePeriodS
    kubeEvent(state, podRef(p), 'Warning', 'Failed', ep, 'kubelet', p)
    setStatus(state, p, 'CreateContainerConfigError', ep)
    return
  }
  const sv = secretValueFor(state, tpl)
  p.secretValue = sv.value
  p.secretSource = sv.source
  p.startedAt = state.t
  p.nextProbeAt = state.t
  kubeEvent(state, podRef(p), 'Normal', 'Created', `Created container: ${containerName(p)}`, 'kubelet', p)
  kubeEvent(state, podRef(p), 'Normal', 'Started', `Started container ${containerName(p)}`, 'kubelet', p)
  setStatus(state, p, 'Running', 'Started')
}

function updateDeploymentStatus(state: GitOpsState, d: LiveObject) {
  const c = state.cluster
  const rt = deploymentRT(state, d.name)
  const n = asReplicas(d.fields[PATHS.replicas]) ?? 1
  const hash = templateHash(d.fields)
  const rsNames = new Set(c.replicaSets.filter((r) => r.deployment === d.name).map((r) => r.name))
  const newName = `${d.name}-${hash}`
  const pods = c.pods.filter((p) => p.ownerKind === 'ReplicaSet' && rsNames.has(p.owner))
  const act = pods.filter(active)
  const prev = rt.status
  const s: DeploymentStatus = {
    replicas: act.length,
    updatedReplicas: act.filter((p) => p.owner === newName).length,
    readyReplicas: act.filter((p) => p.ready).length,
    availableReplicas: act.filter(isAvailable).length,
    terminatingReplicas: pods.length - act.length,
  }
  const oldBefore = prev.replicas - prev.updatedReplicas
  const oldNow = s.replicas - s.updatedReplicas
  const progressed = s.updatedReplicas > prev.updatedReplicas || s.readyReplicas > prev.readyReplicas || s.availableReplicas > prev.availableReplicas || oldNow < oldBefore
  rt.status = s
  const complete = s.updatedReplicas === n && s.replicas === n && s.availableReplicas === n
  if (complete) {
    if (rt.reason !== 'NewReplicaSetAvailable') rt.lastProgressAt = state.t
    rt.reason = 'NewReplicaSetAvailable'
    const newRS = c.replicaSets.find((r) => r.name === newName)
    if (newRS) {
      newRS.warm = true
      stamp(state, newRS.revisionSha, 'allReady')
    }
  } else if (d.fields[PATHS.paused] === true) {
    // paused: Kubernetes sets reason DeploymentPaused and stops the deadline clock (resuming restarts it)
    rt.lastProgressAt = state.t
  } else if (progressed) {
    markProgress(state, rt, 'ReplicaSetUpdated')
  } else if (rt.reason !== 'ProgressDeadlineExceeded') {
    const deadline = typeof d.fields[PATHS.progressDeadline] === 'number' ? Number(d.fields[PATHS.progressDeadline]) : 600
    if (state.t - rt.lastProgressAt > deadline + 1e-9) {
      rt.reason = 'ProgressDeadlineExceeded'
      emit(state, 'health', `Deployment ${d.name}: ProgressDeadlineExceeded (${deadline} s bez napretka). Nitko ne vraća verziju automatski.`, 'bad')
    }
  }
}

/** Deployment `revisionHistoryLimit` (default 10): drop the oldest scaled-down ReplicaSets beyond it. */
function pruneReplicaSetHistory(state: GitOpsState, d: LiveObject) {
  const c = state.cluster
  const hash = templateHash(d.fields)
  const old = c.replicaSets.filter((r) => r.deployment === d.name && r.hash !== hash && r.replicas === 0 && !c.pods.some((p) => p.owner === r.name))
  if (old.length <= REVISION_HISTORY_LIMIT) return
  const drop = new Set(old.sort((a, b) => a.revision - b.revision).slice(0, old.length - REVISION_HISTORY_LIMIT).map((r) => r.name))
  c.replicaSets = c.replicaSets.filter((r) => !drop.has(r.name))
}

// ─── HPA ─────────────────────────────────────────────────────────────────────

/**
 * horizontal.go reconcileAutoscaler: target at 0 replicas with minReplicas > 0 → scaling disabled (no write);
 * replicas above max / below min → set max / min directly (no metrics, no rate limit); otherwise the metric path:
 * desired from `hpaDemand`, scale-up limited to max(+100 %, +4 Pods) per period, scale-down to the highest
 * recommendation of the last 300 s.
 */
/** Set (replace) one HPA condition, keeping the order in which the controller first added them. */
function setHpaCondition(rt: HpaRT, type: HpaCondition['type'], status: HpaCondition['status'], reason: string, message: string) {
  const c = rt.conditions.find((x) => x.type === type)
  if (c) Object.assign(c, { status, reason, message })
  else rt.conditions.push({ type, status, reason, message })
}

/** Steady-state conditions of an HPA that has been running for a while (initial state of a preset). */
export function settleHpa(rt: HpaRT): void {
  rt.conditions = []
  setHpaCondition(rt, 'AbleToScale', 'True', 'ReadyForNewScale', 'recommended size matches current size')
  setHpaCondition(rt, 'ScalingActive', 'True', 'ValidMetricFound', 'the HPA was able to successfully calculate a replica count from cpu resource utilization (percentage of request)')
  setHpaCondition(rt, 'ScalingLimited', 'False', 'DesiredWithinRange', 'the desired count is within the acceptable range')
}

/** The HPA targets CPU utilization (percentage of request) – the Klopa HPA does. */
function usesCpuUtilization(h: LiveObject): boolean {
  return h.fields[PATHS.hpaMetricType] === 'Resource' && h.fields[PATHS.hpaMetricName] === 'cpu' && h.fields[PATHS.hpaTargetType] === 'Utilization'
}

/**
 * horizontal.go reconcileAutoscaler: target missing → AbleToScale=False FailedGetScale (Argo CD: Degraded); target at 0
 * replicas with minReplicas > 0 → scaling disabled (no write); replicas above max / below min → set max / min directly
 * (no metrics, no rate limit); otherwise the metric path: a CPU-utilization target needs `resources.requests.cpu` in the
 * Pod template („missing request for cpu” → ScalingActive=False FailedGetResourceMetric, no scaling, Argo CD: Degraded);
 * desired from `hpaDemand`, scale-up limited to max(+100 %, +4 Pods) per period, scale-down to the highest recommendation
 * of the last 300 s.
 */
function tickHpa(state: GitOpsState, h: LiveObject) {
  const c = state.cluster
  const rt = c.hpas[h.name]
  if (!rt || state.t < rt.nextEvalAt - 1e-9) return
  rt.nextEvalAt += state.cfg.hpaPeriodS
  if (rt.external) return
  const targetName = String(h.fields[PATHS.hpaTarget] ?? h.name)
  const d = c.objects[objKey('Deployment', targetName)]
  const ref = `horizontalpodautoscaler/${h.name}`
  if (!d) {
    const msg = `deployments/scale.apps "${targetName}" not found`
    const was = rt.conditions.find((x) => x.type === 'AbleToScale')?.reason
    setHpaCondition(rt, 'AbleToScale', 'False', 'FailedGetScale', `the HPA controller was unable to get the target's current scale: ${msg}`)
    kubeEvent(state, ref, 'Warning', 'FailedGetScale', msg, 'horizontal-pod-autoscaler')
    if (was !== 'FailedGetScale') emit(state, 'hpa', `HPA ${h.name}: Deployment ${targetName} ne postoji (FailedGetScale) – HPA je Degraded.`, 'bad')
    return
  }
  setHpaCondition(rt, 'AbleToScale', 'True', 'SucceededGetScale', "the HPA controller was able to get the target's current scale")
  const min = asReplicas(h.fields[PATHS.hpaMin] ?? 1) ?? 1
  const max = asReplicas(h.fields[PATHS.hpaMax]) ?? min
  const current = asReplicas(d.fields[PATHS.replicas]) ?? 1
  if (current === 0 && min > 0) {
    if (!rt.scalingDisabled) emit(state, 'hpa', `HPA ${h.name}: skaliranje je isključeno jer ${targetName} ima 0 replika (ScalingActive=False, ScalingDisabled).`, 'info')
    rt.scalingDisabled = true
    setHpaCondition(rt, 'ScalingActive', 'False', 'ScalingDisabled', 'scaling is disabled since the replica count of the target is zero')
    return
  }
  rt.scalingDisabled = false
  let next = current
  let bound: 'max' | 'min' | null = null
  if (current > max) {
    next = max
    bound = 'max'
  } else if (current < min) {
    next = min
    bound = 'min'
  } else {
    if (usesCpuUtilization(h) && d.fields[PATHS.cpuRequest] === undefined) {
      const container = String(d.fields[PATHS.containerName] ?? targetName)
      const pod = deploymentPods(state, targetName).find((p) => p.status !== 'Terminating')?.id ?? externalPods(state, targetName)[0]?.id ?? `${targetName}-${templateHash(d.fields)}`
      const err = `failed to get cpu utilization: missing request for cpu in container ${container} of Pod ${pod}`
      const was = rt.conditions.find((x) => x.type === 'ScalingActive')?.reason
      setHpaCondition(rt, 'ScalingActive', 'False', 'FailedGetResourceMetric', `the HPA was unable to compute the replica count: ${err}`)
      kubeEvent(state, ref, 'Warning', 'FailedGetResourceMetric', err, 'horizontal-pod-autoscaler')
      kubeEvent(state, ref, 'Warning', 'FailedComputeMetricsReplicas', `invalid metrics (1 invalid out of 1), first error is: ${err}`, 'horizontal-pod-autoscaler')
      if (was !== 'FailedGetResourceMetric') emit(state, 'hpa', `HPA ${h.name} ne skalira: Pod nema requests.cpu, pa se iskorištenost CPU-a ne može izračunati (FailedGetResourceMetric).`, 'bad')
      return
    }
    setHpaCondition(rt, 'ScalingActive', 'True', 'ValidMetricFound', 'the HPA was able to successfully calculate a replica count from cpu resource utilization (percentage of request)')
    const raw = Math.max(1, c.hpaDemand || current)
    const desired = Math.min(max, Math.max(min, raw))
    rt.recommendations.push({ t: state.t, n: desired })
    rt.recommendations = rt.recommendations.filter((r) => state.t - r.t <= state.cfg.hpaDownStabilizationS + 1e-9)
    let limited = false
    if (desired > current) {
      next = Math.min(desired, Math.max(current * 2, current + 4))
      limited = next < desired
    } else if (desired < current) {
      const stabilized = Math.max(...rt.recommendations.map((r) => r.n))
      if (stabilized < current) next = stabilized
    }
    rt.lastDesired = desired
    if (raw > max) setHpaCondition(rt, 'ScalingLimited', 'True', 'TooManyReplicas', 'the desired replica count is more than the maximum replica count')
    else if (raw < min) setHpaCondition(rt, 'ScalingLimited', 'True', 'TooFewReplicas', 'the desired replica count is less than the minimum replica count')
    else if (limited) setHpaCondition(rt, 'ScalingLimited', 'True', 'ScaleUpLimit', 'the desired replica count is increasing faster than the maximum scale rate')
    else setHpaCondition(rt, 'ScalingLimited', 'False', 'DesiredWithinRange', 'the desired count is within the acceptable range')
    if (next === current) setHpaCondition(rt, 'AbleToScale', 'True', 'ReadyForNewScale', 'recommended size matches current size')
  }
  if (bound) rt.lastDesired = next
  const why = bound === 'max' ? ' (iznad maxReplicas)' : bound === 'min' ? ' (ispod minReplicas)' : ''
  if (next !== current) {
    writeField(state, d.key, PATHS.replicas, next, 'hpa')
    setHpaCondition(rt, 'AbleToScale', 'True', 'SucceededRescale', `the HPA controller was able to update the target scale to ${next}`)
    const reason = bound === 'max' ? 'Current number of replicas above Spec.MaxReplicas' : bound === 'min' ? 'Current number of replicas below Spec.MinReplicas' : `cpu resource utilization (percentage of request) ${next > current ? 'above' : 'below'} target`
    kubeEvent(state, ref, 'Normal', 'SuccessfulRescale', `New size: ${next}; reason: ${reason}`, 'horizontal-pod-autoscaler')
    emit(state, 'hpa', `HPA skalira ${targetName}: ${current} → ${plural(next, ['Pod', 'Poda', 'Podova'])}${why}.`, 'info')
  }
}

// ─── Jobs (sync hooks) ───────────────────────────────────────────────────────

function startJob(state: GitOpsState, o: LiveObject) {
  const image = String(o.fields[PATHS.jobImage] ?? '')
  const pod = newPod(state, o.name, 'Job', null, image)
  const info = imageInfo(state, image)
  state.cluster.pods.push(pod)
  if (!info) {
    // the image cannot be pulled: the Job never finishes, so a sync waiting for this hook waits until terminated
    pod.status = 'ImagePullBackOff'
    pod.reason = `Back-off pulling image "${image}"`
    kubeEvent(state, podRef(pod), 'Normal', 'BackOff', `Back-off pulling image "${image}"`, 'kubelet', pod)
    state.cluster.jobs[o.key] = { key: o.key, name: o.name, startedAt: state.t, finishesAt: Number.POSITIVE_INFINITY, status: 'Running', podId: pod.id }
    emit(state, 'pod', `Job ${o.name}: ImagePullBackOff – slika ${pod.tag} ne postoji u registru; Job ne završava.`, 'bad')
    return
  }
  pod.status = 'Running'
  pod.startedAt = state.t
  kubeEvent(state, `job/${o.name}`, 'Normal', 'SuccessfulCreate', `Created pod: ${pod.id}`, 'job-controller')
  state.cluster.jobs[o.key] = { key: o.key, name: o.name, startedAt: state.t, finishesAt: state.t + state.cfg.jobDurationS, status: 'Running', podId: pod.id }
}

function tickJobs(state: GitOpsState) {
  for (const j of Object.values(state.cluster.jobs)) {
    if (j.status !== 'Running' || state.t < j.finishesAt - 1e-9) continue
    const pod = state.cluster.pods.find((p) => p.id === j.podId)
    const crashes = pod ? imageInfo(state, pod.image)?.behaviour === 'crash' : false
    if (state.cluster.databaseDown || crashes) {
      j.status = 'Failed'
      if (pod) setStatus(state, pod, 'Error', 'BackoffLimitExceeded')
      kubeEvent(state, `job/${j.name}`, 'Warning', 'BackoffLimitExceeded', 'Job has reached the specified backoff limit', 'job-controller')
      emit(state, 'pod', `Job ${j.name} nije uspio: ${crashes ? 'kontejner se srušio' : 'baza nije dostupna'} (backoffLimit: 0).`, 'bad')
    } else {
      j.status = 'Complete'
      if (pod) setStatus(state, pod, 'Completed', 'Completed')
      kubeEvent(state, `job/${j.name}`, 'Normal', 'Completed', 'Job completed', 'job-controller')
      emit(state, 'pod', `Job ${j.name} je završio (migracija baze).`, 'ok')
    }
  }
}

// ─── Secret controllers (L23) ────────────────────────────────────────────────

/** One Sealed Secrets controller reconcile of a SealedSecret: decrypt and create/update the Secret it owns. */
function unseal(state: GitOpsState, o: LiveObject) {
  const c = state.cluster
  const key = o.key
  const data: Record<string, string> = {}
  let error: string | null = null
  for (const [p, v] of Object.entries(o.fields)) {
    if (!p.startsWith('/spec/encryptedData/')) continue
    const box = state.secrets.sealing.ciphertexts[String(v)]
    if (!box || !state.secrets.sealing.clusterKeyIds.includes(box.keyId)) {
      error = 'no key could decrypt secret'
      break
    }
    data[p.slice('/spec/encryptedData/'.length)] = box.value
  }
  const was = ctrlStatus(c)[key]
  if (!error) {
    const res = upsertOwnedSecret(state, o.name, o.namespace, data, key, false)
    if (res === 'refused') error = `Resource "${o.name}" already exists and is not managed by SealedSecret`
    else {
      ctrlStatus(c)[key] = { ok: true, message: '', gen: o.generation }
      delete c.sealedResyncAt[key]
      if (res !== 'same') emit(state, 'secret', `Sealed Secrets kontroler dešifrirao je ${o.name} → običan Secret u klasteru.`, 'info')
      return
    }
  }
  ctrlStatus(c)[key] = { ok: false, message: error, gen: o.generation }
  c.sealedResyncAt[key] = state.t + state.cfg.sealedResyncS
  if (!was || was.ok || was.message !== error) {
    emit(state, 'secret', error.startsWith('Resource')
      ? `SealedSecret ${o.name}: Secret ${o.name} već postoji i ne pripada SealedSecretu – kontroler ga ne preuzima.`
      : `SealedSecret ${o.name}: kontroler ne može dešifrirati („${error}”) – Secret ne nastaje.`, 'bad')
  }
}

function tickSealedSecrets(state: GitOpsState) {
  const c = state.cluster
  for (const o of Object.values(c.objects)) {
    if (o.kind !== 'SealedSecret') continue
    const key = o.key
    const due = c.unsealAt[key]
    if (due !== undefined) {
      if (state.t < due - 1e-9) continue
      delete c.unsealAt[key]
      unseal(state, o)
      continue
    }
    const st = ctrlStatus(c)[key]
    if (st?.ok) {
      // the controller watches the Secrets it owns: a deleted one is recreated
      const sec = c.objects[objKey('Secret', o.name)]
      if (!sec) c.unsealAt[key] = state.t + state.cfg.unsealS
    } else if (st && state.t >= (c.sealedResyncAt[key] ?? 0) - 1e-9) {
      unseal(state, o)
    }
  }
}

function tickExternalSecrets(state: GitOpsState) {
  const c = state.cluster
  for (const [key, at] of Object.entries(c.esoNextRefreshAt)) {
    if (state.t < at - 1e-9) continue
    const o = c.objects[key]
    if (!o) {
      delete c.esoNextRefreshAt[key]
      continue
    }
    c.esoNextRefreshAt[key] = state.t + parseDurationS(o.fields[PATHS.esoRefresh], 3600)
    const target = String(o.fields[PATHS.esoTarget] ?? o.name)
    const remote = String(o.fields[PATHS.esoRemoteKey] ?? '')
    const secretKey = String(o.fields[PATHS.esoSecretKey] ?? 'value')
    const store = state.secrets.store
    if (!store.available) {
      const was = ctrlStatus(c)[key]
      ctrlStatus(c)[key] = { ok: false, message: 'SecretSyncedError: could not get secret data from provider', gen: o.generation }
      if (!was || was.ok) emit(state, 'secret', `ExternalSecret ${o.name}: trezor nedostupan – postojeći Secret ostaje, rotacija čeka.`, 'warn')
      continue
    }
    const value = store.values[remote]
    if (value === undefined) {
      ctrlStatus(c)[key] = { ok: false, message: `SecretSyncedError: key ${remote} not found`, gen: o.generation }
      continue
    }
    const res = upsertOwnedSecret(state, target, o.namespace, { [secretKey]: value }, key, true)
    ctrlStatus(c)[key] = { ok: true, message: 'SecretSynced', gen: o.generation }
    if (res === 'created' || res === 'updated') emit(state, 'secret', `External Secrets Operator osvježio je Secret ${target} iz trezora.`, 'info')
  }
}

function tickCsiRotation(state: GitOpsState) {
  if (!state.cfg.csiRotation || !state.secrets.store.available) return
  const period = Math.max(1, Math.round(state.cfg.csiRotationS * 10))
  if (state.tick % period !== 0) return
  for (const p of state.cluster.pods) {
    if (p.secretSource !== 'csi' || !p.ready) continue
    const v = secretValueFor(state, templateFor(state, p)).value
    if (v !== null) p.secretValue = v
  }
}

// ─── Tick ────────────────────────────────────────────────────────────────────

export function tickCluster(state: GitOpsState): void {
  const c = state.cluster
  for (const o of Object.values(c.objects)) if (o.kind === 'HorizontalPodAutoscaler') tickHpa(state, o)
  for (const o of Object.values(c.objects)) if (o.kind === 'Deployment' && !c.external[o.name]) reconcileDeployment(state, o)
  for (const rs of c.replicaSets) reconcileReplicaSet(state, rs)
  for (const p of c.pods) tickPod(state, p)
  for (let i = c.pods.length - 1; i >= 0; i--) {
    const p = c.pods[i]
    if (p.status === 'Terminating' && p.goneAt !== null && state.t >= p.goneAt - 1e-9) c.pods.splice(i, 1)
  }
  for (const o of Object.values(c.objects)) {
    if (o.kind !== 'Deployment' || c.external[o.name]) continue
    updateDeploymentStatus(state, o)
    pruneReplicaSetHistory(state, o)
  }
  tickJobs(state)
  tickSealedSecrets(state)
  tickExternalSecrets(state)
  tickCsiRotation(state)
}

/** Pods of a Deployment that are not terminating. */
export function deploymentPods(state: GitOpsState, name: string): PodRT[] {
  const rs = new Set(state.cluster.replicaSets.filter((r) => r.deployment === name).map((r) => r.name))
  return state.cluster.pods.filter((p) => p.ownerKind === 'ReplicaSet' && rs.has(p.owner))
}

/** Bring a Deployment to its steady state instantly (initial state of a preset: Pods already Ready, image cached). */
export function settleDeployment(state: GitOpsState, d: LiveObject): void {
  const rt = deploymentRT(state, d.name)
  const n = Math.min(asReplicas(d.fields[PATHS.replicas]) ?? 1, Math.max(0, state.cfg.podQuota - quotaUsed(state)))
  const hash = templateHash(d.fields)
  const image = String(d.fields[PATHS.image] ?? '')
  const replicas = asReplicas(d.fields[PATHS.replicas]) ?? 1
  const { surge } = fenceposts(d.fields[PATHS.maxSurge], d.fields[PATHS.maxUnavailable], replicas)
  const rs: ReplicaSetRT = { name: `${d.name}-${hash}`, deployment: d.name, hash, template: templateOf(d.fields), image, tag: parseImage(image).tag, revision: ++rt.revisionCounter, replicas, createdAt: state.t - 600, warm: true, revisionSha: null, desiredAnno: replicas, maxAnno: replicas + surge }
  state.cluster.replicaSets.push(rs)
  if (!state.cluster.imageCache.includes(image)) state.cluster.imageCache.push(image)
  const tpl = rs.template
  const taken = new Set(state.cluster.pods.map((p) => p.id))
  for (let i = 0; i < n; i++) {
    const p = newPod(state, rs.name, 'ReplicaSet', d.name, image, taken)
    const sv = secretValueFor(state, tpl)
    p.secretValue = sv.value
    p.secretSource = sv.source
    if (envProblem(state, tpl) || mountProblem(state, tpl) || imageInfo(state, image)?.behaviour !== 'ok') continue
    p.status = 'Ready'
    p.ready = true
    p.readySince = state.t - 600
    p.startedAt = state.t - 600
    p.createdAt = state.t - 600
    p.since = state.t - 600
    p.reason = 'Started'
    state.cluster.pods.push(p)
  }
  rt.observedGeneration = d.generation
  rt.rolloutRevision = null
  updateDeploymentStatus(state, d)
  rt.reason = 'NewReplicaSetAvailable'
}

/** For SealedSecret/ExternalSecret settle at creation (initial state). */
export function settleControllers(state: GitOpsState): void {
  const c = state.cluster
  for (const key of Object.keys(c.unsealAt)) c.unsealAt[key] = state.t
  for (const key of Object.keys(c.esoNextRefreshAt)) c.esoNextRefreshAt[key] = state.t
  tickSealedSecrets(state)
  tickExternalSecrets(state)
}

// ─── External workload model (E3) ────────────────────────────────────────────

/** Hand a Deployment's Pods to another engine (on) or take them back (off). E6's own ReplicaSets/Pods for it are removed on attach. */
export function setExternalWorkload(state: GitOpsState, name: string, on: boolean): void {
  const c = state.cluster
  if (on) {
    c.external[name] = true
    const rsNames = new Set(c.replicaSets.filter((r) => r.deployment === name).map((r) => r.name))
    c.pods = c.pods.filter((p) => !(p.ownerKind === 'ReplicaSet' && rsNames.has(p.owner)))
    c.replicaSets = c.replicaSets.filter((r) => r.deployment !== name)
    const live = c.objects[objKey('Deployment', name)]
    const rt = c.deployments[name]
    if (rt && live) rt.externalObservedHash = templateHash(live.fields)
  } else {
    delete c.external[name]
    const rt = c.deployments[name]
    if (rt) rt.externalPods = []
  }
}

/**
 * Write the status an external workload model computed; Argo CD's Deployment health is derived from it. The report is
 * taken as current (status.observedGeneration = metadata.generation) when it
 * - names the generation it processed (`observedGeneration`), or
 * - echoes the live Pod-template hash (`observedTemplateHash` = `deploymentSpec().templateHash` the model has rolled out), or
 * - has neither field and no template change is pending since the last echoed hash (pure scaling: HPA, kubectl scale).
 * After a template change a report must echo the new hash; until then the app stays Progressing („observed deployment
 * generation less than desired generation”), like a controller that has not caught up – a stale „all updated” status
 * of the old template can never make the new revision Healthy.
 */
export function setExternalWorkloadStatus(state: GitOpsState, name: string, st: ExternalWorkloadStatus): boolean {
  const live = state.cluster.objects[objKey('Deployment', name)]
  if (!live || !state.cluster.external[name]) return false
  const rt = deploymentRT(state, name)
  const num = (v: number | undefined) => (Number.isFinite(v) ? Math.max(0, Math.floor(Number(v))) : 0)
  rt.status = { replicas: num(st.replicas), updatedReplicas: num(st.updatedReplicas), readyReplicas: num(st.readyReplicas), availableReplicas: num(st.availableReplicas), terminatingReplicas: num(st.terminatingReplicas) }
  const hash = templateHash(live.fields)
  if (typeof st.observedGeneration === 'number' && Number.isFinite(st.observedGeneration)) {
    rt.observedGeneration = Math.min(live.generation, Math.floor(st.observedGeneration))
  } else if (typeof st.observedTemplateHash === 'string') {
    rt.externalObservedHash = st.observedTemplateHash
    // a matching hash means the external model works on the current template (a pure scale does not change it)
    if (st.observedTemplateHash === hash) rt.observedGeneration = live.generation
  } else if (rt.externalObservedHash === hash) {
    rt.observedGeneration = live.generation
  }
  if (st.pods) rt.externalPods = st.pods.slice(0, state.cfg.podQuota * 2).map((p) => ({ ...p }))
  const n = asReplicas(live.fields[PATHS.replicas]) ?? 1
  const complete = rt.status.updatedReplicas === n && rt.status.replicas === n && rt.status.availableReplicas === n
  const reason: DeploymentReason = st.progressDeadlineExceeded ? 'ProgressDeadlineExceeded' : complete ? 'NewReplicaSetAvailable' : 'ReplicaSetUpdated'
  if (reason === 'ProgressDeadlineExceeded' && rt.reason !== reason) emit(state, 'health', `Deployment ${name}: ProgressDeadlineExceeded (javlja vanjski model klastera).`, 'bad')
  rt.reason = reason
  rt.lastProgressAt = state.t
  if (complete && rt.observedGeneration >= live.generation) stamp(state, rt.rolloutRevision, 'allReady')
  return true
}

/**
 * An external model (E3 console) changed the Deployment spec: record it as a live change by `by` (default 'kubectl'),
 * so drift, OutOfSync, self-heal and the HPA fight see it exactly like an E6 `kubectl` action. Sugar over
 * `reportExternalChange` for the three fields E3's Deployment actions change most.
 */
export function reportExternalSpec(state: GitOpsState, name: string, patch: { replicas?: number | null; image?: string; paused?: boolean }, by: Writer = 'kubectl'): boolean {
  const key = objKey('Deployment', name)
  if (!state.cluster.objects[key]) return false
  let changed = false
  if (patch.replicas !== undefined) {
    const r = patch.replicas
    if (r === null || (Number.isInteger(r) && r >= 0 && r <= MAX_INT32)) changed = writeField(state, key, PATHS.replicas, r, by) || changed
  }
  if (typeof patch.image === 'string' && patch.image.trim()) changed = writeField(state, key, PATHS.image, patch.image, by) || changed
  if (typeof patch.paused === 'boolean') changed = writeField(state, key, PATHS.paused, patch.paused ? true : null, by) || changed
  if (changed) countExternalChange(state, `deployment/${name}`, by, patch.image !== undefined)
  return changed
}

function countExternalChange(state: GitOpsState, ref: string, by: Writer, image: boolean) {
  if (by !== 'kubectl') return
  state.stats.kubectlChanges++
  if (image) state.stats.kubectlImageChanges++
  emit(state, 'drift', `Ručna promjena (vanjski model klastera): ${ref}.`, 'warn')
}

/**
 * Generic reverse path for another engine's console (`kubectl edit`, `kubectl delete` in E3): set (or with `null`
 * remove) one field of a live object, or delete the whole object with `path: ''` and `value: null`. Recorded as a live
 * change by `by`, so Argo CD sees drift, selfHeal reverts it and `stats.kubectlChanges` counts it. Returns false for an
 * unknown object, an unchanged value or a create request (`path: ''` with a value – use a commit or `applyManifest`).
 */
export function reportExternalChange(state: GitOpsState, kind: Kind, name: string, path: string, value: FieldValue | null, by: Writer = 'kubectl'): boolean {
  const key = objKey(kind, name)
  if (!state.cluster.objects[key]) return false
  let ok: boolean
  if (path === '') {
    if (value !== null) return false
    ok = deleteObject(state, key, by)
  } else {
    if (!path.startsWith('/')) return false
    ok = writeField(state, key, path, value, by)
  }
  if (ok) countExternalChange(state, `${kind.toLowerCase()}/${name}${path ? ` (${path})` : ' obrisan'}`, by, kind === 'Deployment' && path === PATHS.image)
  return ok
}

/**
 * Take (and remove) the live field changes recorded since the last call – the E6 → E3 direction: everything Argo CD
 * applied (`by: ['argocd']`), including Services, HTTPRoutes, ConfigMaps and memory limits. `since` keeps older entries
 * out; entries not matching the filter stay in the feed. Path '' = the whole object was created or deleted.
 * Filter by writer so changes an engine reported itself (`reportExternalChange`, 'kubectl') do not echo back.
 */
export function drainLiveChanges(state: GitOpsState, opts: { since?: number; by?: Writer[] } = {}): LiveChange[] {
  const take = (e: LiveChange) => (opts.since === undefined || e.t >= opts.since - 1e-9) && (!opts.by || opts.by.includes(e.by))
  const feed = state.cluster.liveChanges
  const out = feed.filter(take)
  state.cluster.liveChanges = feed.filter((e) => !take(e))
  return out.map((e) => ({ ...e }))
}

/**
 * The HPA's decision comes from another engine (E3 computes it from CPU): write exactly `n` replicas as the HPA, without
 * E6's own HPA policy (rate limit, stabilisation), and switch E6's HPA maths off for that HPA.
 */
export function setHpaDesired(state: GitOpsState, name: string, n: number): boolean {
  const rt = state.cluster.hpas[name]
  const h = state.cluster.objects[objKey('HorizontalPodAutoscaler', name)]
  if (!rt || !h || !Number.isInteger(n) || n < 0 || n > MAX_INT32) return false
  rt.external = true
  rt.lastDesired = n
  if (rt.conditions.length === 0) settleHpa(rt)
  const target = String(h.fields[PATHS.hpaTarget] ?? name)
  const changed = writeField(state, objKey('Deployment', target), PATHS.replicas, n, 'hpa')
  if (changed) setHpaCondition(rt, 'AbleToScale', 'True', 'SucceededRescale', `the HPA controller was able to update the target scale to ${n}`)
  return changed
}

/** Live Deployment spec for an external workload model. */
export function deploymentSpec(state: GitOpsState, name: string): DeploymentSpecView | null {
  const o = state.cluster.objects[objKey('Deployment', name)]
  if (!o) return null
  const image = String(o.fields[PATHS.image] ?? '')
  const parsed = parseImage(image)
  const info = imageInfo(state, image)
  const r = asReplicas(o.fields[PATHS.replicas])
  return {
    name,
    generation: o.generation,
    specVersion: o.generation,
    lastWriter: o.lastWriter,
    replicas: r,
    effectiveReplicas: r ?? 1,
    image,
    imageRef: `${parsed.repo}:${parsed.tag}`,
    tag: parsed.tag,
    digest: parsed.digest,
    behaviour: info ? info.behaviour : 'missing',
    bugRate: info?.bugRate ?? 0,
    maxSurge: o.fields[PATHS.maxSurge] ?? '25%',
    maxUnavailable: o.fields[PATHS.maxUnavailable] ?? '25%',
    progressDeadlineSeconds: typeof o.fields[PATHS.progressDeadline] === 'number' ? Number(o.fields[PATHS.progressDeadline]) : 600,
    paused: o.fields[PATHS.paused] === true,
    templateHash: templateHash(o.fields),
  }
}

/** Pods an external model reported for a Deployment ([] when E6 simulates them). */
export function externalPods(state: GitOpsState, name: string): ExternalPod[] {
  if (!state.cluster.external[name]) return []
  return state.cluster.deployments[name]?.externalPods ?? []
}

export function controllerStatusOf(state: GitOpsState, key: string): { ok: boolean; message: string } | null {
  return ctrlStatus(state.cluster)[key] ?? null
}
