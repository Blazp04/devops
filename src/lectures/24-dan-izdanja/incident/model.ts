/**
 * L24 „Incident u 12:00” – a thin adapter that runs three shared engines side by side:
 *   E6 Git↔klaster (src/engines/gitops)  – the whole Klopa config repo (`PRESETS.l24Full`), Argo CD sync / health /
 *                                          selfHeal; the ONLY way to change the cluster's desired state is a commit.
 *   E3 Klaster (src/engines/cluster)     – klopa-api: Pods, probes, rollouts, Service + EndpointSlice, HPA, Gateway
 *                                          route, traffic (discrete requests for errors/users + a fluid stream for CPU
 *                                          and p95, as in L18), Secrets read at container start.
 *   E2 Red (src/engines/queue)           – klopa-worker and the RabbitMQ orders queue (OOM, poison message, DLQ).
 * Glue (README „Combining with E3”): every frame the fields Argo CD (or kubectl) left live in E6 are mapped onto E3/E2,
 * and E3/E2 report Pods and rollout status back so Argo CD's health is derived from them. Nothing here re-implements
 * an engine's model; it only decides which fault to inject and when an incident counts as resolved.
 */
import * as G from '../../../engines/gitops/index.ts'
import * as K from '../../../engines/cluster/index.ts'
import * as Q from '../../../engines/queue/index.ts'
import { FAULTS, FAULT_IDS, type FaultId, type SignalId } from './faults.ts'

export const API = 'klopa-api'
export const WORKER = 'klopa-worker'
export const API_REPO = 'registry.klopa.example/klopa-api'
export const KNOWN_TAGS = ['2.0.1', '2.0.2']
export const CPU_LIMIT = '/spec/template/spec/containers/0/resources/limits/cpu'
/** Lunch at the menza: 36 req/s, from 10 s on 42 req/s (the 12:00 rush). */
export const LUNCH: K.TrafficProfile = { kind: 'spike', base: 36, peak: 42, startS: 10, endS: 1e6 }
export const USERS = 900
/** Below this memory limit the worker's working set does not fit (E2 fault 'oom'). */
export const WORKER_MIN_MEM_MI = 160
export const DEFAULT_SEED = 1200
const DB_BLIP_S = 50
const DB_BLIP_EVERY_S = 150
const HEALTHY_FOR_S = 10
const MAX_SERIES = 600

// ─── tiny seeded RNG (mulberry32; only for the deck order and drop-user sampling) ─────────────────────────────
function rng32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ─── live configuration (what Argo CD / kubectl left in the cluster, read from E6) ────────────────────────────
export interface LiveCfg {
  selector: string
  image: string
  tag: string
  liveness: string
  livenessPeriod: number
  readiness: string
  smsKey: string
  cpuReq: string | null
  cpuLim: string | null
  hpaMin: number
  hpaMax: number
  apiRoute: boolean
  workerMem: string
  workerReplicas: number
  restartedAt: string | null
}

function field(git: G.GitOpsState, key: string, ptr: string): string | null {
  const v = git.cluster.objects[key]?.fields[ptr]
  return v === undefined || v === null ? null : String(v)
}

export function readLive(git: G.GitOpsState): LiveCfg {
  const D = `Deployment/${API}`
  const W = `Deployment/${WORKER}`
  const image = field(git, D, G.PATHS.image) ?? `${API_REPO}:2.0.2`
  let apiRoute = false
  for (let i = 0; i < 6; i++) {
    const path = field(git, 'HTTPRoute/klopa', G.PATHS.routePath(i))
    const be = field(git, 'HTTPRoute/klopa', G.PATHS.routeBackend(i))
    if (path === '/api' && be === API) apiRoute = true
  }
  return {
    selector: field(git, `Service/${API}`, G.PATHS.serviceSelector) ?? '',
    image,
    tag: image.split(':').pop() ?? '',
    liveness: field(git, D, G.PATHS.livenessPath) ?? '/healthz',
    livenessPeriod: Number(field(git, D, G.PATHS.livenessPeriod) ?? 10) || 10,
    readiness: field(git, D, G.PATHS.readinessPath) ?? '/ready',
    smsKey: field(git, D, G.PATHS.envSecretKey(1)) ?? 'kljuc',
    cpuReq: field(git, D, G.PATHS.cpuRequest),
    cpuLim: field(git, D, CPU_LIMIT),
    hpaMin: Number(field(git, `HorizontalPodAutoscaler/${API}`, G.PATHS.hpaMin) ?? 2),
    hpaMax: Number(field(git, `HorizontalPodAutoscaler/${API}`, G.PATHS.hpaMax) ?? 10),
    apiRoute,
    workerMem: field(git, W, G.PATHS.memoryLimit) ?? '256Mi',
    workerReplicas: Number(field(git, W, G.PATHS.replicas) ?? 2),
    restartedAt: field(git, D, G.PATHS.restartedAt),
  }
}

export function cpuMilli(v: string | null): number | undefined {
  if (v === null) return undefined
  const m = /^(\d+(?:\.\d+)?)(m?)$/.exec(v.trim())
  if (!m) return undefined
  return m[2] === 'm' ? Number(m[1]) : Number(m[1]) * 1000
}

export function memMi(v: string): number {
  const m = /^(\d+(?:\.\d+)?)(Mi|Gi|M|G)?$/.exec(v.trim())
  if (!m) return 0
  const n = Number(m[1])
  return m[2] === 'Gi' || m[2] === 'G' ? n * 1024 : n
}

