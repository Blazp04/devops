/**
 * Read-only selectors for UIs (call during render). They never mutate state – rendering uses the pure `renderTarget`,
 * never the controller's caching `render` (a test deep-compares the state before and after every selector).
 */
import type { Commit, DiffEntry, ExternalPod, FieldValue, GitOpsState, HealthCode, HpaCondition, KubeEvent, Kind, Manifest, PodRT, PodStatus, StationId, SyncCode } from './types.ts'
import { API_VERSIONS, KLOPA, PATHS, REAL_FACTOR, TIMINGS, type RetryPresetId } from './constants.ts'
import { isSopsToken, isVaultPlaceholder, SMS } from './config.ts'
import { controllerStatusOf, deploymentPods, externalPods, hpaHealth, imageInfo, objectHealth } from './cluster.ts'
import { computeComparison, renderTarget } from './argocd.ts'
import { ancestry, checkSourceIntegrity, everCommitted, findCommit, headCommit, isTrusted } from './git.ts'
import { dottedPath, fmtS, fmtValue, humanDuration, objKey, parseImage, round1, simDate, templateHash } from './util.ts'

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0)
const asCount = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null)
const isExternal = (state: GitOpsState, name: string) => Boolean(state.cluster.external[name])

// ─── Application ─────────────────────────────────────────────────────────────

export interface AppView {
  mode: 'pull' | 'push'
  sync: SyncCode
  health: HealthCode
  healthMessage: string
  /** revision Argo CD compares against (last Git refresh) */
  knownRevision: string | null
  headRevision: string
  /** Git has a commit Argo CD has not seen yet (waiting for the poll/webhook) */
  behindGit: boolean
  operation: null | {
    phase: string
    initiatedBy: string
    revision: string
    message: string
    retryCount: number
    nextRetryInS: number | null
    stage: string
  }
  lastOperation: null | { phase: string; revision: string; message: string; initiatedBy: string; finishedAt: number | null }
  conditions: { type: string; message: string }[]
  autoSyncNote: string
  policy: GitOpsState['argo']['policy']
  outOfSyncForS: number | null
}

export function appView(state: GitOpsState): AppView {
  const a = state.argo
  const op = a.operation
  const lo = a.lastOperation
  return {
    mode: state.mode,
    sync: state.mode === 'pull' ? a.sync.status : 'Unknown',
    health: state.mode === 'pull' ? a.health.status : 'Unknown',
    healthMessage: a.health.message,
    knownRevision: a.knownRevision,
    headRevision: state.repo.head,
    behindGit: state.mode === 'pull' && a.knownRevision !== state.repo.head,
    operation: op
      ? {
          phase: op.phase,
          initiatedBy: op.initiatedBy,
          revision: op.revision,
          message: op.message,
          retryCount: op.retryCount,
          nextRetryInS: op.nextRetryAt === null ? null : round1(Math.max(0, op.nextRetryAt - state.t)),
          stage: op.stage,
        }
      : null,
    lastOperation: lo ? { phase: lo.phase, revision: lo.revision, message: lo.message, initiatedBy: lo.initiatedBy, finishedAt: lo.finishedAt } : null,
    conditions: a.conditions.map((c) => ({ ...c })),
    autoSyncNote: a.lastAutoSyncNote,
    policy: { ...a.policy, retry: a.policy.retry ? { ...a.policy.retry } : null },
    outOfSyncForS: a.outOfSyncSince === null ? null : round1(state.t - a.outOfSyncSince),
  }
}

/**
 * Which `RETRY_PRESETS` entry `syncPolicy.retry` is now (null = a custom strategy), for a „retry” Segmented control with
 * `RETRY_LABELS` – a plain on/off Toggle would show „off” for the default, while automated syncs still retry 5×.
 */
export function retryPresetOf(state: GitOpsState): RetryPresetId | null {
  const r = state.argo.policy.retry
  if (r === null) return 'notSet'
  if (r.backoff || r.refresh) return null
  return r.limit === 0 ? 'none' : r.limit === 5 ? 'five' : r.limit < 0 ? 'unlimited' : null
}

export interface PollRing {
  /** 'webhook' when a webhook is configured (polling still runs as a fallback) */
  mode: 'poll' | 'webhook'
  /** 0..1 progress of the current poll interval */
  progress: number
  nextInS: number
  /** label with compressed time, e.g. „12–18 s (sim) · stvarno: 120 s + do 60 s (najviše oko 3 min)” */
  label: string
  lastRefreshAgoS: number
  webhookPendingInS: number | null
}

export function pollRing(state: GitOpsState): PollRing {
  const a = state.argo
  const span = Math.max(0.001, a.nextPollAt - a.pollStartedAt)
  return {
    mode: a.webhook ? 'webhook' : 'poll',
    progress: clamp01((state.t - a.pollStartedAt) / span),
    nextInS: round1(Math.max(0, a.nextPollAt - state.t)),
    label: TIMINGS.pollTotal.label,
    lastRefreshAgoS: round1(state.t - a.lastGitRefreshAt),
    webhookPendingInS: a.webhookRefreshAt === null ? null : round1(Math.max(0, a.webhookRefreshAt - state.t)),
  }
}

/** Diff view (Argo CD „App diff”): ignored entries are included with ignored=true. */
export function diffView(state: GitOpsState): DiffEntry[] {
  return state.argo.diffs.map((d) => ({ ...d }))
}

// ─── Workload ────────────────────────────────────────────────────────────────

/** Colour category matching the kit's PodShape `status` (src/kit/diagram/k8s-helpers.ts). Show `status` as the text. */
export type KitPodStatus = 'running' | 'pending' | 'creating' | 'terminating' | 'crash' | 'notready' | 'completed'

export function kitPodStatus(p: PodRT): KitPodStatus {
  switch (p.status) {
    case 'Ready':
      return 'running'
    case 'Running':
      return 'notready'
    case 'Pending':
      return 'pending'
    case 'ContainerCreating':
      return p.reason.startsWith('FailedMount') ? 'crash' : 'creating'
    case 'Terminating':
      return 'terminating'
    case 'Completed':
      return 'completed'
    default:
      return 'crash' // CrashLoopBackOff, ImagePullBackOff, CreateContainerConfigError, Error
  }
}

/** Where a Pod is on its way to Ready, for smooth animation (stageProgress 0..1 inside the stage). */
export type PodStage = 'scheduling' | 'pulling' | 'starting' | 'probing' | 'ready' | 'backoff' | 'blocked' | 'terminating' | 'completed' | 'failed'

export interface PodView {
  id: string
  owner: string
  /** kubectl STATUS column text (Running, Pending, ContainerCreating, ImagePullBackOff, …) */
  status: string
  kitStatus: KitPodStatus
  ready: boolean
  restarts: number
  tag: string
  broken: boolean
  newVersion: boolean
  ageS: number
  reason: string
  secretValue: string | null
  secretSource: PodRT['secretSource']
  terminating: boolean
  /** belongs to the ReplicaSet of the current Pod template */
  current: boolean
  stage: PodStage
  stageProgress: number
  /** the image was already on the node (no pull: a warm ReplicaSet or an image that ran before) */
  pulledFromCache: boolean
}

export function podStatusText(p: PodRT): PodStatus | string {
  if (p.status === 'Ready') return 'Running'
  return p.status
}

function tagInfo(state: GitOpsState, image: string) {
  const tag = parseImage(image).tag
  const info = imageInfo(state, image)
  return { tag, broken: !info || info.behaviour !== 'ok', newVersion: tag !== state.baselineTag }
}

