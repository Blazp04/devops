import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Magnifier, NodeFrame, PodShape, Rough, hashSeed } from '../../../kit'
import { effectiveRequests, nodeFrameStatus, nodeView, podShapeView, podView, qosClass, type Pod } from '../../../engines/cluster'
import { IVA_PODS } from '../lib/model'
import { inBox, type StageGeo } from '../lib/stage-geo'
import { stagePods, type TetrisState } from '../lib/tetris'
import { LayerBar, type BarBlock } from './LayerBar'
import styles from '../styles.module.css'

const NODE_SPEC: Record<string, string> = { 'node-1': '2 vCPU · 4 GiB', 'node-2': '4 vCPU · 16 GiB', 'node-3': '2 vCPU · 8 GiB' }

interface Drag {
  pod: string
  x: number
  y: number
  moved: boolean
}

function toSvg(e: ReactPointerEvent<SVGGElement>): { x: number; y: number } | null {
  const svg = e.currentTarget.ownerSVGElement
  const m = svg?.getScreenCTM()
  if (!svg || !m) return null
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
  return { x: p.x, y: p.y }
}

function reqText(p: Pod): { cpu: string; mem: string } {
  const r = effectiveRequests(p.spec)
  if (r.cpuM === 0 && r.memMi === 0) return { cpu: 'bez', mem: 'requests' }
  const memTxt = r.memMi >= 1024 && r.memMi % 1024 === 0 ? `${r.memMi / 1024}Gi` : `${r.memMi}Mi`
  return { cpu: `${r.cpuM}m`, mem: memTxt }
}

/** Short status line under a Pod's name on a node (kubectl words where they matter). */
function rowStatus(w: TetrisState, p: Pod, narrow: boolean): { text: string; tone: string } {
  const v = podView(w.c, p)
  if (p.reason === 'Evicted') return { text: '✗ Evicted', tone: 'var(--red)' }
  if (v.status === 'Running' && v.processUp) {
    if (v.cpu.throttledPct > 0.05) return { text: narrow ? `prigušen ${Math.round(v.cpu.throttledPct * 100)} %` : `${Math.round(v.cpu.usedM)}m · prigušen ${Math.round(v.cpu.throttledPct * 100)} %`, tone: 'var(--orange)' }
    return { text: `✓ ${Math.round(v.cpu.usedM)}m · ${Math.round(v.mem.usedMi)}Mi`, tone: 'var(--green)' }
  }
  if (v.status === 'ContainerCreating') return { text: narrow ? 'pokreće se…' : 'ContainerCreating', tone: 'var(--ink-2)' }
  if (v.status === 'CrashLoopBackOff') return { text: narrow ? 'CrashLoopBackOff' : `↻${v.restarts} CrashLoopBackOff`, tone: 'var(--red)' }
  if (v.status === 'OOMKilled') return { text: '✗ OOMKilled', tone: 'var(--red)' }
  if (v.status === 'Terminating') return { text: 'Terminating', tone: 'var(--ink-3)' }
  return { text: v.status, tone: 'var(--ink-2)' }
}

