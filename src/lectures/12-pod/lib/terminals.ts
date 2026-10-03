/** Terminal sessions on Lana's laptop (outputs as the E3 engine prints them for the same scenarios). */
import type { TerminalLine } from '../../../kit'

/** behaviour „ruši se pri pokretanju” (exit 1 after 2 s), no probes – kubectl get pods -w */
export const WATCH_LINES: TerminalLine[] = [
  { cmd: 'kubectl get pods -w' },
  {
    out: [
      'NAME          READY   STATUS              RESTARTS      AGE',
      'klopa-api-1   0/1     Pending             0             0s',
      'klopa-api-1   0/1     ContainerCreating   0             0s',
      'klopa-api-1   1/1     Running             0             1s',
      'klopa-api-1   0/1     Error               0             3s',
      'klopa-api-1   1/1     Running             1 (1s ago)    4s',
      'klopa-api-1   0/1     Error               1 (0s ago)    6s',
      'klopa-api-1   0/1     CrashLoopBackOff    1 (1s ago)    7s',
      'klopa-api-1   1/1     Running             2 (10s ago)   16s',
      'klopa-api-1   0/1     CrashLoopBackOff    2 (1s ago)    19s',
      'klopa-api-1   1/1     Running             3 (20s ago)   38s',
    ].join('\n'),
    note: 'Running → Error → CrashLoopBackOff, a pauza raste: 10 s, pa 20 s',
    who: 'davor',
  },
]

/** the incident (slow start + liveness, no startup probe) after 150 s – describe + logs --previous */
export const DIAG_LINES: TerminalLine[] = [
  { cmd: 'kubectl describe pod klopa-api-1' },
  {
    out: [
      'Status:           Running',
      'Containers:',
      '  klopa-api:',
      '    State:          Waiting',
      '      Reason:       CrashLoopBackOff',
      '    Last State:     Terminated',
      '      Reason:       Error',
      '      Exit Code:    143',
      '    Ready:          False',
      '    Restart Count:  3',
      '    Liveness:       http-get http://:8000/healthz delay=0s timeout=1s period=10s #success=1 #failure=3',
    ].join('\n'),
    note: 'Exit Code 143 = SIGTERM: nije se srušio sam, ugasio ga je kubelet',
  },
  {
    out: [
      'Events:',
      '  Warning  Unhealthy  23s (x12 over 2m28s)  kubelet  Liveness probe failed: Get "http://10.244.1.2:8000/healthz": dial tcp 10.244.1.2:8000: connect: connection refused',
      '  Normal   Killing    23s (x4 over 2m8s)    kubelet  Container klopa-api failed liveness probe, will be restarted',
      '  Warning  BackOff    18s (x3 over 98s)     kubelet  Back-off restarting failed container klopa-api in pod klopa-api-1',
    ].join('\n'),
    tone: 'muted',
  },
  { cmd: 'kubectl logs klopa-api-1 --previous' },
  { out: 'INFO  starting klopa-api 1.3.2 (pid 1)\nINFO  loading menu cache …', note: 'Prethodni kontejner nije ni stigao napuniti predmemoriju.', who: 'lana' },
]

/** scene 6: the bare klopa-worker Pod */
export const WORKER_LINES: TerminalLine[] = [
  { cmd: 'kubectl get pods -o wide' },
  {
    out: [
      'NAME           READY   STATUS    RESTARTS     AGE   IP           NODE',
      'klopa-api-1    1/1     Running   0            3h    10.244.1.2   node-1',
      'klopa-worker   1/1     Running   1 (2h ago)   3h    10.244.1.9   node-1',
    ].join('\n'),
  },
  { cmd: 'kubectl delete pod klopa-worker' },
  { out: 'pod "klopa-worker" deleted' },
  { cmd: 'kubectl get pods' },
  { out: 'NAME          READY   STATUS    RESTARTS   AGE\nklopa-api-1   1/1     Running   0          3h', note: 'klopa-worker se nije vratio. Ni nakon pet minuta.', who: 'lana' },
  { cmd: 'kubectl apply -f klopa-worker.yaml' },
  { out: 'pod/klopa-worker created' },
  { cmd: 'kubectl get pods -o wide' },
  {
    out: [
      'NAME           READY   STATUS    RESTARTS   AGE   IP           NODE',
      'klopa-api-1    1/1     Running   0          3h    10.244.1.2   node-1',
      'klopa-worker   1/1     Running   0          8s    10.244.3.4   node-3',
    ].join('\n'),
  },
]
