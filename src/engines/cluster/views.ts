/**
 * Read-only selectors for UIs: kubectl-style tables, Pod/node/Deployment views, animation progress.
 * Nothing here mutates the state.
 */
import type { ClusterState, ControlPlaneMessage, Deployment, InFlightRequest, Node, Pod, ProbeKind, ProbeResult, ProbeSpec, QosClass } from './types.ts'
import { apiPod, humanDuration, podReadyColumn, podRestartsColumn, podStatus } from './pods.ts'
import { nodeMemoryUsage } from './kubelet.ts'
import { requestedOnNode } from './scheduler.ts'
import { calcStatus, fenceposts, findDeployment, findNewReplicaSet, replicaSetsOf, rolloutHistory } from './rollout.ts'
import type { RevisionInfo } from './rollout.ts'
import { replicaSetStatus } from './replicaset.ts'
import { podOrders } from './storage.ts'
import { effectiveRequests, oomScoreAdj, qosClass, renderTime, shortImage } from './util.ts'
import { REAL, SIM_EPOCH_MS } from './config.ts'

export const KUBERNETES_VERSION = 'v1.37.1'

// ---------------------------------------------------------------- tables

/** Align columns like kubectl (3 spaces between columns). */
/** Objects created at or before this sim time come from the preset (warmStart keeps t at 0). */
const PRESET_EPOCH_S = 0

/** minWidths (optional): a column is at least this wide, so snapshots of one table line up (`kubectl get … -w`). */
export function formatTable(header: string[], rows: string[][], minWidths: number[] = []): string[] {
  const widths = header.map((h, i) => Math.max(h.length, minWidths[i] ?? 0, ...rows.map((r) => (r[i] ?? '').length)))
  const line = (cells: string[]) => cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i] + 3))).join('').trimEnd()
  return [line(header), ...rows.map(line)]
}

/**
 * The tables below format what the API holds (Pod status frozen while the API server or etcd is down – see
 * apiPod). They do not check whether kubectl could reach the API: for a console use kubectlRun / kubectlRead, which
 * answer with the real connection error while the API server (or etcd) is off.
 */
export function kubectlGetPods(s: ClusterState, o: { wide?: boolean; namespace?: string } = {}): string[] {
  const pods = s.pods
    .filter((p) => o.namespace === undefined || p.namespace === o.namespace)
    .map(apiPod)
    .sort((a, b) => (a.name < b.name ? -1 : 1))
  const header = ['NAME', 'READY', 'STATUS', 'RESTARTS', 'AGE', ...(o.wide ? ['IP', 'NODE'] : [])]
  const rows = pods.map((p) => [p.name, podReadyColumn(p), podStatus(p), podRestartsColumn(p, s.t), humanDuration(s.t - p.createdAt), ...(o.wide ? [p.ip ?? '<none>', p.nodeName ?? '<none>'] : [])])
  return pods.length ? formatTable(header, rows) : ['No resources found in klopa namespace.']
}

export function nodeStatusText(n: Node): string {
  if (n.machine === 'provisioning') return 'NotReady'
  const base = n.condition.ready === 'True' ? 'Ready' : 'NotReady'
  return n.unschedulable ? `${base},SchedulingDisabled` : base
}

export function kubectlGetNodes(s: ClusterState): string[] {
  const nodes = s.nodes.filter((n) => n.machine !== 'provisioning')
  return formatTable(
    ['NAME', 'STATUS', 'ROLES', 'AGE', 'VERSION'],
    nodes.map((n) => [n.name, nodeStatusText(n), '<none>', humanDuration(s.t - n.createdAt + 86400), KUBERNETES_VERSION]),
  )
}

export function kubectlGetDeployments(s: ClusterState): string[] {
  return formatTable(
    ['NAME', 'READY', 'UP-TO-DATE', 'AVAILABLE', 'AGE'],
    s.deployments.map((d) => [d.name, `${d.status.readyReplicas}/${d.replicas}`, String(d.status.updatedReplicas), String(d.status.availableReplicas), humanDuration(s.t - d.createdAt + 3600)]),
  )
}

