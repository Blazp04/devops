/**
 * Scene 3 figure: the four access modes as „who may plug into the fridge”. RWO = one node (Pods on it may share),
 * ROX = many nodes, read only, RWX = many nodes, read-write (needs a shared file system), RWOP = exactly one Pod.
 */
import { Check, Cross, PodShape, Rough, useWidth } from '../../../kit'
import { FridgeDisk } from './parts'

interface Mode {
  code: string
  name: string
  note: string
  /** per node: list of Pods with allowed ✓ / refused ✗ */
  nodes: [boolean[], boolean[]]
  /** read-only modes draw their cables dashed; `verb` = handwritten word beside the fridge */
  readOnly?: boolean
  verb?: string
}

const MODES: Mode[] = [
  { code: 'RWO', name: 'ReadWriteOnce', note: 'jedan čvor', nodes: [[true, true], [false]] },
  { code: 'ROX', name: 'ReadOnlyMany', note: 'više čvorova čita', nodes: [[true], [true]], readOnly: true, verb: 'čitaju' },
  { code: 'RWX', name: 'ReadWriteMany', note: 'više čvorova piše', nodes: [[true], [true]], verb: 'pišu' },
  { code: 'RWOP', name: 'ReadWriteOncePod', note: 'jedan Pod', nodes: [[true, false], []] },
]

function Panel({ m, x, y, seed, big }: { m: Mode; x: number; y: number; seed: number; big: boolean }) {
  const mono = big ? 14 : 13
  const hand = big ? 20 : 19
  const nodes = [
    { x: x + 4, name: 'node-1' },
    { x: x + 90, name: 'node-2' },
  ]
  const fx = x + 62
  const fy = y + 176
  return (
    <g>
      <text x={x + 4} y={y + 18} className="k-svg-mono" style={{ fontSize: mono + 2, fontWeight: 700, fill: 'var(--ink)' }}>
        {m.code}
      </text>
      <text x={x + 4} y={y + 36} className="k-svg-mono" style={{ fontSize: mono, fill: 'var(--ink-2)' }}>
        {m.name}
      </text>
      <text x={x + 4} y={y + 60} className="k-svg-hand" style={{ fontSize: hand, fill: 'var(--pen)' }}>
        {m.note}
      </text>
      {nodes.map((n, ni) => {
        const pods = m.nodes[ni]
        return (
          <g key={n.name}>
            <Rough shape={{ k: 'rect', x: n.x, y: y + 72, w: 80, h: 84 }} seed={seed + ni} stroke="var(--ink-2)" strokeWidth={1.4} />
            <text x={n.x + 6} y={y + 88} className="k-svg-mono" style={{ fontSize: mono, fill: 'var(--ink-2)' }}>
              {n.name}
            </text>
            {pods.map((ok, pi) => {
              const px = n.x + (pods.length === 1 ? 40 : 22 + pi * 36)
              const py = y + 118
              return (
                <g key={pi}>
                  <PodShape x={px} y={py} size={26} status={ok ? 'running' : 'creating'} tone="teal" ariaLabel={`Pod na ${n.name}: ${ok ? 'smije koristiti disk' : 'ne smije koristiti disk'}`} />
                  {ok ? <Check x={px} y={py + 26} size={9} /> : <Cross x={px} y={py + 26} size={8} />}
                  <Rough
                    shape={{ k: 'line', x1: px, y1: py + 34, x2: fx + 20, y2: fy }}
                    seed={seed + 10 + ni * 3 + pi}
                    stroke={ok ? 'var(--pen)' : 'var(--red)'}
                    strokeWidth={ok ? (m.readOnly ? 1.5 : 2.2) : 1.3}
                    dash={!ok ? '4 4' : m.readOnly ? '2 5' : undefined}
                    roughness={0.7}
                  />
                </g>
              )
            })}
          </g>
        )
      })}
      <FridgeDisk x={fx} y={fy} w={40} h={46} count={null} seed={seed + 30} />
      {m.verb && (
        <text x={fx + 46} y={fy + 30} className="k-svg-hand" style={{ fontSize: hand, fontWeight: 700, fill: 'var(--pen)' }}>
          {m.verb}
        </text>
      )}
    </g>
  )
}

export function AccessModes() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const narrow = w !== null && w < 650
  const W = narrow ? 360 : 720
  const H = narrow ? 470 : 236
  const pos = (i: number): [number, number] => (narrow ? [6 + (i % 2) * 180, 4 + Math.floor(i / 2) * 234] : [6 + i * 180, 4])
  return (
    <div ref={ref} style={narrow ? { maxWidth: 440, margin: '0 auto' } : undefined}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Načini pristupa disku: RWO dopušta Podove na jednom čvoru (dva Poda na node-1 smiju, Pod na node-2 ne smije); ROX dopušta samo čitanje s više čvorova (isprekidane veze); RWX čitanje i pisanje s više čvorova (pune veze); RWOP samo jedan Pod, pa drugi Pod na istom čvoru ne smije."
        style={{ display: 'block', width: '100%', height: 'auto' }}
      >
        {MODES.map((m, i) => {
          const [x, y] = pos(i)
          return <Panel key={m.code} m={m} x={x} y={y} seed={20200 + i * 50} big={narrow} />
        })}
      </svg>
    </div>
  )
}
