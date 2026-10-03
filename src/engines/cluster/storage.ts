/**
 * Storage: StorageClass → PVC → PV (dynamic provisioning, WaitForFirstConsumer), the attach/detach
 * controller (RWO = one node, Multi-Attach error elsewhere), force detach from an unhealthy node after a
 * Pod deletion has not succeeded for 6 minutes (or immediately with the out-of-service taint), and PVC
 * protection (a PVC in use stays Terminating; with reclaimPolicy Delete the PV and the data go with it).
 */
import type { AccessMode, ClusterState, PersistentVolume, PersistentVolumeClaim, Pod } from './types.ts'
import { OUT_OF_SERVICE } from './nodes.ts'
import { controllersUp, isTerminal, kubeEvent, logEvent, logOnce, newId, nodeByName, nodeHealthy, podRef, resetWarn } from './util.ts'

function uuidish(s: ClusterState): string {
  const hex = (n: number) => {
    let out = ''
    for (let i = 0; i < n; i++) out += Math.floor(s.rng.next() * 16).toString(16)
    return out
  }
  return `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`
}

export function createPvc(s: ClusterState, o: { name: string; namespace?: string; sizeGi?: number; accessMode?: AccessMode; storageClass?: string }): PersistentVolumeClaim {
  const pvc: PersistentVolumeClaim = {
    id: newId(s, 'pvc'),
    name: o.name,
    namespace: o.namespace ?? s.cfg.namespace,
    accessMode: o.accessMode ?? 'RWO',
    sizeGi: o.sizeGi ?? 10,
    storageClass: o.storageClass ?? 'standard',
    phase: 'Pending',
    volumeId: null,
    createdAt: s.t,
    deletion: null,
    provisioningUntil: null,
  }
  s.pvcs.push(pvc)
  return pvc
}

export function findPvc(s: ClusterState, name: string, namespace?: string): PersistentVolumeClaim | undefined {
  return s.pvcs.find((c) => c.name === name && (namespace === undefined || c.namespace === namespace))
}

/** Pods (objects that still exist and are not finished) that reference the claim. */
export function podsUsingPvc(s: ClusterState, pvc: PersistentVolumeClaim): Pod[] {
  return s.pods.filter((p) => p.namespace === pvc.namespace && !isTerminal(p) && p.spec.volumes.some((v) => v.kind === 'pvc' && v.claimName === pvc.name))
}

