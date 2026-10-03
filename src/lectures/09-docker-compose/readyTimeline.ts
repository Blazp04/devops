import { BACKOFF, CONNECT_AT, DEPENDENT_DELAY, READY_AT } from './model'

/* The start-up timeline of db and api, computed from the flagship model's constants (so the stepper and the sim agree). */

export type SegKind = 'wait' | 'start' | 'up' | 'pause' | 'exited'
export interface Seg {
  from: number
  to: number
  kind: SegKind
  /** what happens at the end of the segment */
  end?: 'fail' | 'ok' | 'crash'
  label?: string
}

export const AXIS = 12

export function apiTimeline(healthy: boolean, restart: boolean, crashAt?: number): Seg[] {
  const dbReady = READY_AT.db
  const out: Seg[] = []
  let k = 0
  let t = healthy ? dbReady : DEPENDENT_DELAY
  out.push(healthy ? { from: 0, to: dbReady, kind: 'wait', label: 'Created · čeka zdrav db' } : { from: 0, to: DEPENDENT_DELAY, kind: 'wait' })
  for (;;) {
    const attempt = t + CONNECT_AT
    if (attempt < dbReady) {
      out.push({ from: t, to: attempt, kind: 'start', end: 'fail' })
      if (!restart) {
        out.push({ from: attempt, to: AXIS, kind: 'exited', label: 'Exited (1)' })
        return out
      }
      const p = BACKOFF[Math.min(k++, BACKOFF.length - 1)]
      out.push({ from: attempt, to: attempt + p, kind: 'pause', label: `↻ ${p} s` })
      t = attempt + p
      continue
    }
    out.push({ from: t, to: t + READY_AT.api, kind: 'start', end: 'ok' })
    t += READY_AT.api
    break
  }
  if (crashAt === undefined) {
    out.push({ from: t, to: AXIS, kind: 'up', label: 'Up' })
    return out
  }
  out.push({ from: t, to: crashAt, kind: 'up', label: 'Up', end: 'crash' })
  const p = BACKOFF[0]
  out.push({ from: crashAt, to: crashAt + p, kind: 'pause', label: `↻ ${p} s` })
  out.push({ from: crashAt + p, to: crashAt + p + READY_AT.api, kind: 'start', end: 'ok' })
  out.push({ from: crashAt + p + READY_AT.api, to: AXIS, kind: 'up' })
  return out
}

/** When api first reaches the database (s, sim). */
export function firstConnect(healthy: boolean): number {
  return apiTimeline(healthy, true).find((s) => s.kind === 'start' && s.end === 'ok')!.from + CONNECT_AT
}
