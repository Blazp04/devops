import type { NetId, SvcId } from './model'

/* Layouts of the „Compose slagalica” drawing: wide (stage ≥ WIDE_MIN px), medium (tablets, MEDIUM_MIN–WIDE_MIN px,
   max MEDIUM_MAX px) and narrow (phones, max 460 px). Lettering is ≥ 12 px (Caveat ≥ 17 px) at each layout's smallest width. */

export type Pt = [number, number]
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface SlagGeo {
  W: number
  H: number
  /** lettering sizes in viewBox units */
  mono: number
  small: number
  hand: number
  browser: Rect
  host: Rect
  /** host wall: doors on the left wall (wide) or on the top wall (narrow) */
  vertical: boolean
  doors: Record<'8080' | '8000' | '5432', Pt>
  regions: Record<NetId, Rect>
  regionLabel: Record<NetId, Pt>
  card: Record<NetId, { w: number; h: number }>
  slot: Record<NetId, Record<SvcId, Pt>>
  shelfLabel: Pt
  shelf: Pt[]
  cyl: { w: number; h: number }
  /** the „computer is off” stamp */
  stamp: Pt
}

export const WIDE_MIN = 700

const wideCols = [270, 466, 662]
const bridgeX = (i: number) => wideCols[i % 3] + (i < 3 ? -48 : 48)

export const WIDE: SlagGeo = {
  W: 780,
  H: 566,
  mono: 15,
  small: 14,
  hand: 13.5,
  browser: { x: 6, y: 24, w: 134, h: 104 },
  host: { x: 152, y: 10, w: 622, h: 548 },
  vertical: false,
  doors: { '8080': [152, 160], '8000': [152, 216], '5432': [152, 272] },
  regions: { default: { x: 172, y: 44, w: 588, h: 266 }, bridge: { x: 172, y: 322, w: 588, h: 112 } },
  regionLabel: { default: [186, 70], bridge: [186, 346] },
  card: { default: { w: 136, h: 58 }, bridge: { w: 88, h: 42 } },
  slot: {
    default: { web: [270, 128], api: [466, 128], worker: [662, 128], redis: [270, 234], db: [466, 234], rabbitmq: [662, 234] },
    bridge: { web: [bridgeX(0), 382], api: [bridgeX(1), 382], worker: [bridgeX(2), 382], redis: [bridgeX(3), 382], db: [bridgeX(4), 382], rabbitmq: [bridgeX(5), 382] },
  },
  shelfLabel: [186, 462],
  shelf: [0, 1, 2, 3, 4].map((k) => [236 + k * 106, 470] as Pt),
  cyl: { w: 54, h: 46 },
  stamp: [466, 230],
}

export const MEDIUM_MIN = 480
export const MEDIUM_MAX = 640

const mCols = [100, 280, 460]
const mBridge = (i: number) => 58 + i * 89

/** Tablets: browser on top, doors in the top wall, services in three columns. */
export const MEDIUM: SlagGeo = {
  W: 560,
  H: 700,
  mono: 15,
  small: 14.5,
  hand: 14,
  browser: { x: 6, y: 6, w: 548, h: 66 },
  host: { x: 4, y: 96, w: 552, h: 600 },
  vertical: true,
  doors: { '8080': [96, 96], '8000': [236, 96], '5432': [376, 96] },
  regions: { default: { x: 14, y: 128, w: 532, h: 290 }, bridge: { x: 14, y: 430, w: 532, h: 124 } },
  regionLabel: { default: [26, 154], bridge: [26, 456] },
  card: { default: { w: 132, h: 56 }, bridge: { w: 80, h: 40 } },
  slot: {
    default: { web: [mCols[0], 222], api: [mCols[1], 222], worker: [mCols[2], 222], redis: [mCols[0], 340], db: [mCols[1], 340], rabbitmq: [mCols[2], 340] },
    bridge: { web: [mBridge(0), 494], api: [mBridge(1), 494], worker: [mBridge(2), 494], redis: [mBridge(3), 494], db: [mBridge(4), 494], rabbitmq: [mBridge(5), 494] },
  },
  shelfLabel: [26, 584],
  shelf: [0, 1, 2, 3, 4].map((k) => [74 + k * 103, 596] as Pt),
  cyl: { w: 54, h: 46 },
  stamp: [280, 290],
}

const nCols = [92, 248]
const nb = [66, 170, 274]

export const NARROW: SlagGeo = {
  W: 340,
  H: 904,
  mono: 14,
  small: 13,
  hand: 13,
  browser: { x: 6, y: 6, w: 328, h: 72 },
  host: { x: 4, y: 100, w: 332, h: 800 },
  vertical: true,
  doors: { '8080': [96, 100], '8000': [176, 100], '5432': [256, 100] },
  regions: { default: { x: 14, y: 132, w: 312, h: 336 }, bridge: { x: 14, y: 480, w: 312, h: 184 } },
  regionLabel: { default: [26, 158], bridge: [26, 506] },
  card: { default: { w: 128, h: 54 }, bridge: { w: 90, h: 40 } },
  slot: {
    default: { web: [nCols[0], 204], worker: [nCols[1], 204], api: [nCols[0], 300], rabbitmq: [nCols[1], 300], db: [nCols[0], 396], redis: [nCols[1], 396] },
    bridge: { web: [nb[0], 552], api: [nb[1], 552], worker: [nb[2], 552], redis: [nb[0], 620], db: [nb[1], 620], rabbitmq: [nb[2], 620] },
  },
  shelfLabel: [26, 696],
  shelf: [0, 1, 2, 3, 4, 5].map((k) => [70 + (k % 3) * 100, k < 3 ? 708 : 800] as Pt),
  cyl: { w: 48, h: 44 },
  stamp: [236, 466],
}

/** Where the segment from a's centre towards b leaves a's box (w × h). */
export function edgeOf(a: Pt, b: Pt, w: number, h: number, pad = 4): Pt {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  if (dx === 0 && dy === 0) return a
  const sx = dx === 0 ? Infinity : (w / 2 + pad) / Math.abs(dx)
  const sy = dy === 0 ? Infinity : (h / 2 + pad) / Math.abs(dy)
  const k = Math.min(sx, sy)
  return [a[0] + dx * k, a[1] + dy * k]
}

export function inRect(p: Pt, r: Rect): boolean {
  return p[0] >= r.x && p[0] <= r.x + r.w && p[1] >= r.y && p[1] <= r.y + r.h
}
