/**
 * „Usporedi tri algoritma”: the same settings and seed, run headless on the E1 engine for 5 minutes of traffic
 * (10 s warm-up + 300 s, exactly like the validated numbers) once per algorithm.
 */
import { ALGO_LABEL, runScenario, type Algo, type TrafficConfigInput } from '../../../engines/traffic'
import { PATTERN_PROFILE } from '../lb'
import type { FlagSettings } from './flagship'

export interface AlgoResult {
  algo: Algo
  label: string
  okRps: number
  errPct: number
  errors: { 502: number; 503: number; 504: number; total: number }
  mean: number | null
  p50: number | null
  p95: number | null
  p99: number | null
  servers: { id: string; name: string; cpu: number; share: number }[]
  /** successes per 250 ms latency bin, 0–5 s */
  hist: number[]
}

export const HIST_BIN_MS = 250
export const HIST_BINS = 20

export function compareConfig(set: FlagSettings): TrafficConfigInput {
  return {
    seed: 42,
    // own RNG stream for the algorithms' coin flips: every algorithm sees exactly the same arrivals
    rngStreams: 'split',
    mode: 'lb',
    servers: set.rack.map((r) => ({ ...r })),
    workload: set.workload,
    lambda: set.lambda,
    queueMax: set.queueMax,
    unboundedWorkers: set.unbounded,
    profile: PATTERN_PROFILE[set.pattern],
  }
}

export function runCompare(set: FlagSettings, algos: readonly Algo[], measureS = 300): AlgoResult[] {
  const warmupS = 10
  return algos.map((algo) => {
    const r = runScenario({ config: { ...compareConfig(set), algo }, warmupS, measureS })
    const hist = new Array<number>(HIST_BINS).fill(0)
    for (const o of r.state.okHistory) {
      if (o.t <= warmupS * 1000) continue
      hist[Math.min(HIST_BINS - 1, Math.floor(o.lat / HIST_BIN_MS))]++
    }
    return {
      algo,
      label: ALGO_LABEL[algo],
      okRps: r.okRps,
      errPct: r.errPct,
      errors: { 502: r.errors[502], 503: r.errors[503], 504: r.errors[504], total: r.errors.total },
      mean: r.meanLatency,
      p50: r.p50,
      p95: r.p95,
      p99: r.p99,
      servers: r.servers.map((v) => ({ id: v.id, name: v.name, cpu: v.cpu, share: v.share })),
      hist,
    }
  })
}
