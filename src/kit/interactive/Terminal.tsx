import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useInView, useReducedMotion } from 'motion/react'
import { useWidth } from '../sketch/useSize'
import { PenGlyph, LaptopDeck } from '../doodles/interactive-doodles'
import { Outline } from './Outline'
import { parseTable, statusParts, type ParsedTable } from './terminal-format'
import { Arrow } from '../sketch/Sketch'
import { CastDoodle } from '../doodles/text-doodles'
import { CAST_NAME, type CastName } from '../text/types'

export type TerminalLine =
  /** A command the user types (prompt is added automatically) */
  | { cmd: string; prompt?: string }
  /**
   * Program output (multi-line allowed). tone colors the text.
   * `note`: a sticky note stuck to the screen right under this line, with a pen arrow up to it — the one line that
   * matters ("CrashLoopBackOff: pada, diže se, pa opet pada"). With `who` it is that character speaking (Kalam,
   * „Davor: …”); without, it is the author's handwritten note. One or two notes per session at most; ≤ ~70 characters.
   */
  | { out: string; tone?: 'normal' | 'ok' | 'warn' | 'bad' | 'muted'; note?: ReactNode; who?: CastName }
  /** A comment explaining the next step (Croatian), shown dimmed */
  | { comment: string }

interface TerminalProps {
  lines: TerminalLine[]
  title?: string
  caption?: ReactNode
  /** Type the session out when scrolled into view (default true). */
  animate?: boolean
  /** Typing speed in ms per character. */
  typingMs?: number
  wide?: boolean
  /**
   * Whose laptop it is (default 'lana'): sets the default prompt („davor@klopa:~$”) and the accessible name
   * („Terminal na Davorovu laptopu”).
   */
  who?: CastName
  /** The session's prompt, also on the idle line after the last command (default `${who}@klopa:~$`). A command's own `prompt` still wins. */
  prompt?: string
  /** Accessible name of the figure (default „Terminal na Laninu laptopu”, from `who`). */
  ariaLabel?: string
}

/** „na Laninu laptopu”: the possessive adjective of each cast member (dative masculine, short form). */
const LAPTOP_OF: Record<CastName, string> = {
  lana: 'Laninu',
  davor: 'Davorovu',
  petra: 'Petrinu',
  iva: 'Ivinu',
  mira: 'Mirinu',
}

/**
 * The laptop's width (the <figure>, which does not depend on the layout inside it) decides the layout. Narrow below
 * 600 px, wide again only above 624 px: the gap keeps a figure near the threshold from flipping back and forth when
 * a scrollbar comes and goes or the content changes height.
 */
const NARROW_BELOW = 600
const WIDE_ABOVE = 624

/** Output text with status words (Running, CrashLoopBackOff, OutOfSync…) in the terminal's ok / warn / bad colours. */
function Toned({ text }: { text: string }) {
  return (
    <>
      {statusParts(text).map((p, i) =>
        p.tone ? (
          <span key={i} className={`k-term-win__st is-${p.tone}`}>
            {p.text}
          </span>
        ) : (
          p.text
        ),
      )}
    </>
  )
}

/** A sticky note stuck on the laptop screen under an output line, with a short pen arrow up to the line. */
function ScreenNote({ who, children, seed }: { who?: CastName; children: ReactNode; seed: number }) {
  return (
    <span className="k-term-win__note" data-who={who ? '' : undefined}>
      <svg className="k-term-win__notearrow" viewBox="0 0 40 30" aria-hidden="true">
        <Arrow
          pts={[
            [30, 28],
            [22, 16],
            [10, 4],
          ]}
          stroke="var(--note-yellow)"
          strokeWidth={1.8}
          seed={seed}
          head={7}
        />
      </svg>
      <span className="k-term-win__notepaper k-note" data-c="yellow">
        {who && <CastDoodle who={who} mood={who === 'davor' ? 'worry' : 'smile'} className="k-term-win__notewho" />}
        <span className="k-term-win__notetext">
          {who && <b>{CAST_NAME[who]}: </b>}
          {who ? <>„{children}”</> : children}
        </span>
      </span>
    </span>
  )
}

