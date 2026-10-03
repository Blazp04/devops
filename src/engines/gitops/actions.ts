/**
 * User actions (plain functions mutating state – call them inside `sim.mutate(s => …)`).
 * Croatian button labels from the curriculum are noted next to each action.
 */
import type { Commit, CommitResult, FieldValue, FileChange, GitOpsState, IgnoreRule, ImageBehaviour, Kind, Manifest, RepoProtection, RetryStrategy, SyncPolicy } from './types.ts'
import { FILES, KLOPA, PATHS } from './constants.ts'
import { hpaManifest, imageRef, plainSecretManifest, sealedSecretManifest, sopsSecretManifest, SMS, externalSecretManifest, type SecretsApproach } from './config.ts'
import { applyManifest, deleteObject, registryKey, validateManifest, writeField } from './cluster.ts'
import { gitRefresh, resolveRetry, startOperation, terminateOperation, updateHpaIgnoreFix } from './argocd.ts'
import { commit, findCommit, headCommit, imageChanges, pathOf, revert } from './git.ts'
import { addImage, newSealingKey, sealValue, sopsEncrypt } from './engine.ts'
import { emit, hexHash, objKey, parseImage } from './util.ts'

export interface CommitOptions {
  author?: string
  message?: string
  signed?: boolean
  viaPullRequest?: boolean
}

// ─── Git (config repo) ───────────────────────────────────────────────────────

const TAG = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/
const REPO = /^[a-z0-9]+(?:[._-]+[a-z0-9]+)*(?::[0-9]+)?(?:\/[a-z0-9]+(?:[._-]+[a-z0-9]+)*)*$/
const DIGEST = /^sha256:[0-9a-f]{64}$/

/** Docker reference grammar (distribution/reference): `repo[:tag][@sha256:…]`, or a bare tag. Rejects '', spaces, 'v 2'. */
export function isValidImageRef(tagOrRef: string): boolean {
  if (typeof tagOrRef !== 'string' || tagOrRef.trim() !== tagOrRef || tagOrRef === '') return false
  if (!tagOrRef.includes('/')) return TAG.test(tagOrRef)
  const { repo, tag, digest } = parseImage(tagOrRef)
  return REPO.test(repo) && TAG.test(tag) && (digest === null || DIGEST.test(digest)) && !tagOrRef.endsWith(':')
}

/** „Commit u Git” (tag slike). Accepts a tag ('2.0.1') or a full image reference; updates every container of that image (Deployment + migration Job). */
export function commitImage(state: GitOpsState, tagOrRef: string, opts: CommitOptions = {}): CommitResult {
  const path = pathOf(state.repo, 'Deployment', state.mainDeployment)
  if (!path) return { ok: false, reason: 'Deployment nije u Gitu' }
  if (!isValidImageRef(tagOrRef)) return { ok: false, reason: 'neispravna oznaka slike' }
  const ref = tagOrRef.includes('/') ? tagOrRef : imageRef(tagOrRef)
  return commit(state, { message: opts.message ?? `klopa-api ${tagOrRef}`, author: opts.author, signed: opts.signed, viaPullRequest: opts.viaPullRequest, changes: imageChanges(state.repo, ref) })
}

/** „Commit u Git” (replicas). `null` removes spec.replicas from the manifest. */
export function commitReplicas(state: GitOpsState, replicas: number | null, opts: CommitOptions = {}): CommitResult {
  if (replicas !== null && !(Number.isInteger(replicas) && replicas >= 0)) return { ok: false, reason: 'replicas mora biti cijeli broj ≥ 0' }
  const path = pathOf(state.repo, 'Deployment', state.mainDeployment)
  if (!path) return { ok: false, reason: 'Deployment nije u Gitu' }
  const msg = replicas === null ? 'Ukloni spec.replicas (skalira HPA)' : `replicas: ${replicas}`
  return commit(state, { message: opts.message ?? msg, author: opts.author, signed: opts.signed, viaPullRequest: opts.viaPullRequest, changes: [{ path, set: { [PATHS.replicas]: replicas } }] })
}

/**
 * One commit with any number of file changes (L24 „Uređivač config repozitorija” + „Commit”): add or replace a file
 * (`manifest`), delete it (`manifest: null`) or patch fields (`set`, `null` removes a field). A fix that touches several
 * fields (an HTTPRoute rule, env → volume) is ONE revision, so Argo CD never syncs a half-done state.
 * Fails without committing when a `set` targets a missing file, or when nothing changes.
 */
export function commitChanges(state: GitOpsState, changes: FileChange[], opts: CommitOptions & { kind?: Commit['kind'] } = {}): CommitResult {
  if (!Array.isArray(changes) || changes.length === 0) return { ok: false, reason: 'nema promjena' }
  const files = [...new Set(changes.map((c) => c.path.split('/').pop() ?? c.path))]
  return commit(state, { message: opts.message ?? `Uredi ${files.join(', ')}`, author: opts.author, signed: opts.signed, viaPullRequest: opts.viaPullRequest, kind: opts.kind, changes })
}