function probePath(p: string): K.ProbePath {
  return p === '/ready-db' || p === '/ready' ? p : '/healthz'
}

/** E3 Pod template of klopa-api built from the live Deployment fields. */
export function apiTemplate(c: LiveCfg): K.PodTemplate {
  const known = KNOWN_TAGS.includes(c.tag)
  const t = K.klopaApiTemplate('2.0.1', {
    image: c.image,
    resources: K.resources(cpuMilli(c.cpuReq), 128, cpuMilli(c.cpuLim), 256),
    probes: { startup: null, liveness: K.probe(probePath(c.liveness), { periodSeconds: Math.max(1, c.livenessPeriod) }), readiness: K.probe(probePath(c.readiness), { periodSeconds: 2 }) },
    env: {
      POPUST_CEVAP_PETAK: '20',
      SMS_API_KLJUC: { secretRef: 'klopa-sms', key: c.smsKey },
      [K.DB_PASSWORD_KEY]: { secretRef: 'klopa-db', key: 'password' },
    },
    annotations: c.restartedAt ? { 'kubectl.kubernetes.io/restartedAt': c.restartedAt } : {},
    changeCause: `argocd sync (${c.tag})`,
  })
  t.app = { ...t.app, version: known ? c.tag : c.tag || '?', dependsOnDb: true, cpuPerRequestMs: 20, cpuDemandM: 0, bootS: 1, warmS: 4 }
  return t
}

function templateKey(c: LiveCfg): string {
  return [c.image, c.liveness, c.livenessPeriod, c.readiness, c.smsKey, c.cpuReq, c.cpuLim, c.restartedAt].join('|')
}

// ─── state ────────────────────────────────────────────────────────────────────────────────────────────────────
export interface Hypothesis {
  cause: FaultId | 'drugo'
  signal: SignalId
  lecture: string
  at: number
}

export interface Incident {
  no: number
  fault: FaultId
  source: 'deck' | 'kaos'
  startedAt: number
  /** first second with a visible symptom (errors, p95, queue, Degraded…) */
  firstErrorAt: number | null
  resolvedAt: number | null
  healthyFor: number
  hypothesis: Hypothesis | null
  /** fix path that closed it: a commit, Argo CD sync, a manual kubectl change, or a mechanism */
  fixedBy: 'commit' | 'sync' | 'manual' | 'mehanizam' | null
  commits: string[]
  manualTries: number
  window: string
  qSince: number
  /** failed requests/orders and distinct users while it was open */
  failed: number
  users: Set<number>
  workerUsers: number
  /** E2 DLQ count when the poison message was published */
  dlqAtStart: number
}

export interface LogLine {
  id: number
  kind: 'cmd' | 'out' | 'err' | 'note'
  text: string
}

export interface NarrativeEvent {
  id: string
  t: number
  text: string
  tone: 'ok' | 'warn' | 'bad' | 'info' | 'neutral'
}

export interface IncidentState {
  seed: number
  git: G.GitOpsState
  k8s: K.ClusterState
  q: Q.QueueState
  rng: () => number
  applied: LiveCfg
  glue: { apiPushed: string; apiObserved: string; apiPushedTick: number; workerHash: string; hpaDesired: number }
  deck: FaultId[]
  nextIdx: number
  nextAt: number | null
  incidents: Incident[]
  dbBlipAt: number | null
  acc: number
  lastDropped: number
  /** share of offered requests dropped by CPU overload in the last second (fluid stream) */
  dropShare: number
  lastGitEvent: number | null
  series: { t: number[]; rps: number[]; err: number[]; p95: (number | null)[]; queue: number[]; workerErr: number[] }
  console: LogLine[]
  lineId: number
  events: NarrativeEvent[]
  eventId: number
  manualChanges: number
  chaos: number
  /** commits made by the student (sha → incident numbers open at that moment) */
  myCommits: { sha: string; t: number; message: string }[]
}

export function pickDeck(seed: number): FaultId[] {
  const r = rng32(seed * 7919 + 13)
  const ids = [...FAULT_IDS]
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  const out: FaultId[] = []
  const db = (f: FaultId) => f === 'liveness-baza' || f === 'readiness-baza'
  for (const f of ids) {
    if (out.length === 3) break
    if (db(f) && out.some(db)) continue
    if (f === 'otrovna-poruka' && out.length === 0) continue
    out.push(f)
  }
  return out
}

function event(s: IncidentState, text: string, tone: NarrativeEvent['tone'] = 'info') {
  s.eventId += 1
  s.events.push({ id: `n${s.eventId}`, t: s.k8s.t, text, tone })
  if (s.events.length > 40) s.events.splice(0, s.events.length - 40)
}

export function log(s: IncidentState, kind: LogLine['kind'], text: string) {
  s.lineId += 1
  s.console.push({ id: s.lineId, kind, text })
  if (s.console.length > 220) s.console.splice(0, s.console.length - 220)
}

/** Faults that are already in Git before lunch (the DB „blip” is what reveals them). */
const PRE_COMMITTED: Partial<Record<FaultId, () => { ptr: string; value: string; set: Record<string, string | number>; message: string; author: string }>> = {
  'liveness-baza': () => ({ ptr: G.PATHS.livenessPath, value: '/ready-db', set: { [G.PATHS.livenessPath]: '/ready-db', [G.PATHS.livenessPeriod]: 5 }, message: 'liveness: svakih 5 s provjeri i vezu s bazom', author: 'Lana' }),
  'readiness-baza': () => ({ ptr: G.PATHS.readinessPath, value: '/ready-db', set: { [G.PATHS.readinessPath]: '/ready-db' }, message: 'readiness: spreman tek kad je baza dostupna', author: 'Lana' }),
}

