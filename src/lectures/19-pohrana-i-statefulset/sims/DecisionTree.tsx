/**
 * Scene 6 figure: where should Klopa's Postgres live? Managed database → operator → StatefulSet, as a pencil decision
 * tree (questions in boxes, answers on the arrows, the course's choice circled).
 */
import { Arrow, Cloud, Fridge, LoopArrows, MiniLunchbox, Rough, useWidth } from '../../../kit'

interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface Node {
  box: Box
  title: string
  lines: string[]
  kind: 'q' | 'leaf'
  /** grammar doodle in the leaf's lower-right corner: cloud = provider, loop = controller, lunchbox + fridge = Pod + PV */
  doodle?: 'cloud' | 'loop' | 'sts'
}

interface Geo {
  W: number
  H: number
  nodes: Node[]
  arrows: { pts: [number, number][]; label: string; at: [number, number] }[]
  circle: Box
  note: [number, number]
  /** how much wider / taller than the box the red-pencil ellipse is (it must clear every letter) */
  ring: [number, number]
}

const T = {
  q1: { title: 'Smijete li bazu prepustiti pružatelju?', lines: ['plaćate uslugu, a ne poslužitelje'] },
  managed: { title: 'Upravljana baza', lines: ['replikaciju i sigurnosne kopije', 'radi pružatelj – preporuka'], doodle: 'cloud' as const },
  q2: { title: 'Treba li replikacija i preuzimanje rada?', lines: ['a baza mora ostati u klasteru'] },
  operator: { title: 'Operator (npr. CloudNativePG)', lines: ['CRD + kontroler koji zna Postgres:', 'replike, preuzimanje rada,', 'sigurnosne kopije'], doodle: 'loop' as const },
  sts: { title: 'StatefulSet + PVC', lines: ['učenje, razvoj, mali sustavi', 'ovaj tečaj'], doodle: 'sts' as const },
}
const NOTE = ['sigurnosne kopije (snimka diska,', 'pg_dump) trebate uvijek']

const WIDE: Geo = {
  W: 720,
  H: 356,
  nodes: [
    { box: { x: 8, y: 8, w: 324, h: 74 }, ...T.q1, kind: 'q' },
    { box: { x: 410, y: 8, w: 302, h: 80 }, ...T.managed, kind: 'leaf' },
    { box: { x: 8, y: 126, w: 324, h: 74 }, ...T.q2, kind: 'q' },
    { box: { x: 410, y: 126, w: 302, h: 102 }, ...T.operator, kind: 'leaf' },
    { box: { x: 8, y: 244, w: 324, h: 80 }, ...T.sts, kind: 'leaf' },
  ],
  arrows: [
    { pts: [[332, 45], [408, 45]], label: 'da', at: [360, 36] },
    { pts: [[170, 82], [170, 124]], label: 'ne', at: [184, 108] },
    { pts: [[332, 163], [408, 163]], label: 'da', at: [360, 154] },
    { pts: [[170, 200], [170, 242]], label: 'ne', at: [184, 216] },
  ],
  circle: { x: 6, y: 240, w: 330, h: 88 },
  note: [384, 290],
  ring: [60, 36],
}

const NARROW: Geo = {
  W: 360,
  H: 616,
  nodes: [
    { box: { x: 6, y: 6, w: 348, h: 74 }, ...T.q1, kind: 'q' },
    { box: { x: 40, y: 110, w: 292, h: 80 }, ...T.managed, kind: 'leaf' },
    { box: { x: 6, y: 214, w: 348, h: 74 }, ...T.q2, kind: 'q' },
    { box: { x: 40, y: 318, w: 292, h: 102 }, ...T.operator, kind: 'leaf' },
    { box: { x: 40, y: 454, w: 292, h: 80 }, ...T.sts, kind: 'leaf' },
  ],
  arrows: [
    { pts: [[20, 80], [20, 147], [38, 147]], label: 'da', at: [26, 104] },
    { pts: [[344, 80], [344, 212]], label: 'ne', at: [306, 102] },
    { pts: [[20, 288], [20, 368], [38, 368]], label: 'da', at: [26, 312] },
    { pts: [[344, 288], [344, 494], [334, 494]], label: 'ne', at: [306, 308] },
  ],
  circle: { x: 34, y: 450, w: 304, h: 88 },
  note: [40, 584],
  ring: [40, 36],
}

