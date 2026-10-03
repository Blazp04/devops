/**
 * kubelet: everything that happens on a node to a Pod already bound to it.
 *
 * - admission → volumes → image (pull / back-off) → create → running
 * - probes (startup gates liveness/readiness; liveness/startup failure kills; readiness flips Ready)
 * - container exit → restart with kubelet back-off: 1st restart immediate, then 10 s, 20 s, 40 s … 300 s,
 *   reset after the container ran 10 min (2 × max) – mirrors flowcontrol.Backoff + doBackOff
 * - stop sequence: preStop sleep → SIGTERM → drain/exit/ignore → SIGKILL at the grace period
 * - memory: growth, OOMKilled (exit 137) at the limit, kernel OOM killer, node-pressure eviction every housekeeping
 * - CPU: per-node water-fill (limits = CFS throttling, contention shared by requests); never kills
 */
import type { AppBehaviour, ClusterState, Node, Pod, ProbeKind, ProbeResult, ProbeSpec, ResourceSpec } from './types.ts'
import { appLog, removePod } from './pods.ts'
import { DB_PASSWORD_KEY, KLOPA_SECRET } from './config.ts'
import {
  canWrite,
  effectiveRequests,
  goDuration,
  hr,
  isTerminal,
  kubeEvent,
  kubeletWorking,
  logEvent,
  logOnce,
  message,
  nodeByName,
  observed,
  oomScoreAdj,
  podRef,
  qosClass,
  resetWarn,
  shortImage,
} from './util.ts'

const EPS = 1e-9
const CONTAINER = (p: Pod) => p.labels.app ?? p.name

// ---------------------------------------------------------------- app view

/** Is the process deadlocked right now? */
export function isHung(s: ClusterState, p: Pod): boolean {
  return p.processUp && p.kubelet.hangAt !== null && s.t + EPS >= p.kubelet.hangAt
}

export function runningFor(s: ClusterState, p: Pod): number {
  return p.processStartedAt === null ? 0 : s.t - p.processStartedAt
}

/** Answer of the app to an HTTP GET on `path` (probes). */
export function probeAnswer(s: ClusterState, p: Pod, path: ProbeSpec['path']): ProbeResult['detail'] {
  if (!p.processUp) return 'refused'
  if (isHung(s, p)) return 'timeout'
  const app = p.spec.app
  const run = runningFor(s, p) + EPS
  if (run < app.bootS) return 'refused'
  if (path === '/healthz') return 'ok'
  if (run < app.warmS || app.neverReady || p.readyOverride === false) return 'http503'
  if (path === '/ready-db' && (!s.db.up || dbAuthFails(s, p))) return 'http503'
  return 'ok'
}

/**
 * The container was created with a DB_PASSWORD the database no longer accepts (Secret rotated, env not re-read:
 * env from a Secret is resolved only when a container is created). Only apps that use the database care.
 */
export function dbAuthFails(s: ClusterState, p: Pod): boolean {
  if (!p.spec.app.dependsOnDb || s.db.password === null) return false
  const pw = p.envResolved[DB_PASSWORD_KEY]
  return pw !== undefined && pw !== s.db.password
}

/**
 * Can the process serve a real request (stopping Pods still serve until the process stops)?
 * A version that reads a column the shared database no longer (or not yet) has fails with HTTP 500.
 */
export function serveAnswer(s: ClusterState, p: Pod): 'ok' | 'refused' | 'timeout' | 'http503' | 'http500' {
  if (!p.processUp) return 'refused'
  if (isHung(s, p)) return 'timeout'
  const app = p.spec.app
  const run = runningFor(s, p) + EPS
  if (run < app.bootS) return 'refused'
  if (run < app.warmS || app.neverReady) return 'http503'
  if (app.dependsOnDb && !s.db.up) return 'http503'
  if (dbAuthFails(s, p)) return 'http500'
  if (app.readsColumn !== null && !s.db.columns.includes(app.readsColumn)) return 'http500'
  return 'ok'
}

// ---------------------------------------------------------------- main tick

export function kubeletTick(s: ClusterState): void {
  for (const pod of [...s.pods]) {
    if (!pod.nodeName) continue
    const node = nodeByName(s, pod.nodeName)
    if (!node) continue
    if (node.machine === 'running' && pod.processUp) {
      growMemory(s, pod)
      // the memory limit is a cgroup (kernel) limit: it applies whether or not the kubelet is running
      cgroupOom(s, pod)
    }
    if (!kubeletWorking(node)) continue
    processPod(s, pod, node)
    if (pod.resize?.status === 'Deferred' && s.pods.includes(pod)) retryResize(s, pod, node)
  }
  for (const node of s.nodes) {
    if (node.machine !== 'running') continue
    kernelOom(s, node)
    if (node.kubeletUp && isHousekeeping(s)) evictionManager(s, node)
  }
}

function isHousekeeping(s: ClusterState): boolean {
  const h = Math.round(s.cfg.timings.housekeepingS / s.cfg.timings.dt)
  return h > 0 && s.tick % h === 0
}

