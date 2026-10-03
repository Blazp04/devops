/**
 * Closed-form models used next to the E1 simulations (sim-models §A2, §A5, §C "Queueing laws").
 * Every function is total: NaN / negative / out-of-range inputs return a sensible value (0, 1, Infinity or NaN
 * where the quantity is genuinely undefined) instead of throwing.
 * Label each in the UI as a model (MODEL_NOTES in constants.ts).
 */

const finite = (v: number) => typeof v === 'number' && Number.isFinite(v)

/* ---------- Queueing ---------- */

/** M/M/1: time in system as a multiple of the service time, W/S = 1/(1−ρ). ρ ≥ 1 → Infinity. 0.5→2×, 0.7→3.3×, 0.8→5×, 0.9→10×, 0.99→100×. */
export function mm1WaitFactor(rho: number): number {
  if (!finite(rho) || rho < 0) return NaN
  return rho >= 1 ? Infinity : 1 / (1 - rho)
}

/** M/M/1: mean number in system L = ρ/(1−ρ). */
export function mm1Number(rho: number): number {
  if (!finite(rho) || rho < 0) return NaN
  return rho >= 1 ? Infinity : rho / (1 - rho)
}

/** Erlang B: probability that an arrival finds all c servers busy and is lost (no queue). B₀ = 1, Bₖ = A·Bₖ₋₁/(k + A·Bₖ₋₁). */
export function erlangB(c: number, A: number): number {
  if (!finite(A) || A < 0 || !finite(c) || c < 0) return NaN
  const n = Math.floor(c)
  let b = 1
  for (let k = 1; k <= n; k++) b = (A * b) / (k + A * b)
  return b
}

/** Erlang C: probability that an arrival has to wait (M/M/c, A = λ/μ). A ≥ c → 1 (unstable). */
export function erlangC(c: number, A: number): number {
  if (!finite(A) || A < 0 || !finite(c) || c < 1) return NaN
  const n = Math.floor(c)
  if (A >= n) return 1
  const b = erlangB(n, A)
  return b / (1 - (A / n) * (1 - b))
}

export interface MmcResult {
  /** Probability of waiting */
  pWait: number
  /** Mean wait in queue, s */
  wq: number
  /** Mean time in system, s */
  w: number
  /** Utilisation ρ = λ/(cμ) */
  rho: number
}

/** M/M/c with arrival rate λ (1/s) and service rate μ per server (1/s). Unstable → Infinity. */
export function mmc(c: number, lambda: number, mu: number): MmcResult {
  if (!finite(lambda) || lambda < 0 || !finite(mu) || mu <= 0 || !finite(c) || c < 1) return { pWait: NaN, wq: NaN, w: NaN, rho: NaN }
  const n = Math.floor(c)
  const A = lambda / mu
  const rho = A / n
  if (rho >= 1) return { pWait: 1, wq: Infinity, w: Infinity, rho }
  const pWait = erlangC(n, A)
  const wq = pWait / (n * mu - lambda)
  return { pWait, wq, w: wq + 1 / mu, rho }
}

/** M/M/c time in system as a multiple of the service time at utilisation ρ (c = 4, ρ = 0.95 → ≈5.5×, not 20×). */
export function mmcWaitFactor(c: number, rho: number): number {
  if (!finite(rho) || rho < 0) return NaN
  if (rho >= 1) return Infinity
  return mmc(c, rho * Math.floor(c), 1).w
}

/** Little's law: L = λ·W. */
export function littleL(lambda: number, w: number): number {
  return finite(lambda) && finite(w) ? lambda * w : NaN
}

/* ---------- Availability ---------- */

/** A = MTBF / (MTBF + MTTR). */
export function availabilityFromMtbf(mtbf: number, mttr: number): number {
  if (!finite(mtbf) || !finite(mttr) || mtbf < 0 || mttr < 0 || mtbf + mttr === 0) return NaN
  return mtbf / (mtbf + mttr)
}

/** MTBF that gives availability A with the given MTTR: MTTR·A/(1−A). A = 1 → Infinity. */
export function mtbfFor(A: number, mttr: number): number {
  if (!finite(A) || A < 0 || A > 1 || !finite(mttr) || mttr < 0) return NaN
  return A === 1 ? Infinity : (mttr * A) / (1 - A)
}

/** Components in series (all must work): Π Aᵢ. Empty → 1. */
export function seriesAvailability(list: readonly number[]): number {
  let a = 1
  for (const x of list) a *= clamp01(x)
  return a
}

