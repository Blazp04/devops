/**
 * Trace views for „Tri signala” and the flagship: one request's waterfall built from what the engines decided for it.
 * HTTP part: the E3 request record (outcome, Pod, latency) + the fluid stream's mean latency under load.
 * Asynchronous part: E2's own order trace (queue wait, processing attempts, SMS, DLQ).
 */
import * as K from '../../../engines/cluster/index.ts'
import * as Q from '../../../engines/queue/index.ts'
import type { IncidentState } from './model.ts'

export interface Span {
  name: string
  /** ms from the start of the trace */
  start: number
  dur: number
  status: 'ok' | 'err'
  note?: string
  depth: number
}

export interface TraceView {
  traceId: string
  title: string
  spans: Span[]
  totalMs: number
  outcome: string
  ok: boolean
}

function hex(n: number): string {
  let x = (n >>> 0) ^ 0x9e3779b9
  let out = ''
  for (let i = 0; i < 4; i++) {
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0
    out += x.toString(16).padStart(8, '0')
  }
  return out
}

export const OUTCOME: Record<K.RequestOutcome, string> = {
  ok: '200 OK',
  noEndpoints: '503 · nema spremnog Poda u EndpointSliceu',
  refused: '502 · veza s Podom odbijena',
  timeout: '504 · isteklo vrijeme',
  http503: '503 · aplikacija ne može do baze',
  http500: '500 · baza odbija lozinku',
  http404: '404 · zahtjev je uhvatilo pravilo / (klopa-web)',
}

/** Lunch traffic is mixed: most requests read the menu, about one in 30 is an order (≈ 1,2 narudžbe/s at 36–42 zahtjeva/s). */
export function routeOf(r: K.RequestRecord): { method: 'GET' | 'POST'; path: string; order: boolean } {
  const h = parseInt(traceIdOf(r).slice(8, 16), 16)
  return h % 30 === 0 ? { method: 'POST', path: '/api/narudzbe', order: true } : { method: 'GET', path: '/api/jelovnik', order: false }
}

/** Status line of a request record (201 for an order, 200 for the menu). */
export function outcomeText(r: K.RequestRecord): string {
  if (r.outcome !== 'ok') return OUTCOME[r.outcome]
  return routeOf(r).order ? '201 Created' : '200 OK'
}

