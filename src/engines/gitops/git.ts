/** The config repository: immutable commits with file snapshots, protection rules, revert, signatures. */
import type { Commit, CommitInput, CommitResult, FieldChange, FieldValue, FileChange, FileChangeSummary, GitOpsState, Manifest, Repo, RepoFiles } from './types.ts'
import { KLOPA, PATHS } from './constants.ts'
import { emit, hexHash, parseImage } from './util.ts'

export function headCommit(repo: Repo): Commit {
  const c = findCommit(repo, repo.head)
  if (!c) throw new Error('E6: HEAD commit missing')
  return c
}

export function findCommit(repo: Repo, sha: string | null): Commit | undefined {
  if (!sha) return undefined
  for (let i = repo.commits.length - 1; i >= 0; i--) if (repo.commits[i].sha === sha) return repo.commits[i]
  return undefined
}

/** Ancestors of `sha` (inclusive), newest first. */
export function ancestry(repo: Repo, sha: string): Commit[] {
  const out: Commit[] = []
  let c = findCommit(repo, sha)
  while (c) {
    out.push(c)
    c = c.parent ? findCommit(repo, c.parent) : undefined
  }
  return out
}

export function cloneManifest(m: Manifest): Manifest {
  return { ...m, fields: { ...m.fields } }
}

export function manifestsEqual(a: Manifest | undefined, b: Manifest | undefined): boolean {
  if (!a || !b) return a === b
  if (a.kind !== b.kind || a.name !== b.name || a.namespace !== b.namespace || (a.wave ?? 0) !== (b.wave ?? 0) || a.hook !== b.hook) return false
  const ka = Object.keys(a.fields)
  if (ka.length !== Object.keys(b.fields).length) return false
  return ka.every((k) => a.fields[k] === b.fields[k])
}

export function diffFiles(before: RepoFiles, after: RepoFiles): FileChangeSummary[] {
  const out: FileChangeSummary[] = []
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
  for (const p of paths) {
    const a = before[p]
    const b = after[p]
    if (!a && b) out.push({ path: p, change: 'added', fields: Object.keys(b.fields).map((k) => ({ path: k, before: undefined, after: b.fields[k] })) })
    else if (a && !b) out.push({ path: p, change: 'removed', fields: Object.keys(a.fields).map((k) => ({ path: k, before: a.fields[k], after: undefined })) })
    else if (a && b && !manifestsEqual(a, b)) {
      const fields: FieldChange[] = []
      for (const k of [...new Set([...Object.keys(a.fields), ...Object.keys(b.fields)])].sort()) {
        if (a.fields[k] !== b.fields[k]) fields.push({ path: k, before: a.fields[k], after: b.fields[k] })
      }
      out.push({ path: p, change: 'modified', fields })
    }
  }
  return out
}

function makeCommit(state: GitOpsState, parent: Commit | null, files: RepoFiles, input: CommitInput, author: string, signature: Commit['signature']): Commit {
  const changes = diffFiles(parent?.files ?? {}, files)
  const sha = hexHash(`${parent?.sha ?? 'root'}|${author}|${input.message}|${state.tick}|${state.repo.commits.length}|${JSON.stringify(changes)}`, 40)
  return {
    sha,
    short: sha.slice(0, 7),
    parent: parent?.sha ?? null,
    message: input.message,
    author,
    t: state.t,
    files,
    signature,
    kind: input.kind ?? 'change',
    revertOf: input.revertOf,
    changes,
    seenAt: null,
    seenVia: null,
    syncStartedAt: null,
    syncedAt: null,
    healthyAt: null,
    ciRunId: input.ciRunId ?? null,
    stations: { commit: state.t },
  }
}

/** Initial commit(s) built at engine creation (no protection checks, no events). */
export function seedCommit(state: GitOpsState, files: RepoFiles, message: string, author: string, t: number): Commit {
  const parent = state.repo.commits.length ? headCommit(state.repo) : null
  const keyId = state.repo.trustedKeys[author]
  const c = makeCommit(state, parent, files, { message, changes: [], kind: parent ? 'change' : 'initial' }, author, keyId ? { keyId, signer: author } : null)
  c.t = t
  c.stations = { commit: t }
  state.repo.commits.push(c)
  state.repo.head = c.sha
  return c
}

