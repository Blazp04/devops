/**
 * User actions for E2 „Red”. Plain functions that mutate the state; call them from
 * `sim.mutate((s) => crashConsumer(s, …))` in a React component. Every action refreshes the newest chart
 * sample, so a change made while paused shows at once.
 */
import { plural } from '../../kit/sim/math.ts'
import { BURST, DT, FLIGHT_S, int, mergeConfig, num, sanitizeConfig } from './config.ts'
import {
  CONSUMER_EVENT_MERGE_S,
  activeConsumers,
  crashNow,
  desiredReplicas,
  effectiveFault,
  emit,
  newOrder,
  nowS,
  podName,
  replicaSetName,
  requeueOrphans,
  sampleNow,
  secs,
  setConsumerTarget,
  who,
} from './core.ts'
import type { Consumer, ConsumerFault, JobPhase, QueueConfigPatch, QueueState, SmsGatewayState } from './types.ts'

const ORDERS: [string, string, string] = ['narudžba', 'narudžbe', 'narudžbi']

/**
 * „Broj potrošača: 4 → 5” – while a slider is dragged (changes within 1 s, nothing else logged in between) the
 * same row is updated with the turning points only: „Broj potrošača: 4 → 12 → 4”.
 */
function consumersEvent(s: QueueState, from: number, to: number): void {
  const t = nowS(s)
  const label = s.config.mode === 'direct' ? 'radnika API-ja' : 'potrošača'
  const cc = s.consumerChange
  const last = s.events[s.events.length - 1]
  if (cc && last && last.id === cc.eventId && t - cc.t <= CONSUMER_EVENT_MERGE_S + 1e-9 && cc.values[cc.values.length - 1] === from) {
    const v = cc.values
    const n = v.length
    if (n >= 2 && Math.sign(v[n - 1] - v[n - 2]) === Math.sign(to - v[n - 1])) v[n - 1] = to
    else v.push(to)
    last.text = `Broj ${label}: ${v.join(' → ')}`
    cc.t = t
    return
  }
  emit(s, 'consumers', 'info', `Broj ${label}: ${from} → ${to}`)
  const e = s.events[s.events.length - 1]
  s.consumerChange = { eventId: e.id, t, values: [from, to] }
}

/**
 * Change settings live (sliders, toggles). Side effects: consumer count, autoscaler on/off, broker switch
 * (SQS orphans are requeued when switching to RabbitMQ), mode switch (a leftover backlog still drains),
 * SMS gateway, deployment-wide fault.
 * Ignored (so a control bound to `s.config` never shows a value that has no effect): `seed` and `consumerSource`
 * (fixed for the life of a state – change them in `init` and reset), and `consumers` while the autoscaler or an
 * external Pod engine owns the replicas. Turning the autoscaler off keeps the current replica count.
 */
export function setConfig(s: QueueState, patch: QueueConfigPatch): void {
  const prev = s.config
  const next = sanitizeConfig(mergeConfig(prev, patch))
  next.seed = prev.seed
  next.consumerSource = prev.consumerSource
  const internal = next.consumerSource === 'internal'
  if (!internal || next.autoscaler.enabled) next.consumers = prev.consumers
  else if (prev.autoscaler.enabled && patch.consumers === undefined) next.consumers = activeConsumers(s).length
  s.config = next
  if (internal) {
    if (next.autoscaler.enabled && !prev.autoscaler.enabled) {
      const t = nowS(s)
      s.scaler.replicas = activeConsumers(s).length
      s.scaler.nextPollAt = t
      s.scaler.nextHpaAt = t
      s.scaler.lastActiveAt = t
      s.scaler.recs = [] // a new HPA: seeded with the current replicas at its first sync
    } else if (!next.autoscaler.enabled && (prev.autoscaler.enabled || next.consumers !== prev.consumers)) {
      const from = activeConsumers(s).length
      setConsumerTarget(s, next.consumers, false)
      if (from !== next.consumers) consumersEvent(s, from, next.consumers)
    }
  }
  if (next.broker !== prev.broker) {
    if (next.broker === 'rabbitmq') requeueOrphans(s)
    emit(s, 'config', 'info', next.broker === 'sqs' ? 'Posrednik: SQS (rok vidljivosti)' : 'Posrednik: RabbitMQ (potvrde po potrošaču)')
  }
  if (next.mode !== prev.mode) {
    const left = s.ready.size + s.delayed.length + s.unacked.size
    if (next.mode === 'direct') emit(s, 'config', 'info', left > 0 ? `Način: bez reda (izravni pozivi) – zaostale poruke iz reda (${left}) obradit će slobodni radnici` : 'Način: bez reda (izravni pozivi)')
    else emit(s, 'config', 'info', 'Način: s redom')
  }
  if (patch.smsGateway !== undefined && (next.smsGateway !== s.sms.state || s.sms.until !== null)) setSmsGateway(s, next.smsGateway)
  if (next.consumerFault !== prev.consumerFault) for (const c of s.consumers) c.fault = null
  sampleNow(s)
}

