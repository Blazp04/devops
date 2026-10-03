# Lecture 17 — Resursi i raspoređivanje: koliko mjesta treba Podu
_Raspoređivač gleda `requests`, jezgra provodi `limits` – i zašto čvor na 30 % CPU-a može biti pun._ · ~40 min · module m4 · prerequisites: 11, 12, 13, 07
Folder: `src/lectures/17-resursi-i-rasporedivanje/` · URL: `/predavanje/resursi-i-rasporedivanje`
Engines: E3 → src/engines/cluster/

## Continuity
- Previous lecture (16 ConfigMap i Secret: konfiguracija i tajne u klasteru) ends with: Testno okruženje sada živi u istom klasteru, u Namespaceu `klopa-staging`. Ivini Podovi za test opterećenja rezerviraju po cijelu procesorsku jezgru ili jednu i pol, a novi potrošač iz reda poruka koji obrađuje fotografije jela nema ograničenje memorije i pojede memoriju čvora node-2. Produkcijski API Podovi umiru, a novi Pod koji Lana pokrene ostaje u stanju `Pending`, iako nadzor pokazuje da klaster troši tek 30 % procesora.
- Next lecture (18 Automatsko skaliranje: ručak bez dežurstva) opens with: Na blagdanski ponedjeljak nitko nije povećao broj replika i u 12:05 prosječna narudžba čeka pet sekundi (p95 ≈ 15 s). Na Ćevap-petak promet skoči s 20 na 100 zahtjeva u sekundi, a noću plaćamo prazne čvorove. Može li Klopa sama dodavati i uklanjati kapacitet – i koliko to traje?

## Hook (incident)
Potrošač za fotografije pojeo je memoriju čvora node-2, pa produkcijski API Podovi umiru s OOMKilled ili ih kubelet izbacuje. Novi Pod od 1500m stoji u Pendingu s porukom „0/3 nodes are available: 3 Insufficient cpu”, iako klaster troši tek 30 % procesora – jer Ivini testni Podovi rezerviraju jezgre koje ne troše. Kako raspoređivač odlučuje gdje ima mjesta – i tko kažnjava Pod koji uzme previše?

## Objectives (rendered by the page hero)
- razlikovati `requests` (što raspoređivač rezervira) i `limits` (što provodi jezgra operacijskog sustava)
- pratiti raspoređivanje kroz filtriranje, bodovanje i vezanje te pročitati razlog stanja Pending
- predvidjeti posljedice prekoračenja: CPU se usporava, memorija završava s OOMKilled
- objasniti QoS klase i redoslijed izbacivanja pri nedostatku memorije
- povezati različito jake čvorove s pakiranjem Podova umjesto s težinama Servicea

## Scenes
### 1. Rezervacija, ne apetit (animation)
- Concept: Scheduler seats by reservation (request), never by usage; allocatable = capacity − reserved − eviction threshold (example: 2 vCPU/4 GiB → 1930m/2972Mi, GKE formula, labelled).
- Visual: Tables with reservations vs actual eating; node bar with reserved slices.
### 2. Filtar, bodovi, vezanje (interactive)
- Concept: Filter: Ready, taints, selectors, Σrequests + pod ≤ allocatable, pods < 110; score LeastAllocated; random tie; bind.
- Visual: Per-node ✓/✗ table with reasons and scores.
### 3. Predvidite: 30 % CPU-a, a Pending (interactive)
- Concept: Node 30 % used but 95 % requested → Pending; fragmentation: enough free CPU in total, none on a single node.
- Visual: Three-layer node bars: requested / used / Σlimits.
### 4. CPU se usporava, memorija ubija (animation)
- Concept: CFS quota = limit × 100 ms per 100 ms: 200m limit, 50 ms of work → ≈210 ms latency (20 ms of CPU per 100 ms period: 20 + 80 throttled + 20 + 80 throttled + 10); memory over limit → OOMKilled, exit 137 → CrashLoopBackOff (L12).
- Visual: Period bars; OOM burst.
### 5. QoS i izbacivanje (interactive)
- Concept: Guaranteed / Burstable / BestEffort; eviction when memory.available < 100Mi; ranking usage > request first, then priority, then usage − request; kernel OOM killer if faster.
- Visual: Three badges; eviction order.
### 6. Veličine čvorova umjesto težina (diagram)
- Concept: Payoff L04/L14: bigger nodes hold more Pods by requests; Service stays random per Pod; taints/tolerations and nodeSelector in one paragraph; in-place resize GA 1.35 changes a running Pod through its resize subresource – editing resources in a Deployment's template still rolls out new Pods; CPU limits as a trade-off.
- Visual: 2/4/8 GB nodes packed with Pods.

## Flagship simulation: Tetris raspoređivača
E3 scheduler (SIM 3): three nodes with allocatable bars, eight Pod cards, manual drag then automatic scheduling with a filter/score table, usage sliders and break-it events. Zadaci: „Smjestite sve osim big-db i objasnite zašto big-db ne stane”, „Smjestite fragment bez novog čvora”, „Zaustavite OOM petlju Poda leaky”, „Učinite api Guaranteed”.

