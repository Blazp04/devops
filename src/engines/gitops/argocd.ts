/**
 * Argo CD Application controller: Git refresh (poll / webhook / manual), comparison with ignoreDifferences,
 * sync status and health as separate dimensions, automated sync (+ prune, selfHeal, allowEmpty), sync operations
 * with waves/hooks, retry with exponential backoff, RespectIgnoreDifferences, history and rollback.
 * Semantics follow argo-cd v3.5.3 controller/appcontroller.go (autoSync, alreadyAttemptedSync, selfHealRemainingBackoff,
 * processRequestedAppOperation) and gitops-engine health checks. See README for the exact list.
 */
import type {
  ArgoState,
  DiffEntry,
  GitOpsState,
  HealthCode,
  Initiator,
  Kind,
  Manifest,
  ResourceStatus,
  SyncCode,
  SyncOperation,
  SyncStep,
} from './types.ts'
import { HEALTH_ORDER, KLOPA, PATHS, REAL_FACTOR, SYNC_RETRY_DEFAULTS } from './constants.ts'
import { applyManifest, CLUSTER_SCOPED, deleteObject, objectHealth, stamp, validateManifest } from './cluster.ts'
import { ancestry, checkSourceIntegrity, filesAt, findCommit } from './git.ts'
import { emit, fieldLabel, fmtS, fmtValue, objKey, plural } from './util.ts'
import { isSopsToken, isVaultPlaceholder } from './config.ts'

const EPS = 1e-9

// ─── Rendering (repo-server) ─────────────────────────────────────────────────

