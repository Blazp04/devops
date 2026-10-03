/** Croatian number and plural helpers for this lecture (decimal comma, Intl.PluralRules('hr') via the kit). */
import { fmt, plural } from '../../../kit'

export const fmtNum = (v: number, digits = 0) => fmt.num(v, digits)

export const messages = (n: number) => plural(n, ['poruka', 'poruke', 'poruka'])
export const pods = (n: number) => plural(n, ['Pod', 'Poda', 'Podova'])
export const nodes = (n: number) => plural(n, ['čvor', 'čvora', 'čvorova'])
export const replicasWord = (n: number) => plural(n, ['replika', 'replike', 'replika'])

/** seconds with a decimal comma only when needed: 75 s, 10,1 s */
export function secs(v: number): string {
  const r = Math.round(v * 10) / 10
  return `${fmt.num(r, Number.isInteger(r) ? 0 : 1)} s`
}

/** milliseconds or seconds: 280 ms, 1,5 s, 15 s */
export function latency(ms: number): string {
  if (!Number.isFinite(ms)) return 'n/a'
  if (ms < 1000) return `${Math.round(ms)} ms`
  const s = ms / 1000
  return `${fmt.num(s, s < 10 ? 1 : 0)} s`
}

export function eur(v: number, digits = 2): string {
  return `${fmt.num(v, digits)} €`
}
