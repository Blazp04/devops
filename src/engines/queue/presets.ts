/**
 * Named scenarios for the lectures that use E2. Every number printed on an incident card must be
 * reproducible with `runPreset(id)` (same config + seed + script ⇒ same result); presets with a `card`
 * carry those numbers and validated.test.ts asserts them.
 */
import { BURST, BROKER_FACTS, DT, REAL_AUTOSCALER_TIMINGS, RESTART_CRASHLOOP } from './config.ts'
import { advance, createQueueSim, fireScript, tick } from './core.ts'
import { crashConsumer, publishPoison, setConsumerFault, setSmsGateway, setStopAt, startBurst } from './actions.ts'
import type { DrainRecord, QueueConfigPatch, QueueState, RateProfile, ScriptEntry } from './types.ts'

export type { ScriptEntry }
export { fireScript }

export type CardKey = 'orders' | 'lost' | 'peak' | 'drainS' | 'dlq' | 'duplicates' | 'retries'

/** Numbers an incident card prints, with the seed and run length that reproduce them. */
export interface PresetCard {
  seed: number
  runS: number
  expect: Partial<Record<CardKey, number>>
}

export interface QueuePreset {
  id: string
  /** Lectures that use it. */
  lectures: readonly string[]
  /** Croatian title for a preset picker / incident card. */
  title: string
  config: QueueConfigPatch
  /** Run length (s) the stated numbers refer to. */
  runS: number
  script?: readonly ScriptEntry[]
  card?: PresetCard
  /** What the run shows (English, for authors). */
  note: string
}

/** Ćevap-petak: 2 narudžbe/s, 15/s during 30–40 s. */
export const CEVAP_PETAK_PROFILE: RateProfile = { kind: 'burst', startS: 30, durationS: BURST.durationS, rate: BURST.rate }
/** The same burst at 5 s, for a live sim that must show something within ~10 s at 1× (AUTHORING §5). */
export const CEVAP_PETAK_LIVE_PROFILE: RateProfile = { kind: 'burst', startS: 5, durationS: BURST.durationS, rate: BURST.rate }

/** A compressed lunch rush (orders/s): calm → ramp → 6/s peak → calm. */
export const LUNCH_RUSH_PROFILE: RateProfile = {
  kind: 'curve',
  points: [
    [0, 1],
    [20, 1],
    [40, 6],
    [70, 6],
    [90, 1],
    [120, 1],
  ],
}

/** A compressed day for KEDA (repeats every 300 s): night 0 → morning trickle → lunch 6/s → evening → night 0. */
export const COMPRESSED_DAY_PROFILE: RateProfile = {
  kind: 'curve',
  repeatS: 300,
  points: [
    [0, 0],
    [30, 0],
    [30.01, 0.5],
    [80, 0.5],
    [100, 6],
    [130, 6],
    [150, 1],
    [200, 1],
    [220, 0],
    [300, 0],
  ],
}

/**
 * The same day stretched to `lengthS` (night = 110/300 of the day). Use a day whose night is longer than the KEDA
 * cooldown + polling interval, or the worker never reaches 0: with real timings (300 s + 30 s) take ≥ 1000 s.
 */
export function dayProfile(lengthS: number): RateProfile {
  const L = Number.isFinite(lengthS) && lengthS > 0 ? lengthS : 300
  const k = L / 300
  const pts = (COMPRESSED_DAY_PROFILE as Extract<RateProfile, { kind: 'curve' }>).points
  return { kind: 'curve', repeatS: L, points: pts.map(([x, y]) => [x * k, y] as const) }
}

/** A 1200 s day (440 s of night) for real KEDA/HPA timings – the length of E3's daily sine. */
export const REAL_DAY_PROFILE: RateProfile = dayProfile(1200)

/**
 * Seed that reproduces the L06 hook („od 445 narudžbi tog ručka izgubi se 152”) in direct mode and, with the same
 * arrivals, the queue outcomes (k 4: vrh 113, prazno za 52,7 s; k 6: 24,2 s; k 7: 17,9 s; k 8: vrh 71, 13 s).
 * Seed 42 gives 414 / 142 for the same scenario – the curriculum card must state 36343 (or quote 414 / 142).
 */
