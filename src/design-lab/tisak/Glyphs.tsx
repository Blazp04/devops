import { useId, useMemo, useRef } from 'react'
import { motion } from 'motion/react'
import rough from 'roughjs'
import { numeralAdvance } from './geo'
import { useWidth } from './hooks'
import g from './glyphs.module.css'

/**
 * Shared SVG definitions: halftone screens, hatches and the "riso ink" filter
 * (speckled dropout + slightly wobbly edges). Rendered once per page.
 */
export function RisoDefs() {
  return (
    <svg className={g.defs} width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="tk-ht-blue" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(15)">
          <circle cx="3.5" cy="3.5" r="1.6" className={g.fBlue} />
        </pattern>
        <pattern id="tk-ht-pink" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(75)">
          <circle cx="3.5" cy="3.5" r="1.7" className={g.fPink} />
        </pattern>
        <pattern id="tk-ht-yellow" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(0)">
          <circle cx="3" cy="3" r="1.7" className={g.fYellow} />
        </pattern>
        <pattern id="tk-ht-ink" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <circle cx="2.5" cy="2.5" r="0.9" className={g.fInk} />
        </pattern>
        <pattern id="tk-hatch-pink" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <rect width="3.6" height="9" className={g.fPink} />
        </pattern>
        <pattern id="tk-hatch-blue" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="2.6" height="8" className={g.fBlue} />
        </pattern>
        <pattern id="tk-hatch-yellow" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="3.4" height="8" className={g.fYellowDeep} />
        </pattern>
        <pattern id="tk-hatch-ink" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <rect width="1.2" height="6" className={g.fInk} />
        </pattern>
        <filter id="tk-ink" x="-4%" y="-4%" width="108%" height="108%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="2" seed="4" result="grain" />
          <feColorMatrix
            in="grain"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -4.2 0 0 0 3.15"
            result="speck"
          />
          <feComposite in="SourceGraphic" in2="speck" operator="in" result="speckled" />
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="11" result="warp" />
          <feDisplacementMap in="speckled" in2="warp" scale="3.2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="tk-stamp" x="-10%" y="-20%" width="120%" height="140%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="2" result="grain" />
          <feColorMatrix
            in="grain"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -5 0 0 0 3.75"
            result="speck"
          />
          <feComposite in="SourceGraphic" in2="speck" operator="in" />
        </filter>
      </defs>
    </svg>
  )
}

/** Printer's registration mark. */
export function RegMark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg className={`${g.reg} ${className ?? ''}`} width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="5.5" />
      <path d="M10 0v20M0 10h20" />
    </svg>
  )
}

/** Printer's colour bar: the three inks and their overprints. */
export function InkBar({ className }: { className?: string }) {
  return (
    <svg className={`${g.inkbar} ${className ?? ''}`} viewBox="0 0 96 16" width="96" height="16" aria-hidden="true">
      <rect x="0" y="2" width="12" height="12" className={`${g.fPink} ${g.over}`} />
      <rect x="14" y="2" width="12" height="12" className={`${g.fBlue} ${g.over}`} />
      <rect x="28" y="2" width="12" height="12" className={`${g.fYellow} ${g.over}`} />
      <circle cx="58" cy="8" r="6" className={`${g.fPink} ${g.over}`} />
      <circle cx="64" cy="8" r="6" className={`${g.fBlue} ${g.over}`} />
      <circle cx="80" cy="8" r="6" className={`${g.fYellow} ${g.over}`} />
      <circle cx="86" cy="8" r="6" className={`${g.fPink} ${g.over}`} />
    </svg>
  )
}

/** The masthead logo: a pink request-dot overprinting a blue Pod square. */
export function Logo({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className={g.logo}>
      <rect x="3" y="9" width="24" height="24" rx="6" className={`${g.fBlue} ${g.over}`} />
      <circle cx="25" cy="16" r="11" className={`${g.fPink} ${g.over}`} />
      <circle cx="27" cy="17.5" r="3.2" className={`${g.fYellow} ${g.over}`} />
    </svg>
  )
}

export type Ink = 'pink' | 'blue' | 'yellow' | 'ink'

const fillClass: Record<Ink, string> = { pink: g.fPink, blue: g.fBlue, yellow: g.fYellow, ink: g.fInk }

