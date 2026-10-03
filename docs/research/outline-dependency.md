# Kurikulum „Kubernetes od nule”: plan po ovisnostima pojmova

**Lens used:** every concept has exactly one home lecture, and nothing is used before it is introduced. The course also covers the full KCNA blueprint.

I checked the current KCNA blueprint today at training.linuxfoundation.org/kcna-program-changes. It applies to exams from 24 Nov 2025:

| Domain | Weight | Topics |
|---|---|---|
| Kubernetes Fundamentals | 44 % | Core Concepts, Administration, Scheduling, Containerization |
| Container Orchestration | 28 % | Networking, Security, Troubleshooting, Storage |
| Cloud Native Application Delivery | 16 % | Application Delivery, Debugging |
| Cloud Native Architecture | 12 % | Observability, Ecosystem & Principles, Community & Collaboration |

Project files this plan depends on:
- `/Users/blaz/Documents/GitHub/kubernetes-lekcije/docs/AUTHORING.md`: authoring rules, running example „Klopa”, "ti" form of address.
- `/Users/blaz/Documents/GitHub/kubernetes-lekcije/docs/research/sim-models.md` and `/Users/blaz/Documents/GitHub/kubernetes-lekcije/docs/research/proto/*.ts`: the validated simulation models cited below.

---

## 0. Global rules that make the ordering hold

1. **Uvodi / Treba.**
   - Each lecture lists the concepts it introduces (**Uvodi**) and the earlier lectures it relies on (**Treba**).
   - The concept ledger in §3 proves that each concept has a single home.
2. **Two deliberate "named early, taught fully later" cases.** Both are flagged in the lectures.
   - *Pod* gets a one-sentence definition in L09, because the architecture walkthrough needs a noun. Full treatment is in L10.
   - The *replica controller* is introduced generically in L08–L09. It gets its API name, ReplicaSet, in L12.
3. **One server model, reused four times.** The CPU-lanes plus RAM-worker-slots model is learned once (L01) and then reused:
   - L03: the load-balancer sim
   - L11: nodes with allocatable resources
   - L13: the same sim in "kube-proxy mode"
   - L19: the HPA sim
4. **One loop visual for the whole course.** A dashed ghost is the desired state and a solid shape is the actual state.
   - Introduced in L08.
   - Reused for ReplicaSet (L12), EndpointSlice (L13), rollout (L14), operators/CRDs (L16), HPA (L19) and Argo CD (L23).
5. **`kubectl` verbs arrive when first needed.**
   - get / describe / events (L09)
   - logs / exec / port-forward (L10)
   - describe node (L11)
   - scale (L12)
   - get endpointslices (L13)
   - rollout (L14)
   - auth can-i (L15)
   - kustomize / helm (L21)
   - debug (L20)
   - L20 then turns them into a troubleshooting method.
6. **Add-ons are pre-installed in the lab cluster until L21.** This covers ESO, the Gateway controller, metrics-server, KEDA and Prometheus.
   - L21 introduces Helm and then shows how they were installed.
   - This avoids `helm install` appearing in code before Helm is taught.
   - Gateway API CRDs are the one exception: they install with plain `kubectl apply --server-side`.
7. **Retrieval practice.** Every self-check has at least one question from a lecture listed in **Treba**.
8. **Fixed example names.**
   - Running example: Klopa.
   - Domain: `klopa.example`.
   - Registry: `registry.klopa.example/klopa-api:<semver>`.
   - Services: klopa-web, klopa-api, klopa-worker, klopa-db (Postgres), Redis (sessions/cache), RabbitMQ (orders), and an external SMS gateway.
   - A persistent **„Klopa karta”** (architecture map) grows by one component per lecture.
9. **Lab track.**
   - Module 2: Docker Engine, Docker Desktop (education licensing must be checked per institution) or Podman.
   - Modules 3–6: kind, minikube or k3d, or Killercoda in the browser.
   - The cluster is not needed before L09.

---

## 1. Modules

| Modul | Title | Lectures | Accent | Time |
|---|---|---|---|---|
| m1 | Zašto raspodijeljeni sustavi | L01–L04 | blue | ≈ 3,4 h |
| m2 | Kontejneri: pakiranje i pokretanje softvera | L05–L07 | violet | ≈ 2,4 h |
| m3 | Kubernetes: temelji | L08–L12 | teal | ≈ 3,9 h |
| m4 | Promet, promjene i sigurnost u klasteru | L13–L17 | amber | ≈ 4,3 h |
| m5 | Stanje, skaliranje i uvid u sustav | L18–L20 | rose | ≈ 2,5 h |
| m6 | Isporuka softvera | L21–L24 | green | ≈ 3,7 h |

In total: **24 lectures, about 20 h of self-paced study.**

---

## 2. Lectures

### Modul 1 — Zašto raspodijeljeni sustavi

#### L01 · Jedan server: put zahtjeva i granice kapaciteta
*slug `jedan-server` · 45 min · KCNA: groundwork (Architecture/principles)*

**Purpose.** Builds the minimum network and capacity vocabulary that everything later assumes:
- How a request finds a process: DNS → IP → port → HTTP.
- What a server process does with that request.
- Why CPU cores limit throughput while RAM limits how many requests can be in flight (worker pool).
- How throughput, p50/p95/p99 latency and error rate describe load.

It ends with the limits of vertical scaling and the single point of failure (SPOF). "Deploy" is introduced informally here as an activity: laptop → server.

**Pain.** „Klopa radi na `localhost:3000`. Postavili smo je na VPS s 2 GB RAM-a. U 12:00 stranica se uspori, a onda padne. Hoće li jači server pomoći?”

**Uvodi:**
- client/server, request/response
- DNS, IP, port, a process listening on a port
- `127.0.0.1` vs `0.0.0.0` (bind address)
- HTTP status codes (2xx/4xx/5xx; 503 for overload, timeout)
- RTT/latency
- deploy (as an activity)
- throughput, latency percentiles, error rate, utilisation
- CPU core vs RAM; worker pool; I/O wait
- queueing "hockey stick"
- vertical scaling; SPOF; downtime; OOM crash

**Treba:** —

**Scenes:**
1. **Put zahtjeva.** Stepper: browser → DNS resolver → IP → TCP to :443 → HTTP request → process → response. Packet header labels rewrite in place at each step.
2. **Tko sluša na kojoj adresi.** A process bound to `127.0.0.1` accepts local packets only; an external packet bounces off. Rebinding to `0.0.0.0` lets it in. This is planted for Docker in L07.
3. **Što server radi sa zahtjevom.** A server panel with vCPU lanes and RAM worker slots.
   - A request occupies a slot (RAM) and consumes CPU time.
   - While waiting on the database, it holds RAM without using CPU.
4. **Prosjek laže.** A latency histogram with a tail slider: the mean barely moves while p99 explodes.
5. **Hokejaška palica.** A utilisation slider against latency (W/S = 1/(1−ρ)). Students predict the shape first.
6. **Vertikalno skaliranje.**
   - A resize catalogue (2 → 4 → 8 → 16 GB) with a restart gap on each resize, ending in a „Nema većeg” ceiling.
   - With a CPU-bound load, more RAM changes nothing.
   - Labelled clearly: cloud prices are roughly linear within an instance family; the real limits are the ceiling, the restart and the SPOF.
7. **Isključi struju.** Availability drops to 0, with a downtime table for 99 / 99,9 / 99,99 %.

**Flagship: „Klopa na jednom serveru”.** A single-server instance of the SIM 1 engine (sim-models §SIM 1).
- Inputs:
  - λ slider
  - workload presets: API, I/O-heavy, CPU-heavy
  - vCPU {1, 2, 4, 8}, RAM {1, 2, 4, 8, 16} GB
  - worker memory 256 MB, base 512 MB, so W = ⌊(RAM−512)/256⌋
- Metrics: goodput, p50/p95/p99 (successful requests only), rejected (503), timeouts (hollow dot), CPU %, busy workers/W.
- Goals:
  - With the I/O preset, find the RAM size where errors stop. 2 GB tops out at ~5,7 rps with CPU at only ~15 %.
  - With the API preset, show that 2 / 4 / 8 GB on 2 vCPU all give ~10 rps.
- Break-it buttons: „Nalet u 12:00”, „Isključi struju”, „Neograničeni workeri” (an OOM crash loop).
- No 502 appears yet, because there is no proxy.

**Kod:**
- `curl -v https://klopa.example/` (annotated)
- `dig klopa.example A`
- `ss -ltnp` showing `127.0.0.1:3000` vs `0.0.0.0:3000`
- A minimal HTTP server with its listen address
- `ping` for RTT
- A worker-count setting (e.g. gunicorn `--workers`) with the rule "workers ≈ free RAM / process size"

**Zablude:**
- „Više RAM-a = brži server”.
- „Prosječna latencija je dovoljna”.
- „Latencija raste linearno s opterećenjem”.
- „Vertikalno skaliranje je zastarjelo”. It is often the right first step.

---

#### L02 · Zašto raspodijeljeni sustav — i što nas to košta
*slug `zasto-raspodijeljeni-sustavi` · 45 min · KCNA: Architecture (principles: scalability, resiliency)*

**Purpose.** Answers the lecturer's core question: why distribute at all. There are three reasons:
- capacity beyond the biggest machine
- availability beyond one machine
- distance to users

It then shows the cost immediately:
- a shared bottleneck
- partial failure
- an unreliable network
- state

It defines stateless vs stateful as the precondition for horizontal scaling. It separates replication (the same app N times) from decomposition (microservices). It closes on a cliffhanger: "two servers, but users know one address".

**Pain.** „Ispitni rok: ni 16 GB nije dovoljno, a svaka promjena veličine znači prekid. Kupimo drugi server — ali DNS pokazuje na jedan IP, košarica živi u memoriji servera, a baza je zajednička.”

**Uvodi:**
- horizontal scaling; raspodijeljeni sustav; replica; redundancy
- availability in series and in parallel; independence vs correlated failure; N+1
- speed-of-light RTT floor
- partial failure; timeout ("slow or dead?"); the fallacies of distributed computing
- stateless vs stateful; external state store (Redis/DB)
- shared bottleneck; Amdahl/USL (presented as models)
- read replicas and lag; cache-aside
- CAP (only during a partition, in a DeepDive)
- monolith vs microservices

**Treba:** L01 (capacity, latency, SPOF, RTT)

**Scenes:**
1. **Tri razloga.** One tall server morphs into many short ones. A side panel contrasts "the same app ×N" with "split into services".
2. **Brzina svjetlosti.** A map from Zagreb with minimum RTTs: Frankfurt ≥ 7,2 ms, Sydney ≥ 160 ms. A new HTTPS connection needs ≥ 3 RTT before the first byte.
3. **Matematika devetki.**
   - Scrubbable availabilities: two 99 % components in series give 98,01 %; in parallel they give 99,99 %.
   - An „isti ormar” toggle makes the failures correlated and the gain collapses.
   - N+1: two servers at 70 % each become 140 % on one.
4. **Usko grlo.** Add app servers until the DB bar saturates and p95 stops improving. A USL curve is shown and labelled as a model.
5. **Spor ili mrtav?** A timeout game: pick a timeout and see the false positives and false negatives. Flip cards show lost, delayed, duplicated, reordered and partitioned messages.
6. **Gdje živi košarica.**
   - With an in-memory cart, the next request lands on another server and the cart is empty.
   - With a Redis cart, any replica can serve any request.
7. **Podatci su teži dio.**
   - Replica lag breaks "read your own write".
   - A cache-aside slider: h = 0,9 gives about 3 ms average latency and 10 % of the load on the DB.
   - CAP appears only as a DeepDive.
8. **Cliffhanger.** The second server stays idle because DNS still points to server 1.

**Flagship: „Koliko devetki?”.** An architecture and availability builder.
- Students drag components into series or parallel: app servers, DB, cache, read replica.
- Each component gets an availability %, a failure-domain group (rack/zone) and capacity.
- A seeded "year" runs and shows downtime minutes next to the formula.
- A throughput panel shows the DB ceiling.
- Goals:
  - Reach 99,9 % within a budget.
  - Discover that the single DB dominates (the 99,88 % example).
  - Survive „kvar ormara” with N+1 capacity.
- Break-it buttons: „Kvar ormara”, „Loša konfiguracija na svim serverima” (a correlated failure).

**Kod:** formulas in a DeepDive; `mtr` to a far host; cache-aside in about 10 lines of TS; Redis session keys (`SET session:…`).

**Zablude:**
- „2× servera = 2× kapaciteta”.
- „Raspodijeljeno je automatski pouzdanije”.
- „Mreža je pouzdana i brza”.
- „Dva servera od 99 % uvijek daju 99,99 %”. This needs independence, failover and N+1 capacity.
- „Svaka aplikacija treba mikroservise i Kubernetes”. Answered with a "trebaš li ovo?" checklist.
- „CAP: uvijek biraš 2 od 3”.

---

#### L03 · Load balancer: tko dijeli promet
*slug `load-balancer` · 60 min · KCNA: Orchestration/Networking (groundwork), Architecture (resiliency)*

**Purpose.** Introduces the load balancer, which turns horizontal scaling into something users can reach:
- one stable address, a pool of backends
- algorithms
- active and passive health checks with a visible detection window
- draining
- L4 vs L7
- sticky sessions vs externalised state
- the load balancer as a SPOF

The flagship is the lecturer's requested sim. Students build heterogeneous servers (2 GB / 4 GB / 8 GB, 1–8 vCPU) and send traffic. The correctness core:
- CPU sets throughput and RAM sets concurrency.
- Round robin is blind to heterogeneity.
- Failure detection is never instant.

**Pain.** „Drugi server spava, prvi gori. Tko šalje korisnika br. 2 na server br. 2 — i što ako server br. 2 umre?”

**Uvodi:**
- load balancer; backend pool; reverse proxy; 502 / 503 / 504
- round robin; weighted RR; least connections; power-of-two-choices; least response time; random; IP / consistent hash
- active health check (interval, threshold, detection window); passive ejection
- connection draining; LB retry
- L4 vs L7; per-connection vs per-request; keep-alive; TLS termination
- sticky sessions
- HA pair / floating IP / managed LB

