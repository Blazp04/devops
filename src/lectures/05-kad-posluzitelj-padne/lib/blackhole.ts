/**
 * „Crna rupa”: the incident replay (lib/flagship.ts) once per load-balancer setting, run headless to just after the
 * load balancer stops sending to S3. Counts come straight from the engine's incident record.
 */
import { lastIncident, runUntil, schedule, type Algo } from '../../../engines/traffic'
import { CRASH_AT_MS, INCIDENT_CONTROLS, createReplay } from './flagship'

export interface HoleRow {
  id: string
  label: string
  failed: number
  retried: number
  /** requests the LB sent to S3 between the crash and the moment it noticed, and all requests in that time */
  toS3: number
  routed: number
  /** requests S3 was working on (or had queued) at the instant its process crashed – they fail too */
  inside: number
  detectionMs: number | null
}

const VARIANTS: { id: string; label: string; algo: Algo; passive?: boolean; retry?: boolean }[] = [
  { id: 'rr', label: 'kružno', algo: 'rr' },
  { id: 'wrr', label: 'težinsko kružno', algo: 'wrr' },
  { id: 'lc', label: 'najmanje veza', algo: 'lc' },
  { id: 'lc-passive', label: 'najmanje veza + pasivna provjera', algo: 'lc', passive: true },
  { id: 'lc-retry', label: 'najmanje veza + ponovni pokušaj', algo: 'lc', retry: true },
]

export function blackHoleRows(): HoleRow[] {
  return VARIANTS.map((v) => {
    const w = createReplay({ ...INCIDENT_CONTROLS, algo: v.algo, passive: !!v.passive, retry: !!v.retry })
    const s = w.s
    // the state just before the crash tick (the scripted crash runs first thing in the tick at CRASH_AT_MS)
    runUntil(s, CRASH_AT_MS)
    const s3 = s.servers.find((x) => x.id === 's3')
    const inside = s3 ? s3.inflight.length + s3.queue.length : 0
    const before = s.servers.map((x) => x.routed)
    let after: number[] = []
    schedule(s, CRASH_AT_MS + 2000, (st) => (after = st.servers.map((x) => x.routed)))
    runUntil(s, CRASH_AT_MS + 4000)
    const inc = lastIncident(s)
    const routed = after.reduce((a, b, i) => a + b - (before[i] ?? 0), 0)
    return {
      id: v.id,
      label: v.label,
      failed: inc ? inc.failedBeforeDetection : 0,
      retried: s.totals.retried,
      toS3: (after[2] ?? 0) - (before[2] ?? 0),
      routed,
      inside,
      detectionMs: inc && inc.detectedAt !== null ? inc.detectedAt - inc.t0 : null,
    }
  })
}
