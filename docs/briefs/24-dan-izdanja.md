# Lecture 24 — Dan izdanja: put jednog commita i jednog zahtjeva
_Cijela Klopa u jednom prolazu – za svaki kvar mehanizam koji vas štiti i signal koji ga otkriva._ · ~45 min · module m6 · prerequisites: 15, 18, 19, 22, 23
Folder: `src/lectures/24-dan-izdanja/` · URL: `/predavanje/dan-izdanja`
Engines: E1 → src/engines/traffic/, E2 → src/engines/queue/, E3 → src/engines/cluster/, E4 → src/engines/build/, E6 → src/engines/gitops/

## Continuity
- Previous lecture (23 Upravljanje tajnama u GitOpsu) ends with: Svi su dijelovi na mjestu: slike, klaster, pipeline, Git i tajne. Petak je, 11:55, a popust za Ćevap-petak krivo se obračunava. Ispravak mora stići do korisnika prije 12:00.
- Last lecture.

## Hook (incident)
Petak, 11:55. Nova košarica 2.0.1 radi od jutra, ali popust za Ćevap-petak krivo se obračunava. Ispravak 2.0.2 mora biti vani prije 12:00. Pratimo jedan commit od Lanine tipkovnice do produkcije i jedan studentski zahtjev od mobitela do kuhinje – a na svakoj postaji pitamo: što ako ovdje pukne?

## Objectives (rendered by the page hero)
- pratiti put commita od git push do prometa na novim Podovima
- pratiti put zahtjeva od DNS-a do potrošača reda i objasniti ulogu svakog sloja
- za svaki kvar navesti mehanizam koji štiti sustav i predavanje koje ga objašnjava
- razlikovati metrike, logove i tragove i znati što koji od njih otkriva
- dijagnosticirati čest kvar iz stanja Poda, događaja i statusa Argo CD-a
- odabrati sljedeće korake učenja