export function kubectlGetReplicaSets(s: ClusterState): string[] {
  return formatTable(
    ['NAME', 'DESIRED', 'CURRENT', 'READY', 'AGE'],
    s.replicaSets.map((r) => {
      const st = replicaSetStatus(s, r)
      // ReplicaSets the preset created count as an hour old (a long-lived Deployment); ones created later are dated
      // from their creation, so a new ReplicaSet is never older than its Pods
      return [r.name, String(r.replicas), String(st.replicas), String(st.ready), humanDuration(s.t - r.createdAt + (r.createdAt <= PRESET_EPOCH_S ? 3600 : 0))]
    }),
  )
}

export function kubectlGetEndpointSlices(s: ClusterState): string[] {
  return formatTable(
    ['NAME', 'ADDRESSTYPE', 'PORTS', 'ENDPOINTS', 'AGE'],
    s.services.map((svc) => {
      const eps = s.slices[svc.id].endpoints
      const addrs = eps.map((e) => e.ip)
      const shown = addrs.length === 0 ? '<unset>' : addrs.length > 3 ? `${addrs.slice(0, 3).join(',')} + ${addrs.length - 3} more...` : addrs.join(',')
      return [`${svc.name}-${svc.id.replace(/\D/g, '').padStart(5, 'x').slice(-5)}`, 'IPv4', String(svc.targetPort), shown, humanDuration(s.t + 3600)]
    }),
  )
}

export function kubectlGetEvents(s: ClusterState, limit = 20): string[] {
  const ev = s.kubeEvents.slice(-limit)
  return formatTable(
    ['LAST SEEN', 'TYPE', 'REASON', 'OBJECT', 'MESSAGE'],
    ev.map((e) => [humanDuration(s.t - e.t), e.type, e.reason, e.object, e.count > 1 ? `${e.message} (x${e.count})` : e.message]),
  )
}

/**
 * `kubectl get hpa`. REPLICAS is status.currentReplicas – the count the last sync observed, before its rescale (the
 * new desired count shows one sync later); before the first sync it falls back to the Deployment's replicas.
 * TARGETS is always as wide as its `<unknown>` form, so rows printed at different moments (-w) line up.
 */
export function kubectlGetHpa(s: ClusterState): string[] {
  const targetsOf = (h: ClusterState['hpas'][number], cur: number | null) =>
    h.metric.type === 'cpu' ? `cpu: ${cur === null ? '<unknown>' : `${cur}%`}/${h.metric.targetUtilization}%` : `${cur ?? '<unknown>'}/${h.metric.targetAverageValue} (avg)`
  const minTargets = Math.max(0, ...s.hpas.map((h) => targetsOf(h, null).length))
  return formatTable(
    ['NAME', 'REFERENCE', 'TARGETS', 'MINPODS', 'MAXPODS', 'REPLICAS', 'AGE'],
    s.hpas.map((h) => {
      const replicas = h.status.currentReplicas > 0 ? h.status.currentReplicas : (findDeployment(s, h.targetDeployment)?.replicas ?? 0)
      return [h.name, `Deployment/${h.targetDeployment}`, targetsOf(h, h.status.currentMetric), String(h.minReplicas), String(h.maxReplicas), String(replicas), humanDuration(s.t + 3600)]
    }),
    [0, 0, minTargets],
  )
}

export function kubectlGetPvc(s: ClusterState): string[] {
  return formatTable(
    ['NAME', 'STATUS', 'VOLUME', 'CAPACITY', 'ACCESS MODES', 'STORAGECLASS', 'AGE'],
    s.pvcs.map((c) => {
      const pv = s.pvs.find((v) => v.id === c.volumeId)
      return [c.name, c.deletion ? 'Terminating' : c.phase, pv?.name ?? '', pv ? `${c.sizeGi}Gi` : '', c.accessMode, c.storageClass, humanDuration(s.t - c.createdAt + 60)]
    }),
  )
}

// ---------------------------------------------------------------- pod view

export interface ProbeLane {
  kind: ProbeKind
  spec: ProbeSpec | null
  history: ProbeResult[]
  failures: number
  successes: number
  /** seconds until the next probe (null when not probing) */
  nextInS: number | null
}

