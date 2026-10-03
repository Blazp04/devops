/**
 * Geometry of the „kuhinjska šina” stage (the flagship and the small labs share one drawing).
 * Two layouts, picked by the container width (AUTHORING §6.5):
 *   wide   – viewBox 760 wide: students + API | rail and lanes | consumers grid, a bottom strip with DLQ, kitchen, SMS
 *   narrow – viewBox 330 wide (max 460 px on screen): the same pieces stacked
 * Smallest lettering: mono 13 units → wide needs ≥ 702 px, narrow ≥ 305 px for 12 px on screen.
 */
export type Pt = [number, number]

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface StageLanes {
  /** retry lane („čeka ponovni pokušaj”) */
  retry: boolean
  /** SQS: messages of a crashed consumer that stay invisible until the timer runs out */
  invisible: boolean
  /** dead-letter queue bin */
  dlq: boolean
  /** SMS gateway phone */
  sms: boolean
}

export interface StageGeo {
  layout: 'wide' | 'narrow'
  W: number
  H: number
  students: { x: number; y: number; scale: number; max: number }
  api: Box
  lost: Pt
  rail: Box & { slots: number; slotW: number }
  retry: Box | null
  invisible: Box | null
  dlq: Box | null
  board: Box
  sms: Box | null
  cardW: number
  cardH: number
  cards: Box[]
  /** smallest width (px) at which this layout keeps 12 px lettering */
  minWidth: number
}

export const WIDE_W = 760
export const NARROW_W = 330
/** wide layout only when the container keeps mono 13 at ≥ 12 px */
export const WIDE_MIN_PX = Math.ceil((WIDE_W * 12) / 13)

export const ALL_LANES: StageLanes = { retry: true, invisible: true, dlq: true, sms: true }

export function stageGeometry(layout: 'wide' | 'narrow', consumers: number, lanes: StageLanes): StageGeo {
  const k = Math.max(1, consumers)
  if (layout === 'wide') {
    const cols = 2
    const cardW = 134
    const cardH = 50
    const rows = Math.max(3, Math.ceil(k / cols))
    const cx0 = 478
    const cy0 = 82
    const cards: Box[] = Array.from({ length: Math.max(consumers, 0) }, (_, i) => ({ x: cx0 + (i % cols) * (cardW + 14), y: cy0 + Math.floor(i / cols) * (cardH + 10), w: cardW, h: cardH }))
    let y = 70
    const rail = { x: 150, y, w: 296, h: 76, slots: 9, slotW: 32 }
    y += rail.h + 16
    let retry: Box | null = null
    let invisible: Box | null = null
    if (lanes.retry) {
      retry = { x: 150, y, w: 296, h: 64 }
      y += 64 + 12
    }
    if (lanes.invisible) {
      invisible = { x: 150, y, w: 296, h: 64 }
      y += 64 + 12
    }
    const topBand = Math.max(y, 250, cy0 + rows * (cardH + 10))
    const bottomY = topBand + 10
    const dlq = lanes.dlq ? { x: 150, y: bottomY, w: 150, h: 104 } : null
    const board = { x: lanes.dlq ? 318 : 150, y: bottomY, w: lanes.dlq ? 270 : 330, h: 104 }
    const sms = lanes.sms ? { x: 612, y: bottomY, w: 148, h: 104 } : null
    return {
      layout,
      W: WIDE_W,
      H: bottomY + 112,
      students: { x: 104, y: 72, scale: 0.42, max: 5 },
      api: { x: 8, y: 100, w: 118, h: 62 },
      lost: [66, 192],
      rail,
      retry,
      invisible,
      dlq,
      board,
      sms,
      cardW,
      cardH,
      cards,
      minWidth: WIDE_MIN_PX,
    }
  }
  // narrow
  const cols = 2
  const cardW = 152
  const cardH = 50
  const rows = Math.max(2, Math.ceil(k / cols))
  const students = { x: 112, y: 92, scale: 0.36, max: 4 }
  const api = { x: 176, y: 26, w: 110, h: 60 }
  const lost: Pt = [306, 70]
  let y = 112
  const rail = { x: 4, y, w: 322, h: 76, slots: 9, slotW: 35 }
  y += rail.h + 14
  // rail → consumers → Mira's pass first (the everyday flow never crosses anything), the redelivery lanes below them
  const cy0 = y + 22
  const cards: Box[] = Array.from({ length: Math.max(consumers, 0) }, (_, i) => ({ x: 6 + (i % cols) * (cardW + 14), y: cy0 + Math.floor(i / cols) * (cardH + 10), w: cardW, h: cardH }))
  y = cy0 + rows * (cardH + 10) + 8
  const board = { x: 4, y, w: 322, h: 100 }
  y += 100 + 12
  let retry: Box | null = null
  let invisible: Box | null = null
  if (lanes.retry && lanes.invisible) {
    retry = { x: 4, y, w: 156, h: 70 }
    invisible = { x: 170, y, w: 156, h: 70 }
    y += 70 + 12
  } else if (lanes.retry || lanes.invisible) {
    const b = { x: 4, y, w: 322, h: 64 }
    if (lanes.retry) retry = b
    else invisible = b
    y += 64 + 12
  }
  let dlq: Box | null = null
  let sms: Box | null = null
  if (lanes.dlq && lanes.sms) {
    dlq = { x: 4, y, w: 156, h: 100 }
    sms = { x: 170, y, w: 156, h: 100 }
    y += 108
  } else if (lanes.dlq || lanes.sms) {
    const b = { x: 4, y, w: 322, h: 100 }
    if (lanes.dlq) dlq = b
    else sms = b
    y += 108
  }
  return { layout, W: NARROW_W, H: y + 4, students, api, lost, rail, retry, invisible, dlq, board, sms, cardW, cardH, cards, minWidth: 305 }
}

