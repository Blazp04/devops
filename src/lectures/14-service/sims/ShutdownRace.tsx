import { useState } from 'react'
import { Badge, Cross, Diagram, Rough, Segmented, plural, stepColor, useWidth } from '../../../kit'
import { runPreset } from '../../../engines/traffic'
import css from '../styles.module.css'

type Mode = 'immediate' | 'graceful' | 'prestop'

const MODES: { value: Mode; label: string }[] = [
  { value: 'immediate', label: 'odmah izađe' },
  { value: 'graceful', label: 'dovrši započeto i izađe' },
  { value: 'prestop', label: 'čeka 5 s (preStop: sleep 5)' },
]

/** E1 preset l14-shutdown (4 Pods, λ 12, seed 42; Pod deleted at 20 s): failed requests for each SIGTERM handling. */
function measure(): Record<Mode, number> {
  return {
    immediate: runPreset('l14-shutdown').errors.total,
    graceful: runPreset('l14-shutdown', { service: { sigterm: 'graceful' } }).errors.total,
    prestop: runPreset('l14-shutdown', { service: { preStopSleepS: 5 } }).errors.total,
  }
}

interface Geo {
  W: number
  H: number
  mono: number
  hand: number
  x: (t: number) => number
  lanes: number[]
  labelX: number
  /** labels above the lanes (narrow) instead of left of them */
  above: boolean
  axisY: number
  killX: number
}

const WIDE: Geo = { W: 720, H: 246, mono: 13, hand: 18, x: (t) => 210 + t * 62, lanes: [56, 112, 168], labelX: 8, above: false, axisY: 214, killX: 712 }
// phones: the 0–1 s race window gets most of the width (piecewise axis), the rest is compressed
const NARROW: Geo = { W: 400, H: 356, mono: 15, hand: 21.5, x: (t) => (t < 0 ? 36 + t * 56 : t <= 1 ? 36 + t * 120 : 156 + (t - 1) * 36), lanes: [64, 158, 252], labelX: 8, above: true, axisY: 300, killX: 392 }

const LANES = ['EndpointSlice', 'pravila kube-proxyja', 'aplikacija u Podu']