/** Set the consumer count directly (ignored while the autoscaler or an external Pod engine owns the replicas). */
export function setConsumers(s: QueueState, n: number): void {
  setConfig(s, { consumers: n })
}

/** „Rok za potvrdu” slider: sets the active broker's deadline (SQS visibility timeout or RabbitMQ consumer_timeout). */
export function setAckTimeout(s: QueueState, simS: number): void {
  setConfig(s, s.config.broker === 'sqs' ? { visibilityTimeoutS: simS } : { consumerTimeoutS: simS })
}

/** „Nalet”: at least `rate` orders/s for `durationS` starting now (default 15/s × 10 s). Invalid input → no-op (false). */
export function startBurst(s: QueueState, opts: { rate?: number; durationS?: number } = {}): boolean {
  const rate = opts.rate === undefined ? BURST.rate : opts.rate
  const dur = opts.durationS === undefined ? BURST.durationS : opts.durationS
  if (!Number.isFinite(rate) || !Number.isFinite(dur) || rate <= 0 || dur <= 0) return false
  const r = Math.min(1000, rate)
  const d = Math.min(3600, dur)
  s.bursts = s.bursts.filter((b) => b.startS + b.durationS > nowS(s))
  s.bursts.push({ startS: nowS(s), durationS: d, rate: r })
  emit(s, 'burst', 'info', `Nalet: ${plural(r, ORDERS)}/s tijekom ${secs(d)}`)
  sampleNow(s)
  return true
}

/** „+100 odmah”: n orders arrive at once (0–10 000; invalid → nothing). Returns how many arrived. */
export function publishBatch(s: QueueState, n = 100): number {
  if (!Number.isFinite(n)) return 0
  const count = Math.min(10_000, Math.max(0, Math.floor(n)))
  if (count === 0) return 0
  emit(s, 'batch', 'info', `Nalet: +${plural(count, ORDERS)} odjednom`)
  for (let i = 0; i < count; i++) newOrder(s, false)
  sampleNow(s)
  return count
}

/** „Pošalji otrovnu poruku”: one order whose processing always fails. Returns its order id. */
export function publishPoison(s: QueueState): number {
  const order = newOrder(s, true)
  emit(s, 'poison', 'warn', `Poslana otrovna poruka (narudžba #${order.id})`)
  sampleNow(s)
  return order.id
}

/** What a crash button did, so the UI can narrate it (or disable the button when it returns null). */
export interface CrashResult {
  id: number
  when: 'before-effect' | 'after-effect' | 'after-commit'
  /** Where the consumer's job was when the button was pressed. */
  phase: JobPhase | 'idle'
  /** The kitchen effect of that job had already committed (a crash now behaves like „after cooking”). */
  committed: boolean
  /** 'after-effect': armed, fires after the next kitchen effect + SMS attempt; 'after-commit': right after the commit. */
  armed: boolean
}

/**
 * Crash a consumer.
 * - 'before-effect' („Sruši potrošača prije kuhanja”): the process dies now. Without `id` the engine picks a
 *   consumer still cooking (phase 'work', nothing committed), else an idle one, else returns null – never one
 *   that already cooked. RabbitMQ requeues its unacked deliveries immediately; SQS waits for the visibility timeout.
 *   No duplicate. With an explicit `id` it crashes that consumer wherever it is and reports `committed`.
 * - 'after-effect' („Sruši potrošača nakon kuhanja, prije potvrde”): armed; the consumer dies right after its next
 *   kitchen effect and SMS attempt (sent or failed), before the ack → redelivery → duplicate unless idempotent
 *   (the SMS can still go twice).
 * - 'after-commit' („Sruši potrošača između kuhanja i SMS-a”): armed like 'after-effect', but the consumer dies right
 *   after the kitchen commit, before the SMS call. Redelivery cooks again unless idempotent; with smsGuard
 *   'record-first' the SMS was recorded in the same commit, so the retry skips it and that SMS is lost.
 */
