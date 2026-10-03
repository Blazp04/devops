/** Static kubectl output for the Namespace scene (a kind cluster „menza” with one control-plane node and 3 workers). */
import type { TerminalLine } from '../../../kit'

export type NsChoice = 'klopa' | 'klopa-staging' | 'kube-system' | 'all'

const HEAD = 'NAME                                          READY   STATUS    RESTARTS   AGE'

const KUBE_SYSTEM = [
  'coredns-6f6b679f8f-4k7mz                      1/1     Running   0          45m',
  'coredns-6f6b679f8f-9vq2p                      1/1     Running   0          45m',
  'etcd-menza-control-plane                      1/1     Running   0          45m',
  'kindnet-5xk2w                                 1/1     Running   0          45m',
  'kindnet-8hj4d                                 1/1     Running   0          45m',
  'kindnet-c2l9q                                 1/1     Running   0          45m',
  'kindnet-wq7tn                                 1/1     Running   0          45m',
  'kube-apiserver-menza-control-plane            1/1     Running   0          45m',
  'kube-controller-manager-menza-control-plane   1/1     Running   0          45m',
  'kube-proxy-2n8fd                              1/1     Running   0          45m',
  'kube-proxy-7tq4m                              1/1     Running   0          45m',
  'kube-proxy-g5r2x                              1/1     Running   0          45m',
  'kube-proxy-zk9vb                              1/1     Running   0          45m',
  'kube-scheduler-menza-control-plane            1/1     Running   0          45m',
]

export const NS_OUTPUT: Record<NsChoice, TerminalLine[]> = {
  klopa: [
    { cmd: 'kubectl get pods -n klopa' },
    { out: 'NAME           READY   STATUS    RESTARTS   AGE' },
    { out: 'klopa-api      1/1     Running   0          2m' },
    { out: 'klopa-worker   1/1     Running   0          2m' },
  ],
  'klopa-staging': [
    { cmd: 'kubectl get pods -n klopa-staging' },
    { out: 'NAME           READY   STATUS    RESTARTS   AGE' },
    { out: 'klopa-api      1/1     Running   0          40m' },
    { out: 'klopa-worker   1/1     Running   0          40m', note: 'ista imena kao u klopa – bez sukoba', who: 'iva' },
  ],
  'kube-system': [
    { cmd: 'kubectl get pods -n kube-system' },
    { out: HEAD },
    ...KUBE_SYSTEM.map((out) => ({ out })),
    { comment: 'upravljačka ravnina kind klastera i sama radi u kontejnerima (statički Podovi na čvoru menza-control-plane)' },
  ],
  all: [
    { cmd: 'kubectl get pods -A' },
    { out: 'NAMESPACE       NAME                       READY   STATUS    RESTARTS   AGE' },
    { out: 'klopa           klopa-api                  1/1     Running   0          2m' },
    { out: 'klopa           klopa-worker               1/1     Running   0          2m' },
    { out: 'klopa-staging   klopa-api                  1/1     Running   0          40m' },
    { out: 'klopa-staging   klopa-worker               1/1     Running   0          40m' },
    { out: 'kube-system     coredns-6f6b679f8f-4k7mz   1/1     Running   0          45m' },
    { out: 'kube-system     etcd-menza-control-plane   1/1     Running   0          45m' },
    { comment: '… i još 13 Podova u kube-system i local-path-storage' },
  ],
}