/** Same union as the kit's PodShape `status` (src/kit/diagram/k8s-helpers.ts PodStatus). */
export type PodShapeStatus = 'running' | 'pending' | 'creating' | 'terminating' | 'crash' | 'oom' | 'notready' | 'completed'

/** Status dot for the kit's PodShape (the STATUS text is podStatus() – see podShapeView). */
export function podShapeStatus(p: Pod): PodShapeStatus {
  if (p.deletion || p.reason === 'Evicted') return 'terminating'
  if (p.phase === 'Succeeded') return 'completed'
  const c = p.container
  const oom = c.reason === 'OOMKilled' || (c.reason === 'CrashLoopBackOff' && c.lastTermination?.reason === 'OOMKilled')
  if (c.state === 'terminated' || c.reason === 'CrashLoopBackOff') return oom ? 'oom' : 'crash'
  if (p.nodeName === null) return 'pending'
  if (c.state === 'waiting') return c.reason === 'ContainerCreating' ? 'creating' : 'crash'
  return p.ready.status ? 'running' : 'notready'
}

/** Default version colours (AUTHORING: v1 blue, v2 violet, broken build rose) for PodShape `tone` and traffic dots. */
export const VERSION_TONE: Record<string, 'blue' | 'violet' | 'teal' | 'amber' | 'rose' | 'green'> = {
  '1.3.2': 'blue',
  '1.4.0': 'violet',
  '1.4.1': 'violet',
  '1.5.0': 'rose',
  '2.0.0': 'amber',
  '2.0.1': 'teal',
  '18': 'green',
}

export type VersionColour = 'blue' | 'violet' | 'teal' | 'amber' | 'rose' | 'green'

/** Fixed colour per known version (fallback when a preset sets no versionRoles). */
export function versionTone(version: string | null | undefined): VersionColour {
  return (version && VERSION_TONE[version]) || 'blue'
}

/**
 * Course colour grammar from the preset's roles (cfg.versionRoles): the stable version blue, the next one violet,
 * a broken build rose, any other version teal. Without roles, the fixed table (versionTone).
 */
export function versionToneFor(s: ClusterState, version: string | null | undefined): VersionColour {
  const r = s.cfg.versionRoles
  if (!r || (r.stable === undefined && r.next === undefined && !(r.broken && r.broken.length))) return versionTone(version)
  if (!version) return 'blue'
  if (r.broken?.includes(version)) return 'rose'
  if (version === r.stable) return 'blue'
  if (version === r.next) return 'violet'
  return 'teal'
}

/**
 * PodShape props in one go: the status dot AND the real kubectl STATUS as the label. Pass `label` as PodShape's
 * caption – the kit's own label for 'crash' says CrashLoopBackOff even for ImagePullBackOff or
 * CreateContainerConfigError.
 */
export function podShapeView(p: Pod): { status: PodShapeStatus; label: string } {
  const a = apiPod(p)
  return { status: podShapeStatus(a), label: podStatus(a) }
}

/** NodeFrame status from a node (or nodeView): cordoned wins over Ready; NotReady / provisioning → notready. */
export function nodeFrameStatus(n: Node | NodeView): 'ready' | 'notready' | 'cordoned' {
  const status = 'condition' in n ? nodeStatusText(n) : n.status
  if (!status.startsWith('Ready')) return 'notready'
  return status.includes('SchedulingDisabled') ? 'cordoned' : 'ready'
}

export interface PodView {
  id: string
  name: string
  node: string | null
  ip: string | null
  /** pod.status.phase (as the API holds it) */
  phase: string
  /** kubectl STATUS column (as the API holds it) */
  status: string
  /** status dot for the kit's PodShape (as the API holds it) */
  shape: PodShapeStatus
  /** the API status is frozen (API server or etcd down): kubelets act, nobody can report */
  stale: boolean
  /** what really happens on the node (differs from status/shape only while `stale`) */
  live: { status: string; shape: PodShapeStatus; ready: boolean }
  /** version colour from the preset's roles (versionToneFor) */
  tone: VersionColour
  /** READY column 0/1 – 1/1 */
  readyColumn: string
  /** Ready condition */
  ready: boolean
  restarts: number
  restartsColumn: string
  age: string
  version: string
  image: string
  qos: QosClass
  owner: string | null
  terminating: boolean
  processUp: boolean
  /** CrashLoopBackOff / ImagePullBackOff: seconds until the next attempt, and the current back-off delay */
  backoff: { kind: 'crash' | 'image'; delayS: number; remainingS: number } | null
  lastTermination: { reason: string; exitCode: number } | null
  probes: ProbeLane[]
  cpu: { requestM: number; limitM: number | null; demandM: number; usedM: number; throttledPct: number; contentionPct: number }
  mem: { requestMi: number; limitMi: number | null; usedMi: number }
  oomScoreAdj: number | null
  orders: number | null
  labels: Record<string, string>
  pendingMessage: string | null
}

