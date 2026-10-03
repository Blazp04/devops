/**
 * Services: the EndpointSlice controller (every Pod in the Namespace matching ALL selector pairs, with
 * conditions ready / serving / terminating), kube-proxy (rules on every node lag the slice by the
 * propagation delay and contain the READY endpoints – or, when none is ready, the serving-and-terminating ones:
 * CategorizeEndpoints' fallback, KEP-1669 ProxyTerminatingEndpoints, GA 1.28), backend choice (uniformly random
 * per NEW connection, sessionAffinity ClientIP pins a source IP) and cluster DNS (ClusterIP, headless,
 * StatefulSet Pod names for ready endpoints).
 * E1 (traffic engine) can read getEndpointSlice / getProxyEndpoints; pickEndpoint is an action (it writes the
 * affinity table) and takes its random draw from the caller.
 */
import type { ClusterState, Endpoint, Pod, Service } from './types.ts'
import { controllersUp, isTerminal, logEvent, matches, newId } from './util.ts'

export function createService(
  s: ClusterState,
  o: {
    name: string
    namespace?: string
    selector: Record<string, string>
    type?: Service['type']
    headless?: boolean
    port?: number
    targetPort?: number
    sessionAffinity?: Service['sessionAffinity']
    /** fixed ClusterIP (e.g. 10.96.12.7 from the L14 text); default derived from the creation order */
    clusterIP?: string
    publishNotReadyAddresses?: boolean
  },
): Service {
  const idx = s.services.length + 1
  const svc: Service = {
    id: newId(s, 'svc'),
    name: o.name,
    namespace: o.namespace ?? s.cfg.namespace,
    selector: { ...o.selector },
    type: o.type ?? 'ClusterIP',
    clusterIP: o.headless ? null : (o.clusterIP ?? `10.96.${(idx * 37) % 250}.${(idx * 11) % 250 || 7}`),
    headless: o.headless ?? false,
    port: o.port ?? 80,
    targetPort: o.targetPort ?? 8000,
    sessionAffinity: o.sessionAffinity ?? 'None',
    affinityTimeoutS: 10800,
    nodePort: null,
    loadBalancerIP: null,
    publishNotReadyAddresses: o.publishNotReadyAddresses ?? false,
  }
  s.services.push(svc)
  s.slices[svc.id] = { serviceId: svc.id, endpoints: [], version: 0, updatedAt: s.t }
  s.proxy[svc.id] = { serviceId: svc.id, endpoints: [], terminatingFallback: false, version: 0, appliedAt: s.t, pending: [], affinity: {} }
  return svc
}

export function findService(s: ClusterState, name: string, namespace?: string): Service | undefined {
  return s.services.find((x) => x.name === name && (namespace === undefined || x.namespace === namespace))
}

export function selectedPods(s: ClusterState, svc: Service): Pod[] {
  return s.pods.filter((p) => p.namespace === svc.namespace && matches(svc.selector, p.labels))
}

function computeEndpoints(s: ClusterState, svc: Service): Endpoint[] {
  return selectedPods(s, svc)
    .filter((p) => p.ip !== null && !isTerminal(p))
    .map((p) => ({
      podId: p.id,
      podName: p.name,
      ip: p.ip!,
      nodeName: p.nodeName,
      ready: p.ready.status && p.deletion === null,
      serving: p.ready.status,
      terminating: p.deletion !== null,
    }))
    .sort((a, b) => (a.podName < b.podName ? -1 : a.podName > b.podName ? 1 : 0))
}

function sameEndpoints(a: Endpoint[], b: Endpoint[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (x.podId !== y.podId || x.ready !== y.ready || x.serving !== y.serving || x.terminating !== y.terminating || x.ip !== y.ip) return false
  }
  return true
}

