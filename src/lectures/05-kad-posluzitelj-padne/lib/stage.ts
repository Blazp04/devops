/**
 * Geometry of the flagship stage (viewBox units). Two layouts chosen by the stage's own width:
 * wide (760 × 470, used from 650 px: lettering ≥ 12 px) and narrow (380 × 686, phones; never wider than 460 px; on a
 * 390 px phone it is ~320 px wide, so its lettering is one size up: mono 15, handwriting 21).
 */
import type { P } from './rack'

export interface StageGeo {
  W: number
  H: number
  narrow: boolean
  clock: P
  /** where trays leave the students */
  client: P
  /** the redar (load balancer): trays pass through this point */
  lb: P
  lbScale: number
  students: { x: number; y: number; scale: number; dir: 1 | -1; max: number }
  rateLabel: P
  clip: { x: number; y: number; w: number }
  redis: { x: number; y: number; w: number; h: number; label: P; anchor: 'start' | 'middle' }
  davor: { x: number; y: number; scale: number; bubble: { x: number; y: number; w: number; h: number } } | null
  card: { x: number; w: number; h: number }
  cardY: (i: number) => number
  /** door of server i: where trays enter the card */
  door: (i: number) => P
  /** road from the redar to server i */
  road: (i: number) => P[]
}

const CARD_H = 140
const GAP = 10

export function stageGeo(narrow: boolean, n = 3): StageGeo {
  if (!narrow) {
    const top = 14
    const cardY = (i: number) => top + i * (CARD_H + GAP)
    const door = (i: number): P => [396, cardY(i) + 64]
    const lb: P = [262, 222]
    return {
      W: 760,
      H: Math.max(470, top + n * (CARD_H + GAP) + 6),
      narrow,
      clock: [14, 30],
      client: [168, 232],
      lb,
      lbScale: 0.95,
      students: { x: 150, y: 262, scale: 0.46, dir: -1, max: 6 },
      rateLabel: [88, 186],
      clip: { x: 150, y: 298, w: 180 },
      redis: { x: 84, y: 404, w: 60, h: 52, label: [156, 440], anchor: 'start' },
      davor: { x: 6, y: 362, scale: 0.78, bubble: { x: 4, y: 296, w: 132, h: 46 } },
      card: { x: 400, w: 336, h: CARD_H },
      cardY,
      door,
      road: (i) => [lb, [lb[0] + 54, lb[1]], door(i)],
    }
  }
  const top = 236
  const cardY = (i: number) => top + i * (CARD_H + GAP)
  const door = (i: number): P => [18, cardY(i) + 64]
  const lb: P = [196, 118]
  return {
    W: 380,
    H: top + n * (CARD_H + GAP) + 2,
    narrow,
    clock: [8, 24],
    client: [252, 128],
    lb,
    lbScale: 0.84,
    students: { x: 268, y: 168, scale: 0.4, dir: 1, max: 4 },
    rateLabel: [312, 198],
    clip: { x: 4, y: 34, w: 160 },
    redis: { x: 6, y: 168, w: 52, h: 46, label: [64, 186], anchor: 'start' },
    davor: null,
    card: { x: 22, w: 340, h: CARD_H },
    cardY,
    door,
    road: (i) => [lb, [150, 220], [8, 226], [8, door(i)[1]], door(i)],
  }
}

/** Students in the queue for a given traffic (2 at a trickle … max when it is busy). */
export function queueCount(lambda: number, max: number): number {
  return Math.max(2, Math.min(max, Math.round(lambda / 3)))
}
