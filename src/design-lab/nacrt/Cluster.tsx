import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Cylinder, Defs, Pod, Rotary, Valve, type PodState } from './Draw'
import { hr, pointAt, route, safeId, type Pt, type Route } from './geom'
import { useOnScreen, useWidth } from './useWidth'
import s from './nacrt.module.css'
import c from './cluster.module.css'

interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface Comp {
  b: Box
  name: string
  db?: boolean
}

interface CGeo {
  tall: boolean
  W: number
  H: number
  r: number
  fs: number
  cp: Box
  cpNote: boolean
  comps: { sched: Comp; api: Comp; cm: Comp; etcd: Comp }
  /** scheduler → api, controller-manager → api (arrows) and api — etcd */
  links: { arrows: string[]; etcd: string }
  pend: Box
  pendPods: Pt[]
  pendNote: Pt
  nodes: Box[]
  kubelets: Box[]
  /** signal line (control, not user traffic) from kube-apiserver to every kubelet, as segments */
  ctlSegs: [number, number, number, number][]
  kubeletLabel: { at: Pt; anchor: 'start' | 'end' }
  /** the scheduler's decision travelling to kubelet on čvor-1 */
  bind: Route
  bars: { x: number; cell: number; ramCell: number; label: number }
  slots: Pt[][]
  other: Box[]
  /** y of the valve on each node's risers, and the manifold */
  valveY: number[]
  manifold: string
  svc: Pt
  svcR: number
  svcAngle: number
  svcText: Pt
  ingress: string
  ingressLabel: Pt
  routes: (px: number, py: number, node: number) => Route
}

function wide(): CGeo {
  const nodes = [
    { x: 40, y: 196, w: 450, h: 268 },
    { x: 510, y: 196, w: 450, h: 268 },
  ]
  const r = 30
  const slots = nodes.map((n, i) => (i === 0 ? [58, 150, 264] : [64, 160]).map((dx): Pt => [n.x + dx, n.y + 194]))
  const svc: Pt = [250, 588]
  const mY = 508
  return {
    tall: false,
    W: 1000,
    H: 632,
    r,
    fs: 13,
    cp: { x: 40, y: 30, w: 690, h: 124 },
    cpNote: true,
    comps: {
      sched: { b: { x: 56, y: 84, w: 140, h: 44 }, name: 'kube-scheduler' },
      api: { b: { x: 246, y: 84, w: 150, h: 44 }, name: 'kube-apiserver' },
      cm: { b: { x: 446, y: 84, w: 200, h: 44 }, name: 'kube-controller-manager' },
      etcd: { b: { x: 672, y: 78, w: 46, h: 56 }, name: 'etcd', db: true },
    },
    links: { arrows: ['M196,106 H244', 'M446,106 H398'], etcd: 'M330,128 V142 H695 V134' },
    pend: { x: 760, y: 30, w: 220, h: 124 },
    pendPods: [
      [802, 84],
      [862, 84],
    ],
    pendNote: [772, 128],
    nodes,
    kubelets: nodes.map((n) => ({ x: n.x + 16, y: n.y + 42, w: 96, h: 30 })),
    ctlSegs: [
      [270, 128, 270, 176],
      [130, 176, 600, 176],
      [130, 176, 130, 238],
      [600, 176, 600, 238],
    ],
    kubeletLabel: { at: [612, 181], anchor: 'start' },
    bind: route([
      [196, 112],
      [244, 112],
      [270, 128],
      [270, 176],
      [130, 176],
      [130, 238],
    ]),
    bars: { x: 164, cell: 40, ramCell: 20, label: 128 },
    slots,
    other: [
      { x: nodes[0].x + 342, y: nodes[0].y + 150, w: 92, h: 88 },
      { x: nodes[1].x + 236, y: nodes[1].y + 150, w: 198, h: 88 },
    ],
    valveY: [488, 488],
    manifold: `M${svc[0]},${svc[1] - 24} V${mY} M${slots[0][0][0]},${mY} H${slots[1][1][0]}`,
    svc,
    svcR: 24,
    svcAngle: -90,
    svcText: [290, 584],
    ingress: `M44,${svc[1]} H${svc[0] - 26}`,
    ingressLabel: [48, svc[1] - 8],
    routes: (px, py) =>
      route([
        [svc[0], svc[1] - 24],
        [svc[0], mY],
        [px, mY],
        [px, py + r],
      ]),
  }
}

