/**
 * L10 flagship „Vi ste orkestrator → termostat za aplikacije”: a thin adapter around the E3 engine's L10 model
 * (`desiredState` in src/engines/cluster/desired-state.ts). The engine owns every rule (3 servers × 14 slots, the
 * seeded day, the level-triggered loop, scores); this file only adds what the lecture UI needs:
 *   - stable slot positions per server (so a container never "jumps" when a neighbour disappears),
 *   - which run this is (manual day, or handed over to the loop) and the goal flags,
 *   - Davor's state for the drawing, snapshots for the „ručno vs s petljom” comparison.
 */
import { desiredState as D } from '../../engines/cluster'

export type Sim = D.DesiredStateSim
export type Instance = D.DesiredInstance
export type AppId = 'api' | 'worker' | 'web'
export type RunKind = 'manual' | 'loop'

/** Name of the incident preset (the engine's default day: 02:30 → 14:00, manual) and its seed. */
export const PRESET = 'rucni-dan'
export const SEED = 42

export interface AppMeta {
  id: AppId
  /** text on the container box (≤ 3 letters, fits the slot) */
  short: string
  /** name in controls */
  name: string
  max: number
  /** marker tint of the box hatching (v1); a new API version is green with +41° hatching */
  tint: string
}

export const APPS: AppMeta[] = [
  { id: 'api', short: 'api', name: 'klopa-api', max: 20, tint: 'var(--hl-blue-ink)' },
  { id: 'worker', short: 'wrk', name: 'klopa-worker', max: 20, tint: 'var(--hl-pink-ink)' },
  { id: 'web', short: 'web', name: 'klopa-web', max: 12, tint: 'var(--hl-yellow-ink)' },
]

export const APP_BY_ID: Record<string, AppMeta> = Object.fromEntries(APPS.map((a) => [a.id, a]))

/** Day minutes of the seeded events (engine: seededDay()). */
export const DAY = { start: 150, fail: 180, repair: 480, version: 600, lunch: 720, lunchEnd: 780, end: 840, nightEnd: 420 }

export interface Flags {
  /** manual run: the 03:00 loss repaired by hand while the server was still down */
  night: boolean
  /** manual run: 15 API copies running during lunch, nothing missing */
  lunch: boolean
  /** loop run: lunch served by the loop */
  loopLunch: boolean
  /** a desire changed while a repair was in progress (app id) … */
  midApp: string | null
  /** … and the loop converged to the latest desire */
  midDone: boolean
}

export interface World {
  s: Sim
  /** instance id → { server, slot } */
  slotOf: Record<string, { server: string; slot: number }>
  kind: RunKind
  /** day clock when the loop took over (null = manual run) */
  handedAt: string | null
  flags: Flags
  /** the finished day was already reported to the comparison */
  recorded: boolean
  /** „Promijeni želju usred popravka” pressed while nothing was being repaired: applied on the next repair */
  armedMid: boolean
  /** scores at the moment of the handover: the loop column counts only from there */
  base: Base | null
}

interface Base {
  missing: number
  actions: number
  wrong: number
  slept: number
  night: number
}

export interface Snapshot {
  kind: RunKind
  clock: string
  handedAt: string | null
  missing: number
  wrong: number
  actions: number
  slept: number
  night: number
  finished: boolean
}

export function createWorld(kind: RunKind): World {
  const s = D.createDesiredState({ seed: SEED, mode: 'manual' })
  const w: World = { s, slotOf: {}, kind: 'manual', handedAt: null, flags: { night: false, lunch: false, loopLunch: false, midApp: null, midDone: false }, recorded: false, armedMid: false, base: null }
  if (kind === 'loop') handOver(w)
  syncSlots(w)
  return w
}

/** Keep every placed instance in the same slot for its whole life; free the slot when it is gone. */
export function syncSlots(w: World): void {
  const s = w.s
  const used = new Map<string, Set<number>>()
  const alive = new Set<string>()
  for (const i of s.instances) {
    if (i.serverId === null) continue
    alive.add(i.id)
    const cur = w.slotOf[i.id]
    if (cur && cur.server === i.serverId) {
      if (!used.has(cur.server)) used.set(cur.server, new Set())
      used.get(cur.server)!.add(cur.slot)
    }
  }
  for (const id of Object.keys(w.slotOf)) {
    const i = s.instances.find((x) => x.id === id)
    if (!alive.has(id) || !i || w.slotOf[id].server !== i.serverId) delete w.slotOf[id]
  }
  for (const i of s.instances) {
    if (i.serverId === null || w.slotOf[i.id]) continue
    const taken = used.get(i.serverId) ?? new Set<number>()
    let slot = 0
    while (taken.has(slot)) slot++
    taken.add(slot)
    used.set(i.serverId, taken)
    w.slotOf[i.id] = { server: i.serverId, slot }
  }
}

