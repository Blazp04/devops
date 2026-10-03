import { Check, Cross, Rough } from '../sketch/Sketch'
import type { Pt } from '../sketch/roughGen'
import { Tray } from './Things'
import type { ServerMood } from './types'

/* =====================================================================
   Doodles added by the diagram area (re-exported from src/kit/diagram).
   Parametric drawings: every one is drawn into a box (x, y, w, h) or
   around a centre, in the drawing's own units, so the pen keeps its
   width (1.2–2 px) at any size. Same pen as everything else: roughjs,
   roughness ≈ 1.1, hatching −41°, fixed seeds.
     container = food box · image = stacked trays · registry = shelf
     ConfigMap = recipe card · Deployment = clipboard · namespace = folder
     Gateway = menza gate · HPA = elastic · Job = kitchen timer
     PV = fridge · PVC = drawer · Argo CD = loop + magnifier
     node = building · secret store = vault · VM = boxed computer
   ===================================================================== */

interface BoxProps {
  x: number
  y: number
  w: number
  h: number
  seed?: number
}

/** Container = a food box with a lid: the body is hatched with a marker (`tint`, `angle` −41° / +41° per version). */
export function FoodBox({
  x,
  y,
  w,
  h,
  seed = 5101,
  tint = 'var(--hl-pink-ink)',
  angle = -41,
  stroke = 'var(--ink)',
  sw = 1.6,
  label,
  labelSize = 12,
  dash,
}: BoxProps & { tint?: string; angle?: number; stroke?: string; sw?: number; label?: string; labelSize?: number; dash?: string }) {
  const lid = Math.max(5, Math.min(12, h * 0.24))
  const gap = Math.max(3, Math.min(6, w / 9))
  return (
    <g>
      <Rough shape={{ k: 'rect', x: x + w * 0.04, y: y + lid * 0.8, w: w * 0.92, h: h - lid * 0.8 }} seed={seed} stroke={stroke} strokeWidth={sw} fillColor={tint} hachureGap={gap} hachureAngle={angle} fillWeight={0.9} dash={dash} />
      <Rough shape={{ k: 'rect', x, y, w, h: lid }} seed={seed + 1} stroke={stroke} strokeWidth={sw * 0.9} fillColor="var(--paper)" fillStyle="solid" dash={dash} />
      {label ? (
        <text x={x + w / 2} y={y + lid + (h - lid) / 2 + labelSize * 0.36} textAnchor="middle" className="k-svg-mono k-dhalo" style={{ fontSize: labelSize, fontWeight: 600 }}>
          {label}
        </text>
      ) : (
        [1, 2].map((i) => <Rough key={i} shape={{ k: 'line', x1: x + (w * i) / 3, y1: y + lid + 3, x2: x + (w * i) / 3, y2: y + h - 3 }} seed={seed + 2 + i} stroke={stroke} strokeWidth={sw * 0.65} roughness={0.6} />)
      )}
    </g>
  )
}

/**
 * Pod = a lunchbox with a handle, without lettering (the small form used in icons, maps and glyphs).
 * For the full Pod with a face, name, version tape and state use `PodShape` (src/kit/diagram) or `Lunchbox`.
 */
export function MiniLunchbox({
  x,
  y,
  w,
  h,
  seed = 5201,
  tint = 'var(--hl-blue-ink)',
  angle = -41,
  stroke = 'var(--ink)',
  sw = 1.5,
  dash,
  tape,
  bg,
}: BoxProps & { tint?: string; angle?: number; stroke?: string; sw?: number; dash?: string; tape?: string; bg?: boolean }) {
  const hh = Math.min(h * 0.28, w * 0.24)
  return (
    <g>
      {bg && <rect x={x + 1} y={y + hh + 1} width={Math.max(0, w - 2)} height={Math.max(0, h - hh - 2)} className="k-paper-fill" />}
      <Rough shape={{ k: 'arc', cx: x + w / 2, cy: y + hh, w: w * 0.42, h: hh * 2, start: Math.PI, stop: Math.PI * 2 }} seed={seed} stroke={stroke} strokeWidth={sw} />
      <Rough shape={{ k: 'rect', x, y: y + hh, w, h: h - hh }} seed={seed + 1} stroke={stroke} strokeWidth={sw} fillColor={tint} hachureGap={Math.max(2.6, Math.min(5, w / 8))} hachureAngle={angle} fillWeight={0.85} dash={dash} />
      {tape && <rect x={x + w * 0.6} y={y + hh - 2} width={w * 0.36} height={Math.max(4, (h - hh) * 0.28)} transform={`rotate(6 ${x + w * 0.78} ${y + hh})`} style={{ fill: tape, opacity: 0.92 }} />}
    </g>
  )
}

