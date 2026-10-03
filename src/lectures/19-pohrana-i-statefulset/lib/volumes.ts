/**
 * Flagship part 1 „Preživljavaju li podatci?” – a thin adapter over the E3 engine (presetStorage part 'volumes').
 * Three Postgres Deployments (one replica each, 2 writes/s): db-kontejner keeps its rows in the container's
 * writable layer, db-emptydir in an emptyDir volume, db-pvc on a PersistentVolume (PVC db-pvc-data, RWO).
 * The engine does all the Kubernetes work; this file only adds the lesson's bookkeeping: which data store each
 * variant writes to, how many orders were lost when a variant came back with a fresh store, the goals and a
 * few lab events.
 */
import type { ClusterState, Pod, Tone } from '../../../engines/cluster/index.ts'
import {
  COMPRESSED,
  OUT_OF_SERVICE,
  deletePod,
  hrCount,
  killContainer,
  podOrders,
  powerOffNode,
  powerOnNode,
  presetStorage,
  setOutOfService,
  stepCluster,
} from '../../../engines/cluster/index.ts'

export const VOL_SEED = 42
export const VOL_PRESET = 'volumeni'

export const VARIANTS = ['db-kontejner', 'db-emptydir', 'db-pvc'] as const
export type Variant = (typeof VARIANTS)[number]

/** Where each variant keeps its rows (Croatian, for labels). */
export const WHERE: Record<Variant, { short: string; long: string }> = {
  'db-kontejner': { short: 'u kontejneru', long: 'sloj kontejnera za pisanje' },
  'db-emptydir': { short: 'u emptyDiru', long: 'volumen emptyDir u Podu' },
  'db-pvc': { short: 'na PV-u', long: 'PersistentVolume (PVC db-pvc-data)' },
}

export interface LabEvent {
  id: string
  t: number
  text: string
  tone: Tone
}

export interface NodeFailure {
  node: string
  at: number
  /** the db-pvc Pod ran on the failed node */
  hadPvc: boolean
  /** db-pvc orders when the node failed */
  pvcBefore: number
  oos: boolean
}

export interface VolLab {
  cl: ClusterState
  track: Record<Variant, { store: string | null; count: number }>
  lost: Record<Variant, number>
  /** simulated time of the last „Ponovno pokreni kontejner” / „Obriši Pod” (null = not yet) */
  did: { restart: number | null; del: number | null }
  failure: NodeFailure | null
  goals: { restart: boolean; del: boolean; node: boolean }
  events: LabEvent[]
  seq: number
}

const ORDERS: [string, string, string] = ['narudžba', 'narudžbe', 'narudžbi']

export function ordersText(n: number): string {
  return hrCount(n, ORDERS)
}

function log(w: VolLab, text: string, tone: Tone): void {
  w.seq += 1
  w.events.push({ id: `l${w.seq}`, t: w.cl.t, text, tone })
  if (w.events.length > 20) w.events.splice(0, w.events.length - 20)
}

/** Pods of one variant (Deployment label app=<variant>), oldest first. */
export function variantPods(cl: ClusterState, v: Variant): Pod[] {
  return cl.pods.filter((p) => p.labels.app === v).sort((a, b) => a.createdAt - b.createdAt || a.seq - b.seq)
}

/** The variant's current Pod: the newest one not being deleted (may still be starting). */
export function currentPod(cl: ClusterState, v: Variant): Pod | undefined {
  const pods = variantPods(cl, v).filter((p) => !p.deletion)
  return pods[pods.length - 1]
}

/** Orders the variant can serve right now (its current Pod's data store), null while nothing has started. */
export function liveOrders(cl: ClusterState, v: Variant): number | null {
  const p = currentPod(cl, v)
  return p ? podOrders(cl, p) : null
}

export function isUp(p: Pod | undefined): boolean {
  return !!p && p.processUp && p.ready.status
}

