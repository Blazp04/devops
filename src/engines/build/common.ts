/** Shared helpers for the E4 „Tvornica” engine: events, Croatian formatting, digests, fixed-step clock. */

export type EventTone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral'

/** One line for the kit's EventLog (text is short, neutral Croatian). */
export interface EngineEvent {
  /** Increasing per model (1, 2, 3 …): a stable React key even for two identical events at the same t */
  id: number
  /** Simulated time in seconds */
  t: number
  /** Machine-readable kind, e.g. 'build-done', 'scan-failed' */
  kind: string
  text: string
  tone: EventTone
}

/** Events kept in a model (the kit shows the newest few). */
export const MAX_EVENTS = 50

/**
 * Append an event (and drop the oldest beyond MAX_EVENTS). The id continues from the newest kept event,
 * so ids stay unique and increasing without a separate counter in the model.
 */
export function pushEvent(events: EngineEvent[], t: number, kind: string, text: string, tone: EventTone = 'neutral'): EngineEvent {
  const ev: EngineEvent = { id: (events[events.length - 1]?.id ?? 0) + 1, t, kind, text, tone }
  events.push(ev)
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS)
  return ev
}

/** Events added after the one with id `afterId` (for „Sljedeći događaj” buttons). */
export function eventsSince(events: readonly EngineEvent[], afterId: number): EngineEvent[] {
  return events.filter((e) => e.id > afterId)
}

/**
 * Events ready for a log list, newest first: `key` is unique (the event id – two identical events at the same t
 * stay distinct) and `timeLabel` is formatted with `formatTime` (default „4,2 s”). The pipeline's t runs into
 * thousands of seconds: pass `fmtSeconds` („1 h 30 min”) or `(t) => wallClock(state, t)` („11:59”) there.
 */
export function logEvents(events: readonly EngineEvent[], formatTime: (t: number) => string = fmtSeconds, max = 6): (EngineEvent & { key: string; timeLabel: string })[] {
  const n = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : 6
  return (n > 0 ? events.slice(-n) : [])
    .reverse()
    .map((e) => ({ ...e, key: `e${e.id}`, timeLabel: formatTime(e.t) }))
}

/** A value shortened for class next to the real default, so UIs can label „10 min (sim) · stvarno: 1 h”. */
export interface CompressedValue {
  simValue: number
  realValue: number
  unit: 's'
  /** Ready-made Croatian badge text */
  label: string
}

const nf1 = new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 1 })
const nf0 = new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 0 })

/** Round to 1e-9 to strip float noise (0.1 + 0.2) before formatting or comparing. */
export const clean = (v: number) => Math.round(v * 1e9) / 1e9

/**
 * A config number, or `fallback` when it is missing, NaN, ±Infinity or below `min` (default 0).
 * Keeps UI sliders and hand-written configs from putting NaN into a model.
 */
export function num(v: number | undefined, fallback: number, min = 0, max = Infinity): number {
  if (v === undefined || !Number.isFinite(v) || v < min) return fallback
  return Math.min(v, max)
}

/** Slowest transfer the engine accepts (MB/s). A 0 MB/s slider must not mean „infinitely fast”. */
export const MIN_MBPS = 0.1

/**
 * A transfer speed in MB/s: missing or NaN → `fallback`; anything below MIN_MBPS (0, negative) → MIN_MBPS.
 * A pull at 0,1 MB/s takes long, which is the honest answer for „no bandwidth”.
 */
export function rate(v: number | undefined, fallback: number): number {
  if (v === undefined || Number.isNaN(v)) return fallback
  if (v === Number.POSITIVE_INFINITY) return fallback
  return Math.max(MIN_MBPS, v)
}

/** Croatian duration: „0,2 s”, „4,2 s”, „44 s”, „9 min”, „14 min 50 s”, „1 h 5 min”. */
export function fmtSeconds(sec: number): string {
  if (!Number.isFinite(sec)) return 'n/a'
  const s = clean(Math.max(0, sec))
  if (s < 60) return `${s < 10 ? nf1.format(s) : nf0.format(Math.round(s))} s`
  if (s < 3600) {
    const m = Math.floor(s / 60)
    const r = Math.round(s - m * 60)
    if (r === 60) return `${m + 1} min`
    return r === 0 ? `${m} min` : `${m} min ${r} s`
  }
  const h = Math.floor(s / 3600)
  const m = Math.round((s - h * 3600) / 60)
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** Croatian size: „0,5 MB”, „50 MB”, „444 MB”, „1,7 GB” (1 GB = 1024 MB, like the Docker CLI). */
export function fmtMB(mb: number): string {
  if (!Number.isFinite(mb)) return 'n/a'
  const v = clean(Math.max(0, mb))
  if (v >= 1024) return `${nf1.format(v / 1024)} GB`
  if (v < 10) return `${nf1.format(v)} MB`
  return `${nf0.format(Math.round(v))} MB`
}

/**
 * Wall-clock label for a sim time, from an origin like „11:48” (L24 „Petak, 11:55”).
 * Returns „HH:MM”, or „HH:MM:SS” with `withSeconds`. Bad origins fall back to 09:00.
 */
export function clockLabel(origin: string, t: number, withSeconds = false): string {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(origin.trim())
  const base = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0) : 9 * 3600
  const total = Math.floor(base + (Number.isFinite(t) ? Math.max(0, t) : 0) + 1e-6)
  const h = Math.floor(total / 3600) % 24
  const min = Math.floor((total % 3600) / 60)
  const sec = total % 60
  const two = (n: number) => String(n).padStart(2, '0')
  return withSeconds ? `${two(h)}:${two(min)}:${two(sec)}` : `${two(h)}:${two(min)}`
}

/** „sha256:9f2c41ab07e3” – the short form shown on cards (12 hex characters like `docker images`). */
export function shortDigest(digest: string | null | undefined, hexChars = 12): string {
  if (!digest) return '—'
  const [algo, hex] = digest.includes(':') ? digest.split(':') : ['sha256', digest]
  return `${algo}:${hex.slice(0, hexChars)}`
}

/**
 * Fixed-timestep driver shared by both models: `acc += dt; while (acc >= DT) tick()`.
 * Discrete events inside a tick are processed at their exact times by the caller,
 * so results never depend on how the host splits `dt`.
 */
export interface Clock {
  /** Simulated seconds */
  t: number
  /** Whole fixed steps taken */
  tick: number
  /** Unconsumed time */
  acc: number
  /** Fixed step length in seconds */
  DT: number
}

export function createClock(DT: number): Clock {
  return { t: 0, tick: 0, acc: 0, DT }
}

/** Advance the clock by `dt`; calls `onTick(tEnd)` once per fixed step (tEnd = time at the end of that step). */
export function advanceClock(clock: Clock, dt: number, onTick: (tEnd: number) => void): void {
  if (!(dt > 0) || !Number.isFinite(dt)) return
  clock.acc += dt
  // Small epsilon so 60 × (1/60) reliably makes one 1 s worth of 0.05 s steps.
  while (clock.acc >= clock.DT - 1e-9) {
    clock.acc -= clock.DT
    if (clock.acc < 0) clock.acc = 0
    const tEnd = clean((clock.tick + 1) * clock.DT)
    onTick(tEnd)
    clock.tick += 1
    clock.t = tEnd
  }
}
