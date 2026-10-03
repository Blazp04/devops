import { minUnits, useDiagramScale } from '../diagram/helpers'
import { Rough } from '../sketch/Sketch'
import { useSize } from '../sketch/useSize'
import type { Pt, Shape } from '../sketch/roughGen'

/* =====================================================================
   Doodles of the interactive area (owned by the interactive agent):
   small pen glyphs for drawn buttons, and the keyboard deck of Lana's
   laptop (the Terminal). Same pen as everything else: roughjs, fixed seeds.
   ===================================================================== */

/** Pen glyphs for drawn buttons (20 × 20, drawn in currentColor). */
export type PenGlyphKind =
  | 'bolt'
  | 'play'
  | 'pause'
  | 'loop'
  | 'plus'
  | 'minus'
  | 'power'
  | 'snow'
  | 'fix'
  | 'clipboard'
  | 'check'
  | 'cross'
  | 'step'
  | 'skip'
  | 'chev'
  | 'left'
  | 'right'
  | 'hand'

interface Stroke {
  shape: Shape
  fill?: boolean
  w?: number
}

function head(end: Pt, dir: Pt, len = 4.6): Shape {
  const a = Math.atan2(dir[1], dir[0])
  const p1: Pt = [end[0] - len * Math.cos(a - 0.55), end[1] - len * Math.sin(a - 0.55)]
  const p2: Pt = [end[0] - len * Math.cos(a + 0.55), end[1] - len * Math.sin(a + 0.55)]
  return { k: 'lin', pts: [p1, end, p2] }
}

/** ↺ : a circle that stops short, with a head pointing anticlockwise. */
function loopStrokes(): Stroke[] {
  const pts: Pt[] = []
  for (let d = 205; d >= -62; d -= 26) {
    const t = (d * Math.PI) / 180
    pts.push([10 + 6.6 * Math.cos(t), 10.6 + 6.6 * Math.sin(t)])
  }
  const t = (-62 * Math.PI) / 180
  const end = pts[pts.length - 1]
  return [{ shape: { k: 'curve', pts } }, { shape: head(end, [Math.sin(t), -Math.cos(t)]) }]
}

