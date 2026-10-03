/**
 * Built-in traffic through Services.
 *
 * - 'requests' model (L12–L14, L19, L20, L24): Poisson or uniform arrivals from a per-stream RNG (identical in
 *   every lane with the same seed); each request carries its exact arrival time (between the 0,1 s ticks) so dots
 *   move smoothly. By default each request is a NEW connection, so kube-proxy picks a uniformly random target
 *   (ready endpoints, or the serving-terminating fallback) as currently programmed on the nodes. With `keepAlive`
 *   the client keeps N long-lived connections and every request on a connection goes to the Pod chosen when it
 *   was opened (HTTP keep-alive, HTTP/2, gRPC). With `routes` a Gateway (L7) picks a backend Service per request
 *   by weight (an empty rule list = HTTP 404). With `targetIp` the client skips the Service and dials a Pod IP.
 *   The outcome comes from what the process can really do (ok / connection refused / timeout / 503 / 500);
 *   successful writes to a database Pod increment its order counter.
 * - 'fluid' model (L18, SIM 4): once per second the rate is split evenly over ready endpoints; CPU demand =
 *   rate × CPU per request, capped by the CPU limit (and node contention); what cannot be served is dropped.
 *   Latency ≈ base / (1 − min(ρ, cap)), labelled as an M/M/1 approximation.
 */
import type { ClientConnection, ClusterState, GoalWindow, InFlightRequest, Pod, RequestOutcome, RequestRecord, RouteWeight, Service, TrafficProfile, TrafficStream } from './types.ts'
import { createRng } from '../../kit/sim/math.ts'
import { serveAnswer } from './kubelet.ts'
import { findService, pickEndpoint, tracePacket } from './service.ts'
import type { PacketHop } from './service.ts'
import { fnv32a, hrCount, logEvent, matches, newId, nodeByName, renderTime } from './util.ts'

const ZERO_TOTALS = (): Record<RequestOutcome, number> => ({ ok: 0, noEndpoints: 0, refused: 0, timeout: 0, http503: 0, http500: 0, http404: 0 })

export const MAX_IN_FLIGHT = 200
const RECENT_WINDOW_S = 60
/** p95 of an exponential sojourn time = mean × ln 20 */
export const P95_FACTOR = Math.log(20)

export function profileRate(p: TrafficProfile, t: number): number {
  let r: number
  switch (p.kind) {
    case 'steady':
      r = p.rps
      break
    case 'spike':
    case 'flash':
      r = t >= p.startS && t < p.endS ? p.peak : p.base
      break
    case 'sine': {
      const ph = p.periodS > 0 ? ((t + (p.phaseS ?? 0)) / p.periodS) * 2 * Math.PI : 0
      r = p.min + ((p.max - p.min) * (1 - Math.cos(ph))) / 2
      break
    }
  }
  return Number.isFinite(r) ? Math.max(0, r) : 0
}

/** The stream's offered rate now: its profile evaluated relative to the profile's time origin. */
export function streamRate(s: ClusterState, st: TrafficStream): number {
  return profileRate(st.profile, s.t - (st.profileT0 ?? 0))
}

export interface TrafficStreamOptions {
  serviceName: string
  namespace?: string
  model?: TrafficStream['model']
  profile?: TrafficProfile
  /** shortcut for profile { kind: 'steady', rps } (default 20) */
  rps?: number
  arrival?: TrafficStream['arrival']
  clientIp?: string | null
  id?: string
  users?: number
  keepAlive?: TrafficStream['keepAlive']
  routes?: RouteWeight[] | null
  /** dial this Pod IP directly (L14 „Upiši IP”) – no Service, no kube-proxy */
  targetIp?: string | null
  /** client Pod (source address/node for tracePacket and sendRequest; default ClientIP for affinity) */
  fromPod?: string | null
  /** time origin of the profile (default: now) */
  profileT0?: number
}

