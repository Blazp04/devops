import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { Rough } from '../sketch/Sketch'
import { useWidth } from '../sketch/useSize'
import { Tape } from '../doodles/Paper'
import { Button } from './Controls'
import { stepColor } from './steps'

export interface Step {
  /** Short Croatian step title */
  title: ReactNode
  /** Narration for this step: text or JSX (e.g. `<>Commit <code>a1b2c3d</code> …</>` for code font) */
  body?: ReactNode
}

interface StepperProps {
  steps: Step[]
  /** Renders the visual for the current step. Keep visuals a pure function of `step`. */
  children: (step: number, info: { direction: 1 | -1; total: number }) => ReactNode
  title?: ReactNode
  /** Milliseconds per step when playing. 0 disables the play button. */
  autoPlay?: number
  /** Start playing automatically when scrolled into view. */
  playOnView?: boolean
  wide?: boolean
  /** Fixed aspect ratio of the stage, e.g. "16 / 9". Prevents layout jumps between steps. */
  aspect?: string
  caption?: ReactNode
}

/** The step number as a circled pen note (HTML), in the colour of its step. */
function StepNo({ i }: { i: number }) {
  const c = stepColor(i)
  return (
    <span className="k-stepper__no" style={{ color: c }} aria-hidden="true">
      <svg viewBox="0 0 34 32" width="34" height="32">
        <Rough shape={{ k: 'ellipse', cx: 17, cy: 16, w: 29, h: 27 }} seed={4600 + i * 11} stroke="currentColor" strokeWidth={1.9} roughness={0.9} multi />
      </svg>
      <span>{i + 1}</span>
    </span>
  )
}

/** Progress dot: a pencil circle, hatched once the step has been seen, red for the current one. */
function Dot({ i, step }: { i: number; step: number }) {
  const cur = i === step
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <Rough
        shape={{ k: 'ellipse', cx: 12, cy: 12, w: 18, h: 18 }}
        seed={760 + i}
        strokeWidth={cur ? 2 : 1.6}
        stroke={cur ? 'var(--red)' : 'var(--ink-2)'}
        fillColor={i <= step ? (cur ? 'var(--red)' : 'var(--ink-3)') : undefined}
        fillStyle="hachure"
        hachureGap={2.6}
      />
    </svg>
  )
}

/**
 * Step-through explainer as a flip-book: the drawing on the page, and an index card that tells the story one step at
 * a time ("Korak N / M", the step's numbered note, Natrag / Dalje / Ponovi, progress dots). Reader-paced; it can also
 * play itself (`autoPlay`, `playOnView`). Keyboard: ← →. Under the card lie the pages still to come.
 */
