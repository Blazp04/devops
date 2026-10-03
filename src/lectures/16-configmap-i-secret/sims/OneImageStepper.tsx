import { Arrow, Diagram, FolderTab, PodShape, Rough, StepBadge, Stepper, stepColor, TrayStack } from '../../../kit'
import { ENVS } from '../lib/scenes'
import { useBoxWidth } from '../lib/useBoxWidth'

const STEPS = [
  {
    title: 'Jedna slika za sva okruženja',
    body: (
      <>
        Slika <code>klopa-api:1.4.0</code> ima jedan digest. Ista slika ide u lokalni klaster na Laninu laptopu, u testno okruženje i u produkciju – u njoj nema nijedne adrese ni lozinke.
      </>
    ),
  },
  {
    title: 'Svako okruženje ima svoj ConfigMap',
    body: (
      <>
        U svakom Namespaceu živi ConfigMap istog imena, <code>klopa-api-config</code>, ali s drugim vrijednostima: adresa baze, razina logova, uključen vegetarijanski meni.
      </>
    ),
  },
  {
    title: 'envFrom: ključevi postaju varijable okruženja',
    body: (
      <>
        Pri pokretanju kontejnera kubelet svaki ključ ConfigMapa pretvori u varijablu okruženja. Ista slika, tri ponašanja: svaki Pod spaja se na svoju bazu.
      </>
    ),
  },
  {
    title: 'Ili kao datoteka u volumenu',
    body: (
      <>
        ConfigMap se može montirati i kao volumen: svaki ključ postaje datoteka u montiranom direktoriju, npr. <code>/etc/klopa/postavke/postavke.ini</code>. Takva se datoteka kasnije sama osvježi (osim ako je montirana sa <code>subPath</code>), a varijabla okruženja ne – to ćemo isprobati.
      </>
    ),
  },
]

interface Geo {
  w: number
  h: number
  image: [number, number]
  cols: { head: [number, number]; card: [number, number]; pod: [number, number] }[]
  cardW: number
  font: number
  hand: number
}

const WIDE: Geo = {
  w: 780,
  h: 470,
  image: [390, 70],
  cols: ENVS.map((_, i) => {
    const x = 132 + i * 258
    return { head: [x, 150] as [number, number], card: [x - 112, 170] as [number, number], pod: [x, 360] as [number, number] }
  }),
  cardW: 224,
  font: 14,
  hand: 20,
}

const NARROW: Geo = {
  w: 400,
  h: 720,
  image: [200, 64],
  cols: ENVS.map((_, i) => {
    const y = 160 + i * 186
    return { head: [16, y] as [number, number], card: [10, y + 18] as [number, number], pod: [318, y + 74] as [number, number] }
  }),
  cardW: 214,
  font: 15,
  hand: 21,
}

