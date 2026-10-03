import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Rough, Boil, Cross, Check, Arrow } from './Sketch'
import { Crowd, Helm, Redar, TrayDefs } from './Doodles'
import { Mark, SecHead, PropHelm } from './Bits'
import { useInView, useWidth } from './useSize'
import s from './bj.module.css'
import c from './cluster.module.css'

type PodState = 'Running' | 'Pending' | 'CrashLoopBackOff'
type XY = [number, number]
type Pts = XY[]

interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface Callout {
  x: number
  y: number
  lines: string[]
  arrow?: Pts
}

/**
 * Three drawings of the same cluster. Text sizes are chosen per layout so they render at ≥ 12 px
 * at the smallest width each layout is used for (wide ≥ 890 px, medium 560–890, tall < 560).
 */
interface Geo {
  name: 'wide' | 'medium' | 'tall'
  vb: [number, number]
  maxW: number | null
  pod: { w: number; h: number; mono: number; hand: number }
  mono: number
  hand: number
  titleSize: number
  cp: Box
  helm: XY
  cpTitle: XY
  parts: { label: string; x: number; y: number; w: number }[]
  nodes: (Box & { head: XY; spec: boolean; cpuBar: XY; ramBar: XY; barW: number })[]
  slots: XY[][]
  pending: XY
  svc: Box
  crowd: { x: number; y: number; s: number } | null
  crowdOut: XY
  rosetta: XY | null
  search: Pts
  callouts: [Callout, Callout, Callout]
}

const WIDE: Geo = {
  name: 'wide',
  vb: [1000, 624],
  maxW: null,
  pod: { w: 140, h: 102, mono: 13, hand: 17 },
  mono: 13.5,
  hand: 18,
  titleSize: 20,
  cp: { x: 290, y: 30, w: 420, h: 106 },
  helm: [324, 68],
  cpTitle: [354, 62],
  parts: [
    { label: 'etcd', x: 306, y: 98, w: 0 },
    { label: 'API server', x: 400, y: 96, w: 112 },
    { label: 'scheduler', x: 528, y: 96, w: 104 },
  ],
  nodes: [
    { x: 24, y: 172, w: 460, h: 192, head: [40, 200], spec: true, cpuBar: [40, 214], ramBar: [270, 214], barW: 100 },
    { x: 516, y: 172, w: 460, h: 192, head: [532, 200], spec: true, cpuBar: [532, 214], ramBar: [778, 214], barW: 100 },
  ],
  slots: [
    [
      [38, 248],
      [184, 248],
      [330, 248],
    ],
    [
      [530, 248],
      [676, 248],
      [822, 248],
    ],
  ],
  pending: [842, 44],
  svc: { x: 372, y: 452, w: 290, h: 80 },
  crowd: { x: 40, y: 410, s: 0.72 },
  crowdOut: [214, 492],
  rosetta: [712, 474],
  search: [
    [632, 108],
    [740, 100],
    [840, 92],
  ],
  callouts: [
    {
      x: 724,
      y: 58,
      lines: ['① novi Pod v2', 'čeka mjesto…'],
    },
    {
      x: 792,
      y: 158,
      lines: ['② ovdje ima mjesta!'],
      arrow: [
        [632, 112],
        [742, 126],
        [771, 238],
      ],
    },
    {
      x: 690,
      y: 416,
      lines: ['③ spreman → dobiva promet'],
    },
  ],
}

