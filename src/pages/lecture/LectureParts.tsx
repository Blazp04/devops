import { Link } from 'react-router'
import { motion } from 'motion/react'
import { COURSE, LECTURES } from '../../curriculum/data'
import { getLectureById, getModule, getNeighbours, hasLectureContent, lecturePath } from '../../curriculum/registry'
import { setCompleted, useProgress } from '../../curriculum/progress'
import type { LectureMeta } from '../../curriculum/types'
import { Boil, CheckBox, ClockIcon, Iva, Mark, RoughBox, RoughButton, RoughRule, Stamp, SpeechBubble } from '../../kit'
import { pageNumbers } from '../home/course'
import { Ticks } from '../Ticks'

const PAGES = pageNumbers(LECTURES)

/** Splits a title so its last word can carry the yellow marker. */
function TitleWithMark({ title }: { title: string }) {
  const i = title.lastIndexOf(' ')
  if (i < 0) return <Mark>{title}</Mark>
  return (
    <>
      {title.slice(0, i)} <Mark>{title.slice(i + 1)}</Mark>
    </>
  )
}

/** The lesson header: number, title, subtitle, duration, prerequisites and the objectives as a checklist. */
export function LectureHeader({ meta }: { meta: LectureMeta }) {
  const mod = getModule(meta.module)
  const done = !!useProgress()[meta.slug]?.completed
  const modNo = mod ? mod.label.replace(/\D+/g, '') : ''
  return (
    <header className="nb-lhead">
      <RoughRule double seed={2101} className="nb-lhead__rule" />
      <div className="nb-lhead__grid">
        <div className="nb-lhead__main">
          <p className="nb-lhead__no">
            <b>Predavanje {meta.id}</b>
            {mod && (
              <>
                {' · '}
                <Link to={`/#${mod.id}`} className="nb-lhead__mod" data-module={mod.id}>
                  modul {modNo}
                </Link>
              </>
            )}
            {' · '}str. {PAGES[meta.slug]}
          </p>
          <h1 className="nb-h1">
            <TitleWithMark title={meta.title} />
          </h1>
          <p className="nb-lhead__sub">
            <Ticks text={meta.subtitle} />
          </p>
          <div className="nb-lhead__meta">
            <span>
              <ClockIcon />~{meta.durationMin} min
            </span>
            {mod && <span className="nb-lhead__modname">{mod.title}</span>}
          </div>
          {meta.prerequisites.length > 0 && (
            <p className="nb-lhead__prereq">
              <span className="k-hand">nadovezuje se na:</span>{' '}
              {meta.prerequisites.map((id, i) => {
                const p = getLectureById(id)
                return p ? (
                  <span key={id}>
                    {i > 0 && ', '}
                    <Link to={lecturePath(p)}>
                      {p.id} · {p.title}
                    </Link>
                  </span>
                ) : null
              })}
            </p>
          )}
        </div>
        {meta.objectives.length > 0 && (
          <RoughBox as="aside" className="nb-goals" seed={2110} stroke="var(--pen)" strokeWidth={1.8} double ariaLabel="Ciljevi predavanja">
            <h2 className="nb-goals__title">Nakon ovog predavanja moći ćete:</h2>
            <ul>
              {meta.objectives.map((g, i) => (
                <li key={g}>
                  <CheckBox checked={done} seed={2120 + i * 3} color="var(--pen)" />
                  <span>
                    <Ticks text={g} />
                  </span>
                </li>
              ))}
            </ul>
          </RoughBox>
        )}
      </div>
    </header>
  )
}

/** End of the lecture: the "završeno" stamp, the facts-verified line and page-turn cards to the neighbours. */
export function LectureFooter({ meta }: { meta: LectureMeta }) {
  const { prev, next } = getNeighbours(meta.slug)
  const done = !!useProgress()[meta.slug]?.completed
  // a lecture that is still being written can't be finished (and has no facts to verify yet)
  const written = hasLectureContent(meta.slug)
  return (
    <footer className="nb-lfoot">
      <RoughRule seed={2201} className="nb-lfoot__rule" />
      {written && (
        <div className="nb-lfoot__complete">
          <div className="nb-done">
            {done && (
              <motion.span initial={{ scale: 1.4, opacity: 0, rotate: -18 }} animate={{ scale: 1, opacity: 1, rotate: -9 }} transition={{ type: 'spring', stiffness: 420, damping: 18 }} className="nb-done__stamp">
                <Stamp tone="green" rotate={0}>
                  završeno
                </Stamp>
              </motion.span>
            )}
            {/* one button whose label and action swap, so keyboard focus stays on it */}
            <RoughButton
              className={done ? 'nb-done__undo' : 'nb-complete'}
              seed={2203}
              stroke={done ? 'transparent' : 'var(--green)'}
              onClick={() => setCompleted(meta.slug, !done)}
              ariaPressed={done}
            >
              {!done && <CheckBox seed={2204} color="var(--green)" className="nb-complete__box" />}
              {done ? 'poništi oznaku' : 'Označi kao završeno'}
            </RoughButton>
          </div>
        </div>
      )}
      {written && <p className="nb-lfoot__verified">Činjenice i verzije u ovom predavanju provjerene su: {COURSE.verifiedAt}</p>}
      <nav className="nb-turn" aria-label="Susjedna predavanja">
        {prev ? (
          <Link to={lecturePath(prev)} className="nb-turn__card nb-turn__card--prev">
            <span className="nb-turn__dir">← prethodna stranica</span>
            <span className="nb-turn__title">
              <b>{prev.id}</b> {prev.title}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link to={lecturePath(next)} className="nb-turn__card nb-turn__card--next">
            <span className="nb-turn__dir">sljedeća stranica →</span>
            <span className="nb-turn__title">
              <b>{next.id}</b> {next.title}
            </span>
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </footer>
  )
}

/** A lecture whose page is still empty. */
export function ComingSoon({ meta }: { meta: LectureMeta }) {
  return (
    <div className="nb-soon">
      <svg className="nb-soon__art" viewBox="-10 -70 220 200" aria-hidden="true">
        <Boil slow>
          <Iva x={0} y={6} scale={0.95} mood="worry" />
        </Boil>
        <SpeechBubble x={80} y={-66} w={130} h={70} tx={46} ty={20} lines={['Ova stranica', 'je još prazna…']} size={18} seed={2301} tail={16} />
      </svg>
      <div>
        <h2 className="nb-soon__title">Predavanje je u izradi</h2>
        <p>
          Sadržaj predavanja „{meta.title}” još se piše. Dok čekate, vratite se na <Link to="/#kurikulum">kazalo</Link> i nastavite s predavanjima koja su gotova.
        </p>
      </div>
    </div>
  )
}

/** Faint pencil lines while a lecture chunk loads. */
export function LectureSkeleton() {
  return (
    <div className="nb-skeleton" aria-busy="true" aria-label="Učitavanje predavanja">
      <div />
      <div />
      <div />
    </div>
  )
}
