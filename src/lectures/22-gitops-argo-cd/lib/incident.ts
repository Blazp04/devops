/**
 * „Gurati ili povlačiti” lab on the E6 engine. The incident card numbers come from here:
 * preset l22Push, seed 22 → „CI izda 2.0.1” (CI applies with its own cluster key) → „Ručni kubectl edit (02:00)”
 * → Git and the cluster differ in 2 fields (image, POPUST_CEVAP_PETAK) and nobody was warned (0 drifts detected).
 * The same steps in the pull model (l22Auto + webhook): the CI bot commits to the config repo, Argo CD pulls and
 * notices the manual edit within a second (OutOfSync).
 */
import {
  FILES,
  PATHS,
  PRESETS,
  createGitOps,
  gitMatchesCluster,
  headCommit,
  step,
  type GitOpsConfig,
  type GitOpsState,
} from '../../../engines/gitops'

export const LAB_SEED = 22
export const PUSH_CFG: GitOpsConfig = { ...PRESETS.l22Push, seed: LAB_SEED }
export const PULL_CFG: GitOpsConfig = { ...PRESETS.l22Auto, webhook: true, seed: LAB_SEED }
export const ENV_PATH = PATHS.envValue(0)
/** The value someone typed at 02:00 (Git keeps 20). */
export const NIGHT_VALUE = '25'

export interface LabState {
  g: GitOpsState
  /** goals survive switching the model (each switch starts a fresh engine) */
  done: { push: boolean; pull: boolean; guard: boolean }
}

export function createLab(): LabState {
  return { g: createGitOps(PUSH_CFG), done: { push: false, pull: false, guard: false } }
}

export function stepLab(st: LabState, dt: number): void {
  step(st.g, dt)
  const g = st.g
  const diffs = gitMatchesCluster(g).diffs.length
  if (g.mode === 'push' && diffs >= 2 && g.stats.kubectlChanges > 0 && g.stats.driftsDetected === 0) st.done.push = true
  const live = liveDeployment(g)
  if (g.mode === 'pull' && g.stats.driftsDetected > 0 && g.stats.kubectlChanges > 0 && String(live?.fields[PATHS.image] ?? '').includes(':2.0.1')) st.done.pull = true
  if (g.mode === 'pull' && g.repo.protection.requirePullRequest && g.stats.rejectedCommits > 0) st.done.guard = true
}

export function switchModel(st: LabState, mode: 'push' | 'pull'): void {
  st.g = createGitOps(mode === 'push' ? PUSH_CFG : PULL_CFG)
}

export function liveDeployment(g: GitOpsState) {
  return Object.values(g.cluster.objects).find((o) => o.kind === 'Deployment' && o.name === g.mainDeployment)
}

export interface FieldRow {
  key: 'image' | 'env'
  label: string
  git: string
  live: string
  differs: boolean
}

/** The two fields of the story, in Git (HEAD) and live. */
export function storyFields(g: GitOpsState): { rows: FieldRow[]; diffs: number } {
  const gitDep = headCommit(g.repo).files[FILES.deployment]
  const live = liveDeployment(g)
  const diffs = gitMatchesCluster(g).diffs
  const val = (v: unknown) => (v === undefined ? '(nema)' : String(v))
  const row = (key: FieldRow['key'], path: string, label: string): FieldRow => {
    const gv = val(gitDep?.fields[path])
    const lv = live ? val(live.fields[path]) : '(nema Deploymenta)'
    return { key, label, git: gv, live: lv, differs: diffs.some((d) => d.path === path) }
  }
  return { rows: [row('image', PATHS.image, 'image'), row('env', ENV_PATH, 'POPUST_CEVAP_PETAK')], diffs: diffs.length }
}
