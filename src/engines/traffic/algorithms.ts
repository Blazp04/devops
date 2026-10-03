/**
 * Load-balancing algorithms (sim-models §B and SIM 1). Each pick consumes randomness exactly like the
 * validated prototype (docs/research/proto/lb-sim.ts), so with rngStreams 'shared' the numbers match it.
 */
import { RING_VNODES } from './constants.ts'
import { buildRing, hash32, ringKey, ringLookup } from './hashing.ts'
import type { Client, HashKey, ServerState, TrafficState } from './types.ts'

/** Requests the LB has open at this server: in progress + queued + hanging + still connecting. */
export function activeOf(v: ServerState): number {
  return v.inflight.length + v.queue.length + v.parked.length + v.connecting.length
}

function weightOf(v: ServerState): number {
  return v.weight > 0 && Number.isFinite(v.weight) ? v.weight : 1
}

/**
 * Key used by hash-based routing: the user id (≈ a login cookie) or the source IP (NGINX `hash $remote_addr`).
 * With hashKey 'ip' every client behind one NAT has the same key, so they all land on one server.
 * (NGINX `ip_hash` would use only the first three IPv4 octets – a whole /24 counts as one client.)
 */
export function clientKey(c: Client | null, hashKey: HashKey = 'user'): string {
  if (!c) return 'anon'
  return hashKey === 'ip' ? `ip-${c.ip}` : `user-${c.id}`
}

/**
 * Pick one of `cands` (non-empty, in rack order) for the current algorithm.
 * 'manual' is handled by the engine (requests wait at the LB) and falls back to round robin here.
 */
export function pickBackend(s: TrafficState, cands: ServerState[], client: Client | null): ServerState {
  const n = cands.length
  const rng = s.rngAlgo
  switch (s.cfg.algo) {
    case 'random':
      return cands[Math.floor(rng.next() * n)]
    case 'wrr': {
      // Smooth weighted round robin (NGINX): cw += w for all; pick max cw; cw[pick] −= Σw
      let total = 0
      let best: ServerState | null = null
      for (const v of cands) {
        const w = weightOf(v)
        v.cw += w
        total += w
        if (!best || v.cw > best.cw) best = v
      }
      best!.cw -= total
      return best!
    }
    case 'lc': {
      let best = cands[0]
      for (const v of cands) if (activeOf(v) < activeOf(best)) best = v
      const min = activeOf(best)
      const ties = cands.filter((v) => activeOf(v) === min)
      return ties[Math.floor(rng.next() * ties.length)]
    }
    case 'wlc': {
      let best = cands[0]
      for (const v of cands) if ((activeOf(v) + 1) / weightOf(v) < (activeOf(best) + 1) / weightOf(best)) best = v
      return best
    }
    case 'p2c': {
      // two distinct random candidates, the one with fewer active requests wins (ties → the first)
      if (n === 1) return cands[0]
      const a = cands[Math.floor(rng.next() * n)]
      let b = a
      while (b === a) b = cands[Math.floor(rng.next() * n)]
      return activeOf(a) <= activeOf(b) ? a : b
    }
    case 'lrt': {
      let best = cands[0]
      for (const v of cands) if (v.ewmaMs * (activeOf(v) + 1) < best.ewmaMs * (activeOf(best) + 1)) best = v
      return best
    }
    case 'hash':
      return cands[hash32(clientKey(client, s.cfg.sessions.hashKey)) % n]
    case 'chash':
      return ringPick(s, cands, clientKey(client, s.cfg.sessions.hashKey))
    case 'rr':
    case 'manual':
    default: {
      const v = cands[s.rr % n]
      s.rr++
      return v
    }
  }
}

/** Consistent-hash pick among the candidates (ring cached until the candidate set changes). */
export function ringPick(s: TrafficState, cands: ServerState[], key: string): ServerState {
  const nodes = cands.map((v) => ({ id: v.id, weight: weightOf(v) }))
  const k = ringKey(nodes, RING_VNODES)
  if (!s.ring || s.ring.key !== k) s.ring = buildRing(nodes, RING_VNODES)
  const id = ringLookup(s.ring, key)
  return cands.find((v) => v.id === id) ?? cands[0]
}
