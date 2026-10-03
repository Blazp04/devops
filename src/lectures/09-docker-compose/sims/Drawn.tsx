import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Rough } from '../../../kit'

/* Small drawing helpers shared by the lecture's steppers (all in the kit's pen). */

/** Fades a group in when `show` turns on (instant under reduced motion). Hidden groups are not read by screen readers. */
export function Fade({ show, children, delay = 0 }: { show: boolean; children: ReactNode; delay?: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.g initial={false} animate={{ opacity: show ? 1 : 0 }} transition={{ duration: reduce ? 0 : 0.4, delay: show && !reduce ? delay : 0 }} style={{ pointerEvents: show ? 'auto' : 'none' }} aria-hidden={show ? undefined : true}>
      {children}
    </motion.g>
  )
}

/** One line on a sheet: text plus optional marker colour / strike-through. */
export interface SheetLine {
  text: string
  /** marker behind the line: yellow (what matters now), pink (wrong), green (right) */
  mark?: 'yellow' | 'pink' | 'green' | 'blue'
  dim?: boolean
}

const MARK: Record<NonNullable<SheetLine['mark']>, string> = { yellow: 'var(--hl-yellow)', pink: 'var(--hl-pink)', green: 'var(--hl-green)', blue: 'var(--hl-blue)' }

/** A sheet of graph paper with a yellow name tag (README.md, compose.yaml…): lines in Plex Mono. */
export function Sheet({ x, y, w, title, lines, size = 13, lineH = 21, seed = 2201, minH }: { x: number; y: number; w: number; title: string; lines: SheetLine[]; size?: number; lineH?: number; seed?: number; minH?: number }) {
  const h = Math.max(minH ?? 0, 30 + lines.length * lineH + 8)
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} strokeWidth={1.5} fillColor="var(--code-paper, var(--paper-2))" fillStyle="solid" />
      <Rough shape={{ k: 'rect', x: x + 8, y: y - 12, w: Math.min(w - 16, title.length * 10.4 + 22), h: 28 }} seed={seed + 1} strokeWidth={1.1} fillColor="var(--note-yellow)" fillStyle="solid" stroke="var(--ink-2)" />
      <text x={x + 17} y={y + 8} className="k-svg-hand" style={{ fontSize: 23, fill: 'var(--note-ink)' }}>
        {title}
      </text>
      {lines.map((l, i) => {
        const ly = y + 36 + i * lineH
        return (
          <g key={i}>
            {l.mark && <rect x={x + 8} y={ly - size} width={Math.min(w - 16, l.text.length * size * 0.61 + 8)} height={size + 6} rx={3} style={{ fill: MARK[l.mark] }} />}
            <text x={x + 12} y={ly} className="k-svg-mono" style={{ whiteSpace: 'pre', fontSize: size, fill: l.dim ? 'var(--ink-3)' : 'var(--ink)' }}>
              {l.text}
            </text>
          </g>
        )
      })}
    </g>
  )
}
