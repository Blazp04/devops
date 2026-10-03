/**
 * User actions ("kubectl" and break-it buttons). Every action is a plain function mutating the state –
 * call it inside sim.mutate(...). Writes go through the API server: with the API server off they fail with the real
 * connection error, with etcd off with the etcd timeout, and nothing changes. Physical events (a node losing power,
 * a kubelet stopping, a process hanging, the database going down) are not API writes and always happen.
 *
 * With messages on (L11) a successful write is animated causally: 1 kubectl → API, 2 API → etcd, the etcd ack, the
 * answer to kubectl; watchers see the change only after the ack (s.writeVisibleAt), so step 3 never starts before
 * steps 1 and 2 have landed.
 */
import type { ClusterState, ComponentName, Deployment, Hpa, Pod, PodTemplate, Probes, ResourceSpec, Service, TrafficProfile, VersionRoles } from './types.ts'
import { KLOPA_API_VERSIONS, SIM_EPOCH_MS, appBehaviour, podTemplate } from './config.ts'
import type { KlopaApiVersion } from './config.ts'
import { applyResize, beginStop, containerExited, resizeFit } from './kubelet.ts'
import { createPodObject, deletePodObject, forceDeletePod, syncApiStatus } from './pods.ts'
import { findDeployment, pauseRollout, resumeRollout, rolloutUndo, setStrategy, updateTemplate, deleteDeployment } from './rollout.ts'
import type { ActionResult } from './rollout.ts'
import { bindManually } from './scheduler.ts'
import { findService, setServiceSelector, setServiceType, setSessionAffinity } from './service.ts'
import { deletePvc, findPvc } from './storage.ts'
import { deleteStatefulSet, findStatefulSet } from './statefulset.ts'
import { cordonNode as cordonNodeObject, drainNode as drainNodeObject, findNode, powerOffNode, powerOnNode, setKubelet, setOutOfService as setOutOfServiceTaint } from './nodes.ts'
import { requestedOnNode } from './scheduler.ts'
import { rankForDeletion, podsOfReplicaSet } from './replicaset.ts'
import { API_REFUSED, ETCD_TIMEOUT, canWrite, cloneTemplate, hrCount, isActive, logEvent, message, podByName, qosClass } from './util.ts'
import { resetTrafficTotals } from './traffic.ts'
import { dbEffectiveUp } from './core.ts'
import { addPostgresDeployment } from './presets.ts'
import {
  kubectlDescribePod,
  kubectlGetDeployments,
  kubectlGetEndpointSlices,
  kubectlGetEvents,
  kubectlGetHpa,
  kubectlGetNodes,
  kubectlGetPods,
  kubectlGetPvc,
  kubectlGetReplicaSets,
  kubectlGetServices,
  kubectlLogs,
} from './views.ts'

export type { ActionResult } from './rollout.ts'
export { SIM_EPOCH_MS }

/** The simulation's upper bound for replicas sliders and kubectl scale (the real API allows any int32). */
export const MAX_REPLICAS = 1000

function logKubectl(s: ClusterState, cmd: string, out: string[], ok: boolean): void {
  s.kubectlLog.push({ t: s.t, cmd, out, ok })
  if (s.kubectlLog.length > 30) s.kubectlLog.shift()
}

/** Record a kubectl write and its output (L11 terminal); returns the result. */
function kubectl(s: ClusterState, cmd: string, write: boolean, fn: () => ActionResult): ActionResult {
  let r: ActionResult
  const short = cmd.replace(/^kubectl /, '')
  if (!s.components.apiServer) r = { ok: false, message: API_REFUSED }
  else if (write && !s.components.etcd) {
    const m1 = message(s, 'kubectl', 'apiserver', short, 1)
    message(s, 'apiserver', 'etcd', 'zapiši željeno stanje', 2, 0.3, { after: m1 })
    r = { ok: false, message: ETCD_TIMEOUT }
  } else {
    r = fn()
    if (write) {
      const m1 = message(s, 'kubectl', 'apiserver', short, 1)
      if (r.ok) {
        // the API server answers only after etcd has stored the change; watchers see it after the ack
        const m2 = message(s, 'apiserver', 'etcd', 'zapiši željeno stanje', 2, 0.3, { after: m1 })
        const ack = message(s, 'etcd', 'apiserver', 'zapisano', 0, 0.15, { after: m2 })
        message(s, 'apiserver', 'kubectl', r.message.split('\n')[0], 0, 0.15, { after: ack })
      } else message(s, 'apiserver', 'kubectl', r.message.split('\n')[0], 0, 0.15, { after: m1 })
    }
  }
  logKubectl(s, cmd, r.message.split('\n'), r.ok)
  if (!r.ok && (r.message === API_REFUSED || r.message === ETCD_TIMEOUT)) logEvent(s, 'kubectl-error', `kubectl: ${r.message === API_REFUSED ? 'API poslužitelj ne odgovara' : 'etcd ne odgovara – promjena nije zapisana'}`, 'bad')
  return r
}

/**
 * A kubectl READ (get / describe / logs): with the API server off the connection is refused, with etcd off the
 * consistent read times out; otherwise `fn` produces the lines. Recorded in s.kubectlLog like a write.
 */
export function kubectlRead(s: ClusterState, cmd: string, fn: () => string[]): { ok: boolean; lines: string[] } {
  let res: { ok: boolean; lines: string[] }
  if (!s.components.apiServer) res = { ok: false, lines: [API_REFUSED] }
  else if (!s.components.etcd) res = { ok: false, lines: [ETCD_TIMEOUT] }
  else res = { ok: true, lines: fn() }
  logKubectl(s, cmd, res.lines, res.ok)
  return res
}

/**
 * The L11 / L24 console: run one read command. Supported: get pods [-o wide] | nodes | deployments | rs | svc |
 * endpointslices | events | hpa | pvc, describe pod NAME, logs NAME [--previous] [--timestamps] [--tail=N].
 */
