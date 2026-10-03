/**
 * Drawing pieces of the ReplicaSet board, all in the kit's pen: the version tape, the two fences (gauges), the
 * Deployment as a recipe card, and one ReplicaSet row with its lunchbox Pods.
 */
import { AnimatePresence } from 'motion/react'
import { DLabel, K8sGlyph, PodShape, POD_TONE, RecipeCard, Rough, SvgStamp } from '../../../kit'
import { countsText, type BoardModel, type PodDot, type RsRow } from '../lib/board'
import { podSlots, type BoardGeo } from '../lib/layout'
import { fenceLabel } from '../lib/options'
import type { VersionColour } from '../../../engines/cluster'

const MONO = 13

/** A short piece of coloured tape with the version on it (Plex Mono, dark note ink). */
export function VersionTape({ x, y, version, tone, anchor = 'start' }: { x: number; y: number; version: string; tone: VersionColour; anchor?: 'start' | 'end' }) {
  const w = version.length * 8 + 14
  const x0 = anchor === 'end' ? x - w : x
  return (
    <g aria-hidden="true">
      <Rough shape={{ k: 'rect', x: x0, y: y - 13, w, h: 18 }} seed={7300 + version.length * 7 + tone.length} stroke="var(--ink-3)" strokeWidth={1} fillColor={POD_TONE[tone].tape} fillStyle="solid" roughness={0.8} />
      <text x={x0 + w / 2} y={y + 1} textAnchor="middle" className="k-svg-mono" style={{ fontSize: MONO, fontWeight: 600, fill: 'var(--note-ink)' }}>
        {version}
      </text>
    </g>
  )
}

/**
 * A fence: a row of slots (one per Pod) and a red-pencil post at the limit. kind 'max' = total Pods ≤ N + surge
 * (terminating Pods are drawn beyond the post – the rollout does not count them); kind 'min' = available ≥ N − unavailable.
 */
export function FenceGauge({
  x,
  y,
  w,
  kind,
  count,
  limit,
  slots,
  extra = 0,
  label,
  valueText,
  alarm = false,
  post = true,
}: {
  x: number
  y: number
  w: number
  kind: 'min' | 'max'
  count: number
  limit: number
  slots: number
  extra?: number
  label: string
  /** replaces „count ≥ limit” (Recreate has no fence) */
  valueText?: string
  /** red even when the fence holds (nobody is available) */
  alarm?: boolean
  /** draw the red post at the limit */
  post?: boolean
}) {
  const n = Math.max(1, slots + extra)
  const cell = Math.min(17, (w - 6) / n)
  const sq = cell - 4
  const broken = kind === 'min' ? count < limit : count > limit
  const bad = broken || alarm
  const okTone = kind === 'min' ? 'var(--green)' : 'var(--pen)'
  const tone = bad ? 'var(--red)' : okTone
  const postX = x + limit * cell + 1
  const value = valueText ?? (kind === 'min' ? `${count} ≥ ${limit}` : `${count} ≤ ${limit}${extra ? ` +${extra}` : ''}`)
  return (
    <g>
      <DLabel x={x} y={y + 16} text={label} anchor="start" size={13} />
      <text x={x + w} y={y + 16} textAnchor="end" className="k-svg-mono" style={{ fontSize: MONO, fontWeight: 600, fill: tone }}>
        {broken ? '✗ ' : ''}
        {value}
      </text>
      {Array.from({ length: n }, (_, i) => {
        const cx = x + i * cell + 2
        const filled = i < count
        const term = i >= slots
        return (
          <Rough
            key={i}
            shape={{ k: 'rect', x: cx, y: y + 26, w: sq, h: sq }}
            seed={8100 + i}
            stroke={term ? 'var(--ink-3)' : filled ? tone : 'var(--ink-3)'}
            strokeWidth={filled ? 1.4 : 1}
            dash={term || !filled ? '3 3' : undefined}
            fillColor={term ? 'var(--ink-4)' : filled ? tone : undefined}
            hachureGap={3.2}
            roughness={0.8}
          />
        )
      })}
      {post && <Rough shape={{ k: 'line', x1: postX, y1: y + 21, x2: postX, y2: y + 31 + sq }} seed={8301 + limit} stroke="var(--red)" strokeWidth={2.4} roughness={0.6} />}
      {extra > 0 && <DLabel x={x + slots * cell + (extra * cell) / 2 + 2} y={y + 26 + sq + 16} text="u gašenju" size={12} tone="neutral" />}
    </g>
  )
}

