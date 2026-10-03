import { Check, Cross, Diagram, DLabel, FoodBox, Packet, Rough, Stepper, useWidth } from '../../../kit'
import { Fade } from './Drawn'

type P = [number, number]

const STEPS = [
  {
    title: 'Jedna vrata: web',
    body: (
      <>
        <code>ports: ["8080:8080"]</code> otvara vrata u zidu: port 8080 računala vodi na port 8080 kontejnera <code>web</code> (neprivilegirani nginx). Zahtjeve za <code>/api</code> nginx prosljeđuje dalje, unutra, po imenu: <code>api:8000</code>.
      </>
    ),
  },
  {
    title: 'API ne treba vrata',
    body: (
      <>
        <code>api</code> nema objavljen port, pa <code>localhost:8000</code> s računala ne vodi nikamo: <code>Connection refused</code>. To je dobro – do API-ja se dolazi samo kroz web. <code>8000:8000</code> dodajemo samo privremeno, za otklanjanje grešaka.
      </>
    ),
  },
  {
    title: 'Isti port unutra – ne smeta',
    body: (
      <>
        Dodajmo drugu kopiju API-ja. Obje slušaju na 8000, i to je u redu: svaki kontejner ima vlastiti mrežni imenski prostor – vlastitu IP adresu i vlastiti port 8000.
      </>
    ),
  },
  {
    title: 'Isti port na računalu – smeta',
    body: (
      <>
        Ako i druga kopija zatraži <code>8080:8000</code>, vrata 8080 već drži <code>web</code>. Računalo ima samo jedan port 8080, pa Docker javi <code>port is already allocated</code>.
      </>
    ),
  },
]

interface Geo {
  W: number
  H: number
  host: { x: number; y: number; w: number; h: number }
  browser: { x: number; y: number; w: number; h: number }
  vertical: boolean
  door8080: P
  door8000: P
  web: P
  api: P
  api2: P
  card: { w: number; h: number }
  mono: number
  hand: number
  note: P
}

const WIDE: Geo = {
  W: 720,
  H: 330,
  host: { x: 164, y: 14, w: 548, h: 306 },
  browser: { x: 8, y: 48, w: 140, h: 80 },
  vertical: false,
  door8080: [164, 96],
  door8000: [164, 172],
  web: [318, 96],
  api: [560, 96],
  api2: [560, 226],
  card: { w: 140, h: 60 },
  mono: 14,
  hand: 13.5,
  note: [190, 300],
}

const NARROW: Geo = {
  W: 340,
  H: 540,
  host: { x: 6, y: 96, w: 328, h: 436 },
  browser: { x: 8, y: 8, w: 324, h: 58 },
  vertical: true,
  door8080: [76, 96],
  door8000: [252, 96],
  web: [76, 196],
  api: [252, 196],
  api2: [252, 346],
  card: { w: 104, h: 58 },
  mono: 13,
  hand: 13,
  note: [20, 500],
}

function Box({ at, name, port, w, h, mono, seed, bad }: { at: P; name: string; port: string; w: number; h: number; mono: number; seed: number; bad?: boolean }) {
  return (
    <g>
      <rect x={at[0] - w / 2} y={at[1] - h / 2} width={w} height={h} className="k-paper-fill" />
      <FoodBox x={at[0] - w / 2} y={at[1] - h / 2} w={w} h={h} seed={seed} tint={name === 'web' ? 'var(--hl-blue-ink)' : 'var(--hl-blue-ink)'} stroke={bad ? 'var(--red)' : 'var(--ink)'} />
      <text x={at[0]} y={at[1] + 9} textAnchor="middle" className="k-svg-mono k-dhalo" style={{ fontSize: mono + 1, fontWeight: 700 }}>
        {name}
      </text>
      <text x={at[0]} y={at[1] + h / 2 + mono + 5} textAnchor="middle" className="k-svg-mono" style={{ fontSize: mono, fill: 'var(--ink-2)' }}>
        sluša na :{port}
      </text>
    </g>
  )
}

