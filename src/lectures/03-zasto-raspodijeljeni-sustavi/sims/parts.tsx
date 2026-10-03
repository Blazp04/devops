/**
 * Small drawings shared by the lecture's sims, all composed from the kit's pen and doodles:
 * a server card (printed name, spec in mono, the face in a round porthole) and a pencil XY chart with real x ticks
 * (the kit's LineChart is a scrolling time series, these charts plot against N servers or a timeout).
 */
import type { ReactNode } from 'react'
import { Rough, ServerFace, SvgStamp, useWidth, type Pt } from '../../../kit'

type Mood = 'calm' | 'busy' | 'panic' | 'dead'

/** A server card: paper box, name (Bricolage), optional spec line (Plex Mono), face porthole on the right. */
export function Srv({
  x,
  y,
  w,
  h,
  name,
  spec,
  mood = 'calm',
  seed = 3100,
  down,
  stamp,
  nameSize = 15,
  specSize = 13,
  faceR,
  stampSize = 13,
  children,
}: {
  x: number
  y: number
  w: number
  h: number
  name: string
  spec?: ReactNode
  mood?: Mood
  seed?: number
  down?: boolean
  /** paper stamp across the card (e.g. SRUŠEN) */
  stamp?: string
  nameSize?: number
  specSize?: number
  /** face porthole radius (default: 30 % of the card height, 10–17) */
  faceR?: number
  stampSize?: number
  children?: ReactNode
}) {
  const r = faceR ?? Math.max(10, Math.min(17, h * 0.3))
  const face: Mood = down ? 'dead' : mood
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} strokeWidth={1.7} stroke={down ? 'var(--red)' : 'var(--ink)'} fillColor="var(--paper)" fillStyle="solid" />
      <text x={x + 10} y={y + (spec ? h / 2 - 2 : h / 2 + 5)} className="k-svg-display" style={{ fontSize: nameSize }}>
        {name}
      </text>
      {spec && (
        <text x={x + 10} y={y + h / 2 + 2 + specSize} className="k-svg-mono" style={{ fontSize: specSize, fill: 'var(--ink-2)' }}>
          {spec}
        </text>
      )}
      <g transform={`translate(${x + w - r - 8} ${y + h / 2})`}>
        <ServerFace mood={face} r={r} />
      </g>
      {children}
      {stamp && <SvgStamp x={x + w / 2 - 6} y={y + h / 2 + 5} text={stamp} size={stampSize} />}
    </g>
  )
}

export interface CurveSeries {
  label: string
  ys: number[]
  color: string
  /** stroke dash (series differ by pattern as well as colour) */
  dash?: string
  width?: number
}

interface CurveChartProps {
  width: number
  height?: number
  xs: number[]
  series: CurveSeries[]
  /** logarithmic x axis */
  log?: boolean
  yMax: number
  xTicks: { v: number; label: string }[]
  yTicks: number[]
  formatY?: (v: number) => string
  /** a point to circle on series[marker.series] */
  marker?: { x: number; y: number; label?: string; color?: string }
  /** a vertical line (e.g. the chosen timeout) */
  vline?: { x: number; label: string; color?: string }
  /** a horizontal limit (e.g. Amdahl's ceiling) */
  hline?: { y: number; label: string }
  xLabel?: string
  yLabel?: string
  seed?: number
  label: string
}

/**
 * A pencil XY chart drawn 1:1 in its container's width (so lettering stays ≥ 12 px): hand-drawn axes, x and y ticks,
 * lines with a faint ghost stroke, an optional marker (circled point + label) and an optional threshold.
 */