/** Image layers = trays stacked on each other; the lower layers are shared (blue, −41°), the top one is new (green, +41°). */
export function TrayStack({ x, y, w, h, n = 3, seed = 5301, labels, labelSize = 11 }: BoxProps & { n?: number; labels?: string[]; labelSize?: number }) {
  const lh = h / n
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const top = i === n - 1
        const inset = i * Math.min(4, w * 0.05)
        const ly = y + h - (i + 1) * lh
        return (
          <g key={i}>
            <Rough
              shape={{ k: 'poly', pts: [[x + inset, ly + 2], [x + w - inset, ly + 2], [x + w - inset - 3, ly + lh - 1], [x + inset + 3, ly + lh - 1]] }}
              seed={seed + i}
              strokeWidth={1.5}
              fillColor={top ? 'var(--hl-green-ink)' : 'var(--hl-blue-ink)'}
              hachureAngle={top ? 41 : -41}
              hachureGap={Math.max(2.6, Math.min(4.5, lh / 3))}
              fillWeight={0.9}
            />
            {labels?.[i] && (
              <text x={x + w / 2} y={ly + lh / 2 + labelSize * 0.4 + 0.5} textAnchor="middle" className="k-svg-mono k-dhalo" style={{ fontSize: labelSize, fontWeight: 600 }}>
                {labels[i]}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

/** Registry = a shelf of boxes (image repositories), two pencil shelves. */
export function Shelf({ x, y, w, h, seed = 5401 }: BoxProps) {
  const bw = Math.min(w * 0.24, h * 0.36)
  const tints = ['var(--hl-blue-ink)', 'var(--hl-green-ink)', 'var(--hl-blue-ink)']
  return (
    <g>
      <Rough shape={{ k: 'line', x1: x, y1: y + h * 0.48, x2: x + w, y2: y + h * 0.48 }} seed={seed} strokeWidth={1.7} />
      <Rough shape={{ k: 'line', x1: x, y1: y + h, x2: x + w, y2: y + h }} seed={seed + 1} strokeWidth={1.7} />
      {[0, 1, 2].map((i) => (
        <Rough key={`a${i}`} shape={{ k: 'rect', x: x + w * 0.08 + i * (bw + w * 0.06), y: y + h * 0.48 - bw, w: bw, h: bw }} seed={seed + 2 + i} strokeWidth={1.3} fillColor={tints[i]} hachureGap={Math.max(2.4, bw / 4)} />
      ))}
      {[0, 1].map((i) => (
        <Rough key={`b${i}`} shape={{ k: 'rect', x: x + w * 0.2 + i * (bw + w * 0.12), y: y + h - bw, w: bw, h: bw }} seed={seed + 6 + i} strokeWidth={1.3} fillColor="var(--hl-pink-ink)" hachureGap={Math.max(2.4, bw / 4)} />
      ))}
    </g>
  )
}

/**
 * Git = commits as round stamps on a pencil string (time runs left → right), optionally a branch in green marker.
 * `hashes` are written under the beads in mono (short, e.g. 'a1f').
 */
export function CommitString({ x, y, w, n = 3, branch, hashes, hashSize = 11, seed = 5501, r = 5 }: { x: number; y: number; w: number; n?: number; branch?: boolean; hashes?: string[]; hashSize?: number; seed?: number; r?: number }) {
  const step = (w - r * 2) / Math.max(1, n - 1 + (branch ? 0.5 : 0))
  const xs = Array.from({ length: n }, (_, i) => x + r + i * step)
  return (
    <g>
      <Rough shape={{ k: 'line', x1: x - 2, y1: y, x2: x + w + 2, y2: y }} seed={seed} strokeWidth={1.5} />
      {branch && (
        <g>
          <Rough shape={{ k: 'curve', pts: [[xs[0], y], [xs[0] + step * 0.5, y - r * 3], [xs[0] + step * 1.5, y - r * 3], [xs[1] + step * 0.9, y]] }} seed={seed + 1} strokeWidth={2} stroke="var(--hl-green-ink)" />
          <Rough shape={{ k: 'ellipse', cx: xs[0] + step, cy: y - r * 3, w: r * 2, h: r * 2 }} seed={seed + 2} strokeWidth={1.5} stroke="var(--green)" fillColor="var(--paper)" fillStyle="solid" />
        </g>
      )}
      {xs.map((cx, i) => (
        <g key={i}>
          <Rough shape={{ k: 'ellipse', cx, cy: y, w: r * 2.1, h: r * 2.1 }} seed={seed + 3 + i} strokeWidth={1.5} fillColor={i === n - 1 ? 'var(--pen)' : 'var(--paper)'} fillStyle="solid" stroke={i === n - 1 ? 'var(--pen)' : 'var(--ink)'} />
          {hashes?.[i] && (
            <text x={cx} y={y + r + 2 + hashSize} textAnchor="middle" className="k-svg-mono" style={{ fontSize: hashSize, fill: 'var(--ink-2)' }}>
              {hashes[i]}
            </text>
          )}
        </g>
      ))}
    </g>
  )
}

/** ConfigMap = a recipe card on yellow paper: `key = value` lines (dark ink in both themes, like a sticky note). */
export function RecipeCard({ x, y, w, h, seed = 5601, lines = 3, title, titleSize }: BoxProps & { lines?: number; title?: string; titleSize?: number }) {
  const top = title ? Math.max(Math.min(18, h * 0.34), titleSize ? titleSize + 2 : 0) : h * 0.18
  const step = (h - top - h * 0.12) / Math.max(1, lines)
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} strokeWidth={1.5} fillColor="var(--note-yellow)" fillStyle="solid" stroke="var(--ink)" />
      {title && (
        <text x={x + 6} y={y + top - 4} className="k-svg-hand" style={{ fontSize: titleSize ?? Math.min(17, top), fill: 'var(--note-ink)' }}>
          {title}
        </text>
      )}
      {Array.from({ length: lines }, (_, i) => {
        const ly = y + top + step * (i + 0.6)
        return (
          <g key={i}>
            <Rough shape={{ k: 'line', x1: x + w * 0.12, y1: ly, x2: x + w * 0.42, y2: ly }} seed={seed + 1 + i} strokeWidth={1.6} stroke="var(--note-ink)" roughness={0.7} />
            <Rough shape={{ k: 'line', x1: x + w * 0.5, y1: ly, x2: x + w * (0.86 - (i % 2) * 0.12), y2: ly }} seed={seed + 6 + i} strokeWidth={1} stroke="var(--note-ink)" roughness={0.7} />
          </g>
        )
      })}
    </g>
  )
}

/**
 * Desired state written down = a clipboard. `text` lines are written in mono (e.g. ['replicas: 3']); without text
 * it gets pencil lines with ticks.
 */
export function Clipboard({ x, y, w, h, seed = 5701, text, textSize = 12, checks = 2 }: BoxProps & { text?: string[]; textSize?: number; checks?: number }) {
  const clipW = Math.max(10, w * 0.36)
  const clipH = Math.max(5, Math.min(9, h * 0.12))
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y: y + clipH * 0.5, w, h: h - clipH * 0.5 }} seed={seed} strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'rect', x: x + w / 2 - clipW / 2, y, w: clipW, h: clipH }} seed={seed + 1} strokeWidth={1.2} fillColor="var(--ink-3)" fillStyle="solid" />
      {text
        ? text.map((t, i) => (
            <text key={i} x={x + 7} y={y + clipH + 6 + textSize * (i + 1) * 1.18} className="k-svg-mono" style={{ fontSize: textSize, fontWeight: i === 0 ? 600 : 500 }}>
              {t}
            </text>
          ))
        : Array.from({ length: 3 }, (_, i) => {
            const ly = y + clipH + (h - clipH) * (0.25 + i * 0.25)
            return (
              <g key={i}>
                {i < checks ? <Check x={x + w * 0.24} y={ly - 1} size={Math.min(5, w * 0.08)} seed={seed + 2 + i} strokeWidth={1.6} /> : <Rough shape={{ k: 'rect', x: x + w * 0.16, y: ly - 4, w: 7, h: 7 }} seed={seed + 2 + i} strokeWidth={1} />}
                <Rough shape={{ k: 'line', x1: x + w * 0.4, y1: ly, x2: x + w * 0.84, y2: ly }} seed={seed + 6 + i} strokeWidth={1} roughness={0.6} />
              </g>
            )
          })}
    </g>
  )
}

