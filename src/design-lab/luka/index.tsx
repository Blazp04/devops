/**
 * Design direction "Luka": the course as an isometric container port.
 * Route: /dizajn/luka (outside the site shell — this page owns the whole viewport).
 *
 * Layout uses two measures only: a reading column (prose, key idea, myth, quiz) and the full stage (everything
 * with a drawing). The cluster view breaks out of both as a full-bleed night spread.
 */
import '@fontsource/saira-stencil-one/400.css'
import '@fontsource-variable/big-shoulders-display'
import '@fontsource-variable/archivo/wdth.css'
import '@fontsource-variable/martian-mono/wdth.css'
import { useState } from 'react'
import { useTheme } from '../../shell/theme'
import { viewBoxFor } from './iso-math'
import { Container } from './iso'
import { HeroPort } from './HeroPort'
import { Analogy, Board, KeyIdea, LectureHeader, Myth, SecHead, Term } from './Blocks'
import { LoadBalancerSim } from './LoadBalancerSim'
import { ClusterView } from './ClusterView'
import { StepThrough } from './StepThrough'
import { CodeBlock, TerminalBlock } from './CodeSamples'
import { Quiz } from './Quiz'
import { Skyline } from './Skyline'
import { Grammar } from './Grammar'
import s from './luka.module.css'

const LOGO_VB = viewBoxFor(0, 1.6, 0, 0.75, 0.8, 2)

function Logo() {
  return (
    <svg viewBox={LOGO_VB} aria-hidden="true">
      <Container x={0} y={0} len={1.6} wid={0.75} hei={0.8} c="var(--orange)" />
    </svg>
  )
}

function ShiftToggle() {
  const { resolved, toggle } = useTheme()
  const night = resolved === 'dark'
  return (
    <button
      type="button"
      className={s.toggle}
      onClick={toggle}
      aria-pressed={night}
      aria-label={night ? 'Noćna smjena (tamna tema) · prebaci na dnevnu' : 'Dnevna smjena (svijetla tema) · prebaci na noćnu'}
    >
      <span className={s.tSide} data-on={night ? undefined : '1'}>
        <i aria-hidden="true" />
        <span className={s.tWord}>Dan</span>
      </span>
      <span className={s.tTrack} aria-hidden="true">
        <span className={s.tLever} />
      </span>
      <span className={s.tSide} data-on={night ? '1' : undefined}>
        <span className={s.tWord}>Noć</span>
        <i aria-hidden="true" />
      </span>
    </button>
  )
}

function Header() {
  const [open, setOpen] = useState(false)
  return (
    <header className={s.hdr}>
      <div className={`${s.wrap} ${s.hdrIn}`}>
        <a className={s.brand} href="#vrh">
          <Logo />
          <span className={s.brandText}>
            Kubernetes <span>od nule</span>
          </span>
        </a>
        <nav className={s.nav} aria-label="Glavna navigacija" data-open={open ? '1' : undefined}>
          <a href="#kurikulum" onClick={() => setOpen(false)}>
            Kurikulum
          </a>
          <a href="/pojmovnik" onClick={() => setOpen(false)}>
            Pojmovnik
          </a>
        </nav>
        <button type="button" className={s.menuBtn} aria-expanded={open} onClick={() => setOpen(!open)}>
          <svg viewBox="0 0 20 16" aria-hidden="true">
            {open ? (
              <path d="M3 2l14 12M17 2 3 14" stroke="currentColor" strokeWidth="2.6" fill="none" />
            ) : (
              <path d="M1 2h18M1 8h18M1 14h18" stroke="currentColor" strokeWidth="2.6" fill="none" />
            )}
          </svg>
          Izbornik
        </button>
        <ShiftToggle />
      </div>
    </header>
  )
}

function ArrowGlyph() {
  return (
    <svg viewBox="0 0 26 18" aria-hidden="true">
      <path d="M0 9h20" stroke="currentColor" strokeWidth="3" />
      <path d="M13 2l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="3" />
    </svg>
  )
}