export function kubectlRun(s: ClusterState, command: string): { ok: boolean; lines: string[] } {
  const cmd = command.trim().replace(/\s+/g, ' ')
  const args = cmd.replace(/^kubectl /, '').split(' ')
  const full = cmd.startsWith('kubectl ') ? cmd : `kubectl ${cmd}`
  const [verb, what, name] = args
  const get: Record<string, () => string[]> = {
    pods: () => kubectlGetPods(s, { wide: args.includes('wide') || args.includes('-owide') }),
    nodes: () => kubectlGetNodes(s),
    deployments: () => kubectlGetDeployments(s),
    replicasets: () => kubectlGetReplicaSets(s),
    services: () => kubectlGetServices(s),
    endpointslices: () => kubectlGetEndpointSlices(s),
    events: () => kubectlGetEvents(s),
    horizontalpodautoscalers: () => kubectlGetHpa(s),
    persistentvolumeclaims: () => kubectlGetPvc(s),
  }
  const alias: Record<string, string> = { po: 'pods', pod: 'pods', no: 'nodes', node: 'nodes', deploy: 'deployments', deployment: 'deployments', rs: 'replicasets', replicaset: 'replicasets', svc: 'services', service: 'services', endpointslice: 'endpointslices', ev: 'events', event: 'events', hpa: 'horizontalpodautoscalers', pvc: 'persistentvolumeclaims' }
  if (verb === 'get' && what) {
    const key = alias[what] ?? what
    const f = get[key]
    if (!f) return kubectlRead(s, full, () => [`error: the server doesn't have a resource type "${what}"`])
    return kubectlRead(s, full, f)
  }
  if (verb === 'describe' && (what === 'pod' || what === 'pods' || what === 'po') && name) return kubectlRead(s, full, () => kubectlDescribePod(s, name))
  if (verb === 'logs' && what) {
    const tail = args.find((a) => a.startsWith('--tail='))
    return kubectlRead(s, full, () => kubectlLogs(s, what, { previous: args.includes('--previous') || args.includes('-p'), timestamps: args.includes('--timestamps'), tail: tail ? Number(tail.slice(7)) : undefined }))
  }
  const res = { ok: false, lines: [`error: unknown command "${args[0] ?? ''}" for "kubectl"`] }
  logKubectl(s, full, res.lines, false)
  return res
}

/**
 * Validate a replica count like kubectl (client: an integer) and the API (≥ 0); the sim caps it at MAX_REPLICAS.
 * Returns the error text or null.
 */
function replicaError(kind: string, name: string, n: number): string | null {
  if (!Number.isFinite(n) || !Number.isInteger(n)) return `error: invalid argument "${String(n)}" for "--replicas" flag: strconv.ParseInt: parsing "${String(n)}": invalid syntax`
  if (n < 0) return `The ${kind} "${name}" is invalid: spec.replicas: Invalid value: ${n}: must be greater than or equal to 0`
  if (n > MAX_REPLICAS) return `simulacija dopušta najviše ${MAX_REPLICAS} replika`
  return null
}

// ---------------------------------------------------------------- control plane (L11)

/** Switch a control-plane component on/off (API poslužitelj, etcd, raspoređivač, controller-manager). */
export function setComponent(s: ClusterState, name: ComponentName, on: boolean): void {
  if (s.components[name] === on) return
  s.components[name] = on
  s.schedGen += 1
  // the API's view of every Pod freezes at this moment (or thaws: the kubelets report again)
  syncApiStatus(s)
  const label = { apiServer: 'API poslužitelj', etcd: 'etcd', scheduler: 'Raspoređivač', controllerManager: 'controller-manager' }[name]
  logEvent(s, on ? 'component-on' : 'component-off', `${label} ${on ? 'ponovno radi' : 'isključen'}${on ? '' : ' – Podovi koji rade i dalje poslužuju'}`, on ? 'ok' : 'warn')
}

export { setKubelet, powerOffNode, powerOnNode }

/** kubectl cordon / uncordon NODE. */
export function cordonNode(s: ClusterState, name: string, on = true): ActionResult {
  return kubectl(s, `kubectl ${on ? 'cordon' : 'uncordon'} ${name}`, true, () => {
    const node = findNode(s, name)
    if (!node) return { ok: false, message: `Error from server (NotFound): nodes "${name}" not found` }
    const already = node.unschedulable === on
    cordonNodeObject(s, name, on)
    return { ok: true, message: already ? `node/${name} already ${on ? 'cordoned' : 'uncordoned'}` : `node/${name} ${on ? 'cordoned' : 'uncordoned'}` }
  })
}

/**
 * kubectl drain NODE [--force] [--delete-emptydir-data]: cordons, then refuses (like kubectl) while bare Pods or
 * emptyDir Pods are on the node unless the matching flag is given.
 */
export function drainNode(s: ClusterState, name: string, o: { force?: boolean; deleteEmptyDirData?: boolean } = {}): ActionResult {
  return kubectl(s, `kubectl drain ${name} --ignore-daemonsets${o.force ? ' --force' : ''}${o.deleteEmptyDirData ? ' --delete-emptydir-data' : ''}`, true, () => drainNodeObject(s, name, o))
}

/** Non-graceful node shutdown: kubectl taint nodes NODE node.kubernetes.io/out-of-service=nodeshutdown:NoExecute[-]. */
export function setOutOfService(s: ClusterState, name: string, on = true): ActionResult {
  return kubectl(s, `kubectl taint nodes ${name} node.kubernetes.io/out-of-service=nodeshutdown:NoExecute${on ? '' : '-'}`, true, () => {
    if (!setOutOfServiceTaint(s, name, on)) return { ok: false, message: `Error from server (NotFound): nodes "${name}" not found` }
    return { ok: true, message: `node/${name} ${on ? 'tainted' : 'untainted'}` }
  })
}