/** EndpointSlice controller (controller-manager) + kube-proxy on the nodes. */
export function endpointsTick(s: ClusterState): void {
  if (controllersUp(s)) {
    for (const svc of s.services) {
      const slice = s.slices[svc.id]
      const eps = computeEndpoints(s, svc)
      if (sameEndpoints(eps, slice.endpoints)) continue
      const beforeReady = slice.endpoints.filter((e) => e.ready).length
      slice.endpoints = eps
      slice.version += 1
      slice.updatedAt = s.t
      const nowReady = eps.filter((e) => e.ready).length
      if (beforeReady > 0 && nowReady === 0) {
        const draining = eps.some((e) => e.serving && e.terminating)
        logEvent(s, 'no-endpoints', `Service ${svc.name}: 0 spremnih endpointa – ${draining ? 'promet ide Podovima u gašenju dok još poslužuju, zatim odbijanje' : 'zahtjevi će biti odbijeni'}`, 'bad', svc.id)
      }
      if (svc.headless) continue
      s.proxy[svc.id].pending.push({ at: s.t + s.cfg.timings.endpointPropagationS, version: slice.version, endpoints: proxyTargets(eps).map((e) => ({ ...e })) })
    }
  }
  // kube-proxy keeps its last rules even when the control plane is down
  for (const svc of s.services) {
    const pr = s.proxy[svc.id]
    while (pr.pending.length && s.t + 1e-9 >= pr.pending[0].at) {
      const u = pr.pending.shift()!
      const fallback = u.endpoints.length > 0 && u.endpoints.every((e) => !e.ready)
      if (fallback && !pr.terminatingFallback) logEvent(s, 'terminating-fallback', `Service ${svc.name}: nijedan endpoint nije spreman – kube-proxy šalje promet Podovima u gašenju koji još poslužuju`, 'warn', svc.id)
      pr.endpoints = u.endpoints
      pr.terminatingFallback = fallback
      pr.version = u.version
      pr.appliedAt = s.t
    }
  }
}

/**
 * kube-proxy's CategorizeEndpoints for cluster traffic: the ready endpoints; if there are none, the endpoints that
 * are serving AND terminating (a draining Pod still answers) – so a Recreate or a single-replica rollout loses
 * traffic only once the old process stops serving.
 */
export function proxyTargets(eps: Endpoint[]): Endpoint[] {
  const ready = eps.filter((e) => e.ready)
  if (ready.length) return ready
  return eps.filter((e) => e.serving && e.terminating)
}

export function getEndpointSlice(s: ClusterState, serviceName: string, namespace?: string): Endpoint[] {
  const svc = findService(s, serviceName, namespace)
  return svc ? s.slices[svc.id].endpoints : []
}

/** Traffic targets as currently programmed by kube-proxy (lagging the slice): ready, or the terminating fallback. */
export function getProxyEndpoints(s: ClusterState, serviceName: string, namespace?: string): Endpoint[] {
  const svc = findService(s, serviceName, namespace)
  return svc ? s.proxy[svc.id].endpoints : []
}

/**
 * ACTION (not a selector): pick a backend for a NEW connection, uniformly at random among kube-proxy's targets
 * (iptables/nftables), and record a ClientIP affinity entry. `u` is the caller's uniform draw in [0, 1);
 * omitted, it is drawn from the cluster RNG – never call it from render code (it would make a run depend on the
 * frame rate).
 */
export function pickEndpoint(s: ClusterState, svc: Service, clientIp?: string | null, u?: number): Endpoint | null {
  const pr = s.proxy[svc.id]
  const eps = pr.endpoints
  if (eps.length === 0) return null
  const draw = () => {
    const x = u ?? s.rng.next()
    return Number.isFinite(x) ? Math.min(Math.max(x, 0), 1 - 1e-12) : 0
  }
  if (svc.sessionAffinity === 'ClientIP' && clientIp) {
    const a = pr.affinity[clientIp]
    if (a && a.until > s.t) {
      const ep = eps.find((e) => e.podId === a.podId)
      if (ep) {
        a.until = s.t + svc.affinityTimeoutS
        return ep
      }
    }
    const ep = eps[Math.floor(draw() * eps.length)]
    pr.affinity[clientIp] = { podId: ep.podId, until: s.t + svc.affinityTimeoutS }
    return ep
  }
  return eps[Math.floor(draw() * eps.length)]
}

/** NodePort range of the API server (--service-node-port-range default). */
export const NODE_PORT_RANGE = [30000, 32767] as const

/**
 * ClusterIP → NodePort → LoadBalancer. NodePort and LoadBalancer get a port on every node; LoadBalancer gets an
 * external address only when a cloud controller (or an add-on like MetalLB) exists – otherwise <pending>.
 */