export function crashConsumer(s: QueueState, id?: number, when: 'before-effect' | 'after-effect' | 'after-commit' = 'before-effect'): CrashResult | null {
  const running = s.consumers.filter((c) => c.status === 'running')
  if (when === 'after-effect' || when === 'after-commit') {
    const c = id !== undefined ? s.consumers.find((x) => x.id === id) : (running.find((x) => x.job !== null && !x.crashArmed) ?? running.find((x) => !x.crashArmed))
    if (!c || (c.status !== 'running' && c.status !== 'stopping')) return null
    c.crashArmed = true
    if (when === 'after-commit') c.crashArmedPoint = 'after-commit'
    else delete c.crashArmedPoint
    const auto = s.config.ackMode === 'auto'
    const point = when === 'after-commit' ? 'nakon sljedećeg kuhanja, prije SMS-a' : 'nakon sljedećeg kuhanja'
    emit(s, 'fault', 'warn', `${who(s, c)} pada ${point}${auto ? ' (automatska potvrda: poruka je potvrđena već pri isporuci)' : ', prije potvrde'}`)
    return { id: c.id, when, phase: c.job ? c.job.phase : 'idle', committed: c.job?.committed ?? false, armed: true }
  }
  const c = id !== undefined ? s.consumers.find((x) => x.id === id) : (running.find((x) => x.job !== null && x.job.phase === 'work' && !x.job.committed) ?? running.find((x) => x.job === null))
  if (!c) return null
  const phase: JobPhase | 'idle' = c.job ? c.job.phase : 'idle'
  const committed = c.job?.committed ?? false
  if (!crashNow(s, c, 'before-effect')) return null
  sampleNow(s)
  return { id: c.id, when, phase, committed, armed: false }
}

/** Crash every running consumer at once (edge case „svi potrošači pali”). */
export function crashAllConsumers(s: QueueState): number {
  let n = 0
  for (const c of [...s.consumers]) if (crashNow(s, c, 'before-effect')) n++
  sampleNow(s)
  return n
}

/** Repair: restart a crashed consumer right away (skips the remaining restart delay). Not for external Pods. */
export function restartConsumerNow(s: QueueState, id: number): boolean {
  const c = s.consumers.find((x) => x.id === id)
  if (!c || c.status !== 'crashed' || s.config.consumerSource === 'external') return false
  c.restartAt = nowS(s)
  return true
}

/** A consumer by numeric id, external Pod key or Pod name (as podViews / workerLogs print it). */
export function findConsumer(s: QueueState, target: number | string): Consumer | null {
  if (typeof target === 'number') return s.consumers.find((x) => x.id === target) ?? null
  return s.consumers.find((x) => x.key === target) ?? s.consumers.find((x) => podName(s, x) === target) ?? null
}

/**
 * Fault for one consumer (numeric id, external Pod key or Pod name) or for the whole Deployment ('all', also
 * applied to future Pods – patched in place; for „fix it with a commit” use rolloutConsumers).
 * 'slow' („Spori potrošač”) adds `slowExtraS` per job; 'oom' kills the container (137) part-way through every job.
 * Returns how many consumers it affected (0 = unknown target or invalid fault: nothing happened).
 */
export function setConsumerFault(s: QueueState, target: number | string | 'all', fault: ConsumerFault): number {
  if (fault !== 'none' && fault !== 'slow' && fault !== 'oom') return 0
  if (target === 'all') {
    s.config = { ...s.config, consumerFault: fault }
    for (const c of s.consumers) c.fault = null
    emit(s, 'fault', fault === 'none' ? 'ok' : 'warn', faultText(fault, s.config.mode === 'direct' ? 'Svi radnici API-ja' : 'Svi potrošači'))
    sampleNow(s)
    return s.consumers.length
  }
  const c = findConsumer(s, target)
  if (!c) return 0
  c.fault = fault
  emit(s, 'fault', fault === 'none' ? 'ok' : 'warn', faultText(fault, `${who(s, c)}`))
  sampleNow(s)
  return 1
}

/**
 * „Spori potrošač”: slow down consumer `id`, or (without an id) the first running consumer that has no fault.
 * Returns its id, or null when there is none (disable the button).
 */
export function slowConsumer(s: QueueState, id?: number | string): number | null {
  const c = id !== undefined ? findConsumer(s, id) : (s.consumers.find((x) => x.status === 'running' && effectiveFault(s, x) === 'none') ?? null)
  if (!c || effectiveFault(s, c) === 'slow') return null
  setConsumerFault(s, c.id, 'slow')
  return c.id
}

/** Repair button: remove consumer `id`'s fault (override 'none'). Returns false for an unknown consumer. */
export function repairConsumer(s: QueueState, id: number | string): boolean {
  const c = findConsumer(s, id)
  if (!c) return false
  setConsumerFault(s, c.id, 'none')
  return true
}

export interface RolloutOptions {
  /** Fault of the new Pod template (default 'none' – the fix, e.g. a higher memory limit). */
  fault?: ConsumerFault
  /** Deployment strategy (default 25 % of the replicas: maxSurge rounded up, maxUnavailable down; both 0 → surge 1). */
  maxSurge?: number
  maxUnavailable?: number
  /** Start-up of a new Pod (default autoscaler.podStartupS, 2 s sim). */
  startupS?: number
}

