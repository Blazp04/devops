import type { ReactNode } from 'react'
import { Arrow, Check, Rough } from '../sketch/Sketch'
import { Helm } from './Things'
import type { PropKind } from './types'

/* =====================================================================
   Section-head props: one small doodle next to every section title
   (96 × 72, same pen). The heading skeleton never changes — red
   handwritten kicker "N · label" above the printed title — only this
   prop changes with the kind of section. Each prop is its own <svg>;
   size it with CSS (the Section heading does).
   ===================================================================== */

function PropSvg({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <svg viewBox="0 0 96 72" aria-hidden={label ? undefined : 'true'} role={label ? 'img' : undefined} aria-label={label}>
      {children}
    </svg>
  )
}

/** story: the clock at noon (12:00 in the menza). */
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

/** try it / break it: a lightning bolt. */
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

/** Kubernetes: the helm. */
export function PropHelm() {
  return (
    <PropSvg>
      <Helm x={48} y={36} r={22} seed={1975} />
    </PropSvg>
  )
}

/** step by step: a tiny flip-book, the tray moves one frame at a time. */
export function PropFlip() {
  return (
    <PropSvg>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <Rough shape={{ k: 'rect', x: 2 + i * 31, y: 14, w: 28, h: 40 }} seed={1911 + i} strokeWidth={1.5} fillColor="var(--paper)" fillStyle="solid" />
          <circle cx={9 + i * 31 + i * 7} cy={34} r={3.6} className="k-tray-dot" />
          <text x={26 + i * 31} y={50} textAnchor="end" className="k-svg-hand" style={{ fontSize: 13, fill: 'var(--ink-3)' }}>
            {i + 1}
          </text>
        </g>
      ))}
    </PropSvg>
  )
}

/** code: three identical lunchboxes = replicas: 3. */
export function PropBoxes() {
  return (
    <PropSvg>
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${4 + i * 30} ${i === 1 ? 18 : 26})`}>
          <Rough shape={{ k: 'arc', cx: 13, cy: 2, w: 12, h: 10, start: Math.PI, stop: Math.PI * 2 }} seed={1980 + i} strokeWidth={1.5} />
          <Rough shape={{ k: 'rect', x: 0, y: 2, w: 26, h: 22 }} seed={1983 + i} strokeWidth={1.7} fillColor="var(--hl-blue-ink)" hachureGap={4} />
        </g>
      ))}
      <text x={92} y={70} textAnchor="end" className="k-svg-hand" style={{ fontSize: 16, fill: 'var(--red)' }}>
        ×3
      </text>
    </PropSvg>
  )
}

/** check: a red-pen question mark, circled. */
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

/** glossary: the back of the notebook, A–Ž with index tabs. */
export function PropIndex() {
  return (
    <PropSvg>
      <Rough shape={{ k: 'rect', x: 8, y: 8, w: 56, h: 60 }} seed={1995} strokeWidth={1.7} fillColor="var(--paper)" fillStyle="solid" />
      {[0, 1, 2].map((i) => (
        <Rough key={i} shape={{ k: 'rect', x: 64, y: 12 + i * 18, w: 16, h: 14 }} seed={1996 + i} strokeWidth={1.4} fillColor={['var(--hl-yellow-ink)', 'var(--hl-pink-ink)', 'var(--hl-green-ink)'][i]} hachureGap={3} />
      ))}
      <text x={36} y={46} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 24, fill: 'var(--pen)' }}>
        A–Ž
      </text>
    </PropSvg>
  )
}

/** message queue: trays waiting in a tube, one leaving at the end. */
export function PropQueue() {
  return (
    <PropSvg>
      <Rough shape={{ k: 'rect', x: 6, y: 24, w: 62, h: 28 }} seed={2041} strokeWidth={1.9} />
      <Rough shape={{ k: 'line', x1: 6, y1: 30, x2: 68, y2: 29 }} seed={2042} strokeWidth={0.9} stroke="var(--ink-3)" />
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${18 + i * 18} 41) scale(0.75)`}>
          <path d="M-9 -2.5 L9 -3 L7.5 3.2 L-7.5 3.5 Z" className="k-tray-body" />
          <ellipse cx={-2} cy={-2.6} rx={3.6} ry={1.7} className="k-tray-plate" />
        </g>
      ))}
      <Arrow
        pts={[
          [72, 38],
          [82, 37],
          [92, 38],
        ]}
        seed={2043}
        stroke="var(--pen)"
        strokeWidth={1.8}
        head={7}
      />
      <text x={36} y={18} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 14, fill: 'var(--ink-3)' }}>
        FIFO
      </text>
    </PropSvg>
  )
}

/** container: a closed food box with a lid and ribs (a container inside the lunchbox). */
export function PropBox() {
  return (
    <PropSvg>
      <Rough shape={{ k: 'rect', x: 16, y: 26, w: 62, h: 38 }} seed={2051} strokeWidth={1.9} fillColor="var(--hl-pink-ink)" hachureGap={4.5} />
      <Rough shape={{ k: 'rect', x: 12, y: 16, w: 70, h: 11 }} seed={2052} strokeWidth={1.8} fillColor="var(--paper)" fillStyle="solid" />
      {[0, 1, 2].map((i) => (
        <Rough key={i} shape={{ k: 'line', x1: 32 + i * 15, y1: 31, x2: 32 + i * 15, y2: 60 }} seed={2053 + i} strokeWidth={1.2} roughness={0.6} />
      ))}
      <Rough shape={{ k: 'curve', pts: [[84, 10], [90, 6], [92, 14]] }} seed={2057} strokeWidth={1.4} stroke="var(--ink-3)" />
    </PropSvg>
  )
}

