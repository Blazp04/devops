import { useReducedMotion } from 'motion/react'
import { Arrow, Cross, Crowd, Packet, Redar, Rough, StepBadge, Stepper, Student, stepColor, useWidth } from '../../../kit'
import { HandNote, MiniCard } from './Sketches'
import css from '../styles.module.css'

/* Hook animation „DNS kao load balancer?” – what Davor tried first. Each step is a pure drawing of `step`.
   Wide: DNS card top-left, students under it, servers on the right. Narrow: DNS + students on top, servers in a row. */

const STEPS = [
  {
    title: 'Tri adrese pod jednim imenom',
    body: (
      <>
        Davor je u DNS upisao tri A zapisa za <code>klopa.example</code>. DNS poslužitelj ih svakom novom pitanju vraća u drugom redoslijedu, a klijent se najčešće spaja na prvu adresu.
      </>
    ),
  },
  {
    title: 'Svakome trećina',
    body: <>Klijenti se raspodijele otprilike jednako: od 15 zahtjeva u sekundi svaki poslužitelj dobije oko 5. DNS ne zna da Veliki ima četiri puta više jezgri od Malog – Mali je na rubu, a Veliki radi na četvrtini snage.</>,
  },
  {
    title: 'Cijeli kampus iza jednog razrješivača',
    body: <>Studenti s fakultetske mreže pitaju isti razrješivač (engl. <em>resolver</em>), a on odgovor pamti onoliko koliko kaže TTL (npr. 5 minuta) i, ako ne miješa redoslijed, cijeli kampus šalje na istu adresu. Promet tada stiže u velikim skupinama, a ne ravnomjerno.</>,
  },
  {
    title: 'Mali padne, a adresa ostaje',
    body: <>Davor briše zapis za Malog, ali razrješivači, operacijski sustavi i preglednici stari odgovor pamte do isteka TTL-a, neki i dulje. Dio studenata minutama šalje na mrtvu adresu (preglednik nakon čekanja ponekad proba sljedeću adresu). DNS ne provjerava je li poslužitelj živ.</>,
  },
  {
    title: 'Treba nam netko na ulazu',
    body: <>Load balancer stoji ispred poslužitelja: svi šalju na njegovu jednu adresu, a on za svaki zahtjev bira poslužitelj – i može uzeti u obzir koliko je koji jak i je li živ.</>,
  },
]

interface G {
  W: number
  H: number
  dns: { x: number; y: number; w: number; h: number }
  students: { x: number; y: number; s: number }
  from: [number, number]
  servers: { x: number; y: number; w: number; h: number }[]
  /** where a server card is entered by an arrow */
  door: (i: number) => [number, number]
  note: { x: number; y: number; size: number }
  size: number
}

const WIDE: G = {
  W: 760,
  H: 372,
  dns: { x: 14, y: 14, w: 236, h: 150 },
  students: { x: 40, y: 350, s: 0.46 },
  from: [205, 290],
  servers: [
    { x: 556, y: 12, w: 196, h: 104 },
    { x: 556, y: 136, w: 196, h: 104 },
    { x: 556, y: 260, w: 196, h: 104 },
  ],
  door: (i) => [552, 64 + i * 124],
  note: { x: 278, y: 34, size: 21 },
  size: 1,
}

const NARROW: G = {
  W: 340,
  H: 560,
  dns: { x: 8, y: 8, w: 214, h: 146 },
  students: { x: 246, y: 152, s: 0.36 },
  from: [276, 168],
  servers: [
    { x: 4, y: 430, w: 106, h: 124 },
    { x: 117, y: 430, w: 106, h: 124 },
    { x: 230, y: 430, w: 106, h: 124 },
  ],
  door: (i) => [57 + i * 113, 426],
  note: { x: 10, y: 206, size: 19 },
  size: 0.84,
}

const NAMES = ['Mali', 'Srednji', 'Veliki']
const SPECS = ['1 vCPU · 2 GB', '2 vCPU · 4 GB', '4 vCPU · 8 GB']
// public addresses (RFC 5737 documentation range): the internet cannot reach private 10.x addresses
const IPS = ['203.0.113.11', '203.0.113.12', '203.0.113.13']
const LB_IP = '203.0.113.10'
/** trays travel at one constant speed (drawing units per second) on every route */
const SPEED = 300

