/**
 * Pod objects: creation (with API defaulting), deletion, final removal and the kubectl columns.
 */
import type { ClusterState, OwnerRef, Pod, PodApiStatus, PodTemplate, ProbeState } from './types.ts'
import { canWrite, cloneTemplate, kubeEvent, logEvent, newId, nextSeq, nodeByName, podRef } from './util.ts'

/** Max container log lines kept per Pod (current + previous instance). */
export const MAX_LOG_LINES = 120

function probeState(): ProbeState {
  return { nextAt: Infinity, successes: 0, failures: 0, history: [] }
}

/** DefaultTolerationSeconds admission: every Pod tolerates not-ready/unreachable NoExecute for a while. */
function withDefaultTolerations(s: ClusterState, t: PodTemplate): PodTemplate {
  const tol = [...t.tolerations]
  for (const key of ['node.kubernetes.io/not-ready', 'node.kubernetes.io/unreachable']) {
    if (!tol.some((x) => x.key === key && (x.effect === 'NoExecute' || x.effect === undefined))) {
      tol.push({ key, operator: 'Exists', effect: 'NoExecute', tolerationSeconds: s.cfg.timings.podEvictionTolerationS })
    }
  }
  return { ...t, tolerations: tol }
}

export interface CreatePodOptions {
  name: string
  namespace: string
  owner: OwnerRef | null
  templateHash?: string | null
  ordinal?: number | null
  /** bind directly (spec.nodeName set) – skips the scheduler */
  nodeName?: string | null
  extraLabels?: Record<string, string>
  /** fixed Pod IP (presets: the L14 client 10.244.1.7); only with nodeName, ignored if another Pod holds it */
  ip?: string
}

export function createPodObject(s: ClusterState, template: PodTemplate, o: CreatePodOptions): Pod {
  const spec = withDefaultTolerations(s, cloneTemplate(template))
  const labels = { ...spec.labels, ...(o.extraLabels ?? {}) }
  if (o.templateHash) labels['pod-template-hash'] = o.templateHash
  const pod: Pod = {
    id: newId(s, 'pod'),
    name: o.name,
    namespace: o.namespace,
    labels,
    owner: o.owner,
    spec,
    nodeName: null,
    ip: null,
    createdAt: s.t,
    scheduleAfter: s.t + s.cfg.timings.scheduleDelayS,
    boundAt: null,
    phase: 'Pending',
    reason: '',
    message: '',
    scheduled: { status: null, reason: '', message: '', lastAttemptGen: -1 },
    ready: { status: false, since: s.t },
    container: {
      state: 'waiting',
      reason: 'ContainerCreating',
      message: '',
      exitCode: null,
      startedAt: null,
      finishedAt: null,
      restartCount: 0,
      lastRestartAt: null,
      lastTermination: null,
      instance: 0,
      ready: false,
      started: false,
    },
    kubelet: {
      stage: 'admit',
      until: 0,
      pullWillFail: false,
      crashAt: null,
      crashMessage: '',
      hangAt: null,
      killedBySigkill: false,
      imageBackoff: null,
      crashBackoff: null,
      probes: { startup: probeState(), liveness: probeState(), readiness: probeState() },
      stopReason: null,
      sigtermAt: 0,
      stoppedServingAt: null,
      startTime: null,
      imageReady: false,
    },
    deletion: null,
    processUp: false,
    processStartedAt: null,
    usage: {
      cpuDemandM: 0,
      cpuM: 0,
      throttledPct: 0,
      contentionPct: 0,
      memMi: 0,
      memGrowthMiPerS: null,
      cpuDemandOverrideM: null,
      memBaseOverrideMi: null,
      cpuCapacityM: 0,
    },
    cpuSamples: [],
    ordinal: o.ordinal ?? null,
    templateHash: o.templateHash ?? null,
    dataStoreId: null,
    readyOverride: null,
    stats: { served: 0, failed: 0 },
    seq: nextSeq(s),
    apiStatus: null,
    envResolved: {},
    envSecretVersions: {},
    logs: [],
    timeline: { createdAt: s.t, unschedulableAt: null, scaleUpTriggeredAt: null, boundAt: null, pulledAt: null, startedAt: null, readyAt: null },
    resize: null,
  }
  s.pods.push(pod)
  if (!canWrite(s)) pod.apiStatus = snapshotStatus(pod)
  if (o.nodeName) bindPod(s, pod, o.nodeName, false, o.ip)
  return pod
}

