import type { DoodleKind } from '../kit'

/**
 * The back pages of the notebook: every glossary term gets a small doodle from the illustration grammar, and the
 * terms that have a picture in the menza story get it in red handwriting ("= redar na ulazu").
 * A lecture's own glossary.ts can set `menza` on an entry; course entries take their picture from here.
 */
export interface GlossaryArt {
  doodle: DoodleKind
  menza?: string
}

export const GLOSSARY_ART: Record<string, GlossaryArt> = {
  dns: { doodle: 'dns', menza: 'imenik: ime → broj' },
  latency: { doodle: 'clock', menza: 'koliko se čeka pladanj' },
  throughput: { doodle: 'queue', menza: 'pladnjeva u sekundi' },
  percentile: { doodle: 'p95', menza: '95 % brže od ovoga' },
  'vertical-scaling': { doodle: 'server', menza: 'veći pult' },
  'horizontal-scaling': { doodle: 'scale', menza: 'više pultova' },
  'single-point-of-failure': { doodle: 'spof', menza: 'jedan pult za sve' },
  availability: { doodle: 'clock' },
  'distributed-system': { doodle: 'scale' },
  'load-balancer': { doodle: 'lb', menza: 'redar na ulazu' },
  'round-robin': { doodle: 'lb', menza: 'svaki sljedeći pult redom' },
  'weighted-round-robin': { doodle: 'lb', menza: 'veći pult dobiva više' },
  'least-connections': { doodle: 'lb', menza: 'pult s najkraćim redom' },
  'l4-and-l7-load-balancing': { doodle: 'lb' },
  'health-check': { doodle: 'hc', menza: 'kuc-kuc, jesi živ?' },
  'stateless-service': { doodle: 'server' },
  'message-queue': { doodle: 'queue', menza: 'listići s narudžbama na šanku' },
  'at-least-once-delivery': { doodle: 'queue' },
  idempotency: { doodle: 'queue' },
  'dead-letter-queue': { doodle: 'err' },
  'virtual-machine': { doodle: 'node' },
  kernel: { doodle: 'node' },
  container: { doodle: 'box', menza: 'kutijica s hranom' },
  'linux-namespace': { doodle: 'box' },
  cgroup: { doodle: 'gauge' },
  containerization: { doodle: 'box' },
  'container-image': { doodle: 'layers', menza: 'naslagani pladnjevi' },
  registry: { doodle: 'registry', menza: 'smočnica s kutijama' },
  tag: { doodle: 'tag' },
  digest: { doodle: 'tag' },
  'container-runtime': { doodle: 'box' },
  volume: { doodle: 'db' },
  'docker-compose': { doodle: 'config' },
  'desired-state': { doodle: 'config', menza: 'crtež u bilježnici' },
  'reconciliation-loop': { doodle: 'loop', menza: 'usporedi crtež i stvarnost' },
  node: { doodle: 'node', menza: 'zgrada menze' },
  'control-plane': { doodle: 'helm', menza: 'uprava s kormilom' },
  'api-server': { doodle: 'helm' },
  etcd: { doodle: 'db', menza: 'knjiga narudžbi uprave' },
  scheduler: { doodle: 'sched', menza: 'traži slobodno mjesto' },
  kubelet: { doodle: 'hc' },
  namespace: { doodle: 'node' },
  pending: { doodle: 'sched' },
  pod: { doodle: 'pod', menza: 'kutija za ručak' },
  label: { doodle: 'tag', menza: 'naljepnica na kutiji' },
  crashloopbackoff: { doodle: 'crash', menza: 'pada, pa čeka sve dulje' },
  'liveness-probe': { doodle: 'hc', menza: 'je li kuhar budan?' },
  'readiness-probe': { doodle: 'hc', menza: 'je li pult spreman?' },
  replicaset: { doodle: 'scale' },
  deployment: { doodle: 'config' },
  'rolling-update': { doodle: 'layers' },
  rollback: { doodle: 'loop' },
  deploy: { doodle: 'pipeline' },
  service: { doodle: 'svc', menza: 'etiketa s adresom' },
  endpointslice: { doodle: 'svc' },
  'gateway-api': { doodle: 'lb' },
  ingress: { doodle: 'lb' },
  configmap: { doodle: 'config' },
  secret: { doodle: 'secret', menza: 'omotnica s voštanim pečatom' },
  base64: { doodle: 'secret', menza: 'omotnica bez pečata' },
  'encryption-at-rest': { doodle: 'secret' },
  rbac: { doodle: 'secret' },
  'resource-requests': { doodle: 'gauge' },
  'resource-limits': { doodle: 'gauge' },
  oomkilled: { doodle: 'crash' },
  horizontalpodautoscaler: { doodle: 'scale' },
  'cluster-autoscaler': { doodle: 'node' },
  persistentvolume: { doodle: 'db' },
  persistentvolumeclaim: { doodle: 'db' },
  statefulset: { doodle: 'db' },
  release: { doodle: 'tag' },
  'blue-green-deployment': { doodle: 'scale' },
  'canary-release': { doodle: 'eye' },
  helm: { doodle: 'layers' },
  'continuous-integration': { doodle: 'pipeline' },
  'continuous-delivery': { doodle: 'pipeline' },
  'continuous-deployment': { doodle: 'pipeline' },
  pipeline: { doodle: 'pipeline', menza: 'kućice na traci' },
  gitops: { doodle: 'loop', menza: 'bilježnica je izvor istine' },
  'argo-cd': { doodle: 'loop', menza: 'ravnatelj s povećalom' },
  drift: { doodle: 'eye', menza: 'crtež ≠ stvarnost' },
  'sealed-secrets': { doodle: 'secret' },
  'external-secrets-operator': { doodle: 'secret' },
  observability: { doodle: 'eye' },
}

/** Fallback doodle for terms without an entry (lecture glossaries): pick by a few keywords. */
export function artFor(id: string): GlossaryArt {
  const hit = GLOSSARY_ART[id]
  if (hit) return hit
  if (/balanc|robin|conn/.test(id)) return { doodle: 'lb' }
  if (/health|probe|check/.test(id)) return { doodle: 'hc' }
  if (/latenc|time|p9|percent/.test(id)) return { doodle: 'p95' }
  if (/queue|kafka|rabbit|message/.test(id)) return { doodle: 'queue' }
  if (/image|layer/.test(id)) return { doodle: 'layers' }
  if (/secret|crypt|auth|rbac/.test(id)) return { doodle: 'secret' }
  if (/git|commit|branch/.test(id)) return { doodle: 'git' }
  if (/pipeline|ci|cd|build/.test(id)) return { doodle: 'pipeline' }
  if (/volume|stor|db|data/.test(id)) return { doodle: 'db' }
  if (/pod/.test(id)) return { doodle: 'pod' }
  if (/node|cluster/.test(id)) return { doodle: 'node' }
  return { doodle: 'box' }
}
