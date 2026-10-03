import { motion } from 'motion/react'
import { Rough, Boil } from './Sketch'
import { Helm } from './Doodles'
import { Squiggle } from './Bits'
import s from './bj.module.css'

export function Header({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  return (
    <header className={s.header}>
      <a className={s.brand} href="#vrh" aria-label="Kubernetes od nule — početna">
        <svg className={s.brandMark} viewBox="0 0 44 44" aria-hidden="true">
          <Boil slow>
            <Helm x={22} y={22} r={13} stroke="var(--pen)" />
          </Boil>
        </svg>
        <span className={s.brandText}>
          <span className={s.brandName}>Kubernetes od nule</span>
          <span className={s.brandSub}>bilježnica iz raspodijeljenih sustava</span>
        </span>
      </a>
      <nav className={s.nav} aria-label="Glavna navigacija">
        <a className={s.navLink} href="#kurikulum" aria-current="page">
          Kurikulum
          <Squiggle seed={31} />
        </a>
        <a className={s.navLink} href="#pojmovnik">
          Pojmovnik
          <Squiggle seed={32} color="var(--pen)" />
        </a>
        <button
          type="button"
          className={s.themeToggle}
          onClick={onToggle}
          aria-label={dark ? 'Prebaci na svijetlu temu (papir)' : 'Prebaci na tamnu temu (ploča)'}
          aria-pressed={dark}
        >
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
          <span className={s.themeLabel}>{dark ? 'ploča' : 'papir'}</span>
        </button>
      </nav>
    </header>
  )
}