/** Namespace = a manila folder with a tab on top; the label goes on the tab (mono). */
export function FolderTab({ x, y, w, h, seed = 5801, label, labelSize = 12, tint = 'var(--note-yellow)' }: BoxProps & { label?: string; labelSize?: number; tint?: string }) {
  const th = Math.max(10, Math.min(20, h * 0.26))
  const tw = label ? Math.min(w * 0.97, label.length * labelSize * 0.62 + 24) : w * 0.42
  return (
    <g>
      <Rough shape={{ k: 'path', d: `M${x} ${y + th} L${x} ${y + 3} Q${x} ${y} ${x + 4} ${y} L${x + tw - 6} ${y} L${x + tw} ${y + th} Z` }} seed={seed} strokeWidth={1.5} fillColor={tint} fillStyle="solid" />
      <Rough shape={{ k: 'rect', x, y: y + th, w, h: h - th }} seed={seed + 1} strokeWidth={1.6} fillColor={tint} fillStyle="solid" />
      {label && (
        <text x={x + 8} y={y + th - Math.max(2, (th - labelSize) / 2) - 1} className="k-svg-mono" style={{ fontSize: labelSize, fontWeight: 600, fill: 'var(--note-ink)' }}>
          {label}
        </text>
      )}
    </g>
  )
}

/** Gateway = the menza gate: two posts, an arch and a sign board (`label`, printed). */
export function MenzaGate({ x, y, w, h, seed = 5901, label = 'ULAZ', labelSize }: BoxProps & { label?: string; labelSize?: number }) {
  const pw = Math.max(5, w * 0.13)
  const archTop = y
  const postTop = y + h * 0.3
  const fs = labelSize ?? Math.max(8, Math.min(15, w * 0.17))
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y: postTop, w: pw, h: h - h * 0.3 }} seed={seed} strokeWidth={1.6} fillColor="var(--hl-orange-ink)" hachureGap={3} />
      <Rough shape={{ k: 'rect', x: x + w - pw, y: postTop, w: pw, h: h - h * 0.3 }} seed={seed + 1} strokeWidth={1.6} fillColor="var(--hl-orange-ink)" hachureGap={3} />
      <Rough shape={{ k: 'curve', pts: [[x - 2, postTop + 2], [x + w * 0.18, archTop + h * 0.06], [x + w / 2, archTop], [x + w * 0.82, archTop + h * 0.06], [x + w + 2, postTop + 2]] }} seed={seed + 2} strokeWidth={1.8} />
      <Rough shape={{ k: 'rect', x: x + w * 0.2, y: archTop + h * 0.12, w: w * 0.6, h: Math.max(fs * 1.35, h * 0.2) }} seed={seed + 3} strokeWidth={1.4} fillColor="var(--paper)" fillStyle="solid" />
      {fs >= 11.5 ? (
        <text x={x + w / 2} y={archTop + h * 0.12 + Math.max(fs * 1.35, h * 0.2) / 2 + fs * 0.36} textAnchor="middle" className="k-svg-display" style={{ fontSize: fs, letterSpacing: '0.04em' }}>
          {label}
        </text>
      ) : (
        // too small to letter legibly: the sign's writing is a pencil scribble
        <Rough
          shape={{ k: 'line', x1: x + w * 0.3, y1: archTop + h * 0.12 + Math.max(fs * 1.35, h * 0.2) / 2, x2: x + w * 0.7, y2: archTop + h * 0.12 + Math.max(fs * 1.35, h * 0.2) / 2 }}
          seed={seed + 5}
          strokeWidth={1.6}
          roughness={1.6}
        />
      )}
      <Rough shape={{ k: 'line', x1: x - w * 0.08, y1: y + h, x2: x + w * 1.08, y2: y + h }} seed={seed + 4} strokeWidth={1.3} stroke="var(--ink-3)" />
    </g>
  )
}

/** HPA = an elastic band between two posts with ↔ arrows (the number of replicas stretches and shrinks). */
export function Elastic({ x, y, w, h, seed = 6001, stroke = 'var(--pen)' }: BoxProps & { stroke?: string }) {
  const zig: Pt[] = []
  const n = 7
  for (let i = 0; i <= n; i++) zig.push([x + w * 0.16 + ((w * 0.68) / n) * i, y + h * 0.36 + (i % 2 ? -h * 0.16 : h * 0.16)])
  const ay = y + h * 0.84
  return (
    <g>
      <Rough shape={{ k: 'line', x1: x + w * 0.12, y1: y + h * 0.08, x2: x + w * 0.12, y2: y + h * 0.64 }} seed={seed} strokeWidth={2} />
      <Rough shape={{ k: 'line', x1: x + w * 0.88, y1: y + h * 0.08, x2: x + w * 0.88, y2: y + h * 0.64 }} seed={seed + 1} strokeWidth={2} />
      <Rough shape={{ k: 'lin', pts: zig }} seed={seed + 2} strokeWidth={1.8} stroke="var(--hl-pink-ink)" roughness={0.7} />
      <Rough shape={{ k: 'line', x1: x + w * 0.06, y1: ay, x2: x + w * 0.94, y2: ay }} seed={seed + 3} strokeWidth={1.6} stroke={stroke} />
      <Rough shape={{ k: 'lin', pts: [[x + w * 0.16, ay - 5], [x + w * 0.05, ay], [x + w * 0.16, ay + 5]] }} seed={seed + 4} strokeWidth={1.6} stroke={stroke} roughness={0.5} />
      <Rough shape={{ k: 'lin', pts: [[x + w * 0.84, ay - 5], [x + w * 0.95, ay], [x + w * 0.84, ay + 5]] }} seed={seed + 5} strokeWidth={1.6} stroke={stroke} roughness={0.5} />
    </g>
  )
}

