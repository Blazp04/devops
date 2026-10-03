import { useContext, useMemo, type CSSProperties, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { BoilCtx, hashSeed, roughPaths, type RoughOpts, type Shape } from './roughGen'
import { useSize } from './useSize'
import s from './bj.module.css'

interface RoughProps extends RoughOpts {
  shape: Shape
  seed?: number
  stroke?: string
  fillColor?: string
  className?: string
  style?: CSSProperties
  /** draw the stroke in: when it scrolls into view (true) or right away ('mount') */
  draw?: boolean | 'mount'
  delay?: number
  duration?: number
  dash?: string
}

/**
 * One hand-drawn shape. Colours are CSS values (usually tokens), so both themes follow automatically.
 * Solid strokes get the `rs` class: on the chalkboard they skip a little, like chalk on slate.
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
  const shapeKey = JSON.stringify(shape)
  const optsKey = JSON.stringify({ roughness, bowing, strokeWidth, fill: fill ?? !!fillColor, fillStyle, hachureAngle, hachureGap, fillWeight, multi })
  const baseSeed = seed ?? hashSeed(shapeKey)
  const finalSeed = baseSeed + boil * 7919
  const paths = useMemo(() => roughPaths(JSON.parse(shapeKey) as Shape, JSON.parse(optsKey) as RoughOpts, finalSeed), [shapeKey, optsKey, finalSeed])
  const sw = strokeWidth ?? 1.5
  return (
    <g className={className} style={style}>
      {paths.map((p, i) => {
        if (p.kind === 'fill') return <path key={i} d={p.d} style={{ fill: fillColor, stroke: 'none' }} />
        const color = p.kind === 'hatch' ? fillColor : stroke
        const width = p.kind === 'hatch' ? (fillWeight ?? 1) : sw
        if (draw && p.kind === 'stroke') {
          const target = { pathLength: 1, opacity: 1 }
          return (
            <motion.path
              key={i}
              d={p.d}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ stroke: color, strokeWidth: width }}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={draw === 'mount' ? target : undefined}
              whileInView={draw === 'mount' ? undefined : target}
              viewport={{ once: true, margin: '0px 0px -8% 0px' }}
              transition={{ pathLength: { duration, delay, ease: [0.4, 0, 0.3, 1] }, opacity: { duration: 0.01, delay } }}
            />
          )
        }
        return (
          <path
            key={i}
            d={p.d}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={dash}
            className={p.kind === 'stroke' && !dash ? s.rs : undefined}
            style={{ stroke: color, strokeWidth: width }}
          />
        )
      })}
    </g>
  )
}

/** Renders its doodle three times with different seeds and flips between them (CSS, ~4 fps). */
export function Boil({ children, className, slow }: { children: ReactNode; className?: string; slow?: boolean }) {
  const reduce = useReducedMotion()
  if (reduce) return <g className={className}>{children}</g>
  return (
    <g className={`${s.boil} ${slow ? s.boilSlow : ''} ${className ?? ''}`}>
      {[0, 1, 2].map((k) => (
        <BoilCtx.Provider key={k} value={k}>
          <g>{children}</g>
        </BoilCtx.Provider>
      ))}
    </g>
  )
}

type BoxTag = 'div' | 'section' | 'aside' | 'figure' | 'li' | 'blockquote'

/** A hand-drawn box around HTML content: measures itself and draws a rough rectangle behind the children. */
export function RoughBox({
  children,
  className,
  stroke = 'var(--ink)',
  fillColor,
  seed = 7,
  strokeWidth = 1.6,
  roughness = 1.3,
  pad = 3,
  as: Tag = 'div',
  double,
  fillStyle,
  hachureGap,
  draw,
  style,
}: {
  children: ReactNode
  className?: string
  stroke?: string
  fillColor?: string
  seed?: number
  strokeWidth?: number
  roughness?: number
  pad?: number
  as?: BoxTag
  double?: boolean
  fillStyle?: RoughOpts['fillStyle']
  hachureGap?: number
  draw?: boolean
  style?: CSSProperties
}) {
  const [ref, size] = useSize<HTMLElement>()
  return (
    <Tag ref={ref as never} className={`${s.roughBox} ${className ?? ''}`} style={style}>
      {size && (
        <svg className={s.roughBoxSvg} width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`} aria-hidden="true">
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
          />
        </svg>
      )}
      {children}
    </Tag>
  )
}

/** A button with a pen-drawn outline (sized from the label, never stretched). */
export function RoughButton({
  children,
  className,
  onClick,
  stroke = 'currentColor',
  fillColor,
  seed = 17,
  disabled,
  ariaLabel,
  ariaPressed,
  ariaExpanded,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
  stroke?: string
  fillColor?: string
  seed?: number
  disabled?: boolean
  ariaLabel?: string
  ariaPressed?: boolean
  ariaExpanded?: boolean
}) {
  const [ref, size] = useSize<HTMLButtonElement>()
  return (
    <button
      ref={ref}
      type="button"
      className={`${s.roughBtn} ${className ?? ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      aria-expanded={ariaExpanded}
    >
      {size && (
        <svg className={s.roughBoxSvg} width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`} aria-hidden="true">
          <Rough
            shape={{ k: 'rect', x: 2, y: 2, w: size.w - 4, h: size.h - 4 }}
            seed={seed}
            stroke={stroke}
            fillColor={fillColor}
            fillStyle={fillColor ? 'solid' : undefined}
            strokeWidth={1.8}
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
}: {
  children: ReactNode
  className?: string
  stroke?: string
  seed?: number
  padX?: number
  padY?: number
  strokeWidth?: number
  draw?: boolean | 'mount'
}) {
  const [ref, size] = useSize<HTMLSpanElement>()
  return (
    <span ref={ref} className={`${s.around} ${className ?? ''}`}>
      {size && (
        <svg
          className={s.aroundSvg}
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
            duration={0.45}
          />
        </svg>
      )}
      {children}
    </span>
  )
}

/** A hand-drawn arrow along a curve (points), with a two-stroke head. */
export function Arrow({
  pts,
  stroke = 'var(--ink)',
  strokeWidth = 1.6,
  seed = 3,
  draw,
  delay = 0,
  head = 9,
  dash,
}: {
  pts: [number, number][]
  stroke?: string
  strokeWidth?: number
  seed?: number
  draw?: boolean | 'mount'
  delay?: number
  head?: number
  dash?: string
}) {
  const [x2, y2] = pts[pts.length - 1]
  const [x1, y1] = pts[pts.length - 2]
  const a = Math.atan2(y2 - y1, x2 - x1)
  const h1: [number, number] = [x2 - head * Math.cos(a - 0.5), y2 - head * Math.sin(a - 0.5)]
  const h2: [number, number] = [x2 - head * Math.cos(a + 0.5), y2 - head * Math.sin(a + 0.5)]
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
    </g>
  )
}

/** Red-pen scribbled ✗ (error). */
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

/** Green-pen tick ✓ (success). */
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

/** A scribble (zig-zag) used to cross things out with a pen. */
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
  const pts: [number, number][] = []
  for (let i = 0; i <= turns * 2; i++) {
    const t = i / (turns * 2)
    pts.push([x + t * w + (i % 2 ? 6 : -6), y + (i % 2 ? h : 0) + ((i * 7) % 5) - 2])
  }
  return <Rough shape={{ k: 'lin', pts }} seed={seed} stroke={stroke} strokeWidth={strokeWidth} roughness={0.9} draw={draw} delay={delay} duration={0.8} />
}