export function addTrafficStream(s: ClusterState, o: TrafficStreamOptions): TrafficStream {
  const id = o.id ?? newId(s, 'traffic')
  const st: TrafficStream = {
    id,
    serviceName: o.serviceName,
    namespace: o.namespace ?? s.cfg.namespace,
    model: o.model ?? 'requests',
    profile: o.profile ?? { kind: 'steady', rps: o.rps ?? 20 },
    arrival: o.arrival ?? 'poisson',
    clientIp: o.clientIp ?? null,
    users: Math.max(0, Math.floor(o.users ?? 0)),
    usersHit: {},
    keepAlive: o.keepAlive ?? null,
    conns: [],
    connCursor: 0,
    routes: o.routes ? o.routes.map((r) => ({ ...r })) : null,
    targetIp: o.targetIp ?? null,
    fromPod: o.fromPod ?? null,
    rng: createRng((s.cfg.seed ^ fnv32a(id)) >>> 0),
    okByVersion: {},
    failByVersion: {},
    usersByVersion: {},
    enabled: true,
    nextArrivalAt: NaN,
    carry: 0,
    totals: ZERO_TOTALS(),
    dropped: 0,
    served: 0,
    rho: 0,
    latencyMs: 0,
    p95Ms: 0,
    worstP95Ms: 0,
    profileT0: o.profileT0 ?? s.t,
    outcomesByVersion: {},
  }
  s.traffic.push(st)
  return st
}

interface Sent {
  t: number
  serviceName: string | null
}

/** Count a request for every rollout in progress behind this Service (RolloutRecord.requests). */
function attributeToRollouts(s: ClusterState, st: TrafficStream, at: Sent, outcome: RequestOutcome): void {
  if (at.serviceName === null) return
  const svc = findService(s, at.serviceName, st.namespace)
  if (!svc) return
  const lag = s.cfg.timings.endpointPropagationS + s.cfg.timings.requestTravelS
  for (const d of s.deployments) {
    const r = d.rollout
    if (!r || at.t + 1e-9 < r.startedAt || (r.settledAt !== null && at.t > r.settledAt + lag + 1e-9)) continue
    if (svc.namespace !== d.namespace || !matches(svc.selector, d.template.labels)) continue
    r.requests.byOutcome[outcome] += 1
    if (outcome === 'ok') r.requests.ok += 1
    else r.requests.failed += 1
  }
}

function record(s: ClusterState, st: TrafficStream, at: Sent, outcome: RequestOutcome, version: string | null, latencyMs: number, pod: Pod | null, podId: string | null, user: number | null, connId: string | null): InFlightRequest {
  st.totals[outcome] += 1
  if (version) (st.outcomesByVersion[version] ??= ZERO_TOTALS())[outcome] += 1
  attributeToRollouts(s, st, at, outcome)
  if (version && user !== null) (st.usersByVersion[version] ??= {})[user] = true
  if (outcome === 'ok') {
    s.secondCounters.ok += 1
    if (version) {
      st.okByVersion[version] = (st.okByVersion[version] ?? 0) + 1
      s.secondCounters.okByVersion[version] = (s.secondCounters.okByVersion[version] ?? 0) + 1
    }
  } else {
    s.secondCounters.err += 1
    if (version) st.failByVersion[version] = (st.failByVersion[version] ?? 0) + 1
    if (user !== null) st.usersHit[user] = (st.usersHit[user] ?? 0) + 1
  }
  const r: RequestRecord = { t: at.t, streamId: st.id, serviceName: at.serviceName, outcome, version, latencyMs, podId, user }
  s.recent.push(r)
  const f: InFlightRequest = { id: newId(s, 'req'), streamId: st.id, connId, user, t0: at.t, duration: s.cfg.timings.requestTravelS, podId, podName: pod?.name ?? null, version, outcome }
  s.inFlight.push(f)
  if (s.inFlight.length > MAX_IN_FLIGHT) s.inFlight.splice(0, s.inFlight.length - MAX_IN_FLIGHT)
  return f
}

/** Gateway: choose a backend Service by weight (u uniform in [0,1)). null when every weight is 0. */
export function pickRoute(routes: RouteWeight[], u: number): string | null {
  const total = routes.reduce((a, r) => a + (Number.isFinite(r.weight) ? Math.max(0, r.weight) : 0), 0)
  if (!(total > 0)) return null
  let x = u * total
  for (const r of routes) {
    const w = Number.isFinite(r.weight) ? Math.max(0, r.weight) : 0
    if (x < w) return r.serviceName
    x -= w
  }
  return routes.filter((r) => r.weight > 0).at(-1)?.serviceName ?? null
}

/** Source address used for ClientIP affinity: the stream's clientIp, else its client Pod's IP. */
function sourceIp(s: ClusterState, st: TrafficStream): string | null {
  if (st.clientIp) return st.clientIp
  if (!st.fromPod) return null
  return s.pods.find((p) => p.name === st.fromPod && p.namespace === st.namespace)?.ip ?? null
}

