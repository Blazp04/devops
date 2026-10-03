import { useId, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Arrow, Rough, RoughBox } from '../sketch/Sketch'
import { StickyNote, Tape, Stamp } from '../doodles/Paper'
import { CalloutGlyph, CastDoodle, Paperclip } from '../doodles/text-doodles'
import { CAST_NAME, type CastName } from './types'
import { useLineBoxes } from './lines'

export type CalloutKind = 'info' | 'tip' | 'warn' | 'danger' | 'analogy' | 'key' | 'fact'

/** The handwritten label of each kind (Caveat, the author's voice). */
const LABEL: Record<CalloutKind, string> = {
  info: 'napomena',
  tip: 'savjet',
  warn: 'pazi!',
  danger: 'opasno!',
  analogy: 'analogija',
  key: 'ključna ideja!',
  fact: 'stanje u 2026.',
}

interface CalloutProps {
  kind?: CalloutKind
  /** Printed title under the handwritten kind label (e.g. "Probajte", "Zamka: crna rupa"). */
  title?: ReactNode
  children: ReactNode
}

function Head({ kind, title, glyph = true }: { kind: CalloutKind; title?: ReactNode; glyph?: boolean }) {
  return (
    <div className="k-callout__head">
      <span className="k-callout__label">{LABEL[kind]}</span>
      {title && <span className="k-callout__title">{title}</span>}
      {glyph && kind !== 'analogy' && kind !== 'key' && <CalloutGlyph kind={kind} className="k-callout__glyph" />}
    </div>
  )
}

/**
 * An aside in the notebook. Every kind is a different piece of paper or pen:
 * info = blue sticky note · tip = green sticky note · warn = a taped index card (orange pencil) ·
 * danger = a red-pencil box drawn on the page · analogy = yellow note with teta Mira · key = the big ink box ·
 * fact = a dated clipping taped in. On the chalkboard the paper ones are pinned with magnets above the chalk dust.
 */
export function Callout({ kind = 'info', title, children }: CalloutProps) {
  const body = <div className="k-callout__content">{children}</div>
  switch (kind) {
    case 'info':
      return (
        <StickyNote as="aside" c="blue" tape="blue" rotate={-0.5} className="k-callout k-callout--info">
          <Head kind={kind} title={title} />
          {body}
        </StickyNote>
      )
    case 'tip':
      return (
        <StickyNote as="aside" c="green" rotate={0.6} className="k-callout k-callout--tip">
          <Tape c="red" style={{ top: -11, left: -18, transform: 'rotate(-28deg)' }} />
          <Head kind={kind} title={title} />
          {body}
        </StickyNote>
      )
    case 'analogy':
      return (
        <StickyNote as="aside" c="yellow" tape="red" rotate={0.5} className="k-callout k-callout--analogy">
          <Head kind={kind} title={title} />
          {body}
        </StickyNote>
      )
    case 'warn':
      return (
        <aside className="k-callout k-callout--warn k-card k-retone">
          <Tape c="blue" style={{ top: -12, left: 26, transform: 'rotate(-6deg)' }} />
          <Tape c="blue" style={{ top: -12, right: 26, transform: 'rotate(5deg)' }} />
          <Head kind={kind} title={title} />
          {body}
        </aside>
      )
    case 'fact':
      return (
        <aside className="k-callout k-callout--fact">
          <Tape c="green" style={{ top: -10, left: -20, transform: 'rotate(-32deg)' }} />
          <div className="k-clip k-card k-retone">
            <div className="k-callout__head">
              <span className="k-callout__label">{LABEL.fact}</span>
              <Stamp tone="pen" rotate={-6} className="k-callout__stamp">
                listopad 2026.
              </Stamp>
              {title && <span className="k-callout__title">{title}</span>}
            </div>
            {body}
          </div>
        </aside>
      )
    case 'danger':
      return (
        <RoughBox as="aside" className="k-callout k-callout--danger" stroke="var(--red)" strokeWidth={1.8} roughness={1.2} double seed={5201} draw>
          <span className="k-callout__tag">{LABEL.danger}</span>
          <CalloutGlyph kind="danger" className="k-callout__glyph k-callout__glyph--corner" />
          {title && <div className="k-callout__title">{title}</div>}
          {body}
        </RoughBox>
      )
    case 'key':
      return (
        <RoughBox as="aside" className="k-callout k-callout--key" stroke="var(--ink)" strokeWidth={2} roughness={1.1} double seed={5211} draw>
          <span className="k-callout__tag">{title ?? LABEL.key}</span>
          {body}
        </RoughBox>
      )
  }
}

