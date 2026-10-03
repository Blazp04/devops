/** What one row of the health-lab stage shows, read from the engine (podView + the kubelet's probe state). */
import { podShapeView, podView, requestStats } from '../../../engines/cluster/index.ts'
import type { ClusterState, Pod, PodShapeStatus, ProbeKind } from '../../../engines/cluster/index.ts'
import { POD_NAMES, isHung, podByName } from './lab.ts'
import type { LabState } from './lab.ts'

export type LaneState = 'off' | 'waiting' | 'active' | 'passed'

export interface LaneView {
  kind: ProbeKind
  label: string
  state: LaneState
  /** newest last; true = ✓ */
  marks: boolean[]
  path: string | null
}

export interface RowView {
  name: string
  /** the Pod object is gone (deleted, or never recreated) */
  gone: boolean
  id: string | null
  ip: string | null
  node: string | null
  nodeUp: boolean
  phase: string
  status: string
  readyColumn: string
  ready: boolean
  restarts: number
  shape: PodShapeStatus
  terminating: boolean
  hung: boolean
  backoff: { kind: 'crash' | 'image'; delayS: number; remainingS: number } | null
  lanes: LaneView[]
}

export const LANE_LABEL: Record<ProbeKind, string> = { startup: 'pokretanje', liveness: 'živost', readiness: 'spremnost' }

function lanesOf(s: ClusterState, p: Pod, slots: number): LaneView[] {
  const v = podView(s, p)
  return v.probes.map((l) => {
    let state: LaneState = 'active'
    if (!l.spec) state = 'off'
    else if (l.kind === 'startup' && p.container.started) state = 'passed'
    else if (l.kind !== 'startup' && p.spec.probes.startup && !p.container.started) state = 'waiting'
    const marks = l.history.slice(-slots).map((r) => r.ok)
    return { kind: l.kind, label: LANE_LABEL[l.kind], state, marks, path: l.spec ? l.spec.path : null }
  })
}

export function rowViews(w: LabState, slots: number): RowView[] {
  const s = w.cl
  return POD_NAMES.map((name) => {
    const p = podByName(s, name)
    if (!p) {
      return { name, gone: true, id: null, ip: null, node: null, nodeUp: true, phase: '–', status: '–', readyColumn: '–', ready: false, restarts: 0, shape: 'terminating', terminating: false, hung: false, backoff: null, lanes: [] }
    }
    const v = podView(s, p)
    const node = s.nodes.find((n) => n.name === p.nodeName)
    return {
      name,
      gone: false,
      id: p.id,
      ip: v.ip,
      node: v.node,
      nodeUp: !node || node.machine === 'running',
      phase: v.phase,
      status: podShapeView(p).label,
      readyColumn: v.readyColumn,
      ready: v.ready,
      restarts: v.restarts,
      // the container was never created: draw the waiting (dashed) lunchbox, not the CrashLoopBackOff one
      shape: /ImagePull|ErrImage/.test(v.status) ? 'pending' : v.shape,
      terminating: v.terminating,
      hung: isHung(s, p),
      backoff: v.backoff,
      lanes: lanesOf(s, p, slots),
    }
  })
}

export function labStats(w: LabState) {
  const r = requestStats(w.cl, 10)
  const conn = r.errors.noEndpoints + r.errors.refused + r.errors.timeout
  return { total: r.total, ok: r.ok, okRate: r.total > 0 ? r.ok / r.total : null, http503: r.errors.http503 + r.errors.http500, conn, noEndpoints: r.errors.noEndpoints, refused: r.errors.refused, timeout: r.errors.timeout }
}