export function setServiceType(s: ClusterState, svc: Service, type: Service['type']): void {
  svc.type = type
  if (type === 'ClusterIP') {
    svc.nodePort = null
    svc.loadBalancerIP = null
  } else {
    if (svc.nodePort === null) {
      const [lo, hi] = NODE_PORT_RANGE
      let port = lo + (Math.floor(s.rng.next() * (hi - lo + 1)) % (hi - lo + 1))
      while (s.services.some((x) => x !== svc && x.nodePort === port)) port = port >= hi ? lo : port + 1
      svc.nodePort = port
    }
    svc.loadBalancerIP = type === 'LoadBalancer' && s.cfg.cloudLoadBalancer ? `203.0.113.${10 + (s.services.indexOf(svc) % 200)}` : null
  }
  logEvent(s, 'svc-type', `Service ${svc.name}: type ${type}${type === 'LoadBalancer' && !svc.loadBalancerIP ? ' – EXTERNAL-IP <pending> (nema kontrolera oblaka)' : ''}`, type === 'LoadBalancer' && !svc.loadBalancerIP ? 'warn' : 'info', svc.id)
}

export interface PacketHop {
  step: number
  /** Croatian label for the stepper */
  label: string
  src: string
  dst: string
}

/**
 * The path of one request from a client Pod to a Service (L14 packet stepper), with addresses from the live
 * state: DNS → ClusterIP:port → DNAT on the client's own node to a ready Pod → reply un-NATed by conntrack.
 * `endpointIndex` chooses the backend deterministically (the real choice is random per connection).
 */
export function tracePacket(s: ClusterState, fromPodName: string, serviceName: string, endpointIndex = 0): PacketHop[] | null {
  const from = s.pods.find((p) => p.name === fromPodName && p.ip)
  const svc = findService(s, serviceName, from?.namespace)
  if (!from || !svc || svc.headless || !svc.clusterIP) return null
  const eps = s.proxy[svc.id].endpoints
  const fqdn = `${svc.name}.${svc.namespace}.svc.cluster.local`
  const hops: PacketHop[] = [
    { step: 1, label: `DNS: ${svc.name} → ${fqdn} → ${svc.clusterIP}`, src: from.ip!, dst: '10.96.0.10:53' },
    { step: 2, label: `zahtjev na virtualnu adresu Servicea`, src: from.ip!, dst: `${svc.clusterIP}:${svc.port}` },
  ]
  if (eps.length === 0) {
    hops.push({ step: 3, label: 'nema spremnih endpointa – kube-proxy odbija vezu', src: from.ip!, dst: `${svc.clusterIP}:${svc.port}` })
    return hops
  }
  const dnatNote = s.proxy[svc.id].terminatingFallback ? ' (nijedan nije spreman – Pod u gašenju koji još poslužuje)' : ''
  const ep = eps[((Math.floor(endpointIndex) % eps.length) + eps.length) % eps.length]
  hops.push({ step: 3, label: `DNAT na čvoru ${from.nodeName}: odabran Pod ${ep.podName}${dnatNote}`, src: from.ip!, dst: `${ep.ip}:${svc.targetPort}` })
  hops.push({ step: 4, label: 'odgovor: conntrack vraća izvornu adresu Servicea', src: `${svc.clusterIP}:${svc.port}`, dst: from.ip! })
  return hops
}

/**
 * sessionAffinity None / ClientIP (timeoutSeconds default 10800 = 3 h). Changing it clears kube-proxy's affinity
 * table (the rules are rewritten), so existing pins are forgotten.
 */
export function setSessionAffinity(s: ClusterState, svc: Service, mode: Service['sessionAffinity'], timeoutS = 10800): void {
  svc.sessionAffinity = mode
  svc.affinityTimeoutS = Number.isFinite(timeoutS) && timeoutS > 0 ? Math.min(86400, Math.round(timeoutS)) : 10800
  s.proxy[svc.id].affinity = {}
  logEvent(s, 'affinity', `Service ${svc.name}: sessionAffinity ${mode}${mode === 'ClientIP' ? ` (${svc.affinityTimeoutS} s)` : ''}`, 'info', svc.id)
}

