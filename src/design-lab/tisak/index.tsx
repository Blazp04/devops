import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/fraunces/full-italic.css'
import '@fontsource-variable/space-grotesk'
import '@fontsource/space-mono/400.css'
import '@fontsource/space-mono/700.css'
import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react'
import { InkBar, Logo, Numeral, PenMark, RegMark, RisoDefs, type Plate } from './Glyphs'
import { Hero } from './Hero'
import { LbSim } from './LbSim'
import { ClusterView } from './Cluster'
import { Steps } from './Steps'
import { CodeBlock, Terminal } from './Code'
import { Quiz } from './Quiz'
import { CoresVsRam, LessonThumb, Menza } from './Figures'
import { THEME_KEY, initialTheme, screenTile, type Theme } from './geo'
import s from './tisak.module.css'

const PAPER: Record<Theme, string> = { light: '#F1ECE1', dark: '#141317' }

/** Fixed-frequency screens (as CSS mask tiles) used by type and flat tints. */
const SCREENS = {
  '--screen-50': screenTile(0.5),
  '--screen-30': screenTile(0.3),
  '--screen-14': screenTile(0.14),
} as CSSProperties

function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const dark = theme === 'dark'
  return (
    <button
      type="button"
      className={s.toggle}
      onClick={onToggle}
      aria-pressed={dark}
      aria-label={dark ? 'Crni papir uključen — prebaci na bijeli papir' : 'Bijeli papir uključen — prebaci na crni papir'}
    >
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" className={s.toggleGlyph}>
        <circle cx="13" cy="13" r="11" className={s.toggleRing} />
        <path d="M13 2a11 11 0 0 1 0 22Z" className={s.toggleHalf} />
      </svg>
      <span className={s.toggleText}>{dark ? 'Crni papir' : 'Bijeli papir'}</span>
    </button>
  )
}