function updateFlags(w: World): void {
  const s = w.s
  const m = D.dayMinute(s)
  const def = D.deficit(s)
  const failed = s.day.some((e) => e.kind === 'server-fail' && e.done)
  const anyDown = s.servers.some((x) => !x.up)
  const lunch = m >= DAY.lunch && m < DAY.lunchEnd && D.runningCount(s, 'api') >= 15 && def === 0
  if (w.kind === 'manual' && failed && anyDown && def === 0) w.flags.night = true
  if (w.kind === 'manual' && lunch) w.flags.lunch = true
  if (w.kind === 'loop' && lunch) w.flags.loopLunch = true
  if (w.flags.midApp && !w.flags.midDone && s.mode === 'loop') {
    const d = D.diffs(s).find((x) => x.app === w.flags.midApp)
    if (d && d.running === d.desired && d.ghosts === 0 && d.outdated === 0) w.flags.midDone = true
  }
}

function after(w: World): void {
  syncSlots(w)
  updateFlags(w)
}

export function stepWorld(w: World, dt: number): void {
  D.stepDesiredState(w.s, dt)
  after(w)
  if (w.armedMid && repairing(w.s)) {
    w.armedMid = false
    changeMidRepair(w)
  }
}

// ---------------------------------------------------------------- actions (call inside sim.mutate)

export function handOver(w: World): void {
  if (w.s.mode === 'loop') return
  const sl = D.davorSleep(w.s)
  const sc = w.s.scores
  w.base = { missing: sc.missingInstanceMinutes, actions: sc.manualActions, wrong: sc.wrongPlacements, slept: sl.sleptMinutes, night: sl.nightMinutes }
  D.handOver(w.s)
  w.kind = 'loop'
  w.handedAt = D.clock(w.s)
  after(w)
}

export function place(w: World, app: string, server: string): { ok: boolean; reason: string } {
  const r = D.placeInstance(w.s, app, server)
  after(w)
  return r
}

/** „Ugasi jednu”: an outdated copy first (newest of those), otherwise the newest copy of the current version. */
export function removeOne(w: World, app: string): boolean {
  const s = w.s
  const mine = s.instances.filter((i) => i.app === app)
  if (mine.length === 0) return false
  const old = mine.filter((i) => i.version !== s.version[app]).sort((a, b) => b.createdAt - a.createdAt)
  const cur = mine.filter((i) => i.version === s.version[app]).sort((a, b) => b.createdAt - a.createdAt)
  const victim = old[0] ?? cur[0]
  const ok = D.removeInstance(s, victim.id)
  if (ok) {
    s.eventSeq += 1
    s.events.push({ id: `ev${s.eventSeq}`, t: Math.round(s.t * 10) / 10, kind: 'manual', text: `ručno: ugašen jedan ${APP_BY_ID[app]?.name ?? app}${victim.version !== s.version[app] ? ' (stara verzija)' : ''}`, tone: 'info', clock: D.clock(s) })
  }
  after(w)
  return ok
}

/** True while something is still being repaired: dashed copies exist or capacity is missing. */
export function repairing(s: Sim): boolean {
  return s.instances.some((i) => i.state === 'ghost') || D.deficit(s) > 0
}

export function setDesired(w: World, app: string, n: number): void {
  const s = w.s
  if (s.desired[app] === Math.round(n)) return
  if (s.mode === 'loop' && repairing(s)) {
    w.flags.midApp = app
    w.flags.midDone = false
  }
  D.setDesired(s, app, n)
  after(w)
}

/** „Promijeni želju usred popravka”: three more API copies (or three fewer near the top of the slider). */
export function changeMidRepair(w: World): void {
  const cur = w.s.desired.api
  setDesired(w, 'api', cur + 3 <= APP_BY_ID.api.max ? cur + 3 : cur - 3)
}

/** The button: change the desire now if something is being repaired, otherwise wait for the next repair. */
export function requestMidChange(w: World): void {
  if (repairing(w.s)) {
    w.armedMid = false
    changeMidRepair(w)
  } else w.armedMid = true
}

export function failServer(w: World, server: string): void {
  D.failServer(w.s, server)
  after(w)
}

export function repairServer(w: World, server: string): void {
  D.repairServer(w.s, server)
  after(w)
}

export function loseNextEvent(w: World): void {
  if (w.s.loseNext) return
  D.loseNextEvent(w.s)
  w.s.eventSeq += 1
  w.s.events.push({ id: `ev${w.s.eventSeq}`, t: Math.round(w.s.t * 10) / 10, kind: 'lose', text: 'sljedeća obavijest neće stići', tone: 'warn', clock: D.clock(w.s) })
}

/** Fast-forward to a day minute (in 1 s chunks, so goal flags see every state on the way). */
export function skipTo(w: World, minute: number): void {
  const s = w.s
  let guard = 0
  while (!s.finished && D.dayMinute(s) + 1e-6 < minute && guard++ < 2000) {
    const left = (minute - D.dayMinute(s)) / s.cfg.minutesPerSecond
    D.advanceDesiredState(s, Math.min(1, left))
    after(w)
  }
}