export function podView(s: ClusterState, live: Pod): PodView {
  const p = apiPod(live)
  const k = p.kubelet
  let backoff: PodView['backoff'] = null
  if (k.stage === 'backoff' && k.crashBackoff) backoff = { kind: 'crash', delayS: k.crashBackoff.delay, remainingS: Math.max(0, k.until - s.t) }
  else if (k.stage === 'pull-backoff' && k.imageBackoff) backoff = { kind: 'image', delayS: k.imageBackoff.delay, remainingS: Math.max(0, k.until - s.t) }
  const node = s.nodes.find((n) => n.name === p.nodeName)
  const req = effectiveRequests(p.spec)
  const lanes: ProbeLane[] = (['startup', 'liveness', 'readiness'] as ProbeKind[]).map((kind) => {
    const spec = p.spec.probes[kind]
    const st = k.probes[kind]
    return { kind, spec, history: st.history, failures: st.failures, successes: st.successes, nextInS: spec && p.processUp && Number.isFinite(st.nextAt) ? Math.max(0, st.nextAt - s.t) : null }
  })
  return {
    id: p.id,
    name: p.name,
    node: p.nodeName,
    ip: p.ip,
    phase: p.phase,
    status: podStatus(p),
    shape: podShapeStatus(p),
    stale: live.apiStatus !== null,
    live: { status: podStatus(live), shape: podShapeStatus(live), ready: live.ready.status },
    tone: versionToneFor(s, p.spec.app.version),
    readyColumn: podReadyColumn(p),
    ready: p.ready.status,
    restarts: p.container.restartCount,
    restartsColumn: podRestartsColumn(p, s.t),
    age: humanDuration(s.t - p.createdAt),
    version: p.spec.app.version,
    image: shortImage(p.spec.image),
    qos: qosClass(p.spec),
    owner: p.owner ? `${p.owner.kind}/${p.owner.name}` : null,
    terminating: p.deletion !== null,
    processUp: p.processUp,
    backoff,
    lastTermination: p.container.lastTermination ? { reason: p.container.lastTermination.reason, exitCode: p.container.lastTermination.exitCode } : null,
    probes: lanes,
    cpu: { requestM: req.cpuM, limitM: p.spec.resources.limits.cpuM ?? null, demandM: p.usage.cpuDemandM, usedM: p.usage.cpuM, throttledPct: p.usage.throttledPct, contentionPct: p.usage.contentionPct },
    mem: { requestMi: req.memMi, limitMi: p.spec.resources.limits.memMi ?? null, usedMi: p.processUp ? p.usage.memMi : 0 },
    oomScoreAdj: node ? oomScoreAdj(p.spec, node.capacity.memMi) : null,
    orders: podOrders(s, p),
    labels: { ...p.labels },
    pendingMessage: p.scheduled.status === false ? p.scheduled.message : null,
  }
}

// ---------------------------------------------------------------- node view (three-layer bars)

export interface NodeView {
  name: string
  status: string
  machine: Node['machine']
  kubeletUp: boolean
  provisioningRemainingS: number | null
  taints: string[]
  allocatable: { cpuM: number; memMi: number }
  /** scheduler view: DaemonSet block + Σ requests */
  requested: { cpuM: number; memMi: number; pods: number }
  /** actual usage */
  used: { cpuM: number; memMi: number }
  /** Σ limits (may exceed allocatable: overcommit) – pods without a limit are unbounded */
  limits: { cpuM: number; memMi: number; unboundedCpu: boolean; unboundedMem: boolean }
  memoryPressure: boolean
  memoryAvailableMi: number
  unneededForS: number | null
}