/** The connection a keep-alive client uses for its next request (opened through kube-proxy if needed). */
function connectionFor(s: ClusterState, st: TrafficStream, svc: Service): ClientConnection | null {
  const ka = st.keepAlive!
  const n = Math.max(1, Math.floor(Number.isFinite(ka.connections) ? ka.connections : 1))
  const i = st.connCursor % n
  st.connCursor = (i + 1) % n
  let c = st.conns[i] ?? null
  if (c && (c.serviceId !== svc.id || (ka.maxAgeS !== null && s.t - c.openedAt + 1e-9 >= ka.maxAgeS))) c = null
  if (!c) {
    const ep = pickEndpoint(s, svc, sourceIp(s, st))
    if (!ep) {
      st.conns[i] = null
      return null
    }
    c = { id: newId(s, 'conn'), serviceId: svc.id, podId: ep.podId, podName: ep.podName, openedAt: s.t, requests: 0 }
  }
  st.conns[i] = c
  return c
}

function closeConnection(st: TrafficStream, c: ClientConnection): void {
  const i = st.conns.indexOf(c)
  if (i >= 0) st.conns[i] = null
}

/** One request arriving at time `t` (≥ s.t, before the next tick). Returns the animated request. */
function sendOne(s: ClusterState, st: TrafficStream, t: number): InFlightRequest {
  // always draw the same three numbers per request so lanes with the same seed stay aligned
  const uUser = st.rng.next()
  const user = st.users > 0 ? Math.min(st.users - 1, Math.floor(uUser * st.users)) : null
  const uBug = st.rng.next()
  const uRoute = st.rng.next()
  if (st.targetIp) return sendDirect(s, st, t, user, uBug)
  let serviceName: string | null = st.serviceName
  if (st.routes) {
    // HTTPRoute without a matching rule: the Gateway itself answers 404
    if (st.routes.length === 0) return record(s, st, { t, serviceName: null }, 'http404', null, 2, null, null, user, null)
    serviceName = pickRoute(st.routes, uRoute)
  }
  const at: Sent = { t, serviceName }
  const svc = serviceName === null ? undefined : findService(s, serviceName, st.namespace)
  if (!svc) return record(s, st, at, 'noEndpoints', null, 1, null, null, user, null)
  let pod: Pod | undefined
  let conn: ClientConnection | null = null
  if (st.keepAlive && !st.routes) {
    conn = connectionFor(s, st, svc)
    if (!conn) return record(s, st, at, 'noEndpoints', null, 1, null, null, user, null)
    conn.requests += 1
    const podId = conn.podId
    pod = s.pods.find((p) => p.id === podId)
  } else {
    const ep = pickEndpoint(s, svc, sourceIp(s, st))
    if (!ep) return record(s, st, at, 'noEndpoints', null, 1, null, null, user, null)
    pod = s.pods.find((p) => p.id === ep.podId)
    if (!pod) return record(s, st, at, 'refused', null, 1, null, ep.podId, user, null)
  }
  if (!pod) {
    // the Pod behind this connection is gone: connection reset, the client reconnects next time
    const f = record(s, st, at, 'refused', null, 1, null, conn?.podId ?? null, user, conn?.id ?? null)
    if (conn) closeConnection(st, conn)
    return f
  }
  return serveAt(s, st, at, pod, user, uBug, conn)
}

/** A client with a hard-coded Pod IP: whoever owns the address now answers; nobody → connection error. */
function sendDirect(s: ClusterState, st: TrafficStream, t: number, user: number | null, uBug: number): InFlightRequest {
  const at: Sent = { t, serviceName: null }
  const owners = s.pods.filter((p) => p.ip === st.targetIp)
  const pod = owners.find((p) => p.processUp) ?? owners[0]
  // no Pod holds the address any more: no route to host (counted with connection errors)
  if (!pod) return record(s, st, at, 'refused', null, 1, null, null, user, null)
  return serveAt(s, st, at, pod, user, uBug, null)
}

