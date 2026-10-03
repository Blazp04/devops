/**
 * Shared labels and tones for the lecture's drawings (pure TS, no React).
 * Status words stay in English because Argo CD shows them that way (Synced, OutOfSync, Healthy…);
 * every status also gets a mark, so it never depends on colour alone.
 */
import type { GitOpsEvent, HealthCode, SyncCode } from '../../../engines/gitops'
import { fmt, type SimEvent } from '../../../kit'

export const SYNC_MARK: Record<SyncCode, string> = { Synced: '✓', OutOfSync: '!', Unknown: '?' }
export const HEALTH_MARK: Record<HealthCode, string> = {
  Healthy: '♥',
  Progressing: '↻',
  Degraded: '✗',
  Suspended: '‖',
  Missing: '∅',
  Unknown: '?',
}

/** Pencil colour for a sync status. */
export function syncInk(s: SyncCode | null): string {
  if (s === 'Synced') return 'var(--green)'
  if (s === 'OutOfSync') return 'var(--orange)'
  return 'var(--ink-3)'
}

/** Pencil colour for a health status. */
export function healthInk(h: HealthCode | null): string {
  switch (h) {
    case 'Healthy':
      return 'var(--green)'
    case 'Progressing':
      return 'var(--pen)'
    case 'Degraded':
      return 'var(--red)'
    case 'Missing':
      return 'var(--orange)'
    default:
      return 'var(--ink-3)'
  }
}

/** Kit Badge / Stat tone for a sync status. */
export function syncTone(s: SyncCode): 'ok' | 'warn' | 'neutral' {
  return s === 'Synced' ? 'ok' : s === 'OutOfSync' ? 'warn' : 'neutral'
}

/** Kit Badge / Stat tone for a health status. */
export function healthTone(h: HealthCode): 'ok' | 'warn' | 'bad' | 'blue' | 'neutral' {
  if (h === 'Healthy') return 'ok'
  if (h === 'Progressing') return 'blue'
  if (h === 'Degraded') return 'bad'
  if (h === 'Missing') return 'warn'
  return 'neutral'
}

/** „Croatian gloss” of each health word, for text next to the badge. */
export const HEALTH_GLOSS: Record<HealthCode, string> = {
  Healthy: 'radi kako treba',
  Progressing: 'još se uvodi',
  Degraded: 'ne radi kako treba',
  Suspended: 'pauzirano',
  Missing: 'nema ga u klasteru',
  Unknown: 'nepoznato',
}

export const SYNC_GLOSS: Record<SyncCode, string> = {
  Synced: 'klaster odgovara Gitu',
  OutOfSync: 'klaster se razlikuje od Gita',
  Unknown: 'nema usporedbe',
}

/** Seconds with a decimal comma: 13,7 s. */
export function secs(v: number, digits = 1): string {
  return `${fmt.num(v, Number.isInteger(v) ? 0 : digits)} s`
}

/** Shorten a long value for a drawing: keeps the end of an image reference (tag), the start of anything else. */
export function shortValue(v: unknown, max = 22): string {
  if (v === undefined) return '(nema)'
  const s = String(v)
  const img = /\/([a-z0-9-]+):([^@]+)(@sha256:[0-9a-f]+)?$/.exec(s)
  if (img) return `${img[1]}:${img[2]}${img[3] ? '@…' : ''}`
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

/** Commit message shortened for a drawing. */
export function shortMessage(m: string, max: number): string {
  return m.length > max ? `${m.slice(0, max - 1)}…` : m
}

/** Raw English API-server errors (inside an engine message) → a short Croatian summary for the handwritten log. */
const API_ERRORS: [RegExp, string][] = [
  [/[\w.]+ "[^"]*" is invalid: spec\.replicas: Invalid value: "[^"]*"[^;()]*[^;()\s]/, 'replicas nije broj – API poslužitelj odbio je manifest'],
  [/[\w.]+ "[^"]*" is invalid: spec\.replicas[^;()]*[^;()\s]/, 'neispravan replicas – API poslužitelj odbio je manifest'],
  [/[\w.]+ "[^"]*" is invalid: [^;()]*[^;()\s]/, 'API poslužitelj odbio je manifest'],
]

/** Handwriting in the event log stays short (≤ ~108 characters): cut a long engine message at a clause boundary. */
function shorten(raw: string): string {
  let t = raw
  for (const [re, hr] of API_ERRORS) {
    if (re.test(t)) {
      t = t.replace(re, hr)
      break
    }
  }
  if (t.length <= 108) return t
  const i = Math.max(t.lastIndexOf('; ', 104), t.lastIndexOf('. ', 104), t.lastIndexOf(' – ', 104))
  if (i > 40) return `${t.slice(0, i)}.`
  const j = t.lastIndexOf(', ', 104)
  if (j > 40) return `${t.slice(0, j)} …`
  const k = t.lastIndexOf(' ', 103)
  return `${t.slice(0, k > 40 ? k : 103)} …`
}

/** The newest engine events for the kit EventLog (engine events already carry id, t, text, tone). */
export function logEvents(events: GitOpsEvent[], max = 20): SimEvent[] {
  return events.slice(-max).map((e) => ({ id: e.id, t: e.t, tone: e.tone, text: shorten(e.text) }))
}