function processPod(s: ClusterState, pod: Pod, node: Node): void {
  const k = pod.kubelet
  if (pod.deletion) {
    handleDeletion(s, pod)
    return
  }
  if (isTerminal(pod)) return

  if (k.stage === 'admit') {
    if (!observed(s, `kubelet:${pod.id}`, true, 'apiserver', `kubelet:${node.name}`, 'Pod vezan za čvor', pod.name)) return
    k.startTime = s.t
    k.stage = 'volumes'
    message(s, `kubelet:${node.name}`, `runtime:${node.name}`, 'povuci sliku i pokreni', 5, undefined, { object: pod.name })
  }
  if (k.stage === 'volumes') {
    if (!volumesReady(s, pod, node)) return
    k.stage = 'config'
  }
  if (k.stage === 'config') {
    const err = configError(s, pod)
    if (err) {
      setWaiting(pod, 'CreateContainerConfigError', err.message)
      // the pod worker retries every sync; one event per ~10 s (aggregated as "(xN)")
      if (s.t + EPS >= k.until) {
        kubeEvent(s, 'Warning', 'Failed', podRef(pod), `Error: ${err.message}`)
        k.until = s.t + 10
      }
      logOnce(s, `cfg:${pod.id}`, 'config-error', `${pod.name}: ${err.kind === 'key' ? 'u Secretu nedostaje ključ' : 'nedostaje Secret'} – CreateContainerConfigError`, 'bad', pod.id)
      return
    }
    resetWarn(s, `cfg:${pod.id}`)
    beginImage(s, pod, node)
  }
  switch (k.stage) {
    case 'pulling':
      if (s.t + EPS >= k.until) finishPull(s, pod, node)
      break
    case 'pull-backoff':
      if (pod.container.reason === 'ErrImagePull' && s.t + EPS >= k.imageBackoff!.lastUpdate + s.cfg.timings.kubeletSyncS) {
        setWaiting(pod, 'ImagePullBackOff', `Back-off pulling image "${pod.spec.image}"`)
        kubeEvent(s, 'Normal', 'BackOff', podRef(pod), `Back-off pulling image "${pod.spec.image}"`)
        kubeEvent(s, 'Warning', 'Failed', podRef(pod), 'Error: ImagePullBackOff')
        logEvent(s, 'image-backoff', `${pod.name}: ImagePullBackOff – novi pokušaj za ${hr(k.imageBackoff!.delay)} s`, 'warn', pod.id)
      }
      if (s.t + EPS >= k.until) startPull(s, pod, node)
      break
    case 'creating':
      if (s.t + EPS >= k.until) startContainer(s, pod, node, false)
      break
    case 'running':
      runningTick(s, pod)
      break
    case 'exited':
      if (s.t + EPS >= k.until) decideRestart(s, pod, node)
      break
    case 'backoff':
      if (s.t + EPS >= k.until) restartContainer(s, pod, node)
      break
    case 'stopping':
      stoppingTick(s, pod)
      break
    default:
      break
  }
}

// ---------------------------------------------------------------- volumes

function volumesReady(s: ClusterState, pod: Pod, node: Node): boolean {
  for (const v of pod.spec.volumes) {
    if (v.kind !== 'pvc') continue
    const pvc = s.pvcs.find((c) => c.name === v.claimName && c.namespace === pod.namespace)
    if (!pvc) {
      setWaiting(pod, 'ContainerCreating', '')
      logOnce(s, `nopvc:${pod.id}`, 'volume', `${pod.name}: PVC ${v.claimName} ne postoji`, 'warn', pod.id)
      return false
    }
    if (pvc.phase !== 'Bound' || !pvc.volumeId) {
      setWaiting(pod, 'ContainerCreating', '')
      return false
    }
    const pv = s.pvs.find((x) => x.id === pvc.volumeId)
    const shared = pv?.accessMode === 'RWX' || pv?.accessMode === 'ROX'
    if (!pv || (!shared && pv.attachedNode !== node.name)) {
      setWaiting(pod, 'ContainerCreating', '')
      return false
    }
  }
  return true
}

// ---------------------------------------------------------------- config (env from Secrets)

/** makeEnvironmentVariables: a missing Secret or key blocks the container (CreateContainerConfigError). */
export function configError(s: ClusterState, pod: Pod): { kind: 'secret' | 'key'; message: string } | null {
  const ms = pod.spec.missingSecret
  if (ms === 'key') return { kind: 'key', message: `couldn't find key ${DB_PASSWORD_KEY} in Secret ${pod.namespace}/${KLOPA_SECRET}` }
  if (ms === true || ms === 'secret') return { kind: 'secret', message: `secret "${KLOPA_SECRET}" not found` }
  for (const v of Object.values(pod.spec.env ?? {})) {
    if (typeof v === 'string') continue
    const sec = s.secrets[`${pod.namespace}/${v.secretRef}`]
    if (!sec) return { kind: 'secret', message: `secret "${v.secretRef}" not found` }
    if (!(v.key in sec.data)) return { kind: 'key', message: `couldn't find key ${v.key} in Secret ${pod.namespace}/${v.secretRef}` }
  }
  return null
}

/** Resolve env at container creation (a restarted container re-reads the Secret; a running one never does). */
function resolveEnv(s: ClusterState, pod: Pod): void {
  const env: Record<string, string> = {}
  const versions: Record<string, number> = {}
  for (const [k, v] of Object.entries(pod.spec.env ?? {})) {
    if (typeof v === 'string') env[k] = v
    else {
      const sec = s.secrets[`${pod.namespace}/${v.secretRef}`]
      if (sec && v.key in sec.data) {
        env[k] = sec.data[v.key]
        versions[v.secretRef] = sec.version
      }
    }
  }
  pod.envResolved = env
  pod.envSecretVersions = versions
}

// ---------------------------------------------------------------- image

function imageExists(s: ClusterState, image: string): boolean {
  if (s.cfg.registry === null) return true
  return s.cfg.registry.includes(image)
}

function imageCached(s: ClusterState, node: Node, image: string): boolean {
  if (s.cfg.timings.imageCache === 'pod') return s.cfg.cachedImages.includes(image)
  return node.images[image] === true
}

function beginImage(s: ClusterState, pod: Pod, node: Node): void {
  const k = pod.kubelet
  setWaiting(pod, 'ContainerCreating', '')
  if (imageCached(s, node, pod.spec.image)) {
    kubeEvent(s, 'Normal', 'Pulled', podRef(pod), `Container image "${pod.spec.image}" already present on machine`)
    pod.timeline.pulledAt ??= s.t
    k.imageReady = true
    k.stage = 'creating'
    k.until = s.t + s.cfg.timings.containerCreateS
    return
  }
  startPull(s, pod, node)
}

function startPull(s: ClusterState, pod: Pod, node: Node): void {
  const k = pod.kubelet
  const T = s.cfg.timings
  k.pullWillFail = !imageExists(s, pod.spec.image)
  k.stage = 'pulling'
  k.until = s.t + (k.pullWillFail ? T.imagePullFailS : T.imagePullS)
  kubeEvent(s, 'Normal', 'Pulling', podRef(pod), `Pulling image "${pod.spec.image}"`)
  if (pod.container.reason !== 'ImagePullBackOff') setWaiting(pod, 'ContainerCreating', '')
  logEvent(s, 'pulling', `${node.name}: povlačenje slike ${shortImage(pod.spec.image)}`, 'info', pod.id)
}