/** Change any field of a file in Git (generic editor for L24 „Uređivač config repozitorija”). `null` removes the field. */
export function commitField(state: GitOpsState, path: string, field: string, value: FieldValue | null, opts: CommitOptions = {}): CommitResult {
  return commit(state, { message: opts.message ?? `${path.split('/').pop()}: ${field}`, author: opts.author, signed: opts.signed, viaPullRequest: opts.viaPullRequest, changes: [{ path, set: { [field]: value } }] })
}

/** „Loš commit”: image that crashes (1.5.0, CrashLoopBackOff), or a typo tag that does not exist (ImagePullBackOff). */
export function commitBadImage(state: GitOpsState, kind: 'crash' | 'typo' = 'typo', opts: CommitOptions = {}): CommitResult {
  const tag = kind === 'crash' ? '1.5.0' : '2.0.l'
  return commitImage(state, tag, { message: kind === 'crash' ? 'klopa-api 1.5.0' : 'klopa-api 2.0.1 (hitno)', ...opts })
}

/** A manifest the API server rejects (`replicas: "četiri"`) → the sync fails in dry-run, nothing is applied. */
export function commitInvalidManifest(state: GitOpsState, opts: CommitOptions = {}): CommitResult {
  const path = pathOf(state.repo, 'Deployment', state.mainDeployment)
  if (!path) return { ok: false, reason: 'Deployment nije u Gitu' }
  return commit(state, { message: opts.message ?? 'replicas: četiri', author: opts.author, changes: [{ path, set: { [PATHS.replicas]: 'četiri' } }] })
}

/** „Obriši datoteku iz Gita” (default: the promo ConfigMap). */
export function deleteFileFromGit(state: GitOpsState, path: string = FILES.promo, opts: CommitOptions = {}): CommitResult {
  if (!headCommit(state.repo).files[path]) return { ok: false, reason: `nema datoteke ${path}` }
  return commit(state, { message: opts.message ?? `Ukloni ${path.split('/').pop()}`, author: opts.author, changes: [{ path, manifest: null }] })
}

/** „replicas u Gitu + HPA”: add hpa.yaml while the Deployment still has spec.replicas. */
export function addHpaToGit(state: GitOpsState, min = 2, max = 10, opts: CommitOptions = {}): CommitResult {
  if (state.cluster.hpaDemand === 0) state.cluster.hpaDemand = 6
  return commit(state, { message: opts.message ?? `Dodaj HPA (${min}–${max})`, author: opts.author, changes: [{ path: FILES.hpa, manifest: hpaManifest(min, max) }] })
}

/**
 * „Ukloni replicas iz Gita”. Without the migration procedure the next sync drops the Deployment to 1 replica once
 * (the API default), because the field disappears from the last-applied configuration. With `migrate: true` the
 * Kubernetes HPA-migration step is done first (`kubectl apply edit-last-applied` removes spec.replicas), so nothing drops.
 */
export function removeReplicasFromGit(state: GitOpsState, migrate = false, opts: CommitOptions = {}): CommitResult {
  if (migrate) {
    const live = state.cluster.objects[objKey('Deployment', state.mainDeployment)]
    if (live?.lastApplied && PATHS.replicas in live.lastApplied) {
      const next = { ...live.lastApplied }
      delete next[PATHS.replicas]
      live.lastApplied = next
      emit(state, 'config', `kubectl apply edit-last-applied: spec.replicas uklonjen iz last-applied-configuration (postupak migracije na HPA).`, 'info')
    }
  }
  return commitReplicas(state, null, opts)
}

/** „git revert” of a commit (default: HEAD). Rollback the GitOps way: a new commit, history kept. */
export function gitRevert(state: GitOpsState, sha?: string, opts: CommitOptions = {}): CommitResult {
  return revert(state, sha ?? state.repo.head, opts.author ?? 'Lana')
}

/** Revert the most recent commit that is not itself a revert (convenience for „Vratite loš commit”). */
export function revertLastChange(state: GitOpsState, opts: CommitOptions = {}): CommitResult {
  const target = [...state.repo.commits].reverse().find((c) => c.kind !== 'revert' && c.kind !== 'initial' && !state.repo.commits.some((x) => x.revertOf === c.sha))
  if (!target) return { ok: false, reason: 'nema commita za vraćanje' }
  return gitRevert(state, target.sha, opts)
}

/**
 * Someone without review rights pushes an unsigned commit straight to main (pull moves the keys to the repo).
 * `payload: 'image'` swaps the image for a foreign one; 'rbac' adds a ClusterRoleBinding granting cluster-admin.
 */
