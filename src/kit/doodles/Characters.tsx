import { memo, type ReactNode } from 'react'
import { Rough } from '../sketch/Sketch'
import type { Pt } from '../sketch/roughGen'
import { BUILDS, STUDENTS, SWEAT_DROPS, dropPath, type Build, type CharacterProps, type Hair, type Holding, type Mood } from './types'

/* =====================================================================
   People. Local box ≈ 80 × 120 (feet of a standing student at y = 146),
   head centre (40, 28). Same pen for everyone. Place with x/y/scale
   inside any <svg>; wrap in <Boil> for the hand-drawn shimmer.
   ===================================================================== */

export interface PersonProps {
  x?: number
  y?: number
  scale?: number
  hair: Hair
  mood?: Mood
  glasses?: boolean
  /** marker colour of the hatched shirt (a --hl-*-ink token) */
  shirt?: string
  holding?: Holding
  seed?: number
  /** hide the right arm (the redar draws its own pointing arm) */
  noRightArm?: boolean
  flip?: boolean
  build?: Build
  /** rosy cheeks (teta Mira) */
  cheeks?: boolean
  /** the pager in the hand is buzzing (alert) */
  buzz?: boolean
  /** round earrings (Petra) */
  earrings?: boolean
  /** extra drawing in the person's local coordinates */
  children?: ReactNode
}

