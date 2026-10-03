/**
 * „Pad, gašenje, zastoj ili pražnjenje”: four identical E1 runs side by side (same seed, same traffic). Each has two
 * equal servers A and B behind the load balancer (kružno, 8 zahtjeva/s); on „Pokreni kvarove” server A gets a
 * different fault in each run, at the same instant.
 */
import { crashServer, createTraffic, drainServer, hangServer, powerOff, stepTraffic, type TrafficState } from '../../../engines/traffic'
import { collectDrops, newDropLog, type DropLog } from './rack'

export type FaultId = 'crash' | 'off' | 'hang' | 'drain'

export const FAULTS: { id: FaultId; title: string; note: string }[] = [
  { id: 'crash', title: 'Pad procesa', note: 'port zatvoren' },
  { id: 'off', title: 'Ugašen stroj', note: 'nema ni odbijanja' },
  { id: 'hang', title: 'Zastoj', note: 'prima, ne odgovara' },
  { id: 'drain', title: 'Pražnjenje', note: 'ne prima nove' },
]

export interface Lane {
  id: FaultId
  s: TrafficState
  drops: DropLog
  /** drain: when A first became safe to remove (sim ms) */
  safeAt: number | null
}

export interface FaultsState {
  lanes: Lane[]
  faultAt: number | null
}

export function createFaults(): FaultsState {
  return {
    faultAt: null,
    lanes: FAULTS.map((f) => ({
      id: f.id,
      s: createTraffic({
        seed: 42,
        mode: 'lb',
        servers: [
          { id: 'a', name: 'A', vcpu: 2, ramGB: 4 },
          { id: 'b', name: 'B', vcpu: 2, ramGB: 4 },
        ],
        lambda: 8,
        algo: 'rr',
        healthCheck: { stagger: false },
        lifecycle: { autoRestart: false },
      }),
      drops: newDropLog(),
      safeAt: null,
    })),
  }
}

export function stepFaults(st: FaultsState, dt: number) {
  for (const l of st.lanes) {
    stepTraffic(l.s, dt)
    collectDrops(l.s, l.drops)
    const a = l.s.servers.find((v) => v.id === 'a')
    if (l.id === 'drain' && a && a.drained && l.safeAt === null) l.safeAt = l.s.t
  }
}

/** The same instant in all four runs (they run in lock-step, so their clocks agree). */
export function applyFaults(st: FaultsState) {
  if (st.faultAt !== null) return
  st.faultAt = st.lanes[0].s.t
  for (const l of st.lanes) {
    if (l.id === 'crash') crashServer(l.s, 'a', { autoRestart: false })
    else if (l.id === 'off') powerOff(l.s, 'a')
    else if (l.id === 'hang') hangServer(l.s, 'a')
    else drainServer(l.s, 'a')
  }
}
