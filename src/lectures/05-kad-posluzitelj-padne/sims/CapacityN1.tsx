/**
 * N+1: the capacity of the servers that survive a failure, laid end to end like boxes on a shelf, against the
 * lunch-time traffic. Capacities from the engine (capacityOf, API workload: 5 · 10 · 20 zahtjeva/s), check nPlusOne.
 */
import { useState } from 'react'
import { Cross, Figure, Rough, Segmented, Slider, Stat, StatRow, fmt, useWidth } from '../../../kit'
import { N_PLUS_ONE_MAX_UTILISATION, capacityOf, defaultRack, nPlusOne } from '../../../engines/traffic'
import { offsets } from '../lib/rack'

const RACK = defaultRack().map((v) => ({ id: v.id, name: v.name, label: v.label ?? '', cap: capacityOf(v.vcpu, v.ramGB, 'api').cap }))
type Who = 'none' | 's1' | 's2' | 's3'
const WHO: { value: Who; label: string }[] = [
  { value: 'none', label: 'nijedan' },
  { value: 's1', label: 'S1' },
  { value: 's2', label: 'S2' },
  { value: 's3', label: 'S3' },
]
const MAX = 40

export function CapacityN1() {
  const [down, setDown] = useState<Who>('s3')
  const [lambda, setLambda] = useState(15)
  const [ref, width] = useWidth<HTMLDivElement>()
  const narrow = width !== null && width < 655
  const W = narrow ? 380 : 760
  const x0 = 8
  const x1 = W - 8
  const x = (v: number) => x0 + (v / MAX) * (x1 - x0)
  // narrow: ~320 px on a phone, so the lettering is one size up
  const mono = narrow ? 15 : 14
  const hand = narrow ? 21 : 20
  const survivors = RACK.filter((r) => r.id !== down)
  const failed = RACK.find((r) => r.id === down)
  const order = failed ? [...survivors, failed] : survivors
  const surv = survivors.reduce((a, r) => a + r.cap, 0)
  const load = surv > 0 ? lambda / surv : Infinity
  const n1 = nPlusOne(
    RACK.map((r) => r.cap),
    lambda,
  )
  const boxY = 62
  const boxH = 58
  const from = offsets(order.map((r) => r.cap))
  const boxes = order.map((r, i) => ({ ...r, from: from[i], dead: r.id === down }))
  return (
    <Figure caption="Kapacitet poslužitelja (API zahtjev: 200 ms procesora, 300 ms baze) složen kao kutije na polici. Ako pad ostavi preživjele na 100 %, svaki mali nalet puni redove – a do 80 % ostaje rezerva.">
      <div ref={ref} style={{ width: '100%' }}>
        <svg
          viewBox={`0 0 ${W} 168`}
          role="img"
          aria-label={`Kapacitet: S1 5, S2 10, S3 20 zahtjeva u sekundi. ${failed ? `${failed.name} je pao, preživjeli mogu ${surv}` : 'Svi rade, ukupno 35'} zahtjeva u sekundi, a promet je ${lambda}: opterećenje ${Number.isFinite(load) ? fmt.pct(load) : 'beskonačno'}.`}
          style={{ display: 'block', width: '100%', maxWidth: narrow ? 460 : undefined, margin: '0 auto', height: 'auto', overflow: 'visible' }}
        >
          {boxes.map((b, i) => (
            <g key={b.id}>
              <Rough
                shape={{ k: 'rect', x: x(b.from) + 2, y: boxY, w: x(b.from + b.cap) - x(b.from) - 4, h: boxH }}
                seed={6800 + i * 3 + (b.dead ? 1 : 0)}
                strokeWidth={1.8}
                stroke={b.dead ? 'var(--red)' : 'var(--ink)'}
                fillColor={b.dead ? 'var(--red)' : 'var(--hl-green-ink)'}
                hachureGap={b.dead ? 10 : 6}
                fillWeight={b.dead ? 1 : 1.2}
                dash={b.dead ? '5 5' : undefined}
              />
              <text x={(x(b.from) + x(b.from + b.cap)) / 2} y={boxY + 26} textAnchor="middle" className="k-svg-display" style={{ fontSize: 16, fill: b.dead ? 'var(--red)' : 'var(--ink)' }}>
                {b.name}
              </text>
              <text x={(x(b.from) + x(b.from + b.cap)) / 2} y={boxY + 46} textAnchor="middle" className="k-svg-mono" style={{ fontSize: mono }}>
                {b.dead ? 'pao' : `${b.cap}/s`}
              </text>
              {b.dead && (
                <g transform={`translate(${x(b.from + b.cap) - 16} ${boxY + 14})`}>
                  <Cross x={0} y={0} size={8} seed={6820} />
                </g>
              )}
            </g>
          ))}
          {/* what the survivors can carry, and the 80 % headroom line */}
          {surv > 0 && (
            <>
              <Rough shape={{ k: 'lin', pts: [[x(0) + 2, boxY + boxH + 8], [x(0) + 2, boxY + boxH + 14], [x(surv) - 2, boxY + boxH + 14], [x(surv) - 2, boxY + boxH + 8]] }} seed={6830} strokeWidth={1.4} stroke="var(--ink-2)" />
              <text x={x(surv / 2)} y={boxY + boxH + 34} textAnchor="middle" className="k-svg-hand" style={{ fontSize: hand, fill: 'var(--ink-2)' }}>
                {failed ? 'preživjeli' : 'svi zajedno'}: {surv}/s
              </text>
              <Rough shape={{ k: 'line', x1: x(surv * N_PLUS_ONE_MAX_UTILISATION), y1: boxY - 6, x2: x(surv * N_PLUS_ONE_MAX_UTILISATION), y2: boxY + boxH + 6 }} seed={6831} strokeWidth={1.6} stroke="var(--green)" dash="3 4" />
              <text x={x(surv * N_PLUS_ONE_MAX_UTILISATION) - 4} y={boxY - 6} textAnchor="end" className="k-svg-mono" style={{ fontSize: mono, fill: 'var(--green)' }}>
                80 %
              </text>
            </>
          )}
          {/* lunch-time traffic */}
          <Rough shape={{ k: 'line', x1: x(lambda), y1: boxY - 22, x2: x(lambda), y2: boxY + boxH + 4 }} seed={6832} strokeWidth={2.4} stroke="var(--tray-ink)" />
          <text x={x(lambda)} y={boxY - 28} textAnchor={x(lambda) > W - 90 ? 'end' : x(lambda) < 90 ? 'start' : 'middle'} className="k-svg-hand" style={{ fontSize: 21, fontWeight: 700, fill: 'var(--tray-ink)' }}>
            promet: {lambda}/s
          </text>
        </svg>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 28px', alignItems: 'end', marginTop: 14 }}>
        <div style={{ flex: '1 1 220px' }}>
          <Segmented label="Koji poslužitelj padne?" value={down} options={WHO} onChange={setDown} size="sm" />
        </div>
        <div style={{ flex: '1 1 240px' }}>
          <Slider label="Promet u podne" value={lambda} min={5} max={35} onChange={setLambda} format={(v) => `${v} zahtjeva/s`} />
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <StatRow>
          <Stat label="opterećenje preživjelih" value={Number.isFinite(load) ? fmt.pct(load) : '–'} tone={load >= 1 ? 'bad' : load > N_PLUS_ONE_MAX_UTILISATION ? 'warn' : 'ok'} sub={load >= 1 ? 'redovi rastu bez kraja' : load > N_PLUS_ONE_MAX_UTILISATION ? 'na rubu: bez rezerve za nalet' : 'ima rezerve'} />
          <Stat label="N+1 za ovaj promet" value={n1.ok ? 'da' : 'ne'} tone={n1.ok ? 'ok' : 'bad'} sub={`bez najvećeg: ${fmt.pct(n1.utilisationAfterFailure)} (cilj ≤ 80 %)`} />
        </StatRow>
      </div>
    </Figure>
  )
}
