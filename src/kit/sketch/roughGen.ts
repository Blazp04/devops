import rough from 'roughjs'
import type { Drawable, Options } from 'roughjs/bin/core'
import { createContext } from 'react'

/**
 * The one "pen" of the notebook. Every hand-drawn line in the course goes through this generator, so the
 * stroke quality is identical everywhere: roughness ≈ 1.1, pen 1.2–2 px, hatching at −41°.
 *
 * Paths are cached by (shape, options, seed) — the same doodle with the same seed is computed once, which keeps
 * re-renders of big drawings cheap and makes every drawing deterministic (no Math.random()).
 */
const gen = rough.generator()

export type Pt = [number, number]

/** Shapes in the drawing's own coordinates (SVG user units). */
export type Shape =
  | { k: 'rect'; x: number; y: number; w: number; h: number }
  | { k: 'ellipse'; cx: number; cy: number; w: number; h: number }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { k: 'path'; d: string }
  /** polyline through points (sharp corners) */
  | { k: 'lin'; pts: Pt[] }
  /** smooth curve through points */
  | { k: 'curve'; pts: Pt[] }
  /** closed polygon */
  | { k: 'poly'; pts: Pt[] }
  /** elliptical arc, angles in radians (0 = east, clockwise) */
  | { k: 'arc'; cx: number; cy: number; w: number; h: number; start: number; stop: number }

export type FillStyle = 'hachure' | 'solid' | 'zigzag' | 'cross-hatch' | 'dots' | 'dashed' | 'zigzag-line'

export interface RoughOpts {
  /** wobble of the line (default 1.1) */
  roughness?: number
  /** how much straight lines bow (default 1) */
  bowing?: number
  /** pen width in user units (default 1.5) */
  strokeWidth?: number
  fill?: boolean
  /** default 'hachure' (pencil hatching) */
  fillStyle?: FillStyle
  /** hatching angle in degrees (default −41; use +41 for the "other" version, e.g. v2) */
  hachureAngle?: number
  /** distance between hatch lines (default 5) */
  hachureGap?: number
  /** width of hatch lines (default 1) */
  fillWeight?: number
  /** draw the outline twice, like a real pen going over it */
  multi?: boolean
}

export interface RoughPath {
  d: string
  kind: 'stroke' | 'hatch' | 'fill'
}

/** Pen defaults (the bible: pen 1.2–2 px, roughness ≈ 1.1, hatching −41°). */
export const PEN_DEFAULTS = { roughness: 1.1, bowing: 1, strokeWidth: 1.5, hachureAngle: -41, hachureGap: 5, fillWeight: 1 } as const

/** Stable 31-bit seed from a string (FNV-1a). Use it to derive seeds from ids: `hashSeed('pod-' + name)`. */
export function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (Math.abs(h) % 2147483646) + 1
}

/** Combine a base seed with extra parts (numbers or strings) into a new deterministic seed. */
export function seedOf(base: number, ...parts: (number | string)[]): number {
  return hashSeed(`${base}|${parts.join('|')}`)
}

const cache = new Map<string, RoughPath[]>()
const CACHE_MAX = 6000

/** Hand-drawn SVG path data for a shape (cached). Mostly used through `<Rough>`. */
export function roughPaths(shape: Shape, o: RoughOpts, seed: number): RoughPath[] {
  const key = `${JSON.stringify(shape)}|${JSON.stringify(o)}|${seed}`
  const hit = cache.get(key)
  if (hit) return hit
  const opts: Options = {
    seed,
    roughness: o.roughness ?? PEN_DEFAULTS.roughness,
    bowing: o.bowing ?? PEN_DEFAULTS.bowing,
    strokeWidth: o.strokeWidth ?? PEN_DEFAULTS.strokeWidth,
    disableMultiStroke: !o.multi,
    disableMultiStrokeFill: true,
    fill: o.fill ? '#000' : undefined,
    fillStyle: o.fillStyle ?? 'hachure',
    hachureAngle: o.hachureAngle ?? PEN_DEFAULTS.hachureAngle,
    hachureGap: o.hachureGap ?? PEN_DEFAULTS.hachureGap,
    fillWeight: o.fillWeight ?? PEN_DEFAULTS.fillWeight,
    preserveVertices: false,
  }
  let dr: Drawable
  switch (shape.k) {
    case 'rect':
      dr = gen.rectangle(shape.x, shape.y, shape.w, shape.h, opts)
      break
    case 'ellipse':
      dr = gen.ellipse(shape.cx, shape.cy, shape.w, shape.h, opts)
      break
    case 'line':
      dr = gen.line(shape.x1, shape.y1, shape.x2, shape.y2, opts)
      break
    case 'path':
      dr = gen.path(shape.d, opts)
      break
    case 'lin':
      dr = gen.linearPath(shape.pts, opts)
      break
    case 'curve':
      dr = gen.curve(shape.pts, opts)
      break
    case 'poly':
      dr = gen.polygon(shape.pts, opts)
      break
    case 'arc':
      dr = gen.arc(shape.cx, shape.cy, shape.w, shape.h, shape.start, shape.stop, false, opts)
      break
  }
  const out: RoughPath[] = dr.sets.map((set) => ({
    d: gen.opsToPath(set, 2),
    kind: set.type === 'path' ? 'stroke' : set.type === 'fillSketch' ? 'hatch' : 'fill',
  }))
  if (cache.size > CACHE_MAX) cache.clear()
  cache.set(key, out)
  return out
}

/** Boil: the same doodle drawn with three seeds, shown in turn (classic hand-drawn "line boil"). */
export const BoilCtx = createContext(0)

/** Colour shorthands (tokens, so both themes follow automatically). */
export const INK = 'var(--ink)'
export const INK_2 = 'var(--ink-2)'
export const INK_3 = 'var(--ink-3)'
export const PEN = 'var(--pen)'
export const RED = 'var(--red)'
export const GREEN = 'var(--green)'
export const PAPER = 'var(--paper)'
