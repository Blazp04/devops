/**
 * Geometry of the ReplicaSet board (flagship, stepper, stalled-rollout figure). Two layouts chosen by the container
 * width: wide (viewBox 720) from WIDE_MIN px, narrow (viewBox 340, never wider than 460 px) below it. Lettering is
 * ≥ 13 units (Plex Mono) and Caveat ≥ 13 × 1,45, so it stays ≥ 12 px / 17 px at the smallest width of each layout.
 */
import type { BoardModel, PodDot, RsRow } from './board'

export type BoardLayout = 'wide' | 'narrow'

export const WIDE_MIN = 680
export const NARROW_MAX_PX = 460

export interface BoardGeo {
  layout: BoardLayout
  W: number
  H: number
  /** fence gauges band */
  gauges: { x: number; y: number; w: number }[]
  /** Deployment card (wide: left column; narrow: a strip on top) */
  card: { x: number; y: number; w: number; h: number }
  /** row slots (top-left) */
  rows: { x: number; y: number; w: number; h: number }[]
  /** traffic trunk (x) on the right edge and its top */
  trunkX: number
  trunkTop: number
  podMax: number
  podLines: number
}

export const MAX_ROWS = 3
/** rows drawn per layout (a phone gets the two newest ReplicaSets and a „+1” note) */
export const ROWS_FOR: Record<BoardLayout, number> = { wide: 3, narrow: 2 }

export function boardGeo(layout: BoardLayout, rowCount = ROWS_FOR[layout]): BoardGeo {
  const n = Math.max(1, Math.min(ROWS_FOR[layout], rowCount))
  if (layout === 'wide') {
    const W = 720
    const top = 92
    const rowH = 124
    return {
      layout,
      W,
      H: top + n * rowH + 8,
      gauges: [
        { x: 14, y: 8, w: 330 },
        { x: 372, y: 8, w: 330 },
      ],
      card: { x: 10, y: top + 4, w: 150, h: 208 },
      rows: Array.from({ length: n }, (_, i) => ({ x: 194, y: top + i * rowH, w: W - 194 - 30, h: rowH - 8 })),
      trunkX: W - 14,
      trunkTop: top - 6,
      podMax: 44,
      podLines: 1,
    }
  }
  const W = 320
  const top = 196
  const rowH = 160
  return {
    layout,
    W,
    H: top + n * rowH + 6,
    gauges: [
      { x: 8, y: 6, w: 304 },
      { x: 8, y: 66, w: 304 },
    ],
    card: { x: 8, y: 128, w: 304, h: 58 },
    rows: Array.from({ length: n }, (_, i) => ({ x: 34, y: top + i * rowH, w: W - 34 - 22, h: rowH - 10 })),
    trunkX: W - 8,
    trunkTop: top - 4,
    podMax: 36,
    podLines: 2,
  }
}

/** Centres of the Pods in a row: the largest lunchbox that fits `count` in the row's width and lines. */
export function podSlots(count: number, row: { x: number; y: number; w: number; h: number }, geo: BoardGeo): { size: number; pts: [number, number][]; laneY: number } {
  // lane below the two header lines, so trays never cross the counters
  const headerH = geo.layout === 'wide' ? 54 : 52
  const laneY = row.y + headerH - 6
  const gap = 1.42
  let size = geo.podMax
  let lines = 1
  const perLine = (s: number) => Math.max(1, Math.floor((row.w - 8) / (s * gap)))
  while (count > perLine(size) * lines) {
    if (lines < geo.podLines && size <= geo.podMax * 0.86) lines += 1
    else if (size > 24) size -= 2
    else break
  }
  const per = perLine(size)
  const lineH = size * 1.32
  const pts: [number, number][] = []
  for (let i = 0; i < count; i++) {
    const line = Math.floor(i / per)
    const col = i % per
    pts.push([row.x + 4 + size * gap * (col + 0.5), laneY + 14 + size * 0.62 + line * lineH])
  }
  return { size, pts, laneY }
}

/** Which ReplicaSets get a row: the ones with Pods or wanting Pods, oldest first (time reads top → bottom). */
export function boardRows(b: BoardModel, max = MAX_ROWS): { rows: RsRow[]; hidden: number } {
  const active = b.rows.filter((r) => r.desired > 0 || r.pods.length > 0).sort((a, c) => a.revision - c.revision)
  return { rows: active.slice(-max), hidden: Math.max(0, active.length - max) }
}

export interface PodPos {
  x: number
  y: number
  size: number
  laneY: number
}

/**
 * Where every drawn Pod sits (same maths as the drawing), so request trays can fly to it. When no ReplicaSet is left
 * (the Deployment was deleted), the Pods still draining are drawn in the first row slot – pass them as `orphans`.
 */
export function podPositions(rows: RsRow[], geo: BoardGeo, orphans: PodDot[] = []): Map<string, PodPos> {
  const out = new Map<string, PodPos>()
  rows.forEach((r, i) => {
    const rect = geo.rows[i]
    if (!rect) return
    const sl = podSlots(r.pods.length, rect, geo)
    r.pods.forEach((p, j) => out.set(p.id, { x: sl.pts[j][0], y: sl.pts[j][1], size: sl.size, laneY: sl.laneY }))
  })
  if (rows.length === 0 && orphans.length > 0) {
    const sl = podSlots(orphans.length, geo.rows[0], geo)
    orphans.forEach((p, j) => out.set(p.id, { x: sl.pts[j][0], y: sl.pts[j][1], size: sl.size, laneY: sl.laneY }))
  }
  return out
}
