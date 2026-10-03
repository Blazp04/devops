/**
 * L10 "Vi ste orkestrator → termostat za aplikacije" – desired state vs actual state and a generic,
 * level-triggered reconciliation loop, BEFORE any Kubernetes component is named.
 *
 * Model (curriculum L10): 3 servers × 14 abstract slots (no requests yet). Baseline api 9, worker 12, web 6
 * = 27 containers (9 per server). A seeded day: 03:00 server-2 fails (27 containers fit into 28 slots);
 * 08:00 Davor brings server-2 back – nothing moves back (no rebalancing); 10:00 api gets a new version – its 9 new
 * instances land on the empty server-2 (most free slots) and the old ones disappear from server-1/3;
 * 12:00–13:00 api desired 9 → 15: by then every server has 9 of 14 slots used, so with the loop the six extra
 * instances spread 2/2/2 (seeded tie-break). Only when the new version comes AFTER lunch (dayEvents) do the lunch
 * instances land mostly on server-2.
 * Events carry the day clock in `clock` („03:00”); the text does not repeat it.
 * Loop: every pass (10 s sim · stvarno: sekunde) diff = desired − actual per app, create dashed ghosts on the
 * server with the most free slots (seeded tie-break), solid after 5 s, surplus removed newest first.
 * A lost notification changes nothing for the loop – the next pass still sees the difference.
 */
import type { ClusterEvent, Tone } from './types.ts'
import { createRng, plural } from '../../kit/sim/math.ts'
import type { Rng } from '../../kit/sim/math.ts'

export interface DesiredApp {
  id: string
  label: string
  desired: number
}

export interface DesiredStateConfig {
  seed: number
  servers: number
  slotsPerServer: number
  apps: DesiredApp[]
  /** day clock at t = 0, minutes after midnight (02:30) */
  startMinute: number
  endMinute: number
  /** compressed day: simulated day-minutes per simulated second */
  minutesPerSecond: number
  /** one reconciliation pass every … seconds of sim time (labelled "stvarno: sekunde") */
  loopPeriodS: number
  /** a placed ghost becomes a running instance after … seconds */
  materializeS: number
  mode: 'manual' | 'loop'
  /** run the seeded day events */
  scripted: boolean
  /** replace the seeded day (null = seededDay()); minutes after midnight */
  dayEvents: Omit<DayEvent, 'done'>[] | null
  nightStartMinute: number
  nightEndMinute: number
}

export const DESIRED_DEFAULTS: DesiredStateConfig = {
  seed: 42,
  servers: 3,
  slotsPerServer: 14,
  apps: [
    { id: 'api', label: 'API', desired: 9 },
    { id: 'worker', label: 'worker', desired: 12 },
    { id: 'web', label: 'web', desired: 6 },
  ],
  startMinute: 2 * 60 + 30,
  endMinute: 14 * 60,
  minutesPerSecond: 1,
  loopPeriodS: 10,
  materializeS: 5,
  mode: 'manual',
  scripted: true,
  dayEvents: null,
  nightStartMinute: 0,
  nightEndMinute: 7 * 60,
}

export interface DesiredServer {
  id: string
  name: string
  up: boolean
  slots: number
}

export interface DesiredInstance {
  id: string
  app: string
  version: number
  /** null = ghost waiting for a slot ("nema mjesta") */
  serverId: string | null
  state: 'ghost' | 'running'
  createdAt: number
  placedAt: number | null
  solidAt: number | null
  by: 'loop' | 'manual' | 'initial'
}

export interface DayEvent {
  minute: number
  kind: 'server-fail' | 'server-repair' | 'new-version' | 'desired'
  app?: string
  server?: string
  value?: number
  label: string
  done: boolean
}

