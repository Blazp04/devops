/**
 * Scene 6 „Rezerva, latencija i trošak”: five configurations through the same Ćevap-petak burst (E3 engine,
 * seed 42), plotted as average €/h (illustrative 0,10 € per node-hour) against the worst p95 of the burst
 * (log scale). Computed once, when the plot first scrolls into view.
 */
import { DLabel, Diagram, Rough, useOnScreen, useWidth } from '../../../kit'
import { tradeoffPoints, type TradePoint } from '../lib/story'
import { eur, latency } from '../lib/format'
import styles from '../styles.module.css'

const WIDE_MIN = 680
const Y_MIN = 100
const Y_MAX = 20000

export function TradeoffPlot() {
  const [seen, visible] = useOnScreen<HTMLDivElement>(0.05, true)
  const [ref, width] = useWidth<HTMLDivElement>()
  const pts = visible ? tradeoffPoints() : null
  const wide = width !== null && width >= WIDE_MIN
  return (
    <div ref={seen}>
      <div ref={ref} className={styles.stepFig}>
        {pts ? (
          <div className={wide ? undefined : styles.narrowFig}>
            <Plot pts={pts} wide={wide} />
          </div>
        ) : (
          <div className={styles.plotWait}>Računam pet naleta…</div>
        )}
      </div>
    </div>
  )
}

function Plot({ pts, wide }: { pts: TradePoint[]; wide: boolean }) {
  const W = wide ? 720 : 340
  const H = wide ? 320 : 420
  const L = wide ? 64 : 52
  const R = W - (wide ? 30 : 16)
  // narrow: the axis title gets its own band above the plot (the „2 fiksno” point sits near the top)
  const T = wide ? 24 : 48
  const B = H - (wide ? 52 : 70)
  const xMax = Math.max(0.6, ...pts.map((p) => p.eurPerH)) * 1.1
  const x = (e: number) => L + (e / xMax) * (R - L)
  const y = (ms: number) => B - ((Math.log10(Math.min(Y_MAX, Math.max(Y_MIN, ms))) - Math.log10(Y_MIN)) / (Math.log10(Y_MAX) - Math.log10(Y_MIN))) * (B - T)
  const xTicks = [0, 0.2, 0.4, 0.6].filter((t) => t <= xMax)
  const label = `Pet postavki: ${pts.map((p) => `${p.label}: ${eur(p.eurPerH)}/h, najgori p95 ${latency(p.worstP95)}`).join('; ')}.`
  return (
    <Diagram width={W} height={H} label={label}>
      <Rough shape={{ k: 'line', x1: L, y1: B, x2: R, y2: B }} seed={2101} strokeWidth={1.5} />
      <Rough shape={{ k: 'line', x1: L, y1: B, x2: L, y2: T }} seed={2102} strokeWidth={1.5} />
      {[100, 300, 1000, 5000, 15000].map((ms) => (
        <DLabel key={ms} x={L - 8} y={y(ms) + 5} anchor="end" text={latency(ms)} mono size={12} />
      ))}
      {xTicks.map((t) => (
        <DLabel key={t} x={x(t)} y={B + 22} text={eur(t)} mono size={12} />
      ))}
      {wide ? (
        <DLabel x={R} y={B + 44} anchor="end" text="prosječno €/h kroz 12 minuta (zamišljeno: 0,10 € po čvoru na sat)" size={13} />
      ) : (
        <g>
          <DLabel x={R} y={B + 44} anchor="end" text="prosječno €/h kroz 12 minuta" size={12} />
          <DLabel x={R} y={B + 64} anchor="end" text="(zamišljeno: 0,10 € po čvoru na sat)" size={12} />
        </g>
      )}
      <DLabel x={L + 6} y={wide ? T - 6 : 18} anchor="start" text="najgori p95 u naletu" size={13} />
      {/* the goal */}
      <Rough shape={{ k: 'line', x1: L, y1: y(300), x2: R, y2: y(300) }} seed={2103} stroke="var(--red)" strokeWidth={1.4} dash="7 5" />
      <DLabel x={L + 8} y={y(300) - 8} anchor="start" text="cilj 300 ms" tone="bad" size={13} />
      {pts.map((p, i) => {
        const cx = x(p.eurPerH)
        const cy = y(p.worstP95)
        const ok = p.worstP95 < 300
        const right = cx < (L + R) / 2
        const dy = p.id === 'fixed2' || p.id === 'min4' ? -14 : 24
        return (
          <g key={p.id}>
            <Rough shape={{ k: 'ellipse', cx, cy, w: 13, h: 13 }} seed={2110 + i} stroke={ok ? 'var(--green)' : 'var(--red)'} strokeWidth={2} fillColor={ok ? 'var(--green)' : 'var(--red)'} fillStyle="solid" />
            <DLabel x={cx + (right ? 12 : -12)} y={cy + dy} anchor={right ? 'start' : 'end'} text={wide ? p.label : p.short} size={wide ? 13 : 12} tone={ok ? 'ok' : 'bad'} />
          </g>
        )
      })}
    </Diagram>
  )
}
