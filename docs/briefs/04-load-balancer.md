# Lecture 04 — Load balancer: tko dijeli promet
_Algoritmi raspodjele na različito jakim poslužiteljima – i zašto pošteno ne znači jednako._ · ~40 min · module m1 · prerequisites: 02, 03
Folder: `src/lectures/04-load-balancer/` · URL: `/predavanje/load-balancer`
Engines: E1 → src/engines/traffic/

## Continuity
- Previous lecture (03 Zašto raspodijeljeni sustavi – i što to košta) ends with: Drugi poslužitelj stoji i čeka jer DNS sve šalje na prvi. Davor u međuvremenu doda i treći: uz veliki (4 vCPU, 8 GB) Klopa sada ima mali (1 vCPU, 2 GB) i srednji (2 vCPU, 4 GB) poslužitelj. Netko mora dijeliti promet – i to pametno.
- Next lecture (05 Kad poslužitelj padne: provjere ispravnosti i gdje živi stanje) opens with: 12:03, procesu na Velikom ponestalo je memorije i srušio se. Nakon pokusa „Sporiji procesor” Davor je prešao na algoritam „najmanje veza” – i propalo je 37 narudžbi prije nego što je load balancer shvatio što se dogodilo. Istodobno studenti javljaju da im se košarica ispraznila i da su odjavljeni. Zašto load balancer kasni i gdje bi zapravo trebala živjeti košarica?

## Hook (incident)
Klopa ima tri poslužitelja: mali (1 vCPU, 2 GB), srednji (2 vCPU, 4 GB) i veliki (4 vCPU, 8 GB). Davor je najprije sve tri adrese stavio u DNS, ali DNS korisnike dijeli otprilike jednako – ne zna da je veliki poslužitelj četiri puta jači od malog, a kad jedan padne, klijenti njegovu adresu još minutama pamte. Zato postavlja load balancer s kružnim raspoređivanjem – i u 12:00 mali poslužitelj vraća greške dok veliki radi na četvrtini snage. Kako dijeliti promet pošteno?

## Objectives (rendered by the page hero)
- objasniti što radi load balancer i zašto omogućuje horizontalno skaliranje
- konfigurirati poslužitelje s različitim brojem procesorskih jezgri i količinom RAM-a te predvidjeti njihov kapacitet
- usporediti kružno i težinsko raspoređivanje te algoritam najmanje aktivnih veza na istom prometu
- objasniti zašto se razlika među algoritmima vidi u p95, p99 i greškama, a ne u prosjeku
- razlikovati L4 (veze) i L7 (zahtjevi) raspodjelu opterećenja

