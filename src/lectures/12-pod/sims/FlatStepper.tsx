/**
 * Scene 1 „Stan s cimerima”: a Pod is a lunchbox (= the flat) with one or more food boxes (containers) that share
 * one IP address, localhost and a volume (the shared fridge); one main concern per Pod; labels pick Pods out.
 */
import { Cross, Cylinder, FoodBox, Fridge, PodShape, Rough, StepBadge, Stepper, stepColor, useWidth } from '../../../kit'

const STEPS = [
  {
    title: 'Pod je kutija za ručak',
    body: 'Kontejner klopa-api je kutijica s hranom, a Pod je kutija za ručak oko nje. Kubernetes ne pokreće gole kontejnere nego Podove. Svaki Pod dobiva svoju IP adresu, a kontejner u njemu sluša na portu 8000. Najčešće je u Podu točno jedan kontejner.',
  },
  {
    title: 'Cimeri dijele adresu i hladnjak',
    body: 'Drugi kontejner u istom Podu, na primjer pomoćnik koji šalje zapise dalje, dijeli istu IP adresu: do API-ja dolazi preko localhost:8000. Oba vide isti volumen, zajednički hladnjak s datotekama. Pokreću se na istom čvoru i nestaju zajedno.',
  },
  {
    title: 'Jedan glavni posao po Podu',
    body: 'Zašto onda ne bismo i bazu stavili u isti Pod? Podovi se skaliraju i zamjenjuju kao cjelina: tri replike API-ja značile bi tri odvojene baze, a svaka zamjena Poda novu, praznu bazu. Baza živi u svojem Podu (19. predavanje) ili izvan klastera.',
  },
  {
    title: 'Oznake: kako pronaći svoje Podove',
    body: 'Svaki Pod nosi oznake (engl. labels), parove ključ=vrijednost poput app=klopa-api. Naredba kubectl get pods -l app=klopa-api vraća samo Podove s tom oznakom. Na isti način Podove će pronalaziti Deployment i Service.',
  },
]

interface Geo {
  W: number
  H: number
  pod: { x: number; y: number; w: number; h: number }
  title: [number, number]
  ipTape: [number, number]
  api: { x: number; y: number; w: number; h: number }
  helper: { x: number; y: number; w: number; h: number }
  fridge: { x: number; y: number; w: number; h: number }
  arrowIn: [number, number][]
  arrowText: [number, number]
  badge: [number, number][]
  replicas: { x: number; y: number; w: number; h: number }[]
  labelled: [number, number][]
  cmd: [number, number]
  hand: number
  mono: number
}

const WIDE: Geo = {
  W: 640,
  H: 320,
  pod: { x: 30, y: 54, w: 420, h: 248 },
  title: [48, 90],
  ipTape: [312, 66],
  api: { x: 54, y: 112, w: 160, h: 86 },
  helper: { x: 270, y: 112, w: 160, h: 86 },
  fridge: { x: 210, y: 220, w: 64, h: 70 },
  arrowIn: [
    [626, 150],
    [454, 150],
  ],
  arrowText: [540, 136],
  badge: [
    [610, 40],
    [610, 40],
    [610, 40],
    [610, 40],
  ],
  replicas: [
    { x: 20, y: 110, w: 180, h: 150 },
    { x: 230, y: 110, w: 180, h: 150 },
    { x: 440, y: 110, w: 180, h: 150 },
  ],
  labelled: [
    [90, 168],
    [240, 168],
    [390, 168],
    [540, 168],
  ],
  cmd: [24, 50],
  hand: 19,
  mono: 13.5,
}