## Scenes
### 1. Put jednog commita (interactive)
- Concept: push → PR → CI (cache hits) → digest → bot commit → OutOfSync → sync → new ReplicaSet → scheduler → kubelet pulls only changed layers → probes → EndpointSlice ready → Gateway sends traffic.
- Visual: Scrubbable timeline; each station opens a mini version of its lecture's sim.
### 2. Put jednog zahtjeva (interactive)
- Concept: DNS → cloud LB → Gateway (TLS, HTTPRoute, endpoints from the Service's EndpointSlice, per-request balancing) → Pod (ConfigMap/Secret) → Postgres (StatefulSet u tečaju; u produkciji upravljana baza ili operator) → queue → worker → SMS; in-cluster calls (web → api) go through the Service's ClusterIP.
- Visual: Path with a trace waterfall building.
### 3. Što ako ovdje pukne? (interactive)
- Concept: Per hop: health checks, readiness removal, self-healing, queue buffering, retries with backoff, HPA/CA, Argo CD self-heal.
- Visual: Break button per hop, protective mechanism lights up.
### 4. Tri signala: metrike, logovi, tragovi (interactive)
- Concept: Metrics say that (RED per service: Rate, Errors, Duration), traces say where (one request's waterfall), logs say why; a trace ID links them; Prometheus pulls metrics, OpenTelemetry is the standard for traces.
- Visual: Click a spike on a RED chart → logs filtered to that window → open the trace waterfall.
### 5. Dijagnostika (simulation)
- Concept: Flagship.
- Visual: See flagship.
### 6. Mapa tečaja i kamo dalje (diagram)
- Concept: Opens with a powers-of-ten zoom (region → cluster → node → Pod → container → Linux process, L07 PID view) – the reverse of the L01 trailer; then the concept graph lights up; next: observability in depth (Prometheus, OpenTelemetry), RBAC/NetworkPolicy/Pod Security, Helm in depth, service mesh, KCNA; Kubernetes release cadence and support window.
- Visual: Continuous zoom, then dependency graph.

## Flagship simulation: Incident u 12:00
A seeded chaos run on the full Klopa: hidden faults, kubectl-style output, RED metrics, logs, a trace view and Argo CD status; a hypothesis is required before acting; fixes only through Git commits; score = affected users + time to recovery. Zadaci: „Riješite tri incidenta”, „Svaki popravak samo commitom”, „Za svaki kvar navedite predavanje i signal koji ga je otkrio”.

Controls:
- Gumb „Novi incident” (seed u URL-u)
- Simulirana konzola: kubectl get / describe / logs / get events / get endpointslices, argocd app get
- Ploča metrika po servisu (zahtjevi, greške, p95) s poveznicom na logove i tragove
- Polje „Hipoteza”
- Uređivač config repozitorija i gumb „Commit”
- Gumb za kvar „Kaos majmun”

Model (exact rules):
Deterministic fault deck, each reproducing the exact symptoms of its lecture's model: selector typo → 0 endpoints, Pods healthy (L14); liveness on DB + DB blip → mass restarts, CrashLoopBackOff (L12); readiness on DB + DB blip → all endpoints ready: false, connection errors (L12, L14); worker memory limit too low → OOMKilled 137, queue depth grows (L17, L06); tag typo in Git → ImagePullBackOff, rollout stalled, Argo CD Synced but Degraded after deadline (L13, L22); manual drift with selfHeal off → OutOfSync (L22); missing Secret key → CreateContainerConfigError (L16, L23); maxReplicas too low → HPA at max, p95 rises (L18); poison message → retries then DLQ (L06); env Secret stale after rotation → auth errors until rollout restart (L16); HPA without CPU requests → no scaling (L18); missing HTTPRoute rule → 404 (L15). Canned outputs use real kubectl formats (STATUS values, event reasons, exit codes). Fixes go through the config repo and Argo CD (webhook on); manual kubectl changes are reverted by selfHeal. Score: failed requests × distinct users; MTTR from first error to recovery.

Break it: „Kaos majmun” injects a random fault mid-lunch; manual fixes are reverted – every fix must go through Git.

Insight: Every layer of the course exists because of one concrete incident – and every symptom has a mechanism, a signal that reveals it and a place to look.

## Code artifacts
- Cijeli config repozitorij Klope (yaml): Expandable tree: Deployments, Services, Gateway/HTTPRoute, HPA, ExternalSecret, StatefulSet, Application, CI workflow
- Šalabahter za dijagnostiku (bash): kubectl get/describe/logs --previous/events/rollout/top/get endpointslices, argocd app diff

## Misconceptions (Croatian myth + English correction)
- „Kubernetes koristi Docker” — dockershim was removed in 1.24; containerd/CRI-O run the same OCI images (L08, L11).
- „Secreti su šifrirani” — base64 and unencrypted in etcd by default (L16).
- „Service je round robin po zahtjevu” — kube-proxy picks a random ready Pod per new connection (L14).
- „Koristite ingress-nginx” — retired on 2026-03-24; use Gateway API (L15).
- „Argo CD reagira odmah” — it polls every 120 s plus up to 60 s jitter unless a webhook is set (L22).
- „Više RAM-a = brži poslužitelj” — for an app server RAM bounds concurrency, cores bound throughput (L02, L04).
- „Red ubrzava obradu” — it absorbs bursts; only more consumers add capacity (L06).
- „Raspoređivač gleda stvarnu potrošnju” — it schedules by requests only (L17).
- „Deployment se sam vraća” — a broken rollout stalls with ProgressDeadlineExceeded; rollback is rollout undo or git revert (L13, L22).
- „Kafka treba ZooKeeper” — ZooKeeper was removed in Kafka 4.0; KRaft only (L06).

## Key facts (verified; date-sensitive ones belong in fact callouts)
- [tech-facts] Kubernetes: 3 minor releases a year, the three most recent minors are maintained (1.35–1.37), each ≈14 months; current 1.37.1, EOL 28. 10. 2027. (as of 2026-10).
- [pedagogy] KCNA has four domains: Fundamentals 44 %, Orchestration 28 %, Application Delivery 16 %, Architecture 12 % (from Nov 2025).
- [tech-facts] Prometheus pulls (scrapes) metrics; OpenTelemetry is the CNCF standard for traces, metrics and logs instrumentation.

## Analogies (always with where they break down)
- Potencije desetke: isti sustav na šest razina zumiranja. Breaks down: each level hides failures of the levels below – the zoom must be reversible.

## Glossary terms introduced
Observability

## Bridge to next (CostNote)
Kraj tečaja. Kamo dalje: observability u dubini (Prometheus, OpenTelemetry), sigurnost klastera (RBAC, NetworkPolicy, Pod Security), Helm u dubini i KCNA – a Davorov dežurni priručnik možete preuzeti i ponijeti sa sobom.
