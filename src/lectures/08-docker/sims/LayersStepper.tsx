import { Brace, Check, Diagram, DLabel, Rough, Stepper, stepColor, StepBadge, useWidth } from '../../../kit'
import { Eye, Fade, Padlock, Whiteout } from './Drawn'

/* =====================================================================
   Layers as transparent sheets, seen from the side: every column is one
   path, every band one layer. The container looks down from the top and
   sees, in each column, the first thing it meets (union file system).
   ===================================================================== */

interface Geo {
  W: number
  H: number
  mono: number
  hand: number
  /** band labels: left of the band, or on a line above it */
  labels: 'left' | 'above'
  labelX: number
  x0: number
  colW: number
  /** minimum file box width; a box grows to fit its label (a band never has files in two neighbouring columns) */
  boxW: number
  bandH: number
  /** distance between band tops */
  pitch: number
  /** top of the writable band */
  wTop: number
  /** top of the highest image band */
  iTop: number
  eye: [number, number]
  eyeLabel: [number, number]
  noteY: number
  /** box label split in two lines (narrow) */
  twoLine: boolean
}

const WIDE: Geo = {
  W: 900,
  H: 580,
  mono: 15,
  hand: 15,
  labels: 'left',
  labelX: 14,
  x0: 232,
  colW: 108,
  boxW: 96,
  bandH: 48,
  pitch: 56,
  wTop: 92,
  iTop: 168,
  eye: [180, 44],
  eyeLabel: [210, 50],
  noteY: 566,
  twoLine: true,
}
/** tablets (560–720 px): labels left of the bands like the wide layout, but narrower columns */
const MEDIUM: Geo = {
  W: 640,
  H: 488,
  mono: 15,
  hand: 15,
  labels: 'left',
  labelX: 10,
  x0: 224,
  colW: 68,
  boxW: 60,
  bandH: 44,
  pitch: 48,
  wTop: 66,
  iTop: 132,
  eye: [176, 32],
  eyeLabel: [204, 38],
  noteY: 478,
  twoLine: true,
}
const NARROW: Geo = {
  W: 400,
  H: 520,
  mono: 14,
  hand: 14,
  labels: 'above',
  labelX: 14,
  x0: 14,
  colW: 62,
  boxW: 60,
  bandH: 32,
  pitch: 54,
  wTop: 82,
  iTop: 146,
  eye: [40, 34],
  eyeLabel: [70, 42],
  noteY: 508,
  twoLine: false,
}

const COPY_LABEL = 'kopija ✎'

/** Columns = paths in the file system. */
const COLS = [
  { name: 'OS, node', two: ['OS,', 'node'] },
  { name: 'package.json', two: ['package', '.json'] },
  { name: 'node_modules/', two: ['node_', 'modules/'] },
  { name: 'src/', two: ['src/', ''] },
  { name: 'dist/', two: ['dist/', ''] },
  { name: 'zapis.log', two: ['zapis', '.log'] },
]

/** Image layers, bottom first: the Dockerfile line and the columns it writes. */
const LAYERS: { text: string; cols: number[] }[] = [
  { text: 'FROM node:24-slim', cols: [0] },
  { text: 'WORKDIR /app', cols: [] },
  { text: 'COPY package*.json ./', cols: [1] },
  { text: 'RUN npm ci', cols: [2] },
  { text: 'COPY . .', cols: [3] },
  { text: 'RUN npm run build', cols: [4] },
]

const STEPS = [
  {
    title: 'Svaka naredba s datotekama je sloj',
    body: (
      <>
        Dockerfile čitamo odozgo, a slojevi se slažu odozdo: bazna slika iz <code>FROM</code> je na dnu. Svaki sloj sadrži samo ono što je njegova naredba dodala ili promijenila.
      </>
    ),
  },
  {
    title: 'Kontejner gleda odozgo kroz sve slojeve',
    body: 'Slojevi su kao prozirne folije: kontejner vidi jedan spojeni datotečni sustav. Ako dva sloja imaju istu datoteku, vidi se ona iz gornjeg.',
  },
  {
    title: 'Svaki kontejner dobiva tanki zapisivi sloj',
    body: (
      <>
        Slojevi slike su samo za čitanje. Pokrenuti kontejner dobiva svoj prazan zapisivi sloj na vrhu, i sve što zapiše (npr. <code>zapis.log</code>) završava u njemu.
      </>
    ),
  },
  {
    title: 'Promjena datoteke iz slike: kopiranje gore',
    body: (
      <>
        Kad proces promijeni datoteku iz slike (npr. <code>package.json</code>), datoteka se najprije kopira u zapisivi sloj (engl. <em>copy-up</em>) i mijenja se kopija. Original u slici ostaje netaknut.
      </>
    ),
  },
  {
    title: 'Brisanje: oznaka brisanja',
    body: (
      <>
        Brisanje datoteke iz slike ne briše ništa u slici: u gornji sloj upisuje se oznaka brisanja (engl. <em>whiteout</em>) koja je skriva. Isto radi i <code>RUN rm</code> u Dockerfileu – zato tajna obrisana u kasnijem sloju i dalje leži u slici.
      </>
    ),
  },
]

