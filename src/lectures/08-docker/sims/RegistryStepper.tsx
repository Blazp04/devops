import { motion, useReducedMotion } from 'motion/react'
import { Diagram, DLabel, Edge, plural, Rough, ServerCard, Shelf, Stepper, useWidth } from '../../../kit'
import { REGISTRY_STORY } from '../registryStory'
import { Fade } from './Drawn'

type P = [number, number]

const R = REGISTRY_STORY
const hex = (d: string, n = 6) => d.replace('sha256:', '').slice(0, n)

/** Distinct layer blobs in push order (A's four, then B's new top). */
const BLOBS = [...R.layersA.map((l) => l.digest), ...R.layersB.map((l) => l.digest).filter((d) => !R.layersA.some((a) => a.digest === d))]

interface Geo {
  W: number
  H: number
  mono: number
  hand: number
  img: (k: 'A' | 'B') => { x: number; y: number }
  imgW: number
  trayH: number
  /** the registry = a shelf: two side posts and planks under the blobs, the manifests and at the bottom */
  reg: { x: number; y: number; w: number; h: number }
  regLabel: { at: P; anchor: 'start' | 'middle' | 'end' }
  /** the small kit shelf doodle beside the word „registar” */
  shelfIcon: { x: number; y: number; w: number; h: number }
  blobsLabel: P
  blob: (i: number) => { x: number; y: number }
  blobW: number
  man: (k: 'A' | 'B') => { x: number; y: number }
  manW: number
  tag: (k: 'sha1' | 'sha2' | 'latestA' | 'latestB') => { x: number; y: number }
  tagW: number
  server: (k: 'a' | 'b') => { x: number; y: number }
  serverW: number
  serverH: number
  runs: (k: 'a' | 'b') => P
  /** „pull: prije / nakon pomaka” under each server (steps 3–4) */
  pullNote: (k: 'a' | 'b') => P
  push: (k: 'A' | 'B') => [P, P]
  pull: (k: 'a' | 'b') => [P, P]
  verdict: P
}

const WIDE: Geo = {
  W: 900,
  H: 432,
  mono: 15,
  hand: 15,
  img: (k) => ({ x: 20, y: k === 'A' ? 70 : 250 }),
  imgW: 170,
  trayH: 26,
  reg: { x: 262, y: 26, w: 360, h: 380 },
  regLabel: { at: [276, 52], anchor: 'start' },
  shelfIcon: { x: 362, y: 26, w: 44, h: 32 },
  blobsLabel: [276, 88],
  blob: (i) => ({ x: 278 + i * 68, y: 100 }),
  blobW: 60,
  man: (k) => ({ x: k === 'A' ? 282 : 456, y: 196 }),
  manW: 150,
  tag: (k) =>
    ({
      sha1: { x: 290, y: 300 },
      latestA: { x: 290, y: 346 },
      sha2: { x: 466, y: 300 },
      latestB: { x: 466, y: 346 },
    })[k],
  tagW: 134,
  server: (k) => ({ x: 714, y: k === 'a' ? 54 : 244 }),
  serverW: 150,
  serverH: 86,
  runs: (k) => [789, k === 'a' ? 166 : 356],
  pullNote: (k) => [789, k === 'a' ? 192 : 382],
  push: (k) =>
    k === 'A'
      ? [
          [194, 120],
          [272, 112],
        ]
      : [
          [194, 300],
          [272, 128],
        ],
  pull: (k) =>
    k === 'a'
      ? [
          [612, 210],
          [708, 110],
        ]
      : [
          [612, 240],
          [708, 290],
        ],
  verdict: [890, 422],
}

