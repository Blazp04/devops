/**
 * Scene 6 „Goli Pod”: a container restart keeps the Pod (same name, same IP); a deleted Pod, or one lost with its
 * node, is gone – nothing recreates a bare Pod. A new Pod is a new object: new IP and UID. Replace, don't repair.
 */
import { Cross, PodShape, Rough, StepBadge, Stepper, SvgStamp, stepColor, useWidth } from '../../../kit'

const STEPS = [
  {
    title: 'Restart na mjestu: isti Pod',
    body: 'Proces u Podu klopa-worker se srušio. Kubelet na čvoru node-1 pokrene kontejner ponovno u istom Podu: RESTARTS 1, a ime i IP adresa (10.244.1.9) se ne mijenjaju. Ovo je jedini „popravak” koji Kubernetes radi na mjestu.',
  },
  {
    title: 'Obrisan goli Pod se ne vraća',
    body: 'Lana je obrisala klopa-worker naredbom kubectl delete pod, misleći da će se ponovno pokrenuti. Nije: taj Pod nema vlasnika. Nijedan kontroler ne pazi da „mora postojati jedan klopa-worker”, pa ga nitko ne stvara ponovno.',
  },
  {
    title: 'Čvor nestane, nestane i Pod',
    body: 'Kad čvor node-2 nestane, nakon ≈ 50 s postaje NotReady, a nakon 5 minuta njegovi su Podovi označeni za brisanje (Terminating). Za Pod klopa-api-2 nitko neće stvoriti zamjenu na drugom čvoru.',
  },
  {
    title: 'Zamjena, a ne popravak',
    body: 'Lana ponovno primijeni klopa-worker.yaml. Nastaje novi Pod: ime je isto jer piše u YAML-u, ali IP adresa (10.244.3.4) i UID su novi, a RESTARTS kreće od 0. Kad Podove stvara Deployment (13. predavanje), novi Pod dobiva i novo ime.',
  },
]

interface Geo {
  W: number
  H: number
  nodes: { x: number; y: number; w: number; h: number }[]
  pod: (i: number) => [number, number]
  text: (i: number) => [number, number]
  anchor: 'middle' | 'start'
  cmd: [number, number]
  badge: [number, number]
  hand: number
  mono: number
}

const WIDE: Geo = {
  W: 720,
  H: 300,
  nodes: [0, 1, 2].map((i) => ({ x: 16 + i * 236, y: 56, w: 216, h: 200 })),
  pod: (i) => [124 + i * 236, 140],
  text: (i) => [124 + i * 236, 202],
  anchor: 'middle',
  cmd: [16, 34],
  badge: [700, 30],
  hand: 19,
  mono: 14,
}

const NARROW: Geo = {
  W: 360,
  H: 520,
  nodes: [0, 1, 2].map((i) => ({ x: 10, y: 58 + i * 152, w: 340, h: 140 })),
  pod: (i) => [72, 58 + i * 152 + 74],
  text: (i) => [134, 58 + i * 152 + 62],
  anchor: 'start',
  cmd: [10, 34],
  badge: [340, 20],
  hand: 20,
  mono: 14,
}

const CMD = ['kubelet sam ponovno pokreće kontejner', '$ kubectl delete pod klopa-worker', 'čvor node-2 je ostao bez struje', '$ kubectl apply -f klopa-worker.yaml']

