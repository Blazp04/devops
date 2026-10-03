import { Boil, Rough } from '../sketch/Sketch'
import { Davor, Iva, Lana, Mira, Petra } from './Characters'
import type { Mood } from './types'
import type { CalloutGlyphKind, CastName } from '../text/types'

/* =====================================================================
   Doodles of the text area (callouts, deep dives, checklists, quiz).
   Same pen as everything else: roughjs, 1.2–2 px, fixed seeds, tokens.
   Owned by the text area; re-exported from src/kit/text.
   ===================================================================== */

/** The small drawn glyph of a callout (each its own <svg>, 48 × 48 box; size it with CSS). */
export function CalloutGlyph({ kind, className }: { kind: CalloutGlyphKind; className?: string }) {
  return (
    <svg className={className} viewBox="-4 -6 48 48" aria-hidden="true">
      {kind === 'info' && (
        <g>
          <Rough shape={{ k: 'ellipse', cx: 20, cy: 19, w: 33, h: 32 }} seed={5101} stroke="var(--pen)" strokeWidth={1.8} />
          <Rough shape={{ k: 'ellipse', cx: 20.5, cy: 10.5, w: 4.2, h: 4.2 }} seed={5102} stroke="var(--pen)" fillColor="var(--pen)" fillStyle="solid" strokeWidth={1.2} />
          <Rough shape={{ k: 'line', x1: 20, y1: 16, x2: 20.6, y2: 28 }} seed={5103} stroke="var(--pen)" strokeWidth={2.6} roughness={0.7} />
          <Rough shape={{ k: 'line', x1: 16, y1: 28.5, x2: 24.5, y2: 28 }} seed={5104} stroke="var(--pen)" strokeWidth={1.6} roughness={0.6} />
        </g>
      )}
      {kind === 'tip' && (
        <g>
          <Rough
            shape={{ k: 'path', d: 'M14 25 C 6 19, 8 5, 20 5 C 32 5, 34 19, 26 25 L 25 30 L 15 30 Z' }}
            seed={5111}
            strokeWidth={1.8}
            fillColor="var(--hl-yellow-ink)"
            hachureGap={3}
          />
          <Rough shape={{ k: 'line', x1: 15.5, y1: 33, x2: 24.5, y2: 33 }} seed={5112} strokeWidth={1.6} />
          <Rough shape={{ k: 'line', x1: 17, y1: 36.5, x2: 23, y2: 36.5 }} seed={5113} strokeWidth={1.6} />
          <Rough shape={{ k: 'line', x1: 4, y1: 4, x2: 0, y2: 0 }} seed={5114} strokeWidth={1.6} stroke="var(--orange)" />
          <Rough shape={{ k: 'line', x1: 36, y1: 4, x2: 40, y2: 0 }} seed={5115} strokeWidth={1.6} stroke="var(--orange)" />
          <Rough shape={{ k: 'line', x1: 1, y1: 15, x2: -4, y2: 15 }} seed={5116} strokeWidth={1.6} stroke="var(--orange)" />
          <Rough shape={{ k: 'line', x1: 39, y1: 15, x2: 44, y2: 15 }} seed={5117} strokeWidth={1.6} stroke="var(--orange)" />
          <Rough shape={{ k: 'line', x1: 20, y1: -1, x2: 20, y2: -5 }} seed={5118} strokeWidth={1.6} stroke="var(--orange)" />
        </g>
      )}
      {kind === 'warn' && (
        <g>
          <Rough
            shape={{
              k: 'poly',
              pts: [
                [20, 2],
                [38, 35],
                [2, 35],
              ],
            }}
            seed={5121}
            stroke="var(--orange)"
            strokeWidth={2}
            fillColor="var(--hl-orange-ink)"
            hachureGap={3.4}
          />
          <Rough shape={{ k: 'line', x1: 20, y1: 12, x2: 20.6, y2: 24 }} seed={5122} strokeWidth={3} roughness={0.6} />
          <Rough shape={{ k: 'ellipse', cx: 20.6, cy: 29.5, w: 4, h: 4 }} seed={5123} fillColor="var(--ink)" fillStyle="solid" strokeWidth={1.2} />
        </g>
      )}
      {kind === 'danger' && (
        <g>
          <Rough shape={{ k: 'path', d: 'M15 2 L26 2 L21.5 27 Z' }} seed={5131} strokeWidth={2} stroke="var(--red)" fillColor="var(--red)" hachureGap={2.4} />
          <Rough shape={{ k: 'ellipse', cx: 20.5, cy: 34, w: 7, h: 7 }} seed={5132} strokeWidth={2} stroke="var(--red)" fillColor="var(--red)" fillStyle="solid" />
          <Rough shape={{ k: 'line', x1: 3, y1: 8, x2: 9, y2: 14 }} seed={5133} strokeWidth={1.7} stroke="var(--red)" />
          <Rough shape={{ k: 'line', x1: 38, y1: 7, x2: 32, y2: 14 }} seed={5134} strokeWidth={1.7} stroke="var(--red)" />
          <Rough shape={{ k: 'line', x1: 0, y1: 22, x2: 7, y2: 22 }} seed={5135} strokeWidth={1.7} stroke="var(--red)" />
          <Rough shape={{ k: 'line', x1: 41, y1: 21, x2: 34, y2: 22 }} seed={5136} strokeWidth={1.7} stroke="var(--red)" />
        </g>
      )}
      {kind === 'fact' && (
        <g>
          <Rough shape={{ k: 'rect', x: 5, y: 7, w: 30, h: 29 }} seed={5141} strokeWidth={1.7} fillColor="var(--paper)" fillStyle="solid" />
          <Rough shape={{ k: 'rect', x: 5, y: 7, w: 30, h: 8 }} seed={5142} strokeWidth={1.4} stroke="var(--red)" fillColor="var(--red)" hachureGap={2.4} />
          <Rough shape={{ k: 'line', x1: 13, y1: 3, x2: 13, y2: 11 }} seed={5143} strokeWidth={2} />
          <Rough shape={{ k: 'line', x1: 27, y1: 3, x2: 27, y2: 11 }} seed={5144} strokeWidth={2} />
          <text x={20} y={31.5} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 15, fontWeight: 700 }}>
            26
          </text>
        </g>
      )}
    </svg>
  )
}

