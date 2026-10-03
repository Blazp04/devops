/**
 * Hero diorama: the whole course as one port. Students of the Klopa canteen send requests (trucks) up the road,
 * the load-balancer gate deals them round-robin to three nodes of the cluster, and the yard crane restarts a
 * crashed container — "a platform that heals itself".
 */
import { memo, useRef } from 'react'
import { along, iso, lerp, makePath, span, vbOf, vbStr, type Path, type V3, type VB } from './iso-math'
import { Box, Container, FaceText, Gantry, LampDot, LampPost, Person, Quad, Road, Tower, Truck, Water, type Lamp } from './iso'
import { COMPACT_QUERY, useLoopTime, useMediaQuery, usePrefersReducedMotion } from './useLoop'
import { Pin } from './yard'
import is from './iso.module.css'
import h from './hero.module.css'

const SPEED = 2.4
const PERIOD = 18
const AGENTS = 6
const NODE_X = [2, 6, 10]

function route(k: number): { inb: Path; out: Path } {
  const cx = NODE_X[k]
  if (k === 1)
    return {
      inb: makePath([
        [6.28, 17.4],
        [6.28, 5.25],
      ]),
      out: makePath([
        [5.72, 5.25],
        [5.72, 17.4],
      ]),
    }
  if (k === 0)
    return {
      inb: makePath([
        [6.28, 17.4],
        [6.28, 5.72],
        [cx + 0.25, 5.72],
        [cx + 0.25, 5.25],
      ]),
      out: makePath([
        [cx - 0.25, 5.25],
        [cx - 0.25, 6.28],
        [5.72, 6.28],
        [5.72, 17.4],
      ]),
    }
  return {
    inb: makePath([
      [6.28, 17.4],
      [6.28, 6.28],
      [cx + 0.25, 6.28],
      [cx + 0.25, 5.25],
    ]),
    out: makePath([
      [cx - 0.25, 5.25],
      [cx - 0.25, 5.72],
      [5.72, 5.72],
      [5.72, 17.4],
    ]),
  }
}
const ROUTES = [0, 1, 2].map(route)
const DWELL = 1.1

interface TruckState {
  id: number
  x: number
  y: number
  dir: ReturnType<typeof along>['dir']
  back: boolean
  node: number
  op: number
  inGate: boolean
}

function trucksAt(t: number): TruckState[] {
  const out: TruckState[] = []
  for (let i = 0; i < AGENTS; i++) {
    const node = i % 3
    const r = ROUTES[node]
    const local = (((t - (i * PERIOD) / AGENTS) % PERIOD) + PERIOD) % PERIOD
    const tIn = r.inb.length / SPEED
    const tOut = r.out.length / SPEED
    let p: ReturnType<typeof along>
    let back = false
    let op = 1
    if (local < tIn) {
      p = along(r.inb, local * SPEED)
      op = span(local, 0, 0.4)
    } else if (local < tIn + DWELL) {
      p = along(r.inb, r.inb.length)
    } else if (local < tIn + DWELL + tOut) {
      back = true
      const d = (local - tIn - DWELL) * SPEED
      p = along(r.out, d)
      op = 1 - span(d, r.out.length - 0.9, r.out.length)
      if (d < 0.05) p = { ...p, dir: 'y+' }
    } else continue
    out.push({ id: i, x: p.x, y: p.y, dir: p.dir, back, node, op, inGate: !back && p.y > 8.6 && p.y < 11.2 })
  }
  return out.sort((a, b) => a.x + a.y - (b.x + b.y))
}

/* ------------------------------------------------------------ crane cycle */

