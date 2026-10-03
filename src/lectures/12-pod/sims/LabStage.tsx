/**
 * The stage of „Laboratorij zdravlja Poda”: students → Service tag (traffic only to Ready Pods) → three bare
 * klopa-api Pods, each with phase / STATUS / READY, the restart counter, the back-off ring and the three probe lanes.
 * Pure drawing of the engine's state (lib/view.ts); trays are one pooled layer positioned with pointAt.
 */
import { memo } from 'react'
import { Check, Cross, Cylinder, MiniLunchbox, PodShape, Rough, ServiceTag, StudentQueue, TrayDefs, plural, pointAt } from '../../../kit'
import { inFlightAt } from '../../../engines/cluster/index.ts'
import type { LabGeo, P, RowGeo } from '../lib/geometry'
import type { LabState } from '../lib/lab'
import type { LaneView, RowView } from '../lib/view'

const TRAY = 'l12lab'

function pathLen(pts: P[]): number {
  let n = 0
  for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return n
}

const LaneMark = memo(function LaneMark({ ok, x, y, seed }: { ok: boolean; x: number; y: number; seed: number }) {
  return <g transform={`translate(${x} ${y})`}>{ok ? <Check x={0} y={0} size={5.5} seed={seed} strokeWidth={2} /> : <Cross x={0} y={0} size={4.6} seed={seed} strokeWidth={2} />}</g>
})

function Lanes({ lanes, g, geo }: { lanes: LaneView[]; g: RowGeo; geo: LabGeo }) {
  const { labelX, slotX, slotW, slots, y } = g.lanes
  return (
    <g>
      {lanes.map((l, li) => {
        const ly = y[li]
        const faint = l.state === 'off' || l.state === 'waiting'
        return (
          <g key={l.kind}>
            <text x={labelX} y={ly + 5} className="k-svg-hand" style={{ fontSize: geo.font.hand, fill: faint ? 'var(--ink-3)' : 'var(--pen)' }}>
              {l.label}
            </text>
            <Rough shape={{ k: 'line', x1: slotX - 4, y1: ly + 9, x2: slotX + slots * slotW, y2: ly + 9 }} seed={8800 + li} stroke="var(--ink-4)" strokeWidth={1} dash="3 4" roughness={0.6} />
            {l.state === 'off' && (
              <text x={slotX} y={ly + 4} className="k-svg-mono" style={{ fontSize: geo.font.monoSmall, fill: 'var(--ink-3)' }}>
                isključena
              </text>
            )}
            {l.state === 'waiting' && (
              <text x={slotX} y={ly + 4} className="k-svg-mono" style={{ fontSize: geo.font.monoSmall, fill: 'var(--ink-3)' }}>
                čeka start
              </text>
            )}
            {l.state === 'passed' && (
              <text x={slotX} y={ly + 4} className="k-svg-mono" style={{ fontSize: geo.font.monoSmall, fill: 'var(--green)', fontWeight: 600 }}>
                ✓ prošla
              </text>
            )}
            {l.state === 'active' &&
              l.marks.map((ok, i) => {
                const offset = slots - l.marks.length
                return <LaneMark key={i} ok={ok} x={slotX + (offset + i) * slotW + slotW / 2} y={ly} seed={ok ? 31 : 37} />
              })}
          </g>
        )
      })}
    </g>
  )
}

