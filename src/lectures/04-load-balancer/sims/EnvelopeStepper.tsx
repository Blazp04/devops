import { useReducedMotion } from 'motion/react'
import { Arrow, MenzaGate, Packet, Redar, Rough, ServiceTag, StepBadge, Stepper, Tray, stepColor, useWidth } from '../../../kit'
import { HandNote, MiniCard } from './Sketches'
import css from '../styles.module.css'

/* „Omotnica: L4 ili L7”. A connection is a posted envelope (sender and recipient IP:port written on it); the HTTP
   request is the letter inside. An L4 balancer reads only the envelope and decides once per connection; an L7 one
   opens it (after terminating TLS), reads the path and decides for every request. */

const STEPS = [
  {
    title: 'Pismo u omotnici',
    body: (
      <>
        TCP veza je omotnica: na njoj su samo adrese i portovi pošiljatelja i primatelja. HTTP zahtjev je pismo unutra – putanja <code>/api/narudzbe</code>, zaglavlje <code>Host</code>, kolačići. Kod HTTPS-a je pismo još i šifrirano. Analogija šepa: veza nije jedno pismo nego niz paketa u oba smjera, a L4 load balancer odluku donosi na prvom paketu i zatim samo prosljeđuje ostale.
      </>
    ),
  },
  {
    title: 'L4: gleda samo omotnicu',
    body: (
      <>
        L4 load balancer poslužitelj bira jednom, kad se veza otvara, i sve što tom vezom dođe šalje istom poslužitelju. Ako aplikacija drži jednu trajnu vezu (engl. <em>keep-alive</em>, HTTP/2), svih pet zahtjeva završi na
        Malom.
      </>
    ),
  },
  {
    title: 'L7: otvara omotnicu',
    body: (
      <>
        L7 load balancer radi terminaciju TLS-a – dešifrira promet (ima certifikat i ključ), čita svaki zahtjev i odlučuje za svaki posebno: <code>/api</code> na API poslužitelje, <code>/fotografije</code> drugamo. Neuspio zahtjev može ponoviti na drugom
        poslužitelju.
      </>
    ),
  },
  {
    title: 'Gdje ćemo ih opet sresti',
    body: (
      <>
        Kubernetes Service radi na razini veza (L4): za svaku novu vezu bira nasumičnu spremnu kopiju aplikacije (Pod), bez težina (predavanje 14). L7 usmjeravanje po putanji radi Gateway (predavanje 15).
      </>
    ),
  },
]

interface G {
  W: number
  H: number
  env: { x: number; y: number; w: number; h: number }
  lb: { x: number; y: number; s: number }
  servers: { x: number; y: number; w: number; h: number }[]
  note: { x: number; y: number; size: number }
  mono: number
  size: number
}

const WIDE: G = {
  W: 760,
  H: 330,
  env: { x: 16, y: 112, w: 230, h: 138 },
  lb: { x: 384, y: 192, s: 0.85 },
  servers: [
    { x: 560, y: 10, w: 190, h: 92 },
    { x: 560, y: 116, w: 190, h: 92 },
    { x: 560, y: 222, w: 190, h: 92 },
  ],
  note: { x: 4, y: 294, size: 21 },
  mono: 15,
  size: 1,
}

const NARROW: G = {
  W: 340,
  H: 506,
  env: { x: 10, y: 86, w: 200, h: 120 },
  lb: { x: 272, y: 204, s: 0.7 },
  servers: [
    { x: 4, y: 340, w: 106, h: 100 },
    { x: 117, y: 340, w: 106, h: 100 },
    { x: 230, y: 340, w: 106, h: 100 },
  ],
  note: { x: 2, y: 472, size: 19 },
  mono: 13,
  size: 0.84,
}

const NAMES = ['Mali', 'Srednji', 'Veliki']
/** trays travel at one constant speed (drawing units per second) on every route */
const SPEED = 260
const PATHS = ['/api', '/api', '/fotografije', '/api', '/api']

