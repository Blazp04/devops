/**
 * Scene 2 „Životni ciklus i pad”: the Pod's phase, kubectl's STATUS and the Ready condition are three different
 * lines that change independently; CrashLoopBackOff = restart in place with a doubling pause (10 → 300 s).
 */
import { Magnifier, PodShape, Rough, StepBadge, Stepper, stepColor, useWidth } from '../../../kit'

const STEPS = [
  {
    title: 'Pending: zapisan, ali bez čvora',
    body: 'Pod je zapisan u etcd, ali raspoređivač mu još nije našao čvor. Faza je Pending, a i STATUS kaže Pending. READY 0/1: spremno je 0 od 1 kontejnera.',
  },
  {
    title: 'ContainerCreating: na čvoru, ali još ne radi',
    body: 'Raspoređivač je Pod smjestio na čvor node-2, a kubelet preuzima sliku i stvara kontejner. STATUS se promijenio u ContainerCreating, a faza je i dalje Pending. STATUS nije faza, nego razlog.',
  },
  {
    title: 'ImagePullBackOff: slika ne postoji',
    body: 'Da je tag kriv (1.3.20), kubelet ne bi mogao preuzeti sliku. STATUS bi bio ImagePullBackOff, a faza i dalje Pending. Kubelet ponavlja preuzimanje sa sve duljom pauzom. Kontejner nikad nije nastao, pa nema ni restarta.',
  },
  {
    title: 'Running, ali ne i spreman',
    body: 'Kontejner radi, pa je faza Running. Aplikacija još puni predmemoriju i provjera spremnosti (o njoj u sljedećem odjeljku) pada. Zato je READY 0/1 i Pod ne dobiva promet. Running znači „proces je pokrenut”, a ne „aplikacija radi”.',
  },
  {
    title: 'Ready: uvjet Ready = True',
    body: 'Provjera spremnosti prolazi: uvjet Ready postaje True, READY 1/1 i Pod ulazi u popis onih koji dobivaju promet. Faza i STATUS se nisu promijenili – promijenio se samo treći redak.',
  },
  {
    title: 'CrashLoopBackOff: restart u istom Podu',
    body: 'Proces se sruši (exit 1). Uz restartPolicy: Always kubelet ga ponovno pokreće u istom Podu: RESTARTS +1, isto ime, ista IP adresa. Ako se ruši opet, prije svakog pokušaja čeka dvostruko dulje: 10, 20, 40 s… najviše 300 s. Nakon 10 minuta mirnog rada brojanje kreće ispočetka. Faza ostaje Running.',
  },
]

type Shape = 'pending' | 'creating' | 'crash' | 'notready' | 'running'

const ROWS: { phase: string; status: string; ready: string; restarts: number; shape: Shape; onNode: boolean; changed: number }[] = [
  { phase: 'Pending', status: 'Pending', ready: '0/1', restarts: 0, shape: 'pending', onNode: false, changed: -1 },
  { phase: 'Pending', status: 'ContainerCreating', ready: '0/1', restarts: 0, shape: 'creating', onNode: true, changed: 1 },
  { phase: 'Pending', status: 'ImagePullBackOff', ready: '0/1', restarts: 0, shape: 'pending', onNode: true, changed: 1 },
  { phase: 'Running', status: 'Running', ready: '0/1', restarts: 0, shape: 'notready', onNode: true, changed: 0 },
  { phase: 'Running', status: 'Running', ready: '1/1', restarts: 0, shape: 'running', onNode: true, changed: 2 },
  { phase: 'Running', status: 'CrashLoopBackOff', ready: '0/1', restarts: 3, shape: 'crash', onNode: true, changed: 1 },
]

const DELAYS = [10, 20, 40, 80, 160, 300]

interface Geo {
  W: number
  H: number
  node: { x: number; y: number; w: number; h: number }
  pod: [number, number]
  podOff: [number, number]
  card: { x: number; y: number; w: number; h: number }
  rowY: number[]
  labelX: number
  valueX: number
  ring: { x: number; y: number; gap: number }
  badge: [number, number]
  hand: number
  mono: number
}

