/**
 * Layouts of the two flagship stages, picked by the stage's container width (never the window).
 * Lettering: the narrowest container that uses a layout scales its viewBox by ≥ 0,94, so mono text is ≥ 13 units
 * (≥ 12 px on screen), handwriting ≥ 18,5 units (≥ 17 px).
 */

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface VolGeo {
  kind: 'wide' | 'narrow'
  W: number
  H: number
  /** stage container width from which this layout is used */
  minPx: number
  node: (i: number) => Box
  slot: (i: number, j: number) => Box
  slots: number
  pod: (s: Box) => [number, number]
  podSize: number
  /** name line(s): wide = one line beside the Pod, narrow = two lines beside the Pod */
  name: (s: Box) => [number, number]
  splitName: boolean
  status: (s: Box) => [number, number]
  data: (s: Box) => [number, number]
  fridge: { w: number; h: number }
  /** fridge top-left for the node index it hangs on */
  fridgeAt: (i: number) => [number, number]
  /** cable from the fridge to the node frame */
  cable: (i: number, fx: number, fy: number) => [number, number][]
  /** where the fridge's labels go (anchor) */
  labels: (i: number, fx: number, fy: number) => { x: number; y: number; anchor: 'start' | 'end' }
  mono: number
  hand: number
}

const WIDE_COL = (i: number): Box => ({ x: 4 + i * 212, y: 4, w: 206, h: 194 })

export const VOL_WIDE: VolGeo = {
  kind: 'wide',
  W: 640,
  H: 300,
  minPx: 600,
  node: WIDE_COL,
  slot: (i, j) => {
    const c = WIDE_COL(i)
    return { x: c.x + 6, y: c.y + 34 + j * 70, w: 194, h: 66 }
  },
  slots: 2,
  pod: (s) => [s.x + 18, s.y + 26],
  podSize: 30,
  name: (s) => [s.x + 46, s.y + 16],
  splitName: false,
  status: (s) => [s.x + 46, s.y + 36],
  data: (s) => [s.x + 4, s.y + 62],
  fridge: { w: 44, h: 58 },
  fridgeAt: (i) => {
    const c = WIDE_COL(i)
    return [c.x + c.w / 2 - 22, 218]
  },
  cable: (i, fx, fy) => {
    const c = WIDE_COL(i)
    return [
      [fx + 22, fy],
      [fx + 22, c.y + c.h],
    ]
  },
  labels: (i, fx, fy) => (i < 2 ? { x: fx + 56, y: fy + 14, anchor: 'start' } : { x: fx - 12, y: fy + 14, anchor: 'end' }),
  mono: 13,
  hand: 18.5,
}

const NARROW_ROW = (i: number): Box => ({ x: 4, y: 4 + i * 138, w: 314, h: 132 })

export const VOL_NARROW: VolGeo = {
  kind: 'narrow',
  W: 340,
  H: 512,
  minPx: 0,
  node: NARROW_ROW,
  slot: (i, j) => {
    const r = NARROW_ROW(i)
    return { x: r.x + 6 + j * 152, y: r.y + 32, w: 148, h: 96 }
  },
  slots: 2,
  pod: (s) => [s.x + 20, s.y + 24],
  podSize: 34,
  name: (s) => [s.x + 42, s.y + 14],
  splitName: true,
  status: (s) => [s.x + 2, s.y + 62],
  data: (s) => [s.x + 2, s.y + 86],
  fridge: { w: 40, h: 52 },
  fridgeAt: () => [8, 424],
  cable: (i, fx, fy) => {
    const r = NARROW_ROW(i)
    const my = r.y + r.h / 2
    // leaves the fridge from the top, so it never runs through the PVC labels beside it
    return [
      [fx + 20, fy],
      [fx + 20, fy - 7],
      [330, fy - 7],
      [330, my],
      [r.x + r.w, my],
    ]
  },
  labels: (_i, fx, fy) => ({ x: fx + 52, y: fy + 12, anchor: 'start' }),
  mono: 13,
  hand: 18.5,
}

// ---------------------------------------------------------------- part 2 (Deployment vs StatefulSet)

export interface IdGeo {
  kind: 'wide' | 'narrow'
  W: number
  H: number
  minPx: number
  chip: (i: number) => Box
  chipLines: 2 | 3
  deploy: Box
  sts: Box
  rowH: number
  /** first row's top inside a panel */
  rowTop: number
}

export const ID_WIDE: IdGeo = {
  kind: 'wide',
  W: 660,
  H: 360,
  minPx: 620,
  chip: (i) => ({ x: 4 + i * 219, y: 4, w: 213, h: 44 }),
  chipLines: 2,
  deploy: { x: 4, y: 58, w: 322, h: 296 },
  sts: { x: 334, y: 58, w: 322, h: 296 },
  rowH: 58,
  rowTop: 60,
}

export const ID_NARROW: IdGeo = {
  kind: 'narrow',
  W: 340,
  H: 622,
  minPx: 0,
  chip: (i) => ({ x: 4 + i * 112, y: 4, w: 108, h: 62 }),
  chipLines: 3,
  deploy: { x: 4, y: 74, w: 332, h: 296 },
  sts: { x: 4, y: 378, w: 332, h: 240 },
  rowH: 58,
  rowTop: 60,
}