**Treba:** L01 (server model, percentiles), L02 (stateless, N+1, SPOF)

**Scenes:**
1. **Ručni način.** The student is the load balancer and clicks a server for each request. They are quickly overwhelmed. „Automatski” then hands over to an algorithm.
2. **Ljestve algoritama.** RR → WRR → least connections → P2C, each with a one-sentence rule. Small multiples run on the same seed.
3. **Health check nije trenutačan.**
   - A timeline with interval × threshold.
   - A *crashed* server gives instant 502s; a *hung* server gives 504s after the timeout.
   - Badge: `2 s (sim) · stvarno: 30 s (AWS ALB)`.
4. **Crna rupa.** Under least connections, a server that fails fast attracts traffic. Validated: 37 failed requests vs 11 with RR when S3 is killed at λ = 15.
5. **L4 vs L7.**
   - An envelope metaphor: L4 sees IP:port; L7 opens the envelope and sees host, path and cookie.
   - Under L4, a keep-alive connection stays pinned to one server.
6. **Košarica i ljepljive sesije.**
   - Sticky sessions work but skew load and lose the cart when the server crashes.
   - An external store fixes it (back-reference to L02).
7. **Tko balansira balanser?** An HA pair with a floating IP, DNS with multiple A records, a managed cloud LB.
8. **Drain vs ubij.** Graceful removal: no new requests, in-flight requests finish.

**Flagship: „Balanser u tvojim rukama”.** SIM 1 exactly as in sim-models.
- Server catalogue:
  - presets Mali 1 vCPU / 2 GB, Srednji 2 / 4, Veliki 4 / 8
  - a custom server with separate vCPU and RAM sliders
- Workload presets: API, I/O, CPU (exponential CPU time, fixed I/O, 256 MB per worker).
- Traffic and timing: λ 1–50; queue 10; timeout 5 s.
- Load balancing:
  - algorithms: RR, WRR (weights editable; suggested weight ∝ capacity → 1:2:4), LC, P2C, least-response-time, random, consistent hash
  - active health check (interval / threshold)
  - passive ejection
  - LB retry
  - sticky-session mode with 20 users and `local` / `external` session store
- Metrics:
  - goodput; error rate split 502 / 503 / 504; p50/p95/p99
  - per server: CPU %, busy/W, RAM, queue
  - 60 s charts
- Goals:
  - At λ = 15 the defaults give RR 2,7 % errors. Find an algorithm with 0 % (WRR 1:2:4).
  - Predict first: "2 vCPU/4 GB vs 2 vCPU/8 GB with the API preset — tko pobjeđuje?" (neither), then switch to the I/O preset.
  - Mixed pool, I/O preset: 4 vCPU/2 GB loses to 1 vCPU/8 GB.
  - Kill S3 at λ = 15 and keep errors under 2 %.
- Break-it buttons: Sruši, Zamrzni (hang), Drain, Curenje memorije, Neograničeni workeri.
- Validated table (seed 42, λ = 20): RR 10,6 % errors vs WRR 0 %.

**Kod:**
- NGINX `upstream` with `weight`, `least_conn`, `max_fails` / `fail_timeout`. Must note that active `health_check` is NGINX Plus only; open-source NGINX does passive checks.
- AWS ALB health-check defaults in a fact callout.
- Envoy `LEAST_REQUEST` (P2C) in a DeepDive.

**Zablude:**
- „LB ubrzava svaki zahtjev”.
- „Round robin je pošten”.
- „LB uklanja SPOF”.
- „LB odmah zna da je server mrtav”.
- „Sesije same rade iza LB-a”.
- „Balansira se uvijek po zahtjevu”.
- „Najmanje veza je uvijek najbolje”. It falls into the black-hole trap.

---

#### L04 · Redovi poruka i događaji
*slug `redovi-poruka` · 55 min · KCNA: Architecture (event-driven, resiliency)*

**Purpose.** The second way to distribute work: producers enqueue and consumers pull. This:
- absorbs bursts
- decouples in time
- isolates slow or flaky dependencies

It covers delivery semantics honestly: at-least-once plus idempotency gives "effectively once". It also covers:
- ack and visibility timeout
- retries with jitter
- dead-letter queue (DLQ)
- backpressure
- ordering limits
- queue vs log (Kafka), pub/sub
- scaling consumers on queue depth

It contrasts the load balancer's push model with the queue's pull model.

**Pain.** „U 12:00 stiže 445 narudžbi u 10 s; SMS-gateway je spor i nepouzdan; sinkroni pozivi gube narudžbe. A nakon pada workera jedna narudžba skuhana je dvaput (dvaput ćevapi).”

**Uvodi:**
- message queue; broker; producer/consumer; async + `202 Accepted`
- competing consumers
- ack; visibility timeout; redelivery
- at-most / at-least / "exactly" once; idempotency key
- retry with full jitter; delivery limit; DLQ; poison message
- backpressure / bounded queue / overflow policy
- Little's law (DeepDive)
- event; pub/sub fan-out
- log / stream; partition; consumer group; offset; lag; per-key ordering
- drain time and queue-depth-based consumer scaling (as a rule, not a tool)

**Treba:** L01 (λ, latency, utilisation), L02 (partial failure, duplicates), L03 (push balancing, retries)

**Scenes:**
1. **Sinkrono vs asinkrono.** The order request waits for payment + SMS + PDF, vs publishing `NarudzbaKreirana` and returning 202.
2. **Red kao amortizer.** Scrub λ vs μ. A burst is absorbed. If λ > μ persists, the queue grows without bound: a queue is not "faster".
3. **Rad se povlači, ne gura.** Competing consumers vs L03's push.
4. **Potvrda i ponovna isporuka.**
   - Ack before vs after processing.
   - „Sruši workera prije/poslije nuspojave”.
   - Visibility timeout → duplicate → idempotency key fixes it.
5. **Otrovna poruka.**
   - Retry with jitter → delivery limit → DLQ.
   - Fact callout: RabbitMQ quorum-queue default limit is 20, and without a dead-letter exchange the message is dropped.
6. **Redoslijed.** Two workers at different speeds reorder messages. Order holds only per key / partition.
7. **Red ili log.**
   - RabbitMQ / SQS: the message is deleted after ack.
   - Kafka: retention, offsets, replay, independent consumer groups.
   - Fact callout: Kafka 4.x is KRaft-only; share groups are production-ready since 4.2.
8. **Koliko potrošača?** Drain time = backlog / (kμ − λ). "Dodaj potrošače kad red raste" is stated as a rule. The tooling comes in L19.

**Flagship: „Kuhinjska tračnica”.** SIM 2 as in sim-models.
- Settings:
  - direct ("bez reda") vs queue mode
  - λ, with a burst of 15/s × 10 s
  - k consumers; service time exponential with mean 1 s
  - pFail, pPoison, maxDeliveries
  - backoff (full jitter); visibility timeout; ack mode; idempotency
  - bounded queue with reject-publish / drop-head
- Kafka sub-mode:
  - P partitions; hash(key) mod P; hot key
  - consumer groups A and B; lag; replay
  - extra consumers sit idle when C > P
- Validated numbers:
  - Direct mode loses 10,3 % (Erlang B predicts 9,5 %); queue mode loses 0.
  - In the burst, 4 consumers drain in ~50 s and 8 consumers in ~15 s.
  - A visibility timeout of 2 s causes 13 % duplicates; with idempotency, 0.
- Goals:
  - Survive the burst with 0 lost orders.
  - Get 0 duplicate side effects with a 2 s visibility timeout.
  - Drain the backlog in under 20 s with the fewest consumers.

**Kod:**
- An idempotent consumer: `INSERT … ON CONFLICT DO NOTHING` on the order ID.
- A RabbitMQ quorum queue declaration with `x-delivery-limit` and a dead-letter exchange.
- An SQS receive / delete loop.
- A Kafka keyed producer.

**Zablude:**
- „Red ubrzava obradu”.
- „Svaka poruka stiže točno jednom”.
- „Poruke se obrađuju redom”.
- „Red = pub/sub = event bus”.
- „Neuspjela poruka nestane ili se ponavlja zauvijek”.
- „Kafka treba ZooKeeper”.
- „Kafka ne zna raditi redove”.

---

### Modul 2 — Kontejneri: pakiranje i pokretanje softvera

#### L05 · Fizički server, virtualni stroj, kontejner
*slug `virtualizacija-i-kontejneri` · 45 min · KCNA: Fundamentals/Containerization*

**Purpose.** Why packaging and isolation exist: dependency conflicts, „radi na mom laptopu”, density.
- A VM is hypervisor + guest OS with its *own kernel*.
- A container is an isolated **process** on the shared host kernel:
  - namespaces limit what it *sees*
  - cgroups v2 limit what it *uses* (memory → OOM kill, CPU → throttling)
- OCI is the standard behind containers.
- VMs and containers coexist: cloud nodes are VMs, and Docker Desktop runs a Linux VM.

**Pain.** „Novi kolega: radi na mom laptopu (macOS, Node 24), ruši se na serveru (Ubuntu, stariji Node). Dvije aplikacije na istom serveru trebaju različite verzije iste biblioteke. I želimo 10 aplikacija na jednom serveru od 16 GB.”

**Uvodi:**
- dependency conflict
- hypervisor; host / guest; kernel; VM
- container = process; PID
- Linux namespaces (pid, net, mnt, uts, ipc, user, cgroup)
- cgroups v2 (`memory.max`, `cpu.max`); OOM kill; CPU throttling
- container root filesystem
- OCI (as the standards body)
- isolation strength; microVM / gVisor; user namespaces
- CPU architecture (amd64 / arm64)

**Treba:** L01 (process, CPU, RAM, OOM)

**Scenes:**
1. **Ovisnosti se sudaraju.** Two apps need two versions of the same library on one OS.
2. **Slagač stoga.** The layer stack morphs between VM and containers (`layoutId`). A density counter shows apps per 16 GB. Boot stages are shown as ranges, not fake precise numbers.
3. **Kontejner je samo proces.** The same process is PID 1 inside the container and PID 48213 on the host. The kernel version is the same.
4. **Imenski prostori kao naočale.** Seven lens toggles; each changes what the process can see.
5. **Kontrolne grupe.**
   - Scrub memory up to `memory.max` and the OOM burst fires.
   - `cpu.max 20000 100000` shows greyed periods: throttling, not death.
6. **Cijena izolacije.**
   - A kernel-exploit crack spreads to all containers but stops at the hypervisor.
   - microVMs and gVisor as a middle ground.
   - User namespaces in Pods are GA in Kubernetes 1.36 (fact callout).
7. **U stvarnosti: kontejneri u VM-ovima.** Cloud nodes are VMs. Docker Desktop's hidden Linux VM. amd64 vs arm64.

**Flagship: „Slagač stoga”.**
- A 16 GB host; „Dodaj aplikaciju”; VM ↔ Kontejneri toggle; RAM accounting.
- A start race (staged boot ranges); an exploit button.
- A final „kontejneri u VM-u” toggle.
- An embedded mini-sim: „Pogled iz kontejnera / s domaćina” process tree.
- Goals:
  - Fit 10 Klopa services on 16 GB.
  - Explain why one exploit hits all containers.

**Kod:** container primitives *without Docker*:
- `sudo unshare --pid --fork --mount-proc bash` then `ps`
- `systemd-run --scope -p MemoryMax=256M …`
- `cat /sys/fs/cgroup/…/memory.max`
- host `ps -ef` showing the isolated process

**Zablude:**
- „Kontejner je mali VM”.
- „Kontejneri izoliraju kao VM-ovi”.
- „Kontejneri su zamijenili VM-ove”.
- „Docker na Macu radi nativno”.
- „Svaki image radi svugdje” (architecture and kernel matter).

---

#### L06 · Docker image: dockerizacija aplikacije
*slug `docker-image` · 50 min · KCNA: Containerization; Application Delivery (artifacts)*

**Purpose.** Turn klopa-api source into an OCI image:
- Dockerfile → immutable layers → build cache → image → registry
- tags vs digests; immutable tags
- `.dockerignore`
- multi-stage builds
- non-root `USER`
- the secrets-in-layers trap
- multi-arch images

Anchor analogy: an image is a class (instances come in L07). Layers are git commits.

**Pain.** „Kontejneri postoje — ali kako `klopa-api` pretvoriti u nešto što radi jednako na mom laptopu, kolegičinom laptopu i serveru? I zašto svaki build traje 3 minute?”

**Uvodi:**
- image; Dockerfile (`FROM`, `WORKDIR`, `COPY`, `RUN`, `ENV`, `ARG`, `EXPOSE` as documentation only, `USER`, `CMD` / `ENTRYPOINT`)
- layer; union / overlay view; build context; `.dockerignore`
- build cache and invalidation; BuildKit (default)
- multi-stage builds; base-image choice (slim / distroless / hardened)
- registry; repository; tag; digest; immutable tags; push / pull; Docker Hub rate limits
- OCI image spec; multi-arch manifest list
- `docker init`

**Treba:** L05 (container, root filesystem, OCI)

**Scenes:**
1. **Recept → jelo, klasa → objekt.** Dockerfile → image. Includes a break-box on where the analogy fails.
2. **Slojevi kao git commitovi.** Transparent sheets stacked; you look through to the merged view.
3. **Laboratorij build cachea.** This is the flagship.
4. **Tajna u sloju.** `COPY .env` followed by `RUN rm .env`: the layer inspector still finds it.
5. **Višefazni build.** A builder stage vs a runtime stage; the size drops.
6. **Registar.** A push uploads only the missing layers („Layer already exists”).
7. **Tag je ljepljivi papirić, digest je otisak prsta.** `:latest` moves from `sha256:a1…` to `sha256:9f…`, and a machine that pulled earlier runs the old image.
8. **Jedna oznaka, dvije arhitekture.** The manifest list resolves to arm64 on a Mac and amd64 on the server.