function tall(width: number): CGeo {
  const W = Math.max(300, Math.round(width / 10) * 10)
  const nx = 28
  const nw = W - 28 - nx
  const lane = W - 15
  const r = 23
  const cell = Math.min(30, Math.floor((nw - 48 - 94) / 4))
  const nodes = [
    { x: nx, y: 330, w: nw, h: 240 },
    { x: nx, y: 626, w: nw, h: 240 },
  ]
  const slots = nodes.map((n, i) => (i === 0 ? [0.14, 0.38, 0.62] : [0.14, 0.38]).map((f): Pt => [n.x + f * n.w, n.y + 190]))
  const half = W / 2
  const svcY = nodes[1].y + nodes[1].h + 70
  const mYs = nodes.map((n) => n.y + n.h + 26)
  const trunkX = 14
  return {
    tall: true,
    W,
    H: svcY + 62,
    r,
    fs: 12,
    cp: { x: 8, y: 30, w: W - 16, h: 156 },
    cpNote: false,
    comps: {
      sched: { b: { x: 18, y: 66, w: half - 34, h: 40 }, name: 'kube-scheduler' },
      api: { b: { x: half + 6, y: 66, w: half - 24, h: 40 }, name: 'kube-apiserver' },
      etcd: { b: { x: 22, y: 120, w: 52, h: 54 }, name: 'etcd', db: true },
      cm: { b: { x: 88, y: 126, w: W - 106, h: 40 }, name: 'kube-controller-manager' },
    },
    links: {
      arrows: [`M${half - 16},86 H${half + 4}`, `M${(half + 6 + W - 18) / 2},126 V108`],
      etcd: `M48,120 V114 H${half + 20} V106`,
    },
    pend: { x: 8, y: 204, w: W - 46, h: 108 },
    pendPods: [
      [44, 258],
      [100, 258],
    ],
    pendNote: [134, 252],
    nodes,
    kubelets: nodes.map((n) => ({ x: n.x + n.w - 84, y: n.y + 8, w: 76, h: 26 })),
    ctlSegs: [
      [W - 18, 86, lane, 86],
      [lane, 86, lane, nodes[1].y + 21],
      ...nodes.map((n): [number, number, number, number] => [lane, n.y + 21, n.x + n.w - 8, n.y + 21]),
    ],
    kubeletLabel: { at: [W - 20, 324], anchor: 'end' },
    bind: route([
      [half - 16, 92],
      [half + 4, 92],
      [W - 18, 92],
      [lane, 92],
      [lane, nodes[0].y + 21],
      [nodes[0].x + nodes[0].w - 8, nodes[0].y + 21],
    ]),
    bars: { x: 48, cell, ramCell: cell / 2, label: 10 },
    slots,
    other: [
      { x: nodes[0].x + nodes[0].w * 0.76, y: nodes[0].y + 150, w: nodes[0].w * 0.22, h: 72 },
      { x: nodes[1].x + nodes[1].w * 0.54, y: nodes[1].y + 150, w: nodes[1].w * 0.44, h: 72 },
    ],
    valveY: nodes.map((n) => n.y + n.h + 13),
    manifold: `M${52 - 22},${svcY} H${trunkX} V${mYs[0]} ${nodes.map((_, i) => `M${trunkX},${mYs[i]} H${slots[i][slots[i].length - 1][0]}`).join(' ')}`,
    svc: [52, svcY],
    svcR: 22,
    svcAngle: 180,
    svcText: [82, svcY + 30],
    ingress: `M${W - 8},${svcY} H${52 + 24}`,
    ingressLabel: [W - 8, svcY - 8],
    routes: (px, py, node) =>
      route([
        [52 - 22, svcY],
        [trunkX, svcY],
        [trunkX, mYs[node]],
        [px, mYs[node]],
        [px, py + r],
      ]),
  }
}