export function attackerCommit(state: GitOpsState, payload: 'image' | 'rbac' = 'image'): CommitResult {
  const path = pathOf(state.repo, 'Deployment', state.mainDeployment)
  if (payload === 'image' && path) {
    const ref = 'registry.napadac.example/kripto-rudar:1.0'
    if (!state.registry[`registry.napadac.example/kripto-rudar:1.0`]) addImage(state, '1.0', 'ok', 'registry.napadac.example/kripto-rudar')
    return commit(state, { message: 'fix: performance', author: KLOPA.attacker, signed: false, viaPullRequest: false, kind: 'attack', changes: [{ path, set: { [PATHS.image]: ref } }] })
  }
  return commit(state, {
    message: 'chore: monitoring',
    author: KLOPA.attacker,
    signed: false,
    viaPullRequest: false,
    kind: 'attack',
    changes: [{ path: `${KLOPA.appPath}/rbac.yaml`, manifest: { kind: 'ClusterRoleBinding', name: 'monitoring-admin', namespace: '', fields: { '/roleRef/name': 'cluster-admin', '/subjects/0/name': 'monitoring' } } }],
  })
}

// ─── CI ──────────────────────────────────────────────────────────────────────

/**
 * CI builds and pushes `version`; in pull mode the CI bot then commits tag@digest to the config repo. `bugRate` (share of
 * failing requests of a Ready build, see ImageInfo) defaults to what the registry already knows about that tag – so
 * rebuilding 2.0.0 keeps its 20 % VAT bug – else 0.
 */
export function startCiRelease(state: GitOpsState, version: string, behaviour: ImageBehaviour = 'ok', bugRate?: number): string | null {
  if (!isValidImageRef(version) || version.includes('/')) return null
  const known = state.registry[registryKey(KLOPA.registry, version)]?.bugRate ?? 0
  const rate = typeof bugRate === 'number' && Number.isFinite(bugRate) ? Math.min(1, Math.max(0, bugRate)) : known
  const id = `ci-${state.ci.nextId++}`
  state.ci.runs.push({ id, version, behaviour, bugRate: rate, startedAt: state.t, durationS: state.cfg.ciDurationS, status: 'running', progress: 0, resultSha: null })
  emit(state, 'ci', `CI pokreće pipeline za ${version} (izgradnja, testovi, push).`, 'info')
  return id
}

// ─── Argo CD ─────────────────────────────────────────────────────────────────

/** „Osvježi” (Refresh): check Git now. `hard` also drops the manifest cache (argocd-vault-plugin rotation). */
export function refreshApp(state: GitOpsState, hard = false): void {
  gitRefresh(state, 'manual', hard)
}

export interface SyncResult {
  ok: boolean
  reason?: string
}

/** „Sinkroniziraj”: manual sync of the latest revision (Argo CD resolves HEAD when the sync starts). */
export function syncApp(state: GitOpsState, opts: { prune?: boolean; resources?: string[] } = {}): SyncResult {
  if (state.mode !== 'pull') return { ok: false, reason: 'u modelu guranja nema Argo CD-a' }
  const a = state.argo
  if (a.operation) {
    emit(state, 'sync', 'Sinkronizacija odbijena: druga operacija već traje.', 'warn')
    return { ok: false, reason: 'another operation is already in progress' }
  }
  gitRefresh(state, 'manual')
  if (!a.knownRevision) return { ok: false, reason: 'no revision' }
  // like Argo CD, the operation is created even with a ComparisonError – it then ends in phase Error
  const retry = a.policy.retry ? resolveRetry(a.policy.retry) : { limit: 0, durationS: 5, factor: 2, maxDurationS: 180, refresh: false }
  startOperation(state, { initiatedBy: 'manual', revision: a.knownRevision, prune: opts.prune ?? false, onlyKeys: opts.resources ?? null, retry, selfHealAttemptsCount: 0 })
  return { ok: true }
}

/**
 * Argo CD UI „History and rollback”: sync an older revision. Argo CD refuses while automated sync is on.
 * Afterwards the app is OutOfSync with HEAD – Git is no longer the truth (that is why git revert is preferred).
 */
export function argoRollback(state: GitOpsState, historyId: number): SyncResult {
  const a = state.argo
  if (a.policy.automated) {
    emit(state, 'sync', 'Rollback odbijen: uz automatsku sinkronizaciju Argo CD ne dopušta rollback na stariju reviziju.', 'warn')
    return { ok: false, reason: 'rollback cannot be initiated when auto-sync is enabled' }
  }
  if (a.operation) return { ok: false, reason: 'another operation is already in progress' }
  const h = a.history.find((x) => x.id === historyId)
  if (!h || !findCommit(state.repo, h.revision)) return { ok: false, reason: 'nepoznat unos povijesti' }
  startOperation(state, { initiatedBy: 'manual', revision: h.revision, prune: false, onlyKeys: null, retry: { limit: 0, durationS: 5, factor: 2, maxDurationS: 180, refresh: false }, selfHealAttemptsCount: 0 })
  emit(state, 'sync', `Rollback na ${h.revision.slice(0, 7)} iz povijesti Argo CD-a – Git i dalje pokazuje drugu verziju.`, 'warn')
  return { ok: true }
}