/** Push a commit to `main`. Applies the Git host's protection rules; on success notifies the webhook. */
export function commit(state: GitOpsState, input: CommitInput): CommitResult {
  const repo = state.repo
  const author = input.author ?? 'Lana'
  const viaPr = input.viaPullRequest ?? true
  const keyId = repo.trustedKeys[author] ?? (input.signed ? `UNTRUSTED-${hexHash(author, 8).toUpperCase()}` : undefined)
  const signed = input.signed ?? Boolean(repo.trustedKeys[author])
  const signature = signed && keyId ? { keyId, signer: author } : null

  if (repo.protection.requirePullRequest && !viaPr) {
    state.stats.rejectedCommits++
    emit(state, 'security', `Git odbija izravan push na ${repo.branch} (${author}): potreban je pull request s pregledom.`, 'ok')
    return { ok: false, reason: 'branch-protection' }
  }
  if (repo.protection.requireSignedCommits && !signature) {
    state.stats.rejectedCommits++
    emit(state, 'security', `Git odbija nepotpisan commit (${author}).`, 'ok')
    return { ok: false, reason: 'unsigned' }
  }

  const parent = headCommit(repo)
  const files: RepoFiles = { ...parent.files }
  for (const ch of input.changes) {
    if (ch.manifest === null) {
      delete files[ch.path]
    } else if (ch.manifest) {
      files[ch.path] = cloneManifest(ch.manifest)
    }
    if (ch.set) {
      const cur = files[ch.path]
      if (!cur) return { ok: false, reason: `nema datoteke ${ch.path}` }
      const next = cloneManifest(cur)
      for (const [k, v] of Object.entries(ch.set)) {
        if (v === null) delete next.fields[k]
        else next.fields[k] = v
      }
      files[ch.path] = next
    }
  }
  const c = makeCommit(state, parent, files, input, author, signature)
  if (c.changes.length === 0) return { ok: false, reason: 'nema promjena' }
  repo.commits.push(c)
  repo.head = c.sha
  state.stats.commits++
  emit(state, 'commit', `Commit ${c.short} „${c.message}” (${author}${signature ? '' : ', nepotpisan'})`, c.kind === 'attack' ? 'bad' : 'info')
  if (state.mode === 'pull' && state.argo.webhook) {
    const at = state.t + state.cfg.webhookDelayS
    state.argo.webhookRefreshAt = state.argo.webhookRefreshAt === null ? at : Math.min(state.argo.webhookRefreshAt, at)
  }
  return { ok: true, sha: c.sha, commit: c }
}

/**
 * `git revert <sha>`: a NEW commit applying the inverse of <sha>'s changes to HEAD (history is kept).
 * Field-level three-way check: a field is restored only if HEAD still has the value <sha> introduced; otherwise conflict.
 */
export function revert(state: GitOpsState, sha: string, author = 'Lana'): CommitResult {
  const repo = state.repo
  const target = findCommit(repo, sha)
  if (!target) return { ok: false, reason: 'nepoznat commit' }
  if (!target.parent) return { ok: false, reason: 'početni commit se ne može vratiti' }
  const parent = findCommit(repo, target.parent)
  if (!parent) return { ok: false, reason: 'nepoznat roditelj' }
  const head = headCommit(repo)
  const changes: CommitInput['changes'] = []
  for (const fc of target.changes) {
    const headFile = head.files[fc.path]
    if (fc.change === 'added') {
      if (!headFile) continue
      if (!manifestsEqual(headFile, target.files[fc.path])) return conflict(state, fc.path)
      changes.push({ path: fc.path, manifest: null })
    } else if (fc.change === 'removed') {
      if (headFile) return conflict(state, fc.path)
      changes.push({ path: fc.path, manifest: parent.files[fc.path] })
    } else {
      if (!headFile) return conflict(state, fc.path)
      const set: Record<string, FieldValue | null> = {}
      for (const f of fc.fields) {
        if (headFile.fields[f.path] !== f.after) return conflict(state, fc.path)
        set[f.path] = f.before === undefined ? null : f.before
      }
      changes.push({ path: fc.path, set })
    }
  }
  const subject = target.message.split('\n')[0]
  const res = commit(state, { message: `Revert "${subject}"`, author, changes, kind: 'revert', revertOf: target.sha })
  if (res.ok) {
    state.stats.reverts++
    emit(state, 'git', `git revert ${target.short} → novi commit ${res.commit.short}; povijest ostaje zapisana.`, 'info')
  }
  return res
}