/**
 * Allocate the next free Pod IP from the node's Pod CIDR (10.244.<node>.2–254), like host-local IPAM: a
 * round-robin cursor that never hands out an address a Pod on this node still holds. null when the /24 is full.
 */
function allocateIp(s: ClusterState, nodeName: string): string | null {
  const n = nodeByName(s, nodeName)
  if (!n) return null
  const used = new Set<string>()
  for (const p of s.pods) if (p.nodeName === nodeName && p.ip) used.add(p.ip)
  for (let i = 0; i < 253; i++) {
    const ip = `10.244.${n.index}.${n.nextIp}`
    n.nextIp = n.nextIp >= 254 ? 2 : n.nextIp + 1
    if (!used.has(ip)) return ip
  }
  logEvent(s, 'ipam-full', `${nodeName}: nema slobodne IP adrese u rasponu Podova (10.244.${n.index}.0/24)`, 'bad')
  return null
}

export function bindPod(s: ClusterState, pod: Pod, nodeName: string, viaScheduler: boolean, fixedIp?: string): void {
  pod.nodeName = nodeName
  pod.boundAt = s.t
  pod.timeline.boundAt = s.t
  pod.ip = fixedIp && !s.pods.some((p) => p !== pod && p.ip === fixedIp) ? fixedIp : allocateIp(s, nodeName)
  pod.scheduled = { status: true, reason: '', message: '', lastAttemptGen: s.schedGen }
  if (viaScheduler) {
    kubeEvent(s, 'Normal', 'Scheduled', podRef(pod), `Successfully assigned ${pod.namespace}/${pod.name} to ${nodeName}`)
  }
}

/**
 * Start graceful deletion (sets deletionTimestamp). Unbound or finished Pods disappear at once;
 * running ones are stopped by their kubelet, which then confirms the deletion.
 */
export function deletePodObject(s: ClusterState, pod: Pod, reason: string, graceS?: number): void {
  if (pod.deletion) return
  const grace = graceS ?? pod.spec.terminationGracePeriodSeconds
  pod.deletion = { at: s.t, graceS: grace, reason }
  s.schedGen += 1
  const node = nodeByName(s, pod.nodeName)
  const neverStarted = pod.nodeName === null || (pod.container.instance === 0 && !pod.processUp)
  if (neverStarted && (pod.nodeName === null || (node && node.machine === 'running' && node.kubeletUp))) {
    removePod(s, pod)
    return
  }
  if (pod.phase === 'Failed' || pod.phase === 'Succeeded') {
    removePod(s, pod)
    return
  }
  logEvent(s, 'pod-terminating', `Pod ${pod.name} se gasi (Terminating)`, 'neutral', pod.id)
}

/** Remove the Pod object from the API (kubelet confirmed, force delete, or garbage collection). */
export function removePod(s: ClusterState, pod: Pod): void {
  const i = s.pods.indexOf(pod)
  if (i < 0) return
  s.pods.splice(i, 1)
  s.schedGen += 1
  delete s.podMetrics[pod.id]
  delete s.dataStores[`empty:${pod.id}`]
  for (const k of Object.keys(s.watch)) if (k.endsWith(`:${pod.id}`)) delete s.watch[k]
  logEvent(s, 'pod-deleted', `Pod ${pod.name} obrisan`, 'neutral', pod.id)
}

/** Force delete: object gone immediately (containers on an unreachable node may still run there). */
export function forceDeletePod(s: ClusterState, pod: Pod): void {
  if (!pod.deletion) pod.deletion = { at: s.t, graceS: 0, reason: 'force' }
  removePod(s, pod)
}

// ---------------------------------------------------------------- kubectl columns