/** Job = a kitchen timer (it rings once, the job is done); `cron` adds the ↻ arrow of a repeating CronJob. */
export function KitchenTimer({ cx, cy, r, seed = 6101, cron }: { cx: number; cy: number; r: number; seed?: number; cron?: boolean }) {
  return (
    <g>
      <Rough shape={{ k: 'rect', x: cx - r * 0.22, y: cy - r * 1.22, w: r * 0.44, h: r * 0.3 }} seed={seed} strokeWidth={1.3} fillColor="var(--ink-3)" fillStyle="solid" />
      <Rough shape={{ k: 'ellipse', cx, cy, w: r * 2, h: r * 1.9 }} seed={seed + 1} strokeWidth={1.8} fillColor="var(--hl-pink-ink)" hachureGap={Math.max(2.6, r / 3.2)} />
      <Rough shape={{ k: 'ellipse', cx, cy, w: r * 1.3, h: r * 1.24 }} seed={seed + 2} strokeWidth={1.3} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'lin', pts: [[cx, cy - r * 0.5], [cx, cy], [cx + r * 0.36, cy + r * 0.12]] }} seed={seed + 3} strokeWidth={1.5} roughness={0.5} />
      <Rough shape={{ k: 'line', x1: cx + r * 0.9, y1: cy - r * 1.05, x2: cx + r * 1.25, y2: cy - r * 1.35 }} seed={seed + 4} strokeWidth={1.4} stroke="var(--red)" />
      <Rough shape={{ k: 'line', x1: cx - r * 0.9, y1: cy - r * 1.05, x2: cx - r * 1.25, y2: cy - r * 1.35 }} seed={seed + 5} strokeWidth={1.4} stroke="var(--red)" />
      {cron && (
        <g>
          <Rough shape={{ k: 'arc', cx, cy, w: r * 2.7, h: r * 2.6, start: 0.2, stop: 1.9 }} seed={seed + 6} strokeWidth={1.6} stroke="var(--pen)" />
          <Rough shape={{ k: 'lin', pts: [[cx - r * 0.6, cy + r * 1.05], [cx - r * 0.42, cy + r * 1.3], [cx - r * 0.12, cy + r * 1.12]] }} seed={seed + 7} strokeWidth={1.5} stroke="var(--pen)" roughness={0.5} />
        </g>
      )}
    </g>
  )
}

/** PersistentVolume = a fridge in the kitchen: the food (data) survives when the cook (Pod) goes home. */
export function Fridge({ x, y, w, h, seed = 6201, label, labelSize = 11 }: BoxProps & { label?: string; labelSize?: number }) {
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} strokeWidth={1.8} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'rect', x: x + 2, y: y + 2, w: w - 4, h: h - 4 }} seed={seed + 9} strokeWidth={0.1} stroke="transparent" fillColor="var(--hl-blue-ink)" hachureGap={Math.max(4, w / 5)} fillWeight={0.6} />
      <Rough shape={{ k: 'line', x1: x + 1, y1: y + h * 0.34, x2: x + w - 1, y2: y + h * 0.34 }} seed={seed + 1} strokeWidth={1.4} />
      <Rough shape={{ k: 'line', x1: x + w * 0.8, y1: y + h * 0.1, x2: x + w * 0.8, y2: y + h * 0.26 }} seed={seed + 2} strokeWidth={2.2} roughness={0.5} />
      <Rough shape={{ k: 'line', x1: x + w * 0.8, y1: y + h * 0.42, x2: x + w * 0.8, y2: y + h * 0.62 }} seed={seed + 3} strokeWidth={2.2} roughness={0.5} />
      {label && (
        <text x={x + w * 0.42} y={y + h * 0.7} textAnchor="middle" className="k-svg-mono k-dhalo" style={{ fontSize: labelSize, fontWeight: 600 }}>
          {label}
        </text>
      )}
    </g>
  )
}

/** PersistentVolumeClaim = a drawer you claimed (a name card on the front). */
export function Drawer({ x, y, w, h, seed = 6301 }: BoxProps) {
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} strokeWidth={1.7} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'line', x1: x + 1, y1: y + h / 2, x2: x + w - 1, y2: y + h / 2 }} seed={seed + 1} strokeWidth={1.3} />
      <Rough shape={{ k: 'rect', x: x + w * 0.3, y: y + h * 0.12, w: w * 0.4, h: h * 0.22 }} seed={seed + 2} strokeWidth={1.1} fillColor="var(--note-yellow)" fillStyle="solid" />
      <Rough shape={{ k: 'line', x1: x + w * 0.38, y1: y + h * 0.75, x2: x + w * 0.62, y2: y + h * 0.75 }} seed={seed + 3} strokeWidth={2.2} roughness={0.5} />
    </g>
  )
}

/** Reconciliation = two half-circle arrows chasing each other (desired ⇄ actual); `check` puts a ✓ in the middle. */
export function LoopArrows({ cx, cy, r, seed = 6401, stroke = 'var(--pen)', check }: { cx: number; cy: number; r: number; seed?: number; stroke?: string; check?: boolean }) {
  const ry = r * 0.85
  const head = Math.max(4, r * 0.3)
  const p1: Pt = [cx + r * Math.cos(5.95), cy + ry * Math.sin(5.95)]
  const p2: Pt = [cx + r * Math.cos(2.8), cy + ry * Math.sin(2.8)]
  return (
    <g>
      <Rough shape={{ k: 'arc', cx, cy, w: r * 2, h: ry * 2, start: 3.5, stop: 5.95 }} seed={seed} strokeWidth={1.9} stroke={stroke} />
      <Rough shape={{ k: 'arc', cx, cy, w: r * 2, h: ry * 2, start: 0.35, stop: 2.8 }} seed={seed + 1} strokeWidth={1.9} stroke={stroke} />
      <Rough shape={{ k: 'lin', pts: [[p1[0] - head, p1[1] - head * 0.7], p1, [p1[0] - head * 1.15, p1[1] + head * 0.45]] }} seed={seed + 2} strokeWidth={1.7} stroke={stroke} roughness={0.5} />
      <Rough shape={{ k: 'lin', pts: [[p2[0] + head, p2[1] + head * 0.7], p2, [p2[0] + head * 1.15, p2[1] - head * 0.45]] }} seed={seed + 3} strokeWidth={1.7} stroke={stroke} roughness={0.5} />
      {check && <Check x={cx} y={cy} size={r * 0.36} seed={seed + 4} />}
    </g>
  )
}

/** A magnifier (scheduler looking for room, Argo CD comparing drawing and reality). Centre of the lens (cx, cy). */
export function Magnifier({ cx, cy, r, seed = 6501, stroke = 'var(--pen)' }: { cx: number; cy: number; r: number; seed?: number; stroke?: string }) {
  return (
    <g>
      <Rough shape={{ k: 'ellipse', cx, cy, w: r * 2, h: r * 2 }} seed={seed} strokeWidth={1.9} stroke={stroke} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'line', x1: cx + r * 0.72, y1: cy + r * 0.72, x2: cx + r * 1.6, y2: cy + r * 1.6 }} seed={seed + 1} strokeWidth={2.6} stroke={stroke} />
    </g>
  )
}