/** A posted envelope: flap, stamp, addresses. Open = flap up and the letter sticking out. */
function PostEnvelope({ g, open, narrow }: { g: G; open: boolean; narrow: boolean }) {
  const { x, y, w, h } = g.env
  const m = g.mono
  return (
    <g>
      {open && <Rough shape={{ k: 'poly', pts: [[x, y], [x + w / 2, y - h * 0.32], [x + w, y]] }} seed={6711} strokeWidth={1.5} fillColor="var(--note-yellow)" fillStyle="solid" />}
      {open && (
        <g>
          <Rough shape={{ k: 'rect', x: x + 14, y: y - h * 0.62, w: w - 28, h: h * 0.82 }} seed={6701} strokeWidth={1.5} fillColor="var(--paper)" fillStyle="solid" />
          <text x={x + 26} y={y - h * 0.62 + 24} className="k-svg-mono" style={{ fontSize: m, fill: 'var(--pen)', fontWeight: 600 }}>
            GET /api/narudzbe
          </text>
          <text x={x + 26} y={y - h * 0.62 + 24 + m * 1.35} className="k-svg-mono" style={{ fontSize: m, fill: 'var(--ink-2)' }}>
            Host: klopa.example
          </text>
          {!narrow && (
            <text x={x + 26} y={y - h * 0.62 + 24 + m * 2.7} className="k-svg-mono" style={{ fontSize: m, fill: 'var(--ink-2)' }}>
              Cookie: sesija=…
            </text>
          )}
        </g>
      )}
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={6710} strokeWidth={1.8} fillColor="var(--note-yellow)" fillStyle="solid" />
      <Rough shape={{ k: 'rect', x: x + w - 44, y: y + 10, w: 32, h: 36 }} seed={6712} strokeWidth={1.3} stroke="var(--red)" dash="3 3" />
      <text x={x + 12} y={y + h * 0.66} className="k-svg-mono" style={{ fontSize: m, fill: 'var(--note-ink)' }}>
        za: 203.0.113.10:443
      </text>
      <text x={x + 12} y={y + h * 0.66 + m * 1.4} className="k-svg-mono" style={{ fontSize: m, fill: 'var(--note-ink)' }}>
        od: 198.51.100.7:52344
      </text>
    </g>
  )
}

