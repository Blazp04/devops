import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { recordQuiz } from '../../curriculum/progress'
import { useLecture } from '../lecture-context'
import { Arrow, Check, Cross, Rough, RoughAround, RoughButton } from '../sketch/Sketch'
import { useSize } from '../sketch/useSize'
import { StickyNote } from '../doodles/Paper'
import { CastDoodle, PenCircle } from '../doodles/text-doodles'

export interface QuizQuestion {
  q: ReactNode
  options: ReactNode[]
  /** Index of the correct option (0-based). */
  correct: number
  /** Why the correct answer is correct (and why the tempting wrong one is wrong). Shown after answering. */
  explain: ReactNode
}

interface QuizProps {
  /** Stable id within the lecture, used to store the score. */
  id?: string
  title?: ReactNode
  questions: QuizQuestion[]
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
/** below this sheet width the answer grid folds (verdict under the answer) */
const NARROW = 640

/**
 * The teacher's note right under the picked answer, with a short pen arrow up to it (green when right, red when not):
 * teta Mira is pleased, Davor is not. The arrow never points at another answer.
 */
function Feedback({ right, children, seed }: { right: boolean; children: ReactNode; seed: number }) {
  return (
    <motion.div className="k-quiz__feedback" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.3 }}>
      <svg className="k-quiz__farrow" viewBox="0 0 60 44" aria-hidden="true">
        <Arrow
          pts={[
            [44, 42],
            [36, 24],
            [20, 8],
          ]}
          stroke={right ? 'var(--green)' : 'var(--red)'}
          strokeWidth={2.2}
          seed={seed}
          head={8}
          draw="mount"
        />
      </svg>
      <StickyNote as="aside" c={right ? 'green' : 'pink'} tape="red" rotate={right ? -0.7 : 0.5} className="k-quiz__fnote">
        <CastDoodle who={right ? 'mira' : 'davor'} mood={right ? 'grin' : 'worry'} className="k-quiz__fwho" />
        <div className="k-quiz__fbody">
          <strong className="k-quiz__fsays">{right ? 'Teta Mira: „Bravo, točno!”' : 'Davor: „Hmm, ne baš…”'}</strong>
          <div className="k-quiz__fexplain">{children}</div>
        </div>
      </StickyNote>
    </motion.div>
  )
}

/**
 * The test sheet's outline: a corner cut and folded over. On paper a crisp sheet; on the chalkboard the same shape is
 * drawn in chalk (outline + fold), so it still reads as a sheet.
 */
function SheetOutline({ w, h, fold }: { w: number; h: number; fold: number }) {
  return (
    <svg className="k-quiz__sheet" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <Rough
        shape={{
          k: 'poly',
          pts: [
            [2, 2],
            [w - fold, 2],
            [w - 2, fold],
            [w - 2, h - 2],
            [2, h - 2],
          ],
        }}
        seed={5501}
        strokeWidth={1.8}
        roughness={0.9}
        stroke="var(--k-sheet-edge)"
      />
      <Rough
        shape={{
          k: 'lin',
          pts: [
            [w - fold, 2],
            [w - fold + 4, fold - 4],
            [w - 2, fold],
          ],
        }}
        seed={5502}
        strokeWidth={1.6}
        stroke="var(--k-sheet-edge)"
        fillColor="var(--k-sheet-fold)"
        fillStyle="solid"
      />
    </svg>
  )
}

/**
 * Self-check as an exam sheet: red margin, ruled lines, a folded corner, "Ime:" and "Bodovi: _ / N".
 * The picked answer is circled in blue pen; a wrong one is struck through in red and the right one gets a green tick.
 * The explanation is a note from the reacting character right under the picked answer. Loads unanswered.
 */