function serveAt(s: ClusterState, st: TrafficStream, at: Sent, pod: Pod, user: number | null, uBug: number, conn: ClientConnection | null): InFlightRequest {
  const node = nodeByName(s, pod.nodeName)
  const version = pod.spec.app.version
  const connId = conn?.id ?? null
  if (!node || node.machine !== 'running') {
    const f = record(s, st, at, 'timeout', version, s.cfg.timings.requestTimeoutS * 1000, pod, pod.id, user, connId)
    pod.stats.failed += 1
    if (conn) closeConnection(st, conn)
    return f
  }
  let outcome: RequestOutcome = serveAnswer(s, pod)
  if (outcome === 'ok' && pod.spec.app.bugRate > 0 && uBug < pod.spec.app.bugRate) outcome = 'http500'
  const latency = outcome === 'timeout' ? s.cfg.timings.requestTimeoutS * 1000 : outcome === 'refused' ? 1 : outcome === 'ok' ? 20 + 40 * s.rng.next() : 5 + 10 * s.rng.next()
  if (outcome === 'ok') {
    pod.stats.served += 1
    if (pod.spec.app.database && pod.dataStoreId) {
      const ds = s.dataStores[pod.dataStoreId]
      if (ds) ds.orders += 1
    }
  } else pod.stats.failed += 1
  const f = record(s, st, at, outcome, version, latency, pod, pod.id, user, connId)
  // a reset connection is reopened next time; a terminating server answers with "Connection: close"
  if (conn && (outcome === 'refused' || outcome === 'timeout' || pod.deletion)) closeConnection(st, conn)
  return f
}

/** Discrete requests – called every tick. */
export function requestsTick(s: ClusterState): void {
  const dt = s.cfg.timings.dt
  for (const st of s.traffic) {
    if (!st.enabled || st.model !== 'requests') continue
    const rate = streamRate(s, st)
    if (rate <= 0) {
      st.nextArrivalAt = NaN
      continue
    }
    if (st.arrival === 'uniform') {
      const start = st.carry
      st.carry += rate * dt
      let n = 0
      while (st.carry >= 1 - 1e-9) {
        st.carry -= 1
        n += 1
        sendOne(s, st, s.t + Math.min(dt, Math.max(0, (n - start) / rate)))
      }
      continue
    }
    if (Number.isNaN(st.nextArrivalAt)) st.nextArrivalAt = s.t + st.rng.exp(rate)
    while (st.nextArrivalAt < s.t + dt) {
      sendOne(s, st, Math.max(s.t, st.nextArrivalAt))
      st.nextArrivalAt += st.rng.exp(rate)
    }
  }
  // prune
  const cutoff = s.t - RECENT_WINDOW_S
  let i = 0
  while (i < s.recent.length && s.recent[i].t < cutoff) i++
  if (i) s.recent.splice(0, i)
  // drop dots that had arrived by the previous tick: the UI draws every dot up to progress 1 (renderTime)
  s.inFlight = s.inFlight.filter((f) => f.t0 + f.duration > s.t + 1e-9)
}

/** Fluid model, step 1 (per second, before the CPU water-fill): offered load per ready endpoint. */
export function fluidDemand(s: ClusterState): void {
  for (const p of s.pods) if (p.processUp) p.usage.cpuDemandM = p.usage.cpuDemandOverrideM ?? p.spec.app.cpuDemandM
  for (const st of s.traffic) {
    if (!st.enabled || st.model !== 'fluid') continue
    const svc = findService(s, st.serviceName, st.namespace)
    const eps = svc ? s.proxy[svc.id].endpoints : []
    const rate = streamRate(s, st)
    const pods = eps.map((e) => s.pods.find((p) => p.id === e.podId)).filter((p) => p && p.processUp)
    if (pods.length === 0) continue
    const per = rate / pods.length
    for (const p of pods) p!.usage.cpuDemandM += per * p!.spec.app.cpuPerRequestMs
  }
}

