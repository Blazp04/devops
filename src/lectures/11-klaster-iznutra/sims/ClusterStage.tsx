import { AnimatePresence } from 'motion/react'
import { Cross, FreeSlot, K8sGlyph, MiniLaptop, NodeFrame, PodShape, Rough, StepBadge, SvgStamp, plural, pointAt, stepColor, type K8sKind, type PodTone } from '../../../kit'
import { activeMessages, apiPod, messageProgress, podShapeStatus, podStatus, type ClusterState, type ControlPlaneMessage, type Pod } from '../../../engines/cluster'
import { polyD, routeFor, type Box, type NodeGeo, type Pt, type StageFs, type StageGeo } from './stage'
import { SLOT_MI, SLOTS_PER_NODE, freeSlots, isPullError } from '../model'

/* ------------------------------------------------------------------ labels */

function podTone(p: Pod): PodTone {
  if (p.labels.app === 'klopa-worker') return 'teal'
  if (p.labels.app === 'ivina-proba') return 'amber'
  return 'blue'
}

function podCaption(p: Pod): string {
  if (p.labels.app === 'klopa-worker') return 'worker'
  if (p.labels.app === 'ivina-proba') return 'proba'
  return p.name.split('-').at(-1) ?? p.name
}

function slotsOf(p: Pod): number {
  const mem = p.spec.resources.requests.memMi ?? SLOT_MI
  return Math.max(1, Math.min(SLOTS_PER_NODE, Math.round(mem / SLOT_MI)))
}

function onDeadMachine(s: ClusterState, p: Pod): boolean {
  const node = s.nodes.find((n) => n.name === p.nodeName)
  return !!node && node.machine !== 'running'
}

/**
 * What the microscope sees on the node (the API may show a frozen status meanwhile). A Pod whose image cannot be
 * pulled never started: 'notready', not the crash face (that is CrashLoopBackOff, L12). On a powered-off machine
 * there is no process any more: a faded 'notready' Pod, 'terminating' once it is marked for deletion.
 */
function liveShape(s: ClusterState, p: Pod) {
  if (onDeadMachine(s, p)) return p.deletion ? ('terminating' as const) : ('notready' as const)
  if (!p.deletion && isPullError(p)) return 'notready' as const
  return podShapeStatus(p)
}

/* ------------------------------------------------------------------ control-plane card */

function CompCard({ box, glyph, title, role, off, seed, narrow, fs }: { box: Box; glyph: K8sKind; title: string[]; role: string; off: boolean; seed: number; narrow: boolean; fs: StageFs }) {
  const gw = narrow ? 32 : 40
  const gh = narrow ? 26 : 32
  return (
    <g>
      <Rough shape={{ k: 'rect', x: box.x, y: box.y, w: box.w, h: box.h }} seed={seed} stroke={off ? 'var(--red)' : 'var(--ink)'} strokeWidth={1.7} fillColor="var(--paper)" fillStyle="solid" dash={off ? '6 4' : undefined} />
      <g opacity={off ? 0.4 : 1}>
        <K8sGlyph kind={glyph} x={box.x + 8} y={box.y + 8} w={gw} h={gh} />
      </g>
      <text x={box.x + gw + 14} y={box.y + 27} className="k-svg-display" style={{ fontSize: narrow ? 15 : fs.title }}>
        {title.map((t, i) => (
          <tspan key={t} x={box.x + gw + 14} dy={i ? 18 : 0}>
            {t}
          </tspan>
        ))}
      </text>
      <text x={narrow ? box.x + 10 : box.x + gw + 14} y={box.y + box.h - 14} className="k-svg-hand" style={{ fontSize: fs.hand, fill: off ? 'var(--red)' : 'var(--ink-2)' }}>
        {off ? 'isključen' : role}
      </text>
      {off && <Cross x={box.x + box.w - 16} y={box.y + 16} size={8} />}
    </g>
  )
}

