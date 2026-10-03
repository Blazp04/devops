# Interactive explainer patterns and visualization designs for the Kubernetes curriculum

*Research date: 2026-10-01. Target stack: React 19, Vite, TypeScript, Motion (`motion/react`) and SVG, all client-side.*

---

## 0. Summary

- The best explainers share a few habits. They **show the problem before the fix**: samwho shows one overloaded server before any load balancer. They **add one mechanism at a time**, then combine them. They let the reader **drive the thing directly**, **break it**, and **compare** alternatives on the same input. They end with a **playground**. Colour and shape mean the same thing everywhere, and text and diagram share the same colours.
- For Kubernetes, the most useful single visual idea is **"desired state = dashed ghost, actual state = solid shape, the controller fills the ghost."** If it is used the same way in the Kubernetes intro, Deployments, HPA, StatefulSets and Argo CD, the reconciliation loop becomes something students see repeatedly instead of a slogan.
- Every simulation should run on a **deterministic, seeded, pure-TypeScript sim core** that keeps snapshots. That gives three things for free: a scrubbable timeline (RaftScope style), fair side-by-side comparisons on identical traffic, and unit tests that check the sims follow real Kubernetes rules (for example, a rolling update never exceeds `replicas + maxSurge`).
- Use **one running example app** across all 22 lectures, so each lecture adds to the same system. Example: *Kifla d.o.o.*, an online bakery with services web, api, payments, email-worker, Postgres and a queue. It grows from one server in L01 to GitOps in L21.
- **Version-sensitive points that change what we teach (verified 2026-10-01)**, details in §6:
  - Kubernetes 1.37 is current.
  - ingress-nginx was retired in March 2026, so teach the Gateway API as the main path.
  - HPA scale-to-zero is beta and on by default in 1.37.
  - In-place Pod resize is GA since 1.35, and 1.35 nodes require cgroup v2.
  - The kube-proxy IPVS mode is deprecated (1.35). nftables has been GA since 1.33, but iptables is still the default.
  - Argo CD 3.5.x is the current stable line.
  - Helm 4 was released in November 2025.
  - Docker Engine 29 makes the containerd image store the default.

---

## 1. Survey: what each reference does well

| Source | Signature technique | What we borrow |
|---|---|---|
| **samwho.dev / Sam Rose** (Load Balancing, Queueing, Retries, Turing Machines, Hashing, Bloom Filters, Memory Allocation, Big O) | Requests are small shapes moving client → LB → server. Requests that wait **change colour as they age**. Processing is a **shrinking clock**. Failures are **spiky**, timeouts are **hollow**. Algorithms come as a ladder (RR → weighted → dynamic weighted → least connections → PEWMA), then percentile and histogram comparisons, then a final **playground**. Queueing gives goals like "click rapidly", "fill the queue". Retries has **0% / 100% failure buttons** that visibly crash servers, which can then stay crashed under retry storms. One global speed slider; step forward and back on the Turing machine. | Request glyph grammar, ageing colour, ladder of algorithms, goal prompts, break-it buttons, final playground, percentile panels, global speed control |
| **Bartosz Ciechanowski** (Mechanical Watch, GPS, Sound, Airfoil, Cameras & Lenses, Internal Combustion Engine…) | Very dense **text ↔ small demo** interleaving. Each demo isolates **one variable** behind a slider, and you can drag or rotate the model. No autoplay you can't control. The same model is reused and grows more complex further down the page. | One knob per early demo. Reuse the same scene and grow it. Short sliders under every figure. |
| **The Secret Lives of Data (Raft)** | A **narrated linear walkthrough**: one sentence, one animation, then "continue". The scene stays and evolves, and the reader is never dropped into a new picture. | The step-through narrator for conceptual sequences (Kubernetes architecture, request path) |
| **raft.github.io RaftScope** | A **time slider you can scrub backwards**, plus speed control. Click a server to stop, resume, restart, time out, or send a request. Election timers are **rings that deplete** around each node. Messages are dots moving between nodes. | Scrubbable timeline with rewind, click-a-node fault injection, timer rings (probe periods, backoff, Argo CD poll countdown) |
| **Josh W. Comeau** (Flexbox, Grid, layout guides, `prefers-reduced-motion`) | **Metaphor anchors** (flexbox "kebab vs cocktail wieners"). Toggles whose changes **animate the transition** instead of jumping. Text tells you exactly what to try ("try dragging the middle piece"). Embedded playgrounds. **No-motion-first**: enable motion only under `prefers-reduced-motion: no-preference`. | Metaphors (thermostat, sticky-note tags, apartment pod), animated toggles, imperative captions ("Povuci…", "Probaj…"), reduced-motion policy |
| **Red Blob Games / Amit Patel** (A*, hexagons, "making-of", "little things") | Draggable inputs drive **pure-function algorithms**. A **step slider** through the algorithm. **Side-by-side comparisons** instead of toggles. **Inline legends**, the **same colours in text, diagrams and code**, enlarged hit areas, drag-offset memory, **islands of interactivity** (widgets independent), transitions between discrete states, bad-input detection. | Sim-core / render split, colour-matched YAML, small multiples, polish checklist, island independence |
| **Nicky Case / explorable explanations** | Pick the medium by job: text for abstraction, graphs for relationships, animation for time, interactives for **systems**. A rising "interest curve". Teach each mechanic in isolation, then combine. Explicit and implicit goals. The reader **acts out the algorithm** before seeing it automated. Playtest whether people actually learn. | "Manual mode before automatic mode" (you are the scheduler or the LB first), progression gating, playtesting with students |
| **Bret Victor, Explorable Explanations** | Reactive documents, **scrubbable numbers** in prose, **multiple linked representations** of one system, contextual look-ups. | Scrubbable numbers in formulas (HPA, availability), YAML ↔ visual two-way linking, glossary tooltips |
| **learnk8s.io (now learnkube.com)** | **Numbered SVG carousels** ("1/16") with a one-line caption per frame. Packet walkthroughs where **source/destination labels change** at NAT steps. Consistent node, pod and bridge glyphs. Honest timing (autoscaling article: HPA reaction, node provisioning in minutes, image pull). | Packet-header labels that rewrite in place, numbered step captions, honest lead-time bars. We go further by animating between frames so there is no teleporting. |
| **ByteByteGo** | Flat icons, pastel boxes, **numbered arrows**, one flow highlighted at a time. Made in Illustrator / After Effects; non-interactive. | End-of-lecture "summary card" in this style (static, printable, revision-friendly) |
| **Kubernetes-specific visualizers**: Kubernetes Visual Handbook (k8s.info, 65+ visualizers), K8sVisual, k8sgames (3D cluster, kubectl console, chaos mode), Killercoda (real terminals), plus real-cluster UIs: kube-ops-view, Argo CD resource tree, Headlamp | Pod lifecycle simulators, rollout playgrounds, HPA demos, RBAC trees. The real UIs set a **visual vocabulary**: nodes as boxes with resource bars, pods as small status-coloured squares, Argo CD's sync and health badges. | Mirror real-tool vocabulary so students recognise kube-ops-view, Lens/Headlamp and the Argo CD UI later. Avoid 3D: it is less legible. Our edge is narrative depth, Croatian text and correctness tests. |
| **iximiuz Labs / Ivan Velichko** | Container internals (namespaces, cgroup v2, veth/bridges) taught with hands-on labs plus diagrams. | Correct mental models for L05 and L07, and a reference reading list for students |

---

## 2. Design patterns to adopt (with how to build them in React/Motion)

| # | Pattern | Seen in | How to apply |
|---|---|---|---|
| P1 | **Problem first ("feel the pain")** | samwho LB starts with one overloaded server; Comeau's "why this matters" | Every lecture opens with Kifla failing in a way the new concept fixes. The student causes the failure. |
| P2 | **One mechanic at a time, then combine** | Nicky Case; Ciechanowski; samwho's algorithm ladder | Early widgets expose ≤ 2 controls. The flagship sim unlocks controls progressively (`unlockedControls` set in lecture state). |
| P3 | **Narration synced to animation** | Secret Lives of Data; learnk8s numbered frames | `<StepPlayer steps=[{caption, sceneState}]>`. Each step is one change and ≤ 25 words of Croatian caption. Next/Prev/keyboard. Scene interpolates between `sceneState`s with Motion layout animations so nothing teleports. |
| P4 | **Scrubbable timeline with rewind** | RaftScope time slider; Red Blob step slider; samwho step back/forward | The sim core snapshots state every N ticks. `<Timeline>` scrubs to any snapshot and replays deterministically. Event markers ("Pod OOMKilled", "Rollout paused") are clickable. |
| P5 | **Direct manipulation** | Red Blob drag handles; Comeau drag; Bret Victor scrubbable numbers | Drag pods onto nodes, drag labels onto pods, drag Dockerfile cards to reorder, scrub numbers in formulas (`<Scrub value min max>`). |
| P6 | **Act it out, then automate** | Nicky Case; samwho "click rapidly" | "Ručni način" (manual mode): the student is the LB, scheduler or controller. Then pressing "Automatski" hands over to the algorithm, and the student feels how tedious and error-prone the manual version was. |
| P7 | **Break-it buttons / fault injection** | samwho Retries (100% failure); RaftScope (stop/restart node); k8sgames chaos | Red-outlined `<BreakIt>` buttons: "Sruši server", "Ugasi čvor", "Loš image", "Pokvarena poruka", "Ručna izmjena u klasteru". |
| P8 | **Same-seed comparisons and small multiples** | Red Blob side by side; samwho comparison graphs; Bret Victor multiple views | `seed` is part of sim config. "Ponovi isti promet" reruns identical traffic with another algorithm. A grid view runs 2–4 variants in lockstep. |
| P9 | **Goals and challenges** | samwho goal prompts; Nicky Case explicit/implicit goals | Each flagship has 3–5 `Zadatak` cards with auto-detected completion (e.g., "Obradi 200 zahtjeva uz p95 < 300 ms i 0 odbijenih"). |
| P10 | **Playground at the end** | samwho LB and Retries | After the guided part, all knobs are unlocked plus "Podijeli konfiguraciju" (config encoded in the URL hash; no personal data). |
| P11 | **Fixed colour + shape semantics, colour-matched text and code** | Amit "little things"; samwho spiky/hollow | One token table (§3). Prose words like <span style="color:teal">v1</span> use the same token as the glyph and the YAML highlight. |
| P12 | **Linked representations (YAML ↔ visual)** | Bret Victor; Red Blob colour-matched code | `<CodeDrawer>`: hovering a YAML line highlights its glyph and vice versa. Editing a whitelisted field (replicas, image tag, selector) changes the sim. |
| P13 | **Metaphor anchors** | Comeau kebab | Thermostat (reconciliation), sticky notes (labels, image tags), apartment (Pod), transparent sheets (layers, Kustomize overlays), post office (queue). |
| P14 | **Predict, then observe** | Classic predict-observe-explain teaching; implicit in Nicky Case | Before "Pokreni", the student picks a prediction ("Što misliš, koji server prvi pada?"). The sim then shows the result and the explanation. |
| P15 | **Honest time** | learnk8s autoscaling lead times; RaftScope timers | A visible sim clock with a compression badge ("1 s = 1 min"). Linear motion for anything that represents latency. Never make node provisioning look instant. |
| P16 | **Time encoded visually** | samwho ageing colour and shrinking clock; RaftScope timer rings | Waiting requests shift blue → amber. Probe periods, backoff and Argo CD polling are drawn as depleting rings. |
| P17 | **Tail-aware metrics** | samwho percentiles and histograms | Every traffic sim shows p50/p95/p99, a drops counter and a histogram. The average is shown greyed, with the label "prosjek laže". |
| P18 | **Islands of interactivity** | Amit | Each widget owns its state. Only one sim runs at a time (others pause when off-screen via `useInView`). |
| P19 | **Polish details** | Amit "little things" | Enlarged invisible hit areas, `cursor: grab`, drag-offset memory, z-raise on drag, hover feedback, bad-input messages ("maxSurge i maxUnavailable ne mogu oba biti 0"). |
| P20 | **Reduced motion, done properly** | Comeau no-motion-first; Motion's `reducedMotion` | See §3.4. Motion is never the only carrier of meaning. |

