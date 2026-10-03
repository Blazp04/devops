/**
 * „4 GB ili 8 GB?” – the check after the prediction: exactly the same traffic (seed 42, 10 s warm-up + 5 min) on two
 * servers that differ only in RAM (2 vCPU / 4 GB and 2 vCPU / 8 GB). Runs headless on the E1 engine (`mode: 'direct'`,
 * one server, no load balancer), so it is the same model as every other simulation in the lecture.
 */
import { capacityOf, runScenario, type TrafficState } from '../../../engines/traffic'

export type DuelLambda = 9 | 12
export const DUEL_RAM = [4, 8] as const
export const DUEL_VCPU = 2

export interface DuelResult {
  ramGB: number
  /** radnici that fit in RAM */
  W: number
  okRps: number
  /** CPU utilisation 0..1 over the measured 5 min */
  cpu: number
  /** average radnici busy at the same moment */
  busy: number
  errPct: number
  p95: number | null
}

/** Both servers on the same seeded traffic. Deterministic: the same λ always gives the same numbers. */
export function runDuel(lambda: DuelLambda): DuelResult[] {
  return DUEL_RAM.map((ramGB) => {
    const samples: number[] = []
    const sample = (s: TrafficState) => {
      samples.push(s.servers[0]?.inflight.length ?? 0)
    }
    const actions = Array.from({ length: 300 }, (_, i) => ({ atS: 10.5 + i, run: sample }))
    const r = runScenario({
      config: { seed: 42, mode: 'direct', servers: [{ id: 's1', name: `${ramGB} GB`, vcpu: DUEL_VCPU, ramGB }], workload: 'api', lambda },
      warmupS: 10,
      measureS: 300,
      actions,
    })
    return {
      ramGB,
      W: capacityOf(DUEL_VCPU, ramGB, 'api').W,
      okRps: r.okRps,
      cpu: r.servers[0]?.cpu ?? 0,
      busy: samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0,
      errPct: r.errPct,
      p95: r.p95,
    }
  })
}