export const CEVAP_PETAK_SEED = 36343

/** Seed of `l06-poison-dlq` that reproduces the lecture's „DLQ 24, 236 retries” (seed 42 gives 33 / 277). */
export const POISON_DLQ_SEED = 254

export const PRESETS = {
  /** L06 incident card: direct calls, Ćevap-petak, k 4 → 445 orders, 152 lost (503). */
  'l06-cevap-petak-direct': {
    id: 'l06-cevap-petak-direct',
    lectures: ['06'],
    title: 'Ćevap-petak bez reda',
    config: { seed: CEVAP_PETAK_SEED, mode: 'direct', consumers: 4, profile: CEVAP_PETAK_PROFILE },
    runS: 150,
    card: { seed: CEVAP_PETAK_SEED, runS: 150, expect: { orders: 445, lost: 152 } },
    note: 'Direct mode (no waiting room), burst 15/s × 10 s at 30 s, k 4: 445 orders, 152 lost (34 %).',
  },
  /** Live flagship start: the Ćevap-petak burst already at 5 s (free play; the incident numbers use the 30 s preset). */
  'l06-cevap-petak-live': {
    id: 'l06-cevap-petak-live',
    lectures: ['06'],
    title: 'Ćevap-petak (nalet za 5 s)',
    config: { seed: CEVAP_PETAK_SEED, mode: 'queue', consumers: 4, profile: CEVAP_PETAK_LIVE_PROFILE },
    runS: 120,
    note: 'The burst starts at 5 s so the depth climbs within the first 10 s at 1×; then the queue drains.',
  },
  /** Same arrivals through a queue: 0 lost; backlog peaks at 113 and drains in 52,7 s. */
  'l06-cevap-petak-queue': {
    id: 'l06-cevap-petak-queue',
    lectures: ['06', '24'],
    title: 'Ćevap-petak s redom',
    config: { seed: CEVAP_PETAK_SEED, mode: 'queue', consumers: 4, profile: CEVAP_PETAK_PROFILE },
    runS: 150,
    card: { seed: CEVAP_PETAK_SEED, runS: 150, expect: { orders: 445, lost: 0, peak: 113, drainS: 52.7 } },
    note: 'Same 445 orders, 0 lost; peak 113, drains in 52.7 s. Drain goal: judge it on this seed (k 6 = 24.2 s, k 7 = 17.9 s).',
  },
  /** Steady 2/s, k 4: direct ≈ 9,5 % lost (Erlang B) vs queue 0 lost, p50 ≈ 0,8 s, p95 ≈ 3,1 s. */
  'l06-steady-direct': {
    id: 'l06-steady-direct',
    lectures: ['06'],
    title: 'Stalni promet bez reda',
    config: { seed: 42, mode: 'direct' },
    runS: 2000,
    card: { seed: 42, runS: 2000, expect: { orders: 4050, lost: 378 } },
    note: 'Pure loss system (no waiting room): ≈ 9.5 % answered 503 although utilisation is only 50 %.',
  },
  'l06-steady-queue': {
    id: 'l06-steady-queue',
    lectures: ['06'],
    title: 'Stalni promet s redom',
    config: { seed: 42, mode: 'queue' },
    runS: 2000,
    note: '0 lost; p50 ≈ 0.78 s, p95 ≈ 3.15 s, W ≈ 1.09 s (exact M/M/4 theory: mmcSojournQuantile / mmc).',
  },
  /** SMS gateway slows down: direct calls hold the API worker, losses explode; the queue only grows. */
  'l06-sms-slow-direct': {
    id: 'l06-sms-slow-direct',
    lectures: ['06'],
    title: 'Spori SMS-gateway bez reda',
    config: { seed: 42, mode: 'direct', smsGateway: 'slow' },
    runS: 120,
    note: 'Each request holds a worker 1 s + 3 s SMS: A = 8 on 4 workers → Erlang B ≈ 57 % lost.',
  },
  /** L06 break-it with the default config: the queue keeps accepting, depth climbs, then drains; no re-cooking. */
  'l06-sms-down-queue': {
    id: 'l06-sms-down-queue',
    lectures: ['06'],
    title: 'SMS-gateway pao, s redom',
    config: { seed: 42, mode: 'queue' },
    runS: 150,
    script: [{ atS: 20, label: 'SMS-gateway pao na 30 s', run: (s) => void setSmsGateway(s, 'down', 30) }],
    note: 'Default smsOnFailure „retry-sms”: each job waits out the 5 s SMS timeout (μ 1/6) so depth climbs; the order is acked and its SMS is resent after recovery. 0 lost, 0 duplicates.',
  },
  /** The same outage with a naive handler (the exception after the commit nacks the whole message). */
  'l06-sms-down-nack': {
    id: 'l06-sms-down-nack',
    lectures: ['06'],
    title: 'SMS-gateway pao, poruka se vraća',
    config: { seed: 42, mode: 'queue', smsOnFailure: 'nack-message' },
    runS: 150,
    script: [{ atS: 20, label: 'SMS-gateway pao na 30 s', run: (s) => void setSmsGateway(s, 'down', 30) }],
    note: 'smsOnFailure „nack-message”: every SMS failure redelivers an already cooked order → ≈ 21 kitchen duplicates (seed 42) unless idempotent (then ≈ 21 „već skuhano”).',
  },
  /** RabbitMQ: crash after the side effect, before the ack → immediate requeue → duplicate unless idempotent. */
  'l06-rabbit-crash-after': {
    id: 'l06-rabbit-crash-after',
    lectures: ['06'],
    title: 'RabbitMQ: pad nakon kuhanja',
    config: { seed: 42, broker: 'rabbitmq' },
    runS: 30,
    script: [{ atS: 10, label: 'Sruši potrošača nakon kuhanja, prije potvrde', run: (s) => void crashConsumer(s, undefined, 'after-effect') }],
    note: 'One kitchen duplicate and one duplicate SMS; with idempotency the kitchen stamps „već skuhano” but the SMS still goes twice.',
  },
  /** SQS: a slow consumer exceeds the 30 s visibility timeout → the message reappears → duplicate. */
  'l06-sqs-slow-consumer': {
    id: 'l06-sqs-slow-consumer',
    lectures: ['06'],
    title: 'SQS: spori potrošač',
    config: { seed: 42, broker: 'sqs' },
    runS: 60,
    script: [{ atS: 5, label: 'Spori potrošač', run: (s) => setConsumerFault(s, 1, 'slow') }],
    note: 'Jobs of the slow consumer take > 30 s: each one is delivered again and cooked twice.',
  },
  /** sim-models: SQS visibility 2 s with mean service 1 s → ≈ 13 % duplicate effects; 0 with idempotency. */
  'l06-sqs-short-visibility': {
    id: 'l06-sqs-short-visibility',
    lectures: ['06'],
    title: 'SQS: prekratak rok vidljivosti',
    config: { seed: 42, broker: 'sqs', visibilityTimeoutS: 2 },
    runS: 600,
    note: 'e^-2 ≈ 13.5 % of jobs exceed 2 s → ≈ 13 % duplicates (some late deletes still succeed).',
  },
  /**
   * sim-models: pFail 10 %, poison 2 % → DLQ ≈ 2 %, ≈ 0,2 retries per message. Seed 254 reproduces the lecture's
   * „DLQ 24, 236 retries” (of 1217 orders; seeds 1–6 average 22,8 ± 4,0 DLQ, 220 ± 23 retries).
   */
  'l06-poison-dlq': {
    id: 'l06-poison-dlq',
    lectures: ['06', '24'],
    title: 'Otrovne poruke i DLQ',
    config: { seed: POISON_DLQ_SEED, pFail: 0.1, pPoison: 0.02 },
    runS: 600,
    card: { seed: POISON_DLQ_SEED, runS: 600, expect: { orders: 1217, dlq: 24, retries: 236, lost: 0 } },
    note: 'Poison messages go to the DLQ after exactly 5 failed deliveries; transient failures recover by retrying. Seed 254: DLQ 24 of 1217, 236 retries (the lecture numbers).',
  },
  /** RabbitMQ 4.3 pitfall: basic.nack(requeue) does not count toward the delivery limit → a poison message never leaves. */
  'l06-rabbit-nack-loop': {
    id: 'l06-rabbit-nack-loop',
    lectures: ['06'],
    title: 'RabbitMQ: nack bez kraja',
    config: { seed: 42, broker: 'rabbitmq', retryMode: 'nack-requeue', maxDeliveries: BROKER_FACTS.rabbitQuorumDefaultDeliveries },
    runS: 60,
    script: [{ atS: 5, label: 'Pošalji otrovnu poruku', run: (s) => void publishPoison(s) }],
    note: 'Quorum default delivery-limit 20 (= 21 deliveries). Since 4.3 nack is not counted in delivery-count: the poison message is redelivered ~50 times in 55 s and never reaches the DLQ. retryMode „immediate” (basic.reject) or „backoff” reaches it after 21.',
  },
  /** L18: KEDA wakes klopa-worker from 0 on the first message, HPA scales 1 ↔ N by ceil(queue / 10), back to 0 at night. */
  'l18-keda-day': {
    id: 'l18-keda-day',
    lectures: ['18'],
    title: 'KEDA: dan potrošača',
    config: { seed: 42, consumers: 0, profile: COMPRESSED_DAY_PROFILE, autoscaler: { enabled: true, minReplicas: 0, maxReplicas: 10, targetQueueLength: 10 } },
    runS: 300,
    note: 'Compressed day (300 s). Timings ÷10: polling 3 s (30 s), cooldown 30 s (300 s), HPA sync 1.5 s (15 s).',
  },
  /** L18 on E3's clock: real KEDA/HPA timings on a 1200 s day (440 s of night > cooldown 300 s + polling 30 s). */
  'l18-keda-day-real': {
    id: 'l18-keda-day-real',
    lectures: ['18'],
    title: 'KEDA: dan potrošača (stvarna vremena)',
    config: { seed: 42, consumers: 0, profile: REAL_DAY_PROFILE, autoscaler: { enabled: true, minReplicas: 0, maxReplicas: 10, targetQueueLength: 10, ...REAL_AUTOSCALER_TIMINGS } },
    runS: 1400,
    note: 'Real timings (polling 30 s, cooldown 300 s, HPA 15 s, stabilisation 300 s): 0 → 1 in the morning, back to 0 at night, 0 → 1 the next morning. Run at 10–30×.',
  },
  /** L24: worker memory limit too low → OOMKilled 137 in CrashLoopBackOff, the queue grows, messages hit the DLQ. */
  'l24-oom-worker': {
    id: 'l24-oom-worker',
    lectures: ['24'],
    title: 'klopa-worker: OOMKilled',
    config: { seed: 42, consumers: 3, consumerFault: 'oom', restart: RESTART_CRASHLOOP, consumerNames: 'pod' },
    runS: 120,
    note: 'Every job is killed part-way (exit 137); restarts: at once, then 1, 2, 4 … 30 s (sim; real: at once, 10 s … 300 s). The fix is a commit: rolloutConsumers(s) (new ReplicaSet, fault none).',
  },
  /** L24: one poison message during lunch → retries with backoff → DLQ; everything else flows. */
  'l24-poison': {
    id: 'l24-poison',
    lectures: ['24'],
    title: 'Otrovna poruka u podne',
    config: { seed: 42, consumers: 3, consumerNames: 'pod' },
    runS: 60,
    script: [{ atS: 10, label: 'Pošalji otrovnu poruku', run: (s) => void publishPoison(s) }],
    note: 'The poison message is delivered 5 times (backoff 0–1, 0–2, 0–4, 0–8 s) and lands in the DLQ.',
  },
  /** L06 lunch-rush curve for free play. */
  'l06-lunch-rush': {
    id: 'l06-lunch-rush',
    lectures: ['06'],
    title: 'Ručak u menzi',
    config: { seed: 42, profile: LUNCH_RUSH_PROFILE },
    runS: 120,
    note: 'λ ramps to 6/s for 30 s: with k 4 the backlog grows (λ > kμ) and drains after the peak.',
  },
} as const satisfies Record<string, QueuePreset>

