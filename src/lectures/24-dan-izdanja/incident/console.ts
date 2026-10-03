/**
 * The simulated console of „Incident u 12:00”. Read commands answer from the engines in real kubectl / argocd formats
 * (E3 for klopa-api, E2 for klopa-worker, E6 for Argo CD and Git). Write commands are the manual path: they change
 * fields that are in Git (drift in E6, which selfHeal puts back) or, like `rollout restart`, something Git does not hold.
 */
import * as G from '../../../engines/gitops/index.ts'
import * as K from '../../../engines/cluster/index.ts'
import * as Q from '../../../engines/queue/index.ts'
import { API, WORKER, apiPods, argoSync, gitField, log, manualChange, manualRestart, memMi, type IncidentState } from './model.ts'

/** Config-repo file of each object the console can change by hand. */
const FILE_OF: Record<string, string> = {
  [`Deployment/${API}`]: G.FILES.deployment,
  [`Service/${API}`]: G.FILES.service,
  [`HorizontalPodAutoscaler/${API}`]: G.FILES.hpa,
  [`Deployment/${WORKER}`]: G.FILES.workerDeployment,
}

/** Commands offered as chips (the input accepts any of them, plus pod names). */
export const READ_CHIPS = [
  'kubectl get pods',
  'kubectl get endpointslices',
  'kubectl get events',
  'kubectl get hpa',
  'kubectl get deploy',
  'argocd app get klopa',
  'argocd app diff klopa',
  'git log',
]

/** Manual changes of fields that live in Git: selfHeal puts them back. */
export const MANUAL_CHIPS = [
  'kubectl set image deploy/klopa-api klopa-api=registry.klopa.example/klopa-api:2.0.2',
  `kubectl patch svc klopa-api -p '{"spec":{"selector":{"app":"klopa-api"}}}'`,
  `kubectl patch hpa klopa-api -p '{"spec":{"maxReplicas":10}}'`,
  'kubectl scale deploy/klopa-worker --replicas=2',
]

/** Manual, and Git holds nothing it could put back (the restartedAt annotation is not in the manifest). */
export const NO_TRACE_CHIPS = ['kubectl rollout restart deploy/klopa-api']

/** The GitOps path from the console: apply what is in Git. */
export const ARGO_CHIPS = ['argocd app sync klopa']

function age(sec: number): string {
  if (sec < 120) return `${Math.max(0, Math.round(sec))}s`
  if (sec < 7200) return `${Math.round(sec / 60)}m`
  return `${Math.round(sec / 3600)}h`
}

/** Re-align rows split on 2+ spaces into padded columns (keeps kubectl's table look). */
function table(rows: string[][]): string[] {
  const w: number[] = []
  for (const r of rows) r.forEach((c, i) => (w[i] = Math.max(w[i] ?? 0, c.length)))
  return rows.map((r) => r.map((c, i) => (i === r.length - 1 ? c : c.padEnd(w[i] + 3))).join('').trimEnd())
}

function split(lines: string[]): string[][] {
  return lines.filter((l) => l.trim()).map((l) => l.trim().split(/\s{2,}/))
}

function workerPods(s: IncidentState) {
  return Q.podViews(s.q, { namePrefix: WORKER })
}

function getPods(s: IncidentState): string[] {
  const r = K.kubectlRun(s.k8s, 'get pods')
  if (!r.ok) return r.lines
  const rows = split(r.lines)
  for (const p of workerPods(s)) {
    const last = p.lastRestartAgoS !== null && p.restarts > 0 ? `${p.restarts} (${age(p.lastRestartAgoS)} ago)` : String(p.restarts)
    rows.push([p.name, p.ready, p.status, last, age(p.ageS)])
  }
  return table(rows)
}