export function nodeView(s: ClusterState, n: Node): NodeView {
  const pods = s.pods.filter((p) => p.nodeName === n.name && p.phase !== 'Failed' && p.phase !== 'Succeeded')
  const r = requestedOnNode(s, n)
  let cpuUsed = n.daemonSet.cpuM
  let limCpu = n.daemonSet.cpuM
  let limMem = n.daemonSet.memMi
  let unboundedCpu = false
  let unboundedMem = false
  for (const p of pods) {
    if (p.processUp) cpuUsed += p.usage.cpuM
    const l = p.spec.resources.limits
    if (l.cpuM === undefined) unboundedCpu = true
    else limCpu += l.cpuM
    if (l.memMi === undefined) unboundedMem = true
    else limMem += l.memMi
  }
  const memUsed = n.machine === 'running' ? nodeMemoryUsage(s, n) : 0
  return {
    name: n.name,
    status: nodeStatusText(n),
    machine: n.machine,
    kubeletUp: n.kubeletUp,
    provisioningRemainingS: n.provisionReadyAt !== null ? Math.max(0, n.provisionReadyAt - s.t) : null,
    taints: n.taints.map((t) => `${t.key}${t.value ? `=${t.value}` : ''}:${t.effect}`),
    allocatable: { cpuM: n.allocatable.cpuM, memMi: n.allocatable.memMi },
    requested: { cpuM: r.cpuM, memMi: r.memMi, pods: r.pods },
    used: { cpuM: n.machine === 'running' ? cpuUsed : 0, memMi: memUsed },
    limits: { cpuM: limCpu, memMi: limMem, unboundedCpu, unboundedMem },
    memoryPressure: n.memoryPressure.status,
    memoryAvailableMi: n.allocatable.memMi + REAL.evictionMemoryAvailableMi - memUsed,
    unneededForS: n.ca.unneededSince !== null ? s.t - n.ca.unneededSince : null,
  }
}

// ---------------------------------------------------------------- deployment view (L13 dashboard)

export interface DeploymentView {
  name: string
  replicas: number
  strategy: Deployment['strategy']
  surge: number
  unavailable: number
  /** gauges: available ≥ N − unavailable, total ≤ N + surge */
  minAvailable: number
  maxTotal: number
  available: number
  totalPods: number
  terminatingPods: number
  status: Deployment['status']
  progressing: Deployment['conditions']['progressing']
  availableCondition: Deployment['conditions']['available']
  paused: boolean
  rollout: Deployment['rollout']
  replicaSets: { name: string; revision: number; version: string; image: string; desired: number; current: number; ready: number; available: number; terminating: number; isNew: boolean }[]
  history: RevisionInfo[]
}

export function deploymentView(s: ClusterState, name: string): DeploymentView | null {
  const d = findDeployment(s, name)
  if (!d) return null
  const f = fenceposts(d.strategy.maxSurge, d.strategy.maxUnavailable, d.replicas)
  const rss = replicaSetsOf(s, d)
  const newRS = findNewReplicaSet(s, d)
  const st = calcStatus(s, d, newRS, rss)
  const rolling = d.strategy.type === 'RollingUpdate'
  return {
    name: d.name,
    replicas: d.replicas,
    strategy: { ...d.strategy },
    surge: rolling ? f.surge : 0,
    unavailable: rolling ? f.unavailable : d.replicas,
    minAvailable: rolling ? d.replicas - f.unavailable : 0,
    maxTotal: d.replicas + (rolling ? f.surge : 0),
    available: st.availableReplicas,
    totalPods: st.replicas,
    terminatingPods: st.terminatingReplicas,
    status: st,
    progressing: { ...d.conditions.progressing },
    availableCondition: { ...d.conditions.available },
    paused: d.paused,
    rollout: d.rollout ? { ...d.rollout } : null,
    replicaSets: rss
      .map((r) => {
        const rs = replicaSetStatus(s, r, d.minReadySeconds)
        return { name: r.name, revision: r.revision, version: r.template.app.version, image: shortImage(r.template.image), desired: r.replicas, current: rs.replicas, ready: rs.ready, available: rs.available, terminating: rs.terminating, isNew: r === newRS }
      })
      .sort((a, b) => b.revision - a.revision),
    history: rolloutHistory(s, d),
  }
}