/** Centre of a ticket slot on the rail: slot 0 = the head of the queue (right end, next to the consumers). */
export function railSlot(g: StageGeo, i: number): Pt {
  const r = g.rail
  return [r.x + r.w - 22 - i * r.slotW, r.y + 50]
}

export const centre = (b: Box): Pt => [b.x + b.w / 2, b.y + b.h / 2]

/**
 * Where a flight starts or ends. `consumerIndex` maps consumer ids to card positions (cards follow consumerViews order).
 * The rail is entered at its tail and left at its head.
 */
export function placePoint(g: StageGeo, place: string, role: 'from' | 'to', consumerIndex: Map<number, number>, direct = false): Pt | null {
  switch (place) {
    case 'producer':
      // an order is published by the API (queue mode); in direct mode the request comes straight from a student
      if (!direct) return g.layout === 'wide' ? [g.api.x + g.api.w, g.api.y + g.api.h / 2] : [g.api.x + 24, g.api.y + g.api.h]
      return [g.students.x - 6, g.students.y - 26]
    case 'api':
      return centre(g.api)
    case 'queue': {
      const r = g.rail
      return role === 'to' ? [r.x + 18, r.y + 50] : railSlot(g, 0)
    }
    case 'retry':
      return g.retry ? centre(g.retry) : null
    case 'invisible':
      return g.invisible ? centre(g.invisible) : null
    case 'dlq':
      return g.dlq ? centre(g.dlq) : null
    case 'done':
      // the top-right corner of Mira's pass: done tickets drop straight down from the cards, never through the lanes
      return [g.board.x + g.board.w - 24, g.board.y - 2]
    case 'lost':
      return g.lost
    case 'sms':
      return g.sms ? [g.sms.x + 30, g.sms.y + g.sms.h / 2] : null
    default: {
      if (!place.startsWith('consumer:')) return null
      const idx = consumerIndex.get(Number(place.slice(9)))
      if (idx === undefined) return null
      const c = g.cards[idx]
      if (!c) return null
      return [c.x - 8, c.y + c.h / 2]
    }
  }
}
