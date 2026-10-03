/**
 * The hero poster's little story, in three acts (poster space 600 × 780, printed on yellow stock):
 *   I   one server, lunch rush → queue piles up → 503
 *   II  a load balancer spreads the same traffic over three servers
 *   III the servers become Pods in a cluster behind a Service; one crashes and is replaced on its own
 */
import { pointAt, polyLength, type Pt, type Rect } from './geo'

export type Act = 0 | 1 | 2
export const ACT_LEN: readonly number[] = [7.5, 7, 10.5]
export const PW = 600
export const PH = 780

export const STUDENTS: readonly { x: number; y: number; ink: 'pink' | 'blue'; s: number }[] = [
  { x: 58, y: 330, ink: 'blue', s: 1.25 },
  { x: 138, y: 312, ink: 'pink', s: 1.4 },
  { x: 218, y: 330, ink: 'blue', s: 1.25 },
  { x: 300, y: 308, ink: 'pink', s: 1.45 },
  { x: 382, y: 330, ink: 'blue', s: 1.25 },
  { x: 462, y: 312, ink: 'pink', s: 1.4 },
  { x: 542, y: 330, ink: 'blue', s: 1.25 },
]
export const CLOCK = { x: 516, y: 100, r: 64 }

/** Act II/III dispatcher (Act III: smaller, it has become the Service). */
export const LB2 = { x: 300, y: 478, r: 112 }
export const LB3 = { x: 300, y: 438, r: 76 }

export const SOLO_BARS: readonly Rect[] = [0, 1, 2].map((i) => ({ x: 64, y: 566 + i * 48, w: 472, h: 40 }))
export const SOLO_PLATE: Rect = { x: 50, y: 552, w: 500, h: 164 }
const SOLO_ENTRY: Pt = { x: 300, y: 546 }

export const TRIO: readonly { cx: number; bars: Rect[]; plate: Rect }[] = [106, 300, 494].map((cx) => ({
  cx,
  bars: [0, 1].map((i) => ({ x: cx - 80, y: 642 + i * 38, w: 160, h: 30 })),
  plate: { x: cx - 90, y: 628, w: 180, h: 96 },
}))

export const CLUSTER: Rect & { r: number } = { x: 20, y: 532, w: 560, h: 224, r: 26 }
export const CP = { x: 60, y: 532, r: 22 }
export const BUS_Y = 562
export const NODES: readonly Rect[] = [
  { x: 38, y: 578, w: 254, h: 150 },
  { x: 308, y: 578, w: 254, h: 150 },
]
export const POD = 58
export const PODS: readonly Rect[] = NODES.flatMap((n) => [0, 1, 2].map((i) => ({ x: n.x + 20 + i * 79, y: n.y + 20, w: POD, h: POD })))

const RATES = [9.5, 7, 7.2]
const SPEED = 300
const CRASH_AT = 3.2
const DETECT_AT = 4.2
const REPLACE_AT = 5.4
const READY_AFTER = 0.9
export const CRASH_POD = 4
const ERR_LIFE = 1.5
/** Act I: at most three big 503 stamps, landing one after another in fixed places above the queue. */
const STAMP_SLOTS: readonly Pt[] = [
  { x: 168, y: 438 },
  { x: 432, y: 430 },
  { x: 300, y: 412 },
]

interface Job {
  id: number
  svc: number
  start: number
}

interface Group {
  id: number
  entry: Pt
  workers: readonly Rect[]
  vertical: boolean
  busy: (Job | null)[]
  queue: Job[]
  qMax: number
  qCols: number
  qCell: number
  qAnchor: Pt
  alive: boolean
  routable: boolean
  readyAt: number
}

interface Dot {
  id: number
  route: Pt[]
  len: number
  p: number
  g: number
  viaLb: boolean
}

interface Fx {
  id: number
  kind: 'ok' | 'err'
  x: number
  y: number
  born: number
  label: string
}

export interface PodState {
  id: number
  slot: number
  alive: boolean
  ready: boolean
}