/** API poslužitelj: the counter window on top, name and process name below. */
function ApiCard({ box, off, fs }: { box: Box; off: boolean; fs: StageFs }) {
  return (
    <g>
      <Rough shape={{ k: 'rect', x: box.x, y: box.y, w: box.w, h: box.h }} seed={1101} stroke={off ? 'var(--red)' : 'var(--ink)'} strokeWidth={2} multi fillColor="var(--paper)" fillStyle="solid" dash={off ? '6 4' : undefined} />
      <g opacity={off ? 0.4 : 1}>
        <K8sGlyph kind="api" x={box.x + box.w / 2 - 22} y={box.y + 8} w={44} h={34} />
      </g>
      <text x={box.x + box.w / 2} y={box.y + 60} textAnchor="middle" className="k-svg-display" style={{ fontSize: fs.title }}>
        API poslužitelj
      </text>
      <text x={box.x + box.w / 2} y={box.y + 80} textAnchor="middle" className="k-svg-hand" style={{ fontSize: fs.hand, fill: off ? 'var(--red)' : 'var(--ink-2)' }}>
        {off ? 'isključen' : 'jedini piše u etcd'}
      </text>
      {off && <Cross x={box.x + box.w - 16} y={box.y + 16} size={9} />}
    </g>
  )
}

function EtcdCard({ box, off, narrow, fs }: { box: Box; off: boolean; narrow: boolean; fs: StageFs }) {
  return (
    <g>
      <Rough shape={{ k: 'rect', x: box.x, y: box.y, w: box.w, h: box.h }} seed={1121} stroke={off ? 'var(--red)' : 'var(--ink)'} strokeWidth={1.7} fillColor="var(--paper)" fillStyle="solid" dash={off ? '6 4' : undefined} />
      <g opacity={off ? 0.4 : 1}>
        <K8sGlyph kind="etcd" x={box.x + 8} y={box.y + 10} w={34} h={34} />
      </g>
      <text x={box.x + 50} y={box.y + (narrow ? 34 : 26)} className="k-svg-display" style={{ fontSize: fs.title }}>
        etcd
      </text>
      {!narrow && (
        <text x={box.x + 50} y={box.y + box.h - 10} className="k-svg-hand" style={{ fontSize: fs.hand, fill: off ? 'var(--red)' : 'var(--ink-2)' }}>
          {off ? 'isključen' : 'izvor istine'}
        </text>
      )}
      {narrow && (
        <text x={box.x + box.w} y={box.y + box.h + 26} textAnchor="end" className="k-svg-hand" style={{ fontSize: fs.hand, fill: off ? 'var(--red)' : 'var(--ink-2)' }}>
          {off ? 'isključen' : 'izvor istine'}
        </text>
      )}
      {off && <Cross x={box.x + box.w - 14} y={box.y + 14} size={8} />}
    </g>
  )
}

/* ------------------------------------------------------------------ node */

interface PodPlace {
  pod: Pod
  slot: Box
  span: Box[]
}

function placePods(s: ClusterState, n: NodeGeo): { placed: PodPlace[]; used: number } {
  const pods = s.pods.filter((p) => p.nodeName === n.name).sort((a, b) => a.createdAt - b.createdAt || (a.name < b.name ? -1 : 1))
  const placed: PodPlace[] = []
  let cursor = 0
  for (const p of pods) {
    const k = slotsOf(p)
    if (cursor + k > n.slots.length) continue
    placed.push({ pod: p, slot: n.slots[cursor], span: n.slots.slice(cursor, cursor + k) })
    cursor += k
  }
  return { placed, used: cursor }
}

function PodWithCaption({ s, p, slot, selected, onSelect, captionDy, fs }: { s: ClusterState; p: Pod; slot: Box; selected: boolean; onSelect: (name: string) => void; captionDy: number; fs: StageFs }) {
  const cx = slot.x + slot.w / 2
  const cy = slot.y + 24
  const shape = liveShape(s, p)
  const st = podStatus(apiPod(p))
  const dead = onDeadMachine(s, p)
  const pullErr = !dead && !p.deletion && isPullError(p)
  return (
    <g>
      <g opacity={dead ? 0.45 : 1}>
      <PodShape
        x={cx}
        y={cy}
        size={28}
        status={shape}
        tone={podTone(p)}
        selected={selected}
        onClick={() => onSelect(p.name)}
        ariaLabel={`Pod ${p.name}: ${st}${dead ? ', stroj je ugašen' : ''}${selected ? ' (odabran)' : ''}`}
      />
      </g>
      <text x={cx} y={slot.y + captionDy} textAnchor="middle" className="k-svg-mono k-dhalo" style={{ fontSize: fs.mono, fill: pullErr ? 'var(--red)' : dead ? 'var(--ink-3)' : 'var(--ink-2)' }}>
        {pullErr ? 'slika ✗' : podCaption(p)}
      </text>
    </g>
  )
}

