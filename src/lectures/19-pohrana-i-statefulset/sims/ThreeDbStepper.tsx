/**
 * Scene 4 „Tri baze umjesto jedne”: Postgres with replicas: 3 in a Deployment. Without a volume = three separate
 * databases behind a Service that picks a Pod per connection (the order „vanishes”); with one shared RWO PVC =
 * Multi-Attach on the other nodes and, on the same node, a second Postgres that fails on the data-directory lock.
 */
import { motion, useReducedMotion } from 'motion/react'
import { Arrow, Cross, Lana, PodShape, Rough, ServiceTag, SpeechBubble, StepBadge, Stepper, Tray, pointAt, stepColor, useWidth } from '../../../kit'
import { Cable, FridgeDisk } from './parts'

/** Deployment Pods get random names (ReplicaSet hash + suffix), shortened as in the simulation. */
const NAMES = ['postgres-…vq6xg', 'postgres-…skv6q', 'postgres-…j62lh']

const STEPS = [
  {
    title: 'replicas: 3, bez volumena',
    body: (
      <>
        Iva je Postgresu u Deploymentu postavila <code>replicas: 3</code>, „za svaki slučaj”. Nastala su tri Poda s nasumičnim imenima – i tri prazne baze, svaka u svom kontejneru. Ništa ih ne povezuje: Deployment samo kopira predložak Poda.
      </>
    ),
  },
  {
    title: 'Spremi narudžbu 1042',
    body: (
      <>
        Lana sprema narudžbu 1042. Service <code>postgres</code> za novu vezu bira jedan spreman Pod (<code>kube-proxy</code> nasumično) i redak završi u Podu <code>{NAMES[0]}</code>.
      </>
    ),
  },
  {
    title: 'Pročitaj narudžbu 1042',
    body: (
      <>
        Sljedeća veza završi na <code>{NAMES[2]}</code>, gdje tog retka nema: „narudžba je nestala”. Nakon sat vremena svaka baza ima trećinu narudžbi, a čitanje nađe narudžbu u otprilike 1 od 3 pokušaja.
      </>
    ),
  },
  {
    title: 'Jedan zajednički PVC?',
    body: (
      <>
        Iva pokuša s jednim PVC-om za sva tri Poda. Disk je RWO: spojen je na <code>node-1</code>, pa Podovi na <code>node-2</code> i <code>node-3</code> vise u <code>ContainerCreating</code> s greškom <code>Multi-Attach</code>.
      </>
    ),
  },
  {
    title: 'Dva Postgresa, jedan direktorij',
    body: (
      <>
        Kad drugi Pod završi na istom čvoru, disk se smije dijeliti (RWO = jedan čvor), ali Postgres ne. U najboljem slučaju drugi proces stane na datoteci <code>postmaster.pid</code> i ruši se (<code>CrashLoopBackOff</code>). U najgorem procesi u odvojenim kontejnerima ne vide jedan drugoga i oba pišu u iste datoteke – a to je put do oštećenih podataka. Kopije baze radi replikacija same baze (5. predavanje).
      </>
    ),
  },
]

interface Spot {
  x: number
  y: number
  tx: number
  ty: number
  anchor: 'middle' | 'start'
}

interface Geo {
  W: number
  H: number
  lana: [number, number, number]
  bubble: { x: number; y: number; w: number; h: number; tx: number; ty: number }
  tag: { x: number; y: number; w: number; h: number }
  node: (i: number) => { x: number; y: number; w: number; h: number }
  /** Pod i's spot; `crowded` = step 5, where the second Pod sits on node-1 next to the first */
  spot: (i: number, crowded: boolean) => Spot
  table: (i: number) => { x: number; y: number; w: number; h: number }
  fridge: [number, number]
  fridgeLabel: [number, number]
  cable: (i: number) => [number, number][]
  write: [number, number][]
  read: [number, number][]
  readEnd: [number, number]
  badge: [number, number]
  note: [number, number]
  podSize: number
}

const WIDE: Geo = {
  W: 720,
  H: 344,
  lana: [16, 150, 0.95],
  bubble: { x: 84, y: 108, w: 150, h: 50, tx: 66, ty: 170 },
  tag: { x: 120, y: 214, w: 132, h: 50 },
  node: (i) => ({ x: 288 + i * 144, y: 24, w: 136, h: 222 }),
  spot: (i, crowded) => {
    if (crowded && i === 0) return { x: 326, y: 82, tx: 356, ty: 122, anchor: 'middle' }
    if (crowded && i === 1) return { x: 390, y: 82, tx: 356, ty: 168, anchor: 'middle' }
    return { x: 356 + i * 144, y: 82, tx: 356 + i * 144, ty: 122, anchor: 'middle' }
  },
  table: (i) => ({ x: 302 + i * 144, y: 150, w: 108, h: 84 }),
  fridge: [334, 270],
  fridgeLabel: [386, 330],
  cable: (i) =>
    i === 0
      ? [
          [356, 270],
          [356, 246],
        ]
      : [
          [378, 292],
          [356 + i * 144, 292],
          [356 + i * 144, 246],
        ],
  write: [
    [252, 226],
    [338, 104],
  ],
  read: [
    [252, 238],
    [276, 12],
    [644, 12],
    [644, 56],
  ],
  readEnd: [676, 70],
  badge: [700, 326],
  note: [16, 326],
  podSize: 40,
}

