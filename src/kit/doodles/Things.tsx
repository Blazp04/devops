import { useId, type ReactNode } from 'react'
import { Check, Cross, Rough } from '../sketch/Sketch'
import type { Pt } from '../sketch/roughGen'
import type { AppVersion, BubbleTone, LunchboxState, ServerMood } from './types'

/* =====================================================================
   Things from the illustration grammar (all SVG, used inside an <svg>).
   Tray = request · Redar = load balancer (Characters.tsx) · server card
   with a face · brain = CPU core · plate = RAM slot · lunchbox = Pod ·
   luggage tag = Service · envelope with a wax seal = Secret · laptop =
   terminal · cylinder = database / etcd · helm = Kubernetes.
   ===================================================================== */

const TONE: Record<BubbleTone, string> = { ink: 'var(--ink)', red: 'var(--red)', pen: 'var(--pen)', green: 'var(--green)' }

/**
 * Server face: calm → busy → panic → dead, drawn in a round "porthole" (≈ 44 px at r = 22). Local centre (0, 0).
 * It is the first thing to read on a server card, so keep it ≥ 36 px on screen.
 */
export function ServerFace({ mood, r = 22 }: { mood: ServerMood; r?: number }) {
  const k = r / 22
  const ring = (
    <Rough
      shape={{ k: 'ellipse', cx: 0, cy: 0, w: 44, h: 41.8 }}
      seed={600}
      strokeWidth={1.7}
      stroke={mood === 'dead' ? 'var(--red)' : 'var(--ink)'}
      fillColor="var(--paper)"
      fillStyle="solid"
      roughness={0.9}
    />
  )
  if (mood === 'dead')
    return (
      <g transform={`scale(${k})`}>
        {ring}
        <Rough shape={{ k: 'line', x1: -13, y1: -9, x2: -4, y2: 0 }} seed={601} strokeWidth={2.2} stroke="var(--red)" />
        <Rough shape={{ k: 'line', x1: -4, y1: -9, x2: -13, y2: 0 }} seed={602} strokeWidth={2.2} stroke="var(--red)" />
        <Rough shape={{ k: 'line', x1: 4, y1: -9, x2: 13, y2: 0 }} seed={603} strokeWidth={2.2} stroke="var(--red)" />
        <Rough shape={{ k: 'line', x1: 13, y1: -9, x2: 4, y2: 0 }} seed={604} strokeWidth={2.2} stroke="var(--red)" />
        <Rough shape={{ k: 'lin', pts: [[-9, 10], [-4.5, 7], [0, 10], [4.5, 7], [9, 10]] }} seed={605} strokeWidth={1.8} stroke="var(--red)" />
      </g>
    )
  return (
    <g transform={`scale(${k})`}>
      {ring}
      <g className={mood === 'panic' ? 'k-shake' : undefined}>
        {mood === 'panic' ? (
          <>
            <circle cx={-7.5} cy={-4} r={4.2} className="k-eye-white" />
            <circle cx={7.5} cy={-4} r={4.2} className="k-eye-white" />
            <circle cx={-7} cy={-3.5} r={1.7} className="k-ink-fill" />
            <circle cx={8} cy={-3.5} r={1.7} className="k-ink-fill" />
          </>
        ) : (
          <>
            <circle cx={-7.5} cy={-3} r={2.5} className="k-ink-fill" />
            <circle cx={7.5} cy={-3} r={2.5} className="k-ink-fill" />
          </>
        )}
        {mood !== 'calm' && (
          <>
            <Rough shape={{ k: 'line', x1: -12, y1: mood === 'panic' ? -13 : -9, x2: -4, y2: -11 }} seed={611} strokeWidth={1.6} roughness={0.5} />
            <Rough shape={{ k: 'line', x1: 4, y1: -11, x2: 12, y2: mood === 'panic' ? -13 : -9 }} seed={612} strokeWidth={1.6} roughness={0.5} />
          </>
        )}
        {mood === 'calm' && <Rough shape={{ k: 'curve', pts: [[-8, 5], [0, 11], [8, 5]] }} seed={606} strokeWidth={1.9} roughness={0.5} />}
        {mood === 'busy' && <Rough shape={{ k: 'lin', pts: [[-7, 9], [-2, 7.5], [3, 9.5], [7, 8]] }} seed={607} strokeWidth={1.8} roughness={0.5} />}
        {mood === 'panic' && <Rough shape={{ k: 'ellipse', cx: 0, cy: 9, w: 9, h: 8 }} seed={608} strokeWidth={1.6} fillColor="var(--ink)" fillStyle="solid" />}
      </g>
      {mood !== 'calm' && <Rough shape={{ k: 'path', d: 'M25 -14 Q20 -5 25 -2 Q30 -5 25 -14 Z' }} seed={609} strokeWidth={1.3} stroke="var(--pen)" fillColor="var(--hl-blue-ink)" fillStyle="solid" />}
      {mood === 'panic' && <Rough shape={{ k: 'path', d: 'M-26 -10 Q-31 -1 -26 2 Q-21 -1 -26 -10 Z' }} seed={610} strokeWidth={1.3} stroke="var(--pen)" fillColor="var(--hl-blue-ink)" fillStyle="solid" />}
    </g>
  )
}

