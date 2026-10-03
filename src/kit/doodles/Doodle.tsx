import { Arrow, Check, Cross, Rough } from '../sketch/Sketch'
import { hashSeed } from '../sketch/roughGen'
import { Helm, ServerFace, Tray } from './Things'
import type { DoodleKind } from './types'

/* =====================================================================
   Small doodles (64 × 48) from the illustration grammar: glossary
   entries, course-map stations, legends, little icons in text.
   Doodle = a <g> for use inside your own <svg>; DoodleIcon = its own <svg>.
   ===================================================================== */

function Body({ kind }: { kind: DoodleKind }) {
  const k = 2700 + (hashSeed(kind) % 900)
  switch (kind) {
    case 'lb':
      // one tray fanned out to three servers
      return (
        <g>
          <Tray x={13} y={25} w={22} />
          {[8, 24, 40].map((y, i) => (
            <Arrow key={i} pts={[[28, 25], [44, (25 + y) / 2], [60, y]]} stroke="var(--ink-2)" strokeWidth={1.4} head={6} seed={k + i * 3} />
          ))}
        </g>
      )
    case 'hc':
      // the redar's clipboard: ✓ healthy, ✗ failed
      return (
        <g>
          <Rough shape={{ k: 'rect', x: 14, y: 6, w: 34, h: 40 }} seed={k} strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" />
          <Rough shape={{ k: 'rect', x: 23, y: 2, w: 16, h: 7 }} seed={k + 1} strokeWidth={1.3} fillColor="var(--ink-3)" fillStyle="solid" />
          <Check x={26} y={22} size={6} seed={k + 2} />
          <Cross x={26} y={36} size={4.5} seed={k + 3} strokeWidth={1.8} />
          <Rough shape={{ k: 'line', x1: 35, y1: 22, x2: 44, y2: 22 }} seed={k + 4} strokeWidth={1.1} />
          <Rough shape={{ k: 'line', x1: 35, y1: 36, x2: 44, y2: 36 }} seed={k + 5} strokeWidth={1.1} />
        </g>
      )
    case 'p95':
      // latency histogram with the red p95 line
      return (
        <g>
          {[30, 22, 12, 8, 5, 3].map((h, i) => (
            <Rough key={i} shape={{ k: 'rect', x: 4 + i * 9, y: 44 - h, w: 7, h }} seed={k + i} strokeWidth={1.2} fillColor="var(--hl-orange-ink)" hachureGap={2.6} />
          ))}
          <Rough shape={{ k: 'line', x1: 46, y1: 4, x2: 46, y2: 46 }} seed={k + 8} strokeWidth={1.8} stroke="var(--red)" />
          <Rough shape={{ k: 'line', x1: 2, y1: 45, x2: 62, y2: 45 }} seed={k + 9} strokeWidth={1.4} />
        </g>
      )
    case 'err':
      // a tray on the floor = 502 / 503
      return (
        <g>
          <Tray x={28} y={32} w={30} rotate={24} />
          <Cross x={30} y={22} size={10} seed={k} strokeWidth={2.4} />
          <Rough shape={{ k: 'line', x1: 4, y1: 44, x2: 60, y2: 44 }} seed={k + 1} strokeWidth={1.3} stroke="var(--ink-3)" />
        </g>
      )
    case 'pod':
      return (
        <g>
          <Rough shape={{ k: 'arc', cx: 32, cy: 12, w: 18, h: 13, start: Math.PI, stop: Math.PI * 2 }} seed={k} strokeWidth={1.6} />
          <Rough shape={{ k: 'rect', x: 12, y: 12, w: 40, h: 30 }} seed={k + 1} strokeWidth={1.8} fillColor="var(--hl-blue-ink)" hachureGap={4.5} />
          <rect x={38} y={9} width={14} height={8} transform="rotate(6 45 13)" className="k-vtape k-vtape--v1" />
        </g>
      )
    case 'svc':
      // luggage tag
      return (
        <g>
          <Rough shape={{ k: 'path', d: 'M18 12 L58 12 L58 38 L18 38 L6 25 Z' }} seed={k} strokeWidth={1.7} fillColor="var(--paper)" fillStyle="solid" />
          <Rough shape={{ k: 'ellipse', cx: 15, cy: 25, w: 6, h: 6 }} seed={k + 1} strokeWidth={1.3} />
          <Rough shape={{ k: 'line', x1: 24, y1: 22, x2: 50, y2: 22 }} seed={k + 2} strokeWidth={1.1} stroke="var(--ink-3)" />
          <Rough shape={{ k: 'line', x1: 24, y1: 30, x2: 44, y2: 30 }} seed={k + 3} strokeWidth={1.1} stroke="var(--ink-3)" />
        </g>
      )
    case 'node':
      // the building with a fuel bar, one slot used, one free
      return (
        <g>
          <Rough shape={{ k: 'rect', x: 4, y: 6, w: 56, h: 38 }} seed={k} strokeWidth={1.8} roughness={1.5} />
          <Rough shape={{ k: 'rect', x: 10, y: 18, w: 18, h: 20 }} seed={k + 1} strokeWidth={1.3} fillColor="var(--hl-blue-ink)" hachureGap={3.5} />
          <Rough shape={{ k: 'rect', x: 34, y: 18, w: 18, h: 20 }} seed={k + 2} strokeWidth={1.1} stroke="var(--ink-3)" dash="2 4" />
          <Rough shape={{ k: 'line', x1: 10, y1: 12, x2: 30, y2: 12 }} seed={k + 3} strokeWidth={2.4} stroke="var(--hl-orange-ink)" />
        </g>
      )
    case 'crash':
      // red box with the restart arrow ↻
      return (
        <g>
          <Rough shape={{ k: 'rect', x: 8, y: 12, w: 36, h: 28 }} seed={k} strokeWidth={1.8} stroke="var(--red)" fillColor="var(--red)" hachureGap={3.2} />
          <Rough shape={{ k: 'arc', cx: 52, cy: 20, w: 16, h: 16, start: -2.6, stop: 1.6 }} seed={k + 1} strokeWidth={1.7} stroke="var(--red)" />
          <Rough shape={{ k: 'lin', pts: [[55, 28], [52, 28.5], [53, 25]] }} seed={k + 2} strokeWidth={1.6} stroke="var(--red)" />
        </g>
      )
    case 'sched':
      // magnifier over an empty slot
      return (
        <g>
          <Rough shape={{ k: 'rect', x: 26, y: 18, w: 30, h: 24 }} seed={k} strokeWidth={1.2} stroke="var(--ink-3)" dash="3 4" />
          <Rough shape={{ k: 'ellipse', cx: 20, cy: 18, w: 22, h: 22 }} seed={k + 1} strokeWidth={1.9} stroke="var(--pen)" />
          <Rough shape={{ k: 'line', x1: 28, y1: 26, x2: 38, y2: 36 }} seed={k + 2} strokeWidth={2.6} stroke="var(--pen)" />
        </g>
      )
    case 'server':
      return (
        <g>
          <Rough shape={{ k: 'rect', x: 12, y: 4, w: 40, h: 40 }} seed={k} strokeWidth={1.8} fillColor="var(--paper)" fillStyle="solid" />
          <g transform="translate(32 20)">
            <ServerFace mood="calm" r={11} />
          </g>
          <Rough shape={{ k: 'line', x1: 17, y1: 37, x2: 47, y2: 37 }} seed={k + 1} strokeWidth={1.1} />
        </g>
      )
    case 'clock':
      // latency / timeout: a clock with a red sweep
      return (
        <g>
          <Rough shape={{ k: 'ellipse', cx: 30, cy: 25, w: 38, h: 38 }} seed={k} strokeWidth={1.8} />
          <Rough shape={{ k: 'arc', cx: 30, cy: 25, w: 30, h: 30, start: -Math.PI / 2, stop: 0.5 }} seed={k + 1} strokeWidth={3} stroke="var(--red)" />
          <Rough shape={{ k: 'lin', pts: [[30, 12], [30, 25], [38, 30]] }} seed={k + 2} strokeWidth={1.8} roughness={0.5} />
          <Rough shape={{ k: 'line', x1: 52, y1: 10, x2: 58, y2: 6 }} seed={k + 3} strokeWidth={1.5} stroke="var(--red)" />
        </g>
      )
    case 'scale':
      // one small server → three: horizontal scaling
      return (
        <g>
          <Rough shape={{ k: 'rect', x: 2, y: 18, w: 14, h: 18 }} seed={k} strokeWidth={1.5} fillColor="var(--paper)" fillStyle="solid" />
          <Arrow pts={[[20, 27], [30, 27]]} seed={k + 1} stroke="var(--pen)" strokeWidth={1.5} head={5} />
          {[0, 1, 2].map((i) => (
            <Rough key={i} shape={{ k: 'rect', x: 34 + i * 10, y: 18 - (i === 1 ? 6 : 0), w: 9, h: 18 }} seed={k + 3 + i} strokeWidth={1.4} fillColor="var(--hl-green-ink)" hachureGap={3} />
          ))}
        </g>
      )
    case 'spof':
      // one server with everything hanging on it, circled in red
      return (
        <g>
          <Rough shape={{ k: 'rect', x: 22, y: 14, w: 20, h: 22 }} seed={k} strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" />
          {[8, 32, 56].map((x, i) => (
            <Rough key={i} shape={{ k: 'line', x1: x, y1: 4, x2: 32, y2: 14 }} seed={k + 1 + i} strokeWidth={1} stroke="var(--ink-3)" />
          ))}
          <Rough shape={{ k: 'ellipse', cx: 32, cy: 26, w: 42, h: 34 }} seed={k + 5} strokeWidth={1.9} stroke="var(--red)" multi />
        </g>
      )
    case 'queue':
      // trays waiting in a tube
      return (
        <g>
          <Rough shape={{ k: 'rect', x: 4, y: 14, w: 46, h: 22 }} seed={k} strokeWidth={1.7} />
          {[0, 1, 2].map((i) => (
            <Tray key={i} x={14 + i * 14} y={26} w={12} />
          ))}
          <Arrow pts={[[52, 25], [62, 25]]} seed={k + 1} stroke="var(--pen)" strokeWidth={1.5} head={5} />
        </g>
      )
    case 'box':
      // container: a food box with a lid and ribs
      return (
        <g>
          <Rough shape={{ k: 'rect', x: 12, y: 18, w: 40, h: 26 }} seed={k} strokeWidth={1.7} fillColor="var(--hl-pink-ink)" hachureGap={4} />
          <Rough shape={{ k: 'rect', x: 9, y: 11, w: 46, h: 8 }} seed={k + 1} strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" />
          {[0, 1].map((i) => (
            <Rough key={i} shape={{ k: 'line', x1: 26 + i * 12, y1: 22, x2: 26 + i * 12, y2: 40 }} seed={k + 2 + i} strokeWidth={1.1} roughness={0.6} />
          ))}
        </g>
      )
    case 'layers':
      // image layers: stacked trays, shared at the bottom
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <Rough
              key={i}
              shape={{ k: 'rect', x: 10 + i * 2, y: 34 - i * 11, w: 44 - i * 4, h: 9 }}
              seed={k + i}
              strokeWidth={1.5}
              fillColor={i === 2 ? 'var(--hl-green-ink)' : 'var(--hl-blue-ink)'}
              hachureGap={3}
              hachureAngle={i === 2 ? 41 : -41}
            />
          ))}
        </g>
      )
    case 'registry':
      // a shelf of boxes with tags
      return (
        <g>
          <Rough shape={{ k: 'line', x1: 4, y1: 22, x2: 60, y2: 22 }} seed={k} strokeWidth={1.8} />
          <Rough shape={{ k: 'line', x1: 4, y1: 44, x2: 60, y2: 44 }} seed={k + 1} strokeWidth={1.8} />
          {[0, 1, 2].map((i) => (
            <Rough key={i} shape={{ k: 'rect', x: 8 + i * 18, y: 8, w: 14, h: 14 }} seed={k + 2 + i} strokeWidth={1.4} fillColor={i === 1 ? 'var(--hl-green-ink)' : 'var(--hl-blue-ink)'} hachureGap={3} />
          ))}
          {[0, 1].map((i) => (
            <Rough key={i} shape={{ k: 'rect', x: 14 + i * 22, y: 30, w: 14, h: 14 }} seed={k + 6 + i} strokeWidth={1.4} fillColor="var(--hl-pink-ink)" hachureGap={3} />
          ))}
        </g>
      )
    case 'loop':
      // reconciliation: two half-circle arrows
      return (
        <g>
          <Rough shape={{ k: 'arc', cx: 32, cy: 24, w: 40, h: 34, start: 3.5, stop: 5.95 }} seed={k} strokeWidth={2} stroke="var(--pen)" />
          <Rough shape={{ k: 'arc', cx: 32, cy: 24, w: 40, h: 34, start: 0.35, stop: 2.8 }} seed={k + 1} strokeWidth={2} stroke="var(--pen)" />
          <Rough shape={{ k: 'lin', pts: [[47, 4], [51, 10], [45, 12]] }} seed={k + 2} strokeWidth={1.7} stroke="var(--pen)" />
          <Rough shape={{ k: 'lin', pts: [[17, 44], [13, 38], [19, 36]] }} seed={k + 3} strokeWidth={1.7} stroke="var(--pen)" />
          <Check x={32} y={24} size={6} seed={k + 4} />
        </g>
      )
    case 'helm':
      return <Helm x={32} y={24} r={15} seed={k} />
    case 'secret':
      // envelope with a red wax seal
      return (
        <g>
          <Rough shape={{ k: 'rect', x: 8, y: 10, w: 48, h: 30 }} seed={k} strokeWidth={1.7} fillColor="var(--paper)" fillStyle="solid" />
          <Rough shape={{ k: 'lin', pts: [[10, 12], [32, 28], [54, 12]] }} seed={k + 1} strokeWidth={1.3} />
          <Rough shape={{ k: 'ellipse', cx: 32, cy: 28, w: 12, h: 11 }} seed={k + 2} strokeWidth={1.3} stroke="var(--red)" fillColor="var(--red)" fillStyle="solid" />
        </g>
      )
    case 'config':
      // a recipe card (ConfigMap): key = value lines
      return (
        <g>
          <Rough shape={{ k: 'rect', x: 10, y: 6, w: 44, h: 38 }} seed={k} strokeWidth={1.6} fillColor="var(--note-yellow)" fillStyle="solid" />
          {[16, 25, 34].map((y, i) => (
            <g key={y}>
              <Rough shape={{ k: 'line', x1: 16, y1: y, x2: 28, y2: y }} seed={k + 1 + i} strokeWidth={1.2} stroke="var(--pen)" />
              <Rough shape={{ k: 'line', x1: 32, y1: y, x2: 46 - i * 3, y2: y }} seed={k + 5 + i} strokeWidth={1.1} stroke="var(--note-ink)" />
            </g>
          ))}
        </g>
      )
    case 'git':
      // commit beads on a string
      return (
        <g>
          <Rough shape={{ k: 'line', x1: 4, y1: 32, x2: 60, y2: 32 }} seed={k} strokeWidth={1.6} />
          <Rough shape={{ k: 'curve', pts: [[18, 32], [26, 14], [40, 14], [48, 32]] }} seed={k + 1} strokeWidth={2} stroke="var(--hl-green-ink)" />
          {[10, 28, 54].map((x, i) => (
            <Rough key={x} shape={{ k: 'ellipse', cx: x, cy: 32, w: 10, h: 10 }} seed={k + 2 + i} strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" />
          ))}
          <Rough shape={{ k: 'ellipse', cx: 33, cy: 14, w: 10, h: 10 }} seed={k + 6} strokeWidth={1.6} stroke="var(--green)" fillColor="var(--paper)" fillStyle="solid" />
        </g>
      )
    case 'pipeline':
      // build → test → push: three little houses, the last one ticked
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <Rough key={i} shape={{ k: 'rect', x: 4 + i * 20, y: 20, w: 15, h: 17 }} seed={k + i} strokeWidth={1.5} fillColor={i === 2 ? 'var(--hl-green-ink)' : undefined} hachureGap={3.4} />
          ))}
          <Rough shape={{ k: 'line', x1: 2, y1: 42, x2: 62, y2: 42 }} seed={k + 4} strokeWidth={1.5} />
          <Check x={54} y={11} size={6} seed={k + 5} />
        </g>
      )
    case 'db':
      return (
        <g>
          <Rough shape={{ k: 'path', d: 'M16 10 L16 38 Q32 48 48 38 L48 10' }} seed={k} strokeWidth={1.7} fillColor="var(--paper)" fillStyle="solid" />
          <Rough shape={{ k: 'ellipse', cx: 32, cy: 10, w: 32, h: 11 }} seed={k + 1} strokeWidth={1.7} fillColor="var(--paper)" fillStyle="solid" />
          <Rough shape={{ k: 'arc', cx: 32, cy: 24, w: 32, h: 11, start: 0.1, stop: Math.PI - 0.1 }} seed={k + 2} strokeWidth={1.1} stroke="var(--ink-3)" />
        </g>
      )
    case 'dns':
      // a phone book: name → number
      return (
        <g>
          <Rough shape={{ k: 'rect', x: 12, y: 4, w: 38, h: 40 }} seed={k} strokeWidth={1.7} fillColor="var(--paper)" fillStyle="solid" />
          <Rough shape={{ k: 'line', x1: 18, y1: 4, x2: 18, y2: 44 }} seed={k + 1} strokeWidth={1.2} stroke="var(--red)" />
          <text x={22} y={20} className="k-svg-hand" style={{ fontSize: 11, fill: 'var(--pen)' }}>
            klopa
          </text>
          {/* the course's documentation address (RFC 5737), squeezed into the page */}
          <text x={21} y={33} className="k-svg-mono" textLength={27} lengthAdjust="spacingAndGlyphs" style={{ fontSize: 6.4, fill: 'var(--ink-2)' }}>
            203.0.113.10
          </text>
          {[0, 1, 2].map((i) => (
            <Rough key={i} shape={{ k: 'rect', x: 50, y: 8 + i * 12, w: 6, h: 8 }} seed={k + 2 + i} strokeWidth={1} fillColor={['var(--hl-yellow-ink)', 'var(--hl-pink-ink)', 'var(--hl-green-ink)'][i]} fillStyle="solid" />
          ))}
        </g>
      )
    case 'eye':
      // observability: a magnifier over a graph line
      return (
        <g>
          <Rough shape={{ k: 'lin', pts: [[4, 38], [14, 30], [22, 34], [32, 18], [40, 26], [60, 8]] }} seed={k} strokeWidth={1.5} stroke="var(--ink-2)" />
          <Rough shape={{ k: 'ellipse', cx: 34, cy: 22, w: 22, h: 22 }} seed={k + 1} strokeWidth={1.9} stroke="var(--pen)" />
          <Rough shape={{ k: 'line', x1: 42, y1: 30, x2: 52, y2: 42 }} seed={k + 2} strokeWidth={2.6} stroke="var(--pen)" />
        </g>
      )
    case 'tag':
      // label app=klopa-api on a string
      return (
        <g>
          <Rough shape={{ k: 'path', d: 'M14 14 L56 14 L56 34 L14 34 L4 24 Z' }} seed={k} strokeWidth={1.6} fillColor="var(--note-green)" fillStyle="solid" />
          <text x={18} y={28} className="k-svg-mono" style={{ fontSize: 8.5, fill: 'var(--note-ink)' }}>
            app=klopa
          </text>
          <Rough shape={{ k: 'curve', pts: [[4, 24], [2, 34], [8, 44]] }} seed={k + 1} strokeWidth={1.1} stroke="var(--ink-3)" />
        </g>
      )
    case 'flag':
      // the goal
      return (
        <g>
          <Rough shape={{ k: 'line', x1: 24, y1: 42, x2: 24, y2: 4 }} seed={k} strokeWidth={2} />
          <Rough shape={{ k: 'poly', pts: [[24, 4], [52, 12], [24, 21]] }} seed={k + 1} strokeWidth={1.7} stroke="var(--red)" fillColor="var(--red)" hachureGap={3} />
          <Rough shape={{ k: 'arc', cx: 26, cy: 46, w: 40, h: 12, start: Math.PI, stop: Math.PI * 2 }} seed={k + 2} strokeWidth={1.4} />
        </g>
      )
    case 'gauge':
      // resources: a fuel gauge, needle in the red
      return (
        <g>
          <Rough shape={{ k: 'arc', cx: 32, cy: 36, w: 48, h: 48, start: Math.PI, stop: Math.PI * 2 }} seed={k} strokeWidth={1.9} />
          <Rough shape={{ k: 'arc', cx: 32, cy: 36, w: 40, h: 40, start: Math.PI * 1.72, stop: Math.PI * 2 }} seed={k + 1} strokeWidth={3} stroke="var(--red)" />
          <Rough shape={{ k: 'line', x1: 32, y1: 36, x2: 48, y2: 22 }} seed={k + 2} strokeWidth={2.2} />
          <Rough shape={{ k: 'line', x1: 6, y1: 37, x2: 58, y2: 37 }} seed={k + 3} strokeWidth={1.3} />
        </g>
      )
  }
}

/** A small doodle (local box 64 × 48) placed inside your <svg> at (x, y), scaled. */
export function Doodle({ kind, x = 0, y = 0, scale = 1 }: { kind: DoodleKind; x?: number; y?: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <Body kind={kind} />
    </g>
  )
}

/** A small doodle as its own <svg> (viewBox 64 × 48; size it with CSS). Decorative unless you pass `label`. */
export function DoodleIcon({ kind, className, label }: { kind: DoodleKind; className?: string; label?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 48" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'}>
      <Body kind={kind} />
    </svg>
  )
}
