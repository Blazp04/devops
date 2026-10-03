import type { IntOrPercent, KlopaApiVersion } from '../../../engines/cluster'

/** The four images of the flagship (Klopa's version chain: 1.3.2 blue → 1.4.0 violet → broken 1.5.0 rose). */
export const IMAGE_OPTIONS: { value: KlopaApiVersion; label: string; title: string }[] = [
  { value: '1.3.2', label: '1.3.2', title: 'klopa-api:1.3.2 – trenutačna verzija' },
  { value: '1.4.0', label: '1.4.0', title: 'klopa-api:1.4.0 – vegetarijanski meni' },
  { value: '1.5.0-crash', label: '1.5.0 (ruši se)', title: 'klopa-api:1.5.0 – proces izađe 2 s nakon pokretanja' },
  { value: '1.5.0-never-ready', label: '1.5.0 (nikad spremna)', title: 'klopa-api:1.5.0 – radi, ali /ready nikad ne odgovori 200' },
]

export const BROKEN: KlopaApiVersion[] = ['1.5.0-crash', '1.5.0-never-ready']

export function imageLabel(v: KlopaApiVersion): string {
  return IMAGE_OPTIONS.find((o) => o.value === v)?.label ?? v
}

/** maxSurge / maxUnavailable choices of the spec: 0, 1, 2, 25 %, 50 %, 100 %. */
export const FENCE_OPTIONS: IntOrPercent[] = [0, 1, 2, '25%', '50%', '100%']

export function fenceKey(v: IntOrPercent): string {
  return String(v)
}

export function parseFence(key: string): IntOrPercent {
  return FENCE_OPTIONS.find((f) => String(f) === key) ?? 0
}

/** „25 %” (Croatian: space before %), plain integers as they are. */
export function fenceLabel(v: IntOrPercent): string {
  return typeof v === 'string' ? `${parseFloat(v)} %` : String(v)
}

/** The same in code font, as the YAML has it: `25%`. */
export function fenceYaml(v: IntOrPercent): string {
  return typeof v === 'string' ? v : String(v)
}

export const FENCE_SEG = FENCE_OPTIONS.map((f) => ({ value: fenceKey(f), label: fenceLabel(f) }))

/** „1,0 s” */
export function secs(v: number, digits = 1): string {
  return `${v.toLocaleString('hr-HR', { minimumFractionDigits: digits, maximumFractionDigits: digits })} s`
}
