import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Figure, Rough, Segmented, fmt, useWidth } from '../../../kit'
import { jitterRows } from '../poisonLab'

/**
 * Full jitter: attempt n waits random(0, min(cap, base·2ⁿ)) – base 0,5 s, cap 30 s, the engine's own values.
 * Each dot is one of 14 consumers retrying; „bez raspršivanja” puts them all at the end of the window.
 */
export function BackoffChart() {
  const reduce = !!useReducedMotion()
  const [mode, setMode] = useState<'jitter' | 'plain'>('jitter')
  const rows = useMemo(() => jitterRows(), [])
  const [ref, w] = useWidth<HTMLDivElement>()
  const narrow = w !== null && w < 591
  const W = narrow ? 330 : 640
  const left = narrow ? 70 : 150
  const right = W - 14
  const top = 34
  const rowH = 34
  const H = top + rows.length * rowH + 34
  const maxS = 32
  const xOf = (sec: number) => left + (sec / maxS) * (right - left)
  const ticks = narrow ? [0, 8, 16, 24, 32] : [0, 4, 8, 12, 16, 20, 24, 28, 32]
  return (
    <Figure caption="Svaka točka je jedan potrošač koji ponavlja neuspjelu poruku. S punim raspršenim razmakom ponovni pokušaji padaju bilo gdje u prozoru, pa ne udaraju u isti trenutak; bez raspršivanja svi pokušaju istodobno.">
      <div ref={ref} style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
          <Segmented
            label="Razmak"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'jitter', label: 'potpuno nasumično (full jitter)' },
              { value: 'plain', label: 'bez raspršivanja' },
            ]}
          />
        </div>
        <div style={{ maxWidth: narrow ? 460 : undefined, margin: '0 auto' }}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Prozori čekanja za pokušaje 1 do 6: ${rows.map((r) => `${fmt.num(r.windowS, 1)} s`).join(', ')}. ${mode === 'jitter' ? 'Ponovni pokušaji su raspršeni po prozoru.' : 'Svi ponovni pokušaji su na kraju prozora, u istom trenutku.'}`} style={{ display: 'block', width: '100%', height: 'auto' }}>
            <text x={left} y={18} className="k-svg-hand" style={{ fontSize: 19, fill: 'var(--ink-2)' }}>
              {narrow ? 'čekanje = nasumično u prozoru' : 'čekanje = nasumično između 0 i min(30 s, 0,5 s · 2ⁿ)'}
            </text>
            {rows.map((r, i) => {
              const y = top + i * rowH
              return (
                <g key={r.attempt}>
                  <text x={left - 10} y={y + 21} textAnchor="end" className="k-svg-mono" style={{ fontSize: 13, fill: 'var(--ink-2)' }}>
                    {narrow ? `${r.attempt}. ${fmt.num(r.windowS, 0)} s` : `pokušaj ${r.attempt} · ${fmt.num(r.windowS, r.windowS < 1 ? 1 : 0)} s`}
                  </text>
                  <Rough shape={{ k: 'rect', x: left, y: y + 6, w: xOf(r.windowS) - left, h: 22 }} seed={9800 + i} stroke="var(--pen)" strokeWidth={1.2} fillColor="var(--hl-blue-ink)" hachureGap={5} fillWeight={0.6} />
                  {r.samples.map((v, j) => (
                    <motion.circle
                      key={j}
                      r={3.4}
                      cy={y + 17 + ((j % 3) - 1) * 5}
                      initial={false}
                      animate={{ cx: xOf(mode === 'jitter' ? v : r.windowS) - (mode === 'plain' ? 2 : 0) }}
                      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 140, damping: 20 }}
                      style={{ fill: 'var(--ink)' }}
                    />
                  ))}
                  {r.windowS >= 30 && (
                    <text x={xOf(r.windowS) - 4} y={y + 21} textAnchor="end" className="k-svg-mono" style={{ fontSize: 13, fill: 'var(--pen)', fontWeight: 600 }}>
                      strop
                    </text>
                  )}
                </g>
              )
            })}
            <line x1={left} x2={right} y1={top + rows.length * rowH + 4} y2={top + rows.length * rowH + 4} style={{ stroke: 'var(--ink-3)', strokeWidth: 1 }} />
            {ticks.map((t) => (
              <text key={t} x={xOf(t)} y={top + rows.length * rowH + 22} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 13, fill: 'var(--ink-3)' }}>
                {t} s
              </text>
            ))}
          </svg>
        </div>
      </div>
    </Figure>
  )
}