## Scenes
### 1. DNS kao load balancer? (animation)
- Concept: Played as the hook animation. Several A records: resolvers rotate the order, so clients spread roughly evenly by count. DNS cannot weight 1:2:4, does not know which server is alive, and caches (resolver, OS, browser, sometimes ignoring TTL) keep a dead IP in use; a whole campus behind one caching resolver shares one answer per TTL, so the split is lumpy.
- Visual: Three A records rotating; even split despite unequal servers; a dead server still receiving cached clients; TTL countdown.
### 2. Vi ste load balancer (interactive)
- Concept: Manual mode: the student routes each request by clicking a server, gets overwhelmed, then presses „Automatski”.
- Visual: Request queue at the LB with click targets; arrival rate rises.
### 3. Koliko može koji poslužitelj? (interactive)
- Concept: cap_cpu = vCPU·1000/cpuMs; W = floor((RAM−512)/memMB) radnika; cap_mem = W·1000/(cpuMs+ioMs); capacity ≈ min. API preset: Mali 5, Srednji 10, Veliki 20 req/s; 4 vCPU/2 GB is RAM-bound at 12; I/O preset 4/2 → 5,7 vs 1/8 → 20.
- Visual: Server builder card with sliders and live capacity.
### 4. Predvidite: 4 GB ili 8 GB? (interactive)
- Concept: Predict before the flagship (the lecturer's 2/4 GB example): „Srednji poslužitelj (2 vCPU, 4 GB) i poslužitelj s 2 vCPU i 8 GB – koji obradi više API zahtjeva?” Correct: „Jednako, oko 10 u sekundi.” Explain: procesorske jezgre određuju propusnost; RAM pomaže tek kad zahtjevi dugo čekaju bazu – prebacite opterećenje na I/O. Leads directly into the flagship's second task.
- Visual: Predict card with two server cards; reveal runs both on the same seed.
### 5. Ljestve algoritama (animation)
- Concept: Main path: Nasumično, Kružno (round robin), Težinsko kružno (smooth WRR), Najmanje veza (inflight+queued; weighted (active+1)/w) – one-sentence rule each. Under Napredno + DeepDive: Dva nasumična izbora (power of two choices), Najkraće vrijeme odgovora.
- Visual: Same 12 requests routed by each algorithm side by side.
### 6. Kad se poslužitelj uspori (interactive)
- Concept: „Sporiji procesor” (CPU work ×3): static weights keep feeding it, least connections adapts; weights fit only one workload mix.
- Visual: One server turns amber; per-server queue bars.
### 7. Omotnica: L4 ili L7 (animation)
- Concept: L4 sees IP:port and balances connections (NLB, Kubernetes Service); L7 reads host/path/cookie, balances requests, routes /api vs /fotografije, retries, terminates TLS; keep-alive over L4 pins a client (pays off in L14; L7 algorithms return at the Gateway in L15).
- Visual: Envelope metaphor with toggle; a keep-alive client stream sticks to one server.

## Flagship simulation: Load balancer u vašim rukama
The lecturer's sim (E1): build a rack of heterogeneous servers, pick an algorithm and traffic, watch per-server CPU lanes, RAM radnik slots and queues, p50/p95/p99 and errors split 502/503/504; same seed for fair comparisons; small multiples of three algorithms. Zadaci: „0 % grešaka pri λ = 20 sa zadanim poslužiteljima”, „Pokažite da 2 vCPU/4 GB i 2 vCPU/8 GB jednako vrijede za API, zatim pronađite opterećenje u kojem 8 GB pobjeđuje”, „Najjeftiniji skup koji pri λ = 25 drži p95 < 1,5 s”. Incident card: λ 15, Kružno, API preset, seed 42.

Controls:
- Slagač: Mali (1 vCPU/2 GB), Srednji (2/4), Veliki (4/8) ili Prilagođeni (vCPU 1–8, RAM 1–16 GB)
- Segmented algoritam: Ručno, Nasumično, Kružno (round robin), Težinsko kružno (uredive težine), Najmanje veza, Težinski najmanje veza; Napredno: Dva nasumična izbora, Najkraće vrijeme odgovora
- Klizač „Promet” 1–50 zahtjeva/s; uzorak stalni / valovi / nalet
- Segmented opterećenje: API / I/O / CPU (obrada fotografija)
- Gumb „Ponovi isti promet” i prikaz „Usporedi tri algoritma”
- Gumbi za kvar: „Sporiji procesor”, „Nalet u 12:00”, „Neograničeni radnici”
- Napredno: duljina reda po poslužitelju 0–100

Model (exact rules):
sim-models SIM 1 exactly. DT 10 ms; BASE 512 MB; QUEUE_MAX 10; client timeout 5000 ms; λ default 10; defaults S1 1/2 GB, S2 2/4, S3 4/8; presets API 200/300/256, I/O 50/1000/256, CPU 400/50/256. Route among healthy servers: inflight<W → start, else queue<QUEUE_MAX → enqueue, else 503. share = min(1, vCPU/nCpu); queued age > timeout → 504; late completion → 504. Smooth WRR: cw[i]+=w[i], pick max, cw[pick]−=Σw; weights ∝ capacity (1:2:4). LC and least-response use active = inflight+queued; least response = EWMA(α 0,2)·(active+1); P2C = two distinct random healthy, fewer active. 'Sporiji procesor' ×3 CPU demand. Unbounded workers → OOM: inflight+queued → 502, restart 6 s. Percentiles over successes only. Validated (seed 42, 300 s): λ15 RR 2,7 % errors p95 3,2 s (S1 98 % CPU, S3 27 %), WRR 0 %/1,0 s, LC 0 %/1,2 s; λ20 RR 10,6 %, WRR 0 %, LC 0,1 %; λ30 RR 18,9 %, WRR 0,2 %, LC 0,6 %, P2C 1,5 %, LRT 0,1 %; λ35 (=capacity) RR 25,9 %, WRR 4 %, LC 4,6 %, P2C 8,7 %. Random ≈ RR. Mixed I/O (4/2 GB vs 1/8 GB) λ15: LC 0,4 % vs RR 11,8 %. Advanced: queue 30 + I/O on 2 GB → goodput collapses (bufferbloat); at API overload an 8 GB server can show more timeouts than 2 GB (more concurrency, same CPU). A disabled toggle „Kubernetes Service (L14)” is planted.

Break it: „Sporiji procesor” on the big server: WRR keeps sending it 4/7 of traffic and its queue overflows, least connections shifts load away; „Nalet u 12:00” pushes RR past the small server; „Neograničeni radnici” makes a 2 GB server OOM-crash in a loop (502).

Insight: Round robin doesn't know servers differ; procesorske jezgre set throughput, RAM sets concurrency; a better algorithm shows in p95/p99 and errors, not the average; a load balancer adds capacity, not speed.

## Code artifacts
- nginx upstream: weight, least_conn, random two (nginx): Algorithms from the sim as real config (upstream servers on :8000)
- Envoy LEAST_REQUEST (dva nasumična izbora) (yaml): DeepDive, closed

## Misconceptions (Croatian myth + English correction)
- „Round robin je pošten” — it ignores server size and request weight.
- „Load balancer ubrzava svaki zahtjev” — it adds capacity and one hop, not speed.
- „Više RAM-a = veća propusnost” — RAM bounds concurrency, cores bound throughput (2/4 GB and 2/8 GB give the same ~10 rps on the API preset).
- „Promet se uvijek raspoređuje po zahtjevu” — L4 balancers balance connections; a keep-alive client sticks to one server.
- „Najmanje veza je uvijek najbolje” — a fast-failing server looks least busy (black hole, L05).

## Key facts (verified; date-sensitive ones belong in fact callouts)
- [tech-facts] Classic LBs offer round robin, weighted RR, least connections…; IPVS documents rr, wrr, lc, wlc, lblc.
- [tech-facts] A Kubernetes Service (kube-proxy in the default iptables/nftables mode) uses none of these algorithms: it picks a ready endpoint at random for each new connection, with no weights and no notion of node size; it does skip Pods that fail readiness (payoff in L12, L14).
- [sim-models] NGINX default is weighted RR (also least_conn, ip_hash, hash consistent, random two least_conn); Envoy LEAST_REQUEST = power of two choices; AWS ALB: round robin default, least outstanding requests, weighted random.

## Analogies (always with where they break down)
- Domaćin u restoranu raspoređuje goste za stolove za dvoje i za osmero. Breaks down: the host sees how busy each waiter is; an LB only knows connection counts and health checks, not how heavy a request is.

## Glossary terms introduced
Load balancer, Round robin, Least connections, L4 and L7 load balancing

## Bridge to next (CostNote)
S težinskim raspoređivanjem ručak je preživio, a nakon pokusa „Sporiji procesor” Davor je prešao na „najmanje veza”. Ali u 12:03 procesu na Velikom ponestane memorije i sruši se, a load balancer mu još nekoliko sekundi šalje narudžbe. Usto, studenti se žale: „Košarica mi se sama ispraznila!”
