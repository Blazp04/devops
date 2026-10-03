import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check, Diagram, K8sGlyph, MiniLaptop, PodShape, Rough, RecipeCard, Segmented, StepBadge, Stepper, pathTimes, stepColor, useWidth } from '../../../kit'
import { Card, Glow, Hand, Mono, Wire } from './Parts'
import { FS, type Box, type Pt } from './stage'

type Mode = 'rs' | 'pod'

const STEPS_RS = [
  { title: 'kubectl → API poslužitelj', body: 'kubectl pošalje manifest API poslužitelju. Prije zapisa API provjeri tri stvari: tko šalje (autentikacija), smije li to (autorizacija) i poštuje li objekt pravila klastera (engl. admission).' },
  { title: 'API poslužitelj → etcd', body: 'Objekt se zapisuje u etcd. Čim etcd potvrdi zapis, API odgovori i kubectl ispiše „created”. Tu kubectl staje: od Podova još nema ništa, ni na ploči ni na čvorovima.' },
  { title: 'controller-manager stvara Podove', body: 'Kontroler ReplicaSeta u controller-manageru vidi razliku: traženo 2, postoji 0. Na ploču upiše dva nova Poda – još bez čvora. (ReplicaSet i Deployment detaljno su u 13. predavanju.)' },
  { title: 'Raspoređivač bira čvor', body: 'Raspoređivač vidi Podove bez čvora i za svaki pronađe čvor s dovoljno mjesta – kopije obično raširi po različitim čvorovima. U objekt upiše ime čvora (engl. binding). Ništa ne pokreće.' },
  { title: 'kubelet pokreće kontejner', body: 'kubelet na node-2 vidi Pod dodijeljen svojem čvoru (drugi Pod jednako preuzima kubelet na node-3). Preko sučelja CRI kaže containerdu: povuci sliku i pokreni kontejner.' },
  { title: 'Status se vraća na ploču', body: 'kubelet javi stanje API poslužitelju. Tek sada kubectl get pods pokazuje Running: stvarno stanje (status) dostiglo je željeno (spec).' },
]

const STEPS_POD = STEPS_RS.map((s, i) =>
  i === 1
    ? { ...s, body: 'Pod se zapisuje u etcd. Čim etcd potvrdi zapis, API odgovori i kubectl ispiše „pod/klopa-worker created”. Tu kubectl staje: Pod je samo zapis, bez čvora i bez kontejnera.' }
    : i === 2
      ? { title: 'Korak 3 se preskače', body: 'Goli Pod nema vlasnika, pa ga nijedan kontroler ne stvara – i nitko ga neće zamijeniti ako nestane. Lanin klopa-worker ide ravno na raspoređivač.' }
      : i === 3
        ? { ...s, body: 'Raspoređivač vidi Pod bez čvora, pronađe čvor s dovoljno mjesta i u objekt upiše ime čvora (engl. binding). Ništa ne pokreće.' }
        : i === 4
          ? { ...s, body: 'kubelet na node-2 vidi Pod dodijeljen svojem čvoru. Preko sučelja CRI kaže containerdu: povuci sliku i pokreni kontejner.' }
          : s,
)

interface Geo {
  W: number
  H: number
  narrow: boolean
  laptop: Box
  cp: Box
  api: Box
  board: Box
  cm: Box
  sched: Box
  node: Box
  kubelet: Box
  runtime: Box
  pods: Pt[]
  runNote: Pt
  rows: { x: number; right: number; y0: number; dy: number }
  r: Record<'kubectl' | 'etcd' | 'cm' | 'sched' | 'kubelet' | 'runtime' | 'status', Pt[]>
}

