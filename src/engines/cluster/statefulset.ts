/**
 * StatefulSet controller: stable identity (db-0, db-1, …), one PVC per ordinal from volumeClaimTemplates
 * (retained on scale-down and on deletion by default), OrderedReady creation (db-N only after db-(N−1) is
 * Running and Ready), scale-down from the highest ordinal one at a time, and – crucially – it never creates
 * a second db-N while the old db-N object still exists (e.g. stuck Terminating on a dead node).
 * The StatefulSet does NOT replicate data; that is the database's job.
 */
import type { ClusterState, PodTemplate, StatefulSet, VolumeClaimTemplate } from './types.ts'
import { createPodObject, deletePodObject } from './pods.ts'
import { createPvc, findPvc } from './storage.ts'
import { cloneTemplate, controllersUp, isReady, kubeEvent, logEvent, message, newId } from './util.ts'

export function createStatefulSet(
  s: ClusterState,
  o: { name: string; namespace?: string; replicas: number; template: PodTemplate; serviceName: string; volumeClaimTemplates?: VolumeClaimTemplate[]; podManagementPolicy?: StatefulSet['podManagementPolicy'] },
): StatefulSet {
  const sts: StatefulSet = {
    id: newId(s, 'sts'),
    name: o.name,
    namespace: o.namespace ?? s.cfg.namespace,
    replicas: o.replicas,
    selector: { ...o.template.labels },
    template: cloneTemplate(o.template),
    serviceName: o.serviceName,
    volumeClaimTemplates: o.volumeClaimTemplates ?? [],
    podManagementPolicy: o.podManagementPolicy ?? 'OrderedReady',
    retention: { whenDeleted: 'Retain', whenScaled: 'Retain' },
    createdAt: s.t,
  }
  s.statefulSets.push(sts)
  return sts
}

export function claimName(tpl: VolumeClaimTemplate, sts: StatefulSet, ordinal: number): string {
  return `${tpl.name}-${sts.name}-${ordinal}`
}

function podTemplateFor(sts: StatefulSet, ordinal: number): PodTemplate {
  const t = cloneTemplate(sts.template)
  for (const vct of sts.volumeClaimTemplates) {
    t.volumes = t.volumes.filter((v) => v.name !== vct.name)
    t.volumes.push({ name: vct.name, kind: 'pvc', claimName: claimName(vct, sts, ordinal) })
  }
  return t
}

function createOrdinal(s: ClusterState, sts: StatefulSet, i: number): void {
  for (const vct of sts.volumeClaimTemplates) {
    const name = claimName(vct, sts, i)
    if (!findPvc(s, name, sts.namespace)) {
      createPvc(s, { name, namespace: sts.namespace, sizeGi: vct.sizeGi, accessMode: vct.accessMode, storageClass: vct.storageClass })
      kubeEvent(s, 'Normal', 'SuccessfulCreate', `statefulset/${sts.name}`, `create Claim ${name} Pod ${sts.name}-${i} in StatefulSet ${sts.name} success`)
    }
  }
  const pod = createPodObject(s, podTemplateFor(sts, i), {
    name: `${sts.name}-${i}`,
    namespace: sts.namespace,
    owner: { kind: 'StatefulSet', id: sts.id, name: sts.name },
    ordinal: i,
    extraLabels: { 'statefulset.kubernetes.io/pod-name': `${sts.name}-${i}`, 'apps.kubernetes.io/pod-index': String(i) },
  })
  message(s, 'controller-manager', 'apiserver', `stvori ${pod.name}`, 3, undefined, { object: pod.name })
  kubeEvent(s, 'Normal', 'SuccessfulCreate', `statefulset/${sts.name}`, `create Pod ${pod.name} in StatefulSet ${sts.name} successful`)
  logEvent(s, 'sts-create', `StatefulSet ${sts.name} stvara ${pod.name}`, 'info', pod.id)
}

export function statefulSetTick(s: ClusterState): void {
  if (!controllersUp(s)) return
  for (const sts of s.statefulSets) {
    const pods = s.pods.filter((p) => p.owner?.kind === 'StatefulSet' && p.owner.id === sts.id)
    const byOrdinal = new Map<number, (typeof pods)[number]>()
    for (const p of pods) if (p.ordinal !== null) byOrdinal.set(p.ordinal, p)
    const healthy = (i: number) => {
      const p = byOrdinal.get(i)
      return !!p && p.phase === 'Running' && isReady(p)
    }
    const ordered = sts.podManagementPolicy === 'OrderedReady'
    let blocked = false
    for (let i = 0; i < sts.replicas; i++) {
      const p = byOrdinal.get(i)
      if (!p) {
        if (blocked) break
        createOrdinal(s, sts, i)
        if (ordered) {
          blocked = true
          break
        }
        continue
      }
      if (p.phase === 'Failed' || p.phase === 'Succeeded') {
        if (!p.deletion) deletePodObject(s, p, 'statefulset-recreate')
        if (ordered) {
          blocked = true
          break
        }
        continue
      }
      if (p.deletion) {
        // the old db-N still exists: never create a second one
        if (ordered) {
          blocked = true
          break
        }
        continue
      }
      if (ordered && !healthy(i)) {
        blocked = true
        break
      }
    }
    // scale down: highest ordinal first, one at a time (OrderedReady waits for the rest to be healthy)
    const over = pods.filter((p) => p.ordinal !== null && p.ordinal >= sts.replicas).sort((a, b) => b.ordinal! - a.ordinal!)
    if (over.length) {
      if (ordered) {
        if (over.some((p) => p.deletion) || blocked) continue
        deletePodObject(s, over[0], 'statefulset-scale-down')
        logEvent(s, 'sts-scale-down', `StatefulSet ${sts.name} gasi ${over[0].name} (najviši redni broj) – PVC ostaje`, 'info', over[0].id)
      } else for (const p of over) if (!p.deletion) deletePodObject(s, p, 'statefulset-scale-down')
    }
  }
}

export function findStatefulSet(s: ClusterState, name: string): StatefulSet | undefined {
  return s.statefulSets.find((x) => x.name === name)
}

/** kubectl delete statefulset: Pods go (garbage collector), PVCs stay (retention Retain). */
export function deleteStatefulSet(s: ClusterState, sts: StatefulSet): void {
  s.statefulSets.splice(s.statefulSets.indexOf(sts), 1)
  logEvent(s, 'sts-deleted', `StatefulSet ${sts.name} obrisan – Podovi se gase, PVC-ovi ostaju`, 'warn', sts.id)
}
