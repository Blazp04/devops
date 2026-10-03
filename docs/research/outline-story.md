# Narrative-first curriculum: „Kubernetes od nule”, following the Klopa story

**Lens:** one running story. Each lecture opens with an incident that the previous lecture's solution caused, or failed to prevent, and closes on the price of its own solution. That price becomes the next lecture's incident. The design aims for motivation and for one clear „aha” per lecture.

**Size:** 24 lectures in 5 modules, about 18.5 h of self-paced study. A shortened path of 18 lectures is described in the justification at the end.

---

## 0. Story bible (shared by every lecture)

### Setting
- **Klopa** is a fictional app built by students for lunch pre-orders at the campus canteen ("menza"). Students order before lunch and pick the meal up.
- Every day at 12:00 there is a natural traffic spike. Two recurring special events push it further:
  - **„Ćevap-petak”**, a Friday promotion that works as a flash crowd.
  - **Exam week** ("ispitni rok"), when traffic grows for a whole week.
- No real institution, payment system or domain is used:
  - Domain: `klopa.example` (a reserved name, RFC 2606).
  - Registry: `registry.klopa.example`.
  - Kubernetes names: `klopa-web`, `klopa-api` (Node.js/TypeScript), `klopa-worker`, `postgres`, `redis`, `rabbitmq`.
  - Namespaces: `klopa` and later `klopa-staging`.

### Cast
All characters are fictional and gender-balanced. They appear in short speech bubbles, which are the only place colloquial verbs like „deployati” are allowed.
- **Lana**: backend developer, writes most of the code.
- **Davor**: the "server person", on call, gets woken at 03:00. His Erasmus exchange later creates a bus-factor problem.
- **Petra**: product. She brings requirements from the canteen, such as SMS notifications, a vegetarian menu and menu photos.
- **Iva**: new teammate who joins in L06. She brings fresh eyes and new mistakes.
- **Teta Mira**: the kitchen. She is the voice of physical consequences („Dvaput ćevapi za istu narudžbu?!”).

### Narrative devices (built once, reused in every lecture)
1. **Incident card** at the top of each lecture. It shows the incident number, day and time, the symptom, a three-metric snapshot (req/s, p95, errors), and who got paged.
2. **„Cijena rješenja” box** at the end of each lecture. It names what the new solution costs or leaves unsolved. That becomes the next incident, and the chain is visible in a course-wide timeline.
3. **Klopa karta.** A persistent architecture map that grows. The new component animates in during the recap, and clicking any component jumps back to the lecture that introduced it.
4. **Dnevnik odluka** (decision log). One line per lecture: „Odluka #N: … Dobili smo … Platili smo …”. The capstone replays the whole log.
5. **Davorov dežurni priručnik** (on-call runbook). From L11 on, every lecture adds symptom → cause → command entries. The finished runbook can be downloaded in L24.
6. **Simulator callbacks.** The same simulation engine returns later with a new control unlocked. This makes the narrative continuity concrete:

| Engine | Lectures |
|---|---|
| Load balancer | L02 (one server) → L04 → L05 → L13 („Kubernetes Service” mode) |
| Queue | L06 → L17 (zombie worker) → L18 (scaling on queue depth) |
| Rollout | L12 → L13 (readiness unlocked) → L20 (strategies) |
| Reconciliation loop | L10 → L11 → L22 (the loop "one level up") |
| Secret threat model | L15 → L23 (GitOps options unlocked) |
| Scheduler | L16 → L18 (cluster autoscaler) |

### Visual grammar
Follow AUTHORING.md:
- Desired state is a dashed ghost; actual state is solid.
- v1 is blue, v2 is violet, a broken build is rose.
- Errors are spiky, timeouts are hollow.
- Requests move linearly; layout changes use springs.
- Compressed time is always labelled: `2 s (sim) · stvarno: 30 s`.

---

## MODUL 1: Zašto raspodijeljeni sustavi (L01–L06, blue)

### L01 · Klopa izlazi na internet: put jednog zahtjeva
`id 01 · slug klopa-izlazi-na-internet · 30 min · preduvjeti: –`

**Purpose.** This lecture pre-trains the networking names that cause most later confusion: localhost, IP, port, DNS, HTTP request and response, and binding to 127.0.0.1 vs 0.0.0.0. Port mapping in Docker, ClusterIP and Service DNS all rely on them. It also introduces the cast and the story, and shows a 30-second trailer of the finished system. Finally, it defines „deploy” informally as "getting a version of the code running somewhere users can reach it". This is the first of the four meanings of the word, which L20 resolves.

