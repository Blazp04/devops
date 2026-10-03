import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { AccentColor } from '../../curriculum/types'
import { Check, Cross, Rough, RoughAround, RoughBox, RoughRule } from '../sketch/Sketch'
import { TickBox } from '../doodles/text-doodles'
import type { MarginTone } from './types'

interface FigureProps {
  children: ReactNode
  caption?: ReactNode
  /** Break out of the reading column (up to ~1120px). */
  wide?: boolean
  /** Draw a pencil frame around the visual (default true). */
  framed?: boolean
  /** Draw the frame on when it scrolls into view (default true). */
  reveal?: boolean
}

/** Wrapper for a visual (diagram, animation, image) drawn into the notebook, with a caption under it. */
export function Figure({ children, caption, wide, framed = true, reveal = true }: FigureProps) {
  const cls = `k-figure${wide ? ' k-wide' : ''}${framed ? ' is-framed' : ''}`
  return (
    <figure className={cls}>
      {framed ? (
        <RoughBox className="k-figure__stage" stroke="var(--ink-3)" strokeWidth={1.4} roughness={1.2} seed={5301} draw={reveal}>
          {children}
        </RoughBox>
      ) : (
        <div className="k-figure__stage">{children}</div>
      )}
      {caption && <figcaption className="k-figure__caption">{caption}</figcaption>}
    </figure>
  )
}

interface CompareColumn {
  title: ReactNode
  /** Optional icon/visual above the list */
  visual?: ReactNode
  tone?: AccentColor
  points: ReactNode[]
}

/** Side-by-side comparison (e.g. VM vs container, push vs pull): two pages drawn in coloured pencil, "vs." between. */
export function Compare({ left, right, wide }: { left: CompareColumn; right: CompareColumn; wide?: boolean }) {
  const cols = [left, right]
  return (
    <div className={`k-compare${wide ? ' k-wide' : ''}`}>
      {cols.map((col, i) => (
        <RoughBox key={i} className={`k-compare__col k-tone-${col.tone ?? (i === 0 ? 'blue' : 'violet')}`} stroke="var(--tone)" strokeWidth={1.6} roughness={1.3} seed={5311 + i * 7}>
          <div className="k-compare__title">{col.title}</div>
          {col.visual && <div className="k-compare__visual">{col.visual}</div>}
          <ul>
            {col.points.map((p, j) => (
              <li key={j}>{p}</li>
            ))}
          </ul>
        </RoughBox>
      ))}
      <span className="k-compare__vs" aria-hidden="true">
        <RoughAround stroke="var(--red)" seed={5320} padX={10} padY={4} strokeWidth={1.8} draw>
          vs.
        </RoughAround>
      </span>
    </div>
  )
}

interface TabsProps {
  tabs: { label: ReactNode; content: ReactNode }[]
  wide?: boolean
}

const TAB_PAPER = ['yellow', 'pink', 'green', 'blue', 'orange', 'lilac'] as const

/**
 * Tabbed content (several related files or alternative tools) as the notebook's coloured index tabs: the open tab
 * stands up on the page's pencil line, the others sit lower behind it. Arrow keys move between tabs.
 */