function Hero() {
  return (
    <section className={s.hero} id="vrh" aria-labelledby="naslov">
      <div className={`${s.wrap} ${s.heroHead}`}>
        <span className={s.kicker}>
          <i />
          Interaktivni tečaj · luka Klopa
        </span>
        <h1 className={s.heroTitle} id="naslov">
          <span>Kubernetes</span> <span className={s.accent}>od nule</span>
        </h1>
      </div>
      <div className={`${s.wrap} ${s.stage}`}>
        <div className={s.copy}>
          <p className={s.tagline}>Od jednog poslužitelja do platforme koja se sama popravlja.</p>
          <p className={s.lede}>
            Pratimo studentsku menzu Klopa od prvog poslužitelja do klastera koji preživi podnevnu gužvu. Svaki pojam — load balancer,
            kontejner, Pod, pipeline — upoznat ćete kroz simulaciju koju možete pokrenuti, srušiti i popraviti.
          </p>
          <div className={s.ctaRow}>
            <a className={s.cta} href="#kurikulum">
              Kreni od početka
              <ArrowGlyph />
            </a>
            <a className={s.ghostLink} href="#simulacija">
              Pogledaj simulaciju
            </a>
          </div>
        </div>
        <div className={s.heroArt}>
          <HeroPort />
        </div>
      </div>
    </section>
  )
}

const DEPARTURES = [
  { n: '01', to: 'Kurikulum', href: '#kurikulum', note: '24 predavanja · od nule do GitOpsa' },
  { n: '02', to: 'Pojmovnik', href: '/pojmovnik', note: 'od API servera do Volumea' },
  { n: '03', to: 'Simulacija', href: '#simulacija', note: 'rampa · terminal Klopa' },
]

