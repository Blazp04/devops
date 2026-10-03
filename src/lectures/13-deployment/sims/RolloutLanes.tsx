/**
 * Scene 4 small multiples: the same rollout 1.3.2 → 1.4.0 (N = 4) under four pairs of fences, each lane an E3 run
 * (lib/snapshots.laneRuns): Pods over time stacked by version and state, the two fences as dashed pencil lines.
 * Durations are rounded up to whole seconds, as in the validated SIM 5 table (28 / 51 / 46 / 17 s).
 */
import { useState } from 'react'
import { Diagram, Legend, Rough, plural, useDiagramIds, useWidth } from '../../../kit'
import { LANE_MAX_T, laneAreas } from '../lib/lanes'
import { fenceLabel } from '../lib/options'
import { laneRuns, type LaneRun } from '../lib/snapshots'

/** wide viewBox 720 with 13-unit Plex Mono: ≥ 12 px from 720 × 12 / 13 ≈ 665 px */
const WIDE_MIN = 680
/** units per Pod (y) – up to 8 Pods per lane */
const SY = 10
const PLOT_H = 8 * SY + 4
/** left margin for the 0 / 4 / 8 ticks, right margin for the fence labels */
const X0 = 30
const RIGHT = 44

const durS = (r: LaneRun) => `${Math.ceil(r.durationS - 1e-6)} s`
const signed = (n: number, sign: string) => (n ? `${sign}${n}` : '0')

export function RolloutLanes() {
  const [runs] = useState(laneRuns)
  const [ref, width] = useWidth<HTMLDivElement>()
  const wide = width !== null && width >= WIDE_MIN
  const W = wide ? 720 : 340
  const head = wide ? 28 : 46
  const laneH = head + PLOT_H + 14
  const H = runs.length * laneH + 30
  return (
    <div ref={ref}>
      <div style={wide ? undefined : { maxWidth: 460, margin: '0 auto' }}>
        <Diagram
          width={W}
          height={H}
          label={`Četiri uvođenja iste verzije s N = 4: ${runs
            .map((r) => `${fenceLabel(r.maxSurge)} / ${fenceLabel(r.maxUnavailable)} traje ${durS(r)}, najviše ${plural(r.peakInclTerminating, ['Pod', 'Poda', 'Podova'])} s onima u gašenju, najmanje ${plural(r.minAvailable, ['dostupan', 'dostupna', 'dostupnih'])}`)
            .join('; ')}.`}
        >
          {runs.map((r, i) => (
            <Lane key={r.key} run={r} i={i} y0={i * laneH} W={W} wide={wide} head={head} />
          ))}
          <Axis y={runs.length * laneH} W={W} />
        </Diagram>
      </div>
      <Legend
        items={[
          { color: 'var(--hl-blue-ink)', label: '1.3.2 spreman', shape: 'square' },
          { color: 'var(--hl-lilac-ink)', label: '1.4.0 spreman', shape: 'square' },
          { color: 'var(--ink-3)', label: '1.4.0 još nije spreman', shape: 'dashed' },
          { color: 'var(--ink-3)', label: 'u gašenju (ograda ga ne broji)', shape: 'square' },
          { color: 'var(--red)', label: 'ograda: ukupno ≤ N + surge', shape: 'dashed' },
          { color: 'var(--green)', label: 'ograda: dostupno ≥ N − unavailable', shape: 'dashed' },
        ]}
      />
    </div>
  )
}