function EnvelopeDrawing({ step, narrow }: { step: number; narrow: boolean }) {
  const g = narrow ? NARROW : WIDE
  const c = stepColor(step)
  const lbPt: [number, number] = [g.lb.x + 2, g.lb.y + 6]
  const door = (i: number): [number, number] => (narrow ? [g.servers[i].x + g.servers[i].w / 2, g.servers[i].y - 6] : [g.servers[i].x - 6, g.servers[i].y + g.servers[i].h / 2])
  // where each of the five requests goes: L4 = all to Mali (round robin opened the one connection there, as in the
  // keep-alive sim below), L7 = /api → Mali/Srednji, /fotografije → Veliki
  const target = step === 1 ? [0, 0, 0, 0, 0] : [0, 1, 2, 0, 1]
  const reduce = useReducedMotion()
  const notes: Record<number, string[]> = {
    0: narrow ? ['omotnica = veza (IP:port)', 'pismo = HTTP zahtjev'] : ['omotnica = TCP veza (IP:port)', 'pismo = HTTP zahtjev'],
    1: narrow ? ['jedna veza →', 'sve na jedan poslužitelj'] : ['jedna trajna veza →', 'svih 5 zahtjeva ide Malom'],
    2: narrow ? ['svaki zahtjev posebno:', 'po putanji i algoritmu'] : ['svaki zahtjev posebno:', '/api i /fotografije razdvojeni'],
    3: narrow ? ['Service = L4 (pred. 14)', 'Gateway = L7 (pred. 15)'] : ['Service = L4, po vezi (predavanje 14)', 'Gateway = L7, po zahtjevu (predavanje 15)'],
  }
  const envStart: [number, number] = narrow ? [g.env.x + g.env.w + 6, g.env.y + g.env.h * 0.7] : [g.env.x + g.env.w + 6, g.env.y + g.env.h * 0.8]
  return (
    <svg className={`${css.drawing} ${narrow ? css.drawingNarrow : ''}`} viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={`Korak ${step + 1}: ${STEPS[step].title}. ${notes[step].join(' ')}`}>
      <PostEnvelope g={g} open={step === 0 || step === 2} narrow={narrow} />
      {step !== 3 && <Arrow pts={[envStart, [lbPt[0] - 34, lbPt[1]]]} stroke="var(--ink-3)" seed={6720} strokeWidth={1.6} />}
      {step !== 3 && <Redar x={g.lb.x} y={g.lb.y} scale={g.lb.s} angle={step === 1 ? (narrow ? 2.55 : -0.6) : narrow ? 1.6 : -0.35} />}
      {step >= 1 && step <= 2 && (
        <g>
          <rect x={g.lb.x - 30 * g.lb.s} y={g.lb.y - 128 * g.lb.s} width={46 * g.lb.s} height={26 * g.lb.s} rx={3} style={{ fill: 'var(--paper)', stroke: c, strokeWidth: 1.6 }} />
          <text x={g.lb.x - 7 * g.lb.s} y={g.lb.y - 108 * g.lb.s} textAnchor="middle" className="k-svg-display" style={{ fontSize: 19 * g.lb.s + 4, fill: c }}>
            {step === 1 ? 'L4' : 'L7'}
          </text>
        </g>
      )}
      {step === 1 && (
        <g key="pipe">
          {/* the one keep-alive connection: a double pen line from the envelope through the redar to Mali (draws itself first) */}
          <Rough shape={{ k: 'lin', pts: [lbPt, door(0)] }} seed={6730} stroke="var(--pen)" strokeWidth={4} roughness={0.6} draw="mount" duration={0.6} />
          <Rough shape={{ k: 'lin', pts: [lbPt, door(0)] }} seed={6731} stroke="var(--paper)" strokeWidth={1.4} roughness={0.6} draw="mount" duration={0.6} />
        </g>
      )}
      {(step === 1 || step === 2) && (
        <g key={`routes-${step}`}>
          {target.map((t, i) => {
            const d = door(t)
            const f = 0.44 + i * 0.11
            const px = lbPt[0] + (d[0] - lbPt[0]) * f
            const py = lbPt[1] + (d[1] - lbPt[1]) * f
            // the route is drawn first, then the tray travels it (same speed on every route)
            const len = Math.hypot(px - lbPt[0], py - lbPt[1])
            return (
              <g key={i}>
                {step === 2 && <Arrow pts={[lbPt, d]} stroke={t === 2 ? 'var(--orange)' : 'var(--ink-3)'} seed={6740 + i} strokeWidth={1.3} dash={t === 2 ? '6 4' : undefined} draw="mount" delay={i * 0.12} />}
                {reduce ? (
                  <Tray x={px} y={py} w={narrow ? 20 : 28} />
                ) : (
                  <Packet path={[lbPt, [px, py]]} duration={len / SPEED} delay={0.7 + i * 0.3} r={(narrow ? 20 : 28) / 5.4} />
                )}
                {step === 2 && !narrow && (
                  <text x={px} y={py - 14} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 13, fill: t === 2 ? 'var(--orange)' : 'var(--ink-2)' }}>
                    {PATHS[i]}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      )}
      {step === 3 ? (
        <g>
          <ServiceTag x={narrow ? 12 : 300} y={narrow ? 250 : 46} w={narrow ? 150 : 200} h={50}>
            <text x={narrow ? 94 : 408} y={narrow ? 281 : 77} textAnchor="middle" className="k-svg-display" style={{ fontSize: narrow ? 16 : 18 }}>
              Service
            </text>
          </ServiceTag>
          <HandNote x={narrow ? 87 : 520} y={narrow ? 330 : 66} lines={narrow ? ['L4 · po vezi', 'predavanje 14'] : ['L4 · nasumično, po vezi', 'predavanje 14']} size={narrow ? 18 : 20} color="var(--pen)" anchor={narrow ? 'middle' : 'start'} />
          <MenzaGate x={narrow ? 196 : 318} y={narrow ? 232 : 136} w={narrow ? 126 : 150} h={narrow ? 74 : 118} label="GATEWAY" labelSize={narrow ? 14 : 16} />
          <HandNote x={narrow ? 259 : 520} y={narrow ? 330 : 196} lines={narrow ? ['L7 · po zahtjevu', 'predavanje 15'] : ['L7 · po putanji, po zahtjevu', 'predavanje 15']} size={narrow ? 18 : 20} color="var(--pen)" anchor={narrow ? 'middle' : 'start'} />
        </g>
      ) : (
        g.servers.map((sv, i) => (
          <MiniCard
            key={i}
            x={sv.x}
            y={sv.y}
            w={sv.w}
            h={sv.h}
            name={NAMES[i]}
            spec={narrow ? undefined : i === 2 && step === 2 ? 'fotografije' : 'API'}
            mood={step === 1 && i === 0 ? 'busy' : 'calm'}
            faded={step === 1 && i !== 0}
            seed={6800 + i * 3}
            size={g.size}
          />
        ))
      )}
      <StepBadge n={step + 1} x={g.note.x + 13} y={g.note.y - 6} color={c} r={narrow ? 12 : 13} />
      <HandNote x={g.note.x + 32} y={g.note.y} lines={notes[step]} size={g.note.size} color={c} />
    </svg>
  )
}

export function EnvelopeStepper() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const narrow = w !== null && w < 720
  return (
    <Stepper steps={STEPS} title="Omotnica: L4 ili L7" autoPlay={0}>
      {(step) => (
        <div ref={ref} className={css.stage}>
          <EnvelopeDrawing step={step} narrow={narrow} />
        </div>
      )}
    </Stepper>
  )
}
