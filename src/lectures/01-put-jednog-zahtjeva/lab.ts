/**
 * State of the flagship lab (useSimulation model): the current trace, the playhead over its segments, the event log
 * and which symptoms the student has produced (for the goals). Pure functions, mutated inside step / mutate.
 */
import type { SimEvent } from '../../kit'
import { advance, type Playhead } from './geometry'
import { SYN_RETRIES_MS, fmtMs, traceRequest, urlOf, type Seg, type Trace, type TraceParams } from './model'

export interface LabSeen {
  okPetra: boolean
  refused: boolean
  timeout: boolean
  nxdomain: boolean
  badGateway: boolean
  sydney: boolean
}

export interface LabState {
  trace: Trace
  head: Playhead
  /** SYN retransmissions already logged for the current trace */
  retries: number
  /** segments of the current trace whose end was already logged (stepping back and forth logs nothing twice) */
  logged: number[]
  events: SimEvent[]
  eventId: number
  time: number
  requests: number
  seen: LabSeen
}

export const emptySeen = (): LabSeen => ({ okPetra: false, refused: false, timeout: false, nxdomain: false, badGateway: false, sydney: false })

/** A fresh lab; pass `seen` to keep the goals already reached (the sim's reset recreates the state). */
export function createLab(params: TraceParams, seen: LabSeen = emptySeen()): LabState {
  const s: LabState = {
    trace: traceRequest(params),
    head: { seg: 0, frac: 0, done: false },
    retries: 0,
    logged: [],
    events: [],
    eventId: 1,
    time: 0,
    requests: 1,
    seen,
  }
  logSend(s)
  return s
}

export function logEvent(s: LabState, text: string, tone: SimEvent['tone']) {
  s.events.push({ id: s.eventId++, t: s.time, text, tone })
  if (s.events.length > 24) s.events.shift()
}

function who(t: Trace): string {
  const { client, scenario } = t.params
  if (client === 'lana-local') return scenario === 'laptop' ? 'Lana na laptopu' : 'Lana na poslužitelju'
  return 'Petra'
}

function logSend(s: LabState) {
  logEvent(s, `${who(s.trace)} otvara ${urlOf(s.trace.params.scenario, s.trace.params.client)}`, 'neutral')
}

/** Start a new request (a control changed, or "Pošalji zahtjev"). */
export function startTrace(s: LabState, params: TraceParams) {
  s.trace = traceRequest(params)
  s.head = { seg: 0, frac: 0, done: false }
  s.retries = 0
  s.logged = []
  s.requests++
  logSend(s)
}

function onEnd(s: LabState, i: number) {
  const seg: Seg | undefined = s.trace.segs[i]
  if (s.logged.includes(i)) return
  s.logged.push(i)
  if (seg?.event) logEvent(s, seg.event.text, seg.event.tone)
  if (i === s.trace.segs.length - 1) record(s)
}

function record(s: LabState) {
  const t = s.trace
  const fromPetra = t.params.client !== 'lana-local'
  if (t.outcome === 'ok' && t.params.client === 'petra') {
    s.seen.okPetra = true
    if (t.params.scenario === 'proxy' && t.params.place === 'sydney') s.seen.sydney = true
  }
  if (t.outcome === 'refused' && fromPetra) s.seen.refused = true
  if (t.outcome === 'timeout') s.seen.timeout = true
  if (t.outcome === 'nxdomain') s.seen.nxdomain = true
  if (t.outcome === 'bad-gateway') s.seen.badGateway = true
}

/** Log the SYN retransmissions while the client waits (real ms from the first SYN). */
function logRetries(s: LabState) {
  const seg = s.trace.segs[s.head.seg]
  if (!seg || seg.kind !== 'wait') return
  const syn = s.trace.segs[s.head.seg - 1]
  const synAt = syn ? syn.t0 : 0
  const now = seg.t0 + (seg.t1 - seg.t0) * (s.head.done ? 1 : s.head.frac)
  while (s.retries < SYN_RETRIES_MS.length && now >= synAt + SYN_RETRIES_MS[s.retries]) {
    logEvent(s, `${fmtMs(SYN_RETRIES_MS[s.retries])} nakon prvog SYN-a još nema odgovora: mobitel ga šalje ponovno`, 'warn')
    s.retries++
  }
}

/** Advance the playback by dt seconds of drawing time. */
export function stepLab(s: LabState, dt: number, secondsOf: (seg: Seg) => number) {
  s.time += dt
  if (s.head.done) return
  advance(s.head, s.trace, dt, secondsOf, (i) => {
    // retries inside a wait segment are logged before the segment's own end event
    if (s.trace.segs[i]?.kind === 'wait') {
      s.head.frac = 1
      logRetries(s)
    }
    onEnd(s, i)
  })
  logRetries(s)
}

/** Jump to the end of the current segment (paused stepping) — "korak naprijed". */
export function stepForward(s: LabState) {
  if (s.head.done) return
  const i = s.head.seg
  if (s.trace.segs[i]?.kind === 'wait') {
    s.head.frac = 1
    logRetries(s)
  }
  onEnd(s, i)
  if (i >= s.trace.segs.length - 1) {
    s.head.frac = 1
    s.head.done = true
  } else {
    s.head.seg = i + 1
    s.head.frac = 0
  }
}

/** Back to the start of the previous segment — "korak natrag" (the log keeps what was already said). */
export function stepBack(s: LabState) {
  if (s.head.done) {
    s.head = { seg: s.trace.segs.length - 1, frac: 0, done: false }
    return
  }
  if (s.head.frac > 0.02) s.head.frac = 0
  else s.head.seg = Math.max(0, s.head.seg - 1)
  s.head.frac = 0
}

/** Play the whole request at once (reduced motion: no flying trays, the final state and the full log). */
export function finishNow(s: LabState) {
  let guard = 0
  while (!s.head.done && guard++ < 64) stepForward(s)
}
