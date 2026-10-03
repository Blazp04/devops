# Lecture 10 — Zašto Kubernetes: željeno stanje i petlja usklađivanja
_Kubernetesu ne opisujete korake, nego ono što želite – a on to nikad ne prestaje provjeravati._ · ~35 min · module m3 · prerequisites: 04, 09
Folder: `src/lectures/10-zasto-kubernetes/` · URL: `/predavanje/zasto-kubernetes`
Engines: E3 → src/engines/cluster/

## Continuity
- Previous lecture (09 Docker Compose: cijela Klopa na jednom računalu) ends with: Klopa sada radi na tri računala, a Davor ručno odlučuje koji kontejner ide kamo. U 03:00 poslužitelj-2 umre s devet kontejnera na sebi, a Davorov mobitel zvoni.
- Next lecture (11 Klaster iznutra: što se dogodi nakon kubectl apply) opens with: Terminal kaže „created”, ali klopa-api stoji u stanju ImagePullBackOff, a klopa-worker u Pendingu. „Created” očito ne znači „radi”. Tko je primio Lanin zahtjev, tko bira čvor, tko povlači sliku – i tko je tu zapeo?

## Hook (incident)
03:00. Poslužitelj-2 je umro, a s njim devet kontejnera. Davor u pidžami mora zapamtiti što je gdje radilo, pronaći slobodno mjesto i sve pokrenuti ručno, a u 11:45 opet ručno dodaje kopije API-ja za ručak. Što ako bismo samo zapisali što želimo – „devet kopija API-ja, uvijek” – a netko drugi neprestano pazio da tako i bude?

## Objectives (rendered by the page hero)
- objasniti razliku između imperativnog i deklarativnog pristupa
- opisati petlju usklađivanja (promotri, usporedi, ispravi) i zašto reagira na razliku, a ne na događaj
- objasniti zašto je Kubernetes skup neovisnih petlji, a ne dirigent koji izvodi plan
- nabrojati što Kubernetes radi i što ne radi (gradnja koda, CI/CD, baze)
- procijeniti kada se Kubernetes isplati

## Scenes
### 1. Vi ste orkestrator (simulation)
- Concept: Flagship phase 1: manual placement and repair under events.
- Visual: See flagship.
### 2. Skripta ili izjava (animation)
- Concept: Imperative 'pokreni 3' vs declarative 'želim 3'; after a crash the script is blind, the loop repairs.
- Visual: Side-by-side timelines.
### 3. Termostat (animation)
- Concept: Desired 22 °C (dashed) vs actual 18 °C (solid); observe → compare → act; level-triggered: a lost 'Pod umro' event doesn't matter, the next pass sees the difference. Dashed ghost = desired, solid = actual – the course-wide grammar.
- Visual: Thermostat loop ring; envelope falls, loop still fixes.
### 4. Lanac termostata (animation)
- Concept: Many controllers, each owning a slice; a cluster may never be 'done'. Pods are replaced, not repaired (new name, new IP); only the kubelet restarts a crashed container in place, inside the same Pod (L12). Kubernetes does not move running workloads back when a server returns.
- Visual: Chain of rings.
### 5. Mit o dirigentu (text)
- Concept: Not a workflow engine running a script; if the control plane stops, running apps continue (L11).
- Visual: Myth card vs independent loops.
### 6. Što Kubernetes nije i isplati li se (diagram)
- Concept: Capabilities (discovery, LB, rollouts, bin packing, self-healing, config/secrets, scaling) vs not: doesn't build code, no CI/CD, no middleware/DB, not a PaaS, not a container runtime; complexity price; managed options.
- Visual: Cards and a decision checklist.

## Flagship simulation: Vi ste orkestrator → termostat za aplikacije
E3: the same seeded day twice – first manually, then with „Predaj Kubernetesu”, where a generic loop fills dashed ghosts with solid instances. Scores: minutes of missing capacity, wrong placements, „Davorovi sati sna”. Zadaci: „Preživite 03:00 i 12:00 ručno”, „Isto s petljom – usporedite”, „Promijenite želju usred popravka”.

