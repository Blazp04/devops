/**
 * The flagship stage: Davor and the day clock on top, three servers with 14 slots each, the containers that wait for
 * room („nema mjesta”) and the seeded day as a pencil timeline. Solid boxes run; dashed ones are desired but not
 * running yet (the course-wide grammar: dashed = desired, solid = actual).
 */
import { useId } from 'react'
import { Cross, Davor, LoopArrows, Rough, SpeechBubble, plural } from '../../../kit'
import { clock, davorView, dayMinute, loopTiming, type World } from '../model'
import { AppBox, ServerBox, type SlotItem } from './parts'
import { NARROW, SLOTS, TIMELINE_MARKS, WIDE, minuteX, slotXY, type StageGeo } from './stageGeo'

/** Stable slot-position functions per layout and server (ServerBox is memoised on them). */
const SLOT_FNS = {
  wide: WIDE.servers.map((_, i) => (k: number) => slotXY(WIDE, i, k)),
  narrow: NARROW.servers.map((_, i) => (k: number) => slotXY(NARROW, i, k)),
}

const TONE_STROKE = { bad: 'var(--red)', ok: 'var(--green)', info: 'var(--ink-2)' } as const

export function OrchestratorStage({ w, g, highlight }: { w: World; g: StageGeo; highlight: string | null }) {
  const s = w.s
  const dv = davorView(s)
  const loop = s.mode === 'loop'
  const lt = loopTiming(s)
  const now = dayMinute(s)
  const unplaced = s.instances.filter((i) => i.serverId === null)
  const fns = g.narrow ? SLOT_FNS.narrow : SLOT_FNS.wide
  const maxWait = g.narrow ? 4 : 2
  const label = `Poslužitelji u ${clock(s)}: ${s.servers
    .map((sv) => `${sv.name} ${sv.up ? `${s.instances.filter((i) => i.serverId === sv.id).length} od ${SLOTS} mjesta zauzeto` : 'ne radi'}`)
    .join(', ')}. ${loop ? 'Upravlja petlja usklađivanja.' : 'Upravljate ručno.'}${unplaced.length ? ` ${plural(unplaced.length, ['kontejner čeka', 'kontejnera čekaju', 'kontejnera čeka'])} mjesto.` : ''}`

  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={label} style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}>
      {/* ── Davor ─────────────────────────────────────────── */}
      <Davor x={g.davor.x} y={g.davor.y} scale={g.davor.scale} mood={dv.mood} buzz={dv.buzz} holding={dv.holding} />
      {dv.asleep && (
        <text x={g.zzz.x} y={g.zzz.y} className="k-svg-hand" style={{ fontSize: 26, fill: 'var(--ink-3)', fontWeight: 600 }}>
          z z z
        </text>
      )}
      {dv.lines && <SpeechBubble x={g.bubble.x} y={g.bubble.y} w={g.bubble.w} h={g.bubble.h} tx={g.bubble.tx} ty={g.bubble.ty} lines={dv.lines} size={21} seed={1010} />}
      {dv.unnoticed && (
        <text x={g.zzz.x + 4} y={g.zzz.y + 46} className="k-svg-hand" style={{ fontSize: 21, fill: 'var(--red)', fontWeight: 700 }}>
          nitko ne zna!
        </text>
      )}

      {/* ── day clock ─────────────────────────────────────── */}
      <text x={g.clock.x} y={g.clock.y - 40} textAnchor={g.clock.anchor} className="k-svg-hand" style={{ fontSize: g.fs.hand, fill: 'var(--ink-2)' }}>
        sat dana
      </text>
      <text x={g.clock.x} y={g.clock.y} textAnchor={g.clock.anchor} className="k-svg-mono" style={{ fontSize: g.narrow ? 34 : 40, fontWeight: 700 }}>
        {clock(s)}
      </text>
      <text x={g.clock.x} y={g.clock.y + 28} textAnchor={g.clock.anchor} className="k-svg-hand" style={{ fontSize: g.fs.hand, fill: loop ? 'var(--pen)' : 'var(--ink-2)', fontWeight: 600 }}>
        {loop ? (g.narrow ? `petlja · prolaz ${s.loopPasses}` : `upravlja petlja · prolaz ${s.loopPasses}`) : g.narrow ? 'ručno' : 'ručno: vi ste orkestrator'}
      </text>

      {/* ── the loop (off in manual mode) ─────────────────── */}
      <g opacity={loop ? 1 : 0.55}>
        <LoopArrows cx={g.loop.cx} cy={g.loop.cy} r={g.loop.r} stroke={loop ? 'var(--pen)' : 'var(--ink-3)'} seed={6420} check={lt.justPassed} />
      </g>
      {!loop && <Cross x={g.loop.cx} y={g.loop.cy} size={g.loop.r * 0.5} seed={6430} />}
      <text x={g.loop.tx} y={g.loop.cy - 3} className="k-svg-hand" style={{ fontSize: g.fs.hand, fill: loop ? 'var(--pen)' : 'var(--ink-2)', fontWeight: 600 }}>
        {loop ? 'petlja usklađivanja' : 'petlja: ne radi'}
      </text>
      <text x={g.loop.tx} y={g.loop.cy + 19} className={loop ? 'k-svg-mono' : 'k-svg-hand'} style={{ fontSize: loop ? g.fs.mono : g.fs.hand, fill: 'var(--ink-2)' }}>
        {loop ? `sljedeći za ${Math.ceil(lt.next)} s` : 'sve radite vi'}
      </text>

      {/* ── containers waiting for room ───────────────────── */}
      {unplaced.length > 0 && (
        <g>
          <text x={g.wait.x} y={g.wait.y + 21} className="k-svg-hand" style={{ fontSize: g.fs.hand, fill: 'var(--red)', fontWeight: 700 }}>
            nema mjesta:
          </text>
          {unplaced.slice(0, maxWait).map((i, k) => (
            <AppBox key={i.id} x={g.wait.x + 116 + k * 52} y={g.wait.y + 2} w={46} h={28} app={i.app} version={i.version} ghost seedKey={i.id} size={g.fs.mono} />
          ))}
          {unplaced.length > maxWait && (
            <text x={g.wait.x + 116 + maxWait * 52} y={g.wait.y + 22} className="k-svg-mono" style={{ fontSize: g.fs.mono, fontWeight: 700, fill: 'var(--red)' }}>
              +{unplaced.length - maxWait}
            </text>
          )}
        </g>
      )}

      {/* ── servers ───────────────────────────────────────── */}
      {s.servers.map((sv, i) => {
        const b = g.servers[i]
        const items: SlotItem[] = s.instances
          .filter((x) => x.serverId === sv.id && w.slotOf[x.id])
          .map((x) => ({ id: x.id, app: x.app, version: x.version, ghost: x.state === 'ghost', slot: w.slotOf[x.id].slot }))
        const sig = `${sv.up}|${items.map((it) => `${it.id}:${it.slot}:${it.ghost ? 'g' : 'r'}`).join(',')}`
        return <ServerBox key={sv.id} x={b.x} y={b.y} w={b.w} h={b.h} id={sv.id} name={sv.name} up={sv.up} items={items} slotXY={fns[i]} cell={g.cell} slots={SLOTS} highlight={highlight === sv.id} fs={g.fs.mono} sig={sig} />
      })}

      {/* ── the seeded day ────────────────────────────────── */}
      <Timeline g={g} now={now} handedAt={w.handedAt} />
    </svg>
  )
}