function NodeDrawing({ s, n, selected, onSelect, captionDy, fs }: { s: ClusterState; n: NodeGeo; selected: string | null; onSelect: (name: string) => void; captionDy: number; fs: StageFs }) {
  const node = s.nodes.find((x) => x.name === n.name)
  if (!node) return null
  const off = node.machine !== 'running'
  const kubeletOff = !off && !node.kubeletUp
  const ready = node.condition.ready === 'True'
  const { placed, used } = placePods(s, n)
  const free = off ? 0 : freeSlots(s, n.name)
  const freeBoxes = off ? [] : n.slots.slice(used, used + free)
  return (
    <g>
      <NodeFrame x={n.x} y={n.y} w={n.w} h={n.h} name={n.name} status={ready ? 'ready' : 'notready'} />
      {freeBoxes.map((b, i) => (
        <FreeSlot key={i} x={b.x + 6} y={b.y + 4} w={b.w - 12} h={b.h - 10} label="" />
      ))}
      {ready && (
        <text x={n.x + 84} y={n.y + 22} className="k-svg-hand" style={{ fontSize: fs.hand, fill: free > 0 ? 'var(--green)' : 'var(--orange)' }}>
          {free > 0 ? `slobodno: ${free}` : 'nema mjesta'}
        </text>
      )}
      {/* kubelet → containerd */}
      <g>
        <Rough shape={{ k: 'rect', ...n.kubelet }} seed={1300 + n.x} stroke={kubeletOff || off ? 'var(--red)' : 'var(--ink-2)'} strokeWidth={1.4} dash={kubeletOff || off ? '5 4' : undefined} />
        <g opacity={kubeletOff || off ? 0.4 : 1}>
          <K8sGlyph kind="kubelet" x={n.kubelet.x + 3} y={n.kubelet.y + 2} w={26} h={22} />
        </g>
        <text x={n.kubelet.x + 33} y={n.kubelet.y + 18} className="k-svg-mono" style={{ fontSize: fs.mono, fill: kubeletOff ? 'var(--red)' : 'var(--ink)' }}>
          kubelet
        </text>
        {kubeletOff && <Cross x={n.kubelet.x + n.kubelet.w - 8} y={n.kubelet.y + 4} size={7} />}
        <Rough shape={{ k: 'lin', pts: [[n.kubelet.x + n.kubelet.w + 2, n.kubelet.y + 13], [n.runtime.x - 2, n.runtime.y + 13]] }} seed={1310 + n.x} stroke="var(--ink-3)" strokeWidth={1.2} />
        <Rough shape={{ k: 'rect', ...n.runtime }} seed={1320 + n.x} stroke={off ? 'var(--red)' : 'var(--ink-2)'} strokeWidth={1.4} dash={off ? '5 4' : undefined} />
        <text x={n.runtime.x + n.runtime.w / 2} y={n.runtime.y + 18} textAnchor="middle" className="k-svg-mono" style={{ fontSize: fs.mono }}>
          containerd
        </text>
      </g>
      {placed.map(({ pod, span }) => (
        <g key={pod.id}>
          {span.length > 1 &&
            span.map((b, i) =>
              i === 0 ? null : (
                <Rough key={i} shape={{ k: 'rect', x: b.x + 6, y: b.y + 4, w: b.w - 12, h: b.h - 10 }} seed={1400 + i} stroke="var(--ink-3)" strokeWidth={1.1} fillColor="var(--hl-orange-ink)" hachureGap={7} fillWeight={0.9} />
              ),
            )}
          {span.length > 1 && (
            <text x={span[1].x + 8} y={span[1].y + 30} className="k-svg-hand k-dhalo" style={{ fontSize: fs.hand, fill: 'var(--ink)' }}>
              ×{span.length}
            </text>
          )}
        </g>
      ))}
      <AnimatePresence>
        {placed.map(({ pod, slot }) => (
          <PodWithCaption key={pod.id} s={s} p={pod} slot={slot} selected={selected === pod.name} onSelect={onSelect} captionDy={captionDy} fs={fs} />
        ))}
      </AnimatePresence>
      {off && <SvgStamp x={n.x + n.w - 70} y={n.y + 20} text="UGAŠEN" tone="red" size={18} rotate={-6} />}
    </g>
  )
}

