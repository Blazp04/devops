import { memo, type ReactNode } from 'react'
import { Rough } from './Sketch'
import type { Pt } from './roughGen'
import s from './bj.module.css'

/* =====================================================================
   Characters. Local box ≈ 80 × 120, head centre (40, 28). Same pen for everyone.
   ===================================================================== */

export type Hair = 'short' | 'bun' | 'pony' | 'curly' | 'beanie' | 'chef' | 'cap' | 'messy'
export type Mood = 'smile' | 'worry' | 'open' | 'flat' | 'grin'
export type Holding = 'phone' | 'laptop' | 'mug' | 'ladle' | 'tray' | 'pager' | 'none'
/** Silhouette: the three story characters must read apart even as tiny doodles. */
export type Build = 'std' | 'wide' | 'hoodie'

interface PersonProps {
  x?: number
  y?: number
  scale?: number
  hair: Hair
  mood?: Mood
  glasses?: boolean
  shirt?: string
  holding?: Holding
  seed?: number
  /** hide the right arm (the redar draws its own) */
  noRightArm?: boolean
  flip?: boolean
  build?: Build
  /** rosy cheeks (teta Mira) */
  cheeks?: boolean
  /** the pager in the hand is buzzing (alert) */
  buzz?: boolean
  children?: ReactNode
}

function HairShape({ hair, seed }: { hair: Hair; seed: number }) {
  switch (hair) {
    case 'pony':
      return (
        <>
          <Rough
            shape={{
              k: 'curve',
              pts: [
                [22, 30],
                [24, 14],
                [38, 8],
                [52, 11],
                [58, 26],
              ],
            }}
            seed={seed}
            strokeWidth={2}
          />
          <Rough
            shape={{
              k: 'curve',
              pts: [
                [56, 15],
                [67, 19],
                [70, 33],
                [63, 47],
              ],
            }}
            seed={seed + 1}
            strokeWidth={2}
          />
          <Rough
            shape={{
              k: 'curve',
              pts: [
                [58, 18],
                [64, 26],
                [62, 40],
              ],
            }}
            seed={seed + 2}
            strokeWidth={1.2}
          />
          <Rough
            shape={{
              k: 'lin',
              pts: [
                [30, 12],
                [36, 20],
                [44, 11],
              ],
            }}
            seed={seed + 3}
            strokeWidth={1.4}
          />
        </>
      )
    case 'bun':
      return (
        <>
          <Rough
            shape={{
              k: 'curve',
              pts: [
                [23, 26],
                [27, 12],
                [40, 9],
                [53, 12],
                [57, 26],
              ],
            }}
            seed={seed}
            strokeWidth={2}
          />
          <Rough shape={{ k: 'ellipse', cx: 40, cy: 5, w: 14, h: 11 }} seed={seed + 1} strokeWidth={1.8} fillColor="var(--ink)" fillStyle="hachure" hachureGap={2.5} />
        </>
      )
    case 'short':
      return (
        <>
          <Rough
            shape={{
              k: 'curve',
              pts: [
                [23, 25],
                [27, 11],
                [40, 8],
                [53, 11],
                [57, 25],
              ],
            }}
            seed={seed}
            strokeWidth={2}
          />
          <Rough
            shape={{
              k: 'lin',
              pts: [
                [29, 13],
                [34, 20],
                [40, 13],
                [46, 20],
                [52, 14],
              ],
            }}
            seed={seed + 1}
            strokeWidth={1.5}
          />
        </>
      )
    case 'curly':
      return (
        <Rough
          shape={{
            k: 'curve',
            pts: [
              [21, 32],
              [18, 18],
              [27, 8],
              [40, 4],
              [53, 8],
              [62, 18],
              [59, 32],
            ],
          }}
          seed={seed}
          strokeWidth={2.2}
          roughness={2.6}
          multi
        />
      )
    case 'beanie':
      return (
        <>
          <Rough shape={{ k: 'path', d: 'M21 24 Q22 4 40 3 Q58 4 59 24 Z' }} seed={seed} strokeWidth={1.8} fillColor="var(--hl-pink-ink)" hachureGap={3} />
          <Rough shape={{ k: 'rect', x: 20, y: 18, w: 40, h: 8 }} seed={seed + 1} strokeWidth={1.6} />
          <Rough shape={{ k: 'ellipse', cx: 40, cy: 1, w: 8, h: 7 }} seed={seed + 2} strokeWidth={1.6} />
        </>
      )
    case 'chef':
      return (
        <>
          <Rough shape={{ k: 'ellipse', cx: 29, cy: 6, w: 20, h: 17 }} seed={seed} strokeWidth={1.6} />
          <Rough shape={{ k: 'ellipse', cx: 40, cy: 0, w: 22, h: 19 }} seed={seed + 1} strokeWidth={1.6} />
          <Rough shape={{ k: 'ellipse', cx: 51, cy: 6, w: 20, h: 17 }} seed={seed + 2} strokeWidth={1.6} />
          <Rough shape={{ k: 'rect', x: 26, y: 9, w: 28, h: 11 }} seed={seed + 3} strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" />
        </>
      )
    case 'messy':
      return (
        <Rough
          shape={{
            k: 'lin',
            pts: [
              [27, 17],
              [31, 12],
              [34, 19],
              [39, 11],
              [43, 18],
              [48, 12],
              [52, 18],
            ],
          }}
          seed={seed}
          strokeWidth={1.7}
          roughness={0.9}
        />
      )
    case 'cap':
      return (
        <>
          <Rough shape={{ k: 'path', d: 'M22 22 Q24 6 40 6 Q56 6 58 22 Z' }} seed={seed} strokeWidth={1.8} fillColor="var(--pen)" hachureGap={3} />
          <Rough shape={{ k: 'line', x1: 50, y1: 21, x2: 72, y2: 24 }} seed={seed + 1} strokeWidth={3} />
        </>
      )
  }
}