/** A paper clip (holds an extra page to the notebook: "Za znatiželjne"). Own <svg>, 24 × 60. */
export function Paperclip({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 60" aria-hidden="true">
      <Rough
        shape={{ k: 'path', d: 'M9 44 L9 13 C9 6.5 19 6.5 19 13 L19 49 C19 57.5 4 57.5 4 49 L4 17' }}
        seed={5151}
        stroke="var(--ink-3)"
        strokeWidth={1.9}
        roughness={0.55}
        bowing={0.4}
      />
    </svg>
  )
}

/**
 * One of the story characters as a small standalone drawing (own <svg>, 80 × 120 box): teta Mira next to an
 * analogy, Mira / Davor reacting to a quiz answer. Line boil only on characters (off under reduced motion).
 */
export function CastDoodle({ who, mood = 'smile', boil = true, className, label }: { who: CastName; mood?: Mood; boil?: boolean; className?: string; label?: string }) {
  let figure
  switch (who) {
    case 'mira':
      figure = <Mira mood={mood} />
      break
    case 'lana':
      figure = <Lana mood={mood} />
      break
    case 'davor':
      figure = <Davor mood={mood} />
      break
    case 'petra':
      figure = <Petra mood={mood} />
      break
    case 'iva':
      figure = <Iva mood={mood} />
      break
  }
  return (
    <svg className={className} viewBox="-4 -6 88 128" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'}>
      {boil ? <Boil slow>{figure}</Boil> : figure}
    </svg>
  )
}

/**
 * A pencil checkbox whose tick (green pen) draws itself once, `delay` seconds after it is ticked / scrolled into
 * view. Own <svg>, 24 × 24 box; size it with CSS. Same look as the lecture objectives' boxes.
 */
export function TickBox({
  checked,
  delay = 0,
  seed = 5161,
  color = 'var(--ink-2)',
  tick = 'var(--green)',
  draw = true,
  className,
}: {
  checked?: boolean
  delay?: number
  seed?: number
  color?: string
  tick?: string
  /** true: draw the tick when scrolled into view; 'mount': right away (e.g. a task just completed) */
  draw?: boolean | 'mount'
  className?: string
}) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <Rough shape={{ k: 'rect', x: 2, y: 3, w: 19, h: 18 }} seed={seed} stroke={color} strokeWidth={1.6} roughness={1.2} />
      {checked && (
        <Rough
          shape={{
            k: 'lin',
            pts: [
              [6, 11],
              [11, 17],
              [24, -2],
            ],
          }}
          seed={seed + 1}
          stroke={tick}
          strokeWidth={2.4}
          draw={draw}
          delay={delay}
          duration={0.35}
        />
      )}
    </svg>
  )
}

/** The blue-pen circle around a chosen answer letter (draws itself when it appears). Own <svg>, 40 × 40. */
export function PenCircle({ seed = 5171, className, stroke = 'var(--pen)' }: { seed?: number; className?: string; stroke?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true">
      <Rough shape={{ k: 'ellipse', cx: 20, cy: 20, w: 36, h: 34 }} seed={seed} stroke={stroke} strokeWidth={2.2} multi draw="mount" duration={0.35} />
    </svg>
  )
}