/* ------------------------------------------------------------------ messages */

function MessageDot({ s, g, m }: { s: ClusterState; g: StageGeo; m: ControlPlaneMessage }) {
  const route = routeFor(g, m.from, m.to)
  if (!route) return null
  const [x, y] = pointAt(route, messageProgress(s, m))
  if (m.step === 0) return <circle cx={x} cy={y} r={5} fill="var(--pen)" />
  const c = stepColor(m.step - 1)
  return (
    <g>
      <path d={polyD(route)} fill="none" stroke={c} strokeWidth={2.4} strokeLinecap="round" opacity={0.55} />
      <circle cx={x} cy={y} r={18} className="k-paper-fill" />
      <StepBadge n={m.step} x={x} y={y} r={15} color={c} />
    </g>
  )
}

/* ------------------------------------------------------------------ the stage */

export function ClusterStage({ s, g, selected, onSelect, traffic }: { s: ClusterState; g: StageGeo; selected: string | null; onSelect: (name: string) => void; traffic: { text: string; tone: 'ok' | 'warn' | 'bad' } }) {
  const c = s.components
  const fs = g.fs
  const narrow = g.layout === 'narrow'
  const pending = s.pods.filter((p) => p.nodeName === null && !p.deletion)
  const captionDy = narrow ? 60 : 56
  const line = (key: string, on: boolean, dashed: boolean, seed: number) => {
    const r = g.routes[key]
    if (!r) return null
    return <Rough key={key} shape={{ k: 'lin', pts: r }} seed={seed} stroke={on ? 'var(--pen)' : 'var(--ink-4)'} strokeWidth={1.5} dash={dashed ? '6 5' : undefined} roughness={0.8} />
  }
  return (
    <>
      {/* control plane: double blue pen line */}
      <Rough shape={{ k: 'rect', ...g.cp }} seed={1001} stroke="var(--pen)" strokeWidth={1.6} roughness={1.2} />
      <Rough shape={{ k: 'rect', x: g.cp.x + 4, y: g.cp.y + 4, w: g.cp.w - 8, h: g.cp.h - 8 }} seed={1002} stroke="var(--pen)" strokeWidth={1.2} roughness={1.2} />
      {narrow ? (
        <text x={g.cpLabel[0]} y={g.cpLabel[1]} className="k-svg-hand" style={{ fontSize: fs.hand, fill: 'var(--pen)' }}>
          upravljačka ravnina
        </text>
      ) : (
        <text x={10} y={36} className="k-svg-hand" style={{ fontSize: fs.hand, fill: 'var(--pen)' }}>
          <tspan x={10}>upravljačka</tspan>
          <tspan x={10} dy={24}>
            ravnina →
          </tspan>
        </text>
      )}

      {/* fixed lines: kubectl and the API talk over HTTPS; everyone else WATCHES the API (dashed) */}
      {line('kubectl>apiserver', c.apiServer, false, 1011)}
      {line('controller-manager>apiserver', c.apiServer && c.controllerManager, true, 1013)}
      {line('scheduler>apiserver', c.apiServer && c.scheduler, true, 1014)}
      {g.nodes.map((n, i) => {
        const node = s.nodes.find((x) => x.name === n.name)
        return line(`apiserver>kubelet:${n.name}`, c.apiServer && !!node && node.machine === 'running' && node.kubeletUp, true, 1020 + i)
      })}
      {/* API ↔ etcd: the only link to the store (double line) */}
      {(() => {
        const r = g.routes['apiserver>etcd']
        const vertical = Math.abs(r[0][0] - r[1][0]) < 1
        const o: Pt = vertical ? [4, 0] : [0, 4]
        const on = c.apiServer && c.etcd
        return (
          <g>
            <Rough shape={{ k: 'line', x1: r[0][0] - o[0], y1: r[0][1] - o[1], x2: r[1][0] - o[0], y2: r[1][1] - o[1] }} seed={1031} stroke={on ? 'var(--ink)' : 'var(--ink-4)'} strokeWidth={1.6} />
            <Rough shape={{ k: 'line', x1: r[0][0] + o[0], y1: r[0][1] + o[1], x2: r[1][0] + o[0], y2: r[1][1] + o[1] }} seed={1032} stroke={on ? 'var(--ink)' : 'var(--ink-4)'} strokeWidth={1.6} />
          </g>
        )
      })()}

      {/* kubectl on Lana's laptop */}
      <g>
        {narrow ? (
          <>
            <MiniLaptop x={g.laptop.x + 4} y={g.laptop.y + 6} w={56} h={44} />
            <text x={g.laptop.x + 70} y={g.laptop.y + 26} className="k-svg-mono" style={{ fontSize: fs.mono, fill: c.apiServer ? 'var(--ink)' : 'var(--red)' }}>
              kubectl
            </text>
            <text x={g.laptop.x + 70} y={g.laptop.y + 52} className="k-svg-hand" style={{ fontSize: fs.hand, fill: 'var(--ink-2)' }}>
              Lanin laptop
            </text>
          </>
        ) : (
          <>
            <MiniLaptop x={g.laptop.x + 8} y={g.laptop.y + 2} w={74} h={56} />
            <text x={g.laptop.x + 8} y={g.laptop.y + 80} className="k-svg-mono" style={{ fontSize: fs.mono, fill: c.apiServer ? 'var(--ink)' : 'var(--red)' }}>
              kubectl
            </text>
            <text x={g.laptop.x + 86} y={g.laptop.y + 40} className="k-svg-hand" style={{ fontSize: fs.hand, fill: 'var(--ink-2)' }}>
              Lana
            </text>
          </>
        )}
      </g>

      <EtcdCard box={g.etcd} off={!c.etcd} narrow={narrow} fs={fs} />
      <ApiCard box={g.api} off={!c.apiServer} fs={fs} />
      <CompCard box={g.cm} glyph="cm-ctrl" title={narrow ? ['controller-', 'manager'] : ['controller-manager']} role="nedostaje li Podova?" off={!c.controllerManager} seed={1141} narrow={narrow} fs={fs} />
      <CompCard box={g.sched} glyph="sched" title={['raspoređivač']} role="Pod bez čvora?" off={!c.scheduler} seed={1151} narrow={narrow} fs={fs} />

      {/* Pending Pods: objects on the board without a node */}
      <text x={g.pending.label[0]} y={g.pending.label[1]} className="k-svg-hand" style={{ fontSize: fs.hand, fill: pending.length ? 'var(--orange)' : 'var(--ink-3)' }}>
        {pending.length ? (c.scheduler ? `Pending · ${plural(pending.length, ['čeka', 'čekaju', 'čeka'])} čvor` : 'Pending · nitko ne raspoređuje') : 'Pending: nitko ne čeka'}
      </text>
      <AnimatePresence>
        {pending.slice(0, g.pending.max).map((p, i) => (
          <PodWithCaption
            key={p.id}
            s={s}
            p={p}
            slot={{ x: g.pending.first[0] + i * g.pending.dx - 24, y: g.pending.first[1] - 24, w: 48, h: 60 }}
            selected={selected === p.name}
            onSelect={onSelect}
            captionDy={56}
            fs={fs}
          />
        ))}
      </AnimatePresence>
      {pending.length > g.pending.max && (
        <text x={g.pending.first[0] + g.pending.max * g.pending.dx - 14} y={g.pending.first[1] + 6} className="k-svg-hand" style={{ fontSize: fs.hand, fill: 'var(--orange)' }}>
          +{pending.length - g.pending.max}
        </text>
      )}

      {/* traffic: students keep ordering through Service klopa-api */}
      <text x={g.traffic[0]} y={g.traffic[1]} className="k-svg-hand" style={{ fontSize: fs.hand, fill: 'var(--ink-2)' }}>
        promet
      </text>
      <text x={g.traffic[0]} y={g.traffic[1] + 28} className="k-svg-mono" style={{ fontSize: fs.mono, fill: traffic.tone === 'bad' ? 'var(--red)' : traffic.tone === 'warn' ? 'var(--orange)' : 'var(--tray-ink)' }}>
        {traffic.text}
      </text>

      {g.nodes.map((n) => (
        <NodeDrawing key={n.name} s={s} n={n} selected={selected} onSelect={onSelect} captionDy={captionDy} fs={fs} />
      ))}

      {activeMessages(s).map((m) => (
        <MessageDot key={m.id} s={s} g={g} m={m} />
      ))}
    </>
  )
}