function Face({ mood, seed, glasses }: { mood: Mood; seed: number; glasses?: boolean }) {
  return (
    <g>
      {glasses ? (
        <>
          <Rough shape={{ k: 'ellipse', cx: 33, cy: 29, w: 11, h: 10 }} seed={seed} strokeWidth={1.4} />
          <Rough shape={{ k: 'ellipse', cx: 47, cy: 29, w: 11, h: 10 }} seed={seed + 1} strokeWidth={1.4} />
          <Rough shape={{ k: 'line', x1: 38, y1: 29, x2: 42, y2: 29 }} seed={seed + 2} strokeWidth={1.2} />
        </>
      ) : null}
      <circle cx={33.5} cy={29.5} r={1.9} className={s.inkFill} />
      <circle cx={46.5} cy={29.5} r={1.9} className={s.inkFill} />
      {mood === 'smile' && (
        <Rough
          shape={{
            k: 'curve',
            pts: [
              [34, 37],
              [40, 41],
              [46, 37],
            ],
          }}
          seed={seed + 3}
          strokeWidth={1.6}
          roughness={0.6}
        />
      )}
      {mood === 'grin' && <Rough shape={{ k: 'path', d: 'M33 36 Q40 46 47 36 Z' }} seed={seed + 3} strokeWidth={1.5} fillColor="var(--ink)" fillStyle="solid" roughness={0.5} />}
      {mood === 'flat' && <Rough shape={{ k: 'line', x1: 35, y1: 39, x2: 45, y2: 39 }} seed={seed + 3} strokeWidth={1.6} roughness={0.5} />}
      {mood === 'worry' && (
        <>
          <Rough
            shape={{
              k: 'curve',
              pts: [
                [34, 41],
                [40, 37],
                [46, 41],
              ],
            }}
            seed={seed + 3}
            strokeWidth={1.6}
            roughness={0.6}
          />
          <Rough shape={{ k: 'path', d: 'M61 16 Q57 23 61 25 Q65 23 61 16 Z' }} seed={seed + 4} strokeWidth={1.2} stroke="var(--pen)" />
        </>
      )}
      {mood === 'open' && <Rough shape={{ k: 'ellipse', cx: 40, cy: 39, w: 7, h: 7 }} seed={seed + 3} strokeWidth={1.5} fillColor="var(--ink)" fillStyle="solid" />}
    </g>
  )
}