/**
 * A simple server card: paper box, face porthole, a pencil "shelf" line and a status dot. For the full simulation
 * card (brains per core, plates per RAM slot, queue slots) compose `Brain`, `Plate` and `ServerFace` yourself.
 */
export function ServerCard({
  x,
  y,
  w,
  h,
  mood = 'calm',
  label,
  seed = 1110,
  down,
}: {
  x: number
  y: number
  w: number
  h: number
  mood?: ServerMood
  /** handwritten name above the card */
  label?: string
  seed?: number
  /** crashed: red outline and a SRUŠEN stamp */
  down?: boolean
}) {
  const face: ServerMood = down ? 'dead' : mood
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} strokeWidth={1.8} stroke={down ? 'var(--red)' : 'var(--ink)'} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'line', x1: x + 8, y1: y + h - 14, x2: x + w - 8, y2: y + h - 14 }} seed={seed + 1} strokeWidth={1.2} />
      <circle cx={x + w - 14} cy={y + h - 7} r={2.2} style={{ fill: down || mood === 'panic' ? 'var(--red)' : 'var(--green)' }} />
      <g transform={`translate(${x + w / 2} ${y + h / 2 - 6})`}>
        <ServerFace mood={face} r={Math.max(10, Math.min(22, Math.min(w, h) * 0.2))} />
      </g>
      {label && (
        <text x={x + w / 2} y={y - 7} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 19 }}>
          {label}
        </text>
      )}
      {down && <SvgStamp x={x + w / 2} y={y + h * 0.72} text="SRUŠEN" size={Math.max(12, Math.min(18, w / 6))} />}
    </g>
  )
}

const BRAIN: Pt[] = [
  [3, 15],
  [1, 9],
  [4, 4],
  [9, 1.5],
  [13, 4],
  [17, 1.5],
  [22, 3.5],
  [25, 9],
  [24, 15],
  [20, 20],
  [13, 18.5],
  [7, 20.5],
  [3, 15],
]

/**
 * One CPU core = one drawn brain (box x, y, w, h). `busy` (0..1) hatches it from the bottom up with the pink marker.
 * Hatched = busy; the outline never changes, so the reader compares fill heights.
 */
export function Brain({ x, y, w = 26, h = 22, busy = 0, seed = 3001 }: { x: number; y: number; w?: number; h?: number; busy?: number; seed?: number }) {
  const id = useId().replace(/:/g, '')
  const sx = w / 26
  const sy = h / 22
  const pts = BRAIN.map(([px, py]) => [x + px * sx, y + py * sy] as Pt)
  const f = Math.max(0, Math.min(1, busy))
  return (
    <g>
      <defs>
        <clipPath id={`k-brain-${id}`}>
          <ellipse cx={x + w / 2} cy={y + h / 2 + 0.5} rx={w / 2 - 0.5} ry={h / 2 - 1} />
        </clipPath>
      </defs>
      {f > 0.02 && (
        <g clipPath={`url(#k-brain-${id})`}>
          <rect x={x} y={y + h * (1 - f)} width={w} height={h * f} className="k-brain-fill" />
        </g>
      )}
      <Rough shape={{ k: 'curve', pts }} seed={seed} strokeWidth={1.4} roughness={0.7} />
      <Rough shape={{ k: 'curve', pts: [[x + w / 2, y + 4 * sy], [x + w / 2 - 1, y + h / 2], [x + w / 2 + 1, y + h - 3 * sy]] }} seed={seed + 10} strokeWidth={1} roughness={0.5} />
    </g>
  )
}

