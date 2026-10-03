/**
 * Scene 3 „Kad čvor naglo padne”: the real timeline of a non-graceful node failure for a Deployment with an RWO PVC
 * and for a StatefulSet Pod – NotReady after ≈ 50 s, Terminating after the 300 s toleration, Multi-Attach, force
 * detach after 6 more minutes, and the out-of-service taint (GA since 1.28) that a human applies to release at once.
 */
import { PodShape, Rough, StepBadge, Stepper, stepColor, useWidth } from '../../../kit'
import { Cable, FridgeDisk, GhostPod } from './parts'

const STEPS = [
  {
    title: 'Stroj se ugasi',
    body: (
      <>
        U 03:12 <code>node-3</code> ostane bez struje. Na njemu rade <code>db-pvc</code> (Deployment s PVC-om) i <code>db-1</code> (StatefulSet). Oba diska spojena su na <code>node-3</code>. API poslužitelj to još ne zna: za njega je čvor i dalje <code>Ready</code>.
      </>
    ),
  },
  {
    title: '≈ 50 s: NotReady',
    body: (
      <>
        Kubelet se više ne javlja, pa nakon ≈ 50 s čvor postaje <code>NotReady</code> i dobiva taint <code>unreachable</code>. Podovi gube uvjet <code>Ready</code> i izlaze iz Servicea, ali i dalje „postoje” i u ispisu su još <code>Running</code>: nitko ne može potvrditi da su stali.
      </>
    ),
  },
  {
    title: '+ 5 min: Terminating i Multi-Attach',
    body: (
      <>
        Nakon zadanih 300 s tolerancije Podovi su označeni za brisanje, ali ostaju <code>Terminating</code> jer kubelet ne odgovara. ReplicaSet odmah stvara zamjenu na <code>node-1</code> – ona čeka u <code>ContainerCreating</code> s greškom <code>Multi-Attach</code>, jer je RWO disk još „spojen” na <code>node-3</code>. StatefulSet ne stvara ništa: ime <code>db-1</code> je zauzeto.
      </>
    ),
  },
  {
    title: '+ 6 min: prisilno odspajanje',
    body: (
      <>
        Brisanje se ne potvrđuje već 6 minuta, a čvor je neispravan, pa kontroler za spajanje diskova prisilno odspaja diskove. Zamjena iz Deploymenta se pokreće s podatcima, ukupno ≈ 12 minuta nakon pada. <code>db-1</code> i dalje čeka: StatefulSet radije ostaje bez jednog Poda nego da riskira dva <code>db-1</code>.
      </>
    ),
  },
  {
    title: 'Čovjek potvrdi: out-of-service',
    body: (
      <>
        Kad provjerimo da je stroj stvarno ugašen, stavimo taint <code>node.kubernetes.io/out-of-service</code>. Kubernetes tada odmah prisilno briše Podove s tog čvora i odspaja diskove: <code>db-1</code> nastaje na <code>node-1</code> sa svojim PVC-om <code>data-db-1</code>. Novi čvor mora biti u istoj zoni kao disk – inače <code>db-1</code> ostaje <code>Pending</code> (<code>volume node affinity conflict</code>). Taint smijemo staviti i već nakon <code>NotReady</code> – tada otpada ostatak čekanja (5 + 6 minuta).
      </>
    ),
  },
]

const TIME = ['t = 0', '≈ 50 s', '+ 5 min', '+ 6 min', 'kad čovjek potvrdi']

interface Lane {
  x: number
  y: number
  w: number
  h: number
}

interface Geo {
  W: number
  H: number
  lanes: [Lane, Lane]
  dead: (l: Lane) => Lane
  live: (l: Lane) => Lane
  fridge: (l: Lane) => [number, number]
  pod: (n: Lane) => [number, number]
  text: (n: Lane) => [number, number]
  toDead: (l: Lane) => [number, number][]
  toLive: (l: Lane) => [number, number][]
  time: [number, number]
  badge: [number, number]
  mono: number
  hand: number
}

const WIDE: Geo = {
  W: 720,
  H: 356,
  lanes: [
    { x: 10, y: 30, w: 700, h: 150 },
    { x: 10, y: 196, w: 700, h: 150 },
  ],
  dead: (l) => ({ x: l.x, y: l.y + 26, w: 270, h: l.h - 30 }),
  live: (l) => ({ x: l.x + 430, y: l.y + 26, w: 270, h: l.h - 30 }),
  fridge: (l) => [l.x + 328, l.y + 58],
  pod: (n) => [n.x + 52, n.y + 70],
  text: (n) => [n.x + 96, n.y + 58],
  toDead: (l) => [
    [l.x + 328, l.y + 84],
    [l.x + 270, l.y + 84],
  ],
  toLive: (l) => [
    [l.x + 372, l.y + 84],
    [l.x + 430, l.y + 84],
  ],
  time: [710, 20],
  badge: [16, 18],
  mono: 14,
  hand: 19,
}

