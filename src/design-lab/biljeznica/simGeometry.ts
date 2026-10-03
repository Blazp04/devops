/**
 * Geometry of the load-balancer drawing. Three layouts, same story and same pen:
 *  - wide   (sim width ≥ 840 px): students → redar → servers stacked on the right; metrics float over the empty top-left
 *  - medium (580–840 px, tablets): students + redar on top, the three servers side by side below
 *  - tall   (< 580 px, phones): everything stacked; drawn at most 460 px wide
 * Every text size is chosen so that, at the smallest width a layout is used, it renders at ≥ 12 px.
 */

export interface P {
  x: number
  y: number
}

export interface Route {
  pts: P[]
  cum: number[]
  len: number
}

export function route(pts: P[]): Route {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  return { pts, cum, len: cum[cum.length - 1] }
}

/** Point at fraction p (0..1) of the route — linear, constant speed. */
export function along(r: Route, p: number): P {
  const d = Math.max(0, Math.min(1, p)) * r.len
  let i = 1
  while (i < r.cum.length - 1 && r.cum[i] < d) i++
  const a = r.pts[i - 1]
  const b = r.pts[i]
  const seg = r.cum[i] - r.cum[i - 1] || 1
  const f = (d - r.cum[i - 1]) / seg
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }
}

/* ---------- Server card (local coordinates; origin = top-left of the card) ---------- */

export interface CardGeo {
  w: number
  /** name + spec: left-aligned on the wide cards, centred on the narrow one */
  align: 'left' | 'center'
  name: P
  nameSize: number
  spec: P
  specSize: number
  face: P
  faceR: number
  /** "CPU" / "RAM" words inside the card */
  labels: boolean
  cpu: { y: number; w: number; h: number; gap: number; x0: number | 'center' }
  plate: { x0: number; y0: number; pitch: number; rowH: number; perRow: number; r: number }
  /** CPU % left, RAM GB right on one line at the bottom (null = the gauges speak for themselves) */
  readout: { size: number } | null
  /** space under the last row of plates */
  pad: number
  queue: { x0: number; y: number; w: number; h: number; gap: number; label: boolean }
  /** where trays land: the back of the queue */
  entry: P
  /** active connections, end-anchored (null = not shown) */
  conns: P | null
  /** where a finished request's ✓ appears (it then rises and fades) */
  tick: P
  /** horizontal offset of a rejected tray from the queue's entry (keeps it inside the drawing) */
  markDx: number
}

const CARD_WIDE: CardGeo = {
  w: 236,
  align: 'left',
  name: { x: 14, y: 27 },
  nameSize: 22,
  spec: { x: 14, y: 46 },
  specSize: 14.5,
  face: { x: 190, y: 33 },
  faceR: 21,
  labels: true,
  cpu: { y: 55, w: 24, h: 21, gap: 29, x0: 54 },
  plate: { x0: 64, y0: 95, pitch: 19.5, rowH: 19, perRow: 8, r: 7.2 },
  readout: { size: 14.5 },
  pad: 33,
  queue: { x0: 4, y: -28, w: 24, h: 18, gap: 27, label: true },
  entry: { x: -10, y: -19 },
  conns: { x: 224, y: 72 },
  tick: { x: 248, y: 34 },
  markDx: -6,
}

const CARD_MED: CardGeo = {
  ...CARD_WIDE,
  w: 222,
  face: { x: 178, y: 33 },
  cpu: { y: 55, w: 22, h: 20, gap: 27, x0: 50 },
  plate: { x0: 60, y0: 95, pitch: 18.6, rowH: 19, perRow: 8, r: 7 },
  readout: { size: 14.5 },
  conns: { x: 210, y: 72 },
  queue: { x0: 4, y: -28, w: 23, h: 18, gap: 26, label: true },
  tick: { x: 232, y: 34 },
}

const CARD_TALL: CardGeo = {
  w: 112,
  align: 'center',
  name: { x: 56, y: 21 },
  nameSize: 17,
  spec: { x: 56, y: 38 },
  specSize: 13,
  face: { x: 56, y: 66 },
  faceR: 17,
  labels: false,
  cpu: { y: 92, w: 20, h: 17, gap: 24, x0: 'center' },
  plate: { x0: 18, y0: 127, pitch: 19, rowH: 18, perRow: 5, r: 7 },
  readout: null,
  pad: 12,
  queue: { x0: 3, y: -24, w: 14, h: 13, gap: 18, label: false },
  entry: { x: -4, y: -17 },
  conns: null,
  tick: { x: 86, y: 60 },
  markDx: 12,
}