**Flagship: „Laboratorij build cachea”.**
- Draggable instruction cards (Motion `Reorder`).
- Buttons: „Promijeni kod”, „Promijeni ovisnosti”, „Build”.
- Toggles: `.dockerignore`, multi-stage.
- A layer stack showing size, short digest and CACHED / REBUILT status, plus a stopwatch. Timings are labelled illustrative.
- Goals:
  - A rebuild after a code change under 5 s (dependencies before code).
  - A final image under the size target.
  - No secret in any layer.
  - A non-root `USER`.

**Kod:**
- A multi-stage Dockerfile for klopa-api with a pinned LTS base (e.g. `node:24-slim`, verified when the lecture is authored), `npm ci` and `USER node`.
- `.dockerignore`.
- `docker build -t registry.klopa.example/klopa-api:1.4.0 .`
- `docker image history`, `docker push`.
- `docker buildx build --platform linux/amd64,linux/arm64`.
- Reading the digest.
- Fact callouts: BuildKit has been the default since Engine 23; the containerd image store is the default in Engine 29; Docker Hub allows 100 unauthenticated pulls per 6 h.

**Zablude:**
- „Image = kontejner”.
- „`RUN rm` briše tajnu iz imagea”.
- „`ENV` / `ARG` su u redu za tajne”.
- „`:latest` je fiksna najnovija verzija”.
- „Treba `DOCKER_BUILDKIT=1`”.
- „`EXPOSE` čini port dostupnim”.
- „`bitnami/*` imageovi iz starih tutorijala”.

---

#### L07 · Kontejneri u radu i Docker Compose
*slug `docker-compose` · 50 min · KCNA: Containerization; Networking/Storage groundwork*

**Purpose.** Run images as containers:
- lifecycle and the ephemeral writable layer
- port publishing: the network namespace (L05) meets the bind address (L01)
- user-defined networks with DNS by name
- volumes, bind mounts and tmpfs
- config through env vars (same image, different config)
- `HEALTHCHECK` and restart policies
- logs on stdout
- the real runtime stack: docker CLI → dockerd → containerd → shim → runc (OCI runtime spec); Podman as the daemonless alternative

Then Compose as the first **declarative** multi-container description. The lecture ends with the whole host dying, which is the motivation for orchestration.

**Pain.** „Klopa je api + worker + Postgres + Redis + RabbitMQ. Pet `docker run` naredbi s parametrima koje nitko ne pamti; kontejneri se ne nalaze; nakon `docker rm` nestale su sve narudžbe.”

**Uvodi:**
- container lifecycle; writable layer
- `-p host:container`
- bridge vs user-defined network; embedded DNS (none on the default bridge)
- named volume / bind mount / tmpfs
- env-var config (12-factor)
- restart policies; `HEALTHCHECK`; `docker logs`
- runtime stack (dockerd / containerd / runc); OCI runtime spec
- Podman / rootless
- Compose (`compose.yaml`, `docker compose up / down / down -v`, `depends_on` + `condition: service_healthy`)
- declarative description (first taste)
- the host as a SPOF

**Treba:** L01 (ports, DNS, bind address), L03 (health checks), L05 (namespaces), L06 (image)

**Scenes:**
1. **Životni ciklus.** Write a file, `rm` the container, the file is gone.
2. **Vrata u zidu.**
   - Two containers on :80 inside is fine.
   - Both publishing host :8080 conflicts.
   - An app bound to `127.0.0.1` inside the container is unreachable (callback to L01).
3. **Mreže i DNS po imenu.** `db:5432` works on a user-defined network but not on the default bridge.
4. **Gdje žive podatci.** Volume vs bind mount (hot reload) vs tmpfs; `down` vs `down -v`.
5. **Konfiguracija izvana.** One image, env vars per environment.
6. **Tko zapravo pokreće kontejner.** Stepper through the CLI → daemon → containerd → runc stack. Podman has no daemon.
7. **Od pet naredbi do jedne datoteke.** Compose; dependency order gated by healthchecks.
8. **Padne li domaćin…** Kill the VPS: restart policies can't help. There is no second machine.

**Flagship: „Compose slagalica”.**
- A host canvas: services, networks as coloured regions, volumes as cylinders, published ports as "doors".
- `compose.yaml` linked both ways to the canvas.
- Actions: up / down / down -v / `rm db` / „Sruši domaćina”.
- A test browser pointed at `localhost:8080`.
- Goals:
  - Klopa is visible in the browser.
  - api reaches db by name.
  - Data survives `down`.
  - The last goal is impossible by design: „Preživi pad domaćina” (the cliffhanger).

**Kod:**
- `compose.yaml` with api, worker, db (pinned e.g. `postgres:18`), redis, rabbitmq, healthchecks and named volumes; **no `version:` key**.
- `docker run -d -p 8080:3000 …`
- `docker network create`, `docker volume ls`
- `docker compose up -d / ps / logs -f`
- `docker inspect` showing the runtime

**Zablude:**
- „Promjene u kontejneru se čuvaju”.
- „`localhost` u kontejneru je moj laptop”.
- „`EXPOSE` objavljuje port”.
- „Kontejneri se nalaze po IP-u”.
- „`docker-compose` + `version: '3.8'`”.
- „`depends_on` čeka da servis bude spreman” (only with a health condition).
- „Restart policy = visoka dostupnost”.

---

### Modul 3 — Kubernetes: temelji

#### L08 · Zašto Kubernetes: željeno stanje i petlja usklađivanja
*slug `zasto-kubernetes` · 40 min · KCNA: Core Concepts; Ecosystem & Principles*

**Purpose.** The course's threshold concept. Scale Compose to many machines and failures, and you need placement, restart, replacement, discovery and controlled change. Kubernetes answers with:
- **declarative desired state**
- **independent control loops** that keep observing, comparing and acting

The lecture also covers:
- level-triggered vs edge-triggered behaviour
- what Kubernetes is **not**: it doesn't build code, doesn't do CI/CD, isn't a PaaS, and doesn't make an app scalable by itself
- cloud-native principles: declarative, immutable, disposable

**Pain.** „Klopa sad treba 30 kontejnera na 10 strojeva. U 12:05 jedan stroj umre. Tko to primijeti, kamo idu njegovi kontejneri i tko ažurira popis u load balanceru?”

**Uvodi:**
- orchestration; cluster; node (worker machine)
- desired vs actual state; reconciliation loop; controller (generic); replica controller (generic)
- declarative vs imperative; level-triggered
- self-healing; pets vs cattle
- "what Kubernetes is not"
- cloud-native principles

**Treba:** L02 (stateless), L03 (backend pool), L07 (Compose, host SPOF)

**Scenes:**
1. **Ti si orkestrator.** Manual dragging; a seeded „03:00 — stroj umro”.
2. **Termostat.** Dashed 22 °C vs solid 18 °C. The thermostat acts on the difference and doesn't care why the room is cold.
3. **Imperativno vs deklarativno.** After a crash, a script is blind; a loop repairs.
4. **Okidanje po razini.** A lost "Pod died" envelope; the next pass still fixes the state.
5. **Lanac termostata.** Many loops, each owning a slice. The objects are named later.
6. **Mit o dirigentu.** Not a workflow; no central script.
7. **Što Kubernetes nije.** Cards: build, CI/CD, DB, PaaS, magic scalability (back-reference to L02).
8. **Ljubimci i stoka.** Replace, don't repair.

**Flagship: „Ti si orkestrator → Termostat za aplikacije”.**
- Phase 1, manual: 30 containers on 5 machines with seeded failures and a downtime-minutes score.
- Phase 2: declare „klopa-api: 6 kopija”. A generic loop with observe → compare → act rings fixes failures. Dashed ghosts are filled by solid shapes.
- The timeline is scrubbable; downtime is compared with phase 1.
- No Kubernetes component names appear yet.

**Kod:** a bash `for` loop of `docker run` vs a 10-line TypeScript reconcile loop pseudocode (`observe → diff → act → sleep`).

**Zablude:**
- „Kubernetes je container runtime / zamjena za Docker”.
- „Kubernetes automatski čini aplikaciju skalabilnom”.
- „Deklaracija djeluje odmah”.
- „Kubernetes izvršava plan korak po korak”.
- „Kubernetes daje CI/CD, logove i bazu”.
- „Svakoj aplikaciji treba Kubernetes”.

---

#### L09 · Kako klaster radi: arhitektura i API
*slug `arhitektura-klastera` · 45 min · KCNA: Core Concepts, Administration, Containerization (CRI)*

**Purpose.** A minimal notional machine of who acts in the loop:
- **API server**: the only door and the hub
- **etcd**: the store; only the API server talks to it; Raft gets one sentence
- **scheduler**: only *assigns* a node
- **controller-manager**: runs the loops
- **cloud-controller-manager**
- **kubelet** on every node: makes containers real through **CRI** → containerd / CRI-O; no Docker in the path, but Docker-built OCI images run fine

It also covers:
- API object anatomy (`apiVersion` / `kind` / `metadata` / `spec` / `status`)
- **Namespace** as name scoping
- `kubectl` and kubeconfig contexts; watch; events
- the control plane and data plane being independent
- managed vs self-hosted clusters; learning environments; Headlamp

**Pod** is defined here in one sentence ("objekt koji opisuje kontejnere koje treba pokrenuti na jednom čvoru"). Its depth comes in L10.

**Pain.** „Izjavili smo 6 kopija. Tko to pamti? Tko primijeti razliku? Tko bira stroj? Tko zapravo pokreće proces?”

**Uvodi:**
- control plane; worker node; kube-apiserver; etcd; kube-scheduler; kube-controller-manager; cloud-controller-manager
- kubelet; CRI; containerd / CRI-O; dockershim removal
- API object anatomy; `spec` vs `status`; API groups / versions
- `kubectl` (get, describe, apply, explain, api-resources); kubeconfig / context
- Namespace (default, kube-system); watch / hub-and-spoke; events
- control-plane outage behaviour; HA control plane (one sentence)
- managed Kubernetes (EKS / GKE / AKS)
- kind / minikube / k3d / Killercoda; Headlamp

**Treba:** L05 (nodes are VMs), L07 (runtime stack), L08 (loop, generic controllers)

**Scenes:**
1. **Ploča na zidu.** The API server and etcd are the shared whiteboard. Components watch it and never call each other.
2. **Put jedne izjave.** Numbered stepper:
   1. kubectl → API server
   2. → etcd
   3. the replica controller sees the gap and creates Pod objects (ghosts)
   4. the scheduler binds each to a node
   5. the kubelet sees it → CRI → containerd pulls and starts
   6. the status flows back
3. **Anatomija objekta.** `spec` is dashed, `status` is solid. This grammar is reused in every later lecture.
4. **Namespace.** The same name in two namespaces; kube-system holds the system components.
5. **Tko pokreće kontejnere.** kubelet → CRI → containerd → runc (callback to L07). The Docker daemon is not involved.
6. **Ugasi upravljačku ravninu.** Running containers keep serving, and the kubelet still restarts a crashed container locally. Nothing new is scheduled and nothing is replaced.
7. **Gdje živi klaster.** Managed vs self-hosted. Nodes are VMs. Learning environments. Headlamp (the Dashboard is archived).

**Flagship: „Zaviri u klaster”.**
- Control-plane hexagons plus 3 nodes with watch lines.
- Scrub the desired count; numbered messages animate.
- Event log in the style of `kubectl get events`; scrubbable timeline.
- Break-it buttons: „Ubij kontejner” (kubelet restart), „Obriši Pod” (controller replaces it), „Ugasi upravljačku ravninu” (data plane survives, no healing), „Ugasi etcd” (API refuses writes).
- Node failure is deliberately deferred to L12, after tolerations exist.

**Kod:**
- The first manifest is a **Namespace** (`apiVersion: v1, kind: Namespace, metadata.name: klopa`).
- `kind create cluster`
- `kubectl cluster-info`
- `kubectl get nodes -o wide`
- `kubectl get pods -n kube-system`
- `kubectl api-resources`, `kubectl explain pod.spec`
- `kubectl config get-contexts`
- `kubectl get events`
- `crictl ps` on a node

**Zablude:**
- „Upravljačka ravnina pokreće moje kontejnere”.
- „Padne li upravljačka ravnina, padaju sve aplikacije”.
- „Scheduler pokreće kontejnere”.
- „Komponente se zovu izravno”.
- „Kubernetes koristi Docker”.
- „master node”.
- „Instaliraj Kubernetes Dashboard”.
- „Namespace je sigurnosna granica”. Left open with a caveat, resolved in L15.

---

#### L10 · Pod: najmanja jedinica
*slug `pod` · 55 min · KCNA: Core Concepts; Networking (CNI); Troubleshooting*

**Purpose.** The Pod in depth:
- One or more containers sharing one network namespace (one IP, `localhost`) and volumes (`emptyDir`).
- The Pod IP comes from the **CNI** network plugin in a flat cluster network.
- Labels and annotations; label queries, which are the first appearance of **selectors**.
- Phases and container states; `restartPolicy` and the CrashLoopBackOff back-off.
- init containers and **native sidecars**.
- The three probes and the **Ready** condition.
- Graceful termination (SIGTERM, grace period, preStop).
- `imagePullPolicy`.

Bare Pods are shown not to come back.

**Pain.** „klopa-api se ruši pri pokretanju; druga kopija prvih 20 s vraća greške iako ‚radi’; a Pod koji smo obrisali nikad se nije vratio.”

**Uvodi:**
- Pod spec (containers, image, ports, env); Pod IP; cluster network; CNI; shared localhost; `emptyDir`
- labels; annotations; label query / selector
- phases (Pending / Running / Succeeded / Failed / Unknown); container states and reasons (ContainerCreating, ErrImagePull / ImagePullBackOff, CrashLoopBackOff)
- `restartPolicy`; back-off (10 s → … → 300 s; reset after 10 min)
- init container; native sidecar (`initContainers` + `restartPolicy: Always`)
- startup / liveness / readiness probes (exec / httpGet / tcpSocket / grpc; defaults period 10 s, timeout 1 s, failureThreshold 3)
- Ready condition
- SIGTERM → grace period 30 s → SIGKILL; preStop hook
- `imagePullPolicy`
- `kubectl logs --previous`, `exec`, `port-forward`, `describe pod`
- bare / naked Pod