function Timeline({ g, now, handedAt }: { g: StageGeo; now: number; handedAt: string | null }) {
  const { x1, x2, y } = g.timeline
  const nx = minuteX(g, now)
  const handX = handedAt ? minuteX(g, Number(handedAt.slice(0, 2)) * 60 + Number(handedAt.slice(3, 5))) : null
  // the elapsed day: one fixed pen stroke revealed by a clip (a re-drawn rough line would wobble every frame)
  const clipId = `l10tl${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  return (
    <g aria-hidden="true">
      <Rough shape={{ k: 'line', x1, y1: y, x2, y2: y }} seed={6450} stroke="var(--ink-3)" strokeWidth={1.4} />
      <clipPath id={clipId}>
        <rect x={x1 - 4} y={y - 8} width={Math.max(0, nx - x1 + 4)} height={16} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <Rough shape={{ k: 'line', x1, y1: y, x2, y2: y }} seed={6452} stroke="var(--pen)" strokeWidth={2} />
        <Rough shape={{ k: 'line', x1, y1: y + 1.5, x2, y2: y + 1.5 }} seed={6453} stroke="var(--pen)" strokeWidth={1.6} />
      </g>
      {handX !== null && (
        <g transform={`translate(${handX} ${y})`}>
          <Rough shape={{ k: 'line', x1: 0, y1: -9, x2: 0, y2: 9 }} seed={6451} stroke="var(--pen)" strokeWidth={2.2} />
        </g>
      )}
      {TIMELINE_MARKS.map((m, k) => {
        const x = minuteX(g, m.minute)
        const above = k % 2 === 0
        const passed = now >= m.minute
        return (
          <g key={m.minute}>
            <Rough shape={{ k: 'line', x1: x, y1: y - 7, x2: x, y2: y + 7 }} seed={6460 + k} stroke={TONE_STROKE[m.tone]} strokeWidth={1.8} />
            <text x={x} y={above ? y - 13 : y + 27} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.fs.hand, fontWeight: passed ? 700 : 500, fill: TONE_STROKE[m.tone] }}>
              {g.narrow ? (m.short ?? m.label) : m.label}
            </text>
          </g>
        )
      })}
      {/* „now”: a pen dot on the line, between the labels above (y − 13) and below (y + 27) */}
      <g transform={`translate(${nx} ${y})`}>
        <Rough shape={{ k: 'ellipse', cx: 0, cy: 0, w: 13, h: 13 }} seed={6470} stroke="var(--pen)" strokeWidth={1.8} fillColor="var(--pen)" fillStyle="solid" />
      </g>
    </g>
  )
}
