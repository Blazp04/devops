import { AnimatePresence } from 'motion/react'
import { Arrow, Cross, Diagram, Packet, PodShape, Rough, Stepper, stepColor, useWidth } from '../../../kit'

type Pt = [number, number]

/** slot 0 = the Pod whose IP was written down; slots 1–4 = the others (old, then new) */
const PODS: { ip: string; tone: 'blue' | 'violet'; status: 'running' | 'terminating' | 'creating' }[][] = [
  [
    { ip: '10.244.2.47', tone: 'blue', status: 'running' },
    { ip: '10.244.1.4', tone: 'blue', status: 'running' },
    { ip: '10.244.3.38', tone: 'blue', status: 'running' },
    { ip: '10.244.2.9', tone: 'blue', status: 'running' },
  ],
  [
    { ip: '10.244.2.47', tone: 'blue', status: 'terminating' },
    { ip: '10.244.1.12', tone: 'violet', status: 'running' },
    { ip: '10.244.3.11', tone: 'violet', status: 'running' },
    { ip: '10.244.2.21', tone: 'violet', status: 'running' },
    { ip: '10.244.1.13', tone: 'violet', status: 'creating' },
  ],
  [
    { ip: '', tone: 'blue', status: 'running' },
    { ip: '10.244.1.12', tone: 'violet', status: 'running' },
    { ip: '10.244.3.11', tone: 'violet', status: 'running' },
    { ip: '10.244.2.21', tone: 'violet', status: 'running' },
    { ip: '10.244.1.13', tone: 'violet', status: 'running' },
  ],
]

const STEPS = [
  {
    title: 'Adresa upisana u konfiguraciju',
    body: (
      <>
        klopa-web u konfiguraciji ima adresu jednog API Poda, <code>10.244.2.47:8000</code>. Radi – dok taj Pod živi.
      </>
    ),
  },
  {
    title: 'Uvođenje 1.4.0 mijenja Podove',
    body: 'Deployment stvara nove Podove i briše stare. Svaki novi Pod dobiva novu IP adresu, a stara nestaje zajedno sa starim Podom.',
  },
  {
    title: 'Upisana adresa vodi u prazno',
    body: (
      <>
        Četiri nova Poda rade i spremna su, ali klopa-web i dalje zove <code>10.244.2.47</code>. Tamo više nema nikoga: veza ne uspijeva (istek vremena ili <code>No route to host</code>). A kad tu adresu dobije neki novi Pod, zahtjevi bi tiho otišli njemu – možda i sasvim drugoj aplikaciji.
      </>
    ),
  },
]

interface Geo {
  W: number
  H: number
  client: Pt
  note: [number, number, number]
  slots: Pt[]
  mono: number
  hand: number
  tape: boolean
}

const WIDE: Geo = {
  W: 570,
  H: 280,
  client: [56, 160],
  note: [10, 18, 262],
  slots: [
    [222, 160],
    [348, 104],
    [474, 104],
    [348, 222],
    [474, 222],
  ],
  mono: 13,
  hand: 18,
  tape: true,
}
const NARROW: Geo = {
  W: 400,
  H: 330,
  client: [46, 170],
  note: [8, 18, 288],
  slots: [
    [146, 170],
    [236, 118],
    [350, 118],
    [236, 250],
    [350, 250],
  ],
  mono: 14.5,
  hand: 21.5,
  tape: false,
}

function Frame({ step, g }: { step: number; g: Geo }) {
  const pods = PODS[step]
  const target = g.slots[0]
  const port: Pt = [target[0] - 30, target[1] + 3]
  const from: Pt = [g.client[0] + 30, g.client[1]]
  const gone = step === 2
  const routeColor = step === 0 ? 'var(--green)' : 'var(--red)'
  return (
    <Diagram width={g.W} height={g.H} label={`Korak ${step + 1}: ${STEPS[step].title}. klopa-web zove upisanu adresu 10.244.2.47.`}>
      {/* the configuration note on the client */}
      <rect x={g.note[0]} y={g.note[1]} width={g.note[2]} height={g.mono + 16} rx={3} style={{ fill: 'var(--note-yellow)' }} />
      <text x={g.note[0] + 8} y={g.note[1] + g.mono + 6} className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--note-ink)' }}>
        API_URL=http://10.244.2.47:8000
      </text>
      <PodShape x={g.client[0]} y={g.client[1]} size={40} tone="teal" status="running" ariaLabel="Pod klopa-web" />
      <text x={g.client[0]} y={g.client[1] + 44} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono, fontWeight: 600 }}>
        klopa-web
      </text>
      <AnimatePresence>
        {pods.map((p, i) =>
          p.ip ? (
            <PodShape
              key={p.ip}
              x={g.slots[i][0]}
              y={g.slots[i][1]}
              size={40}
              status={p.status}
              tone={p.tone}
              label={g.tape ? (p.tone === 'blue' ? '1.3.2' : '1.4.0') : undefined}
              ariaLabel={`Pod ${p.ip} (${p.tone === 'blue' ? '1.3.2' : '1.4.0'})`}
            />
          ) : null,
        )}
      </AnimatePresence>
      {pods.map((p, i) =>
        p.ip ? (
          <text
            key={`ip-${p.ip}`}
            x={g.slots[i][0]}
            y={g.slots[i][1] + 44}
            textAnchor="middle"
            className="k-svg-mono"
            style={{ fontSize: g.mono, fill: i === 0 ? routeColor : 'var(--ink-2)', fontWeight: i === 0 ? 600 : 400 }}
          >
            {p.ip}
          </text>
        ) : null,
      )}
      {step === 1 && (
        <text x={(g.slots[1][0] + g.slots[2][0]) / 2} y={g.slots[1][1] - 34} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand, fill: stepColor(1) }}>
          nove IP adrese
        </text>
      )}
      {gone && (
        <g>
          <Rough shape={{ k: 'rect', x: target[0] - 27, y: target[1] - 14, w: 54, h: 40 }} seed={1401} stroke="var(--red)" strokeWidth={1.4} dash="4 4" />
          <text x={target[0]} y={target[1] + 13} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand + 4, fill: 'var(--red)' }}>
            ?
          </text>
          <text x={target[0]} y={target[1] + 44} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--red)', fontWeight: 600 }}>
            10.244.2.47
          </text>
        </g>
      )}
      {/* the hard-coded route */}
      <Arrow pts={[from, port]} stroke={routeColor} strokeWidth={1.8} seed={1402 + step} dash={step === 0 ? undefined : '7 5'} />
      {step === 0 && <Packet key="ok" path={[from, port]} duration={1.1} delay={0.3} />}
      {gone && (
        <g>
          <Packet key="bad" path={[from, [port[0] - 6, port[1]]]} duration={1.1} delay={0.3} tone="bad" />
          <Cross x={port[0] - 8} y={port[1] - 18} size={9} seed={1405} />
          <text x={(from[0] + port[0]) / 2} y={port[1] - 40} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--red)' }}>
            nema odgovora
          </text>
        </g>
      )}
    </Diagram>
  )
}

/** Hook stepper: a Pod IP written into klopa-web's configuration breaks on the next rollout. */
export function HardcodedIp() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const g = w !== null && w < 600 ? NARROW : WIDE
  return (
    <div ref={ref}>
      <Stepper title="Upisana IP adresa" steps={STEPS}>
        {(step) => (
          <div style={g === NARROW ? { maxWidth: 460, margin: '0 auto' } : undefined}>
            <Frame step={step} g={g} />
          </div>
        )}
      </Stepper>
    </div>
  )
}