**Treba:** L03 (health checks), L05 (namespaces), L06 (tags), L09 (kubelet, API objects)

**Scenes:**
1. **Stan s cimerima i vlastita adresa.**
   - Containers share IP, `localhost` and an `emptyDir`; one main concern per Pod.
   - Every Pod gets an IP from CNI, and the IP changes when the Pod is re-created.
2. **Oznake i upiti.** Sticker labels; `-l app=klopa-api` highlights the matching set.
3. **Životni ciklus.** Pending → ContainerCreating (pull bar) → Running. A tag typo gives ImagePullBackOff.
4. **Pad i povratak.** `restartPolicy: Always`; a back-off ring that doubles up to 300 s.
5. **Init i sidecar.** The init container finishes first. The native sidecar starts before the app and stops after it.
6. **Tri pitanja zdravlja.**
   - startup: "jesam li krenuo?"
   - liveness: "jesam li zaglavio?" → restart
   - readiness: "smijem li primati promet?" → Ready = False, *no restart*
   - Kubernetes' version of the L03 health check.
   - Liveness must not check the DB.
7. **Lijepo gašenje.** SIGTERM, the grace period, in-flight requests, the preStop hook.
8. **Goli Pod.** Delete it and it is gone; nothing brings it back. Cliffhanger to L12.

**Flagship: „Laboratorij zdravlja Poda”.**
- Three bare Pods; a traffic source that, like the L03 balancer, sends only to Ready Pods.
- App behaviour presets: healthy, slow start (40 s), crash at start, deadlock after N s, DB outage, ignores SIGTERM.
- Per-probe toggles and sliders (`initialDelaySeconds`, `periodSeconds`, `failureThreshold`).
- Probe lanes with ✓/✕ ticks, a restart counter, a Ready badge and a back-off ring.
- Goals:
  - Get the slow-start app to Ready without it being killed (startupProbe).
  - Make the deadlocked app self-recover (liveness).
  - Show that "liveness checks the DB" + DB down restarts all 3 Pods.
  - Shut down with 0 dropped in-flight requests.
- Students predict before running.

**Kod:**
- `pod.yaml` for klopa-api with labels and all three probes. Resources are deliberately absent until L11.
- A Pod with an init container and a native sidecar.
- `kubectl apply`
- `kubectl get pods -o wide --show-labels`
- `kubectl describe pod`, `kubectl logs --previous`
- `kubectl exec -it … -- sh`
- `kubectl port-forward pod/… 8080:3000`
- `kubectl delete pod`

**Zablude:**
- „Pod = kontejner”.
- „Pod se popravi na mjestu i zadrži IP”.
- „web i baza u istom Podu”.
- „Podove stvaramo izravno”.
- „Liveness treba provjeravati bazu”.
- „Neuspjeh readinessa restartira kontejner”.
- „Sidecar je samo još jedan kontejner u `containers:`”.

---

#### L11 · Raspoređivanje i resursi: gdje će Pod živjeti
*slug `rasporedivanje-i-resursi` · 50 min · KCNA: Scheduling; Troubleshooting*

**Purpose.** How the scheduler places Pods:
- `requests` vs node **allocatable**
- filter → score → bind
- `Pending` with an exact reason; fragmentation

How `limits` are enforced by the cgroups from L05:
- CPU is throttled.
- Memory gets OOMKilled (exit 137) and then CrashLoopBackOff (L10).

Also:
- QoS classes; node-pressure eviction
- `nodeSelector` / affinity; taints / tolerations (including the default 300 s not-ready / unreachable tolerations)
- priority (one line)
- in-place resize (GA 1.35)

It reuses the 2 GB / 4 GB intuition from L03: the servers are now nodes.

**Pain.** „Pod visi u Pending: `0/3 nodes are available: 3 Insufficient memory` — a nadzor kaže da su čvorovi na 30 %! I worker stalno umire s OOMKilled.”

**Uvodi:**
- `resources.requests` / `limits` (m, Mi / Gi); allocatable (capacity − reserved − eviction threshold)
- scheduling cycle (filter / score / bind); Unschedulable message; fragmentation
- CFS throttling; OOMKilled / 137
- QoS (Guaranteed / Burstable / BestEffort)
- node-pressure eviction (`memory.available < 100Mi`)
- `nodeSelector`; node affinity; taints / tolerations; default not-ready / unreachable tolerations (300 s)
- pod anti-affinity / topology spread (one line); priority / preemption (one line)
- in-place resize

**Treba:** L01 / L03 (CPU vs RAM), L05 (cgroups), L09 (scheduler, kubelet), L10 (Pod, CrashLoopBackOff)

**Scenes:**
1. **Rezervacija, ne potrošnja.** The restaurant-reservation analogy, with a break-box. The scheduler sees requests only.
2. **Filtar → bodovi → vezanje.** A node table with ✓/✕ and reasons, plus LeastAllocated scores.
3. **Pending i fragmentacija.** `big-db` and `fragment` cards.
4. **CPU se guši, memorija ubija.** 100 ms period bars vs an OOM burst followed by CrashLoopBackOff.
5. **QoS klase.** Three badges and who is evicted first.
6. **Pritisak na čvoru.** Kubelet eviction ranking (usage above request first). The kernel OOM killer acts if memory grows faster than the kubelet.
7. **Gdje smije, a gdje ne.** `disk=ssd` selector; a `gpu` taint plus toleration. The built-in 300 s tolerations are shown here.
8. **Promjena u hodu.** In-place resize keeps the restart counter unchanged.

**Flagship: „Tetris raspoređivača”.** SIM 3 as in sim-models.
- Nodes:
  - 2 vCPU / 4 GiB (1930m / 2972Mi)
  - 4 / 16 (3920m / 13622Mi)
  - 2 / 8 (1930m / 6249Mi)
  - plus 100m / 200Mi of system Pods on each
- Pod cards: web, api-guaranteed, cpu-burner, batch, leaky, besteffort, big-db, fragment.
- Manual drag first, then the auto scheduler.
- Three-layer node bars: requested / used / Σlimits.
- Break-it buttons: curenje memorije, CPU petlja, pritisak na čvoru.
- Goals:
  - Place every card that can be placed.
  - Reproduce `0/3 nodes are available: 3 Insufficient cpu` for big-db.
  - Stop leaky's OOM loop.
  - Keep BestEffort from being evicted.

**Kod:**
- A Pod with requests and limits.
- `kubectl describe node` (Allocatable / Allocated resources).
- `FailedScheduling` events.
- `kubectl taint nodes …` and a toleration snippet.
- Reading `status.qosClass` with jsonpath.
- `kubectl patch pod … --subresource resize …`
- `kubectl top` is not used here; metrics-server arrives in L19.

**Zablude:**
- „Scheduler gleda stvarnu potrošnju”.
- „Limits se rezerviraju”.
- „Prekoračen CPU limit ubija”.
- „Prekoračena memorija samo usporava”.
- „Bez requests je u redu”.
- „Promjena CPU-a / memorije zahtijeva novi Pod” (outdated).
- „Veći čvor = brži Podovi”.

---

#### L12 · ReplicaSet i Deployment: samoizlječenje i skaliranje
*slug `deployment` · 45 min · KCNA: Core Concepts (workloads); Scheduling (DaemonSet)*

**Purpose.** The first controller students write YAML for.
- The generic replica controller from L08–L09 gets its name: **ReplicaSet**. It keeps N Pods matching a **selector** (L10 labels) from a Pod template.
- **Deployment** manages ReplicaSets; rollouts come in L14.
- The self-healing ladder:
  - container → kubelet
  - Pod → ReplicaSet
  - node → NotReady, then eviction after the 300 s toleration from L11, then replacement elsewhere
- Manual scaling; replicas ≠ machines (Pending from L11).
- `ownerReferences` and cascading delete; `pod-template-hash`.
- "Deployment (the object) vs deploy (the activity from L01)".
- The controller family: DaemonSet, Job, CronJob.
- YAML lives in Git; an imperative `kubectl scale` makes Git lie.

**Pain.** „Goli Pod iz L10 nije se vratio. U 12:00 trebamo 6 kopija, noću 2. A kad čvor umre?”

**Uvodi:**
- ReplicaSet; `selector.matchLabels`; Pod template
- Deployment; `replicas`
- `ownerReferences`; garbage collection / cascade; `pod-template-hash`
- `kubectl scale`
- self-healing ladder; node failure timing
- DaemonSet; Job (`completions`, `parallelism`, `backoffLimit`); CronJob
- naked-Pod anti-pattern
- the declarative `kubectl apply` + Git workflow

**Treba:** L08 (loop), L09 (controller-manager), L10 (labels, Ready, bare Pod), L11 (Pending, tolerations)

**Scenes:**
1. **Lanac termostata, konkretno.** Deployment → ReplicaSet → Pods, with ghosts filled by solid shapes.
2. **Selektor je upit.** Relabel a Pod: it escapes the ReplicaSet, and a new Pod appears.
3. **Ljestve samoizlječenja.** Three zoom levels. The node level is compressed and badged (`stvarno: ~5 min`).
4. **Replike ≠ strojevi.** Scale to 12 on small nodes → Pending (callback to L11).
5. **Kaskadno brisanje.** Delete the Deployment → ReplicaSets → Pods; `--cascade=orphan`.
6. **Dvije „deployment” riječi.** Deploy (the activity) vs `Deployment` (the object). Glossary chip.
7. **Obitelj kontrolera.**
   - DaemonSet: one Pod per node (a log agent).
   - Job: runs to completion (a DB migration).
   - CronJob: nightly menu import.

**Flagship: „Kontroler na djelu”.**
- Deployment klopa-api with a replicas scrubber; nodes with capacity.
- Break-it buttons: kill a Pod, relabel a Pod, kill a node (NotReady, then eviction after the toleration, compressed), delete the ReplicaSet (the Deployment recreates it).
- Ownership-tree view; an event log.
- Job mode: 10 completions with parallelism 3.
- Goals:
  - Keep 6 Ready Pods through a node failure. This needs spare capacity, the N+1 lesson from L02.
  - Explain the "escaped" Pod.

**Kod:**
- `deployment.yaml` (`apps/v1`, selector = template labels, requests, probes).
- `kubectl apply`
- `kubectl get deploy,rs,pods --show-labels`
- `kubectl scale deployment klopa-api --replicas=6`, with a callout that Git still says 3
- `job.yaml`, `cronjob.yaml`, a DaemonSet snippet

**Zablude:**
- „Više replika = više strojeva”.
- „Deployment upravlja Podovima izravno”.
- „Pod se popravlja”.
- „`kubectl scale` u produkciji je bezazlen”.
- „ReplicaSetove stvaramo ručno”.
- „Deployment (objekt) = deployment (isporuka)”.

---

### Modul 4 — Promet, promjene i sigurnost u klasteru

#### L13 · Service: stalna adresa za prolazne Podove
*slug `service` · 55 min · KCNA: Networking*

**Purpose.** Pods churn and their IPs change. A **Service** provides:
- a stable *virtual* IP and DNS name
- **EndpointSlices** listing Ready, label-matching Pods
- **kube-proxy** rules on every node

Correctness points:
- iptables is the default mode in 1.37; nftables is GA; ipvs is deprecated since 1.35.
- The backend is chosen **at random per connection**.
- Service types: ClusterIP / NodePort (30000–32767) / LoadBalancer (needs the cloud-controller-manager or an add-on like MetalLB) / headless / ExternalName.
- DNS: CoreDNS, search domains, `name.namespace`, FQDN.
- The long-lived-connection trap (keep-alive / HTTP/2 / gRPC).
- `sessionAffinity`.
- `trafficDistribution` gets one line.

It reuses the L03 sim in "kube-proxy mode" to make the contrast explicit.

**Pain.** „klopa-worker ima upisan IP API-jeva Poda; nakon restarta ne razgovara ni s kim. A kako vanjski korisnici uopće dođu do Podova?”

**Uvodi:**
- Service; ClusterIP (virtual); `port` / `targetPort` / named ports
- EndpointSlice; readiness → endpoints
- kube-proxy; iptables / nftables / ipvs; DNAT and conntrack (DeepDive); random per connection
- `sessionAffinity: ClientIP`; `trafficDistribution`
- NodePort; LoadBalancer; headless; ExternalName
- CoreDNS; `svc.cluster.local`; search path
- eBPF dataplanes (one line)
- `port-forward svc/`

**Treba:** L01 (DNS, ports), L03 (L4 / L7, per-connection), L07 (DNS by name), L09 (cloud-controller-manager), L10 (labels, Ready, Pod IP), L11 (capacity via requests), L12 (Deployment)

**Scenes:**
1. **IP-ovi Podova su prolazni.** The hard-coded IP breaks; the Service keeps working.
2. **Laboratorij selektora.** Drag label stickers and watch endpoints attach and detach. A typo `app=klopa-apj` leaves 0 endpoints.
3. **Samo spremni.** A failing readiness probe removes the Pod from the EndpointSlice without restarting it (pays off L10).
4. **Put paketa.** DNS → ClusterIP (owned by no one) → DNAT on the client's node to a random Ready Pod → reply rewritten back.
5. **Anatomija imena.** `klopa-api` → `klopa-api.klopa` → `klopa-api.klopa.svc.cluster.local`.
6. **Vrste Servicea.** Reachability rings for ClusterIP → NodePort → LoadBalancer. Headless DNS returns the Pod IPs.
7. **Zamka dugih veza.** One gRPC connection is pinned to one Pod while the others idle.
8. **Nasumično, ne redom.**
   - The L03 sim in Service mode ignores node size.
   - Uneven capacity is handled by the scheduler and requests (L11), not by Service weights.

