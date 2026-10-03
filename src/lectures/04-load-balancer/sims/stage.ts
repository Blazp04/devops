/**
 * Geometry of the „redar na ulazu” drawing (students → redar = load balancer → server cards), for any rack of 1–5
 * servers. Layouts are picked by the stage's own width (never the window):
 *  - side   (stage ≥ 680 px, ≤ 3 servers): students and the redar on the left, wide cards stacked on the right
 *  - stack  (stage ≥ 500 px): students and the redar on top, wide cards in a grid below (2 or 3 per row)
 *  - narrow (stage < 500 px): compact cards three to a row, drawn at most 460 px wide
 * Text sizes are chosen so that every label is ≥ 12 px (Caveat ≥ 17, Kalam ≥ 18) at the smallest width that uses
 * the layout.
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

/** Point at fraction p (0..1) of a route: straight lines, constant speed. */
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

/** Two routes walked one after the other at one constant speed (students → redar → server). */
export function alongBoth(a: Route, b: Route, p: number): P {
  const total = a.len + b.len || 1
  const d = Math.max(0, Math.min(1, p)) * total
  return d <= a.len ? along(a, a.len ? d / a.len : 1) : along(b, b.len ? (d - a.len) / b.len : 1)
}

/* ---------- server cards ---------- */

export type CardKind = 'wide' | 'compact'

export interface CardGeo {
  kind: CardKind
  w: number
  /** most plates drawn; above that one plate stands for several radnici */
  maxPlates: number
  perRow: number
  plateR: number
  pitch: number
  rowH: number
  plateX0: number
  plateY0: number
  brainY: number
  /** height above the card used by the queue slots */
  queueH: number
}

export const WIDE_CARD: CardGeo = {
  kind: 'wide',
  w: 276,
  maxPlates: 30,
  perRow: 10,
  plateR: 7.2,
  pitch: 19,
  rowH: 19,
  plateX0: 66,
  plateY0: 102,
  brainY: 60,
  queueH: 34,
}

export const COMPACT_CARD: CardGeo = {
  kind: 'compact',
  w: 98,
  maxPlates: 10,
  perRow: 5,
  plateR: 5.8,
  pitch: 14.5,
  rowH: 14.5,
  plateX0: 12,
  plateY0: 98,
  brainY: 76,
  queueH: 38,
}

export interface PlatePlan {
  /** plates drawn */
  n: number
  /** radnici per plate (1 unless aggregated) */
  per: number
  rows: number
}

export function platePlan(geo: CardGeo, slots: number): PlatePlan {
  const s = Math.max(1, Math.round(slots))
  const per = s > geo.maxPlates ? Math.ceil(s / geo.maxPlates) : 1
  const n = Math.ceil(s / per)
  return { n, per, rows: Math.ceil(n / geo.perRow) }
}

export function cardHeight(geo: CardGeo, plan: PlatePlan): number {
  const lastRow = geo.plateY0 + (plan.rows - 1) * geo.rowH
  return geo.kind === 'wide' ? lastRow + geo.plateR + 36 : lastRow + geo.plateR + 24
}

export function platePos(geo: CardGeo, k: number): P {
  return { x: geo.plateX0 + (k % geo.perRow) * geo.pitch, y: geo.plateY0 + Math.floor(k / geo.perRow) * geo.rowH }
}

/** One brain per core; more than six cores get smaller brains so they fit on one row. */
export function brainBox(geo: CardGeo, c: number, vcpu: number): { x: number; y: number; w: number; h: number } {
  const n = Math.max(1, Math.round(vcpu))
  if (geo.kind === 'wide') {
    const small = n > 5
    const w = small ? 16 : 25
    const gap = small ? 19.5 : 29
    return { x: 56 + c * gap, y: geo.brainY - (small ? 0 : 2), w, h: small ? 17 : 21 }
  }
  const small = n > 4
  const w = small ? 10.5 : 18
  const gap = small ? 11.5 : 21
  const total = (n - 1) * gap + w
  return { x: (geo.w - total) / 2 + c * gap, y: geo.brainY - (small ? 5 : 8), w, h: small ? 10 : 15 }
}

