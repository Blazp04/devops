/**
 * Flagship „Preživite ručak” on the E3 engine (presetAutoscaling = SIM 4 + KEDA klopa-worker). This file only keeps
 * the lecture's bookkeeping next to the engine state: which traffic preset is on, the „nalet” trial the goals are
 * measured on, the KEDA night/wake-up for the third goal and a short log of the reader's own actions.
 */
import {
  QUEUE_DAY,
  TRAFFIC_PRESETS,
  presetAutoscaling,
  stepCluster,
  type ClusterState,
  type TrafficProfile,
} from '../../../engines/cluster'
import type { SimEvent } from '../../../kit'
import { API, SEED } from './story'
import { latency, nodes } from './format'

export type TrafficKey = 'steady' | 'spike' | 'daily' | 'flash'
export type FlagshipPreset = 'start' | 'incident' | 'manual'

export const TRAFFIC_OPTIONS: { value: TrafficKey; label: string; title: string }[] = [
  { value: 'steady', label: 'stalni 20', title: 'stalno 20 zahtjeva/s' },
  { value: 'spike', label: 'nalet 20→100', title: 'Ćevap-petak: 60 s nakon odabira skok na 100 zahtjeva/s, 6 minuta' },
  { value: 'daily', label: 'dnevni val 10–80', title: 'jedan dan sažet u 1200 s (sim)' },
  { value: 'flash', label: 'flash crowd 20→200', title: '60 s nakon odabira skok na 200 zahtjeva/s, 6 minuta' },
]

export const WORKER = 'klopa-worker'

export interface Trial {
  profile: 'spike' | 'flash'
  startT: number
  endT: number
  worstP95: number
  maxNodes: number
  dropped: number
  dropped0: number
  done: boolean
}

export interface FlagshipState {
  c: ClusterState
  preset: FlagshipPreset
  traffic: TrafficKey
  cold: boolean
  /** request the slider last set (so „Vrati CPU request” restores it) */
  requestM: number
  noRequest: boolean
  trial: Trial | null
  results: Trial[]
  workerPrev: number
  workerSleptAt: number | null
  workerWokeAt: number | null
  /** „Davorov posao” (manual preset): replicas raised while the burst was already on / lowered back after it */
  lateRaise: boolean
  loweredAfter: boolean
  ui: SimEvent[]
  uiId: number
}

/**
 * Incident 18: nobody scaled up on the holiday Monday – the HPA may only keep 2 replicas. „manual” is the same
 * cluster without KEDA and without the HPA for „Davorov posao”: the reader plays `kubectl scale`.
 */
export function createFlagship(preset: FlagshipPreset = 'start'): FlagshipState {
  const c = presetAutoscaling({
    seed: SEED,
    profile: TRAFFIC_PRESETS.spike,
    ...(preset === 'manual' ? {} : { keda: true, queueProfile: QUEUE_DAY }),
    ...(preset === 'start' ? {} : { minReplicas: 2, maxReplicas: 2 }),
  })
  // Davor's way: no HPA at all, only `kubectl scale` (scaleDeployment)
  if (preset === 'manual') c.hpas = c.hpas.filter((h) => h.name !== API)
  return {
    c,
    preset,
    traffic: 'spike',
    cold: false,
    requestM: 500,
    noRequest: false,
    trial: null,
    results: [],
    workerPrev: workerReplicas(c),
    workerSleptAt: null,
    workerWokeAt: null,
    lateRaise: false,
    loweredAfter: false,
    ui: [],
    uiId: 0,
  }
}

export function workerReplicas(c: ClusterState): number {
  return c.deployments.find((d) => d.name === WORKER)?.replicas ?? 0
}

export function billedNodes(c: ClusterState): number {
  return c.nodes.filter((n) => n.machine !== 'off').length
}

export function profileOf(key: TrafficKey): TrafficProfile {
  return TRAFFIC_PRESETS[key]
}

export function webStream(c: ClusterState) {
  return c.traffic.find((t) => t.id === 'web') ?? null
}

/** profile time of the web stream (the burst starts at 60 s of profile time) */
export function profileTime(c: ClusterState): number {
  const st = webStream(c)
  return st ? c.t - (st.profileT0 ?? 0) : c.t
}

export function note(st: FlagshipState, text: string, tone: SimEvent['tone'] = 'info'): void {
  st.uiId += 1
  st.ui.push({ t: st.c.t, text, tone, id: `ui${st.uiId}` })
  if (st.ui.length > 20) st.ui.splice(0, st.ui.length - 20)
}

function trackTrial(st: FlagshipState): void {
  const c = st.c
  const web = webStream(c)
  if (!web) return
  const p = web.profile
  if (p.kind !== 'spike' && p.kind !== 'flash') {
    st.trial = null
    return
  }
  const pt = profileTime(c)
  if (!st.trial && pt >= p.startS && pt < p.startS + 1) {
    st.trial = { profile: p.kind, startT: c.t, endT: c.t + (p.endS - p.startS), worstP95: 0, maxNodes: billedNodes(c), dropped: 0, dropped0: web.dropped, done: false }
  }
  const tr = st.trial
  if (!tr) return
  tr.worstP95 = Math.max(tr.worstP95, web.p95Ms)
  tr.maxNodes = Math.max(tr.maxNodes, billedNodes(c))
  tr.dropped = web.dropped - tr.dropped0
  if (pt >= p.endS) {
    tr.done = true
    st.results.push(tr)
    if (st.results.length > 6) st.results.shift()
    st.trial = null
    const ok = tr.worstP95 < 300 && tr.dropped < 0.5
    note(st, `Kraj naleta: najgori p95 ${latency(tr.worstP95)}, najviše ${nodes(tr.maxNodes)}${ok ? '' : ' – cilj nije postignut'}`, ok ? 'ok' : 'warn')
  }
}

function trackWorker(st: FlagshipState): void {
  const w = workerReplicas(st.c)
  if (st.workerPrev > 0 && w === 0) st.workerSleptAt = st.c.t
  if (st.workerPrev === 0 && w > 0 && st.workerSleptAt !== null && st.workerWokeAt === null) st.workerWokeAt = st.c.t
  st.workerPrev = w
}

export function stepFlagship(st: FlagshipState, dt: number): void {
  stepCluster(st.c, dt)
  trackTrial(st)
  trackWorker(st)
}

/** A passed trial: p95 under 300 ms through the whole burst, no request dropped. */
export function trialPassed(t: Trial): boolean {
  return t.done && t.worstP95 < 300 && t.dropped < 0.5
}

export function apiHpaOf(c: ClusterState) {
  return c.hpas.find((h) => h.name === API) ?? null
}

export function kedaHpaOf(c: ClusterState) {
  return c.hpas.find((h) => h.keda) ?? null
}

/** „Davorov posao”: the burst (profile time 60 s) is noon; the wall clock runs 1 s per simulated second. */
export function menzaClock(c: ClusterState): string {
  const total = 11 * 3600 + 59 * 60 + Math.max(0, Math.floor(profileTime(c)))
  const two = (n: number) => String(n).padStart(2, '0')
  return `${Math.floor(total / 3600) % 24}:${two(Math.floor(total / 60) % 60)}:${two(total % 60)}`
}