function HairShape({ hair, seed }: { hair: Hair; seed: number }) {
  switch (hair) {
    case 'pony':
      return (
        <>
          <Rough shape={{ k: 'curve', pts: [[22, 30], [24, 14], [38, 8], [52, 11], [58, 26]] }} seed={seed} strokeWidth={2} />
          <Rough shape={{ k: 'curve', pts: [[56, 15], [67, 19], [70, 33], [63, 47]] }} seed={seed + 1} strokeWidth={2} />
          <Rough shape={{ k: 'curve', pts: [[58, 18], [64, 26], [62, 40]] }} seed={seed + 2} strokeWidth={1.2} />
          <Rough shape={{ k: 'lin', pts: [[30, 12], [36, 20], [44, 11]] }} seed={seed + 3} strokeWidth={1.4} />
        </>
      )
    case 'bun':
      return (
        <>
          <Rough shape={{ k: 'curve', pts: [[23, 26], [27, 12], [40, 9], [53, 12], [57, 26]] }} seed={seed} strokeWidth={2} />
          <Rough shape={{ k: 'ellipse', cx: 40, cy: 5, w: 14, h: 11 }} seed={seed + 1} strokeWidth={1.8} fillColor="var(--ink)" fillStyle="hachure" hachureGap={2.5} />
        </>
      )
    case 'buns':
      // Iva: two high space buns — reads even as a tiny doodle
      return (
        <>
          <Rough shape={{ k: 'curve', pts: [[23, 27], [26, 13], [40, 9], [54, 13], [57, 27]] }} seed={seed} strokeWidth={2} />
          <Rough shape={{ k: 'ellipse', cx: 26, cy: 9, w: 15, h: 14 }} seed={seed + 1} strokeWidth={1.8} fillColor="var(--ink)" hachureGap={2.4} />
          <Rough shape={{ k: 'ellipse', cx: 54, cy: 9, w: 15, h: 14 }} seed={seed + 2} strokeWidth={1.8} fillColor="var(--ink)" hachureGap={2.4} hachureAngle={41} />
          <Rough shape={{ k: 'lin', pts: [[31, 15], [37, 21], [42, 14], [48, 20]] }} seed={seed + 3} strokeWidth={1.3} />
        </>
      )
    case 'bob':
      // Petra: straight chin-length bob with a blunt fringe
      return (
        <>
          <Rough shape={{ k: 'path', d: 'M20 42 Q17 10 40 7 Q63 10 60 42 L54 42 Q56 24 52 20 L28 20 Q24 24 26 42 Z' }} seed={seed} strokeWidth={1.9} fillColor="var(--ink)" hachureGap={3.2} />
          <Rough shape={{ k: 'line', x1: 27, y1: 21, x2: 53, y2: 20 }} seed={seed + 1} strokeWidth={1.6} />
        </>
      )
    case 'short':
      return (
        <>
          <Rough shape={{ k: 'curve', pts: [[23, 25], [27, 11], [40, 8], [53, 11], [57, 25]] }} seed={seed} strokeWidth={2} />
          <Rough shape={{ k: 'lin', pts: [[29, 13], [34, 20], [40, 13], [46, 20], [52, 14]] }} seed={seed + 1} strokeWidth={1.5} />
        </>
      )
    case 'curly':
      return <Rough shape={{ k: 'curve', pts: [[21, 32], [18, 18], [27, 8], [40, 4], [53, 8], [62, 18], [59, 32]] }} seed={seed} strokeWidth={2.2} roughness={2.6} multi />
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
      return <Rough shape={{ k: 'lin', pts: [[27, 17], [31, 12], [34, 19], [39, 11], [43, 18], [48, 12], [52, 18]] }} seed={seed} strokeWidth={1.7} roughness={0.9} />
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
      {glasses && (
        <>
          <Rough shape={{ k: 'ellipse', cx: 33, cy: 29, w: 11, h: 10 }} seed={seed} strokeWidth={1.4} />
          <Rough shape={{ k: 'ellipse', cx: 47, cy: 29, w: 11, h: 10 }} seed={seed + 1} strokeWidth={1.4} />
          <Rough shape={{ k: 'line', x1: 38, y1: 29, x2: 42, y2: 29 }} seed={seed + 2} strokeWidth={1.2} />
        </>
      )}
      <circle cx={33.5} cy={29.5} r={1.9} className="k-ink-fill" />
      <circle cx={46.5} cy={29.5} r={1.9} className="k-ink-fill" />
      {mood === 'smile' && <Rough shape={{ k: 'curve', pts: [[34, 37], [40, 41], [46, 37]] }} seed={seed + 3} strokeWidth={1.6} roughness={0.6} />}
      {mood === 'grin' && <Rough shape={{ k: 'path', d: 'M33 36 Q40 46 47 36 Z' }} seed={seed + 3} strokeWidth={1.5} fillColor="var(--ink)" fillStyle="solid" roughness={0.5} />}
      {mood === 'flat' && <Rough shape={{ k: 'line', x1: 35, y1: 39, x2: 45, y2: 39 }} seed={seed + 3} strokeWidth={1.6} roughness={0.5} />}
      {mood === 'worry' && (
        <>
          <Rough shape={{ k: 'curve', pts: [[34, 41], [40, 37], [46, 41]] }} seed={seed + 3} strokeWidth={1.6} roughness={0.6} />
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
            <g className="k-buzz">
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
          <text x={40} y={92} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 14, fontWeight: 600 }} aria-hidden="true">
            {'</>'}
          </text>
        </g>
      )
    case 'mug':
      return (
        <g>
          <Rough shape={{ k: 'rect', x: 58, y: 74, w: 13, h: 15 }} seed={seed} strokeWidth={1.5} fillColor="var(--paper)" fillStyle="solid" />
          <Rough shape={{ k: 'arc', cx: 71, cy: 81, w: 9, h: 9, start: -Math.PI / 2, stop: Math.PI / 2 }} seed={seed + 1} strokeWidth={1.4} />
          <Rough shape={{ k: 'curve', pts: [[62, 70], [60, 64], [64, 59], [62, 53]] }} seed={seed + 2} strokeWidth={1.1} stroke="var(--ink-3)" />
          <Rough shape={{ k: 'curve', pts: [[67, 70], [65, 64], [69, 59]] }} seed={seed + 3} strokeWidth={1.1} stroke="var(--ink-3)" />
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
          <Rough shape={{ k: 'poly', pts: [[48, 82], [80, 82], [76, 90], [52, 90]] }} seed={seed} strokeWidth={1.5} fillColor="var(--tray)" fillStyle="solid" />
          <Rough shape={{ k: 'ellipse', cx: 62, cy: 81, w: 12, h: 5 }} seed={seed + 1} strokeWidth={1.2} fillColor="var(--paper)" fillStyle="solid" />
        </g>
      )
    case 'clipboard':
      // Petra's requirements: a clipboard with a ticked list
      return (
        <g>
          <Rough shape={{ k: 'rect', x: 54, y: 66, w: 22, h: 28 }} seed={seed} strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" />
          <Rough shape={{ k: 'rect', x: 60, y: 63, w: 10, h: 5 }} seed={seed + 1} strokeWidth={1.2} fillColor="var(--ink-3)" fillStyle="solid" />
          <Rough shape={{ k: 'lin', pts: [[57, 75], [59, 77], [62, 73]] }} seed={seed + 2} strokeWidth={1.3} stroke="var(--green)" roughness={0.5} />
          <Rough shape={{ k: 'line', x1: 64, y1: 75, x2: 73, y2: 75 }} seed={seed + 3} strokeWidth={1} roughness={0.5} />
          <Rough shape={{ k: 'lin', pts: [[57, 83], [59, 85], [62, 81]] }} seed={seed + 4} strokeWidth={1.3} stroke="var(--green)" roughness={0.5} />
          <Rough shape={{ k: 'line', x1: 64, y1: 83, x2: 72, y2: 83 }} seed={seed + 5} strokeWidth={1} roughness={0.5} />
          <Rough shape={{ k: 'line', x1: 58, y1: 90, x2: 70, y2: 90 }} seed={seed + 6} strokeWidth={1} roughness={0.5} />
        </g>
      )
    case 'note':
      // Iva's sticky note with a question mark (fresh eyes, new questions)
      return (
        <g>
          <Rough shape={{ k: 'rect', x: 55, y: 66, w: 20, h: 19 }} seed={seed} strokeWidth={1.3} fillColor="var(--note-yellow)" fillStyle="solid" />
          {/* part of the drawing (a glyph on the note, not lettering to read): hidden from screen readers */}
          <text x={65} y={81} textAnchor="middle" className="k-svg-hand" aria-hidden="true" style={{ fontSize: 16, fill: 'var(--red)' }}>
            ?
          </text>
        </g>
      )
    default:
      return null
  }
}

