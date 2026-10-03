import { motion, useReducedMotion } from 'motion/react'
import { Stepper, Diagram, DLabel, Rough, Check, Cross, SpeechBubble, Lana, Davor, Iva, Drawer, useWidth } from '../../../kit'
import { CommitDot } from './Draw'

/** Scene 1 „Pakao integracije”: three long-lived branches merged after three weeks vs small merges every day. */

const STEPS = [
  { title: 'Tri grane, tri tjedna', body: 'Lana, Iva i Davor rade svatko na svojoj grani. Glavna grana main gotovo stoji, a razlike između grana rastu svaki dan.' },
  { title: 'Dan spajanja', body: 'Nakon tri tjedna sve se spaja odjednom: konflikti u istoj datoteci i testovi koji padaju, a nitko ne zna čija ih je promjena srušila.' },
  { title: 'Mali koraci', body: 'Isti posao, drukčija navika: svatko barem jednom dnevno spoji malu promjenu u main. Razlike su male, pa su i konflikti mali.' },
  { title: 'Svaki commit se provjeri', body: 'Svako spajanje automatski pokrene izgradnju i testove. Kad nešto pukne, zna se točno koji ga je commit srušio – i popravi se za nekoliko minuta. To je kontinuirana integracija.' },
]

type L = {
  W: number
  H: number
  y: number
  x0: number
  xEnd: number
  lanes: { y: number; label: string; color: string; ly: number }[]
  axisY: number
  merge: number[]
  who: { x: number; y: number; s: number }
  bubble: { x: number; y: number; w: number; h: number }
  head: [number, number]
  txt: number
  mono: number
}

const AUTHORS = [
  { label: 'Lana · nova-košarica', color: 'var(--hl-blue-ink)' },
  { label: 'Iva · popusti', color: 'var(--hl-pink-ink)' },
  { label: 'Davor · hotfix-pdv', color: 'var(--hl-orange-ink)' },
]

const WIDE: L = {
  W: 900,
  H: 330,
  y: 180,
  x0: 50,
  xEnd: 750,
  lanes: [
    { y: 70, ...AUTHORS[0], ly: 52 },
    { y: 122, ...AUTHORS[1], ly: 106 },
    { y: 250, ...AUTHORS[2], ly: 238 },
  ],
  axisY: 300,
  merge: [640, 668, 696],
  who: { x: 788, y: 166, s: 0.8 },
  bubble: { x: 724, y: 40, w: 130, h: 64 },
  head: [820, 184],
  txt: 16,
  mono: 14,
}

const NARROW: L = {
  W: 360,
  H: 500,
  y: 230,
  x0: 18,
  xEnd: 342,
  lanes: [
    { y: 100, ...AUTHORS[0], ly: 82 },
    { y: 162, ...AUTHORS[1], ly: 146 },
    { y: 300, ...AUTHORS[2], ly: 330 },
  ],
  axisY: 370,
  merge: [262, 286, 310],
  who: { x: 20, y: 386, s: 0.85 },
  bubble: { x: 120, y: 398, w: 200, h: 70 },
  head: [54, 410],
  txt: 14,
  mono: 14,
}

const SAYS: { who: 'lana' | 'davor' | 'iva'; lines: string[] }[] = [
  { who: 'lana', lines: ['Još malo', 'pa gotovo…'] },
  { who: 'davor', lines: ['Tri dana', 'spajanja?!'] },
  { who: 'iva', lines: ['Spojila sam', 'prije ručka!'] },
  { who: 'lana', lines: ['Crveno?', 'Popravljam', 'odmah.'] },
]

function Speaker({ who, x, y, s }: { who: 'lana' | 'davor' | 'iva'; x: number; y: number; s: number }) {
  if (who === 'davor') return <Davor x={x} y={y} scale={s} mood="worry" />
  if (who === 'iva') return <Iva x={x} y={y} scale={s} mood="grin" holding="phone" />
  return <Lana x={x} y={y} scale={s} mood="smile" />
}