/** Components in parallel (at least one must work): 1 − Π(1 − Aᵢ). Empty → 0. */
export function parallelAvailability(list: readonly number[]): number {
  if (!list.length) return 0
  let down = 1
  for (const x of list) down *= 1 - clamp01(x)
  return 1 - down
}

/** At least k of n identical, independent components work (binomial). k ≤ 0 → 1; k > n → 0. */
export function kOfN(k: number, n: number, A: number): number {
  const kk = Math.ceil(k)
  const nn = Math.floor(n)
  const a = clamp01(A)
  if (kk <= 0) return 1
  if (kk > nn) return 0
  let sum = 0
  for (let i = kk; i <= nn; i++) sum += binom(nn, i) * a ** i * (1 - a) ** (nn - i)
  return Math.min(1, sum)
}

/** Probability that at least one of n independent components is down: 1 − Aⁿ (10 × 99 % → ≈9.6 %). */
export function probAnyDown(n: number, A: number): number {
  if (!finite(n) || n <= 0) return 0
  return 1 - clamp01(A) ** Math.floor(n)
}

export interface Downtime {
  perYearH: number
  perYearMin: number
  per30DaysMin: number
  perWeekMin: number
}

/** Allowed downtime for availability A (99.9 % → 8.76 h/yr, 43.2 min per 30 days). */
export function downtime(A: number): Downtime {
  const down = 1 - clamp01(A)
  return {
    perYearH: down * 8760,
    perYearMin: down * 8760 * 60,
    per30DaysMin: down * 30 * 24 * 60,
    perWeekMin: down * 7 * 24 * 60,
  }
}

/** The nines table of L02. */
export const NINES = [0.99, 0.999, 0.9999, 0.99999] as const

/* ---------- Scaling ---------- */

/** Amdahl: S(N) = 1 / ((1−p) + p/N). p = 0.95 → at most 20×. */
export function amdahl(N: number, p: number): number {
  if (!finite(N) || N <= 0 || !finite(p)) return NaN
  const q = clamp01(p)
  return 1 / (1 - q + q / N)
}

/** Amdahl's ceiling 1/(1−p); p = 1 → Infinity. */
export function amdahlMax(p: number): number {
  const q = clamp01(p)
  return q >= 1 ? Infinity : 1 / (1 - q)
}

/** Universal Scalability Law: C(N) = N / (1 + α(N−1) + βN(N−1)). α = 0.05, β = 0.001 → peak ≈31 then decline. */
export function usl(N: number, alpha: number, beta: number): number {
  if (!finite(N) || N <= 0 || !finite(alpha) || !finite(beta)) return NaN
  return N / (1 + alpha * (N - 1) + beta * N * (N - 1))
}

/** USL peak N* = √((1−α)/β); β ≤ 0 → Infinity. */
export function uslPeak(alpha: number, beta: number): number {
  if (!finite(alpha) || !finite(beta)) return NaN
  if (beta <= 0) return Infinity
  return Math.sqrt(Math.max(0, 1 - alpha) / beta)
}

/** N app servers in front of one shared database: throughput = min(N·perServer, dbCapacity). */
export function sharedBottleneck(N: number, perServer: number, dbCapacity: number): { throughput: number; bottleneck: 'app' | 'db' } {
  const app = Math.max(0, finite(N) ? N : 0) * Math.max(0, finite(perServer) ? perServer : 0)
  const db = Math.max(0, finite(dbCapacity) ? dbCapacity : 0)
  return app <= db ? { throughput: app, bottleneck: 'app' } : { throughput: db, bottleneck: 'db' }
}

/* ---------- Cache ---------- */

/** Cache-aside: avg = h·t_cache + (1−h)·(t_cache + t_db); DB load = (1−h)·λ. h 0.9, 1 ms, 20 ms → 3 ms, 10 %. */
export function cacheAside(hitRatio: number, cacheMs: number, dbMs: number, lambda = 1): { avgMs: number; dbLoad: number } {
  const h = clamp01(hitRatio)
  const c = Math.max(0, finite(cacheMs) ? cacheMs : 0)
  const d = Math.max(0, finite(dbMs) ? dbMs : 0)
  const l = Math.max(0, finite(lambda) ? lambda : 0)
  return { avgMs: h * c + (1 - h) * (c + d), dbLoad: (1 - h) * l }
}

/* ---------- helpers ---------- */

function clamp01(v: number): number {
  return finite(v) ? Math.min(1, Math.max(0, v)) : 0
}

function binom(n: number, k: number): number {
  let r = 1
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i
  return r
}
