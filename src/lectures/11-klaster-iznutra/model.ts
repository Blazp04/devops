/**
 * L11 „Klaster pod mikroskopom” – a thin lab wrapper around the E3 engine (src/engines/cluster).
 * The engine does all the Kubernetes work (presetControlPlane, timeline, actions, views); this file only
 *  - builds the incident scenario „prvi-apply” from engine actions (reproduces IncidentCard 11),
 *  - remembers the numbered hops (the engine prunes landed messages after 0,6 s),
 *  - ticks the lecture's goals from the cluster state.
 */
import {
  API_REFUSED,
  ETCD_TIMEOUT,
  KLOPA_API_VERSIONS,
  WRONG_TAG_IMAGE,
  act,
  addTrafficStream,
  advance,
  apiPod,
  createTimeline,
  fillNodes,
  forceDeletePod,
  isActive,
  kubectlRun,
  podStatus,
  presetControlPlane,
  processTick,
  requestedOnNode,
  seek,
  setReplicaSetImage,
  stepTimeline,
  applyBarePod,
  type Actor,
  type ClusterState,
  type ControlPlaneMessage,
  type Pod,
  type PodTemplate,
  type Timeline,
} from '../../engines/cluster'

export type Scenario = 'incident' | 'zdrav'

export const SEED = 42
/** IncidentCard 11: „reproducirajte u simulaciji: preset prvi-apply · seed 42” */
export const INCIDENT_PRESET = 'prvi-apply'
export const GOOD_IMAGE = KLOPA_API_VERSIONS['1.3.2'].image
export const BAD_IMAGE = WRONG_TAG_IMAGE
/** one abstract slot = 512 Mi of memory requests (presetControlPlane: 3 nodes × 6 slots; requests come in L17) */
export const SLOT_MI = 512
export const SLOTS_PER_NODE = 6
export const KUBELET_NODE = 'node-2'
export const POWER_NODE = 'node-3'
export const RPS = 10

/** Lana's bare worker Pod as presetControlPlane defines it (kept so „Ponovno primijeni” can re-create it). */
let workerTemplate: PodTemplate | null = null
export function workerTpl(): PodTemplate | null {
  return workerTemplate ? structuredClone(workerTemplate) : null
}

function rememberWorker(s: ClusterState): void {
  const w = s.pods.find((p) => p.name === 'klopa-worker')
  if (w && !workerTemplate) workerTemplate = structuredClone(w.spec) as PodTemplate
}

/** „Zdrav klaster”: presetControlPlane as is (3 klopa-api Pods via the ReplicaSet preview + bare klopa-worker) + 10 req/s. */
export function presetZdrav(seed = SEED): ClusterState {
  const s = presetControlPlane({ seed })
  rememberWorker(s)
  addTrafficStream(s, { id: 'web', serviceName: 'klopa-api', rps: RPS })
  return s
}

/**
 * Incident 11 „prvi-apply”: Lana applies klopa-api with the tag 1.3.20 (should be 1.3.2) – its Pod lands on a node
 * and the pull fails; Iva's test Pods then take every free slot, so Lana's klopa-worker finds no node (Pending).
 * Built only from engine actions; the scenario starts ≈ 5 s after Lana's first apply. The IncidentCard numbers
 * (0 od 2 Running, 0 od 3 čvorova s mjestom, 3 neuspjela povlačenja, 0 %) all hold from t ≈ 40 s; the card quotes t ≈ 60 s.
 */
export function presetPrviApply(seed = SEED): ClusterState {
  const s = presetControlPlane({ seed, replicas: 1 })
  rememberWorker(s)
  const old = s.pods.find((p) => p.name === 'klopa-worker')
  const tpl = old ? (structuredClone(old.spec) as PodTemplate) : workerTpl()
  if (old) {
    // the worker does not exist yet in this story: Lana applies it below
    forceDeletePod(s, old)
    s.events = s.events.filter((e) => e.objectId !== old.id)
  }
  // 1) kubectl apply klopa-api with the wrong tag: the ReplicaSet replaces its Pod with one that cannot be pulled
  setReplicaSetImage(s, 'klopa-api', BAD_IMAGE, { recreateOne: true })
  advance(s, 1.5)
  for (let i = 0; i < 400 && s.pods.some((p) => p.deletion); i++) processTick(s)
  // 2) Iva's test Pods take all free memory requests („Napuni čvorove”)
  fillNodes(s)
  // 3) kubectl apply klopa-worker: no node has room → Pending (FailedScheduling)
  if (tpl) applyBarePod(s, 'klopa-worker', tpl)
  // students start ordering only now: Lana's klopa-api has never served anyone (the warm Pod above is gone)
  addTrafficStream(s, { id: 'web', serviceName: 'klopa-api', rps: RPS })
  s.messages = []
  return s
}

