/**
 * Drawing pieces shared by the lecture's figures (all SVG, all from the kit's pen and doodles):
 * a labelled layer band (hardware, hypervisor, kernel…), an app as a program card (inside a VM) or a food box
 * (a container), a VM frame, the memory.max "belt", a red crack (kernel exploit) and local hatch patterns.
 */
import type { ReactNode } from 'react'
import { FoodBox, MiniFace, Rough, type Pt } from '../../../kit'

type MiniMood = 'calm' | 'busy' | 'panic' | 'dead'

/** Local hatch patterns for crisp, fast fills that change every frame (sim bars); ids are `${id}-…`. */
export function Hatches({ id }: { id: string }) {
  const p = (suffix: string, angle: number, color: string, gap = 5, width = 1.3) => (
    <pattern id={`${id}-${suffix}`} width={gap} height={gap} patternUnits="userSpaceOnUse" patternTransform={`rotate(${angle})`}>
      <line x1={0} y1={0} x2={0} y2={gap} style={{ stroke: color, strokeWidth: width }} />
    </pattern>
  )
  return (
    <defs>
      {p('ink', -41, 'var(--ink-3)', 5, 1.1)}
      {p('pen', 41, 'var(--pen)', 4.5, 1.2)}
      {p('food', -41, 'var(--food)', 3.2, 1.6)}
      {p('green', 41, 'var(--green)', 4, 1.3)}
      {p('red', -41, 'var(--red)', 3.2, 1.5)}
      {p('red2', 41, 'var(--red)', 3.2, 1.5)}
    </defs>
  )
}

/**
 * A layer of the stack drawn as a pencil band (hardware, hypervisor, a kernel…) with a label.
 * `hatch` fills it with the pencil hatching of that colour; `dashed` = a placeholder.
 */
export function Band({
  x,
  y,
  w,
  h,
  label,
  sub,
  size = 15,
  subSize = 13,
  hatch,
  stroke = 'var(--ink)',
  seed = 7100,
  dashed,
  align = 'middle',
  ink = 'var(--ink)',
}: {
  x: number
  y: number
  w: number
  h: number
  label?: ReactNode
  sub?: ReactNode
  size?: number
  subSize?: number
  hatch?: string
  stroke?: string
  seed?: number
  dashed?: boolean
  align?: 'start' | 'middle'
  ink?: string
}) {
  const tx = align === 'middle' ? x + w / 2 : x + 10
  const lineY = sub ? y + h / 2 - 2 : y + h / 2 + size * 0.36
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} stroke={stroke} strokeWidth={1.6} fillColor={hatch} hachureGap={6} fillWeight={0.8} dash={dashed ? '5 4' : undefined} />
      {label && (
        <text x={tx} y={lineY} textAnchor={align} className="k-svg-display k-dhalo" style={{ fontSize: size, fill: ink, fontWeight: 700 }}>
          {label}
        </text>
      )}
      {sub && (
        <text x={tx} y={y + h / 2 + subSize + 1} textAnchor={align} className="k-svg-mono k-dhalo" style={{ fontSize: subSize, fill: 'var(--ink-2)' }}>
          {sub}
        </text>
      )}
    </g>
  )
}

/** A program (a process outside any container): a paper card with its name in mono. */
export function ProgramCard({ x, y, w, h, name, size = 14, seed = 7200, stroke = 'var(--ink)', dashed }: { x: number; y: number; w: number; h: number; name: string; size?: number; seed?: number; stroke?: string; dashed?: boolean }) {
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} stroke={stroke} strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" dash={dashed ? '4 4' : undefined} />
      <Rough shape={{ k: 'line', x1: x + 6, y1: y + h - 8, x2: x + w - 6, y2: y + h - 8 }} seed={seed + 1} stroke="var(--ink-3)" strokeWidth={1} roughness={0.6} />
      <text x={x + w / 2} y={y + h / 2 + size * 0.2} textAnchor="middle" className="k-svg-mono" style={{ fontSize: size, fontWeight: 600 }}>
        {name}
      </text>
    </g>
  )
}

