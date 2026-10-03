# E2 „Red” – message-queue engine

Shared, seeded, pure-TypeScript simulation of producers → broker queue → competing potrošači, used by
lectures **06** (flagship „Kuhinjska šina”), **18** (KEDA scales klopa-worker on queue depth) and **24**
(fault deck: OOMKilled worker, poison message, queue buffering, logs / events / traces). No React, no DOM; the
only import from the kit is `src/kit/sim/math.ts`. Files run directly under Node 24 type stripping.

Reference model: `docs/research/sim-models.md` SIM 2 and `docs/research/proto/queue-sim.ts`; facts from
`docs/research/tech-facts.md` §7 (RabbitMQ 4.3.6), the RabbitMQ quorum-queue docs, the AWS SQS developer guide
(dead-letter queues) and the KEDA rabbitmq-queue scaler docs; lecture specs in `docs/curriculum.json` (06, 18, 24).

```
producer λ(t) ─► API ─► [ returns │ ready │ ready │ … ] ─► potrošač 1 … k ─► kitchen effect (DB tx) ─► SMS ─► ack
   profile        │      broker queue                       prefetch, ack      idempotency key       │ (external)
   bursts         │         ▲    ▲   └─► retry lane (backoff) ─┘                                      └─► SMS retry relay
                  │         │    └─ redelivery: RabbitMQ on connection loss + consumer_timeout,
                  │         │                   SQS when the visibility timeout expires (in-flight lane „invisible”)
   direct mode ───┘ (no queue, no waiting room: a free API worker does the work synchronously, else 503)
                                       DLQ ◄── delivery limit reached (RabbitMQ without a DLX: dropped;
                                               SQS without a DLQ: no limit at all)
```

## What it models

- **Producers**: inhomogeneous Poisson arrivals (time-change method, one Exp(1) draw per order, so a rate
  change from a slider takes effect immediately) or uniform arrivals; profiles `steady`, `burst`
  (Ćevap-petak 15/s × 10 s), piecewise-linear `curve` (lunch rush, compressed day with repeat), manual
  `startBurst` and `publishBatch` („+100 odmah”). Every order has a user from a seeded pool (L24 impact).
- **Direct mode („bez reda”)**: a **pure loss system with no waiting room** – an order needs a free API
  worker (radnik API-ja) for the whole job (cooking + SMS), otherwise 503 at once. That is Erlang B (9,5 %
  lost at only 50 % utilisation). It is a property of a server *without a waiting room*, not of every
  synchronous call: with an accept backlog and a 10 s client timeout an M/M/4 at 2/s loses ≈ 0,005 %. What
  stays true with a backlog is the burst and the slow dependency (the SMS case), through client timeouts.
  Client timeouts and client retries with backoff create ghost orders and a retry storm. Errors are split by
  type: `failed500` (processing / SMS), `failed502` (the worker crashed), `rejected503`, and `clientTimeouts`
  (the 504-like bucket); `failed5xx = failed500 + failed502`.
- **Queue mode**: FIFO broker, round-robin push to consumers with free **prefetch** capacity, **manual ack
  after processing** (at-least-once) or **auto-ack** (at-most-once). The four cells of „Potvrda i ponovna
  isporuka”: manual × crash before cooking → redelivered, cooked once; manual × crash after cooking →
  redelivered, **cooked twice**; auto × crash before → **lost**; auto × crash after → cooked once, nothing
  lost, nothing repeated (the message was acked at delivery).
- **Broker switch (CRITICAL in L06)**:
  - *RabbitMQ 4.3, quorum queue*: when a consumer crashes, its connection closes and every unacked delivery
    is requeued **immediately** (`redelivered = true`) to the quorum queue's **returns queue**: returns come
    back in the order they were returned, before regular messages. A delivery not acked within
    `consumer_timeout` (real 30 min, sim 60 s) **cancels the consumer** (AMQP 0.9.1 clients with
    `consumer_cancel_notify`, e.g. pika and the Java client): all its deliveries are returned, the job in
    progress still finishes, its ack has no effect, and the client re-subscribes after the job.
  - *SQS*: a received message is invisible for the **visibility timeout** (default 30 s). Nothing happens
    on a crash; the message reappears only when the timer runs out. A slow consumer past the timeout
    produces a duplicate. A late `DeleteMessage` still works if nobody received the message again (its
    receipt handle is still the latest). With a redrive policy whose `maxReceiveCount` > 3, a message received
    3 or more times moves to the back of the queue (AWS); otherwise a returned message stays near the front.
  - Each broker keeps **its own deadline** (`visibilityTimeoutS`, `consumerTimeoutS`): a 2 s SQS visibility
    does not become a 2 s consumer_timeout after a switch.
- **Delivery limit** (`maxDeliveries` = „Najviše isporuka”, default 5) – `deliveryLimitInfo(s)` says what it
  means on the current broker:
  - *SQS* counts every receive (`ApproximateReceiveCount`) against the redrive policy's `maxReceiveCount` =
    `maxDeliveries`. **Without a DLQ there is no redrive policy and no limit**: a failing message keeps coming
    back until the retention period expires (default 4 days; not reached in class), event „SQS bez DLQ-a nema
    maxReceiveCount …”, and `controlsView().maxDeliveries` is disabled.
  - *RabbitMQ 4.3* checks `delivery-count`, which counts **failed deliveries only**: connection loss / crash,
    `basic.reject` (`retryMode: 'immediate'`) and a failure sent through the retry queue (`'backoff'`). It is
    **not** incremented by `consumer_timeout`, by `basic.nack` (`retryMode: 'nack-requeue'`) or by a graceful
    return. A message is dead-lettered when delivery-count **exceeds** `delivery-limit`, so N deliveries =
    `x-delivery-limit: N − 1`; the quorum default 20 = **21 deliveries**
    (`BROKER_FACTS.rabbitQuorumDefaultDeliveries`). DLQ entries carry the real `x-delivery-count` (N > N − 1).
    A consumer that keeps timing out is never dead-lettered, and a nack-requeue poison message loops forever –
    the 4.3 pitfall (preset `l06-rabbit-nack-loop`). Without a dead-letter exchange the message is dropped.
- **Processing pipeline per job**: work (Exp, mean 1 s) → commit of the kitchen effect in one DB
  transaction (with the idempotency key: `INSERT … ON CONFLICT DO NOTHING` → „već skuhano”) → SMS call
  (external, outside the transaction) → ack. Failures: transient `pFail`, poison messages (always fail),
  SMS gateway down (the call times out after `smsTimeoutS`), OOM kill part-way through the job.
- **When the SMS fails after the commit** (`smsOnFailure`):
  - `'retry-sms'` (default): the order is acked and the SMS goes to a **retry relay** (full jitter, separate
    seeded stream) that sends it once the gateway is back. The order is never cooked again. This is the L06
    break-it „SMS-gateway pao”: every job still waits out the 5 s timeout (μ drops to 1/6), so the queue
    **climbs and then drains**, 0 lost, 0 duplicates.
  - `'nack-message'`: a naive handler throws → the whole message is nacked and redelivered → the order is
    **cooked again** unless idempotent (preset `l06-sms-down-nack`, 21 duplicates on seed 42).
  - Direct mode always answers 500 when the SMS fails (the synchronous chain).
