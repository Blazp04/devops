/**
 * „Laboratorij zdravlja Poda” – a thin adapter around the E3 engine (presetPodHealth): the draft pod.yaml the
 * student edits, the named presets (incl. the incident's), the goal bookkeeping and the merged event log.
 * Every Pod mechanic (probes, back-off, phase/STATUS/READY, traffic only to Ready Pods, bare Pods) is the engine's.
 */
import {
  L12_BEHAVIOURS,
  appBehaviour,
  applyBarePod,
  deletePod,
  getProxyEndpoints,
  hangProcess,
  markWindow,
  powerOffNode,
  powerOnNode,
  presetPodHealth,
  probe,
  replaceBarePod,
  setDatabase,
  stepCluster,
  trafficTotals,
  windowStats,
  WRONG_TAG_IMAGE,
  KLOPA_API_VERSIONS,
  klopaApiTemplate,
} from '../../../engines/cluster/index.ts'
import { plural } from '../../../kit/sim/math.ts'
import type { AppBehaviour, ClusterState, L12Behaviour, Pod, ProbeKind, ProbeSpec, Probes } from '../../../engines/cluster/index.ts'

export const LAB_SEED = 42
export const POD_NAMES = ['klopa-api-1', 'klopa-api-2', 'klopa-api-3'] as const
export const DB_OUTAGE_S = 60

export type ProbePath = '/healthz' | '/ready' | '/ready-db'

/**
 * klopa-api stores every order in Postgres, so in the lab every behaviour needs the database (the engine's
 * L12_BEHAVIOURS set dependsOnDb only on „ovisi o bazi”): without the DB an order gets a fast 503.
 */
export function labApp(b: L12Behaviour): AppBehaviour {
  return { ...L12_BEHAVIOURS[b], dependsOnDb: true }
}

export interface ProbeDraft {
  on: boolean
  path: ProbePath
  initialDelaySeconds: number
  periodSeconds: number
  failureThreshold: number
}

export interface LabConfig {
  behaviour: L12Behaviour
  wrongTag: boolean
  probes: Record<ProbeKind, ProbeDraft>
}

export const PROBE_KINDS: ProbeKind[] = ['startup', 'liveness', 'readiness']

/** real Kubernetes defaults (periodSeconds 10, timeoutSeconds 1, successThreshold 1, failureThreshold 3, delay 0) */
export const DEFAULT_PROBE = { initialDelaySeconds: 0, periodSeconds: 10, failureThreshold: 3 }

const off = (path: ProbePath): ProbeDraft => ({ on: false, path, ...DEFAULT_PROBE })
const on = (path: ProbePath, over: Partial<ProbeDraft> = {}): ProbeDraft => ({ on: true, path, ...DEFAULT_PROBE, ...over })

export type LabPresetId = 'incident' | 'noProbes' | 'recommended' | 'diagnosis'

export const LAB_PRESETS: { id: LabPresetId; label: string; config: LabConfig }[] = [
  {
    id: 'incident',
    label: 'Incident 12 (spori start)',
    config: { behaviour: 'slowStart', wrongTag: false, probes: { startup: off('/healthz'), liveness: on('/healthz'), readiness: off('/ready') } },
  },
  {
    id: 'noProbes',
    label: 'Spori start, bez provjera',
    config: { behaviour: 'slowStart', wrongTag: false, probes: { startup: off('/healthz'), liveness: off('/healthz'), readiness: off('/ready') } },
  },
  {
    id: 'recommended',
    label: 'Zdrava, živost + spremnost',
    config: { behaviour: 'healthy', wrongTag: false, probes: { startup: off('/healthz'), liveness: on('/healthz'), readiness: on('/ready') } },
  },
  {
    id: 'diagnosis',
    label: 'Dijagnoza: 3 Poda',
    config: { behaviour: 'healthy', wrongTag: false, probes: { startup: off('/healthz'), liveness: on('/healthz'), readiness: on('/ready') } },
  },
]

export function presetConfig(id: LabPresetId): LabConfig {
  const p = LAB_PRESETS.find((x) => x.id === id)!
  return cloneConfig(p.config)
}

export function cloneConfig(c: LabConfig): LabConfig {
  return { behaviour: c.behaviour, wrongTag: c.wrongTag, probes: { startup: { ...c.probes.startup }, liveness: { ...c.probes.liveness }, readiness: { ...c.probes.readiness } } }
}