function podStage(state: GitOpsState, p: PodRT): { stage: PodStage; stageProgress: number; pulledFromCache: boolean } {
  const T = state.cfg.pod
  const t = state.t
  const rs = p.ownerKind === 'ReplicaSet' ? state.cluster.replicaSets.find((r) => r.name === p.owner) : undefined
  const cached = rs?.warm ?? state.cluster.imageCache.includes(p.image)
  const frac = (num: number, den: number) => (den > 0 ? clamp01(num / den) : 1)
  const r = (stage: PodStage, stageProgress: number) => ({ stage, stageProgress: Math.round(stageProgress * 100) / 100, pulledFromCache: cached })
  switch (p.status) {
    case 'Pending':
      return r('scheduling', frac(t - p.since, T.scheduleS))
    case 'ContainerCreating':
      if (p.reason.startsWith('FailedMount')) return r('blocked', 0)
      if (p.pullUntil === null) return r('pulling', 0)
      return r('pulling', cached ? 1 : frac(T.pullS - (p.pullUntil - t), T.pullS))
    case 'Running':
      if (p.startedAt !== null && t - p.startedAt < T.appStartS) return r('starting', frac(t - p.startedAt, T.appStartS))
      return r('probing', frac(T.probePeriodS - (p.nextProbeAt - t), T.probePeriodS))
    case 'Ready':
      return r('ready', 1)
    case 'CrashLoopBackOff':
    case 'ImagePullBackOff':
      return r('backoff', frac(t - p.since, p.nextRetryAt - p.since))
    case 'CreateContainerConfigError':
      return r('blocked', 0)
    case 'Terminating':
      return r('terminating', frac(t - p.since, T.terminationS))
    case 'Completed':
      return r('completed', 1)
    default:
      return r('failed', 1)
  }
}

function externalKitStatus(p: ExternalPod): KitPodStatus {
  if (p.terminating || p.status === 'Terminating') return 'terminating'
  if (p.status === 'Running') return p.ready ? 'running' : 'notready'
  if (p.status === 'Pending') return 'pending'
  if (p.status === 'ContainerCreating' || p.status === 'PodInitializing') return 'creating'
  if (p.status === 'Completed') return 'completed'
  return 'crash'
}

function externalStage(p: ExternalPod): PodStage {
  const k = externalKitStatus(p)
  if (k === 'running') return 'ready'
  if (k === 'notready') return 'probing'
  if (k === 'pending') return 'scheduling'
  if (k === 'creating') return 'pulling'
  if (k === 'terminating') return 'terminating'
  if (k === 'completed') return 'completed'
  return /BackOff|ErrImagePull/.test(p.status) ? 'backoff' : 'blocked'
}

function externalPodViews(state: GitOpsState, deployment: string): PodView[] {
  const live = state.cluster.objects[objKey('Deployment', deployment)]
  const repo = parseImage(String(live?.fields[PATHS.image] ?? `${KLOPA.registry}:x`)).repo
  return externalPods(state, deployment).map((p) => {
    const kitStatus = externalKitStatus(p)
    const stage = externalStage(p)
    return {
      id: p.id,
      owner: deployment,
      status: p.terminating ? 'Terminating' : p.status,
      kitStatus,
      ready: p.ready && !p.terminating,
      restarts: p.restarts ?? 0,
      ...tagInfo(state, `${repo}:${p.tag}`),
      ageS: round1(p.ageS ?? 0),
      reason: '',
      secretValue: null,
      secretSource: null,
      terminating: kitStatus === 'terminating',
      current: p.current ?? true,
      stage,
      stageProgress: stage === 'ready' || stage === 'completed' ? 1 : 0,
      pulledFromCache: false,
    }
  })
}

/**
 * Pods of a Deployment (default: the main one), terminating ones included. When another engine simulates the Pods
 * (`setExternalWorkload`), the Pods it reported with `setExternalWorkloadStatus({ pods })` are shown instead.
 */
export function podsView(state: GitOpsState, deployment: string = state.mainDeployment): PodView[] {
  if (isExternal(state, deployment)) return externalPodViews(state, deployment)
  const live = state.cluster.objects[objKey('Deployment', deployment)]
  const currentRs = live ? `${deployment}-${templateHash(live.fields)}` : ''
  return deploymentPods(state, deployment).map((p) => ({
    id: p.id,
    owner: p.owner,
    status: podStatusText(p),
    kitStatus: kitPodStatus(p),
    ready: p.ready,
    restarts: p.restarts,
    ...tagInfo(state, p.image),
    ageS: round1(state.t - p.createdAt),
    reason: p.reason,
    secretValue: p.secretValue,
    secretSource: p.secretSource,
    terminating: p.status === 'Terminating',
    current: p.owner === currentRs,
    ...podStage(state, p),
  }))
}

/** Capacity: ready Pods / spec.replicas of a Deployment (0 when it is missing; ratio never NaN). */
export function capacity(state: GitOpsState, deployment: string = state.mainDeployment) {
  const live = state.cluster.objects[objKey('Deployment', deployment)]
  const desired = live ? (asCount(live.fields[PATHS.replicas]) ?? 1) : 0
  let ready: number
  if (isExternal(state, deployment)) {
    const pods = externalPods(state, deployment)
    ready = pods.length ? pods.filter((p) => p.ready && !p.terminating).length : (state.cluster.deployments[deployment]?.status.readyReplicas ?? 0)
  } else ready = deploymentPods(state, deployment).filter((p) => p.ready).length
  return { ready, desired, ratio: desired > 0 ? ready / desired : 0, endpoints: ready }
}

export function liveImageTag(state: GitOpsState, deployment: string = state.mainDeployment): string | null {
  const live = state.cluster.objects[objKey('Deployment', deployment)]
  return live ? parseImage(String(live.fields[PATHS.image] ?? '')).tag : null
}

export function gitImageTag(state: GitOpsState, deployment: string = state.mainDeployment): string | null {
  for (const m of Object.values(headCommit(state.repo).files)) if (m.kind === 'Deployment' && m.name === deployment) return parseImage(String(m.fields[PATHS.image] ?? '')).tag
  return null
}

// ─── Resource tree ───────────────────────────────────────────────────────────

export interface TreeNode {
  id: string
  parentId: string | null
  kind: Kind | 'Application' | 'ReplicaSet' | 'Pod'
  name: string
  /** sync status (only objects from Git) */
  sync: SyncCode | null
  health: HealthCode | null
  /** short status text (Pod STATUS column, „zahtijeva brisanje”, „3/4”…) */
  status: string
  requiresPruning: boolean
  /** image tag for ReplicaSets/Pods/Deployments */
  tag?: string
  /** image that can never run (crash or missing) → rose colour */
  broken?: boolean
  /** tag differs from the version running when the sim started → violet (v2) */
  newVersion?: boolean
  ready?: boolean
  revision?: number
}

/**
 * Argo CD resource tree: Application → resources → ReplicaSets → Pods (+ owned Secrets, hook Jobs). A Deployment whose
 * Pods another engine simulates lists the reported Pods directly under the Deployment (no ReplicaSet nodes).
 */
