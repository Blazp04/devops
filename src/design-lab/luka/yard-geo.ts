/**
 * Geometry and helpers for the terminal yard drawing (yard.tsx). Pure TS so the .tsx files export components only.
 */
import { span, vbOf, type V3, type VB } from './iso-math'
import { DOCK_H, DOCKS, GATE_X, SOURCE_X, toWorld, type Status } from './sim-model'

export const CARGO: Record<Status, string> = { req: 'var(--yellow)', ok: 'var(--sig-green)', err: 'var(--sig-red)' }
export const CRATE = { len: 0.68, wid: 0.5, hei: 0.4 }
export const PORTAL_H = 1.0
export const PLAZA = { x0: -10.2, x1: SOURCE_X - 0.25, y0: -1.9, y1: 1.9 }

const dockPts = DOCKS.flatMap((g): V3[] => [
  [g.x0, g.y0, DOCK_H + 1.62],
  [g.x1, g.y0, DOCK_H + PORTAL_H + 0.3],
  [g.x0, g.y1, 0],
  [g.x1, g.y1, 0],
  [g.x0, g.y1, DOCK_H + PORTAL_H + 0.3],
])
/** the yard, tight around the docks, the gate and the front of the students' plaza (the road runs in from the frame edge) */
export const YARD_VB: VB = vbOf([...dockPts, [PLAZA.x0 + 1.2, PLAZA.y1, 0], [GATE_X, 0, 4.8]], 6)
/** phone framing: no plaza, the road runs in from the frame edge just before the gate */
export const YARD_VB_COMPACT: VB = vbOf([...dockPts, [GATE_X - 2.2, 0.6, 0], [GATE_X, -0.9, 2.6]], 4)

export const GP = { x: GATE_X - 0.11, h: 2.0, y0: -1.0, y1: 0.8, t: 0.2 }
export const gatePostDepth = (side: 'back' | 'front') => GP.x + (side === 'back' ? GP.y0 : GP.y1)
/** anchor for the algorithm sign above the gate */
export const GATE_SIGN: V3 = [GP.x + 0.1, (GP.y0 + GP.y1) / 2 + 0.1, GP.h + 0.42]
/** label for the students' plaza (on the concrete in front of it) */
export const PLAZA_SIGN: V3 = [-8.3, 2.8, 0]

export const SIG_H = 1.0
export const signalDepth = (i: number) => DOCKS[i].signal[0] + DOCKS[i].signal[1]

export interface DockState {
  up: boolean
  healthy: boolean
  progress: number[]
  sinceCheck: number
  lastCheckOk: boolean
  sinceReject: number
  /** every RAM slot taken (yard full) */
  full?: boolean
}

/** world point for the health beacon of a dock */
export function beaconAt(i: number): V3 {
  const g = DOCKS[i]
  const [x, y] = toWorld(g, g.w / 2 - 0.2, 0.2)
  return [x, y, DOCK_H + 1.5]
}

/** where each dock's name plate hangs (world point) and which way it extends */
export const DOCK_LABEL: { at: V3; align: 'left' | 'right' | 'below' | 'above' }[] = [
  { at: [DOCKS[0].x1, DOCKS[0].y0, DOCK_H + 0.75], align: 'above' },
  { at: [DOCKS[1].x1, DOCKS[1].y1, 0], align: 'below' },
  { at: [DOCKS[2].x0 - 0.15, (DOCKS[2].y0 + DOCKS[2].y1) / 2 + 0.2, 0.2], align: 'above' },
]

/** phone framing: shorter plates (name only), all inside the frame */
export const DOCK_LABEL_COMPACT: { at: V3; align: 'left' | 'right' | 'below' | 'above' }[] = [
  { at: [DOCKS[0].x0, DOCKS[0].y0 + 0.75 * (DOCKS[0].y1 - DOCKS[0].y0), DOCK_H + 0.2], align: 'above' },
  { at: [DOCKS[1].x1, DOCKS[1].y1, 0], align: 'below' },
  { at: [DOCKS[2].x0 - 0.15, (DOCKS[2].y0 + DOCKS[2].y1) / 2 + 0.2, 0.2], align: 'above' },
]

/** boom position 0 (down) … 1 (up) from the health state */
export function boomUp(healthy: boolean, sinceHealth: number): number {
  const k = span(sinceHealth, 0, 0.55)
  return healthy ? k : 1 - k
}

/** pools of light from high-mast floodlights outside the frame (only visible on the night shift) */
export const YARD_POOLS: { x: number; y: number; r: number }[] = [
  { x: GATE_X - 0.4, y: 0, r: 2.2 },
  { x: 0.4, y: 0.2, r: 1.8 },
  { x: DOCKS[0].ex, y: DOCKS[0].ey - 1.6, r: 2.2 },
  { x: DOCKS[1].ex + 1.8, y: 0, r: 2.4 },
  { x: DOCKS[2].ex, y: DOCKS[2].ey + 2.2, r: 2.8 },
]
