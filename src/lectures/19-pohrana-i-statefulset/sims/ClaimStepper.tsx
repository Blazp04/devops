/**
 * Scene 2 „Narudžbenica za disk”: PVC (claim ticket) → StorageClass (factory with a CSI driver) → PV (the fridge),
 * WaitForFirstConsumer (first a node, then the disk in its zone), attach + mount, PVC protection and reclaim Delete.
 */
import { Arrow, K8sGlyph, PodShape, Rough, Scribble, StepBadge, Stepper, SvgStamp, stepColor, useWidth } from '../../../kit'
import { FridgeDisk } from './parts'

const STEPS = [
  {
    title: 'Narudžbenica: PersistentVolumeClaim',
    body: (
      <>
        Pod <code>db-pvc</code> ne traži određeni disk, nego ispunjava narudžbenicu: PVC <code>db-pvc-data</code>, 10Gi, način pristupa RWO, StorageClass <code>standard</code>. Dok Pod nema čvor, PVC je <code>Pending</code> – ta StorageClass ima <code>volumeBindingMode: WaitForFirstConsumer</code>.
      </>
    ),
  },
  {
    title: 'Prvo čvor, pa tek onda disk',
    body: (
      <>
        Raspoređivač odabire <code>node-2</code> u zoni b, ali Pod je još <code>Pending</code>. Tek sada se zna gdje disk treba: mrežni disk u oblaku obično se može spojiti samo na stroj u istoj zoni. Narudžbenica odlazi u „tvornicu”.
      </>
    ),
  },
  {
    title: 'Tvornica: StorageClass i CSI driver',
    body: (
      <>
        StorageClass je predložak, a CSI driver (<code>provisioner</code>) u oblaku stvara novi disk od 10 GiB. Kubernetes za njega upisuje PersistentVolume i veže ga uz PVC jedan-na-jedan: oba su sada <code>Bound</code>. Tek sada Pod dobiva čvor i prelazi u <code>ContainerCreating</code>. To je dinamičko stvaranje volumena.
      </>
    ),
  },
  {
    title: 'Spajanje i montiranje',
    body: (
      <>
        Disk se spaja (engl. <em>attach</em>) na <code>node-2</code>, a kubelet ga montira u kontejner na <code>/var/lib/postgresql</code>. Postgres se pokreće. Disk je izvan čvora – Pod ga samo posuđuje dok radi.
      </>
    ),
  },
  {
    title: 'Brisanje: zaštita, pa brisanje diska',
    body: (
      <>
        <code>kubectl delete pvc</code> ne briše disk odmah: dok ga Pod koristi, PVC ostaje <code>Terminating</code> (zaštita <code>pvc-protection</code>). Kad Poda nema, nestaje PVC, a s njim PV i disk – dinamički stvoreni volumeni imaju zadani <code>reclaimPolicy: Delete</code>.
      </>
    ),
  },
]

interface Geo {
  W: number
  H: number
  wait: [number, number]
  inNode: [number, number]
  ticket: { x: number; y: number; w: number; h: number }
  factory: { x: number; y: number; w: number; h: number }
  fridge: { x: number; y: number; w: number; h: number }
  nodes: { x: number; y: number; w: number; h: number; name: string; zone: string }[]
  cable: [number, number][]
  toFactory: [number, number][]
  bind: [number, number][]
  schedArrow: [number, number][]
  badge: [number, number]
  note: (step: number) => { x: number; y: number; anchor: 'start' | 'middle' | 'end' }
  mono: number
  hand: number
}

const WIDE: Geo = {
  W: 720,
  H: 330,
  wait: [96, 76],
  inNode: [470, 142],
  ticket: { x: 16, y: 160, w: 196, h: 116 },
  factory: { x: 240, y: 24, w: 150, h: 128 },
  fridge: { x: 292, y: 206, w: 46, h: 60 },
  nodes: [
    { x: 410, y: 24, w: 140, h: 262, name: 'node-2', zone: 'zona b' },
    { x: 566, y: 24, w: 140, h: 262, name: 'node-1', zone: 'zona a' },
  ],
  cable: [
    [338, 236],
    [410, 236],
  ],
  toFactory: [
    [212, 190],
    [262, 140],
  ],
  bind: [
    [212, 250],
    [290, 250],
  ],
  schedArrow: [
    [140, 60],
    [440, 100],
  ],
  badge: [700, 312],
  note: (s) => [
    { x: 114, y: 310, anchor: 'middle' as const },
    { x: 430, y: 312, anchor: 'middle' as const },
    { x: 315, y: 300, anchor: 'middle' as const },
    { x: 480, y: 312, anchor: 'middle' as const },
    { x: 114, y: 310, anchor: 'middle' as const },
  ][s],
  mono: 14,
  hand: 19,
}

