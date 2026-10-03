# Kurikulum „Kubernetes od nule”: simulation-first design

**Lens:** the curriculum is built around its strongest interactive moments. Every lecture has:
- one flagship simulation;
- a „Predvidi” prompt that must be answered before the sim runs;
- auto-checked „Zadaci” (goals);
- a „Pokvari!” moment where the student causes a failure and watches the system react, or watches what is missing.

The last break-it of each lecture is the hook for the next lecture. Students should always feel the pain before the fix arrives.

I checked the project conventions in `/Users/blaz/Documents/GitHub/kubernetes-lekcije/docs/AUTHORING.md`. This outline follows them:
- the student is addressed as „ti”;
- „image” stays in English;
- „deploy/isporuka” is the activity and „Deployment” is the object;
- the running example is Klopa;
- colours: v1 blue, v2 violet, broken build rose;
- dashed outline = desired state, solid = actual state;
- spiky glyph = error, hollow glyph = timeout.

---

## 0. Design contract for all 24 lectures

**1. Interaction loop.** Each lecture follows this order:
1. Hook: a Klopa incident.
2. Feel the pain: manual mode or the old way.
3. Predict (gates „Pokreni”).
4. Run.
5. Zadaci.
6. Pokvari! (red danger buttons).
7. An auto-generated „Što se upravo dogodilo” recap built from the sim's events.
8. Code drawers.
9. Mit ili istina?
10. Recap and quiz (one diagnosis question, one question from an earlier lecture).

**2. Honest sims**
- Seeded RNG. „Ponovi isti promet” replays the identical run.
- A compressed-time badge: `2 s (sim) · stvarno: 30 s`.
- Percentiles are computed over successful requests only; errors are shown split into 502/503/504.
- Never show averages alone.
- Movement that carries latency (requests travelling) uses linear easing.
- Under reduced motion, sims switch to a discrete mode.

**3. Six shared sim engines.** One pure TypeScript core each, so the 24 flagships are built on six engines rather than 24 separate builds.

| Engine | Model (from sim-models.md) | Used in |
|---|---|---|
| **E1 Promet** (traffic) | 10 ms ticks, Poisson arrivals, worker-pool servers (CPU = throughput, RAM = concurrency), LB algorithms, health checks, sessions | L02, L04, L05, L14 (Service mode), L16, L20, L24 |
| **E2 Red** (queue) | Queue/visibility timeout/ack/DLQ/idempotency; Kafka partitions and offsets | L06, L18 (scaling on queue depth), L24 |
| **E3 Klaster** (cluster) | Nodes, Pods, controllers, scheduler filter/score, kubelet, probes, rollout math, HPA and Cluster Autoscaler | L10–L13, L16–L19, L22, L24 |
| **E4 Tvornica** (factory) | Build steps, layer cache, pipeline stations, digests | L08, L21, L24 |
| **E5 Tko vidi?** (who sees it) | Access graph: actors × paths × RBAC → can or cannot read | L15, L23 |
| **E6 Git ↔ klaster** | Commit graph, poll ring/webhook, sync/health state machine, selfHeal/prune | L22, L23, L24 |

Standalone small sims: L01 packet tracer, L03 „Sporo ili mrtvo?”, L07 stack builder, L09 Compose canvas, L19 storage.

**4. Correctness tests as acceptance criteria**
- Rolling update: `available ≥ N − maxUnavailable` and `total(non-terminating) ≤ N + maxSurge`.
- HPA: `ceil(cur × util/target)` with tolerance 0.1.
- Scheduler: never binds a Pod over allocatable *requests*.
- Service: only Ready Pods whose labels match are endpoints; backend chosen at random per connection.
- Queue: Little's law holds; at-least-once delivery.
- Argo CD: no automatic revert of drift unless `selfHeal` is on; no deletion unless `prune` is on.

---

## MODUL 1 — Zašto raspodijeljeni sustavi (blue)

### L01 · Put jednog zahtjeva — što se dogodi kad upišeš klopa.hr (30 min)

**Purpose.** Pre-training. It names the parts every later sim reuses: DNS, IP, port, TCP connection, HTTP request/response, status codes, localhost vs 0.0.0.0, and RTT. It also works as the course trailer: a stepped fly-through of the finished Klopa architecture, so students see where the course ends. Above all it teaches students to read symptoms: *connection refused* ≠ *timeout* ≠ *NXDOMAIN*. They will use this skill for 502/504, ImagePullBackOff and broken Services.

**Pain.** „Radi na localhost:3000, ali kolega s drugog laptopa ne može otvoriti.”

**Scenes**
1. Trailer: the Klopa map in its L24 state, stepped through („Na kraju ćeš razumjeti svaki kvadratić”).
2. DNS as a phone book: name → IP, with a resolver hop and a TTL cache (animated query).
3. IP + port = building + door. A process *listens* on a port; a second process on the same port gets an error.
4. TCP handshake = 1 RTT, then HTTP request/response. Status code families as coloured envelopes (2xx/4xx/5xx; 502/503/504 introduced by name).
5. `127.0.0.1` vs `0.0.0.0`: the same app is reachable locally and refused from outside. This sets up Docker port mapping in L09.
6. Distance is latency. A map with physical minimum RTTs: Zagreb→Frankfurt ≥ 7,2 ms, →Sydney ≥ 160 ms. A new HTTPS connection costs ≥ 3 RTT.

**Flagship: „Put zahtjeva” (packet tracer).** Pick a URL from presets. The request walks DNS → TCP → TLS → HTTP → app while a waterfall builds hop by hop.
- **Predvidi:** „Koliko round-tripova prije prvog bajta odgovora na novoj HTTPS vezi?”
- **Zadaci:** diagnose four broken URLs by symptom alone.
- **Pokvari!:**
  - „DNS ne zna ime” (NXDOMAIN)
  - „Krivi port” (refused, instant)
  - „Sluša samo na 127.0.0.1”
  - „Server ne odgovara” (hollow dot, timeout)
  - „Server u Sydneyu” (waterfall stretches)

**Code drawers:** annotated `curl -v`; `dig klopa.hr`; `ss -ltnp`; a 10-line HTTP server binding to `0.0.0.0:3000`.

**Misconceptions**
- „localhost je uvijek moje računalo”
- „Refused = server je spor”
- „Latencija se može optimizirati do nule”

**Klopa map:** students → one laptop. **Bridge:** „Stavimo Klopu na pravi server.”

---

### L02 · Jedan server u 12:00 — granice jednog računala (35 min)

**Purpose.** Students feel the limits of one machine and learn the metric vocabulary used for the rest of the course: throughput, p50/p95/p99, error rate, utilisation. They learn that CPU sets throughput and RAM sets how many requests fit at once. Vertical scaling is legitimate and is often the right first move, but it has a ceiling, needs a restart, and still leaves a single point of failure. Introduces „deploy” informally (laptop → server) with a chip: „Deploy ≠ Deployment, vidjet ćeš u L13”.

**Pain.** Klopa runs on one 1 vCPU / 2 GB VPS. At 11:58 everything is fine. At 12:00 it slows down, then returns 503s.

**Scenes**
1. Informal deploy: copy the app to a rented server.
2. Server glyph anatomy: vCPU lanes, RAM bar, worker pool, local queue. A tooltip notes that async servers (Node, Go) need less RAM per request.
3. The hockey stick: a utilisation slider drives a latency curve (W/S = 2×, 5×, 10×, 20×, 100× at ρ = 0,5…0,99) with a „ti si ovdje” dot.
4. „Prosjek laže”: a histogram with average, p50 and p95.
5. Vertical-scaling catalogue:
   - each resize shows a restart gap;
   - the top of the catalogue says „Nema većeg”;
   - price is roughly linear within an instance family (do not fake an exponential curve).
6. SPOF and availability: `A = MTBF/(MTBF+MTTR)` with a downtime-per-year table.

**Flagship: „Ručak u 12:00”** (E1, single server)
- **Controls:** traffic λ slider; „Nalet 12:00” burst; workload preset (API / I/O-heavy / CPU-heavy); vCPU {1,2,4,8}; RAM {1…16 GB}.
- **Predvidi** (validated numbers): „2 vCPU, API preset: RAM 2 → 8 GB. Što se dogodi s propusnošću?”
  - Answer: almost nothing, about 10 rps either way.
  - Then switch to the I/O preset: 2 GB tops out at ~5,7 rps with CPU only at ~15 %; 4 GB reaches ~13 rps; 8 GB reaches ~27 rps.
- **Zadaci:**
  1. Find the λ where p95 crosses 1 s.
  2. Survive the 12:00 burst with ≤ 1 % errors on the cheapest server.
  3. Show one case where RAM helps and one where it does not.
- **Pokvari!:**
  - „Izvuci utikač” (availability 0)
  - „Neograničeni workeri”: an OOM crash loop, 11 crashes in 120 s at λ = 4 on 1 vCPU/2 GB.
  - Hitting the top of the catalogue.

**Code drawers:** a worker-pool config line (`pm.max_children` / gunicorn `workers`) with the RAM ÷ process-size rule; a small k6 load-test script; `htop` / `free -m` snapshot.

**Misconceptions**
- „Više RAM-a = brži server”
- „Latencija raste linearno s opterećenjem”
- „Vertikalno skaliranje je loše”
- „Prosjek je dovoljan”

**Bridge.** The catalogue is maxed out and the plug can be pulled. Next: „kupimo više servera?”

---

### L03 · Zašto raspodijeliti — i što to košta (35 min)