function getDeploy(s: IncidentState): string[] {
  const r = K.kubectlRun(s.k8s, 'get deploy')
  if (!r.ok) return r.lines
  const rows = split(r.lines)
  const pv = workerPods(s).filter((p) => p.status !== 'Terminating')
  const ready = pv.filter((p) => p.ready === '1/1').length
  rows.push([WORKER, `${ready}/${s.applied.workerReplicas}`, String(s.applied.workerReplicas), String(ready), '61m'])
  return table(rows)
}

function getEvents(s: IncidentState): string[] {
  const r = K.kubectlRun(s.k8s, 'get events')
  const rows = r.ok ? split(r.lines) : [['LAST SEEN', 'TYPE', 'REASON', 'OBJECT', 'MESSAGE']]
  const now = s.q.t
  const qe = Q.kubeEvents(s.q, { sinceS: Math.max(0, now - 120) }).slice(-8)
  for (const e of qe) rows.push([age(now - e.t), e.type, e.reason, e.object, e.count > 1 ? `${e.message} (x${e.count})` : e.message])
  const head = rows.shift() ?? []
  return table([head, ...rows.slice(-16)])
}

function describeWorker(s: IncidentState, name: string): string[] | null {
  const p = workerPods(s).find((x) => x.name === name)
  if (!p) return null
  const lt = p.lastTermination
  const out = [
    `Name:             ${p.name}`,
    `Namespace:        klopa`,
    `Labels:           app=${WORKER}`,
    `Status:           Running`,
    `Controlled By:    ReplicaSet/${p.replicaSet}`,
    `Containers:`,
    `  ${WORKER}:`,
    `    Image:          registry.klopa.example/klopa-worker:1.3.2`,
    `    State:          ${p.status === 'CrashLoopBackOff' ? 'Waiting\n      Reason:       CrashLoopBackOff' : p.status === 'Running' ? 'Running' : p.status}`,
  ]
  if (lt) out.push(`    Last State:     Terminated`, `      Reason:       ${lt.reason}`, `      Exit Code:    ${lt.exitCode}`)
  out.push(
    `    Ready:          ${p.ready === '1/1' ? 'True' : 'False'}`,
    `    Restart Count:  ${p.restarts}`,
    `    Limits:`,
    `      memory:  ${s.applied.workerMem}`,
    `    Requests:`,
    `      cpu:     100m`,
    `      memory:  ${memMi(s.applied.workerMem) < 128 ? s.applied.workerMem : '128Mi'}`,
  )
  const ev = Q.kubeEvents(s.q).filter((e) => e.object === `pod/${name}`).slice(-4)
  out.push('Events:')
  if (!ev.length) out.push('  <none>')
  for (const e of ev) out.push(`  ${e.type.padEnd(8)} ${e.reason.padEnd(10)} ${age(s.q.t - e.t).padEnd(5)} ${e.message}`)
  return out.flatMap((l) => l.split('\n'))
}

function logsWorker(s: IncidentState, name: string): string[] | null {
  if (!workerPods(s).some((p) => p.name === name)) return null
  const lines = Q.workerLogs(s.q, { pod: name, limit: 10 })
  if (!lines.length) return ['(prazno)']
  return lines.map((l) => `${l.level.padEnd(5)} ${l.traceId ? `trace=${l.traceId.slice(0, 8)} ` : ''}${l.text}`)
}

function gitLog(s: IncidentState): string[] {
  return G.commitGraph(s.git, 8).map((c) => `${c.short}  ${c.message}  (${c.author}${c.isDeployed ? ', u klasteru' : ''})`)
}

const HELP = [
  '# čitanje: kubectl get pods | deploy | endpointslices | events | hpa | svc',
  '#          kubectl describe pod <ime> · kubectl logs <ime> [--previous]',
  '#          argocd app get klopa · argocd app diff klopa · git log',
  '# ručne promjene: set image / patch / scale (selfHeal ih vraća); rollout restart ostaje, ali bez traga u Gitu',
  '# Argo CD: argocd app sync klopa (primijeni stanje iz Gita)',
]