/** „Prekini” the running sync (also stops pending retries). */
export function terminateSync(state: GitOpsState): boolean {
  return terminateOperation(state)
}

/** Prekidači „Automatska sinkronizacija”, „selfHeal”, „prune” (+ allowEmpty). */
export function setSyncPolicy(state: GitOpsState, patch: Partial<Pick<SyncPolicy, 'automated' | 'prune' | 'selfHeal' | 'allowEmpty' | 'respectIgnoreDifferences'>>): void {
  const p = state.argo.policy
  const before = { ...p }
  Object.assign(p, patch)
  const names: string[] = []
  if (before.automated !== p.automated) names.push(`automatska sinkronizacija ${p.automated ? 'uključena' : 'isključena'}`)
  if (before.selfHeal !== p.selfHeal) names.push(`selfHeal ${p.selfHeal ? 'uključen' : 'isključen'}`)
  if (before.prune !== p.prune) names.push(`prune ${p.prune ? 'uključen' : 'isključen'}`)
  if (before.allowEmpty !== p.allowEmpty) names.push(`allowEmpty ${p.allowEmpty ? 'uključen' : 'isključen'}`)
  if (before.respectIgnoreDifferences !== p.respectIgnoreDifferences) names.push(`RespectIgnoreDifferences=${p.respectIgnoreDifferences}`)
  if (names.length) emit(state, 'config', `Application: ${names.join(', ')}.`, 'neutral')
  state.argo.compareRequested = true
  updateHpaIgnoreFix(state)
}

/** Prekidač „retry”: syncPolicy.retry (null = not set). */
export function setRetry(state: GitOpsState, retry: RetryStrategy | null): void {
  state.argo.policy.retry = retry ? { ...retry, backoff: retry.backoff ? { ...retry.backoff } : undefined } : null
  emit(state, 'config', retry ? `syncPolicy.retry: limit ${retry.limit}${retry.refresh ? ', refresh' : ''}.` : 'syncPolicy.retry uklonjen.', 'neutral')
}

/** Prekidač „Webhook”. */
export function setWebhook(state: GitOpsState, on: boolean): void {
  state.argo.webhook = on
  emit(state, 'config', on ? 'Webhook uključen: Git javlja Argo CD-u svaki push.' : 'Webhook isključen: Argo CD samo redovito provjerava Git.', 'neutral')
}

/** ignoreDifferences rules (replace all). */
export function setIgnoreDifferences(state: GitOpsState, rules: IgnoreRule[]): void {
  state.argo.ignoreDifferences = rules.map((r) => ({ ...r, jsonPointers: [...r.jsonPointers] }))
  state.argo.compareRequested = true
  updateHpaIgnoreFix(state)
}

/** „ignoreDifferences” on Deployment /spec/replicas (on/off). */
export function setIgnoreReplicas(state: GitOpsState, on: boolean): void {
  const others = state.argo.ignoreDifferences.filter((r) => !(r.kind === 'Deployment' && r.jsonPointers.includes(PATHS.replicas)))
  setIgnoreDifferences(state, on ? [...others, { kind: 'Deployment' as Kind, jsonPointers: [PATHS.replicas] }] : others)
  emit(state, 'config', on ? 'ignoreDifferences: /spec/replicas (Deployment) – utječe samo na usporedbu.' : 'ignoreDifferences za /spec/replicas uklonjen.', 'neutral')
}

/** „ignoreDifferences + RespectIgnoreDifferences” toggle helper. */
export function setRespectIgnoreDifferences(state: GitOpsState, on: boolean): void {
  setSyncPolicy(state, { respectIgnoreDifferences: on })
}

/** AppProject sourceIntegrity gpg mode. */
export function setSourceIntegrity(state: GitOpsState, mode: 'none' | 'head' | 'strict'): void {
  state.argo.project.sourceIntegrity = mode
  emit(state, 'config', `AppProject sourceIntegrity: ${mode}.`, 'neutral')
  gitRefresh(state, 'manual')
}

/** AppProject restrictions (allowed namespaces/kinds) on/off. */
export function setProjectRestricted(state: GitOpsState, on: boolean): void {
  state.argo.project.restricted = on
  emit(state, 'config', on ? `AppProject ${state.argo.project.name}: samo namespace klopa, bez resursa na razini klastera.` : `AppProject ${state.argo.project.name}: dopušteno sve (kao projekt default).`, 'neutral')
}

/** Branch protection on the config repo. */
export function setRepoProtection(state: GitOpsState, patch: Partial<RepoProtection>): void {
  Object.assign(state.repo.protection, patch)
  emit(state, 'config', `Zaštita grane main: pull request ${state.repo.protection.requirePullRequest ? 'obavezan' : 'nije obavezan'}, potpisani commitovi ${state.repo.protection.requireSignedCommits ? 'obavezni' : 'nisu obavezni'}.`, 'neutral')
}

