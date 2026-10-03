/**
 * E3 Klaster – small shared helpers used by every controller.
 * No controller logic here (keeps the import graph acyclic).
 */
import type { Actor, ClusterEvent, ClusterState, ControlPlaneMessage, KubeEvent, Node, Pod, PodTemplate, QosClass, Tone } from './types.ts'
import { plural } from '../../kit/sim/math.ts'

export { plural }

/** kubectl output while the API server is down (the real client error). */
export const API_REFUSED = 'The connection to the server 10.0.0.1:6443 was refused - did you specify the right host or port?'
/** kubectl write while etcd is down. */
export const ETCD_TIMEOUT = 'Error from server: etcdserver: request timed out'

export const MAX_EVENTS = 50
export const MAX_KUBE_EVENTS = 100
export const MAX_MESSAGES = 60

/** Kubernetes' rand alphabet (no vowels, no confusable digits). */
export const SAFE_ALPHABET = 'bcdfghjklmnpqrstvwxz2456789'

export function nextSeq(s: ClusterState): number {
  s.seq += 1
  return s.seq
}

export function newId(s: ClusterState, prefix: string): string {
  return `${prefix}${nextSeq(s)}`
}

/** 5-character suffix like Kubernetes' utilrand.String(5). */
export function randSuffix(s: ClusterState, n = 5): string {
  let out = ''
  for (let i = 0; i < n; i++) out += SAFE_ALPHABET[Math.floor(s.rng.next() * SAFE_ALPHABET.length)]
  return out
}

