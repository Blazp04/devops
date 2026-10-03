/**
 * Scene 5 adapter over E1 (src/engines/traffic): the L04 rack (or 7 equal Pods on the same three machines) behind a
 * classic load balancer or a Kubernetes Service. The model (random ready backend per new connection, no weights,
 * ClientIP affinity behind NAT) is the engine's; this file only builds the configurations and remembers goals.
 */
import type { SimEvent } from '../../kit'
import { configure, createTraffic, defaultRack, hitShares, mark, podSet, resetHits, since, stepTraffic, type Mark, type ServerSpec, type TrafficState } from '../../engines/traffic'

export type RackKind = 'l04' | 'pods'
export type FrontKind = 'lb' | 'service'

export interface Machine {
  key: 'mali' | 'srednji' | 'veliki'
  name: string
  spec: string
}

export const MACHINES: Machine[] = [
  { key: 'mali', name: 'Mali', spec: '1 vCPU · 2 GB' },
  { key: 'srednji', name: 'Srednji', spec: '2 vCPU · 4 GB' },
  { key: 'veliki', name: 'Veliki', spec: '4 vCPU · 8 GB' },
]

/** 7 equal Pods (1 vCPU / 2 GB each): one fits on Mali, two on Srednji, four on Veliki. */
export function podRack(): ServerSpec[] {
  const per: Machine['key'][] = ['mali', 'srednji', 'srednji', 'veliki', 'veliki', 'veliki', 'veliki']
  return podSet(7, 1, 2).map((p, i) => ({ ...p, meta: { labels: { node: per[i] } } }))
}

/** Which machine a backend runs on (rack: the server is the machine; Pods: from meta). */
export function machineOf(id: string, rack: RackKind, meta: { labels?: Record<string, string> } | undefined): Machine['key'] {
  if (rack === 'pods') return (meta?.labels?.node as Machine['key']) ?? 'mali'
  return id === 's1' ? 'mali' : id === 's2' ? 'srednji' : 'veliki'
}

export interface RackParams {
  rack: RackKind
  front: FrontKind
  lambda: number
  nat: boolean
}

export interface RackSim {
  p: RackParams
  t: TrafficState
  /** seconds of comparable traffic seen per front (L04 rack, λ = 15) and where that run started */
  secsLb: number
  secsSvc: number
  /** error rate over the whole comparable run (engine `since(mark)`), once it is ≥ 20 s long */
  errLb: number | null
  errSvc: number | null
  runMark: Mark
  /** 7 Pods behind the Service: share of Veliki */
  bigShare: number | null
  secsPods: number
  natDone: boolean
  secsNat: number
}

function build(p: RackParams): TrafficState {
  return createTraffic({
    seed: 42,
    mode: p.front,
    servers: p.rack === 'l04' ? defaultRack() : podRack(),
    workload: 'api',
    lambda: p.lambda,
    algo: 'lc',
    clients: { nat: p.nat },
    service: { sessionAffinity: p.nat ? 'ClientIP' : 'None' },
  })
}

export function createRackSim(p: RackParams): RackSim {
  const t = build(p)
  return { p, t, secsLb: 0, secsSvc: 0, errLb: null, errSvc: null, runMark: mark(t), bigShare: null, secsPods: 0, natDone: false, secsNat: 0 }
}

/** New rack (another set of backends): a fresh engine state, goal progress kept. */
export function setRack(st: RackSim, rack: RackKind): void {
  st.p = { ...st.p, rack }
  st.t = build(st.p)
  st.runMark = mark(st.t)
  st.secsPods = 0
  st.secsNat = 0
}

/** Front / λ / NAT change at run time (configure is a no-op for unchanged values); the hit histogram restarts. */
export function setParams(st: RackSim, patch: Partial<Omit<RackParams, 'rack'>>): void {
  st.p = { ...st.p, ...patch }
  configure(st.t, { mode: st.p.front, lambda: st.p.lambda, clients: { nat: st.p.nat }, service: { sessionAffinity: st.p.nat ? 'ClientIP' : 'None' } })
  resetHits(st.t)
  st.secsPods = 0
  st.secsNat = 0
  if (patch.front !== undefined || patch.lambda !== undefined || patch.nat !== undefined) {
    if (st.p.front === 'lb') st.secsLb = 0
    else st.secsSvc = 0
    st.runMark = mark(st.t)
  }
}

export function machineShares(st: RackSim): Record<Machine['key'], number> {
  const out = { mali: 0, srednji: 0, veliki: 0 }
  for (const h of hitShares(st.t)) {
    const v = st.t.servers.find((x) => x.id === h.id)
    out[machineOf(h.id, st.p.rack, v?.meta)] += h.share
  }
  return out
}

export function stepRackSim(st: RackSim, dt: number): void {
  stepTraffic(st.t, dt)
  const d = Math.min(dt, 0.25)
  const comparable = st.p.rack === 'l04' && st.p.lambda === 15 && !st.p.nat
  if (comparable && st.p.front === 'lb') {
    st.secsLb += d
    if (st.secsLb >= 20) st.errLb = since(st.t, st.runMark).errorRate
  }
  if (comparable && st.p.front === 'service') {
    st.secsSvc += d
    if (st.secsSvc >= 20) st.errSvc = since(st.t, st.runMark).errorRate
  }
  if (st.p.rack === 'pods' && st.p.front === 'service' && !st.p.nat) {
    st.secsPods += d
    if (st.secsPods >= 15) st.bigShare = machineShares(st).veliki
  }
  if (st.p.front === 'service' && st.p.nat) {
    st.secsNat += d
    const max = Math.max(...hitShares(st.t).map((h) => h.share))
    if (st.secsNat >= 10 && max >= 0.95) st.natDone = true
  }
}

export function rackEvents(st: RackSim): SimEvent[] {
  return st.t.events.map((e) => ({ id: e.id, t: e.t, text: e.text, tone: e.tone }))
}