**Purpose.** This is the lecturer's primary goal. It covers the three reasons we distribute (capacity ceiling, availability through redundancy, distance to users) and what distribution costs:
- partial failure;
- an unreliable network;
- non-linear scaling;
- correlated failures;
- the need for N+1 capacity.

It ends on a cliffhanger: a second server does nothing yet.

**Pain.** Klopa expands to three faculties. One outage during exam week costs trust. „Kupimo još servera?”

**Scenes**
1. Three reason cards, each with a micro-animation.
2. Availability builder:
   - drag components into series or parallel, with scrubbable nines;
   - series of two 99 % components = 98,01 %; parallel = 99,99 %;
   - chain LB 99,99 % × app pair × single DB 99,9 % = 99,88 % (the DB dominates).
3. „Isti ormar / isto napajanje” toggle: failures become correlated and the parallel gain collapses.
4. N+1: two servers at 70 % become 140 % on the survivor when one dies.
5. Scaling is not linear: Amdahl/USL chart with scrubbable α and β; peak around N ≈ 31, then throughput falls. Labelled as a model.
6. „Mreža nije pouzdana”: flip cards for lost, delayed, duplicated, reordered and partitioned messages.
7. „Treba li ti ovo uopće?” checklist.

**Flagship: „Sporo ili mrtvo?”** A client calls three replicas over an unreliable network. Each round hides one fault: crash, GC pause, partition or packet loss. The student sets a timeout and decides between „prebaci promet” and „čekaj”. The scoreboard shows false alarms (failing over away from a merely slow server) against user waiting time. Auto mode then plots the timeout/retry trade-off curve.
- **Predvidi:** „Timeout 200 ms, a p99 servera je 300 ms — koliko lažnih uzbuna?”
- **Zadaci:** pick a timeout with < 5 % false alarms and user wait < 1 s; then add retries with full jitter.
- **Pokvari!:**
  - „Prereži mrežu” (both sides think the other is dead)
  - „GC pauza 2 s”
  - „Gubitak paketa 5 %”
  - Final button „Dodaj drugi server” in the L02 sim: all traffic still hits server 1, because users only know one address.

**Code drawers:** `curl --max-time`; retry with exponential backoff and full jitter (`delay = random(0, min(cap, base·2^n))`); availability formulas in a DeepDive.

**Misconceptions**
- „Dvostruko servera = dvostruki kapacitet”
- „Raspodijeljeno = automatski pouzdanije” (10 servers at 99 % → ~9,6 % chance at least one is down)
- „Mreža je pouzdana”
- „Svaka aplikacija treba Kubernetes”

**Bridge.** „Tko dijeli promet?”

---

### L04 · Load balancer — tko dijeli promet i što je „pošteno” (50 min) — the lecturer's flagship

**Purpose.** The lecturer's explicit request. Students build heterogeneous servers (2 GB vs 4 GB vs 8 GB RAM, 1–8 vCPU), pick an algorithm, send traffic and watch what happens. They learn that algorithms matter when servers or requests differ, and that the difference shows in p95/p99 and errors, not in the average. The lecture also plants L4 vs L7 (per connection vs per request) for the Service lecture.

**Pain.** Klopa has three servers behind one address: 1 vCPU/2 GB, 2/4, 4/8. With round robin at 12:00, the small one dies while the big one idles.

**Scenes**
1. Manual mode: the student *is* the LB and clicks a server for every request. They are overwhelmed within seconds, then press „Automatski”.
2. Algorithm ladder on the same seed:
   - Random
   - Round robin
   - Weighted RR (smooth WRR; weights from capacity, 1:2:4)
   - Least connections
   - Power of two choices
   - Least response time (Napredno)
3. Server builder with the capacity formula visible:
   - `cap_cpu = vCPU·1000/cpuMs`
   - `W = (RAM − 512)/memMB` workers
4. Request mix (light / heavy / memory-hungry): why static weights are right for only one workload mix.
5. L4 vs L7 „envelope”: L4 sees IP:port (connections); L7 opens the envelope (path, header, cookie) and routes `/api` vs `/slike`.
6. Small multiples: three algorithms side by side on identical traffic.

**Flagship: „Balanser u tvojim rukama”** (E1, full)
- **Controls:**
  - Rack builder: drag servers in and out. Presets Mali / Srednji / Veliki, or Prilagođeni with separate vCPU and RAM sliders.
  - λ 1–50; pattern stalni / valovi / nalet; workload preset.
  - Algorithm selector; „Ponovi isti promet”.
- **Metrics:**
  - goodput;
  - errors split 502/503/504;
  - p50/p95/p99;
  - per server: CPU %, busy workers/W, RAM, queue depth.
- **Predvidi** (validated, seed 42): „RR, λ = 15 — koliko zahtjeva padne?”
  - ~2,7 % errors; S1 at 98 % CPU while S3 sits at 27 %. WRR: 0 %.
  - At λ = 20: RR 10,6 % vs WRR 0 %.
- **Zadaci:**
  1. 0 % errors at λ = 20 with the default rack.
  2. 2 vCPU/4 GB vs 2 vCPU/8 GB on the API preset have the same capacity; switch to I/O and 8 GB wins.
  3. Cheapest rack surviving λ = 25 with p95 < 1,5 s.
- **Pokvari!:**
  - „Spori disk” on one server: WRR keeps feeding it, least connections adapts.
  - „Nalet 12:00”.
  - „Neograničeni workeri” (OOM).
- **Must be true:**
  - one request uses at most one core;
  - rejected requests are excluded from latency percentiles;
  - the worker-pool model is stated in a tooltip.
- **Planted for L14:** a toggle „Kubernetes Service (L14)” labelled *nasumično po konekciji, ne vidi veličinu servera*.

**Code drawers:** an NGINX `upstream` block with `weight=`, `least_conn` and `random two least_conn`; Envoy's P2C in a DeepDive.

**Misconceptions**
- „Round robin je pošten”
- „LB ubrzava svaki zahtjev” (it adds capacity, plus one hop)
- „Više RAM-a = veća propusnost”
- „Balansira se po zahtjevu”

**Bridge.** „A što kad server padne usred ručka?”

---

### L05 · Kad server padne — health checkovi, sesije i gdje živi stanje (45 min)

**Purpose.** Failure behind a load balancer:
- detection is never instant (the health-check window);
- crash, hang and drain look completely different;
- the least-connections „black hole”;
- N+1 capacity;
- the LB itself is a SPOF.

Then state: in-memory carts → sticky sessions → externalised state, which makes the app stateless. All state now sits in the DB, which becomes the bottleneck and SPOF. Cache and read replicas are introduced at intro level.

**Pain.** S3 crashes at 12:03 and 37 orders fail. Then students complain „košarica mi je prazna, odjavilo me”.

**Scenes**
1. Health-check timeline: interval × unhealthy threshold = detection window. Badge: `2 s (sim) · stvarno: 30 s, 2 neuspjeha (AWS ALB)`.
2. Crash vs Hang vs Drain: instant 502, vs requests stuck until the 5 s timeout (504, hollow dots), vs graceful draining.
3. Black hole: a server that fails fast shows the fewest connections and attracts traffic. Passive ejection fixes it.
4. N+1 capacity revisited live.
5. Where the cart lives: process memory → sticky cookie (uneven load, lost on crash) → Redis. Pets vs cattle („vlastiti bicikl vs gradski romobili”).
6. The camera pans to the DB:
   - every app now depends on it;
   - cache-aside formula (h = 0,9 → 3 ms average, 10 % DB load);
   - read replica with a lag slider: a „pročitaj vlastiti upis” violation.
7. „Tko balansira balanser?”: HA pair with a floating IP, managed cloud LB, DNS.

**Flagship: „Ugasi server usred ručka”** (E1 with failure and session modules)
- **Controls:**
  - per server: Kill / Hang / Drain / Restart;
  - health-check interval and threshold; passive-check toggle; LB retry toggle;
  - session mode (lokalno / sticky / Redis) with 20 users.
- **Predvidi** (validated): „Kill S3 at λ = 15 — više propalih zahtjeva uz RR ili uz least connections?” → RR 11 vs LC 37.
- **Zadaci:**
  1. Survive Kill S3 with < 2 % errors.
  2. Drain S2 for maintenance with 0 failed requests.
  3. 0 „sesija izgubljena” after killing any server.