/** FNV-1a 32-bit. */
export function fnv32a(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** pod-template-hash the way Kubernetes encodes it: SafeEncodeString(decimal fnv32a). */
export function templateHash(t: PodTemplate): string {
  const dec = String(fnv32a(templateKey(t)))
  let out = ''
  for (const ch of dec) out += SAFE_ALPHABET[ch.charCodeAt(0) % SAFE_ALPHABET.length]
  return out
}

/** Canonical identity of a Pod template (what makes a new ReplicaSet). change-cause is an annotation, not part of the template. */
export function templateKey(t: PodTemplate): string {
  const labels = Object.keys(t.labels)
    .sort()
    .map((k) => `${k}=${t.labels[k]}`)
    .join(',')
  return JSON.stringify([
    labels,
    t.image,
    t.app,
    t.resources,
    t.probes,
    t.terminationGracePeriodSeconds,
    t.preStopSleepS,
    t.volumes,
    t.dataVolume,
    t.priority,
    t.nodeSelector,
    t.tolerations,
    t.missingSecret,
    Object.keys(t.env ?? {})
      .sort()
      .map((k) => [k, t.env[k]]),
    Object.keys(t.annotations ?? {})
      .sort()
      .map((k) => `${k}=${t.annotations[k]}`),
  ])
}

export function cloneTemplate(t: PodTemplate): PodTemplate {
  return JSON.parse(JSON.stringify(t)) as PodTemplate
}

export function matches(selector: Record<string, string>, labels: Record<string, string>): boolean {
  const keys = Object.keys(selector)
  if (keys.length === 0) return false
  for (const k of keys) if (labels[k] !== selector[k]) return false
  return true
}

export function imageTag(image: string): string {
  const slash = image.lastIndexOf('/')
  const colon = image.lastIndexOf(':')
  return colon > slash ? image.slice(colon + 1) : 'latest'
}

export function shortImage(image: string): string {
  const slash = image.lastIndexOf('/')
  return slash >= 0 ? image.slice(slash + 1) : image
}

// ---------------------------------------------------------------- logs

export function logEvent(s: ClusterState, kind: string, text: string, tone: Tone = 'neutral', objectId?: string): void {
  s.eventSeq += 1
  const e: ClusterEvent = { id: `ev${s.eventSeq}`, t: round1(s.t), kind, text, tone }
  if (objectId) e.objectId = objectId
  s.events.push(e)
  if (s.events.length > MAX_EVENTS) s.events.splice(0, s.events.length - MAX_EVENTS)
}

/** Log at most once per `key` (until `resetWarn`). */
export function logOnce(s: ClusterState, key: string, kind: string, text: string, tone: Tone = 'warn', objectId?: string): void {
  if (s.warned[key] !== undefined) return
  s.warned[key] = s.t
  logEvent(s, kind, text, tone, objectId)
}

export function resetWarn(s: ClusterState, key: string): void {
  delete s.warned[key]
}

/**
 * kubectl get events: identical (object, reason, message) within the list aggregate into count.
 * Events are API objects: while the API server or etcd is down they cannot be written and are lost
 * (the real event recorder retries a few times, then drops them).
 */
export function kubeEvent(s: ClusterState, type: KubeEvent['type'], reason: string, object: string, message: string): void {
  if (!canWrite(s)) return
  const last = s.kubeEvents.findLast((e) => e.object === object && e.reason === reason && e.message === message)
  if (last) {
    last.count += 1
    last.t = round1(s.t)
    return
  }
  s.kubeEvents.push({ t: round1(s.t), firstT: round1(s.t), type, reason, object, message, count: 1 })
  if (s.kubeEvents.length > MAX_KUBE_EVENTS) s.kubeEvents.splice(0, s.kubeEvents.length - MAX_KUBE_EVENTS)
}

export function round1(v: number): number {
  return Math.round(v * 10) / 10
}

/**
 * Animated control-plane message (only when cfg.messages is on – L11). Returns its id (null when messages are off).
 * `o.after` chains it behind another message (starts when that one lands); `o.t0` sets the start explicitly.
 * A message INTO the API server is a write: watchers can see its effect only after it lands (`writeVisibleAt`).
 */
export function message(s: ClusterState, from: Actor, to: Actor, label: string, step = 0, duration = 0.3, o: { after?: string | null; t0?: number; object?: string } = {}): string | null {
  if (!s.cfg.messages) return null
  const parent = o.after ? s.messages.find((m) => m.id === o.after) : undefined
  const t0 = o.t0 ?? (parent ? parent.t0 + parent.duration : Math.max(s.t, from === 'apiserver' && to !== 'etcd' ? s.writeVisibleAt : s.t))
  const m: ControlPlaneMessage = { id: newId(s, 'm'), step, from, to, label, t0, duration, parentId: parent?.id ?? null }
  if (o.object !== undefined) m.object = o.object
  s.messages.push(m)
  if (s.messages.length > MAX_MESSAGES) s.messages.splice(0, s.messages.length - MAX_MESSAGES)
  if (to === 'apiserver') s.writeVisibleAt = Math.max(s.writeVisibleAt, t0 + duration)
  return m.id
}

// ---------------------------------------------------------------- watch delays (L11 pipeline)

/**
 * Level-triggered observation with a watch delay: returns true once `condition` has held for the
 * notification delay (drawn once per observation from cfg.timings.watchDelayS). With [0,0] it is immediate.
 */
export function observed(s: ClusterState, key: string, condition: boolean, from?: Actor, to?: Actor, label?: string, object?: string): boolean {
  if (!condition) {
    delete s.watch[key]
    return false
  }
  let w = s.watch[key]
  if (!w) {
    const [lo, hi] = s.cfg.timings.watchDelayS
    const delay = hi > 0 ? lo + (hi - lo) * s.rng.next() : 0
    // a watch event is sent only after the change is committed (with messages on: after the write has landed)
    const since = s.cfg.messages ? Math.max(s.t, s.writeVisibleAt) : s.t
    w = { since, delay }
    s.watch[key] = w
    if (delay > 0 && from && to) message(s, from, to, label ?? 'promjena', 0, delay, { t0: since, object })
  }
  return s.t + 1e-9 >= w.since + w.delay
}

export function clearObserved(s: ClusterState, key: string): void {
  delete s.watch[key]
}

// ---------------------------------------------------------------- component availability

export function canWrite(s: ClusterState): boolean {
  return s.components.apiServer && s.components.etcd
}

export function controllersUp(s: ClusterState): boolean {
  return s.components.controllerManager && canWrite(s)
}

// ---------------------------------------------------------------- pod helpers

export function isTerminal(p: Pod): boolean {
  return p.phase === 'Failed' || p.phase === 'Succeeded'
}

/** Active = counted by controllers: not being deleted and not finished (FilterActivePods). */
export function isActive(p: Pod): boolean {
  return p.deletion === null && !isTerminal(p)
}

export function isReady(p: Pod): boolean {
  return p.ready.status && p.deletion === null && !isTerminal(p)
}

export function isAvailable(p: Pod, t: number, minReadySeconds: number): boolean {
  return isReady(p) && t - p.ready.since + 1e-9 >= minReadySeconds
}

export function nodeByName(s: ClusterState, name: string | null): Node | undefined {
  if (!name) return undefined
  return s.nodes.find((n) => n.name === name)
}

export function podByName(s: ClusterState, name: string, namespace?: string): Pod | undefined {
  return s.pods.find((p) => p.name === name && (namespace === undefined || p.namespace === namespace))
}

export function podRef(p: Pod): string {
  return `pod/${p.name}`
}

/** Requests the scheduler reserves (unset requests default to the limit when only a limit is set – API defaulting). */
export function effectiveRequests(t: PodTemplate): { cpuM: number; memMi: number } {
  const r = t.resources
  return {
    cpuM: r.requests.cpuM ?? r.limits.cpuM ?? 0,
    memMi: r.requests.memMi ?? r.limits.memMi ?? 0,
  }
}

export function qosClass(t: PodTemplate): QosClass {
  const r = t.resources
  const req = effectiveRequests(t)
  const anySet = r.requests.cpuM !== undefined || r.requests.memMi !== undefined || r.limits.cpuM !== undefined || r.limits.memMi !== undefined
  if (!anySet) return 'BestEffort'
  if (r.limits.cpuM !== undefined && r.limits.memMi !== undefined && req.cpuM === r.limits.cpuM && req.memMi === r.limits.memMi) return 'Guaranteed'
  return 'Burstable'
}

/**
 * oom_score_adj by QoS, as pkg/kubelet/qos/policy.go computes it with int64 arithmetic:
 * Guaranteed −997, BestEffort 1000, Burstable 1000 − (1000·memReq) / capacity (integer division),
 * at least 1000 + (−997) = 3, and 1000 becomes 999 (Burstable always survives BestEffort).
 * 256Mi on a 4096Mi node: 1000 − ⌊62,5⌋ = 938.
 */
export function oomScoreAdj(t: PodTemplate, nodeMemMi: number): number {
  const q = qosClass(t)
  if (q === 'Guaranteed') return -997
  if (q === 'BestEffort') return 1000
  const memReq = effectiveRequests(t).memMi
  if (!(nodeMemMi > 0)) return 999
  const adj = 1000 - Math.floor((1000 * memReq) / nodeMemMi + 1e-9)
  if (adj < 3) return 3
  if (adj >= 1000) return 999
  return adj
}

/** Simulated time to draw at: the last tick plus the accumulated remainder (smooth animation between 0,1 s ticks). */
export function renderTime(s: ClusterState): number {
  return s.t + Math.max(0, Math.min(s.acc, s.cfg.timings.dt))
}

export function nodeHealthy(n: Node): boolean {
  return n.machine === 'running' && n.kubeletUp && n.condition.ready === 'True'
}

/** The kubelet on this node is alive and can act on its Pods. */
export function kubeletWorking(n: Node | undefined): boolean {
  return !!n && n.machine === 'running' && n.kubeletUp
}

/** Non-negative integer from user input; NaN/±Infinity → fallback. */
export function safeCount(v: number, fallback = 0): number {
  return Number.isFinite(v) ? Math.max(0, Math.round(v)) : fallback
}

export function pct(v: number): string {
  return `${Math.round(v * 100)} %`
}

/** Go time.Duration.String() for kubectl/kubelet messages: 300ms, 2s, 2.5s, 1m20s, 5m0s, 1h0m0s. */
export function goDuration(sec: number): string {
  if (!Number.isFinite(sec)) return '0s'
  if (sec === 0) return '0s'
  if (Math.abs(sec) < 1) return `${Math.round(sec * 1000)}ms`
  const trim = (v: number) => String(Math.round(v * 1000) / 1000)
  if (sec < 60) return `${trim(sec)}s`
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec - h * 3600) / 60)
  const rest = sec - h * 3600 - m * 60
  return h > 0 ? `${h}h${m}m${trim(rest)}s` : `${m}m${trim(rest)}s`
}

/** Croatian count with the right plural form (Intl.PluralRules('hr')): hrCount(3, PODS) → "3 Poda". */
export function hrCount(n: number, forms: [string, string, string]): string {
  return plural(Number.isFinite(n) ? n : 0, forms)
}

/** Declension of the Pod kind (styleGuide: Pod/Poda/Podova). */
export const PODS: [string, string, string] = ['Pod', 'Poda', 'Podova']
export const NODES_HR: [string, string, string] = ['čvor', 'čvora', 'čvorova']

/** Croatian number with decimal comma. */
export function hr(v: number, digits = 0): string {
  const f = v.toFixed(digits)
  return f.replace('.', ',')
}