const CRANE_PERIOD = 11
function craneAt(t: number) {
  const c = ((t % CRANE_PERIOD) + CRANE_PERIOD) % CRANE_PERIOD
  const park = 11.2
  const over = 10.3
  const top = 2.55
  const onBox = 1.02
  const lifted = 2.0
  let tx = park
  let hook = top
  let boxZ = 0.25
  let lamp: Lamp
  let blink = false
  if (c < 2) lamp = 'ok'
  else if (c < 3.6) {
    lamp = 'err'
    blink = true
  } else if (c < 4.6) {
    lamp = 'err'
    blink = true
    tx = lerp(park, over, span(c, 3.6, 4.6))
  } else if (c < 5.4) {
    lamp = 'err'
    tx = over
    hook = lerp(top, onBox, span(c, 4.6, 5.4))
  } else if (c < 6.4) {
    lamp = 'warn'
    tx = over
    hook = lerp(onBox, lifted, span(c, 5.4, 6.4))
    boxZ = hook - 0.77
  } else if (c < 7.3) {
    lamp = 'warn'
    blink = true
    tx = over
    hook = lifted
    boxZ = hook - 0.77
  } else if (c < 8.2) {
    lamp = 'warn'
    tx = over
    hook = lerp(lifted, onBox, span(c, 7.3, 8.2))
    boxZ = hook - 0.77
  } else if (c < 9) {
    lamp = 'ok'
    tx = over
    hook = lerp(onBox, top, span(c, 8.2, 9))
  } else {
    lamp = 'ok'
    tx = lerp(over, park, span(c, 9, 10))
  }
  return { tx, hook, boxZ, lamp, blink }
}

/* --------------------------------------------------------------- statics */

const STUDENTS: [number, number, string][] = [
  [4.35, 13.0, 'var(--teal)'],
  [4.85, 13.5, 'var(--orange)'],
  [4.3, 14.15, 'var(--blue)'],
  [5.0, 14.5, 'var(--rust)'],
  [4.45, 15.05, 'var(--mustard)'],
  [4.95, 15.55, 'var(--teal)'],
  [4.35, 16.0, 'var(--orange)'],
]

const StaticBack = memo(function StaticBack() {
  return (
    <g>
      {/* water + ship */}
      <Water x0={8.5} y0={7.2} x1={20} y1={10.5} />
      <Water x0={13.5} y0={-3} x1={20} y1={7.2} />
      {/* land slabs (diorama cut) */}
      <Box x={-0.5} y={-2.2} z={-0.45} w={14} d={9.4} h={0.45} c="var(--concrete)" />
      <Box x={-0.5} y={7.2} z={-0.45} w={9} d={10.8} h={0.45} c="var(--concrete)" />
      {/* quay edge paint */}
      <Quad plane="z" at={0.001} a0={13.15} a1={13.5} b0={-2.2} b1={7.2} c="var(--yellow)" />
      {/* roads */}
      <Road x0={6} y0={6.6} x1={6} y1={18} w={1.2} />
      <Road x0={0.6} y0={6} x1={11.4} y1={6} w={1.2} />
      {NODE_X.map((cx) => (
        <Road key={cx} x0={cx} y0={4.6} x1={cx} y1={5.4} w={1.1} center={false} />
      ))}
      {/* nodes */}
      {NODE_X.map((cx, k) => (
        <Box key={k} x={cx - 1.65} y={0.55} w={3.3} d={4.05} h={0.22} c="var(--dock)" />
      ))}
      {/* node 1 stack */}
      <Container x={0.55} y={0.8} z={0.22} len={1.4} wid={0.7} hei={0.75} c="var(--teal)" lamp="ok" />
      <Container x={2.05} y={0.8} z={0.22} len={1.4} wid={0.7} hei={0.75} c="var(--rust)" lamp="ok" />
      <Container x={0.55} y={0.8} z={0.97} len={1.4} wid={0.7} hei={0.75} c="var(--blue)" lamp="ok" />
      <Container x={0.55} y={1.75} z={0.22} len={1.4} wid={0.7} hei={0.75} c="var(--mustard)" label="v1" lamp="ok" />
      <Container x={2.05} y={1.75} z={0.22} len={1.4} wid={0.7} hei={0.75} c="var(--teal)" label="v1" lamp="ok" />
      {/* node 2 stack */}
      <Container x={4.55} y={0.8} z={0.22} len={1.4} wid={0.7} hei={0.75} c="var(--orange)" lamp="ok" />
      <Container x={6.05} y={0.8} z={0.22} len={1.4} wid={0.7} hei={0.75} c="var(--teal)" lamp="ok" />
      <Container x={6.05} y={0.8} z={0.97} len={1.4} wid={0.7} hei={0.75} c="var(--rust)" lamp="ok" />
      <Container x={4.55} y={1.75} z={0.22} len={1.4} wid={0.7} hei={0.75} c="var(--teal)" label="v1" lamp="ok" />
      <Container x={4.55} y={2.7} z={0.22} len={1.4} wid={0.7} hei={0.75} c="var(--blue)" lamp="ok" />
      {/* node 3 (under the crane): back row only so the lifted box never hides behind a neighbour */}
      <Container x={8.55} y={0.8} z={0.22} len={1.4} wid={0.7} hei={0.75} c="var(--mustard)" lamp="ok" />
      <Container x={10.05} y={0.8} z={0.22} len={1.4} wid={0.7} hei={0.75} c="var(--blue)" lamp="ok" />
      <Container x={8.55} y={2.25} z={0.22} len={1.4} wid={0.7} hei={0.75} c="var(--rust)" lamp="ok" />
      {/* control tower = control plane */}
      <Tower x={11.9} y={-1.7} h={5.4} sign="KONTROLA" />
      {/* the registry: a ship full of finished images, moored at the quay */}
      <Ship />
      {/* bollards along the quay edge */}
      {[-1.2, 1.2, 3.6, 6.0].map((y) => (
        <Box key={y} x={13.0} y={y} w={0.2} d={0.2} h={0.26} c="var(--navy-2)" />
      ))}
      {/* canteen Klopa */}
      <Box x={4.0} y={12.4} z={0} w={1.45} d={4.2} h={0.05} c="var(--concrete-dark)" />
      <Box x={0.4} y={12.6} w={3.6} d={3.6} h={1.9} c="var(--cab)" />
      <Quad plane="y" at={16.2} a0={0.65} a1={3.75} b0={0.85} b1={1.45} className={is.window} />
      <Quad plane="x" at={4.0} a0={12.85} a1={13.9} b0={0.85} b1={1.45} className={is.window} />
      <Quad plane="x" at={4.0} a0={14.35} a1={15.2} b0={0.02} b1={1.3} className={is.glass} />
      <Box x={0.3} y={12.5} z={1.9} w={3.8} d={3.8} h={0.12} c="var(--steel)" />
      <Box x={0.85} y={15.9} z={2.02} w={2.7} d={0.14} h={0.78} c="var(--orange)" />
      <FaceText face="left" x={1.05} y={16.04} z={2.2} size={0.62}>
        KLOPA
      </FaceText>
      {STUDENTS.map(([x, y, c], i) => (
        <Person key={i} x={x} y={y} c={c} />
      ))}
      {/* gate: back post + lamps on the far side of the road */}
      <Box x={4.98} y={9.6} w={0.24} d={0.24} h={2.4} c="var(--yellow)" />
      <LampPost x={4.9} y={12.2} dir="x+" />
    </g>
  )
})