/** Fluid model, step 2 (after the CPU water-fill): served vs dropped, ρ and the latency estimate. */
export function fluidServe(s: ClusterState): void {
  const { baseMs, rhoCap } = s.cfg.latency
  for (const st of s.traffic) {
    if (!st.enabled || st.model !== 'fluid') continue
    const svc = findService(s, st.serviceName, st.namespace)
    const eps = svc ? s.proxy[svc.id].endpoints : []
    const rate = streamRate(s, st)
    const pods = eps.map((e) => s.pods.find((p) => p.id === e.podId)).filter((p) => p && p.processUp)
    if (pods.length === 0) {
      st.dropped += rate
      st.rho = rate > 0 ? Infinity : 0
      st.latencyMs = rate > 0 ? baseMs / (1 - rhoCap) : baseMs
      st.p95Ms = st.latencyMs * P95_FACTOR
      if (rate > 0) st.worstP95Ms = Math.max(st.worstP95Ms, st.p95Ms)
      s.secondCounters.err += rate
      continue
    }
    const per = rate / pods.length
    let served = 0
    let rhoMax = 0
    for (const p of pods) {
      const cpr = p!.spec.app.cpuPerRequestMs
      const base = p!.usage.cpuDemandOverrideM ?? p!.spec.app.cpuDemandM
      // capacity = the CPU this Pod could really get for requests this second: its limit, the node's headroom and,
      // under contention, its water-fill share (cpuSecond) – not the nominal limit
      const capRps = cpr > 0 ? Math.max(0, p!.usage.cpuCapacityM - base) / cpr : Infinity
      const gotRps = cpr > 0 ? Math.max(0, p!.usage.cpuM - base) / cpr : per
      const sv = Math.min(per, gotRps)
      served += sv
      let rho = per > 0 ? (capRps > 0 ? per / capRps : Infinity) : 0
      // invariant: a Pod that drops requests is saturated (ρ ≥ 1)
      if (sv < per - 1e-9) rho = Math.max(rho, gotRps > 0 ? per / gotRps : Infinity)
      rhoMax = Math.max(rhoMax, rho)
      p!.stats.served += sv
    }
    // float residue (Σ per-Pod shares vs the rate) must never show up as "−0" dropped requests
    served = Math.min(rate, served)
    let lost = rate - served
    if (lost < 1e-9) lost = 0
    st.served += served
    st.dropped += lost
    st.rho = rhoMax
    st.latencyMs = baseMs / (1 - Math.min(rhoMax, rhoCap))
    st.p95Ms = st.latencyMs * P95_FACTOR
    if (rate > 0) st.worstP95Ms = Math.max(st.worstP95Ms, st.p95Ms)
    s.secondCounters.ok += served
    s.secondCounters.err += lost
  }
}

// ---------------------------------------------------------------- client actions (L14)

export type TrafficClient = { mode: 'per-request' } | { mode: 'keep-alive'; connections: number; maxAgeS?: number | null }

/**
 * L14 „klijent”: a new connection per request, or N long-lived keep-alive connections (each pinned to the Pod
 * kube-proxy picked when it opened). Closes the current connections. `clientIp` sets the source address
 * (one NAT IP for a whole campus) or clears it (null).
 */
export function setTrafficClient(s: ClusterState, streamId: string, client: TrafficClient, o: { clientIp?: string | null } = {}): boolean {
  const st = s.traffic.find((x) => x.id === streamId)
  if (!st) return false
  if (client.mode === 'keep-alive') {
    const n = Number.isFinite(client.connections) ? Math.max(1, Math.min(64, Math.floor(client.connections))) : 1
    const age = client.maxAgeS ?? null
    st.keepAlive = { connections: n, maxAgeS: age !== null && Number.isFinite(age) && age > 0 ? age : null }
  } else st.keepAlive = null
  st.conns = []
  st.connCursor = 0
  if (o.clientIp !== undefined) st.clientIp = o.clientIp
  const what = st.keepAlive ? (st.keepAlive.connections === 1 ? 'jedna dugotrajna veza' : hrCount(st.keepAlive.connections, ['dugotrajna veza', 'dugotrajne veze', 'dugotrajnih veza'])) : 'nova veza po zahtjevu'
  logEvent(s, 'client', `Klijent ${clientName(st)}: ${what}${st.clientIp ? ` s adrese ${st.clientIp}` : ''}`, 'info')
  return true
}

/**
 * Gateway API (L15/L24): set a stream's HTTPRoute weights – each request then picks a Service by weight; [] = the
 * route has no rule for this path (HTTP 404); null = no Gateway, the stream uses its serviceName. Same effect as
 * writing stream.routes directly (no event is logged). Returns false for an unknown stream.
 */
export function setTrafficRoutes(s: ClusterState, streamId: string, routes: RouteWeight[] | null): boolean {
  const st = s.traffic.find((x) => x.id === streamId)
  if (!st) return false
  st.routes = routes ? routes.map((r) => ({ ...r })) : null
  return true
}

/** The client's name in log lines: its Pod (presetService: klopa-web) when it has one, else the stream id. */
function clientName(st: TrafficStream): string {
  return st.fromPod ?? st.id
}

/** L14 „Upiši IP”: point a stream at a fixed Pod IP (null = back to the Service name). */
export function setTrafficTarget(s: ClusterState, streamId: string, targetIp: string | null): boolean {
  const st = s.traffic.find((x) => x.id === streamId)
  if (!st) return false
  st.targetIp = targetIp
  st.conns = []
  logEvent(s, 'client', targetIp ? `Klijent ${clientName(st)} šalje ravno na IP Poda ${targetIp} (bez Servicea)` : `Klijent ${clientName(st)} ponovno koristi ime Servicea ${st.serviceName}`, targetIp ? 'warn' : 'info')
  return true
}

