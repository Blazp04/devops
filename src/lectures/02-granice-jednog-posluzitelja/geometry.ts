/**
 * Layout of the server stage shared by the step-by-step explainer and the flagship simulation:
 * students (traffic) → the road → port 8000 → the server card (brains = cores, plates = radnici) → Postgres.
 * Three layouts, picked by container width (AUTHORING §6.5): wide (760 × 420), medium for tablets (660 × 500: the
 * database moves under the card) and narrow (380 × 680, ≤ 460 px).
 * Lettering in the stage: Caveat ≥ 21, mono ≥ 14,5, Kalam ≥ 21 units (22 in the medium bubble), so it stays
 * ≥ 17 / 12 / 18 px on screen at the smallest width each layout is used for (wide ≥ 660 px, medium ≥ 548 px,
 * narrow ≥ 318 px).
 */
import type { Pt } from '../../kit'

export type StageLayout = 'wide' | 'medium' | 'narrow'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface TextAt {
  x: number
  y: number
  anchor: 'start' | 'middle' | 'end'
}

export interface StageGeo {
  vb: [number, number]
  card: Box
  /** a request travelling from the students to port 8000 */
  inPath: Pt[]
  /** an answer travelling back */
  outPath: Pt[]
  /** where a rejected tray falls (in front of the door, never over the card) */
  fall: Pt
  /** first student's feet; the line grows to the left */
  students: { x: number; y: number; scale: number; gap: number; max: number }
  offered: TextAt
  port: TextAt
  db: Box
  dbLink: [Pt, Pt]
  dbLabel: TextAt
  /** Davor in the empty top-left corner (wide only) */
  davor: { x: number; y: number; scale: number; bubble: Box; mouth: Pt } | null
  /** where requests that hit a machine that is off pile up */
  parked: { x: number; y: number; dx: number; dy: number; perRow: number }
}

export const STAGE: Record<StageLayout, StageGeo> = {
  wide: {
    vb: [760, 420],
    card: { x: 330, y: 140, w: 300, h: 262 },
    inPath: [
      [176, 340],
      [324, 340],
    ],
    outPath: [
      [324, 368],
      [176, 368],
    ],
    fall: [292, 398],
    students: { x: 142, y: 406, scale: 0.52, gap: 23, max: 6 },
    offered: { x: 84, y: 282, anchor: 'middle' },
    port: { x: 318, y: 324, anchor: 'end' },
    db: { x: 666, y: 204, w: 66, h: 74 },
    dbLink: [
      [632, 242],
      [662, 242],
    ],
    dbLabel: { x: 700, y: 306, anchor: 'middle' },
    davor: { x: 4, y: 4, scale: 0.72, bubble: { x: 72, y: 2, w: 170, h: 70 }, mouth: [34, 30] },
    parked: { x: 304, y: 330, dx: -26, dy: -16, perRow: 4 },
  },
  medium: {
    vb: [660, 500],
    card: { x: 330, y: 140, w: 300, h: 262 },
    inPath: [
      [176, 340],
      [324, 340],
    ],
    outPath: [
      [324, 368],
      [176, 368],
    ],
    fall: [292, 398],
    students: { x: 142, y: 406, scale: 0.52, gap: 23, max: 6 },
    offered: { x: 84, y: 282, anchor: 'middle' },
    port: { x: 318, y: 324, anchor: 'end' },
    db: { x: 560, y: 426, w: 62, h: 62 },
    dbLink: [
      [591, 404],
      [591, 424],
    ],
    dbLabel: { x: 546, y: 448, anchor: 'end' },
    davor: { x: 4, y: 4, scale: 0.72, bubble: { x: 72, y: 2, w: 170, h: 70 }, mouth: [34, 30] },
    parked: { x: 304, y: 330, dx: -26, dy: -16, perRow: 4 },
  },
  narrow: {
    vb: [380, 680],
    card: { x: 24, y: 330, w: 292, h: 262 },
    inPath: [
      [344, 156],
      [344, 322],
    ],
    outPath: [
      [360, 322],
      [360, 156],
    ],
    fall: [346, 356],
    students: { x: 300, y: 152, scale: 0.5, gap: 23, max: 6 },
    offered: { x: 14, y: 62, anchor: 'start' },
    port: { x: 334, y: 200, anchor: 'end' },
    db: { x: 268, y: 612, w: 62, h: 60 },
    dbLink: [
      [299, 596],
      [299, 612],
    ],
    dbLabel: { x: 254, y: 636, anchor: 'end' },
    davor: null,
    parked: { x: 344, y: 300, dx: 0, dy: -15, perRow: 1 },
  },
}