**Flagship: „Selektor + put paketa”.**
- A label lab with a live EndpointSlice.
- A client Pod with a toggle „nova veza po zahtjevu” vs „jedna dugotrajna veza”.
- Per-Pod hit counters showing random variance vs a pinned connection.
- A packet stepper with header rewriting; a Service type toggle.
- Goals:
  - Fix the typo.
  - Spread a keep-alive client across 4 Pods: per-request connections, an L7 proxy, or client-side balancing over a headless Service.
  - Explain zero traffic to a NotReady Pod.

**Kod:**
- `service.yaml` (ClusterIP); NodePort and headless variants
- `kubectl get endpointslices -l kubernetes.io/service-name=klopa-api`
- `kubectl run tmp --rm -it --image=busybox:1.37 -- nslookup klopa-api`
- `kubectl port-forward svc/klopa-api 8080:80`
- DeepDive: `iptables-save | grep KUBE-SVC` / `nft list ruleset`

**Zablude:**
- „Service je proces / kutija”.
- „Service raspoređuje round-robin po zahtjevu”.
- „Service pokazuje na Deployment”.
- „`type: LoadBalancer` radi svugdje”.
- „Kratko ime radi iz svakog Namespacea”.
- „Endpoints objekt” (deprecated since 1.33).
- „ipvs za performanse”.
- „gRPC se balansira po zahtjevu”.

---

#### L14 · Rolling update i rollback: nova verzija bez prekida
*slug `rolling-update` · 50 min · KCNA: Application Delivery; Troubleshooting*

**Purpose.** This is "deploy" inside Kubernetes. A Deployment rolls out by scaling a new ReplicaSet up and the old one down.
- **maxSurge** rounds up and **maxUnavailable** rounds down, from 25 % / 25 % defaults. Both cannot be 0.
- Progress is gated by **readiness**.
- Both versions serve through the Service at the same time, so compatibility matters.
- Graceful shutdown + preStop avoids dropped requests during endpoint propagation.
- **Recreate** strategy.
- `progressDeadlineSeconds` → `ProgressDeadlineExceeded`, and **no automatic rollback**.
- `rollout undo` re-scales the old ReplicaSet; `revisionHistoryLimit` is 10.
- What triggers a rollout: a template change does, a replicas change doesn't. Why `:latest` breaks this.

**Pain.** „Novi jelovnik (v1.4.0) mora biti vani u 10:00 bez izgubljenih narudžbi — a ako je pokvaren, za nekoliko sekundi trebamo natrag v1.3.2.”

**Uvodi:**
- rollout; RollingUpdate / Recreate; maxSurge / maxUnavailable rounding
- Available vs Ready; `minReadySeconds`
- Progressing / Available conditions; ProgressDeadlineExceeded
- revision; change-cause
- `kubectl rollout status / history / undo / pause / resume / restart`
- mixed-version window; backward compatibility
- terminating Pods not counted (`terminatingReplicas`)
- endpoint propagation + `preStop: sleep`

**Treba:** L06 (tags / digests), L10 (readiness, termination), L12 (ReplicaSet, template hash), L13 (Service endpoints)

**Scenes:**
1. **Što pokreće rollout.** Predict, then run: scaling vs changing the image.
2. **Dva ReplicaSeta u suprotnim smjerovima.** v1 blue and v2 violet with invariant gauges: `available ≥ N − unavailable` and `total ≤ N + surge`.
3. **Ograde.**
   - A rounding table for N = 1–10.
   - Small multiples 25/25 vs 1/0 vs 0/1 with validated durations of 28 s / 51 s / 46 s.
4. **Readiness je vratar.** Without a readiness probe, warming Pods get traffic and return errors.
5. **Dvije verzije istodobno.** A mixed request stream, with an API/DB compatibility warning.
6. **Tiho gašenje.** The race between SIGTERM and endpoint removal; preStop sleep gives 0 dropped requests.
7. **Loš image.** The rollout stalls at 3 old Ready + 2 new unready, gets ProgressDeadlineExceeded, and nothing rolls back by itself. `rollout undo`.
8. **Recreate.** A full outage gap, and when it is still the right choice.

**Flagship: „Kontrolna ploča rollouta”.** SIM 5 as in sim-models.
- N = 4; surge / unavailable dropdowns {0, 1, 2, 25 %, 50 %, 100 %} with a bad-input message.
- Images: v1 / v2 / v3-bug / crashloop.
- Scenarios: no readiness, ignores SIGTERM, no preStop, Recreate.
- 20 rps over Ready Pods coloured by version; `terminatingReplicas` shown.
- Validated: the peak of 7 Pods at 25/25; N = 10 with surge 3 / unavailable 2 stalls at 8 old / 5 new, matching the docs.
- Goals:
  - Roll v1 → v2 with 0 failed requests.
  - Find a setting with no capacity dip.
  - Recover from v3-bug in under 30 s of sim time.

**Kod:**
- A Deployment `strategy` block, readinessProbe, `preStop: sleep`, `terminationGracePeriodSeconds`; a tag and a digest variant
- `kubectl set image …` (labelled imperative) vs editing YAML and `apply`
- `kubectl rollout status / history / undo --to-revision`
- the change-cause annotation
- `kubectl rollout restart`

**Zablude:**
- „Rolling update je automatski bez prekida”.
- „Deployment se sam vraća”.
- „`minReadySeconds` odgađa promet”.
- „maxSurge i maxUnavailable mogu biti 0”.
- „`:latest` je dobar za rollout”.
- „Blue / green i canary su ugrađeni u Deployment” (they are not; L21).

---

#### L15 · Tko smije što: Namespaces, RBAC i sigurnost Podova
*slug `rbac-i-sigurnost` · 50 min · KCNA: Security; Administration*

**Purpose.** Before passwords go into the cluster (L16), students need to know who can read and do what.
- The API request pipeline: **authentication → authorization → admission**.
- Humans vs **ServiceAccounts**, the identity every Pod runs as, with projected short-lived tokens.
- **RBAC**: Role / ClusterRole / RoleBinding / ClusterRoleBinding. Additive, no deny rules; `list` / `watch` reveal content.
- Least privilege and the indirect-privilege trap: whoever can create Deployments can create Pods running as any ServiceAccount in the namespace, with anything mountable there.
- **Admission**: Pod Security Admission (privileged / baseline / restricted; enforce / audit / warn; PSP removed in 1.25); `securityContext`, linked to `USER` from L06; ValidatingAdmissionPolicy and policy engines in one line.
- **ResourceQuota / LimitRange** (requests from L11).
- **NetworkPolicy**: allow-all by default; needs an enforcing CNI.

**Pain.** „Pripravnikov `kubectl` obrisao je produkcijski Deployment. CI bot ima `cluster-admin`. Kompromitirani worker može razgovarati s bazom iz bilo kojeg Namespacea i radi kao root.”

**Uvodi:**
- authentication / authorization / admission
- user vs ServiceAccount; projected token
- Role / ClusterRole / bindings; verbs; least privilege; `kubectl auth can-i`
- admission controllers (mutating / validating); Pod Security Standards / Admission; `securityContext` (runAsNonRoot, readOnlyRootFilesystem, drop capabilities, allowPrivilegeEscalation)
- ResourceQuota; LimitRange
- NetworkPolicy (default deny, allow-lists)
- namespaces as a governance boundary (not network isolation by default)

**Treba:** L06 (`USER`), L09 (API server, Namespace), L10 (Pod), L11 (requests), L12 (Deployment → Pods), L13 (Pod-to-Pod traffic, Service)

**Scenes:**
1. **Put zahtjeva kroz API poslužitelj.** A strip: Autentifikacija → Autorizacija → Admission → etcd.
2. **Ljudi i strojevi.** Users from an external IdP vs ServiceAccounts; every Pod has one.
3. **RBAC slagalica.** Verb × resource chips; the scope ring of RoleBinding vs ClusterRoleBinding; no deny rules.
4. **Posredne ovlasti.** Create Deployment ⇒ create Pod ⇒ act as any ServiceAccount in the namespace; `list` reveals contents.
5. **Kontrola ulaza: Pod Security.** A privileged Pod is rejected in a `restricted` namespace; a `securityContext` checklist.
6. **Kvote.** A ResourceQuota budget bar; LimitRange defaults for Pods without requests.
7. **Mrežna pravila.** All-to-all lines → default deny → allow api → db only; the CNI must enforce it.

**Flagship: „Tko smije što?”.**
- Subjects: Ana (dev), Marko (intern), the `ci-deployer` and `klopa-worker` ServiceAccounts.
- Namespaces: `klopa-dev`, `klopa-prod`.
- Drag to build roles and bindings.
- A query console animates `can-i` checks through the pipeline strip; a 403 names the missing rule.
- Admission rejects privileged or over-quota Pods.
- A NetworkPolicy tab with connection lines.
- Goals:
  - CI can deploy only in dev.
  - Marko can read Pods and logs in dev only.
  - Only klopa-api reaches klopa-db.
  - klopa-api passes `restricted`.

**Kod:**
- `serviceaccount.yaml`, `role.yaml`, `rolebinding.yaml`
- `kubectl auth can-i delete deployments -n klopa-prod --as=marko`
- namespace label `pod-security.kubernetes.io/enforce: restricted`
- a `securityContext` block
- `resourcequota.yaml`, `limitrange.yaml`
- NetworkPolicy: default-deny plus an allow rule

**Zablude:**
- „Namespace izolira mrežu i sigurnost sam po sebi”.
- „Samo `get` otkriva sadržaj”.
- „RBAC ima pravila zabrane”.
- „CI s cluster-adminom je u redu”.
- „PodSecurityPolicy”.
- „Kontejneri po zadanome ne rade kao root”.
- „NetworkPolicy radi na svakom klasteru”.

---

#### L16 · ConfigMap i Secret: konfiguracija i upravljanje tajnama
*slug `configmap-i-secret` · 55 min · KCNA: Security; Core Concepts; Ecosystem (CRDs/operators)*

**Purpose.** Keep config out of the image (L06, L07): a **ConfigMap** for ordinary settings, a **Secret** for sensitive values.

Consumption and update semantics:
- Env vars never update.
- Volumes update eventually.
- `subPath` never updates.
- The app must re-read; or use `rollout restart` (L14) or a checksum annotation.

The truth about Secrets:
- **base64 encoding, not encryption.**
- **Unencrypted in etcd by default.**
- 1 MiB limit; types (Opaque, `kubernetes.io/tls`, `dockerconfigjson`…); `immutable`.
- Readable by `get` / `list` / `watch` and by anyone who can create Pods (pays off L15).

Protection layers:
- encryption at rest (aescbc / aesgcm / **KMS v2** envelope; managed clusters differ, e.g. EKS encrypts by default)
- least-privilege RBAC
- no plaintext in Git
- external stores (Vault / OpenBao, cloud secret managers) through **External Secrets Operator** or the **Secrets Store CSI Driver**
- Git-safe encryption: **Sealed Secrets** and **SOPS**

This is where **CRD + controller = operator** is introduced, because ExternalSecret and SealedSecret are the first non-built-in kinds students meet. It is the same loop as L08.

**Pain.** „Lozinka baze i ključ SMS-gatewaya stoje u `compose.yaml` i u Git repozitoriju. Netko je skoro gurnuo `.env` na GitHub. Kako sigurno stižu u Podove i kako ih rotiramo?”

**Uvodi:**
- ConfigMap; Secret; base64 vs encryption
- `env` / `envFrom`; volume projection; update semantics; `immutable`
- Secret types; `imagePullSecrets`
- EncryptionConfiguration; KMS v2 envelope (DEK / KEK)
- CRD; operator
- ESO (SecretStore / ExternalSecret, refreshInterval)
- Secrets Store CSI Driver (SecretProviderClass, tmpfs)
- Sealed Secrets (kubeseal, scopes, key renewal)
- SOPS (values encrypted, keys not; age / KMS)
- Vault licence and the OpenBao fork (fact callout)
- rotation; OWASP's env-var risk

**Treba:** L06 (no secrets in layers, private registry), L07 (env config), L09 (etcd), L10 (volumes), L14 (rollout restart), L15 (RBAC, Pod-creation trap)

**Scenes:**
1. **Ista slika, tri okruženja.** One digest with three ConfigMaps gives three behaviours.
2. **Dekodiraj.** A base64 button reveals the password.
3. **Kako tajna stiže u Pod.** Env vs volume side by side. After rotation, the volume Pod sees the change after a sync delay; the env Pod stays stale until restart; `subPath` never updates.
4. **Tko može vidjeti?** Attacker "eyes": Git viewer, image puller, etcd-backup thief, get-secrets user, Pod creator, compromised Pod.
5. **Šifriranje u mirovanju.** DEK / KEK envelope animation. The default provider is `identity`, i.e. none.
6. **Kubernetes se može proširiti.** CRD + controller: an ExternalSecret ghost is filled by a Secret.
7. **Tajne izvana.** ESO sync vs CSI mount, with a refreshInterval ring.
8. **Šifrirano u Gitu.** Sealed Secrets public / private key flow; SOPS.

**Flagship: „Put tajne”.** A threat-model simulator.
- Storage path: in the image / plaintext in Git / Kubernetes Secret / SealedSecret / SOPS / ESO + external store / CSI.
- Cluster toggles: encryption at rest, least-privilege RBAC.
- Consumption: env / volume / subPath.
- Attacker eyes turn red or grey; a rotation timeline.
- Goals:
  - Make every eye grey except „kompromitirani Pod”, the honest limit.
  - Rotate the SMS key with zero restarts.
  - Explain why "Pod creator" stays red.

**Kod:**
- `configmap.yaml`
- a `secret.yaml` with `stringData` (red "never commit" banner)
- `kubectl create secret generic … --dry-run=client -o yaml`
- `kubectl get secret … -o jsonpath='{.data.password}' | base64 -d`
- Deployment `env` / `envFrom` / `volumeMounts`
- EncryptionConfiguration (aescbc, kms v2)
- ExternalSecret + SecretStore (`external-secrets.io/v1`, verify against ESO v2.x)
- `kubeseal` → SealedSecret
- `sops --encrypt --age …`
- a `kubernetes.io/tls` Secret; `imagePullSecrets`

