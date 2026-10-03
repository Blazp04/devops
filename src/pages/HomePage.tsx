import { Link } from 'react-router'
import { COURSE, LECTURES, MODULES } from '../curriculum/data'
import { lecturePath } from '../curriculum/registry'
import { useProgress } from '../curriculum/progress'
import { Arrow, Rough } from '../kit'
import { CourseMap } from './home/CourseMap'
import { HeroStrip } from './home/HeroStrip'
import { Kazalo } from './home/Kazalo'
import { usePageTitle } from '../shell/usePageTitle'

/** The notebook's cover: the course title with "od nule" circled in red, the course map, the comic strip, the index. */
export function HomePage() {
  usePageTitle()
  const progress = useProgress()
  const totalMin = LECTURES.reduce((s, l) => s + l.durationMin, 0)
  const doneCount = LECTURES.filter((l) => progress[l.slug]?.completed).length
  const nextUp = LECTURES.find((l) => !progress[l.slug]?.completed) ?? LECTURES[0]
  const currentModule = nextUp?.module ?? MODULES[0].id
  const current = Math.max(0, MODULES.findIndex((m) => m.id === currentModule))
  const [first, ...rest] = COURSE.title.split(' ')

  return (
    <div className="nb-home">
      <section className="nb-cover" aria-labelledby="naslov">
        <div className="nb-cover__head">
          <p className="nb-cover__kicker">bilježnica br. 1 · raspodijeljeni sustavi</p>
          <h1 className="nb-cover__title" id="naslov">
            {first}{' '}
            <span className="nb-cover__hand">
              {rest.join(' ')}
              <svg viewBox="0 0 200 80" preserveAspectRatio="none" aria-hidden="true">
                <Rough shape={{ k: 'ellipse', cx: 100, cy: 41, w: 190, h: 70 }} seed={1401} stroke="var(--red)" strokeWidth={2.4} multi roughness={1.6} draw="mount" duration={0.9} delay={0.4} />
              </svg>
            </span>
          </h1>
        </div>
        <div className="nb-cover__lead">
          <p className="nb-cover__tagline">{COURSE.tagline}</p>
          <p className="nb-cover__desc">
            Pratimo Klopu, studentsku aplikaciju za naručivanje ručka u menzi, od prvog poslužitelja ispod Lanina stola do Kubernetes klastera koji preživi podnevnu gužvu. Svaki pojam
            prvo nacrtamo, zatim ga namjerno pokvarimo u simulaciji, a tek onda pišemo YAML.
          </p>
          {nextUp && (
            <div className="nb-cta-row">
              <Link className="nb-cta" to={lecturePath(nextUp)}>
                <svg viewBox="0 0 240 64" preserveAspectRatio="none" aria-hidden="true">
                  <Rough shape={{ k: 'rect', x: 4, y: 4, w: 232, h: 56 }} seed={1410} stroke="var(--ink)" strokeWidth={2} fillColor="var(--ink)" fillStyle="solid" roughness={1.2} />
                </svg>
                {doneCount > 0 ? 'Nastavi' : 'Kreni od početka'}
                <span aria-hidden="true">→</span>
              </Link>
              <span className="nb-cta-note">
                <svg width="54" height="30" viewBox="0 0 54 30" aria-hidden="true">
                  <Arrow
                    pts={[
                      [52, 22],
                      [30, 26],
                      [6, 14],
                    ]}
                    stroke="var(--ink-2)"
                    seed={1420}
                    draw
                    delay={1}
                  />
                </svg>
                {nextUp.id} · {nextUp.title} · {nextUp.durationMin} min
              </span>
            </div>
          )}
        </div>
        <figure className="nb-cover__map">
          <CourseMap current={current} lectures={LECTURES.length} minutes={totalMin} />
        </figure>
        <HeroStrip />
      </section>
      <Kazalo progress={progress} nextSlug={nextUp?.slug} currentModule={currentModule} />
    </div>
  )
}