/** Lana's morning commit: CPU requests/limits from measurements, the DB password from the Secret `klopa-db`. */
export function applyMorningCommit(git: G.GitOpsState): void {
  const set: Record<string, string> = {
    [G.PATHS.cpuRequest]: '200m',
    [CPU_LIMIT]: '300m',
    [G.PATHS.envName(2)]: K.DB_PASSWORD_KEY,
    [G.PATHS.envSecretName(2)]: 'klopa-db',
    [G.PATHS.envSecretKey(2)]: 'password',
  }
  G.commitChanges(git, [{ path: G.FILES.deployment, set }], { author: 'Lana', message: 'klopa-api: requests prema mjerenjima, lozinka baze iz Secreta' })
}

/** The whole Klopa config repo as E6 holds it (l24Full + the morning commit): one YAML per file. */
export function cleanRepoFiles(): { path: string; yaml: string }[] {
  const git = G.createGitOps({ ...G.PRESETS.l24Full, seed: 24, initialTag: '2.0.2', images: [...G.DEFAULT_IMAGES, { tag: '2.0.2', behaviour: 'ok' }, ...G.KLOPA_SERVICE_IMAGES] })
  applyMorningCommit(git)
  const c = G.findCommit(git.repo, git.repo.head)
  return G.repoFiles(git)
    .filter((f) => f.change !== 'removed')
    .map((f) => ({ path: f.path, yaml: c?.files[f.path] ? G.manifestToYaml(c.files[f.path]) : '' }))
}

export function createIncident(seed: number = DEFAULT_SEED): IncidentState {
  const git = G.createGitOps({
    ...G.PRESETS.l24Full,
    seed: 24,
    initialTag: '2.0.2',
    images: [...G.DEFAULT_IMAGES, { tag: '2.0.2', behaviour: 'ok' }, ...G.KLOPA_SERVICE_IMAGES],
  })
  G.setExternalWorkload(git, API, true)
  G.setExternalWorkload(git, WORKER, true)
  const deck = pickDeck(seed)
  applyMorningCommit(git)
  for (const f of deck) {
    const pre = PRE_COMMITTED[f]?.()
    if (pre) G.commitChanges(git, [{ path: G.FILES.deployment, set: pre.set }], { author: pre.author, message: pre.message })
  }
  G.advance(git, 3)
  const cfg = readLive(git)
  const k8s = createK8s(seed, cfg)
  const q = Q.createQueueSim({ seed, rate: 1.2, consumers: cfg.workerReplicas, consumerNames: 'pod', podNamePrefix: WORKER, restart: Q.RESTART_CRASHLOOP, users: USERS })
  const hash = G.deploymentSpec(git, API)?.templateHash ?? ''
  const s: IncidentState = {
    seed,
    git,
    k8s,
    q,
    rng: rng32(seed),
    applied: cfg,
    glue: { apiPushed: hash, apiObserved: hash, apiPushedTick: -1, workerHash: G.deploymentSpec(git, WORKER)?.templateHash ?? '', hpaDesired: -1 },
    deck,
    nextIdx: 0,
    nextAt: 20,
    incidents: [],
    dbBlipAt: null,
    acc: 0,
    lastDropped: 0,
    dropShare: 0,
    lastGitEvent: git.events.at(-1)?.id ?? null,
    series: { t: [], rps: [], err: [], p95: [], queue: [], workerErr: [] },
    console: [],
    lineId: 0,
    events: [],
    eventId: 0,
    manualChanges: 0,
    chaos: 0,
    myCommits: [],
  }
  report(s)
  G.advance(git, 2)
  s.lastGitEvent = git.events.at(-1)?.id ?? null
  event(s, 'Petak, 12:00: ručak počinje. 2.0.2 je u produkciji, klaster je zdrav.', 'ok')
  log(s, 'note', '# Konzola je samo za čitanje. Promjene idu kroz config repozitorij (Commit).')
  return s
}

function createK8s(seed: number, cfg: LiveCfg): K.ClusterState {
  const node = (n: string) => K.nodeSpec(n, { cpuM: 4000, memMi: 16384, allocatableCpuM: 3920, allocatableMemMi: 13622 })
  const k = K.createCluster({
    seed,
    preset: 'L24 Incident u 12:00',
    nodes: [node('node-1'), node('node-2'), node('node-3')],
    registry: KNOWN_TAGS.map((t) => `${API_REPO}:${t}`),
    cachedImages: [`${API_REPO}:2.0.2`],
    timings: { scheduleDelayS: 1, containerCreateS: 0, imagePullS: 4, imageCache: 'pod', probeOffsetS: 0.1, endpointPropagationS: 1 },
    latency: { baseMs: 50, rhoCap: 0.99 },
    seriesLengthS: 900,
  })
  K.applySecret(k, 'klopa-sms', { kljuc: 'sms-••••' })
  K.applySecret(k, 'klopa-db', { password: 'lozinka-rujan' })
  K.setDatabasePassword(k, 'lozinka-rujan')
  K.createDeployment(k, {
    name: API,
    replicas: 6,
    template: apiTemplate(cfg),
    selector: { app: API },
    strategy: { type: 'RollingUpdate', maxSurge: '25%', maxUnavailable: '25%' },
    progressDeadlineSeconds: K.COMPRESSED.rolloutProgressDeadline.simValue,
  })
  K.createService(k, { name: API, selector: { app: cfg.selector } })
  K.createHpa(k, { name: API, target: API, minReplicas: cfg.hpaMin, maxReplicas: cfg.hpaMax, metric: { type: 'cpu', targetUtilization: 70 } })
  K.addTrafficStream(k, { id: 'web', serviceName: API, profile: LUNCH, users: USERS, routes: [{ serviceName: API, weight: 1 }] })
  K.addTrafficStream(k, { id: 'cpu', serviceName: API, model: 'fluid', profile: LUNCH })
  K.warmStart(k)
  return k
}