/** Argo CD = the reconciliation loop with a magnifier in the middle (compares the drawing in Git with reality). */
export function LoopMagnifier({ cx, cy, r, seed = 6601 }: { cx: number; cy: number; r: number; seed?: number }) {
  return (
    <g>
      <LoopArrows cx={cx} cy={cy} r={r} seed={seed} />
      <Magnifier cx={cx - r * 0.12} cy={cy - r * 0.1} r={r * 0.34} seed={seed + 10} stroke="var(--ink)" />
    </g>
  )
}

/** Node = a building: a big rough frame with a flat roof, one slot taken by a lunchbox and one free (dashed). */
export function Building({ x, y, w, h, seed = 6701, free = true }: BoxProps & { free?: boolean }) {
  const sy = y + h * 0.36
  const sw = w * 0.34
  const sh = h * 0.52
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y: y + h * 0.12, w, h: h * 0.88 }} seed={seed} strokeWidth={1.8} roughness={1.4} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'line', x1: x - 3, y1: y + h * 0.12, x2: x + w + 3, y2: y + h * 0.12 }} seed={seed + 1} strokeWidth={2.2} />
      <Rough shape={{ k: 'line', x1: x + w * 0.1, y1: y + h * 0.24, x2: x + w * 0.5, y2: y + h * 0.24 }} seed={seed + 2} strokeWidth={2.4} stroke="var(--hl-orange-ink)" roughness={0.6} />
      <MiniLunchbox x={x + w * 0.1} y={sy} w={sw} h={sh} seed={seed + 3} sw={1.2} />
      {free && <Rough shape={{ k: 'rect', x: x + w * 0.56, y: sy + sh * 0.2, w: sw, h: sh * 0.8 }} seed={seed + 6} strokeWidth={1.1} stroke="var(--ink-3)" dash="2 3.5" />}
    </g>
  )
}

/** Secret store (Vault, a cloud secret manager) = a safe with a dial. */
export function Vault({ x, y, w, h, seed = 6801 }: BoxProps) {
  const r = Math.min(w, h) * 0.2
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h: h * 0.92 }} seed={seed} strokeWidth={2} fillColor="var(--paper-2)" fillStyle="solid" />
      <Rough shape={{ k: 'rect', x: x + w * 0.1, y: y + h * 0.1, w: w * 0.8, h: h * 0.72 }} seed={seed + 1} strokeWidth={1.3} />
      <Rough shape={{ k: 'ellipse', cx: x + w * 0.44, cy: y + h * 0.46, w: r * 2, h: r * 2 }} seed={seed + 2} strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'line', x1: x + w * 0.44, y1: y + h * 0.46, x2: x + w * 0.44 + r * 0.7, y2: y + h * 0.46 - r * 0.5 }} seed={seed + 3} strokeWidth={1.4} />
      <Rough shape={{ k: 'line', x1: x + w * 0.76, y1: y + h * 0.36, x2: x + w * 0.76, y2: y + h * 0.58 }} seed={seed + 4} strokeWidth={2.4} roughness={0.5} />
      <Rough shape={{ k: 'line', x1: x + w * 0.12, y1: y + h * 0.92, x2: x + w * 0.12, y2: y + h }} seed={seed + 5} strokeWidth={2.2} />
      <Rough shape={{ k: 'line', x1: x + w * 0.88, y1: y + h * 0.92, x2: x + w * 0.88, y2: y + h }} seed={seed + 6} strokeWidth={2.2} />
    </g>
  )
}

/** A curly brace drawn with a pen (groups the things to its left; the tip points right at mid height). */
export function Brace({ x, y, h, seed = 6901, stroke = 'var(--ink-3)', depth = 12 }: { x: number; y: number; h: number; seed?: number; stroke?: string; depth?: number }) {
  const m = y + h / 2
  const d = depth
  return (
    <Rough
      shape={{ k: 'curve', pts: [[x, y], [x + d * 0.55, y + 3], [x + d * 0.5, m - h * 0.12], [x + d * 0.6, m - 4], [x + d, m], [x + d * 0.6, m + 4], [x + d * 0.5, m + h * 0.12], [x + d * 0.55, y + h - 3], [x, y + h]] }}
      seed={seed}
      strokeWidth={1.6}
      stroke={stroke}
      roughness={0.7}
    />
  )
}

/** An external SMS gateway = a phone with a speech bubble. */
export function Phone({ x, y, w, h, seed = 7001, text = 'SMS', textSize = 10 }: BoxProps & { text?: string; textSize?: number }) {
  const pw = Math.min(w * 0.5, h * 0.6)
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y: y + h * 0.2, w: pw, h: h * 0.8 }} seed={seed} strokeWidth={1.7} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'rect', x: x + pw * 0.14, y: y + h * 0.3, w: pw * 0.72, h: h * 0.52 }} seed={seed + 1} strokeWidth={1} fillColor="var(--hl-blue-ink)" hachureGap={3} fillWeight={0.7} />
      <Rough shape={{ k: 'ellipse', cx: x + pw * 0.5, cy: y + h * 0.91, w: 4, h: 4 }} seed={seed + 2} strokeWidth={1} />
      <Rough shape={{ k: 'ellipse', cx: x + pw + (w - pw) * 0.52, cy: y + h * 0.2, w: (w - pw) * 1.05, h: h * 0.4 }} seed={seed + 3} strokeWidth={1.4} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'lin', pts: [[x + pw + 2, y + h * 0.3], [x + pw - 2, y + h * 0.42], [x + pw + 8, y + h * 0.34]] }} seed={seed + 4} strokeWidth={1.2} roughness={0.5} />
      <text x={x + pw + (w - pw) * 0.52} y={y + h * 0.2 + textSize * 0.36} textAnchor="middle" className="k-svg-mono" style={{ fontSize: textSize, fontWeight: 600 }}>
        {text}
      </text>
    </g>
  )
}

