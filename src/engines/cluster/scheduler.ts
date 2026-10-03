/**
 * kube-scheduler: queue → Filter → Score → Bind, on REQUESTS (never on usage).
 *
 * Filter plugins run in the upstream order and a node fails on the first failing plugin:
 * NodeUnschedulable → TaintToleration → NodeAffinity (nodeSelector) → NodeResourcesFit.
 * Score: NodeResourcesFit LeastAllocated (default) or MostAllocated, averaged over CPU and memory,
 * with non-zero defaults (100m / 200Mi) for Pods without requests – for scoring only. Ties: random (seeded).
 */
import type { ClusterState, Node, Pod, Taint, Toleration } from './types.ts'
import { bindPod } from './pods.ts'
import { effectiveRequests, isTerminal, kubeEvent, logEvent, message, observed, podRef, qosClass } from './util.ts'

export const NONZERO_CPU_M = 100
export const NONZERO_MEM_MI = 200

export interface NodeRequested {
  cpuM: number
  memMi: number
  pods: number
  /** scoring view (zero requests count as 100m / 200Mi) */
  nonZeroCpuM: number
  nonZeroMemMi: number
}

/** Σ requests on the node (DaemonSet block + every Pod bound there that is not finished, terminating included). */
export function requestedOnNode(s: ClusterState, node: Node, exclude?: Pod): NodeRequested {
  const r: NodeRequested = { cpuM: node.daemonSet.cpuM, memMi: node.daemonSet.memMi, pods: 0, nonZeroCpuM: node.daemonSet.cpuM, nonZeroMemMi: node.daemonSet.memMi }
  for (const p of s.pods) {
    if (p.nodeName !== node.name || p === exclude || isTerminal(p)) continue
    const q = effectiveRequests(p.spec)
    r.cpuM += q.cpuM
    r.memMi += q.memMi
    r.nonZeroCpuM += q.cpuM || NONZERO_CPU_M
    r.nonZeroMemMi += q.memMi || NONZERO_MEM_MI
    r.pods += 1
  }
  return r
}

export function tolerates(tols: Toleration[], taint: Taint): boolean {
  return tols.some((t) => {
    if (t.effect && t.effect !== taint.effect) return false
    if (t.operator === 'Exists') return t.key === undefined || t.key === taint.key
    return t.key === taint.key && (t.value ?? '') === (taint.value ?? '')
  })
}

export interface FilterResult {
  fits: boolean
  /** upstream reason strings, e.g. "Insufficient cpu", "node(s) had untolerated taint {node.kubernetes.io/unreachable: }" */
  reasons: string[]
  plugin: 'NodeUnschedulable' | 'TaintToleration' | 'NodeAffinity' | 'NodeResourcesFit' | null
  /** preemption could not help (taints, selectors, cordon) */
  unresolvable: boolean
}

export function filterNode(s: ClusterState, pod: Pod, node: Node): FilterResult {
  // NodeUnschedulable
  if (node.unschedulable && !tolerates(pod.spec.tolerations, { key: 'node.kubernetes.io/unschedulable', effect: 'NoSchedule', addedAt: 0 })) {
    return { fits: false, reasons: ['node(s) were unschedulable'], plugin: 'NodeUnschedulable', unresolvable: true }
  }
  // TaintToleration (non-BestEffort Pods tolerate memory-pressure: BestEffort Pods are kept off pressured nodes)
  const tols = qosClass(pod.spec) === 'BestEffort' ? pod.spec.tolerations : [...pod.spec.tolerations, { key: 'node.kubernetes.io/memory-pressure', operator: 'Exists' as const, effect: 'NoSchedule' as const }]
  for (const taint of node.taints) {
    if (taint.effect === 'PreferNoSchedule') continue
    if (!tolerates(tols, taint)) {
      return { fits: false, reasons: [`node(s) had untolerated taint {${taint.key}: ${taint.value ?? ''}}`], plugin: 'TaintToleration', unresolvable: true }
    }
  }
  // NodeAffinity (nodeSelector)
  for (const [k, v] of Object.entries(pod.spec.nodeSelector)) {
    if (node.labels[k] !== v) return { fits: false, reasons: ["node(s) didn't match Pod's node affinity/selector"], plugin: 'NodeAffinity', unresolvable: true }
  }
  // NodeResourcesFit
  const req = effectiveRequests(pod.spec)
  const used = requestedOnNode(s, node, pod)
  const reasons: string[] = []
  if (used.pods + 1 > node.allocatable.pods) reasons.push('Too many pods')
  if (req.cpuM > 0 && req.cpuM > node.allocatable.cpuM - used.cpuM) reasons.push('Insufficient cpu')
  if (req.memMi > 0 && req.memMi > node.allocatable.memMi - used.memMi) reasons.push('Insufficient memory')
  if (reasons.length) return { fits: false, reasons, plugin: 'NodeResourcesFit', unresolvable: false }
  return { fits: true, reasons: [], plugin: null, unresolvable: false }
}