/** kubectl apply of the ReplicaSet preview with a new replicas value (L11 slider). */
export function applyReplicaSetReplicas(s: ClusterState, name: string, replicas: number): ActionResult {
  return kubectl(s, `kubectl apply -f ${name}.yaml # replicas: ${replicas}`, true, () => {
    const rs = s.replicaSets.find((r) => r.name === name)
    if (!rs) return { ok: false, message: `Error from server (NotFound): replicasets.apps "${name}" not found` }
    const err = replicaError('ReplicaSet', name, replicas)
    if (err) return { ok: false, message: err }
    if (rs.replicas === replicas) return { ok: true, message: `replicaset.apps/${name} unchanged` }
    rs.replicas = replicas
    return { ok: true, message: `replicaset.apps/${name} configured` }
  })
}

/** kubectl run/apply of a bare Pod. */
export function applyBarePod(s: ClusterState, name: string, template: PodTemplate): ActionResult {
  return kubectl(s, `kubectl apply -f ${name}.yaml`, true, () => {
    if (podByName(s, name)) return { ok: true, message: `pod/${name} unchanged` }
    createPodObject(s, template, { name, namespace: s.cfg.namespace, owner: null })
    return { ok: true, message: `pod/${name} created` }
  })
}

/** Change a running Pod's image in place (one of the few mutable Pod fields): the kubelet restarts the container. */
export function setPodImage(s: ClusterState, podName: string, image: string): ActionResult {
  return kubectl(s, `kubectl set image pod/${podName} ${podName.split('-').slice(0, 2).join('-')}=${image}`, true, () => {
    const p = podByName(s, podName)
    if (!p) return { ok: false, message: `Error from server (NotFound): pods "${podName}" not found` }
    if (p.spec.image === image) return { ok: true, message: `pod/${podName} unchanged` }
    p.spec.image = image
    p.kubelet.imageBackoff = null
    const k = p.kubelet
    if (p.processUp) beginStop(s, p, 'image-change', p.spec.terminationGracePeriodSeconds)
    else if (k.stage === 'pulling' || k.stage === 'pull-backoff' || k.stage === 'creating' || k.stage === 'config') k.stage = 'config'
    return { ok: true, message: `pod/${podName} image updated` }
  })
}

/**
 * "Krivi tag slike" for the ReplicaSet preview: a ReplicaSet never updates existing Pods, so nothing visible happens
 * until a Pod is recreated. `recreateOne` also deletes one Pod (as `kubectl delete pod` would) so the new tag shows up
 * in its replacement (ErrImagePull → ImagePullBackOff).
 */
export function setReplicaSetImage(s: ClusterState, name: string, image: string, o: { recreateOne?: boolean } = {}): ActionResult {
  return kubectl(s, `kubectl apply -f ${name}.yaml # image: ${image}`, true, () => {
    const rs = s.replicaSets.find((r) => r.name === name)
    if (!rs) return { ok: false, message: `Error from server (NotFound): replicasets.apps "${name}" not found` }
    rs.template = { ...cloneTemplate(rs.template), image }
    const lines = [`replicaset.apps/${name} configured`]
    if (o.recreateOne) {
      const victim = rankForDeletion(podsOfReplicaSet(s, rs).filter(isActive))[0]
      if (victim) {
        deletePodObject(s, victim, 'kubectl')
        lines.push(`pod "${victim.name}" deleted`)
      }
    }
    return { ok: true, message: lines.join('\n') }
  })
}

/** kubectl delete pod [--force --grace-period=0] */
export function deletePod(s: ClusterState, podName: string, o: { force?: boolean } = {}): ActionResult {
  return kubectl(s, `kubectl delete pod ${podName}${o.force ? ' --force --grace-period=0' : ''}`, true, () => {
    const p = podByName(s, podName)
    if (!p) return { ok: false, message: `Error from server (NotFound): pods "${podName}" not found` }
    if (o.force) {
      forceDeletePod(s, p)
      return { ok: true, message: `Warning: Immediate deletion does not wait for confirmation that the running resource has been terminated. The resource may continue to run on the cluster indefinitely.\npod "${podName}" force deleted` }
    }
    deletePodObject(s, p, 'kubectl')
    return { ok: true, message: `pod "${podName}" deleted` }
  })
}

/** L11 "Napuni čvorove": someone else's Pods take every free slot (memory requests) – an ordinary kubectl apply. */
export function fillNodes(s: ClusterState, slotMi = 512): ActionResult {
  return kubectl(s, 'kubectl apply -f ivina-proba.yaml', true, () => {
    let n = 0
    const lines: string[] = []
    for (const node of s.nodes) {
      if (node.machine !== 'running') continue
      const free = node.allocatable.memMi - requestedOnNode(s, node).memMi
      if (free < slotMi / 2) continue
      n += 1
      const tpl = podTemplate({
        labels: { app: 'ivina-proba' },
        image: KLOPA_API_VERSIONS['1.3.2'].image,
        resources: { requests: { cpuM: 50, memMi: free }, limits: {} },
        app: appBehaviour({ version: 'proba', warmS: 1 }),
      })
      const name = `ivina-proba-${node.name}`
      createPodObject(s, tpl, { name, namespace: s.cfg.namespace, owner: null, nodeName: node.name })
      lines.push(`pod/${name} created`)
    }
    logEvent(s, 'fill', `Iva je pokrenula ${hrCount(n, ['testni Pod koji zauzima', 'testna Poda koja zauzimaju', 'testnih Podova koji zauzimaju'])} sva slobodna mjesta`, 'warn')
    return { ok: true, message: lines.length ? lines.join('\n') : 'nema slobodnih mjesta' }
  })
}

// ---------------------------------------------------------------- Pod health (L12) – physical events, not API writes

