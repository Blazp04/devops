/** „Kada aplikacija vidi promjenu” (engine preset l16-timeline): lanes and the version each app uses over time. */
import type { AccessState, PodView } from '../../../engines/access/index.ts'
import type { PodTone } from '../../../kit'

export const LANES = [
  { id: 'env', title: 'env' },
  { id: 'volume', title: 'volumen' },
  { id: 'subpath', title: 'subPath' },
] as const

export type LaneId = (typeof LANES)[number]['id']

export interface Segment {
  from: number
  /** null = still running */
  to: number | null
  version: number
}

/** Which password version the app in this lane used, from t = 0 until now (from the engine's rotation marks). */
export function laneSegments(s: AccessState, lane: LaneId): Segment[] {
  const segs: Segment[] = [{ from: 0, to: null, version: 1 }]
  const marks = s.marks.filter((m) => m.workloadId === lane && (m.kind === 'app' || m.kind === 'pod-started')).sort((a, b) => a.t - b.t)
  for (const m of marks) {
    const last = segs[segs.length - 1]
    if (m.version === last.version) continue
    last.to = m.t
    segs.push({ from: m.t, to: null, version: m.version })
  }
  return segs
}

/** Pod tape colour: v1 blue (−41°), newer values green (+41°), a revoked value rose – as in the timeline bars. */
export function podTone(p: PodView): PodTone {
  return p.versionTone === 'violet' ? 'green' : p.versionTone
}