/** One RAM slot = a plate (centre cx, cy). `full` = food on the plate = a request being processed. */
export function Plate({ cx, cy, r = 11, full }: { cx: number; cy: number; r?: number; full?: boolean }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} className="k-plate" />
      <circle cx={cx} cy={cy} r={r * 0.62} className="k-plate-rim" />
      {full && <circle cx={cx} cy={cy} r={r * 0.5} className="k-food" />}
    </g>
  )
}

/**
 * Shared SVG defs for drawings with many requests: `#<id>-tray` (one request, a <symbol> to `<use>`) and
 * `#<id>-hatch` (pencil hatch pattern). Ids are prefixed per drawing, e.g. `<TrayDefs id="lb" />` → `#lb-tray`.
 * Draw a tray: `<use href="#lb-tray" x={x - 18} y={y - 12} width={36} height={24} />` (≈ 36 px in sims).
 */
export function TrayDefs({ id }: { id: string }) {
  return (
    <defs>
      <symbol id={`${id}-tray`} viewBox="-10 -7 20 14" overflow="visible">
        <path d="M-9 -2.5 L9 -3 L7.5 3.2 L-7.5 3.5 Z" className="k-tray-body" />
        <ellipse cx={-2} cy={-2.6} rx={3.6} ry={1.7} className="k-tray-plate" />
        <rect x={3} y={-5.4} width={3} height={3.4} rx={0.6} className="k-tray-cup" />
      </symbol>
      <pattern id={`${id}-hatch`} width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(-41)">
        <line x1={0} y1={0} x2={0} y2={4} className="k-hatch-line" />
      </pattern>
    </defs>
  )
}