/** "Baza pala 60 s": shared database down for `seconds` (null = until setDatabase(true)). */
export function setDatabase(s: ClusterState, up: boolean, seconds: number | null = null): void {
  const secs = seconds !== null && Number.isFinite(seconds) && seconds > 0 ? seconds : null
  s.db.forcedDown = !up
  s.db.downUntil = up || secs === null ? null : s.t + secs
  logEvent(s, up ? 'db-up' : 'db-down', up ? 'Baza ponovno radi' : `Baza je pala${secs ? ` na ${secs} s` : ''}`, up ? 'ok' : 'bad')
  s.db.up = dbEffectiveUp(s)
}

/** The database is a workload: it is up only while this Service has a ready endpoint (null = an external database). */
export function setDatabaseBacking(s: ClusterState, serviceName: string | null): void {
  s.db.backing = serviceName
  s.db.up = dbEffectiveUp(s)
}

/** The password the database accepts (L24 Secret rotation); null = no authentication modelled. */
export function setDatabasePassword(s: ClusterState, password: string | null): void {
  s.db.password = password
  logEvent(s, 'db-password', password === null ? 'Baza više ne provjerava lozinku' : 'Baza sada prihvaća novu lozinku', 'info')
}

/** "Zaglavi proces": the process deadlocks now (alive, every endpoint times out). */
export function hangProcess(s: ClusterState, podName: string): boolean {
  const p = podByName(s, podName)
  if (!p || !p.processUp) return false
  p.kubelet.hangAt = s.t
  logEvent(s, 'hang', `${p.name}: proces je zaglavio (živ, ali ne odgovara)`, 'bad', p.id)
  return true
}

/** "Ponovno pokreni kontejner" (L19): kill the process; the kubelet starts a fresh container in the same Pod. */
export function killContainer(s: ClusterState, podName: string): boolean {
  const p = podByName(s, podName)
  if (!p || !p.processUp) return false
  containerExited(s, p, 'Error', 137, 'killed')
  return true
}

/** kubectl label pod NAME key=value --overwrite (value null: key-) – may detach the Pod from a ReplicaSet or a Service. */
export function setPodLabel(s: ClusterState, podName: string, key: string, value: string | null): ActionResult {
  return kubectl(s, `kubectl label pod ${podName} ${value === null ? `${key}-` : `${key}=${value} --overwrite`}`, true, () => {
    const p = podByName(s, podName)
    if (!p) return { ok: false, message: `Error from server (NotFound): pods "${podName}" not found` }
    if (value === null) delete p.labels[key]
    else p.labels[key] = value
    logEvent(s, 'label', `Pod ${p.name}: oznaka ${key}${value === null ? ' uklonjena' : `=${value}`}`, 'info', p.id)
    return { ok: true, message: `pod/${podName} ${value === null ? 'unlabeled' : 'labeled'}` }
  })
}

/** L14 "Podu padne readiness": the app's readiness endpoint answers 503 (true/null restores). Not an API write. */
export function setPodReadiness(s: ClusterState, podName: string, ready: boolean | null): boolean {
  const p = podByName(s, podName)
  if (!p) return false
  p.readyOverride = ready
  return true
}

function needService(s: ClusterState, name: string): Service | ActionResult {
  return findService(s, name) ?? { ok: false, message: `Error from server (NotFound): services "${name}" not found` }
}

function isServiceResult(x: Service | ActionResult): x is ActionResult {
  return (x as ActionResult).ok !== undefined
}

/** "Segmented vrsta: ClusterIP / NodePort / LoadBalancer" */
export function setServiceTypeByName(s: ClusterState, name: string, type: 'ClusterIP' | 'NodePort' | 'LoadBalancer'): ActionResult {
  return kubectl(s, `kubectl patch svc ${name} -p '{"spec":{"type":"${type}"}}'`, true, () => {
    const svc = needService(s, name)
    if (isServiceResult(svc)) return svc
    if (svc.headless && type !== 'ClusterIP') return { ok: false, message: `The Service "${name}" is invalid: spec.clusterIPs[0]: Invalid value: []string{"None"}: may not be set to 'None' for ${type} services` }
    setServiceType(s, svc, type)
    return { ok: true, message: `service/${name} patched` }
  })
}

export function setServiceSelectorByName(s: ClusterState, name: string, selector: Record<string, string>): ActionResult {
  return kubectl(s, `kubectl patch svc ${name} -p '{"spec":{"selector":${JSON.stringify(selector)}}}'`, true, () => {
    const svc = needService(s, name)
    if (isServiceResult(svc)) return svc
    setServiceSelector(s, svc, selector)
    return { ok: true, message: `service/${name} patched` }
  })
}

/** L14 „sessionAffinity: ClientIP” (clients behind one NAT IP land on one Pod); None turns it off. */
export function setServiceSessionAffinity(s: ClusterState, name: string, mode: 'None' | 'ClientIP', timeoutS = 10800): ActionResult {
  return kubectl(s, `kubectl patch svc ${name} -p '{"spec":{"sessionAffinity":"${mode}"}}'`, true, () => {
    const svc = needService(s, name)
    if (isServiceResult(svc)) return svc
    if (svc.headless && mode === 'ClientIP') return { ok: false, message: `The Service "${name}" is invalid: spec.sessionAffinity: Invalid value: "ClientIP": may not be used when clusterIP is None` }
    if (svc.sessionAffinity === mode && (mode === 'None' || svc.affinityTimeoutS === timeoutS)) return { ok: true, message: `service/${name} patched (no change)` }
    setSessionAffinity(s, svc, mode, timeoutS)
    return { ok: true, message: `service/${name} patched` }
  })
}

// ---------------------------------------------------------------- Deployment (L13)

function needDeployment(s: ClusterState, name: string): Deployment | ActionResult {
  return findDeployment(s, name) ?? { ok: false, message: `Error from server (NotFound): deployments.apps "${name}" not found` }
}

function isResult(x: Deployment | ActionResult): x is ActionResult {
  return (x as ActionResult).ok !== undefined
}