export function resourceTree(state: GitOpsState): TreeNode[] {
  const a = state.argo
  const out: TreeNode[] = []
  const root = `Application/${a.appName}`
  out.push({ id: root, parentId: null, kind: 'Application', name: a.appName, sync: state.mode === 'pull' ? a.sync.status : null, health: state.mode === 'pull' ? a.health.status : null, status: '', requiresPruning: false })
  const statusByKey = new Map(a.resources.map((r) => [r.key, r]))
  const keys = new Set<string>([...a.resources.map((r) => r.key)])
  for (const o of Object.values(state.cluster.objects)) if (o.managed || o.hook) keys.add(o.key)
  for (const key of [...keys].sort()) {
    const r = statusByKey.get(key)
    const live = state.cluster.objects[key]
    const kind = (r?.kind ?? live?.kind) as Kind
    const name = r?.name ?? live?.name ?? key
    const h = live ? objectHealth(state, key) : { status: 'Missing' as HealthCode, message: '' }
    const node: TreeNode = { id: key, parentId: root, kind, name, sync: r?.status ?? null, health: h.status, status: r?.requiresPruning ? 'zahtijeva brisanje' : live ? '' : 'nema u klasteru', requiresPruning: r?.requiresPruning ?? false }
    if (live?.hook) node.status = `${live.hook} hook`
    if (kind === 'Deployment' && live) {
      const img = String(live.fields[PATHS.image] ?? '')
      Object.assign(node, tagInfo(state, img))
      const rt = state.cluster.deployments[name]
      node.status = rt ? `${rt.status.readyReplicas}/${asCount(live.fields[PATHS.replicas]) ?? 1}` : ''
    }
    out.push(node)
    if (kind === 'Deployment' && live && isExternal(state, name)) {
      for (const p of podsView(state, name)) out.push({ id: `Pod/${p.id}`, parentId: key, kind: 'Pod', name: p.id, sync: null, health: p.terminating ? null : p.ready ? 'Healthy' : p.kitStatus === 'crash' ? 'Degraded' : 'Progressing', status: p.status, requiresPruning: false, ready: p.ready, tag: p.tag, broken: p.broken, newVersion: p.newVersion })
    } else if (kind === 'Deployment') {
      for (const rs of state.cluster.replicaSets.filter((x) => x.deployment === name)) {
        const pods = state.cluster.pods.filter((p) => p.owner === rs.name)
        if (rs.replicas === 0 && pods.length === 0) continue
        out.push({ id: `ReplicaSet/${rs.name}`, parentId: key, kind: 'ReplicaSet', name: rs.name, sync: null, health: null, status: `${pods.filter((p) => p.ready).length}/${rs.replicas}`, requiresPruning: false, revision: rs.revision, ...tagInfo(state, rs.image) })
        for (const p of pods) out.push(podNode(state, p, `ReplicaSet/${rs.name}`))
      }
    }
    if ((kind === 'SealedSecret' || kind === 'ExternalSecret') && live) {
      const sec = Object.values(state.cluster.objects).find((o) => o.ownerKey === key)
      const st = controllerStatusOf(state, key)
      if (st && !st.ok) node.status = st.message
      if (sec) out.push({ id: sec.key, parentId: key, kind: 'Secret', name: sec.name, sync: null, health: null, status: '', requiresPruning: false })
    }
    if (kind === 'HorizontalPodAutoscaler' && live && h.status !== 'Healthy') node.status = h.message
    if (kind === 'Job' && live) {
      for (const p of state.cluster.pods.filter((x) => x.ownerKind === 'Job' && x.owner === name)) out.push(podNode(state, p, key))
    }
  }
  return out
}

function podNode(state: GitOpsState, p: PodRT, parentId: string): TreeNode {
  return {
    id: `Pod/${p.id}`,
    parentId,
    kind: 'Pod',
    name: p.id,
    sync: null,
    health: p.status === 'Ready' || p.status === 'Completed' ? 'Healthy' : p.status === 'Terminating' ? null : p.status === 'Pending' || p.status === 'ContainerCreating' || p.status === 'Running' ? 'Progressing' : 'Degraded',
    status: podStatusText(p),
    requiresPruning: false,
    ready: p.ready,
    ...tagInfo(state, p.image),
  }
}

// ─── Git ─────────────────────────────────────────────────────────────────────

export interface CommitNode {
  sha: string
  short: string
  parent: string | null
  message: string
  author: string
  t: number
  lane: 'human' | 'bot' | 'attacker'
  kind: Commit['kind']
  signed: boolean
  trusted: boolean
  isHead: boolean
  /** Argo CD has resolved this revision (knownRevision) */
  isKnown: boolean
  /** the revision the cluster currently corresponds to (`deployedRevision`) */
  isDeployed: boolean
  revertOf: string | null
  revertedBy: string | null
  changes: Commit['changes']
  seenAt: number | null
  syncedAt: number | null
  healthyAt: number | null
}

const laneOf = (c: Commit): CommitNode['lane'] => (c.author === KLOPA.ciBot ? 'bot' : c.kind === 'attack' ? 'attacker' : 'human')

/**
 * The revision the cluster currently corresponds to: the newer of the last successful sync operation and the last
 * commit that became Synced without one (a revert that restores what already runs, a commit of a value kubectl had set).
 * null in push mode (no Argo CD) or when nothing was ever synced.
 */
export function deployedRevision(state: GitOpsState): string | null {
  if (state.mode !== 'pull') return null
  const lo = state.argo.lastOperation
  let best: { sha: string; t: number } | null = lo && lo.phase === 'Succeeded' && lo.finishedAt !== null ? { sha: lo.revision, t: lo.finishedAt } : null
  for (const c of state.repo.commits) if (c.syncedAt !== null && (!best || c.syncedAt > best.t + 1e-9)) best = { sha: c.sha, t: c.syncedAt }
  return best?.sha ?? null
}

/** Commit graph, newest first. */
export function commitGraph(state: GitOpsState, limit = 30): CommitNode[] {
  const repo = state.repo
  const a = state.argo
  const deployed = deployedRevision(state)
  return [...repo.commits]
    .reverse()
    .slice(0, limit)
    .map((c) => ({
      sha: c.sha,
      short: c.short,
      parent: c.parent,
      message: c.message,
      author: c.author,
      t: c.t,
      lane: laneOf(c),
      kind: c.kind,
      signed: c.signature !== null,
      trusted: isTrusted(repo, c),
      isHead: c.sha === repo.head,
      isKnown: c.sha === a.knownRevision,
      isDeployed: c.sha === deployed,
      revertOf: c.revertOf ?? null,
      revertedBy: repo.commits.find((x) => x.revertOf === c.sha)?.sha ?? null,
      changes: c.changes,
      seenAt: c.seenAt,
      syncedAt: c.syncedAt,
      healthyAt: c.healthyAt,
    }))
}

/** Real seconds of „seen” after a commit: a poll is compressed ÷10, a webhook / manual refresh is real time. */
function seenRealS(c: Commit): number | null {
  if (c.seenAt === null) return null
  return (c.seenAt - c.t) * (c.seenVia === 'poll' ? REAL_FACTOR.poll : 1)
}

/**
 * Seconds from commit to: seen by Argo CD, sync started, synced, healthy (null = not yet), in sim seconds, plus `realS`
 * – the same moments in real time (the poll wait ×10; everything after it runs in real time). `compressed` is true when
 * the two differ, so a UI must show „X s (sim) · stvarno: Y”.
 */
export function commitLatency(state: GitOpsState, sha: string = state.repo.head) {
  const c = findCommit(state.repo, sha)
  if (!c) return null
  const d = (x: number | null) => (x === null ? null : round1(x - c.t))
  const seenReal = seenRealS(c)
  const real = (x: number | null) => (x === null || c.seenAt === null || seenReal === null ? (x === null ? null : round1(x - c.t)) : round1(seenReal + (x - c.seenAt)))
  return {
    seen: d(c.seenAt),
    seenVia: c.seenVia,
    syncStarted: d(c.syncStartedAt),
    synced: d(c.syncedAt),
    healthy: d(c.healthyAt),
    realS: { seen: seenReal === null ? null : round1(seenReal), syncStarted: real(c.syncStartedAt), synced: real(c.syncedAt), healthy: real(c.healthyAt) },
    compressed: c.seenVia === 'poll',
  }
}

const STATION_ORDER: StationId[] = ['ci', 'commit', 'seen', 'outOfSync', 'syncStarted', 'applied', 'rsCreated', 'firstScheduled', 'imagePulled', 'firstReady', 'allReady', 'healthy']

