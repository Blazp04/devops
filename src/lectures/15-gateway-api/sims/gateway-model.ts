/**
 * „Gradska vrata” – the flagship model (pure TS, seeded).
 *
 * A mixed request stream (klopa.example/, /api/…, admin.klopa.example, header x-beta: 1) arrives at λ = 6/s.
 * - mode 'lb': three LoadBalancer Services. DNS sends a host to "its" L4 load balancer, which cannot see the path;
 *   kube-proxy then picks a Pod at random (per connection – here every student has their own connection).
 * - mode 'gw': one cloud L4 LB → the Gateway (L7). TLS is terminated at the HTTPS listener (certificateRefs → a
 *   kubernetes.io/tls Secret in the same namespace); HTTPRoute rules pick a rule (see routing.ts), the rule picks a
 *   backend Service with probability weight/Σweights for every request, and the Gateway reads that Service's
 *   EndpointSlice (ready endpoints only) and sends the request straight to a Pod IP with least request
 *   (ovisi o implementaciji). ClusterIP / kube-proxy is not on this path.
 * - backendRef to a missing Service → route condition ResolvedRefs=False, matching requests get HTTP 500.
 * - invalid certificate Secret → the HTTPS listener is not programmed, every TLS handshake fails.
 * Two RNG streams: arrivals (seed) and decisions (seed + 1), so the request stream never depends on the config.
 */
import { createRng, type Rng } from '../../../kit/sim/math.ts'
import { backendShare, matchRequest, totalWeight, type Host, type HostMatch, type PathType, type Rule } from './routing.ts'

export const SEED = 15
export const LAMBDA = 6
/** course assumption for a cloud L4 load balancer (real prices depend on the provider) */
export const LB_PRICE = 18
export const T_IN = 0.6
export const T_OUT = 1.6
export const T_SERVE = 0.45
export const T_FAIL = 0.95
export const WINDOW = 20
export const INCIDENT_SECONDS = 60

export type Mode = 'lb' | 'gw'
export type App = 'web' | 'api' | 'admin'
export type SvcName = 'klopa-web' | 'klopa-api' | 'klopa-api-141' | 'klopa-admin'
export type SecretRef = 'klopa-tls' | 'klopa-db' | 'klopa-staging/klopa-tls'
export type Outcome = 'ok' | 'app404' | 'gw404' | 'gw500' | 'tls' | 'leak'
export type Phase = 'in' | 'out' | 'serve' | 'fail'

export interface ServiceDef {
  name: SvcName
  app: App
  /** version tape on the Pods */
  label: string
  tone: 'amber' | 'violet' | 'teal' | 'green'
  clusterIP: string
  pods: string[]
}

export const SERVICES: ServiceDef[] = [
  { name: 'klopa-web', app: 'web', label: 'web', tone: 'amber', clusterIP: '10.96.40.11', pods: ['10.244.1.7', '10.244.2.4'] },
  { name: 'klopa-api', app: 'api', label: '1.4.0', tone: 'violet', clusterIP: '10.96.12.7', pods: ['10.244.1.12', '10.244.2.15', '10.244.3.9'] },
  { name: 'klopa-api-141', app: 'api', label: '1.4.1', tone: 'teal', clusterIP: '10.96.12.41', pods: ['10.244.3.21'] },
  { name: 'klopa-admin', app: 'admin', label: 'admin', tone: 'green', clusterIP: '10.96.7.30', pods: ['10.244.2.30'] },
]
export const SVC_NAMES = SERVICES.map((s) => s.name)
export const svcByName = (n: string) => SERVICES.find((s) => s.name === n)

/** LoadBalancer Services in mode 'lb' (one public IP each); the api one has no domain the frontend calls. */
export const LB_TARGETS: { svc: SvcName; ip: string; host: string | null }[] = [
  { svc: 'klopa-web', ip: '203.0.113.10', host: 'klopa.example' },
  { svc: 'klopa-api', ip: '203.0.113.11', host: null },
  { svc: 'klopa-admin', ip: '203.0.113.12', host: 'admin.klopa.example' },
]
export const GW_IP = '203.0.113.25'

export const SECRETS: { ref: SecretRef; label: string; valid: boolean; reason: string }[] = [
  { ref: 'klopa-tls', label: 'klopa-tls (kubernetes.io/tls)', valid: true, reason: 'Programmed' },
  { ref: 'klopa-db', label: 'klopa-db (Opaque – lozinka baze)', valid: false, reason: 'InvalidCertificateRef' },
  { ref: 'klopa-staging/klopa-tls', label: 'klopa-staging/klopa-tls (drugi Namespace)', valid: false, reason: 'RefNotPermitted' },
]
export const secretValid = (s: SecretRef) => SECRETS.find((x) => x.ref === s)?.valid ?? false
export const secretReason = (s: SecretRef) => SECRETS.find((x) => x.ref === s)?.reason ?? ''

