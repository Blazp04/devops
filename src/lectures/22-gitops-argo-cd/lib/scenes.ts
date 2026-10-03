/**
 * Thin adapters around the E6 engine for the scene widgets: each wraps the engine state with the few
 * „did the student see it yet?” flags its Goals need (flags survive until the sim is reset).
 */
import {
  PATHS,
  PRESETS,
  createGitOps,
  commitLatency,
  appView,
  FILES,
  headCommit,
  l22Goals,
  replicaFight,
  step,
  type GitOpsState,
} from '../../../engines/gitops'

// ─── Scene 3: from commit to sync (manual sync, polling by default) ─────────

export interface CommitState {
  g: GitOpsState
  seen: { poll: boolean; webhook: boolean; split: boolean; healthy: boolean }
}

export function createCommitScene(): CommitState {
  return { g: createGitOps({ ...PRESETS.l22 }), seen: { poll: false, webhook: false, split: false, healthy: false } }
}

export function stepCommitScene(st: CommitState, dt: number): void {
  step(st.g, dt)
  const g = st.g
  const head = g.repo.commits[g.repo.commits.length - 1]
  if (head && head.t > 0 && head.seenAt !== null) {
    if (head.seenVia === 'poll') st.seen.poll = true
    if (head.seenVia === 'webhook') st.seen.webhook = true
  }
  const v = appView(g)
  if (v.sync === 'Synced' && (v.health === 'Degraded' || v.health === 'Suspended')) st.seen.split = true
  if (g.stats.manualSyncs > 0 && v.sync === 'Synced' && v.health === 'Healthy' && !v.behindGit) st.seen.healthy = true
}

/** Replicas currently written in Git HEAD (null = not set). */
export function gitReplicas(g: GitOpsState): number | null {
  for (const m of Object.values(headCommit(g.repo).files)) {
    if (m.kind === 'Deployment' && m.name === g.mainDeployment) {
      const v = m.fields[PATHS.replicas]
      return typeof v === 'number' ? v : null
    }
  }
  return null
}

/** Latency of the newest commit made in the sim (null before the first one). */
export function newestLatency(g: GitOpsState) {
  const head = g.repo.commits[g.repo.commits.length - 1]
  if (!head || head.t <= 0) return null
  return commitLatency(g, head.sha)
}

// ─── Scene 4: drift (automated sync on, selfHeal and prune off) ──────────────

export interface DriftState {
  g: GitOpsState
  seen: { stayed: boolean; healed: boolean; orphan: boolean; pruned: boolean }
}

export function createDriftScene(): DriftState {
  return { g: createGitOps({ ...PRESETS.l22Auto, webhook: true }), seen: { stayed: false, healed: false, orphan: false, pruned: false } }
}

export function stepDriftScene(st: DriftState, dt: number): void {
  step(st.g, dt)
  const g = st.g
  const v = appView(g)
  if (v.sync === 'OutOfSync' && g.stats.kubectlChanges > 0 && !v.policy.selfHeal && (v.outOfSyncForS ?? 0) >= 3) st.seen.stayed = true
  if (g.stats.kubectlDriftsReverted > 0) st.seen.healed = true
  if (g.argo.resources.some((r) => r.requiresPruning)) st.seen.orphan = true
  if (g.stats.prunes > 0) st.seen.pruned = true
}

// ─── Scene 6: Argo CD and the HPA (replicas in Git + HPA + selfHeal) ────────

export interface HpaState {
  g: GitOpsState
  /** fights counted when ignoreDifferences (alone) was switched on */
  fightsAtIgnore: number | null
  seen: { fight3: boolean; ignoreAloneFight: boolean; peace: boolean }
}

export function createHpaScene(): HpaState {
  return { g: createGitOps({ ...PRESETS.l22Hpa, webhook: true }), fightsAtIgnore: null, seen: { fight3: false, ignoreAloneFight: false, peace: false } }
}

export function stepHpaScene(st: HpaState, dt: number): void {
  step(st.g, dt)
  const g = st.g
  const f = replicaFight(g)
  if (f.fights >= 3) st.seen.fight3 = true
  if (st.fightsAtIgnore !== null && f.ignoreDifferences && !f.respectIgnoreDifferences && f.fights > st.fightsAtIgnore) st.seen.ignoreAloneFight = true
  if (l22Goals(g).hpaPeace) st.seen.peace = true
}

/** „The next commit” in the HPA scene: the Ćevap-petak discount in Git, 20 ↔ 25 (any commit triggers a full sync). */
export function nextPopust(g: GitOpsState): string {
  const dep = headCommit(g.repo).files[FILES.deployment]
  return String(dep?.fields[PATHS.envValue(0)] ?? '20') === '25' ? '20' : '25'
}