### Anti-patterns to avoid

1. **Decorative motion**: parallax, floating blobs, animation that doesn't encode state. Every movement must mean something (a request travelling, state changing).
2. **Autoplay loops you can't stop.** Default to paused for step-throughs. Flagship sims start only on explicit "Pokreni" or after a prediction.
3. **Blank-canvas sandbox first.** Students freeze. Guided steps come first; the playground is unlocked at the end.
4. **Knob soup.** 15 sliders at once. Unlock progressively, and keep "Napredno" collapsed.
5. **Teleporting layouts.** A node or pod jumps when state changes, which breaks object constancy. Use Motion `layout` / `layoutId`.
6. **Hidden time compression.** Making a 4-minute node boot look like 1 s creates false intuitions about autoscaling.
7. **Colour-only encodings, especially red/green only.** Pair with shape, icon and label, and test with deuteranopia simulation.
8. **Non-reproducible randomness.** It makes comparisons unfair and bugs unreproducible. Use seeded RNG everywhere.
9. **Scroll-jacked scrollytelling** for long sequences: it fights the user, is fragile on mobile, and is hard to revisit. Prefer explicit steppers with deep links per step.
10. **Wall of YAML before intuition.** Code goes in expandable drawers, after the mechanism is understood.
11. **"Happy path only."** A system we never break is a system we haven't explained.
12. **Pretty but wrong simplifications** that create misconceptions (see table below). Correctness beats elegance.
13. **Gamification that rewards speed over understanding**, e.g., timers on quizzes.
14. **Flashing error bursts.** Rate-limit red flashes to ≤ 3/s (WCAG 2.3.1) when many requests fail at once.

### Misconceptions each lecture must actively break

| Misconception | Killed by |
|---|---|
| "Containers are lightweight VMs" | L05 PID-namespace "view from host" toggle |
| "More RAM = faster server" | L02 server builder separates vCPU (throughput) from RAM (concurrent capacity) |
| "The load balancer knows instantly when a server dies" | L02 health-check delay window on the timeline |
| "A queue makes the system faster" | L03 λ > μ ⇒ queue grows without bound |
| "`RUN rm secret` removes it from the image" | L06 layer inspector shows it still in the lower layer |
| "`:latest` is the same everywhere" | L06 tag-as-movable-sticky-note |
| "Pod = container" | L09 Pod anatomy (shared net namespace, init/sidecar) |
| "The scheduler looks at real usage" | L09: it bin-packs on *requests* |
| "Exceeding the CPU limit kills the container" | L09: CPU is throttled; memory over limit is OOMKilled |
| "Kubernetes auto-rolls back a bad Deployment" | L10: the rollout stalls and gets the `ProgressDeadlineExceeded` condition; rollback is manual (or done by tooling) |
| "A Service is a proxy box / pod" | L11: ClusterIP is virtual, implemented as rules on every node |
| "Service load-balances every request" | L11: per-connection balancing, so keep-alive / HTTP/2 / gRPC connections stick to one pod |
| "Secrets are encrypted" | L13: base64 decode button |
| "Namespaces isolate the network" | L16: open by default until a NetworkPolicy exists (and the CNI enforces it) |
| "Cluster Autoscaler adds nodes when CPU is high" | L15: it adds nodes when Pods are **Pending** |
| "Liveness probe should check the DB" | L15 break-it: DB down ⇒ every pod restarts ⇒ outage gets worse |
| "Average latency is fine" | L17: average vs p99 slider |
| "Deploy = release" | L19: feature flags |
| "GitOps = CI runs kubectl apply" | L21: push vs pull |

---

## 3. Shared visual language and component kit

### 3.1 Glyphs and colour tokens (same in every lecture)

| Entity | Glyph | Token / encoding |
|---|---|---|
| Request in flight | small circle | `--traffic` (sky blue). Ages toward amber while queued (samwho) |
| Success | circle + ✓ pop | `--ok` (green) **and** check shape |
| Error | **spiky** star | `--error` (red) **and** spikes |
| Timeout / abandoned | **hollow** circle | outline only |
| Desired state | **dashed ghost outline** | `--desired` (neutral grey, dashed) |
| Actual state | solid fill | entity colour |
| Version v1 / v2 / bad | rounded square | `--v1` teal, `--v2` violet, bad build = violet with a crack icon |
| Server / Node | panel with **vCPU lanes** + **RAM bar** | `--node` (slate) |
| Pod | rounded square inside node; containers as inner chips | status: Pending = dashed grey; ContainerCreating = pulsing outline; Running = solid; Ready = solid + dot; Terminating = fade + strike; CrashLoopBackOff = red + backoff ring; OOMKilled = red burst icon |
| Control-plane component | hexagon | `--control` (indigo) |
| Human / developer | person chip | `--human` (amber) |
| Git / commit | commit dot on branch line | `--git` (orange) |
| Secret | key / lock | `--secret` (gold); plaintext text in red mono; ciphertext as scrambled glyphs |
| Attacker | eye icon | red eye = can read, grey = blocked |
| Queue | horizontal track with slots | depth number always visible |
| Timer (probe period, backoff, poll) | depleting ring around an entity | RaftScope style |

Use no product logos (Docker whale, the Kubernetes wheel, Argo octopus). Generic icons avoid trademark and branding issues and stay visually consistent.

### 3.2 Motion tokens

- **Latency-bearing movement** (requests, packets, image pulls): **linear** easing at constant speed, so distance on screen is proportional to time. This is the honesty rule.
- **UI and layout changes** (pods re-arranging, panels expanding): springs (Motion defaults are fine; standardise around `stiffness≈300, damping≈30` for snappy, `≈170/26` for gentle).
- **State changes** (colour, badge): 200–300 ms ease-out tweens.
- **Object constancy**: `layoutId` per entity (pod name, request id), so a Pod moving between nodes animates instead of teleporting; `AnimatePresence` for create/terminate.
- **Global speed**: one `simSpeed` context (×0.25 … ×8) shared by all widgets on a page (samwho).

### 3.3 Pacing rules

- Step-through: 1 step = 1 visual change + ≤ 25 words.
- Default sim rates keep ≤ ~5 new moving entities per second per lane at ×1, so they stay trackable.
- Show the sim clock and compression badge whenever sim time ≠ wall time.
- Every flagship ends with a 2-line "Što si upravo vidio" (what you just saw) recap. It is generated from sim events, e.g., "Server *Mali-1* odbio je 37 zahtjeva jer mu je RAM bio pun."

### 3.4 Reduced motion and accessibility

