/**
 * Flagship part 2 „Deployment ili StatefulSet?” – a thin adapter over the E3 engine (presetStorage part
 * 'statefulset'). StatefulSet db ×3 with a headless Service and one PVC per ordinal (data-db-N); every db-N gets its
 * own test writes through Service db-N, so each disk visibly holds its own rows (the StatefulSet copies nothing).
 * Optionally a Postgres Deployment with replicas: 3 – without a volume (three databases behind one Service) or all
 * sharing one RWO PVC (Multi-Attach on other nodes, the postmaster.pid lock on the same node).
 */
import type { ClusterState, Pod, PersistentVolumeClaim, Tone } from '../../../engines/cluster/index.ts'
import {
  OUT_OF_SERVICE,
  createPvc,
  createStatefulSet,
  deletePod,
  deletePvcByName,
  deleteStatefulSetByName,
  findService,
  findStatefulSet,
  hrCount,
  pickEndpoint,
  podOrders,
  podsUsingPvc,
  postgresTemplate,
  powerOffNode,
  powerOnNode,
  presetStorage,
  resolveDns,
  scaleStatefulSet,
  sendRequest,
  setOutOfService,
  stepCluster,
} from '../../../engines/cluster/index.ts'
import type { LabEvent } from './volumes'

export const ID_SEED = 42
export type DeployVariant = 'none' | 'no-volume' | 'shared-pvc'
export const ORDINALS = [0, 1, 2] as const
export const ORDER_NO = 1042

export interface IdLab {
  cl: ClusterState
  variant: DeployVariant
  /** „Smanjite na 1 pa vratite na 3”: db-2's orders when it was last running, and whether we went down to 1 */
  scale: { db2Last: number; db2Before: number | null; db2Vol: string | null; down: boolean; done: boolean }
  /** vol = the disk behind data-db-N when the node died (the goal needs the same disk back) */
  failure: { node: string; at: number; ordinal: number | null; before: number; vol: string | null; oos: boolean } | null
  nodeDone: boolean
  /** Lana's order 1042 (no-volume Deployment): the data store it was written to */
  order: { store: string; pod: string } | null
  reads: { total: number; found: number; last: { pod: string; found: boolean } | null }
  stsDeleted: boolean
  events: LabEvent[]
  seq: number
}

function log(w: IdLab, text: string, tone: Tone): void {
  w.seq += 1
  w.events.push({ id: `i${w.seq}`, t: w.cl.t, text, tone })
  if (w.events.length > 20) w.events.splice(0, w.events.length - 20)
}

export function createIdLab(variant: DeployVariant): IdLab {
  const cl = presetStorage({ part: 'statefulset', seed: ID_SEED, postgresDeployment: variant === 'none' ? 'none' : variant })
  return {
    cl,
    variant,
    scale: { db2Last: 0, db2Before: null, db2Vol: null, down: false, done: false },
    failure: null,
    nodeDone: false,
    order: null,
    reads: { total: 0, found: 0, last: null },
    stsDeleted: false,
    events: [],
    seq: 0,
  }
}

export function dbPod(cl: ClusterState, i: number): Pod | undefined {
  return cl.pods.find((p) => p.name === `db-${i}`)
}

export function dbPvc(cl: ClusterState, i: number): PersistentVolumeClaim | undefined {
  return cl.pvcs.find((c) => c.name === `data-db-${i}`)
}

/** Orders on a claim's disk (null when the disk was never written / no longer exists). */
export function pvcOrders(cl: ClusterState, pvc: PersistentVolumeClaim | undefined): number | null {
  if (!pvc?.volumeId) return null
  return cl.dataStores[`pv:${pvc.volumeId}`]?.orders ?? null
}

/** Pods of the Postgres Deployment, oldest first (terminating ones last). */
export function deployPods(cl: ClusterState): Pod[] {
  return cl.pods
    .filter((p) => p.labels.app === 'postgres')
    .sort((a, b) => Number(!!a.deletion) - Number(!!b.deletion) || a.createdAt - b.createdAt || a.seq - b.seq)
}

