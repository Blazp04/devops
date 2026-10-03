/**
 * The ReplicaSet board: two fences on top, the Deployment recipe card, ReplicaSet rows (oldest on top) with their
 * lunchbox Pods, an optional traffic trunk with request trays, and an optional strip of the latest answers.
 * Pure drawing of plain data (BoardModel + trays), so the flagship, the Stepper and the stall figure share it.
 */
import { AnimatePresence } from 'motion/react'
import { Diagram, DLabel, PodShape, POD_TONE, Rough, plural, useDiagramIds } from '../../../kit'
import type { BoardModel, PodDot } from '../lib/board'
import { boardGeo, boardRows, podSlots, type BoardGeo, type BoardLayout } from '../lib/layout'
import type { StripCell, TrayDot } from '../lib/traffic'
import { DeploymentCard, FenceGauge, RsRowView } from './parts'

const STRIP_H = 50

export function BoardStage({
  b,
  layout,
  label,
  lane,
  trays,
  strip,
  arrows,
  onPodClick,
  rps,
  rowSlots,
}: {
  b: BoardModel
  layout: BoardLayout
  label: string
  lane?: boolean
  trays?: TrayDot[]
  strip?: StripCell[] | null
  arrows?: Record<string, 'up' | 'down'>
  onPodClick?: (p: PodDot) => void
  rps?: number
  /** fixed number of row slots (stable height); default: 3 wide, 2 narrow */
  rowSlots?: number
}) {
  const geo = boardGeo(layout, rowSlots)
  const { rows, hidden } = boardRows(b, geo.rows.length)
  const H = geo.H + (strip ? STRIP_H : 0)
  const wide = layout === 'wide'
  const maxSlots = Math.max(b.maxTotal, b.total)
  // Recreate has no availability fence (its „minimum” is 0): show plain „x od N”, red when nobody is available
  const recreate = b.exists && b.strategy === 'Recreate'
  const orphanSlots = rows.length === 0 && b.orphans.length > 0 ? podSlots(b.orphans.length, geo.rows[0], geo) : null
  return (
    <div style={wide ? undefined : { maxWidth: 460, margin: '0 auto' }}>
      <Diagram width={geo.W} height={H} label={label} interactive={!!onPodClick}>
        <FenceGauge
          x={geo.gauges[0].x}
          y={geo.gauges[0].y}
          w={geo.gauges[0].w}
          kind="min"
          label={recreate ? 'dostupnih Podova (Recreate)' : 'dostupnih Podova'}
          count={b.available}
          limit={b.minAvailable}
          slots={Math.max(b.replicas, b.available)}
          valueText={recreate ? `${b.available} od ${b.replicas}` : undefined}
          alarm={b.exists && b.replicas > 0 && b.available === 0}
          post={!recreate}
        />
        <FenceGauge x={geo.gauges[1].x} y={geo.gauges[1].y} w={geo.gauges[1].w} kind="max" label="Podova ukupno" count={b.total} limit={b.maxTotal} slots={maxSlots} extra={b.terminating} />
        <DeploymentCard geo={geo} b={b} />
        <Ownership geo={geo} count={b.exists ? rows.length : 0} />
        {lane && <Trunk geo={geo} lanes={rows.length} rps={rps} />}
        {rows.map((r, i) => (
          <RsRowView key={r.id} row={r} rect={geo.rows[i]} geo={geo} lane={lane} arrow={arrows?.[r.id] ?? null} arrowColor={arrows?.[r.id] === 'up' ? 'var(--green)' : 'var(--red)'} onPodClick={onPodClick} />
        ))}
        {rows.length === 0 && (
          <DLabel x={geo.rows[0].x + geo.rows[0].w / 2} y={geo.rows[0].y + 16} text={b.orphans.length ? 'ReplicaSetovi su obrisani, Podovi se gase…' : 'nema nijednog Poda'} size={13} tone="bad" />
        )}
        {orphanSlots && (
          <AnimatePresence>
            {b.orphans.map((p, i) => (
              <PodShape key={p.id} x={orphanSlots.pts[i][0]} y={orphanSlots.pts[i][1]} size={orphanSlots.size} status={p.status} tone={p.tone} ariaLabel={`Pod ${p.name}, ${p.version}, ${p.statusText}, bez vlasnika`} />
            ))}
          </AnimatePresence>
        )}
        {b.exists && rows.length > 0 && rows.length < geo.rows.length && (
          <DLabel x={geo.rows[rows.length].x + geo.rows[rows.length].w / 2} y={geo.rows[rows.length].y + 40} text="nova revizija dobit će ovdje svoj ReplicaSet" size={13} />
        )}
        {hidden > 0 && <DLabel x={geo.rows[0].x + geo.rows[0].w} y={geo.rows[0].y - 4} anchor="end" text={`+${plural(hidden, ['stariji ReplicaSet', 'starija ReplicaSeta', 'starijih ReplicaSetova'])}`} size={12} />}
        {trays && <Trays trays={trays} />}
        {strip && <Strip cells={strip} geo={geo} y={geo.H} />}
      </Diagram>
    </div>
  )
}

