/**
 * HTTPRoute matching, simplified but true to the Gateway API spec (stanje: listopad 2026.):
 *  1. hostname: rules from routes whose hostname matches the request exactly win over wildcard ones
 *     (`*.klopa.example` matches subdomains only, never `klopa.example` itself). Like the common
 *     Envoy / NGINX implementations, we do not fall back to wildcard rules when an exact host exists.
 *  2. among the rules that match: Exact path > longest PathPrefix (characters) > more header matches > list order.
 *  3. PathPrefix matches whole path segments: `/api` matches `/api` and `/api/x`, never `/apix`.
 *  4. no rule → 404 from the Gateway.
 * Pure TS (no React) – shared by the rule matcher and the flagship simulation.
 */

export type Host = 'klopa.example' | 'admin.klopa.example' | 'www.klopa.example' | 'menza.example'
export type HostMatch = 'klopa.example' | 'admin.klopa.example' | '*.klopa.example'
export type PathType = 'PathPrefix' | 'Exact'

export interface BackendRef {
  svc: string
  weight: number
}

export interface Rule {
  id: number
  host: HostMatch
  pathType: PathType
  path: string
  /** requires the header `x-beta: 1` */
  beta: boolean
  backends: BackendRef[]
}

export interface RouteRequest {
  host: Host
  path: string
  beta: boolean
}

export const HOST_MATCHES: HostMatch[] = ['klopa.example', 'admin.klopa.example', '*.klopa.example']

/** HTTPRoute name for each hostname (one route per hostname, owned by the team of that app). */
export const ROUTE_NAME: Record<HostMatch, string> = {
  'klopa.example': 'klopa',
  'admin.klopa.example': 'klopa-admin',
  '*.klopa.example': 'klopa-ostalo',
}

export function hostMatches(m: HostMatch, h: Host): boolean {
  if (m === h) return true
  return m === '*.klopa.example' && h.endsWith('.klopa.example')
}

export function pathMatches(r: Pick<Rule, 'pathType' | 'path'>, p: string): boolean {
  if (r.pathType === 'Exact') return p === r.path
  if (r.path === '/') return true
  return p === r.path || p.startsWith(r.path + '/')
}

export interface RuleCheck {
  rule: Rule
  /** the rule's route is considered for this host at all */
  hostOk: boolean
  /** rule skipped because a route with the exact hostname exists */
  shadowedByExact: boolean
  pathOk: boolean
  /** null = the rule has no header condition */
  headerOk: boolean | null
  matches: boolean
}

export interface MatchResult {
  rule: Rule | null
  checks: RuleCheck[]
  /** short Croatian reason for the decision */
  why: string
}

function rank(a: Rule, b: Rule, order: Map<number, number>): number {
  if (a.pathType !== b.pathType) return a.pathType === 'Exact' ? -1 : 1
  if (a.pathType === 'PathPrefix' && a.path.length !== b.path.length) return b.path.length - a.path.length
  if (a.beta !== b.beta) return a.beta ? -1 : 1
  return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
}

export function matchRequest(rules: Rule[], req: RouteRequest): MatchResult {
  const order = new Map(rules.map((r, i) => [r.id, i]))
  const exactExists = rules.some((r) => r.host === req.host)
  const checks: RuleCheck[] = rules.map((rule) => {
    const hostMatch = hostMatches(rule.host, req.host)
    const shadowedByExact = hostMatch && exactExists && rule.host !== req.host
    const hostOk = hostMatch && !shadowedByExact
    const pathOk = pathMatches(rule, req.path)
    const headerOk = rule.beta ? req.beta : null
    return { rule, hostOk, shadowedByExact, pathOk, headerOk, matches: hostOk && pathOk && headerOk !== false }
  })
  const cands = checks.filter((c) => c.matches).map((c) => c.rule)
  if (!cands.length) {
    const anyHost = checks.some((c) => c.hostOk)
    return {
      rule: null,
      checks,
      why: anyHost ? 'Za ovu domenu postoje pravila, ali nijedno ne odgovara putanji – Gateway vraća 404.' : 'Nijedan HTTPRoute nema ovu domenu – Gateway vraća 404.',
    }
  }
  const sorted = [...cands].sort((a, b) => rank(a, b, order))
  const win = sorted[0]
  let why: string
  if (sorted.length === 1) why = 'Odgovara samo jedno pravilo.'
  else {
    const second = sorted[1]
    if (win.pathType === 'Exact' && second.pathType !== 'Exact') why = 'Točna putanja (Exact) uvijek pobjeđuje prefiks.'
    else if (win.pathType === 'PathPrefix' && win.path.length !== second.path.length) why = `Dulji prefiks pobjeđuje: ${win.path} je precizniji od ${second.path}.`
    else if (win.beta && !second.beta) why = 'Isti prefiks, ali ovo pravilo ima i podudarno zaglavlje – više uvjeta pobjeđuje.'
    else why = 'Pravila su jednako precizna, pa vrijedi ono koje je ranije na popisu.'
  }
  return { rule: win, checks, why }
}

export function totalWeight(r: Rule): number {
  return r.backends.reduce((s, b) => s + Math.max(0, b.weight), 0)
}

/** Share of the rule's traffic for backend `i` (0..1). */
export function backendShare(r: Rule, i: number): number {
  const t = totalWeight(r)
  return t > 0 ? Math.max(0, r.backends[i]?.weight ?? 0) / t : 0
}

export function describeRule(r: Rule): string {
  const b = r.backends.length > 1 ? r.backends.map((x) => `${x.svc} ${x.weight}`).join(' / ') : r.backends[0]?.svc ?? '?'
  return `${r.host} · ${r.pathType} ${r.path}${r.beta ? ' · x-beta: 1' : ''} → ${b}`
}
