import { motion, useReducedMotion } from 'motion/react'
import { Arrow, Cross, DiagramDefs, Rough, ServerFace, Stepper, SvgStamp, diagramIds, fmt, stepColor, trayFillOf, useSvgId, useWidth } from '../../../kit'
import { capacityOf } from '../../../engines/traffic'
import { fmtEur, priceOf } from '../model'

/** Klopa's resize chain: today's 2 / 2, then the catalogue sizes nextBiggerSize() offers, then nothing. */
const SIZES = [
  { vcpu: 2, ramGB: 2 },
  { vcpu: 2, ramGB: 4 },
  { vcpu: 4, ramGB: 8 },
  { vcpu: 8, ramGB: 16 },
]

const STEPS = [
  {
    title: 'Danas: 2 vCPU · 2 GB',
    body: 'Klopin poslužitelj stoji 15 € mjesečno (cijene su ilustrativne). Za posao koji čeka bazu daje najviše ≈ 5,7 odgovora u sekundi, a u 12:00 treba 12.',
  },
  {
    title: 'Veći: 2 vCPU · 4 GB',
    body: 'Sljedeća veličina: 14 radnika, do ≈ 13 odgovora u sekundi, za 18 €. Ali promjena veličine znači ugasiti stroj i ponovno ga pokrenuti – nekoliko minuta Klope nema.',
  },
  {
    title: 'Još veći: 4 vCPU · 8 GB',
    body: 'Ovdje se Davor zaustavi: 30 radnika, do ≈ 29 odgovora u sekundi, za 36 €. Dvostruko veći stroj stoji otprilike dvostruko više – cijena raste linearno. I opet prekid.',
  },
  {
    title: 'Najveći u ponudi: 8 vCPU · 16 GB – i kraj',
    body: 'Moguće je još jednom: 62 radnika, do ≈ 59 odgovora u sekundi, za 72 € – uz još jedan prekid. Veće veličine u ovoj ponudi nema: to je strop.',
  },
  {
    title: 'Izvucite utikač',
    body: 'Kvar napajanja kod pružatelja, a Klopa radi na 4 vCPU i 8 GB: nijedan zahtjev ne prolazi. Veći poslužitelj pada jednako kao i manji. Jedno računalo je jedinstvena točka kvara, koliko god bilo veliko.',
  },
]

interface Slot {
  x: number
  y: number
  w: number
  h: number
}

/** Klopa stops at 4 vCPU · 8 GB (index 2); 8 / 16 is only shown as the last option in the offer. */
const DAVOR_STOPS = 2

/** Card boxes: wide = a row growing to the right (taller = bigger), narrow = a column. */
function slots(narrow: boolean): Slot[] {
  if (narrow)
    return Array.from({ length: 5 }, (_, i) => ({ x: 18, y: 16 + i * 86, w: 150, h: 66 }))
  const hs = [86, 100, 118, 140, 140]
  return hs.map((h, i) => ({ x: 22 + i * 146, y: 216 - h, w: 124, h }))
}

function Card({ i, slot, step, narrow }: { i: number; slot: Slot; step: number; narrow: boolean }) {
  const size = SIZES[i]
  const cur = Math.min(step, DAVOR_STOPS)
  const reached = i <= cur
  const current = i === cur
  const down = step === 4 && current
  const cap = capacityOf(size.vcpu, size.ramGB, 'io')
  const ink = reached ? 'var(--ink)' : 'var(--ink-3)'
  const tx = narrow ? slot.x + slot.w + 14 : slot.x + slot.w / 2
  const ty = narrow ? slot.y + 22 : slot.y + slot.h + 24
  const anchor = narrow ? 'start' : 'middle'
  return (
    <g>
      <Rough shape={{ k: 'rect', x: slot.x, y: slot.y, w: slot.w, h: slot.h }} seed={2900 + i * 5} strokeWidth={current ? 2 : 1.5} stroke={down ? 'var(--red)' : ink} fillColor="var(--paper)" fillStyle="solid" dash={reached ? undefined : '4 5'} />
      <text x={slot.x + 10} y={slot.y + 24} className="k-svg-mono" style={{ fontSize: 16, fontWeight: 700, fill: ink }}>
        {size.vcpu} vCPU
      </text>
      <text x={slot.x + 10} y={slot.y + 44} className="k-svg-mono" style={{ fontSize: 16, fill: ink }}>
        {size.ramGB} GB
      </text>
      {reached && (
        <g transform={`translate(${slot.x + slot.w - 24} ${slot.y + 24})`}>
          <ServerFace mood={down ? 'dead' : current && i === 0 ? 'panic' : 'calm'} r={14} />
        </g>
      )}
      <text x={tx} y={ty} textAnchor={anchor} className="k-svg-hand" style={{ fontSize: 22, fill: reached ? 'var(--ink)' : 'var(--ink-2)' }}>
        {fmtEur(priceOf(size.vcpu, size.ramGB))}/mj.
      </text>
      <text x={tx} y={ty + 22} textAnchor={anchor} className="k-svg-mono" style={{ fontSize: 16, fill: 'var(--ink-2)' }}>
        do ≈{fmt.num(cap.cap, cap.cap < 10 ? 1 : 0)}/s
      </text>
      {current && step < 3 && (
        <Rough
          shape={{ k: 'ellipse', cx: slot.x + slot.w / 2, cy: slot.y + slot.h / 2, w: slot.w + 30, h: slot.h + 26 }}
          seed={2950 + i}
          stroke="var(--red)"
          strokeWidth={2.2}
          multi
          draw="mount"
          duration={0.6}
        />
      )}
      {/* narrow cards are short: the stamp sits low and right, so „16 GB” stays readable */}
      {down && <SvgStamp x={narrow ? slot.x + 80 : slot.x + slot.w / 2} y={narrow ? slot.y + slot.h - 8 : slot.y + slot.h - 16} text="ISKLJUČEN" size={narrow ? 14 : 16} />}
    </g>
  )
}

