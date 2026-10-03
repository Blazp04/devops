import { Check, Cross, Diagram, DLabel, FoodBox, Packet, Rough, Stepper, useWidth } from '../../../kit'
import { Fade } from './Drawn'

type P = [number, number]

const STEPS = [
  {
    title: 'API pita localhost:5432',
    body: (
      <>
        Iva je API-ju zadala <code>DATABASE_HOST=localhost</code>. Pladanj kreće prema <code>localhost:5432</code> – i vraća se u isti kontejner. Na portu 5432 u kontejneru <code>api</code> nitko ne sluša: <code>Connection refused</code>.
      </>
    ),
  },
  {
    title: 'Tri različita localhosta',
    body: (
      <>
        Svaki kontejner ima vlastiti mrežni imenski prostor: svoje sučelje <code>lo</code> (127.0.0.1) i svoje <code>eth0</code> s vlastitom adresom. <code>localhost</code> u kontejneru <code>api</code> je sam <code>api</code> – ne baza i ne vaše računalo.
      </>
    ),
  },
  {
    title: 'Vrata ne pomažu API-ju',
    body: (
      <>
        Objavimo bazi port: <code>-p 5432:5432</code>. Sada se na bazu može spojiti program na laptopu, kroz vrata u zidu. API-ju to ništa ne mijenja – njegov <code>localhost</code> je i dalje on sam.
      </>
    ),
  },
  {
    title: 'Pravo ime: db:5432',
    body: (
      <>
        API treba pitati za ime drugog kontejnera: <code>DATABASE_HOST=db</code>. Mreža projekta pretvori ime <code>db</code> u adresu 172.18.0.2 i pladanj stigne do Postgresa. Kako to radi, pogledat ćemo odmah.
      </>
    ),
  },
]

interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface Geo {
  W: number
  H: number
  host: Box
  api: Box
  db: Box
  laptop: Box
  door: P
  vertical: boolean
  /** db's eth0 sits on the side that faces the network (wide: left, so the network never crosses its lo) */
  dbMirror: boolean
  /** narrow: the network runs down the right margin, outside both containers */
  netX: number
  mono: number
  hand: number
}

const WIDE: Geo = {
  W: 720,
  H: 360,
  host: { x: 8, y: 14, w: 704, h: 338 },
  api: { x: 40, y: 130, w: 280, h: 172 },
  db: { x: 410, y: 130, w: 280, h: 172 },
  laptop: { x: 40, y: 50, w: 250, h: 44 },
  door: [503, 130],
  vertical: false,
  dbMirror: true,
  netX: 0,
  mono: 13.5,
  hand: 14,
}

const NARROW: Geo = {
  W: 340,
  H: 610,
  host: { x: 6, y: 14, w: 328, h: 588 },
  api: { x: 26, y: 130, w: 280, h: 172 },
  db: { x: 26, y: 400, w: 280, h: 172 },
  laptop: { x: 26, y: 56, w: 250, h: 44 },
  door: [26, 449],
  vertical: true,
  dbMirror: false,
  netX: 320,
  mono: 13,
  hand: 13,
}

/** inner pieces of a container box: the process on top, lo and eth0 side by side below it (so no route crosses lo on its way to eth0) */
function parts(b: Box, mirror = false) {
  const left = { x: b.x + 18, y: b.y + 96, w: 118, h: 50 }
  const right = { x: b.x + 144, y: b.y + 96, w: 118, h: 50 }
  return {
    proc: { x: b.x + 18, y: b.y + 30, w: 150, h: 38 },
    lo: mirror ? right : left,
    eth: mirror ? left : right,
    /** x where a route goes from the process down into eth0 (inside both) */
    via: mirror ? left.x + 40 : right.x + 16,
  }
}

