# Teaching distributed systems, containers and Kubernetes to beginners: research and recommended approach

*Research date: 2026-10-01. Audience: CS/IT students in Croatia who can program and use a terminal but have never run servers, Docker or Kubernetes. Lecture language is Croatian. This report is the design basis for the curriculum.*

---

## 0. Summary of recommendations

1. **Teach problem-first, through one continuous story, not component by component.** The best beginner material all follows one application on its journey. That includes the official Kubernetes Basics tutorial (create cluster → deploy → explore → expose → scale → update), Phippy, and Google/Scott McCloud's comic. Component-first courses (architecture diagram in lecture 1) work for people who already want Kubernetes. Our students first have to learn *why* it exists.
2. **The course has one threshold concept: declarative desired state plus the reconciliation loop.** Teach it once, explicitly and interactively (lecture "Zašto Kubernetes"). Then reuse the *same* loop visual (observe → compare → act) for every later object: ReplicaSet, Deployment, Service endpoints, HPA. Argo CD is then shown as "the same loop, one level up". This one idea makes the rest of Kubernetes predictable.
3. **Macro-order:** Why distribute (one server → many → load balancer → queues) → How we package and run software (VM → container → Docker → Compose) → Kubernetes core (why → notional machine → Pod → Deployment → Service → Config/Secrets → resources/probes/scaling → state) → Delivery ("deployment" → CI/CD → GitOps/Argo CD) → Capstone.
4. **Running example: "Klopa"**, a fictional meal-ordering app for a student canteen. The 12:00 lunch rush is a natural, recurring load spike. It drives load balancing, queues ("kitchen tickets"), autoscaling, secrets (DB password, SMS-gateway key) and releases ("new vegetarian menu").
5. **Size:** about 20 lectures. Each has 25–35 min of active time, split into user-paced segments of 6 minutes or less. Median engagement in edX videos tops out around 6 minutes whatever the video length ([Guo, Kim & Rubin 2014](https://www.cs.rochester.edu/hci/pubs/pdfs/edX-MOOC-video-production-and-engagement_LAS-2014.pdf)).
6. **Cut:** consensus algorithms, cluster installation, networking internals (iptables, CNI), Helm/Kustomize/operators/service mesh beyond one sentence, and RBAC/NetworkPolicy beyond what the Secrets lecture needs.
7. **Correctness traps the simulations must not teach wrong:**
   - RAM is not speed.
   - A Kubernetes Service balances **per connection, picking a backend at random** by default. It does not balance per request with round robin.
   - base64 is not encryption.
   - Argo CD polls Git roughly every 3 minutes by default. It does not react instantly unless webhooks are set up.
   - The Ingress NGINX controller was retired in March 2026. The Ingress API itself still exists, and Gateway API is the recommended successor.

---

## 1. Survey: how others order and teach this material

### 1.1 Reference curricula and resources

| Source | Order and approach | Borrow | Avoid |
|---|---|---|---|
| **CNCF KCNA** (curriculum updated from 24 Nov 2025) | 4 domains. **Kubernetes Fundamentals 44%** (core concepts, administration, scheduling, containerization). **Container Orchestration 28%** (networking, security, troubleshooting, storage). **Cloud Native Application Delivery 16%** (application delivery, debugging). **Cloud Native Architecture 12%** (observability, ecosystem/principles, community). Observability moved into Architecture. ([LF announcement](https://training.linuxfoundation.org/?p=39839)) | A coverage checklist, so students who later want KCNA are well placed. Confirms that fundamentals (Pod/Deployment/Service/scheduling/containers) deserve most of the time. | Using it as an *order*. It is a blueprint for an exam, not a teaching sequence. Many study guides online still show the retired 5-domain version (e.g. [DevOpsCube](https://devopscube.com/kcna-study-guide/)). |
| **Kubernetes docs, Concepts section** | Overview → Cluster Architecture → Containers → Workloads → Services/LB/Networking → Storage → Configuration → Security → Policies → Scheduling → Resource Mgmt → Cluster Admin → Extending ([docs](https://kubernetes.io/docs/concepts/)). The Overview opens with a "going back in time" story: physical servers → virtualized → containers ([overview](https://kubernetes.io/docs/concepts/overview/)). | That historical arc is exactly our Module B. The "What Kubernetes is not" section (not a PaaS, does not do CI/CD, not just an orchestration system running a workflow) is ideal for the "Zašto Kubernetes" lecture. | Architecture before workloads. That is a reference order, not a learning order. |
| **Kubernetes Basics tutorial** | Create cluster → Deploy app → Explore (Pods/Nodes) → Expose (Service) → Scale → Rolling update ([tutorial](https://kubernetes.io/docs/tutorials/kubernetes-basics/)) | A user-journey order: each step answers "what do I want to do next with my app?". Our Module C follows this spine. | Starting with minikube/cluster creation. Our students should first understand *why*. |
| **learnk8s.io → now LearnKube** (learnk8s.io returns 301 to [learnkube.com](https://learnkube.com/)) | Production-focused training plus free long-form illustrated articles; known for step-by-step slideshow diagrams. | Their article on [long-lived connections not being load-balanced](https://learnkube.com/kubernetes-long-lived-connections) gives a correct and surprising "aha" for the Service lecture. The step-through diagram style maps directly onto user-paced Motion animations. | Production depth (instance calculators, tuning) is out of scope. |
| **Phippy / "The Illustrated Children's Guide to Kubernetes"** ([CNCF](https://www.cncf.io/phippy/the-childrens-illustrated-guide-to-kubernetes/)) | Container → Pod → ReplicationController → Service → Volume → Namespace. The sequel *Phippy Goes to the Zoo* adds DaemonSet, Ingress, CronJob and others ([CNCF](https://www.cncf.io/phippy/phippy-goes-to-the-zoo-book/)). | A story with a character (an app) that has needs, where each object answers one need. **CC-BY licensed**, so it can be translated or remixed with attribution ([CNCF](https://www.cncf.io/blog/2018/12/11/phippy-comes-to-cncf/)). | It uses **ReplicationController**, which is superseded by ReplicaSet/Deployment, and it predates Gateway API. Its nautical metaphor reinforces the misleading "captain gives orders" model (see §3). |
| **Google comic "Smooth Sailing with Kubernetes"** (Scott McCloud) | Narrative comic, problem-first ([Simon Willison's note](https://www.simonwillison.net/2021/Jul/1/smooth-sailing-with-kubernetes)) | Proof that a skilled visual storyteller can carry core concepts in a short narrative. | When fetched today, the original URL (cloud.google.com/kubernetes-engine/kubernetes-comic) returned GKE documentation, not the comic. **Check before linking students to it.** |
| **Julia Evans / Wizard Zines** | "Containers aren't magic": a container is a process plus Linux namespaces, cgroups and a changed root filesystem, shown in ~15 lines of bash ([comic](https://wizardzines.com/comics/containers-arent-magic), [blog](https://jvns.ca/blog/2016/10/10/what-even-is-a-container/), [zine](https://wizardzines.com/zines/containers/)) | The "a container is a process" reveal is the best fix for "a container is a small VM". Also her tone: curious, informal, one idea per page. | Going into seccomp/pivot_root detail. One "what's inside" box is enough. |
| **TechWorld with Nana** (4-hour Kubernetes course) | What K8s is → main components → architecture → minikube + kubectl → YAML → one demo project (MongoDB + Mongo Express) → namespaces, Ingress, Helm, volumes ([outline](https://opentools.ai/youtube-summary/kubernetes-tutorial-for-beginners-full-course-in-4-hours)) | Animated component explanations; **one demo project** carried through. | Components and architecture before motivation; Helm in a beginner course. |
| **KodeKloud "Kubernetes for the Absolute Beginners"** | Containers overview → orchestration → architecture → Pods → ReplicaSets → Deployments → Services → microservices app; browser labs ([course](https://www.coursera.org/learn/kubernetes-for-absolute-beginners)) | The Pod → ReplicaSet → Deployment → Service progression is the de facto standard. Immediate hands-on labs. | Little on *why* distributed systems exist at all. |
| **Bret Fisher, Docker Mastery** | Containers → images → volumes → **Compose** → Swarm → registries → Kubernetes → CI/GitHub Actions ([repo README](https://cdn.jsdelivr.net/gh/bretfisher/udemy-docker-mastery@main/README.md)) | **Docker in depth before orchestration, with Compose as the bridge.** Compose introduces multi-container apps, service-name DNS and declarative YAML on one machine. Kubernetes then generalizes this to many machines. | Swarm, which is historical for our purposes. |
| **MIT 6.5840 Distributed Systems** (Spring 2026) | Intro → RPC/threads → GFS → Paxos → Raft ×2 → linearizability → ZooKeeper → distributed transactions → Spanner. Labs: MapReduce, KV server, Raft, KV-Raft, sharded KV ([schedule](https://pdos.csail.mit.edu/6.824/schedule.html)) | Its motivation (why distribute: performance, fault tolerance, physical distribution, security) and the partial-failure mindset. | Almost everything else: consensus and consistency are graduate material. Keep only a teaser ("etcd uses Raft to agree on cluster state"). |
| **Croatian DS courses** ("Raspodijeljeni sustavi") | The FER course page returned HTTP 403 to automated fetches, so its syllabus could not be checked. PMF Split's "Raspodijeljeni sustavi" is representative: definition, pros and cons → resource sharing → middleware → communication → logical/vector/matrix clocks → mutual exclusion → client-server → P2P ([PMF Split PDF](https://www.pmfst.unist.hr/wp-content/uploads/predmeti/PMIC50.pdf)) | These courses are theory-first. Ours should be the **practice-first complement**: give students the "why" and working intuition, so a later formal DS course has hooks to attach to. Use the term "raspodijeljeni sustav" to match Croatian academic usage. | Duplicating clocks and mutual-exclusion algorithms. |
| **DDIA, 2nd ed.** (Kleppmann & Riccomini, 2026) | Opens with *trade-offs* (Ch. 1, "Trade-offs in Data Systems Architecture") and *nonfunctional requirements* (Ch. 2, "Defining Nonfunctional Requirements": performance, load, reliability, scalability, maintainability) **before** any mechanism. Then storage/encoding, then distributed data: replication → **sharding (Ch. 7)** → transactions → "trouble with distributed systems" → consistency/consensus ([Kleppmann](https://martin.kleppmann.com/2026/03/24/designing-data-intensive-applications-2e.html), [O'Reilly ch. 2](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781098119058/ch02.html), [ch. 7](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781098119058/ch07.html)) | **Requirements vocabulary first:** load, throughput, latency percentiles (p50/p95), availability. Our lecture 1 should give students these words, and every simulation should show p95 latency and error rate, not just "server is red". Replication before sharding. | Data-system internals (storage engines, transactions) are out of scope. |
| **van Steen & Tanenbaum, Distributed Systems 4th ed.** (2023) | Introduction → architectures → processes → communication → coordination → naming → consistency & replication → fault tolerance → security ([overview](https://system-design.space/en/chapter/tanenbaum-ds-book/)). Virtualization and containers sit under "processes". | Supports framing VM vs container as "*how we run processes*", which fits our Module B. | |

### 1.2 Synthesis: two ordering families

- **Component-first** (Nana, KodeKloud, the docs): architecture → objects → demo. Efficient for motivated practitioners. For true beginners it makes the control plane a list of names to memorize.
- **Journey/problem-first** (Kubernetes Basics, Phippy, the McCloud comic, Bret Fisher's Docker → Compose → K8s): each new concept answers a pain the learner has just felt.

**Recommendation: use the journey order and introduce architecture "just in time"**, as a minimal *notional machine*. A notional machine is an idealized model of the system built to explain behavior ([du Boulay; ITiCSE 2020 working group](https://luce.si.usi.ch/publications/2020-06-01-notional-machines.html)). Introduce it right after the "why Kubernetes" lecture, at the moment students ask "*who* restarts my container?". Component internals stay out.

---

## 2. Recommended macro-ordering

### 2.1 Lecture sequence

Titles are in Croatian (the lecture language). "Opt." means optional/short.

| # | Lecture (HR) | Core question | Key interactive | Needs |
|---|---|---|---|---|
| **Module A: Zašto raspodijeljeni sustavi?** ||||
| 0 | **Mrežni minimum** (HTTP, IP, port, DNS, localhost) | What happens when I type a URL? | Follow a request: DNS → IP → port → HTTP request/response | none |
| 1 | **Jedan server i njegove granice** | Why does my app slow down and then die under load? | Request-rate slider against one server (CPU/RAM). The latency "hockey stick" near 100% utilization. Vertical-scale button (2→4→8 GB) with cost meter and ceiling. Crash = everything down (SPOF). Short intro to "what is a deploy: laptop → server". | 0 |
| 2 | **Zašto distribuirati?** | Why not just buy a bigger server? What does distribution cost? | Add servers and watch the DB become the bottleneck. Failure injection (kill a server, slow a link). "Slow or dead?" timeout game. Stateless vs stateful toggle. | 1 |
| 3 | **Load balancer** | How do we spread traffic, and what is "fair"? | **The lecturer's sim:** configure servers (CPU, RAM 2/4/8 GB), choose an algorithm, send traffic, kill servers, toggle health checks and sticky sessions. Metrics: throughput, p95, error rate, per-server load. | 2 |
| 4 | **Redovi poruka i događaji** | How do we survive the 12:00 burst without losing orders? | Producer/queue/consumer sim: burst, add workers, inject a duplicate, toggle idempotency, dead-letter queue, queue vs pub/sub toggle. | 2, 3 |
| 5 *(opt.)* | **Gdje živi stanje?** (DB, cache, replication basics) | Why are databases the hard part? | Cache hit/miss sim; replication-lag "read your own write" demo | 2 |
| **Module B: Kako pakiramo i pokrećemo softver** ||||
| 6 | **Fizički server → virtualni stroj → kontejner** | Why do we need VMs and containers at all? | Layer-stack explorer (hardware/hypervisor/guest OS vs kernel/runtime). Density and boot-time race. "A container is a process" reveal. | 1 |
| 7 | **Docker: image, kontejner, Dockerfile** | How do I package Klopa so it runs the same everywhere? | Dockerfile build with layer caching. Image → many containers (class/instance). Write a file, delete the container, the file is gone. Port-mapping visual. | 6, 0 |
| 8 | **Više kontejnera: Docker Compose** | How do api + worker + DB + Redis run together? | Compose map with service-name DNS. Kill a container. Kill the *host*: everything dies. This is the motivation for orchestration. | 7, 4 |
| **Module C: Kubernetes** ||||
| 9 | **Zašto Kubernetes? Željeno stanje i petlja usklađivanja** | Who keeps 30 containers on 10 machines alive at 12:05? | "Ops-person game": manually placing and restarting vs declaring desired state. Thermostat → controller loop animation. | 3, 8 |
| 10 | **Kako klaster radi iznutra** (minimal notional machine) | What happens after `kubectl apply`? | Follow one manifest: API server → etcd → controller → scheduler → kubelet → runtime. Kill the control plane: pods keep running but nothing heals. | 9 |
| 11 | **Pod** | What is the smallest thing Kubernetes runs? | Pod anatomy (shared IP/volume). Delete a bare Pod: it is gone for good. IP changes on re-create. First annotated YAML (apiVersion/kind/metadata/spec). | 10 |
| 12 | **Deployment i ReplicaSet** | How do I keep N copies alive and update them safely? | Replicas slider; kill pods and watch them recreated; rolling update with maxSurge/maxUnavailable; rollback. Disambiguate "Deployment" the object from "deploying" the activity. | 11 |
| 13 | **Service i mreža u klasteru** | How do clients find Pods that keep changing? | Stable Service vs churning Pods; label-selector matching (fix a typo and see empty endpoints); ClusterIP/NodePort/LoadBalancer; per-connection balancing; Gateway API teaser. | 12, 3 |
| 14 | **ConfigMap i Secret** | Where do the DB password and SMS key go? | base64 "decode reveal"; who can read a Secret; env-var vs volume update behaviour; "can we commit this to Git?" | 12 |
| 15 | **Resursi, probe i autoskaliranje** | How does Kubernetes decide where Pods go, and when to add more? | Bin-packing scheduler on 2 GB/4 GB nodes (callback to L3); OOMKilled vs CPU throttling; readiness removes a Pod from the Service; HPA at the lunch rush. | 12, 13 |
| 16 *(short)* | **Pohrana i stateful aplikacije** | Why can't I just run Postgres with `replicas: 3`? | emptyDir vs PersistentVolume; three separate DBs vs a replicated DB; StatefulSet identities | 12, 5 |
| **Module D: Isporuka softvera** ||||
| 17 | **Što je deployment?** (environments, strategies, rollback) | How does a commit become something users see, safely? | Strategy race: recreate vs rolling vs blue/green vs canary, with bug injection; deploy vs release | 12 |
| 18 | **CI/CD** | How do we automate build → test → package → deliver? | Pipeline builder; a failing test stops the line; image versioning; Delivery vs Deployment toggle (manual gate) | 7, 17 |
| 19 | **GitOps i Argo CD** | Why let the cluster *pull* its state from Git? | Push vs pull animation; commit → Argo detects (timer or webhook) → sync; drift: manual `kubectl scale` → OutOfSync → self-heal; secrets in GitOps | 9, 14, 18 |
| 20 | **Završni projekt: Klopa na dan izdanja** | Can you trace and fix the whole path? | End-to-end replay (commit → CI → registry → Git → Argo CD → rolling update → Service → LB → user) with "break it and diagnose" challenges; a map of what to learn next | all |

### 2.2 Why this order (the dependency arguments)

- **Why before how (Module A before Docker).** Without the pain of one server, Kubernetes looks like bureaucracy. DDIA 2e also starts with trade-offs and nonfunctional requirements before mechanisms. *Risk:* students want to touch Docker. *Fix:* show a 30-second "trailer" of the finished Klopa cluster in lecture 0, so they know where the journey ends.
- **Networking minimum (L0) first.** This applies Mayer's *pre-training* principle: learners do better with complex material when they already know the names and characteristics of the key parts ([Mayer's principles](https://services.dartmouth.edu/TDClient/1806/Portal/KB/PrintArticle?ID=171655)). Ports, localhost and DNS cause most of the confusion later in Docker and Services.
- **Load balancer (L3) before Kubernetes Service (L13).** A Service *is* a (layer-4, per-connection) load balancer plus service discovery. Students who have built the general schema in L3 can see what a Service does and does not do.
- **Queues (L4) in Module A.** Queues are a pure distributed-systems idea, independent of Kubernetes, and the lecturer asked for them. Placing L4 right after L3 gives a strong contrast. The LB *pushes* work to servers. A queue lets workers *pull* work (competing consumers), which is load balancing by pull and smooths bursts.
- **VM before container (L6).** The contrast needs a baseline. The Kubernetes docs use the same historical order.
- **Docker → Compose → Kubernetes (L7–L9).** Compose teaches multi-container apps, service-name DNS and declarative YAML on *one* host. Its failure mode (the host dies, everything dies; no scheduling across machines) is the exact motivation for Kubernetes. This is Bret Fisher's sequence.
- **"Why Kubernetes" with the reconciliation loop before any object.** Every object afterwards is "another controller loop", so it is easier to learn. The docs say Kubernetes is a set of independent control processes driving current state toward desired state, not a workflow engine ([overview](https://kubernetes.io/docs/concepts/overview/), [controllers](https://kubernetes.io/docs/concepts/architecture/controller/)).
- **Minimal architecture (L10) right after L9, not before.** Students need to know *who* acts in the loop (API server/etcd as the shared memory; controllers, scheduler and kubelet as actors), but no more.
- **Pod → Deployment → Service.** This is the standard progression (Kubernetes Basics, KodeKloud, Phippy). Bare Pods first, so students *feel* that nothing heals them, which motivates Deployments.
- **Config/Secrets (L14) after Deployment+Service** (there is now something to configure) and **before GitOps (L19)**, because GitOps immediately raises "how do secrets get into the cluster if everything is in Git?".
- **Resources/probes/HPA (L15) after Service.** Readiness probes change Service endpoints, and requests/limits reuse the 2 GB/4 GB intuition from L3.
- **"What is deployment" (L17) before CI/CD and Argo CD.** Argo CD is only the CD half and needs CI to produce images. The *word* "deploy" is first introduced informally in L1 (laptop → server) and disambiguated from the K8s object in L12.

### 2.3 Dependency sketch

```
L0 → L1 → L2 ─┬→ L3 ─┬→ L4
              │      │
              └→ L5? │
L1 → L6 → L7 → L8 ←──┘(L4)
L3 + L8 → L9 → L10 → L11 → L12 ─┬→ L13 → L15
                                ├→ L14 ─────────┐
                                ├→ L16?         │
                                └→ L17 → L18 → L19 → L20
```

### 2.4 KCNA coverage map (for students who later want the certification)

- **Fundamentals (44%):** L6, L7, L9–L13, L15
- **Orchestration (28%):** L13 (networking), L14 (security basics), L16 (storage), and the "diagnose" segment of each lecture (troubleshooting)
- **App Delivery (16%):** L17, L18, L19, L20
- **Architecture (12%):** L2, L20, and optional observability material

---

## 3. Analogies: what works, what misleads, and where each breaks

**Rules for using analogies in this course**

1. **One anchor analogy per module, then retire it.** Mixing kitchen, ship and orchestra in one lecture creates three competing models.
   - Module A: restaurant/kitchen (+ supermarket checkouts).
   - Module B: class/object and git commits. CS students already have these.
   - Modules C and D: thermostat/controller, used consistently.
2. **Every analogy gets a "Gdje analogija puca" (where it breaks) box.** Seeing exactly where an analogy fails is itself learning.
3. **Prefer CS-native analogies.** These students know OOP, git and processes, so analogies built on those transfer more precisely than everyday-life ones.
4. **Animation must encode meaning.** Animations are not automatically better than static pictures. The research favours animations whose structure matches the concept (*congruence*) and that the learner can perceive and control (*apprehension*). See Tversky, Morrison & Bétrancourt (2002), "Animation: can it facilitate?", *IJHCS* 57(4). Motion should therefore only show things that actually move: requests, messages, Pods being replaced.

| Concept | Analogy | Works for | Breaks where | Verdict |
|---|---|---|---|---|
| **Single server overload** | One cook in a kitchen at lunchtime | Fixed capacity; orders pile up; a slow cook means slow service for everyone; waiting time explodes when nearly full | A cook gets tired gradually and visibly. A server can fall over suddenly (OOM) or fail silently. | **Use** as Module A anchor |
| **Vertical vs horizontal scaling** | Faster, more expensive cook vs more cooks | Cost ceiling of one super-cook; more cooks need coordination | More cooks share *one* fridge and stove. That is the shared DB/bottleneck, so make it explicit rather than leaving it out. | **Use**, and show the shared fridge |
| **Distributed system overall** | A team of colleagues who can only communicate by text message | Messages arrive late or never. You can't tell if a colleague is slow, busy or gone. No shared clock. | Humans have intuition and can phone. Machines only have timeouts. | **Use** to teach partial failure and the [8 fallacies of distributed computing](https://lawsofsoftwareengineering.com/laws/fallacies-of-distributed-computing/) |
| **Load balancer** | Restaurant host seating guests at tables, or a supermarket checkout dispatcher | Spreading work; a big table vs small table (heterogeneous servers); not sending guests to a closed section (health check) | The host can *see* how busy each waiter is. An LB only knows what health checks and connection counts tell it. It does not know how "heavy" a request is. The host is also obviously a single point of failure, while the LB's SPOF status is easy to miss. | **Use**, and the sim must show the blind spots |
| **Load balancer** | "Traffic cop" | Directing flows | Suggests the LB is smart and sees the whole road. Most algorithms are simple (round robin, least connections). | **Avoid** or caveat |
| **Message queue** | Kitchen order-ticket rail | Decoupling waiter and cook; buffering bursts; multiple cooks taking the next ticket (competing consumers) | Paper tickets don't get duplicated. Real queues are usually at-least-once, so the same order can be "cooked twice". Ticket order can also be lost with several cooks. | **Use**, and turn the break into the idempotency lesson |
| **Message queue** | Post office / mailbox | Async: sender leaves without waiting | Implies exactly-once, ordered, and that the post office keeps letters forever. | **Avoid** as the main analogy |
| **Pub/sub** | Radio broadcast / newsletter subscription | One message, many independent receivers | Radio listeners who tune in late miss the broadcast. Some brokers (log-based) keep messages and let consumers replay. | **Use** briefly next to the queue |
| **VM vs container** | House vs apartment (popularized by Docker's Mike Coleman, [Docker blog](https://www.docker.com/ja-jp/blog/containers-are-not-vms/)) | VMs bring their own "plumbing" (a full OS/kernel). Containers share the building's infrastructure (the host kernel), so density is higher and startup faster. | (1) Apartment walls are solid. Container isolation is weaker, and a kernel exploit can cross apartments. (2) It suggests a container has its own little OS with a kernel. It does not. (3) It suggests long-term residents, while containers are meant to be disposable. | **Use with a mandatory break-box**, followed by the "container = process" reveal |
| **Container** | Shipping container (Docker's namesake) | Standard interface: tools (cranes = runtimes/orchestrators) handle the box without knowing what is inside, so it is portable | (1) "Runs anywhere" fails across CPU architectures (amd64 vs arm64/Apple Silicon) and kernels: a Linux container on macOS or Windows needs a Linux VM ([Docker Desktop internals](https://www.docker.com/blog/the-magic-behind-the-scenes-of-docker-desktop/)). (2) A steel box is a security boundary; a software container is just a restricted process. (3) It blurs *image* (the template) with *container* (the running instance). | **Use for "standardization" only**, and say explicitly where it breaks |
| **Image vs container** | **Class vs object (instance)** | One image, many containers. Containers are created and destroyed and the image is unchanged. Each instance has its own state. | Images are layered and immutable. "Instance state" (the writable layer) is thrown away when the container is removed, unlike objects you might serialize. | **Best analogy for CS students.** Make it the anchor. |
| **Dockerfile / layers** | Recipe → dish; layers as **git commits** | Build steps are reproducible. Each layer is an immutable diff on the previous one, so caching works ("unchanged commit, reuse it"), and order matters (put rarely changing steps first). | Layers can't be rebased or edited. A secret added in one layer and deleted in the next is still in history. | **Use git commits** (it teaches caching and the secret-leak trap) |
| **Kubernetes overall** | **Orchestra conductor** | Many players, coordinated outcome | **Misleads.** A conductor runs a *script* (do A, then B) and every musician waits for the baton. The Kubernetes docs say it is *not* a mere orchestration system: it is independent control loops driving toward desired state ([overview](https://kubernetes.io/docs/concepts/overview/)). Also, if the conductor stops the music stops, while if the control plane dies running Pods keep running. | **Avoid**, or show it as a "myth" and contrast it |
| **Kubernetes overall** | Ship's captain / helmsman (etymology; Phippy's Captain Kube) | Naming; branding; a fun hook | Same problem as the conductor: one commander giving orders. | **Use for etymology only** |
| **Reconciliation loop** | **Thermostat** (used by the Kubernetes docs themselves, [controllers](https://kubernetes.io/docs/concepts/architecture/controller/)) | Desired vs actual; acts on the *difference*; runs continuously; doesn't care *why* the room got cold (level-triggered) | (1) One variable and one actuator, while Kubernetes has many controllers each owning a slice, chained (Deployment → ReplicaSet → Pod → kubelet). (2) A thermostat adjusts gradually; Kubernetes *replaces* things in discrete steps (a new Pod with a new name/IP rather than a "repaired" one). (3) The docs note a cluster may never reach a stable state, and that's fine. | **Use as the course-wide anchor.** Upgrade it to a "chain of thermostats". Reuse it for HPA and Argo CD. |
| **Control plane** | Restaurant manager with a whiteboard | The whiteboard (etcd via the API server) is the single shared truth. Staff (controllers, kubelet) read it and act independently. Nobody talks directly; everything goes via the board. | The manager seems to *give orders*. In reality components *watch* the board and act themselves. | **Use the whiteboard part**, and drop "manager gives orders" |
| **Pod** | Roommates sharing one apartment, address and fridge | Containers in a Pod share an IP (localhost) and volumes and are scheduled together | Suggests Pods are long-lived homes. Pods are disposable and replaced, not repaired. | **Use**, paired with the next row |
| **Pod disposability** | Pets vs cattle | Don't nurse a sick server/Pod; replace it | Some audiences find it callous. Stateful workloads (StatefulSet) do keep identity. | **Use carefully** (e.g. "rented scooters vs your own bike") |
| **Deployment / ReplicaSet** | Staffing contract: "always 3 waiters on shift; replace anyone who leaves; change uniforms one person at a time" | Desired replica count; self-healing; rolling update | The contract doesn't specify *which* waiter. Pods are interchangeable, so they must be stateless. | **Use** |
| **Service** | Company's main phone number / reception desk | Stable address while employees (Pods) come and go | (1) Kubernetes Services in kube-proxy mode are mostly forwarding rules on every node, not a running "receptionist box". A ClusterIP is virtual and often can't be pinged. (2) The receptionist picks wisely; a Service picks **at random per connection** ([virtual IPs docs](https://kubernetes.io/docs/reference/networking/virtual-ips/)). | **Use**, and show the rules on each node in the "how it actually works" expandable |
| **Labels / selectors** | Hashtags and a saved search | Loose coupling: a Service doesn't "own" Pods, it matches tags | (none significant) | **Use** (Phippy uses "name tags") |
| **Namespace** | Folders / company departments | Grouping, name scoping | Not a security boundary by itself (needs RBAC, NetworkPolicy). Nodes and some objects are cluster-wide. | **Use with a caveat** |
| **Secret** | Sealed envelope / safe | Intent: "handle with care" | **Misleads badly.** A Secret is base64 *encoded*, not encrypted, and is stored unencrypted in etcd by default. Anyone who can create Pods in the namespace can read it ([Secrets docs](https://kubernetes.io/docs/concepts/configuration/secret/)). | **Replace with:** "a ConfigMap with a *handle-with-care* sticker". Protection comes from RBAC, encryption at rest and external stores. |
| **Requests / limits** | Restaurant reservation (request) vs a house rule on maximum consumption (limit) | The scheduler seats by *reservations*, not by actual consumption. Exceeding the limit has consequences. | Memory over the limit means you get thrown out (OOMKilled). CPU over the limit means you are slowed down (throttled). The analogy needs both consequences spelled out. | **Use** |
| **CI** | Automatic spell-and-grammar check plus a test print on every save | Fast feedback on every change to the shared mainline | Suggests CI is a tool. CI is a *practice* (integrate small changes often); the server just automates it. | **Use** |
| **CD** | Conveyor from factory to shop shelf, with or without a final human "release" button | Delivery (button) vs Deployment (automatic) ([Fowler-based summary](https://www.itwriting.com/blog/?p=4797)) | (none significant) | **Use** |
| **GitOps / Argo CD** | Architect's blueprint (Git) plus a site foreman (Argo CD) who keeps comparing the building with the blueprint and fixes deviations | Single source of truth; drift detection; audit trail | The foreman isn't watching every second: Argo CD checks about every 3 minutes by default unless webhooks are set up. The foreman doesn't make the bricks: Argo CD doesn't build images. | **Use, or better, reuse the thermostat:** "a thermostat whose set point lives in Git" |
| **Kubernetes = operating system for the datacenter** | Popular slogan | Scheduling, resource isolation, abstraction over machines | Kubernetes doesn't give you databases, CI/CD, logging and the like (it is "not a PaaS", per the docs). | **Mention once**, with a caveat |

---

## 4. Common misconceptions per topic, and how to preempt them

Format: **Misconception** → reality → *how to preempt in the lecture or sim.* The predict-then-observe pattern is the most reliable preemption tool. Have students commit to a prediction before running the sim, then explain the gap. This is the POE model, which has evidence in science education with simulations ([Zacharia et al.](https://gnosis.library.ucy.ac.cy/handle/7/38662)).

### 4.1 Why distributed systems (L1–L2)
1. **"Twice the servers means twice the capacity."** → A shared component (usually the DB) caps throughput. *Sim: add app servers until the DB bar saturates and p95 stops improving.*
2. **"Distributed means more reliable automatically."** → More parts means more failures. With 10 servers at 99% uptime each, at least one is down about 10% of the time. Reliability comes from *redundancy plus design*. *Show the probability as an animated grid of servers.*
3. **"The network is reliable and fast."** (the [8 fallacies](https://lawsofsoftwareengineering.com/laws/fallacies-of-distributed-computing/)) → Requests get lost or delayed, and a slow node looks exactly like a dead one. *"Slow or dead?" game: students pick a timeout and see the false positives and false negatives.*
4. **"Every app needs microservices and Kubernetes."** → Many apps run fine on one server. Distribute when load, availability or geography requires it. *Begin L2 with a "do you even need this?" checklist.*
5. **"Vertical scaling is bad or obsolete."** → It is often the right *first* move. Its limits are the cost curve, the hardware ceiling and the SPOF.

### 4.2 Load balancers (L3)
1. **"A load balancer makes each request faster."** → It adds capacity, not speed. A single request even gets one more hop. *Show single-request latency next to throughput.*
2. **"Round robin is fair."** → With heterogeneous servers (2 GB vs 4 GB, 2 vs 8 cores) or heterogeneous requests, round robin overloads the weak server. Weighted round robin or least-connections fixes this. *This is exactly the lecturer's 2 GB/4 GB scenario. Make students predict first.*
3. **"The LB removes single points of failure."** → The LB itself is a SPOF unless it is redundant (pairs, DNS, managed cloud LB). *Let students kill the LB.*
4. **"The LB knows when a server is broken."** → Only through health checks. A wrong check either sends traffic to a broken server or removes healthy ones. *Sim: health-check interval and path settings.*
5. **"Sessions just work behind a load balancer."** → An in-memory session (shopping cart) is lost when the next request hits another server. Sticky sessions mitigate this at a cost to balance; externalizing state (Redis/DB) fixes it. *This leads directly to "stateless" as a design goal.*
6. **"Balancing is per request."** → Many L4 balancers, including a Kubernetes Service, decide per *connection*. Keep-alive, HTTP/2 and gRPC connections pin a client to one backend ([LearnKube](https://learnkube.com/kubernetes-long-lived-connections)). *Plant this in L3 (L4 vs L7 toggle) and pay it off in L13.*

### 4.3 Queues and events (L4)
1. **"A queue makes processing faster."** → It smooths bursts. If the arrival rate stays above the processing rate, the queue grows without bound. *Sim: arrival vs service rate sliders and an ever-growing queue; the fix is more consumers or backpressure.*
2. **"Each message is delivered exactly once."** → Most systems are at-least-once; true exactly-once delivery is not achievable over an unreliable network. Use idempotent consumers ("effectively once") ([summary](https://codemia.io/archive/at-least-once-vs-exactly-once-delivery)). *Inject a duplicate. Without an idempotency key the same order is cooked twice; with one, the duplicate is ignored.*
3. **"Messages are processed in order."** → With multiple consumers, order is not guaranteed. Some systems guarantee order only per partition or key. *Two workers at different speeds visibly reorder messages.*
4. **"Async means nobody waits for the result."** → The user still needs an outcome. Return a status/ID, then notify or let them poll.
5. **"Queue, event bus and pub/sub are the same."** → Point-to-point (competing consumers, each message handled by one worker) vs publish/subscribe (each subscriber gets a copy). *Toggle in the sim.*
6. **"A failed message just disappears or retries forever."** → Use retry limits plus a dead-letter queue. *A poison message in the sim.*

### 4.4 Virtualization vs containers (L6)
1. **"A container is a lightweight VM."** → It is a process with a restricted view (namespaces) and limits (cgroups) and no kernel of its own ([Julia Evans](https://jvns.ca/blog/2016/10/10/what-even-is-a-container/)). *Reveal: the container's process is visible in the host's process list, and `uname -r` matches the host.*
2. **"Containers isolate as strongly as VMs."** → The kernel is shared, which is why some platforms wrap containers in micro-VMs. Apple's `container` 1.0 (June 2026) runs each Linux container in its own lightweight VM on Apple silicon ([cloudnativenow](https://cloudnativenow.com/features/apple-ships-stable-1-0-of-its-native-container-tool-for-macos/)). *Use it as a "the line is blurring" box.*
3. **"Containers replaced VMs."** → In the cloud, Kubernetes nodes are usually VMs, so both layers coexist. *Layer diagram: VM nodes → containers.*
4. **"Docker runs natively on my Mac/Windows."** → Linux containers need a Linux kernel, so Docker Desktop runs a hidden Linux VM ([Docker blog](https://www.docker.com/blog/the-magic-behind-the-scenes-of-docker-desktop/)).
5. **"Any image runs anywhere."** → CPU architecture (amd64/arm64) and OS kernel (Linux vs Windows containers) matter.

### 4.5 Docker and images (L7–L8)
1. **"Image and container are the same thing."** → Class vs instance.
2. **"Changes inside a running container are saved."** → The writable layer is lost when the container is removed. Use volumes for data and rebuild the image for code. *Sim: write a file, remove the container, the file is gone.*
3. **"Docker = containers" / "Kubernetes runs Docker".** → Images follow the OCI standard. Kubernetes talks to runtimes like containerd or CRI-O through the CRI; dockershim was removed in v1.24, and Docker-built images still run fine.
4. **"`:latest` means the newest, fixed version."** → It is a movable label. Use explicit versions or digests. This is essential later for GitOps and rollbacks.
5. **"`localhost` inside the container is my laptop" / "EXPOSE publishes the port".** → A container has its own network namespace. Publishing needs `-p` or Compose `ports`. *Port-mapping animation.*
6. **"Putting a secret in ENV or COPY in the Dockerfile is fine."** → It is baked into layers and history.
7. **(Compose) "Containers talk via IP addresses I need to look up."** → Compose gives DNS by service name. *This sets up Kubernetes Service DNS.*

### 4.6 Kubernetes in general (L9)
1. **"Kubernetes is a container runtime / replaces Docker."** → It orchestrates; runtimes run the containers.
2. **"Kubernetes makes my app scalable automatically."** → Only if the app is stateless and horizontally scalable, and autoscaling still has to be configured.
3. **"`kubectl` commands *do* things immediately."** → You submit desired state and controllers act asynchronously. A successful `kubectl apply` does not mean the app is running. *Show the time gap in an animation.*
4. **"Kubernetes gives me CI/CD, logging, a database."** → It is not a PaaS ([overview](https://kubernetes.io/docs/concepts/overview/)).
5. **"Kubernetes executes a plan (step 1, step 2, …)."** → Independent loops converge on the desired state. *This is the conductor myth; contrast it with the thermostat.*

### 4.7 Cluster architecture (L10)
1. **"The control plane runs my containers."** → It decides; kubelets on nodes run the containers.
2. **"If the control plane dies, all apps die."** → Running Pods continue. Healing, scheduling and changes stop. *Sim: kill the control plane, traffic still flows, kill a Pod, it is not replaced.*
3. **"The scheduler starts containers."** → It only *assigns* a node; the kubelet starts the containers.
4. **"Components call each other directly."** → Everything goes through the API server, and only the API server talks to etcd. *Hub-and-spoke animation.*

### 4.8 Pods (L11)
1. **"Pod = container."** → A Pod wraps one or more containers that share network and volumes.
2. **"A Pod is healed in place and keeps its IP."** → Containers may restart in place, but a rescheduled Pod is a *new* Pod with a new name and IP.
3. **"Put web + DB in one Pod to keep them together."** → They would scale together, which is wrong. Use one main concern per Pod.
4. **"You create Pods directly."** → In practice you create Deployments (or other controllers). *Demonstrate the bare-Pod failure.*

### 4.9 Deployments and ReplicaSets (L12)
1. **The word "Deployment"** (K8s object) vs **"deployment"** (the act of releasing). *Glossary chip: in Croatian text, "Deployment" capitalized means the object; "deploy/isporuka" means the activity.*
2. **"More replicas means more machines."** → Pods and nodes scale independently. Without room on nodes, Pods stay Pending.
3. **"Rolling updates are automatically zero-downtime."** → Only with readiness probes and enough replicas. During the rollout *both versions serve traffic at the same time*, so they must be compatible (API, DB schema).
4. **"A Deployment manages Pods directly."** → Through ReplicaSets, which is how rollback history works.
5. **"`kubectl scale`/`edit` in production is fine."** → It creates drift from Git. *Pays off in L19.*

### 4.10 Services and networking (L13)
1. **"A Service is a running process/box."** → It is an abstraction implemented by node-level forwarding rules (kube-proxy, iptables by default in v1.37, with nftables planned as the future default). A ClusterIP is virtual ([docs](https://kubernetes.io/docs/reference/networking/virtual-ips/)).
2. **"A Service load-balances requests evenly (round robin)."** → It picks a backend at random *per connection* by default.
3. **"A Service points at a Deployment."** → It selects *Pods by labels*. One typo means zero endpoints. *Matching game.*
4. **"`type: LoadBalancer` works everywhere."** → It needs a cloud provider or an add-on. On kind/minikube it stays pending without extra tooling.
5. **"Ingress is a kind of Service" / "Ingress is dead".** → Ingress is a separate API that needs a controller. The popular *Ingress NGINX controller* was retired in March 2026; the Ingress API is not deprecated; **Gateway API** is the recommended successor ([K8s blog](https://kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/)).
6. **"A Service name resolves from anywhere."** → A short name resolves within the namespace; elsewhere use `name.namespace` or the FQDN.

### 4.11 ConfigMaps and Secrets (L14)
1. **"Secrets are encrypted."** → base64 is encoding. Secrets are stored unencrypted in etcd unless encryption at rest is enabled ([docs](https://kubernetes.io/docs/concepts/configuration/secret/)). *Interactive "decode" button.*
2. **"Only admins can read Secrets."** → Anyone who can create a Pod (or Deployment) in the namespace can read its Secrets ([docs](https://kubernetes.io/docs/concepts/configuration/secret/)). *"Who can see this?" explorer.*
3. **"It's a Secret object, so committing it to Git is fine."** → Never commit it. Use Sealed Secrets, SOPS or an external secret store with External Secrets Operator / Secrets Store CSI driver.
4. **"Updating a ConfigMap/Secret updates the running app."** → Env vars don't change until the Pod restarts. Mounted files update eventually, and the app must re-read them.
5. **"ConfigMap vs Secret doesn't matter."** → Different RBAC, handling and tooling. Keep sensitive data in Secrets so it can be protected separately.

### 4.12 Resources, probes and autoscaling (L15)
1. **"Limits are what the scheduler reserves."** → The scheduler uses *requests*; limits are enforced at runtime.
2. **"Exceeding memory just makes it slow."** → Exceeding a memory limit gets the container OOMKilled; exceeding a CPU limit gets it throttled.
3. **"Liveness should check the DB too."** → If the DB goes down, every Pod gets restarted (a cascade). Liveness answers "am I stuck?"; readiness answers "can I take traffic now?".
4. **"HPA adds nodes."** → HPA adds Pods; a cluster autoscaler adds nodes.

### 4.13 Storage and state (L16)
1. **"The container filesystem persists."** → No (see 4.5).
2. **"Any volume is persistent."** → `emptyDir` dies with the Pod; PersistentVolumes outlive Pods.
3. **"Postgres with `replicas: 3` gives a database cluster."** → It gives three independent databases. Replication is the database's job (StatefulSet plus DB-level replication, or a managed database).

### 4.14 "Deployment" as an activity, and release strategies (L17)
1. **"Deploy = release."** → Deploy means code is running in production. Release means users can see it, and feature flags can separate the two.
2. **"Rollback is always safe."** → DB migrations may be irreversible. *Show the expand/contract idea briefly.*
3. **"Blue/green and canary are built into Kubernetes Deployments."** → Native strategies are RollingUpdate and Recreate. Canary and blue/green need extra tooling (e.g. Argo Rollouts) or manual Service switching.
4. **"Staging passing means production will work."** → Environments differ in data, scale and config. That is why progressive delivery and monitoring exist.

### 4.15 CI/CD (L18)
1. **"CI/CD is a tool (Jenkins/GitHub Actions)."** → It is a practice; tools automate it.
2. **"CD always means automatic deploy to production."** → Continuous *Delivery* (always deployable, with a human button) vs Continuous *Deployment* (automatic) ([summary of Fowler's definitions](https://www.itwriting.com/blog/?p=4797)).
3. **"CI = build; tests are optional."** → The value of CI is fast feedback on the integrated mainline, and without tests that feedback is weak.
4. **"The pipeline should `kubectl apply` to production."** → That is the push model: the CI system holds cluster credentials, and the cluster can drift. GitOps is the pull alternative (L19).

### 4.16 GitOps and Argo CD (L19)
1. **"Argo CD builds and tests my code."** → It only syncs manifests from Git to the cluster. CI builds the image.
2. **"Argo CD reacts instantly to a push."** → It polls (default about 3 minutes, configurable) unless webhooks are configured ([reconciliation timeout notes](https://oneuptime.com/blog/post/2026-02-26-argocd-reconciliation-timeout/view)). *Show a visible countdown timer and a "webhook" toggle in the sim.*
3. **"GitOps = YAML in Git."** → It also means pulled automatically **and** continuously reconciled: the four [OpenGitOps principles](https://opengitops.dev/).
4. **"My manual `kubectl` change will stay."** → It shows as OutOfSync, and with self-heal it is reverted. *Drift demo.*
5. **"Roll back by clicking in the Argo CD UI."** → In GitOps the preferred rollback is `git revert`. Git stays the source of truth.
6. **"Argo CD replaces Kubernetes controllers."** → It is one more reconciliation loop on top: the *loop of loops*. *Same thermostat visual, nested.*

---

## 5. What to cut or postpone

Principle: apply Mayer's *coherence* principle (people learn better when extraneous material is excluded) and *segmenting* principle (user-paced segments) ([Mayer](https://services.dartmouth.edu/TDClient/1806/Portal/KB/PrintArticle?ID=171655)). Introduce **at most one or two new nouns per segment.**

| Treatment | Topics |
|---|---|
| **Cut entirely** | Paxos/Raft mechanics; vector/logical clocks; CAP/PACELC formalism; kubeadm/cluster installation, certificates, etcd backup; CNI/CSI/CRI internals; iptables/IPVS/nftables/eBPF details; Docker Swarm; Windows containers; multi-cluster; ApplicationSets; Kafka internals |
| **One sentence or a "Za znatiželjne" (for the curious) box** | "etcd uses Raft to agree on state"; CAP as "under a network partition you choose between consistency and availability"; Helm and Kustomize ("templating and per-environment config, which you'll meet in real projects"); CRDs/Operators (needed only to say "an Argo CD *Application* is a custom resource"); service mesh; NetworkPolicy; Pod Security Standards; DaemonSet/Job/CronJob as an "other workload types" gallery; image scanning/SBOM/supply chain; KEDA (queue-length autoscaling) |
| **Optional or short lectures** | L5 (state/caching/replication), L16 (storage/StatefulSet), an optional observability lecture (logs/metrics/traces, Prometheus/Grafana) for KCNA-minded students; multi-stage Dockerfile as an expandable "pro tip" |
| **Postpone within the course** | YAML syntax: teach the anatomy once (apiVersion/kind/metadata/spec) in L11, then put everything in expandable blocks. RBAC: only "who can read this Secret?" in L14. Ingress vs Gateway API: one section in L13 using Gateway vocabulary, with no controller comparison. |
| **Defer the hands-on environment** | Students don't need a local cluster until Module C. Then recommend **kind** or **minikube**, or **Killercoda** in the browser with nothing to install. These are the official learning-environment recommendations ([docs](https://kubernetes.io/docs/setup/learning-environment/)). |

---

## 6. The unifying running example

### Option A: "Klopa", meal ordering for a student canteen *(recommended)*
A fictional student team builds an app where students order lunch in advance and pick it up.

| Lecture | Story beat ("incident" that starts the lecture) |
|---|---|
| L0–L1 | Runs on `localhost:3000`, deployed to one 2 GB VPS. **At 12:00 everyone orders** and the site slows, then crashes. Vertical scale to 4 GB helps until exam week. |
| L2–L3 | Three servers (2 GB, 4 GB, 4 GB) behind a load balancer. Round robin kills the 2 GB box. Carts stored in memory vanish, so the cart moves to Redis and the app becomes stateless. |
| L4 | Sending "your meal is ready" SMS and printing kitchen tickets is slow, so it moves to a queue with workers. A duplicate message means **the order is cooked twice ("dvaput ćevapi")**, which leads to an idempotency key (order ID). |
| L6–L8 | A new teammate says "radi na mom laptopu, ne radi na serveru" (works on my laptop, not on the server), so the app is Dockerized. Compose runs web + api + worker + Redis + Postgres. The single host dies at 12:05. |
| L9–L13 | Klopa moves to Kubernetes: Deployments for api and worker, a Service for api, external traffic via Gateway/LoadBalancer. |
| L14 | DB password and SMS-gateway API key become Secrets. Someone almost commits them to Git. |
| L15 | Lunch-rush autoscaling; a worker gets OOMKilled; readiness probes. |
| L17–L19 | New feature: **"vegetarijanski meni"** (vegetarian menu). CI builds `klopa-api:1.4.0`. Argo CD syncs it. Someone runs `kubectl scale` by hand and Argo reverts it. A canary catches a bug. |
| L20 | "Release day at 11:55": the full path, plus break-and-diagnose challenges. |

**Why it wins:**
- The load spike is natural, daily and *predictable* (good for autoscaling and capacity planning).
- The kitchen rhymes with the restaurant analogy used in Module A.
- Queues are intrinsic (kitchen tickets, notifications).
- It has real secrets.
- Duplicates have a vivid, memorable consequence.
- It is culturally familiar to every Croatian student ("menza", "klopa").
- It stays fictional, so no real institution is imitated.

### Option B: "Rok", exam registration that collapses when registration opens
**Strengths:** very relatable, extreme spike, "virtual waiting room" (queue).
**Weaknesses:**
- It is too close to real Croatian university systems (risk of appearing to mock or impersonate them).
- Emotionally negative.
- Background workers are less natural.
- Correctness of seat counts drags in consistency and transactions too early.

### Option C: "Fotkica", photo upload with thumbnail generation
**Strengths:** the textbook queue/worker example (upload → queue → resize workers); clean CPU-bound scaling.
**Weaknesses:**
- No human rush pattern.
- Sessions/load-balancer story is weaker.
- Less personality.

Keep it as an optional *side example* for the queue lecture if you want a second illustration.

**Pick: Option A (Klopa).** Two supporting devices:
- **A persistent "Klopa map"**: an architecture diagram that grows every lecture (the new component animates in). This is the course's visual table of contents and recap device.
- **A consistent visual vocabulary.** Use the official Kubernetes icon set, which is dual-licensed Apache-2.0 / CC-BY-4.0 ([kubernetes/community icons](https://github.com/kubernetes/community/tree/master/icons)), so Pod, Node and Service look identical in every lecture. Phippy assets (CC-BY) can be used for a cameo or credits with attribution.

---

## 7. Structure of a single lecture, and ideal length

### 7.1 Template (target 25–35 min of active time; split anything longer than about 45 min)

| Segment | Time | Content | Principle |
|---|---|---|---|
| **1. Hook** | 0.5–1 min | A Klopa incident, animated ("12:00, error 502"). One question on screen. | Motivation; story |
| **2. Problem / "feel the pain"** | 2–4 min | Interactive attempt *without* the new concept (e.g. try to survive the burst with one server). | Productive failure |
| **3. Predict** | 0.5 min | "What happens if…?" multiple choice, recorded before the sim. | Predict-observe-explain |
| **4. Concept** | 5–8 min in 2–3 sub-steps | User-paced animation ("Dalje →"), one new term per step, glossary chip with HR + EN term, Klopa map update. | Segmenting, signaling, pre-training, spatial contiguity (labels on the diagram, not in a legend) |
| **5. Interactive simulation** | 5–10 min | Guided challenges with a goal and constraints, e.g. "keep p95 < 300 ms and errors < 1% with a budget of 3 servers". Free play after. | Active learning, explorable explanations ([Bret Victor](https://worrydream.com/ExplorableExplanations/)) |
| **6. Code (expandable)** | 3–5 min, optional | Minimal annotated YAML/Dockerfile/kubectl/pipeline. Hovering a line highlights the matching part of the diagram. Copy button. "What you just saw in the animation is this line." | Code secondary; temporal/spatial contiguity |
| **7. Myth or fact ("Mit ili istina?")** | 2 min | 2–3 of the misconceptions from §4 as quick cards with explanations. | Misconception confrontation |
| **8. Recap** | 1 min | 3–5 "Zapamti" (remember) bullets; the updated Klopa map. | Consolidation |
| **9. Self-check** | 3–5 min | 4–6 questions mixing prediction, "diagnose this broken cluster", step ordering and one spaced-retrieval question from an earlier lecture. Every answer is explained. | Retrieval practice; spacing |
| **10. Bridge** | 0.5 min | The next incident as a teaser. | Narrative continuity |

### 7.2 Length and pacing
- **Segments of 6 minutes or less.** Engagement with edX lecture videos drops off around 6 minutes regardless of total length ([Guo et al. 2014](https://www.cs.rochester.edu/hci/pubs/pdfs/edX-MOOC-video-production-and-engagement_LAS-2014.pdf)). For self-paced interactive pages, treat each segment as a resumable unit with progress saved and a clear "done" state.
- **25–35 min per lecture, about 20 lectures, roughly 10–12 h total**, plus optional hands-on labs (kind/minikube/Killercoda) of about 20–40 min after the Module B and C lectures.
- **Animations are user-paced, not autoplaying.** Every animation has step forward/back and replay, and respects `prefers-reduced-motion`. Motion only for things that actually move (requests, messages, Pods being replaced); no decorative motion (coherence; Tversky et al. 2002).
- **Every simulation shows real metrics vocabulary** (throughput, p50/p95 latency, error rate, utilization), following DDIA's requirements-first framing.

---

## 8. Correctness notes for the simulations (especially the load-balancer sim)

- **RAM is not speed.** Model each server with **CPU** (processing rate) and **RAM** (how many in-flight requests fit, since each needs memory). Then:
  - Over CPU capacity → queueing and latency growth.
  - Over RAM capacity → rejected requests (503) or an OOM crash with restart time.
  - So a 2 GB server should fail *differently* from a slow-CPU server. Let students set both.
- **Latency grows non-linearly as utilization approaches 100%** (the queueing "hockey stick"). Show the curve and avoid formulas, or put Little's law in a "za znatiželjne" box.
- **Algorithms to offer:** round robin, weighted round robin, least connections, random, "power of two random choices", IP hash/sticky. Mixed request weights (light/heavy) should exist so least-connections visibly beats round robin.
- **Health checks have intervals.** A killed server keeps receiving traffic until the check fails N times. Show those lost requests.
- **L4 vs L7 toggle:** with keep-alive connections, per-connection balancing skews load. This prepares L13.
- **Kubernetes Service sim:** random per connection by default, not round robin ([docs](https://kubernetes.io/docs/reference/networking/virtual-ips/)). Endpoints include only *ready* Pods.
- **Queue sim:** at-least-once by default; visible acks; visibility timeout or redelivery on worker crash; ordering not guaranteed with N>1 consumers.
- **Rolling update sim:** respect maxSurge/maxUnavailable (defaults 25%/25%); old and new versions serve together during rollout.
- **Argo CD sim:** poll timer of about 3 min (configurable) vs webhook; Synced/OutOfSync and Healthy/Progressing/Degraded as separate dimensions; selfHeal and prune as toggles.
- **Secrets sim:** base64 decode; "who can read" includes anyone who can create Pods in the namespace.

---

## 9. Current-ecosystem facts to build in (verified for 2026-10-01)

| Fact | Status | Source |
|---|---|---|
| Kubernetes latest | **v1.37 "Garhwal"**, released 26 Aug 2026; supported 1.35–1.37 (patches 15 Sep 2026) | [releases](https://kubernetes.io/releases/), [v1.37 blog](https://kubernetes.io/blog/2026/08/26/kubernetes-v1-37-release/) |
| v1.37 items relevant to lectures | metrics.k8s.io API stable; HPA scale-to-zero Beta (on by default) | [v1.37 blog](https://kubernetes.io/blog/2026/08/26/kubernetes-v1-37-release/), [HPA scale-to-zero](https://kubernetes.io/blog/2026/09/02/kubernetes-v1-37-hpa-scale-to-zero-beta/) |
| kube-proxy default mode | iptables in 1.37; nftables planned as the future default | [virtual IPs](https://kubernetes.io/docs/reference/networking/virtual-ips/) |
| Ingress | **Ingress NGINX controller retired March 2026** (no more fixes). Ingress *API* not deprecated. Gateway API recommended; Gateway API v1.6 released June 2026. | [K8s blog](https://kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/), [Gateway API v1.6](https://v1-36.docs.kubernetes.io/blog/2026/08/03/gateway-api-v1-6-release/) |
| Argo CD | Latest stable **v3.5.3** (14 Sep 2026); v3.6.0-rc1 in pre-release; roughly quarterly minor releases; three minors patched | [GitHub releases](https://github.com/argoproj/argo-cd/releases) |
| External Secrets Operator | Paused releases in Aug 2025; new maintainers and development resumed by about June 2026 | [Infisical](https://infisical.com/blog/external-secrets-operator-paused) |
| Sealed Secrets | Actively released (v0.40.0, Sep 2026) | [newreleases](https://newreleases.io/project/github/bitnami/sealed-secrets/release/v0.40.0) |
| KCNA | 4 domains, 44/28/16/12, effective from Nov 2025 | [LF](https://training.linuxfoundation.org/?p=39839) |
| Docker Desktop licensing in education | Since Docker's Dec 2024 subscription-agreement change, free educational use is limited to enrolled students; faculty and staff may need a license. **Check for your institution.** Free alternatives: Podman Desktop, Rancher Desktop. | [CU Boulder notice](https://oit.colorado.edu/news/docker-ssa-changes-2024) |
| Apple `container` 1.0 | June 2026; per-container micro-VMs on Apple silicon. Useful in the VM vs container lecture. | [cloudnativenow](https://cloudnativenow.com/features/apple-ships-stable-1-0-of-its-native-container-tool-for-macos/) |
| Learning environments | kind, minikube, Killercoda (official recommendations) | [docs](https://kubernetes.io/docs/setup/learning-environment/) |
| learnk8s | Rebranded/redirects to LearnKube (learnkube.com) | 301 observed |

In the lectures, avoid hard-coding version numbers except in expandable code blocks. Add a "verified on <date>" footer to every lecture.

---

## 10. Terminology guidance (Croatian text, English terms)

- **Kubernetes objects stay in English, capitalized, as proper nouns** (Pod, Deployment, ReplicaSet, Service, ConfigMap, Secret, Namespace), matching the Kubernetes docs style. Croatian inflection is fine: "Podovi", "u Deploymentu".
- **General concepts in Croatian, with English in a glossary chip on first use:**
  - raspodijeljeni (distribuirani) sustav
  - load balancer (rarely "raspoređivač opterećenja"; keep it English)
  - red poruka (message queue)
  - kontejner
  - image (avoid "slika", which collides with "picture"; say "image (predložak kontejnera)" once)
  - virtualni stroj (VM)
  - klaster
  - node / čvor (use one consistently; practitioners say "node")
  - željeno stanje (desired state)
  - petlja usklađivanja (reconciliation loop)
  - isporuka / deploy (the activity)
- **Always disambiguate "Deployment" (object) from "deploy/isporuka" (activity).**

---

## Sources

- CNCF / Linux Foundation, KCNA program changes: https://training.linuxfoundation.org/?p=39839
- DevOpsCube KCNA guide (older 5-domain version, for contrast): https://devopscube.com/kcna-study-guide/
- Kubernetes docs, Concepts: https://kubernetes.io/docs/concepts/
- Kubernetes docs, Overview (history, "what Kubernetes is not"): https://kubernetes.io/docs/concepts/overview/
- Kubernetes docs, Controllers (thermostat): https://kubernetes.io/docs/concepts/architecture/controller/
- Kubernetes Basics tutorial: https://kubernetes.io/docs/tutorials/kubernetes-basics/
- Kubernetes docs, Secrets: https://kubernetes.io/docs/concepts/configuration/secret/
- Kubernetes docs, Virtual IPs and Service proxies: https://kubernetes.io/docs/reference/networking/virtual-ips/
- Kubernetes docs, Learning environment: https://kubernetes.io/docs/setup/learning-environment/
- Kubernetes releases: https://kubernetes.io/releases/
- Kubernetes v1.37 release: https://kubernetes.io/blog/2026/08/26/kubernetes-v1-37-release/
- Kubernetes v1.37 HPA scale-to-zero: https://kubernetes.io/blog/2026/09/02/kubernetes-v1-37-hpa-scale-to-zero-beta/
- Ingress NGINX retirement: https://kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/
- Gateway API v1.6: https://v1-36.docs.kubernetes.io/blog/2026/08/03/gateway-api-v1-6-release/
- Kubernetes icon set: https://github.com/kubernetes/community/tree/master/icons
- LearnKube (formerly learnk8s): https://learnkube.com/ ; long-lived connections: https://learnkube.com/kubernetes-long-lived-connections
- Phippy, Illustrated Children's Guide: https://www.cncf.io/phippy/the-childrens-illustrated-guide-to-kubernetes/ ; Phippy Goes to the Zoo: https://www.cncf.io/phippy/phippy-goes-to-the-zoo-book/ ; CC-BY: https://www.cncf.io/blog/2018/12/11/phippy-comes-to-cncf/
- Smooth Sailing with Kubernetes (Scott McCloud), via Simon Willison: https://www.simonwillison.net/2021/Jul/1/smooth-sailing-with-kubernetes
- Julia Evans: https://jvns.ca/blog/2016/10/10/what-even-is-a-container/ ; https://wizardzines.com/comics/containers-arent-magic ; https://wizardzines.com/zines/containers/
- TechWorld with Nana outline: https://opentools.ai/youtube-summary/kubernetes-tutorial-for-beginners-full-course-in-4-hours
- KodeKloud Kubernetes for Absolute Beginners: https://www.coursera.org/learn/kubernetes-for-absolute-beginners
- Bret Fisher Docker Mastery: https://cdn.jsdelivr.net/gh/bretfisher/udemy-docker-mastery@main/README.md
- MIT 6.5840 schedule: https://pdos.csail.mit.edu/6.824/schedule.html
- PMF Split "Raspodijeljeni sustavi": https://www.pmfst.unist.hr/wp-content/uploads/predmeti/PMIC50.pdf
- DDIA 2nd ed.: https://martin.kleppmann.com/2026/03/24/designing-data-intensive-applications-2e.html ; https://www.oreilly.com/library/view/designing-data-intensive-applications/9781098119058/ch02.html ; https://www.oreilly.com/library/view/designing-data-intensive-applications/9781098119058/ch07.html
- van Steen & Tanenbaum overview: https://system-design.space/en/chapter/tanenbaum-ds-book/
- Fallacies of distributed computing: https://lawsofsoftwareengineering.com/laws/fallacies-of-distributed-computing/
- Docker "Containers are not VMs": https://www.docker.com/ja-jp/blog/containers-are-not-vms/
- Docker Desktop internals: https://www.docker.com/blog/the-magic-behind-the-scenes-of-docker-desktop/
- Apple container 1.0: https://cloudnativenow.com/features/apple-ships-stable-1-0-of-its-native-container-tool-for-macos/
- Docker education licensing change: https://oit.colorado.edu/news/docker-ssa-changes-2024
- Delivery guarantees: https://codemia.io/archive/at-least-once-vs-exactly-once-delivery
- CD vs continuous deployment (Fowler definitions): https://www.itwriting.com/blog/?p=4797
- OpenGitOps principles: https://opengitops.dev/
- Argo CD docs: https://argo-cd.readthedocs.io/en/stable/ ; releases: https://github.com/argoproj/argo-cd/releases ; reconciliation timeout: https://oneuptime.com/blog/post/2026-02-26-argocd-reconciliation-timeout/view
- External Secrets Operator pause/resume: https://infisical.com/blog/external-secrets-operator-paused
- Sealed Secrets release: https://newreleases.io/project/github/bitnami/sealed-secrets/release/v0.40.0
- Guo, Kim & Rubin 2014: https://www.cs.rochester.edu/hci/pubs/pdfs/edX-MOOC-video-production-and-engagement_LAS-2014.pdf
- Mayer's multimedia principles: https://services.dartmouth.edu/TDClient/1806/Portal/KB/PrintArticle?ID=171655
- Notional machines (ITiCSE WG 2020): https://luce.si.usi.ch/publications/2020-06-01-notional-machines.html
- Threshold concepts (Meyer & Land): https://www.ee.ucl.ac.uk/~mflanaga/ISL04-pp53-64-Land-et-al.pdf
- POE with simulations: https://gnosis.library.ucy.ac.cy/handle/7/38662
- Explorable Explanations (Bret Victor): https://worrydream.com/ExplorableExplanations/
- Tversky, Morrison & Bétrancourt (2002), "Animation: can it facilitate?", *International Journal of Human-Computer Studies* 57(4), doi:10.1006/ijhc.2002.1017 (cited from memory; not fetched during this research)

**Not verified:**
- The FER "Raspodijeljeni sustavi" syllabus. fer.unizg.hr returned 403, so PMF Split is used as the Croatian reference.
- The current availability of the Google/McCloud comic at its original URL.