- **SMS duplicate counter**: idempotency protects only the same-transaction effect. With `smsGuard`
  `'none'` a redelivery after the SMS sends it again; `'record-first'` (record, then send) never duplicates
  but loses the SMS when the send never happens; `'provider-key'` (provider idempotency key) does neither.
  The retry relay covers **gateway failures** only: its row is written when the SMS call fails, not in the
  commit transaction, so it is **not a transactional outbox** – with `'record-first'` a consumer that crashes
  after the commit and before the SMS call still loses the SMS (tested). A real outbox writes the SMS row in the
  same transaction and lets only the relay send (the L06 DeepDive).
- **Retries**: failure → full jitter `random(0, min(cap, base·2ⁿ))` (base 0,5 s, cap 30 s) through a retry
  lane (SQS per-message delay; RabbitMQ retry queue with TTL + dead-letter exchange, which republishes at the
  tail), `'immediate'` requeue (reject) or `'nack-requeue'`.
- **Overflow** (RabbitMQ only): `maxQueue` counts ready messages; `drop-head` (the RabbitMQ default)
  dead-letters or drops the oldest (`totals.dlqMaxLength`, apart from poison `totals.dlqDeliveryLimit`),
  `reject-publish` refuses the new order. SQS has no max length (`controlsView` disables the control).
- **Ordering**: the first kitchen effect of each order is compared with the order ID; with k > 1 or any
  redelivery the „izvan redoslijeda” counter rises and the kitchen ticket carries `outOfOrder`.
- **Capacity laws – fault-aware**: every capacity term (`theory()`, the `s.series.capacity` chart, the „Red
  raste” narration, the drain prediction) is Σμ of the running consumers under their **effective faults**: a
  healthy one 1 / (S + SMS delay), a `'slow'` one 1 / (S + SMS delay + 40 s), an `'oom'` one 0. The offered
  load includes the **retry load** λ × attempts per order (`attemptsPerOrder`: transient failures retried up to
  the limit, poison messages use the whole limit; Infinity when failures are never counted). So „Spori
  potrošač” never shows ρ < 1 next to a queue that grows without bound. M/M/k is shown only when the consumers
  are homogeneous (`theory().mmc`, flagged `approximate` when the retry load is folded into λ). Also: Little's
  law panel, the exact M/M/k time-in-system quantiles (`mmcSojournQuantile`), Erlang B, growth, drain time,
  measured drain episodes with the capacity that drained them.
- **Kubernetes extras**: restart policy (fixed 2 s for L06, or kubelet **CrashLoopBackOff**: the first exit
  restarts at once, then 10 s, 20 s … 300 s, reset after 10 min of running – compressed ÷10), OOMKilled exit
  137, kubectl RESTARTS, graceful scale-down, Pod names `klopa-worker-<pod-template-hash>-<suffix>` like E3, a
  **rolling update** (`rolloutConsumers`: new ReplicaSet within maxSurge / maxUnavailable, unhealthy old Pods
  first, like the deployment controller), Kubernetes events in E3's shape (`Created`, `Started`, `BackOff`,
  `Killing`, `ScalingReplicaSet`, `SuccessfulRescale`, `KEDAScaleTarget…`), and a **KEDA + HPA autoscaler**
  (0 ↔ 1 by KEDA activation and cooldown, 1 ↔ N by `desired = ceil(queue / target)` with 10 % tolerance,
  scale-up limit max(+100 %, +4) per sync, scale-down stabilisation window seeded with the current replicas).
