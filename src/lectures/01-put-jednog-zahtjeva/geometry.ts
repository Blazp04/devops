/**
 * Geometry of the route drawing (RouteStage): two layouts chosen by the CONTAINER width.
 *   wide   760 × 440, used from 615 px (WIDE_MIN) → scale ≥ 0,81: Caveat 21 → 17 px, mono 15 → 12,1 px
 *   narrow 360 × 690, up to 460 px wide → at 300 px scale 0,83: Caveat 21 → 17,5 px, mono 15 → 12,5 px
 * The drawing is NOT to scale: every hop is drawn, the real milliseconds live on the stopwatch and in the waterfall.
 * Trays move along these polylines at one constant speed (SPEED viewBox units per second).
 */
import type { Pt } from '../../kit'
import type { RouteId, Scenario, Seg, Spot, Trace } from './model'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface StageGeo {
  name: 'wide' | 'narrow'
  vb: [number, number]
  font: { hand: number; mono: number; name: number; title: number }
  tray: number
  petra: { x: number; y: number; s: number }
  client: Pt
  petraLabel: Pt
  petraIp: Pt
  loopOut: Pt[]
  loopBack: Pt[]
  loopLabel: { x: number; y: number; anchor: 'start' | 'middle' | 'end'; lines: string[] }
  book: Box
  bookLabel: Pt
  bookIp: Pt
  bookAnchor: 'start' | 'middle' | 'end'
  resolver: Pt
  cloud: Box
  net: Pt
  netLabel: Pt
  lost: Pt
  old: Box
  oldPt: Pt
  host: Box
  wall: 'left' | 'top'
  /** firewall strip: from → to along the wall */
  wallFrom: number
  wallTo: number
  wallAt: number
  fw443: Pt
  door443: Pt
  fw8000: Pt
  door8000: Pt
  port443Label: Pt
  port8000Label: Pt
  portAnchor: 'start' | 'end'
  fwLabel: Pt
  fwAnchor: 'start' | 'middle' | 'end'
  title: Pt
  /** the flat's title in the laptop scenario (it has no mono line) */
  titleLaptop: Pt
  titleMono: Pt
  proxy: Box
  proxyIn: Pt
  proxyOut: Pt
  proxyCorner: Pt
  loLabel: { x: number; y: number; anchor: 'start' | 'middle' | 'end' }
  app: Box
  appIn: Pt
  appTop: Pt
  appBottom: Pt
  appFace: Pt
  sshLaptop: Box
  sshLabel: Pt
  sshOut: Pt[]
  // laptop scenario (Lana's flat behind a home router)
  router: Box
  routerLabel: { x: number; y: number; anchor: 'start' | 'middle' | 'end' }
  laptop: { x: number; y: number; w: number }
  laptopLabel: Pt
  laptopIp: Pt
  laptopBind: Pt
  lana: { x: number; y: number; s: number }
  lanaLoopOut: Pt[]
  lanaLoopBack: Pt[]
  lanaLoopLabel: Pt
}

