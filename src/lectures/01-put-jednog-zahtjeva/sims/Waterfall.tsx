/**
 * The waterfall of one request: one row per phase (DNS · TCP · TLS · HTTP), bars on a time axis that ends at the
 * request's total, growing with the stopwatch. Failed phases are red with ✗, a timeout is a hollow hatched bar,
 * the part spent inside the app is cross-hatched. Drawn at 1:1 (viewBox = measured width), so lettering is exact px.
 * Bars, axis and ticks are drawn with the kit's pen (roughjs, hatching −41°).
 */
import { useId } from 'react'
import { Rough, useWidth } from '../../../kit'
import { fmtMs, type Phase, type Trace } from '../model'
import styles from '../styles.module.css'

const KIND_COLOR: Record<Phase['kind'], string> = {
  dns: 'var(--pen)',
  tcp: 'var(--ink-2)',
  tls: 'var(--green)',
  http: 'var(--tray-ink)',
}

const KIND_NAME: Record<Phase['kind'], string> = { dns: 'DNS', tcp: 'TCP', tls: 'TLS', http: 'HTTP' }

/** A round axis end at or just above the value (1 · 1,2 · 1,5 · 2 · 2,5 · 3 · 4 · 5 · 6 · 8 × 10^n). */
function niceMax(v: number): number {
  if (v <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v - 1e-9) return m * p
  return 10 * p
}

export function Waterfall({ trace, nowMs, caption }: { trace: Trace; nowMs: number; caption?: string }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const width = Math.max(280, w ?? 560)
  const narrow = width < 460
  const labelW = narrow ? 50 : 64
  const rows = trace.phases
  // a timeout row reads "✗ 5,0 s · bez odgovora" on wide sheets; on narrow ones the hollow bar and the caption say it
  const hollowNote = !narrow && rows.some((r) => r.hollow)
  const valueW = narrow ? 104 : hollowNote ? 190 : 132
  const barX = labelW
  const barW = width - labelW - valueW - 8
  const rowH = 30
  const top = 8
  const axisMax = niceMax(trace.total)
  const x = (ms: number) => barX + (Math.min(ms, axisMax) / axisMax) * barW
  const height = top + Math.max(1, rows.length) * rowH + 30
  const axisY = height - 24
  const ticks = [0, axisMax / 2, axisMax]
  const running = nowMs < trace.total - 1e-6
  return (
    <div ref={ref} className={styles.waterfall}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label={`Vodopad zahtjeva: ${rows.map((r) => `${KIND_NAME[r.kind]} ${fmtMs(r.t1 - r.t0)}`).join(', ')}; ukupno ${fmtMs(trace.total)}.`}>
        {/* each bar is drawn once at full length with the pen and revealed by a clip that follows the stopwatch */}
        <defs>
          {rows.map((p, i) => (
            <clipPath key={i} id={`wf-c-${uid}-${i}`}>
              <rect x={0} y={0} width={Math.max(0, x(Math.min(p.t1, Math.max(p.t0, nowMs))) + 3)} height={height} />
            </clipPath>
          ))}
        </defs>
        {rows.map((p, i) => {
          const y = top + i * rowH
          const started = nowMs >= p.t0 - 1e-6
          const end = Math.min(p.t1, Math.max(p.t0, nowMs))
          const color = p.bad ? 'var(--red)' : KIND_COLOR[p.kind]
          const x0 = x(p.t0)
          const full = Math.max(1.5, x(p.t1) - x0)
          const doneRow = nowMs >= p.t1 - 1e-6
          const value = !started ? '' : `${fmtMs((doneRow ? p.t1 : end) - p.t0)}${!doneRow ? ' …' : p.hollow && hollowNote ? ' · bez odgovora' : ''}`
          return (
            <g key={i}>
              <text x={0} y={y + 19} className={styles.wfLabel} style={{ fill: started ? 'var(--ink)' : 'var(--ink-3)' }}>
                {KIND_NAME[p.kind]}
              </text>
              <Rough shape={{ k: 'line', x1: barX, y1: y + 14, x2: barX + barW, y2: y + 14 }} seed={9160 + i} strokeWidth={1} stroke="var(--ink-4)" dash="2 6" roughness={0.6} />
              {started && p.t1 > p.t0 && (
                <g clipPath={`url(#wf-c-${uid}-${i})`}>
                  {p.hollow ? (
                    <Rough shape={{ k: 'rect', x: x0, y: y + 5, w: full, h: 18 }} seed={9170 + i} strokeWidth={1.6} stroke={color} fillColor={color} hachureAngle={-41} hachureGap={7} fillWeight={1} dash="5 4" roughness={0.9} />
                  ) : (
                    <Rough shape={{ k: 'rect', x: x0, y: y + 5, w: full, h: 18 }} seed={9170 + i} strokeWidth={1.6} stroke={color} fillColor={color} hachureAngle={-41} hachureGap={4.5} fillWeight={1.2} roughness={0.9} />
                  )}
                  {p.server && (
                    <Rough
                      shape={{ k: 'rect', x: x(p.server[0]), y: y + 7, w: Math.max(1, x(p.server[1]) - x(p.server[0])), h: 14 }}
                      seed={9180 + i}
                      strokeWidth={1}
                      stroke="var(--ink-2)"
                      fillColor="var(--ink)"
                      fillStyle="cross-hatch"
                      hachureGap={4}
                      fillWeight={0.9}
                      roughness={0.8}
                    />
                  )}
                </g>
              )}
              {started && p.t1 <= p.t0 && <Rough shape={{ k: 'line', x1: x0, y1: y + 3, x2: x0, y2: y + 25 }} seed={9190 + i} strokeWidth={2.4} stroke={color} roughness={0.6} />}
              <text x={width} y={y + 19} textAnchor="end" className={styles.wfValue} style={{ fill: p.bad && doneRow ? 'var(--red)' : 'var(--ink-2)' }}>
                {p.bad && doneRow ? '✗ ' : ''}
                {value}
              </text>
            </g>
          )
        })}
        {/* axis */}
        <Rough shape={{ k: 'line', x1: barX, y1: axisY, x2: barX + barW, y2: axisY }} seed={9150} strokeWidth={1.3} stroke="var(--ink-3)" roughness={0.8} />
        {ticks.map((t, i) => (
          <g key={i}>
            <Rough shape={{ k: 'line', x1: x(t), y1: axisY - 4, x2: x(t), y2: axisY + 4 }} seed={9151 + i} strokeWidth={1.3} stroke="var(--ink-3)" roughness={0.6} />
            <text x={x(t)} y={height - 5} textAnchor={i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'} className={styles.wfTick}>
              {fmtMs(t)}
            </text>
          </g>
        ))}
        {running && nowMs > 0 && <line x1={x(nowMs)} x2={x(nowMs)} y1={top} y2={axisY} style={{ stroke: 'var(--pen)', strokeWidth: 1.4, strokeDasharray: '3 3' }} />}
      </svg>
      {caption && <p className={styles.wfCaption}>{caption}</p>}
    </div>
  )
}
