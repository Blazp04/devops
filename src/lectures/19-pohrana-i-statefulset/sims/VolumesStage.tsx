/**
 * Stage of flagship part 1: three nodes (columns on wide sheets, rows on phones) with the Postgres Pods on them,
 * each Pod's rows drawn where they really live (food box in the container / emptyDir box / the fridge = PV), and
 * the PV fridge outside every node, hanging on a cable from the node it is attached to.
 */
import { motion, useReducedMotion } from 'motion/react'
import { NodeFrame, PodShape } from '../../../kit'
import { nodeFrameStatus, podOrders } from '../../../engines/cluster/index.ts'
import type { Pod } from '../../../engines/cluster/index.ts'
import type { VolGeo } from '../lib/geometry'
import type { Variant, VolLab } from '../lib/volumes'
import { WHERE, currentPod, forceDetachIn, nodeHasOos } from '../lib/volumes'
import { cableState, podLook, shortName, statusColor } from '../lib/view'
import { Cable, FridgeDisk, StoreIcon } from './parts'
import type { StoreKind } from './parts'

function storeKind(id: string | null): StoreKind | null {
  if (!id) return null
  if (id.startsWith('pv:')) return 'pv'
  if (id.startsWith('empty:')) return 'emptyDir'
  return 'container'
}

function PodSlot({ w, p, g, x, y, slotW, i }: { w: VolLab; p: Pod; g: VolGeo; x: number; y: number; slotW: number; i: number }) {
  const cl = w.cl
  const s = { x, y, w: slotW, h: 0 }
  const look = podLook(cl, p)
  const [px, py] = g.pod(s)
  const [nx, ny] = g.name(s)
  const [sx, sy] = g.status(s)
  const [dx, dy] = g.data(s)
  const variant = p.labels.app as Variant
  const name = shortName(p.name)
  const [head, tail] = name.includes('-…') ? name.split('-…') : [name, '']
  const kind = storeKind(p.dataStoreId)
  const orders = podOrders(cl, p)
  const nodeOff = cl.nodes.find((n) => n.name === p.nodeName)?.machine === 'off'
  const faded = !!p.deletion || nodeOff
  const ink = faded ? 'var(--ink-3)' : 'var(--ink)'
  let data: { text: string; color: string; icon: StoreKind | null }
  if (look.multiAttach) data = { text: '✗ Multi-Attach', color: 'var(--red)', icon: 'pv' }
  else if (kind && orders !== null) data = { text: `${orders} ${WHERE[variant].short}`, color: faded ? 'var(--ink-3)' : 'var(--ink-2)', icon: kind }
  else data = { text: 'čeka pokretanje', color: 'var(--ink-3)', icon: null }
  return (
    <g>
      <PodShape x={px} y={py} size={g.podSize} status={look.shape} tone="teal" ariaLabel={`Pod ${p.name}: ${look.status}`} />
      {g.splitName ? (
        <>
          <text x={nx} y={ny} className="k-svg-mono" style={{ fontSize: g.mono, fontWeight: 700, fill: ink }}>
            {head}
          </text>
          {tail && (
            <text x={nx} y={ny + 17} className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--ink-2)' }}>
              -…{tail}
            </text>
          )}
        </>
      ) : (
        <text x={nx} y={ny} className="k-svg-mono" style={{ fontSize: g.mono, fontWeight: 700, fill: ink }}>
          {name}
        </text>
      )}
      <text x={sx} y={sy} className="k-svg-mono" style={{ fontSize: g.mono, fontWeight: 600, fill: look.status === 'Running' && !p.ready.status ? 'var(--orange)' : statusColor(look.status) }}>
        {look.status}
      </text>
      {data.icon && <StoreIcon x={dx} y={dy - 13} kind={data.icon} seed={19110 + i * 7} />}
      <text x={data.icon ? dx + 24 : dx} y={dy} className="k-svg-mono" style={{ fontSize: g.mono, fontWeight: data.icon && !look.multiAttach ? 600 : 500, fill: data.color }}>
        {data.text}
      </text>
    </g>
  )
}