// ─── glue ─────────────────────────────────────────────────────────────────────────────────────────────────────
function applyLive(s: IncidentState) {
  const c = readLive(s.git)
  const a = s.applied
  if (templateKey(c) !== templateKey(a)) {
    K.patchDeploymentTemplate(s.k8s, API, apiTemplate(c))
    s.glue.apiPushed = G.deploymentSpec(s.git, API)?.templateHash ?? s.glue.apiPushed
    s.glue.apiPushedTick = s.k8s.tick
  }
  if (c.selector !== a.selector) K.setServiceSelectorByName(s.k8s, API, { app: c.selector })
  if (c.hpaMin !== a.hpaMin || c.hpaMax !== a.hpaMax) K.setHpa(s.k8s, API, { minReplicas: Math.max(1, c.hpaMin), maxReplicas: Math.max(1, c.hpaMax) })
  if (c.apiRoute !== a.apiRoute) {
    const web = s.k8s.traffic.find((x) => x.id === 'web')
    // adapter: E3 has no action for Gateway rules; an empty rule list = the Gateway answers 404 itself
    if (web) web.routes = c.apiRoute ? [{ serviceName: API, weight: 1 }] : []
    K.setTrafficEnabled(s.k8s, 'cpu', c.apiRoute)
  }
  if (c.workerMem !== a.workerMem) {
    Q.rolloutConsumers(s.q, { fault: memMi(c.workerMem) < WORKER_MIN_MEM_MI ? 'oom' : 'none' })
    s.glue.workerHash = G.deploymentSpec(s.git, WORKER)?.templateHash ?? s.glue.workerHash
  }
  if (c.workerReplicas !== a.workerReplicas) Q.setConsumers(s.q, Math.max(0, Math.min(12, c.workerReplicas)))
  s.applied = c
}

export function apiPods(s: IncidentState): K.Pod[] {
  return s.k8s.pods.filter((p) => p.labels.app === API)
}

function report(s: IncidentState) {
  const d = K.findDeployment(s.k8s, API)
  if (d) {
    if (s.k8s.tick > s.glue.apiPushedTick) s.glue.apiObserved = s.glue.apiPushed
    G.setExternalWorkloadStatus(s.git, API, {
      ...d.status,
      observedTemplateHash: s.glue.apiObserved,
      progressDeadlineExceeded: d.conditions.progressing.reason === 'ProgressDeadlineExceeded',
      pods: apiPods(s).map((p) => ({
        id: p.name,
        status: K.podStatus(p),
        ready: K.isReady(p),
        tag: p.spec.image.split(':').pop() ?? '',
        restarts: p.container.restartCount,
        ageS: s.k8s.t - p.createdAt,
        terminating: p.deletion !== null,
      })),
    })
  }
  const h = s.k8s.hpas[0]
  if (h && h.status.desiredReplicas !== s.glue.hpaDesired) {
    s.glue.hpaDesired = h.status.desiredReplicas
    G.setHpaDesired(s.git, API, h.status.desiredReplicas)
  }
  // adapter: E3 decides the HPA; its conditions drive Argo CD's HPA health in E6 (health_hpa.go)
  const rt = s.git.cluster.hpas[API]
  if (h && rt) {
    const last = h.decisions.at(-1)
    // only the missing CPU request blinds the HPA for good; „no metrics yet” during a rollout is transient
    const active = h.status.scalingActive || !/missing request/.test(h.status.message)
    setCond(rt, 'ScalingActive', active ? 'True' : 'False', active ? 'ValidMetricFound' : 'FailedGetResourceMetric', active ? 'the HPA was able to successfully calculate a replica count from cpu resource utilization (percentage of request)' : `the HPA was unable to compute the replica count: ${h.status.message}`)
    const limited = active && last !== undefined && last.raw > h.maxReplicas && h.status.desiredReplicas >= h.maxReplicas
    setCond(rt, 'ScalingLimited', limited ? 'True' : 'False', limited ? 'TooManyReplicas' : 'DesiredWithinRange', limited ? 'the desired replica count is more than the maximum replica count' : 'the desired count is within the acceptable range')
  }
  const pv = Q.podViews(s.q, { namePrefix: WORKER })
  const live = pv.filter((p) => p.status !== 'Terminating')
  const ready = live.filter((p) => p.ready === '1/1').length
  G.setExternalWorkloadStatus(s.git, WORKER, {
    replicas: live.length,
    updatedReplicas: live.length,
    readyReplicas: ready,
    availableReplicas: ready,
    observedTemplateHash: s.glue.workerHash,
    pods: pv.map((p) => ({ id: p.name, status: p.status, ready: p.ready === '1/1', tag: '1.3.2', restarts: p.restarts, ageS: p.ageS, terminating: p.status === 'Terminating' })),
  })
}