const GLYPHS: Record<PenGlyphKind, Stroke[]> = {
  bolt: [
    {
      shape: {
        k: 'lin',
        pts: [
          [12.5, 1],
          [5, 11],
          [11, 11],
          [7, 19],
        ],
      },
      w: 2,
    },
  ],
  play: [
    {
      shape: {
        k: 'poly',
        pts: [
          [5.5, 3.5],
          [16, 10],
          [5.5, 16.5],
        ],
      },
      fill: true,
    },
  ],
  pause: [
    { shape: { k: 'rect', x: 4.8, y: 3.5, w: 3.4, h: 13 }, fill: true },
    { shape: { k: 'rect', x: 11.8, y: 3.5, w: 3.4, h: 13 }, fill: true },
  ],
  loop: loopStrokes(),
  plus: [{ shape: { k: 'line', x1: 10, y1: 3.5, x2: 10, y2: 16.5 }, w: 2 }, { shape: { k: 'line', x1: 3.5, y1: 10, x2: 16.5, y2: 10 }, w: 2 }],
  minus: [{ shape: { k: 'line', x1: 3.5, y1: 10, x2: 16.5, y2: 10 }, w: 2 }],
  power: [
    { shape: { k: 'arc', cx: 10, cy: 11, w: 14, h: 14, start: -Math.PI * 0.32, stop: Math.PI * 1.32 } },
    { shape: { k: 'line', x1: 10, y1: 1.8, x2: 10, y2: 9.5 }, w: 2 },
  ],
  snow: [
    { shape: { k: 'line', x1: 10, y1: 2.5, x2: 10, y2: 17.5 } },
    { shape: { k: 'line', x1: 3.6, y1: 6.2, x2: 16.4, y2: 13.8 } },
    { shape: { k: 'line', x1: 3.6, y1: 13.8, x2: 16.4, y2: 6.2 } },
  ],
  // a sticking plaster (the prototype's "Popravi")
  fix: [
    { shape: { k: 'rect', x: 2, y: 6.5, w: 16, h: 7.5 } },
    { shape: { k: 'line', x1: 8, y1: 8.6, x2: 8, y2: 11.8 }, w: 1.3 },
    { shape: { k: 'line', x1: 12, y1: 8.6, x2: 12, y2: 11.8 }, w: 1.3 },
  ],
  clipboard: [
    { shape: { k: 'rect', x: 3, y: 4, w: 14, h: 15 } },
    { shape: { k: 'rect', x: 7, y: 1.6, w: 6, h: 4 }, w: 1.3 },
    { shape: { k: 'line', x1: 6, y1: 10.5, x2: 14, y2: 10.5 }, w: 1.1 },
    { shape: { k: 'line', x1: 6, y1: 14.5, x2: 12, y2: 14.5 }, w: 1.1 },
  ],
  check: [
    {
      shape: {
        k: 'lin',
        pts: [
          [3, 10.5],
          [8, 15.5],
          [17.5, 3.5],
        ],
      },
      w: 2.2,
    },
  ],
  cross: [{ shape: { k: 'line', x1: 4, y1: 4, x2: 16, y2: 16 }, w: 2 }, { shape: { k: 'line', x1: 16, y1: 4, x2: 4, y2: 16 }, w: 2 }],
  step: [
    {
      shape: {
        k: 'poly',
        pts: [
          [3.5, 3.5],
          [12.5, 10],
          [3.5, 16.5],
        ],
      },
      fill: true,
    },
    { shape: { k: 'line', x1: 15.5, y1: 3.5, x2: 15.5, y2: 16.5 }, w: 2.2 },
  ],
  skip: [
    {
      shape: {
        k: 'poly',
        pts: [
          [2, 4],
          [10, 10],
          [2, 16],
        ],
      },
      fill: true,
    },
    {
      shape: {
        k: 'poly',
        pts: [
          [10, 4],
          [18, 10],
          [10, 16],
        ],
      },
      fill: true,
    },
  ],
  chev: [
    {
      shape: {
        k: 'lin',
        pts: [
          [4.5, 7.5],
          [10, 13.5],
          [15.5, 7.5],
        ],
      },
      w: 1.9,
    },
  ],
  left: [{ shape: { k: 'line', x1: 17, y1: 10, x2: 3.5, y2: 10.4 }, w: 1.9 }, { shape: head([3.5, 10.4], [-1, 0], 6), w: 1.9 }],
  right: [{ shape: { k: 'line', x1: 3, y1: 10.4, x2: 16.5, y2: 10 }, w: 1.9 }, { shape: head([16.5, 10], [1, 0], 6), w: 1.9 }],
  // a raised hand (manual mode): palm + four fingers
  hand: [
    {
      shape: {
        k: 'curve',
        pts: [
          [5, 10],
          [5, 15],
          [9, 18.5],
          [14, 17.5],
          [15.5, 12],
          [15.5, 7],
        ],
      },
    },
    { shape: { k: 'line', x1: 7, y1: 10.5, x2: 7, y2: 4.5 }, w: 1.4 },
    { shape: { k: 'line', x1: 9.6, y1: 9.5, x2: 9.6, y2: 2.5 }, w: 1.4 },
    { shape: { k: 'line', x1: 12.2, y1: 9.5, x2: 12.2, y2: 3.2 }, w: 1.4 },
    { shape: { k: 'line', x1: 15.5, y1: 9, x2: 15, y2: 5 }, w: 1.4 },
  ],
}

/**
 * A small pen glyph as its own <svg> (20 × 20 units, drawn in currentColor), for drawn buttons:
 *   <PenGlyph kind="bolt" /> Sruši poslužitelj
 */
export function PenGlyph({ kind, size = 18, className, strokeWidth = 1.7 }: { kind: PenGlyphKind; size?: number; className?: string; strokeWidth?: number }) {
  const strokes = GLYPHS[kind]
  return (
    <svg className={`k-glyph${className ? ` ${className}` : ''}`} viewBox="0 0 20 20" width={size} height={size} aria-hidden="true" focusable="false">
      {strokes.map((s, i) => (
        <Rough
          key={i}
          shape={s.shape}
          seed={4100 + i * 13 + kind.length * 7}
          stroke="currentColor"
          strokeWidth={s.w ?? strokeWidth}
          roughness={0.55}
          fillColor={s.fill ? 'currentColor' : undefined}
          fillStyle={s.fill ? 'solid' : undefined}
        />
      ))}
    </svg>
  )
}