const NARROW: Geo = {
  W: 360,
  H: 584,
  lanes: [
    { x: 8, y: 34, w: 344, h: 266 },
    { x: 8, y: 312, w: 344, h: 266 },
  ],
  dead: (l) => ({ x: l.x, y: l.y + 26, w: 164, h: 172 }),
  live: (l) => ({ x: l.x + 180, y: l.y + 26, w: 164, h: 172 }),
  fridge: (l) => [l.x + 150, l.y + 206],
  pod: (n) => [n.x + 40, n.y + 84],
  text: (n) => [n.x + 10, n.y + 128],
  toDead: (l) => [
    [l.x + 150, l.y + 232],
    [l.x + 82, l.y + 232],
    [l.x + 82, l.y + 198],
  ],
  toLive: (l) => [
    [l.x + 194, l.y + 232],
    [l.x + 262, l.y + 232],
    [l.x + 262, l.y + 198],
  ],
  time: [352, 22],
  badge: [22, 18],
  mono: 14,
  hand: 19,
}

interface LaneState {
  title: string
  old: { name: string; status: string; shape: 'running' | 'notready' | 'terminating' } | null
  repl: { name: string; status: string; shape: 'creating' | 'running'; note?: string } | null
  waitNote: string | null
  cable: 'dead' | 'dead-stuck' | 'live' | 'none'
}

function lanes(step: number): [LaneState, LaneState] {
  // kubectl still prints READY 1/1 and Running: only the Pod's Ready condition flips (the dead kubelet updates nothing)
  const oldStatus = step <= 1 ? 'Running' : 'Terminating'
  const oldShape = step === 0 ? 'running' : step === 1 ? 'notready' : 'terminating'
  const dep: LaneState = {
    title: 'Deployment db-pvc + PVC (RWO)',
    old: step === 4 ? null : { name: 'db-pvc-…x2k4f', status: oldStatus, shape: oldShape },
    repl: step < 2 ? null : step === 2 ? { name: 'db-pvc-…p8q1d', status: 'ContainerCreating', shape: 'creating', note: '✗ Multi-Attach' } : { name: 'db-pvc-…p8q1d', status: 'Running', shape: 'running' },
    waitNote: null,
    cable: step === 0 ? 'dead' : step < 3 ? 'dead-stuck' : 'live',
  }
  const sts: LaneState = {
    title: 'StatefulSet db (db-1 + data-db-1)',
    old: step === 4 ? null : { name: 'db-1', status: oldStatus, shape: oldShape },
    repl: step === 4 ? { name: 'db-1', status: 'Running', shape: 'running' } : null,
    waitNote: step >= 2 && step < 4 ? 'ne stvara db-1: ime je zauzeto' : null,
    cable: step === 0 ? 'dead' : step < 3 ? 'dead-stuck' : step === 3 ? 'none' : 'live',
  }
  return [dep, sts]
}