function finishPull(s: ClusterState, pod: Pod, node: Node): void {
  const k = pod.kubelet
  const T = s.cfg.timings
  if (k.pullWillFail) {
    const img = pod.spec.image
    // flowcontrol.Backoff.Next: first failure → 10 s, then doubling, capped at max
    const prev = k.imageBackoff
    const delay = prev && s.t - prev.lastUpdate <= 2 * T.backoffMaxS ? Math.min(prev.delay * 2, T.backoffMaxS) : T.backoffInitialS
    k.imageBackoff = { delay, lastUpdate: s.t }
    k.stage = 'pull-backoff'
    k.until = s.t + delay
    setWaiting(pod, 'ErrImagePull', `failed to pull and unpack image "${img}": failed to resolve reference "${img}": ${img}: not found`)
    kubeEvent(s, 'Warning', 'Failed', podRef(pod), `Failed to pull image "${img}": rpc error: code = NotFound desc = failed to pull and unpack image "${img}": failed to resolve reference "${img}": ${img}: not found`)
    kubeEvent(s, 'Warning', 'Failed', podRef(pod), 'Error: ErrImagePull')
    logEvent(s, 'image-error', `${pod.name}: slika ${shortImage(img)} ne postoji (ErrImagePull)`, 'bad', pod.id)
    return
  }
  const took = T.imagePullS
  kubeEvent(s, 'Normal', 'Pulled', podRef(pod), `Successfully pulled image "${pod.spec.image}" in ${goDuration(took)} (${goDuration(took)} including waiting)`)
  node.images[pod.spec.image] = true
  pod.timeline.pulledAt ??= s.t
  k.imageReady = true
  k.imageBackoff = null
  k.stage = 'creating'
  k.until = s.t + T.containerCreateS
  if (s.t + EPS >= k.until) startContainer(s, pod, node, false)
}

// ---------------------------------------------------------------- container start / exit / restart

function setWaiting(pod: Pod, reason: string, msg: string): void {
  const c = pod.container
  if (c.state === 'running') return
  c.state = 'waiting'
  c.reason = reason
  c.message = msg
}

function resolveDataStore(s: ClusterState, pod: Pod): void {
  if (!pod.spec.app.database) {
    pod.dataStoreId = null
    return
  }
  const volName = pod.spec.dataVolume
  const vol = volName ? pod.spec.volumes.find((v) => v.name === volName) : undefined
  let id: string
  if (vol && vol.kind === 'pvc') {
    const pvc = s.pvcs.find((c) => c.name === vol.claimName && c.namespace === pod.namespace)
    id = pvc?.volumeId ? `pv:${pvc.volumeId}` : `ctr:${pod.id}:${pod.container.instance}`
    if (pvc?.volumeId && !s.dataStores[id]) {
      const pv = s.pvs.find((x) => x.id === pvc.volumeId)
      s.dataStores[id] = { id, kind: 'pv', orders: 0, label: `PV ${pv?.name ?? ''}` }
    }
  } else if (vol && vol.kind === 'emptyDir') {
    id = `empty:${pod.id}`
    if (!s.dataStores[id]) s.dataStores[id] = { id, kind: 'emptyDir', orders: 0, label: 'emptyDir' }
  } else {
    id = `ctr:${pod.id}:${pod.container.instance}`
    s.dataStores[id] = { id, kind: 'container', orders: 0, label: 'sloj kontejnera' }
  }
  // the previous container's writable layer is gone
  for (const key of Object.keys(s.dataStores)) {
    if (key.startsWith(`ctr:${pod.id}:`) && key !== id) delete s.dataStores[key]
  }
  pod.dataStoreId = id
}

function startContainer(s: ClusterState, pod: Pod, node: Node, restart: boolean): void {
  const c = pod.container
  const k = pod.kubelet
  const app = pod.spec.app
  c.instance += 1
  c.state = 'running'
  c.reason = ''
  c.message = ''
  c.exitCode = null
  c.startedAt = s.t
  c.finishedAt = null
  c.ready = false
  c.started = pod.spec.probes.startup === null
  pod.processUp = true
  pod.processStartedAt = s.t
  k.stage = 'running'
  k.stopReason = null
  k.stoppedServingAt = null
  k.killedBySigkill = false
  k.crashAt = app.crashAfterS !== null ? s.t + app.crashAfterS : null
  k.crashMessage = app.crashAfterS !== null ? `exit code ${app.exitCode}` : ''
  k.hangAt = app.hangAfterS !== null ? s.t + app.hangAfterS : null
  pod.usage.memMi = pod.usage.memBaseOverrideMi ?? app.memMi
  pod.cpuSamples = []
  if (pod.phase === 'Pending') pod.phase = 'Running'
  pod.timeline.startedAt ??= s.t
  resolveEnv(s, pod)
  resolveDataStore(s, pod)
  appLog(s, pod, `INFO  starting ${CONTAINER(pod)} ${app.version} (pid 1), listening on :8000`)
  // exclusive data directory (Postgres postmaster.pid lock): a second process on the same data fails to start
  if (app.database && pod.dataStoreId && pod.dataStoreId.startsWith('pv:')) {
    const holder = s.pods.find((o) => o !== pod && o.processUp && o.dataStoreId === pod.dataStoreId && o.nodeName === pod.nodeName)
    if (holder) {
      k.crashAt = s.t + 1
      k.crashMessage = 'FATAL: lock file "postmaster.pid" already exists'
      appLog(s, pod, 'FATAL:  lock file "postmaster.pid" already exists')
      appLog(s, pod, 'HINT:  Is another postmaster (PID 1) running in data directory "/var/lib/postgresql/18/docker"?')
      logEvent(s, 'db-lock', `${pod.name}: drugi Postgres na istom direktoriju podataka (${holder.name}) – ne može se pokrenuti`, 'bad', pod.id)
    }
  }
  // probe schedules are anchored at container start
  for (const kind of ['startup', 'liveness', 'readiness'] as ProbeKind[]) {
    const spec = pod.spec.probes[kind]
    const st = k.probes[kind]
    st.successes = 0
    st.failures = 0
    st.nextAt = spec ? s.t + spec.initialDelaySeconds + s.cfg.timings.probeOffsetS : Infinity
  }
  kubeEvent(s, 'Normal', 'Created', podRef(pod), `Created container: ${CONTAINER(pod)}`)
  kubeEvent(s, 'Normal', 'Started', podRef(pod), `Started container ${CONTAINER(pod)}`)
  logEvent(s, restart ? 'container-restarted' : 'container-started', restart ? `${pod.name}: kontejner ponovno pokrenut (restart ${c.restartCount})` : `${pod.name}: kontejner pokrenut na ${node.name}`, restart ? 'warn' : 'info', pod.id)
  message(s, `kubelet:${node.name}`, 'apiserver', 'status: Running', 6, undefined, { object: pod.name })
  // no readiness probe and no startup probe → Ready as soon as the container runs
  updateReadiness(s, pod)
}