function Item({ holding, seed, buzz }: { holding: Holding; seed: number; buzz?: boolean }) {
  switch (holding) {
    case 'pager':
      return (
        <g>
          <Rough shape={{ k: 'rect', x: 56, y: 74, w: 16, h: 12 }} seed={seed} strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" />
          <Rough shape={{ k: 'rect', x: 59, y: 77, w: 10, h: 4.5 }} seed={seed + 1} strokeWidth={0.9} fillColor={buzz ? 'var(--red)' : 'var(--pen)'} fillStyle="solid" roughness={0.4} />
          <Rough shape={{ k: 'line', x1: 69, y1: 74, x2: 70, y2: 68 }} seed={seed + 2} strokeWidth={1.4} />
          {buzz && (
            <g className={s.buzz}>
              <Rough shape={{ k: 'line', x1: 77, y1: 72, x2: 83, y2: 67 }} seed={seed + 3} strokeWidth={1.6} stroke="var(--red)" />
              <Rough shape={{ k: 'line', x1: 78, y1: 80, x2: 86, y2: 80 }} seed={seed + 4} strokeWidth={1.6} stroke="var(--red)" />
              <Rough shape={{ k: 'line', x1: 77, y1: 88, x2: 83, y2: 93 }} seed={seed + 5} strokeWidth={1.6} stroke="var(--red)" />
              <Rough shape={{ k: 'line', x1: 51, y1: 72, x2: 46, y2: 67 }} seed={seed + 6} strokeWidth={1.6} stroke="var(--red)" />
            </g>
          )}
        </g>
      )
    case 'phone':
      return <Rough shape={{ k: 'rect', x: 58, y: 74, w: 10, h: 17 }} seed={seed} strokeWidth={1.4} fillColor="var(--ink)" fillStyle="solid" />
    case 'laptop':
      return (
        <g>
          <Rough shape={{ k: 'rect', x: 15, y: 70, w: 50, h: 32 }} seed={seed} strokeWidth={1.7} fillColor="var(--paper)" fillStyle="solid" />
          <Rough shape={{ k: 'line', x1: 10, y1: 104, x2: 70, y2: 104 }} seed={seed + 1} strokeWidth={2.2} />
          <text x={40} y={92} textAnchor="middle" className={s.svgMono} style={{ fontSize: 14, fontWeight: 600 }}>
            {'</>'}
          </text>
        </g>
      )
    case 'mug':
      return (
        <g>
          <Rough shape={{ k: 'rect', x: 58, y: 74, w: 13, h: 15 }} seed={seed} strokeWidth={1.5} fillColor="var(--paper)" fillStyle="solid" />
          <Rough shape={{ k: 'arc', cx: 71, cy: 81, w: 9, h: 9, start: -Math.PI / 2, stop: Math.PI / 2 }} seed={seed + 1} strokeWidth={1.4} />
          <Rough
            shape={{
              k: 'curve',
              pts: [
                [62, 70],
                [60, 64],
                [64, 59],
                [62, 53],
              ],
            }}
            seed={seed + 2}
            strokeWidth={1.1}
            stroke="var(--ink-3)"
          />
          <Rough
            shape={{
              k: 'curve',
              pts: [
                [67, 70],
                [65, 64],
                [69, 59],
              ],
            }}
            seed={seed + 3}
            strokeWidth={1.1}
            stroke="var(--ink-3)"
          />
        </g>
      )
    case 'ladle':
      return (
        <g>
          <Rough shape={{ k: 'line', x1: 68, y1: 50, x2: 63, y2: 86 }} seed={seed} strokeWidth={2.2} />
          <Rough shape={{ k: 'ellipse', cx: 69, cy: 47, w: 14, h: 9 }} seed={seed + 1} strokeWidth={1.6} fillColor="var(--hl-orange-ink)" hachureGap={2.5} />
        </g>
      )
    case 'tray':
      return (
        <g>
          <Rough
            shape={{
              k: 'poly',
              pts: [
                [48, 82],
                [80, 82],
                [76, 90],
                [52, 90],
              ],
            }}
            seed={seed}
            strokeWidth={1.5}
            fillColor="var(--tray)"
            fillStyle="solid"
          />
          <Rough shape={{ k: 'ellipse', cx: 62, cy: 81, w: 12, h: 5 }} seed={seed + 1} strokeWidth={1.2} fillColor="var(--paper)" fillStyle="solid" />
        </g>
      )
    default:
      return null
  }
}