function setCond(rt: G.HpaRT, type: 'ScalingActive' | 'ScalingLimited', status: 'True' | 'False', reason: string, message: string) {
  const c = rt.conditions.find((x) => x.type === type)
  if (c) {
    if (c.status !== status || c.reason !== reason) Object.assign(c, { status, reason, message })
  } else rt.conditions.push({ type, status, reason, message })
}

// ─── step ─────────────────────────────────────────────────────────────────────────────────────────────────────
export function stepIncident(s: IncidentState, dt: number) {
  if (!(dt > 0) || !Number.isFinite(dt)) return
  let left = Math.min(dt, 2)
  while (left > 1e-9) {
    const h = Math.min(0.1, left)
    left -= h
    G.step(s.git, h)
    applyLive(s)
    K.stepCluster(s.k8s, h)
    Q.step(s.q, h)
    report(s)
    forwardGitEvents(s)
    s.acc += h
    while (s.acc >= 1) {
      s.acc -= 1
      perSecond(s)
    }
  }
}

function forwardGitEvents(s: IncidentState) {
  const ev = s.git.events
  if (!ev.length || ev.at(-1)?.id === s.lastGitEvent) return
  let i = ev.length - 1
  while (i > 0 && ev[i - 1].id !== s.lastGitEvent) i--
  for (let j = i; j < ev.length; j++) {
    const e = ev[j]
    const text = gitEventText(e)
    if (text) event(s, `Argo CD: ${text}`, e.tone === 'bad' ? 'bad' : e.tone === 'warn' ? 'warn' : e.tone === 'ok' ? 'ok' : 'info')
  }
  s.lastGitEvent = ev.at(-1)?.id ?? null
}

/** Neutral, short markers for the narrative log. Diffs, commit messages and who changed what stay in the console
 *  (`git log`, `argocd app diff`, `kubectl get events`), so finding them counts as reading a signal. */
function gitEventText(e: G.GitOpsEvent): string | null {
  switch (e.kind) {
    case 'status':
      if (e.text.startsWith('OutOfSync')) return 'aplikacija je OutOfSync.'
      if (e.text.startsWith('Synced')) return e.text.replace(': klaster odgovara Gitu', '')
      return e.text.startsWith('ComparisonError') ? 'greška pri usporedbi s Gitom.' : null
    case 'health':
      if (e.text.startsWith('Zdravlje aplikacije')) return e.text
      return /ProgressDeadlineExceeded/.test(e.text) ? 'uvođenje: ProgressDeadlineExceeded.' : null
    case 'sync':
    case 'autosync':
    case 'syncFailed':
      // only the neutral markers; „odstupanje ostaje, selfHeal je isključen” would name the cause
      if (!/^(Automatska sinkronizacija|Sinkronizacija|Operacija sinkronizacije)/.test(e.text)) return null
      return e.text.length <= 52 ? e.text : `${e.text.slice(0, 50)}…`
    case 'retry':
      return 'ponovni pokušaj sinkronizacije.'
    case 'hpa':
      return e.text.startsWith('HPA skalira') ? e.text : null
    default:
      return null
  }
}

// ─── metrics ──────────────────────────────────────────────────────────────────────────────────────────────────
export interface Red {
  rps: number
  errPct: number
  p95: number | null
  e404: number
  e503: number
  e500: number
}

/** RED of the Gateway + klopa-api over the last `w` seconds (requests stream) plus overload drops (fluid stream). */
export function apiRed(s: IncidentState, w = 10): Red {
  const from = s.k8s.t - w
  let total = 0
  let failed = 0
  let e404 = 0
  let e503 = 0
  let e500 = 0
  for (const r of s.k8s.recent) {
    if (r.t < from || r.streamId !== 'web') continue
    total += 1
    if (r.outcome === 'ok') continue
    failed += 1
    if (r.outcome === 'http404') e404 += 1
    else if (r.outcome === 'http500') e500 += 1
    else e503 += 1
  }
  const fl = K.fluidStats(s.k8s, 'cpu')
  const dropShare = s.dropShare
  const reqErr = total ? failed / total : 0
  const errPct = 1 - (1 - reqErr) * (1 - dropShare)
  const okShare = total ? (total - failed) / total : 0
  const p95 = fl && okShare > 0 && fl.served > 0 && Number.isFinite(fl.p95NowMs) ? fl.p95NowMs : null
  return { rps: K.streamRate(s.k8s, s.k8s.traffic[0]), errPct, p95, e404, e503, e500 }
}

export function workerRed(s: IncidentState) {
  const m = Q.metrics(s.q)
  return { rps: m.rateOut, errPct: m.errorRate, p95: m.p95 === null ? null : m.p95 * 1000, backlog: m.backlog, dlq: m.totals.dlq }
}

function push<T>(arr: T[], v: T) {
  arr.push(v)
  if (arr.length > MAX_SERIES) arr.shift()
}

