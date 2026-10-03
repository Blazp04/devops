/**
 * „Prozor otkrivanja”: one headless E1 run per setting. Rack S1/S2/S3, kružno, λ 15, seed 42, probes not staggered
 * (every probe at a multiple of the interval). S3 fails between two probes; we record its probes, the moment the
 * load balancer takes it out of rotation, and every request that failed because it was sent there meanwhile.
 */
import { crashServer, createTraffic, hangServer, lastIncident, runUntil, type ProbeRecord } from '../../../engines/traffic'

export type FaultKind = 'crash' | 'hang'

export interface DetectionRun {
  intervalMs: number
  threshold: number
  timeoutMs: number
  kind: FaultKind
  /** the last passing probe before the failure */
  lastPassAt: number
  failAt: number
  /** taken out of rotation (null = not within the run) */
  detectedAt: number | null
  probes: ProbeRecord[]
  /** arrival times of the requests that failed because they were sent to S3 before detection */
  failedArrivals: number[]
  failedBeforeDetection: number
}

/** phase 0 = right after a passing probe (worst case, ≈ U·I), 1 = just before the next probe (best case, ≈ (U−1)·I). */
export function detectionRun(intervalMs: number, threshold: number, phase: number, kind: FaultKind): DetectionRun {
  const s = createTraffic({
    seed: 42,
    mode: 'lb',
    lambda: 15,
    algo: 'rr',
    healthCheck: { intervalMs, unhealthyThreshold: threshold, stagger: false },
    lifecycle: { autoRestart: false },
    visual: { flights: false },
  })
  const T0 = Math.ceil(10_000 / intervalMs) * intervalMs
  const failAt = T0 + 10 + Math.round((Math.max(0, Math.min(1, phase)) * (intervalMs - 20)) / 10) * 10
  runUntil(s, failAt)
  if (kind === 'crash') crashServer(s, 's3', { autoRestart: false })
  else hangServer(s, 's3')
  const failed = new Map<number, number>()
  const probes = new Map<number, ProbeRecord>()
  const s3 = s.servers.find((v) => v.id === 's3')
  const keepProbes = () => {
    for (const p of s3?.probes ?? []) if (p.t >= T0) probes.set(p.t, p)
  }
  keepProbes()
  const end = failAt + threshold * intervalMs + s.cfg.healthCheck.timeoutMs + s.cfg.clientTimeoutMs + 1000
  // step in 0,5 s chunks so no finished request falls out of the engine's ring of the last 200 before we read it
  for (let t = failAt; t < end; t = Math.min(end, t + 500)) {
    runUntil(s, Math.min(end, t + 500))
    for (const r of s.recent) if (r.server === 's3' && r.outcome !== 'ok' && r.t0 >= failAt - 6000) failed.set(r.id, r.t0)
    keepProbes()
  }
  const inc = lastIncident(s)
  const detectedAt = inc?.detectedAt ?? null
  const arrivals = [...failed.values()].filter((t) => detectedAt === null || t <= detectedAt).sort((a, b) => a - b)
  return {
    intervalMs,
    threshold,
    timeoutMs: s.cfg.healthCheck.timeoutMs,
    kind,
    lastPassAt: T0,
    failAt,
    detectedAt,
    probes: [...probes.values()].sort((a, b) => a.t - b.t),
    failedArrivals: arrivals,
    failedBeforeDetection: inc?.failedBeforeDetection ?? 0,
  }
}

/** Each probe with the number of consecutive failures after it (what the redar's clipboard would show). */
export function withStreaks(probes: ProbeRecord[]): { p: ProbeRecord; n: number }[] {
  const out: { p: ProbeRecord; n: number }[] = []
  let streak = 0
  for (const p of probes) {
    streak = p.outcome === 'pass' ? 0 : streak + 1
    out.push({ p, n: streak })
  }
  return out
}