export type PresetId = keyof typeof PRESETS

/** A preset with the widened QueuePreset type (`PRESETS[id].script` / `.card` do not typecheck for a generic id). */
export function getPreset(id: PresetId): QueuePreset {
  return PRESETS[id]
}

/** Config patch of a preset (pass to createQueueSim). */
export function presetConfig(id: PresetId): QueueConfigPatch {
  return PRESETS[id].config as QueueConfigPatch
}

/** A preset's config with overrides merged in (nested autoscaler / restart merged field by field). */
function withOverrides(base: QueueConfigPatch, o: QueueConfigPatch | undefined): QueueConfigPatch {
  if (!o) return base
  return {
    ...base,
    ...o,
    autoscaler: { ...(base.autoscaler ?? {}), ...(o.autoscaler ?? {}) },
    restart: { ...(base.restart ?? {}), ...(o.restart ?? {}) },
  }
}

/**
 * step() that also fires an extra script at exact ticks (a state from createPresetSim already fires its own
 * script in step(); passing that same script here does not fire it twice). Same caps as step().
 */
export function stepWithScript(s: QueueState, dtSeconds: number, script: readonly ScriptEntry[] | undefined): void {
  advance(s, dtSeconds, script && script !== s.script ? (x) => fireScript(x, script) : null)
}

