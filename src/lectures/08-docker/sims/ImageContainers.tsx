import { Diagram, DLabel, Edge, Figure, FoodBox, Rough, TrayStack, useWidth } from '../../../kit'
import { Padlock } from './Drawn'

type P = [number, number]

const CONTAINERS = [
  { name: 'api-1', file: 'narudzbe.log' },
  { name: 'api-2', file: 'zapis.log' },
  { name: 'api-3', file: '(još prazan)' },
]

interface Geo {
  W: number
  H: number
  mono: number
  hand: number
  stack: { x: number; y: number; w: number; h: number }
  caption: P
  lock: P
  from: (i: number) => P
  box: (i: number) => { x: number; y: number }
  boxW: number
  note: (i: number) => { x: number; y: number; w: number }
  runLabel: P
}

const WIDE: Geo = {
  W: 720,
  H: 270,
  mono: 13,
  hand: 13,
  stack: { x: 30, y: 64, w: 150, h: 116 },
  caption: [105, 214],
  lock: [52, 240],
  from: () => [192, 128],
  box: (i) => ({ x: 410, y: 22 + i * 82 }),
  boxW: 124,
  note: (i) => ({ x: 550, y: 26 + i * 82, w: 162 }),
  runLabel: [296, 40],
}

const NARROW: Geo = {
  W: 360,
  H: 470,
  mono: 14,
  hand: 14,
  stack: { x: 100, y: 18, w: 160, h: 112 },
  caption: [180, 160],
  lock: [110, 188],
  from: () => [180, 204],
  box: (i) => ({ x: 12, y: 250 + i * 76 }),
  boxW: 120,
  note: (i) => ({ x: 146, y: 254 + i * 76, w: 204 }),
  runLabel: [190, 230],
}

/** One image, three containers – each with its own thin writable layer (class and objects). */
export function ImageContainers() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const wide = w === null || w >= 665
  const G = wide ? WIDE : NARROW
  return (
    <div>
      <Figure caption="Jedna slika (klasa), tri kontejnera (objekta). Slika se na disku čuva jednom; svaki kontejner ima samo svoj tanki zapisivi sloj.">
        <div ref={ref} style={{ maxWidth: wide ? 760 : 460, margin: '0 auto' }}>
          <Diagram width={G.W} height={G.H} label="Iz jedne slike kontejnera pokrenuta su tri kontejnera; svaki ima vlastiti zapisivi sloj s drugim datotekama.">
            <TrayStack x={G.stack.x} y={G.stack.y} w={G.stack.w} h={G.stack.h} n={3} labels={['FROM', 'COPY', 'RUN']} labelSize={G.mono} seed={5331} />
            <DLabel x={G.caption[0]} y={G.caption[1]} text="slika klopa-api:1.3.2" mono size={G.mono} bold />
            <Padlock x={G.lock[0]} y={G.lock[1] - 6} />
            <DLabel x={G.lock[0] + 16} y={G.lock[1]} text="samo za čitanje" size={G.hand} anchor="start" />
            <DLabel x={G.runLabel[0]} y={G.runLabel[1]} text="docker run ×3" mono size={G.mono} tone="blue" />
            {CONTAINERS.map((c, i) => {
              const b = G.box(i)
              const n = G.note(i)
              const to: P = wide ? [b.x - 6, b.y + 26] : [b.x + G.boxW / 2, b.y - 6]
              return (
                <g key={c.name}>
                  <Edge from={G.from(i)} to={to} tone="blue" curve={wide ? (i - 1) * 0.08 : (i - 1) * -0.05} />
                  <FoodBox x={b.x} y={b.y} w={G.boxW} h={50} label={c.name} labelSize={G.mono} seed={5141 + i * 3} />
                  <Rough shape={{ k: 'rect', x: n.x, y: n.y, w: n.w, h: 42 }} seed={5161 + i} strokeWidth={1.5} stroke="var(--green)" dash="6 5" />
                  <text x={n.x + 10} y={n.y + 27} className="k-svg-mono" style={{ fontSize: G.mono, fill: i === 2 ? 'var(--ink-3)' : 'var(--green)', fontWeight: 600 }}>
                    {c.file}
                  </text>
                  {i === 0 && <DLabel x={n.x + n.w / 2} y={n.y - 4} text="zapisivi sloj" size={G.hand} tone="green" />}
                </g>
              )
            })}
          </Diagram>
        </div>
      </Figure>
    </div>
  )
}