export function createVolLab(): VolLab {
  const cl = presetStorage({ part: 'volumes', seed: VOL_SEED })
  const w: VolLab = {
    cl,
    track: { 'db-kontejner': { store: null, count: 0 }, 'db-emptydir': { store: null, count: 0 }, 'db-pvc': { store: null, count: 0 } },
    lost: { 'db-kontejner': 0, 'db-emptydir': 0, 'db-pvc': 0 },
    did: { restart: null, del: null },
    failure: null,
    goals: { restart: false, del: false, node: false },
    events: [],
    seq: 0,
  }
  track(w)
  return w
}

/**
 * Follow each variant's data store; a fresh store (new container layer or new emptyDir) means the old rows are gone.
 * The count freezes when the store's Pod is marked for deletion: what it still receives while it shuts down is not
 * part of the „lost at the moment of the delete” number on the incident card.
 */
function track(w: VolLab): void {
  const cl = w.cl
  for (const v of VARIANTS) {
    const p = variantPods(cl, v).filter((x) => !x.deletion && x.dataStoreId !== null).pop()
    const tr = w.track[v]
    if (!p || p.dataStoreId === null) {
      const owner = tr.store ? cl.pods.find((x) => x.dataStoreId === tr.store) : undefined
      if (tr.store && cl.dataStores[tr.store] && !owner?.deletion) tr.count = cl.dataStores[tr.store].orders
      continue
    }
    const id = p.dataStoreId
    if (tr.store !== null && tr.store !== id) {
      const n = tr.count
      w.lost[v] += n
      const samePod = tr.store.startsWith(`ctr:${p.id}:`)
      if (n > 0) log(w, `${v}: novi ${samePod ? 'kontejner' : 'Pod'} krenuo s praznom bazom – izgubljeno: ${ordersText(n)}`, 'bad')
    }
    tr.store = id
    tr.count = cl.dataStores[id]?.orders ?? 0
  }
}

function checkGoals(w: VolLab): void {
  const cl = w.cl
  const allUp = VARIANTS.every((v) => isUp(currentPod(cl, v)))
  if (!w.goals.restart && w.did.restart !== null && cl.t >= w.did.restart + 2 && allUp) {
    w.goals.restart = true
    log(w, `Kontejneri ponovno rade: db-kontejner je izgubio narudžbe, emptyDir i PV su ih sačuvali`, 'ok')
  }
  if (!w.goals.del && w.did.del !== null && cl.t >= w.did.del + 2 && allUp) {
    w.goals.del = true
    log(w, 'Novi Podovi rade: narudžbe je sačuvao samo db-pvc (PersistentVolume)', 'ok')
  }
  const f = w.failure
  if (!w.goals.node && f && f.hadPvc && f.oos) {
    const p = currentPod(cl, 'db-pvc')
    const orders = p ? podOrders(cl, p) : null
    if (p && isUp(p) && p.nodeName !== f.node && orders !== null && orders >= f.pvcBefore) {
      w.goals.node = true
      log(w, `db-pvc radi na ${p.nodeName} s istim diskom: ${ordersText(orders)} (prije pada ${f.pvcBefore})`, 'ok')
    }
  }
}

export function stepVolLab(w: VolLab, dt: number): void {
  stepCluster(w.cl, dt)
  track(w)
  checkGoals(w)
}

// ---------------------------------------------------------------- actions (call inside sim.mutate)

/** „Ponovno pokreni kontejner”: kill the process in all three Pods; the kubelet starts a fresh container. */
export function restartAll(w: VolLab): void {
  let n = 0
  for (const v of VARIANTS) {
    const p = currentPod(w.cl, v)
    if (p && killContainer(w.cl, p.name)) n += 1
  }
  if (n === 0) return
  w.did.restart = w.cl.t
  log(w, `Proces Postgresa ubijen ${n === 3 ? 'u sva tri Poda' : n === 1 ? 'u jednom Podu' : `u ${n} Poda`} – kubelet pokreće nove kontejnere`, 'warn')
}