function bandTop(G: Geo, i: number): number {
  // i = 0 is the base (lowest band)
  return G.iTop + (LAYERS.length - 1 - i) * G.pitch
}

function boxLines(G: Geo, col: number, label?: string): string[] {
  return label ? [label] : G.twoLine ? COLS[col].two.filter(Boolean) : [COLS[col].name]
}

/** Where a file box sits: centred on its column, as wide as its label needs, kept inside the bands. */
function boxRect(G: Geo, col: number, label?: string): { x: number; w: number } {
  const chars = Math.max(...boxLines(G, col, label).map((l) => l.length))
  const w = Math.max(G.boxW, Math.round(chars * G.mono * 0.6 + 14))
  const right = G.x0 + COLS.length * G.colW
  const x = Math.min(right - w - 3, Math.max(G.x0 + 3, G.x0 + col * G.colW + G.colW / 2 - w / 2))
  return { x, w }
}

/** One file box in a band. */
function FileBox({ G, col, top, tone = 'ink', label, seed }: { G: Geo; col: number; top: number; tone?: 'ink' | 'green' | 'dim'; label?: string; seed: number }) {
  const { x, w } = boxRect(G, col, label)
  const h = G.bandH - 10
  const y = top + 5
  const stroke = tone === 'green' ? 'var(--green)' : tone === 'dim' ? 'var(--ink-3)' : 'var(--ink)'
  const lines = boxLines(G, col, label)
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} strokeWidth={1.4} stroke={stroke} fillColor="var(--paper)" fillStyle="solid" dash={tone === 'dim' ? '4 4' : undefined} />
      {lines.map((l, i) => (
        <text
          key={i}
          x={x + w / 2}
          y={y + h / 2 + G.mono * 0.36 + (i - (lines.length - 1) / 2) * (G.mono + 1)}
          textAnchor="middle"
          className="k-svg-mono"
          style={{
            fontSize: G.mono,
            fontWeight: 600,
            fill: tone === 'dim' ? 'var(--ink-3)' : tone === 'green' ? 'var(--green)' : 'var(--ink)',
          }}
        >
          {l}
        </text>
      ))}
    </g>
  )
}

/** Section 2: layers as transparent sheets, the writable layer, copy-up and whiteout. */
export function LayersStepper() {
  return (
    <div className="k-wide">
      <Stepper title="Slojevi kao prozirne folije" steps={STEPS}>
        {(step) => <Drawing step={step} />}
      </Stepper>
    </div>
  )
}