- **Pokvari!:**
  - Kill
  - Hang
  - „Ubij Redis” (everyone's cart disappears: shared state is the new SPOF)
  - „Ugasi load balancer”
- **CAP:** one sentence in a DeepDive („samo tijekom particije biraš konzistentnost ili dostupnost”).

**Code drawers:** NGINX `max_fails=1 fail_timeout=10s`; a minimal `/healthz` handler; a session store configured with Redis.

**Misconceptions**
- „LB odmah zna da je server pao”
- „LB uklanja jedinstvenu točku kvara”
- „Sticky sessions rješavaju stanje”
- „Dva servera na 99 % = 99,99 % besplatno”

**Bridge.** „SMS ‚narudžba spremna’ blokira cijeli ručak.”

---

### L06 · Redovi poruka i događaji — nalet bez izgubljenih narudžbi (50 min)

**Purpose.** The lecturer asked for event queues. This lecture covers:
- decoupling in time;
- smoothing bursts (a queue does *not* add capacity);
- pull-based load balancing (competing consumers);
- at-least-once delivery + idempotency = effectively once;
- visibility timeout, retries with jitter, DLQ, ordering limits;
- work queue vs pub/sub;
- queue vs log (Kafka).

**Pain.** Klopa calls the SMS gateway and the kitchen-ticket printer synchronously. When the SMS gateway is slow, orders time out. Then a retry produces „dvaput ćevapi”.

**Scenes**
1. Synchronous chain: the user waits for payment + SMS + ticket; an SMS outage kills ordering.
2. A queue in between: 202 + order ID, and workers pull.
3. λ vs μ: if λ > μ the queue grows without bound; drain time = backlog ÷ (kμ − λ).
4. Ack timing: ack before processing (crash → lost) vs ack after (crash after side effect → duplicate); visibility timeout.
5. Idempotency key: the order ID has a unique constraint, so the duplicate is ignored.
6. Poison message: retries with full jitter → DLQ. Without a configured DLX, RabbitMQ drops messages over the delivery limit.
7. Work queue vs pub/sub fan-out (kitchen, SMS and analytics each get a copy).
8. Queue vs log: Kafka partitions, keys, offsets, consumer groups, replay; consumers beyond the partition count sit idle. Fact callout: KRaft-only since Kafka 4.0; share groups (queue-like consumption) since 4.2.

**Flagship: „Kuhinjska tračnica”** (E2)
- **Modes:** „bez reda (izravni pozivi)” / „s redom”.
- **Controls:**
  - λ; „Nalet 12:00” (15 msg/s × 10 s); „+100 odmah”;
  - consumers 0–12; pFail; pPoison; maxDeliveries (with „RabbitMQ quorum zadano: 20”);
  - ack mode; visibility timeout 1–60 s; idempotency; max queue + overflow policy.
- **Metrics:** depth; oldest message age; end-to-end p50/p95; retries; DLQ; side effects unique vs total; lost; live Little's-law panel.
- **Predvidi** (validated): „Izravni pozivi, 2 msg/s, 4 workera — samo 50 % iskorišteni. Koliko narudžbi se izgubi?” → ~10 % (Erlang B predicts 9,5 %). With a queue: 0.
- **Zadaci:**
  1. Burst with 0 lost and drain < 20 s (8 consumers ≈ 15 s).
  2. Visibility timeout 2 s gives ~13 % duplicate orders; find out why and fix it with idempotency (0 duplicates).
  3. Isolate a poison message to the DLQ without blocking others.
- **Pokvari!:**
  - „SMS servis pao” (queue mode: orders keep succeeding and depth rises)
  - „Sruši workera nakon kuhanja, prije potvrde” (duplicate)
  - „Sruši workera prije kuhanja” (redelivery, no duplicate)
  - „Pokvarena poruka”
- **Kafka sub-sim** in scene 8: hot-key toggle; C > P leaves idle consumers.

**Code drawers:**
- consumer loop with ack after processing;
- SQL `INSERT … ON CONFLICT DO NOTHING` idempotency;
- RabbitMQ quorum queue declaration with `x-delivery-limit` and dead-letter exchange;
- keyed Kafka produce (optional).

**Misconceptions**
- „Red ubrzava obradu”
- „Svaka poruka stiže točno jednom”
- „Poruke se obrađuju redom”
- „Red = pub/sub”
- „Kafka treba ZooKeeper”

**Klopa map:** + queue + worker pool. **Bridge.** „Novi kolega: ‚kod mene radi’.”

---

## MODUL 2 — Pakiranje i pokretanje softvera (violet)

### L07 · Virtualni stroj i kontejner — dva načina dijeljenja računala (40 min)

**Purpose.** The requested VM vs container comparison, anchored on the reveal that **a container is an isolated process**:
- namespaces = what it can see;
- cgroups = what it can use;
- no kernel of its own.

Also covered: the density and start-time vs isolation trade-off; the realistic answer that in the cloud containers run inside VMs; Docker Desktop's hidden Linux VM; amd64 vs arm64.

**Pain.** „Radi na mom laptopu”: Python and library version conflicts. A whole physical server per app sits at 10 % utilisation.

**Scenes**
1. Three eras, from the Kubernetes docs: physical → virtualised → containers.
2. Dependency hell: two apps on one host need different library versions.
3. Stack morph VM ↔ container (layout animation).
4. „Kontejner je samo proces”: PID 1 seen from inside vs PID 48213 seen from the host; `uname -r` is identical.
5. Namespaces as glasses: pid, net, mnt, uts, ipc, user, cgroup.
6. cgroups as the limiter: `memory.max` → OOM; `cpu.max` → greyed-out (throttled) periods.
7. Containers in cloud VMs; Docker Desktop's Linux VM; `linux/arm64` vs `linux/amd64`.
8. Isolation spectrum: container → user namespaces (GA 1.36) → gVisor → microVM (Kata, Firecracker; Apple `container` runs one VM per container) → full VM.

**Flagship: „Slagač stoga”.** A 16 GB physical server, with a VM mode and a container mode.
- „Dodaj aplikaciju” fills a density counter. The start race shows boot stages vs process start, given as ranges rather than fake precise numbers.
- **Predvidi:** „Koliko aplikacija stane na 16 GB u svakom načinu?”
- **Zadaci:** fit 12 apps; confine a memory leak to one app; find the mode where an exploit cannot cross.
- **Pokvari!:**
  - „Napad: kernel exploit”: a crack spreads across all containers but stops at the hypervisor.
  - „Curenje memorije bez limita” (the host's OOM killer hits a random process) vs with `memory.max` (only that container is OOMKilled).

**Code drawers:** `docker run --memory 256m --cpus 0.5` plus `ps aux` on the host; `cat …/memory.max`; DeepDive: a „container from scratch” with `unshare` in ~3 lines (Linux only).

**Misconceptions**
- „Kontejner je lagani VM”
- „Izolacija je jednaka kao kod VM-a”
- „Kontejneri su zamijenili VM-ove”
- „Docker radi nativno na Macu”
- „Svaki image radi svugdje”

**Bridge.** „Kako zapakirati Klopu?”

---

### L08 · Docker image i Dockerfile — Klopa u kutiji (45 min)

**Purpose.** Dockerisation:
- image vs container (class vs instance);
- Dockerfile; layers as git commits; build-cache invalidation; instruction ordering; `.dockerignore`; multi-stage builds;
- registry push/pull of only the missing layers;
- tag (movable sticky note) vs digest (immutable);
- the writable layer is ephemeral;
- secrets stay in layers.

Plus Docker's architecture (CLI → dockerd → containerd → runc) and the OCI standard, which is why Kubernetes can run these images without Docker.

**Pain.** Every one-line code change triggers a three-minute rebuild, and a teammate accidentally pushed an image containing `.env`.

**Scenes**
1. One image fans out into three containers, each with its own thin writable layer.
2. Container lifecycle: write a file, remove the container, and the file is gone.
3. Union filesystem as transparent sheets: copy-up and whiteout markers.
4. Cache check runs top-down; the first invalidated layer rebuilds everything after it.
5. Multi-stage: the build tools stay behind and the image shrinks.
6. Push shows „Layer already exists”. Fact callouts:
   - Docker Hub limit: 100 pulls / 6 h unauthenticated;
   - Bitnami images moved to `bitnamilegacy`;
   - Docker Hardened Images are free.
7. `klopa-api:latest` as a sticky note moved to a new digest, while an earlier node still runs the old one.
8. Stack diagram (CLI → dockerd → containerd → runc) and the OCI badge.

**Flagship: „Laboratorij build cachea”** (E4)
- **Setup:** draggable Dockerfile instruction cards; buttons „Promijeni kod”, „Promijeni ovisnosti”, „Build”; toggles `.dockerignore` and multi-stage; stopwatch, image size and a layer inspector. Timings are labelled *ilustrativno*.
- **Predvidi:** „Promijeniš jedan red koda — koji se slojevi ponovno grade?”
- **Zadaci:** code-change rebuild < 5 s; image < 200 MB; find the leaked secret.
- **Pokvari!:**
  - „Kopiraj .env pa ga obriši”: the layer inspector still shows it in a lower layer.
  - „Push :latest preko stare verzije”: two nodes now run different code.
  - „Obriši kontejner s podacima”.

**Code drawers:**
- a bad-order Dockerfile vs a good multi-stage Dockerfile (pinned base tag; verify the current Node LTS tag when authoring);
- `.dockerignore`;
- `docker build -t klopa-api:1.4.0 .`, `docker run -p 8080:3000`, `docker image history`;
- push output; a digest reference;
- `docker init` mention.

**Misconceptions**
- „Image = kontejner”
- „Promjene u kontejneru se spremaju”
- „RUN rm uklanja datoteku iz imagea”
- „:latest je fiksna verzija”
- „Kubernetes pokreće Docker” (dockershim removed in 1.24; images are OCI)
- „Treba DOCKER_BUILDKIT=1” (BuildKit is the default since Engine 23.0)

---

### L09 · Docker Compose — cijela Klopa na jednom računalu (40 min)

**Purpose.** The bridge to orchestration:
- multi-container app declared in YAML;
- user-defined network with DNS by service name;
- published ports; volumes;
- `depends_on` with `condition: service_healthy`;
- restart policies.

Its failure mode (the host dies and everything dies; no scheduling across machines) is the exact motivation for Kubernetes.

**Pain.** web + api + worker + RabbitMQ + Redis + Postgres means six `docker run` commands with hard-coded IPs, and no teammate can reproduce the setup.

**Scenes**
1. Six commands vs one `compose.yaml`: the first taste of „opiši što želiš”.
2. Port mapping:
   - two containers can both use :80 internally;
   - two cannot share host :8080;
   - `EXPOSE` does not publish a port;
   - `localhost` inside a container is not your laptop.
3. Service-name DNS on the user-defined network; the default bridge network has no name DNS.
4. Named volume vs bind mount vs tmpfs; `down` vs `down -v`.
5. `depends_on` gives start order, not readiness; healthcheck conditions fix that.
6. `restart: unless-stopped` heals a crashed container, but only on this host.
7. „Ugasi računalo”: the whole of Klopa is gone, and `--scale worker=3` is still one machine.

**Flagship: „Compose slagalica”.** A host canvas:
- networks as coloured regions, volumes as cylinders, published ports as doors in the host wall;
- a live `compose.yaml` with two-way highlighting;
- a test browser on `localhost:8080`.

- **Predvidi:** „Nakon `down` pa `up` — jesu li narudžbe još u bazi? A nakon `down -v`?”
- **Zadaci:** web reaches api by name; api waits for a healthy DB; survive a container crash; try to survive host death (impossible).
- **Pokvari!:**
  - „Prebaci db na drugu mrežu” (`could not resolve`)
  - „Dva servisa na 8080” (port already allocated)
  - „docker rm db bez volumena”
  - „Ugasi host”

**Code drawers:** `compose.yaml` (no `version:` key) with a Postgres healthcheck (`pg_isready`), named volume and `.env` reference; `docker compose up -d / ps / logs -f api`.

**Misconceptions**
- „Kontejneri se spajaju preko IP-ova”
- „depends_on čeka spremnu bazu”
- „docker-compose + version: '3.8'” (v1 dead since July 2023; current is the `docker compose` plugin)
- „restart: always = visoka dostupnost”

**Bridge.** „03:00, server pao, nitko ne spava pored njega.”

---

## MODUL 3 — Kubernetes: temelji (teal)

### L10 · Zašto Kubernetes — željeno stanje i petlja usklađivanja (40 min)

**Purpose.** The course's single threshold concept: declarative desired state plus a level-triggered reconciliation loop (promotri → usporedi → ispravi). This lecture fixes the visual grammar for the rest of the course: dashed ghost = desired, solid = actual, a controller fills the ghost. It also states what Kubernetes is not: it does not build code, it is not CI/CD, it is not a PaaS, and it is not a conductor running a script.

**Pain.** Klopa runs on five servers with Compose. Server 2 dies at 03:00 and nobody notices until 11:30.

**Scenes**
1. Imperative script vs declarative statement. After a crash, the script does not know anything happened; the loop does.
2. Thermostat: 22 °C dashed, 18 °C solid; it acts on the difference and does not care why.
3. Chain of thermostats: many controllers, each owning one slice.
4. Level-triggered: the „Pod umro” event is lost, and the next pass fixes it anyway.
5. Object anatomy: `spec` (dashed) vs `status` (solid), reused in every later lecture.
6. Conductor myth card, with „gdje analogija puca”; the „nije PaaS” list.

**Flagship: „Ti si orkestrator”** (E3)
- **Manual mode:** 30 containers and 5 servers. Drag containers onto servers within capacity while the clock runs. Events arrive: „03:00 server-2 pao”, „12:00 trebamo 10 api”, „10:00 nova verzija”. Score = minutes of missing capacity.
- **„Predaj Kubernetesu”:** the same events are handled by the loop in seconds, with a compressed-time badge.
- **Predvidi:** „Spavaš 01–07. Koliko minuta nedostupnosti?”
- **Zadaci:** survive the three events by hand, then with the loop; compare the scores.
- **Pokvari!:**
  - „Ugasi server u 03:00”
  - „Izgubi događaj” (the loop still converges)
  - „Promijeni želju usred popravka” (it converges to the newest desired state)

**Code drawers:** a Deployment snippet with `replicas: 3` highlighted, mapped to the ghosts; `kubectl apply -f` immediately followed by `kubectl get deploy -w` showing READY 1/3 → 3/3 (a successful apply ≠ a running app).

**Misconceptions**
- „Kubernetes izvršava plan korak po korak”
- „kubectl odmah nešto napravi”
- „Kubernetes mi daje CI/CD i bazu”
- „Kubernetes je zamjena za Docker”
- „Kubernetes automatski čini aplikaciju skalabilnom”

---

### L11 · Klaster iznutra — tko što radi nakon kubectl apply (40 min)

**Purpose.** A minimal notional machine, introduced just in time:
- the API server (the only component that talks to etcd);
- etcd (the whiteboard);
- the scheduler (only *assigns* a node);
- the controller-manager;
- the kubelet (starts containers through CRI: containerd or CRI-O);
- kube-proxy (optional).

Every component *watches* the API server. The data plane survives a control-plane outage. Vocabulary: „control plane”, never „master”.

**Pain.** „Apply kaže ‚created’, a Pod je Pending. Tko je kriv?”

**Scenes**
1. The restaurant-manager whiteboard analogy, without the „gives orders” part.
2. Hub-and-spoke watch streams.
3. Numbered six-step walk-through of `apply`: kubectl → API → etcd → ReplicaSet controller creates ghosts → scheduler binds a node → kubelet asks containerd to pull and start → status flows back.
4. CRI stack: kubelet → containerd/CRI-O → runc (dockershim removed in 1.24).
5. In the cloud, nodes are VMs (callback to L07); managed control planes.
6. Self-healing ladder preview, three levels:
   - the kubelet restarts the container;
   - a controller replaces the Pod;
   - after a node is lost, Pods are rescheduled once the default 300 s toleration expires.
7. Learning environments: kind, minikube, Killercoda. Headlamp replaces the archived Dashboard.

**Flagship: „Klaster pod mikroskopom”** (E3). Every component has an off switch. The student scales, kills Pods and applies manifests, and watches the symptoms.
- **Predvidi:** „Ugasiš scheduler i podigneš replicas na 5?” → the ghosts stay Pending with no node.
- **Pokvari!:**
  - scheduler off: Pending
  - controller-manager off: a killed Pod is not replaced
  - kubelet on node-2 off: NotReady after tens of seconds; eviction after ~5 min (compressed badge)
  - API server off: kubectl fails, but traffic still flows and nothing heals
  - entire control plane off: running apps keep running
  - etcd lost: the cluster forgets everything (one line about backups)
- **Zadaci:** match symptom cards to the responsible component.

**Code drawers:** `kubectl get pods -o wide`; `kubectl describe pod` Events (Scheduled / Pulling / Pulled / Created / Started); `kubectl get events -w`; `kubectl get nodes`.

**Misconceptions**
- „Control plane pokreće kontejnere”
- „Pad control planea ruši aplikacije”
- „Scheduler pokreće kontejnere”
- „Komponente se zovu izravno”

---

### L12 · Pod — najmanja jedinica i njezin život (40 min)

**Purpose.**
- A Pod is one or more containers sharing one IP (localhost) and volumes.
- One main concern per Pod.
- Init containers; native sidecars (`initContainers` + `restartPolicy: Always`, GA 1.33).
- Phases vs conditions (Running ≠ Ready); `restartPolicy`.
- CrashLoopBackOff: 10 s → 20 s → 40 s… capped at 300 s, reset after 10 min of clean running.
- ImagePullBackOff.
- Pods are disposable: a new Pod has a new name and a new IP.
- YAML anatomy (apiVersion/kind/metadata/spec) is introduced here, once.

**Pain.** The Klopa api runs as a bare Pod. A node reboot deletes it for good, and a crash produces a restart loop.

**Scenes**
1. Pod as a shared flat: address, kitchen, flatmates. Where it breaks: Pods are not long-lived homes.
2. Why web + DB in one Pod is wrong: they would scale together.
3. Init container runs to completion; the sidecar starts first and stops last.
4. Lifecycle stepper: Pending → pull → ContainerCreating → Running → Ready.
5. Backoff ring doubling.
6. Container restart in place (restart count +1) vs a replacement Pod (new name and IP).
7. YAML anatomy, with spec and status mapped to the ghost grammar.

**Flagship: „Život jednog Poda”** (E3, one node)
- **Configure:** image tag (good / typo / crashes / slow start), exit code, restartPolicy, add an init container or sidecar. A timeline shows describe-style events, a restart counter and a backoff ring.
- **Predvidi:** „Aplikacija se ruši odmah. Koliko pokretanja u prve 2 minute?” → 4 (pauses of 10, 20, 40 s…).
- **Zadaci:**
  - get the Pod Ready;
  - make an init container fetch config before the app starts;
  - diagnose three Pods from the STATUS column alone.
- **Pokvari!:**
  - „Krivi tag” (ErrImagePull → ImagePullBackOff)
  - „Aplikacija se ruši” (CrashLoopBackOff)
  - „Obriši Pod”: a bare Pod is gone forever. This is the bridge to L13.
  - „Ugasi čvor”: a bare Pod is never rescheduled.

**Code drawers:** annotated `pod.yaml` (with `resources.requests`); a multi-container Pod with a native sidecar; `kubectl get pod -w` showing CrashLoopBackOff; `kubectl logs --previous`.

**Misconceptions**
- „Pod = kontejner”
- „Pod se popravlja na mjestu i zadržava IP”
- „Web i baza u jedan Pod”
- „Podove stvaramo izravno”
- „Sidecar je samo još jedan kontejner u containers”

---

### L13 · Deployment i ReplicaSet — kopije, nova verzija, povratak (45 min)

**Purpose.**
- Ownership chain: Deployment → ReplicaSet → Pods.
- Self-healing and scaling.
- Rolling-update maths: maxSurge rounds up, maxUnavailable rounds down, defaults 25 %/25 %.
- Readiness gates the rollout.
- A bad version *stalls* the rollout: there is no automatic rollback, only `ProgressDeadlineExceeded`.
- Rollback = scaling the old ReplicaSet back up.
- Recreate strategy.
- During a rollout both versions serve traffic, so they must be compatible.

This lecture also answers the lecturer's „what is a deployment”, part one: Deployment the object vs deploy the activity vs release.

**Pain.** Klopa needs four api replicas and a new version, „vegetarijanski meni”, at 10:00 without stopping orders.

**Scenes**
1. Three cards: deploy / Deployment / release (release returns in L20).
2. Kill a Pod; the ReplicaSet fills the ghost.
3. What creates a new ReplicaSet: a replicas change does not; an image or env change does (new `pod-template-hash`). Predict, then run.
4. Rolling update step-through for N = 4, with two invariant gauges.
5. Validated small multiples:

| Settings | Duration |
|---|---|
| 25/25 | 28 s |
| surge 1 / unavailable 0 | 51 s |
| surge 0 / unavailable 1 | 46 s |
| 100 % / 0 | 17 s |

6. Broken image stalls at 3 old Ready + 2 new unready; `rollout undo`.
7. Recreate means downtime; the mixed-version window means API/DB compatibility matters.
8. DeepDive „Ostale vrste radnih opterećenja”: DaemonSet, Job, CronJob, StatefulSet (L19).

**Flagship: „Kontrolna ploča rollouta”** (E3 rollout model)
- **Controls:**
  - image v1 / v2 / v3-bug (crashes) / v4 (never Ready);
  - replicas; maxSurge/maxUnavailable {0, 1, 2, 25 %, 50 %, 100 %} with an error message when both are 0;
  - strategy;
  - progressDeadlineSeconds (60 in the sim; real default 600);
  - Primijeni / Pauziraj / rollout undo / undo na reviziju N.
- Traffic dots are coloured by the version that served them.
- **Predvidi:** „N = 4, zadano, v3 se ruši — koliko starih Podova i dalje služi?” → 3 (75 % capacity).
- **Zadaci:** v2 with 0 failed requests; never fewer than 4 available; recover from v3 in < 30 s.
- **Pokvari!:**
  - „Pošalji loš image”
  - „Recreate usred ručka” (full outage)
  - „Obriši Deployment” (cascading delete)

**Code drawers:** `deployment.yaml` (apps/v1, labels and selector, strategy, a basic readiness probe, requests); `kubectl rollout status / history / undo`; `kubectl get rs` showing the old ReplicaSet at 0; a note that `kubectl set image` creates drift (pays off in L22).

**Misconceptions**
- „Deployment sam radi rollback”
- „Rolling update je uvijek bez prekida”
- „Deployment izravno upravlja Podovima”
- „Više replika = više računala”
- „minReadySeconds odgađa promet”

---

### L14 · Service i ulaz u klaster — stalna adresa za Podove koji se mijenjaju (55 min)

**Purpose.**
- A Service is a stable name plus a virtual IP plus a label selector over *Ready* Pods (EndpointSlices).
- DNS: `name.namespace.svc.cluster.local`.
- kube-proxy rules on every node: iptables by default, nftables available, ipvs deprecated since 1.35. A backend is chosen **at random, per connection**.
- Long-lived connections pin to one Pod.
- Service types: ClusterIP, NodePort (30000–32767), LoadBalancer (cloud or add-on), headless.
- External entry through the **Gateway API** (GatewayClass / Gateway / HTTPRoute). Ingress = the frozen legacy API; community ingress-nginx retired on 2026-03-24.

**Pain.** Klopa web hard-coded an api Pod IP; after the rollout it gets 502. And how does anyone on the internet reach klopa.hr?

**Scenes**
1. Pod IPs are temporary: a hard-coded IP breaks, while the Service keeps working.
2. Labels as hashtags, the selector as a saved search; a typo means 0 endpoints.
3. EndpointSlice contains only Ready Pods. A readiness failure *removes* the Pod without restarting it.
4. Packet path with header labels rewriting in place: CoreDNS → ClusterIP (virtual, owned by no Pod) → node rule DNAT to a random Pod → conntrack.
5. Classic LB (L04) vs Service: no weights, no knowledge of node size. Uneven capacity is handled by requests and scheduling (L17) and by HPA (L18).
6. Per-connection trap: a keep-alive / HTTP/2 / gRPC client sticks to one Pod. Fixes: an L7 proxy, or client-side balancing over a headless Service.
7. Reachability rings: ClusterIP → NodePort → LoadBalancer.
8. Gateway mini-builder:
   - host and path HTTPRoute rules; `/api` beats `/`; unmatched → 404;
   - roles view (infra / platform / app team);
   - „Prikaži kao Ingress”;
   - fact callout: ingress-nginx retired, F5's NGINX Ingress Controller is a different project; implementations include Envoy Gateway, NGINX Gateway Fabric, Traefik and Cilium.

**Flagship: „Laboratorij selektora”** (E3 + E1 Service mode)
- **Setup:** Pods with draggable label stickers; Service selector chips; live endpoint lines; a client Pod calling `klopa-api`.
- **Toggles:** keep-alive, connection count, per-Pod readiness, Service type, and „Klasični LB (L04) / Kubernetes Service”.
- **Predvidi:** „Jedna keep-alive konekcija, 100 zahtjeva, 3 Poda — raspodjela?” → all 100 to one Pod.
- **Zadaci:** route only to `version=v2`; fix the broken Service (`app=wbe`); spread a gRPC client's load.
- **Pokvari!:**
  - „Tipfeler u selektoru”
  - „Podu padne readiness”
  - „Klijent drži jednu konekciju”
  - „Hardkodiraj IP pa napravi rollout”

**Code drawers:** `service.yaml`; `kubectl get endpointslices -l kubernetes.io/service-name=klopa-api`; DNS anatomy; Gateway + HTTPRoute (`gateway.networking.k8s.io/v1`); `kubectl port-forward`; headless Service in a DeepDive.

**Misconceptions**
- „Service je proces/kutija”
- „Round robin po zahtjevu”
- „Service pokazuje na Deployment”
- „type: LoadBalancer radi svugdje”
- „Ingress je mrtav” / „koristi ingress-nginx”
- „Endpoints objekt” (deprecated since 1.33)

---

### L15 · ConfigMap i Secret — konfiguracija i tajne izvan imagea (45 min)

**Purpose.**
- Build once, configure per environment.
- ConfigMap vs Secret.
- Env vars vs volumes, and how each updates: env vars are stale until a restart; volumes update eventually; `subPath` mounts never update.
- The Secret reality:
  - base64 is encoding, not encryption;
  - Secrets are stored unencrypted in etcd by default;
  - `list`/`watch` reveal contents;
  - **anyone who can create Pods in a namespace can read its Secrets**.
- Encryption at rest (default provider `identity`; KMS v2 stable).
- Minimal least-privilege RBAC and ServiceAccounts.
- First half of the lecturer's „how do we manage secrets” (cluster mechanics). The second half (tooling and GitOps) is L23.

**Pain.** The Klopa api won't start: no DB password. One teammate puts it in the Dockerfile `ENV`; another almost commits `secret.yaml`.

**Scenes**
1. Same image digest + 3 ConfigMaps (dev / staging / prod) = three behaviours.
2. Missing Secret key → `CreateContainerConfigError`.
3. Update timeline: an env-var Pod vs a volume Pod vs a subPath Pod, side by side.
4. „Dekodiraj” button: `a2xvcGFfZGI=` → plaintext instantly.
5. Where it lives: etcd plaintext by default; encryption-at-rest providers; managed clusters differ (EKS encrypts by default).
6. Who can read it: `get`, `list`/`watch`, Pod creators.
7. Role + RoleBinding; ServiceAccount; least privilege. DeepDive: a Namespace is not a security boundary on its own (NetworkPolicy, Pod Security Admission).
8. Callback to L08: `ENV` in a Dockerfile is baked into layers, and env vars leak into logs and dumps.

**Flagship: „Tko vidi lozinku?”** (E5)
- **Actors:**
  - Ana: `get secrets` in klopa-dev;
  - an intern with `list`;
  - the CI bot, which may create Deployments;
  - the monitoring ServiceAccount;
  - an etcd-backup thief;
  - someone with node root;
  - a Git reader.
- **Toggles:** where the password lives (Dockerfile ENV / ConfigMap / Secret / Secret + encryption at rest); an RBAC chip builder; env vs volume.
- Each actor's eye turns red (can read) or grey (cannot).
- **Predvidi:** „CI bot nema get secrets, ali smije stvarati Deploymente — vidi li lozinku?” → yes.
- **Zadaci:** grey out the etcd-backup eye; give the CI bot deploy rights in dev only; rotate the password with no restart (volume + app re-reads it).
- **Pokvari!:**
  - „Ukradi etcd backup”
  - „Commitaj secret.yaml”
  - „Rotiraj lozinku” (the env-var Pod stays stale)
  - „Ispiši env u log”

**Code drawers:** ConfigMap; Secret with `stringData` and a „NE COMMITATI” banner; `secretKeyRef` vs volume mount; `base64 -d`; EncryptionConfiguration (DeepDive); a minimal Role and RoleBinding.

**Misconceptions**
- „Secreti su šifrirani”
- „Samo admini čitaju Secrete”
- „Secret smijem commitati”
- „Promjena Secreta odmah mijenja aplikaciju”
- „ConfigMap ili Secret, svejedno”

---

## MODUL 4 — Kubernetes u pogonu (amber)

### L16 · Probe i samoizlječenje — kako Kubernetes zna da je aplikacija zdrava (40 min)

**Purpose.** Three probes for three questions:

| Probe | Question | On failure |
|---|---|---|
| startup | „Jesam li se pokrenuo?” | the other probes wait until it succeeds |
| readiness | „Mogu li primati promet?” | removed from the EndpointSlice, no restart |
| liveness | „Jesam li zaglavio?” | container restarted |

Also covered:
- mechanisms (httpGet 200–399, tcp, exec, grpc) and defaults (period 10 s, timeout 1 s, failureThreshold 3);
- **never check dependencies in liveness**;
- graceful shutdown: SIGTERM and endpoint removal happen concurrently; `preStop` sleep; 30 s grace period;
- PDBs cover voluntary disruptions only.

**Pain.** The Klopa api needs 40 s to warm its cache and liveness kills it every 30 s. Then a 20 s DB blip restarts every Pod.

**Scenes**
1. Three probe lanes with tick marks.
2. Readiness failure detaches the endpoint line; liveness failure bumps the restart counter.
3. Slow start + liveness = CrashLoop; a startupProbe fixes it.
4. Cascade: liveness checks the DB → DB down → all Pods restart → the outage gets worse. Readiness on a shared dependency is discussed in a DeepDive (all endpoints disappear at once).
5. Shutdown race: endpoint removal propagates while SIGTERM arrives; `preStop` sleep; an app that ignores SIGTERM is SIGKILLed after 30 s.
6. The full self-healing ladder.
7. PDB with `kubectl drain`: respected for drains, ignored for node crashes.

**Flagship: „Tri pitanja zdravlja”** (E3 + E1 traffic). Four api replicas behind a Service with live traffic.
- **Per probe:** on/off, endpoint (`/healthz` vs `/ready` which checks the DB), initialDelay, period, failureThreshold.
- **App traits:** 40 s startup, occasional deadlock, DB dependency.
- **Predvidi:** „Liveness provjerava bazu; baza nedostupna 20 s. Koliko restarta?” → all 4.
- **Zadaci:**
  1. A rolling update with 0 failed requests (readiness + preStop).
  2. A DB blip with no restart avalanche.
  3. A deadlocked Pod recovers by itself.
- **Pokvari!:**
  - „Spori start”
  - „Zaglavi Pod”
  - „Baza pala 20 s”
  - „Aplikacija ignorira SIGTERM”
  - „kubectl drain” with and without a PDB

**Code drawers:** the three probes in YAML; `preStop` with the `sleep` action; `terminationGracePeriodSeconds`; `/healthz` and `/ready` handlers; a PDB.

**Misconceptions**
- „Liveness treba provjeriti bazu”
- „Readiness fail restarta Pod”
- „Bez probe K8s zna kad je app spreman”
- „Rolling update je automatski bez prekida”
- „PDB štiti od pada čvora”

---

### L17 · Resursi i raspoređivanje — requests, limits i Tetris čvorova (45 min)

**Purpose.**
- requests (what the scheduler reserves; also the HPA baseline) vs limits (what the kernel enforces); allocatable.
- filter → score → bind.
- Pending with a reason; fragmentation.
- CPU over the limit is **throttled**; memory over the limit is **OOMKilled** (exit 137) and then backs off.
- QoS classes; node-pressure eviction order.
- In-place resize (GA 1.35).
- Pays off the 2 GB / 4 GB story: Kubernetes handles uneven machines at *placement* time, not with Service weights.

**Pain.** The Klopa worker is OOMKilled at 12:01, and Postgres is stuck Pending with „0/3 nodes are available”.

**Scenes**
1. Restaurant reservation analogy: the scheduler seats by reservation (request), not by appetite. A limit is a house rule with two different consequences.
2. Node allocatable bars (example numbers labelled as a GKE example).
3. Filter ✗ with reasons → score → bind.
4. Pending message format; fragmentation (enough free CPU in total, but on no single node).
5. CPU throttling close-up: 100 ms periods with a quota.
6. OOMKilled → restart → backoff.
7. QoS badges and eviction ranking under memory pressure.
8. DeepDive: in-place resize without a restart.

**Flagship: „Tetris raspoređivača”** (E3 scheduler)
- **Nodes:** node-1 2 vCPU/4 GiB; node-2 4/16; node-3 2/8, each showing allocatable.
- **Cards:** web, api-guaranteed, cpu-burner, batch, leaky, besteffort, big-db, fragment.
- Manual drag mode, then „Pokreni scheduler”. Node bars have three layers: requested / actual use / Σ limits.
- **Predvidi:**
  - „leaky: limit 256Mi, raste 5 Mi/s?” → OOMKilled at ~31 s.
  - „cpu-burner treba 1000m, limit 500m?” → throttled 50 %, never killed.
- **Zadaci:** place everything except big-db and explain why; un-Pend fragment without adding a node; make api Guaranteed.
- **Pokvari!:**
  - „Curenje memorije”
  - „CPU petlja”
  - „Pritisak memorije na čvoru”
  - „Ukloni requests” (BestEffort gets packed in, then evicted first)

**Code drawers:** a `resources` block; the Pending event; `kubectl get pod` with OOMKilled / 137; `kubectl top pod`; the QoS class in status; resize in a DeepDive.

**Misconceptions**
- „Scheduler gleda stvarnu potrošnju”
- „Limits se rezerviraju”
- „CPU preko limita ubija kontejner”
- „Memorija preko limita samo uspori”
- „Za promjenu resursa treba novi Pod”
- „CPU limit uvijek postavi” (presented as a trade-off, not a rule)

---

### L18 · Automatsko skaliranje — preživi ručak bez dežurstva (45 min)

**Purpose.**
- HPA:
  - `desired = ceil(cur × util/target)`, with utilisation **relative to requests**;
  - 15 s sync; 10 % tolerance (per-HPA field GA in 1.37); scale-up policies;
  - 300 s scale-down stabilisation; the highest proposal across metrics wins.
- Cluster Autoscaler adds nodes when Pods are **Pending**, based on requests; Karpenter is the alternative.
- Pods scale in seconds, nodes in minutes.
- Scaling on queue depth (KEDA; HPA scale-to-zero beta in 1.37, object/external metrics only).
- VPA is a separate add-on.
- Teaser: `replicas` in Git vs HPA.

**Pain.** At 12:10 someone scales by hand, too late. At 14:00 nobody scales back down, and the bill grows.

**Scenes**
1. Scrubbable formula: 3 Pods at 90 % with target 50 → 6; at 54 % → no change (tolerance).
2. No request → HPA is blind; a limit caps observable utilisation.
3. Lead-time stacked bar: HPA reaction + node provisioning + image pull + app start + readiness.
4. CA reacts to Pending, not to CPU; scale-down after 10 min below 50 % of requests.
5. Scale-down window prevents flapping.
6. Worker scaled on queue depth, down to zero at night (callback to L06).
7. Vertical vs horizontal scaling; never VPA + HPA on the same CPU metric.

**Flagship: „Preživi ručak”** (E3 HPA + CA)
- **Model:**
  - request 500m, 25 ms CPU per request, target 50 % → 10 rps per Pod; min 2, max 20;
  - nodes 2 vCPU / 8 GiB (3 Pods each), node group 2–6;
  - presets: steady / spike 20→100 / daily sine / flash crowd 20→200; speed up to 30×.
- **Metrics:** p95 (labelled as an M/M/1 approximation), dropped %, Ready, Pending, nodes, €/h.
- **Predvidi** (validated): „Spike u t = 60 s — kad su svi Podovi Ready?” → ~t = 180 s (node ready at ~155).
  - „Zašto HPA stane na 9, ne 10?” → tolerance dead band.
  - „Zašto scale-down tek u t ≈ 720?” → 300 s window.
- **Zadaci:** p95 < 300 ms during the spike at the lowest €; worker at 0 replicas overnight.
- **Pokvari!:**
  - „Ukloni CPU request”
  - „maxReplicas = 4”
  - „Flash crowd uz max 6 čvorova”
  - „Hladan image cache”

**Code drawers:** HPA `autoscaling/v2` with explicit `behavior`; `kubectl get hpa -w`; KEDA ScaledObject for a RabbitMQ queue (DeepDive; verify the API version when authoring); Cluster Autoscaler defaults as a fact callout.

**Misconceptions**
- „HPA dodaje čvorove”
- „CA reagira na visok CPU”
- „HPA mjeri apsolutne jezgre”
- „HPA ne može na nulu”
- „Skaliranje je trenutačno”
- „VPA updateMode: Auto” (deprecated)

---

### L19 · Podaci koji preživljavaju — volumeni, PVC i StatefulSet (35 min, short)

**Purpose.**
- Storage has its own lifecycle: container filesystem vs `emptyDir` vs PVC → PV → StorageClass (dynamic provisioning).
- Access modes: RWO = one *node*; RWOP = one Pod.
- RWO detach/attach delay when a node fails.
- **`replicas: 3` for Postgres gives three independent databases.**
- StatefulSet: ordered start, stable names, a PVC per Pod, headless DNS, PVCs kept when scaling down.
- Honest note: databases often run as managed services or through operators.

**Pain.** Postgres runs in a Deployment. It gets rescheduled and the orders are gone. Then someone sets `replicas: 3` and orders randomly „disappear”.

**Scenes**
1. What survives what: three storage options × three events.
2. Claim ticket → PV → StorageClass „factory”.
3. Access modes.
4. Node failure: the disk detaches and reattaches (can take minutes).
5. Three databases behind a random Service (callback to L05 replication).
6. StatefulSet: `db-0/1/2`; delete `db-1` and it returns with the same name and PVC.
7. DeepDive: an operator is a controller that knows how to replicate a database (CRDs explained in one paragraph, also needed for Argo CD's Application).

**Flagship: „Preživljavaju li podaci?”**
- **Part 1:** three Postgres Pods side by side (container filesystem / emptyDir / PVC) with row counters.
- **Part 2:** small multiples StatefulSet vs Deployment for scale 0→3, delete `db-1`, and 3→1→3.
- **Predvidi:** „Obrišeš Pod s emptyDir — podaci?”
- **Zadaci:** survive a node failure without losing orders; explain the „disappearing” orders with `replicas: 3`.
- **Pokvari!:**
  - „Čvor pao”
  - „replicas: 3 za Postgres”
  - „Obriši PVC” (dynamically provisioned volumes default to reclaim policy Delete)

**Code drawers:** PVC; StatefulSet with `volumeClaimTemplates` + headless Service; `kubectl get pvc`; `db-0.db.klopa.svc.cluster.local`.

**Misconceptions**
- „Datotečni sustav kontejnera je trajan”
- „Svaki volumen je trajan”
- „replicas: 3 = klaster baze”
- „RWO = jedan Pod”

---

## MODUL 5 — Isporuka softvera (rose)

### L20 · Što je deploy — strategije isporuke i rollback (45 min)

**Purpose.** The lecturer's „what is deployment”, in full:
- deploy (running in an environment) vs release (users can see it) vs Deployment (object);
- environments and promotion;
- Recreate and Rolling (built in) vs Blue-green and Canary (need tooling: Argo Rollouts, Gateway weights, or a Service selector flip);
- the trade-off between blast radius, cost, speed and complexity;
- rollback limits (irreversible DB migrations; expand/contract);
- feature flags;
- canary by replica ratio vs by routing weight.

**Pain.** v2 „vegetarijanski meni” miscalculates VAT on 20 % of orders, and the rolling update spreads it to everyone before anyone notices.

**Scenes**
1. deploy / release / Deployment cards.
2. Environments; „staging prošao ≠ produkcija radi”.
3. Four strategies (small multiples).
4. Blue-green by flipping the Service selector (L14).
5. Canary: 1 of 10 Pods ≈ 10 % per connection, vs HTTPRoute weights (precise).
6. Canary analysis chart with an abort threshold (Argo Rollouts concept; mention its Gateway API plugin).
7. Expand/contract: renaming a column in one step breaks v1 Pods in the middle of a rollout.
8. Feature flags: deploy „dark”, release to 1 % → staff → everyone.

**Flagship: „Četiri strategije, isti bug”** (E1 + E3). Four lanes on the same seed: Recreate / Rolling / Blue-green / Canary.
- **Metrics per lane:** downtime, users hit by the bug, extra €, time to roll back, mixed-version window.
- **Controls:** bug rate (scrubbable 20 %), hidden-bug mode, canary steps 5→25→50→100, abort threshold, per-lane rollback.
- **Predvidi:** „Koja strategija pogodi najmanje korisnika, a koja je najskuplja?”
- **Zadaci:** ship v2 with < 50 users affected; a schema change that does not break v1 (expand/contract stepper); a 1 % release via flag without redeploying.
- **Pokvari!:**
  - „v2 ima bug”
  - „Preimenuj stupac u jednom koraku”
  - „Rollback nakon nepovratne migracije”

**Code drawers:** RollingUpdate vs Recreate; Service selector `version: blue → green`; HTTPRoute `backendRefs` with `weight: 95/5`; Argo Rollouts canary steps (DeepDive); a feature-flag check.

**Misconceptions**
- „Deploy = release”
- „Blue-green/canary su ugrađeni u Deployment”
- „Rollback je uvijek siguran”
- „Canary s replikama je precizan postotak”

---

### L21 · CI/CD — od commita do provjerenog imagea (45 min)

**Purpose.**
- CI is a *practice*: small merges at least daily, each checked by an automated build with tests.
- Pipeline stages; fail fast.
- **Build once, promote the same digest.**
- Tag with the Git SHA and/or semver; digests are immutable; never `:latest`.
- Continuous Delivery (there is a button) vs Continuous Deployment (no button).
- Pipeline as code: GitHub Actions jobs run in parallel by default; GitLab runs stages in order.
- OIDC short-lived credentials instead of stored keys.
- Push-deploy with cluster credentials → teaser for GitOps.
- DORA metrics.

**Pain.** The team merges once a week and drowns in conflicts. The production image was built on someone's laptop. „Koja je verzija u produkciji?”

**Scenes**
1. Integration hell vs small daily merges (animated branch collisions).
2. Assembly line; fail fast.
3. One digest travels dev → staging → prod; „Rebuild za prod” = a different artefact.
4. Tag vs digest; the `:latest` pull-policy trap (`Always`).
5. Gate slider: CI only / Continuous Delivery / Continuous Deployment.
6. Credentials: a long-lived key in CI vs OIDC; CI running `kubectl apply` with cluster-admin.
7. DORA panel: deployment frequency, lead time, change failure rate, recovery time.

**Flagship: „Tvornica commitova”** (E4)
- **Stations:** lint → tests → build (cache from L08) → scan → push (digest stamped) → update config repo / staging → e2e → [gate] → prod.
- **Controls:** parallelise jobs, dependency cache, commit types (Ispravan / Pada test / Ranjiva bazna slika / Flaky test), „Preskoči testove”, gate position.
- **Predvidi:** „Paralelizacija + cache — koliko kraći lead time?”
- **Zadaci:** lead time < 10 min; 0 bad commits reach prod out of 20; configure Delivery vs Deployment and explain the difference.
- **Pokvari!:**
  - „Preskoči testove”
  - „Flaky test”
  - „Ranjiva bazna slika”
  - „Rebuild za prod”
  - „Procurio CI ključ” (fixed by OIDC)

**Code drawers:** `.github/workflows/ci.yaml` (test job; build-push job tagging with `${{ github.sha }}`; `permissions: id-token: write`); GitLab CI in a second tab; `docker buildx build --push`; a digest pin. Verify action major versions when authoring.

**Misconceptions**
- „CI/CD je alat”
- „CD = uvijek automatski u produkciju”
- „Testovi su opcionalni”
- „Pipeline radi kubectl apply u produkciju”
- „:latest je OK”

---

### L22 · GitOps i Argo CD — Git kao izvor istine (55 min)

**Purpose.**
- The four OpenGitOps principles: declarative, versioned and immutable, pulled automatically, continuously reconciled.
- Argo CD is **the same reconciliation loop, one level up** (Git → cluster).
- Application CRD; target vs live state.
- **Sync status and Health are separate dimensions.**
- Git is polled every 120 s + up to 60 s of jitter, unless a webhook is set up.
- Automated sync, `prune` and `selfHeal`: prune and selfHeal are **off by default**.
- Drift; rollback = `git revert`.
- CI commits the new tag and Argo pulls it, so CI holds no cluster credentials.
- Argo runs `helm template` and owns the lifecycle, so `helm list` is empty.
- Sync waves; AppProject.
- HPA vs `replicas` in Git (`ignoreDifferences`).
- Flux is alive (CNCF graduated).
- Helm/Kustomize appear only as „how the config repo is rendered”.

**Pain.** At 12:00 someone ran `kubectl scale --replicas=10` and `kubectl edit` changed an env var. Nobody knows the real state, and CI holds the production admin token.

**Scenes**
1. Push vs pull: where credentials live and which way the firewall arrows point.
2. OpenGitOps principle cards.
3. Matryoshka of loops: thermostat → controller → Argo CD (the same ghost grammar).
4. Two badges: Synced/OutOfSync × Healthy/Progressing/Degraded/Missing/Suspended/Unknown.
5. Poll countdown ring vs webhook.
6. Drift + selfHeal; prune for deleted files.
7. Rollback = `git revert`, visible as an audit trail.
8. HPA tug-of-war and the fix; sync wave −1 for a migration Job.

**Flagship: „Git je istina”** (E6)
- **Layout:** a config repo with a commit graph on the left; an Argo-style resource tree on the right; a poll ring.
- **Controls:** commit (replicas or tag), webhook, auto-sync / selfHeal / prune.
- **Predvidi:** „Auto-sync uključen, selfHeal isključen; netko ručno skalira na 10?” → it stays at 10 and shows OutOfSync.
- **Zadaci:**
  1. Ship v2 by commit only (≤ ~3 min, or instantly with a webhook).
  2. Make manual drift revert itself.
  3. Undo a bad commit with `git revert`.
  4. Stop Argo fighting the HPA.
- **Pokvari!:**
  - „Ručni kubectl scale”
  - „Netko obriše Deployment”
  - „Obriši datoteku iz Gita”
  - „Loš commit (v3)”
  - „replicas u Gitu + HPA”

**Code drawers:**
- an Application (`argoproj.io/v1alpha1`) with `syncPolicy.automated` `prune`/`selfHeal`;
- config repo tree (base + overlays, or Helm values);
- a CI step that bumps the tag with a commit;
- `ignoreDifferences` for `/spec/replicas`;
- sync-wave annotation;
- `argocd app get` output;
- install with server-side apply as a fact callout (Argo CD 3.5.x).

**Misconceptions**
- „Argo CD gradi kod”
- „Reagira trenutačno”
- „GitOps = YAML u Gitu”
- „Ručna promjena ostaje” / „Auto-sync uvijek vraća”
- „Auto-sync briše uklonjeno”
- „Argo radi helm install”
- „Flux je umro”

---

### L23 · Upravljanje tajnama — od trezora do Poda (45 min)

**Purpose.** Second half of „how secrets are managed”. GitOps puts everything in Git except secrets. The patterns:
- **Encrypted in Git**
  - Sealed Secrets: public key; the in-cluster controller decrypts; keys renewed every 30 days; scopes.
  - SOPS: values encrypted, keys visible. Flux decrypts it natively; Argo CD needs plugins, which Argo discourages.
- **External store + sync:** External Secrets Operator with Vault, OpenBao or a cloud secret manager, using `refreshInterval`.
- **Direct mount:** Secrets Store CSI Driver, mounted as tmpfs.

Argo CD's official position: secret management in the destination cluster, not manifest-generation plugins, because rendered manifests sit in plaintext in its Redis cache. Also covered:
- rotation;
- „a leaked commit means rotating the secret”;
- OIDC in CI;
- an ecosystem-health case study: ESO paused in August 2025 and resumed (bus factor); Vault is BSL and owned by IBM; OpenBao is the MPL fork.

**Pain.** The DB password and the SMS-gateway key are needed in a GitOps repo. Someone has already committed a base64 Secret, which now lives in history forever. Rotating it means restarting everything.

**Scenes**
1. The dilemma, and „brisanje commita ne briše curenje” (rotate the secret).
2. Sealed Secrets asymmetric-key animation.
3. SOPS diff view.
4. ESO pipeline with a refresh ring.
5. CSI driver: no Secret object (optional sync).
6. Why not argocd-vault-plugin.
7. Rotation timeline (callback to L15); dynamic short-lived credentials in a DeepDive.
8. Decision tree and an ecosystem fact callout.

**Flagship: „Put tajne”** (E5 extended to the whole pipeline + E6)
- **Stages:** laptop → Git → CI → registry → Argo CD → API/etcd → node → Pod.
- **Approaches:** plain Secret in Git / Sealed / SOPS / ESO + Vault/OpenBao / CSI / argocd-vault-plugin.
- **Attackers:** Git-history reader, image puller, CI-log reader, Argo cache access, etcd-backup thief, namespace Pod creator, compromised Pod.
- **Toggles:** encryption at rest, least-privilege RBAC.
- **Predvidi:** „Sealed Secrets + napadač koji smije stvarati Podove u namespaceu?” → he can read it, because once decrypted it is an ordinary Secret.
- **Zadaci:** all Git readers grey; rotate the DB password in < 2 min without restarts; recover correctly from a leaked commit.
- **Pokvari!:**
  - „Commitaj običan Secret”
  - „Izgubi ključ Sealed Secrets kontrolera” (no decryption after disaster recovery → back up the key)
  - „Vault nedostupan” (ESO-synced Secrets keep working; new CSI Pods fail to mount)
  - „Token u CI logu”

**Code drawers:** `kubeseal` + SealedSecret; a SOPS-encrypted YAML snippet; SecretStore + ExternalSecret (verify the current ESO API version); SecretProviderClass; a GitHub Actions OIDC snippet.

**Misconceptions**
- „Base64 Secret u privatnom repou je OK”
- „Obrisao sam commit, riješeno”
- „Sealed Secret je siguran i u klasteru”
- „Koristi argocd-vault-plugin”
- „Vault je MPL open source”
- „ESO je napušten”

---

### L24 · Završni projekt — dan izdanja Klope (60 min)

**Purpose.** Integrate everything through two journeys and a seeded chaos run where students diagnose and fix, then point to what to learn next: Helm/Kustomize in depth, observability, NetworkPolicy, service mesh, KCNA.

**Pain.** „11:55, izdanje v2.0 prije ručka.”

**Scenes**
1. **Put commita:** push → CI → digest → bot commit → Argo OutOfSync → sync → new ReplicaSet → scheduler → kubelet pulls only the changed layers → probes → EndpointSlice → traffic. Each station chip opens a mini version of that lecture's sim.
2. **Put zahtjeva:** DNS → cloud LB → Gateway (TLS, HTTPRoute) → Service → node rule → Pod (config from ConfigMap/Secret) → Postgres (StatefulSet) → queue → worker, with a trace waterfall building along the way.
3. „Powers of ten” zoom: region → cluster → node → Pod → container → Linux process (L07 PID view).
4. „Što ako ovdje pukne?” at every station → which mechanism protects it.
5. Symptom ↔ cause drag-match: CrashLoopBackOff, Pending, 0 endpoints, OutOfSync, OOMKilled, ImagePullBackOff, CreateContainerConfigError, 502 vs 504.
6. Course map lit up; „što dalje”.

**Flagship: „Incident u 12:00”** (all engines). A seeded chaos run. Possible faults:
- selector typo
- liveness checking the DB
- memory limit too low
- bad tag
- manual drift
- missing Secret key
- maxReplicas too low
- poison message

The student has events, kubectl-style output, RED metrics and Argo status. Fixes are allowed **only through Git commits**. Every incident starts with a hypothesis prompt. Score = users affected + MTTR. **Pokvari!:** „Kaos majmun” (random).

**Code drawers:** the full Klopa config repo as an expandable tree (Deployments, Services, Gateway/HTTPRoute, HPA, ExternalSecret, StatefulSet, Application, CI workflow); a kubectl diagnosis cheat sheet.

**Misconceptions:** a final „Mit ili istina?” with the ten most important myths of the course.

---

## Ordering, cuts and open decisions

**Why 24 lectures, ~17 h including sims**
- Simulation-first means one flagship and one break-it per lecture. Every merge I tried would have put two flagships in one lecture, or pushed it past 60 minutes.
- The lecturer asked for „a separate lecture for every single component”.
- The six shared engines keep the build cost far below 24 separate sims.

**Ordering arguments**
- **Why before how (Module 1 first).** Without the pain of one server, Kubernetes looks like bureaucracy. L01 is pre-training (ports, DNS, refused vs timeout) that pays off in L09, L12 and L14.
- **LB split into L04 and L05.** It is the lecturer's richest sim. Algorithms (heterogeneous capacity) and failure plus state (stateless as a design goal) are separate ideas, and both need their own break-it.
- **Queues (L06) right after the LB.** This gives the push (LB) vs pull (competing consumers) contrast. It also seeds L18's queue-depth scaling and L24's worker.
- **VM → Docker → Compose.** VMs give the baseline for the contrast. Compose teaches declarative YAML and name-based DNS on one host, and its „Ugasi host” break-it is the exact motivation for L10.
- **Reconciliation (L10) before any object.** Every later object is „another loop”. L11's architecture is introduced just in time, when students ask „who does this?”.
- **Pod → Deployment → Service.** A bare Pod's death motivates Deployment. Rollouts motivate stable Service addresses.
- **Gateway lives inside L14.** It is the 2026-correct way in, and it feeds L20's weighted canary.
- **ConfigMap/Secret (L15) right after the app is reachable.** Klopa needs the DB password to run. This also comes before GitOps, which needs it.
- **Probes (L16) before resources (L17) before HPA (L18).** Readiness already appeared in L13 and L14 and is deepened next. Requests must come right before HPA, because HPA utilisation is a ratio to requests and the Cluster Autoscaler reacts to Pending.
- **Storage (L19) last in its module and short.** It is needed for a correct mental model („replicas: 3 ≠ replicated DB”), but it is not on the lecturer's list.
- **Delivery order (L20 → L21 → L22 → L23).** Define deploy, then automate it with CI, then GitOps (only the CD half). Secret *tooling* comes after Argo CD, because the GitOps secret dilemma only bites once everything lives in Git.

**Cut, or reduced to a „Za znatiželjne” box**
- Raft/Paxos and clocks.
- Formal CAP: one sentence in L05.
- Cluster installation, kubeadm, certificates; CNI/CSI/iptables internals; Docker Swarm; Windows containers.
- Multi-cluster and ApplicationSets: one line in L22.
- Service mesh: one line in L14.
- No dedicated Helm/Kustomize lecture: it is tooling, not a concept. It appears as how the config repo is rendered in L22, plus a DeepDive.
- No dedicated RBAC/Namespaces lecture: it lives in L15's access explorer. NetworkPolicy and Pod Security Admission are DeepDives.
- No dedicated observability lecture: every sim teaches RED/percentile reading and L24 uses events, metrics and traces. An optional bonus lecture „Lov na uzrok” can be added for students heading to KCNA.

**Conflicts for the orchestrator to resolve**
1. The terminology research recommends „vi” and „slika kontejnera”. The project's AUTHORING.md mandates „ti” and „image”. This outline follows AUTHORING.md.
2. One research file uses „Kifla” as the running example. This outline uses Klopa, matching AUTHORING.md and `story-map.ts`.
3. Version-sensitive items to re-verify when the code is written:
   - the Node base-image tag in L08;
   - GitHub Actions major versions in L21;
   - the KEDA API version in L18;
   - the ESO API version in L23.

**Related project files**
- `/Users/blaz/Documents/GitHub/kubernetes-lekcije/docs/AUTHORING.md`
- `/Users/blaz/Documents/GitHub/kubernetes-lekcije/src/curriculum/data.ts` (currently a placeholder with module m1 only)
- `/Users/blaz/Documents/GitHub/kubernetes-lekcije/src/kit/story/story-map.ts` (Klopa map placeholder; per-lecture additions are listed above)
- `/Users/blaz/Documents/GitHub/kubernetes-lekcije/docs/research/proto/` (validated `lb-sim.ts`, `queue-sim.ts`, `hpa-sim.ts`, `rollout-sim.ts` backing engines E1–E3)