/**
 * The process exited (crash, OOM, kill). `cause` of an OOMKilled exit: 'limit' = the container's own memory limit
 * (cgroup), 'node' = the node ran out of memory and the kernel's OOM killer chose this process.
 */
export function containerExited(s: ClusterState, pod: Pod, reason: string, exitCode: number, msg = '', cause: 'limit' | 'node' = 'limit'): void {
  const c = pod.container
  const k = pod.kubelet
  c.state = 'terminated'
  c.reason = reason
  c.message = msg
  c.exitCode = exitCode
  c.finishedAt = s.t
  c.ready = false
  c.lastTermination = { reason, exitCode, finishedAt: s.t }
  pod.processUp = false
  pod.processStartedAt = null
  k.stage = 'exited'
  k.until = s.t + s.cfg.timings.kubeletSyncS
  k.crashAt = null
  k.hangAt = null
  setPodReady(s, pod, false)
  if (reason === 'OOMKilled') {
    logEvent(s, 'oom', cause === 'node' ? `${pod.name}: OOMKilled (izlazni kod 137) – čvoru je ponestalo memorije, jezgra operacijskog sustava ubila je proces` : `${pod.name}: OOMKilled (izlazni kod 137) – prekoračen limit memorije`, 'bad', pod.id)
  } else if (k.stopReason === null) {
    logEvent(s, 'crash', `${pod.name}: proces je završio s izlaznim kodom ${exitCode}${msg ? ` (${msg})` : ''}`, 'bad', pod.id)
  }
}

function decideRestart(s: ClusterState, pod: Pod, node: Node): void {
  const k = pod.kubelet
  const c = pod.container
  const T = s.cfg.timings
  const finished = c.finishedAt ?? s.t
  const b = k.crashBackoff
  // IsInBackOffSince: entry exists, not expired (finishedAt − lastUpdate ≤ 2·max), and now − finishedAt < backoff
  if (b && finished - b.lastUpdate <= 2 * T.backoffMaxS && s.t - finished < b.delay - EPS) {
    k.stage = 'backoff'
    k.until = finished + b.delay
    c.state = 'waiting'
    c.reason = 'CrashLoopBackOff'
    c.message = `back-off ${goDuration(b.delay)} restarting failed container=${CONTAINER(pod)} pod=${pod.name}`
    kubeEvent(s, 'Warning', 'BackOff', podRef(pod), `Back-off restarting failed container ${CONTAINER(pod)} in pod ${pod.name}`)
    logEvent(s, 'crashloop', `${pod.name}: CrashLoopBackOff – sljedeći pokušaj za ${hr(k.until - s.t)} s`, 'warn', pod.id)
    return
  }
  restartContainer(s, pod, node)
}

function restartContainer(s: ClusterState, pod: Pod, node: Node): void {
  const k = pod.kubelet
  const T = s.cfg.timings
  const c = pod.container
  const finished = c.finishedAt ?? s.t
  const b = k.crashBackoff
  // Backoff.Next(key, finishedAt)
  if (!b || finished - b.lastUpdate > 2 * T.backoffMaxS) k.crashBackoff = { delay: T.backoffInitialS, lastUpdate: s.t }
  else k.crashBackoff = { delay: Math.min(b.delay * 2, T.backoffMaxS), lastUpdate: s.t }
  c.restartCount += 1
  c.lastRestartAt = s.t
  startContainer(s, pod, node, true)
}

// ---------------------------------------------------------------- running

function runningTick(s: ClusterState, pod: Pod): void {
  const k = pod.kubelet
  if (k.crashAt !== null && s.t + EPS >= k.crashAt) {
    if (!k.crashMessage.startsWith('FATAL')) appLog(s, pod, `FATAL unhandled error in ${CONTAINER(pod)} ${pod.spec.app.version}, exiting with code ${pod.spec.app.exitCode}`)
    containerExited(s, pod, 'Error', k.crashMessage.startsWith('FATAL') ? 1 : pod.spec.app.exitCode, k.crashMessage)
    return
  }
  if (k.hangAt !== null && Math.abs(s.t - k.hangAt) < EPS + s.cfg.timings.dt / 2) {
    logEvent(s, 'hang', `${pod.name}: proces je zaglavio (živ, ali ne odgovara)`, 'bad', pod.id)
  }
  appTick(s, pod)
  runProbes(s, pod)
}

/** What the app itself prints (kubectl logs): warm-up done, database errors every 5 s. */
function appTick(s: ClusterState, pod: Pod): void {
  if (isHung(s, pod)) return
  const app = pod.spec.app
  const run = runningFor(s, pod)
  const dt = s.cfg.timings.dt
  if (run + EPS >= app.warmS && run - dt + EPS < app.warmS) appLog(s, pod, app.neverReady ? 'WARN  warm-up failed: /ready keeps answering 503' : 'INFO  warm-up done, ready to serve')
  if (!app.dependsOnDb) return
  const every = Math.round(5 / dt)
  if (every <= 0 || s.tick % every !== 0) return
  if (!s.db.up) appLog(s, pod, 'ERROR connection to server at "db" (10.96.0.20), port 5432 failed: Connection refused')
  else if (dbAuthFails(s, pod)) appLog(s, pod, 'ERROR connection to server at "db" (10.96.0.20), port 5432 failed: FATAL:  password authentication failed for user "klopa"')
}

