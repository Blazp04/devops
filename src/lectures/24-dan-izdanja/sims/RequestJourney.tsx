import type { ReactNode } from 'react'
import { Cloud, Cross, Cylinder, DLabel, Diagram, Edge, Globe, MenzaGate, Packet, Phone, PodShape, QueueSlots, Rough, ServiceTag, Stepper, useWidth } from '../../../kit'
import { HOPS, type HopId } from '../hops'
import { TraceWaterfall } from './IncidentPanels'
import type { Span, TraceView } from '../incident/trace'

type Pt = [number, number]

interface PathLayout {
  w: number
  h: number
  mono: number
  hand: number
  at: Record<HopId, Pt>
  label: (id: HopId) => { x: number; y: number; anchor: 'start' | 'middle' }
  /** where the „adrese Podova” note sits (next to the dashed Service lines) */
  addr: { x: number; y: number; anchor: 'start' | 'middle' | 'end' }
  /** the dashed „asinkrono” divider between the queue and the consumer */
  async: { line: [Pt, Pt]; x: number; y: number; anchor: 'start' | 'middle' }
}

const WIDE: PathLayout = {
  w: 760,
  h: 340,
  mono: 15,
  hand: 14,
  at: { dns: [60, 118], lb: [200, 118], gateway: [340, 118], service: [450, 40], pod: [560, 118], db: [700, 118], queue: [560, 262], worker: [380, 262], sms: [200, 262] },
  label: (id) => (id === 'service' ? { x: 494, y: 46, anchor: 'start' } : { x: WIDE.at[id][0], y: WIDE.at[id][1] + 56, anchor: 'middle' }),
  addr: { x: 404, y: 22, anchor: 'end' },
  async: { line: [[470, 226], [470, 304]], x: 470, y: 214, anchor: 'middle' },
}

const NARROW: PathLayout = {
  w: 340,
  h: 610,
  mono: 15,
  hand: 14,
  at: { dns: [50, 40], lb: [50, 112], gateway: [50, 190], service: [250, 240], pod: [50, 300], db: [250, 352], queue: [50, 420], worker: [50, 496], sms: [50, 566] },
  label: (id) => (id === 'service' || id === 'db' ? { x: NARROW.at[id][0], y: NARROW.at[id][1] + (id === 'db' ? 46 : 36), anchor: 'middle' } : { x: 100, y: NARROW.at[id][1] + 6, anchor: 'start' }),
  addr: { x: 250, y: 304, anchor: 'middle' },
  async: { line: [[16, 458], [200, 458]], x: 208, y: 463, anchor: 'start' },
}

/** Where the request travels (the tray flies along these) – the Service is not on it. */
const DATA: [HopId, HopId][] = [
  ['dns', 'lb'],
  ['lb', 'gateway'],
  ['gateway', 'pod'],
  ['pod', 'db'],
  ['pod', 'queue'],
  ['queue', 'worker'],
  ['worker', 'sms'],
]

/** The Gateway only reads Pod addresses from the Service's EndpointSlice (dashed pen, no tray). */
const ADDR: [HopId, HopId][] = [
  ['service', 'gateway'],
  ['service', 'pod'],
]

const INDEX = Object.fromEntries(HOPS.map((h, i) => [h.id, i])) as Record<HopId, number>

/** One hop's drawing; a broken hop changes too (crashed Pod, OOMKilled consumer, red database…). */
export function HopIcon({ id, x, y, dim, broken = false }: { id: HopId; x: number; y: number; dim: boolean; broken?: boolean }) {
  const g = (child: ReactNode) => <g opacity={dim ? 0.35 : 1}>{child}</g>
  switch (id) {
    case 'dns':
      return g(<Globe cx={x} cy={y} r={20} stroke={broken ? 'var(--red)' : undefined} />)
    case 'lb':
      return g(<Cloud x={x - 32} y={y - 20} w={64} h={40} />)
    case 'gateway':
      return g(<MenzaGate x={x - 24} y={y - 26} w={48} h={52} label="" />)
    case 'service':
      return g(<ServiceTag x={x - 34} y={y - 14} w={68} h={28} />)
    case 'pod':
      return g(<PodShape x={x} y={y} size={34} status={broken ? 'crash' : 'running'} tone="green" restarts={broken ? 4 : undefined} />)
    case 'db':
      return g(<Cylinder x={x - 20} y={y - 24} w={40} h={46} fillColor={broken ? 'var(--red)' : undefined} />)
    case 'queue':
      return g(<QueueSlots x={x - 34} y={y - 12} w={68} h={24} slots={4} filled={broken ? 4 : 1} />)
    case 'worker':
      return g(<PodShape x={x} y={y} size={30} status={broken ? 'oom' : 'running'} tone="teal" />)
    case 'sms':
      return g(<Phone x={x - 14} y={y - 24} w={28} h={46} text="" />)
  }
}

