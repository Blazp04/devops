import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Tape } from '../doodles/Paper'
import { TickBox } from '../doodles/text-doodles'
import { fmt } from '../sim/math'

export interface Goal {
  /** Croatian task text, e.g. "Obradi 200 zahtjeva uz p95 < 300 ms i bez odbijenih zahtjeva." */
  text: ReactNode
  /** Computed by the lecture from the sim state; ticks with a pencil stroke when it becomes true. */
  done: boolean
}

/**
 * Challenge tasks for a simulation ("Zadaci") on a taped index card: a pencil box per task that gets a green tick
 * (drawn on the moment the lecture's code reports it done).
 */
export function Goals({ goals, title = 'Zadaci' }: { goals: Goal[]; title?: ReactNode }) {
  const doneCount = goals.filter((g) => g.done).length
  return (
    <div className="k-goals k-card k-retone">
      <Tape c="red" style={{ top: -11, left: '50%', marginLeft: -44, transform: 'rotate(-2deg)' }} />
      <div className="k-goals__head">
        <span className="k-goals__title">{title}</span>
        {/* the count is a polite live region: ticking a task off is announced */}
        <span className="k-goals__count mono" role="status">
          <span aria-hidden="true">
            {doneCount}/{goals.length}
          </span>
          <span className="visually-hidden">{`Riješeno ${doneCount} od ${goals.length}`}</span>
        </span>
      </div>
      <ul>
        {goals.map((g, i) => (
          <li key={i} className={g.done ? 'is-done' : undefined}>
            <TickBox checked={g.done} draw="mount" seed={5601 + i * 3} color="var(--ink-2)" className="k-goals__box" />
            <span>
              {g.text}
              {g.done && <span className="visually-hidden"> (riješeno)</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export interface SimEvent {
  /** Simulated time in seconds */
  t: number
  text: ReactNode
  tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'info'
  /** Stable key (give one when `text` is JSX, or when two events can share a time and text). */
  id?: string | number
}

/** The pencil mark in front of a note, so the tone never depends on colour alone. */
const TONE_GLYPH: Record<NonNullable<SimEvent['tone']>, string> = { ok: '✓', warn: '!', bad: '✗', info: '→', neutral: '·' }

/** Keys for the shown events: `id`, or time + text + a counter for repeats (JSX text has no useful string form). */
function eventKeys(shown: SimEvent[]): string[] {
  const seen = new Map<string, number>()
  return shown.map((e) => {
    if (e.id !== undefined) return `id:${e.id}`
    const base = `${e.t}|${typeof e.text === 'string' || typeof e.text === 'number' ? e.text : 'jsx'}`
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return `${base}|${n}`
  })
}

/** Announce only warnings and errors, at most one every 2 s (a burst of events must not flood a screen reader). */
const ANNOUNCE_GAP_MS = 2000

/** The default timestamp: simulated seconds, „12,3 s”. */
const simSeconds = (t: number) => `${fmt.num(t, 1)} s`

/**
 * Live log of what just happened in a simulation, written as the author's margin notes: a timestamp, a pencil mark
 * (✓ ! ✗) and a short handwritten line in the pencil of its meaning. Notes fade in / out (0,25 s).
 * `events` are in **chronological order** (push new ones at the end, trim the front); the log shows the last `max`,
 * newest on top. `formatTime` writes the timestamp (default „12,3 s”), e.g. a story clock: t => `12:${…}`.
 * Screen readers hear only warnings and errors, throttled; the visible log is unchanged.
 */
export function EventLog({ events, max = 6, title = 'Što se upravo dogodilo', formatTime = simSeconds }: { events: SimEvent[]; max?: number; title?: ReactNode; formatTime?: (t: number) => ReactNode }) {
  const shown = events.slice(-max).reverse()
  const keys = eventKeys(shown)
  const newest = shown[0]
  const newestKey = keys[0]
  const [said, setSaid] = useState<ReactNode>(null)
  const lastSaid = useRef(0)
  useEffect(() => {
    if (!newest || (newest.tone !== 'warn' && newest.tone !== 'bad')) return
    const now = performance.now()
    if (now - lastSaid.current < ANNOUNCE_GAP_MS) return
    lastSaid.current = now
    const t = window.setTimeout(() => setSaid(newest.text), 0)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- announce once per new event (its key), not per re-render
  }, [newestKey])
  return (
    <div className="k-events">
      <div className="k-events__title">{title}</div>
      <ol>
        <AnimatePresence initial={false}>
          {shown.map((e, i) => (
            <motion.li
              key={keys[i]}
              layout="position"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              data-tone={e.tone ?? 'neutral'}
            >
              <span className="k-events__t mono">{formatTime(e.t)}</span>
              <span className="k-events__text">
                <span className="k-events__glyph" aria-hidden="true">
                  {TONE_GLYPH[e.tone ?? 'neutral']}
                </span>{' '}
                {e.text}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
        {shown.length === 0 && <li className="k-events__empty">Još ništa – pokrenite simulaciju.</li>}
      </ol>
      <span className="visually-hidden" role="status">
        {said}
      </span>
    </div>
  )
}