/** A person in the notebook's hand. The named characters below are presets of this. */
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
  earrings,
  children,
}: PersonProps) {
  const b = BUILDS[build]
  const rightHand: Pt = holding === 'laptop' ? [62, 74] : b.rightHand
  const leftHand: Pt = holding === 'laptop' ? [18, 74] : b.leftHand
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})${flip ? ' translate(-80 0)' : ''}`}>
      {/* hood behind the head (Davor) */}
      {build === 'hoodie' && <Rough shape={{ k: 'ellipse', cx: 40, cy: 31, w: 52, h: 52 }} seed={seed + 9} strokeWidth={1.8} fillColor={shirt} hachureGap={3.6} fillWeight={1.4} hachureAngle={-50} />}
      {/* backpack behind the left shoulder (Iva) */}
      {build === 'tee' && <Rough shape={{ k: 'rect', x: 9, y: 58, w: 16, h: 40 }} seed={seed + 8} strokeWidth={1.7} fillColor="var(--hl-yellow-ink)" hachureGap={3.4} hachureAngle={41} />}
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
      {build === 'blazer' && (
        <g>
          {/* white shirt V, lapels and two buttons (Petra) */}
          <Rough shape={{ k: 'poly', pts: [[33, 52], [47, 52], [40, 72]] }} seed={seed + 14} strokeWidth={1.3} fillColor="var(--paper)" fillStyle="solid" />
          <Rough shape={{ k: 'lin', pts: [[31, 52], [36, 66], [40, 74]] }} seed={seed + 15} strokeWidth={1.4} />
          <Rough shape={{ k: 'lin', pts: [[49, 52], [44, 66], [40, 74]] }} seed={seed + 16} strokeWidth={1.4} />
          <circle cx={40} cy={86} r={1.8} className="k-ink-fill" />
          <circle cx={40} cy={99} r={1.8} className="k-ink-fill" />
        </g>
      )}
      {build === 'tee' && (
        <g>
          {/* backpack strap across the shoulder and a round neckline (Iva) */}
          <Rough shape={{ k: 'lin', pts: [[24, 58], [30, 76], [33, 96]] }} seed={seed + 14} strokeWidth={2.4} />
          <Rough shape={{ k: 'curve', pts: [[34, 52], [40, 57], [46, 52]] }} seed={seed + 15} strokeWidth={1.3} roughness={0.5} />
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
      {earrings && (
        <g>
          <Rough shape={{ k: 'ellipse', cx: 23, cy: 40, w: 5, h: 5 }} seed={seed + 21} strokeWidth={1.2} stroke="var(--hl-yellow-ink)" />
          <Rough shape={{ k: 'ellipse', cx: 57, cy: 40, w: 5, h: 5 }} seed={seed + 22} strokeWidth={1.2} stroke="var(--hl-yellow-ink)" />
        </g>
      )}
      <HairShape hair={hair} seed={seed + 20} />
      <Face mood={mood} seed={seed + 30} glasses={glasses} />
      <Item holding={holding} seed={seed + 40} buzz={buzz} />
      {children}
    </g>
  )
})

/** Lana — backend developer: slim, ponytail, glasses, laptop `</>`. */
export function Lana({ holding = 'laptop', ...p }: CharacterProps) {
  return <Person hair="pony" glasses shirt="var(--hl-blue-ink)" holding={holding} seed={101} {...p} />
}

/** Davor — ops / on-call: hoodie with the hood up, messy fringe, a pager that buzzes (red) while errors arrive. */
export function Davor({ holding = 'pager', buzz, ...p }: CharacterProps & { buzz?: boolean }) {
  return <Person hair="messy" build="hoodie" shirt="var(--hl-green-ink)" holding={holding} buzz={buzz} seed={202} {...p} />
}

/** Teta Mira — runs the canteen kitchen: wide, apron with a pocket, rosy cheeks, chef's hat, ladle. */
export function Mira({ holding = 'ladle', ...p }: CharacterProps) {
  return <Person hair="chef" build="wide" cheeks shirt="var(--hl-pink-ink)" holding={holding} seed={303} {...p} />
}

/** Petra — product: blunt bob, square-shouldered blazer with lapels, round earrings, clipboard of requirements. */
export function Petra({ holding = 'clipboard', ...p }: CharacterProps) {
  return <Person hair="bob" build="blazer" earrings shirt="var(--hl-orange-ink)" holding={holding} seed={606} {...p} />
}

/** Iva — the new teammate (from L06/L07): two high buns, t-shirt and backpack, a sticky note with a question. */
export function Iva({ holding = 'note', ...p }: CharacterProps) {
  return <Person hair="buns" build="tee" shirt="var(--hl-lilac-ink)" holding={holding} seed={707} {...p} />
}

/**
 * The load balancer: a redar (person directing traffic) in a hi-vis vest with "LB" on it.
 * Local origin (0, 0) = the point trays pass through (feet at ≈ +58); the right arm points at `angle` (radians).
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
  tag = true,
}: {
  x: number
  y: number
  scale?: number
  /** direction of the pointing arm with the lollipop sign, radians (0 = right) */
  angle?: number
  mood?: Mood
  /** draw the pointing arm (false when you animate your own) */
  arm?: boolean
  /** 0..3 sweat drops: how worried the redar is about full queues */
  sweat?: number
  /** turn the arm slowly (explainers) instead of snapping (live simulation) */
  slowArm?: boolean
  /** the „LB” name tag on the vest (default true); turn it off when the redar is drawn small (scale < 0.7) and label him outside */
  tag?: boolean
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {SWEAT_DROPS.slice(0, sweat).map((d, i) => (
        <Rough key={i} shape={{ k: 'path', d: dropPath(d[0], d[1], d[2]) }} seed={413 + i} strokeWidth={1.3} stroke="var(--pen)" fillColor="var(--hl-blue-ink)" fillStyle="solid" />
      ))}
      <g transform="translate(-40 -88)">
        <Person hair="cap" mood={mood} shirt="var(--hl-yellow-ink)" seed={404} noRightArm>
          <Rough shape={{ k: 'line', x1: 22, y1: 92, x2: 58, y2: 92 }} seed={405} strokeWidth={3} stroke="var(--vest-stripe)" roughness={0.6} />
          <Rough shape={{ k: 'line', x1: 20, y1: 102, x2: 60, y2: 102 }} seed={406} strokeWidth={3} stroke="var(--vest-stripe)" roughness={0.6} />
          {/* "LB" on a paper name tag: readable on the yellow hatching, on paper and on the board */}
          {tag && (
            <g>
              <rect x={26.5} y={69} width={27} height={20} rx={2} transform="rotate(-3 40 79)" style={{ fill: 'var(--note-yellow)', stroke: 'var(--ink)', strokeWidth: 1.1 }} />
              <text x={40} y={85.5} textAnchor="middle" className="k-svg-display" style={{ fontSize: 17.5, fill: 'var(--note-ink)' }} transform="rotate(-3 40 79)">
                LB
              </text>
            </g>
          )}
          <Rough shape={{ k: 'lin', pts: [[30, 116], [27, 146]] }} seed={407} strokeWidth={1.8} />
          <Rough shape={{ k: 'lin', pts: [[50, 116], [54, 146]] }} seed={408} strokeWidth={1.8} />
        </Person>
      </g>
      {arm && (
        <g transform="translate(13 -28)">
          <g className={`k-redar-arm${slowArm ? ' k-redar-arm--slow' : ''}`} style={{ transform: `rotate(${(angle * 180) / Math.PI}deg)` }}>
            <Rough shape={{ k: 'lin', pts: [[0, 0], [34, 0]] }} seed={409} strokeWidth={1.9} />
            <Rough shape={{ k: 'line', x1: 34, y1: 0, x2: 46, y2: 0 }} seed={410} strokeWidth={1.6} />
            <Rough shape={{ k: 'ellipse', cx: 53, cy: 0, w: 15, h: 15 }} seed={411} strokeWidth={1.7} fillColor="var(--red)" fillStyle="solid" />
            <Rough shape={{ k: 'ellipse', cx: 53, cy: 0, w: 7, h: 7 }} seed={412} strokeWidth={1} fillColor="var(--paper)" fillStyle="solid" />
          </g>
        </g>
      )}
    </g>
  )
})

/**
 * A student waiting in line (with legs). `tap` makes one foot tap impatiently (CSS, cheap).
 * Local box ≈ 80 × 146, feet at y = 146. `variant` picks hair and shirt (anonymous students alternate).
 */
export const Student = memo(function Student({ variant = 0, tap, mood = 'smile', x = 0, y = 0, scale = 1 }: { variant?: number; tap?: boolean; mood?: Mood; x?: number; y?: number; scale?: number }) {
  const v = STUDENTS[((variant % STUDENTS.length) + STUDENTS.length) % STUDENTS.length]
  const seed = 520 + variant * 37
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <Rough shape={{ k: 'lin', pts: [[31, 114], [29, 145]] }} seed={seed + 1} strokeWidth={1.8} />
      <g className={tap ? 'k-tap' : undefined}>
        <Rough shape={{ k: 'lin', pts: [[49, 114], [51, 145], [60, 145]] }} seed={seed + 2} strokeWidth={1.8} />
      </g>
      <Rough shape={{ k: 'line', x1: 22, y1: 145, x2: 31, y2: 145 }} seed={seed + 3} strokeWidth={1.8} />
      <Person hair={v.hair} shirt={v.shirt} holding="phone" seed={seed} mood={mood} glasses={v.glasses} />
    </g>
  )
})

/**
 * A line of students (= traffic). Feet on y; the first student stands at x and the line grows to the left
 * (`direction` = -1) or right (+1). More students = more traffic; `tap` when the line is long.
 */
export const StudentQueue = memo(function StudentQueue({
  x,
  y,
  count,
  scale = 0.5,
  gap,
  direction = -1,
  tap,
  firstVariant = 0,
}: {
  x: number
  y: number
  count: number
  scale?: number
  /** distance between students in user units (default 46 × scale) */
  gap?: number
  direction?: 1 | -1
  tap?: boolean
  firstVariant?: number
}) {
  const step = gap ?? 46 * scale
  return (
    <g>
      {Array.from({ length: Math.max(0, count) }, (_, i) => (
        <Student key={i} variant={firstVariant + i} tap={tap && i % 3 === 1} x={x + direction * i * step - 40 * scale} y={y - 146 * scale} scale={scale} />
      ))}
    </g>
  )
})

/** A small crowd of students with phones (the source of requests). Local box ≈ 190 × 210. */
export const Crowd = memo(function Crowd({ x, y, scale = 1, label }: { x: number; y: number; scale?: number; label?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <Person x={70} y={0} scale={0.82} hair="bun" holding="phone" shirt="var(--hl-pink-ink)" seed={501} />
      <Person x={0} y={38} scale={0.9} hair="curly" holding="phone" shirt="var(--hl-green-ink)" seed={502} mood="grin" />
      <Person x={84} y={70} scale={0.95} hair="short" holding="phone" shirt="var(--hl-blue-ink)" seed={503} />
      {label && (
        <text x={92} y={200} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 20 }}>
          {label}
        </text>
      )}
    </g>
  )
})

/** Davor peeking in over an edge, hood up (margin doodle). Local: the edge line at y = 6, ≈ 90 wide. */
export function PeekDavor() {
  return (
    <g>
      <Rough shape={{ k: 'path', d: 'M15 6 Q12 -34 45 -36 Q78 -34 75 6' }} seed={850} strokeWidth={1.8} fillColor="var(--hl-green-ink)" hachureGap={3.4} fillWeight={1.3} />
      <Rough shape={{ k: 'path', d: 'M23 6 Q22 -14 45 -16 Q68 -14 67 6' }} seed={851} strokeWidth={1.9} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'lin', pts: [[30, -11], [35, -6], [40, -13], [46, -6], [52, -12], [58, -6]] }} seed={852} strokeWidth={1.6} />
      <circle cx={38} cy={1} r={2} className="k-ink-fill" />
      <circle cx={52} cy={1} r={2} className="k-ink-fill" />
      <Rough shape={{ k: 'ellipse', cx: 14, cy: 2, w: 16, h: 11 }} seed={854} strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'ellipse', cx: 76, cy: 2, w: 16, h: 11 }} seed={855} strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'line', x1: -8, y1: 6, x2: 98, y2: 6 }} seed={856} strokeWidth={1.8} />
    </g>
  )
}
