import { Check, Diagram, DLabel, Edge, FoodBox, Iva, Laptop, ServerCard, Shelf, SpeechBubble, Stepper, SvgStamp, TrayStack, useWidth } from '../../../kit'
import { DockerfileSheet, Fade } from './Drawn'
import { dShort, REGISTRY_STORY } from '../registryStory'

type P = [number, number]

interface Geo {
  W: number
  H: number
  /** handwriting size for DLabel (×1.45) and mono size */
  hand: number
  mono: number
  laptop: { x: number; y: number; w: number; label: P }
  iva: {
    x: number
    y: number
    s: number
    bubble: [number, number, number, number]
    mouth: P
  }
  sheet: { x: number; y: number; w: number; size: number; lineH: number }
  image: { x: number; y: number; w: number; h: number; caption: P; digest: P }
  shelf: {
    x: number
    y: number
    w: number
    h: number
    label: P
    anchor: 'start' | 'middle' | 'end'
  }
  server: { x: number; y: number; w: number; h: number }
  boxLaptop: { x: number; y: number }
  boxServer: { x: number; y: number }
  box: { w: number; h: number }
  okLaptop: P
  /** step 1: why the server fails – two handwritten lines */
  failNote: { at: [P, P]; anchor: 'start' | 'middle' | 'end' }
  sameCode: { from: P; to: P; curve: number; label: P }
  toSheet: [P, P]
  build: [P, P]
  buildLabel: { at: P; anchor: 'start' | 'middle' | 'end' }
  push: [P, P]
  pushLabel: { at: P; anchor: 'start' | 'middle' | 'end' }
  pull: [P, P]
  pullLabel: { at: P; anchor: 'start' | 'middle' | 'end' }
  same: P
}

const WIDE: Geo = {
  W: 880,
  H: 360,
  hand: 15,
  mono: 15,
  laptop: { x: 24, y: 136, w: 150, label: [99, 122] },
  iva: { x: 196, y: 158, s: 1, bubble: [222, 62, 170, 54], mouth: [238, 186] },
  sheet: { x: 200, y: 122, w: 206, size: 15, lineH: 24 },
  image: {
    x: 446,
    y: 152,
    w: 120,
    h: 84,
    caption: [506, 266],
    digest: [506, 290],
  },
  shelf: { x: 610, y: 30, w: 108, h: 64, label: [664, 116], anchor: 'middle' },
  server: { x: 740, y: 146, w: 126, h: 92 },
  boxLaptop: { x: 48, y: 276 },
  boxServer: { x: 752, y: 276 },
  box: { w: 104, h: 46 },
  okLaptop: [99, 278],
  failNote: {
    at: [
      [872, 280],
      [872, 306],
    ],
    anchor: 'end',
  },
  sameCode: {
    from: [176, 150],
    to: [736, 150],
    curve: -0.18,
    label: [456, 70],
  },
  toSheet: [
    [176, 186],
    [196, 186],
  ],
  build: [
    [410, 192],
    [442, 192],
  ],
  buildLabel: { at: [426, 112], anchor: 'middle' },
  push: [
    [556, 150],
    [608, 92],
  ],
  pushLabel: { at: [566, 112], anchor: 'end' },
  pull: [
    [716, 94],
    [748, 134],
  ],
  pullLabel: { at: [742, 104], anchor: 'start' },
  same: [456, 330],
}

/** phones: two columns, top to bottom laptop → Dockerfile → image → shelf → server (≈ 400 × 560, so the step card stays near) */
const NARROW: Geo = {
  W: 400,
  H: 562,
  hand: 14,
  mono: 14,
  laptop: { x: 22, y: 36, w: 140, label: [92, 24] },
  iva: { x: 222, y: 60, s: 0.9, bubble: [200, 2, 192, 48], mouth: [258, 84] },
  sheet: { x: 194, y: 30, w: 194, size: 14, lineH: 23 },
  image: {
    x: 232,
    y: 216,
    w: 120,
    h: 76,
    caption: [292, 312],
    digest: [292, 334],
  },
  shelf: { x: 30, y: 214, w: 112, h: 66, label: [86, 300], anchor: 'middle' },
  server: { x: 232, y: 372, w: 150, h: 90 },
  boxLaptop: { x: 40, y: 148 },
  boxServer: { x: 255, y: 476 },
  box: { w: 104, h: 44 },
  okLaptop: [92, 158],
  failNote: {
    at: [
      [270, 490],
      [270, 514],
    ],
    anchor: 'middle',
  },
  sameCode: { from: [92, 172], to: [292, 364], curve: 0.25, label: [96, 282] },
  toSheet: [
    [166, 84],
    [190, 84],
  ],
  build: [
    [292, 188],
    [292, 212],
  ],
  buildLabel: { at: [282, 206], anchor: 'end' },
  push: [
    [228, 252],
    [148, 252],
  ],
  pushLabel: { at: [188, 242], anchor: 'middle' },
  pull: [
    [112, 312],
    [226, 392],
  ],
  pullLabel: { at: [146, 378], anchor: 'end' },
  same: [200, 550],
}

