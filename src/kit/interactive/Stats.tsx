import { useId, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Rough } from '../sketch/Sketch'
import { hashSeed } from '../sketch/roughGen'
import { useWidth } from '../sketch/useSize'
import { Outline } from './Outline'
import { TONE_VAR, utilTone, type Tone } from './tone'
import { finiteMax, finiteRuns, ghostPath, niceCeil, niceTicks, pathOf, type XY } from './chart'

/* =====================================================================
   Live metrics in the notebook: numbers typed in Plex Mono inside
   pencil boxes with handwritten labels, marker-filled meters and
   pencil line charts on graph paper.
   ===================================================================== */

interface StatProps {
  label: ReactNode
  value: ReactNode
  unit?: ReactNode
  tone?: Tone
  /** Small line under the value */
  sub?: ReactNode
  /** Optional sparkline values */
  spark?: number[]
}

/** A single metric in a pencil box (e.g. "p95 latencija: 120 ms"). A bad value gets a red, heavier box. */
export function Stat({ label, value, unit, tone = 'neutral', sub, spark }: StatProps) {
  const bad = tone === 'bad'
  return (
    <div className={`k-stat k-stat--${tone}`}>
      <Outline seed={hashSeed(`stat|${typeof label === 'string' ? label : ''}`)} stroke={bad ? 'var(--red)' : 'var(--ink-2)'} strokeWidth={bad ? 2 : 1.4} roughness={1.35} inset={1.5} />
      <div className="k-stat__label">{label}</div>
      <div className="k-stat__value" style={{ color: TONE_VAR[tone] }}>
        {value}
        {unit && <span className="k-stat__unit">{unit}</span>}
      </div>
      {sub && <div className="k-stat__sub">{sub}</div>}
      {spark && spark.length > 1 && <Sparkline values={spark} color={TONE_VAR[tone === 'neutral' ? 'blue' : tone]} />}
    </div>
  )
}

export function StatRow({ children }: { children: ReactNode }) {
  return <div className="k-statrow">{children}</div>
}

interface MeterProps {
  /** 0..1 */
  value: number
  label?: ReactNode
  /** Right-aligned value text */
  valueLabel?: ReactNode
  tone?: Tone
  /** Auto-tone by thresholds when tone not given */
  thresholds?: [number, number]
  height?: number
}

/** A pencil "fuel gauge" filled with a marker swipe and hatching (CPU, RAM, queue fill…). */
export function Meter({ value, label, valueLabel, tone, thresholds = [0.7, 0.9], height = 12 }: MeterProps) {
  const v = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
  const t = tone ?? utilTone(v, thresholds[0], thresholds[1])
  return (
    <div className="k-meter" data-tone={t}>
      {(label || valueLabel) && (
        <div className="k-meter__top">
          <span className="k-meter__label">{label}</span>
          <span className="k-meter__value">{valueLabel}</span>
        </div>
      )}
      <div className="k-meter__track" style={{ height, ['--tone' as string]: TONE_VAR[t] }}>
        <motion.div className="k-meter__fill" initial={false} animate={{ width: `${v * 100}%` }} transition={{ duration: 0.25, ease: 'easeOut' }} />
      </div>
    </div>
  )
}

/** Tiny inline pencil line chart (breaks at NaN). */
export function Sparkline({ values, color = 'var(--blue)', height = 28, max }: { values: number[]; color?: string; height?: number; max?: number }) {
  const w = 100
  const hi = max ?? Math.max(1e-9, finiteMax(values))
  const n = Math.max(1, values.length - 1)
  const runs = finiteRuns(values).map((r) => r.vals.map((v, k): XY => [((r.start + k) / n) * w, height - (Math.min(v, hi) / hi) * (height - 3) - 1.5]))
  return (
    <svg className="k-spark" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ height }} aria-hidden="true">
      {runs.map((pts, i) =>
        pts.length > 1 ? (
          <g key={i} style={{ stroke: color }} fill="none" strokeLinejoin="round" strokeLinecap="round">
            <path d={ghostPath(pts, 0.6)} strokeWidth={0.9} opacity={0.45} vectorEffect="non-scaling-stroke" />
            <path d={pathOf(pts)} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
          </g>
        ) : null,
      )}
    </svg>
  )
}

