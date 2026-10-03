import { useEffect, useId, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Rough, Boil, Check } from './Sketch'
import { Person, Redar, ServerFace, TrayDefs } from './Doodles'
import { SecHead, PropFlip } from './Bits'
import { useWidth } from './useSize'
import type { Pt } from './roughGen'
import s from './bj.module.css'
import p from './parts.module.css'

const STEPS = [
  {
    title: 'Zahtjev stiže na load balancer',
    text: 'Studentica otvori Klopu i pošalje narudžbu. Ona ne zna koliko poslužitelja postoji: vidi samo jednu adresu, a iza nje stoji redar.',
  },
  {
    title: 'Load balancer bira poslužitelj',
    text: 'Redar gleda koliko svaki poslužitelj ima otvorenih veza. Po pravilu „najmanje aktivnih veza” bira Srednji, jer trenutno radi samo jednu narudžbu.',
  },
  {
    title: 'Odgovor se vraća',
    text: 'Srednji obradi narudžbu i odgovor putuje natrag preko load balancera do studentice. Za nju je cijeli put bio jedan zahtjev na jednu adresu.',
  },
]

const SERVERS = [
  { name: 'Mali', spec: '1 vCPU · 2 GB', conns: 3, mood: 'busy' as const },
  { name: 'Srednji', spec: '2 vCPU · 4 GB', conns: 1, mood: 'calm' as const },
  { name: 'Veliki', spec: '4 vCPU · 8 GB', conns: 2, mood: 'calm' as const },
]

interface StepGeo {
  vb: [number, number]
  student: { x: number; y: number; s: number; label: Pt }
  phone: Pt
  lb: { x: number; y: number; s: number; label: Pt }
  /** where trays meet the redar, and where they leave him */
  lbIn: Pt
  lbOut: Pt
  cards: { x: number; y: number }[]
  card: { w: number; h: number; align: 'left' | 'center' }
  /** door of each card (where a request enters) */
  door: (i: number) => Pt
  ok: Pt
}

const WIDE: StepGeo = {
  vb: [760, 352],
  student: { x: 8, y: 96, s: 1.12, label: [52, 268] },
  phone: [78, 188],
  lb: { x: 330, y: 226, s: 1.05, label: [330, 340] },
  lbIn: [300, 232],
  lbOut: [376, 214],
  cards: [
    { x: 532, y: 8 },
    { x: 532, y: 122 },
    { x: 532, y: 236 },
  ],
  card: { w: 216, h: 100, align: 'left' },
  door: (i) => [524, [58, 172, 286][i]],
  ok: [122, 88],
}

const TALL: StepGeo = {
  vb: [360, 540],
  student: { x: 14, y: 8, s: 0.92, label: [52, 162] },
  phone: [72, 86],
  lb: { x: 196, y: 262, s: 0.95, label: [196, 362] },
  lbIn: [184, 238],
  lbOut: [206, 300],
  cards: [
    { x: 2, y: 408 },
    { x: 124, y: 408 },
    { x: 246, y: 408 },
  ],
  card: { w: 112, h: 128, align: 'center' },
  door: (i) => [[58, 180, 302][i], 398],
  ok: [126, 40],
}

/** Server card in the same grammar as the simulation (face porthole, name, spec), with a tally of open connections. */
function StepCard({ g, i, step }: { g: StepGeo; i: number; step: number }) {
  const sv = SERVERS[i]
  const { x, y } = g.cards[i]
  const { w, h, align } = g.card
  const center = align === 'center'
  const showConns = step >= 1
  const conns = sv.conns + (i === 1 && step === 2 ? 1 : 0)
  const tx = center ? w / 2 - (conns * 9) / 2 : 14
  const ty = center ? 84 : 64
  return (
    <g transform={`translate(${x} ${y})`}>
      <Rough shape={{ k: 'rect', x: 0, y: 0, w, h }} seed={720 + i} strokeWidth={2} fillColor="var(--paper)" fillStyle="solid" />
      <text x={center ? w / 2 : 14} y={center ? 22 : 30} textAnchor={center ? 'middle' : 'start'} className={s.svgDisplay} style={{ fontSize: center ? 17 : 21 }}>
        {sv.name}
      </text>
      <text x={center ? w / 2 : 14} y={center ? 38 : 49} textAnchor={center ? 'middle' : 'start'} className={s.svgMono} style={{ fontSize: center ? 13 : 15, fill: 'var(--ink-2)' }}>
        {sv.spec}
      </text>
      <g transform={`translate(${center ? w / 2 : w - 40} ${center ? 64 : 36})`}>
        <ServerFace mood={step === 2 && i === 1 ? 'busy' : sv.mood} r={center ? 16 : 22} />
      </g>
      {showConns && (
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 + i * 0.12 }}>
          {Array.from({ length: conns }, (_, k) => (
            <Rough key={k} shape={{ k: 'line', x1: tx + k * 9, y1: ty, x2: tx + k * 9 + 1, y2: ty + 18 }} seed={741 + i * 5 + k} strokeWidth={2} stroke={i === 1 ? 'var(--red)' : 'var(--ink-2)'} />
          ))}
          <text
            x={center ? w / 2 : tx + conns * 9 + 8}
            y={center ? ty + 36 : ty + 16}
            textAnchor={center ? 'middle' : 'start'}
            className={s.svgHand}
            style={{ fontSize: center ? 18 : 20, fill: i === 1 ? 'var(--red)' : 'var(--ink-2)' }}
          >
            {conns} {conns === 1 ? 'veza' : 'veze'}
          </text>
        </motion.g>
      )}
    </g>
  )
}