/** Memory cgroup limit exceeded → the kernel kills the container (exit 137), with or without a kubelet. */
function cgroupOom(s: ClusterState, pod: Pod): void {
  const lim = pod.spec.resources.limits.memMi
  if (lim === undefined || pod.usage.memMi <= lim) return
  kubeEvent(s, 'Warning', 'OOMKilling', `node/${pod.nodeName}`, `Memory cgroup out of memory: Killed process (${CONTAINER(pod)}) in container ${CONTAINER(pod)}`)
  containerExited(s, pod, 'OOMKilled', 137, '', 'limit')
}

function growMemory(s: ClusterState, pod: Pod): void {
  const g = pod.usage.memGrowthMiPerS ?? pod.spec.app.memGrowthMiPerS
  if (g) pod.usage.memMi += g * s.cfg.timings.dt
}

// ---------------------------------------------------------------- probes

function recordProbe(pod: Pod, kind: ProbeKind, r: ProbeResult): void {
  const h = pod.kubelet.probes[kind].history
  h.push(r)
  if (h.length > 16) h.shift()
}

function probeFailText(kind: ProbeKind, pod: Pod, spec: ProbeSpec, d: ProbeResult['detail']): string {
  const name = kind === 'startup' ? 'Startup' : kind === 'liveness' ? 'Liveness' : 'Readiness'
  const url = `http://${pod.ip ?? '10.244.0.0'}:8000${spec.path}`
  if (d === 'http503') return `${name} probe failed: HTTP probe failed with statuscode: 503`
  if (d === 'timeout') return `${name} probe failed: Get "${url}": context deadline exceeded (Client.Timeout exceeded while awaiting headers)`
  return `${name} probe failed: Get "${url}": dial tcp ${pod.ip ?? '10.244.0.0'}:8000: connect: connection refused`
}

/**
 * Probe workers. Each probe keeps its own period; the startup probe gates liveness and readiness.
 * While a container is being stopped after a liveness/startup failure only the readiness worker keeps
 * running (as in the kubelet), so a hung process also leaves the Service when readiness fails.
 */
function runProbes(s: ClusterState, pod: Pod, readinessOnly = false): void {
  const k = pod.kubelet
  const c = pod.container
  const probes = pod.spec.probes
  let killed = readinessOnly
  for (const kind of ['startup', 'liveness', 'readiness'] as ProbeKind[]) {
    const spec = probes[kind]
    if (!spec) continue
    if (killed && kind !== 'readiness') continue
    const st = k.probes[kind]
    if (s.t + EPS < st.nextAt) continue
    st.nextAt += spec.periodSeconds
    if (kind === 'startup' && c.started) continue
    if (kind !== 'startup' && !c.started) continue // startup probe gates the others
    const d = probeAnswer(s, pod, spec.path)
    const ok = d === 'ok'
    recordProbe(pod, kind, { t: s.t, ok, detail: d })
    if (ok) {
      st.successes += 1
      st.failures = 0
    } else {
      st.failures += 1
      st.successes = 0
      kubeEvent(s, 'Warning', 'Unhealthy', podRef(pod), probeFailText(kind, pod, spec, d))
    }
    if (kind === 'startup') {
      if (ok && st.successes >= 1) {
        c.started = true
        // liveness/readiness continue on their own cadence
      } else if (!ok && st.failures >= spec.failureThreshold) {
        kubeEvent(s, 'Normal', 'Killing', podRef(pod), `Container ${CONTAINER(pod)} failed startup probe, will be restarted`)
        logEvent(s, 'startup-kill', `${pod.name}: provjera pokretanja pala ${spec.failureThreshold}× – kubelet ponovno pokreće kontejner`, 'bad', pod.id)
        beginStop(s, pod, 'startup', pod.spec.terminationGracePeriodSeconds)
        return
      }
    } else if (kind === 'liveness') {
      if (!ok && st.failures >= spec.failureThreshold) {
        kubeEvent(s, 'Normal', 'Killing', podRef(pod), `Container ${CONTAINER(pod)} failed liveness probe, will be restarted`)
        logEvent(s, 'liveness-kill', `${pod.name}: provjera živosti pala ${spec.failureThreshold}× – kubelet ponovno pokreće kontejner`, 'bad', pod.id)
        beginStop(s, pod, 'liveness', pod.spec.terminationGracePeriodSeconds)
        killed = true
      }
    } else {
      if (ok && st.successes >= spec.successThreshold) c.ready = true
      if (!ok && st.failures >= spec.failureThreshold) c.ready = false
    }
  }
  updateReadiness(s, pod)
}

/** Container readiness → Pod Ready condition. Without a readiness probe a started container is Ready. */
function updateReadiness(s: ClusterState, pod: Pod): void {
  const c = pod.container
  if (c.state === 'running' && pod.spec.probes.readiness === null) c.ready = c.started
  if (c.state !== 'running') c.ready = false
  setPodReady(s, pod, c.ready)
}

export function setPodReady(s: ClusterState, pod: Pod, ready: boolean): void {
  if (pod.ready.status === ready) return
  pod.ready = { status: ready, since: s.t }
  if (ready) pod.timeline.readyAt ??= s.t
  if (ready) logEvent(s, 'pod-ready', `Pod ${pod.name} je spreman (Ready)`, 'ok', pod.id)
  else if (!pod.deletion && pod.container.state === 'running') logEvent(s, 'pod-not-ready', `Pod ${pod.name} više nije spreman – bez prometa, bez restarta`, 'warn', pod.id)
}

// ---------------------------------------------------------------- stopping

/** Begin the stop sequence: preStop → SIGTERM → (drain | exit | ignore) → SIGKILL at the grace period. */
export function beginStop(s: ClusterState, pod: Pod, reason: 'delete' | 'liveness' | 'startup' | 'image-change', graceS: number): void {
  const k = pod.kubelet
  const app: AppBehaviour = pod.spec.app
  k.stage = 'stopping'
  k.stopReason = reason
  if (!pod.processUp) {
    k.until = s.t
    k.killedBySigkill = false
    return
  }
  const pre = Math.min(pod.spec.preStopSleepS, graceS)
  k.sigtermAt = s.t + pre
  let stopAt: number
  if (isHung(s, pod) || app.sigterm === 'ignore') stopAt = s.t + graceS
  else if (app.sigterm === 'exit') stopAt = k.sigtermAt
  else stopAt = k.sigtermAt + app.drainS
  k.killedBySigkill = stopAt >= s.t + graceS - EPS && !(app.sigterm === 'exit' && pre < graceS)
  k.until = Math.min(stopAt, s.t + graceS)
  if (!isHung(s, pod) && app.sigterm !== 'ignore') appLog(s, pod, app.sigterm === 'drain' ? `INFO  SIGTERM received, draining for ${hr(app.drainS, 1)} s` : 'INFO  SIGTERM received, exiting')
  kubeEvent(s, 'Normal', 'Killing', podRef(pod), `Stopping container ${CONTAINER(pod)}`)
}

