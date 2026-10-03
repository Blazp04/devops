/**
 * Lecture 14 adapter over E3 (src/engines/cluster): builds the „Laboratorij selektora” cluster and turns its state
 * into what the Service stage draws. No model of its own – every rule (selector matching, EndpointSlice conditions,
 * the 1 s kube-proxy lag, random pick per connection) comes from the engine.
 */
import {
  createPodObject,
  getEndpointSlice,
  getProxyEndpoints,
  hitShares,
  klopaApiTemplate,
  podShapeView,
  presetService,
  setVersionRoles,
  versionToneFor,
  warmStart,
  type ClusterState,
  type KlopaApiVersion,
  type PodShapeStatus,
  type VersionColour,
} from '../../engines/cluster'

export const SVC = 'klopa-api'
export const CLIENT = 'klopa-web'
export const STREAM = 'web'
export const STAGING_NS = 'klopa-staging'
export const STAGING_POD = 'klopa-api-test'
/** window of the per-Pod hit histogram (seconds of simulated time) */
export const HIT_WINDOW_S = 10

export interface LabOptions {
  seed?: number
  version?: KlopaApiVersion
  /** Iva's test Pod with app=klopa-api in Namespace klopa-staging (scene 1) */
  staging?: boolean
  sigterm?: 'drain' | 'exit'
  readinessProbe?: boolean
  preStopSleepS?: number
  rps?: number
}

/** presetService (client Pod klopa-web 10.244.1.7, ClusterIP 10.96.12.7, labels app + version) + optional staging Pod. */
export function createLab(o: LabOptions = {}): ClusterState {
  const s = presetService({
    seed: o.seed ?? 42,
    version: o.version ?? '1.4.0',
    sigterm: o.sigterm ?? 'exit',
    readinessProbe: o.readinessProbe ?? true,
    preStopSleepS: o.preStopSleepS ?? 0,
    rps: o.rps ?? 20,
  })
  // one colour per version in the whole lecture (story bible): 1.3.2 blue, 1.4.0 violet, anything newer (1.4.1) teal
  setVersionRoles(s, { stable: '1.3.2', next: '1.4.0', broken: ['1.5.0'] })
  if (o.staging) {
    const v = o.version ?? '1.4.0'
    const tpl = klopaApiTemplate(v, { labels: { app: SVC, version: v } })
    createPodObject(s, tpl, { name: STAGING_POD, namespace: STAGING_NS, owner: null, nodeName: 'node-3' })
    // already running when the reader arrives, like the preset's own Pods
    warmStart(s)
  }
  return s
}

/** How the stage draws the line from the Service to a Pod. */
export type LineKind =
  /** in kube-proxy's rules: traffic flows (solid green) */
  | 'traffic'
  /** in the EndpointSlice with ready: false (dashed grey, ✗, no traffic) */
  | 'notReady'
  /** terminating but still serving: kube-proxy uses it only when nothing is ready (dashed orange) */
  | 'terminating'
  /** just added to the slice, kube-proxy has not picked it up yet (dotted) */
  | 'propagating'
  /** already gone from the slice, but kube-proxy still sends traffic for up to 1 s (solid orange, „!”) */
  | 'stale'
  /** not selected */
  | 'none'

export interface StagePod {
  id: string
  name: string
  /** the random suffix of the Pod name (…-vq6xg) */
  short: string
  ip: string | null
  node: string | null
  namespace: string
  app: string | null
  version: string | null
  tone: VersionColour
  shape: PodShapeStatus
  status: string
  inSlice: boolean
  ready: boolean
  serving: boolean
  terminating: boolean
  inProxy: boolean
  line: LineKind
  hits: number
  share: number
}