function geo(narrow: boolean): Geo {
  if (!narrow) {
    const laptop = { x: 8, y: 36, w: 100, h: 90 }
    const api = { x: 140, y: 30, w: 196, h: 92 }
    const board = { x: 366, y: 18, w: 338, h: 160 }
    const cm = { x: 140, y: 152, w: 184, h: 92 }
    const sched = { x: 366, y: 190, w: 210, h: 74 }
    const node = { x: 120, y: 290, w: 592, h: 170 }
    const kubelet = { x: 140, y: 330, w: 112, h: 28 }
    const runtime = { x: 286, y: 330, w: 120, h: 28 }
    return {
      W: 720,
      H: 470,
      narrow,
      laptop,
      cp: { x: 120, y: 8, w: 592, h: 268 },
      api,
      board,
      cm,
      sched,
      node,
      kubelet,
      runtime,
      pods: [
        [560, 400],
        [640, 400],
      ],
      runNote: [286, 388],
      rows: { x: 382, right: 694, y0: 74, dy: 26 },
      r: {
        kubectl: [
          [108, 78],
          [140, 76],
        ],
        etcd: [
          [336, 76],
          [366, 76],
        ],
        cm: [
          [232, 152],
          [232, 122],
        ],
        sched: [
          [376, 190],
          [326, 122],
        ],
        kubelet: [
          [140, 112],
          [128, 112],
          [128, 344],
          [140, 344],
        ],
        runtime: [
          [252, 344],
          [286, 344],
        ],
        status: [
          [140, 336],
          [132, 336],
          [132, 100],
          [140, 100],
        ],
      },
    }
  }
  const laptop = { x: 120, y: 4, w: 160, h: 62 }
  const api = { x: 100, y: 96, w: 200, h: 84 }
  const cm = { x: 24, y: 200, w: 174, h: 92 }
  const sched = { x: 210, y: 200, w: 176, h: 92 }
  const board = { x: 24, y: 312, w: 362, h: 140 }
  const node = { x: 24, y: 486, w: 372, h: 146 }
  const kubelet = { x: 36, y: 524, w: 112, h: 28 }
  const runtime = { x: 166, y: 524, w: 120, h: 28 }
  return {
    W: 400,
    H: 642,
    narrow,
    laptop,
    cp: { x: 4, y: 78, w: 392, h: 388 },
    api,
    board,
    cm,
    sched,
    node,
    kubelet,
    runtime,
    pods: [
      [270, 590],
      [356, 594],
    ],
    runNote: [36, 590],
    rows: { x: 40, right: 376, y0: 362, dy: 24 },
    r: {
      kubectl: [
        [200, 66],
        [200, 96],
      ],
      etcd: [
        [300, 138],
        [389, 138],
        [389, 330],
        [386, 330],
      ],
      cm: [
        [111, 200],
        [150, 180],
      ],
      sched: [
        [298, 200],
        [250, 180],
      ],
      kubelet: [
        [100, 150],
        [12, 150],
        [12, 538],
        [36, 538],
      ],
      runtime: [
        [148, 538],
        [166, 538],
      ],
      status: [
        [36, 530],
        [16, 530],
        [16, 160],
        [100, 160],
      ],
    },
  }
}

/** Every numbered message travels at the same constant speed (viewBox units per second), on every route. */
const HOP_SPEED = 260

function routeLength(pts: Pt[]): number {
  let l = 0
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return Math.max(l, 1)
}

/** The step's numbered message: drawn route first, then the badge travels along it once (reduced motion: at the end). */
function Hop({ pts, n, color }: { pts: Pt[]; n: number; color: string }) {
  const reduce = useReducedMotion()
  const end = pts[pts.length - 1]
  return (
    <g>
      <Glow pts={pts} color={color} />
      <motion.g
        key={`${n}-${pts[0][0]}-${pts[0][1]}`}
        initial={reduce ? { x: end[0], y: end[1] } : { x: pts[0][0], y: pts[0][1] }}
        animate={{ x: pts.map((p) => p[0]), y: pts.map((p) => p[1]) }}
        transition={reduce ? { duration: 0 } : { duration: routeLength(pts) / HOP_SPEED, times: pathTimes(pts), ease: 'linear', delay: 0.35 }}
      >
        <circle r={18} className="k-paper-fill" />
        <StepBadge n={n} x={0} y={0} r={15} color={color} />
      </motion.g>
    </g>
  )
}

interface Row {
  kind: 'rs' | 'pod'
  name: string
  status: string
  solid: boolean
  tone: 'ink' | 'red' | 'green'
}

function boardRows(mode: Mode, step: number): Row[] {
  if (step < 1) return []
  const rows: Row[] = []
  if (mode === 'rs') {
    rows.push({ kind: 'rs', name: 'replicaset/klopa-api', status: 'replicas: 2', solid: true, tone: 'ink' })
    if (step >= 2)
      for (const [n, node] of [
        ['klopa-api-x7k2p', 'node-2'],
        ['klopa-api-m4c9d', 'node-3'],
      ])
        rows.push({ kind: 'pod', name: n, status: step >= 5 ? 'Running ✓' : step >= 3 ? node : 'čvor: ?', solid: step >= 5, tone: step >= 5 ? 'green' : step >= 3 ? 'ink' : 'red' })
  } else {
    rows.push({ kind: 'pod', name: 'klopa-worker', status: step >= 5 ? 'Running ✓' : step >= 3 ? 'node-2' : 'čvor: ?', solid: step >= 5, tone: step >= 5 ? 'green' : step >= 3 ? 'ink' : 'red' })
  }
  return rows
}

