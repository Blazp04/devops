/**
 * The lab's simulation state: the E3 cluster plus the lecture's goal flags and narration. Stepping and every action
 * go through the engine; this file only remembers what the reader has achieved.
 */
import { plural, type SimEvent } from '../../kit'
import {
  getEndpointSlice,
  getProxyEndpoints,
  hitShares,
  patchDeploymentTemplate,
  requestStats,
  sendRequest,
  setDeploymentVersion,
  setPodReadiness,
  setServiceSelectorByName,
  setTrafficTarget,
  stepCluster,
  type ClusterState,
  type KlopaApiVersion,
  type PacketHop,
  type RolloutRecord,
} from '../../engines/cluster'
import { createLab, HIT_WINDOW_S, STREAM, SVC, type LabOptions } from './lab'

export interface LabSim {
  opts: LabOptions
  c: ClusterState
  /** rollout results that survive a rebuild (keyed „s” / „bez” readiness probe) */
  results: Record<string, { ok: number; failed: number }>
  notes: SimEvent[]
  noteId: number
  /** the selector matched nothing at some point (typo) … */
  sawEmpty: boolean
  /** … and was repaired */
  fixedEmpty: boolean
  /** the last rollout started from the lab (a new version, or a template change such as preStop) */
  rollout: { rec: RolloutRecord | null; startedAfter: number; version: string; kind: 'version' | 'template'; reported: boolean; viaIp?: boolean } | null
  cleanRollout: boolean
  /** a keep-alive client reached every Pod */
  spread: boolean
  traced: { id: string; hops: PacketHop[] | null; pod: string | null } | null
}

export function createLabSim(o: LabOptions = {}): LabSim {
  return { opts: o, c: createLab(o), results: {}, notes: [], noteId: 1, sawEmpty: false, fixedEmpty: false, rollout: null, cleanRollout: false, spread: false, traced: null }
}

/** Start again with other options (inside sim.mutate): a fresh cluster, the results are kept. */
export function rebuildLabSim(st: LabSim, o: LabOptions): void {
  const results = st.results
  Object.assign(st, createLabSim(o))
  st.results = results
}

export function resultKey(st: LabSim): string {
  return st.opts.readinessProbe === false ? 'bez' : 's'
}

export function note(st: LabSim, text: string, tone: SimEvent['tone'] = 'info'): void {
  st.notes.push({ id: `n${st.noteId++}`, t: Math.round(st.c.t * 10) / 10, text, tone })
  if (st.notes.length > 12) st.notes.shift()
}

/** Engine events and the lecture's notes, oldest first. */
export function labEvents(st: LabSim): SimEvent[] {
  return [...st.c.events.map((e) => ({ id: e.id, t: e.t, text: e.text, tone: e.tone })), ...st.notes].sort((a, b) => a.t - b.t)
}

export function stepLabSim(st: LabSim, dt: number): void {
  stepCluster(st.c, dt)
  const slice = getEndpointSlice(st.c, SVC)
  const proxy = getProxyEndpoints(st.c, SVC)
  if (slice.length === 0) st.sawEmpty = true
  if (st.sawEmpty && !st.fixedEmpty && proxy.length > 0 && slice.some((e) => e.ready)) {
    st.fixedEmpty = true
    note(st, `Service ${SVC} opet ima ${plural(proxy.length, ['spreman endpoint', 'spremna endpointa', 'spremnih endpointa'])} – promet teče`, 'ok')
  }
  const r = st.rollout
  if (r && !r.rec) {
    // the Deployment controller opens the rollout record on its next sync, not at the click
    const cur = st.c.deployments[0]?.rollout
    if (cur && cur.startedAt >= r.startedAfter - 1e-6) r.rec = cur
  }
  if (r && r.rec && !r.reported && r.rec.settledAt !== null && st.c.t >= r.rec.settledAt + 1.5) {
    r.reported = true
    const { ok, failed } = r.rec.requests
    st.results[resultKey(st)] = { ok, failed }
    const what = r.kind === 'version' ? `Uvođenje ${r.version}` : 'Uvođenje promjene predloška'
    const direct = !!st.c.traffic.find((x) => x.id === STREAM)?.targetIp
    if (failed === 0 && ok > 50 && r.kind === 'version' && !r.viaIp && !direct) st.cleanRollout = true
    if (direct || r.viaIp) {
      // the Service carried (almost) nothing: its „0 failed” would be a vacuous success
      const recent = requestStats(st.c, 10)
      const lost = recent.total - recent.ok
      note(st, `${what} gotovo – ali klopa-web zaobilazi Service: ${plural(lost, ['neuspio zahtjev', 'neuspjela zahtjeva', 'neuspjelih zahtjeva'])} u zadnjih 10 s`, 'bad')
      if (direct) note(st, 'klopa-web zove upisanu IP adresu, a tog Poda više nema', 'bad')
    } else if (ok + failed > 0) {
      note(st, `${what} gotovo: ${plural(failed, ['neuspio', 'neuspjela', 'neuspjelih'])} od ${plural(ok + failed, ['zahtjeva', 'zahtjeva', 'zahtjeva'])} kroz Service`, failed ? 'bad' : 'ok')
    }
  }
  const stream = st.c.traffic.find((x) => x.id === STREAM)
  if (!st.spread && stream?.keepAlive && !stream.targetIp) {
    const hits = hitShares(st.c, HIT_WINDOW_S, STREAM).filter((h) => h.share >= 0.1)
    if (hits.length >= 4) {
      st.spread = true
      note(st, 'Dugotrajne veze klijenta stigle su do sva 4 Poda', 'ok')
    }
  }
}