function DnsCard({ g, step }: { g: G; step: number }) {
  const { x, y, w, h } = g.dns
  const order = step === 0 ? [1, 2, 0] : step === 2 ? [1, 0, 2] : [0, 1, 2]
  const rowH = (h - 70) / 3
  const lb = step === 4
  const ttl = step === 2 ? 'TTL 300 s · još 4 min' : step === 3 ? 'TTL 300 s · još 3 min' : 'TTL 300 s'
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={6101} strokeWidth={1.7} fillColor="var(--note-blue)" fillStyle="solid" />
      <text x={x + 12} y={y + 27} className="k-svg-display" style={{ fontSize: 20, fill: 'var(--note-ink)' }}>
        DNS
      </text>
      <text x={x + 62} y={y + 26} className="k-svg-mono" style={{ fontSize: 15, fill: 'var(--note-ink)' }}>
        klopa.example
      </text>
      {(lb ? [3] : order).map((k, i) => {
        const ry = y + 58 + i * rowH
        const dead = step === 3 && k === 0
        return (
          <g key={k}>
            <text x={x + 12} y={ry} className="k-svg-mono" style={{ fontSize: 15, fill: 'var(--note-ink)' }}>
              A {k === 3 ? LB_IP : IPS[k]}
            </text>
            {k === 3 ? (
              <text x={x + 12} y={ry + 24} className="k-svg-hand" style={{ fontSize: 19, fill: 'var(--note-ink)' }}>
                = load balancer
              </text>
            ) : (
              <text x={x + w - 12} y={ry} textAnchor="end" className="k-svg-hand" style={{ fontSize: 19, fill: 'var(--note-ink)' }}>
                {NAMES[k]}
              </text>
            )}
            {dead && <Rough shape={{ k: 'line', x1: x + 8, y1: ry - 5, x2: x + w - 8, y2: ry - 4 }} seed={6110} stroke="var(--note-ink)" strokeWidth={2.2} />}
            {dead && <Cross x={x + w + 14} y={ry - 5} size={9} seed={6111} strokeWidth={2.4} />}
          </g>
        )
      })}
      <text x={x + 12} y={y + h - 10} className="k-svg-mono" style={{ fontSize: 13.5, fill: 'var(--note-ink)', fontWeight: step === 2 || step === 3 ? 700 : 400 }}>
        {ttl}
      </text>
    </g>
  )
}

