import type { ReactNode } from 'react'
import { Cross, K8sGlyph, Rough, type K8sKind } from '../../../kit'
import { FS, polyD, type Box, type Pt } from './stage'

/** A component card drawn in pencil: optional doodle, printed name, handwritten role. `dim` = not in this step yet. */
export function Card({ box, title, role, glyph, dim, off, seed, accent, titleSize = FS.title }: { box: Box; title: string[]; role?: string; glyph?: K8sKind; dim?: boolean; off?: boolean; seed: number; accent?: string; titleSize?: number }) {
  const gx = glyph ? 44 : 10
  // fade the drawing, never the lettering (dim text is --ink-3, still ≥ 4,5:1)
  return (
    <g>
      <g opacity={dim ? 0.28 : 1}>
        <Rough shape={{ k: 'rect', ...box }} seed={seed} stroke={off ? 'var(--red)' : (accent ?? 'var(--ink)')} strokeWidth={accent ? 2 : 1.6} fillColor="var(--paper)" fillStyle="solid" dash={off ? '6 4' : undefined} />
        {glyph && <K8sGlyph kind={glyph} x={box.x + 6} y={box.y + 8} w={32} h={26} />}
      </g>
      <text x={box.x + gx} y={box.y + 26} className="k-svg-display" style={{ fontSize: titleSize, fill: dim ? 'var(--ink-3)' : undefined }}>
        {title.map((t, i) => (
          <tspan key={t} x={box.x + gx} dy={i ? titleSize + 2 : 0}>
            {t}
          </tspan>
        ))}
      </text>
      {role && (
        <text x={box.x + 10} y={box.y + box.h - 12} className="k-svg-hand" style={{ fontSize: FS.hand, fill: dim ? 'var(--ink-3)' : 'var(--ink-2)' }}>
          {role}
        </text>
      )}
      {off && <Cross x={box.x + box.w - 14} y={box.y + 14} size={8} />}
    </g>
  )
}

/** A handwritten note in a drawing (Caveat); several lines allowed (≤ 2 by the style rules). */
export function Hand({ x, y, lines, color = 'var(--ink-2)', anchor = 'start', size = FS.hand }: { x: number; y: number; lines: string[]; color?: string; anchor?: 'start' | 'middle' | 'end'; size?: number }) {
  return (
    <text x={x} y={y} textAnchor={anchor} className="k-svg-hand k-dhalo" style={{ fontSize: size, fill: color }}>
      {lines.map((l, i) => (
        <tspan key={i} x={x} dy={i ? size * 1.05 : 0}>
          {l}
        </tspan>
      ))}
    </text>
  )
}

export function Mono({ x, y, children, color = 'var(--ink)', anchor = 'start', size = FS.mono, weight }: { x: number; y: number; children: ReactNode; color?: string; anchor?: 'start' | 'middle' | 'end'; size?: number; weight?: number }) {
  return (
    <text x={x} y={y} textAnchor={anchor} className="k-svg-mono k-dhalo" style={{ fontSize: size, fill: color, fontWeight: weight }}>
      {children}
    </text>
  )
}

/** A watch line (dashed pen) or a call (solid); `dim` = drawn faint for later steps. */
export function Wire({ pts, dashed, dim, color = 'var(--pen)', seed, width = 1.5 }: { pts: Pt[]; dashed?: boolean; dim?: boolean; color?: string; seed: number; width?: number }) {
  return <Rough shape={{ k: 'lin', pts }} seed={seed} stroke={dim ? 'var(--ink-4)' : color} strokeWidth={width} dash={dashed ? '6 5' : undefined} roughness={0.8} />
}

/** A plain straight path for highlighting the active route (no wobble, under the pen line). */
export function Glow({ pts, color }: { pts: Pt[]; color: string }) {
  return <path d={polyD(pts)} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" opacity={0.22} />
}

/** Four magnets in the corners of a board. */
export function Magnets({ box }: { box: Box }) {
  const r = 5
  const pts: Pt[] = [
    [box.x + 10, box.y + 10],
    [box.x + box.w - 10, box.y + 10],
    [box.x + 10, box.y + box.h - 10],
    [box.x + box.w - 10, box.y + box.h - 10],
  ]
  return (
    <g aria-hidden="true">
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="var(--red)" opacity={0.85} />
      ))}
    </g>
  )
}
