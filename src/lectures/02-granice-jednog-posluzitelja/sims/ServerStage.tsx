import { memo, type ReactNode } from 'react'
import {
  Brain,
  Cross,
  Check,
  Cylinder,
  Davor,
  DiagramDefs,
  Plate,
  Rough,
  ServerFace,
  SpeechBubble,
  StudentQueue,
  SvgStamp,
  diagramIds,
  fmt,
  plural,
  trayFillOf,
  useSvgId,
} from '../../../kit'
import { STAGE, cardGeo, plateGrid, queueSlot, type CardGeo, type StageGeo, type StageLayout } from '../geometry'
import type { PlateState, StageView } from '../view'

const HAND = 'k-svg-hand'
const MONO = 'k-svg-mono'

/** The radnik plates: food = a request inside; dashed blue ring = it waits for the database; red dashed = beyond the RAM. */
function Plates({ plates, cg }: { plates: PlateState[]; cg: CardGeo }) {
  const { r, pts } = plateGrid(cg.plates, plates.length)
  return (
    <g>
      {pts.map(([cx, cy], i) => {
        const st = plates[i]
        return (
          <g key={i}>
            <Plate cx={cx} cy={cy} r={r} full={st !== 'free'} />
            {st === 'io' && <circle cx={cx} cy={cy} r={r + 2.6} style={{ fill: 'none', stroke: 'var(--pen)', strokeWidth: 1.5, strokeDasharray: '2.4 2.2' }} />}
            {st === 'over' && <circle cx={cx} cy={cy} r={r + 2.6} style={{ fill: 'none', stroke: 'var(--red)', strokeWidth: 1.6, strokeDasharray: '3 2' }} />}
          </g>
        )
      })}
    </g>
  )
}

/** The static parts of the server card (outline, labels): memoised so the pen is not re-run every frame. */
const CardFrame = memo(function CardFrame({ geo, dim }: { geo: StageGeo; dim: boolean }) {
  const c = geo.card
  return (
    <g>
      <Rough shape={{ k: 'rect', x: c.x, y: c.y, w: c.w, h: c.h }} seed={2210} strokeWidth={1.9} stroke={dim ? 'var(--ink-3)' : 'var(--ink)'} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'line', x1: c.x + 10, y1: c.y + c.h - 36, x2: c.x + c.w - 10, y2: c.y + c.h - 36 }} seed={2211} strokeWidth={1.1} stroke="var(--ink-3)" dash="3 5" />
    </g>
  )
})

const Roads = memo(function Roads({ geo }: { geo: StageGeo }) {
  return (
    <g>
      <Rough shape={{ k: 'lin', pts: geo.inPath }} seed={2201} strokeWidth={1.4} stroke="var(--ink-3)" roughness={0.8} />
      <Rough shape={{ k: 'lin', pts: geo.outPath }} seed={2202} strokeWidth={1.2} stroke="var(--ink-3)" roughness={0.8} dash="2 6" />
      <Rough shape={{ k: 'line', x1: geo.dbLink[0][0], y1: geo.dbLink[0][1], x2: geo.dbLink[1][0], y2: geo.dbLink[1][1] }} seed={2203} strokeWidth={1.6} stroke="var(--pen)" dash="4 4" />
      <Cylinder x={geo.db.x} y={geo.db.y} w={geo.db.w} h={geo.db.h} seed={2204} />
      <text x={geo.db.x + geo.db.w / 2} y={geo.db.y + geo.db.h / 2 + 10} textAnchor="middle" className={MONO} style={{ fontSize: 14.5, fontWeight: 600 }}>
        baza
      </text>
      <text x={geo.port.x} y={geo.port.y} textAnchor={geo.port.anchor} className={MONO} style={{ fontSize: 14.5, fill: 'var(--ink-2)' }}>
        :8000
      </text>
    </g>
  )
})

function Davorish({ geo, view, size }: { geo: StageGeo; view: StageView; size: number }) {
  const d = geo.davor
  if (!d) return null
  return (
    <g>
      <Davor x={d.x} y={d.y} scale={d.scale} mood={view.davor ? 'worry' : 'smile'} buzz={!!view.davor?.buzz} />
      {view.davor && (
        <SpeechBubble x={d.bubble.x} y={d.bubble.y} w={d.bubble.w} h={d.bubble.h} tx={d.mouth[0]} ty={d.mouth[1]} lines={view.davor.lines} size={size} tone={view.davor.tone} seed={2290} />
      )}
    </g>
  )
}

interface ServerStageProps {
  view: StageView
  layout: StageLayout
  /** Croatian description of what the drawing shows right now */
  label: string
  /** step annotations drawn on top, in the stage's coordinates */
  overlay?: (geo: StageGeo, cg: CardGeo) => ReactNode
  /** hide the pooled trays (the explainer animates its own) */
  noTrays?: boolean
  /** draw Davor in the top-left corner (wide and medium layouts) */
  showDavor?: boolean
}