/** Croatian names of the „Put jednog commita” stations. */
export const STATION_LABELS: Record<StationId, string> = {
  ci: 'CI: izgradnja, testovi, push slike',
  commit: 'commit u config repozitorij',
  seen: 'Argo CD vidi commit',
  outOfSync: 'OutOfSync',
  syncStarted: 'sinkronizacija počinje',
  applied: 'primijenjeno na API poslužitelj',
  rsCreated: 'novi ReplicaSet',
  firstScheduled: 'prvi Pod raspoređen na čvor',
  imagePulled: 'kubelet je povukao sliku',
  firstReady: 'prvi Pod spreman',
  allReady: 'svi Podovi spremni',
  healthy: 'Synced i Healthy',
}

export interface TimelineStation {
  station: StationId
  label: string
  /** sim time of the station */
  t: number
  /** sim seconds since the commit (CI stations are negative) */
  sinceCommitS: number
  /** real seconds since the start of the journey (CI start, or the commit): compressed segments scaled back */
  realS: number
  /** sim seconds since the start of the journey */
  simS: number
  /** this station's segment was compressed (CI ×60, Git polling ×10) */
  compressed: boolean
  /** „35 s (sim) · stvarno ≈ 10 min 25 s” or „25 s” */
  text: string
}

/**
 * L24 „Put jednog commita”: the stations one commit passed, in order, with sim and real time. Segments: CI (10 s sim ↔
 * ~10 min real), Git polling (÷10; a webhook is real time); sync, rollout and Pods run in real time. Empty for an
 * unknown sha. Stations stamped once (first time wins); a commit synced without changes has no rollout stations.
 */
export function commitTimeline(state: GitOpsState, sha: string = state.repo.head): TimelineStation[] {
  const c = findCommit(state.repo, sha)
  if (!c) return []
  const present = STATION_ORDER.filter((s) => c.stations[s] !== undefined).map((s) => ({ s, t: c.stations[s] as number }))
  present.sort((x, y) => x.t - y.t || STATION_ORDER.indexOf(x.s) - STATION_ORDER.indexOf(y.s))
  if (present.length === 0) return []
  const start = present[0].t
  let real = 0
  let prevT = start
  let compressedSoFar = false
  return present.map(({ s, t }) => {
    const factor = s === 'commit' && c.stations.ci !== undefined ? REAL_FACTOR.ci : s === 'seen' && c.seenVia === 'poll' ? REAL_FACTOR.poll : 1
    real += (t - prevT) * factor
    prevT = t
    const compressed = factor !== 1 && t > start
    compressedSoFar ||= compressed
    const simS = round1(t - start)
    return {
      station: s,
      label: STATION_LABELS[s],
      t,
      sinceCommitS: round1(t - c.t),
      realS: round1(real),
      simS,
      compressed,
      text: compressedSoFar ? `${fmtS(simS)} (sim) · stvarno ≈ ${fmtS(real)}` : fmtS(simS),
    }
  })
}

export type DeliveryHop = 'refresh' | 'sync' | 'queued' | 'rollout' | 'done' | 'blocked' | 'superseded' | 'notDeployed'

export interface DeliveryItem {
  /** commit sha – stable id for animation */
  id: string
  short: string
  message: string
  author: string
  lane: 'human' | 'bot' | 'attacker'
  /**
   * refresh = travelling Git → Argo CD; sync = Argo CD → API server; queued = HEAD waits behind an operation for an older
   * revision (retrying or waiting for a hook – „Prekini” stops it); rollout = new Pods; done = deployed (and Healthy)
   */
  hop: DeliveryHop
  /** 0..1 along the current hop (linear in time for refresh) */
  progress: number
  /** short Croatian status line */
  text: string
  /** for `queued`: the operation this commit waits for */
  blockedBy: { revision: string; retryCount: number; nextRetryInS: number | null } | null
}

/** Rollout state of the main Deployment for the deployed revision's hop. */
function rolloutOf(state: GitOpsState): { hop: DeliveryHop; progress: number; text: string } {
  const name = state.mainDeployment
  const key = objKey('Deployment', name)
  const live = state.cluster.objects[key]
  if (!live) return { hop: 'blocked', progress: 0, text: `Deployment ${name} ne postoji u klasteru` }
  const h = objectHealth(state, key)
  const desired = asCount(live.fields[PATHS.replicas]) ?? 1
  if (h.status === 'Healthy') return { hop: 'done', progress: 1, text: state.argo.sync.status === 'Synced' && state.argo.health.status === 'Healthy' ? 'Synced i Healthy' : 'postavljen' }
  if (h.status === 'Suspended') return { hop: 'blocked', progress: 0, text: 'uvođenje pauzirano (Suspended)' }
  if (h.status === 'Degraded') return { hop: 'blocked', progress: 0, text: 'uvođenje zapelo (ProgressDeadlineExceeded) – Synced, ali Degraded' }
  let ready: number
  if (isExternal(state, name)) {
    const pods = externalPods(state, name)
    const st = state.cluster.deployments[name]?.status
    ready = pods.length ? pods.filter((p) => (p.current ?? true) && p.ready && !p.terminating).length : Math.min(st?.updatedReplicas ?? 0, st?.availableReplicas ?? 0)
  } else {
    const newRs = `${name}-${templateHash(live.fields)}`
    ready = state.cluster.pods.filter((p) => p.owner === newRs && p.ready && p.status !== 'Terminating').length
  }
  return { hop: 'rollout', progress: desired > 0 ? clamp01(ready / desired) : 1, text: 'uvođenje novih Podova' }
}

/**
 * The newest commits on their way from Git to running Pods (newest first) – drives the commit-dot animation of L22
 * „Od commita do sinkronizacije” and L24 „Put jednog commita”. A commit is deployed when it is `deployedRevision` (or an
 * ancestor of it) – also when it became Synced without a sync operation.
 */
export function deliveryView(state: GitOpsState, limit = 5): DeliveryItem[] {
  const a = state.argo
  const repo = state.repo
  const t = state.t
  const deployedRev = deployedRevision(state)
  const deployed = new Set(deployedRev ? ancestry(repo, deployedRev).map((c) => c.sha) : [])
  const op = a.operation
  const out: DeliveryItem[] = []
  for (const c of [...repo.commits].reverse().slice(0, limit)) {
    const item = (hop: DeliveryHop, progress: number, text: string, blockedBy: DeliveryItem['blockedBy'] = null): DeliveryItem => ({ id: c.sha, short: c.short, message: c.message, author: c.author, lane: laneOf(c), hop, progress, text, blockedBy })
    const isHead = c.sha === repo.head
    const headBlocked = isHead && (a.integrityError !== null || a.renderError !== null)
    if (state.mode !== 'pull') {
      out.push(item('notDeployed', 0, 'model guranja: Git ne pokreće postavljanje'))
    } else if (c.sha === deployedRev) {
      const r = rolloutOf(state)
      out.push(item(r.hop, r.progress, r.text))
    } else if (op && op.revision === c.sha && !headBlocked) {
      const within: Record<string, number> = { start: 0.1, apply: 0.4, delay: 0.6, wait: 0.75, prune: 0.95, retryWait: 0.2, done: 1 }
      const progress = clamp01((op.stepIdx + (within[op.stage] ?? 0)) / Math.max(1, op.steps.length))
      out.push(item('sync', progress, op.stage === 'retryWait' ? `ponovni pokušaj #${op.retryCount}` : 'sinkronizacija u tijeku'))
    } else if (deployed.has(c.sha)) {
      out.push(item('done', 1, 'uključen u postavljenu reviziju'))
    } else if (!isHead) {
      out.push(item('superseded', 0, 'ide zajedno s novijim commitom (Argo CD sinkronizira najnoviji)'))
    } else if (c.seenAt === null) {
      const due = a.webhookRefreshAt ?? a.nextPollAt
      const progress = clamp01((t - c.t) / Math.max(0.001, due - c.t))
      out.push(item('refresh', progress, a.webhookRefreshAt !== null ? 'webhook javlja Argo CD-u' : `čeka redovitu provjeru Gita (još ${fmtS(Math.max(0, a.nextPollAt - t))})`))
    } else if (headBlocked) {
      out.push(item('blocked', 0, a.integrityError ? 'blokiran: commit nije potpisan pouzdanim ključem' : 'blokiran: ComparisonError'))
    } else if (op) {
      const next = op.nextRetryAt === null ? null : round1(Math.max(0, op.nextRetryAt - t))
      const why = op.stage === 'retryWait' ? `operacija za ${op.revision.slice(0, 7)} se ponavlja (pokušaj #${op.retryCount}${next === null ? '' : `, sljedeći za ${fmtS(next)}`})` : `operacija za ${op.revision.slice(0, 7)} još traje`
      out.push(item('queued', 0, `čeka: ${why} – „Prekini” je zaustavlja`, { revision: op.revision, retryCount: op.retryCount, nextRetryInS: next }))
    } else if (a.lastOperation && a.lastOperation.revision === c.sha && a.lastOperation.phase !== 'Succeeded') {
      out.push(item('blocked', 0, 'sinkronizacija nije uspjela'))
    } else {
      out.push(item('sync', 0, a.policy.automated ? 'OutOfSync – automatska sinkronizacija kreće' : 'OutOfSync – čeka ručnu sinkronizaciju'))
    }
  }
  return out
}

