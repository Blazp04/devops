import type { ReactNode } from 'react'
import { motion, useScroll, useTransform } from 'motion/react'
import { Stamp } from './Draw'
import { GLOSSARY } from './glossary'
import s from './nacrt.module.css'

/** Brand mark: the helm wheel as a construction drawing (centre lines, hub, seven spokes). */
export function BrandGlyph() {
  const spokes = Array.from({ length: 7 }, (_, i) => {
    const a = (i / 7) * Math.PI * 2 - Math.PI / 2
    return `M${20 + Math.cos(a) * 5.5},${20 + Math.sin(a) * 5.5} L${20 + Math.cos(a) * 13},${20 + Math.sin(a) * 13}`
  }).join(' ')
  return (
    <svg className={s.brandGlyph} viewBox="0 0 40 40" aria-hidden="true">
      <path d="M1,20 H39 M20,1 V39" className={s.centerLine} />
      <circle cx="20" cy="20" r="13.5" />
      <circle cx="20" cy="20" r="5.5" />
      <path d={spokes} />
      <circle cx="20" cy="20" r="1.6" className={s.brandHub} />
    </svg>
  )
}

export function Header({ theme, onToggle }: { theme: 'light' | 'dark'; onToggle: () => void }) {
  const { scrollYProgress } = useScroll()
  const left = useTransform(scrollYProgress, (v) => `${(v * 100).toFixed(2)}%`)
  const dark = theme === 'dark'
  return (
    // `shell-header` only so the repo's screenshot script (scripts/shot.mjs --section) can un-stick it; its global look is overridden in .root .header
    <header className={`${s.header} shell-header`}>
      <div className={s.headerIn}>
        <a className={s.brand} href="#vrh">
          <BrandGlyph />
          <span className={s.brandText}>Kubernetes od nule</span>
        </a>
        <nav className={s.nav} aria-label="Glavna navigacija">
          <a href="#kurikulum" className={s.navLink}>
            <span className={s.navNo}>01</span>Kurikulum
          </a>
          <a href="#pojmovnik" className={s.navLink}>
            <span className={s.navNo}>02</span>Pojmovnik
          </a>
        </nav>
        <button
          type="button"
          className={s.themeBtn}
          onClick={onToggle}
          aria-pressed={dark}
          aria-label={dark ? 'Uključi svijetlu temu (paus papir)' : 'Uključi tamnu temu (plavi otisak)'}
          title={dark ? 'Svijetla tema: paus papir' : 'Tamna tema: plavi otisak'}
        >
          <span className={s.themeOpt} data-on={!dark}>
            Paus
          </span>
          <span className={s.themeTrack} aria-hidden="true">
            <span className={s.themeKnob} data-dark={dark} />
          </span>
          <span className={s.themeOpt} data-on={dark}>
            Cijanotip
          </span>
        </button>
      </div>
      <div className={s.ruler} aria-hidden="true">
        <motion.span className={s.rulerMark} style={{ left }} />
      </div>
    </header>
  )
}

const ZONES = 'ABCDEFGHJKLMNPRSTUVZ'.split('')

/** Column numbers along the top edge of the frame. */
export function TopRail() {
  return (
    <div className={s.railTop} aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <span key={i}>{i + 1}</span>
      ))}
    </div>
  )
}

/**
 * One sheet of the set. Its side rails carry the sheet number and zone letters that restart at A,
 * so a reference like "LIST 04-2, zona C" points to one place.
 */
export function Part({ sheet, children }: { sheet: string; children: ReactNode }) {
  const rail = (
    <>
      <span className={s.partNo}>{sheet}</span>
      {ZONES.map((l) => (
        <span key={l}>{l}</span>
      ))}
    </>
  )
  return (
    <div className={s.part}>
      <div className={s.partRailL} aria-hidden="true">
        {rail}
      </div>
      <div className={s.partRailR} aria-hidden="true">
        {rail}
      </div>
      {children}
    </div>
  )
}

/** Where one sheet ends and the next begins. */
export function SheetBreak({ label }: { label: string }) {
  return (
    <div className={s.sheetBreak} role="separator" aria-label={label}>
      <span className={s.sheetBreakLine} />
      <span className={s.sheetBreakLabel}>{label}</span>
      <span className={s.sheetBreakLine} />
    </div>
  )
}

/** The glossary as the drawing's parts list: item number, term, description, sheet where it first appears. */
function PartsList() {
  return (
    <section className={s.gloss} id="pojmovnik" aria-labelledby="pojmovnik-title">
      <header className={s.glossHead}>
        <h2 className={s.glossTitle} id="pojmovnik-title">
          Pojmovnik
        </h2>
        <span className={s.glossMeta}>popis pojmova · broj u krugu je isti kao u tekstu</span>
      </header>
      <div className={s.glossCols} aria-hidden="true">
        <span>Poz.</span>
        <span>Pojam</span>
        <span>Opis</span>
        <span>List</span>
      </div>
      <ol className={s.glossList}>
        {GLOSSARY.map((g) => (
          <li key={g.n}>
            <span className={s.glossN}>
              <span className={s.balloon}>{g.n}</span>
            </span>
            <span className={s.glossTerm}>
              {g.term}
              {g.alt && <span className={s.glossAlt}>{g.alt}</span>}
            </span>
            <span className={s.glossDef}>{g.def}</span>
            <a className={s.glossRef} href={g.anchor}>
              {g.sheet}
            </a>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function Footer() {
  return (
    <footer className={s.footer}>
      <PartsList />
      <div className={s.footBlock}>
        <div className={s.footCell} data-wide>
          <span className={s.cellLabel}>Naslov</span>
          <span className={s.footTitle}>
            <BrandGlyph /> Kubernetes od nule
          </span>
          <span className={s.footSmall}>Nastavni materijal o raspodijeljenim sustavima, Dockeru, Kubernetesu, CI/CD-u i Argo CD-u.</span>
        </div>
        <div className={s.footCell}>
          <span className={s.cellLabel}>Opseg</span>
          <span className={s.footVal}>6 modula · 24 lista</span>
        </div>
        <div className={s.footCell}>
          <span className={s.cellLabel}>Mjerilo</span>
          <svg className={s.scaleBar} viewBox="0 0 150 26" aria-label="Mjerilo 1 : 1">
            {[0, 1, 2, 3, 4].map((i) => (
              <rect key={i} x={4 + i * 28} y="4" width="28" height="6" className={i % 2 ? s.scaleW : s.scaleB} />
            ))}
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <text key={i} x={4 + i * 28} y="23" textAnchor="middle">
                {i}
              </text>
            ))}
          </svg>
        </div>
        <div className={s.footCell}>
          <span className={s.cellLabel}>Smjer dizajna</span>
          <span className={s.footVal}>Nacrt · rev. D</span>
        </div>
        <div className={s.footCell} data-wide>
          <span className={s.cellLabel}>Napomena</span>
          <span className={s.footSmall}>
            Sve simulacije rade s pojednostavljenim modelom; vremena su skraćena za nastavu. © 2026 · Kubernetes od nule
          </span>
        </div>
        <div className={s.footCell} data-sign>
          <span className={s.cellLabel}>Pregledao · odobrio</span>
          <span className={s.footStamp}>
            <Stamp tone="pencil" tilt={-5}>
              Odobreno za nastavu
            </Stamp>
          </span>
        </div>
      </div>
    </footer>
  )
}