/** A container: the food box from the grammar with the app's name on it. */
export function ContainerBox({ x, y, w, h, name, size = 14, seed = 7300, tint = 'var(--hl-orange-ink)', angle = -41, stroke = 'var(--ink)', dashed }: { x: number; y: number; w: number; h: number; name: string; size?: number; seed?: number; tint?: string; angle?: number; stroke?: string; dashed?: boolean }) {
  return <FoodBox x={x} y={y} w={w} h={h} seed={seed} tint={tint} angle={angle} stroke={stroke} label={name} labelSize={size} dash={dashed ? '4 4' : undefined} />
}

/** A virtual machine: a hard pencil wall (its own computer) with a small „VM” tag in the corner. */
export function VmFrame({ x, y, w, h, label = 'VM', size = 13, seed = 7400, stroke = 'var(--ink)', dashed }: { x: number; y: number; w: number; h: number; label?: string; size?: number; seed?: number; stroke?: string; dashed?: boolean }) {
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} stroke={stroke} strokeWidth={2} dash={dashed ? '6 5' : undefined} multi={!dashed} />
      {label && (
        <text x={x + 6} y={y + size + 2} className="k-svg-mono" style={{ fontSize: size, fill: 'var(--ink-2)', fontWeight: 600 }}>
          {label}
        </text>
      )}
    </g>
  )
}

/** memory.max = a belt around the box: a blue strap (two pen lines, hatched between) with a buckle, at height y. */
export function BeltStrap({ x, y, w, seed = 7500 }: { x: number; y: number; w: number; seed?: number }) {
  return (
    <g aria-hidden="true">
      <Rough shape={{ k: 'rect', x: x - 3, y: y - 2.5, w: w + 6, h: 5 }} seed={seed + 3} stroke="none" fillColor="var(--pen)" hachureGap={2.4} fillWeight={1} roughness={0.4} />
      <Rough shape={{ k: 'line', x1: x - 3, y1: y - 2.5, x2: x + w + 3, y2: y - 2.5 }} seed={seed} stroke="var(--pen)" strokeWidth={1.8} roughness={0.5} />
      <Rough shape={{ k: 'line', x1: x - 3, y1: y + 2.5, x2: x + w + 3, y2: y + 2.5 }} seed={seed + 4} stroke="var(--pen)" strokeWidth={1.8} roughness={0.5} />
      <Rough shape={{ k: 'rect', x: x + w / 2 - 6, y: y - 5, w: 12, h: 10 }} seed={seed + 1} stroke="var(--pen)" strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" roughness={0.6} />
      <Rough shape={{ k: 'line', x1: x + w / 2, y1: y - 4, x2: x + w / 2, y2: y + 4 }} seed={seed + 2} stroke="var(--pen)" strokeWidth={1.4} roughness={0.3} />
    </g>
  )
}

/** A red zig-zag crack through `pts` (a kernel exploit spreading); it draws itself on when it mounts (after `delay` s). */
export function Crack({ pts, seed = 7600, width = 2, delay = 0 }: { pts: Pt[]; seed?: number; width?: number; delay?: number }) {
  const zig: Pt[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[i + 1]
    const len = Math.hypot(x2 - x1, y2 - y1)
    const n = Math.max(2, Math.round(len / 12))
    const nx = -(y2 - y1) / (len || 1)
    const ny = (x2 - x1) / (len || 1)
    for (let k = 0; k < n; k++) {
      const t = k / n
      const off = k === 0 ? 0 : (k % 2 ? 4.5 : -4.5)
      zig.push([x1 + (x2 - x1) * t + nx * off, y1 + (y2 - y1) * t + ny * off])
    }
  }
  zig.push(pts[pts.length - 1])
  return <Rough shape={{ k: 'lin', pts: zig }} seed={seed} stroke="var(--red)" strokeWidth={width} roughness={0.7} multi draw="mount" delay={delay} duration={0.6} />
}

/** The little face in the porthole (calm → busy → panic → dead), as on every server card. */
export function Face({ cx, cy, r = 9, mood, seed = 7700 }: { cx: number; cy: number; r?: number; mood: MiniMood; seed?: number }) {
  return <MiniFace cx={cx} cy={cy} r={r} mood={mood} seed={seed} />
}
