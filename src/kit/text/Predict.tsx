import { useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, Cross, Rough, RoughButton } from '../sketch/Sketch'
import { StickyNote, Stamp } from '../doodles/Paper'
import type { NoteColor } from '../doodles/types'
import { PenCircle } from '../doodles/text-doodles'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

interface PredictProps {
  /** The "What happens if…?" question, asked BEFORE the student runs the simulation/animation. */
  question: ReactNode
  options: ReactNode[]
  /** Index of the correct option */
  correct: number
  /** Explanation revealed after the student commits to an answer */
  explain: ReactNode
  /** Short call to action shown after answering, e.g. "Provjeri u simulaciji ispod." */
  then?: ReactNode
  /**
   * Shown only after the reveal, under the note (full column width): the evidence, e.g. a small figure that runs both
   * options on the same seed. Kept out of the DOM until then, so it cannot give the answer away.
   */
  after?: ReactNode
  /** Called once when the answer is revealed (`right` = the prediction was correct), e.g. to start an animation. */
  onReveal?: (right: boolean) => void
}

/**
 * Predict-observe-explain on a sticky note: the student circles a prediction (blue pen), may still change it,
 * then reveals the answer — the right one gets a green tick, a wrong pick is crossed out in red.
 */
export function Predict({ question, options, correct, explain, then = 'Provjerite u simulaciji ispod.', after, onReveal }: PredictProps) {
  const [chosen, setChosen] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(false)
  const explainRef = useRef<HTMLDivElement>(null)
  const right = chosen === correct
  // the reveal button disappears: move keyboard focus to the explanation instead of losing it
  const reveal = () => {
    setRevealed(true)
    onReveal?.(right)
    requestAnimationFrame(() => explainRef.current?.focus({ preventScroll: true }))
  }
  return (
    <>
    <StickyNote c="yellow" tape="red" rotate={-0.4} className="k-predict">
      <div className="k-predict__head">
        <span className="k-predict__label">predvidite prije nego što isprobate</span>
        <svg className="k-predict__q-doodle" viewBox="0 0 40 40" aria-hidden="true">
          <Rough shape={{ k: 'ellipse', cx: 20, cy: 20, w: 34, h: 34 }} seed={5401} stroke="var(--red)" strokeWidth={1.8} />
          <Rough
            shape={{
              k: 'curve',
              pts: [
                [14, 15],
                [17, 8],
                [25, 8],
                [27, 15],
                [21, 21],
                [20, 26],
              ],
            }}
            seed={5402}
            stroke="var(--red)"
            strokeWidth={2.4}
          />
          <Rough shape={{ k: 'ellipse', cx: 20, cy: 31, w: 3.6, h: 3.6 }} seed={5403} stroke="var(--red)" fillColor="var(--red)" fillStyle="solid" />
        </svg>
      </div>
      <div className="k-predict__q">{question}</div>
      <ol className="k-pick" aria-label="Ponuđeni odgovori">
        {options.map((o, i) => {
          const sel = chosen === i
          const state = !revealed ? (sel ? 'chosen' : undefined) : i === correct ? 'ok' : sel ? 'bad' : 'faded'
          return (
            <li key={i}>
              <button type="button" className="k-pick__opt" data-state={state} aria-pressed={sel} aria-disabled={revealed || undefined} onClick={() => !revealed && setChosen(i)}>
                <span className="k-pick__letter">
                  {sel && <PenCircle key={`c${i}`} seed={5410 + i} className="k-pick__circle" />}
                  {LETTERS[i]}
                </span>
                <span className="k-pick__text">
                  <span className={revealed && sel && !right ? 'k-strike' : undefined}>{o}</span>
                </span>
                {revealed && (i === correct || sel) && (
                  <svg className="k-pick__mark" viewBox="0 0 32 32" aria-hidden="true">
                    {i === correct ? <Check x={15} y={17} size={10} seed={5420} strokeWidth={2.8} draw="mount" /> : <Cross x={16} y={16} size={8} seed={5421} strokeWidth={2.6} />}
                  </svg>
                )}
                {revealed && i === correct && <span className="visually-hidden"> (točan odgovor)</span>}
              </button>
            </li>
          )
        })}
      </ol>
      <AnimatePresence initial={false}>
        {chosen !== null && !revealed && (
          <motion.div key="then" className="k-predict__then" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <span className="k-predict__thentext">{then}</span>
            <RoughButton className="k-pen-btn" onClick={reveal} seed={5431} stroke="var(--pen)">
              Otkrij odgovor
            </RoughButton>
          </motion.div>
        )}
      </AnimatePresence>
      <div aria-live="polite">
        <AnimatePresence>
          {revealed && (
            <motion.div ref={explainRef} tabIndex={-1} className="k-predict__explain" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.3 }}>
              <span className="k-predict__verdict" data-ok={right}>
                {right ? 'Dobro predviđeno!' : 'Iznenađenje?'}
              </span>
              <div className="k-predict__explaintext">{explain}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </StickyNote>
    {after !== undefined && revealed && (
      <motion.div className="k-predict__after" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}>
        {after}
      </motion.div>
    )}
    </>
  )
}