const WIDE: Geo = {
  W: 700,
  H: 330,
  node: { x: 20, y: 40, w: 250, h: 170 },
  pod: [145, 128],
  podOff: [145, 270],
  card: { x: 320, y: 30, w: 360, h: 170 },
  rowY: [80, 120, 160],
  labelX: 344,
  valueX: 450,
  ring: { x: 330, y: 270, gap: 62 },
  badge: [300, 24],
  hand: 19,
  mono: 15,
}

const NARROW: Geo = {
  W: 360,
  H: 500,
  node: { x: 14, y: 40, w: 180, h: 150 },
  pod: [104, 120],
  podOff: [270, 120],
  card: { x: 14, y: 220, w: 332, h: 150 },
  rowY: [276, 310, 344],
  labelX: 32,
  valueX: 124,
  ring: { x: 30, y: 430, gap: 60 },
  badge: [340, 210],
  hand: 20,
  mono: 15,
}

function BackoffRings({ g, active, kind }: { g: Geo; active: boolean; kind: 'crash' | 'image' }) {
  const c = kind === 'crash' ? 'var(--red)' : 'var(--orange)'
  const shown = g.W < 400 ? DELAYS.slice(0, 5) : DELAYS
  return (
    <g opacity={active ? 1 : 0.35}>
      {shown.map((d, i) => {
        const r = 8 + Math.sqrt(d) * 1.25
        const cx = g.ring.x + 16 + i * g.ring.gap
        return (
          <g key={d}>
            <Rough shape={{ k: 'ellipse', cx, cy: g.ring.y, w: r * 2, h: r * 2 }} seed={12300 + i} stroke={c} strokeWidth={1.8} />
            <text x={cx} y={g.ring.y + 5} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 13.5, fontWeight: 700 }}>
              {d} s
            </text>
          </g>
        )
      })}
      <text x={g.ring.x} y={g.ring.y - (g.W < 400 ? 38 : 40)} className="k-svg-hand" style={{ fontSize: g.hand, fill: c }}>
        {kind === 'crash' ? (g.W < 400 ? 'pauza prije pokušaja (≤ 300 s)' : 'pauza prije svakog novog pokušaja (najviše 300 s)') : 'i preuzimanje se ponavlja s pauzom'}
      </text>
    </g>
  )
}