/** Iva's first Dockerfile, as in the incident and the code tab (full node image, the whole repository copied) */
const DOCKERFILE = ['FROM node:24', 'WORKDIR /app', 'COPY . .', 'RUN npm ci', 'CMD ["npm", "start"]']

const STEPS = [
  {
    title: '„Kod mene radi”',
    body: 'Ivi Klopa radi na laptopu. Isti kod na poslužitelju pada: ondje je druga verzija Node.js-a i nedostaje jedna sistemska biblioteka. Kod je isti, a okruženje nije.',
  },
  {
    title: 'Dockerfile: recept za cijelo okruženje',
    body: 'Umjesto upute „instaliraj ovo i ono” pišemo Dockerfile: od koje bazne slike krećemo (Node.js i sistemske biblioteke), što kopiramo, što pokrećemo pri izgradnji i kojom se naredbom aplikacija pokreće.',
  },
  {
    title: 'docker build: slika kontejnera',
    body: (
      <>
        Naredba <code>docker build</code> izvrši recept i napravi sliku kontejnera: nepromjenjiv paket koda, Node.js-a i biblioteka. Slika ima digest – sažetak sadržaja koji je jednoznačno imenuje.
      </>
    ),
  },
  {
    title: 'docker push i docker pull: registar',
    body: (
      <>
        Sliku šaljemo u registar (<code>docker push</code>), a poslužitelj je odande povlači (<code>docker pull</code>). Putuje gotov paket, a ne upute: poslužitelj dobiva bajt po bajt istu sliku, s istim digestom.
      </>
    ),
  },
  {
    title: 'docker run: ista slika, kontejner na oba računala',
    body: (
      <>
        Iz iste slike i laptop i poslužitelj pokreću kontejner (<code>docker run</code>): proces s istim datotekama i istom naredbom. To je kontejnerizacija. Uvjet: isti tip procesora (npr. amd64) i Linuxova jezgra operacijskog sustava – više o tome
        u odjeljku „Ispod haube” i u kartici „Više arhitektura”.
      </>
    ),
  },
]

/** Section 1: from „kod mene radi” to one image that runs the same on the laptop and the server. */
export function DockerizeStepper() {
  return (
    <div className="k-wide">
      <Stepper title="Od koda do kontejnera" steps={STEPS}>
        {(step) => <Drawing step={step} />}
      </Stepper>
    </div>
  )
}

