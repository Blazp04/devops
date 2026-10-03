import { memo, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import type { LucideIcon } from 'lucide-react'
import { Check, Cross, Rough } from '../sketch/Sketch'
import { hashSeed, type Pt, type Shape } from '../sketch/roughGen'
import { NodeGlyph } from './Glyphs'
import { GLYPH_ASPECT, isGlyphKind, type GlyphKind } from './glyph-kinds'
import { clickableProps, curveControl, DIAGRAM_TONES, DiagramClickCtx, DiagramCtx, DiagramScaleCtx, edgePath, fillOf, markerOf, pathTimes, pointAt, strokeOf, trayFillOf, useDiagramIds, useSvgId, type DiagramTone } from './helpers'

/**
 * SVG diagram primitives in the notebook's hand (src/design-lab/biljeznica/README.md):
 *   boxes and lines are drawn with the pencil (roughjs), a request is the orange TRAY travelling at constant speed,
 *   healthy = green, failing = red pencil + ✗, idle = faint graphite, groups (machine / node / namespace) = dashed frames
 *   with a handwritten (Caveat) label. Icons are doodles: server = card with a face, users = students, lb = the redar…
 * Coordinates are in the Diagram's viewBox units; nodes are positioned by their CENTER.
 */

interface DiagramProps {
  width: number
  height: number
  children: ReactNode
  /** Accessible description of what the diagram shows (Croatian). */
  label: string
  className?: string
  /** Max rendered height in px (diagram scales down to fit). */
  maxHeight?: number
  /** role=group instead of img. Automatic when a DNode / PodShape inside has onClick; set it for your own controls. */
  interactive?: boolean
}

/**
 * Shared defs every Diagram carries (ids are unique per diagram; read them with `useDiagramIds()`):
 * the tray symbol (one request), pencil hatch patterns at −41° / +41°, red, v1 and v2 hatching, and hand-drawn
 * open arrowhead markers per tone for plain <path>/<polyline> lines. Use it in your own <svg> with `diagramIds(id)`.
 */
export function DiagramDefs({ id }: { id: string }) {
  const hatch = (suffix: string, angle: number, color: string, gap = 5, width = 1.1) => (
    <pattern id={`${id}-${suffix}`} width={gap} height={gap} patternUnits="userSpaceOnUse" patternTransform={`rotate(${angle})`}>
      <line x1={0} y1={0} x2={0} y2={gap} style={{ stroke: color, strokeWidth: width }} />
    </pattern>
  )
  return (
    <defs>
      <symbol id={`${id}-tray`} viewBox="-10 -7 20 14" overflow="visible">
        <path d="M-9 -2.5 L9 -3 L7.5 3.2 L-7.5 3.5 Z" className="k-dtray-body" />
        <ellipse cx={-2} cy={-2.6} rx={3.6} ry={1.7} className="k-tray-plate" />
        <rect x={3} y={-5.4} width={3} height={3.4} rx={0.6} className="k-tray-cup" />
      </symbol>
      {hatch('hatch', -41, 'var(--ink-3)')}
      {hatch('hatch-r', 41, 'var(--ink-3)')}
      {hatch('hatch-red', -41, 'var(--red)', 4, 1.2)}
      {hatch('hatch-v1', -41, 'var(--hl-blue-ink)', 5, 1.4)}
      {hatch('hatch-v2', 41, 'var(--hl-green-ink)', 5, 1.4)}
      {DIAGRAM_TONES.map((t) => (
        <marker key={t} id={`${id}-arrow-${t}`} viewBox="0 0 10 10" refX={8.6} refY={5} markerWidth={9} markerHeight={9} markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M1.3 1.2 Q4.6 3.3 8.8 5.1 Q5.1 6.9 1.5 8.9" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: t === 'neutral' ? 'var(--ink-3)' : strokeOf(t), strokeWidth: 1.6 }} />
        </marker>
      ))}
    </defs>
  )
}

/**
 * Tells kit pieces inside your own <svg> how large one viewBox unit is on screen (px per unit), so their lettering
 * stays legible (see `useDiagramScale`). <Diagram> does this by itself.
 *   <svg viewBox="0 0 720 400">…<DiagramScale value={width / 720}><PodShape … /></DiagramScale></svg>
 */
export function DiagramScale({ value, children }: { value: number | null; children: ReactNode }) {
  return <DiagramScaleCtx.Provider value={value}>{children}</DiagramScaleCtx.Provider>
}

/** On-screen px per viewBox unit of an <svg> (null until measured), re-measured on resize. */
function useSvgScale(vbW: number, vbH: number) {
  const ref = useRef<SVGSVGElement>(null)
  const [scale, setScale] = useState<number | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) return
      // preserveAspectRatio "meet": the drawing fits the smaller of the two ratios
      const s = Math.round(Math.min(r.width / vbW, r.height / vbH) * 1000) / 1000
      setScale((old) => (old === s ? old : s))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [vbW, vbH])
  return [ref, scale] as const
}

