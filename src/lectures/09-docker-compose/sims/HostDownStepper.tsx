import { Check, Cross, Davor, Diagram, DLabel, FoodBox, Rough, SpeechBubble, Stepper, StudentQueue, SvgStamp, useWidth } from '../../../kit'
import { Fade } from './Drawn'

type P = [number, number]

const SVCS = ['web', 'api', 'worker', 'redis', 'db', 'rabbitmq']

const STEPS = [
  {
    title: '11:58: sve radi',
    body: (
      <>
        Davor je isti <code>compose.yaml</code> postavio na Klopin poslužitelj. Šest kontejnera, provjere ispravnosti, imenovani volumen, <code>restart: unless-stopped</code>. Red pred menzom raste, narudžbe stižu.
      </>
    ),
  },
  {
    title: '12:05: računalo je palo',
    body: (
      <>
        Pregorio je izvor napajanja. S računalom je stalo svih šest kontejnera – cijela Klopa, usred ručka. Studenti u redu dobivaju samo grešku.
      </>
    ),
  },
  {
    title: 'restart ne pomaže',
    body: (
      <>
        <code>restart: unless-stopped</code> čeka da se <em>ovo</em> računalo vrati. Drugo računalo ne postoji, a i kad bi postojalo, Compose ne bi znao ništa na njega premjestiti. Do popravka Klopa ne radi.
      </>
    ),
  },
  {
    title: 'Davorov popis',
    body: <>Davor zapisuje što mu zapravo treba. Svaka stavka je jedan pojam koji uskoro upoznajemo u Kubernetesu.</>,
  },
]

const LIST = ['više računala', 'automatski raspored', 'zamjena na drugom računalu', 'postupna nadogradnja', 'stalne adrese servisa']

interface Geo {
  W: number
  H: number
  host: { x: number; y: number; w: number; h: number }
  boxes: P[]
  box: { w: number; h: number }
  queue: P
  queueN: number
  davor: { x: number; y: number; s: number }
  bubble: { x: number; y: number; w: number; h: number }
  other: { x: number; y: number; w: number; h: number }
  list: { x: number; y: number; w: number }
  mono: number
  hand: number
}

const WIDE: Geo = {
  W: 720,
  H: 330,
  host: { x: 170, y: 40, w: 300, h: 250 },
  boxes: [
    [225, 120],
    [320, 120],
    [415, 120],
    [225, 220],
    [320, 220],
    [415, 220],
  ],
  box: { w: 82, h: 46 },
  queue: [150, 300],
  queueN: 4,
  davor: { x: 600, y: 182, s: 1 },
  bubble: { x: 486, y: 128, w: 124, h: 52 },
  other: { x: 486, y: 18, w: 228, h: 100 },
  list: { x: 486, y: 24, w: 228 },
  mono: 13.5,
  hand: 13.5,
}

const NARROW: Geo = {
  W: 340,
  H: 600,
  host: { x: 20, y: 110, w: 300, h: 230 },
  boxes: [
    [75, 180],
    [170, 180],
    [265, 180],
    [75, 270],
    [170, 270],
    [265, 270],
  ],
  box: { w: 82, h: 44 },
  queue: [310, 96],
  queueN: 5,
  davor: { x: 240, y: 470, s: 1 },
  bubble: { x: 30, y: 482, w: 150, h: 60 },
  other: { x: 20, y: 380, w: 300, h: 80 },
  list: { x: 20, y: 376, w: 300 },
  mono: 13,
  hand: 13,
}

