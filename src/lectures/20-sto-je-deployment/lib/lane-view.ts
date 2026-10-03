/**
 * Geometry of one release lane drawing (router → two rows of lunchbox Pods: the stable version on top, the new
 * version below). Pure functions over the engine state, shared by the flagship and the smaller labs.
 */
import { findService, inFlightAt, podShapeView, versionToneFor, type ClusterState, type Pod } from '../../../engines/cluster'
import type { PodStatus, PodTone } from '../../../kit'

export type LaneLayout = 'wide' | 'narrow'
export type RouterKind = 'service' | 'selector' | 'gateway'

export interface LaneGeom {
  w: number
  h: number
  /** router box (left) */
  rx: number
  ry: number
  rw: number
  rh: number
  /** where requests leave the router */
  outX: number
  outY: number
  /** row labels (version + what the router does with the row): row 0 above the router, row 1 below it */
  labels: [[number, number], [number, number]]
  rowY: [number, number]
  slotX0: number
  slotDx: number
  slots: number
  pod: number
  font: number
}

export const GEOM: Record<LaneLayout, LaneGeom> = {
  wide: { w: 516, h: 114, rx: 6, ry: 24, rw: 132, rh: 62, outX: 140, outY: 55, labels: [[8, 16], [8, 105]], rowY: [30, 84], slotX0: 254, slotDx: 54, slots: 5, pod: 30, font: 13 },
  narrow: { w: 312, h: 124, rx: 2, ry: 30, rw: 92, rh: 62, outX: 96, outY: 61, labels: [[4, 21], [4, 112]], rowY: [34, 92], slotX0: 160, slotDx: 34, slots: 5, pod: 24, font: 12.5 },
}

export interface PodSpot {
  pod: Pod
  x: number
  y: number
  row: 0 | 1
  status: PodStatus
  caption: string
  tone: PodTone
  /** a ready endpoint (only ready Pods get traffic; Pending, starting and terminating Pods do not) */
  ready: boolean
  /** selected by the router right now and ready (receives new connections / requests) */
  routed: boolean
}

/** Version tint of a row: blue-green names its tracks, so the new track is drawn green (v2 tape) there. */
export function rowTone(s: ClusterState, version: string, row: number, router: RouterKind): PodTone {
  return router === 'selector' && row === 1 ? 'green' : (versionToneFor(s, version) as PodTone)
}

export function toneVar(t: PodTone): string {
  return t === 'blue' ? 'var(--pen)' : `var(--${t})`
}

function byAge(a: Pod, b: Pod): number {
  return a.createdAt - b.createdAt || (a.name < b.name ? -1 : 1)
}

/** Which rows the router sends new traffic to (for the blue-green selector / gateway weights). */
export function routedRows(s: ClusterState, router: RouterKind): [boolean, boolean] {
  if (router === 'selector') {
    const track = findService(s, 'klopa-api')?.selector.track
    return [track !== 'green', track === 'green']
  }
  if (router === 'gateway') {
    const routes = s.traffic[0]?.routes ?? []
    const w = (name: string) => routes.find((r) => r.serviceName === name)?.weight ?? 0
    return [w('klopa-api-stable') > 0, w('klopa-api-canary') > 0]
  }
  return [true, true]
}

export function podSpots(s: ClusterState, layout: LaneLayout, router: RouterKind): PodSpot[] {
  const g = GEOM[layout]
  const rel = s.release
  const stable = rel?.stableVersion ?? '1.4.1'
  const routed = routedRows(s, router)
  const rows: [Pod[], Pod[]] = [[], []]
  for (const p of s.pods) {
    if (p.labels.app !== 'klopa-api') continue
    rows[p.spec.app.version === stable ? 0 : 1].push(p)
  }
  const out: PodSpot[] = []
  rows.forEach((list, row) => {
    list.sort(byAge)
    list.slice(0, g.slots).forEach((p, i) => {
      const v = podShapeView(p)
      const ready = v.status === 'running'
      out.push({
        pod: p,
        x: g.slotX0 + i * g.slotDx,
        y: g.rowY[row],
        row: row as 0 | 1,
        status: v.status,
        caption: v.label,
        tone: rowTone(s, p.spec.app.version, row, router),
        ready,
        routed: routed[row] && ready,
      })
    })
  })
  return out
}

export interface TrayDot {
  id: string
  x: number
  y: number
  bad: boolean
  /** a request that found no Pod falls in front of the router */
  dropped: boolean
  /** rotation of a falling tray, degrees */
  rot: number
}

export function trayWidth(layout: LaneLayout): number {
  return layout === 'wide' ? 20 : 16
}

/** Requests in flight (≤ 200 per lane in the engine; we draw at most `cap`, and at most 3 falling trays). */
export function trayDots(s: ClusterState, layout: LaneLayout, spots: PodSpot[], cap = 18): TrayDot[] {
  const g = GEOM[layout]
  const half = trayWidth(layout) / 2
  const at = new Map(spots.map((p) => [p.pod.id, p]))
  const out: TrayDot[] = []
  const fallen: TrayDot[] = []
  const list = inFlightAt(s)
  for (let i = Math.max(0, list.length - cap); i < list.length; i++) {
    const { r, progress } = list[i]
    const bad = r.outcome !== 'ok'
    const target = r.podId ? at.get(r.podId) : undefined
    if (!target) {
      if (progress < 1) fallen.push({ id: r.id, x: g.outX + half + 2 + progress * 4, y: g.outY + 8 + progress * 22, bad: true, dropped: true, rot: progress * 70 })
      continue
    }
    // the tray stops in front of the lunchbox, never over it
    const tx = target.x - g.pod * 0.62 - half - 2
    const ty = target.y
    const k = Math.min(1, progress)
    out.push({ id: r.id, x: g.outX + (tx - g.outX) * k, y: g.outY + (ty - g.outY) * k, bad, dropped: false, rot: 0 })
  }
  return [...fallen.slice(-3), ...out]
}