function Ship() {
  const deck: [number, number, number, string][] = [
    [15.55, -0.7, 0.12, 'var(--rust)'],
    [16.3, -0.7, 0.12, 'var(--teal)'],
    [17.05, -0.7, 0.12, 'var(--mustard)'],
    [15.55, -0.7, 0.87, 'var(--blue)'],
    [16.3, -0.7, 0.87, 'var(--orange)'],
    [15.55, 0.85, 0.12, 'var(--teal)'],
    [16.3, 0.85, 0.12, 'var(--blue)'],
    [17.05, 0.85, 0.12, 'var(--rust)'],
    [16.3, 0.85, 0.87, 'var(--mustard)'],
    [17.05, 0.85, 0.87, 'var(--teal)'],
    [15.55, 2.4, 0.12, 'var(--orange)'],
    [16.3, 2.4, 0.12, 'var(--rust)'],
    [17.05, 2.4, 0.12, 'var(--blue)'],
    [15.55, 2.4, 0.87, 'var(--teal)'],
  ]
  return (
    <g>
      <Box x={15.3} y={-1.3} z={-0.75} w={2.6} d={7.6} h={0.32} c="var(--rust)" />
      <Box x={15.3} y={-1.3} z={-0.43} w={2.6} d={7.6} h={0.55} c="var(--navy-2)" />
      {deck.map(([x, y, z, c], i) => (
        <Container key={i} x={x} y={y} z={z} axis="y" len={1.4} wid={0.68} hei={0.75} c={c} />
      ))}
      <Box x={15.5} y={4.4} z={0.12} w={2.2} d={1.5} h={1.5} c="var(--cab)" />
      <Quad plane="y" at={5.9} a0={15.65} a1={17.55} b0={1.15} b1={1.45} className={is.window} />
      <Quad plane="x" at={17.7} a0={4.5} a1={5.8} b0={1.15} b1={1.45} className={is.window} />
      <Box x={16.3} y={4.7} z={1.62} w={0.55} d={0.55} h={0.7} c="var(--orange)" />
    </g>
  )
}