export interface StageView {
  pods: StagePod[]
  staging: StagePod[]
  client: { ip: string; node: string } | null
  svc: { name: string; clusterIP: string; port: number; targetPort: number; selector: Record<string, string>; type: string; nodePort: number | null; lbIP: string | null; affinity: string }
  /** IPs in kube-proxy's rules (what node-1 has programmed right now) */
  proxyIps: string[]
  /** kube-proxy uses serving-terminating Pods because nothing is ready */
  fallback: boolean
  sliceCount: number
  readyCount: number
  /** the client dials a Pod IP directly (no Service) */
  targetIp: string | null
  targetAlive: boolean
  totalHits: number
}

function shortName(name: string): string {
  const parts = name.split('-')
  return parts.length > 2 ? parts[parts.length - 1] : name
}

/** Everything the stage needs, read from the engine (pure: no engine state is changed). */
export function stageView(s: ClusterState): StageView {
  const svc = s.services.find((x) => x.name === SVC)!
  const slice = getEndpointSlice(s, SVC)
  const proxy = getProxyEndpoints(s, SVC)
  const shares = hitShares(s, HIT_WINDOW_S, STREAM)
  const totalHits = shares.reduce((a, h) => a + h.hits, 0)
  const toStage = (p: ClusterState['pods'][number]): StagePod => {
    const e = slice.find((x) => x.podId === p.id)
    const inProxy = proxy.some((x) => x.podId === p.id)
    const h = shares.find((x) => x.podId === p.id)
    const sv = podShapeView(p)
    let line: LineKind = 'none'
    if (inProxy && !e) line = 'stale'
    else if (inProxy) line = 'traffic'
    else if (e && e.terminating) line = e.serving ? 'terminating' : 'notReady'
    else if (e && !e.ready) line = 'notReady'
    else if (e && e.ready) line = 'propagating'
    return {
      id: p.id,
      name: p.name,
      short: shortName(p.name),
      ip: p.ip,
      node: p.nodeName,
      namespace: p.namespace,
      app: p.labels.app ?? null,
      version: p.labels.version ?? null,
      tone: versionToneFor(s, p.spec.app.version),
      shape: sv.status,
      status: sv.label,
      inSlice: !!e,
      ready: !!e?.ready,
      serving: !!e?.serving,
      terminating: p.deletion !== null,
      inProxy,
      line,
      hits: h?.hits ?? 0,
      share: h?.share ?? 0,
    }
  }
  const client = s.pods.find((p) => p.name === CLIENT)
  const pods = s.pods
    .filter((p) => p.namespace === svc.namespace && p.name !== CLIENT)
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))
    .map(toStage)
  const staging = s.pods.filter((p) => p.namespace === STAGING_NS).map(toStage)
  const stream = s.traffic.find((x) => x.id === STREAM)
  const targetIp = stream?.targetIp ?? null
  return {
    pods,
    staging,
    client: client?.ip ? { ip: client.ip, node: client.nodeName ?? 'node-1' } : null,
    svc: {
      name: svc.name,
      clusterIP: svc.clusterIP ?? 'None',
      port: svc.port,
      targetPort: svc.targetPort,
      selector: svc.selector,
      type: svc.type,
      nodePort: svc.nodePort,
      lbIP: svc.loadBalancerIP,
      affinity: svc.sessionAffinity,
    },
    proxyIps: proxy.map((e) => e.ip),
    fallback: s.proxy[svc.id].terminatingFallback,
    sliceCount: slice.length,
    readyCount: slice.filter((e) => e.ready).length,
    targetIp,
    targetAlive: targetIp ? s.pods.some((p) => p.ip === targetIp && p.processUp) : false,
    totalHits,
  }
}

/** „app=klopa-api, version=1.4.0” */
export function selectorText(sel: Record<string, string>): string {
  const parts = Object.entries(sel).map(([k, v]) => `${k}=${v}`)
  return parts.length ? parts.join(', ') : '(prazan)'
}

/** A Pod label matches a selector pair? (for colouring the stickers: the engine decides membership) */
export function labelMatches(sel: Record<string, string>, key: string, value: string | null): boolean | null {
  if (!(key in sel)) return null
  return sel[key] === value
}
