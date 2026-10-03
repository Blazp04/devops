/**
 * Turns the E2 engine state into what the „kuhinjska šina” drawing shows (pure, no React).
 * Everything comes from the engine's selectors – the lecture never re-implements the queue model.
 */
import { consumerViews, delayedView, flightsView, inflightView, readyView, theory, type ConsumerView, type QueueState } from '../../engines/queue'
import { fmt } from '../../kit'
import type { ServerMood } from '../../kit'
import { placePoint, type Pt, type StageGeo } from './geometry'

export type TicketTone = 'info' | 'warn' | 'bad' | 'ok'

export interface CardView {
  key: number
  title: string
  status: string
  statusTone: 'ink' | 'red' | 'pen' | 'green' | 'muted'
  mood: ServerMood
  down: boolean
  dashed: boolean
  progress: number | null
  deadline: number | null
  armed: boolean
  slow: boolean
}

export interface BoardLine {
  key: number
  orderId: number
  kind: 'cooked' | 'duplicate' | 'deduped'
}

export interface RailTicket {
  key: number
  orderId: number
  tone: TicketTone
  mark?: string
}

export interface LaneTicket extends RailTicket {
  /** 0..1 elapsed of the wait */
  progress: number
  remainingS: number
}

export interface FlightDot {
  key: number
  x: number
  y: number
  tone: TicketTone
  /** a direct-mode HTTP request is a tray, a message is a ticket */
  tray: boolean
}

const secs = (v: number) => `${fmt.num(v, v < 10 ? 1 : 0)} s`

/** The flagship remembers when the broker last refused a publish (reject-publish), so the API card can show the 503. */
export type RejectTrack = { rejectSeen?: number; lastRejectAt?: number }

/** Call after each engine step: notes the time of the newest refused publish. */
export function trackRejects(s: QueueState & RejectTrack): void {
  const n = s.totals.rejectedPublish
  if (n > (s.rejectSeen ?? 0)) s.lastRejectAt = s.t
  s.rejectSeen = n
}

function cardView(c: ConsumerView, direct: boolean, deadline: number | null): CardView {
  const title = `${direct ? 'radnik' : 'potrošač'} ${c.id}`
  const slow = c.fault === 'slow'
  const base = { key: c.id, title, down: false, dashed: false, progress: null as number | null, deadline, armed: c.crashArmed, slow }
  switch (c.status) {
    case 'crashed':
    case 'crashloop':
      return { ...base, status: `pao · ↻ ${secs(c.waitS)}`, statusTone: 'red', mood: 'dead', down: true, deadline: null }
    case 'starting':
      return { ...base, status: 'pokreće se', statusTone: 'muted', mood: 'calm', dashed: true, deadline: null }
    case 'stopping':
      return { ...base, status: 'gasi se', statusTone: 'muted', mood: 'calm', dashed: true }
    case 'cancelled':
      return { ...base, status: c.orderId ? `otkazan · #${c.orderId}` : 'otkazan', statusTone: 'red', mood: 'panic', progress: c.progress }
    case 'idle':
      return { ...base, status: 'čeka posao', statusTone: 'muted', mood: 'calm', deadline: null }
    default: {
      const arriving = c.ticketArriving
      const sms = c.phase === 'sms'
      const order = c.orderId ?? 0
      const status = c.stale ? `#${order} rok istekao` : c.poison ? `#${order} otrovna` : sms ? `SMS #${order}` : `kuha #${order}`
      return {
        ...base,
        status,
        statusTone: c.stale || c.poison ? 'red' : sms ? 'pen' : 'ink',
        mood: slow ? 'panic' : 'busy',
        progress: arriving ? 0 : sms ? null : c.progress,
      }
    }
  }
}

export interface StageView {
  direct: boolean
  sqs: boolean
  lambda: number
  cards: CardView[]
  rail: RailTicket[]
  railMore: number
  ready: number
  retry: LaneTicket[]
  invisible: LaneTicket[]
  unacked: number
  flights: FlightDot[]
  apiStatus: string
  apiTone: 'ink' | 'red' | 'green' | 'pen'
  apiMood: ServerMood
  /** orders refused at the door (503 / a full queue): the client never got a 202 */
  lostDoor: number
  /** accepted with 202, then lost behind the door (auto-ack + crash, dropped without a DLQ) */
  lostInside: number
}

