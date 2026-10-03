import { useMemo, useState } from 'react'
import { Arrow, Diagram, NodeFrame, PodShape, Rough, ServiceTag, Slider, plural, useWidth } from '../../../kit'
import { SIZE_NODES, SIZE_POD, packNodeSizes } from '../lib/model'
import styles from '../styles.module.css'

interface Geo {
  W: number
  H: number
  narrow: boolean
  tag: { x: number; y: number; w: number; h: number }
  node: (i: number) => { x: number; y: number; w: number; h: number }
  perRow: (i: number) => number
  font: { mono: number; hand: number; name: number }
}

const UNITS = [1, 2, 4]

function geoFor(width: number | null): Geo {
  // wide lettering is 13,5 units in a 760 viewBox: ≥ 12 px on screen only from 700 px up
  if (width !== null && width < 700) {
    const full = 360
    return {
      W: 380,
      H: 560,
      narrow: true,
      tag: { x: 120, y: 8, w: 150, h: 46 },
      node: (i) => {
        const w = Math.max(110, (full * UNITS[i]) / 4)
        const y = [96, 236, 376][i]
        return { x: 10, y, w, h: 120 }
      },
      perRow: (i) => Math.max(2, Math.floor((Math.max(110, (full * UNITS[i]) / 4) - 16) / 30)),
      font: { mono: 14.5, hand: 20.5, name: 16 },
    }
  }
  const unitW = 80
  const xs = [20, 156, 346]
  return {
    W: 760,
    H: 330,
    narrow: false,
    tag: { x: 280, y: 6, w: 150, h: 48 },
    node: (i) => ({ x: xs[i], y: 96, w: unitW * UNITS[i], h: 170 }),
    perRow: (i) => Math.max(2, Math.floor((unitW * UNITS[i] - 14) / 30)),
    font: { mono: 13.5, hand: 20, name: 16 },
  }
}