/** kubectl get pods → STATUS (a reason, not the phase). */
export function podStatus(p: Pod): string {
  let reason: string = p.phase
  if (p.reason) reason = p.reason
  const c = p.container
  if (p.reason !== 'Evicted') {
    if (c.state === 'waiting' && c.reason) reason = c.reason
    else if (c.state === 'terminated' && c.reason) reason = c.reason
    else if (c.state === 'terminated') reason = `ExitCode:${c.exitCode ?? 0}`
    if (p.phase === 'Pending' && p.nodeName === null) reason = 'Pending'
  }
  if (p.deletion && p.phase !== 'Failed' && p.phase !== 'Succeeded') reason = 'Terminating'
  return reason
}

/** READY column "1/1" (single-container Pods). */
export function podReadyColumn(p: Pod): string {
  return `${p.container.ready && p.container.state === 'running' ? 1 : 0}/1`
}

/**
 * RESTARTS column, e.g. "3 (45s ago)". Like kubectl's printer, "ago" counts from the last termination's
 * finishedAt (lastState.terminated), not from the restart: an OOM kill 50 s ago with a 40 s back-off shows "50s ago".
 */
export function podRestartsColumn(p: Pod, now: number): string {
  const c = p.container
  const last = c.lastTermination?.finishedAt ?? null
  if (c.restartCount === 0 || last === null) return String(c.restartCount)
  return `${c.restartCount} (${humanDuration(now - last)} ago)`
}

// ---------------------------------------------------------------- API-visible status

/** Copy of the status fields the kubelet writes to the API. */
export function snapshotStatus(p: Pod): PodApiStatus {
  return { phase: p.phase, reason: p.reason, message: p.message, ready: { ...p.ready }, container: { ...p.container } }
}

/**
 * The Pod as the API sees it (what kubectl prints): the live object while the API can be written, otherwise the
 * status frozen when the API server or etcd went down (the kubelet keeps acting locally but cannot report).
 */
export function apiPod(p: Pod): Pod {
  const a = p.apiStatus
  if (!a) return p
  return { ...p, phase: a.phase, reason: a.reason, message: a.message, ready: a.ready, container: a.container }
}

/**
 * Freeze (API down) or thaw (API back: the kubelets report their current status) every Pod's reported status.
 * Called at the start of every tick and by setComponent, so the snapshot is the status at the moment of the outage.
 */
export function syncApiStatus(s: ClusterState): void {
  if (canWrite(s)) {
    for (const p of s.pods) if (p.apiStatus) p.apiStatus = null
  } else {
    for (const p of s.pods) if (!p.apiStatus) p.apiStatus = snapshotStatus(p)
  }
}

/** true when the Pod's API status is frozen (API server or etcd down): what kubectl shows is stale. */
export function apiStatusStale(p: Pod): boolean {
  return p.apiStatus !== null
}

/** Append a line to the container's stdout (`kubectl logs`). Times are ISO stamps of the simulated clock. */
export function appLog(s: ClusterState, p: Pod, line: string): void {
  p.logs.push({ t: s.t, instance: p.container.instance, line })
  if (p.logs.length > MAX_LOG_LINES) p.logs.splice(0, p.logs.length - MAX_LOG_LINES)
}

/** k8s.io/apimachinery duration.HumanDuration (kubectl AGE). */
export function humanDuration(sec: number): string {
  const seconds = Math.floor(sec)
  if (seconds < -1) return '<invalid>'
  if (seconds < 0) return '0s'
  if (seconds < 60 * 2) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 10) {
    const s = seconds % 60
    return s === 0 ? `${minutes}m` : `${minutes}m${s}s`
  }
  if (minutes < 60 * 3) return `${minutes}m`
  const hours = Math.floor(seconds / 3600)
  if (hours < 8) {
    const m = minutes % 60
    return m === 0 ? `${hours}h` : `${hours}h${m}m`
  }
  if (hours < 48) return `${hours}h`
  if (hours < 24 * 8) {
    const h = hours % 24
    return h === 0 ? `${Math.floor(hours / 24)}d` : `${Math.floor(hours / 24)}d${h}h`
  }
  return `${Math.floor(hours / 24)}d`
}