export function TetrisStage({
  w,
  geo,
  selected,
  onSelect,
  onDrop,
}: {
  w: TetrisState
  geo: StageGeo
  selected: string | null
  onSelect: (name: string) => void
  onDrop: (pod: string, node: string) => void
}) {
  const reduce = useReducedMotion()
  const [drag, setDrag] = useState<Drag | null>(null)
  const s = w.c
  const pods = stagePods(w)
  const pending = pods.filter((p) => !p.nodeName)
  const nodeIndex = new Map(s.nodes.map((n, i) => [n.name, i]))
  const rowsByNode = new Map<string, Pod[]>()
  for (const p of pods) {
    if (!p.nodeName) continue
    const list = rowsByNode.get(p.nodeName) ?? []
    list.push(p)
    rowsByNode.set(p.nodeName, list)
  }
  const hoverNode = drag?.moved ? s.nodes.find((_n, i) => inBox(geo.nodes[i], drag.x, drag.y))?.name ?? null : null
  const schedOn = s.components.scheduler
  const f = geo.font
  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 260, damping: 28 }

  const startDrag = (e: ReactPointerEvent<SVGGElement>, p: Pod) => {
    if (p.nodeName || e.button !== 0) return
    const pt = toSvg(e)
    if (!pt) return
    // no pointer capture yet: a plain click must still reach the Pod (select); capture once it really moves
    setDrag({ pod: p.name, x: pt.x, y: pt.y, moved: false })
  }
  const moveDrag = (e: ReactPointerEvent<SVGGElement>) => {
    if (!drag) return
    const pt = toSvg(e)
    if (!pt) return
    const moved = drag.moved || Math.hypot(pt.x - drag.x, pt.y - drag.y) > 6
    if (moved && !drag.moved && !e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.setPointerCapture(e.pointerId)
    setDrag(moved ? { ...drag, x: pt.x, y: pt.y, moved } : drag)
  }
  const endDrag = () => {
    if (!drag) return
    if (drag.moved && hoverNode) onDrop(drag.pod, hoverNode)
    setDrag(null)
  }

  return (
    <g>
      {/* ---------------- queue: Pods without a node ---------------- */}
      <Rough shape={{ k: 'rect', ...geo.queue }} seed={1701} stroke="var(--ink-3)" strokeWidth={1.4} dash="7 5" roughness={1} />
      <Magnifier cx={geo.magnifier.cx} cy={geo.magnifier.cy} r={geo.magnifier.r} stroke={schedOn ? 'var(--green)' : 'var(--ink-3)'} />
      <text x={geo.schedText.x} y={geo.schedText.y} textAnchor={geo.schedText.anchor} className={styles.svgHand} style={{ fontSize: f.hand }}>
        {geo.schedText.line2 === null ? (
          <>
            raspoređivač: <tspan style={{ fill: schedOn ? 'var(--green)' : 'var(--red)' }}>{schedOn ? 'radi' : 'ugašen'}</tspan>
          </>
        ) : (
          'raspoređivač'
        )}
      </text>
      {geo.schedText.line2 !== null && (
        <text x={geo.schedText.x} y={geo.schedText.line2} textAnchor="middle" className={styles.svgHand} style={{ fontSize: f.hand, fill: schedOn ? 'var(--green)' : 'var(--red)' }}>
          {schedOn ? '✓ radi' : '✗ ugašen'}
        </text>
      )}
      <text x={geo.queueNote.x} y={geo.queueNote.y} textAnchor={geo.queueNote.anchor} className={styles.svgHand} style={{ fontSize: f.hand, fill: 'var(--ink-2)' }}>
        {pending.length ? 'čekaju čvor (Pending)' : 'svi Podovi imaju čvor'}
      </text>

      {/* ---------------- nodes ---------------- */}
      {s.nodes.map((n, i) => {
        const b = geo.nodes[i]
        const v = nodeView(s, n)
        const bars = geo.bars(i)
        const rows = rowsByNode.get(n.name) ?? []
        const blocksCpu: BarBlock[] = [{ key: 'ds', amount: n.daemonSet.cpuM, system: true }]
        const blocksMem: BarBlock[] = [{ key: 'ds', amount: n.daemonSet.memMi, system: true }]
        for (const p of s.pods) {
          if (p.nodeName !== n.name || p.phase === 'Failed' || p.phase === 'Succeeded') continue
          const r = effectiveRequests(p.spec)
          blocksCpu.push({ key: p.id, amount: r.cpuM, selected: p.name === selected })
          blocksMem.push({ key: p.id, amount: r.memMi, selected: p.name === selected })
        }
        return (
          <g key={n.id}>
            <NodeFrame x={b.x} y={b.y} w={b.w} h={b.h} name={n.name} status={nodeFrameStatus(v)} highlight={hoverNode === n.name} />
            {/* the node's size, or – while it is under memory pressure – the warning in its place */}
            <text x={b.x + 12 + n.name.length * 9.6 + 8} y={b.y + 22} className={styles.svgHand} style={{ fontSize: f.hand, fill: v.memoryPressure ? 'var(--red)' : 'var(--ink-2)' }}>
              {v.memoryPressure ? '! malo memorije' : (NODE_SPEC[n.name] ?? '')}
            </text>
            {rows.length > geo.maxRows && (
              <text x={b.x + b.w - 10} y={b.y + b.h - 8} textAnchor="end" className={styles.svgMono} style={{ fontSize: f.mono }}>
                +{rows.length - geo.maxRows}
              </text>
            )}
            <LayerBar
              x={bars.cpu.x}
              y={bars.cpu.y}
              w={bars.cpu.w}
              h={geo.barH}
              alloc={v.allocatable.cpuM}
              blocks={blocksCpu}
              used={v.used.cpuM}
              limits={v.limits.cpuM}
              unbounded={v.limits.unboundedCpu}
              label="CPU"
              labelX={bars.labelX}
              textX={bars.textX}
              font={f}
              seed={`${n.name}-cpu-${geo.W}`}
              unit="cpu"
              split={geo.splitReading}
            />
            <LayerBar
              x={bars.mem.x}
              y={bars.mem.y}
              w={bars.mem.w}
              h={geo.barH}
              alloc={v.allocatable.memMi}
              blocks={blocksMem}
              used={v.used.memMi}
              limits={v.limits.memMi}
              unbounded={v.limits.unboundedMem}
              label="RAM"
              labelX={bars.labelX}
              textX={bars.textX}
              font={f}
              seed={`${n.name}-mem-${geo.W}`}
              unit="mem"
              split={geo.splitReading}
            />
          </g>
        )
      })}

      {/* ---------------- Pods (one layer, so a Pod glides from the queue to its node) ---------------- */}
      {pods.map((p) => {
        const isPending = !p.nodeName
        let x: number
        let y: number
        let rowW = 0
        if (isPending) {
          const slot = geo.slot(Math.max(0, pending.indexOf(p)))
          x = slot.x
          y = slot.y
        } else {
          const ni = nodeIndex.get(p.nodeName!) ?? 0
          const k = (rowsByNode.get(p.nodeName!) ?? []).indexOf(p)
          if (k >= geo.maxRows) return null
          const r = geo.row(ni, k)
          x = r.x + geo.rowSize / 2 + 2
          y = r.y + 12
          rowW = r.w
        }
        const isDragged = drag?.pod === p.name && drag.moved
        const shape = podShapeView(p)
        const status = isPending ? 'pending' : p.reason === 'Evicted' ? 'terminating' : shape.status
        const iva = IVA_PODS.includes(p.name)
        const req = reqText(p)
        const st = isPending ? null : rowStatus(w, p, geo.narrow)
        const qos = qosClass(p.spec)
        return (
          <motion.g
            key={p.id}
            initial={false}
            animate={{ x, y, opacity: isDragged ? 0.35 : 1 }}
            transition={spring}
            onPointerDown={(e) => startDrag(e, p)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={() => setDrag(null)}
            style={{ touchAction: isPending ? 'none' : undefined, cursor: isPending ? 'grab' : undefined }}
          >
            <PodShape
              x={0}
              y={0}
              size={isPending ? geo.queueSize : geo.rowSize}
              status={status}
              tone={iva ? 'amber' : qos === 'BestEffort' ? 'rose' : 'blue'}
              selected={selected === p.name}
              restarts={status === 'crash' ? p.container.restartCount : undefined}
              onClick={() => onSelect(p.name)}
              ariaLabel={`Pod ${p.name}: ${isPending ? 'čeka čvor' : `${podView(s, p).status} na ${p.nodeName}`}. Odaberite za detalje.`}
            />
            {isPending ? (
              <g aria-hidden="true">
                <text y={geo.slotText.name} textAnchor="middle" className={styles.svgName} style={{ fontSize: f.name }}>
                  {p.name}
                </text>
                <text y={geo.slotText.cpu} textAnchor="middle" className={styles.svgMono} style={{ fontSize: f.mono }}>
                  {req.cpu}
                </text>
                <text y={geo.slotText.mem} textAnchor="middle" className={styles.svgMono} style={{ fontSize: f.mono }}>
                  {req.mem}
                </text>
              </g>
            ) : (
              <g aria-hidden="true">
                <text x={geo.rowSize / 2 + 8} y={-1} className={styles.svgName} style={{ fontSize: f.name, fill: iva ? 'var(--ink-2)' : undefined }}>
                  {p.name}
                </text>
                {!geo.narrow && (
                  <text x={rowW - geo.rowSize / 2 - 4} y={-1} textAnchor="end" className={styles.svgMono} style={{ fontSize: f.mono, fill: 'var(--ink-3)' }}>
                    {qos}
                  </text>
                )}
                {st && (
                  <text x={geo.rowSize / 2 + 8} y={geo.rowLine2 - 12} className={styles.svgMono} style={{ fontSize: f.mono, fill: st.tone }}>
                    {st.text}
                  </text>
                )}
              </g>
            )}
          </motion.g>
        )
      })}

      {/* a refused drop: a pink sticky note pinned over the node, above its Pods, for 4 s */}
      {w.refusal &&
        s.t - w.refusal.t < 4 &&
        (() => {
          const ni = nodeIndex.get(w.refusal.node)
          if (ni === undefined) return null
          const b = geo.nodes[ni]
          const lineH = f.hand + 4
          const noteH = 14 + w.refusal.reasons.length * lineH
          const nx = b.x + 12
          const ny = b.y + b.h - noteH - 10
          const nw = b.w - 24
          return (
            <g transform={`rotate(-1.5 ${nx + nw / 2} ${ny + noteH / 2})`} role="status" aria-label={`${w.refusal.pod} ne stane na ${w.refusal.node}: ${w.refusal.reasons.join(', ')}`}>
              <Rough shape={{ k: 'rect', x: nx, y: ny, w: nw, h: noteH }} seed={hashSeed(`ref|${w.refusal.node}`)} stroke="var(--note-ink)" fillColor="var(--note-pink)" fillStyle="solid" strokeWidth={1.2} roughness={0.8} />
              {w.refusal.reasons.map((r, k) => (
                <text key={r} x={nx + 10} y={ny + 4 + (k + 1) * lineH} className={styles.svgHand} style={{ fontSize: f.hand, fill: 'var(--note-ink)' }}>
                  ✗ {r}
                </text>
              ))}
            </g>
          )
        })()}

      {/* the dragged card follows the pointer */}
      {drag?.moved && (
        <g transform={`translate(${drag.x} ${drag.y})`} style={{ pointerEvents: 'none' }} aria-hidden="true">
          <PodShape x={0} y={0} size={geo.queueSize} status="pending" tone="blue" />
          <text y={geo.slotText.name} textAnchor="middle" className={styles.svgName} style={{ fontSize: f.name }}>
            {drag.pod}
          </text>
        </g>
      )}
    </g>
  )
}
