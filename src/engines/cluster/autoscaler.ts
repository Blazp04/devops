/**
 * Cluster Autoscaler (one node group). Looks at REQUESTS and Pending Pods only – never at CPU usage.
 *
 * Every scan (10 s): Pods marked Unschedulable that would fit on an empty template node are bin-packed onto
 * template nodes; nodes already provisioning are subtracted; the rest is added up to maxNodes. A new node is
 * Ready after the provisioning time (sim 75 s, real: minutes, cloud-dependent) and must pull images.
 * Scale-down: a node is unneeded when max(Σcpu requests / alloc, Σmem requests / alloc) < 0,5 and its Pods fit
 * elsewhere; it is removed after 10 min unneeded and ≥ 10 min after the last scale-up. Empty nodes go first
 * (in bulk), otherwise one node at a time is drained (Pods evicted, rescheduled by their controllers).
 * Bare Pods and Pods with local storage (emptyDir) block removal, as in the real defaults.
 */
import type { ClusterState, Node, Pod } from './types.ts'
import { addNode, cordonNode, removeNodeObject } from './nodes.ts'
import { deletePodObject } from './pods.ts'
import { requestedOnNode } from './scheduler.ts'
import { NODES_HR, controllersUp, effectiveRequests, hrCount, isTerminal, kubeEvent, logEvent, podRef } from './util.ts'

function caScanDue(s: ClusterState, interval: number): boolean {
  const n = Math.round(interval / s.cfg.timings.dt)
  return n > 0 && s.tick % n === 0
}

export function pendingUnschedulable(s: ClusterState): Pod[] {
  return s.pods.filter((p) => p.nodeName === null && p.deletion === null && p.phase === 'Pending' && p.scheduled.status === false && p.scheduled.reason === 'Unschedulable')
}

/** First-fit decreasing on empty template nodes → number of nodes needed. */
function nodesNeeded(s: ClusterState, pods: Pod[]): { needed: number; fits: Pod[]; tooBig: Pod[] } {
  const ca = s.cfg.autoscaler!
  const tpl = ca.template
  const capCpu = tpl.allocatableCpuM - tpl.daemonSetCpuM
  const capMem = tpl.allocatableMemMi - tpl.daemonSetMemMi
  const fits: Pod[] = []
  const tooBig: Pod[] = []
  for (const p of pods) {
    const r = effectiveRequests(p.spec)
    if (r.cpuM > capCpu || r.memMi > capMem) tooBig.push(p)
    else fits.push(p)
  }
  const bins: { cpu: number; mem: number; n: number }[] = []
  const sorted = [...fits].sort((a, b) => effectiveRequests(b.spec).cpuM - effectiveRequests(a.spec).cpuM)
  for (const p of sorted) {
    const r = effectiveRequests(p.spec)
    let bin = bins.find((b) => b.cpu + r.cpuM <= capCpu && b.mem + r.memMi <= capMem && b.n + 1 <= tpl.maxPods)
    if (!bin) {
      bin = { cpu: 0, mem: 0, n: 0 }
      bins.push(bin)
    }
    bin.cpu += r.cpuM
    bin.mem += r.memMi
    bin.n += 1
  }
  return { needed: bins.length, fits, tooBig }
}

function utilization(s: ClusterState, node: Node): number {
  const r = requestedOnNode(s, node)
  return Math.max(r.cpuM / node.allocatable.cpuM, r.memMi / node.allocatable.memMi)
}

function podsOnNode(s: ClusterState, node: Node): Pod[] {
  return s.pods.filter((p) => p.nodeName === node.name && !isTerminal(p) && !p.deletion)
}

/** Can every Pod on `node` move to the other (non-removed) nodes by requests? Returns the blocking reason. */
function canDrain(s: ClusterState, node: Node, excluded: Set<string>): string | null {
  const pods = podsOnNode(s, node)
  for (const p of pods) {
    if (!p.owner) return `Pod ${p.name} nema kontroler`
    if (p.spec.volumes.some((v) => v.kind === 'emptyDir')) return `Pod ${p.name} koristi lokalnu pohranu (emptyDir)`
  }
  const others = s.nodes.filter((n) => n !== node && !excluded.has(n.name) && n.machine === 'running' && n.condition.ready === 'True' && !n.unschedulable)
  const free = others.map((n) => {
    const r = requestedOnNode(s, n)
    return { cpu: n.allocatable.cpuM - r.cpuM, mem: n.allocatable.memMi - r.memMi }
  })
  for (const p of pods) {
    const r = effectiveRequests(p.spec)
    const i = free.findIndex((f) => f.cpu >= r.cpuM && f.mem >= r.memMi)
    if (i < 0) return `Pod ${p.name} ne stane drugdje`
    free[i].cpu -= r.cpuM
    free[i].mem -= r.memMi
  }
  return null
}