export function createScenario(sc: Scenario): () => ClusterState {
  return sc === 'incident' ? () => presetPrviApply(SEED) : () => presetZdrav(SEED)
}

// ---------------------------------------------------------------- lab state

export type GoalKey = 'apiFixed' | 'workerFixed' | 'schedPending' | 'cmNotReplaced' | 'apiRefused' | 'etcdTimeout' | 'kubeletNotReady' | 'evicted'

export interface Hop {
  id: string
  step: number
  from: Actor
  to: Actor
  label: string
  t0: number
  /** the Pod this hop is about (steps 3–6), found from the engine's event in the same tick; null = unknown / not a Pod */
  pod: string | null
}

export interface Lab {
  scenario: Scenario
  tl: Timeline
  /** time of the scenario's first state (the timeline cannot go before it) */
  t0: number
  done: Record<GoalKey, boolean>
  /** problems seen (a goal counts only once its problem was there) */
  saw: { pullBackOff: boolean; workerPending: boolean }
  /** cluster time since which the RS has had fewer active Pods than desired while the controller-manager is off */
  cmDeficitSince: number | null
  hops: Hop[]
  hopIds: Set<string>
}

const NO_GOALS: Record<GoalKey, boolean> = { apiFixed: false, workerFixed: false, schedPending: false, cmNotReplaced: false, apiRefused: false, etcdTimeout: false, kubeletNotReady: false, evicted: false }

export function createLab(sc: Scenario): Lab {
  const tl = createTimeline(createScenario(sc))
  const lab: Lab = { scenario: sc, tl, t0: tl.state.t, done: { ...NO_GOALS }, saw: { pullBackOff: false, workerPending: false }, cmDeficitSince: null, hops: [], hopIds: new Set() }
  observeLab(lab)
  return lab
}

export function stepLab(lab: Lab, dt: number): void {
  stepTimeline(lab.tl, dt)
  observeLab(lab)
}

/** Seek on the timeline; the hop list and timers restart from the rebuilt state (goals stay ticked). */
export function seekLab(lab: Lab, t: number): void {
  seek(lab.tl, Math.max(lab.t0, t))
  lab.hops = []
  lab.hopIds = new Set()
  lab.cmDeficitSince = null
  observeLab(lab)
}

/** A kubectl write (or any recorded action): recorded on the timeline so seeking replays it. */
export function actLab(lab: Lab, label: string, fn: (s: ClusterState) => void): void {
  act(lab.tl, label, fn)
  observeLab(lab)
}

/** A kubectl read (get / describe): not recorded – it changes nothing but the terminal. */
export function readLab(lab: Lab, cmd: string): void {
  kubectlRun(lab.tl.state, cmd)
  observeLab(lab)
}

export const isApiPod = (p: Pod) => p.labels.app === 'klopa-api'
export const isPullError = (p: Pod) => {
  const st = podStatus(apiPod(p))
  return st === 'ImagePullBackOff' || st === 'ErrImagePull'
}

/** Free abstract slots on a node (scheduler view: memory requests incl. the DaemonSet block). */
export function freeSlots(s: ClusterState, nodeName: string): number {
  const n = s.nodes.find((x) => x.name === nodeName)
  if (!n || n.machine !== 'running') return 0
  return Math.floor((n.allocatable.memMi - requestedOnNode(s, n).memMi) / SLOT_MI)
}

export function lastKubectl(s: ClusterState) {
  return s.kubectlLog.at(-1) ?? null
}

const round1 = (v: number) => Math.round(v * 10) / 10
const HOP_EVENT: Record<number, string[]> = { 3: ['pod-created'], 4: ['scheduled'], 6: ['container-started', 'container-restarted'] }

/**
 * Which Pod a numbered message is about. The engine's message has no object (kitSuggestion: `object` on
 * ControlPlaneMessage), but every step-3/4/6 message is sent in the same tick as an engine event that carries the
 * Pod id, and a step-5 message in the tick the kubelet starts the Pod. Pods already given to an earlier hop of the
 * same step and tick are skipped, so several messages in one tick pair up in order.
 */