export function stsReplicas(cl: ClusterState): number | null {
  return findStatefulSet(cl, 'db')?.replicas ?? null
}

function up(p: Pod | undefined): boolean {
  return !!p && !p.deletion && p.processUp && p.ready.status
}

/** How many Pod objects share a StatefulSet name (the engine never allows two db-N; shown as a live check). */
export function duplicateNames(cl: ClusterState): number {
  const seen = new Map<string, number>()
  for (const p of cl.pods) if (p.ordinal !== null) seen.set(p.name, (seen.get(p.name) ?? 0) + 1)
  return [...seen.values()].filter((n) => n > 1).length
}

/** Distinct databases behind Service postgres (running Pods' data stores). */
export function distinctDbs(cl: ClusterState): number {
  return new Set(deployPods(cl).filter((p) => p.processUp && p.dataStoreId).map((p) => p.dataStoreId)).size
}

/**
 * Chance that a read through Service postgres finds a given order: the order sits in database i with probability
 * share_i (its part of all orders), and a new connection lands on each ready Pod with probability 1 / N_ready,
 * so P = Σ over ready Pods of share_i / N_ready (= 1 / N_ready when every database is reachable).
 */
export function findChance(cl: ClusterState): number | null {
  const all = new Map<string, number>()
  const ready = new Set<string>()
  for (const p of deployPods(cl)) {
    if (!p.processUp || !p.dataStoreId) continue
    all.set(p.dataStoreId, podOrders(cl, p) ?? 0)
    if (p.ready.status && !p.deletion) ready.add(p.dataStoreId)
  }
  const total = [...all.values()].reduce((a, b) => a + b, 0)
  if (total < 20 || ready.size === 0) return null
  let sum = 0
  for (const id of ready) sum += (all.get(id) ?? 0) / total / ready.size
  return sum
}

/**
 * Engine gap (reported): the engine's scheduler accepts a claim that is being deleted, and its pvc-protection also
 * counts Pods that were never scheduled on that claim. In Kubernetes a db-N created after `kubectl delete pvc`
 * can never use the old claim: the scheduler rejects it, pvc-protection lets the PVC, PV and disk go, and the
 * StatefulSet creates a new, empty data-db-N for the Pending db-N. This adapter applies exactly that outcome.
 */
function finishClaimDeletion(w: IdLab): void {
  const cl = w.cl
  for (const pvc of [...cl.pvcs]) {
    if (!pvc.deletion || !pvc.name.startsWith('data-db-')) continue
    const users = podsUsingPvc(cl, pvc)
    if (users.length === 0) continue
    const since = pvc.deletion.at
    if (users.some((p) => p.nodeName !== null && p.createdAt < since)) continue
    cl.pvcs.splice(cl.pvcs.indexOf(pvc), 1)
    const pv = cl.pvs.find((v) => v.id === pvc.volumeId)
    if (pv) {
      cl.pvs.splice(cl.pvs.indexOf(pv), 1)
      delete cl.dataStores[`pv:${pv.id}`]
    }
    createPvc(cl, { name: pvc.name, namespace: pvc.namespace, sizeGi: pvc.sizeGi, accessMode: pvc.accessMode, storageClass: pvc.storageClass })
    log(w, `Novi ${users[0].name} ne smije na PVC koji se briše: ${pvc.name} i disk su obrisani, a StatefulSet stvara novi, prazan ${pvc.name}`, 'bad')
  }
}

