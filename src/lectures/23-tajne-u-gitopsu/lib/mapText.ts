/** Croatian words and small helpers for the flagship map (kept out of the .tsx files: react-refresh rule). */
import type { Approach, Asset, AssetKind } from '../../../engines/access/index.ts'
import type { Place } from './flagship'

export type TagTone = 'bad' | 'ok' | 'old'

/** Which in-cluster controller turns the Git object into a Secret (null: nobody – plain Secret, SOPS via Argo CD, CSI on the node, AVP in Argo CD). */
export const CONTROLLER_NAME: Record<Approach, string | null> = {
  image: null,
  'manifest-env': null,
  configmap: null,
  secret: null,
  'git-secret': null,
  sealed: 'Sealed Secrets',
  sops: null,
  eso: 'ESO',
  csi: null,
  avp: null,
}

/** Where a copy of the value is tagged on the map. */
export const TAG_PLACE: Partial<Record<AssetKind, Place>> = {
  'laptop-file': 'laptop',
  'git-plain': 'git',
  'git-base64': 'git',
  'git-sealed': 'git',
  'git-sops': 'git',
  'git-reference': 'git',
  redis: 'redis',
  etcd: 'etcd',
  'sealed-object': 'controller',
  store: 'store',
  'ci-log': 'cilog',
  memory: 'memory',
}

export function versionsText(vs: readonly number[]): string {
  if (!vs.length) return ''
  const u = [...new Set(vs)].sort((a, b) => a - b)
  return u.length > 2 ? `v${u[0]}–v${u[u.length - 1]}` : u.map((v) => `v${v}`).join(',')
}

const WORD: Partial<Record<AssetKind, string>> = {
  'laptop-file': 'secret.yaml',
  'git-plain': 'čitljivo',
  'git-base64': 'base64',
  'git-sealed': 'šifrat',
  'git-sops': 'SOPS',
  'git-reference': 'adresa',
  redis: 'čitljivo',
  'sealed-object': 'SealedSecret',
  store: 'izvornik',
  'ci-log': 'token',
  memory: 'pamti',
}

/** Tag for one asset: word + versions; red = a still-valid readable copy, green = ciphertext / address, grey = only revoked values. */
export function tagOf(a: Asset): { text: string; tone: TagTone } | null {
  let word = WORD[a.kind]
  if (a.kind === 'etcd') word = a.form === 'encrypted' ? 'šifrat' : 'čitljivo'
  if (!word) return null
  // a SealedSecret / SOPS file whose private key leaked is ciphertext that opens: readable from Git history
  const opened = (a.kind === 'git-sealed' || a.kind === 'git-sops') && a.valid && a.readers.includes('git-reader')
  if (opened) word = 'otvoreno'
  const readable = a.form === 'plain' || a.form === 'base64' || opened
  const tone: TagTone = !a.valid && readable ? 'old' : readable ? 'bad' : 'ok'
  const v = versionsText(a.versions)
  return { text: v ? `${word} ${v}` : word, tone }
}

export function podCaption(workloadId: string): string {
  return workloadId === 'api' ? 'api' : workloadId === 'worker' ? 'worker' : workloadId
}

/** The part of a kubelet message that matters on the map (`secret "klopa-db" not found`), ≤ ~40 characters. */
export function shortMessage(msg: string | null): string {
  if (!msg) return ''
  const m = /secret "[^"]+" not found/.exec(msg) ?? /failed to mount secrets store objects/.exec(msg)
  const t = m ? m[0] : msg
  return t.length > 42 ? `${t.slice(0, 41)}…` : t
}

/** Splits an engine sentence into prose and code (commands, file and object names), so the code can be set in Plex Mono. */
export function codeSegments(text: string): { t: string; code: boolean }[] {
  const re = /(kubectl [\w .\-/=]+|base64 -d|[\w-]+\.ya?ml\b|klopa-[a-z]+\b|\betcd\b)/g
  const out: { t: string; code: boolean }[] = []
  let last = 0
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0
    if (i > last) out.push({ t: text.slice(last, i), code: false })
    out.push({ t: m[0].trimEnd(), code: true })
    if (m[0] !== m[0].trimEnd()) out.push({ t: ' ', code: false })
    last = i + m[0].length
  }
  if (last < text.length) out.push({ t: text.slice(last), code: false })
  return out
}
