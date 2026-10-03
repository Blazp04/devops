import { memo, useContext, useEffect, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Check, Cross, Rough } from '../sketch/Sketch'
import { hashSeed } from '../sketch/roughGen'
import { SvgStamp } from '../doodles/Things'
import { Burst } from '../doodles/diagram-doodles'
import { DBar } from './Diagram'
import { K8sGlyph } from './K8sGlyphs'
import { KIND_LABEL, POD_STATUS, POD_TONE, type K8sKind, type PodStatus, type PodTone } from './k8s-helpers'
import { clickableProps, DiagramClickCtx, minUnits, useDiagramScale } from './helpers'

/**
 * Kubernetes in the notebook's hand, shared by all lectures so objects look identical everywhere:
 * Pod = a lunchbox (state on its face and outline, version on a strip of tape), node = a big pencil frame with
 * fuel bars, every other kind = a small doodle from the menza story with its kubectl short name written under it.
 */

export type { K8sKind } from './k8s-helpers'

interface K8sIconProps {
  kind: K8sKind
  /** Center */
  x: number
  y: number
  size?: number
  /** Accent marker of the drawing (default per kind; the old Kubernetes blue is ignored) */
  color?: string
  /** Caption under the icon (e.g. object name) */
  caption?: ReactNode
  /** Font size of the caption in viewBox units (default 11,5; give ≥ 12 px on screen) */
  captionSize?: number
  dim?: boolean
}

/**
 * Kubernetes object icon: a hand-drawn doodle of the kind + its short kind label (mono), optional caption below.
 * The kind label grows with the drawing's scale (`useDiagramScale`) up to ½ of the icon so it stays ≥ 12 px.
 */
export function K8sIcon({ kind, x, y, size = 44, color, caption, captionSize, dim }: K8sIconProps) {
  const s = size
  const scale = useDiagramScale()
  const fs = Math.min(Math.max(10, s * 0.25, minUnits(12.2, scale)), Math.max(10, s * 0.45))
  const label = KIND_LABEL[kind]
  return (
    <g opacity={dim ? 0.35 : 1} className="k-k8s">
      <K8sGlyph kind={kind} x={x - s / 2} y={y - s / 2} w={s} h={s * 0.76} color={color === 'var(--k8s)' ? undefined : color} />
      <text x={x} y={y + s / 2 + fs * 0.25} textAnchor="middle" className="k-k8s__kind" style={{ fontSize: fs }}>
        {label}
      </text>
      {caption !== undefined && (
        <text x={x} y={y + s / 2 + fs + 13 + (captionSize ? captionSize - 11.5 : 0)} textAnchor="middle" className="k-k8s__caption" style={captionSize ? { fontSize: captionSize } : undefined}>
          {caption}
        </text>
      )}
    </g>
  )
}

interface PodProps {
  /** Center */
  x: number
  y: number
  size?: number
  status?: PodStatus
  /** Short label on the version tape, e.g. "v2" or "api" */
  label?: ReactNode
  /** Version tint: v1 = blue (hatching −41°), v2 = green (+41°); violet / rose hatch +41°, teal / amber −41° */
  tone?: PodTone
  /** Caption under the pod (e.g. its name or IP) */
  caption?: ReactNode
  /** Font size of the caption in viewBox units (default 10,5; give ≥ 12 px on screen) */
  captionSize?: number
  /** Makes the Pod a keyboard-accessible button (Enter / Space); name it with `ariaLabel` (default: label + status). */
  onClick?: () => void
  ariaLabel?: string
  /** Highlight ring (e.g. selected by a Service): blue pen, dashed */
  selected?: boolean
  /** CrashLoopBackOff: number of restarts written next to ↻ */
  restarts?: number
}

/** Size of the version-tape lettering: ≥ 12 px on screen when the drawing's scale is known (never wider than ½ size). */
function tapeFont(size: number, scale: number | null): number {
  const base = Math.max(9, size * 0.3)
  return Math.min(Math.max(base, minUnits(12.2, scale)), Math.max(base, size * 0.5))
}

