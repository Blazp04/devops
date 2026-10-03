import { useId, useState, type CSSProperties, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Rough } from './Sketch'
import { CoffeeRing, Helm, PeekDavor } from './Doodles'
import s from './bj.module.css'

/**
 * Highlighter swipe behind words; it is "drawn" once when it scrolls into view.
 * On paper: a translucent marker. On the chalkboard: coloured chalk, side-stroked under the word.
 * The same pen is used in prose and in code.
 */
export function Mark({ children, c = 'yellow' }: { children: ReactNode; c?: 'yellow' | 'pink' | 'green' | 'blue' | 'orange' }) {
  const [on, setOn] = useState(false)
  return (
    <motion.span className={s.mark} data-c={c} data-on={on ? '' : undefined} onViewportEnter={() => setOn(true)} viewport={{ once: true, margin: '0px 0px -8% 0px' }}>
      {children}
    </motion.span>
  )
}

/** Washi tape (on paper) / magnet (on the chalkboard). */
export function Tape({ style, c }: { style?: CSSProperties; c?: 'blue' | 'green' }) {
  return <span className={s.tape} data-c={c} style={style} aria-hidden="true" />
}

/**
 * The one section-heading system: a red handwritten "N · label" kicker always in the same spot above the printed title.
 * Only the doodled prop next to it changes with the kind of section (clock for the story, bolt for the "break it"
 * simulation, helm for Kubernetes, flip-book for steps, lunchboxes for code, "?" for the check, A–Ž for the glossary).
 */
export function SecHead({ n, kicker, title, id, prop }: { n: string; kicker: string; title: ReactNode; id?: string; prop?: ReactNode }) {
  return (
    <div className={s.sectionHead}>
      <div className={s.secText}>
        <span className={s.kicker}>
          <b>{n}</b> · {kicker}
        </span>
        <h2 className={s.h2} id={id}>
          {title}
        </h2>
      </div>
      {prop && (
        <span className={s.secProp} aria-hidden="true">
          {prop}
        </span>
      )}
    </div>
  )
}

/* ---------- heading props (all 96 × 72, same pen) ---------- */

function PropSvg({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 96 72">{children}</svg>
}

/** 1 · story: the clock at noon. */
export function PropClock() {
  return (
    <PropSvg>
      <Rough shape={{ k: 'ellipse', cx: 44, cy: 38, w: 54, h: 54 }} seed={1961} strokeWidth={2} />
      <Rough shape={{ k: 'line', x1: 44, y1: 38, x2: 44, y2: 18 }} seed={1962} strokeWidth={2.4} />
      <Rough shape={{ k: 'line', x1: 44, y1: 38, x2: 45, y2: 25 }} seed={1963} strokeWidth={3.2} />
      {[0, 1, 2, 3].map((i) => {
        const a = (i * Math.PI) / 2
        return <Rough key={i} shape={{ k: 'line', x1: 44 + Math.sin(a) * 20, y1: 38 - Math.cos(a) * 20, x2: 44 + Math.sin(a) * 24, y2: 38 - Math.cos(a) * 24 }} seed={1964 + i} strokeWidth={1.5} roughness={0.4} />
      })}
      <Rough shape={{ k: 'line', x1: 80, y1: 10, x2: 86, y2: 4 }} seed={1968} strokeWidth={1.8} stroke="var(--red)" />
      <Rough shape={{ k: 'line', x1: 82, y1: 20, x2: 92, y2: 18 }} seed={1969} strokeWidth={1.8} stroke="var(--red)" />
      <Rough shape={{ k: 'line', x1: 8, y1: 10, x2: 3, y2: 4 }} seed={1970} strokeWidth={1.8} stroke="var(--red)" />
    </PropSvg>
  )
}

/** 2 · simulation: a lightning bolt — please break this. */
export function PropBolt() {
  return (
    <PropSvg>
      <Rough
        shape={{
          k: 'poly',
          pts: [
            [52, 4],
            [26, 40],
            [44, 40],
            [34, 68],
            [70, 26],
            [52, 26],
            [62, 4],
          ],
        }}
        seed={1971}
        strokeWidth={2}
        stroke="var(--red)"
        fillColor="var(--hl-yellow-ink)"
        hachureGap={3.4}
      />
      <Rough shape={{ k: 'line', x1: 76, y1: 46, x2: 88, y2: 52 }} seed={1972} strokeWidth={1.8} stroke="var(--red)" />
      <Rough shape={{ k: 'line', x1: 74, y1: 58, x2: 84, y2: 68 }} seed={1973} strokeWidth={1.8} stroke="var(--red)" />
    </PropSvg>
  )
}

/** 3 · Kubernetes: the helm. */
export function PropHelm() {
  return (
    <PropSvg>
      <Helm x={48} y={36} r={22} seed={1975} />
    </PropSvg>
  )
}

/** 4 · step by step: a tiny flip-book, the tray moves one frame at a time. */
export function PropFlip() {
  return (
    <PropSvg>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <Rough shape={{ k: 'rect', x: 2 + i * 31, y: 14, w: 28, h: 40 }} seed={1911 + i} strokeWidth={1.5} fillColor="var(--paper)" fillStyle="solid" />
          <circle cx={9 + i * 31 + i * 7} cy={34} r={3.6} className={s.trayDot} />
          <text x={26 + i * 31} y={50} textAnchor="end" className={s.svgHand} style={{ fontSize: 13, fill: 'var(--ink-3)' }}>
            {i + 1}
          </text>
        </g>
      ))}
    </PropSvg>
  )
}