const NARROW: Geo = {
  W: 360,
  H: 510,
  wait: [70, 62],
  inNode: [90, 410],
  ticket: { x: 168, y: 12, w: 184, h: 116 },
  factory: { x: 200, y: 150, w: 150, h: 128 },
  fridge: { x: 60, y: 200, w: 46, h: 60 },
  nodes: [
    { x: 8, y: 330, w: 166, h: 160, name: 'node-2', zone: 'zona b' },
    { x: 186, y: 330, w: 166, h: 160, name: 'node-1', zone: 'zona a' },
  ],
  cable: [
    [83, 260],
    [83, 330],
  ],
  toFactory: [
    [300, 130],
    [292, 160],
  ],
  bind: [
    [190, 120],
    [104, 204],
  ],
  schedArrow: [
    [70, 100],
    [86, 372],
  ],
  badge: [340, 498],
  note: (s) => [
    { x: 90, y: 140, anchor: 'middle' as const },
    { x: 200, y: 314, anchor: 'middle' as const },
    { x: 180, y: 300, anchor: 'middle' as const },
    { x: 200, y: 314, anchor: 'middle' as const },
    { x: 200, y: 314, anchor: 'middle' as const },
  ][s],
  mono: 14,
  hand: 19,
}

const NOTES = ['① Pending: čeka čvor', '② node-2 → disk u zoni b', '③ novi PV, Bound', '④ montiran u Pod', '⑤ Terminating, pa Delete']