export interface Config {
  mode: Mode
  rules: Rule[]
  https: boolean
  secret: SecretRef
}

export interface Req {
  id: number
  host: Host
  path: string
  beta: boolean
  app: App
  born: number
  phase: Phase
  /** time spent in the current phase */
  pt: number
  tls: boolean
  /** mode 'lb': index into LB_TARGETS chosen by DNS */
  lb: number
  ruleId: number | null
  svc: string | null
  pod: number
  outcome: Outcome | null
  /** where a failed request falls: at the listener (TLS) or after the routing decision */
  failAt: 'entry' | 'exit' | null
}

export interface Done {
  t: number
  outcome: Outcome
  host: Host
  api: boolean
  beta: boolean
  svc: string | null
  tls: boolean
}

export interface LogLine {
  id: number
  t: number
  text: string
  tone: 'ok' | 'warn' | 'bad' | 'info' | 'neutral'
}

export interface Access {
  id: number
  t: number
  host: Host
  path: string
  beta: boolean
  tls: boolean
  route: string
  svc: string | null
  pod: string | null
  code: number
  outcome: Outcome
}

interface Streak {
  since: number
  n: number
  done: boolean
}

export interface GwState {
  t: number
  seed: number
  cfg: Config
  arr: Rng
  dec: Rng
  nextAt: number
  nextId: number
  reqs: Req[]
  done: Done[]
  /** completed since the run started (for the incident numbers) */
  total: Record<Outcome, number>
  /** first INCIDENT_SECONDS of the run */
  first: Record<Outcome, number>
  inflight: Record<string, number[]>
  /** rule id → sim time of the last hit */
  lastHit: Record<number, number>
  /** rule id → hits in the window */
  hits: Record<number, number[]>
  events: LogLine[]
  eventId: number
  access: Access[]
  lastWarn: Record<string, number>
  goals: { g1: Streak; g2: Streak; g3: Streak; g4: Streak; g5: Streak }
  /** ordinary /api requests served by the split rule since it last changed (key = the rule's backends) */
  split: { key: string; n: number; canary: number }
}

const zero = (): Record<Outcome, number> => ({ ok: 0, app404: 0, gw404: 0, gw500: 0, tls: 0, leak: 0 })
const streak = (): Streak => ({ since: 0, n: 0, done: false })

export const START_RULES = (): Rule[] => [{ id: 1, host: 'klopa.example', pathType: 'PathPrefix', path: '/', beta: false, backends: [{ svc: 'klopa-web', weight: 1 }] }]

export const PRESET_INCIDENT: Config = { mode: 'lb', rules: START_RULES(), https: false, secret: 'klopa-tls' }

export function createGw(cfg: Config, seed = SEED): GwState {
  const arr = createRng(seed)
  const s: GwState = {
    t: 0,
    seed,
    cfg: { ...cfg, rules: cfg.rules.map((r) => ({ ...r, backends: r.backends.map((b) => ({ ...b })) })) },
    arr,
    dec: createRng(seed + 1),
    nextAt: arr.exp(LAMBDA),
    nextId: 1,
    reqs: [],
    done: [],
    total: zero(),
    first: zero(),
    inflight: Object.fromEntries(SERVICES.map((v) => [v.name, v.pods.map(() => 0)])),
    lastHit: {},
    hits: {},
    events: [],
    eventId: 1,
    access: [],
    lastWarn: {},
    goals: { g1: streak(), g2: streak(), g3: streak(), g4: streak(), g5: streak() },
    split: { key: '', n: 0, canary: 0 },
  }
  log(s, cfg.mode === 'lb' ? 'Tri LoadBalancer Servicea: tri javne adrese, DNS šalje svaku domenu na svoju.' : 'Gateway klopa-gw prima sav promet izvana.', 'info')
  return s
}

export function log(s: GwState, text: string, tone: LogLine['tone'] = 'info') {
  s.events.push({ id: s.eventId++, t: s.t, text, tone })
  if (s.events.length > 20) s.events.splice(0, s.events.length - 20)
}

function warnOnce(s: GwState, key: string, text: string, tone: LogLine['tone'] = 'bad', every = 4) {
  if (s.t - (s.lastWarn[key] ?? -99) < every) return
  s.lastWarn[key] = s.t
  log(s, text, tone)
}

