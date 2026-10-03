import { useState } from 'react'
import { Diagram, Rough, Slider, useDiagramIds, useWidth } from '../../../kit'
import { cfsLatencyMs } from '../../../engines/cluster'
import styles from '../styles.module.css'

const PERIOD = 100

function Track({ y, label, periods, scale, x0, h, font, narrow }: { y: number; label: string; periods: { runMs: number; throttledMs: number }[]; scale: number; x0: number; h: number; font: { mono: number; hand: number }; narrow: boolean }) {
  const ids = useDiagramIds()
  const segs: { x: number; w: number; run: boolean; key: string }[] = []
  let t = 0
  for (let i = 0; i < periods.length; i++) {
    const p = periods[i]
    segs.push({ x: x0 + t * scale, w: p.runMs * scale, run: true, key: `r${i}` })
    t += p.runMs
    if (p.throttledMs > 0) {
      segs.push({ x: x0 + t * scale, w: p.throttledMs * scale, run: false, key: `t${i}` })
      t += p.throttledMs
    }
  }
  return (
    <g>
      <text x={narrow ? x0 : x0 - 10} y={narrow ? y - 8 : y + h - 6} textAnchor={narrow ? 'start' : 'end'} className={styles.svgLabel} style={{ fontSize: font.mono + 1 }}>
        {label}
      </text>
      {segs.map((s) => (
        <g key={s.key}>
          <rect x={s.x} y={y} width={Math.max(0.5, s.w)} height={h} style={{ fill: s.run ? 'var(--hl-green)' : ids ? `url(${ids.hatchRed})` : 'none', stroke: s.run ? 'var(--green)' : 'var(--red)', strokeWidth: 1.2 }} />
          {s.w >= 34 && (
            <text x={s.x + s.w / 2} y={y + h / 2 + 5} textAnchor="middle" className={styles.svgMono} style={{ fontSize: font.mono, fill: s.run ? 'var(--ink)' : 'var(--red)', paintOrder: 'stroke', stroke: 'var(--paper)', strokeWidth: 3 }}>
              {s.run ? `${Math.round(s.w / scale)}` : `čeka ${Math.round(s.w / scale)}`}
            </text>
          )}
        </g>
      ))}
    </g>
  )
}

/**
 * Scene 4 (CPU): CFS bandwidth control – quota = limit × 100 ms per 100 ms period (engine: cfsLatencyMs).
 * A single-threaded request needs `work` ms of CPU; with a limit it runs in slices and waits for the next period.
 */
export function CfsLab() {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [limitM, setLimitM] = useState(200)
  const [workMs, setWorkMs] = useState(50)
  // wide tick labels are 13,5 units in a 760 viewBox: ≥ 12 px on screen only from 700 px up
  const narrow = width !== null && width < 700
  const W = narrow ? 380 : 760
  const x0 = narrow ? 12 : 120
  const x1 = W - 14
  const r = cfsLatencyMs({ limitM, workMs })
  const free = cfsLatencyMs({ limitM: 1000, workMs })
  const span = Math.max(300, Math.ceil(r.latencyMs / PERIOD) * PERIOD)
  const scale = (x1 - x0) / span
  const font = narrow ? { mono: 14.5, hand: 21 } : { mono: 14, hand: 20 }
  const yA = narrow ? 64 : 46
  const yB = narrow ? 150 : 112
  const H = narrow ? 230 : 182
  const ticks = Array.from({ length: span / PERIOD + 1 }, (_, i) => i * PERIOD)
  return (
    <div ref={ref}>
      <div className={narrow ? styles.stageNarrow : undefined}>
        <Diagram width={W} height={H} label={`Zahtjev treba ${workMs} ms procesora. S limitom ${limitM}m kontejner smije raditi ${Math.round((limitM / 1000) * PERIOD)} ms u svakih 100 ms, pa odgovor stiže za ${Math.round(r.latencyMs)} ms; bez limita za ${Math.round(free.latencyMs)} ms.`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x0 + t * scale} y1={yA - 20} x2={x0 + t * scale} y2={yB + 40} style={{ stroke: 'var(--ink-3)', strokeWidth: 1, strokeDasharray: '2 4' }} />
              <text x={x0 + t * scale} y={yA - 26} textAnchor={t === span ? 'end' : t === 0 && narrow ? 'start' : 'middle'} className={styles.svgMono} style={{ fontSize: font.mono - 0.5, fill: 'var(--ink-2)' }}>
                {t} ms
              </text>
            </g>
          ))}
          <Track y={yA} label={`limit ${limitM}m`} periods={r.periods} scale={scale} x0={x0} h={30} font={font} narrow={narrow} />
          <Track y={yB} label="bez limita" periods={free.periods} scale={scale} x0={x0} h={30} font={font} narrow={narrow} />
          <Rough shape={{ k: 'line', x1: x0 + r.latencyMs * scale, y1: yA - 6, x2: x0 + r.latencyMs * scale, y2: yA + 38 }} seed={1750} stroke="var(--red)" strokeWidth={2.2} />
          <text x={Math.min(x1, x0 + r.latencyMs * scale + 6)} y={yA + 56} textAnchor={x0 + r.latencyMs * scale > x1 - 120 ? 'end' : 'start'} className={styles.svgHand} style={{ fontSize: font.hand, fill: 'var(--red)' }}>
            odgovor nakon {Math.round(r.latencyMs)} ms
          </text>
          <text x={Math.min(x1, x0 + free.latencyMs * scale + 6)} y={yB + 56} className={styles.svgHand} style={{ fontSize: font.hand, fill: 'var(--green)' }}>
            {Math.round(free.latencyMs)} ms
          </text>
        </Diagram>
      </div>
      <div className={styles.cfsControls}>
        <Slider label="CPU limit" value={limitM} min={100} max={1000} step={50} onChange={setLimitM} format={(v) => `${v}m = ${Math.round(v / 10)} ms u 100 ms`} />
        <Slider label="posao jednog zahtjeva" value={workMs} min={10} max={200} step={10} onChange={setWorkMs} format={(v) => `${v} ms CPU-a`} />
      </div>
      <p className={styles.cfsResult}>
        {workMs} ms posla → odgovor za {Math.round(r.latencyMs)} ms ({Math.round(r.throttledMs)} ms čekanja).{' '}
        {r.throttledMs > 0 ? 'Kontejner nije ubijen ni ponovno pokrenut, samo je prigušen.' : 'Kvota je dovoljna: nema prigušivanja.'}
      </p>
    </div>
  )
}
