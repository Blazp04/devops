# Distributed systems and Kubernetes: fundamentals and simulation models (verified 2026-10-01)

This spec covers the five in-browser simulations and the fundamentals behind them. Every number below is either a real default (marked **[real default]**) or a classroom value I chose (marked **[sim]**). Several sims also have a value checked by running a headless prototype (marked **[validated]**).

**Why the sims run at 10 ms ticks:** Kubernetes control loops run every 10–15 s, but the load-balancer and queue sims need 10 ms resolution to show queueing. All sims use a fixed-step loop and a speed multiplier.

---

## 0. Version facts checked against current sources

| Topic | Status on 2026-10-01 |
|---|---|
| Kubernetes | **v1.37 "Garhwal"**, released 2026-08-26. The docs site now serves v1.37. |
| HPA per-object tolerance (`behavior.scaleUp/scaleDown.tolerance`) | **GA in 1.37** (alpha 1.33, beta 1.35). Without the field, the cluster-wide default is 10% (`--horizontal-pod-autoscaler-tolerance`). |
| HPA scale to zero (`minReplicas: 0`) | **Beta, on by default in 1.37.** Only works with Object or External metrics, never CPU/memory. |
| In-place Pod resize (`InPlacePodVerticalScaling`) | GA since 1.35. |
| Pod-level resources | Beta (on) since 1.34. |
| `Deployment.status.terminatingReplicas` | Beta (on) since 1.35. This only makes terminating Pods visible. The rollout math still does **not** count them. |
| CrashLoopBackOff | Default delays are 10 s, 20 s, 40 s … capped at 300 s, and reset after 10 min of clean running. `KubeletCrashLoopBackOffMax` (per-node cap) is beta since 1.35. `ReduceDefaultCrashLoopBackOffDecay` (1 s → 60 s) is still alpha. |
| Swap | NodeSwap GA in 1.34, but opt-in per node. **The sims assume no swap.** |
| MemoryQoS (cgroup v2 `memory.high`) | Beta in 1.37, and also needs kubelet config. The sims don't model it. |
| cgroup v1 | Deprecated in 1.35. The kubelet's `failCgroupV1` defaults to true, so cgroup v2 is the norm. |
| kube-proxy | Default mode is still `iptables`; `nftables` is available. `ipvs` is deprecated since 1.35 and will be off by default from 1.40. Each new **connection** goes to a **random** backend. `sessionAffinity: ClientIP` has a default timeout of 10800 s. |
| Service `trafficDistribution` | `PreferSameZone` and `PreferSameNode`; `PreferClose` is a deprecated alias. |
| preStop `sleep` action | GA in 1.34. |
| ingress-nginx | **Retired.** Best-effort maintenance ended March 2026. Teach the **Gateway API** for L7. |
| Scheduler score plugins | Default weights: NodeResourcesFit 1 (LeastAllocated), NodeResourcesBalancedAllocation 1, TaintToleration 3, NodeAffinity 2, PodTopologySpread 2, InterPodAffinity 2, ImageLocality 1. |
| Cluster Autoscaler | `scan-interval` 10 s, `scale-down-utilization-threshold` 0.5 (based on **requests**), `scale-down-unneeded-time` 10 m, `scale-down-delay-after-add` 10 m, `max-node-provision-time` 15 m, expander `least-waste`. |
| metrics-server | The official manifest sets `--metric-resolution=15s`. The binary's own default is 60 s. |
| Kafka | 4.3.x is current (4.3.0 May 2026, 4.3.1 June 2026). KRaft-only since 4.0. **Share groups ("Queues for Kafka", KIP-932) are production-ready since 4.2.** |
| RabbitMQ | 4.3 (April 2026). Quorum queues have a default `delivery-limit` of 20 since 4.0; 4.3 changed how redeliveries are counted. Classic mirrored queues were removed in 4.0. |
| AWS SQS | Visibility timeout defaults to 30 s, max 12 h. Standard queues allow about 120k in-flight messages. Delivery is at-least-once. |
| AWS ALB | Algorithms: round robin (default), least outstanding requests, weighted random (with Automatic Target Weights). Health checks default to 30 s interval / 5 s timeout / healthy 5 / unhealthy 2. Deregistration delay is 300 s. It fails open when all targets are unhealthy. |
| NGINX | Default is weighted RR. Also `least_conn`, `ip_hash`, `hash … consistent` (ketama), and `random two [least_conn]`. `least_time` is in open source since 1.31.0. `max_fails=1`, `fail_timeout=10s`. |
| Envoy | LEAST_REQUEST is power-of-two-choices (`choice_count` 2) for equal weights. With weights it uses `weight / (active+1)^bias`. |

---

## 1. Engine conventions (all five sims)

1. **Fixed timestep.**
   - LB and queue sims: `DT = 10 ms` sim-time.
   - Scheduler, HPA and rollout sims: `DT = 100 ms` (scheduler, rollout) or `1 s` (HPA).
   - Use an accumulator: `acc += realDelta * speed; while (acc >= DT) { step(); acc -= DT; }`.
   - Clamp `realDelta` to ≤ 250 ms so a hidden tab can't trigger a spiral of catch-up steps.
2. **Seeded RNG** (`mulberry32`). "Reset" must reproduce the same run so the lecturer can demo it reliably.
3. **Poisson arrivals.** `nextArrival += -ln(1-U)/λ`. On a rate change, resample from "now" (this is valid because the process is memoryless). Offer "Poisson (realistic)" as the default and "uniform" as an option.
4. **Keep sim state out of React state.**
   - Run a plain TS class and render a snapshot each animation frame.
   - Draw dots with one pooled SVG/canvas layer. Don't create one Motion component per request at 50 rps.
   - Use Motion for UI transitions only.
5. **Compressed time must be labelled.** When a value is shortened for class (e.g. a health check interval of 2 s), show a badge like `2 s (sim) · stvarno: 30 s (AWS ALB)`. Never show a compressed value as if it were the real default.
6. **Percentiles:** nearest-rank, `sorted[ceil(p·n) − 1]`, over a sliding window of successful requests only. Show "n/a" when n < 20. Show errors as a separate metric.
7. **Prototypes** (headless, run with `node file.ts`, used to validate the numbers here):
   - `/private/tmp/claude-501/-Users-blaz-Documents-GitHub-kubernetes-lekcije/858ec00e-0043-455a-a3f4-e3738f48312f/scratchpad/proto/lb-sim.ts`
   - `.../proto/queue-sim.ts`
   - `.../proto/hpa-sim.ts`
   - `.../proto/rollout-sim.ts`

---

## A. Why distributed systems: fundamentals

### A1. Vertical vs horizontal scaling
- **Vertical** (a bigger machine):
  - Simple, and needs no code changes.
  - Limits: a hard ceiling (the largest machine available), resizing usually needs a restart, and it is still **one machine, so still a single point of failure (SPOF)**.
  - Do **not** claim vertical scaling always costs "exponentially more". In the cloud, price per vCPU is roughly linear within an instance family. The real problems are the ceiling and the SPOF.