**Zablude:**
- „Secreti su šifrirani”.
- „Samo admini čitaju Secrete”.
- „base64 u Gitu je u redu”.
- „Promjena Secreta odmah mijenja aplikaciju”.
- „ConfigMap ili Secret, svejedno”.
- „Varijable okruženja su najsigurnije”.
- „ESO je napušten”.
- „Vault je MPL open source”.

---

#### L17 · Ulaz u klaster: Gateway API
*slug `gateway-api` · 45 min · KCNA: Networking; Ecosystem*

**Purpose.** One L7 entry point for many Services:
- routing by host, path and header
- **TLS termination** with the `kubernetes.io/tls` Secret from L16
- **weighted backends**, used for canaries in L21

Gateway API is the recommended successor to Ingress:
- It is **CRDs + a controller** (pattern from L16).
- It is role-oriented: GatewayClass (infra provider) / Gateway (platform team) / HTTPRoute (app team).
- It is portable; v1.6 is the current release.

Ingress API: GA, **frozen, not deprecated**. The community ingress-nginx controller **was retired on 2026-03-24**. F5's NGINX Ingress Controller is a different, maintained project. `ingress2gateway` handles migration. Includes the cost of a LoadBalancer per Service.

**Pain.** „Klopa ima web, api i admin. Tri LoadBalancer Servicea = tri javne IP adrese, tri računa, tri certifikata — a `/api` mora ići na drugi Service nego `/`.”

**Uvodi:**
- north-south vs east-west traffic; edge L7 routing
- GatewayClass; Gateway (listeners); HTTPRoute (parentRefs, hostnames, matches, filters, backendRefs, weights)
- route precedence; ReferenceGrant; GRPCRoute (one line)
- standard vs experimental channel
- controller implementations (Envoy Gateway, NGINX Gateway Fabric, Traefik, Cilium, Istio)
- cert-manager (one line)
- Ingress (legacy); ingress2gateway

**Treba:** L03 (L7 routing, TLS termination), L09 (Namespaces), L13 (Service, LoadBalancer type), L15 (roles), L16 (TLS Secret, CRDs)

**Scenes:**
1. **Zašto ne LoadBalancer po Serviceu?** A € counter: one IP vs many.
2. **Uloge.** Ownership colours.
3. **Lanac resursa.** GatewayClass → Gateway → HTTPRoute → Service → EndpointSlice → Pods; hover shows who references what.
4. **Pravila usmjeravanja.** Host / path / header matches; the more specific rule wins; unmatched requests get 404.
5. **TLS na ulazu.** The handshake terminates at the Gateway, using the certificate from the Secret.
6. **Težine.** backendRefs at 90/10 and the resulting colour mix of traffic.
7. **Ingress koji ćeš sresti.** The same intent written as an Ingress plus annotations; the retirement timeline; ingress2gateway.

**Flagship: „Gradska vrata”.**
- A route builder (drag rules).
- A request stream (`klopa.example/`, `/api/…`, `admin.klopa.example`, `x-beta: 1`) animates through the Gateway.
- The matching rule lights up in the YAML; unmatched requests get 404.
- A roles view and a „Prikaži kao Ingress” toggle.
- Goals:
  - `/api` → klopa-api.
  - The admin host only → klopa-admin.
  - 10 % of `/api` → v2.
  - HTTPS works through `certificateRefs`.

**Kod:**
- Gateway API CRD install: `kubectl apply --server-side -f …/v1.6.x/standard-install.yaml` (pinned in the block)
- `gateway.yaml` (HTTPS listener + certificateRefs)
- `httproute.yaml` (matches + weights)
- `kubectl get gateway,httproute`, `kubectl describe httproute` (status conditions)
- the equivalent Ingress for comparison
- `ingress2gateway print`
- The controller is pre-installed in the lab.

**Zablude:**
- „Ingress je vrsta Servicea”.
- „Ingress je mrtav / deprecated”.
- „Koristi ingress-nginx”.
- „Gateway API je ugrađen u svaki klaster”.
- „F5 NGINX Ingress Controller = umirovljeni ingress-nginx”.

---

### Modul 5 — Stanje, skaliranje i uvid u sustav

#### L18 · Pohrana i aplikacije sa stanjem
*slug `pohrana-i-statefulset` · 45 min · KCNA: Storage*

**Purpose.** Pods are disposable; data isn't.

Volume lifecycles:
- container filesystem: dies with the container
- `emptyDir`: dies with the Pod
- **PersistentVolume**: outlives the Pod

Storage objects:
- **PVC → PV → StorageClass**; dynamic provisioning through **CSI** drivers
- access modes: **RWO is one *node***; RWX; RWOP
- reclaim policy; `WaitForFirstConsumer` (topology)
- the attach / detach delay after a node failure

**StatefulSet** gives identity:
- stable ordinal names; ordered creation
- `volumeClaimTemplates`
- per-Pod DNS via the headless Service from L13
- PVCs **retained** by default

Replicas are not replication: `replicas: 3` means three separate databases. Replication is the database's job, done through an operator or a managed DB. Backups and snapshots get one line.

**Pain.** „Postgres smo pokrenuli kao Deployment. Čvor je pao, Pod se preselio — i sve narudžbe su nestale. Onda je netko stavio `replicas: 3` i dobili smo tri različite tablice narudžbi.”

**Uvodi:**
- PersistentVolume; PersistentVolumeClaim; StorageClass; provisioner; CSI
- access modes; reclaim policy; volumeBindingMode; attach / detach
- StatefulSet; ordinal identity; OrderedReady / Parallel; volumeClaimTemplates; persistentVolumeClaimRetentionPolicy
- DB operator; managed DB; VolumeSnapshot (one line)

**Treba:** L02 (state, replication), L10 (volumes), L11 (topology / scheduling), L12 (node failure, controllers), L13 (headless), L16 (DB password Secret, operators)

**Scenes:**
1. **Preživljavaju li podaci?** Three storage variants × three destructive actions.
2. **Listić za disk.** A claim ticket matched to a PV; the StorageClass "factory"; the CSI driver.
3. **Načini pristupa.** Which nodes can attach each mode.
4. **Disk putuje s Podom.** After a node failure, detach then attach. Compressed, badged as minutes in reality. Zone topology.
5. **Identitet: StatefulSet.** `db-0/1/2`, each with its own PVC and stable DNS. Delete `db-1` and it returns with the same name and PVC. The Deployment version is shown alongside.
6. **Replike nisu replikacija.** Three independent DBs vs a primary with streaming replicas.
7. **Kad StatefulSet nije dovoljan.** Operators, a managed DB, backups.

**Flagship: „Preživljavaju li podaci?”.**
- Row counters per variant.
- Actions: restart container, delete Pod, kill node, scale the StatefulSet 3 → 1 → 3, delete the StatefulSet.
- A replication sub-mode with a lag slider.
- Goals:
  - Keep orders through a node failure.
  - Scale down and back up with `db-2`'s data intact.
  - Diagnose the "three databases" bug.

**Kod:**
- `pvc.yaml`
- a StorageClass example with `WaitForFirstConsumer`
- `statefulset.yaml` with volumeClaimTemplates and a headless Service
- `kubectl get sc,pv,pvc`, `kubectl describe pvc` (Pending reasons)
- an operator CR in a DeepDive (verify the API)

**Zablude:**
- „Datotečni sustav kontejnera je trajan”.
- „Svaki volumen je trajan”.
- „RWO znači jedan Pod”.
- „`replicas: 3` Postgres = klaster baze”.
- „StatefulSet replicira podatke”.
- „Brisanje StatefulSeta briše podatke”.

---

#### L19 · Autoskaliranje: kapacitet koji prati promet
*slug `autoskaliranje` · 55 min · KCNA: Scheduling; Ecosystem & Principles (autoscaling, serverless)*

**Purpose.** Automate the lunch rush.

**HPA** (`autoscaling/v2`):
- `desired = ceil(current × utilization / target)`
- utilisation is measured **relative to requests** (L11)
- tolerance 10 %; sync every 15 s
- **scale-down window 300 s**; max over metrics; rate policies
- reads metrics-server through `metrics.k8s.io` (v1 GA in 1.37)

**Node scaling:**
- **Cluster Autoscaler / Karpenter** add nodes **for Pending Pods**, which takes minutes.
- Scale-down happens when request utilisation is below 0.5 for 10 min.

**Vertical scaling:**
- **VPA** is a separate add-on. Modes: Off / Initial / Recreate / InPlaceOrRecreate; `Auto` is deprecated.
- Don't combine it with HPA on the same metric.
- In-place resize.

**Event-driven scaling and disruptions:**
- **Queue-depth scaling** with **KEDA** or an HPA External metric (pays off L04).
- **HPA scale-to-zero** is beta, on by default in 1.37, object / external metrics only.
- Serverless as a principle.
- **PodDisruptionBudget** applies to *voluntary* evictions (node drain during scale-down), not crashes.
- Lead time and headroom.

**Pain.** „Svaki dan u 11:55 netko ručno pokreće `kubectl scale`; u ispitnom roku zaboravi, a u 12:05 p95 je 5 s. Noću plaćamo deset praznih čvorova.”

**Uvodi:**
- HPA; metrics-server / `metrics.k8s.io`; utilisation vs request
- tolerance; stabilisation window; behavior policies; unready-Pod handling (DeepDive)
- Cluster Autoscaler; Karpenter; node lead time; scale-down rules
- drain; Eviction API; PDB
- VPA modes; KEDA (ScaledObject → External metric); scale-to-zero; serverless
- overprovisioning (DeepDive)
- `kubectl top`

**Treba:** L01 (utilisation curve), L04 (queue depth, drain time), L10 (readiness), L11 (requests, Pending, in-place resize), L12 (Deployment), L13 (traffic over Ready Pods), L16 (CRDs)

**Scenes:**
1. **Formula uživo.** Scrubbable: 3 Pods at 90 % with a 50 % target → 6; at 54 % → no change (tolerance).
2. **Mjeri se prema requests.** No request means no HPA. The limit caps observable utilisation.
3. **Polako dolje.** The 300 s window prevents flapping.
4. **Podovi u sekundama, čvorovi u minutama.** A Pending Pod → the CA adds a node; a stacked lead-time bar.
5. **Skaliranje po dubini reda.** KEDA; klopa-worker scales to zero at night and wakes on the first message.
6. **Vertikalno.** VPA recommendations; in-place resize; why it shouldn't be mixed with HPA on CPU.
7. **Planirani prekidi.** A drain respects the PDB; a crash ignores it.

**Flagship: „Preživi ručak”.** SIM 4 as in sim-models.
- App: request 500m / 256Mi, limit 1000m, 25 ms CPU per request, target 50 %, min 2 / max 20.
- Traffic presets: steady / spike 20 → 100 / daily sine / flash crowd.
- Nodes 2 vCPU / 8 GiB with 3 app Pods each.
- CA scans every 10 s; node provisioning 75 s, badged „sim · stvarno: minute”.
- Speed 1×–30×.
- Live formula, p95, drops, Pending, €/h.
- KEDA panel for klopa-worker.
- Validated timeline:
  - 2 → 3 → 7 (capped by the +4 policy) → 9
  - a node added at t = 80, Ready at t = 155
  - stays at 9 because of the dead band
  - scale-down at t = 720
- Goals:
  - p95 < 300 ms through the spike at the lowest €.
  - Explain "9, not 10".
  - Scale workers to zero and back.

**Kod:**
- `hpa.yaml` (`autoscaling/v2` + `behavior`); the Deployment's requests
- `kubectl get hpa -w`, `kubectl top pods`
- `pdb.yaml`
- VPA (`updateMode: InPlaceOrRecreate`, add-on)
- KEDA ScaledObject with a RabbitMQ trigger (`keda.sh/v1alpha1`)
- Karpenter NodePool / CA flags in a DeepDive

**Zablude:**
- „HPA dodaje čvorove”.
- „CA reagira na visok CPU”.
- „HPA na CPU-u može na nulu”.
- „HPA ne može na nulu” (outdated).
- „VPA `Auto`”.
- „PDB štiti od pada čvora”.
- „Skaliranje je trenutačno”.

---

#### L20 · Uvid u sustav: metrike, logovi, tragovi i otklanjanje kvarova
*slug `observability` · 50 min · KCNA: Observability; Troubleshooting; Debugging*

**Purpose.** How do we know what is happening? Three pillars:
- **Metrics:** Prometheus pull / scrape, counter / gauge / histogram, RED / USE, alerting, SLI / SLO / error budget.
- **Logs:** stdout → node → a collector DaemonSet → a store; why `kubectl logs` isn't enough.
- **Traces:** OpenTelemetry spans; W3C `traceparent` propagation; the Collector; correlation by trace_id.

It also turns the `kubectl` verbs from earlier lectures into a **systematic troubleshooting method**: get → describe → events → logs (`--previous`) → `kubectl debug` (ephemeral containers). Each symptom maps to the lecture that explains it.

**Pain.** „Upozorenje: p95 > 1 s. Nitko ne zna koji je od sedam servisa spor; logovi su nestali s restartanim Podom; `kubectl get pods` kaže da je sve Running.”

**Uvodi:**
- observability vs monitoring; metric types
- Prometheus (scrape, `/metrics`, service discovery); PromQL (one example); Grafana; Alertmanager
- RED / USE; SLI / SLO / error budget; burn-rate (one line)
- structured logs; log pipeline
- trace / span; OpenTelemetry; propagation; Collector
- `kubectl debug`; troubleshooting flowchart
- metrics-server ≠ monitoring

**Treba:** L01 (percentiles), L02 (availability budget), L10–L19 (every failure mode), L12 (DaemonSet), L16 (CRDs, e.g. ServiceMonitor)

