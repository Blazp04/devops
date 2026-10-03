import '@fontsource/barlow-condensed/500.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/400-italic.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import '@fontsource-variable/caveat'
import { useTheme } from '../../shell/theme'
import { Footer, Header, Part, SheetBreak, TopRail } from './Chrome'
import { Hero } from './Hero'
import { Register, TitleBlock } from './Lecture'
import { SecHead, Story, Term } from './Story'
import { LbSim } from './LbSim'
import { Cluster } from './Cluster'
import { Legend } from './Legend'
import { Stepper } from './Stepper'
import { CodeSheet, Printout } from './Spec'
import { Quiz } from './Quiz'
import s from './nacrt.module.css'

/**
 * Design direction "Nacrt": the course as an engineering project, every page a technical drawing.
 * Served at /dizajn/nacrt.
 */
export default function NacrtPage() {
  const { resolved, toggle } = useTheme()
  return (
    <div className={s.root} data-theme={resolved}>
      <Header theme={resolved} onToggle={toggle} />
      <div className={s.sheet}>
        <TopRail />
        <main className={s.main}>
          <Part sheet="00 · 1/1">
            <Hero />
            <Register />
          </Part>

          <SheetBreak label="List 04 · load balancer · 6 listova" />
          <Part sheet="04 · 1/6">
            <TitleBlock />
            <Story />
          </Part>

          <Part sheet="04 · 2/6">
            <section className={s.section} id="simulacija" aria-labelledby="sim-title">
              <SecHead n="02" sheet="2/6" kicker="Simulacija · detalj A" title="Probajte sami: tko dijeli promet?" id="sim-title" />
              <p className={s.lede}>
                Pojačajte promet na ravnalu na 22 zahtjeva/s i pratite koji se poslužitelj prvi zaguši i kako raste <Term n={3}>p95</Term>.
                Zatim okrenite preklopnik algoritma. Na kraju srušite Veliki jezičcem na njegovu kućištu i gledajte koliko treba{' '}
                <Term n={2}>provjeri zdravlja</Term> da to primijeti.
              </p>
              <LbSim />
              <Legend />
            </section>
          </Part>

          <Part sheet="04 · 3/6">
            <section className={s.section} id="klaster" aria-labelledby="klaster-title">
              <SecHead n="03" sheet="3/6" kicker="Pogled na klaster · detalj B" title="Isto, ali u Kubernetesu" id="klaster-title" />
              <p className={s.lede}>
                Unutar klastera posao load balancera preuzima <Term n={5}>Service</Term>. Promet ne šalje na poslužitelje, nego na{' '}
                <Term n={4}>Podove</Term> s oznakom app=klopa-api, i to samo na one koji su spremni (Ready): ostalima je zasun zatvoren.
              </p>
              <Cluster />
            </section>
          </Part>

          <Part sheet="04 · 4/6">
            <section className={s.section} id="korak" aria-labelledby="korak-title">
              <SecHead n="04" sheet="4/6" kicker="Korak po korak" title="Put jednog zahtjeva" id="korak-title" />
              <Stepper />
            </section>
          </Part>

          <Part sheet="04 · 5/6">
            <section className={s.section} id="specifikacija" aria-labelledby="spec-title">
              <SecHead n="05" sheet="5/6" kicker="Specifikacija · list K-01" title={<>Deployment za <span className={s.nowrap}>klopa-api</span></>} id="spec-title" />
              <p className={s.lede}>
                Ovako se Klopa opisuje Kubernetesu: <Term n={6}>Deployment</Term> kaže koliko kopija, koja slika i koliko resursa.
                Kubernetes zatim sam održava to stanje.
              </p>
              <div className={s.codeGrid}>
                <CodeSheet />
                <Printout />
              </div>
            </section>
          </Part>

          <Part sheet="04 · 6/6">
            <section className={s.section} id="provjera" aria-labelledby="provjera-title">
              <SecHead n="06" sheet="6/6" kicker="Provjera" title="Provjerite razumijevanje" id="provjera-title" />
              <Quiz />
            </section>
          </Part>
        </main>
        <Footer />
      </div>
    </div>
  )
}