export const WIDE: StageGeo = {
  name: 'wide',
  vb: [760, 440],
  font: { hand: 21, mono: 15, name: 17, title: 18 },
  tray: 40,
  petra: { x: 16, y: 160, s: 1 },
  client: [106, 238],
  petraLabel: [56, 304],
  petraIp: [62, 326],
  loopOut: [
    [106, 238],
    [146, 212],
    [158, 170],
  ],
  loopBack: [
    [158, 170],
    [130, 140],
    [104, 158],
    [100, 224],
  ],
  loopLabel: { x: 162, y: 140, anchor: 'start', lines: ['127.0.0.1 = ovaj mobitel'] },
  book: { x: 258, y: 14, w: 154, h: 86 },
  bookLabel: [248, 44],
  bookIp: [248, 66],
  bookAnchor: 'end',
  resolver: [335, 100],
  cloud: { x: 250, y: 200, w: 170, h: 104 },
  net: [335, 246],
  netLabel: [335, 287],
  lost: [384, 246],
  old: { x: 262, y: 340, w: 146, h: 70 },
  oldPt: [335, 340],
  host: { x: 452, y: 24, w: 296, h: 402 },
  wall: 'left',
  wallFrom: 118,
  wallTo: 420,
  wallAt: 452,
  fw443: [436, 190],
  door443: [470, 190],
  fw8000: [436, 300],
  door8000: [470, 300],
  portAnchor: 'start',
  port443Label: [472, 174],
  port8000Label: [472, 284],
  fwLabel: [442, 116],
  fwAnchor: 'end',
  title: [470, 56],
  titleLaptop: [470, 56],
  titleMono: [470, 80],
  proxy: { x: 514, y: 160, w: 112, h: 66 },
  proxyIn: [514, 190],
  proxyOut: [626, 193],
  proxyCorner: [668, 193],
  loLabel: { x: 632, y: 184, anchor: 'start' },
  app: { x: 586, y: 262, w: 152, h: 86 },
  appIn: [586, 300],
  appTop: [668, 262],
  appBottom: [650, 348],
  appFace: [716, 288],
  sshLaptop: { x: 474, y: 372, w: 58, h: 38 },
  sshLabel: [474, 362],
  sshOut: [
    [532, 392],
    [650, 392],
    [650, 348],
  ],
  router: { x: 416, y: 300, w: 72, h: 40 },
  routerLabel: { x: 466, y: 404, anchor: 'start' },
  laptop: { x: 548, y: 196, w: 120 },
  laptopLabel: [608, 304],
  laptopIp: [608, 326],
  laptopBind: [608, 348],
  lana: { x: 676, y: 180, s: 0.85 },
  lanaLoopOut: [
    [586, 196],
    [572, 152],
    [608, 132],
  ],
  lanaLoopBack: [
    [608, 132],
    [644, 152],
    [630, 196],
  ],
  lanaLoopLabel: [608, 118],
}

export const NARROW: StageGeo = {
  name: 'narrow',
  vb: [360, 690],
  font: { hand: 21, mono: 15, name: 17, title: 17 },
  tray: 36,
  petra: { x: 8, y: 20, s: 0.9 },
  client: [94, 90],
  petraLabel: [44, 154],
  petraIp: [62, 176],
  loopOut: [
    [94, 90],
    [128, 72],
    [138, 34],
  ],
  loopBack: [
    [138, 34],
    [110, 8],
    [90, 28],
    [88, 80],
  ],
  loopLabel: { x: 148, y: 18, anchor: 'start', lines: ['127.0.0.1 =', 'ovaj mobitel'] },
  book: { x: 194, y: 40, w: 158, h: 84 },
  bookLabel: [273, 150],
  bookIp: [273, 172],
  bookAnchor: 'middle',
  resolver: [194, 86],
  cloud: { x: 96, y: 196, w: 170, h: 96 },
  net: [181, 240],
  netLabel: [181, 280],
  lost: [226, 240],
  old: { x: 8, y: 300, w: 124, h: 62 },
  oldPt: [70, 300],
  host: { x: 8, y: 384, w: 344, h: 298 },
  wall: 'top',
  wallFrom: 16,
  wallTo: 344,
  wallAt: 384,
  fw443: [110, 368],
  door443: [110, 402],
  fw8000: [250, 368],
  door8000: [250, 402],
  portAnchor: 'start',
  port443Label: [128, 424],
  port8000Label: [268, 424],
  fwLabel: [300, 358],
  fwAnchor: 'middle',
  title: [24, 640],
  titleMono: [24, 664],
  titleLaptop: [24, 664],
  proxy: { x: 50, y: 440, w: 120, h: 64 },
  proxyIn: [110, 440],
  proxyOut: [170, 472],
  proxyCorner: [268, 472],
  loLabel: { x: 176, y: 464, anchor: 'start' },
  app: { x: 184, y: 520, w: 160, h: 86 },
  appIn: [250, 520],
  appTop: [268, 520],
  appBottom: [184, 572],
  appFace: [322, 546],
  sshLaptop: { x: 24, y: 552, w: 58, h: 38 },
  sshLabel: [24, 542],
  sshOut: [
    [82, 572],
    [184, 572],
  ],
  router: { x: 146, y: 368, w: 68, h: 38 },
  routerLabel: { x: 222, y: 410, anchor: 'start' },
  laptop: { x: 60, y: 474, w: 120 },
  laptopLabel: [120, 582],
  laptopIp: [120, 604],
  laptopBind: [180, 630],
  lana: { x: 228, y: 454, s: 0.85 },
  lanaLoopOut: [
    [90, 474],
    [80, 444],
    [120, 430],
  ],
  lanaLoopBack: [
    [120, 430],
    [160, 444],
    [150, 474],
  ],
  lanaLoopLabel: [120, 454],
}

