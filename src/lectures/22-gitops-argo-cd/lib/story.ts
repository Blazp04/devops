/**
 * Deterministic E6 runs behind the step-by-step animations and the terminal sessions, so every sha, time and line of
 * CLI output in the text comes from the engine (preset l22Auto + webhook, seed 22), not from the author's head.
 */
import {
  PRESETS,
  advance,
  argocdAppGet,
  commitBadImage,
  createGitOps,
  gitRevert,
  helmList,
  kubectlGetPods,
  podsView,
  type GitOpsState,
} from '../../../engines/gitops'
import type { TerminalLine } from '../../../kit'

export interface RevertStory {
  prevShort: string
  badShort: string
  badMessage: string
  revertShort: string
  /** seconds from the bad commit to Synced */
  badSyncedAfter: number
  /** seconds from the sync to Degraded (progressDeadlineSeconds: 60 in the Klopa YAML) */
  degradedAfter: number
  /** seconds from the revert commit to Healthy */
  revertHealthyAfter: number
  stalled: { oldReady: number; newBroken: number }
  podsLines: string[]
  appGetLines: string[]
  helmLines: string[]
}

function round1(v: number) {
  return Math.round(v * 10) / 10
}

let cache: RevertStory | null = null

/** Bad commit (`2.0.l`) → Synced + Degraded → git revert → Healthy, on the engine. */
export function revertStory(): RevertStory {
  if (cache) return cache
  const s: GitOpsState = createGitOps({ ...PRESETS.l22Auto, webhook: true })
  const prevShort = s.repo.head.slice(0, 7)
  advance(s, 1)
  const bad = commitBadImage(s, 'typo')
  const badSha = bad.ok ? bad.sha : s.repo.head
  advance(s, 12)
  const pods = podsView(s)
  const stalled = { oldReady: pods.filter((p) => p.ready && !p.broken).length, newBroken: pods.filter((p) => p.broken).length }
  const podsLines = kubectlGetPods(s)
  advance(s, 60)
  // the sim keeps the manifests in one flat folder; the Application on the page reads the Kustomize overlay
  const appGetLines = argocdAppGet(s)
    .slice(0, 11)
    .map((l) => (l.startsWith('Path:') ? l.replace(s.repo.appPath, `${s.repo.appPath}/overlays/prod`) : l))
  const badCommit = s.repo.commits.find((c) => c.sha === badSha)
  const degradedEvt = s.events.find((e) => e.text.includes('Progressing → Degraded'))
  const syncedAt = badCommit?.syncedAt ?? 0
  const rev = gitRevert(s)
  const revSha = rev.ok ? rev.sha : s.repo.head
  const revT = s.t
  advance(s, 40)
  const revCommit = s.repo.commits.find((c) => c.sha === revSha)
  cache = {
    prevShort,
    badShort: badSha.slice(0, 7),
    badMessage: badCommit?.message ?? '',
    revertShort: revSha.slice(0, 7),
    badSyncedAfter: round1(syncedAt - (badCommit?.t ?? 0)),
    degradedAfter: round1((degradedEvt?.t ?? 0) - syncedAt),
    revertHealthyAfter: round1((revCommit?.healthyAt ?? revT) - revT),
    stalled,
    podsLines,
    appGetLines,
    helmLines: helmList(),
  }
  return cache
}

/** Lana's terminal for the rollback scene: the stalled rollout, Argo CD's verdict, the revert. */
export function revertTerminal(r: RevertStory): TerminalLine[] {
  const firstBad = r.podsLines.findIndex((l) => l.includes('ImagePullBackOff'))
  return [
    { cmd: 'kubectl get pods -n klopa' },
    ...r.podsLines.map((l, i): TerminalLine => (i === firstBad ? { out: l, note: 'slika 2.0.l ne postoji – stari Podovi i dalje rade' } : { out: l })),
    { cmd: 'argocd app get klopa-api' },
    ...r.appGetLines.map((l): TerminalLine => (l.startsWith('Health Status') ? { out: l, note: 'Synced i Degraded u isto vrijeme', who: 'davor' } : { out: l })),
    { comment: 'popravak: novi commit koji poništava loš commit – i on ide kroz pull request' },
    { cmd: 'cd ~/klopa-config' },
    { cmd: 'git switch -c revert-2.0.l' },
    { cmd: `git revert --no-edit ${r.badShort}` },
    { cmd: 'git push origin revert-2.0.l' },
    { comment: 'pull request u main – hitni pregled, pa Argo CD sinkronizira' },
  ]
}
