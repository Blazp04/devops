/** Small pure helpers shared by the E6 modules (no state mutation except `emit`). */
import type { EventKind, EventTone, FieldValue, Fields, GitOpsState, Kind } from './types.ts'

export const EVENT_CAP = 50

/** Append an event for the kit EventLog (capped). */
export function emit(state: GitOpsState, kind: EventKind, text: string, tone: EventTone = 'neutral'): void {
  state.events.push({ id: state.nextEventId++, t: round1(state.t), kind, text, tone })
  if (state.events.length > EVENT_CAP) state.events.splice(0, state.events.length - EVENT_CAP)
}

export const round1 = (v: number) => Math.round(v * 10) / 10
export const round2 = (v: number) => Math.round(v * 100) / 100

/** FNV-1a 32-bit. */
export function fnv1a(s: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** Deterministic hex string of `len` chars (not cryptographic – only an identifier for the sim). */
export function hexHash(s: string, len: number): string {
  let out = ''
  let i = 0
  while (out.length < len) {
    out += fnv1a(`${i}:${s}`).toString(16).padStart(8, '0')
    i++
  }
  return out.slice(0, len)
}

/** Kubernetes "safe encoding" alphabet used in ReplicaSet/Pod name suffixes. */
const SAFE = 'bcdfghjklmnpqrstvwxz2456789'

export function safeHash(s: string, len: number): string {
  let h = fnv1a(s)
  let out = ''
  for (let i = 0; i < len; i++) {
    out += SAFE[h % SAFE.length]
    h = Math.floor(h / SAFE.length)
    if (h === 0) h = fnv1a(`${i}${s}${out}`)
  }
  return out
}

export function safeRandom(next: () => number, len: number): string {
  let out = ''
  for (let i = 0; i < len; i++) out += SAFE[Math.floor(next() * SAFE.length)]
  return out
}

export const objKey = (kind: Kind, name: string) => `${kind}/${name}`

export function cloneFields(f: Fields): Fields {
  return { ...f }
}

export function fieldsEqual(a: Fields, b: Fields): boolean {
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  for (const k of ka) if (a[k] !== b[k]) return false
  return true
}

/** All fields below `/spec/template/` – the Pod template (its hash names the ReplicaSet). */
export function templateOf(fields: Fields): Fields {
  const out: Fields = {}
  for (const k of Object.keys(fields).sort()) if (k.startsWith('/spec/template/')) out[k] = fields[k]
  return out
}

export function templateHash(fields: Fields): string {
  const t = templateOf(fields)
  return safeHash(
    Object.keys(t)
      .map((k) => `${k}=${String(t[k])}`)
      .join('\n'),
    10,
  )
}

/** Parse `registry/name:tag@sha256:…` → tag and digest. */
export function parseImage(ref: string): { repo: string; tag: string; digest: string | null } {
  const at = ref.indexOf('@')
  const digest = at >= 0 ? ref.slice(at + 1) : null
  const noDigest = at >= 0 ? ref.slice(0, at) : ref
  const slash = noDigest.lastIndexOf('/')
  const colon = noDigest.lastIndexOf(':')
  if (colon > slash) return { repo: noDigest.slice(0, colon), tag: noDigest.slice(colon + 1), digest }
  return { repo: noDigest, tag: 'latest', digest }
}

export function fakeDigest(tag: string): string {
  return `sha256:${hexHash(`klopa-api:${tag}`, 64)}`
}

/** Kubernetes intOrPercent: '25%' → percentage of n; number → itself. */
export function resolveIntOrPercent(v: FieldValue | undefined, n: number, roundUp: boolean, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.floor(v))
  if (typeof v === 'string') {
    const m = /^(\d+)%$/.exec(v.trim())
    if (m) {
      const raw = (Number(m[1]) * n) / 100
      return roundUp ? Math.ceil(raw) : Math.floor(raw)
    }
    const asInt = Number(v)
    if (Number.isInteger(asInt) && asInt >= 0) return asInt
  }
  return fallback
}

/** Rolling-update fence posts (deployment_util.go ResolveFenceposts). */
export function fenceposts(maxSurge: FieldValue | undefined, maxUnavailable: FieldValue | undefined, n: number): { surge: number; unavailable: number } {
  const surge = resolveIntOrPercent(maxSurge ?? '25%', n, true, Math.ceil(n * 0.25))
  let unavailable = resolveIntOrPercent(maxUnavailable ?? '25%', n, false, Math.floor(n * 0.25))
  if (surge === 0 && unavailable === 0) unavailable = 1
  return { surge, unavailable: Math.min(unavailable, n) }
}

/** '30s' | '2m' | '1h' | 30 → seconds. Invalid → fallback. */
export function parseDurationS(v: FieldValue | undefined, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
  if (typeof v !== 'string') return fallback
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(v.trim())
  if (!m) return fallback
  const n = Number(m[1])
  const unit = m[2] ?? 's'
  const s = unit === 'ms' ? n / 1000 : unit === 'm' ? n * 60 : unit === 'h' ? n * 3600 : n
  return s > 0 ? s : fallback
}