/** Long-lived branches (steps 0–1). */
function LongBranches({ l, merged }: { l: L; merged: boolean }) {
  const start = [l.x0 + 40, l.x0 + 64, l.x0 + 52]
  const stop = l.merge[0] - (l.W > 500 ? 50 : 34)
  return (
    <g>
      {l.lanes.map((ln, i) => {
        const bx = start[i]
        const step = (stop - bx - 40) / (i === 0 ? 9 : i === 1 ? 6 : 5)
        const dots = Array.from({ length: i === 0 ? 10 : i === 1 ? 7 : 6 }, (_, k) => bx + 34 + k * step)
        const out: [number, number][] = [
          [bx, l.y],
          [bx + 18, ln.y + (ln.y < l.y ? 14 : -14)],
          [bx + 34, ln.y],
        ]
        return (
          <g key={i}>
            <Rough shape={{ k: 'curve', pts: out }} seed={7100 + i} stroke={ln.color} strokeWidth={2} />
            <Rough shape={{ k: 'line', x1: bx + 34, y1: ln.y, x2: stop, y2: ln.y }} seed={7110 + i} stroke={ln.color} strokeWidth={2} />
            {merged && (
              <Rough
                shape={{ k: 'curve', pts: [[stop, ln.y], [(stop + l.merge[i]) / 2 + 6, ln.y + (l.y - ln.y) * 0.25], [l.merge[i], l.y]] }}
                seed={7120 + i}
                stroke={ln.color}
                strokeWidth={2}
              />
            )}
            {dots.map((dx, k) => (
              <CommitDot key={k} x={dx} y={ln.y} r={l.W > 500 ? 6 : 5} stroke={ln.color} seed={7200 + i * 20 + k} />
            ))}
            <DLabel x={bx + 30} y={ln.ly} text={ln.label} anchor="start" size={l.txt} tone="neutral" />
          </g>
        )
      })}
    </g>
  )
}

/** Small daily merges (steps 2–3): short arcs off main, each merged the same day; in step 3 each gets a CI check. */
function SmallMerges({ l, ci }: { l: L; ci: boolean }) {
  const n = l.W > 500 ? 12 : 6
  const span = (l.xEnd - l.x0 - 60) / n
  const wide = l.W > 500
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const a = AUTHORS[i % 3]
        const x = l.x0 + 30 + i * span
        const up = i % 2 === 0
        const top = l.y + (up ? -1 : 1) * (wide ? 42 : 38)
        const x2 = x + span * 0.72
        const fail = ci && i === (wide ? 5 : 3)
        return (
          <g key={i}>
            <Rough shape={{ k: 'curve', pts: [[x, l.y], [x + span * 0.18, top], [x + span * 0.54, top], [x2, l.y]] }} seed={7300 + i} stroke={a.color} strokeWidth={2} />
            <CommitDot x={x + span * 0.36} y={top + (up ? 3 : -3)} r={wide ? 5.5 : 5} stroke={a.color} seed={7330 + i} />
            <CommitDot x={x2} y={l.y} r={wide ? 6 : 5} seed={7360 + i} />
            {ci && (
              <g>
                <Drawer x={x2 - 11} y={l.y + (up ? 14 : -38)} w={22} h={22} seed={7400 + i} />
                {fail ? <Cross x={x2 + 18} y={l.y + (up ? 24 : -28)} size={6} seed={7430 + i} /> : <Check x={x2 + 18} y={l.y + (up ? 24 : -28)} size={6} seed={7460 + i} />}
              </g>
            )}
          </g>
        )
      })}
    </g>
  )
}