/** 5 · code: three identical lunchboxes = replicas: 3. */
export function PropBoxes() {
  return (
    <PropSvg>
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${4 + i * 30} ${i === 1 ? 18 : 26})`}>
          <Rough shape={{ k: 'arc', cx: 13, cy: 2, w: 12, h: 10, start: Math.PI, stop: Math.PI * 2 }} seed={1980 + i} strokeWidth={1.5} />
          <Rough shape={{ k: 'rect', x: 0, y: 2, w: 26, h: 22 }} seed={1983 + i} strokeWidth={1.7} fillColor="var(--hl-blue-ink)" hachureGap={4} />
        </g>
      ))}
      <text x={92} y={70} textAnchor="end" className={s.svgHand} style={{ fontSize: 16, fill: 'var(--red)' }}>
        ×3
      </text>
    </PropSvg>
  )
}

/** 6 · check: a red-pen question mark, circled. */
export function PropQuestion() {
  return (
    <PropSvg>
      <Rough shape={{ k: 'ellipse', cx: 48, cy: 36, w: 58, h: 60 }} seed={1990} strokeWidth={2.2} stroke="var(--red)" multi />
      <Rough
        shape={{
          k: 'curve',
          pts: [
            [36, 26],
            [40, 15],
            [52, 14],
            [58, 24],
            [50, 34],
            [48, 44],
          ],
        }}
        seed={1991}
        strokeWidth={3}
        stroke="var(--red)"
      />
      <Rough shape={{ k: 'ellipse', cx: 48, cy: 55, w: 6, h: 6 }} seed={1992} strokeWidth={2} stroke="var(--red)" fillColor="var(--red)" fillStyle="solid" />
    </PropSvg>
  )
}

/** 7 · glossary: the back of the notebook, A–Ž. */
export function PropIndex() {
  return (
    <PropSvg>
      <Rough shape={{ k: 'rect', x: 8, y: 8, w: 56, h: 60 }} seed={1995} strokeWidth={1.7} fillColor="var(--paper)" fillStyle="solid" />
      {[0, 1, 2].map((i) => (
        <Rough key={i} shape={{ k: 'rect', x: 64, y: 12 + i * 18, w: 16, h: 14 }} seed={1996 + i} strokeWidth={1.4} fillColor={['var(--hl-yellow-ink)', 'var(--hl-pink-ink)', 'var(--hl-green-ink)'][i]} hachureGap={3} />
      ))}
      <text x={36} y={46} textAnchor="middle" className={s.svgHand} style={{ fontSize: 24, fill: 'var(--pen)' }}>
        A–Ž
      </text>
    </PropSvg>
  )
}

/** Glossary term: wavy pen underline; the definition is a little blue note taped above it. */
export function Term({ children, def }: { children: ReactNode; def: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <span style={{ position: 'relative', display: 'inline' }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className={s.term}
        aria-describedby={id}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      >
        {children}
      </button>
      <motion.span
        id={id}
        role="tooltip"
        className={s.termTip}
        initial={false}
        animate={open ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 6, scale: 0.97 }}
        transition={{ duration: 0.16 }}
        style={{ pointerEvents: open ? 'auto' : 'none', display: 'block' }}
      >
        <Tape c="blue" />
        <b>pojmovnik</b>
        {def}
      </motion.span>
    </span>
  )
}

/** A wobbly underline (for nav links, headings). */
export function Squiggle({ color = 'var(--red)', seed = 9 }: { color?: string; seed?: number }) {
  return (
    <svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
      <Rough
        shape={{
          k: 'curve',
          pts: [
            [2, 6],
            [25, 3],
            [50, 7],
            [75, 3],
            [98, 6],
          ],
        }}
        seed={seed}
        stroke={color}
        strokeWidth={2}
        roughness={0.8}
      />
    </svg>
  )
}

/** Empty / ticked checkbox drawn by hand. */
export function CheckBox({ checked, seed = 1, color = 'var(--ink)' }: { checked?: boolean; seed?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <Rough shape={{ k: 'rect', x: 2, y: 3, w: 19, h: 18 }} seed={seed} stroke={color} strokeWidth={1.6} roughness={1.2} />
      {checked && (
        <Rough
          shape={{
            k: 'lin',
            pts: [
              [6, 11],
              [11, 17],
              [24, -2],
            ],
          }}
          seed={seed + 1}
          stroke="var(--green)"
          strokeWidth={2.4}
          draw
          duration={0.35}
        />
      )}
    </svg>
  )
}

/** Tiny doodled clock. */
export function ClockIcon({ seed = 4 }: { seed?: number }) {
  return (
    <svg viewBox="0 0 26 26" aria-hidden="true">
      <Rough shape={{ k: 'ellipse', cx: 13, cy: 13, w: 22, h: 22 }} seed={seed} strokeWidth={1.6} />
      <Rough
        shape={{
          k: 'lin',
          pts: [
            [13, 6],
            [13, 13],
            [18, 16],
          ],
        }}
        seed={seed + 1}
        strokeWidth={1.6}
        roughness={0.5}
      />
    </svg>
  )
}

/** Margin doodles that live in the gaps between sections (decoration only). */
export function MarginDoodle({ kind, style }: { kind: 'coffee' | 'peek' | 'bang' | 'stars'; style?: CSSProperties }) {
  return (
    <span className={s.marginDoodle} data-kind={kind} style={style} aria-hidden="true">
      {kind === 'coffee' && (
        <svg viewBox="0 0 100 100" width="118" height="118">
          <CoffeeRing />
        </svg>
      )}
      {kind === 'peek' && (
        <svg viewBox="-12 -36 112 50" width="132" height="60">
          <PeekDavor />
        </svg>
      )}
      {kind === 'bang' && (
        <svg viewBox="0 0 60 80" width="48" height="64">
          <Rough shape={{ k: 'path', d: 'M26 6 L36 6 L32 52 Z' }} seed={1931} strokeWidth={2} stroke="var(--red)" fillColor="var(--red)" hachureGap={2.5} />
          <Rough shape={{ k: 'ellipse', cx: 31, cy: 66, w: 10, h: 10 }} seed={1932} strokeWidth={2} stroke="var(--red)" fillColor="var(--red)" fillStyle="solid" />
          <Rough shape={{ k: 'line', x1: 6, y1: 18, x2: 16, y2: 26 }} seed={1933} strokeWidth={1.6} stroke="var(--red)" />
          <Rough shape={{ k: 'line', x1: 54, y1: 16, x2: 44, y2: 26 }} seed={1934} strokeWidth={1.6} stroke="var(--red)" />
        </svg>
      )}
      {kind === 'stars' && (
        <svg viewBox="0 0 90 60" width="90" height="60">
          {[
            [16, 18, 9],
            [52, 12, 6],
            [70, 40, 8],
          ].map(([x, y, r], i) => (
            <g key={i}>
              <Rough shape={{ k: 'line', x1: x - r, y1: y, x2: x + r, y2: y }} seed={1940 + i} strokeWidth={1.6} stroke="var(--pen)" />
              <Rough shape={{ k: 'line', x1: x, y1: y - r, x2: x, y2: y + r }} seed={1944 + i} strokeWidth={1.6} stroke="var(--pen)" />
              <Rough shape={{ k: 'line', x1: x - r * 0.6, y1: y - r * 0.6, x2: x + r * 0.6, y2: y + r * 0.6 }} seed={1948 + i} strokeWidth={1.2} stroke="var(--pen)" />
            </g>
          ))}
        </svg>
      )}
    </span>
  )
}
