/**
 * Stage of flagship part 2: small multiples on the same cluster – left the Postgres Deployment (random names, no disk
 * of its own, or one shared RWO disk), right the StatefulSet db (ordinal rows that never move, one fridge = PVC per
 * ordinal). Node chips on top show what the machines do and what the API believes.
 */
import { PodShape, Rough } from '../../../kit'
import { podOrders } from '../../../engines/cluster/index.ts'
import type { ClusterState, Pod } from '../../../engines/cluster/index.ts'
import type { Box, IdGeo } from '../lib/geometry'
import type { IdLab } from '../lib/identity'
import { ORDER_NO, dbPod, dbPvc, deployPods, pvcOrders, stsReplicas } from '../lib/identity'
import { cableState, nodeLine, podLook, shortName, statusColor } from '../lib/view'
import { Cable, FridgeDisk, GhostPod } from './parts'

const MONO = 13
const HAND = 18.5

function Chip({ cl, name, b, lines }: { cl: ClusterState; name: string; b: Box; lines: 2 | 3 }) {
  const l = nodeLine(cl, name)
  const narrow = lines === 3
  const machineOff = cl.nodes.find((n) => n.name === name)?.machine === 'off'
  const second = narrow && l.text.startsWith('ugašen') ? 'ugašen' : l.text
  const third = narrow && l.text.startsWith('ugašen') ? 'API: Ready' : ''
  return (
    <g>
      <Rough shape={{ k: 'rect', x: b.x, y: b.y, w: b.w, h: b.h }} seed={19500 + b.x} stroke={l.bad ? 'var(--red)' : 'var(--ink-2)'} strokeWidth={1.4} dash={machineOff ? '5 4' : undefined} />
      <text x={b.x + 10} y={b.y + 19} className="k-svg-display" style={{ fontSize: 14, fontWeight: 800, fill: l.bad ? 'var(--red)' : 'var(--ink)' }}>
        {name}
      </text>
      <text x={b.x + 10} y={b.y + 37} className="k-svg-mono" style={{ fontSize: MONO, fontWeight: 600, fill: l.bad ? 'var(--red)' : 'var(--green)' }}>
        {l.bad ? '✗ ' : '✓ '}
        {second}
      </text>
      {narrow && third && (
        <text x={b.x + 10} y={b.y + 55} className="k-svg-mono" style={{ fontSize: MONO, fill: 'var(--red)' }}>
          {third}
        </text>
      )}
      {l.oos && (
        <text x={narrow ? b.x + 10 : b.x + b.w - 8} y={narrow ? b.y + 56 : b.y + 37} textAnchor={narrow ? 'start' : 'end'} className="k-svg-hand" style={{ fontSize: HAND, fill: 'var(--red)' }}>
          out-of-service
        </text>
      )}
    </g>
  )
}

function PanelHead({ b, title, sub }: { b: Box; title: string; sub: string }) {
  return (
    <g>
      <Rough shape={{ k: 'rect', x: b.x, y: b.y, w: b.w, h: b.h }} seed={19600 + b.x + b.y} stroke="var(--ink-3)" strokeWidth={1.3} />
      <text x={b.x + 12} y={b.y + 22} className="k-svg-display" style={{ fontSize: 15, fontWeight: 800, fill: 'var(--ink)' }}>
        {title}
      </text>
      <text x={b.x + 12} y={b.y + 46} className="k-svg-hand" style={{ fontSize: HAND, fill: 'var(--pen)' }}>
        {sub}
      </text>
    </g>
  )
}

function PodRow({ cl, p, x, y, lines, mark, selected, onPick }: { cl: ClusterState; p: Pod; x: number; y: number; lines: [string, string]; mark?: string; selected?: boolean; onPick?: () => void }) {
  const look = podLook(cl, p)
  const faded = !!p.deletion
  // a Running Pod whose Ready condition is false (e.g. on a NotReady node) is not drawn in „healthy” green
  const statusFill = look.status === 'Running' && !p.ready.status ? 'var(--orange)' : statusColor(look.status)
  return (
    <g>
      <PodShape x={x + 22} y={y + 28} size={32} status={look.shape} tone="teal" selected={selected} onClick={onPick} ariaLabel={`Pod ${p.name}: ${look.status}${onPick ? ' – odaberite' : ''}`} />
      <text x={x + 44} y={y + 14} className="k-svg-mono" style={{ fontSize: MONO, fontWeight: 700, fill: faded ? 'var(--ink-3)' : 'var(--ink)' }}>
        {shortName(p.name)}
      </text>
      <text x={x + 44} y={y + 32} className="k-svg-mono" style={{ fontSize: MONO, fontWeight: 600, fill: statusFill }}>
        {look.status}
      </text>
      {mark && (
        <text x={x + 44 + look.status.length * 7.8 + 10} y={y + 32} className="k-svg-mono" style={{ fontSize: MONO, fontWeight: 700, fill: 'var(--green)' }}>
          {mark}
        </text>
      )}
      <text x={x + 44} y={y + 50} className="k-svg-mono" style={{ fontSize: MONO, fill: lines[1] }}>
        {lines[0]}
      </text>
    </g>
  )
}