/** A week of Klopa as a pencil line: grey gaps for every resize, a red stretch for the power failure. */
function Timeline({ step, narrow, hatch, hatchRed }: { step: number; narrow: boolean; hatch: string; hatchRed: string }) {
  const x0 = narrow ? 18 : 22
  const x1 = narrow ? 362 : 738
  const y = narrow ? 470 : 306
  const len = x1 - x0
  const gaps = [0.25, 0.55].slice(0, Math.min(step, DAVOR_STOPS))
  return (
    <g>
      <text x={x0} y={y - 18} className="k-svg-hand" style={{ fontSize: 22, fill: 'var(--ink-2)' }}>
        Klopa radi:
      </text>
      <Rough shape={{ k: 'line', x1: x0, y1: y, x2: x1, y2: y }} seed={2970} stroke="var(--green)" strokeWidth={3} roughness={0.7} />
      {gaps.map((g, i) => (
        <g key={i}>
          <rect x={x0 + g * len - 7} y={y - 10} width={14} height={20} style={{ fill: 'var(--paper)' }} />
          <rect x={x0 + g * len - 7} y={y - 10} width={14} height={20} style={{ fill: `url(${hatch})`, stroke: 'var(--ink-3)', strokeWidth: 1 }} />
        </g>
      ))}
      {gaps.length > 0 && (
        <text x={x0 + gaps[0] * len - 7} y={y + 34} textAnchor="start" className="k-svg-hand" style={{ fontSize: 22, fill: 'var(--ink-2)' }}>
          {narrow ? 'prekid' : 'promjena veličine = prekid'}
        </text>
      )}
      {step === 4 && (
        <g>
          <rect x={x0 + 0.86 * len} y={y - 10} width={0.14 * len} height={20} style={{ fill: 'var(--paper)' }} />
          <rect x={x0 + 0.86 * len} y={y - 10} width={0.14 * len} height={20} style={{ fill: `url(${hatchRed})`, stroke: 'var(--red)', strokeWidth: 1.4 }} />
          <text x={x1} y={y + 34} textAnchor="end" className="k-svg-hand" style={{ fontSize: 22, fill: 'var(--red)' }}>
            kvar napajanja
          </text>
        </g>
      )}
    </g>
  )
}