function BackoffRing({ r, g, geo }: { r: RowView; g: RowGeo; geo: LabGeo }) {
  const { cx, cy, r: rad } = g.ring
  const b = r.backoff
  // remaining pause as a pen arc (quantised, so the hand-drawn line does not re-wobble every frame)
  const frac = b && b.delayS > 0 ? Math.round(Math.max(0, Math.min(1, b.remainingS / b.delayS)) * 48) / 48 : 0
  return (
    <g>
      <text x={g.restarts[0]} y={g.restarts[1]} textAnchor="middle" className="k-svg-mono" style={{ fontSize: geo.font.name, fontWeight: 700, fill: r.restarts > 0 ? 'var(--red)' : 'var(--ink-3)' }}>
        ↻ {r.restarts}
      </text>
      {b && (
        <g>
          <Rough shape={{ k: 'ellipse', cx, cy, w: rad * 2, h: rad * 2 }} seed={8900} stroke="var(--ink-3)" strokeWidth={1.2} dash="3 3" />
          {frac > 0 && <Rough shape={{ k: 'arc', cx, cy, w: rad * 2, h: rad * 2, start: -Math.PI / 2, stop: -Math.PI / 2 + frac * 2 * Math.PI }} seed={8901} stroke={b.kind === 'crash' ? 'var(--red)' : 'var(--orange)'} strokeWidth={2.2} roughness={0.8} />}
          <text x={cx} y={cy + 4.5} textAnchor="middle" className="k-svg-mono" style={{ fontSize: geo.font.monoSmall, fontWeight: 700 }}>
            {Math.ceil(b.remainingS)} s
          </text>
          <text x={g.ringLabel[0]} y={g.ringLabel[1]} textAnchor="middle" className="k-svg-hand" style={{ fontSize: geo.font.hand, fill: b.kind === 'crash' ? 'var(--red)' : 'var(--orange)' }}>
            pauza {b.delayS} s
          </text>
        </g>
      )}
    </g>
  )
}

function statusColor(status: string): string {
  if (/BackOff|Err|Error|Terminating/.test(status)) return 'var(--red)'
  if (status === 'Running') return 'var(--ink)'
  return 'var(--orange)'
}

function PodRow({ r, g, geo, selected, onPick, seed }: { r: RowView; g: RowGeo; geo: LabGeo; selected: boolean; onPick: (name: string) => void; seed: number }) {
  const f = g.frame
  if (r.gone) {
    return (
      <g>
        <Rough shape={{ k: 'rect', x: f.x, y: f.y, w: f.w, h: f.h }} seed={seed} stroke="var(--ink-3)" strokeWidth={1.1} dash="5 6" />
        <MiniLunchbox x={g.pod[0] - 28} y={g.pod[1] - 24} w={56} h={44} dash="4 4" stroke="var(--ink-3)" tint="transparent" />
        <text x={g.name[0]} y={g.name[1]} className="k-svg-mono" style={{ fontSize: geo.font.name, fontWeight: 700, fill: 'var(--ink-3)' }}>
          {r.name}
        </text>
        <text x={g.lines.x} y={g.lines.y[0]} className="k-svg-mono" style={{ fontSize: geo.font.mono, fill: 'var(--ink-2)' }}>
          Pod je obrisan.
        </text>
        <text x={g.lines.x} y={g.lines.y[1] + 6} className="k-svg-hand" style={{ fontSize: geo.font.hand + 1, fill: 'var(--red)' }}>
          goli Pod – nitko ga ne vraća
        </text>
      </g>
    )
  }
  const lineLabels = ['faza', 'STATUS', 'READY']
  const values = [r.phase, r.status, r.readyColumn]
  return (
    <g>
      <Rough shape={{ k: 'rect', x: f.x, y: f.y, w: f.w, h: f.h }} seed={seed} stroke={r.nodeUp ? 'var(--ink-3)' : 'var(--red)'} strokeWidth={1.2} dash={r.nodeUp ? '6 5' : '3 4'} />
      <text x={g.name[0]} y={g.name[1]} className="k-svg-mono" style={{ fontSize: geo.font.name, fontWeight: 700 }}>
        {r.name}
      </text>
      {r.hung && (
        <text x={g.name[0] + (geo.kind === 'narrow' ? 132 : 128)} y={g.name[1]} className="k-svg-hand" style={{ fontSize: geo.font.hand, fill: 'var(--red)' }}>
          zaglavio!
        </text>
      )}
      <PodShape x={g.pod[0]} y={g.pod[1]} size={g.podSize} status={r.shape} tone="blue" label="api" selected={selected} onClick={() => onPick(r.name)} ariaLabel={`Odaberi ${r.name}: ${r.status}, ${r.readyColumn} spreman`} />
      <text x={g.meta[0]} y={g.meta[1]} className="k-svg-mono" style={{ fontSize: geo.font.monoSmall, fill: r.nodeUp ? 'var(--ink-2)' : 'var(--red)' }}>
        {r.ip ?? '—'} · {r.node ?? 'bez čvora'}
        {!r.nodeUp && ' ✗ ugašen'}
      </text>
      {lineLabels.map((label, i) => (
        <g key={label}>
          <text x={g.lines.x} y={g.lines.y[i]} className="k-svg-mono" style={{ fontSize: geo.font.monoSmall, fill: 'var(--ink-3)' }}>
            {label}
          </text>
          <text x={g.lines.valueX} y={g.lines.y[i]} className="k-svg-mono" style={{ fontSize: geo.font.mono, fontWeight: 700, fill: i === 1 ? statusColor(values[i]) : i === 2 ? (r.ready ? 'var(--green)' : 'var(--ink)') : 'var(--ink)' }}>
            {values[i]}
          </text>
        </g>
      ))}
      <BackoffRing r={r} g={g} geo={geo} />
      <Lanes lanes={r.lanes} g={g} geo={geo} />
    </g>
  )
}

