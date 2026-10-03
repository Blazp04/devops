import { useState } from 'react'
import { Cross, Diagram, PodShape, Rough, Segmented, useDiagramIds, useWidth } from '../../../kit'
import { effectiveRequests, nodeView, type ClusterState } from '../../../engines/cluster'
import { incidentSnapshot } from '../lib/model'
import styles from '../styles.module.css'

type Lens = 'nadzor' | 'rasporedivac' | 'jezgra'

const LENSES: { value: Lens; label: string; title: string }[] = [
  { value: 'nadzor', label: 'nadzor', title: 'stvarna potrošnja (kubectl top, grafovi)' },
  { value: 'rasporedivac', label: 'raspoređivač', title: 'zbroj requests' },
  { value: 'jezgra', label: 'limits', title: 'zbroj limits – samo za usporedbu; jezgra OS-a provodi svaki limit posebno' },
]

interface Geo {
  W: number
  H: number
  narrow: boolean
  rowY: (i: number) => number
  barX: number
  barW: number
  nameX: number
  font: { mono: number; hand: number; name: number }
  fragY: number
}

function geoFor(width: number | null): Geo {
  // wide lettering is 14 units in a 760 viewBox: ≥ 12 px on screen only from 700 px up
  if (width !== null && width < 700)
    return { W: 380, H: 430, narrow: true, rowY: (i) => 44 + i * 96, barX: 12, barW: 356, nameX: 12, font: { mono: 14.5, hand: 21, name: 16 }, fragY: 356 }
  return { W: 760, H: 330, narrow: false, rowY: (i) => 36 + i * 80, barX: 120, barW: 470, nameX: 14, font: { mono: 14, hand: 20, name: 16 }, fragY: 286 }
}

function NodeRow({ s, i, g, lens }: { s: ClusterState; i: number; g: Geo; lens: Lens }) {
  const ids = useDiagramIds()
  const n = s.nodes[i]
  const v = nodeView(s, n)
  const y = g.rowY(i)
  const sc = g.barW / v.allocatable.cpuM
  const blocks: { key: string; x: number; w: number; system: boolean }[] = []
  let acc = g.barX
  const pods = s.pods.filter((p) => p.nodeName === n.name && p.phase !== 'Failed')
  for (const b of [{ key: 'ds', m: n.daemonSet.cpuM, system: true }, ...pods.map((p) => ({ key: p.id, m: effectiveRequests(p.spec).cpuM, system: false }))]) {
    const w = Math.min(g.barX + g.barW - acc, b.m * sc)
    blocks.push({ key: b.key, x: acc, w, system: b.system })
    acc += w
  }
  const h = 22
  const dimReq = lens !== 'rasporedivac' ? 0.28 : 1
  const dimUse = lens !== 'nadzor' ? 0.3 : 1
  const limFrac = v.limits.cpuM / v.allocatable.cpuM
  const free = v.allocatable.cpuM - v.requested.cpuM
  const pct = (x: number) => `${Math.round(x * 100)} %`
  const labelY = g.narrow ? y - 10 : y + 16
  const reading =
    lens === 'nadzor' ? `troši ${pct(v.used.cpuM / v.allocatable.cpuM)}` : lens === 'rasporedivac' ? `rez. ${pct(v.requested.cpuM / v.allocatable.cpuM)} · slobodno ${free}m` : `Σ limits ${v.limits.unboundedCpu ? (g.narrow ? '∞ (netko nema limit)' : '∞') : pct(limFrac)}`
  return (
    <g>
      <text x={g.nameX} y={labelY} className={styles.svgName} style={{ fontSize: g.font.name }}>
        {n.name}
      </text>
      <g style={{ opacity: dimReq }}>
        {blocks.map((b) => (
          <g key={b.key}>
            <rect x={b.x} y={y} width={Math.max(0, b.w)} height={h} style={{ fill: ids ? `url(${b.system ? ids.hatch : ids.hatchV1})` : 'none' }} />
            <line x1={b.x + b.w} y1={y} x2={b.x + b.w} y2={y + h} style={{ stroke: 'var(--ink-2)', strokeWidth: 1 }} />
          </g>
        ))}
      </g>
      <rect x={g.barX} y={y + h + 4} width={Math.max(0.001, Math.min(g.barW, v.used.cpuM * sc))} height={7} rx={2} style={{ fill: 'var(--food)', opacity: dimUse }} />
      <Rough shape={{ k: 'rect', x: g.barX, y, w: g.barW, h }} seed={1740 + i} stroke="var(--ink)" strokeWidth={1.5} roughness={0.7} />
      {lens === 'jezgra' && !v.limits.unboundedCpu && (
        <line x1={g.barX + Math.min(1, limFrac) * g.barW} y1={y - 6} x2={g.barX + Math.min(1, limFrac) * g.barW} y2={y + h + 12} style={{ stroke: 'var(--red)', strokeWidth: 2.2, strokeDasharray: '4 3' }} />
      )}
      {lens === 'jezgra' && v.limits.unboundedCpu && (
        <text x={g.barX + g.barW - 4} y={y + h - 4} textAnchor="end" className={styles.svgHand} style={{ fontSize: g.font.hand, fill: 'var(--red)' }}>
          ∞ →
        </text>
      )}
      <text x={g.narrow ? g.barX : g.barX + g.barW + 12} y={g.narrow ? y + h + 30 : y + 16} className={styles.svgMono} style={{ fontSize: g.font.mono, fill: lens === 'nadzor' ? 'var(--ink)' : lens === 'rasporedivac' ? 'var(--pen)' : 'var(--red)' }}>
        {g.narrow ? reading : reading.split(' · ')[0]}
      </text>
      {!g.narrow && lens === 'rasporedivac' && (
        <text x={g.barX + g.barW + 12} y={y + 36} className={styles.svgMono} style={{ fontSize: g.font.mono, fill: 'var(--ink-2)' }}>
          slobodno {free}m
        </text>
      )}
    </g>
  )
}