- Root: `<MotionConfig reducedMotion="user">`. Motion then disables transform and layout animations but keeps opacity and colour. Add a site toggle ("Animacije: sustav / uvijek / smanjeno") mapped to `"user" | "never" | "always"`, stored in try/catch-wrapped `localStorage`.
- Use `useReducedMotion()` in sims to switch to **discrete mode**. Requests don't travel. Server counters tick, the queue depth number updates, arrows pulse via opacity, and step mode is on by default.
- CSS: transitions only inside `@media (prefers-reduced-motion: no-preference)` (Comeau's no-motion-first approach).
- Every sim has an `aria-live="polite"` narration line and a text state summary. Every control is keyboard-operable (Space = play/pause, → = step, ← = step back).
- Touch targets ≥ 44 px, and every widget has a vertical phone layout.

### 3.5 Component kit

| Component | Purpose |
|---|---|
| `sim-core/` (pure TS) | Seeded RNG (e.g., mulberry32), **discrete-event scheduler** (priority queue by time), snapshotting, pure step functions. Unit-tested against known results: M/M/1 wait, HPA formula, rollout invariants, Service endpoint selection. |
| `<SimStage>` | SVG `viewBox` stage. Pauses when off-screen (`useInView`). One `useAnimationFrame` loop that writes positions to motion values (not React state per frame). Pools packet elements. |
| `<SimControls>` | play/pause/step/speed/reset/seed |
| `<Timeline>` | scrubbable, with event markers (RaftScope) |
| `<StepPlayer>` | narrated step-through (Secret Lives / learnk8s) |
| `<BreakIt>` | consistent red fault-injection buttons |
| `<Compare>` | before/after toggle **or** small-multiples grid on the same seed |
| `<Metrics>` | p50/p95/p99, drops, histogram, cost €/h. Throttled to ~5 Hz. |
| `<CodeDrawer>` | expandable YAML / Dockerfile / kubectl / pipeline, with two-way highlight to glyphs and editable whitelisted fields |
| `<Scrub>` | Bret-Victor scrubbable number inside prose and formulas |
| `<Predict>` | prediction prompt gating "Pokreni" |
| `<Goal>` | challenge card with auto-check |
| `<Term>` | glossary tooltip (Croatian definition, English term) |
| `<SummaryCard>` | ByteByteGo-style numbered static recap, printable |

Performance budget: ≤ ~300 simultaneously animated SVG nodes per widget, metrics charts at ≤ 10 Hz, and one running sim per page.

### 3.6 Lecture skeleton (each of the 22)

1. **Hook**: Kifla breaks (P1)
2. **Concept steps**: 3–6 `StepPlayer` steps and small animations
3. **Flagship sim**: predict → run → goals
4. **"Pokvari!"**: fault injection
5. **Code drawers**: optional
6. **Česte zablude** (common misconceptions)
7. **Summary card**
8. **Mini-quiz**: drag-match symptom ↔ cause

---

## 4. Per-lecture designs

Format: **Flagship**, then Sees / Manipulates / Happens / Feel. "Guardrails" are the correctness constraints the sim must honour.

---

### L01 — Zašto distribuirani sustavi? (Why distributed systems)

**Flagship: "Jedan server protiv svijeta" (One server vs. the world)**
- **Sees:** Kifla's shop on one server. Users appear as dots on a map of Croatia (later also Europe and the world). Live panels show throughput, p95 latency, error rate, availability % and €/month.
- **Manipulates:**
  - Traffic slider and a "Black Friday" spike button.
  - "Veći server" (scale up) through a catalogue of growing machines. Each resize requires a restart, so there is a visible downtime gap. The catalogue ends at a maximum size, with the button greyed: "Nema većeg".
  - "Isključi struju" (power failure).
  - "Dodaj drugi server" (scale out).
- **Happens:** Scaling up works until the ceiling. Every resize causes a short outage. Pulling the plug takes availability to 0, because the single server is a single point of failure. Adding a second server does *nothing* at first, because users only know one address and all traffic still hits server 1. That is a cliffhanger for L02: "Tko dijeli promet?" (Who distributes the traffic?).
- **Feel:** There are three reasons we distribute: **capacity ceiling**, **single point of failure**, and **distance to users**. Distribution itself is a new problem.
- **Guardrails:** Within a cloud instance family, price is roughly linear in size, so don't fake a superlinear cost curve. The real limits are the ceiling, the outage during resize, and the single point of failure. State this explicitly.

**Small animations**
1. **"Brzina svjetlosti"** (speed of light). Drag the server pin across a world map. A packet travels at fibre speed (~200 000 km/s, about 5 µs/km) and the RTT is shown as two numbers: the physical minimum, and a typical measured value from a small table of real values. Zagreb ↔ Frankfurt vs Zagreb ↔ Sydney. Insight: physics can't be optimised away, so put servers near users.
2. **Availability maths with scrubbable numbers.** One server at <Scrub 99%> = ~3.65 days of downtime per year. Two *independent* replicas = 1 − 0.01² = 99.99%. Small multiples for 1/2/3 replicas. Toggle "isti ormar / isto napajanje" (same rack, same power): the failures become correlated and the gain collapses. Insight: redundancy only helps if failures are independent.
3. **"Mreža nije pouzdana"** (fallacies of distributed computing). Six flip cards, each with a 3-second micro-animation: packet lost, delayed, duplicated, reordered, bandwidth-limited, partitioned. Insight: distribution costs complexity.
4. **Vertical vs horizontal morph.** One tall server morphs (layout animation) into many short ones. Labels: "scale up" / "scale out".

---

### L02 — Load balancing (the lecturer's explicit request)

**Flagship: "Balanser u tvojim rukama" (The balancer in your hands)**
- **Sees:**
  - Left: a traffic source.
  - Middle: an LB hexagon.
  - Right: a **server rack the student builds**. Each server shows **vCPU lanes** (parallel processing slots), a **RAM bar** (memory held by in-flight requests), a small in-server queue, and live p95 and drop counts. Requests are samwho-style dots: they age blue → amber while waiting, shrink like a clock while processing, become spiky red when rejected or failed, and hollow on client timeout.
- **Manipulates:**
  - **Server catalogue:** *Mali* 1 vCPU / 2 GB, *Srednji* 2 vCPU / 4 GB, *Veliki* 4 vCPU / 8 GB, or "Prilagođeni" with separate sliders for vCPU (1–8) and RAM (1–16 GB). Drag servers in and out of the rack.
  - **Traffic:** rate, pattern (stalni / valovi / nagli skok), and **request mix**: light (CPU 30 ms, 50 MB), heavy (CPU 400 ms, 300 MB), and an optional "memory-hungry" request (e.g., image resize, 800 MB).
  - **Algorithm:** Ručno (manual: click a server to route each request), Random, Round Robin, Weighted RR (editable weights, suggested = vCPU), Least Connections, Weighted Least Connections, and under "Napredno" Least Response Time / PEWMA and "Power of two choices".
  - **Health checks:** on/off, interval, unhealthy threshold.
  - **Break-it:** "Sruši server", "Spori disk" (one server's CPU work ×3), "Nagli skok".
- **Happens:**
  - With Round Robin and mixed servers, *Mali* gets the same share as *Veliki*. Its lanes saturate, its queue fills, then rejections follow while *Veliki* idles.
  - Weighted RR fixes static differences, but not "Spori disk" (dynamic degradation). Least Connections adapts by itself.
  - With health checks off, a crashed server keeps receiving traffic, which all fails. With them on, the timeline shows a red **detection window**: interval × threshold.
  - "Ponovi isti promet" re-runs the identical seed. The small-multiples view runs 3 algorithms side by side.
- **Feel:** **RAM ≠ speed.** CPU lanes set throughput; RAM sets how many requests can be in flight (and whether memory-hungry requests fit). The algorithm matters most when servers or requests differ, and the difference shows in **p99**, not the average. Detection is never instant.
- **Goals:**
  1. "Obradi 300 zahtjeva bez odbijanja s 2× Mali + 1× Veliki."
  2. "Preživi pad servera s < 2% grešaka."
  3. Preset scenario: 2 vCPU / 4 GB vs 2 vCPU / 8 GB under CPU-bound traffic gives *the same* throughput. Switch to memory-hungry traffic and the 8 GB server wins.
- **Guardrails:**
  - Model memory as reserved per in-flight request plus a fixed OS/app baseline (~0.5 GB).
  - Admission when RAM is full has two modes: queue/reject (default), or an "OOM crash" toggle that kills the server and restarts it after a delay.
  - Least Connections counts in-flight requests, not capacity. That is why the weighted variant exists.
  - Round Robin is per request here; contrast with per-connection balancing in L11.

**Small animations**
1. **L4 vs L7.** A request is an envelope. The L4 LB sees only the envelope (IP:port). The L7 LB opens it (Host, path, cookie) and can route `/api` vs `/slike`. Toggle.
2. **Sticky sessions.** The cart lives in server memory. With RR the next click lands elsewhere and the cart is empty. Sticky cookie on: it works, but load is uneven. Kill that server: the cart is lost. This leads into L04.
3. **Health-check timeline.** Scrub through a crash: probes every 5 s, threshold 3 → ~15 s of errors, highlighted.
4. **"Tko balansira balanser?"** (Who balances the balancer?) Two LBs with a floating IP / managed cloud LB. The LB itself must not be a single point of failure.

---

### L03 — Redovi poruka i event-driven arhitektura (Queues)

**Flagship: "Pošta za narudžbe" (Order post office)**
- **Sees:** Placing an order at Kifla triggers payment (fast), an email (slow, external, flaky) and an invoice PDF (CPU-heavy).
  - **Mode A, synchronous:** the user's request waits for all three.
  - **Mode B, with a queue:** the API publishes an `NarudzbaKreirana` event and answers immediately ("202 – obrađuje se"). Worker pools consume.
- **Manipulates:**
  - Producer rate; number of consumers per pool (+/−); consumer speed.
  - **Break-it:** "Email servis pao" (the email service goes down), "Pokvarena poruka" (poison message).
  - Ack timing: "ack prije obrade" vs "ack nakon obrade".
  - "Ruši workera usred obrade" (crash a worker mid-job).
  - Topology: **work queue** (competing consumers) vs **pub/sub fan-out** (email, invoice and analytics each get a copy).
  - Dead-letter queue after N retries.
  - Optional bounded queue size.
- **Happens:**
  - In sync mode, the email outage makes orders fail. In queue mode, orders keep succeeding while the email queue depth climbs on a live chart, then drains after recovery.
  - Ack-before plus a worker crash loses the message. Ack-after plus a crash after the side effect but before the ack causes redelivery, so the customer gets **2 emails / charged twice**. Turning on "idempotency key" fixes that.
  - The poison message loops until it moves to the DLQ.
- **Feel:** Queues decouple **in time**, absorb bursts and let consumers scale independently. The price is eventual consistency, duplicates (at-least-once delivery) and hidden latency.
- **Guardrails:**
  - Don't claim "exactly-once" in general. Teach at-most-once vs at-least-once, and idempotency as the practical fix.
  - A queue does not raise throughput: if λ > μ the backlog grows without limit.

**Small animations**
1. **λ vs μ (utilisation hockey stick).** Two scrubbable rates. The queue length plot grows linearly when λ > μ. A second chart shows M/M/1 mean time in system W = 1/(μ − λ) shooting up as utilisation → 100%. Insight: never plan for 100% utilisation.
2. **Queue vs log.** RabbitMQ-style: a message disappears after ack. Kafka-style: messages stay in a partition log, and each consumer group has its own **offset** pointer. Rewind an offset to replay.
3. **Backpressure.** An unbounded queue grows memory and latency silently. A bounded one rejects with 429 and the producer slows. Compare samwho-style FIFO vs LIFO under overload (fresh requests survive with LIFO).
4. **Scale on queue depth.** Workers scale with queue length. Teaser for L15: in Kubernetes 1.37, HPA scale-to-zero is beta and on by default with object/external metrics such as queue length, and KEDA is the common add-on.

---

### L04 — Stateless vs stateful i podaci (State and data)

**Flagship: "Gdje živi košarica?" (Where does the cart live?)**
- **Sees:** 3 app replicas behind an LB. Users add items. Each user's cart appears as a small item stack *wherever it is stored*.
- **Manipulates:**
  - State location: (1) in-process memory, (2) memory + sticky sessions, (3) external store (Redis/DB).
  - "Restartaj repliku", "Dodaj repliku", "Ukloni repliku".
- **Happens:**
  - (1) Carts vanish or split across replicas.
  - (2) Works until the sticky replica dies.
  - (3) Replicas become interchangeable "cattle": kill any of them and no cart is lost. Scaling 3 → 10 is trivial.
  - Then the camera pans to the database: all the state now lives in one place. Kill the DB and everything stops. **Level 2:** add read replicas with a replication-lag slider. Write `stanje=5` to the primary, read from a replica too soon, get the old value (read-your-writes violated). Sync vs async replication toggle: sync gives slower writes but no lag; async gives fast writes but data loss on failover.
- **Feel:** Make compute stateless and push state into systems built for it. State never disappears; it moves, and distributing it forces trade-offs.
- **Guardrails:** CAP applies only *during a partition*. Don't present it as "pick 2 of 3 always".

**Small animations**
1. **Pets vs cattle.** A named server ("zeus") is hand-healed, vs numbered replicas replaced automatically.
2. **Sharding with hashing.** 1 000 keys over 3 shards. Add a 4th shard: with `hash mod N`, ~75% of keys move (the moved-key counter animates). With consistent hashing, ~25% move. Ties back to samwho's Hashing piece.
3. **Partition choice.** Cut the link between 2 DB nodes. Choose "odbij pisanja" (refuse writes, CP) or "prihvati pa pomiri" (accept and reconcile later, AP). The latter produces a conflict that needs a resolution policy.

---

### L05 — Virtualizacija vs kontejnerizacija (VMs vs containers, namespaces, cgroups)

**Flagship: "Slagač stoga" (Stack builder)**
- **Sees:** A physical 16 GB server drawn as a layered stack: hardware → host kernel → … A big toggle **VM ↔ Kontejneri** morphs the stack with `layoutId`. In VM mode each app sits on its own guest OS **with its own kernel** on a hypervisor. In container mode, apps sit directly on the **shared host kernel**, each with only its userspace libraries.
- **Manipulates:** "Dodaj aplikaciju"; "Pokreni sve" (start race); "Napad: kernel exploit".
- **Happens:**
  - RAM fills much faster in VM mode: each guest OS costs hundreds of MB to GBs, versus only the app's own memory for containers. A density counter shows "aplikacija na 16 GB".
  - The start race: a VM shows boot stages (firmware → kernel → init → app). A container shows only "app process starts".
  - The exploit button: in container mode a red crack spreads from the shared kernel to all containers; in VM mode it stops at the hypervisor boundary.
  - A final toggle, "U oblaku: kontejneri unutar VM-ova", shows the realistic answer: Kubernetes nodes are usually VMs running containers. It is not either/or.
- **Feel:** A container is an **isolated process**, not a small computer. You trade isolation strength for density and speed.
- **Guardrails:**
  - Show boot times as ranges and stages, not fake precise numbers.
  - Mention microVMs (Firecracker, Kata) and gVisor as middle ground, and note that Kubernetes 1.36 made user namespaces GA (better isolation for container root).

**Small animations**
1. **"Kontejner je samo proces"** (the key one). An htop-like process tree. Toggle **"Pogled iz kontejnera"** (view from inside): the app is PID 1 and alone. Toggle **"Pogled s hosta"** (view from the host): the same process is PID 48213 among the host's processes. Layout animation preserves identity.
2. **Namespaces as glasses.** One process and 7 lens toggles: pid, net, mnt, uts, ipc, user, cgroup. Each lens changes what the process *sees*: own `eth0`, own `/`, own hostname, own PID numbering. Insight: namespaces restrict **what a process can see**.
3. **cgroups as the limiter.** A process with `memory.max = 256 MiB`. Scrub allocation upward; at the limit the OOM killer fires (burst icon). A CPU lane shows `cpu.max = 20000 100000` as 20 ms of runtime per 100 ms period, and the rest of each period is greyed (throttled). Insight: cgroups limit **what a process can use**.
4. **Image vs container (class vs instance).** Teaser for L06.

---

### L06 — Docker image, slojevi, Dockerfile, build cache, registry

**Flagship: "Laboratorij build cachea" (Build-cache lab)**
- **Sees:** Left: the Dockerfile as **draggable instruction cards**:
  - `FROM node:22-slim`
  - `WORKDIR /app`
  - `COPY package*.json ./`
  - `RUN npm ci`
  - `COPY . .`
  - `RUN npm run build`
  - `CMD …`

  Right: the image as a **stack of layers** growing as the build runs, each with size and short digest. A build stopwatch.
- **Manipulates:**
  - Reorder cards (Motion `Reorder`).
  - "Promijeni kod" (edit a source file), "Promijeni ovisnosti" (edit `package.json`), "Build".
  - Toggles: `.dockerignore` on/off, multi-stage on/off.
  - "Kopiraj .env pa ga obriši".
- **Happens:**
  - On rebuild, the cache is checked top-down. Cached layers flash **CACHED** (green, instant). The first invalidated layer turns orange, and **everything after it rebuilds** with time cost.
  - With `COPY . .` placed before `RUN npm ci`, every code edit re-runs the install (~40 s on the stopwatch). Fixing the order drops it to ~2 s.
  - `.dockerignore` off: `node_modules` and `.git` inflate the build context and bust the cache.
  - Multi-stage: the final image shrinks (build tools left behind).
  - The `.env` trick: the layer inspector still shows `.env` inside layer 4 even though layer 5 "deleted" it.
- **Feel:** Order instructions from least to most frequently changing. Layers are immutable, so deleting a file only hides it.
- **Then: registry push.** Only layers the registry doesn't have are uploaded ("Layer already exists" for the base). Pull on another machine works the same way.

**Small animations**
1. **Union filesystem as transparent sheets.** Layers stacked like acetate. You look through from the top and see the merged view. A container adds a thin **writable layer**. Editing a lower file → copy-up. Deleting → whiteout marker.
2. **One image, many containers.** One image fans out into 3 containers, each with its own writable layer.
3. **Tag vs digest.** `kifla:latest` is a **sticky note** moved from digest `sha256:a1…` to `sha256:9f…`. A node that pulled earlier still runs the old one. Insight: deploy immutable tags or digests.
4. **Multi-arch manifest.** Students on Apple-silicon Macs pull `linux/arm64`, the cluster pulls `linux/amd64` from the same tag via the manifest list.
5. *(Context note)* Docker Engine 29 uses the containerd image store by default for new installs, so images are OCI content the same way Kubernetes runtimes see them.

---

### L07 — Docker mreže, volumeni, Compose

**Flagship: "Compose slagalica" (Compose puzzle)**
- **Sees:** A canvas showing a "host" (the student's laptop) with Kifla's `web`, `api`, `db` (Postgres) and `redis` as containers. Networks are coloured regions, volumes are cylinders, and published ports are "doors" in the host wall. A live `compose.yaml` sits in the CodeDrawer with two-way highlight.
- **Manipulates:** Drag services into networks, publish ports (`8080:80`), attach a named volume or bind mount, set `depends_on` with `condition: service_healthy`. Buttons: "compose up", "compose down", "compose down -v", "docker rm db". A test browser on the host opens `localhost:8080`.
- **Happens:**
  - "up": the network is created, then volumes, then containers start in dependency order (db healthcheck goes green before api starts).
  - `api` connects to `db:5432` through Docker's embedded DNS. Put `db` on another network and the connection line breaks with "could not resolve".
  - The browser only reaches services whose port is published.
  - Data survives `down` but is destroyed by `down -v`. Removing a container without a volume loses the data.
- **Feel:** Service names are DNS names on user-defined networks. The only way in from the host is a published port. Containers are disposable; volumes hold data.
- **Guardrails:**
  - The **default bridge network has no name-based DNS**; user-defined networks (which Compose creates per project) do.
  - Plain `depends_on` waits only for *start*, not readiness.

**Small animations**
1. **Port mapping.** Two containers both listen on :80 internally (fine: separate network namespaces). Both try to publish host :8080 and you get a "port already allocated" conflict.
2. **Bind mount vs named volume vs tmpfs.** Three panels. Editing a file on the host shows up instantly with the bind mount (dev hot reload). The named volume is managed by Docker. tmpfs vanishes on stop.
3. **Container lifecycle.** created → running → stopped (writable layer kept) → removed (writable layer gone).
4. **Network drivers.** bridge vs host vs none, shown as where the container's `eth0` connects.

---

### L08 — Što je Kubernetes? (Architecture, desired state, reconciliation)

**Opening hook: "Ti si orkestrator" (You are the orchestrator, manual mode, P6)**
30 containers and 5 servers. The student drags containers onto servers by hand. At "03:00" a server dies; the student must notice and re-place its containers while the clock runs. Then the "Kubernetes" button does it in seconds.

**Flagship: "Termostat za aplikacije" (Thermostat for applications)**
- **Sees:**
  - First a thermostat: desired 22 °C (dashed), actual 18 °C (solid), the heater loop running.
  - Then the cluster: control plane (API server, etcd, scheduler, controller-manager) plus 3 worker nodes (kubelet, container runtime, kube-proxy).
  - An event log at the bottom (like `kubectl get events`) with a scrubbable timeline.
- **Manipulates:**
  - `replicas: <Scrub 3>` (or edit the YAML in the drawer).
  - "Ubij pod" (kill a Pod), "Ugasi čvor" (shut down a node), "Ugasi kontrolnu ravninu" (shut down the control plane).
- **Happens:** Changing replicas to 5 shows the chain as numbered messages:
  1. kubectl → API server
  2. persisted in etcd
  3. the ReplicaSet controller (watching) sees 3 ≠ 5 and creates 2 **ghost Pods** (dashed)
  4. the scheduler binds each ghost to a node; the ghost slides there
  5. that node's kubelet (watching) asks the runtime to pull and start
  6. the Pod turns solid; status goes back to the API server

  Break-it results:
  - Killing a Pod: the controller notices the gap and creates a replacement.
  - Shutting down a node: the clock compresses. The node goes NotReady after tens of seconds; Pods stay put for the default **5-minute** toleration, then get evicted and recreated elsewhere.
  - Shutting down the control plane: existing Pods **keep running** (the data plane is independent), but nothing heals or changes until it is back.
- **Feel:** You declare *what*, not *how*. Controllers loop forever comparing desired and actual. Everything goes through the API server, and etcd is the source of truth.
- **Guardrails:**
  - Only the API server talks to etcd.
  - Components **watch** the API server; they don't call each other directly.
  - Show node-failure timing honestly with the compression badge.

**Small animations**
1. **Imperative vs declarative.** Script "start 3 containers" vs statement "want 3". After a crash the script doesn't know; the loop fixes it.
2. **Hub and spoke.** The API server in the centre, every component's watch stream drawn as a pulsing line to it.
3. **Level-triggered beats missed events.** The "Pod died" event is dropped (lost envelope). On its next pass the controller compares states anyway and fixes it.
4. **Object anatomy.** A YAML object split into `spec` (what you want, dashed) and `status` (what is, solid). This visual mapping is reused in every later lecture.

---

### L09 — Pod, raspoređivanje, requests/limits (Pods, scheduling, resources)

**Flagship: "Tetris raspoređivača" (Scheduler Tetris)**
- **Sees:** Nodes as bins with **allocatable** CPU and memory bars. A queue of Pending Pods whose width and height are proportional to CPU and memory **requests**. Each pod has a QoS badge (Guaranteed / Burstable / BestEffort).
- **Manipulates:**
  - Manual mode: drag pods into nodes.
  - Auto mode: "Pokreni scheduler".
  - Per-pod sliders for requests and limits; `nodeSelector` / affinity labels (`disk=ssd`, `gpu=true`); node taints plus pod tolerations.
  - Runtime: "Opterećenje" (actual usage) slider per pod.
  - Break-it: "Curenje memorije" (memory leak), "CPU petlja" (busy loop).
- **Happens:**
  - Scheduling is shown in two visible phases. **Filter**: nodes that don't fit grey out with the reason label ("Insufficient memory", "untolerated taint", "node selector mismatch"). **Score**: survivors get numeric scores. Then **bind**.
  - At runtime, actual usage animates inside each pod. Above the request but within the limit is allowed while the node has slack.
  - Memory hits its limit: **OOMKilled**, container restart, and the restart counter increments.
  - CPU hits its limit: **throttled**. The pod stays alive but its latency graph climbs.
  - Node memory pressure: the kubelet evicts, BestEffort and over-request pods first.
- **Feel:** The scheduler fits on **requests**, not real usage. Limits are enforced by the kernel (cgroups, L05). Memory is incompressible (kill); CPU is compressible (throttle). Requests set too low cause evictions; set too high, they waste money.
- **Guardrails:**
  - BestEffort = no requests or limits. Guaranteed = requests == limits for every container (CPU and memory).
  - Eviction ranking considers usage vs requests and priority; simplify, but never invert it.

**Small animations**
1. **Pod anatomy ("stan", an apartment).** Containers in one Pod share the network namespace (talk via `localhost`) and volumes. An init container runs to completion first. A **native sidecar** (an init container with `restartPolicy: Always`, GA since 1.33) starts before the app and keeps running.
2. **Pod lifecycle and CrashLoopBackOff.** Pending → ContainerCreating (image pull bar) → Running → Ready. A crashing app shows a backoff ring doubling 10 s → 20 s → 40 s … capped at 5 min.
3. **CPU throttling up close.** 100 ms period bars with limit 200m: 20 ms usable per period. A request needing 50 ms of CPU spans 3 periods, so latency is ~250 ms instead of 50.
4. **In-place resize (GA since 1.35).** Drag a running pod's CPU slider. It resizes **without a restart** (restart counter unchanged). Contrast with the old "replace the Pod" path. Note: 1.37 adds alpha scheduler preemption for resize.

---

### L10 — Deployment, ReplicaSet, rolling update, rollback

**Flagship: "Kontrolna ploča rollouta" (Rollout control desk)**
- **Sees:** An ownership tree: Deployment → ReplicaSet v1 (teal) → Pods, with ownership lines. A Service sends a live request stream, each dot coloured by the version that served it. Two **invariant gauges**: "Dostupno ≥ replicas − maxUnavailable" and "Ukupno ≤ replicas + maxSurge". A revision history list.
- **Manipulates:** image tag dropdown (v1 / v2 / **v3-bug**), `replicas`, `maxSurge`, `maxUnavailable` (absolute or %), readiness delay, `minReadySeconds`, `progressDeadlineSeconds`. Buttons: "Primijeni", "Pauziraj", "rollout undo", "undo na reviziju N".
- **Happens:**
  - v1 → v2: a new ReplicaSet appears (dashed ghosts), scales up by the surge, and the old one scales down as new Pods become **Ready**. The request stream is visibly mixed teal and violet during the rollout. The gauges never go red.
  - v3-bug fails readiness: the new Pods never become Ready, so the rollout **stalls** while the old Pods keep serving (no outage). After the deadline the condition `ProgressDeadlineExceeded` appears, and **nothing rolls back by itself**.
  - The student presses undo: the old ReplicaSet (kept at 0 replicas) scales back up fast because its template is still there.
- **Feel:** A rollout is just two ReplicaSets scaled in opposite directions under constraints. Readiness is the gatekeeper. Rollback means re-scaling an old ReplicaSet.
- **Guardrails:**
  - Defaults: `maxSurge` 25% **rounded up**, `maxUnavailable` 25% **rounded down**; both 0 is invalid (show a bad-input message).
  - `revisionHistoryLimit` default 10.

**Small animations**
1. **What creates a new ReplicaSet?** "Promijeni broj replika" scales the existing one. "Promijeni image/env" creates a new one (new `pod-template-hash`). A predict-then-run prompt.
2. **Small multiples of surge/unavailable.** (25%, 25%) vs (1, 0) vs (0, 1) on identical timing. Capacity curves and total duration side by side.
3. **Cascading delete.** Delete the Deployment and ownerReferences garbage-collect the ReplicaSets and then the Pods.
4. **"Deployment" ima tri značenja** (three meanings). The verb *deploy* (getting a version running in an environment), the Kubernetes object `Deployment`, and *release* (exposing it to users, L19). Three cards with a short animation each. This directly answers the lecturer's "what is deployment".

---

### L11 — Service, labels/selectors, DNS, kube-proxy

**Flagship: "Laboratorij selektora + put paketa" (Selector lab + packet path)**
- **Sees:** Pods with **label stickers** (`app=web`, `tier=frontend`, `version=v2`, `env=prod`). A Service with a selector built from chips. Endpoint lines (an EndpointSlice) connect the Service to matching **Ready** Pods.
- **Manipulates:** Drag label stickers on and off Pods; edit selector chips; fail a pod's readiness; toggle Service type (ClusterIP / NodePort / LoadBalancer); "Pošalji zahtjev" from a client pod; kube-proxy mode (iptables / nftables).
- **Happens:**
  - Endpoint lines attach and detach in real time. A NotReady pod is removed without a restart.
  - The selector typo `app=wbe` leaves **0 endpoints** and requests fail. This is very common in real clusters.
  - The packet walkthrough (learnk8s style; the header labels rewrite in place):
    1. `curl http://web` → DNS query to CoreDNS
    2. → `web.kifla.svc.cluster.local` → ClusterIP `10.96.12.7`, a virtual IP that **no pod owns**
    3. → rules on the *client's own node*, programmed by kube-proxy, DNAT the destination to `10.244.2.15:8080` (a backend picked at random)
    4. → the pod replies → conntrack rewrites the source back
  - The Service type toggle expands the reachability rings: in-cluster only → every node's port in 30000–32767 → a cloud LB in front.
- **Feel:** A Service is a stable name and virtual IP over changing Pods. Matching is by labels (loose coupling). There is no proxy box: the rules live on every node.
- **Guardrails:**
  - In iptables mode the backend choice is random per connection, not round robin.
  - nftables mode GA since 1.33. iptables is still the default on Linux. IPVS is deprecated (1.35).
  - Mention eBPF data planes (e.g., Cilium) as a replacement option.

**Small animations**
1. **Pod IPs are ephemeral.** A client hardcoding a pod IP breaks when the pod is recreated; through the Service it keeps working.
2. **Per-connection balancing trap.** A keep-alive / HTTP/2 / gRPC client opens one connection, and all its requests stick to one pod while the others idle. Toggle "nova konekcija po zahtjevu" vs an L7-aware balancer. Ties back to L02 L4 vs L7.
3. **DNS name anatomy.** `web` → `web.kifla` → `web.kifla.svc.cluster.local` assembled piece by piece. Search domains explain why short names work within a namespace.
4. **Headless Service.** With `clusterIP: None`, DNS returns all pod IPs. Setup for StatefulSets (L14).

---

### L12 — Ingress / Gateway API

**Flagship: "Gradska vrata" (City gate, a routing-rule builder)**
- **Sees:** Internet clients sending requests to `kifla.hr/`, `kifla.hr/api/…`, `admin.kifla.hr`, and some with header `x-beta: 1`. One Gateway (one external IP, listener HTTPS :443 with a TLS cert from a Secret). Services `web`, `api`, `admin` inside.
- **Manipulates:** Drag-build HTTPRoute rules (host match, path prefix/exact, header match, weighted backendRefs, e.g., 90/10). Toggles: "Uloge" (roles view), "Prikaži kao Ingress" (show as Ingress).
- **Happens:**
  - Each request animates through the Gateway. The matching rule lights up in the YAML (two-way link), and requests that match nothing get a 404.
  - Precedence demo: `/api` beats `/` (more specific wins).
  - The 90/10 weight produces the matching colour mix (teaser for L19 canary).
  - **Roles view** colours ownership: GatewayClass = infrastructure provider, Gateway = platform/cluster operator, HTTPRoute = app team.
  - **Ingress view** shows the same intent as one Ingress object with controller-specific annotations. That is why the Gateway API was designed: a portable, expressive, role-separated model.
- **Feel:** One entry point for many services, with L7 routing by host, path and headers. Responsibilities split cleanly.
- **Guardrails (2026 reality):**
  - The Ingress API still exists and is everywhere in existing clusters.
  - The community **ingress-nginx controller was retired in March 2026** (no further releases or security fixes).
  - Gateway API v1.5 (March 2026) made ListenerSet, TLSRoute and others stable.
  - Teach Gateway API as primary, Ingress as "legacy you'll meet", and mention `ingress2gateway` for migration.

**Small animations**
1. **Why not a LoadBalancer per Service?** 10 Services = 10 cloud LBs and a € counter, vs one Gateway.
2. **Resource chain.** GatewayClass → Gateway → HTTPRoute → Service → Pods. Hover shows who owns each link and which object references which.
3. **TLS termination.** Padlock handshake at the Gateway, cert from a Secret (cert-manager renews it), plain HTTP or re-encrypted inside.

---

### L13 — ConfigMap, Secret i upravljanje tajnama (Configuration and secrets)

**Flagship: "Put tajne" (Journey of a secret, a threat-model simulator)**
- **Sees:** Kifla's DB password must reach the `api` Pod. A pipeline of stages (developer laptop → Git → CI → registry → cluster API/etcd → node → Pod). An **attacker panel**:
  - "Netko vidi Git repo" (someone sees the Git repo)
  - "Netko povuče image" (someone pulls the image)
  - "Ukraden etcd backup" (stolen etcd backup)
  - "Netko s `get secrets` u namespaceu"
  - "Netko tko smije kreirati Pod u namespaceu"
  - "Kompromitiran Pod"
- **Manipulates:**
  - Where the secret lives: hardcoded in the image / plaintext in Git / Kubernetes Secret / encrypted in Git (Sealed Secrets or SOPS) / external manager (Vault or OpenBao, a cloud secrets manager) synced by **External Secrets Operator** / mounted by the **Secrets Store CSI Driver**.
  - Cluster toggles: "Enkripcija u mirovanju" (EncryptionConfiguration / KMS v2), "RBAC najmanjih ovlasti" (least-privilege RBAC).
  - "Rotiraj lozinku" (rotate password).
- **Happens:** Each attacker's eye turns **red** if they can read the password on the chosen path, grey if not.
  - In the Secret YAML, the "dekodiraj" button turns `a2lmbGFfZGJfMTIz` into plaintext instantly.
  - Encryption at rest turns the *etcd backup* eye grey, while API-level attackers stay red.
  - "Netko tko smije kreirati Pod" stays red even with tight `get secrets` RBAC, because they can mount the Secret into a Pod they create.
  - Rotation through ESO: the external value changes → `refreshInterval` ring → the Kubernetes Secret updates → a Pod with a **volume mount** sees the new file after the kubelet sync delay; a Pod using an **env var** stays stale until restart (side-by-side Pods).
- **Feel:**
  - Config is separate from the image.
  - **base64 is encoding, not encryption.**
  - Defence comes in layers: RBAC, encryption at rest, keep plaintext out of Git, external stores for rotation and audit.
  - Anyone who can create Pods in a namespace can effectively read its Secrets.
- **Guardrails:**
  - Secrets are stored unencrypted in etcd unless encryption at rest is configured.
  - `subPath` mounts don't receive updates.
  - Keep tool-status notes current: ESO paused releases in August 2025 and resumed with new maintainers. Sealed Secrets remains maintained, an exception in Broadcom's Bitnami catalogue changes. Vault moved to the BSL licence, and OpenBao is the open-source fork.

**Small animations**
1. **Build once, configure per environment.** The same image digest gets three ConfigMaps (dev / staging / prod) and shows three behaviours.
2. **Sealed Secrets key flow.** The public key encrypts on the laptop → the SealedSecret is safe to commit → the in-cluster controller's private key decrypts it into a Secret. Asymmetric-key animation.
3. **ESO vs CSI driver.** ESO syncs external → Kubernetes Secret (the Secret object exists). CSI mounts directly into the Pod (optional sync). A diagram toggle.
4. **Env vs volume update timeline.** Scrubbable; shows exactly when each consumer sees the new value.

---

### L14 — Storage: PV, PVC, StorageClass, StatefulSet

**Flagship: "Preživljavaju li podaci?" (Does the data survive?)**
- **Sees:** Three copies of Kifla's Postgres Pod, each with a row counter, using **(1)** the container filesystem, **(2)** `emptyDir`, **(3)** a PVC on a network disk.
- **Manipulates:** "Restart kontejnera", "Obriši Pod", "Čvor pao → Pod na drugom čvoru".
- **Happens:**
  - (1) loses data on container restart.
  - (2) survives a container restart and dies with the Pod.
  - (3) survives everything. The disk **detaches** from the old node and **attaches** to the new one, with a visible delay that can be minutes after a node failure.
  - **Part 2, StatefulSet.** Scale 0 → 3: `db-0`, `db-1`, `db-2` are created **in order**, each with its own PVC `data-db-N` and a stable DNS name (`db-1.db.kifla.svc.cluster.local`) via a headless Service. Delete `db-1`: it returns with the **same name and the same PVC**. Contrast the Deployment small multiple: random names and no per-pod disk. Scale 3 → 1: removal in reverse order, PVCs **retained** by default; scale back up and the data re-attaches.
- **Feel:** Pods are ephemeral; storage has its own lifecycle. A StatefulSet gives identity: a stable name, a stable disk, ordering.
- **Guardrails:**
  - RWO = read-write by **one node** (several Pods on that node can share it). RWOP = one Pod.
  - Default PVC retention for StatefulSets is Retain.
  - Add the honest note that many teams run databases as managed services or via operators.

**Small animations**
1. **PVC → PV → StorageClass.** A "claim ticket" (10Gi, RWO, `fast`) is matched to a PV. With dynamic provisioning, the StorageClass "factory" creates a PV on demand.
2. **Access modes.** RWO / ROX / RWX / RWOP shown as which nodes can attach, and how.
3. **Deployment vs StatefulSet naming.** Small multiples on the same scale-down / scale-up events.

---

### L15 — Probes, samoizlječenje i autoskaliranje (Probes, self-healing, HPA, Cluster Autoscaler)

**Flagship: "Preživi dan" (Survive the day)**
- **Sees:** 24 hours of Kifla traffic compressed (morning peak, lunch, an evening flash sale), shown with the compression badge. A cluster with nodes, the `api` Deployment, an HPA panel showing its **formula live**, a Cluster Autoscaler panel, and metrics for p95, error %, Pending pods and €/h.
- **Manipulates:**
  - HPA: target CPU %, min/max replicas.
  - Pod CPU request.
  - Node size; Cluster Autoscaler on/off with min/max nodes.
  - Probes: startup/readiness/liveness on/off and timings.
  - Break-it: "Spori start (60 s)", "Curenje memorije", "Liveness provjerava bazu" (liveness checks the DB), "Baza pala".
- **Happens:**
  - Traffic up → utilisation (**usage ÷ request**) rises → HPA computes `desired = ceil(4 × 90/60) = 6` with scrubbable numbers.
  - New Pods have no room and go Pending → the Cluster Autoscaler adds a node, with a **multi-minute** provisioning bar plus image pull → Pods schedule.
  - Traffic down → the scale-down stabilisation window (5 min default) prevents flapping.
  - "Spori start" with an aggressive liveness probe: the Pod is killed before it ever starts (CrashLoop). Adding a startupProbe fixes it.
  - "Liveness provjerava bazu" + "Baza pala": **every** Pod restarts at once and the outage gets worse. Lesson: liveness checks the process itself, not its dependencies.
  - Readiness off: traffic hits warming Pods and errors spike.
- **Goal:** keep p95 < 300 ms and errors < 1% at the lowest €.
- **Feel:**
  - Three probes answer three questions: started? / can take traffic? / stuck, so restart?
  - HPA scales Pods relative to *requests*.
  - The Cluster Autoscaler reacts to **Pending Pods**, not CPU.
  - Scaling has lead time, so keep headroom.
- **Guardrails:**
  - HPA default tolerance is 10%.
  - The Cluster Autoscaler checks for unschedulable Pods about every 10 s.
  - Mention Karpenter as the right-sizing alternative.
  - **1.37: HPA scale-to-zero is beta and on by default**, but only with object/external metrics (CPU can't wake a zero-replica workload). Link back to the queue workers from L03.

**Small animations**
1. **Probe triad timeline.** Three lanes with probe ticks. A readiness failure removes the Pod from endpoints (no restart); a liveness failure restarts it. Scrubbable `initialDelaySeconds`, `periodSeconds`, `failureThreshold`.
2. **Lead-time stacked bar** (learnk8s style). HPA reaction + node provisioning + image pull + app start = total. Lever buttons: overprovisioning placeholder Pods, smaller images, pre-pulled images.
3. **Self-healing ladder.** Container crash → kubelet restarts it. Pod deleted → ReplicaSet recreates it. Node dies → Pods are rescheduled after the toleration timeout. Three zoom levels.
4. **VPA / in-place resize side note.** Vertical vs horizontal scaling as two arrows on the same pod.

---

### L16 — Namespaces, RBAC, kvote (Namespaces, RBAC, quotas)

**Flagship: "Tko smije što?" (Who may do what?)**
- **Sees:** Subjects: Ana (developer), Marko (intern), the `ci-deployer` ServiceAccount, the `monitoring` ServiceAccount. Namespaces: `kifla-dev`, `kifla-prod`. A request-pipeline strip: **Authentication → Authorization (RBAC) → Admission (mutating → validating, quota, Pod Security) → etcd**.
- **Manipulates:** Build Roles and ClusterRoles from verb × resource chips; create RoleBindings / ClusterRoleBindings by dragging subject → role → namespace. A test console: "Ana: `delete pod -n kifla-prod`".
- **Happens:**
  - The request travels the strip. The RBAC stage animates rule matching: allowed only if **some rule** permits, and there are **no deny rules**. A 403 shows the exact missing rule.
  - Challenge: "Daj CI botu deploy u `kifla-dev` bez čitanja Secreta" (give the CI bot deploy rights without reading Secrets). The sim then reveals the gotcha: creating Deployments ⇒ creating Pods ⇒ mounting any Secret in that namespace.
  - ClusterRole + RoleBinding (reused per namespace) vs ClusterRoleBinding (cluster-wide): the scope ring expands.
- **Feel:** Namespaces scope names, RBAC and quotas. RBAC is additive and least privilege is a design activity. Workloads get identities (ServiceAccounts).
- **Guardrails:** Namespaces are **not** network isolation by default.

**Small animations**
1. **Namespaces as building floors.** `web` exists on two floors; the DNS names differ.
2. **ResourceQuota budget bar.** `kifla-dev` has 4 CPU of requests. Scaling past it is rejected at admission with "exceeded quota". A LimitRange gives defaults to Pods without requests.
3. **NetworkPolicy.** All-to-all lines by default. Apply default-deny and every line is cut. Allow frontend → api only. Note: requires a CNI that enforces policies.
4. **Pod Security Admission.** A privileged Pod is rejected in a namespace labelled `restricted`.

---

### L17 — Observability (Metrics, logs, traces)

**Flagship: "Lov na uzrok" (Root-cause hunt)**
- **Sees:** Kifla's services (gateway → api → payments → db, plus inventory) with a **hidden injected fault**, chosen by seed: a slow DB query, a payments memory leak with restarts, a bad inventory deploy returning 5% errors, or CPU throttling from too-low limits. An alert fires: "p95 > 1 s".
- **Manipulates:** Three linked tools:
  - a **Metrics** dashboard: RED per service (Rate, Errors, Duration) plus USE per node
  - a **Logs** explorer: filter by service, level, time, trace id
  - a **Traces** waterfall
- **Happens:** Brushing a spike on a metrics chart filters logs to that window. Clicking a `trace_id` in a log line opens its waterfall, where one fat span gives the answer away. The student submits a root-cause hypothesis and gets feedback with the true mechanism.
- **Feel:** Metrics say **that** something is wrong, traces say **where**, logs say **why**. Correlation through trace IDs is what makes them work together.
- **Guardrails:**
  - Use W3C `traceparent` propagation and OpenTelemetry terminology (spans, Collector).
  - Prometheus scrapes on a pull model.

**Small animations**
1. **Average vs p99.** A latency histogram with a tail slider: the average barely moves while p99 explodes. Fan-out demo: one page = 50 backend calls, so most page loads hit somebody's tail.
2. **How a trace is built.** The request hops services. Each hop opens a span with a parent id and the context rides in a header, so the waterfall assembles live.
3. **Pull vs push.** Prometheus scraping `/metrics` every 15–30 s vs the OTel Collector pipeline (receivers → processors → exporters).
4. **Alert thresholds.** Too sensitive leads to alert fatigue; SLO burn-rate alerting is shown as the calmer alternative.

---

### L18 — CI/CD

**Flagship: "Tvornica commitova" (Commit factory)**
- **Sees:** A pipeline as an assembly line: lint → unit tests → build image → vulnerability scan → push (digest stamped) → deploy to staging → e2e tests → [human gate] → production. DORA panel: deployment frequency, lead time for changes, change failure rate, failed-deployment recovery time.
- **Manipulates:**
  - Parallelise lint and tests; dependency cache on/off.
  - Commit types: "Ispravan", "Pada test", "Ranjiva bazna slika" (vulnerable base image), "Flaky test".
  - "Preskoči testove" toggle.
  - **Slider for the human gate's position**: after CI = Continuous Integration only; before prod = Continuous **Delivery**; none = Continuous **Deployment**.
- **Happens:**
  - A failing test stops the line at the red station and nothing is deployed (fail fast).
  - The scan gate blocks the vulnerable image.
  - Flaky tests erode trust (the retry counter climbs).
  - "Preskoči testove" ships a bug: the incident counter and change failure rate rise.
  - Caching and parallelism visibly shorten lead time.
- **Feel:** CI/CD is automated, fast feedback. The **same artifact (digest) is promoted** across environments, never rebuilt per environment. The pipeline is code.

**Small animations**
1. **Integration hell.** Five long-lived branches merge after weeks and conflicts explode, vs small daily merges.
2. **Build once, promote many.** One digest travels dev → staging → prod. "Rebuild za prod" turns red with "drugi artefakt" (a different artifact).
3. **Push vs pull deployment.** CI holding cluster credentials and running `kubectl apply` (key icon in CI) vs an in-cluster agent pulling from Git. Teaser for L21.
4. **Pipeline-as-code drawer.** A GitHub Actions-style YAML whose job blocks highlight their station.

---

### L19 — Strategije isporuke (Rolling, blue-green, canary, recreate)

**Flagship: "Četiri strategije, isti bug" (Four strategies, same bug)**
- **Sees:** Four small multiples on the **same seeded traffic**: **Recreate**, **Rolling**, **Blue-Green**, **Canary**. Each shows the user request stream coloured by version, plus metrics: downtime, **users hit by the bug**, extra resources (€), time to roll back, mixed-version window.
- **Manipulates:** "v2 ima bug koji pogađa <Scrub 20%> zahtjeva" (or hidden mode where the student must spot it). Canary steps (5 → 25 → 50 → 100%) with an analysis threshold (error rate > 2% ⇒ abort). A "Rollback" button per lane.
- **Happens:**
  - Recreate: a visible gap with zero capacity.
  - Rolling: the bug spreads gradually to everyone.
  - Blue-Green: the switch is instant (in plain Kubernetes, by flipping the **Service selector** from L11). Everyone hits the bug, then an instant rollback, at 2× resources.
  - Canary: only ~5% of users hit the bug before automatic abort.
- **Feel:** The trade-offs are blast radius vs cost vs speed vs complexity. Rolling is the built-in default. Canary and blue-green need tooling (Argo Rollouts, Flagger, Gateway API weights, service meshes).
- **Guardrails:**
  - Replica-ratio canary (1 of 10 Pods ≈ 10%, per-connection) vs weight-based routing at the Gateway (precise 1%). Show both.

**Small animations**
1. **Expand / contract database migrations.** Renaming a column in one step breaks v1 Pods still running mid-rollout. Doing it in three steps (add → dual-write → remove) is safe. Blue-green makes this even more critical.
2. **Canary analysis chart.** Canary vs baseline error rate with a threshold line; crossing it triggers automatic abort.
3. **Feature flags: deploy ≠ release.** The code is deployed "dark", and a flag exposes it to 1% of users, then staff, then everyone, with no redeploy.

---

### L20 — Helm i Kustomize

**Flagship: "Jedna aplikacija, tri okoline" (One app, three environments)**
- **Sees:** Left: sources. Centre: a "machine" (Helm templating **or** Kustomize patching). Right: the **rendered YAML for dev / staging / prod** as three small multiples with diff highlighting.
- **Manipulates:**
  - Helm: `values-dev.yaml`, `values-prod.yaml` with scrubbable `replicas`, `image.tag`, resources, host.
  - Kustomize: base plus overlays with patches (shown as transparent sheets, reusing the Docker layer metaphor).
  - Toggle Helm ↔ Kustomize.
  - Break-it: "Krivo uvlačenje" (a mis-indented `nindent` produces invalid YAML), "Patch na krivo ime" (a patch silently matches nothing).
- **Happens:** Outputs update live, and differences between environments are highlighted. Helm mode adds a release-history strip: install → upgrade → rollback (revisions stored as Secrets in the release namespace).
- **Feel:** Both kill copy-paste YAML. Helm = templates + packaging + releases (and installing third-party apps). Kustomize = patching plain YAML, built into `kubectl apply -k`. The cluster only ever sees plain Kubernetes YAML.
- **Guardrails:** Helm 4 was released in November 2025. Server-side apply is available (opt-in), there is a Wasm plugin system, and existing Helm 3 releases are managed without migration. Examples should work on Helm 4.

**Small animations**
1. **Chart anatomy tree.** Chart.yaml / values.yaml / templates/ / charts/; click to see each file's role.
2. **Template rendering step-through.** `{{ .Values.replicaCount }}` is replaced by 3, one placeholder at a time.
3. **Overlay stacking.** Base sheet + prod overlay sheet = merged result (same visual grammar as union filesystems).

---

### L21 — GitOps i Argo CD (drift and self-heal)

**Flagship: "Git je istina" (Git is the source of truth)**
- **Sees:** Left: a Git config repo (file tree + commit graph). Right: the cluster drawn in **Argo CD's own vocabulary**: Application → Deployment → ReplicaSet → Pods + Service tree, with **sync status** (Synced / OutOfSync) and **health** (Healthy / Progressing / Degraded / Missing) badges. A **poll countdown ring** shows when Argo CD will next check Git (RaftScope-style timer).
- **Manipulates:**
  - "Commit u Git" (change replicas or image tag).
  - Webhook on/off.
  - Auto-sync on/off, **selfHeal** on/off, **prune** on/off.
  - Break-it: "Ručni `kubectl scale --replicas=10`" (drift), "Netko obriše Deployment", "Obriši datoteku iz Gita", "Loš commit".
  - "git revert".
- **Happens:**
  - Commit → (poll ≤ ~3 min, or instant with the webhook) → **OutOfSync** with a visual diff → sync → Synced/Healthy.
  - Manual scale to 10: OutOfSync. With selfHeal off, the drift stays (and is flagged). With selfHeal on, Argo CD reverts it to 3 within seconds.
  - A file deleted from Git: with prune off, the resource is orphaned (flagged). With prune on, it is removed.
  - Bad commit → Degraded → **rollback = `git revert`**, which appears in the commit graph as an audit trail.
  - The CI boundary from L18 is drawn: CI builds, pushes and commits the new tag (bot commit). Argo CD, running *inside* the cluster, **pulls**. CI never holds cluster credentials.
- **Feel:** Argo CD is a **reconciliation loop one level up**: Kubernetes reconciles the cluster to etcd, and Argo CD reconciles etcd to Git. Git history is the deployment history.
- **Guardrails (verified):**
  - The default refresh is `timeout.reconciliation` = 120 s + up to 60 s jitter (≤ 3 min).
  - Auto-prune is **off** by default.
  - selfHeal must be enabled explicitly.
  - Current stable line is Argo CD 3.5.x (3.6 is in RC).
  - Mention Flux as the other main GitOps tool, and the four OpenGitOps principles: declarative, versioned & immutable, pulled automatically, continuously reconciled.

**Small animations**
1. **Push vs pull.** Where the credentials live, and which way the firewall arrows point.
2. **Matryoshka of loops.** A thermostat (L08) inside a Kubernetes controller inside Argo CD. The same dashed-ghost/solid grammar at three levels.
3. **ApplicationSet.** One template generates Applications for dev / staging / prod (or several clusters).
4. **Sync waves.** A DB migration Job (wave −1) runs before the Deployment (wave 0).

---

### L22 — Capstone: put jednog commita i put jednog zahtjeva (Journey of a commit and of a request)

**Flagship A: "Put jednog commita" (Journey of a commit)**
A single scrubbable timeline that follows `fix: košarica krivo računa PDV` (the cart calculates VAT wrongly):
1. Laptop → `git push` → PR
2. CI: tests → build (cache hits from L06) → scan → push the image by digest
3. Bot commits the new tag to the config repo
4. Argo CD goes OutOfSync → sync
5. The Deployment creates a new ReplicaSet → scheduler → kubelet pulls **only the changed layers**
6. startup/readiness probes pass → EndpointSlice updates → traffic shifts → metrics confirm health

Every station is a chip linking to a **mini-version of that lecture's sim** (opened in a drawer).

**Flagship B: "Put jednog zahtjeva" (Journey of a request)**
A user in Split opens `kifla.hr/narudzba`:
1. DNS → cloud LB → Gateway (TLS termination, HTTPRoute match)
2. Service → node rules (DNAT) → `api` Pod
3. Config already mounted from a ConfigMap/Secret
4. Query to Postgres (StatefulSet + PVC)
5. Publish `NarudzbaKreirana` to the queue → the email worker picks it up

A **trace waterfall accumulates along the way** and is revealed at the end as the latency breakdown.

At **every** station a "Što ako ovdje pukne?" (what if it breaks here?) button triggers that layer's protection mechanism: health checks, readiness removal, self-healing, queue buffering, retries with backoff, Argo CD self-heal. The whole curriculum ends up recalled in one place.

**Small animations**
1. **Zoom levels ("powers of ten").** Users/regions → cluster → node → Pod → container → Linux process (PID view from L05), as a continuous Motion scale/layout zoom.
2. **Curriculum map.** A concept dependency graph; completed lectures light up.
3. **Final drag-match.** CrashLoopBackOff ↔ liveness too aggressive; Pending ↔ insufficient requests capacity; 0 endpoints ↔ selector typo; OutOfSync ↔ manual drift; OOMKilled ↔ memory limit; ImagePullBackOff ↔ wrong tag or missing pull secret.

---

## 5. Implementation notes specific to these designs

1. **Discrete-event sim core over fixed ticks** for traffic sims (L02, L03, L15, L19). It reproduces queueing behaviour correctly and makes snapshots cheap. Fixed ticks are fine for the control-loop sims (L08, L10, L21).
2. **Correctness tests as acceptance criteria.** Each sim gets property tests that encode the real rules:
   - rolling update: `available ≥ replicas − maxUnavailable` and `total ≤ replicas + maxSurge`, with correct rounding
   - HPA: `ceil(current × metric/target)` with 10% tolerance
   - scheduler: never binds when requests exceed allocatable
   - Service: only Ready + label-matching Pods are endpoints
   - queue: Little's law L = λW holds in steady state within tolerance
   - availability: 1 − ∏(1 − aᵢ) for independent replicas

   Have a Kubernetes practitioner review each sim's guardrails before publishing.
3. **Rendering.** React renders structure. Per-frame positions go through Motion values (`useMotionValue`, `animate`, `useAnimationFrame`), with no `setState` per packet. Packet elements come from a pool. Charts render at ≤ 10 Hz.
4. **State per widget (islands).** Lecture-level progress (unlocked controls, finished goals) lives in try/catch-wrapped `localStorage` only as a convenience, and the page works without it.
5. **Shareable configs.** Encode sim config + seed in the URL hash (no personal data), so the lecturer can link "open this exact broken scenario".
6. **Croatian copy.** Strings live in a dictionary. English Kubernetes terms are wrapped in `<Term>` with a Croatian definition. Imperative captions ("Povuci…", "Klikni…", "Predvidi…"). Keep kubectl output and YAML in English, as Croatian practitioners see them.
7. **Pinned API versions in code drawers:** `apps/v1`, `gateway.networking.k8s.io/v1`, `autoscaling/v2`, `external-secrets.io/v1` (verify current ESO API version when writing L13), `argoproj.io/v1alpha1` (Argo CD Application). Show a "provjereno za Kubernetes 1.37 (listopad 2026.)" badge per lecture.
8. **Playtest** (Nicky Case). Run each flagship with 3–5 students before release. Watch for skim-through and missed insights, and add gating or `Predict` prompts where they happen.

---

## 6. Version-sensitive facts verified on 2026-10-01

| Fact | Impact on lectures | Source |
|---|---|---|
| Kubernetes **1.37** ("Garhwal", released 2026-08-26) is newest; supported 1.35 / 1.36 / 1.37; 1.38 upcoming | Badge lectures "1.37" | kubernetes.io/releases; v1.37 release blog |
| **HPA scale-to-zero: Beta, on by default in 1.37** (object/external metrics only) | L03 queue workers, L15 | kubernetes.io blog 2026-09-02 |
| **In-place Pod resize GA in 1.35**; 1.35 kubelet requires **cgroup v2** (fails to start on cgroup-v1-only nodes) | L09 small animation; L05 cgroups uses v2 syntax (`memory.max`, `cpu.max`) | 1.35 release coverage (ScaleOps, OCI blog) |
| **User namespaces GA in 1.36** | L05 isolation note | v1.36 release blog |
| kube-proxy: **nftables GA 1.33**, **iptables still default**; **IPVS deprecated in 1.35** (KEP-5495 plans a long feature-gate phase-out; one secondary site claims removal in 1.36, which contradicts the KEP, so teach "deprecated") | L11 guardrails | v1.33 release blog; KEP-5495 |
| **Native sidecar containers GA 1.33** | L09 Pod anatomy | v1.33 release blog |
| **ingress-nginx retired March 2026**; Gateway API is the recommended successor; **Gateway API v1.5** (March 2026) made ListenerSet, TLSRoute, CORS filter and others stable | L12 teaches Gateway API first | kubernetes.io ingress-nginx retirement post; CNCF 2026-07-09; Gateway API v1.5 notes |
| **Argo CD 3.5.x** current stable (3.6 RC in Sept 2026); refresh 120 s + ≤ 60 s jitter; auto-prune off by default; selfHeal opt-in | L21 timings and toggles | Argo CD docs (auto-sync); GitHub releases |
| **Helm 4** released 2025-11-12 (opt-in server-side apply, Wasm plugins, Helm 3 releases manageable) | L20 | CNCF announcement |
| **Docker Engine 29**: containerd image store is the default for new installs | L06 context note | Docker Engine 29 release notes / coverage |
| Kubernetes Secrets: unencrypted in etcd by default; base64 only; env vars don't update, mounted volumes do; anyone who can create Pods can read Secrets in that namespace | L13 core mechanics | kubernetes.io Secrets concept page |
| **External Secrets Operator**: releases paused Aug 2025, resumed with new maintainers; **Sealed Secrets** still maintained (exception in Bitnami catalogue changes) | L13 tool landscape | Infisical write-up on ESO; heise on Bitnami catalogue |
| Motion: `import { motion, MotionConfig, useReducedMotion } from "motion/react"`; `reducedMotion="user"` disables transform/layout animations but keeps opacity/colour | §3.4 | motion.dev accessibility docs |

---

## Sources

- samwho.dev: [Load Balancing](https://samwho.dev/load-balancing/), [Turing Machines](https://samwho.dev/turing-machines/), [index](https://samwho.dev/); [Queueing](https://encore.dev/blog/queueing), [Retries](https://encore.dev/blog/retries) (Sam Rose, encore.dev)
- [The Secret Lives of Data – Raft](https://thesecretlivesofdata.com/raft/), [raft.github.io / RaftScope](https://raft.github.io/), [RaftScope repo](https://github.com/ongardie/raftscope)
- Red Blob Games: [Introduction to A*](https://www.redblobgames.com/pathfinding/a-star/introduction.html), [Making of: line drawing](https://www.redblobgames.com/making-of/line-drawing/), [Little things](https://www.redblobgames.com/making-of/little-things/)
- Nicky Case: [Explorable Explanations](https://blog.ncase.me/explorable-explanations/); Bret Victor: [Explorable Explanations](https://worrydream.com/ExplorableExplanations/)
- Josh W. Comeau: [Interactive Guide to Flexbox](https://www.joshwcomeau.com/css/interactive-guide-to-flexbox/), [prefers-reduced-motion in React](https://www.joshwcomeau.com/react/prefers-reduced-motion/)
- learnk8s / learnkube: [Autoscaling strategies](https://learnkube.com/kubernetes-autoscaling-strategies), [Rollbacks](https://learnkube.com/kubernetes-rollbacks), [Network packets](https://learnkube.com/kubernetes-network-packets)
- Kubernetes visualizers: [Kubernetes Visual Handbook](https://k8s.info/docs/intro), [K8sVisual](https://k8svisual.com/), [K8s Games](https://k8sgames.com/), [Killercoda](https://killercoda.com/learn); iximiuz: [Labs roadmap](https://labs.iximiuz.com/roadmaps?tag=docker), [cgroup v2 skill path](https://labs.iximiuz.com/skill-paths/get-started-with-cgroups)
- ByteByteGo tooling note: [javarevisited overview](https://javarevisited.blogspot.com/2025/09/is-bytebytego-good-place-to-learn.html?m=1)
- Kubernetes: [Releases](https://kubernetes.io/releases/), [v1.36 release](https://kubernetes.io/blog/2026/04/22/kubernetes-v1-36-release/), [v1.37 release](https://kubernetes.io/blog/2026/08/26/kubernetes-v1-37-release/), [HPA scale to zero beta](https://kubernetes.io/blog/2026/09/02/kubernetes-v1-37-hpa-scale-to-zero-beta/), [v1.33 release](https://kubernetes.io/blog/2025/04/23/kubernetes-v1-33-release/), [KEP-5495 IPVS deprecation](https://kubernetes.dev/resources/keps/5495), [1.35 overview (ScaleOps)](https://scaleops.com/blog/kubernetes-1-35-release-overview/), [Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)
- Ingress/Gateway: [Ingress NGINX retirement](https://kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/), [CNCF: navigating the retirement](https://cncf.io/blog/2026/07/09/navigating-the-ingress-nginx-retirement), [Gateway API v1.5](https://thenote.app/post/en/gateway-api-v1-5-moving-features-to-stable-7gkmwao0ux)
- Argo CD: [Automated sync docs](https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/), [Releases](https://github.com/argoproj/argo-cd/releases)
- Helm 4: [CNCF announcement](https://www.cncf.io/announcements/2025/11/12/helm-marks-10-years-with-release-of-version-4/); Docker 29: [release notes](https://docs.docker.com/engine/release-notes/29/), [linuxiac summary](https://linuxiac.com/docker-engine-29-containerd-becomes-default-experimental-nftables-support/)
- Secrets tooling: [ESO paused (Infisical)](https://infisical.com/blog/external-secrets-operator-paused.md), [Bitnami catalogue change (heise)](https://heise.de/-10505540)
- Motion: [React accessibility](https://motion.dev/docs/react-accessibility), [useReducedMotion](https://motion.dev/docs/react-use-reduced-motion)