const NARROW: Geo = {
  W: 360,
  H: 430,
  pod: { x: 14, y: 76, w: 332, h: 268 },
  title: [30, 104],
  ipTape: [212, 88],
  api: { x: 30, y: 130, w: 136, h: 80 },
  helper: { x: 194, y: 130, w: 136, h: 80 },
  fridge: { x: 148, y: 252, w: 64, h: 74 },
  arrowIn: [
    [100, 420],
    [100, 348],
  ],
  arrowText: [110, 396],
  badge: [
    [320, 386],
    [180, 40],
    [330, 60],
    [330, 60],
  ],
  replicas: [
    { x: 14, y: 108, w: 104, h: 170 },
    { x: 128, y: 108, w: 104, h: 170 },
    { x: 242, y: 108, w: 104, h: 170 },
  ],
  labelled: [
    [95, 150],
    [265, 150],
    [95, 290],
    [265, 290],
  ],
  cmd: [14, 46],
  hand: 20,
  mono: 13.5,
}

function BigLunchbox({ x, y, w, h, seed }: { x: number; y: number; w: number; h: number; seed: number }) {
  return (
    <g>
      <Rough shape={{ k: 'arc', cx: x + w / 2, cy: y, w: Math.min(140, w * 0.34), h: 52, start: Math.PI, stop: Math.PI * 2 }} seed={seed} strokeWidth={2.4} />
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed + 1} strokeWidth={2.2} fillColor="var(--hl-blue-ink)" hachureGap={14} fillWeight={0.5} />
      <rect x={x + 8} y={y + 8} width={w - 16} height={h - 16} rx={6} className="k-paper-fill" />
    </g>
  )
}

