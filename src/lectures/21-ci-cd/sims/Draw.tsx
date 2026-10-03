/**
 * Lecture-local drawings composed from the kit's pen (Rough) – things the illustration grammar does not have yet:
 * a git commit dot, a long-lived key, a short-lived token (a ticket with a kitchen timer), a boom barrier for the
 * human gate and a digest-stamped image card. Same pen, same seeds rule, colours only from tokens.
 */
import { Rough, TrayStack, KitchenTimer, SvgStamp } from '../../../kit'
import type { Pt } from '../../../kit'

/** A commit on a branch: a small pen circle (filled paper so lines behind it stop at the rim). */
export function CommitDot({ x, y, r = 7, stroke = 'var(--ink)', seed = 1, dashed }: { x: number; y: number; r?: number; stroke?: string; seed?: number; dashed?: boolean }) {
  return <Rough shape={{ k: 'ellipse', cx: x, cy: y, w: r * 2, h: r * 2 }} seed={seed} stroke={stroke} strokeWidth={1.7} fillColor="var(--paper)" fillStyle="solid" dash={dashed ? '3 3' : undefined} />
}

/** A long-lived key: bow (ring), shaft and two teeth. (x, y) = centre of the bow; `s` = scale (1 ≈ 64 × 26). */
export function KeyDoodle({ x, y, s = 1, stroke = 'var(--ink)', seed = 2101, tint = 'var(--hl-yellow-ink)' }: { x: number; y: number; s?: number; stroke?: string; seed?: number; tint?: string }) {
  const r = 11 * s
  const x2 = x + r + 46 * s
  return (
    <g>
      <Rough shape={{ k: 'ellipse', cx: x, cy: y, w: r * 2, h: r * 2 }} seed={seed} stroke={stroke} strokeWidth={1.8} fillColor={tint} hachureGap={3} />
      <Rough shape={{ k: 'ellipse', cx: x, cy: y, w: r * 0.8, h: r * 0.8 }} seed={seed + 1} stroke={stroke} strokeWidth={1.3} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'line', x1: x + r, y1: y, x2, y2: y }} seed={seed + 2} stroke={stroke} strokeWidth={2.2} />
      <Rough shape={{ k: 'lin', pts: [[x2 - 4 * s, y], [x2 - 4 * s, y + 9 * s]] }} seed={seed + 3} stroke={stroke} strokeWidth={2} />
      <Rough shape={{ k: 'lin', pts: [[x2 - 14 * s, y], [x2 - 14 * s, y + 7 * s]] }} seed={seed + 4} stroke={stroke} strokeWidth={2} />
    </g>
  )
}

/**
 * A short-lived token: a ticket stub with notched sides and a kitchen timer clipped to it (it runs out by itself).
 * Box (x, y, w, h). `expired` crosses the ticket out in red pencil.
 */
export function TokenTicket({ x, y, w = 74, h = 38, seed = 2201, expired, label = 'token' }: { x: number; y: number; w?: number; h?: number; seed?: number; expired?: boolean; label?: string }) {
  const n = h * 0.22
  const d = `M${x} ${y} L${x + w} ${y} L${x + w} ${y + h / 2 - n} Q${x + w - n} ${y + h / 2} ${x + w} ${y + h / 2 + n} L${x + w} ${y + h} L${x} ${y + h} L${x} ${y + h / 2 + n} Q${x + n} ${y + h / 2} ${x} ${y + h / 2 - n} Z`
  return (
    <g>
      <Rough shape={{ k: 'path', d }} seed={seed} stroke={expired ? 'var(--red)' : 'var(--pen)'} strokeWidth={1.7} fillColor="var(--note-blue)" fillStyle="solid" />
      <Rough shape={{ k: 'line', x1: x + w * 0.68, y1: y + 4, x2: x + w * 0.68, y2: y + h - 4 }} seed={seed + 1} stroke="var(--ink-3)" strokeWidth={1} dash="3 3" />
      <text x={x + w * 0.34} y={y + h / 2 + 5} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 14.5, fontWeight: 600, fill: 'var(--note-ink)' }}>
        {label}
      </text>
      <KitchenTimer cx={x + w + 14} cy={y + 4} r={11} seed={seed + 5} />
      {expired && <Rough shape={{ k: 'line', x1: x - 4, y1: y + h + 3, x2: x + w + 4, y2: y - 3 }} seed={seed + 7} stroke="var(--red)" strokeWidth={2.4} />}
    </g>
  )
}

/**
 * The human gate as a boom barrier: a pivot block and a striped arm of length `len`. Closed, the arm lies across the
 * conveyor (`closedAngle`, radians); open, it is lifted (`openAngle`).
 */
export function Barrier({ px, py, len = 84, closedAngle, openAngle, open, seed = 2301 }: { px: number; py: number; len?: number; closedAngle: number; openAngle: number; open?: boolean; seed?: number }) {
  const ang = open ? openAngle : closedAngle
  const ex = px + Math.cos(ang) * len
  const ey = py + Math.sin(ang) * len
  // the arm: a pen-drawn plank about 10 units wide, red zigzag stripes while it blocks the line, plain pen when lifted
  const nx = -Math.sin(ang) * 5
  const ny = Math.cos(ang) * 5
  const arm: Pt[] = [
    [px + nx, py + ny],
    [ex + nx, ey + ny],
    [ex - nx, ey - ny],
    [px - nx, py - ny],
  ]
  return (
    <g>
      <Rough
        shape={{ k: 'poly', pts: arm }}
        seed={seed + 2}
        stroke={open ? 'var(--pen)' : 'var(--red)'}
        strokeWidth={1.8}
        roughness={0.8}
        fillColor={open ? 'var(--paper)' : 'var(--red)'}
        fillStyle={open ? 'solid' : 'zigzag'}
        hachureGap={5}
      />
      <Rough shape={{ k: 'rect', x: px - 7, y: py - 7, w: 14, h: 14 }} seed={seed} strokeWidth={1.6} fillColor="var(--ink-2)" fillStyle="solid" />
    </g>
  )
}

/**
 * A built image: stacked trays (layers) with its digest written under it and, optionally, a stamp
 * („ISTI DIGEST”, „DRUGI ARTEFAKT”). Box (x, y) top-left, width w.
 */
export function ImageCard({ x, y, w = 120, digest, tags, stamp, stampTone = 'green', seed = 2401, tone = 'var(--ink)' }: { x: number; y: number; w?: number; digest: string; tags?: string; stamp?: string; stampTone?: 'green' | 'red'; seed?: number; tone?: string }) {
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h: 92 }} seed={seed} stroke={tone} strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" />
      <TrayStack x={x + 14} y={y + 8} w={w - 28} h={40} n={3} seed={seed + 3} />
      {tags && (
        <text x={x + w / 2} y={y + 64} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 14.5, fontWeight: 600 }}>
          {tags}
        </text>
      )}
      <text x={x + w / 2} y={y + 82} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 14.5, fill: tone }}>
        {digest}
      </text>
      {stamp && <SvgStamp x={x + w / 2} y={y - 6} text={stamp} tone={stampTone} size={14.5} rotate={-5} />}
    </g>
  )
}