export function stepIdLab(w: IdLab, dt: number): void {
  stepCluster(w.cl, dt)
  finishClaimDeletion(w)
  const cl = w.cl
  const sc = w.scale
  const db2 = dbPod(cl, 2)
  const reps = stsReplicas(cl)
  if (up(db2)) sc.db2Last = pvcOrders(cl, dbPvc(cl, 2)) ?? sc.db2Last
  if (!db2 && sc.db2Before === null && sc.db2Last > 0) {
    sc.db2Before = sc.db2Last
    sc.db2Vol = dbPvc(cl, 2)?.volumeId ?? null
  }
  if (reps !== null && reps <= 1 && !dbPod(cl, 1) && !db2) sc.down = true
  if (!sc.done && sc.down && sc.db2Before !== null && reps === 3 && up(db2) && dbPvc(cl, 2)?.volumeId === sc.db2Vol) {
    const now = pvcOrders(cl, dbPvc(cl, 2)) ?? 0
    if (now >= sc.db2Before) {
      sc.done = true
      log(w, `db-2 je opet tu s istim PVC-om data-db-2: ${hrCount(now, ['narudžba', 'narudžbe', 'narudžbi'])} (prije ${sc.db2Before})`, 'ok')
    }
  }
  const f = w.failure
  if (!w.nodeDone && f && f.ordinal !== null && f.oos) {
    const p = dbPod(cl, f.ordinal)
    const now = pvcOrders(cl, dbPvc(cl, f.ordinal))
    if (p && up(p) && p.nodeName !== f.node && now !== null && now >= f.before && dbPvc(cl, f.ordinal)?.volumeId === f.vol) {
      w.nodeDone = true
      log(w, `db-${f.ordinal} radi na ${p.nodeName} s diskom data-db-${f.ordinal} – i nikad nisu postojala dva db-${f.ordinal}`, 'ok')
    }
  }
}

// ---------------------------------------------------------------- actions (call inside sim.mutate)

export function setReplicas(w: IdLab, n: number): string {
  const r = scaleStatefulSet(w.cl, 'db', n)
  if (r.ok) {
    log(w, `kubectl scale statefulset/db --replicas=${n}`, 'info')
    // a quick 3 → 1 → 3 on the slider still counts: db-2's rows at the moment of the scale-down are the reference
    if (n <= 1) {
      w.scale.down = true
      if (w.scale.db2Before === null && w.scale.db2Last > 0) {
        w.scale.db2Before = w.scale.db2Last
        w.scale.db2Vol = dbPvc(w.cl, 2)?.volumeId ?? null
      }
    }
  }
  return r.message
}

export function deleteDbPod(w: IdLab, i: number): void {
  const r = deletePod(w.cl, `db-${i}`)
  if (r.ok) log(w, `kubectl delete pod db-${i} – StatefulSet ga vraća pod istim imenom`, 'warn')
}

export function nodeOff(cl: ClusterState, name: string): boolean {
  return cl.nodes.find((n) => n.name === name)?.machine === 'off'
}

export function nodeOos(cl: ClusterState, name: string): boolean {
  return !!cl.nodes.find((n) => n.name === name)?.taints.some((t) => t.key === OUT_OF_SERVICE)
}

export function anyNodeDown(cl: ClusterState): string | null {
  return cl.nodes.find((n) => n.machine === 'off' || n.taints.some((t) => t.key === OUT_OF_SERVICE))?.name ?? null
}

/** „Čvor pao” on the node that runs db-i. */
export function failNodeOf(w: IdLab, i: number): void {
  const p = dbPod(w.cl, i)
  if (!p || !p.nodeName || anyNodeDown(w.cl)) return
  const node = p.nodeName
  const before = pvcOrders(w.cl, dbPvc(w.cl, i)) ?? 0
  if (!powerOffNode(w.cl, node)) return
  w.failure = { node, at: w.cl.t, ordinal: i, before, vol: dbPvc(w.cl, i)?.volumeId ?? null, oos: false }
  log(w, `${node} je naglo ostao bez struje – na njemu je db-${i}`, 'bad')
}

export function markOos(w: IdLab, node: string): string {
  const r = setOutOfService(w.cl, node, true)
  if (r.ok && w.failure?.node === node) w.failure.oos = true
  return r.message
}