export function sameConfig(a: LabConfig, b: LabConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function toProbes(c: LabConfig): Probes {
  const spec = (d: ProbeDraft): ProbeSpec | null => (d.on ? probe(d.path, { initialDelaySeconds: d.initialDelaySeconds, periodSeconds: d.periodSeconds, failureThreshold: d.failureThreshold }) : null)
  return { startup: spec(c.probes.startup), liveness: spec(c.probes.liveness), readiness: spec(c.probes.readiness) }
}

/** The three broken Pods of the diagnosis task and the right answer for each. */
export type Diagnosis = 'tag' | 'crash' | 'notready' | 'pending'
export const DIAGNOSIS_OPTIONS: { value: Diagnosis | ''; label: string }[] = [
  { value: '', label: '— odaberite uzrok —' },
  { value: 'pending', label: 'raspoređivač mu još nije našao čvor' },
  { value: 'tag', label: 'čvor ne može preuzeti sliku (krivi tag)' },
  { value: 'crash', label: 'proces se ruši odmah nakon pokretanja' },
  { value: 'notready', label: 'proces radi, ali provjera spremnosti pada' },
]
export const DIAGNOSIS_ANSWERS: Record<(typeof POD_NAMES)[number], Diagnosis> = { 'klopa-api-1': 'tag', 'klopa-api-2': 'crash', 'klopa-api-3': 'notready' }

export interface LabEvent {
  id: string
  t: number
  text: string
  tone: 'ok' | 'warn' | 'bad' | 'info' | 'neutral'
}

export interface LabState {
  cl: ClusterState
  preset: LabPresetId | 'custom'
  diagnosis: boolean
  /** pod id → restart count when it was first seen hung */
  hung: Record<string, number>
  db: { win: string; t0: number; restarts0: number; podIds: string[]; qualifies: boolean; evaluated: boolean } | null
  goals: { slowStart: boolean; hangRecovered: boolean; dbOutage: boolean; diagnosis: boolean }
  events: LabEvent[]
  eventSeq: number
}

export function labEvent(w: LabState, text: string, tone: LabEvent['tone']): void {
  w.eventSeq += 1
  w.events.push({ id: `lab${w.eventSeq}`, t: w.cl.t, text, tone })
  if (w.events.length > 20) w.events.shift()
}

export function createLab(config: LabConfig, preset: LabPresetId | 'custom'): LabState {
  const cl = presetPodHealth({ seed: LAB_SEED, behaviour: config.behaviour, probes: toProbes(config), wrongTag: config.wrongTag })
  // adapter: the preset's Pods are created at t = 0 and nothing has run yet – make them use the database (labApp)
  for (const p of cl.pods) p.spec.app = labApp(config.behaviour)
  const w: LabState = { cl, preset, diagnosis: preset === 'diagnosis', hung: {}, db: null, goals: { slowStart: false, hangRecovered: false, dbOutage: false, diagnosis: false }, events: [], eventSeq: 0 }
  if (preset === 'diagnosis') {
    // three Pods, three different faults – read them from the STATUS column
    replaceBarePod(cl, 'klopa-api-1', { image: WRONG_TAG_IMAGE })
    replaceBarePod(cl, 'klopa-api-2', { app: labApp('crashOnStart') })
    replaceBarePod(cl, 'klopa-api-3', { app: appBehaviour({ version: '1.3.2', bootS: 1, warmS: 5, neverReady: true, dependsOnDb: true }) })
    labEvent(w, 'Učitana tri pokvarena Poda – pročitajte stupac STATUS i odaberite uzrok', 'info')
  }
  return w
}

export function podByName(s: ClusterState, name: string): Pod | undefined {
  return s.pods.find((p) => p.name === name)
}

export function isHung(s: ClusterState, p: Pod): boolean {
  return p.processUp && p.kubelet.hangAt !== null && s.t + 1e-6 >= p.kubelet.hangAt
}

function restartSum(s: ClusterState): number {
  return s.pods.reduce((a, p) => a + p.container.restartCount, 0)
}

/** One simulation step + the goal bookkeeping (latching). */
export function stepLab(w: LabState, dt: number): void {
  const s = w.cl
  stepCluster(s, dt)
  const pods = POD_NAMES.map((n) => podByName(s, n))
  // goal 1: slow start reaches Ready without being killed (liveness + readiness on, 0 restarts)
  if (!w.goals.slowStart) {
    const ok = pods.every((p) => p && !p.deletion && p.spec.app.bootS >= 40 && p.spec.probes.liveness && p.spec.probes.readiness && p.ready.status && p.container.restartCount === 0)
    if (ok) {
      w.goals.slowStart = true
      labEvent(w, 'Cilj: spori start do Ready bez ijednog ubijanja', 'ok')
    }
  }
  // goal 2: a hung process is restarted by the kubelet and serves again
  for (const p of pods) {
    if (!p) continue
    if (isHung(s, p) && w.hung[p.id] === undefined) w.hung[p.id] = p.container.restartCount
    const at = w.hung[p.id]
    if (!w.goals.hangRecovered && at !== undefined && p.container.restartCount > at && p.ready.status && !isHung(s, p)) {
      w.goals.hangRecovered = true
      labEvent(w, `Cilj: zaglavljeni ${p.name} se sam oporavio (restart na mjestu, ista IP adresa)`, 'ok')
    }
  }
  // goal 3: 60 s database outage without a restart and without 0 endpoints
  const d = w.db
  if (d && !d.evaluated && s.t >= d.t0 + DB_OUTAGE_S + 1 && s.db.up) {
    d.evaluated = true
    const st = windowStats(s, d.win)
    const restarts = restartSum(s) - d.restarts0
    const same = d.podIds.length === 3 && d.podIds.every((id) => s.pods.some((p) => p.id === id && !p.deletion))
    const zero = st ? st.services['klopa-api']?.zeroReadySeconds ?? 0 : 0
    if (!d.qualifies) labEvent(w, 'Baza se vratila.', 'info')
    else if (restarts === 0 && zero === 0 && same) {
      w.goals.dbOutage = true
      labEvent(w, 'Cilj: ispad baze bez restarta, a Service nijednom bez endpointa – klijenti su dobili brzi 503', 'ok')
    } else {
      const why = [restarts > 0 ? plural(restarts, ['restart', 'restarta', 'restarta']) : null, zero > 0 ? `${Math.round(zero)} s bez ijednog endpointa` : null, !same ? 'Pod je zamijenjen ili obrisan' : null].filter(Boolean)
      labEvent(w, `Baza se vratila, ali cilj nije postignut: ${why.join(', ')}`, 'warn')
    }
  }
}

export function startDbOutage(w: LabState): void {
  const s = w.cl
  const pods = POD_NAMES.map((n) => podByName(s, n)).filter((p): p is Pod => !!p && !p.deletion)
  const qualifies = pods.length === 3 && pods.every((p) => p.spec.probes.liveness !== null && p.spec.probes.readiness !== null)
  w.db = { win: markWindow(s, 'ispad baze 60 s'), t0: s.t, restarts0: restartSum(s), podIds: pods.map((p) => p.id), qualifies, evaluated: false }
  setDatabase(s, false, DB_OUTAGE_S)
  if (!qualifies) labEvent(w, pods.length < 3 ? 'Ovaj ispad ne vrijedi za cilj: nema sva tri Poda' : 'Ovaj ispad ne vrijedi za cilj: uključite provjere živosti i spremnosti i primijenite pod.yaml', 'info')
}

/**
 * „Primijeni pod.yaml”: probes of an existing Pod cannot be edited (kubectl apply → Forbidden), so the button works like
 * `kubectl replace --force` for the Pods that exist, and like `kubectl apply` (a new Pod) for the ones that are gone.
 */
export function applyConfig(w: LabState, c: LabConfig): void {
  const s = w.cl
  const app = labApp(c.behaviour)
  const image = c.wrongTag ? WRONG_TAG_IMAGE : KLOPA_API_VERSIONS['1.3.2'].image
  const created: string[] = []
  for (const name of POD_NAMES) {
    if (podByName(s, name)) replaceBarePod(s, name, { app, image, probes: toProbes(c) })
    else {
      applyBarePod(s, name, klopaApiTemplate('1.3.2', { app, image, probes: toProbes(c) }))
      created.push(name)
    }
  }
  w.preset = 'custom'
  w.diagnosis = false
  labEvent(w, 'Primijenjen novi pod.yaml: postojeći Podovi zamijenjeni novima (isto ime, nova IP adresa)', 'info')
  for (const name of created) labEvent(w, `${name}: stvoren novi Pod (isto ime iz YAML-a, nova IP adresa i UID)`, 'info')
}

export function hangPod(w: LabState, name: string): boolean {
  const ok = hangProcess(w.cl, name)
  if (ok) labEvent(w, `${name}: proces je zaglavio (živ je, ali ne odgovara)`, 'bad')
  return ok
}

export function deleteLabPod(w: LabState, name: string): void {
  const r = deletePod(w.cl, name)
  if (r.ok) labEvent(w, `kubectl delete pod ${name} – goli Pod, nitko ga neće ponovno stvoriti`, 'bad')
}

export function nodeOf(w: LabState, name: string): string | null {
  return podByName(w.cl, name)?.nodeName ?? null
}

export function toggleNode(w: LabState, node: string): void {
  const n = w.cl.nodes.find((x) => x.name === node)
  if (!n) return
  if (n.machine === 'running') {
    powerOffNode(w.cl, node)
    labEvent(w, `${node} je ugašen`, 'bad')
  } else {
    powerOnNode(w.cl, node)
    labEvent(w, `${node} je ponovno upaljen`, 'info')
  }
}

export function readyEndpoints(w: LabState): number {
  return getProxyEndpoints(w.cl, 'klopa-api').length
}

/** Every request since the start (the incident card's „od 3057 zahtjeva”). */
export function totalsSinceStart(w: LabState): { ok: number; total: number } {
  const t = trafficTotals(w.cl)
  return { ok: t.ok, total: t.total }
}

/** Diagnosis task solved: latch it so applying pod.yaml or new answers never untick it. */
export function markDiagnosis(w: LabState): void {
  if (w.goals.diagnosis) return
  w.goals.diagnosis = true
  labEvent(w, 'Cilj: tri Poda dijagnosticirana iz stupca STATUS', 'ok')
}
