/**
 * Luka — isometric math.
 *
 * 2:1 dimetric projection ("pixel-art isometric"): the world x axis runs down-right on screen,
 * the world y axis runs down-left, z is up. One world unit = U SVG units.
 * Depth (painter's order): larger x + y is closer to the viewer.
 */
export const U = 20
/** Vertical scale for a camera at 30° elevation, so cubes look like cubes. */
export const ZK = 1.22

export type V3 = readonly [number, number, number]
export type V2 = readonly [number, number]
export type Dir = 'x+' | 'x-' | 'y+' | 'y-'

const r2 = (n: number) => Math.round(n * 100) / 100

/** World (x, y, z) → screen (sx, sy) in SVG units. */
export function iso(x: number, y: number, z = 0): [number, number] {
  return [(x - y) * U, ((x + y) / 2 - z * ZK) * U]
}

/** Polygon/polyline "points" attribute for a list of world points. */
export function pts(list: readonly V3[]): string {
  return list
    .map(([x, y, z]) => {
      const [sx, sy] = iso(x, y, z)
      return `${r2(sx)},${r2(sy)}`
    })
    .join(' ')
}

/** SVG path "d" for line segments between world points (each pair = one segment). */
export function segs(pairs: readonly (readonly [V3, V3])[]): string {
  return pairs
    .map(([a, b]) => {
      const [ax, ay] = iso(...a)
      const [bx, by] = iso(...b)
      return `M${r2(ax)} ${r2(ay)}L${r2(bx)} ${r2(by)}`
    })
    .join('')
}

/**
 * Transform that maps flat 2D text onto a box face. The text origin lands on world point (x, y, z).
 * left  = face whose normal is +y (front-left), text runs along +x
 * right = face whose normal is +x (front-right), text runs along −y
 * top   = horizontal face, text runs along +x
 * topY  = horizontal face, text runs along −y (reads left→right on screen, rising)
 */
export function faceMatrix(face: 'left' | 'right' | 'top' | 'topY', x: number, y: number, z: number): string {
  const [sx, sy] = iso(x, y, z)
  switch (face) {
    case 'left':
      return `matrix(1 0.5 0 ${ZK} ${r2(sx)} ${r2(sy)})`
    case 'right':
      return `matrix(1 -0.5 0 ${ZK} ${r2(sx)} ${r2(sy)})`
    case 'top':
      return `matrix(1 0.5 -1 0.5 ${r2(sx)} ${r2(sy)})`
    case 'topY':
      return `matrix(1 -0.5 1 0.5 ${r2(sx)} ${r2(sy)})`
  }
}

/** Polyline helpers for things that travel at constant speed. */
export interface Path {
  pts: V2[]
  /** cumulative length at each point */
  cum: number[]
  length: number
}

export function makePath(points: readonly V2[]): Path {
  const cum = [0]
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]
    const [bx, by] = points[i]
    cum.push(cum[i - 1] + Math.hypot(bx - ax, by - ay))
  }
  return { pts: [...points], cum, length: cum[cum.length - 1] }
}

/** Position and heading at distance d along a path (clamped). */
export function along(p: Path, d: number): { x: number; y: number; dir: Dir } {
  const dd = Math.max(0, Math.min(p.length, d))
  let i = 1
  while (i < p.cum.length - 1 && p.cum[i] < dd) i++
  const [ax, ay] = p.pts[i - 1]
  const [bx, by] = p.pts[i]
  const seg = p.cum[i] - p.cum[i - 1] || 1
  const t = (dd - p.cum[i - 1]) / seg
  const dx = bx - ax
  const dy = by - ay
  const dir: Dir = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'x+' : 'x-') : dy >= 0 ? 'y+' : 'y-'
  return { x: ax + dx * t, y: ay + dy * t, dir }
}

/** viewBox string for a world-space bounding box (with heights) plus padding in SVG units. */
export function viewBoxFor(minX: number, maxX: number, minY: number, maxY: number, maxZ: number, pad = 12): string {
  const corners: V3[] = [
    [minX, minY, 0],
    [maxX, minY, 0],
    [minX, maxY, 0],
    [maxX, maxY, 0],
    [minX, minY, maxZ],
    [maxX, minY, maxZ],
    [minX, maxY, maxZ],
  ]
  const xs = corners.map((c) => iso(...c)[0])
  const ys = corners.map((c) => iso(...c)[1])
  const x0 = Math.min(...xs) - pad
  const y0 = Math.min(...ys) - pad
  return `${r2(x0)} ${r2(y0)} ${r2(Math.max(...xs) - x0 + pad)} ${r2(Math.max(...ys) - y0 + pad)}`
}

/** Linear interpolation and keyframe helpers for looping illustrations. */
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const clamp01 = (t: number) => Math.max(0, Math.min(1, t))
/** 0→1 progress of t inside [a, b]. */
export const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a))

/** viewBox string that fits a list of world points (with padding in SVG units). */
export function viewBoxOf(points: readonly V3[], pad = 12): string {
  const s = points.map((p) => iso(...p))
  const xs = s.map((p) => p[0])
  const ys = s.map((p) => p[1])
  const x0 = Math.min(...xs) - pad
  const y0 = Math.min(...ys) - pad
  return `${r2(x0)} ${r2(y0)} ${r2(Math.max(...xs) - x0 + pad)} ${r2(Math.max(...ys) - y0 + pad)}`
}

/** Numeric viewBox (for HTML overlays positioned in % of the drawing). */
export interface VB {
  x: number
  y: number
  w: number
  h: number
}
export function vbOf(points: readonly V3[], pad = 12, padX = pad): VB {
  const s = points.map((p) => iso(...p))
  const xs = s.map((p) => p[0])
  const ys = s.map((p) => p[1])
  const x0 = Math.min(...xs) - padX
  const y0 = Math.min(...ys) - pad
  return { x: r2(x0), y: r2(y0), w: r2(Math.max(...xs) - x0 + padX), h: r2(Math.max(...ys) - y0 + pad) }
}
export const vbStr = (v: VB) => `${v.x} ${v.y} ${v.w} ${v.h}`
/** Position of a world point inside a viewBox, in percent (for absolutely positioned HTML). */
export function pct(v: VB, p: V3): { left: string; top: string } {
  const [sx, sy] = iso(...p)
  return { left: `${(((sx - v.x) / v.w) * 100).toFixed(3)}%`, top: `${(((sy - v.y) / v.h) * 100).toFixed(3)}%` }
}
