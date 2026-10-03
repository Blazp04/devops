/**
 * Headless runs: warm up, then measure a window exactly like the validated prototype
 * (events at t ≤ warm-up are ignored; percentiles over every success in the window, nearest rank).
 */
import { createRng } from '../../kit/sim/math.ts'
import { DT_MS, WORKLOADS } from './constants.ts'
import { advance, createTraffic, mergeConfigInput, runUntil, schedule, sendRequest, tick } from './engine.ts'
import { deriveSeed } from './hashing.ts'
import { findRequest, nearestRank } from './selectors.ts'
import type { Algo, ErrCode, Incident, TrafficConfigInput, TrafficState } from './types.ts'

export interface RunAction {
  /** Simulated second at which to run the action (absolute, warm-up included) */
  atS: number
  label?: string
  run: (s: TrafficState) => void
}

export interface RunOptions {
  config?: TrafficConfigInput
  /** Ignored start-up period, s (default 10, as in the prototype) */
  warmupS?: number
  /** Measured period, s */
  measureS: number
  actions?: RunAction[]
}

export interface ServerRun {
  id: string
  name: string
  /** CPU utilisation over the measured period, 0..1 */
  cpu: number
  routed: number
  /** Share of routed requests, 0..1 */
  share: number
  handled: number
  ooms: number
}

export interface RunReport {
  measureS: number
  arrived: number
  ok: number
  /** Successes per second over the measured period */
  okRps: number
  /** Errors / (successes + errors) × 100 */
  errPct: number
  errors: { 502: number; 503: number; 504: number; refused: number; total: number }
  wasted: number
  retried: number
  sessionLost: number
  connections: number
  ooms: number
  p50: number | null
  p95: number | null
  p99: number | null
  meanLatency: number | null
  servers: ServerRun[]
  incidents: Incident[]
  state: TrafficState
}

/** Run a scenario headless (no flight entities) and report the measured window. */
export function runScenario(opts: RunOptions): RunReport {
  const cfg = opts.config ?? {}
  const s = createTraffic({ ...cfg, visual: { ...cfg.visual, flights: false } })
  for (const a of opts.actions ?? []) schedule(s, a.atS * 1000, a.run, a.label)
  const warm = Math.max(0, opts.warmupS ?? 10) * 1000
  const measure = Math.max(0, opts.measureS) * 1000
  const end = warm + measure
  // ticks t = 0 … warm are warm-up (the prototype counts only events with t > warm)
  runUntil(s, warm + DT_MS)
  const base = { ...s.totals }
  const routed0 = new Map<string, number>()
  const busy0 = new Map<string, number>()
  const handled0 = new Map<string, number>()
  const ooms0 = new Map<string, number>()
  for (const v of s.servers) {
    routed0.set(v.id, v.routed)
    busy0.set(v.id, v.busyCoreMsTotal)
    handled0.set(v.id, v.handled)
    ooms0.set(v.id, v.ooms)
  }
  const lats: number[] = []
  while (s.t < end) {
    const before = s.totals.ok
    tick(s)
    const d = s.totals.ok - before
    for (let i = s.oks.length - d; i < s.oks.length; i++) lats.push(s.oks[i].lat)
  }
  lats.sort((a, b) => a - b)
  const dt = (k: keyof typeof base) => s.totals[k] - base[k]
  const ok = dt('ok')
  const errors = { 502: dt('e502'), 503: dt('e503'), 504: dt('e504'), refused: dt('refused'), total: 0 }
  errors.total = errors[502] + errors[503] + errors[504] + errors.refused
  const measuredS = (s.t - warm - DT_MS) / 1000
  const routedAll = s.servers.reduce((a, v) => a + v.routed - (routed0.get(v.id) ?? 0), 0) || 1
  const enough = lats.length >= 20
  return {
    measureS: measuredS,
    arrived: dt('arrived'),
    ok,
    okRps: measuredS > 0 ? ok / measuredS : 0,
    errPct: ok + errors.total > 0 ? (100 * errors.total) / (ok + errors.total) : 0,
    errors,
    wasted: dt('wasted'),
    retried: dt('retried'),
    sessionLost: dt('sessionLost'),
    connections: dt('connections'),
    ooms: dt('ooms'),
    p50: enough ? nearestRank(lats, 0.5) : null,
    p95: enough ? nearestRank(lats, 0.95) : null,
    p99: enough ? nearestRank(lats, 0.99) : null,
    meanLatency: enough ? lats.reduce((a, b) => a + b, 0) / lats.length : null,
    servers: s.servers.map((v) => {
      const routed = v.routed - (routed0.get(v.id) ?? 0)
      return {
        id: v.id,
        name: v.name,
        cpu: measuredS > 0 && v.vcpu > 0 ? (v.busyCoreMsTotal - (busy0.get(v.id) ?? 0)) / (measuredS * 1000 * v.vcpu) : 0,
        routed,
        share: routed / routedAll,
        handled: v.handled - (handled0.get(v.id) ?? 0),
        ooms: v.ooms - (ooms0.get(v.id) ?? 0),
      }
    }),
    incidents: s.incidents,
    state: s,
  }
}

export interface LadderStep {
  /** Request number 1..n */
  n: number
  client: number
  /** CPU demand of this request (identical for every algorithm with the same seed), ms */
  cpuMs: number
  /** Server it was sent to (null = rejected before reaching one) */
  server: string | null
  /** Outcome right after routing: still in progress ('ok' so far), or the immediate error */
  outcome: 'inProgress' | 'queued' | 'ok' | ErrCode
}

/**
 * L04 „Ljestve algoritama”: the same n requests (same clients, same sizes) sent one every gapMs to a fresh rack with
 * no other traffic; returns where each one went. Run it once per algorithm and show the columns side by side.
 */
export function routeSequence(input: TrafficConfigInput, n = 12, gapMs = 250): LadderStep[] {
  const s = createTraffic(mergeConfigInput(input, { lambda: 0, visual: { flights: false } }))
  const wl = WORKLOADS[s.cfg.workload]
  const sizes = createRng(deriveSeed(s.cfg.seed, 7))
  const out: LadderStep[] = []
  const count = Math.max(0, Math.min(1000, Math.floor(Number.isFinite(n) ? n : 0)))
  for (let i = 0; i < count; i++) {
    const cpuMs = wl.cpuMs * sizes.exp(1)
    const client = s.clients.length ? i % s.clients.length : 0
    const id = sendRequest(s, { client, cpuMs })
    const f = id === null ? null : findRequest(s, id)
    out.push({
      n: i + 1,
      client,
      cpuMs,
      server: f ? f.server : null,
      outcome: !f ? 'refused' : f.phase === 'done' ? (f.done?.outcome ?? 'refused') : f.phase === 'queue' ? 'queued' : 'inProgress',
    })
    advance(s, Math.max(DT_MS, num(gapMs)))
  }
  return out
}

function num(v: number): number {
  return Number.isFinite(v) ? v : 250
}

/** Same scenario for several algorithms ("Usporedi tri algoritma"). */
export function compareAlgorithms(opts: RunOptions, algos: readonly Algo[]): Record<string, RunReport> {
  const out: Record<string, RunReport> = {}
  for (const algo of algos) out[algo] = runScenario({ ...opts, config: { ...opts.config, algo } })
  return out
}