function patchJson(raw: string): Record<string, unknown> | null {
  const i = raw.indexOf('{')
  if (i < 0) return null
  try {
    const v: unknown = JSON.parse(raw.slice(i).replace(/^'|'$/g, ''))
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Run one command: echo it and its output into the console log. Returns the lines written. */
export function runCommand(s: IncidentState, input: string): void {
  const raw = input.trim().replace(/\s+/g, ' ')
  if (!raw) return
  log(s, 'cmd', raw)
  const out = (lines: string[], kind: 'out' | 'err' = 'out') => lines.forEach((l) => log(s, kind, l))
  const note = (t: string) => log(s, 'note', t)
  const cmd = raw.replace(/ -n klopa\b/, '').replace(/ --namespace[ =]klopa\b/, '')
  /** apply a manual change; true = done (output printed by the caller), false = refused */
  const manual = (kind: G.Kind, name: string, path: string, value: G.FieldValue, okLine: string, hint: string): boolean => {
    const r = manualChange(s, kind, name, path, value)
    if (r === 'unchanged') {
      out([`${okLine.split(' ')[0]} (no change)`])
      note('# Klaster već ima tu vrijednost – ništa se nije promijenilo.')
      return true
    }
    if (!r) return false
    out([okLine])
    const file = FILE_OF[`${kind}/${name}`]
    const inGit = file ? gitField(s, file, path) : null
    if (inGit !== null && inGit === String(value)) note('# Klaster sada odgovara Gitu, ali popravak je ručni: u povijesti Gita nema traga.')
    else if (!s.git.argo.policy.selfHeal) note('# selfHeal je isključen: ručna promjena ostaje, ali u Gitu nema traga.')
    else note(hint)
    return true
  }
  const DRIFT = '# Ručna promjena: Argo CD je vidi kao odstupanje od Gita, a selfHeal je vraća.'
  let m: RegExpExecArray | null
  if (cmd === 'help' || cmd === 'pomoć' || cmd === 'pomoc') return out(HELP)
  if (/^kubectl get (pods?|po)( -o wide)?$/.test(cmd)) return out(getPods(s))
  if (/^kubectl get (deploy|deployments?)$/.test(cmd)) return out(getDeploy(s))
  if (/^kubectl get (events|ev)$/.test(cmd)) return out(getEvents(s))
  if (/^kubectl get (endpointslices?|hpa|svc|services?|rs|replicasets?|nodes?)$/.test(cmd)) {
    const what = cmd.split(' ')[2].replace(/^services?$/, 'svc').replace(/^replicasets?$/, 'rs').replace(/^endpointslice$/, 'endpointslices').replace(/^node$/, 'nodes')
    const r = K.kubectlRun(s.k8s, `get ${what}`)
    return out(r.lines, r.ok ? 'out' : 'err')
  }
  if ((m = /^kubectl describe (?:pods? |po )?(?:pod\/)?(\S+)$/.exec(cmd))) {
    const name = m[1]
    const w = describeWorker(s, name)
    if (w) return out(w)
    const r = K.kubectlRun(s.k8s, `describe pod ${name}`)
    return out(r.lines, r.ok ? 'out' : 'err')
  }
  if ((m = /^kubectl logs (?:pod\/)?(\S+)( --previous| -p)?$/.exec(cmd))) {
    const name = m[1]
    const w = logsWorker(s, name)
    if (w) return out(w)
    const r = K.kubectlRun(s.k8s, `logs ${name}${m[2] ? ' --previous' : ''} --tail=10`)
    return out(r.lines.length ? r.lines : ['(prazno)'], r.ok ? 'out' : 'err')
  }
  if (cmd === 'argocd app get klopa') return out(G.argocdAppGet(s.git).filter((l) => l.trim() !== ''))
  if (cmd === 'argocd app diff klopa') {
    const d = G.argocdAppDiff(s.git)
    return out(d.length ? d : ['(nema razlike: klaster odgovara Gitu)'])
  }
  if (cmd === 'argocd app sync klopa') return note(`# ${argoSync(s)}`)
  if (cmd === 'git log' || cmd === 'git log --oneline') return out(gitLog(s))
  // ── manual changes: they work for a moment, then selfHeal restores Git ──
  if ((m = /^kubectl set image (?:deploy(?:ment)?\/|deploy(?:ment)? )klopa-api klopa-api=(\S+)$/.exec(cmd))) {
    if (manual('Deployment', API, G.PATHS.image, m[1], 'deployment.apps/klopa-api image updated', DRIFT)) return
    return out(['error: neispravna referenca slike'], 'err')
  }
  if (/^kubectl patch (?:svc|service) klopa-api /.test(cmd)) {
    const p = patchJson(cmd) as { spec?: { selector?: { app?: unknown } } } | null
    const app = p?.spec?.selector?.app
    if (typeof app === 'string' && manual('Service', API, G.PATHS.serviceSelector, app, 'service/klopa-api patched', DRIFT)) return
    return out(['error: očekujem -p {"spec":{"selector":{"app":"…"}}}'], 'err')
  }
  if (/^kubectl patch hpa klopa-api /.test(cmd)) {
    const p = patchJson(cmd) as { spec?: { maxReplicas?: unknown } } | null
    const n = p?.spec?.maxReplicas
    if (typeof n === 'number' && Number.isInteger(n) && n > 0 && manual('HorizontalPodAutoscaler', API, G.PATHS.hpaMax, n, 'horizontalpodautoscaler.autoscaling/klopa-api patched', DRIFT)) return
    return out(['error: očekujem -p {"spec":{"maxReplicas":N}}'], 'err')
  }
  if ((m = /^kubectl scale (?:deploy(?:ment)?\/|deploy(?:ment)? )(klopa-worker|klopa-api) --replicas[= ](\d+)$/.exec(cmd))) {
    const n = Number(m[2])
    if (manual('Deployment', m[1], G.PATHS.replicas, n, `deployment.apps/${m[1]} scaled`, m[1] === API ? '# Broj Podova klopa-api vodi HPA; ova ručna promjena ne traje.' : DRIFT)) return
    return out(['error: neispravan broj replika'], 'err')
  }
  if (/^kubectl rollout restart (?:deploy(?:ment)?\/|deploy(?:ment)? )klopa-api$/.test(cmd)) {
    if (manualRestart(s)) {
      out(['deployment.apps/klopa-api restarted'])
      return note('# Radi, ali u Gitu ne ostaje trag. GitOps put: commit anotacije restartedAt.')
    }
    return out(['error: rollout restart nije uspio'], 'err')
  }
  if (/^kubectl (edit|delete|apply)\b/.test(cmd)) return out(['error: u ovoj konzoli nema uređivača; upotrijebite kubectl patch ili, bolje, commit u Git'], 'err')
  out([`error: nepoznata naredba „${raw}”`, 'upišite help za popis naredbi'], 'err')
}

/** Pod names for the describe / logs chips: one sick api Pod (or the first one) and one worker Pod. */
export function podChips(s: IncidentState): string[] {
  const api = apiPods(s)
  const sick = api.find((p) => !K.isReady(p) && !p.deletion) ?? api.find((p) => p.container.restartCount > 0) ?? api[0]
  const w = workerPods(s)
  const wsick = w.find((p) => p.ready !== '1/1') ?? w[0]
  const out: string[] = []
  if (sick) out.push(`kubectl describe pod ${sick.name}`, `kubectl logs ${sick.name}`)
  if (sick && sick.container.restartCount > 0) out.push(`kubectl logs ${sick.name} --previous`)
  if (wsick) out.push(`kubectl describe pod ${wsick.name}`, `kubectl logs ${wsick.name}`)
  return out
}
