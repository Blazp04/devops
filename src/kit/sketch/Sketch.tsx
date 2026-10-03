import { useContext, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { BoilCtx, hashSeed, roughPaths, type Pt, type RoughOpts, type Shape } from './roughGen'
import { useSize } from './useSize'

/* =====================================================================
   Pen primitives. Everything drawn in the notebook is made of these.
   Colours are CSS values (tokens such as 'var(--ink)'), so paper and
   chalkboard themes follow automatically. Styles: ./sketch.css
   ===================================================================== */

export interface RoughProps extends RoughOpts {
  shape: Shape
  /** deterministic seed; defaults to a hash of the shape (same shape → same wobble) */
  seed?: number
  /** pen colour (default var(--ink)) */
  stroke?: string
  /** hatch / solid fill colour; setting it turns the fill on */
  fillColor?: string
  className?: string
  style?: CSSProperties
  /** draw the outline in: when it scrolls into view (true) or right away ('mount'). Once only. */
  draw?: boolean | 'mount'
  /** seconds before the draw-on starts */
  delay?: number
  /** seconds the draw-on takes (0.4–0.9 s per the bible) */
  duration?: number
  /** SVG dash pattern for dashed pencil lines (e.g. '4 4'): desired state, pending, routes */
  dash?: string
}

/**
 * One hand-drawn shape inside an <svg>. Solid strokes get the `k-rs` class: on the chalkboard they skip a little,
 * like chalk on slate.
 *   <Rough shape={{ k: 'rect', x: 0, y: 0, w: 80, h: 40 }} fillColor="var(--hl-blue-ink)" />
 */
export function Rough({
  shape,
  seed,
  stroke = 'var(--ink)',
  fillColor,
  className,
  style,
  draw,
  delay = 0,
  duration = 0.7,
  dash,
  roughness,
  bowing,
  strokeWidth,
  fill,
  fillStyle,
  hachureAngle,
  hachureGap,
  fillWeight,
  multi,
}: RoughProps) {
  const boil = useContext(BoilCtx)
  // reduced motion: everything is already drawn (no draw-on)
  const reduce = useReducedMotion()
  const shapeKey = JSON.stringify(shape)
  const optsKey = JSON.stringify({ roughness, bowing, strokeWidth, fill: fill ?? !!fillColor, fillStyle, hachureAngle, hachureGap, fillWeight, multi })
  const baseSeed = seed ?? hashSeed(shapeKey)
  const finalSeed = baseSeed + boil * 7919
  const paths = useMemo(() => roughPaths(JSON.parse(shapeKey) as Shape, JSON.parse(optsKey) as RoughOpts, finalSeed), [shapeKey, optsKey, finalSeed])
  const sw = strokeWidth ?? 1.5
  // A stroke that only starts to draw itself after mounting (e.g. an Edge turning dashed → solid) is already on
  // screen: it draws on right away instead of waiting for an in-view trigger. Once drawn, it is never hidden again.
  const [drawAtMount] = useState(!!draw)
  const [drawnOnce, setDrawnOnce] = useState(false)
  const mode: true | 'mount' | undefined = !draw ? undefined : drawAtMount ? draw : 'mount'
  return (
    <g className={className} style={style}>
      {paths.map((p, i) => {
        if (p.kind === 'fill') return <path key={i} d={p.d} style={{ fill: fillColor, stroke: 'none' }} />
        const color = p.kind === 'hatch' ? fillColor : stroke
        const width = p.kind === 'hatch' ? (fillWeight ?? 1) : sw
        if (mode && !reduce && !drawnOnce && p.kind === 'stroke') {
          return <DrawnPath key={i} d={p.d} color={color} width={width} draw={mode} delay={delay} duration={duration} chalk={!dash} onDone={() => setDrawnOnce(true)} />
        }
        return (
          <path
            key={i}
            d={p.d}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={dash}
            className={p.kind === 'stroke' && !dash ? 'k-rs' : undefined}
            style={{ stroke: color, strokeWidth: width }}
          />
        )
      })}
    </g>
  )
}

/**
 * A stroke that draws itself on (pathLength 0 → 1) once; when it is done it becomes a plain path, so solid strokes
 * then get the `k-rs` chalk skips on the board like every other stroke (the dash pattern can't run during the draw).
 */
function DrawnPath({ d, color, width, draw, delay, duration, chalk, onDone }: { d: string; color?: string; width: number; draw: true | 'mount'; delay: number; duration: number; chalk: boolean; onDone?: () => void }) {
  const [done, setDone] = useState(false)
  if (done) return <path d={d} fill="none" strokeLinecap="round" strokeLinejoin="round" className={chalk ? 'k-draw k-rs' : 'k-draw'} style={{ stroke: color, strokeWidth: width }} />
  const target = { pathLength: 1, opacity: 1 }
  return (
    <motion.path
      d={d}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="k-draw"
      style={{ stroke: color, strokeWidth: width }}
      initial={{ pathLength: 0, opacity: 0 }}
      animate={draw === 'mount' ? target : undefined}
      whileInView={draw === 'mount' ? undefined : target}
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
      transition={{ pathLength: { duration, delay, ease: [0.4, 0, 0.3, 1] }, opacity: { duration: 0.01, delay } }}
      onAnimationComplete={() => {
        setDone(true)
        onDone?.()
      }}
    />
  )
}

/**
 * Line boil: renders its doodle three times with different seeds and flips between them (CSS, ~4 fps; `slow` ≈ 2.5 fps).
 * Only for characters and key drawings — never for text or simulations. Off under reduced motion.
 */
export function Boil({ children, className, slow }: { children: ReactNode; className?: string; slow?: boolean }) {
  const reduce = useReducedMotion()
  if (reduce) return <g className={className}>{children}</g>
  return (
    <g className={`k-boil${slow ? ' k-boil--slow' : ''}${className ? ` ${className}` : ''}`}>
      {[0, 1, 2].map((k) => (
        <BoilCtx.Provider key={k} value={k}>
          <g>{children}</g>
        </BoilCtx.Provider>
      ))}
    </g>
  )
}

/** `span` makes an inline-block box (e.g. a hand-drawn outline inside a <button>). */
type BoxTag = 'div' | 'section' | 'aside' | 'figure' | 'li' | 'blockquote' | 'article' | 'header' | 'footer' | 'nav' | 'span'

export interface RoughBoxProps {
  children: ReactNode
  className?: string
  /** pen colour of the outline (default var(--ink)) */
  stroke?: string
  fillColor?: string
  fillStyle?: RoughOpts['fillStyle']
  hachureGap?: number
  seed?: number
  strokeWidth?: number
  roughness?: number
  /** inset of the outline from the element edge, in px */
  pad?: number
  as?: BoxTag
  /** pen goes over the outline twice */
  double?: boolean
  draw?: boolean
  dash?: string
  style?: CSSProperties
  id?: string
  role?: string
  ariaLabel?: string
}

/**
 * A hand-drawn box around HTML content: measures itself and draws a rough rectangle behind the children.
 * The outline is re-drawn (same seed) when the box resizes, so it never stretches.
 */
export function RoughBox({
  children,
  className,
  stroke = 'var(--ink)',
  fillColor,
  fillStyle,
  hachureGap,
  seed = 7,
  strokeWidth = 1.6,
  roughness = 1.3,
  pad = 3,
  as: Tag = 'div',
  double,
  draw,
  dash,
  style,
  id,
  role,
  ariaLabel,
}: RoughBoxProps) {
  const [ref, size] = useSize<HTMLElement>()
  return (
    <Tag ref={ref as never} id={id} role={role} aria-label={ariaLabel} className={`k-rough-box${className ? ` ${className}` : ''}`} style={style}>
      {size && size.w > pad * 2 && size.h > pad * 2 && (
        <svg className="k-rough-box__svg" width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`} aria-hidden="true">
          <Rough
            shape={{ k: 'rect', x: pad, y: pad, w: size.w - pad * 2, h: size.h - pad * 2 }}
            seed={seed}
            stroke={stroke}
            fillColor={fillColor}
            fillStyle={fillStyle}
            hachureGap={hachureGap}
            strokeWidth={strokeWidth}
            roughness={roughness}
            multi={double}
            draw={draw}
            dash={dash}
          />
        </svg>
      )}
      {children}
    </Tag>
  )
}

export interface RoughButtonProps {
  children: ReactNode
  className?: string
  onClick?: () => void
  /** outline colour (default currentColor) */
  stroke?: string
  /** solid fill behind the label (e.g. var(--ink) for the primary "ink" button, with color: var(--paper)) */
  fillColor?: string
  fillStyle?: RoughOpts['fillStyle']
  seed?: number
  strokeWidth?: number
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  title?: string
  style?: CSSProperties
  ariaLabel?: string
  ariaPressed?: boolean
  ariaExpanded?: boolean
  ariaControls?: string
}

/** A <button> with a pen-drawn outline (sized from the label, never stretched). Style the label with className. */
export function RoughButton({
  children,
  className,
  onClick,
  stroke = 'currentColor',
  fillColor,
  fillStyle,
  seed = 17,
  strokeWidth = 1.8,
  disabled,
  type = 'button',
  title,
  style,
  ariaLabel,
  ariaPressed,
  ariaExpanded,
  ariaControls,
}: RoughButtonProps) {
  const [ref, size] = useSize<HTMLButtonElement>()
  return (
    <button
      ref={ref}
      type={type}
      className={`k-rough-btn${className ? ` ${className}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={style}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
    >
      {size && size.w > 4 && size.h > 4 && (
        <svg className="k-rough-box__svg" width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`} aria-hidden="true">
          <Rough
            shape={{ k: 'rect', x: 2, y: 2, w: size.w - 4, h: size.h - 4 }}
            seed={seed}
            stroke={stroke}
            fillColor={fillColor}
            fillStyle={fillColor ? (fillStyle ?? 'solid') : undefined}
            strokeWidth={strokeWidth}
            roughness={1.1}
          />
        </svg>
      )}
      {children}
    </button>
  )
}

/** A pen ellipse drawn around inline content (measured, with real padding so it never cuts letters). */
export function RoughAround({
  children,
  className,
  stroke = 'var(--red)',
  seed = 23,
  padX = 16,
  padY = 7,
  strokeWidth = 2,
  draw = 'mount',
  delay = 0,
}: {
  children: ReactNode
  className?: string
  stroke?: string
  seed?: number
  padX?: number
  padY?: number
  strokeWidth?: number
  draw?: boolean | 'mount'
  delay?: number
}) {
  const [ref, size] = useSize<HTMLSpanElement>()
  return (
    <span ref={ref} className={`k-around${className ? ` ${className}` : ''}`}>
      {size && (
        <svg
          className="k-around__svg"
          style={{ left: -padX, top: -padY }}
          width={size.w + padX * 2}
          height={size.h + padY * 2}
          viewBox={`0 0 ${size.w + padX * 2} ${size.h + padY * 2}`}
          aria-hidden="true"
        >
          <Rough
            shape={{ k: 'ellipse', cx: size.w / 2 + padX, cy: size.h / 2 + padY, w: size.w + padX * 1.8, h: size.h + padY * 1.6 }}
            seed={seed}
            stroke={stroke}
            strokeWidth={strokeWidth}
            multi
            roughness={1.2}
            draw={draw}
            delay={delay}
            duration={0.45}
          />
        </svg>
      )}
      {children}
    </span>
  )
}

/**
 * A hand-drawn horizontal rule for HTML (fills its container's width; `double` = two pencil lines).
 * Use as a divider or under a heading.
 */
export function RoughRule({
  stroke = 'var(--ink-3)',
  seed = 2101,
  strokeWidth = 1.4,
  double,
  className,
  draw,
}: {
  stroke?: string
  seed?: number
  strokeWidth?: number
  double?: boolean
  className?: string
  draw?: boolean | 'mount'
}) {
  return (
    <svg className={`k-rule${className ? ` ${className}` : ''}`} viewBox="0 0 1000 16" preserveAspectRatio="none" aria-hidden="true">
      <Rough shape={{ k: 'line', x1: 2, y1: 6, x2: 998, y2: 8 }} seed={seed} stroke={stroke} strokeWidth={strokeWidth} roughness={1.4} draw={draw} />
      {double && <Rough shape={{ k: 'line', x1: 8, y1: 12, x2: 990, y2: 11 }} seed={seed + 1} stroke={stroke} strokeWidth={strokeWidth * 0.8} roughness={1.4} draw={draw} delay={0.15} />}
    </svg>
  )
}

/** A hand-drawn arrow along points (curve when > 2 points), with a two-stroke head at the last point. */
export function Arrow({
  pts,
  stroke = 'var(--ink)',
  strokeWidth = 1.6,
  seed = 3,
  draw,
  delay = 0,
  head = 9,
  dash,
  both,
}: {
  pts: Pt[]
  stroke?: string
  strokeWidth?: number
  seed?: number
  draw?: boolean | 'mount'
  delay?: number
  /** length of the arrow head strokes */
  head?: number
  dash?: string
  /** a head at the start too (a two-way arrow: sync, request ⇄ response) */
  both?: boolean
}) {
  const [x2, y2] = pts[pts.length - 1]
  const [x1, y1] = pts[pts.length - 2]
  const a = Math.atan2(y2 - y1, x2 - x1)
  const h1: Pt = [x2 - head * Math.cos(a - 0.5), y2 - head * Math.sin(a - 0.5)]
  const h2: Pt = [x2 - head * Math.cos(a + 0.5), y2 - head * Math.sin(a + 0.5)]
  const [s0x, s0y] = pts[0]
  const [s1x, s1y] = pts[1]
  const b = Math.atan2(s0y - s1y, s0x - s1x)
  const t1: Pt = [s0x - head * Math.cos(b - 0.5), s0y - head * Math.sin(b - 0.5)]
  const t2: Pt = [s0x - head * Math.cos(b + 0.5), s0y - head * Math.sin(b + 0.5)]
  return (
    <g>
      <Rough
        shape={pts.length > 2 ? { k: 'curve', pts } : { k: 'lin', pts }}
        seed={seed}
        stroke={stroke}
        strokeWidth={strokeWidth}
        draw={dash ? undefined : draw}
        delay={delay}
        roughness={0.9}
        dash={dash}
      />
      <Rough
        shape={{ k: 'lin', pts: [h1, [x2, y2], h2] }}
        seed={seed + 1}
        stroke={stroke}
        strokeWidth={strokeWidth}
        draw={draw}
        delay={delay + 0.55}
        duration={0.2}
        roughness={0.6}
      />
      {both && <Rough shape={{ k: 'lin', pts: [t1, [s0x, s0y], t2] }} seed={seed + 2} stroke={stroke} strokeWidth={strokeWidth} draw={draw} delay={delay + 0.55} duration={0.2} roughness={0.6} />}
    </g>
  )
}

/** Red-pen scribbled ✗ (error, failure, wrong answer). Centre (x, y). */
export function Cross({
  x,
  y,
  size = 10,
  seed = 11,
  stroke = 'var(--red)',
  strokeWidth = 2.2,
}: {
  x: number
  y: number
  size?: number
  seed?: number
  stroke?: string
  strokeWidth?: number
}) {
  return (
    <g>
      <Rough shape={{ k: 'line', x1: x - size, y1: y - size, x2: x + size, y2: y + size }} seed={seed} stroke={stroke} strokeWidth={strokeWidth} roughness={1.4} />
      <Rough shape={{ k: 'line', x1: x + size, y1: y - size * 1.1, x2: x - size * 0.9, y2: y + size }} seed={seed + 2} stroke={stroke} strokeWidth={strokeWidth} roughness={1.4} />
    </g>
  )
}

/** Green-pen tick ✓ (success, Running, correct). Centre (x, y). */
export function Check({
  x,
  y,
  size = 9,
  seed = 5,
  stroke = 'var(--green)',
  strokeWidth = 2.2,
  draw,
  delay,
}: {
  x: number
  y: number
  size?: number
  seed?: number
  stroke?: string
  strokeWidth?: number
  draw?: boolean | 'mount'
  delay?: number
}) {
  return (
    <Rough
      shape={{
        k: 'lin',
        pts: [
          [x - size, y],
          [x - size * 0.3, y + size * 0.75],
          [x + size, y - size],
        ],
      }}
      seed={seed}
      stroke={stroke}
      strokeWidth={strokeWidth}
      roughness={0.8}
      draw={draw}
      delay={delay}
      duration={0.35}
    />
  )
}

/** A zig-zag scribble used to cross something out with a pen (box x, y, w, h). */
export function Scribble({
  x,
  y,
  w,
  h,
  seed = 41,
  stroke = 'var(--red)',
  strokeWidth = 2.4,
  turns = 7,
  draw,
  delay,
}: {
  x: number
  y: number
  w: number
  h: number
  seed?: number
  stroke?: string
  strokeWidth?: number
  turns?: number
  draw?: boolean | 'mount'
  delay?: number
}) {
  const pts: Pt[] = []
  for (let i = 0; i <= turns * 2; i++) {
    const t = i / (turns * 2)
    pts.push([x + t * w + (i % 2 ? 6 : -6), y + (i % 2 ? h : 0) + ((i * 7) % 5) - 2])
  }
  return <Rough shape={{ k: 'lin', pts }} seed={seed} stroke={stroke} strokeWidth={strokeWidth} roughness={0.9} draw={draw} delay={delay} duration={0.8} />
}

/** A wobbly underline as its own small <svg> (stretches to the parent's width; nav links, headings). */
export function Squiggle({ color = 'var(--red)', seed = 9, className }: { color?: string; seed?: number; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
      <Rough
        shape={{
          k: 'curve',
          pts: [
            [2, 6],
            [25, 3],
            [50, 7],
            [75, 3],
            [98, 6],
          ],
        }}
        seed={seed}
        stroke={color}
        strokeWidth={2}
        roughness={0.8}
      />
    </svg>
  )
}

/** Empty or ticked checkbox drawn by hand, as its own <svg> (size it with CSS; viewBox 24 × 24). */
export function CheckBox({ checked, seed = 1, color = 'var(--ink)', tick = 'var(--green)', className }: { checked?: boolean; seed?: number; color?: string; tick?: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <Rough shape={{ k: 'rect', x: 2, y: 3, w: 19, h: 18 }} seed={seed} stroke={color} strokeWidth={1.6} roughness={1.2} />
      {checked && (
        <Rough
          shape={{
            k: 'lin',
            pts: [
              [6, 11],
              [11, 17],
              [24, -2],
            ],
          }}
          seed={seed + 1}
          stroke={tick}
          strokeWidth={2.4}
          draw
          duration={0.35}
        />
      )}
    </svg>
  )
}