const PLACEHOLDER = /^<path:([^#>]+)#([^>]+)>$/

export interface Rendered {
  target: Record<string, Manifest>
  error: string | null
  plaintext: boolean
  /** readable secret values in the rendered manifests (what lands in the repo-server/Redis cache) */
  plaintextValues: string[]
  /** the error comes from the AppProject source-integrity check */
  integrity?: boolean
}

/**
 * Render manifests at a revision without touching any state (no cache read or write, no flags). argocd-vault-plugin
 * reads the current store values; KSOPS decrypts with the age keys the repo-server has. Selectors use this.
 */
export function renderTarget(state: GitOpsState, sha: string): Rendered {
  const a = state.argo
  const target: Record<string, Manifest> = {}
  const values = new Set<string>()
  let error: string | null = null
  for (const m of Object.values(filesAt(state.repo, sha))) {
    const copy: Manifest = { ...m, fields: { ...m.fields } }
    if (a.sourcePlugin === 'argocd-vault-plugin') {
      for (const [p, v] of Object.entries(copy.fields)) {
        const mm = typeof v === 'string' ? PLACEHOLDER.exec(v) : null
        if (!mm) continue
        if (!state.secrets.store.available) {
          error = `rpc error: plugin argocd-vault-plugin: Error making API request to Vault: connection refused`
          break
        }
        const value = state.secrets.store.values[mm[1]]
        if (value === undefined) {
          error = `rpc error: plugin argocd-vault-plugin: secret ${mm[1]} not found`
          break
        }
        copy.fields[p] = value
      }
    }
    if (a.sourcePlugin === 'ksops' && Object.keys(copy.fields).some((p) => p.startsWith('/sops/'))) {
      for (const [p, v] of Object.entries(copy.fields)) {
        if (p.startsWith('/sops/')) {
          delete copy.fields[p]
          continue
        }
        if (!isSopsToken(v)) continue
        const value = state.secrets.sops.argoHasKey ? state.secrets.sops.ciphertexts[v]?.value : undefined
        if (value === undefined) {
          error = `rpc error: plugin ksops: Error decrypting ${copy.kind.toLowerCase()}/${copy.name}: failed to get the data key required to decrypt the SOPS file (no age identity matched)`
          break
        }
        copy.fields[p] = value
      }
    }
    if (error) break
    if (copy.kind === 'Secret') {
      for (const [p, v] of Object.entries(copy.fields)) if (p.startsWith('/data/') && !isSopsToken(v) && !isVaultPlaceholder(v)) values.add(String(v))
    }
    target[objKey(copy.kind, copy.name)] = copy
  }
  const plaintextValues = error ? [] : [...values]
  return { target: error ? {} : target, error, plaintext: plaintextValues.length > 0, plaintextValues }
}

/**
 * The repo-server as the controller uses it: like `renderTarget`, but successful renders are cached per revision (so a
 * rotated store value needs a hard refresh) and any Secret rendered with readable values lands in the repo-server/Redis
 * manifest cache – that is the „Argo CD Redis” exposure of L23 (`state.argo.plaintextCache`, value → last render; it
 * expires after `cfg.argoCacheExpiryS` unless rendered again). Only the controller (step / actions) calls this –
 * selectors use the pure `renderTarget`.
 */
export function render(state: GitOpsState, sha: string): Rendered {
  const a = state.argo
  const r = a.renderCache[sha] ?? renderTarget(state, sha)
  // only successful renders are cached (like the repo-server manifest cache)
  if (!r.error) a.renderCache[sha] = r
  for (const v of r.plaintextValues) a.plaintextCache[v] = state.t
  return r
}

/** Rendered target + AppProject source-integrity check, as a sync operation needs it (never cached). */
function renderChecked(state: GitOpsState, sha: string): Rendered {
  const integrity = checkSourceIntegrity(state.repo, sha, state.argo.project.sourceIntegrity)
  if (integrity) return { target: {}, error: integrity, plaintext: false, plaintextValues: [], integrity: true }
  return render(state, sha)
}

// ─── Refresh ─────────────────────────────────────────────────────────────────

export type RefreshVia = 'poll' | 'webhook' | 'manual' | 'sync'

const VIA_TEXT: Record<RefreshVia, string> = {
  poll: 'redovita provjera Gita',
  webhook: 'webhook',
  manual: 'ručno osvježavanje',
  sync: 'osvježavanje uz sinkronizaciju',
}

/**
 * Resolve `targetRevision` (HEAD of main) and render it. Every such refresh (poll, webhook, manual, around a sync) sets
 * Argo CD's `reconciledAt`, and the periodic Git check runs only once `reconciledAt + timeout.reconciliation` (+ jitter)
 * has passed (appcontroller.go needRefreshAppStatus) – so the poll countdown restarts after every refresh.
 */
export function gitRefresh(state: GitOpsState, via: RefreshVia, hard = false): void {
  if (state.mode !== 'pull') return
  const a = state.argo
  a.lastGitRefreshAt = state.t
  a.pollStartedAt = state.t
  a.nextPollAt = state.t + state.cfg.pollIntervalS + state.rng.next() * state.cfg.pollJitterS
  if (hard) a.renderCache = {}
  const head = state.repo.head
  const prev = a.knownRevision
  a.knownRevision = head
  const r = render(state, head)
  const hadError = a.renderError
  const hadIntegrity = a.integrityError
  a.target = r.target
  a.renderError = r.error
  a.integrityError = checkSourceIntegrity(state.repo, head, a.project.sourceIntegrity)
  if (head !== prev) {
    const fresh = ancestry(state.repo, head).filter((c) => c.seenAt === null)
    for (const c of fresh) {
      c.seenAt = state.t
      c.seenVia = via
      stamp(state, c.sha, 'seen')
    }
    const hc = findCommit(state.repo, head)
    if (hc && prev !== null) {
      const waited = state.t - hc.t
      // polling is compressed ÷10 (AUTHORING §5: label compressed time); webhook / manual refresh are real time
      const real = via === 'poll' ? ` (sim) · stvarno ≈ ${fmtS(waited * REAL_FACTOR.poll)}` : ''
      emit(state, 'refresh', `Argo CD je vidio commit ${hc.short} (${VIA_TEXT[via]}), ${fmtS(waited)}${real} nakon commita.`, 'info')
    }
  }
  if (r.error && r.error !== hadError) emit(state, 'status', `ComparisonError: ${r.error}`, 'bad')
  if (a.integrityError && a.integrityError !== hadIntegrity) {
    state.stats.blockedBySourceIntegrity++
    emit(state, 'security', `Argo CD neće sinkronizirati ${head.slice(0, 7)}: commit nije potpisan ključem kojem projekt vjeruje (sourceIntegrity ${a.project.sourceIntegrity}, ComparisonError).`, 'ok')
  }
  a.compareRequested = true
}

// ─── Comparison ──────────────────────────────────────────────────────────────

export function isIgnored(a: ArgoState, kind: Kind, name: string, path: string): boolean {
  return a.ignoreDifferences.some((r) => r.kind === kind && (!r.name || r.name === name) && r.jsonPointers.some((p) => path === p || path.startsWith(`${p}/`)))
}

/**
 * Keep `stats.hpaIgnoreFixAt` = since when the second HPA fix (ignoreDifferences on the main Deployment's /spec/replicas
 * + RespectIgnoreDifferences=true) is in place; null while it is not. Called by the actions that change either setting.
 */
export function updateHpaIgnoreFix(state: GitOpsState): void {
  const on = state.argo.policy.respectIgnoreDifferences && isIgnored(state.argo, 'Deployment', state.mainDeployment, PATHS.replicas)
  if (!on) state.stats.hpaIgnoreFixAt = null
  else if (state.stats.hpaIgnoreFixAt === null) state.stats.hpaIgnoreFixAt = state.t
}

function worse(a: HealthCode, b: HealthCode): HealthCode {
  return HEALTH_ORDER.indexOf(b) > HEALTH_ORDER.indexOf(a) ? b : a
}

/** Diff + per-resource status for the current target vs live. */
export function computeComparison(state: GitOpsState, target: Record<string, Manifest>): { diffs: DiffEntry[]; resources: ResourceStatus[] } {
  const a = state.argo
  const objects = state.cluster.objects
  const diffs: DiffEntry[] = []
  const resources: ResourceStatus[] = []
  for (const [key, m] of Object.entries(target)) {
    if (m.hook) continue
    const live = objects[key]
    let status: SyncCode = 'Synced'
    if (!live) {
      diffs.push({ key, kind: m.kind, name: m.name, path: '', field: '', git: 'postoji', live: undefined, ignored: false, change: 'missing-live' })
      status = 'OutOfSync'
    } else {
      for (const [p, v] of Object.entries(m.fields)) {
        if (live.fields[p] === v) continue
        const ignored = isIgnored(a, m.kind, m.name, p)
        diffs.push({ key, kind: m.kind, name: m.name, path: p, field: fieldLabel(p), git: v, live: live.fields[p], ignored, change: 'changed' })
        if (!ignored) status = 'OutOfSync'
      }
      for (const p of Object.keys(live.lastApplied ?? {})) {
        if (p in m.fields) continue
        const ignored = isIgnored(a, m.kind, m.name, p)
        diffs.push({ key, kind: m.kind, name: m.name, path: p, field: fieldLabel(p), git: undefined, live: live.fields[p], ignored, change: 'removed-from-git' })
        if (!ignored) status = 'OutOfSync'
      }
    }
    const h = live ? objectHealth(state, key) : { status: 'Missing' as HealthCode, message: '' }
    resources.push({ key, kind: m.kind, name: m.name, status, health: h.status, healthMessage: h.message, requiresPruning: false })
  }
  for (const live of Object.values(objects)) {
    if (!live.managed || live.hook || target[live.key]) continue
    const h = objectHealth(state, live.key)
    diffs.push({ key: live.key, kind: live.kind, name: live.name, path: '', field: '', git: undefined, live: 'postoji', ignored: false, change: 'extra-live' })
    resources.push({ key: live.key, kind: live.kind, name: live.name, status: 'OutOfSync', health: h.status, healthMessage: h.message, requiresPruning: true })
  }
  resources.sort((x, y) => x.key.localeCompare(y.key))
  return { diffs, resources }
}

/**
 * App health = worst health of the resources that exist live (argo-cd ≥ 3.4 controller/health.go setApplicationHealth):
 * a missing resource does not affect app health – OutOfSync already says it is missing, and the resource node itself
 * shows Missing. The app is Missing only when Git has resources and none of them exists live.
 */
export function aggregateHealth(state: GitOpsState, resources: ResourceStatus[]): { status: HealthCode; message: string } {
  let status: HealthCode = 'Healthy'
  let message = ''
  let containsResources = false
  let containsLive = false
  for (const r of resources) {
    if (r.hook) continue
    containsResources = true
    const exists = Boolean(state.cluster.objects[r.key])
    if (!exists) continue
    containsLive = true
    if (r.health === null) continue
    const next = worse(status, r.health)
    if (next !== status) {
      status = next
      message = r.healthMessage
    }
  }
  if (containsResources && !containsLive && worse(status, 'Missing') === 'Missing') return { status: 'Missing', message: '' }
  return { status, message }
}

function short(path: string, v: DiffEntry['git']): string {
  if (typeof v === 'string' && path.endsWith('/image')) {
    const at = v.indexOf('@')
    const noDigest = at >= 0 ? v.slice(0, at) : v
    return noDigest.slice(noDigest.lastIndexOf('/') + 1)
  }
  const text = fmtValue(v)
  return text.length > 24 ? `${text.slice(0, 12)}…` : text
}

function describeDiff(d: DiffEntry): string {
  if (d.change === 'missing-live') return `${d.key} ne postoji u klasteru`
  if (d.change === 'extra-live') return `${d.key} više nije u Gitu`
  if (d.change === 'removed-from-git') return `${d.key}: ${d.field} uklonjen iz Gita (klaster: ${short(d.path, d.live)})`
  return `${d.key}: ${d.field} – Git ${short(d.path, d.git)}, klaster ${short(d.path, d.live)}`
}

export function compare(state: GitOpsState): void {
  if (state.mode !== 'pull') return
  const a = state.argo
  const prevSync = a.sync.status
  const prevHealth = a.health.status
  if (a.renderError) {
    a.sync = { status: 'Unknown', revision: a.knownRevision }
    a.conditions = [{ type: 'ComparisonError', message: a.renderError }]
    const managed = Object.values(state.cluster.objects).filter((o) => o.managed && !o.hook)
    const res: ResourceStatus[] = managed.map((o) => {
      const h = objectHealth(state, o.key)
      return { key: o.key, kind: o.kind, name: o.name, status: 'Unknown', health: h.status, healthMessage: h.message, requiresPruning: false }
    })
    a.resources = res
    a.diffs = []
    a.health = aggregateHealth(state, res)
  } else {
    const { diffs, resources } = computeComparison(state, a.target)
    a.diffs = diffs
    a.resources = resources
    const out = resources.some((r) => r.status === 'OutOfSync')
    a.sync = { status: out ? 'OutOfSync' : 'Synced', revision: a.knownRevision }
    a.conditions = a.conditions.filter((c) => c.type === 'SyncError')
    // Argo CD 3.5: a failed source-integrity check does not stop the diff, it adds a ComparisonError and blocks syncs
    if (a.integrityError) a.conditions.unshift({ type: 'ComparisonError', message: a.integrityError })
    a.health = aggregateHealth(state, resources)
  }
  if (a.sync.status !== prevSync) {
    if (a.sync.status === 'OutOfSync') {
      a.outOfSyncSince = state.t
      const first = a.diffs.find((d) => !d.ignored)
      const lastRev = a.lastOperation?.revision ?? null
      const drift = lastRev !== null && lastRev === a.knownRevision && a.lastOperation?.phase === 'Succeeded'
      if (drift) state.stats.driftsDetected++
      emit(state, 'status', `OutOfSync${drift ? ' (odstupanje u klasteru)' : ''}: ${first ? describeDiff(first) : 'razlika u resursima'}.`, 'warn')
    } else if (a.sync.status === 'Synced') {
      a.outOfSyncSince = null
      emit(state, 'status', `Synced: klaster odgovara Gitu (${a.knownRevision?.slice(0, 7)}).`, 'ok')
    }
  }
  if (a.health.status !== prevHealth) {
    const tone = a.health.status === 'Healthy' ? 'ok' : a.health.status === 'Progressing' || a.health.status === 'Suspended' ? 'info' : 'bad'
    emit(state, 'health', `Zdravlje aplikacije: ${prevHealth} → ${a.health.status}.`, tone)
  }
  // pipeline timestamps: the cluster matches the known revision (after a sync – or at once when nothing had to be
  // applied, e.g. a commit that writes the value kubectl had already set) and, later, is Healthy
  const c = a.knownRevision ? findCommit(state.repo, a.knownRevision) : undefined
  if (c && !a.renderError) {
    if (a.sync.status === 'OutOfSync') stamp(state, c.sha, 'outOfSync')
    const running = a.operation !== null && a.operation.revision === c.sha
    if (a.sync.status === 'Synced' && !running && c.syncedAt === null) c.syncedAt = state.t
    if (a.sync.status === 'Synced' && a.health.status === 'Healthy' && c.syncedAt !== null && c.healthyAt === null) {
      c.healthyAt = state.t
      stamp(state, c.sha, 'healthy')
    }
  }
  if (!a.renderError) autoSync(state)
}

// ─── Automated sync ──────────────────────────────────────────────────────────

/** Self-heal wait: legacy fixed timeout, or k8s wait.Backoff over the attempt count (Argo CD 3.x default). */
export function selfHealDelay(state: GitOpsState, attempts: number): number {
  const sh = state.cfg.selfHeal
  if (sh.mode === 'timeout') return sh.timeoutS
  let duration = sh.initialS
  let steps = attempts
  let delay = 0
  for (let i = 0; i < attempts; i++) {
    if (steps < 1) {
      delay = duration
      continue
    }
    steps--
    delay = duration
    duration = duration * sh.factor
    if (sh.capS > 0 && duration > sh.capS) {
      duration = sh.capS
      steps = 0
    }
  }
  return delay
}

/** Auto-sync decision note for the UI; an event is logged only when the decision (key) changes. */
function note(state: GitOpsState, text: string, tone: 'warn' | 'info' | 'neutral' = 'neutral', key: string = text) {
  const a = state.argo
  const changed = a.lastAutoSyncKey !== key
  a.lastAutoSyncNote = text
  a.lastAutoSyncKey = key
  if (changed && text) emit(state, 'autosync', text, tone)
}

function autoSync(state: GitOpsState): void {
  const a = state.argo
  const p = a.policy
  if (!p.automated) {
    // in an Application, prune and selfHeal are sub-options of syncPolicy.automated
    if ((p.selfHeal || p.prune) && a.sync.status === 'OutOfSync') note(state, 'selfHeal i prune djeluju samo uz automatsku sinkronizaciju (syncPolicy.automated); ručna sinkronizacija briše višak samo s opcijom Prune.', 'warn', 'sub-options-without-automated')
    else note(state, '')
    return
  }
  if (a.operation) {
    // Argo CD starts no new operation while one runs; a retrying operation keeps its own (older) revision
    const op = a.operation
    const rev = a.knownRevision
    if (rev && op.revision !== rev && a.sync.status === 'OutOfSync') {
      const wait = op.stage === 'retryWait' && op.nextRetryAt !== null
        ? `operacija za ${op.revision.slice(0, 7)} se ponavlja (pokušaj #${op.retryCount}, sljedeći za ${fmtS(Math.max(0, op.nextRetryAt - state.t))})`
        : `operacija za ${op.revision.slice(0, 7)} još traje (${op.message})`
      note(state, `Novi commit ${rev.slice(0, 7)} čeka: ${wait}. „Prekini” je zaustavlja.`, 'warn', `blocked-${op.id}-${rev}`)
    }
    return
  }
  if (a.sync.status !== 'OutOfSync') {
    note(state, '')
    return
  }
  const rev = a.knownRevision
  if (!rev) return
  if (!p.prune) {
    const pruneOnly = a.resources.every((r) => r.status === 'Synced' || r.requiresPruning)
    if (pruneOnly) {
      note(state, 'Automatska sinkronizacija preskočena: treba samo obrisati višak resursa, a prune je isključen.', 'warn')
      return
    }
  }
  const last = a.lastOperation
  const alreadyAttempted = last !== null && last.revision === rev
  let initiatedBy: Initiator = 'auto'
  let attempts = 0
  let onlyKeys: string[] | null = null
  if (alreadyAttempted && last) {
    if (last.phase !== 'Succeeded') {
      a.conditions = a.conditions.filter((c) => c.type !== 'SyncError')
      a.conditions.push({ type: 'SyncError', message: `Failed last sync attempt to ${rev.slice(0, 7)}: ${last.message}` })
      note(state, `Automatska sinkronizacija ne pokušava ponovno: zadnji pokušaj za ${rev.slice(0, 7)} nije uspio. Potreban je novi commit ili ručna sinkronizacija.`, 'warn')
      return
    }
    if (!p.selfHeal) {
      note(state, `Odstupanje ostaje: zadnja sinkronizacija već je bila na ${rev.slice(0, 7)}, a selfHeal je isključen.`, 'warn')
      return
    }
    attempts = last.selfHealAttemptsCount
    const since = last.finishedAt === null ? null : state.t - last.finishedAt
    const delay = selfHealDelay(state, attempts)
    const remaining = since === null ? delay : delay - since
    if (remaining > EPS) {
      note(state, `selfHeal čeka još ${fmtS(remaining)} prije pokušaja ${attempts + 1} (odgoda ${fmtS(delay)} od zadnje sinkronizacije).`, 'info', `selfheal-wait-${attempts}`)
      return
    }
    initiatedBy = 'selfHeal'
    attempts++
    onlyKeys = a.resources.filter((r) => r.status !== 'Synced').map((r) => r.key)
  }
  if (p.prune && !p.allowEmpty && a.resources.length > 0 && a.resources.every((r) => r.requiresPruning)) {
    note(state, 'Automatska sinkronizacija preskočena: obrisala bi sve resurse (allowEmpty je isključen).', 'warn')
    a.conditions = a.conditions.filter((c) => c.type !== 'SyncError')
    a.conditions.push({ type: 'SyncError', message: `Skipping sync attempt to ${rev.slice(0, 7)}: auto-sync will wipe out all resources` })
    return
  }
  a.conditions = a.conditions.filter((c) => c.type !== 'SyncError')
  note(state, '')
  const r = p.retry
  const retry = r
    ? resolveRetry(r)
    : { limit: state.cfg.autoSyncDefaultRetry.limit, durationS: state.cfg.autoSyncDefaultRetry.durationS, factor: state.cfg.autoSyncDefaultRetry.factor, maxDurationS: state.cfg.autoSyncDefaultRetry.maxDurationS, refresh: false }
  startOperation(state, { initiatedBy, revision: rev, prune: p.prune, onlyKeys, retry, selfHealAttemptsCount: attempts })
}

export function resolveRetry(r: NonNullable<ArgoState['policy']['retry']>): SyncOperation['retry'] {
  return {
    limit: r.limit,
    durationS: r.backoff?.durationS ?? SYNC_RETRY_DEFAULTS.durationS,
    factor: r.backoff?.factor ?? SYNC_RETRY_DEFAULTS.factor,
    maxDurationS: r.backoff?.maxDurationS ?? SYNC_RETRY_DEFAULTS.maxDurationS,
    refresh: r.refresh ?? false,
  }
}

// ─── Sync operation ──────────────────────────────────────────────────────────

export interface OperationInit {
  initiatedBy: Initiator
  revision: string
  prune: boolean
  onlyKeys: string[] | null
  retry: SyncOperation['retry']
  selfHealAttemptsCount: number
}

function startText(init: OperationInit): string {
  const rev = init.revision.slice(0, 7)
  if (init.initiatedBy === 'selfHeal') return `selfHeal: vraćanje odstupanja prema ${rev} (pokušaj ${init.selfHealAttemptsCount}).`
  return `${init.initiatedBy === 'auto' ? 'Automatska' : 'Ručna'} sinkronizacija na ${rev} počinje.`
}

export function startOperation(state: GitOpsState, init: OperationInit): SyncOperation {
  const a = state.argo
  const op: SyncOperation = {
    id: a.nextOpId++,
    revision: init.revision,
    initiatedBy: init.initiatedBy,
    selfHealAttemptsCount: init.selfHealAttemptsCount,
    prune: init.prune,
    onlyKeys: init.onlyKeys,
    retry: init.retry,
    retryCount: 0,
    revertedManual: false,
    phase: 'Running',
    message: 'syncing',
    startedAt: state.t,
    finishedAt: null,
    nextRetryAt: null,
    steps: [],
    stepIdx: 0,
    stage: 'start',
    stageUntil: state.t,
    results: [],
  }
  a.operation = op
  const c = findCommit(state.repo, init.revision)
  if (c && c.syncStartedAt === null) c.syncStartedAt = state.t
  stamp(state, init.revision, 'syncStarted')
  if (init.initiatedBy === 'auto') state.stats.autoSyncs++
  else if (init.initiatedBy === 'selfHeal') state.stats.selfHealSyncs++
  else state.stats.manualSyncs++
  emit(state, 'sync', startText(init), 'info')
  return op
}

function projectProblem(state: GitOpsState, m: Manifest): string | null {
  const pr = state.argo.project
  if (!pr.restricted) return null
  if (CLUSTER_SCOPED.includes(m.kind)) return `resource rbac.authorization.k8s.io:${m.kind} is not permitted in project ${pr.name}`
  if (m.namespace !== KLOPA.namespace) return `namespace ${m.namespace} is not permitted in project ${pr.name}`
  return null
}

function planSteps(target: Record<string, Manifest>, onlyKeys: string[] | null): SyncStep[] {
  const phaseOrder = ['PreSync', 'Sync', 'PostSync'] as const
  const groups = new Map<string, SyncStep>()
  for (const [key, m] of Object.entries(target)) {
    if (onlyKeys && (!onlyKeys.includes(key) || m.hook)) continue // selective sync: no hooks
    const phase = m.hook ?? 'Sync'
    const wave = m.wave ?? 0
    const id = `${phaseOrder.indexOf(phase)}|${wave}`
    const g = groups.get(id) ?? { phase, wave, keys: [] }
    g.keys.push(key)
    groups.set(id, g)
  }
  // order: phase, then wave, then kind/name (keys sorted)
  return [...groups.values()]
    .sort((x, y) => phaseOrder.indexOf(x.phase) - phaseOrder.indexOf(y.phase) || x.wave - y.wave)
    .map((s) => ({ ...s, keys: s.keys.sort() }))
}

function opTarget(state: GitOpsState, op: SyncOperation): Rendered {
  return renderChecked(state, op.revision)
}

/** Failed = a task failed (apply/validation/hook); Error = the operation could not run (ComparisonError, project). Both are retried. */
function failOperation(state: GitOpsState, op: SyncOperation, message: string, phase: 'Failed' | 'Error' = 'Failed', allowRetry = true, detail: string = message) {
  const a = state.argo
  const r = op.retry
  if (allowRetry && (r.limit < 0 || op.retryCount < r.limit)) {
    const delay = Math.min(r.maxDurationS, r.durationS * r.factor ** op.retryCount)
    op.retryCount++
    op.finishedAt = state.t
    op.nextRetryAt = state.t + delay
    op.stage = 'retryWait'
    op.message = `${message}. Retrying attempt #${op.retryCount}`
    state.stats.retries++
    emit(state, 'retry', `Sinkronizacija nije uspjela (${shorten(detail)}); ponovni pokušaj #${op.retryCount} za ${fmtS(delay)}.`, 'warn')
    return
  }
  op.phase = phase
  op.message = op.retryCount > 0 ? `${message} (retried ${op.retryCount} times).` : message
  op.finishedAt = state.t
  op.stage = 'done'
  op.nextRetryAt = null
  a.lastOperation = op
  a.operation = null
  a.compareRequested = true
  state.stats.failedSyncs++
  emit(state, 'syncFailed', `Sinkronizacija nije uspjela: ${shorten(detail)}${op.retryCount > 0 ? ` (ponovljeno: ${plural(op.retryCount, ['put', 'puta', 'puta'])})` : ''}.`, 'bad')
  afterOperation(state)
}

/** processRequestedAppOperation ends with a refresh at CompareWithLatest: Git is resolved again, reconciledAt = now. */
function afterOperation(state: GitOpsState) {
  gitRefresh(state, 'sync')
}

function shorten(s: string): string {
  return s.length > 140 ? `${s.slice(0, 137)}…` : s
}

function succeedOperation(state: GitOpsState, op: SyncOperation) {
  const a = state.argo
  op.phase = 'Succeeded'
  op.message = 'successfully synced (all tasks run)'
  op.finishedAt = state.t
  op.stage = 'done'
  a.lastOperation = op
  a.operation = null
  // Argo CD records history only for full syncs (a self-heal sync of selected resources adds no entry)
  if (op.onlyKeys === null) {
    a.history.push({ id: a.history.length ? a.history[a.history.length - 1].id + 1 : 0, revision: op.revision, deployedAt: state.t, initiatedBy: op.initiatedBy })
    if (a.history.length > state.cfg.historyLimit) a.history.splice(0, a.history.length - state.cfg.historyLimit)
  }
  const c = findCommit(state.repo, op.revision)
  if (c && c.syncedAt === null) c.syncedAt = state.t
  if (op.initiatedBy === 'selfHeal') {
    state.stats.driftsReverted++
    if (op.revertedManual) state.stats.kubectlDriftsReverted++
  }
  a.compareRequested = true
  emit(state, 'sync', `Sinkronizacija uspjela (${op.revision.slice(0, 7)}).`, 'ok')
  afterOperation(state)
}

function applyStep(state: GitOpsState, op: SyncOperation, step: SyncStep, target: Record<string, Manifest>) {
  const a = state.argo
  for (const key of step.keys) {
    const m = target[key]
    if (!m) continue
    stamp(state, op.revision, 'applied')
    if (m.hook) {
      // hook-delete-policy BeforeHookCreation: delete the previous hook object, then create it again
      deleteObject(state, key, 'argocd')
      applyManifest(state, m, { by: 'argocd', managed: false, revision: op.revision })
      op.results.push({ key, result: 'Synced', message: `${m.hook} hook created` })
      continue
    }
    const keepLive = a.policy.respectIgnoreDifferences ? (p: string) => isIgnored(a, m.kind, m.name, p) : undefined
    const res = applyManifest(state, m, { by: 'argocd', keepLive, revision: op.revision })
    // a self-heal that overwrites a field kubectl set (or recreates what kubectl deleted) reverted a manual change
    if (op.initiatedBy === 'selfHeal' && res.overwritten.includes('kubectl')) op.revertedManual = true
    op.results.push({ key, result: 'Synced', message: res.created ? `${m.kind.toLowerCase()}/${m.name} created` : res.changed ? `${m.kind.toLowerCase()}/${m.name} configured` : `${m.kind.toLowerCase()}/${m.name} unchanged` })
  }
}

/** Advance the running operation by one tick. */
export function tickOperation(state: GitOpsState): void {
  const a = state.argo
  const op = a.operation
  if (!op) return
  const t = state.t
  if (op.stage === 'retryWait') {
    if (op.nextRetryAt === null || t < op.nextRetryAt - EPS) return
    if (op.retry.refresh) {
      gitRefresh(state, 'sync')
      if (a.knownRevision) op.revision = a.knownRevision
    }
    op.finishedAt = null
    op.nextRetryAt = null
    op.results = []
    op.stage = 'start'
    op.message = `Retrying operation. Attempt #${op.retryCount}`
    emit(state, 'retry', `Ponovni pokušaj #${op.retryCount} sinkronizacije na ${op.revision.slice(0, 7)}.`, 'info')
  }
  if (op.stage === 'start') {
    const r = opTarget(state, op)
    if (r.error) {
      failOperation(state, op, `ComparisonError: ${r.error}`, 'Error', true, r.integrity ? `revizija ${op.revision.slice(0, 7)} nije potpisana ključem kojem projekt vjeruje` : r.error)
      return
    }
    const target = op.onlyKeys ? Object.fromEntries(Object.entries(r.target).filter(([k]) => op.onlyKeys?.includes(k))) : r.target
    // 1) task validation: AppProject permissions (gitops-engine getSyncTasks)
    const invalid: string[] = []
    for (const m of Object.values(target)) {
      const v = projectProblem(state, m)
      if (v) {
        invalid.push(v)
        op.results.push({ key: objKey(m.kind, m.name), result: 'SyncFailed', message: v })
      }
    }
    if (invalid.length) {
      failOperation(state, op, `one or more synchronization tasks are not valid: ${[...new Set(invalid)].sort().join('; ')}`)
      return
    }
    // 2) `kubectl apply --dry-run` of every object: any schema error fails the whole sync, nothing is applied
    const problems: string[] = []
    for (const m of Object.values(target)) {
      const v = validateManifest(m)
      if (v) {
        problems.push(v)
        op.results.push({ key: objKey(m.kind, m.name), result: 'SyncFailed', message: v })
      }
    }
    if (problems.length) {
      failOperation(state, op, 'one or more objects failed to apply (dry run)', 'Failed', true, problems.join('; '))
      return
    }
    op.steps = planSteps(r.target, op.onlyKeys)
    op.stepIdx = 0
    if (op.steps.length === 0) {
      op.stage = 'prune'
    } else {
      op.stage = 'apply'
      op.stageUntil = t + state.cfg.applyS
    }
    return
  }
  if (op.stage === 'apply') {
    if (t < op.stageUntil - EPS) return
    const r = opTarget(state, op)
    if (r.error) {
      failOperation(state, op, `ComparisonError: ${r.error}`, 'Error', true, r.integrity ? `revizija ${op.revision.slice(0, 7)} nije potpisana ključem kojem projekt vjeruje` : r.error)
      return
    }
    const step = op.steps[op.stepIdx]
    applyStep(state, op, step, r.target)
    const final = op.stepIdx === op.steps.length - 1
    if (!final) {
      // controller/sync.go delayBetweenSyncWaves: 2 s after applying every non-final wave, then wait for its health
      op.stage = 'delay'
      op.stageUntil = t + state.cfg.syncWaveDelayS
    } else if (step.keys.some((k) => r.target[k]?.hook)) {
      op.stage = 'wait' // hooks in the last step must complete
    } else {
      // last wave without hooks: the sync succeeds right after apply, „EVEN if those objects subsequently degrade”
      op.stage = 'prune'
    }
    return
  }
  if (op.stage === 'delay') {
    if (t < op.stageUntil - EPS) return
    op.stage = 'wait'
  }
  if (op.stage === 'wait') {
    const step = op.steps[op.stepIdx]
    let pending = false
    for (const key of step.keys) {
      const h = objectHealth(state, key)
      if (h.status === 'Degraded') {
        failOperation(state, op, `one or more synchronization tasks completed unsuccessfully, reason: ${h.message}`, 'Failed', true, `${key}: ${h.message}`)
        return
      }
      if (h.status !== null && h.status !== 'Healthy') pending = true
    }
    if (pending) {
      op.message = `waiting for completion of wave ${step.wave} (${step.phase})`
      return
    }
    if (op.stepIdx < op.steps.length - 1) {
      op.stepIdx++
      op.stage = 'apply'
      op.stageUntil = t + state.cfg.applyS
    } else op.stage = 'prune'
    return
  }
  if (op.stage === 'prune') {
    const r = opTarget(state, op)
    const orphans = Object.values(state.cluster.objects).filter((o) => o.managed && !o.hook && !r.target[o.key] && (!op.onlyKeys || op.onlyKeys.includes(o.key)))
    for (const o of orphans) {
      if (op.prune) {
        deleteObject(state, o.key, 'argocd')
        state.stats.prunes++
        op.results.push({ key: o.key, result: 'Pruned', message: 'pruned' })
        emit(state, 'prune', `prune: obrisan ${o.key} (više nije u Gitu).`, 'info')
      } else {
        op.results.push({ key: o.key, result: 'PruneSkipped', message: 'ignored (requires pruning)' })
        state.stats.orphans++
        const why = op.initiatedBy === 'manual' ? 'ručna sinkronizacija bez opcije Prune' : 'prune je isključen'
        emit(state, 'prune', `${o.key} više nije u Gitu, ali ostaje u klasteru: ${why} (resurs „zahtijeva brisanje”).`, 'warn')
      }
    }
    succeedOperation(state, op)
  }
}

/** Advance Argo CD by one tick: poll timer, webhook, operation, comparison. */
export function tickArgo(state: GitOpsState): void {
  if (state.mode !== 'pull') return
  const a = state.argo
  if (state.t >= a.nextPollAt - EPS) gitRefresh(state, 'poll')
  if (a.webhookRefreshAt !== null && state.t >= a.webhookRefreshAt - EPS) {
    a.webhookRefreshAt = null
    gitRefresh(state, 'webhook')
  }
  tickOperation(state)
  const period = Math.max(1, Math.round(state.cfg.compareIntervalS * 10))
  if (a.compareRequested || state.tick % period === 0) {
    a.compareRequested = false
    compare(state)
  }
}

/** Terminate the running operation (UI „Terminate”). */
export function terminateOperation(state: GitOpsState): boolean {
  const a = state.argo
  const op = a.operation
  if (!op) return false
  op.phase = 'Failed'
  op.message = 'Operation terminated'
  op.finishedAt = state.t
  op.stage = 'done'
  op.nextRetryAt = null
  a.lastOperation = op
  a.operation = null
  a.compareRequested = true
  emit(state, 'syncFailed', `Operacija sinkronizacije prekinuta ručno.`, 'warn')
  afterOperation(state)
  return true
}
