import { Link } from 'react-router'
import { LECTURES, MODULES } from '../../curriculum/data'
import { hasLectureContent, lecturePath, lecturesInModule } from '../../curriculum/registry'
import type { LectureProgress } from '../../curriculum/progress'
import { Arrow, CheckBox, MarginDoodle, RoughRule, Stamp } from '../../kit'
import { pageNumbers } from './course'
import { Ticks } from '../Ticks'

const PAGES = pageNumbers(LECTURES)
const SHORT: Record<string, string> = { m1: 'sustavi', m2: 'kontejneri', m3: 'Kubernetes', m4: 'u pogonu', m5: 'isporuka', m6: 'sve zajedno' }

/**
 * The notebook's handwritten table of contents: six modules as coloured index tabs, 24 lectures with dotted leaders
 * to the page number, checkboxes, a ZAVRŠENO stamp on finished lectures and a red ribbon bookmark on the next one.
 */
export function Kazalo({ progress, nextSlug, currentModule }: { progress: Record<string, LectureProgress>; nextSlug?: string; currentModule: string }) {
  const done = LECTURES.filter((l) => progress[l.slug]?.completed).length
  return (
    <section className="nb-kazalo" id="kurikulum" aria-labelledby="kazalo-title">
      <nav className="nb-tabs" aria-label="Moduli tečaja">
        <ol>
          {MODULES.map((m, i) => (
            <li key={m.id} data-module={m.id} aria-current={m.id === currentModule ? 'true' : undefined}>
              <a href={`#${m.id}`} title={`${m.label}: ${m.title}`}>
                <span>
                  <b>{i + 1}</b> <span className="nb-tabs__name">{SHORT[m.id] ?? m.title}</span>
                </span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <div className="nb-kazalo__head">
        <span className="nb-kicker">sadržaj bilježnice</span>
        <h2 className="nb-h2" id="kazalo-title">
          Kazalo
        </h2>
        <RoughRule double seed={2002} stroke="var(--ink)" strokeWidth={1.8} className="nb-kazalo__rule" />
        <p className="nb-kazalo__count k-hand">
          {done > 0 ? `${done} / ${LECTURES.length} predavanja završeno` : `${LECTURES.length} predavanja · krenite od prvog`}
        </p>
      </div>
      <div className="nb-kazalo__grid">
        <div className="nb-kazalo__main">
          {MODULES.map((m, mi) => (
            <div key={m.id} className="nb-module" id={m.id} data-module={m.id}>
              <h3 className="nb-module__title">
                <span className="nb-module__chip" aria-hidden="true">
                  {mi + 1}
                </span>
                {m.label} · {m.title}
              </h3>
              <p className="nb-module__desc">
                <Ticks text={m.description} />
              </p>
              <ol className="nb-toc">
                {lecturesInModule(m.id).map((l) => {
                  const isDone = !!progress[l.slug]?.completed
                  const isNext = l.slug === nextSlug
                  const ready = hasLectureContent(l.slug)
                  return (
                    <li key={l.slug} className="nb-toc__item" data-state={isDone ? 'done' : isNext ? 'next' : 'todo'} data-draft={ready ? undefined : ''}>
                      <span className="nb-toc__box" aria-hidden="true">
                        <CheckBox checked={isDone} seed={2010 + Number(l.id) * 3} color="var(--ink-2)" />
                      </span>
                      <Link to={lecturePath(l)} className="nb-toc__link">
                        <span className="nb-toc__line">
                          <span className="nb-toc__num">{l.id}</span>
                          <span className="nb-toc__title">
                            <span className="visually-hidden">Predavanje {l.id}: </span>
                            <Ticks text={l.title} />
                          </span>
                          <span className="nb-toc__dots" aria-hidden="true" />
                          <span className="nb-toc__page">str. {PAGES[l.slug]}</span>
                        </span>
                        <span className="nb-toc__sub">
                          <Ticks text={l.subtitle} /> <span className="nb-toc__min">· {l.durationMin} min</span>
                          {!ready && <span className="nb-toc__draft"> · u izradi</span>}
                          {isDone && <span className="visually-hidden"> (završeno)</span>}
                        </span>
                      </Link>
                      <span className="nb-toc__mark">
                        {isDone && <Stamp tone="green">završeno</Stamp>}
                        {isNext && !isDone && (
                          <span className="nb-ribbon">
                            <span>sljedeće</span>
                          </span>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ol>
            </div>
          ))}
        </div>
        <p className="nb-kazalo__aside">
          <svg width="44" height="40" viewBox="0 0 44 40" aria-hidden="true">
            <Arrow
              pts={[
                [42, 6],
                [18, 8],
                [4, 30],
              ]}
              stroke="var(--pen)"
              seed={2031}
              draw
            />
          </svg>
          Predavanja idu redom, a svako ima svoju simulaciju. Nešto nije jasno? Pokvarite to i gledajte što se dogodi.
        </p>
      </div>
      <MarginDoodle kind="coffee" style={{ right: '3%', bottom: -40 }} />
    </section>
  )
}