/** Width of the version tape for a label. */
function tapeWidth(label: string, fs: number): number {
  return Math.max(18, label.length * fs * 0.64 + 8)
}

/**
 * Where the CrashLoopBackOff badge „↻ N” goes: on the lid's left (top) when it clears the version tape, otherwise
 * hanging under the box's bottom-left corner (so it never covers the version label). `fs` = its font size.
 */
function restartBadge(size: number, label: string | undefined, restarts: number | undefined, scale: number | null): { fs: number; below: boolean } {
  // ≥ 17,5 px on screen, but never taller than the lunchbox itself (a tiny Pod in a far-away drawing)
  const fs = Math.max(size * 0.38, Math.min(minUnits(17.5, scale), Math.max(17, size * 0.9)))
  if (!label) return { fs, below: false }
  const bw = size * 1.3
  const digits = restarts === undefined ? 0 : String(restarts).length
  // „↻” ≈ 0,85 em, the space ≈ 0,25 em, a Caveat digit ≈ 0,48 em
  const badgeW = fs * (0.85 + (digits ? 0.25 + 0.48 * digits : 0))
  const room = bw - tapeWidth(label, tapeFont(size, scale)) - 6
  return { fs, below: badgeW > room }
}

/** The drawing of one Pod in its local coordinates (centre 0, 0). Memoised: pods sit in simulations. */
const PodSketch = memo(function PodSketch({ size, status, tone, label, selected, restarts, scale }: { size: number; status: PodStatus; tone: PodTone; label?: string; selected?: boolean; restarts?: number; scale: number | null }) {
  const v = POD_TONE[tone]
  const bw = size * 1.3
  const bh = size * 0.92
  const hh = size * 0.24
  const x0 = -bw / 2
  const y0 = -bh / 2 + hh / 2
  const y1 = y0 + bh
  const red = status === 'crash' || status === 'oom'
  const pull = status === 'imagepull'
  const pend = status === 'pending'
  const done = status === 'completed' || status === 'terminating'
  const stroke = red ? 'var(--red)' : pull ? 'var(--orange)' : done ? 'var(--ink-3)' : 'var(--ink)'
  const seed = 4100 + (hashSeed(`${tone}|${size}`) % 400)
  const fs = tapeFont(size, scale)
  const tw = label ? tapeWidth(label, fs) : 0
  // face: a small paper window in the lower part of the box
  const fw = Math.max(16, size * 0.62)
  const fh = Math.max(11, size * 0.38)
  const fy = y0 + bh * 0.58
  const e = fw * 0.22
  const badge = status === 'crash' ? restartBadge(size, label, restarts, scale) : null
  // ImagePullBackOff: the image (a little stack of trays) in the box's right half, crossed out in red
  const gx = size * 0.48
  const gw = size * 0.22
  return (
    <g className={`k-pod k-pod--${status}`}>
      {status === 'oom' && <Burst cx={0} cy={fy - fh * 0.2} r={size * 0.95} seed={seed + 30} fill="color-mix(in srgb, var(--red) 55%, transparent)" />}
      {selected && <Rough shape={{ k: 'rect', x: x0 - 6, y: y0 - hh - 5, w: bw + 12, h: bh + hh + 11 }} seed={seed + 40} stroke="var(--pen)" strokeWidth={1.7} dash="5 4" roughness={1.2} />}
      <g className="k-pod__outline">
        <Rough shape={{ k: 'arc', cx: 0, cy: y0, w: bw * 0.42, h: hh * 2, start: Math.PI, stop: Math.PI * 2 }} seed={seed} stroke={stroke} strokeWidth={1.7} />
        <rect x={x0 + 1} y={y0 + 1} width={bw - 2} height={bh - 2} className="k-paper-fill" />
        <Rough
          shape={{ k: 'rect', x: x0, y: y0, w: bw, h: bh }}
          seed={seed + 1}
          stroke={stroke}
          strokeWidth={1.7}
          fillColor={pull ? undefined : red ? 'var(--red)' : v.tint}
          hachureAngle={red ? -v.angle : v.angle}
          hachureGap={red ? 3.2 : Math.max(3.6, size * 0.14)}
          fillWeight={red ? 1 : pend ? 0.55 : 0.85}
          dash={pend ? '5 4' : undefined}
        />
      </g>
      {/* face window */}
      <rect x={-fw / 2} y={fy - fh / 2} width={fw} height={fh} rx={3} className="k-pod__face" />
      {red ? (
        <g>
          <Cross x={-e} y={fy - 0.5} size={fh * 0.2} seed={seed + 5} strokeWidth={1.5} />
          <Cross x={e} y={fy - 0.5} size={fh * 0.2} seed={seed + 7} strokeWidth={1.5} />
        </g>
      ) : pend ? (
        <g>
          <Rough shape={{ k: 'line', x1: -e - fh * 0.2, y1: fy, x2: -e + fh * 0.2, y2: fy }} seed={seed + 5} strokeWidth={1.4} roughness={0.4} />
          <Rough shape={{ k: 'line', x1: e - fh * 0.2, y1: fy, x2: e + fh * 0.2, y2: fy }} seed={seed + 6} strokeWidth={1.4} roughness={0.4} />
        </g>
      ) : status === 'completed' ? (
        <g>
          <Rough shape={{ k: 'arc', cx: -e, cy: fy + 1, w: fh * 0.42, h: fh * 0.4, start: Math.PI, stop: Math.PI * 2 }} seed={seed + 5} strokeWidth={1.3} roughness={0.4} />
          <Rough shape={{ k: 'arc', cx: e, cy: fy + 1, w: fh * 0.42, h: fh * 0.4, start: Math.PI, stop: Math.PI * 2 }} seed={seed + 6} strokeWidth={1.3} roughness={0.4} />
        </g>
      ) : (
        <g>
          <circle cx={-e} cy={fy - fh * 0.12} r={Math.max(1.1, size * 0.045)} className="k-ink-fill" />
          <circle cx={e} cy={fy - fh * 0.12} r={Math.max(1.1, size * 0.045)} className="k-ink-fill" />
          {status === 'running' && <Rough shape={{ k: 'curve', pts: [[-e * 0.8, fy + fh * 0.12], [0, fy + fh * 0.32], [e * 0.8, fy + fh * 0.12]] }} seed={seed + 8} strokeWidth={1.3} roughness={0.4} />}
          {status === 'creating' && <Rough shape={{ k: 'ellipse', cx: 0, cy: fy + fh * 0.2, w: fh * 0.28, h: fh * 0.26 }} seed={seed + 8} strokeWidth={1.2} roughness={0.4} />}
          {pull && <Rough shape={{ k: 'curve', pts: [[-e * 0.8, fy + fh * 0.3], [0, fy + fh * 0.12], [e * 0.8, fy + fh * 0.3]] }} seed={seed + 8} strokeWidth={1.3} roughness={0.4} />}
          {(status === 'notready' || status === 'terminating') && <Rough shape={{ k: 'line', x1: -e * 0.7, y1: fy + fh * 0.24, x2: e * 0.7, y2: fy + fh * 0.18 }} seed={seed + 8} strokeWidth={1.3} roughness={0.4} />}
        </g>
      )}
      {pull && (
        <g>
          {[-1, 0, 1].map((k) => (
            <Rough key={k} shape={{ k: 'line', x1: gx - gw / 2 + k * 1.2, y1: fy + k * size * 0.1, x2: gx + gw / 2 + k * 1.2, y2: fy + k * size * 0.1 - 0.6 }} seed={seed + 14 + k} strokeWidth={1.5} stroke="var(--ink-2)" roughness={0.6} />
          ))}
          <Cross x={gx} y={fy} size={Math.max(4, size * 0.13)} seed={seed + 18} strokeWidth={2} />
        </g>
      )}
      {/* version tape with the label */}
      {label && (
        <g transform={`rotate(6 ${bw / 2 - 10} ${y0})`}>
          <rect x={bw / 2 - tw} y={y0 - fs * 0.62} width={tw} height={fs * 1.3} className="k-pod__tape" style={{ fill: red ? 'color-mix(in srgb, var(--red) 40%, var(--note-pink))' : v.tape }} />
          <text x={bw / 2 - tw / 2} y={y0 + fs * 0.38} textAnchor="middle" className="k-pod__tape-text" style={{ fontSize: fs }}>
            {label}
          </text>
        </g>
      )}
      {status === 'running' && <Check x={bw / 2 - fs * 0.62} y={y1 - fs * 0.62} size={Math.max(3.6, size * 0.12)} seed={seed + 10} strokeWidth={1.9} />}
      {status === 'completed' && <Check x={bw / 2 - fs * 0.62} y={y1 - fs * 0.62} size={Math.max(3.6, size * 0.12)} seed={seed + 10} strokeWidth={1.7} stroke="var(--ink-3)" />}
      {status === 'notready' && <circle cx={bw / 2 - fs * 0.6} cy={y1 - fs * 0.6} r={Math.max(2.6, size * 0.08)} className="k-pod__port-off" />}
      {/* sleepy „z”: decoration (the state is in the outline and the accessible name), still drawn ≥ 17 px */}
      {status === 'pending' && (
        <text x={bw / 2 + 2} y={y0 - 2} className="k-svg-hand" aria-hidden="true" style={{ fontSize: Math.max(size * 0.42, Math.min(minUnits(17.5, scale), Math.max(17, size * 0.8))), fill: 'var(--ink-3)' }}>
          z
        </text>
      )}
      {/* restarts: "↻ 4" on the lid, left of the handle — or under the box when a wide version tape needs the lid */}
      {badge && (
        <text x={x0 + 1} y={badge.below ? y1 + badge.fs * 0.86 : y0 - 3} className="k-svg-hand k-dhalo" style={{ fontSize: badge.fs, fill: 'var(--red)', fontWeight: 700 }}>
          ↻{restarts !== undefined ? ` ${restarts}` : ''}
        </text>
      )}
      {status === 'terminating' && <Rough shape={{ k: 'line', x1: x0 - 4, y1: y1 + 2, x2: bw / 2 + 4, y2: y0 - 4 }} seed={seed + 12} strokeWidth={1.6} stroke="var(--ink-2)" roughness={1} />}
    </g>
  )
})

