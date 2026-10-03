import { useState } from 'react'
import { Cross, Diagram, Iva, Lana, PodShape, Rough, SpeechBubble, useDiagramIds, useWidth } from '../../../kit'
import { effectiveRequests, nodeView } from '../../../engines/cluster'
import { incidentSnapshot } from '../lib/model'
import styles from '../styles.module.css'

function Strip({ x, y, w, h, font }: { x: number; y: number; w: number; h: number; font: { mono: number; name: number } }) {
  const ids = useDiagramIds()
  const [data] = useState(() => {
    const { s } = incidentSnapshot()
    const n = s.nodes.find((q) => q.name === 'node-2')!
    const v = nodeView(s, n)
    const blocks = [n.daemonSet.cpuM, ...s.pods.filter((p) => p.nodeName === 'node-2').map((p) => effectiveRequests(p.spec).cpuM)]
    const iva = s.pods.filter((p) => p.name.startsWith('ivina-proba')).reduce((a, p) => a + effectiveRequests(p.spec).cpuM, 0)
    return { alloc: v.allocatable.cpuM, req: v.requested.cpuM, used: v.used.cpuM, blocks, iva }
  })
  const sc = w / data.alloc
  const xs: number[] = []
  let acc = x
  for (const b of data.blocks) {
    xs.push(acc)
    acc += b * sc
  }
  return (
    <g>
      <text x={x} y={y - 12} className={styles.svgName} style={{ fontSize: font.name }}>
        node-2 · CPU
      </text>
      {data.blocks.map((b, i) => (
        <g key={i}>
          <rect x={xs[i]} y={y} width={b * sc} height={h} style={{ fill: ids ? `url(${i === 0 ? ids.hatch : ids.hatchV1})` : 'none' }} />
          <line x1={xs[i] + b * sc} y1={y} x2={xs[i] + b * sc} y2={y + h} style={{ stroke: 'var(--ink-2)', strokeWidth: 1 }} />
        </g>
      ))}
      <rect x={x} y={y + h + 4} width={data.used * sc} height={7} rx={2} style={{ fill: 'var(--food)' }} />
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={1790} stroke="var(--ink)" strokeWidth={1.6} roughness={0.8} />
      <text x={x} y={y + h + 30} className={styles.svgMono} style={{ fontSize: font.mono }}>
        <tspan style={{ fill: 'var(--pen)' }}>rezervirano {Math.round((data.req / data.alloc) * 100)} %</tspan>
        <tspan style={{ fill: 'var(--ink-3)' }}> · </tspan>
        <tspan>troši {Math.round((data.used / data.alloc) * 100)} %</tspan>
      </text>
    </g>
  )
}

/** Hook beat: Iva's idle test Pods hold node-2's CPU; the new Pod has nowhere to go. */
export function HookFigure() {
  const [ref, width] = useWidth<HTMLDivElement>()
  const narrow = width !== null && width < 640
  if (narrow) {
    return (
      <div ref={ref} className={styles.stageNarrow}>
        <Diagram width={380} height={380} label="Iva kaže da njezini testni Podovi ne rade ništa, Lana odgovara da drže tri i pol procesorske jezgre. Na node-2 rezervirano je 98 % procesora, a troši se 34 %; novi Pod od 1500m nema kamo.">
          <Iva x={4} y={20} scale={0.95} mood="open" holding="phone" />
          <SpeechBubble x={96} y={8} w={200} h={70} tx={74} ty={46} lines={['Moji testni Podovi', 'ne rade ništa!']} size={20} seed={1791} />
          <Lana x={292} y={120} scale={0.95} flip mood="flat" />
          <SpeechBubble x={96} y={112} w={184} h={92} tx={300} ty={150} lines={['Ali drže', '3,5 procesorske', 'jezgre.']} size={20} seed={1792} />
          <Strip x={14} y={280} w={300} h={22} font={{ mono: 14.5, name: 15.5 }} />
          <PodShape x={346} y={290} size={28} status="pending" tone="blue" />
          <Cross x={346} y={258} size={12} />
          <text x={346} y={334} textAnchor="middle" className={styles.svgMono} style={{ fontSize: 14.5 }}>
            1500m
          </text>
        </Diagram>
      </div>
    )
  }
  return (
    <div ref={ref}>
      <Diagram width={760} height={230} label="Iva kaže da njezini testni Podovi ne rade ništa, Lana odgovara da drže tri i pol procesorske jezgre. Na node-2 rezervirano je 98 % procesora, a troši se 34 %; novi Pod od 1500m nema kamo.">
        <Iva x={12} y={96} scale={1} mood="open" holding="phone" />
        <SpeechBubble x={96} y={30} w={226} h={78} tx={78} ty={122} lines={['Moji testni Podovi', 'ne rade ništa!']} size={22} seed={1791} />
        <Strip x={250} y={150} w={330} h={24} font={{ mono: 15, name: 16 }} />
        <PodShape x={612} y={160} size={30} status="pending" tone="blue" />
        <Cross x={612} y={124} size={13} />
        <text x={612} y={206} textAnchor="middle" className={styles.svgMono} style={{ fontSize: 15 }}>
          1500m
        </text>
        <Lana x={668} y={96} scale={1} flip mood="flat" />
        <SpeechBubble x={460} y={8} w={190} h={104} tx={690} ty={120} lines={['Ali drže', '3,5 procesorske', 'jezgre.']} size={22} seed={1792} />
      </Diagram>
    </div>
  )
}