- **Horizontal** (more machines): needs a load balancer, stateless services and a network. It adds partial failures.
- Interactive chart ("why doesn't 10× servers give 10× throughput?"):
  - **Amdahl:** `S(N) = 1 / ((1−p) + p/N)`. Default `p = 0.95`, which gives a maximum of 20×.
  - **Universal Scalability Law:** `C(N) = N / (1 + α(N−1) + βN(N−1))`. Defaults `α = 0.05` (contention), `β = 0.001` (coherency). Peak at `N* = √((1−α)/β) ≈ 31`, and throughput **falls** after that.
  - Label it as a model, not a law of nature.

### A2. SPOF and availability math
- `A = MTBF / (MTBF + MTTR)`
- Components in series: `A = Π Aᵢ`. Two 99% components give **98.01%**.
- Components in parallel (one of n must work): `A = 1 − Π(1 − Aᵢ)`. Two 99% components give **99.99%**; three give 99.9999%.
- Example chain: LB 99.99% × app pair (2×99%) × single DB 99.9% = **99.88%**. The single DB dominates.

| Availability | Downtime per year | Downtime per 30 days |
|---|---|---|
| 99% | 87.6 h | 7.2 h |
| 99.9% | 8.76 h | 43.2 min |
| 99.99% | 52.6 min | 4.3 min |
| 99.999% | 5.3 min | 26 s |

- **Pitfalls to teach:**
  1. The parallel formula assumes **independent** failures. A shared rack, zone, bad deploy or bad config breaks that assumption.
  2. Failover is neither instant nor free. The LB detection window applies (see sim 1).
  3. Redundancy without spare capacity is fake. Two servers at 70% each become 140% on one server when the other dies. This is N+1 planning, and sim 1 should demo it.

### A3. Latency and geography
- Light in fiber travels at about 200,000 km/s, so the **minimum RTT is about 1 ms per 100 km of fiber path**.
- Physical minimum RTTs from Zagreb (great-circle distance):

| Destination | Distance | Minimum RTT |
|---|---|---|
| Split | 259 km | ≥ 2.6 ms |
| Frankfurt | 723 km | ≥ 7.2 ms |
| Ashburn, VA | 7,254 km | ≥ 72.5 ms |
| Tokyo | 9,343 km | ≥ 93 ms |
| Sydney | 16,028 km | ≥ 160 ms |

- Real RTT is always higher: routes aren't straight and routers queue packets. Present these as lower bounds and have students `ping` real hosts.
- Round trips before the first byte of a new HTTPS connection: TCP 1 RTT + TLS 1.3 1 RTT (TLS 1.2: 2 RTT) + HTTP 1 RTT, so **≥ 3 RTT**. QUIC/HTTP/3 merges transport and crypto into 1 RTT.
  - Sydney: ≥ 480 ms before the first byte.
  - Mini-sim: a map, a server-location dropdown and an animated round-trip counter.
- Mitigations: CDN/edge, regional deployments, connection reuse, caching.

### A4. Stateless vs stateful
- **Stateless service:** any instance can serve any request; state lives in a DB, Redis or object storage. Only stateless services scale horizontally and fail over trivially.
- **Local sessions** (in process memory) break with load balancing:
  - The next request lands elsewhere and the user is "logged out".
  - A server crash loses its sessions.