**Pain (Incident #1).** Klopa runs on Lana's laptop at `localhost:3000`. She sends Petra the link. Petra replies: „Ne otvara se.”

**Scenes**
1. **Trailer „Kamo idemo”.** Zoom out from the final Klopa map (cluster, Argo CD, queue) down to a single laptop. The cast is introduced.
2. **Zašto Petra ne vidi localhost.** A request leaves Petra's phone and loops back into her own phone. Loopback is explained as "this machine only".
3. **Anatomy of a URL.** A dissector: click `https`, `klopa.example`, `:443`, `/narudzba` to see what each part does.
4. **Put zahtjeva (stepper).** DNS lookup → IP → TCP connection to a port → HTTP request → response. The packet carries a label showing source and destination.
5. **IP and port as building and apartment number.** The analogy breaks down because a port is not a security boundary, and only one process can listen on a given IP:port.
6. **First deploy.** Rent a 2 GB VPS, ssh in, `git clone`, run the app, add a DNS A record. Code travels from the laptop to the server.
7. **Klopa karta v1.** User → DNS → VPS (app + Postgres). Bridge to the next lecture.

**Flagship: „Put jednog zahtjeva”.** An interactive request tracer with break-it toggles. Each break produces a different visible failure:

| Break-it toggle | What the student sees |
|---|---|
| Krivi DNS zapis | NXDOMAIN |
| Vatrozid zatvara port | timeout (hollow glyph) |
| Aplikacija ne radi | connection refused (spiky glyph) |
| Aplikacija sluša na 127.0.0.1 | refused from outside, OK from the server itself |
| (nothing broken) | 200 |

Goal: get Petra a 200. This plants the error vocabulary (refused vs timeout) used later for 502/504.

**Code (expandable)**
- A minimal Node server, with a diff between `listen(3000,'127.0.0.1')` and `listen(3000,'0.0.0.0')`.
- `curl -v https://klopa.example`, `dig klopa.example`, `ss -ltnp`.
- (closed) A minimal systemd unit.

**Misconceptions**
- "localhost is my server."
- "A domain points to my app." DNS gives only an IP; the port is separate and defaults to 80 or 443.
- "Connection refused means the server is down." It can also mean nobody listens on that port.
- "An IP address identifies one app."

**Aha.** Petra's phone and Lana's server each have their own localhost.

**Cijena rješenja → L02.** Everything runs on one machine. „Ponedjeljak, 12:00. Cijeli kampus otkrio je Klopu.”

---

### L02 · Ručak u 12:00: granice jednog servera
`id 02 · slug granice-jednog-servera · 40 min · preduvjeti: 01`

**Purpose.** This lecture gives students the performance vocabulary that every simulation uses from here on: req/s, throughput, latency, p50/p95/p99, error rate and utilisation. It builds three intuitions:
- Processor cores bound throughput; RAM bounds how many requests can be in flight at once.
- Latency grows non-linearly near 100 % utilisation.
- Vertical scaling works until it hits a ceiling. Each resize costs a restart, and one server stays a single point of failure.

**Pain (Incident #2).** At 12:00, p95 jumps from 80 ms to 9 s and timeouts follow. Davor runs `top`. A twist in the predict step: with the I/O-heavy workload, the server rejects requests while CPU sits at 15 %.

**Scenes**
1. **Incident replay.** A dashboard of the spike, showing metrics only.
2. **Jedan kuhar u kuhinji.** This is the anchor analogy for Module 1. Processor cores are the cook's hands; RAM is how many orders fit on the counter. The analogy breaks down because a server can fall over suddenly (OOM), while a cook tires gradually.
3. **„Prosjek laže”.** A histogram with a tail slider. The average barely moves while p99 explodes.
4. **Hokejska palica.** A utilisation slider drives a latency curve where W/S ≈ 1/(1−ρ): 2× at ρ = 0.5, 10× at 0.9, 100× at 0.99. Little's law goes in a „Za znatiželjne” box.
5. **CPU vs RAM.** The same server with different workload presets. For the I/O-bound preset, 2 → 4 → 8 GB gives about 5.7 → 13 → 27 rps. For the CPU-bound preset, more RAM changes nothing (about 10 rps at every size).
6. **Vertikalno skaliranje.** A catalogue of machine sizes that ends with „Nema većeg”. Each resize opens a downtime gap. Cost is roughly linear within an instance family; do not fake an exponential curve.
7. **„Isključi struju”.** Availability drops to 0, which shows the single point of failure.

**Flagship: „Jedan server protiv ručka”** (sim-models SIM 1, one server)
- Controls: vCPU 1–8, RAM 1–16 GB, workload preset (API / I/O-heavy / CPU-heavy), traffic slider, a „Ćevap-petak” spike, „Veći server” (resize with downtime), „Isključi struju”.
- Metrics: goodput, p50/p95/p99, and errors split into 503 and 504.
- Goals:
  - Survive lunch with p95 < 1 s and errors < 1 % on the cheapest machine.
  - Find a workload where more RAM doesn't help.

**Code (expandable)**
- An annotated `top` / `free -h` snapshot.
- (closed) A load test with `k6`, a 10-line script.

**Misconceptions**
- "More RAM means a faster server."
- "Latency grows linearly with load."
- "The average latency is good enough."
- "Vertical scaling is obsolete." It is often the right first move.
- "70 % CPU means 30 % headroom."

**Aha.** A server can be "full" while its processor is idle, because RAM ran out of room for in-flight requests.

**Cijena rješenja → L03.** Davor bought the biggest server. On Friday at 12:03 the power fails: two hours of downtime during lunch. Exam week will exceed even that server.

---

### L03 · Zašto raspodijeljeni sustavi – i koja je cijena
`id 03 · slug zasto-raspodijeljeni-sustavi · 40 min · preduvjeti: 02`

**Purpose.** This is the "why" the lecturer asked for. It gives three reasons to distribute:
- capacity beyond one machine,
- availability without a single point of failure,
- proximity to users.

It also lists when not to distribute. It defines *raspodijeljeni sustav*, mentioning *distribuirani* once. Then it shows the price: partial failure, an unreliable network, the impossibility of telling slow from dead, a shared bottleneck (the database), and availability maths that only works if failures are independent.

**Pain (Incident #3).** A two-hour outage. Davor: „Kupimo drugi server!” The lecture ends with a cliffhanger: the second server sits idle, because all users still resolve to server 1.

**Scenes**
1. **Incident and three reason cards.** Capacity, availability, geography.
2. **„Trebaš li uopće ovo?” checklist.** Many applications run fine on one server.
3. **Availability maths with scrubbable numbers.**
   - Series: two 99 % components give 98.01 %. Parallel: two 99 % components give 99.99 %.
   - A downtime-per-year table.
   - Toggling „isti ormar” (same rack) makes failures correlated, and the gain collapses.
   - N+1: two servers at 70 % become 140 % on the survivor.
4. **Brzina svjetlosti.** A map with lower-bound RTTs: Zagreb → Frankfurt ≥ 7.2 ms, → Sydney ≥ 160 ms. A new HTTPS connection costs at least 3 RTT.
5. **„Zašto 10× servera ≠ 10× propusnosti”.** A USL/Amdahl chart, labelled as a model. A shared database bar saturates as servers are added.
6. **„Spor ili mrtav?” game.** The student picks a timeout and sees the trade-off between false "dead" verdicts and waiting time. Six fallacy flip cards: lost, delayed, duplicated, reordered, limited bandwidth, partition.
7. **Cliffhanger.** „Dodaj drugi server” → the new server stays idle. Who distributes the traffic?

**Flagship: „Arhitekt dostupnosti”.**
- The student builds a chain (entry → app × N → database) and sets each component's availability.
- Toggles: shared rack/power, failover detection time, capacity per server.
- A Monte Carlo „godina u 10 sekundi” strip shows failures as red ticks, plus downtime per year and "lunches lost".
- Goals:
  - Reach 99.9 % for less than X €.
  - Discover that a single 99.9 % database dominates the whole chain.
  - Show why ten 99 % servers are "at least one down" about 9.6 % of the time.

**Code (expandable)**
- `curl --max-time 2` (timeout).
- `ping` / `mtr` to near and far hosts. Students run these themselves; no hostnames are hard-coded.
- (closed) A 10-line TS function for series and parallel availability.

**Misconceptions**
- "Two servers mean twice the capacity."
- "Distributed means automatically more reliable."
- "The network is reliable and has no latency."
- "Every application needs microservices or Kubernetes."
- "Two 99 % servers give 99.99 % for free." That needs independent failures, failover and N+1 capacity.

**Aha.** Redundancy only helps if failures are independent and the survivor has room to absorb the load.

**Cijena rješenja → L04.** We have two servers, and nobody distributes traffic between them.

---

### L04 · Load balancer: tko dijeli promet?
`id 04 · slug load-balancer · 55 min · preduvjeti: 02, 03`

**Purpose.** This is the lecturer's flagship request. It covers:
- what a load balancer does: a single entry point, spreading traffic, health checks, removing failed servers, draining;
- why "fair" depends on heterogeneous servers (2 GB vs 4 GB, cores vs RAM) and heterogeneous requests;
- the algorithm ladder;
- health-check detection windows;
- L4 (connections) vs L7 (requests), which plants the L13 payoff;
- the load balancer itself as a single point of failure.

**Pain (Incident #4).**
- The naive fix comes first: DNS with two A records. Clients cache the answer, load is uneven, and a dead server stays in DNS.
- Then the real load balancer.
- Then a mixed rack (1× Mali 1 vCPU / 2 GB, 2× Veliki 4 vCPU / 8 GB) under round robin kills Mali at 12:00.

**Scenes**
1. **Naive DNS round robin.** TTL caching gives uneven load, and users keep hitting a dead server. This is productive failure.
2. **Ručni balanser.** The student routes each request by clicking a server, then gets tired and presses „Automatski”.
3. **Predict, then the algorithm ladder.** Random → RR → WRR → least connections → advanced (P2C, least response time, IP hash).
4. **Heterogeneous servers and request mix.**
   - RR overloads Mali: validated at λ 15 → 2.7 % errors under RR vs 0 % under WRR.
   - WRR fixes a static difference but not „Spori disk”.
   - Least connections adapts on its own, but a server that fails fast becomes a black hole.
5. **Health checks.** The timeline highlights the detection window (interval × threshold). Active vs passive checks. „Isprazni” (drain) vs „Sruši”.
6. **L4 vs L7 envelope.** L4 sees IP:port and balances connections. L7 opens the envelope, routes by path and balances requests. Keep-alive pins a client to one server.
7. **„Tko balansira balanser?”** An HA pair with a floating IP, or a managed cloud load balancer.
8. **Teaser.** A user's cart empties on the next click.

**Flagship: „Balanser u tvojim rukama”** (sim-models SIM 1, validated numbers)
- **Rack builder:** Mali 1/2, Srednji 2/4, Veliki 4/8, or a custom server with vCPU 1–8 and RAM 1–16 GB.
- **Workload presets:** API / I/O-heavy / CPU-heavy.
- **Algorithms:** Ručno, Random, RR, WRR, LC, weighted LC; under „Napredno”: P2C and least response time.
- **Health checks:** interval and thresholds, shown as `2 s (sim) · stvarno: 30 s`.
- **Break-it:** Sruši (crash), Zamrzni (hang), Spori disk, Isprazni (drain), "unbounded workers" (OOM crash loop).
- **Metrics:** per-server CPU %, workers, RAM, queue; p50/p95/p99; errors split into 502, 503 and 504.
- **Comparison:** „Ponovi isti promet” re-runs the same seed for a fair comparison.
- **Goals:**
  1. 2× Mali + 1× Veliki at 15 req/s with < 1 % errors.
  2. Survive a crash with < 2 % errors (needs N+1 capacity and health checks).
  3. Find when 8 GB beats 4 GB (the I/O preset).
  4. Drain a server with zero errors.

**Code (expandable)**
- An nginx `upstream` with `weight`, `least_conn`, `max_fails` / `fail_timeout`. Note: open-source nginx only does passive health checks; active checks come with HAProxy, Envoy, NGINX Plus and cloud load balancers.
- App `/healthz` endpoint.
- (closed) HAProxy equivalent with active `check`.

**Misconceptions**
- "A load balancer makes each request faster."
- "Round robin is fair."
- "The load balancer knows instantly when a server dies."
- "A load balancer removes all single points of failure."
- "More RAM means more throughput."
- "Balancing is always per request."

**Aha.** Round robin doesn't know the servers are different, and a dead server can look like the least loaded one.

**Cijena rješenja → L05.** Carts live in server memory, so the next click lands on another server and the cart is empty. The load balancer is also a new component that can fail.

---

### L05 · Košarica koja nestaje: gdje živi stanje
`id 05 · slug gdje-zivi-stanje · 40 min · preduvjeti: 04`

**Purpose.** Stateless vs stateful. Sticky sessions are a workaround with costs; the fix is to move state into Redis or the database. The database then becomes the hard part: it is both the single point of failure and the bottleneck. The lecture covers cache-aside, read replicas with replication lag (read-your-writes), and a gentle CAP. Stateless services are the precondition for everything Kubernetes does later (Deployments, HPA).

**Pain (Incident #5).** „Dodam ćevape u košaricu, osvježim – prazno.” After a server restart, everyone is logged out.

**Scenes**
1. **Incident replay.** The cart lives on server 1; the next request lands on server 2.
2. **Sticky sessions toggle.** It works, but load becomes uneven. Killing the sticky server loses the cart. Scaling out doesn't rebalance existing users.
3. **External state.** Moving sessions to Redis makes replicas interchangeable. Analogy: rented scooters vs your own bike.
4. **The camera pans to the database.** All state is now in one place, which makes it both the single point of failure and the bottleneck (callback to the L03 chart).
5. **Cache-aside.** A hit-ratio slider drives average latency and database load (h = 0.9 → 3 ms and 10 % of the load). Stale data. Stampede in a „Za znatiželjne” box.
6. **Read replicas and lag.** Write `stanje=5`, then read from a replica too soon and get the old value. Toggle sync vs async replication.
7. **Partition (za znatiželjne).** Cut the link between replicas. CP refuses; AP answers stale data.

**Flagship: „Gdje živi košarica?”.**
- Three replicas behind a load balancer and 20 users whose carts appear wherever they are stored.
- Mode: local / sticky / Redis. Buttons: restart, add or remove a replica.
- Metrics: lost carts, load imbalance.
- Level 2: a replication-lag slider.
- Goals:
  - Zero lost carts while killing any replica.
  - Scale from 3 to 6 replicas without a single logout.

**Code (expandable)**
- A diff of an Express session store from memory to Redis.
- `redis-cli` look-up.
- (closed) Cache-aside pseudocode.

**Misconceptions**
- "Sessions just work behind a load balancer."
- "Sticky sessions solve it."
- "Stateless means the app has no data."
- "Read replicas scale writes."
- "The cache is always fresh."
- "CAP means always pick 2 of 3."

**Aha.** State never disappears; it only moves. Interchangeable servers are what make scaling trivial.

**Cijena rješenja → L06.** The API now does everything synchronously: save the order, print the kitchen ticket, send the SMS. At 12:00 the SMS gateway slows down.

---

### L06 · Redovi poruka: kad kuhinja ne stigne
`id 06 · slug redovi-poruka · 50 min · preduvjeti: 04, 05`

**Purpose.** The lecturer asked for event queues. The lecture covers:
- async decoupling: producer → queue → consumer;
- absorbing bursts;
- competing consumers as "load balancing by pull", contrasted with L04's push;
- ack and redelivery;
- at-least-once delivery, which leads to duplicates and then to idempotency;
- retries with backoff and jitter;
- a dead-letter queue (DLQ);
- ordering;
- queue vs pub/sub (events), and queue vs log (Kafka, briefly);
- backpressure, and λ > μ meaning the queue grows forever;
- UX: answer „202 – zaprimljeno” and notify later.

**Pain (Incident #6).**
- The SMS provider goes down, and with it all ordering.
- At Ćevap-petak, synchronous calls lose 152 of 445 orders (validated).

**Scenes**
1. **Incident.** One slow dependency in a synchronous chain takes everything down.
2. **Kuhinjska šina za listiće** (ticket rail). The analogy breaks down because real queues can duplicate messages.
3. **Burst: direct vs queue.**
   - Direct calls lose about 10 % at only 50 % utilisation (Erlang B), which is counter-intuitive.
   - With a queue, nothing is lost but latency grows.
4. **λ vs μ.** If arrivals outpace service, the queue grows without limit. Drain time = backlog / (kμ − λ).
5. **Ack timing.**
   - Two crash buttons: crash before the side effect, crash after the side effect but before the ack.
   - Visibility timeout.
   - Teta Mira: „Dvaput ćevapi!”
   - The fix is an idempotency key (order ID + unique constraint).
6. **Retries and the poison message.** Retries with jitter avoid synchronised waves. A poison message ends in the DLQ.
7. **Ordering.** Two workers at different speeds reorder messages. Kafka keeps per-key order within a partition (short sub-sim).
8. **Queue vs pub/sub vs log.** A `NarudzbaZaprimljena` event is copied to the kitchen, SMS and analytics. A log keeps messages, and replay works by resetting the offset.

**Flagship: „Kuhinja pod opterećenjem”** (sim-models SIM 2)
- Mode: direct / queue.
- Controls: λ, a „+100” burst, consumers k, service time, pFail, pPoison, maxDeliveries, backoff, visibility timeout, ack mode, idempotency, maximum queue length with an overflow policy.
- Metrics: depth, in-flight, age of the oldest message, end-to-end p50/p95, lost, duplicate side effects, DLQ, and a live Little's law panel.
- Goals:
  - Ćevap-petak with no lost order.
  - Drain the queue in < 30 s with the fewest workers.
  - Zero duplicates with a 2 s visibility timeout (needs idempotency; without it, 13 % are duplicates).
  - Get the poison message into the DLQ.

**Code (expandable)**
- An amqplib producer/consumer with manual ack after processing.
- `INSERT … ON CONFLICT (order_id) DO NOTHING`.
- A quorum queue with `x-delivery-limit` and a dead-letter exchange.
- A `rabbitmq` service snippet. Pin the tag and verify it when writing.
- (closed) A Kafka producer with a key.

**Misconceptions**
- "A queue makes processing faster."
- "Exactly-once delivery."
- "Messages are processed in order."
- "Async means nobody waits for the result."
- "Queue = pub/sub."
- "A failed message disappears or retries forever."
- Fact callouts: "Kafka needs ZooKeeper" (outdated: KRaft only since 4.0); "Kafka can't do queues" (outdated: share groups since 4.2).

**Aha.** A queue doesn't make work faster; it makes waiting safe. And "delivered twice" is normal, so the consumer must be idempotent.

**Cijena rješenja → L07.** Klopa now has six kinds of process (web, api, worker, Postgres, Redis, RabbitMQ) on three hand-configured servers. Iva joins: „Kod mene radi, na serveru ne.”

---

## MODUL 2: Kontejneri – pakiranje softvera (L07–L09, teal)

### L07 · „Kod mene radi”: od virtualnog stroja do kontejnera
`id 07 · slug vm-i-kontejneri · 45 min · preduvjeti: 02`

**Purpose.** The lecturer asked for containerisation compared with virtualisation. The historical arc runs physical server → VM → container, and each step solves a problem the previous one left:
- A VM is hardware virtualisation: each guest has its own kernel on a hypervisor.
- A container is an isolated process sharing the host kernel. Namespaces control what it can see; cgroups control what it can use.

Trade-offs: density, start-up time, isolation strength. In practice the two coexist, because cloud nodes are VMs running containers. Docker Desktop on Mac and Windows runs a Linux VM, and CPU architecture (arm64 vs amd64) matters.

**Pain (Incident #7).**
- Different Node versions on the laptop and the server.
- The api and the worker need conflicting libvips versions on the same server.
- server-2 was configured by hand and differs from server-1 ("snowflake").
- A new server takes Davor a day to set up.

**Scenes**
1. **Incident.** A dependency conflict on one host.
2. **Era 1 → Era 2.** One application per physical machine (waste, slow purchase) → VMs on a hypervisor (layer-stack builder).
3. **Morph VM ↔ kontejneri.**
   - A density counter on a 16 GB host.
   - A start race: VM boot stages vs "the process starts", shown as ranges, not fake precise numbers.
4. **„Kontejner je samo proces”.**
   - Toggle the view from inside the container (PID 1, alone) vs from the host (PID 48213).
   - `uname -r` is the same inside and outside.
5. **Namespaces as glasses.** pid, net, mnt, uts, ipc, user and cgroup each change what the process sees.
6. **cgroups as a limiter.** Exceeding `memory.max` gets the process OOM-killed; `cpu.max` throttles it. This is planted for L16.
7. **Isolation.** A kernel exploit crack spreads in container mode and stops at the hypervisor in VM mode. Middle ground: microVMs, gVisor, user namespaces. „U oblaku: kontejneri u VM-ovima” toggle.
8. **Mac/Windows.** A hidden Linux VM; arm64 vs amd64.

**Flagship: „Slagač stoga”.** VM/container toggle, add applications, start race, exploit button, cloud toggle. A second interactive: „Pogled iz kontejnera / s hosta” (a process tree with preserved identity).

**Code (expandable)**
- `docker run --rm alpine ps` vs `ps aux` on the host.
- `uname -r` inside and outside. On a Mac you see the VM's kernel, which is itself a lesson.
- (closed, Linux only) `unshare --pid --fork --mount-proc bash`.
- `cat /sys/fs/cgroup/…/memory.max`.

**Misconceptions**
- "A container is a lightweight VM."
- "Containers isolate as strongly as VMs."
- "Containers replaced VMs."
- "Docker runs natively on Mac and Windows."
- "Any image runs anywhere."

**Aha.** A container has no kernel of its own. It is a process wearing glasses (namespaces) and a belt (cgroups).

**Cijena rješenja → L08.** How do we turn Klopa into a container?

---

### L08 · Docker: image, Dockerfile i kontejner
`id 08 · slug docker · 55 min · preduvjeti: 07, 01`

**Purpose.** Dockerise klopa-api. The lecture covers:
- image vs container, with the class vs instance analogy;
- Dockerfile instructions as layers, like git commits;
- build cache and instruction order;
- multi-stage builds;
- why a secret in a layer never goes away;
- registry push and pull;
- tags as movable labels vs digests, and the `:latest` trap;
- the ephemeral writable layer, and volumes;
- port publishing, and why the app must listen on 0.0.0.0 (callback L01);
- what's under the hood: CLI → dockerd → containerd → runc, and OCI images, which is why Kubernetes doesn't need Docker to run them.

**Pain (Incident #8, a cluster of micro-pains).**
- Every code edit takes a 3-minute rebuild.
- The image is 1.1 GB.
- The SMS key from `.env` was found in the image.
- „latest” on the server ≠ „latest” on the laptop.
- Data disappeared after `docker rm`.
- `curl localhost:8080` doesn't work.

**Scenes**
1. **Image vs container.** One image fans out into many containers, each with its own writable layer.
2. **Build step-through.** One instruction = one layer; layers behave like git commits.
3. **Build cache lab** (flagship).
4. **Secret in a layer.** `COPY .env` followed by `RUN rm` leaves the file in the lower layer. Never put secrets in ENV or ARG either (planted for L15).
5. **Multi-stage.** Build tools stay behind and the image shrinks.
6. **Registry.** Only missing layers are uploaded. A tag is a sticky note moved between digests; a digest is immutable.
7. **Running a container.** The writable layer disappears on `docker rm`, a volume persists, and `-p 8080:3000` works as a door in the host's wall.
8. **Ispod haube.** docker CLI → dockerd → containerd → runc, and the OCI standard. Fact callouts: Docker Engine 29 uses the containerd image store by default; BuildKit is the default builder.

**Flagship: „Laboratorij build cachea”.**
- Draggable Dockerfile cards. Buttons: „Promijeni kod”, „Promijeni ovisnosti”, „Build”.
- `.dockerignore` and multi-stage toggles.
- A layer inspector, a stopwatch, and a push panel that shows "Layer already exists".
- Goals:
  - Rebuild after a code change in < 5 s.
  - Image < 200 MB.
  - Find the password in the image.

**Code (expandable)**
- Naive vs optimised multi-stage Dockerfile. Pin a current Node LTS tag and verify it when writing (e.g. `node:24-slim`).
- `.dockerignore`.
- `docker build -t registry.klopa.example/klopa-api:1.0.0 .`, `docker run -p`, `docker push`, `docker image history`, `docker inspect` (RepoDigests).
- (closed) `docker init`.

**Misconceptions**
- "Image and container are the same thing."
- "Changes inside a running container are saved."
- "Kubernetes runs Docker."
- "`:latest` is the newest fixed version."
- "EXPOSE publishes the port."
- "localhost inside the container is my laptop."
- "`RUN rm` removes the secret."
- "DOCKER_BUILDKIT=1 is needed."
- Fact callouts:
  - Docker Desktop licensing: check it for your institution (see Open decision 4); Podman Desktop and Rancher Desktop are alternatives.
  - Docker Hub limits anonymous pulls to 100 per 6 h.
  - Bitnami images moved to `bitnamilegacy`.

**Aha.** Instruction order is a performance decision, and a deleted file in an image is only hidden.

**Cijena rješenja → L09.** The README now has six `docker run` commands with three lines of flags each. Iva runs them in the wrong order, and the api looks for the database at „localhost”.

---

### L09 · Docker Compose: cijela Klopa na jednom stroju
`id 09 · slug docker-compose · 40 min · preduvjeti: 08, 06`

**Purpose.** A declarative multi-container application on one host:
- service names as DNS names on user-defined networks (the default bridge network has none);
- published ports;
- volumes;
- `depends_on` with a healthcheck (start ≠ ready);
- restart policies;
- the first taste of "describe what you want".

Then the critical failure: the host dies and everything dies. Compose can't spread containers across machines, and deploying is ssh + `git pull` + `compose up` by hand. This is the motivation for an orchestrator.

**Pain (Incident #9).** Wrong start order; the api can't find the database at `localhost:5432`.

**Scenes**
1. **Incident.** „localhost” inside the api container is the api itself.
2. **`compose.yaml` as a description.** `up` creates the network, then volumes, then containers in dependency order.
3. **DNS by service name.** `db:5432`. Callback to L01's DNS.
4. **Ports as doors.** Two containers can both use :80 internally; publishing both on host :8080 conflicts.
5. **Volumes.** Data survives `down` and is destroyed by `down -v`. Bind mounts for hot reload in development.
6. **depends_on.** Start ≠ ready; use `condition: service_healthy`.
7. **Restart and scale.** `restart: unless-stopped` and `--scale worker=3` both act on the same host only.
8. **12:05, the host dies.** Everything is down. Davor's to-do list: many machines, automatic placement, replacement elsewhere, gradual updates, stable addresses. That list is the next lecture.

**Flagship: „Compose slagalica”.**
- A canvas of a host with services, networks (coloured regions), volumes (cylinders) and ports (doors).
- Buttons: up, down, down -v, rm db, „Ugasi host”.
- A test browser on `localhost:8080`.
- A live `compose.yaml` with two-way highlighting.

**Code (expandable)**
- The full Klopa `compose.yaml`: web, api, worker, postgres, redis, rabbitmq, with healthchecks, named volumes and env_file. No `version:` key.
- `docker compose up -d / ps / logs`.

**Misconceptions**
- "Containers talk by IP addresses I have to look up."
- "depends_on waits for readiness."
- "You need `docker-compose` (with a hyphen) and `version: '3.8'`."
- "`restart: always` protects against host failure."
- Compose is fine for one host in small production setups; that is an honest note, not a myth.

**Aha.** Compose has already taught us declarative YAML and DNS names. What's missing is "more than one machine" and "someone who keeps watch".

**Cijena rješenja → L10.** Three hosts, containers placed by hand, and Davor's pager at 03:00.

---

## MODUL 3: Kubernetes – temelji (L10–L14, violet)

### L10 · Zašto Kubernetes? Željeno stanje i petlja usklađivanja
`id 10 · slug zasto-kubernetes · 45 min · preduvjeti: 04, 09`

**Purpose.** This is the course's threshold concept. Kubernetes is a set of independent control loops that drive actual state toward declared desired state. The lecture contrasts:
- declarative vs imperative;
- the thermostat analogy, upgraded to a chain of thermostats, vs the conductor myth.

It introduces the ghost/solid visual grammar used from here to Argo CD. It names cluster, node and control plane at headline level only. It states what Kubernetes is not: it doesn't build images, doesn't do CI/CD, doesn't provide databases, and isn't Docker. It also says honestly when it isn't worth it.

**Pain (Incident #10).** At 03:00 server-2 dies with 9 containers on it. Davor has to remember what ran where, find free space and start them by hand. At 11:45 he adds workers by hand.

**Scenes**
1. **„Ti si orkestrator”** (manual mode). Drag 30 containers onto 5 servers. At 03:00 one server dies while the clock runs; at 12:00, place six more workers.
2. **Imperative vs declarative.** A script "start 3" doesn't know about a crash afterwards; the statement "I want 3" gets fixed by the loop.
3. **Termostat.** Desired 22 °C is dashed, actual 18 °C is solid; observe → compare → act. Level-triggered: it doesn't care why the room got cold.
4. **Lanac termostata.** Many controllers, each owning a slice. Where the analogy breaks: Kubernetes replaces rather than repairs, and the cluster may never be fully "stable".
5. **Mit: dirigent.** Kubernetes doesn't run a plan. If the control plane stops, the music does not stop (teaser for L11).
6. **Klaster u jednoj slici.** A whiteboard (control plane) and workers (nodes). Names only; L11 covers who does what.
7. **What Kubernetes is NOT.** One card each. Fact: it uses containerd or CRI-O; dockershim was removed in 1.24.
8. **„Isplati li se?”** Complexity is the price. Honesty box: managed PaaS options exist.

**Flagship: „Ti si orkestrator → Termostat za aplikacije”.**
- The same seeded script (node failure at 03:00, lunch spike) is played twice: once manually, once with „Uključi Kubernetes” on, where ghosts appear and fill.
- Metrics: minutes of downtime, „Davorovi sati sna”, placement mistakes.

**Code (expandable)**
- A first look at a Deployment YAML annotated only as "this is the desired state" (spec vs status).
- `kubectl apply -f`, `kubectl get pods -w` with a Terminal showing a replacement Pod.

**Misconceptions**
- "Kubernetes is a container runtime" / "Kubernetes uses Docker."
- "Kubernetes automatically makes my app scalable." Callback L05: only if it is stateless.
- "kubectl does things immediately."
- "Kubernetes gives me CI/CD, logs and a database."
- "Kubernetes executes a plan step by step."

**Aha.** You don't tell Kubernetes what to do; you tell it what you want, and it never stops comparing.

**Cijena rješenja → L11.** Lana runs `kubectl apply` and sees „created”, yet the application doesn't respond.

---

### L11 · Prvi Pod: što se događa nakon kubectl apply
`id 11 · slug prvi-pod · 50 min · preduvjeti: 10`

**Purpose.** The notional machine, introduced just in time, on the first object students create. The cast:
- the API server: the only door, and the only component that talks to etcd;
- etcd: the shared whiteboard and source of truth;
- the scheduler: only assigns a node;
- the controller-manager: the loops;
- the kubelet: starts containers through CRI / containerd;
- kube-proxy: covered in L13.

Then the Pod itself:
- the smallest unit: containers that share IP, localhost and volumes;
- one main concern per Pod;
- native sidecars and init containers;
- YAML anatomy;
- a bare Pod is never healed, and a new Pod gets a new IP.

The local environment (kind, minikube or Killercoda) is set up here, and the first runbook entries are added.

**Pain (Incident #11).** „pod/klopa-api created”, but the Pod stays in ContainerCreating and then ImagePullBackOff (a typo in the tag). What does „created” mean?

**Scenes**
1. **Incident.** Accepted ≠ running.
2. **Hub and spoke.** Every component watches the API server; only the API server writes to etcd. Pulsing watch lines.
3. **„Prati Pod”** (flagship). apply → API server (a short authentication / authorisation / admission strip) → etcd → scheduler binds → kubelet → containerd pulls and starts → status written back.
4. **YAML anatomy.** apiVersion / kind / metadata (labels!) / spec; spec is dashed, status is solid. This becomes the reusable visual.
5. **Pod as „stan s cimerima”.** Containers share localhost and volumes. Don't put web and database in one Pod, because they would scale together. Native sidecar = an initContainer with `restartPolicy: Always`.
6. **Bare Pod death.** Delete the Pod or kill its node, and it is gone. A new Pod has a new name and IP.
7. **Ugasi upravljačku ravninu.** Running Pods keep serving, `kubectl` stops working, and nothing new happens.
8. **Lab and runbook.** kind / minikube / Killercoda. `get`, `describe` (Events as a log), `logs`.

**Flagship: „Prati Pod”.** A scrubbable, narrated path through the cluster with break-it branches. The event log mirrors `kubectl get events`:
- wrong tag → ImagePullBackOff;
- full nodes → Pending with `0/3 nodes are available: 3 Insufficient memory`;
- control plane down;
- delete the Pod;
- node dies.

**Code (expandable)**
- `pod.yaml` for klopa-api, with labels, containerPort and minimal requests.
- `kubectl apply / get pods -o wide / describe / logs / delete`.
- (closed) A multi-container Pod with a native sidecar.
- (closed) A kind config for a three-node cluster.

**Misconceptions**
- "A Pod is a container."
- "The control plane runs my containers."
- "The scheduler starts containers."
- "Components call each other directly."
- "A Pod is healed in place and keeps its IP."
- "You create Pods directly."
- "If the control plane dies, all applications die."
- Use "control plane", not "master".

**Aha.** `kubectl apply` writes onto the whiteboard. Others do the work, asynchronously.

**Cijena rješenja → L12.** Overnight, a node rebooted and the bare Pod disappeared for good. Petra also wants the vegetarian menu released today without taking the site down.

---

### L12 · Deployment: uvijek N kopija i nova verzija bez gašenja
`id 12 · slug deployment · 55 min · preduvjeti: 11`

**Purpose.** This covers the lecturer's "how Deployments are managed". The lecture covers:
- the Deployment → ReplicaSet → Pods ownership chain, and self-healing;
- scaling: Pods ≠ nodes, and Pending when there is no room;
- what creates a new ReplicaSet (a template change, not a replica change);
- rolling update mechanics: maxSurge rounds up, maxUnavailable rounds down, two ReplicaSets, and both versions serving at once, so they must be compatible;
- the Recreate strategy;
- rollout status, history and undo;
- no automatic rollback (`ProgressDeadlineExceeded`);
- disambiguating "Deployment" (the object) from "deploy / isporuka" (the activity);
- why `kubectl scale` / `kubectl edit` create drift (planted for L22).

**Pain (Incident #12).** The bare Pod is gone, and the release is due today at 11:00.

**Scenes**
1. **Incident.**
2. **Ownership tree.** Analogy: a shift contract („uvijek 3 konobara u smjeni”). It breaks down because the contract doesn't name which waiter, so Pods must be interchangeable.
3. **Self-healing.** Kill Pods and the ghosts fill. Kill the control plane and nothing is replaced.
4. **Replicas slider.** Pending when nodes are full.
5. **Predict.** Changing `replicas` vs changing `image`: which one creates a new ReplicaSet?
6. **Rolling update step-through.**
   - A fence-post table: N = 4 → surge 1 / unavailable 1; N = 1 → 1/0.
   - A blue/violet request stream.
   - The peak including terminating Pods is 7.
7. **Broken v3.** The rollout stalls at 3 old Ready + 2 new unready, then shows `ProgressDeadlineExceeded`. Nothing rolls back by itself; `rollout undo` scales the old ReplicaSet back up.
8. **Three meanings of "deployment"** as cards, plus Recrate vs RollingUpdate.

**Flagship: „Kontrolna ploča rollouta”** (sim-models SIM 5)
- Controls: N; maxSurge and maxUnavailable (0 / 1 / 2 / 25 % / 50 % / 100 %); image v1 / v2 / v3-crash / v3-never-ready; strategy.
- Two invariant gauges, a request stream coloured by version, revision history, an undo button.
- Small multiples comparing (25/25), (1/0) and (0/1).
- This lecture deliberately has no readiness probe. During the rollout a few requests hit warming Pods and fail. This is visible but unexplained, and becomes the hook for L13.
- Goals:
  - Roll out v2 with no capacity drop.
  - Recover from v3 in under a minute.

**Code (expandable)**
- `deployment.yaml` for klopa-api: replicas 3, selector and labels, explicit strategy, pinned tag, requests.
- `kubectl rollout status / history / undo`.
- `kubectl set image` and `kubectl scale`, each with a „u GitOpsu ovo radiš u Gitu” warning.

**Misconceptions**
- Deployment (object) vs deploy (activity).
- "More replicas means more machines."
- "Rolling updates are automatically zero-downtime."
- "A Deployment manages Pods directly."
- "A Deployment rolls back automatically."
- "`kubectl scale` / `edit` in production is fine."
- "Blue-green and canary are built in." Only RollingUpdate and Recreate are.

**Aha.** A rollout is just two ReplicaSets scaled in opposite directions under two constraints, and rollback means scaling the old one back up.

**Cijena rješenja → L13.** New Pods have new IPs, so klopa-web, with a hard-coded IP, is broken. And why did some users get 502 during the rollout?

---

### L13 · Service: stalna adresa za Podove koji dolaze i odlaze
`id 13 · slug service · 50 min · preduvjeti: 12, 04`

**Purpose.** The lecture covers:
- a Service as a stable virtual IP plus DNS name over a label selector;
- labels and selectors as loose coupling;
- EndpointSlices containing only Ready Pods, which introduces the readiness probe and fixes L12's rollout errors;
- a ClusterIP is virtual: no box, just rules on every node (kube-proxy, iptables by default, nftables as successor);
- balancing per connection, at random;
- a short introduction to Namespaces and DNS forms;
- Service types;
- the payoff of L04.

The L04 payoff: Kubernetes doesn't handle "2 GB vs 4 GB" with weights. Pods are equal-sized units (by requests), and a bigger node simply holds more Pods.

**Pain (Incident #13).** The hard-coded Pod IP breaks after the rollout, and there were 502s during it.

**Scenes**
1. **Incident.**
2. **Labels as hashtags, selector as a saved search.** Drag the stickers. A typo (`app: klopa-apii`) leaves 0 endpoints.
3. **EndpointSlice = only Ready Pods.** A failing readiness probe removes the Pod without restarting it. Replay the L12 rollout with readiness on: 0 errors.
4. **DNS and Namespace.** `klopa-api` → `klopa-api.klopa` → FQDN. Namespaces are folders, not a security boundary on their own. Compose callback.
5. **Put paketa.** CoreDNS → ClusterIP (cannot be pinged) → DNAT on the client's own node to a random Pod → reply. Header labels rewrite in place.
6. **Service vs classic load balancer.** The L04 sim reopens in „Kubernetes Service” mode: random per connection, no weights. Toggle keep-alive / HTTP/2 to see one Pod pinned.
7. **Types.** ClusterIP → NodePort (30000–32767) → LoadBalancer (stays pending on kind without an add-on) → headless (planted for L19), shown as reachability rings.
8. **Za znatiželjne: graceful shutdown.** Endpoint removal is asynchronous; use `preStop: sleep`.

**Flagship: „Laboratorij selektora i put paketa”.**
- Pods with label stickers, selector chips and live endpoint lines; per-Pod readiness toggles.
- A client Pod sends requests in "new connection per request" vs keep-alive mode, with a distribution histogram.
- Service type toggle; the rollout replay is embedded.
- Goals:
  - Fix a broken selector.
  - Run a rollout with 0 errors.
  - Explain why one Pod gets 100 % of the traffic.

**Code (expandable)**
- `service.yaml`.
- readinessProbe added to the Deployment, shown as a diff.
- `kubectl get endpointslices -l kubernetes.io/service-name=klopa-api`.
- `kubectl run tmp --rm -it --restart=Never --image=busybox:<pinned> -- wget -qO- http://klopa-api`.
- `nslookup`.
- (closed) NodePort.

**Misconceptions**
- "A Service is a running proxy box."
- "Round robin per request."
- "A Service points at a Deployment."
- "LoadBalancer works everywhere."
- "A short name resolves from anywhere."
- "Use the Endpoints object." EndpointSlices replace it; Endpoints is deprecated since 1.33.
- "Use ipvs." Deprecated since 1.35.

**Aha.** A Service is a promise implemented as rules on every node. A typo in a label silently breaks it.

**Cijena rješenja → L14.** How do students on the internet reach it? One LoadBalancer per Service means four public IPs and €€€. We also need HTTPS and path routing.

---

### L14 · Ulaz u klaster: Gateway API (i što je bilo s Ingressom)
`id 14 · slug gateway-api · 40 min · preduvjeti: 13`

**Purpose.** How outside traffic enters: a cloud L4 load balancer → an L7 Gateway in the cluster → Service → Pods. This closes the loop with L04: "the load balancer returns in two layers". The lecture covers:
- Gateway API: GatewayClass → Gateway → HTTPRoute, with role separation;
- host, path and header matching and precedence;
- TLS termination with a certificate stored in a Secret (planted for L15; cert-manager mentioned);
- weights (planted for the L20 canary);
- Ingress as a frozen-but-GA API students will meet in existing clusters;
- the retirement of community ingress-nginx and migration with ingress2gateway;
- Gateway API as an add-on (CRDs plus a controller).

**Pain (Incident #14).** A € counter for LoadBalancer-per-Service. Davor found a tutorial using ingress-nginx, which was retired in March 2026.

**Scenes**
1. **Incident: the cost counter.**
2. **The full entry path.** Where L4 and L7 from L04 sit.
3. **Resource chain and roles.** GatewayClass = infrastructure provider, Gateway = cluster operator, HTTPRoute = application team. Hover shows ownership.
4. **Route builder.** `/` → web, `/api` → api, `admin.klopa.example` → admin; more specific matches win; no match → 404.
5. **TLS termination.** Padlock handshake; the certificate lives in a Secret („a što je Secret?” → L15).
6. **Weight 90/10.** The request stream mixes colours accordingly (canary teaser).
7. **Ingress then and now.**
   - The same intent shown as an Ingress with annotations.
   - Fact callout: the Ingress API is frozen, not deprecated.
   - Community ingress-nginx was retired on 2026-03-24. F5's NGINX Ingress Controller is a different, maintained project.
   - Migration: ingress2gateway.

**Flagship: „Gradska vrata”.** A mixed request stream, a drag-built HTTPRoute, two-way YAML highlighting, a roles view, and „Prikaži kao Ingress”. Goals:
- Route all four request types correctly.
- Send 10 % to v2.

**Code (expandable)**
- `gateway.yaml` (HTTPS listener, certificateRefs).
- `httproute.yaml` (hostnames, PathPrefix, backendRefs, weights).
- `kubectl get gateway,httproute`.
- A note: Gateway API CRDs plus a controller are required, e.g. Envoy Gateway, NGINX Gateway Fabric, Traefik or Cilium.
- (closed) A legacy `ingress.yaml` for comparison.

**Misconceptions**
- "Ingress is a kind of Service."
- "Ingress is deprecated or dead."
- "Use ingress-nginx."
- "Gateway API is built into every cluster."
- "A Gateway replaces Services."

**Aha.** The same load-balancing idea, split into layers and roles: the platform team owns the gate, and the app team owns its route.

**Cijena rješenja → L15.** The TLS certificate needs a Secret. The database password and the SMS key are still baked into the image from L08.

---

## MODUL 4: Kubernetes u pogonu (L15–L19, amber)

### L15 · ConfigMap i Secret: konfiguracija i tajne u klasteru
`id 15 · slug configmap-i-secret · 50 min · preduvjeti: 12, 13`

**Purpose.** Part 1 of the lecturer's secrets request. The lecture covers:
- separating config from image: build once, configure per environment;
- ConfigMap for non-sensitive values;
- Secret: what it is and isn't:
  - base64 encoded, not encrypted;
  - stored unencrypted in etcd by default; encryption at rest via EncryptionConfiguration / KMS v2; managed clusters differ;
  - who can read it: `get`, `list` / `watch`, and anyone who can create Pods in the namespace;
- consuming config: env var (needs a restart) vs mounted volume (updates eventually; `subPath` never updates);
- `immutable`; Secret types, including TLS and image pull secrets;
- never commit Secrets, never bake them into an image;
- minimal RBAC and ServiceAccount;
- the same image in a `klopa-staging` namespace, which is the hook for L16.

**Pain (Incident #15).** The SMS key leaked through the image and a public repository. A (fictional) bill arrives for 40 000 SMS. Staging needs different values from production.

**Scenes**
1. **Incident.**
2. **Build once, configure per environment.** One digest with three ConfigMaps gives three behaviours.
3. **ConfigMap as env vs as a file.**
4. **Secret = „ConfigMap s naljepnicom ‚pažljivo’”.** The „Dekodiraj” button shows plaintext instantly.
5. **Where it lives.** etcd in plaintext. Encryption at rest greys out the „ukradena etcd kopija” eye. KMS envelope encryption (DEK/KEK) in a „Za znatiželjne” box.
6. **„Tko može pročitati?” explorer.** get, list/watch, create Pod (mount it), compromised Pod; least-privilege RBAC.
7. **Update timeline.** Volume = eventually, env = stale until restart, `subPath` = never. The application must re-read; use `rollout restart`.
8. **Rules card.** Never commit; never ENV/ARG in a Dockerfile; prefer mounted files; limit access. Teaser: "but in L22 everything will live in Git…".

**Flagship: „Put tajne (1. dio)”.**
- A threat-model simulator. The secret's location can be: in the image / plaintext env in YAML / ConfigMap / Secret / Secret + encryption at rest / + least-privilege RBAC.
- Attacker eyes turn red when the attacker can read the password:
  - someone who sees the Git repo;
  - someone who pulls the image;
  - someone holding a stolen etcd backup;
  - a user with `get secrets`;
  - a user with `list secrets`;
  - a user who can create Pods;
  - a compromised Pod.
- A rotation button with side-by-side env vs volume Pods.
- Goal: get every eye grey except the ones that cannot be closed, and explain why „netko tko smije kreirati Pod” stays red.

**Code (expandable)**
- `configmap.yaml`.
- `secret.yaml` with `stringData` and a big „NE COMMITATI” banner.
- Deployment with `envFrom` / `secretKeyRef` and a volume mount.
- `kubectl create secret generic --from-literal` (with a shell-history warning).
- `kubectl get secret … -o jsonpath | base64 -d`.
- (closed) EncryptionConfiguration; a Role with narrow verbs; imagePullSecrets.

**Misconceptions**
- "Secrets are encrypted."
- "Only admins, or only `get`, can read them."
- "Committing a Secret is fine."
- "Updating a Secret updates the application."
- "ConfigMap vs Secret doesn't matter."
- "Env vars are the safest choice."

**Aha.** base64 is a costume, not a lock. Real protection is RBAC, encryption at rest and keeping plaintext out of everywhere.

**Cijena rješenja → L16.** Staging now runs in the same cluster. Iva's staging load test plus the new menu-photo worker eat node-2's memory, and the production klopa-api Pods get killed.

---

### L16 · Resursi i raspoređivanje: koliko mjesta treba Podu
`id 16 · slug resursi-i-rasporedivanje · 50 min · preduvjeti: 11, 12, 07`

**Purpose.** The lecture covers:
- requests (what the scheduler reserves) vs limits (what the kernel enforces through cgroups; callback L07);
- filter → score → bind, based on requests and never on usage;
- allocatable vs capacity;
- Pending and fragmentation;
- CPU over the limit is throttled; memory over the limit is OOMKilled (exit 137), followed by CrashLoopBackOff;
- QoS classes and node-pressure eviction (simplified ranking);
- right-sizing as a trade-off between risk and €;
- the CPU-limits debate presented as a trade-off;
- in-place resize (fact: GA since 1.35).

The L02 / L04 server-size intuition reappears as node sizes.

**Pain (Incident #16).** A noisy neighbour: the worker's memory ballooned and api Pods were OOM-killed or evicted. New Pods sit `0/3 nodes are available: 3 Insufficient cpu` while the dashboard shows CPU at 30 %.

**Scenes**
1. **Incident.**
2. **Reservation vs house rule.** A request is a reservation; a limit is the maximum allowed. Memory over the limit gets you thrown out; CPU over the limit slows you down.
3. **Scheduler Tetris** (manual, then automatic) with filter reasons and score breakdowns.
4. **Predict.** A node at „30 % CPU used” but 95 % requested → Pending.
5. **CPU throttling up close.** 100 ms periods; with limit 200m, 50 ms of CPU work stretches to about 250 ms of latency.
6. **Memory leak → OOMKilled → CrashLoopBackOff** with a backoff ring: 10 s, 20 s, 40 s … up to 300 s.
7. **QoS and eviction.** BestEffort and over-request Pods go first.
8. **Fragmentation.** Total free CPU is enough but no single node fits the Pod, so it stays Pending. Teaser for the L18 cluster autoscaler.

**Flagship: „Tetris raspoređivača”** (sim-models SIM 3)
- Three nodes with allocatable resources and DaemonSet overhead.
- Eight Pod cards: web, api-guaranteed, cpu-burner, batch, leaky, besteffort, big-db, fragment.
- Manual and automatic scheduling; usage sliders; three-layer node bars (requested / used / Σ limits).
- Break-it: „Curenje memorije”, „CPU petlja”, memory pressure.
- Event log.
- Goals:
  - Schedule everything except big-db.
  - Explain why fragment stays Pending.
  - Stop leaky from hurting its neighbours.

**Code (expandable)**
- The `resources` block.
- `kubectl describe pod` showing `OOMKilled` / `Exit Code: 137` / `Last State`.
- FailedScheduling events.
- `kubectl top pods` (needs metrics-server).
- (closed) LimitRange and ResourceQuota for `klopa-staging`.

**Misconceptions**
- "The scheduler reserves limits."
- "The scheduler looks at real usage."
- "Exceeding the CPU limit kills the container."
- "Exceeding memory only slows it down."
- "No requests is fine."
- "Changing resources always needs a recreate."

**Aha.** The scheduler places Pods by reservations, while the kernel punishes them by actual usage. Two different worlds.

**Cijena rješenja → L17.** Limits now stop the leaky worker; it gets killed and restarts on its own. But at 12:20 a worker deadlocks. It is „Running”, and nobody restarts it.

---

### L17 · Probe i samoizlječenje: kad Pod radi, a ne radi
`id 17 · slug probe-i-samoizljecenje · 40 min · preduvjeti: 13, 16, 06`

**Purpose.** Three probes answer three questions:
- **startup:** has it started? Liveness and readiness are disabled until it succeeds.
- **readiness:** can it take traffic? A failure removes the Pod from endpoints (recap L13).
- **liveness:** is it stuck? A failure restarts the container.

The lecture also covers:
- mechanisms (httpGet / tcp / exec / grpc) and timing defaults (period 10 s, timeout 1 s, failureThreshold 3);
- never checking dependencies in liveness;
- health-endpoint design;
- the self-healing ladder: container (kubelet restart) → Pod (ReplicaSet) → node (eviction after the default ~5-minute toleration);
- PodDisruptionBudget for voluntary disruptions only.

**Pain (Incident #17).**
- A zombie worker: the L06 queue sim reappears with its depth climbing to 900.
- Then a naive fix: liveness checks the database, a 30-second database blip happens, and every api Pod restarts.
- The cache warm-up takes 40 s, so liveness kills the Pod before it starts.

**Scenes**
1. **Incident.** Queue depth climbs while the Pod shows Running.
2. **Probe triad timeline.** Three lanes; scrub initialDelay, period and failureThreshold.
3. **Liveness restart.** Restart count; CrashLoopBackOff.
4. **Startup probe vs a slow start.**
5. **Cascade.** Liveness → database outage → restart storm. "Liveness asks only about myself."
6. **Self-healing ladder.** Three zoom levels with honest node-failure timing (compression badge).
7. **PDB and drain.** Voluntary vs involuntary disruptions; a PDB doesn't protect against a crash.

**Flagship: „Tri pitanja za Pod”.**
- Four api Pods behind a Service with live traffic, plus a worker reading the queue.
- Per-probe configuration.
- Break-it: „Zamrzni proces”, „Spori start 40 s”, „Baza pala 30 s”, „Ugasi čvor”. Toggle „liveness provjerava bazu”.
- Metrics: errors, restarts, Ready count, queue depth.
- Goals:
  - Recover the frozen worker within 1 min.
  - Survive the database outage with 0 restarts.
  - A slow start without CrashLoopBackOff.

**Code (expandable)**
- The probes block (startup / readiness / liveness).
- Node `/healthz` vs `/ready` handlers.
- Events showing „Liveness probe failed”.
- (closed) PDB YAML; `kubectl drain`.

**Misconceptions**
- "Liveness should check the database."
- "A failing readiness probe restarts the Pod."
- "Running = healthy."
- "A PDB protects against a node crash."
- "A rescheduled Pod is the same Pod."
- "Without probes, Kubernetes knows when the app is ready."

**Aha.** A dead process restarts itself. A stuck process needs a question, and asking it the wrong question causes an outage.

**Cijena rješenja → L18.** Pods are healthy, but Davor still runs `kubectl scale --replicas=12` at 11:45 every day. On a holiday Monday he forgets.

---

### L18 · Automatsko skaliranje: ručak bez panike
`id 18 · slug autoskaliranje · 50 min · preduvjeti: 16, 17, 06`

**Purpose.**
- **HPA:** the formula `ceil(cur × current/target)`; utilisation relative to requests; tolerance 10 %; 15 s sync; 300 s scale-down stabilisation; the maximum across metrics wins; rate policies; metrics-server.
- **Cluster Autoscaler:** reacts to Pending Pods, not CPU. Nodes take minutes. Scale-down below 50 % of requests. Karpenter mentioned.
- **Queue-driven scaling** with KEDA / an external metric (callback L06), and scale-to-zero (fact callout: HPA scale-to-zero is beta, on by default in 1.37, with object/external metrics only).
- **VPA** and in-place resize, briefly; don't mix VPA and HPA on the same metric.
- Lead time and headroom.
- A warning planted for L22: don't keep `replicas` in Git for an HPA-managed Deployment.

**Pain (Incident #18).** The forgotten manual scale-up, and a Ćevap-petak flash crowd on top.

**Scenes**
1. **Incident.**
2. **The HPA formula with scrubbable numbers.** 3 Pods at 90 % with a 50 % target → 6. At 54 % → no change (tolerance).
3. **Utilisation is measured against requests.** No request means no HPA.
4. **Pods in seconds, nodes in minutes.** Pending → CA → a provisioning bar labelled sim vs real.
5. **Lead-time stacked bar.** Headroom and over-provisioning. Scale-down is deliberately slow.
6. **Workers scaled by queue depth** (KEDA), and scale-to-zero.
7. **Vertical vs horizontal** (VPA, in-place resize).
8. **€/h vs p95** trade-off.

**Flagship: „Preživi dan u menzi”** (sim-models SIM 4; validated 20 → 100 rps timeline)
- A compressed day: breakfast, lunch, Ćevap-petak.
- Controls: HPA target / min / max, CPU request, cluster autoscaler on/off with min/max nodes, node size.
- Metrics: p95, drops, Ready, Pending, nodes, €/h.
- A timeline annotated with every HPA decision and the formula behind it.
- Goal: p95 < 300 ms and errors < 1 % at the lowest €.

**Code (expandable)**
- `hpa.yaml` (autoscaling/v2, behavior).
- `kubectl get hpa -w`.
- (closed) A KEDA ScaledObject for RabbitMQ. Verify the API version when writing.
- A note that the cluster autoscaler is configured on the cloud side.

**Misconceptions**
- "HPA adds nodes."
- "The cluster autoscaler reacts to high CPU."
- "Autoscaling is instant."
- "HPA can't scale to zero" (outdated).
- "HPA works without requests."
- "VPA `updateMode: Auto`" (deprecated).

**Aha.** Autoscaling is another thermostat, but one with inertia. You buy time with headroom.

**Cijena rješenja → L19.** The cluster autoscaler scaled down and drained a node at night. Iva's Postgres, running "like everything else" in a Deployment, was rescheduled, and all the orders are gone.

---

### L19 · Podatci koji preživljavaju: volumeni i StatefulSet
`id 19 · slug pohrana-i-statefulset · 35 min · preduvjeti: 12, 05`

**Purpose.**
- Pods are ephemeral.
- Container filesystem vs emptyDir vs PersistentVolume / PersistentVolumeClaim via a StorageClass (dynamic provisioning).
- Access modes: RWO means one node, not one Pod; RWOP means one Pod.
- Detach/attach delay on node failure.
- StatefulSet identity: stable names, ordering, a PVC per replica, DNS through a headless Service, and PVCs retained by default.
- `replicas: 3` ≠ a database cluster: replication is the database's job.
- An honest recommendation: a managed database, or an operator.
- Closes the Module 1 storyline from L05: the database was always the hard part.

**Pain (Incident #19).** The data is gone. And the earlier `replicas: 3` turned out to be three independent databases with different orders.

**Scenes**
1. **Incident.**
2. **„Preživljavaju li podatci?”** Three Pods (container fs / emptyDir / PVC) vs three events (container restart / delete Pod / node fails).
3. **PVC → PV → StorageClass.** A claim ticket and a factory.
4. **Access modes and disk move delay.**
5. **Deployment vs StatefulSet small multiples.** Ordered 0 → 3; delete `db-1` and it returns with the same name and PVC; scale down and the PVCs stay.
6. **Replication is the database's job.**
7. **Decision tree for Klopa's Postgres.** Managed database (recommended) vs StatefulSet + operator.

**Flagship: „Preživljavaju li podatci?”.** Row counters per variant and three break-it events. Part 2 is the StatefulSet naming and PVC sim.

**Code (expandable)**
- `pvc.yaml`.
- `kubectl get pvc,pv`.
- (closed) `statefulset.yaml` with volumeClaimTemplates and a headless Service.

**Misconceptions**
- "The container filesystem persists."
- "Every volume is persistent."
- "Postgres with `replicas: 3` = a cluster."
- "RWO = one Pod."
- "Deleting a StatefulSet deletes the data."

**Aha.** Kubernetes gives storage an identity, but it does not give your database replication.

**Cijena rješenja → L20.** The infrastructure is now stable. The remaining risk is our own changes. On Friday the vegetarian menu goes out.

---

## MODUL 5: Isporuka softvera (L20–L24, rose)

### L20 · Što je zapravo deployment? Strategije isporuke
`id 20 · slug strategije-isporuke · 45 min · preduvjeti: 12, 13, 14`

**Purpose.** This answers the lecturer's "what is deployment" directly. It resolves four words:
- deploy (isporuka / postavljanje);
- release (izdanje);
- rollout (uvođenje);
- the Deployment object.

It also covers:
- environments: dev → staging → prod;
- strategies (recreate, rolling, blue-green, canary) as trade-offs between blast radius, cost, speed and complexity;
- deploy ≠ release: feature flags and dark launches;
- rollback and database migrations (expand/contract);
- progressive delivery: Argo Rollouts with the Gateway API plugin; canary by replica ratio vs by Gateway weights;
- metrics as the release gate.

**Pain (Incident #20).**
- v2.0 rolls out on Friday at 11:30. A VAT bug hits every user by 11:50.
- The migration renamed a column, so v1 Pods still running mid-rollout crash.

**Scenes**
1. **Incident.**
2. **Four meanings, four cards.**
3. **Environments.** „Staging prošao ≠ produkcija radi.”
4. **Four strategies, same bug** (flagship).
5. **Blue-green** as a Service selector flip (callback L13), at 2× resources.
6. **Canary.** 1 of 10 Pods ≈ 10 % per connection vs Gateway weight 5 %. Automatic abort on an error threshold.
7. **Expand/contract migration.** A one-step rename breaks v1; three steps are safe.
8. **Feature flags.** Deploy dark, then 1 % → staff → everyone.

**Flagship: „Četiri strategije, isti bug”.**
- Small multiples on the same seed: Recreate, Rolling, Blue-Green, Canary.
- A bug-fraction scrub; canary steps and a threshold; per-lane rollback.
- Metrics: downtime, users hit, extra €, time to rollback, mixed-version window.
- A hidden-bug mode where the student has to spot the bug.

**Code (expandable)**
- `strategy: Recreate` vs RollingUpdate.
- A blue-green Service selector patch.
- HTTPRoute weights 95/5.
- (closed) An Argo Rollouts canary with steps and analysis.
- (closed) SQL expand/contract.

**Misconceptions**
- "Deploy = release."
- "Rollback is always safe."
- "Blue-green and canary are built into Deployments."
- "Staging passing means production works."
- "A rolling update means no risk."

**Aha.** You can deploy without releasing. A good strategy chooses how many users a bug gets to see.

**Cijena rješenja → L21.** Who presses the buttons? Davor, from his laptop, with uncommitted changes.

---

### L21 · CI/CD: od commita do imagea bez ručnog rada
`id 21 · slug ci-cd · 50 min · preduvjeti: 08, 20`

**Purpose.** The lecture covers:
- CI as a practice: small changes merged to the mainline at least daily, each checked by an automated build and tests;
- pipeline as code, with GitHub Actions and GitLab CI vocabulary;
- the stages: lint → test → build → scan → push with an immutable tag (git SHA / semver) and a digest;
- build once, promote the same artifact;
- continuous delivery (a human button) vs continuous deployment (automatic);
- secrets in CI: OIDC short-lived tokens over long-lived keys;
- DORA metrics, briefly;
- where CI ends: CI running `kubectl apply` is the push model, the teaser for L22.

**Pain (Incident #21).**
- A laptop build with uncommitted changes, pushed as `:latest`; tests skipped.
- Davor leaves on Erasmus and nobody else can deploy.
- „Koja je verzija sad u produkciji?”

**Scenes**
1. **Incident.**
2. **Integration hell vs small daily merges.**
3. **The assembly line** (flagship). A failing test stops the line.
4. **Tags and digests answer „koja verzija?”.**
5. **Build once, promote many.** „Rebuild za prod” turns red.
6. **The human gate slider.** CI → continuous delivery → continuous deployment.
7. **CI secrets.** OIDC vs long-lived keys; secrets must never be echoed into logs.
8. **Push deploy.** CI holds a cluster-admin kubeconfig: a key icon on the CI box.

**Flagship: „Tvornica commitova”.**
- Stations; commit types „Ispravan”, „Pada test”, „Ranjiva bazna slika”, „Flaky test”.
- Cache and parallelism toggles; „Preskoči testove”; the gate slider.
- A DORA panel.
- Goals:
  - Lead time < 10 min.
  - Zero bugs in production over 20 commits.

**Code (expandable)**
- `.github/workflows/ci.yaml`: PR tests and a build-push job tagged `${{ github.sha }}`, with `permissions: id-token: write`. Verify action major versions when writing.
- A `.gitlab-ci.yml` equivalent in Tabs.
- A fact callout: Docker Hub pull limits, so log in from CI.

**Misconceptions**
- "CI/CD is a tool."
- "CD always means automatic deploy to production."
- "Tests are optional."
- "The pipeline should `kubectl apply` to production."
- "Rebuild the image per environment."
- "`:latest` is fine."

**Aha.** CI is a habit, not a server. The artifact that was tested is the same one that goes live.

**Cijena rješenja → L22.** CI holds the cluster's keys. At 02:00 someone ran `kubectl edit`, and nobody knows what is really running.

---

### L22 · GitOps i Argo CD: Git kao jedini izvor istine
`id 22 · slug gitops-argo-cd · 55 min · preduvjeti: 10, 12, 21`

**Purpose.** This answers the lecturer's "what is Argo CD and why we use it".
- The OpenGitOps principles: declarative; versioned and immutable; pulled automatically; continuously reconciled.
- Argo CD as the reconciliation loop one level up: a thermostat whose set point lives in Git (callback L10).
- Core terms: the Application CRD; target vs live state; sync and health as separate dimensions.
- Timing and safety switches:
  - polling about every 3 min (120 s plus up to 60 s jitter) vs webhooks;
  - auto-sync, with prune and selfHeal off by default;
  - rollback = `git revert`.
- Workflow: CI bumps the tag in the config repo, and Argo CD pulls. CI never holds cluster credentials. App repo vs config repo.
- Helm and Kustomize in one scene: Argo CD renders them to plain YAML, using `helm template`, not `helm install`.
- HPA vs `replicas` in Git (`ignoreDifferences`).
- Sync waves, briefly.
- Flux as the other main tool.
- Argo CD does not build images.

**Pain (Incident #22).** A leaked CI kubeconfig would mean the whole cluster. A 02:00 `kubectl edit`. After a cluster rebuild, nobody can recreate the state.

**Scenes**
1. **Incident.**
2. **Push vs pull.** Where the credentials live, and which way the firewall arrows point.
3. **Matrjoška petlji.** Thermostat → Kubernetes controller → Argo CD, in the same ghost/solid grammar.
4. **Commit → poll countdown / webhook → OutOfSync diff → sync → Synced / Healthy.** Synced + Degraded is possible.
5. **Drift.** A manual `kubectl scale` shows OutOfSync; selfHeal off vs on. Prune off vs on with a file deleted from Git.
6. **Bad commit → Degraded → `git revert`** as the audit trail.
7. **The whole chain.** CI (L21) → image → bot commit → Argo CD → rolling update (L12).
8. **Environments.** Kustomize overlays / Helm values, one sentence each. HPA vs Git replicas. Teaser: „a lozinke?”.

**Flagship: „Git je istina”.**
- A Git repo (file tree and commit graph) alongside the cluster tree in Argo CD's vocabulary, with sync and health badges and a poll ring.
- Toggles: webhook, auto-sync, selfHeal, prune.
- Break-it: manual scale, delete the Deployment, delete a file from Git, bad commit.
- „git revert” button.
- Goals:
  - Fix the drift without touching `kubectl`.
  - Roll back the bad commit with a full audit trail.

**Code (expandable)**
- `Application` (argoproj.io/v1alpha1, `syncPolicy.automated` with prune / selfHeal).
- A config-repo tree (base / overlays, `kustomization.yaml`).
- A CI step that bumps the tag (`kustomize edit set image` + commit).
- `argocd app get / diff / sync`.
- (closed) The server-side install command; `ignoreDifferences` for replicas.

**Misconceptions**
- "Argo CD builds and tests code."
- "It reacts instantly to a push."
- "GitOps = YAML in Git."
- "My manual change will stay."
- "Rollback = a click in the UI."
- "Auto-sync deletes and reverts by default."
- "Argo CD runs `helm install`."
- "Flux died with Weaveworks."

**Aha.** Argo CD is the same loop from L10, only its "desired state" lives in Git. Git history becomes deployment history.

**Cijena rješenja → L23.** "Everything in Git" — except the passwords, which L15 said must never go in Git.

---

### L23 · Tajne u GitOpsu: Sealed Secrets, External Secrets i trezori
`id 23 · slug tajne-u-gitopsu · 45 min · preduvjeti: 15, 22`

**Purpose.** Part 2 of the lecturer's secrets request: managing secrets when Git is the source of truth. Two families:

1. **Encrypted in Git.**
   - Sealed Secrets: asymmetric keys, only the in-cluster controller decrypts; scopes; automatic key renewal every 30 days; back up the private key.
   - SOPS: values encrypted, keys visible. Flux decrypts it natively; Argo CD needs a plugin, which is the discouraged approach.
2. **Reference in Git, value in a store.**
   - Stores: Vault, OpenBao, cloud secret managers.
   - Consumed through External Secrets Operator (syncs into a Kubernetes Secret on `refreshInterval`) or the Secrets Store CSI Driver (tmpfs mount, optional sync).

The lecture also covers:
- Argo CD's official recommendation: manage secrets in the destination cluster, not with manifest-generation plugins (plaintext in the Redis cache, coupled syncs);
- rotation and audit;
- OIDC in CI (callback L21);
- ecosystem facts as lessons: ESO's 2025 pause and resumption (a bus-factor echo of Davor's Erasmus); Vault under BSL → OpenBao;
- a decision guide for Klopa.

**Pain (Incident #23).** Lana applies `secret.yaml` from her laptop by hand. A new cluster comes up and the app crashes because the Secret is missing. An intern leaves, and rotating the SMS key takes two days.

**Scenes**
1. **Incident.**
2. **Two families diagram.**
3. **Sealed Secrets key flow.** Public key encrypts → SealedSecret in Git → private key in the controller. „Izgubljen ključ” break-it.
4. **SOPS.**
5. **ESO + store.** An `ExternalSecret` reference → Kubernetes Secret; a refresh ring; the rotation path.
6. **CSI driver.** Direct mount; new Pods cannot start if the store is unavailable.
7. **Why not argocd-vault-plugin.**
8. **Decision guide.** A small team → Sealed Secrets. Cloud and an organisation → cloud secret manager + ESO.

**Flagship: „Put tajne (2. dio)”.** The L15 simulator returns with the GitOps paths unlocked: plain Secret in Git (✗), SealedSecret, SOPS, ESO + Vault/OpenBao/cloud secret manager, CSI.
- New attacker eyes: Git reader, „Argo CD Redis cache”, „bivši zaposlenik sa starom lozinkom”.
- „Rotiraj” timeline per consumer.
- Break-it: „Trezor nedostupan”. With default settings ESO keeps the last synced Secret, while CSI blocks new Pods.
- Goal: rotate the SMS key in < 5 min with zero plaintext in Git.

**Code (expandable)**
- `kubeseal` + `SealedSecret` (bitnami.com/v1alpha1).
- `ExternalSecret` + `ClusterSecretStore` (verify the current ESO API version, likely `external-secrets.io/v1`).
- (closed) `SecretProviderClass`; a SOPS-encrypted file.

**Misconceptions**
- "Once it's sealed, the private key doesn't matter."
- "argocd-vault-plugin is the way."
- "ESO is abandoned" (outdated).
- "Vault is open source under MPL" (BSL; OpenBao is the fork).
- "With an external store there is no Kubernetes Secret at all" (ESO creates one).
- "Encrypted in Git means no rotation needed."

**Aha.** Git can hold either a lock or an address, never the key itself.

**Cijena rješenja → L24.** All the pieces are in place. Time for a real release day.

---

### L24 · Dan izdanja: put jednog commita i jednog zahtjeva
`id 24 · slug dan-izdanja · 60 min · preduvjeti: sve`

**Purpose.** The capstone and narrative closure. It follows:
- **one commit:** push → PR → CI → cached build → digest → bot commit → Argo CD → new ReplicaSet → scheduler → pull of only the changed layers → startup / readiness → EndpointSlice → traffic;
- **one request:** DNS → cloud LB → Gateway → Service → Pod (config from ConfigMap / Secret) → Postgres → queue → worker → SMS, while a trace waterfall builds up (an observability teaser).

At every station, „Što ako ovdje pukne?” recalls that layer's protection. Then come break-and-diagnose challenges and the replay of the decision log. The lecture ends with a map of what to learn next: observability, Helm, RBAC / NetworkPolicy / Pod Security, service mesh, and a KCNA mapping.

**Pain (Incident #24).** Friday 11:55: a VAT bug in the cart. The fix must be live before 12:00.

**Scenes**
1. **Countdown scenario.**
2. **Journey of a commit.** A scrubbable timeline; each station opens a mini version of its lecture's sim.
3. **Journey of a request,** with the waterfall assembling as it goes.
4. **„Što ako ovdje pukne?” stations.**
5. **Diagnose challenges.** Given `get` / `describe` / events / Argo CD status, find the cause:

   | Symptom | Cause |
   |---|---|
   | CrashLoopBackOff | liveness too aggressive |
   | Pending | requests don't fit |
   | 0 endpoints | selector typo |
   | OutOfSync | manual drift |
   | OOMKilled | memory limit |
   | ImagePullBackOff | wrong tag or missing pull secret |
   | Synced but Degraded | readiness failing |
   | 404 from the Gateway | missing route |

6. **„Potencije desetke” zoom.** Users → cluster → node → Pod → container → Linux process.
7. **Decision log replayed.** Every lecture's "dobili / platili" line.
8. **„Kamo dalje”.**

**Flagship: „Dan izdanja”.** An end-to-end replay plus eight seeded, randomised break-and-diagnose challenges, shareable through the URL hash. It finishes with a downloadable Davorov dežurni priručnik.

**Code (expandable)**
- The full Klopa app repo and config repo as an expandable file explorer.
- A debugging cheat sheet: `kubectl get / describe / logs / events / rollout / top`, `argocd app diff`.

**Misconceptions.** A grand „Mit ili istina?” round of 10 items drawn from across the course.

**Aha.** Every layer exists because of one concrete incident, and you can now name all 24.

---

## Coverage of the lecturer's explicit requests

| Request | Where |
|---|---|
| Why distributed systems exist | L02, L03 (L01 base) |
| Why load balancers; interactive sim with self-configured 2 GB / 4 GB servers | L04 flagship; callbacks in L13 (Service mode) and L16 (node sizes) |
| Event queues | L06; callbacks L17, L18 |
| Kubernetes in general and why we need it | L10–L19 |
| Docker, Dockerisation, containerisation vs virtualisation | L07, L08, L09 |
| How secrets are managed in Kubernetes | L15 (the object and what it protects), L23 (GitOps-era management) |
| How Deployments and Services are managed | L12, L13 (+ L14, L20) |
| What Argo CD is and why we use it | L22 (+ L23) |
| What CI/CD is | L21 |
| What "deployment" means | L01 (informal), L12 (object vs act), L20 (dedicated) |
| Code secondary, in expandable blocks | Every lecture; all blocks are collapsed by default |

---

## Justification: ordering

1. **The pain chain is the ordering.** Each lecture's „Cijena rješenja” is the next lecture's incident. Because the causal chain never breaks, students always know why the next concept exists:
   localhost → one server → SPOF → LB → lost state → synchronous fragility → environment drift → packaging → single host → manual orchestration → "created ≠ running" → bare Pod → IP churn → external entry → baked-in secrets → noisy neighbour → zombie process → manual scaling → lost data → risky changes → laptop deploys → drift and CI credentials → secrets vs Git → release day.
2. **Why before how.** Module 1 (pure distributed-systems ideas, no tools) comes before any Docker or Kubernetes. Without the 12:00 pain, Kubernetes looks like bureaucracy. The L01 trailer offsets the risk that students get impatient waiting for tools.
3. **L05 (state) right after the load balancer.** The load balancer itself causes the session pain, which makes this the most natural "aha" in the course. Statelessness is also the precondition for Deployments and HPA. L19 later closes the same thread.
4. **L06 (queues) in Module 1, after state.** Queues are a distributed-systems idea independent of Kubernetes. The idempotency fix needs the database unique constraint from L05. Pull-based competing consumers contrast directly with L04's push.
5. **VM → Docker → Compose → Kubernetes.** Compose teaches declarative YAML and DNS names on one host. Its failure, the host dying, is exactly the motivation for Kubernetes.
6. **The threshold concept (L10) before any object; the architecture just in time (L11) on the first Pod.** The thermostat and ghost/solid grammar are reused by ReplicaSet, HPA and Argo CD. This makes L22 an "aha, I already know this" rather than a new topic.
7. **Pod → Deployment → Service → Gateway** follows the user journey. Readiness is introduced in L13, where it changes Service endpoints, to fix L12's visible-but-unexplained rollout errors. This is deliberate delayed gratification.
8. **Secrets split across L15 and L23.** The lecturer emphasised secrets, and the GitOps lecture creates a second, distinct pain ("Git is the truth, but passwords can't be in Git"). L15 must come before Argo CD; L23 must come after it.
9. **Resources (L16) → probes (L17) → autoscaling (L18).** HPA needs requests; the cluster autoscaler needs Pending (L16); probes keep autoscaled Pods honest. L19 storage is caused by a cluster-autoscaler drain, which shows that one solution's cost (moving Pods) is another's incident.
10. **Strategies (L20) → CI/CD (L21) → Argo CD (L22).** The word "deployment" is resolved first. Argo CD is only the CD half and needs CI to produce images. Push-model CI is the explicit pain that motivates pull-based GitOps.

## Justification: cuts and what was folded in

**Cut entirely:**
- Paxos/Raft (one sentence: "etcd uses Raft"), clocks, formal CAP/PACELC (gentle CAP only in a „Za znatiželjne” box).
- Cluster installation (kubeadm, certificates, etcd backup); use kind, minikube, Killercoda or a managed cluster.
- CNI / iptables / eBPF internals, beyond "rules on every node".
- Docker Swarm, Windows containers, multi-cluster setups and ApplicationSets.
- Kafka internals, beyond the partition-ordering sub-sim.

**Folded in instead of standalone lectures:**

| Topic | Where it goes instead |
|---|---|
| Observability | p50/p95/p99 and error metrics in every sim from L02; canary metric gates in L20; trace waterfall in L24; "next steps" pointer. Not requested, and it would break the incident chain. |
| Helm / Kustomize | One scene in L22 (rendering to plain YAML; Argo CD uses `helm template`). |
| Namespaces | DNS in L13; staging namespace in L15–L16. |
| RBAC | Only "who can read a Secret" in L15. |
| NetworkPolicy, Pod Security Admission | „Za znatiželjne” boxes in L15 and L24. |
| DaemonSet / Job / CronJob | Gallery in a L12 „Za znatiželjne” box; Job for migrations in L20 / L22. |
| CRDs and Operators | One sentence each in L22 (Application is a CRD) and L19 (database operators). |
| Service mesh | One sentence each in L13 (gRPC pinning) and L20 (traffic splitting). |
| VPA | One scene in L18. |

**Why 24 lectures rather than about 20:** the narrative-first lens needs each incident to get its own resolution. Merging lectures (for example L16 + L17, or L13 + L14) hides a link in the causal chain.

**Shortened path (18 lectures, about 13 h)** for lecturers with less time:
- Skip L01 if students already know networking.
- Merge L05 into the last scene of L04 plus a short L19 recap.
- Merge L14 into the end of L13.
- Merge L17's probe triad into L13 (readiness) and L16 (liveness, CrashLoopBackOff).
- Make L19 a „Za znatiželjne” appendix.
- Merge L09 into the end of L08.

Every explicit request remains covered.

## Open decisions and conflicts between research sources (resolve before authoring)

1. **Form of address.** AUTHORING.md (the project's own rule) mandates informal **„ti”** with gender-neutral phrasing. The terminology research recommends „vi”. *Follow AUTHORING.md*; all sample copy here uses ti.
2. **„image” vs „slika kontejnera”.** AUTHORING.md and pedagogy keep „image”; the terminology research prefers „slika”. *Follow AUTHORING.md*, with a one-time gloss.
3. **Running example.** Klopa (pedagogy, AUTHORING.md) vs „Kifla d.o.o.” (interactive-explainers research). *Klopa.* Use the reserved domain `klopa.example`, not `klopa.hr` or `kifla.hr`, which may be real domains.
4. **Docker Desktop education licence.** The tech-facts research says free for education. The pedagogy research says that since Dec 2024 free use is limited to enrolled students, and staff may need a licence. *Show a "check for your institution" fact callout* that names Podman Desktop, Rancher Desktop or Docker Engine on Linux as alternatives.
5. **ESO status.** The tech-facts research has precise GitHub release data: resumed Sept 2025, now v2.11. Use that, not pedagogy's "about June 2026".
6. **Gateway API version.** Use v1.6 (tech-facts) in fact callouts, not v1.5.
7. **„podatci” vs „podaci”.** Pick one site-wide; this outline uses „podatci” (IHJJ). Also confirm the module 1 title uses „raspodijeljeni” (with „distribuirani” mentioned once), replacing the placeholder „distribuirani” in `src/curriculum/data.ts`.
8. **Not verified by any research.** Check these at authoring time:
   - the current Node LTS image tag;
   - GitHub Actions major versions;
   - RabbitMQ and busybox image tags;
   - the KEDA and ESO API versions;
   - the exact Argo CD behaviour of UI/CLI rollback when auto-sync is on.

Context files read: `/Users/blaz/Documents/GitHub/kubernetes-lekcije/docs/AUTHORING.md`, `/Users/blaz/Documents/GitHub/kubernetes-lekcije/src/curriculum/data.ts`, `/Users/blaz/Documents/GitHub/kubernetes-lekcije/src/curriculum/types.ts`. The ids and slugs above are meant for `LectureMeta`.