const MEDIUM: Geo = {
  name: 'medium',
  vb: [720, 736],
  maxW: null,
  pod: { w: 156, h: 104, mono: 15, hand: 18.5 },
  mono: 15,
  hand: 19,
  titleSize: 21,
  cp: { x: 8, y: 12, w: 412, h: 112 },
  helm: [42, 50],
  cpTitle: [72, 44],
  parts: [
    { label: 'API server', x: 18, y: 82, w: 122 },
    { label: 'scheduler', x: 152, y: 82, w: 112 },
    { label: 'etcd', x: 280, y: 84, w: 0 },
  ],
  nodes: [
    { x: 4, y: 152, w: 712, h: 204, head: [20, 182], spec: true, cpuBar: [20, 196], ramBar: [330, 196], barW: 120 },
    { x: 4, y: 522, w: 712, h: 204, head: [20, 680], spec: true, cpuBar: [20, 694], ramBar: [330, 694], barW: 120 },
  ],
  slots: [
    [
      [24, 238],
      [278, 238],
      [532, 238],
    ],
    [
      [24, 540],
      [278, 540],
      [532, 540],
    ],
  ],
  pending: [556, 30],
  svc: { x: 215, y: 400, w: 290, h: 80 },
  crowd: { x: 8, y: 380, s: 0.54 },
  crowdOut: [122, 440],
  rosetta: null,
  search: [
    [264, 94],
    [420, 140],
    [550, 96],
  ],
  callouts: [
    {
      x: 434,
      y: 52,
      lines: ['① čeka', 'mjesto…'],
    },
    {
      x: 528,
      y: 424,
      lines: ['② scheduler:', 'ovdje ima mjesta!'],
      arrow: [
        [560, 470],
        [470, 500],
        [400, 532],
      ],
    },
    {
      x: 352,
      y: 508,
      lines: ['③ spreman → dobiva promet'],
    },
  ],
}

const TALL: Geo = {
  name: 'tall',
  vb: [360, 720],
  maxW: 420,
  pod: { w: 150, h: 96, mono: 13.4, hand: 16.5 },
  mono: 13.4,
  hand: 16.5,
  titleSize: 18,
  cp: { x: 4, y: 8, w: 196, h: 152 },
  helm: [28, 34],
  cpTitle: [52, 32],
  parts: [
    { label: 'API server', x: 14, y: 62, w: 102 },
    { label: 'scheduler', x: 14, y: 94, w: 102 },
    { label: 'etcd', x: 16, y: 128, w: 0 },
  ],
  nodes: [
    { x: 4, y: 178, w: 352, h: 192, head: [16, 204], spec: false, cpuBar: [16, 214], ramBar: [16, 236], barW: 96 },
    { x: 4, y: 520, w: 352, h: 192, head: [16, 660], spec: false, cpuBar: [16, 670], ramBar: [16, 692], barW: 96 },
  ],
  slots: [
    [
      [16, 266],
      [194, 266],
    ],
    [
      [16, 536],
      [194, 536],
    ],
  ],
  pending: [206, 30],
  svc: { x: 100, y: 398, w: 256, h: 74 },
  crowd: { x: -4, y: 386, s: 0.42 },
  crowdOut: [76, 436],
  rosetta: null,
  search: [
    [116, 106],
    [160, 118],
    [202, 96],
  ],
  callouts: [
    {
      x: 210,
      y: 154,
      lines: ['① čeka mjesto…'],
    },
    {
      x: 246,
      y: 500,
      lines: ['② ima mjesta!'],
      arrow: [
        [300, 506],
        [304, 518],
        [296, 532],
      ],
    },
    {
      x: 246,
      y: 500,
      lines: ['③ spreman!'],
    },
  ],
}

function geoFor(w: number | null): Geo {
  if (w === null || w >= 890) return WIDE
  return w >= 560 ? MEDIUM : TALL
}

/* ---------- pieces ---------- */

function PodFace({ state }: { state: PodState }) {
  if (state === 'CrashLoopBackOff')
    return (
      <g>
        <Rough shape={{ k: 'line', x1: -9, y1: -4, x2: -3, y2: 2 }} seed={4001} stroke="var(--red)" strokeWidth={1.8} />
        <Rough shape={{ k: 'line', x1: -3, y1: -4, x2: -9, y2: 2 }} seed={4002} stroke="var(--red)" strokeWidth={1.8} />
        <Rough shape={{ k: 'line', x1: 3, y1: -4, x2: 9, y2: 2 }} seed={4003} stroke="var(--red)" strokeWidth={1.8} />
        <Rough shape={{ k: 'line', x1: 9, y1: -4, x2: 3, y2: 2 }} seed={4004} stroke="var(--red)" strokeWidth={1.8} />
      </g>
    )
  if (state === 'Pending')
    return (
      <g>
        <Rough shape={{ k: 'line', x1: -9, y1: -1, x2: -3, y2: -1 }} seed={4005} strokeWidth={1.6} />
        <Rough shape={{ k: 'line', x1: 3, y1: -1, x2: 9, y2: -1 }} seed={4006} strokeWidth={1.6} />
        <text x={13} y={-5} className={s.svgHand} style={{ fontSize: 15, fill: 'var(--ink-3)' }}>
          z
        </text>
      </g>
    )
  return (
    <g>
      <circle cx={-6} cy={-1} r={2} className={s.inkFill} />
      <circle cx={6} cy={-1} r={2} className={s.inkFill} />
      <Rough
        shape={{
          k: 'curve',
          pts: [
            [-5, 5],
            [0, 9],
            [5, 5],
          ],
        }}
        seed={4007}
        strokeWidth={1.5}
        roughness={0.5}
      />
    </g>
  )
}