const WEB_PATHS = ['/', '/jelovnik', '/kosarica', '/assets/app.js']
const API_PATHS = ['/api/jelovnik', '/api/narudzbe', '/api/kosarica']
const ADMIN_PATHS = ['/', '/jelovnik/uredi', '/api/izvjestaj']

function spawn(s: GwState) {
  const r = s.arr
  const p = r.next()
  let host: Host = 'klopa.example'
  let path: string
  let app: App
  let beta = false
  if (p < 0.45) {
    app = 'web'
    path = r.pick(WEB_PATHS)
  } else if (p < 0.9) {
    app = 'api'
    path = r.pick(API_PATHS)
    beta = p >= 0.83
  } else {
    app = 'admin'
    host = 'admin.klopa.example'
    path = r.pick(ADMIN_PATHS)
  }
  const lb = host === 'admin.klopa.example' ? 2 : 0
  const tls = s.cfg.mode === 'gw' && s.cfg.https
  s.reqs.push({ id: s.nextId++, host, path, beta, app, born: s.t, phase: 'in', pt: 0, tls, lb, ruleId: null, svc: null, pod: 0, outcome: null, failAt: null })
}

/** What the app behind a Service answers for this request. */
export function respond(svc: string, host: Host, path: string): Outcome {
  const def = svcByName(svc)
  if (!def) return 'gw500'
  if (def.app === 'admin') return host === 'admin.klopa.example' ? 'ok' : 'leak'
  if (host === 'admin.klopa.example') return 'app404'
  const isApi = path === '/api' || path.startsWith('/api/')
  if (def.app === 'api') return isApi ? 'ok' : 'app404'
  return isApi ? 'app404' : 'ok'
}

function pickPod(s: GwState, svc: string, leastRequest: boolean): number {
  const fl = s.inflight[svc]
  if (!leastRequest) return Math.floor(s.dec.next() * fl.length)
  const min = Math.min(...fl)
  const tied = fl.map((v, i) => (v === min ? i : -1)).filter((i) => i >= 0)
  return tied[Math.floor(s.dec.next() * tied.length)]
}

const CODE: Record<Outcome, number> = { ok: 200, leak: 200, app404: 404, gw404: 404, gw500: 500, tls: 0 }

function access(s: GwState, q: Req, route: string) {
  const def = q.svc ? svcByName(q.svc) : undefined
  s.access.unshift({
    id: q.id,
    t: s.t,
    host: q.host,
    path: q.path,
    beta: q.beta,
    tls: q.tls,
    route,
    svc: q.svc,
    pod: def && q.outcome !== 'gw500' ? def.pods[q.pod] : null,
    code: CODE[q.outcome ?? 'ok'],
    outcome: q.outcome ?? 'ok',
  })
  if (s.access.length > 8) s.access.length = 8
}

export function ruleLabel(rules: Rule[], id: number | null): string {
  const r = rules.find((x) => x.id === id)
  if (!r) return '–'
  const same = rules.filter((x) => x.host === r.host)
  return `${routeNameOf(r.host)} #${same.indexOf(r) + 1}`
}

export function routeNameOf(h: HostMatch): string {
  return h === 'klopa.example' ? 'klopa' : h === 'admin.klopa.example' ? 'klopa-admin' : 'klopa-ostalo'
}