function BareFrame({ step, g }: { step: number; g: Geo }) {
  const c = stepColor(step)
  const narrow = g.W < 400
  const nodeOff = step === 2
  const lines = (i: number): { name: string; ip: string; note: string | string[]; tone: string } | null => {
    if (i === 0) {
      if (step === 0) return { name: 'klopa-worker', ip: '10.244.1.9', note: 'RESTARTS 1 · isto ime, ista IP', tone: 'var(--ink)' }
      if (step === 1) return { name: 'klopa-worker', ip: '10.244.1.9', note: 'obrisan – nitko ga ne vraća', tone: 'var(--red)' }
      return { name: 'klopa-worker', ip: '—', note: 'i dalje ga nema', tone: 'var(--ink-3)' }
    }
    if (i === 1) return { name: 'klopa-api-2', ip: '10.244.2.5', note: step === 2 ? 'Terminating, bez zamjene' : step === 3 ? 'nestao zajedno s čvorom' : 'radi', tone: step >= 2 ? 'var(--red)' : 'var(--ink)' }
    if (step === 3) return { name: 'klopa-worker', ip: '10.244.3.4', note: narrow ? ['novi Pod · nova IP', 'RESTARTS 0'] : 'novi Pod · RESTARTS 0', tone: 'var(--green)' }
    return null
  }
  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={`Korak ${step + 1}: ${STEPS[step].title}`} style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}>
      <text x={g.cmd[0]} y={g.cmd[1]} className={CMD[step].startsWith('$') ? 'k-svg-mono' : 'k-svg-hand'} style={{ fontSize: CMD[step].startsWith('$') ? g.mono + 1 : g.hand + 1, fontWeight: CMD[step].startsWith('$') ? 700 : 400, fill: CMD[step].startsWith('$') ? 'var(--ink)' : c }}>
        {CMD[step]}
      </text>
      {g.nodes.map((n, i) => {
        const off = i === 1 && step >= 2
        return (
          <g key={i}>
            <Rough shape={{ k: 'rect', x: n.x, y: n.y, w: n.w, h: n.h }} seed={12700 + i} stroke={off ? 'var(--red)' : 'var(--ink-2)'} strokeWidth={1.6} dash={off ? '4 4' : undefined} />
            <text x={n.x + 10} y={n.y + 22} className="k-svg-display" style={{ fontSize: 15, fontWeight: 700, fill: off ? 'var(--red)' : 'var(--ink)' }}>
              node-{i + 1}
              {off ? ' · NotReady' : ''}
            </text>
          </g>
        )
      })}
      {nodeOff && <SvgStamp x={g.nodes[1].x + g.nodes[1].w - (narrow ? 70 : 60)} y={g.nodes[1].y + (narrow ? 30 : 38)} text="UGAŠEN" size={15} />}
      {[0, 1, 2].map((i) => {
        const l = lines(i)
        if (!l) return null
        const [px, py] = g.pod(i)
        const [tx, ty] = g.text(i)
        const ghost = (i === 0 && step >= 1) || (i === 1 && step === 3)
        const status = i === 0 && step === 0 ? 'running' : i === 1 && step === 2 ? 'terminating' : 'running'
        return (
          <g key={i}>
            {ghost ? (
              <g>
                <Rough shape={{ k: 'rect', x: px - 34, y: py - 22, w: 68, h: 46 }} seed={12710 + i} stroke="var(--ink-3)" strokeWidth={1.3} dash="4 4" />
                {i === 0 && step === 1 && (
                  <g transform={`translate(${px} ${py})`}>
                    <Cross x={0} y={0} size={14} seed={12712} strokeWidth={2.6} />
                  </g>
                )}
              </g>
            ) : (
              <PodShape x={px} y={py} size={52} status={status} tone={i === 1 ? 'blue' : 'amber'} label={i === 1 ? 'api' : 'wrk'} />
            )}
            {i === 0 && step === 0 && (
              <text x={narrow ? 16 : px + 32} y={narrow ? py + 5 : py + 4} className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--red)', fontWeight: 700 }}>
                ↻ 1
              </text>
            )}
            <text x={tx} y={ty} textAnchor={g.anchor} className="k-svg-mono" style={{ fontSize: g.mono, fontWeight: 700, fill: ghost ? 'var(--ink-3)' : 'var(--ink)' }}>
              {l.name}
            </text>
            <text x={tx} y={ty + 20} textAnchor={g.anchor} className="k-svg-mono" style={{ fontSize: g.mono - 0.5, fill: 'var(--ink-2)' }}>
              IP {l.ip}
            </text>
            {(Array.isArray(l.note) ? l.note : [l.note]).map((line, k) => (
              <text key={line} x={tx} y={ty + 44 + k * 22} textAnchor={g.anchor} className="k-svg-hand" style={{ fontSize: g.hand, fill: l.tone }}>
                {line}
              </text>
            ))}
          </g>
        )
      })}
      {step === 0 && (
        <text x={narrow ? 134 : g.pod(0)[0]} y={narrow ? g.pod(0)[1] - 42 : g.pod(0)[1] - 40} textAnchor={narrow ? 'start' : 'middle'} className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--red)', fontWeight: 700 }}>
          exit 1 → ↻
        </text>
      )}
      <StepBadge n={step + 1} x={g.badge[0]} y={g.badge[1]} color={c} />
    </svg>
  )
}

export function BarePodStepper() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const g = w !== null && w < 650 ? NARROW : WIDE
  return (
    <div ref={ref}>
      <Stepper title="Goli Pod" steps={STEPS} caption="„Goli” Pod je Pod koji smo stvorili sami, bez kontrolera koji bi ga čuvao. Vremena 50 s i 5 min su zadane vrijednosti Kubernetesa.">
        {(step) => (
          <div style={g === NARROW ? { maxWidth: 440, margin: '0 auto' } : undefined}>
            <BareFrame step={step} g={g} />
          </div>
        )}
      </Stepper>
    </div>
  )
}