export interface PresetSimOptions {
  /** Stop exactly at the preset's run length (incident cards). Default true. */
  stopAtEnd?: boolean
  /** Config overrides, e.g. the slider's { consumers: 6 } (the script and the seed stay the preset's unless overridden). */
  overrides?: QueueConfigPatch
}

/**
 * A preset's state for a live UI: `useSimulation({ init: () => createPresetSim(id), step })` – the script is stored
 * on the state and fired by step(), so no stepWithScript wiring is needed.
 */
export function createPresetSim(id: PresetId, opts: PresetSimOptions = {}): QueueState {
  const p = getPreset(id)
  const s = createQueueSim(withOverrides(p.config, opts.overrides))
  s.script = p.script ?? null
  if (opts.stopAtEnd ?? true) setStopAt(s, p.runS)
  return s
}

/** Headless run of a preset (config + seed + script) for `runS` seconds (or `seconds` / `{ seconds, overrides }`). */
export function runPreset(id: PresetId, opts?: number | { seconds?: number; overrides?: QueueConfigPatch }): QueueState {
  const p = getPreset(id)
  const o = typeof opts === 'number' ? { seconds: opts } : (opts ?? {})
  const s = createQueueSim(withOverrides(p.config, o.overrides))
  s.script = p.script ?? null
  const n = Math.round((o.seconds ?? p.runS) / DT)
  for (let i = 0; i < n; i++) tick(s)
  return s
}