/** Where the Service's wire plugs into a Pod: a small port on the edge that faces the Service. */
function portOf(g: Geo, p: XY): XY {
  const below = p[1] < g.svc.y
  return below ? [p[0] + g.pod.w / 2, p[1] + g.pod.h + 2] : [p[0] + g.pod.w * 0.24, p[1] + 2]
}

/**
 * A Pod = a lunchbox with a handle: name on the lid, the container inside (the food box, with a face),
 * a strip of tape for the version, and its state written on the box. The port dot is where the Service plugs in.
 */
function Pod({ g, v, state, restarts, seed, ready, port }: { g: Geo; v: 'v1' | 'v2'; state: PodState; restarts: number; seed: number; ready: boolean; port: 'top' | 'bottom' | null }) {
  const { w, h, mono, hand } = g.pod
  const crash = state === 'CrashLoopBackOff'
  const pend = state === 'Pending'
  const stroke = crash ? 'var(--red)' : 'var(--ink)'
  const tint = v === 'v1' ? 'var(--hl-blue-ink)' : 'var(--hl-green-ink)'
  const foodH = Math.round(h * 0.33)
  return (
    <g className={pend ? c.pending : undefined}>
      <Rough shape={{ k: 'arc', cx: w / 2, cy: 2, w: 40, h: 22, start: Math.PI, stop: Math.PI * 2 }} seed={seed} stroke={stroke} strokeWidth={2} />
      <Rough shape={{ k: 'rect', x: 0, y: 2, w, h }} seed={seed + 1} stroke={stroke} strokeWidth={1.9} fillColor="var(--paper)" fillStyle="solid" dash={pend ? '6 5' : undefined} />
      <Rough
        shape={{ k: 'rect', x: 12, y: 25, w: w - 24, h: foodH }}
        seed={seed + 2}
        stroke={stroke}
        strokeWidth={1.3}
        fillColor={crash ? 'var(--red)' : tint}
        hachureGap={crash ? 3.2 : 5}
        fillWeight={crash ? 1 : 0.9}
        hachureAngle={v === 'v1' ? -41 : 41}
      />
      <g transform={`rotate(6 ${w - 22} 6)`}>
        <rect x={w - 44} y={-4} width={42} height={19} className={v === 'v1' ? c.tapeV1 : c.tapeV2} />
        <text x={w - 23} y={11} textAnchor="middle" className={c.tapeText} style={{ fontSize: 14.5 }}>
          {v}
        </text>
      </g>
      <text x={9} y={19} className={s.svgMono} style={{ fontSize: mono, fontWeight: 600 }}>
        klopa-api
      </text>
      <g transform={`translate(${w / 2} ${25 + foodH / 2})`}>
        <rect x={-17} y={-12} width={34} height={22} rx={4} className={c.faceBg} />
        <PodFace state={state} />
      </g>
      <text x={8} y={h - 20} className={`${s.svgMono} ${crash ? c.stRed : pend ? c.stDim : c.stOk}`} style={{ fontSize: mono, fontWeight: 600 }}>
        {state}
      </text>
      <text x={9} y={h - 4} className={s.svgHand} style={{ fontSize: hand, fill: 'var(--ink-2)' }}>
        {crash ? `↻ ${restarts} · pa ponovo` : pend ? 'čeka čvor…' : ready ? 'spreman' : 'pokreće se…'}
      </text>
      {state === 'Running' && ready && <Check x={w - 16} y={h - 26} size={7} seed={seed + 5} />}
      {port && <circle cx={port === 'bottom' ? w / 2 : w * 0.24} cy={port === 'bottom' ? h + 2 : 2} r={4.6} className={ready ? c.portOn : c.portOff} />}
    </g>
  )
}