export function repair(w: IdLab, node: string): void {
  powerOnNode(w.cl, node)
  const hadOos = nodeOos(w.cl, node)
  if (hadOos) setOutOfService(w.cl, node, false)
  if (w.failure?.node === node) w.failure = null
  log(w, hadOos ? `${node} ponovno radi – taint out-of-service uklonjen` : `${node} ponovno radi – stari Podovi se vraćaju`, 'info')
}

export function deleteClaim(w: IdLab, i: number): string {
  const r = deletePvcByName(w.cl, `data-db-${i}`)
  return r.message
}

export function deleteSts(w: IdLab): string {
  const r = deleteStatefulSetByName(w.cl, 'db')
  if (r.ok) w.stsDeleted = true
  return r.message
}

/** kubectl apply -f statefulset.yaml again – the same manifest presetStorage uses; existing PVCs are reused. */
export function recreateSts(w: IdLab): void {
  if (findStatefulSet(w.cl, 'db')) return
  createStatefulSet(w.cl, {
    name: 'db',
    replicas: 3,
    serviceName: 'db',
    template: postgresTemplate({ app: 'db' }, { dataVolume: 'data' }),
    volumeClaimTemplates: [{ name: 'data', sizeGi: 10, accessMode: 'RWO', storageClass: 'standard' }],
  })
  w.stsDeleted = false
  log(w, 'kubectl apply -f statefulset.yaml – isti volumeClaimTemplates, pa db-N nalazi svoj stari PVC', 'info')
}

/** „Spremi narudžbu 1042”: one write through Service postgres (the engine picks a ready Pod at random). */
export function saveOrder(w: IdLab): void {
  const res = sendRequest(w.cl, 'postgres')
  const p = res?.request.podId ? w.cl.pods.find((x) => x.id === res.request.podId) : undefined
  if (!res || res.request.outcome !== 'ok' || !p?.dataStoreId) {
    log(w, `Narudžba ${ORDER_NO} nije spremljena – nijedan Postgres ne odgovara`, 'bad')
    return
  }
  w.order = { store: p.dataStoreId, pod: p.name }
  w.reads = { total: 0, found: 0, last: null }
  log(w, `Narudžba ${ORDER_NO} spremljena – Service je vezu poslao Podu ${p.name}`, 'info')
}

/** „Pročitaj narudžbu 1042”: a new connection through Service postgres lands on a random ready Pod. */
export function readOrder(w: IdLab): void {
  if (!w.order) return
  const svc = findService(w.cl, 'postgres')
  const ep = svc ? pickEndpoint(w.cl, svc) : null
  const p = ep ? w.cl.pods.find((x) => x.id === ep.podId) : undefined
  if (!p) {
    log(w, 'Čitanje nije uspjelo – Service postgres nema spremnih Podova', 'bad')
    return
  }
  const found = p.dataStoreId === w.order.store
  w.reads.total += 1
  if (found) w.reads.found += 1
  w.reads.last = { pod: p.name, found }
  log(w, found ? `SELECT … WHERE id = ${ORDER_NO} → ${p.name}: 1 redak` : `SELECT … WHERE id = ${ORDER_NO} → ${p.name}: 0 redaka – „narudžba je nestala”`, found ? 'ok' : 'bad')
}

export type DnsQuery = 'db-1.db' | 'db' | 'postgres'

/** nslookup inside the Namespace klopa (search path) – lines for the kit's Terminal. */
export function dnsLines(cl: ClusterState, q: DnsQuery): string[] {
  const a = resolveDns(cl, q)
  if (a.kind === 'NXDOMAIN') return [`** server can't find ${q}: NXDOMAIN`]
  const who = (ip: string) => cl.pods.find((p) => p.ip === ip && !p.deletion)?.name
  const out = [`Name:    ${a.name}`]
  for (const ip of a.ips) {
    const pod = who(ip)
    out.push(`Address: ${ip}${a.kind === 'ClusterIP' ? '   (ClusterIP)' : pod ? `   (${pod})` : ''}`)
  }
  return out
}