/** Decide at the load balancer (mode lb) or at the Gateway (mode gw). */
function decide(s: GwState, q: Req) {
  const c = s.cfg
  if (c.mode === 'lb') {
    q.svc = LB_TARGETS[q.lb].svc
    q.pod = pickPod(s, q.svc, false)
    q.outcome = respond(q.svc, q.host, q.path)
    s.inflight[q.svc][q.pod]++
    q.phase = 'out'
    q.pt = 0
    access(s, q, `LB ${LB_TARGETS[q.lb].ip}`)
    if (q.outcome === 'app404') warnOnce(s, 'lb404', `${q.host}${q.path} → klopa-web: 404. L4 load balancer ne vidi putanju.`)
    return
  }
  if (q.tls && !secretValid(c.secret)) {
    q.outcome = 'tls'
    q.phase = 'fail'
    q.failAt = 'entry'
    q.pt = 0
    access(s, q, ':443')
    warnOnce(s, 'tls', `TLS rukovanje ne uspijeva: slušatelj https nije programiran (${secretReason(c.secret)}).`, 'bad', 10)
    return
  }
  const m = matchRequest(c.rules, q)
  if (!m.rule) {
    q.outcome = 'gw404'
    q.phase = 'fail'
    q.failAt = 'exit'
    q.pt = 0
    access(s, q, 'nema pravila')
    warnOnce(s, `404-${q.host}`, `${q.host}${q.path}: nijedno pravilo ne odgovara – Gateway vraća 404.`)
    return
  }
  const rule = m.rule
  q.ruleId = rule.id
  s.lastHit[rule.id] = s.t
  ;(s.hits[rule.id] ??= []).push(s.t)
  const tw = totalWeight(rule)
  let backend = rule.backends[0]?.svc ?? ''
  if (tw > 0) {
    let x = s.dec.next() * tw
    for (const b of rule.backends) {
      x -= Math.max(0, b.weight)
      if (x < 0) {
        backend = b.svc
        break
      }
    }
  }
  q.svc = backend
  const label = ruleLabel(c.rules, rule.id)
  if (tw <= 0 || !svcByName(backend)) {
    q.outcome = 'gw500'
    q.phase = 'fail'
    q.failAt = 'exit'
    q.pt = 0
    access(s, q, label)
    warnOnce(s, `500-${rule.id}`, tw <= 0 ? `${label}: sve težine su 0 – Gateway vraća 500.` : `${label}: Service ${backend} ne postoji (ResolvedRefs=False) – Gateway vraća 500.`)
    return
  }
  q.pod = pickPod(s, backend, true)
  q.outcome = respond(backend, q.host, q.path)
  s.inflight[backend][q.pod]++
  q.phase = 'out'
  q.pt = 0
  access(s, q, label)
  if (q.outcome === 'app404') warnOnce(s, `app404-${backend}`, `${q.host}${q.path} → ${backend}: aplikacija ne zna tu putanju (404). Pravilo ${label} ga je poslalo krivo.`)
  if (q.outcome === 'leak') warnOnce(s, 'leak', `${q.host}${q.path} → klopa-admin: administracija je otvorena na javnoj domeni!`, 'warn')
}

function finish(s: GwState, q: Req) {
  const o = q.outcome ?? 'ok'
  s.total[o]++
  if (q.born < INCIDENT_SECONDS) s.first[o]++
  s.done.push({ t: s.t, outcome: o, host: q.host, api: q.app === 'api', beta: q.beta, svc: q.svc, tls: q.tls })
  updateGoals(s, q, o)
}

function bump(g: Streak, ok: boolean, t: number) {
  if (g.done) return
  if (!ok) {
    g.since = t
    g.n = 0
  } else g.n++
}

/** Identity of the rule that ordinary /api traffic hits, with its backends and weights ('' when there is none). */
export function splitKey(c: Config): string {
  if (c.mode !== 'gw') return ''
  const m = matchRequest(c.rules, { host: 'klopa.example', path: '/api/jelovnik', beta: false })
  return m.rule ? `${m.rule.id}:${m.rule.backends.map((b) => `${b.svc}=${b.weight}`).join(',')}` : ''
}

/** The share of ordinary /api traffic the config sends to 1.4.1 (null when the /api rule does not split). */
export function canaryShare(c: Config): number | null {
  const m = matchRequest(c.rules, { host: 'klopa.example', path: '/api/jelovnik', beta: false })
  if (!m.rule) return null
  const r = m.rule
  const iStable = r.backends.findIndex((b) => b.svc === 'klopa-api')
  const iCanary = r.backends.findIndex((b) => b.svc === 'klopa-api-141')
  if (iStable < 0 || iCanary < 0 || r.backends.some((b) => !svcByName(b.svc))) return null
  return backendShare(r, iCanary)
}

function updateGoals(s: GwState, q: Req, o: Outcome) {
  const g = s.goals
  const gw = s.cfg.mode === 'gw'
  if (q.host === 'klopa.example') {
    const want = q.app === 'api' ? ['klopa-api', 'klopa-api-141'] : ['klopa-web']
    bump(g.g1, gw && o === 'ok' && want.includes(q.svc ?? ''), s.t)
    if (o === 'leak') bump(g.g2, false, s.t)
  }
  if (q.host === 'admin.klopa.example') bump(g.g2, gw && o === 'ok' && q.svc === 'klopa-admin', s.t)
  if (q.app === 'api' && !q.beta && o === 'ok' && (q.svc === 'klopa-api' || q.svc === 'klopa-api-141')) {
    const key = splitKey(s.cfg)
    if (key !== s.split.key) s.split = { key, n: 0, canary: 0 }
    s.split.n++
    if (q.svc === 'klopa-api-141') s.split.canary++
  }
  if (q.app === 'api' && !q.beta) {
    const share = canaryShare(s.cfg)
    bump(g.g3, gw && o === 'ok' && share !== null && Math.abs(share - 0.1) < 1e-9, s.t)
  }
  bump(g.g4, gw && q.tls && o !== 'tls', s.t)
  if (q.beta) bump(g.g5, gw && o === 'ok' && q.svc === 'klopa-api-141', s.t)
  const check = (k: keyof GwState['goals'], minN: number, minT: number, text: string) => {
    const x = g[k]
    if (!x.done && x.n >= minN && s.t - x.since >= minT) {
      x.done = true
      log(s, `Zadatak ispunjen: ${text}`, 'ok')
    }
  }
  check('g1', 40, 10, '/api → klopa-api, ostalo → klopa-web.')
  check('g2', 6, 10, 'admin.klopa.example samo na klopa-admin.')
  check('g3', 20, 4, '10 % /api prometa na 1.4.1.')
  check('g4', 30, 5, 'HTTPS radi.')
  check('g5', 6, 10, 'beta testeri uvijek na 1.4.1.')
}