/** A table re-flowed for a phone: one block per row, the name first, then "KEY value · KEY value". */
function StackedTable({ table }: { table: ParsedTable }) {
  return (
    <div className="k-term-win__stack">
      {table.rows.map((r, i) => (
        <div key={i} className="k-term-win__row">
          <div className="k-term-win__rowname">{r[0]}</div>
          <div className="k-term-win__rowcells">
            {r
              .slice(1)
              .map((c, j) => ({ c, key: table.header[j + 1] }))
              .filter((x) => x.c)
              .map((x, j, all) => (
                <span key={j}>
                  <span className="k-term-win__cell">
                    <span className="k-term-win__key">{x.key}</span> <Toned text={x.c} />
                  </span>
                  {/* the dot stays at the end of the line when the row wraps */}
                  {j < all.length - 1 && <span className="k-term-win__sep">{'\u00a0· '}</span>}
                </span>
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * A terminal session on Lana's laptop (or `who`'s): a pen-drawn screen bezel with a camera and a "Klopa" sticker, and
 * a keyboard drawn in pencil. It types itself out when scrolled into view. When the laptop is narrow (< 600 px; a
 * phone, a sim's side column) column tables (kubectl get pods…) are re-flowed row by row and long lines wrap, so the
 * point of the output stays visible and the laptop never pushes its container wider.
 */
export function Terminal({ lines, title = 'terminal', caption, animate = true, typingMs = 28, wide, who = 'lana', prompt, ariaLabel }: TerminalProps) {
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const reduced = useReducedMotion()
  const instant = !animate || !!reduced
  const idlePrompt = prompt ?? `${who}@klopa:~$`
  // shown = number of fully shown lines; typed = chars typed of the current cmd line
  const [shownRaw, setShown] = useState(instant ? lines.length : 0)
  const [typed, setTyped] = useState(0)
  const [run, setRun] = useState(0)
  const [screenRef, screenW] = useWidth<HTMLDivElement>()
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => {
      const w = e.contentRect.width
      if (w > 0) setNarrow((n) => (n ? w < WIDE_ABOVE : w < NARROW_BELOW))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // widest output line (in characters), split into column tables and other output
  const widest = useMemo(() => {
    let text = 0
    let table = 0
    for (const l of lines) {
      if (!('out' in l)) continue
      const w = Math.max(0, ...l.out.split('\n').map((x) => x.length))
      if ((l.tone ?? 'normal') === 'normal' && parseTable(l.out)) table = Math.max(table, w)
      else text = Math.max(text, w)
    }
    return { text, table }
  }, [lines])
  // Plex Mono advances 0.6 em per character; 38 px is the screen's padding
  const room = screenW === null ? null : (screenW - 38) / 0.6
  // a column table that does not fit even at 12.5 px is re-flowed row by row (the point is never cut off)
  const stack = narrow || (room !== null && widest.table > 0 && widest.table * 12.5 > room)
  // the longest remaining line decides the type size (14.5 → 12.5 px) before anything has to scroll sideways
  const longest = stack ? widest.text : Math.max(widest.text, widest.table)
  const fontPx = narrow || room === null || longest === 0 ? undefined : Math.max(12.5, Math.min(14.5, room / longest))
  const shown = instant ? lines.length : shownRaw

  useEffect(() => {
    if (instant || !inView || shownRaw >= lines.length) return
    const line = lines[shownRaw]
    let t: ReturnType<typeof setTimeout>
    if ('cmd' in line) {
      if (typed < line.cmd.length) {
        // a little hesitation now and then (deterministic, like a person typing)
        const pause = (typed * 7 + shownRaw * 3) % 13 === 0 ? 90 : 0
        t = setTimeout(() => setTyped((n) => n + 1), typingMs + pause)
      } else {
        t = setTimeout(() => {
          setShown((s) => s + 1)
          setTyped(0)
        }, 260)
      }
    } else {
      t = setTimeout(() => setShown((s) => s + 1), 'comment' in line ? 380 : 220)
    }
    return () => clearTimeout(t)
  }, [instant, inView, shownRaw, typed, lines, typingMs, run])

  const replay = () => {
    setShown(0)
    setTyped(0)
    setRun((r) => r + 1)
  }
  const skip = () => setShown(lines.length)
  const done = shown >= lines.length
  const deckH = Math.round(Math.max(24, Math.min(58, (screenW ?? 600) * 0.068)))

  return (
    <figure className={`k-term-win${wide ? ' k-wide' : ''}${narrow ? ' is-narrow' : ''}`} ref={ref} aria-label={ariaLabel ?? `Terminal na ${LAPTOP_OF[who]} laptopu`}>
      <div className="k-term-win__laptop">
      <div className="k-term-win__lid k-pinned">
        <Outline seed={941} stroke="var(--ink)" strokeWidth={2.2} roughness={1.1} fill="var(--bezel)" inset={1} />
        <span className="k-term-win__camera" aria-hidden="true" />
        <div className="k-term-win__screen" ref={screenRef}>
          <div className="k-term-win__bar">
            <span className="k-term-win__title">{title}</span>
            <span className="k-term-win__actions">
              {/* one button that swaps "preskoči" → "ponovi", so keyboard focus stays on it */}
              {!instant && (
                <button type="button" onClick={done ? replay : skip} aria-label={done ? 'Ponovi animaciju' : 'Preskoči animaciju'} title={done ? 'Ponovi' : 'Preskoči animaciju'}>
                  <PenGlyph kind={done ? 'loop' : 'skip'} size={14} /> {done ? 'ponovi' : 'preskoči'}
                </button>
              )}
            </span>
          </div>
          <pre className="k-term-win__body" style={fontPx ? { fontSize: `${fontPx.toFixed(2)}px` } : undefined}>
            {lines.map((line, i) => {
              if (i > shown) return null
              const partial = i === shown
              if ('cmd' in line) {
                const text = partial ? line.cmd.slice(0, typed) : line.cmd
                const p = line.prompt ?? (narrow ? '$' : idlePrompt)
                return (
                  <div key={i} className="k-term-win__line k-term-win__cmdline">
                    <span className="k-term-win__prompt">{p}</span> <span className="k-term-win__cmd">{text}</span>
                    {partial && !done && <span className="k-term-win__caret is-typing" />}
                  </div>
                )
              }
              if (partial) return null
              if ('comment' in line) {
                return (
                  <div key={i} className="k-term-win__line k-term-win__comment">
                    # {line.comment}
                  </div>
                )
              }
              const tone = line.tone ?? 'normal'
              const table = stack && tone === 'normal' ? parseTable(line.out) : null
              return (
                <div key={i} className={`k-term-win__line k-term-win__out tone-${tone}`}>
                  {table ? <StackedTable table={table} /> : tone === 'normal' ? <Toned text={line.out} /> : line.out}
                  {line.note !== undefined && (
                    <ScreenNote who={line.who} seed={4801 + i}>
                      {line.note}
                    </ScreenNote>
                  )}
                </div>
              )
            })}
            {done && (
              <div className="k-term-win__line">
                <span className="k-term-win__prompt">{narrow ? '$' : idlePrompt}</span> <span className="k-term-win__caret" />
              </div>
            )}
          </pre>
        </div>
        <span className="k-term-win__sticker" aria-hidden="true">
          Klopa
        </span>
      </div>
      <LaptopDeck className="k-term-win__deck" height={deckH} />
      </div>
      {caption && <figcaption className="k-term-win__caption">{caption}</figcaption>}
    </figure>
  )
}