/**
 * „Pošalji zahtjev (korak po korak)”: send ONE request of this stream now (same path, RNG and statistics as the
 * automatic traffic). Returns the animated request and, when the stream has a client Pod, the packet path.
 */
export function sendRequest(s: ClusterState, streamId: string): { request: InFlightRequest; hops: PacketHop[] | null } | null {
  const st = s.traffic.find((x) => x.id === streamId)
  if (!st) return null
  const request = sendOne(s, st, s.t)
  let hops: PacketHop[] | null = null
  const svcName = s.recent.at(-1)?.serviceName ?? null
  if (st.fromPod && svcName && !st.targetIp) {
    const svc = findService(s, svcName, st.namespace)
    const idx = svc ? s.proxy[svc.id].endpoints.findIndex((e) => e.podId === request.podId) : -1
    hops = tracePacket(s, st.fromPod, svcName, Math.max(0, idx))
  }
  return { request, hops }
}

// ---------------------------------------------------------------- selectors

export interface RequestStats {
  windowS: number
  total: number
  ok: number
  errors: Record<Exclude<RequestOutcome, 'ok'>, number>
  errorRate: number
  /** null when fewer than 20 successful requests (show "n/a") */
  p50Ms: number | null
  p95Ms: number | null
  p99Ms: number | null
  /** requests per app version in the window (ok and failed – the windowed error rate per version) */
  byVersion: Record<string, { ok: number; failed: number }>
  rps: number
}

/** Nearest-rank percentiles over SUCCESSFUL requests in the window; errors counted separately. */
export function requestStats(s: ClusterState, windowS = 10, streamId?: string): RequestStats {
  const from = s.t - windowS
  const rs = s.recent.filter((r) => r.t >= from && (streamId === undefined || r.streamId === streamId))
  const errors = { noEndpoints: 0, refused: 0, timeout: 0, http503: 0, http500: 0, http404: 0 }
  const lat: number[] = []
  const byVersion: Record<string, { ok: number; failed: number }> = {}
  for (const r of rs) {
    const v = r.version ? (byVersion[r.version] ??= { ok: 0, failed: 0 }) : null
    if (r.outcome === 'ok') {
      lat.push(r.latencyMs)
      if (v) v.ok += 1
    } else {
      errors[r.outcome] += 1
      if (v) v.failed += 1
    }
  }
  lat.sort((a, b) => a - b)
  const pctl = (p: number) => (lat.length < 20 ? null : lat[Math.min(lat.length - 1, Math.max(0, Math.ceil((p / 100) * lat.length) - 1))])
  const total = rs.length
  const ok = lat.length
  return { windowS, total, ok, errors, errorRate: total ? (total - ok) / total : 0, p50Ms: pctl(50), p95Ms: pctl(95), p99Ms: pctl(99), byVersion, rps: total / Math.max(1e-9, Math.min(windowS, s.t || windowS)) }
}

/**
 * RED metrics of one Service (L24 „Ploča metrika po servisu”): request rate, error share and p95 of successful
 * requests (null below 20) over the window. Counts requests of the 'requests' model addressed to that Service.
 */
export function redMetrics(s: ClusterState, serviceName: string, windowS = 10): { rps: number; errorRate: number; p95Ms: number | null; total: number } {
  const from = s.t - windowS
  let total = 0
  let failed = 0
  const lat: number[] = []
  for (const r of s.recent) {
    if (r.t < from || r.serviceName !== serviceName) continue
    total += 1
    if (r.outcome === 'ok') lat.push(r.latencyMs)
    else failed += 1
  }
  lat.sort((a, b) => a - b)
  const p95Ms = lat.length < 20 ? null : lat[Math.min(lat.length - 1, Math.ceil(0.95 * lat.length) - 1)]
  return { rps: total / Math.max(1e-9, Math.min(windowS, s.t || windowS)), errorRate: total ? failed / total : 0, p95Ms, total }
}

/** Fluid stream (L18): current and worst p95 estimate, dropped and served totals since start / reset. */
export function fluidStats(s: ClusterState, streamId: string): { p95NowMs: number; worstP95Ms: number; dropped: number; served: number; rho: number } | null {
  const st = s.traffic.find((x) => x.id === streamId)
  if (!st) return null
  return { p95NowMs: st.p95Ms, worstP95Ms: st.worstP95Ms, dropped: st.dropped, served: st.served, rho: st.rho }
}