/** VM = a computer in a box (its own operating system, its own "walls"): monitor + stand inside a dashed box. */
export function BoxedComputer({ x, y, w, h, seed = 7101 }: BoxProps) {
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} strokeWidth={1.3} stroke="var(--ink-3)" dash="3 3" />
      <Rough shape={{ k: 'rect', x: x + w * 0.16, y: y + h * 0.14, w: w * 0.68, h: h * 0.48 }} seed={seed + 1} strokeWidth={1.6} fillColor="var(--bezel)" fillStyle="solid" />
      <rect x={x + w * 0.22} y={y + h * 0.2} width={w * 0.56} height={h * 0.36} className="k-laptop-screen" />
      <Rough shape={{ k: 'line', x1: x + w * 0.28, y1: y + h * 0.3, x2: x + w * 0.5, y2: y + h * 0.3 }} seed={seed + 2} strokeWidth={1.2} stroke="var(--term-ok)" roughness={0.4} />
      <Rough shape={{ k: 'line', x1: x + w / 2, y1: y + h * 0.62, x2: x + w / 2, y2: y + h * 0.76 }} seed={seed + 3} strokeWidth={1.6} />
      <Rough shape={{ k: 'line', x1: x + w * 0.32, y1: y + h * 0.8, x2: x + w * 0.68, y2: y + h * 0.8 }} seed={seed + 4} strokeWidth={1.8} />
    </g>
  )
}

/** Disk = a hard disk: platter, spindle and the reading arm. */
export function Disk({ x, y, w, h, seed = 7201 }: BoxProps) {
  const r = Math.min(w, h) * 0.34
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} strokeWidth={1.7} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'ellipse', cx: x + w * 0.44, cy: y + h * 0.48, w: r * 2, h: r * 2 }} seed={seed + 1} strokeWidth={1.4} fillColor="var(--hl-blue-ink)" hachureGap={3} fillWeight={0.7} />
      <Rough shape={{ k: 'ellipse', cx: x + w * 0.44, cy: y + h * 0.48, w: r * 0.45, h: r * 0.45 }} seed={seed + 2} strokeWidth={1.2} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'lin', pts: [[x + w * 0.86, y + h * 0.16], [x + w * 0.84, y + h * 0.66], [x + w * 0.6, y + h * 0.72]] }} seed={seed + 3} strokeWidth={1.6} roughness={0.5} />
    </g>
  )
}

/** Something outside our walls (the internet, a cloud provider) = a cloud. */
export function Cloud({ x, y, w, h, seed = 7301, fill = 'var(--paper)' }: BoxProps & { fill?: string }) {
  const X = (f: number) => x + w * f
  const Y = (f: number) => y + h * f
  const d = `M${X(0.2)} ${Y(0.92)} C${X(0)} ${Y(0.92)} ${X(-0.02)} ${Y(0.5)} ${X(0.22)} ${Y(0.52)} C${X(0.18)} ${Y(0.14)} ${X(0.5)} ${Y(0.06)} ${X(0.56)} ${Y(0.32)} C${X(0.66)} ${Y(0.06)} ${X(0.98)} ${Y(0.16)} ${X(0.86)} ${Y(0.5)} C${X(1.04)} ${Y(0.54)} ${X(1.02)} ${Y(0.92)} ${X(0.8)} ${Y(0.92)} Z`
  return <Rough shape={{ k: 'path', d }} seed={seed} strokeWidth={1.7} fillColor={fill} fillStyle="solid" />
}

/** The internet / a public address = a globe with meridians. Centre (cx, cy). */
export function Globe({ cx, cy, r, seed = 7401, stroke = 'var(--ink)' }: { cx: number; cy: number; r: number; seed?: number; stroke?: string }) {
  return (
    <g>
      <Rough shape={{ k: 'ellipse', cx, cy, w: r * 2, h: r * 2 }} seed={seed} strokeWidth={1.7} stroke={stroke} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'ellipse', cx, cy, w: r * 0.9, h: r * 2 }} seed={seed + 1} strokeWidth={1.1} stroke={stroke} />
      <Rough shape={{ k: 'line', x1: cx - r, y1: cy, x2: cx + r, y2: cy }} seed={seed + 2} strokeWidth={1.1} stroke={stroke} />
      <Rough shape={{ k: 'arc', cx, cy: cy + r * 0.9, w: r * 1.7, h: r * 0.8, start: Math.PI * 1.1, stop: Math.PI * 1.9 }} seed={seed + 3} strokeWidth={1} stroke={stroke} />
      <Rough shape={{ k: 'arc', cx, cy: cy - r * 0.9, w: r * 1.7, h: r * 0.8, start: Math.PI * 0.1, stop: Math.PI * 0.9 }} seed={seed + 4} strokeWidth={1} stroke={stroke} />
    </g>
  )
}

/** Network = a switch with ports and three cables up to three machines. */
export function Network({ x, y, w, h, seed = 7501 }: BoxProps) {
  const sy = y + h * 0.66
  const xs = [x + w * 0.16, x + w * 0.5, x + w * 0.84]
  const b = Math.min(w * 0.2, h * 0.28)
  return (
    <g>
      {xs.map((cx, i) => (
        <g key={i}>
          <Rough shape={{ k: 'line', x1: cx, y1: y + b, x2: x + w * (0.3 + i * 0.2), y2: sy }} seed={seed + i} strokeWidth={1.2} stroke="var(--pen)" />
          <Rough shape={{ k: 'rect', x: cx - b / 2, y, w: b, h: b }} seed={seed + 4 + i} strokeWidth={1.4} fillColor="var(--paper)" fillStyle="solid" />
        </g>
      ))}
      <Rough shape={{ k: 'rect', x: x + w * 0.12, y: sy, w: w * 0.76, h: h * 0.3 }} seed={seed + 8} strokeWidth={1.6} fillColor="var(--paper-2)" fillStyle="solid" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={x + w * (0.26 + i * 0.2) - 2} y={sy + h * 0.1} width={4} height={h * 0.1} className="k-ink-fill" />
      ))}
    </g>
  )
}

/** HTTPRoute = a signpost with two boards pointing different ways (paths to different Services). */
export function Signpost({ x, y, w, h, seed = 7601 }: BoxProps) {
  const px = x + w * 0.45
  return (
    <g>
      <Rough shape={{ k: 'line', x1: px, y1: y + h * 0.08, x2: px, y2: y + h }} seed={seed} strokeWidth={2} />
      <Rough shape={{ k: 'poly', pts: [[px - 2, y + h * 0.12], [x + w * 0.88, y + h * 0.12], [x + w, y + h * 0.24], [x + w * 0.88, y + h * 0.36], [px - 2, y + h * 0.36]] }} seed={seed + 1} strokeWidth={1.5} fillColor="var(--hl-green-ink)" hachureGap={3} />
      <Rough shape={{ k: 'poly', pts: [[px + 2, y + h * 0.46], [x + w * 0.12, y + h * 0.46], [x, y + h * 0.58], [x + w * 0.12, y + h * 0.7], [px + 2, y + h * 0.7]] }} seed={seed + 2} strokeWidth={1.5} fillColor="var(--hl-blue-ink)" hachureGap={3} hachureAngle={41} />
    </g>
  )
}