/** Switch push ↔ pull model. */
export function setDeliveryMode(state: GitOpsState, mode: 'pull' | 'push'): void {
  if (state.mode === mode) return
  state.mode = mode
  if (mode === 'pull') {
    state.argo.knownRevision = null
    state.argo.lastOperation = null
    state.argo.nextPollAt = state.t
    emit(state, 'config', 'Model povlačenja: Argo CD u klasteru povlači željeno stanje iz Gita; CI više ne treba ključ klastera.', 'info')
  } else {
    state.argo.operation = null
    emit(state, 'config', 'Model guranja: CI drži ključ klastera i sam izvodi kubectl apply.', 'warn')
  }
}

// ─── Cluster („kvar” buttons) ────────────────────────────────────────────────

/** „Ručni kubectl scale --replicas=10”. kubectl rejects a negative or non-integer count (returns false, nothing changes). */
export function kubectlScale(state: GitOpsState, replicas: number, name: string = state.mainDeployment): boolean {
  if (!Number.isInteger(replicas) || replicas > 2147483647) return false
  if (replicas < 0) {
    emit(state, 'drift', `kubectl scale odbijen: --replicas=${replicas} mora biti ≥ 0.`, 'warn')
    return false
  }
  const ok = writeField(state, objKey('Deployment', name), PATHS.replicas, replicas, 'kubectl')
  if (ok) {
    state.stats.kubectlChanges++
    emit(state, 'drift', `Ručna promjena: kubectl scale deployment/${name} --replicas=${replicas}.`, 'warn')
  }
  return ok
}

/** `kubectl edit` of any field (e.g. an env var). The API server validates the result: an invalid object is rejected (false). */
export function kubectlEdit(state: GitOpsState, kind: Kind, name: string, path: string, value: FieldValue | null): boolean {
  const live = state.cluster.objects[objKey(kind, name)]
  if (!live) return false
  const fields = { ...live.fields }
  if (value === null) delete fields[path]
  else fields[path] = value
  const invalid = validateManifest({ kind, name, namespace: live.namespace, fields })
  if (invalid) {
    emit(state, 'drift', `kubectl edit odbijen: ${invalid}`, 'warn')
    return false
  }
  const ok = writeField(state, objKey(kind, name), path, value, 'kubectl')
  if (ok) {
    state.stats.kubectlChanges++
    if (kind === 'Deployment' && path === PATHS.image) state.stats.kubectlImageChanges++
    emit(state, 'drift', `Ručna promjena: kubectl edit ${kind.toLowerCase()}/${name} (${path}).`, 'warn')
  }
  return ok
}

/** `kubectl set image` straight on the cluster. */
export function kubectlSetImage(state: GitOpsState, tag: string, name: string = state.mainDeployment): boolean {
  return kubectlEdit(state, 'Deployment', name, PATHS.image, tag.includes('/') ? tag : imageRef(tag))
}

/** „Netko obriše Deployment” (or any object). */
export function kubectlDelete(state: GitOpsState, kind: Kind, name: string): boolean {
  const ok = deleteObject(state, objKey(kind, name), 'kubectl')
  if (ok) {
    state.stats.kubectlChanges++
    emit(state, 'drift', `Ručna promjena: kubectl delete ${kind.toLowerCase()}/${name}.`, 'bad')
  }
  return ok
}

/** `kubectl rollout restart` – env consumers pick up a rotated Secret only after this. */
export function rolloutRestart(state: GitOpsState, name: string = state.mainDeployment): boolean {
  const ok = writeField(state, objKey('Deployment', name), PATHS.restartedAt, `t=${state.t}`, 'kubectl')
  if (ok) emit(state, 'pod', `kubectl rollout restart deployment/${name}: novi Podovi čitaju trenutačne tajne.`, 'info')
  return ok
}

/** `kubectl rollout pause` / `resume`: a paused Deployment does not roll out template changes → Argo CD health Suspended (sync status unaffected). */
export function rolloutPause(state: GitOpsState, paused: boolean, name: string = state.mainDeployment): boolean {
  const ok = writeField(state, objKey('Deployment', name), PATHS.paused, paused ? true : null, 'kubectl')
  if (ok) {
    state.stats.kubectlChanges++
    emit(state, 'drift', paused ? `kubectl rollout pause deployment/${name}: nove verzije se ne uvode (zdravlje Suspended).` : `kubectl rollout resume deployment/${name}.`, paused ? 'warn' : 'info')
  }
  return ok
}

/** Load needs this many Pods (drives the HPA). */
export function setHpaDemand(state: GitOpsState, replicas: number): void {
  state.cluster.hpaDemand = Number.isFinite(replicas) ? Math.max(0, Math.floor(replicas)) : 0
}

/** Database outage – the PreSync migration Job fails while it lasts. */
export function setDatabaseDown(state: GitOpsState, down: boolean): void {
  state.cluster.databaseDown = down
  emit(state, 'pod', down ? 'Baza podataka nije dostupna.' : 'Baza podataka ponovno radi.', down ? 'bad' : 'ok')
}

