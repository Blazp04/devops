/**
 * Scene 1 „Lanac vlasništva”: Deployment → ReplicaSet → Pods on three small nodes (E3 engine, nodes 'small').
 * Delete a Pod and the ReplicaSet fills the empty ghost; change a Pod's label and it escapes (a new one appears);
 * ask for 10 replicas and one stays Pending – replicas are Pods, not machines.
 */
import { AnimatePresence } from 'motion/react'
import {
  Button,
  DLabel,
  Diagram,
  EventLog,
  FreeSlot,
  K8sGlyph,
  PodShape,
  RecipeCard,
  Rough,
  SimFrame,
  Slider,
  Stat,
  StatRow,
  useSimulation,
  useWidth,
} from '../../../kit'
import { deletePod, scaleDeployment, setPodLabel, stepCluster, type ClusterState } from '../../../engines/cluster'
import type { PodDot } from '../lib/board'
import { createOwnership, ownGeo, ownView, slotCenter, type OwnGeo, type OwnLayout, type OwnView } from '../lib/ownership'
import styles from '../styles.module.css'

/** wide viewBox 720 with 13-unit Plex Mono: ≥ 12 px from 720 × 12 / 13 ≈ 665 px */
const WIDE_MIN = 665

export function OwnershipLab() {
  const sim = useSimulation<ClusterState>({ init: createOwnership, step: (c, dt) => stepCluster(c, dt) })
  const c = sim.state
  const v = ownView(c)
  const [ref, width] = useWidth<HTMLDivElement>()
  const layout: OwnLayout = width !== null && width >= WIDE_MIN ? 'wide' : 'narrow'
  const g = ownGeo(layout)

  const firstOwned = () => {
    for (const pods of Object.values(v.byNode)) for (const p of pods) if (v.owned.has(p.id) && !p.terminating && p.status === 'running') return p
    return null
  }
  const kill = (p: PodDot) => sim.mutate((s) => void deletePod(s, p.name))
  const target = firstOwned()

  return (
    <SimFrame
      title="Lanac vlasništva"
      subtitle="Probni klaster s tri mala čvora: na svaki stanu tri Poda klopa-api."
      sim={sim}
      hint="Obrišite Pod (kliknite ga) i gledajte kako ReplicaSet popuni prazno mjesto. Zatim jednom Podu promijenite oznaku, a na kraju tražite 10 replika."
      minHeight={340}
      controls={
        <>
          <Slider label="replicas" value={v.replicas} min={1} max={10} onChange={(n) => sim.mutate((s) => void scaleDeployment(s, 'klopa-api', n))} hint="kubectl scale" />
          <Button variant="danger" disabled={!target} onClick={() => target && kill(target)}>
            Obriši Pod
          </Button>
          <Button disabled={!target} onClick={() => target && sim.mutate((s) => void setPodLabel(s, target.name, 'app', 'klopa-api-proba'))} title="kubectl label pod … app=klopa-api-proba --overwrite">
            Promijeni oznaku Poda
          </Button>
        </>
      }
      stats={
        <>
          <StatRow>
            <Stat label="ReplicaSet želi" value={v.replicas} />
            <Stat label="ima (bez onih u gašenju)" value={v.current} />
            <Stat label="spremnih" value={v.ready} tone={v.ready < v.replicas ? 'warn' : 'ok'} />
            <Stat label="Pending" value={v.pending.length} tone={v.pendingMessage ? 'bad' : v.pending.length ? 'warn' : 'neutral'} sub={v.pendingMessage ? 'nema mjesta na čvoru' : v.pending.length ? 'čeka raspoređivanje' : 'svi su raspoređeni'} />
            <Stat label="bez vlasnika" value={v.orphans.size} tone={v.orphans.size ? 'warn' : 'neutral'} />
          </StatRow>
          <EventLog events={c.events.slice(-12).map((e) => ({ id: e.id, t: e.t, text: e.text, tone: e.tone }))} />
        </>
      }
    >
      <div ref={ref}>
        <div style={layout === 'narrow' ? { maxWidth: 460, margin: '0 auto' } : undefined}>
        <Diagram
          width={g.W}
          height={g.H}
          interactive
          label={`Deployment klopa-api, replicas: ${v.replicas}. ReplicaSet – Podova (bez onih u gašenju): ${v.current}, spremnih: ${v.ready}, čeka čvor: ${v.pending.length}, bez vlasnika: ${v.orphans.size}.`}
        >
          <OwnDrawing v={v} g={g} layout={layout} onKill={kill} slotLabels={width !== null && width >= 720} />
        </Diagram>
        </div>
        {v.pendingMessage && (
          <p className={`${styles.kubectl} k-card k-pinned mono`}>
            Warning FailedScheduling: {v.pendingMessage}
          </p>
        )}
      </div>
    </SimFrame>
  )
}

