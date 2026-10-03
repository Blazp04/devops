/** Small, dependency-free helpers for simulations. */

/** Deterministic PRNG (mulberry32). Same seed => same sequence, so sims are reproducible. */
export function createRng(seed = 42) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    /** Uniform [0, 1) */
    next,
    /** Uniform [min, max) */
    range: (min: number, max: number) => min + (max - min) * next(),
    /** Integer in [min, max] */
    int: (min: number, max: number) => Math.floor(min + (max - min + 1) * next()),
    /** Exponentially distributed value with the given rate (mean = 1/rate). Use for Poisson inter-arrival times. */
    exp: (rate: number) => -Math.log(1 - next()) / rate,
    /** true with probability p */
    chance: (p: number) => next() < p,
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
  }
}

export type Rng = ReturnType<typeof createRng>

/** Fixed-length rolling series for charts (keeps the newest `max` values). */
export class Series {
  values: number[] = []
  readonly max: number
  constructor(max = 120) {
    this.max = max
  }
  push(v: number) {
    this.values.push(v)
    if (this.values.length > this.max) this.values.shift()
  }
  last(fallback = 0) {
    return this.values.length ? this.values[this.values.length - 1] : fallback
  }
  clear() {
    this.values = []
  }
}

/** p-th percentile (0..100) of an array; 0 if empty. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

export function mean(values: readonly number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Format helpers (Croatian number formatting: decimal comma). */
export const fmt = {
  num: (v: number, digits = 0) => v.toLocaleString('hr-HR', { minimumFractionDigits: digits, maximumFractionDigits: digits }),
  pct: (v: number, digits = 0) => `${(v * 100).toLocaleString('hr-HR', { maximumFractionDigits: digits })} %`,
  /** milliseconds → "120 ms" / "2,8 s"; `digits` fixes the decimals of the seconds form ("3,0 s" next to "2,8 s") */
  ms: (v: number, opts?: { digits?: number }) =>
    v >= 1000
      ? `${(v / 1000).toLocaleString('hr-HR', opts?.digits !== undefined ? { minimumFractionDigits: opts.digits, maximumFractionDigits: opts.digits } : { maximumFractionDigits: 1 })} s`
      : `${Math.round(v)} ms`,
  mb: (v: number) => (v >= 1024 ? `${(v / 1024).toLocaleString('hr-HR', { maximumFractionDigits: 1 })} GB` : `${Math.round(v)} MB`),
}

const hrPlural = new Intl.PluralRules('hr')

/**
 * Croatian plural form: plural(n, ['zahtjev', 'zahtjeva', 'zahtjeva']) → "1 zahtjev", "3 zahtjeva", "5 zahtjeva".
 * forms = [one, few, other]. Set withNumber=false to get only the word.
 */
export function plural(n: number, forms: [string, string, string], withNumber = true): string {
  const cat = hrPlural.select(n)
  const word = cat === 'one' ? forms[0] : cat === 'few' ? forms[1] : forms[2]
  return withNumber ? `${n.toLocaleString('hr-HR')} ${word}` : word
}
