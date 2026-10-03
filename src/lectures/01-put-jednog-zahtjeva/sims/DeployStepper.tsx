/**
 * "Prvo postavljanje": Klopa moves from Lana's laptop to a rented VPS.
 * ① rent a VPS with a public IP · ② copy the code, run gunicorn --bind 0.0.0.0:8000, open the port
 * ③ add a DNS A record · ④ Petra opens http://klopa.example:8000 → 200 OK
 * ⑤ in practice: Caddy in front on :80 and :443 (TLS; 80 only redirects), the app on 127.0.0.1:8000, port 8000 closed again.
 */
import { Arrow, DiagramDefs, Lana, Petra, Rough, SpeechBubble, Stepper, diagramIds, pointAt, stepColor, useOnScreen, useWidth, type Pt } from '../../../kit'
import type { Box } from '../geometry'
import { pathLength, SPEED } from '../geometry'
import { IP } from '../model'
import { useElapsed } from '../useElapsed'
import { AppBox, FirewallWall, HostFrame, PhoneBook, ProxyBox, Road, TraySprite } from './parts'

interface DeployGeo {
  vb: [number, number]
  font: { hand: number; mono: number; name: number; title: number }
  lana: { x: number; y: number; s: number; label: Pt }
  petra: { x: number; y: number; s: number; label: Pt; phone: Pt; bubble: Box }
  book: Box
  bookLabel: { x: number; y: number; anchor: 'start' | 'middle' | 'end' }
  resolver: Pt
  vps: Box
  title: Pt
  mono: Pt
  wall: { side: 'left' | 'top'; at: number; from: number; to: number; d443: number; d80: number; d8000: number }
  /** mono port labels beside the doors, inside the frame */
  ports: { p443: Pt; p80: Pt; p8000: Pt }
  out443: Pt
  out8000: Pt
  proxy: Box
  proxyIn: Pt
  proxyOut: Pt
  app: Box
  appFace: Pt
  appIn: Pt
  appTop: Pt
  copy: Pt[]
  copyLabel: { x: number; y: number; anchor: 'start' | 'middle' | 'end' }
}

const WIDE: DeployGeo = {
  vb: [780, 400],
  font: { hand: 21, mono: 15, name: 17, title: 17 },
  lana: { x: 18, y: 130, s: 1, label: [58, 276] },
  petra: { x: 210, y: 236, s: 0.9, label: [246, 370], phone: [270, 310], bubble: { x: 258, y: 168, w: 120, h: 50 } },
  book: { x: 290, y: 16, w: 170, h: 84 },
  bookLabel: { x: 280, y: 52, anchor: 'end' },
  resolver: [375, 100],
  vps: { x: 480, y: 116, w: 288, h: 266 },
  title: [498, 148],
  mono: [498, 172],
  wall: { side: 'left', at: 480, from: 196, to: 374, d443: 238, d80: 278, d8000: 318 },
  ports: { p443: [494, 200], p80: [494, 290], p8000: [494, 342] },
  out443: [462, 238],
  out8000: [462, 318],
  proxy: { x: 506, y: 206, w: 116, h: 64 },
  proxyIn: [506, 238],
  proxyOut: [622, 238],
  app: { x: 594, y: 288, w: 146, h: 86 },
  appFace: [714, 314],
  appIn: [594, 318],
  appTop: [668, 288],
  copy: [
    [104, 200],
    [300, 182],
    [474, 214],
  ],
  copyLabel: { x: 290, y: 168, anchor: 'middle' },
}

const TALL: DeployGeo = {
  vb: [360, 650],
  font: { hand: 21, mono: 15, name: 16, title: 16 },
  lana: { x: 8, y: 128, s: 0.9, label: [44, 254] },
  petra: { x: 262, y: 128, s: 0.9, label: [298, 254], phone: [314, 202], bubble: { x: 196, y: 262, w: 120, h: 48 } },
  book: { x: 120, y: 16, w: 170, h: 84 },
  bookLabel: { x: 112, y: 52, anchor: 'end' },
  resolver: [205, 100],
  vps: { x: 8, y: 330, w: 344, h: 306 },
  title: [24, 590],
  mono: [24, 614],
  wall: { side: 'top', at: 330, from: 16, to: 344, d443: 100, d80: 180, d8000: 264 },
  ports: { p443: [122, 358], p80: [202, 358], p8000: [286, 358] },
  out443: [100, 312],
  out8000: [264, 312],
  proxy: { x: 40, y: 372, w: 120, h: 62 },
  proxyIn: [100, 372],
  proxyOut: [160, 403],
  app: { x: 184, y: 458, w: 160, h: 86 },
  appFace: [318, 484],
  appIn: [264, 458],
  appTop: [276, 458],
  copy: [
    [56, 236],
    [60, 290],
    [150, 324],
  ],
  copyLabel: { x: 80, y: 300, anchor: 'start' },
}

