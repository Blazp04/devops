/**
 * Geometry of detail A (the load-balancer drawing).
 *   - wide: fixed 1000 × 480 drawing, scaled to the container (used from 860 px up, so 13-unit text ≥ 11 px);
 *   - tall: drawn 1 unit = 1 px for the actual container width, so text is always its real size.
 *
 * The load balancer is drawn as a distributor housing ("razdjelnik"): one inlet, one outlet port per server.
 * The fan-out happens inside the housing, so every outlet pipe has the same length (OUT_LEN): the trip to a
 * server costs every server the same time and the drawing itself never favours one of them.
 * Controls are HTML laid over the drawing at these coordinates (see LbSim.tsx).
 */
import { route, type Pt } from './geom'
import type { Geo } from './lbModel'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface Layout extends Geo {
  tall: boolean
  W: number
  H: number
  people: Pt[]
  port: Pt
  /** distributor housing, the selector inside it and its outlet ports */
  housing: Box
  r: number
  ports: Pt[]
  /** counter windows (open connections) on each outlet */
  counters: Box[]
  /** passages bored through the housing: inlet → selector, selector → each outlet port */
  inlet: string
  channels: string[]
  boxes: Box[]
  tabs: Box[]
  valves: Pt[]
  hcAt: Pt[]
  hcAnchor: ('start' | 'end')[]
  /** return lane for each branch, server side only (the rest runs inside the housing / to the students) */
  backLanes: string[]
  backMain: string
  ruler: { x0: number; x1: number; y: number }
  capLabel: { at: Pt; anchor: 'start' | 'end' }
  caption: Pt
  readout: Pt
  studentsLabel: Pt
  tally: { at: Pt; anchor: 'start' | 'end' }
  /** algorithm selector (HTML overlay): centre point, or the top-right corner in the tall drawing */
  selector: Pt
  /** wide only: the general-notes field (HTML overlay) */
  notes: Box | null
  lbLabel: { at: Pt; anchor: 'start' | 'middle'; size: number }
  counterNote: Pt | null
  /** where the return lanes pass through the housing wall: side of the housing and position along it */
  cuts: { side: 'l' | 'r' | 't' | 'b'; at: number }[]
}

export const RATE_MIN = 1
export const RATE_MAX = 40
/** every outlet pipe is this long: 100 units ≈ 0,2 s at SPEED */
export const OUT_LEN = 100

export function rateX(l: Layout, v: number): number {
  return l.ruler.x0 + (v / RATE_MAX) * (l.ruler.x1 - l.ruler.x0)
}

export function wideLayout(): Layout {
  const ys = [88, 240, 392]
  const housing = { x: 432, y: 44, w: 120, h: 392 }
  const hx = housing.x + housing.w // outlet ports
  const lb: Pt = [474, 240]
  const r = 30
  const BX = hx + OUT_LEN // server inlets
  const counters = ys.map((y) => ({ x: hx - 40, y: y - 12, w: 34, h: 24 }))
  return {
    tall: false,
    W: 1000,
    H: 480,
    people: [
      [58, 262],
      [96, 250],
      [134, 262],
    ],
    port: [160, 240],
    housing,
    r,
    lb,
    ports: ys.map((y): Pt => [hx, y]),
    counters,
    inlet: `M${housing.x},240 H${lb[0]}`,
    channels: [`M${lb[0]},${lb[1]} V${ys[0]} H${hx}`, `M${lb[0]},${lb[1]} H${hx}`, `M${lb[0]},${lb[1]} V${ys[2]} H${hx}`],
    inRoute: route([[160, 240], lb]),
    out: ys.map((y) => route([[hx, y], [BX, y]])),
    back: ys.map((y) => route([[BX, y + 22], [hx - 12, y + 22], [hx - 12, 262], [160, 262]])),
    backLanes: ys.map((y) => `M${BX},${y + 22} H${hx}`),
    backMain: `M${housing.x},262 H160`,
    queueAt: (i, k) => [BX - 8 - k * 9, ys[i]],
    boxes: ys.map((y) => ({ x: BX, y: y - 68, w: 1000 - 12 - BX, h: 136 })),
    tabs: ys.map((y) => ({ x: 1000 - 12 - 84, y: y - 61, w: 76, h: 24 })),
    boxCenter: ys.map((y): Pt => [BX + 170, y + 10]),
    valves: ys.map((y): Pt => [hx + 15, y]),
    hcAt: ys.map((y): Pt => [hx + 4, y - 14]),
    hcAnchor: ['start', 'start', 'start'],
    angles: [-90, 0, 90],
    ruler: { x0: 40, x1: 360, y: 118 },
    capLabel: { at: [0, 0], anchor: 'start' },
    caption: [40, 36],
    readout: [40, 82],
    studentsLabel: [30, 204],
    tally: { at: [30, 304], anchor: 'start' },
    selector: [296, 314],
    notes: { x: 24, y: 350, w: 372, h: 118 },
    lbLabel: { at: [housing.x + housing.w / 2, 32], anchor: 'middle', size: 21 },
    counterNote: [housing.x + housing.w / 2, 456],
    cuts: [{ side: 'l', at: 262 }, ...ys.map((y) => ({ side: 'r' as const, at: y + 22 }))],
  }
}

