/** Pod status colours/labels shared by PodShape and lecture UIs. */
export type PodStatus = 'running' | 'pending' | 'creating' | 'terminating' | 'crash' | 'oom' | 'notready' | 'completed' | 'imagepull'

export const POD_STATUS: Record<PodStatus, { color: string; label: string }> = {
  running: { color: 'var(--ok)', label: 'Running' },
  pending: { color: 'var(--warn)', label: 'Pending' },
  creating: { color: 'var(--cyan)', label: 'ContainerCreating' },
  terminating: { color: 'var(--idle)', label: 'Terminating' },
  crash: { color: 'var(--bad)', label: 'CrashLoopBackOff' },
  oom: { color: 'var(--bad)', label: 'OOMKilled' },
  notready: { color: 'var(--warn)', label: 'Running (nije spreman)' },
  completed: { color: 'var(--idle)', label: 'Completed' },
  /** the image could not be pulled (ErrImagePull / ImagePullBackOff): an empty lunchbox, its image crossed out */
  imagepull: { color: 'var(--warn)', label: 'ImagePullBackOff' },
}

export function podStatusLabel(s: PodStatus): string {
  return POD_STATUS[s].label
}

/** Kubernetes object kinds the kit can draw (K8sIcon). */
export type K8sKind =
  | 'pod'
  | 'deploy'
  | 'rs'
  | 'svc'
  | 'node'
  | 'ns'
  | 'secret'
  | 'cm'
  | 'pv'
  | 'pvc'
  | 'sc'
  | 'ing'
  | 'gw'
  | 'route'
  | 'hpa'
  | 'job'
  | 'cronjob'
  | 'sts'
  | 'ds'
  | 'api'
  | 'etcd'
  | 'sched'
  | 'cm-ctrl'
  | 'kubelet'
  | 'proxy'
  | 'user'
  | 'argo'

export const K8S_KINDS: K8sKind[] = [
  'pod',
  'deploy',
  'rs',
  'svc',
  'node',
  'ns',
  'secret',
  'cm',
  'pv',
  'pvc',
  'sc',
  'ing',
  'gw',
  'route',
  'hpa',
  'job',
  'cronjob',
  'sts',
  'ds',
  'api',
  'etcd',
  'sched',
  'cm-ctrl',
  'kubelet',
  'proxy',
  'user',
  'argo',
]

/** The short kind label written under every K8sIcon (kubectl short names). */
export const KIND_LABEL: Record<K8sKind, string> = {
  pod: 'pod',
  deploy: 'deploy',
  rs: 'rs',
  svc: 'svc',
  node: 'node',
  ns: 'ns',
  secret: 'secret',
  cm: 'cm',
  pv: 'pv',
  pvc: 'pvc',
  sc: 'sc',
  ing: 'ing',
  gw: 'gw',
  route: 'route',
  hpa: 'hpa',
  job: 'job',
  cronjob: 'cronjob',
  sts: 'sts',
  ds: 'ds',
  api: 'api',
  etcd: 'etcd',
  sched: 'sched',
  'cm-ctrl': 'c-m',
  kubelet: 'kubelet',
  proxy: 'k-proxy',
  user: 'user',
  argo: 'argo',
}

/** Pod "version tint" (PodShape `tone`): marker hatching, tape and hatch direction. v1 = blue −41°, v2 = green +41°. */
export type PodTone = 'blue' | 'violet' | 'teal' | 'amber' | 'rose' | 'green'

export const POD_TONE: Record<PodTone, { tint: string; tape: string; angle: number }> = {
  blue: { tint: 'var(--hl-blue-ink)', tape: 'var(--tape-v1)', angle: -41 },
  green: { tint: 'var(--hl-green-ink)', tape: 'var(--tape-v2)', angle: 41 },
  violet: { tint: 'var(--hl-lilac-ink)', tape: 'var(--note-lilac)', angle: 41 },
  teal: { tint: 'var(--teal)', tape: 'var(--note-green)', angle: -41 },
  amber: { tint: 'var(--hl-yellow-ink)', tape: 'var(--note-yellow)', angle: -41 },
  rose: { tint: 'var(--hl-pink-ink)', tape: 'var(--note-pink)', angle: 41 },
}