function Frame({ step, narrow }: { step: number; narrow: boolean }) {
  const reduce = !!useReducedMotion()
  const id = useSvgId('l02bs')
  const ids = diagramIds(id)
  const ss = slots(narrow)
  const W = narrow ? 380 : 760
  const H = narrow ? 540 : 360
  const color = stepColor(Math.min(step, 2))
  // the resize arrow: 2/2 → 2/4 → 4/8 (Davor's steps), then 4/8 → 8/16 only as a dashed possibility
  const to = step === 3 ? 3 : Math.min(step, DAVOR_STOPS)
  const from = to - 1
  const maybe = step === 3
  const last = ss[4]
  const down = ss[DAVOR_STOPS]
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Korak ${step + 1}: ${STEPS[step].title}. ${STEPS[step].body}`}
      style={{ display: 'block', width: '100%', maxWidth: narrow ? 460 : undefined, height: 'auto', margin: '0 auto', overflow: 'visible' }}
    >
      <DiagramDefs id={id} />
      {SIZES.map((_, i) => (
        <Card key={i} i={i} slot={ss[i]} step={step} narrow={narrow} />
      ))}
      {/* the empty fifth slot: there is no bigger size */}
      <Rough shape={{ k: 'rect', x: last.x, y: last.y, w: last.w, h: last.h }} seed={2920} strokeWidth={1.3} stroke="var(--ink-3)" dash="3 6" />
      {step >= 3 ? (
        <SvgStamp x={last.x + last.w / 2} y={last.y + last.h / 2} text="NEMA VEĆEG" size={narrow ? 15 : 15} rotate={-9} />
      ) : (
        <text x={last.x + last.w / 2} y={last.y + last.h / 2 + 8} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 26, fill: 'var(--ink-3)' }}>
          ?
        </text>
      )}
      {/* the step from one size to the next: stop, resize, start */}
      {step >= 1 && step <= 3 && (
        <g key={`a${step}`}>
          {narrow ? (
            <Arrow pts={[[ss[from].x + 30, ss[from].y + ss[from].h + 2], [ss[to].x + 30, ss[to].y - 4]]} stroke={color} strokeWidth={1.8} seed={2980 + step} dash={maybe ? '5 5' : undefined} />
          ) : (
            <Arrow
              pts={[
                [ss[from].x + ss[from].w / 2, ss[from].y - 8],
                [(ss[from].x + ss[to].x + ss[to].w) / 2, Math.min(ss[from].y, ss[to].y) - 34],
                [ss[to].x + ss[to].w / 2 - 10, ss[to].y - 12],
              ]}
              stroke={color}
              strokeWidth={1.8}
              seed={2980 + step}
              dash={maybe ? '5 5' : undefined}
            />
          )}
          <text
            x={narrow ? ss[to].x + ss[to].w + 14 : (ss[from].x + ss[to].x + ss[to].w) / 2}
            y={narrow ? ss[to].y - 6 : Math.min(ss[from].y, ss[to].y) - 42}
            textAnchor={narrow ? 'start' : 'middle'}
            className="k-svg-hand"
            style={{ fontSize: 22, fill: color }}
          >
            {maybe ? (narrow ? 'moguće još jednom' : 'moguće još jednom (uz prekid)') : narrow ? 'ugasi · upali' : 'ugasi · promijeni · upali'}
          </text>
        </g>
      )}
      {/* power failure: every request fails at the door */}
      {step === 4 &&
        [0, 1, 2].map((k) => {
          const x = narrow ? 290 + k * 30 : down.x + down.w / 2 - 34 + k * 34
          const y = narrow ? down.y + 30 : down.y - 22
          return (
            <motion.g key={k} initial={reduce ? false : { opacity: 0, y: y - 14 }} animate={{ opacity: 1, y }} transition={{ delay: reduce ? 0 : 0.3 + k * 0.25, duration: 0.3 }}>
              <g transform={`translate(${x} 0) rotate(${18 + k * 8})`}>
                <use href={ids.tray} x={-15} y={-10} width={30} height={20} fill={trayFillOf('bad')} />
                <g transform="translate(13 -9)">
                  <Cross x={0} y={0} size={5.5} seed={2990} />
                </g>
              </g>
            </motion.g>
          )
        })}
      <Timeline step={step} narrow={narrow} hatch={ids.hatch} hatchRed={ids.hatchRed} />
    </svg>
  )
}

/** Scene „Veći poslužitelj”: the resize chain with a downtime gap for each step, the ceiling, and the plug. */
export function BiggerServer() {
  const [ref, width] = useWidth<HTMLDivElement>()
  // wide from 585 px (also on the chalkboard at 768 px): mono 16 and Caveat 22 units stay ≥ 12 / 17 px
  // (760 × 12 / 16 = 570, 760 × 17 / 22 ≈ 587)
  const narrow = width !== null && width < 585
  return (
    <div ref={ref} className="k-wide">
      <Stepper title="Sve veći poslužitelj" steps={STEPS} autoPlay={0} caption="Cijene su ilustrativne i rastu linearno s brojem jezgri i RAM-om, kao unutar jedne obitelji poslužitelja u oblaku. Kapacitet je za Klopin posao koji čeka bazu.">
        {(step) => <Frame step={step} narrow={narrow} />}
      </Stepper>
    </div>
  )
}