function Apartment({ step, g }: { step: number; g: Geo }) {
  const two = step >= 1
  const narrow = g.W < 400
  const c0 = stepColor(0)
  const c1 = stepColor(1)
  const apiMid: [number, number] = [g.api.x + g.api.w, g.api.y + g.api.h / 2]
  const helperMid: [number, number] = [g.helper.x, g.helper.y + g.helper.h / 2]
  return (
    <g>
      <BigLunchbox x={g.pod.x} y={g.pod.y} w={g.pod.w} h={g.pod.h} seed={12010} />
      <text x={g.title[0]} y={g.title[1]} className="k-svg-display" style={{ fontSize: 18, fontWeight: 800 }}>
        Pod klopa-api-1
      </text>
      <g transform={`rotate(4 ${g.ipTape[0]} ${g.ipTape[1]})`}>
        <rect x={g.ipTape[0] - 6} y={g.ipTape[1] - 6} width={narrow ? 128 : 124} height={30} className="k-vtape k-vtape--v1" />
        <text x={g.ipTape[0] + (narrow ? 58 : 56)} y={g.ipTape[1] + 14} textAnchor="middle" className="k-vtape-text" style={{ fontSize: g.mono, fontWeight: 700 }}>
          IP 10.244.1.12
        </text>
      </g>
      <FoodBox x={g.api.x} y={g.api.y} w={g.api.w} h={g.api.h} label="klopa-api" labelSize={g.mono + 1} tint="var(--hl-blue-ink)" seed={12020} />
      <text x={g.api.x + g.api.w / 2} y={g.api.y + g.api.h + 20} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono }}>
        sluša na :8000
      </text>
      {two && (
        <g>
          <FoodBox x={g.helper.x} y={g.helper.y} w={g.helper.w} h={g.helper.h} label="pomoćnik" labelSize={g.mono + 1} tint="var(--hl-green-ink)" angle={41} seed={12030} />
          <Rough shape={{ k: 'line', x1: helperMid[0] - 4, y1: helperMid[1], x2: apiMid[0] + 6, y2: apiMid[1] }} seed={12031} stroke={c1} strokeWidth={1.8} dash="5 4" />
          <Rough shape={{ k: 'lin', pts: [[apiMid[0] + 16, apiMid[1] - 7], [apiMid[0] + 6, apiMid[1]], [apiMid[0] + 16, apiMid[1] + 7]] }} seed={12032} stroke={c1} strokeWidth={1.8} />
          <text x={(apiMid[0] + helperMid[0]) / 2} y={narrow ? g.api.y - 4 : apiMid[1] - 12} textAnchor="middle" className="k-svg-mono" style={{ fontSize: narrow ? g.mono : g.mono - 1, fill: c1, fontWeight: 700 }}>
            {narrow ? 'localhost' : 'localhost:8000'}
          </text>
          <Fridge x={g.fridge.x} y={g.fridge.y} w={g.fridge.w} h={g.fridge.h} seed={12040} />
          <Rough shape={{ k: 'line', x1: g.api.x + g.api.w * 0.7, y1: g.api.y + g.api.h + 26, x2: g.fridge.x + 4, y2: g.fridge.y + 18 }} seed={12041} stroke={c1} strokeWidth={1.4} dash="3 4" />
          <Rough shape={{ k: 'line', x1: g.helper.x + g.helper.w * 0.3, y1: g.helper.y + g.helper.h + 4, x2: g.fridge.x + g.fridge.w - 4, y2: g.fridge.y + 18 }} seed={12042} stroke={c1} strokeWidth={1.4} dash="3 4" />
          <text x={g.fridge.x + g.fridge.w + 10} y={g.fridge.y + g.fridge.h / 2} className="k-svg-hand" style={{ fontSize: g.hand, fill: c1 }}>
            {narrow ? 'hladnjak =' : 'zajednički hladnjak ='}
          </text>
          <text x={g.fridge.x + g.fridge.w + 10} y={g.fridge.y + g.fridge.h / 2 + 22} className="k-svg-mono" style={{ fontSize: g.mono, fill: c1 }}>
            volumen
          </text>
        </g>
      )}
      {/* the request arrives at the Pod's address */}
      <Rough shape={{ k: 'line', x1: g.arrowIn[0][0], y1: g.arrowIn[0][1], x2: g.arrowIn[1][0], y2: g.arrowIn[1][1] }} seed={12050} stroke="var(--tray-ink)" strokeWidth={2} />
      <Rough
        shape={{ k: 'lin', pts: narrow ? [[g.arrowIn[1][0] - 8, g.arrowIn[1][1] + 12], [g.arrowIn[1][0], g.arrowIn[1][1]], [g.arrowIn[1][0] + 8, g.arrowIn[1][1] + 12]] : [[g.arrowIn[1][0] + 12, g.arrowIn[1][1] - 8], [g.arrowIn[1][0], g.arrowIn[1][1]], [g.arrowIn[1][0] + 12, g.arrowIn[1][1] + 8]] }}
        seed={12051}
        stroke="var(--tray-ink)"
        strokeWidth={2}
      />
      <text x={g.arrowText[0]} y={g.arrowText[1]} textAnchor={narrow ? 'start' : 'middle'} className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--tray-ink)', fontWeight: 700 }}>
        10.244.1.12:8000
      </text>
      {!two && (
        <text x={narrow ? g.pod.x + 16 : g.pod.x + g.pod.w + 20} y={narrow ? g.pod.y + g.pod.h - 52 : g.pod.y + 210} className="k-svg-hand" style={{ fontSize: g.hand, fill: c0 }}>
          {narrow ? 'kutija = Pod, kutijica = kontejner' : 'kutija za ručak = Pod'}
        </text>
      )}
      {!two && !narrow && (
        <text x={g.pod.x + g.pod.w + 20} y={g.pod.y + 236} className="k-svg-hand" style={{ fontSize: g.hand, fill: c0 }}>
          kutijica = kontejner
        </text>
      )}
    </g>
  )
}