export function Tabs({ tabs, wide }: TabsProps) {
  const [active, setActive] = useState(0)
  const base = useId()
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = (active + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length
    setActive(next)
    document.getElementById(`${base}-tab-${next}`)?.focus()
  }
  return (
    <div className={`k-tabs${wide ? ' k-wide' : ''}`}>
      <div className="k-tabs__list" role="tablist" onKeyDown={onKey}>
        {tabs.map((t, i) => (
          <button
            key={i}
            id={`${base}-tab-${i}`}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-controls={`${base}-panel`}
            tabIndex={i === active ? 0 : -1}
            data-c={TAB_PAPER[i % TAB_PAPER.length]}
            className={`k-tabs__tab${i === active ? ' is-active' : ''}`}
            onClick={() => setActive(i)}
          >
            <span className="k-tabs__label">{t.label}</span>
          </button>
        ))}
      </div>
      <RoughRule className="k-tabs__rule" stroke="var(--ink-3)" seed={5331} />
      <div className="k-tabs__panel" role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${active}`}>
        {tabs[active].content}
      </div>
    </div>
  )
}

/**
 * End-of-lecture summary, "Zapamtite": the few things to remember, in the same double blue-pen box as the lecture's
 * objectives, each point with a pencil box that ticks itself (green pen) when it scrolls into view.
 */
export function Recap({ points, title = 'Zapamtite' }: { points: ReactNode[]; title?: ReactNode }) {
  return (
    <RoughBox className="k-recap" stroke="var(--pen)" strokeWidth={1.8} roughness={1.2} double seed={5341}>
      <div className="k-recap__title">
        <span className="k-recap__mark">!</span>
        {title}
      </div>
      <ul>
        {points.map((p, i) => (
          <li key={i}>
            <TickBox checked delay={0.15 + i * 0.18} seed={5350 + i * 3} color="var(--pen)" className="k-recap__box" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </RoughBox>
  )
}

/** Small inline label as a luggage tag (status chips inside text, compressed-time notes). */
export function Badge({ children, tone = 'blue' }: { children: ReactNode; tone?: AccentColor | 'ok' | 'warn' | 'bad' | 'neutral' }) {
  return <span className={`k-badge k-badge--${tone}`}>{children}</span>
}

const SWATCH_SEED = 5361

/**
 * Colour key for a drawing, written by hand next to small pencil swatches. Prefer labels on the drawing itself.
 * Shapes: dot · square (hatched) · bar (solid marker bar) · line · dashed (line) · tray (a request) · check (✓, healthy) ·
 * cross (✗, failed) — pick the mark the drawing uses, so the key never depends on colour alone.
 */
export function Legend({ items }: { items: { color: string; label: ReactNode; shape?: 'dot' | 'square' | 'bar' | 'line' | 'dashed' | 'tray' | 'check' | 'cross' }[] }) {
  return (
    <div className="k-legend">
      {items.map((it, i) => (
        <span key={i} className="k-legend__item">
          <svg className="k-legend__swatch" viewBox="0 0 24 16" aria-hidden="true">
            {(it.shape ?? 'dot') === 'dot' && <Rough shape={{ k: 'ellipse', cx: 12, cy: 8, w: 11, h: 11 }} seed={SWATCH_SEED + i} stroke={it.color} fillColor={it.color} fillStyle="solid" strokeWidth={1.2} />}
            {it.shape === 'square' && <Rough shape={{ k: 'rect', x: 5, y: 2, w: 13, h: 12 }} seed={SWATCH_SEED + i} stroke={it.color} fillColor={it.color} hachureGap={2.6} strokeWidth={1.4} />}
            {it.shape === 'bar' && <Rough shape={{ k: 'rect', x: 2, y: 4, w: 20, h: 9 }} seed={SWATCH_SEED + i} stroke="var(--ink-2)" fillColor={it.color} fillStyle="solid" strokeWidth={1.1} roughness={0.6} />}
            {it.shape === 'line' && <Rough shape={{ k: 'line', x1: 1, y1: 8, x2: 23, y2: 8 }} seed={SWATCH_SEED + i} stroke={it.color} strokeWidth={2.6} roughness={0.8} />}
            {it.shape === 'dashed' && <Rough shape={{ k: 'line', x1: 1, y1: 8, x2: 23, y2: 8 }} seed={SWATCH_SEED + i} stroke={it.color} strokeWidth={2.4} roughness={0.6} dash="4 3" />}
            {it.shape === 'tray' && (
              <g>
                <path d="M3 8.5 L21 8 L19.5 13.2 L4.5 13.5 Z" style={{ fill: it.color, stroke: 'var(--ink)', strokeWidth: 1.1, strokeLinejoin: 'round' }} />
                <ellipse cx={10} cy={7.6} rx={3.6} ry={1.7} style={{ fill: 'var(--paper)', stroke: 'var(--ink)', strokeWidth: 1 }} />
              </g>
            )}
            {it.shape === 'check' && <Check x={12} y={9} size={6} seed={SWATCH_SEED + i} stroke={it.color} strokeWidth={2.4} />}
            {it.shape === 'cross' && <Cross x={12} y={8} size={5.5} seed={SWATCH_SEED + i} stroke={it.color} strokeWidth={2.4} />}
          </svg>
          {it.label}
        </span>
      ))}
    </div>
  )
}

/**
 * Horizontal scroll container for diagrams that cannot shrink below `minWidth` on phones.
 * Prefer a real narrow layout (useWidth / useNarrow) for important visuals; use this as a fallback.
 */
export function ScrollX({ children, minWidth = 600 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="k-scrollx">
      {/* a tab stop so keyboard users can scroll it (Safari does not make scroll areas focusable) */}
      <div className="k-scrollx__inner" tabIndex={0} role="region" aria-label="Široki sadržaj (povucite vodoravno)">
        <div style={{ minWidth }}>{children}</div>
      </div>
      <div className="k-scrollx__hint" aria-hidden>
        ← povucite →
      </div>
    </div>
  )
}

/** Keyboard key drawn as a little keycap: <Kbd>Ctrl</Kbd> */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="k-kbd">{children}</kbd>
}

/**
 * A note in the author's handwriting (Caveat, max ~2 lines) that sits in the right margin of the page on wide
 * screens and under the paragraph on narrow ones. Put it BEFORE the paragraph it comments on.
 *   <MarginNote>12:00 → 400 narudžbi u 5 minuta</MarginNote>
 */
export function MarginNote({ children, tone = 'pen' }: { children: ReactNode; tone?: MarginTone }) {
  return (
    <motion.aside className="k-margin-note" data-tone={tone} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.25 }}>
      <svg className="k-margin-note__arrow" viewBox="0 0 40 34" aria-hidden="true">
        <Rough
          shape={{
            k: 'curve',
            pts: [
              [38, 8],
              [20, 4],
              [5, 20],
            ],
          }}
          seed={5371}
          stroke="currentColor"
          strokeWidth={1.6}
          roughness={0.8}
        />
        <Rough
          shape={{
            k: 'lin',
            pts: [
              [3, 11],
              [5, 20],
              [13, 17],
            ],
          }}
          seed={5372}
          stroke="currentColor"
          strokeWidth={1.6}
          roughness={0.6}
        />
      </svg>
      {children}
    </motion.aside>
  )
}
