/**
 * „Tri ere” (Kubernetes docs overview): one app per physical server → virtual machines (each with a whole OS) →
 * containers (one shared kernel, each with its own libraries). Klopa's six apps in every frame.
 */
import { Rough, StepBadge, Stepper, stepColor, useWidth } from '../../../kit'
import { Band, ContainerBox, Face, ProgramCard, VmFrame } from './parts'

const APPS = ['web', 'api', 'worker', 'postgres', 'redis', 'rabbitmq']
const LIB: Record<string, string> = { api: 'libvips 8.15', worker: 'libvips 8.12' }
const TINT = ['var(--hl-orange-ink)', 'var(--hl-blue-ink)', 'var(--hl-green-ink)', 'var(--hl-lilac-ink)', 'var(--hl-pink-ink)', 'var(--hl-yellow-ink)']

interface Geo {
  W: number
  H: number
  /** top-left of item i, and its size */
  item: (i: number) => [number, number]
  iw: number
  /** host frame (steps 2 and 3) */
  host: { x: number; y: number; w: number; h: number }
  /** the shared layer (hypervisor / kernel) */
  base: { x: number; y: number; w: number; h: number }
  /** VM / container height */
  ih: number
  note: [number, number]
  mono: number
  hand: number
}

const WIDE: Geo = {
  W: 720,
  H: 330,
  item: (i) => [28 + i * 114, 84],
  iw: 102,
  host: { x: 12, y: 58, w: 696, h: 266 },
  base: { x: 24, y: 270, w: 672, h: 42 },
  ih: 170,
  note: [360, 30],
  mono: 14,
  hand: 21,
}

const NARROW: Geo = {
  W: 360,
  H: 560,
  item: (i) => [18 + (i % 3) * 112, 88 + Math.floor(i / 3) * 206],
  iw: 102,
  host: { x: 6, y: 62, w: 348, h: 492 },
  base: { x: 16, y: 498, w: 328, h: 44 },
  ih: 186,
  note: [180, 34],
  mono: 15,
  hand: 21,
}

const STEPS = [
  {
    title: 'Jedna aplikacija – jedan poslužitelj',
    body: 'Najsigurnije je svaku aplikaciju staviti na svoje računalo: nitko nikome ne smeta, svaka ima svoje biblioteke. Ali Klopa bi tada trebala šest poslužitelja, a većina bi cijeli dan čekala na podne.',
  },
  {
    title: 'Virtualni strojevi',
    body: 'Hipervizor jedno fizičko računalo dijeli na više virtualnih. Svaki virtualni stroj (VM) ima cijeli vlastiti operacijski sustav – i vlastitu jezgru. Izolacija je jaka, ali svaki VM troši memoriju na svoj OS i diže se kao pravo računalo.',
  },
  {
    title: 'Kontejneri',
    body: 'Kontejneri dijele jednu jezgru operacijskog sustava domaćina. Svaki nosi samo svoje datoteke: klopa-api svoj libvips, klopa-worker svoj. Nema OS-a gosta, pa su manji i pokreću se brzo – ali izolacija je slabija.',
  },
]

const NOTES = ['6 aplikacija = 6 poslužitelja, većinom besposlenih', 'jedan poslužitelj, svaki VM sa svojim OS-om', 'jedna jezgra, svaki kontejner sa svojim bibliotekama']