export interface ChartSeries {
  label: ReactNode
  values: number[]
  color: string
  /** Draw as filled area */
  area?: boolean
  /**
   * Line pattern. By default series differ by pattern as well as colour (1st solid, 2nd dashed, 3rd dotted), so the
   * chart reads without colour; `true` forces dashed, `false` forces solid.
   */
  dashed?: boolean
}

/** Default dash pattern of the i-th series (solid, dashed, dotted, dash-dot). */
const SERIES_DASH = [undefined, '6 5', '2 4', '8 3 2 3']

function dashOf(s: ChartSeries, i: number): string | undefined {
  if (s.dashed === true) return '6 5'
  if (s.dashed === false) return undefined
  return SERIES_DASH[i % SERIES_DASH.length]
}

interface LineChartProps {
  series: ChartSeries[]
  height?: number
  /** Fixed y max; defaults to the data max */
  yMax?: number
  yLabel?: ReactNode
  /** Horizontal reference line, e.g. a capacity limit */
  threshold?: { value: number; label: ReactNode; color?: string }
  /** Number of samples the x axis spans (keeps the chart scrolling at a stable rate) */
  window?: number
  formatY?: (v: number) => string
  xLabel?: ReactNode
  /**
   * A vertical pencil line at one moment, e.g. the scrubbed „Trenutak”: `at` = sample index in the series (0 = the
   * first value; the chart's x positions, so it follows `window`), optional handwritten `label` at its top, `color`.
   */
  marker?: { at: number; label?: string; color?: string }
}

/**
 * Scrolling time-series chart for live simulation metrics, drawn in pencil on a scrap of graph paper:
 * hand-drawn axes, hatched areas, a red dashed pencil line for a threshold, an optional vertical `marker` (a moment),
 * a handwritten legend. Non-finite values (NaN = "n/a") break the line and are left out of the axis maximum.
 */