// ---------------------------------------------------------------- animation

/**
 * Progress 0..1 of a control-plane message at time `at` – by default renderTime(s) (last tick + the accumulator),
 * so a hop moves smoothly at constant speed between the 0,1 s ticks.
 */
export function messageProgress(s: ClusterState, m: ControlPlaneMessage, at: number = renderTime(s)): number {
  return m.duration <= 0 ? 1 : Math.min(1, Math.max(0, (at - m.t0) / m.duration))
}

/** Progress 0..1 of a request dot at `at` (default renderTime): linear, constant speed, reaches 1 at the Pod. */
export function requestProgress(s: ClusterState, r: InFlightRequest, at: number = renderTime(s)): number {
  return r.duration <= 0 ? 1 : Math.min(1, Math.max(0, (at - r.t0) / r.duration))
}

/** Messages in flight at `at` (default renderTime): started (t0 ≤ at) and not yet landed – draw exactly these. */
export function activeMessages(s: ClusterState, at: number = renderTime(s)): ControlPlaneMessage[] {
  return s.messages.filter((m) => m.t0 <= at + 1e-9 && at <= m.t0 + m.duration + 1e-9)
}

/**
 * The messages that follow one kubectl command (root = its step-1 message) until the next command, in causal order
 * (t0, then step): kubectl → API → etcd → ack → watch → controller → scheduler → kubelet → runtime → status.
 * For a Stepper / timeline of „Put jedne izjave”.
 */
export function messageChain(s: ClusterState, rootId: string): ControlPlaneMessage[] {
  const root = s.messages.find((m) => m.id === rootId)
  if (!root) return []
  const next = s.messages.find((m) => m.step === 1 && m.from === 'kubectl' && m.t0 > root.t0 + 1e-9)
  const end = next ? next.t0 : Infinity
  return s.messages.filter((m) => m.t0 + 1e-9 >= root.t0 && m.t0 < end - 1e-9).sort((a, b) => a.t0 - b.t0 || a.step - b.step)
}

/** kubectl logs NAME [--previous] [--timestamps]: the container's stdout lines (current or previous instance). */
export function kubectlLogs(s: ClusterState, name: string, o: { previous?: boolean; timestamps?: boolean; tail?: number } = {}): string[] {
  const p = s.pods.find((x) => x.name === name)
  if (!p) return [`Error from server (NotFound): pods "${name}" not found`]
  const container = p.labels.app ?? p.name
  const cur = p.container.instance
  if (o.previous && cur <= 1) return [`Error from server (BadRequest): previous terminated container "${container}" in pod "${name}" not found`]
  if (!o.previous && cur === 0) return [`Error from server (BadRequest): container "${container}" in pod "${name}" is waiting to start: ${p.container.reason || 'ContainerCreating'}`]
  const want = o.previous ? cur - 1 : cur
  let lines = p.logs.filter((l) => l.instance === want)
  if (o.tail !== undefined && Number.isFinite(o.tail) && o.tail >= 0) lines = lines.slice(-Math.floor(o.tail))
  return lines.map((l) => (o.timestamps ? `${new Date(SIM_EPOCH_MS + Math.round(l.t * 1000)).toISOString()} ${l.line}` : l.line))
}

/**
 * Lead time of one Pod (L18 „Podovi u sekundama, čvorovi u minutama”), seconds per stage; a stage that has not
 * happened yet is null. waitSchedulerS: creation → bound (or → Cluster Autoscaler scale-up, when one was needed);
 * waitNodeS: scale-up → bound (the new node provisioning); pullS: bound → image present; startS: → container start;
 * readyS: → Ready.
 */