function stoppingTick(s: ClusterState, pod: Pod): void {
  const k = pod.kubelet
  if (s.t + EPS < k.until) {
    // the readiness worker keeps probing until the container is gone
    if (pod.processUp && pod.container.state === 'running') runProbes(s, pod, true)
    return
  }
  if (pod.processUp) {
    const code = k.killedBySigkill ? 137 : 143
    const reason = k.stopReason
    const c = pod.container
    c.state = 'terminated'
    c.reason = 'Error'
    c.exitCode = code
    c.finishedAt = s.t
    c.ready = false
    c.lastTermination = { reason: 'Error', exitCode: code, finishedAt: s.t }
    pod.processUp = false
    pod.processStartedAt = null
    k.stoppedServingAt = s.t
    setPodReady(s, pod, false)
    if (!pod.deletion && (reason === 'liveness' || reason === 'startup' || reason === 'image-change')) {
      k.stage = 'exited'
      k.until = s.t
      const node = nodeByName(s, pod.nodeName)
      if (node) {
        if (reason === 'image-change') {
          // a new instance of the same container: the kubelet counts it as a restart (RestartCount + 1)
          c.restartCount += 1
          c.lastRestartAt = s.t
          k.stage = 'config'
          beginImage(s, pod, node)
        } else decideRestart(s, pod, node)
      }
      return
    }
  }
  k.stage = 'stopped'
}

function handleDeletion(s: ClusterState, pod: Pod): void {
  const k = pod.kubelet
  if (k.stage !== 'stopping' && k.stage !== 'stopped') {
    if (pod.processUp) beginStop(s, pod, 'delete', pod.deletion!.graceS)
    else k.stage = 'stopped'
  }
  if (k.stage === 'stopping') stoppingTick(s, pod)
  if (k.stage === 'stopped' || (k.stage === 'stopping' && !pod.processUp)) {
    // kubelet confirms the deletion through the API server
    if (!canWrite(s)) {
      logOnce(s, `confirm:${pod.id}`, 'api-down', `kubelet ne može potvrditi brisanje ${pod.name} – API poslužitelj nedostupan`, 'warn', pod.id)
      return
    }
    resetWarn(s, `confirm:${pod.id}`)
    removePod(s, pod)
  }
}

// ---------------------------------------------------------------- memory pressure

export function nodeMemoryUsage(s: ClusterState, node: Node): number {
  let sum = node.daemonSet.memMi + node.extraSystemMemMi
  for (const p of s.pods) if (p.nodeName === node.name && p.processUp) sum += p.usage.memMi
  return sum
}

/** memory.available as the kubelet sees it, assuming system daemons use exactly their reservation. */
export function memoryAvailable(s: ClusterState, node: Node): number {
  return node.allocatable.memMi + 100 - nodeMemoryUsage(s, node)
}

/** Kernel OOM killer: acts the moment memory runs out, before the kubelet notices. */
function kernelOom(s: ClusterState, node: Node): void {
  if (memoryAvailable(s, node) >= 0) return
  let victim: Pod | null = null
  let best = -Infinity
  for (const p of s.pods) {
    if (p.nodeName !== node.name || !p.processUp) continue
    const score = (p.usage.memMi / node.capacity.memMi) * 1000 + oomScoreAdj(p.spec, node.capacity.memMi)
    if (score > best) {
      best = score
      victim = p
    }
  }
  if (!victim) return
  kubeEvent(s, 'Warning', 'SystemOOM', `node/${node.name}`, `System OOM encountered, victim process: ${CONTAINER(victim)}`)
  logEvent(s, 'kernel-oom', `${node.name}: čvoru je ponestalo memorije – jezgra operacijskog sustava ubija ${victim.name} (najveći oom_score)`, 'bad', victim.id)
  containerExited(s, victim, 'OOMKilled', 137, '', 'node')
}

/** kubelet eviction manager (every housekeeping interval): evict at most one Pod while memory.available < 100Mi. */
function evictionManager(s: ClusterState, node: Node): void {
  const avail = memoryAvailable(s, node)
  const T = s.cfg.timings
  if (avail >= 100) {
    if (node.memoryPressure.status && s.t - node.memoryPressure.since >= T.pressureTransitionS) {
      node.memoryPressure = { status: false, since: s.t }
      node.taints = node.taints.filter((x) => x.key !== 'node.kubernetes.io/memory-pressure')
      s.schedGen += 1
      logEvent(s, 'pressure-off', `${node.name}: pritisak memorije prestao`, 'ok')
    }
    return
  }
  if (!node.memoryPressure.status) {
    node.memoryPressure = { status: true, since: s.t }
    if (!node.taints.some((x) => x.key === 'node.kubernetes.io/memory-pressure')) {
      node.taints.push({ key: 'node.kubernetes.io/memory-pressure', effect: 'NoSchedule', addedAt: s.t })
    }
    s.schedGen += 1
    kubeEvent(s, 'Normal', 'NodeHasInsufficientMemory', `node/${node.name}`, `Node ${node.name} status is now: NodeHasInsufficientMemory`)
  } else node.memoryPressure.since = s.t
  // ranking: usage > request first, then lower priority, then larger (usage − request)
  const cands = s.pods.filter((p) => p.nodeName === node.name && p.processUp && !p.deletion && !isTerminal(p))
  if (cands.length === 0) return
  cands.sort((a, b) => {
    const ea = a.usage.memMi > effectiveRequests(a.spec).memMi ? 1 : 0
    const eb = b.usage.memMi > effectiveRequests(b.spec).memMi ? 1 : 0
    if (ea !== eb) return eb - ea
    if (a.spec.priority !== b.spec.priority) return a.spec.priority - b.spec.priority
    return b.usage.memMi - effectiveRequests(b.spec).memMi - (a.usage.memMi - effectiveRequests(a.spec).memMi)
  })
  const victim = cands[0]
  const req = effectiveRequests(victim.spec).memMi
  // upstream (eviction helpers evictionMessage) names the container only when it uses more than its request, and
  // prints a zero request as resource.Quantity „0”
  const used = Math.round(victim.usage.memMi)
  const over = victim.usage.memMi > req ? ` Container ${CONTAINER(victim)} was using ${used}Mi, request is ${req > 0 ? `${req}Mi` : '0'}, has larger consumption of memory.` : ''
  const msg = `The node was low on resource: memory. Threshold quantity: 100Mi, available: ${Math.max(0, Math.round(avail))}Mi.${over}`
  kubeEvent(s, 'Warning', 'Evicted', podRef(victim), msg)
  logEvent(s, 'evicted', `${victim.name} izbačen s ${node.name} (memory.available < 100Mi)`, 'bad', victim.id)
  evictPodNow(s, victim, msg)
}