function Inner({ b, name, proc, ip, mono, hotLo, mirror }: { b: Box; name: string; proc: string; ip: string; mono: number; hotLo: boolean; mirror?: boolean }) {
  const p = parts(b, mirror)
  return (
    <g>
      <FoodBox x={b.x} y={b.y} w={b.w} h={b.h} seed={name === 'api' ? 3301 : 3311} tint={name === 'api' ? 'var(--hl-blue-ink)' : 'var(--ink-4)'} />
      <text x={b.x + b.w - 14} y={b.y + 42} textAnchor="end" className="k-svg-mono k-dhalo" style={{ fontSize: mono + 1, fontWeight: 700 }}>
        {name}
      </text>
      {[p.proc, p.lo, p.eth].map((r, i) => (
        <g key={i}>
          <rect x={r.x} y={r.y} width={r.w} height={r.h} className="k-paper-fill" />
          {i === 1 && hotLo && <rect x={r.x + 2} y={r.y + 3} width={r.w - 4} height={r.h - 6} style={{ fill: 'var(--hl-yellow)' }} />}
          <Rough shape={{ k: 'rect', ...r }} seed={3320 + i + name.length} strokeWidth={1.3} stroke="var(--ink-2)" roughness={0.8} />
        </g>
      ))}
      <text x={p.proc.x + 10} y={p.proc.y + 25} className="k-svg-mono" style={{ fontSize: mono, fontWeight: 600 }}>
        {proc}
      </text>
      <text x={p.lo.x + 8} y={p.lo.y + 21} className="k-svg-mono" style={{ fontSize: mono, fontWeight: 600 }}>
        lo 127.0.0.1
      </text>
      <text x={p.lo.x + 8} y={p.lo.y + 41} className="k-svg-mono" style={{ fontSize: mono - 0.5, fill: 'var(--ink-2)' }}>
        (localhost)
      </text>
      <text x={p.eth.x + 8} y={p.eth.y + 21} className="k-svg-mono" style={{ fontSize: mono, fontWeight: 600 }}>
        eth0
      </text>
      <text x={p.eth.x + 8} y={p.eth.y + 41} className="k-svg-mono" style={{ fontSize: mono - 0.5, fill: 'var(--ink-2)' }}>
        {ip}
      </text>
    </g>
  )
}