function LeafDoodle({ kind, b, seed }: { kind: Node['doodle']; b: Box; seed: number }) {
  const x = b.x + b.w - 50
  const y = b.y + b.h - 40
  if (kind === 'cloud') return <Cloud x={x - 4} y={y + 2} w={48} h={32} seed={seed} />
  if (kind === 'loop') return <LoopArrows cx={x + 22} cy={y + 16} r={15} seed={seed} check />
  if (kind === 'sts')
    return (
      <g>
        <MiniLunchbox x={x - 14} y={y + 8} w={30} h={24} seed={seed} tint="var(--hl-green-ink)" />
        <Fridge x={x + 22} y={y - 4} w={22} h={36} seed={seed + 1} />
      </g>
    )
  return null
}

function Card({ n, seed, hand }: { n: Node; seed: number; hand: number }) {
  const b = n.box
  return (
    <g>
      <Rough shape={{ k: 'rect', x: b.x, y: b.y, w: b.w, h: b.h }} seed={seed} stroke={n.kind === 'q' ? 'var(--ink-2)' : 'var(--ink)'} strokeWidth={n.kind === 'q' ? 1.4 : 1.8} dash={n.kind === 'q' ? '6 4' : undefined} fillColor="var(--paper)" fillStyle="solid" />
      <text x={b.x + 12} y={b.y + 24} className="k-svg-display" style={{ fontSize: 15, fontWeight: 800, fill: 'var(--ink)' }}>
        {n.title}
      </text>
      {n.lines.map((l, i) => (
        <text key={l} x={b.x + 12} y={b.y + 46 + i * 22} className="k-svg-hand" style={{ fontSize: hand, fill: n.kind === 'q' ? 'var(--ink-2)' : 'var(--pen)' }}>
          {l}
        </text>
      ))}
      {n.doodle && <LeafDoodle kind={n.doodle} b={b} seed={seed + 50} />}
    </g>
  )
}

export function DecisionTree() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const g = w !== null && w < 650 ? NARROW : WIDE
  const narrow = g === NARROW
  return (
    <div ref={ref} style={narrow ? { maxWidth: 440, margin: '0 auto' } : undefined}>
      <svg
        viewBox={`0 0 ${g.W} ${g.H}`}
        role="img"
        aria-label="Stablo odluke: ako bazu smijete prepustiti pružatelju, uzmite upravljanu bazu (preporuka za Klopu). Ako ne, a trebaju vam replikacija i preuzimanje rada, uzmite operator, npr. CloudNativePG. Inače, za učenje i razvoj, StatefulSet s PVC-om, kao u ovom tečaju. Sigurnosne kopije trebate u svakom slučaju."
        style={{ display: 'block', width: '100%', height: 'auto' }}
      >
        {g.arrows.map((a, i) => (
          <g key={i}>
            <Arrow pts={a.pts} stroke="var(--ink-2)" strokeWidth={1.7} seed={20300 + i} />
            {a.label && (
              <text x={a.at[0]} y={a.at[1]} className="k-svg-hand" style={{ fontSize: narrow ? 20 : 19, fontWeight: 700, fill: a.label === 'da' ? 'var(--green)' : 'var(--red)' }}>
                {a.label}
              </text>
            )}
          </g>
        ))}
        {g.nodes.map((n, i) => (
          <Card key={n.title} n={n} seed={20320 + i * 3} hand={narrow ? 20 : 19} />
        ))}
        <Rough shape={{ k: 'ellipse', cx: g.circle.x + g.circle.w / 2, cy: g.circle.y + g.circle.h / 2, w: g.circle.w + g.ring[0], h: g.circle.h + g.ring[1] }} seed={20390} stroke="var(--red)" strokeWidth={2} multi />
        {NOTE.map((l, i) => (
          <text key={l} x={g.note[0]} y={g.note[1] + i * 24} className="k-svg-hand" style={{ fontSize: narrow ? 20 : 19, fill: 'var(--red)' }}>
            {!narrow && i === 0 ? `← ${l}` : l}
          </text>
        ))}
      </svg>
    </div>
  )
}