/** The drawing of one step; picks its layout by the width of the stepper's stage. */
function Drawing({ step }: { step: number }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const wide = w === null || w >= 720
  const G = wide ? WIDE : NARROW
  const R = REGISTRY_STORY
  return (
    <div ref={ref}>
      <div style={{ maxWidth: wide ? 960 : 460, margin: '0 auto' }}>
        <Diagram width={G.W} height={G.H} label={`Korak ${step + 1}: ${STEPS[step].title}. Ivin laptop, Dockerfile, slika kontejnera, registar i poslužitelj.`}>
          {/* step 0: the same code, a different machine */}
          <Fade show={step === 0}>
            <Edge from={G.sameCode.from} to={G.sameCode.to} curve={G.sameCode.curve} dashed tone="neutral" />
            <DLabel x={G.sameCode.label[0]} y={G.sameCode.label[1]} text="isti kod (git pull)" size={G.hand} />
            <Iva x={G.iva.x} y={G.iva.y} scale={G.iva.s} mood="grin" holding="none" />
            <SpeechBubble x={G.iva.bubble[0]} y={G.iva.bubble[1]} w={G.iva.bubble[2]} h={G.iva.bubble[3]} tx={G.iva.mouth[0]} ty={G.iva.mouth[1]} lines={['Kod mene radi!']} size={wide ? 22 : 21} seed={2611} tail={16} />
            <DLabel x={G.okLaptop[0]} y={G.okLaptop[1]} text="radi ✓" tone="ok" size={G.hand} bold />
            <DLabel x={G.failNote.at[0][0]} y={G.failNote.at[0][1]} text="ne radi ✗ – drugi Node.js," tone="bad" size={G.hand} anchor={G.failNote.anchor} bold />
            <DLabel x={G.failNote.at[1][0]} y={G.failNote.at[1][1]} text="nema sistemske biblioteke" size={G.hand} anchor={G.failNote.anchor} tone="bad" />
          </Fade>

          {/* the laptop and the server are always there */}
          <Laptop
            x={G.laptop.x}
            y={G.laptop.y}
            w={G.laptop.w}
            sticker=""
            screen={
              <text x={G.laptop.w * 0.45} y={G.laptop.w * 0.33} textAnchor="middle" className="k-svg-mono" style={{ fontSize: G.mono + 3, fill: 'var(--term-ink)' }}>
                {'</>'}
              </text>
            }
          />
          <DLabel x={G.laptop.label[0]} y={G.laptop.label[1]} text="Ivin laptop" size={G.hand} />
          <ServerCard x={G.server.x} y={G.server.y} w={G.server.w} h={G.server.h} mood={step === 0 ? 'dead' : 'calm'} seed={1131} />
          <DLabel x={G.server.x + G.server.w / 2} y={G.server.y - 9} text="poslužitelj" size={G.hand} />
          {step === 0 && <SvgStamp x={G.server.x + G.server.w / 2} y={G.server.y + G.server.h * 0.78} text="NE RADI" size={15} />}

          {/* step 1: the recipe */}
          <Fade show={step >= 1}>
            <Edge from={G.toSheet[0]} to={G.toSheet[1]} tone="neutral" />
            <DockerfileSheet x={G.sheet.x} y={G.sheet.y} w={G.sheet.w} lines={DOCKERFILE} size={G.sheet.size} lineH={G.sheet.lineH} hot={step === 1 ? [0] : []} />
          </Fade>

          {/* step 2: the image */}
          <Fade show={step >= 2}>
            <Edge from={G.build[0]} to={G.build[1]} tone="blue" />
            <DLabel x={G.buildLabel.at[0]} y={G.buildLabel.at[1]} text="docker build" mono size={G.mono} anchor={G.buildLabel.anchor} tone="blue" />
            <TrayStack x={G.image.x} y={G.image.y} w={G.image.w} h={G.image.h} n={3} labels={['FROM', 'COPY', 'RUN']} labelSize={G.mono} seed={5311} />
            <DLabel x={G.image.caption[0]} y={G.image.caption[1]} text="slika kontejnera" size={G.hand} />
            <DLabel x={G.image.digest[0]} y={G.image.digest[1]} text={dShort(R.digestA)} mono size={G.mono} />
          </Fade>

          {/* step 3: registry */}
          <Fade show={step >= 3}>
            <Shelf x={G.shelf.x} y={G.shelf.y} w={G.shelf.w} h={G.shelf.h} seed={5421} />
            <DLabel x={G.shelf.label[0]} y={G.shelf.label[1]} text="registar" size={G.hand} anchor={G.shelf.anchor} />
            <Edge from={G.push[0]} to={G.push[1]} tone="blue" />
            <DLabel x={G.pushLabel.at[0]} y={G.pushLabel.at[1]} text="push" mono size={G.mono} anchor={G.pushLabel.anchor} tone="blue" />
            <Edge from={G.pull[0]} to={G.pull[1]} tone="blue" />
            <DLabel x={G.pullLabel.at[0]} y={G.pullLabel.at[1]} text="pull" mono size={G.mono} anchor={G.pullLabel.anchor} tone="blue" />
          </Fade>

          {/* step 4: the same container on both machines */}
          <Fade show={step >= 4}>
            <FoodBox x={G.boxLaptop.x} y={G.boxLaptop.y} w={G.box.w} h={G.box.h} label="kontejner" labelSize={G.mono} seed={5121} />
            <FoodBox x={G.boxServer.x} y={G.boxServer.y} w={G.box.w} h={G.box.h} label="kontejner" labelSize={G.mono} seed={5131} />
            <Check x={G.boxLaptop.x + G.box.w + 16} y={G.boxLaptop.y + 22} size={9} seed={2701} />
            <Check x={G.boxServer.x + G.box.w + 14} y={G.boxServer.y + 22} size={9} seed={2703} />
            <DLabel x={G.same[0]} y={G.same[1]} text={`ista slika (${dShort(R.digestA, 4)}) → isti rezultat`} size={G.hand} tone="ok" bold />
          </Fade>
        </Diagram>
      </div>
    </div>
  )
}
