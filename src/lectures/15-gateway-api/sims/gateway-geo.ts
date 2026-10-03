/**
 * Stage geometry for „Gradska vrata” in three layouts (picked by the stage width):
 * wide (viewBox 680 × 500, stage ≥ 600 px; 14-unit lettering ≥ 12 px down to 583 px),
 * medium (556 × 500, stage 480–600 px – e.g. a laptop with the controls beside the stage; legible down to 477 px)
 * and narrow (360 × 644, max 460 px wide).
 * Rows = SERVICES (web, api 1.4.0, api 1.4.1, admin). The Gateway's lanes run ABOVE the Service tags straight to the
 * Pods (the ClusterIP hop is bypassed); in LoadBalancer mode the trays go through the tag (kube-proxy).
 */
import type { Mode } from './gateway-model.ts'

export type Pt = [number, number]

export interface Geo {
  kind: 'wide' | 'medium' | 'narrow'
  W: number
  H: number
  rowY: number[]
  tag: { x: number; w: number; h: number }
  podX: number[]
  podSize: number
  /** mono / handwriting sizes that stay legible at the smallest width of this layout */
  mono: number
  hand: number
  source: { x: number; y: number; count: number; scale: number; direction: 1 | -1; exit: Pt; label: Pt }
  redar: { x: number; y: number; scale: number }
  gate: { x: number; y: number; w: number; h: number }
  gateIn: Pt
  gateOut: Pt
  sign: { x: number; y: number; w: number; h: number }
  envelope: { x: number; y: number }
  listeners: Pt
  lbRedars: { x: number; y: number; scale: number; label: Pt }[]
  laneY: (row: number) => number
  /** gw: x where the road leaves the signpost, and x of the trunk the lanes branch from */
  preTrunk: number
  trunk: number
  /** lb (wide / medium): x where the roads from the students bend towards each load balancer */
  lbBend: number
}

const LANE = 42

export const WIDE: Geo = {
  kind: 'wide',
  W: 680,
  H: 500,
  rowY: [80, 190, 300, 410],
  tag: { x: 348, w: 132, h: 38 },
  podX: [530, 588, 644],
  podSize: 32,
  mono: 14,
  hand: 14,
  source: { x: 50, y: 286, count: 2, scale: 0.42, direction: -1, exit: [70, 254], label: [34, 312] },
  redar: { x: 128, y: 254, scale: 0.45 },
  gate: { x: 172, y: 176, w: 110, h: 118 },
  gateIn: [186, 258],
  gateOut: [270, 258],
  sign: { x: 288, y: 214, w: 38, h: 44 },
  envelope: { x: 198, y: 362 },
  listeners: [227, 318],
  lbRedars: [
    { x: 268, y: 80, scale: 0.45, label: [268, 128] },
    { x: 268, y: 190, scale: 0.45, label: [268, 238] },
    { x: 268, y: 410, scale: 0.45, label: [268, 458] },
  ],
  laneY: (row) => WIDE.rowY[row] - LANE,
  preTrunk: 326,
  trunk: 336,
  lbBend: 214,
}

export const MEDIUM: Geo = {
  kind: 'medium',
  W: 556,
  H: 500,
  rowY: [80, 190, 300, 410],
  tag: { x: 280, w: 132, h: 38 },
  podX: [444, 492, 540],
  podSize: 30,
  mono: 14,
  hand: 14,
  source: { x: 40, y: 286, count: 2, scale: 0.4, direction: -1, exit: [58, 254], label: [30, 312] },
  redar: { x: 100, y: 253, scale: 0.42 },
  gate: { x: 134, y: 176, w: 96, h: 112 },
  gateIn: [146, 253],
  gateOut: [220, 253],
  sign: { x: 236, y: 216, w: 28, h: 36 },
  envelope: { x: 150, y: 362 },
  listeners: [182, 318],
  lbRedars: [
    { x: 214, y: 80, scale: 0.42, label: [214, 128] },
    { x: 214, y: 190, scale: 0.42, label: [214, 238] },
    { x: 214, y: 410, scale: 0.42, label: [214, 458] },
  ],
  laneY: (row) => MEDIUM.rowY[row] - LANE,
  preTrunk: 264,
  trunk: 272,
  lbBend: 166,
}