/** Responsive SVG canvas (viewBox) with the shared defs (tray, hatching, arrowheads). */
export function Diagram({ width, height, children, label, className, maxHeight, interactive }: DiagramProps) {
  const id = useSvgId('kd')
  const [clickable, setClickable] = useState(0)
  const [svgRef, scale] = useSvgScale(width, height)
  const register = useCallback(() => {
    setClickable((c) => c + 1)
    return () => setClickable((c) => c - 1)
  }, [])
  return (
    <svg
      ref={svgRef}
      className={`k-diagram${className ? ` ${className}` : ''}`}
      viewBox={`0 0 ${width} ${height}`}
      role={interactive || clickable > 0 ? 'group' : 'img'}
      aria-label={label}
      style={{ width: '100%', height: 'auto', maxHeight }}
    >
      <DiagramDefs id={id} />
      <DiagramClickCtx.Provider value={register}>
        <DiagramScaleCtx.Provider value={scale}>
          <DiagramCtx.Provider value={id}>{children}</DiagramCtx.Provider>
        </DiagramScaleCtx.Provider>
      </DiagramClickCtx.Provider>
    </svg>
  )
}

interface NodeProps {
  /** Center x */
  x: number
  /** Center y */
  y: number
  w?: number
  h?: number
  title?: ReactNode
  subtitle?: ReactNode
  /** a doodle from the grammar (see GLYPH_KINDS) or any lucide icon component */
  icon?: GlyphKind | LucideIcon
  tone?: DiagramTone
  /** Visual state: active = highlighted with a marker, down = red pencil + ✗, dim = faint */
  status?: 'normal' | 'active' | 'down' | 'dim'
  /** dashed pencil outline (desired state, a placeholder, "not decided yet") */
  dashed?: boolean
  /** Extra SVG drawn inside the node, positioned relative to the node's top-left */
  children?: ReactNode
  /** Makes the node a keyboard-accessible button (Enter / Space); name it with `ariaLabel` (default: the title). */
  onClick?: () => void
  ariaLabel?: string
  /** Animate position/appearance changes (default true) */
  animate?: boolean
}

/** The paper box of a node: outline, wash, marker halo (active), red hatching (down). Memoised (sims re-render often). */
const NodeSketch = memo(function NodeSketch({ w, h, tone, status, dashed, seed }: { w: number; h: number; tone: DiagramTone; status: NonNullable<NodeProps['status']>; dashed?: boolean; seed: number }) {
  const down = status === 'down'
  const active = status === 'active'
  const dim = status === 'dim'
  const stroke = down ? 'var(--red)' : dim ? 'var(--ink-3)' : tone === 'neutral' ? 'var(--ink)' : strokeOf(tone)
  return (
    <g>
      {active && <Rough shape={{ k: 'rect', x: -8, y: -7, w: w + 16, h: h + 14 }} seed={seed + 5} stroke="none" strokeWidth={0} fillColor="var(--hl-yellow)" fillStyle="solid" roughness={1.8} />}
      <Rough
        shape={{ k: 'rect', x: 0, y: 0, w, h }}
        seed={seed}
        stroke={stroke}
        strokeWidth={active ? 1.9 : 1.7}
        fillColor={down ? 'var(--paper)' : fillOf(tone)}
        fillStyle="solid"
        multi={active}
        dash={dashed || dim ? '6 5' : undefined}
        draw={dashed || dim ? undefined : true}
        duration={0.6}
      />
      {down && <Rough shape={{ k: 'rect', x: 4, y: 4, w: w - 8, h: h - 8 }} seed={seed + 7} stroke="none" strokeWidth={0} fillColor="var(--red)" hachureGap={9} fillWeight={0.9} className="k-dnode__wreck" />}
      {down && <Cross x={w - 13} y={12} size={6} seed={seed + 9} strokeWidth={2.2} />}
    </g>
  )
})