/** Key outlines of a laptop deck in perspective, as one path (one roughjs call, cached by size). */
function deckKeys(w: number, h: number): string {
  const rows = h >= 44 ? 3 : 2
  const top = 9
  const bottom = h - 18
  const keys = Math.max(9, Math.round(w / 48))
  let d = ''
  for (let r = 0; r < rows; r++) {
    const y0 = top + ((bottom - top) * r) / rows + 1.5
    const y1 = top + ((bottom - top) * (r + 1)) / rows - 1.5
    // deck edges widen downwards (front view in perspective)
    const lx = (y: number) => w * 0.035 * (1 - y / h) + 6
    const rx = (y: number) => w - lx(y)
    const span0 = rx(y0) - lx(y0)
    const span1 = rx(y1) - lx(y1)
    for (let k = 0; k < keys; k++) {
      const a0 = lx(y0) + (span0 * k) / keys + 2
      const b0 = lx(y0) + (span0 * (k + 1)) / keys - 2
      const a1 = lx(y1) + (span1 * k) / keys + 2
      const b1 = lx(y1) + (span1 * (k + 1)) / keys - 2
      d += `M${a0.toFixed(1)} ${y0.toFixed(1)}L${b0.toFixed(1)} ${y0.toFixed(1)}L${b1.toFixed(1)} ${y1.toFixed(1)}L${a1.toFixed(1)} ${y1.toFixed(1)}Z`
    }
  }
  return d
}

/**
 * The bottom half of Lana's laptop, drawn in pencil: the deck in perspective, a few rows of keys and the touchpad.
 * HTML element that measures its own width; put it right under the screen (see Terminal).
 */
export function LaptopDeck({ className, height = 34 }: { className?: string; height?: number }) {
  const [ref, size] = useSize<HTMLDivElement>()
  const w = size?.w ?? 0
  const h = size?.h ?? 0
  return (
    <div ref={ref} className={`k-deck${className ? ` ${className}` : ''}`} style={{ height }} aria-hidden="true">
      {w > 40 && h > 16 && (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Rough
            shape={{ k: 'path', d: `M${w * 0.035} 2 L${w * 0.965} 2 L${w - 2} ${h - 7} L2 ${h - 7} Z` }}
            seed={951}
            strokeWidth={1.9}
            fillColor="var(--paper-2)"
            fillStyle="solid"
          />
          {/* the front lip */}
          <Rough shape={{ k: 'line', x1: 4, y1: h - 3, x2: w - 4, y2: h - 3 }} seed={954} strokeWidth={1.3} stroke="var(--ink-2)" />
          {h >= 30 ? (
            <Rough shape={{ k: 'path', d: deckKeys(w, h) }} seed={953} strokeWidth={0.9} stroke="var(--ink-3)" roughness={0.7} />
          ) : (
            <Rough shape={{ k: 'line', x1: w * 0.06, y1: 9, x2: w * 0.94, y2: 9 }} seed={955} strokeWidth={1} stroke="var(--ink-3)" dash="3 5" />
          )}
          <Rough
            shape={{ k: 'rect', x: w / 2 - Math.min(64, w * 0.12), y: h >= 30 ? h - 17 : 12, w: Math.min(128, w * 0.24), h: h >= 30 ? 9 : Math.max(4, h - 20) }}
            seed={952}
            strokeWidth={1.2}
            stroke="var(--ink-2)"
          />
        </svg>
      )}
    </div>
  )
}

/**
 * A numbered step note ① ② ③ for inside a drawing (SVG): the step number in Caveat, circled with the pen.
 * Put it next to the thing that changes in that step (bible: "Priča u crtežu"); colour it with `stepColor(i)`
 * (blue → red → green …) so the drawing and the Stepper's card speak the same colour. `r` = its radius in units (the
 * digit is 1,45 × r); inside a Diagram / DiagramScale it grows (up to 1,35 × r) towards a digit of ≥ 17 px on screen.
 */
export function StepBadge({ n, x, y, r = 13, color = 'var(--pen)', seed }: { n: number; x: number; y: number; r?: number; color?: string; seed?: number }) {
  const scale = useDiagramScale()
  const rr = Math.max(r, Math.min(minUnits(11.8, scale), r * 1.35))
  return (
    <g className="k-stepbadge">
      <Rough shape={{ k: 'ellipse', cx: x, cy: y, w: rr * 2.1, h: rr * 1.95 }} seed={seed ?? 4500 + n * 7} stroke={color} strokeWidth={1.8} roughness={0.9} multi />
      <text x={x} y={y + rr * 0.5} textAnchor="middle" className="k-stepbadge__n" style={{ fill: color, fontSize: rr * 1.45 }}>
        {n}
      </text>
    </g>
  )
}
