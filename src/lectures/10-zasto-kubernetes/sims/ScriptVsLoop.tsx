/**
 * Scene 2 „Skripta ili izjava”: the imperative script „pokreni 3” and the declaration „želim 3” side by side.
 * After a copy disappears the script is blind (it finished long ago); the loop sees 3 − 2 = 1 and starts one copy. Running both
 * once more: the script gives 2 + 3 = 5, the declaration changes nothing (idempotent).
 */
import { motion, useReducedMotion } from 'motion/react'
import { Cross, LoopArrows, Rough, StepBadge, Stepper, stepColor, useWidth } from '../../../kit'
import { AppBox } from './parts'

type Cell = 'run' | 'crash' | 'ghost' | 'new' | 'extra' | 'empty'

const STEPS = [
  {
    title: 'Ista želja, dva zapisa',
    body: 'Lijevo je Davorova skripta: „pokreni tri kopije”. Desno je izjava: „želim tri kopije”. Na početku izgledaju jednako – obje daju tri kontejnera.',
  },
  {
    title: 'Jedna kopija nestane',
    body: 'Jedna kopija nestane – njezin se poslužitelj ugasio. Skripta je davno završila i ne zna za to. Petlja usklađivanja u sljedećem prolazu prebroji kopije: želja 3, stvarno 2.',
  },
  {
    title: 'Petlja popravlja, skripta ne',
    body: 'Petlja pokreće jednu novu kopiju (prvo iscrtkana želja, zatim puni kontejner). Lijevo i dalje rade dvije od tri – dok netko ne primijeti i ručno pokrene treću.',
  },
  {
    title: 'Pokrenimo oboje još jednom',
    body: 'Skripta „pokreni 3” ne zna koliko kopija već radi: 2 + 3 = 5. Izjava „želim 3” je idempotentna: ponovimo li je, ne mijenja se ništa.',
  },
]

const LEFT: Cell[][] = [
  ['run', 'run', 'run', 'empty', 'empty'],
  ['run', 'crash', 'run', 'empty', 'empty'],
  ['run', 'empty', 'run', 'empty', 'empty'],
  ['run', 'extra', 'run', 'extra', 'extra'],
]
const RIGHT: Cell[][] = [
  ['run', 'run', 'run', 'empty', 'empty'],
  ['run', 'crash', 'run', 'empty', 'empty'],
  ['run', 'new', 'run', 'empty', 'empty'],
  ['run', 'run', 'run', 'empty', 'empty'],
]
const NOTES: [string, string][] = [
  ['pokrenula 3 kopije i završila', 'želja 3 = stvarno 3 ✓'],
  ['skripta je odavno gotova', 'razlika: 3 − 2 = 1'],
  ['i dalje 2 od 3 – nitko ne gleda', 'nova kopija – opet 3 ✓'],
  ['ponovno: 2 + 3 = 5 kopija!', 'ista izjava: 3 = 3, ništa'],
]

const CELL_W = 54
const CELL_H = 34
const GAP = 9

