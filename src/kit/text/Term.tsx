import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { getGlossaryEntry, isGlossaryLoaded, useGlossaryVersion } from '../../curriculum/registry'
import { Tape } from '../doodles/Paper'

interface TermProps {
  /** Glossary id (see src/curriculum/data.ts GLOSSARY). */
  id: string
  /** Text to show; defaults to the glossary's Croatian form. Use this for declined forms ("Podovi", "u Podu"). */
  children?: ReactNode
}

const TIP_W = 320
/** grace period before a hover card closes, so the pointer can move from the word onto the card (WCAG 1.4.13) */
const CLOSE_MS = 160

/**
 * A glossary term: a dotted pencil underline; on hover / focus / tap the definition appears on a small blue index
 * card taped above (or below) the word — the same card as on the glossary's back pages.
 * Mouse: hover opens it (the card itself is hoverable), a click pins it open. Touch: a tap opens it, a second tap or a
 * tap anywhere else closes it. Keyboard: focus opens it, Enter / Space pins it, Esc closes it.
 * The definition is always available to screen readers (aria-describedby), not only while the card is shown.
 */
export function Term({ id, children }: TermProps) {
  useGlossaryVersion()
  const entry = getGlossaryEntry(id)
  const ref = useRef<HTMLSpanElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  // pinned = opened on purpose (click / tap / Enter): stays open when the pointer leaves
  const [pinned, setPinned] = useState(false)
  const closeTimer = useRef<number | undefined>(undefined)
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean; width: number } | null>(null)
  const uid = useId()
  const descId = `${uid}-def`

  const cancelClose = useCallback(() => {
    window.clearTimeout(closeTimer.current)
  }, [])
  const close = useCallback(() => {
    window.clearTimeout(closeTimer.current)
    setOpen(false)
    setPinned(false)
  }, [])
  const closeSoon = useCallback(() => {
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_MS)
  }, [])
  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  const place = useCallback(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const width = Math.min(TIP_W, window.innerWidth - 24)
    const left = Math.max(12, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - 12))
    const above = r.top > 230 || r.bottom + 230 > window.innerHeight
    setPos({ left, top: above ? r.top - 12 : r.bottom + 14, above, width })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  // a tap / click anywhere else closes the card
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || cardRef.current?.contains(t)) return
      close()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open, close])

  if (!entry) {
    if (import.meta.env.DEV && isGlossaryLoaded()) console.warn(`[Term] Nepoznat pojam u pojmovniku: "${id}"`)
    return <>{children ?? id}</>
  }

  const togglePin = () => {
    cancelClose()
    if (pinned && open) close()
    else {
      setOpen(true)
      setPinned(true)
    }
  }

  return (
    <>
      <span
        ref={ref}
        className="k-term"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-describedby={descId}
        onPointerEnter={(e) => {
          if (e.pointerType !== 'mouse') return
          cancelClose()
          setOpen(true)
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse' && !pinned) closeSoon()
        }}
        onFocus={() => {
          cancelClose()
          setOpen(true)
        }}
        onBlur={(e) => {
          if (cardRef.current?.contains(e.relatedTarget as Node)) return
          close()
        }}
        onClick={togglePin}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close()
          else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            togglePin()
          }
        }}
      >
        {children ?? entry.hr}
      </span>
      {/* hidden, but still read as the term's description (aria-describedby may point at hidden nodes) */}
      <span id={descId} hidden>
        {`${entry.term}${entry.menza ? ` (${entry.menza})` : ''}: ${entry.definition}`}
      </span>
      {createPortal(
        <AnimatePresence>
          {open && pos && (
            <div
              ref={cardRef}
              className="k-term__anchor"
              style={{ left: pos.left, top: pos.top, width: pos.width, transform: pos.above ? 'translateY(-100%)' : undefined }}
              onPointerEnter={(e) => e.pointerType === 'mouse' && cancelClose()}
              onPointerLeave={(e) => {
                if (e.pointerType === 'mouse' && !pinned) closeSoon()
              }}
            >
              <motion.div
                role="tooltip"
                aria-hidden="true"
                className="k-term__tip k-note"
                data-c="blue"
                initial={{ opacity: 0, y: pos.above ? 6 : -6, rotate: -1.2 }}
                animate={{ opacity: 1, y: 0, rotate: -1.2 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
              >
                <Tape c="blue" className="k-term__tape" />
                <span className="k-term__label">pojmovnik</span>
                <span className="k-term__name">
                  {entry.term}
                  {entry.hr.toLowerCase() !== entry.term.toLowerCase() && <span className="k-term__hr"> · {entry.hr}</span>}
                </span>
                {entry.menza && <span className="k-term__menza">= {entry.menza}</span>}
                <span className="k-term__def">{entry.definition}</span>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}