export function buildStageView(s: QueueState, g: StageGeo): StageView {
  const direct = s.config.mode === 'direct'
  const sqs = s.config.broker === 'sqs'
  const cons = consumerViews(s)
  const index = new Map<number, number>()
  cons.forEach((c, i) => index.set(c.id, i))
  const inflight = inflightView(s)
  const deadlineOf = new Map<number, number>()
  for (const d of inflight) if (!d.orphan) deadlineOf.set(d.consumerId, d.timeoutS > 0 ? d.remainingS / d.timeoutS : 0)
  const showDeadline = !direct && (sqs || s.config.consumerTimeoutS < 60)
  const cards = cons.map((c) => cardView(c, direct, showDeadline && c.status !== 'idle' ? (deadlineOf.get(c.id) ?? null) : null))
  const ready = readyView(s, g.rail.slots)
  const rail: RailTicket[] = ready.map((m) => ({
    key: m.id,
    orderId: m.orderId,
    tone: m.poison ? 'bad' : m.redelivered ? 'warn' : 'info',
    mark: m.redelivered ? `↻${Math.max(1, m.receiveCount)}` : undefined,
  }))
  const retry: LaneTicket[] = delayedView(s).map((m) => ({ key: m.id, orderId: m.orderId, tone: m.poison ? 'bad' : 'warn', mark: `↻${m.receiveCount}`, progress: m.progress, remainingS: m.remainingS }))
  const invisible: LaneTicket[] = inflight
    .filter((d) => d.orphan)
    .map((d) => ({ key: d.deliveryId, orderId: d.orderId, tone: 'warn' as const, progress: d.timeoutS > 0 ? 1 - d.remainingS / d.timeoutS : 1, remainingS: d.remainingS }))
  const flights: FlightDot[] = []
  for (const f of flightsView(s)) {
    const a = placePoint(g, f.from, 'from', index, direct)
    const b = placePoint(g, f.to, 'to', index, direct)
    if (!a || !b) continue
    const p: Pt = [a[0] + (b[0] - a[0]) * f.progress, a[1] + (b[1] - a[1]) * f.progress]
    const tone: TicketTone = f.tone === 'bad' ? 'bad' : f.tone === 'ok' ? 'ok' : f.tone === 'warn' ? 'warn' : 'info'
    flights.push({ key: f.id, x: p[0], y: p[1], tone, tray: direct && f.msgId === 0 && f.to !== 'sms' })
    if (flights.length >= 200) break
  }
  const th = theory(s)
  const busy = cons.filter((c) => c.status === 'busy').length
  const running = cons.filter((c) => c.status !== 'crashed' && c.status !== 'crashloop').length
  const t = s.totals
  const lostDoor = t.ordersFailed
  const lostInside = t.dropped + t.lostAutoAck
  const lastReject = (s as QueueState & RejectTrack).lastRejectAt
  const rejecting = !direct && lastReject !== undefined && s.t - lastReject < 2
  let apiStatus: string
  let apiTone: StageView['apiTone']
  let apiMood: ServerMood
  if (direct) {
    const full = running > 0 && busy >= running
    apiStatus = full ? '503 · svi zauzeti' : `radi ${busy} od ${cons.length}`
    apiTone = full ? 'red' : 'ink'
    apiMood = full ? 'panic' : busy > 0 ? 'busy' : 'calm'
  } else if (rejecting) {
    apiStatus = '503 · red pun'
    apiTone = 'red'
    apiMood = 'panic'
  } else {
    apiStatus = '202 · odmah'
    apiTone = 'green'
    apiMood = 'calm'
  }
  return {
    direct,
    sqs,
    lambda: th.lambda,
    cards,
    rail,
    railMore: Math.max(0, s.ready.size - rail.length),
    ready: s.ready.size,
    retry,
    invisible,
    unacked: s.unacked.size,
    flights,
    apiStatus,
    apiTone,
    apiMood,
    lostDoor,
    lostInside,
  }
}