/** Argo CD history (newest first) with commit messages – the deployment history. */
export function deployHistory(state: GitOpsState) {
  return [...state.argo.history].reverse().map((h) => {
    const c = findCommit(state.repo, h.revision)
    return { ...h, short: h.revision.slice(0, 7), message: c?.message ?? '', author: c?.author ?? '' }
  })
}

/** Does the live cluster match Git HEAD right now? (independent of Argo CD – also answers it for the push model) */
export function gitMatchesCluster(state: GitOpsState): { matches: boolean; diffs: DiffEntry[] } {
  const r = renderTarget(state, state.repo.head)
  // every difference counts here, including fields Argo CD is told to ignore
  const { diffs } = computeComparison(state, r.target)
  return { matches: diffs.length === 0, diffs }
}

export interface RepoFile {
  path: string
  kind: Kind
  name: string
  /** under the Application path → rendered and deployed by Argo CD */
  inAppPath: boolean
  /** what the given commit did to the file (null = unchanged) */
  change: 'added' | 'removed' | 'modified' | null
}

/** File tree of the config repo at a revision (default HEAD), sorted by path; files the commit removed are included. */
export function repoFiles(state: GitOpsState, sha: string = state.repo.head): RepoFile[] {
  const c = findCommit(state.repo, sha)
  if (!c) return []
  const changes = new Map(c.changes.map((ch) => [ch.path, ch.change]))
  const out: RepoFile[] = Object.entries(c.files).map(([path, m]) => ({ path, kind: m.kind, name: m.name, inAppPath: path.startsWith(`${state.repo.appPath}/`), change: changes.get(path) ?? null }))
  const parent = c.parent ? findCommit(state.repo, c.parent) : undefined
  for (const ch of c.changes) {
    const m = parent?.files[ch.path]
    if (ch.change === 'removed' && m) out.push({ path: ch.path, kind: m.kind, name: m.name, inAppPath: ch.path.startsWith(`${state.repo.appPath}/`), change: 'removed' })
  }
  return out.sort((x, y) => x.path.localeCompare(y.path))
}

// ─── YAML view ───────────────────────────────────────────────────────────────

type YamlNode = FieldValue | YamlNode[] | { [k: string]: YamlNode }