/** One request: the orange tray with a plate and a cup, centred on (x, y), `w` wide (default 36). No defs needed. */
export function Tray({ x, y, w = 36, rotate = 0 }: { x: number; y: number; w?: number; rotate?: number }) {
  const k = w / 20
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${k})`}>
      <path d="M-9 -2.5 L9 -3 L7.5 3.2 L-7.5 3.5 Z" className="k-tray-body" />
      <ellipse cx={-2} cy={-2.6} rx={3.6} ry={1.7} className="k-tray-plate" />
      <rect x={3} y={-5.4} width={3} height={3.4} rx={0.6} className="k-tray-cup" />
    </g>
  )
}

/**
 * Speech bubble: an ellipse that grows to hold its words + a short, curved wedge tail aimed at the speaker's mouth
 * (tx, ty). The tail never reaches the mouth (max `tail` units), so the bubble sits close to the head, like a comic.
 * Lines are written in Kalam (the characters' voice), centred, `size` units. Keep it short: 1–3 lines.
 */
export function SpeechBubble({
  x,
  y,
  w,
  h,
  tx,
  ty,
  lines,
  size = 20,
  seed = 21,
  tail = 18,
  tone = 'ink',
}: {
  /** box the bubble is centred in (it grows if the words need more room) */
  x: number
  y: number
  w: number
  h: number
  /** the speaker's mouth */
  tx: number
  ty: number
  lines: string[]
  size?: number
  seed?: number
  tail?: number
  tone?: BubbleTone
}) {
  const cx = x + w / 2
  const cy = y + h / 2
  // line step: Kalam's line box is ≈ 1,2 em, so the lines' boxes never overlap
  const lh = size * 1.22
  const tw = Math.max(...lines.map((l) => l.length)) * size * 0.48
  const th = (lines.length - 1) * lh + size * 0.85
  const rx = Math.max(w, tw * 1.34 + 12) / 2
  const ry = Math.max(h, th * 1.42 + 12) / 2
  const a = Math.atan2(ty - cy, tx - cx)
  const edge = (ang: number, k = 1): Pt => {
    const r = 1 / Math.sqrt((Math.cos(ang) / rx) ** 2 + (Math.sin(ang) / ry) ** 2)
    return [cx + Math.cos(ang) * r * k, cy + Math.sin(ang) * r * k]
  }
  const e = edge(a)
  const len = Math.max(6, Math.min(tail, Math.hypot(tx - e[0], ty - e[1]) - 6))
  const tip: Pt = [e[0] + Math.cos(a) * len, e[1] + Math.sin(a) * len]
  const spread = Math.min(0.32, 14 / Math.max(rx, ry))
  const b1 = edge(a - spread, 0.9)
  const b2 = edge(a + spread, 0.9)
  const bend = (p: Pt, k: number): Pt => [(p[0] + tip[0]) / 2 - Math.sin(a) * k, (p[1] + tip[1]) / 2 + Math.cos(a) * k]
  const c1 = bend(b1, 3)
  const c2 = bend(b2, 3)
  const d = `M${b1[0]} ${b1[1]} Q${c1[0]} ${c1[1]} ${tip[0]} ${tip[1]} Q${c2[0]} ${c2[1]} ${b2[0]} ${b2[1]}`
  const top = cy - ((lines.length - 1) * lh) / 2 + size * 0.34
  return (
    <g>
      <Rough shape={{ k: 'ellipse', cx, cy, w: rx * 2, h: ry * 2 }} seed={seed} strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" roughness={0.9} />
      <Rough shape={{ k: 'path', d }} seed={seed + 1} strokeWidth={1.5} fillColor="var(--paper)" fillStyle="solid" roughness={0.6} />
      {/* one text with a line per tspan: read as one sentence, laid out as the bubble's lines */}
      <text textAnchor="middle" className="k-svg-print" style={{ fontSize: size, fill: TONE[tone] }}>
        {lines.map((l, i) => (
          <tspan key={i} x={cx} y={top + i * lh}>
            {l}
          </tspan>
        ))}
      </text>
    </g>
  )
}

/** The Kubernetes helm wheel, drawn by hand (brand mark, control plane, module 3). Centre (x, y). */
export function Helm({ x, y, r = 14, stroke = 'var(--pen)', seed = 801 }: { x: number; y: number; r?: number; stroke?: string; seed?: number }) {
  const spokes = Array.from({ length: 7 }, (_, i) => {
    const a = (i / 7) * Math.PI * 2 - Math.PI / 2
    return { x1: x + Math.cos(a) * r * 0.35, y1: y + Math.sin(a) * r * 0.35, x2: x + Math.cos(a) * r * 1.25, y2: y + Math.sin(a) * r * 1.25 }
  })
  return (
    <g>
      <Rough shape={{ k: 'ellipse', cx: x, cy: y, w: r * 2, h: r * 2 }} seed={seed} stroke={stroke} strokeWidth={1.8} />
      <Rough shape={{ k: 'ellipse', cx: x, cy: y, w: r * 0.7, h: r * 0.7 }} seed={seed + 1} stroke={stroke} strokeWidth={1.6} />
      {spokes.map((sp, i) => (
        <Rough key={i} shape={{ k: 'line', ...sp }} seed={seed + 2 + i} stroke={stroke} strokeWidth={1.6} roughness={0.6} />
      ))}
    </g>
  )
}

/**
 * Secret = a closed envelope with a red wax seal (box x, y, w, h). The content is never shown as text: at most
 * `dots` (••••). `open` draws the flap up (the secret was read / mounted).
 */
export function Envelope({ x, y, w = 56, h = 38, open, dots, seed = 1801, label }: { x: number; y: number; w?: number; h?: number; open?: boolean; dots?: boolean; seed?: number; label?: string }) {
  return (
    <g>
      {open && <Rough shape={{ k: 'poly', pts: [[x, y], [x + w / 2, y - h * 0.55], [x + w, y]] }} seed={seed + 4} strokeWidth={1.5} fillColor="var(--paper-2)" fillStyle="solid" />}
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} strokeWidth={1.7} fillColor="var(--paper)" fillStyle="solid" />
      {!open && <Rough shape={{ k: 'lin', pts: [[x + 2, y + 2], [x + w / 2, y + h * 0.58], [x + w - 2, y + 2]] }} seed={seed + 1} strokeWidth={1.4} />}
      <Rough shape={{ k: 'lin', pts: [[x + 2, y + h - 2], [x + w * 0.36, y + h * 0.5]] }} seed={seed + 2} strokeWidth={1} stroke="var(--ink-3)" />
      <Rough shape={{ k: 'lin', pts: [[x + w - 2, y + h - 2], [x + w * 0.64, y + h * 0.5]] }} seed={seed + 3} strokeWidth={1} stroke="var(--ink-3)" />
      {!open && (
        <g>
          <Rough shape={{ k: 'ellipse', cx: x + w / 2, cy: y + h * 0.58, w: Math.min(16, w * 0.3), h: Math.min(15, w * 0.28) }} seed={seed + 5} strokeWidth={1.4} stroke="var(--red)" fillColor="var(--red)" fillStyle="solid" />
          <circle cx={x + w / 2} cy={y + h * 0.58} r={Math.min(3.4, w * 0.06)} className="k-seal-dot" />
        </g>
      )}
      {dots && (
        <text x={x + w / 2} y={y + h + 16} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 14, fill: 'var(--ink-2)' }}>
          ••••
        </text>
      )}
      {label && (
        <text x={x + w / 2} y={y - 6} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 17, fill: 'var(--ink-2)' }}>
          {label}
        </text>
      )}
    </g>
  )
}

/**
 * Pod = a lunchbox with a handle (box x, y, w, h; default 40 × 30). Version by a strip of tape and hatching direction
 * (v1 blue −41°, v2 green +41°); state by line: running = solid + smile, pending = dashed and pale, crash = red with
 * red hatching and X eyes. `name` is written on the lid in mono; `face` adds the little face (≥ 56 px wide).
 */
export function Lunchbox({
  x,
  y,
  w = 40,
  h = 30,
  version = 'v1',
  state = 'running',
  name,
  face,
  tape = true,
  ready,
  seed = 1310,
}: {
  x: number
  y: number
  w?: number
  h?: number
  version?: AppVersion
  state?: LunchboxState
  name?: string
  face?: boolean
  /** show the version tape in the corner */
  tape?: boolean
  /** green ✓ in the corner = ready to receive traffic */
  ready?: boolean
  seed?: number
}) {
  const crash = state === 'crash'
  const pend = state === 'pending'
  const stroke = crash ? 'var(--red)' : 'var(--ink)'
  const tint = version === 'v1' ? 'var(--hl-blue-ink)' : 'var(--hl-green-ink)'
  const top = name ? 14 : 0
  return (
    <g className={pend ? 'k-pending' : undefined}>
      <Rough shape={{ k: 'arc', cx: x + w / 2, cy: y + 2, w: Math.min(26, w * 0.4), h: Math.min(16, w * 0.3), start: Math.PI, stop: Math.PI * 2 }} seed={seed} strokeWidth={1.6} stroke={stroke} />
      <Rough
        shape={{ k: 'rect', x, y: y + 2, w, h }}
        seed={seed + 1}
        strokeWidth={1.7}
        stroke={stroke}
        fillColor={crash ? 'var(--red)' : tint}
        hachureGap={crash ? 3 : 5}
        fillWeight={crash ? 1.1 : 0.8}
        hachureAngle={version === 'v1' ? -41 : 41}
        dash={pend ? '5 4' : undefined}
      />
      {name && (
        <text x={x + 6} y={y + 15} className="k-svg-mono" style={{ fontSize: 12.5, fontWeight: 600 }}>
          {name}
        </text>
      )}
      {face && (
        <g transform={`translate(${x + w / 2} ${y + 2 + top + (h - top) / 2})`}>
          <rect x={-15} y={-10} width={30} height={20} rx={4} className="k-face-bg" />
          {crash ? (
            <g>
              <Rough shape={{ k: 'line', x1: -9, y1: -4, x2: -3, y2: 2 }} seed={seed + 6} stroke="var(--red)" strokeWidth={1.8} />
              <Rough shape={{ k: 'line', x1: -3, y1: -4, x2: -9, y2: 2 }} seed={seed + 7} stroke="var(--red)" strokeWidth={1.8} />
              <Rough shape={{ k: 'line', x1: 3, y1: -4, x2: 9, y2: 2 }} seed={seed + 8} stroke="var(--red)" strokeWidth={1.8} />
              <Rough shape={{ k: 'line', x1: 9, y1: -4, x2: 3, y2: 2 }} seed={seed + 9} stroke="var(--red)" strokeWidth={1.8} />
            </g>
          ) : pend ? (
            <g>
              <Rough shape={{ k: 'line', x1: -9, y1: -1, x2: -3, y2: -1 }} seed={seed + 6} strokeWidth={1.6} />
              <Rough shape={{ k: 'line', x1: 3, y1: -1, x2: 9, y2: -1 }} seed={seed + 7} strokeWidth={1.6} />
            </g>
          ) : (
            <g>
              <circle cx={-6} cy={-2} r={2} className="k-ink-fill" />
              <circle cx={6} cy={-2} r={2} className="k-ink-fill" />
              <Rough shape={{ k: 'curve', pts: [[-5, 3], [0, 7], [5, 3]] }} seed={seed + 6} strokeWidth={1.5} roughness={0.5} />
            </g>
          )}
        </g>
      )}
      {!face && !crash && !name && (
        <text x={x + w / 2} y={y + 2 + h / 2 + 5} textAnchor="middle" className="k-svg-mono" style={{ fontSize: Math.min(15.5, h * 0.5), fontWeight: 600 }}>
          {version}
        </text>
      )}
      {tape && (face || name) && (
        <g transform={`rotate(6 ${x + w - 16} ${y + 4})`}>
          <rect x={x + w - 32} y={y - 6} width={30} height={14} className={version === 'v1' ? 'k-vtape k-vtape--v1' : 'k-vtape k-vtape--v2'} />
          <text x={x + w - 17} y={y + 5} textAnchor="middle" className="k-vtape-text" style={{ fontSize: 11.5 }}>
            {version}
          </text>
        </g>
      )}
      {crash && <Cross x={x + w / 2} y={y + 2 + h / 2} size={Math.min(9, h * 0.3)} seed={seed + 12} />}
      {ready && !crash && !pend && <Check x={x + w - 8} y={y + h - 4} size={6} seed={seed + 13} />}
    </g>
  )
}

/** Service = a luggage tag with a hole (box x, y, w, h); the point is on the left. Write the name inside. */
export function ServiceTag({ x, y, w = 110, h = 44, seed = 4501, children }: { x: number; y: number; w?: number; h?: number; seed?: number; children?: ReactNode }) {
  const nose = Math.min(18, h * 0.42)
  return (
    <g>
      <Rough shape={{ k: 'path', d: `M${x + nose} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x + nose} ${y + h} L${x} ${y + h / 2} Z` }} seed={seed} strokeWidth={1.9} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'ellipse', cx: x + nose - 2, cy: y + h / 2, w: Math.min(10, h * 0.22), h: Math.min(10, h * 0.22) }} seed={seed + 1} strokeWidth={1.4} />
      {children}
    </g>
  )
}

/** Lana's laptop as a small doodle (box x, y, w; screen ≈ 0.62 w tall). `screen` content is drawn in screen space. */
export function Laptop({ x, y, w = 120, sticker = 'Klopa', screen, seed = 951 }: { x: number; y: number; w?: number; sticker?: string; screen?: ReactNode; seed?: number }) {
  const sh = w * 0.62
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h: sh }} seed={seed} strokeWidth={1.9} fillColor="var(--bezel)" fillStyle="solid" />
      <rect x={x + w * 0.05} y={y + sh * 0.08} width={w * 0.9} height={sh * 0.82} rx={2} className="k-laptop-screen" />
      <circle cx={x + w / 2} cy={y + sh * 0.045} r={1.4} className="k-laptop-cam" />
      <g transform={`translate(${x + w * 0.05} ${y + sh * 0.08})`}>{screen}</g>
      <Rough shape={{ k: 'path', d: `M${x - w * 0.06} ${y + sh + 9} L${x + w * 1.06} ${y + sh + 9} L${x + w} ${y + sh} L${x} ${y + sh} Z` }} seed={seed + 1} strokeWidth={1.7} fillColor="var(--paper-2)" fillStyle="solid" />
      <Rough shape={{ k: 'rect', x: x + w / 2 - w * 0.12, y: y + sh + 2, w: w * 0.24, h: 5 }} seed={seed + 2} strokeWidth={1} stroke="var(--ink-2)" />
      {sticker && (
        // a brand sticker (decoration, not information): hidden from screen readers and the legibility check
        <g transform={`rotate(-6 ${x + 18} ${y + sh - 4})`} aria-hidden="true">
          <rect x={x + 6} y={y + sh - 12} width={sticker.length * 7 + 10} height={13} rx={4} className="k-laptop-sticker" />
          <text x={x + 11} y={y + sh - 2} className="k-svg-hand" style={{ fontSize: 12, fill: 'var(--note-ink)' }}>
            {sticker}
          </text>
        </g>
      )}
    </g>
  )
}

/** Database / etcd = a hand-drawn cylinder (box x, y, w, h) with an optional label inside (`labelSize`, default 13 units). */
export function Cylinder({ x, y, w = 56, h = 60, label, labelSize = 13, seed = 1901, fillColor }: { x: number; y: number; w?: number; h?: number; label?: string; labelSize?: number; seed?: number; fillColor?: string }) {
  const ry = Math.min(9, w * 0.16)
  return (
    <g>
      <Rough shape={{ k: 'path', d: `M${x} ${y + ry} L${x} ${y + h - ry} Q${x + w / 2} ${y + h + ry} ${x + w} ${y + h - ry} L${x + w} ${y + ry}` }} seed={seed} strokeWidth={1.8} fillColor={fillColor ?? 'var(--paper)'} fillStyle={fillColor ? 'hachure' : 'solid'} hachureGap={4.5} />
      <Rough shape={{ k: 'ellipse', cx: x + w / 2, cy: y + ry, w, h: ry * 2 }} seed={seed + 1} strokeWidth={1.8} fillColor="var(--paper)" fillStyle="solid" />
      {label && (
        <text x={x + w / 2} y={y + h / 2 + ry * 0.9} textAnchor="middle" className="k-svg-mono" style={{ fontSize: labelSize, fontWeight: 600 }}>
          {label}
        </text>
      )}
    </g>
  )
}

/** A rubber stamp inside SVG (SRUŠEN, OK, 504…), centred on (x, y), on a paper patch so it always reads. */
export function SvgStamp({ x, y, text, tone = 'red', size = 18, rotate = -7 }: { x: number; y: number; text: string; tone?: BubbleTone; size?: number; rotate?: number }) {
  const w = text.length * size * 0.78 + size * 1.2
  const h = size * 1.6
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} className="k-svg-stamp-bg" style={{ stroke: TONE[tone] }} />
      <text textAnchor="middle" y={size * 0.36} className="k-svg-stamp" style={{ fontSize: size, fill: TONE[tone] }}>
        {text}
      </text>
    </g>
  )
}

/** A coffee-mug ring stain on paper (a chalk smudge on the board). Local box 100 × 100. */
export function CoffeeRing({ seed = 861 }: { seed?: number }) {
  return (
    <g className="k-coffee">
      <Rough shape={{ k: 'ellipse', cx: 50, cy: 50, w: 88, h: 84 }} seed={seed} strokeWidth={5} roughness={1.6} stroke="var(--coffee)" />
      <Rough shape={{ k: 'arc', cx: 50, cy: 50, w: 80, h: 76, start: 0.6, stop: 3.4 }} seed={seed + 1} strokeWidth={2} roughness={1.4} stroke="var(--coffee)" />
    </g>
  )
}

/** Tiny doodled clock as its own <svg> (26 × 26 viewBox; size it with CSS) — durations, timeouts. */
export function ClockIcon({ seed = 4, className }: { seed?: number; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 26 26" aria-hidden="true">
      <Rough shape={{ k: 'ellipse', cx: 13, cy: 13, w: 22, h: 22 }} seed={seed} strokeWidth={1.6} />
      <Rough shape={{ k: 'lin', pts: [[13, 6], [13, 13], [18, 16]] }} seed={seed + 1} strokeWidth={1.6} roughness={0.5} />
    </svg>
  )
}
