/**
 * Queueing theory and control formulas used by E2 (pure functions, no state).
 * Validated values (sim-models.md, section C): Erlang B c=4 A=2 → 9,5 %, A=3 → 20,6 %;
 * M/M/4 with μ = 1/s: ρ 0,5 → W 1,09 s; 0,75 → 1,51; 0,875 → 2,48; 0,95 → 5,46 s.
 */
import type { Rng } from '../../kit/sim/math.ts'

const finite = (v: number, fallback = 0) => (Number.isFinite(v) ? v : fallback)

/**
 * Erlang B: probability that an arrival finds all `c` servers busy when there is NO buffer
 * (direct calls: a busy API answers 503). Recursion B₀ = 1, Bₖ = A·Bₖ₋₁ / (k + A·Bₖ₋₁). A = λ/μ.
 */
export function erlangB(c: number, A: number): number {
  const servers = Math.max(0, Math.floor(finite(c)))
  const load = Math.max(0, finite(A))
  if (load === 0) return 0
  let B = 1
  for (let k = 1; k <= servers; k++) B = (load * B) / (k + load * B)
  return B
}

/** Erlang C: probability that an arrival has to wait in an M/M/c queue. 1 when unstable (A ≥ c). */
export function erlangC(c: number, A: number): number {
  const servers = Math.max(0, Math.floor(finite(c)))
  const load = Math.max(0, finite(A))
  if (load === 0) return 0
  if (servers === 0 || load >= servers) return 1
  const B = erlangB(servers, load)
  return (servers * B) / (servers - load * (1 - B))
}

export interface MmcResult {
  /** Utilisation ρ = λ / (cμ). */
  rho: number
  stable: boolean
  /** Probability of waiting (Erlang C). */
  pWait: number
  /** Mean wait in the queue (s). */
  wq: number
  /** Mean time in the system = wq + 1/μ (s). */
  w: number
  /** Mean number waiting / in the system (Little: L = λW). */
  lq: number
  l: number
}

/** M/M/c steady state. Unstable (ρ ≥ 1 or c = 0 with λ > 0) → Infinity waits. */
export function mmc(c: number, lambda: number, mu: number): MmcResult {
  const servers = Math.max(0, Math.floor(finite(c)))
  const lam = Math.max(0, finite(lambda))
  const m = Math.max(0, finite(mu))
  if (lam === 0) return { rho: 0, stable: true, pWait: 0, wq: 0, w: m > 0 ? 1 / m : 0, lq: 0, l: 0 }
  if (servers === 0 || m === 0) return { rho: Infinity, stable: false, pWait: 1, wq: Infinity, w: Infinity, lq: Infinity, l: Infinity }
  const A = lam / m
  const rho = A / servers
  if (rho >= 1) return { rho, stable: false, pWait: 1, wq: Infinity, w: Infinity, lq: Infinity, l: Infinity }
  const pWait = erlangC(servers, A)
  const wq = pWait / (servers * m - lam)
  const w = wq + 1 / m
  return { rho, stable: true, pWait, wq, w, lq: lam * wq, l: lam * w }
}

/**
 * P(T ≤ t) for the time in system T = Wq + S of an M/M/c FCFS queue: Wq = 0 with probability 1 − C (Erlang C),
 * otherwise Exp(cμ − λ); S ~ Exp(μ). Unstable → 0.
 */
export function mmcSojournCdf(c: number, lambda: number, mu: number, t: number): number {
  const m = mmc(c, lambda, mu)
  const mu0 = Math.max(0, finite(mu))
  const x = Math.max(0, finite(t))
  if (!m.stable || mu0 === 0) return 0
  const servers = Math.max(0, Math.floor(finite(c)))
  const a = servers * mu0 - Math.max(0, finite(lambda))
  const service = 1 - Math.exp(-mu0 * x)
  const conv = Math.abs(a - mu0) < 1e-12 ? 1 - Math.exp(-mu0 * x) * (1 + mu0 * x) : 1 - (a * Math.exp(-mu0 * x) - mu0 * Math.exp(-a * x)) / (a - mu0)
  return (1 - m.pWait) * service + m.pWait * conv
}