function Scene({ step, g }: { step: number; g: Geo }) {
  const narrow = g === NARROW
  return (
    <Diagram width={g.w} height={g.h} label={`Jedna slika klopa-api:1.4.0, tri okruženja s vlastitim ConfigMapom. Korak ${step + 1}: ${STEPS[step].title}.`}>
      {/* the image */}
      <TrayStack x={g.image[0] - 50} y={g.image[1] - 36} w={100} h={56} n={3} />
      <text x={g.image[0] + 62} y={g.image[1] - 14} className="k-svg-mono" style={{ fontSize: g.font, fontWeight: 700 }}>
        klopa-api:1.4.0
      </text>
      <text x={g.image[0] + 62} y={g.image[1] + 6} className="k-svg-mono" style={{ fontSize: g.font - 1, fill: 'var(--ink-2)' }}>
        sha256:4f1c…
      </text>
      {step === 0 && (
        <g>
          <StepBadge n={1} x={g.image[0] - 78} y={g.image[1] - 10} color={stepColor(0)} r={narrow ? 15 : 13} />
          <text x={g.image[0] - 100} y={g.image[1] + 30} textAnchor="end" className="k-svg-hand" style={{ fontSize: g.hand, fill: stepColor(0) }}>
            {narrow ? 'isti digest' : 'isti digest svugdje'}
          </text>
        </g>
      )}
      {/* narrow: one dashed trunk from the image down the right edge, a branch into every Pod */}
      {g === NARROW && (
        <Rough shape={{ k: 'lin', pts: [[g.image[0], g.image[1] + 26], [g.image[0], g.image[1] + 40], [g.w - 7, g.image[1] + 40], [g.w - 7, g.cols[2].pod[1] + 18]] }} seed={2399} stroke="var(--ink-3)" strokeWidth={1.2} dash="5 5" />
      )}
      {ENVS.map((env, i) => {
        const c = g.cols[i]
        const [px, py] = c.pod
        const [cx, cy] = c.card
        const cardH = 96
        const running = step >= 2
        return (
          <g key={env.id}>
            {/* the image goes to every environment */}
            {!narrow && <Arrow pts={[[g.image[0] + (i - 1) * 40, g.image[1] + 26], [c.head[0], c.head[1] - 24]]} stroke="var(--ink-3)" strokeWidth={1.2} seed={2400 + i} dash="5 5" />}
            <text x={c.head[0]} y={c.head[1]} textAnchor={narrow ? 'start' : 'middle'} className="k-svg-display" style={{ fontSize: g.font + 2, fontWeight: 800 }}>
              {env.title}
            </text>
            {step >= 1 && (
              <g>
                <FolderTab x={cx} y={cy} w={g.cardW} h={cardH + 18} label="ConfigMap" labelSize={g.font - 1} seed={2410 + i * 3} tint={i === 2 ? 'var(--note-blue)' : i === 1 ? 'var(--note-green)' : 'var(--note-yellow)'} />
                {env.lines.map((l, k) => (
                  <text key={k} x={cx + 10 + (k === 1 ? (narrow ? 14 : 24) : 0)} y={cy + 40 + k * (g.font + 5)} className="k-svg-mono" style={{ fontSize: g.font - 1, fill: 'var(--note-ink)', fontWeight: k === 1 ? 700 : 500 }}>
                    {l}
                  </text>
                ))}
              </g>
            )}
            {step >= 2 && (
              <Arrow pts={narrow ? [[cx + g.cardW + 4, cy + 56], [px - 32, py]] : [[px, cy + cardH + 22], [px, py - 34]]} stroke={step === 2 ? stepColor(2) : 'var(--ink-2)'} strokeWidth={1.6} seed={2420 + i} />
            )}
            {step === 2 && (
              <text x={narrow ? px : px + 8} y={narrow ? py - 36 : py - 50} textAnchor={narrow ? 'middle' : 'start'} className="k-svg-mono" style={{ fontSize: g.font - 1, fill: stepColor(2), fontWeight: 600 }}>
                envFrom
              </text>
            )}
            {narrow && <Arrow pts={[[g.w - 7, py + 18], [px + 26, py + 18]]} stroke="var(--ink-3)" strokeWidth={1.2} seed={2404 + i} dash="5 5" />}
            <PodShape x={px} y={py} size={narrow ? 48 : 42} status={running ? 'running' : 'pending'} tone="blue" label="1.4.0" ariaLabel={`Pod klopa-api 1.4.0 u okruženju ${env.title}`} />
            {running && (
              <text x={narrow ? g.w - 14 : px} y={py + (narrow ? 76 : 46)} textAnchor={narrow ? 'end' : 'middle'} className="k-svg-mono" style={{ fontSize: g.font - 1, fill: 'var(--ink-2)' }}>
                {step === 3 ? 'postavke.ini' : `→ ${env.host}`}
              </text>
            )}
            {step === 3 && (
              <g>
                <Rough shape={{ k: 'poly', pts: [[px + 30, py - 22], [px + 50, py - 22], [px + 58, py - 14], [px + 58, py + 14], [px + 30, py + 14]] }} seed={2430 + i} strokeWidth={1.3} fillColor="var(--paper)" fillStyle="solid" stroke={stepColor(3)} />
                {[0, 1, 2].map((k) => (
                  <Rough key={k} shape={{ k: 'line', x1: px + 35, y1: py - 12 + k * 8, x2: px + 52, y2: py - 12 + k * 8 }} seed={2440 + i * 5 + k} stroke="var(--ink-3)" strokeWidth={1} />
                ))}
              </g>
            )}
          </g>
        )
      })}
      {step === 1 && (
        <g>
          <StepBadge n={2} x={narrow ? g.cols[0].card[0] + g.cardW + 18 : g.cols[2].card[0] + g.cardW + 8} y={narrow ? g.cols[0].card[1] + 8 : g.cols[2].card[1] - 18} color={stepColor(1)} r={narrow ? 15 : 13} />
        </g>
      )}
      {step === 2 && <StepBadge n={3} x={narrow ? 372 : g.cols[2].pod[0] + 60} y={narrow ? g.cols[0].pod[1] - 40 : g.cols[2].pod[1]} color={stepColor(2)} r={narrow ? 15 : 13} />}
      {step === 3 && <StepBadge n={4} x={narrow ? 372 : g.cols[2].pod[0] + 86} y={narrow ? g.cols[0].pod[1] - 40 : g.cols[2].pod[1]} color={stepColor(3)} r={narrow ? 15 : 13} />}
    </Diagram>
  )
}

export function OneImageStepper() {
  const [ref, width] = useBoxWidth<HTMLDivElement>()
  const g = width === null || width >= Math.ceil((WIDE.w * 12) / (WIDE.font - 1)) ? WIDE : NARROW
  return (
    <Stepper steps={STEPS} title="Jedna slika, tri okruženja" autoPlay={0}>
      {(step) => (
        <div ref={ref} style={{ width: '100%' }}>
          <div style={g === NARROW ? { maxWidth: 440, margin: '0 auto' } : undefined}>
            <Scene step={step} g={g} />
          </div>
        </div>
      )}
    </Stepper>
  )
}
