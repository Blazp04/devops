import { useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { motion } from 'motion/react'
import { COURSE } from '../curriculum/data'
import { Boil, Davor, Helm, Iva, Lana, Mira, Petra, Rough, SpeechBubble, Squiggle } from '../kit'
import { useTheme } from './theme'

/** The papir / ploča switch, drawn: a pencil box with a sliding swatch (yellow marker ↔ chalk zig-zag). */
function ThemeToggle() {
  const { resolved, toggle } = useTheme()
  const dark = resolved === 'dark'
  return (
    <button type="button" className="nb-theme" onClick={toggle} aria-label="Tamna tema (ploča)" aria-pressed={dark} title="Papir ili ploča">
      <svg viewBox="0 0 62 30" aria-hidden="true">
        <Rough shape={{ k: 'rect', x: 2, y: 3, w: 58, h: 24 }} seed={71} strokeWidth={1.6} roughness={1.4} />
        <motion.g initial={false} animate={{ x: dark ? 30 : 0 }} transition={{ type: 'spring', stiffness: 380, damping: 26 }}>
          <Rough
            shape={{ k: 'rect', x: 6, y: 7, w: 22, h: 16 }}
            seed={72}
            strokeWidth={1.4}
            fillColor={dark ? 'var(--ink)' : 'var(--hl-yellow-ink)'}
            fillStyle={dark ? 'zigzag' : 'hachure'}
            hachureGap={2.6}
          />
        </motion.g>
      </svg>
      <span className="nb-theme__label" aria-hidden="true">
        {dark ? 'ploča' : 'papir'}
      </span>
    </button>
  )
}

function SiteHeader() {
  const [first, ...rest] = COURSE.title.split(' ')
  return (
    <header className="nb-header" id="vrh">
      <a className="nb-skip" href="#sadrzaj">
        Preskoči na sadržaj
      </a>
      <Link to="/" className="nb-brand" aria-label={`${COURSE.title} — početna`}>
        <svg className="nb-brand__mark" viewBox="0 0 44 44" aria-hidden="true">
          <Boil slow>
            <Helm x={22} y={22} r={13} stroke="var(--pen)" />
          </Boil>
        </svg>
        <span className="nb-brand__text">
          <span className="nb-brand__name">
            {first} {rest.join(' ')}
          </span>
          <span className="nb-brand__sub">bilježnica iz raspodijeljenih sustava</span>
        </span>
      </Link>
      <nav className="nb-nav" aria-label="Glavna navigacija">
        <NavLink to="/" end className="nb-nav__link">
          Kurikulum
          <Squiggle seed={31} />
        </NavLink>
        <NavLink to="/pojmovnik" className="nb-nav__link">
          Pojmovnik
          <Squiggle seed={32} color="var(--pen)" />
        </NavLink>
        <ThemeToggle />
      </nav>
    </header>
  )
}

function SiteFooter() {
  return (
    <footer className="nb-footer">
      <svg className="nb-footer__cast" viewBox="0 -64 380 200" aria-hidden="true">
        <Boil slow>
          <Lana x={0} y={6} scale={0.85} mood="grin" />
          <Davor x={72} y={6} scale={0.85} mood="smile" holding="mug" />
          <Petra x={144} y={6} scale={0.85} mood="smile" />
          <Iva x={216} y={6} scale={0.85} mood="grin" />
          <Mira x={290} y={6} scale={0.85} mood="grin" />
        </Boil>
        <SpeechBubble x={250} y={-62} w={124} h={52} tx={326} ty={30} lines={['Dobar tek!']} size={21} seed={2801} tail={16} />
        {[
          ['Lana', 34],
          ['Davor', 106],
          ['Petra', 178],
          ['Iva', 250],
          ['teta Mira', 326],
        ].map(([name, x]) => (
          <text key={name} x={x} y={128} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 18, fill: 'var(--ink-2)' }}>
            {name}
          </text>
        ))}
      </svg>
      <p className="nb-footer__text">
        <strong>{COURSE.title}</strong>
        Bilježnica s predavanja iz raspodijeljenih sustava: Docker, Kubernetes, CI/CD i Argo CD, objašnjeni na primjeru Klope, studentske aplikacije za naručivanje ručka u menzi. Sve je
        nacrtano rukom (uz malo pomoći biblioteke roughjs), a simulacije smijete rušiti koliko god želite.
      </p>
      <a className="nb-footer__top" href="#vrh">
        na početak ↑
      </a>
    </footer>
  )
}

/**
 * The notebook: a sheet of paper on a kraft desk (light) or a chalkboard in a wooden frame (dark).
 * Header, page and footer are written on the same sheet.
 */
export function AppShell() {
  const { pathname, hash } = useLocation()
  const prevPath = useRef(pathname)

  // Scroll to the #anchor (or to the top) on navigation. The target may not exist yet (lazy pages, lectures that
  // register their sections after loading), so look for it for up to ~3 s; once found, scroll again when the fonts
  // have loaded and the page has settled, unless the reader has started scrolling in the meantime.
  useEffect(() => {
    const id = hash ? decodeURIComponent(hash.slice(1)) : ''
    if (!id) {
      window.scrollTo(0, 0)
      return
    }
    let cancelled = false
    let raf = 0
    const timers: number[] = []
    const stop = () => {
      cancelled = true
    }
    const userEvents = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const
    userEvents.forEach((ev) => window.addEventListener(ev, stop, { passive: true, once: true }))
    const scroll = () => {
      if (cancelled) return
      document.getElementById(id)?.scrollIntoView()
    }
    const start = performance.now()
    const find = () => {
      if (cancelled) return
      if (document.getElementById(id)) {
        scroll()
        document.fonts?.ready.then(scroll)
        timers.push(window.setTimeout(scroll, 450), window.setTimeout(scroll, 1300))
      } else if (performance.now() - start < 3000) raf = requestAnimationFrame(find)
    }
    if (!document.getElementById(id)) window.scrollTo(0, 0)
    find()
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      timers.forEach((t) => window.clearTimeout(t))
      userEvents.forEach((ev) => window.removeEventListener(ev, stop))
    }
  }, [pathname, hash])

  // After a route change move focus to the new page's heading, so screen readers announce the page.
  useEffect(() => {
    if (prevPath.current === pathname) return
    prevPath.current = pathname
    const h1 = document.querySelector<HTMLElement>('.nb-main h1')
    if (!h1) return
    if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1')
    h1.focus({ preventScroll: true })
  }, [pathname])

  return (
    <div className="nb-desk">
      <div className="nb-sheet">
        <SiteHeader />
        <main className="nb-main" id="sadrzaj" tabIndex={-1}>
          <Outlet />
        </main>
        <SiteFooter />
      </div>
    </div>
  )
}
