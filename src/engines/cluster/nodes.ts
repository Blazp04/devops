/**
 * Nodes: registration, kubelet heartbeats, the node lifecycle controller (NotReady after
 * node-monitor-grace-period, unreachable taints, taint-based eviction after tolerationSeconds),
 * the out-of-service taint (non-graceful node shutdown) and node actions.
 */
import type { ClusterState, Node, NodeSpec, Taint } from './types.ts'
import type { ActionResult } from './rollout.ts'
import { deletePodObject, forceDeletePod, removePod } from './pods.ts'
import { setPodReady } from './kubelet.ts'
import { tolerates } from './scheduler.ts'
import { controllersUp, isTerminal, kubeEvent, logEvent, logOnce, newId, podRef, resetWarn } from './util.ts'

export const UNREACHABLE = 'node.kubernetes.io/unreachable'
export const NOT_READY = 'node.kubernetes.io/not-ready'
export const OUT_OF_SERVICE = 'node.kubernetes.io/out-of-service'
export const UNSCHEDULABLE = 'node.kubernetes.io/unschedulable'

export function addNode(s: ClusterState, spec: NodeSpec, o: { provisioningS?: number; caManaged?: boolean } = {}): Node {
  const index = s.nodes.reduce((m, n) => Math.max(m, n.index), 0) + 1
  const provisioning = (o.provisioningS ?? 0) > 0
  const images: Record<string, true> = {}
  for (const img of spec.images ?? []) images[img] = true
  if (!provisioning) for (const img of s.cfg.cachedImages) images[img] = true
  const node: Node = {
    id: newId(s, 'node'),
    name: spec.name,
    index,
    capacity: { cpuM: spec.cpuM, memMi: spec.memMi, pods: spec.maxPods },
    allocatable: { cpuM: spec.allocatableCpuM, memMi: spec.allocatableMemMi, pods: spec.maxPods },
    daemonSet: { cpuM: spec.daemonSetCpuM, memMi: spec.daemonSetMemMi },
    labels: { 'kubernetes.io/hostname': spec.name, ...(spec.labels ?? {}) },
    taints: provisioning ? [{ key: NOT_READY, effect: 'NoSchedule', addedAt: s.t }] : [],
    unschedulable: false,
    machine: provisioning ? 'provisioning' : 'running',
    kubeletUp: !provisioning,
    provisionReadyAt: provisioning ? s.t + (o.provisioningS ?? 0) : null,
    lastHeartbeat: s.t,
    condition: { ready: provisioning ? 'False' : 'True', since: s.t },
    memoryPressure: { status: false, since: s.t },
    images,
    nextIp: 2,
    createdAt: s.t,
    ca: { managed: o.caManaged ?? false, unneededSince: null, removing: false },
    extraSystemMemMi: 0,
    readyAt: s.t,
  }
  s.nodes.push(node)
  s.schedGen += 1
  return node
}

function removeTaint(node: Node, key: string): boolean {
  const before = node.taints.length
  node.taints = node.taints.filter((t) => t.key !== key)
  return node.taints.length !== before
}

function addTaint(s: ClusterState, node: Node, key: string, effect: Taint['effect'], value?: string): void {
  if (node.taints.some((t) => t.key === key && t.effect === effect)) return
  const taint: Taint = { key, effect, addedAt: s.t }
  if (value !== undefined) taint.value = value
  node.taints.push(taint)
  s.schedGen += 1
}

export function nodeLifecycleTick(s: ClusterState): void {
  const T = s.cfg.timings
  for (const node of s.nodes) {
    if (node.machine === 'provisioning' && node.provisionReadyAt !== null && s.t + 1e-9 >= node.provisionReadyAt) {
      node.machine = 'running'
      node.kubeletUp = true
      node.lastHeartbeat = s.t
      node.provisionReadyAt = null
      node.condition = { ready: 'True', since: s.t }
      node.readyAt = s.t
      removeTaint(node, NOT_READY)
      s.schedGen += 1
      kubeEvent(s, 'Normal', 'NodeReady', `node/${node.name}`, `Node ${node.name} status is now: NodeReady`)
      logEvent(s, 'node-ready', `Novi čvor ${node.name} je spreman`, 'ok', node.id)
    }
    if (node.machine === 'running' && node.kubeletUp) node.lastHeartbeat = s.t
  }
  if (!controllersUp(s)) return
  for (const node of s.nodes) {
    if (node.machine === 'provisioning') continue
    const stale = s.t - node.lastHeartbeat > T.nodeMonitorGraceS + 1e-9
    if (stale && node.condition.ready === 'True') {
      node.condition = { ready: 'Unknown', since: s.t }
      addTaint(s, node, UNREACHABLE, 'NoSchedule')
      addTaint(s, node, UNREACHABLE, 'NoExecute')
      for (const p of s.pods) if (p.nodeName === node.name && !isTerminal(p)) setPodReady(s, p, false)
      kubeEvent(s, 'Normal', 'NodeNotReady', `node/${node.name}`, `Node ${node.name} status is now: NodeNotReady`)
      logEvent(s, 'node-not-ready', `Čvor ${node.name} se ne javlja – NotReady (Unknown); njegovi Podovi izlaze iz prometa`, 'bad', node.id)
    } else if (!stale && node.condition.ready !== 'True') {
      node.condition = { ready: 'True', since: s.t }
      node.readyAt = s.t
      removeTaint(node, UNREACHABLE)
      removeTaint(node, NOT_READY)
      s.schedGen += 1
      resetWarn(s, `evict:${node.name}`)
      kubeEvent(s, 'Normal', 'NodeReady', `node/${node.name}`, `Node ${node.name} status is now: NodeReady`)
      logEvent(s, 'node-ready', `Čvor ${node.name} ponovno se javlja – Ready`, 'ok', node.id)
    }
    taintEviction(s, node)
  }
}