/** ownerReferences: the Deployment owns every ReplicaSet (pen lines from the recipe card). */
function Ownership({ geo, count }: { geo: BoardGeo; count: number }) {
  const lines = []
  for (let i = 0; i < count; i++) {
    const r = geo.rows[i]
    const pts: [number, number][] =
      geo.layout === 'wide'
        ? [
            [geo.card.x + geo.card.w, geo.card.y + 26 + i * 8],
            [r.x - 30, r.y + 9],
          ]
        : [
            [5, geo.card.y + geo.card.h - 6],
            [5, r.y + 9],
            [r.x - 20, r.y + 9],
          ]
    lines.push(<Rough key={i} shape={{ k: 'lin', pts }} seed={8600 + i} stroke="var(--ink-3)" strokeWidth={1.2} roughness={0.7} />)
  }
  return <g aria-hidden="true">{lines}</g>
}

/** The traffic trunk on the right edge: requests come down it and turn into each ReplicaSet's lane. */
function Trunk({ geo, lanes, rps }: { geo: BoardGeo; lanes: number; rps?: number }) {
  const ids = useDiagramIds()
  const last = geo.rows[Math.max(0, lanes - 1)]
  const bottom = last ? last.y + 38 : geo.trunkTop + 40
  return (
    <g aria-hidden="true">
      <Rough shape={{ k: 'line', x1: geo.trunkX, y1: geo.trunkTop, x2: geo.trunkX, y2: bottom }} seed={8700} stroke="var(--ink-3)" strokeWidth={1.2} dash="4 5" roughness={0.6} />
      {ids && geo.layout === 'wide' && <use href={ids.tray} x={geo.trunkX - 13} y={geo.trunkTop - 20} width={26} height={18} fill="var(--tray)" />}
      {rps !== undefined && geo.layout === 'wide' && (
        <text x={geo.trunkX - 18} y={geo.trunkTop - 6} textAnchor="end" className="k-svg-mono" style={{ fontSize: 13, fill: 'var(--tray-ink)' }}>
          {rps}/s
        </text>
      )}
    </g>
  )
}

function Trays({ trays }: { trays: TrayDot[] }) {
  const ids = useDiagramIds()
  if (!ids) return null
  return (
    <g aria-hidden="true">
      {trays.map((t) => (
        <g key={t.id}>
          <use href={ids.tray} x={t.x - 13} y={t.y - 9} width={26} height={18} fill={t.bad ? 'color-mix(in srgb, var(--red) 78%, var(--paper))' : 'var(--tray)'} />
          {t.bad && (
            <text x={t.x - 15} y={t.y + 5} textAnchor="end" className="k-svg-mono" style={{ fontSize: 14, fontWeight: 700, fill: 'var(--red)' }}>
              ✗
            </text>
          )}
        </g>
      ))}
    </g>
  )
}

/** The latest answers, oldest left: each cell hatched in its version's colour and direction; ✗ = failed request. */
function Strip({ cells, geo, y }: { cells: StripCell[]; geo: BoardGeo; y: number }) {
  const n = geo.layout === 'wide' ? 40 : 22
  const shown = cells.slice(-n)
  const x0 = geo.layout === 'wide' ? 194 : 8
  const w = geo.W - x0 - 10
  const cw = w / n
  return (
    <g>
      <DLabel x={geo.layout === 'wide' ? 10 : 8} y={y + (geo.layout === 'wide' ? 34 : 14)} text={geo.layout === 'wide' ? 'zadnji odgovori →' : 'zadnji odgovori (najnoviji desno)'} anchor="start" size={13} />
      {shown.map((c, i) => {
        const x = x0 + (n - shown.length + i) * cw
        const yy = y + (geo.layout === 'wide' ? 14 : 22)
        const t = c.tone ? POD_TONE[c.tone] : null
        return c.ok && t ? (
          <Rough key={i} shape={{ k: 'rect', x: x + 1, y: yy, w: cw - 3, h: 22 }} seed={8800 + i} stroke="var(--ink-3)" strokeWidth={1} fillColor={t.tint} hachureAngle={t.angle} hachureGap={3} roughness={0.7} />
        ) : (
          <g key={i}>
            <Rough shape={{ k: 'rect', x: x + 1, y: yy, w: cw - 3, h: 22 }} seed={8800 + i} stroke="var(--red)" strokeWidth={1.3} roughness={0.7} />
            <text x={x + cw / 2 - 1} y={yy + 16} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 13, fontWeight: 700, fill: 'var(--red)' }}>
              ✗
            </text>
          </g>
        )
      })}
    </g>
  )
}