/** The Deployment = a recipe card (the order the kitchen keeps: what to cook and how many portions). */
export function DeploymentCard({ geo, b }: { geo: BoardGeo; b: BoardModel }) {
  const { x, y, w, h } = geo.card
  const wide = geo.layout === 'wide'
  const strat =
    b.strategy === 'Recreate'
      ? ['Recreate', 'prvo ugasi sve']
      : ['maxSurge', `${fenceLabel(b.maxSurge)} → ${b.surge}`, 'maxUnavailable', `${fenceLabel(b.maxUnavailable)} → ${b.unavailable}`]
  if (!b.exists) {
    return (
      <g>
        <Rough shape={{ k: 'rect', x, y, w, h }} seed={5602} stroke="var(--ink-3)" strokeWidth={1.3} dash="5 5" />
        <SvgStamp x={x + w / 2} y={y + h / 2} text="OBRISAN" tone="red" size={wide ? 16 : 14} />
      </g>
    )
  }
  if (wide) {
    const lines = ['klopa-api', `replicas: ${b.replicas}`, b.strategy === 'Recreate' ? 'strategy:' : 'RollingUpdate', ...strat]
    return (
      <g>
        <RecipeCard x={x} y={y} w={w} h={h} lines={0} />
        <text x={x + 10} y={y + 22} className="k-svg-display" style={{ fontSize: 15, fontWeight: 800, fill: 'var(--note-ink)' }}>
          Deployment
        </text>
        {lines.map((l, i) => (
          <text key={i} x={x + 10} y={y + 46 + i * 21} className="k-svg-mono" style={{ fontSize: MONO, fontWeight: i < 2 ? 600 : 500, fill: 'var(--note-ink)' }}>
            {l}
          </text>
        ))}
        {b.paused && <SvgStamp x={x + w / 2} y={y + h - 12} text="PAUZA" tone="pen" size={13} />}
      </g>
    )
  }
  return (
    <g>
      <RecipeCard x={x} y={y} w={w} h={h} lines={0} />
      <text x={x + 10} y={y + 22} className="k-svg-mono" style={{ fontSize: MONO, fontWeight: 600, fill: 'var(--note-ink)' }}>
        Deployment klopa-api · replicas: {b.replicas}
      </text>
      <text x={x + 10} y={y + 44} className="k-svg-mono" style={{ fontSize: MONO, fill: 'var(--note-ink)' }}>
        {b.strategy === 'Recreate' ? 'Recreate · prvo ugasi sve' : `surge ${b.surge} · unavailable ${b.unavailable}`}
        {b.paused ? ' · PAUZA' : ''}
      </text>
    </g>
  )
}

/** One ReplicaSet: its name, revision and version tape, the counters, an optional traffic lane, and its Pods. */
export function RsRowView({
  row,
  rect,
  geo,
  lane,
  arrow,
  arrowColor,
  onPodClick,
  podLabel,
}: {
  row: RsRow
  rect: { x: number; y: number; w: number; h: number }
  geo: BoardGeo
  /** draw the dashed traffic lane above the Pods (flagship) */
  lane?: boolean
  /** ↑ grows / ↓ shrinks (Stepper notes) */
  arrow?: 'up' | 'down' | null
  arrowColor?: string
  onPodClick?: (p: PodDot) => void
  podLabel?: (p: PodDot) => string
}) {
  const wide = geo.layout === 'wide'
  const slots = podSlots(row.pods.length, rect, geo)
  const name = wide ? `ReplicaSet ${row.name}` : `rev ${row.revision} · …${row.hash}`
  const fx = wide ? rect.x - 30 : rect.x - 20
  return (
    <g>
      {/* the ReplicaSet as one tray of lunchboxes: a thin pencil frame keeps its header and its Pods together */}
      <Rough shape={{ k: 'rect', x: fx, y: rect.y - 6, w: geo.trunkX - 6 - fx, h: rect.h + 4 }} seed={8450 + row.revision} stroke="var(--ink-3)" strokeWidth={1} roughness={0.7} />
      <K8sGlyph kind="rs" x={wide ? rect.x - 22 : rect.x - 19} y={rect.y + 2} w={wide ? 20 : 18} h={wide ? 16 : 14} />
      <text x={rect.x + 2} y={rect.y + 14} className="k-svg-mono" style={{ fontSize: MONO, fontWeight: 600, fill: 'var(--ink)' }}>
        {name}
        {wide ? ` · rev ${row.revision}` : ''}
      </text>
      <VersionTape x={rect.x + rect.w} y={rect.y + 13} version={row.version} tone={row.tone} anchor="end" />
      <text x={rect.x + 2} y={rect.y + 32} className="k-svg-mono" style={{ fontSize: wide ? MONO : 12.5, fill: 'var(--ink-2)' }}>
        {countsText(row, wide)}
      </text>
      {lane && <Rough shape={{ k: 'line', x1: rect.x, y1: slots.laneY, x2: geo.trunkX, y2: slots.laneY }} seed={8400 + row.revision} stroke="var(--ink-3)" strokeWidth={1} dash="4 5" roughness={0.6} />}
      {arrow && (
        <g aria-hidden="true">
          {(() => {
            const ax = rect.x + rect.w - 6
            const cy = slots.laneY + 14 + slots.size * 0.62
            const [y1, y2] = arrow === 'up' ? [cy + 24, cy - 24] : [cy - 24, cy + 24]
            const head = arrow === 'up' ? -1 : 1
            const color = arrowColor ?? 'var(--pen)'
            return (
              <>
                <Rough shape={{ k: 'line', x1: ax, y1, x2: ax, y2 }} seed={8500 + (arrow === 'up' ? 1 : 2)} stroke={color} strokeWidth={2.2} />
                <Rough
                  shape={{ k: 'lin', pts: [[ax - 7, y2 - head * 9], [ax, y2], [ax + 7, y2 - head * 9]] }}
                  seed={8503 + (arrow === 'up' ? 1 : 2)}
                  stroke={color}
                  strokeWidth={2.2}
                />
              </>
            )
          })()}
        </g>
      )}
      <AnimatePresence>
        {row.pods.map((p, i) => {
          const [px, py] = slots.pts[i]
          return (
            <PodShape
              key={p.id}
              x={px}
              y={py}
              size={slots.size}
              status={p.status}
              tone={p.tone}
              restarts={p.status === 'crash' ? p.restarts : undefined}
              label={slots.size >= 43 && p.status !== 'crash' ? (podLabel ? podLabel(p) : p.version) : undefined}
              onClick={onPodClick ? () => onPodClick(p) : undefined}
              ariaLabel={`Pod ${p.name}, ${p.version}, ${p.statusText}${onPodClick ? ' – obriši' : ''}`}
            />
          )
        })}
      </AnimatePresence>
    </g>
  )
}