function Frame({ step, g }: { step: number; g: Geo }) {
  const c = stepColor(step)
  const t = g.ticket
  const f = g.fridge
  const placed = step >= 1 && step < 4
  const podGone = step === 4
  // step 5 shows the end of the story: no Pod any more, so pvc-protection let the claim (and the disk) go
  const pvcStatus = step === 0 || step === 1 ? 'Pending' : step === 4 ? 'obrisan' : 'Bound'
  const podStatus = step <= 1 ? 'pending' : step === 2 ? 'creating' : 'running'
  const podLabel = step <= 1 ? 'Pending' : step === 2 ? 'ContainerCreating' : 'Running'
  const [px, py] = placed || step === 3 ? g.inNode : g.wait
  const note = g.note(step)
  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={`Korak ${step + 1}: ${STEPS[step].title}`} style={{ display: 'block', width: '100%', height: 'auto' }}>
      {/* nodes */}
      {g.nodes.map((n, i) => (
        <g key={n.name}>
          <Rough shape={{ k: 'rect', x: n.x, y: n.y, w: n.w, h: n.h }} seed={19900 + i} stroke={i === 0 && step >= 1 ? 'var(--pen)' : 'var(--ink-2)'} strokeWidth={1.6} />
          <text x={n.x + 10} y={n.y + 22} className="k-svg-display" style={{ fontSize: 15, fontWeight: 800, fill: 'var(--ink)' }}>
            {n.name}
          </text>
          <text x={n.x + 10} y={n.y + 44} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--ink-2)' }}>
            {n.zone}
          </text>
        </g>
      ))}
      {/* factory = StorageClass */}
      <Rough shape={{ k: 'rect', x: g.factory.x, y: g.factory.y, w: g.factory.w, h: g.factory.h }} seed={19910} stroke={step === 2 ? c : 'var(--ink-2)'} strokeWidth={step === 2 ? 2.2 : 1.6} />
      <K8sGlyph kind="sc" x={g.factory.x + 20} y={g.factory.y + 38} w={g.factory.w - 40} h={50} />
      <text x={g.factory.x + 10} y={g.factory.y + 20} className="k-svg-mono" style={{ fontSize: g.mono, fontWeight: 700, fill: 'var(--ink)' }}>
        StorageClass
      </text>
      <text x={g.factory.x + 10} y={g.factory.y + g.factory.h - 26} className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--ink-2)' }}>
        standard
      </text>
      <text x={g.factory.x + 10} y={g.factory.y + g.factory.h - 8} className="k-svg-mono" style={{ fontSize: g.mono - 1, fill: 'var(--ink-2)' }}>
        CSI driver
      </text>
      {/* Pod */}
      {!podGone ? (
        <PodShape x={px} y={py} size={50} status={podStatus} tone="teal" ariaLabel={`Pod db-pvc (${podLabel})`} />
      ) : (
        <g>
          <Rough shape={{ k: 'rect', x: g.inNode[0] - 28, y: g.inNode[1] - 20, w: 56, h: 40 }} seed={19920} stroke="var(--ink-3)" strokeWidth={1.3} dash="4 4" />
          <text x={g.inNode[0]} y={g.inNode[1] + 44} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--ink-2)' }}>
            Pod obrisan
          </text>
        </g>
      )}
      <text x={podGone ? g.inNode[0] : px} y={(podGone ? g.inNode[1] : py) - 40} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono, fontWeight: 700, fill: 'var(--ink)' }}>
        db-pvc
      </text>
      {step === 1 && <Arrow pts={g.schedArrow} stroke={c} strokeWidth={2} seed={19930} draw="mount" />}
      {/* the claim ticket */}
      <Rough shape={{ k: 'rect', x: t.x, y: t.y, w: t.w, h: t.h }} seed={19940} stroke="var(--ink)" strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'line', x1: t.x + 14, y1: t.y + 4, x2: t.x + 14, y2: t.y + t.h - 4 }} seed={19941} stroke="var(--ink-3)" strokeWidth={1.2} dash="3 4" />
      <text x={t.x + 24} y={t.y + 22} className="k-svg-mono" style={{ fontSize: g.mono, fontWeight: 700, fill: 'var(--ink)' }}>
        PVC db-pvc-data
      </text>
      {['10Gi · RWO', 'class: standard'].map((l, i) => (
        <text key={l} x={t.x + 24} y={t.y + 44 + i * 20} className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--ink-2)' }}>
          {l}
        </text>
      ))}
      <SvgStamp x={t.x + t.w - 64} y={t.y + t.h - 18} text={pvcStatus} tone={pvcStatus === 'Bound' ? 'green' : pvcStatus === 'Pending' ? 'pen' : 'red'} size={13} />
      {step === 1 && <Arrow pts={g.toFactory} stroke={c} strokeWidth={2} seed={19950} draw="mount" />}
      {/* the PV = fridge */}
      {step >= 2 && (
        <g>
          <FridgeDisk x={f.x} y={f.y} w={f.w} h={f.h} count={null} seed={19960} />
          <text x={f.x + f.w / 2} y={f.y - 8} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono, fontWeight: 700, fill: 'var(--ink)' }}>
            PV
          </text>
          {step === 4 && <Scribble x={f.x - 6} y={f.y - 4} w={f.w + 12} h={f.h + 8} />}
          {step >= 2 && step < 4 && <Rough shape={{ k: 'lin', pts: g.bind }} seed={19961} stroke="var(--green)" strokeWidth={1.8} dash="5 4" />}
        </g>
      )}
      {step === 3 && <Rough shape={{ k: 'lin', pts: g.cable }} seed={19970} stroke="var(--pen)" strokeWidth={2.4} />}
      {step === 3 && (
        <text x={g.inNode[0]} y={g.inNode[1] + 50} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono - 1, fill: 'var(--pen)' }}>
          /var/lib/postgresql
        </text>
      )}
      <text x={note.x} y={note.y} textAnchor={note.anchor} className="k-svg-hand" style={{ fontSize: g.hand, fill: c }}>
        {NOTES[step]}
      </text>
      <StepBadge n={step + 1} x={g.badge[0]} y={g.badge[1]} color={c} />
    </svg>
  )
}

export function ClaimStepper() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const g = w !== null && w < 650 ? NARROW : WIDE
  return (
    <div ref={ref}>
      <Stepper title="Od narudžbenice do diska" steps={STEPS} caption="Narudžbenica (PVC) traži disk, tvornica (StorageClass s CSI driverom) ga izrađuje, a PersistentVolume je zapis o tom disku u klasteru.">
        {(step) => (
          <div style={g === NARROW ? { maxWidth: 440, margin: '0 auto' } : undefined}>
            <Frame step={step} g={g} />
          </div>
        )}
      </Stepper>
    </div>
  )
}