/** Taint-based eviction (NoExecute) + pod GC for the out-of-service taint. */
function taintEviction(s: ClusterState, node: Node): void {
  const noExec = node.taints.filter((t) => t.effect === 'NoExecute')
  const oos = node.taints.some((t) => t.key === OUT_OF_SERVICE)
  if (noExec.length === 0 && !oos) return
  for (const p of [...s.pods]) {
    if (p.nodeName !== node.name || isTerminal(p)) continue
    if (!p.deletion) {
      for (const taint of noExec) {
        const tol = p.spec.tolerations.find((x) => tolerates([x], taint))
        const due = !tol ? s.t : tol.tolerationSeconds === undefined ? Infinity : taint.addedAt + tol.tolerationSeconds
        if (s.t + 1e-9 >= due) {
          kubeEvent(s, 'Normal', 'TaintManagerEviction', podRef(p), `Marking for deletion Pod ${p.namespace}/${p.name}`)
          logOnce(s, `evict:${node.name}`, 'taint-eviction', `Prošlo je ${Math.round(s.t - taint.addedAt)} s – Podovi s čvora ${node.name} označeni za brisanje`, 'warn', node.id)
          deletePodObject(s, p, 'taint-eviction')
          break
        }
      }
    }
    // non-graceful node shutdown: pods on an out-of-service node that is not Ready are force-deleted
    if (oos && node.condition.ready !== 'True' && p.deletion && s.pods.includes(p)) {
      kubeEvent(s, 'Normal', 'PodGC', podRef(p), `Force deleting pod ${p.namespace}/${p.name} on out-of-service node ${node.name}`)
      forceDeletePod(s, p)
    }
  }
}

// ---------------------------------------------------------------- actions

export function findNode(s: ClusterState, name: string): Node | undefined {
  return s.nodes.find((n) => n.name === name)
}

/** "Ugasi čvor" / "Čvor pao": the machine and every container on it are gone; the API does not know yet. */
export function powerOffNode(s: ClusterState, name: string): boolean {
  const node = findNode(s, name)
  if (!node || node.machine !== 'running') return false
  node.machine = 'off'
  for (const p of s.pods) {
    if (p.nodeName !== name) continue
    p.processUp = false
    p.processStartedAt = null
  }
  logEvent(s, 'node-off', `Čvor ${name} ugašen – stroj i svi kontejneri na njemu nestali (API to još ne zna)`, 'bad', node.id)
  return true
}

/** The machine boots again: the kubelet re-registers, restarts containers of Pods still bound here and confirms deletions. */
export function powerOnNode(s: ClusterState, name: string): boolean {
  const node = findNode(s, name)
  if (!node || node.machine !== 'off') return false
  node.machine = 'running'
  node.kubeletUp = true
  node.lastHeartbeat = s.t
  for (const p of s.pods) {
    if (p.nodeName !== name || isTerminal(p) || p.deletion) continue
    if (p.container.state === 'running') {
      const c = p.container
      c.state = 'terminated'
      c.reason = 'Unknown'
      c.exitCode = 255
      c.finishedAt = s.t
      c.ready = false
      c.lastTermination = { reason: 'Unknown', exitCode: 255, finishedAt: s.t }
      p.kubelet.stage = 'exited'
      p.kubelet.until = s.t
    } else if (p.kubelet.stage === 'stopping') p.kubelet.stage = 'stopped'
  }
  logEvent(s, 'node-on', `Čvor ${name} ponovno pokrenut`, 'ok', node.id)
  return true
}

/** Stop/start only the kubelet: containers keep running, nobody reports their state. */
export function setKubelet(s: ClusterState, name: string, up: boolean): boolean {
  const node = findNode(s, name)
  if (!node || node.machine !== 'running' || node.kubeletUp === up) return false
  node.kubeletUp = up
  if (up) node.lastHeartbeat = s.t
  logEvent(s, up ? 'kubelet-on' : 'kubelet-off', up ? `kubelet na ${name} ponovno radi` : `kubelet na ${name} zaustavljen – kontejneri i dalje rade, ali se nitko ne javlja`, up ? 'ok' : 'warn', node.id)
  return true
}

