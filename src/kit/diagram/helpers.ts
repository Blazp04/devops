import { createContext, useContext, useId } from 'react'

/**
 * Tones of the diagram vocabulary. They are kept from the first version of the kit and mapped onto the notebook's
 * pencil case (src/design-lab/biljeznica/README.md): neutral = graphite, blue = blue ballpoint (links, routes,
 * interaction), ok = green, warn = orange pencil, bad = red pencil, idle = faint graphite; the rest are coloured pencils.
 */
export type DiagramTone = 'neutral' | 'blue' | 'violet' | 'teal' | 'amber' | 'rose' | 'green' | 'cyan' | 'orange' | 'ok' | 'warn' | 'bad' | 'idle'

export const DIAGRAM_TONES: DiagramTone[] = ['neutral', 'blue', 'violet', 'teal', 'amber', 'rose', 'green', 'cyan', 'orange', 'ok', 'warn', 'bad', 'idle']

/** Pencil colour of a tone: outlines, lines, handwriting. Every value is ≥ 4.5:1 on paper and on the chalkboard. */
export function strokeOf(tone: DiagramTone): string {
  switch (tone) {
    case 'neutral':
      return 'var(--ink-3)'
    case 'idle':
      return 'var(--ink-4)'
    case 'blue':
      return 'var(--pen)'
    case 'ok':
      return 'var(--green)'
    case 'warn':
      return 'var(--orange)'
    case 'bad':
      return 'var(--red)'
    default:
      return `var(--${tone})`
  }
}

/** A very light wash of the tone (paper behind a box). */
export function fillOf(tone: DiagramTone): string {
  if (tone === 'neutral') return 'var(--paper)'
  if (tone === 'idle') return 'var(--paper-2)'
  return `color-mix(in srgb, ${strokeOf(tone)} 9%, var(--paper))`
}

/** Marker ink of a tone: hatching inside drawings, fuel bars, shirts. */
export function markerOf(tone: DiagramTone): string {
  switch (tone) {
    case 'blue':
    case 'cyan':
      return 'var(--hl-blue-ink)'
    case 'violet':
      return 'var(--hl-lilac-ink)'
    case 'teal':
    case 'green':
    case 'ok':
      return 'var(--hl-green-ink)'
    case 'amber':
      return 'var(--hl-yellow-ink)'
    case 'orange':
    case 'warn':
      return 'var(--hl-orange-ink)'
    case 'rose':
      return 'var(--hl-pink-ink)'
    case 'bad':
      return 'var(--red)'
    case 'idle':
      return 'var(--ink-4)'
    default:
      return 'var(--ink-3)'
  }
}

/**
 * Fill of a request tray. The default ('blue' was the old request colour) is the orange tray of the bible;
 * other tones tint the tray (e.g. green = the answer travelling back, red = an error).
 */
export function trayFillOf(tone: DiagramTone): string {
  switch (tone) {
    case 'blue':
    case 'amber':
    case 'orange':
    case 'neutral':
      return 'var(--tray)'
    case 'idle':
      return 'var(--paper-3)'
    default:
      return `color-mix(in srgb, ${markerOf(tone)} 78%, var(--paper))`
  }
}