function perSecond(s: IncidentState) {
  const t = s.k8s.t
  // overload drops of the fluid stream (CPU saturated) count as failed requests
  const fl = K.fluidStats(s.k8s, 'cpu')
  const dropped = fl ? fl.dropped : 0
  const dSec = Math.max(0, dropped - s.lastDropped)
  s.lastDropped = dropped
  const rate = Math.max(1e-9, K.streamRate(s.k8s, s.k8s.traffic[0]))
  s.dropShare = Math.min(1, dSec / rate)
  const red = apiRed(s, 5)
  const wr = workerRed(s)
  push(s.series.t, t)
  push(s.series.rps, red.rps)
  push(s.series.err, red.errPct * 100)
  push(s.series.p95, red.p95)
  push(s.series.queue, wr.backlog)
  push(s.series.workerErr, wr.errPct * 100)
  // failed requests this second (discrete stream), and extra users from drops
  let reqFailed = 0
  const usersNow = new Set<number>()
  for (let i = s.k8s.recent.length - 1; i >= 0; i--) {
    const r = s.k8s.recent[i]
    if (r.t < t - 1) break
    if (r.streamId === 'web' && r.outcome !== 'ok') {
      reqFailed += 1
      if (r.user !== null) usersNow.add(r.user)
    }
  }
  const extra = Math.max(0, Math.round(dSec) - reqFailed)
  for (let i = 0; i < extra; i++) usersNow.add(Math.floor(s.rng() * USERS))
  for (const inc of s.incidents) {
    if (inc.resolvedAt !== null) continue
    inc.failed += reqFailed + extra
    for (const u of usersNow) inc.users.add(u)
    const qi = Q.impact(s.q, { sinceS: inc.qSince })
    inc.workerUsers = qi.affectedUsers
    if (inc.firstErrorAt === null && symptomVisible(s, inc, red, wr)) page(s, inc, t)
    if (causeGone(s, inc) && recovered(s, inc, red, wr)) inc.healthyFor += 1
    else inc.healthyFor = 0
    if (inc.healthyFor >= HEALTHY_FOR_S) resolve(s, inc)
  }
  // the database hiccups while a probe still depends on it
  const dbFault = s.incidents.find((i) => i.resolvedAt === null && (i.fault === 'liveness-baza' || i.fault === 'readiness-baza'))
  if (dbFault && s.dbBlipAt !== null && t >= s.dbBlipAt) {
    K.setDatabase(s.k8s, false, DB_BLIP_S)
    event(s, `Baza ne odgovara ${DB_BLIP_S} s (kratki mrežni prekid prema Postgresu).`, 'warn')
    s.dbBlipAt = causeGone(s, dbFault) ? null : t + DB_BLIP_EVERY_S
  }
  // the deck: next incident a few seconds after the previous one is closed
  const open = s.incidents.filter((i) => i.resolvedAt === null && i.source === 'deck').length
  if (open === 0 && s.nextIdx < s.deck.length && s.nextAt !== null && t >= s.nextAt) {
    inject(s, s.deck[s.nextIdx], 'deck')
    s.nextIdx += 1
    s.nextAt = null
  }
}

function symptomVisible(s: IncidentState, inc: Incident, red: Red, wr: ReturnType<typeof workerRed>): boolean {
  const app = G.appView(s.git)
  if (red.errPct > 0.02 || (red.p95 !== null && red.p95 > 800)) return true
  if (wr.backlog > 25 || wr.errPct > 0.05) return true
  switch (inc.fault) {
    case 'tag':
    case 'secret-kljuc':
      return app.health === 'Degraded' || apiPods(s).some((p) => /ImagePull|ErrImage|CreateContainerConfig/.test(K.podStatus(p)))
    case 'hpa-bez-cpu':
      return app.health === 'Degraded'
    case 'drift':
      return app.sync === 'OutOfSync'
    default:
      return false
  }
}

export function causeGone(s: IncidentState, inc: Incident): boolean {
  const c = s.applied
  switch (inc.fault) {
    case 'selektor':
      return c.selector === API
    case 'liveness-baza':
      return c.liveness !== '/ready-db'
    case 'readiness-baza':
      return c.readiness !== '/ready-db'
    case 'tag':
      return KNOWN_TAGS.includes(c.tag)
    case 'secret-kljuc':
      return c.smsKey === 'kljuc'
    case 'hpa-max':
      return c.hpaMax >= 8
    case 'hpa-bez-cpu':
      return c.cpuReq !== null
    case 'stara-lozinka': {
      const ready = apiPods(s).filter((p) => K.isReady(p) && !p.deletion)
      return ready.length > 0 && ready.every((p) => p.envResolved[K.DB_PASSWORD_KEY] === s.k8s.db.password)
    }
    case 'httproute':
      return c.apiRoute
    case 'worker-oom':
      return memMi(c.workerMem) >= WORKER_MIN_MEM_MI
    case 'otrovna-poruka':
      return workerRed(s).dlq > inc.dlqAtStart
    case 'drift':
      return c.workerReplicas === Number(gitField(s, G.FILES.workerDeployment, G.PATHS.replicas) ?? 2)
  }
}

function recovered(s: IncidentState, inc: Incident, red: Red, wr: ReturnType<typeof workerRed>): boolean {
  const d = K.findDeployment(s.k8s, API)
  const rolled = d ? d.status.updatedReplicas === d.replicas && d.status.availableReplicas >= d.replicas && d.status.replicas === d.replicas : true
  switch (inc.fault) {
    case 'worker-oom':
    case 'drift':
    case 'otrovna-poruka':
      return wr.backlog < 10
    case 'hpa-max':
      return red.p95 !== null && red.p95 < 600 && red.errPct < 0.01
    case 'tag':
    case 'secret-kljuc':
    case 'hpa-bez-cpu':
      return rolled && red.errPct < 0.01
    default:
      return red.errPct < 0.01 && s.k8s.db.up
  }
}