Controls:
- Ručno povlačenje kontejnera na poslužitelje
- Gumb „Predaj Kubernetesu”
- Klizač željenog broja replika po aplikaciji
- Gumbi za kvar: „Ugasi poslužitelj u 03:00”, „Izgubi događaj”, „Promijeni želju usred popravka”
- Brzina 1×–30× (oznaka sažetog vremena)

Model (exact rules):
3 servers × 14 abstract slots (42; no requests yet). Baseline api 9, worker 12, web 6 = 27 containers (9 per server). Seeded events: 03:00 server-2 fails → 28 slots for 27 (fits, one spare – callback to N+1 from L05); 08:00 Davor brings server-2 back repaired – existing containers are NOT moved back (Kubernetes does not rebalance running workloads); 10:00 api replaced by a new version; 12:00 api desired 9→15 for 1 h – new instances land mostly on server-2 (most free slots). Manual: each missing desired instance costs one instance-minute. Loop: every tick (10 s sim, labelled 'stvarno: sekunde') diff = desired − actual per app; create dashed ghosts; place each on the server with most free slots (seeded tie-break); solid after 5 s; surplus removed newest first. 'Izgubi događaj' drops the notification but the next tick still sees the diff. Desired change mid-repair → converges to the latest. Desired > capacity → ghosts stay unplaced ('nema mjesta'). No component names yet.

Break it: Server dies at 03:00: manual capacity is missing until a human notices, the loop restores it within a few ticks; a lost event changes nothing; asking for more than fits leaves ghosts waiting; a repaired server stays nearly empty until new work arrives.

Insight: You declare what, not how; independent loops compare desired with actual forever, so failures and changes are handled the same way.

## Code artifacts
- for petlja docker run vs petlja usklađivanja (typescript): Ten-line reconcile pseudocode: observe → diff → act → sleep
- Željeno i stvarno stanje: kubectl get -w (bash): replicas: 3 and READY 1/3 → 3/3: apply succeeded ≠ app running. Callout: objekt u primjeru je Deployment – upoznat ćemo ga u 13. predavanju.

## Misconceptions (Croatian myth + English correction)
- „Kubernetes je container runtime / zamjena za Docker” — it orchestrates; containerd/CRI-O run containers, and Docker-built images still run.
- „Kubernetes automatski čini aplikaciju skalabilnom” — only if it is stateless (L05) and configured.
- „kubectl apply odmah sve napravi” — apply records desired state; controllers act asynchronously.
- „Kubernetes izvršava plan korak po korak” — independent level-triggered loops converge on desired state.
- „Kubernetes mi daje CI/CD, logove i bazu” — it builds no code and provides no CI/CD, middleware or databases (not a PaaS).

## Key facts (verified; date-sensitive ones belong in fact callouts)
- [tech-facts] The Kubernetes overview lists service discovery/LB, automated rollouts/rollbacks, bin packing, self-healing, secret/config management, horizontal scaling – and says it does not build code, provide CI/CD or middleware.
- [tech-facts] Kubernetes 1.37 'Garhwal' released 2026-08-26 (patch 1.37.1); the three most recent minors are maintained (1.35–1.37); 3 minor releases a year, each supported ≈14 months (1.37 EOL 28. 10. 2027.) (as of 2026-10).
- [tech-facts] Avoid naked Pods; keep configuration in version control.

## Analogies (always with where they break down)
- Termostat (used by the Kubernetes docs). Breaks down: one variable vs many controllers; a thermostat adjusts gradually, Kubernetes replaces things in discrete steps.

## Glossary terms introduced
Desired state, Reconciliation loop, Node

## Bridge to next (CostNote)
Lana napiše prva dva manifesta, za API i za workera, i pokrene `kubectl apply`. Terminal odgovori „pod/klopa-api created” i „pod/klopa-worker created” – ali aplikacija ne odgovara. Tko zapravo radi posao i gdje je zapelo?