export interface DesiredStateSim {
  t: number
  acc: number
  dt: number
  cfg: DesiredStateConfig
  rng: Rng
  seq: number
  servers: DesiredServer[]
  instances: DesiredInstance[]
  desired: Record<string, number>
  version: Record<string, number>
  mode: 'manual' | 'loop'
  nextLoopAt: number
  loopPasses: number
  day: DayEvent[]
  /** notifications to the human operator (manual mode) */
  alerts: { t: number; minute: number; text: string; lost: boolean }[]
  loseNext: boolean
  events: ClusterEvent[]
  /** event id counter (separate from `seq`, which names instances) */
  eventSeq: number
  scores: {
    /** Σ missing running instances × day-minutes */
    missingInstanceMinutes: number
    /** placements rejected (server down or full) */
    wrongPlacements: number
    /** instances placed manually beyond the desired count */
    surplusPlacements: number
    manualActions: number
    /** night minutes Davor had to be awake fixing things (manual mode) */
    sleepLostMinutes: number
  }
  finished: boolean
}

function log(s: DesiredStateSim, kind: string, text: string, tone: Tone = 'neutral'): void {
  s.eventSeq += 1
  s.events.push({ id: `ev${s.eventSeq}`, t: Math.round(s.t * 10) / 10, kind, text, tone, clock: clock(s) })
  if (s.events.length > 50) s.events.splice(0, s.events.length - 50)
}

export function dayMinute(s: DesiredStateSim): number {
  return s.cfg.startMinute + s.t * s.cfg.minutesPerSecond
}