/** The order's path through Klopa (shared by „Put jednog zahtjeva” and „Što ako ovdje pukne?”). */
export function PathDrawing({ active, visited, broken, label }: { active: number | null; visited: number; broken?: Set<HopId>; label: string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const L = (width ?? 760) >= 600 ? WIDE : NARROW
  const activeId = active === null ? null : HOPS[active].id
  const from = activeId ? DATA.find(([, b]) => b === activeId)?.[0] : undefined
  const isBad = (a: HopId, b: HopId) => (broken?.has(a) || broken?.has(b)) ?? false
  return (
    <div ref={ref} style={{ width: '100%', maxWidth: L === NARROW ? 420 : undefined, margin: '0 auto' }}>
      <Diagram width={L.w} height={L.h} label={label}>
        {DATA.map(([a, b]) => {
          const seen = INDEX[b] <= visited
          const bad = isBad(a, b)
          // a new key when the line turns solid: the pen draws it on again (a mounted dashed line would stay undrawn)
          return <Edge key={`${a}-${b}-${seen && !bad}`} from={L.at[a]} to={L.at[b]} arrow={false} tone={bad ? 'bad' : seen ? 'neutral' : 'idle'} dashed={!seen || bad} />
        })}
        {ADDR.map(([a, b]) => {
          const seen = INDEX.service <= visited
          return <Edge key={`${a}-${b}`} from={L.at[a]} to={L.at[b]} arrow={false} tone={broken?.has('service') ? 'bad' : activeId === 'service' ? 'blue' : seen ? 'neutral' : 'idle'} dashed />
        })}
        <DLabel x={L.addr.x} y={L.addr.y} text="adrese Podova" anchor={L.addr.anchor} size={L.hand} tone={activeId === 'service' ? 'blue' : 'neutral'} />
        <Rough shape={{ k: 'line', x1: L.async.line[0][0], y1: L.async.line[0][1], x2: L.async.line[1][0], y2: L.async.line[1][1] }} stroke="var(--ink-3)" strokeWidth={1.2} dash="4 5" seed={3391} />
        <DLabel x={L.async.x} y={L.async.y} text="asinkrono" anchor={L.async.anchor} size={L.hand} />
        {HOPS.map((h, i) => {
          const [x, y] = L.at[h.id]
          const lb = L.label(h.id)
          const isBroken = broken?.has(h.id) ?? false
          return (
            <g key={h.id}>
              <HopIcon id={h.id} x={x} y={y} dim={i > visited && !isBroken} broken={isBroken} />
              {active === i && <Rough shape={{ k: 'ellipse', cx: x, cy: y, w: 92, h: 76 }} stroke="var(--red)" strokeWidth={2} seed={3300 + i} />}
              {isBroken && (
                <g transform={`translate(${x + 30} ${y - 26})`}>
                  <Cross x={0} y={0} size={10} />
                </g>
              )}
              <DLabel x={lb.x} y={lb.y} text={h.name} anchor={lb.anchor} mono size={L.mono} tone={isBroken ? 'bad' : 'neutral'} bold={active === i} />
            </g>
          )
        })}
        {from && activeId && <Packet key={activeId} path={[L.at[from], L.at[activeId]]} duration={0.8} />}
      </Diagram>
    </div>
  )
}

function code(t: string) {
  return t.split(/(`[^`]+`)/).map((part, k) => (part.startsWith('`') ? <code key={k}>{part.slice(1, -1)}</code> : <span key={k}>{part}</span>))
}

/** The 201 goes back after the publish to the queue (step 7); the listić and the SMS come later, asynchronously. */
const ANSWER_MS = 58

function traceUpTo(step: number): TraceView {
  const spans: Span[] = HOPS.slice(0, step + 1).flatMap((h) => h.spans)
  const httpEnd = Math.min(ANSWER_MS, Math.max(...spans.filter((s) => s.start < ANSWER_MS).map((s) => s.start + s.dur)))
  const answered = step >= INDEX.queue
  const outcome = step >= INDEX.sms ? '201 Created + listić + SMS' : step >= INDEX.worker ? '201 Created + listić' : answered ? '201 Created' : 'u tijeku…'
  const root: Span = { name: 'POST /api/narudzbe', start: 0, dur: httpEnd, status: 'ok', depth: 0, note: answered ? '201 Created' : undefined }
  const all = [root, ...spans]
  const total = Math.max(...all.map((s) => s.start + s.dur))
  return { traceId: '4bf92f3577b34da6a3ce929d0e0e4736', title: 'jedna narudžba (primjer)', spans: all, totalMs: total, outcome, ok: true }
}

/** „Put jednog zahtjeva”: step through the hops; the trace waterfall grows with every hop. */
export function RequestJourney() {
  return (
    <Stepper
      title="Put jednog zahtjeva: od mobitela do kuhinje"
      wide
      steps={HOPS.map((h) => ({
        title: h.title,
        body: (
          <>
            {code(h.body)} <em>(predavanje {h.lectures.join(', ')})</em>
          </>
        ),
      }))}
      caption="Trajanja su primjer u rasponu modela iz tečaja; trag (engl. trace) raste sa svakim slojem."
    >
      {(step) => (
        <div>
          <PathDrawing active={step} visited={step} label={`Narudžba je stigla do sloja ${HOPS[step].name} (${step + 1} od ${HOPS.length}).`} />
          <TraceWaterfall trace={traceUpTo(step)} />
        </div>
      )}
    </Stepper>
  )
}