/** the wide route layout from this container width up: 760 × 12 / 15 (mono) and 760 × 17 / 21 (Caveat) ⇒ 615 px */
export const WIDE_MIN = 615

/** constant tray speed on the drawing, viewBox units per second (at 1×) */
export const SPEED = 420

const rev = (p: Pt[]): Pt[] => [...p].reverse()

/** The polyline a tray follows for a route, in a scenario and layout. */
export function routePath(route: RouteId, scenario: Scenario, g: StageGeo): Pt[] {
  const toProxy: Pt[] = [g.client, g.net, g.fw443, g.door443, g.proxyIn]
  const toDoor8000: Pt[] = [g.client, g.net, g.fw8000, g.door8000]
  const toApp: Pt[] = [...toDoor8000, g.appIn]
  const proxyApp: Pt[] = [g.proxyOut, g.proxyCorner, g.appTop]
  const lanaOut: Pt[] = scenario === 'laptop' ? [...g.lanaLoopOut, ...g.lanaLoopBack.slice(1)] : g.sshOut
  switch (route) {
    case 'dns-out':
      return [g.client, g.resolver]
    case 'dns-back':
      return [g.resolver, g.client]
    case 'to-proxy':
      return toProxy
    case 'from-proxy':
      return rev(toProxy)
    case 'to-door8000':
      return toDoor8000
    case 'from-door8000':
      return rev(toDoor8000)
    case 'to-app':
      return toApp
    case 'from-app':
      return rev(toApp)
    case 'to-fw443':
      return [g.client, g.net, g.fw443]
    case 'to-fw8000':
      return [g.client, g.net, g.fw8000]
    case 'to-old':
      return [g.client, g.net, g.oldPt]
    case 'to-private':
      return [g.client, g.net, g.lost]
    case 'proxy-app':
      return proxyApp
    case 'app-proxy':
      return rev(proxyApp)
    case 'petra-loop-out':
      return g.loopOut
    case 'petra-loop-back':
      return g.loopBack
    case 'lana-out':
      return lanaOut
    case 'lana-back':
      return rev(lanaOut)
  }
}

/** Where the hollow clock of a timeout and its "istek vremena" note are drawn (beside the stop point, clear of labels). */
export function clockPlace(spot: Spot, g: StageGeo): { clock: Pt; label: Pt; anchor: 'start' | 'middle' | 'end' } {
  const wide = g.name === 'wide'
  switch (spot) {
    case 'net':
      return wide ? { clock: [384, 206], label: [384, 180], anchor: 'middle' } : { clock: [290, 218], label: [352, 192], anchor: 'end' }
    case 'old':
      return wide ? { clock: [234, 374], label: [246, 418], anchor: 'end' } : { clock: [160, 330], label: [184, 330], anchor: 'start' }
    case 'fw443':
      return wide ? { clock: [412, 152], label: [390, 176], anchor: 'end' } : { clock: [64, 338], label: [64, 310], anchor: 'middle' }
    default:
      return wide ? { clock: [410, 336], label: [436, 312], anchor: 'end' } : { clock: [204, 338], label: [186, 312], anchor: 'end' }
  }
}

