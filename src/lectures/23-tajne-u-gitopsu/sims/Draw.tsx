import type { ReactNode } from 'react'
import { Rough, useWidth } from '../../../kit'
import styles from '../styles.module.css'

/**
 * Small drawing helpers for this lecture's scenes (all lettering through the kit's SVG type classes, all lines
 * through the kit's pen). `Fit` picks the wide or the narrow layout by the container's width.
 */

type Voice = 'hand' | 'mono' | 'display' | 'print'

const CLASS: Record<Voice, string> = { hand: 'k-svg-hand', mono: 'k-svg-mono', display: 'k-svg-display', print: 'k-svg-print' }

export function Txt({
  x,
  y,
  v = 'mono',
  size,
  fill = 'var(--ink)',
  anchor = 'middle',
  weight,
  strike,
  halo,
  children,
}: {
  x: number
  y: number
  v?: Voice
  size: number
  fill?: string
  anchor?: 'start' | 'middle' | 'end'
  weight?: number
  strike?: boolean
  /** paper-coloured outline behind the letters, so a line passing under them stays readable */
  halo?: boolean
  children: ReactNode
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      className={CLASS[v]}
      style={{
        fontSize: size,
        fill,
        fontWeight: weight ?? (v === 'display' ? 700 : v === 'mono' ? 600 : undefined),
        textDecoration: strike ? 'line-through' : undefined,
        ...(halo ? { paintOrder: 'stroke', stroke: 'var(--paper)', strokeWidth: 5, strokeLinejoin: 'round' } : null),
      }}
    >
      {children}
    </text>
  )
}

/** Several lines of text (tspans), centred or anchored like Txt. */
export function Lines({ x, y, lines, gap, ...rest }: { x: number; y: number; lines: string[]; gap: number; v?: Voice; size: number; fill?: string; anchor?: 'start' | 'middle' | 'end'; weight?: number; halo?: boolean }) {
  return (
    <Txt x={x} y={y} {...rest}>
      {lines.map((l, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : gap}>
          {l}
        </tspan>
      ))}
    </Txt>
  )
}

/** A commit = a round bead on the Git string. tone: plain (ink), leak (red, filled), stale (grey, struck), pen (HEAD). */
export function Bead({ x, y, r = 9, tone = 'plain', seed }: { x: number; y: number; r?: number; tone?: 'plain' | 'leak' | 'stale' | 'pen'; seed: number }) {
  const stroke = tone === 'leak' ? 'var(--red)' : tone === 'stale' ? 'var(--ink-3)' : tone === 'pen' ? 'var(--pen)' : 'var(--ink)'
  const fill = tone === 'leak' ? 'var(--red)' : tone === 'pen' ? 'var(--pen)' : 'var(--paper)'
  return (
    <g>
      <Rough shape={{ k: 'ellipse', cx: x, cy: y, w: r * 2.1, h: r * 2.1 }} seed={seed} strokeWidth={1.7} stroke={stroke} fillColor={fill} fillStyle={tone === 'leak' ? 'hachure' : 'solid'} hachureGap={2.4} />
      {tone === 'stale' && <Rough shape={{ k: 'line', x1: x - r - 3, y1: y + r + 3, x2: x + r + 3, y2: y - r - 3 }} seed={seed + 1} stroke="var(--ink-3)" strokeWidth={1.4} />}
    </g>
  )
}

/** A key drawn with the pen (bow + shaft + bits). Centre-left of the bow at (x, y). */
export function KeyGlyph({ x, y, s = 1, stroke = 'var(--ink)', fill = 'var(--paper)', seed }: { x: number; y: number; s?: number; stroke?: string; fill?: string; seed: number }) {
  return (
    <g>
      <Rough shape={{ k: 'ellipse', cx: x + 9 * s, cy: y, w: 18 * s, h: 18 * s }} seed={seed} stroke={stroke} strokeWidth={1.7} fillColor={fill} fillStyle="solid" />
      <Rough shape={{ k: 'ellipse', cx: x + 9 * s, cy: y, w: 6 * s, h: 6 * s }} seed={seed + 1} stroke={stroke} strokeWidth={1.2} />
      <Rough shape={{ k: 'lin', pts: [[x + 18 * s, y], [x + 42 * s, y], [x + 42 * s, y + 7 * s]] }} seed={seed + 2} stroke={stroke} strokeWidth={1.8} roughness={0.6} />
      <Rough shape={{ k: 'line', x1: x + 34 * s, y1: y, x2: x + 34 * s, y2: y + 6 * s }} seed={seed + 3} stroke={stroke} strokeWidth={1.8} roughness={0.6} />
    </g>
  )
}

/** A padlocked box (the „brava”: ciphertext anyone may carry, only the key holder opens). Box (x, y, w, h). */
export function LockedBox({ x, y, w, h, open, seed, stroke = 'var(--ink)' }: { x: number; y: number; w: number; h: number; open?: boolean; seed: number; stroke?: string }) {
  const lx = x + w / 2
  const ly = y + h * 0.48
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} stroke={stroke} strokeWidth={1.8} fillColor="var(--hl-green-ink)" hachureGap={5} fillWeight={0.8} />
      <Rough shape={{ k: 'line', x1: x, y1: y + h * 0.26, x2: x + w, y2: y + h * 0.26 }} seed={seed + 1} stroke={stroke} strokeWidth={1.3} />
      {/* shackle: closed sits on the lock body, open swings up and away */}
      <Rough
        shape={{ k: 'arc', cx: lx + (open ? 7 : 0), cy: ly - (open ? 10 : 2), w: 16, h: 18, start: Math.PI, stop: Math.PI * 2 }}
        seed={seed + 2}
        stroke={stroke}
        strokeWidth={2}
        roughness={0.6}
      />
      <Rough shape={{ k: 'rect', x: lx - 10, y: ly - 2, w: 20, h: 16 }} seed={seed + 3} stroke={stroke} strokeWidth={1.7} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'ellipse', cx: lx, cy: ly + 6, w: 4, h: 4 }} seed={seed + 4} stroke={stroke} strokeWidth={1.2} />
    </g>
  )
}

/** An address card (the „adresa”: a reference to a value kept elsewhere). Card (x, y, w, h) with a pin. */
export function AddressCard({ x, y, w, h, lines, size, seed }: { x: number; y: number; w: number; h: number; lines: string[]; size: number; seed: number }) {
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} strokeWidth={1.6} stroke="var(--pen)" fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'ellipse', cx: x + 12, cy: y + 12, w: 9, h: 9 }} seed={seed + 1} stroke="var(--pen)" strokeWidth={1.3} fillColor="var(--pen)" fillStyle="solid" />
      {lines.map((l, i) => (
        <text key={i} x={x + 24} y={y + 14 + size * 0.36 + i * (size + 6)} className="k-svg-mono" style={{ fontSize: size, fontWeight: 600, fill: 'var(--pen)' }}>
          {l}
        </text>
      ))}
    </g>
  )
}

/** Picks the wide or the narrow drawing by the container width; the narrow one never grows past ~460 px. */
export function Fit({ wideMin, children }: { wideMin: number; children: (wide: boolean) => ReactNode }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const wide = w === null || w >= wideMin
  return (
    <div ref={ref}>
      <div className={wide ? undefined : styles.narrow}>{children(wide)}</div>
    </div>
  )
}