const StaticFront = memo(function StaticFront() {
  return (
    <g>
      <Box x={6.82} y={9.6} w={0.24} d={0.24} h={2.4} c="var(--yellow)" />
      <Box x={4.98} y={9.6} z={2.4} w={2.08} d={0.24} h={0.42} c="var(--yellow)" />
      <FaceText face="left" x={6.02} y={9.84} z={2.52} size={0.27} anchor="middle" fit={1.78} dark>
        LOAD BALANCER
      </FaceText>
      <Box x={7.25} y={9.9} w={0.95} d={0.95} h={1.15} c="var(--cab)" />
      <Quad plane="x" at={8.2} a0={10.05} a1={10.7} b0={0.55} b1={0.95} className={is.glass} />
      <Box x={7.18} y={9.83} z={1.15} w={1.09} d={1.09} h={0.08} c="var(--orange)" />
      <LampPost x={7.15} y={14.4} dir="x-" />
      <LampPost x={12.3} y={5.0} dir="x-" />
      <LampPost x={0.2} y={6.85} dir="y-" />
    </g>
  )
})

const VB_WIDE: VB = vbOf(
  [
    [-0.5, 7.2, -0.45],
    [-0.5, 18, -0.45],
    [8.5, 18, -0.45],
    [-0.5, -2.2, 0],
    [12, -1.8, 7.0],
    [20, -3, -0.3],
    [20, 10.5, -0.3],
    [8.5, 10.5, -0.3],
  ],
  10,
)
/** phone, panel 1: the canteen, the road and the gate (the trucks drive on out of the frame towards the cluster) */
const VB_START: VB = { x: -336, y: 26, w: 318, h: 200 }
/** phone, panel 2: the three nodes, the crane and the control tower */
const VB_YARD: VB = { x: -92, y: -58, w: 404, h: 226 }

interface Callout {
  n: number
  text: string
  sub?: string
  at: V3
  dx: number
  dy: number
}
const CALLOUTS: Callout[] = [
  { n: 1, text: 'Studenti šalju zahtjeve', at: [2.2, 16.0, 2.9], dx: -4, dy: -46 },
  { n: 2, text: 'Rampa dijeli promet', at: [5.6, 9.7, 2.85], dx: -66, dy: -68 },
  { n: 3, text: 'Klaster se sam popravlja', sub: 'kontrolni toranj · control plane', at: [11.9, -0.4, 4.85], dx: -112, dy: -40 },
]
const PLATES: { text: string; at: V3; cls: 'node' | 'reg' }[] = [
  { text: 'Čvor 1', at: [2.0, 4.45, 0.24], cls: 'node' },
  { text: 'Čvor 2', at: [6.0, 4.45, 0.24], cls: 'node' },
  { text: 'Čvor 3', at: [10.0, 4.45, 0.24], cls: 'node' },
  { text: 'Registar · slike kontejnera', at: [17.9, 4.2, -0.3], cls: 'reg' },
]

/** everything that moves, drawn over the static port; the same scene feeds every framing */
function Scene({ t, reduce }: { t: number; reduce: boolean }) {
  const trucks = trucksAt(t)
  const crane = craneAt(reduce ? 2.6 : t)
  const lampState = [0, 1, 2].map((k) => trucks.some((tr) => tr.node === k && tr.inGate))
  return (
    <>
      <StaticBack />
      <Gantry
        x0={8.25}
        x1={11.75}
        y0={0.35}
        y1={4.85}
        h={3.0}
        tx={crane.tx}
        hookZ={crane.hook}
        load={<Container x={9.6} y={2.25} z={crane.boxZ} len={1.4} wid={0.7} hei={0.75} c="var(--teal)" label="v1" lamp={crane.lamp} lampBlink={crane.blink} />}
      />
      {trucks.map((tr) => (
        <g key={tr.id} opacity={tr.op}>
          <Truck x={tr.x} y={tr.y} dir={tr.dir} cargo={tr.back ? 'var(--sig-green)' : 'var(--yellow)'} lights />
        </g>
      ))}
      <StaticFront />
      {[5.45, 6.03, 6.61].map((x, k) => (
        <LampDot key={k} x={x} y={9.84} z={2.24} state={lampState[k] ? 'warn' : 'ok'} r={0.12} />
      ))}
    </>
  )
}