/** The pager fires when a signal crosses its alert threshold – not when the fault is injected. */
function page(s: IncidentState, inc: Incident, t: number) {
  inc.firstErrorAt = t
  event(s, `#${inc.no} · ${clock(t)}: ${FAULTS[inc.fault].alert.replace(/`/g, '')}`, 'bad')
}

/** Incidents the on-call person knows about (the pager has fired, or it is already closed). */
export function pagedIncidents(s: IncidentState): Incident[] {
  return s.incidents.filter((i) => i.firstErrorAt !== null || i.resolvedAt !== null)
}

function resolve(s: IncidentState, inc: Incident) {
  inc.resolvedAt = s.k8s.t
  if (inc.fixedBy === null) {
    // a fix is credited to Git only if a commit (or an Argo CD sync from Git) made it; a manual kubectl change that
    // happened to remove the cause (e.g. `kubectl scale` while selfHeal is off) stays a manual fix
    if (FAULTS[inc.fault].selfContained) inc.fixedBy = 'mehanizam'
    else if (inc.commits.length > 0) inc.fixedBy = 'commit'
    else if (inc.manualTries > 0) inc.fixedBy = 'manual'
    else inc.fixedBy = 'sync'
  }
  if (inc.fault === 'drift') G.setSyncPolicy(s.git, { selfHeal: true })
  event(s, `Incident ${inc.no} riješen: ${FAULTS[inc.fault].cause.replace(/`/g, '')}.`, 'ok')
  if (s.incidents.every((i) => i.resolvedAt !== null) && s.nextIdx < s.deck.length) s.nextAt = s.k8s.t + 8
}

export function gitField(s: IncidentState, path: string, ptr: string): string | null {
  const c = G.findCommit(s.git.repo, s.git.repo.head)
  const v = c?.files[path]?.fields[ptr]
  return v === undefined || v === null ? null : String(v)
}

// ─── faults ───────────────────────────────────────────────────────────────────────────────────────────────────
export function inject(s: IncidentState, fault: FaultId, source: Incident['source']) {
  const no = s.incidents.length + 1
  const inc: Incident = {
    no,
    fault,
    source,
    startedAt: s.k8s.t,
    firstErrorAt: null,
    resolvedAt: null,
    healthyFor: 0,
    hypothesis: null,
    fixedBy: null,
    commits: [],
    manualTries: 0,
    window: K.markWindow(s.k8s, `incident ${no}`),
    qSince: s.q.t,
    failed: 0,
    users: new Set(),
    workerUsers: 0,
    dlqAtStart: workerRed(s).dlq,
  }
  s.incidents.push(inc)
  const iva = { author: 'Iva' }
  switch (fault) {
    case 'selektor':
      G.commitField(s.git, G.FILES.service, G.PATHS.serviceSelector, 'klopa-apl', { ...iva, message: 'Service: oznake po novoj konvenciji' })
      break
    case 'liveness-baza':
    case 'readiness-baza': {
      const pre = PRE_COMMITTED[fault]?.()
      if (pre && gitField(s, G.FILES.deployment, pre.ptr) !== pre.value) {
        G.commitChanges(s.git, [{ path: G.FILES.deployment, set: pre.set }], { author: pre.author, message: pre.message })
        s.dbBlipAt = s.k8s.t + 35
      } else s.dbBlipAt = s.k8s.t + 3
      break
    }
    case 'tag':
      G.commitField(s.git, G.FILES.deployment, G.PATHS.image, `${API_REPO}:2.0.3`, { ...iva, message: 'klopa-api: 2.0.3 (studentski popust)' })
      break
    case 'secret-kljuc':
      G.commitField(s.git, G.FILES.deployment, G.PATHS.envSecretKey(1), 'kljuc-v2', { ...iva, message: 'SMS: novi naziv ključa u Secretu' })
      break
    case 'hpa-max':
      G.commitField(s.git, G.FILES.hpa, G.PATHS.hpaMax, 3, { ...iva, message: 'HPA: najviše 3 Poda (Petra: trošak)' })
      break
    case 'hpa-bez-cpu':
      G.commitChanges(s.git, [{ path: G.FILES.deployment, set: { [G.PATHS.cpuRequest]: null, [CPU_LIMIT]: null } }], { ...iva, message: 'resources: bez CPU ograničenja, da ne koče' })
      break
    case 'stara-lozinka':
      K.applySecret(s.k8s, 'klopa-db', { password: 'lozinka-listopad' })
      K.setDatabasePassword(s.k8s, 'lozinka-listopad')
      event(s, 'ESO je osvježio Secret klopa-db.', 'info')
      break
    case 'httproute':
      G.commitField(s.git, G.FILES.httpRoute, G.PATHS.routePath(0), '/api/v2', { ...iva, message: 'HTTPRoute: pripremi /api/v2' })
      break
    case 'worker-oom':
      G.commitField(s.git, G.FILES.workerDeployment, G.PATHS.memoryLimit, '96Mi', { ...iva, message: 'klopa-worker: manje memorije (trošak)' })
      break
    case 'otrovna-poruka':
      Q.publishPoison(s.q)
      break
    case 'drift':
      G.setSyncPolicy(s.git, { selfHeal: false })
      G.reportExternalChange(s.git, 'Deployment', WORKER, G.PATHS.replicas, 0)
      break
  }
  // the pager stays silent until a symptom crosses its threshold (perSecond → page())
  return inc
}

