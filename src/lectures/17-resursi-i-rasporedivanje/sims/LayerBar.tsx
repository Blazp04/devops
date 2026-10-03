import { Rough, hashSeed, useDiagramIds } from '../../../kit'
import styles from '../styles.module.css'

export interface BarBlock {
  key: string
  amount: number
  /** DaemonSet block (grey) */
  system?: boolean
  selected?: boolean
}

/**
 * Three layers of one resource on one node, the way the lecture names them:
 * requests = hatched blocks (what the scheduler books), usage = the food strip under the bar (what the node really
 * spends), Σ limits = a red dashed tick (what the kernel would allow; may be past the end = overcommit, ∞ = no limit).
 */
export function LayerBar({
  x,
  y,
  w,
  h,
  alloc,
  blocks,
  used,
  limits,
  unbounded,
  label,
  labelX,
  textX,
  font,
  seed,
  unit,
  split = false,
}: {
  x: number
  y: number
  w: number
  h: number
  alloc: number
  blocks: BarBlock[]
  used: number
  limits: number
  unbounded: boolean
  label: string
  labelX: number
  textX: number
  font: { mono: number; label: number; barText?: number }
  seed: string
  unit: 'cpu' | 'mem'
  /** Σ limits on a second line (narrow node columns) */
  split?: boolean
}) {
  const ids = useDiagramIds()
  const scale = alloc > 0 ? w / alloc : 0
  const placed: { b: BarBlock; bx: number; bw: number }[] = []
  for (const b of blocks) {
    const bx = placed.length ? placed[placed.length - 1].bx + placed[placed.length - 1].bw : x
    placed.push({ b, bx, bw: Math.max(0, Math.min(x + w - bx, b.amount * scale)) })
  }
  const requested = blocks.reduce((a, b) => a + b.amount, 0)
  const usedW = Math.min(w, Math.max(0, used * scale))
  const limFrac = alloc > 0 ? limits / alloc : 0
  const limX = x + Math.min(1, limFrac) * w
  const pct = (v: number) => `${Math.round(v * 100)} %`
  const limText = unbounded ? '∞' : pct(limFrac)
  const over = requested / alloc
  return (
    <g aria-hidden="true">
      <text x={labelX} y={y + h - 2} className={styles.svgLabel} style={{ fontSize: font.label }}>
        {label}
      </text>
      {placed.map(({ b, bx, bw }) => {
        if (bw <= 0.2) return null
        return (
          <g key={b.key}>
            {b.selected && <rect x={bx} y={y} width={bw} height={h} style={{ fill: 'var(--hl-yellow)' }} />}
            <rect x={bx} y={y} width={bw} height={h} style={{ fill: ids ? `url(${b.system ? ids.hatch : ids.hatchV1})` : 'none' }} />
            <line x1={bx + bw} y1={y} x2={bx + bw} y2={y + h} style={{ stroke: 'var(--ink-2)', strokeWidth: 1 }} />
          </g>
        )
      })}
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={hashSeed(`lb|${seed}`)} stroke="var(--ink-2)" strokeWidth={1.2} roughness={0.6} bowing={0.3} />
      {/* usage: food on the plate */}
      <rect x={x} y={y + h + 3} width={Math.max(0.001, usedW)} height={5} rx={1.5} style={{ fill: 'var(--food)' }} />
      {/* Σ limits */}
      {!unbounded && (
        <g>
          <line x1={limX} y1={y - 5} x2={limX} y2={y + h + 9} style={{ stroke: 'var(--red)', strokeWidth: 1.8, strokeDasharray: '3 2.5' }} />
          {limFrac > 1 && <path d={`M${limX + 2} ${y - 5} l6 3 l-6 3`} style={{ fill: 'none', stroke: 'var(--red)', strokeWidth: 1.6 }} />}
        </g>
      )}
      <text x={textX} y={y + h + 23} className={styles.svgMono} style={{ fontSize: font.barText ?? font.mono }}>
        <tspan>rez. {pct(over)}</tspan>
        <tspan className={styles.svgMuted}> · </tspan>
        <tspan style={{ fill: 'var(--food-ink, var(--ink))' }}>troši {pct(alloc > 0 ? used / alloc : 0)}</tspan>
        {!split && (
          <>
            <tspan className={styles.svgMuted}> · </tspan>
            <tspan style={{ fill: 'var(--red)' }}>lim {limText}</tspan>
          </>
        )}
      </text>
      {split && (
        <text x={textX} y={y + h + 38} className={styles.svgMono} style={{ fontSize: font.barText ?? font.mono, fill: 'var(--red)' }}>
          Σ limits {limText}
        </text>
      )}
      <title>{`${label}: rezervirano ${Math.round(requested)}${unit === 'cpu' ? 'm' : 'Mi'} od ${Math.round(alloc)}${unit === 'cpu' ? 'm' : 'Mi'}`}</title>
    </g>
  )
}