/** The drawing of one step; picks its layout by the width of the stepper's stage. */
function Drawing({ step }: { step: number }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const wide = w === null || w >= 720
  const medium = w !== null && w < 720 && w >= 560
  const G = wide ? WIDE : medium ? MEDIUM : NARROW
  const right = G.x0 + COLS.length * G.colW
  /** the ✓ sits on the top-right corner of the box the gaze stops at (the edited copy has its own label) */
  const checkX = (c: number, y: number) => {
    const b = boxRect(G, c, y === G.wTop && c === 1 ? COPY_LABEL : undefined)
    return b.x + b.w - 4
  }
  // where the container's gaze stops in each column (top of the first thing it meets)
  const stops = COLS.map((_, c) => {
    if (step >= 2 && c === 5) return { y: G.wTop, kind: 'file' as const }
    if (step >= 3 && c === 1) return { y: G.wTop, kind: 'file' as const }
    if (step >= 4 && c === 3) return { y: G.wTop, kind: 'whiteout' as const }
    for (let i = LAYERS.length - 1; i >= 0; i--) if (LAYERS[i].cols.includes(c)) return { y: bandTop(G, i), kind: 'file' as const }
    return null
  })
  return (
    <div ref={ref}>
      <div style={{ maxWidth: wide ? 980 : medium ? 680 : 460, margin: '0 auto' }}>
        <Diagram width={G.W} height={G.H} label={`Korak ${step + 1}: ${STEPS[step].title}. Slojevi slike odozdo prema gore: ${LAYERS.map((l) => l.text).join(', ')}.`}>
          {/* image bands */}
          {LAYERS.map((L, i) => {
            const top = bandTop(G, i)
            return (
              <g key={L.text}>
                <Rough
                  shape={{
                    k: 'rect',
                    x: G.x0,
                    y: top,
                    w: right - G.x0,
                    h: G.bandH,
                  }}
                  seed={3100 + i * 7}
                  strokeWidth={1.4}
                  stroke="var(--ink-2)"
                  fillColor="var(--hl-blue-ink)"
                  hachureAngle={-41}
                  hachureGap={9}
                  fillWeight={0.7}
                />
                {G.labels === 'left' ? <DLabel x={G.labelX} y={top + G.bandH / 2 + 5} text={L.text} mono size={G.mono} anchor="start" /> : <DLabel x={G.labelX} y={top - 7} text={L.text} mono size={G.mono} anchor="start" />}
                {L.cols.map((c) => (
                  <FileBox key={c} G={G} col={c} top={top} seed={3200 + i * 11 + c} />
                ))}
              </g>
            )
          })}
          {step === 0 && (
            <g>
              <StepBadge n={1} x={right - 22} y={bandTop(G, 0) + G.bandH + 22} color={stepColor(0)} r={14} />
              <DLabel x={right - 44} y={bandTop(G, 0) + G.bandH + 28} text="prvi redak = donji sloj" size={G.hand} anchor="end" tone="blue" />
            </g>
          )}

          {/* the writable layer (container) */}
          <Fade show={step >= 2}>
            <Rough
              shape={{
                k: 'rect',
                x: G.x0,
                y: G.wTop,
                w: right - G.x0,
                h: G.bandH,
              }}
              seed={3301}
              strokeWidth={1.7}
              stroke="var(--green)"
              dash="7 6"
            />
            {G.labels === 'left' ? (
              <>
                <DLabel x={G.labelX} y={G.wTop + G.bandH / 2 - 2} text="zapisivi sloj" size={G.hand} anchor="start" tone="green" bold />
                <DLabel x={G.labelX} y={G.wTop + G.bandH / 2 + 18} text="(kontejner)" size={G.hand} anchor="start" tone="green" />
              </>
            ) : (
              <DLabel x={G.labelX} y={G.wTop - 8} text="zapisivi sloj (kontejner)" size={G.hand} anchor="start" tone="green" bold />
            )}
            <FileBox G={G} col={5} top={G.wTop} tone="green" seed={3311} />
            {/* image layers are read-only */}
            {G.labels === 'left' ? (
              <>
                <Brace x={G.x0 - 14} y={G.iTop} h={bandTop(G, 0) + G.bandH - G.iTop} />
                <Padlock x={G.labelX + 14} y={bandTop(G, 0) + G.bandH + 26} />
                <DLabel x={G.labelX + 30} y={bandTop(G, 0) + G.bandH + 31} text="slika: samo za čitanje" size={G.hand} anchor="start" />
              </>
            ) : (
              <>
                <Padlock x={G.x0 + 12} y={bandTop(G, 0) + G.bandH + 24} />
                <DLabel x={G.x0 + 28} y={bandTop(G, 0) + G.bandH + 29} text="slika: samo za čitanje" size={G.hand} anchor="start" />
              </>
            )}
          </Fade>
          <Fade show={step >= 3}>
            <FileBox G={G} col={1} top={G.wTop} tone="green" label={COPY_LABEL} seed={3321} />
          </Fade>
          <Fade show={step >= 4}>
            <Whiteout x={G.x0 + 3 * G.colW + G.colW / 2} y={G.wTop + G.bandH / 2} r={G.bandH * 0.3} seed={3331} />
          </Fade>

          {/* the container's gaze, column by column */}
          <Fade show={step >= 1}>
            <Eye x={G.eye[0]} y={G.eye[1]} r={13} />
            <DLabel x={G.eyeLabel[0]} y={G.eyeLabel[1]} text="kontejner gleda odozgo" size={G.hand} anchor="start" tone="blue" />
            {stops.map((st, c) => {
              if (!st) return null
              const cx = G.x0 + c * G.colW + G.colW / 2
              const y1 = G.eye[1] + 26
              return (
                <g key={`${c}-${st.y}-${st.kind}`}>
                  <Rough shape={{ k: 'line', x1: cx, y1, x2: cx, y2: st.y + 3 }} seed={3400 + c} stroke="var(--pen)" strokeWidth={1.4} dash="4 5" />
                  {st.kind === 'file' ? <Check x={checkX(c, st.y)} y={st.y + 2} size={6} seed={3410 + c} /> : null}
                </g>
              )
            })}
          </Fade>

          {/* notes on what changed in this step */}
          {step === 3 && <DLabel x={G.W / 2} y={G.noteY} text={!wide ? 'original package.json ostaje u slici' : 'kopija je gore, original ostaje u slici'} size={G.hand} tone="green" />}
          {step === 4 && (
            <>
              <DLabel x={G.x0 + 3.5 * G.colW} y={G.wTop + G.bandH + (G.labels === 'left' ? 16 : 18)} text="skriveno ✗" size={G.hand} tone="bad" bold />
              <DLabel x={wide ? G.x0 + 3.5 * G.colW : G.W / 2} y={G.noteY} text={!wide ? 'src/ je i dalje u slici!' : 'src/ je i dalje u sloju „COPY . .” – samo se ne vidi'} size={G.hand} tone="bad" />
            </>
          )}
          {step === 1 && <DLabel x={G.W / 2} y={G.noteY} text={!wide ? 'gornji sloj prekriva donji' : 'vidi se sve – a gornji sloj prekriva donji'} size={G.hand} tone="blue" />}
          {step === 2 && <DLabel x={G.W / 2} y={G.noteY} text={!wide ? 'zapis.log: samo u ovom kontejneru' : 'zapis.log je samo u zapisivom sloju ovog kontejnera'} size={G.hand} tone="green" />}
        </Diagram>
      </div>
    </div>
  )
}