// ---------------------------------------------------------------- read-only views

/** Scores of the run so far; a loop run counts only from the handover (the manual part is its own column). */
export function snapshot(w: World): Snapshot {
  const sl = D.davorSleep(w.s)
  const sc = w.s.scores
  const b = w.kind === 'loop' && w.base ? w.base : { missing: 0, actions: 0, wrong: 0, slept: 0, night: 0 }
  return {
    kind: w.kind,
    clock: D.clock(w.s),
    handedAt: w.handedAt,
    missing: Math.round(sc.missingInstanceMinutes - b.missing),
    wrong: sc.wrongPlacements - b.wrong,
    actions: sc.manualActions - b.actions,
    slept: Math.round(sl.sleptMinutes - b.slept),
    night: Math.round(sl.nightMinutes - b.night),
    finished: w.s.finished,
  }
}

const APP_WORDS: Record<string, string> = { api: 'klopa-api', worker: 'klopa-worker', wrk: 'klopa-worker', web: 'klopa-web' }

/** Engine log lines use the internal app ids („želja: worker 12 → 13”); the lecture always says klopa-api / klopa-worker / klopa-web. */
export function prettyEventText(text: string): string {
  return text.replace(/(?<![\w-])(api|worker|wrk|web)(?![\w-])/g, (m) => APP_WORDS[m] ?? m)
}

export interface AppView {
  app: AppMeta
  desired: number
  /** running copies of any version (an old version still serves) */
  running: number
  /** every copy of the app that exists (running or dashed, any version) */
  total: number
  /** copies a human would still have to start */
  missing: number
  outdated: number
  unplaced: number
}

export function appViews(s: Sim): AppView[] {
  return APPS.map((app) => {
    const mine = s.instances.filter((i) => i.app === app.id)
    const desired = s.desired[app.id] ?? 0
    return {
      app,
      desired,
      running: mine.filter((i) => i.state === 'running').length,
      total: mine.length,
      missing: Math.max(0, desired - mine.filter((i) => i.version === s.version[app.id]).length - mine.filter((i) => i.version !== s.version[app.id] && i.state === 'running').length),
      outdated: mine.filter((i) => i.version !== s.version[app.id]).length,
      unplaced: mine.filter((i) => i.serverId === null).length,
    }
  })
}

export type DavorMood = 'smile' | 'worry' | 'flat' | 'grin'
export interface DavorView {
  mood: DavorMood
  buzz: boolean
  asleep: boolean
  holding: 'pager' | 'mug'
  lines: string[] | null
  /** a red margin note: capacity missing and nobody knows */
  unnoticed: boolean
}

export function davorView(s: Sim): DavorView {
  const m = D.dayMinute(s) % (24 * 60)
  const night = m >= s.cfg.nightStartMinute && m < s.cfg.nightEndMinute
  const def = D.deficit(s)
  const paged = s.alerts.some((a) => !a.lost && s.t - a.t < 3600)
  if (s.mode === 'loop') {
    if (night) return { mood: 'flat', buzz: false, asleep: true, holding: 'pager', lines: null, unnoticed: false }
    return { mood: 'grin', buzz: false, asleep: false, holding: 'mug', lines: def > 0 ? ['Petlja to', 'riješi.'] : ['Kava na', 'miru.'], unnoticed: false }
  }
  if (def > 0 && night && paged) return { mood: 'worry', buzz: true, asleep: false, holding: 'pager', lines: ['Što je radilo', 'gdje?!'], unnoticed: false }
  if (def > 0 && night) return { mood: 'flat', buzz: false, asleep: true, holding: 'pager', lines: null, unnoticed: true }
  // the notification was lost: Davor does not know anything is missing
  if (def > 0 && !paged) return { mood: 'smile', buzz: false, asleep: false, holding: 'mug', lines: ['Sve radi.', 'Valjda?'], unnoticed: true }
  if (def > 0) return { mood: 'worry', buzz: true, asleep: false, holding: 'pager', lines: [`Još ${def} ručno…`], unnoticed: false }
  if (night) return { mood: 'flat', buzz: false, asleep: true, holding: 'pager', lines: null, unnoticed: false }
  return { mood: 'smile', buzz: false, asleep: false, holding: 'mug', lines: ['Sve radi.', 'Zasad.'], unnoticed: false }
}

/** Seconds (sim) until the next loop pass, and whether one just happened (for the ✓ flash). */
export function loopTiming(s: Sim): { next: number; justPassed: boolean } {
  const last = s.nextLoopAt - s.cfg.loopPeriodS
  return { next: Math.max(0, s.nextLoopAt - s.t), justPassed: s.mode === 'loop' && s.t - last < 1.2 }
}

export const clock = D.clock
export const dayMinute = D.dayMinute
export const deficit = D.deficit
export const freeSlots = D.freeSlots
export const usedSlots = D.usedSlots
export const runningCount = D.runningCount