function Frame({ step, g }: { step: number; g: Geo }) {
  const c = stepColor(step)
  const ls = lanes(step)
  const nodeText = step === 0 ? 'ugašen · API: Ready' : step === 4 ? 'NotReady · out-of-service' : 'NotReady'
  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={`Korak ${step + 1}: ${STEPS[step].title}`} style={{ display: 'block', width: '100%', height: 'auto' }}>
      <StepBadge n={step + 1} x={g.badge[0]} y={g.badge[1]} color={c} />
      <text x={g.time[0]} y={g.time[1]} textAnchor="end" className="k-svg-hand" style={{ fontSize: g.hand + 2, fill: c, fontWeight: 700 }}>
        {TIME[step]}
      </text>
      {g.lanes.map((l, li) => {
        const st = ls[li]
        const dn = g.dead(l)
        const lv = g.live(l)
        const [fx, fy] = g.fridge(l)
        const [opx, opy] = g.pod(dn)
        const [otx, oty] = g.text(dn)
        const [rpx, rpy] = g.pod(lv)
        const [rtx, rty] = g.text(lv)
        return (
          <g key={li}>
            <text x={l.x} y={l.y + 16} className="k-svg-display" style={{ fontSize: 15, fontWeight: 800, fill: 'var(--ink)' }}>
              {st.title}
            </text>
            {/* node-3 (dead) */}
            <Rough shape={{ k: 'rect', x: dn.x, y: dn.y, w: dn.w, h: dn.h }} seed={20000 + li} stroke="var(--red)" strokeWidth={1.8} dash={step === 0 ? undefined : '7 5'} />
            <text x={dn.x + 10} y={dn.y + 20} className="k-svg-display" style={{ fontSize: 15, fontWeight: 800, fill: 'var(--red)' }}>
              node-3
            </text>
            {(g.W < 400 ? nodeText.split(' · ') : [nodeText]).map((t, k) => (
              <text key={t} x={dn.x + 10} y={dn.y + 38 + k * 17} className="k-svg-mono" style={{ fontSize: g.mono - 1, fill: 'var(--red)' }}>
                {t}
              </text>
            ))}
            {st.old ? (
              <g>
                <PodShape x={opx} y={opy} size={40} status={st.old.shape} tone="teal" ariaLabel={`${st.old.name}: ${st.old.status}`} />
                <text x={otx} y={oty} className="k-svg-mono" style={{ fontSize: g.mono, fontWeight: 700, fill: 'var(--ink)' }}>
                  {st.old.name}
                </text>
                <text x={otx} y={oty + 20} className="k-svg-mono" style={{ fontSize: g.mono, fill: st.old.status === 'Terminating' ? 'var(--ink-3)' : 'var(--orange)' }}>
                  {st.old.status}
                </text>
              </g>
            ) : (
              <text x={dn.x + 10} y={dn.y + 74} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--ink-2)' }}>
                Pod prisilno obrisan
              </text>
            )}
            {/* node-1 (healthy) */}
            <Rough shape={{ k: 'rect', x: lv.x, y: lv.y, w: lv.w, h: lv.h }} seed={20010 + li} stroke="var(--ink-2)" strokeWidth={1.6} />
            <text x={lv.x + 10} y={lv.y + 20} className="k-svg-display" style={{ fontSize: 15, fontWeight: 800, fill: 'var(--ink)' }}>
              node-1
            </text>
            {st.repl ? (
              <g>
                <PodShape x={rpx} y={rpy} size={40} status={st.repl.shape} tone="teal" ariaLabel={`${st.repl.name}: ${st.repl.status}`} />
                <text x={rtx} y={rty} className="k-svg-mono" style={{ fontSize: g.mono, fontWeight: 700, fill: 'var(--ink)' }}>
                  {st.repl.name}
                </text>
                <text x={rtx} y={rty + 20} className="k-svg-mono" style={{ fontSize: g.mono, fill: st.repl.status === 'Running' ? 'var(--green)' : 'var(--orange)' }}>
                  {st.repl.status}
                </text>
                {st.repl.note && (
                  <text x={rtx} y={rty + 40} className="k-svg-mono" style={{ fontSize: g.mono, fontWeight: 700, fill: 'var(--red)' }}>
                    {st.repl.note}
                  </text>
                )}
              </g>
            ) : (
              <g>
                <GhostPod x={rpx} y={rpy} size={40} seed={20020 + li} />
                {st.waitNote && (
                  <text x={lv.x + 10} y={lv.y + lv.h - 14} className="k-svg-hand" style={{ fontSize: g.hand, fill: c }}>
                    {g.W < 400 ? 'ime db-1 je zauzeto' : st.waitNote}
                  </text>
                )}
              </g>
            )}
            {/* the disk */}
            {st.cable === 'dead' && <Cable pts={g.toDead(l)} state="attached" seed={20030 + li} />}
            {st.cable === 'dead-stuck' && <Cable pts={g.toDead(l)} state="stuck" seed={20030 + li} />}
            {st.cable === 'live' && <Cable pts={g.toLive(l)} state="attached" seed={20040 + li} />}
            <FridgeDisk x={fx} y={fy} w={44} h={54} count={null} seed={20050 + li} />
            {/* narrow: the label sits left of the fridge, under the cable, clear of both node frames */}
            <text
              x={g === NARROW ? fx - 6 : fx + 22}
              y={g === NARROW ? fy + 44 : fy - 6}
              textAnchor={g === NARROW ? 'end' : 'middle'}
              className="k-svg-mono"
              style={{ fontSize: g.mono - 1, fill: 'var(--ink-2)' }}
            >
              {st.cable === 'none' ? 'odspojen' : 'PV'}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function NodeLossStepper() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const g = w !== null && w < 650 ? NARROW : WIDE
  return (
    <div ref={ref}>
      <Stepper title="Kad čvor naglo padne" steps={STEPS} caption="Vremena su zadane vrijednosti Kubernetesa: ≈ 50 s do NotReady, 300 s tolerancije i 6 minuta do prisilnog odspajanja.">
        {(step) => (
          <div style={g === NARROW ? { maxWidth: 440, margin: '0 auto' } : undefined}>
            <Frame step={step} g={g} />
          </div>
        )}
      </Stepper>
    </div>
  )
}
