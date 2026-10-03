/**
 * „Ljestve algoritama” adapter: the engine's routeSequence() (same 12 requests, same sizes, fresh rack, no other
 * traffic), plus the number of active requests on each server at the moment of every decision – what least
 * connections looks at. It makes exactly the same engine calls as routeSequence, so the routes are identical.
 */
import { createRng } from '../../../kit'
import { DT_MS, WORKLOADS, activeOf, advance, createTraffic, deriveSeed, findRequest, mergeConfigInput, sendRequest, type Algo } from '../../../engines/traffic'
import { klopaRack } from '../lb'

export interface Rung {
  n: number
  cpuMs: number
  /** server id, null when refused */
  server: string | null
  /** active requests (in progress + queued) per server id, just before this request was routed */
  active: Record<string, number>
}

export const LADDER_N = 12
export const LADDER_GAP_MS = 150

export function ladder(algo: Algo, n = LADDER_N, gapMs = LADDER_GAP_MS): Rung[] {
  const s = createTraffic(mergeConfigInput({ seed: 42, mode: 'lb', servers: klopaRack(), workload: 'api', algo }, { lambda: 0, visual: { flights: false } }))
  const wl = WORKLOADS[s.cfg.workload]
  const sizes = createRng(deriveSeed(s.cfg.seed, 7))
  const out: Rung[] = []
  for (let i = 0; i < n; i++) {
    const cpuMs = wl.cpuMs * sizes.exp(1)
    const client = s.clients.length ? i % s.clients.length : 0
    const active: Record<string, number> = {}
    for (const v of s.servers) active[v.id] = activeOf(v)
    const id = sendRequest(s, { client, cpuMs })
    const f = id === null ? null : findRequest(s, id)
    out.push({ n: i + 1, cpuMs, server: f ? f.server : null, active })
    advance(s, Math.max(DT_MS, gapMs))
  }
  return out
}

const cache = new Map<Algo, Rung[]>()

/** Ladders are deterministic (seed 42): compute each once. */
export function ladderOf(algo: Algo): Rung[] {
  let r = cache.get(algo)
  if (!r) {
    r = ladder(algo)
    cache.set(algo, r)
  }
  return r
}