function hopPod(s: ClusterState, m: ControlPlaneMessage, prev: Hop[]): string | null {
  if (m.step < 3 || m.step > 6) return null
  const t = round1(m.t0)
  const taken = new Set(prev.filter((h) => h.step === m.step && round1(h.t0) === t && h.pod).map((h) => h.pod))
  if (m.step === 5) {
    const node = m.from.startsWith('kubelet:') ? m.from.slice(8) : null
    const p = s.pods.find((x) => x.nodeName === node && x.kubelet.startTime !== null && Math.abs(x.kubelet.startTime - m.t0) < 1e-6 && !taken.has(x.name))
    return p?.name ?? null
  }
  if (m.step === 3 && m.label !== 'stvori Pod') return null
  for (const e of s.events) {
    if (e.t !== t || !e.objectId || !HOP_EVENT[m.step].includes(e.kind)) continue
    const p = s.pods.find((x) => x.id === e.objectId)
    if (p && !taken.has(p.name)) return p.name
  }
  return null
}

function observeLab(lab: Lab): void {
  const s = lab.tl.state
  // numbered hops (the engine forgets landed ones after 0,6 s)
  for (const m of s.messages) {
    if (lab.hopIds.has(m.id)) continue
    lab.hopIds.add(m.id)
    lab.hops.push({ id: m.id, step: m.step, from: m.from, to: m.to, label: m.label, t0: m.t0, pod: hopPod(s, m, lab.hops) })
  }
  if (lab.hops.length > 60) {
    lab.hops = lab.hops.slice(-60)
    lab.hopIds = new Set(lab.hops.map((h) => h.id))
  }

  const d = lab.done
  const rs = s.replicaSets.find((r) => r.name === 'klopa-api')
  const apiPods = s.pods.filter(isApiPod)
  if (apiPods.some(isPullError)) lab.saw.pullBackOff = true
  const worker = s.pods.find((p) => p.name === 'klopa-worker')
  if (worker && worker.nodeName === null && !worker.deletion) lab.saw.workerPending = true

  if (!d.apiFixed && lab.saw.pullBackOff && rs && rs.template.image === GOOD_IMAGE && !apiPods.some(isPullError) && apiPods.some((p) => apiPod(p).ready.status && !p.deletion)) d.apiFixed = true
  if (!d.workerFixed && lab.saw.workerPending && worker && !worker.deletion && apiPod(worker).ready.status) d.workerFixed = true

  // 1) scheduler off: a new Pod waits although a node has room
  if (!d.schedPending && !s.components.scheduler) {
    const room = s.nodes.some((n) => n.condition.ready === 'True' && freeSlots(s, n.name) > 0)
    if (room && s.pods.some((p) => p.nodeName === null && !p.deletion && s.t - p.createdAt >= 3)) d.schedPending = true
  }
  // 2) controller-manager off: a missing ReplicaSet Pod is not replaced (for ≥ 3 s)
  const active = rs ? apiPods.filter((p) => isActive(p) && p.owner?.name === rs.name).length : 0
  if (rs && !s.components.controllerManager && active < rs.replicas) {
    if (lab.cmDeficitSince === null) lab.cmDeficitSince = s.t
    if (s.t - lab.cmDeficitSince >= 3) d.cmNotReplaced = true
  } else lab.cmDeficitSince = null
  // 3) / 4) kubectl refused / timed out
  const last = lastKubectl(s)
  if (last && !last.ok) {
    if (!s.components.apiServer && last.out[0] === API_REFUSED) d.apiRefused = true
    if (s.components.apiServer && !s.components.etcd && last.out[0] === ETCD_TIMEOUT) d.etcdTimeout = true
  }
  // 5) kubelet off: node NotReady while its containers keep running
  const kn = s.nodes.find((n) => n.name === KUBELET_NODE)
  if (kn && !kn.kubeletUp && kn.machine === 'running' && kn.condition.ready !== 'True' && s.pods.some((p) => p.nodeName === KUBELET_NODE && p.processUp)) d.kubeletNotReady = true
  // bonus) after the (compressed) 5 min the ReplicaSet's Pods live elsewhere, the old ones hang in Terminating
  if (rs && !d.evicted) {
    const lost = s.nodes.filter((n) => n.condition.ready !== 'True').map((n) => n.name)
    const hanging = s.pods.some((p) => p.deletion && p.nodeName !== null && lost.includes(p.nodeName))
    const elsewhere = apiPods.filter((p) => isActive(p) && p.owner?.name === rs.name && p.nodeName !== null && !lost.includes(p.nodeName)).length
    if (hanging && rs.replicas > 0 && elsewhere >= rs.replicas) d.evicted = true
  }
}