function Scene({ step, l }: { step: number; l: L }) {
  const reduce = useReducedMotion()
  const s = SAYS[step]
  const weeks = [0.2, 0.5, 0.8].map((f) => l.x0 + (l.xEnd - l.x0) * f)
  const mainEnd = l.xEnd
  return (
    <Diagram width={l.W} height={l.H} label={`Grane u Gitu, korak ${step + 1}: ${STEPS[step].title}. ${STEPS[step].body}`}>
      {/* main */}
      <Rough shape={{ k: 'line', x1: l.x0, y1: l.y, x2: mainEnd, y2: l.y }} seed={7001} strokeWidth={2} />
      <DLabel x={l.x0} y={l.y - 14} text="main" anchor="start" size={l.txt} bold tone="neutral" />
      {step < 2 ? (
        <>
          {[l.x0 + 30, l.x0 + (l.xEnd - l.x0) * 0.45, l.x0 + (l.xEnd - l.x0) * 0.7].map((x, i) => (
            <CommitDot key={i} x={x} y={l.y} r={l.W > 500 ? 6.5 : 5.5} seed={7050 + i} />
          ))}
          <LongBranches l={l} merged={step === 1} />
        </>
      ) : (
        <SmallMerges l={l} ci={step === 3} />
      )}
      {/* merge day: conflicts */}
      {step === 1 && (
        <motion.g initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.3 }}>
          {l.merge.map((mx, i) => (
            <Cross key={i} x={mx} y={l.y} size={l.W > 500 ? 9 : 8} seed={7500 + i} />
          ))}
          <DLabel x={l.merge[0] - 70} y={l.y - 26} text="konflikt: cart/vat.py" anchor="end" size={l.txt - 1} tone="bad" />
          <DLabel x={l.merge[0] - 70} y={l.y + 30} text="14 testova pada" anchor="end" size={l.txt - 1} tone="bad" />
        </motion.g>
      )}
      {step === 3 && <DLabel x={l.W > 500 ? l.x0 + 300 : l.x0 + 160} y={l.y + (l.W > 500 ? 86 : 80)} text="✗ → popravak za 10 min" anchor="middle" size={l.txt - 1} tone="bad" />}
      {step >= 2 && <DLabel x={l.W > 500 ? l.x0 + 330 : l.x0 + 150} y={l.W > 500 ? 64 : 120} text={step === 2 ? 'svatko u main barem jednom dnevno' : 'svaki commit: izgradnja + testovi'} anchor="middle" size={l.txt} tone={step === 3 ? 'blue' : 'neutral'} />}
      {/* time axis */}
      <Rough shape={{ k: 'line', x1: l.x0, y1: l.axisY - 18, x2: mainEnd, y2: l.axisY - 18 }} seed={7600} stroke="var(--ink-3)" strokeWidth={1.2} dash="4 5" />
      {step >= 2 && <DLabel x={l.xEnd} y={l.W > 500 ? l.axisY - 26 : l.axisY - 30} text="prikazan je samo dio spajanja" anchor="end" size={l.txt - 1} tone="neutral" />}
      {weeks.map((x, i) => (
        <DLabel key={i} x={x} y={l.axisY} text={`${i + 1}. tjedan`} anchor="middle" size={l.txt - 1} tone="neutral" />
      ))}
      {/* the speaker */}
      <Speaker who={s.who} x={l.who.x} y={l.who.y} s={l.who.s} />
      <SpeechBubble x={l.bubble.x} y={l.bubble.y} w={l.bubble.w} h={l.bubble.h} tx={l.head[0]} ty={l.head[1]} lines={s.lines} size={l.W > 500 ? 22 : 21} tone={step === 1 ? 'red' : 'ink'} seed={7700 + step} />
    </Diagram>
  )
}

/** Picks the layout by the stage's own width (wide ≥ 750 px keeps every letter ≥ 12 px). */
function SceneBox({ step }: { step: number }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const l = w !== null && w >= 750 ? WIDE : NARROW
  return (
    <div ref={ref}>
      <div style={l === NARROW ? { maxWidth: 460, margin: '0 auto' } : undefined}>
        <Scene step={step} l={l} />
      </div>
    </div>
  )
}

export function IntegrationStepper() {
  return (
    <Stepper steps={STEPS} title="Pakao integracije" wide autoPlay={0} caption="Ista tri tjedna rada, dvije navike. Kontinuirana integracija nije alat nego dogovor: male promjene, često u main, svaka automatski provjerena.">
      {(step) => <SceneBox step={step} />}
    </Stepper>
  )
}
