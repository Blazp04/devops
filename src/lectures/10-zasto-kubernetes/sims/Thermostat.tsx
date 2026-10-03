/**
 * Scene 3 „Termostat”: desired 22 °C (dashed) vs actual (solid); the loop ring promotri → usporedi → ispravi.
 * Level-triggered: the „prozor otvoren!” notification falls and is lost, the next pass still measures the difference.
 * The last step swaps the room for an app: želja 3 (dashed ghosts), stvarno 2 → the loop starts one copy.
 */
import { useId } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Cross, Rough, StepBadge, Stepper, stepColor, useWidth } from '../../../kit'
import { AppBox } from './parts'

const STEPS = [
  { title: 'Promotri', body: 'Termostat izmjeri sobu: 18 °C. Želja je 22 °C. Iscrtkana crta je željeno stanje, puna crta stvarno – tako ćemo ih crtati do kraja tečaja.' },
  { title: 'Usporedi', body: '22 − 18 = 4. Termostat ne pita zašto je hladno ni tko je otvorio prozor. Zanima ga samo razlika između želje i stvarnosti.' },
  { title: 'Ispravi', body: 'Termostat uključi grijanje i drži ga dok razlika ne padne na nulu. Tada ne radi ništa – ali i dalje mjeri. Krug se vrti zauvijek.' },
  { title: 'Izgubljena obavijest', body: 'Netko otvori prozor i pošalje poruku „prozor otvoren!”, ali poruka se izgubi. Ne smeta: u sljedećem krugu termostat izmjeri 19 °C i opet grije. Reagira na razliku, a ne na poruku.' },
  { title: 'Isto za aplikacije', body: 'Zamijenimo sobu aplikacijom. Želja: tri kopije (iscrtkano). Stvarno: dvije. Obavijest „kopija je nestala” izgubila se, ali sljedeći prolaz vidi 2 ≠ 3 i pokrene novu kopiju.' },
]

const ACTIVE = [0, 1, 2, 2, 2]
const PHASES = ['promotri', 'usporedi', 'ispravi']
const TEMP = [18, 18, 22, 19, 0]
const CENTER = ['18 °C', '22 − 18 = 4', 'razlika 0 ✓', '19 °C → grijanje', '3 − 2 = 1']

interface Geo {
  W: number
  H: number
  ring: { cx: number; cy: number; r: number }
  thermo: { x: number; y: number; h: number; side: 'left' | 'right' }
  heater: { x: number; y: number }
  slip: { x: number; y: number }
  apps: { x: number; y: number }
  labels: [number, number, 'start' | 'middle' | 'end'][]
}

const WIDE: Geo = {
  W: 720,
  H: 340,
  ring: { cx: 410, cy: 160, r: 90 },
  thermo: { x: 170, y: 44, h: 200, side: 'left' },
  heater: { x: 590, y: 150 },
  slip: { x: 12, y: 266 },
  apps: { x: 20, y: 130 },
  labels: [
    [512, 98, 'start'],
    [410, 290, 'middle'],
    [308, 98, 'end'],
  ],
}

const NARROW: Geo = {
  W: 380,
  H: 530,
  ring: { cx: 190, cy: 150, r: 80 },
  thermo: { x: 40, y: 300, h: 180, side: 'right' },
  heater: { x: 240, y: 330 },
  slip: { x: 196, y: 444 },
  apps: { x: 24, y: 330 },
  labels: [
    [262, 90, 'start'],
    [190, 266, 'middle'],
    [118, 90, 'end'],
  ],
}

/** the falling note (Kalam ≥ 18 px on screen in both layouts) */
const SLIP = { w: 150, h: 44, fs: 20 }

const T_MIN = 14
const T_MAX = 26