/** "03:00" */
export function clock(s: DesiredStateSim): string {
  const m = Math.floor(dayMinute(s)) % (24 * 60)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function seededDay(): DayEvent[] {
  return [
    { minute: 3 * 60, kind: 'server-fail', server: 'server-2', label: '03:00 poslužitelj-2 je pao', done: false },
    { minute: 8 * 60, kind: 'server-repair', server: 'server-2', label: '08:00 Davor vraća popravljeni poslužitelj-2', done: false },
    { minute: 10 * 60, kind: 'new-version', app: 'api', label: '10:00 nova verzija API-ja', done: false },
    { minute: 12 * 60, kind: 'desired', app: 'api', value: 15, label: '12:00 ručak: API 9 → 15', done: false },
    { minute: 13 * 60, kind: 'desired', app: 'api', value: 9, label: '13:00 ručak gotov: API 15 → 9', done: false },
  ]
}

export function createDesiredState(over: Partial<DesiredStateConfig> = {}): DesiredStateSim {
  const cfg: DesiredStateConfig = { ...DESIRED_DEFAULTS, ...over, apps: (over.apps ?? DESIRED_DEFAULTS.apps).map((a) => ({ ...a })) }
  const s: DesiredStateSim = {
    t: 0,
    acc: 0,
    dt: 0.1,
    cfg,
    rng: createRng(cfg.seed),
    seq: 0,
    servers: Array.from({ length: cfg.servers }, (_, i) => ({ id: `server-${i + 1}`, name: `poslužitelj-${i + 1}`, up: true, slots: cfg.slotsPerServer })),
    instances: [],
    desired: Object.fromEntries(cfg.apps.map((a) => [a.id, a.desired])),
    version: Object.fromEntries(cfg.apps.map((a) => [a.id, 1])),
    mode: cfg.mode,
    nextLoopAt: 0,
    loopPasses: 0,
    day: !cfg.scripted ? [] : cfg.dayEvents ? cfg.dayEvents.map((e) => ({ ...e, done: false })).sort((a, b) => a.minute - b.minute) : seededDay(),
    alerts: [],
    loseNext: false,
    events: [],
    eventSeq: 0,
    scores: { missingInstanceMinutes: 0, wrongPlacements: 0, surplusPlacements: 0, manualActions: 0, sleepLostMinutes: 0 },
    finished: false,
  }
  // baseline: spread every app evenly (api 3/3/3, worker 4/4/4, web 2/2/2 = 9 per server)
  for (const app of cfg.apps) {
    for (let i = 0; i < app.desired; i++) {
      const server = s.servers[i % s.servers.length]
      s.instances.push({ id: `c${++s.seq}`, app: app.id, version: 1, serverId: server.id, state: 'running', createdAt: -1, placedAt: -1, solidAt: -1, by: 'initial' })
    }
  }
  return s
}

// ---------------------------------------------------------------- queries

export function usedSlots(s: DesiredStateSim, serverId: string): number {
  return s.instances.filter((i) => i.serverId === serverId).length
}

export function freeSlots(s: DesiredStateSim, serverId: string): number {
  const sv = s.servers.find((x) => x.id === serverId)
  if (!sv || !sv.up) return 0
  return sv.slots - usedSlots(s, serverId)
}

export function capacity(s: DesiredStateSim): number {
  return s.servers.filter((x) => x.up).reduce((a, x) => a + x.slots, 0)
}

/** Running instances of the app (any version – an old version still serves). */
export function runningCount(s: DesiredStateSim, app: string): number {
  return s.instances.filter((i) => i.app === app && i.state === 'running').length
}

/** Missing running capacity across apps right now. */
export function deficit(s: DesiredStateSim): number {
  return Object.keys(s.desired).reduce((a, app) => a + Math.max(0, s.desired[app] - runningCount(s, app)), 0)
}

/** „Davorovi sati sna”: night minutes simulated so far, and how many of them Davor slept. */
export function davorSleep(s: DesiredStateSim): { nightMinutes: number; sleptMinutes: number } {
  const start = s.cfg.startMinute
  const now = dayMinute(s)
  const from = Math.max(start, s.cfg.nightStartMinute)
  const to = Math.min(now, s.cfg.nightEndMinute)
  const night = Math.max(0, to - from)
  return { nightMinutes: night, sleptMinutes: Math.max(0, night - s.scores.sleepLostMinutes) }
}

export interface AppDiff {
  app: string
  desired: number
  running: number
  ghosts: number
  unplaced: number
  outdated: number
}

export function diffs(s: DesiredStateSim): AppDiff[] {
  return Object.keys(s.desired).map((app) => {
    const mine = s.instances.filter((i) => i.app === app)
    const cur = mine.filter((i) => i.version === s.version[app])
    return {
      app,
      desired: s.desired[app],
      running: cur.filter((i) => i.state === 'running').length,
      ghosts: cur.filter((i) => i.state === 'ghost').length,
      unplaced: cur.filter((i) => i.serverId === null).length,
      outdated: mine.filter((i) => i.version !== s.version[app]).length,
    }
  })
}

// ---------------------------------------------------------------- the loop

function mostFreeServer(s: DesiredStateSim): string | null {
  let best: string[] = []
  let bestFree = 0
  for (const sv of s.servers) {
    const f = freeSlots(s, sv.id)
    if (f <= 0) continue
    if (f > bestFree) {
      bestFree = f
      best = [sv.id]
    } else if (f === bestFree) best.push(sv.id)
  }
  if (best.length === 0) return null
  return best.length === 1 ? best[0] : best[Math.floor(s.rng.next() * best.length)]
}

/** One reconciliation pass: observe → compare → act, per app. Returns what it did. */
export function reconcile(s: DesiredStateSim): { created: number; removed: number; unplaced: number } {
  let created = 0
  let removed = 0
  s.loopPasses += 1
  // place ghosts that are still waiting for a slot
  for (const g of s.instances.filter((i) => i.serverId === null)) {
    const sv = mostFreeServer(s)
    if (!sv) break
    g.serverId = sv
    g.placedAt = s.t
  }
  for (const app of Object.keys(s.desired)) {
    const v = s.version[app]
    const d = s.desired[app]
    const cur = s.instances.filter((i) => i.app === app && i.version === v)
    const missing = d - cur.length
    if (missing > 0) {
      for (let k = 0; k < missing; k++) {
        const sv = mostFreeServer(s)
        s.instances.push({ id: `c${++s.seq}`, app, version: v, serverId: sv, state: 'ghost', createdAt: s.t, placedAt: sv ? s.t : null, solidAt: null, by: 'loop' })
        created += 1
      }
    } else if (missing < 0) {
      // surplus of the current version: unplaced ghosts first, then newest
      const order = [...cur].sort((a, b) => (a.serverId === null ? -1 : 0) - (b.serverId === null ? -1 : 0) || (a.state === 'ghost' ? -1 : 0) - (b.state === 'ghost' ? -1 : 0) || b.createdAt - a.createdAt)
      for (const x of order.slice(0, -missing)) {
        s.instances.splice(s.instances.indexOf(x), 1)
        removed += 1
      }
    }
    // outdated instances go only when enough new ones run (they still serve meanwhile)
    const outdated = s.instances.filter((i) => i.app === app && i.version !== v).sort((a, b) => b.createdAt - a.createdAt)
    const curRunning = s.instances.filter((i) => i.app === app && i.version === v && i.state === 'running').length
    const extra = Math.min(outdated.length, Math.max(0, curRunning + outdated.length - d))
    for (const x of outdated.slice(0, extra)) {
      s.instances.splice(s.instances.indexOf(x), 1)
      removed += 1
    }
  }
  const unplaced = s.instances.filter((i) => i.serverId === null).length
  if (created || removed) log(s, 'loop', `petlja: +${created} / −${removed}${unplaced ? ` · ${plural(unplaced, ['kontejner čeka', 'kontejnera čekaju', 'kontejnera čeka'])} (nema mjesta)` : ''}`, unplaced ? 'warn' : 'info')
  return { created, removed, unplaced }
}

function alert(s: DesiredStateSim, text: string): void {
  const lost = s.loseNext
  s.loseNext = false
  s.alerts.push({ t: s.t, minute: dayMinute(s), text, lost })
  if (s.alerts.length > 30) s.alerts.shift()
  if (lost) log(s, 'alert-lost', `obavijest izgubljena: ${text}`, 'warn')
}

function applyDayEvent(s: DesiredStateSim, ev: DayEvent): void {
  ev.done = true
  if (ev.kind === 'server-fail' && ev.server) failServer(s, ev.server)
  else if (ev.kind === 'server-repair' && ev.server) repairServer(s, ev.server)
  else if (ev.kind === 'new-version' && ev.app) newVersion(s, ev.app)
  else if (ev.kind === 'desired' && ev.app && ev.value !== undefined) setDesired(s, ev.app, ev.value)
}

function tick(s: DesiredStateSim): void {
  const minute = dayMinute(s)
  for (const ev of s.day) if (!ev.done && minute + 1e-9 >= ev.minute) applyDayEvent(s, ev)
  for (const i of s.instances) {
    if (i.state === 'ghost' && i.serverId !== null && i.placedAt !== null && s.t + 1e-9 >= i.placedAt + s.cfg.materializeS) {
      i.state = 'running'
      i.solidAt = s.t
    }
  }
  if (s.mode === 'loop' && s.t + 1e-9 >= s.nextLoopAt) {
    reconcile(s)
    s.nextLoopAt += s.cfg.loopPeriodS
    if (s.nextLoopAt <= s.t) s.nextLoopAt = s.t + s.cfg.loopPeriodS
  }
  const dm = s.cfg.minutesPerSecond * s.dt
  const def = deficit(s)
  s.scores.missingInstanceMinutes += def * dm
  const night = minute % (24 * 60) >= s.cfg.nightStartMinute && minute % (24 * 60) < s.cfg.nightEndMinute
  const paged = s.alerts.some((a) => !a.lost && s.t - a.t < 3600)
  if (night && s.mode === 'manual' && def > 0 && paged) s.scores.sleepLostMinutes += dm
  s.t = Math.round((s.t + s.dt) * 1e6) / 1e6
  if (dayMinute(s) >= s.cfg.endMinute) s.finished = true
}

/** Advance by dtSeconds (fits useSimulation's step). */
export function stepDesiredState(s: DesiredStateSim, dtSeconds: number): void {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0 || s.finished) return
  s.acc += Math.min(dtSeconds, 120)
  while (s.acc + 1e-9 >= s.dt && !s.finished) {
    tick(s)
    s.acc -= s.dt
  }
}