/**
 * Lose the cluster and build a new one. Argo CD is reinstalled (empty Redis cache) and pulls everything from Git again –
 * with automated sync at once; with manual sync the app waits OutOfSync (everything Missing) until „Sinkroniziraj”,
 * unless `bootstrapSync: true` (the bootstrap script runs `argocd app sync`, like E5's rebuild).
 * Objects created by hand (kubectl) are gone; Sealed Secrets can be decrypted only if the key backup is restored.
 */
export function rebuildCluster(state: GitOpsState, opts: { restoreSealingKeys?: boolean; bootstrapSync?: boolean } = {}): void {
  const c = state.cluster
  const demand = c.hpaDemand
  const db = c.databaseDown
  c.objects = {}
  c.deployments = {}
  c.replicaSets = []
  c.pods = []
  c.hpas = {}
  c.jobs = {}
  c.imageCache = []
  c.unsealAt = {}
  c.esoNextRefreshAt = {}
  c.secretChangedAt = {}
  c.replicaWrites = []
  c.controllerStatus = {}
  c.sealedResyncAt = {}
  c.kubeEvents = []
  c.liveChanges = []
  c.deletedBy = {}
  c.hpaDemand = demand
  c.databaseDown = db
  const s = state.secrets.sealing
  s.clusterKeyIds = opts.restoreSealingKeys ? [...s.backupKeyIds] : []
  if (s.clusterKeyIds.length === 0) newSealingKey(state, state.t, false)
  const a = state.argo
  a.knownRevision = null
  a.lastOperation = null
  a.operation = null
  a.history = []
  a.renderCache = {}
  a.plaintextCache = {}
  a.nextPollAt = state.t
  a.conditions = []
  emit(state, 'config', `Novi klaster${opts.restoreSealingKeys ? ' (ključevi Sealed Secretsa vraćeni iz sigurnosne kopije)' : ''}. Sve što je postojalo samo u starom klasteru je nestalo.`, 'warn')
  if (opts.bootstrapSync && state.mode === 'pull' && !a.policy.automated) syncApp(state)
}

/** Lana's laptop: `kubectl apply -f secret.yaml` (not in Git, not tracked by Argo CD). */
export function kubectlApplySecret(state: GitOpsState, value: string = state.secrets.store.values[SMS.remoteKey] ?? SMS.initialValue): void {
  applyManifest(state, { kind: 'Secret', name: SMS.secretName, namespace: KLOPA.namespace, fields: { [PATHS.data(SMS.secretKey)]: value } }, { by: 'kubectl', managed: false })
  state.stats.kubectlChanges++
  emit(state, 'secret', `kubectl apply -f secret.yaml s laptopa – Secret postoji samo u ovom klasteru.`, 'warn')
}

// ─── Secrets (L23) ───────────────────────────────────────────────────────────

/** „Spremi običan Secret u Git”: the value is now readable in Git history forever (until rotated). */
export function commitPlainSecret(state: GitOpsState, value: string = state.secrets.store.values[SMS.remoteKey] ?? SMS.initialValue, opts: CommitOptions = {}): CommitResult {
  return commit(state, { message: opts.message ?? 'Dodaj secret-sms.yaml', author: opts.author, changes: [{ path: FILES.secret, manifest: plainSecretManifest(value) }] })
}

/** kubeseal + commit: re-seal the value with the newest key and commit the SealedSecret. */
export function commitSealedSecret(state: GitOpsState, value: string = state.secrets.store.values[SMS.remoteKey] ?? SMS.initialValue, opts: CommitOptions = {}): CommitResult {
  const token = sealValue(state, value)
  return commit(state, { message: opts.message ?? 'kubeseal: SMS ključ', author: opts.author, changes: [{ path: FILES.sealedSecret, manifest: sealedSecretManifest(token) }] })
}

/** `sops --encrypt` + commit: the value is encrypted with the age key, the keys stay readable; Argo CD decrypts only via KSOPS. */
export function commitSopsSecret(state: GitOpsState, value: string = state.secrets.store.values[SMS.remoteKey] ?? SMS.initialValue, opts: CommitOptions = {}): CommitResult {
  const token = sopsEncrypt(state, value)
  return commit(state, { message: opts.message ?? 'sops: SMS ključ', author: opts.author, changes: [{ path: FILES.sopsSecret, manifest: sopsSecretManifest(token, state.secrets.sops.recipient) }] })
}

/**
 * The age private keys leaked (e.g. from a laptop): every SOPS value ever encrypted for one of the team's current age
 * keys becomes readable from Git history. Permanent. Values encrypted later for a NEW age key (`renewSopsKey`) stay safe.
 */
export function leakSopsKey(state: GitOpsState): void {
  const sops = state.secrets.sops
  sops.leaked = true
  sops.leakedRecipients = [...new Set([...sops.leakedRecipients, ...sops.recipients])]
  emit(state, 'security', 'Privatni age ključ za SOPS je procurio: svaka SOPS vrijednost šifrirana tim ključem čitljiva je iz povijesti Gita. Novi age ključ, pa rotirajte stvarne vrijednosti.', 'bad')
}

