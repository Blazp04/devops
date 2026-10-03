/**
 * Scene 4 „Lanac termostata”: three independent loops that only read and write the recorded state.
 *   kopije      – želja 3 → records of Pods (no node yet)
 *   raspored    – a Pod without a node → writes a node into the record
 *   na čvoru    – a Pod recorded for this node that does not run → starts its container
 * A node dies: after the node loop's default wait (~50 s + 5 min) its Pods are marked for deletion, then the first loop
 * records a NEW Pod (new name, new IP) – replaced, not repaired; the old one stays drawn, struck through, on the dead
 * node. The node comes back empty: nothing moves back. The cluster is never "done"; the loops keep watching.
 */
import { Arrow, LoopArrows, PodShape, Rough, Stepper, SvgStamp, stepColor, useWidth } from '../../../kit'

/** Width of a mono label in viewBox units (Plex Mono ≈ 0,6 em per character). */
const monoW = (text: string, fs: number) => text.length * fs * 0.6

const STEPS = [
  { title: 'Petlja kopija', body: 'Lana zapiše želju: tri kopije API-ja. Petlja kopija vidi 0 od 3 i zapiše tri nova Poda – zasad samo zapise, bez čvora. Ništa još ne radi.' },
  { title: 'Petlja rasporeda', body: 'Druga petlja vidi Podove bez čvora i svakome upiše čvor s dovoljno mjesta. Ni ona ništa ne pokreće – samo dopiše jedan podatak.' },
  { title: 'Petlja na čvoru', body: 'Na svakom čvoru treća petlja vidi „ovaj Pod je zapisan na mene, a ne radi” i pokrene njegov kontejner. Tek sada kopije stvarno rade.' },
  {
    title: 'Čvor 2 padne',
    body: 'Čvor 2 se prestane javljati. Petlja koja prati čvorove nakon pedesetak sekundi ga proglasi nedostupnim, a po zadanim postavkama čeka još 5 minuta (možda se vrati) i tek onda njegove Podove označi za brisanje. Sada petlja kopija vidi 2 od 3 i zapiše novi Pod – s novim imenom i novom adresom. Stari se ne „popravlja”, nego zamjenjuje. Petlja rasporeda novi Pod stavi na čvor s najviše mjesta, a petlja na tom čvoru ga pokrene.',
  },
  { title: 'Čvor 2 se vrati', body: 'Vraćeni čvor je prazan: ništa se ne seli natrag, jer je želja (tri kopije) ispunjena. Klaster nikad nije „gotov” – petlje i dalje gledaju.' },
]

interface PodDef {
  name: string
  ip: string
  /** node index once scheduled (from step), -1 before */
  node: number
  /** step in which it appears / disappears */
  from: number
  until: number
}

const PODS: PodDef[] = [
  { name: 'klopa-api-4xk2p', ip: '10.244.1.5', node: 0, from: 0, until: 99 },
  { name: 'klopa-api-9qwzt', ip: '10.244.2.8', node: 1, from: 0, until: 4 },
  { name: 'klopa-api-m7hcv', ip: '10.244.3.4', node: 2, from: 0, until: 99 },
  { name: 'klopa-api-tz8rn', ip: '10.244.3.9', node: 2, from: 3, until: 99 },
]

const LOOPS = [
  { name: 'petlja kopija', short: 'kopije', what: 'želja → zapisi Podova' },
  { name: 'petlja rasporeda', short: 'raspored', what: 'Pod bez čvora → čvor' },
  { name: 'petlja na čvoru', short: 'na čvoru', what: 'moj Pod → pokreni' },
]
/** Pod drawing size: the kit's sleepy „z” of a Pending Pod stays ≥ 17 px on screen from 48 units up */
const POD = 48

/** which loop acts in each step */
const ACTING = [0, 1, 2, 0, -1]

interface Geo {
  W: number
  H: number
  loops: { x: number; y: number }[]
  r: number
  board: { x: number; y: number; w: number; h: number }
  nodes: { x: number; y: number; w: number; h: number }[]
  /** pod position inside a node: k-th pod */
  podAt: (node: number, k: number) => { x: number; y: number }
  pendingAt: (k: number) => { x: number; y: number }
  narrow: boolean
}

const WIDE: Geo = {
  W: 720,
  H: 372,
  loops: [
    { x: 34, y: 40 },
    { x: 276, y: 40 },
    { x: 518, y: 40 },
  ],
  r: 24,
  board: { x: 8, y: 104, w: 704, h: 64 },
  nodes: [0, 1, 2].map((i) => ({ x: 8 + i * 240, y: 200, w: 224, h: 164 })),
  podAt: (n, k) => ({ x: 8 + n * 240 + 34, y: 200 + 62 + k * 60 }),
  pendingAt: (k) => ({ x: 556 + k * 58, y: 140 }),
  narrow: false,
}