function Lane({ run, i, y0, W, wide, head }: { run: LaneRun; i: number; y0: number; W: number; wide: boolean; head: number }) {
  const ids = useDiagramIds()
  const sx = (W - X0 - RIGHT) / LANE_MAX_T
  const base = y0 + head + PLOT_H
  const right = W - RIGHT
  const areas = laneAreas(run, X0, base, sx, SY)
  const fills: Record<string, { fill: string; opacity?: number; hatch?: string; dash?: boolean }> = {
    oldReady: { fill: 'var(--hl-blue-ink)', opacity: 0.45, hatch: ids?.hatchV1 },
    newReady: { fill: 'var(--hl-lilac-ink)', opacity: 0.6, hatch: ids?.hatchR },
    oldNotReady: { fill: 'none', dash: true },
    newNotReady: { fill: 'none', dash: true },
    terminating: { fill: 'var(--ink-4)', opacity: 0.5, hatch: ids?.hatch },
  }
  const maxT = 4 + run.surge
  const minT = 4 - run.unavailable
  const maxY = base - maxT * SY
  const minY = base - minT * SY
  const endX = X0 + run.durationS * sx
  const title = `${fenceLabel(run.maxSurge)} / ${fenceLabel(run.maxUnavailable)} → ${signed(run.surge, '+')} / ${signed(run.unavailable, '−')}`
  const facts = wide
    ? `${durS(run)} · najviše ${plural(run.peakInclTerminating, ['Pod', 'Poda', 'Podova'])} · najmanje ${plural(run.minAvailable, ['dostupan', 'dostupna', 'dostupnih'])}`
    : `${durS(run)} · ≤ ${plural(run.peakInclTerminating, ['Pod', 'Poda', 'Podova'])} · ≥ ${plural(run.minAvailable, ['dostupan', 'dostupna', 'dostupnih'])}`
  const seed = 8900 + i * 10
  return (
    <g>
      <text x={X0} y={y0 + 16} className="k-svg-mono" style={{ fontSize: 13, fontWeight: 600, fill: 'var(--ink)' }}>
        {title}
      </text>
      <text x={wide ? right + RIGHT - 8 : X0} y={wide ? y0 + 16 : y0 + 34} textAnchor={wide ? 'end' : 'start'} className="k-svg-mono" style={{ fontSize: 13, fill: 'var(--ink-2)' }}>
        {facts}
      </text>
      {/* y ticks: 0, 4 (= N) and 8 Pods */}
      <g aria-hidden="true">
        {[0, 4, 8].map((n) => (
          <text key={n} x={X0 - 8} y={base - n * SY + 4} textAnchor="end" className="k-svg-mono" style={{ fontSize: 13, fill: 'var(--ink-3)' }}>
            {n}
          </text>
        ))}
      </g>
      {areas.map((a) => {
        const f = fills[a.key]
        return (
          <g key={a.key}>
            {f.fill !== 'none' && <path d={a.d} fill={f.fill} fillOpacity={f.opacity ?? 1} />}
            {f.hatch && <path d={a.d} fill={`url(${f.hatch})`} />}
            {f.dash && <path d={a.d} fill="none" stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="3 3" />}
          </g>
        )
      })}
      <Rough shape={{ k: 'line', x1: X0, y1: base, x2: right, y2: base }} seed={seed} stroke="var(--ink-3)" strokeWidth={1.1} roughness={0.5} />
      <Rough shape={{ k: 'line', x1: X0, y1: maxY, x2: right, y2: maxY }} seed={seed + 1} stroke="var(--red)" strokeWidth={1.5} dash="6 4" roughness={0.6} />
      <Rough shape={{ k: 'line', x1: X0, y1: minY, x2: right, y2: minY }} seed={seed + 2} stroke="var(--green)" strokeWidth={1.5} dash="6 4" roughness={0.6} />
      <Rough shape={{ k: 'line', x1: endX, y1: base + 4, x2: endX, y2: base - PLOT_H }} seed={seed + 3} stroke="var(--ink-2)" strokeWidth={1.3} roughness={0.6} />
      <text x={right + 6} y={maxY - 2} className="k-svg-mono" style={{ fontSize: 13, fontWeight: 600, fill: 'var(--red)' }}>
        ≤ {maxT}
      </text>
      <text x={right + 6} y={minY + 12} className="k-svg-mono" style={{ fontSize: 13, fontWeight: 600, fill: 'var(--green)' }}>
        ≥ {minT}
      </text>
    </g>
  )
}

function Axis({ y, W }: { y: number; W: number }) {
  const sx = (W - X0 - RIGHT) / LANE_MAX_T
  const ticks = [0, 10, 20, 30, 40, 50]
  return (
    <g aria-hidden="true">
      {ticks.map((t) => (
        <text key={t} x={X0 + t * sx} y={y + 16} textAnchor={t === 0 ? 'start' : 'middle'} className="k-svg-mono" style={{ fontSize: 13, fill: 'var(--ink-3)' }}>
          {t} s
        </text>
      ))}
    </g>
  )
}