function DnsDrawing({ step, narrow }: { step: number; narrow: boolean }) {
  const g = narrow ? NARROW : WIDE
  const c = stepColor(step)
  // per-server load and requests per second in this step
  const rate = step === 2 ? [0, 15, 0] : step === 3 ? [3, 6, 6] : step === 4 ? [2.1, 4.3, 8.6] : [5, 5, 5]
  const cap = [5, 10, 20]
  const down = step === 3 ? [true, false, false] : [false, false, false]
  const reduce = useReducedMotion()
  const lbX = narrow ? 170 : 380
  const lbY = narrow ? 330 : 250
  const notes: Record<number, string[]> = narrow
    ? {
        0: ['DNS poslužitelj vrti redoslijed:', '.12, .13, .11 …'],
        1: ['po broju ljudi, ne po snazi:', 'Mali 100 %, Veliki 25 %'],
        2: ['jedan odgovor za cijeli kampus', 'dok ne istekne TTL'],
        3: ['zapis je obrisan, ali odgovor', 'je još u predmemoriji'],
        4: ['jedna adresa, odluka za svaki', 'zahtjev – npr. težinski 1 : 2 : 4'],
      }
    : {
        0: ['DNS poslužitelj vrti redoslijed:', '.12, .13, .11 → .13, .11, .12 …'],
        1: ['dijeli po broju ljudi,', 'a ne po snazi poslužitelja'],
        2: ['cijeli kampus = jedan odgovor', 'dok ne istekne TTL'],
        3: ['zapis obrisan, ali stari odgovor', 'živi u predmemoriji do TTL-a'],
        4: ['jedna adresa, odluka za svaki zahtjev –', 'ovdje težinski 1 : 2 : 4'],
      }
  return (
    <svg
      className={`${css.drawing} ${narrow ? css.drawingNarrow : ''}`}
      viewBox={`0 0 ${g.W} ${g.H}`}
      role="img"
      aria-label={`Korak ${step + 1}: ${STEPS[step].title}. ${notes[step].join(' ')}`}
    >
      <DnsCard g={g} step={step} />
      {step === 2 ? (
        <Crowd x={narrow ? 228 : 18} y={narrow ? 26 : 186} scale={narrow ? 0.48 : 0.62} />
      ) : (
        [0, 1, 2].map((i) => <Student key={i} variant={i * 2 + 1} x={g.students.x + i * 46 * g.students.s - 40 * g.students.s} y={g.students.y - 146 * g.students.s} scale={g.students.s} />)
      )}
      {step === 0 && (
        <Arrow
          pts={narrow ? [[262, 104], [228, 86]] : [[110, 270], [110, 172]]}
          stroke="var(--pen)"
          dash="6 5"
          seed={6130}
          strokeWidth={1.8}
        />
      )}
      {step === 4 && (
        <g>
          <Redar x={lbX} y={lbY} scale={narrow ? 0.7 : 0.8} angle={-0.3} />
          <Arrow pts={[g.from, [lbX - 26, lbY + 4]]} stroke="var(--ink-3)" seed={6140} strokeWidth={1.6} draw="mount" />
        </g>
      )}
      {/* keyed by step: in every step the routes draw themselves first, then one tray travels each of them */}
      <g key={`routes-${step}`}>
      {[0, 1, 2].map((i) => {
        const r = rate[i]
        const sv = g.servers[i]
        const door = g.door(i)
        const start: [number, number] = step === 4 ? [lbX + 4, lbY + 4] : g.from
        const label = r > 0 ? `${r.toLocaleString('hr-HR')}/s` : ''
        const hot = r / cap[i] >= 0.9
        const mid: [number, number] = [(start[0] + door[0]) / 2, (start[1] + door[1]) / 2]
        return (
          <g key={i}>
            {(r > 0 || step === 0) && (
              <Arrow
                pts={[start, door]}
                stroke={down[i] ? 'var(--red)' : step === 0 ? 'var(--ink-3)' : 'var(--tray-ink)'}
                strokeWidth={step === 0 ? 1.4 : 1.4 + Math.min(4, r / 3)}
                dash={step === 0 ? '5 6' : undefined}
                seed={6150 + i}
                draw={step === 0 ? undefined : 'mount'}
                delay={step === 4 ? 0.5 : 0}
              />
            )}
            {r > 0 && step !== 0 && !reduce && (
              <Packet
                path={[start, [door[0] - (narrow ? 0 : 14), door[1] - (narrow ? 12 : 0)]]}
                duration={Math.hypot(door[0] - start[0], door[1] - start[1]) / SPEED}
                delay={(step === 4 ? 1.2 : 0.7) + i * 0.15}
                tone={down[i] ? 'bad' : undefined}
                r={narrow ? 3.6 : 5}
              />
            )}
            {down[i] && <Cross x={mid[0]} y={mid[1]} size={12} seed={6160 + i} strokeWidth={2.6} />}
            {label && step !== 0 && (
              <text x={mid[0] + (narrow ? 4 : 8)} y={mid[1] - 8} className="k-svg-hand" style={{ fontSize: narrow ? 19 : 21, fill: down[i] ? 'var(--red)' : 'var(--tray-ink)' }}>
                {label}
              </text>
            )}
            <MiniCard
              x={sv.x}
              y={sv.y}
              w={sv.w}
              h={sv.h}
              name={NAMES[i]}
              spec={narrow ? undefined : SPECS[i]}
              mood={down[i] ? 'dead' : step === 0 ? 'calm' : hot ? 'panic' : r / cap[i] > 0.6 ? 'busy' : 'calm'}
              down={down[i]}
              load={step === 0 ? undefined : r / cap[i]}
              sub={step === 0 || down[i] ? undefined : `CPU ${Math.round(Math.min(1, r / cap[i]) * 100)} %`}
              seed={6200 + i * 3}
              size={g.size}
            />
          </g>
        )
      })}
      </g>
      <StepBadge n={step + 1} x={g.note.x + 13} y={g.note.y - 6} color={c} r={narrow ? 12 : 13} />
      <HandNote x={g.note.x + 34} y={g.note.y} lines={notes[step]} size={g.note.size} color={c} />
    </svg>
  )
}

export function DnsStepper() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const narrow = w !== null && w < 720
  return (
    <Stepper steps={STEPS} title="DNS kao load balancer?" autoPlay={0}>
      {(step) => (
        <div ref={ref} className={css.stage}>
          <DnsDrawing step={step} narrow={narrow} />
        </div>
      )}
    </Stepper>
  )
}