/** „Kaos majmun”: a random fault from the deck that is not open right now (at most two open incidents). */
export function chaosMonkey(s: IncidentState): FaultId | null {
  const open = s.incidents.filter((i) => i.resolvedAt === null)
  if (open.length >= 2) {
    event(s, 'Kaos majmun čeka: već su otvorena dva incidenta.', 'neutral')
    return null
  }
  const used = new Set(open.map((i) => i.fault))
  const dbOpen = open.some((i) => i.fault === 'liveness-baza' || i.fault === 'readiness-baza')
  const pool = FAULT_IDS.filter((f) => !used.has(f) && !(dbOpen && (f === 'liveness-baza' || f === 'readiness-baza')) && !s.deck.slice(s.nextIdx).includes(f))
  if (!pool.length) return null
  const f = pool[Math.floor(s.rng() * pool.length)]
  s.chaos += 1
  inject(s, f, 'kaos')
  return f
}

// ─── student actions ──────────────────────────────────────────────────────────────────────────────────────────
export function openIncidents(s: IncidentState): Incident[] {
  return s.incidents.filter((i) => i.resolvedAt === null)
}

export function needsHypothesis(s: IncidentState): Incident | null {
  return openIncidents(s).find((i) => i.hypothesis === null && i.firstErrorAt !== null) ?? null
}

export function setHypothesis(s: IncidentState, no: number, h: Omit<Hypothesis, 'at'>): boolean {
  const inc = s.incidents.find((i) => i.no === no)
  if (!inc || inc.hypothesis) return false
  inc.hypothesis = { ...h, at: s.k8s.t }
  event(s, `Hipoteza za incident ${no} zapisana.`, 'info')
  return true
}

export function hypothesisScore(inc: Incident) {
  const h = inc.hypothesis
  const m = FAULTS[inc.fault]
  return { cause: h?.cause === inc.fault, signal: h ? m.signals.includes(h.signal) : false, lecture: h ? m.lectures.includes(h.lecture) : false }
}

export function commitFix(s: IncidentState, path: string, set: Record<string, G.FieldValue | null>, message: string): G.CommitResult {
  const r = G.commitChanges(s.git, [{ path, set }], { author: 'Vi', message })
  if (r.ok) noteCommit(s, r.sha, message)
  return r
}

export function revertCommit(s: IncidentState, sha: string): G.CommitResult {
  const r = G.gitRevert(s.git, sha, { author: 'Vi' })
  if (r.ok) noteCommit(s, r.sha, r.commit.message)
  return r
}

function noteCommit(s: IncidentState, sha: string, message: string) {
  s.myCommits.push({ sha, t: s.k8s.t, message })
  for (const i of openIncidents(s)) i.commits.push(sha)
  event(s, `Vaš commit ${sha.slice(0, 7)}: ${message}`, 'info')
}

/** A manual kubectl change: E6 sees it as drift (selfHeal reverts it); E3/E2 get it through the same glue.
 *  Returns 'unchanged' when the cluster already holds that value (kubectl changes nothing then). */
export function manualChange(s: IncidentState, kind: G.Kind, name: string, path: string, value: G.FieldValue | null): boolean | 'unchanged' {
  if (field(s.git, `${kind}/${name}`, path) === (value === null ? null : String(value))) return 'unchanged'
  const ok = G.reportExternalChange(s.git, kind, name, path, value)
  if (ok) {
    s.manualChanges += 1
    for (const i of openIncidents(s)) i.manualTries += 1
  }
  return ok
}

export function manualRestart(s: IncidentState): boolean {
  const r = K.rolloutRestart(s.k8s, API)
  if (r.ok) {
    s.manualChanges += 1
    for (const i of openIncidents(s)) {
      i.manualTries += 1
      if (i.fault === 'stara-lozinka') i.fixedBy = 'manual'
    }
  }
  return r.ok
}

export function argoSync(s: IncidentState): string {
  const r = G.syncApp(s.git)
  for (const i of openIncidents(s)) if (i.fault === 'drift') i.fixedBy = 'sync'
  return r.ok ? 'Sinkronizacija pokrenuta: Argo CD primjenjuje stanje iz Gita.' : `Sinkronizacija odbijena: ${r.reason ?? 'nepoznat razlog'}`
}

// ─── scores and goals ─────────────────────────────────────────────────────────────────────────────────────────
export function incidentUsers(inc: Incident): number {
  return inc.users.size + inc.workerUsers
}

export function mttr(inc: Incident): number | null {
  if (inc.resolvedAt === null) return null
  return inc.resolvedAt - (inc.firstErrorAt ?? inc.startedAt)
}

export function totals(s: IncidentState) {
  let failed = 0
  const users = new Set<number>()
  let workerUsers = 0
  for (const i of s.incidents) {
    failed += i.failed
    for (const u of i.users) users.add(u)
    workerUsers += i.workerUsers
  }
  const n = users.size + workerUsers
  return { failed, users: n, score: failed * n }
}

export function goals(s: IncidentState) {
  const done = s.incidents.filter((i) => i.resolvedAt !== null)
  const viaGit = done.filter((i) => i.fixedBy === 'commit' || i.fixedBy === 'sync' || i.fixedBy === 'mehanizam')
  const named = done.filter((i) => {
    const h = hypothesisScore(i)
    return h.signal && h.lecture
  })
  return { three: done.length >= 3, onlyGit: done.length >= 3 && viaGit.length === done.length, named: named.length >= 3, done: done.length, viaGit: viaGit.length, namedCount: named.length }
}

export function clock(t: number): string {
  const total = 12 * 3600 + Math.max(0, Math.floor(t))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}