/** kubectl set image / apply with a klopa-api version from the story chain (a `version` label follows the version). */
export function setDeploymentVersion(s: ClusterState, name: string, version: KlopaApiVersion, extra: Partial<PodTemplate> = {}): ActionResult {
  return kubectl(s, `kubectl apply -f deployment.yaml # ${KLOPA_API_VERSIONS[version].image.split('/').pop()}`, true, () => {
    const d = needDeployment(s, name)
    if (isResult(d)) return d
    const v = KLOPA_API_VERSIONS[version]
    const app = { ...v.app, sigterm: d.template.app.sigterm, drainS: d.template.app.drainS, warmS: d.template.app.warmS, cpuDemandM: d.template.app.cpuDemandM }
    const patch: Partial<PodTemplate> = { image: v.image, app, changeCause: `uvođenje ${v.app.version}`, ...extra }
    if (d.template.labels.version !== undefined && !extra.labels) patch.labels = { ...d.template.labels, version: v.app.version }
    return updateTemplate(s, d, patch)
  })
}

export function patchDeploymentTemplate(s: ClusterState, name: string, patch: Partial<PodTemplate>): ActionResult {
  return kubectl(s, `kubectl apply -f deployment.yaml`, true, () => {
    const d = needDeployment(s, name)
    if (isResult(d)) return d
    return updateTemplate(s, d, patch)
  })
}

/** "Provjera spremnosti" toggle on the Deployment's template (changing it rolls out new Pods). */
export function setDeploymentProbes(s: ClusterState, name: string, probes: Partial<Probes>): ActionResult {
  const d = findDeployment(s, name)
  if (!d) return { ok: false, message: `Error from server (NotFound): deployments.apps "${name}" not found` }
  return patchDeploymentTemplate(s, name, { probes: { ...d.template.probes, ...probes } })
}

/** kubectl scale deployment/NAME --replicas=N (an integer 0–MAX_REPLICAS; NaN, fractions and negatives are refused). */
export function scaleDeployment(s: ClusterState, name: string, replicas: number): ActionResult {
  return kubectl(s, `kubectl scale deployment/${name} --replicas=${replicas}`, true, () => {
    const d = needDeployment(s, name)
    if (isResult(d)) return d
    const err = replicaError('Deployment', name, replicas)
    if (err) return { ok: false, message: err }
    d.replicas = replicas
    return { ok: true, message: `deployment.apps/${name} scaled` }
  })
}

export function setDeploymentStrategy(s: ClusterState, name: string, strategy: Partial<Deployment['strategy']>): ActionResult {
  return kubectl(s, `kubectl apply -f deployment.yaml # strategy`, true, () => {
    const d = needDeployment(s, name)
    if (isResult(d)) return d
    return setStrategy(s, d, strategy)
  })
}

export function undoRollout(s: ClusterState, name: string, toRevision?: number): ActionResult {
  return kubectl(s, `kubectl rollout undo deployment/${name}${toRevision ? ` --to-revision=${toRevision}` : ''}`, true, () => {
    const d = needDeployment(s, name)
    if (isResult(d)) return d
    return rolloutUndo(s, d, toRevision)
  })
}

export function pauseDeployment(s: ClusterState, name: string, paused: boolean): ActionResult {
  return kubectl(s, `kubectl rollout ${paused ? 'pause' : 'resume'} deployment/${name}`, true, () => {
    const d = needDeployment(s, name)
    if (isResult(d)) return d
    return paused ? pauseRollout(s, d) : resumeRollout(s, d)
  })
}

/** kubectl rollout restart: a new template annotation → a new ReplicaSet → Pods replaced by the strategy's rules. */
export function rolloutRestart(s: ClusterState, name: string): ActionResult {
  return kubectl(s, `kubectl rollout restart deployment/${name}`, true, () => {
    const d = needDeployment(s, name)
    if (isResult(d)) return d
    const stamp = new Date(SIM_EPOCH_MS + Math.round(s.t * 1000)).toISOString().replace(/\.\d{3}Z$/, 'Z')
    const r = updateTemplate(s, d, { annotations: { ...d.template.annotations, 'kubectl.kubernetes.io/restartedAt': stamp } })
    return r.ok ? { ok: true, message: `deployment.apps/${name} restarted` } : r
  })
}

export function deleteDeploymentByName(s: ClusterState, name: string): ActionResult {
  return kubectl(s, `kubectl delete deployment ${name}`, true, () => {
    const d = needDeployment(s, name)
    if (isResult(d)) return d
    return deleteDeployment(s, d)
  })
}

/** Colour roles for versions (versionToneFor): stable blue, next violet, broken rose. */
export function setVersionRoles(s: ClusterState, roles: VersionRoles): void {
  const r: VersionRoles = {}
  if (roles.stable !== undefined) r.stable = roles.stable
  if (roles.next !== undefined) r.next = roles.next
  if (roles.broken) r.broken = [...roles.broken]
  s.cfg.versionRoles = r
}

// ---------------------------------------------------------------- Secrets (L16 / L24)

/** kubectl apply of a Secret (env valueFrom.secretKeyRef is resolved when a container is created). */
export function applySecret(s: ClusterState, name: string, data: Record<string, string>, namespace: string = s.cfg.namespace): ActionResult {
  return kubectl(s, `kubectl apply -f ${name}.yaml`, true, () => {
    const key = `${namespace}/${name}`
    const cur = s.secrets[key]
    if (cur && JSON.stringify(cur.data) === JSON.stringify(data)) return { ok: true, message: `secret/${name} unchanged` }
    s.secrets[key] = { name, namespace, data: { ...data }, version: (cur?.version ?? 0) + 1 }
    logEvent(s, 'secret', `Secret ${name} ${cur ? 'promijenjen – kontejneri koji već rade i dalje imaju staru vrijednost' : 'stvoren'}`, cur ? 'warn' : 'info')
    return { ok: true, message: `secret/${name} ${cur ? 'configured' : 'created'}` }
  })
}