const STEPS = [
  {
    title: 'Lana iznajmljuje poslužitelj',
    body: (
      <>
        Lana iznajmi <strong>VPS</strong>, virtualni poslužitelj u podatkovnom centru u Frankfurtu: dvije procesorske jezgre, 2 GB RAM-a i <strong>javna IP adresa</strong> <code>{IP.vps}</code>, koja vrijedi na cijelom
        internetu.
      </>
    ),
  },
  {
    title: 'Lana kopira kod i pokreće ga',
    body: (
      <>
        Lana prebaci kod na poslužitelj (npr. naredbom <code>git clone</code>) i pokrene <code>gunicorn</code> s opcijom <code>--bind 0.0.0.0:8000</code>, a u vatrozidu otvori port 8000. To je postavljanje (engl. <em>deploy</em>) u
        najjednostavnijem obliku.
      </>
    ),
  },
  {
    title: 'Lana upisuje DNS zapis',
    body: (
      <>
        Lana kod pružatelja DNS-a doda zapis A: <code>klopa.example → {IP.vps}</code>, s TTL-om od 300 s. Sada ime vodi do poslužitelja – ali ne i do porta: on ostaje u adresi.
      </>
    ),
  },
  {
    title: 'Petra otvara Klopu',
    body: (
      <>
        Petra upiše <code>http://klopa.example:8000</code>: DNS, TCP, HTTP – i 200 OK. Radi! (Django usto mora znati svoje ime: bez <code>ALLOWED_HOSTS = ["klopa.example"]</code> u postavkama vratio bi 400 Bad Request.) Ali promet putuje nešifriran, a port 8000 u adresi nitko ne pamti.
      </>
    ),
  },
  {
    title: 'U praksi: proxy ispred aplikacije',
    body: (
      <>
        Ispred aplikacije stavimo proxy (npr. Caddy). On sluša na portovima 80 i 443 (80 samo preusmjerava na https), sam nabavi certifikat i šifrira promet, a zahtjeve prosljeđuje na <code>127.0.0.1:8000</code>.
        Aplikacija sada sluša samo iznutra. U vatrozidu otvorimo 80 i 443, a port 8000 opet zatvorimo. Petra upisuje samo <code>https://klopa.example</code>.
      </>
    ),
  },
]