/** Queue slots above the card, local coords (wide: one row of 10; compact: two rows of 5). */
export function queueSlot(geo: CardGeo, q: number): { x: number; y: number; w: number; h: number } {
  if (geo.kind === 'wide') return { x: 4 + q * 23.5, y: -27, w: 20, h: 16 }
  const row = Math.floor(q / 5)
  return { x: 3 + (q % 5) * 18.6, y: -34 + row * 15, w: 16, h: 11.5 }
}

export const QUEUE_SLOTS = 10

/* ---------- the whole stage ---------- */

export type StageKind = 'side' | 'stack' | 'narrow'

export interface CardPlace {
  id: string
  x: number
  y: number
  scale: number
  h: number
  plan: PlatePlan
}

export interface StageLayout {
  kind: StageKind
  vb: { w: number; h: number }
  /** CSS max width of the drawing (narrow layout) */
  maxW: number | null
  geo: CardGeo
  cards: CardPlace[]
  students: { front: number; y: number; scale: number; max: number; gap: number }
  lb: { x: number; y: number; s: number }
  /** the point every tray passes (the redar's hand height) */
  lbPoint: P
  sign: { x: number; w: number; y: number; posts: [number, number]; top: number; floor: number; size: number } | null
  inRoute: Route
  outRoutes: Record<string, Route>
  /** handwritten notes: top-left corner */
  note: { x: number; y: number; size: number; wrap: number }
  /** labels: „red pred menzom · 15 zahtjeva/s”, „redar = load balancer” */
  lineLabel: { x: number; y: number; size: number } | null
  lbLabel: { x: number; y: number; size: number; anchor?: 'start' | 'middle' } | null
  /** Davor on call (side layout only) */
  davor: { x: number; y: number; s: number; bubble: { x: number; y: number; w: number; h: number } } | null
  /** the redar's health-check clipboard (side layout only): top-left corner, width, row pitch */
  clip: { x: number; y: number; w: number; h: number; row: number } | null
  /** where requests waiting at the LB (manual mode) pile up (base of the pile), and how many trays it shows */
  pending: P
  pendingMax: number
  /** where the „+N” of a taller pile goes: left of the clock or above it */
  pendingLabel: 'left' | 'above'
  tray: number
  bubbleSize: number
  /** sizes of lettering inside cards, in card units */
  font: { name: number; spec: number; hand: number; mono: number }
}

export interface RackItem {
  id: string
  vcpu: number
  /** radnik slots to draw (ServerView.slots) */
  slots: number
}

/** Pick the layout from the stage width (px) and the rack. */
export function stageLayout(width: number | null, rack: readonly RackItem[]): StageLayout {
  const w = width ?? 760
  if (w >= 680 && rack.length <= 3) return sideLayout(rack)
  if (w >= 500) return stackLayout(rack, w >= 680 ? 820 : 600, w >= 680 ? 3 : 2)
  return narrowLayout(rack)
}

function sideLayout(rack: readonly RackItem[]): StageLayout {
  const geo = WIDE_CARD
  const W = 840
  const gap = 18
  const x = W - geo.w - 22
  let y = 20
  const cards: CardPlace[] = rack.map((r) => {
    const plan = platePlan(geo, r.slots)
    const h = cardHeight(geo, plan)
    const top = y + geo.queueH
    y = top + h + gap
    return { id: r.id, x, y: top, scale: 1, h, plan }
  })
  const H = Math.max(470, y + 4)
  const mid = cards.length ? (cards[0].y + cards[cards.length - 1].y + cards[cards.length - 1].h) / 2 : H / 2
  const feet = Math.min(H - 70, Math.max(250, mid + 70))
  const lb = { x: 352, y: feet - 58 * 0.95, s: 0.95 }
  const lbPoint = { x: lb.x + 2, y: lb.y + 6 }
  const front = 232
  // clipboard: title + one row per server + the interval line; its bottom stays clear of the students' heads
  const clipRow = 25
  const clipH = 66 + rack.length * clipRow
  const clip = { x: 14, y: feet - 94 - clipH, w: 232, h: clipH, row: clipRow }
  const inRoute = route([
    { x: front + 6, y: feet - 40 },
    { x: lbPoint.x - 30, y: lbPoint.y },
    lbPoint,
  ])
  // out of the door first (below the ULAZ · MENZA sign), then fan out to the back of each queue
  const fork = { x: lb.x + 84, y: lbPoint.y }
  const outRoutes: Record<string, Route> = {}
  for (const c of cards) outRoutes[c.id] = route([lbPoint, fork, { x: c.x - 12, y: c.y - 17 }])
  return {
    kind: 'side',
    vb: { w: W, h: H },
    maxW: null,
    geo,
    cards,
    students: { front, y: feet, scale: 0.5, max: 7, gap: 34 },
    lb,
    lbPoint,
    sign: { x: lb.x - 70, w: 140, y: feet - 196, posts: [lb.x - 52, lb.x + 52], top: feet - 176, floor: feet, size: 17 },
    inRoute,
    outRoutes,
    note: { x: 18, y: Math.min(40, clip.y - 34), size: 22, wrap: 26 },
    lineLabel: { x: 14, y: feet + 30, size: 21 },
    lbLabel: { x: lb.x, y: feet + 30, size: 21 },
    davor: { x: 22, y: H - 132, s: 0.95, bubble: { x: 104, y: H - 156, w: 150, h: 58 } },
    clip,
    pending: { x: lb.x - 72, y: feet - 58 },
    pendingMax: 6,
    pendingLabel: 'left',
    tray: 34,
    bubbleSize: 22,
    font: { name: 23, spec: 16, hand: 23, mono: 16 },
  }
}