const YAML_PLAIN = /^[A-Za-z0-9_./$<(][^#]*$/

function yamlScalar(v: FieldValue): string {
  if (typeof v !== 'string') return String(v)
  const risky =
    v === '' ||
    v !== v.trim() ||
    !YAML_PLAIN.test(v) ||
    /: |:$| #/.test(v) ||
    /^(true|false|yes|no|on|off|null|~)$/i.test(v) ||
    /^[-+]?(\d[\d_]*)?(\.\d*)?([eE][-+]?\d+)?$/.test(v) ||
    /^0x[0-9a-f]+$/i.test(v)
  return risky ? JSON.stringify(v) : v
}

function yamlLines(node: YamlNode, indent: number): string[] {
  const pad = ' '.repeat(indent)
  if (Array.isArray(node)) {
    const out: string[] = []
    for (const item of node) {
      if (item === undefined) continue
      if (typeof item !== 'object') out.push(`${pad}- ${yamlScalar(item)}`)
      else {
        const inner = yamlLines(item, indent + 2)
        if (inner.length) out.push(`${pad}- ${inner[0].slice(indent + 2)}`, ...inner.slice(1))
        else out.push(`${pad}- {}`)
      }
    }
    return out
  }
  if (typeof node !== 'object') return [`${pad}${yamlScalar(node)}`]
  const out: string[] = []
  for (const [k, v] of Object.entries(node)) {
    if (typeof v !== 'object') out.push(`${pad}${k}: ${yamlScalar(v)}`)
    else if (Array.isArray(v)) out.push(`${pad}${k}:`, ...yamlLines(v, indent)) // kubectl style: list items at the key's indent
    else out.push(`${pad}${k}:`, ...yamlLines(v, indent + 2))
  }
  return out
}

/**
 * A manifest as YAML (file view, L24 repo editor, `argocd app diff` context): apiVersion, kind, metadata (namespace,
 * sync-wave / hook annotations), then every JSON-pointer field as nested maps and lists, in the manifest's field order.
 */
export function manifestToYaml(m: Manifest): string {
  const root: Record<string, YamlNode> = { apiVersion: API_VERSIONS[m.kind], kind: m.kind }
  const meta: Record<string, YamlNode> = { name: m.name }
  if (m.namespace) meta.namespace = m.namespace
  const ann: Record<string, YamlNode> = {}
  if (m.hook) ann['argocd.argoproj.io/hook'] = m.hook
  if (m.wave !== undefined && m.wave !== 0) ann['argocd.argoproj.io/sync-wave'] = String(m.wave)
  if (Object.keys(ann).length) meta.annotations = ann
  root.metadata = meta
  for (const [pointer, value] of Object.entries(m.fields)) {
    const segs = pointer.split('/').slice(1).map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
    let cur: YamlNode = root
    segs.forEach((seg, i) => {
      const last = i === segs.length - 1
      const nextIsIndex = !last && /^\d+$/.test(segs[i + 1])
      const container = cur as Record<string, YamlNode> | YamlNode[]
      const key: string | number = Array.isArray(container) ? Number(seg) : seg
      if (last) {
        ;(container as Record<string | number, YamlNode>)[key] = value
        return
      }
      let child = (container as Record<string | number, YamlNode>)[key]
      if (child === undefined || typeof child !== 'object') {
        child = nextIsIndex ? [] : {}
        ;(container as Record<string | number, YamlNode>)[key] = child
      }
      cur = child
    })
  }
  return yamlLines(root, 0).join('\n') + '\n'
}

// ─── HPA ─────────────────────────────────────────────────────────────────────

/** HPA status for UIs: conditions as `kubectl describe hpa` shows them and the Argo CD health derived from them. */
export function hpaView(state: GitOpsState, name: string = state.mainDeployment) {
  const live = state.cluster.objects[objKey('HorizontalPodAutoscaler', name)]
  const rt = state.cluster.hpas[name]
  if (!live || !rt) return null
  const conditions: HpaCondition[] = rt.conditions.map((c) => ({ ...c }))
  return {
    name,
    target: String(live.fields[PATHS.hpaTarget] ?? name),
    min: asCount(live.fields[PATHS.hpaMin]) ?? 1,
    max: asCount(live.fields[PATHS.hpaMax]) ?? 1,
    desired: rt.lastDesired,
    nextEvalInS: round1(Math.max(0, rt.nextEvalAt - state.t)),
    external: rt.external,
    conditions,
    health: hpaHealth(conditions),
  }
}

/** Tug of war between Argo CD and the HPA over spec.replicas. */
export function replicaFight(state: GitOpsState) {
  const live = state.cluster.objects[objKey('Deployment', state.mainDeployment)]
  const target = state.argo.target[objKey('Deployment', state.mainDeployment)]
  const hpa = state.cluster.hpas[state.mainDeployment]
  return {
    fights: state.stats.replicaFights,
    lastFightAt: state.stats.lastFightAt,
    /** one-time drops to the API default (spec.replicas removed from Git without the migration step) – not fights */
    drops: state.stats.replicaDrops,
    writes: state.cluster.replicaWrites.slice(-20),
    liveReplicas: typeof live?.fields[PATHS.replicas] === 'number' ? Number(live.fields[PATHS.replicas]) : null,
    gitReplicas: typeof target?.fields[PATHS.replicas] === 'number' ? Number(target.fields[PATHS.replicas]) : null,
    hpaDesired: hpa?.lastDesired ?? null,
    replicasInGit: target ? PATHS.replicas in target.fields : false,
    ignoreDifferences: state.argo.ignoreDifferences.some((r) => r.kind === 'Deployment' && r.jsonPointers.includes(PATHS.replicas)),
    respectIgnoreDifferences: state.argo.policy.respectIgnoreDifferences,
  }
}

// ─── L22 goals („Zadaci”) ────────────────────────────────────────────────────

/**
 * The four L22 tasks computed from the state, so every UI judges them the same way.
 * - shipped: `tag` runs on every ready Pod, app Synced + Healthy, and no `kubectl set image` was used
 * - driftReverted: selfHeal reverted at least one MANUAL (kubectl) change – reverts of the HPA's writes do not count
 * - badCommitReverted: a broken-image commit was undone with git revert and the app is Healthy again
 * - hpaPeace: HPA present and a fix in place – spec.replicas gone from Git, or ignoreDifferences +
 *   RespectIgnoreDifferences – and the deployed revision is a commit made in this session (after the ignore fix) whose
 *   sync caused no fight, with no fight since and at least one HPA period + 1 s since it synced. The removal commit
 *   itself counts (with the migration step it syncs without touching anything).
 */
export function l22Goals(state: GitOpsState, tag = '2.0.1') {
  const v = appView(state)
  const okApp = v.sync === 'Synced' && v.health === 'Healthy'
  const ready = podsView(state).filter((p) => p.ready && !p.terminating)
  const shipped = okApp && ready.length > 0 && ready.every((p) => p.tag === tag) && state.stats.kubectlImageChanges === 0
  const repo = state.repo
  const badCommitReverted =
    okApp &&
    repo.commits.some((c) => {
      if (c.kind !== 'revert' || !c.revertOf) return false
      const target = findCommit(repo, c.revertOf)
      const img = target?.changes.flatMap((ch) => ch.fields).find((f) => f.path === PATHS.image)?.after
      const info = typeof img === 'string' ? imageInfo(state, img) : null
      return typeof img === 'string' && (!info || info.behaviour !== 'ok')
    })
  const f = replicaFight(state)
  const hpaPresent = Boolean(state.cluster.objects[objKey('HorizontalPodAutoscaler', state.mainDeployment)])
  const fixAt = state.stats.hpaIgnoreFixAt
  const byGit = !f.replicasInGit
  const byIgnore = f.ignoreDifferences && f.respectIgnoreDifferences && fixAt !== null
  const depRev = deployedRevision(state)
  const c = depRev ? findCommit(repo, depRev) : undefined
  const since = c ? (c.syncStartedAt ?? c.syncedAt) : null
  const quiet = since !== null && (f.lastFightAt === null || f.lastFightAt < since - 1e-9)
  const settled = c !== undefined && c.syncedAt !== null && state.t - c.syncedAt >= state.cfg.hpaPeriodS + 1 - 1e-9
  const recent = c !== undefined && c.t >= 0 && (byGit || (fixAt !== null && c.t >= fixAt - 1e-9))
  const hpaPeace = hpaPresent && (byGit || byIgnore) && quiet && settled && recent
  return { shipped, driftReverted: state.stats.kubectlDriftsReverted > 0, badCommitReverted, hpaPeace }
}

// ─── Security („pull moves the keys”) ────────────────────────────────────────

export interface DeployPath {
  who: string
  how: string
  /** where the credential lives */
  where: 'ci' | 'cluster' | 'git'
  /** a control limits this path */
  guarded: boolean
  guard: string
}

/** Who can change production and through which credential. */
export function deployPaths(state: GitOpsState): DeployPath[] {
  const p = state.repo.protection
  const pr = state.argo.project
  if (state.mode === 'push') {
    return [{ who: 'CI pipeline', how: 'trajni kubeconfig s pravima administratora klastera u tajnama CI-ja', where: 'ci', guarded: false, guard: 'nema – tko dobije ključ, mijenja produkciju; odstupanje nitko ne primjećuje' }]
  }
  const repoGuard = [p.requirePullRequest ? 'obavezan pull request s pregledom' : '', p.requireSignedCommits ? 'potpisani commitovi' : '', pr.sourceIntegrity !== 'none' ? `sourceIntegrity (${pr.sourceIntegrity})` : ''].filter(Boolean)
  return [
    { who: 'svatko tko smije spremiti u main', how: 'commit u config repozitorij', where: 'git', guarded: repoGuard.length > 0, guard: repoGuard.length ? repoGuard.join(', ') : 'nema zaštite grane – ključ je sada pristup repozitoriju' },
    { who: 'Argo CD', how: 'ServiceAccount u klasteru (široka prava)', where: 'cluster', guarded: pr.restricted, guard: pr.restricted ? 'AppProject: samo namespace klopa, bez resursa na razini klastera' : 'projekt default dopušta sve' },
    { who: 'CI pipeline', how: 'token samo za config repozitorij (bez ključa klastera)', where: 'ci', guarded: p.requirePullRequest, guard: p.requirePullRequest ? 'može samo otvoriti pull request' : 'može izravno u main' },
  ]
}

/** Would the current HEAD pass the AppProject source-integrity check? */
export function integrityStatus(state: GitOpsState) {
  const err = checkSourceIntegrity(state.repo, state.repo.head, state.argo.project.sourceIntegrity)
  return { mode: state.argo.project.sourceIntegrity, ok: err === null, message: err }
}

// ─── Secrets (L23) ───────────────────────────────────────────────────────────

/**
 * Readable secret values in Argo CD's repo-server/Redis manifest cache: rendered by a plain Secret from Git,
 * argocd-vault-plugin or KSOPS within the cache lifetime (`TIMINGS.argoCacheExpiry`: 12 min sim ↔ 24 h real; the current
 * render is renewed at every refresh, so it never expires while in use). `valid` = still the store's current value.
 */
export function argoCacheView(state: GitOpsState) {
  const exp = state.cfg.argoCacheExpiryS
  const current = new Set(Object.values(state.secrets.store.values))
  return Object.entries(state.argo.plaintextCache)
    .filter(([, at]) => state.t - at <= exp + 1e-9)
    .map(([value, at]) => ({ value, renderedAt: at, expiresInS: round1(Math.max(0, at + exp - state.t)), valid: current.has(value) }))
}

/**
 * Values readable from Git history: plain Secret values ever committed (base64 is not encryption), every SealedSecret
 * sealed with a leaked controller key (`sealing.leakedKeyIds`), every SOPS value encrypted for a leaked age key
 * (`sops.leakedRecipients`). Deleting the file or the commit does not help – clones keep it. Only rotation makes a value
 * harmless (`exposedStale`); after a key leak the fix is a NEW key, then rotate and re-seal / re-encrypt.
 * Same rules as E5's „Git-history reader” and „Argo CD Redis” eyes.
 */
export function gitLeaks(state: GitOpsState) {
  const exposed = new Set<string>()
  const sec = state.secrets
  for (const c of everCommitted(state.repo, (m) => m.kind === 'Secret' || m.kind === 'SealedSecret')) {
    for (const m of Object.values(c.files)) {
      if (m.kind === 'Secret') {
        for (const [p, v] of Object.entries(m.fields)) {
          if (!p.startsWith('/data/')) continue
          if (isVaultPlaceholder(v)) continue // an address, not a value
          if (isSopsToken(v)) {
            const plain = sec.sops.ciphertexts[v]
            if (plain !== undefined && sec.sops.leakedRecipients.includes(plain.recipient)) exposed.add(plain.value)
            continue
          }
          exposed.add(String(v))
        }
      }
      if (m.kind === 'SealedSecret') {
        for (const [p, v] of Object.entries(m.fields)) {
          if (!p.startsWith('/spec/encryptedData/')) continue
          const box = sec.sealing.ciphertexts[String(v)]
          if (box && sec.sealing.leakedKeyIds.includes(box.keyId)) exposed.add(box.value)
        }
      }
    }
  }
  const current = new Set(Object.values(sec.store.values))
  const values = [...exposed]
  const cache = argoCacheView(state)
  return {
    exposedValues: values,
    /** exposed AND still valid → the „Git-history reader” eye is red */
    exposedCurrent: values.filter((v) => current.has(v)),
    /** exposed but already rotated → harmless */
    exposedStale: values.filter((v) => !current.has(v)),
    /** Argo CD's cache holds a still-valid readable value (plain Secret from Git, argocd-vault-plugin, KSOPS) → the „Argo CD Redis” eye is red */
    argoCacheHasPlaintext: cache.some((e) => e.valid),
    /** readable values in the cache within its lifetime, valid or not */
    argoCacheValues: cache.map((e) => e.value),
  }
}

/** What each part of the secret pipeline currently holds. */
export function secretView(state: GitOpsState) {
  const sec = state.cluster.objects[objKey('Secret', SMS.secretName)]
  const current = state.secrets.store.values[SMS.remoteKey] ?? null
  const pods = podsView(state).filter((p) => !p.terminating)
  const s = state.secrets
  return {
    storeAvailable: s.store.available,
    storeValue: current,
    clusterSecretExists: Boolean(sec),
    clusterSecretValue: sec ? ((sec.fields[PATHS.data(SMS.secretKey)] as string | undefined) ?? null) : null,
    clusterSecretManaged: sec ? sec.managed : false,
    clusterSecretOwner: sec?.ownerKey ?? null,
    pods: pods.map((p) => ({ id: p.id, status: p.status, value: p.secretValue, source: p.secretSource, stale: p.secretValue !== null && current !== null && p.secretValue !== current })),
    sealing: {
      keys: s.sealing.keys.map((k) => ({ ...k, inCluster: s.sealing.clusterKeyIds.includes(k.id), backedUp: s.sealing.backupKeyIds.includes(k.id), leaked: s.sealing.leakedKeyIds.includes(k.id) })),
      leaked: s.sealing.leaked,
      leakedKeyIds: [...s.sealing.leakedKeyIds],
    },
    sops: { recipient: s.sops.recipient, recipients: [...s.sops.recipients], argoHasKey: s.sops.argoHasKey, leaked: s.sops.leaked, leakedRecipients: [...s.sops.leakedRecipients] },
    plugin: state.argo.sourcePlugin,
  }
}

// ─── CLI output (L24 simulated console) ──────────────────────────────────────

/** Left-aligned columns separated by at least three spaces (kubectl / argocd table printers). */
function table(head: string[], rows: string[][]): string[] {
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)) + 3)
  const line = (r: string[]) => r.map((c, i) => (i === r.length - 1 ? c : c.padEnd(widths[i]))).join('').trimEnd()
  return [line(head), ...rows.map(line)]
}