/** `age-keygen` + `.sops.yaml`: the team encrypts for a new age key from now on (the repo-server gets its private key too). */
export function renewSopsKey(state: GitOpsState): string {
  const sops = state.secrets.sops
  const recipient = `age1${hexHash(`klopa-age:${state.cfg.seed}:${sops.recipients.length}`, 58)}`
  sops.recipients.push(recipient)
  sops.recipient = recipient
  emit(state, 'secret', `Novi age ključ za SOPS (${recipient.slice(0, 12)}…); nove vrijednosti šifriraju se njime, stare datoteke ostaju šifrirane starim ključem.`, 'info')
  return recipient
}

/** Give or take the age key from Argo CD's repo-server (KSOPS). Without it rendering fails (ComparisonError). */
export function setSopsKeyInArgo(state: GitOpsState, on: boolean): void {
  state.secrets.sops.argoHasKey = on
  state.argo.renderCache = {}
  emit(state, 'secret', on ? 'Argo CD (KSOPS) ima age ključ za dešifriranje.' : 'Argo CD (KSOPS) nema age ključ – SOPS datoteke se ne mogu dešifrirati.', on ? 'info' : 'warn')
  gitRefresh(state, 'manual')
}

const SECRET_CARRIERS = [FILES.secret, FILES.sealedSecret, FILES.externalSecret, FILES.sopsSecret] as const

const APPROACH_LABEL: Record<SecretsApproach, string> = {
  none: 'bez tajne',
  plain: 'običan Secret u Gitu',
  sealed: 'SealedSecret',
  sops: 'SOPS (KSOPS)',
  eso: 'ExternalSecret + trezor',
  csi: 'Secrets Store CSI driver',
  avp: 'argocd-vault-plugin',
  manual: 'Secret ručno (kubectl)',
}

/**
 * L23 „Segmented pristup” / „Segmented potrošnja” at runtime, as ONE commit (history is kept – a plain Secret committed
 * earlier stays readable in Git until rotated): removes the old carrier file, adds the new one (plain Secret, SealedSecret
 * sealed with the newest key, SOPS file for the current age key, ExternalSecret, avp placeholder; nothing for csi /
 * manual / none), points the Deployment at it (secretKeyRef env, secret volume or CSI volume) and switches Argo CD's
 * Config Management Plugin (argocd-vault-plugin, KSOPS or none) – an Application setting outside the config repo.
 * `value` defaults to the store's current value. Note: E5 owns the L23 eyes and rotation goals; this action drives E6's
 * GitOps scenes with the same rules.
 */
export function setSecretsApproach(state: GitOpsState, approach: SecretsApproach, opts: CommitOptions & { consumption?: 'env' | 'volume'; value?: string } = {}): CommitResult {
  const head = headCommit(state.repo)
  const depPath = pathOf(state.repo, 'Deployment', state.mainDeployment)
  if (!depPath) return { ok: false, reason: 'Deployment nije u Gitu' }
  const dep = head.files[depPath]
  const consumption = opts.consumption ?? (typeof dep.fields[PATHS.volumeSecretName] === 'string' ? 'volume' : 'env')
  const value = opts.value ?? state.secrets.store.values[SMS.remoteKey] ?? SMS.initialValue
  const files = new Map<string, FileChange>()
  for (const p of SECRET_CARRIERS) if (head.files[p]) files.set(p, { path: p, manifest: null })
  const put = (path: string, manifest: Manifest) => files.set(path, { path, manifest })
  if (approach === 'plain') put(FILES.secret, plainSecretManifest(value))
  if (approach === 'avp') put(FILES.secret, plainSecretManifest(`<path:${SMS.remoteKey}#${SMS.secretKey}>`))
  if (approach === 'sealed') put(FILES.sealedSecret, sealedSecretManifest(sealValue(state, value)))
  if (approach === 'sops') put(FILES.sopsSecret, sopsSecretManifest(sopsEncrypt(state, value), state.secrets.sops.recipient))
  if (approach === 'eso') put(FILES.externalSecret, externalSecretManifest())
  const set: Record<string, FieldValue | null> = { [PATHS.envName(1)]: null, [PATHS.envSecretName(1)]: null, [PATHS.envSecretKey(1)]: null, [PATHS.volumeSecretName]: null, [PATHS.volumeCsiClass]: null }
  if (approach === 'csi') set[PATHS.volumeCsiClass] = SMS.remoteKey
  else if (approach !== 'none' && consumption === 'volume') set[PATHS.volumeSecretName] = SMS.secretName
  else if (approach !== 'none') Object.assign(set, { [PATHS.envName(1)]: SMS.envName, [PATHS.envSecretName(1)]: SMS.secretName, [PATHS.envSecretKey(1)]: SMS.secretKey })
  files.set(depPath, { path: depPath, set })
  const res = commit(state, { message: opts.message ?? `Tajne: ${APPROACH_LABEL[approach]} (${consumption === 'volume' ? 'volumen' : 'env'})`, author: opts.author, signed: opts.signed, viaPullRequest: opts.viaPullRequest, changes: [...files.values()] })
  const plugin = approach === 'avp' ? 'argocd-vault-plugin' : approach === 'sops' ? 'ksops' : 'none'
  if (res.ok && state.argo.sourcePlugin !== plugin) {
    state.argo.sourcePlugin = plugin
    state.argo.renderCache = {}
    emit(state, 'config', `Application: dodatak za generiranje manifesta ${plugin === 'none' ? 'isključen' : plugin}.`, plugin === 'none' ? 'neutral' : 'warn')
  }
  return res
}