- **Sticky sessions** (an LB cookie like ALB's `AWSALB`, or K8s `sessionAffinity: ClientIP`) are a workaround, not a fix:
  - Load becomes uneven.
  - Sessions are still lost on crash.
  - Scale-out doesn't rebalance existing users.
- **Externalised state** (a Redis session store, or JWT plus DB) is the fix. Sim 1 has a toggle for this.

### A5. Replication and caching (intro level)
- **Cache-aside:** `avgLatency = h·t_cache + (1−h)·(t_cache + t_db)` and `dbLoad = (1−h)·λ`.
  - Example: `t_cache = 1 ms`, `t_db = 20 ms`, `h = 0.9` gives 3 ms on average and 10% of the load reaching the DB.
  - Pitfalls: invalidation, stale data, and a stampede when a hot key expires.
- **Read replicas** scale **reads, not writes**.
  - Async replication causes lag, so a user may not "read their own write".
  - Sync replication adds write latency equal to the slowest replica.
- Quorum intro: `N` replicas, write to `W`, read from `R`. `W + R > N` means the read and write sets overlap.

### A6. CAP (gentle)
- Correct statement: **while a network partition is happening**, a replicated store must either refuse some requests (C, linearizable) or answer with possibly stale or divergent data (A).
- CAP says nothing when there is no partition. PACELC adds that, without a partition, you trade latency against consistency.
- CAP's "C" is **not** ACID's "C".
- Mini-sim:
  - Two replicas, a "cut link" toggle, and a client writing to A and reading from B.
  - CP mode: B refuses reads/writes during the partition.
  - AP mode: B answers stale; on heal, last-write-wins shows a "lost" write.

---

## B. Load balancing: fundamentals

| Algorithm | How it picks | Good for | Bad when / pitfall |
|---|---|---|---|
| Round robin | Next healthy server in turn | Identical servers, similar requests | Different-sized servers or variable requests: the small server overloads (sim shows it) |
| Weighted RR | Smooth WRR (NGINX): `cw[i] += w[i]` for all; pick max `cw`; `cw[pick] −= Σw` | Known, stable capacity ratios | Weights are static. They're only right for **one** workload type; if the workload mix changes they're wrong. |
| Least connections | min(in-flight + queued at that server); weighted variant: min((active+1)/w) | Variable request durations, adapts automatically | At low load it is effectively random (all show 0). **A server that fails fast shows few connections and attracts traffic (black hole).** A new server gets flooded, hence "slow start". With many LBs each sees only its own connections. |
| Least outstanding requests | Same idea per HTTP request (ALB) | L7, variable requests | Same as least connections |
| Least response time | min(EWMA latency × (active+1)) (NGINX `least_time`) | Heterogeneous backends | Pure latency without the connection count herds and oscillates. Fast **errors** look "fast". |
| Random | Uniform among healthy | Stateless, many LBs, no shared state | Variance, ignores load |
| Power of two choices (P2C) | Sample 2 at random, take the one with fewer active | Many LBs, stale information; Envoy and NGINX `random two` | Slightly worse than global least-connections with one LB, but far more robust |
| IP hash / consistent hash | Hash of key onto a ring with virtual nodes (ketama, ring hash, Maglev) | Cache affinity, per-user locality | Hot keys; many users behind one NAT IP. Plain `hash mod N` moves most keys when N changes. |

**Key math for the hashing demo.**
- `hash mod N`, going from 3 to 2 servers: a key stays only if `h mod 3 == h mod 2`, so 1/3 stay and **2/3 move**. Going from 3 to 4: **3/4 move**.
- Consistent hashing moves about 1/N: going from 3 to 2, only the dead server's third moves.
- Use ≥ 100 virtual nodes per server (× weight), otherwise the ring is visibly uneven.

**L4 vs L7.**
- L4 (TCP/UDP) balances **connections** and sees only IPs and ports. Examples: NLB, K8s Service/kube-proxy.
- L7 (HTTP) balances **requests**. It sees paths, headers and cookies, and can retry, terminate TLS and route by path. Examples: ALB, NGINX, Envoy, Gateway API.
- **Pitfall:** HTTP/2, gRPC or keep-alive over an L4 balancer is "balanced" once per connection, so long-lived connections pin load unevenly. Fix it with L7 or client-side balancing.

**Health checks.**
- **Active:** the LB probes every *interval*, marks the server unhealthy after *U* consecutive failures and healthy after *H* successes.
  - Detection takes between `(U−1)·interval` and `U·interval` (+ the timeout if the server hangs).
  - ALB defaults: 30 s / 5 s / H 5 / U 2, so detection is up to about 60–65 s.
- **Passive** (outlier detection): ejects a server based on real traffic errors. NGINX: `max_fails=1` within `fail_timeout=10s` ejects for 10 s.
- **Fail-open:** if all targets are unhealthy, ALB sends to all of them anyway.
- **K8s mapping:**
  - Readiness failure removes the Pod from Service endpoints.
  - Liveness failure restarts the container.
  - Never put dependency checks (e.g. the DB) in liveness: one DB outage would trigger mass restarts.

**Connection draining.**
- The server is deregistered, gets no new requests, and in-flight requests finish (ALB default 300 s).
- K8s: the Pod is removed from the EndpointSlice and receives SIGTERM concurrently (grace period 30 s). Because endpoint removal propagates asynchronously, a `preStop: sleep` of a few seconds avoids dropped requests.

**Other topics.**
- **TLS termination at the LB:** decrypt, inspect and route; re-encrypt optionally. Passthrough keeps it L4 (SNI routing).
- **The LB itself is a SPOF.** Mitigations:
  - HA pair with a floating VIP (VRRP/keepalived).
  - DNS with multiple A records (clients cache by TTL, so failover is slow and uneven).
  - Anycast (the same IP advertised from many places via BGP).
  - Managed cloud LBs, which are themselves distributed fleets.

---

## SIM 1. Load balancer with configurable servers

### What the model represents (justification)
- It represents a **worker-pool server**: one worker (process or thread) per in-flight request, as in PHP-FPM, gunicorn sync workers, Puma, Apache prefork, or classic Java thread pools. The pool is sized to RAM.
- That sizing is real operational practice (`pm.max_children ≈ available RAM / process size`). It makes **CPU cores bound throughput** and **RAM bound concurrency**, which is exactly the lesson.
- Tooltip text (must be shown): async servers such as Node.js or Go need far less RAM per in-flight request.

### Parameters

| Parameter | Default | Range |
|---|---|---|
| `DT` | 10 ms | |
| `BASE_RAM_MB` (OS + runtime) | 512 | |
| `QUEUE_MAX` per server | 10 | 0–100 |
| `CLIENT_TIMEOUT` | 5000 ms | |
| Offered load λ | 10 req/s | 1–50 |
| Server vCPU | — | {1, 2, 4, 8} |
| Server RAM | — | {1, 2, 4, 8, 16} GB |
| Default servers | S1 1 vCPU/2 GB, S2 2 vCPU/4 GB, S3 4 vCPU/8 GB | |

Workload presets (CPU demand is exponential with the given mean; I/O is fixed):

| Preset | cpuMs | ioMs | memMB per worker | Bottleneck |
|---|---|---|---|---|
| **API (default)** | 200 | 300 | 256 | mostly CPU |
| I/O-heavy (waits on DB) | 50 | 1000 | 256 | RAM/workers |
| CPU-heavy (image resize) | 400 | 50 | 256 | CPU |

Derived quantities:
```
W        = max(1, floor((RAM_MB − 512) / memMB))    // 1GB→2, 2GB→6, 4GB→14, 8GB→30, 16GB→62
cap_cpu  = vCPU · 1000 / cpuMs                       // req/s
cap_mem  = W · 1000 / (cpuMs + ioMs)                 // req/s, optimistic (no contention)
capacity ≈ min(cap_cpu, cap_mem)
WRR weight ∝ capacity (normalise smallest to 1)      // default servers, API: 5 / 10 / 20 → weights 1:2:4
```
Capacities with the API preset:

| Server | Capacity |
|---|---|
| 1/2 GB | 5 |
| 2/2 GB | 10 (RAM nearly binding) |
| 2/4 GB | 10 |
| 4/2 GB | **12 (RAM-bound)** |
| 4/8 GB | 20 |

With the I/O preset, 4 vCPU/2 GB reaches only 5.7 while 1 vCPU/8 GB reaches 20.

### Tick algorithm
```ts
// 1) arrivals (Poisson). Each req: {tArrive, cpuLeft = cpuMs·Exp(1), ioLeft = ioMs, user?}
// 2) route: cands = servers with lbState==='Healthy' (exclude Draining/Unhealthy/Ejected)
//    none → 503 (or fail-open toggle: all registered)
//    s = algo(cands)
//    if s.proc==='Crashed' → 502 immediately (connection refused)
//    else if s.proc==='Hung' → park request until timeout → 504
//    else if s.inflight < W → inflight.push else if s.queue < QUEUE_MAX → queue.push else 503
// 3) per server, per tick (proc==='Up'):
//    if (!boundedWorkers && BASE + inflight·mem > RAM) → OOM: all inflight+queued → 502, proc='Crashed', restartAt = now + 6 s
//    drop queued with age > timeout → 504
//    nCpu = #inflight with cpuLeft>0; share = nCpu ? min(1, vCPU/nCpu) : 0   // a request uses ≤1 core
//    for r of inflight: r.cpuLeft>0 ? r.cpuLeft -= DT·share : r.ioLeft -= DT
//    done = cpuLeft≤0 && ioLeft≤0 → latency = now − tArrive;
//         latency > timeout ? count 504 "wasted work" (client already left) : success
//    while inflight < W && queue: inflight.push(queue.shift())       // FIFO
// 4) lifecycle: Crashed --6s--> Starting (3s warm-up, probes fail) --> Up
// 5) active health check per server every 2 s (phase-staggered), timeout 1 s:
//    pass iff proc==='Up' (option "probe waits in same queue": fail if est. queue wait > 1 s)
//    Unhealthy after 2 consecutive fails, Healthy after 2 consecutive passes; new/restarted servers start Unhealthy
// 6) passive (toggle): any 502/504 from s → ejected for 10 s (max_fails=1, fail_timeout=10s)
// 7) LB retry toggle (proxy_next_upstream-like): on 502 before the request was processed, retry once on another server
```
- LC and least-response-time use `active = inflight + queued` at that server. That is exactly what the LB tracks when it is the only client.
- Least response time: `EWMA α = 0.2` on completed latencies, score `= ewma·(active+1)`.
- P2C: two **distinct** random healthy servers, then compare `active` (or `active/weight`).

### Buttons and scenarios
- **Kill (crash):** instant 502s, and the black-hole effect under least connections.
- **Hang:** requests pile up until the 5 s timeout and probes time out. It looks very different from a crash.
- **Drain:** no new requests; when `inflight + queue = 0`, the server shows "safe to remove". Compare with Kill.
- **Restart.**
- **Misconfigured unbounded workers:** an OOM crash loop.
- **Memory leak (optional):** BASE grows by 5 MB/s until OOM.

### Sticky sessions mode
- 20 users, each request from a random user.
- Session store: `local` (vanishes with the server) or `external` (Redis).
- Affinity: none / LB cookie (assigned on first request; reassigned if the server is unhealthy) / consistent hash on user ID.
- With local sessions and no affinity, a request that lands on a server without the user's session counts as **"session lost (odjavljen)"**.
- Also show the imbalance caused by affinity.

### Metrics
- Offered λ, goodput (successes/s over a 5 s window), error rate (10 s window) split into 503 / 502 / 504.
- p50/p95/p99 over the last 10 s of successes.
- Per server:
  - CPU% = `Σ min(nCpu, vCPU)·DT / (vCPU·1000 ms)` over 1 s
  - busy workers / W
  - RAM = `BASE + inflight·mem`
  - queue depth, handled req/s, LB state, plus a Little's-law check `L ≈ λ·W`
- 60 s time-series charts.

### Validated outcomes
Default servers, API preset, seed 42, 300 s measured, queue 10, timeout 5 s.

| λ (req/s) | RR | WRR 1:2:4 | Least conn. | P2C | Least resp. time |
|---|---|---|---|---|---|
| 10 | 0.1% err, p95 1.3 s | 0%, 0.9 s | 0%, 1.1 s | 0%, 1.1 s | 0%, 1.0 s |
| 15 | **2.7%**, 3.2 s | 0%, 1.0 s | 0%, 1.2 s | 0%, 1.3 s | 0%, 1.1 s |
| 20 | **10.6%**, 3.7 s | 0%, 1.1 s | 0.1%, 1.5 s | 0.1%, 1.6 s | 0%, 1.3 s |
| 25 | **15.3%** | 0%, 1.3 s | 0.1%, 1.9 s | 0.2%, 2.1 s | 0%, 1.5 s |
| 30 | **18.9%** | 0.2%, 2.0 s | 0.6%, 2.5 s | 1.5%, 2.8 s | 0.1%, 1.9 s |
| 35 (= total capacity) | 25.9% | 4% | 4.6% | 8.7% | 3.5% |

Random behaves like RR. At λ = 15, RR leaves S1 at 98% CPU and S3 at 27%.

Other validated scenarios:
- **RAM matters (single server, 2 vCPU, I/O preset):**
  - 2 GB tops out at ~5.7 rps goodput **with CPU at only ~15%**.
  - 4 GB gives ~13 rps; 8 GB gives ~27 rps at λ = 30.
  - With the API preset, all three RAM sizes give ~10 rps. RAM doesn't help a CPU-bound workload.
- **Mixed servers, I/O preset** (A = 4 vCPU/2 GB, B = 1 vCPU/8 GB): A saturates with 8% CPU. At λ = 15, least connections gives 0.4% errors vs RR's 11.8%.
- **Kill S3 at λ = 15:**
  - Failed requests in the detection window: RR 11, least connections **37** (black hole).
  - Afterwards the cluster is at 100% of its remaining capacity: the N+1 lesson.
- **Unbounded workers on 1 vCPU/2 GB at λ = 4:** 11 OOM crashes in 120 s and goodput 0.8 rps, vs ~4 rps with a bounded pool.
- **Queue length vs timeout:** with `QUEUE_MAX = 30` and the I/O preset on 2 GB, goodput **collapses to ~0** because every request waits close to 5 s and then times out. Keep 10 as the default; expose the slider as an advanced "bufferbloat" lesson.
- **Insight from the API preset at overload:** an 8 GB server can show *more* timeouts than a 2 GB one, because more concurrent requests share the same CPU. More concurrency adds no capacity. Explain this if students notice it.

**Key messages (HR):**
- "Jezgre određuju propusnost, RAM određuje koliko zahtjeva istovremeno stane."
- "Round robin ne zna da su poslužitelji različiti."
- "Least connections reagira na stvarno opterećenje, ali mrtav poslužitelj koji odmah odbija veze izgleda 'najmanje opterećeno'."
- "Health check ne otkriva kvar trenutačno."

**Pitfalls (don't teach these wrong):**
- A single request must not use more than one core (`share ≤ 1`).
- Don't fill RAM with traffic until a crash in the default mode. OOM happens only with misconfiguration or a leak.
- Never include rejected requests in latency percentiles.
- Never show averages only.
- Never show instant failure detection.

---

## C. Queues and event-driven systems: fundamentals

| | Queue (RabbitMQ, SQS) | Log (Kafka) |
|---|---|---|
| Consumption | Message is removed after ack (competing consumers) | Records stay until retention (Kafka default 7 days); each consumer group keeps its own offset |
| Pub/sub | Via exchanges/fan-out (RabbitMQ) or SNS → SQS | Natural: N groups read the same log independently; replay by resetting the offset |
| Parallelism | Any number of consumers | ≤ partitions per group (extra consumers idle). Kafka ≥ 4.2 share groups add queue-like consumption. |
| Ordering | FIFO per queue, but lost with competing consumers or redelivery. SQS Standard is best-effort; SQS FIFO orders per message group. | Strict **per partition**; `partition = murmur2(key) mod P` for keyed records |

- **Ack, visibility timeout and redelivery:**
  - SQS: after a receive, the message is invisible for the visibility timeout (default 30 s). If it isn't deleted in time it reappears, so slow consumers cause **duplicates**.
  - RabbitMQ: unacked messages are requeued when the consumer's channel or connection closes; the consumer ack timeout defaults to 30 min.
- **Delivery semantics:**
  - At-most-once: ack before processing; a crash loses the message.
  - At-least-once: ack after processing; a crash causes a duplicate.
  - "Exactly-once" end to end with external side effects is not something the broker gives you. Teach **at-least-once + idempotent processing = effectively once**: an idempotency key with a unique constraint or dedupe table, or the outbox/inbox pattern.
  - Kafka transactions give exactly-once only for read-process-write *within Kafka*. SQS FIFO dedupes within a 5-min window.
- **Retries:**
  - Full jitter: `delay = random(0, min(cap, base·2^attempt))` (AWS, "Exponential Backoff and Jitter").
  - Without jitter, retries synchronise into waves.
  - Retries multiply load: 3 layers × 3 attempts = 27×. Use retry budgets and circuit breakers.
- **Dead letter queue:**
  - After `maxReceiveCount` (SQS) or `delivery-limit` (RabbitMQ quorum default 20), move the poison message aside.
  - RabbitMQ pitfall: **without a configured dead-letter exchange, messages over the limit are dropped.**
- **Backpressure:**
  - A bounded queue with a reject policy, e.g. RabbitMQ `x-overflow: reject-publish` (the default is `drop-head`), plus publisher flow control.
  - Kafka consumers pull, which is natural backpressure on the consumer side.
- **Scaling consumers:** drain time = `backlog / (k·μ − λ)`. Autoscale on queue depth with KEDA, which drives an HPA with an External metric: `desired = ceil(totalMetric / targetAverageValue)`.
- **Queueing laws:**
  - **Little's law:** `L = λ·W` (holds for any stable system).
  - **M/M/1:** `W = S / (1−ρ)`, `L = ρ / (1−ρ)`. As a multiple of service time:

    | ρ | 0.5 | 0.8 | 0.9 | 0.95 | 0.99 |
    |---|---|---|---|---|---|
    | W / S | 2× | 5× | 10× | 20× | 100× |

    The cause is randomness: arrivals cluster, and idle time lost earlier can never be recovered.
  - **M/M/c (Erlang C):**
    `P_wait = [A^c/c! · c/(c−A)] / [Σ_{k<c} A^k/k! + A^c/c! · c/(c−A)]` with `A = λ/μ`
    `W_q = P_wait / (cμ − λ)`
    With c = 4 and μ = 1/s: ρ = 0.5 → W = 1.09 s; 0.75 → 1.51; 0.875 → 2.48; 0.95 → **5.46 s**.
  - **No buffer (Erlang B):** `B(c, A)` via the recursion `B₀ = 1`, `Bₖ = A·Bₖ₋₁/(k + A·Bₖ₋₁)`.
    c = 4, A = 2 (only 50% utilisation!) → **9.5% of requests lost**; A = 3 → 20.6%.

---

## SIM 2. Queue simulation

### Parameters
| Parameter | Default | Range / notes |
|---|---|---|
| Producer λ | 2 msg/s | 0–20 |
| Burst | 15 msg/s for 10 s | Also a "+100 now" button |
| Consumers k | 4 | 0–12 |
| Service time | Exp, mean 1000 ms | So capacity = 4 msg/s |
| `pFail` (transient) | 0 | 0–50% |
| `pPoison` | 0 | 0–5% |
| `maxDeliveries` | 5 | Also show "RabbitMQ quorum default: 20" |
| Backoff | full jitter, base 500 ms, cap 30 s | Toggle: immediate requeue |
| Visibility timeout | 30 s | 1–60 s |
| Ack mode | manual after processing | Alternative: auto-ack |
| Idempotency | off | |
| Max queue | ∞ | Option: 50 with `reject-publish` (producer backs off) or `drop-head` |
| Mode | queue | Alternative: **"bez reda" (direct sync calls)** |

### Tick algorithm (DT = 10 ms)
1. **Arrivals.**
   - Direct mode: if a consumer is free, it starts the message; otherwise the message is **lost (503)**. Optional client retry with backoff shows a retry storm.
   - Queue mode: publish; if the queue is full, apply the overflow policy.
2. **Visibility timeouts.** For in-flight messages with `deadline ≤ now` that aren't acked, set them visible again. Their receive count was already incremented on receive.
3. **Consumers finishing.**
   - Success: run the side effect, then ack, which deletes the message.
   - With idempotency, the side effect runs only if the message ID is unseen.
   - If the visibility timeout already expired, the ack is late: the message may already have been redelivered, so you get a duplicate effect.
   - Failure: if `receiveCount ≥ maxDeliveries`, move to the DLQ; else `visibleAt = now + fullJitter(attempt)`.
4. **Idle consumers** take the first visible message (FIFO among visible) and start the visibility clock.
   - Label "redoslijed nije garantiran (SQS Standard)".
5. **Crash buttons:**
   - "crash before side effect": redelivered, no duplicate.
   - "crash after side effect, before ack": redelivered, **duplicate**, unless idempotent.

### Metrics
- Ready depth, in-flight count, age of oldest message.
- In/out throughput.
- End-to-end latency p50/p95 (publish → ack).
- Consumer utilisation.
- Retries, DLQ count, side effects (unique vs total, plus duplicates), lost (direct mode).
- Live **Little's law panel:** `L` (time-averaged ready + in-flight) vs `λ_out·W`.
- An M/M/c curve with a live "you are here" dot.

### Validated outcomes
| Scenario | Result |
|---|---|
| Direct mode, 2 msg/s, 4 consumers | **10.3% lost** (Erlang B predicts 9.5%) |
| Queue mode, same load | 0 lost; p50 0.77 s, p95 3.1 s |
| Burst 15/s × 10 s, direct | 152 of 445 lost |
| Burst, queue, 4 consumers | 0 lost; depth peaks ~100; drains in ~50 s (predicted 110/(4−2) = 55 s) |
| Burst, queue, 8 consumers | Peaks 66; drains in ~15 s |
| `pFail` 10%, poison 2% | DLQ 24 of ~1245 (≈ 2%), 236 retries |
| Visibility timeout 2 s with mean service 1 s | **13% duplicate side effects** (`e⁻² ≈ 13.5%` of jobs exceed 2 s). With idempotency: 0 duplicates. |
| Utilisation 0.5 / 0.75 / 0.875 / 0.95 | p50 0.77 / 1.12 / 1.86 / 3.88 s. Little's law matches to 2 decimals. |

### Kafka sub-sim
- Settings:
  - P partitions (default 3).
  - Keys = 10 user IDs, with a "hot key" option where one user sends 50%.
  - `partition = hash(key) mod P`. Use FNV in code; say "Kafka uses murmur2" in the text.
- Group A with C consumers (default 2): each partition goes to exactly one consumer; when C > P, the extra consumers are idle.
- Group B ("analytics") reads independently.
- Per-partition metrics: end offset, committed offset, **lag = end − committed**.
- Commit after processing; a crash before commit reprocesses from the committed offset.
- Retention keeps records, and a "replay" button resets the offsets.
- Adding or removing a consumer triggers a rebalance with about a 2 s pause on the moved partitions.
- Changing P remaps keys (pitfall).
- Ordering checker: per-key sequence numbers stay in order in Kafka; across competing consumers on a plain queue they do not.

---

## D. Kubernetes scheduling and resources: fundamentals

- **Requests** are what the **scheduler** reserves, and what CPU weight and the HPA percentage are based on. **Limits** are what the **kernel enforces**.
  - The scheduler never looks at actual usage.
  - If only a limit is set, the request defaults to that limit.
- **Allocatable** = capacity − kube-reserved − system-reserved − hard eviction threshold (memory 100Mi).
  - Example using the GKE formula for node pools created on GKE ≤ 1.36 (label it as an example):
    - 2 vCPU / 4 GiB → 1930m / ≈2972Mi
    - 2 vCPU / 8 GiB → 1930m / ≈6249Mi
    - 4 vCPU / 16 GiB → 3920m / ≈13.3Gi
- **Scheduling cycle:** queue (by priority) → **Filter** → **Score** → **Bind**.
  - Filter keeps nodes where Ready and not cordoned, taints are tolerated, selector/affinity match, and **Σ requests + pod request ≤ allocatable** for every resource, and Pod count < `maxPods` (110).
  - Score:
    - **LeastAllocated:** `score_r = (alloc_r − requested_r) · 100 / alloc_r`, averaged over CPU and memory.
    - BalancedAllocation: a newer version scores the *improvement* in balance, `50 + (50 + s_with − s_without)/2` with `s = (1 − |f_cpu − f_mem|/2)·100`.
    - Pick the highest; break ties at random.
    - For **scoring only**, zero requests count as 100m / 200Mi.
    - Bin-packing alternative: `MostAllocated`.
  - If no node passes: **Pending**, `PodScheduled=False/Unschedulable`, with a message like `0/3 nodes are available: 2 Insufficient cpu, 1 Insufficient memory.` It is retried on cluster changes; the Cluster Autoscaler reacts to it.
- **CPU over the limit is throttled, never killed.**
  - CFS quota: `quota = limit × 100 ms` per 100 ms period. A multi-threaded app can burn its quota early in the period, so it can be throttled even when its *average* usage is under the limit (latency spikes).
  - Under contention, CPU is shared in proportion to requests (cgroup `cpu.weight`). BestEffort gets the minimum weight.
- **Memory over the limit is OOMKilled.**
  - The kernel OOM-kills it, reason `OOMKilled`, exit code **137**.
  - On cgroup v2 the whole container is killed (`memory.oom.group`).
  - The container restarts with `restartPolicy: Always` and goes into CrashLoopBackOff (10 s → 20 s → … max 300 s; reset after 10 min OK).
  - Memory enforcement is reactive.
- **QoS classes:**
  - **Guaranteed:** every container has CPU and memory requests equal to limits.
  - **BestEffort:** no requests or limits at all.
  - **Burstable:** everything else.
  - `oom_score_adj`: Guaranteed −997; BestEffort 1000; Burstable `min(max(2, 1000 − 1000·memReq/nodeMem), 999)`.
- **Node-pressure eviction:**
  - Triggered when `memory.available < 100Mi` (other hard defaults: nodefs.available < 10%, nodefs.inodesFree < 5%, imagefs.available < 15%).
  - Checked every `housekeeping-interval` = 10 s.
  - Ranking, in order: (1) usage > request first, (2) lower priority first, (3) larger usage − request first. The kubelet does **not** use the QoS class directly; QoS is only a predictor.
  - Hard eviction uses a 0 s grace period. The Pod becomes `Failed/Evicted`, and its controller creates a replacement elsewhere.
  - Under pressure, the node gets a `memory-pressure` taint, so new **BestEffort** Pods aren't scheduled there.
  - If memory grows faster than the kubelet reacts, the **kernel OOM killer** acts first, using `oom_score + oom_score_adj`.

---

## SIM 3. Scheduler simulation

### Defaults
Nodes (each has a DaemonSet block of **100m / 200Mi** in requests):

| Node | Size | Allocatable |
|---|---|---|
| node-1 | 2 vCPU / 4 GiB | 1930m / 2972Mi |
| node-2 | 4 vCPU / 16 GiB | 3920m / 13622Mi |
| node-3 | 2 vCPU / 8 GiB | 1930m / 6249Mi |

Pod cards (one container each):

| Card | requests | limits | Usage model | Teaches |
|---|---|---|---|---|
| web | 250m / 256Mi | 500m / 512Mi | 150m / 200Mi steady | Burstable |
| api-guaranteed | 500m / 512Mi | = requests | 400m / 400Mi | Guaranteed |
| cpu-burner | 250m / 256Mi | 500m / — | CPU demand 1000m | **Throttled 50%**, never killed |
| batch | 1000m / 1Gi | — / 1Gi | CPU demand 1500m | Bursts into idle CPU; contention |
| leaky | 100m / 128Mi | — / 256Mi | Memory starts at 100Mi, +5 Mi/s | **OOMKilled** at ~31 s, then CrashLoopBackOff |
| besteffort | none | none | 200m / 300Mi | Fits anywhere; evicted first |
| big-db | 4000m / 8Gi | = requests | — | **Pending: "0/3 nodes are available: 3 Insufficient cpu"** |
| fragment | 1500m / 512Mi | | | Pending although total free CPU is enough (fragmentation) |

### Per tick (DT = 100 ms)
1. **Schedule** the head of the queue.
   - Show a per-node table: Filter result (✓ or ✗ with reason) and score breakdown.
   - Bind → ContainerCreating (1–3 s) → Running.
2. **CPU per node:**
   - `e_i = min(demand_i, limit_i ?? ∞)`. Throttled% = `(demand − e_i)/demand`.
   - If `Σe ≤ allocCpu`, everyone gets `e_i`. Otherwise water-fill in proportion to `max(request_i, 2m)`.
   - Slowed work raises the app's latency indicator.
3. **Memory per container:** `usage > limit` → OOMKilled, restart count +1, back-off timer, and usage resets on restart.
4. **Node memory, every 10 s** (the housekeeping interval):
   - If `Σ pod usage > allocatable` (equivalently, available < 100Mi when system daemons use exactly their reservation), evict **one** Pod using the ranking above, then re-check.
   - If at any tick `Σ usage > allocatable + 100Mi`, the kernel OOM kills the container with the highest `usage%ofNode·1000 + oom_score_adj`.
5. **Node bars, three layers:** requested (scheduler view), actual usage, Σ limits (show the overcommit when > 100%).

**Pitfalls:**
- Never make the scheduler look at usage.
- Never kill a container for CPU.
- Pods with no requests reserve nothing; that is why BestEffort Pods get packed onto nodes and evicted first.
- A memory limit equal to the request gives predictable behaviour.
- CPU limits are debated. Many teams set CPU requests without CPU limits to avoid throttling; present this as a trade-off, not a rule.

---

## E1. HPA and Cluster Autoscaler: fundamentals and SIM 4

### HPA algorithm (mirrors `replica_calculator.go` and `horizontal.go`)
```ts
// every syncPeriod = 15 s [real default]
if (cur > max) desired = max; else if (cur < min) desired = min; else desired = cpuDesired();
// per metric: compute, then take MAX across metrics
function cpuDesired() {
  // ignored: deleting/terminal pods. unready: Pending, not Ready, or (age < cpu-initialization-period 300 s
  //   AND metric window started before Ready transition). missing: no metric.
  const util = floor(100 * Σusage(readyPods) / Σrequest(readyPods));   // no CPU request ⇒ HPA can't act
  const ratio = util / targetUtil;
  if (!(unready.length && ratio > 1) && !missing.length) {
    if (1 - tolDown <= ratio && ratio <= 1 + tolUp) return cur;          // tolerance 0.1 (per-HPA field GA 1.37)
    return ceil(ratio * readyPods.length);
  }
  // conservative pass: missing → 100% of request if ratio<1, 0% if ratio>1; unready → 0% if ratio>1
  // recompute newRatio; if within tolerance or direction flipped → cur; else ceil(newRatio * countedPods)
}
// stabilisation (store RAW desired each sync):
upRec = min(desired, recs in last scaleUp.window /*0 s*/); downRec = max(desired, recs in last scaleDown.window /*300 s*/);
rec = cur; if (rec < upRec) rec = upRec; if (rec > downRec) rec = downRec;
// rate limits, start(p) = cur − added(p.period) + removed(p.period):
//   up:   max over policies {Percent 100 → ceil(start·2), Pods 4 → start+4} per 15 s; rec = min(rec, max(limit,cur), maxReplicas)
//   down: Percent 100 per 15 s → floor(start·0); rec = max(rec, min(limit,cur), minReplicas)
```
- The docs formula is `ceil(cur × cur/target)`. In code the multiplier is the number of Pods with usable metrics; these are equal at steady state.
- Worked example: 3 Pods at 90% with a 50% target → ratio 1.8 → 6 Pods. At 54% → ratio 1.08 → **no change** (tolerance).

### Sim defaults
- **App:**
  - Request 500m CPU / 256Mi, limit 1000m.
  - 25 ms of CPU per request, so 20 rps per Pod at 100% of request and 40 rps at the limit.
  - Target 50% → 10 rps per Pod.
  - min 2, max 20.
  - Traffic presets: steady 20 rps; spike 20 → 100; daily sine 10–80; flash crowd 20 → 200.
- **Metrics:** each scrape = mean usage over the last 15 s; the HPA reads the latest scrape.
- **Pod start [sim]:** schedule 1 s; image pull 1 s if cached on the node, 6 s on a new node; app start 10 s; readiness probe every 5 s.
- **Traffic split:** evenly over Ready Pods only. `ρ = perPod/capacityAtLimit`.
  - Latency ≈ `50 ms / (1 − min(ρ, 0.95))`; label it as an M/M/1 approximation.
  - When ρ > 1, a fraction `1 − 1/ρ` is dropped.
- **Nodes:** 2 vCPU / 8 GiB (1930m / 6.1Gi allocatable, DaemonSets 200m/300Mi), so 3 app Pods per node.
  - Start with 2 nodes; node group min 2, max 6.
- **Cluster Autoscaler:**
  - Scan every 10 s.
  - If any Pod is Pending/Unschedulable: bin-pack onto a template node, subtract nodes already provisioning, and add nodes. Provisioning delay is 75 s [sim]; label it "real: typically minutes, cloud-dependent".
  - Scale-down: a node is unneeded if `max(Σreq_cpu/alloc, Σreq_mem/alloc) < 0.5` and its Pods fit elsewhere. Remove it after 10 min unneeded **and** 10 min after the last scale-up.
  - Non-empty nodes are removed one at a time; empty ones in bulk (max 10). Draining evicts Pods (respecting PodDisruptionBudgets) and they reschedule.
- **Speed:** 1× / 5× / 10× / 30×. A full cycle takes about 22 sim-minutes, about 2 min at 10×.

### Validated timeline (spike 20 → 100 rps at t = 60 s)
- HPA steps: 2→3 (t=60); 3→7 (t=75; the raw recommendation was 8, so the step is capped by the +4 policy); 7→9 (t=90; unready Pods counted at 0%).
- A Pending Pod triggers the CA at t=80: +1 node, Ready at t=155. All 9 Pods are Ready by ~t=180.
- During t = 60–90: ρ ≈ 0.99 and estimated latency ≈ 5 s.
- At steady state the HPA **stays at 9**: utilisation 55% gives ratio 1.10, which is inside the tolerance (the ideal is 10). This is the dead band.
- The load drops at t=420, and scale-down to 2 happens at **t=720** (300 s window).
- The CA removes the extra node after ≥ 10 min unneeded. Removing nodes evicts Pods, which can cause a small HPA blip (2→3→2).

**Key messages (HR):**
- "Podovi se skaliraju u sekundama, nodovi u minutama."
- "HPA gleda potrošnju u odnosu na requests, Cluster Autoscaler gleda samo requests."
- "Scale-down je namjerno spor (300 s)."

**Pitfalls:**
- The CPU limit caps the observable utilisation. With limit = 2× request, one HPA step can scale by at most about 4× at a 50% target.
- No CPU request means no HPA.
- **Argo CD link:** don't keep `spec.replicas` in Git for an HPA-managed Deployment, or use `ignoreDifferences`. Otherwise sync or self-heal fights the HPA.

---

## E2. Rolling update: fundamentals and SIM 5

### Exact rules (mirror `rolling.go` and `deployment_util.go`)
- **Fence posts:**
  - `surge = maxSurge` as a percentage of N, rounded **up**.
  - `unavail = maxUnavailable` as a percentage of N, rounded **down**.
  - If both are 0 after rounding, `unavail = 1`. Explicitly setting both to 0 is rejected.
  - Defaults are 25%/25%:

    | N | 1 | 2 | 3 | 4 | 5 | 10 |
    |---|---|---|---|---|---|---|
    | surge / unavail | 1/0 | 1/0 | 1/0 | 1/1 | 2/1 | 3/2 |

  - So a single replica gets a zero-downtime rollout by default.
- **Each reconcile** does either scale-up *or* scale-down:
```ts
// scale up new RS
maxTotal = N + surge; all = Σ rs.spec.replicas   // terminating Pods NOT counted
if (all < maxTotal) newRS += min(maxTotal - all, N - newRS);
// else scale down old
minAvailable = N - unavail;
newUnavailable = newRS.spec - newRS.available;
maxScaledDown = all - minAvailable - newUnavailable;  if (maxScaledDown <= 0) stop;
// 1) cleanup unhealthy old replicas (up to maxScaledDown)
// 2) avail = Σ available (old+new); if (avail > minAvailable) scale old (oldest first) down by avail - minAvailable
```
- **Available** = Ready for ≥ `minReadySeconds` (default 0).
  - **Service traffic follows Ready, not Available.** `minReadySeconds` doesn't delay traffic.
- ReplicaSet deletion order (simplified): unscheduled → pending → not ready → most recently ready.
- **Recreate:** scale old to 0, wait until old Pods are fully gone, then create new (downtime).
- `progressDeadlineSeconds` (default 600): sets `Progressing=False, ProgressDeadlineExceeded`. **There is no automatic rollback**; that is `kubectl rollout undo`, Argo Rollouts, or reverting Git with Argo CD.
- `revisionHistoryLimit` defaults to 10.
- Probe defaults: `periodSeconds 10`, `timeoutSeconds 1`, `successThreshold 1`, `failureThreshold 3`, `initialDelaySeconds 0`.
  - Without a readiness probe, a Pod is Ready as soon as its containers start.
  - `terminationGracePeriodSeconds` defaults to 30.

### Sim defaults
- N = 4; maxSurge/maxUnavailable dropdowns {0, 1, 2, 25%, 50%, 100%}.
- The YAML shown uses user-settable values `readinessProbe.periodSeconds: 2` and `progressDeadlineSeconds: 60`. These are legitimate fields, so they don't need a "fake default" badge, but say the real defaults are 10 and 600.
- Pod timings: schedule 1 s; pull 4 s for the new image (0 s for the old, cached one); app start 6 s; graceful shutdown 2 s, or the full 30 s if the app ignores SIGTERM.
- Traffic: 20 rps over Ready Pods, coloured by version v1/v2. Both versions serve at the same time, so mention API compatibility.
- Endpoint-removal propagation delay is 1 s. Without `preStop: sleep 5` and with immediate exit on SIGTERM, a few requests fail.
- Scenarios:
  - good version
  - CrashLoopBackOff image
  - readiness never passes
  - **no readiness probe** (requests hit warming Pods → errors)
  - Recreate (full outage)
  - surge 1 / unavailable 0 (needs extra capacity, no capacity dip)
  - surge 0 / unavailable 1 (no extra capacity, 25% dip)

### Validated outcomes (N = 4)
| Setting | Duration | Pods (non-terminating) | Peak incl. terminating | Min available |
|---|---|---|---|---|
| 25%/25% | 28 s | ≤ 5 | **7** | 3 |
| surge 1 / unavailable 0 | 51 s | ≤ 5 | 6 | 4 |
| surge 0 / unavailable 1 | 46 s | ≤ 4 | 5 | 3 |
| 100% / 0 | 17 s | ≤ 8 | 8 | 4 |

- Broken image (N = 4, defaults): stalls at **3 old Ready + 2 new unready**. Service capacity stays at 75%; no auto-rollback.
- Broken image with N = 10, surge 3, unavailable 2: stalls at **8 old / 5 new**. This matches the official docs example exactly.
- The peak above `N + surge` comes from terminating Pods, which aren't counted. That is documented behaviour; show `.status.terminatingReplicas`.

**Key messages (HR):**
- "maxSurge zaokružuje gore, maxUnavailable dolje."
- "Bez readiness probe Kubernetes ne zna kad je aplikacija spremna."
- "Deployment sam ne radi rollback."

---

## Cross-cutting "never teach this" list
1. The scheduler or Cluster Autoscaler uses real CPU/RAM usage. **False:** they use requests.
2. A Pod over its CPU limit gets killed. **False:** it is throttled.
3. Two 99% servers give 99.99% "for free". Only with independent failures, instant failover and N+1 capacity.
4. Health checks detect a failure immediately. They don't; show the window.
5. The queue guarantees exactly-once. It doesn't; use at-least-once with idempotency.
6. More consumers always help Kafka. Not beyond the partition count.
7. A Deployment rolls back automatically. It doesn't.
8. `minReadySeconds` delays traffic. It doesn't.
9. A K8s Service balances requests. It balances **connections**, randomly (iptables/nftables mode).
10. Latency grows linearly with load. It doesn't; it grows as `1/(1−ρ)`.
11. ingress-nginx is the current recommendation. It was retired in March 2026; use the Gateway API.

Sources:
- [Kubernetes 1.37 release](https://kubernetes.io/releases/1.37/)
- [HPA docs](https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/)
- [Deployment docs](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [Node-pressure eviction](https://kubernetes.io/docs/concepts/scheduling-eviction/node-pressure-eviction/)
- [Resource management](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [Pod QoS](https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/)
- [Pod lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)
- [Virtual IPs / kube-proxy](https://kubernetes.io/docs/reference/networking/virtual-ips/)
- [Feature gates (website repo)](https://github.com/kubernetes/website/tree/main/content/en/docs/reference/command-line-tools-reference/feature-gates)
- [Deployment controller rolling.go](https://github.com/kubernetes/kubernetes/blob/master/pkg/controller/deployment/rolling.go)
- [HPA horizontal.go](https://github.com/kubernetes/kubernetes/blob/master/pkg/controller/podautoscaler/horizontal.go)
- [HPA replica_calculator.go](https://github.com/kubernetes/kubernetes/blob/master/pkg/controller/podautoscaler/replica_calculator.go)
- [Scheduler default plugins](https://github.com/kubernetes/kubernetes/blob/master/pkg/scheduler/apis/config/v1/default_plugins.go)
- [KEP-3973](https://github.com/kubernetes/enhancements/tree/master/keps/sig-apps/3973-consider-terminating-pods-deployment)
- [Cluster Autoscaler FAQ](https://github.com/kubernetes/autoscaler/blob/master/cluster-autoscaler/FAQ.md)
- [metrics-server](https://github.com/kubernetes-sigs/metrics-server)
- [GKE node sizing](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/plan-node-sizes)
- [Ingress NGINX retirement](https://kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/)
- [Google OSS blog on Ingress NGINX](https://opensource.googleblog.com/2026/02/the-end-of-an-era-transitioning-away-from-ingress-nginx.html)
- [ALB target group attributes](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-target-group-attributes.html)
- [ALB health checks](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html)
- [SQS visibility timeout](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html)
- [NGINX upstream module](https://nginx.org/en/docs/http/ngx_http_upstream_module.html)
- [Envoy load balancers](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/load_balancers)
- [Kafka 4.2 announcement](https://kafka.apache.org/blog/2026/02/17/apache-kafka-4.2.0-release-announcement/)
- [Confluent Kafka 4.2](https://confluent.io/blog/apache-kafka-4-2-release/)
- [Kafka 4.3.1 announcement](https://kafka.apache.org/blog/2026/06/25/apache-kafka-4.3.1-release-announcement/)
- [RabbitMQ 4.3 release](https://www.rabbitmq.com/blog/2026/04/23/rabbitmq-4.3-release)
- [Amazon MQ RabbitMQ 4](https://docs.aws.amazon.com/amazon-mq/latest/developer-guide/rabbitmq-4.html)