function Frame({ step, g }: { step: number; g: Geo }) {
  const reduce = !!useReducedMotion()
  const color = stepColor(step % 3)
  const { cx, cy, r } = g.ring
  const app = step === 4
  // step 3 „Ispravi”: the heater ran until the difference was 0 and now rests; step 4: it heats again
  const heating = step === 3
  const resting = step === 2
  const mercuryClip = `l10th${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  // three arcs of the ring (radians, clockwise from the top)
  const arcs: [number, number][] = [
    [-Math.PI / 2 + 0.25, Math.PI / 6 - 0.25],
    [Math.PI / 6 + 0.25, (5 * Math.PI) / 6 - 0.25],
    [(5 * Math.PI) / 6 + 0.25, (3 * Math.PI) / 2 - 0.25],
  ]
  const tY = (t: number) => g.thermo.y + g.thermo.h - ((t - T_MIN) / (T_MAX - T_MIN)) * g.thermo.h
  const temp = TEMP[step]
  const left = g.thermo.side === 'left'
  const lx1 = left ? g.thermo.x - 46 : g.thermo.x - 16
  const lx2 = left ? g.thermo.x + 46 : g.thermo.x + 62
  const labX = left ? g.thermo.x - 52 : g.thermo.x + 68
  const labAnchor = left ? 'end' : 'start'
  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={`Korak ${step + 1}: ${STEPS[step].title}. ${CENTER[step]}.`} style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}>
      {/* ── the loop ring ── */}
      {arcs.map(([a0, a1], i) => {
        const on = ACTIVE[step] === i
        const end: [number, number] = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)]
        const tan = a1 + Math.PI / 2
        const head = 11
        return (
          <g key={i}>
            <Rough shape={{ k: 'arc', cx, cy, w: r * 2, h: r * 2, start: a0, stop: a1 }} seed={7400 + i} stroke={on ? color : 'var(--ink-3)'} strokeWidth={on ? 3 : 1.6} />
            <Rough
              shape={{ k: 'lin', pts: [[end[0] - head * Math.cos(tan - 0.5), end[1] - head * Math.sin(tan - 0.5)], end, [end[0] - head * Math.cos(tan + 0.5), end[1] - head * Math.sin(tan + 0.5)]] }}
              seed={7410 + i}
              stroke={on ? color : 'var(--ink-3)'}
              strokeWidth={on ? 2.6 : 1.5}
              roughness={0.5}
            />
            <text x={g.labels[i][0]} y={g.labels[i][1]} textAnchor={g.labels[i][2]} className="k-svg-hand" style={{ fontSize: 24, fontWeight: on ? 700 : 500, fill: on ? color : 'var(--ink-2)' }}>
              {i + 1}. {PHASES[i]}
            </text>
          </g>
        )
      })}
      <text x={cx} y={cy - 8} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 20, fill: 'var(--ink-2)' }}>
        {app ? 'petlja usklađivanja' : 'termostat'}
      </text>
      <text x={cx} y={cy + 22} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 19, fontWeight: 700 }}>
        {CENTER[step]}
      </text>

      {!app ? (
        <>
          {/* ── thermometer: dashed = desired, solid = actual ── */}
          <Rough shape={{ k: 'rect', x: g.thermo.x, y: g.thermo.y, w: 30, h: g.thermo.h }} seed={7420} strokeWidth={1.8} fillColor="var(--paper)" fillStyle="solid" />
          <Rough shape={{ k: 'ellipse', cx: g.thermo.x + 15, cy: g.thermo.y + g.thermo.h + 16, w: 40, h: 40 }} seed={7421} strokeWidth={1.8} fillColor="var(--red)" fillStyle="hachure" hachureGap={4} />
          {/* mercury: one fixed red hatching revealed by a rising clip */}
          <clipPath id={mercuryClip}>
            <motion.rect
              x={g.thermo.x + 2}
              width={26}
              initial={false}
              animate={{ y: tY(temp), height: g.thermo.y + g.thermo.h - tY(temp) + 8 }}
              transition={reduce ? { duration: 0 } : { duration: step === 2 ? 1.6 : 0.6, ease: 'easeInOut' }}
            />
          </clipPath>
          <g clipPath={`url(#${mercuryClip})`}>
            <Rough shape={{ k: 'rect', x: g.thermo.x + 7, y: g.thermo.y + 4, w: 16, h: g.thermo.h + 4 }} seed={7424} strokeWidth={1.4} stroke="var(--red)" fillColor="var(--red)" fillStyle="hachure" hachureGap={3.2} />
          </g>
          <Rough shape={{ k: 'line', x1: lx1, y1: tY(22), x2: lx2, y2: tY(22) }} seed={7422} stroke="var(--pen)" strokeWidth={2.2} dash="6 5" />
          <text x={labX} y={tY(22) + 6} textAnchor={labAnchor} className="k-svg-hand" style={{ fontSize: 21, fontWeight: 700, fill: 'var(--pen)' }}>
            želja 22 °C
          </text>
          <motion.g initial={false} animate={{ y: tY(temp) }} transition={reduce ? { duration: 0 } : { duration: step === 2 ? 1.6 : 0.6, ease: 'easeInOut' }}>
            <Rough shape={{ k: 'line', x1: lx1, y1: 0, x2: lx2, y2: 0 }} seed={7423} stroke="var(--ink)" strokeWidth={2.2} />
            <text x={labX} y={step === 2 ? 30 : 6} textAnchor={labAnchor} className="k-svg-hand" style={{ fontSize: 21, fontWeight: 700, fill: 'var(--ink)' }}>
              stvarno {temp} °C
            </text>
          </motion.g>

          {/* ── heater ── */}
          <g transform={`translate(${g.heater.x} ${g.heater.y})`}>
            <Rough shape={{ k: 'rect', x: 0, y: 0, w: 120, h: 70 }} seed={7430} strokeWidth={1.8} fillColor="var(--paper)" fillStyle="solid" />
            {[1, 2, 3, 4, 5].map((k) => (
              <Rough key={k} shape={{ k: 'line', x1: k * 20, y1: 8, x2: k * 20, y2: 62 }} seed={7431 + k} strokeWidth={1.4} />
            ))}
            <text x={60} y={96} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 21, fill: heating ? 'var(--red)' : 'var(--ink-3)', fontWeight: 600 }}>
              {heating ? 'grijanje radi' : resting ? 'grijanje stalo' : 'grijanje ne radi'}
            </text>
            {heating &&
              [24, 60, 96].map((hx, k) => (
                <motion.g key={`h${hx}`} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduce ? 0 : 0.2 + k * 0.15 }}>
                  <Rough shape={{ k: 'curve', pts: [[hx, -6], [hx - 6, -16], [hx + 4, -26], [hx - 4, -38]] }} seed={7440 + k} stroke="var(--red)" strokeWidth={1.8} />
                </motion.g>
              ))}
            {/* „Ispravi”: the flames burn while the mercury rises (1,6 s), then go out – no difference, no action */}
            {resting &&
              !reduce &&
              [24, 60, 96].map((hx, k) => (
                <motion.g key={`r${hx}`} initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ delay: 1.6, duration: 0.4 }}>
                  <Rough shape={{ k: 'curve', pts: [[hx, -6], [hx - 6, -16], [hx + 4, -26], [hx - 4, -38]] }} seed={7440 + k} stroke="var(--red)" strokeWidth={1.8} />
                </motion.g>
              ))}
          </g>
        </>
      ) : (
        <g transform={`translate(${g.apps.x} ${g.apps.y})`}>
          {/* ── the same loop for an app: 3 desired (dashed), 2 actual, one new ── */}
          {[0, 1, 2].map((k) => (
            <AppBox key={`d${k}`} x={k * 62} y={0} w={54} h={34} app="api" ghost seedKey={`thd${k}`} />
          ))}
          <AppBox x={0} y={0} w={54} h={34} app="api" seedKey="tha0" />
          <AppBox x={62} y={0} w={54} h={34} app="api" seedKey="tha1" />
          <motion.g initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduce ? 0 : 1.2, duration: 0.4 }}>
            <AppBox x={124} y={0} w={54} h={34} app="api" seedKey="tha2" />
          </motion.g>
          <text x={0} y={62} className="k-svg-hand" style={{ fontSize: 21, fontWeight: 700, fill: 'var(--pen)' }}>
            želja: 3 (iscrtkano)
          </text>
          <text x={0} y={88} className="k-svg-hand" style={{ fontSize: 21, fontWeight: 700 }}>
            stvarno: 2 → 3
          </text>
        </g>
      )}

      {/* ── the lost notification ── */}
      {(step === 3 || step === 4) && (
        <motion.g
          key={`slip${step}`}
          initial={reduce ? false : { y: -40, rotate: -18, opacity: 0 }}
          animate={{ y: 0, rotate: 8, opacity: 1 }}
          transition={{ duration: reduce ? 0 : 0.9, ease: 'easeIn' }}
          style={{ transformOrigin: `${g.slip.x + SLIP.w / 2}px ${g.slip.y + SLIP.h / 2}px` }}
        >
          <Rough
            shape={{ k: 'poly', pts: [[g.slip.x, g.slip.y], [g.slip.x + SLIP.w, g.slip.y], [g.slip.x + SLIP.w, g.slip.y + SLIP.h - 12], [g.slip.x + SLIP.w - 12, g.slip.y + SLIP.h], [g.slip.x, g.slip.y + SLIP.h]] }}
            seed={7450}
            strokeWidth={1.4}
            fillColor="var(--note-yellow)"
            fillStyle="solid"
          />
          <text x={g.slip.x + SLIP.w / 2} y={g.slip.y + SLIP.h / 2 + 7} textAnchor="middle" className="k-svg-print" style={{ fontSize: SLIP.fs, fill: 'var(--note-ink)' }}>
            {step === 3 ? 'prozor otvoren!' : 'kopija nestala!'}
          </text>
          <Cross x={g.slip.x + SLIP.w / 2} y={g.slip.y + SLIP.h / 2} size={26} seed={7451} strokeWidth={3} />
        </motion.g>
      )}
      {(step === 3 || step === 4) && (
        <text x={g.slip.x + SLIP.w / 2} y={g.slip.y + SLIP.h + 26} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 21, fontWeight: 700, fill: 'var(--red)' }}>
          obavijest izgubljena
        </text>
      )}
      <StepBadge n={step + 1} x={cx} y={cy - r - 26} color={color} />
    </svg>
  )
}

export function Thermostat() {
  const [ref, width] = useWidth<HTMLDivElement>()
  // WIDE from 690 px: the 20-unit Kalam note and the step badge stay ≥ 18 px on screen
  const g = width !== null && width < 690 ? NARROW : WIDE
  return (
    <div ref={ref}>
      <Stepper title="Termostat: promotri, usporedi, ispravi" steps={STEPS} caption="Petlja ne čeka obavijesti: u svakom krugu iznova mjeri i ispravlja razliku. Zato joj izgubljena poruka ne smeta.">
        {(step) => (
          <div style={g === NARROW ? { maxWidth: 460, margin: '0 auto' } : undefined}>
            <Frame step={step} g={g} />
          </div>
        )}
      </Stepper>
    </div>
  )
}
