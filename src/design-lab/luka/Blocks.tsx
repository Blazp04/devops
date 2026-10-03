import { Fragment, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { usePrefersReducedMotion } from './useLoop'
import { iso, vbOf, vbStr, viewBoxFor, type V3, type VB } from './iso-math'
import { Box, Container, FaceText, Paint, Person } from './iso'
import { Pin } from './yard'
import s from './luka.module.css'
import is from './iso.module.css'

/* ------------------------------------------------------------ section head */

export function SecHead({ berth, note, title, lede, id }: { berth: string; note?: string; title: ReactNode; lede?: ReactNode; id?: string }) {
  return (
    <header className={s.secHead}>
      <div className={s.berthRow}>
        <span className={s.berth}>{berth}</span>
        {note && <span className={s.berthNote}>{note}</span>}
      </div>
      <h2 className={s.h2} id={id}>
        {title}
      </h2>
      {lede && <p className={s.secLede}>{lede}</p>}
    </header>
  )
}

/* ------------------------------------------------------------ glossary term */

export function Term({ children, title, def }: { children: ReactNode; title: string; def: string }) {
  return (
    <span className={s.term} tabIndex={0} aria-describedby={undefined}>
      {children}
      <span className={s.tag} role="tooltip">
        <b>{title}</b>
        {def}
      </span>
    </span>
  )
}

/* ------------------------------------------------------------ key idea */

export function KeyIdea({ children }: { children: ReactNode }) {
  return (
    <aside className={s.keyIdea} aria-label="Ključna ideja">
      <svg viewBox="0 0 92 82" aria-hidden="true">
        <path d="M46 4 L88 78 H4 Z" fill="#14212e" />
        <path d="M46 16 L77 71 H15 Z" fill="var(--yellow)" />
        <rect x="41" y="32" width="10" height="23" fill="#14212e" />
        <rect x="41" y="59" width="10" height="8" fill="#14212e" />
      </svg>
      <div>
        <p className={s.keyLabel}>Ključna ideja</p>
        <p className={s.keyText}>{children}</p>
      </div>
    </aside>
  )
}

/* ------------------------------------------------------------ analogy */

const PLAN_VB: VB = vbOf(
  [
    [-0.4, -0.3, 0],
    [8.6, -0.3, 0],
    [-0.4, 5.4, -0.25],
    [8.6, 5.4, -0.25],
    [-0.4, 1.9, 2.9],
    [6.15, -0.35, 1.0],
  ],
  8,
)

const PLAN_TAGS: { text: string; at: V3; dx: number; dy: number }[] = [
  { text: 'Ulaz', at: [-0.25, 2.55, 1.6], dx: -6, dy: -34 },
  { text: 'Raspoređivač', at: [3.35, 2.6, 0.78], dx: 4, dy: -52 },
  { text: 'Pultovi', at: [6.85, 0.6, 0.95], dx: 30, dy: -30 },
]

function CanteenPlan() {
  const counters = [0.5, 2.15, 3.8]
  return (
    <div className={s.planStage} style={{ aspectRatio: `${PLAN_VB.w} / ${PLAN_VB.h}` }}>
      <svg viewBox={vbStr(PLAN_VB)} role="img" aria-label="Menza odozgo: jedan ulaz, osoba na ulazu usmjerava studente prema tri pulta za posluživanje.">
        <Box x={-0.4} y={-0.3} z={-0.25} w={9} d={5.7} h={0.25} c="var(--concrete)" />
        {/* entrance */}
        <Box x={-0.4} y={1.9} z={0} w={0.3} d={0.15} h={1.4} c="var(--steel)" />
        <Box x={-0.4} y={3.05} z={0} w={0.3} d={0.15} h={1.4} c="var(--steel)" />
        <Box x={-0.4} y={1.9} z={1.4} w={0.3} d={1.3} h={0.2} c="var(--orange)" />
        {/* painted routes from the dispatcher to each counter */}
        <Paint
          dashed
          lines={[
            [[3.4, 2.6, 0], [5.1, 1.05, 0]],
            [[3.4, 2.6, 0], [5.1, 2.7, 0]],
            [[3.4, 2.6, 0], [5.1, 4.35, 0]],
          ]}
        />
        {/* queue at the entrance */}
        <Person x={0.3} y={2.45} c="var(--teal)" />
        <Person x={1.0} y={2.55} c="var(--rust)" />
        <Person x={1.7} y={2.4} c="var(--blue)" />
        <Person x={2.4} y={2.5} c="var(--mustard)" />
        {/* dispatcher in a hi-vis vest */}
        <Box x={3.1} y={2.35} z={0} w={0.5} d={0.5} h={0.05} c="var(--yellow)" />
        <Person x={3.25} y={2.5} c="var(--orange)" phone={false} />
        {/* counters with a short queue each */}
        {counters.map((y, i) => (
          <g key={i}>
            <Person x={5.4} y={y + 0.45} c={['var(--teal)', 'var(--rust)', 'var(--blue)'][i]} />
            {i !== 1 && <Person x={4.8} y={y + 0.5} c={['var(--mustard)', 'var(--teal)', 'var(--orange)'][i]} />}
            <Box x={6.2} y={y} w={1.3} d={1.15} h={0.8} c="var(--steel-3)" />
            <Box x={6.15} y={y - 0.05} z={0.8} w={1.4} d={1.25} h={0.08} c="var(--steel)" />
            <Container x={6.35} y={y + 0.2} z={0.88} len={0.5} wid={0.35} hei={0.22} c={['var(--rust)', 'var(--teal)', 'var(--mustard)'][i]} />
            <FaceText face="right" x={7.5} y={y + 1.05} z={0.32} size={0.32} className={is.stencilSteel}>
              {`PULT ${i + 1}`}
            </FaceText>
          </g>
        ))}
        {PLAN_TAGS.map((tg) => {
          const [x, y] = iso(...tg.at)
          return (
            <g key={tg.text}>
              <line className={s.planLeader} x1={x} y1={y} x2={x + tg.dx} y2={y + tg.dy} />
              <circle className={s.planDot} cx={x} cy={y} r={2} />
            </g>
          )
        })}
      </svg>
      {PLAN_TAGS.map((tg) => {
        const [x, y] = iso(...tg.at)
        return (
          <Pin key={tg.text} vb={PLAN_VB} xy={[x + tg.dx, y + tg.dy]} className={s.planTag}>
            {tg.text}
          </Pin>
        )
      })}
    </div>
  )
}

function Arrow() {
  return (
    <svg viewBox="0 0 30 12" aria-hidden="true">
      <path d="M0 6 H24" stroke="currentColor" strokeWidth="2.5" />
      <path d="M20 1 L28 6 L20 11" fill="none" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  )
}

export function Analogy() {
  return (
    <figure className={s.analogy}>
      <div className={s.analogyArt}>
        <CanteenPlan />
        <p className={s.planBlock} aria-hidden="true">
          <span>PLAN · MENZA KLOPA</span>
          <span>M 1:100</span>
        </p>
      </div>
      <figcaption className={s.analogyBody}>
        <p className={s.label}>Usporedba · menza</p>
        <h3 className={s.h3}>Jedan ulaz, nekoliko pultova i netko tko usmjerava</h3>
        <p style={{ margin: '0 0 10px' }}>
          U menzi postoji samo jedan ulaz, ali hranu dijeli nekoliko pultova. Na ulazu stoji osoba koja svakom studentu pokaže na koji
          pult da ode, pa nijedan pult ne ostaje prazan dok se pred drugim stvara red.
        </p>
        <ul className={s.mapList}>
          <li>
            <span>ulaz u menzu</span>
            <Arrow />
            <span>adresa load balancera</span>
          </li>
          <li>
            <span>pultovi za posluživanje</span>
            <Arrow />
            <span>poslužitelji</span>
          </li>
          <li>
            <span>osoba na ulazu</span>
            <Arrow />
            <span>algoritam raspoređivanja</span>
          </li>
        </ul>
        <p className={s.breaks}>
          <b>Gdje analogija ne vrijedi</b>
          Student vidi redove i sam bira kraći. Zahtjev ne vidi ništa: load balancer odlučuje umjesto njega i zna samo ono što izmjeri —
          na primjer broj otvorenih veza ili jesu li poslužitelji prošli provjeru zdravlja.
        </p>
      </figcaption>
    </figure>
  )
}

/* ------------------------------------------------------------ myth vs fact */

export function Myth() {
  return (
    <aside className={s.customs} aria-label="Mit i činjenica">
      <div className={s.customsHead}>
        <span>Carinska provjera · mit ili činjenica</span>
        <span className={s.barcode} aria-hidden="true" />
      </div>
      <div className={s.customsRow}>
        <span className={s.fieldCol}>
          <span className={s.fieldLabel}>Tvrdnja</span>
          <span className={`${s.stamp} ${s.stampRed}`}>Mit</span>
        </span>
        <p className={s.mythText}>„Više RAM‑a znači brži poslužitelj.”</p>
      </div>
      <div className={s.customsRow}>
        <span className={s.fieldCol}>
          <span className={s.fieldLabel}>Činjenica</span>
          <span className={`${s.stamp} ${s.stampGreen}`}>Provjereno</span>
        </span>
        <p className={s.factText}>
          RAM određuje <strong>koliko zahtjeva istodobno stane</strong> na poslužitelj, a ne koliko ih brzo obrađuje. Brzinu određuju
          jezgre procesora (i sam kod). Dodatni RAM ubrzat će sustav tek ako je memorija bila usko grlo — npr. ako su se zahtjevi odbijali
          jer nije bilo mjesta.
        </p>
      </div>
    </aside>
  )
}

/* ------------------------------------------------------------ curriculum board */

const ROW_VB = viewBoxFor(0, 1.6, 0, 0.8, 1.0, 3)

function RowIcon({ c, lamp }: { c: string; lamp: 'ok' | 'warn' | null }) {
  return (
    <svg viewBox={ROW_VB} aria-hidden="true">
      <Container x={0} y={0} len={1.6} wid={0.8} hei={0.8} c={c} lamp={lamp} lampBlink={lamp === 'warn'} />
    </svg>
  )
}

const LECTURES = [
  {
    n: '01',
    title: 'Klopa izlazi na internet',
    sub: 'Što se dogodi između dodira na mobitelu i odgovora poslužitelja.',
    dur: '25 min',
    status: 'done' as const,
    c: 'var(--teal)',
  },
  {
    n: '02',
    title: 'Ručak u 12:00: granice jednog poslužitelja',
    sub: 'Zašto jedan stroj, ma kako jak bio, jednom prestane stizati.',
    dur: '30 min',
    status: 'next' as const,
    c: 'var(--mustard)',
  },
  {
    n: '04',
    title: 'Load balancer: tko dijeli promet?',
    sub: 'Kružno raspoređivanje, najmanje veza i provjere zdravlja.',
    dur: '35 min',
    status: 'idle' as const,
    c: 'var(--orange)',
  },
]
const STATUS_TEXT = { done: 'Završeno', next: 'Sljedeće', idle: 'Čeka' } as const
const FLAP_CHARS = 'ABCDEFGHIJKLMNOPRSTUVZČĆŠŽ0123456789'
const FLAP_DUR = 1.5

/** One-time split-flap scramble: each character rattles through the drum, then settles, left to right. */
function Flap({ text, t, delay }: { text: string; t: number | null; delay: number }) {
  if (t === null) return <>{text}</>
  return (
    <>
      {Array.from(text).map((ch, i) => {
        const settle = delay + 0.28 + i * 0.045
        if (t >= settle || ch === ' ' || ch === ':') return ch
        const k = Math.floor(t * 28) + i * 7 + ch.charCodeAt(0)
        return FLAP_CHARS[k % FLAP_CHARS.length]
      })}
    </>
  )
}

/** elapsed seconds since the element first scrolled into view (null before that, and with reduced motion) */
function useFlapClock(ref: RefObject<Element | null>, enabled: boolean): number | null {
  const [t, setT] = useState<number | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    let raf = 0
    let t0 = 0
    const frame = (now: number) => {
      if (!t0) t0 = now
      const e = (now - t0) / 1000
      setT(e < FLAP_DUR ? e : null)
      if (e < FLAP_DUR) raf = requestAnimationFrame(frame)
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return
        io.disconnect()
        raf = requestAnimationFrame(frame)
      },
      { threshold: 0.35 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [ref, enabled])
  return enabled ? t : null
}

export function Board() {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = usePrefersReducedMotion()
  const t = useFlapClock(ref, !reduce)
  const rows = LECTURES.map((l, r) => ({ ...l, delay: r * 0.22 + (r > 1 ? 0.22 : 0) }))
  return (
    <div className={s.board} ref={ref}>
      <div className={s.boardHead}>
        <h3 className={s.boardTitle}>Modul 1 · Zašto raspodijeljeni sustavi</h3>
        <span className={s.boardMeta}>RASPORED PRISTAJANJA · isječak</span>
      </div>
      <div className={s.boardCols} aria-hidden="true">
        <span>Vez</span>
        <span />
        <span>Predavanje</span>
        <span>Trajanje</span>
        <span>Status</span>
      </div>
      {rows.map((l, r) => (
        <Fragment key={l.n}>
          {r === 2 && (
            <div className={`${s.boardRow} ${s.gapRow}`}>
              <span className={s.flap} aria-label="Predavanje 03">
                <span>
                  <Flap text="0" t={t} delay={0.44} />
                </span>
                <span>
                  <Flap text="3" t={t} delay={0.44} />
                </span>
              </span>
              <span className={s.rowIcon} aria-hidden="true" />
              <span className={s.rowMain}>
                <p className={s.gapText}>· · · još 1 predavanje u ovom modulu</p>
              </span>
            </div>
          )}
          <a className={s.boardRow} href={l.n === '04' ? '#predavanje' : '#kurikulum'}>
            <span className={s.flap} aria-label={`Predavanje ${l.n}`}>
              <span>
                <Flap text={l.n[0]} t={t} delay={l.delay} />
              </span>
              <span>
                <Flap text={l.n[1]} t={t} delay={l.delay + 0.05} />
              </span>
            </span>
            <span className={s.rowIcon}>
              <RowIcon c={l.c} lamp={l.status === 'done' ? 'ok' : l.status === 'next' ? 'warn' : null} />
            </span>
            <span className={s.rowMain}>
              <p className={s.rowTitle}>{l.title}</p>
              <p className={s.rowSub}>{l.sub}</p>
            </span>
            <span className={s.rowDur}>
              <Flap text={l.dur} t={t} delay={l.delay + 0.1} />
            </span>
            <span className={s.rowStatus}>
              <span className={`${s.status} ${l.status === 'done' ? s.statusDone : l.status === 'next' ? s.statusNext : s.statusIdle}`}>
                <i />
                <span className={s.statusText} aria-label={STATUS_TEXT[l.status]}>
                  <Flap text={STATUS_TEXT[l.status].toUpperCase()} t={t} delay={l.delay + 0.18} />
                </span>
              </span>
            </span>
          </a>
        </Fragment>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------ lecture header */

export function LectureHeader() {
  return (
    <div className={s.lecture}>
      <header className={s.containerSide}>
        <i className={`${s.corner} ${s.cTL}`} />
        <i className={`${s.corner} ${s.cTR}`} />
        <i className={`${s.corner} ${s.cBL}`} />
        <i className={`${s.corner} ${s.cBR}`} />
        <div className={s.doors} aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <b />
          <b />
        </div>
        <p className={s.code6346} aria-hidden="true">
          KLPU 000 004 2<span>22G1 · MODUL 1</span>
          <span>NETO 35 MIN</span>
        </p>
        <p className={s.lecNo}>Predavanje 04</p>
        <h1 className={s.lecTitle}>Load balancer: tko dijeli promet?</h1>
        <p className={s.lecSub}>Više poslužitelja vrijedi samo ako netko pametno dijeli zahtjeve.</p>
        <div className={s.lecMeta}>
          <span>~35 min</span>
          <span>Modul 1</span>
          <span>Simulacija</span>
        </div>
      </header>
      <section className={s.manifest} aria-label="Ciljevi predavanja">
        <div className={s.manifestHead}>
          <span>Teretni list · ciljevi</span>
          <span>3 stavke</span>
        </div>
        <p>Nakon ovog predavanja moći ćete:</p>
        <ol className={s.objectives}>
          <li data-n="01">objasniti zašto za horizontalno skaliranje treba load balancer</li>
          <li data-n="02">razlikovati ulogu procesora i RAM‑a na poslužitelju</li>
          <li data-n="03">usporediti kružno raspoređivanje i „najmanje aktivnih veza”</li>
        </ol>
      </section>
    </div>
  )
}