function Bar({ x, y, label, used, total, unit, w, g, seed }: { x: number; y: number; label: string; used: number; total: number; unit: string; w: number; g: Geo; seed: number }) {
  return (
    <g>
      <text x={x} y={y + 13} className={s.svgHand} style={{ fontSize: g.hand, fill: 'var(--ink-2)' }}>
        {label}
      </text>
      <g transform={`translate(${x + 40} ${y})`}>
        <Rough shape={{ k: 'rect', x: 0, y: 0, w, h: 16 }} seed={seed} strokeWidth={1.3} />
        <motion.rect x={2} y={2} height={12} initial={false} animate={{ width: ((w - 4) * used) / total }} transition={{ duration: 0.8 }} className={c.barFill} />
        <text x={w + 8} y={13} className={s.svgMono} style={{ fontSize: g.mono, fill: 'var(--ink-2)' }}>
          {used}/{total} {unit}
        </text>
      </g>
    </g>
  )
}

/** Tray flowing along a straight wire. */
function Traffic({ from, to, delay, dur = 1.6 }: { from: XY; to: XY; delay: number; dur?: number }) {
  return (
    <motion.g
      initial={{ x: from[0], y: from[1], opacity: 0 }}
      animate={{ x: [from[0], to[0]], y: [from[1], to[1]], opacity: [0, 1, 1, 0] }}
      transition={{
        x: { duration: dur, ease: 'linear', repeat: Infinity, delay },
        y: { duration: dur, ease: 'linear', repeat: Infinity, delay },
        opacity: { duration: dur, times: [0, 0.08, 0.9, 1], ease: 'linear', repeat: Infinity, delay },
      }}
    >
      <use href="#bjk8s-tray" x={-14} y={-10} width={28} height={19} />
    </motion.g>
  )
}

/** The luggage tag shape of a Service. */
function ServiceTag({ x, y, w, h, small }: Box & { small?: boolean }) {
  return (
    <g>
      <Rough
        shape={{ k: 'path', d: `M${x + 18} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x + 18} ${y + h} L${x} ${y + h / 2} Z` }}
        seed={small ? 4511 : 4501}
        strokeWidth={small ? 1.6 : 2.1}
        fillColor="var(--paper)"
        fillStyle="solid"
      />
      <Rough shape={{ k: 'ellipse', cx: x + 16, cy: y + h / 2, w: small ? 6 : 10, h: small ? 6 : 10 }} seed={small ? 4512 : 4502} strokeWidth={1.4} />
    </g>
  )
}

/** A numbered handwritten note right next to whatever changes in this step. */
function StoryNote({ note, phase, g }: { note: Callout; phase: number; g: Geo }) {
  const tone = phase === 0 ? 'var(--pen)' : phase === 1 ? 'var(--red)' : 'var(--green)'
  const size = g.hand + 2
  return (
    <motion.g key={phase} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, delay: 0.15 }}>
      {note.lines.map((l, i) => (
        <text key={i} x={note.x} y={note.y + i * (size + 1)} className={s.svgHand} style={{ fontSize: size, fill: tone, fontWeight: 700 }}>
          {l}
        </text>
      ))}
      {note.arrow && <Arrow pts={note.arrow} stroke={tone} strokeWidth={2} seed={4700 + phase} draw="mount" />}
    </motion.g>
  )
}

/* ---------- the scene ---------- */

const STORY = [
  { ms: 3200, title: 'Novi Pod čeka', text: 'Novi Pod v2 je Pending: scheduler još traži čvor s dovoljno slobodnog CPU-a i RAM-a.' },
  { ms: 2400, title: 'Scheduler bira čvor', text: 'Scheduler ga smješta na čvor 2, gdje ima mjesta. Kubelet preuzima sliku i pokreće kontejner.' },
  { ms: 0, title: 'Spreman za promet', text: 'Pod v2 je Running i spreman, pa mu Service počinje slati promet. Pod u CrashLoopBackOff ne dobiva ništa.' },
]

