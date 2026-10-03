/**
 * Hashing for session affinity and the "hash mod N vs consistent hashing" demo (sim-models §B).
 * - hash mod N, 3 → 2 servers: a key stays only if h mod 3 = h mod 2 → 2/3 of keys move; 3 → 4: 3/4 move.
 * - Consistent hashing (ring with virtual nodes): only the keys of the removed server move (≈ 1/N).
 * In code we use FNV-1a followed by the murmur3 finaliser (fmix32) for a good spread; NGINX ketama uses MD5/CRC32,
 * Kafka uses murmur2 – the arithmetic of "how many keys move" is the same.
 */

/** 32-bit FNV-1a of a string (UTF-16 code units), then fmix32 for avalanche. Unsigned result. */
export function hash32(key: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return fmix32(h)
}

/** murmur3 finaliser */
export function fmix32(x: number): number {
  let h = x >>> 0
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/** Derive an independent seed for a second RNG stream. */
export function deriveSeed(seed: number, salt: number): number {
  return fmix32(((seed >>> 0) ^ Math.imul(salt, 0x9e3779b9)) >>> 0)
}

/** Index in [0, n) by hash mod n; -1 when n ≤ 0. */
export function hashMod(key: string, n: number): number {
  if (!(n > 0)) return -1
  return hash32(key) % Math.floor(n)
}

export interface RingNode {
  id: string
  weight?: number
}

export interface HashRing {
  /** Sorted hash points */
  points: Uint32Array
  /** Node id for each point */
  owners: string[]
  /** Cache key of the node set */
  key: string
}

/**
 * Build a ring with round(vnodes × weight) virtual nodes per node (at least 1; weight ≤ 0 or NaN counts as 1).
 * Non-integer weights are honoured (0.4 → 40 points with vnodes 100), so shares follow the weights.
 */
export function buildRing(nodes: readonly RingNode[], vnodes = 100): HashRing {
  const pts: { h: number; id: string }[] = []
  for (const n of nodes) {
    const w = n.weight && Number.isFinite(n.weight) && n.weight > 0 ? n.weight : 1
    const count = Math.max(1, Math.round(vnodes * w))
    for (let i = 0; i < count; i++) pts.push({ h: hash32(`${n.id}#${i}`), id: n.id })
  }
  pts.sort((a, b) => a.h - b.h || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return {
    points: Uint32Array.from(pts.map((p) => p.h)),
    owners: pts.map((p) => p.id),
    key: ringKey(nodes, vnodes),
  }
}

export function ringKey(nodes: readonly RingNode[], vnodes = 100): string {
  return `${vnodes}|` + nodes.map((n) => `${n.id}:${n.weight ?? 1}`).join(',')
}

/** First point clockwise from hash(key); null for an empty ring. */
export function ringLookup(ring: HashRing, key: string): string | null {
  const n = ring.points.length
  if (n === 0) return null
  const h = hash32(key)
  let lo = 0
  let hi = n
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (ring.points[mid] < h) lo = mid + 1
    else hi = mid
  }
  return ring.owners[lo === n ? 0 : lo]
}

/** Assign keys to node ids with hash mod N or the ring. */
export function assignKeys(keys: readonly string[], nodes: readonly RingNode[], method: 'mod' | 'ring', vnodes = 100): Map<string, string | null> {
  const out = new Map<string, string | null>()
  if (method === 'mod') {
    for (const k of keys) {
      const i = hashMod(k, nodes.length)
      out.set(k, i >= 0 ? nodes[i].id : null)
    }
  } else {
    const ring = buildRing(nodes, vnodes)
    for (const k of keys) out.set(k, ringLookup(ring, k))
  }
  return out
}

/** Fraction of keys whose node changed between two assignments (0 when there are no keys). */
export function movedFraction(before: Map<string, string | null>, after: Map<string, string | null>): number {
  let moved = 0
  let n = 0
  for (const [k, v] of before) {
    n++
    if (after.get(k) !== v) moved++
  }
  return n ? moved / n : 0
}

/** Share of keys per node id. */
export function keyShares(assign: Map<string, string | null>): Record<string, number> {
  const counts: Record<string, number> = {}
  let n = 0
  for (const v of assign.values()) {
    if (v === null) continue
    counts[v] = (counts[v] ?? 0) + 1
    n++
  }
  for (const k of Object.keys(counts)) counts[k] /= n
  return counts
}