export interface HeroView {
  act: Act
  actT: number
  dots: { id: number; x: number; y: number }[]
  queued: { id: number; x: number; y: number; r: number }[]
  busy: { key: string; rect: Rect; vertical: boolean; prog: number }[]
  fx: { id: number; kind: 'ok' | 'err'; x: number; y: number; age: number; label: string }[]
  pods: PodState[]
  heat: number
  target: number
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function lbOf(act: Act) {
  return act === 2 ? LB3 : LB2
}

/** Where the needle of the dispatcher points for a given target group. */
export function targetPoint(act: Act, gi: number): Pt | null {
  if (gi < 0) return null
  if (act === 1) return TRIO[gi] ? { x: TRIO[gi].cx, y: 600 } : null
  if (act === 2) return { x: LB3.x, y: BUS_Y + 40 }
  return null
}

export class HeroSim {
  act: Act = 0
  private t = 0
  private nextId = 1
  private nextArrival = 0
  private groups: Group[] = []
  private dots: Dot[] = []
  private fx: Fx[] = []
  private rr = 0
  private target = -1
  private rand = mulberry32(12)
  private crashed = false
  private replaced = false
  private errSlot = 0

  constructor(act: Act = 0, warm = 2.4) {
    this.goto(act, warm)
  }

  goto(act: Act, warm = 1.2) {
    this.act = act
    this.t = 0
    this.dots = []
    this.fx = []
    this.rr = 0
    this.crashed = false
    this.replaced = false
    this.errSlot = 0
    this.groups = this.buildGroups(act)
    this.nextArrival = 0
    for (let i = 0; i < warm * 30; i++) this.step(1 / 30, false)
  }

  private buildGroups(act: Act): Group[] {
    const base = { busy: [] as (Job | null)[], queue: [] as Job[], alive: true, routable: true, readyAt: 0 }
    if (act === 0)
      return [
        {
          ...base,
          id: this.nextId++,
          entry: SOLO_ENTRY,
          workers: SOLO_BARS,
          vertical: false,
          busy: [null, null, null],
          qMax: 27,
          qCols: 9,
          qCell: 25,
          qAnchor: { x: 300, y: 526 },
        },
      ]
    if (act === 1)
      return TRIO.map((s) => ({
        ...base,
        id: this.nextId++,
        entry: { x: s.cx, y: 604 },
        workers: s.bars,
        vertical: false,
        busy: [null, null],
        queue: [],
        qMax: 5,
        qCols: 5,
        qCell: 22,
        qAnchor: { x: s.cx, y: 610 },
      }))
    return PODS.map((r) => this.podGroup(r, 0))
  }

  private podGroup(r: Rect, readyAt: number): Group {
    return {
      id: this.nextId++,
      entry: { x: r.x + r.w / 2, y: r.y - 10 },
      workers: [r],
      vertical: true,
      busy: [null],
      queue: [],
      qMax: 2,
      qCols: 2,
      qCell: 16,
      qAnchor: { x: r.x + r.w / 2, y: r.y - 6 },
      alive: true,
      routable: readyAt <= this.t,
      readyAt,
    }
  }

  private spawn() {
    const s = STUDENTS[Math.floor(this.rand() * STUDENTS.length)]
    const from = { x: s.x + (this.rand() - 0.5) * 18, y: s.y - 22 * s.s }
    if (this.act === 0) {
      const g = this.groups[0]
      const route = [from, g.entry]
      this.dots.push({ id: this.nextId++, route, len: polyLength(route), p: 0, g: 0, viaLb: false })
    } else {
      const lb = lbOf(this.act)
      const route = [from, { x: lb.x, y: lb.y }]
      this.dots.push({ id: this.nextId++, route, len: polyLength(route), p: 0, g: -1, viaLb: true })
    }
  }

  private pick(): number {
    const n = this.groups.length
    for (let k = 0; k < n; k++) {
      const i = (this.rr + k) % n
      if (this.groups[i].routable) {
        this.rr = (i + 1) % n
        return i
      }
    }
    return -1
  }

  private routeTo(gi: number): Pt[] {
    const g = this.groups[gi]
    const lb = lbOf(this.act)
    if (this.act === 2)
      return [
        { x: lb.x, y: lb.y },
        { x: lb.x, y: BUS_Y },
        { x: g.entry.x, y: BUS_Y },
        g.entry,
      ]
    return [{ x: lb.x, y: lb.y }, g.entry]
  }

  private queuePos(g: Group, k: number): Pt {
    const col = k % g.qCols
    const row = Math.floor(k / g.qCols)
    return { x: g.qAnchor.x + (col - (g.qCols - 1) / 2) * g.qCell, y: g.qAnchor.y - row * g.qCell }
  }

  private err(x: number, y: number, label: string) {
    if (this.act === 0) {
      const alive = this.fx.filter((f) => f.kind === 'err' && this.t - f.born < ERR_LIFE).length
      if (alive >= STAMP_SLOTS.length) return
      const slot = STAMP_SLOTS[this.errSlot++ % STAMP_SLOTS.length]
      this.fx.push({ id: this.nextId++, kind: 'err', x: slot.x, y: slot.y, born: this.t, label })
      return
    }
    this.fx.push({ id: this.nextId++, kind: 'err', x, y, born: this.t, label })
  }