const ARIA =
  'Izometrijska luka: studenti menze Klopa šalju zahtjeve kamionima prema rampi load balancera, koja ih naizmjence šalje na tri čvora klastera; dizalica ponovno pokreće kontejner koji se srušio, a kontrolni toranj nadzire klaster.'

/** a numbered marker pinned on a phone panel (the text lives in the list under the panels) */
function Marker({ vb, at, n }: { vb: VB; at: V3; n: number }) {
  return (
    <Pin vb={vb} at={at} className={h.marker}>
      <b>{n}</b>
    </Pin>
  )
}

export function HeroPort() {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = usePrefersReducedMotion()
  const compact = useMediaQuery(COMPACT_QUERY)
  const t = useLoopTime(ref, !reduce, 2.1, compact)

  if (compact)
    return (
      <div ref={ref} className={h.panels}>
        <figure className={h.panel}>
          <div className={h.stage} style={{ aspectRatio: `${VB_START.w} / ${VB_START.h}` }}>
            <svg className={h.svg} viewBox={vbStr(VB_START)} role="img" aria-label="Menza Klopa: studenti šalju zahtjeve kamionima prema rampi load balancera.">
              <Scene t={t} reduce={reduce} />
            </svg>
            <Marker vb={VB_START} at={[2.2, 14.4, 2.2]} n={1} />
            <Marker vb={VB_START} at={[6.0, 9.7, 3.0]} n={2} />
          </div>
        </figure>
        <figure className={h.panel}>
          <div className={h.stage} style={{ aspectRatio: `${VB_YARD.w} / ${VB_YARD.h}` }}>
            <svg className={h.svg} viewBox={vbStr(VB_YARD)} role="img" aria-label="Klaster: rampa šalje kamione na tri čvora, dizalica ponovno pokreće kontejner, kontrolni toranj nadzire klaster.">
              <Scene t={t} reduce={reduce} />
            </svg>
            <Marker vb={VB_YARD} at={[10.83, -0.42, 5.5]} n={3} />
          </div>
        </figure>
        <ol className={h.legend}>
          {CALLOUTS.map((c) => (
            <li key={c.n}>
              <b>{c.n}</b>
              <span>
                {c.text}
                {c.sub && <small>{c.sub}</small>}
              </span>
            </li>
          ))}
        </ol>
      </div>
    )

  return (
    <div className={h.stage} ref={ref} style={{ aspectRatio: `${VB_WIDE.w} / ${VB_WIDE.h}` }}>
      <svg className={h.svg} viewBox={vbStr(VB_WIDE)} role="img" aria-label={ARIA}>
        <Scene t={t} reduce={reduce} />
        {CALLOUTS.map((c) => {
          const [x, y] = iso(...c.at)
          return (
            <g key={c.n}>
              <line className={h.leader} x1={x} y1={y} x2={x + c.dx} y2={y + c.dy} />
              <circle className={h.dot} cx={x} cy={y} r={2.4} />
            </g>
          )
        })}
      </svg>
      {PLATES.map((p) => (
        <Pin key={p.text} vb={VB_WIDE} at={p.at} className={`${h.plate} ${h[p.cls]}`}>
          {p.text}
        </Pin>
      ))}
      {CALLOUTS.map((c) => {
        const [x, y] = iso(...c.at)
        return (
          <Pin key={c.n} vb={VB_WIDE} xy={[x + c.dx, y + c.dy]} className={h.callout}>
            <b>{c.n}</b>
            <span>
              {c.text}
              {c.sub && <small>{c.sub}</small>}
            </span>
          </Pin>
        )
      })}
    </div>
  )
}