/** `kubectl get pods -n klopa` (E6's Pods plus Pods reported by an external model) */
export function kubectlGetPods(state: GitOpsState): string[] {
  const rows = state.cluster.pods.map((p) => {
    const ready = p.ownerKind === 'Job' ? '0/1' : p.ready ? '1/1' : '0/1'
    return [p.id, ready, podStatusText(p), String(p.restarts), humanDuration(state.t - p.createdAt)]
  })
  for (const name of Object.keys(state.cluster.external)) {
    for (const p of externalPods(state, name)) rows.push([p.id, p.ready && !p.terminating ? '1/1' : '0/1', p.terminating ? 'Terminating' : p.status, String(p.restarts ?? 0), humanDuration(p.ageS ?? 0)])
  }
  if (rows.length === 0) return [`No resources found in ${KLOPA.namespace} namespace.`]
  return table(['NAME', 'READY', 'STATUS', 'RESTARTS', 'AGE'], rows.sort((a, b) => a[0].localeCompare(b[0])))
}

const lastSeen = (state: GitOpsState, e: KubeEvent) => {
  const ago = humanDuration(state.t - e.t)
  return e.count > 1 ? `${ago} (x${e.count} over ${humanDuration(state.t - e.firstT)})` : ago
}

/** `kubectl get events -n klopa` (oldest first, like `--sort-by=.lastTimestamp`). */
export function kubectlGetEvents(state: GitOpsState, limit = 30): string[] {
  const ev = [...state.cluster.kubeEvents].sort((a, b) => a.t - b.t).slice(-limit)
  if (ev.length === 0) return [`No events found in ${KLOPA.namespace} namespace.`]
  return table(['LAST SEEN', 'TYPE', 'REASON', 'OBJECT', 'MESSAGE'], ev.map((e) => [lastSeen(state, e), e.type, e.reason, e.object, e.message]))
}

/** `kubectl describe pod <id> -n klopa` (abridged: identity, container state, environment, conditions, events). */
export function kubectlDescribePod(state: GitOpsState, podId: string): string[] {
  const p = state.cluster.pods.find((x) => x.id === podId)
  if (!p) return [`Error from server (NotFound): pods "${podId}" not found`]
  const rs = p.ownerKind === 'ReplicaSet' ? state.cluster.replicaSets.find((r) => r.name === p.owner) : undefined
  const tpl = rs?.template ?? {}
  const app = String(tpl[PATHS.templateApp] ?? p.deployment ?? p.owner)
  const state_ =
    p.status === 'Ready' || p.status === 'Running'
      ? ['    State:          Running', `      Started:      ${simDate(p.startedAt ?? p.createdAt)}`]
      : p.status === 'Terminating'
        ? ['    State:          Terminated', '      Reason:       Completed']
        : p.status === 'Completed'
          ? ['    State:          Terminated', '      Reason:       Completed', '      Exit Code:    0']
          : p.status === 'Error'
            ? ['    State:          Terminated', '      Reason:       Error', '      Exit Code:    1']
            : ['    State:          Waiting', `      Reason:       ${p.status === 'Pending' || p.status === 'ContainerCreating' ? 'ContainerCreating' : p.status}`]
  const env: string[] = []
  for (let i = 0; i < 8; i++) {
    const name = tpl[PATHS.envName(i)]
    if (typeof name !== 'string') continue
    const value = tpl[PATHS.envValue(i)]
    const secret = tpl[PATHS.envSecretName(i)]
    env.push(typeof secret === 'string' ? `      ${name}:  <set to the key '${String(tpl[PATHS.envSecretKey(i)] ?? '')}' in secret '${secret}'>  Optional: false` : `      ${name}:  ${fmtValue(value)}`)
  }
  const ready = p.ready ? 'True' : 'False'
  const lines = [
    `Name:             ${p.id}`,
    `Namespace:        ${KLOPA.namespace}`,
    `Node:             ${p.status === 'Pending' ? '<none>' : `cvor-${(p.id.charCodeAt(p.id.length - 1) % 3) + 1}`}`,
    `Start Time:       ${simDate(p.createdAt)}`,
    `Labels:           app=${app}`,
    ...(rs ? [`                  pod-template-hash=${rs.hash}`] : []),
    `Status:           ${p.status === 'Ready' || p.status === 'Running' || p.status === 'CrashLoopBackOff' ? 'Running' : p.status === 'Terminating' ? 'Terminating' : p.status === 'Completed' ? 'Succeeded' : p.status === 'Error' ? 'Failed' : 'Pending'}`,
    `Controlled By:    ${p.ownerKind}/${p.owner}`,
    'Containers:',
    `  ${p.deployment ?? p.owner}:`,
    `    Image:          ${p.image}`,
    ...state_,
    `    Ready:          ${ready}`,
    `    Restart Count:  ${p.restarts}`,
    ...(env.length ? ['    Environment:', ...env] : ['    Environment:    <none>']),
    'Conditions:',
    '  Type              Status',
    `  PodScheduled      ${p.status === 'Pending' ? 'False' : 'True'}`,
    `  Ready             ${ready}`,
    `  ContainersReady   ${ready}`,
    'Events:',
  ]
  if (p.events.length === 0) return [...lines, '  <none>']
  return [...lines, ...table(['  Type', 'Reason', 'Age', 'From', 'Message'], [['  ----', '------', '----', '----', '-------'], ...p.events.map((e) => [`  ${e.type}`, e.reason, e.count > 1 ? `${humanDuration(state.t - e.t)} (x${e.count} over ${humanDuration(state.t - e.firstT)})` : humanDuration(state.t - e.firstT), e.source, e.message])])]
}