/** Git / CI: commit beads on a pencil string, a branch in green marker that merges back. */
export function PropGit() {
  return (
    <PropSvg>
      <Rough shape={{ k: 'line', x1: 4, y1: 46, x2: 92, y2: 46 }} seed={2061} strokeWidth={1.8} />
      <Rough shape={{ k: 'curve', pts: [[26, 46], [38, 22], [58, 22], [70, 46]] }} seed={2062} strokeWidth={2.2} stroke="var(--hl-green-ink)" />
      {[14, 40, 84].map((x, i) => (
        <Rough key={x} shape={{ k: 'ellipse', cx: x, cy: 46, w: 13, h: 13 }} seed={2063 + i} strokeWidth={1.8} fillColor="var(--paper)" fillStyle="solid" />
      ))}
      <Rough shape={{ k: 'ellipse', cx: 48, cy: 22, w: 13, h: 13 }} seed={2067} strokeWidth={1.8} stroke="var(--green)" fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'ellipse', cx: 70, cy: 46, w: 13, h: 13 }} seed={2068} strokeWidth={1.8} fillColor="var(--pen)" fillStyle="solid" />
      <text x={84} y={68} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 11, fill: 'var(--ink-2)' }}>
        a1f
      </text>
    </PropSvg>
  )
}

/** secrets / access: a padlock over a sealed envelope. */
export function PropLock() {
  return (
    <PropSvg>
      <Rough shape={{ k: 'rect', x: 34, y: 30, w: 56, h: 36 }} seed={2071} strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'lin', pts: [[36, 32], [62, 52], [88, 32]] }} seed={2072} strokeWidth={1.3} />
      <Rough shape={{ k: 'ellipse', cx: 62, cy: 52, w: 12, h: 11 }} seed={2073} strokeWidth={1.3} stroke="var(--red)" fillColor="var(--red)" fillStyle="solid" />
      <Rough shape={{ k: 'arc', cx: 22, cy: 30, w: 22, h: 28, start: Math.PI, stop: Math.PI * 2 }} seed={2074} strokeWidth={2.4} />
      <Rough shape={{ k: 'rect', x: 6, y: 30, w: 32, h: 28 }} seed={2075} strokeWidth={1.9} fillColor="var(--hl-yellow-ink)" hachureGap={3.4} />
      <Rough shape={{ k: 'ellipse', cx: 22, cy: 41, w: 6, h: 6 }} seed={2076} strokeWidth={1.4} fillColor="var(--ink)" fillStyle="solid" />
      <Rough shape={{ k: 'line', x1: 22, y1: 43, x2: 22, y2: 50 }} seed={2077} strokeWidth={2} />
    </PropSvg>
  )
}

/** Argo CD / GitOps: the reconciliation loop between the notebook (Git) and the cluster, with a "Synced" tick. */
export function PropLoop() {
  return (
    <PropSvg>
      <Rough shape={{ k: 'rect', x: 4, y: 22, w: 24, h: 30 }} seed={2081} strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'line', x1: 9, y1: 31, x2: 23, y2: 31 }} seed={2082} strokeWidth={1} stroke="var(--ink-3)" />
      <Rough shape={{ k: 'line', x1: 9, y1: 38, x2: 21, y2: 38 }} seed={2083} strokeWidth={1} stroke="var(--ink-3)" />
      <Rough shape={{ k: 'rect', x: 68, y: 22, w: 24, h: 30 }} seed={2084} strokeWidth={1.6} multi />
      <Rough shape={{ k: 'arc', cx: 48, cy: 37, w: 40, h: 40, start: 3.5, stop: 5.95 }} seed={2085} strokeWidth={2} stroke="var(--pen)" />
      <Rough shape={{ k: 'arc', cx: 48, cy: 37, w: 40, h: 40, start: 0.35, stop: 2.8 }} seed={2086} strokeWidth={2} stroke="var(--pen)" />
      <Rough shape={{ k: 'lin', pts: [[62, 14], [66, 20], [60, 23]] }} seed={2087} strokeWidth={1.8} stroke="var(--pen)" />
      <Rough shape={{ k: 'lin', pts: [[34, 60], [30, 54], [36, 51]] }} seed={2088} strokeWidth={1.8} stroke="var(--pen)" />
      <Check x={80} y={37} size={6} seed={2089} />
    </PropSvg>
  )
}

/** Any section prop by kind (the Section heading uses this): `<SectionProp kind="bolt" />`. */
export function SectionProp({ kind }: { kind: PropKind }) {
  switch (kind) {
    case 'clock':
      return <PropClock />
    case 'bolt':
      return <PropBolt />
    case 'helm':
      return <PropHelm />
    case 'flip':
      return <PropFlip />
    case 'boxes':
      return <PropBoxes />
    case 'question':
      return <PropQuestion />
    case 'index':
      return <PropIndex />
    case 'queue':
      return <PropQueue />
    case 'box':
      return <PropBox />
    case 'git':
      return <PropGit />
    case 'lock':
      return <PropLock />
    case 'loop':
      return <PropLoop />
  }
}