- **L24 signals** – „metrics say that, traces say where, logs say why”: `workerLogs()` (`kubectl logs`, with the
  order's trace-id; an OOM kill leaves no app line – the reason is in `podViews().lastTermination`),
  `kubeEvents()` (`kubectl get events`), `orderTrace(orderId)` (a waterfall red → obrada → SMS → potvrda with
  retries, invisible SQS waits and the DLQ, for the last 300 orders), and RED series `s.series.errors` /
  `s.series.retries` with `metrics().errorRate` / `retryRate`.
- **Narration**: the event log tells the story without a UI: „Narudžbe stižu: λ 2/s; 4 potrošača, kapacitet
  4/s”, „Nalet: 15 narudžbi/s tijekom 10 s”, „Red raste: λ 15/s > kμ 4/s (+11 poruka/s)” (with „× 1,2
  pokušaja” under a retry load and „– potrošači spori: 2” under faults), „Nalet završio …”, „Nalet obrađen do
  kraja: 145 narudžbi, nijedna izgubljena”, „Red ispražnjen: vrh 113 poruka, prazan 52,7 s nakon vrha”,
  „Kraj scenarija (150 s)”. Frequent lines (DLQ, overflow, 503, retries …) are summed per second; a dragged
  consumer slider is one row („Broj potrošača: 4 → 12 → 4”).
- **External Pods** (`consumerSource: 'external'`): E3 owns the worker Pods, E2 owns the queue (see below).
- **DeepDive helpers** (`kafka.ts`): `kafkaStepperScript` (FNV-1a partitioning, offsets, lag, replay) and
  `fanoutScript` (work queue vs fan-out for „Red, pub/sub ili log”).

## What it deliberately simplifies (and why it is still true)

| Simplification | Why it does not teach anything false |
|---|---|
| Cooking takes Exp(1 s), not minutes. | Classroom value, not a real default; capacity is still `k / S` and every law (Little, M/M/k, Erlang B) is scale-free. |
| One queue, one consumer group; no exchanges. | The work-queue semantics (each message to one consumer) are exact. Fan-out is a deterministic script (`fanoutScript`), Kafka a DeepDive stepper (`kafkaStepperScript`). |
| Publishing is instant and never fails except on overflow; no publisher confirms, broker latency or broker failure. | The lessons are about consumers, acks and redelivery; adding failures elsewhere would only add noise. |
| `maxDeliveries` is a number of deliveries on both brokers; for RabbitMQ it stands for `x-delivery-limit: maxDeliveries − 1`. The separate `x-death` count of a DLX retry queue is folded into `deliveryCount`. | That is exactly when a quorum queue dead-letters (count > limit); `deliveryLimitInfo` shows the real argument and the quorum default (20 = 21 deliveries). What counts (crash, reject yes; nack, consumer_timeout, graceful return no) is the 4.3 behaviour. |
| SQS without a DLQ never expires a message (retention 4 days is not simulated) and keeps it near the front. | Nothing in class runs 4 days; the lesson – no redrive policy, no limit, the message keeps coming back – is exact. SQS gives no ordering guarantee, so „near the front” is one allowed order (with one consumer and immediate retries it can block the others; add a DLQ). |
| The RabbitMQ retry lane is an exact per-message delay. | Real setups use one retry queue per level (per-message TTL only expires at the head), the delayed-message plugin or 4.3's linear delayed retry; the observable behaviour (wait, then back) is the same. |
| `consumer_timeout` is checked every tick and compressed 30 min → 60 s. | The badge says „60 s (sim) · stvarno: 30 min”; a changed value says „10 s (sim) · skraćeno; stvarno zadano: 30 min” without a proportional „≈ 5 min”, because jobs and the 40 s slow-job extra run 1:1 – only this timer is shortened. |
| Auto-ack still respects prefetch as the client buffer. | Real RabbitMQ ignores QoS for auto-ack consumers, so a crash loses even more; the engine under-states the loss, never over-states it. |
| A graceful stop returns unstarted buffered deliveries at once (basic.nack requeue / visibility 0). | That is what a well-behaved worker does on SIGTERM; in 4.3 it does not use up delivery attempts. |
| The „crash after cooking” button fires after the SMS attempt (sent or failed) and before the ack. | That window exists in every at-least-once consumer and is the widest one. |
| The SMS retry relay is perfect (no relay crash, no broker for it). | It isolates the buffering lesson; the README and the lecture must not call it an outbox (see above). |
| Direct mode has no waiting room (no accept backlog). | Labelled as such („503: svi radnici API-ja zauzeti (nema čekaonice)”): it is the Erlang B model the curriculum prescribes; never present 9,5 % as a property of every synchronous call. |
| KEDA polls and the HPA syncs at fixed intervals, compressed ÷10 (`autoscaler.realPerSim` 10). The HPA uses spec replicas and ignores readiness and missing-metric nuances; the scale-up limit is applied per sync. The metric `'ready+unacked'` is what KEDA sees over the **http** protocol; over **amqp** it sees ready messages only (`metric: 'ready'`). | The formula, tolerance, activation (0 → 1 by KEDA), cooldown and stabilisation window are exact; every compressed duration in the narration and `scalerView().labels` carries its real value („30 s (sim · stvarno: 5 min)”). |
| The rollout counts only `status !== 'stopping'` Pods (Terminating Pods finish their job outside the count), uses absolute maxSurge / maxUnavailable (default 25 % of the replicas, rounded like Kubernetes) and a fixed start-up time. | The two inequalities a student checks (total ≤ desired + maxSurge, running ≥ desired − maxUnavailable) hold on every tick (tested); scale-down cleans unhealthy old Pods first, like the deployment controller. |
| Worker logs are Croatian application lines, Kubernetes events use real reasons and messages; no node events (`OOMKilling` is E3's, on its node). | `kubectl describe` information (OOMKilled, exit 137) is in `podViews().lastTermination`; the log of an OOM-killed container really just stops. |
| Traces are spans per order in sim time, kept for the last 300 orders (80 spans each). | Enough for the „Put jednog zahtjeva” waterfall; a failed attempt ends when the broker gets the message back (≤ 10 ms tick). |
| Flights are cosmetic hops, chained per message (a hop starts when the previous one lands, compressed when behind). | One ticket is never drawn in two places; the model times are unaffected (`consumerViews().ticketArriving` lets a cook wait for the ticket). |
| Arrivals are quantised to 10 ms ticks. | A job starts at the exact moment its consumer became free, so busy periods carry no tick bias (W and the p50 match M/M/4 theory within noise). |

## API

All functions are exported from `src/engines/queue/index.ts`. Times are **seconds of simulated time**.

### State and stepping

| Export | Description |
|---|---|
| `createQueueSim(patch?: QueueConfigPatch): QueueState` | New state; `patch` overrides `DEFAULT_CONFIG` (sim-models SIM 2). Emits the start line. |
| `step(state, dtSeconds)` (alias `stepQueue`) | Advance with the internal fixed 10 ms tick (accumulator); fires `state.script` (presets). Plugs into `useSimulation({ init, step })`. Ignores NaN, negative and 0; catch-up is capped at 2000 s per call. |
| `advance(state, dt, beforeTick?)` | The same loop with an extra hook before every tick. |
| `setStopAt(state, seconds \| null)` / `finished(state)` | Stop exactly at a run length (incident cards: 150 s); `step`, `stepWithScript` and `runFor` then do nothing, and the log says „Kraj scenarija (150 s)”. |
| `runFor(state, seconds)` / `tick(state)` | Headless helpers (exact tick counts). |
| `DT` = 0,01 | Internal timestep. |

`QueueConfig` (defaults in brackets): `seed` [42, fixed for the life of a state], `mode` `'queue'|'direct'`,
`broker` `'rabbitmq'|'sqs'`, `rate` [2], `profile` [{kind:'steady'}], `arrivals` `'poisson'|'uniform'`,
`consumers` [4], `consumerSource` `'internal'|'external'`, `serviceMeanS` [1], `serviceDist` `'exp'|'fixed'`,
`prefetch` [1], `pFail` [0], `pPoison` [0], `maxDeliveries` [5], `dlqEnabled` [true], `retryMode`
`'backoff'|'immediate'|'nack-requeue'`, `backoffBaseS` [0,5], `backoffCapS` [30], `visibilityTimeoutS`
[30, SQS, not compressed], `consumerTimeoutS` [60 sim = 30 min, RabbitMQ], `ackMode` `'manual'|'auto'`,
`idempotent` [false], `smsGuard` `'none'|'record-first'|'provider-key'`, `smsOnFailure`
`'retry-sms'|'nack-message'`, `smsGateway` `'ok'|'slow'|'down'`, `smsSlowS` [3], `smsTimeoutS` [5],
`maxQueue` [∞], `overflow` `'drop-head'|'reject-publish'`, `clientRetries` [0], `clientTimeoutS` [10],
`slowExtraS` [40], `consumerFault` `'none'|'slow'|'oom'`, `restart` [`RESTART_FIXED` 2 s], `autoscaler`
[`DEFAULT_AUTOSCALER`, disabled, maxReplicas 10 as E3, `realPerSim` 10], `users` [500], `sloS` [30],
`consumerNames` [`'potrošač'`; `'pod'` names workers by Pod name in events], `podNamePrefix` [`'klopa-worker'`].
Every value is clamped by `sanitizeConfig` (NaN → default), so selectors never return NaN.

### Actions (mutate the state; call inside `sim.mutate`)

Every action refreshes the newest chart sample, so a change made while paused shows on the charts at once.

| Action | Lecture control |
|---|---|
| `setConfig(s, patch)` | Every slider, toggle and segmented control. Side effects: consumer count, autoscaler on/off (off keeps the current replicas), SQS orphans requeued on a switch to RabbitMQ, mode switch (leftover backlog drains). Ignores `seed` and `consumerSource` (change them in `init` + reset) and `consumers` while the autoscaler or E3 owns the replicas. |
| `setConsumers(s, n)` | „Potrošači” 0–12 (a drag is one merged event row). |
| `setAckTimeout(s, simS)` | „Rok za potvrdu”: sets the active broker's deadline. |
| `startBurst(s, { rate = 15, durationS = 10 }): boolean` | „Nalet”. NaN / ∞ / ≤ 0 → false, nothing happens. |
| `publishBatch(s, n = 100): count` | „+100 odmah” (0–10 000; NaN → 0). |
| `publishPoison(s): orderId` | „Pošalji otrovnu poruku”. |
| `crashConsumer(s, id?, 'before-effect' \| 'after-effect'): CrashResult \| null` | „Sruši potrošača prije kuhanja”: without `id` only a consumer still cooking or an idle one – never one that already cooked; `null` when there is none (disable the button). „… nakon kuhanja, prije potvrde”: armed, fires after the next kitchen effect and SMS attempt. `CrashResult = { id, when, phase, committed, armed }`. |
| `crashAllConsumers(s): count` | Edge case: every consumer down. |
| `restartConsumerNow(s, id)` | Repair a crashed consumer (internal consumers only). |
| `slowConsumer(s, id?): id \| null` | „Spori potrošač”: the first running consumer without a fault (or `id`); null = none (disable the button). |
| `repairConsumer(s, id \| podName): boolean` | Success button: removes that consumer's fault. |
| `setConsumerFault(s, id \| podKey \| podName \| 'all', 'none' \| 'slow' \| 'oom'): count` | Fault per consumer or for the whole Deployment (patched in place; 'all' also applies to new Pods). Returns how many consumers it changed – 0 for an unknown target. |
| `rolloutConsumers(s, { fault = 'none', maxSurge?, maxUnavailable?, startupS? }): boolean` | L24 „fix it with a commit”: a new Pod template → new ReplicaSet (fresh names and ids, RESTARTS 0); old Pods (crashed first) are stopped within maxSurge / maxUnavailable (default 25 %). false in external mode. |
| `setSmsGateway(s, 'ok' \| 'slow' \| 'down', durationS?): boolean` | „SMS-gateway pao” / repaired. A finite duration recovers by itself; NaN or ≤ 0 → false. |
| `resetLittle(s)` | Restart the Little's-law measurement after changing λ. |
| `setFlightDuration(s, simS)` | Cosmetic hop length (default 0,3 s); pass 0,3 × speed so dots stay visible at 4×. Finished hops are culled by end time, so a change never leaves dead hops in the list. |

### External Pods (E3 owns scaling and restarts, E2 the queue)

With `consumerSource: 'external'` E2 creates no consumers, runs no internal autoscaler, never restarts a
worker itself and emits no Kubernetes events. Per frame:

| Export | Direction |
|---|---|
| `syncConsumers(q, pods: { key, ready, terminating?, fault? }[])` | E3 → E2. New Pod → consumer (starting until ready); ready → running (a crashed one restarts); running but not ready → its process is gone (deliveries returned); terminating or missing → graceful stop. `fault` sets that Pod's fault (e.g. 'oom' when E3 knows the memory limit is too low). |
| `killConsumer(q, key, 'OOMKilled' \| 'Error'): boolean` | E3 → E2: a fault E3 decided. |
| `drainTerminations(q): { key, consumerId, reason, exitCode, t }[]` | E2 → E3: containers E2 killed (the `'oom'` fault, crash buttons), so E3 marks them terminated and backs off. |
| `queueMetric(q, 'ready' \| 'ready+unacked')` | What a KEDA scaler would read. **E3's KEDA cannot consume it yet**: `cluster/keda.ts` integrates its own fluid queue every tick and its HPA reads `cfg.keda.queueLength` – there is no external-metric input (open question). |

### Selectors (cheap; call during render)

| Selector | Returns |
|---|---|
| `metrics(s)` | Ready, delayed, unacked, backlog, inSystem, oldest ages; consumers by status; utilisation (10 s); in/out rate, `errorRate`, `retryRate` (5 s); p50/p95 of successful jobs over 60 s (`null` when n < 20); `lost` (client gave up + dropped + auto-ack; **excludes the DLQ**), `unserved` (= lost + totals.dlq, both DLQ causes); ratios; SMS waiting in the relay; `lastDrain`; `totals`. |
| `theory(s)` | λ(t), `attemptsPerOrder`, `offered` (λ × attempts), μ of a healthy consumer, k, `slow`, `oom`, `capacity` Σμ, ρ = offered / capacity, stable, `homogeneous`, `approximate`, M/M/k result or null, growthPerS, backlog, drainTimeS, Erlang B loss for direct mode. |
| `deliveryLimitInfo(s)` | `{ broker, maxDeliveries, enforced, argName 'x-delivery-limit'\|'maxReceiveCount'\|null, argValue, overLimit 'dlq'\|'dropped'\|'none', productDefaultDeliveries, label }` – the slider badge, e.g. „5 isporuka = delivery-limit 4 · quorum zadano: 20 (21 isporuka)”. |
| `burstOutcome(s)` | Per-burst outcome over the burst's own order-ID range, **latched**: `{ startedAt, endedAt, firstOrderId, lastOrderId, orders, cooked, lost, pending, done, doneAt, failed, servedBursts }`; null before the first burst. |
| `duplicateGuard(s, mark)` | `{ triggered, prevented, duplicates, smsDuplicates }` since `markTotals(s)`; `triggered` = an already cooked order came back. |
| `orderOutcome(s)` | Whole-run `{ orders, cooked, pending, inDlq, dlqByDeliveryLimit, dlqByMaxLength, dropped, failed, lostAutoAck, allServed }` (allServed is momentary – not a goal check). |
| `burstState(s)` | The current or last burst incl. `happened`. |
| `markTotals(s)` / `totalsSince(s, mark)` | Counter epochs for goals that must ignore earlier experiments. |
| `runLatency(s)` | Whole-run n, mean, p50, p95, p99 (nearest rank on a 10 ms histogram). |
| `little(s)` | {elapsedS, L, lambda, W, lambdaW, departures}. |
| `ackTimeoutInfo(s)` | {broker, name, simS, defaultSimS, isDefault, compressed, `realEquivalentS` (SQS: simS; RabbitMQ: 1800 at the default, else null), realDefaultS, label}. |
| `controlsView(s)` | Per control {value, enabled, reason}: rate, consumers, `maxDeliveries` (disabled for SQS without a DLQ), `dlqEnabled`, `deliveryLimit`, maxQueue / overflow (disabled for SQS), seed (fixed), smsGateway, ackTimeout. |
| `consumerViews(s)` | Per consumer: key, `pod`, `revision`, status (`idle`, `busy`, `crashed`, `crashloop`, `starting`, `stopping`, `cancelled`), phase, progress 0..1, orderId, poison, committed, stale, buffered + ids, restarts, wait, lastTermination, fault, crashArmed, `ticketArriving` (its ticket is still flying in). |
| `podViews(s, { namePrefix? })` | kubectl rows: name `<prefix>-<pod-template-hash>-<suffix>`, `replicaSet`, `revision`, READY, STATUS (`KubectlPodStatus`), `shape` for the kit's `PodShape` (`'running'\|'creating'\|'crash'\|'oom'\|'terminating'`), RESTARTS, last restart ago, age, back-off wait in sim and real seconds. |
| `rolloutView(s)` / `currentReplicaSet(s)` | Rollout in progress {revision, replicaSet, startedAt, oldPods, newPods, newReady} or null; the current ReplicaSet name. |
| `workerLogs(s, { consumerId?, pod?, sinceS?, limit? })` | `kubectl logs`: the last 400 lines `{ id, t, consumerId, pod, level 'INFO'\|'WARN'\|'ERROR', orderId, traceId, text }`. |
| `kubeEvents(s, { sinceS? })` | `kubectl get events` in E3's `KubeEvent` shape `{ t, firstT, type, reason, object, message, count }`. |
| `orderTrace(s, orderId)` / `tracedOrders(s)` | `{ orderId, traceId, startS, endS, spans: { span, start, end, endS, open, consumerId, pod, attempt, outcome }[], truncated }`; span names `red`, `čekanje na ponovni pokušaj`, `nevidljivo do isteka roka`, `obrada`, `SMS`, `potvrda`, `odgovor` (direct), `DLQ`, `odbačeno`. |
| `impact(s, { sinceS?, quietS = 30 })` | L24: distinct failed orders, distinct users, first / last error, recoveredAt, MTTR. Score = failedOrders × affectedUsers. |
| `readyView(s, limit)` / `delayedView(s)` / `inflightView(s)` | Queue lane (returns first, stable ids, redelivered, receiveCount, deliveryCount, age), retry lane, unacked deliveries with their timer and SQS orphans. |
| `flightsView(s)` | Hops **in progress** (at most one per message): `producer`, `queue`, `retry`, `invisible` (SQS in-flight), `dlq`, `done`, `lost`, `sms`, `consumer:<id>`, progress 0..1; animate linearly. |
| `scalerView(s)` | KEDA/HPA: replicas, ready, starting, metric, `ceil(metric / target)`, active, countdowns in sim and real seconds (`secondsUntilPollRealS`, `secondsUntilHpaRealS`, `cooldownLeftRealS`), `labels` (polling, cooldown, hpaSync, stabilization), last decision, history. |
| `s.events` | ≤ 50 `{ id, t, kind, text (Croatian), tone, count }` for the kit `EventLog`; identical events at the same instant merge into „… (×2)”, so `${t}-${text}` keys stay unique. |
| `s.kitchen`, `s.smsLog`, `s.dlqRecent` | Last 12 kitchen tickets, last 12 SMS events, last 30 DLQ entries (reason, receiveCount, deliveryCount). |
| `s.series.*` | `Series` (0,5 s samples, last 2 min): ready, delayed, unacked, inSystem, busy, replicas, rateIn, rateOut, p95, dlq, duplicates, lost, oldestAgeS, lambda, capacity (fault-aware Σμ), errors, retries. |

### Theory and constants

`erlangB(c, A)`, `erlangC(c, A)`, `mmc(c, λ, μ)`, `mm1(λ, μ)`, `mmcSojournCdf(c, λ, μ, t)`,
`mmcSojournQuantile(c, λ, μ, p)`, `drainTimeS(backlog, k, μ, λ)`, `growthPerS(k, μ, λ)`,
`backoffWindowS(n, base, cap)`, `fullJitterS(rng, n, base, cap)`,
`hpaDesiredReplicas(metric, target, current, tolerance)`, `littleL(λ, W)`; engine-aware `attemptsPerOrder(s)`,
`capacityPerS(s)`, `consumerMu(s, c)`.

`TIMINGS` – each entry `{ sim, simValue, real, realValue, realKind, compressed, source, label }`: SQS visibility
30/30 s (not compressed), RabbitMQ consumer_timeout 60 s/30 min, KEDA polling 3/30 s, cooldown 30/300 s, HPA
sync 1,5/15 s, scale-down stabilisation 30/300 s, CrashLoopBackOff 1/10, 30/300, 60/600 s, worker Pod start
2 s (sim) vs 12 s – a value of E3's model (`realKind: 'model'`), never „stvarno”. `timingLabel(timing, simValue?)`,
`controlDurationLabel(simS, realPerSim)` and `formatDuration(s)` format the badges. `ACK_TIMEOUT`,
`BROKER_FACTS` (quorum delivery-limit 20 = 21 deliveries, nack not counted since 4.3, SQS retention 4 days /
14 days max, maxReceiveCount only with a DLQ, back-of-queue after 3 receives, SQS max visibility 12 h …),
`RESTART_FIXED`, `RESTART_CRASHLOOP` (sim), `RESTART_CRASHLOOP_REAL`, `DEFAULT_AUTOSCALER` (`realPerSim` 10),
`REAL_AUTOSCALER_TIMINGS` (`realPerSim` 1).

### Presets

`getPreset(id): QueuePreset` (typed – `PRESETS[id].script` does not typecheck for a generic id);
`createPresetSim(id, { stopAtEnd = true, overrides? })` builds the state for a live UI – the script is stored on
the state and fired by plain `step`; `runPreset(id, seconds | { seconds?, overrides? })` runs headlessly;
`stepWithScript(s, dt, script)` fires an extra script (the state's own is never fired twice);
`drainTrial(k, { seed?, profile?, seconds? })` runs the seeded Ćevap-petak with k consumers and returns its
drain record. `card` = { seed, runS, expect } holds the numbers an incident card prints – render them with
`cardNumbers(state)` (orders, lost, peak, drainS, dlq, duplicates, retries); `validated.test.ts` asserts every card.

| id | Lecture | Shows |
|---|---|---|
| `l06-cevap-petak-direct` | 06 incident card | Direct, burst, k 4, **seed 36343**, 150 s → 445 orders, 152 lost (card) |
| `l06-cevap-petak-live` | 06 flagship start | Same, queue, burst at **5 s**: depth > 50 within 10 s at 1×; peak 119, drains in 62,2 s, 0 lost |
| `l06-cevap-petak-queue` | 06, 24 | Same 445 orders through a queue → 0 lost, peak 113, drains in 52,7 s (card) |
| `l06-steady-direct` / `l06-steady-queue` | 06 | 378 of 4050 lost (9,3 %, card) vs 0 lost, p50 0,80 s, p95 3,09 s, W 1,084 s |
| `l06-sms-slow-direct` | 06 „Sinkroni lanac” | +3 s SMS: 142 of 244 lost (Erlang B(4, 8) = 57 %) |
| `l06-sms-down-queue` | 06 break-it | Default config, gateway down 20–50 s: depth climbs to 41 and drains in 13,6 s; 0 lost, 0 duplicates; 21 SMS deferred and resent |
| `l06-sms-down-nack` | 06 idempotency | Same outage, `smsOnFailure: 'nack-message'`: 21 kitchen duplicates (idempotent: 21 „već skuhano”) |
| `l06-rabbit-crash-after` | 06 | One kitchen duplicate + one duplicate SMS |
| `l06-sqs-slow-consumer` | 06 | A job longer than 30 s → visibility expires → duplicate |
| `l06-sqs-short-visibility` | 06 | Visibility 2 s → 12,5 % duplicates (149 / 1190) |
| `l06-poison-dlq` | 06, 24 | pFail 10 %, poison 2 %, **seed 254**: DLQ 24 of 1217, 236 retries (card; the lecture's numbers) |
| `l06-rabbit-nack-loop` | 06 | 4.3 pitfall, quorum default (21 deliveries): nack-requeue poison message, 64 attempts in 55 s, never in the DLQ |
| `l06-lunch-rush` | 06 | λ ramps to 6/s for 30 s → backlog peaks at 69, drains in 22,3 s |
| `l18-keda-day` | 18 | Compressed timings: 0 → 1 at 36 s, 1 → 6 by 106,5 s, 1 → 0 at 240 s („30 s (sim · stvarno: 5 min)”) |
| `l18-keda-day-real` | 18 | Real timings on a 1200 s day: 0 → 1 at 150 s, up to 8, 1 → 0 at 1140 s, 0 → 1 at 1350 s |
| `l24-oom-worker` | 24 | OOMKilled 137, CrashLoopBackOff, backlog 239 after 120 s, 5 killer messages in the DLQ; Pod names in events. Fix: `rolloutConsumers(s)` at 90 s → 3 new Pods Running at 96 s, queue empty by 300 s |
| `l24-poison` | 24 | One poison message: 4 retries with backoff, then the DLQ; its `orderTrace` shows 5 × obrada (fail), 4 waits, DLQ |

### DeepDive helpers

`fnv1a32(key)`, `kafkaPartition(key, P)`, `rangeAssign(P, C)`, `kafkaStepperScript({ partitions = 3, keys = 10,
hotKeyShare = 0,5, consumers = 2, records = 12, seed = 42 })` → 6 snapshots (records into partitions – the text
says FNV-1a here and murmur2 in Kafka – one consumer per partition, process then commit with lag, crash before
commit → reprocessing, replay, more consumers than partitions → idle), with Croatian number agreement and
`consumerLabels` (indices are 0-based, labels 1-based).

`fanoutScript({ mode: 'work-queue' | 'fanout', subscribers = ['kuhinja', 'sms', 'analitika'], messages = 3,
consumersPerQueue = 2, firstOrderId = 42 })` → snapshots `{ title, body, queues, deliveries: { msg, label, queue,
consumer }[] }`: a command („Skuhaj narudžbu 42”) goes to one queue and one consumer; an event
(„NarudzbaZaprimljena #42”) is copied into every subscriber's queue (M events → M × Q deliveries).

### Usage in a lecture component

```tsx
import { useEffect } from 'react'
import { Button, EventLog, Goals, SimFrame, Segmented, Slider, Stat, StatRow, Toggle, fmt, useSimulation } from '../../kit'
import {
  burstOutcome, consumerViews, controlsView, crashConsumer, createPresetSim, drainTrial, duplicateGuard, finished,
  markTotals, metrics, publishPoison, readyView, repairConsumer, setAckTimeout, setConfig, setSmsGateway,
  slowConsumer, startBurst, step, theory, type QueueState, type Totals,
} from '../../engines/queue'

// the epoch for „Nula dvostrukih narudžbi” lives in the state, so reset() clears it too
type KitchenState = QueueState & { dupMark?: Totals }

export function KuhinjskaSina() {
  const sim = useSimulation<KitchenState>({ init: () => createPresetSim('l06-cevap-petak-live', { stopAtEnd: false }), step })
  const s = sim.state
  const m = metrics(s)
  const ui = controlsView(s)
  const th = theory(s)
  const set = (patch: Parameters<typeof setConfig>[1]) => sim.mutate((x) => setConfig(x, patch))
  const cooks = consumerViews(s)
  const canCrash = cooks.some((c) => (c.status === 'busy' && c.phase === 'work' && !c.committed) || c.status === 'idle')
  const slowId = cooks.find((c) => c.fault === 'slow')?.id
  const burst = burstOutcome(s)
  const dup = s.dupMark ? duplicateGuard(s, s.dupMark) : null
  // incident cards: setStopAt / createPresetSim(id) stop the model – pause the loop too
  useEffect(() => {
    if (finished(s) && sim.running) sim.pause()
  })
  return (
    <SimFrame
      title="Kuhinjska šina"
      sim={{ ...sim, time: s.t }}
      showTime
      hint="Pošaljite nalet pa ispraznite red za manje od 20 s s najmanje potrošača."
      controls={
        <>
          <Segmented label="Način" value={s.config.mode} onChange={(v) => set({ mode: v })}
            options={[{ value: 'direct', label: 'bez reda' }, { value: 'queue', label: 's redom' }]} />
          <Segmented label="Posrednik" value={s.config.broker} onChange={(v) => set({ broker: v })}
            options={[{ value: 'rabbitmq', label: 'RabbitMQ' }, { value: 'sqs', label: 'SQS' }]} />
          <Slider label="Potrošači" value={ui.consumers.value} min={0} max={12} disabled={!ui.consumers.enabled}
            onChange={(v) => set({ consumers: v })} />
          <Slider label="Najviše isporuka" hint={ui.deliveryLimit.label} value={ui.maxDeliveries.value} min={1} max={25}
            disabled={!ui.maxDeliveries.enabled} onChange={(v) => set({ maxDeliveries: v })} />
          <Toggle label="DLQ" hint={ui.dlqEnabled.reason ?? undefined} checked={ui.dlqEnabled.value} onChange={(v) => set({ dlqEnabled: v })} />
          <Slider label="Rok za potvrdu" hint={ui.ackTimeout.label} value={ui.ackTimeout.simS} min={1} max={60}
            onChange={(v) => sim.mutate((x) => setAckTimeout(x, v))} format={(v) => `${v} s`} />
          <Toggle label="Idempotentnost" checked={s.config.idempotent}
            onChange={(v) => sim.mutate((x) => { setConfig(x, { idempotent: v }); x.dupMark = markTotals(x) })} />
          <Button onClick={() => sim.mutate((x) => void startBurst(x))}>Nalet</Button>
          <Button variant="danger" disabled={!canCrash} onClick={() => sim.mutate((x) => void crashConsumer(x))}>
            Sruši potrošača prije kuhanja
          </Button>
          <Button variant="danger" onClick={() => sim.mutate((x) => void crashConsumer(x, undefined, 'after-effect'))}>
            Sruši potrošača nakon kuhanja
          </Button>
          {slowId === undefined
            ? <Button variant="danger" onClick={() => sim.mutate((x) => void slowConsumer(x))}>Spori potrošač</Button>
            : <Button variant="success" onClick={() => sim.mutate((x) => void repairConsumer(x, slowId))}>Popravi potrošača</Button>}
          <Button variant="danger" onClick={() => sim.mutate((x) => void setSmsGateway(x, 'down', 30))}>SMS-gateway pao</Button>
          <Button variant="danger" onClick={() => sim.mutate((x) => void publishPoison(x))}>Pošalji otrovnu poruku</Button>
        </>
      }
      stats={
        <StatRow>
          <Stat label="U redu" value={m.ready} sub={`ρ = ${Number.isFinite(th.rho) ? fmt.num(th.rho, 2) : '∞'} · kapacitet ${fmt.num(th.capacity, 1)}/s`} />
          <Stat label="p95" value={m.p95 === null ? 'n/a' : fmt.ms(m.p95 * 1000)} />
          <Stat label="Izgubljeno" value={m.lost} tone={m.lost > 0 ? 'bad' : 'ok'} />
          <Stat label="DLQ" value={m.totals.dlq} sub={`otrovne ${m.totals.dlqDeliveryLimit} · red pun ${m.totals.dlqMaxLength}`} />
          <Stat label="Dvostruke narudžbe" value={m.totals.duplicates} tone={m.totals.duplicates > 0 ? 'bad' : 'ok'} />
          <Stat label="SMS poslan dvaput" value={m.totals.smsDuplicates} />
        </StatRow>
      }
    >
      {/* Stage: readyView(s) as tickets, consumerViews(s) as cooks (key = id; draw progress once !ticketArriving),
          flightsView(s) as one pooled SVG layer of circles. */}
      <p>{readyView(s, 20).length} listića · {cooks.filter((c) => c.status === 'busy').length} kuhara radi</p>
      <Goals
        goals={[
          { text: 'Ćevap-petak bez izgubljene narudžbe', done: (burst?.servedBursts ?? 0) > 0 },
          { text: 'Ispraznite red u < 20 s s najmanje potrošača', done: (drainTrial(s.config.consumers)?.durationS ?? Infinity) < 20 && s.config.consumers <= 7 },
          { text: 'Nula dvostrukih narudžbi kad potrošač padne nakon kuhanja', done: dup !== null && dup.triggered && dup.duplicates === 0 },
          { text: 'Otrovnu poruku odvojite u DLQ', done: s.dlqRecent.some((e) => e.reason === 'max-deliveries' && e.poison) },
        ]}
      />
      <EventLog events={s.events} />
    </SimFrame>
  )
}
```

`reset()` rebuilds the state from `init`, so the same seed replays the same run (change the seed there).
Read controls from `controlsView(s)` / `s.config` (not React state), so they stay correct after a reset.
`drainTrial` runs a 300 s headless sim (≈ 10 ms) – memoise it on k in a real component (`useMemo`). For a
preset with a script, `createPresetSim(id)` is enough: plain `step` fires it. At 1× the default config is
calm; start the flagship from `l06-cevap-petak-live` (burst at 5 s) or with `useSimulation({ speed: 4 })`.

### L06 goal recipes

- **„Ćevap-petak bez izgubljene narudžbe”**: `(burstOutcome(s)?.servedBursts ?? 0) > 0` – latched per burst, over
  the burst's own orders, so earlier losses or a poison message in the DLQ do not block it and the card never
  flickers; a burst with drop-head losses or 0 consumers does not pass. (`orderOutcome().allServed` is whole-run
  and momentary – not a goal check.)
- **„Ispraznite red u < 20 s s najmanje potrošača”**: judge it on the **seeded** run: `drainTrial(k)?.durationS
  < 20` with the slider's k and k ≤ 7 (k 6 = 24,2 s, k 7 = 17,9 s). A live „Nalet” at a random moment is
  stochastic (over seeds 1–100, k 7 misses 20 s in 16 runs and k 6 makes it in 34); compare a live drain with
  `lastDrain.predictedS`, the theory for the same drain (fault-aware).
- **„Nula dvostrukih narudžbi …”**: `const mark = markTotals(s)` when the attempt starts (e.g. idempotency
  turned on; keep it in the state so `reset()` clears it), then `duplicateGuard(s, mark)`: `triggered &&
  duplicates === 0` – a crash after cooking (RabbitMQ) or a job slower than the visibility timeout (SQS) must
  actually have happened.
- **„Otrovnu poruku odvojite u DLQ”**: `s.dlqRecent.some((e) => e.reason === 'max-deliveries' && e.poison)`
  (or `totals.dlqDeliveryLimit > 0`) – not `totals.dlq`, which a full queue with drop-head also raises. On SQS
  this needs the DLQ on (no DLQ = no limit).

### Post-lecture review additions (2026-10)

- `crashConsumer(s, id?, 'after-commit')` („Sruši potrošača između kuhanja i SMS-a”): armed like `'after-effect'`, but the consumer dies right after the kitchen commit, before the SMS call. Redelivery cooks again unless idempotent; with `smsGuard: 'record-first'` the SMS was recorded in that commit, so the retry skips it and the SMS is lost (`totals.smsLost`). `CrashResult.when` and `Consumer.crashArmedPoint` (optional) carry the new point; the existing two points are unchanged.
- `fanoutScript`: the first fan-out sentence now reads „Pretplatnici (kuhinja, sms, analitika) imaju svaki svoj red …” (capitalised). The `nack-loop` event says „RabbitMQ: basic.nack …” (no version in the sim UI).

## Validated numbers

`node --test src/engines/queue/*.test.ts` reproduces these (119 tests: `validated.test.ts`, `queue.test.ts`,
`api.test.ts`, `theory.test.ts`, `fixes.test.ts`). Multi-seed figures: mean ± standard deviation; the seeds and
run lengths are stated.

| Scenario (sim-models SIM 2) | Theory / prototype | Engine, documented seed | Engine, across seeds |
|---|---|---|---|
| Direct, 2/s, k 4 | Erlang B 9,52 % (prototype 10,3 %) | seed 42, 2000 s: 9,3 % (378/4050) | seeds 1–40 × 4000 s: 9,47 ± 0,42 % (pooled 9,48 %) |
| Queue, same load | M/M/4: p50 0,783 s, p95 3,150 s, W 1,087 s (prototype p50 0,77) | 0 lost; p50 0,80; p95 3,09; W 1,084 | seeds 1–10 × 2000 s: p50 0,80 ± 0,02; p95 3,23 ± 0,10; W 1,11 |
| Burst 15/s × 10 s, direct, 150 s | 152 of 445 lost | seed 36343: **152 of 445** (seed 42: 142 of 414) | seeds 1–16: 33,4 ± 2,8 % lost |
| Burst, queue, k 4 | peak ~100; drains ~50 s (pred. 55) | 0 lost; peak 113; 52,7 s | seeds 1–16: 0 lost; peak 114,5 ± 13,9; drain 57,5 ± 18,0 s |
| Burst, queue, k 8 | peak 66; ~15 s | peak 71; 13,0 s | seeds 1–16: peak 73,7 ± 13,4; drain 12,7 ± 3,3 s |
| „< 20 s s najmanje potrošača” | pred. k 7 (80 / 5 = 16 s) | `drainTrial`: k 4 52,7 s, k 6 24,2 s, k 7 17,9 s, k 8 13,0 s | seeds 1–100: k 7 < 20 s in 84, k 6 in 34 |
| pFail 10 %, poison 2 %, 600 s | DLQ 24 of ~1245; 236 retries | **seed 254: DLQ 24 of 1217; 236 retries** (seed 42: 33 / 277) | seeds 1–6: DLQ 22,8 ± 4,0 of 1223; retries 220 ± 23 |
| Attempts per order at pFail 10 %, poison 2 %, limit 5 | 0,98·(1 − 0,1⁵)/0,9 + 0,02·5 = 1,189 | seed 254, 2000 s: 1,197 deliveries per message | seeds 1, 2: 1,186 / 1,209 |
| SQS visibility 2 s, mean service 1 s | e⁻² = 13,5 % (prototype 13 %) | 12,5 % (149/1190); 0 idempotent | seeds 1–6 × 1000 s: 13,5 ± 0,7 % |
| ρ 0,5 / 0,75 / 0,875 / 0,95, p50 | exact M/M/4: 0,783 / 1,156 / 1,898 / 3,986 s (prototype 0,77 / 1,12 / 1,86 / 3,88) | – | seeds 1–10 × 3000 s: 0,80 / 1,18 / 1,92 / 4,06 s |
| Mean W vs M/M/4 | 1,087 / 1,509 / 2,476 / 5,457 s | – | 1,11 / 1,54 / 2,50 / 5,39 s |
| Little's law | L = λW | ρ 0,95, seed 42: 22,35 vs 22,32 | within 1 % at every ρ |
| All 4 consumers „spori” (+40 s), λ 2 | capacity 4/41 = 0,098/s, ρ 20,5, growth 1,90/s | seed 42, 100 s: backlog 193, „Red raste … spori: 4” | – |
| 2 of 4 slow, λ 2,5 | capacity 2,049/s < λ → unbounded, M/M/k hidden | seed 42, 300 s: backlog 125, p95 51 s | – |
| SMS gateway down 30 s (default, retry relay) | depth climbs then drains | seed 42: peak 41, drained 13,6 s, 0 duplicates | seeds 42, 1, 2, 3: 0 duplicates |
| RabbitMQ consumer_timeout 10 s, all consumers slow | 4.3: not counted → never DLQ | seed 1, 400 s: ≥ 10 timeouts, DLQ 0, delivery-count 0 | – |
| RabbitMQ quorum default delivery-limit 20 | dead-lettered when x-delivery-count > 20 | `maxDeliveries` 21 (reject): 21 deliveries, DLQ with x-delivery-count 21; nack-requeue: ≥ 55 attempts in 60 s, DLQ 0 | – |
| SQS without a DLQ, poison | no maxReceiveCount → returns until retention | 300 s: > 10 deliveries, 0 dropped, 0 DLQ | – |
| Rollout, l24-oom-worker at 90 s, maxSurge 1 / maxUnavailable 0 | total ≤ 4, running never removed below 3 | 3 new Pods Running (R0) at 96,0 s (patched in place: 100,9 s, RESTARTS 8); no OOM after | invariants hold on every tick for (1,0), (0,1), (2,1) |
| KEDA (L18 model) | ceil(queue/10), 0↔1 by KEDA | compressed day: 0→1 at 36 s, 1→6 by 106,5 s, 1→0 at 240 s; real day: 1→0 at 1140 s, 0→1 at 1350 s | – |
| HPA enabled with 4 idle consumers | window seeded with 4 | held 30 s (sim), then 4 → 1 | – |
| CrashLoopBackOff (÷10) | kubelet: 0, 10, 20, 40 … 300 s | 0, 1, 2, 4, 8, 16, 30, 30 s; after a reset the next crash restarts at once | – |

The prototype pushed returned messages to the tail, let a late ack delete a re-received message and had a tick
bias in busy periods, which is why its p50s sit 2–3 % under exact M/M/4 theory; the engine reproduces the
theory (`mmcSojournQuantile`), not the prototype.

## Which lectures use what

- **06 Redovi poruka i događaji**: everything. Modes and broker switch; „Narudžbe/s”, „Nalet”, „+100
  odmah”; „Potrošači”, `pFail`, `pPoison`, „Najviše isporuka” with `deliveryLimitInfo(s).label` as the badge
  (the curriculum's „RabbitMQ quorum: 20” = 21 deliveries), the DLQ toggle (`controlsView().dlqEnabled`, SQS:
  no DLQ = no limit), „Rok za potvrdu” (`setAckTimeout` + `ackTimeoutInfo` for the badge), ack mode,
  idempotency, `smsGuard` / `smsOnFailure: 'nack-message'` for the „Ključ idempotentnosti” scene, `maxQueue` /
  `overflow`; break-it buttons map to `setSmsGateway`, `crashConsumer` (both variants), `slowConsumer` /
  `repairConsumer`, `publishPoison`. Goals: see the recipes above. The Little panel uses `little()`, the M/M/k
  „you are here” dot `theory()` (hide it when `mmc` is null), the depth chart `s.series.ready` with `lambda` and
  `capacity`. „Red, pub/sub ili log” uses `fanoutScript()`, the Kafka DeepDive `kafkaStepperScript()`. Start the
  live flagship from `l06-cevap-petak-live`. **The incident card must state seed 36343** (or quote seed 42's
  414 / 142) – see open questions; `l06-poison-dlq` (seed 254) reproduces the lecture's DLQ 24 / 236 retries.
- **18 Automatsko skaliranje**: the flagship is E3 (SIM 4) with a KEDA panel. Ownership: **E3 owns Pods and
  scaling, E2 owns queue dynamics.** Today the queue metric cannot flow into E3's KEDA (no external-metric
  input), so pick one per panel: (a) E3's KEDA alone (fluid queue, perWorkerRate 2, real timings), or (b) a
  standalone E2 KEDA panel (`autoscaler`, `l18-keda-day`, `scalerView()` formula text and countdowns with real
  equivalents, `kubeEvents()` for `KEDAScaleTargetActivated` / `SuccessfulRescale`), compressed ÷10 and
  labelled; on E3's clock use `l18-keda-day-real` (run at 10–30×). E2's worker is discrete (μ = 1/s), E3's
  fluid – never mix numbers of the two in one panel. Show the ScaledObject with an **http** host when the metric
  is `'ready+unacked'` (amqp counts ready messages only; then use `metric: 'ready'`).
- **24 Dan izdanja**: fault deck: `l24-oom-worker` (`consumerFault: 'oom'`, `RESTART_CRASHLOOP`, events name
  Pods) – `podViews()` for `kubectl get pods` (OOMKilled / 137, CrashLoopBackOff, RESTARTS, real back-off,
  `shape` for PodShape), `kubeEvents()` for `kubectl get events` (BackOff), `workerLogs()` for `kubectl logs`
  (the log just stops – OOM), the fix by commit = `rolloutConsumers(s)` (new ReplicaSet, RESTARTS 0);
  `l24-poison` (retries, then DLQ; `orderTrace()` waterfall, ERROR lines with the same trace-id); RED from
  `metrics().rateOut / errorRate / p95` and `s.series.errors`; score inputs from `impact()`. If E3 runs the
  worker Pods, use the external bridge (`syncConsumers` with `fault`, `drainTerminations`) – then E3 owns the
  events and the rollout.

## Open questions (for the curriculum owner / other engines)

- L06 incident card: `docs/curriculum.json` says „seed 42” with the hook 445 / 152; this engine gives 414 / 142
  for seed 42 and 445 / 152 for seed 36343. Change the card's seed or the hook (render it from
  `cardNumbers(runPreset('l06-cevap-petak-direct'))`).
- L06 and sim-models list the prototype's p50s (0,77 / 1,12 / 1,86 / 3,88 s), 10,3 % loss, peak ~100 / k 8
  peak 66 as validated; the engine shows the exact theory (0,783 / 1,156 / 1,898 / 3,986 s, Erlang B 9,52 %) and
  peak 113 / 71 on the documented seed. Quote the engine's numbers via `cardNumbers` / `runPreset`.
- The curriculum's slider label „RabbitMQ quorum: 20” should read „delivery-limit 20 = 21 isporuka” (or use
  `deliveryLimitInfo(s).label`).
- E3 (`src/engines/cluster/keda.ts`) needs an external queue-metric input (`setExternalQueueMetric(s, n)` or
  `keda.source: 'external'` that skips its fluid integration) before an L18 panel can show E2's real messages
  driving E3's KEDA.
- The L06 break-it „queue mode keeps accepting while depth climbs then drains” holds for the default
  `smsOnFailure: 'retry-sms'`; with a naive handler (`'nack-message'`) the same outage re-cooks orders.
- tech-facts §7 should record the RabbitMQ 4.3 behaviour: delivery-count counts only failed deliveries (nack and
  consumer_timeout are not counted), a message is dead-lettered when the count exceeds the limit (default 20 →
  21 deliveries), returns are requeued in return order; and the SQS facts (maxReceiveCount only in a redrive
  policy, back of the queue after 3 receives only with maxReceiveCount > 3).

## Checks

```bash
node --test src/engines/queue/*.test.ts                    # 119 tests
npm run -s typecheck 2>&1 | grep src/engines/queue          # prints nothing
npx eslint src/engines/queue                                # prints nothing
```
