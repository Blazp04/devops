/**
 * Volumes, PVCs and StatefulSet (L19) – curriculum L19 model + tech-facts (non-graceful node shutdown).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ClusterState } from './types.ts'
import {
  advance,
  COMPRESSED,
  compressedLabel,
  deletePod,
  deletePvcByName,
  deleteStatefulSetByName,
  killContainer,
  kubectlGetPvc,
  podOrders,
  podStatus,
  powerOffNode,
  powerOnNode,
  presetStorage,
  processTick,
  runUntil,
  resolveDns,
  scaleStatefulSet,
  setOutOfService,
} from './index.ts'

function live(s: ClusterState, app: string) {
  const p = s.pods.find((x) => x.labels.app === app && !x.deletion)
  assert.ok(p, `live pod for ${app}`)
  return p
}

function liveOrders(s: ClusterState, app: string): number {
  return podOrders(s, live(s, app)) ?? -1
}

test('container restart: container filesystem loses data, emptyDir and PVC keep it', () => {
  const s = presetStorage({ part: 'volumes' })
  advance(s, 30)
  const before = { c: liveOrders(s, 'db-kontejner'), e: liveOrders(s, 'db-emptydir'), p: liveOrders(s, 'db-pvc') }
  assert.ok(before.c > 30 && before.e > 30 && before.p > 30)
  for (const app of ['db-kontejner', 'db-emptydir', 'db-pvc']) assert.equal(killContainer(s, live(s, app).name), true)
  advance(s, 1.5)
  assert.ok(liveOrders(s, 'db-kontejner') < 5, 'fresh writable layer')
  assert.ok(liveOrders(s, 'db-emptydir') >= before.e)
  assert.ok(liveOrders(s, 'db-pvc') >= before.p)
  assert.equal(live(s, 'db-kontejner').container.restartCount, 1)
})

test('deleting the Pod: emptyDir dies with it, the PVC-backed data survives the replacement Pod', () => {
  const s = presetStorage({ part: 'volumes' })
  advance(s, 30)
  const pvcBefore = liveOrders(s, 'db-pvc')
  const emptyBefore = liveOrders(s, 'db-emptydir')
  for (const app of ['db-kontejner', 'db-emptydir', 'db-pvc']) assert.equal(deletePod(s, live(s, app).name).ok, true)
  advance(s, 15)
  assert.ok(liveOrders(s, 'db-emptydir') < emptyBefore)
  assert.ok(liveOrders(s, 'db-pvc') >= pvcBefore)
})

test('node failure, Deployment + RWO PVC: NotReady → evicted after the toleration → Multi-Attach → force detach after 6 min (compressed)', () => {
  const s = presetStorage({ part: 'volumes' })
  advance(s, 20)
  const node = live(s, 'db-pvc').nodeName!
  const ordersBefore = liveOrders(s, 'db-pvc')
  powerOffNode(s, node)
  const t0 = s.t
  const T = s.cfg.timings
  let replacementAt: number | null = null
  let multiAttachSeen = false
  let runningAt: number | null = null
  for (let i = 0; i < 900 && runningAt === null; i++) {
    processTick(s)
    const pods = s.pods.filter((p) => p.labels.app === 'db-pvc')
    const repl = pods.find((p) => p.nodeName !== node && !p.deletion)
    if (repl && replacementAt === null) replacementAt = s.t - t0
    if (repl && s.kubeEvents.some((e) => e.reason === 'FailedAttachVolume' && e.object === `pod/${repl.name}`)) multiAttachSeen = true
    if (repl && repl.processUp && runningAt === null) runningAt = s.t - t0
  }
  // the replacement is created when the old Pod is marked for deletion (grace + toleration)
  assert.ok(replacementAt! >= T.nodeMonitorGraceS + T.podEvictionTolerationS - 0.2 && replacementAt! <= T.nodeMonitorGraceS + T.podEvictionTolerationS + 0.5, `replacement at +${replacementAt}`)
  assert.equal(multiAttachSeen, true)
  const detachAt = T.nodeMonitorGraceS + T.podEvictionTolerationS + T.forceDetachS
  assert.ok(runningAt! >= detachAt && runningAt! <= detachAt + 3, `running at +${runningAt}, force detach due at +${detachAt}`)
  // the old Pod object stays Terminating (no kubelet confirms)
  assert.equal(podStatus(s.pods.find((p) => p.labels.app === 'db-pvc' && p.nodeName === node)!), 'Terminating')
  advance(s, 5)
  assert.ok(liveOrders(s, 'db-pvc') >= ordersBefore, 'data survived on the PersistentVolume')
  assert.equal(compressedLabel(COMPRESSED.podEvictionToleration), '20 s (sim) · stvarno: 5 min')
  assert.equal(compressedLabel(COMPRESSED.forceDetach), '24 s (sim) · stvarno: 6 min')
})

test('node failure wipes the container-filesystem and emptyDir variants (replacement starts empty)', () => {
  const s = presetStorage({ part: 'volumes' })
  advance(s, 20)
  for (const app of ['db-kontejner', 'db-emptydir']) {
    const old = live(s, app)
    const node = old.nodeName!
    const before = liveOrders(s, app)
    assert.ok(before > 20, `${app} wrote orders before the failure (${before})`)
    powerOffNode(s, node)
    // the replacement appears once the old Pod is marked for deletion; look at it the moment it starts
    const started = runUntil(s, (x) => x.pods.some((p) => p.labels.app === app && p.id !== old.id && p.processUp), 120)
    assert.notEqual(started, null, `${app}: no replacement started`)
    const repl = live(s, app)
    assert.notEqual(repl.id, old.id)
    assert.notEqual(repl.nodeName, node)
    assert.notEqual(repl.dataStoreId, old.dataStoreId, 'a different (fresh) data store')
    assert.ok(liveOrders(s, app) <= 1, `${app}: replacement starts empty (${liveOrders(s, app)} orders, ${before} lost)`)
    powerOnNode(s, node)
    advance(s, 15)
    assert.equal(s.pods.some((p) => p.id === old.id), false, 'the returning kubelet confirms the old deletion')
  }
})

test('StatefulSet: ordered creation, one PVC per ordinal, stable DNS via the headless Service', () => {
  const s = presetStorage({ part: 'statefulset' })
  assert.deepEqual(
    s.pods.map((p) => p.name).sort(),
    ['db-0', 'db-1', 'db-2'],
  )
  assert.deepEqual(
    s.pvcs.map((c) => c.name).sort(),
    ['data-db-0', 'data-db-1', 'data-db-2'],
  )
  assert.ok(kubectlGetPvc(s).every((l, i) => i === 0 || l.includes('Bound')))
  const ip1 = s.pods.find((p) => p.name === 'db-1')!.ip!
  assert.deepEqual(resolveDns(s, 'db-1.db.klopa.svc.cluster.local'), { name: 'db-1.db.klopa.svc.cluster.local', kind: 'pod', ips: [ip1] })
  assert.equal(resolveDns(s, 'db').kind, 'headless')
  assert.equal(resolveDns(s, 'db').ips.length, 3)
  assert.equal(resolveDns(s, 'nema.klopa').kind, 'NXDOMAIN')
})

test('StatefulSet creates db-N only after db-(N−1) is Running and Ready (OrderedReady)', () => {
  const s = presetStorage({ part: 'statefulset' })
  scaleStatefulSet(s, 'db', 0)
  advance(s, 40)
  assert.equal(s.pods.filter((p) => p.labels.app === 'db').length, 0)
  scaleStatefulSet(s, 'db', 3)
  const firstSeen: Record<string, number> = {}
  const readyAt: Record<string, number> = {}
  for (let i = 0; i < 600; i++) {
    processTick(s)
    for (const p of s.pods) {
      if (!(p.name in firstSeen)) firstSeen[p.name] = s.t
      if (p.ready.status && !(p.name in readyAt)) readyAt[p.name] = s.t
    }
  }
  assert.ok(firstSeen['db-1'] >= readyAt['db-0'])
  assert.ok(firstSeen['db-2'] >= readyAt['db-1'])
})

test('deleted db-1 comes back as db-1 on the same PVC; scale-down removes the highest ordinal and keeps PVCs', () => {
  const s = presetStorage({ part: 'statefulset' })
  advance(s, 5)
  const pvcName = s.pods.find((p) => p.name === 'db-1')!.spec.volumes.find((v) => v.kind === 'pvc')!
  deletePod(s, 'db-1')
  advance(s, 15)
  const again = s.pods.find((p) => p.name === 'db-1' && !p.deletion)!
  assert.ok(again)
  assert.deepEqual(again.spec.volumes.find((v) => v.kind === 'pvc'), pvcName)
  scaleStatefulSet(s, 'db', 1)
  advance(s, 30)
  assert.deepEqual(
    s.pods.map((p) => p.name),
    ['db-0'],
  )
  assert.equal(s.pvcs.length, 3, 'PVCs retained on scale-down')
})

test('sudden node loss: db-N is NOT recreated (never two db-1) until the node is marked out-of-service', () => {
  const s = presetStorage({ part: 'statefulset' })
  advance(s, 10)
  const node = s.pods.find((p) => p.name === 'db-1')!.nodeName!
  powerOffNode(s, node)
  advance(s, 120)
  const db1 = s.pods.filter((p) => p.name === 'db-1')
  assert.equal(db1.length, 1)
  assert.equal(podStatus(db1[0]), 'Terminating')
  assert.equal(db1[0].nodeName, node)
  assert.equal(setOutOfService(s, node, true).ok, true)
  advance(s, 10)
  const moved = s.pods.filter((p) => p.name === 'db-1')
  assert.equal(moved.length, 1)
  assert.notEqual(moved[0].nodeName, node)
  assert.equal(moved[0].ready.status, true)
})

test('Postgres with replicas: 3 in a Deployment – without a volume three independent databases; with one shared RWO PVC Multi-Attach / lock conflict', () => {
  const a = presetStorage({ part: 'statefulset', postgresDeployment: 'no-volume' })
  advance(a, 40)
  const stores = new Set(a.pods.filter((p) => p.labels.app === 'postgres').map((p) => p.dataStoreId))
  assert.equal(stores.size, 3)
  const counts = a.pods.filter((p) => p.labels.app === 'postgres').map((p) => podOrders(a, p)!)
  assert.ok(counts.every((c) => c > 0) && Math.max(...counts) < counts.reduce((x, y) => x + y, 0), 'orders are split over three databases')

  const b = presetStorage({ part: 'statefulset', postgresDeployment: 'shared-pvc' })
  advance(b, 40)
  const pg = b.pods.filter((p) => p.labels.app === 'postgres')
  const statuses = pg.map((p) => podStatus(p))
  assert.ok(statuses.includes('ContainerCreating'), `Multi-Attach on another node: ${statuses}`)
  assert.ok(pg.some((p) => p.container.lastTermination?.reason === 'Error'), 'second Postgres on the same data directory fails on the lock')
  assert.ok(b.events.some((e) => e.kind === 'db-lock'))
})

test('"Obriši PVC": pvc-protection keeps it Terminating while used; then the PV and the data are deleted', () => {
  const s = presetStorage({ part: 'statefulset' })
  advance(s, 5)
  assert.equal(deletePvcByName(s, 'data-db-2').ok, true)
  advance(s, 5)
  assert.ok(kubectlGetPvc(s).some((l) => l.startsWith('data-db-2') && l.includes('Terminating')))
  const pvId = s.pvcs.find((c) => c.name === 'data-db-2')!.volumeId!
  scaleStatefulSet(s, 'db', 2)
  advance(s, 20)
  assert.equal(s.pvcs.some((c) => c.name === 'data-db-2'), false)
  assert.equal(s.pvs.some((v) => v.id === pvId), false)
  assert.equal(s.dataStores[`pv:${pvId}`], undefined)
  assert.equal(deletePvcByName(s, 'nope').ok, false)
})

test('deleting the StatefulSet keeps the PVCs (retention Retain)', () => {
  const s = presetStorage({ part: 'statefulset' })
  assert.equal(deleteStatefulSetByName(s, 'db').ok, true)
  advance(s, 15)
  assert.equal(s.pods.length, 0)
  assert.equal(s.pvcs.length, 3)
  assert.equal(deleteStatefulSetByName(s, 'db').ok, false)
})