/** „Obriši Pod”: kubectl delete pod for all three; each Deployment creates a new Pod. */
export function deleteAll(w: VolLab): void {
  let n = 0
  for (const v of VARIANTS) {
    const p = currentPod(w.cl, v)
    if (p && deletePod(w.cl, p.name).ok) n += 1
  }
  if (n === 0) return
  w.did.del = w.cl.t
  log(w, 'kubectl delete pod – sva tri Poda se gase, Deploymenti stvaraju nove', 'warn')
}

export function nodeIsOff(cl: ClusterState, name: string): boolean {
  return cl.nodes.find((n) => n.name === name)?.machine === 'off'
}

/** The API already sees the node as NotReady (the out-of-service taint only acts on such nodes). */
export function nodeNotReady(cl: ClusterState, name: string): boolean {
  const n = cl.nodes.find((x) => x.name === name)
  return !!n && n.condition.ready !== 'True'
}

export function nodeHasOos(cl: ClusterState, name: string): boolean {
  return !!cl.nodes.find((n) => n.name === name)?.taints.some((t) => t.key === OUT_OF_SERVICE)
}

/** Only one failed node at a time (so the replacements always have somewhere to go). */
export function otherNodeDown(cl: ClusterState, name: string): string | null {
  return cl.nodes.find((n) => n.name !== name && (n.machine === 'off' || n.taints.some((t) => t.key === OUT_OF_SERVICE)))?.name ?? null
}

/** „Čvor pao”: the machine loses power (non-graceful); the API finds out only from missing heartbeats. */
export function failNode(w: VolLab, node: string): void {
  if (nodeIsOff(w.cl, node) || otherNodeDown(w.cl, node)) return
  const pvc = currentPod(w.cl, 'db-pvc')
  const before = pvc ? (podOrders(w.cl, pvc) ?? 0) : 0
  if (!powerOffNode(w.cl, node)) return
  w.failure = { node, at: w.cl.t, hadPvc: pvc?.nodeName === node, pvcBefore: before, oos: false }
  log(w, `${node} je naglo ostao bez struje – NotReady za ${COMPRESSED.nodeMonitorGrace.label}`, 'bad')
}

/** „Označi čvor kao ugašen (out-of-service)”: only for a machine that is really off. */
export function markOutOfService(w: VolLab, node: string): string {
  const r = setOutOfService(w.cl, node, true)
  if (r.ok && w.failure && w.failure.node === node) w.failure.oos = true
  return r.message
}

/** „Upali čvor”: power back on and remove the out-of-service taint (as one would after the repair). */
export function repairNode(w: VolLab, node: string): void {
  powerOnNode(w.cl, node)
  const hadOos = nodeHasOos(w.cl, node)
  if (hadOos) setOutOfService(w.cl, node, false)
  if (w.failure?.node === node) w.failure = null
  log(w, hadOos ? `${node} ponovno radi – taint out-of-service uklonjen` : `${node} ponovno radi – stari Podovi se vraćaju`, 'info')
}

/** Seconds until the attach/detach controller force-detaches the disk from an unhealthy node (null = not waiting). */
export function forceDetachIn(cl: ClusterState, pvName: string): number | null {
  const pv = cl.pvs.find((v) => v.name === pvName)
  if (!pv || !pv.attachedNode) return null
  const node = cl.nodes.find((n) => n.name === pv.attachedNode)
  if (!node || node.condition.ready === 'True') return null
  const users = cl.pods.filter((p) => p.nodeName === pv.attachedNode && p.deletion && p.spec.volumes.some((v) => v.kind === 'pvc'))
  const pvc = cl.pvcs.find((c) => c.id === pv.claimId)
  const mine = users.filter((p) => pvc && p.spec.volumes.some((v) => v.kind === 'pvc' && v.claimName === pvc.name))
  const T = cl.cfg.timings
  if (mine.length) {
    const at = Math.min(...mine.map((p) => p.deletion!.at))
    return Math.max(0, at + T.forceDetachS - cl.t)
  }
  if (pv.detachRequestedAt !== null) return Math.max(0, pv.detachRequestedAt + T.forceDetachS - cl.t)
  return null
}