export function cardHeight(g: CardGeo, slots: number): number {
  const rows = Math.ceil(slots / g.plate.perRow)
  return Math.round(g.plate.y0 + (rows - 1) * g.plate.rowH + g.plate.r + g.pad)
}

export function platePos(g: CardGeo, slot: number): P {
  const col = slot % g.plate.perRow
  const row = Math.floor(slot / g.plate.perRow)
  return { x: g.plate.x0 + col * g.plate.pitch, y: g.plate.y0 + row * g.plate.rowH }
}

export function corePos(g: CardGeo, c: number, cores: number): P {
  const x0 = g.cpu.x0 === 'center' ? g.w / 2 - (cores * g.cpu.gap - (g.cpu.gap - g.cpu.w)) / 2 : g.cpu.x0
  return { x: x0 + c * g.cpu.gap, y: g.cpu.y }
}

export function queuePos(g: CardGeo, i: number): P {
  return { x: g.queue.x0 + i * g.queue.gap + g.queue.w / 2, y: g.queue.y + g.queue.h / 2 }
}

/* ---------- Layouts ---------- */

export interface Placement {
  x: number
  y: number
  s: number
}

export type Pts = [number, number][]

/** A spot for a handwritten note: wraps at `wrap` characters; `arrow(lines)` points at what the note is about. */
export interface NoteSpot {
  x: number
  y: number
  wrap: number
  arrow?: (lines: number) => Pts
}

export interface SimLayout {
  name: 'wide' | 'medium' | 'tall'
  vb: { w: number; h: number }
  /** the metrics float over the drawing's empty top-left corner (wide) instead of sitting above it */
  overlay: boolean
  /** CSS max-width of the drawing in px (tall layout on tablets would otherwise blow up) */
  maxW: number | null
  card: CardGeo
  /** visual speed in viewBox units per second (constant, linear) */
  speed: number
  /** tray size in viewBox units */
  tray: number
  /** the queue of students: the front student stands at `front`, the line grows towards `back` */
  line: { front: number; back: number; y: number; s: number; maxGap: number; max: number }
  /** the front student's phone: where every tray starts */
  source: P
  lb: Placement
  /** where trays meet the redar, and where they leave him */
  lbPoint: P
  lbOut: P
  sign: { x: number; y: number; w: number; posts: [number, number]; top: number; floor: number } | null
  lineLabel: (P & { size: number }) | null
  lbLabel: (P & { size: number }) | null
  clip: { x: number; y: number; w: number; h: number }
  servers: { x: number; y: number }[]
  notes: { mali: NoteSpot; veliki: NoteSpot; hint: NoteSpot; size: number }
  /** Davor (on call) and his speech bubble */
  davor: Placement & { bubble: { x: number; y: number; w: number; h: number } }
  bubbleSize: number
}

export const WIDE: SimLayout = {
  name: 'wide',
  vb: { w: 1000, h: 546 },
  overlay: true,
  maxW: null,
  card: CARD_WIDE,
  speed: 430,
  tray: 36,
  line: { front: 300, back: 18, y: 172, s: 0.8, maxGap: 58, max: 12 },
  source: { x: 356, y: 238 },
  lb: { x: 520, y: 250, s: 1.36 },
  lbPoint: { x: 517, y: 266 },
  lbOut: { x: 543, y: 260 },
  sign: { x: 446, y: 92, w: 148, posts: [440, 600], top: 112, floor: 334 },
  lineLabel: { x: 22, y: 318, size: 20 },
  lbLabel: { x: 520, y: 364, size: 20 },
  clip: { x: 24, y: 400, w: 252, h: 134 },
  servers: [
    { x: 744, y: 36 },
    { x: 744, y: 211 },
    { x: 744, y: 386 },
  ],
  notes: {
    size: 21,
    mali: {
      x: 462,
      y: 34,
      wrap: 24,
      arrow: () => [
        [680, 30],
        [708, 16],
        [732, 14],
      ],
    },
    veliki: {
      x: 470,
      y: 458,
      wrap: 26,
      arrow: () => [
        [700, 446],
        [718, 432],
        [738, 428],
      ],
    },
    hint: {
      x: 290,
      y: 410,
      wrap: 40,
      arrow: () => [
        [372, 392],
        [392, 330],
        [430, 276],
      ],
    },
  },
  davor: { x: 300, y: 452, s: 0.66, bubble: { x: 346, y: 384, w: 118, h: 54 } },
  bubbleSize: 21,
}

