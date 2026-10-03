import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useScroll, useSpring, useTransform } from 'motion/react'
import { useLecture } from '../../kit/lecture-context'
import { Rough } from '../../kit'
import { goToSection, useActiveSection } from './useActiveSection'

/** Reading progress as a pencil line across the top of the window, with the pencil at its tip. */
export function PencilProgress() {
  const { scrollYProgress } = useScroll()
  const p = useSpring(scrollYProgress, { stiffness: 220, damping: 40, restDelta: 0.001 })
  const clip = useTransform(p, (v) => `inset(-6px ${(1 - v) * 100}% -6px 0)`)
  const left = useTransform(p, (v) => `calc(${v * 100}% - 44px)`)
  const opacity = useTransform(p, [0, 0.01], [0, 1])
  return (
    <div className="nb-progress" aria-hidden="true">
      <motion.svg className="nb-progress__line" viewBox="0 0 1000 8" preserveAspectRatio="none" style={{ clipPath: clip }}>
        <Rough shape={{ k: 'line', x1: 0, y1: 4, x2: 1000, y2: 4.5 }} seed={3901} stroke="var(--ink-2)" strokeWidth={2.2} roughness={0.8} />
      </motion.svg>
      <motion.svg className="nb-progress__pencil" viewBox="0 0 44 12" style={{ left, opacity }}>
        <Rough shape={{ k: 'rect', x: 1, y: 2, w: 28, h: 8 }} seed={3902} strokeWidth={1.2} fillColor="var(--hl-yellow-ink)" fillStyle="solid" roughness={0.6} />
        <Rough shape={{ k: 'rect', x: 1, y: 2, w: 5, h: 8 }} seed={3903} strokeWidth={1} fillColor="var(--hl-pink-ink)" fillStyle="solid" roughness={0.5} />
        <Rough shape={{ k: 'poly', pts: [[29, 2], [41, 6], [29, 10]] }} seed={3904} strokeWidth={1.2} fillColor="var(--paper)" fillStyle="solid" roughness={0.5} />
        <path d="M37.5 4.8 L41 6 L37.5 7.2 Z" className="k-ink-fill" />
      </motion.svg>
    </div>
  )
}

/**
 * The lecture's table of contents as paper bookmark tabs on the right edge of the notebook (wide screens) and as a
 * sticky "kazalo" bar with a drop-down sticky note (narrow screens). Built from the lecture's <Section>s.
 */
export function LectureNav() {
  const lecture = useLecture()
  const sections = useMemo(() => lecture?.sections ?? [], [lecture?.sections])
  const ids = useMemo(() => sections.map((s) => s.id), [sections])
  const active = useActiveSection(ids)
  const [open, setOpen] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (sections.length === 0) return null
  const ai = Math.max(0, sections.findIndex((s) => s.id === active))
  const current = sections[ai]

  return (
    <>
      <nav className="nb-ltabs" aria-label="Kazalo predavanja">
        <ol>
          {sections.map((s, i) => (
            <li key={s.id} className={s.id === active ? 'is-current' : undefined}>
              <a
                href={`#${s.id}`}
                aria-current={s.id === active ? 'location' : undefined}
                onClick={(e) => {
                  e.preventDefault()
                  goToSection(s.id)
                }}
              >
                <b>{i + 1}</b>
                <span className="nb-ltabs__tip">{s.title}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <div className="nb-lbar" ref={barRef}>
        <button type="button" className="nb-lbar__btn" aria-expanded={open} aria-controls="nb-lbar-list" onClick={() => setOpen((o) => !o)}>
          <span className="nb-lbar__label">kazalo</span>
          <span className="nb-lbar__current">
            <b>{ai + 1}</b> · {current?.title}
          </span>
          <svg className="nb-lbar__chev" viewBox="0 0 16 12" aria-hidden="true">
            <Rough shape={{ k: 'lin', pts: open ? [[2, 9], [8, 3], [14, 9]] : [[2, 3], [8, 9], [14, 3]] }} seed={3911} strokeWidth={1.8} roughness={0.6} />
          </svg>
        </button>
        {open && (
          <ol className="nb-lbar__list k-note" data-c="yellow" id="nb-lbar-list">
            {sections.map((s, i) => (
              <li key={s.id} className={s.id === active ? 'is-current' : undefined}>
                <a
                  href={`#${s.id}`}
                  aria-current={s.id === active ? 'location' : undefined}
                  onClick={(e) => {
                    e.preventDefault()
                    setOpen(false)
                    goToSection(s.id)
                  }}
                >
                  <b>{i + 1}</b>
                  <span>{s.title}</span>
                </a>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  )
}