function Scene() {
  const reduce = useReducedMotion()
  const [ref, width] = useWidth<HTMLDivElement>()
  const [viewRef, inView] = useInView<HTMLDivElement>(0.3)
  const [phase, setPhase] = useState(0)
  const [auto, setAuto] = useState(true)
  const [run, setRun] = useState(0)
  const [loopT, setLoopT] = useState(0)
  const g = geoFor(width)

  // the v2 rollout story plays once when in view; the reader can also step through it
  useEffect(() => {
    if (!inView || reduce || !auto) return
    if (phase >= STORY.length - 1) return
    const id = window.setTimeout(() => setPhase((p) => p + 1), STORY[phase].ms)
    return () => window.clearTimeout(id)
  }, [inView, phase, reduce, run, auto])

  // the crash loop: back-off → restart → crash, forever (1 tick = 0,5 s)
  useEffect(() => {
    if (!inView || reduce) return
    const id = window.setInterval(() => setLoopT((t) => t + 1), 500)
    return () => window.clearInterval(id)
  }, [inView, reduce])

  const shownPhase = reduce && auto ? STORY.length - 1 : phase
  const goTo = (p: number) => {
    setAuto(false)
    setPhase(Math.max(0, Math.min(STORY.length - 1, p)))
  }
  const cyc = loopT % 12 // 6 s cycle
  const bState: PodState = cyc >= 7 && cyc < 10 ? 'Running' : 'CrashLoopBackOff'
  const bRestarts = 4 + Math.floor((loopT + 5) / 12)
  const bFlash = cyc === 10 || cyc === 11
  const dPlaced = shownPhase >= 1
  const dReady = shownPhase >= 2
  const nodeOf = (p: XY) => (p[1] < g.svc.y ? 0 : 1)

  const pods = [
    { id: 'a', v: 'v1' as const, pos: g.slots[0][0], state: 'Running' as PodState, ready: true, seed: 4100 },
    { id: 'b', v: 'v1' as const, pos: g.slots[0][1], state: bState, ready: false, seed: 4120 },
    { id: 'c', v: 'v1' as const, pos: g.slots[1][0], state: 'Running' as PodState, ready: true, seed: 4140 },
    { id: 'd', v: 'v2' as const, pos: dPlaced ? g.slots[1][1] : g.pending, state: (dPlaced ? 'Running' : 'Pending') as PodState, ready: dReady, seed: 4160 },
  ]
  const taken = new Set(pods.map((p) => p.pos.join(',')))
  const free = g.slots.flat().filter((p) => !taken.has(p.join(',')))
  const svcMid = g.svc.x + g.svc.w / 2
  /** the wire leaves the tag on the side facing the Pod and ends on the Pod's port */
  const wire = (p: XY): { from: XY; to: XY } => {
    const port = portOf(g, p)
    const below = nodeOf(p) === 0
    const fx = Math.max(g.svc.x + 40, Math.min(g.svc.x + g.svc.w - 24, svcMid + (port[0] - svcMid) * 0.4))
    const from: XY = below ? [fx, g.svc.y] : [fx, g.svc.y + g.svc.h]
    const a = Math.atan2(port[1] - from[1], port[0] - from[0])
    return { from, to: [port[0] - Math.cos(a) * 6, port[1] - Math.sin(a) * 6] }
  }
  const svcIn: XY = [g.svc.x + 2, g.svc.y + g.svc.h / 2]
  const cpuOf = (i: number) => (i === 0 ? 2 : dPlaced ? 2 : 1)

  return (
    <div ref={ref} className={c.scene}>
      <div ref={viewRef} className={c.stage} style={{ maxWidth: g.maxW ?? undefined }}>
        <svg
          viewBox={`0 0 ${g.vb[0]} ${g.vb[1]}`}
          className={c.svg}
          role="img"
          aria-label="Kubernetes klaster: control plane, dva radna čvora s Podovima i Service koji promet studenata šalje samo spremnim Podovima."
        >
          <TrayDefs id="bjk8s" />
          {/* control plane */}
          <Rough shape={{ k: 'rect', ...g.cp }} seed={4201} strokeWidth={2} stroke="var(--pen)" fillColor="var(--paper)" fillStyle="solid" multi />
          <g transform={`translate(${g.helm[0]} ${g.helm[1]})`}>
            <Boil slow>
              <Helm x={0} y={0} r={g.name === 'tall' ? 13 : 16} />
            </Boil>
          </g>
          <text x={g.cpTitle[0]} y={g.cpTitle[1]} className={s.svgDisplay} style={{ fontSize: g.titleSize - 1, fill: 'var(--pen)' }}>
            control plane
          </text>
          <text x={g.cpTitle[0]} y={g.cpTitle[1] + g.hand + 1} className={s.svgHand} style={{ fontSize: g.hand - 1, fill: 'var(--ink-2)' }}>
            „mozak” klastera
          </text>
          {g.parts.map((pt, i) =>
            pt.w === 0 ? (
              <g key={pt.label}>
                <Rough shape={{ k: 'ellipse', cx: pt.x + 18, cy: pt.y + 2, w: 34, h: 9 }} seed={4210 + i} strokeWidth={1.3} />
                <Rough
                  shape={{ k: 'path', d: `M${pt.x + 1} ${pt.y + 2} L${pt.x + 1} ${pt.y + 20} Q${pt.x + 18} ${pt.y + 28} ${pt.x + 35} ${pt.y + 20} L${pt.x + 35} ${pt.y + 2}` }}
                  seed={4215}
                  strokeWidth={1.3}
                />
                <text x={pt.x + 42} y={pt.y + 18} className={s.svgMono} style={{ fontSize: g.mono }}>
                  etcd
                </text>
              </g>
            ) : (
              <g key={pt.label}>
                <Rough shape={{ k: 'rect', x: pt.x, y: pt.y, w: pt.w, h: 26 }} seed={4210 + i} strokeWidth={1.3} />
                <text x={pt.x + pt.w / 2} y={pt.y + 18} textAnchor="middle" className={s.svgMono} style={{ fontSize: g.mono }}>
                  {pt.label}
                </text>
              </g>
            ),
          )}

          {/* worker nodes */}
          {g.nodes.map((n, i) => (
            <g key={i}>
              <Rough shape={{ k: 'rect', x: n.x, y: n.y, w: n.w, h: n.h }} seed={4300 + i * 10} strokeWidth={1.9} roughness={1.5} />
              <text x={n.head[0]} y={n.head[1]} className={s.svgDisplay} style={{ fontSize: g.titleSize }}>
                čvor {i + 1}
              </text>
              <text x={n.head[0] + g.titleSize * 3.6} y={n.head[1]} className={s.svgHand} style={{ fontSize: g.hand, fill: 'var(--ink-2)' }}>
                {n.spec ? '(worker · 4 vCPU · 8 GB)' : '· worker'}
              </text>
              <Bar x={n.cpuBar[0]} y={n.cpuBar[1]} label="CPU" used={cpuOf(i)} total={4} unit="vCPU" w={n.barW} g={g} seed={4301 + i * 10} />
              <Bar x={n.ramBar[0]} y={n.ramBar[1]} label="RAM" used={cpuOf(i) * 2} total={8} unit="GB" w={n.barW} g={g} seed={4302 + i * 10} />
            </g>
          ))}
          {/* free room on the nodes */}
          {free.map((p) => (
            <g key={p.join(',')}>
              <Rough shape={{ k: 'rect', x: p[0], y: p[1] + 2, w: g.pod.w, h: g.pod.h }} seed={4303 + p[0]} strokeWidth={1} stroke="var(--ink-3)" dash="2 6" />
              <text x={p[0] + g.pod.w / 2} y={p[1] + g.pod.h / 2 + 8} textAnchor="middle" className={s.svgHand} style={{ fontSize: g.hand, fill: 'var(--ink-3)' }}>
                slobodno
              </text>
            </g>
          ))}

          {/* the scheduler looks for room for the pending Pod */}
          {!dPlaced && <Arrow pts={g.search} stroke="var(--pen)" strokeWidth={1.7} seed={4721} dash="5 6" />}

          {/* Service: selects Pods by label, sends traffic only to ready ones — wires end on each Pod's port */}
          {pods.map((p) => {
            if (p.id === 'd' && !dPlaced) return null
            const { from, to } = wire(p.pos)
            return p.ready ? (
              <Arrow key={`l-${p.id}-${g.name}`} pts={[from, to]} stroke="var(--green)" strokeWidth={1.9} seed={4400 + p.seed} head={9} />
            ) : (
              <g key={`l-${p.id}-${g.name}`}>
                <Rough shape={{ k: 'line', x1: from[0], y1: from[1], x2: to[0], y2: to[1] }} seed={4400 + p.seed} stroke="var(--ink-3)" strokeWidth={1.2} dash="3 6" />
                <Cross x={(from[0] + to[0]) / 2} y={(from[1] + to[1]) / 2} size={8} seed={4410} strokeWidth={2} />
              </g>
            )
          })}
          <ServiceTag {...g.svc} />
          <text x={g.svc.x + 34} y={g.svc.y + 32} className={s.svgDisplay} style={{ fontSize: g.titleSize - 1 }}>
            Service klopa-api
          </text>
          <text x={g.svc.x + 34} y={g.svc.y + 32 + g.mono + 10} className={s.svgMono} style={{ fontSize: g.mono }}>
            selector: app=klopa-api
          </text>

          {/* students: where the traffic comes from */}
          {g.crowd && <Crowd x={g.crowd.x} y={g.crowd.y} scale={g.crowd.s} label={false} />}
          <Arrow pts={[g.crowdOut, [svcIn[0] - 6, svcIn[1]]]} stroke="var(--ink-2)" strokeWidth={1.6} seed={4431} />
          {g.name === 'wide' && (
            <text x={44} y={600} className={s.svgHand} style={{ fontSize: g.hand, fill: 'var(--ink-2)' }}>
              studenti šalju narudžbe
            </text>
          )}
          {!reduce && (
            <g key={`t-${dReady}-${g.name}`}>
              <Traffic from={g.crowdOut} to={svcIn} delay={0} dur={1.1} />
              <Traffic from={g.crowdOut} to={svcIn} delay={0.55} dur={1.1} />
              {pods
                .filter((p) => p.ready)
                .map((p, i) => {
                  const { from, to } = wire(p.pos)
                  return <Traffic key={p.id} from={from} to={to} delay={0.3 + i * 0.5} />
                })}
            </g>
          )}

          {/* the pods */}
          {pods.map((p) => {
            const placed = p.id !== 'd' || dPlaced
            return (
              <motion.g key={`${p.id}-${g.name}`} initial={false} animate={{ x: p.pos[0], y: p.pos[1] }} transition={{ duration: reduce ? 0 : 1.1, ease: [0.5, 0, 0.3, 1] }}>
                <Pod g={g} v={p.v} state={p.state} restarts={bRestarts} seed={p.seed} ready={p.ready} port={placed ? (nodeOf(p.pos) === 0 ? 'bottom' : 'top') : null} />
              </motion.g>
            )
          })}
          {bFlash && (
            <g transform={`translate(${g.slots[0][1][0] + g.pod.w / 2} ${g.slots[0][1][1] + 42})`}>
              <Cross x={0} y={0} size={22} seed={4601} strokeWidth={3} />
            </g>
          )}
          {!dPlaced && (
            <text x={g.pending[0] + g.pod.w / 2} y={g.pending[1] - 12} textAnchor="middle" className={s.svgHand} style={{ fontSize: g.hand, fill: 'var(--pen)' }}>
              novi Pod (v2)
            </text>
          )}

          {/* the step's note sits next to what changes */}
          <AnimatePresence mode="wait">
            <StoryNote key={`${shownPhase}-${g.name}-${run}`} note={g.callouts[shownPhase]} phase={shownPhase} g={g} />
          </AnimatePresence>

          {/* Rosetta: the canteen story → Kubernetes words (wide drawing; narrower ones show it in the legend) */}
          {g.rosetta && (
            <g transform={`translate(${g.rosetta[0]} ${g.rosetta[1]})`}>
              <Redar x={44} y={92} scale={0.62} angle={-0.9} />
              <g transform="translate(64 6) rotate(-12)">
                <ServiceTag x={0} y={0} w={78} h={30} small />
                <text x={24} y={20} className={s.svgDisplay} style={{ fontSize: 13 }}>
                  Service
                </text>
              </g>
              <text x={118} y={58} className={s.svgHand} style={{ fontSize: 21, fill: 'var(--pen)' }}>
                rječnik menze:
              </text>
              {[
                ['redar', 'Service'],
                ['pult', 'Pod'],
                ['zgrada menze', 'čvor'],
              ].map(([a, b], i) => (
                <text key={a} x={118} y={84 + i * 23} className={s.svgHand} style={{ fontSize: 20, fill: 'var(--ink)' }}>
                  {a} <tspan style={{ fill: 'var(--ink-3)' }}>=</tspan> <tspan style={{ fill: 'var(--red)' }}>{b}</tspan>
                </text>
              ))}
            </g>
          )}
        </svg>
      </div>
      <div className={c.caption}>
        <div className={c.capTop}>
          <span className={c.capStep}>
            Korak {shownPhase + 1} / {STORY.length}
          </span>
          <div className={c.dots} role="group" aria-label="Koraci priče">
            {STORY.map((st, i) => (
              <button key={st.title} type="button" className={c.dot} aria-label={`Korak ${i + 1}: ${st.title}`} aria-current={i === shownPhase ? 'step' : undefined} onClick={() => goTo(i)}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <Rough
                    shape={{ k: 'ellipse', cx: 12, cy: 12, w: 18, h: 18 }}
                    seed={4760 + i}
                    strokeWidth={1.6}
                    stroke={i === shownPhase ? 'var(--red)' : 'var(--ink-2)'}
                    fillColor={i <= shownPhase ? 'var(--red)' : undefined}
                    fillStyle="hachure"
                    hachureGap={2.6}
                  />
                </svg>
              </button>
            ))}
          </div>
        </div>
        <AnimatePresence mode="wait">
          <motion.p key={shownPhase} aria-live="polite" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.22 }}>
            <b>{STORY[shownPhase].title}.</b> {STORY[shownPhase].text}
          </motion.p>
        </AnimatePresence>
        <div className={c.capCtl}>
          <button type="button" className={c.btn} onClick={() => goTo(shownPhase - 1)} disabled={shownPhase === 0}>
            ← Natrag
          </button>
          <button type="button" className={`${c.btn} ${c.btnMain}`} onClick={() => goTo(shownPhase + 1)} disabled={shownPhase === STORY.length - 1}>
            Dalje →
          </button>
          <button
            type="button"
            className={c.btn}
            onClick={() => {
              setPhase(0)
              setAuto(true)
              setRun((r) => r + 1)
            }}
          >
            ↺ Ponovi
          </button>
        </div>
      </div>
    </div>
  )
}

