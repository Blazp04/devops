import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Rough } from '../sketch/Sketch'
import { useWidth } from '../sketch/useSize'
import { Mark, Tape } from '../doodles/Paper'
import { PenGlyph } from '../doodles/interactive-doodles'
import type { MarkColor } from '../doodles/types'
import { plural } from '../sim/math'
import { Outline } from './Outline'
import { lineLabel, parseLineSpec, tokenize, type CodeLang, type CodeToken } from './highlight'

export interface CodeNote {
  /** Lines this note explains, e.g. "3" or "5-9" or "2,4" (1-based). */
  lines: string
  /** Short Croatian explanation. */
  text: ReactNode
}

interface CodeBlockProps {
  code: string
  lang?: CodeLang
  /** File name or short title shown in the header, e.g. "deployment.yaml". */
  title?: string
  /** One-line description of what the code does (Croatian). */
  caption?: ReactNode
  /**
   * preview: shows the first `previewLines` lines, expandable (default)
   * closed:  header only, click to open (for optional code)
   * open:    always fully visible
   */
  mode?: 'preview' | 'closed' | 'open'
  previewLines?: number
  /** Lines to highlight permanently, e.g. "4-6". */
  highlight?: string
  /** Line-by-line explanations; hovering one highlights its lines. */
  notes?: CodeNote[]
  /** Render wider than the reading column. */
  wide?: boolean
}

const LANG_LABEL: Partial<Record<CodeLang, string>> = {
  yaml: 'YAML',
  dockerfile: 'Dockerfile',
  bash: 'Terminal',
  shell: 'Terminal',
  json: 'JSON',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  go: 'Go',
  hcl: 'HCL',
  toml: 'TOML',
  ini: 'INI',
  diff: 'Diff',
  nginx: 'nginx',
  sql: 'SQL',
  properties: 'Properties',
  log: 'Log',
  text: 'Tekst',
}

/** Each note gets its own marker; its lines are underlined with it, and swiped fully while the note is active. */
const NOTE_MARKERS: MarkColor[] = ['yellow', 'green', 'pink', 'blue', 'orange']
const MARGIN_W = 240
const PAD_TOP = 8

interface NoteInfo {
  i: number
  set: Set<number>
  first: number
  last: number
  color: MarkColor
}

/** Splits a line's tokens into its leading indentation and the rest (a marker starts on the token, not the margin). */
function splitIndent(tokens: CodeToken[]): { indent: string; rest: CodeToken[] } {
  let indent = ''
  const rest: CodeToken[] = []
  let started = false
  for (const t of tokens) {
    if (started) {
      rest.push(t)
      continue
    }
    const m = /^(\s*)([\s\S]*)$/.exec(t.content)
    const lead = m?.[1] ?? ''
    const body = m?.[2] ?? ''
    indent += lead
    if (body) {
      started = true
      rest.push({ ...t, content: body })
    }
  }
  return { indent, rest }
}

function Tokens({ tokens }: { tokens: CodeToken[] }) {
  return (
    <>
      {tokens.map((t, k) => (
        <span key={k} style={{ color: t.color, fontStyle: t.italic ? 'italic' : undefined, fontWeight: t.bold ? 600 : undefined }}>
          {t.content}
        </span>
      ))}
    </>
  )
}

/** Copies text without the async Clipboard API (http:// on a LAN address, old browsers): a hidden textarea. */
function copyFallback(text: string): boolean {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  ta.style.pointerEvents = 'none'
  document.body.appendChild(ta)
  ta.select()
  let ok: boolean
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  ta.remove()
  return ok
}

function CopyButton({ source }: { source: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle')
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const show = (s: 'done' | 'failed') => {
    setState(s)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setState('idle'), s === 'done' ? 1700 : 2600)
  }
  const copy = async () => {
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error('no clipboard')
      await navigator.clipboard.writeText(source)
      show('done')
    } catch {
      show(copyFallback(source) ? 'done' : 'failed')
    }
  }
  const copied = state === 'done'
  return (
    <button type="button" className={`k-code__copy${copied ? ' is-done' : ''}${state === 'failed' ? ' is-failed' : ''}`} onClick={copy} aria-label={copied ? 'Kod je kopiran' : state === 'failed' ? 'Kod nije kopiran' : 'Kopiraj kod'}>
      <Outline seed={931} stroke="currentColor" strokeWidth={1.6} fill="var(--code-paper)" />
      <span className="k-code__copylabel" aria-live="polite">
        <PenGlyph kind={copied ? 'check' : state === 'failed' ? 'cross' : 'clipboard'} size={16} />
        {copied ? 'Kopirano' : state === 'failed' ? 'nije kopirano' : 'Kopiraj'}
      </span>
    </button>
  )
}