/**
 * Klopa's one server, drawn from the notebook's grammar: students in line (traffic) → orange trays (requests) →
 * port 8000 → the server card with a face, one brain per core (hatched = busy) and one plate per radnik
 * (food = a request inside, dashed blue ring = waiting for the database) → the database. Rejected trays fall at the
 * door with a red ✗; answers go back with a green ✓.
 */
export function ServerStage({ view, layout, label, overlay, noTrays, showDavor = true }: ServerStageProps) {
  const geo = STAGE[layout]
  const cg = cardGeo(geo.card, view.cores.length)
  const id = useSvgId('l02')
  const ids = diagramIds(id)
  const c = geo.card
  const narrow = layout === 'narrow'
  const queueRows = Math.max(1, Math.ceil(view.queueMax / 10))
  const queueTop = queueSlot(c, (queueRows - 1) * 10).y
  const brainsY = cg.brains.y
  const okFill = trayFillOf('ok')
  const badFill = trayFillOf('bad')
  // without Davor the wide stage's top-left corner is empty: start the drawing just above the queue label
  const top = !narrow && !showDavor ? Math.max(0, Math.min(64, queueTop - 40)) : 0
  return (
    <svg
      viewBox={`0 ${top} ${geo.vb[0]} ${geo.vb[1] - top}`}
      role="img"
      aria-label={label}
      style={{ display: 'block', width: '100%', height: 'auto', maxWidth: narrow ? 460 : undefined, margin: '0 auto', overflow: 'visible' }}
    >
      <DiagramDefs id={id} />
      <Roads geo={geo} />
      {showDavor && <Davorish geo={geo} view={view} size={layout === 'medium' ? 22 : 21} />}

      {/* traffic: the line of students grows with the offered rate */}
      <StudentQueue x={geo.students.x} y={geo.students.y} count={view.students} scale={geo.students.scale} gap={geo.students.gap} tap={view.tap} />
      <text x={geo.offered.x} y={geo.offered.y} textAnchor={geo.offered.anchor} className={HAND} style={{ fontSize: 23, fill: 'var(--tray-ink)' }}>
        {fmt.num(view.offered, view.offered < 10 && view.offered % 1 ? 1 : 0)} zahtjeva/s
      </text>
      {view.burstNote && (
        <text x={geo.offered.x} y={geo.offered.y + 25} textAnchor={geo.offered.anchor} className={HAND} style={{ fontSize: 21, fill: 'var(--red)' }}>
          {view.burstNote}
        </text>
      )}

      {/* the queue: dashed slots above the card, trays waiting in them */}
      <text x={c.x} y={queueTop - 9} className={HAND} style={{ fontSize: 21, fill: view.queue >= view.queueMax ? 'var(--red)' : 'var(--ink-2)' }}>
        red {view.queue}/{view.queueMax}
        {view.queue >= view.queueMax ? ' – pun!' : ''}
      </text>
      {Array.from({ length: view.queueMax }, (_, i) => {
        const b = queueSlot(c, i)
        return <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={2} style={{ fill: 'none', stroke: 'var(--ink-3)', strokeWidth: 1, strokeDasharray: '2.5 2.5' }} />
      })}
      {Array.from({ length: Math.min(view.queue, view.queueMax) }, (_, i) => {
        const b = queueSlot(c, i)
        return <use key={i} href={ids.tray} x={b.x + 1} y={b.y + 3} width={b.w - 2} height={b.h - 6} fill="var(--tray)" />
      })}

      {/* the server card: when the machine is off only the drawing fades, the lettering stays readable (--ink-3) */}
      <g style={{ opacity: view.dim ? 0.55 : 1 }}>
        <CardFrame geo={geo} dim={view.dim} />
      </g>
      <text x={cg.name[0]} y={cg.name[1]} className="k-svg-display" style={{ fontSize: 21, fill: view.dim ? 'var(--ink-3)' : undefined }}>
        {view.name}
      </text>
      <text x={cg.spec[0]} y={cg.spec[1]} className={MONO} style={{ fontSize: 14.5, fill: view.dim ? 'var(--ink-3)' : 'var(--ink-2)' }}>
        {view.spec}
      </text>
      <text x={cg.coresLabel[0]} y={cg.coresLabel[1]} className={HAND} style={{ fontSize: 21, fill: view.dim ? 'var(--ink-3)' : 'var(--ink-2)' }}>
        jezgre
      </text>
      <text x={cg.workersLabel[0]} y={cg.workersLabel[1]} className={HAND} style={{ fontSize: 21, fill: view.dim ? 'var(--ink-3)' : 'var(--ink-2)' }}>
        radnici (RAM)
      </text>
      <text x={cg.workersCount[0]} y={cg.workersCount[1]} textAnchor="end" className={MONO} style={{ fontSize: 14.5, fill: view.dim ? 'var(--ink-3)' : undefined }}>
        {view.workers}
      </text>
      <g style={{ opacity: view.dim ? 0.55 : 1 }}>
        {view.cores.map((b, i) => (
          <Brain key={i} x={cg.brains.x + i * cg.brains.pitch} y={brainsY} w={cg.brains.w} h={cg.brains.h} busy={b} seed={3001 + i * 3} />
        ))}
        <Plates plates={view.plates} cg={cg} />
      </g>
      {view.plates.length > 80 && (
        <text x={cg.plates.x + cg.plates.w} y={cg.plates.y + cg.plates.h + 4} textAnchor="end" className={MONO} style={{ fontSize: 14.5, fill: 'var(--red)' }}>
          +{view.plates.length - 80}
        </text>
      )}
      <text x={cg.footer[0]} y={cg.footer[1]} className={MONO} style={{ fontSize: 14.5, fill: view.footerBad ? 'var(--red)' : view.dim ? 'var(--ink-3)' : 'var(--ink-2)' }}>
        {view.footer}
      </text>
      <g transform={`translate(${cg.face[0]} ${cg.face[1]})`}>
        <ServerFace mood={view.mood} r={20} />
      </g>
      {view.stamp && <SvgStamp x={c.x + c.w / 2} y={c.y + c.h / 2 + 34} text={view.stamp} size={20} tone={view.stamp === 'ZAGRIJAVA SE' || view.stamp === 'POKREĆE SE' || view.stamp === 'MIJENJA VELIČINU' ? 'ink' : 'red'} />}

      {/* radnici waiting for the database */}
      {view.dbWaiting > 0 && (
        <text x={geo.dbLabel.x} y={geo.dbLabel.y} textAnchor={geo.dbLabel.anchor} className={HAND} style={{ fontSize: 21, fill: 'var(--pen)' }}>
          <tspan x={geo.dbLabel.x}>{plural(view.dbWaiting, ['radnik', 'radnika', 'radnika'])}</tspan>
          <tspan x={geo.dbLabel.x} dy={22}>
            {plural(view.dbWaiting, ['čeka', 'čekaju', 'čeka'], false)} bazu
          </tspan>
        </text>
      )}

      {/* requests that reached a machine that is off: they wait for an answer that never comes */}
      {view.parked > 0 && (
        <g>
          {Array.from({ length: Math.min(8, view.parked) }, (_, i) => {
            const p = geo.parked
            const x = p.x + (i % p.perRow) * p.dx
            const y = p.y + Math.floor(i / p.perRow) * p.dy
            return <use key={i} href={ids.tray} x={x - 13} y={y - 9} width={26} height={18} fill="var(--tray)" />
          })}
          {narrow ? (
            <text x={geo.parked.x - 16} y={geo.parked.y - 128} textAnchor="end" className={HAND} style={{ fontSize: 21, fill: 'var(--red)' }}>
              {plural(view.parked, ['zahtjev čeka', 'zahtjeva čekaju', 'zahtjeva čeka'])} odgovor
            </text>
          ) : (
            <text x={geo.parked.x - 54} y={geo.parked.y - 68} textAnchor="middle" className={HAND} style={{ fontSize: 21, fill: 'var(--red)' }}>
              <tspan x={geo.parked.x - 54}>{plural(view.parked, ['zahtjev', 'zahtjeva', 'zahtjeva'])}</tspan>
              <tspan x={geo.parked.x - 54} dy={22}>
                {plural(view.parked, ['čeka', 'čekaju', 'čeka'], false)} odgovor
              </tspan>
            </text>
          )}
        </g>
      )}

      {/* pooled trays from the engine's flights */}
      {!noTrays &&
        view.trays.map((t) => (
          <g key={t.key} transform={`translate(${t.x} ${t.y}) rotate(${t.rot})`}>
            <use href={ids.tray} x={-15} y={-10} width={30} height={20} fill={t.kind === 'go' ? 'var(--tray)' : t.kind === 'back' ? okFill : badFill} />
            {t.kind === 'back' && (
              <g transform="translate(13 -9)">
                <Check x={0} y={0} size={5} strokeWidth={2} seed={2280} />
              </g>
            )}
            {(t.kind === 'fail' || t.kind === 'late') && (
              <g transform="translate(13 -9)">
                <Cross x={0} y={0} size={5.5} strokeWidth={2.2} seed={2281} />
              </g>
            )}
          </g>
        ))}
      {!noTrays && view.fallLabel && (!narrow || view.fallLabel === '503') && (
        <text x={narrow ? geo.fall[0] : geo.fall[0] - 38} y={narrow ? geo.fall[1] + 34 : geo.fall[1] + 4} textAnchor={narrow ? 'middle' : 'end'} className={HAND} style={{ fontSize: 22, fill: 'var(--red)' }}>
          {view.fallLabel}
        </text>
      )}

      {overlay?.(geo, cg)}
    </svg>
  )
}
