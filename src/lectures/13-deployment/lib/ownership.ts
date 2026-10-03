/**
 * Scene 1 „Lanac vlasništva” on the E3 engine: presetRollout with nodes 'small' (3 nodes × room for 3 klopa-api
 * Pods), no traffic. Geometry for two layouts and the plain view of who owns which Pod.
 */
import { presetRollout, type ClusterState } from '../../../engines/cluster'
import { boardModel, type PodDot } from './board'

export function createOwnership(): ClusterState {
  return presetRollout({ seed: 42, nodes: 'small', traffic: false })
}

export interface OwnView {
  replicas: number
  rsName: string
  rsHash: string
  /** owned, non-terminating Pods; ready ones */
  current: number
  ready: number
  /** Pods per node name, in creation order (terminating included) */
  byNode: Record<string, PodDot[]>
  pending: PodDot[]
  orphans: Set<string>
  owned: Set<string>
  /** the scheduler's message for the first Pending Pod */
  pendingMessage: string | null
  exists: boolean
}

export function ownView(c: ClusterState): OwnView {
  const b = boardModel(c)
  const row = b.rows.find((r) => r.isNew) ?? b.rows[0]
  const all: PodDot[] = [...b.rows.flatMap((r) => r.pods), ...b.orphans]
  const byNode: Record<string, PodDot[]> = {}
  for (const n of c.nodes) byNode[n.name] = []
  const pending: PodDot[] = []
  for (const p of all) {
    if (p.nodeName && byNode[p.nodeName]) byNode[p.nodeName].push(p)
    else pending.push(p)
  }
  const firstPending = pending.length ? c.pods.find((p) => p.id === pending[0].id) : undefined
  return {
    replicas: b.replicas,
    rsName: row?.name ?? '',
    rsHash: row?.hash ?? '',
    current: row?.current ?? 0,
    ready: row?.ready ?? 0,
    byNode,
    pending,
    orphans: new Set(b.orphans.map((p) => p.id)),
    owned: new Set(b.rows.flatMap((r) => r.pods.map((p) => p.id))),
    pendingMessage: firstPending?.scheduled.message || null,
    exists: b.exists,
  }
}

export type OwnLayout = 'wide' | 'narrow'

export interface OwnGeo {
  W: number
  H: number
  card: { x: number; y: number; w: number; h: number }
  rs: { x: number; y: number; w: number }
  pending: { x: number; y: number; w: number; h: number }
  nodes: { x: number; y: number; w: number; h: number }[]
  pod: number
}

export function ownGeo(layout: OwnLayout): OwnGeo {
  if (layout === 'wide') {
    return {
      W: 720,
      H: 330,
      card: { x: 10, y: 14, w: 168, h: 84 },
      rs: { x: 226, y: 14, w: 270 },
      pending: { x: 520, y: 12, w: 190, h: 106 },
      nodes: [0, 1, 2].map((i) => ({ x: 10 + i * 237, y: 160, w: 226, h: 160 })),
      pod: 42,
    }
  }
  return {
    W: 340,
    H: 600,
    card: { x: 8, y: 8, w: 324, h: 52 },
    rs: { x: 30, y: 80, w: 300 },
    pending: { x: 8, y: 162, w: 324, h: 84 },
    nodes: [0, 1, 2].map((i) => ({ x: 8, y: 262 + i * 112, w: 324, h: 104 })),
    pod: 36,
  }
}

/** Centre of slot `i` (0–2) in a node frame. */
export function slotCenter(n: { x: number; y: number; w: number; h: number }, i: number, layout: OwnLayout): [number, number] {
  const top = layout === 'wide' ? 44 : 36
  const cw = n.w / 3
  return [n.x + cw * (i + 0.5), n.y + top + (n.h - top) / 2]
}