  private arrive(gi: number) {
    const g = this.groups[gi]
    if (!g.alive) {
      this.err(g.entry.x + (this.rand() - 0.5) * 30, g.entry.y + 28, '502')
      return
    }
    const job = { id: this.nextId++, svc: 0.62 + this.rand() * 0.3, start: this.t }
    const free = g.busy.indexOf(null)
    if (free >= 0) g.busy[free] = job
    else if (g.queue.length < g.qMax) g.queue.push(job)
    else {
      const top = this.queuePos(g, g.qMax - 1)
      this.err(g.qAnchor.x + (this.rand() - 0.5) * 160, top.y - 26 - this.rand() * 34, '503')
    }
  }

  /** Advance the story. `loop` = move on to the next act when this one ends. */
  step(dt: number, loop = true) {
    this.t += dt
    const t = this.t

    if (loop && t >= ACT_LEN[this.act]) {
      this.goto(((this.act + 1) % 3) as Act, 0.6)
      return
    }

    while (this.nextArrival <= t) {
      this.spawn()
      this.nextArrival += -Math.log(1 - this.rand()) / RATES[this.act]
    }

    const still: Dot[] = []
    for (const d of this.dots) {
      d.p += (SPEED * dt) / d.len
      if (d.p < 1) {
        still.push(d)
        continue
      }
      if (d.viaLb && d.g < 0) {
        const gi = this.pick()
        if (gi < 0) continue
        d.g = gi
        d.route = this.routeTo(gi)
        d.len = polyLength(d.route)
        d.p = 0
        this.target = gi
        still.push(d)
      } else {
        this.arrive(d.g)
      }
    }
    this.dots = still

    for (const g of this.groups) {
      g.busy.forEach((job, w) => {
        if (!job || t - job.start < job.svc) return
        const r = g.workers[w]
        this.fx.push({
          id: this.nextId++,
          kind: 'ok',
          x: g.vertical ? r.x + r.w + 9 : r.x + r.w + 12,
          y: g.vertical ? r.y + 10 : r.y + r.h / 2,
          born: t,
          label: '',
        })
        const next = g.queue.shift() ?? null
        if (next) next.start = t
        g.busy[w] = next
      })
      if (g.alive && !g.routable && t >= g.readyAt) g.routable = true
    }

    if (this.act === 2) {
      const g = this.groups[CRASH_POD]
      if (!this.crashed && t >= CRASH_AT) {
        this.crashed = true
        g.alive = false
        g.busy.forEach((j) => j && this.err(g.entry.x, g.entry.y + 40, '502'))
        g.busy = [null]
        g.queue = []
      }
      if (this.crashed && !g.alive && g.routable && t >= DETECT_AT) g.routable = false
      if (this.crashed && !this.replaced && t >= REPLACE_AT) {
        this.replaced = true
        this.groups[CRASH_POD] = this.podGroup(PODS[CRASH_POD], t + READY_AFTER)
      }
    }

    this.fx = this.fx.filter((f) => t - f.born < (f.kind === 'ok' ? 0.6 : ERR_LIFE)).slice(-40)
  }

  view(): HeroView {
    const t = this.t
    const queued: HeroView['queued'] = []
    const busy: HeroView['busy'] = []
    let heat = 0
    const qr = this.act === 0 ? 9.5 : this.act === 1 ? 8 : 6
    this.groups.forEach((g, gi) => {
      g.queue.forEach((j, k) => queued.push({ id: j.id, r: qr, ...this.queuePos(g, k) }))
      g.busy.forEach((j, w) => {
        if (j) busy.push({ key: `${gi}-${w}`, rect: g.workers[w], vertical: g.vertical, prog: Math.min(1, (t - j.start) / j.svc) })
      })
      heat = Math.max(heat, g.queue.length / g.qMax)
    })
    return {
      act: this.act,
      actT: t,
      dots: this.dots.map((d) => ({ id: d.id, ...pointAt(d.route, d.p) })),
      queued,
      busy,
      fx: this.fx.map((f) => ({ id: f.id, kind: f.kind, x: f.x, y: f.y, label: f.label, age: (t - f.born) / (f.kind === 'ok' ? 0.6 : ERR_LIFE) })),
      pods:
        this.act === 2
          ? this.groups.map((g, slot) => ({ id: g.id, slot, alive: g.alive, ready: g.alive && g.routable }))
          : [],
      heat,
      target: this.target,
    }
  }
}