export function cordonNode(s: ClusterState, name: string, on = true): boolean {
  const node = findNode(s, name)
  if (!node) return false
  node.unschedulable = on
  if (on) addTaint(s, node, UNSCHEDULABLE, 'NoSchedule')
  else removeTaint(node, UNSCHEDULABLE)
  s.schedGen += 1
  logEvent(s, on ? 'cordon' : 'uncordon', on ? `Čvor ${name} označen kao neraspoređiv (cordon)` : `Čvor ${name} ponovno prima Podove`, 'info', node.id)
  return true
}

/** kubectl drain filter texts (k8s.io/kubectl/pkg/drain/filters.go). */
export const DRAIN_UNMANAGED = 'Pods declare no controller (use --force to override)'
export const DRAIN_LOCAL_STORAGE = 'Pods with local storage (use --delete-emptydir-data to override)'

/**
 * kubectl drain: cordon, then evict every Pod gracefully. Like the real command it refuses (after cordoning) when a
 * Pod has no controller – nothing would recreate it – unless `force`, and when a Pod uses emptyDir – its data would
 * be deleted – unless `deleteEmptyDirData`. Output lines are kubectl's.
 */
export function drainNode(s: ClusterState, name: string, o: { force?: boolean; deleteEmptyDirData?: boolean } = {}): ActionResult {
  const node = findNode(s, name)
  if (!node) return { ok: false, message: `Error from server (NotFound): nodes "${name}" not found` }
  const lines = [node.unschedulable ? `node/${name} already cordoned` : `node/${name} cordoned`]
  cordonNode(s, name, true)
  const pods = s.pods.filter((p) => p.nodeName === name && !p.deletion && !isTerminal(p))
  const ref = (p: (typeof pods)[number]) => `${p.namespace}/${p.name}`
  const unmanaged = pods.filter((p) => p.owner === null)
  const local = pods.filter((p) => p.spec.volumes.some((v) => v.kind === 'emptyDir'))
  const errs: string[] = []
  if (unmanaged.length && !o.force) errs.push(`cannot delete ${DRAIN_UNMANAGED}: ${unmanaged.map(ref).join(', ')}`)
  if (local.length && !o.deleteEmptyDirData) errs.push(`cannot delete ${DRAIN_LOCAL_STORAGE}: ${local.map(ref).join(', ')}`)
  if (errs.length) {
    logEvent(s, 'drain-refused', `kubectl drain ${name}: odbijeno – ${unmanaged.length && !o.force ? 'Pod bez kontrolera nitko ne bi ponovno stvorio' : 'podatci u emptyDir bili bi obrisani'} (čvor je samo označen kao neraspoređiv)`, 'warn', node.id)
    return { ok: false, message: [...lines, `error: unable to drain node "${name}" due to error: ${errs.join(', ')}, continuing command...`, 'There are pending nodes to be drained:', ` ${name}`, ...errs].join('\n') }
  }
  if (unmanaged.length) lines.push(`Warning: deleting Pods that declare no controller: ${unmanaged.map(ref).join(', ')}`)
  if (local.length) lines.push(`Warning: deleting Pods with local storage: ${local.map(ref).join(', ')}`)
  for (const p of pods) lines.push(`evicting pod ${ref(p)}`)
  for (const p of pods) {
    deletePodObject(s, p, 'drain')
    lines.push(`pod/${p.name} evicted`)
  }
  lines.push(`node/${name} drained`)
  return { ok: true, message: lines.join('\n') }
}

/** Non-graceful node shutdown: mark the (verified dead) node out-of-service. */
export function setOutOfService(s: ClusterState, name: string, on = true): boolean {
  const node = findNode(s, name)
  if (!node) return false
  if (on) addTaint(s, node, OUT_OF_SERVICE, 'NoExecute', 'nodeshutdown')
  else {
    removeTaint(node, OUT_OF_SERVICE)
    s.schedGen += 1
  }
  logEvent(s, 'out-of-service', on ? `Čvor ${name} označen kao ugašen (out-of-service) – Podovi se prisilno brišu, diskovi odmah odspajaju` : `Oznaka out-of-service uklonjena s ${name}`, on ? 'warn' : 'info', node.id)
  return true
}

/** Delete the Node object (cloud VM gone / CA scale-down); pod GC removes Pods bound to it. */
export function removeNodeObject(s: ClusterState, name: string): boolean {
  const node = findNode(s, name)
  if (!node) return false
  for (const p of [...s.pods]) if (p.nodeName === name) removePod(s, p)
  s.nodes.splice(s.nodes.indexOf(node), 1)
  s.schedGen += 1
  return true
}