const NARROW: Geo = {
  W: 380,
  H: 742,
  loops: [
    { x: 30, y: 36 },
    { x: 154, y: 36 },
    { x: 278, y: 36 },
  ],
  r: 20,
  // the board text sits on two lines above the three pending Pods (never through them)
  board: { x: 4, y: 96, w: 372, h: 140 },
  nodes: [0, 1, 2].map((i) => ({ x: 4, y: 260 + i * 162, w: 372, h: 150 })),
  podAt: (n, k) => ({ x: 4 + 34, y: 260 + n * 162 + 62 + k * 58 }),
  pendingAt: (k) => ({ x: 216 + k * 58, y: 96 + 140 - 30 }),
  narrow: true,
}

function Frame({ step, g }: { step: number; g: Geo }) {
  const color = stepColor(Math.min(step, 4) % 3)
  const acting = ACTING[step]
  const node2Down = step === 3
  const alive = PODS.filter((p) => step >= p.from && step < p.until)
  const boardText =
    step === 0
      ? 'želja: klopa-api × 3 · bez čvora: 3'
      : step === 1
        ? 'želja: 3 · Podova: 3 · svi imaju čvor · rade: 0'
        : step === 2
          ? 'želja: 3 · Podova: 3 · rade: 3 ✓'
          : step === 3
            ? 'želja: 3 · čvor 2 ne radi (5 min) · novi Pod → čvor 3'
            : 'želja: 3 · rade: 3 ✓ · čvor 2 prazan'
  const boardLines = g.narrow ? boardText.split(' · ').reduce<string[]>((acc, part, i) => (i % 2 === 0 ? [...acc, part] : [...acc.slice(0, -1), `${acc[acc.length - 1]} · ${part}`]), []) : [boardText]
  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={`Korak ${step + 1}: ${STEPS[step].title}. Zapisano stanje: ${boardText}.`} style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}>
      {/* ── three independent loops ── */}
      {LOOPS.map((l, i) => {
        const on = acting === i
        const p = g.loops[i]
        return (
          <g key={l.name}>
            <LoopArrows cx={p.x} cy={p.y} r={g.r} stroke={on ? color : 'var(--ink-3)'} seed={7600 + i * 7} check={on} />
            <text x={p.x + g.r + 10} y={p.y - (g.narrow ? 0 : 6)} className="k-svg-hand" style={{ fontSize: g.narrow ? 19 : 22, fontWeight: on ? 700 : 500, fill: on ? color : 'var(--ink-2)' }}>
              {g.narrow ? l.short : l.name}
            </text>
            {!g.narrow && (
              <text x={p.x + g.r + 10} y={p.y + 18} className="k-svg-hand" style={{ fontSize: 20, fill: 'var(--ink-2)' }}>
                {l.what}
              </text>
            )}
            {on && (
              <Arrow
                pts={[
                  [p.x, p.y + g.r + 6],
                  [p.x + 6, g.board.y - 6],
                ]}
                stroke={color}
                strokeWidth={2}
                seed={7630 + i}
                dash="5 5"
              />
            )}
          </g>
        )
      })}

      {/* ── the recorded state: the only thing the loops share ── */}
      <Rough shape={{ k: 'rect', x: g.board.x, y: g.board.y, w: g.board.w, h: g.board.h }} seed={7650} strokeWidth={1.6} stroke="var(--pen)" fillColor="var(--paper-2)" fillStyle="solid" />
      <text x={g.board.x + 10} y={g.board.y + 24} className="k-svg-hand" style={{ fontSize: 20, fontWeight: 700, fill: 'var(--pen)' }}>
        zapisano stanje
      </text>
      {boardLines.map((line, k) => (
        <text key={k} x={g.board.x + (g.narrow ? 10 : 160)} y={g.board.y + (g.narrow ? 50 + k * 22 : 26)} className="k-svg-mono" style={{ fontSize: 15, fontWeight: 600 }}>
          {line}
        </text>
      ))}
      {step === 0 && !g.narrow && (
        <text x={g.board.x + 160} y={g.board.y + 54} className="k-svg-hand" style={{ fontSize: 20, fill: 'var(--ink-2)' }}>
          tri zapisa Podova, još bez čvora →
        </text>
      )}

      {/* ── nodes ── */}
      {g.nodes.map((n, i) => {
        const down = node2Down && i === 1
        return (
          <g key={i}>
            <Rough shape={{ k: 'rect', x: n.x, y: n.y, w: n.w, h: n.h }} seed={7660 + i} strokeWidth={1.9} stroke={down ? 'var(--red)' : 'var(--ink)'} />
            <text x={n.x + 12} y={n.y + 26} className="k-svg-display" style={{ fontSize: 17, fontWeight: 700, fill: down ? 'var(--red)' : 'var(--ink)' }}>
              čvor {i + 1}
            </text>
            {down && <SvgStamp x={n.x + n.w - 72} y={n.y + 24} text="NE RADI" size={18} />}
            {step === 4 && i === 1 && (
              <text x={n.x + n.w / 2} y={n.y + n.h / 2 + 12} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 21, fontWeight: 600, fill: 'var(--ink-2)' }}>
                vraćen – i prazan
              </text>
            )}
          </g>
        )
      })}

      {/* ── Pods: records first (pending, dashed), then scheduled, then running ── */}
      {alive.map((p, k) => {
          const scheduled = step >= 1
          const fresh = p.from === 3
          // the old Pod on the dead node stays visible: marked for deletion, struck through, replaced
          const gone = node2Down && p.node === 1
          const onNode = scheduled
          const pos = onNode ? g.podAt(p.node, fresh ? 1 : 0) : g.pendingAt(k)
          const status = gone ? 'terminating' : step === 0 ? 'pending' : step === 1 ? 'pending' : step === 3 && fresh ? 'creating' : 'running'
          const tx = pos.x + POD / 2 + 8
          return (
            <g key={p.name}>
              <PodShape x={pos.x} y={pos.y} size={POD} status={status} tone="blue" ariaLabel={`Pod ${p.name}${gone ? ', označen za brisanje' : ''}`} />
              {onNode && (
                <>
                  <text x={tx} y={pos.y - 2} className="k-svg-mono" style={{ fontSize: 14, fontWeight: fresh ? 700 : 500, fill: fresh ? 'var(--red)' : gone ? 'var(--ink-3)' : 'var(--ink)' }}>
                    {p.name}
                  </text>
                  <text x={tx} y={pos.y + 18} className="k-svg-mono" style={{ fontSize: 14, fill: fresh ? 'var(--red)' : gone ? 'var(--ink-3)' : 'var(--ink-2)' }}>
                    {p.ip}
                  </text>
                  {gone && (
                    <>
                      <Rough shape={{ k: 'line', x1: tx - 2, y1: pos.y - 7, x2: tx + monoW(p.name, 14) + 2, y2: pos.y - 6 }} seed={7681} stroke="var(--red)" strokeWidth={1.8} />
                      <Rough shape={{ k: 'line', x1: tx - 2, y1: pos.y + 13, x2: tx + monoW(p.ip, 14) + 2, y2: pos.y + 14 }} seed={7682} stroke="var(--red)" strokeWidth={1.8} />
                    </>
                  )}
                </>
              )}
            </g>
          )
        })}
      {node2Down &&
        (g.narrow ? (
          <text x={g.podAt(1, 0).x + POD / 2 + 8} y={g.podAt(1, 0).y + 50} className="k-svg-hand" style={{ fontSize: 20, fontWeight: 700, fill: 'var(--red)' }}>
            zamjena → na čvoru 3
          </text>
        ) : (
          <>
            <Arrow
              pts={[
                [g.podAt(1, 0).x + 10, g.podAt(1, 0).y + 34],
                [g.nodes[1].x + g.nodes[1].w / 2 + 20, g.nodes[1].y + g.nodes[1].h - 24],
                [g.podAt(2, 1).x - POD / 2 - 8, g.podAt(2, 1).y + 4],
              ]}
              stroke="var(--red)"
              strokeWidth={1.8}
              seed={7685}
            />
            <text x={g.nodes[1].x + g.nodes[1].w / 2 + 20} y={g.nodes[1].y + g.nodes[1].h - 6} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 20, fontWeight: 700, fill: 'var(--red)' }}>
              zamjena
            </text>
          </>
        ))}
      {step >= 3 && (
        <text x={g.nodes[2].x + 84} y={g.nodes[2].y + 26} className="k-svg-hand" style={{ fontSize: 20, fontWeight: 700, fill: 'var(--red)' }}>
          novo ime i adresa
        </text>
      )}
    </svg>
  )
}

export function ThermostatChain() {
  const [ref, width] = useWidth<HTMLDivElement>()
  const g = width !== null && width < 620 ? NARROW : WIDE
  return (
    <div ref={ref}>
      <Stepper title="Lanac termostata" steps={STEPS} caption="Svaka petlja pazi samo na svoj dio i ne zna za ostale: čita zapisano stanje, ispravi svoju razliku i zapiše rezultat. Imena petlji upoznat ćemo u 11. predavanju.">
        {(step) => (
          <div style={g.narrow ? { maxWidth: 460, margin: '0 auto' } : undefined}>
            <Frame step={step} g={g} />
          </div>
        )}
      </Stepper>
    </div>
  )
}