interface MythOrFactProps {
  items: { statement: ReactNode; fact: boolean; explain: ReactNode }[]
  title?: ReactNode
}

const CARD_PAPER: NoteColor[] = ['pink', 'yellow', 'blue', 'green', 'lilac', 'orange']
const CARD_TILT = [-1.2, 0.9, -0.6, 1.3, -1, 0.7]

/**
 * "Mit ili istina?": a row of notes; the student decides, the note flips over and the answer is stamped on its back
 * (MIT in red / ISTINA in green) with the explanation. Statements are wrapped in „…” automatically — don't add quotes.
 */
export function MythOrFact({ items, title = 'Mit ili istina?' }: MythOrFactProps) {
  const [answers, setAnswers] = useState<(boolean | null)[]>(() => items.map(() => null))
  const reduce = useReducedMotion()
  const backs = useRef<(HTMLDivElement | null)[]>([])
  // the front (with the focused button) becomes inert: move focus to the answer on the back
  const answer = (i: number, v: boolean) => {
    setAnswers((p) => p.map((x, j) => (j === i ? v : x)))
    requestAnimationFrame(() => backs.current[i]?.focus({ preventScroll: true }))
  }
  return (
    <div className="k-mof k-wide-soft">
      <div className="k-mof__title">{title}</div>
      <ol className="k-mof__grid">
        {items.map((it, i) => {
          const a = answers[i]
          const answered = a !== null
          const right = answered && a === it.fact
          return (
            <li key={i} className="k-mof__slot" style={{ rotate: `${CARD_TILT[i % CARD_TILT.length]}deg` }}>
              <motion.div className="k-mof__card" initial={false} animate={{ rotateY: answered ? 180 : 0 }} transition={reduce ? { duration: 0 } : { duration: 0.6, ease: [0.4, 0, 0.2, 1] }}>
                <div className="k-mof__face k-mof__front k-note" data-c={CARD_PAPER[i % CARD_PAPER.length]} inert={answered}>
                  <div className="k-mof__statement">„{it.statement}”</div>
                  <div className="k-mof__btns">
                    <RoughButton className="k-pen-btn k-pen-btn--red" stroke="var(--red)" seed={5440 + i * 2} onClick={() => answer(i, false)}>
                      Mit
                    </RoughButton>
                    <RoughButton className="k-pen-btn k-pen-btn--green" stroke="var(--green)" seed={5441 + i * 2} onClick={() => answer(i, true)}>
                      Istina
                    </RoughButton>
                  </div>
                </div>
                <div
                  ref={(el) => {
                    backs.current[i] = el
                  }}
                  className="k-mof__face k-mof__back k-note"
                  data-c={CARD_PAPER[i % CARD_PAPER.length]}
                  inert={!answered}
                  aria-hidden={!answered}
                  tabIndex={-1}
                  role="group"
                  aria-label={answered ? `Odgovor: ${it.fact ? 'istina' : 'mit'}. ${right ? 'Točno!' : 'Ne baš…'}` : undefined}
                >
                  <div className="k-mof__backhead">
                    <Stamp tone={it.fact ? 'green' : 'red'} rotate={-8} className="k-mof__stamp">
                      {it.fact ? 'istina' : 'mit'}
                    </Stamp>
                    <span className="k-mof__verdict" data-ok={right}>
                      {right ? 'Točno!' : 'Ne baš…'}
                    </span>
                  </div>
                  <div className="k-mof__small">„{it.statement}”</div>
                  <div className="k-mof__explain">{it.explain}</div>
                </div>
              </motion.div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
