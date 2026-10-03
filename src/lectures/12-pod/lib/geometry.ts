/**
 * Layouts of the health-lab stage. WIDE: the traffic column on the left, one row per Pod (≥ 700 px of stage, so the
 * smallest lettering – 13 units of Plex Mono – is ≥ 12 px). MEDIUM (tablets, 556–700 px): the same Pod rows with the
 * Service tag above them (viewBox 600, 13 units → ≥ 12 px at 556 px). NARROW: one card per Pod under the Service tag
 * (viewBox 360, never wider than 460 px; at 320 px the 13,5-unit lettering is still 12 px).
 */
export type P = [number, number]

export interface LabGeo {
  kind: 'wide' | 'medium' | 'narrow'
  W: number
  H: number
  /** min stage width (px) at which this layout is used */
  font: { mono: number; monoSmall: number; name: number; hand: number }
  tag: { x: number; y: number; w: number; h: number }
  /** where trays leave the tag */
  tagOut: P
  /** a request with no endpoint: leaves the tag and falls here (✗) */
  drop: P[]
  /** Rosetta note „etiketa = Service” */
  gloss: { x: number; y: number; anchor: 'middle' | 'start' }
  readyText: P
  readyAnchor: 'middle' | 'start'
  /** one line (narrow) or two lines (wide) under the ready count */
  noteLines: 1 | 2
  traffic: P
  students: { x: number; y: number } | null
  db: { x: number; y: number; w: number; h: number; textX: number; textY: number; anchor: 'start' | 'end' | 'middle' }
  row: (i: number) => RowGeo
}

export interface RowGeo {
  frame: { x: number; y: number; w: number; h: number }
  pod: P
  podSize: number
  port: P
  /** tray route from the tag to the port */
  route: P[]
  name: P
  meta: P
  lines: { x: number; valueX: number; y: number[] }
  ring: { cx: number; cy: number; r: number }
  restarts: P
  ringLabel: P
  lanes: { labelX: number; slotX: number; slotW: number; slots: number; y: number[] }
}

export const WIDE_MIN_PX = 700
export const MEDIUM_MIN_PX = 556

export const WIDE: LabGeo = {
  kind: 'wide',
  W: 760,
  H: 400,
  font: { mono: 13.5, monoSmall: 13, name: 15.5, hand: 19 },
  tag: { x: 26, y: 226, w: 124, h: 44 },
  tagOut: [150, 248],
  drop: [
    [150, 248],
    [180, 248],
  ],
  gloss: { x: 88, y: 374, anchor: 'middle' },
  readyText: [88, 296],
  readyAnchor: 'middle',
  noteLines: 2,
  traffic: [88, 196],
  students: { x: 124, y: 178 },
  db: { x: 30, y: 26, w: 46, h: 52, textX: 86, textY: 50, anchor: 'start' },
  row: (i) => {
    const y = 8 + i * 130
    const portY = y + 66
    return {
      frame: { x: 190, y, w: 564, h: 122 },
      pod: [240, y + 66],
      podSize: 44,
      port: [211, portY],
      route: [
        [150, 248],
        [172, 248],
        [172, portY],
        [211, portY],
      ],
      name: [204, y + 24],
      meta: [204, y + 112],
      lines: { x: 290, valueX: 362, y: [y + 50, y + 72, y + 94] },
      ring: { cx: 530, cy: y + 66, r: 21 },
      restarts: [530, y + 30],
      ringLabel: [530, y + 108],
      lanes: { labelX: 572, slotX: 660, slotW: 15, slots: 6, y: [y + 38, y + 68, y + 98] },
    }
  },
}

export const NARROW: LabGeo = {
  kind: 'narrow',
  W: 360,
  H: 784,
  font: { mono: 13.5, monoSmall: 13.5, name: 15.5, hand: 20 },
  tag: { x: 20, y: 40, w: 124, h: 42 },
  tagOut: [30, 82],
  drop: [
    [30, 82],
    [14, 100],
  ],
  gloss: { x: 152, y: 66, anchor: 'start' },
  readyText: [22, 108],
  readyAnchor: 'start',
  noteLines: 1,
  traffic: [20, 26],
  students: null,
  db: { x: 300, y: 28, w: 40, h: 46, textX: 346, textY: 96, anchor: 'end' },
  row: (i) => {
    const y = 154 + i * 210
    const portY = y + 58
    return {
      frame: { x: 28, y, w: 328, h: 200 },
      pod: [72, y + 58],
      podSize: 46,
      port: [41, portY],
      route: [
        [30, 82],
        [14, 100],
        [14, portY],
        [41, portY],
      ],
      name: [34, y + 22],
      meta: [116, y + 46],
      lines: { x: 116, valueX: 184, y: [y + 68, y + 88, y + 108] },
      ring: { cx: 312, cy: y + 152, r: 20 },
      restarts: [312, y + 124],
      ringLabel: [312, y + 192],
      lanes: { labelX: 34, slotX: 132, slotW: 20, slots: 6, y: [y + 132, y + 158, y + 184] },
    }
  },
}

/** WIDE's Pod row moved by (dx, dy) – the medium layout reuses it under the tag. */
function shiftRow(r: RowGeo, dx: number, dy: number): RowGeo {
  const m = (p: P): P => [p[0] + dx, p[1] + dy]
  return {
    frame: { ...r.frame, x: r.frame.x + dx, y: r.frame.y + dy },
    pod: m(r.pod),
    podSize: r.podSize,
    port: m(r.port),
    route: r.route.map(m),
    name: m(r.name),
    meta: m(r.meta),
    lines: { x: r.lines.x + dx, valueX: r.lines.valueX + dx, y: r.lines.y.map((v) => v + dy) },
    ring: { ...r.ring, cx: r.ring.cx + dx, cy: r.ring.cy + dy },
    restarts: m(r.restarts),
    ringLabel: m(r.ringLabel),
    lanes: { ...r.lanes, labelX: r.lanes.labelX + dx, slotX: r.lanes.slotX + dx, y: r.lanes.y.map((v) => v + dy) },
  }
}

export const MEDIUM: LabGeo = {
  kind: 'medium',
  W: 600,
  H: 540,
  font: WIDE.font,
  tag: { x: 20, y: 40, w: 124, h: 42 },
  tagOut: [30, 82],
  drop: [
    [30, 82],
    [12, 100],
  ],
  gloss: { x: 152, y: 66, anchor: 'start' },
  readyText: [22, 108],
  readyAnchor: 'start',
  noteLines: 1,
  traffic: [20, 26],
  students: null,
  db: { x: 540, y: 26, w: 44, h: 50, textX: 530, textY: 50, anchor: 'end' },
  row: (i) => {
    const r = shiftRow(WIDE.row(i), -164, 142)
    return {
      ...r,
      route: [
        [30, 82],
        [12, 100],
        [12, r.port[1]],
        r.port,
      ],
    }
  },
}