/** The pen's wavy underline under "Prikaži cijeli kod" (shown on hover). */
function PenUnderline() {
  return (
    <svg className="k-code__moreline" viewBox="0 0 120 12" preserveAspectRatio="none" aria-hidden="true">
      <Rough
        shape={{
          k: 'curve',
          pts: [
            [2, 7],
            [40, 4],
            [80, 8],
            [118, 5],
          ],
        }}
        seed={901}
        stroke="var(--pen)"
        strokeWidth={1.8}
      />
    </svg>
  )
}

/**
 * Code as a sheet of graph paper taped into the notebook: the file name on a yellow sticky note, a drawn "Kopiraj"
 * button, line numbers in pencil, highlights with the same marker as the prose, and notes written in the margin with
 * the blue pen (beside the code when there is room, under it otherwise). A long file shows a preview that fades out,
 * with "Prikaži cijeli kod (N redaka)".
 */
export function CodeBlock({ code, lang = 'yaml', title, caption, mode = 'preview', previewLines = 10, highlight: highlightSpec, notes, wide }: CodeBlockProps) {
  const source = useMemo(() => code.replace(/\n+$/, ''), [code])
  const rawLines = useMemo(() => source.split('\n'), [source])
  const lineCount = rawLines.length
  const canCollapse = mode === 'preview' && lineCount > previewLines + 2
  const [expanded, setExpanded] = useState(mode === 'open' || !canCollapse)
  const [closed, setClosed] = useState(mode === 'closed')
  const [tok, setTok] = useState<{ key: string; lines: CodeToken[][] } | null>(null)
  // the note under the mouse, and the note chosen with a click / keyboard focus (stays while the code re-flows)
  const [hoverNote, setHoverNote] = useState<number | null>(null)
  const [pinnedNote, setPinnedNote] = useState<number | null>(null)
  const activeNote = hoverNote ?? pinnedNote
  const [sheetRef, sheetW] = useWidth<HTMLElement>()
  const marginRef = useRef<HTMLOListElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // the code is wider than the sheet and there is more of it to the right (fade + "povucite →")
  const [sideways, setSideways] = useState(false)
  const [layout, setLayout] = useState<{ key: string; tops: number[]; height: number } | null>(null)

  const tokKey = `${lang}\u0000${source}`
  useEffect(() => {
    let alive = true
    tokenize(source, lang).then(
      (lines) => alive && setTok({ key: `${lang}\u0000${source}`, lines }),
      (e) => console.error('[CodeBlock] highlight failed', e),
    )
    return () => {
      alive = false
    }
  }, [source, lang])
  const tokens: CodeToken[][] = tok && tok.key === tokKey ? tok.lines : rawLines.map((l) => [{ content: l }])

  const staticLines = useMemo(() => parseLineSpec(highlightSpec), [highlightSpec])
  const noteInfo = useMemo<NoteInfo[]>(
    () =>
      (notes ?? []).map((n, i) => {
        const set = parseLineSpec(n.lines)
        const all = [...set]
        return { i, set, first: all.length ? Math.min(...all) : 1, last: all.length ? Math.max(...all) : 1, color: NOTE_MARKERS[i % NOTE_MARKERS.length] }
      }),
    [notes],
  )
  // line → the first note that explains it (its marker colour)
  const noteOfLine = useMemo(() => {
    const m = new Map<number, NoteInfo>()
    noteInfo.forEach((n) => n.set.forEach((l) => !m.has(l) && m.set(l, n)))
    return m
  }, [noteInfo])

  const small = sheetW !== null && sheetW < 600
  const fontPx = small ? 13.5 : 15
  const lh = small ? 24 : 26
  const longest = useMemo(() => Math.max(0, ...rawLines.map((l) => l.replace(/\t/g, '  ').length)), [rawLines])
  // notes go in the margin when the code still fits beside them without scrolling
  // sheet = gutter (line numbers) + code + right padding of a line | gap | margin column
  const codeRoom = (sheetW ?? 0) - (small ? 36 : 48) - 18 - 16 - 16 - MARGIN_W
  const inMargin = noteInfo.length > 0 && sheetW !== null && sheetW >= 640 && codeRoom >= longest * fontPx * 0.6 + 2
  // spare room goes to the margin (up to 340 px), so the notes sit closer to the code and wrap less
  const marginW = inMargin ? Math.round(Math.min(340, MARGIN_W + Math.max(0, codeRoom - longest * fontPx * 0.6 - 40))) : MARGIN_W

  const shownCount = expanded ? lineCount : Math.min(lineCount, previewLines + 1)
  const lastShown = expanded ? lineCount : previewLines
  const marginNotes = useMemo(() => (inMargin ? noteInfo.filter((n) => n.first <= lastShown) : []), [inMargin, noteInfo, lastShown])
  const hiddenNotes = inMargin ? noteInfo.length - marginNotes.length : 0
  const layoutKey = `${marginNotes.map((n) => n.i).join(',')}|${lh}|${sheetW}|${marginW}`
  const active = activeNote === null ? null : (noteInfo[activeNote] ?? null)

  // Margin notes sit level with their first line; a tall note pushes the next one down (measured, never overlapping).
  useEffect(() => {
    const ol = marginRef.current
    if (!ol || !inMargin) return
    const key = layoutKey
    const order = [...marginNotes].sort((a, b) => a.first - b.first || a.i - b.i)
    const measure = () => {
      const items = Array.from(ol.children) as HTMLElement[]
      const heightOf = new Map<number, number>()
      items.forEach((el) => heightOf.set(Number(el.dataset.note), el.offsetHeight))
      const tops: number[] = []
      let bottom = 0
      for (const n of order) {
        const want = PAD_TOP + (n.first - 1) * lh - 2
        const top = Math.max(want, bottom + 8)
        tops[n.i] = top
        bottom = top + (heightOf.get(n.i) ?? lh)
      }
      setLayout((old) => (old && old.key === key && old.height === bottom && old.tops.every((t, i) => t === tops[i]) && old.tops.length === tops.length ? old : { key, tops, height: bottom }))
    }
    const ro = new ResizeObserver(measure)
    ro.observe(ol)
    Array.from(ol.children).forEach((c) => ro.observe(c))
    return () => ro.disconnect()
  }, [layoutKey, inMargin, marginNotes, lh])

  // Is part of a line hidden to the right? Re-checked when the sheet or the code resizes and while scrolling.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const check = () => setSideways(el.scrollWidth - el.clientWidth - el.scrollLeft > 6)
    const ro = new ResizeObserver(check)
    ro.observe(el)
    const lines = el.querySelector('.k-code__lines')
    if (lines) ro.observe(lines)
    el.addEventListener('scroll', check, { passive: true })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', check)
    }
  }, [closed])

  const tops = layout && layout.key === layoutKey ? layout.tops : null
  // pin a note (click / focus): its lines stay marked, and collapsed code opens if they are hidden
  const pinNote = (i: number) => {
    setPinnedNote(i)
    if (!expanded && noteInfo[i] && noteInfo[i].last > previewLines) setExpanded(true)
  }
  // dim the other lines only when some of the active note's lines are on screen
  const activeVisible = active !== null && [...active.set].some((l) => l <= shownCount)

  const noteItem = (n: NoteInfo, positioned: boolean) => (
    <li
      key={n.i}
      data-note={n.i}
      className={`k-code__note${activeNote === n.i ? ' is-active' : ''}`}
      style={positioned ? { top: tops?.[n.i] ?? PAD_TOP + (n.first - 1) * lh } : undefined}
      onMouseEnter={() => setHoverNote(n.i)}
      onMouseLeave={() => setHoverNote(null)}
      onFocus={() => pinNote(n.i)}
      onBlur={() => setPinnedNote((p) => (p === n.i ? null : p))}
      onClick={() => pinNote(n.i)}
      tabIndex={0}
    >
      <span className="k-code__noteref">
        {positioned && <span aria-hidden="true">← </span>}
        <span className="k-mark" data-c={n.color} data-on="">
          {lineLabel(notes?.[n.i]?.lines ?? '')}
        </span>
        <span className="visually-hidden">{` (redak ${notes?.[n.i]?.lines ?? ''})`}</span>
      </span>{' '}
      <span className="k-code__notetext">{notes?.[n.i]?.text}</span>
    </li>
  )

  const langLabel = LANG_LABEL[lang] ?? lang

  return (
    <figure
      ref={sheetRef}
      className={`k-code k-pinned${wide ? ' k-wide' : ''}${closed ? ' is-closed' : ''}${small ? ' is-small' : ''}`}
      data-lang={lang}
      aria-label={`${title ?? langLabel}: ${plural(lineCount, ['redak', 'retka', 'redaka'])} koda`}
      style={{ ['--lh' as string]: `${lh}px`, ['--code-font' as string]: `${fontPx}px`, ['--margin-w' as string]: `${marginW}px` }}
    >
      <Outline seed={921} stroke="var(--ink-2)" strokeWidth={1.8} roughness={1.1} inset={1} />
      <Tape c="red" className="k-code__tape" style={{ top: -13, left: 64, transform: 'rotate(-4deg)' }} />
      {!closed && <Tape c="blue" className="k-code__tape" style={{ bottom: -12, right: 56, transform: 'rotate(3deg)' }} />}
      <figcaption className="k-code__head">
        <button type="button" className="k-code__file" onClick={() => setClosed((c) => !c)} aria-expanded={!closed} title={closed ? 'Prikaži kod' : 'Sakrij kod'}>
          <span className="k-code__filename">{title ?? langLabel}</span>
          <PenGlyph kind="chev" size={14} className="k-code__chev" />
        </button>
        {title && title !== langLabel && <span className="k-code__lang">{langLabel}</span>}
        <CopyButton source={source} />
      </figcaption>
      {caption && <p className="k-code__caption">{caption}</p>}
      {closed ? (
        <button type="button" className="k-code__more" onClick={() => setClosed(false)}>
          <PenUnderline />
          Prikaži kod ({plural(lineCount, ['redak', 'retka', 'redaka'])}) ↓
        </button>
      ) : (
        <>
          <div className={`k-code__body${inMargin ? ' has-margin' : ''}`}>
            {/* when lines run off to the right, the scroller is a tab stop so keyboard users can scroll it too */}
            <div
              ref={scrollRef}
              className={`k-code__scroll${!expanded ? ' is-collapsed' : ''}${sideways ? ' is-sideways' : ''}`}
              tabIndex={sideways ? 0 : undefined}
              role={sideways ? 'region' : undefined}
              aria-label={sideways ? `${title ?? langLabel} (povucite vodoravno)` : undefined}
            >
              <pre className="k-code__pre">
                <code className="k-code__lines">
                  {tokens.slice(0, shownCount).map((lineTokens, idx) => {
                    const n = idx + 1
                    const note = noteOfLine.get(n)
                    const isStatic = staticLines.has(n)
                    const on = active !== null && active.set.has(n)
                    const dim = activeVisible && !on
                    const { indent, rest } = splitIndent(lineTokens)
                    let body: ReactNode = <Tokens tokens={rest} />
                    if (rest.length && isStatic && !on) body = <Mark c="yellow">{body}</Mark>
                    else if (rest.length && (note || on)) {
                      const c = on && active ? active.color : (note?.color ?? 'yellow')
                      body = (
                        <span className="k-mark k-code__mk" data-c={c} data-on={on ? '' : undefined}>
                          {body}
                        </span>
                      )
                    }
                    return (
                      <span
                        key={idx}
                        className={`k-code__line${dim ? ' is-dimmed' : ''}${on ? ' is-on' : ''}`}
                        onMouseEnter={note ? () => setHoverNote(note.i) : undefined}
                        onMouseLeave={note ? () => setHoverNote(null) : undefined}
                      >
                        <span className="k-code__ln" aria-hidden="true">
                          {n}
                        </span>
                        <span className="k-code__lc">
                          {indent}
                          {body}
                          {'\n'}
                        </span>
                      </span>
                    )
                  })}
                </code>
              </pre>
            </div>
            {inMargin && (
              <ol className="k-code__margin" ref={marginRef} style={{ height: layout && layout.key === layoutKey ? layout.height : undefined }} aria-label="Bilješke uz kod">
                {marginNotes.map((n) => noteItem(n, true))}
              </ol>
            )}
          </div>
          {(canCollapse || sideways) && (
            <div className="k-code__foot">
              {canCollapse && (
                <button type="button" className="k-code__more" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
                  <PenUnderline />
                  {expanded
                    ? 'Sakrij dio koda ↑'
                    : `Prikaži cijeli kod (${plural(lineCount, ['redak', 'retka', 'redaka'])}${hiddenNotes ? ` · još ${plural(hiddenNotes, ['bilješka', 'bilješke', 'bilježaka'])}` : ''}) ↓`}
                </button>
              )}
              {sideways && (
                <span className="k-code__swipe" aria-hidden="true">
                  povucite →
                </span>
              )}
            </div>
          )}
          {!inMargin && noteInfo.length > 0 && (
            <ol className="k-code__notes" aria-label="Bilješke uz kod">
              {noteInfo.map((n) => noteItem(n, false))}
            </ol>
          )}
        </>
      )}
    </figure>
  )
}