function conflict(state: GitOpsState, path: string): CommitResult {
  emit(state, 'git', `git revert: konflikt u ${path} – kasniji commit mijenja iste retke.`, 'warn')
  return { ok: false, reason: `konflikt: ${path}` }
}

/** Is the commit signed by a key Argo CD trusts? */
export function isTrusted(repo: Repo, c: Commit): boolean {
  if (!c.signature) return false
  return repo.trustedKeys[c.signature.signer] === c.signature.keyId
}

/**
 * AppProject `sourceIntegrity.git.policies[].gpg.mode` (Argo CD 3.5): none | head (target revision only) |
 * strict (target revision and all its ancestors). Returns the ComparisonError text Argo CD shows, or null.
 * Message format follows argo-cd util/sourceintegrity (`GIT/GPG: Failed verifying revision … by '…': unsigned (key_id=)`).
 * Seal commits (`Argocd-gpg-seal` trailer) are not modelled.
 */
export function checkSourceIntegrity(repo: Repo, sha: string, mode: 'none' | 'head' | 'strict'): string | null {
  if (mode === 'none') return null
  const chain = mode === 'head' ? [findCommit(repo, sha)].filter((c): c is Commit => Boolean(c)) : ancestry(repo, sha)
  const problems: string[] = []
  for (const c of chain) {
    if (isTrusted(repo, c)) continue
    const why = c.signature ? `signed with key not in keyring (key_id=${c.signature.keyId})` : 'unsigned (key_id=)'
    problems.push(`GIT/GPG: Failed verifying revision ${c.sha} by '${c.author}': ${why}`)
    if (problems.length >= 10) break
  }
  return problems.length ? problems.join('\n') : null
}

/** Files under the Application path at a revision. */
export function filesAt(repo: Repo, sha: string): RepoFiles {
  const c = findCommit(repo, sha)
  if (!c) return {}
  const out: RepoFiles = {}
  for (const [p, m] of Object.entries(c.files)) if (p.startsWith(`${repo.appPath}/`)) out[p] = m
  return out
}

/** Path of the file that holds the given object at HEAD (first match). */
export function pathOf(repo: Repo, kind: Manifest['kind'], name: string): string | null {
  const files = headCommit(repo).files
  for (const [p, m] of Object.entries(files)) if (m.kind === kind && m.name === name) return p
  return null
}

/**
 * `kustomize edit set image`: set `ref` on every container image of the same image repository at HEAD
 * (the Deployment and, if present, the migration Job), like the kustomize `images:` transformer.
 */
export function imageChanges(repo: Repo, ref: string): FileChange[] {
  const want = parseImage(ref).repo
  const out: FileChange[] = []
  for (const [path, m] of Object.entries(headCommit(repo).files)) {
    const cur = m.fields[PATHS.image]
    if ((m.kind === 'Deployment' || m.kind === 'Job') && typeof cur === 'string' && parseImage(cur).repo === want) out.push({ path, set: { [PATHS.image]: ref } })
  }
  return out
}

/** Every commit ever pushed stays readable in clones, forks and CI caches – the basis of L23's „Git-history reader”. */
export function everCommitted(repo: Repo, predicate: (m: Manifest, path: string, c: Commit) => boolean): Commit[] {
  return repo.commits.filter((c) => Object.entries(c.files).some(([p, m]) => predicate(m, p, c)))
}

export const isBotAuthor = (author: string) => author === KLOPA.ciBot