export function tallLayout(width: number): Layout {
  const W = Math.max(300, Math.round(width / 10) * 10)
  const cx = W / 2
  const col = W / 3
  const xs = [col / 2, cx, W - col / 2]
  const housing = { x: 8, y: 244, w: W - 16, h: 92 }
  const hy = housing.y + housing.h // outlet ports
  const lb: Pt = [cx, housing.y + 30]
  const r = 18
  const top = hy + OUT_LEN // server tops
  const boxH = 292
  const boxes = xs.map((_, i) => ({ x: i * col + 4, y: top, w: col - 8, h: boxH }))
  const counters = xs.map((x) => ({ x: x - 17, y: hy - 30, w: 34, h: 22 }))
  return {
    tall: true,
    W,
    H: top + boxH + 8 + 36 + 4,
    people: [
      [cx - 44, 188],
      [cx, 178],
      [cx + 44, 188],
    ],
    port: [cx, 196],
    housing,
    r,
    lb,
    ports: xs.map((x): Pt => [x, hy]),
    counters,
    inlet: `M${cx},${housing.y} V${lb[1]}`,
    channels: [`M${cx},${lb[1]} H${xs[0]} V${hy}`, `M${cx},${lb[1]} V${hy}`, `M${cx},${lb[1]} H${xs[2]} V${hy}`],
    inRoute: route([[cx, 196], lb]),
    out: xs.map((x) => route([[x, hy], [x, top]])),
    back: xs.map((x) => route([[x + 20, top], [x + 20, hy - 12], [cx + 20, hy - 12], [cx + 20, 196]])),
    backLanes: xs.map((x) => `M${x + 20},${top} V${hy}`),
    backMain: `M${cx + 20},${housing.y} V196`,
    queueAt: (i, k) => [xs[i], top - 8 - k * 9],
    boxes,
    tabs: boxes.map((b) => ({ x: b.x + 4, y: b.y + b.h + 8, w: b.w - 8, h: 36 })),
    boxCenter: boxes.map((b): Pt => [b.x + b.w / 2, b.y + 92]),
    valves: xs.map((x): Pt => [x, hy + 13]),
    hcAt: xs.map((x): Pt => [x - 9, hy + 16]),
    hcAnchor: ['end', 'end', 'end'],
    angles: [180, 90, 0],
    ruler: { x0: 16, x1: W - 16, y: 94 },
    capLabel: { at: [W - 16, 128], anchor: 'end' },
    caption: [8, 18],
    readout: [8, 58],
    studentsLabel: [8, 152],
    tally: { at: [W - 8, 152], anchor: 'end' },
    selector: [W - 6, 6],
    notes: null,
    lbLabel: { at: [18, housing.y + 19], anchor: 'start', size: 16 },
    counterNote: null,
    cuts: [{ side: 't', at: cx + 20 }, ...xs.map((x) => ({ side: 'b' as const, at: x + 20 }))],
  }
}