export function CurveChart({
  width,
  height = 200,
  xs,
  series,
  log,
  yMax,
  xTicks,
  yTicks,
  formatY = (v) => String(Math.round(v)),
  marker,
  vline,
  hline,
  xLabel,
  yLabel,
  seed = 5200,
  label,
}: CurveChartProps) {
  const W = Math.max(260, width)
  const H = height
  const pad = { l: 46, r: 18, t: yLabel ? 26 : 12, b: 40 }
  const x0 = xs[0]
  const x1 = xs[xs.length - 1]
  const tx = (v: number) => (log ? Math.log(v / x0) / Math.log(x1 / x0) : (v - x0) / (x1 - x0))
  const X = (v: number) => pad.l + tx(v) * (W - pad.l - pad.r)
  const Y = (v: number) => pad.t + (1 - Math.max(0, Math.min(v, yMax)) / yMax) * (H - pad.t - pad.b)
  const yBase = Y(0)
  const path = (ys: number[]) => ys.map((v, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)} ${Y(v).toFixed(1)}`).join('')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label} style={{ display: 'block', height: 'auto', overflow: 'visible' }}>
      {yLabel && (
        <text x={pad.l - 6} y={14} className="k-svg-hand" style={{ fontSize: 18, fill: 'var(--ink-2)' }}>
          ↑ {yLabel}
        </text>
      )}
      {yTicks.map((t) => (
        <g key={`y${t}`}>
          {t > 0 && <line x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)} style={{ stroke: 'var(--ink-4)', strokeWidth: 0.8, strokeDasharray: '2 5' }} />}
          <text x={pad.l - 8} y={Y(t) + 4} textAnchor="end" className="k-svg-mono" style={{ fontSize: 12, fill: 'var(--ink-2)' }}>
            {formatY(t)}
          </text>
        </g>
      ))}
      {xTicks.map((t) => (
        <g key={`x${t.v}`}>
          <line x1={X(t.v)} x2={X(t.v)} y1={yBase} y2={yBase + 5} style={{ stroke: 'var(--ink-2)', strokeWidth: 1.2 }} />
          <text x={X(t.v)} y={yBase + 19} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 12, fill: 'var(--ink-2)' }}>
            {t.label}
          </text>
        </g>
      ))}
      {xLabel && (
        <text x={W - pad.r} y={H - 3} textAnchor="end" className="k-svg-hand" style={{ fontSize: 18, fill: 'var(--ink-2)' }}>
          {xLabel} →
        </text>
      )}
      {series.map((s) => (
        <g key={s.label} fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: s.color }}>
          <path d={path(s.ys)} strokeWidth={1} opacity={0.35} transform="translate(0.8 1.1)" strokeDasharray={s.dash} />
          <path d={path(s.ys)} strokeWidth={s.width ?? 2.2} strokeDasharray={s.dash} />
        </g>
      ))}
      {vline && (
        <g>
          <Rough shape={{ k: 'line', x1: X(vline.x), y1: pad.t - 4, x2: X(vline.x), y2: yBase }} seed={seed + 7} stroke={vline.color ?? 'var(--red)'} strokeWidth={1.8} dash="6 5" roughness={0.8} />
          <text x={X(vline.x) + (tx(vline.x) > 0.7 ? -6 : 6)} y={pad.t + 10} textAnchor={tx(vline.x) > 0.7 ? 'end' : 'start'} className="k-svg-hand" style={{ fontSize: 18, fill: vline.color ?? 'var(--red)' }}>
            {vline.label}
          </text>
        </g>
      )}
      {hline && hline.y <= yMax && (
        <g>
          <Rough shape={{ k: 'line', x1: pad.l, y1: Y(hline.y), x2: W - pad.r, y2: Y(hline.y) }} seed={seed + 11} stroke="var(--red)" strokeWidth={1.6} dash="7 5" roughness={0.8} />
          <text x={W - pad.r - 4} y={Y(hline.y) - 6} textAnchor="end" className="k-svg-hand" style={{ fontSize: 18, fill: 'var(--red)' }}>
            {hline.label}
          </text>
        </g>
      )}
      {marker && (
        <g>
          <Rough shape={{ k: 'ellipse', cx: X(marker.x), cy: Y(marker.y), w: 16, h: 15 }} seed={seed + 9} stroke={marker.color ?? 'var(--red)'} strokeWidth={2} roughness={0.8} />
          {marker.label && (
            <text x={X(marker.x) + (tx(marker.x) > 0.6 ? -12 : 12)} y={Y(marker.y) - 10} textAnchor={tx(marker.x) > 0.6 ? 'end' : 'start'} className="k-svg-hand" style={{ fontSize: 19, fill: marker.color ?? 'var(--red)' }}>
              {marker.label}
            </text>
          )}
        </g>
      )}
      {/* axes in pencil */}
      <Rough shape={{ k: 'line', x1: pad.l, y1: pad.t - 6, x2: pad.l, y2: yBase + 2 }} seed={seed + 1} stroke="var(--ink-2)" strokeWidth={1.5} roughness={0.9} />
      <Rough shape={{ k: 'line', x1: pad.l - 3, y1: yBase, x2: W - pad.r + 4, y2: yBase }} seed={seed + 2} stroke="var(--ink-2)" strokeWidth={1.5} roughness={0.9} />
      <Rough
        shape={{
          k: 'lin',
          pts: [
            [W - pad.r - 2, yBase - 4.5],
            [W - pad.r + 5, yBase],
            [W - pad.r - 2, yBase + 4.5],
          ] as Pt[],
        }}
        seed={seed + 3}
        stroke="var(--ink-2)"
        strokeWidth={1.5}
        roughness={0.5}
      />
    </svg>
  )
}

/** CurveChart that measures its own container, so it is drawn 1:1 in whatever grid column it lands in. */
export function FitCurve({ maxWidth = 720, ...props }: Omit<CurveChartProps, 'width'> & { maxWidth?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  return (
    <div ref={ref} style={{ minWidth: 0 }}>
      <CurveChart {...props} width={Math.min(maxWidth, w ?? 480)} />
    </div>
  )
}