export interface ScoreResult {
  cpuScore: number
  memScore: number
  score: number
}

export function scoreNode(s: ClusterState, pod: Pod, node: Node): ScoreResult {
  const req = effectiveRequests(pod.spec)
  const used = requestedOnNode(s, node, pod)
  const cpuReq = used.nonZeroCpuM + (req.cpuM || NONZERO_CPU_M)
  const memReq = used.nonZeroMemMi + (req.memMi || NONZERO_MEM_MI)
  const most = s.cfg.scoring === 'MostAllocated'
  const one = (requested: number, alloc: number) => {
    if (alloc <= 0) return 0
    if (requested > alloc) return most ? 100 : 0
    return most ? Math.floor((requested * 100) / alloc) : Math.floor(((alloc - requested) * 100) / alloc)
  }
  const cpuScore = one(cpuReq, node.allocatable.cpuM)
  const memScore = one(memReq, node.allocatable.memMi)
  return { cpuScore, memScore, score: Math.floor((cpuScore + memScore) / 2) }
}

/** Nodes the scheduler knows about (registered Node objects – provisioning machines are not yet registered). */
export function schedulableUniverse(s: ClusterState): Node[] {
  return s.nodes.filter((n) => n.machine !== 'provisioning')
}

export interface NodeExplanation {
  node: string
  fits: boolean
  reasons: string[]
  plugin: FilterResult['plugin']
  score: ScoreResult | null
  requested: NodeRequested
  allocatable: { cpuM: number; memMi: number; pods: number }
}

export interface SchedulingExplanation {
  podId: string
  rows: NodeExplanation[]
  /** best node(s) by score */
  best: string[]
  /** FailedScheduling message when nothing fits */
  message: string | null
}

/** Per-node ✓/✗ table with reasons and scores (L17 "Filtar, bodovi, vezanje"). */
export function explainScheduling(s: ClusterState, pod: Pod): SchedulingExplanation {
  const nodes = schedulableUniverse(s)
  const rows: NodeExplanation[] = nodes.map((n) => {
    const f = filterNode(s, pod, n)
    return {
      node: n.name,
      fits: f.fits,
      reasons: f.reasons,
      plugin: f.plugin,
      score: f.fits ? scoreNode(s, pod, n) : null,
      requested: requestedOnNode(s, n, pod),
      allocatable: { ...n.allocatable },
    }
  })
  const fitting = rows.filter((r) => r.fits)
  const max = Math.max(-1, ...fitting.map((r) => r.score!.score))
  const best = fitting.filter((r) => r.score!.score === max).map((r) => r.node)
  return { podId: pod.id, rows, best, message: fitting.length ? null : failedSchedulingMessage(nodes.length, nodes.map((n) => filterNode(s, pod, n))) }
}

/**
 * Upstream FitError format: "0/3 nodes are available: 2 Insufficient memory, 3 Insufficient cpu.
 * preemption: 0/3 nodes are available: 3 No preemption victims found for incoming pod."
 * (reason histogram strings sorted lexicographically, as sortReasonsHistogram does).
 */