/** A dotted pencil route that draws itself in (a dashed path revealed by an animated mask). */
function DrawnRoute({ pts, stroke, delay, seed, instant }: { pts: Pt[]; stroke: string; delay: number; seed: number; instant: boolean }) {
  const id = useId().replace(/:/g, '')
  const d = pts.map((q, i) => `${i ? 'L' : 'M'}${q[0]} ${q[1]}`).join(' ')
  return (
    <g>
      <mask id={`rt${id}`} maskUnits="userSpaceOnUse">
        <motion.path
          d={d}
          fill="none"
          stroke="#fff"
          strokeWidth={14}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: instant ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: instant ? 0 : 0.7, delay, ease: 'linear' }}
        />
      </mask>
      <g mask={`url(#rt${id})`}>
        <Rough shape={{ k: 'lin', pts }} seed={seed} stroke={stroke} strokeWidth={2.2} dash="3 7" roughness={0.7} />
      </g>
    </g>
  )
}

function Frame({ step, g }: { step: number; g: StepGeo }) {
  const reduce = !!useReducedMotion()
  const target = g.door(1)
  const shoulder: Pt = [g.lb.x + 13 * g.lb.s, g.lb.y - 28 * g.lb.s]
  const angles = [-1.25, Math.atan2(target[1] - shoulder[1], target[0] - shoulder[0]), Math.atan2(g.phone[1] - shoulder[1], g.phone[0] - shoulder[0])]
  const routes: { pts: Pt[]; stroke: string }[] = [
    { pts: [g.phone, g.lbIn], stroke: 'var(--pen)' },
    { pts: [g.lbOut, target], stroke: 'var(--pen)' },
    { pts: [target, g.lbOut, g.lbIn, g.phone], stroke: 'var(--green)' },
  ]
  const cur = routes[step]
  const travel = cur.pts
  const drawDelay = 0.1
  const trayDelay = drawDelay + 0.45
  return (
    <svg viewBox={`0 0 ${g.vb[0]} ${g.vb[1]}`} className={p.stepSvg} role="img" aria-label={`Korak ${step + 1}: ${STEPS[step].title}`}>
      <TrayDefs id="bjstep" />
      {/* earlier legs stay as faint pencil */}
      {routes.slice(0, step).map((r, i) =>
        i === 2 ? null : <Rough key={i} shape={{ k: 'lin', pts: r.pts }} seed={760 + i} stroke="var(--ink-3)" strokeWidth={1.3} dash="2 7" roughness={0.6} />,
      )}
      <DrawnRoute key={`r${step}`} pts={cur.pts} stroke={cur.stroke} delay={drawDelay} seed={770 + step} instant={reduce} />
      <Boil slow>
        <Person x={g.student.x} y={g.student.y} scale={g.student.s} hair="pony" holding="phone" shirt="var(--hl-pink-ink)" mood={step === 2 ? 'grin' : 'smile'} seed={701} />
      </Boil>
      <text x={g.student.label[0]} y={g.student.label[1]} textAnchor="middle" className={s.svgHand} style={{ fontSize: 21, fill: 'var(--ink-2)' }}>
        studentica
      </text>
      <Redar x={g.lb.x} y={g.lb.y} scale={g.lb.s} angle={angles[step]} slowArm />
      <text x={g.lb.label[0]} y={g.lb.label[1]} textAnchor="middle" className={s.svgHand} style={{ fontSize: 20, fill: 'var(--ink-2)' }}>
        load balancer
      </text>
      {SERVERS.map((_, i) => (
        <StepCard key={i} g={g} i={i} step={step} />
      ))}
      {step >= 1 && (
        <Rough
          shape={{ k: 'ellipse', cx: g.cards[1].x + g.card.w / 2, cy: g.cards[1].y + g.card.h / 2, w: g.card.w + 34, h: g.card.h + 30 }}
          seed={730}
          stroke="var(--red)"
          strokeWidth={2.4}
          multi
          draw="mount"
          duration={0.6}
          delay={reduce ? 0 : 0.9}
        />
      )}
      {step === 2 && (
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduce ? 0 : 1.9 }}>
          <Check x={g.ok[0]} y={g.ok[1]} size={13} seed={740} draw="mount" delay={reduce ? 0 : 1.9} />
          <text x={g.ok[0] + 18} y={g.ok[1] - 4} className={s.svgHand} style={{ fontSize: 23, fill: 'var(--green)' }}>
            200 OK
          </text>
        </motion.g>
      )}
      {/* the request (or, in step 3, the response with food on it) travels after its route is drawn */}
      <motion.g
        key={`t${step}`}
        initial={{ x: travel[0][0], y: travel[0][1], opacity: reduce ? 1 : 0 }}
        animate={reduce ? { x: travel[travel.length - 1][0], y: travel[travel.length - 1][1], opacity: 1 } : { x: travel.map((q) => q[0]), y: travel.map((q) => q[1]), opacity: 1 }}
        transition={{ duration: reduce ? 0 : travel.length > 2 ? 1.5 : 0.9, ease: 'linear', delay: trayDelay, opacity: { duration: 0.1, delay: trayDelay } }}
      >
        <use href="#bjstep-tray" x={-19} y={-13} width={38} height={26} />
        {step === 2 && <circle cx={-4} cy={-7} r={4.5} className={p.food} />}
      </motion.g>
    </svg>
  )
}

