/**
 * Scene 4 „Kaskada”: the same 60 s database outage replayed with three probe designs on the E3 engine
 * (presetPodHealth, behaviour „ovisi o bazi”, seed 42). Pure TS – the figure only draws these samples.
 */
import { advance, getProxyEndpoints, presetPodHealth, probe, setDatabase, trafficTotals } from '../../../engines/cluster/index.ts'
import type { ClusterState } from '../../../engines/cluster/index.ts'

export type CascadeDesign = 'liveDb' | 'readyDb' | 'correct'

export const CASCADE_DESIGNS: { id: CascadeDesign; label: string; liveness: '/healthz' | '/ready-db'; readiness: '/ready' | '/ready-db' }[] = [
  { id: 'liveDb', label: 'živost pita bazu', liveness: '/ready-db', readiness: '/ready' },
  { id: 'readyDb', label: 'spremnost pita bazu', liveness: '/healthz', readiness: '/ready-db' },
  { id: 'correct', label: 'ispravno', liveness: '/healthz', readiness: '/ready' },
]

/** seconds of the replay; the database is down in [DB_DOWN_AT, DB_DOWN_AT + DB_DOWN_S) */
export const CASCADE_LENGTH_S = 130
export const DB_DOWN_AT = 15
export const DB_DOWN_S = 60
export const CASCADE_SEED = 42

export type PodLaneState = 'ready' | 'notready' | 'down'

export interface CascadeSample {
  t: number
  dbUp: boolean
  pods: { state: PodLaneState; restarts: number }[]
  endpoints: number
  ok: number
  http503: number
  /** connection refused / no endpoints / timeouts: the client gets no HTTP answer at all */
  conn: number
}

export interface CascadeRun {
  design: CascadeDesign
  samples: CascadeSample[]
  restarts: number
  zeroEndpointS: number
  failed: number
  http503: number
  conn: number
  /** seconds after the database came back until all three Pods were Ready again */
  recoveryS: number | null
}

function podState(s: ClusterState, i: number): { state: PodLaneState; restarts: number } {
  const p = s.pods.find((x) => x.name === `klopa-api-${i + 1}`)
  if (!p) return { state: 'down', restarts: 0 }
  const state: PodLaneState = p.ready.status ? 'ready' : p.processUp ? 'notready' : 'down'
  return { state, restarts: p.container.restartCount }
}

export function runCascade(design: CascadeDesign): CascadeRun {
  const d = CASCADE_DESIGNS.find((x) => x.id === design)!
  const s = presetPodHealth({ seed: CASCADE_SEED, behaviour: 'dependsOnDb', warm: true, probes: { liveness: probe(d.liveness), readiness: probe(d.readiness) } })
  const samples: CascadeSample[] = []
  let prev = trafficTotals(s)
  let recoveryS: number | null = null
  for (let t = 0; t <= CASCADE_LENGTH_S; t++) {
    if (t === DB_DOWN_AT) setDatabase(s, false, DB_DOWN_S)
    if (t > 0) advance(s, 1)
    const tot = trafficTotals(s)
    const pods = [0, 1, 2].map((i) => podState(s, i))
    const sample: CascadeSample = {
      t,
      dbUp: s.db.up,
      pods,
      endpoints: getProxyEndpoints(s, 'klopa-api').length,
      ok: tot.ok - prev.ok,
      http503: tot.http503 - prev.http503,
      conn: tot.noEndpoints - prev.noEndpoints + (tot.refused - prev.refused) + (tot.timeout - prev.timeout),
    }
    samples.push(sample)
    if (recoveryS === null && t >= DB_DOWN_AT + DB_DOWN_S && pods.every((p) => p.state === 'ready')) recoveryS = t - (DB_DOWN_AT + DB_DOWN_S)
    prev = tot
  }
  const last = samples[samples.length - 1]
  const window = samples.filter((x) => x.t > DB_DOWN_AT)
  return {
    design,
    samples,
    restarts: last.pods.reduce((a, p) => a + p.restarts, 0),
    zeroEndpointS: window.filter((x) => x.endpoints === 0).length,
    failed: window.reduce((a, x) => a + x.http503 + x.conn, 0),
    http503: window.reduce((a, x) => a + x.http503, 0),
    conn: window.reduce((a, x) => a + x.conn, 0),
    recoveryS,
  }
}