function Drawing({ step, G, wide }: { step: number; G: Geo; wide: boolean }) {
  const down = step >= 1
  const davorHead: P = [G.davor.x + 40 * G.davor.s, G.davor.y + 28 * G.davor.s]
  return (
    <Diagram width={G.W} height={G.H} label={`Korak ${step + 1}: ${STEPS[step].title}.`}>
      {/* the students waiting for lunch */}
      <StudentQueue x={G.queue[0]} y={G.queue[1]} count={G.queueN} scale={wide ? 0.42 : 0.36} tap={step === 0} />
      <DLabel x={wide ? 8 : 20} y={wide ? 226 : 30} text="red pred menzom" size={G.hand} anchor="start" tone="neutral" />

      {/* the one computer */}
      <rect x={G.host.x} y={G.host.y} width={G.host.w} height={G.host.h} className="k-paper-fill" />
      <Rough shape={{ k: 'rect', ...G.host }} seed={3801} strokeWidth={2.2} stroke={down ? 'var(--red)' : 'var(--ink)'} multi />
      <DLabel x={G.host.x + 12} y={G.host.y + 24} text="klopa-1 · docker compose" size={G.hand} anchor="start" bold />
      {SVCS.map((s, i) => {
        const [cx, cy] = G.boxes[i]
        return (
          <g key={s}>
            <g opacity={down ? 0.45 : 1}>
              <FoodBox x={cx - G.box.w / 2} y={cy - G.box.h / 2} w={G.box.w} h={G.box.h} seed={3810 + i} tint={i < 3 ? 'var(--hl-blue-ink)' : 'var(--ink-4)'} />
            </g>
            <text x={cx} y={cy + 8} textAnchor="middle" className="k-svg-mono k-dhalo" style={{ fontSize: G.mono, fontWeight: 700 }}>
              {s}
            </text>
            {!down && <Check x={cx + G.box.w / 2 - 2} y={cy - G.box.h / 2 + 2} size={12} />}
          </g>
        )
      })}
      <Fade show={down}>
        <Rough shape={{ k: 'rect', x: G.host.x + 6, y: G.host.y + 34, w: G.host.w - 12, h: G.host.h - 40 }} seed={3821} stroke="transparent" fillColor="var(--ink-3)" hachureGap={14} fillWeight={0.7} />
        <SvgStamp x={G.host.x + G.host.w / 2} y={G.host.y + G.host.h / 2 + 6} text="UGAŠENO" tone="red" size={22} />
        <DLabel x={G.host.x + G.host.w / 2} y={G.host.y + G.host.h + 26} text="12:05 · 6 od 6 kontejnera ✗" size={G.hand} tone="bad" bold />
      </Fade>
      {/* the six ✗ are drawn after the stamp, so all of them stay visible */}
      {down && SVCS.map((s, i) => <Cross key={s} x={G.boxes[i][0] + G.box.w / 2 - 2} y={G.boxes[i][1] - G.box.h / 2 + 2} size={11} />)}

      {/* Davor (until he writes his list) */}
      <Fade show={step < 3}>
        <g transform={`translate(${G.davor.x} ${G.davor.y}) scale(${G.davor.s})`}>
          <Davor x={0} y={0} mood={down ? 'worry' : 'smile'} buzz={step === 1} holding="pager" />
        </g>
        {step >= 1 && <SpeechBubble x={G.bubble.x} y={G.bubble.y} w={G.bubble.w} h={G.bubble.h} tx={davorHead[0] - 14} ty={davorHead[1] - 6} lines={step === 1 ? ['Sve je palo!'] : ['Kamo s njima?']} size={18} seed={3831} />}
      </Fade>

      {/* step 3: there is no other computer */}
      <Fade show={step === 2}>
        <Rough shape={{ k: 'rect', ...G.other }} seed={3841} stroke="var(--ink-3)" strokeWidth={1.5} dash="7 6" />
        <DLabel x={G.other.x + 12} y={G.other.y + 26} text="drugo računalo?" size={G.hand} anchor="start" tone="neutral" bold />
        <DLabel x={G.other.x + 12} y={G.other.y + 52} text="nema ga, pa nitko" size={G.hand} anchor="start" tone="bad" />
        <DLabel x={G.other.x + 12} y={G.other.y + 76} text="ništa ne premješta" size={G.hand} anchor="start" tone="bad" />
        <DLabel x={G.host.x + 12} y={G.host.y + G.host.h - 14} text="restart čeka ovo računalo" size={G.hand} anchor="start" tone="bad" bold />
      </Fade>

      {/* step 4: Davor's list */}
      <Fade show={step === 3}>
        <rect x={G.list.x} y={G.list.y} width={G.list.w} height={36 + LIST.length * 34} rx={2} style={{ fill: 'var(--note-yellow)' }} />
        <Rough shape={{ k: 'rect', x: G.list.x, y: G.list.y, w: G.list.w, h: 36 + LIST.length * 34 }} seed={3851} stroke="var(--note-ink)" strokeWidth={1.2} roughness={0.9} />
        <text x={G.list.x + 12} y={G.list.y + 28} className="k-svg-print" style={{ fontSize: 19, fill: 'var(--note-ink)' }}>
          Davor: treba nam…
        </text>
        {LIST.map((t, i) => (
          <g key={t}>
            <Rough shape={{ k: 'rect', x: G.list.x + 14, y: G.list.y + 46 + i * 34, w: 14, h: 14 }} seed={3860 + i} stroke="var(--note-ink)" strokeWidth={1.3} />
            <text x={G.list.x + 38} y={G.list.y + 59 + i * 34} className="k-svg-hand" style={{ fontSize: G.hand * 1.45, fill: 'var(--note-ink)', fontWeight: 600 }}>
              {t}
            </text>
          </g>
        ))}
      </Fade>
    </Diagram>
  )
}

/** Scene 6: 12:05 — the one computer dies and all of Klopa with it. */
export function HostDownStepper() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const wide = w === null || w >= 620
  const G = wide ? WIDE : NARROW
  return (
    <div ref={ref}>
      <Stepper title="12:05: računalo je palo" steps={STEPS} autoPlay={0}>
        {(step) => (
          <div style={{ maxWidth: wide ? 760 : 460, margin: '0 auto' }}>
            <Drawing step={step} G={G} wide={wide} />
          </div>
        )}
      </Stepper>
    </div>
  )
}