export function advanceDesiredState(s: DesiredStateSim, seconds: number): void {
  const n = Math.round(seconds / s.dt)
  for (let i = 0; i < n && !s.finished; i++) tick(s)
}

// ---------------------------------------------------------------- actions

/** „Predaj Kubernetesu”: from now on the loop reconciles every loopPeriodS. */
export function handOver(s: DesiredStateSim): void {
  if (s.mode === 'loop') return
  s.mode = 'loop'
  s.nextLoopAt = s.t
  log(s, 'handover', 'upravljanje preuzima petlja usklađivanja', 'ok')
}

/** Manual placement (drag): starts a container of the app's current version on that server. */
export function placeInstance(s: DesiredStateSim, app: string, serverId: string): { ok: boolean; reason: string } {
  if (!(app in s.desired)) return { ok: false, reason: 'nepoznata aplikacija' }
  s.scores.manualActions += 1
  const sv = s.servers.find((x) => x.id === serverId)
  if (!sv || !sv.up) {
    s.scores.wrongPlacements += 1
    log(s, 'wrong', `${sv?.name ?? serverId} ne radi – kontejner se ne može pokrenuti`, 'bad')
    return { ok: false, reason: 'poslužitelj ne radi' }
  }
  if (freeSlots(s, serverId) <= 0) {
    s.scores.wrongPlacements += 1
    log(s, 'wrong', `${sv.name} je pun`, 'bad')
    return { ok: false, reason: 'poslužitelj je pun' }
  }
  const cur = s.instances.filter((i) => i.app === app && i.version === s.version[app]).length
  if (cur >= s.desired[app]) s.scores.surplusPlacements += 1
  s.instances.push({ id: `c${++s.seq}`, app, version: s.version[app], serverId, state: 'ghost', createdAt: s.t, placedAt: s.t, solidAt: null, by: 'manual' })
  log(s, 'manual', `ručno: ${app} na ${sv.name}`, 'info')
  return { ok: true, reason: '' }
}

