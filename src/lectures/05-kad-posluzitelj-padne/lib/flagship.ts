/**
 * Engine glue for the flagship simulation „Ugasite poslužitelj usred ručka” (E1 Promet, src/engines/traffic).
 * The incident replay is the engine's validated preset `l05-incident` (λ 15, najmanje veza, S3 pada u 60. sekundi,
 * provjere svake 2 s bez raspoređivanja, seed 42) with two lecture additions:
 *   - 20 users with carts (sessions on: lokalno · ljepljivo · Redis), which never changes the routing or arrivals;
 *   - the process supervisor restarts a crashed process (6 s + 3 s warm-up, the engine's classic-server default).
 * Numbers on the incident card (37 · 8,0 % · 249) come from exactly this run – see INCIDENT_NUMBERS.
 * The engine's rngStreams stay 'shared' (the validated 37 needs them), so changing a remedy also reshuffles the later
 * random draws: „Ispočetka” replays the same seed, not the very same arrivals. The lecture text says so.
 */
import {
  ALGO_NAME,
  SCENARIOS,
  configure,
  crashServer,
  createTraffic,
  mergeConfigInput,
  pushEvent,
  runUntil,
  schedule,
  since,
  type Algo,
  type Incident,
  type Mark,
  type RuntimePatch,
  type SessionAffinity,
  type SessionStore,
  type TrafficState,
} from '../../../engines/traffic'
import { collectDrops, newDropLog, type DropLog } from './rack'

export type SessionMode = 'local' | 'cookie' | 'redis'

/** The lecture's names for the algorithms (as in L04 and the controls) */
const ALGO_LABEL: Partial<Record<Algo, string>> = { rr: 'kružno', wrr: 'težinsko kružno', lc: 'algoritam najmanje veza' }

export const SESSION_NAME: Record<SessionMode, string> = { local: 'u memoriji poslužitelja', cookie: 'u memoriji, uz ljepljivi kolačić', redis: 'u Redisu' }

export interface FlagControls {
  lambda: number
  algo: Algo
  intervalMs: number
  threshold: number
  passive: boolean
  retry: boolean
  /** no healthy target → send to all of them anyway (AWS ALB) instead of answering 503 */
  failOpen: boolean
  sessions: SessionMode
}

/** The controls as they were on the day of the incident (the card's numbers need exactly these). */
export const INCIDENT_CONTROLS: FlagControls = { lambda: 15, algo: 'lc', intervalMs: 2000, threshold: 2, passive: false, retry: false, failOpen: false, sessions: 'local' }

export const INCIDENT_PRESET = 'Incident 12:03'
export const INCIDENT_SEED = 42
/** The scripted crash of S3 (12:03:00 on the sim clock) */
export const CRASH_AT_MS = 60_000
/** The replay starts 5 s before the crash (12:02:55) */
export const REPLAY_START_MS = 55_000

/** What the incident card shows; reproduced by createReplay(INCIDENT_CONTROLS) (checked in the lecture's verification). */
export const INCIDENT_NUMBERS = { lambda: 15, failedBeforeDetection: 37, errorPct30: 8.0, logouts30: 249, rrFailedBeforeDetection: 11 }

export function sessionsInput(m: SessionMode): { enabled: true; store: SessionStore; affinity: SessionAffinity } {
  return { enabled: true, store: m === 'redis' ? 'redis' : 'local', affinity: m === 'cookie' ? 'cookie' : 'none' }
}

export function patchOf(c: FlagControls): RuntimePatch {
  return {
    lambda: c.lambda,
    algo: c.algo,
    healthCheck: { intervalMs: c.intervalMs, unhealthyThreshold: c.threshold },
    passive: { enabled: c.passive },
    retry: c.retry,
    failOpen: c.failOpen,
    sessions: sessionsInput(c.sessions),
  }
}

/** Measurement window that follows one failure (incident) for the goals and the „zadnji pad” panel. */
export interface FailWindow {
  id: number
  server: string
  kind: Incident['kind']
  /** λ stayed at 15 during the whole 30 s window */
  lambdaOk: boolean
  /** Sessions lost in the 30 s after the failure (snapshot taken by an engine-scheduled action at t0 + 30 s) */
  logouts30: number | null
}

export interface FlagState {
  s: TrafficState
  windows: FailWindow[]
  /** Highest incident id already turned into a window */
  seen: number
  /** S2 drain watch: the system-wide totals when „Isprazni” was pressed on S2, and when S2 became empty (sim ms) */
  drain: { m: Mark; drainedAt: number | null } | null
  /** sessions already lost in the unseen pre-roll (the visible counter starts at 12:02:55) */
  logoutBase: number
  /** the controls currently applied (kept in the model, so a step never applies stale ones) */
  controls: FlagControls
  /** Failed trays still lying on the floor */
  drops: DropLog
}