export function deleteSecret(s: ClusterState, name: string, namespace: string = s.cfg.namespace): ActionResult {
  return kubectl(s, `kubectl delete secret ${name}`, true, () => {
    const key = `${namespace}/${name}`
    if (!s.secrets[key]) return { ok: false, message: `Error from server (NotFound): secrets "${name}" not found` }
    delete s.secrets[key]
    return { ok: true, message: `secret "${name}" deleted` }
  })
}

// ---------------------------------------------------------------- resources (L17)

/** A non-negative finite override, null to clear, undefined = leave as is (NaN/±Infinity are ignored). */
function override(v: number | null | undefined): number | null | undefined {
  if (v === undefined || v === null) return v
  return Number.isFinite(v) ? Math.max(0, v) : undefined
}

/** Usage sliders / "Curenje memorije" / "CPU petlja" (null clears an override). What the process does – not an API write. */
export function setPodUsage(s: ClusterState, podName: string, u: { cpuM?: number | null; memMi?: number | null; memGrowthMiPerS?: number | null }): boolean {
  const p = podByName(s, podName)
  if (!p) return false
  const cpu = override(u.cpuM)
  const mem = override(u.memMi)
  const growth = override(u.memGrowthMiPerS)
  if (cpu !== undefined) p.usage.cpuDemandOverrideM = cpu
  if (mem !== undefined) {
    p.usage.memBaseOverrideMi = mem
    if (mem !== null && p.processUp) p.usage.memMi = mem
  }
  if (growth !== undefined) p.usage.memGrowthMiPerS = growth
  return true
}

/**
 * `kubectl replace --force` for a bare Pod: most of a Pod's spec (probes, resources, volumes) is immutable, so a
 * changed spec means a NEW Pod with the same name – new IP, restart count 0 (L12 probe settings, L17 sliders).
 */
export function replaceBarePod(s: ClusterState, podName: string, patch: Partial<PodTemplate>): ActionResult {
  return kubectl(s, `kubectl replace --force -f ${podName}.yaml`, true, () => {
    const p = podByName(s, podName)
    if (!p) return { ok: false, message: `Error from server (NotFound): pods "${podName}" not found` }
    const tpl: PodTemplate = { ...cloneTemplate(p.spec), ...JSON.parse(JSON.stringify(patch)) }
    tpl.tolerations = tpl.tolerations.filter((t) => t.key !== 'node.kubernetes.io/not-ready' && t.key !== 'node.kubernetes.io/unreachable')
    const owner = p.owner
    const ns = p.namespace
    const labels = { ...p.labels }
    forceDeletePod(s, p)
    createPodObject(s, { ...tpl, labels }, { name: podName, namespace: ns, owner })
    return { ok: true, message: `pod "${podName}" deleted\npod/${podName} replaced` }
  })
}

/** requests ≤ limits for every resource that has both (API validation). */
function resourcesError(r: ResourceSpec): string | null {
  const q = r.requests
  const l = r.limits
  for (const v of [q.cpuM, q.memMi, l.cpuM, l.memMi]) if (v !== undefined && (!Number.isFinite(v) || v < 0)) return `neispravna vrijednost resursa: ${String(v)}`
  if (q.cpuM !== undefined && l.cpuM !== undefined && q.cpuM > l.cpuM) return `spec.containers[0].resources.requests: Invalid value: "${q.cpuM}m": must be less than or equal to cpu limit of ${cpuQuantity(l.cpuM)}`
  if (q.memMi !== undefined && l.memMi !== undefined && q.memMi > l.memMi) return `spec.containers[0].resources.requests: Invalid value: "${q.memMi}Mi": must be less than or equal to memory limit of ${l.memMi}Mi`
  return null
}

/** resource.Quantity formatting of millicores: 1000m → "1", 1500m → "1500m". */
function cpuQuantity(m: number): string {
  return m % 1000 === 0 ? String(m / 1000) : `${m}m`
}

/**
 * „Klizači requests/limits” the classic way: `kubectl replace --force` – a NEW Pod with the same name (new IP,
 * restart count 0) that the scheduler must place again (with the scheduler off it stays Pending until placed).
 * For an in-place change of a running Pod use resizePod.
 */
export function setPodResources(s: ClusterState, podName: string, resources: ResourceSpec): ActionResult {
  return kubectl(s, `kubectl replace --force -f ${podName}.yaml # resources`, true, () => {
    const p = podByName(s, podName)
    if (!p) return { ok: false, message: `Error from server (NotFound): pods "${podName}" not found` }
    const err = resourcesError(resources)
    if (err) return { ok: false, message: `The Pod "${podName}" is invalid: ${err}` }
    const tpl: PodTemplate = { ...cloneTemplate(p.spec), resources: JSON.parse(JSON.stringify(resources)) as ResourceSpec }
    tpl.tolerations = tpl.tolerations.filter((t) => t.key !== 'node.kubernetes.io/not-ready' && t.key !== 'node.kubernetes.io/unreachable')
    const usage = p.usage
    if (p.nodeName === null) {
      p.spec.resources = tpl.resources
      p.scheduled.lastAttemptGen = -1
      s.schedGen += 1
      return { ok: true, message: `pod/${podName} configured` }
    }
    forceDeletePod(s, p)
    const np = createPodObject(s, tpl, { name: podName, namespace: p.namespace, owner: p.owner })
    np.usage.cpuDemandOverrideM = usage.cpuDemandOverrideM
    np.usage.memBaseOverrideMi = usage.memBaseOverrideMi
    np.usage.memGrowthMiPerS = usage.memGrowthMiPerS
    return { ok: true, message: `pod "${podName}" deleted\npod/${podName} replaced` }
  })
}

/**
 * In-place resize (resize subresource, GA in 1.35): same Pod, same container, no restart. Applied at once when the
 * node has room; otherwise pod.resize records Deferred (retried by the kubelet) or Infeasible (larger than the node).
 * A resize that would change the QoS class is rejected by the API, as is requests > limits.
 */