export function podLeadTime(pod: Pod): { waitSchedulerS: number | null; waitNodeS: number | null; pullS: number | null; startS: number | null; readyS: number | null; totalS: number | null } {
  const t = pod.timeline
  const d = (a: number | null, b: number | null) => (a === null || b === null ? null : Math.round((b - a) * 1000) / 1000)
  const ca = t.scaleUpTriggeredAt
  return {
    waitSchedulerS: d(t.createdAt, ca ?? t.boundAt),
    waitNodeS: ca === null ? (t.boundAt === null ? null : 0) : d(ca, t.boundAt),
    pullS: d(t.boundAt, t.pulledAt),
    startS: d(t.pulledAt, t.startedAt),
    readyS: d(t.startedAt, t.readyAt),
    totalS: d(t.createdAt, t.readyAt),
  }
}

/** CrashLoopBackOff delays the kubelet uses: 1st restart immediately, then 10, 20, 40 … capped at 300 s. */
export function crashLoopDelays(restarts: number, initialS: number = REAL.crashBackoffInitialS, maxS: number = REAL.crashBackoffMaxS): number[] {
  const out: number[] = []
  let d = 0
  for (let i = 0; i < restarts; i++) {
    out.push(d)
    d = d === 0 ? initialS : Math.min(d * 2, maxS)
  }
  return out
}

/** The Pod that currently owns this IP (a hard-coded Pod IP breaks after the next rollout). */
export function podByIp(s: ClusterState, ip: string): Pod | undefined {
  return s.pods.find((p) => p.ip === ip && p.deletion === null)
}

/**
 * Cost so far for a node price chosen by the lecture (the engine has no built-in price list).
 * Provisioning machines are billed too.
 */
export function clusterCost(s: ClusterState, eurPerNodeHour: number): { nodeHours: number; eur: number; eurPerHourNow: number } {
  const nodeHours = s.usageTotals.nodeSeconds / 3600
  const billedNow = s.nodes.filter((n) => n.machine === 'running' || n.machine === 'provisioning').length
  return { nodeHours, eur: nodeHours * eurPerNodeHour, eurPerHourNow: billedNow * eurPerNodeHour }
}

/** Counts per kubectl STATUS for the "Dijagnosticirajte iz stupca STATUS" task. */
export function statusCounts(s: ClusterState): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of s.pods) {
    const st = podStatus(p)
    out[st] = (out[st] ?? 0) + 1
  }
  return out
}

// ---------------------------------------------------------------- services & describe

/** kubectl get svc */
export function kubectlGetServices(s: ClusterState): string[] {
  return formatTable(
    ['NAME', 'TYPE', 'CLUSTER-IP', 'EXTERNAL-IP', 'PORT(S)', 'AGE'],
    s.services.map((svc) => {
      const ext = svc.type === 'LoadBalancer' ? (svc.loadBalancerIP ?? '<pending>') : '<none>'
      const ports = svc.nodePort !== null ? `${svc.port}:${svc.nodePort}/TCP` : `${svc.port}/TCP`
      return [svc.name, svc.type, svc.headless ? 'None' : (svc.clusterIP ?? 'None'), ext, ports, humanDuration(s.t + 3600)]
    }),
  )
}

const EVENT_SOURCE: Record<string, string> = {
  Scheduled: 'default-scheduler',
  FailedScheduling: 'default-scheduler',
  SuccessfulCreate: 'replicaset-controller',
  SuccessfulDelete: 'replicaset-controller',
  TaintManagerEviction: 'taint-eviction-controller',
  FailedAttachVolume: 'attachdetach-controller',
  SuccessfulAttachVolume: 'attachdetach-controller',
  PodGC: 'pod-garbage-collector',
  TriggeredScaleUp: 'cluster-autoscaler',
  NotTriggerScaleUp: 'cluster-autoscaler',
}

function probeLine(p: ProbeSpec | null): string | null {
  if (!p) return null
  return `http-get http://:8000${p.path} delay=${p.initialDelaySeconds}s timeout=${p.timeoutSeconds}s period=${p.periodSeconds}s #success=${p.successThreshold} #failure=${p.failureThreshold}`
}