type PodId = 'a' | 'b' | 'n' | 'c' | 'd'
const PODS: { id: PodId; node: number; slot: number; v: 1 | 2; name: string }[] = [
  { id: 'a', node: 0, slot: 0, v: 1, name: '7d9c-2xkqp' },
  { id: 'b', node: 0, slot: 1, v: 1, name: '7d9c-9wz4m' },
  { id: 'n', node: 0, slot: 2, v: 2, name: '5f8b-hk2vn' },
  { id: 'c', node: 1, slot: 0, v: 1, name: '7d9c-tq8rd' },
  { id: 'd', node: 1, slot: 1, v: 1, name: '7d9c-lp6rt' },
]

const T_PEND = 500
const T_SCHED = 1800
const BIND_MS = 900
const T_RUN = 3600
const T_READY = 4800
const CYCLE = 6000

/** Pod state as a pure function of time since the view was first seen. */
function podState(id: PodId, T: number): PodState | null {
  if (id === 'n') {
    if (T < T_SCHED) return null
    if (T < T_RUN) return 'creating'
    if (T < T_READY) return 'running'
    return 'ready'
  }
  if (id === 'd') return T % CYCLE < 4200 ? 'crash' : 'running'
  return 'ready'
}

interface CDot {
  id: number
  pod: PodId
  t0: number
}

const SPEED = 0.28