/** A box in a diagram: server, pod, service, students… drawn in pencil on paper, with a doodle as its icon. */
export function DNode({ x, y, w = 140, h = 64, title, subtitle, icon, tone = 'neutral', status = 'normal', dashed, children, onClick, ariaLabel, animate = true }: NodeProps) {
  const register = useContext(DiagramClickCtx)
  const clickable = !!onClick
  useEffect(() => (clickable && register ? register() : undefined), [clickable, register])
  const left = x - w / 2
  const top = y - h / 2
  const hasText = title !== undefined || subtitle !== undefined
  const gh = hasText ? Math.min(28, h * 0.52) : Math.min(46, h * 0.74)
  const gw = gh * GLYPH_ASPECT
  const gx = hasText ? 8 : w / 2 - gw / 2
  const gy = h / 2 - gh / 2
  const textX = icon ? gx + gw + 7 : 14
  const seed = hashSeed(`${typeof title === 'string' ? title : ''}|${w}|${h}`)
  const Lucide: LucideIcon | undefined = icon !== undefined && typeof icon !== 'string' ? icon : undefined
  const Wrapper = animate ? motion.g : 'g'
  // dim = a faint dashed outline and lighter text (no opacity: the lettering stays readable)
  const motionProps = animate
    ? {
        initial: false as const,
        animate: { x: left, y: top },
        transition: { type: 'spring' as const, stiffness: 260, damping: 30 },
      }
    : { transform: `translate(${left} ${top})` }

  return (
    <Wrapper {...motionProps} {...clickableProps(onClick, ariaLabel ?? (typeof title === 'string' ? title : undefined))} className={`k-dnode is-${status}${onClick ? ' is-clickable' : ''}`}>
      <NodeSketch w={w} h={h} tone={tone} status={status} dashed={dashed} seed={seed} />
      {isGlyphKind(icon) && <NodeGlyph kind={icon} x={gx} y={gy} w={gw} h={gh} tone={tone} down={status === 'down'} />}
      {Lucide && <Lucide x={gx + (gw - gh * 0.8) / 2} y={h / 2 - gh * 0.4} width={gh * 0.8} height={gh * 0.8} color={tone === 'neutral' ? 'var(--ink)' : strokeOf(tone)} strokeWidth={1.8} />}
      {title !== undefined && (
        <text x={textX} y={subtitle !== undefined ? h / 2 - 3 : h / 2 + 5} className="k-dnode__title" style={status === 'down' ? { fill: 'var(--red)' } : undefined}>
          {title}
        </text>
      )}
      {subtitle !== undefined && (
        <text x={textX} y={h / 2 + 14} className="k-dnode__subtitle">
          {subtitle}
        </text>
      )}
      {children}
    </Wrapper>
  )
}

interface EdgeProps {
  from: [number, number]
  to: [number, number]
  tone?: DiagramTone
  dashed?: boolean
  /** Flowing-dash animation to suggest traffic */
  flow?: boolean
  /** Curvature: 0 = straight; positive/negative bends to one side */
  curve?: number
  arrow?: boolean | 'both'
  label?: ReactNode
  width?: number
  opacity?: number
  /**
   * How a solid line appears: `true` (default) draws itself on when it scrolls into view, `'mount'` draws on right
   * away, `false` is simply there. A line that turns solid after mounting (dashed → solid) always draws on at once.
   */
  draw?: boolean | 'mount'
}

/** A two-stroke pen arrowhead at `tip`, pointing away from `back`. */
function Head({ tip, back, color, width, seed }: { tip: Pt; back: Pt; color: string; width: number; seed: number }) {
  const a = Math.atan2(tip[1] - back[1], tip[0] - back[0])
  const len = 8 + width * 1.2
  const h1: Pt = [tip[0] - len * Math.cos(a - 0.48), tip[1] - len * Math.sin(a - 0.48)]
  const h2: Pt = [tip[0] - len * Math.cos(a + 0.48), tip[1] - len * Math.sin(a + 0.48)]
  return <Rough shape={{ k: 'lin', pts: [h1, tip, h2] }} seed={seed} stroke={color} strokeWidth={Math.min(width, 2.4)} roughness={0.55} />
}

