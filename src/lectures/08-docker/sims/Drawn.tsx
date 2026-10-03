import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Rough } from '../../../kit'

/* Small drawing helpers shared by the lecture's steppers (all in the kit's pen). */

/** Fades a group in when `show` turns on (instant under reduced motion). Hidden groups are not focusable or read. */
export function Fade({ show, children, delay = 0 }: { show: boolean; children: ReactNode; delay?: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.g initial={false} animate={{ opacity: show ? 1 : 0 }} transition={{ duration: reduce ? 0 : 0.4, delay: show && !reduce ? delay : 0 }} style={{ pointerEvents: show ? 'auto' : 'none' }} aria-hidden={show ? undefined : true}>
      {children}
    </motion.g>
  )
}

/** A Dockerfile on graph paper with a yellow name tag: lines in Plex Mono; `hot` lines get the yellow marker. */
export function DockerfileSheet({
  x,
  y,
  w,
  lines,
  size = 13,
  lineH = 22,
  title = 'Dockerfile',
  hot = [],
  seed = 2201,
}: {
  x: number
  y: number
  w: number
  lines: string[]
  size?: number
  lineH?: number
  title?: string
  hot?: number[]
  seed?: number
}) {
  const h = 30 + lines.length * lineH + 8
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} strokeWidth={1.5} fillColor="var(--code-paper, var(--paper-2))" fillStyle="solid" />
      <Rough shape={{ k: 'rect', x: x + 8, y: y - 12, w: Math.min(w - 16, title.length * 10.6 + 22), h: 28 }} seed={seed + 1} strokeWidth={1.1} fillColor="var(--note-yellow)" fillStyle="solid" stroke="var(--ink-2)" />
      <text x={x + 17} y={y + 8} className="k-svg-hand" style={{ fontSize: 23, fill: 'var(--note-ink)' }}>
        {title}
      </text>
      {lines.map((l, i) => {
        const ly = y + 34 + i * lineH
        return (
          <g key={i}>
            {hot.includes(i) && (
              <Rough shape={{ k: 'rect', x: x + 8, y: ly - size, w: Math.min(w - 16, l.length * size * 0.61 + 8), h: size + 6 }} seed={seed + 10 + i} stroke="none" strokeWidth={0} fillColor="var(--hl-yellow)" fillStyle="solid" roughness={1.6} />
            )}
            <text x={x + 12} y={ly} className="k-svg-mono" style={{ fontSize: size, fontWeight: 500 }}>
              {l}
            </text>
          </g>
        )
      })}
    </g>
  )
}

/** A pencil eye (the container looking down through the layers). Centre (x, y). */
export function Eye({ x, y, r = 14, seed = 2301 }: { x: number; y: number; r?: number; seed?: number }) {
  return (
    <g>
      <Rough shape={{ k: 'path', d: `M${x - r * 1.6} ${y} Q${x} ${y - r * 1.25} ${x + r * 1.6} ${y} Q${x} ${y + r * 1.25} ${x - r * 1.6} ${y} Z` }} seed={seed} strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'ellipse', cx: x, cy: y, w: r * 1.1, h: r * 1.1 }} seed={seed + 1} strokeWidth={1.4} fillColor="var(--pen)" fillStyle="solid" />
    </g>
  )
}

/** A small padlock (read-only). Centre (x, y). */
export function Padlock({ x, y, s = 1, seed = 2401 }: { x: number; y: number; s?: number; seed?: number }) {
  return (
    <g>
      <Rough shape={{ k: 'arc', cx: x, cy: y - 3 * s, w: 12 * s, h: 14 * s, start: Math.PI, stop: Math.PI * 2 }} seed={seed} strokeWidth={1.6} />
      <Rough shape={{ k: 'rect', x: x - 8 * s, y: y - 3 * s, w: 16 * s, h: 12 * s }} seed={seed + 1} strokeWidth={1.6} fillColor="var(--hl-yellow-ink)" fillStyle="hachure" hachureGap={3} />
    </g>
  )
}

/** Oznaka brisanja (whiteout): a circle with a slash, in red pencil. Centre (x, y). */
export function Whiteout({ x, y, r = 11, seed = 2501 }: { x: number; y: number; r?: number; seed?: number }) {
  return (
    <g>
      <Rough shape={{ k: 'ellipse', cx: x, cy: y, w: r * 2, h: r * 2 }} seed={seed} strokeWidth={2} stroke="var(--red)" fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'line', x1: x - r * 0.7, y1: y + r * 0.7, x2: x + r * 0.7, y2: y - r * 0.7 }} seed={seed + 1} strokeWidth={2} stroke="var(--red)" />
    </g>
  )
}