export function failedSchedulingMessage(total: number, results: FilterResult[]): string {
  if (total === 0) return 'no nodes available to schedule pods'
  const hist = new Map<string, number>()
  for (const r of results) for (const reason of r.reasons) hist.set(reason, (hist.get(reason) ?? 0) + 1)
  const parts = [...hist.entries()].map(([k, v]) => `${v} ${k}`).sort()
  const pre = new Map<string, number>()
  for (const r of results) {
    const k = r.unresolvable ? 'Preemption is not helpful for scheduling' : 'No preemption victims found for incoming pod'
    pre.set(k, (pre.get(k) ?? 0) + 1)
  }
  const preParts = [...pre.entries()].map(([k, v]) => `${v} ${k}`).sort()
  const head = `0/${total} nodes are available: ${parts.join(', ')}`
  return `${head}. preemption: 0/${total} nodes are available: ${preParts.join(', ')}.`
}

function pickNode(s: ClusterState, pod: Pod, nodes: Node[]): { node: Node | null; results: FilterResult[] } {
  const results = nodes.map((n) => filterNode(s, pod, n))
  let best: Node | null = null
  let bestScore = -1
  let ties = 0
  nodes.forEach((n, i) => {
    if (!results[i].fits) return
    const sc = scoreNode(s, pod, n).score
    if (sc > bestScore) {
      bestScore = sc
      best = n
      ties = 1
    } else if (sc === bestScore) {
      // reservoir sampling among ties (selectHost)
      ties += 1
      if (s.rng.next() < 1 / ties) best = n
    }
  })
  return { node: best, results }
}

export function schedulerTick(s: ClusterState): void {
  if (!s.components.scheduler || !s.components.apiServer || !s.components.etcd) return
  const queue = s.pods
    .filter((p) => p.nodeName === null && p.deletion === null && p.phase === 'Pending' && s.t + 1e-9 >= p.scheduleAfter)
    .sort((a, b) => b.spec.priority - a.spec.priority || a.seq - b.seq)
  if (queue.length === 0) return
  const nodes = schedulableUniverse(s)
  for (const pod of queue) {
    if (pod.scheduled.status === false && pod.scheduled.lastAttemptGen === s.schedGen) continue
    if (!observed(s, `sched:${pod.id}`, true, 'apiserver', 'scheduler', 'novi Pod bez čvora', pod.name)) continue
    const { node, results } = pickNode(s, pod, nodes)
    if (node) {
      bindPod(s, pod, node.name, true)
      message(s, 'scheduler', 'apiserver', `veži na ${node.name}`, 4, undefined, { object: pod.name })
      logEvent(s, 'scheduled', `Pod ${pod.name} raspoređen na ${node.name}`, 'info', pod.id)
      continue
    }
    const msg = failedSchedulingMessage(nodes.length, results)
    const changed = pod.scheduled.message !== msg
    pod.scheduled = { status: false, reason: 'Unschedulable', message: msg, lastAttemptGen: s.schedGen }
    pod.timeline.unschedulableAt ??= s.t
    kubeEvent(s, 'Warning', 'FailedScheduling', podRef(pod), msg)
    if (changed) logEvent(s, 'failed-scheduling', `Pod ${pod.name} čeka (Pending): ${msg.split('.')[0]}`, 'warn', pod.id)
  }
}

/** Manual placement (L17 drag): bind only if the filter passes; returns the reasons otherwise. */
export function bindManually(s: ClusterState, pod: Pod, nodeName: string): { ok: boolean; reasons: string[] } {
  const node = s.nodes.find((n) => n.name === nodeName)
  if (!node) return { ok: false, reasons: ['node not found'] }
  if (pod.nodeName) return { ok: false, reasons: ['Pod je već raspoređen'] }
  const f = filterNode(s, pod, node)
  if (!f.fits) return { ok: false, reasons: f.reasons }
  bindPod(s, pod, nodeName, true)
  logEvent(s, 'scheduled', `Pod ${pod.name} ručno smješten na ${nodeName}`, 'info', pod.id)
  return { ok: true, reasons: [] }
}
