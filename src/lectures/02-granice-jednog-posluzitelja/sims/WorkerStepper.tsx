import { motion, useReducedMotion } from 'motion/react'
import { Arrow, Cross, Stepper, StepBadge, diagramIds, stepColor, trayFillOf, useSvgId, useWidth, DiagramDefs, type Pt } from '../../../kit'
import { cardGeo, plateGrid, stageLayoutFor, type StageGeo, type StageLayout } from '../geometry'
import type { PlateState, StageView } from '../view'
import { ServerStage } from './ServerStage'

const STEPS = [
  {
    title: 'Poslužitelj: dvije jezgre i 2 GB RAM-a',
    body: 'Svaka procesorska jezgra je jedan mozak. Od 2 GB RAM-a oko 512 MB treba operacijski sustav, a u ostatak stane šest radnika po ≈256 MB – šest tanjura. Radnik u jednom trenutku obrađuje jedan zahtjev.',
  },
  {
    title: 'Zahtjev dobiva radnika i računa',
    body: 'Narudžba stiže na port 8000 i dobiva slobodnog radnika (hrana na tanjuru). Radnik računa oko 50 ms – za to vrijeme drži jednu jezgru.',
  },
  {
    title: 'Radnik čeka bazu',
    body: 'Za narudžbu treba podatak iz baze. Radnik pošalje upit i čeka oko 1 s. Jezgra je za to vrijeme slobodna, ali tanjur – komad RAM-a – ostaje zauzet.',
  },
  {
    title: '11:58: četiri zahtjeva u sekundi',
    body: 'Svaki zahtjev drži radnika oko 1,05 s, pa su u prosjeku zauzeta oko 4 od 6 radnika (4 × 1,05 s), a ponekad i svih šest. Procesor radi tek 11 % vremena. Još sve stane.',
  },
  {
    title: '12:00: radnici puni, red pun – 503',
    body: 'Dolazi 12 zahtjeva u sekundi. Šest radnika može završiti najviše 6\u00a0/\u00a01,05\u00a0s ≈ 5,7 odgovora u sekundi. Višak čeka u redu od 10 mjesta, a kad se red napuni, svaki sljedeći zahtjev odmah dobiva grešku 503 – uz procesor na 17 %.',
  },
]

const SPEC = '2 vCPU · 2 GB · 15 €/mj.'

function plates(cpu: number, io: number): PlateState[] {
  return Array.from({ length: 6 }, (_, i): PlateState => (i < cpu ? 'cpu' : i < cpu + io ? 'io' : 'free'))
}

const VIEWS: StageView[] = [
  { offered: 4, students: 2, cores: [0, 0], plates: plates(0, 0), workers: '0/6', queue: 0, footer: 'CPU 0 % · RAM 2,0/2 GB', mood: 'calm', dbWaiting: 0 },
  { offered: 4, students: 2, cores: [0.9, 0], plates: plates(1, 0), workers: '1/6', queue: 0, footer: 'CPU 45 % · RAM 2,0/2 GB', mood: 'calm', dbWaiting: 0 },
  { offered: 4, students: 2, cores: [0, 0], plates: plates(0, 1), workers: '1/6', queue: 0, footer: 'CPU 0 % · RAM 2,0/2 GB', mood: 'calm', dbWaiting: 1 },
  { offered: 4, students: 2, cores: [0.11, 0.11], plates: plates(1, 3), workers: '4/6', queue: 0, footer: 'CPU 11 % · RAM 2,0/2 GB', mood: 'busy', dbWaiting: 3 },
  { offered: 12, students: 5, cores: [0.17, 0.17], plates: plates(1, 5), workers: '6/6', queue: 10, footer: 'CPU 17 % · RAM 2,0/2 GB', mood: 'panic', dbWaiting: 5 },
].map((p, i) => ({
  burstNote: i === 4 ? 'nalet ×3' : null,
  tap: i === 4,
  name: 'Klopa',
  spec: SPEC,
  queueMax: 10,
  stamp: null,
  footerBad: false,
  trays: [],
  fallLabel: i === 4 ? '503' : null,
  parked: 0,
  davor: i === 4 ? { lines: ['503! A CPU', 'je na 17 %?!'], tone: 'red' as const, buzz: true } : null,
  dim: false,
  ...p,
  mood: p.mood as StageView['mood'],
}))