export function IdentityStage({ w, g, selected, onPick }: { w: IdLab; g: IdGeo; selected: number; onPick: (i: number) => void }) {
  const cl = w.cl
  const reps = stsReplicas(cl)
  const dp = deployPods(cl)
  const shownDp = dp.slice(0, 4)
  const D = g.deploy
  const S = g.sts
  const sharedPvc = cl.pvcs.find((c) => c.name === 'postgres-data')
  const sharedPv = sharedPvc ? cl.pvs.find((v) => v.id === sharedPvc.volumeId) : undefined
  const fridgeY = D.y + g.rowTop + g.rowH * 1.5 - 26
  const deploySub = w.variant === 'none' ? 'još nije primijenjen' : w.variant === 'no-volume' ? 'replicas: 3 · bez volumena' : 'replicas: 3 · jedan PVC (RWO)'
  const stsSub = reps === null ? 'obrisan – PVC-ovi ostaju' : `replicas: ${reps} · headless Service db`
  const label = `Lijevo Deployment postgres (${deploySub}), desno StatefulSet db (${stsSub}). ${[0, 1, 2]
    .map((i) => {
      const p = dbPod(cl, i)
      return `db-${i}: ${p ? `${p.nodeName ?? 'bez čvora'}, ${podLook(cl, p).status}` : 'nema Poda'}, PVC data-db-${i} ${pvcOrders(cl, dbPvc(cl, i)) ?? 'bez diska'}`
    })
    .join('; ')}.`
  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} role="group" aria-label={label} style={{ display: 'block', width: '100%', height: 'auto' }}>
      {cl.nodes.map((n, i) => (
        <Chip key={n.id} cl={cl} name={n.name} b={g.chip(i)} lines={g.chipLines} />
      ))}

      {/* ---- Deployment */}
      <PanelHead b={D} title="Deployment postgres" sub={deploySub} />
      {w.variant === 'none' ? (
        <g>
          <Rough shape={{ k: 'rect', x: D.x + 16, y: D.y + g.rowTop + 8, w: D.w - 32, h: g.rowH * 3 }} seed={19650} stroke="var(--ink-3)" strokeWidth={1.2} dash="6 5" />
          <text x={D.x + D.w / 2} y={D.y + g.rowTop + g.rowH * 1.4} textAnchor="middle" className="k-svg-hand" style={{ fontSize: HAND, fill: 'var(--ink-2)' }}>
            Odaberite u kontrolama:
          </text>
          <text x={D.x + D.w / 2} y={D.y + g.rowTop + g.rowH * 1.4 + 24} textAnchor="middle" className="k-svg-hand" style={{ fontSize: HAND, fill: 'var(--ink-2)' }}>
            Postgres s replicas: 3
          </text>
        </g>
      ) : (
        shownDp.map((p, k) => {
          const y = D.y + g.rowTop + k * g.rowH
          const look = podLook(cl, p)
          const orders = podOrders(cl, p)
          const node = p.nodeName ?? 'bez čvora'
          let third: [string, string]
          let mark: string | undefined
          if (look.multiAttach) third = [`${node} · ✗ Multi-Attach`, 'var(--red)']
          else if (look.lock) third = [`${node} · ✗ lock`, 'var(--red)']
          else if (orders !== null && p.processUp) {
            if (w.order && p.dataStoreId === w.order.store) mark = `✓ ${ORDER_NO}`
            third = [`${node} · ${orders} ${w.variant === 'shared-pvc' ? 'na PV-u' : 'u kontejneru'}`, 'var(--ink-2)']
          } else third = [node, 'var(--ink-3)']
          let cable: 'attached' | 'attaching' | 'stuck' | null = null
          if (sharedPv && !p.deletion) {
            const c = cableState(cl, sharedPv)
            if (look.multiAttach || look.lock) cable = 'stuck'
            else if (c.node === p.nodeName && c.state !== 'none') cable = c.state
          }
          const fx = D.x + D.w - 56
          return (
            <g key={p.id}>
              <PodRow cl={cl} p={p} x={D.x + 4} y={y} lines={third} mark={mark} />
              {cable && (
                <Cable
                  pts={[
                    [D.x + D.w - 92, y + 28],
                    [fx - 4, fridgeY + 26],
                  ]}
                  state={cable}
                  seed={19700 + k}
                />
              )}
            </g>
          )
        })
      )}
      {dp.length > 4 && (
        <text x={D.x + D.w - 10} y={D.y + 22} textAnchor="end" className="k-svg-mono" style={{ fontSize: MONO, fill: 'var(--ink-2)' }}>
          +{dp.length - 4}
        </text>
      )}
      {w.variant === 'shared-pvc' && sharedPvc && (
        <g>
          <FridgeDisk x={D.x + D.w - 56} y={fridgeY} w={40} h={52} count={sharedPv ? (cl.dataStores[`pv:${sharedPv.id}`]?.orders ?? 0) : null} seed={19720} />
          <text x={D.x + D.w - 36} y={fridgeY + 72} textAnchor="middle" className="k-svg-mono" style={{ fontSize: MONO, fontWeight: 700, fill: 'var(--ink)' }}>
            PVC
          </text>
        </g>
      )}

      {/* ---- StatefulSet */}
      <PanelHead b={S} title="StatefulSet db" sub={stsSub} />
      {[0, 1, 2].map((i) => {
        const y = S.y + g.rowTop + i * g.rowH
        const p = dbPod(cl, i)
        const pvc = dbPvc(cl, i)
        const pv = pvc ? cl.pvs.find((v) => v.id === pvc.volumeId) : undefined
        const orders = pvcOrders(cl, pvc)
        const fx = S.x + 200
        let reason = ''
        if (!p) reason = reps === null ? 'StatefulSet obrisan' : i >= reps ? `smanjeno (replicas: ${reps})` : i > 0 && !dbPod(cl, i - 1)?.ready.status ? `čeka db-${i - 1}` : 'stvara se…'
        let cable: 'attached' | 'attaching' | 'stuck' | null = null
        if (p && pv) {
          const c = cableState(cl, pv)
          if (c.state !== 'none' && c.node === p.nodeName) cable = c.state
        }
        return (
          <g key={i}>
            {p ? (
              <PodRow
                cl={cl}
                p={p}
                x={S.x + 4}
                y={y}
                lines={[p.nodeName ?? 'bez čvora', podLook(cl, p).multiAttach ? 'var(--red)' : 'var(--ink-2)']}
                selected={selected === i}
                onPick={() => onPick(i)}
              />
            ) : (
              <g>
                <GhostPod x={S.x + 26} y={y + 28} size={32} seed={19800 + i} />
                <text x={S.x + 48} y={y + 22} className="k-svg-mono" style={{ fontSize: MONO, fontWeight: 700, fill: 'var(--ink-3)' }}>
                  db-{i}
                </text>
                <text x={S.x + 48} y={y + 42} className="k-svg-hand" style={{ fontSize: HAND, fill: 'var(--ink-2)' }}>
                  {reason}
                </text>
              </g>
            )}
            {cable && (
              <Cable
                pts={[
                  [S.x + 184, y + 28],
                  [fx - 2, y + 28],
                ]}
                state={cable}
                seed={19820 + i}
              />
            )}
            {pvc ? (
              <g>
                <FridgeDisk x={fx} y={y + 6} w={28} h={44} count={orders} deleting={!!pvc.deletion} dim={!p} seed={19840 + i * 3} />
                <text x={fx + 34} y={y + 22} className="k-svg-mono" style={{ fontSize: MONO, fontWeight: 700, fill: 'var(--ink)' }}>
                  data-db-{i}
                </text>
                <text x={fx + 34} y={y + 40} className="k-svg-mono" style={{ fontSize: MONO, fill: pvc.deletion ? 'var(--red)' : 'var(--ink-2)' }}>
                  {pvc.deletion ? 'Terminating' : pvc.phase}
                </text>
              </g>
            ) : (
              <text x={fx} y={y + 34} className="k-svg-hand" style={{ fontSize: HAND, fill: 'var(--red)' }}>
                nema PVC-a
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