function Replicas({ g }: { g: Geo }) {
  const narrow = g.W < 400
  const c = stepColor(2)
  return (
    <g>
      <text x={g.W / 2} y={narrow ? 52 : 50} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand + 2, fill: c }}>
        API + baza u istom Podu, pa 3 replike…
      </text>
      {g.replicas.map((b, i) => (
        <g key={i}>
          <BigLunchbox x={b.x} y={b.y} w={b.w} h={b.h} seed={12100 + i * 5} />
          <FoodBox x={b.x + 14} y={b.y + 20} w={narrow ? b.w - 28 : 80} h={narrow ? 54 : 70} label="api" labelSize={g.mono} tint="var(--hl-blue-ink)" seed={12110 + i} />
          <Cylinder x={narrow ? b.x + b.w / 2 - 22 : b.x + 108} y={narrow ? b.y + 90 : b.y + 28} w={44} h={52} seed={12120 + i} />
          <text x={narrow ? b.x + b.w / 2 : b.x + 130} y={(narrow ? b.y + 90 : b.y + 28) + 35} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono, fontWeight: 600 }}>
            db
          </text>
          <text x={b.x + b.w / 2} y={b.y + b.h - 14} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono - 0.5, fill: 'var(--red)', fontWeight: 700 }}>
            baza {i + 1}?!
          </text>
        </g>
      ))}
      <g transform={`translate(${g.W / 2} ${narrow ? 300 : 186})`}>
        <Cross x={0} y={0} size={narrow ? 26 : 34} seed={12130} strokeWidth={3.4} />
      </g>
      <text x={g.W / 2} y={narrow ? 320 + 14 : 292} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand, fill: c }}>
        {narrow ? 'tri odvojene baze, svaka zamjena = prazna' : 'tri odvojene baze, a svaka zamjena Poda donosi praznu'}
      </text>
      {narrow && (
        <text x={g.W / 2} y={360} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--green)' }}>
          → baza u svojem Podu
        </text>
      )}
      {!narrow && (
        <text x={g.W / 2} y={316} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--green)' }}>
          ✓ jedan glavni posao po Podu; baza živi zasebno
        </text>
      )}
    </g>
  )
}

function Labels({ g }: { g: Geo }) {
  const c = stepColor(3)
  const narrow = g.W < 400
  const pods = [
    { label: 'app=klopa-api', match: true },
    { label: 'app=klopa-api', match: true },
    { label: 'app=klopa-worker', match: false },
    { label: 'app=klopa-api', match: true },
  ]
  return (
    <g>
      <text x={g.cmd[0]} y={g.cmd[1]} className="k-svg-mono" style={{ fontSize: g.mono + 0.5, fontWeight: 700 }}>
        $ kubectl get pods -l app=klopa-api
      </text>
      {pods.map((p, i) => {
        const [x, y] = g.labelled[i]
        return (
          <g key={i}>
            <PodShape x={x} y={y} size={narrow ? 46 : 52} status="running" tone={p.match ? 'blue' : 'amber'} label={p.match ? 'api' : 'wrk'} selected={p.match} />
            <text x={x} y={y + (narrow ? 52 : 58)} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono - 0.5, fill: p.match ? c : 'var(--ink-3)', fontWeight: p.match ? 700 : 400 }}>
              {p.label}
            </text>
          </g>
        )
      })}
      <text x={g.W / 2} y={narrow ? 384 : 282} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand + 1, fill: c }}>
        {narrow ? '→ 3 Poda s oznakom app=klopa-api' : '→ vraća 3 Poda; klopa-worker ima drugu oznaku'}
      </text>
    </g>
  )
}

function FlatFrame({ step, g }: { step: number; g: Geo }) {
  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={`Korak ${step + 1}: ${STEPS[step].title}`} style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}>
      {step <= 1 && <Apartment step={step} g={g} />}
      {step === 2 && <Replicas g={g} />}
      {step === 3 && <Labels g={g} />}
      <StepBadge n={step + 1} x={g.badge[step][0]} y={g.badge[step][1]} color={stepColor(step)} />
    </svg>
  )
}

export function FlatStepper() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const g = w !== null && w < 600 ? NARROW : WIDE
  return (
    <div ref={ref}>
      <Stepper title="Pod kao stan s cimerima" steps={STEPS} caption="U ovom tečaju klopa-api ima jedan kontejner po Podu. Više kontejnera u Podu ima smisla samo za usko povezane pomoćnike.">
        {(step) => (
          <div style={g === NARROW ? { maxWidth: 440, margin: '0 auto' } : undefined}>
            <FlatFrame step={step} g={g} />
          </div>
        )}
      </Stepper>
    </div>
  )
}