interface AnalogyProps {
  title?: ReactNode
  children: ReactNode
  /** Where the analogy stops being true. Always fill this in: analogies that are never bounded mislead. */
  breaksDown?: ReactNode
  /** Who stands next to the analogy (default teta Mira, the menza's cook). `false` = nobody. */
  who?: CastName | false
}

/**
 * An analogy from the menza on a yellow sticky note, with the character it belongs to; "where the analogy breaks"
 * is the author's red-pencil note beside it (in the margin on wide pages, under the note on narrow ones).
 */
export function Analogy({ title, children, breaksDown, who = 'mira' }: AnalogyProps) {
  return (
    <div className={`k-analogy${breaksDown ? ' has-limits' : ''}`}>
      <StickyNote as="aside" c="yellow" tape="red" rotate={0.5} className="k-analogy__note" ariaLabel="Analogija">
        {who && <CastDoodle who={who} mood="grin" className="k-analogy__who" label={CAST_NAME[who]} />}
        <div className="k-analogy__head">
          <span className="k-callout__label">analogija</span>
          <span className="k-analogy__title">{title ?? 'Analogija'}</span>
        </div>
        <div className="k-callout__content">{children}</div>
      </StickyNote>
      {breaksDown && (
        <aside className="k-analogy__limits" aria-label="Gdje analogija ne vrijedi">
          <svg className="k-analogy__arrow" viewBox="0 0 70 60" aria-hidden="true">
            <Arrow
              pts={[
                [4, 34],
                [28, 16],
                [64, 22],
              ]}
              stroke="var(--red)"
              strokeWidth={1.8}
              seed={5221}
              head={8}
              draw
              delay={0.3}
            />
          </svg>
          <RoughBox className="k-analogy__limitsbox" stroke="var(--red)" strokeWidth={1.4} roughness={1.5} seed={5222} pad={2}>
            <strong className="k-analogy__limitslabel">Gdje analogija ne vrijedi:</strong>
            <div className="k-analogy__limitstext">{breaksDown}</div>
          </RoughBox>
        </aside>
      )}
    </div>
  )
}

/** Each line of the myth gets one wavy red-pen line, ~0,7 s after the note scrolls in (text stays readable). */
function StruckText({ children }: { children: ReactNode }) {
  const [ref, lines] = useLineBoxes<HTMLSpanElement>()
  return (
    <span className="k-struck">
      <span ref={ref}>{children}</span>
      {lines.length > 0 && (
        <svg className="k-struck__svg" aria-hidden="true">
          {lines.map((l, i) => {
            const y = l.y + l.h * 0.56
            return (
              <Rough
                key={`${i}-${Math.round(l.w)}`}
                shape={{
                  k: 'curve',
                  pts: [
                    [l.x - 4, y + 1],
                    [l.x + l.w * 0.3, y - 3],
                    [l.x + l.w * 0.62, y + 2.5],
                    [l.x + l.w + 5, y - 2],
                  ],
                }}
                seed={5231 + i * 3}
                stroke="var(--red)"
                strokeWidth={2.5}
                roughness={0.9}
                draw
                delay={0.7 + i * 0.28}
                duration={0.32}
              />
            )
          })}
        </svg>
      )}
    </span>
  )
}

interface MythProps {
  /** The wrong belief, phrased the way students say it */
  myth: ReactNode
  children: ReactNode
}

/**
 * A misconception: a crumpled pink note, readable first; then each line is crossed out with one wavy red line,
 * "NE!" pops up and a wiggly arrow leads to the fact.
 */