**Scenes:**
1. **Tri stupa.** Metrics say *that* something is wrong, traces say *where*, logs say *why*.
2. **Prometheus vuče.** A scrape every 15–30 s; counter → rate.
3. **Prosjek opet laže.** Fan-out to 50 calls means p99 dominates page latency.
4. **Kako nastaje trag.** Spans with parent IDs; a header carries the context.
5. **Logovi preživljavaju Pod.** The collection pipeline vs the limits of `--previous`.
6. **SLO i budžet pogrešaka.** 99,9 % ≈ 43 min per 30 days (callback to L02).
7. **Metoda.** An interactive flowchart, symptom → command → cause:
   - Pending → L11
   - ImagePullBackOff → L06 / L10
   - CrashLoopBackOff / OOMKilled → L10 / L11
   - 0 endpoints → L13
   - stalled rollout → L14
   - 403 → L15
   - stale config → L16
   - Pending PVC → L18
   - HPA not scaling → L19

**Flagship: „Lov na uzrok”.**
- Services: gateway → api → payments → db, plus worker / queue.
- A seeded hidden fault: slow query, memory leak with OOM restarts, bad deploy with 5 % errors, CPU throttling, selector typo, readiness flapping.
- Linked Metrics / Logs / Traces panes plus a simulated `kubectl` console with realistic canned output.
- Students submit a hypothesis and get feedback with the real mechanism.
- Goal: solve 3 seeds.

**Kod:**
- a Prometheus scrape config / ServiceMonitor
- PromQL: `histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{service="klopa-api"}[5m])))`
- OpenTelemetry Node.js SDK auto-instrumentation
- an OpenTelemetry Collector pipeline (receivers / processors / exporters)
- `kubectl debug -it pod/… --image=busybox:1.37 --target=api`
- a troubleshooting cheat sheet

**Zablude:**
- „Prosjek je dovoljan”.
- „Running = zdravo”.
- „Logovi ostaju u klasteru zauvijek”.
- „Nadzor = observability”.
- „Više upozorenja = sigurnije”.
- „metrics-server je sustav za nadzor”.

---

### Modul 6 — Isporuka softvera

#### L21 · Što je isporuka: okruženja, artefakti i strategije
*slug `strategije-isporuke` · 55 min · KCNA: Application Delivery*

**Purpose.** The lecturer's "what is deployment", in full:
- **deploy** (an artifact running in an environment) vs **release** (users get it) vs **Deployment** (the object)
- environments dev / staging / prod
- **build once, promote the same digest**, configure per environment (L16)

Per-environment manifests without copy-paste:
- **Kustomize** base / overlays (`kubectl apply -k`)
- **Helm** charts / values / `helm template` / releases; Helm 4
- Helm then reveals how the lab's add-ons were installed

Strategies:
- Recreate; Rolling (L14)
- **Blue-green**: flip a Service selector (L13) or a Gateway backend (L17)
- **Canary**:
  - a replica ratio is approximate and per connection
  - Gateway weights are precise
  - automated analysis and abort with **Argo Rollouts**, a CRD and controller

Also:
- feature flags: deploy ≠ release (OpenFeature in one line)
- expand / contract DB migrations
- what makes a rollback unsafe

**Pain.** „v1.5 (vegetarijanski meni) ima bug koji se vidi tek sa stvarnim prometom. Rolling update ga je za 30 s raširio svima. A produkcijski YAML je kopija stagingovog s 14 razlika koje je netko zaboravio.”

**Uvodi:**
- deploy / release; environment; promotion; artifact immutability
- Kustomize (base, overlay, patch, `images:`)
- Helm (chart, values, templates, release, repository / OCI chart)
- blue-green; canary; progressive delivery; Argo Rollouts (Rollout, analysis)
- feature flag; expand / contract; blast radius

**Treba:** L06 (digest), L13 (selector), L14 (rollout, compatibility), L16 (config per environment, CRDs), L17 (weights), L20 (error-rate metrics for analysis)

**Scenes:**
1. **Tri riječi.** deploy / release / Deployment.
2. **Okruženja i promocija.** The same digest goes dev → staging → prod; „rebuild za prod” produces a different artifact.
3. **Jedna aplikacija, tri okruženja.** Kustomize overlays as transparent sheets (callback to L06 layers); Helm values → rendered YAML; diffs shown as small multiples.
4. **Četiri strategije, isti bug.** This is the flagship.
5. **Kanarinac, precizno.** Replica ratio (1 of 10 Pods ≈ 10 % of *connections*) vs a 1 % Gateway weight; automated abort.
6. **Isporuka ≠ izdanje.** Flags: 1 % → staff → everyone, without redeploying.
7. **Baza ne ide unatrag.** Expand / contract, done in three steps.

**Flagship: „Četiri strategije, isti bug”.**
- Four lanes on the same seed: Recreate, Rolling, Blue-Green, Canary.
- The bug rate is scrubbable, or hidden.
- Canary steps 5 → 25 → 50 → 100 with an error-rate threshold.
- Per-lane metrics: downtime, users hit, extra €, time to roll back, mixed-version window.
- Goals:
  - Fewest users hit within a € budget.
  - In hidden mode, catch the bug before 10 % exposure.

**Kod:**
- `kustomization.yaml` base plus `overlays/prod`; `kubectl kustomize overlays/prod`
- a Helm chart tree, `values-prod.yaml`, `helm template`, `helm upgrade --install`
- the add-on installs the lab used (ESO, Gateway controller, KEDA, Prometheus)
- a blue-green selector patch
- HTTPRoute weights at 95/5
- Argo Rollouts canary steps (`argoproj.io/v1alpha1`, Gateway API plugin)
- feature-flag pseudocode

**Zablude:**
- „Deploy = release”.
- „Rollback je uvijek siguran”.
- „Canary / blue-green su ugrađeni u Deployment”.
- „Staging prošao = produkcija radi”.
- „Kubernetes treba Helm” (the cluster only ever sees YAML).
- „Canary po replikama je precizan”.

---

#### L22 · CI/CD: od commita do imagea u registru
*slug `ci-cd` · 50 min · KCNA: Application Delivery; Security (supply chain)*

**Purpose.** The definitions:
- **CI** is a *practice*: integrate to the mainline at least daily, automated build and tests.
- **Continuous Delivery**: always releasable; the release is a business decision.
- **Continuous Deployment**: every change goes to production automatically. It requires Continuous Delivery.

The pipeline as code (GitHub Actions / GitLab CI):
- triggers, jobs, steps, runners, parallelism, cache

Stages:
- lint → tests → build image (L06) → scan / SBOM / sign → push tagged with the Git SHA / semver, with the digest recorded → promotion (L21)

Secrets in CI:
- **OIDC** short-lived tokens instead of long-lived keys
- pin third-party actions to a commit SHA

The push deploy model and its costs:
- CI holds cluster credentials (RBAC from L15)
- the cluster can drift
- This sets up L23.

DORA four keys.

**Pain.** „Isporuke idu s Ivanova laptopa petkom navečer; testovi se pokreću ‚kad se sjetimo’; nitko ne zna koji je commit u produkciji.”

**Uvodi:**
- CI; mainline / trunk; integration hell
- Continuous Delivery vs Continuous Deployment
- pipeline; trigger; job; step; runner; cache
- tag strategy (SHA / semver / digest)
- vulnerability scan; SBOM; signing (Sigstore / cosign)
- OIDC federation; action pinning
- push vs pull deploy (the question)
- DORA metrics

**Treba:** L06 (build / push / digest), L15 (ServiceAccount / RBAC), L16 (secrets), L21 (environments, promotion, release)

**Scenes:**
1. **Pakao integracije.** Long-lived branches vs daily small merges.
2. **Pokretna traka.** Pipeline stations; a red test stops the line.
3. **Delivery ili Deployment?** A slider for where the human gate sits.
4. **Što izlazi iz pipelinea.** A digest-stamped artifact card.
5. **Lanac opskrbe.** A scan gate, an SBOM, a signature check.
6. **Tajne u pipelineu.** A long-lived key vs a short-lived OIDC token.
7. **Tko gura u klaster?** CI holds a kubeconfig (key icon) and runs `kubectl apply`. Someone edits the cluster by hand and drift appears. The open question leads to L23.

**Flagship: „Tvornica commitova”.**
- An assembly line.
- Commit types: ispravan / pada test / ranjiva bazna slika / flaky test / tajna u kodu.
- Toggles: parallelism, cache, skip tests, gate position.
- A DORA panel.
- Goals:
  - Lead time under 10 min with all gates on.
  - 0 incidents over 20 commits.
  - Catch the leaked secret before the push.

**Kod:**
- `.github/workflows/ci.yml`:
  - triggers on push / PR
  - `permissions: {contents: read, packages: write, id-token: write}`
  - test job and build job
  - `docker/build-push-action` tagging with `${{ github.sha }}`
  - actions pinned by SHA
- `.gitlab-ci.yml` equivalent (stages)
- a scan step (Trivy or Grype)
- `cosign sign` (keyless)
- the push-model deploy step shown *as the contrast*

**Zablude:**
- „CI/CD je alat”.
- „CD uvijek znači automatski u produkciju”.
- „CI = build, testovi neobavezni”.
- „Pipeline neka radi `kubectl apply` u produkciju”.
- „Build po okruženju je u redu”.
- „Dugovječni ključevi u CI-ju su u redu”.

---

#### L23 · GitOps i Argo CD: Git kao izvor istine
*slug `gitops-argo-cd` · 55 min · KCNA: Application Delivery (GitOps)*

**Purpose.** The reconciliation loop, one level up.
- The **OpenGitOps** principles: declarative, versioned & immutable, pulled automatically, continuously reconciled.

**Argo CD:**
- the **Application** CRD (source repo / path / revision → destination cluster / namespace)
- **target vs live** state
- **sync status** (Synced / OutOfSync) and **health** (Healthy / Progressing / Degraded / Suspended / Missing / Unknown) are separate dimensions
- **refresh** polls every **120 s + up to 60 s jitter**; webhooks are faster
- auto-sync; **prune and selfHeal are off by default** (selfHeal reverts after 5 s)
- rollback = **`git revert`**
- sync waves / hooks (a migration Job at wave −1, from L12)
- it renders Helm / Kustomize (L21) with `helm template`, and **Argo CD owns the lifecycle**
- AppProject (scoping, like L15)
- ApplicationSet (one line)
- architecture: API server, repo-server, application-controller, Redis

The CI/CD split: CI builds and commits the new tag to the config repo; Argo CD pulls.

Secrets in GitOps follow Argo CD's official position: secrets live in the destination cluster (Sealed Secrets / ESO / CSI from L16), not in manifest-generation plugins.

The HPA conflict (L19) is solved with `ignoreDifferences` or by not storing `replicas` in Git. Flux is the CNCF-graduated alternative.

**Pain.** „Netko je u 12:00 ručno pokrenuo `kubectl scale --replicas=10` i zaboravio; produkcija se razlikuje od Gita; CI drži cluster-admin vjerodajnice; nitko ne zna što točno radi.”

**Uvodi:**
- GitOps; OpenGitOps principles; app repo vs config repo
- Application; target / live; refresh vs sync; Synced / OutOfSync; health statuses
- auto-sync; prune; selfHeal; drift; polling / webhook
- sync waves / hooks; AppProject; ApplicationSet
- Argo CD architecture; image-tag bump (bot commit); ignoreDifferences; Flux

**Treba:** L08 (loop), L12 (Job), L14 (rollout), L15 (RBAC), L16 (secret tooling, CRDs), L19 (HPA), L21 (Kustomize / Helm, release), L22 (CI, push model)

**Scenes:**
1. **Push vs pull.** Where the credentials live; which way the firewall arrows point.
2. **Četiri načela.** Cards.
3. **Termostat čija je postavka u Gitu.** Nested loops: the L08 thermostat → Deployment controller → Argo CD.
4. **Sinkronizacija ≠ zdravlje.** Synced-but-Degraded vs OutOfSync-but-Healthy.
5. **Odbjegla promjena.** A manual scale → OutOfSync; selfHeal off / on; prune off / on.
6. **Povratak je `git revert`.** The audit trail in the commit graph.
7. **Redoslijed.** Sync waves: a migration Job (−1) runs before the Deployment (0).
8. **Tajne u GitOpsu.** What goes into Git (SealedSecret / ExternalSecret) and what never does.

**Flagship: „Git je istina”.**
- Left: the Git repo (file tree + commit graph). Right: the cluster in Argo CD's tree (Application → Deployment → ReplicaSet → Pods + Service) with sync and health badges.
- A poll countdown ring (120 s + jitter, compressed and badged); webhook / auto-sync / selfHeal / prune toggles.
- A CI bot-commit lane.
- Break-it buttons: manual `kubectl scale`, delete the Deployment, delete a file from Git, bad commit (Degraded), the HPA fighting `replicas`.
- Goals:
  - A commit live in under 5 s of sim time (webhook).
  - Drift reverts itself.
  - Roll back the bad commit the GitOps way.
  - Stop Argo CD and the HPA from fighting.

**Kod:**
- `application.yaml` (`argoproj.io/v1alpha1`; `syncPolicy.automated` with `prune` / `selfHeal`; `CreateNamespace=true`)
- `appproject.yaml`
- the config-repo tree (`apps/klopa-api/base`, `overlays/prod`)
- the CI tag-bump step (`kustomize edit set image` + commit)
- the `argocd.argoproj.io/sync-wave` annotation
- `ignoreDifferences` on `/spec/replicas`
- install: `kubectl create namespace argocd && kubectl apply -n argocd --server-side --force-conflicts -f …/v3.5.3/manifests/install.yaml`
- `argocd app get / diff / sync`

**Zablude:**
- „Argo CD gradi i testira kod”.
- „Reagira odmah”.
- „GitOps = YAML u Gitu”.
- „Moja ručna promjena ostaje”.
- „Rollback klikom u UI-ju”.
- „Argo CD radi `helm install`”.
- „Auto-sync po zadanome briše i vraća”.
- „Tajne preko argocd-vault-plugina”.
- „Argo CD zamjenjuje kontrolere”.
- „Flux je umro s Weaveworksom”.