/** Scene 3 „30 % CPU-a, a Pending”: the incident cluster seen by three readers, and the fragment that fits nowhere. */
export function ThreeLayers() {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [lens, setLens] = useState<Lens>('nadzor')
  const [snap] = useState(() => incidentSnapshot())
  const g = geoFor(width)
  const s = snap.s
  const free = s.nodes.map((n) => {
    const v = nodeView(s, n)
    return v.allocatable.cpuM - v.requested.cpuM
  })
  const total = free.reduce((a, b) => a + b, 0)
  return (
    <div ref={ref}>
      <Segmented label="Kroz čije oči gledamo?" value={lens} options={LENSES} onChange={setLens} />
      <div className={g.narrow ? styles.stageNarrow : undefined} style={{ marginTop: 10 }}>
        <Diagram
          width={g.W}
          height={g.H}
          label={`Tri čvora iz incidenta. Potrošnja CPU-a: ukupno ${Math.round(snap.numbers.usedPct * 100)} %. Rezervirano: node-2 ${Math.round(snap.node2RequestedPct * 100)} %. Slobodno po čvorovima ${free.join(', ')} milijezgri, zbirno ${total}m; novi Pod traži 1500m i ne stane nigdje.`}
        >
          {s.nodes.map((n, i) => (
            <NodeRow key={n.id} s={s} i={i} g={g} lens={lens} />
          ))}
          {/* the new Pod that fits nowhere: not drawn through the monitoring lens, which knows nothing about it */}
          {lens !== 'nadzor' && (
          <g>
            <PodShape x={g.narrow ? 28 : 40} y={g.fragY} size={30} status="pending" tone="blue" />
            <text x={g.narrow ? 52 : 66} y={g.fragY + 6} className={styles.svgMono} style={{ fontSize: g.font.mono }}>
              fragment: 1500m
            </text>
            <Cross x={g.narrow ? 214 : 232} y={g.fragY} size={14} />
            <text x={g.narrow ? 12 : 252} y={g.narrow ? g.fragY + 44 : g.fragY + 6} className={styles.svgHand} style={{ fontSize: g.font.hand, fill: 'var(--red)' }}>
              {g.narrow ? `zbirno slobodno ${total}m, ali ne u komadu` : `slobodno ${free.join(' + ')} = ${total}m – ali ne u jednom komadu`}
            </text>
          </g>
          )}
        </Diagram>
      </div>
      <p className={styles.figNote}>
        {lens === 'nadzor' && <>Nadzor zbraja stvarnu potrošnju: klaster troši {Math.round(snap.numbers.usedPct * 100)} % CPU-a. Davorov graf ne laže – samo odgovara na drugo pitanje.</>}
        {lens === 'rasporedivac' && (
          <>
            Raspoređivač zbraja <code>requests</code>: node-2 je rezerviran {Math.round(snap.node2RequestedPct * 100)} %, a nigdje nema 1500m u komadu. Pod ne može stajati „pola na node-1, pola na node-3”.
          </>
        )}
        {lens === 'jezgra' && (
          <>
            Jezgra operacijskog sustava gleda <code>limits</code> svakog kontejnera posebno. Zbroj limita smije biti veći od čvora (prekomjerna dodjela, engl. <em>overcommit</em>), a Pod bez limita nema gornju granicu.
          </>
        )}
      </p>
    </div>
  )
}