/** Hard eviction: grace 0, Pod becomes Failed/Evicted; its controller creates a replacement. */
export function evictPodNow(s: ClusterState, pod: Pod, msg: string): void {
  pod.phase = 'Failed'
  pod.reason = 'Evicted'
  pod.message = msg
  pod.processUp = false
  pod.processStartedAt = null
  const c = pod.container
  c.state = 'terminated'
  c.reason = ''
  c.exitCode = 137
  c.finishedAt = s.t
  c.ready = false
  pod.kubelet.stage = 'stopped'
  setPodReady(s, pod, false)
  s.schedGen += 1
}

// ---------------------------------------------------------------- warm start

/**
 * Can a warm start honestly show this Pod as "up for a long time"? Not when the image does not exist, the
 * config (Secret) is broken or the app crashes by itself – such Pods go through the real start path instead.
 */
export function warmable(s: ClusterState, pod: Pod): boolean {
  return imageExists(s, pod.spec.image) && configError(s, pod) === null && pod.spec.app.crashAfterS === null
}

/**
 * Put a bound Pod straight into Running as if it had been up for a long time (preset initial state).
 * Ready unless the app never becomes ready behind a readiness probe. Returns false (and does nothing) when the
 * Pod is not `warmable`.
 */
export function warmRunPod(s: ClusterState, pod: Pod, ageS = 1000): boolean {
  const node = nodeByName(s, pod.nodeName)
  if (!node || !warmable(s, pod)) return false
  node.images[pod.spec.image] = true
  const k = pod.kubelet
  const c = pod.container
  const since = s.t - ageS
  pod.createdAt = Math.min(pod.createdAt, since)
  pod.boundAt = since
  k.startTime = since
  k.imageReady = true
  c.instance += 1
  c.state = 'running'
  c.reason = ''
  c.startedAt = since
  c.started = true
  const ready = !(pod.spec.app.neverReady && pod.spec.probes.readiness !== null)
  c.ready = ready
  pod.phase = 'Running'
  pod.processUp = true
  pod.processStartedAt = since
  pod.usage.memMi = pod.usage.memBaseOverrideMi ?? pod.spec.app.memMi
  k.stage = 'running'
  k.crashAt = null
  k.hangAt = pod.spec.app.hangAfterS !== null ? s.t + pod.spec.app.hangAfterS : null
  pod.timeline = { ...pod.timeline, createdAt: pod.createdAt, boundAt: since, pulledAt: since, startedAt: since, readyAt: ready ? since : null }
  resolveEnv(s, pod)
  resolveDataStore(s, pod)
  pod.logs = []
  appLog(s, pod, `INFO  starting ${CONTAINER(pod)} ${pod.spec.app.version} (pid 1), listening on :8000`)
  pod.logs[0].t = since
  appLog(s, pod, ready ? 'INFO  warm-up done, ready to serve' : 'WARN  warm-up failed: /ready keeps answering 503')
  pod.logs[1].t = since + pod.spec.app.warmS
  for (const kind of ['startup', 'liveness', 'readiness'] as ProbeKind[]) {
    const spec = pod.spec.probes[kind]
    const st = k.probes[kind]
    const failing = kind === 'readiness' && !ready
    st.successes = spec && !failing ? 1 : 0
    st.failures = failing && spec ? spec.failureThreshold : 0
    st.nextAt = spec ? s.t + s.cfg.timings.probeOffsetS + ((pod.seq * 0.7) % spec.periodSeconds) : Infinity
  }
  pod.ready = { status: ready, since }
  return true
}

// ---------------------------------------------------------------- in-place resize (1.35 resize subresource)

/** Room for `desired` on the node next to the other Pods (requests), and the absolute node limit. */
export function resizeFit(s: ClusterState, pod: Pod, node: Node, desired: ResourceSpec): 'fits' | 'Deferred' | 'Infeasible' {
  const cpu = desired.requests.cpuM ?? desired.limits.cpuM ?? 0
  const mem = desired.requests.memMi ?? desired.limits.memMi ?? 0
  const capCpu = node.allocatable.cpuM - node.daemonSet.cpuM
  const capMem = node.allocatable.memMi - node.daemonSet.memMi
  if (cpu > capCpu || mem > capMem) return 'Infeasible'
  let usedCpu = node.daemonSet.cpuM
  let usedMem = node.daemonSet.memMi
  for (const o of s.pods) {
    if (o === pod || o.nodeName !== node.name || isTerminal(o)) continue
    const r = effectiveRequests(o.spec)
    usedCpu += r.cpuM
    usedMem += r.memMi
  }
  if (cpu > node.allocatable.cpuM - usedCpu || mem > node.allocatable.memMi - usedMem) return 'Deferred'
  const lim = desired.limits.memMi
  if (lim !== undefined && pod.processUp && pod.usage.memMi > lim) return 'Deferred'
  return 'fits'
}

/** Apply resources in place (same Pod, same container, no restart for CPU and memory with NotRequired policy). */
export function applyResize(s: ClusterState, pod: Pod, desired: ResourceSpec): void {
  pod.spec.resources = JSON.parse(JSON.stringify(desired)) as ResourceSpec
  pod.resize = null
  s.schedGen += 1
  kubeEvent(s, 'Normal', 'ResizeCompleted', podRef(pod), `Pod resize completed: ${JSON.stringify({ requests: desired.requests, limits: desired.limits })}`)
  logEvent(s, 'resized', `Pod ${pod.name}: requests/limits promijenjeni na mjestu (bez ponovnog pokretanja), QoS ${qosClass(pod.spec)}`, 'info', pod.id)
}