/** Distinct users who saw at least one failed request (streams with `users` > 0). */
export function distinctUsersHit(s: ClusterState, streamId?: string): number {
  let n = 0
  for (const st of s.traffic) if (streamId === undefined || st.id === streamId) n += Object.keys(st.usersHit).length
  return n
}

/** Share of requests per Pod (hit histogram) over the recent window, sorted by Pod name. */
export function hitShares(s: ClusterState, windowS = 30, streamId?: string): { podId: string; podName: string; hits: number; share: number }[] {
  const from = s.t - windowS
  const by = new Map<string, number>()
  let total = 0
  for (const r of s.recent) {
    if (r.t < from || r.podId === null || (streamId !== undefined && r.streamId !== streamId)) continue
    by.set(r.podId, (by.get(r.podId) ?? 0) + 1)
    total += 1
  }
  return [...by.entries()]
    .map(([podId, hits]) => ({ podId, podName: s.pods.find((p) => p.id === podId)?.name ?? podId, hits, share: total ? hits / total : 0 }))
    .sort((a, b) => (a.podName < b.podName ? -1 : a.podName > b.podName ? 1 : 0))
}

/** Open keep-alive connections of a stream (for drawing pinned lines client → Pod). */
export function openConnections(s: ClusterState, streamId: string): ClientConnection[] {
  const st = s.traffic.find((x) => x.id === streamId)
  return st ? st.conns.filter((c): c is ClientConnection => c !== null) : []
}

function withSums(out: Record<RequestOutcome, number>): Record<RequestOutcome, number> & { failed: number; total: number } {
  const failed = out.noEndpoints + out.refused + out.timeout + out.http503 + out.http500 + out.http404
  return { ...out, failed, total: failed + out.ok }
}

/**
 * Totals since start (or since `resetTrafficTotals`), optionally of one stream and/or one app version (requests that
 * reached a Pod of that version – a request with no endpoint has no version). For a goal window use markWindow.
 */
export function trafficTotals(s: ClusterState, o: { streamId?: string; version?: string } = {}): Record<RequestOutcome, number> & { failed: number; total: number } {
  const out = ZERO_TOTALS()
  for (const st of s.traffic) {
    if (o.streamId !== undefined && st.id !== o.streamId) continue
    const src = o.version !== undefined ? st.outcomesByVersion[o.version] : st.totals
    if (!src) continue
    for (const k of Object.keys(out) as RequestOutcome[]) out[k] += src[k] ?? 0
  }
  return withSums(out)
}

/** Reset every stream's totals and the per-Service endpoint history (serviceStats). */
export function resetTrafficTotals(s: ClusterState): void {
  for (const st of s.traffic) {
    st.totals = ZERO_TOTALS()
    st.dropped = 0
    st.served = 0
    st.worstP95Ms = 0
    st.usersHit = {}
    st.okByVersion = {}
    st.failByVersion = {}
    st.usersByVersion = {}
    st.outcomesByVersion = {}
  }
  s.windows = []
  for (const k of Object.keys(s.serviceStats)) {
    const v = s.serviceStats[k]
    s.serviceStats[k] = { readyNow: v.readyNow, minReady: v.readyNow, zeroReadySeconds: 0, since: s.t }
  }
}

/** Ready endpoints kube-proxy has programmed for the Service (the terminating fallback counts as 0). */
function readyProgrammed(s: ClusterState, svcId: string): number {
  const pr = s.proxy[svcId]
  return pr.terminatingFallback ? 0 : pr.endpoints.length
}

/** Per-Service ready-endpoint bookkeeping (every tick, after kube-proxy); also feeds open goal windows. */
export function serviceStatsTick(s: ClusterState): void {
  const dt = s.cfg.timings.dt
  for (const svc of s.services) {
    if (svc.headless) continue
    const ready = readyProgrammed(s, svc.id)
    const st = (s.serviceStats[svc.name] ??= { readyNow: ready, minReady: ready, zeroReadySeconds: 0, since: s.t })
    st.readyNow = ready
    st.minReady = Math.min(st.minReady, ready)
    if (ready === 0) st.zeroReadySeconds = Math.round((st.zeroReadySeconds + dt) * 1e6) / 1e6
    for (const w of s.windows) {
      const ws = (w.services[svc.name] ??= { minReady: ready, zeroReadySeconds: 0 })
      ws.minReady = Math.min(ws.minReady, ready)
      if (ready === 0) ws.zeroReadySeconds = Math.round((ws.zeroReadySeconds + dt) * 1e6) / 1e6
    }
  }
}

