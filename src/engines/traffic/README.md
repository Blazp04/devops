# E1 Promet: traffic and load-balancing engine

`src/engines/traffic/` is a shared, seeded engine for traffic and load balancing. Lectures 02, 03, 04, 05 and 14 use it, and so does the capstone, 24. It is plain TypeScript, with no React and no DOM. Its only import from outside the folder is `src/kit/sim/math.ts`, for `createRng`, `Series` and `plural`. Every file runs directly under Node 24 type stripping.

The engine follows `docs/research/sim-models.md`, "SIM 1". With the same settings, it reproduces the validated prototype `docs/research/proto/lb-sim.ts` **to the request**. See [Validated numbers](#validated-numbers).

```
node --test src/engines/traffic/*.test.ts     # 205 tests, about 2 s
```

| File | Contents |
|---|---|
| `types.ts` | All public types: config, state, entities and events |
| `constants.ts` | `DT_MS`, workloads, server sizes, `TIMING` (sim vs real), Croatian labels and model notes |
| `capacity.ts` | `workersFor`, `capacityOf`, `suggestedWeights`, the `nPlusOne` check and `latencyFloorMs` |
| `algorithms.ts` | `pickBackend` (random, rr, wrr, lc, wlc, p2c, lrt, hash, chash) |
| `hashing.ts` | FNV-1a+fmix32 hash, `hash mod N`, the consistent-hash ring and `movedFraction` |
| `engine.ts` | `createTraffic`, `step`, `tick` and every action |
| `selectors.ts` | `metrics`, `serversView`, `littleCheck`, `endpointSlice`, `sessionSummary`, `redMetrics`, flights and progress, `findRequest`, `mark`/`since`, `affectedUsers`, `recentEvents`, `probeTimeline` |
| `run.ts` | Headless runs: `runScenario`, `compareAlgorithms` and `routeSequence` |
| `presets.ts` | `SCENARIOS`: the configuration behind every incident card and validated number |
| `formulas.ts` | M/M/1, Erlang B/C, Little, availability, downtime, Amdahl, USL and cache-aside |
| `availability.ts` | L03 "Arhitekt dostupnosti": a seeded year in 10 s, compared with the formulas |
| `testing.ts` | Typed `node:test` and `node:assert` helpers for the tests only (the site bundle never imports it) |
| `traffic.test.ts` | Validated numbers, every action, edge cases, fuzzed invariants in all four modes |
| `regressions.test.ts` | One `describe` per finding of the second review (error codes, passive check, drain, N+1, Service lab …), plus the defects found while verifying those fixes |

---

## What it models

### The worker-pool server (SIM 1)
Each server has vCPU and RAM. It runs a pool of **radnici** (workers), one request each, sized to RAM:

```
W        = max(1, floor((RAM_MB − 512) / memMB))   1 GB→2, 2→6, 4→14, 8→30, 16→62
cap_cpu  = vCPU · 1000 / cpuMs
cap_mem  = W · 1000 / (cpuMs + ioMs)
capacity ≈ min(cap_cpu, cap_mem)
```

Klopa's `klopa-api` uses this exact model: Django behind gunicorn with synchronous workers, about 256 MB each. Show `MODEL_NOTES.workerPool` and `MODEL_NOTES.asyncNote` next to the sim.

| Workload (`WORKLOADS`) | cpuMs (exp. mean) | ioMs (fixed) | memMB | Bottleneck |
|---|---|---|---|---|
| `api` "API" (default) | 200 | 300 | 256 | mostly CPU |
| `io` "I/O (čeka bazu)" | 50 | 1000 | 256 | RAM / workers |
| `cpu` "CPU (obrada fotografija)" | 400 | 50 | 256 | CPU |

Each 10 ms tick runs these steps in order. The order mirrors the prototype, which is why the numbers match exactly.

1. Run scheduled actions.
2. Lifecycle: `crashed → starting → up`, boot and resize.
3. Service termination timers.
4. Probes.
5. EndpointSlice propagation.
6. Incident detection.
7. Arrivals: Poisson (or uniform). Each request draws `cpu = cpuMs·Exp(1)` and a client, and is routed.
8. LB wait timers: manual queue and connect timeouts.
9. Each server, in rack order. If the server is out of memory, it crashes (OOM). Then:
   - queued requests older than 5 s → **504**;
   - in-flight requests older than 5 s → **504**, but the radnik keeps going (**wasted work**);
   - `share = min(1, vCPU / nCpu)`, because one request never uses more than one core;
   - CPU first, then I/O;
   - completions free their radnik, and the queue refills the pool FIFO;
   - drain state is recomputed (see `drainServer`).
10. Windows, the session-loss summary line and 0.5 s chart samples.

A request goes to a radnik if `inflight < W`. Otherwise it joins the FIFO queue if `queue < queueMax` (default 10). Otherwise it gets **503**. Latency percentiles are nearest-rank (`sorted[ceil(p·n) − 1]`) over **successful requests only**, in a 10 s window, and are `null` ("n/a") below 20 samples. Goodput uses a 5 s window. The error rate uses 10 s and is split into 502 / 503 / 504 / `refused`.

Chart series (`state.series`, one point per 0.5 s, 60 s): `goodput` and `errors` use the same 5 s window as `metrics().goodput`, so a chart and the stat next to it agree. **`series.p95` holds `NaN` while fewer than 20 successes are in the window** ("n/a", e.g. during "Izvuci utikač"). It never holds 0 for "no data". A chart must break the line at `NaN`; the kit's `LineChart` cannot do that yet (see the open question at the end), so don't pass `series.p95.values` to it unfiltered.

### Routing modes (`cfg.mode`)
Only an **L7 load balancer** speaks HTTP to the client, so only it can turn a dead backend into 502 / 503 / 504. Everywhere else a dead backend is a refused or reset connection (`'refused'`, "odbijena veza"), because nothing in the path can write an HTTP response.

| Mode | Lecture | Routing | Errors as the client sees them |
|---|---|---|---|
| `direct` | L02 | Clients talk to `servers[0]`; there is no proxy | Crash or OOM → `'refused'`; full queue → 503 (the app itself answers); hang or off → timeout after 5 s |
| `dns` | L03 cliffhanger, L04 hook | Each client's resolver caches an A-record order for `dns.ttlMs`. The authoritative server rotates the order. There are no health checks. | Same as `direct` |
| `lb`, `layer: 'L7'` (default) | L04, L05 | A classic load balancer: algorithm, active and passive checks, retry, fail-open, drain | Refused or reset → **502**; connect timeout (machine off) → **504** Gateway Timeout; no healthy backend → **503**; client gave up → 504 |
| `lb`, `layer: 'L4'` | L04 envelope scene | Balances connections; keep-alive / pool clients stay pinned | Refused, reset, connect timeout or no backend → `'refused'` (an L4 balancer just closes the connection); client gave up → timeout |
| `service` | L14, L24 | kube-proxy: a uniformly **random ready endpoint per new connection** (falls back to serving-terminating endpoints only when none is ready). Connections can stay open (keep-alive or pool), and established connections stay pinned. `sessionAffinity: ClientIP` pins by source IP. | Crashed, exited or SIGTERM'd Pod → `'refused'` (RST); **0 endpoints → `'refused'`** (kube-proxy installs a REJECT rule); full queue → 503 from the app; client gave up → timeout |

The course files every "client gave up after 5 s" under 504 (the L02 and SIM 1 split is 503 / 504 / odbijeno). Label it with `errorLabel(504, s.cfg.mode, s.cfg.layer)`: behind the L7 LB it reads "504 isteklo vrijeme"; in `direct`, `dns`, `service` and behind an L4 LB it reads "isteklo vrijeme (klijent odustao)", because no 504 response exists there. The event log follows the same rule (it says "(504)" only behind the L7 LB). With an LB in front, a client that gives up is logged by NGINX as 499 and does **not** count against the server; NGINX's own `proxy_read_timeout` is 60 s (`TIMING.lbReadTimeout`), so it never fires in the sim.

### Failure modes (L05)
| Action | Truth | What clients see | LB / kube-proxy |
|---|---|---|---|
| `crashServer` "Sruši proces" | Port closed, RST | Instant 502 behind the L7 LB (`refused` without one); requests inside fail (reset) | Probes fail at once and detection takes 2 failures. **Least connections black-holes it**, because it shows 0 active (logged as `blackHole`). |
| `powerOff` "Ugasi stroj" / "Izvuci utikač" | No RST | The LB waits `connectTimeoutMs` (1 s sim; real NGINX 60 s, AWS ALB 10 s), then **504** Gateway Timeout (L4: closed connection). Requests inside hang until the client gives up. | Probes time out (+1 s) |
| `hangServer` "Zamrzni" | Accepts connections, never answers | Every request ends as a hollow timeout after 5 s | Probes time out. Parked requests count as active, so LC avoids it. Passive checks don't eject it (client timeouts never count). |
| `drainServer` "Isprazni" (`lb` mode only) | Process up | No new connections; in-flight requests finish. Connections already pinned to it (L4 keep-alive / pool) keep carrying requests until `lifecycle.deregistrationDelayMs` (10 s sim; real AWS ALB/NLB 300 s), then the LB closes them. | "sigurno za uklanjanje" (`drained`, `safeToRemove`) is recomputed every tick: nothing in progress **and** no pinned connection |
| `restartServer` "Ponovno pokreni" | Kills in-flight requests, then 3 s warm-up | 502 (L7) / refused while warming up, if the LB still thinks it is healthy | Probes only |
| `setLeak`, `configure({ unboundedWorkers: true })` | Memory grows past RAM → OOM | Requests inside → 502 / refused. Classic servers restart after 6 s, then 3 s warm-up. In Service mode: OOMKilled, then the kubelet's CrashLoopBackOff. | — |
| `setSlow(id, 3)`, label `SLOW_FAULT_LABEL` "Sporiji procesor" | CPU work × 3: the extra time holds a core, so the server shows 100 % CPU | Higher latency and timeouts | WRR keeps sending its share; LC adapts |
| `setLbUp(false)` (`lb` mode only) | The LB itself is down | Everything is `refused` (the dots die at the LB) | — |
| `setRedisUp(false)` | Redis sessions are gone (no persistence) | Everyone is logged out once | — |

`setSlow` is deliberately **not** called "Spori disk": a slow disk shows as I/O wait with idle cores, while this model (×3 CPU demand, from the curriculum and SIM 1) fills the CPU. Keeping the maths and calling it a slower CPU (a noisy neighbour, a throttled CPU) keeps the validated WRR-versus-LC numbers and makes the CPU lanes truthful.

Active checks (`lb` mode) run every `intervalMs`, which defaults to 2 s (sim; real AWS ALB is 30 s). They are phase-staggered by default, with a 1 s timeout. A server becomes **Unhealthy after U = 2** consecutive failures and **Healthy after H = 2** passes. New servers start as `initial` and need H passes. The LB learns about a restart only through its probes. Detection therefore falls between `(U−1)·interval` and `U·interval`, plus the timeout when the server hangs. The optional `probeQueues` makes probes wait in the request queue: an overloaded server then fails its checks, which can cascade.

Changing the interval with `configure` takes effect at once: each server's next probe moves to at most one new interval away, so the detection window `(U−1)·I … U·I` holds right after the slider moves. Every probe is recorded (`ServerState.probes`, last 10; `probeTimeline(s, id)`) for the L05 "Prozor otkrivanja" timeline.

Passive checks follow NGINX `max_fails=1 fail_timeout=10s`: a **failed connection attempt** (refused, reset, or the LB's connect timeout) ejects the server for 10 s. A client that gives up after 5 s does **not** count: NGINX finalises that as 499 and frees the peer without marking it failed. Counting client timeouts would eject busy-but-healthy servers and cascade (healthy rack, LC, λ 30: 13.5 % errors with passive on instead of 0.6 %). Retry follows NGINX `proxy_next_upstream error timeout`: a refused or unconnectable attempt is retried once on another server (L7 only), and the failed attempt still counts for the passive check. `failOpen` follows AWS ALB: if every target is unhealthy, it sends to all of them.

Each crash, OOM, hang or power-off opens an **`Incident`** with `failedBeforeDetection`, the detection delay, system-wide `after30s` counts and `sessionsLost` (sessions lost anywhere while it is open). This is the "37 orders" metric and the L05 goals "< 2 % in the 30 s after" and "Nula izgubljenih sesija nakon pada".

### Sessions and carts (L05)
Twenty clients (`clients.count`) send requests; each request comes from a random client on a separate RNG stream. With `sessions.enabled`, every success adds an item to that user's cart. The session lives where `sessions.store` puts it:

- **`local`**: in the server's memory. It is wiped by a crash, OOM, restart, power-off, resize or removal. If the next request lands elsewhere, the counter `sesija izgubljena` goes up and the cart empties.
- **`redis`**: shared. There are no losses unless `setRedisUp(false)`.

Switching `sessions.store` at run time starts the new store empty and is **not** counted as lost sessions (it is a configuration change, not a failure). Losses are narrated as one summary line per 5 s ("Sesije izgubljene u zadnjih 5 s: 13 (ukupno 213)"), so crash and probe events stay visible in the 6-line `EventLog`.

Affinity in `lb` mode can be:

- `cookie`: an LB cookie assigned on the first request and reassigned when that server leaves rotation. It needs L7.
- `hash`: consistent hash on `sessions.hashKey`.

`sessions.hashKey` also drives the algorithms `hash` and `chash`: `'user'` (default) hashes the user id; `'ip'` hashes the source IP, as NGINX `hash $remote_addr` does. With `clients.nat` on, every client has the same IP, so the whole campus lands on one server. That is the "many users behind one NAT IP" pitfall. NGINX `ip_hash` is even coarser: it uses only the first three IPv4 octets. Label the control with `algoLabel(algo, hashKey)`.

### Kubernetes Service (L14)
Each Pod (a server) has the EndpointSlice conditions `ready = serving && !terminating`, `serving` and `terminating`:

- `serving` comes from the kubelet's readiness probe. The sim uses period 2 s (real default 10 s), failureThreshold 3 and successThreshold 1. `setReady(id, false)` simulates a failing `/ready`; nothing restarts.
- A crashed container is not ready immediately. The kubelet restarts it with **CrashLoopBackOff**: the 1st restart at once, then 10 s, 20 s, 40 s … capped at 300 s, reset after 10 min without a crash. These are the real values (`TIMING.crashBackoff*`), the same as E3, so the log prints them plainly ("za 20 s (odgoda se udvostručuje, najviše 5 min)") with no "(sim)" badge. Classic servers (`direct`, `dns`, `lb`) keep a process supervisor's fixed 6 s restart.
- `setSelected(id, false)` is "Greška u selektoru": the selector no longer matches the Pod, so it leaves the EndpointSlice while it keeps running and stays Ready. `endpointSlice()` no longer lists it, and `routingState` is `notSelected`.
- kube-proxy sees every change after `service.propagationMs` (1 s, sim).

Each new connection picks uniformly among kube-proxy's ready endpoints, with no weights and no notion of node size. If **no** endpoint is ready, kube-proxy falls back to endpoints that are terminating but still serving (`serviceCandidates(s)`), so a Deployment deleted during its `preStop` sleep still answers. With 0 usable endpoints the connection is **refused**. With `clients.mode: 'keepAlive'`, one connection carries every request, so one Pod gets 100 %. With `'pool'`, N connections reach at most N Pods. **Established connections keep going to a Pod that turned not-ready**, as conntrack does. They close when the backend dies or shuts down, and when the client times out; the client's next request then opens a new connection to a random Pod (logged).

`clients.pinTo: 'pod2'` is "Upiši IP pa uvedi novu verziju": every client dials that Pod directly, bypassing the Service. Once the Pod is gone, requests fail as `'refused'` with reason `noRoute`. (Depending on the CNI, the real symptom is "No route to host" or a hang until the timeout.) `ServerSpec.meta` (`version`, `ip`, `labels`) is passed through untouched to `serversView()` and `endpointSlice()`, for v1 blue / v2 violet Pods and the packet stepper's Pod IPs.

`terminateServer(id)` deletes a Pod. The steps run at the same time:

- the endpoint becomes `terminating` and drops out of kube-proxy after the lag;
- the `preStop` sleep runs, then **SIGTERM**, with `service.sigterm`:
  - `graceful`: the listener closes and in-flight requests finish;
  - `immediate`: the process exits and in-flight requests fail;
  - `ignore`: the process keeps running;
- **SIGKILL** arrives after `terminationGraceS` (30 s).

The Pod disappears once it has exited and kube-proxy no longer routes to it. `setMode(state, 'service' | 'lb')` switches the L04 rack between "Klasični LB" and "Kubernetes Service" while it runs.

There is no LB in Service mode, so the LB-only actions refuse there and log why: `drainServer` (a Pod is taken out by deleting it, `terminateServer`, or by a selector that no longer matches, `setSelected`) and `setLbUp(false)` (kube-proxy rules live on every node). The same goes for `drainServer` in `direct` and `dns` mode (in DNS, remove the A record with `setDnsRecord` and wait for the TTL). `setLbUp(true)` always works, so an LB switched off before a mode change can be switched back on.

### L03 availability year (`availability.ts`)
The chain is entry × (app servers in parallel) × DB. It runs as 8760 hourly steps rendered in 10 s, seeded. Each component fails with MTTR 4 h, and the hourly failure probability is `p = (1−A)/((1−A) + MTTR·A)`, so the long-run availability equals the slider exactly. The run adds four things the formula ignores:

- **Same rack** (`sameRack`): a shared failure process for all app servers. `rackFailure()` is the "Kvar ormara" button.
- **Bad config** (`badConfig()`): every app server is down for 1 h.
- **N+1 at weekday lunch** (12–14 h): the app tier counts as down if the surviving capacity is below peak. With 2 × 70 % that is 143 % on the survivor.
- **Detection time** per app-server failure.

`yearReport()` returns the simulated availability, the formula availability (rack-aware) and `naiveFormulaAvailability` (independent failures only, the number students compute first), lost lunches, downtime by cause and the illustrative monthly cost. `YearEvent` carries `t` (seconds into the 10 s animation), so the events go straight into the kit's `EventLog`.

`timeoutTradeoff({ timeoutMs, seed?, n?, latencyMs?, faults? })` is the L03 "Spor ili mrtav?" mini-game. It runs a seeded timeout detector against hidden faults: crash 2 %, GC pause 5 % (200–3000 ms), packet loss 1 %, healthy answers Exp(100 ms). It returns false alarms by cause, the detection time and the mean user wait. A timeout never misses a crash; it only notices it late. Seed 42, n 1000: 200 ms → 197 false alarms and 98 ms mean wait; 1 s → 57 and 176 ms; 5 s → 11 (only lost packets) and 345 ms.

---

## What it deliberately simplifies (and why the lesson stays true)

- **No network time.** Latency is server time: queue + CPU + I/O. One extra hop through an LB adds well under a millisecond in one datacentre, so leaving it out does not change any comparison. `Flight` entities are **visual only** and do not delay requests.
- **One CPU request per core, fair share.** A request never uses more than one core, and `share` divides the cores evenly. Context-switch overhead is ignored. Real servers are slightly worse, so the sim never overstates capacity.
- **I/O is a fixed wait that holds a radnik but no core.** The DB is not a shared bottleneck in this engine (the L03 formula `sharedBottleneck` covers that). The lesson "cores set throughput, RAM sets concurrency" depends only on this split.
- **The client gives up after 5 s; the LB's own read timeout (60 s) never fires.** Requests that time out still finish on the server and are counted as `wasted`. A real browser or k6 waits longer. The 5 s value is labelled `TIMING.clientTimeout` "(sim)". Client timeouts never count against a server for the passive check.
- **Classroom timings** are exported as `{ sim, real }` pairs in `TIMING`, and every log line that mentions one uses `simRealLabel()`, for example `2 s (sim) · stvarno: 30 s (AWS ALB)`:
  - health interval 2 s, real 30 s;
  - connect timeout 1 s, real 60 s;
  - resize downtime 20 s, real "minute";
  - boot 10 s;
  - restart 6 s plus 3 s warm-up (classic servers; Service mode uses the real CrashLoopBackOff);
  - readiness period 2 s, real 10 s;
  - endpoint propagation 1 s;
  - DNS TTL 20 s, real often 300 s;
  - deregistration delay 10 s, real 300 s (AWS ALB/NLB).
- **Drain:** in-flight requests always finish; only connections still pinned at the deregistration deadline are closed. A real ALB would also cut requests still running at the deadline, but no request here lives longer than the 5 s client timeout.
- **A server is one process.** OOM kills the whole worker pool, which a supervisor (systemd) then restarts. gunicorn could respawn a single worker, but the lesson is the misconfiguration (unbounded pool), not the respawn policy.
- **Sessions are per user, not per cookie jar.** Each success adds a cart item, and a session is "lost" the first time a logged-in user is served without it. This is counted once per loss, never while already logged out.
- **DNS:** removing a server from the rack also drops it from cached answers immediately. To show cached clients hitting a dead server, power it off or crash it instead; it stays in DNS. Browsers retrying other A records is not modelled.
- **Service mode** models kube-proxy iptables/nftables: random choice, ready endpoints (falling back to serving-terminating ones), ClientIP affinity, selector membership (`setSelected`). It does not model node failure (`powerOff` is a no-op with an explanatory event; that belongs to E3), `trafficDistribution`, or label editing itself (E3 owns labels; E1 only needs "is the Pod in the slice").
- **Probe history and flights are visual only.** Dots move at a constant speed. One hop (client↔LB, LB↔server) takes `flightMs/2`, and client↔server takes `flightMs`. A retried request's dot bounces back from the dead server to the LB and leaves for the next server only then. The bounce does not delay the request itself.
- **Hash affinity / `chash`** use FNV-1a plus the murmur3 finaliser instead of MD5 or murmur2. "How many keys move" is a property of mod-N versus ring arithmetic, not of the hash function.

---

## API

### Create and step
```ts
createTraffic(input?: TrafficConfigInput): TrafficState   // same input ⇒ same run
step(state, dtSeconds)          // alias stepTraffic: accumulates into fixed 10 ms ticks; NaN/≤0 ignored; ≤60 s per call
advance(state, ms) / runUntil(state, tMs) / tick(state)   // exact ticks for headless use
schedule(state, atMs, run, label?)                          // scripted actions (presets, replays, tests)
configure(state, patch: RuntimePatch)  // slider/toggle values at run time – see below
defaultConfig(mode) / resolveConfig(input)                  // defaults; every number sanitised (NaN, negatives, ranges)
mergeConfigInput(base, over)    // deep merge of two inputs (nested objects field by field)
nowMs(state)                    // s.t + the sub-tick remainder: the time to draw at
```

`configure()` is safe to call **every frame with every control value**. A field equal to the current value has no effect. In particular, an unchanged `profile` does not restart the profile clock (otherwise waves or a lunch rush would stay frozen at λ). `RuntimePatch` is `TrafficConfigInput` without `servers`, `seed`, `rngStreams`, `script` and `maxEvents`, so the compiler rejects fields that only work at creation. Change the rack with actions (`addServer`, `removeServer`, `setServerSize`, `resizeServer`).

`useSimulation` only reads `init` again after a render. To reset with a new rack, keep the rack in React state and call `sim.reset()` in an effect after it changed (or rebuild the state in `sim.mutate`). For instant size changes, use `setServerSize` instead of a reset.

`TrafficConfig` defaults:

| Field | Default | Notes |
|---|---|---|
| `seed` | 42 | |
| `mode` | `'lb'` | |
| `servers` | `lb`/`dns`: `defaultRack()` S1 mali 1/2 GB, S2 srednji 2/4, S3 veliki 4/8 · `direct`: `singleServer()` 2 vCPU/2 GB · `service`: `podSet(4)` 1/2 GB | |
| `workload` | `'api'` | |
| `lambda` | 10 (`service`: 4) | Requests per second. In Service mode one 1 vCPU Pod (5 req/s) can carry one keep-alive client, so "one connection → 100 % on one Pod" is not muddied by overload. |
| `arrivals` | `'poisson'` | `'uniform'` also available |
| `profile` | `{ kind: 'constant' }` | Also `waves` and `lunch` |
| `algo` | `'rr'` | |
| `layer` | `'L7'` | |
| `queueMax` | 10 | Range 0–100 |
| `clientTimeoutMs` | 5000 | |
| `unboundedWorkers` | `false` | |
| `rngStreams` | `'shared'` | Like the prototype; `'split'` gives identical arrivals for every algorithm |
| `healthCheck` | `{ enabled: true, intervalMs: 2000, timeoutMs: 1000, unhealthyThreshold: 2, healthyThreshold: 2, stagger: true, probeQueues: false }` | |
| `passive` | `{ enabled: false, ejectMs: 10000 }` | |
| `retry` / `failOpen` | `false` / `false` | |
| `connectTimeoutMs` | 1000 | |
| `lifecycle` | `{ autoRestart: true, restartDelayMs: 6000, warmupMs: 3000, bootMs: 10000, resizeDowntimeMs: 20000, deregistrationDelayMs: 10000 }` | `restartDelayMs` is for classic servers; Service mode uses CrashLoopBackOff |
| `clients` | `{ count: 20, mode: 'perRequest', poolSize: 4, nat: false, pinTo: null }` | `pinTo`: Service mode, a Pod id dialled directly |
| `sessions` | `{ enabled: false, store: 'local', affinity: 'none', hashKey: 'user' }` | `hashKey: 'ip'` hashes the source IP |
| `service` | `{ propagationMs: 1000, sessionAffinity: 'None', affinityTimeoutS: 10800, readiness: { periodMs: 2000, timeoutMs: 1000, failureThreshold: 3, successThreshold: 1 }, preStopSleepS: 0, sigterm: 'graceful', terminationGraceS: 30 }` | |
| `dns` | `{ ttlMs: 20000, resolvers: 4, campusShare: 0 }` | |
| `burst` | `{ factor: 3, durationMs: 30000 }` | |
| `ewmaAlpha` | 0.2 | |
| `visual` | `{ flights: true, flightMs: 450, maxFlights: 200 }` | |
| `maxEvents` | 50 | |
| `script` | `[]` | |

### Actions
Each action mutates the state, returns `true` when something changed (`false` for a no-op or an unknown id), and logs a Croatian event. The exceptions are `addServer`, which returns the new id or `null`, and `sendRequest`, which returns the request id or `null`.

| Action | Use |
|---|---|
| `sendRequest(s, { client?, cpuMs?, ioMs? })` → id | "Pošalji zahtjev" (L14 stepper, L02 one request's life, L24 one request's path). It is routed like an arrival. Size and client come from a separate RNG stream, so the seeded traffic is unchanged. Follow it with `findRequest(s, id)`. |
| `crashServer(s, id, { autoRestart? })` | "Sruši proces" |
| `hangServer(s, id)` | "Zamrzni" |
| `powerOff(s, id)` / `powerOn(s, id)` | "Ugasi stroj" / "Izvuci utikač" / power on (boot 10 s → warm-up) |
| `restartServer(s, id)` | "Ponovno pokreni" (powers on if off) |
| `drainServer(s, id)` / `undrainServer(s, id)` | "Isprazni" (deregistration delay for pinned connections). `lb` mode only: elsewhere it returns `false` and logs the equivalent (`terminateServer` / `setSelected`, `setDnsRecord`) |
| `addServer(s, { vcpu, ramGB, id?, name?, label?, weight?, meta? })` → id | Rack builder. Ids are generated when omitted (`s4`/`S4`, or `pod5`/`klopa-api-5`). At most 8 live servers; terminating or exited Pods don't count. |
| `removeServer(s, id)` | Requests inside fail; drain first for a clean removal |
| `setServerSize(s, id, { vcpu?, ramGB? }, { downtime? })` | L02 vCPU/RAM selectors, L04 "Prilagođeni": instant, no downtime. W follows RAM; requests in progress finish, even when the new RAM holds fewer than are running (a bounded pool never counts more than W radnici towards RAM, so a shrink is not an OOM; `ramUsedMB` stays ≤ RAM and `slots` ≥ busy). `{ downtime: true }` is `resizeServer`. |
| `resizeServer(s, id, vcpu, ramGB)` | L02 "Veći poslužitelj" (stop, resize, boot: 20 s downtime, sim) |
| `setSlow(s, id, factor = 3)` | `SLOW_FAULT_LABEL` "Sporiji procesor" (1 = repaired) |
| `setLeak(s, id, mbPerS)` | Memory leak until OOM |
| `setWeight(s, id, w)` / `resetWeights(s)` | Editable WRR/WLC/chash weights; reset to capacity-based weights for the current rack and workload |
| `setAlgo(s, algo)` / `setMode(s, mode)` | Leaving `manual` hands waiting requests to the algorithm |
| `burst(s, factor?, durationMs?)` | "Nalet u 12:00" (×3 for 30 s) |
| `routeManual(s, id)` | "Vi ste load balancer" (L04 manual mode); refuses a draining server |
| `setLbUp(s, up)` / `setRedisUp(s, up)` | "Ugasi load balancer" (`lb` mode only; switching it back on always works) / "Ugasi Redis" |
| `setReady(s, id, ready)` / `setSelected(s, id, selected)` / `terminateServer(s, id)` | Service mode: "Podu padne readiness", "Greška u selektoru", Pod deletion |
| `setDnsRecord(s, id, present)` | DNS mode |
| `resetHits(s)` | Hit histogram |
| `pushEvent(s, text, tone?, kind?)` | The lecture's own narration line in the same log |

### State you can read directly
- `state.servers: ServerState[]` (stable `id`). Each has:
  - `proc`;
  - `inflight` / `queue` / `parked` / `connecting` (`Req[]` with stable `id`);
  - `healthy`, `draining`, `drained`, `serving`, `inSlice`, `kpReady`, `weight`, `slowFactor`, `meta`;
  - `errTotals` (failures since it was added, by code), `probes` (last 10);
  - `cpuSeries` / `queueSeries`.
- `state.flights: Flight[]`: dots with `{ id, reqId, dir, from, to, via, t0, durationMs, outcome, bounce? }`. `from`/`to` is `'client'`, `'lb'`, a server id, or `'service'`, the Service VIP as the client node's rules see it. Draw `'service'` right next to the client: it is not a box. A rejected request still gets a dot that dies where it was refused (at the LB, or at `'service'` with 0 endpoints).
- `state.events: TrafficEvent[]`: `{ id, t (s), kind, text, tone, server? }`, capped at 50. It can be passed straight to the kit's `<EventLog>`.
- `state.series`: `offered`, `goodput`, `errors` and `p95`, each a kit `Series`, 120 points = 60 s (`p95` is `NaN` for "n/a").
- `state.recent: CompletedReq[]`: the last 200 finished requests `{ id, client, server, t0, tEnd, queueMs, cpuMs, ioMs, attempts, outcome, reason }`. For every success, queue + CPU + I/O equals the latency (L24 trace waterfall, L02 histogram).
- `state.clients`: sessions, cookies, connections and `failed` / `firstErrorAt` / `lastErrorAt` per user. `state.incidents`, `state.totals`, `state.cfg`.

### Selectors (`selectors.ts`)
| Selector | Returns |
|---|---|
| `metrics(s)` | `{ offered, goodput (5 s), errorRate, errorsPerSec, errors {502,503,504,refused,total} (10 s), p50/p95/p99/mean (null if n<20), samples, inSystem }` |
| `serverView(s, v)` / `serversView(s)` | Card data: `workers` (W for maths; `Infinity` when unbounded), **`slots`** (finite, for drawing radnik slots: max(busy, W)), `unbounded`, `workersLabel` ("6" / "∞"), busy, queue, CPU (1 s and smoothed), RAM, handled/s, `routing` badge (`ROUTING_LABEL`), `proc` (`PROC_LABEL`), capacity, sessions, `safeToRemove`, endpoint conditions incl. `inSlice`, errors in 10 s, `errTotals`, `meta` |
| `routingState(s, v)` | `healthy` / `unhealthy` / `initial` / `ejected` / `draining` / `drained` / `ready` / `notReady` / `terminating` / `notSelected` / `direct` / `inDns` / `notInDns` |
| `visibleFlights(s)`, `flightProgress(s, f)` | Dot progress 0..1 from `nowMs(s)` (constant speed between renders). With `via: 'lb'`, 0.5 is the LB. Values < 0 mean not started. |
| `findRequest(s, id)` | Where one request is: `pending` (at the LB), `connecting`, `parked`, `queue`, `inflight` (with the live `Req`), or `done` (with its `CompletedReq`) |
| `requestProgress(req)` | `{ phase: 'cpu'|'io'|'done', cpu, io, overall }`, for radnik slots |
| `littleCheck(s)` | `{ L, lambda, W, lambdaW }`, a live L ≈ λ·W |
| `capacityReport(s, maxUtilisation = 0.8)` | Per-server capacity, `total`, `withoutLargest`, **`utilisationAfterFailure`** (show it), N+1 `ok` = survivors at ≤ 80 % |
| `endpointSlice(s)` | Pods in the slice: API conditions vs kube-proxy view (`kubeProxy.inSlice`), `propagating`, `meta` |
| `serviceCandidates(s)` | The endpoints kube-proxy would pick from right now (ready, else serving-terminating) |
| `hitShares(s)`, `connectionMap(s)` | L14 hit histogram, keep-alive pinning |
| `sessionSummary(s)` | Users per session home, carts, losses |
| `redMetrics(s)` | Rate / Errors / Duration for the L24 per-service panel |
| `mark(s)` → `since(s, mark)` | A goal or MTTR window: `{ durationS, arrived, ok, errors, errorRate, p95, sessionLost, wasted }` ("drži 30 s pri λ = 20", "S2 bez ijedne neuspjele narudžbe") |
| `affectedUsers(s, sinceMs?)` | Distinct users with ≥ 1 failed request (L24 score) |
| `recentEvents(s, { kinds?, server?, minTone?, max? })` | Filtered event log |
| `probeTimeline(s, id)` | `{ intervalMs, timeoutMs, failureThreshold, successThreshold, probes, nextProbe, fails, passes }` for the L05 detection-window timeline |
| `lastIncident(s)`, `detectionDelayMs(inc)` | "N narudžbi propalo prije otkrivanja" |

### Headless runs and presets
```ts
runScenario({ config, warmupS = 10, measureS, actions }) → RunReport
  // { okRps, errPct, errors, p50/p95/p99, wasted, retried, sessionLost, ooms, servers[{cpu, share, routed}], incidents, state }
compareAlgorithms(opts, ['rr', 'wrr', 'lc'])   // "Usporedi tri algoritma" (use rngStreams: 'split' for identical arrivals)
routeSequence(config, n = 12, gapMs = 250) → LadderStep[]   // L04 "Ljestve algoritama": the same n requests (same sizes) per algorithm
SCENARIOS[id] / createScenario(id, overrides?, { prerollS? }) / runPreset(id, overrides?)
```

Overrides are **deep-merged** into the preset: `createScenario('l05-incident', { healthCheck: { intervalMs: 4000 } })` keeps the preset's `stagger: false` and `autoRestart: false`, so restating a default never changes the card's numbers. `createScenario` pre-runs the scenario's `prerollS` synchronously (55 s for `l05-incident`, which costs a few ms), so the incident happens about 5 s after the replay starts. The run is identical to starting at 0 and waiting. Show `simSeconds(s)` as the clock, because `sim.time` starts at 0.

### Formulas, hashing and capacity
- `formulas.ts`:
  - queueing: `mm1WaitFactor`, `mm1Number`, `erlangB`, `erlangC`, `mmc`, `mmcWaitFactor`, `littleL`;
  - availability: `availabilityFromMtbf`, `mtbfFor`, `seriesAvailability`, `parallelAvailability`, `kOfN`, `probAnyDown`, `downtime`, `NINES`;
  - scaling: `amdahl`, `amdahlMax`, `usl`, `uslPeak`, `sharedBottleneck`;
  - caching: `cacheAside`.
  - All of them are total: NaN or out-of-range input returns NaN, 0, 1 or Infinity and never throws.
- `hashing.ts`: `hash32`, `hashMod`, `buildRing`, `ringLookup`, `assignKeys`, `movedFraction`, `keyShares`.
- `capacity.ts`: `workersFor`, `capacityOf`, `suggestedWeights`, `nPlusOne(caps, offered, maxUtilisation = 0.8)`, `latencyFloorMs(workload, p)` (the best possible percentile on an idle server: `ioMs + cpuMs·(−ln(1−p))`; API p95 899 ms, I/O p95 1150 ms; use it to sanity-check goals).
- `constants.ts`:
  - `WORKLOADS`, `SERVER_SIZES`, `defaultRack`, `singleServer`, `podSet`;
  - `CATALOGUE`, `nextBiggerSize` (returns `null` = "Nema većeg"), `monthlyPriceEur` (label it "ilustrativno");
  - `TIMING` (incl. `connectTimeoutAlb`, `lbReadTimeout`, `deregistrationDelay`, `crashBackoff*`), `simRealLabel`, `fmtDuration`;
  - `ALGO_LABEL`, `algoLabel(algo, hashKey)`, `ALGO_NAME`, `ALGO_RULE`, `MODE_LABEL`, `REASON_LABEL`, `errorLabel(code, mode?, layer?)`, `SLOW_FAULT_LABEL`, `MODEL_NOTES`;
  - `N_PLUS_ONE_MAX_UTILISATION` (0.8), `SERVICE_DEFAULT_LAMBDA` (4).
- `availability.ts`: `createYear`, `stepYear`, `finishYear`, `rackFailure`, `badConfig`, `yearReport`, `runYear`, `formulaAvailability(cfg, { naive? })`, `hourLabel`, `timeoutTradeoff`.

---

### Post-lecture review additions (2026-10)

- `sessions.store: 'machine'` – a store on each server (a Redis next to the app): a process crash, OOM or restart keeps the carts; `powerOff`, `removeServer` and `resizeServer` wipe them. A user routed to another server still cannot reach the session there (counted as lost, like `'local'`). Default stays `'local'`.
- Year model (L03): `detectionWeight: 'full' | 'share'` (default `'full'`, the validated pessimistic count: the whole failover window is an outage). `'share'` counts only the failed servers' share of traffic (k new failures among n serving → k/n of the window). `rackFailure(s, { countDetection: true })` makes the forced single-rack failure pay the failover window too (default: instant takeover, as before).
- Wording: the start line uses `plural()` („1 zahtjev/s”), `ALGO_NAME.lc` = „najmanje veza” (as in L04/L05), `YEAR_CAUSE_LABEL.entry` = „ulaz” (neutral before L04), `MODEL_NOTES.workerPool` says „PHP-FPM, ili Puma s jednom dretvom po procesu”, and the API workload description no longer calls itself klopa-api.

## Usage in a lecture (React + `useSimulation`)

This component is checked against the project's tsconfig and ESLint rules.

```tsx
import { useState } from 'react'
import { Button, EventLog, LineChart, Segmented, SimFrame, Slider, Stat, StatRow, fmt, lerp, useSimulation } from '../../kit'
import {
  PROC_LABEL, ROUTING_LABEL, TIMING,
  algoLabel, configure, crashServer, createTraffic, errorLabel, metrics, sendRequest, serversView, simRealLabel, stepTraffic, visibleFlights,
  type Algo, type Flight,
} from '../../engines/traffic'

const ALGOS: Algo[] = ['rr', 'wrr', 'lc']

export function RackSim() {
  const [lambda, setLambda] = useState(15)
  const [algo, setAlgo] = useState<Algo>('rr')
  const sim = useSimulation({
    init: () => createTraffic({ seed: 42, mode: 'lb', lambda: 15, algo: 'rr' }),
    step: (s, dt) => {
      configure(s, { lambda, algo }) // every control value, every frame: unchanged values are no-ops
      stepTraffic(s, dt) // fixed 10 ms ticks inside; dt = 1/60 s from the hook
    },
  })
  const s = sim.state
  const m = metrics(s)
  const servers = serversView(s)

  // layout: client → LB → servers; a flight's progress 0.5 is the LB when via === 'lb'
  const at = (place: string) =>
    place === 'client' ? { x: 40, y: 130 } : place === 'lb' ? { x: 230, y: 130 } : { x: 430, y: 50 + 80 * servers.findIndex((v) => v.id === place) }
  const dot = (f: Flight, p: number) => {
    const [a, b] = [at(f.from), at(f.to)]
    if (f.via !== 'lb') return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) }
    const mid = at('lb')
    return p < 0.5 ? { x: lerp(a.x, mid.x, p * 2), y: lerp(a.y, mid.y, p * 2) } : { x: lerp(mid.x, b.x, p * 2 - 1), y: lerp(mid.y, b.y, p * 2 - 1) }
  }

  return (
    <SimFrame
      title="Load balancer u vašim rukama"
      sim={sim}
      showTime
      hint="Pošaljite 15 zahtjeva/s kružno, zatim probajte težinsko kružno i najmanje veza."
      controls={
        <>
          <Slider label="Promet" value={lambda} min={1} max={50} onChange={setLambda} format={(v) => `${v} zahtjeva/s`} />
          <Segmented label="Algoritam" value={algo} options={ALGOS.map((a) => ({ value: a, label: algoLabel(a, s.cfg.sessions.hashKey) }))} onChange={setAlgo} />
          <Button onClick={() => sim.mutate((st) => sendRequest(st))}>Pošalji zahtjev</Button>
          <Button variant="danger" onClick={() => sim.mutate((st) => crashServer(st, 's3'))}>
            Sruši proces
          </Button>
          <small>Provjera ispravnosti: {simRealLabel(TIMING.healthInterval, s.cfg.healthCheck.intervalMs)}</small>
        </>
      }
      stats={
        <StatRow>
          <Stat label="Uspješno" value={fmt.num(m.goodput, 1)} unit="/s" />
          <Stat label="p95" value={m.p95 === null ? 'n/a' : fmt.ms(m.p95)} />
          <Stat
            label="Greške"
            value={fmt.pct(m.errorRate, 1)}
            sub={`502: ${m.errors[502]} · 503: ${m.errors[503]} · ${errorLabel(504, s.cfg.mode, s.cfg.layer)}: ${m.errors[504]}`}
            tone={m.errorRate > 0.01 ? 'bad' : 'ok'}
          />
          <LineChart series={[{ label: 'uspješno/s', values: s.series.goodput.values, color: 'var(--ok)' }]} window={120} />
        </StatRow>
      }
    >
      <svg viewBox="0 0 640 260" role="img" aria-label="Zahtjevi putuju od klijenata preko load balancera do poslužitelja">
        {servers.map((v) => {
          const p = at(v.id)
          return (
            <text key={v.id} x={p.x} y={p.y} fontSize={13}>
              {v.display}: CPU {fmt.pct(v.cpuSmooth)}, radnici {v.busy}/{v.workersLabel}, red {v.queue} · {PROC_LABEL[v.proc]} · {ROUTING_LABEL[v.routing]}
            </text>
          )
        })}
        {visibleFlights(s).map(({ flight, progress }) => {
          const p = dot(flight, progress)
          const failed = flight.outcome !== 'ok' && flight.outcome !== 'waiting'
          return <circle key={flight.id} cx={p.x} cy={p.y} r={4} fill={failed ? 'var(--bad)' : 'var(--request)'} />
        })}
      </svg>
      <EventLog events={s.events} />
    </SimFrame>
  )
}
```

Tips:
- "Ponovi isti promet" is `sim.reset()`: same config and seed ⇒ the same run.
- For an incident replay, use `init: () => createScenario('l05-incident')`. Its scripted actions run on their own, and the pre-roll puts the crash about 5 s after the start. Pass slider values as deep-merged overrides.
- For the L14 toggle, call `configure(s, { mode })` from `step`, or use `sim.mutate((st) => setMode(st, 'service'))`.
- Draw dots from `visibleFlights` in one pooled SVG layer (≤ 200, capped by the engine). Don't create one Motion component per request. A dot with `bounce: true` travels from a dead server back to the LB before a retry.
- Draw radnik slots with `v.slots`, never `v.workers`: with "Neograničeni radnici" on, `workers` is `Infinity`.
- Goals: `const m0 = mark(s)` when the task starts, then `since(s, m0)` (e.g. `errorRate < 0.02` over the 30 s after a crash). For "S2 bez ijedne neuspjele narudžbe", compare `serversView(s)[1].errTotals` before and after.
- Charting p95: `series.p95` holds `NaN` for "n/a". Until the kit's `LineChart` can break a line at `NaN`, show p95 as a `Stat` ("n/a" when `metrics(s).p95 === null`) instead of passing `series.p95.values` to it.

---

## Validated numbers

**Default rack, API, seed 42, 10 s warm-up + 300 s measured, queue 10, timeout 5 s.** Each cell is error % and p95. The engine values below come from `traffic.test.ts`, which checks each against sim-models within ±0.1 pp and ±0.05 s.

| λ | RR | Random | WRR 1:2:4 | Least conn. | P2C | Least resp. time |
|---|---|---|---|---|---|---|
| 10 | 0.1 %, 1.32 s | 0.1 %, 1.66 s | 0 %, 0.93 s | 0 %, 1.09 s | 0 %, 1.09 s | 0 %, 1.03 s |
| 15 | **2.75 %**, 3.24 s | 2.8 %, 3.05 s | 0 %, 0.98 s | 0 %, 1.23 s | 0 %, 1.28 s | 0 %, 1.14 s |
| 20 | **10.6 %**, 3.69 s | 10.3 % | 0 %, 1.07 s | 0.1 %, 1.52 s | 0.1 %, 1.60 s | 0 %, 1.27 s |
| 25 | **15.2 %** | 14.8 % | 0 %, 1.33 s | 0.1 %, 1.94 s | 0.2 %, 2.06 s | 0 %, 1.52 s |
| 30 | **18.9 %** | 18.5 % | 0.2 %, 2.03 s | 0.6 %, 2.45 s | 1.5 %, 2.83 s | 0.1 %, 1.94 s |
| 35 (= capacity) | 25.9 % | 25.2 % | 4.0 % | 4.6 % | 8.7 % | 3.5 % |

Compared with the prototype's raw counts, all 36 cells (6 λ × 6 algorithms) have identical success counts, 503 counts and p50/p95/p99. 30 of the 36 cells are identical in every count. In the other 6, the 504 count differs by 1–2 requests, because the engine counts a timeout when the client gives up, while the prototype counted it when the late radnik finished; that shifts which side of the warm-up boundary it falls on. That moves λ 15 RR from 2.7 % to 2.75 % and λ 25 RR from 15.3 % to 15.2 %. At λ 15, RR leaves S1 at 98 % CPU and S3 at 25 % (the prototype's "27 %" averages over its whole 130 s run). WRR shares are exactly 1/7, 2/7 and 4/7.

Review fixes, measured with seed 42 (all in `regressions.test.ts`):

| Check | Before | Now |
|---|---|---|
| Passive check on a healthy rack, LC, λ 30, 300 s | 13.49 % errors, 14 ejections (client timeouts ejected busy servers) | **0.60 %**, 0 ejections (identical to passive off) |
| Crash S3 at λ 15, LC, errors in the 30 s after (warm-up 20 s) | retry 0.91 %, retry + passive 4.77 % | none 9.59 %, retry **0.89 %**, passive **1.37 %**, both **1.37 %**: the L05 goal "< 2 %" holds |
| N+1 for the default rack at λ 15 | `ok: true` | `ok: false`, `utilisationAfterFailure` 1.0. S1 + S2 alone: ρ 0.8 → WRR 0.3 %, LC 0.1 %; ρ 1.0 → WRR 6.1 %, LC 5.7 %, p95 ≈ 3.5 s |
| `powerOff` behind the L7 LB | 502 | **504** Gateway Timeout (`connectTimeout`), as NGINX and ALB answer |
| Service: 0 endpoints / crashed Pod / `l14-shutdown` | 503 / 502 / 10 × 502 | `refused` / `refused` / **10 refused** (graceful 4, preStop 0) |
| L4 LB, keep-alive, drain S2 at 20 s, λ 10 | "safe to remove" while still receiving requests; removal dropped 3 | last request on a pinned connection 29.7 s, connections closed at 30 s, safe at 30.2 s, removal drops **0** |
| Interval slider 10 s → 1 s, then crash | detection 11 s, or never (restart before the next probe) | detection **1.01 s** (window 1–2 s) |
| Both Pods terminating, preStop sleep 10, 8.5 s | 45 × 503, 9 ok | **56 ok, 0 errors** (serving-terminating fallback) |
| Service crash loop | constant 6 s + 3 s | CrashLoopBackOff: restart at once, then 10, 20, 40, 80, 160 s |
| `configure` every frame with a `waves` profile | offered stuck at λ 10 | 10, 14.8, 12.9, 7.1, 5.2 … (same as setting it at creation) |
| `runPreset('l05-incident', { healthCheck: { intervalMs: 2000 } })` | 52 (stagger silently on) | **37** |
| Ring weight 0.4 vs 1 vs 1 (20 000 keys) | share 0.001 | 0.146 (target 0.167; 100 vnodes per unit) |
| `hash` with `clients.nat`, `hashKey: 'ip'` | 0.38 / 0.34 / 0.28 | **100 %** on one server |

Verification pass (defects found while re-checking the fixes above; also in `regressions.test.ts`):

| Check | Before | Now |
|---|---|---|
| `sessions.affinity: 'hash'` with `clients.nat`, `hashKey: 'ip'`, RR, λ 10 | 0.17 / 0.16 / 0.68, the same as `hashKey: 'user'` (the key was ignored) | **100 %** on one server |
| CrashLoopBackOff log, 2nd and 3rd restart | "za 20 s (sim) · stvarno: 10 s" (a false badge: 20 s is the real 2nd delay) | "za 10 s / za 20 s (odgoda se udvostručuje, najviše 5 min)" |
| `drainServer` in Service mode, λ 4 | logged "ne prima nove zahtjeve" while the Pod kept getting 25 of 68 hits | returns `false`, logs that a Pod is deleted or unselected instead |
| `setLbUp(false)` in Service mode, λ 4 | 4 in-flight requests failed as `lbDown`, "Load balancer je ugašen" | returns `false`, no failures |
| Client timeouts behind an L4 LB / a hung Pod in Service mode | narrated "(504)"; `errorLabel(504, 'lb')` had no way to know the layer | "(isteklo vrijeme)" / no status; `errorLabel(504, 'lb', 'L4')` |
| `setServerSize` 8 vCPU / 16 GB → 1 / 2 GB at λ 30 (14 in progress) | OOM on the next tick: all 14 requests reset, 6 s restart | the 14 finish, 0 OOMs, 0 resets; RAM shown ≤ 2 GB |

| Scenario (preset) | Engine | Source claim |
|---|---|---|
| L02 hook 11:58: I/O, 2 vCPU/2 GB, λ 4 (`l02-hook-1158`) | 0 % errors, p95 **1.64 s**, CPU 11 % | "p95 ≈1,5 s, 0 %, CPU ≈12 %" |
| L02 hook 12:00: λ 12 (`l02-hook-1200`) | 5.67 rps, **52.4 %** errors, all 503, p95 3.01 s, CPU 16 % | "5,6–5,7 rps, ≈53 %, all 503, p95 ≈3,0 s, 15–16 %" |
| L02 incident: λ 4, burst ×3 at 20 s, 30 s window (`l02-incident`) | 51.3 % errors (all 503), p95 3.0 s, CPU 17 % | "svaki drugi zahtjev 503" |
| RAM matters, I/O, 2 vCPU, λ 30 (`l02-ram-io-*`) | 2 GB **5.68 rps at 16 % CPU**, 4 GB 13.27, 8 GB 26.94 | 5.7 at ~15 %, 13, 27 |
| API, 2 vCPU at overload (λ 12) | 2 GB 8.9, 4 GB 9.4, 8 GB 7.9 rps; capacity 10 for all | "RAM doesn't help a CPU-bound app" |
| 8 GB vs 2 GB, API, λ 12 | 8 GB: 641 × 504; 2 GB: 0 × 504 | "8 GB can show more timeouts" |
| Mixed I/O, A 4/2 GB, B 1/8 GB, λ 15 (`l04-mixed-io`) | RR **11.8 %**, LC **0.4 %**, A at 8 % CPU | 11.8 % vs 0.4 % |
| Kill S3 at λ 15, unstaggered probes (`l05-incident`) | RR **11**, LC **37** failures before detection; detection 2.0 s; afterwards survivors at 100 % (N+1 fails) | 11 vs 37 |
| Same, staggered probes (default) | Detection 3.33 s; RR 17, LC 52 | Inside [(U−1)·I, U·I] |
| Unbounded workers, prototype timings (restart 5 s, no warm-up) | **11 OOMs**, 0.79 rps, 203 × 502, 182 × 503: identical to the prototype | 11 crashes, 0.8 rps |
| Unbounded workers, L02 lifecycle (6 s + 3 s, no LB) (`l02-unbounded`) | 9 OOMs in 120 s (10 incl. warm-up), 0.76 rps vs bounded 3.92 | "~11, ~0.8 vs ~4" |
| Queue 30, I/O on 2 GB, λ 12 (`l02-bufferbloat`) | Goodput **0.06 rps**, 733 × 504, 674 wasted | Collapses to ~0 |
| Slower CPU (×3) on S3, λ 15 (`l04-slow-disk`) | WRR **27.1 %** (S3 still gets 4/7), LC 0.1 % | "WRR overflows, LC adapts" |
| Local sessions, no affinity, λ 10, 60 s (`l05-sessions-local`) | 343 losses / 599 requests; cookie 0; Redis 0 | |
| Drain S2 at λ 10 (`l05-drain`) | 0 failures | |
| Service mode, default rack, λ 15 (`l14-rack`) | **2.8 %**, identical to LB `random` | "≈RR: λ15 → ~2,7 %" |
| Pod deletion, 4 Pods 2/4 GB, λ 12 (`l14-shutdown`) | Immediate exit **10** refused/reset, graceful 4, `preStop: sleep 5` **0** | "a few fail; preStop → 0" |
| Latency floor (idle server, `latencyFloorMs`) | API p95 899 ms, I/O p95 1150 ms; the biggest server on I/O measures 1150 ms | — |
| One keep-alive connection (`l14-keepalive`) | 100 % on one Pod | 100 % |
| Formulas | M/M/1 2/3.3/5/10/20/100×; Erlang B (4, 2) 9.5 %, (4, 3) 20.6 %; M/M/c c = 4: 1.09/1.51/2.48/5.46 s; 2 × 99 % = 98.01 % / 99.99 %; chain 99.88 %; 10 × 99 % → 9.56 %; Amdahl 20×; USL peak 30.8; cache-aside 3 ms / 10 % | sim-models §A, §C |
| Hashing | mod 3→2 moves 2/3, 3→4 moves 3/4; ring 3→2 moves only the removed server's keys (≈1/3) | sim-models §B |
| Availability year | Mean of 300 years with enough capacity ≈ formula 10.5 h/yr; 70 % per server → lost lunches and extra downtime | L03 model |

---

## Which lecture uses what

| Lecture | Mode / features | Presets |
|---|---|---|
| **02** Jedan poslužitelj u 12:00 | `mode: 'direct'`, one server; vCPU/RAM selectors (`setServerSize`, instant), "Veći poslužitelj" (`resizeServer` + `nextBiggerSize`, `monthlyPriceEur`), workload (`configure`); `burst`; `powerOff` ("Izvuci utikač"); `unboundedWorkers` (draw `slots`); `queueMax` 10–30; `metrics` (n/a below 20); `littleCheck`; `sendRequest` + `findRequest` + `state.recent` for one request's life and the histogram; `latencyFloorMs` to check goals; `formulas.ts` (M/M/1 with `MODEL_NOTES.mm1`, Erlang C, `downtime`/`NINES`) | `l02-hook-1158`, `l02-hook-1200`, `l02-incident`, `l02-ram-io-*`, `l02-unbounded`, `l02-bufferbloat` |
| **03** Zašto raspodijeljeni sustavi | `availability.ts` (year sim, rack, bad config, N+1, detection time, cost, naive vs rack-aware formula, `YearEvent.t` for `EventLog`); `timeoutTradeoff` for "Spor ili mrtav?"; `formulas.ts` (series/parallel, `probAnyDown`, Amdahl, USL, `sharedBottleneck`); `mode: 'dns'` with S2 `inDns: false` for the cliffhanger | `runYear()` defaults ≈ 99.88 % |
| **04** Load balancer | `mode: 'lb'`: all algorithms (`manual` + `routeManual`, `random`, `rr`, `wrr` + `setWeight` / `resetWeights`, `lc`, `wlc`, `p2c`, `lrt`, `hash`/`chash` with `hashKey`), "Ljestve algoritama" (`routeSequence`), rack builder (`addServer`/`removeServer`/`setServerSize`, `capacityOf`, `suggestedWeights`), `setSlow` ("Sporiji procesor"), burst, profiles (`waves`, `lunch`), unbounded workers, queue 0–100, `compareAlgorithms` / `rngStreams: 'split'`, `layer: 'L4'` + keep-alive for the envelope scene, `mode: 'dns'` (+ `campusShare`) for the DNS hook; planted `setMode(s, 'service')` | `l04-incident`, `l04-mixed-io`, `l04-slow-disk` |
| **05** Kad poslužitelj padne | `crashServer` / `powerOff` / `hangServer` / `drainServer` (deregistration delay) / `restartServer`; `healthCheck` interval 1–10 s and U 1–5 (staggered, takes effect at once); `probeTimeline` for "Prozor otkrivanja"; `passive`; `retry`; `failOpen`; `incidents` (black hole, detection window, `sessionsLost`); `capacityReport` (N+1 with headroom); sessions (`local`/`redis`, `cookie`/`hash`, `setRedisUp`); `setLbUp`; goals with `mark`/`since` and `errTotals`; `cacheAside` | `l05-incident` (37 / 11), `l05-drain`, `l05-sessions-local` |
| **14** Service | `mode: 'service'`: random per connection over ready endpoints (serving-terminating fallback), refused connections instead of HTTP codes, `clients.mode` (`perRequest`/`keepAlive`/`pool`), `clients.nat` + `sessionAffinity: 'ClientIP'`, `setReady`, `setSelected` ("Greška u selektoru"), `clients.pinTo` ("Upiši IP pa uvedi novu verziju"), `meta` (v1/v2 colours, Pod IPs), `sendRequest` ("Pošalji zahtjev"), `terminateServer` (`preStopSleepS`, `sigterm`, grace), `endpointSlice`, `hitShares`, `resetHits`, `setMode` (L04 rack in Service mode) | `l14-rack`, `l14-keepalive`, `l14-shutdown` |
| **24** Capstone | `mode: 'service'`: selector typo → `setSelected(false)` on every Pod (0 endpoints while Pods are healthy, connection refused); readiness on DB → `setReady(false)` on all; overload at max replicas; `redMetrics`, `metrics`; score with `affectedUsers` + `mark`/`since` (MTTR); trace waterfall from `state.recent` / `sendRequest`; logs from `recentEvents` | — |

Labels and selector editing belong to E3. E1 models only the result, whether a Pod is in the EndpointSlice (`setSelected`), and what kube-proxy then does with the traffic.

---

## Open questions for other owners

These are outside `src/engines/traffic/`, so they are noted here rather than changed:

- **Kit `LineChart`** (`src/kit/Stats.tsx`): it should break a line at non-finite values and leave them out of the y-axis maximum. Today one `NaN` poisons the whole chart. That is why `series.p95` cannot be charted yet.
- **Curriculum texts that contradict the corrected model** (`docs/curriculum.json`, `docs/research/sim-models.md`):
  - L05 model: "Machine off → … then 502" should say 504.
  - L05 and SIM 1: "Passive: any 502/504 → eject" should say "a failed connection: refused, reset or connect timeout; client timeouts don't count".
  - L04 and L05: the button and hook "Spori disk" describe a ×3 CPU model; "Sporiji procesor" / "Bučni susjed" matches what the CPU lanes show.
  - L02 goal "p95 < 1 s i < 1 % grešaka na najjeftinijem poslužitelju" cannot be met on the I/O incident preset. Its floor is p95 1150 ms (`latencyFloorMs('io', 0.95)`). With "p95 < 2 s", the cheapest answer is 1 vCPU / 8 GB at €18 (1.59 s, 0 %), which beats 2 vCPU / 4 GB at the same price (1.68 s, 1.5 %). That is exactly the RAM-not-cores lesson. With "p95 < 1,2 s" the answer is 2 / 8 GB at €24 (1.18 s).
  - L02 hook: "p95 oko 1,5 s" is 1.64 s in the engine ("oko 1,6 s").

