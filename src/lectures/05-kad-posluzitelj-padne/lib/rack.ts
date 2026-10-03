/** Drawing helpers shared by the lecture's rack drawings (flagship, four faults, carts). Pure functions, no React. */
import type { ServerMood } from '../../../kit'
import type { ErrCode, Flight, Proc, ServerState, TrafficState } from '../../../engines/traffic'

export type P = [number, number]

/** What the face in the porthole shows: the truth about the process (never what the LB thinks). */
export function moodOf(proc: Proc, cpu: number): ServerMood {
  if (proc === 'crashed' || proc === 'off' || proc === 'exited') return 'dead'
  if (proc === 'hung') return 'busy'
  if (proc === 'starting' || proc === 'booting') return 'calm'
  return cpu >= 0.9 ? 'panic' : cpu >= 0.6 ? 'busy' : 'calm'
}

export interface StampSpec {
  text: string
  tone: 'red' | 'pen' | 'green' | 'ink'
}

/** Rubber stamp on the card for a process that is not simply running. */
export function stampOf(v: Pick<ServerState, 'proc' | 'draining' | 'drained'>): StampSpec | null {
  switch (v.proc) {
    case 'crashed':
      return { text: 'SRUŠEN', tone: 'red' }
    case 'off':
      return { text: 'UGAŠEN', tone: 'red' }
    case 'hung':
      return { text: 'ZAMRZNUT', tone: 'red' }
    case 'starting':
      return { text: 'POKREĆE SE', tone: 'pen' }
    case 'booting':
      return { text: 'DIŽE SE', tone: 'pen' }
    default:
      if (v.draining) return v.drained ? { text: 'ISPRAŽNJEN', tone: 'green' } : { text: 'PRAZNI SE', tone: 'pen' }
      return null
  }
}

export type LbMark = 'ok' | 'warn' | 'bad' | 'drain'

/** One line of the redar's clipboard: what the load balancer believes about a server (`short`: ≤ 11 characters, for phones). */
export function lbLine(s: TrafficState, v: ServerState, short = false): { mark: LbMark; text: string } {
  if (v.draining) return v.drained ? { mark: 'ok', text: 'ispražnjen' } : { mark: 'drain', text: 'prazni se' }
  if (s.cfg.passive.enabled && s.t < v.ejectedUntil) return { mark: 'bad', text: short ? 'izbačen' : 'izbačen 10 s' }
  if (s.cfg.healthCheck.enabled && !v.healthy) {
    const H = s.cfg.healthCheck.healthyThreshold
    if (v.hcOks > 0) return { mark: 'warn', text: short ? `vraća ${v.hcOks}/${H}` : `vraća se ${v.hcOks}/${H}` }
    return v.everHealthy ? { mark: 'bad', text: 'izbačen' } : { mark: 'warn', text: short ? `čeka 0/${H}` : 'čeka provjere' }
  }
  if (v.hcFails > 0) return { mark: 'warn', text: `${v.hcFails}/${s.cfg.healthCheck.unhealthyThreshold} neusp.` }
  return { mark: 'ok', text: 'u prometu' }
}

export const ERR_SHORT: Record<string, string> = { '502': '502', '503': '503', '504': '504', refused: 'odbijeno' }

export function isErr(o: Flight['outcome']): o is ErrCode {
  return o !== 'ok' && o !== 'waiting'
}

/** How long a failed tray lies on the floor with its ✗ (ms), per the motion rules (~0,9 s). */
export const DROP_MS = 900

/** A probe sent within the last `ms` (for the „kuc-kuc” note): its outcome, or null. */
export function recentProbe(v: ServerState, now: number, ms = 600): 'pass' | 'fail' | 'timeout' | 'pending' | null {
  const last = v.probes[v.probes.length - 1]
  if (!last) return null
  if (now < last.t || now - last.t > ms) return null
  return now < last.at ? 'pending' : last.outcome
}

/** Brain i of a server with `vcpu` cores at CPU share `cpu` (0..1): how full it is drawn (0..1). */
export function brainFill(i: number, vcpu: number, cpu: number): number {
  return Math.max(0, Math.min(1, cpu * vcpu - i))
}

/** Point at fraction t (0..1) along a polyline at constant speed. */
export function along(path: P[], t: number): P {
  if (path.length === 1 || t <= 0) return path[0]
  let total = 0
  const lens: number[] = []
  for (let i = 1; i < path.length; i++) {
    const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1])
    lens.push(l)
    total += l
  }
  let d = Math.min(1, t) * total
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const k = lens[i] ? Math.min(1, d / lens[i]) : 1
      return [path[i][0] + (path[i + 1][0] - path[i][0]) * k, path[i][1] + (path[i + 1][1] - path[i][1]) * k]
    }
    d -= lens[i]
  }
  return path[path.length - 1]
}

/** Little SVG pie for a timeout clock: filled share f (0..1) of a circle of radius r at (0, 0). */
export function piePath(f: number, r: number): string {
  const a = Math.max(0.001, Math.min(0.999, f)) * Math.PI * 2
  const x = Math.sin(a) * r
  const y = -Math.cos(a) * r
  return `M0 0 L0 ${-r} A${r} ${r} 0 ${a > Math.PI ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`
}

/** Height of the redar's clipboard (LbClipboard) with n lines. */
export function clipboardHeight(n: number): number {
  return 40 + n * 23
}

/** A failed request to draw on the floor: where it failed ('lb' or a server id), its code and when (sim ms). */
export interface Drop {
  id: number
  at: string
  code: string
  t: number
}

/** The engine prunes a flight the moment it lands, so failures are copied out after every step (bounded list). */
export interface DropLog {
  lastId: number
  list: Drop[]
}

export function newDropLog(): DropLog {
  return { lastId: 0, list: [] }
}

/**
 * Copy new failed flights into the drop log. An attempt the LB retries elsewhere (a bounce follows it) is not a
 * failure the client sees, so it does not fall.
 */
export function collectDrops(s: TrafficState, log: DropLog) {
  const retried = new Set<number>()
  for (const f of s.flights) if (f.id > log.lastId && f.bounce) retried.add(f.reqId)
  for (const f of s.flights) {
    if (f.id <= log.lastId) continue
    if (!f.bounce && isErr(f.outcome) && !(f.dir === 'in' && retried.has(f.reqId))) {
      if (f.dir === 'in') log.list.push({ id: f.id, at: f.to, code: String(f.outcome), t: f.t0 + f.durationMs })
      else log.list.push({ id: f.id, at: f.from, code: String(f.outcome), t: f.t0 })
    }
  }
  for (const f of s.flights) if (f.id > log.lastId) log.lastId = f.id
  const now = s.t
  while (log.list.length && (log.list.length > 80 || now - log.list[0].t > DROP_MS * 2)) log.list.shift()
}

/** Running offsets for things laid end to end (capacity boxes on a shelf, rows of a table). */
export function offsets(sizes: number[], start = 0): number[] {
  const out: number[] = []
  let acc = start
  for (const v of sizes) {
    out.push(acc)
    acc += v
  }
  return out
}