/** tablets (560–720 px): images on the left, the shelf on the right, the two servers under the shelf */
const MEDIUM: Geo = {
  W: 640,
  H: 536,
  mono: 15,
  hand: 15,
  img: (k) => ({ x: 12, y: k === 'A' ? 52 : 212 }),
  imgW: 170,
  trayH: 24,
  reg: { x: 206, y: 20, w: 424, h: 300 },
  regLabel: { at: [616, 44], anchor: 'end' },
  shelfIcon: { x: 492, y: 18, w: 40, h: 30 },
  blobsLabel: [220, 44],
  blob: (i) => ({ x: 216 + i * 82, y: 56 }),
  blobW: 74,
  man: (k) => ({ x: k === 'A' ? 222 : 424, y: 150 }),
  manW: 190,
  tag: (k) =>
    ({
      sha1: { x: 222, y: 240 },
      latestA: { x: 312, y: 240 },
      sha2: { x: 424, y: 240 },
      latestB: { x: 514, y: 240 },
    })[k],
  tagW: 84,
  server: (k) => ({ x: k === 'a' ? 230 : 450, y: 370 }),
  serverW: 150,
  serverH: 76,
  runs: (k) => (k === 'a' ? [305, 472] : [525, 472]),
  pullNote: (k) => (k === 'a' ? [305, 496] : [525, 496]),
  push: (k) =>
    k === 'A'
      ? [
          [186, 100],
          [212, 80],
        ]
      : [
          [186, 262],
          [214, 96],
        ],
  pull: (k) =>
    k === 'a'
      ? [
          [242, 324],
          [236, 366],
        ]
      : [
          [588, 324],
          [594, 366],
        ],
  verdict: [415, 526],
}

/** phones: images side by side, the shelf with one row of tag notes, the two servers (≈ 400 × 670) */
const NARROW: Geo = {
  W: 400,
  H: 670,
  mono: 14,
  hand: 14,
  img: (k) => ({ x: k === 'A' ? 14 : 214, y: 32 }),
  imgW: 172,
  trayH: 22,
  reg: { x: 8, y: 176, w: 384, h: 280 },
  regLabel: { at: [384, 200], anchor: 'end' },
  shelfIcon: { x: 230, y: 178, w: 40, h: 30 },
  blobsLabel: [22, 200],
  blob: (i) => ({ x: 18 + i * 74, y: 210 }),
  blobW: 66,
  man: (k) => ({ x: k === 'A' ? 22 : 210, y: 300 }),
  manW: 168,
  tag: (k) =>
    ({
      sha1: { x: 18, y: 392 },
      latestA: { x: 104, y: 392 },
      sha2: { x: 210, y: 392 },
      latestB: { x: 296, y: 392 },
    })[k],
  tagW: 80,
  server: (k) => ({ x: k === 'a' ? 20 : 230, y: 504 }),
  serverW: 150,
  serverH: 76,
  runs: (k) => (k === 'a' ? [95, 604] : [305, 604]),
  pullNote: (k) => (k === 'a' ? [95, 628] : [305, 628]),
  push: (k) =>
    k === 'A'
      ? [
          [100, 138],
          [100, 174],
        ]
      : [
          [300, 138],
          [300, 174],
        ],
  pull: (k) =>
    k === 'a'
      ? [
          [170, 460],
          [160, 494],
        ]
      : [
          [230, 460],
          [240, 494],
        ],
  verdict: [200, 658],
}

const STEPS = [
  {
    title: 'docker push: slojevi odlaze u registar',
    body: (
      <>
        Registar sprema slojeve (blobove) po digestu i manifest koji ih nabraja. Prva slika šalje sve: {plural(R.push1.uploaded, ['sloj', 'sloja', 'slojeva'])}. Dobiva dva taga: kratki SHA commita (<code>{R.sha1}</code>) i <code>latest</code>.
      </>
    ),
  },
  {
    title: 'Nova verzija: šalje se samo ono čega nema',
    body: (
      <>
        Nakon promjene koda drugačiji je samo gornji sloj. Push javlja <code>Layer already exists</code> za {plural(R.push2.existed, ['sloj', 'sloja', 'slojeva'])} i šalje samo jedan. Nova slika ima novi digest i tag <code>{R.sha2}</code>.
      </>
    ),
  },
  {
    title: 'Tag je ljepljivi papirić',
    body: (
      <>
        Poslužitelj A ranije je povukao <code>latest</code> i pokreće sliku A. Sada netko pomakne <code>latest</code> na sliku B (<code>docker tag</code> pa <code>docker push</code> – tek push pomiče tag u registru). Slikama se ništa nije dogodilo – samo je papirić prelijepljen.
      </>
    ),
  },
  {
    title: 'Isto ime, različit kod',
    body: (
      <>
        Poslužitelj B sada povuče <code>latest</code> i dobije sliku B. Oba poslužitelja „pokreću <code>klopa-web:latest</code>”, a izvršavaju različit kod. Iz imena to nitko ne vidi.
      </>
    ),
  },
  {
    title: 'Digest je identitet',
    body: (
      <>
        Digest je sažetak sadržaja: promijeni li se ijedan bajt, promijeni se i on. Pokrenimo zato oba poslužitelja po digestu slike B (<code>klopa-web@sha256:{hex(R.digestB)}…</code>): sada sigurno izvršavaju isti kod. Ako napišemo i tag i digest, vrijedi digest.
      </>
    ),
  },
]

