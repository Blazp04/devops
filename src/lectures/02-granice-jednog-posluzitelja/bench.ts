/**
 * „Jezgre ili RAM?”: the same server (2 or 4 vCPU) under 30 requests/s, measured headless with the E1 engine
 * (λ 30, 10 s warm-up + 120 s, seed 42 — the l02-ram-io-* presets for I/O at 2 vCPU: 5,7 / 13,3 / 26,9 odgovora/s).
 * Runs are cached per workload, vCPU and RAM size (each takes a few ms).
 */
import { capacityOf, runScenario, singleServer, type RunReport, type WorkloadId } from '../../engines/traffic'
import { fmt } from '../../kit'
import { fmtEur, priceOf, residentRamMB } from './model'
import type { PlateState, StageView } from './view'

export const BENCH_LAMBDA = 30
export const BENCH_VCPUS = [2, 4] as const
export type BenchVcpu = (typeof BENCH_VCPUS)[number]
export const BENCH_RAM = [2, 4, 8] as const
export type BenchRam = (typeof BENCH_RAM)[number]
export type BenchWorkload = Extract<WorkloadId, 'api' | 'io'>

const cache = new Map<string, RunReport>()

export function benchRun(workload: BenchWorkload, vcpu: BenchVcpu, ramGB: BenchRam): RunReport {
  const key = `${workload}|${vcpu}|${ramGB}`
  let r = cache.get(key)
  if (!r) {
    r = runScenario({
      config: { seed: 42, mode: 'direct', servers: singleServer(vcpu, ramGB), workload, lambda: BENCH_LAMBDA },
      warmupS: 10,
      measureS: 120,
    })
    cache.set(key, r)
  }
  return r
}

/** The server as it looked at the end of the measured run (radnici, queue, CPU over the run). */
export function benchView(workload: BenchWorkload, vcpu: BenchVcpu, ramGB: BenchRam): StageView {
  const r = benchRun(workload, vcpu, ramGB)
  const v = r.state.servers[0]
  const W = capacityOf(vcpu, ramGB, workload).W
  let cpu = 0
  let io = 0
  for (const q of v.inflight) {
    if (q.cpuLeft > 0) cpu++
    else io++
  }
  const plates: PlateState[] = Array.from({ length: W }, (_, i) => (i < cpu ? 'cpu' : i < cpu + io ? 'io' : 'free'))
  const util = r.servers[0].cpu
  return {
    offered: BENCH_LAMBDA,
    burstNote: null,
    students: 6,
    tap: true,
    name: 'Klopa',
    spec: `${vcpu} vCPU · ${ramGB} GB · ${fmtEur(priceOf(vcpu, ramGB))}/mj.`,
    cores: Array.from({ length: vcpu }, () => util),
    plates,
    workers: `${v.inflight.length}/${W}`,
    queue: v.queue.length,
    queueMax: r.state.cfg.queueMax,
    mood: 'panic',
    stamp: null,
    footer: `CPU ${fmt.pct(util)} · RAM ${fmt.num(residentRamMB(r.state, v) / 1024, 1)}/${ramGB} GB`,
    footerBad: false,
    dbWaiting: io,
    trays: [],
    fallLabel: null,
    parked: 0,
    davor: null,
    dim: false,
  }
}
