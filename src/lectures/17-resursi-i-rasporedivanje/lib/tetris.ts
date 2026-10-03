/**
 * Flagship „Tetris raspoređivača”: a wrapper around one E3 ClusterState with the lecture's goals (latched),
 * a local log for kubectl answers / refused drops, and counters read from the engine's own events.
 * Every rule (filter, score, bind, CPU water-fill, OOM, eviction) is the engine's – nothing is re-implemented here.
 */
import {
  advance,
  deletePod,
  placePod,
  podView,
  qosClass,
  removeRequests,
  resizePod,
  setComponent,
  setNodeExtraMemory,
  setPodResources,
  setPodUsage,
  stepCluster,
  memoryAvailable,
  type ClusterState,
  type Pod,
  type ResourceSpec,
} from '../../../engines/cluster'
import { CARD_ORDER, IVA_PODS, makePreset, type PresetKey } from './model'

export interface LocalEvent {
  id: string
  t: number
  text: string
  tone: 'ok' | 'warn' | 'bad' | 'info' | 'neutral'
}

export interface TetrisGoals {
  placed: boolean
  bigDbRead: boolean
  fragment: boolean
  leaky: boolean
  guaranteed: boolean
}

export interface TetrisState {
  c: ClusterState
  preset: PresetKey
  goals: TetrisGoals
  log: LocalEvent[]
  seq: number
  /** a refused drop, drawn as a red note on the node for a few seconds */
  refusal: { pod: string; node: string; reasons: string[]; t: number } | null
  /** counters from the engine's events */
  oomKills: number
  evictions: number
  lastEventNo: number
  /** nodes with memory pressure switched on („Pritisak memorije na čvoru”) */
  pressure: string[]
  /** since when leaky's leak has been 0 (the goal needs the leak fixed, not a bigger limit) */
  leakFixedAt: number | null
}

export const GOAL_CARDS = ['web', 'api', 'cpu-burner', 'batch', 'leaky', 'besteffort']
export const LEAKY_OK_S = 45

export function createTetris(preset: PresetKey): TetrisState {
  return {
    c: makePreset(preset),
    preset,
    goals: { placed: false, bigDbRead: false, fragment: false, leaky: false, guaranteed: false },
    log: [],
    seq: 0,
    refusal: null,
    oomKills: 0,
    evictions: 0,
    lastEventNo: 0,
    pressure: [],
    leakFixedAt: null,
  }
}

function pod(s: ClusterState, name: string): Pod | undefined {
  // the live Pod with this name (a replaced Pod keeps its name; finished ones are skipped when a newer exists)
  const all = s.pods.filter((p) => p.name === name)
  return all.find((p) => p.phase !== 'Failed' && p.phase !== 'Succeeded') ?? all[all.length - 1]
}

export function livePod(w: TetrisState, name: string): Pod | undefined {
  return pod(w.c, name)
}

function scanEvents(w: TetrisState): void {
  for (const e of w.c.events) {
    const no = Number(e.id.replace(/\D/g, ''))
    if (!Number.isFinite(no) || no <= w.lastEventNo) continue
    w.lastEventNo = no
    if (e.kind === 'oom') w.oomKills += 1
    if (e.kind === 'evicted') w.evictions += 1
  }
}

function leakGrowth(p: Pod): number {
  return p.usage.memGrowthMiPerS ?? p.spec.app.memGrowthMiPerS
}

/**
 * Seconds leaky has run with the leak fixed (growth 0) and without a restart; 0 while it still leaks. A bigger memory
 * limit alone never counts: it only postpones the next OOMKilled.
 */
export function leakyCleanS(w: TetrisState): number {
  const lk = pod(w.c, 'leaky')
  if (!lk || !lk.processUp || lk.processStartedAt === null || w.leakFixedAt === null || leakGrowth(lk) > 0) return 0
  return w.c.t - Math.max(lk.processStartedAt, w.leakFixedAt)
}

function checkGoals(w: TetrisState): void {
  const s = w.c
  const g = w.goals
  if (!g.placed && GOAL_CARDS.every((n) => !!pod(s, n)?.nodeName)) g.placed = true
  if (!g.fragment && !!pod(s, 'fragment')?.nodeName) g.fragment = true
  const lk = pod(s, 'leaky')
  const fixed = !!lk && leakGrowth(lk) === 0
  if (!fixed) w.leakFixedAt = null
  else if (w.leakFixedAt === null) w.leakFixedAt = s.t
  if (!g.leaky && leakyCleanS(w) >= LEAKY_OK_S) g.leaky = true
  const api = pod(s, 'api')
  if (!g.guaranteed && api && api.nodeName && qosClass(api.spec) === 'Guaranteed' && api.processUp) g.guaranteed = true
}

/**
 * „Pritisak memorije na čvoru”: something outside the Pods takes memory until memory.available is 60Mi (under the
 * 100Mi threshold, above 0 – a slow squeeze for the kubelet, not a spike for the kernel OOM killer).
 */
