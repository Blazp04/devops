/**
 * „Crna rupa”: the same 12:03 crash replayed with five load-balancer settings (lib/blackhole.ts, E1 runs). Each row
 * shows the orders that fell on the floor before the load balancer noticed – one tray per lost order.
 */
import { useState } from 'react'
import { Check, Cross, Figure, TrayDefs, plural, useWidth } from '../../../kit'
import { blackHoleRows, type HoleRow } from '../lib/blackhole'
import { offsets } from '../lib/rack'

const TRAY = 'l05bh'

function sub(r: HoleRow): string {
  if (r.id === 'lc-passive') return 'S3 ispada već nakon prvog odbijanja'
  if (r.id === 'lc-retry') return `${plural(r.retried, ['narudžba ponovljena', 'narudžbe ponovljene', 'narudžbi ponovljeno'])} na S1 ili S2`
  // a share, not raw counts: how many orders happen to arrive in those 2 s differs from run to run
  const share = r.routed > 0 ? Math.round((100 * r.toS3) / r.routed) : 0
  return `S3 dobio ${share} % novih + ${r.inside} u obradi`
}

export function BlackHole() {
  const [rows] = useState(blackHoleRows)
  const [ref, width] = useWidth<HTMLDivElement>()
  const narrow = width !== null && width < 650
  const W = narrow ? 380 : 760
  /** right margin: the counts and „crna rupa!” stay inside the figure frame */
  const R = W - 10
  const trayW = 15
  const stripX = narrow ? 4 : 312
  const stripW = narrow ? 330 : 336
  const perRow = Math.floor(stripW / (trayW + 1))
  const rowH = (r: HoleRow) => {
    const lines = Math.max(1, Math.ceil(r.failed / perRow))
    return narrow ? 62 + lines * 13 + 14 : Math.max(66, 20 + lines * 13 + 20)
  }
  const heights = rows.map(rowH)
  const tops = offsets(heights, 8)
  const H = 8 + heights.reduce((a, b) => a + b, 0) + 4
  return (
    <Figure caption="Isti prosječni promet od 15 narudžbi/s i isti pad u 12:03:00 (preset Incident 12:03, seed 42), samo drukčiji load balancer. Provjera svake 2 s (sim), prag 2: redar S3 izbacuje u 12:03:02. Jedan prevrnuti pladanj = jedna izgubljena narudžba.">
      <div ref={ref} style={{ width: '100%' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Izgubljene narudžbe do otkrivanja pada: ${rows.map((r) => `${r.label} ${r.failed}`).join(', ')}.`}
          style={{ display: 'block', width: '100%', maxWidth: narrow ? 460 : undefined, margin: '0 auto', height: 'auto' }}
        >
          <TrayDefs id={TRAY} />
          {rows.map((r, i) => {
            const y = tops[i]
            const hole = r.id === 'lc'
            const sy = narrow ? y + 58 : y + 14
            return (
              <g key={r.id}>
                {i > 0 && <line x1={0} y1={y - 4} x2={W} y2={y - 4} style={{ stroke: 'var(--ink-4)', strokeWidth: 1, strokeDasharray: '3 5' }} />}
                <text x={0} y={y + 22} className="k-svg-display" style={{ fontSize: 17, fill: hole ? 'var(--red)' : 'var(--ink)' }}>
                  {r.label}
                </text>
                <text x={0} y={y + 46} className="k-svg-hand" style={{ fontSize: narrow ? 21 : 20, fill: 'var(--ink-2)' }}>
                  {sub(r)}
                </text>
                {/* lost orders = fallen trays (tilted), not trays in flight */}
                {Array.from({ length: r.failed }, (_, k) => {
                  const tx = stripX + (k % perRow) * (trayW + 1)
                  const ty = sy + Math.floor(k / perRow) * 13
                  return <use key={k} href={`#${TRAY}-tray`} x={tx} y={ty} width={trayW} height={10.5} transform={`rotate(${k % 2 ? 16 : -12} ${tx + trayW / 2} ${ty + 5})`} />
                })}
                <g transform={`translate(${R - (narrow ? 50 : 56)} ${y + 17})`}>{r.failed > 5 ? <Cross x={0} y={0} size={7} seed={6700 + i} /> : <Check x={0} y={0} size={7} seed={6710 + i} />}</g>
                <text x={R} y={y + 24} textAnchor="end" className="k-svg-mono" style={{ fontSize: 20, fontWeight: 700, fill: r.failed > 5 ? 'var(--red)' : 'var(--green)' }}>
                  {r.failed}
                </text>
                {hole && (
                  <text x={R} y={y + 48} textAnchor="end" className="k-svg-hand" style={{ fontSize: 21, fontWeight: 700, fill: 'var(--red)' }}>
                    crna rupa!
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>
    </Figure>
  )
}