/** API server = the counter window where every request is handed in (a bell on the counter). */
export function CounterWindow({ x, y, w, h, seed = 7701 }: BoxProps) {
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} strokeWidth={1.7} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'rect', x: x + w * 0.16, y: y + h * 0.14, w: w * 0.68, h: h * 0.46 }} seed={seed + 1} strokeWidth={1.3} fillColor="var(--hl-blue-ink)" hachureGap={3.4} fillWeight={0.7} />
      <Rough shape={{ k: 'line', x1: x - 2, y1: y + h * 0.66, x2: x + w + 2, y2: y + h * 0.66 }} seed={seed + 2} strokeWidth={2} />
      <Rough shape={{ k: 'arc', cx: x + w * 0.66, cy: y + h * 0.66, w: w * 0.24, h: h * 0.3, start: Math.PI, stop: Math.PI * 2 }} seed={seed + 3} strokeWidth={1.4} fillColor="var(--hl-yellow-ink)" fillStyle="solid" />
      <circle cx={x + w * 0.66} cy={y + h * 0.5} r={1.4} className="k-ink-fill" />
    </g>
  )
}

/** OOMKilled = a red burst ("it blew up"). Centre (cx, cy). */
export function Burst({ cx, cy, r, seed = 7801, points = 11, stroke = 'var(--red)', fill = 'var(--red)' }: { cx: number; cy: number; r: number; seed?: number; points?: number; stroke?: string; fill?: string }) {
  const pts: Pt[] = []
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2
    const k = i % 2 ? 0.62 + ((i * 37) % 7) / 50 : 1 - ((i * 53) % 5) / 40
    pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k * 0.86])
  }
  return <Rough shape={{ k: 'poly', pts }} seed={seed} strokeWidth={1.7} stroke={stroke} fillColor={fill} hachureGap={Math.max(3, r / 6)} fillWeight={0.8} roughness={0.8} />
}

/**
 * A tiny person for icons (≈ 26 px): round head, dot eyes, hatched shirt. Head centre (cx, cy), `s` = body height.
 * Anonymous by default; `cap` + `vest` make the redar (load balancer) with the lollipop sign.
 */
export function MiniPerson({
  cx,
  cy,
  s,
  seed = 7901,
  shirt = 'var(--hl-blue-ink)',
  hair = 'short',
  vest,
  sign,
}: {
  cx: number
  cy: number
  s: number
  seed?: number
  shirt?: string
  hair?: 'short' | 'bun' | 'pony' | 'cap' | 'none'
  /** hi-vis vest with a reflective stripe (redar) */
  vest?: boolean
  /** the redar's lollipop sign pointing right */
  sign?: boolean
}) {
  const hr = s * 0.24
  const top = cy + hr * 0.92
  const bw = s * 0.36
  return (
    <g>
      <Rough shape={{ k: 'path', d: `M${cx - bw * 0.62} ${top + 1} Q${cx} ${top - s * 0.06} ${cx + bw * 0.62} ${top + 1} L${cx + bw} ${top + s * 0.7} L${cx - bw} ${top + s * 0.7} Z` }} seed={seed} strokeWidth={1.5} fillColor={vest ? 'var(--hl-yellow-ink)' : shirt} hachureGap={Math.max(2.4, s / 9)} fillWeight={1.1} hachureAngle={-50} />
      {vest && <Rough shape={{ k: 'line', x1: cx - bw * 0.8, y1: top + s * 0.38, x2: cx + bw * 0.8, y2: top + s * 0.38 }} seed={seed + 1} strokeWidth={2.2} stroke="var(--vest-stripe)" roughness={0.5} />}
      {sign && (
        <g>
          <Rough shape={{ k: 'line', x1: cx + bw * 0.5, y1: top + s * 0.14, x2: cx + bw * 1.6, y2: top - s * 0.02 }} seed={seed + 2} strokeWidth={1.5} />
          <Rough shape={{ k: 'ellipse', cx: cx + bw * 1.9, cy: top - s * 0.06, w: s * 0.24, h: s * 0.24 }} seed={seed + 3} strokeWidth={1.3} stroke="var(--red)" fillColor="var(--red)" fillStyle="solid" />
        </g>
      )}
      <Rough shape={{ k: 'ellipse', cx, cy, w: hr * 2, h: hr * 2.1 }} seed={seed + 4} strokeWidth={1.5} fillColor="var(--paper)" fillStyle="solid" />
      <circle cx={cx - hr * 0.36} cy={cy + hr * 0.05} r={Math.max(0.9, s * 0.03)} className="k-ink-fill" />
      <circle cx={cx + hr * 0.36} cy={cy + hr * 0.05} r={Math.max(0.9, s * 0.03)} className="k-ink-fill" />
      {hair === 'short' && <Rough shape={{ k: 'curve', pts: [[cx - hr * 0.95, cy - hr * 0.1], [cx - hr * 0.5, cy - hr * 0.95], [cx + hr * 0.5, cy - hr * 0.95], [cx + hr * 0.95, cy - hr * 0.1]] }} seed={seed + 5} strokeWidth={1.7} />}
      {hair === 'bun' && <Rough shape={{ k: 'ellipse', cx, cy: cy - hr * 1.15, w: hr * 0.9, h: hr * 0.7 }} seed={seed + 5} strokeWidth={1.4} fillColor="var(--ink)" fillStyle="solid" />}
      {hair === 'pony' && <Rough shape={{ k: 'curve', pts: [[cx + hr * 0.7, cy - hr * 0.6], [cx + hr * 1.5, cy - hr * 0.2], [cx + hr * 1.3, cy + hr * 0.9]] }} seed={seed + 5} strokeWidth={1.7} />}
      {hair === 'cap' && (
        <g>
          <Rough shape={{ k: 'path', d: `M${cx - hr} ${cy - hr * 0.25} Q${cx} ${cy - hr * 1.5} ${cx + hr} ${cy - hr * 0.25} Z` }} seed={seed + 5} strokeWidth={1.4} fillColor="var(--pen)" fillStyle="solid" />
          <Rough shape={{ k: 'line', x1: cx + hr * 0.6, y1: cy - hr * 0.3, x2: cx + hr * 1.6, y2: cy - hr * 0.15 }} seed={seed + 6} strokeWidth={2} />
        </g>
      )}
    </g>
  )
}

