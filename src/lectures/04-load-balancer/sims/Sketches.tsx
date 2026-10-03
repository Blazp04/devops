import { DBar, Rough, ServerFace, SvgStamp } from '../../../kit'
import type { ServerMood } from '../../../kit'

/* Small drawing pieces shared by the lecture's step-by-step explainers (all inside an <svg>). */

/** A server card for explainers: name, size, face in the porthole and an optional CPU bar. Box x, y, w, h. */
export function MiniCard({
  x,
  y,
  w,
  h,
  name,
  spec,
  mood = 'calm',
  down,
  load,
  sub,
  seed = 6000,
  size = 1,
  faded,
}: {
  x: number
  y: number
  w: number
  h: number
  name: string
  spec?: string
  mood?: ServerMood
  down?: boolean
  /** CPU 0..1 – a marker-filled bar; ≥ 0,9 turns red */
  load?: number
  /** a mono line under the bar, e.g. „CPU 100 %” */
  sub?: string
  seed?: number
  /** text scale (1 = name 20, mono 14.5) */
  size?: number
  faded?: boolean
}) {
  const hot = (load ?? 0) >= 0.9
  const r = Math.min(17, h * 0.2) * Math.min(1.2, size)
  // faded = a server that is not part of this step: the drawing goes pale, the lettering stays readable (--ink-3)
  return (
    <g>
      <g opacity={faded ? 0.45 : 1}>
        <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} strokeWidth={1.9} stroke={down ? 'var(--red)' : 'var(--ink)'} fillColor="var(--paper)" fillStyle="solid" />
        <g transform={`translate(${x + w - r - 9} ${y + r + 8})`}>
          <ServerFace mood={down ? 'dead' : mood} r={r} />
        </g>
        {load !== undefined && !down && <DBar x={x + 11} y={y + h - 38 * size} w={w - 22} h={11 * size} value={load} />}
      </g>
      <text x={x + 11} y={y + 25 * size} className="k-svg-display" style={{ fontSize: 20 * size, fill: faded ? 'var(--ink-3)' : undefined }}>
        {name}
      </text>
      {spec && (
        <text x={x + 11} y={y + 44 * size} className="k-svg-mono" style={{ fontSize: 14.5 * size, fill: faded ? 'var(--ink-3)' : 'var(--ink-2)' }}>
          {spec}
        </text>
      )}
      {sub && (
        <text x={x + 11} y={y + h - 10 * size} className="k-svg-mono" style={{ fontSize: 14.5 * size, fill: hot ? 'var(--red)' : 'var(--ink-2)', fontWeight: hot ? 600 : 400 }}>
          {sub}
        </text>
      )}
      {down && <SvgStamp x={x + w / 2} y={y + h * 0.7} text="SRUŠEN" size={16 * size} />}
    </g>
  )
}

/** Handwritten note (Caveat), one or more lines, in a pen colour. */
export function HandNote({ x, y, lines, size = 20, color = 'var(--ink-2)', anchor = 'start' }: { x: number; y: number; lines: string[]; size?: number; color?: string; anchor?: 'start' | 'middle' | 'end' }) {
  return (
    <g>
      {lines.map((l, i) => (
        <text key={i} x={x} y={y + i * size * 1.08} textAnchor={anchor} className="k-svg-hand" style={{ fontSize: size, fill: color }}>
          {l}
        </text>
      ))}
    </g>
  )
}