export function StepperSection() {
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [ref, width] = useWidth<HTMLDivElement>()
  const narrow = width !== null && width < 600

  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => setStep((x) => (x + 1) % STEPS.length), 3600)
    return () => window.clearInterval(id)
  }, [playing])

  return (
    <section className={`${s.section} ${s.secStep}`} aria-labelledby="koraci-title">
      <SecHead n="4" kicker="korak po korak" title="Put jednog zahtjeva" id="koraci-title" prop={<PropFlip />} />
      <div className={p.stepper}>
        <div className={p.stepStage} ref={ref}>
          <div className={narrow ? p.stageTall : undefined}>
            <Frame step={step} g={narrow ? TALL : WIDE} />
          </div>
        </div>
        <div className={p.card}>
          <div className={p.cardTop}>
            <span className={p.stepCount} aria-live="polite">
              Korak {step + 1} / {STEPS.length}
            </span>
            <div className={p.dots} role="tablist" aria-label="Koraci">
              {STEPS.map((st, i) => (
                <button key={st.title} type="button" role="tab" aria-selected={i === step} aria-label={`Korak ${i + 1}: ${st.title}`} className={p.dot} onClick={() => setStep(i)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <Rough
                      shape={{ k: 'ellipse', cx: 12, cy: 12, w: 18, h: 18 }}
                      seed={760 + i}
                      strokeWidth={1.6}
                      stroke={i === step ? 'var(--red)' : 'var(--ink-2)'}
                      fillColor={i <= step ? 'var(--red)' : undefined}
                      fillStyle="hachure"
                      hachureGap={2.6}
                    />
                  </svg>
                </button>
              ))}
            </div>
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.22 }}>
              <h3 className={p.stepTitle}>{STEPS[step].title}</h3>
              <p className={p.stepText}>{STEPS[step].text}</p>
            </motion.div>
          </AnimatePresence>
          <div className={p.stepCtl}>
            <button type="button" className={`${p.pbtn} ${p.pbtnMain}`} onClick={() => setStep((x) => Math.min(STEPS.length - 1, x + 1))} disabled={step === STEPS.length - 1}>
              Dalje →
            </button>
            <button type="button" className={`${p.pbtn} ${p.pbtnBack}`} onClick={() => setStep((x) => Math.max(0, x - 1))} disabled={step === 0}>
              ← Natrag
            </button>
            <button type="button" className={`${p.pbtn} ${p.pbtnPlay}`} onClick={() => setPlaying((x) => !x)} aria-pressed={playing}>
              {playing ? '❚❚ Zaustavi' : '▶ Pusti'}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