/**
 * p-quantile of the M/M/c time in system (bisection on mmcSojournCdf). The exact theory the engine's p50/p95 converge
 * to: c 4, μ 1 → p50 0,783 / 1,156 / 1,898 / 3,986 s at ρ 0,5 / 0,75 / 0,875 / 0,95; p95 3,150 s at ρ 0,5.
 * Infinity when unstable.
 */
export function mmcSojournQuantile(c: number, lambda: number, mu: number, p: number): number {
  const q = Math.min(1 - 1e-12, Math.max(0, finite(p)))
  if (!mmc(c, lambda, mu).stable || !(finite(mu) > 0)) return Infinity
  if (q === 0) return 0
  let lo = 0
  let hi = 1
  while (mmcSojournCdf(c, lambda, mu, hi) < q && hi < 1e9) hi *= 2
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (mmcSojournCdf(c, lambda, mu, mid) < q) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** M/M/1: W = S / (1 − ρ). ρ 0,5 → 2×, 0,8 → 5×, 0,9 → 10×, 0,95 → 20×, 0,99 → 100× the service time. */
export function mm1(lambda: number, mu: number): MmcResult {
  return mmc(1, lambda, mu)
}

/** Time to empty a backlog: backlog / (kμ − λ). Infinity when kμ ≤ λ (the backlog never shrinks). */
export function drainTimeS(backlog: number, k: number, mu: number, lambda: number): number {
  const b = Math.max(0, finite(backlog))
  if (b === 0) return 0
  const spare = Math.max(0, finite(k)) * Math.max(0, finite(mu)) - Math.max(0, finite(lambda))
  return spare > 0 ? b / spare : Infinity
}

/** Backlog growth per second when λ > kμ (0 when stable). */
export function growthPerS(k: number, mu: number, lambda: number): number {
  return Math.max(0, Math.max(0, finite(lambda)) - Math.max(0, finite(k)) * Math.max(0, finite(mu)))
}

/** Upper bound of the full-jitter window: min(cap, base·2^attempt). */
export function backoffWindowS(attempt: number, baseS: number, capS: number): number {
  const a = Math.max(0, finite(attempt))
  return Math.max(0, Math.min(finite(capS), finite(baseS) * 2 ** a))
}

/** Full jitter (AWS): random(0, min(cap, base·2^attempt)). */
export function fullJitterS(rng: Rng, attempt: number, baseS: number, capS: number): number {
  return rng.next() * backoffWindowS(attempt, baseS, capS)
}

export interface HpaResult {
  /** Replica count the formula asks for (before min/max clamps and policies). */
  desired: number
  ratio: number
  withinTolerance: boolean
}

/**
 * HPA for an External metric with an AverageValue target (what KEDA creates), mirroring
 * replica_calculator.go: ratio = metric / (target · current); within tolerance → keep current,
 * else desired = ceil(metric / target).
 */
export function hpaDesiredReplicas(metric: number, target: number, current: number, tolerance = 0.1): HpaResult {
  const m = Math.max(0, finite(metric))
  const tgt = finite(target) > 0 ? target : 1
  const cur = Math.max(0, Math.floor(finite(current)))
  const raw = Math.max(0, Math.ceil(m / tgt - 1e-9))
  if (cur === 0) return { desired: raw, ratio: m > 0 ? Infinity : 0, withinTolerance: false }
  const ratio = m / (tgt * cur)
  const within = Math.abs(1 - ratio) <= tolerance
  return { desired: within ? cur : raw, ratio, withinTolerance: within }
}

/** Little's law: L = λ · W. */
export function littleL(lambda: number, wS: number): number {
  return Math.max(0, finite(lambda)) * Math.max(0, finite(wS))
}
