/**
 * The flagship's stage: students queueing for klopa-api (traffic), the nodes as big pencil frames with their Pods
 * (klopa-api lunchboxes on blue tape, klopa-worker on teal tape), nodes the Cluster Autoscaler is still buying as
 * dashed frames with a countdown, and Pending Pods waiting for room. The viewBox follows the container width
 * (1 unit = 1 px), so lettering never shrinks below its CSS size.
 */
import { AnimatePresence } from 'motion/react'
import { Davor, Diagram, DLabel, NodeFrame, PodShape, Rough, SpeechBubble, StudentQueue, useWidth } from '../../../kit'
import { nodeView, podShapeView, streamRate, type ClusterState, type Node, type Pod } from '../../../engines/cluster'
import { API } from '../lib/story'
import { WORKER, webStream } from '../lib/flagship'
import { nodes as nodesWord, pods as podsWord } from '../lib/format'

const NODE_HEAD = 34
const NODE_FOOT = 30
/** the Pending strip is always reserved, so the stage does not jump when a Pod has nowhere to go */
const PENDING_H = 96
const PENDING_STEP = 62

interface Geo {
  W: number
  wide: boolean
  left: number
  top: number
  cols: number
  nodeW: number
  nodeH: number
  gap: number
  /** Pod size and the step between Pods in a row */
  pod: number
  step: number
}

function apiPods(c: ClusterState, node: string): Pod[] {
  return c.pods.filter((p) => p.nodeName === node && p.labels.app === API).sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name))
}

function workerPods(c: ClusterState, node: string): Pod[] {
  return c.pods.filter((p) => p.nodeName === node && p.labels.app === WORKER).sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name))
}

function perRow(nodeW: number, step: number): number {
  return Math.max(2, Math.floor((nodeW - 12) / step))
}

function geometry(W: number, c: ClusterState): Geo {
  const wide = W >= 640
  const left = wide ? 170 : 0
  const top = wide ? 8 : 92
  const gap = 12
  const avail = W - left - 4
  const cols = Math.max(2, Math.min(4, Math.floor((avail + gap) / (wide ? 200 : 150))))
  const nodeW = Math.floor((avail - (cols - 1) * gap) / cols)
  const pod = wide ? 42 : 40
  const step = wide ? 56 : 46
  // rows of Pods inside a node: as many as the busiest node needs right now
  let apiRows = 1
  // a row for klopa-worker only when KEDA runs it in this cluster („Davorov posao” has no worker)
  let wRows = c.cfg.keda ? 1 : 0
  for (const n of c.nodes) {
    apiRows = Math.max(apiRows, Math.ceil(apiPods(c, n.name).length / perRow(nodeW, step)))
    wRows = Math.max(wRows, Math.ceil(workerPods(c, n.name).length / perRow(nodeW, step)))
  }
  const nodeH = NODE_HEAD + (apiRows + wRows) * (pod + 16) + NODE_FOOT
  return { W, wide, left, top, cols, nodeW, nodeH, gap, pod, step }
}

function nodeXY(g: Geo, i: number) {
  const col = i % g.cols
  const row = Math.floor(i / g.cols)
  return { x: g.left + col * (g.nodeW + g.gap), y: g.top + row * (g.nodeH + g.gap) }
}

function davorSays(c: ClusterState, dropped: number, pending: number, provisioning: number): string[] {
  if (dropped > 0.5) return ['Narudžbe', 'propadaju!']
  if (pending > 0 && provisioning > 0) return ['Čekamo', 'novi čvor…']
  if (pending > 0) return ['Nema mjesta', 'za Podove!']
  const web = webStream(c)
  if (web && web.p95Ms > 300) return ['Sporo je…']
  return ['Mirno.', 'Spavam.']
}

/** „čvor 3” for the engine's node-3 (the kubectl name stays in the spec line and in the event log) */
function nodeTitle(name: string): string {
  const m = /(\d+)$/.exec(name)
  return m ? `čvor ${m[1]}` : name
}