function DoorMark({ at, vertical, tone, dashed }: { at: P; vertical: boolean; tone: string; dashed?: boolean }) {
  const w = vertical ? 32 : 10
  const h = vertical ? 10 : 32
  return (
    <g>
      <rect x={at[0] - w / 2} y={at[1] - h / 2} width={w} height={h} className="k-paper-fill" />
      <Rough shape={{ k: 'rect', x: at[0] - w / 2, y: at[1] - h / 2, w, h }} seed={3500 + Math.round(at[1])} stroke={tone} strokeWidth={1.8} dash={dashed ? '4 4' : undefined} />
    </g>
  )
}

function Drawing({ step, G }: { step: number; G: Geo }) {
  const cw = G.card.w
  const ch = G.card.h
  const v = G.vertical
  const webIn: P = v ? [G.web[0], G.web[1] - ch / 2] : [G.web[0] - cw / 2, G.web[1]]
  const fromBrowser = (door: P): P => (v ? [door[0], G.browser.y + G.browser.h] : [G.browser.x + G.browser.w, door[1]])
  const toWeb: P[] = v ? [fromBrowser(G.door8080), G.door8080, webIn] : [fromBrowser(G.door8080), G.door8080, webIn]
  const webApi: P[] = [
    [G.web[0] + cw / 2, G.web[1]],
    [G.api[0] - cw / 2, G.api[1]],
  ]
  const to8000: P[] = [fromBrowser(G.door8000), v ? [G.door8000[0], G.door8000[1] - 6] : [G.door8000[0] - 6, G.door8000[1]]]
  const api2Claim: P[] = v ? [[G.api2[0] - cw / 2, G.api2[1]], [18, G.api2[1]], [18, G.door8080[1] + 16], [G.door8080[0] - 12, G.door8080[1] + 16]] : [[G.api2[0] - cw / 2, G.api2[1]], [G.door8080[0] + 30, G.api2[1]], [G.door8080[0] + 30, G.door8080[1] + 12], [G.door8080[0] + 6, G.door8080[1] + 12]]
  const hand = G.hand
  return (
    <Diagram width={G.W} height={G.H} label={`Korak ${step + 1}: ${STEPS[step].title}.`}>
      {/* the computer: browser outside, containers behind the wall */}
      <rect x={G.browser.x} y={G.browser.y} width={G.browser.w} height={G.browser.h} className="k-paper-fill" />
      <Rough shape={{ k: 'rect', ...G.browser }} seed={3511} strokeWidth={1.7} />
      <DLabel x={G.browser.x + 10} y={G.browser.y + 24} text="preglednik" size={hand} anchor="start" bold />
      <text x={G.browser.x + 10} y={G.browser.y + (v ? 46 : 50)} className="k-svg-mono" style={{ fontSize: G.mono - 1, fill: 'var(--ink-2)' }}>
        {step === 1 ? 'localhost:8000' : 'localhost:8080'}
      </text>
      <Rough shape={{ k: 'rect', ...G.host }} seed={3512} strokeWidth={2} multi />
      {/* on phones the wall label sits on the right, clear of the doors and of step 4's ✗ */}
      <DLabel x={v ? G.host.x + G.host.w - 14 : G.host.x + 14} y={G.host.y + 24} text="zid: kontejneri na računalu" size={hand} anchor={v ? 'end' : 'start'} bold />

      {/* 8080 → web */}
      <DoorMark at={G.door8080} vertical={v} tone="var(--pen)" />
      <DLabel x={v ? G.door8080[0] + 22 : G.door8080[0] - 8} y={v ? G.door8080[1] - 8 : G.door8080[1] + 34} text="8080" size={G.mono} anchor={v ? 'start' : 'end'} tone="blue" mono bold />
      <Rough shape={{ k: 'lin', pts: toWeb }} seed={3513} stroke={step === 1 ? 'var(--ink-3)' : 'var(--green)'} strokeWidth={1.5} dash="5 4" />
      <Rough shape={{ k: 'lin', pts: webApi }} seed={3514} stroke="var(--pen)" strokeWidth={1.5} />
      {step === 0 && (
        <>
          <Packet key="s0a" path={toWeb} duration={1} delay={0.3} />
          <Packet key="s0b" path={webApi} duration={0.9} delay={1.3} />
          <Check x={G.api[0] + cw / 2 + 4} y={G.api[1] - ch / 2} size={15} />
        </>
      )}

      {/* 8000: no door (step 2), a dashed debug door */}
      <Fade show={step === 1}>
        <DoorMark at={G.door8000} vertical={v} tone="var(--ink-3)" dashed />
        <DLabel x={v ? G.door8000[0] + 22 : G.door8000[0] - 8} y={v ? G.door8000[1] - 8 : G.door8000[1] + 34} text="8000?" size={G.mono} anchor={v ? 'start' : 'end'} tone="neutral" mono bold />
        <Rough shape={{ k: 'lin', pts: to8000 }} seed={3515} stroke="var(--red)" strokeWidth={1.5} dash="5 4" />
        {step === 1 && <Packet key="s1" path={to8000} duration={0.7} delay={0.3} tone="bad" />}
        <Cross x={to8000[1][0] + (v ? 0 : -10)} y={to8000[1][1] + (v ? -12 : 0)} size={13} />
        <DLabel x={G.note[0]} y={G.note[1]} text={v ? '8000:8000 samo za otklanjanje grešaka' : '8000:8000 objavljujemo samo dok tražimo grešku'} size={hand} anchor="start" tone="neutral" />
      </Fade>

      <Box at={G.web} name="web" port="8080" w={cw} h={ch} mono={G.mono} seed={3521} />
      <Box at={G.api} name="api" port="8000" w={cw} h={ch} mono={G.mono} seed={3522} />
      <DLabel x={(webApi[0][0] + webApi[1][0]) / 2} y={G.web[1] - 12} text="api:8000" size={G.mono - 1} tone="blue" mono bold />

      {/* a second copy of the API: same inner port is fine, same host port is not */}
      <Fade show={step >= 2}>
        <Box at={G.api2} name="api (kopija)" port="8000" w={cw} h={ch} mono={G.mono} seed={3523} bad={step === 3} />
        {step === 2 && <DLabel x={G.note[0]} y={G.note[1]} text={v ? 'dva puta :8000 – dvije IP adrese ✓' : 'oba slušaju na :8000 – svaki na svojoj IP adresi ✓'} size={hand} anchor="start" tone="ok" bold />}
      </Fade>
      <Fade show={step === 3}>
        <Rough shape={{ k: 'lin', pts: api2Claim }} seed={3524} stroke="var(--red)" strokeWidth={1.6} dash="5 4" />
        <Cross x={api2Claim[api2Claim.length - 1][0]} y={api2Claim[api2Claim.length - 1][1] + (v ? 6 : 0)} size={13} />
        <DLabel x={G.note[0]} y={G.note[1]} text={v ? '8080 je zauzet: port is already allocated' : 'i kopija traži 8080:8000 → port is already allocated'} size={hand} anchor="start" tone="bad" bold />
      </Fade>
    </Diagram>
  )
}

/** Scene 4a: published ports are doors in the wall; one host port, one door. */
export function PortsStepper() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const wide = w === null || w >= 620
  const G = wide ? WIDE : NARROW
  return (
    <div ref={ref}>
      <Stepper title="Vrata u zidu" steps={STEPS} autoPlay={0}>
        {(step) => (
          <div style={{ maxWidth: wide ? 760 : 460, margin: '0 auto' }}>
            <Drawing step={step} G={G} />
          </div>
        )}
      </Stepper>
    </div>
  )
}