/** Wall clock of a sim second (12:00:00 = t 0), the same as the access log. */
function wall(t: number): string {
  const total = 12 * 3600 + Math.max(0, Math.floor(t))
  return `${Math.floor(total / 3600)}:${String(Math.floor((total % 3600) / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** The newest request of the lunch stream (or the newest failed one) as a waterfall. */
export function apiTrace(s: IncidentState, prefer: 'latest' | 'failed' = 'latest', beforeT = Infinity): TraceView | null {
  const recs = s.k8s.recent
  let r: K.RequestRecord | undefined
  for (let i = recs.length - 1; i >= 0; i--) {
    const x = recs[i]
    if (x.streamId !== 'web' || x.t > beforeT) continue
    if (prefer === 'failed' && x.outcome === 'ok') continue
    r = x
    break
  }
  if (!r && prefer === 'failed') return apiTrace(s, 'latest', beforeT)
  return r ? traceOfRecord(s, r) : null
}

/** Deterministic trace id of a request record (the same id the access log prints). */
export function traceIdOf(r: K.RequestRecord): string {
  return hex(Math.round(r.t * 1000) + (r.user ?? 0) * 7)
}

/** One request record of E3 as a waterfall. The Service is not a hop: the Gateway reads Pod addresses from its EndpointSlice. */
export function traceOfRecord(s: IncidentState, r: K.RequestRecord): TraceView {
  const fl = s.k8s.traffic.find((x) => x.id === 'cpu')
  const mean = fl && fl.latencyMs > 0 && Number.isFinite(fl.latencyMs) ? fl.latencyMs : 60
  const pod = r.podId ? s.k8s.pods.find((p) => p.id === r.podId) : undefined
  const route = routeOf(r)
  const spans: Span[] = []
  let t = 0
  const add = (name: string, dur: number, status: Span['status'] = 'ok', note?: string, depth = 1) => {
    spans.push({ name, start: t, dur, status, note, depth })
    t += dur
  }
  add('DNS klopa.example', 1, 'ok', 'iz predmemorije')
  add('load balancer u oblaku', 2)
  if (r.outcome === 'http404') {
    add('Gateway: TLS + HTTPRoute', 2, 'ok', 'pravilo / → klopa-web')
    add('klopa-web (nginx)', 2, 'err', `404 · ne zna za ${route.path}`)
  } else if (r.outcome === 'noEndpoints' || r.outcome === 'refused') {
    add('Gateway: TLS + HTTPRoute', 2, 'err', `pravilo /api → klopa-api · ${OUTCOME[r.outcome]}`)
  } else {
    add('Gateway: TLS + HTTPRoute', 2, 'ok', 'pravilo /api → klopa-api · Pod iz EndpointSlicea')
    const ok = r.outcome === 'ok'
    const apiMs = ok ? Math.max(r.latencyMs, mean * (0.7 + (r.latencyMs % 7) / 10)) : r.latencyMs
    const apiStart = t
    spans.push({ name: `Pod ${pod?.name ?? 'klopa-api'}`, start: apiStart, dur: apiMs, status: ok ? 'ok' : 'err', note: ok ? `gunicorn · ${pod?.spec.app.version ?? ''}` : OUTCOME[r.outcome], depth: 1 })
    const dbMs = Math.max(2, apiMs * 0.35)
    const dbErr = r.outcome === 'http500' || r.outcome === 'http503'
    spans.push({ name: route.order ? 'Postgres: INSERT narudžba' : 'Postgres: SELECT jelovnik', start: apiStart + apiMs * 0.3, dur: dbErr ? 1 : dbMs, status: dbErr ? 'err' : 'ok', note: r.outcome === 'http500' ? 'password authentication failed' : r.outcome === 'http503' ? 'baza ne odgovara' : undefined, depth: 2 })
    if (ok && route.order) spans.push({ name: 'RabbitMQ: objava u red narudžbi', start: apiStart + apiMs * 0.3 + dbMs + 1, dur: 2, status: 'ok', depth: 2 })
    t = apiStart + apiMs
  }
  const total = Math.max(t, ...spans.map((x) => x.start + x.dur))
  const outcome = outcomeText(r)
  spans.unshift({ name: `${route.method} ${route.path}`, start: 0, dur: total, status: r.outcome === 'ok' ? 'ok' : 'err', depth: 0, note: outcome })
  return { traceId: traceIdOf(r), title: `zahtjev u ${wall(r.t)}`, spans, totalMs: total, outcome, ok: r.outcome === 'ok' }
}

const SPAN_LABEL: Record<string, string> = {
  red: 'čeka u redu narudžbi',
  obrada: 'obrada (kuhinjski listić)',
  SMS: 'SMS „narudžba je spremna”',
  potvrda: 'potvrda (ack)',
  DLQ: 'DLQ',
}

/** The newest order E2 traced (queue → consumer → SMS), as a waterfall in ms. */
export function orderTraceView(s: IncidentState): TraceView | null {
  const ids = Q.tracedOrders(s.q)
  for (let i = ids.length - 1; i >= 0; i--) {
    const tr = Q.orderTrace(s.q, ids[i])
    if (!tr || !tr.spans.length) continue
    const t0 = tr.startS
    const spans: Span[] = tr.spans.map((x) => ({
      name: `${SPAN_LABEL[x.span] ?? x.span}${x.attempt > 1 ? ` · pokušaj ${x.attempt}` : ''}`,
      start: (x.start - t0) * 1000,
      dur: Math.max(1, ((x.open || x.end === null ? s.q.t : x.end) - x.start) * 1000),
      status: x.outcome === 'crash' || x.outcome === 'timeout' || x.outcome === 'lost' || x.outcome === 'dlq' || x.span === 'DLQ' ? 'err' : 'ok',
      note: x.pod ?? undefined,
      depth: 1,
    }))
    const total = Math.max(...spans.map((x) => x.start + x.dur))
    const bad = spans.some((x) => x.status === 'err')
    spans.unshift({ name: `narudžba #${tr.orderId}`, start: 0, dur: total, status: bad ? 'err' : 'ok', depth: 0 })
    return { traceId: tr.traceId, title: `narudžba #${tr.orderId}`, spans, totalMs: total, outcome: bad ? 's greškom' : 'obrađena', ok: !bad }
  }
  return null
}