const NARROW: Geo = {
  W: 360,
  H: 610,
  lana: [6, 14, 0.8],
  bubble: { x: 74, y: 8, w: 140, h: 48, tx: 56, ty: 36 },
  tag: { x: 100, y: 62, w: 132, h: 48 },
  node: (i) => ({ x: 32, y: 116 + i * 144, w: 320, h: 134 }),
  spot: (i, crowded) => {
    const y = 116 + (crowded && i === 1 ? 0 : i) * 144
    if (crowded && i === 1) return { x: 72, y: y + 104, tx: 104, ty: y + 96, anchor: 'start' }
    return { x: 72, y: y + 52, tx: 104, ty: y + 44, anchor: 'start' }
  },
  table: (i) => ({ x: 230, y: 116 + i * 144 + 26, w: 114, h: 96 }),
  fridge: [6, 548],
  fridgeLabel: [58, 590],
  cable: (i) => [
    [18, 548],
    [18, 116 + i * 144 + 67],
    [32, 116 + i * 144 + 67],
  ],
  write: [
    [150, 110],
    [84, 146],
  ],
  read: [
    [100, 86],
    [10, 86],
    [10, 456],
    [44, 456],
  ],
  readEnd: [58, 480],
  badge: [340, 596],
  note: [62, 572],
  podSize: 40,
}

const NOTES: (string | null)[] = ['① tri prazne baze', `② 1042 → ${NAMES[0]}`, null, '④ Multi-Attach na node-2 i node-3', '⑤ dva procesa, jedan direktorij']

const ROWS: string[][][] = [
  [[], [], []],
  [['1042'], [], []],
  [['1042', '1045'], ['1043'], ['1044']],
]