export const Person = memo(function Person({
  x = 0,
  y = 0,
  scale = 1,
  hair,
  mood = 'smile',
  glasses,
  shirt = 'var(--hl-blue-ink)',
  holding = 'none',
  seed = 1,
  noRightArm,
  flip,
  build = 'std',
  cheeks,
  buzz,
  children,
}: PersonProps) {
  const b = BUILDS[build]
  const rightHand: Pt = holding === 'laptop' ? [62, 74] : b.rightHand
  const leftHand: Pt = holding === 'laptop' ? [18, 74] : b.leftHand
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})${flip ? ' translate(-80 0)' : ''}`}>
      {/* hood behind the head (Davor) */}
      {build === 'hoodie' && <Rough shape={{ k: 'ellipse', cx: 40, cy: 31, w: 52, h: 52 }} seed={seed + 9} strokeWidth={1.8} fillColor={shirt} hachureGap={3.6} fillWeight={1.4} hachureAngle={-50} />}
      {/* body */}
      <Rough shape={{ k: 'path', d: b.body }} seed={seed + 10} strokeWidth={1.8} fillColor={shirt} hachureGap={4} fillWeight={1.6} hachureAngle={-50} />
      {build === 'wide' && (
        <g>
          {/* apron with a pocket and neck straps (teta Mira) */}
          <Rough shape={{ k: 'path', d: 'M26 67 Q40 62 54 67 L59 113 L21 113 Z' }} seed={seed + 14} strokeWidth={1.5} fillColor="var(--paper)" fillStyle="solid" />
          <Rough shape={{ k: 'lin', pts: [[32, 86], [48, 86], [47, 97], [33, 97], [32, 86]] }} seed={seed + 15} strokeWidth={1.2} />
          <Rough shape={{ k: 'line', x1: 28, y1: 67, x2: 33, y2: 52 }} seed={seed + 16} strokeWidth={1.2} />
          <Rough shape={{ k: 'line', x1: 52, y1: 67, x2: 47, y2: 52 }} seed={seed + 17} strokeWidth={1.2} />
        </g>
      )}
      {build === 'hoodie' && (
        <g>
          {/* drawstrings and the kangaroo pocket */}
          <Rough shape={{ k: 'line', x1: 35, y1: 54, x2: 34, y2: 68 }} seed={seed + 14} strokeWidth={1.3} />
          <Rough shape={{ k: 'line', x1: 45, y1: 54, x2: 46, y2: 68 }} seed={seed + 15} strokeWidth={1.3} />
          <Rough shape={{ k: 'lin', pts: [[27, 106], [30, 93], [50, 93], [53, 106]] }} seed={seed + 16} strokeWidth={1.3} />
        </g>
      )}
      <Rough shape={{ k: 'lin', pts: [b.leftShoulder, leftHand] }} seed={seed + 11} strokeWidth={1.8} />
      {!noRightArm && <Rough shape={{ k: 'lin', pts: [b.rightShoulder, rightHand] }} seed={seed + 12} strokeWidth={1.8} />}
      {/* head */}
      <Rough shape={{ k: 'ellipse', cx: 40, cy: 28, w: build === 'wide' ? 38 : 34, h: 37 }} seed={seed + 13} strokeWidth={1.9} fillColor="var(--paper)" fillStyle="solid" />
      {cheeks && (
        <g>
          <Rough shape={{ k: 'ellipse', cx: 28, cy: 36, w: 7, h: 5 }} seed={seed + 18} strokeWidth={0.8} stroke="var(--hl-pink-ink)" fillColor="var(--hl-pink-ink)" hachureGap={1.6} />
          <Rough shape={{ k: 'ellipse', cx: 52, cy: 36, w: 7, h: 5 }} seed={seed + 19} strokeWidth={0.8} stroke="var(--hl-pink-ink)" fillColor="var(--hl-pink-ink)" hachureGap={1.6} />
        </g>
      )}
      <HairShape hair={hair} seed={seed + 20} />
      <Face mood={mood} seed={seed + 30} glasses={glasses} />
      <Item holding={holding} seed={seed + 40} buzz={buzz} />
      {children}
    </g>
  )
})

const BUILDS: Record<Build, { body: string; leftShoulder: Pt; rightShoulder: Pt; leftHand: Pt; rightHand: Pt }> = {
  std: { body: 'M24 55 Q40 46 56 55 L64 116 L16 116 Z', leftShoulder: [26, 60], rightShoulder: [54, 60], leftHand: [19, 86], rightHand: [62, 82] },
  wide: { body: 'M17 58 Q40 44 63 58 L75 116 L5 116 Z', leftShoulder: [21, 63], rightShoulder: [59, 63], leftHand: [12, 88], rightHand: [64, 84] },
  hoodie: { body: 'M19 60 Q40 46 61 60 L64 116 L16 116 Z', leftShoulder: [22, 63], rightShoulder: [58, 63], leftHand: [17, 88], rightHand: [62, 82] },
}

/** Lana — the developer: slim, ponytail, glasses, laptop. */
export function Lana(props: { x?: number; y?: number; scale?: number; mood?: Mood; holding?: Holding }) {
  return <Person hair="pony" glasses shirt="var(--hl-blue-ink)" holding={props.holding ?? 'laptop'} seed={101} {...props} />
}

/** Davor — the on-call "server person": hoodie with the hood up, messy fringe, a pager that buzzes on errors. */
export function Davor(props: { x?: number; y?: number; scale?: number; mood?: Mood; flip?: boolean; buzz?: boolean; holding?: Holding }) {
  return <Person hair="messy" build="hoodie" shirt="var(--hl-green-ink)" holding={props.holding ?? 'pager'} seed={202} {...props} />
}

/** Teta Mira — runs the canteen kitchen: wide, apron, rosy cheeks, chef's hat, ladle. */
export function Mira(props: { x?: number; y?: number; scale?: number; mood?: Mood; flip?: boolean }) {
  return <Person hair="chef" build="wide" cheeks shirt="var(--hl-pink-ink)" holding="ladle" seed={303} {...props} />
}

/**
 * The load balancer: a redar (person directing traffic) in a hi-vis vest with "LB" on it.
 * Local origin (0,0) = the point trays pass through; the right arm points at `angle` (radians).
 */
export const Redar = memo(function Redar({
  x,
  y,
  scale = 1,
  angle = 0,
  mood = 'smile',
  arm = true,
  sweat = 0,
  slowArm,
}: {
  x: number
  y: number
  scale?: number
  angle?: number
  mood?: Mood
  arm?: boolean
  /** 0..3 sweat drops: how worried the redar is about full queues */
  sweat?: number
  /** turn the arm slowly (explainers) instead of snapping (live simulation) */
  slowArm?: boolean
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {DROPS.slice(0, sweat).map((d, i) => (
        <Rough key={i} shape={{ k: 'path', d: drop(d[0], d[1], d[2]) }} seed={413 + i} strokeWidth={1.3} stroke="var(--pen)" fillColor="var(--hl-blue-ink)" fillStyle="solid" />
      ))}
      <g transform="translate(-40 -88)">
        <Person hair="cap" mood={mood} shirt="var(--hl-yellow-ink)" seed={404} noRightArm>
          <Rough shape={{ k: 'line', x1: 22, y1: 92, x2: 58, y2: 92 }} seed={405} strokeWidth={3} stroke="var(--vest-stripe)" roughness={0.6} />
          <Rough shape={{ k: 'line', x1: 20, y1: 102, x2: 60, y2: 102 }} seed={406} strokeWidth={3} stroke="var(--vest-stripe)" roughness={0.6} />
          <text x={40} y={85} textAnchor="middle" className={s.svgDisplay} style={{ fontSize: 16 }}>
            LB
          </text>
          {/* legs */}
          <Rough
            shape={{
              k: 'lin',
              pts: [
                [30, 116],
                [27, 146],
              ],
            }}
            seed={407}
            strokeWidth={1.8}
          />
          <Rough
            shape={{
              k: 'lin',
              pts: [
                [50, 116],
                [54, 146],
              ],
            }}
            seed={408}
            strokeWidth={1.8}
          />
        </Person>
      </g>
      {/* pointing arm, rotates around the shoulder */}
      {arm && (
        <g transform={`translate(13 -28)`}>
          <g className={`${s.redarArm} ${slowArm ? s.redarArmSlow : ''}`} style={{ transform: `rotate(${(angle * 180) / Math.PI}deg)` }}>
            <Rough
              shape={{
                k: 'lin',
                pts: [
                  [0, 0],
                  [34, 0],
                ],
              }}
              seed={409}
              strokeWidth={1.9}
            />
            <Rough shape={{ k: 'line', x1: 34, y1: 0, x2: 46, y2: 0 }} seed={410} strokeWidth={1.6} />
            <Rough shape={{ k: 'ellipse', cx: 53, cy: 0, w: 15, h: 15 }} seed={411} strokeWidth={1.7} fillColor="var(--red)" fillStyle="solid" />
            <Rough shape={{ k: 'ellipse', cx: 53, cy: 0, w: 7, h: 7 }} seed={412} strokeWidth={1} fillColor="var(--paper)" fillStyle="solid" />
          </g>
        </g>
      )}
    </g>
  )
})

const DROPS: [number, number, number][] = [
  [-30, -68, 1],
  [36, -80, 0.85],
  [-37, -48, 0.8],
]

function drop(x: number, y: number, k: number) {
  return `M${x} ${y} Q${x - 5 * k} ${y + 8 * k} ${x} ${y + 10 * k} Q${x + 5 * k} ${y + 8 * k} ${x} ${y} Z`
}

/**
 * A student waiting in line (with legs). `tap` makes one foot tap impatiently (CSS, cheap).
 * Local box ≈ 80 × 146, feet at y = 146.
 */
export const Student = memo(function Student({ variant, tap, mood = 'smile' }: { variant: number; tap?: boolean; mood?: Mood }) {
  const v = STUDENTS[variant % STUDENTS.length]
  const seed = 520 + variant * 37
  return (
    <g>
      <Rough shape={{ k: 'lin', pts: [[31, 114], [29, 145]] }} seed={seed + 1} strokeWidth={1.8} />
      <g className={tap ? s.tap : undefined}>
        <Rough shape={{ k: 'lin', pts: [[49, 114], [51, 145], [60, 145]] }} seed={seed + 2} strokeWidth={1.8} />
      </g>
      <Rough shape={{ k: 'line', x1: 22, y1: 145, x2: 31, y2: 145 }} seed={seed + 3} strokeWidth={1.8} />
      <Person hair={v.hair} shirt={v.shirt} holding="phone" seed={seed} mood={mood} glasses={v.glasses} />
    </g>
  )
})

const STUDENTS: { hair: Hair; shirt: string; glasses?: boolean }[] = [
  { hair: 'bun', shirt: 'var(--hl-pink-ink)' },
  { hair: 'curly', shirt: 'var(--hl-green-ink)' },
  { hair: 'short', shirt: 'var(--hl-blue-ink)' },
  { hair: 'pony', shirt: 'var(--hl-orange-ink)', glasses: true },
  { hair: 'short', shirt: 'var(--hl-yellow-ink)', glasses: true },
  { hair: 'curly', shirt: 'var(--hl-pink-ink)' },
  { hair: 'bun', shirt: 'var(--hl-blue-ink)' },
]

/** A small crowd of students with phones (the source of requests). Local box ≈ 190 × 210. */
export const Crowd = memo(function Crowd({ x, y, scale = 1, label = true }: { x: number; y: number; scale?: number; label?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <Person x={70} y={0} scale={0.82} hair="bun" holding="phone" shirt="var(--hl-pink-ink)" seed={501} />
      <Person x={0} y={38} scale={0.9} hair="curly" holding="phone" shirt="var(--hl-green-ink)" seed={502} mood="grin" />
      <Person x={84} y={70} scale={0.95} hair="short" holding="phone" shirt="var(--hl-blue-ink)" seed={503} />
      {label && (
        <text x={92} y={200} textAnchor="middle" className={s.svgHand} style={{ fontSize: 20 }}>
          studenti · 12:00
        </text>
      )}
    </g>
  )
})

/**
 * Server face: calm → busy → panic → dead, drawn in a round "porthole" on the box (≈ 44 px).
 * Local centre (0,0).
 */
export function ServerFace({ mood, r = 22 }: { mood: 'calm' | 'busy' | 'panic' | 'dead'; r?: number }) {
  const k = r / 22
  const ring = (
    <Rough
      shape={{ k: 'ellipse', cx: 0, cy: 0, w: r * 2, h: r * 1.9 }}
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
        <Rough
          shape={{
            k: 'lin',
            pts: [
              [-9, 10],
              [-4.5, 7],
              [0, 10],
              [4.5, 7],
              [9, 10],
            ],
          }}
          seed={605}
          strokeWidth={1.8}
          stroke="var(--red)"
        />
      </g>
    )
  return (
    <g transform={`scale(${k})`}>
      {ring}
      <g className={mood === 'panic' ? s.shake : undefined}>
        {mood === 'panic' ? (
          <>
            <circle cx={-7.5} cy={-4} r={4.2} className={s.eyeWhite} />
            <circle cx={7.5} cy={-4} r={4.2} className={s.eyeWhite} />
            <circle cx={-7} cy={-3.5} r={1.7} className={s.inkFill} />
            <circle cx={8} cy={-3.5} r={1.7} className={s.inkFill} />
          </>
        ) : (
          <>
            <circle cx={-7.5} cy={-3} r={2.5} className={s.inkFill} />
            <circle cx={7.5} cy={-3} r={2.5} className={s.inkFill} />
          </>
        )}
        {mood !== 'calm' && (
          <>
            <Rough shape={{ k: 'line', x1: -12, y1: mood === 'panic' ? -13 : -9, x2: -4, y2: mood === 'panic' ? -11 : -11 }} seed={611} strokeWidth={1.6} roughness={0.5} />
            <Rough shape={{ k: 'line', x1: 4, y1: mood === 'panic' ? -11 : -11, x2: 12, y2: mood === 'panic' ? -13 : -9 }} seed={612} strokeWidth={1.6} roughness={0.5} />
          </>
        )}
        {mood === 'calm' && (
          <Rough
            shape={{
              k: 'curve',
              pts: [
                [-8, 5],
                [0, 11],
                [8, 5],
              ],
            }}
            seed={606}
            strokeWidth={1.9}
            roughness={0.5}
          />
        )}
        {mood === 'busy' && (
          <Rough
            shape={{
              k: 'lin',
              pts: [
                [-7, 9],
                [-2, 7.5],
                [3, 9.5],
                [7, 8],
              ],
            }}
            seed={607}
            strokeWidth={1.8}
            roughness={0.5}
          />
        )}
        {mood === 'panic' && <Rough shape={{ k: 'ellipse', cx: 0, cy: 9, w: 9, h: 8 }} seed={608} strokeWidth={1.6} fillColor="var(--ink)" fillStyle="solid" />}
      </g>
      {mood !== 'calm' && (
        <Rough shape={{ k: 'path', d: 'M25 -14 Q20 -5 25 -2 Q30 -5 25 -14 Z' }} seed={609} strokeWidth={1.3} stroke="var(--pen)" fillColor="var(--hl-blue-ink)" fillStyle="solid" />
      )}
      {mood === 'panic' && (
        <Rough shape={{ k: 'path', d: 'M-26 -10 Q-31 -1 -26 2 Q-21 -1 -26 -10 Z' }} seed={610} strokeWidth={1.3} stroke="var(--pen)" fillColor="var(--hl-blue-ink)" fillStyle="solid" />
      )}
    </g>
  )
}

/** Shared SVG defs: tray (= one request), pencil hatch. Ids are prefixed per drawing. */
export function TrayDefs({ id }: { id: string }) {
  return (
    <defs>
      <symbol id={`${id}-tray`} viewBox="-10 -7 20 14" overflow="visible">
        <path d="M-9 -2.5 L9 -3 L7.5 3.2 L-7.5 3.5 Z" className={s.trayBody} />
        <ellipse cx={-2} cy={-2.6} rx={3.6} ry={1.7} className={s.trayPlate} />
        <rect x={3} y={-5.4} width={3} height={3.4} rx={0.6} className={s.trayCup} />
      </symbol>
      <pattern id={`${id}-hatch`} width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(-40)">
        <line x1={0} y1={0} x2={0} y2={4} className={s.hatchLine} />
      </pattern>
    </defs>
  )
}

/**
 * Speech bubble: an ellipse with a short, curved wedge tail aimed at the speaker's mouth (tx, ty).
 * The tail never reaches the mouth (max `tail` units), so the bubble sits close to the head, like in a comic.
 * Lines of speech are written in Kalam (centred, `size` units).
 */
export function Bubble({
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
  x: number
  y: number
  w: number
  h: number
  tx: number
  ty: number
  lines: string[]
  size?: number
  seed?: number
  tail?: number
  tone?: 'ink' | 'red'
}) {
  const cx = x + w / 2
  const cy = y + h / 2
  // the ellipse always grows to hold its words (Kalam ≈ 0,48 em per character; corners of the text block inside)
  const lh = size * 1.12
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
  // the tail bends a little, like a quick pen stroke
  const bend = (p: Pt, k: number): Pt => [(p[0] + tip[0]) / 2 - Math.sin(a) * k, (p[1] + tip[1]) / 2 + Math.cos(a) * k]
  const c1 = bend(b1, 3)
  const c2 = bend(b2, 3)
  const d = `M${b1[0]} ${b1[1]} Q${c1[0]} ${c1[1]} ${tip[0]} ${tip[1]} Q${c2[0]} ${c2[1]} ${b2[0]} ${b2[1]}`
  const top = cy - ((lines.length - 1) * lh) / 2 + size * 0.34
  return (
    <g>
      <Rough shape={{ k: 'ellipse', cx, cy, w: rx * 2, h: ry * 2 }} seed={seed} strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" roughness={0.9} />
      <Rough shape={{ k: 'path', d }} seed={seed + 1} strokeWidth={1.5} fillColor="var(--paper)" fillStyle="solid" roughness={0.6} />
      {lines.map((l, i) => (
        <text key={i} x={cx} y={top + i * lh} textAnchor="middle" className={s.svgPrint} style={{ fontSize: size, fill: tone === 'red' ? 'var(--red)' : 'var(--ink)' }}>
          {l}
        </text>
      ))}
    </g>
  )
}

/** Kubernetes helm wheel, drawn by hand (brand mark + control plane). */
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

/** Davor peeking in over an edge, hood up (margin doodle). Local: edge line at y = 0, ≈ 90 wide. */
export function PeekDavor() {
  return (
    <g>
      <Rough shape={{ k: 'path', d: 'M15 6 Q12 -34 45 -36 Q78 -34 75 6' }} seed={850} strokeWidth={1.8} fillColor="var(--hl-green-ink)" hachureGap={3.4} fillWeight={1.3} />
      <Rough shape={{ k: 'path', d: 'M23 6 Q22 -14 45 -16 Q68 -14 67 6' }} seed={851} strokeWidth={1.9} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'lin', pts: [[30, -11], [35, -6], [40, -13], [46, -6], [52, -12], [58, -6]] }} seed={852} strokeWidth={1.6} />
      <circle cx={38} cy={1} r={2} className={s.inkFill} />
      <circle cx={52} cy={1} r={2} className={s.inkFill} />
      <Rough shape={{ k: 'ellipse', cx: 14, cy: 2, w: 16, h: 11 }} seed={854} strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'ellipse', cx: 76, cy: 2, w: 16, h: 11 }} seed={855} strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'line', x1: -8, y1: 6, x2: 98, y2: 6 }} seed={856} strokeWidth={1.8} />
    </g>
  )
}

/** A coffee-mug ring stain (or a chalk smudge on the board). */
export function CoffeeRing({ seed = 861 }: { seed?: number }) {
  return (
    <g className={s.coffee}>
      <Rough shape={{ k: 'ellipse', cx: 50, cy: 50, w: 88, h: 84 }} seed={seed} strokeWidth={5} roughness={1.6} stroke="var(--coffee)" />
      <Rough shape={{ k: 'arc', cx: 50, cy: 50, w: 80, h: 76, start: 0.6, stop: 3.4 }} seed={seed + 1} strokeWidth={2} roughness={1.4} stroke="var(--coffee)" />
    </g>
  )
}
