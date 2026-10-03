/**
 * Read replica lag (DeepDive): a write goes to the primary, an asynchronous copy reaches the replica `lag` ms later.
 * A read from the replica before that returns the old value – the user does not see their own write.
 */
import { useState } from 'react'
import { Arrow, Check, Cross, Cylinder, Slider, useWidth } from '../../../kit'

export function ReplicaLag() {
  const [lag, setLag] = useState(800)
  const [readAt, setReadAt] = useState(300)
  const [ref, width] = useWidth<HTMLDivElement>()
  const narrow = width !== null && width < 600
  const stale = readAt < lag
  const W = narrow ? 380 : 700
  const H = narrow ? 270 : 210
  const p = narrow ? { x: 20, y: 30 } : { x: 30, y: 40 }
  const r = narrow ? { x: 230, y: 30 } : { x: 480, y: 40 }
  // narrow: ~312 px on a phone (scale 0.82), so the lettering is one size up
  const mono = narrow ? 16 : 14
  const hand = narrow ? 22 : 20
  return (
    <div ref={ref} style={{ width: '100%', margin: '1em 0' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Pisanje ide u glavnu bazu, replika ga dobiva ${lag} ms kasnije. Čitanje s replike nakon ${readAt} ms vraća ${stale ? 'staru vrijednost: 2 ćevapa' : 'novu vrijednost: 3 ćevapa'}.`}
        style={{ display: 'block', width: '100%', maxWidth: narrow ? 460 : undefined, margin: '0 auto', height: 'auto' }}
      >
        <Cylinder x={p.x} y={p.y} w={130} h={96} seed={7701} />
        <text x={p.x + 65} y={p.y + 52} textAnchor="middle" className="k-svg-display" style={{ fontSize: narrow ? 16 : 15 }}>
          glavna baza
        </text>
        <text x={p.x + 65} y={p.y + 72} textAnchor="middle" className="k-svg-mono" style={{ fontSize: mono }}>
          ćevapi = 3
        </text>
        <Cylinder x={r.x} y={r.y} w={130} h={96} seed={7702} />
        <text x={r.x + 65} y={r.y + 52} textAnchor="middle" className="k-svg-display" style={{ fontSize: narrow ? 16 : 15 }}>
          replika
        </text>
        <text x={r.x + 65} y={r.y + 72} textAnchor="middle" className="k-svg-mono" style={{ fontSize: mono, fill: stale ? 'var(--red)' : 'var(--ink)' }}>
          ćevapi = {stale ? 2 : 3}
        </text>
        <Arrow pts={narrow ? [[p.x + 134, p.y + 40], [r.x - 6, r.y + 40]] : [[p.x + 140, p.y + 46], [r.x - 8, r.y + 46]]} stroke="var(--pen)" strokeWidth={1.8} dash="6 5" seed={7703} />
        <text x={(p.x + r.x + 130) / 2} y={p.y + (narrow ? 26 : 32)} textAnchor="middle" className="k-svg-hand" style={{ fontSize: hand, fill: 'var(--pen)' }}>
          kasni {lag} ms
        </text>
        {/* the read */}
        {narrow ? (
          <text x={10} y={180} className="k-svg-hand" style={{ fontSize: hand, fill: 'var(--ink-2)' }}>
            <tspan x={10}>Lana u narudžbu doda treći ćevap,</tspan>
            <tspan x={10} dy={25}>
              pa nakon {readAt} ms čita s replike:
            </tspan>
          </text>
        ) : (
          <text x={30} y={176} className="k-svg-hand" style={{ fontSize: 20, fill: 'var(--ink-2)' }}>
            Lana u narudžbu doda treći ćevap, pa nakon {readAt} ms čita s replike:
          </text>
        )}
        <g transform={`translate(${narrow ? 22 : 40} ${narrow ? 246 : 200})`}>{stale ? <Cross x={0} y={-5} size={7} seed={7704} /> : <Check x={0} y={-5} size={7} seed={7705} />}</g>
        <text x={narrow ? 38 : 56} y={narrow ? 246 : 200} className="k-svg-mono" style={{ fontSize: narrow ? 16 : 15, fontWeight: 700, fill: stale ? 'var(--red)' : 'var(--green)' }}>
          {stale ? (narrow ? 'vidi 2 ćevapa (staro!)' : 'vidi 2 ćevapa – svoje pisanje ne vidi') : 'vidi 3 ćevapa'}
        </text>
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 28px', marginTop: 10 }}>
        <div style={{ flex: '1 1 220px' }}>
          <Slider label="Kašnjenje replike" value={lag} min={0} max={2000} step={100} onChange={setLag} format={(v) => `${v} ms`} />
        </div>
        <div style={{ flex: '1 1 220px' }}>
          <Slider label="Čitanje nakon" value={readAt} min={0} max={2000} step={100} onChange={setReadAt} format={(v) => `${v} ms`} />
        </div>
      </div>
    </div>
  )
}