function Masthead({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return (
    <header className={s.mast}>
      <div className={s.mastRow}>
        <a className={s.brand} href="/dizajn/tisak" aria-label="Kubernetes od nule — naslovnica">
          <Logo />
          <span className={s.brandName}>
            Kubernetes <em>od nule</em>
          </span>
        </a>
        <nav className={s.nav} aria-label="Glavna navigacija">
          <a href="#sadrzaj" className={s.navLink}>
            Kurikulum
          </a>
          <a href="/pojmovnik" className={s.navLink}>
            Pojmovnik
          </a>
          <ThemeToggle theme={theme} onToggle={onToggle} />
        </nav>
      </div>
      <div className={s.folio}>
        <span>Broj 04 · Load balancer</span>
        <span className={s.folioMid}>Tiskano u tri boje · Zagreb, listopad 2026.</span>
        <InkBar />
      </div>
    </header>
  )
}

/* ---------------------------------------------------------------------------------------------
 * Section openers. Every section number is a printed plate, but no two openers are set alike:
 * the numeral moves (right rail, bleeding off the top, inline, left) and every section has its ink.
 * ------------------------------------------------------------------------------------------- */
type OpenerKind = 'right' | 'top' | 'inline' | 'left'

function Opener({
  n,
  kicker,
  title,
  id,
  kind,
  plates,
  ink,
  children,
}: {
  n: string
  kicker: string
  title: ReactNode
  id: string
  kind: OpenerKind
  plates: readonly Plate[]
  ink: 'pink' | 'blue' | 'yellow' | 'ink'
  children?: ReactNode
}) {
  return (
    <div className={`${s.opener} ${s[`op_${kind}`]}`} data-ink={ink}>
      <div className={s.opNum}>
        <Numeral text={n} plates={plates} className={s.opNumeral} />
      </div>
      <div className={s.opText}>
        <p className={s.kick}>
          <span className={s.kickN}>§ {n}</span> {kicker}
        </p>
        <h2 className={s.h2} id={id}>
          {title}
        </h2>
        {children && <div className={s.secIntro}>{children}</div>}
      </div>
    </div>
  )
}

function Term({ children, def }: { children: string; def: string }) {
  const id = useId()
  return (
    <span className={s.term}>
      <button type="button" className={s.termBtn} aria-describedby={id}>
        {children}
      </button>
      <span role="tooltip" id={id} className={s.tip}>
        <span className={s.tipHead}>Pojmovnik</span>
        <b className={s.tipTerm}>{children}</b> — {def}
      </span>
    </span>
  )
}

const LESSONS = [
  {
    n: '01',
    title: 'Klopa izlazi na internet',
    sub: 'Od laptopa u studentskom domu do prvog javnog poslužitelja.',
    min: 20,
    state: 'done',
  },
  {
    n: '02',
    title: 'Ručak u 12:00: granice jednog poslužitelja',
    sub: 'Što se dogodi kad cijela menza naruči u istoj minuti.',
    min: 30,
    state: 'done',
  },
  {
    n: '03',
    title: 'Jači ili više? Vertikalno i horizontalno skaliranje',
    sub: 'Jači poslužitelj ima strop, a dodavanje novih nema.',
    min: 25,
    state: 'done',
  },
  {
    n: '04',
    title: 'Load balancer: tko dijeli promet?',
    sub: 'Više poslužitelja vrijedi samo ako netko pametno dijeli zahtjeve.',
    min: 35,
    state: 'here',
  },
  {
    n: '05',
    title: 'Stanje i sesije: gdje je moja košarica?',
    sub: 'Zašto poslužitelji iza load balancera ne smiju pamtiti studente.',
    min: 30,
    state: 'next',
  },
] as const

/** done = printed in grey with the reader's tick; here = the only numeral in full ink; next = not printed yet (keyline proof) */
function Contents() {
  return (
    <section className={s.toc} id="sadrzaj" aria-labelledby="tk-toc-title">
      <div className={s.tocHead}>
        <p className={s.kick}>Kurikulum · sadržaj modula</p>
        <h2 className={s.tocTitle} id="tk-toc-title">
          <span className={s.tocMod}>Modul 1 ·</span> Zašto raspodijeljeni sustavi
        </h2>
        <p className={s.tocDek}>Šest modula, 24 predavanja. Prvi modul počinje jednim poslužiteljem i završava pitanjem gdje živi stanje kad poslužitelja ima više.</p>
      </div>
      <ol className={s.tocList}>
        {LESSONS.map((l) => (
          <li key={l.n} className={s.tocRow} data-state={l.state} aria-current={l.state === 'here' ? 'page' : undefined}>
            <span className={s.tocN} data-n={l.n}>
              {l.n}
            </span>
            <LessonThumb n={l.n} className={s.tocThumb} />
            <div className={s.tocBody}>
              <h3 className={s.tocLesson}>
                <a href={l.state === 'here' ? '#predavanje' : '#sadrzaj'}>{l.title}</a>
              </h3>
              <p className={s.tocSub}>{l.sub}</p>
            </div>
            <span className={s.tocDur}>{l.min} min</span>
            <span className={s.tocState}>
              {l.state === 'done' && (
                <>
                  <PenMark kind="check" w={34} h={26} seed={Number(l.n) + 4} className={s.tocCheck} />
                  <span>završeno</span>
                </>
              )}
              {l.state === 'here' && <span className={s.htmlStamp}>u ovom broju</span>}
              {l.state === 'next' && <span className={s.tocNext}>sljedeći broj</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

const GOALS = [
  'objasniti zašto za horizontalno skaliranje treba load balancer',
  'razlikovati ulogu procesora i RAM-a na poslužitelju',
  'usporediti kružno raspoređivanje i „najmanje aktivnih veza”',
] as const

/** Objectives as a perforated tear-off slip; the reader ticks what they can already do (pen = reader). */
function Coupon() {
  const [ticked, setTicked] = useState<readonly boolean[]>([false, false, false])
  return (
    <aside className={s.coupon} aria-labelledby="tk-goals">
      <svg className={s.scissors} width="34" height="22" viewBox="0 0 34 22" aria-hidden="true">
        <circle cx="6" cy="5" r="4.2" />
        <circle cx="6" cy="17" r="4.2" />
        <path d="M9.5 7.2 33 17M9.5 14.8 33 5" />
      </svg>
      <div className={s.couponHead}>
        <p className={s.couponLabel} id="tk-goals">
          Odrezak · nakon predavanja moći ćete
        </p>
        <p className={s.couponNo}>Broj 04</p>
      </div>
      <ol className={s.couponList}>
        {GOALS.map((goal, i) => (
          <li key={goal} className={s.couponItem} data-ink={(['pink', 'blue', 'yellow'] as const)[i]}>
            <span className={s.couponN} aria-hidden="true">
              {i + 1}
            </span>
            <p className={s.couponText}>{goal}</p>
            <button
              type="button"
              className={s.tick}
              aria-pressed={ticked[i]}
              onClick={() => setTicked((t) => t.map((v, k) => (k === i ? !v : v)))}
            >
              <span className={s.tickBox} aria-hidden="true">
                {ticked[i] && <PenMark kind="check" w={30} h={26} seed={20 + i} className={s.tickPen} />}
              </span>
              mogu
              <span className={s.srOnly}> {goal}</span>
            </button>
          </li>
        ))}
      </ol>
    </aside>
  )
}

function LectureHead() {
  return (
    <header className={s.lec} id="predavanje" aria-labelledby="tk-lec-title">
      <p className={`${s.kick} ${s.lecKick}`}>
        <span className={s.kickN}>Predavanje 04</span> Modul 1 · Zašto raspodijeljeni sustavi
      </p>
      <div className={s.lecStage}>
        <Numeral
          text="04"
          className={s.lecNum}
          pitch={5.6}
          plates={[{ ink: 'yellow', mode: 'screen', ramp: [1, 0.07], from: 'left', angle: 15, ease: 0.62 }]}
        />
        <h2 className={`${s.lecTitle} ${s.knock}`} id="tk-lec-title">
          Load balancer: <em>tko dijeli promet?</em>
        </h2>
        <p className={`${s.lecSub} ${s.knock}`}>Više poslužitelja vrijedi samo ako netko pametno dijeli zahtjeve.</p>
        <dl className={`${s.lecMeta} ${s.knock}`}>
          <div>
            <dt>Trajanje</dt>
            <dd>≈ 35 min</dd>
          </div>
          <div>
            <dt>Dijelova</dt>
            <dd>6</dd>
          </div>
          <div>
            <dt>Predznanje</dt>
            <dd>Predavanja 01–03</dd>
          </div>
        </dl>
      </div>
      <Coupon />
    </header>
  )
}

function Story() {
  return (
    <section className={`${s.sec} ${s.secPink}`} aria-labelledby="tk-s1">
      <Opener
        n="01"
        kicker="Priča"
        title="Podne u menzi"
        id="tk-s1"
        kind="right"
        ink="pink"
        plates={[
          { ink: 'pink', mode: 'solid' },
          { ink: 'blue', mode: 'screen', ramp: [0.62, 0.08], from: 'left', angle: 75, dx: 0.035, dy: 0.03 },
        ]}
      />

      <div className={s.storyGrid}>
        <figure className={s.pull} aria-label="Izdvojeni citat">
          <blockquote className={s.pullQuote}>
            <p>
              <span className={s.pullMark}>„</span>U 12:00 tristo studenata otvara Klopu u istoj minuti.”
            </p>
          </blockquote>
        </figure>
        <div className={s.prose}>
          <p className={s.dropcap}>
            U 11:58 menza je još poluprazna. U 12:00 završava predavanje iz Operacijskih sustava i tristo studenata u istoj
            minuti otvara Klopu da vidi današnji meni i rezervira ručak. Poslužitelj koji je cijelo jutro odgovarao za
            dvadeset milisekundi odjednom treba dvije sekunde, a zatim prestaje odgovarati.
          </p>
          <p>
            Prvi refleks je kupiti jači poslužitelj. Drugi, dugoročno pametniji, je dodati još dva. Tada netko mora
            odlučiti koji zahtjev ide na koji poslužitelj. Taj netko je{' '}
            <Term def="komponenta koja prima sve dolazne zahtjeve i raspoređuje ih na više poslužitelja prema odabranom pravilu.">
              load balancer
            </Term>
            , a pravilo po kojem dijeli promet odlučuje hoće li ručak stići na vrijeme.
          </p>
        </div>
      </div>

      <aside className={s.key} aria-label="Ključna ideja">
        <p className={s.keyLabel}>
          <span className={s.keyDot} aria-hidden="true" /> Ključna ideja
        </p>
        <blockquote className={s.keyQuote}>
          <p>
            <span className={s.markBlue}>Jezgre određuju propusnost</span>, a{' '}
            <span className={s.markYellow}>RAM određuje koliko zahtjeva istodobno stane</span>.
          </p>
        </blockquote>
        <CoresVsRam />
      </aside>

      <div className={s.analogy}>
        <div className={s.analogyArt}>
          <Menza />
        </div>
        <div className={s.analogyText}>
          <p className={s.blockLabel}>Analogija · menza</p>
          <p>
            Menza ima jedan ulaz i nekoliko pultova za posluživanje. Na ulazu stoji osoba koja svakog studenta pošalje
            prema jednom pultu: to je load balancer. Pultovi su poslužitelji. Što više kuharica radi za pultom, to brže
            red napreduje (jezgre); što je više mjesta za čekanje ispred pulta, to više ljudi stane u red (RAM).
          </p>
          <p className={s.notHere}>
            <span className={s.notHereMark} aria-hidden="true">
              ≠
            </span>
            <span>
              <strong>Gdje analogija ne vrijedi:</strong> student vidi redove i sam odabere kraći, a zahtjev ne vidi ništa.
              Ide točno onamo kamo ga load balancer pošalje, zato je pravilo raspoređivanja toliko važno.
            </span>
          </p>
        </div>
      </div>

      <div className={s.mf}>
        <div className={s.mfMyth}>
          <span className={`${s.htmlStamp} ${s.stampOnPink}`}>Mit</span>
          <p className={s.mythClaim}>
            {['Više RAM-a znači', 'brži poslužitelj.'].map((line, i) => (
              <span key={line} className={s.strike}>
                {line}
                <PenMark kind="strike" w={300} h={24} seed={9 + i} delay={0.2 + i * 0.4} className={s.strikePen} />
              </span>
            ))}
          </p>
        </div>
        <div className={s.mfFact}>
          <span className={`${s.htmlStamp} ${s.stampOnBlue}`}>Činjenica</span>
          <p>
            RAM ne ubrzava obradu: on određuje koliko zahtjeva i podataka istodobno stane u memoriju. Brzinu obrade
            određuju jezgre. Više RAM-a pomaže tek kad ga ponestaje, jer tada poslužitelj počne odbijati zahtjeve ili
            prebacivati memoriju na disk.
          </p>
        </div>
      </div>
    </section>
  )
}

function Centrefold() {
  return (
    <section className={s.fold} aria-labelledby="tk-s2">
      <div className={s.foldInner}>
        <Numeral
          text="02"
          className={s.foldNum}
          pitch={6.5}
          plates={[{ ink: 'paper', mode: 'screen', ramp: [0.4, 0.02], from: 'top', angle: 15, over: false }]}
        />
        <div className={`${s.foldHead} ${s.knock}`}>
          <p className={s.foldKick}>
            <span className={s.foldKickN}>§ 02</span> Simulacija · središnja dvostrana
          </p>
          <h2 className={`${s.h2} ${s.foldTitle}`} id="tk-s2">
            Tri poslužitelja, <em>jedan ulaz</em>
          </h2>
          <p className={s.foldIntro}>
            Pojačajte promet i pratite Malog. Zatim promijenite pravilo raspoređivanja i srušite Veliki: load balancer to
            neće primijetiti odmah.
          </p>
        </div>
        <LbSim />
      </div>
    </section>
  )
}

/** Fills the band between the exam sheet and the colophon: the next issue, not printed yet (keyline only). */
function NextIssue() {
  return (
    <aside className={s.nextIssue} aria-labelledby="tk-next">
      <Numeral text="05" className={s.nextNum} plates={[{ ink: 'ink', mode: 'outline' }]} />
      <div className={s.nextText}>
        <p className={s.kick}>
          <span className={s.kickN}>Sljedeći broj</span> u pripremi
        </p>
        <p className={s.nextTitle} id="tk-next">
          Stanje i sesije: <em>gdje je moja košarica?</em>
        </p>
        <p className={s.nextDek}>
          Load balancer sad šalje svaki zahtjev bilo kojem poslužitelju. Što se dogodi s rezervacijom ručka koja je ostala
          zapisana na Malom?
        </p>
      </div>
      <a className={s.nextLink} href="#sadrzaj">
        Sadržaj modula
        <svg width="34" height="14" viewBox="0 0 34 14" aria-hidden="true">
          <path d="M0 7h30M24 1l6 6-6 6" />
        </svg>
      </a>
    </aside>
  )
}

const INKS = [
  { name: 'Fluorescentna ružičasta', use: 'zahtjevi, greške, olovka čitatelja', cls: 'chipPink' },
  { name: 'Federalna plava', use: 'rad: jezgre, poslužitelji, Podovi v1, uspjeh', cls: 'chipBlue' },
  { name: 'Suncokret', use: 'kapacitet i usmjeravanje: RAM, load balancer, v2', cls: 'chipYellow' },
] as const

function Colophon({ theme }: { theme: Theme }) {
  return (
    <footer className={s.colophon}>
      <div className={s.colGrid}>
        <div className={s.colIssue}>
          <p className={s.colLabel}>Impressum</p>
          <p className={s.colBig}>
            Broj <b>04</b>
            <span>/ 24</span>
          </p>
          <p className={s.colText}>
            <em>Kubernetes od nule</em> je besplatan tečaj za studente računarstva: 24 predavanja, od jednog poslužitelja do
            GitOpsa.
          </p>
        </div>
        <dl className={s.colSpecs}>
          <div>
            <dt>Tisak</dt>
            <dd>rizograf, tri spot boje + crna</dd>
          </div>
          <div>
            <dt>Papir</dt>
            <dd>{theme === 'dark' ? 'crni karton, 250 g/m²' : 'nepremazani, 120 g/m²'}</dd>
          </div>
          <div>
            <dt>Slova</dt>
            <dd>{'Fraunces · Space\u00a0Grotesk · Space\u00a0Mono'}</dd>
          </div>
          <div>
            <dt>Mjesto</dt>
            <dd>Zagreb, listopad 2026.</dd>
          </div>
        </dl>
        <div className={s.colInks}>
          <svg className={s.venn} viewBox="0 0 220 190" aria-hidden="true">
            <circle cx="78" cy="72" r="62" className={`${s.vPink} ${s.vOver}`} />
            <circle cx="142" cy="72" r="62" className={`${s.vBlue} ${s.vOver}`} />
            <circle cx="110" cy="124" r="62" className={`${s.vYellow} ${s.vOver}`} />
          </svg>
          <ul className={s.inkList}>
            {INKS.map((k) => (
              <li key={k.name}>
                <i className={s[k.cls]} aria-hidden="true" />
                <span>
                  <b>{k.name}</b> {k.use}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className={s.colStrip}>
        <RegMark />
        <span className={s.colCopy}>
          © 2026 Kubernetes od nule · Broj 04 od 24 · ovaj list nije za recikliranje dok ne naučite load balancing
        </span>
        <InkBar />
        <RegMark />
      </div>
      <p className={s.footGiant} aria-hidden="true">
        od nule
      </p>
    </footer>
  )
}

export default function TisakPage() {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => {
    const body = document.body
    const prev = body.style.backgroundColor
    body.style.backgroundColor = PAPER[theme]
    return () => {
      body.style.backgroundColor = prev
    }
  }, [theme])

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      // storage blocked — the toggle still works for this visit
    }
  }

  return (
    <div className={s.root} data-theme={theme} style={SCREENS}>
      <RisoDefs />
      <div className={s.wrap}>
        <Masthead theme={theme} onToggle={toggle} />
        <main>
          <Hero />
          <Contents />
          <LectureHead />
          <Story />
          <Centrefold />

          <section className={`${s.sec} ${s.secYellow} ${s.secBleed}`} aria-labelledby="tk-s3">
            <Opener
              n="03"
              kicker="Isto, u Kubernetesu"
              title="Service dijeli promet Podovima"
              id="tk-s3"
              kind="top"
              ink="yellow"
              plates={[{ ink: 'yellow', mode: 'screen', ramp: [1, 0.1], from: 'bottom', angle: 15 }]}
            >
              <p>
                U klasteru ulogu load balancera preuzima Service. On ne zna za poslužitelje, nego bira Podove po oznaci i
                promet šalje samo onima koji su spremni.
              </p>
            </Opener>
            <ClusterView />
          </section>

          <section className={`${s.sec} ${s.secInk}`} aria-labelledby="tk-s4">
            <Opener
              n="04"
              kicker="Korak po korak · strip u tri sličice"
              title="Put jednog zahtjeva"
              id="tk-s4"
              kind="inline"
              ink="ink"
              plates={[
                { ink: 'pink', mode: 'solid', dx: 0.04, dy: 0.035 },
                { ink: 'ink', mode: 'solid' },
              ]}
            />
            <Steps />
          </section>

          <section className={`${s.sec} ${s.secBlue}`} aria-labelledby="tk-s5">
            <Opener
              n="05"
              kicker="Kod"
              title="Tri replike u jednoj datoteci"
              id="tk-s5"
              kind="left"
              ink="blue"
              plates={[
                { ink: 'yellow', mode: 'screen', ramp: [0.9, 0.25], from: 'left', angle: 15, dx: -0.03, dy: 0.035 },
                { ink: 'blue', mode: 'outline' },
              ]}
            >
              <p>
                Deployment opisuje <em>što</em> želite: tri jednake kopije aplikacije. Kubernetes se brine da ih uvijek
                bude tri, a Service zna gdje su.
              </p>
            </Opener>
            <div className={s.codeGrid}>
              <CodeBlock />
              <Terminal />
            </div>
          </section>

          <section className={`${s.sec} ${s.secPink}`} aria-labelledby="tk-s6">
            <Opener
              n="06"
              kicker="Provjera"
              title="Jeste li razumjeli?"
              id="tk-s6"
              kind="right"
              ink="pink"
              plates={[{ ink: 'pink', mode: 'screen', ramp: [0.95, 0.18], from: 'bottom', angle: 75 }]}
            />
            <Quiz />
          </section>
          <NextIssue />
        </main>
        <Colophon theme={theme} />
      </div>
    </div>
  )
}