/** Cards in rows of `cols`, centred; returns the cards, the rows' top edges (queue included) and the stage height. */
function gridCards(rack: readonly RackItem[], geo: CardGeo, cols: number, cw: number, gapX: number, gapY: number, x0: number, top: number, scale: number) {
  const plans = rack.map((r) => platePlan(geo, r.slots))
  const heights = plans.map((p) => cardHeight(geo, p) * scale)
  const cards: CardPlace[] = []
  const cols0: number[] = []
  let y = top
  for (let i = 0; i < rack.length; i += cols) {
    const rowH = Math.max(...heights.slice(i, i + cols))
    for (let j = i; j < Math.min(rack.length, i + cols); j++) {
      cards.push({ id: rack[j].id, x: x0 + (j - i) * (cw + gapX), y: y + geo.queueH * scale, scale, h: heights[j], plan: plans[j] })
      cols0.push(j - i)
    }
    y += geo.queueH * scale + rowH + gapY
  }
  return { cards, cols: cols0, bottom: y }
}

/**
 * Routes that never cross a card: from the redar straight down to a „street” above the first row, along it to the
 * corridor between two columns, down the corridor and sideways into the back of the card's queue.
 * Column c uses the corridor on its right (the last column the one on its left; a single column its left margin).
 */
function corridorRoutes(cards: CardPlace[], cols: number[], nCols: number, cw: number, gapX: number, x0: number, street: number, lbPoint: P, door: (c: CardPlace, side: 'left' | 'right') => P) {
  const out: Record<string, Route> = {}
  cards.forEach((c, i) => {
    const col = cols[i]
    const k = nCols === 1 ? 0 : col < nCols - 1 ? col + 1 : col
    const corr = x0 - gapX / 2 + k * (cw + gapX)
    const side: 'left' | 'right' = k === col ? 'left' : 'right'
    const d = door(c, side)
    const pts: P[] = [lbPoint]
    if (Math.abs(corr - lbPoint.x) > 1) pts.push({ x: lbPoint.x, y: street }, { x: corr, y: street })
    pts.push({ x: corr, y: d.y }, d)
    out[c.id] = route(pts)
  })
  return out
}