/** `kubectl rollout status deployment/<name> -n klopa` – one snapshot of what kubectl would print now. */
export function kubectlRolloutStatus(state: GitOpsState, name: string = state.mainDeployment): string[] {
  const live = state.cluster.objects[objKey('Deployment', name)]
  if (!live) return [`Error from server (NotFound): deployments.apps "${name}" not found`]
  const rt = state.cluster.deployments[name]
  if (!rt || rt.observedGeneration < live.generation) return ['Waiting for deployment spec update to be observed...']
  if (rt.reason === 'ProgressDeadlineExceeded') return [`error: deployment "${name}" exceeded its progress deadline`]
  const n = asCount(live.fields[PATHS.replicas]) ?? 1
  const s = rt.status
  if (s.updatedReplicas < n) return [`Waiting for deployment "${name}" rollout to finish: ${s.updatedReplicas} out of ${n} new replicas have been updated...`]
  if (s.replicas > s.updatedReplicas) return [`Waiting for deployment "${name}" rollout to finish: ${s.replicas - s.updatedReplicas} old replicas are pending termination...`]
  if (s.availableReplicas < s.updatedReplicas) return [`Waiting for deployment "${name}" rollout to finish: ${s.availableReplicas} of ${s.updatedReplicas} updated replicas are available...`]
  return [`deployment "${name}" successfully rolled out`]
}

const groupOf = (k: Kind) => {
  const v = API_VERSIONS[k]
  return v.includes('/') ? v.slice(0, v.indexOf('/')) : ''
}

/**
 * `argocd app diff klopa-api`: for every resource that differs, a header and the changed fields as `<` live / `>` Git
 * (fields hidden by ignoreDifferences are left out, as in the CLI). Empty output = no differences.
 */
export function argocdAppDiff(state: GitOpsState): string[] {
  if (state.mode !== 'pull') return [`FATAL rpc error: code = NotFound desc = applications.argoproj.io "${state.argo.appName}" not found`]
  const out: string[] = []
  const byKey = new Map<string, DiffEntry[]>()
  for (const d of state.argo.diffs) if (!d.ignored) byKey.set(d.key, [...(byKey.get(d.key) ?? []), d])
  for (const [key, diffs] of byKey) {
    const d0 = diffs[0]
    const live = state.cluster.objects[key]
    const target = state.argo.target[key]
    out.push(`===== ${groupOf(d0.kind)}/${d0.kind} ${d0.kind === 'ClusterRoleBinding' ? '' : KLOPA.namespace}/${d0.name} ======`)
    if (d0.change === 'missing-live' && target) {
      out.push(...manifestToYaml(target).trimEnd().split('\n').map((l) => `> ${l}`))
      continue
    }
    if (d0.change === 'extra-live' && live) {
      out.push(...manifestToYaml({ kind: live.kind, name: live.name, namespace: live.namespace, fields: live.fields }).trimEnd().split('\n').map((l) => `< ${l}`))
      continue
    }
    for (const d of diffs) {
      if (d.live !== undefined) out.push(`< ${dottedPath(d.path)}: ${yamlScalar(d.live)}`)
      if (d.live !== undefined && d.git !== undefined) out.push('---')
      if (d.git !== undefined) out.push(`> ${dottedPath(d.path)}: ${yamlScalar(d.git)}`)
    }
  }
  return out
}

/**
 * `helm list -n klopa`: always empty. Argo CD renders Helm charts with `helm template` and manages the objects itself,
 * so no Helm release exists in the cluster (L22 misconception „Argo CD pokreće helm install”).
 */
export function helmList(): string[] {
  return ['NAME\tNAMESPACE\tREVISION\tUPDATED\tSTATUS\tCHART\tAPP VERSION']
}

/** `argocd app get klopa-api` (abridged) */
export function argocdAppGet(state: GitOpsState): string[] {
  if (state.mode !== 'pull') return [`FATAL rpc error: code = NotFound desc = applications.argoproj.io "${state.argo.appName}" not found`]
  const a = state.argo
  const p = a.policy
  const policy = p.automated ? `Automated${p.prune ? ' (Prune)' : ''}` : 'Manual'
  const op = a.operation ?? a.lastOperation
  const pad = (s: string, n: number) => (s.length >= n ? `${s} ` : s + ' '.repeat(n - s.length))
  const lines = [
    `Name:               argocd/${a.appName}`,
    `Project:            ${a.project.name}`,
    `Server:             https://kubernetes.default.svc`,
    `Namespace:          ${KLOPA.namespace}`,
    `Repo:               ${state.repo.url}`,
    `Target:             ${state.repo.branch}`,
    `Path:               ${state.repo.appPath}`,
    `SyncWindow:         Sync Allowed`,
    `Sync Policy:        ${policy}`,
    `Sync Status:        ${a.sync.status} to ${state.repo.branch} (${(a.knownRevision ?? '').slice(0, 7)})`,
    `Health Status:      ${a.health.status}`,
  ]
  if (a.conditions.length) {
    lines.push('', 'CONDITION         MESSAGE')
    for (const c of a.conditions) lines.push(`${pad(c.type, 18)}${c.message}`)
  }
  if (op) {
    lines.push('', `Operation:          Sync`, `Sync Revision:      ${op.revision}`, `Phase:              ${op.phase}`, `Message:            ${op.message}`)
  }
  const rows = a.resources.map((r) => [groupOf(r.kind), r.kind, r.kind === 'ClusterRoleBinding' ? '' : KLOPA.namespace, r.name, r.status, r.health ?? '', r.hook ?? '', r.requiresPruning ? 'ignored (requires pruning)' : r.healthMessage])
  const head = ['GROUP', 'KIND', 'NAMESPACE', 'NAME', 'STATUS', 'HEALTH', 'HOOK', 'MESSAGE']
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)) + 2)
  lines.push('', head.map((h, i) => pad(h, widths[i])).join('').trimEnd())
  for (const r of rows) lines.push(r.map((c, i) => pad(c, widths[i])).join('').trimEnd())
  return lines
}
