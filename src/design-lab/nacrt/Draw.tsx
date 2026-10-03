/**
 * Nacrt — the drafting vocabulary. Every illustration on the page is assembled from these parts,
 * so a request, a server or a Pod always looks the same wherever it appears.
 */
import type { CSSProperties, ReactNode } from 'react'
import { motion } from 'motion/react'
import { hex, polyD, roughCross, type Pt } from './geom'
import { drawVariants, fadeVariants } from './variants'
import s from './nacrt.module.css'

/* ---------- <defs>: hatching, arrowheads, dot symbols ---------- */

export function Defs({ uid }: { uid: string }) {
  return (
    <defs>
      {/* load / usage hatching (graphite or white ink) */}
      <pattern id={`${uid}-h`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="5" stroke="var(--line)" strokeWidth="1.2" />
      </pattern>
      {/* blue-pencil hatching: v2 / highlighted */}
      <pattern id={`${uid}-hp`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
        <line x1="0" y1="0" x2="0" y2="5" stroke="var(--pencil)" strokeWidth="1.2" />
      </pattern>
      {/* red cross-hatching: overload / failure */}
      <pattern id={`${uid}-hr`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="5" stroke="var(--red)" strokeWidth="1.2" />
        <line x1="0" y1="0" x2="5" y2="0" stroke="var(--red)" strokeWidth="0.8" />
      </pattern>
      {/* light hatching: the cut wall of a housing in section */}
      <pattern id={`${uid}-hl`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="4" stroke="var(--line-2)" strokeWidth="1" />
      </pattern>
      {/* stipple: reserved / system share */}
      <pattern id={`${uid}-st`} width="4" height="4" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="0.75" fill="var(--line-2)" />
      </pattern>
      <marker
        id={`${uid}-a`}
        viewBox="0 0 10 10"
        refX="10"
        refY="5"
        markerWidth="9"
        markerHeight="9"
        markerUnits="userSpaceOnUse"
        orient="auto-start-reverse"
      >
        <path d="M0,1.8 L10,5 L0,8.2 Z" fill="var(--line)" />
      </marker>
      <marker
        id={`${uid}-ap`}
        viewBox="0 0 10 10"
        refX="10"
        refY="5"
        markerWidth="9"
        markerHeight="9"
        markerUnits="userSpaceOnUse"
        orient="auto-start-reverse"
      >
        <path d="M0,1.8 L10,5 L0,8.2 Z" fill="var(--pencil)" />
      </marker>
      <marker
        id={`${uid}-ar`}
        viewBox="0 0 10 10"
        refX="10"
        refY="5"
        markerWidth="10"
        markerHeight="10"
        markerUnits="userSpaceOnUse"
        orient="auto-start-reverse"
      >
        <path d="M0,1.5 L10,5 L0,8.5" fill="none" stroke="var(--red)" strokeWidth="1.6" />
      </marker>
      {/* request in flight: crosshair dot */}
      <g id={`${uid}-req`}>
        <circle r="3.4" fill="currentColor" />
        <path d="M-7,0 H-4.6 M4.6,0 H7 M0,-7 V-4.6 M0,4.6 V7" stroke="currentColor" strokeWidth="1.1" />
      </g>
      {/* response: an open chevron pointing the way it travels (back to the student); hollow rings mean free queue slots */}
      <g id={`${uid}-res`}>
        <path d="M2.6,-5 L-2.6,0 L2.6,5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g id={`${uid}-resL`}>
        <path d="M2.6,-5 L-2.6,0 L2.6,5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g id={`${uid}-resU`}>
        <path d="M-5,2.6 L0,-2.6 L5,2.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {/* error: red pencil cross */}
      <g id={`${uid}-err`}>
        <path d="M-5.5,-5.5 L5.5,5.5 M5.5,-5.5 L-5.5,5.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </g>
    </defs>
  )
}

/* ---------- motion: lines that draw themselves ---------- */

/** A path that draws itself in when its parent switches to the "shown" variant. */
export function Ink({
  d,
  i = 0,
  className,
  style,
  markerEnd,
  markerStart,
}: {
  d: string
  i?: number
  className?: string
  style?: CSSProperties
  markerEnd?: string
  markerStart?: string
}) {
  return (
    <motion.path
      d={d}
      custom={i}
      variants={drawVariants}
      className={className ?? s.ink}
      style={style}
      markerEnd={markerEnd}
      markerStart={markerStart}
    />
  )
}

export function Fade({ children, i = 0 }: { children: ReactNode; i?: number }) {
  return (
    <motion.g custom={i} variants={fadeVariants}>
      {children}
    </motion.g>
  )
}

/* ---------- annotations ---------- */

/** Dimension line with arrowheads, extension ticks and a measurement label. */
export function Dim({
  x1,
  y1,
  x2,
  y2,
  label,
  uid,
  tone = 'line',
  side = 'above',
  size = 12,
}: {
  x1: number
  y1: number
  x2: number
  y2: number
  label: string
  uid: string
  tone?: 'line' | 'pencil'
  side?: 'above' | 'below'
  size?: number
}) {
  const horizontal = Math.abs(y2 - y1) < Math.abs(x2 - x1)
  const mid: Pt = [(x1 + x2) / 2, (y1 + y2) / 2]
  const marker = `url(#${uid}-${tone === 'pencil' ? 'ap' : 'a'})`
  const ticks = horizontal
    ? `M${x1},${y1 - 6} V${y1 + 6} M${x2},${y2 - 6} V${y2 + 6}`
    : `M${x1 - 6},${y1} H${x1 + 6} M${x2 - 6},${y2} H${x2 + 6}`
  const cls = tone === 'pencil' ? s.dimP : s.dim
  return (
    <g className={cls}>
      <path d={ticks} className={s.thin} />
      <line x1={x1} y1={y1} x2={x2} y2={y2} markerStart={marker} markerEnd={marker} className={s.thin} />
      {horizontal ? (
        <text x={mid[0]} y={side === 'above' ? mid[1] - 5 : mid[1] + size + 3} textAnchor="middle" className={s.lbl} style={{ fontSize: size }}>
          {label}
        </text>
      ) : (
        <text
          x={mid[0]}
          y={mid[1]}
          textAnchor="middle"
          transform={`rotate(-90 ${mid[0]} ${mid[1]}) translate(0 ${side === 'above' ? -5 : size + 3})`}
          className={s.lbl}
          style={{ fontSize: size }}
        >
          {label}
        </text>
      )}
    </g>
  )
}

/** Leader line: dot on the part, line to a shelf, text on the shelf. */
export function Leader({
  from,
  to,
  text,
  sub,
  anchor = 'start',
  tone = 'line',
  size = 12,
}: {
  from: Pt
  to: Pt
  text: string
  sub?: string
  anchor?: 'start' | 'end'
  tone?: 'line' | 'pencil' | 'red'
  size?: number
}) {
  const w = Math.max(text.length, sub?.length ?? 0) * size * 0.6 + 6
  const shelfEnd = anchor === 'start' ? to[0] + w : to[0] - w
  const tx = anchor === 'start' ? to[0] + 3 : to[0] - 3
  const cls = tone === 'pencil' ? s.leadP : tone === 'red' ? s.leadR : s.lead
  return (
    <g className={cls}>
      <circle cx={from[0]} cy={from[1]} r="2.2" className={s.leadDot} />
      <path d={polyD([from, to, [shelfEnd, to[1]]])} className={s.thin} />
      <text x={tx} y={to[1] - 5} textAnchor={anchor} className={s.lbl} style={{ fontSize: size }}>
        {text}
      </text>
      {sub && (
        <text x={tx} y={to[1] + size + 2} textAnchor={anchor} className={s.lblMuted} style={{ fontSize: size - 1 }}>
          {sub}
        </text>
      )}
    </g>
  )
}

/** Revision triangle with a letter or number. */
export function RevTri({ x, y, label, tone = 'pencil', size = 1 }: { x: number; y: number; label: string; tone?: 'pencil' | 'red' | 'line'; size?: number }) {
  const r = 10 * size
  const cls = tone === 'red' ? s.triR : tone === 'line' ? s.triL : s.triP
  return (
    <g className={cls}>
      <path d={`M${x},${y - r} L${x + r * 0.95},${y + r * 0.62} L${x - r * 0.95},${y + r * 0.62} Z`} />
      <text x={x} y={y + r * 0.45} textAnchor="middle" style={{ fontSize: 11.5 * size }}>
        {label}
      </text>
    </g>
  )
}

/** Piping valve (bow-tie). Open = outline, closed = filled red: the route is out of rotation. */
export function Valve({ x, y, closed, vertical = false }: { x: number; y: number; closed: boolean; vertical?: boolean }) {
  const d = vertical
    ? `M${x - 5.5},${y - 7} L${x + 5.5},${y + 7} L${x - 5.5},${y + 7} L${x + 5.5},${y - 7} Z`
    : `M${x - 7},${y - 5.5} L${x + 7},${y + 5.5} L${x + 7},${y - 5.5} L${x - 7},${y + 5.5} Z`
  return <path d={d} className={closed ? s.valveShut : s.valve} />
}

/** Architectural scale figure (a student). */
export function Person({ x, y, k = 1, className }: { x: number; y: number; k?: number; className?: string }) {
  const w = 11 * k
  return (
    <g className={className ?? s.person}>
      <circle cx={x} cy={y - 25 * k} r={6.5 * k} />
      <path
        d={`M${x - w},${y} L${x - w},${y - 9 * k} Q${x - w},${y - 17 * k} ${x - w + 7 * k},${y - 17 * k} L${x + w - 7 * k},${y - 17 * k} Q${x + w},${y - 17 * k} ${x + w},${y - 9 * k} L${x + w},${y}`}
      />
      <rect x={x + 3 * k} y={y - 11 * k} width={5 * k} height={8 * k} rx={0.8} className={s.phone} />
    </g>
  )
}

export type PodState = 'running' | 'ready' | 'pending' | 'creating' | 'crash' | 'terminating'

/**
 * Pod = hexagon. Line type carries the state, like a drawing's line conventions:
 * solid + inner line = Running and Ready, chain line = running but not Ready (gets no traffic),
 * dashed (hidden line) = not yet (Pending / ContainerCreating), red pencil = failing, dotted = going away.
 * Version: v1 in ink, v2 in blue pencil with a revision triangle.
 */
export function Pod({
  cx,
  cy,
  r = 26,
  state,
  version,
  uid,
  restarts,
}: {
  cx: number
  cy: number
  r?: number
  state: PodState
  version: 1 | 2
  uid: string
  restarts?: number
}) {
  const cls = [
    s.pod,
    version === 2 ? s.podV2 : '',
    state === 'pending' || state === 'creating' ? s.podHidden : '',
    state === 'crash' ? s.podCrash : '',
    state === 'running' ? s.podNotReady : '',
    state === 'terminating' ? s.podPhantom : '',
  ].join(' ')
  const cw = r * 0.9
  const ch = r * 0.62
  return (
    <g className={cls}>
      <path d={hex(cx, cy, r)} className={s.podOutline} />
      {state === 'ready' && <path d={hex(cx, cy, r - 4)} className={s.podInner} />}
      {state !== 'pending' && (
        <rect
          x={cx - cw / 2}
          y={cy - ch / 2}
          width={cw}
          height={ch}
          className={s.podBox}
          style={version === 2 && (state === 'running' || state === 'ready') ? { fill: `url(#${uid}-hp)` } : undefined}
        />
      )}
      <text x={cx} y={cy + 4.5} textAnchor="middle" className={s.podTxt}>
        {state === 'pending' ? '?' : `v${version}`}
      </text>
      {version === 2 && <RevTri x={cx - r * 0.86} y={cy - r * 0.8} label="2" size={Math.max(0.8, r / 26)} tone={state === 'crash' ? 'red' : 'pencil'} />}
      {state === 'crash' && (
        <>
          <path d={roughCross(cx, cy, r * 0.62, 11)} className={s.redPencil} />
          <path
            d={`M${cx + r + 3},${cy - r * 0.35} a${r * 0.36},${r * 0.36} 0 1 1 ${r * 0.1},${r * 0.62}`}
            className={s.redThin}
            markerEnd={`url(#${uid}-ar)`}
          />
          {restarts !== undefined && (
            <text x={cx + r + 2} y={cy + r * 0.85} className={s.redTxt}>
              ×{restarts}
            </text>
          )}
        </>
      )}
    </g>
  )
}

/** Load balancer = rotary distributor: one inlet, a pointer that turns to the chosen outlet. */
export function Rotary({
  cx,
  cy,
  r,
  angle,
  label,
  sub,
  subRight = false,
  labelPos = 'top',
  labelSize,
}: {
  cx: number
  cy: number
  r: number
  angle: number
  label: string
  sub?: string
  subRight?: boolean
  labelPos?: 'top' | 'left'
  labelSize?: number
}) {
  return (
    <g className={s.rotary}>
      <circle cx={cx} cy={cy} r={r} className={s.rotaryBody} />
      <circle cx={cx} cy={cy} r={r - 5} className={s.thinSoft} />
      <path d={`M${cx - r - 6},${cy} H${cx - r + 4} M${cx},${cy - r - 6} V${cy - r + 4} M${cx},${cy + r - 4} V${cy + r + 6}`} className={s.thin} />
      <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: `${cx}px ${cy}px`, transition: 'transform 90ms linear' }}>
        <path d={`M${cx - 4},${cy} L${cx + r - 9},${cy} M${cx + r - 15},${cy - 4} L${cx + r - 9},${cy} L${cx + r - 15},${cy + 4}`} className={s.pointer} />
      </g>
      <circle cx={cx} cy={cy} r="3.4" className={s.hub} />
      <text
        x={labelPos === 'left' ? cx - r - 12 : cx}
        y={labelPos === 'left' ? cy + 6 : cy - r - 12}
        textAnchor={labelPos === 'left' ? 'end' : 'middle'}
        className={s.partName}
        style={labelSize ? { fontSize: labelSize } : undefined}
      >
        {label}
      </text>
      {sub && (
        <text
          x={subRight ? cx + r + 12 : cx}
          y={subRight ? cy + r * 0.55 : cy + r + 20}
          textAnchor={subRight ? 'start' : 'middle'}
          className={s.lblMuted}
        >
          {sub}
        </text>
      )}
    </g>
  )
}

/** Database = cylinder (P&ID vessel). */
export function Cylinder({ x, y, w, h, label }: { x: number; y: number; w: number; h: number; label?: string }) {
  const ry = Math.min(7, h * 0.18)
  return (
    <g className={s.part}>
      <path
        d={`M${x},${y + ry} A${w / 2},${ry} 0 0 1 ${x + w},${y + ry} V${y + h - ry} A${w / 2},${ry} 0 0 1 ${x},${y + h - ry} Z`}
        className={s.partBody}
      />
      <path d={`M${x},${y + ry} A${w / 2},${ry} 0 0 0 ${x + w},${y + ry}`} className={s.thin} />
      {label && (
        <text x={x + w / 2} y={y + h / 2 + 8} textAnchor="middle" className={s.partSmall}>
          {label}
        </text>
      )}
    </g>
  )
}

/* ---------- HTML pieces ---------- */

/** Section marker: split circle, number above the line, sheet reference below. */
export function SectionMark({ n, sheet = 'L-04' }: { n: string; sheet?: string }) {
  return (
    <svg className={s.secmark} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="27" />
      <line x1="5" y1="32" x2="59" y2="32" />
      <path d="M59,32 L64,28 L64,36 Z" className={s.secmarkArrow} />
      <text x="32" y="26" textAnchor="middle" className={s.secmarkN}>
        {n}
      </text>
      <text x="32" y="47" textAnchor="middle" className={s.secmarkS}>
        {sheet}
      </text>
    </svg>
  )
}

export function Stamp({ children, tone = 'pencil', tilt = -7 }: { children: ReactNode; tone?: 'pencil' | 'red' | 'line'; tilt?: number }) {
  return (
    <span className={s.stamp} data-tone={tone} style={{ rotate: `${tilt}deg` }}>
      {children}
    </span>
  )
}
