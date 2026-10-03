/**
 * Headless runs of the E3 engine (presetAutoscaling, SIM 4) that feed the step-by-step scenes and the code drawer.
 * Nothing here is drawn by hand: every number in „Polako prema dolje”, „Podovi u sekundama, čvorovi u minutama”
 * and in `kubectl get hpa -w` comes from the same validated spike run (seed 42, nalet 20 → 100 zahtjeva/s u t = 60 s).
 */
import {
  TRAFFIC_PRESETS,
  advance,
  clusterCost,
  kubectlGetHpa,
  podLeadTime,
  presetAutoscaling,
  profileRate,
  type AutoscalingOptions,
  type ClusterState,
  type HpaDecision,
} from '../../../engines/cluster'

export const SEED = 42
export const API = 'klopa-api'
/** illustrative price of one 2 vCPU / 8 GiB node (labelled „zamišljena cijena” wherever it is shown) */
export const EUR_PER_NODE_H = 0.1

export function apiReplicas(s: ClusterState): number {
  return s.deployments.find((d) => d.name === API)?.replicas ?? 0
}

export function apiReady(s: ClusterState): number {
  return s.pods.filter((p) => p.labels.app === API && p.ready.status && !p.deletion).length
}

export function apiHpa(s: ClusterState) {
  return s.hpas.find((h) => h.name === API) ?? null
}

export interface LeadBar {
  /** seconds of each phase (0 when it did not happen) */
  waitCa: number
  node: number
  pull: number
  start: number
  ready: number
  total: number
  createdAt: number
}

export interface SpikeStory {
  /** per whole second 0…END: spec.replicas, Ready Pods, offered requests/s */
  replicas: number[]
  ready: number[]
  rps: number[]
  /** every HPA sync of klopa-api (t = 15, 30, …) */
  decisions: HpaDecision[]
  /** a Pod placed on an existing node vs the first Pod that had to wait for a new node */
  onNode: LeadBar
  newNode: LeadBar
  /** when the Cluster Autoscaler asked for a node, when it was Ready */
  caAt: number
  nodeReadyAt: number
  /** `kubectl get hpa -w` (header + one row per change), columns aligned; REPLICAS = status.currentReplicas */
  watch: { t: number; row: string; replicas: number }[]
  watchHeader: string
}

export const STORY_END = 750

function bar(t: { createdAt: number }, lead: ReturnType<typeof podLeadTime>): LeadBar {
  const waitCa = lead.waitSchedulerS ?? 0
  const node = lead.waitNodeS ?? 0
  const pull = lead.pullS ?? 0
  const start = lead.startS ?? 0
  const ready = lead.readyS ?? 0
  return { waitCa, node, pull, start, ready, total: lead.totalS ?? waitCa + node + pull + start + ready, createdAt: t.createdAt }
}

/**
 * Adapter over the engine's kubectlGetHpa: real `kubectl get hpa` prints status.currentReplicas in REPLICAS – the
 * count observed BEFORE that sync's rescale (the new desired count shows up one sync later). Cells are re-padded to
 * one width per column so the -w rows line up under the header.
 */
function hpaTable(rows: { cells: string[] }[]): string[] {
  const widths: number[] = []
  for (const r of rows) r.cells.forEach((cell, i) => (widths[i] = Math.max(widths[i] ?? 0, cell.length)))
  return rows.map((r) => r.cells.map((cell, i) => (i === r.cells.length - 1 ? cell : cell.padEnd(widths[i] + 3))).join(''))
}

let cached: SpikeStory | null = null