export const MEDIUM: SimLayout = {
  name: 'medium',
  vb: { w: 720, h: 594 },
  overlay: false,
  maxW: null,
  card: CARD_MED,
  speed: 400,
  tray: 32,
  line: { front: 228, back: 4, y: 92, s: 0.66, maxGap: 46, max: 10 },
  source: { x: 270, y: 146 },
  lb: { x: 392, y: 196, s: 1.1 },
  lbPoint: { x: 389, y: 209 },
  lbOut: { x: 392, y: 224 },
  sign: { x: 318, y: 50, w: 148, posts: [312, 472], top: 70, floor: 268 },
  lineLabel: { x: 4, y: 70, size: 19 },
  lbLabel: null,
  clip: { x: 488, y: 16, w: 224, h: 132 },
  servers: [
    { x: 10, y: 330 },
    { x: 249, y: 330 },
    { x: 488, y: 330 },
  ],
  notes: {
    size: 19,
    mali: { x: 10, y: 512, wrap: 24 },
    veliki: { x: 488, y: 512, wrap: 24 },
    hint: {
      x: 492,
      y: 194,
      wrap: 24,
      arrow: () => [
        [530, 226],
        [500, 250],
        [458, 272],
      ],
    },
  },
  davor: { x: 300, y: 502, s: 0.6, bubble: { x: 350, y: 470, w: 118, h: 52 } },
  bubbleSize: 20,
}

export const TALL: SimLayout = {
  name: 'tall',
  vb: { w: 360, h: 800 },
  overlay: false,
  maxW: 460,
  card: CARD_TALL,
  speed: 320,
  tray: 26,
  line: { front: 150, back: 0, y: 14, s: 0.52, maxGap: 40, max: 9 },
  source: { x: 183, y: 57 },
  lb: { x: 140, y: 300, s: 0.92 },
  lbPoint: { x: 184, y: 290 },
  lbOut: { x: 184, y: 304 },
  sign: null,
  lineLabel: null,
  lbLabel: null,
  clip: { x: 4, y: 664, w: 240, h: 128 },
  servers: [
    { x: 0, y: 434 },
    { x: 124, y: 434 },
    { x: 248, y: 434 },
  ],
  notes: {
    size: 18,
    mali: { x: 2, y: 124, wrap: 16 },
    veliki: { x: 204, y: 124, wrap: 16 },
    hint: { x: 204, y: 124, wrap: 16 },
  },
  davor: { x: 270, y: 704, s: 0.58, bubble: { x: 250, y: 634, w: 108, h: 54 } },
  bubbleSize: 18,
}

/** Pick the layout from the simulation's content width (px). */
export function layoutFor(width: number | null): SimLayout {
  if (width === null || width >= 840) return WIDE
  return width >= 580 ? MEDIUM : TALL
}

export function serverEntry(l: SimLayout, i: number): P {
  const s = l.servers[i]
  return { x: s.x + l.card.entry.x, y: s.y + l.card.entry.y }
}

/** Local card point → layout coordinates. */
export function serverPoint(l: SimLayout, i: number, p: P): P {
  const s = l.servers[i]
  return { x: s.x + p.x, y: s.y + p.y }
}

export function routesFor(l: SimLayout): { inRoute: Route; out: Route[] } {
  return {
    inRoute: route([l.source, l.lbPoint]),
    out: l.servers.map((_, i) => route([l.lbOut, serverEntry(l, i)])),
  }
}

/** How many students stand in line for a given traffic (req/s): a couple at 2/s, a long bunched line at 30+. */
export function lineCount(lambda: number, max: number): number {
  return Math.max(2, Math.min(max, Math.round(lambda / 3) + 1))
}