export function Myth({ myth, children }: MythProps) {
  // reduced motion: "NE!" is simply there (the strike-through and arrows are drawn at once by Rough)
  const reduce = useReducedMotion()
  return (
    <aside className="k-myth">
      <div className="k-myth__note k-note" data-c="pink">
        <span className="k-myth__label">mit</span>
        <p className="k-myth__text">
          <StruckText>{myth}</StruckText>
        </p>
      </div>
      <div className="k-myth__ne" aria-hidden="true">
        <motion.span
          className="k-myth__no"
          initial={reduce ? false : { opacity: 0, scale: 0.4, rotate: -24 }}
          animate={reduce ? { opacity: 1, scale: 1, rotate: -10 } : undefined}
          whileInView={{ opacity: 1, scale: 1, rotate: -10 }}
          viewport={{ once: true, margin: '0px 0px -10% 0px' }}
          transition={{ delay: 1.5, type: 'spring', stiffness: 380, damping: 14 }}
        >
          NE!
        </motion.span>
        <svg className="k-myth__arrow k-myth__arrow--side" viewBox="0 0 110 80">
          <Arrow
            pts={[
              [6, 18],
              [38, 4],
              [58, 28],
              [40, 46],
              [34, 28],
              [66, 20],
              [104, 50],
            ]}
            stroke="var(--red)"
            strokeWidth={2.2}
            seed={5241}
            draw
            delay={1.7}
          />
        </svg>
        <svg className="k-myth__arrow k-myth__arrow--down" viewBox="0 0 80 70">
          <Arrow
            pts={[
              [10, 6],
              [40, 10],
              [52, 30],
              [34, 38],
              [36, 24],
              [58, 40],
              [62, 64],
            ]}
            stroke="var(--red)"
            strokeWidth={2.2}
            seed={5242}
            draw
            delay={1.7}
          />
        </svg>
      </div>
      <div className="k-myth__fact">
        <span className="k-myth__label k-myth__label--fact">činjenica</span>
        <div className="k-myth__facttext">{children}</div>
      </div>
    </aside>
  )
}

interface DeepDiveProps {
  title: ReactNode
  children: ReactNode
  defaultOpen?: boolean
}

/**
 * "Za znatiželjne": an extra page of graph paper clipped into the notebook, folded shut. Optional detail that keeps
 * the main path simple; collapsed by default.
 */
export function DeepDive({ title, children, defaultOpen = false }: DeepDiveProps) {
  const [open, setOpen] = useState(defaultOpen)
  const panel = useId()
  return (
    <div className={`k-deep${open ? ' is-open' : ''}`}>
      <Paperclip className="k-deep__clip" />
      <button type="button" className="k-deep__toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={panel}>
        <span className="k-deep__label">za znatiželjne</span>
        <span className="k-deep__title">{title}</span>
        <span className="k-deep__more" aria-hidden="true">
          {open ? 'zatvori' : 'otvori'}
          <svg viewBox="0 0 20 20" className="k-deep__chev">
            <Rough
              shape={{
                k: 'lin',
                pts: [
                  [4, 7],
                  [10, 13],
                  [16, 6],
                ],
              }}
              seed={5251}
              stroke="var(--pen)"
              strokeWidth={2}
              roughness={0.7}
            />
          </svg>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panel}
            className="k-deep__content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="k-deep__inner prose">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * The one big statement of the lecture: printed large inside a double ink box with the red "ključna ideja!" tag.
 * Wrap the words that matter in <strong>: they get a marker swipe when the box scrolls into view.
 */
export function KeyIdea({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(false)
  return (
    <motion.div className="k-keyidea-wrap" onViewportEnter={() => setOn(true)} viewport={{ once: true, margin: '0px 0px -10% 0px' }}>
      <RoughBox className="k-keyidea" stroke="var(--ink)" strokeWidth={2.2} roughness={1.1} double seed={2401} draw>
        <span className="k-callout__tag">ključna ideja!</span>
        <div className="k-keyidea__text" data-on={on ? '' : undefined}>
          {children}
        </div>
      </RoughBox>
    </motion.div>
  )
}
