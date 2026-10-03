/**
 * Geometry of the doors drawing (DoorsLab): a VPS or Lana's laptop as one machine with two rows of doors
 * (its public / Wi-Fi address and 127.0.0.1), processes holding doors, and the outside world.
 * wide 760 × 356 from 640 px (scale ≥ 0,84) · narrow 360 × 560/600 up to 460 px (scale ≥ 0,83 at 300 px).
 */
import type { Pt } from '../../kit'
import type { DoorHost, Sender } from './doors'
import type { Box } from './geometry'

type Anchor = 'start' | 'middle' | 'end'

export interface DoorsGeo {
  vb: [number, number]
  font: { hand: number; mono: number; name: number }
  tray: number
  petraOut: { x: number; y: number; s: number }
  /** "Petra · mobilni podatci" under the outside Petra (only where there is room) */
  petraOutLabel?: Pt
  petraWifi?: { x: number; y: number; s: number; label: Pt }
  cloud: Box
  cloudLabel: Pt
  flat?: Box
  flatLabel?: Pt
  router?: Box
  routerLabel?: { x: number; y: number; anchor: Anchor }
  frame: Box
  title: Pt
  titleText: string
  wall: { side: 'left' | 'top'; at: number; from: number; to: number; gap: number }
  fwLabel: { x: number; y: number; anchor: Anchor }
  rowPub: { y: number; x0: number; label: Pt; note: Pt; noteText: string; ip: string }
  rowLo: { y: number; x0: number; label: Pt; note: Pt }
  doorX: [number, number]
  door: { w: number; h: number }
  procY: number
  procH: number
  clashY: number
  clashLabel: Pt
  lanaLaptop: Box
  lanaLabel: Pt
  lanaText: string
  routes: Partial<Record<Sender, Pt[]>>
  clock: Record<'fence' | 'lost', { at: Pt; label: Pt; anchor: Anchor }>
}

const VPS_WIDE: DoorsGeo = {
  vb: [760, 356],
  font: { hand: 21, mono: 15, name: 17 },
  tray: 38,
  petraOut: { x: 6, y: 110, s: 0.95 },
  petraOutLabel: [8, 250],
  cloud: { x: 120, y: 92, w: 170, h: 100 },
  cloudLabel: [205, 180],
  frame: { x: 330, y: 14, w: 424, h: 334 },
  title: [350, 44],
  titleText: 'VPS · jedan stroj, dvije adrese',
  wall: { side: 'left', at: 330, from: 64, to: 342, gap: 124 },
  fwLabel: { x: 290, y: 54, anchor: 'middle' },
  rowPub: { y: 124, x0: 338, label: [350, 94], note: [462, 94], noteText: 'javna adresa', ip: '203.0.113.10' },
  rowLo: { y: 262, x0: 346, label: [350, 232], note: [436, 232] },
  doorX: [540, 662],
  door: { w: 56, h: 40 },
  procY: 174,
  procH: 40,
  clashY: 296,
  clashLabel: [600, 322],
  lanaLaptop: { x: 352, y: 288, w: 56, h: 36 },
  lanaLabel: [414, 314],
  lanaText: 'Lana · ssh',
  routes: {
    outside: [
      [96, 186],
      [205, 142],
      [300, 124],
      [338, 124],
      [634, 124],
    ],
    inside: [
      [408, 300],
      [430, 300],
      [430, 262],
      [634, 262],
    ],
  },
  clock: {
    fence: { at: [306, 176], label: [318, 216], anchor: 'end' },
    lost: { at: [205, 60], label: [205, 30], anchor: 'middle' },
  },
}

const LAPTOP_WIDE: DoorsGeo = {
  ...VPS_WIDE,
  cloud: { x: 100, y: 92, w: 150, h: 100 },
  cloudLabel: [175, 180],
  flat: { x: 262, y: 6, w: 494, h: 346 },
  flatLabel: [272, 340],
  router: { x: 240, y: 106, w: 44, h: 32 },
  routerLabel: { x: 262, y: 82, anchor: 'middle' },
  petraWifi: { x: 274, y: 168, s: 0.75, label: [304, 280] },
  frame: { x: 360, y: 20, w: 390, h: 316 },
  title: [378, 48],
  titleText: 'Lanin laptop · dvije adrese',
  wall: { side: 'left', at: 360, from: 64, to: 330, gap: 124 },
  fwLabel: { x: 374, y: 168, anchor: 'start' },
  rowPub: { y: 124, x0: 368, label: [380, 94], note: [494, 94], noteText: 'privatna adresa', ip: '192.168.1.23' },
  rowLo: { y: 262, x0: 376, label: [380, 232], note: [466, 232] },
  doorX: [572, 682],
  clashLabel: [622, 322],
  lanaLaptop: { x: 380, y: 288, w: 56, h: 36 },
  lanaLabel: [442, 314],
  lanaText: 'Lana',
  routes: {
    outside: [
      [96, 186],
      [175, 142],
      [222, 142],
    ],
    wifi: [
      [338, 228],
      [344, 190],
      [344, 124],
      [368, 124],
      [654, 124],
    ],
    inside: [
      [436, 300],
      [458, 300],
      [458, 262],
      [654, 262],
    ],
  },
  clock: {
    fence: { at: [232, 226], label: [262, 266], anchor: 'end' },
    lost: { at: [175, 60], label: [175, 30], anchor: 'middle' },
  },
}