const Students = memo(function Students({ x, y }: { x: number; y: number }) {
  return <StudentQueue x={x} y={y} count={3} scale={0.34} direction={-1} />
})

export function LabStage({ w, rows, geo, target, onPick }: { w: LabState; rows: RowView[]; geo: LabGeo; target: string; onPick: (name: string) => void }) {
  const s = w.cl
  const readyCount = rows.filter((r) => !r.gone && r.ready && !r.terminating).length
  const db = s.db
  const dbLeft = db.downUntil !== null ? Math.max(0, Math.ceil(db.downUntil - s.t)) : null
  const byName = new Map(rows.map((r, i) => [r.name, i]))
  const all = inFlightAt(s)
  const flights = all.filter((f) => f.r.podName && byName.has(f.r.podName))
  // no endpoint (or no Pod at all): the tray leaves the tag and falls right there
  const dropped = all.filter((f) => !f.r.podName)
  const refLen = pathLen(geo.row(1).route)
  const dropLen = pathLen(geo.drop)
  const t = geo.tag
  const stacked = geo.kind !== 'wide'
  return (
    <svg viewBox={`0 0 ${geo.W} ${geo.H}`} role="group" aria-label={`Tri gola Poda klopa-api: ${rows.map((r) => `${r.name} ${r.gone ? 'obrisan' : `${r.status}, READY ${r.readyColumn}, ${plural(r.restarts, ['restart', 'restarta', 'restarta'])}`}`).join('; ')}. Spremnih Podova: ${readyCount}.`} style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}>
      <TrayDefs id={TRAY} />
      {/* the database every Pod shares */}
      <Cylinder x={geo.db.x} y={geo.db.y} w={geo.db.w} h={geo.db.h} seed={9101} />
      <text x={geo.db.x + geo.db.w / 2} y={geo.db.y + geo.db.h / 2 + 9} textAnchor="middle" className="k-svg-mono" style={{ fontSize: geo.font.mono, fontWeight: 600 }}>
        db
      </text>
      {!db.up && <Cross x={geo.db.x + geo.db.w / 2} y={geo.db.y + geo.db.h / 2 + 4} size={14} seed={9102} strokeWidth={3} />}
      <text x={geo.db.textX} y={geo.db.textY} textAnchor={geo.db.anchor} className="k-svg-mono" style={{ fontSize: geo.font.monoSmall, fill: db.up ? 'var(--ink-2)' : 'var(--red)', fontWeight: db.up ? 400 : 700 }}>
        {db.up ? 'baza radi ✓' : 'baza pala ✗'}
      </text>
      {!db.up && dbLeft !== null && (
        <text x={geo.db.textX} y={geo.db.textY + 20} textAnchor={geo.db.anchor} className="k-svg-mono" style={{ fontSize: geo.font.monoSmall, fill: 'var(--red)' }}>
          još {dbLeft} s
        </text>
      )}
      {/* traffic: students → Service tag */}
      {geo.students && <Students x={geo.students.x} y={geo.students.y} />}
      <text x={geo.traffic[0]} y={geo.traffic[1]} textAnchor={stacked ? 'start' : 'middle'} className="k-svg-hand" style={{ fontSize: geo.font.hand, fill: 'var(--tray-ink)' }}>
        {stacked ? '20 zahtjeva/s ↓' : '20 zahtjeva/s →'}
      </text>
      <text x={geo.gloss.x} y={geo.gloss.y} textAnchor={geo.gloss.anchor} className="k-svg-hand" style={{ fontSize: geo.font.hand, fill: 'var(--ink-3)' }}>
        etiketa = Service
      </text>
      <ServiceTag x={t.x} y={t.y} w={t.w} h={t.h} seed={9103}>
        <text x={t.x + t.w / 2 + 8} y={t.y + t.h / 2 + 5} textAnchor="middle" className="k-svg-mono" style={{ fontSize: geo.font.mono, fontWeight: 700 }}>
          klopa-api
        </text>
      </ServiceTag>
      <text x={geo.readyText[0]} y={geo.readyText[1]} textAnchor={geo.readyAnchor} className="k-svg-mono" style={{ fontSize: geo.font.mono, fontWeight: 700, fill: readyCount === 0 ? 'var(--red)' : 'var(--ink)' }}>
        spremni: {readyCount} / 3
      </text>
      {(geo.noteLines === 2 ? (readyCount === 0 ? ['nema endpointa:', 'veza odbijena'] : ['promet samo', 'spremnima']) : [readyCount === 0 ? 'nema endpointa: veza odbijena' : 'promet samo spremnima']).map((line, i) => (
        <text key={line} x={geo.readyText[0]} y={geo.readyText[1] + 24 + i * 21} textAnchor={geo.readyAnchor} className="k-svg-hand" style={{ fontSize: geo.font.hand, fill: readyCount === 0 ? 'var(--red)' : 'var(--ink-3)' }}>
          {line}
        </text>
      ))}
      {/* routes: green to a Ready Pod's port, grey dashed with ✗ to the others */}
      {rows.map((r, i) => {
        const g = geo.row(i)
        const live = !r.gone && r.ready && !r.terminating
        return (
          <g key={`route-${r.name}`}>
            <Rough shape={{ k: 'lin', pts: g.route }} seed={9110 + i} stroke={live ? 'var(--green)' : 'var(--ink-4)'} strokeWidth={live ? 2 : 1.3} dash={live ? undefined : '4 5'} roughness={0.7} />
            {live ? (
              <circle cx={g.port[0]} cy={g.port[1]} r={4.5} fill="var(--green)" />
            ) : (
              !r.gone && (
                <g transform={`translate(${g.port[0] - 12} ${g.port[1] - 12})`}>
                  <Cross x={0} y={0} size={4.5} seed={9120} strokeWidth={1.8} />
                </g>
              )
            )}
          </g>
        )
      })}
      {rows.map((r, i) => (
        <PodRow key={r.id ?? r.name} r={r} g={geo.row(i)} geo={geo} selected={target === r.name} onPick={onPick} seed={9130 + i * 3} />
      ))}
      {/* requests in flight: one pooled layer (✗ = no answer at all, „503” = a fast, clear answer) */}
      <g aria-hidden="true">
        {dropped.map(({ r, progress }) => {
          const dist = progress * refLen
          const [x, y0] = pointAt(geo.drop, Math.min(1, dist / dropLen))
          const fall = dist > dropLen ? Math.min(16, (dist - dropLen) * 0.3) : 0
          return (
            <g key={r.id} transform={`translate(${x} ${y0 + fall}) rotate(${fall * 2})`}>
              <use href={`#${TRAY}-tray`} x={-12} y={-8} width={24} height={17} />
              {fall > 0 && <Cross x={12} y={-8} size={4.5} seed={9141} strokeWidth={2} />}
            </g>
          )
        })}
        {flights.map(({ r, progress }) => {
          const g = geo.row(byName.get(r.podName!)!)
          const [x, y] = pointAt(g.route, progress)
          const fast = r.outcome === 'http503' || r.outcome === 'http500'
          return (
            <g key={r.id} transform={`translate(${x} ${y})`}>
              <use href={`#${TRAY}-tray`} x={-12} y={-8} width={24} height={17} />
              {fast && progress > 0.7 && (
                <text x={0} y={-12} textAnchor="middle" className="k-svg-mono" style={{ fontSize: geo.font.monoSmall, fontWeight: 700, fill: 'var(--tray-ink)' }}>
                  {r.outcome === 'http500' ? '500' : '503'}
                </text>
              )}
              {!fast && r.outcome !== 'ok' && progress > 0.75 && <Cross x={10} y={-8} size={4} seed={9140} strokeWidth={1.8} />}
            </g>
          )
        })}
      </g>
    </svg>
  )
}