/** The incident replay with the given controls (same seed ⇒ same lunch; „ispočetka” replays it). */
export function createReplay(c: FlagControls): FlagState {
  const base = SCENARIOS['l05-incident'].config
  const cfg = mergeConfigInput(base, { ...patchOf(c), lifecycle: { autoRestart: true } })
  const s = createTraffic({ ...cfg, script: [{ atMs: CRASH_AT_MS, label: 'Proces na S3 pada', run: (st) => crashServer(st, 's3') }] })
  const w: FlagState = { s, windows: [], seen: 0, drain: null, drops: newDropLog(), logoutBase: 0, controls: c }
  runUntil(s, REPLAY_START_MS)
  track(w)
  // the pre-roll is history: the log and the logout counter start at 12:02:55, where the student starts watching
  w.logoutBase = s.totals.sessionLost
  s.events.length = 0
  pushEvent(s, `Ručak u punom jeku: ${c.lambda} zahtjeva/s, ${ALGO_LABEL[c.algo] ?? ALGO_NAME[c.algo]}, košarice ${SESSION_NAME[c.sessions]}.`, 'info')
  return w
}

/** Apply the control values right away (also while paused). Unchanged values are no-ops in the engine. */
export function applyControls(w: FlagState, c: FlagControls) {
  w.controls = c
  configure(w.s, patchOf(c))
}

/** Bookkeeping after every step: open a window per new incident, watch λ during open windows. */
export function track(w: FlagState) {
  const s = w.s
  collectDrops(s, w.drops)
  if (w.drain) {
    const s2 = s.servers.find((v) => v.id === 's2')
    if (!s2 || !s2.draining) w.drain = null
    else if (s2.drained && w.drain.drainedAt === null) w.drain.drainedAt = s.t
  }
  for (const inc of s.incidents) {
    if (inc.id <= w.seen) continue
    w.seen = inc.id
    const win: FailWindow = { id: inc.id, server: inc.server, kind: inc.kind, lambdaOk: s.cfg.lambda === 15, logouts30: null }
    w.windows.push(win)
    if (w.windows.length > 12) w.windows.shift()
    schedule(s, inc.t0 + 30_000, (st) => {
      const now = st.incidents.find((x) => x.id === win.id)
      win.logouts30 = now ? now.sessionsLost : 0
    })
  }
  for (const win of w.windows) {
    const inc = s.incidents.find((x) => x.id === win.id)
    if (inc && !inc.after30s.done && s.cfg.lambda !== 15) win.lambdaOk = false
  }
}

/** How long S2 must stay out of traffic, with nothing failing anywhere, for the drain goal */
export const DRAIN_HOLD_MS = 10_000

export interface FlagGoals {
  crash: boolean
  drain: boolean
  sessions: boolean
}

/** Which goals the current state satisfies (the UI keeps them ticked once reached). */
export function goalsReached(w: FlagState): FlagGoals {
  const s = w.s
  let crash = false
  let sessions = false
  for (const win of w.windows) {
    const inc = s.incidents.find((x) => x.id === win.id)
    if (!inc || !inc.after30s.done) continue
    const n = inc.after30s.ok + inc.after30s.failed
    const rate = n > 0 ? inc.after30s.failed / n : 0
    if (win.server === 's3' && win.kind === 'crash' && win.lambdaOk && rate < 0.02) crash = true
    if (win.logouts30 === 0) sessions = true
  }
  // the drain counts only if no order failed anywhere from „Isprazni” until S2 has been empty for DRAIN_HOLD_MS –
  // draining without spare capacity (another server down) is not safe, even when S2 itself fails nothing
  const s2 = s.servers.find((v) => v.id === 's2')
  const d = w.drain
  const drain = !!(d && d.drainedAt !== null && s.t - d.drainedAt >= DRAIN_HOLD_MS && s2 && s2.proc === 'up' && since(s, d.m).errors.total === 0)
  return { crash, drain, sessions }
}

/** The most recent failure window with its incident (for the „zadnji pad” panel). */
export function lastWindow(w: FlagState): { win: FailWindow; inc: Incident } | null {
  for (let i = w.windows.length - 1; i >= 0; i--) {
    const inc = w.s.incidents.find((x) => x.id === w.windows[i].id)
    if (inc) return { win: w.windows[i], inc }
  }
  return null
}

/** Sim clock: the replay's t = 0 is 12:02:00, so the scripted crash happens at 12:03:00. */
export function menzaClock(ms: number): string {
  const total = 12 * 3600 + 2 * 60 + Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(h)}:${p(m)}:${p(sec)}`
}
