/**
 * Scene 3 „Tri pitanja zdravlja”: three probe lanes on one time axis (a probe every 10 s, the real default). Startup
 * holds the other two back; liveness ✕×3 → restart in place; readiness ✕×3 → out of traffic, no restart.
 */
import { Check, Cross, PodShape, Rough, StepBadge, Stepper, stepColor, useWidth } from '../../../kit'

const STEPS = [
  {
    title: 'Provjera pokretanja: „Jesi li se već pokrenuo?”',
    body: 'Dok provjera pokretanja (startupProbe) ne uspije, kubelet ne pokreće provjeru živosti ni spremnosti – spora aplikacija ima vremena. Ovdje je failureThreshold: 6 (kao u pod.yaml), pa ima do 60 s i uspije pri petom pokušaju, nakon 40 s. Sa zadanih 3 kubelet bi kontejner ubio već nakon trećeg ✕, oko 20. sekunde.',
  },
  {
    title: 'Provjera živosti: „Jesi li zaglavio?”',
    body: 'Provjera živosti (livenessProbe) pita samo je li vlastiti proces živ i odgovara li (/healthz). Kad padne failureThreshold puta zaredom (zadano 3), kubelet ubije kontejner i pokrene ga ponovno u istom Podu: RESTARTS +1, isto ime i IP adresa. Nakon restarta provjera pokretanja kreće ispočetka.',
  },
  {
    title: 'Provjera spremnosti: „Možeš li sada služiti?”',
    body: 'Provjera spremnosti (readinessProbe) pita može li ovaj Pod upravo sada primati promet: je li zagrijan, nije li preopterećen (/ready). Kad padne, Pod izlazi iz prometa (Ready = False), ali se ne restarta. Čim opet prođe, vraća se.',
  },
]

type Mark = 'ok' | 'fail' | 'none'

interface Lane {
  label: string
  question: string
  marks: Mark[]
}