function Frame({ step, g }: { step: number; g: Geo }) {
  const reduce = useReducedMotion()
  const c = stepColor(step)
  // the write: draw the route first, then the tray travels along it (linear), stopping just before the Pod
  const [sx, sy] = pointAt(g.write, 0.12)
  const [ex, ey] = pointAt(g.write, 0.8)
  const shared = step >= 3
  const crowded = step === 4
  const rows = ROWS[Math.min(step, 2)]
  const pods = [0, 1, 2].map((i) => {
    if (!shared || i === 0) return { status: 'running' as const, label: 'Running', color: 'var(--green)', note: null as string | null }
    if (crowded && i === 1) return { status: 'crash' as const, label: 'CrashLoopBackOff', color: 'var(--red)', note: '✗ postmaster.pid' }
    return { status: 'creating' as const, label: 'ContainerCreating', color: 'var(--orange)', note: '✗ Multi-Attach' }
  })
  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={`Korak ${step + 1}: ${STEPS[step].title}`} style={{ display: 'block', width: '100%', height: 'auto' }}>
      <Lana x={g.lana[0]} y={g.lana[1]} scale={g.lana[2]} mood={step === 2 ? 'worry' : 'smile'} />
      {step === 2 && <SpeechBubble {...g.bubble} lines={['Gdje je 1042?!']} size={g === NARROW ? 19.5 : 18} />}
      <ServiceTag x={g.tag.x} y={g.tag.y} w={g.tag.w} h={g.tag.h}>
        <text x={g.tag.x + 26} y={g.tag.y + 20} className="k-svg-mono" style={{ fontSize: 13, fontWeight: 700, fill: 'var(--ink)' }}>
          Service
        </text>
        <text x={g.tag.x + 26} y={g.tag.y + 38} className="k-svg-mono" style={{ fontSize: 13, fill: 'var(--ink-2)' }}>
          postgres
        </text>
      </ServiceTag>
      {[0, 1, 2].map((i) => {
        const n = g.node(i)
        const t = g.table(i)
        const empty = crowded && i === 1
        return (
          <g key={i}>
            <Rough shape={{ k: 'rect', x: n.x, y: n.y, w: n.w, h: n.h }} seed={20100 + i} stroke="var(--ink-2)" strokeWidth={1.5} />
            <text x={n.x + 8} y={n.y + 18} className="k-svg-display" style={{ fontSize: 14, fontWeight: 800, fill: 'var(--ink)' }}>
              node-{i + 1}
            </text>
            {empty && (
              <text x={n.x + n.w / 2} y={n.y + n.h / 2} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 18.5, fill: 'var(--ink-3)' }}>
                prazno
              </text>
            )}
            {!shared && (
              <g>
                <Rough shape={{ k: 'rect', x: t.x, y: t.y, w: t.w, h: t.h }} seed={20110 + i} stroke="var(--ink-2)" strokeWidth={1.3} fillColor="var(--hl-pink-ink)" hachureGap={7} fillWeight={0.5} />
                <text x={t.x + 8} y={t.y + 18} className="k-svg-mono k-dhalo" style={{ fontSize: 13, fontWeight: 700, fill: 'var(--ink)' }}>
                  narudžbe
                </text>
                {rows[i].length === 0 ? (
                  <text x={t.x + 8} y={t.y + 42} className="k-svg-hand k-dhalo" style={{ fontSize: 18.5, fill: 'var(--ink-2)' }}>
                    prazno
                  </text>
                ) : (
                  rows[i].map((r, k) => (
                    <text key={r} x={t.x + 8} y={t.y + 38 + k * 18} className="k-svg-mono k-dhalo" style={{ fontSize: 13, fill: 'var(--ink)' }}>
                      {r}
                    </text>
                  ))
                )}
              </g>
            )}
          </g>
        )
      })}
      {[0, 1, 2].map((i) => {
        const sp = g.spot(i, crowded)
        const p = pods[i]
        return (
          <g key={`p${i}`}>
            <PodShape x={sp.x} y={sp.y} size={g.podSize} status={p.status} tone="teal" ariaLabel={`${NAMES[i]}: ${p.label}`} />
            <text x={sp.tx} y={sp.ty} textAnchor={sp.anchor} className="k-svg-mono" style={{ fontSize: 13, fontWeight: 700, fill: 'var(--ink)' }}>
              {NAMES[i]}
            </text>
            <text x={sp.tx} y={sp.ty + 17} textAnchor={sp.anchor} className="k-svg-mono" style={{ fontSize: 13, fill: p.color }}>
              {p.label}
            </text>
            {p.note && (
              <text x={sp.tx} y={sp.ty + 34} textAnchor={sp.anchor} className="k-svg-mono" style={{ fontSize: 13, fontWeight: 700, fill: 'var(--red)' }}>
                {p.note}
              </text>
            )}
          </g>
        )
      })}
      {step === 1 && (
        <g>
          <Arrow pts={g.write} stroke={c} strokeWidth={2} seed={20120} draw="mount" />
          <motion.g initial={reduce ? false : { x: sx - ex, y: sy - ey }} animate={{ x: 0, y: 0 }} transition={{ duration: 0.8, ease: 'linear', delay: 0.6 }}>
            <Tray x={ex} y={ey} w={30} />
          </motion.g>
        </g>
      )}
      {step === 2 && (
        <g>
          <Arrow pts={g.read} stroke="var(--red)" strokeWidth={2} seed={20130} draw="mount" />
          <Cross x={g.readEnd[0]} y={g.readEnd[1]} size={11} />
        </g>
      )}
      {shared && (
        <g>
          {[0, 1, 2].map((i) => (crowded && i === 1 ? null : <Cable key={i} pts={g.cable(i)} state={i === 0 ? 'attached' : 'stuck'} seed={20140 + i} />))}
          <FridgeDisk x={g.fridge[0]} y={g.fridge[1]} w={44} h={56} count={null} seed={20150} />
          <text x={g.fridgeLabel[0]} y={g.fridgeLabel[1]} className="k-svg-mono" style={{ fontSize: 13, fontWeight: 700, fill: 'var(--ink)' }}>
            PVC postgres-data · RWO
          </text>
        </g>
      )}
      {NOTES[step] && (
        <text x={g.note[0]} y={g.note[1]} className="k-svg-hand" style={{ fontSize: 18.5, fill: c }}>
          {NOTES[step]}
        </text>
      )}
      <StepBadge n={step + 1} x={g.badge[0]} y={g.badge[1]} color={c} />
    </svg>
  )
}

export function ThreeDbStepper() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const g = w !== null && w < 650 ? NARROW : WIDE
  return (
    <div ref={ref}>
      <Stepper title="Postgres s replicas: 3 u Deploymentu" steps={STEPS} caption="Ono što ste vidjeli u incidentu: Deployment umnaža Podove, ali ne i bazu. Tri kopije Poda nisu klaster baze.">
        {(step) => (
          <div style={g === NARROW ? { maxWidth: 440, margin: '0 auto' } : undefined}>
            <Frame step={step} g={g} />
          </div>
        )}
      </Stepper>
    </div>
  )
}
