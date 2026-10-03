/**
 * Capacity arithmetic for worker-pool servers (sim-models SIM 1 "Derived quantities").
 *   W        = max(1, floor((RAM_MB − 512) / memMB))     1 GB→2, 2→6, 4→14, 8→30, 16→62
 *   cap_cpu  = vCPU · 1000 / cpuMs                        req/s
 *   cap_mem  = W · 1000 / (cpuMs + ioMs)                  req/s, optimistic
 *   capacity ≈ min(cap_cpu, cap_mem)
 */
import { BASE_RAM_MB, N_PLUS_ONE_MAX_UTILISATION, WORKLOADS } from './constants.ts'
import type { ServerSpec, Workload, WorkloadId } from './types.ts'

/** Worker pool sized to RAM. Non-finite or too-small RAM still gives one radnik. */
export function workersFor(ramGB: number, memMB = 256): number {
  const ramMB = Number.isFinite(ramGB) ? ramGB * 1024 : 0
  const per = memMB > 0 ? memMB : 256
  return Math.max(1, Math.floor((ramMB - BASE_RAM_MB) / per))
}

export interface Capacity {
  /** Number of radnici (workers) */
  W: number
  /** CPU-bound capacity, req/s */
  cpu: number
  /** RAM/worker-bound capacity, req/s (optimistic: no contention) */
  mem: number
  /** min(cpu, mem) */
  cap: number
  bound: 'cpu' | 'ram'
}

/**
 * Capacity of one server under a workload. `slowFactor` multiplies the CPU demand ('Sporiji procesor' = 3).
 * Zero / NaN inputs give 0 capacity instead of NaN.
 */
export function capacityOf(vcpu: number, ramGB: number, workload: Workload | WorkloadId, slowFactor = 1): Capacity {
  const wl = typeof workload === 'string' ? WORKLOADS[workload] : workload
  const W = workersFor(ramGB, wl.memMB)
  const slow = slowFactor > 0 && Number.isFinite(slowFactor) ? slowFactor : 1
  const cpuMs = wl.cpuMs * slow
  const cores = Number.isFinite(vcpu) && vcpu > 0 ? vcpu : 0
  const cpu = cpuMs > 0 ? (cores * 1000) / cpuMs : Infinity
  const mem = cpuMs + wl.ioMs > 0 ? (W * 1000) / (cpuMs + wl.ioMs) : Infinity
  const cap = Math.min(cpu, mem)
  return { W, cpu, mem, cap: Number.isFinite(cap) ? cap : 0, bound: cpu <= mem ? 'cpu' : 'ram' }
}

/** Weights ∝ capacity, smallest normalised to 1 (default rack + API → 1 : 2 : 4). */
export function suggestedWeights(specs: readonly Pick<ServerSpec, 'vcpu' | 'ramGB'>[], workload: Workload | WorkloadId = 'api'): number[] {
  const caps = specs.map((s) => capacityOf(s.vcpu, s.ramGB, workload).cap)
  const positive = caps.filter((c) => c > 0)
  const min = positive.length ? Math.min(...positive) : 1
  return caps.map((c) => Math.max(1, Math.min(100, Math.round(c / min))))
}

export interface NPlusOneReport {
  /** Total capacity of the given servers, req/s */
  total: number
  /** Capacity left after losing the largest server */
  withoutLargest: number
  offered: number
  /** offered / total */
  utilisation: number
  /** offered / withoutLargest (the survivors' load after one failure; 1 = 100 %, > 1 = overload) – show this number */
  utilisationAfterFailure: number
  /** Headroom target the check used (default N_PLUS_ONE_MAX_UTILISATION = 0.8) */
  maxUtilisation: number
  /**
   * true when the survivors stay at or below maxUtilisation after losing the largest server.
   * ρ = 1 is NOT ok: queues grow without bound (L02 hockey stick) – the engine shows ≈ 6 % errors and p95 ≈ 3.5 s there.
   */
  ok: boolean
}

/** N+1 planning: does the rack survive the loss of its largest server at this load, with headroom? */
export function nPlusOne(capacities: readonly number[], offered: number, maxUtilisation: number = N_PLUS_ONE_MAX_UTILISATION): NPlusOneReport {
  const caps = capacities.filter((c) => Number.isFinite(c) && c > 0)
  const total = caps.reduce((a, b) => a + b, 0)
  const largest = caps.length ? Math.max(...caps) : 0
  const withoutLargest = total - largest
  const off = Number.isFinite(offered) && offered > 0 ? offered : 0
  const target = Number.isFinite(maxUtilisation) && maxUtilisation > 0 ? maxUtilisation : N_PLUS_ONE_MAX_UTILISATION
  const after = withoutLargest > 0 ? off / withoutLargest : off > 0 ? Infinity : 0
  return {
    total,
    withoutLargest,
    offered: off,
    utilisation: total > 0 ? off / total : off > 0 ? Infinity : 0,
    utilisationAfterFailure: after,
    maxUtilisation: target,
    ok: caps.length > 1 && after <= target + 1e-12,
  }
}

/**
 * Lowest possible latency percentile of one request on an idle server (a full core, no queue):
 * ioMs + cpuMs·slow·(−ln(1 − p)), because CPU time is exponential and I/O fixed. The engine adds ≤ 10 ms (tick).
 * Use it to sanity-check goals: API p95 ≈ 899 ms, I/O p95 ≈ 1150 ms – „p95 < 1 s” is impossible on the I/O preset.
 */
export function latencyFloorMs(workload: Workload | WorkloadId, p: number, slowFactor = 1): number {
  const wl = typeof workload === 'string' ? WORKLOADS[workload] : workload
  if (!wl || !Number.isFinite(p)) return NaN
  const q = Math.min(1 - 1e-12, Math.max(0, p))
  const slow = slowFactor > 0 && Number.isFinite(slowFactor) ? slowFactor : 1
  return wl.ioMs + wl.cpuMs * slow * -Math.log(1 - q)
}