export function FlagshipStage({ c }: { c: ClusterState }) {
  const [ref, measured] = useWidth<HTMLDivElement>()
  const W = Math.max(300, Math.round(measured ?? 720))
  const g = geometry(W, c)
  const nodeList = [...c.nodes].sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
  // reserve room for up to four nodes (a normal burst needs three), so the stage keeps its height while nodes come and go
  const slots = Math.max(nodeList.length, Math.min(4, c.cfg.autoscaler?.maxNodes ?? 4))
  const rows = Math.max(1, Math.ceil(slots / g.cols))
  const pending = c.pods.filter((p) => !p.nodeName && !p.deletion)
  const pendingY = g.top + rows * (g.nodeH + g.gap) + 8
  const H = Math.max(g.wide ? 236 : 0, pendingY + PENDING_H + 6)
  const web = webStream(c)
  const rps = web ? streamRate(c, web) : 0
  const droppedPerS = Math.max(0, c.series.errPerS.last(0))
  const provisioning = nodeList.filter((n) => n.machine === 'provisioning').length
  const queueCount = Math.max(1, Math.min(g.wide ? 7 : 6, Math.round(rps / 15)))
  const label = `Klaster: ${nodesWord(nodeList.length)}, ${podsWord(c.pods.filter((p) => p.labels.app === API && !p.deletion).length)} klopa-api, ${pending.length} u stanju Pending; promet ${Math.round(rps)} zahtjeva u sekundi.`

  return (
    <div ref={ref}>
      <Diagram width={W} height={H} label={label}>
        {/* traffic: the student queue in front of the menza */}
        {g.wide ? (
          <g>
            <StudentQueue x={140} y={86} count={queueCount} scale={0.4} tap={rps > 60} />
            <DLabel x={8} y={110} anchor="start" text={`${Math.round(rps)} zahtjeva/s`} mono bold size={15} />
            {droppedPerS > 0.5 && <DLabel x={8} y={132} anchor="start" text={`✗ ${Math.round(droppedPerS)}/s odbijeno`} mono size={14} tone="bad" />}
            <Rough shape={{ k: 'line', x1: 146, y1: 60, x2: g.left - 6, y2: 60 }} seed={1801} stroke="var(--ink-3)" strokeWidth={1.4} />
            <Rough shape={{ k: 'lin', pts: [[g.left - 13, 54], [g.left - 6, 60], [g.left - 13, 66]] }} seed={1802} stroke="var(--ink-3)" strokeWidth={1.4} roughness={0.5} />
            <Davor x={0} y={146} scale={0.62} buzz={droppedPerS > 0.5} mood={droppedPerS > 0.5 ? 'open' : pending.length > 0 ? 'worry' : 'smile'} />
            <SpeechBubble x={58} y={150} w={104} h={50} tx={38} ty={166} tail={16} lines={davorSays(c, droppedPerS, pending.length, provisioning)} size={18} />
          </g>
        ) : (
          <g>
            <StudentQueue x={128} y={72} count={queueCount} scale={0.36} tap={rps > 60} />
            <DLabel x={140} y={40} anchor="start" text={`${Math.round(rps)} zahtjeva/s`} mono bold size={15} />
            {droppedPerS > 0.5 && <DLabel x={140} y={62} anchor="start" text={`✗ ${Math.round(droppedPerS)}/s odbijeno`} mono size={14} tone="bad" />}
          </g>
        )}

        {nodeList.map((n, i) => (
          <NodeBox key={n.id} c={c} n={n} g={g} {...nodeXY(g, i)} />
        ))}
        {/* room the Cluster Autoscaler may fill: faint and empty */}
        {Array.from({ length: slots - nodeList.length }, (_, k) => {
          const p = nodeXY(g, nodeList.length + k)
          return (
            <g key={`slot${k}`} aria-hidden="true">
              <Rough shape={{ k: 'rect', x: p.x, y: p.y, w: g.nodeW, h: g.nodeH }} seed={1825 + k} stroke="var(--ink-4, var(--ink-3))" strokeWidth={1.1} dash="3 7" roughness={0.6} />
              <DLabel x={p.x + g.nodeW / 2} y={p.y + g.nodeH / 2 + 5} text="mjesto za novi čvor" size={13} />
            </g>
          )
        })}

        {/* Pods the scheduler could not place: they wait for a node (the strip stays, empty, when there are none) */}
        <g>
          <Rough shape={{ k: 'rect', x: g.left, y: pendingY, w: W - g.left - 4, h: PENDING_H - 8 }} seed={1810} stroke={pending.length > 0 ? 'var(--orange)' : 'var(--ink-3)'} strokeWidth={pending.length > 0 ? 1.4 : 1} dash={pending.length > 0 ? '7 5' : '3 7'} />
          <DLabel
            x={g.left + 10}
            y={pendingY + 22}
            anchor="start"
            text={pending.length > 0 ? `Pending: ${pending.length} – nema mjesta ni na jednom čvoru` : 'Pending: 0 – svi Podovi imaju mjesto'}
            tone={pending.length > 0 ? 'warn' : 'neutral'}
            size={13}
          />
          <AnimatePresence>
            {pending.slice(0, Math.max(1, Math.floor((W - g.left - 30) / PENDING_STEP))).map((p, j) => (
              <PodShape key={p.id} x={g.left + 40 + j * PENDING_STEP} y={pendingY + 60} size={40} status="pending" label={p.labels.app === API ? 'api' : 'wrk'} tone={p.labels.app === API ? 'blue' : 'teal'} ariaLabel={`Pod ${p.name}: Pending`} />
            ))}
          </AnimatePresence>
        </g>
      </Diagram>
    </div>
  )
}