/** A small server face in its porthole for icons (≈ 18–30 px): calm, busy, panic, dead (red X eyes). */
export function MiniFace({ cx, cy, r, mood = 'calm', seed = 8001 }: { cx: number; cy: number; r: number; mood?: ServerMood; seed?: number }) {
  const dead = mood === 'dead'
  const e = r * 0.36
  return (
    <g>
      <Rough shape={{ k: 'ellipse', cx, cy, w: r * 2, h: r * 1.92 }} seed={seed} strokeWidth={1.4} stroke={dead ? 'var(--red)' : 'var(--ink)'} fillColor="var(--paper)" fillStyle="solid" roughness={0.8} />
      {dead ? (
        <g>
          <Cross x={cx - e} y={cy - r * 0.18} size={r * 0.2} seed={seed + 1} strokeWidth={1.4} />
          <Cross x={cx + e} y={cy - r * 0.18} size={r * 0.2} seed={seed + 3} strokeWidth={1.4} />
        </g>
      ) : (
        <g>
          <circle cx={cx - e} cy={cy - r * 0.16} r={Math.max(1, r * (mood === 'panic' ? 0.16 : 0.11))} className={mood === 'panic' ? 'k-eye-white' : 'k-ink-fill'} />
          <circle cx={cx + e} cy={cy - r * 0.16} r={Math.max(1, r * (mood === 'panic' ? 0.16 : 0.11))} className={mood === 'panic' ? 'k-eye-white' : 'k-ink-fill'} />
        </g>
      )}
      {mood === 'calm' && <Rough shape={{ k: 'curve', pts: [[cx - r * 0.36, cy + r * 0.24], [cx, cy + r * 0.5], [cx + r * 0.36, cy + r * 0.24]] }} seed={seed + 5} strokeWidth={1.3} roughness={0.4} />}
      {mood === 'busy' && <Rough shape={{ k: 'line', x1: cx - r * 0.32, y1: cy + r * 0.38, x2: cx + r * 0.32, y2: cy + r * 0.34 }} seed={seed + 5} strokeWidth={1.3} roughness={0.4} />}
      {mood === 'panic' && <Rough shape={{ k: 'ellipse', cx, cy: cy + r * 0.42, w: r * 0.4, h: r * 0.34 }} seed={seed + 5} strokeWidth={1.2} fillColor="var(--ink)" fillStyle="solid" />}
      {dead && <Rough shape={{ k: 'lin', pts: [[cx - r * 0.4, cy + r * 0.48], [cx - r * 0.2, cy + r * 0.34], [cx, cy + r * 0.48], [cx + r * 0.2, cy + r * 0.34], [cx + r * 0.4, cy + r * 0.48]] }} seed={seed + 5} strokeWidth={1.2} stroke="var(--red)" roughness={0.4} />}
    </g>
  )
}

/** A request queue = dashed empty slots in a tube; `filled` trays wait in the first slots. */
export function QueueSlots({ x, y, w, h, slots = 4, filled = 2, seed = 8101 }: BoxProps & { slots?: number; filled?: number }) {
  const sw = (w - 8) / slots
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" />
      {Array.from({ length: slots }, (_, i) => (
        <g key={i}>
          <Rough shape={{ k: 'rect', x: x + 4 + i * sw + 1.5, y: y + h * 0.18, w: sw - 3, h: h * 0.64 }} seed={seed + 1 + i} strokeWidth={0.9} stroke="var(--ink-3)" dash="2 2.5" />
          {i >= slots - filled && <Tray x={x + 4 + i * sw + sw / 2} y={y + h / 2 + 1} w={Math.min(sw - 4, h * 1.1)} />}
        </g>
      ))}
    </g>
  )
}

/** A small laptop for icons: dark screen with a green prompt line, keyboard base. */
export function MiniLaptop({ x, y, w, h, seed = 8201 }: BoxProps) {
  const sh = h * 0.72
  return (
    <g>
      <Rough shape={{ k: 'rect', x: x + w * 0.08, y, w: w * 0.84, h: sh }} seed={seed} strokeWidth={1.5} fillColor="var(--bezel)" fillStyle="solid" />
      <rect x={x + w * 0.14} y={y + sh * 0.12} width={w * 0.72} height={sh * 0.76} rx={1} className="k-laptop-screen" />
      <Rough shape={{ k: 'lin', pts: [[x + w * 0.22, y + sh * 0.32], [x + w * 0.3, y + sh * 0.44], [x + w * 0.22, y + sh * 0.56]] }} seed={seed + 1} strokeWidth={1.1} stroke="var(--term-ok)" roughness={0.3} />
      <Rough shape={{ k: 'line', x1: x + w * 0.36, y1: y + sh * 0.58, x2: x + w * 0.56, y2: y + sh * 0.58 }} seed={seed + 2} strokeWidth={1.1} stroke="var(--term-ink)" roughness={0.3} />
      <Rough shape={{ k: 'path', d: `M${x} ${y + h} L${x + w} ${y + h} L${x + w * 0.92} ${y + sh} L${x + w * 0.08} ${y + sh} Z` }} seed={seed + 3} strokeWidth={1.4} fillColor="var(--paper-2)" fillStyle="solid" />
    </g>
  )
}

/** A small server card for icons: paper box, face porthole, a shelf line and a status dot (red when down). */
export function MiniServer({ x, y, w, h, mood = 'calm', seed = 8301 }: BoxProps & { mood?: ServerMood }) {
  const r = Math.min(w * 0.3, h * 0.28)
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} strokeWidth={1.6} stroke={mood === 'dead' ? 'var(--red)' : 'var(--ink)'} fillColor="var(--paper)" fillStyle="solid" />
      <MiniFace cx={x + w / 2} cy={y + h * 0.4} r={r} mood={mood} seed={seed + 1} />
      <Rough shape={{ k: 'line', x1: x + w * 0.14, y1: y + h * 0.8, x2: x + w * 0.86, y2: y + h * 0.8 }} seed={seed + 8} strokeWidth={1} />
      <circle cx={x + w * 0.78} cy={y + h * 0.9} r={Math.max(1.2, w * 0.05)} style={{ fill: mood === 'dead' || mood === 'panic' ? 'var(--red)' : 'var(--green)' }} />
    </g>
  )
}