/**
 * The seeded Ćevap-petak drain for k consumers (CEVAP_PETAK_PROFILE + CEVAP_PETAK_SEED unless given): the drain
 * record of the burst, or null when the queue did not empty within `seconds` (default 300). Check the goal
 * „Ispraznite red u < 20 s s najmanje potrošača” instantly with the slider's k: drainTrial(k)?.durationS < 20.
 */
export function drainTrial(k: number, opts: { seed?: number; profile?: RateProfile; seconds?: number } = {}): DrainRecord | null {
  const s = createQueueSim({ seed: opts.seed ?? CEVAP_PETAK_SEED, mode: 'queue', consumers: k, profile: opts.profile ?? CEVAP_PETAK_PROFILE })
  const n = Math.round((opts.seconds ?? 300) / DT)
  for (let i = 0; i < n && s.drain.last === null; i++) tick(s)
  return s.drain.last
}

/** The card numbers of a run (render the incident card from this, not from hard-coded text). */
export function cardNumbers(s: QueueState): Record<CardKey, number | null> {
  const t = s.totals
  const d = s.drain.last
  return {
    orders: t.orders,
    lost: t.ordersFailed + t.dropped + t.lostAutoAck,
    peak: d ? d.peak : null,
    drainS: d ? Math.round(d.durationS * 10) / 10 : null,
    dlq: t.dlq,
    duplicates: t.duplicates,
    retries: t.retries,
  }
}

/** Convenience for a „Nalet” button that matches the preset numbers (15/s × 10 s). */
export function cevapPetakBurst(s: QueueState): void {
  startBurst(s, BURST)
}
