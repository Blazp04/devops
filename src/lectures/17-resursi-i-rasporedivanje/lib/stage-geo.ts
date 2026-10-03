/**
 * Geometry of the „Tetris raspoređivača” stage in two layouts, picked by the stage's container width:
 * wide (≥ 700 px, viewBox 760) – queue on top, three node columns; narrow (< 700 px, viewBox 380, max 460 px) – queue
 * in two rows, nodes stacked, Pods in two columns. In each node the two reservation bars sit right under the header and
 * the Pod rows follow; the node is only as tall as the busiest node needs (at least 4 rows wide / 2 lines narrow).
 * Font sizes are in viewBox units chosen so that lettering stays ≥ 12 px (Caveat ≥ 17 px) at the smallest width of
 * each layout (700 px → ×0,92: mono 13,5 → 12,4 px; 320 px → ×0,84: mono 14,5 → 12,2 px).
 */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface StageGeo {
  narrow: boolean
  W: number
  H: number
  font: { name: number; mono: number; hand: number; label: number; barText: number }
  queue: Box
  magnifier: { cx: number; cy: number; r: number }
  schedText: { x: number; y: number; anchor: 'start' | 'middle'; line2: number | null }
  queueNote: { x: number; y: number; anchor: 'start' | 'end' }
  slot: (i: number) => { x: number; y: number }
  /** card text offsets below the lunchbox centre */
  slotText: { name: number; cpu: number; mem: number }
  queueSize: number
  nodes: Box[]
  maxRows: number
  row: (node: number, i: number) => { x: number; y: number; w: number }
  rowSize: number
  rowLine2: number
  bars: (node: number) => { cpu: { x: number; y: number; w: number }; mem: { x: number; y: number; w: number }; labelX: number; textX: number }
  barH: number
  /** the bar reading on two lines (Σ limits on its own line) – the wide node column is too narrow for one */
  splitReading: boolean
}

export const WIDE_MIN = 700
const MAX_ROWS = 8

/** `rows` = the most Pods on any one node right now (the nodes grow with it, never below the minimum). */
export function stageGeo(width: number | null, rows = 0): StageGeo {
  const narrow = width !== null && width < WIDE_MIN
  if (!narrow) {
    const W = 760
    const nodeY = 150
    const nodeW = 244
    const rowsTop = 172
    const nodeH = rowsTop + Math.min(MAX_ROWS, Math.max(4, rows)) * 31 + 4
    const nodes: Box[] = [0, 1, 2].map((i) => ({ x: 6 + i * (nodeW + 6), y: nodeY, w: nodeW, h: nodeH }))
    return {
      narrow,
      W,
      H: nodeY + nodeH + 8,
      font: { name: 13.5, mono: 13.5, hand: 19, label: 13.5, barText: 13.5 },
      queue: { x: 6, y: 8, w: 748, h: 132 },
      magnifier: { cx: 54, cy: 48, r: 22 },
      schedText: { x: 56, y: 96, anchor: 'middle', line2: 118 },
      queueNote: { x: 744, y: 30, anchor: 'end' },
      slot: (i) => ({ x: 146 + i * 77, y: 56 }),
      slotText: { name: 36, cpu: 53, mem: 69 },
      queueSize: 30,
      nodes,
      maxRows: MAX_ROWS,
      row: (n, i) => ({ x: nodes[n].x + 8, y: nodes[n].y + rowsTop + i * 31, w: nodeW - 16 }),
      rowSize: 22,
      rowLine2: 26,
      bars: (n) => {
        const b = nodes[n]
        return {
          labelX: b.x + 10,
          textX: b.x + 10,
          cpu: { x: b.x + 48, y: b.y + 38, w: nodeW - 60 },
          mem: { x: b.x + 48, y: b.y + 102, w: nodeW - 60 },
        }
      },
      barH: 16,
      splitReading: true,
    }
  }
  const W = 380
  const queue = { x: 4, y: 8, w: 372, h: 272 }
  const rowsTop = 138
  const lines = Math.min(MAX_ROWS / 2, Math.max(2, Math.ceil(rows / 2)))
  const nodeH = rowsTop + lines * 46 + 2
  const nodes: Box[] = [0, 1, 2].map((i) => ({ x: 4, y: queue.y + queue.h + 14 + i * (nodeH + 12), w: 372, h: nodeH }))
  return {
    narrow,
    W,
    H: nodes[2].y + nodeH + 8,
    font: { name: 15, mono: 14.5, hand: 21, label: 15, barText: 14.5 },
    queue,
    magnifier: { cx: 30, cy: 34, r: 17 },
    schedText: { x: 56, y: 42, anchor: 'start', line2: null },
    queueNote: { x: 368, y: 72, anchor: 'end' },
    slot: (i) => ({ x: 50 + (i % 4) * 93, y: i < 4 ? 102 : 196 }),
    slotText: { name: 36, cpu: 54, mem: 71 },
    queueSize: 30,
    nodes,
    maxRows: MAX_ROWS,
    row: (n, i) => ({ x: nodes[n].x + 6 + (i % 2) * 182, y: nodes[n].y + rowsTop + Math.floor(i / 2) * 46, w: 176 }),
    rowSize: 24,
    rowLine2: 30,
    bars: (n) => {
      const b = nodes[n]
      return {
        labelX: b.x + 10,
        textX: b.x + 10,
        cpu: { x: b.x + 58, y: b.y + 36, w: b.w - 70 },
        mem: { x: b.x + 58, y: b.y + 88, w: b.w - 70 },
      }
    },
    barH: 14,
    splitReading: false,
  }
}

export function inBox(b: Box, x: number, y: number): boolean {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h
}