/** A pencil line between two points (graphite when neutral, coloured pencil otherwise) with a hand-drawn arrowhead. */
export function Edge({ from, to, tone = 'neutral', dashed, flow, curve = 0, arrow = true, label, width = 1.6, opacity = 1, draw = true }: EdgeProps) {
  const color = strokeOf(tone)
  const seed = hashSeed(`${from.join(',')}>${to.join(',')}|${curve}`)
  const shape: Shape = curve ? { k: 'path', d: edgePath(from, to, curve) } : { k: 'line', x1: from[0], y1: from[1], x2: to[0], y2: to[1] }
  const ctrl: Pt = curve ? curveControl(from, to, curve) : from
  const ctrlBack: Pt = curve ? curveControl(from, to, curve) : to
  const dash = flow ? '5 7' : dashed ? '5 6' : undefined
  // the label sits on the line's midpoint (on a curve: the curve's own midpoint)
  const mid: [number, number] = curve ? [(from[0] + 2 * ctrl[0] + to[0]) / 4, (from[1] + 2 * ctrl[1] + to[1]) / 4] : [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]
  return (
    <g opacity={opacity} className={`k-edge${flow ? ' k-edge--flow' : ''}`}>
      <Rough shape={shape} seed={seed} stroke={color} strokeWidth={width} roughness={width > 3 ? 0.45 : 0.9} bowing={0.6} dash={dash} draw={dash || !draw ? undefined : draw} duration={0.6} />
      {arrow && <Head tip={to} back={ctrl} color={color} width={width} seed={seed + 1} />}
      {arrow === 'both' && <Head tip={from} back={ctrlBack} color={color} width={width} seed={seed + 2} />}
      {label !== undefined && <DLabel x={mid[0]} y={mid[1] - 10} text={label} />}
    </g>
  )
}

interface PacketProps {
  /** Points the packet travels through, in order */
  path: [number, number][]
  /** Seconds for the whole path */
  duration?: number
  delay?: number
  /**
   * colours the tray: the default (`'orange'`) is the orange request tray (`'blue'`, `'amber'` and `'neutral'` draw the
   * same tray); `ok` = green tray with ✓ (an answer going back), `bad` = red tray with ✗ (an error), `idle` = grey
   */
  tone?: DiagramTone
  /** size: the tray is ≈ 5.4 × r wide (r = 5 → 27 units) */
  r?: number
  /** Loop forever */
  repeat?: boolean
  onDone?: () => void
}

/** One request = an orange tray that travels along a polyline in a straight line at constant speed (linear). */
export function Packet({ path, duration = 1.2, delay = 0, tone = 'orange', r = 5, repeat, onDone }: PacketProps) {
  const ids = useDiagramIds()
  const reduce = useReducedMotion()
  const tw = Math.max(16, r * 5.4)
  const th = tw * 0.7
  const fill = trayFillOf(tone)
  const xs = path.map((p) => p[0])
  const ys = path.map((p) => p[1])
  useEffect(() => {
    if (!reduce || !onDone || repeat) return
    const t = window.setTimeout(onDone, (delay + duration) * 1000)
    return () => window.clearTimeout(t)
  }, [reduce, onDone, repeat, delay, duration])
  const tray = ids ? (
    <use href={ids.tray} x={-tw / 2} y={-th / 2} width={tw} height={th} fill={fill} />
  ) : (
    <g transform={`scale(${tw / 20})`}>
      <path d="M-9 -2.5 L9 -3 L7.5 3.2 L-7.5 3.5 Z" className="k-dtray-body" fill={fill} />
      <ellipse cx={-2} cy={-2.6} rx={3.6} ry={1.7} className="k-tray-plate" />
      <rect x={3} y={-5.4} width={3} height={3.4} rx={0.6} className="k-tray-cup" />
    </g>
  )
  // the tone never rides on colour alone: a failed request carries a red ✗, an answer a green ✓
  const mark =
    tone === 'bad' ? (
      <Cross x={tw * 0.42} y={-th * 0.55} size={Math.max(3.5, tw * 0.16)} strokeWidth={2} seed={hashSeed(`pk|${tw}`)} />
    ) : tone === 'ok' ? (
      <Check x={tw * 0.42} y={-th * 0.5} size={Math.max(3.5, tw * 0.16)} strokeWidth={2} seed={hashSeed(`pk|${tw}`)} />
    ) : null
  if (reduce) {
    const [px, py] = pointAt(path, 0.5)
    return (
      <g transform={`translate(${px} ${py})`} className="k-packet">
        {tray}
        {mark}
      </g>
    )
  }
  // Constant speed (linear, segment-length-proportional keyframe times): distance on screen ∝ time.
  const loop = { duration, delay, ease: 'linear' as const, repeat: repeat ? Infinity : 0, repeatDelay: 0.2 }
  return (
    <motion.g
      className="k-packet"
      initial={{ x: xs[0], y: ys[0], opacity: 0 }}
      animate={{ x: xs, y: ys, opacity: [0, 1, 1, repeat ? 0 : 1] }}
      transition={{ x: { ...loop, times: pathTimes(path) }, y: { ...loop, times: pathTimes(path) }, opacity: { ...loop, times: [0, 0.08, 0.94, 1] } }}
      onAnimationComplete={onDone}
    >
      {tray}
      {mark}
    </motion.g>
  )
}