/** x-centre of blobs i..j (for notes under the blob row). */
function blobsCenter(G: Geo, i: number, j: number): number {
  return (G.blob(i).x + G.blob(j).x + G.blobW) / 2
}

/** A stack of trays drawn bottom-up, each with its layer digest (shared ones blue −41°, the new one green +41°). */
function ImageStack({ G, k, layers }: { G: Geo; k: 'A' | 'B'; layers: { digest: string }[] }) {
  const { x, y } = G.img(k)
  const n = layers.length
  return (
    <g>
      <DLabel x={x + G.imgW / 2} y={y - 10} text={`slika ${k} · ${hex(k === 'A' ? R.digestA : R.digestB)}…`} mono size={G.mono} bold />
      {layers.map((l, i) => {
        const ty = y + (n - 1 - i) * (G.trayH + 4)
        const fresh = k === 'B' && !R.layersA.some((a) => a.digest === l.digest)
        return (
          <g key={l.digest}>
            <Rough
              shape={{
                k: 'poly',
                pts: [
                  [x, ty],
                  [x + G.imgW, ty],
                  [x + G.imgW - 6, ty + G.trayH],
                  [x + 6, ty + G.trayH],
                ],
              }}
              seed={6100 + i * 5 + (k === 'B' ? 50 : 0)}
              strokeWidth={1.4}
              fillColor={fresh ? 'var(--hl-green-ink)' : 'var(--hl-blue-ink)'}
              hachureAngle={fresh ? 41 : -41}
              hachureGap={6}
              fillWeight={0.8}
            />
            <text x={x + G.imgW / 2} y={ty + G.trayH / 2 + G.mono * 0.36} textAnchor="middle" className="k-svg-mono k-dhalo" style={{ fontSize: G.mono, fontWeight: 600 }}>
              {hex(l.digest)}
              {fresh ? ' (novi)' : ''}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function TagNote({ x, y, w, text, tone = 'yellow', size = 14, seed }: { x: number; y: number; w: number; text: string; tone?: 'yellow' | 'blue'; size?: number; seed: number }) {
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h: 32 }} seed={seed} strokeWidth={1.1} stroke="var(--ink-2)" fillColor={tone === 'yellow' ? 'var(--note-yellow)' : 'var(--note-blue)'} fillStyle="solid" />
      <text x={x + w / 2} y={y + 21} textAnchor="middle" className="k-svg-mono" style={{ fontSize: size, fontWeight: 700, fill: 'var(--note-ink)' }}>
        {text}
      </text>
    </g>
  )
}

/** Section 5: push sends only missing layers; a tag is a movable note, a digest is the identity. */
export function RegistryStepper() {
  return (
    <div className="k-wide">
      <Stepper title="Registar, tag i digest" steps={STEPS}>
        {(step) => <Drawing step={step} />}
      </Stepper>
    </div>
  )
}

/** The drawing of one step; picks its layout by the width of the stepper's stage. */
function Drawing({ step }: { step: number }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const reduce = useReducedMotion()
  const wide = w === null || w >= 720
  const medium = w !== null && w < 720 && w >= 560
  const G = wide ? WIDE : medium ? MEDIUM : NARROW
  const latestOnB = step >= 2
  const aRuns = step >= 2 ? (step >= 4 ? 'B' : 'A') : null
  const bRuns = step >= 3 ? 'B' : null
  const latest = latestOnB ? G.tag('latestB') : G.tag('latestA')
  const latestFrom = G.tag('latestA')
  const manOf = (k: 'A' | 'B') => G.man(k)
  return (
    <div ref={ref}>
      <div style={{ maxWidth: wide ? 980 : medium ? 680 : 460, margin: '0 auto' }}>
        <Diagram width={G.W} height={G.H} label={`Korak ${step + 1}: ${STEPS[step].title}.`}>
          {/* the registry = a shelf: side posts, a plank under the blobs, one under the manifests (tags hang from it) and the bottom */}
          {[G.reg.x, G.reg.x + G.reg.w].map((px, i) => (
            <Rough key={px} shape={{ k: 'line', x1: px, y1: G.reg.y, x2: px, y2: G.reg.y + G.reg.h }} seed={6201 + i} strokeWidth={1.7} stroke="var(--ink-2)" />
          ))}
          {[G.blob(0).y + 36, G.man('A').y + 58, G.reg.y + G.reg.h].map((py, i) => (
            <Rough key={py} shape={{ k: 'line', x1: G.reg.x - 4, y1: py, x2: G.reg.x + G.reg.w + 4, y2: py }} seed={6211 + i} strokeWidth={1.8} stroke="var(--ink-2)" />
          ))}
          <Shelf x={G.shelfIcon.x} y={G.shelfIcon.y} w={G.shelfIcon.w} h={G.shelfIcon.h} seed={6221} />
          <DLabel x={G.regLabel.at[0]} y={G.regLabel.at[1]} text="registar" size={G.hand} anchor={G.regLabel.anchor} bold />
          {wide && <DLabel x={G.reg.x + G.reg.w - 12} y={G.reg.y + 26} text={R.host} mono size={G.mono} anchor="end" />}
          <DLabel x={G.blobsLabel[0]} y={G.blobsLabel[1]} text="slojevi (po digestu)" size={G.hand} anchor="start" />
          {BLOBS.map((d, i) => {
            const b = G.blob(i)
            const isNew = i >= R.layersA.length
            return (
              <Fade key={d} show={!isNew || step >= 1}>
                <Rough shape={{ k: 'rect', x: b.x, y: b.y, w: G.blobW, h: 32 }} seed={6300 + i} strokeWidth={1.4} fillColor={isNew ? 'var(--hl-green-ink)' : 'var(--hl-blue-ink)'} hachureAngle={isNew ? 41 : -41} hachureGap={6} fillWeight={0.7} />
                <text x={b.x + G.blobW / 2} y={b.y + 21} textAnchor="middle" className="k-svg-mono k-dhalo" style={{ fontSize: G.mono, fontWeight: 600 }}>
                  {hex(d)}
                </text>
              </Fade>
            )
          })}
          {(['A', 'B'] as const).map((k) => {
            const m = manOf(k)
            const layers = k === 'A' ? R.layersA : R.layersB
            return (
              <Fade key={k} show={k === 'A' || step >= 1}>
                {layers.map((l) => {
                  const bi = BLOBS.indexOf(l.digest)
                  const b = G.blob(bi)
                  return (
                    <Rough
                      key={l.digest}
                      shape={{
                        k: 'line',
                        x1: m.x + G.manW / 2,
                        y1: m.y,
                        x2: b.x + G.blobW / 2,
                        y2: b.y + 32,
                      }}
                      seed={6400 + bi + (k === 'B' ? 20 : 0)}
                      stroke="var(--ink-3)"
                      strokeWidth={1}
                    />
                  )
                })}
                <Rough shape={{ k: 'rect', x: m.x, y: m.y, w: G.manW, h: 54 }} seed={6501 + (k === 'B' ? 3 : 0)} strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" />
                <text x={m.x + 10} y={m.y + 22} className="k-svg-mono" style={{ fontSize: G.mono, fontWeight: 700 }}>
                  slika {k}
                </text>
                <text x={m.x + 10} y={m.y + 42} className="k-svg-mono" style={{ fontSize: G.mono }}>
                  sha256:{hex(k === 'A' ? R.digestA : R.digestB)}…
                </text>
              </Fade>
            )
          })}
          {/* after the manifest lines, so its paper halo sits on top of them */}
          <DLabel x={G.reg.x + 14} y={G.man('A').y - 12} text="manifesti (slike)" size={G.hand} anchor="start" />
          <DLabel x={G.reg.x + 14} y={G.tag('sha1').y - 12} text="tagovi (papirići)" size={G.hand} anchor="start" />
          <TagNote x={G.tag('sha1').x} y={G.tag('sha1').y} w={G.tagW} text={R.sha1} tone="blue" size={G.mono} seed={6601} />
          <Fade show={step >= 1}>
            <TagNote x={G.tag('sha2').x} y={G.tag('sha2').y} w={G.tagW} text={R.sha2} tone="blue" size={G.mono} seed={6603} />
          </Fade>
          <motion.g initial={false} animate={{ x: latest.x - latestFrom.x, y: latest.y - latestFrom.y }} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 18 }}>
            <TagNote x={latestFrom.x} y={latestFrom.y} w={G.tagW} text="latest" size={G.mono} seed={6605} />
          </motion.g>
          {step === 2 && <DLabel x={(G.tag('latestA').x + G.tag('latestB').x + G.tagW) / 2} y={G.tag('latestA').y + 52} text="docker push …:latest" mono size={G.mono} tone="bad" />}

          {/* images on the build machine and the pushes */}
          <ImageStack G={G} k="A" layers={R.layersA} />
          <Fade show={step === 0}>
            <Edge from={G.push('A')[0]} to={G.push('A')[1]} tone="blue" />
            <DLabel x={blobsCenter(G, 0, R.layersA.length - 1)} y={G.blob(0).y + 56} text={`↑ Pushed ×${R.push1.uploaded}`} mono size={G.mono} tone="blue" bold />
          </Fade>
          <Fade show={step >= 1}>
            <ImageStack G={G} k="B" layers={R.layersB} />
          </Fade>
          <Fade show={step === 1}>
            <Edge from={G.push('B')[0]} to={G.push('B')[1]} tone="green" />
            <DLabel x={blobsCenter(G, 0, R.push2.existed - 1)} y={G.blob(0).y + 56} text={`↑ već postoje ×${R.push2.existed}`} mono size={G.mono} tone="blue" bold />
            <DLabel x={blobsCenter(G, BLOBS.length - 1, BLOBS.length - 1)} y={G.blob(0).y + 56} text="↑ Pushed" mono size={G.mono} tone="green" bold />
          </Fade>

          {/* the servers */}
          {(['a', 'b'] as const).map((k) => {
            const sv = G.server(k)
            const runs = k === 'a' ? aRuns : bRuns
            const [rx, ry] = G.runs(k)
            const mismatch = step === 3
            return (
              <g key={k}>
                <ServerCard x={sv.x} y={sv.y} w={G.serverW} h={G.serverH} mood="calm" seed={1141 + (k === 'b' ? 7 : 0)} />
                <DLabel x={sv.x + G.serverW / 2} y={sv.y - 9} text={k === 'a' ? 'Poslužitelj A' : 'Poslužitelj B'} size={G.hand} />
                <DLabel
                  x={rx}
                  y={ry}
                  text={runs ? `${step >= 4 ? '@' : 'latest → '}${hex(runs === 'A' ? R.digestA : R.digestB)}…` : 'ne pokreće ništa'}
                  mono
                  size={G.mono}
                  tone={runs ? (mismatch ? 'bad' : step >= 4 ? 'ok' : 'neutral') : 'neutral'}
                  bold={!!runs}
                />
                {runs && (step === 2 || step === 3) && <DLabel x={G.pullNote(k)[0]} y={G.pullNote(k)[1]} text={k === 'a' ? 'pull: prije pomaka' : 'pull: nakon pomaka'} size={G.hand} tone="neutral" />}
              </g>
            )
          })}
          <Fade show={step >= 2}>
            <Edge from={G.pull('a')[0]} to={G.pull('a')[1]} tone={step >= 4 ? 'green' : 'neutral'} dashed={step < 4} />
          </Fade>
          <Fade show={step >= 3}>
            <Edge from={G.pull('b')[0]} to={G.pull('b')[1]} tone={step >= 4 ? 'green' : 'neutral'} dashed={step < 4} />
          </Fade>
          {step === 3 && <DLabel x={G.verdict[0]} y={G.verdict[1]} text="isti „latest”, dva digesta ✗" size={G.hand} tone="bad" bold anchor={wide ? 'end' : 'middle'} />}
          {step === 4 && <DLabel x={G.verdict[0]} y={G.verdict[1]} text="po digestu: ista slika ✓" size={G.hand} tone="ok" bold anchor={wide ? 'end' : 'middle'} />}
        </Diagram>
      </div>
    </div>
  )
}