function retryResize(s: ClusterState, pod: Pod, node: Node): void {
  const r = pod.resize!
  const fit = resizeFit(s, pod, node, r.desired)
  if (fit === 'fits') applyResize(s, pod, r.desired)
  else if (fit !== r.status) pod.resize = { ...r, status: fit }
}

// ---------------------------------------------------------------- CPU (once per simulated second)

/**
 * Per node: demand capped by the CPU limit (CFS quota → throttling), then if the node is oversubscribed
 * the remainder is water-filled in proportion to max(request, 2m) (cgroup cpu.weight). Never kills.
 */
export function cpuSecond(s: ClusterState): void {
  for (const node of s.nodes) {
    const pods = s.pods.filter((p) => p.nodeName === node.name && p.processUp)
    if (pods.length === 0) continue
    const capped = pods.map((p) => {
      const demand = p.usage.cpuDemandM
      const lim = p.spec.resources.limits.cpuM
      return Math.min(demand, lim ?? Infinity)
    })
    const available = node.machine === 'running' ? Math.max(0, node.allocatable.cpuM - node.daemonSet.cpuM) : 0
    const weights = pods.map((p) => Math.max(effectiveRequests(p.spec).cpuM, 2))
    const { out: got, level } = waterFillLevel(capped, weights, available)
    const sumCapped = capped.reduce((a, b) => a + b, 0)
    const free = Math.max(0, available - sumCapped)
    pods.forEach((p, i) => {
      const demand = p.usage.cpuDemandM
      const lim = p.spec.resources.limits.cpuM ?? Infinity
      p.usage.cpuM = got[i]
      // what the Pod could get if it asked for more: the free CPU (no contention) or its water-fill share
      if (sumCapped <= available + EPS) p.usage.cpuCapacityM = Math.min(lim, got[i] + free)
      else if (got[i] < capped[i] - 1e-6) p.usage.cpuCapacityM = got[i]
      else p.usage.cpuCapacityM = Math.min(lim, Math.max(got[i], Number.isFinite(level) ? level * weights[i] : got[i]))
      p.usage.throttledPct = demand > 0 ? (demand - capped[i]) / demand : 0
      p.usage.contentionPct = demand > 0 ? (capped[i] - got[i]) / demand : 0
      p.cpuSamples.push(got[i])
      if (p.cpuSamples.length > s.cfg.metricResolutionS) p.cpuSamples.shift()
    })
  }
}

/** Water-filling: each i gets min(cap_i, share ∝ weight_i) of `total`. */
export function waterFill(caps: number[], weights: number[], total: number): number[] {
  return waterFillLevel(caps, weights, total).out
}

/**
 * Water-filling with the final level: the unsaturated entries got `level × weight`. level = Infinity when the
 * total covers every cap (no contention) or nothing remained to share.
 */
export function waterFillLevel(caps: number[], weights: number[], total: number): { out: number[]; level: number } {
  const out = caps.map(() => 0)
  const sumCaps = caps.reduce((a, b) => a + b, 0)
  if (sumCaps <= total + EPS) return { out: caps.slice(), level: Infinity }
  let remaining = total
  let level = 0
  const open = new Set(caps.map((_, i) => i))
  while (open.size > 0 && remaining > EPS) {
    let wsum = 0
    for (const i of open) wsum += weights[i]
    let saturated = false
    for (const i of [...open]) {
      const share = (remaining * weights[i]) / wsum
      if (caps[i] - out[i] <= share + EPS) {
        remaining -= caps[i] - out[i]
        out[i] = caps[i]
        open.delete(i)
        saturated = true
      }
    }
    if (!saturated) {
      level = remaining / wsum
      for (const i of open) out[i] += level * weights[i]
      remaining = 0
    }
  }
  return { out, level }
}

export interface CfsResult {
  latencyMs: number
  throttledMs: number
  periods: { runMs: number; throttledMs: number }[]
}

/**
 * CFS bandwidth control for a single-threaded request: quota = limit × period per period.
 * 200m limit, 50 ms of work → 20 ms run, 80 ms throttled, 20 ms, 80 ms, 10 ms = 210 ms.
 * Prefer the named form cfsLatencyMs({ limitM: 200, workMs: 50 }); the positional form is (workMs, limitM, periodMs).
 */
export function cfsLatencyMs(o: { limitM: number; workMs: number; periodMs?: number }): CfsResult
/** @deprecated positional (workMs, limitM) – easy to swap; use the object form. */
export function cfsLatencyMs(workMs: number, limitM: number, periodMs?: number): CfsResult
export function cfsLatencyMs(a: number | { limitM: number; workMs: number; periodMs?: number }, b?: number, c?: number): CfsResult {
  if (typeof a === 'object') return cfsCore(a.workMs, a.limitM, a.periodMs ?? 100)
  return cfsCore(a, b ?? NaN, c ?? 100)
}

function cfsCore(workMs: number, limitM: number, periodMs: number): CfsResult {
  if (!Number.isFinite(workMs) || !Number.isFinite(limitM) || !(periodMs > 0)) return { latencyMs: NaN, throttledMs: NaN, periods: [] }
  if (limitM <= 0 && workMs > 0) return { latencyMs: Infinity, throttledMs: Infinity, periods: [] }
  const quota = (limitM / 1000) * periodMs
  if (quota >= periodMs || workMs <= 0) return { latencyMs: Math.max(0, workMs), throttledMs: 0, periods: [{ runMs: Math.max(0, workMs), throttledMs: 0 }] }
  const periods: { runMs: number; throttledMs: number }[] = []
  let left = workMs
  while (left > EPS) {
    const run = Math.min(quota, left)
    left -= run
    periods.push({ runMs: run, throttledMs: left > EPS ? periodMs - run : 0 })
  }
  const latencyMs = periods.reduce((a, p) => a + p.runMs + p.throttledMs, 0)
  return { latencyMs, throttledMs: latencyMs - workMs, periods }
}
