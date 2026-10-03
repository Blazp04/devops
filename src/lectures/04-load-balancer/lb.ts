/**
 * Lecture 04 helpers (no React): Klopa's rack, prices, traffic patterns and small formatters.
 * Every simulation in this lecture runs on the shared E1 engine (src/engines/traffic) – nothing here models traffic.
 */
import { fmt, plural } from '../../kit'
import { monthlyPriceEur, type Algo, type ServerSpec, type TrafficProfile, type WorkloadId } from '../../engines/traffic'

export type SizeKey = 'mali' | 'srednji' | 'veliki'

export const SIZES: Record<SizeKey, { name: string; vcpu: number; ramGB: number }> = {
  mali: { name: 'Mali', vcpu: 1, ramGB: 2 },
  srednji: { name: 'Srednji', vcpu: 2, ramGB: 4 },
  veliki: { name: 'Veliki', vcpu: 4, ramGB: 8 },
}

/** Klopa's three servers (ids s1–s3 as in the engine presets, so `l04-incident` numbers hold). */
export function klopaRack(): ServerSpec[] {
  return [
    { id: 's1', name: 'Mali', vcpu: 1, ramGB: 2 },
    { id: 's2', name: 'Srednji', vcpu: 2, ramGB: 4 },
    { id: 's3', name: 'Veliki', vcpu: 4, ramGB: 8 },
  ]
}

/** At most this many servers in the lecture's rack (the drawing stays readable). */
export const MAX_RACK = 5

/** Illustrative monthly price of a rack, € (engine: linear in vCPU and RAM). */
export function rackPrice(rack: readonly { vcpu: number; ramGB: number }[]): number {
  return rack.reduce((a, v) => a + monthlyPriceEur(v.vcpu, v.ramGB), 0)
}

export const DEFAULT_PRICE = rackPrice(klopaRack())

/** True when the rack is exactly Mali + Srednji + Veliki (any order). */
export function isKlopaRack(rack: readonly { vcpu: number; ramGB: number }[]): boolean {
  if (rack.length !== 3) return false
  const key = (v: { vcpu: number; ramGB: number }) => `${v.vcpu}/${v.ramGB}`
  const want = ['1/2', '2/4', '4/8']
  const have = rack.map(key).sort()
  return want.every((w, i) => have[i] === w)
}

/** A fresh name for a server added to the rack: „Mali 2”, „P1” for custom sizes. */
export function nextName(rack: readonly { name: string }[], base: string | null): string {
  const names = new Set(rack.map((r) => r.name))
  if (base) {
    if (!names.has(base)) return base
    for (let k = 2; k < 20; k++) if (!names.has(`${base} ${k}`)) return `${base} ${k}`
  }
  for (let k = 1; k < 20; k++) if (!names.has(`P${k}`)) return `P${k}`
  return `P${rack.length + 1}`
}

export function nextId(rack: readonly { id: string }[]): string {
  const ids = new Set(rack.map((r) => r.id))
  for (let k = 1; k < 40; k++) if (!ids.has(`s${k}`)) return `s${k}`
  return `s${rack.length + 1}`
}

/* ---------- traffic ---------- */

export type Pattern = 'constant' | 'waves' | 'lunch'

export const PATTERN_PROFILE: Record<Pattern, TrafficProfile> = {
  constant: { kind: 'constant' },
  waves: { kind: 'waves', amplitude: 0.6, periodS: 20 },
  // podne: λ for 5 s, then up to 2·λ over 15 s, 20 s at the peak, back down over 15 s
  lunch: { kind: 'lunch', startS: 5, rampS: 15, peakFactor: 2, holdS: 20, decayS: 15 },
}

export const PATTERN_LABEL: Record<Pattern, string> = { constant: 'stalni', waves: 'valovi', lunch: 'podne' }

export const WORKLOAD_SHORT: Record<WorkloadId, string> = { api: 'API', io: 'I/O', cpu: 'CPU (fotografije)' }

export const MAIN_ALGOS: Algo[] = ['manual', 'random', 'rr', 'wrr', 'lc', 'wlc']
export const ADVANCED_ALGOS: Algo[] = ['p2c', 'lrt']
export const COMPARE_ALGOS: Algo[] = ['rr', 'wrr', 'lc']

/** The incident card (#4): Klopa's rack, round robin, API, λ 15, seed 42 – engine preset `l04-incident`. */
export const INCIDENT = { preset: 'l04-incident', seed: 42, lambda: 15, algo: 'rr' as Algo, workload: 'api' as WorkloadId }

/* ---------- formatting ---------- */

/** Latency for stats: „0,98 s”, „n/a”. */
export function fmtSec(ms: number | null, digits = 2): string {
  if (ms === null || !Number.isFinite(ms)) return 'n/a'
  return `${fmt.num(ms / 1000, ms >= 10_000 ? 1 : digits)} s`
}

export function fmtEur(v: number): string {
  return `${fmt.num(v, Number.isInteger(v) ? 0 : 1)} €`
}

/** „1 veza / 3 veze / 5 veza” */
export function veze(n: number): string {
  return plural(n, ['veza', 'veze', 'veza'])
}

export function zahtjeva(n: number): string {
  return plural(n, ['zahtjev', 'zahtjeva', 'zahtjeva'])
}

/** Wrap a handwritten note into lines of at most `max` characters. */
export function wrapWords(text: string, max: number): string[] {
  const out: string[] = []
  let line = ''
  for (const w of text.split(' ')) {
    if (line && (line + ' ' + w).length > max) {
      out.push(line)
      line = w
    } else line = line ? `${line} ${w}` : w
  }
  if (line) out.push(line)
  return out
}