const VPS_NARROW: DoorsGeo = {
  vb: [360, 560],
  font: { hand: 21, mono: 15, name: 16 },
  tray: 34,
  petraOut: { x: 4, y: 8, s: 0.8 },
  cloud: { x: 100, y: 16, w: 150, h: 88 },
  cloudLabel: [175, 92],
  frame: { x: 8, y: 150, w: 344, h: 400 },
  title: [110, 182],
  titleText: 'VPS · dvije adrese',
  wall: { side: 'top', at: 150, from: 16, to: 344, gap: 60 },
  fwLabel: { x: 24, y: 182, anchor: 'start' },
  rowPub: { y: 262, x0: 60, label: [88, 230], note: [204, 230], noteText: 'javna', ip: '203.0.113.10' },
  rowLo: { y: 382, x0: 24, label: [24, 352], note: [112, 352] },
  doorX: [200, 302],
  door: { w: 54, h: 38 },
  procY: 296,
  procH: 38,
  clashY: 416,
  clashLabel: [240, 440],
  lanaLaptop: { x: 24, y: 470, w: 56, h: 36 },
  lanaLabel: [86, 494],
  lanaText: 'Lana · ssh',
  routes: {
    outside: [
      [80, 72],
      [175, 60],
      [60, 132],
      [60, 150],
      [60, 262],
      [275, 262],
    ],
    inside: [
      [80, 482],
      [120, 482],
      [120, 382],
      [275, 382],
    ],
  },
  clock: {
    fence: { at: [104, 126], label: [128, 132], anchor: 'start' },
    lost: { at: [300, 56], label: [300, 100], anchor: 'middle' },
  },
}

const LAPTOP_NARROW: DoorsGeo = {
  ...VPS_NARROW,
  vb: [360, 600],
  flat: { x: 4, y: 120, w: 352, h: 476 },
  flatLabel: [16, 588],
  router: { x: 38, y: 106, w: 44, h: 28 },
  routerLabel: { x: 90, y: 146, anchor: 'start' },
  petraWifi: { x: 264, y: 128, s: 0.7, label: [292, 234] },
  frame: { x: 14, y: 270, w: 336, h: 290 },
  title: [100, 300],
  titleText: 'Lanin laptop · dvije adrese',
  wall: { side: 'top', at: 270, from: 22, to: 342, gap: 60 },
  fwLabel: { x: 26, y: 300, anchor: 'start' },
  rowPub: { y: 372, x0: 60, label: [88, 340], note: [200, 340], noteText: 'privatna adresa', ip: '192.168.1.23' },
  rowLo: { y: 482, x0: 30, label: [30, 452], note: [118, 452] },
  procY: 404,
  clashY: 512,
  clashLabel: [240, 536],
  lanaLaptop: { x: 30, y: 512, w: 56, h: 34 },
  lanaLabel: [92, 536],
  lanaText: 'Lana',
  routes: {
    outside: [
      [80, 72],
      [175, 60],
      [215, 60],
    ],
    wifi: [
      [308, 185],
      [300, 240],
      [60, 252],
      [60, 270],
      [60, 372],
      [275, 372],
    ],
    inside: [
      [86, 524],
      [110, 524],
      [110, 482],
      [275, 482],
    ],
  },
  clock: {
    fence: { at: [24, 236], label: [30, 210], anchor: 'start' },
    lost: { at: [300, 56], label: [300, 100], anchor: 'middle' },
  },
}

export function doorsGeo(host: DoorHost, narrow: boolean): DoorsGeo {
  if (narrow) return host === 'vps' ? VPS_NARROW : LAPTOP_NARROW
  return host === 'vps' ? VPS_WIDE : LAPTOP_WIDE
}