function LifeFrame({ step, g }: { step: number; g: Geo }) {
  const row = ROWS[step]
  const c = stepColor(step)
  const narrow = g.W < 400
  const values = [row.phase, row.status, row.ready]
  const labels = ['faza', 'STATUS', 'READY']
  const [px, py] = row.onNode ? g.pod : g.podOff
  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={`Korak ${step + 1}: faza ${row.phase}, STATUS ${row.status}, READY ${row.ready}`} style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}>
      {/* the node */}
      <Rough shape={{ k: 'rect', x: g.node.x, y: g.node.y, w: g.node.w, h: g.node.h }} seed={12400} stroke="var(--ink-2)" strokeWidth={1.6} dash={row.onNode ? undefined : '6 5'} />
      <text x={g.node.x + 12} y={g.node.y + 24} className="k-svg-display" style={{ fontSize: 16, fontWeight: 700 }}>
        čvor node-2
      </text>
      {!row.onNode && (
        <g>
          {!narrow && <Magnifier cx={g.podOff[0] - 82} cy={g.podOff[1] - 8} r={20} />}
          <text x={narrow ? g.podOff[0] : g.podOff[0] + 46} y={narrow ? g.podOff[1] - 50 : g.podOff[1] + 6} textAnchor={narrow ? 'middle' : 'start'} className="k-svg-hand" style={{ fontSize: g.hand, fill: c }}>
            čeka čvor…
          </text>
        </g>
      )}
      <PodShape x={px} y={py} size={54} status={row.shape} tone="blue" label="api" />
      {row.restarts > 0 && (
        <text x={px + 40} y={py - 28} className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--red)', fontWeight: 700 }}>
          ↻ {row.restarts}
        </text>
      )}
      <text x={px} y={py + 56} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono - 1.5, fontWeight: 700 }}>
        klopa-api-1
      </text>
      {/* the index card with the three independent lines */}
      <Rough shape={{ k: 'rect', x: g.card.x, y: g.card.y, w: g.card.w, h: g.card.h }} seed={12410} stroke="var(--ink)" strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" />
      <text x={g.card.x + 14} y={g.card.y + 24} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--ink-3)' }}>
        kubectl get pods
      </text>
      {labels.map((l, i) => {
        const y = g.rowY[i]
        const changed = row.changed === i
        return (
          <g key={l}>
            {changed && <Rough shape={{ k: 'rect', x: g.valueX - 4, y: y, w: Math.max(52, values[i].length * 9.6 + 8), h: 7 }} seed={12420 + i} stroke="none" fillColor="var(--hl-yellow-ink)" hachureGap={2.6} fillWeight={2.4} roughness={1.2} />}
            <text x={g.labelX} y={y} className="k-svg-mono" style={{ fontSize: g.mono - 1.5, fill: 'var(--ink-3)' }}>
              {l}
            </text>
            <text x={g.valueX} y={y} className="k-svg-mono" style={{ fontSize: g.mono + 1, fontWeight: 700, fill: /BackOff/.test(values[i]) ? 'var(--red)' : 'var(--ink)' }}>
              {values[i]}
            </text>
            {changed && (
              <text x={g.card.x + g.card.w - 10} y={y} textAnchor="end" className="k-svg-hand" style={{ fontSize: g.hand, fill: c }}>
                ←
              </text>
            )}
          </g>
        )
      })}
      {step === 5 && (
        <text x={g.card.x + g.card.w - 14} y={g.card.y + g.card.h - 14} textAnchor="end" className="k-svg-mono" style={{ fontSize: g.mono - 1.5, fill: 'var(--red)', fontWeight: 700 }}>
          RESTARTS 3
        </text>
      )}
      {(step === 2 || step === 5) && <BackoffRings g={g} active kind={step === 2 ? 'image' : 'crash'} />}
      {step === 4 && (
        <text x={narrow ? g.W / 2 : g.card.x} y={narrow ? 420 : 262} textAnchor={narrow ? 'middle' : 'start'} className="k-svg-hand" style={{ fontSize: g.hand + 1, fill: c }}>
          {narrow ? 'Pod sada dobiva promet ✓' : '✓ uvjet Ready = True → Pod sada dobiva promet'}
        </text>
      )}
      {step === 3 && (
        <text x={narrow ? g.W / 2 : g.card.x} y={narrow ? 420 : 262} textAnchor={narrow ? 'middle' : 'start'} className="k-svg-hand" style={{ fontSize: g.hand + 1, fill: c }}>
          {narrow ? 'proces radi, promet još ne' : 'proces radi, a promet još ne dolazi (Ready = False)'}
        </text>
      )}
      <StepBadge n={step + 1} x={g.badge[0]} y={g.badge[1]} color={c} />
    </svg>
  )
}

export function LifecycleStepper() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const g = w !== null && w < 630 ? NARROW : WIDE
  return (
    <div ref={ref}>
      <Stepper title="Tri retka koja se mijenjaju neovisno" steps={STEPS} caption="Faza (status.phase) je gruba: Pending, Running, Succeeded, Failed (rijetko Unknown). STATUS u ispisu naredbe kubectl get pods pokazuje razlog, a READY uvjet Ready.">
        {(step) => (
          <div style={g === NARROW ? { maxWidth: 440, margin: '0 auto' } : undefined}>
            <LifeFrame step={step} g={g} />
          </div>
        )}
      </Stepper>
    </div>
  )
}