/** Integer replicas from a field value; null when the value is not a valid non-negative integer. */
export function asReplicas(v: FieldValue | undefined): number | null {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return v
  return null
}

export function fmtValue(v: FieldValue | undefined): string {
  if (v === undefined) return '—'
  return typeof v === 'string' ? v : String(v)
}

/** Croatian decimal-comma seconds for event texts: 12.3 → "12,3 s". */
export function fmtS(v: number): string {
  const r = Math.round(v * 10) / 10
  return `${r.toLocaleString('hr-HR', { maximumFractionDigits: 1 })} s`
}

// ─── Croatian plurals, field labels, kubectl-style durations ─────────────────

const PLURAL_HR = new Intl.PluralRules('hr')

/**
 * Croatian count agreement: forms = [one, few, other], e.g. ['Pod', 'Poda', 'Podova'] → „1 Pod”, „2 Poda”, „5 Podova”,
 * „21 Pod”. Built on Intl.PluralRules('hr') (styleGuide). Non-integers use the `other` form.
 */
export function plural(n: number, forms: readonly [string, string, string]): string {
  const cat = Number.isInteger(n) ? PLURAL_HR.select(n) : 'other'
  const word = cat === 'one' ? forms[0] : cat === 'few' ? forms[1] : forms[2]
  return `${n} ${word}`
}

/** JSON pointer → kubectl-style dotted path: /spec/template/spec/containers/0/image → spec.template.spec.containers[0].image */
export function dottedPath(pointer: string): string {
  let out = ''
  for (const raw of pointer.split('/').slice(1)) {
    const seg = raw.replace(/~1/g, '/').replace(/~0/g, '~')
    if (/^\d+$/.test(seg)) out += `[${seg}]`
    else out += out ? `.${seg}` : seg
  }
  return out
}

const FIELD_LABELS: Record<string, string> = {
  '/spec/replicas': 'replicas',
  '/spec/template/spec/containers/0/image': 'slika (image)',
  '/spec/paused': 'paused',
  '/spec/minReplicas': 'minReplicas',
  '/spec/maxReplicas': 'maxReplicas',
  '/spec/selector/app': 'selector Servicea (app)',
  '/spec/template/spec/containers/0/resources/limits/memory': 'ograničenje memorije (limits.memory)',
  '/spec/template/spec/containers/0/resources/requests/cpu': 'zahtjev CPU-a (requests.cpu)',
  '/spec/template/spec/containers/0/readinessProbe/httpGet/path': 'provjera spremnosti (readinessProbe)',
  '/spec/template/spec/containers/0/livenessProbe/httpGet/path': 'provjera živosti (livenessProbe)',
}

/** Readable name of a field for events and the diff view: known fields get a Croatian label, the rest the dotted path. */
export function fieldLabel(pointer: string): string {
  if (!pointer) return ''
  return FIELD_LABELS[pointer] ?? dottedPath(pointer)
}

/** Port of k8s.io/apimachinery/pkg/util/duration.HumanDuration (kubectl AGE / LAST SEEN columns). */
export function humanDuration(sec: number): string {
  const seconds = Math.floor(sec)
  if (seconds < -1) return '<invalid>'
  if (seconds < 0) return '0s'
  if (seconds < 60 * 2) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 10) {
    const s = seconds % 60
    return s === 0 ? `${minutes}m` : `${minutes}m${s}s`
  }
  if (minutes < 60 * 3) return `${minutes}m`
  const hours = Math.floor(seconds / 3600)
  if (hours < 8) {
    const m = minutes % 60
    return m === 0 ? `${hours}h` : `${hours}h${m}m`
  }
  if (hours < 48) return `${hours}h`
  if (hours < 24 * 8) {
    const h = hours % 24
    return h === 0 ? `${Math.floor(hours / 24)}d` : `${Math.floor(hours / 24)}d${h}h`
  }
  if (hours < 24 * 365 * 2) return `${Math.floor(hours / 24)}d`
  if (hours < 24 * 365 * 8) {
    const dy = Math.floor(hours / 24) % 365
    return dy === 0 ? `${Math.floor(hours / 24 / 365)}y` : `${Math.floor(hours / 24 / 365)}y${dy}d`
  }
  return `${Math.floor(hours / 24 / 365)}y`
}

/** Sim time 0 = 2026-10-01 12:00:00 CEST (Klopa lunch, L24 „Incident u 12:00”) – for CLI dates. */
export const SIM_EPOCH_MS = Date.UTC(2026, 9, 1, 10, 0, 0)

/** `2026-10-01 12:03:20 +0200 CEST` for sim time t (Go time.String layout used by the argocd CLI). */
export function simDate(t: number): string {
  const d = new Date(SIM_EPOCH_MS + Math.round(t) * 1000 + 2 * 3600 * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0200 CEST`
}