---

#### L24 · Završni projekt: put jednog commita i jednog zahtjeva
*slug `zavrsni-projekt` · 60 min · KCNA: Ecosystem & Principles; Community & Collaboration; Administration; full review*

**Purpose.** Integrates everything into two traversals and a "break it and diagnose" challenge deck. It also adds the KCNA material that only makes sense once the whole picture exists:
- **Open standards**: OCI, CRI, CNI and CSI, all already met, shown as swappable sockets.
- **CNCF** and project maturity: sandbox / incubating / graduated, with course examples (containerd, Argo, Flux and KEDA are graduated; ESO and SOPS are sandbox).
- How Kubernetes is made: SIGs, KEPs, **3 releases a year, 3 supported minors (≈ 1 year each)**, version skew and upgrades.
- Sustainability case studies: the ingress-nginx retirement; ESO's pause and resume.
- Personas: developer, platform engineer, SRE. Cost awareness.
- What to learn next: service mesh, multi-cluster, Helm in depth, CKA / CKAD / KCNA.

**Pain.** „Dan izdanja, 11:55: commit koji ispravlja PDV mora stići do korisnika prije ručka. Prati ga — a kad nešto pukne na bilo kojem koraku, pronađi mehanizam koji te štiti.”

**Uvodi:** only the CNCF maturity levels, SIG / KEP, release cadence / support window / upgrades and version skew, personas, and platform engineering (one line). Everything else is recall.

**Treba:** all of L01–L23

**Scenes:**
1. **Put jednog commita.** PR → CI → digest → bot commit → OutOfSync → sync → new ReplicaSet → scheduler → kubelet pulls only the changed layers → probes → EndpointSlice → traffic.
2. **Put jednog zahtjeva.** DNS → cloud LB → Gateway (TLS, HTTPRoute) → Service → node rules → Pod → config from a Secret → Postgres StatefulSet → a queue publish → the worker. A trace waterfall accumulates along the way.
3. **Što ako ovdje pukne?** Per hop, the mechanism that protects you and the lecture that taught it.
4. **Mapa koncepata.** The course's dependency graph lights up.
5. **Otvoreni standardi.** Swap containerd ↔ CRI-O or one CNI for another; nothing above the socket changes.
6. **Kako nastaje Kubernetes.** SIGs, KEPs, cadence, support windows, upgrades; sustainability cases.
7. **Uloge i daljnji put.**

**Flagship: „Dan izdanja u 11:55”.**
- A scrubbable end-to-end replay whose stations open mini versions of earlier sims.
- A seeded „Pokvari!” deck:
  - selector typo
  - missing TLS Secret
  - HPA without requests
  - liveness probe that checks the DB
  - drift with selfHeal off
  - image tag typo
  - a PDB blocking a drain
  - a NetworkPolicy blocking api → db
  - an env Secret left stale after rotation
- Students diagnose with the L20 method; scored.
- A final symptom ↔ cause drag-match.

**Kod:** the complete, consistent Klopa config repo as a browsable tree (every manifest from the course); a KCNA self-assessment checklist; `kubectl version` with a skew note.

**Zablude:** the course's top 10 recap, plus:
- „Kubernetes je operacijski sustav podatkovnog centra”, with its caveat.
- „Graduated = bez rizika”.

---

## 3. Concept ledger

Format: concept → **home lecture** (later reuse).

**Networking and requests**
- DNS / IP / port / bind address → **L01** (L07, L13, L17)
- HTTP status codes 502 / 503 / 504 → **L01** for 503 and timeouts; 502 comes with the proxy in **L03**
- L4 vs L7; per-connection; TLS termination → **L03** (L13, L17)

**Capacity and measurement**
- CPU vs RAM server model → **L01** (L03, L11, L13, L19)
- percentiles, utilisation curve → **L01** (L03, L04, L19, L20)

**Distributed-systems basics**
- SPOF, availability math, N+1 → **L01 / L02** (L03, L12, L20)
- stateless / stateful; replication → **L02** (L03, L08, L18)
- health check (generic) → **L03** (L07, L10, L13)
- idempotency, at-least-once, DLQ, queue depth → **L04** (L19, L24)

**Containers**
- namespaces, cgroups, OOM, throttling → **L05** (L07, L11, L15)
- OCI → **L05 / L06** (L09 CRI, L24)
- image, layer, tag, digest, registry → **L06** (L10, L14, L21, L22)
- env-var config, volumes (Docker), DNS by name → **L07** (L13, L16)
- declarative description → **L07 taste, L08 threshold**

**Kubernetes core**
- desired state, reconciliation, generic controller → **L08** (every later Kubernetes lecture)
- control plane, kubelet, CRI, API object, Namespace, kubectl → **L09**
- *Pod*: one-sentence definition in **L09**, full treatment in **L10** (exception 1)
- labels / selectors, probes / Ready, CNI, termination → **L10** (L12–L14, L19)
- requests / limits, QoS, taints / tolerations, Pending → **L11** (L12, L15, L19)
- ReplicaSet / Deployment / DaemonSet / Job → **L12**; the generic replica controller is named here (exception 2) (L14, L20, L23)

**Kubernetes networking, delivery and security**
- Service, EndpointSlice, kube-proxy, CoreDNS → **L13** (L14, L15, L17, L18, L21)
- rollout mechanics → **L14** (L21, L23)
- authn / authz / admission, RBAC, ServiceAccount, PSA, NetworkPolicy, quota → **L15** (L16, L22, L23)
- ConfigMap / Secret, encryption at rest, **CRD / operator** → **L16** (L17–L23)
- Gateway API → **L17** (L21, L24)

**State, scaling, observability**
- PV / PVC / StorageClass / CSI / StatefulSet → **L18**
- HPA / CA / VPA / KEDA / PDB / `metrics.k8s.io` → **L19** (L23)
- observability stack, troubleshooting method → **L20** (L24)

**Delivery**
- Helm / Kustomize, deploy vs release, strategies → **L21** (L23)
- CI, Continuous Delivery / Deployment, OIDC, supply chain → **L22** (L23)
- GitOps / Argo CD → **L23**
- CNCF governance, cadence → **L24**

---

## 4. KCNA coverage matrix

| Domain (weight) | Topic | Lectures |
|---|---|---|
| Fundamentals (44 %) | Core Concepts | L08, L09, L10, L12, L13, L16 |
| | Administration | L09 (kubectl, kubeconfig, managed vs self-hosted), L15 (quota), L24 (upgrades, skew) |
| | Scheduling | L11, L12 (DaemonSet), L19 |
| | Containerization | L05, L06, L07, L09 (CRI) |
| Orchestration (28 %) | Networking | L10 (CNI), L13, L15 (NetworkPolicy), L17 |
| | Security | L15, L16, L22 (supply chain) |
| | Troubleshooting | L09–L19 (verbs at first need), L20 (method), L24 (challenge deck) |
| | Storage | L18 |
| App Delivery (16 %) | Application Delivery | L14, L21, L22, L23 |
| | Debugging | L20, L24 |
| Architecture (12 %) | Observability | L20 |
| | Ecosystem & Principles | L02, L08, L19 (autoscaling, serverless), L24 (open standards) |
| | Community & Collaboration | L24 |

Lecture time roughly tracks the weights: about 45 % of course hours fall in Modules 2–3 plus L11–L12.

---

## 5. Why this order

1. **Why before how (M1 before M2 before M3).** Without the pain of one server (L01) and the cost of many (L02), Kubernetes looks like bureaucracy. L01 absorbs the network minimum because ports, DNS and bind addresses are prerequisites for L03, L07 and L13. It is not a separate lecture, which keeps the count at 24.
2. **Load balancer (L03) before queues (L04).** Push balancing is the baseline that makes pull consumption, and its different failure modes, legible.
3. **Load balancer (L03) long before Service (L13).** A Service is "an L4 per-connection load balancer + discovery". Students who built the general model can see exactly what kube-proxy does *not* do: no weights, no request-level balancing.
4. **VM → image → running containers / Compose (L05–L07).**
   - cgroups in L05 are the foundation for `limits` in L11.
   - The runtime stack in L07 is the foundation for CRI in L09.
   - Compose is the first declarative file, and its fatal flaw (one host) is the motivation for L08.
5. **Reconciliation loop (L08) before any object.** Every later object is "another loop", so the loop is taught once and reused.
6. **Architecture (L09) right after L08, minimal.** It answers "who acts in the loop", with only enough Pod to make the walkthrough work.
7. **Probes inside the Pod lecture (L10).**
   - The restart-vs-no-restart contrast is a Pod-level fact.
   - The *Ready* condition is needed by L12's READY column and by L13 endpoints.
   - The L03 load balancer gives readiness a meaning before Services exist.
8. **Scheduling (L11) before Deployment (L12).** "Replicas ≠ machines → Pending" and node-failure timing (300 s tolerations) need requests and tolerations first. HPA (L19) needs requests too.
9. **Rolling update split from Deployment (L14 after L13).** A zero-downtime rollout depends on readiness *and* Service endpoint propagation (preStop). Mixed versions can only be shown once traffic flows through a Service. Most courses teach rollouts before Services and must hand-wave this.
10. **RBAC (L15) before Secrets (L16).** The central Secret facts are about access: `list` reveals content, and Pod creators can read Secrets. Teaching Secrets first would force a forward reference or drop the most important security lesson.
11. **CRDs introduced in L16.** That is the first point where a non-built-in kind is unavoidable (ExternalSecret / SealedSecret). Gateway API (L17), KEDA / VPA (L19), ServiceMonitor (L20), Argo Rollouts (L21) and the Argo CD Application (L23) then reuse it.
12. **Gateway API (L17) after Secrets (L16).** An HTTPS listener references a `kubernetes.io/tls` Secret, and Gateway API is itself CRDs + a controller. Putting it right after Service would forward-reference both.
13. **Storage and StatefulSet (L18) late.** They need headless Services (L13), DB-password Secrets (L16), node-failure behaviour (L12) and the operator concept (L16) to explain "replicas ≠ replication" honestly.
14. **Autoscaling (L19) after everything it composes.** It combines requests (L11), Ready-only traffic (L13), queue depth (L04), CRDs (L16 for KEDA / VPA) and node drain. PDB is introduced at its first real need, Cluster Autoscaler scale-down.
15. **Observability (L20) as a capstone of Module 5.** The `kubectl` debugging verbs were introduced at first need throughout. L20 formalises them into a method only once every failure mode it diagnoses exists.
16. **What deploying means (L21) → CI/CD (L22) → GitOps (L23).**
    - Continuous Delivery is defined through "release is a business decision", so deploy vs release must come first.
    - "Build once, promote" needs environments.
    - GitOps needs CI's output (a digest), Kustomize / Helm (L21) and the push-model problem (L22).
    - Helm sits in L21 because per-environment configuration is the first pain it solves. Add-ons used earlier were pre-installed so that `helm install` never appears before it is taught.
17. **Ecosystem and community at the end (L24).** CNCF maturity, open standards and release governance only mean something once students have met OCI, CRI, CNI, CSI and a dozen CNCF projects.

---

## 6. What was cut, merged or reduced

**Merged**
- Network minimum → L01.
- Caching, replication and CAP → L02 scene + DeepDive. There is no separate "state" lecture; the payoff is in L18.
- DaemonSet, Job and CronJob → L12 gallery.
- Helm and Kustomize → L21. There is no standalone packaging lecture; Argo CD (L23) is where students actually use them.
- PDB → L19.
- Supply-chain security → L22.

**Reduced to one sentence or a DeepDive**
- Raft / consensus ("etcd uses Raft").
- kubeadm, cluster installation, certificates, etcd backup.
- iptables / nftables / eBPF internals.
- Pod anti-affinity / topology spread; priority / preemption.
- ValidatingAdmissionPolicy / Kyverno / OPA.
- service mesh.
- ApplicationSet.
- Flux (comparison only).
- Vault internals.
- KYAML; DRA / GPU scheduling.
- cost tooling.

**Cut entirely**
- Docker Swarm.
- Windows containers.
- multi-cluster.
- writing operators / Helm chart authoring in depth.
- logical / vector clocks; formal CAP / PACELC.
- Kafka internals beyond partitions, groups and offsets.
- microservice patterns (sagas, outbox) beyond one mention of the outbox in L04.
- Jenkins / Tekton beyond a mention.
- Pod checkpointing.
- Ingress controller comparisons.

**Justification.** These are either outside KCNA, or depend on concepts the target students won't have (consensus proofs), or are installation and operations skills that would teach clicking rather than the mental model. Each would add nouns without adding a dependency any later lecture needs.

**Shorter variant (if needed).** L15, L18 and L20 can be marked "KCNA+" and made optional, which gives 21 core lectures. If L15 is dropped, L16 must absorb a two-scene RBAC minimum: the pipeline strip and the get / list / Pod-creation trap. L24's community section can likewise shrink to a fact page.

---

## 7. Flags for the synthesiser

1. **Form of address.**
   - `docs/AUTHORING.md` mandates "ti" with gender-neutral phrasing.
   - The terminology research recommends "vi".
   - This plan follows AUTHORING.md. The terminology glossary forms (Podovi, Deploymenta, Servicea…) are compatible with both.
2. **Requests in examples.**
   - AUTHORING.md requires `resources.requests` in all YAML.
   - Under this ordering, L10's Pod YAML predates requests (L11).
   - Recommendation: allow the omission in L10 only.
3. **Versions to verify when each lecture is authored:**
   - the ESO API version (`external-secrets.io/v1` under ESO v2.x)
   - the current Node LTS base image (L06)
   - the PostgreSQL / Redis / RabbitMQ image tags (L07)
   - the GitHub Action major versions (pin by SHA anyway)
   - Gateway API v1.6.x and Argo CD v3.5.x install URLs
   - Karpenter / KEDA / VPA API versions in code blocks
4. **Compressed-time badges are mandatory** in L03 (health checks), L12 (node eviction), L18 (attach / detach), L19 (node provisioning, windows) and L23 (Argo CD polling).