/** Scene 6: bigger nodes hold more Pods by requests; the Service picks a Pod, not a node – traffic follows Pod count. */
export function NodeSizes() {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [replicas, setReplicas] = useState(25)
  const pack = useMemo(() => packNodeSizes(replicas), [replicas])
  const g = geoFor(width)
  const total = SIZE_NODES.reduce((a, n) => a + pack.perNode[n.name], 0)
  // arrow targets: the last Pod of each node's first row (clear of the node's name); wide = a bus under the tag,
  // narrow = a trunk down the right side, beside the narrower nodes
  const podAt = (i: number, k: number) => {
    const b = g.node(i)
    const per = g.perRow(i)
    return { x: b.x + 22 + (k % per) * 30, y: b.y + 52 + Math.floor(k / per) * 34 }
  }
  const trunkX = g.narrow ? 330 : g.tag.x + g.tag.w / 2
  const busY = g.narrow ? 0 : 76
  const targets = SIZE_NODES.map((n, i) => {
    const count = pack.perNode[n.name]
    if (!count) return null
    const p = podAt(i, Math.min(count, g.perRow(i)) - 1)
    if (!g.narrow) return { pts: [[p.x, busY], [p.x, p.y - 16]] as [number, number][], x: p.x }
    // narrow: from the trunk straight left into the Pod's side (Mali, Srednji), or down into Veliki
    if (p.x + 14 < trunkX - 20) return { pts: [[trunkX, p.y], [p.x + 16, p.y]] as [number, number][], x: p.x }
    return { pts: [[trunkX, p.y - 40], [p.x, p.y - 16]] as [number, number][], x: p.x }
  })
  const xs = targets.filter((t): t is NonNullable<typeof t> => !!t).map((t) => t.x)
  const lastNarrowY = g.narrow ? Math.max(...targets.map((t) => (t ? t.pts[0][1] : 0))) : 0
  const trunks: [number, number][][] = g.narrow
    ? [
        [
          [g.tag.x + g.tag.w, g.tag.y + g.tag.h / 2],
          [trunkX, g.tag.y + g.tag.h / 2],
          [trunkX, lastNarrowY],
        ],
      ]
    : [
        [
          [trunkX, g.tag.y + g.tag.h],
          [trunkX, busY],
        ],
        [
          [Math.min(trunkX, ...xs), busY],
          [Math.max(trunkX, ...xs), busY],
        ],
      ]
  return (
    <div ref={ref}>
      <div className={g.narrow ? styles.stageNarrow : undefined}>
        <Diagram
          width={g.W}
          height={g.H}
          label={`Service klopa-api i tri čvora različite veličine. ${SIZE_NODES.map((n) => `${n.label}: ${pack.perNode[n.name]} ${plural(pack.perNode[n.name], ['Pod', 'Poda', 'Podova'])}`).join(', ')}. Service bira Pod nasumično, pa čvor s više Podova dobiva više prometa.`}
        >
          <ServiceTag x={g.tag.x} y={g.tag.y} w={g.tag.w} h={g.tag.h}>
            <text x={g.tag.x + 26} y={g.tag.y + g.tag.h / 2 - 3} className={styles.svgName} style={{ fontSize: g.font.name - 1 }}>
              Service
            </text>
            <text x={g.tag.x + 26} y={g.tag.y + g.tag.h / 2 + 15} className={styles.svgMono} style={{ fontSize: g.font.mono }}>
              klopa-api
            </text>
          </ServiceTag>
          {/* the Service's pen line: a trunk from the tag, then one green arrow into a Pod on each node */}
          {trunks.map((pts, k) => (
            <Rough key={k} shape={{ k: 'lin', pts }} seed={1795 + k * 7} stroke="var(--green)" strokeWidth={1.5} />
          ))}
          {SIZE_NODES.map((n, i) => {
            const b = g.node(i)
            const count = pack.perNode[n.name]
            const per = g.perRow(i)
            const share = total ? count / total : 0
            const a = pack.alloc[n.name]
            const t = targets[i]
            return (
              <g key={n.name}>
                {t && <Arrow pts={t.pts} stroke="var(--green)" strokeWidth={1.5} seed={1796 + i} />}
                <NodeFrame x={b.x} y={b.y} w={b.w} h={b.h} name={n.label} />
                <text x={b.x + 6} y={b.y + b.h + 20} className={styles.svgMono} style={{ fontSize: g.font.mono, fill: 'var(--ink-2)' }}>
                  {n.spec}
                </text>
                {!g.narrow && (
                  <text x={b.x + 6} y={b.y + b.h + 38} className={styles.svgMono} style={{ fontSize: g.font.mono, fill: 'var(--ink-3)' }}>
                    {a.cpuM}m · {a.memMi}Mi
                  </text>
                )}
                {Array.from({ length: count }, (_, k) => (
                  <PodShape key={k} x={b.x + 22 + (k % per) * 30} y={b.y + 52 + Math.floor(k / per) * 34} size={22} status="running" tone="blue" />
                ))}
                <text x={b.x + 8} y={b.y + b.h - 10} className={styles.svgHand} style={{ fontSize: g.font.hand, fill: 'var(--green)' }}>
                  {Math.round(share * 100)} %
                </text>
              </g>
            )
          })}
          {pack.pending > 0 && (
            <text x={g.narrow ? 10 : 470} y={g.narrow ? g.H - 10 : 30} className={styles.svgHand} style={{ fontSize: g.font.hand, fill: 'var(--red)' }}>
              u Pendingu: {pack.pending} {plural(pack.pending, ['Pod', 'Poda', 'Podova'])}
              {g.narrow ? ' – čvorovi su puni' : <tspan x={470} dy={22}>čvorovi su puni</tspan>}
            </text>
          )}
        </Diagram>
      </div>
      <Slider label="replicas (klopa-api)" value={replicas} min={3} max={28} step={1} onChange={setReplicas} format={(v) => `${v} × ${SIZE_POD.cpuM}m · ${SIZE_POD.memMi}Mi`} />
      <p className={styles.figNote}>
        Zeleni postotak u čvoru je udio prometa: Service svaku novu vezu šalje nasumično odabranom spremnom Podu, pa čvor s više Podova dobiva više veza. Težine u Serviceu ne postoje – „težinu” daju veličina čvora i <code>requests</code>.
      </p>
      <p className={styles.figNote}>
        Pravi raspoređivač ima i zadano pravilo raspršivanja replika (PodTopologySpread), pa pri malo replika daje gotovo jednako Podova po čvoru; razmjer veličini čvora vidi se kad se čvorovi pune. Simulacija boduje samo prema LeastAllocated.
      </p>
    </div>
  )
}