export function removeInstance(s: DesiredStateSim, id: string): boolean {
  const i = s.instances.findIndex((x) => x.id === id)
  if (i < 0) return false
  s.scores.manualActions += 1
  s.instances.splice(i, 1)
  return true
}

/** Change the desired count (slider or „Promijeni želju usred popravka”). Unknown apps and NaN/±∞ are refused. */
export function setDesired(s: DesiredStateSim, app: string, n: number): { ok: boolean; reason: string } {
  if (!(app in s.desired)) return { ok: false, reason: 'nepoznata aplikacija' }
  if (!Number.isFinite(n) || n < 0) return { ok: false, reason: 'željeni broj mora biti nenegativan broj' }
  const before = s.desired[app]
  s.desired[app] = Math.round(n)
  log(s, 'desired', `želja: ${app} ${before} → ${s.desired[app]}`, 'info')
  if (s.desired[app] > before) alert(s, `treba još ${s.desired[app] - before} × ${app}`)
  return { ok: true, reason: '' }
}

export function newVersion(s: DesiredStateSim, app: string): boolean {
  if (!(app in s.version)) return false
  s.version[app] += 1
  log(s, 'version', `${app}: nova verzija v${s.version[app]} – stare kopije treba zamijeniti`, 'info')
  alert(s, `nova verzija za ${app}`)
  return true
}

/** „Ugasi poslužitelj”: its containers are gone. */
export function failServer(s: DesiredStateSim, serverId: string): void {
  const sv = s.servers.find((x) => x.id === serverId)
  if (!sv || !sv.up) return
  sv.up = false
  const lost = s.instances.filter((i) => i.serverId === serverId)
  s.instances = s.instances.filter((i) => i.serverId !== serverId)
  // „nestao je 1 kontejner”, „nestala su 3 kontejnera”, „nestalo je 9 kontejnera” (verb agrees with the count)
  const verb = plural(lost.length, ['nestao je', 'nestala su', 'nestalo je'], false)
  log(s, 'server-fail', `${sv.name} je pao – ${verb} ${plural(lost.length, ['kontejner', 'kontejnera', 'kontejnera'])}`, 'bad')
  alert(s, `${sv.name} je pao`)
}

/** Repaired server returns EMPTY – running containers are not moved back. */
export function repairServer(s: DesiredStateSim, serverId: string): void {
  const sv = s.servers.find((x) => x.id === serverId)
  if (!sv || sv.up) return
  sv.up = true
  log(s, 'server-repair', `${sv.name} je popravljen i prazan – ništa se ne seli natrag`, 'ok')
}

/** „Izgubi događaj”: the next notification never arrives (the loop does not care). */
export function loseNextEvent(s: DesiredStateSim): void {
  s.loseNext = true
}
