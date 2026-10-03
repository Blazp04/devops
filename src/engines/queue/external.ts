/**
 * Bridge for `consumerSource: 'external'`: another engine (E3 „Klaster”) owns the worker Pods – their scheduling,
 * start-up, CrashLoopBackOff and scaling – and E2 owns only the queue dynamics. Per frame:
 *   1. E3 → E2: `syncConsumers(q, pods)` with every klopa-worker Pod (stable key = Pod name; optional `fault`,
 *      e.g. 'oom' when E3 knows the memory limit is too low);
 *   2. E2 → E3: `drainTerminations(q)` returns containers E2 killed (OOMKilled 137 from the 'oom' fault, crash
 *      buttons) so E3 can mark them terminated and run its own back-off.
 * `killConsumer(q, key, reason)` is for faults E3 decides itself.
 * The queue metric does NOT flow back yet: E3's KEDA (cluster/keda.ts) integrates its own fluid queue every tick
 * and its HPA reads `cfg.keda.queueLength`; it has no external-metric input. Until E3 offers one, an L18 panel
 * either uses E3's KEDA alone (fluid queue) or E2 standalone with its own autoscaler – never both in one panel.
 * `queueMetric(q)` is what such an input should read.
 */
import { addConsumer, crashNow, emit, nowS, restartConsumer, stopConsumer, who } from './core.ts'
import type { ConsumerFault, ConsumerTermination, QueueState } from './types.ts'

export interface ExternalPod {
  /** Pod name – the stable consumer key. */
  key: string
  /** The worker container is up and consuming. */
  ready: boolean
  /** The Pod is being deleted: stop taking work, finish the current job. */
  terminating?: boolean
  /** Fault of this Pod's container (its template: e.g. 'oom' for a too-low memory limit). Omitted = unchanged. */
  fault?: ConsumerFault
}

/**
 * Make E2's consumers match the external Pods. New Pod → consumer (starting until ready). Ready → running
 * (a crashed consumer restarts – the other engine's kubelet restarted it). Running but not ready → its process is
 * gone (crash, deliveries returned). Terminating or missing → graceful stop. No-op unless consumerSource is 'external'.
 */
export function syncConsumers(s: QueueState, pods: ReadonlyArray<ExternalPod>): void {
  if (s.config.consumerSource !== 'external') return
  const seen = new Set<string>()
  for (const p of pods) {
    if (seen.has(p.key)) continue
    seen.add(p.key)
    const c = s.consumers.find((x) => x.key === p.key)
    const fault = p.fault === 'none' || p.fault === 'slow' || p.fault === 'oom' ? p.fault : undefined
    if (!c) {
      if (p.terminating) continue
      const n = addConsumer(s, !p.ready, p.key)
      if (fault !== undefined) n.fault = fault
      if (p.ready) emit(s, 'pod-ready', 'ok', `${who(s, n)} spreman (Pod ${p.key})`)
      continue
    }
    if (fault !== undefined) c.fault = fault
    if (p.terminating) {
      stopConsumer(s, c)
      continue
    }
    if (p.ready) {
      if (c.status === 'starting') {
        const t = nowS(s)
        c.status = 'running'
        c.runningSince = t
        c.freeAt = t
        c.readyAt = t
        emit(s, 'pod-ready', 'ok', `${who(s, c)} spreman (Pod ${p.key})`)
      } else if (c.status === 'crashed') restartConsumer(s, c)
    } else if (c.status === 'running') crashNow(s, c, 'before-effect', false)
  }
  for (const c of [...s.consumers]) if (c.key !== null && !seen.has(c.key)) stopConsumer(s, c)
}

/** Kill the worker in Pod `key` (a fault decided by the other engine). Returns false when it was not running. */
export function killConsumer(s: QueueState, key: string, reason: 'OOMKilled' | 'Error' = 'Error'): boolean {
  const c = s.consumers.find((x) => x.key === key)
  if (!c) return false
  return crashNow(s, c, reason === 'OOMKilled' ? 'oom' : 'before-effect', false)
}

/** Containers E2 killed since the last call (external mode only); the list is cleared. */
export function drainTerminations(s: QueueState): ConsumerTermination[] {
  const out = s.terminations
  s.terminations = []
  return out
}