export function ClusterSection() {
  return (
    <section className={`${s.section} ${s.secTorn}`} aria-labelledby="klaster-title">
      <div className={c.torn}>
        <span className={c.staple} style={{ left: '12%' }} aria-hidden="true" />
        <span className={c.staple} style={{ right: '12%' }} aria-hidden="true" />
        <SecHead n="3" kicker="pogled unaprijed (modul 3)" title="Isto to, ali u Kubernetesu" id="klaster-title" prop={<PropHelm />} />
        <p className={s.lede}>
          U Kubernetesu redar se zove <Mark c="green">Service</Mark>. On ne zna imena poslužitelja, nego bira Podove po oznaci (<code className={c.code}>app=klopa-api</code>) i
          promet šalje samo onima koji su spremni.
        </p>
        <Scene />
        <ul className={c.legend} aria-label="Legenda stanja">
          <li>
            <span className={c.lgBox} data-k="run" /> Running: radi i prima promet
          </li>
          <li>
            <span className={c.lgBox} data-k="pend" /> Pending: čeka da ga scheduler smjesti
          </li>
          <li>
            <span className={c.lgBox} data-k="crash" /> CrashLoopBackOff: pada, pa se ponovo pokreće sve sporije
          </li>
          <li>
            <span className={c.lgTape} data-v="v1">
              v1
            </span>
            <span className={c.lgTape} data-v="v2">
              v2
            </span>{' '}
            verzija aplikacije
          </li>
          <li>
            <span className={c.lgPort} /> priključak: tu Service šalje promet
          </li>
          <li className={c.lgRosetta}>
            rječnik menze: redar = <b>Service</b> · pult = <b>Pod</b> · zgrada menze = <b>čvor</b>
          </li>
        </ul>
      </div>
    </section>
  )
}