export function setServiceSelector(s: ClusterState, svc: Service, selector: Record<string, string>): void {
  svc.selector = { ...selector }
  logEvent(s, 'selector', `Service ${svc.name}: selektor ${Object.entries(selector).map(([k, v]) => `${k}=${v}`).join(', ') || '(prazan)'}`, 'info', svc.id)
}

export interface DnsAnswer {
  name: string
  kind: 'ClusterIP' | 'headless' | 'pod' | 'NXDOMAIN'
  ips: string[]
}

/** Pod DNS config of the cluster (kubelet resolv.conf): search <ns>.svc.cluster.local svc.cluster.local cluster.local, ndots:5. */
export const CLUSTER_DOMAIN = 'cluster.local'
export const NDOTS = 5

/** The candidate names a Pod's resolver tries, in order (search path + ndots, like glibc/musl with the kubelet's resolv.conf). */
export function dnsCandidates(query: string, fromNamespace: string): string[] {
  const absolute = query.endsWith('.')
  const q = query.replace(/\.+$/, '')
  if (!q) return []
  if (absolute) return [q]
  const search = [`${fromNamespace}.svc.${CLUSTER_DOMAIN}`, `svc.${CLUSTER_DOMAIN}`, CLUSTER_DOMAIN].map((d) => `${q}.${d}`)
  const dots = (q.match(/\./g) ?? []).length
  return dots >= NDOTS ? [q, ...search] : [...search, q]
}

/** Records of one fully qualified name (no search path): a Service, a headless Service or a Pod hostname record. */
function lookupFqdn(s: ClusterState, fqdn: string): DnsAnswer | null {
  const suffix = `.svc.${CLUSTER_DOMAIN}`
  if (!fqdn.endsWith(suffix)) return null
  const parts = fqdn.slice(0, -suffix.length).split('.')
  if (parts.some((x) => x === '')) return null
  if (parts.length === 2) {
    const [name, ns] = parts
    const svc = findService(s, name, ns)
    if (!svc) return null
    if (!svc.headless) return { name: fqdn, kind: 'ClusterIP', ips: [svc.clusterIP!] }
    return { name: fqdn, kind: 'headless', ips: s.slices[svc.id].endpoints.filter((e) => e.ready || svc.publishNotReadyAddresses).map((e) => e.ip) }
  }
  if (parts.length === 3) {
    // <hostname>.<subdomain = headless Service>.<ns>: StatefulSet Pods get hostname = Pod name, subdomain = serviceName
    const [podName, svcName, ns] = parts
    const svc = findService(s, svcName, ns)
    const pod = s.pods.find((p) => p.name === podName && p.namespace === ns && p.ip)
    const sts = s.statefulSets.find((x) => x.serviceName === svcName && x.namespace === ns)
    if (!svc || !svc.headless || !pod || !sts || pod.owner?.id !== sts.id) return null
    const ep = s.slices[svc.id].endpoints.find((e) => e.podId === pod.id)
    if (!ep || !(ep.ready || svc.publishNotReadyAddresses)) return null
    return { name: fqdn, kind: 'pod', ips: [ep.ip] }
  }
  return null
}

/**
 * Cluster DNS (CoreDNS) as a Pod in `fromNamespace` sees it: the resolver walks the search path
 * (<ns>.svc.cluster.local, svc.cluster.local, cluster.local; ndots:5), so `klopa-api`, `klopa-api.klopa`,
 * `db-1.db` and `db-1.db.klopa.svc` all resolve from inside the Namespace, while a short name of another Namespace
 * does not. Headless Services return ready Pod IPs; db-1.db.klopa.svc.cluster.local returns that StatefulSet Pod's IP
 * only while its endpoint is READY (DNS spec: records for ready endpoints with a hostname; not-ready ones only with
 * publishNotReadyAddresses) – a dead db-1 is NXDOMAIN, not a stale address.
 */
export function resolveDns(s: ClusterState, query: string, fromNamespace = s.cfg.namespace): DnsAnswer {
  const candidates = dnsCandidates(query, fromNamespace)
  for (const c of candidates) {
    const a = lookupFqdn(s, c)
    if (a) return a
  }
  return { name: candidates[0] ?? query, kind: 'NXDOMAIN', ips: [] }
}
