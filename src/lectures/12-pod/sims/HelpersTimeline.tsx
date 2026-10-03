/**
 * DeepDive „Pomoćnici”: timeline lanes of one Pod – an init container runs to completion first, a native sidecar
 * (initContainer with restartPolicy: Always) starts before the app and stops after it.
 */
import { Check, Rough, useWidth } from '../../../kit'

interface Lane {
  name: string
  short: string
  kind: string
  from: number
  to: number
  tint: string
  done?: boolean
}

const LANES: Lane[] = [
  { name: 'wait-for-db', short: 'wait-for-db', kind: 'init kontejner: radi do kraja', from: 0, to: 6, tint: 'var(--hl-orange-ink)', done: true },
  { name: 'log-shipper', short: 'log-shipper', kind: 'nativni sidecar: krene prije aplikacije, stane poslije nje', from: 6, to: 46, tint: 'var(--hl-green-ink)' },
  { name: 'klopa-api', short: 'klopa-api', kind: 'glavni kontejner', from: 10, to: 43, tint: 'var(--hl-blue-ink)' },
]

const T_MAX = 50
const DELETE_AT = 40

export function HelpersTimeline() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const narrow = w !== null && w < 630
  const W = narrow ? 360 : 680
  const H = narrow ? 290 : 220
  const x0 = narrow ? 24 : 150
  const x1 = W - 28
  const axisFont = narrow ? 15 : 13.5
  const sx = (t: number) => x0 + (t / T_MAX) * (x1 - x0)
  const laneY = (i: number) => (narrow ? 56 + i * 64 : 42 + i * 50)
  const axisY = narrow ? 252 : 190
  return (
    <div ref={ref}>
      <div style={narrow ? { maxWidth: 440, margin: '0 auto' } : undefined}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Vremenska crta Poda: init kontejner wait-for-db završi prvi, nativni sidecar log-shipper krene prije klopa-api i stane poslije njega." style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}>
          {LANES.map((l, i) => {
            const y = laneY(i)
            const lx = narrow ? x0 : 10
            return (
              <g key={l.name}>
                <text x={lx} y={narrow ? y - 22 : y - 4} className="k-svg-mono" style={{ fontSize: 14, fontWeight: 700 }}>
                  {narrow ? l.short : l.name}
                </text>
                {!narrow && (
                  <text x={lx} y={y + 14} className="k-svg-hand" style={{ fontSize: 18.5, fill: 'var(--ink-2)' }}>
                    {l.kind.split(':')[0]}
                  </text>
                )}
                {narrow && (
                  <text x={lx + 112} y={y - 22} className="k-svg-hand" style={{ fontSize: 19.5, fill: 'var(--ink-2)' }}>
                    {l.kind.split(':')[0]}
                  </text>
                )}
                <Rough shape={{ k: 'rect', x: sx(l.from), y: y - 10, w: sx(l.to) - sx(l.from), h: 20 }} seed={12800 + i} strokeWidth={1.6} fillColor={l.tint} hachureGap={5} hachureAngle={i === 1 ? 41 : -41} />
                {l.done && (
                  <g transform={`translate(${sx(l.to) + 12} ${y})`}>
                    <Check x={0} y={0} size={7} seed={12810} />
                  </g>
                )}
              </g>
            )
          })}
          {/* deletion: the app stops first, the sidecar after it */}
          <line x1={sx(DELETE_AT)} y1={laneY(0) - 18} x2={sx(DELETE_AT)} y2={axisY} stroke="var(--red)" strokeWidth={1.6} strokeDasharray="5 4" />
          <text x={sx(DELETE_AT) - 6} y={laneY(0) + 4} textAnchor="end" className="k-svg-hand" style={{ fontSize: narrow ? 19.5 : 18.5, fill: 'var(--red)' }}>
            kubectl delete
          </text>
          <Rough shape={{ k: 'line', x1: x0, y1: axisY, x2: x1, y2: axisY }} seed={12820} stroke="var(--ink-2)" strokeWidth={1.3} />
          {[0, 10, 20, 30, 40, 50].map((t) => (
            <text key={t} x={sx(t)} y={axisY + 18} textAnchor="middle" className="k-svg-mono" style={{ fontSize: axisFont }}>
              {t} s
            </text>
          ))}
        </svg>
      </div>
    </div>
  )
}
