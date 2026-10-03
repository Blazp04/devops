import { useState, type CSSProperties, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Rough } from '../sketch/Sketch'
import { PeekDavor } from './Characters'
import { CoffeeRing } from './Things'
import type { MarkColor, NoteColor, StampTone, TapeColor } from './types'

/* =====================================================================
   Paper things (HTML): marker highlights, washi tape, sticky notes,
   rubber stamps and margin doodles. On the chalkboard tape becomes a
   magnet and sticky notes stay clean above the chalk dust (z-index 5).
   ===================================================================== */

/**
 * Highlighter swipe behind words; it is "drawn" left → right once when it scrolls into view.
 * On paper: a translucent marker over the word. On the chalkboard: coloured chalk, side-stroked under the word.
 * The same marker is used in prose and in code (start it on the token, never at the margin).
 */
export function Mark({ children, c = 'yellow' }: { children: ReactNode; c?: MarkColor }) {
  const [on, setOn] = useState(false)
  return (
    <motion.span className="k-mark" data-c={c} data-on={on ? '' : undefined} onViewportEnter={() => setOn(true)} viewport={{ once: true, margin: '0px 0px -8% 0px' }}>
      {children}
    </motion.span>
  )
}

/**
 * Washi tape (paper) / a round magnet (chalkboard). Absolutely positioned: give it top/left/right and a rotation via
 * `style`, inside a `position: relative` parent. Decorative (aria-hidden).
 */
export function Tape({ style, c = 'red', className }: { style?: CSSProperties; c?: TapeColor; className?: string }) {
  return <span className={`k-tape${className ? ` ${className}` : ''}`} data-c={c} style={style} aria-hidden="true" />
}

type NoteTag = 'div' | 'aside' | 'section' | 'figure' | 'li' | 'p'

/**
 * A sticky note. Always dark "paper" text on a light note, in both themes (on the chalkboard it is pinned above the
 * chalk dust with a magnet). `tape` puts a strip of tape (or magnet) on the top edge; `rotate` tilts it a little.
 */
export function StickyNote({
  children,
  c = 'yellow',
  tape,
  rotate = 0,
  as: Tag = 'div',
  className,
  style,
  ariaLabel,
}: {
  children: ReactNode
  c?: NoteColor
  /** tape colour on the top edge (false/undefined = none) */
  tape?: TapeColor | false
  /** degrees; keep within ±3 */
  rotate?: number
  as?: NoteTag
  className?: string
  style?: CSSProperties
  ariaLabel?: string
}) {
  return (
    <Tag className={`k-note${className ? ` ${className}` : ''}`} data-c={c} aria-label={ariaLabel} style={{ ...style, ...(rotate ? { transform: `rotate(${rotate}deg)` } : null) }}>
      {tape && <Tape c={tape} style={{ top: -13, left: '50%', marginLeft: -44, transform: 'rotate(-3deg)' }} />}
      {children}
    </Tag>
  )
}

/** A rubber stamp (ZAVRŠENO, TOČNO, SRUŠEN…): uppercase, slightly rotated, inked unevenly. Inline element. */
export function Stamp({ children, tone = 'green', rotate = -9, className }: { children: ReactNode; tone?: StampTone; rotate?: number; className?: string }) {
  return (
    <span className={`k-stamp${className ? ` ${className}` : ''}`} data-tone={tone} style={{ transform: `rotate(${rotate}deg)` }}>
      {children}
    </span>
  )
}

/** Margin doodles that live in the gaps between sections (decoration only, absolutely positioned via `style`). */
export function MarginDoodle({ kind, style }: { kind: 'coffee' | 'peek' | 'bang' | 'stars'; style?: CSSProperties }) {
  return (
    <span className="k-margin-doodle" data-kind={kind} style={style} aria-hidden="true">
      {kind === 'coffee' && (
        <svg viewBox="0 0 100 100" width="118" height="118">
          <CoffeeRing />
        </svg>
      )}
      {kind === 'peek' && (
        <svg viewBox="-12 -36 112 50" width="132" height="60">
          <PeekDavor />
        </svg>
      )}
      {kind === 'bang' && (
        <svg viewBox="0 0 60 80" width="48" height="64">
          <Rough shape={{ k: 'path', d: 'M26 6 L36 6 L32 52 Z' }} seed={1931} strokeWidth={2} stroke="var(--red)" fillColor="var(--red)" hachureGap={2.5} />
          <Rough shape={{ k: 'ellipse', cx: 31, cy: 66, w: 10, h: 10 }} seed={1932} strokeWidth={2} stroke="var(--red)" fillColor="var(--red)" fillStyle="solid" />
          <Rough shape={{ k: 'line', x1: 6, y1: 18, x2: 16, y2: 26 }} seed={1933} strokeWidth={1.6} stroke="var(--red)" />
          <Rough shape={{ k: 'line', x1: 54, y1: 16, x2: 44, y2: 26 }} seed={1934} strokeWidth={1.6} stroke="var(--red)" />
        </svg>
      )}
      {kind === 'stars' && (
        <svg viewBox="0 0 90 60" width="90" height="60">
          {[
            [16, 18, 9],
            [52, 12, 6],
            [70, 40, 8],
          ].map(([x, y, r], i) => (
            <g key={i}>
              <Rough shape={{ k: 'line', x1: x - r, y1: y, x2: x + r, y2: y }} seed={1940 + i} strokeWidth={1.6} stroke="var(--pen)" />
              <Rough shape={{ k: 'line', x1: x, y1: y - r, x2: x, y2: y + r }} seed={1944 + i} strokeWidth={1.6} stroke="var(--pen)" />
              <Rough shape={{ k: 'line', x1: x - r * 0.6, y1: y - r * 0.6, x2: x + r * 0.6, y2: y + r * 0.6 }} seed={1948 + i} strokeWidth={1.2} stroke="var(--pen)" />
            </g>
          ))}
        </svg>
      )}
    </span>
  )
}