/** Template version of klopa-api right now (what „Uvedi” changes). */
export function templateVersion(st: LabSim): string {
  return st.c.deployments[0]?.template.app.version ?? '1.4.0'
}

export function nextVersion(st: LabSim): KlopaApiVersion {
  return templateVersion(st) === '1.4.1' ? '1.4.0' : '1.4.1'
}

/** „Uvedi 1.4.1” – a rollout of the next version, keeping the template's preStop. */
export function rollOut(st: LabSim, version: KlopaApiVersion = nextVersion(st)): void {
  const d = st.c.deployments[0]
  if (!d) return
  const res = setDeploymentVersion(st.c, d.name, version, { preStopSleepS: d.template.preStopSleepS })
  if (res.ok) st.rollout = { rec: null, startedAfter: st.c.t, version, kind: 'version', reported: false }
}

/** A rollout started from the lab is still running (its old Pods are not all gone yet). */
export function rolling(st: LabSim): boolean {
  if (st.rollout && !st.rollout.reported) return true
  const rec = st.c.deployments[0]?.rollout
  return !!rec && rec.settledAt === null
}

/** „preStop: sleep 5” on/off – a template change, so it is a rollout of its own. */
export function setPreStop(st: LabSim, on: boolean): void {
  const d = st.c.deployments[0]
  if (!d || (d.template.preStopSleepS > 0) === on) return
  const res = patchDeploymentTemplate(st.c, d.name, { preStopSleepS: on ? 5 : 0 })
  if (res.ok) st.rollout = { rec: null, startedAfter: st.c.t, version: d.template.app.version, kind: 'template', reported: false }
  note(st, on ? 'preStop: sleep 5 dodan u predložak – i to je novo uvođenje (stari Podovi ga još nemaju)' : 'preStop uklonjen iz predloška – novo uvođenje', 'warn')
}

export function preStopOn(st: LabSim): boolean {
  return (st.c.deployments[0]?.template.preStopSleepS ?? 0) > 0
}

/** „Pokvari selektor”: app=klopa-apii */
export function breakSelector(st: LabSim): void {
  const sel = { ...st.c.services[0].selector, app: 'klopa-apii' }
  setServiceSelectorByName(st.c, SVC, sel)
}

/**
 * „Sruši provjeru spremnosti”: the first ready klopa-api Pod starts answering 503 on /ready (nothing restarts).
 * Without a readiness probe nobody asks /ready, so the Pod stays ready – the note says so.
 */
export function failReadiness(st: LabSim): string | null {
  const ready = getEndpointSlice(st.c, SVC).find((e) => e.ready && !e.terminating && st.c.pods.find((p) => p.id === e.podId)?.readyOverride !== false)
  if (!ready) {
    note(st, 'Nema više spremnog Poda kojem bi provjera mogla pasti', 'info')
    return null
  }
  setPodReadiness(st.c, ready.podName, false)
  if (st.opts.readinessProbe === false) note(st, `${ready.podName}: /ready vraća 503 – ali bez provjere spremnosti nitko ne pita /ready, pa Pod i dalje dobiva promet`, 'bad')
  else note(st, `${ready.podName}: /ready vraća 503 – za oko 6 s (3 × 2 s) bit će ready: false`, 'warn')
  return ready.podName
}

/** „Upiši IP pa uvedi novu verziju”: klopa-web dials one Pod's IP directly, then a rollout replaces every Pod. */
export function hardcodeIpAndRoll(st: LabSim): void {
  const ep = getEndpointSlice(st.c, SVC).find((e) => e.ready && !e.terminating)
  if (!ep) return
  setTrafficTarget(st.c, STREAM, ep.ip)
  note(st, `klopa-web sada zove izravno ${ep.ip}:8000 (Pod ${ep.podName}), bez Servicea`, 'warn')
  rollOut(st)
  if (st.rollout) st.rollout.viaIp = true
}

/** „Pošalji zahtjev”: one request with its packet path. */
export function traceOne(st: LabSim): void {
  const r = sendRequest(st.c, STREAM)
  if (!r) return
  st.traced = { id: r.request.id, hops: r.hops, pod: r.request.podName }
}
