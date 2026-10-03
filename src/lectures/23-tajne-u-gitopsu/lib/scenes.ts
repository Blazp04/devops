/**
 * Numbers and frames for the smaller scenes, computed once from the shared engines (never re-implemented here):
 * - E6 (src/engines/gitops): the leaked-commit history („Dilema”) and the Sealed Secrets key ring.
 * - E5 (src/engines/access): the incident card, „gdje živi čitljiva vrijednost” and the rotation times.
 */
import {
  advance,
  commitGraph,
  commitPlainSecret,
  commitSealedSecret,
  createGitOps,
  deleteFileFromGit,
  FILES,
  gitLeaks,
  leakSealingKeys,
  PRESETS,
  renewSealingKey,
  rotateSecret as rotateInStore,
  secretView,
} from '../../../engines/gitops/index.ts'
import type { GitOpsState } from '../../../engines/gitops/index.ts'
import {
  APPROACHES,
  compareApproaches,
  createAccessPreset,
  eyeSummary,
  gitLog,
  L23_APPROACHES,
  podView,
  rotationEstimate,
  setApproach,
  setConsume,
  setCsiRotation,
  setEsoRefreshInterval,
  step,
  toBase64,
} from '../../../engines/access/index.ts'
import type { Approach, AssetKind } from '../../../engines/access/index.ts'
import { createStart, INCIDENT_AT, SEED } from './flagship.ts'

export { INCIDENT_AT }

/* ───────────── Incident 23 (E5, the flagship's „incident” start) ───────────── */

export interface IncidentNumbers {
  apiReady: number
  apiTotal: number
  apiStatus: string
  apiMessage: string
  workerStatus: string
  smsRed: number
  eyesTotal: number
  leakSha: string
}

let incidentCache: IncidentNumbers | null = null

/** The numbers on the incident card = the flagship's „incident” start (preset l23-rebuild + novi klaster, seed 42, INCIDENT_AT s after the rebuild). */
export function incidentNumbers(): IncidentNumbers {
  if (incidentCache) return incidentCache
  const s = createStart('incident')
  const api = s.pods.filter((p) => p.workloadId === 'api')
  const worker = podView(s, 'sms').find((p) => p.workloadId === 'worker')
  const eyes = eyeSummary(s, 'sms')
  const leak = gitLog(s, 'sms').find((c) => c.readable)
  incidentCache = {
    apiReady: api.filter((p) => p.status === 'Running').length,
    apiTotal: api.length,
    apiStatus: api[0]?.status ?? '',
    apiMessage: api[0]?.message ?? '',
    workerStatus: worker?.label ?? '',
    smsRed: eyes.red,
    eyesTotal: eyes.total,
    leakSha: leak?.sha ?? '',
  }
  return incidentCache
}

/* ───────────── Scene 1 „Dilema”: a leaked commit in Git history (E6) ───────────── */

export interface LeakCommit {
  short: string
  message: string
  leak: boolean
  removal: boolean
}

export interface LeakFrame {
  commits: LeakCommit[]
  /** values readable from Git history that still work */
  exposedCurrent: string[]
  /** values readable from Git history that were rotated out */
  exposedStale: string[]
  /** Argo CD's Redis holds a still-valid readable render */
  cache: boolean
  /** the SMS key value the cluster uses now */
  current: string
}

export interface LeakScene {
  frames: LeakFrame[]
  value: string
  base64: string
  leakShort: string
  removalShort: string
}

function snapLeak(s: GitOpsState): LeakFrame {
  const leaks = gitLeaks(s)
  const commits = commitGraph(s)
    .slice()
    .reverse()
    .map((c) => ({ short: c.short, message: c.message, leak: c.message.startsWith('Dodaj secret'), removal: c.message.startsWith('Ukloni secret') }))
  return { commits, exposedCurrent: leaks.exposedCurrent, exposedStale: leaks.exposedStale, cache: leaks.argoCacheHasPlaintext, current: secretView(s).storeValue ?? '' }
}

let leakCache: LeakScene | null = null

/**
 * E6 preset l22Auto (Klopa 2.0.1 in Git, automated sync): ① history before, ② „Dodaj secret-sms.yaml”, ③ the same
 * (anyone with a clone decodes it), ④ „Ukloni secret-sms.yaml” – the value is still readable from history,
 * ⑤ rotation in the store – the leaked value is now stale.
 */
export function leakScene(): LeakScene {
  if (leakCache) return leakCache
  const s = createGitOps({ ...PRESETS.l22Auto, initialTag: '2.0.1' })
  advance(s, 20)
  const f0 = snapLeak(s)
  const value = secretView(s).storeValue ?? 'sms-kljuc-v1'
  commitPlainSecret(s)
  advance(s, 30)
  const f1 = snapLeak(s)
  deleteFileFromGit(s, FILES.secret)
  advance(s, 30)
  const f3 = snapLeak(s)
  rotateInStore(s)
  advance(s, 5)
  const f4 = snapLeak(s)
  // one leak, one id: the leaked commit is shown with the incident's hash (E5), so the card, the hook and this scene agree
  const leakSha = incidentNumbers().leakSha
  const relabel = (f: LeakFrame): LeakFrame => (leakSha ? { ...f, commits: f.commits.map((c) => (c.leak ? { ...c, short: leakSha } : c)) } : f)
  const frames = [f0, f1, f1, f3, f4].map(relabel)
  const leak = frames[1].commits.find((c) => c.leak)
  const removal = frames[3].commits.find((c) => c.removal)
  leakCache = { frames, value, base64: toBase64(value), leakShort: leak?.short ?? '', removalShort: removal?.short ?? '' }
  return leakCache
}