export function clusterAutoscalerTick(s: ClusterState): void {
  const ca = s.cfg.autoscaler
  if (!ca || !ca.enabled || !controllersUp(s)) return
  // finish draining nodes being removed
  for (const node of [...s.nodes]) {
    if (!node.ca.removing) continue
    if (s.pods.some((p) => p.nodeName === node.name && !isTerminal(p))) continue
    removeNodeObject(s, node.name)
    logEvent(s, 'ca-removed', `Cluster Autoscaler uklonio je čvor ${node.name}`, 'neutral')
  }
  if (!caScanDue(s, ca.scanIntervalS)) return
  const managed = s.nodes
  const total = managed.length
  // ---- scale up
  const pending = pendingUnschedulable(s)
  if (pending.length) {
    const upcoming = managed.filter((n) => n.machine === 'provisioning').length
    const { needed, tooBig } = nodesNeeded(s, pending)
    for (const p of tooBig) kubeEvent(s, 'Normal', 'NotTriggerScaleUp', podRef(p), "pod didn't trigger scale-up: 1 node(s) didn't have enough resources")
    const add = Math.min(needed - upcoming, ca.maxNodes - total)
    if (add > 0) {
      for (let i = 0; i < add; i++) {
        const name = `${ca.namePrefix}${ca.nextIndex++}`
        addNode(s, { ...ca.template, name }, { provisioningS: ca.provisionS, caManaged: true })
      }
      ca.lastScaleUpAt = s.t
      for (const p of pending) {
        kubeEvent(s, 'Normal', 'TriggeredScaleUp', podRef(p), `pod triggered scale-up: [{node-group ${total}->${total + add} (max: ${ca.maxNodes})}]`)
        p.timeline.scaleUpTriggeredAt ??= s.t
      }
      logEvent(s, 'ca-scale-up', `Cluster Autoscaler: ${hrCount(pending.length, ['Pod čeka', 'Poda čekaju', 'Podova čeka'])} → dodaje ${hrCount(add, NODES_HR)}, spreman za ~${ca.provisionS} s`, 'warn')
      return
    }
    if (needed - upcoming > 0 && total >= ca.maxNodes) {
      logEvent(s, 'ca-max', `Cluster Autoscaler: Podovi čekaju, ali je dosegnut maksimum od ${hrCount(ca.maxNodes, ['čvora', 'čvora', 'čvorova'])}`, 'bad')
    }
  }
  // ---- scale down
  const ready = managed.filter((n) => n.machine === 'running' && n.condition.ready === 'True' && !n.ca.removing)
  const excluded = new Set<string>()
  for (const n of ready) {
    const unneeded = utilization(s, n) < ca.utilizationThreshold && ready.length > ca.minNodes && canDrain(s, n, excluded) === null
    if (unneeded) n.ca.unneededSince ??= s.t
    else n.ca.unneededSince = null
  }
  const afterAdd = ca.lastScaleUpAt === null || s.t - ca.lastScaleUpAt >= ca.delayAfterAddS - 1e-9
  if (!afterAdd || pending.length) return
  const due = ready.filter((n) => n.ca.unneededSince !== null && s.t - n.ca.unneededSince >= ca.unneededS - 1e-9)
  if (!due.length) return
  let count = ready.length
  const empty = due.filter((n) => podsOnNode(s, n).length === 0)
  if (empty.length) {
    for (const n of empty.slice(0, 10)) {
      if (count <= ca.minNodes) break
      n.ca.removing = true
      cordonNode(s, n.name, true)
      count -= 1
      logEvent(s, 'ca-scale-down', `Cluster Autoscaler: čvor ${n.name} je prazan ${Math.round(s.t - n.ca.unneededSince!)} s – uklanja ga`, 'neutral', n.id)
    }
    return
  }
  const victim = due[0]
  if (count <= ca.minNodes || canDrain(s, victim, excluded) !== null) return
  victim.ca.removing = true
  cordonNode(s, victim.name, true)
  for (const p of podsOnNode(s, victim)) deletePodObject(s, p, 'cluster-autoscaler-drain')
  logEvent(s, 'ca-scale-down', `Cluster Autoscaler: čvor ${victim.name} ispod 50 % requests ${Math.round(s.t - victim.ca.unneededSince!)} s – prazni ga i uklanja`, 'neutral', victim.id)
}