function NodeBox({ c, n, g, x, y }: { c: ClusterState; n: Node; g: Geo; x: number; y: number }) {
  if (n.machine === 'provisioning') {
    const v = nodeView(c, n)
    const left = v.provisioningRemainingS ?? 0
    return (
      <g>
        <Rough shape={{ k: 'rect', x, y, w: g.nodeW, h: g.nodeH }} seed={1820} stroke="var(--ink-3)" strokeWidth={1.5} dash="9 6" />
        <text x={x + 12} y={y + 24} className="k-nodeframe__name" style={{ fill: 'var(--ink-2)' }}>
          {nodeTitle(n.name)}
        </text>
        <DLabel x={x + g.nodeW / 2} y={y + g.nodeH / 2 - 4} text="čvor se pokreće…" tone="warn" size={14} />
        <DLabel x={x + g.nodeW / 2} y={y + g.nodeH / 2 + 22} text={`još ${Math.ceil(left)} s (sim)`} mono size={13} />
      </g>
    )
  }
  const v = nodeView(c, n)
  const api = apiPods(c, n.name)
  const workers = workerPods(c, n.name)
  const kA = perRow(g.nodeW, g.step)
  const kW = kA
  const P = g.pod
  const x0 = x + 6 + g.step / 2
  const apiRows = Math.max(1, Math.ceil(api.length / kA))
  const unneeded = v.unneededForS
  return (
    <NodeFrame
      x={x}
      y={y}
      w={g.nodeW}
      h={g.nodeH}
      name={nodeTitle(n.name)}
      spec={g.nodeW >= 300 ? `${n.name} · 2 vCPU · 8 GiB` : g.nodeW >= 230 ? '2 vCPU · 8 GiB' : undefined}
      cpu={{ used: v.requested.cpuM, total: v.allocatable.cpuM }}
    >
      {unneeded !== null && unneeded > 0 && (
        <DLabel x={x + g.nodeW - 10} y={y + 24} anchor="end" text={`višak ${Math.floor(unneeded)} s`} tone="warn" size={12} />
      )}
      <AnimatePresence>
        {api.map((p, j) => {
          const sv = podShapeView(p)
          return (
            <PodShape
              key={p.id}
              x={x0 + (j % kA) * g.step}
              y={y + NODE_HEAD + 26 + Math.floor(j / kA) * (P + 16)}
              size={P}
              status={sv.status}
              label="api"
              tone="blue"
              ariaLabel={`Pod ${p.name}: ${sv.label}`}
            />
          )
        })}
        {workers.map((p, j) => {
          const sv = podShapeView(p)
          return (
            <PodShape
              key={p.id}
              x={x0 + (j % kW) * g.step}
              y={y + NODE_HEAD + apiRows * (P + 16) + 26 + Math.floor(j / kW) * (P + 16)}
              size={P}
              status={sv.status}
              label="wrk"
              tone="teal"
              ariaLabel={`Pod ${p.name}: ${sv.label}`}
            />
          )
        })}
      </AnimatePresence>
    </NodeFrame>
  )
}
