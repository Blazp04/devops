import { useReducedMotion } from 'motion/react'
import { Arrow, Cross, Rough, StudentQueue, TrayDefs, fmt, plural, useWidth } from '../../../kit'
import type { QueueState } from '../../../engines/queue'
import { ALL_LANES, WIDE_MIN_PX, railSlot, stageGeometry, type StageLanes } from '../geometry'
import { buildStageView } from '../stageView'
import { ApiCard, CookCard, DlqBin, FreeCard, KitchenBoard, Lane, SmsBox, Ticket, TicketDefs } from './parts'

const PORUKA: [string, string, string] = ['poruka', 'poruke', 'poruka']

/**
 * „Kuhinjska šina” – the stage shared by the flagship and the labs. Students → klopa-api → the ticket rail (the queue)
 * → consumers (cards with faces) → teta Mira's pass and the SMS gateway; retry lane, SQS „nevidljivo” lane and the DLQ.
 * Pure drawing of the engine state: every position comes from the E2 selectors (see stageView.ts).
 */
export function RailStage({ s, id, lanes, label, freeSlots = false, forceNarrow = false }: { s: QueueState; id: string; lanes?: Partial<StageLanes>; label: string; freeSlots?: boolean; forceNarrow?: boolean }) {
  const reduce = !!useReducedMotion()
  const [ref, width] = useWidth<HTMLDivElement>()
  const wide = !forceNarrow && width !== null && width >= WIDE_MIN_PX
  const direct = s.config.mode === 'direct'
  // without a queue there is no broker: no retry lanes and no DLQ
  const ln: StageLanes = direct ? { ...ALL_LANES, ...lanes, retry: false, invisible: false, dlq: false } : { ...ALL_LANES, ...lanes }
  const k = s.consumers.length
  const g = stageGeometry(wide ? 'wide' : 'narrow', k, ln)
  const v = buildStageView(s, g)
  const t = s.totals
  const hand = wide ? 19 : 18.5
  const kitchen = s.kitchen
    .slice(-3)
    .reverse()
    .map((e) => ({ key: e.id, orderId: e.orderId, kind: e.kind }))
  const recentDup = s.kitchen.some((e) => e.kind === 'duplicate' && s.t - e.t < 4)
  const lastSms = s.smsLog.length > 0 ? s.smsLog[s.smsLog.length - 1] : null
  const smsText = lastSms ? `#${lastSms.orderId} ${lastSms.kind === 'sent' || lastSms.kind === 'resent' ? '✓' : lastSms.kind === 'duplicate' ? '✗ 2×' : lastSms.kind === 'deduped' || lastSms.kind === 'skipped' ? 'preskočen' : lastSms.kind === 'deferred' ? 'čeka' : '✗'}` : null
  const dlqLast = s.dlqRecent.slice(-4).reverse().map((e) => e.orderId)
  const students = Math.max(1, Math.min(g.students.max, 1 + Math.round(v.lambda / 3)))
  const slotsTotal = wide ? Math.max(6, Math.ceil(Math.max(k, 1) / 2) * 2) : Math.max(4, Math.ceil(Math.max(k, 1) / 2) * 2)
  const free = freeSlots ? stageGeometry(wide ? 'wide' : 'narrow', slotsTotal, ln).cards.slice(k) : []
  const r = g.rail
  const headX = r.x + r.w
  const gridLeft = g.cards[0]?.x ?? (wide ? 478 : 6)
  const move = reduce ? undefined : 'transform 160ms linear'
  // narrow: head of the rail → straight down to the consumers (the lanes sit below the cards and Mira's pass)
  const narrowArrow: [number, number][] = [[r.x + r.w - 22, r.y + r.h + 2], [r.x + r.w - 22, (g.cards[0]?.y ?? r.y + r.h + 40) - 4]]
  const ticketScale = wide ? 0.92 : 1
  return (
    <div ref={ref} style={{ width: '100%' }}>
      <div style={{ width: '100%', maxWidth: wide ? undefined : 460, margin: '0 auto' }}>
      <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={label} style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}>
        <TicketDefs id={id} />
        <TrayDefs id={id} />
        {/* pencil roads: API → tail of the rail, head of the rail → the consumers */}
        {wide ? (
          <>
            <Rough shape={{ k: 'lin', pts: [[g.api.x + g.api.w, g.api.y + g.api.h / 2], [r.x + 2, r.y + 50]] }} seed={7301} stroke="var(--ink-3)" strokeWidth={1.2} dash="3 6" roughness={0.6} />
            <Arrow pts={[[headX + 2, r.y + 50], [gridLeft - 8, r.y + 50]]} stroke="var(--ink-3)" strokeWidth={1.4} seed={7302} />
          </>
        ) : (
          <>
            <Rough shape={{ k: 'lin', pts: [[g.api.x + 24, g.api.y + g.api.h], [g.api.x + 24, r.y + 6]] }} seed={7303} stroke="var(--ink-3)" strokeWidth={1.2} dash="3 6" roughness={0.6} />
            <Arrow pts={narrowArrow} stroke="var(--ink-3)" strokeWidth={1.4} seed={7304} />
          </>
        )}
        {/* students (traffic) and the API */}
        <StudentQueue x={g.students.x} y={g.students.y} count={students} scale={g.students.scale} tap={v.lambda > 6} />
        <text x={wide ? 128 : 12} y={wide ? 30 : 22} className="k-svg-mono" style={{ fontSize: 13, fill: 'var(--tray-ink)', fontWeight: 600 }}>
          λ {fmt.num(v.lambda, 1)}/s
        </text>
        <ApiCard box={g.api} status={v.apiStatus} statusTone={v.apiTone} mood={v.apiMood} seed={7310} />
        {v.lostDoor > 0 && (
          <g>
            <Cross x={g.lost[0] - (wide ? 40 : 0)} y={g.lost[1] - 4} size={7} seed={7320} />
            {wide ? (
              <text x={g.lost[0] - 28} y={g.lost[1]} className="k-svg-mono" style={{ fontSize: 13, fontWeight: 700, fill: 'var(--red)' }}>
                izgubljeno {v.lostDoor}
              </text>
            ) : (
              <text x={g.lost[0]} y={g.lost[1] + 22} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 13, fontWeight: 700, fill: 'var(--red)' }}>
                {v.lostDoor}
              </text>
            )}
          </g>
        )}
        {/* the rail = the queue */}
        <g>
          <text x={r.x + 4} y={r.y + 4} className="k-svg-hand" style={{ fontSize: hand, fill: v.direct ? 'var(--red)' : 'var(--ink-2)' }}>
            {v.direct ? 'bez reda: nema čekaonice' : `red · ${plural(v.ready, PORUKA)}`}
          </text>
          {!v.direct && (Number.isFinite(s.config.maxQueue) || v.railMore > 0) && (
            <text x={r.x + r.w} y={r.y + 4} textAnchor="end" className="k-svg-mono" style={{ fontSize: 13, fontWeight: 600, fill: Number.isFinite(s.config.maxQueue) && v.ready >= s.config.maxQueue ? 'var(--red)' : 'var(--tray-ink)' }}>
              {v.railMore > 0 ? `još +${v.railMore}` : ''}
              {v.railMore > 0 && Number.isFinite(s.config.maxQueue) ? ' · ' : ''}
              {Number.isFinite(s.config.maxQueue) ? `najviše ${s.config.maxQueue}` : ''}
            </text>
          )}
          <Rough shape={{ k: 'line', x1: r.x, y1: r.y + 20, x2: r.x + r.w, y2: r.y + 20 }} seed={7330} stroke={v.direct ? 'var(--ink-4)' : 'var(--ink)'} strokeWidth={2.2} dash={v.direct ? '4 6' : undefined} />
          <Rough shape={{ k: 'line', x1: r.x, y1: r.y + 25, x2: r.x + r.w, y2: r.y + 25 }} seed={7331} stroke={v.direct ? 'var(--ink-4)' : 'var(--ink-2)'} strokeWidth={1.2} dash={v.direct ? '4 6' : undefined} />
          {v.direct && <Cross x={r.x + r.w / 2} y={r.y + 50} size={12} seed={7332} />}
          {v.rail.map((m, i) => {
            const [x, y] = railSlot(g, i)
            return (
              <g key={m.key} style={{ transform: `translate(${x}px, ${y}px)`, transition: move }}>
                <Ticket id={id} x={0} y={0} tone={m.tone} label={String(m.orderId)} mark={m.mark} scale={ticketScale} />
              </g>
            )
          })}
        </g>
        {/* messages and requests in flight: one pooled layer under the cards and lanes (their lettering stays on top);
            positions from the engine's hops (linear). Reduced motion: nothing flies, messages just appear where they land. */}
        {!reduce && (
          <g aria-hidden="true">
            {v.flights.map((f) =>
              f.tray ? (
                <use key={f.key} href={`#${id}-tray`} x={f.x - 15} y={f.y - 10} width={30} height={20} />
              ) : (
                <use key={f.key} href={`#${id}-${f.tone === 'info' ? 'ticket' : `ticket-${f.tone}`}`} x={f.x - 9} y={f.y - 10} width={18} height={20} />
              ),
            )}
          </g>
        )}
        {g.retry && (
          <Lane box={g.retry} label={wide ? 'čeka ponovni pokušaj' : 'ponovni pokušaj'} seed={7340} tone="pen" hand={hand}>
            {v.retry.slice(0, Math.floor((g.retry.w - 10) / 36)).map((m, i) => {
              const x = g.retry!.x + 22 + i * 36
              const y = g.retry!.y + 40
              return (
                <g key={m.key}>
                  <Ticket id={id} x={x} y={y} tone={m.tone} scale={0.62} />
                  <line x1={x - 14} x2={x - 14 + 28 * (1 - m.progress)} y1={y + 16} y2={y + 16} style={{ stroke: 'var(--pen)', strokeWidth: 2.4, strokeLinecap: 'round' }} />
                </g>
              )
            })}
            {v.retry.length > 0 && (
              <text x={g.retry.x + g.retry.w - 8} y={g.retry.y + 19} textAnchor="end" className="k-svg-mono" style={{ fontSize: 13, fill: 'var(--pen)' }}>
                {v.retry.length}
              </text>
            )}
          </Lane>
        )}
        {g.invisible && (
          <Lane box={g.invisible} label={v.sqs ? (wide ? 'nevidljivo do isteka roka' : 'nevidljivo (SQS)') : wide ? 'RabbitMQ: vraća odmah' : 'RabbitMQ: odmah'} seed={7350} tone={v.sqs ? 'pen' : 'ink'} hand={hand}>
            {v.invisible.slice(0, Math.floor((g.invisible.w - 60) / 36)).map((m, i) => {
              const x = g.invisible!.x + 22 + i * 36
              const y = g.invisible!.y + 40
              return (
                <g key={m.key}>
                  <Ticket id={id} x={x} y={y} tone="warn" scale={0.62} />
                  <line x1={x - 14} x2={x - 14 + 28 * (1 - m.progress)} y1={y + 16} y2={y + 16} style={{ stroke: 'var(--pen)', strokeWidth: 2.4, strokeLinecap: 'round' }} />
                </g>
              )
            })}
            {v.invisible.length > 0 && (
              <text x={g.invisible.x + g.invisible.w - 8} y={g.invisible.y + 46} textAnchor="end" className="k-svg-mono" style={{ fontSize: 13, fill: 'var(--pen)', fontWeight: 600 }}>
                {fmt.num(v.invisible[0].remainingS, v.invisible[0].remainingS < 10 ? 1 : 0)} s
              </text>
            )}
          </Lane>
        )}
        {/* consumers */}
        <text x={gridLeft} y={(g.cards[0]?.y ?? 40) - 12} className="k-svg-hand" style={{ fontSize: hand, fill: 'var(--ink-2)' }}>
          {v.direct ? 'radnici API-ja (sinkrono)' : wide ? `potrošači = kuhari · ${k}` : `potrošači · ${k}`}
        </text>
        {v.lostInside > 0 && (
          <g>
            <title>{`Nakon odgovora 202 izgubljeno: ${v.lostInside}`}</title>
            <Cross x={wide ? gridLeft + 6 : 190} y={wide ? (g.cards[0]?.y ?? 82) - 38 : (g.cards[0]?.y ?? 40) - 16} size={6} seed={7321} />
            <text x={wide ? gridLeft + 16 : 200} y={wide ? (g.cards[0]?.y ?? 82) - 34 : (g.cards[0]?.y ?? 40) - 12} className="k-svg-mono" style={{ fontSize: 13, fontWeight: 700, fill: 'var(--red)' }}>
              {wide ? `izgubljeno nakon 202: ${v.lostInside}` : `nakon 202: ${v.lostInside}`}
            </text>
          </g>
        )}
        {free.map((b, i) => (
          <FreeCard key={`f${i}`} box={b} seed={7400 + i} />
        ))}
        {v.cards.map((c, i) => (
          <CookCard key={c.key} box={g.cards[i]} info={c} seed={7500 + c.key * 13} />
        ))}
        {k === 0 && (
          <text x={gridLeft + 4} y={(g.cards[0]?.y ?? (wide ? 34 : r.y + r.h + 40)) + 30} className="k-svg-mono" style={{ fontSize: 13, fill: 'var(--red)' }}>
            nijedan potrošač
          </text>
        )}
        <KitchenBoard box={g.board} lines={kitchen} cooked={t.effectsUnique} duplicates={t.duplicates} worried={recentDup} seed={7600} />
        {g.sms && <SmsBox box={g.sms} down={s.sms.state === 'down'} slow={s.sms.state === 'slow'} last={smsText} duplicates={t.smsDuplicates} pending={s.smsOutbox.length} seed={7700} />}
        {g.dlq && <DlqBin box={g.dlq} id={id} count={t.dlq} last={dlqLast} seed={7800} />}
      </svg>
      </div>
    </div>
  )
}