export const NARROW: Geo = {
  kind: 'narrow',
  W: 360,
  H: 644,
  rowY: [262, 358, 454, 550],
  tag: { x: 20, w: 134, h: 36 },
  podX: [204, 258, 312],
  podSize: 30,
  mono: 14,
  hand: 14,
  source: { x: 26, y: 92, count: 2, scale: 0.4, direction: 1, exit: [70, 66], label: [36, 112] },
  redar: { x: 104, y: 66, scale: 0.42 },
  gate: { x: 134, y: 10, w: 104, h: 108 },
  gateIn: [146, 84],
  gateOut: [226, 84],
  sign: { x: 248, y: 58, w: 36, h: 40 },
  envelope: { x: 162, y: 160 },
  listeners: [186, 140],
  lbRedars: [
    { x: 148, y: 66, scale: 0.4, label: [148, 108] },
    { x: 226, y: 66, scale: 0.4, label: [226, 108] },
    { x: 304, y: 66, scale: 0.4, label: [304, 108] },
  ],
  laneY: (row) => NARROW.rowY[row] - 38,
  preTrunk: 344,
  trunk: 344,
  lbBend: 0,
}

/** LB index (0 web, 1 api, 2 admin) → row index */
export const LB_ROW = [0, 1, 3]

export function inPath(g: Geo, mode: Mode, lb: number): Pt[] {
  if (mode === 'gw') return [g.source.exit, [g.redar.x, g.redar.y], g.gateIn]
  const r = g.lbRedars[lb]
  if (g.kind !== 'narrow') return [g.source.exit, [g.lbBend, r.y], [r.x, r.y]]
  return [g.source.exit, [r.x, 22], [r.x, r.y]]
}

export function outPath(g: Geo, mode: Mode, row: number, pod: number, lb: number): Pt[] {
  const px = g.podX[pod]
  const top: Pt = [px, g.rowY[row] - g.podSize / 2 - 6]
  const lane = g.laneY(row)
  if (mode === 'gw') {
    const tx = g.trunk
    if (g.kind !== 'narrow') return [g.gateIn, g.gateOut, [g.preTrunk, g.gateOut[1]], [tx, lane], [px, lane], top]
    return [g.gateIn, g.gateOut, [tx, g.gateOut[1] + 14], [tx, lane], [px, lane], top]
  }
  const r = g.lbRedars[lb]
  // the trays pass through the lower part of the tag (kube-proxy), so the Service name stays readable
  const y = g.rowY[row] + g.tag.h * 0.42
  const tagIn: Pt = [g.tag.x, y]
  const tagOut: Pt = [g.tag.x + g.tag.w, y]
  if (g.kind !== 'narrow') return [[r.x, r.y], tagIn, tagOut, [g.tag.x + g.tag.w + 22, lane], [px, lane], top]
  // narrow: down the left gutter, through the tag, then up to the lane
  const corridor = 206
  return [[r.x, r.y], [r.x, corridor], [8, corridor], [8, y], tagIn, tagOut, [g.tag.x + g.tag.w + 16, lane], [px, lane], top]
}

/** Where a request that failed at the Gateway falls (spread a little by its id, so failures don't pile into one blot). */
export function failPt(g: Geo, at: 'entry' | 'exit', id = 0): Pt {
  const jitter = ((id * 7919) % 17) - 8
  return at === 'entry' ? [g.gateIn[0] + jitter * 0.6, g.gateIn[1]] : [(g.gateIn[0] + g.gateOut[0]) / 2 + 12 + jitter, g.gateOut[1]]
}

/** Road polylines for the current mode (pencil lines under the trays). */
export function roads(g: Geo, mode: Mode, podsPerRow: number[]): Pt[][] {
  const out: Pt[][] = []
  if (mode === 'gw') {
    out.push([g.source.exit, [g.redar.x, g.redar.y], g.gateIn, g.gateOut])
    podsPerRow.forEach((n, row) => {
      if (!n) return
      const p = outPath(g, 'gw', row, n - 1, 0)
      out.push(p.slice(1))
      for (let i = 0; i < n - 1; i++) {
        const q = outPath(g, 'gw', row, i, 0)
        out.push(q.slice(-2))
      }
    })
  } else {
    ;[0, 1, 2].forEach((lb) => {
      const row = LB_ROW[lb]
      out.push(inPath(g, 'lb', lb))
      const n = podsPerRow[row]
      const p = outPath(g, 'lb', row, n - 1, lb)
      out.push(p)
      for (let i = 0; i < n - 1; i++) out.push(outPath(g, 'lb', row, i, lb).slice(-2))
    })
  }
  return out
}