export function Quiz({ id = 'provjera', title = 'Provjerite razumijevanje', questions }: QuizProps) {
  const lecture = useLecture()
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null))
  const [ref, size] = useSize<HTMLDivElement>()
  const answered = answers.filter((a) => a !== null).length
  const correct = answers.filter((a, i) => a === questions[i].correct).length
  const done = answered === questions.length
  const narrow = size !== null && size.w < NARROW

  useEffect(() => {
    if (done && lecture) recordQuiz(lecture.slug, id, correct, questions.length)
  }, [done, correct, id, lecture, questions.length])

  const reset = () => setAnswers(questions.map(() => null))
  const pick = (qi: number, oi: number) => setAnswers((a) => a.map((v, i) => (i === qi ? oi : v)))

  return (
    <div ref={ref} className="k-quiz k-wide-soft" data-narrow={narrow ? '' : undefined}>
      {size && <SheetOutline w={size.w} h={size.h} fold={narrow ? 40 : 58} />}
      <div className="k-quiz__head">
        <div className="k-quiz__title">{title}</div>
        <div className="k-quiz__fields">
          <span>
            Ime: <i className="k-quiz__blank">Lana K.</i>
          </span>
          <span className="k-quiz__scorefield">
            Bodovi:{' '}
            <i className="k-quiz__blank k-quiz__blank--score">
              {done ? (
                <RoughAround key={`s${correct}`} seed={5511 + correct} padX={12} padY={4} className="k-quiz__score">
                  {correct}
                </RoughAround>
              ) : (
                ' '
              )}
            </i>{' '}
            / {questions.length}
          </span>
        </div>
      </div>
      <ol className="k-quiz__list">
        {questions.map((question, qi) => {
          const chosen = answers[qi]
          const isAnswered = chosen !== null
          return (
            <li key={qi} className="k-quiz__q">
              <div className="k-quiz__qtext">
                <span className="k-quiz__qno">{qi + 1}.</span> {question.q}
              </div>
              <ol className="k-quiz__options">
                {question.options.map((opt, oi) => {
                  const sel = chosen === oi
                  const isCorrect = oi === question.correct
                  const state = !isAnswered ? undefined : sel ? (isCorrect ? 'ok' : 'bad') : isCorrect ? 'right' : 'faded'
                  return (
                    <li key={oi}>
                      {/* aria-disabled (not disabled) once answered: keyboard focus stays on the chosen answer */}
                      <button type="button" className="k-quiz__opt" data-state={state} aria-pressed={sel} aria-disabled={isAnswered || undefined} onClick={() => !isAnswered && pick(qi, oi)}>
                        <span className="k-quiz__letter">
                          {sel && <PenCircle key={`c${oi}`} seed={5520 + oi} className="k-quiz__circle" />}
                          {LETTERS[oi]}
                        </span>
                        <span className="k-quiz__opttext">
                          <span className={sel && !isCorrect ? 'k-strike' : undefined}>{opt}</span>
                        </span>
                        <span className="k-quiz__mark" aria-hidden="true">
                          {sel && (
                            <motion.span
                              className="k-quiz__verdict"
                              data-ok={isCorrect}
                              initial={{ opacity: 0, rotate: -12, scale: 1.25 }}
                              animate={{ opacity: 1, rotate: -6, scale: 1 }}
                              transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                            >
                              <svg viewBox="0 0 40 40">{isCorrect ? <Check x={20} y={22} size={13} seed={5530} strokeWidth={3} draw="mount" /> : <Cross x={20} y={20} size={10} seed={5531} strokeWidth={3} />}</svg>
                              {isCorrect ? 'Točno!' : 'Ne baš…'}
                            </motion.span>
                          )}
                          {state === 'right' && (
                            <span className="k-quiz__fix">
                              <svg viewBox="0 0 32 32">
                                <Check x={15} y={17} size={9} seed={5532} strokeWidth={2.6} draw="mount" delay={0.3} />
                              </svg>
                              ovo je točno
                            </span>
                          )}
                        </span>
                        {sel && <span className="visually-hidden">{isCorrect ? ' Točan odgovor.' : ' Netočan odgovor.'}</span>}
                        {state === 'right' && <span className="visually-hidden"> Ovo je točan odgovor.</span>}
                      </button>
                      <div aria-live="polite">
                        <AnimatePresence>
                          {sel && (
                            <Feedback key={`f${oi}`} right={isCorrect} seed={5540 + (isCorrect ? 0 : 3)}>
                              {question.explain}
                            </Feedback>
                          )}
                        </AnimatePresence>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </li>
          )
        })}
      </ol>
      {done ? (
        <motion.div className="k-quiz__done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
          <span className="k-quiz__result">
            Rezultat: <strong>{correct}</strong> / {questions.length}
            {correct === questions.length ? ' — odlično!' : correct >= questions.length / 2 ? ' — dobro, pogledajte objašnjenja za ostala.' : ' — vratite se na odjeljke iznad pa pokušajte ponovno.'}
          </span>
          <RoughButton className="k-pen-btn" stroke="var(--pen)" seed={5551} onClick={reset}>
            <svg viewBox="0 0 20 20" aria-hidden="true" className="k-pen-btn__icon">
              <Rough shape={{ k: 'arc', cx: 10, cy: 10, w: 13, h: 13, start: -2.4, stop: 2.2 }} seed={5552} stroke="currentColor" strokeWidth={1.8} roughness={0.6} />
              <Rough
                shape={{
                  k: 'lin',
                  pts: [
                    [1.8, 4.5],
                    [3, 8.6],
                    [7, 7.4],
                  ],
                }}
                seed={5553}
                stroke="currentColor"
                strokeWidth={1.8}
                roughness={0.5}
              />
            </svg>
            Ponovi
          </RoughButton>
        </motion.div>
      ) : (
        <p className="k-quiz__hint">
          {answered === 0 ? 'Zaokružite po jedan odgovor u svakom pitanju.' : `Odgovoreno ${answered} od ${questions.length}.`}
        </p>
      )}
    </div>
  )
}
