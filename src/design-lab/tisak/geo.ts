/** Geometry helpers + shared non-component utilities for the Tisak prototype. */

export interface Pt {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export function polyLength(pts: readonly Pt[]): number {
  let L = 0
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  return L
}

/** Point at fraction p (0..1) of a polyline, by arc length — so motion along it is linear / constant speed. */
export function pointAt(pts: readonly Pt[], p: number): Pt {
  const total = polyLength(pts)
  let d = Math.max(0, Math.min(1, p)) * total
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const seg = Math.hypot(b.x - a.x, b.y - a.y)
    if (d <= seg || i === pts.length - 1) {
      const k = seg === 0 ? 0 : Math.min(1, d / seg)
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
    }
    d -= seg
  }
  return pts[pts.length - 1]
}

export function polyD(pts: readonly Pt[]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
}

/** Croatian number formatting: decimal comma. */
export function hr(n: number, digits = 1): string {
  return n.toFixed(digits).replace('.', ',')
}

/** Deterministic pseudo-random in [-1, 1) from an integer — for stamp rotation / jitter. */
export function jitter(id: number, salt = 0): number {
  const x = Math.sin(id * 12.9898 + salt * 78.233) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

export const THEME_KEY = 'k8s-lekcije:theme'
export type Theme = 'light' | 'dark'

export function initialTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    // storage blocked
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark'
  return 'light'
}

/**
 * A seamless tile of a halftone screen rotated by atan(1/4) ≈ 14° (the classic riso/offset screen angle).
 * A square lattice at that angle repeats every `tile` px, with 17 dots per tile, so the screen has a FIXED
 * frequency (dot pitch = tile / √17 ≈ 5.3 px for a 22 px tile) no matter how big the type it is printed into.
 * `coverage` is the ink area (0..1). Returned as a CSS url() for mask-image (black = ink).
 */
export function screenTile(coverage: number, tile = 22): string {
  const pitch = tile / Math.sqrt(17)
  const r = Math.min(pitch * 0.72, pitch * Math.sqrt(Math.max(0, coverage) / Math.PI))
  const dots: string[] = []
  for (let k = 0; k < 17; k++) {
    const x = (((4 * k) % 17) * tile) / 17
    const y = (k * tile) / 17
    for (const dx of [-tile, 0, tile])
      for (const dy of [-tile, 0, tile]) {
        const cx = x + dx
        const cy = y + dy
        if (cx + r < 0 || cy + r < 0 || cx - r > tile || cy - r > tile) continue
        dots.push(`<circle cx='${cx.toFixed(2)}' cy='${cy.toFixed(2)}' r='${r.toFixed(2)}'/>`)
      }
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${tile}' height='${tile}'>${dots.join('')}</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

/** Advance widths (font-size 100, tracking −0.04em) of Fraunces 900 / opsz 144 numerals, measured in Chrome. */
const ADV: Record<string, number> = {
  '0': 62,
  '1': 41.1,
  '2': 56.8,
  '3': 52.4,
  '4': 58.1,
  '5': 53.2,
  '6': 57.5,
  '7': 52,
  '8': 57,
  '9': 57.5,
  I: 36.6,
  P: 65.4,
  '?': 54.2,
}

export function numeralAdvance(text: string): number {
  return [...text].reduce((a, ch) => a + (ADV[ch] ?? 58), 0)
}