/** Where the handwritten notes of each step sit (wide / narrow), and what they point at. */
interface Note {
  at: Pt
  lines: string[]
  anchor: 'start' | 'middle' | 'end'
  to?: Pt
  from?: Pt
  /** bend of the arrow (default: a slight bow between from and to) */
  via?: Pt
}

function notesFor(step: number, layout: StageLayout, geo: StageGeo): Note[] {
  const cg = cardGeo(geo.card)
  const brainR: Pt = [cg.brains.x + cg.brains.pitch + cg.brains.w + 6, cg.brains.y + cg.brains.h / 2]
  const grid = plateGrid(cg.plates, 6)
  const plate0 = grid.pts[0]
  if (layout === 'narrow') {
    switch (step) {
      case 0:
        return [
          { at: [16, 196], lines: ['jedna jezgra = jedan mozak'], anchor: 'start' },
          { at: [16, 238], lines: ['2 GB = 0,5 GB sustav', '+ 6 radnika × 256 MB'], anchor: 'start' },
        ]
      case 1:
        return [{ at: [16, 210], lines: ['radnik računa ≈ 50 ms', '(drži jednu jezgru)'], anchor: 'start' }]
      case 2:
        return [{ at: [16, 210], lines: ['jezgra slobodna,', 'radnik zauzet ≈ 1 s'], anchor: 'start' }]
      case 3:
        return [{ at: [16, 210], lines: ['≈ 4 od 6 radnika zauzeto,', 'procesor ≈ 11 %'], anchor: 'start' }]
      default:
        return [{ at: [16, 210], lines: ['6 radnika / 1,05 s', '≈ 5,7 odgovora/s < 12'], anchor: 'start' }]
    }
  }
  // wide: notes in the top-right corner, arrows bend round the right edge of the card;
  // medium (database under the card): the same corner, a little further left
  const nx = layout === 'wide' ? 600 : 520
  const toDb: Note['to'] = layout === 'wide' ? [geo.db.x + 20, geo.db.y - 6] : [geo.db.x + geo.db.w + 4, geo.db.y + 16]
  const dbVia: Pt | undefined = layout === 'wide' ? undefined : [650, 300]
  switch (step) {
    case 0:
      return [
        { at: [nx, 46], lines: ['jedna jezgra = jedan mozak'], anchor: 'middle', via: [652, 196], from: [640, 62], to: [brainR[0], brainR[1]] },
        { at: [150, 168], lines: ['2 GB = 0,5 GB sustav', '+ 6 radnika × 256 MB'], anchor: 'middle', from: [222, 200], to: [plate0[0] - grid.r - 5, plate0[1]] },
      ]
    case 1:
      return [{ at: [nx, 46], lines: ['radnik računa ≈ 50 ms', '(drži jednu jezgru)'], anchor: 'middle', via: [652, 196], from: [646, 84], to: [brainR[0], brainR[1]] }]
    case 2:
      return [{ at: [nx, 46], lines: ['jezgra slobodna,', 'radnik zauzet ≈ 1 s'], anchor: 'middle', from: [640, 84], via: dbVia, to: toDb }]
    case 3:
      return [{ at: [nx, 46], lines: ['≈ 4 od 6 radnika zauzeto,', 'procesor ≈ 11 %'], anchor: 'middle' }]
    default:
      return [{ at: [layout === 'wide' ? 580 : 520, 46], lines: ['6 radnika / 1,05 s', '≈ 5,7 odgovora/s < 12'], anchor: 'middle' }]
  }
}

/** Where the circled step number goes: just left of the step's first note (above it on the narrow stage). */
function badgeAt(n: Note, layout: StageLayout): Pt {
  if (layout === 'narrow') return [n.at[0] + 10, n.at[1] - 32]
  const w = Math.max(...n.lines.map((l) => l.length)) * 22 * 0.42
  const left = n.anchor === 'middle' ? n.at[0] - w / 2 : n.anchor === 'end' ? n.at[0] - w : n.at[0]
  return [left - 22, n.at[1] - 6]
}