/**
 * „Fix it with a commit” (L24): a new Pod template → a new ReplicaSet. New consumers (fresh ids, a new
 * pod-template-hash, RESTARTS 0) start while old ones – crashed ones first – are stopped gracefully, within
 * maxSurge / maxUnavailable. Old Pods keep their old fault until they are gone. Internal consumers only (with
 * consumerSource 'external' the cluster engine rolls out): returns false.
 */
export function rolloutConsumers(s: QueueState, opts: RolloutOptions = {}): boolean {
  if (s.config.consumerSource === 'external') return false
  const fault = opts.fault ?? 'none'
  if (fault !== 'none' && fault !== 'slow' && fault !== 'oom') return false
  const N = desiredReplicas(s)
  let maxSurge = opts.maxSurge === undefined ? Math.ceil(0.25 * N) : int(opts.maxSurge, 1, 0, 1000)
  const maxUnavailable = opts.maxUnavailable === undefined ? Math.floor(0.25 * N) : int(opts.maxUnavailable, 0, 0, 1000)
  if (maxSurge === 0 && maxUnavailable === 0) maxSurge = 1
  const startupS = num(opts.startupS, s.config.autoscaler.podStartupS, 0, 3600)
  for (const c of s.consumers) if (c.fault === null) c.fault = s.config.consumerFault // the old template keeps its fault
  s.config = { ...s.config, consumerFault: fault }
  s.revision++
  s.rollout = { revision: s.revision, startedAt: nowS(s), maxSurge, maxUnavailable, startupS }
  emit(
    s,
    'rollout',
    'info',
    `Novi ReplicaSet ${replicaSetName(s, s.revision)}: zamjenjuje ${plural(N, ['Pod', 'Poda', 'Podova'])} (maxSurge ${maxSurge}, maxUnavailable ${maxUnavailable})`,
  )
  sampleNow(s)
  return true
}

function faultText(fault: ConsumerFault, name: string): string {
  if (fault === 'slow') return `${name}: obrada usporena`
  if (fault === 'oom') return `${name}: premalo memorije – OOMKilled tijekom obrade`
  return `${name}: kvar uklonjen`
}

/**
 * „SMS-gateway pao” / usporen / popravljen. With a finite `durationS` > 0 it recovers by itself (then
 * `s.config.smsGateway` returns to 'ok' too). `durationS` undefined or Infinity = until changed. NaN, 0 or a
 * negative duration is ignored (returns false). Pressing the same thing twice at once emits one event.
 */
export function setSmsGateway(s: QueueState, state: SmsGatewayState, durationS?: number): boolean {
  if (state !== 'ok' && state !== 'slow' && state !== 'down') return false
  let until: number | null = null
  let forS = 0
  if (state !== 'ok' && durationS !== undefined && durationS !== Infinity) {
    if (!Number.isFinite(durationS) || durationS <= 0) return false
    forS = Math.min(durationS, 86_400)
    until = nowS(s) + forS
  }
  const changed = s.sms.state !== state || s.sms.until !== until
  s.sms = { state, until }
  s.config = { ...s.config, smsGateway: state }
  if (!changed) return true
  if (state === 'down') emit(s, 'sms-gateway', 'bad', `SMS-gateway pao${until !== null ? ` (na ${secs(forS)})` : ''}`)
  else if (state === 'slow') emit(s, 'sms-gateway', 'warn', `SMS-gateway usporen (+${secs(s.config.smsSlowS)} po poruci)`)
  else emit(s, 'sms-gateway', 'ok', 'SMS-gateway opet radi')
  sampleNow(s)
  return true
}

/** Restart the Little's-law measurement window (e.g. after changing λ). */
export function resetLittle(s: QueueState): void {
  s.little.since = nowS(s)
  s.little.area = 0
  s.little.departures = 0
  s.little.sojournSum = 0
}

/**
 * Cosmetic: how long one flight hop lasts in sim seconds (default 0,3 s). Pass 0,3 × speed so dots stay visible
 * at 4×. Does not touch the model.
 */
export function setFlightDuration(s: QueueState, simS: number): void {
  s.flightS = num(simS, FLIGHT_S, 0.02, 10)
}

/**
 * Stop the run at exactly `seconds` of simulated time (incident cards: „150 s”); step(), stepWithScript() and
 * runFor() then do nothing until reset. null = run forever.
 */
export function setStopAt(s: QueueState, seconds: number | null): void {
  s.stopAtTick = seconds === null || !Number.isFinite(seconds) ? null : Math.max(0, Math.round(seconds / DT))
}