export function LineChart({ series, height = 140, yMax, yLabel, threshold, window, formatY = (v) => String(Math.round(v)), xLabel, marker }: LineChartProps) {
  const gid = useId().replace(/:/g, '')
  const [wrapRef, measured] = useWidth<HTMLDivElement>()
  const W = Math.max(200, measured ?? 600)
  const H = height
  const pad = { l: 44, r: 16, t: 12, b: 10 }
  const n = window ?? Math.max(2, ...series.map((s) => s.values.length))
  const dataMax = Math.max(1e-9, ...series.map((s) => finiteMax(s.values)), threshold && Number.isFinite(threshold.value) ? threshold.value : 0)
  const max = yMax ?? niceCeil(dataMax * 1.1)
  const x = (i: number, len: number) => pad.l + ((i + (n - len)) / Math.max(1, n - 1)) * (W - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - Math.min(Math.max(v, 0), max) / max) * (H - pad.t - pad.b)
  const ticks = niceTicks(max, formatY)
  const thColor = threshold?.color ?? 'var(--bad)'
  const x0 = pad.l
  const y0 = y(0)
  const longest = Math.max(1, ...series.map((s) => s.values.length))
  const mx = marker && Number.isFinite(marker.at) ? Math.max(x0, Math.min(W - pad.r, x(marker.at, longest))) : null
  const mColor = marker?.color ?? 'var(--pen)'

  return (
    <div className="k-chart" ref={wrapRef}>
      <Outline seed={hashSeed(`chart|${gid}`)} stroke="var(--ink-3)" strokeWidth={1.2} roughness={1.3} inset={1} />
      {yLabel && <div className="k-chart__ylabel">↑ {yLabel}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="k-chart__svg" aria-hidden="true">
        <defs>
          {series.map((s, si) =>
            s.area ? (
              <pattern key={si} id={`${gid}-h${si}`} width={5} height={5} patternUnits="userSpaceOnUse" patternTransform="rotate(-41)">
                <line x1={0} y1={0} x2={0} y2={5} style={{ stroke: s.color }} strokeWidth={1.1} />
              </pattern>
            ) : null,
          )}
        </defs>
        {/* faint pencil guides at the ticks */}
        {ticks.map((t, i) =>
          i === 0 ? null : <line key={`g${i}`} x1={x0} x2={W - pad.r} y1={y(t)} y2={y(t)} className="k-chart__guide" />,
        )}
        {ticks.map((t, i) => (
          <text key={`t${i}`} x={x0 - 8} y={y(t) + 4} textAnchor="end" className="k-chart__tick">
            {formatY(t)}
          </text>
        ))}
        {/* areas first (hatched), then the pencil lines */}
        {series.map((s, si) =>
          s.area
            ? finiteRuns(s.values).map((r, ri) => {
                if (r.vals.length < 2) return null
                const len = s.values.length
                const pts = r.vals.map((v, k): XY => [x(r.start + k, len), y(v)])
                const d = `${pathOf(pts)}L${pts[pts.length - 1][0].toFixed(1)} ${y0.toFixed(1)}L${pts[0][0].toFixed(1)} ${y0.toFixed(1)}Z`
                return <path key={`a${si}-${ri}`} d={d} fill={`url(#${gid}-h${si})`} opacity={0.55} />
              })
            : null,
        )}
        {series.map((s, si) =>
          finiteRuns(s.values).map((r, ri) => {
            if (r.vals.length < 2) return null
            const len = s.values.length
            const pts = r.vals.map((v, k): XY => [x(r.start + k, len), y(v)])
            return (
              <g key={`l${si}-${ri}`} style={{ stroke: s.color }} fill="none" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={dashOf(s, si)}>
                <path d={ghostPath(pts)} strokeWidth={1} opacity={0.4} />
                <path d={pathOf(pts)} strokeWidth={2} />
              </g>
            )
          }),
        )}
        {threshold && Number.isFinite(threshold.value) && (
          <g>
            <Rough shape={{ k: 'line', x1: x0, y1: y(threshold.value), x2: W - pad.r, y2: y(threshold.value) }} seed={hashSeed(`th|${W}`)} stroke={thColor} strokeWidth={1.8} roughness={0.9} dash="7 5" />
            {typeof threshold.label === 'string' && (
              <text x={W - pad.r - 4} y={y(threshold.value) - 6} textAnchor="end" className="k-chart__thlabel" style={{ fill: thColor }}>
                {threshold.label}
              </text>
            )}
          </g>
        )}
        {mx !== null && (
          <g className="k-chart__marker">
            <line x1={mx} x2={mx} y1={pad.t - 4} y2={y0} style={{ stroke: mColor }} strokeWidth={1.8} strokeDasharray="4 4" strokeLinecap="round" />
            {marker?.label && (
              <text x={mx + (mx > W * 0.7 ? -6 : 6)} y={pad.t + 12} textAnchor={mx > W * 0.7 ? 'end' : 'start'} className="k-chart__thlabel k-dhalo" style={{ fill: mColor }}>
                {marker.label}
              </text>
            )}
          </g>
        )}
        {/* the axes, drawn by hand (redrawn only when the size changes) */}
        <Rough shape={{ k: 'line', x1: x0, y1: pad.t - 6, x2: x0, y2: y0 + 2 }} seed={4401} stroke="var(--ink-2)" strokeWidth={1.5} roughness={0.9} />
        <Rough shape={{ k: 'line', x1: x0 - 3, y1: y0, x2: W - pad.r + 4, y2: y0 }} seed={4402} stroke="var(--ink-2)" strokeWidth={1.5} roughness={0.9} />
        <Rough
          shape={{
            k: 'lin',
            pts: [
              [W - pad.r - 2, y0 - 4.5],
              [W - pad.r + 5, y0],
              [W - pad.r - 2, y0 + 4.5],
            ],
          }}
          seed={4403}
          stroke="var(--ink-2)"
          strokeWidth={1.5}
          roughness={0.5}
        />
      </svg>
      <div className="k-chart__legend">
        {series.map((s, i) => (
          <span key={i} className="k-chart__key">
            <svg viewBox="0 0 26 10" width="26" height="10" aria-hidden="true">
              <path d="M1 6 Q7 2.5 13 5.5 T25 4.5" fill="none" style={{ stroke: s.color }} strokeWidth={2.2} strokeLinecap="round" strokeDasharray={dashOf(s, i)} />
            </svg>
            {s.label}
          </span>
        ))}
        {threshold && (
          <span className="k-chart__key">
            <svg viewBox="0 0 26 10" width="26" height="10" aria-hidden="true">
              <path d="M1 5 L25 5.5" fill="none" style={{ stroke: thColor }} strokeWidth={2} strokeDasharray="5 3.5" />
            </svg>
            {threshold.label}
          </span>
        )}
        {xLabel && <span className="k-chart__xlabel">{xLabel} →</span>}
      </div>
    </div>
  )
}