/** Pieces inside the server card (relative to the card box). */
export interface CardGeo {
  name: Pt
  spec: Pt
  face: Pt
  coresLabel: Pt
  /** x of the first brain, its top y, size and pitch */
  brains: { x: number; y: number; w: number; h: number; pitch: number }
  workersLabel: Pt
  workersCount: Pt
  plates: Box
  footer: Pt
}

/** One brain per core, as big as fits next to „jezgre” (2 cores: 38 × 32 units, 8 cores: ≈ 23 × 19). */
function brainsFor(c: Box, cores: number): CardGeo['brains'] {
  const room = c.w - 14 - 80
  const pitch = Math.min(44, room / Math.max(1, cores))
  const w = Math.min(38, pitch - 3)
  const h = (w * 22) / 26
  return { x: c.x + 80, y: c.y + 91 - h / 2, w, h, pitch }
}

export function cardGeo(c: Box, cores = 2): CardGeo {
  return {
    name: [c.x + 14, c.y + 30],
    spec: [c.x + 14, c.y + 54],
    face: [c.x + c.w - 32, c.y + 32],
    coresLabel: [c.x + 14, c.y + 98],
    brains: brainsFor(c, cores),
    workersLabel: [c.x + 14, c.y + 136],
    workersCount: [c.x + c.w - 14, c.y + 136],
    plates: { x: c.x + 14, y: c.y + 148, w: c.w - 28, h: 80 },
    footer: [c.x + 14, c.y + c.h - 14],
  }
}

/** Queue slots above the card: 10 per row, rows stack upwards. */
export const QUEUE_PER_ROW = 10
export const QUEUE_PITCH = 30
export const QUEUE_ROW = 26

export function queueSlot(card: Box, i: number): Box {
  const row = Math.floor(i / QUEUE_PER_ROW)
  const col = i % QUEUE_PER_ROW
  return { x: card.x + col * QUEUE_PITCH + 2, y: card.y - 34 - row * QUEUE_ROW, w: QUEUE_PITCH - 6, h: 22 }
}

/** Plates (radnik slots) laid out in the plate region: the biggest plates that fit. At most 80 are drawn. */
export const MAX_PLATES = 80

export function plateGrid(region: Box, n: number): { r: number; pts: Pt[] } {
  const count = Math.min(MAX_PLATES, Math.max(0, n))
  let pitch = 13
  for (const p of [30, 22, 19, 17, 15, 13]) {
    const cols = Math.max(1, Math.floor(region.w / p))
    if (Math.ceil(count / cols) * p <= region.h) {
      pitch = p
      break
    }
  }
  const cols = Math.max(1, Math.floor(region.w / pitch))
  const pts: Pt[] = []
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols)
    const col = i % cols
    pts.push([region.x + pitch / 2 + col * pitch, region.y + pitch / 2 + row * pitch])
  }
  return { r: pitch * 0.4, pts }
}

/** Container width from which the wide stage keeps its lettering legible (760 × 12 / 14,5 ≈ 630, Caveat 760 × 17 / 21 ≈ 615). */
export const WIDE_FROM = 660
/** … and the medium one (660 × 12 / 14,5 ≈ 546, Caveat 660 × 17 / 21 ≈ 534, Kalam 660 × 18 / 22 ≈ 540). */
export const MEDIUM_FROM = 548

export function stageLayoutFor(width: number | null): StageLayout {
  if (width === null || width >= WIDE_FROM) return 'wide'
  return width >= MEDIUM_FROM ? 'medium' : 'narrow'
}