/** probe results at t = 0, 10, 20 … 110 s for each step (none = not probing) */
const LANES: Lane[][] = [
  [
    { label: 'pokretanje', question: 'pokrenut?', marks: ['fail', 'fail', 'fail', 'fail', 'ok', 'none', 'none', 'none', 'none', 'none', 'none', 'none'] },
    { label: 'živost', question: 'zaglavio?', marks: ['none', 'none', 'none', 'none', 'none', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok'] },
    { label: 'spremnost', question: 'služiš?', marks: ['none', 'none', 'none', 'none', 'none', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok'] },
  ],
  [
    { label: 'pokretanje', question: 'pokrenut?', marks: ['ok', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'ok', 'none', 'none', 'none'] },
    { label: 'živost', question: 'zaglavio?', marks: ['none', 'ok', 'ok', 'ok', 'fail', 'fail', 'fail', 'none', 'none', 'ok', 'ok', 'ok'] },
    { label: 'spremnost', question: 'služiš?', marks: ['none', 'ok', 'ok', 'ok', 'fail', 'fail', 'fail', 'none', 'none', 'fail', 'ok', 'ok'] },
  ],
  [
    { label: 'pokretanje', question: 'pokrenut?', marks: ['ok', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'] },
    { label: 'živost', question: 'zaglavio?', marks: ['none', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok'] },
    { label: 'spremnost', question: 'služiš?', marks: ['none', 'ok', 'ok', 'fail', 'fail', 'fail', 'fail', 'fail', 'ok', 'ok', 'ok', 'ok'] },
  ],
]

interface Geo {
  W: number
  H: number
  labelX: number
  x0: number
  dx: number
  laneY: number[]
  axisY: number
  pod: [number, number]
  podText: [number, number]
  slots: number
  hand: number
  mono: number
  badge: [number, number]
}

const WIDE: Geo = { W: 720, H: 300, labelX: 16, x0: 168, dx: 36, laneY: [62, 124, 186], axisY: 230, pod: [656, 112], podText: [656, 176], slots: 12, hand: 19, mono: 14, badge: [150, 24] }
const NARROW: Geo = { W: 360, H: 420, labelX: 12, x0: 116, dx: 30, laneY: [80, 136, 192], axisY: 230, pod: [180, 320], podText: [180, 380], slots: 8, hand: 20, mono: 14.5, badge: [330, 24] }

function outcome(step: number): { text: string[]; shape: 'running' | 'notready' | 'crash'; color: string } {
  if (step === 0) return { text: ['Running,', 'zatim Ready'], shape: 'running', color: 'var(--green)' }
  if (step === 1) return { text: ['↻ restart', 'u istom Podu'], shape: 'crash', color: 'var(--red)' }
  return { text: ['izvan prometa,', 'bez restarta'], shape: 'notready', color: 'var(--ink-2)' }
}

function ProbeFrame({ step, g }: { step: number; g: Geo }) {
  const lanes = LANES[step]
  const c = stepColor(step)
  const o = outcome(step)
  const narrow = g.W < 400
  const xs = (i: number) => g.x0 + i * g.dx
  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={`Korak ${step + 1}: ${STEPS[step].title}`} style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}>
      {lanes.map((l, li) => {
        const y = g.laneY[li]
        const active = li === step
        return (
          <g key={l.label}>
            <text x={g.labelX} y={y - 4} className="k-svg-hand" style={{ fontSize: g.hand + (active ? 2 : 0), fill: active ? c : 'var(--ink-3)', fontWeight: active ? 700 : 400 }}>
              {l.label}
            </text>
            <text x={g.labelX} y={y + 16} className="k-svg-mono" style={{ fontSize: g.mono - 0.5, fill: 'var(--ink-3)' }}>
              {l.question}
            </text>
            <g opacity={active ? 1 : 0.5}>
            <Rough shape={{ k: 'line', x1: g.x0 - 14, y1: y + 2, x2: xs(g.slots - 1) + 14, y2: y + 2 }} seed={12500 + li} stroke="var(--ink-4)" strokeWidth={1.2} dash="3 5" />
            {l.marks.slice(0, g.slots).map((m, i) =>
              m === 'none' ? null : (
                <g key={i} transform={`translate(${xs(i)} ${y})`}>
                  {m === 'ok' ? <Check x={0} y={0} size={8} seed={41 + (i % 3)} /> : <Cross x={0} y={0} size={7} seed={47 + (i % 3)} />}
                </g>
              ),
            )}
            </g>
            {li > 0 && step === 0 && (
              <text x={xs(1)} y={y + 24} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--ink-3)' }}>
                čeka…
              </text>
            )}
          </g>
        )
      })}
      {/* time axis */}
      <Rough shape={{ k: 'line', x1: g.x0 - 14, y1: g.axisY, x2: xs(g.slots - 1) + 14, y2: g.axisY }} seed={12510} stroke="var(--ink-2)" strokeWidth={1.4} />
      {Array.from({ length: g.slots }, (_, i) =>
        i % 2 === 0 ? (
          <text key={i} x={xs(i)} y={g.axisY + 20} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono - 1 }}>
            {i * 10} s
          </text>
        ) : null,
      )}
      {/* what the kubelet does about it */}
      {step === 0 && (
        <g>
          <text x={narrow ? g.labelX : xs(6) + 6} y={narrow ? g.laneY[0] - 54 : g.laneY[0] - 6} className="k-svg-mono" style={{ fontSize: g.mono - 1, fill: c, fontWeight: 700 }}>
            failureThreshold: 6
          </text>
          <text x={xs(4)} y={g.laneY[0] - 22} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand, fill: c }}>
            ✓ pokrenut nakon 40 s
          </text>
        </g>
      )}
      {step === 1 && (
        <g>
          <Rough shape={{ k: 'rect', x: xs(4) - 14, y: g.laneY[1] - 18, w: g.dx * 2 + 28, h: 36 }} seed={12520} stroke={c} strokeWidth={1.6} dash="4 3" />
          <text x={narrow ? xs(5) : xs(7) + 10} y={g.laneY[1] - 22} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand, fill: c }}>
            {narrow ? '3× ✕ → ↻' : '3× ✕ → kubelet: ↻ restart'}
          </text>
        </g>
      )}
      {step === 2 && (
        <g>
          <Rough shape={{ k: 'rect', x: xs(3) - 14, y: g.laneY[2] - 18, w: g.dx * 2 + 28, h: 36 }} seed={12530} stroke={c} strokeWidth={1.6} dash="4 3" />
          <text x={xs(5) + 14} y={g.laneY[2] - 24} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand, fill: c }}>
            {narrow ? '3× ✕ → izvan prometa' : '3× ✕ → izvan prometa (Ready = False)'}
          </text>
        </g>
      )}
      <PodShape x={g.pod[0]} y={g.pod[1]} size={54} status={o.shape} tone="blue" label="api" />
      {step === 1 && (
        <text x={g.pod[0] + 36} y={g.pod[1] - 30} className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--red)', fontWeight: 700 }}>
          ↻ 1
        </text>
      )}
      {o.text.map((line, i) => (
        <text key={line} x={g.podText[0]} y={g.podText[1] + i * 22} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand, fill: o.color }}>
          {line}
        </text>
      ))}
      <StepBadge n={step + 1} x={g.badge[0]} y={g.badge[1]} color={c} />
    </svg>
  )
}

export function ProbesStepper() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const g = w !== null && w < 670 ? NARROW : WIDE
  return (
    <div ref={ref}>
      <Stepper title="Tri pitanja, tri različite posljedice" steps={STEPS} caption="Svakih 10 s jedna provjera (zadani periodSeconds); živost i spremnost padaju nakon 3 neuspjeha zaredom (zadani failureThreshold), a provjera pokretanja ovdje ima failureThreshold 6. Istaknuti redak je pitanje iz koraka.">
        {(step) => (
          <div style={g === NARROW ? { maxWidth: 440, margin: '0 auto' } : undefined}>
            <ProbeFrame step={step} g={g} />
          </div>
        )}
      </Stepper>
    </div>
  )
}