/** A student: head + half-disc torso + a canteen tray. Origin = bottom centre. */
export function Student({
  x,
  y,
  ink = 'pink',
  s = 1,
  tray = 'yellow',
}: {
  x: number
  y: number
  ink?: Ink
  s?: number
  /** the tray is yellow; on yellow stock it is knocked out to paper */
  tray?: 'yellow' | 'paper' | 'none'
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-17 0 A17 17 0 0 1 17 0 Z" className={`${fillClass[ink]} ${g.over}`} />
      <circle cx="0" cy="-27" r="9" className={`${fillClass[ink]} ${g.over}`} />
      {tray !== 'none' && (
        <rect x="-15" y="-9" width="30" height="5" rx="1" className={tray === 'paper' ? g.fKnock : `${g.fYellow} ${g.over}`} />
      )}
    </g>
  )
}

/**
 * A request: a pink ink dot with a smaller, misregistered blue second impression peeking out at the
 * bottom right. The pink plate knocks out the blue under it, so a request always reads PINK.
 * `busy`: the request is on a core being worked on — only then do the two inks overprint and mix
 * (pink × blue), because "request × work" is exactly what the mixed colour means.
 */
export function ReqDot({ x, y, r = 6, busy = false }: { x: number; y: number; r?: number; busy?: boolean }) {
  const d = Math.max(2.6, r * 0.42)
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
      {busy ? (
        <>
          <circle cx={r * 0.3} cy={r * 0.26} r={r} className={`${g.fBlue} ${g.over}`} />
          <circle r={r} className={`${g.fPink} ${g.over}`} />
        </>
      ) : (
        <>
          <circle cx={d} cy={d} r={r * 0.74} className={`${g.fBlue} ${g.over}`} />
          <circle r={r} className={g.fPink} />
        </>
      )}
    </g>
  )
}

/**
 * The dispatcher (load balancer / Service): a big disc in the routing ink (yellow) with a pink halftone
 * second impression, rim text on a circular path and a blue needle that snaps to the chosen target.
 * On yellow stock the disc is printed as a knock-out (paper shows through).
 */
export function Disc({
  x,
  y,
  r,
  angle,
  rim,
  id,
  knockout = false,
  needleClass,
  rimClass,
}: {
  x: number
  y: number
  r: number
  angle: number
  rim?: string
  id: string
  knockout?: boolean
  needleClass?: string
  rimClass?: string
}) {
  const rr = r - Math.max(11, r * 0.13)
  return (
    <g>
      <g filter="url(#tk-ink)">
        <circle cx={x} cy={y} r={r} className={knockout ? g.fKnock : g.fYellow} />
        <circle cx={x + r * 0.06} cy={y + r * 0.05} r={r} fill="url(#tk-ht-pink)" className={g.over} />
      </g>
      {rim && (
        <>
          <path id={id} d={`M${x - rr} ${y}a${rr} ${rr} 0 1 1 ${rr * 2} 0a${rr} ${rr} 0 1 1 ${-rr * 2} 0`} fill="none" />
          <text className={`${g.rim} ${rimClass ?? ''}`} style={{ fontSize: Math.max(11, Math.min(14, r * 0.125)) }}>
            <textPath href={`#${id}`} textLength={2 * Math.PI * rr - 6} lengthAdjust="spacing">
              {rim}
              {rim}
            </textPath>
          </text>
        </>
      )}
      <g className={needleClass ?? g.needle} style={{ transform: `rotate(${angle}deg)`, transformOrigin: `${x}px ${y}px` }}>
        <path d={`M${x} ${y - r * 0.16} L${x + r * 0.64} ${y} L${x} ${y + r * 0.16} Z`} className={g.fBlue} />
      </g>
      <circle cx={x} cy={y} r={Math.max(6, r * 0.1)} className={g.fInk} />
    </g>
  )
}