export function Stepper({ steps, children, title, autoPlay = 4200, playOnView = false, wide = true, aspect, caption }: StepperProps) {
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [playingRaw, setPlaying] = useState(false)
  const rootRef = useRef<HTMLElement>(null)
  const inView = useInView(rootRef, { margin: '-120px' })
  const reduce = useReducedMotion()
  const startedRef = useRef(false)
  const [bodyRef, bodyW] = useWidth<HTMLDivElement>()
  // a drawing taller than ~400 px pushes its card off a phone screen: then the stage gets its own ← → bar
  const stageRef = useRef<HTMLDivElement>(null)
  const [tall, setTall] = useState(false)
  useEffect(() => {
    const el = stageRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => {
      if (e.contentRect.height > 400) setTall(true)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const total = steps.length
  const last = step === total - 1
  const playing = playingRaw && !last
  // the card sits beside the drawing only when the drawing keeps ≥ ~720 px (diagrams stay at their size)
  const beside = bodyW !== null && bodyW >= 1080
  const narrow = bodyW !== null && bodyW < 560

  const go = useCallback(
    (to: number) => {
      const clamped = Math.max(0, Math.min(total - 1, to))
      setDirection(clamped >= step ? 1 : -1)
      setStep(clamped)
    },
    [step, total],
  )

  // reduced motion: never start playing by itself (the reader pages through)
  useEffect(() => {
    if (playOnView && !reduce && inView && !startedRef.current && autoPlay > 0) {
      startedRef.current = true
      setPlaying(true)
    }
  }, [inView, playOnView, autoPlay, reduce])

  useEffect(() => {
    if (!playing || !inView) return
    const t = setTimeout(() => go(step + 1), autoPlay)
    return () => clearTimeout(t)
  }, [playing, inView, step, autoPlay, go])

  const onKey = (e: KeyboardEvent) => {
    const t = e.target
    if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      setPlaying(false)
      go(step + 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setPlaying(false)
      go(step - 1)
    }
  }

  const current = steps[step]
  const under = Math.min(3, total - step - 1)

  return (
    <figure
      className={`k-stepper${wide ? ' k-wide' : ''}`}
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKey}
      aria-roledescription="koračni prikaz"
      aria-label={typeof title === 'string' ? `${title} (strelice lijevo i desno mijenjaju korak)` : 'Korak po korak (strelice lijevo i desno mijenjaju korak)'}
      data-layout={beside ? 'beside' : narrow ? 'narrow' : 'below'}
      data-many={total > 6 ? 'lots' : total > 4 ? 'yes' : undefined}
    >
      {title && <div className="k-stepper__title">{title}</div>}
      <div className="k-stepper__body" ref={bodyRef}>
        <div className="k-stepper__stage" ref={stageRef} style={aspect ? { aspectRatio: aspect } : undefined}>
          {children(step, { direction, total })}
        </div>
        {/* phones, tall drawings: a compact ← step → bar right under the drawing, so the reader need not scroll between
            the drawing and its card (the card below keeps the full narration and the main buttons) */}
        {narrow && tall && (
          <div className="k-stepper__mini" role="group" aria-label="Koraci uz crtež">
            <Button
              size="sm"
              variant="ghost"
              ariaDisabled={step === 0}
              ariaLabel="Prethodni korak"
              onClick={() => {
                setPlaying(false)
                go(step - 1)
              }}
            >
              ←
            </Button>
            <span className="k-stepper__minititle">
              <StepNo i={step} />
              <span>{current.title}</span>
            </span>
            <Button
              size="sm"
              ariaLabel={last ? 'Ponovi od prvog koraka' : 'Sljedeći korak'}
              onClick={() => {
                setPlaying(false)
                go(last ? 0 : step + 1)
              }}
            >
              {last ? '↺' : '→'}
            </Button>
          </div>
        )}
        <div className="k-stepper__cardwrap">
          {Array.from({ length: under }, (_, i) => (
            <span key={i} className="k-stepper__under" data-i={i} aria-hidden="true" />
          ))}
          <div className="k-stepper__card k-pinned">
            <Tape c="red" className="k-stepper__tape" style={{ top: -12, left: 26, transform: 'rotate(-4deg)' }} />
            <div className="k-stepper__cardtop">
              <span className="k-stepper__count">
                Korak {step + 1} / {total}
              </span>
              <div className="k-stepper__dots" role="group" aria-label="Koraci">
                {steps.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-current={i === step ? 'step' : undefined}
                    aria-label={`Korak ${i + 1}${typeof s.title === 'string' ? `: ${s.title}` : ''}`}
                    className={`k-stepper__dot${i === step ? ' is-active' : ''}`}
                    onClick={() => {
                      setPlaying(false)
                      go(i)
                    }}
                  >
                    <Dot i={i} step={step} />
                  </button>
                ))}
              </div>
              {playing && <span key={`timer${step}`} className="k-stepper__timer" style={{ animationDuration: `${autoPlay}ms` }} aria-hidden="true" />}
            </div>
            <div className="k-stepper__narration" aria-live="polite">
              {/* every step laid in the same cell, invisible: the card is as tall as its longest step (no jumps) */}
              <div className="k-stepper__sizer" aria-hidden="true">
                {steps.map((s, i) => (
                  <div key={i}>
                    <div className="k-stepper__steptitle">
                      <span className="k-stepper__no" />
                      <span>{s.title}</span>
                    </div>
                    {s.body && <div className="k-stepper__text">{s.body}</div>}
                  </div>
                ))}
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 10 * direction }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 * direction }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="k-stepper__steptitle">
                    <StepNo i={step} />
                    <span>{current.title}</span>
                  </div>
                  {current.body && <div className="k-stepper__text">{current.body}</div>}
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="k-stepper__ctl">
              <span className="k-stepper__back">
                <Button
                  size={narrow ? 'md' : 'sm'}
                  ariaDisabled={step === 0}
                  onClick={() => {
                    setPlaying(false)
                    go(step - 1)
                  }}
                >
                  ← Natrag
                </Button>
              </span>
              {autoPlay > 0 && !last && (
                <span className="k-stepper__play">
                  <Button size={narrow ? 'md' : 'sm'} variant="ghost" icon={playing ? Pause : Play} onClick={() => setPlaying((p) => !p)}>
                    {playing ? 'Zaustavi' : 'Pusti'}
                  </Button>
                </span>
              )}
              <span className="k-stepper__next">
                {last ? (
                  <Button
                    size={narrow ? 'md' : 'sm'}
                    variant="primary"
                    icon={RotateCcw}
                    onClick={() => {
                      setPlaying(false)
                      go(0)
                    }}
                  >
                    Ponovi
                  </Button>
                ) : (
                  <Button
                    size={narrow ? 'md' : 'sm'}
                    variant="primary"
                    onClick={() => {
                      setPlaying(false)
                      go(step + 1)
                    }}
                  >
                    Dalje →
                  </Button>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
      {caption && <figcaption className="k-stepper__caption">{caption}</figcaption>}
    </figure>
  )
}