function stackLayout(rack: readonly RackItem[], W: number, maxCols: number): StageLayout {
  const geo = WIDE_CARD
  const margin = 12
  const gapX = 40
  const gapY = 22
  const cols = Math.max(1, Math.min(maxCols, rack.length))
  const scale = Math.min(1, (W - 2 * margin - (cols - 1) * gapX) / cols / geo.w)
  const cw = geo.w * scale
  const rowW = cols * cw + (cols - 1) * gapX
  const x0 = (W - rowW) / 2
  const top = 236
  const { cards, cols: colOf, bottom } = gridCards(rack, geo, cols, cw, gapX, gapY, x0, top, scale)
  const H = bottom + 2
  const feet = 176
  // the redar stands over the middle of the stage; with two columns that is the corridor itself
  const lb = { x: W / 2 - 2, y: feet - 58 * 0.92, s: 0.92 }
  const lbPoint = { x: lb.x + 2, y: lb.y + 6 }
  const front = lb.x - 104
  const inRoute = route([
    { x: front + 6, y: feet - 38 },
    { x: lbPoint.x - 28, y: lbPoint.y },
    lbPoint,
  ])
  const street = top - 4
  const outRoutes = corridorRoutes(cards, colOf, cols, cw, gapX, x0, street, lbPoint, (c, side) =>
    side === 'left' ? { x: c.x - 9 * scale, y: c.y - 19 * scale } : { x: c.x + cw + 9 * scale, y: c.y - 19 * scale },
  )
  return {
    kind: 'stack',
    vb: { w: W, h: H },
    maxW: null,
    geo,
    cards,
    students: { front, y: feet, scale: 0.46, max: W >= 800 ? 9 : 5, gap: 34 },
    lb,
    lbPoint,
    sign: null,
    inRoute,
    outRoutes,
    note: { x: 12, y: 34, size: 22, wrap: W >= 800 ? 30 : 24 },
    lineLabel: { x: 12, y: feet + 30, size: 21 },
    lbLabel: { x: lb.x + 34, y: lb.y - 44, size: 21, anchor: 'start' },
    davor: null,
    clip: null,
    pending: { x: lb.x - 50, y: feet - 6 },
    pendingMax: 5,
    pendingLabel: 'above',
    tray: 30,
    bubbleSize: 22,
    font: { name: 23, spec: 16, hand: 23, mono: 16 },
  }
}

function narrowLayout(rack: readonly RackItem[]): StageLayout {
  const geo = COMPACT_CARD
  const W = 320
  const margin = 6
  // up to three servers: one row of three; four or five: two columns with a corridor between them
  const many = rack.length > 3
  const gapX = many ? 44 : 8
  const gapY = 14
  const cols = many ? 2 : Math.min(3, Math.max(1, rack.length))
  const scale = 1
  const cw = geo.w
  const rowW = cols * cw + (cols - 1) * gapX
  const x0 = Math.max(margin, (W - rowW) / 2)
  const top = 170
  const { cards, cols: colOf, bottom } = gridCards(rack, geo, cols, cw, gapX, gapY, x0, top, scale)
  const H = bottom
  const feet = 124
  const lb = { x: 236, y: feet - 58 * 0.7, s: 0.7 }
  const lbPoint = { x: lb.x + 1, y: lb.y + 5 }
  const front = 166
  const inRoute = route([
    { x: front + 4, y: feet - 28 },
    { x: lbPoint.x - 20, y: lbPoint.y },
    lbPoint,
  ])
  let outRoutes: Record<string, Route> = {}
  if (many)
    outRoutes = corridorRoutes(cards, colOf, cols, cw, gapX, x0, top - 6, lbPoint, (c, side) =>
      side === 'left' ? { x: c.x - 5, y: c.y - 24 } : { x: c.x + cw + 5, y: c.y - 24 },
    )
  else for (const c of cards) outRoutes[c.id] = route([lbPoint, { x: lbPoint.x, y: lbPoint.y + 40 }, { x: c.x + 2, y: c.y - geo.queueH - 2 }])
  return {
    kind: 'narrow',
    vb: { w: W, h: H },
    maxW: 460,
    geo,
    cards,
    students: { front, y: feet, scale: 0.34, max: 5, gap: 28 },
    lb,
    lbPoint,
    sign: null,
    inRoute,
    outRoutes,
    // the redar stands top right (x ≈ 210–260): two short lines keep the note clear of him
    note: { x: 6, y: 22, size: 19, wrap: 21 },
    lineLabel: null,
    lbLabel: null,
    davor: null,
    clip: null,
    pending: { x: lb.x - 46, y: feet - 6 },
    pendingMax: 5,
    pendingLabel: 'left',
    tray: 22,
    bubbleSize: 19,
    font: { name: 17, spec: 12.5, hand: 18, mono: 12.5 },
  }
}

/** Students in line: 2 at a trickle, the whole line at ~30 requests/s. */
export function lineCount(lambda: number, max: number): number {
  return Math.max(2, Math.min(max, Math.round(2 + lambda / 4)))
}
