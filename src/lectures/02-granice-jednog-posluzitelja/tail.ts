/**
 * „Prosjek laže”: 200 successful requests from the E1 engine at 11:58 (preset l02-hook-1158: I/O, 2 vCPU / 2 GB,
 * λ 4, seed 42), plus a slow tail the reader drags out. Percentiles are nearest-rank over the successes, as everywhere.
 */
import { createScenario, nearestRank } from '../../engines/traffic'

export const TAIL_N = 200

let base: number[] | null = null

/** Latencies (ms) of the last 200 requests of a 70 s run at 11:58, in arrival order. */
export function baseLatencies(): number[] {
  if (!base) {
    const s = createScenario('l02-hook-1158', { visual: { flights: false } }, { prerollS: 70 })
    base = s.recent.filter((r) => r.outcome === 'ok').map((r) => r.tEnd - r.t0)
  }
  return base
}

export interface TailStats {
  lats: number[]
  mean: number
  p50: number
  p95: number
  p99: number
  slowIdx: Set<number>
}

/** k requests (spread evenly through the run) take `slowMs` instead (e.g. a slow query, a locked row). */
export function withTail(k: number, slowMs: number): TailStats {
  const b = baseLatencies()
  const n = b.length
  const slowIdx = new Set<number>()
  for (let i = 0; i < Math.min(k, n); i++) slowIdx.add(Math.floor(((i + 0.5) * n) / Math.max(1, k)))
  const lats = b.map((v, i) => (slowIdx.has(i) ? slowMs + ((i * 37) % 300) : v))
  const sorted = [...lats].sort((a, c) => a - c)
  return {
    lats,
    mean: lats.reduce((a, c) => a + c, 0) / Math.max(1, n),
    p50: nearestRank(sorted, 0.5),
    p95: nearestRank(sorted, 0.95),
    p99: nearestRank(sorted, 0.99),
    slowIdx,
  }
}