function DeployScene({ step, narrow, active }: { step: number; narrow: boolean; active: boolean }) {
  const g = narrow ? TALL : WIDE
  const ids = diagramIds(`l01dep${narrow ? 'n' : 'w'}`)
  const f = g.font
  const proxy = step >= 4
  const color = stepColor(Math.min(step, 2))
  // Petra's request (steps 4 and 5): DNS there and back, to the app, the answer back
  const P = g.petra.phone
  const legs: Pt[][] =
    step === 3
      ? [[P, g.resolver], [g.resolver, P], [P, g.out8000, g.appIn], [g.appIn, g.out8000, P]]
      : step === 4
        ? [[P, g.resolver], [g.resolver, P], [P, g.out443, g.proxyIn], [g.proxyOut, [g.appTop[0], g.proxyOut[1]], g.appTop], [g.appTop, [g.appTop[0], g.proxyOut[1]], g.proxyOut], [g.proxyIn, g.out443, P]]
        : []
  // the roads are drawn first (faint pencil), then the tray travels along them
  const roads = step === 3 ? [legs[0], legs[2]] : step === 4 ? [legs[0], legs[2], legs[3]] : []
  const secs = legs.map((l) => pathLength(l) / SPEED)
  const total = secs.reduce((a, b) => a + b, 0)
  const t = useElapsed(total, 0.5, active)
  let k = 0
  let acc = 0
  while (k < legs.length - 1 && t > acc + secs[k]) acc += secs[k++]
  const done = legs.length > 0 && t >= total - 1e-6
  const tp = legs.length ? pointAt(legs[k], Math.min(1, (t - acc) / secs[k])) : null
  const back = k === 1 || k === legs.length - 1 || (step === 4 && k === 4)
  const trayLabel = k === 0 ? 'klopa.example?' : k === 1 ? IP.vps : back ? '200 OK' : 'GET /'
  return (
    <svg viewBox={`0 0 ${g.vb[0]} ${g.vb[1]}`} role="img" aria-label={`Korak ${step + 1}: ${STEPS[step].title}`} style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}>
      <DiagramDefs id={ids.id} />
      {/* Lana and her laptop */}
      <Lana x={g.lana.x} y={g.lana.y} scale={g.lana.s} holding="laptop" mood={step === 3 || step === 4 ? 'grin' : 'smile'} />
      <text x={g.lana.label[0]} y={g.lana.label[1]} textAnchor="middle" className="k-svg-hand" style={{ fontSize: f.hand }}>
        Lana
      </text>
      {/* DNS */}
      <PhoneBook box={g.book} mono={f.mono} lines={['klopa.example', step >= 2 ? `→ ${IP.vps}` : '→ ?']} />
      <text x={g.bookLabel.x} y={g.bookLabel.y} textAnchor={g.bookLabel.anchor} className="k-svg-hand" style={{ fontSize: f.hand }}>
        DNS
      </text>
      {step === 2 && <Rough shape={{ k: 'ellipse', cx: g.book.x + g.book.w / 2 + 6, cy: g.book.y + g.book.h * 0.62, w: g.book.w * 0.92, h: 34 }} seed={9701} stroke="var(--green)" strokeWidth={2.2} draw="mount" duration={0.6} delay={0.2} />}
      {/* the VPS */}
      <HostFrame box={g.vps} seed={9702} />
      <text x={g.title[0]} y={g.title[1]} className="k-svg-display" style={{ fontSize: f.title }}>
        VPS · Frankfurt
      </text>
      <text x={g.mono[0]} y={g.mono[1]} className="k-svg-mono" style={{ fontSize: f.mono, fill: 'var(--ink-2)' }}>
        {IP.vps} · 2 vCPU · 2 GB
      </text>
      <FirewallWall
        wall={g.wall.side}
        at={g.wall.at}
        from={g.wall.from}
        to={g.wall.to}
        seed={9710}
        doors={[
          { pos: g.wall.d443, open: proxy },
          { pos: g.wall.d80, open: proxy },
          { pos: g.wall.d8000, open: step >= 1 && !proxy },
        ]}
      />
      {(
        [
          [g.ports.p443, ':443', proxy],
          [g.ports.p80, ':80', proxy],
          [g.ports.p8000, ':8000', step >= 1 && !proxy],
        ] as const
      ).map(([p, label, open]) => (
        <text key={label} x={p[0]} y={p[1]} className="k-svg-mono" style={{ fontSize: f.mono, fill: open ? 'var(--ink)' : 'var(--ink-3)' }}>
          {label}
        </text>
      ))}
      {step >= 1 && <AppBox box={g.app} face={g.appFace} name={f.name} mono={f.mono} hand={f.hand} bind={proxy ? '127.0.0.1:8000' : '0.0.0.0:8000'} note={proxy ? 'samo iznutra' : undefined} />}
      {proxy && <ProxyBox box={g.proxy} name={f.name} mono={f.mono} />}
      {/* step 2: the code travels from the laptop to the server */}
      {step === 1 && (
        <g>
          <Arrow pts={g.copy} stroke={color} strokeWidth={2.2} seed={9720} draw head={10} />
          <text x={g.copyLabel.x} y={g.copyLabel.y} textAnchor={g.copyLabel.anchor} className="k-svg-hand k-dhalo" style={{ fontSize: f.hand, fill: color }}>
            git clone
          </text>
        </g>
      )}
      {/* Petra */}
      {step >= 3 && (
        <g>
          <Petra x={g.petra.x} y={g.petra.y} scale={g.petra.s} holding="phone" mood={done ? 'grin' : 'smile'} />
          <text x={g.petra.label[0]} y={g.petra.label[1]} textAnchor="middle" className="k-svg-hand" style={{ fontSize: f.hand }}>
            Petra
          </text>
          {done && (
            <SpeechBubble x={g.petra.bubble.x} y={g.petra.bubble.y} w={g.petra.bubble.w} h={g.petra.bubble.h} tx={g.petra.x + 40 * g.petra.s} ty={g.petra.y + 22 * g.petra.s} lines={['Radi!']} size={22} seed={9730} />
          )}
        </g>
      )}
      {roads.map((r, i) => (
        <Road key={i} pts={r} seed={9740 + i} />
      ))}
      {tp && (
        <TraySprite x={tp[0]} y={tp[1]} w={34} tone={done ? 'ok' : back ? 'ok' : 'req'} label={done ? undefined : trayLabel} size={f.hand} trayHref={ids.tray} labelDy={-22} />
      )}
    </svg>
  )
}

function DeployFrame({ step }: { step: number }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [stageRef, onScreen] = useOnScreen<HTMLDivElement>(0.6, true)
  // wide from 780 × 17 / 21 ≈ 632 px (Caveat 21 stays ≥ 17 px)
  const narrow = w !== null && w < 632
  return (
    <div ref={ref}>
      <div ref={stageRef} style={narrow ? { maxWidth: 460, width: '100%', margin: '0 auto' } : undefined}>
        <DeployScene step={step} narrow={narrow} active={onScreen} />
      </div>
    </div>
  )
}

export function DeployStepper() {
  return (
    <Stepper title="Prvo postavljanje" steps={STEPS} autoPlay={0} caption="Postavljanje u najjednostavnijem obliku: jedan poslužitelj, jedan proces, jedno ime.">
      {(step) => <DeployFrame key={step} step={step} />}
    </Stepper>
  )
}