/** Where a failure glyph (or a waiting tray without a route) sits. */
export function spotPoint(spot: Spot, scenario: Scenario, g: StageGeo): Pt {
  switch (spot) {
    case 'client':
      return g.client
    case 'resolver':
      return g.resolver
    case 'net':
      return g.lost
    case 'old':
      return g.oldPt
    case 'fw443':
      return g.fw443
    case 'fw8000':
      return g.fw8000
    case 'door8000':
      return g.door8000
    case 'proxy':
      return g.proxyIn
    case 'app':
      return scenario === 'proxy' ? g.appTop : scenario === 'vps' ? g.appIn : [g.laptop.x + g.laptop.w / 2, g.laptop.y + 30]
    case 'lana':
      return scenario === 'laptop' ? g.lanaLoopOut[0] : g.sshOut[0]
    case 'petra-loop':
      return g.loopOut[g.loopOut.length - 1]
  }
}

export function pathLength(p: Pt[]): number {
  let l = 0
  for (let i = 1; i < p.length; i++) l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])
  return l
}

/** Seconds (at 1×) a segment takes on the drawing: travel at constant speed, fixed pauses for waiting and work. */
export function segSeconds(seg: Seg, scenario: Scenario, g: StageGeo): number {
  if (seg.route) return Math.max(0.3, pathLength(routePath(seg.route, scenario, g)) / SPEED)
  if (seg.kind === 'wait') return 2.8
  if (seg.kind === 'app') return 0.8
  return 0.7
}

/** Where the tray is drawn during segment i at progress frac (0..1). Stationary segments keep the last position. */
export function trayPoint(trace: Trace, i: number, frac: number, g: StageGeo, pointAt: (p: Pt[], t: number) => Pt): Pt {
  const sc = trace.params.scenario
  const seg = trace.segs[i]
  if (seg?.route) return pointAt(routePath(seg.route, sc, g), frac)
  for (let k = i - 1; k >= 0; k--) {
    const prev = trace.segs[k]
    if (prev.route) {
      const p = routePath(prev.route, sc, g)
      return p[p.length - 1]
    }
  }
  return seg?.at ? spotPoint(seg.at, sc, g) : g.client
}

/* ---------- playback: a playhead over the segments, layout-independent (segment index + fraction) ---------- */

export interface Playhead {
  seg: number
  frac: number
  done: boolean
}

/** Advance the playhead by dt seconds (already multiplied by the sim speed). Calls onEnd(i) when segment i ends. */
export function advance(p: Playhead, trace: Trace, dt: number, secondsOf: (s: Seg) => number, onEnd: (i: number) => void): void {
  let left = dt
  let guard = 0
  while (!p.done && left > 0 && guard++ < 64) {
    const seg = trace.segs[p.seg]
    if (!seg) {
      p.done = true
      break
    }
    const dur = Math.max(0.05, secondsOf(seg))
    const need = (1 - p.frac) * dur
    if (left < need) {
      p.frac += left / dur
      left = 0
    } else {
      left -= need
      p.frac = 1
      onEnd(p.seg)
      if (p.seg >= trace.segs.length - 1) p.done = true
      else {
        p.seg++
        p.frac = 0
      }
    }
  }
}

/** Total drawing time of segments [from, to) in seconds. */
export function rangeSeconds(trace: Trace, from: number, to: number, g: StageGeo): number {
  let s = 0
  for (let i = from; i < to; i++) s += segSeconds(trace.segs[i], trace.params.scenario, g)
  return s
}

/** Segment index + fraction after `t` seconds of playing segments [from, to). */
export function playheadAt(trace: Trace, from: number, to: number, t: number, g: StageGeo): Playhead {
  let left = t
  for (let i = from; i < to; i++) {
    const d = segSeconds(trace.segs[i], trace.params.scenario, g)
    if (left < d - 1e-6) return { seg: i, frac: left / d, done: false }
    left -= d
  }
  return { seg: Math.max(from, to - 1), frac: 1, done: true }
}