export function VolumesStage({ w, g, target }: { w: VolLab; g: VolGeo; target: string }) {
  const reduce = useReducedMotion()
  const cl = w.cl
  const pv = cl.pvs[0]
  const pvc = cl.pvcs.find((c) => c.name === 'db-pvc-data')
  const cab = cableState(cl, pv)
  const pvcPod = currentPod(cl, 'db-pvc')
  const hangOn = cab.node ?? pvcPod?.nodeName ?? 'node-3'
  const hangIdx = Math.max(0, cl.nodes.findIndex((n) => n.name === hangOn))
  const [fx0, fy] = g.fridgeAt(hangIdx)
  const fx = g.kind === 'wide' ? fx0 : g.fridgeAt(0)[0]
  const pvOrders = pv ? (cl.dataStores[`pv:${pv.id}`]?.orders ?? 0) : null
  const lab = g.labels(hangIdx, fx, fy)
  const detachIn = pv ? forceDetachIn(cl, pv.name) : null
  const stateLine =
    cab.state === 'attached' ? `spojen na ${cab.node}` : cab.state === 'attaching' ? `spaja se na ${cab.node}…` : cab.state === 'stuck' ? `zapeo na ${cab.node}` : 'odspojen, čeka Pod'
  const descr = `Tri čvora s Postgres Podovima. ${cl.nodes.map((n) => `${n.name}: ${cl.pods.filter((p) => p.nodeName === n.name).map((p) => p.name).join(', ') || 'prazno'}`).join('; ')}. Disk PV ${stateLine}.`
  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={descr} style={{ display: 'block', width: '100%', height: 'auto' }}>
      {cl.nodes.map((n, i) => {
        const b = g.node(i)
        const pods = cl.pods
          .filter((p) => p.nodeName === n.name)
          .sort((a, b2) => Number(!!a.deletion) - Number(!!b2.deletion) || a.createdAt - b2.createdAt || a.seq - b2.seq)
        const shown = pods.slice(0, g.slots)
        const extra = pods.length - shown.length
        const off = n.machine === 'off'
        const status = nodeFrameStatus(n)
        return (
          <g key={n.id}>
            <NodeFrame x={b.x} y={b.y} w={b.w} h={b.h} name={n.name} status={status} highlight={n.name === target && !off} />
            {off && status === 'ready' && (g.kind === 'wide' ? (
              // wide columns are narrow: „ugašen” beside the name, „API: Ready” bottom-left, clear of the disk cable
              <g>
                <text x={b.x + b.w - 10} y={b.y + 22} textAnchor="end" className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--red)' }}>
                  ugašen
                </text>
                <text x={b.x + 12} y={b.y + b.h - 9} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--red)' }}>
                  API: Ready
                </text>
              </g>
            ) : (
              <text x={b.x + b.w - 10} y={b.y + 22} textAnchor="end" className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--red)' }}>
                ugašen · API: Ready
              </text>
            ))}
            {nodeHasOos(cl, n.name) && (
              <text x={b.x + 12} y={b.y + b.h - 9} className="k-svg-mono" style={{ fontSize: g.mono, fontWeight: 600, fill: 'var(--red)' }}>
                taint: out-of-service
              </text>
            )}
            {extra > 0 && (
              <text x={b.x + b.w - 10} y={b.y + b.h - 9} textAnchor="end" className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--ink-2)' }}>
                +{extra} Pod
              </text>
            )}
            {shown.map((p, j) => {
              const s = g.slot(i, j)
              return <PodSlot key={p.id} w={w} p={p} g={g} x={s.x} y={s.y} slotW={s.w} i={i * 3 + j} />
            })}
            {pods.length === 0 && (
              <text x={g.slot(i, 0).x + 8} y={g.slot(i, 0).y + 30} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--ink-3)' }}>
                {off ? 'stroj ne radi' : 'slobodno'}
              </text>
            )}
          </g>
        )
      })}
      {pv && cab.state !== 'none' && <Cable pts={g.cable(hangIdx, fx, fy)} state={cab.state} seed={19310 + hangIdx} />}
      <motion.g initial={false} animate={{ x: fx - g.fridgeAt(0)[0] }} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 18 }}>
        <FridgeDisk x={g.fridgeAt(0)[0]} y={fy} w={g.fridge.w} h={g.fridge.h} count={pvOrders} deleting={!!pvc?.deletion} dim={cab.state === 'stuck'} />
      </motion.g>
      <g>
        <text x={lab.x} y={lab.y} textAnchor={lab.anchor} className="k-svg-mono" style={{ fontSize: g.mono, fontWeight: 700, fill: 'var(--ink)' }}>
          PVC db-pvc-data
        </text>
        <text x={lab.x} y={lab.y + 18} textAnchor={lab.anchor} className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--ink-2)' }}>
          {pv ? `PV ${pv.name.slice(0, 12)}… · 10Gi · RWO` : 'PV: nema'}
        </text>
        <text x={lab.x} y={lab.y + 40} textAnchor={lab.anchor} className="k-svg-hand" style={{ fontSize: g.hand, fill: cab.state === 'stuck' ? 'var(--red)' : cab.state === 'attached' ? 'var(--pen)' : 'var(--ink-2)' }}>
          {stateLine}
        </text>
        {cab.state === 'stuck' && (
          <text x={lab.x} y={lab.y + 58} textAnchor={lab.anchor} className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--red)' }}>
            {detachIn !== null ? `prisilno odspajanje: ${Math.ceil(detachIn)} s` : 'čeka brisanje Poda'}
          </text>
        )}
      </g>
    </svg>
  )
}