export function Cluster() {
  const reduced = useReducedMotion() ?? false
  const [wrapRef, width] = useWidth<HTMLDivElement>((vw) => (vw < 900 ? vw - 40 : 1240))
  const [screenRef, onScreen] = useOnScreen<HTMLDivElement>()
  const tallW = width < 860 ? Math.max(300, Math.round(width / 10) * 10) : 0
  const g = useMemo(() => (tallW ? tall(tallW) : wide()), [tallW])
  const uid = safeId(useId())
  const [run, setRun] = useState(0)
  const [snap, setSnap] = useState<{ T: number; dots: { id: number; x: number; y: number }[] }>({ T: 0, dots: [] })
  const state = useRef<{ T: number; acc: number; n: number; id: number; dots: CDot[] } | null>(null)

  const routes = useMemo(() => {
    const out = {} as Record<PodId, Route>
    for (const p of PODS) {
      const [px, py] = g.slots[p.node][p.slot]
      out[p.id] = g.routes(px, py, p.node)
    }
    return out
  }, [g])

  useEffect(() => {
    if (reduced || !onScreen) return
    if (!state.current) state.current = { T: 0, acc: 0, n: 0, id: 1, dots: [] }
    const S = state.current
    let raf = 0
    let last = performance.now()
    const tick = (ts: number) => {
      const dt = Math.min(50, ts - last)
      last = ts
      S.T += dt
      S.acc += dt
      while (S.acc >= 240) {
        S.acc -= 240
        const ready = PODS.filter((p) => podState(p.id, S.T) === 'ready')
        if (ready.length) S.dots.push({ id: S.id++, pod: ready[S.n++ % ready.length].id, t0: S.T })
      }
      S.dots = S.dots.filter((d) => (S.T - d.t0) * SPEED < routes[d.pod].len)
      setSnap({
        T: S.T,
        dots: S.dots.map((d) => {
          const [x, y] = pointAt(routes[d.pod], (S.T - d.t0) * SPEED)
          return { id: d.id, x, y }
        }),
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reduced, onScreen, routes, run])

  const T = reduced ? 5200 : snap.T
  const replay = () => {
    state.current = { T: 0, acc: 0, n: 0, id: 1, dots: [] }
    setSnap({ T: 0, dots: [] })
    setRun((r) => r + 1)
  }

  const nPlaced = T >= T_SCHED
  const cpuUsed = [0.5 + 2 + (nPlaced ? 1 : 0), 0.5 + 1 + 2]
  const ramUsed = [1 + 2 + (nPlaced ? 1 : 0), 1 + 2 + 2]
  const dPhase = T % CYCLE
  const backoff = dPhase < 4200 ? Math.ceil((4200 - dPhase) / 1000) : 0
  const restarts = 4 + Math.floor(T / CYCLE)
  const binding = T >= T_SCHED - BIND_MS && T < T_SCHED
  const bindPt = binding ? pointAt(g.bind, ((T - (T_SCHED - BIND_MS)) / BIND_MS) * g.bind.len) : null
  const kubeletBusy = T >= T_SCHED && T < T_RUN

  const events: { t: string; kind: string; text: string; tone: 'line' | 'red' | 'pencil' }[] = []
  if (T >= T_PEND) events.push({ t: '0,5', kind: 'Created', text: 'Deployment klopa-api: dva nova Poda s verzijom v2.', tone: 'line' })
  if (T >= T_SCHED) {
    events.push({ t: '1,8', kind: 'Scheduled', text: 'klopa-api-5f8b-hk2vn → čvor-1; kubelet na čvoru-1 pokreće kontejner.', tone: 'pencil' })
    events.push({ t: '1,8', kind: 'FailedScheduling', text: 'klopa-api-5f8b-x7mzc: 0/2 čvora, nedovoljno CPU-a.', tone: 'red' })
  }
  if (T >= T_READY) events.push({ t: '4,8', kind: 'Ready', text: 'readiness provjera prošla → Service otvara zasun i šalje promet i na v2.', tone: 'pencil' })
  events.push({
    t: hr(T / 1000, 1),
    kind: 'BackOff',
    text: `klopa-api-7d9c-lp6rt: kontejner pada, ${restarts}. ponovno pokretanje${backoff ? ` za ${backoff} s` : ' u tijeku'}.`,
    tone: 'red',
  })

  const fs = g.fs
  return (
    <div className={s.simSheet} ref={screenRef}>
      <div className={c.head}>
        <span className={c.headL}>{'Detalj B · klaster klopa-prod · MJ\u00a01:1'}</span>
        <span className={c.clock}>
          T + {hr(T / 1000, 1)} s <span className={s.dimNote}>(sim)</span>
        </span>
        {!reduced && (
          <button type="button" className={s.btnSmall} onClick={replay}>
            Ponovi uvođenje v2
          </button>
        )}
      </div>
      <div className={c.stage} ref={wrapRef}>
        <svg
          viewBox={`0 0 ${g.W} ${g.H}`}
          className={s.svg}
          role="img"
          aria-label="Klaster: control plane i dva radna čvora; na svakom čvoru kubelet razgovara s kube-apiserverom. Service klopa-api ima zasun prema svakom Podu i otvara ga samo Podovima koji su Ready; jedan Pod je u stanju CrashLoopBackOff, a jedan novi Pod verzije v2 čeka raspored jer nema dovoljno CPU-a."
        >
          <Defs uid={uid} />
          <ControlPlane g={g} />

          {/* kubelet ↔ api-server: a signal line (thin, with // marks) — control traffic, never user requests */}
          <SignalLine segs={g.ctlSegs} />
          <text x={g.kubeletLabel.at[0]} y={g.kubeletLabel.at[1]} textAnchor={g.kubeletLabel.anchor} className={c.ctlLabel} style={{ fontSize: fs }}>
            upravljanje: api-server ↔ kubelet
          </text>
          {bindPt && (
            <g>
              <path d={`M${bindPt[0] - 6},${bindPt[1]} L${bindPt[0]},${bindPt[1] - 6} L${bindPt[0] + 6},${bindPt[1]} L${bindPt[0]},${bindPt[1] + 6} Z`} className={c.msg} />
            </g>
          )}

          {/* scheduling queue */}
          <rect x={g.pend.x} y={g.pend.y} width={g.pend.w} height={g.pend.h} className={c.pendBox} />
          <text x={g.pend.x + 12} y={g.pend.y + 22} className={s.partTiny} style={{ fontSize: 12 }}>
            ČEKA RASPORED
          </text>
          {g.pendPods.map(([x, y], i) =>
            T >= T_PEND && (i === 1 || T < T_SCHED) ? <Pod key={i} cx={x} cy={y} r={g.r * 0.8} state="pending" version={2} uid={uid} /> : null,
          )}
          {T >= T_SCHED && (
            <PlateText x={g.pendNote[0]} y={g.pendNote[1]} cls={s.redTxt} size={fs - 0.5} lines={['Pending: 0/2 čvora,', 'premalo CPU-a']} />
          )}

          {g.nodes.map((n, i) => (
            <Node key={i} g={g} n={n} i={i} cpu={cpuUsed[i]} ram={ramUsed[i]} uid={uid} busy={i === 0 && kubeletBusy} />
          ))}

          {/* Service: same grammar as the load balancer — a distributor, a manifold and one valve per Pod */}
          <path d={g.manifold} className={s.pipe} />
          {PODS.map((p) => {
            const st = podState(p.id, T)
            if (!st) return null
            const [px, py] = g.slots[p.node][p.slot]
            const vy = g.valveY[p.node]
            const ready = st === 'ready'
            const mY = routes[p.id].pts[2][1]
            return (
              <g key={p.id}>
                <path d={`M${px},${mY} V${vy + 7}`} className={s.pipe} />
                <path d={`M${px},${vy - 7} V${py + g.r}`} className={ready ? c.dropOn : c.dropOff} />
                <Valve x={px} y={vy} closed={!ready} vertical />
              </g>
            )
          })}

          {PODS.map((p) => {
            const st = podState(p.id, T)
            if (!st) return null
            const [px, py] = g.slots[p.node][p.slot]
            return (
              <motion.g key={p.id} initial={p.id === 'n' ? { opacity: 0 } : false} animate={{ opacity: 1 }}>
                <Pod cx={px} cy={py} r={g.r} state={st} version={p.v} uid={uid} restarts={p.id === 'd' ? restarts : undefined} />
                <PodStatus
                  x={px}
                  y={py - g.r - 8}
                  name={`…${p.name.slice(-5)}`}
                  st={st}
                  tall={g.tall}
                  fs={fs}
                  note={p.id === 'd' && st === 'crash' ? (dPhase < 700 ? 'upravo pao' : `opet za ${backoff} s`) : ''}
                />
              </motion.g>
            )
          })}

          {snap.dots.map((d) => (
            <use key={d.id} href={`#${uid}-req`} x={d.x} y={d.y} className={s.dotReq} />
          ))}

          <path d={g.ingress} className={s.pipe} markerEnd={`url(#${uid}-a)`} />
          <text x={g.ingressLabel[0]} y={g.ingressLabel[1]} textAnchor={g.tall ? 'end' : 'start'} className={s.lblMuted} style={{ fontSize: fs }}>
            {g.tall ? '← promet iz Ingressa' : 'iz Ingressa'}
          </text>
          <Rotary cx={g.svc[0]} cy={g.svc[1]} r={g.svcR} angle={g.svcAngle} label="" />
          <text x={g.svcText[0]} y={g.svcText[1]} className={s.partSmallStrong} style={{ fontSize: g.tall ? 17 : 19 }}>
            SERVICE klopa-api
          </text>
          <text x={g.svcText[0]} y={g.svcText[1] + 19} className={s.lblPencil} style={{ fontSize: fs }}>
            selector: app=klopa-api
          </text>
        </svg>
      </div>
      <ol className={c.events} aria-live="polite">
        {events.slice(-4).map((e) => (
          <li key={e.kind + e.t} data-tone={e.tone}>
            <span className={s.revT}>T+{e.t} s</span>
            <span className={c.evKind}>{e.kind}</span>
            <span>{e.text}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Instrument signal line, as on a P&ID: a thin line with a // mark every few centimetres. */
function SignalLine({ segs }: { segs: [number, number, number, number][] }) {
  const d = segs.map(([x1, y1, x2, y2]) => `M${x1},${y1} L${x2},${y2}`).join(' ')
  let marks = ''
  for (const [x1, y1, x2, y2] of segs) {
    const len = Math.hypot(x2 - x1, y2 - y1)
    const n = Math.floor(len / 64)
    for (let k = 1; k <= n; k++) {
      const f = (k * len) / (n + 1) / len
      const x = x1 + (x2 - x1) * f
      const y = y1 + (y2 - y1) * f
      marks +=
        y1 === y2
          ? ` M${x - 4},${y + 4} L${x},${y - 4} M${x},${y + 4} L${x + 4},${y - 4}`
          : ` M${x - 4},${y + 2} L${x + 4},${y - 2} M${x - 4},${y + 6} L${x + 4},${y + 2}`
    }
  }
  return (
    <g>
      <path d={d} className={c.ctl} />
      <path d={marks} className={c.ctlMark} />
    </g>
  )
}

/** Text on a paper-coloured knockout plate, so it stays legible on hatching and stipple. */
function PlateText({ x, y, lines, cls, size, anchor = 'start' }: { x: number; y: number; lines: string[]; cls: string; size: number; anchor?: 'start' | 'middle' }) {
  const w = Math.max(...lines.map((l) => l.length)) * size * 0.6 + 6
  const lh = size + 4
  const x0 = anchor === 'middle' ? x - w / 2 : x - 3
  return (
    <g>
      <rect x={x0} y={y - size} width={w} height={lh * lines.length + 2} className={c.plate} />
      {lines.map((l, i) => (
        <text key={i} x={x} y={y + i * lh} textAnchor={anchor} className={cls} style={{ fontSize: size }}>
          {l}
        </text>
      ))}
    </g>
  )
}

function PodStatus({ x, y, name, st, tall, note, fs }: { x: number; y: number; name: string; st: PodState; tall: boolean; note: string; fs: number }) {
  const cls = st === 'crash' ? s.redTxt : st === 'ready' ? s.lblPencil : s.lblMuted
  const label =
    st === 'crash'
      ? tall
        ? 'CrashLoop…'
        : 'CrashLoopBackOff'
      : st === 'ready'
        ? 'Ready'
        : st === 'running'
          ? 'nije Ready'
          : st === 'creating'
            ? tall
              ? 'Creating'
              : 'ContainerCreating'
            : 'Pending'
  const lines = [label, ...(note ? [note] : [])]
  const lh = fs + 3
  return (
    <g>
      <text x={x} y={y - lines.length * lh} textAnchor="middle" className={s.lblMuted} style={{ fontSize: fs - 0.5 }}>
        {name}
      </text>
      {lines.map((l, i) => (
        <text key={i} x={x} y={y - (lines.length - 1 - i) * lh} textAnchor="middle" className={cls} style={{ fontSize: fs }}>
          {l}
        </text>
      ))}
    </g>
  )
}

function CompBox({ comp, fs }: { comp: Comp; fs: number }) {
  const { b, name, db } = comp
  if (db) return <Cylinder x={b.x} y={b.y} w={b.w} h={b.h} label={name} />
  return (
    <g>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} className={s.compBox} />
      <text x={b.x + b.w / 2} y={b.y + b.h / 2 + 5} textAnchor="middle" className={s.partSmall} style={{ fontSize: fs }}>
        {name}
      </text>
    </g>
  )
}

function ControlPlane({ g }: { g: CGeo }) {
  const uid = safeId(useId())
  return (
    <g>
      <Defs uid={uid} />
      <rect x={g.cp.x} y={g.cp.y} width={g.cp.w} height={g.cp.h} className={s.boxLine} />
      <rect x={g.cp.x + 4} y={g.cp.y + 4} width={g.cp.w - 8} height={g.cp.h - 8} className={s.thinSoftRect} />
      <text x={g.cp.x + 16} y={g.cp.y + 28} className={s.partName} style={{ fontSize: g.tall ? 18 : 20 }}>
        CONTROL PLANE
      </text>
      {g.cpNote && (
        <text x={g.cp.x + g.cp.w - 16} y={g.cp.y + 28} textAnchor="end" className={s.lblMuted} style={{ fontSize: 13 }}>
          odlučuje gdje se što pokreće
        </text>
      )}
      <path d={g.links.etcd} className={s.thin} />
      {g.links.arrows.map((d) => (
        <path key={d} d={d} className={s.thin} markerEnd={`url(#${uid}-a)`} />
      ))}
      <CompBox comp={g.comps.sched} fs={g.fs} />
      <CompBox comp={g.comps.api} fs={g.fs} />
      <CompBox comp={g.comps.cm} fs={g.fs - (g.tall ? 0 : 0.5)} />
      <CompBox comp={g.comps.etcd} fs={g.fs} />
    </g>
  )
}

function Node({ g, n, i, cpu, ram, uid, busy }: { g: CGeo; n: Box; i: number; cpu: number; ram: number; uid: string; busy: boolean }) {
  const kb = g.kubelets[i]
  const { cell, ramCell, label } = g.bars
  const bx = n.x + g.bars.x
  const cy = n.y + (g.tall ? 48 : 46)
  const ry = n.y + (g.tall ? 70 : 72)
  const pods = Math.round(cpu - 0.5 - (i === 1 ? 1 : 0))
  const fs = g.fs
  const other = g.other[i]
  return (
    <g>
      <rect x={n.x} y={n.y} width={n.w} height={n.h} className={s.boxLine} />
      <text x={n.x + 12} y={n.y + 27} className={s.partName} style={{ fontSize: g.tall ? 18 : 20 }}>
        ČVOR-{i + 1}
      </text>
      {!g.tall && (
        <text x={n.x + n.w - 14} y={n.y + 26} textAnchor="end" className={s.lblMuted} style={{ fontSize: fs }}>
          4 vCPU · 8 GB
        </text>
      )}
      {/* kubelet: the node's agent; the chain line is its link to kube-apiserver */}
      <rect x={kb.x} y={kb.y} width={kb.w} height={kb.h} className={busy ? c.kubeletBusy : c.kubelet} />
      <text x={kb.x + kb.w / 2} y={kb.y + kb.h / 2 + 4.5} textAnchor="middle" className={busy ? s.lblPencil : s.partSmall} style={{ fontSize: fs }}>
        kubelet
      </text>

      <text x={n.x + label} y={cy + 12} className={s.partTiny} style={{ fontSize: 12 }}>
        CPU
      </text>
      {Array.from({ length: 4 }, (_, k) => (
        <rect key={k} x={bx + k * cell} y={cy} width={cell} height={16} className={s.core} />
      ))}
      <rect x={bx} y={cy} width={cell * 0.5} height={16} fill={`url(#${uid}-st)`} />
      {i === 1 && <rect x={bx + cell * 0.5} y={cy} width={cell} height={16} fill={`url(#${uid}-st)`} />}
      <rect x={bx + cell * (0.5 + (i === 1 ? 1 : 0))} y={cy} width={cell * pods} height={16} fill={`url(#${uid}-h)`} />
      <text x={bx + cell * 4 + 8} y={cy + 13} className={cpu >= 3.5 ? s.redTxt : s.lbl} style={{ fontSize: fs }}>
        {hr(cpu, 1)} / 4 vCPU
      </text>
      <text x={n.x + label} y={ry + 12} className={s.partTiny} style={{ fontSize: 12 }}>
        RAM
      </text>
      {Array.from({ length: 8 }, (_, k) => (
        <rect key={k} x={bx + k * ramCell} y={ry} width={ramCell} height={16} className={s.core} />
      ))}
      <rect x={bx} y={ry} width={ramCell * (i === 1 ? 3 : 1)} height={16} fill={`url(#${uid}-st)`} />
      <rect x={bx + ramCell * (i === 1 ? 3 : 1)} y={ry} width={ramCell * pods} height={16} fill={`url(#${uid}-h)`} />
      <text x={bx + ramCell * 8 + 8} y={ry + 13} className={s.lbl} style={{ fontSize: fs }}>
        {hr(ram, 0)} / 8 GB
      </text>

      <rect x={other.x} y={other.y} width={other.w} height={other.h} className={s.core} style={{ fill: `url(#${uid}-st)` }} />
      <PlateText
        x={other.x + other.w / 2}
        y={other.y + other.h / 2 - 2}
        anchor="middle"
        cls={s.lbl}
        size={g.tall ? 11.5 : 12.5}
        lines={i === 0 ? ['sustav', '0,5 vCPU'] : ['drugi podovi', '1,5 vCPU']}
      />
    </g>
  )
}