// ---------------------------------------------------------------- goal windows

export const MAX_WINDOWS = 20

/**
 * Start a goal window now („Uvedite 1.4.0 bez ijednog neuspjelog zahtjeva”, „Ispad baze od 60 s bez 0 endpointa”):
 * remembers the current totals; windowStats(s, id) reports only what happened since. Global totals stay intact.
 */
export function markWindow(s: ClusterState, label = ''): string {
  const id = newId(s, 'win')
  const w: GoalWindow = { id, label, t: s.t, streams: {}, services: {} }
  for (const st of s.traffic) w.streams[st.id] = { totals: { ...st.totals }, usersHit: { ...st.usersHit }, okByVersion: { ...st.okByVersion }, failByVersion: { ...st.failByVersion } }
  for (const svc of s.services) {
    if (svc.headless) continue
    const ready = readyProgrammed(s, svc.id)
    w.services[svc.name] = { minReady: ready, zeroReadySeconds: 0 }
  }
  s.windows.push(w)
  if (s.windows.length > MAX_WINDOWS) s.windows.splice(0, s.windows.length - MAX_WINDOWS)
  return id
}

export interface WindowStats {
  id: string
  label: string
  t0: number
  durationS: number
  totals: Record<RequestOutcome, number> & { failed: number; total: number }
  /** distinct users with at least one failed request inside the window */
  usersHit: number
  byVersion: Record<string, { ok: number; failed: number }>
  /** per Service: lowest ready-endpoint count and seconds with none, inside the window */
  services: Record<string, { minReady: number; zeroReadySeconds: number; readyNow: number }>
}

/** What happened since markWindow (null for an unknown or evicted id). */
export function windowStats(s: ClusterState, id: string, o: { streamId?: string } = {}): WindowStats | null {
  const w = s.windows.find((x) => x.id === id)
  if (!w) return null
  const out = ZERO_TOTALS()
  let usersHit = 0
  const byVersion: Record<string, { ok: number; failed: number }> = {}
  for (const st of s.traffic) {
    if (o.streamId !== undefined && st.id !== o.streamId) continue
    const base = w.streams[st.id]
    for (const k of Object.keys(out) as RequestOutcome[]) out[k] += (st.totals[k] ?? 0) - (base?.totals[k] ?? 0)
    for (const [u, n] of Object.entries(st.usersHit)) if (n > (base?.usersHit[Number(u)] ?? 0)) usersHit += 1
    const versions = new Set([...Object.keys(st.okByVersion), ...Object.keys(st.failByVersion)])
    for (const v of versions) {
      const ok = (st.okByVersion[v] ?? 0) - (base?.okByVersion[v] ?? 0)
      const failed = (st.failByVersion[v] ?? 0) - (base?.failByVersion[v] ?? 0)
      if (ok === 0 && failed === 0) continue
      const e = (byVersion[v] ??= { ok: 0, failed: 0 })
      e.ok += ok
      e.failed += failed
    }
  }
  const services: WindowStats['services'] = {}
  for (const [name, v] of Object.entries(w.services)) {
    const svc = findService(s, name)
    services[name] = { ...v, readyNow: svc && !svc.headless ? readyProgrammed(s, svc.id) : 0 }
  }
  return { id: w.id, label: w.label, t0: w.t, durationS: Math.round((s.t - w.t) * 1e6) / 1e6, totals: withSums(out), usersHit, byVersion, services }
}

/** Request dots to draw at time `at` (default renderTime): only those already sent, with their progress 0..1. */
export function inFlightAt(s: ClusterState, at: number = renderTime(s)): { r: InFlightRequest; progress: number }[] {
  const out: { r: InFlightRequest; progress: number }[] = []
  for (const r of s.inFlight) {
    if (at + 1e-9 < r.t0) continue
    out.push({ r, progress: r.duration <= 0 ? 1 : Math.min(1, (at - r.t0) / r.duration) })
  }
  return out
}

/** Ready endpoints now, the minimum and the seconds with 0 ready endpoints since start / resetTrafficTotals. */
export function serviceStats(s: ClusterState, serviceName: string): { readyNow: number; minReady: number; zeroReadySeconds: number; since: number } | null {
  const v = s.serviceStats[serviceName]
  return v ? { ...v } : null
}
