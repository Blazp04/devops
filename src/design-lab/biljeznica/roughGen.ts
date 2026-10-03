import rough from 'roughjs'
import type { Drawable, Options } from 'roughjs/bin/core'
import { createContext } from 'react'

/** Shared hand-drawn path generator (roughjs). All doodles go through here so the "pen" is consistent. */
const gen = rough.generator()

export type Pt = [number, number]

export type Shape =
  | { k: 'rect'; x: number; y: number; w: number; h: number }
  | { k: 'ellipse'; cx: number; cy: number; w: number; h: number }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { k: 'path'; d: string }
  | { k: 'lin'; pts: Pt[] }
  | { k: 'curve'; pts: Pt[] }
  | { k: 'poly'; pts: Pt[] }
  | { k: 'arc'; cx: number; cy: number; w: number; h: number; start: number; stop: number }

export type FillStyle = 'hachure' | 'solid' | 'zigzag' | 'cross-hatch' | 'dots' | 'dashed' | 'zigzag-line'

export interface RoughOpts {
  roughness?: number
  bowing?: number
  strokeWidth?: number
  fill?: boolean
  fillStyle?: FillStyle
  hachureAngle?: number
  hachureGap?: number
  fillWeight?: number
  /** draw the outline twice, like a real pen going over it */
  multi?: boolean
}

export interface RoughPath {
  d: string
  kind: 'stroke' | 'hatch' | 'fill'
}

export function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (Math.abs(h) % 2147483646) + 1
}

const cache = new Map<string, RoughPath[]>()

export function roughPaths(shape: Shape, o: RoughOpts, seed: number): RoughPath[] {
  const key = `${JSON.stringify(shape)}|${JSON.stringify(o)}|${seed}`
  const hit = cache.get(key)
  if (hit) return hit
  const opts: Options = {
    seed,
    roughness: o.roughness ?? 1.1,
    bowing: o.bowing ?? 1,
    strokeWidth: o.strokeWidth ?? 1.5,
    disableMultiStroke: !o.multi,
    disableMultiStrokeFill: true,
    fill: o.fill ? '#000' : undefined,
    fillStyle: o.fillStyle ?? 'hachure',
    hachureAngle: o.hachureAngle ?? -41,
    hachureGap: o.hachureGap ?? 5,
    fillWeight: o.fillWeight ?? 1,
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
  if (cache.size > 4000) cache.clear()
  cache.set(key, out)
  return out
}

/** Boil: the same doodle drawn with three seeds, shown in turn (classic hand-drawn "line boil"). */
export const BoilCtx = createContext(0)

export const INK = 'var(--ink)'
export const PEN = 'var(--pen)'
export const RED = 'var(--red)'
export const GREEN = 'var(--green)'