function Drawing({ step, G }: { step: number; G: Geo }) {
  const a = parts(G.api)
  const d = parts(G.db, G.dbMirror)
  const aMid = a.eth.y + a.eth.h / 2
  const dMid = d.eth.y + d.eth.h / 2
  // the tray that loops back into api through its own lo (steps 1 and 3)
  const loopPath: P[] = [
    [a.lo.x + 92, a.proc.y + a.proc.h],
    [a.lo.x + 92, a.lo.y + a.lo.h / 2],
    [a.lo.x + 32, a.lo.y + a.lo.h / 2],
    [a.lo.x + 32, a.proc.y + a.proc.h],
  ]
  // the project network between the two eth0: straight across (wide) or down the right margin, outside both boxes (narrow)
  const net: P[] = G.vertical
    ? [[a.eth.x + a.eth.w, aMid], [G.netX, aMid], [G.netX, dMid], [d.eth.x + d.eth.w, dMid]]
    : [[a.eth.x + a.eth.w, aMid], [d.eth.x, dMid]]
  // api → its eth0 → network → db's eth0 → postgres (step 4)
  const okPath: P[] = [[a.via, a.proc.y + a.proc.h], [a.via, aMid], ...net, [d.via, dMid], [d.via, d.proc.y + d.proc.h]]
  // laptop psql → door → db (step 3)
  const doorPath: P[] = G.vertical
    ? [[G.laptop.x + 20, G.laptop.y + G.laptop.h], [14, G.laptop.y + G.laptop.h + 10], [14, G.door[1]], G.door, [d.proc.x, G.door[1]]]
    : [[G.laptop.x + G.laptop.w, G.laptop.y + G.laptop.h / 2], [G.door[0], G.laptop.y + G.laptop.h / 2], G.door, [G.door[0], d.proc.y]]
  return (
    <Diagram width={G.W} height={G.H} label={`Korak ${step + 1}: ${STEPS[step].title}.`}>
      <Rough shape={{ k: 'rect', ...G.host }} seed={3341} strokeWidth={2} multi />
      <DLabel x={G.host.x + 14} y={G.host.y + 24} text="Ivin laptop" size={G.hand} anchor="start" bold />

      {/* the laptop's own localhost */}
      <rect x={G.laptop.x} y={G.laptop.y} width={G.laptop.w} height={G.laptop.h} className="k-paper-fill" />
      {step === 1 && <rect x={G.laptop.x + 2} y={G.laptop.y + 3} width={G.laptop.w - 4} height={G.laptop.h - 6} style={{ fill: 'var(--hl-yellow)' }} />}
      <Rough shape={{ k: 'rect', ...G.laptop }} seed={3342} strokeWidth={1.4} stroke="var(--ink-2)" dash="5 4" />
      <text x={G.laptop.x + 10} y={G.laptop.y + 18} className="k-svg-mono" style={{ fontSize: G.mono - 1, fill: 'var(--ink-2)' }}>
        laptop: preglednik, psql…
      </text>
      <text x={G.laptop.x + 10} y={G.laptop.y + 36} className="k-svg-mono" style={{ fontSize: G.mono - 1 }}>
        lo 127.0.0.1 (localhost)
      </text>

      <Inner b={G.api} name="api" proc="gunicorn :8000" ip="172.18.0.4" mono={G.mono} hotLo={step <= 1} />
      <Inner b={G.db} name="db" proc="postgres :5432" ip="172.18.0.2" mono={G.mono} hotLo={step === 1} mirror={G.dbMirror} />

      {/* the project network between the two eth0 */}
      <Rough shape={{ k: 'lin', pts: net }} seed={3351} stroke="var(--pen)" strokeWidth={step === 3 ? 2.4 : 1.6} dash={step === 3 ? undefined : '6 5'} />
      <DLabel x={G.vertical ? G.netX - 8 : (net[0][0] + net[1][0]) / 2} y={G.vertical ? (G.api.y + G.api.h + G.db.y) / 2 - 6 : aMid - 12} text="mreža" size={G.hand} anchor={G.vertical ? 'end' : 'middle'} tone="blue" />

      {/* step 1 and 3: the request loops back into api */}
      {(step === 0 || step === 2) && (
        <>
          <Rough shape={{ k: 'lin', pts: loopPath }} seed={3361} stroke="var(--red)" strokeWidth={1.5} dash="5 4" />
          <Packet key={`loop-${step}`} path={loopPath} duration={1.6} delay={0.3} tone="bad" />
          <Cross x={a.lo.x + 32} y={a.proc.y + a.proc.h + 14} size={13} />
          <DLabel x={G.api.x + 8} y={G.api.y - 12} text="localhost:5432 → Connection refused" size={G.hand} anchor="start" tone="bad" bold />
        </>
      )}
      {step === 1 && <DLabel x={G.vertical ? G.W / 2 : G.W / 2} y={G.vertical ? G.db.y - 16 : G.api.y - 14} text="tri lo – tri različita localhosta" size={G.hand} tone="bad" bold />}

      {/* step 3: a door for db in the laptop wall */}
      <Fade show={step === 2}>
        <rect x={G.door[0] - (G.vertical ? 5 : 16)} y={G.door[1] - (G.vertical ? 16 : 5)} width={G.vertical ? 10 : 32} height={G.vertical ? 32 : 10} className="k-paper-fill" />
        <Rough shape={{ k: 'rect', x: G.door[0] - (G.vertical ? 5 : 16), y: G.door[1] - (G.vertical ? 16 : 5), w: G.vertical ? 10 : 32, h: G.vertical ? 32 : 10 }} seed={3371} stroke="var(--pen)" strokeWidth={1.8} />
        <DLabel x={G.vertical ? G.door[0] + 22 : G.door[0] + 24} y={G.vertical ? G.door[1] + 38 : G.door[1] - 10} text="-p 5432:5432" size={G.mono} anchor="start" tone="blue" mono bold />
        <Rough shape={{ k: 'lin', pts: doorPath }} seed={3372} stroke="var(--green)" strokeWidth={1.5} dash="5 4" />
        {step === 2 && <Packet key="door" path={doorPath} duration={1.8} delay={1.9} tone="ok" />}
        <Check x={d.proc.x + d.proc.w + 16} y={d.proc.y + 14} size={14} />
      </Fade>

      {/* step 4: by name */}
      <Fade show={step === 3}>
        <Rough shape={{ k: 'lin', pts: okPath }} seed={3381} stroke="var(--green)" strokeWidth={1.6} />
        {step === 3 && <Packet key="ok" path={okPath} duration={2} delay={0.3} tone="ok" />}
        <Check x={d.proc.x + d.proc.w + 16} y={d.proc.y + 14} size={16} />
        <DLabel x={G.api.x + 8} y={G.api.y - 12} text="db:5432 → 172.18.0.2 ✓" size={G.hand} anchor="start" tone="ok" bold />
      </Fade>
    </Diagram>
  )
}

/** Scene 2: inside a container, localhost is the container itself. */
export function LocalhostStepper() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const wide = w === null || w >= 620
  const G = wide ? WIDE : NARROW
  return (
    <div ref={ref}>
      <Stepper title="Tko je localhost?" steps={STEPS} autoPlay={0}>
        {(step) => (
          <div style={{ maxWidth: wide ? 760 : 460, margin: '0 auto' }}>
            <Drawing step={step} G={G} />
          </div>
        )}
      </Stepper>
    </div>
  )
}