/** A rubber stamp: double-ruled box with caps label, rotated. Stamps are the SYSTEM's verdicts. */
export function Stamp({
  x,
  y,
  label,
  tone = 'pink',
  rot = -8,
  size = 1,
  opacity = 1,
  solid = false,
}: {
  x: number
  y: number
  label: string
  tone?: 'pink' | 'blue'
  rot?: number
  size?: number
  opacity?: number
  /** back the stamp with paper so it stays legible on busy ink */
  solid?: boolean
}) {
  const w = (label.length * 9.2 + 16) * size
  const h = 22 * size
  return (
    <g
      transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)})`}
      className={`${tone === 'pink' ? g.stampPink : g.stampBlue} ${g.stamp}`}
      opacity={opacity}
    >
      {solid && <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={3 * size} className={g.stampBg} />}
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={3 * size} className={g.stampOuter} />
      <rect x={-w / 2 + 3 * size} y={-h / 2 + 3 * size} width={w - 6 * size} height={h - 6 * size} rx={2 * size} className={g.stampInner} />
      <text y={5 * size} textAnchor="middle" style={{ fontSize: 13.5 * size }} className={g.stampText}>
        {label}
      </text>
    </g>
  )
}

export type PenKind = 'circle' | 'check' | 'strike' | 'underline' | 'arrow'

/**
 * A hand-drawn pen mark (roughjs) — in this direction pen marks are always HUMAN marks
 * (the reader circles an answer, ticks a goal, strikes a myth; the teacher corrects in the margin),
 * never the system's.
 */
export function PenMark({
  kind,
  w,
  h,
  seed = 3,
  className,
  delay = 0,
  animate = true,
  stretch = false,
}: {
  kind: PenKind
  w: number
  h: number
  seed?: number
  className?: string
  delay?: number
  animate?: boolean
  /** fill the CSS box (non-uniform scale, stroke width kept) */
  stretch?: boolean
}) {
  const paths = useMemo(() => {
    const gen = rough.generator()
    const o = { seed, roughness: 1.35, bowing: 1.4, strokeWidth: 2.6, disableMultiStroke: kind !== 'circle' }
    const ds: ReturnType<typeof gen.line>[] = []
    if (kind === 'circle') ds.push(gen.ellipse(w / 2, h / 2, w * 0.92, h * 0.84, { ...o, roughness: 1.7 }))
    else if (kind === 'check')
      ds.push(
        gen.linearPath(
          [
            [w * 0.08, h * 0.55],
            [w * 0.38, h * 0.9],
            [w * 0.94, h * 0.1],
          ],
          o,
        ),
      )
    else if (kind === 'strike') ds.push(gen.line(w * 0.01, h * 0.58, w * 0.99, h * 0.42, { ...o, roughness: 2 }))
    else if (kind === 'arrow') {
      ds.push(
        gen.curve(
          [
            [w * 0.98, h * 0.2],
            [w * 0.55, h * 0.1],
            [w * 0.12, h * 0.55],
          ],
          o,
        ),
      )
      ds.push(
        gen.linearPath(
          [
            [w * 0.04 + 14, h * 0.55 - 12],
            [w * 0.1, h * 0.58],
            [w * 0.1 + 18, h * 0.58 + 6],
          ],
          o,
        ),
      )
    } else
      ds.push(
        gen.curve(
          [
            [w * 0.01, h * 0.6],
            [w * 0.5, h * 0.4],
            [w * 0.99, h * 0.55],
          ],
          o,
        ),
      )
    return ds.flatMap((d) => gen.toPaths(d).map((p) => p.d))
  }, [kind, w, h, seed])
  return (
    <svg
      className={`${g.pen} ${className ?? ''}`}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio={stretch ? 'none' : undefined}
      aria-hidden="true"
    >
      {paths.map((d, i) => (
        <motion.path
          key={i}
          d={d}
          vectorEffect={stretch ? 'non-scaling-stroke' : undefined}
          initial={animate ? { pathLength: 0, opacity: 0 } : false}
          whileInView={{ pathLength: 1, opacity: 1 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5, delay: delay + i * 0.32, ease: [0.4, 0, 0.2, 1] }}
        />
      ))}
    </svg>
  )
}

/* ---------------------------------------------------------------------------------------------
 * Numerals — the big printed numbers. Each one is a set of PLATES (like a riso job): a plate is
 * a solid ink, a keyline, or a halftone SCREEN with a tonal ramp. Screens have a fixed frequency
 * in CSS pixels (they do not grow with the type) and are rotated like real screens (15°/75°).
 * ------------------------------------------------------------------------------------------- */

export type PlateInk = Ink | 'paper'

export interface Plate {
  ink: PlateInk
  mode: 'solid' | 'screen' | 'outline'
  /** ink coverage at the start and end of the ramp (screen only), 0..1 */
  ramp?: readonly [number, number]
  /** direction of the ramp: coverage goes from ramp[0] at this edge to ramp[1] at the opposite edge */
  from?: 'left' | 'right' | 'top' | 'bottom'
  /** screen angle in degrees */
  angle?: number
  /** shape of the ramp: coverage follows t^ease (ease < 1 drops off quickly after the dense edge) */
  ease?: number
  /** misregistration offset, in em */
  dx?: number
  dy?: number
  /** blend with the plates underneath (multiply on white stock, screen on black) */
  over?: boolean
}

const plateFill: Record<PlateInk, string> = { pink: g.fPink, blue: g.fBlue, yellow: g.fYellow, ink: g.fInk, paper: g.fPaperInk }
const plateStroke: Record<PlateInk, string> = { pink: g.sPink, blue: g.sBlue, yellow: g.sYellow, ink: g.sInk, paper: g.sPaperInk }

const BANDS = 14

export function Numeral({ text, plates, className, pitch = 5.4 }: { text: string; plates: readonly Plate[]; className?: string; pitch?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const adv = numeralAdvance(text)
  const vb = { x: -4, y: -3, w: adv + 10, h: 80 }
  const w = useWidth(ref, () => 0)
  // px per viewBox unit (font-size is 100 units); until measured, assume ~4 px/unit (a 400 px numeral)
  const scale = w > 0 ? w / vb.w : 4
  const p = pitch / scale

  const textEl = (cls: string, extra?: { dx?: number; dy?: number }) => (
    <text x={(extra?.dx ?? 0) * 100} y={73 + (extra?.dy ?? 0) * 100} className={`${g.numText} ${cls}`}>
      {text}
    </text>
  )

  return (
    <span ref={ref} className={`${g.num} ${className ?? ''}`} style={{ width: `${vb.w / 100}em`, height: `${vb.h / 100}em` }} aria-hidden="true">
      <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} width="100%" height="100%">
        <defs>
          <clipPath id={`${uid}c`}>{textEl('')}</clipPath>
          {plates.map((pl, i) =>
            pl.mode === 'screen'
              ? Array.from({ length: BANDS }, (_, b) => {
                  const [c0, c1] = pl.ramp ?? [0.5, 0.5]
                  const c = c0 + (c1 - c0) * Math.pow((b + 0.5) / BANDS, pl.ease ?? 1)
                  const r = Math.min(p * 0.74, p * Math.sqrt(Math.max(0, c) / Math.PI))
                  return (
                    <pattern
                      key={`${i}-${b}`}
                      id={`${uid}p${i}b${b}`}
                      width={p}
                      height={p}
                      patternUnits="userSpaceOnUse"
                      patternTransform={`rotate(${pl.angle ?? 15})`}
                    >
                      <circle cx={p / 2} cy={p / 2} r={r} className={plateFill[pl.ink]} />
                    </pattern>
                  )
                })
              : null,
          )}
        </defs>
        {plates.map((pl, i) => {
          const tx = (pl.dx ?? 0) * 100
          const ty = (pl.dy ?? 0) * 100
          const blend = pl.over === false ? '' : g.over
          if (pl.mode === 'solid')
            return (
              <g key={i} transform={`translate(${tx} ${ty})`} className={blend}>
                {textEl(plateFill[pl.ink])}
              </g>
            )
          if (pl.mode === 'outline')
            return (
              <g key={i} transform={`translate(${tx} ${ty})`} className={blend}>
                <text x="0" y="73" className={`${g.numText} ${plateStroke[pl.ink]}`} style={{ strokeWidth: 1.8 / scale }}>
                  {text}
                </text>
              </g>
            )
          const horizontal = pl.from === 'left' || pl.from === 'right' || pl.from === undefined
          const reverse = pl.from === 'right' || pl.from === 'bottom'
          return (
            <g key={i} transform={`translate(${tx} ${ty})`} className={blend}>
              <g clipPath={`url(#${uid}c)`}>
                {Array.from({ length: BANDS }, (_, b) => {
                  const k = reverse ? BANDS - 1 - b : b
                  const span = horizontal ? vb.w : vb.h
                  const a = (horizontal ? vb.x : vb.y) + (span * k) / BANDS
                  const len = span / BANDS + 0.6
                  return horizontal ? (
                    <rect key={b} x={a} y={vb.y} width={len} height={vb.h} fill={`url(#${uid}p${i}b${b})`} />
                  ) : (
                    <rect key={b} x={vb.x} y={a} width={vb.w} height={len} fill={`url(#${uid}p${i}b${b})`} />
                  )
                })}
              </g>
            </g>
          )
        })}
      </svg>
    </span>
  )
}
