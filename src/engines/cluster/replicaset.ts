/**
 * ReplicaSet controller (+ the garbage collector's cascading delete).
 *
 * Level-triggered: every pass compares spec.replicas with the active Pods it owns (Pods being deleted or
 * finished do not count), creates or deletes the difference, releases Pods whose labels no longer match
 * and adopts matching orphans. Scale-down picks victims like ActivePodsWithRanks:
 * unscheduled → Pending → not Ready → more Pods of the set on the same node → most recently Ready →
 * more restarts → newest.
 */
import type { ClusterState, Pod, ReplicaSet } from './types.ts'
import { createPodObject, deletePodObject } from './pods.ts'
import { controllersUp, isActive, isAvailable, isReady, kubeEvent, logEvent, matches, message, observed, randSuffix } from './util.ts'

export function podsOfReplicaSet(s: ClusterState, rs: ReplicaSet): Pod[] {
  return s.pods.filter((p) => p.owner?.kind === 'ReplicaSet' && p.owner.id === rs.id)
}

export interface ReplicaSetStatus {
  /** active Pods (not terminating, not finished) */
  replicas: number
  ready: number
  available: number
  terminating: number
}

export function replicaSetStatus(s: ClusterState, rs: ReplicaSet, minReadySeconds = 0): ReplicaSetStatus {
  const pods = podsOfReplicaSet(s, rs)
  const active = pods.filter(isActive)
  return {
    replicas: active.length,
    ready: active.filter(isReady).length,
    available: active.filter((p) => isAvailable(p, s.t, minReadySeconds)).length,
    terminating: pods.filter((p) => p.deletion !== null).length,
  }
}

const PHASE_ORDINAL: Record<string, number> = { Pending: 0, Unknown: 1, Running: 2 }

/** Sorted so that index 0 is deleted first. */
export function rankForDeletion(pods: Pod[]): Pod[] {
  const onNode = new Map<string, number>()
  for (const p of pods) if (p.nodeName) onNode.set(p.nodeName, (onNode.get(p.nodeName) ?? 0) + 1)
  const rank = (p: Pod) => (p.nodeName ? (onNode.get(p.nodeName) ?? 0) : 0)
  return [...pods].sort((a, b) => {
    const ua = a.nodeName === null
    const ub = b.nodeName === null
    if (ua !== ub) return ua ? -1 : 1
    const pa = PHASE_ORDINAL[a.phase] ?? 2
    const pb = PHASE_ORDINAL[b.phase] ?? 2
    if (pa !== pb) return pa - pb
    const ra = isReady(a)
    const rb = isReady(b)
    if (ra !== rb) return ra ? 1 : -1
    if (rank(a) !== rank(b)) return rank(b) - rank(a)
    if (ra && rb && a.ready.since !== b.ready.since) return b.ready.since - a.ready.since
    if (a.container.restartCount !== b.container.restartCount) return b.container.restartCount - a.container.restartCount
    if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt
    return b.seq - a.seq
  })
}

export function replicaSetTick(s: ClusterState): void {
  if (!controllersUp(s)) return
  for (const rs of [...s.replicaSets]) {
    // release Pods whose labels no longer match, adopt matching orphans
    for (const p of s.pods) {
      if (p.owner?.kind === 'ReplicaSet' && p.owner.id === rs.id && !matches(rs.selector, p.labels)) {
        p.owner = null
        logEvent(s, 'pod-released', `Pod ${p.name} više ne odgovara selektoru – ReplicaSet ${rs.name} ga otpušta`, 'warn', p.id)
      } else if (p.owner === null && p.namespace === rs.namespace && isActive(p) && matches(rs.selector, p.labels)) {
        p.owner = { kind: 'ReplicaSet', id: rs.id, name: rs.name }
        logEvent(s, 'pod-adopted', `ReplicaSet ${rs.name} preuzima Pod ${p.name}`, 'info', p.id)
      }
    }
    const active = podsOfReplicaSet(s, rs).filter(isActive)
    const diff = active.length - rs.replicas
    if (!observed(s, `rs:${rs.id}`, diff !== 0, 'apiserver', 'controller-manager', diff < 0 ? 'nedostaje Pod' : 'višak Podova')) continue
    if (diff < 0) {
      for (let i = 0; i < -diff; i++) {
        const name = `${rs.name}-${randSuffix(s)}`
        const pod = createPodObject(s, rs.template, {
          name,
          namespace: rs.namespace,
          owner: { kind: 'ReplicaSet', id: rs.id, name: rs.name },
          templateHash: rs.owner ? rs.templateHash : null,
        })
        message(s, 'controller-manager', 'apiserver', 'stvori Pod', 3, undefined, { object: pod.name })
        kubeEvent(s, 'Normal', 'SuccessfulCreate', `replicaset/${rs.name}`, `Created pod: ${pod.name}`)
        logEvent(s, 'pod-created', `ReplicaSet ${rs.name} stvara Pod ${pod.name}`, 'info', pod.id)
      }
    } else {
      for (const victim of rankForDeletion(active).slice(0, diff)) {
        deletePodObject(s, victim, 'scale-down')
        message(s, 'controller-manager', 'apiserver', 'obriši Pod', 3, undefined, { object: victim.name })
        kubeEvent(s, 'Normal', 'SuccessfulDelete', `replicaset/${rs.name}`, `Deleted pod: ${victim.name}`)
      }
    }
  }
}

/** Background cascading deletion: dependents of deleted owners are deleted. */
export function garbageCollect(s: ClusterState): void {
  if (!controllersUp(s)) return
  for (const rs of [...s.replicaSets]) {
    if (rs.owner && !s.deployments.some((d) => d.id === rs.owner!.id)) {
      s.replicaSets.splice(s.replicaSets.indexOf(rs), 1)
      logEvent(s, 'rs-deleted', `ReplicaSet ${rs.name} obrisan (vlasnik ne postoji)`, 'neutral')
    }
  }
  for (const p of [...s.pods]) {
    if (!p.owner || p.deletion) continue
    const exists = p.owner.kind === 'ReplicaSet' ? s.replicaSets.some((r) => r.id === p.owner!.id) : s.statefulSets.some((x) => x.id === p.owner!.id)
    if (!exists) deletePodObject(s, p, 'garbage-collector')
  }
}