export function storageTick(s: ClusterState): void {
  if (!controllersUp(s)) return
  const T = s.cfg.timings
  // ---- provisioning & binding
  for (const pvc of s.pvcs) {
    if (pvc.phase !== 'Pending' || pvc.deletion) continue
    const sc = s.storageClasses.find((c) => c.name === pvc.storageClass)
    const immediate = sc?.volumeBindingMode === 'Immediate'
    const consumer = podsUsingPvc(s, pvc).find((p) => p.nodeName !== null)
    if (pvc.provisioningUntil === null && (immediate || consumer)) {
      pvc.provisioningUntil = s.t + T.provisionVolumeS
      kubeEvent(s, 'Normal', 'Provisioning', `persistentvolumeclaim/${pvc.name}`, `External provisioner is provisioning volume for claim "${pvc.namespace}/${pvc.name}"`)
    }
    if (pvc.provisioningUntil !== null && s.t + 1e-9 >= pvc.provisioningUntil) {
      const pv: PersistentVolume = {
        id: newId(s, 'pv'),
        name: `pvc-${uuidish(s)}`,
        sizeGi: pvc.sizeGi,
        accessMode: pvc.accessMode,
        reclaimPolicy: sc?.reclaimPolicy ?? 'Delete',
        phase: 'Bound',
        claimId: pvc.id,
        attachedNode: null,
        attaching: null,
        detachRequestedAt: null,
        createdAt: s.t,
      }
      s.pvs.push(pv)
      pvc.phase = 'Bound'
      pvc.volumeId = pv.id
      pvc.provisioningUntil = null
      kubeEvent(s, 'Normal', 'ProvisioningSucceeded', `persistentvolumeclaim/${pvc.name}`, `Successfully provisioned volume ${pv.name}`)
      logEvent(s, 'pv-provisioned', `PVC ${pvc.name} vezan na novi disk ${pv.name.slice(0, 12)}…`, 'info')
    }
  }
  // ---- attach / detach
  for (const pv of s.pvs) {
    const pvc = s.pvcs.find((c) => c.id === pv.claimId)
    if (!pvc) continue
    const users = podsUsingPvc(s, pvc).filter((p) => p.nodeName !== null)
    if (pv.accessMode === 'RWX' || pv.accessMode === 'ROX') continue
    if (pv.attachedNode) {
      const node = nodeByName(s, pv.attachedNode)
      const healthy = !!node && nodeHealthy(node)
      const oos = !!node && node.taints.some((t) => t.key === OUT_OF_SERVICE)
      const here = users.filter((p) => p.nodeName === pv.attachedNode)
      // a Pod still needs the disk on that node unless it is being deleted and the kubelet confirmed, or force detach applies
      const needed = here.some((p) => {
        if (!p.deletion) return true
        if (healthy) return p.processUp
        if (oos) return false
        return s.t - p.deletion.at + 1e-9 < T.forceDetachS
      })
      if (!needed) {
        if (here.length === 0 && !healthy && !oos) {
          // Pod objects are gone (force-deleted) but the dead node still reports the volume as mounted
          if (pv.detachRequestedAt === null) pv.detachRequestedAt = s.t
          if (s.t - pv.detachRequestedAt + 1e-9 < T.forceDetachS) continue
        }
        const forced = !healthy
        kubeEvent(s, forced ? 'Warning' : 'Normal', forced ? 'ForceDetach' : 'SuccessfulDetachVolume', `volume/${pv.name}`, forced ? `Force detaching volume "${pv.name}" from unhealthy node "${pv.attachedNode}"` : `DetachVolume.Detach succeeded for volume "${pv.name}"`)
        logEvent(s, forced ? 'force-detach' : 'detach', forced ? `Disk ${pv.name.slice(0, 12)}… prisilno odspojen s ${pv.attachedNode}` : `Disk ${pv.name.slice(0, 12)}… odspojen s ${pv.attachedNode}`, forced ? 'warn' : 'info')
        pv.attachedNode = null
        pv.detachRequestedAt = null
      } else pv.detachRequestedAt = null
    }
    const waiting = users.filter((p) => !p.deletion).sort((a, b) => a.createdAt - b.createdAt || a.seq - b.seq)
    if (!pv.attachedNode && !pv.attaching && waiting.length) {
      pv.attaching = { node: waiting[0].nodeName!, until: s.t + T.attachS }
    }
    if (pv.attaching && s.t + 1e-9 >= pv.attaching.until) {
      pv.attachedNode = pv.attaching.node
      pv.attaching = null
      kubeEvent(s, 'Normal', 'SuccessfulAttachVolume', `volume/${pv.name}`, `AttachVolume.Attach succeeded for volume "${pv.name}"`)
    }
    const holder = pv.attachedNode ?? pv.attaching?.node ?? null
    for (const p of waiting) {
      if (holder && p.nodeName !== holder) {
        kubeEvent(s, 'Warning', 'FailedAttachVolume', podRef(p), `Multi-Attach error for volume "${pv.name}" Volume is already exclusively attached to one node and can't be attached to another`)
        logOnce(s, `multiattach:${p.id}`, 'multi-attach', `${p.name}: disk je još spojen na ${holder} (Multi-Attach) – Pod čeka u ContainerCreating`, 'warn', p.id)
      } else resetWarn(s, `multiattach:${p.id}`)
    }
  }
  // ---- PVC protection and reclaim
  for (const pvc of [...s.pvcs]) {
    if (!pvc.deletion) continue
    if (podsUsingPvc(s, pvc).length > 0) {
      logOnce(s, `pvcprot:${pvc.id}`, 'pvc-protection', `PVC ${pvc.name} ostaje Terminating dok ga Pod koristi (pvc-protection)`, 'warn')
      continue
    }
    s.pvcs.splice(s.pvcs.indexOf(pvc), 1)
    const pv = s.pvs.find((v) => v.id === pvc.volumeId)
    if (pv) {
      if (pv.reclaimPolicy === 'Delete') {
        s.pvs.splice(s.pvs.indexOf(pv), 1)
        delete s.dataStores[`pv:${pv.id}`]
        logEvent(s, 'pv-deleted', `PVC ${pvc.name} obrisan – disk ${pv.name.slice(0, 12)}… i podatci obrisani (reclaimPolicy: Delete)`, 'bad')
      } else {
        pv.phase = 'Released'
        pv.claimId = null
        logEvent(s, 'pv-released', `PVC ${pvc.name} obrisan – disk ${pv.name.slice(0, 12)}… zadržan (Retain)`, 'warn')
      }
    } else logEvent(s, 'pvc-deleted', `PVC ${pvc.name} obrisan`, 'neutral')
  }
}

/** kubectl delete pvc: finalizer kubernetes.io/pvc-protection keeps it while a Pod uses it. */
export function deletePvc(s: ClusterState, pvc: PersistentVolumeClaim): void {
  if (pvc.deletion) return
  pvc.deletion = { at: s.t }
  logEvent(s, 'pvc-terminating', `PVC ${pvc.name} označen za brisanje`, 'warn')
}

/** Orders stored where this Pod's database writes (null if not a database or not started). */
export function podOrders(s: ClusterState, pod: Pod): number | null {
  if (!pod.dataStoreId) return null
  return s.dataStores[pod.dataStoreId]?.orders ?? 0
}