export function stepGw(s: GwState, dt: number) {
  s.t += dt
  while (s.nextAt <= s.t) {
    spawn(s)
    s.nextAt += s.arr.exp(LAMBDA)
  }
  for (const q of s.reqs) {
    q.pt += dt
    if (q.phase === 'in' && q.pt >= T_IN) decide(s, q)
    else if (q.phase === 'out' && q.pt >= T_OUT) {
      q.phase = 'serve'
      q.pt = 0
    } else if (q.phase === 'serve' && q.pt >= T_SERVE) {
      if (q.svc && s.inflight[q.svc]) s.inflight[q.svc][q.pod] = Math.max(0, s.inflight[q.svc][q.pod] - 1)
      finish(s, q)
      q.pt = -1
    } else if (q.phase === 'fail' && q.pt >= T_FAIL) {
      finish(s, q)
      q.pt = -1
    }
  }
  s.reqs = s.reqs.filter((q) => q.pt >= 0)
  if (s.reqs.length > 160) s.reqs.splice(0, s.reqs.length - 160)
  const cut = s.t - WINDOW
  if (s.done.length && s.done[0].t < cut) s.done = s.done.filter((d) => d.t >= cut)
  for (const k of Object.keys(s.hits)) {
    const arr = s.hits[+k]
    while (arr.length && arr[0] < cut) arr.shift()
  }
}

export interface GwMetrics {
  rate: number
  n: number
  ok: number
  err404: number
  err500: number
  tls: number
  leak: number
  canaryObserved: number | null
  apiServed: number
  /** since the split rule last changed: share to 1.4.1 (null below 20 requests) and count */
  canaryCum: number | null
  cumN: number
}

export function gwMetrics(s: GwState): GwMetrics {
  const span = Math.min(WINDOW, Math.max(1, s.t))
  const d = s.done
  const c = (o: Outcome[]) => d.filter((x) => o.includes(x.outcome)).length
  const api = d.filter((x) => x.api && !x.beta && x.outcome === 'ok' && (x.svc === 'klopa-api' || x.svc === 'klopa-api-141'))
  return {
    rate: d.length / span,
    n: d.length,
    ok: c(['ok']),
    err404: c(['app404', 'gw404']),
    err500: c(['gw500']),
    tls: c(['tls']),
    leak: c(['leak']),
    canaryObserved: api.length >= 10 ? api.filter((x) => x.svc === 'klopa-api-141').length / api.length : null,
    apiServed: api.length,
    ...cum(s),
  }
}

function cum(s: GwState): { canaryCum: number | null; cumN: number } {
  const fresh = s.split.key !== '' && s.split.key === splitKey(s.cfg)
  const n = fresh ? s.split.n : 0
  return { canaryCum: n >= 20 ? s.split.canary / n : null, cumN: n }
}

/** Public addresses and monthly LB bill for the current mode. */
export function entryCost(mode: Mode) {
  const lbs = mode === 'lb' ? LB_TARGETS.length : 1
  return { ips: lbs, eur: lbs * LB_PRICE, certs: mode === 'lb' ? LB_TARGETS.length : 1 }
}

/** Headless run (used to check the incident card numbers). */
export function runHeadless(cfg: Config, seconds: number, seed = SEED) {
  const s = createGw(cfg, seed)
  const dt = 1 / 60
  for (let i = 0; i < seconds / dt; i++) stepGw(s, dt)
  return s
}

export const PATH_CHOICES: string[] = ['/', '/api', '/api/narudzbe', '/jelovnik']
export const PATH_TYPES: PathType[] = ['PathPrefix', 'Exact']
