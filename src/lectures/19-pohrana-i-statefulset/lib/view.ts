/** Small view helpers shared by the two flagship stages (pure functions, no React). */
import type { ClusterState, Pod, PersistentVolume } from '../../../engines/cluster/index.ts'
import { podShapeView, podStatus } from '../../../engines/cluster/index.ts'

/** Pencil colour for a kubectl STATUS word (always paired with the word itself). */
export function statusColor(status: string): string {
  if (status === 'Running') return 'var(--green)'
  if (status === 'Terminating') return 'var(--ink-3)'
  if (status === 'ContainerCreating' || status === 'Pending' || status === 'PodInitializing') return 'var(--orange)'
  return 'var(--red)'
}

/** „db-kontejner-6b6958dfd5-vq6xg” → „db-kontejner-…vq6xg” (the random suffix is what changes). */
export function shortName(name: string): string {
  const parts = name.split('-')
  if (parts.length < 3) return name
  const tail = parts[parts.length - 1]
  const hash = parts[parts.length - 2]
  if (!/^[a-z0-9]{5}$/.test(tail) || !/^[a-z0-9]{8,10}$/.test(hash)) return name
  return `${parts.slice(0, -2).join('-')}-…${tail}`
}

export interface PodLook {
  status: string
  shape: ReturnType<typeof podShapeView>['status']
  /** the disk this Pod waits for is attached to another node */
  multiAttach: string | null
  /** the second Postgres on one data directory failed on the lock */
  lock: boolean
}

export function podLook(cl: ClusterState, p: Pod): PodLook {
  const v = podShapeView(p)
  const status = podStatus(p)
  let multiAttach: string | null = null
  if (!p.deletion && !p.processUp && p.nodeName) {
    for (const vol of p.spec.volumes) {
      if (vol.kind !== 'pvc') continue
      const pvc = cl.pvcs.find((c) => c.name === vol.claimName && c.namespace === p.namespace)
      const pv = pvc ? cl.pvs.find((x) => x.id === pvc.volumeId) : undefined
      const holder = pv?.attachedNode ?? pv?.attaching?.node ?? null
      if (holder && holder !== p.nodeName) multiAttach = holder
    }
  }
  const lockNow = p.processUp && p.kubelet.crashAt !== null && p.kubelet.crashMessage.includes('postmaster.pid')
  const lockBefore = !p.processUp && p.container.lastTermination?.reason === 'Error' && p.logs.some((l) => l.line.includes('postmaster.pid'))
  const lock = !p.deletion && (lockNow || lockBefore)
  return { status, shape: v.status, multiAttach, lock }
}

export type CableState = 'attached' | 'attaching' | 'stuck' | 'none'

/** How a PersistentVolume hangs on its node: attached to a healthy node, being attached, stuck on a dead one, free. */
export function cableState(cl: ClusterState, pv: PersistentVolume | undefined): { state: CableState; node: string | null } {
  if (!pv) return { state: 'none', node: null }
  if (pv.attachedNode) {
    const n = cl.nodes.find((x) => x.name === pv.attachedNode)
    const healthy = !!n && n.machine === 'running' && n.kubeletUp && n.condition.ready === 'True'
    return { state: healthy ? 'attached' : 'stuck', node: pv.attachedNode }
  }
  if (pv.attaching) return { state: 'attaching', node: pv.attaching.node }
  return { state: 'none', node: null }
}

/** Short node line for chips: what the machine is doing and what the API believes. */
export function nodeLine(cl: ClusterState, name: string): { text: string; bad: boolean; oos: boolean } {
  const n = cl.nodes.find((x) => x.name === name)
  if (!n) return { text: '?', bad: true, oos: false }
  const oos = n.taints.some((t) => t.key === 'node.kubernetes.io/out-of-service')
  if (n.condition.ready === 'True' && n.machine !== 'running') return { text: 'ugašen · API: Ready', bad: true, oos }
  if (n.condition.ready !== 'True') return { text: 'NotReady', bad: true, oos }
  return { text: 'Ready', bad: false, oos }
}