function OwnDrawing({ v, g, layout, onKill, slotLabels }: { v: OwnView; g: OwnGeo; layout: OwnLayout; onKill: (p: PodDot) => void; slotLabels: boolean }) {
  const wide = layout === 'wide'
  // RS anchor: where ownership lines leave the ReplicaSet
  const anchor: [number, number] = wide ? [g.rs.x + 40, g.rs.y + 104] : [g.rs.x + 140, g.rs.y + 72]
  const pos = new Map<string, [number, number]>()
  g.nodes.forEach((n, i) => {
    const pods = v.byNode[`node-${i + 1}`] ?? []
    pods.slice(0, 3).forEach((p, j) => pos.set(p.id, slotCenter(n, j, layout)))
  })
  v.pending.slice(0, wide ? 3 : 5).forEach((p, j) => pos.set(p.id, [g.pending.x + 36 + j * (g.pod * 1.45), g.pending.y + g.pending.h * 0.62]))
  const ghosts = Math.min(10, v.replicas)
  const gw = 26
  return (
    <>
      {/* Deployment = recipe card */}
      <RecipeCard x={g.card.x} y={g.card.y} w={g.card.w} h={g.card.h} lines={0} />
      {wide ? (
        <>
          <text x={g.card.x + 10} y={g.card.y + 24} className="k-svg-display" style={{ fontSize: 15, fontWeight: 800, fill: 'var(--note-ink)' }}>
            Deployment
          </text>
          <text x={g.card.x + 10} y={g.card.y + 48} className="k-svg-mono" style={{ fontSize: 13, fontWeight: 600, fill: 'var(--note-ink)' }}>
            klopa-api
          </text>
          <text x={g.card.x + 10} y={g.card.y + 70} className="k-svg-mono" style={{ fontSize: 13, fill: 'var(--note-ink)' }}>
            replicas: {v.replicas}
          </text>
        </>
      ) : (
        <text x={g.card.x + 10} y={g.card.y + 31} className="k-svg-mono" style={{ fontSize: 13, fontWeight: 600, fill: 'var(--note-ink)' }}>
          Deployment klopa-api · replicas: {v.replicas}
        </text>
      )}
      {/* Deployment owns the ReplicaSet */}
      <Rough
        shape={{ k: 'lin', pts: wide ? [[g.card.x + g.card.w, g.card.y + 40], [g.rs.x - 26, g.rs.y + 12]] : [[18, g.card.y + g.card.h], [18, g.rs.y + 6], [g.rs.x - 24, g.rs.y + 6]] }}
        seed={9101}
        stroke="var(--ink-2)"
        strokeWidth={1.4}
      />
      <K8sGlyph kind="rs" x={g.rs.x - 22} y={g.rs.y - 2} w={20} h={16} />
      <text x={g.rs.x + 2} y={g.rs.y + 12} className="k-svg-mono" style={{ fontSize: 13, fontWeight: 600, fill: 'var(--ink)' }}>
        {wide ? `ReplicaSet ${v.rsName}` : `ReplicaSet …-${v.rsHash}`}
      </text>
      <text x={g.rs.x + 2} y={g.rs.y + 32} className="k-svg-mono" style={{ fontSize: 13, fill: 'var(--ink-2)' }}>
        selector: app=klopa-api + hash
      </text>
      {/* desired = dashed ghosts; a ghost is filled by an owned Pod that exists, ✓ when it is Ready */}
      {Array.from({ length: ghosts }, (_, i) => {
        const x = g.rs.x + 2 + i * (gw + 3)
        const y = g.rs.y + 42
        const filled = i < v.current
        const ok = i < v.ready
        return (
          <g key={i}>
            <Rough shape={{ k: 'rect', x, y, w: gw, h: 20 }} seed={9200 + i} stroke={filled ? 'var(--ink-2)' : 'var(--red)'} strokeWidth={filled ? 1.3 : 1.4} dash={filled ? undefined : '3 3'} fillColor={filled ? 'var(--hl-blue-ink)' : undefined} hachureGap={3.4} roughness={0.8} />
            {ok && (
              <text x={x + gw / 2} y={y + 15} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 13, fontWeight: 700, fill: 'var(--green)' }}>
                ✓
              </text>
            )}
          </g>
        )
      })}
      {/* ownerReferences: one pen line per Pod the ReplicaSet owns */}
      <g aria-hidden="true">
        {[...pos.entries()]
          .filter(([id]) => v.owned.has(id))
          .map(([id, [x, y]], i) => (
            <Rough key={id} shape={{ k: 'line', x1: anchor[0], y1: anchor[1], x2: x, y2: y - g.pod * 0.5 }} seed={9300 + i} stroke="var(--pen)" strokeWidth={1} roughness={0.6} />
          ))}
      </g>
      {/* Pending area */}
      <Rough shape={{ k: 'rect', ...g.pending }} seed={9401} stroke="var(--ink-3)" strokeWidth={1.2} dash="5 5" />
      <DLabel x={g.pending.x + 8} y={g.pending.y + 22} text="čekaju čvor (Pending)" anchor="start" size={13} />
      {v.pending.length > (wide ? 3 : 5) && <DLabel x={g.pending.x + g.pending.w - 8} y={g.pending.y + 22} text={`+${v.pending.length - (wide ? 3 : 5)}`} anchor="end" size={13} tone="bad" />}
      {/* nodes with three places each */}
      {g.nodes.map((n, i) => {
        const pods = v.byNode[`node-${i + 1}`] ?? []
        return (
          <g key={i}>
            <Rough shape={{ k: 'rect', x: n.x, y: n.y, w: n.w, h: n.h }} seed={9500 + i} stroke="var(--ink-2)" strokeWidth={1.5} />
            <text x={n.x + 10} y={n.y + 22} className="k-svg-mono" style={{ fontSize: 13, fontWeight: 600, fill: 'var(--ink)' }}>
              node-{i + 1} · 3 mjesta
            </text>
            {[0, 1, 2].map((j) =>
              j >= pods.length ? (
                <FreeSlot key={j} x={slotCenter(n, j, layout)[0] - n.w / 6 + 6} y={slotCenter(n, j, layout)[1] - g.pod * 0.62} w={n.w / 3 - 12} h={g.pod * 1.24} label={wide && slotLabels ? 'slobodno' : ''} />
              ) : null,
            )}
          </g>
        )
      })}
      <AnimatePresence>
        {[...pos.entries()].map(([id, [x, y]]) => {
          const p = findPod(v, id)
          if (!p) return null
          const orphan = v.orphans.has(id)
          return (
            <PodShape
              key={id}
              x={x}
              y={y}
              size={g.pod}
              status={p.status}
              tone={orphan ? 'amber' : p.tone}
              label={g.pod >= 43 ? p.version : undefined}
              onClick={p.terminating ? undefined : () => onKill(p)}
              ariaLabel={`Pod ${p.name} (${p.statusText}${orphan ? ', bez vlasnika' : ''}) – obriši`}
            />
          )
        })}
      </AnimatePresence>
      {[...pos.entries()]
        .filter(([id]) => v.orphans.has(id))
        .map(([id, [x, y]]) => {
          const node = g.nodes.find((n) => x > n.x && x < n.x + n.w && y > n.y && y < n.y + n.h)
          return wide || !node ? (
            <DLabel key={id} x={x} y={y + g.pod * 0.62 + 22} text="bez vlasnika" size={13} tone="bad" />
          ) : (
            <DLabel key={id} x={node.x + node.w - 8} y={node.y + 22} text="bez vlasnika" anchor="end" size={13} tone="bad" />
          )
        })}
    </>
  )
}

function findPod(v: OwnView, id: string): PodDot | undefined {
  for (const pods of Object.values(v.byNode)) for (const p of pods) if (p.id === id) return p
  return v.pending.find((p) => p.id === id)
}