function Footer() {
  return (
    <footer className={s.footer}>
      <div className={s.skyline}>
        <Skyline />
      </div>
      <div className={s.wrap}>
        <div className={s.departures}>
          <div className={s.depHead}>
            <span>Odlasci</span>
            <span>vez · odredište</span>
          </div>
          <ul>
            {DEPARTURES.map((d) => (
              <li key={d.n}>
                <a href={d.href}>
                  <span className={s.flap} aria-hidden="true">
                    <span>{d.n[0]}</span>
                    <span>{d.n[1]}</span>
                  </span>
                  <span className={s.depTo}>
                    {d.to}
                    <small>{d.note}</small>
                  </span>
                  <span className={s.depGo} aria-hidden="true">
                    <ArrowGlyph />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className={s.footBase}>
          <span className={s.footBrand}>Kubernetes od nule</span>
          <span>Interaktivna predavanja iz raspodijeljenih sustava, Dockera, Kubernetesa, CI/CD-a i Argo CD-a. Sadržaj provjeren u listopadu 2026.</span>
        </div>
      </div>
    </footer>
  )
}

export default function LukaPage() {
  const { resolved } = useTheme()
  return (
    <div className={s.root} data-theme={resolved}>
      <Header />
      <main>
        <Hero />

        <section className={`${s.section} ${s.wrap}`} id="kurikulum" aria-labelledby="kurikulum-h">
          <SecHead berth="Kurikulum" title="Raspored pristajanja" id="kurikulum-h" lede="Svako predavanje pristaje na svoj vez. Završena svijetle zeleno; sljedeće treperi." />
          <Board />
        </section>

        <section className={`${s.section} ${s.wrap}`} id="predavanje" aria-label="Predavanje 04">
          <LectureHeader />
        </section>

        <section className={`${s.section} ${s.wrap}`} aria-labelledby="podne-h">
          <SecHead berth="Vez 01" note="/ 06" title="Podne u menzi" id="podne-h" />
          <div className={`${s.prose} ${s.read}`}>
            <p>
              U <span className={s.clock}>11:58</span> Klopa je mirna: nekoliko studenata pregledava jelovnik, a jedan poslužitelj odgovara bez
              napora. U <span className={s.clock}>12:00</span> završavaju predavanja i u istoj minuti stotine mobitela traže današnji meni,
              rezervaciju stola i QR kod za plaćanje. Jedan poslužitelj više ne stiže — odgovori kasne, a neki ne stignu nikad.
            </p>
            <p>
              Kupili smo još dva poslužitelja, ali studenti i dalje dolaze na <strong>jednu adresu</strong>. Netko na ulazu mora odlučiti koji
              poslužitelj dobiva koji zahtjev. Taj posao radi{' '}
              <Term
                title="Load balancer"
                def="Komponenta koja prima sve dolazne zahtjeve na jednoj adresi i raspoređuje ih na više poslužitelja; one koji ne prođu provjeru zdravlja privremeno izostavlja."
              >
                load balancer
              </Term>
              , a kako ga postavimo odlučuje hoće li tri poslužitelja raditi kao tim ili će se jedan gušiti dok drugi čekaju.
            </p>
          </div>
          <KeyIdea>
            <u>Jezgre</u> određuju propusnost, a <u>RAM</u> određuje koliko zahtjeva istodobno stane.
          </KeyIdea>
          <Analogy />
          <Myth />
        </section>

        <section className={`${s.section} ${s.wrap}`} id="simulacija" aria-labelledby="sim-h">
          <SecHead
            berth="Vez 02"
            note="/ 06"
            title="Rampa koja dijeli promet"
            id="sim-h"
            lede="Pojačajte promet na „12:00” i promatrajte Malog s kružnim raspoređivanjem. Zatim prebacite na „najmanje aktivnih veza” i srušite Velikog."
          />
          <LoadBalancerSim />
        </section>

        <section className={s.spread} id="klaster" aria-labelledby="klaster-h" data-theme="dark">
          <div className={s.wrap}>
            <SecHead
              berth="Vez 03"
              note="/ 06 · noćna smjena"
              title="Isti posao, ali u klasteru"
              id="klaster-h"
              lede="Kubernetes radi ono što je rampa radila ručno: kontrolni toranj odlučuje gdje će kontejneri stajati, ponovno pokreće one koji padnu, a Service šalje promet samo spremnim Podovima."
            />
          </div>
          <ClusterView />
        </section>

        <section className={`${s.section} ${s.wrap}`} id="koraci" aria-labelledby="koraci-h">
          <SecHead berth="Vez 04" note="/ 06" title="Put jednog zahtjeva" id="koraci-h" />
          <StepThrough />
        </section>

        <section className={`${s.section} ${s.wrap}`} id="manifest" aria-labelledby="manifest-h">
          <SecHead
            berth="Vez 05"
            note="/ 06"
            title="Teretni list za Kubernetes"
            id="manifest-h"
            lede="Deployment je teretni list: opisuje koju sliku kontejnera želite i koliko primjeraka. Kubernetes se brine da ih toliko uvijek i radi."
          />
          <div className={s.codeGrid}>
            <CodeBlock />
            <TerminalBlock />
          </div>
        </section>

        <section className={`${s.section} ${s.wrap}`} id="provjera" aria-labelledby="provjera-h">
          <SecHead berth="Vez 06" note="/ 06" title="Provjera znanja" id="provjera-h" />
          <Quiz />
        </section>

        <section className={`${s.section} ${s.wrap}`} id="abeceda" aria-labelledby="abeceda-h">
          <SecHead
            berth="Dodatak"
            note="ilustracijska gramatika"
            title="Abeceda luke"
            id="abeceda-h"
            lede="Isti primitivi crtaju svaki pojam tečaja — od jednog zahtjeva do GitOpsa, u istom mjerilu. Tko jednom nauči čitati luku, čita sva predavanja."
          />
          <Grammar />
        </section>
      </main>
      <Footer />
    </div>
  )
}