export function resizePod(s: ClusterState, podName: string, resources: ResourceSpec): ActionResult {
  return kubectl(s, `kubectl patch pod ${podName} --subresource resize --patch-file resize.yaml`, true, () => {
    const p = podByName(s, podName)
    if (!p) return { ok: false, message: `Error from server (NotFound): pods "${podName}" not found` }
    const desired = JSON.parse(JSON.stringify(resources)) as ResourceSpec
    const err = resourcesError(desired)
    if (err) return { ok: false, message: `The Pod "${podName}" is invalid: ${err}` }
    const oldQos = qosClass(p.spec)
    if (qosClass({ ...p.spec, resources: desired }) !== oldQos) return { ok: false, message: `The Pod "${podName}" is invalid: spec: Invalid value: "${oldQos}": Pod QoS Class may not change as a result of resizing` }
    const node = p.nodeName ? findNode(s, p.nodeName) : undefined
    if (!node) {
      p.spec.resources = desired
      p.scheduled.lastAttemptGen = -1
      s.schedGen += 1
      return { ok: true, message: `pod/${podName} patched` }
    }
    const fit = resizeFit(s, p, node, desired)
    if (fit === 'fits') applyResize(s, p, desired)
    else {
      const cpu = desired.requests.cpuM ?? desired.limits.cpuM ?? 0
      const mem = desired.requests.memMi ?? desired.limits.memMi ?? 0
      const msg = fit === 'Infeasible' ? `Node didn't have enough capacity: cpu, requested: ${cpu}, capacity: ${node.allocatable.cpuM - node.daemonSet.cpuM}; memory, requested: ${mem}Mi` : `Node didn't have enough resource: cpu or memory, requested: ${cpu}m / ${mem}Mi`
      p.resize = { status: fit, desired, message: msg, since: s.t }
      logEvent(s, 'resize-pending', `Pod ${p.name}: promjena resursa čeka (${fit === 'Infeasible' ? 'Infeasible – veće od čvora' : 'Deferred – na čvoru trenutačno nema mjesta'})`, 'warn', p.id)
    }
    return { ok: true, message: `pod/${podName} patched` }
  })
}

/** "Ukloni requests": requests and limits removed → BestEffort (a new Pod: the QoS class cannot change in place). */
export function removeRequests(s: ClusterState, podName: string): ActionResult {
  return setPodResources(s, podName, { requests: {}, limits: {} })
}

/** Manual placement (drag a card onto a node) – a Binding written through the API server. */
export function placePod(s: ClusterState, podName: string, nodeName: string): { ok: boolean; reasons: string[] } {
  const p = podByName(s, podName)
  if (!p) return { ok: false, reasons: ['Pod ne postoji'] }
  if (!s.components.apiServer) return { ok: false, reasons: [API_REFUSED] }
  if (!canWrite(s)) return { ok: false, reasons: [ETCD_TIMEOUT] }
  return bindManually(s, p, nodeName)
}

/** "Pritisak memorije na čvoru": something outside the Pods (or an unlimited Pod) eats node memory. */
export function setNodeExtraMemory(s: ClusterState, nodeName: string, mi: number): boolean {
  const n = findNode(s, nodeName)
  if (!n) return false
  if (!Number.isFinite(mi)) return false
  n.extraSystemMemMi = Math.max(0, mi)
  return true
}

// ---------------------------------------------------------------- autoscaling (L18)

export function findHpa(s: ClusterState, name: string): Hpa | undefined {
  return s.hpas.find((h) => h.name === name)
}

/**
 * HPA sliders (kubectl patch hpa). Invalid combinations are rejected like the API does (min > max, max < 1,
 * target ≤ 0, NaN); minReplicas 0 is allowed only for external/object metrics (HPA scale-to-zero, beta in 1.37).
 * Refused (false) while the API server or etcd is off.
 */
export function setHpa(s: ClusterState, name: string, o: { minReplicas?: number; maxReplicas?: number; targetUtilization?: number }): boolean {
  const h = findHpa(s, name)
  if (!h || !canWrite(s)) return false
  const min = o.minReplicas ?? h.minReplicas
  const max = o.maxReplicas ?? h.maxReplicas
  const target = o.targetUtilization ?? (h.metric.type === 'cpu' ? h.metric.targetUtilization : 1)
  if (![min, max, target].every(Number.isFinite)) return false
  if (max < 1 || min > max || target <= 0 || max > MAX_REPLICAS) return false
  if (min < (h.metric.type === 'cpu' ? 1 : 0)) return false
  h.minReplicas = Math.round(min)
  h.maxReplicas = Math.round(max)
  if (h.metric.type === 'cpu') h.metric = { type: 'cpu', targetUtilization: target }
  return true
}

/** "Ukloni CPU request": a new template without CPU request/limit – the HPA goes blind. */
export function removeCpuRequest(s: ClusterState, deployment: string): ActionResult {
  const d = findDeployment(s, deployment)
  if (!d) return { ok: false, message: `Error from server (NotFound): deployments.apps "${deployment}" not found` }
  const res: ResourceSpec = { requests: { memMi: d.template.resources.requests.memMi }, limits: {} }
  return patchDeploymentTemplate(s, deployment, { resources: res })
}

/**
 * „Klizač CPU requests” (L18). The limit follows the request by default (`limit: 'ratio'`, ratio 2 – SIM 4's
 * 500m/1000m), so the burst headroom stays the same; `limit: 'keep'` keeps the current limit, a number sets it.
 * A request above the limit is rejected with the API's message.
 */
