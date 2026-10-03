/**
 * Nacrt — geometry helpers shared by every drawing (pure functions, no React).
 *   - Route: an orthogonal polyline with constant-speed sampling (requests travel along these "pipes").
 *   - rough*: the red correction pencil (roughjs, always seeded so renders are deterministic).
 *   - cloud(): engineering revision cloud; hex(): Pod outline.
 */
import rough from 'roughjs'
import type { Options } from 'roughjs/bin/core'

export type Pt = readonly [number, number]

export interface Route {
  pts: Pt[]
  cum: number[]
  len: number
  d: string
}

export function route(pts: Pt[]): Route {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  }
  return { pts, cum, len: cum[cum.length - 1], d: polyD(pts) }
}

export function polyD(pts: readonly Pt[]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${round(p[0])},${round(p[1])}`).join(' ')
}

/** Point at distance `dist` (px) along the route — linear, so a dot moves at constant speed. */
export function pointAt(r: Route, dist: number): Pt {
  if (dist <= 0) return r.pts[0]
  if (dist >= r.len) return r.pts[r.pts.length - 1]
  let i = 1
  while (r.cum[i] < dist) i++
  const seg = r.cum[i] - r.cum[i - 1]
  const f = seg ? (dist - r.cum[i - 1]) / seg : 0
  const a = r.pts[i - 1]
  const b = r.pts[i]
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
}

export function round(n: number): number {
  return Math.round(n * 10) / 10
}

/** Small seeded PRNG (mulberry32). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ---------- Red pencil (roughjs) ---------- */

const gen = rough.generator()
const pencil: Options = { roughness: 1.4, bowing: 1.2, strokeWidth: 1.6, disableMultiStroke: false }

function toD(drawable: ReturnType<typeof gen.line>): string {
  return gen
    .toPaths(drawable)
    .map((p) => p.d)
    .join(' ')
}

export function roughLine(x1: number, y1: number, x2: number, y2: number, seed: number, o: Options = {}): string {
  return toD(gen.line(x1, y1, x2, y2, { ...pencil, seed, ...o }))
}

export function roughEllipse(cx: number, cy: number, w: number, h: number, seed: number, o: Options = {}): string {
  return toD(gen.ellipse(cx, cy, w, h, { ...pencil, seed, ...o }))
}

export function roughPath(d: string, seed: number, o: Options = {}): string {
  return toD(gen.path(d, { ...pencil, seed, ...o }))
}

export function roughCheck(x: number, y: number, s: number, seed: number): string {
  return toD(
    gen.linearPath(
      [
        [x, y + s * 0.55],
        [x + s * 0.38, y + s * 0.92],
        [x + s * 1.05, y - s * 0.05],
      ],
      { ...pencil, seed, roughness: 1.1, strokeWidth: 2.2 },
    ),
  )
}

export function roughCross(cx: number, cy: number, s: number, seed: number, o: Options = {}): string {
  return (
    roughLine(cx - s, cy - s, cx + s, cy + s, seed, o) + ' ' + roughLine(cx + s, cy - s, cx - s, cy + s, seed + 7, o)
  )
}

/* ---------- Drafting shapes ---------- */

/** Revision cloud: scalloped outline around a rectangle (bumps bulge outward). */
export function cloud(x: number, y: number, w: number, h: number, bump = 16): string {
  const nx = Math.max(2, Math.round(w / bump))
  const ny = Math.max(2, Math.round(h / bump))
  const sx = w / nx
  const sy = h / ny
  const rx = sx * 0.62
  const ry = sy * 0.62
  let d = `M${round(x)},${round(y)}`
  for (let i = 0; i < nx; i++) d += ` a${round(rx)},${round(rx)} 0 0 1 ${round(sx)},0`
  for (let i = 0; i < ny; i++) d += ` a${round(ry)},${round(ry)} 0 0 1 0,${round(sy)}`
  for (let i = 0; i < nx; i++) d += ` a${round(rx)},${round(rx)} 0 0 1 ${round(-sx)},0`
  for (let i = 0; i < ny; i++) d += ` a${round(ry)},${round(ry)} 0 0 1 0,${round(-sy)}`
  return d + ' Z'
}

/**
 * Revision cloud as a checker draws it by hand: scallops of uneven length and bulge walking around the box
 * (seeded, so it is the same on every render).
 */
export function handCloud(x: number, y: number, w: number, h: number, bump = 18, seed = 3): string {
  const rnd = makeRng(seed)
  const sides: [number, number, number, number][] = [
    [x, y, 1, 0],
    [x + w, y, 0, 1],
    [x + w, y + h, -1, 0],
    [x, y + h, 0, -1],
  ]
  let d = `M${round(x)},${round(y)}`
  sides.forEach(([sx, sy, dx, dy], i) => {
    const len = i % 2 === 0 ? w : h
    let done = 0
    while (done < len - 0.5) {
      let stepLen = bump * (0.62 + rnd() * 0.76)
      if (len - done - stepLen < bump * 0.45) stepLen = len - done
      done += stepLen
      const ex = sx + dx * done
      const ey = sy + dy * done
      const r = stepLen * (0.52 + rnd() * 0.22)
      d += ` A${round(r)},${round(r)} 0 0 1 ${round(ex)},${round(ey)}`
    }
  })
  return d + ' Z'
}

/** Flat-top hexagon (Pod outline). */
export function hex(cx: number, cy: number, r: number): string {
  const pts: Pt[] = []
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return polyD(pts) + ' Z'
}

/** Break line (zig-zag) used where a drawing omits a portion. */
export function breakLine(x1: number, x2: number, y: number, amp = 6): string {
  const mid = (x1 + x2) / 2
  return `M${x1},${y} L${mid - 8},${y} L${mid - 3},${y - amp} L${mid + 3},${y + amp} L${mid + 8},${y} L${x2},${y}`
}

/** Croatian number formatting: decimal comma, thin-space thousands. */
export function hr(n: number, digits = 0): string {
  return n.toLocaleString('hr-HR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** SVG-safe id from React useId(). */
export function safeId(id: string): string {
  return 'n' + id.replace(/[^a-zA-Z0-9_-]/g, '')
}