/* ───────────── Scene 2 „Sealed Secrets”: the key ring (E6) ───────────── */

export interface SealedKey {
  id: string
  leaked: boolean
  backedUp: boolean
}

export interface SealedScene {
  /** key ring after the first key, after two renewals, after the leak, after the fix (new key) */
  rings: SealedKey[][]
  /** readable from Git after the leak / after the fix */
  exposedAfterLeak: string[]
  exposedAfterFix: string[]
  valueBefore: string
  valueAfter: string
}

let sealedCache: SealedScene | null = null

function keyRing(s: GitOpsState): SealedKey[] {
  return secretView(s).sealing.keys.map((k) => ({ id: k.id, leaked: k.leaked, backedUp: k.backedUp }))
}

/** E6 preset l23 (SealedSecret in Git): renewals add keys and change nothing else; a leak opens every SealedSecret; new key + rotate + re-seal fixes it. */
export function sealedScene(): SealedScene {
  if (sealedCache) return sealedCache
  const s = createGitOps({ ...PRESETS.l23 })
  advance(s, 30)
  const r0 = keyRing(s)
  const valueBefore = secretView(s).storeValue ?? ''
  renewSealingKey(s)
  renewSealingKey(s)
  const r1 = keyRing(s)
  leakSealingKeys(s)
  const r2 = keyRing(s)
  const exposedAfterLeak = gitLeaks(s).exposedCurrent
  renewSealingKey(s)
  rotateInStore(s)
  commitSealedSecret(s)
  advance(s, 40)
  const r3 = keyRing(s)
  sealedCache = { rings: [r0, r1, r2, r3], exposedAfterLeak, exposedAfterFix: gitLeaks(s).exposedCurrent, valueBefore, valueAfter: secretView(s).storeValue ?? '' }
  return sealedCache
}

/** „sealed-secrets-key7e5ff” → „…key7e5ff” for small labels. */
export function shortKey(id: string): string {
  return id.replace('sealed-secrets-', '')
}

/* ───────────── Scene 4 „Ostale mogućnosti”: where the plaintext lives (E5) ───────────── */

export type Cell = 'readable' | 'cipher' | 'address' | 'none'

export interface WhereRow {
  approach: Approach
  label: string
  git: Cell
  redis: Cell
  etcd: Cell
  pod: Cell
  red: number
}

let whereCache: WhereRow[] | null = null

/** compareApproaches(L23_APPROACHES) – each approach built fresh, clean history, no former team member. */
export function whereRows(): WhereRow[] {
  if (whereCache) return whereCache
  const cmp = compareApproaches(L23_APPROACHES)
  const has = (a: Approach, k: AssetKind) => cmp[a]?.plaintext.includes(k) ?? false
  whereCache = L23_APPROACHES.map((a) => {
    const form = APPROACHES[a].gitForm
    const git: Cell = has(a, 'git-base64') || has(a, 'git-plain') ? 'readable' : form === 'sealed' || form === 'sops' ? 'cipher' : form === 'reference' ? 'address' : 'none'
    return {
      approach: a,
      label: APPROACHES[a].label,
      git,
      redis: has(a, 'redis') ? 'readable' : 'none',
      etcd: has(a, 'etcd') ? 'readable' : 'none',
      pod: has(a, 'pod-file') || has(a, 'pod-env') ? 'readable' : 'none',
      red: cmp[a]?.red.length ?? 0,
    }
  })
  return whereCache
}

/* ───────────── „Kada nova vrijednost stigne do Poda” (E5 rotationEstimate) ───────────── */

export interface RotationRow {
  id: string
  label: string
  parts: { what: string; real: number }[]
  realWorst: number
  needs: string[]
  shortcuts: string[]
}

let rotationCache: RotationRow[] | null = null

/** Worst case per approach with volume consumers (preset l23, explorer mode, seed 42), in real-time seconds. */
export function rotationRows(): RotationRow[] {
  if (rotationCache) return rotationCache
  const cases: { id: string; label: string; approach: Approach; setup?: (s: ReturnType<typeof createAccessPreset>) => void }[] = [
    { id: 'eso', label: 'ESO, refreshInterval: 30s', approach: 'eso' },
    { id: 'csi', label: 'CSI driver, rotacija uključena', approach: 'csi', setup: (s) => setCsiRotation(s, true) },
    { id: 'sealed', label: 'SealedSecret (novi commit)', approach: 'sealed' },
    { id: 'sops', label: 'SOPS (novi commit)', approach: 'sops' },
    { id: 'eso1h', label: 'ESO, zadani refreshInterval', approach: 'eso', setup: (s) => void setEsoRefreshInterval(s, 3600) },
    { id: 'avp', label: 'argocd-vault-plugin', approach: 'avp' },
  ]
  rotationCache = cases.map((c) => {
    const s = createAccessPreset('l23', { seed: SEED, whatIf: true })
    setApproach(s, 'all', c.approach)
    setConsume(s, 'all', 'volume')
    c.setup?.(s)
    step(s, 1)
    const e = rotationEstimate(s, 'sms')
    return { id: c.id, label: c.label, parts: e.parts.map((p) => ({ what: p.what, real: p.real })), realWorst: e.realWorst ?? Number.POSITIVE_INFINITY, needs: e.needs, shortcuts: e.shortcuts }
  })
  return rotationCache
}

/** 270 → „4,5 min”, 86670 → „24 h 5 min”, 33 → „33 s” */
export function fmtReal(sec: number): string {
  if (sec < 90) return `${Math.round(sec)} s`
  if (sec < 3600) return `${(Math.round((sec / 60) * 10) / 10).toString().replace('.', ',')} min`
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec - h * 3600) / 60)
  return m ? `${h} h ${m} min` : `${h} h`
}
