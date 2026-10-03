/**
 * Geometry of the flagship stage (viewBox units). Two layouts chosen by the stage container width:
 *   wide   720 × 392 – three servers side by side, 4 × 4 slot grid (14 used); used from 580 px (15-unit mono ≥ 12 px)
 *   narrow 380 × 640 – servers stacked, 7 × 2 slot grid; never wider than 460 px
 */
import { DAY } from '../model'

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
  davor: { x: number; y: number; scale: number }
  bubble: Box & { tx: number; ty: number }
  zzz: { x: number; y: number }
  clock: { x: number; y: number; anchor: 'middle' | 'start' }
  loop: { cx: number; cy: number; r: number; tx: number }
  wait: { x: number; y: number }
  servers: Box[]
  cols: number
  cell: { w: number; h: number; gx: number; gy: number }
  /** slot grid origin inside a server frame */
  grid: { dx: number; dy: number }
  timeline: { x1: number; x2: number; y: number }
  /** font sizes (viewBox units) chosen so the smallest layout width keeps mono ≥ 12 px and Caveat ≥ 17 px */
  fs: { mono: number; hand: number }
}

export const SLOTS = 14

export const WIDE: StageGeo = {
  narrow: false,
  W: 720,
  H: 392,
  davor: { x: 10, y: 4, scale: 0.8 },
  bubble: { x: 96, y: 6, w: 150, h: 54, tx: 60, ty: 32 },
  zzz: { x: 82, y: 34 },
  clock: { x: 334, y: 64, anchor: 'middle' },
  loop: { cx: 498, cy: 34, r: 22, tx: 530 },
  wait: { x: 470, y: 72 },
  servers: [0, 1, 2].map((i) => ({ x: 2 + i * 246, y: 124, w: 226, h: 190 })),
  cols: 4,
  cell: { w: 48, h: 30, gx: 6, gy: 6 },
  grid: { dx: 8, dy: 40 },
  timeline: { x1: 24, x2: 696, y: 346 },
  fs: { mono: 15, hand: 22 },
}

export const NARROW: StageGeo = {
  narrow: true,
  W: 380,
  H: 640,
  davor: { x: 4, y: 4, scale: 0.8 },
  bubble: { x: 84, y: 4, w: 130, h: 52, tx: 54, ty: 32 },
  zzz: { x: 74, y: 34 },
  clock: { x: 300, y: 60, anchor: 'middle' },
  loop: { cx: 26, cy: 138, r: 18, tx: 54 },
  wait: { x: 4, y: 534 },
  servers: [0, 1, 2].map((i) => ({ x: 2, y: 172 + i * 122, w: 376, h: 108 })),
  cols: 7,
  cell: { w: 48, h: 30, gx: 5, gy: 5 },
  grid: { dx: 7, dy: 34 },
  timeline: { x1: 20, x2: 360, y: 600 },
  fs: { mono: 16, hand: 22 },
}

/** Top-left corner of a slot inside server i. */
export function slotXY(g: StageGeo, i: number, slot: number): { x: number; y: number } {
  const sv = g.servers[i]
  const c = slot % g.cols
  const r = Math.floor(slot / g.cols)
  return { x: sv.x + g.grid.dx + c * (g.cell.w + g.cell.gx), y: sv.y + g.grid.dy + r * (g.cell.h + g.cell.gy) }
}

/** Day minute → x on the timeline strip. */
export function minuteX(g: StageGeo, minute: number): number {
  const t = (minute - DAY.start) / (DAY.end - DAY.start)
  return g.timeline.x1 + Math.max(0, Math.min(1, t)) * (g.timeline.x2 - g.timeline.x1)
}

export const TIMELINE_MARKS: { minute: number; label: string; short?: string; tone: 'bad' | 'ok' | 'info' }[] = [
  { minute: DAY.fail, label: 'pad', tone: 'bad' },
  { minute: DAY.repair, label: 'popravak', tone: 'ok' },
  { minute: DAY.version, label: 'nova verzija', tone: 'info' },
  { minute: DAY.lunch, label: 'ručak', tone: 'info' },
  { minute: DAY.lunchEnd, label: 'kraj ručka', short: 'kraj', tone: 'info' },
]