function Frame({ step, g }: { step: number; g: Geo }) {
  const narrow = g === NARROW
  const color = stepColor(step)
  const label = `Korak ${step + 1}: ${STEPS[step].title}. ${NOTES[step]}.`
  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={label} style={{ display: 'block', width: '100%', maxWidth: narrow ? 440 : undefined, margin: '0 auto', height: 'auto', overflow: 'visible' }}>
      <StepBadge n={step + 1} x={narrow ? 18 : 26} y={g.note[1] - 6} color={color} />
      <text x={narrow ? 38 : g.note[0]} y={g.note[1]} textAnchor={narrow ? 'start' : 'middle'} className="k-svg-hand" style={{ fontSize: narrow ? g.hand - 1.5 : g.hand, fill: color }}>
        {narrow && step === 2 ? 'jedna jezgra, svatko svoje biblioteke' : NOTES[step]}
      </text>
      {step === 0 &&
        APPS.map((a, i) => {
          const [x, y] = g.item(i)
          const h = narrow ? 170 : 200
          return (
            <g key={a}>
              <Rough shape={{ k: 'rect', x, y, w: g.iw, h }} seed={7300 + i * 11} strokeWidth={1.8} fillColor="var(--paper)" fillStyle="solid" />
              <Face cx={x + g.iw - 16} cy={y + 18} r={11} mood="calm" seed={7310 + i} />
              <ProgramCard x={x + 8} y={y + 40} w={g.iw - 16} h={40} name={a} size={g.mono - 0.5} seed={7320 + i * 3} />
              {LIB[a] && (
                <text x={x + g.iw / 2} y={y + 102} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono - 1, fill: 'var(--ink-2)' }}>
                  {LIB[a]}
                </text>
              )}
              {/* CPU fuel bar: almost empty */}
              <rect x={x + 10} y={y + h - 46} width={g.iw - 20} height={9} style={{ fill: 'none', stroke: 'var(--ink-2)', strokeWidth: 1.2 }} />
              <rect x={x + 10} y={y + h - 46} width={(g.iw - 20) * 0.07} height={9} style={{ fill: 'var(--green)' }} />
              <text x={x + g.iw / 2} y={y + h - 16} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono - 1, fill: 'var(--ink-2)' }}>
                CPU 5 %
              </text>
            </g>
          )
        })}
      {step > 0 && (
        <g>
          <Rough shape={{ k: 'rect', ...g.host }} seed={7400} strokeWidth={2} multi />
          <Band
            {...g.base}
            label={step === 1 ? 'hipervizor' : 'jezgra domaćina – jedna za sve'}
            size={16}
            hatch={step === 1 ? 'var(--ink-3)' : 'var(--hl-blue-ink)'}
            seed={7410 + step}
          />
          {APPS.map((a, i) => {
            const [x, y0] = g.item(i)
            const y = y0 - 8
            if (step === 1)
              return (
                <g key={a}>
                  <VmFrame x={x} y={y} w={g.iw} h={g.ih} label="VM" size={g.mono - 1} seed={7420 + i * 7} />
                  <ProgramCard x={x + 8} y={y + 26} w={g.iw - 16} h={38} name={a} size={g.mono - 0.5} seed={7430 + i * 3} />
                  {LIB[a] && (
                    <text x={x + g.iw / 2} y={y + 84} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono - 1, fill: 'var(--ink-2)' }}>
                      {LIB[a]}
                    </text>
                  )}
                  <Band x={x + 7} y={y + g.ih - 70} w={g.iw - 14} h={60} label="OS gosta" sub="+ jezgra" size={14} subSize={g.mono - 1} hatch="var(--hl-blue-ink)" seed={7440 + i} />
                </g>
              )
            const cy = y + g.ih - 92
            return (
              <g key={a}>
                <ContainerBox x={x + 6} y={cy} w={g.iw - 12} h={52} name={a} size={g.mono - 0.5} seed={7450 + i * 3} tint={TINT[i]} />
                {LIB[a] && (
                  <text x={x + g.iw / 2} y={cy + 74} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono - 1, fill: 'var(--ink-2)' }}>
                    {LIB[a]}
                  </text>
                )}
                {/* a dashed line down to the shared kernel: each container is a process on it */}
                <Rough shape={{ k: 'line', x1: x + g.iw / 2, y1: cy + (LIB[a] ? 82 : 56), x2: x + g.iw / 2, y2: narrow && i < 3 ? cy + 92 : g.base.y }} seed={7460 + i} stroke="var(--pen)" strokeWidth={1.3} dash="3 5" />
              </g>
            )
          })}
        </g>
      )}
    </svg>
  )
}

export function ErasStepper() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const g = w !== null && w < 700 ? NARROW : WIDE
  return (
    <div className="k-wide" ref={ref}>
      <Stepper title="Tri načina dijeljenja jednog računala" steps={STEPS} caption="Prema pregledu „tri ere” iz dokumentacije Kubernetesa: tradicionalno, virtualizirano, kontejneri.">
        {(step) => <Frame step={step} g={g} />}
      </Stepper>
    </div>
  )
}