/** Commit an ExternalSecret reference (the address of the value, never the value). */
export function commitExternalSecret(state: GitOpsState, refresh = '30s', opts: CommitOptions = {}): CommitResult {
  return commit(state, { message: opts.message ?? 'ExternalSecret za SMS ključ', author: opts.author, changes: [{ path: FILES.externalSecret, manifest: externalSecretManifest(refresh) }] })
}

/** „Rotiraj ključ”: the provider issues a new value and it is stored in the external store; old value revoked. */
export function rotateSecret(state: GitOpsState, remoteKey: string = SMS.remoteKey): string {
  const st = state.secrets.store
  const v = (st.versions[remoteKey] ?? 1) + 1
  st.versions[remoteKey] = v
  const value = `${remoteKey.split('/').pop()}-v${v}`
  st.values[remoteKey] = value
  emit(state, 'secret', `Rotacija: novi ${remoteKey.split('/').pop()} (v${v}) u trezoru; stara vrijednost više ne vrijedi.`, 'info')
  return value
}

/** „Trezor nedostupan” on/off. */
export function setStoreAvailable(state: GitOpsState, on: boolean): void {
  state.secrets.store.available = on
  emit(state, 'secret', on ? 'Trezor ponovno dostupan.' : 'Trezor nedostupan.', on ? 'ok' : 'bad')
}

/** Every 30 days the controller adds a new sealing key; old keys are kept and nothing is re-encrypted. */
export function renewSealingKey(state: GitOpsState): string {
  const id = newSealingKey(state, state.t, false)
  emit(state, 'secret', `Sealed Secrets: dodan novi ključ za pečaćenje (${id}); stari ključevi ostaju, ništa se ne šifrira ponovno.`, 'neutral')
  return id
}

/** Copy all controller keys out of the cluster (label sealedsecrets.bitnami.com/sealed-secrets-key). */
export function backupSealingKeys(state: GitOpsState): void {
  const s = state.secrets.sealing
  s.backupKeyIds = [...new Set([...s.backupKeyIds, ...s.clusterKeyIds])]
  emit(state, 'secret', `Sigurnosna kopija ključeva Sealed Secretsa spremljena izvan klastera (${s.backupKeyIds.length}).`, 'ok')
}

/**
 * „Procurio privatni ključ kontrolera”: the controller's private keys present right now leak – every SealedSecret ever
 * sealed with one of them becomes readable. Permanent (`leakedKeyIds`). The fix: a new sealing key (`renewSealingKey`),
 * then rotate the value and re-seal it with the new key (`commitSealedSecret`).
 */
export function leakSealingKeys(state: GitOpsState): void {
  const s = state.secrets.sealing
  s.leaked = true
  s.leakedKeyIds = [...new Set([...s.leakedKeyIds, ...s.clusterKeyIds])]
  emit(state, 'security', 'Privatni ključevi Sealed Secretsa su procurjeli: svaki SealedSecret zapečaćen njima čitljiv je iz povijesti Gita. Novi ključ za pečaćenje, pa rotirajte stvarne vrijednosti.', 'bad')
}

/**
 * „Token u CI logu” / „Procurio CI ključ”. Push: the CI holds a long-lived cluster-admin kubeconfig → production is exposed.
 * Pull: the CI only holds a token for the config repo → whoever has it can deploy by committing, unless branch protection
 * forces a reviewed pull request. Pull moves the keys, it does not remove them.
 */
export function leakCiCredentials(state: GitOpsState): void {
  state.security.ciCredentialLeaked = true
  state.security.clusterCompromised = state.mode === 'push'
  if (state.mode === 'push') {
    emit(state, 'security', 'Procurio je ključ klastera iz CI-ja: napadač može izravno mijenjati produkciju.', 'bad')
  } else if (state.repo.protection.requirePullRequest) {
    emit(state, 'security', 'Procurio je CI token za config repozitorij: bez pregleda može samo otvoriti pull request – klaster ostaje nedostupan.', 'warn')
  } else {
    emit(state, 'security', 'Procurio je CI token za config repozitorij: tko ga ima, može izravno spremiti u main – a Argo CD će to postaviti. Ključ se premjestio, nije nestao.', 'bad')
  }
}