export function edgePath(from: [number, number], to: [number, number], curve = 0): string {
  const [x1, y1] = from
  const [x2, y2] = to
  if (!curve) return `M${x1},${y1} L${x2},${y2}`
  const [cx, cy] = curveControl(from, to, curve)
  return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`
}

/** Control point of the quadratic curve Edge draws for a given `curve` (positive/negative bends to one side). */
export function curveControl(from: [number, number], to: [number, number], curve: number): [number, number] {
  const [x1, y1] = from
  const [x2, y2] = to
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  return [mx - (dy / len) * curve, my + (dx / len) * curve]
}

/** Unique id helper for gradients/clipPaths inside lecture diagrams. */
export function useSvgId(prefix = 'k'): string {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
}

/** Keyframe times (0..1) for moving along a polyline at constant speed. */
export function pathTimes(path: [number, number][]): number[] {
  const lens: number[] = []
  let total = 0
  for (let i = 1; i < path.length; i++) {
    const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1])
    lens.push(l)
    total += l
  }
  const out = [0]
  let acc = 0
  for (const l of lens) {
    acc += l
    out.push(total ? acc / total : 1)
  }
  return out
}

/** Point at fraction t (0..1) along a polyline, by length. Useful for pooled request dots driven by a sim. */
export function pointAt(path: [number, number][], t: number): [number, number] {
  if (path.length === 1 || t <= 0) return path[0]
  const times = pathTimes(path)
  for (let i = 1; i < path.length; i++) {
    if (t <= times[i]) {
      const span = times[i] - times[i - 1] || 1
      const f = (t - times[i - 1]) / span
      return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * f, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * f]
    }
  }
  return path[path.length - 1]
}

/** Ids of the shared defs every <Diagram> carries (tray symbol, hatch patterns, hand-drawn arrowheads). */
export interface DiagramIds {
  /** prefix of this diagram's defs */
  id: string
  /** `<use href={ids.tray} …/>`: one request tray (viewBox −10 −7 20 14; set `fill` on the <use> to tint it) */
  tray: string
  /** pencil hatching at −41° (graphite) — `fill={`url(${ids.hatch})`}` */
  hatch: string
  /** pencil hatching at +41° (the "other" version) */
  hatchR: string
  /** red hatching (broken, crashed) */
  hatchRed: string
  /** v1 marker hatching (blue, −41°) and v2 (green, +41°) */
  hatchV1: string
  hatchV2: string
  /** hand-drawn open arrowhead marker for plain <path>/<polyline>: `markerEnd={`url(${ids.arrow('blue')})`}` */
  arrow: (tone?: DiagramTone) => string
}

export function diagramIds(id: string): DiagramIds {
  return {
    id,
    tray: `#${id}-tray`,
    hatch: `#${id}-hatch`,
    hatchR: `#${id}-hatch-r`,
    hatchRed: `#${id}-hatch-red`,
    hatchV1: `#${id}-hatch-v1`,
    hatchV2: `#${id}-hatch-v2`,
    arrow: (tone = 'neutral') => `#${id}-arrow-${tone}`,
  }
}

/** The enclosing <Diagram>'s defs prefix (null outside a Diagram). */
export const DiagramCtx = createContext<string | null>(null)

/**
 * A clickable piece (DNode / PodShape with onClick) registers itself with its <Diagram>, which then becomes
 * role="group" (a role="img" would hide the buttons from screen readers). Returns the unregister function.
 */
export const DiagramClickCtx = createContext<(() => () => void) | null>(null)

/** Keyboard + screen-reader props for an SVG piece that has an onClick: a focusable button that Enter / Space press. */
export function clickableProps(onClick: (() => void) | undefined, label: string | undefined) {
  if (!onClick) return {}
  return {
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': label,
    onClick,
    onKeyDown: (e: { key: string; preventDefault: () => void }) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onClick()
      }
    },
    style: { cursor: 'pointer' },
  }
}

/** Shared defs of the enclosing <Diagram> (null when used in your own <svg>). */
export function useDiagramIds(): DiagramIds | null {
  const id = useContext(DiagramCtx)
  return id ? diagramIds(id) : null
}

/**
 * On-screen pixels per viewBox unit of the enclosing drawing (null = unknown). <Diagram> measures itself and provides
 * it; in your own <svg> wrap the content in <DiagramScale value={renderedWidth / viewBoxWidth}>. Kit lettering that
 * must stay legible (the Pending „z”, the restart badge, the version tape, NodeFrame's spec) grows with 1 / scale so
 * it never drops under 12 px (print) / 17 px (handwriting) on screen.
 */
export const DiagramScaleCtx = createContext<number | null>(null)

/** The enclosing drawing's on-screen scale (px per unit), or null when nobody measured it. */
export function useDiagramScale(): number | null {
  return useContext(DiagramScaleCtx)
}

/**
 * Smallest font size in viewBox units that renders at `px` on screen: `px / scale` when the scale is known,
 * otherwise `px` (a drawing shown at 1:1).
 */
export function minUnits(px: number, scale: number | null): number {
  return scale && scale > 0 ? px / scale : px
}
