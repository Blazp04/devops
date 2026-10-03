import '@fontsource-variable/bricolage-grotesque/standard.css'
import '@fontsource-variable/newsreader/opsz.css'
import '@fontsource-variable/newsreader/opsz-italic.css'
import '@fontsource-variable/caveat'
import '@fontsource/kalam/400.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import { useTheme } from '../../shell/theme'
import { Header } from './Header'
import { Hero } from './Hero'
import { Curriculum, LectureHeader, Prose, Glossary, Footer } from './Lesson'
import { LbSimSection } from './LbSim'
import { ClusterSection } from './Cluster'
import { StepperSection } from './Stepper'
import { CodeSection, QuizSection } from './CodeQuiz'
import { MarginDoodle } from './Bits'
import s from './bj.module.css'

/**
 * Design direction "Bilježnica": the course as a student's illustrated notebook.
 * Light = warm paper on a desk, dark = a chalkboard on the wall.
 */
export default function Biljeznica() {
  const { resolved, toggle } = useTheme()
  const dark = resolved === 'dark'
  return (
    <div className={s.root} data-theme={resolved}>
      <div className={s.sheet}>
        <Header dark={dark} onToggle={toggle} />
        <main>
          <Hero />
          <Curriculum />
          <LectureHeader />
          <Prose />
          <div className={s.gapDoodles} aria-hidden="true">
            <MarginDoodle kind="bang" style={{ right: '9%', top: 6 }} />
          </div>
          <LbSimSection />
          <ClusterSection />
          <div className={s.gapDoodles} aria-hidden="true">
            <MarginDoodle kind="peek" style={{ right: -10, top: -6 }} />
          </div>
          <StepperSection />
          <CodeSection />
          <div className={s.gapDoodles} aria-hidden="true">
            <MarginDoodle kind="stars" style={{ left: '46%', top: 4 }} />
          </div>
          <QuizSection />
          <Glossary />
        </main>
        <Footer />
      </div>
    </div>
  )
}
