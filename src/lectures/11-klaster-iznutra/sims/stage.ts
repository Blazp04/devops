/**
 * Geometry of „Klaster pod mikroskopom” (and the smaller drawings that reuse it): where the control-plane cards,
 * the nodes, their slots and the routes of the numbered messages are, in two layouts chosen by container width.
 * Font sizes are in viewBox units, picked so that lettering stays ≥ 12 px (Caveat ≥ 17 px) at the smallest width
 * of each layout (wide ≥ 580 px → scale ≥ 0,76, so the stage's wide lettering is larger: `g.fs`; narrow 320–460 px → scale ≥ 0,8).
 */
import type { Actor } from '../../../engines/cluster'

export type Pt = [number, number]
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export type Layout = 'wide' | 'narrow'
export const WIDE_MIN_PX = 580

/** Lettering of the smaller drawings (steppers) – they switch to their narrow layout below 560 px. */
export const FS = { mono: 15, hand: 22, title: 16, small: 15 }
/** Lettering of the cluster stage: wide is used down to 580 px (760 units → 0,76), so mono 16 → 12,2 px, hand 23 → 17,5 px. */
const STAGE_FS: Record<Layout, StageFs> = { wide: { mono: 16, hand: 23, title: 16 }, narrow: { mono: 15, hand: 22, title: 16 } }

export interface StageFs {
  mono: number
  hand: number
  title: number
}

export interface NodeGeo extends Box {
  name: string
  kubelet: Box
  runtime: Box
  slots: Box[]
}

export interface StageGeo {
  layout: Layout
  fs: StageFs
  W: number
  H: number
  laptop: Box
  cp: Box
  cpLabel: Pt
  api: Box
  etcd: Box
  cm: Box
  sched: Box
  /** Pending Pods (no node yet) */
  pending: { label: Pt; first: Pt; dx: number; max: number }
  /** traffic note */
  traffic: Pt
  nodes: NodeGeo[]
  /** fixed lines: [from, to, kind] */
  routes: Record<string, Pt[]>
}

const NODE_NAMES = ['node-1', 'node-2', 'node-3']

function slotsGrid(x: number, y: number, w: number, h: number, cols: number, rows: number): Box[] {
  const out: Box[] = []
  const sw = w / cols
  const sh = h / rows
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ x: x + c * sw, y: y + r * sh, w: sw, h: sh })
  return out
}

const right = (b: Box, f = 0.5): Pt => [b.x + b.w, b.y + b.h * f]
const left = (b: Box, f = 0.5): Pt => [b.x, b.y + b.h * f]
const top = (b: Box, f = 0.5): Pt => [b.x + b.w * f, b.y]
const bottom = (b: Box, f = 0.5): Pt => [b.x + b.w * f, b.y + b.h]

export function stageGeo(layout: Layout): StageGeo {
  if (layout === 'wide') {
    const laptop = { x: 6, y: 96, w: 128, h: 92 }
    const cp = { x: 146, y: 6, w: 608, h: 192 }
    const etcd = { x: 216, y: 18, w: 168, h: 60 }
    const api = { x: 206, y: 98, w: 188, h: 90 }
    const cm = { x: 470, y: 20, w: 272, h: 72 }
    const sched = { x: 470, y: 114, w: 272, h: 72 }
    const nodes: NodeGeo[] = NODE_NAMES.map((name, i) => {
      const x = 6 + i * 252
      const y = 296
      const w = 244
      return {
        name,
        x,
        y,
        w,
        h: 196,
        kubelet: { x: x + 10, y: y + 36, w: 104, h: 26 },
        runtime: { x: x + 130, y: y + 36, w: 104, h: 26 },
        slots: slotsGrid(x + 10, y + 70, 224, 120, 3, 2),
      }
    })
    const routes: Record<string, Pt[]> = {
      'kubectl>apiserver': [right(laptop), left(api)],
      'apiserver>etcd': [top(api), bottom(etcd)],
      'controller-manager>apiserver': [left(cm, 0.62), right(api, 0.24)],
      'scheduler>apiserver': [left(sched, 0.5), right(api, 0.72)],
    }
    for (const n of nodes) {
      routes[`apiserver>kubelet:${n.name}`] = [bottom(api), top(n.kubelet)]
      routes[`kubelet:${n.name}>runtime:${n.name}`] = [right(n.kubelet), left(n.runtime)]
    }
    return {
      layout,
      fs: STAGE_FS.wide,
      W: 760,
      H: 500,
      laptop,
      cp,
      cpLabel: [cp.x + 12, cp.y + cp.h - 12],
      api,
      etcd,
      cm,
      sched,
      pending: { label: [490, 224], first: [522, 256], dx: 56, max: 4 },
      traffic: [10, 226],
      nodes,
      routes,
    }
  }
  // narrow: control plane on top, nodes stacked; the API reaches the kubelets along a bus on the left edge
  const laptop = { x: 118, y: 4, w: 164, h: 62 }
  const cp = { x: 6, y: 78, w: 388, h: 274 }
  const cm = { x: 14, y: 108, w: 172, h: 88 }
  const sched = { x: 214, y: 108, w: 172, h: 88 }
  const api = { x: 108, y: 216, w: 180, h: 90 }
  const etcd = { x: 300, y: 226, w: 88, h: 60 }
  const nodes: NodeGeo[] = NODE_NAMES.map((name, i) => {
    const x = 30
    const y = 448 + i * 160
    const w = 364
    return {
      name,
      x,
      y,
      w,
      h: 150,
      kubelet: { x: x + 10, y: y + 36, w: 104, h: 26 },
      runtime: { x: x + 130, y: y + 36, w: 104, h: 26 },
      slots: slotsGrid(x + 8, y + 70, 348, 74, 6, 1),
    }
  })
  const busX = 16
  const routes: Record<string, Pt[]> = {
    'kubectl>apiserver': [bottom(laptop), top(api)],
    'apiserver>etcd': [right(api, 0.45), left(etcd, 0.45)],
    'controller-manager>apiserver': [bottom(cm, 0.62), top(api, 0.14)],
    'scheduler>apiserver': [bottom(sched, 0.38), top(api, 0.86)],
  }
  for (const n of nodes) {
    const k = left(n.kubelet)
    routes[`apiserver>kubelet:${n.name}`] = [left(api, 0.72), [busX, api.y + api.h * 0.72], [busX, k[1]], k]
    routes[`kubelet:${n.name}>runtime:${n.name}`] = [right(n.kubelet), left(n.runtime)]
  }
  return {
    layout,
    fs: STAGE_FS.narrow,
    W: 400,
    H: 930,
    laptop,
    cp,
    cpLabel: [cp.x + 14, cp.y + 24],
    api,
    etcd,
    cm,
    sched,
    pending: { label: [34, 382], first: [62, 412], dx: 56, max: 3 },
    traffic: [270, 382],
    nodes,
    routes,
  }
}

/** Route of a message from → to (reversed when only the opposite direction is drawn). */
export function routeFor(g: StageGeo, from: Actor, to: Actor): Pt[] | null {
  const f = g.routes[`${from}>${to}`]
  if (f) return f
  const r = g.routes[`${to}>${from}`]
  return r ? [...r].reverse() : null
}

export function center(b: Box): Pt {
  return [b.x + b.w / 2, b.y + b.h / 2]
}

export function polyD(pts: Pt[]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
}