/** kubectl describe pod NAME (the parts the lectures use: state, last state, probes, conditions, events). */
export function kubectlDescribePod(s: ClusterState, name: string): string[] {
  const found = s.pods.find((x) => x.name === name)
  if (!found) return [`Error from server (NotFound): pods "${name}" not found`]
  const p = apiPod(found)
  const c = p.container
  const out: string[] = []
  // values start at column 18 for Pod fields and column 20 inside Containers (as kubectl describe prints them)
  const kv = (k: string, v: string, indent = 0) => out.push(`${' '.repeat(indent)}${`${k}:`.padEnd((indent ? 20 : 18) - indent)}${v}`)
  kv('Name', p.name)
  kv('Namespace', p.namespace)
  kv('Node', p.nodeName ?? '<none>')
  kv('Labels', Object.entries(p.labels).map(([k, v]) => `${k}=${v}`).join(',') || '<none>')
  kv('Status', p.deletion ? 'Terminating' : p.phase)
  if (p.reason) kv('Reason', p.reason)
  if (p.message) kv('Message', p.message)
  kv('IP', p.ip ?? '')
  if (p.owner) kv('Controlled By', `${p.owner.kind}/${p.owner.name}`)
  out.push('Containers:')
  out.push(`  ${p.labels.app ?? p.name}:`)
  kv('Image', p.spec.image, 4)
  if (c.state === 'running') {
    kv('State', 'Running', 4)
  } else if (c.state === 'waiting') {
    kv('State', 'Waiting', 4)
    if (c.reason) kv('Reason', c.reason, 6)
  } else {
    kv('State', 'Terminated', 4)
    kv('Reason', c.reason || 'Error', 6)
    kv('Exit Code', String(c.exitCode ?? 0), 6)
  }
  if (c.lastTermination && !(c.state === 'terminated')) {
    kv('Last State', 'Terminated', 4)
    kv('Reason', c.lastTermination.reason, 6)
    kv('Exit Code', String(c.lastTermination.exitCode), 6)
  }
  kv('Ready', c.ready && c.state === 'running' ? 'True' : 'False', 4)
  kv('Restart Count', String(c.restartCount), 4)
  const r = p.spec.resources
  if (r.limits.cpuM !== undefined || r.limits.memMi !== undefined) {
    out.push('    Limits:')
    if (r.limits.cpuM !== undefined) out.push(`      cpu:     ${r.limits.cpuM}m`)
    if (r.limits.memMi !== undefined) out.push(`      memory:  ${r.limits.memMi}Mi`)
  }
  if (r.requests.cpuM !== undefined || r.requests.memMi !== undefined) {
    out.push('    Requests:')
    if (r.requests.cpuM !== undefined) out.push(`      cpu:     ${r.requests.cpuM}m`)
    if (r.requests.memMi !== undefined) out.push(`      memory:  ${r.requests.memMi}Mi`)
  }
  const lv = probeLine(p.spec.probes.liveness)
  const rd = probeLine(p.spec.probes.readiness)
  const su = probeLine(p.spec.probes.startup)
  if (lv) kv('Liveness', lv, 4)
  if (rd) kv('Readiness', rd, 4)
  if (su) kv('Startup', su, 4)
  out.push('Conditions:')
  out.push('  Type              Status')
  out.push(`  PodScheduled      ${p.nodeName ? 'True' : 'False'}`)
  out.push(`  ContainersReady   ${c.ready && c.state === 'running' ? 'True' : 'False'}`)
  out.push(`  Ready             ${p.ready.status ? 'True' : 'False'}`)
  kv('QoS Class', qosClass(p.spec))
  const ev = s.kubeEvents.filter((e) => e.object === `pod/${p.name}`).slice(-15)
  if (ev.length === 0) {
    kv('Events', '<none>')
  } else {
    out.push('Events:')
    for (const line of formatTable(
      ['Type', 'Reason', 'Age', 'From', 'Message'],
      [['----', '------', '----', '----', '-------'], ...ev.map((e) => [e.type, e.reason, e.count > 1 ? `${humanDuration(s.t - e.t)} (x${e.count} over ${humanDuration(s.t - e.firstT)})` : humanDuration(s.t - e.t), EVENT_SOURCE[e.reason] ?? 'kubelet', e.message])],
    ))
      out.push(`  ${line}`)
  }
  return out
}