function Drawing({ step, mode }: { step: number; mode: Mode }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const narrow = (width ?? 720) < 560
  const g = geo(narrow)
  const col = stepColor(step)
  const rows = boardRows(mode, step)
  const skip3 = mode === 'pod' && step === 2
  // the drawing shows node-2 only: one Pod lands here, the ReplicaSet's second one goes to node-3
  const podCount = 1
  const active: Record<string, boolean> = { kubectl: step === 0, etcd: step === 1, cm: step === 2 && mode === 'rs', sched: step === 3, kubelet: step === 4, status: step === 5 }
  const hop: { pts: Pt[]; n: number } | null =
    step === 0 ? { pts: g.r.kubectl, n: 1 } : step === 1 ? { pts: g.r.etcd, n: 2 } : step === 2 && mode === 'rs' ? { pts: g.r.cm, n: 3 } : step === 3 ? { pts: g.r.sched, n: 4 } : step === 4 ? { pts: g.r.kubelet, n: 5 } : step === 5 ? { pts: g.r.status, n: 6 } : null
  const podStatus = step >= 5 ? 'running' : step >= 4 ? 'creating' : null
  return (
    <div ref={ref}>
      <div style={narrow ? { maxWidth: 460, margin: '0 auto' } : undefined}>
        <Diagram width={g.W} height={g.H} label={`Put jedne izjave, korak ${step + 1} od 6: od naredbe kubectl apply preko API poslužitelja, etcd-a, kontrolera i raspoređivača do agenta kubelet i containerd na čvoru.`}>
          {/* control plane */}
          <Rough shape={{ k: 'rect', ...g.cp }} seed={3001} stroke="var(--pen)" strokeWidth={1.5} />
          <Rough shape={{ k: 'rect', x: g.cp.x + 4, y: g.cp.y + 4, w: g.cp.w - 8, h: g.cp.h - 8 }} seed={3002} stroke="var(--pen)" strokeWidth={1.1} />
          {/* fixed wires */}
          <Wire pts={g.r.kubectl} seed={3011} color="var(--ink-2)" />
          <Wire pts={g.r.etcd} seed={3012} color="var(--ink)" width={2.2} />
          <Wire pts={g.r.cm} dashed seed={3013} />
          <Wire pts={g.r.sched} dashed seed={3014} />
          <Wire pts={g.r.kubelet} dashed seed={3015} />
          <Wire pts={g.r.runtime} seed={3016} color="var(--ink-2)" />

          {/* Lana's laptop */}
          <MiniLaptop x={g.laptop.x + 6} y={g.laptop.y + 4} w={narrow ? 50 : 70} h={narrow ? 40 : 52} />
          <Mono x={narrow ? g.laptop.x + 64 : g.laptop.x + 6} y={narrow ? g.laptop.y + 28 : g.laptop.y + 80}>
            kubectl
          </Mono>
          {step === 0 && (
            <Hand x={narrow ? g.laptop.x + 64 : g.laptop.x + 4} y={narrow ? g.laptop.y + 54 : g.laptop.y + 124} lines={['3 provjere ✓']} color={col} />
          )}

          <Card box={g.api} title={['API poslužitelj']} role="jedini piše u etcd" glyph="api" seed={3021} accent={active.kubectl || active.etcd || active.status ? col : undefined} />
          <Card box={g.cm} title={['controller-', 'manager']} role={skip3 ? 'preskočeno' : 'nedostaje li Podova?'} glyph="cm-ctrl" seed={3022} dim={skip3} accent={active.cm ? col : undefined} titleSize={15} />
          <Card box={g.sched} title={['raspoređivač']} role="Pod bez čvora?" glyph="sched" seed={3023} accent={active.sched ? col : undefined} />

          {/* the board = etcd: one row per object */}
          <Rough shape={{ k: 'rect', ...g.board }} seed={3031} stroke={active.etcd ? col : 'var(--ink)'} strokeWidth={2} multi fillColor="var(--paper-2)" fillStyle="solid" />
          <K8sGlyph kind="etcd" x={g.board.x + 8} y={g.board.y + 8} w={30} h={26} />
          <text x={g.board.x + 44} y={g.board.y + 28} className="k-svg-display" style={{ fontSize: FS.title }}>
            etcd
          </text>
          <Hand x={g.board.x + 92} y={g.board.y + 28} lines={['ploča: zapisi']} />
          {rows.map((r, i) => {
            const y = g.rows.y0 + i * g.rows.dy
            return (
              <g key={r.name}>
                {r.kind === 'rs' ? (
                  <RecipeCard x={g.rows.x - 2} y={y - 16} w={20} h={20} />
                ) : (
                  <Rough shape={{ k: 'rect', x: g.rows.x, y: y - 13, w: 16, h: 13 }} seed={3040 + i} stroke="var(--ink-2)" strokeWidth={1.2} dash={r.solid ? undefined : '3 3'} />
                )}
                <Mono x={g.rows.x + 26} y={y}>
                  {r.name}
                </Mono>
                <Mono x={g.rows.right} y={y} anchor="end" color={r.tone === 'red' ? 'var(--red)' : r.tone === 'green' ? 'var(--green)' : 'var(--ink)'}>
                  {r.status}
                </Mono>
              </g>
            )
          })}
          {step === 1 && (
            <Hand x={g.board.x + 16} y={g.board.y + g.board.h - 14} lines={['↩ kubectl: „created” – i tu staje']} color={col} />
          )}
          {skip3 && !narrow && <Hand x={g.cm.x + 8} y={g.cm.y + g.cm.h + 26} lines={['goli Pod: bez vlasnika']} color="var(--red)" />}

          {/* the node */}
          <Rough shape={{ k: 'rect', ...g.node }} seed={3051} stroke="var(--ink)" strokeWidth={1.8} roughness={1.4} />
          <text x={g.node.x + 12} y={g.node.y + 24} className="k-svg-display" style={{ fontSize: FS.title }}>
            node-2
          </text>
          <Rough shape={{ k: 'rect', ...g.kubelet }} seed={3052} stroke={active.kubelet || active.status ? col : 'var(--ink-2)'} strokeWidth={1.5} fillColor="var(--paper)" fillStyle="solid" />
          <K8sGlyph kind="kubelet" x={g.kubelet.x + 4} y={g.kubelet.y + 3} w={26} h={22} />
          <Mono x={g.kubelet.x + 34} y={g.kubelet.y + 20}>
            kubelet
          </Mono>
          <Rough shape={{ k: 'rect', ...g.runtime }} seed={3053} stroke={active.kubelet ? col : 'var(--ink-2)'} strokeWidth={1.5} fillColor="var(--paper)" fillStyle="solid" />
          <Mono x={g.runtime.x + g.runtime.w / 2} y={g.runtime.y + 20} anchor="middle">
            containerd
          </Mono>
          {step === 4 && <Hand x={g.runNote[0]} y={g.runNote[1]} lines={['povuci sliku i pokreni']} color={col} />}
          {podStatus &&
            g.pods.slice(0, podCount).map(([x, y], i) => (
              <g key={i}>
                <PodShape x={x} y={y} size={34} status={podStatus} tone={mode === 'rs' ? 'blue' : 'teal'} />
              </g>
            ))}
          {!podStatus && (
            <Hand x={g.pods[0][0] - 20} y={g.pods[0][1] + 6} lines={['još ništa']} color="var(--ink-3)" />
          )}
          {step === 5 && <Check x={g.pods[podCount - 1][0] + 34} y={g.pods[0][1] - 22} size={10} />}
          {mode === 'rs' && step >= 3 && <Hand x={g.pods[0][0] + (narrow ? 26 : 36)} y={g.pods[0][1] + (narrow ? 6 : 10)} lines={['drugi Pod', '→ node-3']} color="var(--ink-3)" />}

          {hop && <Hop key={`${mode}-${step}-${narrow}`} pts={hop.pts} n={hop.n} color={col} />}
        </Diagram>
      </div>
    </div>
  )
}

export function PutStepper() {
  const [mode, setMode] = useState<Mode>('rs')
  return (
    <div>
      <Segmented
        label="Što šaljemo"
        value={mode}
        options={[
          { value: 'rs', label: 'ReplicaSet (pretpregled)' },
          { value: 'pod', label: 'Goli Pod (Lanin klopa-worker)' },
        ]}
        onChange={setMode}
      />
      <Stepper key={mode} title="Put jedne izjave" steps={mode === 'rs' ? STEPS_RS : STEPS_POD} autoPlay={0} caption="Brojevi su redoslijed poruka; svaka komponenta reagira tek kad na ploči vidi promjenu.">
        {(step) => <Drawing step={step} mode={mode} />}
      </Stepper>
    </div>
  )
}
