/**
 * „Tri signala”: one recorded lunch of the flagship model (E6 + E3 + E2), headless and seeded. At 12:00:30 ESO rotates
 * the database password; running Pods keep the old value until Lana's commit (`restartedAt`) rolls them out again.
 * We keep what an observability stack would have kept: RED per 5 s, the access log (with trace ids) and the traces.
 */
import * as G from '../../engines/gitops/index.ts'
import * as K from '../../engines/cluster/index.ts'
import { apiPods, clock, commitFix, createIncident, inject, stepIncident } from './incident/model.ts'
import { outcomeText, routeOf, traceIdOf, traceOfRecord, type TraceView } from './incident/trace.ts'

export const SIGNALS_SEED = 2410
export const FAULT_AT = 30
export const FIX_AT = 72
export const RUN_S = 120
const BUCKET_S = 5

export interface Bucket {
  t0: number
  total: number
  failed: number
  p95: number | null
}

export interface AccessLine {
  t: number
  traceId: string
  ok: boolean
  /** Pod that served it ('' when none did) */
  pod: string
  text: string
  trace: TraceView
}

export interface SignalsRun {
  buckets: Bucket[]
  access: AccessLine[]
  appLogs: { t: number; lines: string[]; pod: string }
  fixSha: string
}

export function runSignals(): SignalsRun {
  const s = createIncident(SIGNALS_SEED)
  s.nextAt = null // only the scripted fault below
  const buckets: Bucket[] = []
  const access: AccessLine[] = []
  let appLogs = { t: 0, lines: [] as string[], pod: '' }
  let fixSha = ''
  let last = 0
  for (let sec = 1; sec <= RUN_S; sec++) {
    stepIncident(s, 1)
    if (sec === FAULT_AT) inject(s, 'stara-lozinka', 'deck')
    if (sec === FIX_AT) {
      const r = commitFix(s, G.FILES.deployment, { [G.PATHS.restartedAt]: `2026-10-02T${clock(sec).padStart(8, '0')}Z` }, 'klopa-api: ponovno pokretanje nakon rotacije lozinke')
      if (r.ok) fixSha = r.sha.slice(0, 7)
    }
    if (sec === FAULT_AT + 12) {
      const pod = apiPods(s).find((p) => K.isReady(p))
      if (pod) appLogs = { t: sec, pod: pod.name, lines: K.kubectlRun(s.k8s, `logs ${pod.name} --tail=4`).lines }
    }
    // the access log: every failed request (≤ 3 per second) and one successful one per second
    let okKept = 0
    let badKept = 0
    for (const r of s.k8s.recent) {
      if (r.t <= last || r.t > s.k8s.t || r.streamId !== 'web') continue
      const ok = r.outcome === 'ok'
      if ((ok && okKept >= 1) || (!ok && badKept >= 3)) continue
      if (ok) okKept += 1
      else badKept += 1
      const pod = r.podId ? s.k8s.pods.find((p) => p.id === r.podId)?.name ?? '' : ''
      const tr = traceOfRecord(s, r)
      const code = outcomeText(r).slice(0, 3)
      const route = routeOf(r)
      access.push({ t: r.t, traceId: traceIdOf(r), ok, pod, trace: tr, text: `${clock(r.t)} ${ok ? 'INFO ' : 'ERROR'} trace_id=${traceIdOf(r).slice(0, 8)} ${route.method} ${route.path} ${code} ${Math.round(tr.totalMs)} ms${pod ? ` Pod …${pod.slice(-5)}` : ''}` })
    }
    last = s.k8s.t
    if (sec % BUCKET_S === 0) {
      const from = s.k8s.t - BUCKET_S
      let total = 0
      let failed = 0
      for (const r of s.k8s.recent) {
        if (r.t <= from || r.streamId !== 'web') continue
        total += 1
        if (r.outcome !== 'ok') failed += 1
      }
      buckets.push({ t0: from, total, failed, p95: s.series.p95.at(-1) ?? null })
    }
  }
  return { buckets, access, appLogs, fixSha }
}