function Panel({ x, y, w, side, step }: { x: number; y: number; w: number; side: 'L' | 'R'; step: number }) {
  const reduce = !!useReducedMotion()
  const cells = (side === 'L' ? LEFT : RIGHT)[step]
  const running = cells.filter((c) => c === 'run' || c === 'new' || c === 'extra').length
  const note = NOTES[step][side === 'L' ? 0 : 1]
  const changed = (side === 'L' && step !== 0) || (side === 'R' && step > 0 && step < 3)
  const tone = side === 'L' ? (step >= 1 ? 'var(--red)' : 'var(--ink-2)') : step === 1 ? 'var(--orange)' : 'var(--green)'
  const seed = side === 'L' ? 7100 : 7200
  return (
    <g transform={`translate(${x} ${y})`}>
      <text x={0} y={20} className="k-svg-hand" style={{ fontSize: 23, fontWeight: 700, fill: side === 'L' ? 'var(--ink)' : 'var(--pen)' }}>
        {side === 'L' ? 'skripta – imperativno' : 'izjava – deklarativno'}
      </text>
      <Rough shape={{ k: 'rect', x: 0, y: 32, w, h: 56 }} seed={seed} strokeWidth={1.4} stroke="var(--ink-3)" fillColor="var(--paper-2)" fillStyle="solid" />
      {side === 'L' ? (
        <>
          <text x={10} y={55} className="k-svg-mono" style={{ fontSize: 15 }}>
            for i in 1 2 3; do
          </text>
          <text x={28} y={77} className="k-svg-mono" style={{ fontSize: 15 }}>
            docker run -d klopa-api; done
          </text>
        </>
      ) : (
        <>
          <text x={10} y={55} className="k-svg-mono" style={{ fontSize: 15 }}>
            želja:
          </text>
          <text x={28} y={77} className="k-svg-mono" style={{ fontSize: 15, fontWeight: 700 }}>
            klopa-api: 3 kopije
          </text>
          <LoopArrows cx={w - 30} cy={60} r={17} seed={seed + 1} check={step === 2} />
        </>
      )}
      {cells.map((c, i) => {
        const cx = i * (CELL_W + GAP)
        const cy = 104
        const key = `${side}${i}`
        if (c === 'empty')
          return <Rough key={key} shape={{ k: 'rect', x: cx + 2, y: cy + 2, w: CELL_W - 4, h: CELL_H - 4 }} seed={seed + 10 + i} stroke="var(--ink-4)" strokeWidth={1} dash="2 5" roughness={0.6} />
        if (c === 'crash')
          return (
            <g key={key}>
              <AppBox x={cx} y={cy} w={CELL_W} h={CELL_H} app="api" faded seedKey={key} />
              <Cross x={cx + CELL_W / 2} y={cy + CELL_H / 2} size={13} seed={seed + 20 + i} strokeWidth={3} />
            </g>
          )
        if (c === 'new')
          return (
            <g key={key}>
              <AppBox x={cx} y={cy} w={CELL_W} h={CELL_H} app="api" ghost seedKey={`${key}g`} />
              <motion.g initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduce ? 0 : 1.1, duration: 0.4 }}>
                <AppBox x={cx} y={cy} w={CELL_W} h={CELL_H} app="api" seedKey={`${key}n`} />
              </motion.g>
            </g>
          )
        if (c === 'extra')
          return (
            <g key={key}>
              <AppBox x={cx} y={cy} w={CELL_W} h={CELL_H} app="api" seedKey={`${key}x`} />
              <text x={cx + CELL_W - 4} y={cy - 4} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 22, fontWeight: 700, fill: 'var(--orange)' }}>
                !
              </text>
            </g>
          )
        return <AppBox key={key} x={cx} y={cy} w={CELL_W} h={CELL_H} app="api" seedKey={key} />
      })}
      <text x={0} y={166} className="k-svg-mono" style={{ fontSize: 15, fill: 'var(--ink-2)' }}>
        {side === 'L' ? `radi: ${running}` : `želja: 3 · radi: ${running}`}
      </text>
      <text x={changed ? 30 : 0} y={198} className="k-svg-hand" style={{ fontSize: 22, fontWeight: 700, fill: tone }}>
        {note}
      </text>
      {changed && <StepBadge n={step + 1} x={11} y={191} color={stepColor(step)} />}
    </g>
  )
}

export function ScriptVsLoop() {
  const [ref, width] = useWidth<HTMLDivElement>()
  const narrow = width !== null && width < 600
  return (
    <div ref={ref}>
      <Stepper title="Skripta ili izjava" steps={STEPS} caption="Lijevo: koraci koji se izvrše jednom. Desno: zapisana želja koju petlja usklađivanja provjerava zauvijek.">
        {(step) =>
          narrow ? (
            <div style={{ maxWidth: 460, margin: '0 auto' }}>
              <svg viewBox="0 0 380 450" role="img" aria-label={`Korak ${step + 1}: ${STEPS[step].title}. Skripta: ${NOTES[step][0]}. Izjava: ${NOTES[step][1]}.`} style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}>
                <Panel x={2} y={4} w={376} side="L" step={step} />
                <Rough shape={{ k: 'line', x1: 10, y1: 222, x2: 370, y2: 222 }} seed={7300} stroke="var(--ink-4)" strokeWidth={1.2} dash="5 6" />
                <Panel x={2} y={236} w={376} side="R" step={step} />
              </svg>
            </div>
          ) : (
            <svg viewBox="0 0 720 214" role="img" aria-label={`Korak ${step + 1}: ${STEPS[step].title}. Skripta: ${NOTES[step][0]}. Izjava: ${NOTES[step][1]}.`} style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}>
              <Panel x={4} y={4} w={330} side="L" step={step} />
              <Rough shape={{ k: 'line', x1: 360, y1: 10, x2: 360, y2: 206 }} seed={7301} stroke="var(--ink-4)" strokeWidth={1.2} dash="5 6" />
              <Panel x={386} y={4} w={330} side="R" step={step} />
            </svg>
          )
        }
      </Stepper>
    </div>
  )
}