function squeeze(w: TetrisState, name: string): void {
  const n = w.c.nodes.find((x) => x.name === name)
  if (!n) return
  const avail = memoryAvailable(w.c, n)
  if (avail > 60) setNodeExtraMemory(w.c, name, n.extraSystemMemMi + (avail - 60))
}

export function stepTetris(w: TetrisState, dt: number): void {
  stepCluster(w.c, dt)
  scanEvents(w)
  checkGoals(w)
}

function note(w: TetrisState, text: string, tone: LocalEvent['tone']): void {
  w.seq += 1
  w.log.push({ id: `l${w.seq}`, t: w.c.t, text, tone })
  if (w.log.length > 30) w.log.splice(0, w.log.length - 30)
}

// ------------------------------------------------------------------ user actions (call inside sim.mutate)

export function dropOnNode(w: TetrisState, podName: string, nodeName: string): void {
  const r = placePod(w.c, podName, nodeName)
  if (r.ok) {
    w.refusal = null
    return
  }
  w.refusal = { pod: podName, node: nodeName, reasons: r.reasons, t: w.c.t }
  note(w, `${podName} ne stane na ${nodeName}: ${r.reasons.join(', ')}`, 'bad')
}

export function toggleScheduler(w: TetrisState): void {
  const on = !w.c.components.scheduler
  setComponent(w.c, 'scheduler', on)
  note(w, on ? 'Raspoređivač radi: filtriranje → bodovanje → vezanje' : 'Raspoređivač ugašen: Podove smještate vi', on ? 'info' : 'neutral')
}

export function markBigDbRead(w: TetrisState): void {
  const b = pod(w.c, 'big-db')
  if (b && !b.nodeName) w.goals.bigDbRead = true
}

export function leak(w: TetrisState, name: string): void {
  if (setPodUsage(w.c, name, { memGrowthMiPerS: 20 })) note(w, `${name}: memorija raste 20 Mi/s (curenje)`, 'warn')
}

export function cpuLoop(w: TetrisState, name: string): void {
  if (setPodUsage(w.c, name, { cpuM: 2000 })) note(w, `${name}: beskonačna petlja želi 2000m CPU-a`, 'warn')
}

export function stripRequests(w: TetrisState, name: string): void {
  const r = removeRequests(w.c, name)
  note(w, r.ok ? `${name}: requests i limits uklonjeni → novi Pod, BestEffort` : r.message, r.ok ? 'warn' : 'bad')
}

export function togglePressure(w: TetrisState, node: string): void {
  if (w.pressure.includes(node)) {
    w.pressure = w.pressure.filter((n) => n !== node)
    setNodeExtraMemory(w.c, node, 0)
    note(w, `${node}: vanjski potrošač memorije ugašen`, 'ok')
    return
  }
  w.pressure.push(node)
  squeeze(w, node)
  note(w, `${node}: nešto izvan Podova troši memoriju, memory.available < 100Mi`, 'bad')
}

export function setUsage(w: TetrisState, name: string, u: { cpuM?: number; memMi?: number; memGrowthMiPerS?: number }): void {
  setPodUsage(w.c, name, u)
}

export function applyResources(w: TetrisState, name: string, r: ResourceSpec, how: 'resize' | 'replace'): void {
  const before = pod(w.c, name)
  const oldLim = before?.spec.resources.limits.memMi
  const res = how === 'resize' ? resizePod(w.c, name, r) : setPodResources(w.c, name, r)
  const first = res.message.split('\n').pop() ?? res.message
  note(w, res.ok ? `kubectl: ${first}` : res.message, res.ok ? 'ok' : 'bad')
  const after = pod(w.c, name)
  if (res.ok && after && leakGrowth(after) > 0 && oldLim !== undefined && r.limits.memMi !== undefined && r.limits.memMi > oldLim) {
    note(w, `${name} i dalje curi: veći limit memorije samo odgađa OOMKilled`, 'warn')
  }
}

export function deleteIvaPods(w: TetrisState): void {
  let n = 0
  for (const name of IVA_PODS) {
    const p = pod(w.c, name)
    if (p && !p.deletion && p.phase !== 'Failed') {
      if (deletePod(w.c, name).ok) n += 1
    }
  }
  if (n) note(w, `Obrisani Ivini testni Podovi (${n}): njihove rezervacije oslobađaju se kad se ugase`, 'ok')
}

export function ivaPodsLeft(w: TetrisState): number {
  return IVA_PODS.filter((n) => {
    const p = pod(w.c, n)
    return p && !p.deletion && p.phase !== 'Failed'
  }).length
}

/** Pods drawn on the stage: Iva's Pods + the deck, the newest object per name (evicted ones stay, marked). */
export function stagePods(w: TetrisState): Pod[] {
  const out: Pod[] = []
  for (const n of [...IVA_PODS, ...CARD_ORDER]) {
    const p = pod(w.c, n)
    if (p) out.push(p)
  }
  return out
}

export function viewOf(w: TetrisState, p: Pod) {
  return podView(w.c, p)
}

/** For tests / the incident numbers. */
export function runHeadless(w: TetrisState, seconds: number): void {
  advance(w.c, seconds)
  scanEvents(w)
  checkGoals(w)
}