/** The validated spike (≈ 40 ms headless); computed once per page. */
export function spikeStory(): SpikeStory {
  if (cached) return cached
  const s = presetAutoscaling({ seed: SEED })
  const replicas: number[] = [apiReplicas(s)]
  const ready: number[] = [apiReady(s)]
  const rps: number[] = [profileRate(TRAFFIC_PRESETS.spike, 0)]
  const header = kubectlGetHpa(s)[0].split(/\s{2,}/)
  const replicasCol = header.indexOf('REPLICAS')
  // the first sync after the page opens has no metric yet (<unknown>): the watch starts with the first measured row
  const raw: { t: number; cells: string[]; replicas: number }[] = []
  const apiCells = (st: ClusterState, current: number) => {
    const cells = (kubectlGetHpa(st).find((r) => r.startsWith(API)) ?? '').split(/\s{2,}/)
    if (replicasCol >= 0) cells[replicasCol] = String(current)
    return cells
  }
  let lastKey = ''
  let caAt = -1
  let nodeReadyAt = -1
  let onNode: LeadBar | null = null
  let newNode: LeadBar | null = null
  for (let sec = 1; sec <= STORY_END; sec++) {
    advance(s, 1)
    replicas.push(apiReplicas(s))
    ready.push(apiReady(s))
    rps.push(profileRate(TRAFFIC_PRESETS.spike, sec))
    if (caAt < 0 && s.nodes.length > 2) caAt = Math.round(s.t - 1)
    if (nodeReadyAt < 0 && s.nodes.some((n) => n.name === 'node-3' && n.machine === 'running')) nodeReadyAt = Math.round(s.t - 1)
    // kubectl get hpa -w prints a row whenever what it shows changes (the measured target or REPLICAS)
    const h = apiHpa(s)
    if (h && h.status.currentMetric !== null && sec % 15 === 1) {
      const key = `${h.status.currentMetric}|${h.status.currentReplicas}`
      if (key !== lastKey) {
        lastKey = key
        raw.push({ t: sec, cells: apiCells(s, h.status.currentReplicas), replicas: h.status.currentReplicas })
      }
    }
    if (sec === 200) {
      const pods = s.pods.filter((p) => p.labels.app === API)
      const fast = pods.find((p) => p.timeline.createdAt > 0 && p.timeline.unschedulableAt === null && p.timeline.readyAt !== null)
      const slow = pods.find((p) => p.timeline.scaleUpTriggeredAt !== null && p.timeline.readyAt !== null)
      if (fast) onNode = bar(fast.timeline, podLeadTime(fast))
      if (slow) newNode = bar(slow.timeline, podLeadTime(slow))
    }
  }
  const table = hpaTable([{ cells: header }, ...raw])
  const watchHeader = table[0]
  const watch = raw.map((r, i) => ({ t: r.t, row: table[i + 1], replicas: r.replicas }))
  const empty: LeadBar = { waitCa: 0, node: 0, pull: 0, start: 0, ready: 0, total: 0, createdAt: 0 }
  cached = {
    replicas,
    ready,
    rps,
    decisions: [...(apiHpa(s)?.decisions ?? [])],
    onNode: onNode ?? empty,
    newNode: newNode ?? empty,
    caAt,
    nodeReadyAt,
    watch,
    watchHeader,
  }
  return cached
}

// ---------------------------------------------------------------- „Rezerva, latencija i trošak”

export interface TradePoint {
  id: string
  label: string
  short: string
  /** average €/h over the 12 minutes of the run (illustrative price) */
  eurPerH: number
  /** worst p95 during the burst (M/M/1 estimate, ms) */
  worstP95: number
  maxNodes: number
  dropped: number
}

const TRADE_RUNS: { id: string; label: string; short: string; o: AutoscalingOptions }[] = [
  { id: 'fixed2', label: 'bez HPA-a: 2 Poda', short: '2 fiksno', o: { minReplicas: 2, maxReplicas: 2 } },
  { id: 'hpa', label: 'HPA 50 %, minReplicas 2', short: 'HPA, min 2', o: {} },
  { id: 'min4', label: 'HPA 50 %, minReplicas 4', short: 'min 4', o: { minReplicas: 4 } },
  { id: 't30', label: 'HPA 30 %, minReplicas 2', short: 'cilj 30 %', o: { targetUtilization: 30 } },
  { id: 'min6', label: 'HPA 80 %, minReplicas 6', short: 'min 6 · 80 %', o: { minReplicas: 6, targetUtilization: 80 } },
]

const TRADE_S = 720
let tradeCache: TradePoint[] | null = null

/** Five configurations through the same Ćevap-petak burst (≈ 5 × 30 ms, computed once, when the plot is shown). */
export function tradeoffPoints(): TradePoint[] {
  if (tradeCache) return tradeCache
  tradeCache = TRADE_RUNS.map(({ id, label, short, o }) => {
    const s = presetAutoscaling({ seed: SEED, profile: TRAFFIC_PRESETS.spike, ...o })
    let worst = 0
    let maxNodes = 0
    for (let sec = 1; sec <= TRADE_S; sec++) {
      advance(s, 1)
      if (sec > 60 && sec <= 425) worst = Math.max(worst, s.traffic[0].p95Ms)
      maxNodes = Math.max(maxNodes, s.nodes.filter((n) => n.machine !== 'off').length)
    }
    const cost = clusterCost(s, EUR_PER_NODE_H)
    return { id, label, short, eurPerH: cost.eur / (TRADE_S / 3600), worstP95: worst, maxNodes, dropped: Math.round(s.traffic[0].dropped) }
  })
  return tradeCache
}