Controls:
- Ručno povlačenje Podova
- Gumb „Pokreni raspoređivač”
- Klizači requests/limits i „Stvarna potrošnja” po Podu
- Gumbi za kvar: „Curenje memorije”, „CPU petlja”, „Pritisak memorije na čvoru”, „Ukloni requests”
- Dnevnik događaja

Model (exact rules):
sim-models SIM 3. Nodes (each with DaemonSet 100m/200Mi): node-1 2 vCPU/4 GiB → 1930m/2972Mi; node-2 4/16 → 3920m/13622Mi; node-3 2/8 → 1930m/6249Mi. Cards (req / lim / usage): web 250m/256Mi, 500m/512Mi, 150m/200Mi; api-guaranteed 500m/512Mi = lim, 400m/400Mi; cpu-burner 250m/256Mi, CPU lim 500m, demand 1000m → throttled 50 %; batch 1000m/1Gi, mem lim 1Gi, demand 1500m; leaky 100m/128Mi, mem lim 256Mi, 100Mi +5 Mi/s → OOMKilled ~31 s then back-off; besteffort none, 200m/300Mi; big-db 4000m/8Gi → insufficient cpu on all 3 and insufficient memory on node-1 and node-3: message '0/3 nodes are available: 2 Insufficient memory, 3 Insufficient cpu. preemption: 0/3 nodes are available: 3 No preemption victims found for incoming pod.' (copy verbatim from a real 1.37 kind run when authoring); fragment 1500m/512Mi → Pending despite enough total CPU. DT 100 ms: schedule head (filter as above; score (alloc−requested)·100/alloc averaged; zero requests count 100m/200Mi for scoring only) → ContainerCreating 1–3 s → Running. CPU: e = min(demand, limit); if Σe > alloc water-fill ∝ max(request, 2m). Memory > limit → OOMKilled (137), restart, back-off. Every 10 s: Σusage > allocatable → evict one by ranking; Σusage > allocatable + 100Mi → kernel OOM kills highest usage%·1000 + oom_score_adj (Guaranteed −997, BestEffort 1000, Burstable formula). Never schedule on usage; never kill for CPU.

Break it: „Curenje memorije” ends in OOMKilled and CrashLoopBackOff without hurting neighbours; „Ukloni requests” makes a Pod BestEffort – packed anywhere, evicted first; „CPU petlja” is throttled, never killed; big-db and fragment stay Pending with the exact FailedScheduling message.

Insight: The scheduler places Pods by reservations, the kernel punishes them by usage – two different worlds; memory is incompressible (kill), CPU compressible (throttle).

## Code artifacts
- Blok resources (yaml): requests and limits
- OOMKilled, Exit Code 137 i FailedScheduling (log): Reading describe output
- kubectl describe node i kubectl top pods (bash): Allocated vs used (top needs metrics-server)
- kubectl patch pod … --subresource resize (bash): Closed: in-place resize of a running Pod
- LimitRange i ResourceQuota za klopa-staging (yaml): Closed

## Misconceptions (Croatian myth + English correction)
- „Raspoređivač gleda stvarnu potrošnju” — requests only.
- „Limits se rezerviraju” — nothing is reserved; the kernel enforces limits at runtime.
- „Prekoračenje CPU limita ubija kontejner” — it is throttled.
- „Prekoračenje memorije samo usporava” — OOMKilled, exit 137.
- „Bez requests je u redu” — BestEffort: packed anywhere, evicted first, invisible to the HPA.
- „Promjena resources u deployment.yaml ne restarta Podove” — changing the Pod template still rolls out new Pods; in-place resize (GA 1.35) works on a running Pod via the resize subresource (or VPA InPlaceOrRecreate), and some changes (e.g. a memory decrease with RestartContainer) still restart the container.
- „CPU limit uvijek postavite” — a trade-off: limits cause throttling even on an idle node.

## Key facts (verified; date-sensitive ones belong in fact callouts)
- [tech-facts] In-place Pod resize GA in 1.35 (resize subresource); Deployment template changes still trigger a rollout.
- [tech-facts] HPA utilisation is measured relative to requests (sets up L18).
- [sim-models] Scheduler: filter/score/bind on requests; maxPods 110; eviction threshold memory.available < 100Mi; QoS oom_score_adj Guaranteed −997, BestEffort 1000.

## Analogies (always with where they break down)
- Rezervacija u restoranu (request) i kućni red o najvećoj potrošnji (limit). Breaks down: the two limits have different consequences – memory over limit gets you thrown out, CPU over limit slows you down.

## Glossary terms introduced
Resource requests, Resource limits, OOMKilled

## Bridge to next (CostNote)
Limiti drže curenje pod kontrolom, a requests su točni. Ali svaki dan u 11:45 Davor i dalje ručno upisuje `kubectl scale --replicas=12`. Na blagdanski ponedjeljak zaboravi – i u 12:05 prosječna narudžba čeka pet sekundi.