function Notes({ step, layout, geo }: { step: number; layout: StageLayout; geo: StageGeo }) {
  const color = stepColor(step)
  const notes = notesFor(step, layout, geo)
  return (
    <g>
      {notes.map((n, i) => (
        <g key={`${step}-${i}`}>
          <text x={n.at[0]} y={n.at[1]} textAnchor={n.anchor} className="k-svg-hand" style={{ fontSize: 22, fill: color }}>
            {n.lines.map((l, k) => (
              <tspan key={k} x={n.at[0]} dy={k ? 23 : 0}>
                {l}
              </tspan>
            ))}
          </text>
          {n.from && n.to && <Arrow pts={[n.from, n.via ?? [(n.from[0] + n.to[0]) / 2 + 12, (n.from[1] + n.to[1]) / 2], n.to]} stroke={color} strokeWidth={1.7} seed={2500 + step * 7 + i} head={8} />}
        </g>
      ))}
      {notes.length > 0 && <StepBadge n={step + 1} x={badgeAt(notes[0], layout)[0]} y={badgeAt(notes[0], layout)[1]} r={15} color={color} />}
    </g>
  )
}

/** The request of this step, travelling the drawn road at constant speed (then, in step 5, falling at the door). */
function MovingTray({ step, geo }: { step: number; geo: StageGeo }) {
  const reduce = !!useReducedMotion()
  const id = useSvgId('l02st')
  const ids = diagramIds(id)
  const cg = cardGeo(geo.card)
  const [a, b] = [geo.inPath[0], geo.inPath[geo.inPath.length - 1]]
  const travel = 0.9
  if (step === 1 || step === 3) {
    const target = plateGrid(cg.plates, 6).pts[0]
    return (
      <g>
        <DiagramDefs id={id} />
        {!reduce && (
          <motion.g
            key={`t${step}`}
            initial={{ x: a[0], y: a[1], opacity: 1 }}
            animate={{ x: [a[0], b[0], target[0]], y: [a[1], b[1], target[1]], opacity: [1, 1, 0] }}
            transition={{ duration: travel * 1.4, ease: 'linear', delay: 0.4, times: [0, 0.65, 1] }}
          >
            <use href={ids.tray} x={-15} y={-10} width={30} height={20} fill="var(--tray)" />
          </motion.g>
        )}
      </g>
    )
  }
  if (step === 4) {
    const f = geo.fall
    return (
      <g>
        <DiagramDefs id={id} />
        {!reduce && (
          <motion.g key="go" initial={{ x: a[0], y: a[1], opacity: 1 }} animate={{ x: b[0], y: b[1], opacity: [1, 1, 0] }} transition={{ duration: travel, ease: 'linear', delay: 0.4, opacity: { duration: travel, times: [0, 0.95, 1], delay: 0.4 } }}>
            <use href={ids.tray} x={-15} y={-10} width={30} height={20} fill="var(--tray)" />
          </motion.g>
        )}
        <motion.g
          key="fall"
          initial={reduce ? { x: f[0], y: f[1], rotate: 32, opacity: 1 } : { x: b[0], y: b[1], rotate: 0, opacity: 0 }}
          animate={{ x: f[0], y: f[1], rotate: 32, opacity: 1 }}
          transition={{ duration: reduce ? 0 : 0.35, delay: reduce ? 0 : 0.4 + travel }}
        >
          <use href={ids.tray} x={-15} y={-10} width={30} height={20} fill={trayFillOf('bad')} />
          <g transform="translate(13 -9)">
            <Cross x={0} y={0} size={6} strokeWidth={2.2} seed={2510} />
          </g>
        </motion.g>
      </g>
    )
  }
  return null
}

/** Scene 1 „Što poslužitelj radi sa zahtjevom”: the worker-pool server, one step at a time (pure function of the step). */
export function WorkerStepper() {
  const [ref, width] = useWidth<HTMLDivElement>()
  const layout = stageLayoutFor(width)
  return (
    <div ref={ref} className="k-wide">
      <Stepper title="Jedan zahtjev, jedan radnik" steps={STEPS} autoPlay={0} caption="Brojke su iz simulacije (opterećenje I/O, 2 vCPU, 2 GB, seed 42).">
        {(step) => (
          <ServerStage
            view={VIEWS[step]}
            layout={layout}
            label={`Korak ${step + 1}: ${STEPS[step].title}. ${STEPS[step].body}`}
            overlay={(geo) => (
              <>
                <Notes step={step} layout={layout} geo={geo} />
                <MovingTray step={step} geo={geo} />
              </>
            )}
          />
        )}
      </Stepper>
    </div>
  )
}
