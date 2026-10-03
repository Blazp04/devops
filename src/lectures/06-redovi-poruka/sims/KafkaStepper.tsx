import { useMemo } from 'react'
import { MiniFace, Rough, Stepper, stepColor, useWidth } from '../../../kit'
import { kafkaStepperScript, type KafkaStep } from '../../../engines/queue'

/** Kafka as a log: partitions with offsets, the committed offset and lag per partition, consumers in a classic group. */
function LogFrame({ step, snap, narrow }: { step: number; snap: KafkaStep; narrow: boolean }) {
  const P = snap.end.length
  const W = narrow ? 330 : 680
  const cell = narrow ? 30 : 40
  const x0 = narrow ? 8 : 120
  const rowH = narrow ? 92 : 70
  const top = 34
  const consumersTop = narrow ? top + P * rowH + 10 : top
  const cx = narrow ? 8 : 470
  const H = narrow ? consumersTop + snap.assignment.length * 30 + 10 : Math.max(top + P * rowH + 10, top + snap.assignment.length * 40 + 20)
  const color = stepColor(step)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${snap.title}. ${snap.body}`} style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}>
      <text x={x0} y={20} className="k-svg-hand" style={{ fontSize: 19, fill: 'var(--ink-2)' }}>
        tema (topic) „narudzbe” · broj = ključ
      </text>
      {snap.end.map((end, p) => {
        const y = top + p * rowH + (narrow ? 22 : 0)
        const recs = snap.records.filter((r) => r.partition === p).sort((a, b) => a.offset - b.offset)
        const committed = snap.committed[p]
        const an = snap.analyticsCommitted[p]
        const owner = snap.assignment.findIndex((parts) => parts.includes(p))
        return (
          <g key={p}>
            <text x={narrow ? x0 : x0 - 10} y={narrow ? y - 6 : y + 26} textAnchor={narrow ? 'start' : 'end'} className="k-svg-mono" style={{ fontSize: 13, fill: 'var(--ink-2)' }}>
              {narrow ? `particija ${p} · lag ${snap.lag[p]}` : `particija ${p}`}
            </text>
            {recs.map((r) => {
              const x = x0 + r.offset * cell
              const hot = r.key === 'korisnik-1'
              const done = r.offset < committed
              return (
                <g key={`${p}-${r.offset}`}>
                  <Rough shape={{ k: 'rect', x, y: y + 6, w: cell - 4, h: 30 }} seed={9500 + p * 20 + r.offset} strokeWidth={1.4} stroke={done ? 'var(--ink-3)' : 'var(--ink)'} fillColor={hot ? 'var(--hl-orange-ink)' : 'var(--paper)'} fillStyle={hot ? 'hachure' : 'solid'} hachureGap={5} fillWeight={0.6} />
                  <text x={x + (cell - 4) / 2} y={y + 26} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 13, fontWeight: 600, fill: done ? 'var(--ink-3)' : 'var(--ink)' }}>
                    {r.key.replace('korisnik-', '')}
                  </text>
                </g>
              )
            })}
            {/* committed offset (blue) under the log, analytics (green) above it */}
            <g>
              <Rough shape={{ k: 'lin', pts: [[x0 + committed * cell - 2, y + 40], [x0 + committed * cell - 2, y + 50]] }} seed={9600 + p} stroke="var(--pen)" strokeWidth={2.2} roughness={0.4} />
              <text x={x0 + committed * cell + 2} y={y + 56} className="k-svg-mono" style={{ fontSize: 13, fill: 'var(--pen)', fontWeight: 600 }}>
                {narrow ? `commit ${committed}` : `commit ${committed} · lag ${snap.lag[p]}`}
              </text>
              {an > 0 && (
                <g>
                  {/* the analytics group's offset: a little flag above the log (shape + label, not colour alone) */}
                  <Rough shape={{ k: 'lin', pts: [[x0 + an * cell - 2, y + 2], [x0 + an * cell - 2, y - 8]] }} seed={9610 + p} stroke="var(--green)" strokeWidth={2.2} roughness={0.4} />
                  <Rough shape={{ k: 'poly', pts: [[x0 + an * cell - 2, y - 8], [x0 + an * cell + 7, y - 5], [x0 + an * cell - 2, y - 2]] }} seed={9615 + p} stroke="var(--green)" strokeWidth={1.4} fillColor="var(--green)" fillStyle="solid" roughness={0.4} />
                  {/* narrow: only where it clears the „particija · lag” label on the same line (the caption names the flag) */}
                  {(!narrow || x0 + an * cell + 10 >= 165) && (
                    <text x={x0 + an * cell + 10} y={narrow ? y - 2 : y + 1} className="k-svg-mono" style={{ fontSize: 13, fill: 'var(--green)', fontWeight: 600 }}>
                      analitika
                    </text>
                  )}
                </g>
              )}
            </g>
            {owner >= 0 && !narrow && <Rough shape={{ k: 'line', x1: x0 + end * cell + 6, y1: y + 20, x2: cx - 6, y2: top + owner * 40 + 22 }} seed={9620 + p} stroke={color} strokeWidth={1.3} dash="4 5" />}
          </g>
        )
      })}
      {snap.assignment.map((parts, i) => {
        const y = narrow ? consumersTop + i * 30 : top + i * 40
        const idle = parts.length === 0
        return (
          <g key={i}>
            <MiniFace cx={cx + 12} cy={y + 18} r={10} mood={idle ? 'calm' : 'busy'} seed={9630 + i} />
            <text x={cx + 30} y={y + 23} className="k-svg-mono" style={{ fontSize: 13, fill: idle ? 'var(--red)' : 'var(--ink)' }}>
              {snap.consumerLabels[i]}: {idle ? 'nema particije – čeka' : `P${parts.join(', P')}`}
            </text>
          </g>
        )
      })}
      {snap.reprocessed > 0 && (
        <text x={narrow ? x0 : cx} y={narrow ? H - 4 : top + snap.assignment.length * 40 + 24} className="k-svg-hand" style={{ fontSize: 19, fill: 'var(--red)' }}>
          {snap.reprocessed} zapisa ponovno ↻
        </text>
      )}
    </svg>
  )
}

/** DeepDive „Log i Kafka”: six snapshots from E2's kafkaStepperScript (partitions, offsets, lag, replay, idle consumers). */
export function KafkaStepper() {
  const steps = useMemo(() => kafkaStepperScript(), [])
  const [ref, w] = useWidth<HTMLDivElement>()
  const narrow = w !== null && w < 628
  return (
    <Stepper title="Log: particije, pomaci i zaostatak" steps={steps.map((s) => ({ title: s.title, body: s.body }))} autoPlay={0} wide={false} caption="Šrafirano: vrući ključ „korisnik-1”. „commit N”: spremljeni pomak grupe kuhinje. Zastavica iznad loga („analitika”): pomak druge grupe, koja isti log čita neovisno.">
      {(step) => (
        <div ref={ref} style={{ width: '100%' }}>
          <div style={narrow ? { maxWidth: 460, margin: '0 auto' } : undefined}>
            <LogFrame step={step} snap={steps[step]} narrow={narrow} />
          </div>
        </div>
      )}
    </Stepper>
  )
}
