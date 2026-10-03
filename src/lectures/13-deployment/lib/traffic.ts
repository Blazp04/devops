/**
 * Request trays and the response strip of the flagship, read from the engine (inFlightAt = requests already sent,
 * progress reaches 1 at the Pod; s.recent = answered requests). Pure data for BoardStage.
 */
import { pointAt } from '../../../kit'
import { inFlightAt, versionToneFor, type ClusterState, type VersionColour } from '../../../engines/cluster'
import type { BoardGeo, PodPos } from './layout'

export interface TrayDot {
  id: string
  x: number
  y: number
  bad: boolean
  tone: VersionColour | null
}

export interface StripCell {
  id: string
  tone: VersionColour | null
  ok: boolean
  version: string | null
}

const MAX_TRAYS = 60

export function traysFor(c: ClusterState, geo: BoardGeo, pos: Map<string, PodPos>): TrayDot[] {
  const out: TrayDot[] = []
  const top: [number, number] = [geo.trunkX, geo.trunkTop]
  for (const { r, progress } of inFlightAt(c)) {
    if (out.length >= MAX_TRAYS) break
    const p = r.podId ? pos.get(r.podId) : undefined
    const bad = r.outcome !== 'ok'
    // answered by a Pod that is not drawn (an older ReplicaSet hidden on a phone): the response strip shows it
    if (!p && !bad) continue
    let path: [number, number][]
    if (p) path = [top, [geo.trunkX, p.laneY], [p.x, p.laneY], [p.x, p.y - p.size * 0.42]]
    else path = [top, [geo.trunkX, top[1] + 26]] // failed with no Pod to go to: the tray falls at the entrance
    const [x, y] = pointAt(path, Math.min(1, progress))
    out.push({ id: r.id, x, y, bad, tone: r.version ? versionToneFor(c, r.version) : null })
  }
  return out
}

/** The last `n` answered requests, oldest first: version colour, or ✗ for a failed one. */
export function responseStrip(c: ClusterState, n: number): StripCell[] {
  const rec = c.recent.slice(-n)
  return rec.map((r, i) => ({ id: `${r.t.toFixed(3)}-${i}`, tone: r.version ? versionToneFor(c, r.version) : null, ok: r.outcome === 'ok', version: r.version }))
}