/**
 * A Pod in a cluster diagram: a lunchbox with a handle. Its face and outline tell the state (Running smiles with a ✓,
 * Pending is dashed and sleepy, ContainerCreating pulses, Terminating fades and is struck out, CrashLoopBackOff is red
 * with X eyes and ↻, OOMKilled bursts red, not ready gets an empty port, ImagePullBackOff is an empty box in orange
 * pencil with its image crossed out), the tape tells the version. Lettering grows with the drawing's scale
 * (`useDiagramScale`) so it stays legible. Animates in and moves smoothly when x/y change. Wrap lists in
 * <AnimatePresence> for exit animations.
 */
export function PodShape({ x, y, size = 34, status = 'running', label, tone = 'blue', caption, captionSize, onClick, ariaLabel, selected, restarts }: PodProps) {
  const register = useContext(DiagramClickCtx)
  const scale = useDiagramScale()
  const clickable = !!onClick
  useEffect(() => (clickable && register ? register() : undefined), [clickable, register])
  const tapeLabel = typeof label === 'string' || typeof label === 'number' ? String(label) : undefined
  const badgeBelow = status === 'crash' && restartBadge(size, tapeLabel, restarts, scale)
  const bodyBottom = size * 0.46 + size * 0.12 + (badgeBelow && badgeBelow.below ? badgeBelow.fs * 0.95 : 0)
  const name = ariaLabel ?? `Pod ${tapeLabel !== undefined ? `${tapeLabel} ` : ''}(${POD_STATUS[status].label})`
  // Terminating / Completed fade only the drawing (k-pod--* CSS), never the lettering
  return (
    <motion.g
      initial={{ opacity: 0, scale: 0.4, x, y }}
      animate={{ opacity: 1, scale: 1, x, y }}
      exit={{ opacity: 0, scale: 0.4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      className={onClick ? 'k-pod-btn' : undefined}
      {...clickableProps(onClick, name)}
    >
      <PodSketch size={size} status={status} tone={tone} label={tapeLabel} selected={selected} restarts={restarts} scale={scale} />
      {label !== undefined && tapeLabel === undefined && (
        <text y={-size * 0.5} textAnchor="middle" className="k-pod__tape-text" style={{ fontSize: tapeFont(size, scale) }}>
          {label}
        </text>
      )}
      {caption !== undefined && (
        <text y={bodyBottom + 13} textAnchor="middle" className="k-pod__caption" style={captionSize ? { fontSize: captionSize } : undefined}>
          {caption}
        </text>
      )}
    </motion.g>
  )
}

/** Free room on a node: a dashed pencil box with "slobodno" written in it (x/y = top-left). */
export function FreeSlot({ x, y, w, h, label = 'slobodno' }: { x: number; y: number; w: number; h: number; label?: string }) {
  return (
    <g className="k-freeslot">
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={hashSeed(`free|${w}|${h}`)} strokeWidth={1.1} stroke="var(--ink-3)" dash="2 5" />
      {label && (
        <text x={x + w / 2} y={y + h / 2 + 6} textAnchor="middle" className="k-svg-hand" style={{ fontSize: Math.min(20, Math.max(17, w * 0.24)), fill: 'var(--ink-3)' }}>
          {label}
        </text>
      )}
    </g>
  )
}

interface NodeFrameProps {
  /** Top-left */
  x: number
  y: number
  w: number
  h: number
  name: ReactNode
  /** Capacity bars: used/total in the same unit (e.g. millicores, MiB). */
  cpu?: { used: number; total: number }
  mem?: { used: number; total: number }
  /** Short spec line, e.g. "2 vCPU · 4 GiB" (written after the name, in brackets) */
  spec?: ReactNode
  /** `provisioning` = a node still coming from the cloud (Cluster Autoscaler): faint dashed frame, „čvor stiže…” */
  status?: 'ready' | 'notready' | 'cordoned' | 'provisioning'
  /** the note written on a provisioning node (default „čvor stiže…”; e.g. „čvor stiže… 45 s”) */
  note?: ReactNode
  children?: ReactNode
  highlight?: boolean
  /** Free room on the node: dashed "slobodno" boxes (x/y top-left, in diagram coordinates) */
  free?: { x: number; y: number; w: number; h: number }[]
}

/**
 * A worker node: a big rough pencil frame „čvor 1 (worker · 4 vCPU · 8 GB)” with CPU / RAM fuel bars coloured in with
 * a marker at the bottom, room for Pods inside (header 30 units, bars in the last 24). NotReady = red frame, sparse
 * red hatching and a stamp; cordoned = dashed frame and a "cordon" note; provisioning = a faint dashed frame with
 * „čvor stiže…” (`note`) while the cloud brings it.
 */
export function NodeFrame({ x, y, w, h, name, cpu, mem, spec, status = 'ready', children, highlight, free, note }: NodeFrameProps) {
  const scale = useDiagramScale()
  // handwriting ≥ 17 px and print ≥ 12 px on screen when the drawing is shown smaller than 1:1 (capped so the
  // header and the bars keep their places)
  // the spec grows only as far as the header still fits in the frame (name ≈ 0,55 em per letter, Caveat ≈ 0,45 em)
  const nameLen = typeof name === 'string' ? name.length : 8
  const specLen = typeof spec === 'string' ? spec.length + 2 : 16
  const specFit = (w - 24 - nameLen * 16 * 0.55 - 7) / (specLen * 0.45)
  const specSize = Math.max(17, Math.min(26, minUnits(17.5, scale), specFit))
  const monoSize = Math.min(18, Math.max(12.5, minUnits(12.2, scale)))
  const pctSize = Math.min(15, monoSize)
  const down = status === 'notready'
  const cordoned = status === 'cordoned'
  const coming = status === 'provisioning'
  const stroke = down ? 'var(--red)' : coming ? 'var(--ink-3)' : highlight ? 'var(--module-accent, var(--pen))' : 'var(--ink)'
  const seed = hashSeed(`node|${w}|${h}|${typeof name === 'string' ? name : ''}`)
  const pct = w >= 300
  const barW = Math.max(30, Math.min(84, (w - (pct ? 188 : 112)) / 2))
  const by = y + h - 18
  const bar = (bx: number, label: string, v: { used: number; total: number }) => {
    const f = v.total > 0 ? v.used / v.total : 0
    return (
      <g>
        <text x={bx} y={by + 9} className="k-nodeframe__bar-label" style={monoSize > 12.5 ? { fontSize: monoSize } : undefined}>
          {label}
        </text>
        <DBar x={bx + 36} y={by} w={barW} h={10} value={f} />
        {pct && (
          <text x={bx + 36 + barW + 5} y={by + 9} className="k-nodeframe__pct" style={pctSize > 12.5 ? { fontSize: pctSize } : undefined}>
            {Math.round(f * 100)} %
          </text>
        )}
      </g>
    )
  }
  const second = x + 12 + 36 + barW + (pct ? 50 : 16)
  return (
    <g className={`k-nodeframe is-${status}`}>
      <Rough
        shape={{ k: 'rect', x, y, w, h }}
        seed={seed}
        stroke={stroke}
        strokeWidth={highlight || down ? 2.1 : 1.8}
        roughness={1.5}
        fillColor="var(--paper)"
        fillStyle="solid"
        multi={highlight || down}
        dash={cordoned ? '9 5' : coming ? '4 6' : undefined}
        draw={cordoned || coming ? undefined : true}
      />
      {down && <Rough shape={{ k: 'rect', x: x + 4, y: y + 4, w: w - 8, h: h - 8 }} seed={seed + 3} stroke="none" strokeWidth={0} fillColor="var(--red)" hachureGap={14} fillWeight={0.7} className="k-nodeframe__wreck" />}
      <text x={x + 12} y={y + 22} className="k-nodeframe__name" style={down ? { fill: 'var(--red)' } : undefined}>
        {name}
        {spec !== undefined && (
          <tspan dx={7} className="k-nodeframe__spec" style={specSize > 17 ? { fontSize: specSize } : undefined}>
            ({spec})
          </tspan>
        )}
      </text>
      {cpu && bar(x + 12, 'CPU', cpu)}
      {mem && bar(cpu ? second : x + 12, 'RAM', mem)}
      {free?.map((f, i) => (
        <FreeSlot key={i} {...f} />
      ))}
      {down && <SvgStamp x={x + w - 58 - (monoSize - 12.5) * 3} y={y + 20} text="NotReady" tone="red" size={Math.max(12, monoSize - 0.5)} rotate={-5} />}
      {coming && (
        <text x={x + w - 12} y={y + 22} textAnchor="end" className="k-svg-hand" style={{ fontSize: specSize, fill: 'var(--ink-2)' }}>
          {note ?? 'čvor stiže…'}
        </text>
      )}
      {cordoned && (
        <text x={x + w - 12} y={y + 22} textAnchor="end" className="k-svg-hand" style={{ fontSize: specSize, fill: 'var(--orange)' }}>
          cordon: bez novih Podova
        </text>
      )}
      {children}
    </g>
  )
}