export function setCpuRequest(s: ClusterState, deployment: string, cpuM: number, o: { limit?: 'ratio' | 'keep' | number; ratio?: number } = {}): ActionResult {
  const d = findDeployment(s, deployment)
  if (!d) return { ok: false, message: `Error from server (NotFound): deployments.apps "${deployment}" not found` }
  if (!Number.isFinite(cpuM) || cpuM <= 0) return { ok: false, message: 'CPU request mora biti pozitivan broj (npr. 500m)' }
  const req = Math.round(cpuM)
  const ratio = o.ratio !== undefined && Number.isFinite(o.ratio) && o.ratio >= 1 ? o.ratio : 2
  const mode = o.limit ?? 'ratio'
  let limit: number | undefined
  if (mode === 'ratio') limit = Math.round(req * ratio)
  else if (mode === 'keep') limit = d.template.resources.limits.cpuM
  else if (Number.isFinite(mode) && mode > 0) limit = Math.round(mode)
  else return { ok: false, message: 'CPU limit mora biti pozitivan broj' }
  if (limit !== undefined && req > limit) {
    return { ok: false, message: `The Deployment "${deployment}" is invalid: spec.template.spec.containers[0].resources.requests: Invalid value: "${req}m": must be less than or equal to cpu limit of ${cpuQuantity(limit)}` }
  }
  const limits = { ...d.template.resources.limits }
  if (limit === undefined) delete limits.cpuM
  else limits.cpuM = limit
  const res: ResourceSpec = { requests: { ...d.template.resources.requests, cpuM: req }, limits }
  return patchDeploymentTemplate(s, deployment, { resources: res })
}

/** Cluster Autoscaler switch and node-group size (rejects NaN and min > max). */
export function setClusterAutoscaler(s: ClusterState, o: { enabled?: boolean; minNodes?: number; maxNodes?: number }): boolean {
  const ca = s.cfg.autoscaler
  if (!ca) return false
  const min = o.minNodes ?? ca.minNodes
  const max = o.maxNodes ?? ca.maxNodes
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < 1 || min > max) return false
  if (o.enabled !== undefined) ca.enabled = o.enabled
  ca.minNodes = Math.round(min)
  ca.maxNodes = Math.round(max)
  return true
}

/**
 * "Hladna predmemorija slika" (L18): no node has the image any more and every pull takes `pullS` (sim);
 * switching it off restores `warmPullS` (the L18 preset's 5 s).
 */
export function setColdImageCache(s: ClusterState, cold: boolean, pullS = 30, warmPullS = 5): void {
  if (cold) {
    for (const n of s.nodes) n.images = {}
    s.cfg.timings.imagePullS = pullS
    s.cfg.cachedImages = []
  } else s.cfg.timings.imagePullS = warmPullS
}

/**
 * „Segmented promet”: switch a stream's profile. By default the profile is anchored at NOW (a spike with startS 60
 * begins 60 s after the click, a daily wave starts at night); `anchor: 'absolute'` keeps the simulation clock.
 */
export function setTrafficProfile(s: ClusterState, streamId: string, profile: TrafficProfile, o: { anchor?: 'now' | 'absolute' } = {}): boolean {
  const st = s.traffic.find((x) => x.id === streamId)
  if (!st) return false
  st.profile = { ...profile }
  st.profileT0 = (o.anchor ?? 'now') === 'now' ? s.t : 0
  st.nextArrivalAt = NaN
  return true
}

export function setTrafficEnabled(s: ClusterState, streamId: string, enabled: boolean): boolean {
  const st = s.traffic.find((x) => x.id === streamId)
  if (!st) return false
  st.enabled = enabled
  return true
}

export { resetTrafficTotals }

// ---------------------------------------------------------------- storage (L19)

export function scaleStatefulSet(s: ClusterState, name: string, replicas: number): ActionResult {
  return kubectl(s, `kubectl scale statefulset/${name} --replicas=${replicas}`, true, () => {
    const sts = findStatefulSet(s, name)
    if (!sts) return { ok: false, message: `Error from server (NotFound): statefulsets.apps "${name}" not found` }
    const err = replicaError('StatefulSet', name, replicas)
    if (err) return { ok: false, message: err }
    sts.replicas = replicas
    return { ok: true, message: `statefulset.apps/${name} scaled` }
  })
}

export function deleteStatefulSetByName(s: ClusterState, name: string): ActionResult {
  return kubectl(s, `kubectl delete statefulset ${name}`, true, () => {
    const sts = findStatefulSet(s, name)
    if (!sts) return { ok: false, message: `Error from server (NotFound): statefulsets.apps "${name}" not found` }
    deleteStatefulSet(s, sts)
    return { ok: true, message: `statefulset.apps "${name}" deleted` }
  })
}

export function deletePvcByName(s: ClusterState, name: string): ActionResult {
  return kubectl(s, `kubectl delete pvc ${name}`, true, () => {
    const pvc = findPvc(s, name)
    if (!pvc) return { ok: false, message: `Error from server (NotFound): persistentvolumeclaims "${name}" not found` }
    deletePvc(s, pvc)
    return { ok: true, message: `persistentvolumeclaim "${name}" deleted` }
  })
}

/**
 * L19 „replicas: 3 za Postgres u Deploymentu” mid-lesson: Deployment postgres ×3 + Service + traffic, without a
 * volume (three databases) or sharing one RWO PVC (Multi-Attach / lock). Refused if it already exists.
 */
export function applyPostgresDeployment(s: ClusterState, variant: 'no-volume' | 'shared-pvc', writesPerSecond = 2): ActionResult {
  return kubectl(s, `kubectl apply -f postgres-${variant}.yaml`, true, () => {
    if (findDeployment(s, 'postgres')) return { ok: true, message: 'deployment.apps/postgres unchanged' }
    addPostgresDeployment(s, variant, Number.isFinite(writesPerSecond) && writesPerSecond >= 0 ? writesPerSecond : 2)
    return { ok: true, message: [...(variant === 'shared-pvc' ? ['persistentvolumeclaim/postgres-data created'] : []), 'deployment.apps/postgres created', 'service/postgres created'].join('\n') }
  })
}

/** Node helpers that also accept "failure" wording used in the lectures. */
export function failNode(s: ClusterState, name: string): boolean {
  return powerOffNode(s, name)
}

export function podsOnNode(s: ClusterState, nodeName: string): Pod[] {
  return s.pods.filter((p) => p.nodeName === nodeName)
}