function Timeline({ mode, g }: { mode: Mode; g: Geo }) {
  const bar = (lane: number, t0: number, t1: number, fill: string, dash?: string) => (
    <Rough shape={{ k: 'rect', x: g.x(t0), y: g.lanes[lane] - 9, w: g.x(t1) - g.x(t0), h: 18 }} seed={lane * 97 + Math.round(t0 * 10) + Math.round(t1)} stroke="var(--ink-2)" strokeWidth={1.1} fillColor={fill} dash={dash} />
  )
  const note = (lane: number, t: number, text: string, color = 'var(--ink-2)', anchor: 'start' | 'middle' | 'end' = 'start') => (
    <text x={g.x(t)} y={g.above ? g.lanes[lane] + 30 : g.lanes[lane] - 14} textAnchor={anchor} className="k-svg-hand" style={{ fontSize: g.hand, fill: color }}>
      {text}
    </text>
  )
  const stopAt = mode === 'prestop' ? 5 : 0
  const fails = mode !== 'prestop'
  return (
    <Diagram width={g.W} height={g.H} label={`Gašenje Poda, ${MODES.find((m) => m.value === mode)!.label}: kube-proxy ga uklanja nakon 1 s, a aplikacija ${mode === 'prestop' ? 'radi još 5 s pa izlazi' : 'odmah prestaje primati veze'}.`}>
      {LANES.map((l, i) => (
        <text key={l} x={g.labelX} y={g.above ? g.lanes[i] - 17 : g.lanes[i] + 5} className="k-svg-display" style={{ fontSize: g.mono + 1, fill: 'var(--ink-2)' }}>
          {l}
        </text>
      ))}
      {/* EndpointSlice: terminating from the moment of deletion */}
      {bar(0, 0, 7, 'var(--hl-orange-ink)', '5 4')}
      {note(0, 0.1, 'terminating: true (ready: false)', 'var(--orange)')}
      {/* kube-proxy: still routes for ~1 s, then the Pod is out of the rules */}
      {bar(1, -0.5, 1, 'var(--hl-green-ink)')}
      {note(1, g.above ? 0.1 : 1.1, 'uklonjen iz pravila (1 s, sim)', 'var(--ink-2)')}
      {/* the app */}
      {mode === 'prestop' ? (
        <g>
          {bar(2, -0.5, 5, 'var(--hl-green-ink)')}
          {note(2, 0.1, 'preStop: sleep 5 – i dalje odgovara', 'var(--green)')}
          <text x={g.x(5)} y={g.above ? g.lanes[2] - 14 : g.lanes[2] + 30} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--ink-2)' }}>
            SIGTERM → izlazi
          </text>
        </g>
      ) : (
        <g>
          {bar(2, -0.5, mode === 'graceful' ? 0.4 : 0, 'var(--hl-green-ink)')}
          {mode === 'graceful' && bar(2, 0, 0.4, 'var(--hl-yellow-ink)')}
          {note(2, 0.1, mode === 'graceful' ? (g.above ? 'SIGTERM → dovrši započeto' : 'SIGTERM → dovrši započeto, nove veze odbija') : 'SIGTERM → odmah izađe', 'var(--red)')}
        </g>
      )}
      {/* requests that arrive while kube-proxy still points at a Pod that no longer listens */}
      {fails &&
        [0.15, 0.42, 0.7, 0.93].map((t, i) => (
          <g key={t}>
            <Cross x={g.x(t)} y={g.above ? g.lanes[2] - 46 + (i % 2) * 8 : g.lanes[2] + 22} size={6} seed={1490 + i} />
          </g>
        ))}
      {fails && (
        <Rough shape={{ k: 'rect', x: g.x(0), y: g.lanes[1] - 13, w: g.x(1) - g.x(0), h: g.lanes[2] - g.lanes[1] + 42 }} seed={1495} stroke="var(--red)" strokeWidth={1.4} dash="4 4" />
      )}
      {/* axis */}
      <Rough shape={{ k: 'line', x1: g.x(-0.5), y1: g.axisY, x2: g.x(7.1), y2: g.axisY }} seed={1496} stroke="var(--ink-3)" strokeWidth={1.2} />
      {[0, 1, 5].map((t) => (
        <text key={t} x={g.x(t)} y={g.axisY + g.mono + 4} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono, fill: t === 0 ? stepColor(1) : 'var(--ink-2)' }}>
          {t === 0 ? (g.above ? '0 s' : 'brisanje') : `${t} s`}
        </text>
      ))}
      <text x={g.killX} y={g.axisY + (g.above ? 2 * g.mono + 12 : g.mono + 4)} textAnchor="end" className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--ink-3)' }}>
        … 30 s SIGKILL
      </text>
      <Rough shape={{ k: 'line', x1: g.x(stopAt), y1: g.lanes[2] - 12, x2: g.x(stopAt), y2: g.lanes[2] + 12 }} seed={1497} stroke="var(--red)" strokeWidth={2} />
    </Diagram>
  )
}

/** Scene 6: the shutdown race – endpoint removal and SIGTERM start together; preStop sleep wins it. */
export function ShutdownRace() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [mode, setMode] = useState<Mode>('immediate')
  const [counts] = useState(measure)
  const g = w !== null && w < 600 ? NARROW : WIDE
  return (
    <div ref={ref}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', alignItems: 'flex-end', marginBottom: 8 }}>
        <Segmented<Mode> label="Kad se Pod briše, aplikacija…" value={mode} options={MODES} onChange={setMode} size="sm" />
        <Badge tone={counts[mode] > 0 ? 'bad' : 'ok'}>
          {counts[mode] > 0 ? '✗' : '✓'} {plural(counts[mode], ['neuspio zahtjev', 'neuspjela zahtjeva', 'neuspjelih zahtjeva'])}
        </Badge>
      </div>
      <div className={g === NARROW ? css.stageNarrow : undefined}>
        <Timeline mode={mode} g={g} />
      </div>
    </div>
  )
}