interface GroupProps {
  x: number
  y: number
  w: number
  h: number
  label?: ReactNode
  tone?: DiagramTone
  /** dashed pencil frame (default): a machine, a node, a namespace; solid = a hard boundary */
  dashed?: boolean
  children?: ReactNode
}

/** A labelled pencil frame grouping nodes: a machine, a cluster, a namespace… (x/y = top-left). Label in handwriting. */
export function DGroup({ x, y, w, h, label, tone = 'neutral', dashed = true, children }: GroupProps) {
  const stroke = strokeOf(tone)
  const seed = hashSeed(`group|${w}|${h}|${typeof label === 'string' ? label : ''}`)
  return (
    <g className="k-dgroup">
      <rect x={x + 3} y={y + 3} width={Math.max(0, w - 6)} height={Math.max(0, h - 6)} rx={5} className="k-dgroup__wash" style={{ fill: tone === 'neutral' ? 'var(--paper-2)' : fillOf(tone) }} />
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} stroke={stroke} strokeWidth={1.5} roughness={1.4} dash={dashed ? '7 6' : undefined} draw={dashed ? undefined : true} />
      {label !== undefined && (
        <text x={x + 14} y={y + 25} className="k-dgroup__label" style={{ fill: tone === 'neutral' ? 'var(--ink-2)' : stroke }}>
          {label}
        </text>
      )}
      {children}
    </g>
  )
}

interface LabelProps {
  x: number
  y: number
  text: ReactNode
  tone?: DiagramTone
  anchor?: 'start' | 'middle' | 'end'
  /** size in the old 12-unit scale: handwriting is drawn ≈ 1.45× larger so it reads like 12 px print */
  size?: number
  /** IBM Plex Mono (numbers, addresses, metrics) instead of handwriting */
  mono?: boolean
  bold?: boolean
}

/** A note written in a diagram: handwriting (Caveat) by default, or `mono` (Plex Mono) for numbers and code. */
export function DLabel({ x, y, text, tone = 'neutral', anchor = 'middle', size = 12, mono, bold }: LabelProps) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      className={`k-dlabel ${mono ? 'k-dlabel--mono' : 'k-dlabel--hand'}`}
      style={{ fontSize: mono ? size : size * 1.45, fontWeight: bold ? (mono ? 600 : 700) : mono ? 500 : 600, fill: tone === 'neutral' ? 'var(--ink-2)' : strokeOf(tone) }}
    >
      {text}
    </text>
  )
}

interface BarProps {
  x: number
  y: number
  w: number
  h?: number
  /** 0..1 */
  value: number
  tone?: DiagramTone
}

/** A fuel bar coloured in with a marker (x/y = top-left). Without a tone: green → orange (≥ 70 %) → red (≥ 90 %). */
export function DBar({ x, y, w, h = 6, value, tone }: BarProps) {
  const v = Math.max(0, Math.min(1, value))
  const t: DiagramTone = tone ?? (v >= 0.9 ? 'bad' : v >= 0.7 ? 'warn' : 'ok')
  return (
    <g className="k-dbar">
      <motion.rect x={x + 1} y={y + 0.5} height={Math.max(1, h - 1)} rx={1.2} initial={false} animate={{ width: Math.max(0.001, v * (w - 2)) }} transition={{ duration: 0.25 }} className="k-dbar__fill" style={{ fill: markerOf(t) }} />
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={hashSeed(`bar|${w}|${h}`)} stroke="var(--ink-2)" strokeWidth={1.1} roughness={0.5} bowing={0.3} />
    </g>
  )
}
