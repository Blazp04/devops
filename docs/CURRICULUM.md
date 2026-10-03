# Kubernetes od nule

_Od jednog poslužitelja do klastera koji se sam popravlja – na primjeru aplikacije za menzu._

Generated from [curriculum.json](curriculum.json). 24 lectures in 6 modules, about 15 hours of self-paced study.

## Running example

KLOPA: a fictional student-built app for pre-ordering lunch at a campus canteen (menza). Daily 12:00 lunch rush = natural recurring load spike; 'Ćevap-petak' = Friday flash crowd; 'ispitni rok' = week-long growth. Components (grow over the course): klopa-web (TypeScript frontend built with npm/Vite, served by nginx), klopa-api (Python/Django behind gunicorn with synchronous workers: one request per worker, ≈256 MB per worker – exactly the worker-pool server the M1 sims model, labelled as such; a DeepDive in L02 explains how Node.js/Go/async servers differ), klopa-worker (Python RabbitMQ consumer via pika: kitchen tickets, SMS 'narudžba je spremna'), Postgres, Redis (sessions/cache), RabbitMQ (orders queue), external SMS gateway. Fixed names: domain klopa.example (RFC 2606 reserved – never klopa.hr), registry registry.klopa.example, namespaces klopa and klopa-staging, app port 8000 (gunicorn), web 8080 (unprivileged nginx). Version chain (klopa-api tags): 1.3.2 (v1, blue) → 1.4.0 'vegetarijanski meni' (L13, v2 violet) → 1.5.0 broken (rose, L13) → 2.0.0 'nova košarica' with a VAT bug: rolled out with RollingUpdate in the L20 hook, rolled back; the L20 sim shows a canary stopping it → 2.0.1 VAT fix shipped through CI + Argo CD (L21–L22) → 2.0.2 hotfix for the Ćevap-petak discount (L24). Cast (fictional, gender-balanced, only in short story beats/speech bubbles – the only place colloquial verbs like 'deployati' are allowed): Lana (backend dev), Davor (ops/on-call; announces Erasmus in L20, is gone by L23 = bus factor), Petra (product, brings requirements), Iva (new teammate from L06/L07, fresh eyes and new mistakes), teta Mira (kitchen, voice of physical consequences: „Dvaput ćevapi?!”). Narrative devices: (1) incident card at the top of each lecture (day/time, symptom, req/s, p95, errors) – every number must be reproducible in that lecture's sim with the preset and seed printed on the card; (2) 'Cijena rješenja' box at the end = next lecture's incident (hook/bridge chain); (3) Klopa karta (src/kit/story/story-map.ts) grows each lecture: 01 users→DNS→laptop/VPS; 02 one VPS resized 2 vCPU/2 GB → 4 vCPU/8 GB + Postgres; 03 second server (srednji), shared DB; 04 load balancer, 3 servers (Mali 1/2, Srednji 2/4, Veliki 4/8); 05 health checks + Redis; 06 RabbitMQ + worker + SMS gateway; 07–09 containers on one Compose host; 10 cluster box; 11 control plane + 3 nodes; 12 Pod; 13 Deployment/ReplicaSet; 14 Service; 15 Gateway; 16 ConfigMap/Secret; 17 node sizes/requests; 18 HPA + Cluster Autoscaler + KEDA on worker; 19 Postgres StatefulSet + PVC (labelled 'u tečaju StatefulSet; u produkciji upravljana baza ili operator'); 20 staging/prod environments; 21 CI + registry; 22 config repo + Argo CD; 23 secret store + ESO; 24 complete + observability. (4) Optional 'Davorov dežurni priručnik' (symptom → cause → command) grows from L11 and is downloadable in L24. Six shared sim engines (pure TS, seeded): E1 Promet (LB/traffic), E2 Red (queue; Kafka only as a DeepDive stepper), E3 Klaster (controllers, scheduler, probes, rollout, HPA/CA), E4 Tvornica (build cache, pipeline), E5 Tko vidi? (secret access graph), E6 Git↔klaster (Argo CD).

## Modul 1: Zašto raspodijeljeni sustavi

Zašto jedno računalo nije dovoljno: mjere opterećenja, granice jednog poslužitelja, cijena raspodijeljenih sustava, load balancer, provjere ispravnosti, stanje i redovi poruka.

### 01. Put jednog zahtjeva

_Što se dogodi između upisane adrese i prikazane stranice – i zašto localhost nije adresa za druge._ · ~30 min

**Hook:** Lana je napisala Klopu, aplikaciju za naručivanje ručka u menzi, i ona savršeno radi na adresi `localhost:8000`. Pošalje poveznicu Petri, a Petra odgovori: „Ne otvara se.” Što se zapravo događa kad netko upiše adresu – i zašto Lanin localhost nije i Petrin?

**Ciljevi učenja:**
- pratiti zahtjev od upisane adrese do odgovora: DNS, IP adresa, port, TCP veza i HTTP
- objasniti zašto aplikacija koja sluša na 127.0.0.1 ili na laptopu iza kućnog usmjerivača nije dostupna s drugog računala
- po simptomu razlikovati NXDOMAIN, odbijenu vezu i istek vremena
- procijeniti najmanju latenciju zbog udaljenosti i broja povratnih putovanja
- opisati što znači postaviti aplikaciju na poslužitelj u najjednostavnijem obliku

**Scene:**
1. **Kamo idemo: Klopa na kraju tečaja** (animation): Course trailer: the final Klopa architecture so students know the destination; every box labelled with the lecture that introduces it.
2. **Zašto Petra ne vidi localhost** (animation): Loopback 127.0.0.1 always means 'this machine'.
3. **Put zahtjeva korak po korak** (animation): DNS (resolver, TTL cache; a missing name costs one resolver round trip and returns NXDOMAIN) → IP → TCP handshake (1 RTT) → TLS 1.3 (1 RTT) → HTTP request/response → process listening on a port; status families 2xx/4xx/5xx; 502/503/504 named for later.
4. **Tko sluša na kojim vratima** (interactive): A process binds IP:port. 127.0.0.1 = only this machine; 0.0.0.0 or :: = all interfaces. Defaults differ: gunicorn and Django runserver bind 127.0.0.1:8000, Node's server.listen(port) binds all interfaces. By default one process per IP:port (SO_REUSEPORT and gunicorn's/Node's pre-fork master sharing one socket are deliberate exceptions). Even bound to 0.0.0.0, a laptop on home or campus Wi-Fi has a private address (192.168.x.x, 10.x) behind NAT, so Petra on mobile data still cannot reach it – that is why we rent a server with a public IP. Firewall in front of the doors.
5. **Udaljenost je latencija** (interactive): Light in fibre ≈200 000 km/s → ≥1 ms RTT per 100 km; Zagreb→Frankfurt ≥7,2 ms, →Sydney ≥160 ms; new HTTPS connection ≥3 RTT before first byte.
6. **Prvo postavljanje: s laptopa na poslužitelj** (animation): Informal deploy (postavljanje): rent a VPS with 2 vCPU/2 GB and a public IP, copy code, run gunicorn --bind 0.0.0.0:8000, add a DNS A record; Petra opens http://klopa.example:8000. One line: in practice a reverse proxy (Caddy/nginx) listens on :443, terminates TLS and forwards to the app – the app may then listen on 127.0.0.1, which is safer (DeepDive). Chip: postavljanje ≠ Kubernetesov Deployment (L13).

**Glavna simulacija: Put jednog zahtjeva.** Packet tracer: pick a scenario, the request walks resolver → DNS → TCP → TLS → HTTP → app while a waterfall builds; break-it toggles produce distinct symptoms. Zadaci: „Dijagnosticirajte četiri pokvarena URL-a samo po simptomu”, „Dovedite Petrin zahtjev do odgovora 200”.

- _Pokvari:_ NXDOMAIN stops before any TCP connection; a DROP firewall or a stale DNS record hangs until timeout (hollow); app down or bound to 127.0.0.1 gives instant 'connection refused' (spiky); the laptop scenario times out whatever the bind address; a Sydney server stretches the waterfall to ≥480 ms before the first byte.
- _Uvid:_ Every symptom points to a layer – name, address, door, process; 'refused' and 'timeout' tell different stories, and distance costs time no code can remove.

**Zablude koje razbijamo:**
- „localhost je moj poslužitelj” — 127.0.0.1 always means the machine making the request.
- „Domena pokazuje na moju aplikaciju” — DNS returns only an IP; the port is separate (80/443 by default).
- „Connection refused znači da je poslužitelj spor” — refused = nothing listens (fast); silently dropped or unreachable = timeout.
- „Ako slušam na 0.0.0.0, svi me mogu dohvatiti” — a laptop behind NAT has a private address; you need a public IP (and an open firewall).
- „Latencija se može optimizirati do nule” — the speed of light sets a floor.

**Kod:** gunicorn --bind 127.0.0.1:8000 ili 0.0.0.0:8000 (bash), curl -v https://klopa.example (bash), dig i ss -ltnp (bash)

**Prijelaz dalje:** Klopa sada radi na iznajmljenom poslužitelju s dvije procesorske jezgre i 2 GB RAM-a i Petra je napokon vidi. Ponedjeljak, 12:00 – cijeli kampus otkrio je Klopu, a stranica se počinje vući.

### 02. Jedan poslužitelj u 12:00

_Propusnost, latencija i percentili – i zašto jači poslužitelj pomaže samo do neke mjere._ · ~35 min · nadovezuje se na 01

**Hook:** Ponedjeljak, 12:00. Klopa radi na poslužitelju s dvije procesorske jezgre i 2 GB RAM-a. U 11:58 p95 je oko 1,5 s, a u 12:00 skoči na 3 s i otprilike svaki drugi zahtjev dobiva grešku 503 jer je red pun. Davor otvori htop: procesor je na 15 %. Kako poslužitelj može biti pun dok procesor odmara?

**Ciljevi učenja:**
- opisati opterećenje propusnošću, latencijom (p50, p95, p99), stopom grešaka i iskorištenošću
- objasniti zašto procesorske jezgre određuju propusnost, a RAM koliko radnika (zahtjeva) istodobno stane
- predvidjeti nagli rast latencije kad se iskorištenost približi 100 %
- procijeniti kada vertikalno skaliranje pomaže i prepoznati jedinstvenu točku kvara
- izračunati dopuštenu nedostupnost iz postotka dostupnosti

**Scene:**
1. **Što poslužitelj radi sa zahtjevom** (animation): Worker-pool server: each in-flight request holds a radnik (engl. worker) process (RAM) and needs CPU time; while waiting on the DB it holds RAM but no CPU; W = floor((RAM−512 MB)/256 MB). Visible Callout „Model”: Klopin API je Django iza gunicorna sa sinkronim radnicima – jedan radnik obrađuje jedan zahtjev i zauzima ≈256 MB (kao PHP-FPM ili Puma). DeepDive „A Node.js, Go, async Python?”: one process serves many requests concurrently with async I/O; JavaScript runs on one core per process (scale with a process per core or more Pods), and concurrency is usually capped by the DB connection pool.
2. **Prosjek laže** (interactive): Nearest-rank percentiles over successful requests only; the mean hides the tail.
3. **Hokejaška palica** (interactive): Labelled 'model M/M/1 (jedan poslužitelj, slučajni dolasci i trajanja)': W/S = 1/(1−ρ) – 2× at 0,5, 3,3× at 0,7, 5× at 0,8, 10× at 0,9, 100× at 0,99; caused by randomness. With c parallel workers the knee moves right (Erlang C, c=4 at ρ=0,95 → ≈5,5×, not 20×) but is still there. Little's law in a DeepDive.
4. **Jezgre ili RAM?** (interactive): Validated: 2 vCPU, API preset ≈10 rps at 2/4/8 GB; I/O preset 2 GB ≈5,7 rps at ~15 % CPU, 4 GB ≈13, 8 GB ≈27.
5. **Veći poslužitelj** (interactive): Vertical scaling: each resize = restart gap; catalogue ends at „Nema većeg”; price per vCPU roughly linear within an instance family – limits are the ceiling, the restart and the SPOF.
6. **Izvucite utikač** (animation): SPOF; downtime table 99 % = 87,6 h/god., 99,9 % = 8,76 h (43,2 min/30 dana), 99,99 % = 52,6 min, 99,999 % = 5,3 min. (A = MTBF/(MTBF+MTTR) moves to L03.)

**Glavna simulacija: Jedan poslužitelj protiv ručka.** E1 with one worker-pool server under Poisson traffic. Zadaci: „Preživite 12:00 uz p95 < 1 s i < 1 % grešaka na najjeftinijem poslužitelju”, „Pronađite opterećenje za koje više RAM-a ne pomaže”. Incident card preset: I/O, 2 vCPU/2 GB, λ 4 → nalet ×3, seed 42.

- _Pokvari:_ „Izvuci utikač” takes availability to zero; „Neograničeni radnici” turns 2 GB into an OOM crash loop; every resize shows a downtime gap and the catalogue ends with „Nema većeg”; a 30-slot queue turns 503s into 504s and wasted work.
- _Uvid:_ A server can be full while its CPU idles, because RAM bounds how many workers fit; more RAM does nothing for a CPU-bound app; latency explodes near 100 %; one machine is always a single point of failure.

**Zablude koje razbijamo:**
- „Više RAM-a = brži poslužitelj” — for this app server RAM bounds concurrency and cores bound throughput; for a database RAM is cache (page cache, shared_buffers) and does speed up reads (L05, L19).
- „Latencija raste linearno s opterećenjem” — it grows like 1/(1−ρ) in M/M/1; more workers move the knee, they don't remove it.
- „Prosječna latencija je dovoljna” — watch p95/p99; the mean hides the tail.
- „Vertikalno skaliranje je zastarjelo” — often the right first move; its limits are the ceiling, the restart gap and the SPOF.
- „70 % CPU-a znači 30 % rezerve” — in M/M/1 at 70 % the wait is already 3,3× the service time; more cores move the knee, they don't remove it.

**Kod:** Broj radnika: gunicorn / PHP-FPM i usporedba s Node.js (ini), k6 test opterećenja (javascript), htop i free -m (text)

**Prijelaz dalje:** Davor je poslužitelj zamijenio velikim, s četiri procesorske jezgre i 8 GB RAM-a. U petak u 12:03 pružatelj ima kvar napajanja i Klope nema dva sata, baš za ručak – a ispitni rok tek dolazi. „Kupimo drugi poslužitelj!”

### 03. Zašto raspodijeljeni sustavi – i što to košta

_Tri razloga za više računala i nova vrsta problema koju time kupujemo._ · ~35 min · nadovezuje se na 02

**Hook:** Dva sata bez Klope usred ručka. Davor predlaže: „Kupimo drugi poslužitelj!” Lana pita: „Hoće li onda biti dvostruko brže i dvostruko pouzdanije?” Prije kupnje pogledajmo što dobivamo kad aplikaciju raširimo na više računala – i što pritom plaćamo.

**Ciljevi učenja:**
- navesti tri razloga za raspodijeljeni sustav: kapacitet, dostupnost i blizinu korisnicima
- izračunati dostupnost iz MTBF-a i MTTR-a te komponenti u nizu i paralelno i objasniti zašto kvarovi često nisu neovisni
- objasniti zašto deset poslužitelja ne daje deset puta veću propusnost
- objasniti djelomični kvar i zašto se spor poslužitelj ne može razlikovati od mrtvog
- procijeniti treba li aplikaciji uopće raspodijeljeni sustav

**Scene:**
1. **Tri razloga** (animation): Capacity beyond the biggest machine, availability beyond one machine, proximity to users; scale up vs scale out; replication (same app ×N) vs decomposition (microservices). Term raspodijeljeni (also distribuirani) sustav.
2. **Trebate li ovo uopće?** (interactive): Many apps run fine on one server; distribute only when load, availability or geography require it.
3. **Matematika devetki** (interactive): A = MTBF/(MTBF+MTTR) (moved here from L02); series ΠAᵢ (2×99 % → 98,01 %); parallel 1−Π(1−Aᵢ) (2×99 % → 99,99 %); LB 99,99 % × app pair × single DB 99,9 % ≈ 99,88 %; 10 servers at 99 % → at least one down ≈9,6 % of the time.
4. **Zašto 10 × poslužitelja ≠ 10 × propusnosti** (interactive): Shared bottleneck (DB); Amdahl p=0,95 → max 20× (model). USL α=0,05, β=0,001 → peak N≈31 then decline – in a closed DeepDive, labelled as a model.
5. **Spor ili mrtav?** (interactive): Partial failure and the fallacies (lost, delayed, duplicated, reordered, partitioned); a slow node looks like a dead one; timeouts trade false alarms against waiting.
6. **Dodajmo drugi poslužitelj** (animation): Cliffhanger: DNS still points to server 1, so server 2 idles.

**Glavna simulacija: Arhitekt dostupnosti.** Build Klopa as a chain (ulaz → poslužitelji aplikacije × N → baza), set availability, failure domain and capacity per component, then run a seeded 'godina u 10 sekundi'. Zadaci: „Dosegnite 99,9 % unutar budžeta”, „Pokažite da jedna baza od 99,9 % određuje cijeli lanac”, „Preživite kvar ormara”.

- _Pokvari:_ With the rack toggle on, „Kvar ormara” takes both app servers down together; „Loša konfiguracija” shows redundancy does not help against the same mistake everywhere; at 70 % of peak per server, losing one server overloads the other (≈143 %).
- _Uvid:_ Redundancy pays only when failures are independent and survivors have spare capacity; the single database dominates the chain; more machines also means more things that fail.

**Zablude koje razbijamo:**
- „Dvostruko poslužitelja = dvostruki kapacitet” — a shared component (the DB) caps throughput.
- „Raspodijeljeno je automatski pouzdanije” — more parts, more failures; reliability needs redundancy plus design.
- „Mreža je pouzdana i brza” — messages get lost, delayed, duplicated and reordered.
- „Dva poslužitelja od 99 % uvijek daju 99,99 %” — only with independent failures, failover and N+1 capacity.
- „Svaka aplikacija treba mikroservise i Kubernetes” — many apps run fine on one server; distribute only when load, availability or geography demand it.

**Kod:** availability.ts (typescript), ping i mtr do bliskog i dalekog poslužitelja (bash)

**Prijelaz dalje:** Drugi poslužitelj stoji i čeka jer DNS sve šalje na prvi. Davor u međuvremenu doda i treći: uz veliki (4 vCPU, 8 GB) Klopa sada ima mali (1 vCPU, 2 GB) i srednji (2 vCPU, 4 GB) poslužitelj. Netko mora dijeliti promet – i to pametno.

### 04. Load balancer: tko dijeli promet

_Algoritmi raspodjele na različito jakim poslužiteljima – i zašto pošteno ne znači jednako._ · ~40 min · nadovezuje se na 02, 03

**Hook:** Klopa ima tri poslužitelja: mali (1 vCPU, 2 GB), srednji (2 vCPU, 4 GB) i veliki (4 vCPU, 8 GB). Davor je najprije sve tri adrese stavio u DNS, ali DNS korisnike dijeli otprilike jednako – ne zna da je veliki poslužitelj četiri puta jači od malog, a kad jedan padne, klijenti njegovu adresu još minutama pamte. Zato postavlja load balancer s kružnim raspoređivanjem – i u 12:00 mali poslužitelj vraća greške dok veliki radi na četvrtini snage. Kako dijeliti promet pošteno?

**Ciljevi učenja:**
- objasniti što radi load balancer i zašto omogućuje horizontalno skaliranje
- konfigurirati poslužitelje s različitim brojem procesorskih jezgri i količinom RAM-a te predvidjeti njihov kapacitet
- usporediti kružno i težinsko raspoređivanje te algoritam najmanje aktivnih veza na istom prometu
- objasniti zašto se razlika među algoritmima vidi u p95, p99 i greškama, a ne u prosjeku
- razlikovati L4 (veze) i L7 (zahtjevi) raspodjelu opterećenja

**Scene:**
1. **DNS kao load balancer?** (animation): Played as the hook animation. Several A records: resolvers rotate the order, so clients spread roughly evenly by count. DNS cannot weight 1:2:4, does not know which server is alive, and caches (resolver, OS, browser, sometimes ignoring TTL) keep a dead IP in use; a whole campus behind one caching resolver shares one answer per TTL, so the split is lumpy.
2. **Vi ste load balancer** (interactive): Manual mode: the student routes each request by clicking a server, gets overwhelmed, then presses „Automatski”.
3. **Koliko može koji poslužitelj?** (interactive): cap_cpu = vCPU·1000/cpuMs; W = floor((RAM−512)/memMB) radnika; cap_mem = W·1000/(cpuMs+ioMs); capacity ≈ min. API preset: Mali 5, Srednji 10, Veliki 20 req/s; 4 vCPU/2 GB is RAM-bound at 12; I/O preset 4/2 → 5,7 vs 1/8 → 20.
4. **Predvidite: 4 GB ili 8 GB?** (interactive): Predict before the flagship (the lecturer's 2/4 GB example): „Srednji poslužitelj (2 vCPU, 4 GB) i poslužitelj s 2 vCPU i 8 GB – koji obradi više API zahtjeva?” Correct: „Jednako, oko 10 u sekundi.” Explain: procesorske jezgre određuju propusnost; RAM pomaže tek kad zahtjevi dugo čekaju bazu – prebacite opterećenje na I/O. Leads directly into the flagship's second task.
5. **Ljestve algoritama** (animation): Main path: Nasumično, Kružno (round robin), Težinsko kružno (smooth WRR), Najmanje veza (inflight+queued; weighted (active+1)/w) – one-sentence rule each. Under Napredno + DeepDive: Dva nasumična izbora (power of two choices), Najkraće vrijeme odgovora.
6. **Kad se poslužitelj uspori** (interactive): „Spori disk” (CPU work ×3): static weights keep feeding it, least connections adapts; weights fit only one workload mix.
7. **Omotnica: L4 ili L7** (animation): L4 sees IP:port and balances connections (NLB, Kubernetes Service); L7 reads host/path/cookie, balances requests, routes /api vs /fotografije, retries, terminates TLS; keep-alive over L4 pins a client (pays off in L14; L7 algorithms return at the Gateway in L15).

**Glavna simulacija: Load balancer u vašim rukama.** The lecturer's sim (E1): build a rack of heterogeneous servers, pick an algorithm and traffic, watch per-server CPU lanes, RAM radnik slots and queues, p50/p95/p99 and errors split 502/503/504; same seed for fair comparisons; small multiples of three algorithms. Zadaci: „0 % grešaka pri λ = 20 sa zadanim poslužiteljima”, „Pokažite da 2 vCPU/4 GB i 2 vCPU/8 GB jednako vrijede za API, zatim pronađite opterećenje u kojem 8 GB pobjeđuje”, „Najjeftiniji skup koji pri λ = 25 drži p95 < 1,5 s”. Incident card: λ 15, Kružno, API preset, seed 42.

- _Pokvari:_ „Spori disk” on the big server: WRR keeps sending it 4/7 of traffic and its queue overflows, least connections shifts load away; „Nalet u 12:00” pushes RR past the small server; „Neograničeni radnici” makes a 2 GB server OOM-crash in a loop (502).
- _Uvid:_ Round robin doesn't know servers differ; procesorske jezgre set throughput, RAM sets concurrency; a better algorithm shows in p95/p99 and errors, not the average; a load balancer adds capacity, not speed.

**Zablude koje razbijamo:**
- „Round robin je pošten” — it ignores server size and request weight.
- „Load balancer ubrzava svaki zahtjev” — it adds capacity and one hop, not speed.
- „Više RAM-a = veća propusnost” — RAM bounds concurrency, cores bound throughput (2/4 GB and 2/8 GB give the same ~10 rps on the API preset).
- „Promet se uvijek raspoređuje po zahtjevu” — L4 balancers balance connections; a keep-alive client sticks to one server.
- „Najmanje veza je uvijek najbolje” — a fast-failing server looks least busy (black hole, L05).

**Kod:** nginx upstream: weight, least_conn, random two (nginx), Envoy LEAST_REQUEST (dva nasumična izbora) (yaml)

**Prijelaz dalje:** S težinskim raspoređivanjem ručak je preživio. Ali u 12:03 procesu na velikom poslužitelju ponestane memorije i sruši se, a load balancer mu još nekoliko sekundi šalje narudžbe. Usto, studenti se žale: „Košarica mi se sama ispraznila!”

### 05. Kad poslužitelj padne: provjere ispravnosti i gdje živi stanje

_Kvar se nikad ne otkrije odmah, a košarica u memoriji poslužitelja nestaje s njim._ · ~35 min · nadovezuje se na 04

**Hook:** 12:03, procesu na velikom poslužitelju ponestalo je memorije i srušio se. Nakon pokusa sa „sporim diskom” Davor je prešao na algoritam najmanje aktivnih veza – i propalo je 37 narudžbi prije nego što je load balancer shvatio što se dogodilo. Istodobno studenti javljaju da im se košarica ispraznila i da su odjavljeni. Zašto load balancer kasni i gdje bi zapravo trebala živjeti košarica?

**Ciljevi učenja:**
- objasniti kako aktivne i pasivne provjere ispravnosti otkrivaju kvar i koliko to traje
- po simptomima razlikovati pad procesa, gašenje stroja, zastoj i pražnjenje poslužitelja
- objasniti zašto zalihost bez slobodnog kapaciteta (N+1) ne štiti
- objasniti zašto ljepljive sesije nisu rješenje i zašto stanje treba premjestiti u Redis ili bazu
- objasniti zašto baza postaje usko grlo i kako pomaže predmemorija

**Scene:**
1. **Prozor otkrivanja** (animation): Active check: unhealthy after U consecutive failures → detection between (U−1)·interval and U·interval (+timeout if hung). AWS ALB defaults 30 s / 5 s / healthy 5 / unhealthy 2 → detection ≈30–60 s after a crash, up to ≈65 s for a hung target; back in rotation only after 5 passing checks (≈150 s).
2. **Pad, gašenje, zastoj ili pražnjenje** (interactive): Process crash → port closed → RST → instant 502; machine off → no RST, the LB waits for its connect timeout → 502/504, like a hang; hang → requests wait until timeout → 504 (hollow); drain → no new requests, in-flight finish. Callback to L01 refused vs timeout.
3. **Crna rupa** (interactive): Least connections + fast-failing server attracts traffic; crash the S3 process at λ 15: RR 11 vs LC 37 failures; passive ejection and LB retry fix it; N+1: survivors at 100 % of capacity.
4. **Gdje živi košarica** (interactive): In-memory session → next request elsewhere = „sesija izgubljena”; sticky cookie → uneven load, lost on crash, no rebalance on scale-out; Redis (Django SESSION_ENGINE with the Redis cache) → stateless app servers. (Kubernetes' IP-based affinity comes in L14.)
5. **Kamera prelazi na bazu** (animation): State moved to the DB → DB is the new bottleneck and SPOF; cache-aside: h 0,9, cache 1 ms, DB 20 ms → avg 3 ms, 10 % DB load. Closed DeepDive: read replicas scale reads not writes; async lag breaks read-your-writes; CAP applies only during a partition.
6. **Tko balansira load balancer?** (text): Callout: the LB is itself a SPOF: HA pair with a floating IP (VRRP), DNS with several records (slow failover), anycast, managed cloud LBs.

**Glavna simulacija: Ugasite poslužitelj usred ručka.** The L04 rack with active/passive health checks, LB retry, per-server failure buttons and 20 users with carts. Zadaci: „Preživite pad procesa na S3 pri λ = 15 uz < 2 % grešaka”, „Ispraznite S2 bez ijedne neuspjele narudžbe”, „Nula izgubljenih sesija nakon pada bilo kojeg poslužitelja”. Incident card: λ 15, Najmanje veza, crash S3, seed 42.

- _Pokvari:_ „Sruši proces” under least connections shows the black hole; „Ugasi stroj” and „Zamrzni” fill queues with hollow 504s; „Ugasi Redis” logs everyone out at once – shared state is the new SPOF; „Ugasi load balancer” takes everything down.
- _Uvid:_ Failure detection always has a window; a crashed process, a dead machine, a hang and a drain look different; redundancy needs spare capacity; stateless servers are interchangeable, but state moves into the database, which becomes the hard part.

**Zablude koje razbijamo:**
- „Load balancer odmah zna da je poslužitelj pao” — only after U consecutive failed checks: (U−1)·interval to U·interval, plus the timeout when the server hangs.
- „Load balancer uklanja jedinstvenu točku kvara” — it is one unless it is redundant itself.
- „Ljepljive sesije rješavaju stanje” — they skew load, lose sessions on crash and don't rebalance on scale-out; move state to Redis/DB.
- „Bez stanja znači da aplikacija nema podataka” — the state lives elsewhere (Redis, DB).
- „Replike za čitanje skaliraju i pisanje” — every write still goes to the primary; replicas lag and can return stale reads (DeepDive).
- „CAP: uvijek birate dva od tri” — the trade-off applies only during a partition (DeepDive).

**Kod:** nginx: max_fails, fail_timeout, proxy_next_upstream (nginx), /healthz view (python), Sesije u Redisu (diff)

**Prijelaz dalje:** Poslužitelji aplikacije sada su zamjenjivi, a stanje živi u Postgresu i Redisu. No API sve radi sinkrono: spremi narudžbu, ispiše listić za kuhinju i pošalje SMS. U 12:00 SMS-gateway počne kasniti – i s njim zapinju sve narudžbe.

### 06. Redovi poruka i događaji

_Kako preživjeti nalet bez izgubljenih narudžbi – i zašto se ista narudžba ponekad skuha dvaput._ · ~40 min · nadovezuje se na 04, 05

**Hook:** SMS-gateway odgovara sve sporije, a API čeka svaki SMS, pa zapinju i narudžbe. Na Ćevap-petak narudžbe deset sekundi stižu po 15 u sekundi (inače dvije), a API ih istodobno može obrađivati samo četiri – od 445 narudžbi tog ručka izgubi se 152. Lana doda ponovne pokušaje – i teta Mira iz kuhinje viče: „Dvaput ćevapi za istu narudžbu?!” Kako odvojiti primanje narudžbe od posla koji slijedi, a da se ništa ne izgubi ni ne udvostruči?

**Ciljevi učenja:**
- objasniti kako red poruka razdvaja proizvođača i potrošača u vremenu i ublažava nalete
- pokazati zašto red ne povećava kapacitet
- objasniti potvrde i ponovnu isporuku u RabbitMQ-u i SQS-u te zašto isporuka barem jednom traži idempotentnog potrošača
- postaviti ponovne pokušaje sa sve duljim, nasumično raspršenim razmakom (engl. *exponential backoff with jitter*) i red neobrađenih poruka
- razlikovati naredbu (posao za jednog potrošača) i događaj (obavijest koju dobiva svaki pretplatnik) te red i objavi-pretplati; znati da log (Kafka) čuva poruke za ponovno čitanje

**Scene:**
1. **Sinkroni lanac** (animation): The request waits for payment + SMS + ticket; one slow dependency stalls everything; answer 202 + order ID instead.
2. **Red kao amortizer** (interactive): Bursts absorbed; if λ > kμ persists the queue grows without bound; drain time = backlog/(kμ−λ); consumers pull work (vs LB push).
3. **Potvrda i ponovna isporuka** (interactive): Ack before processing (crash → lost, at-most-once) vs after (crash after side effect → duplicate, at-least-once). Redelivery trigger differs by broker: RabbitMQ requeues unacked deliveries immediately when the consumer's channel/connection closes (redelivered=true), and closes a consumer that doesn't ack within consumer_timeout (default 30 min); SQS uses a visibility timeout (default 30 s) after which the message reappears.
4. **Ključ idempotentnosti** (interactive): Order ID + unique constraint (INSERT … ON CONFLICT DO NOTHING) makes database effects effectively-once when the dedup row and the effect commit in one transaction. External effects (SMS gateway, card payment) need the provider's idempotency key or must tolerate an occasional duplicate: record then send → risk of loss; send then record → risk of a duplicate. Outbox pattern in a DeepDive.
5. **Otrovna poruka** (interactive): Full-jitter backoff random(0, min(cap, base·2ⁿ)); one sentence: retries multiply load across layers (3 × 3 × 3 = 27×). RabbitMQ nack/requeue is immediate – backoff needs a retry queue (TTL + dead-letter exchange) or the delayed-message plugin; SQS supports per-message delay. Delivery limit → DLQ; RabbitMQ quorum default delivery-limit 20; without a dead-letter exchange the message is dropped.
6. **Red, pub/sub ili log** (interactive): Command „Skuhaj narudžbu 42” (work queue, one consumer) vs event „NarudzbaZaprimljena” (fan-out: kitchen, SMS, analytics each get a copy). Closed DeepDive „Za znatiželjne: log i Kafka”: a log keeps messages for replay; partitions, per-key order, offsets, lag; in a classic consumer group consumers beyond the partition count sit idle; Kafka ≥4.2 share groups let more consumers than partitions share work with per-message acks and no per-key order.

**Glavna simulacija: Kuhinjska šina.** E2: producer → queue → k potrošača with visible acks, redelivery, retries and DLQ; switch between direct calls and a queue, and between RabbitMQ and SQS semantics. Zadaci: „Ćevap-petak bez izgubljene narudžbe”, „Ispraznite red u < 20 s s najmanje potrošača”, „Nula dvostrukih narudžbi kad potrošač padne nakon kuhanja (RabbitMQ) ili kad obrada traje dulje od roka za potvrdu (SQS)”, „Otrovnu poruku odvojite u DLQ”. Incident card: direct mode, nalet, k 4, seed 42, run length 150 s.

- _Pokvari:_ „SMS-gateway pao”: direct mode fails orders, queue mode keeps accepting while depth climbs then drains; crashing a consumer after cooking but before ack duplicates the order unless idempotent (and the SMS can still go out twice); in SQS mode a slow consumer past the visibility timeout duplicates too; a poison message loops until the DLQ.
- _Uvid:_ A queue doesn't make work faster – it makes waiting safe; delivered twice is normal, so consumers must be idempotent – and idempotency is easy only inside your own database transaction.

**Zablude koje razbijamo:**
- „Red ubrzava obradu” — it absorbs bursts; if λ > kμ persists the backlog grows without bound; only more consumers add capacity.
- „Svaka poruka stiže točno jednom” — at-least-once is the norm; redelivery after a crash or timeout is expected, so consumers must be idempotent.
- „Poruke se obrađuju redom” — not with several consumers.
- „Asinkrono znači da nitko ne čeka rezultat” — return an ID, notify later.
- „Idempotentnost rješava i dvostruke SMS-ove” — only effects in the same DB transaction; external calls need the provider's idempotency key.
- „Kafka treba ZooKeeper” — KRaft production-ready since 3.3; ZooKeeper removed in 4.0 (March 2025).
- „Kafka ne zna raditi redove” — share groups (production-ready in 4.2) give queue-like semantics.

**Kod:** Potrošač s potvrdom nakon obrade (python), Idempotentni upis narudžbe (sql), Quorum red s x-delivery-limit, retry redom i dead-letter exchangeom (python), Kafka producer s ključem (python)

**Prijelaz dalje:** Klopa sad ima šest vrsta procesa – web, API, worker, Postgres, Redis i RabbitMQ – na tri ručno konfigurirana poslužitelja. U tim dolazi Iva, prvi dan pokrene API i kaže: „Kod mene radi, na poslužitelju ne.”

## Modul 2: Kontejneri: pakiranje i pokretanje softvera

Virtualni strojevi i kontejneri, Docker i kontejnerizacija, slike kontejnera, registri i Docker Compose.

### 07. Virtualni stroj i kontejner

_Dva načina dijeljenja jednog računala – i zašto je kontejner samo proces s naočalama i pojasom._ · ~35 min · nadovezuje se na 02, 06

**Hook:** Iva na laptopu ima najnoviji Python, a na poslužitelju je verzija stara dvije godine. API i worker trebaju dvije različite verzije sistemske biblioteke za obradu fotografija (libvips) koju instalira operacijski sustav, a poslužitelj-2 netko je prije godinu dana ručno konfigurirao pa se razlikuje od poslužitelja-1. Kako aplikaciji dati njezino okruženje, a da ne kupimo računalo za svaku?

**Ciljevi učenja:**
- objasniti put od fizičkog poslužitelja preko virtualnog stroja do kontejnera
- usporediti virtualni stroj i kontejner po izolaciji, gustoći i brzini pokretanja
- objasniti da je kontejner izolirani proces: imenski prostori određuju što vidi, kontrolne grupe koliko smije potrošiti
- objasniti zašto u oblaku kontejneri rade unutar virtualnih strojeva i zašto Docker na Macu pokreće Linux VM
- prepoznati kada arhitektura procesora sprječava pokretanje slike

**Scene:**
1. **Tri ere** (animation): Traditional (one app per server), virtualized (VM with full OS), containers (shared OS) – from the Kubernetes overview; system-library conflicts and snowflake servers.
2. **Slojevi: VM ili kontejner** (animation): hardware → hypervisor → guest OS with own kernel → app vs hardware → host kernel → runtime → app process with its userspace libraries.
3. **Kontejner je samo proces** (interactive): Same process is PID 1 inside, PID 48213 on the host; uname -r identical.
4. **Naočale i pojas** (interactive): Namespaces change what the process sees – main path shows pid, net and mnt; DeepDive lists all eight Linux namespace types (pid, net, mnt, uts, ipc, user, cgroup, time). cgroups: memory.max → OOM kill, cpu.max 20000 100000 → throttled periods (planted for L17).
5. **Cijena izolacije** (animation): Main path: shared kernel → a kernel exploit crosses containers; a VM stops at the hypervisor. Closed DeepDive spectrum: plain container → container with a user namespace (an escape lands as an unprivileged host UID; the kernel is still shared, so a kernel exploit still crosses; user namespaces in Pods GA in Kubernetes 1.36) → gVisor (user-space kernel) → microVM (Kata, Firecracker) → full VM.
6. **Kontejneri u VM-ovima** (animation): Cloud nodes are VMs; Docker Desktop on macOS runs a Linux VM; amd64 vs arm64 images: on Apple silicon Docker Desktop runs amd64 images under emulation (slower, sometimes broken); on an arm64 Linux node without emulation an amd64-only image fails ('no matching manifest' or 'exec format error').

**Glavna simulacija: Slagač stoga.** A 16 GB host in VM mode or container mode: add Klopa apps, watch RAM accounting, a start race and isolation. Zadaci: „Smjestite 12 aplikacija na 16 GB”, „Ograničite curenje memorije na jednu aplikaciju”, „Pronađite način u kojem napad na jezgru ne prelazi granicu”.

- _Pokvari:_ „Napad na jezgru” cracks every container (user namespaces only lower the attacker's privileges) but stops at the hypervisor; „Curenje memorije” without memory.max lets the host OOM killer hit a neighbour.
- _Uvid:_ A container is an isolated process sharing the host kernel – isolation is traded for density and speed; in the cloud the answer is usually both.

**Zablude koje razbijamo:**
- „Kontejner je lagani virtualni stroj” — an isolated host process with no kernel of its own (visible in the host's ps, same uname -r).
- „Kontejneri izoliraju jednako kao VM-ovi” — they share the host kernel; a kernel exploit crosses containers, a VM stops at the hypervisor.
- „Kontejneri su zamijenili VM-ove” — cloud nodes are usually VMs running containers.
- „Docker na Macu radi nativno” — Docker Desktop runs Linux containers in a hidden Linux VM.
- „Svaka slika radi svugdje” — CPU architecture and kernel matter (amd64 vs arm64, emulation).

**Kod:** docker run --memory 256m --cpus 0.5 i ps na domaćinu (bash), uname -r unutra i vani (bash), unshare --pid --fork --mount-proc bash (bash)

**Prijelaz dalje:** Sad znamo da je kontejner proces s naočalama i pojasom. Ali kako Klopu – kod, Python, Node za izgradnju weba i sistemske biblioteke – zapakirati tako da se na Ivinom laptopu i na poslužitelju pokrene potpuno isto?

### 08. Docker: od Dockerfilea do kontejnera

_Kontejnerizacija, slike kontejnera, slojevi i predmemorija izgradnje, registar te tagovi koji se pomiču._ · ~40 min · nadovezuje se na 07, 01

**Hook:** Iva je napisala prvi Dockerfile za Klopu, u korijenu repozitorija. Svaka promjena jednog retka koda znači 40-ak sekundi izgradnje, slika ima 1,1 GB, a Davor je u njoj pronašao datoteku `.env` s ključem za SMS-gateway. Uz to, `latest` na poslužitelju nije isti `latest` kao na Ivinom laptopu. Kako se slika zapravo gradi?

**Ciljevi učenja:**
- objasniti što znači kontejnerizirati (dockerizirati) aplikaciju i koji problem „kod mene radi” time rješavamo
- razlikovati sliku kontejnera i kontejner kao klasu i objekt
- objasniti kako naredbe u Dockerfileu stvaraju slojeve i kako predmemorija izgradnje odlučuje što se ponovno gradi
- napisati višefazni Dockerfile s dobrim redoslijedom naredbi i bez tajni u slojevima
- objasniti razliku između taga i digesta te zašto latest nije verzija
- pokrenuti kontejner s preslikanim portom, objasniti zašto zapisi u njemu nestaju i znati da Kubernetes pokreće iste OCI slike bez Dockera

**Scene:**
1. **Slika i kontejner** (animation): Dockerizacija = Dockerfile → izgradnja slike → pokretanje; isti artefakt na laptopu i poslužitelju. One image, many containers, each with a thin writable layer; layers stacked like transparent sheets (copy-up, whiteout).
2. **Laboratorij predmemorije izgradnje** (simulation): Flagship: cache check from the base upwards; the first changed layer and everything after it rebuild; order = speed decision.
3. **Tajna u sloju** (interactive): COPY .env then RUN rm .env leaves it in the lower layer; never ENV/ARG for secrets; .dockerignore keeps it out of the context. Correct mechanism for build-time secrets: BuildKit secret mounts (RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci) – never written to a layer; runtime secrets arrive as env or files when the container starts (L16). Multi-stage leaves build tools behind.
4. **Registar, tag i digest** (animation): Push uploads only missing layers; a tag is a movable sticky note, a digest is immutable; with tag@digest the digest wins.
5. **Vrata u zidu** (interactive): docker run -p 8080:8000 klopa-api; the app must listen on 0.0.0.0 inside – gunicorn's default 127.0.0.1 makes the published port answer with a reset (callback L01); EXPOSE doesn't publish; docker rm loses the writable layer.
6. **Ispod haube** (text): Closed DeepDive (L11 repeats the Kubernetes side): CLI → REST → dockerd → containerd → runc; OCI image/runtime/distribution specs; Kubernetes talks to containerd/CRI-O directly and runs Docker-built OCI images.

**Glavna simulacija: Laboratorij predmemorije izgradnje.** E4 on klopa-web (TypeScript, npm, Vite): Dockerfile as draggable cards; the build animates a layer stack with CACHED/REBUILT, size, short digest and a stopwatch; then push and tag panels. A second tab shows the klopa-api Dockerfile (pip). Zadaci: „Ponovna izgradnja nakon promjene koda < 5 s”, „Slika < 200 MB”, „Pronađite ključ u slici”, „Slika radi kao korisnik koji nije root”.

- _Pokvari:_ COPY . . before RUN npm ci re-runs the 40 s install on every code edit; „Kopiraj .env pa ga obriši” leaves the key findable; moving latest leaves two servers running different code under one name.
- _Uvid:_ Order instructions from least to most frequently changing; layers are immutable, so a deleted file is only hidden; a tag is a label, a digest is the identity.

**Zablude koje razbijamo:**
- „Slika i kontejner su isto” — immutable template (class) vs running instance with its own writable layer (object).
- „Promjene u pokrenutom kontejneru se spremaju” — the writable layer is deleted with the container; data needs a volume, code needs a rebuild.
- „RUN rm briše tajnu iz slike” — the file stays in the lower layer; the new layer only hides it.
- „latest je fiksna, najnovija verzija” — a movable tag that can point to different digests on different machines.
- „EXPOSE objavljuje port” — documentation only; publishing needs -p / ports.
- „Kubernetes pokreće Docker” — dockershim removed in 1.24; containerd/CRI-O run the same OCI images.
- „Za BuildKit treba DOCKER_BUILDKIT=1” — default since Engine 23.0.

**Kod:** Dockerfile za klopa-web: loš redoslijed i dobar višefazni (dockerfile), Dockerfile za klopa-api (dockerfile), BuildKit secret mount (dockerfile), .dockerignore (text), docker build, run -p, image history, push, inspect (bash), docker buildx --platform linux/amd64,linux/arm64 (bash)

**Prijelaz dalje:** Slike su gotove. Ali u README-u sada stoji šest naredbi `docker run` s po tri retka zastavica. Iva ih pokrene krivim redoslijedom, a API traži bazu na `localhost:5432` i ne nalazi je.

### 09. Docker Compose: cijela Klopa na jednom računalu

_Mreže, imena servisa, volumeni i provjere ispravnosti – i zašto jedno računalo i dalje nije dovoljno._ · ~35 min · nadovezuje se na 08, 06

**Hook:** Iva je pokrenula Postgres i API u dva kontejnera, ali API javlja da baze na `localhost:5432` nema. Kad ih napokon spoji, nakon `docker rm` baze narudžbe nestanu. Šest naredbi koje nitko ne pamti nije način rada. Kako cijelu Klopu opisati jednom datotekom?

**Ciljevi učenja:**
- opisati višekontejnersku aplikaciju jednom datotekom compose.yaml
- objasniti zašto se servisi na korisnički definiranoj mreži nalaze po imenu i zašto localhost u kontejneru nije vaše računalo
- predvidjeti što preživljava docker compose down i down -v uz imenovane i anonimne volumene te bind mountove
- razlikovati pokretanje i spremnost servisa (depends_on s provjerom ispravnosti)
- objasniti zašto pravila ponovnog pokretanja ne štite od pada cijelog računala

**Scene:**
1. **Šest naredbi ili jedna datoteka** (animation): docker run lines collapse into compose.yaml – the first taste of describing what you want.
2. **Tko je localhost?** (animation): Inside the api container localhost is the api itself (own network namespace).
3. **Imena servisa kao DNS** (interactive): User-defined network with embedded DNS resolves db:5432; the default bridge network has no name DNS.
4. **Vrata i podatci** (interactive): ports: web '8080:8080' (unprivileged nginx, proxies /api to api:8000 by name); api needs no published port ('8000:8000' only for debugging); two containers may both use the same port inside, not the same host port. Named volume vs anonymous volume vs bind mount vs tmpfs: the postgres image declares VOLUME, so without a named volume Docker creates an anonymous one – rows survive a restart, but docker rm db or down + up attaches a fresh anonymous volume, so orders appear lost (old volume left dangling until docker volume prune). postgres:18+ keeps data under /var/lib/postgresql (PGDATA /var/lib/postgresql/18/docker); mounting at the old …/data path from older tutorials does not hold the data. down keeps named volumes, down -v deletes them.
5. **Pokrenut nije isto što i spreman** (animation): depends_on orders start only; condition: service_healthy with a pg_isready healthcheck (provjera ispravnosti) waits for readiness; restart: unless-stopped heals crashes on this host only.
6. **12:05: računalo je palo** (animation): Host dies → all of Klopa down; Davor's list: more machines, automatic placement, replacement elsewhere, gradual updates, stable addresses.

**Glavna simulacija: Compose slagalica.** A canvas of one host with web, api, worker, postgres, redis and rabbitmq; networks as regions, volumes as cylinders, published ports as doors; live compose.yaml with two-way highlight; a test browser on localhost:8080. Zadaci: „Klopa se otvara u pregledniku”, „API pronalazi bazu po imenu”, „Narudžbe preživljavaju down i docker rm db”, „Pokušajte preživjeti pad računala” (marked solved once the student presses „Ugasi računalo” and opens the explanation – no task ever stays unsolvable).

- _Pokvari:_ Moving db to another network breaks name resolution; two services on host 8080 fail; docker rm db without a named volume loses all orders (they sit in a dangling anonymous volume); „Ugasi računalo” takes all of Klopa down and no restart policy helps.
- _Uvid:_ Compose already teaches declarative YAML and DNS by service name – what's missing is more than one machine and someone who keeps watch.

**Zablude koje razbijamo:**
- „Kontejneri razgovaraju preko IP adresa koje moram potražiti” — on a user-defined network services resolve each other by name.
- „localhost u kontejneru je moje računalo” — each container has its own network namespace; localhost is the container itself.
- „depends_on čeka da baza bude spremna” — only with condition: service_healthy and a healthcheck.
- „Bez volumena podatci baze žive u kontejneru” — the postgres image's VOLUME creates an anonymous volume, which a recreated container doesn't reuse.
- „Treba docker-compose i version: '3.8'” — v1 has been dead since July 2023; use docker compose; the version key is ignored.
- „restart: always znači visoku dostupnost” — it restarts containers on the same host only; a dead host moves nothing.

**Kod:** compose.yaml za cijelu Klopu (yaml), docker compose up -d, ps, logs -f api, docker volume ls (bash)

**Prijelaz dalje:** Klopa sada radi na tri računala, a Davor ručno odlučuje koji kontejner ide kamo. U 03:00 poslužitelj-2 umre s devet kontejnera na sebi, a Davorov mobitel zvoni.

## Modul 3: Kubernetes: temelji

Od željenog stanja do prometa izvana: petlja usklađivanja, arhitektura klastera, Pod, Deployment, Service i Gateway API.

### 10. Zašto Kubernetes: željeno stanje i petlja usklađivanja

_Kubernetesu ne opisujete korake, nego ono što želite – a on to nikad ne prestaje provjeravati._ · ~35 min · nadovezuje se na 04, 09

**Hook:** 03:00. Poslužitelj-2 je umro, a s njim devet kontejnera. Davor u pidžami mora zapamtiti što je gdje radilo, pronaći slobodno mjesto i sve pokrenuti ručno, a u 11:45 opet ručno dodaje kopije API-ja za ručak. Što ako bismo samo zapisali što želimo – „devet kopija API-ja, uvijek” – a netko drugi neprestano pazio da tako i bude?

**Ciljevi učenja:**
- objasniti razliku između imperativnog i deklarativnog pristupa
- opisati petlju usklađivanja (promotri, usporedi, ispravi) i zašto reagira na razliku, a ne na događaj
- objasniti zašto je Kubernetes skup neovisnih petlji, a ne dirigent koji izvodi plan
- nabrojati što Kubernetes radi i što ne radi (gradnja koda, CI/CD, baze)
- procijeniti kada se Kubernetes isplati

**Scene:**
1. **Vi ste orkestrator** (simulation): Flagship phase 1: manual placement and repair under events.
2. **Skripta ili izjava** (animation): Imperative 'pokreni 3' vs declarative 'želim 3'; after a crash the script is blind, the loop repairs.
3. **Termostat** (animation): Desired 22 °C (dashed) vs actual 18 °C (solid); observe → compare → act; level-triggered: a lost 'Pod umro' event doesn't matter, the next pass sees the difference. Dashed ghost = desired, solid = actual – the course-wide grammar.
4. **Lanac termostata** (animation): Many controllers, each owning a slice; a cluster may never be 'done'. Pods are replaced, not repaired (new name, new IP); only the kubelet restarts a crashed container in place, inside the same Pod (L12). Kubernetes does not move running workloads back when a server returns.
5. **Mit o dirigentu** (text): Not a workflow engine running a script; if the control plane stops, running apps continue (L11).
6. **Što Kubernetes nije i isplati li se** (diagram): Capabilities (discovery, LB, rollouts, bin packing, self-healing, config/secrets, scaling) vs not: doesn't build code, no CI/CD, no middleware/DB, not a PaaS, not a container runtime; complexity price; managed options.

**Glavna simulacija: Vi ste orkestrator → termostat za aplikacije.** E3: the same seeded day twice – first manually, then with „Predaj Kubernetesu”, where a generic loop fills dashed ghosts with solid instances. Scores: minutes of missing capacity, wrong placements, „Davorovi sati sna”. Zadaci: „Preživite 03:00 i 12:00 ručno”, „Isto s petljom – usporedite”, „Promijenite želju usred popravka”.

- _Pokvari:_ Server dies at 03:00: manual capacity is missing until a human notices, the loop restores it within a few ticks; a lost event changes nothing; asking for more than fits leaves ghosts waiting; a repaired server stays nearly empty until new work arrives.
- _Uvid:_ You declare what, not how; independent loops compare desired with actual forever, so failures and changes are handled the same way.

**Zablude koje razbijamo:**
- „Kubernetes je container runtime / zamjena za Docker” — it orchestrates; containerd/CRI-O run containers, and Docker-built images still run.
- „Kubernetes automatski čini aplikaciju skalabilnom” — only if it is stateless (L05) and configured.
- „kubectl apply odmah sve napravi” — apply records desired state; controllers act asynchronously.
- „Kubernetes izvršava plan korak po korak” — independent level-triggered loops converge on desired state.
- „Kubernetes mi daje CI/CD, logove i bazu” — it builds no code and provides no CI/CD, middleware or databases (not a PaaS).

**Kod:** for petlja docker run vs petlja usklađivanja (typescript), Željeno i stvarno stanje: kubectl get -w (bash)

**Prijelaz dalje:** Lana napiše prva dva manifesta, za API i za workera, i pokrene `kubectl apply`. Terminal odgovori „pod/klopa-api created” i „pod/klopa-worker created” – ali aplikacija ne odgovara. Tko zapravo radi posao i gdje je zapelo?

### 11. Klaster iznutra: što se dogodi nakon kubectl apply

_Ploča na zidu, oni koji je čitaju i oni koji pokreću kontejnere._ · ~35 min · nadovezuje se na 10, 08

**Hook:** Terminal kaže „created”, ali klopa-api stoji u stanju ImagePullBackOff, a klopa-worker u Pendingu. „Created” očito ne znači „radi”. Tko je primio Lanin zahtjev, tko bira čvor, tko povlači sliku – i tko je tu zapeo?

**Ciljevi učenja:**
- nabrojati komponente upravljačke ravnine i čvora te ulogu svake
- pratiti put manifesta od kubectl apply do pokrenutog kontejnera
- objasniti zašto sve komponente razgovaraju samo s API poslužiteljem i zašto je etcd izvor istine
- predvidjeti što se događa s aplikacijama kad stane upravljačka ravnina ili čvor
- čitati stanje klastera naredbama `kubectl get` i `kubectl describe` i iz događaja te odvojiti okruženja Namespaceom

**Scene:**
1. **Ploča na zidu** (animation): API server + etcd = shared whiteboard; components watch it and never call each other; only the API server talks to etcd.
2. **Put jedne izjave** (animation): 1 kubectl → API server (authn/authz/admission strip) 2 → etcd (kubectl returns here) 3 a controller creates Pod objects – only when a controller owns the object (a Deployment creates a ReplicaSet, which creates Pods, L13); a bare Pod skips this step 4 scheduler binds a node 5 kubelet → CRI → containerd pulls and starts 6 status back.
3. **Anatomija objekta** (diagram): apiVersion/kind/metadata/spec/status; spec dashed (desired), status solid (actual).
4. **Tko pokreće kontejnere** (animation): kubelet → CRI → containerd/CRI-O → runc; no Docker daemon; Kubernetes ≥1.36 needs containerd 2.x.
5. **Namespace** (interactive): Same names in klopa and klopa-staging; kube-system; names scoped, not a security boundary by itself.
6. **Gdje živi klaster** (text): Managed (EKS/GKE/AKS) vs self-hosted; nodes are usually VMs; learning: kind, minikube, Killercoda; Headlamp replaces the archived Dashboard.

**Glavna simulacija: Klaster pod mikroskopom.** E3: control-plane hexagons and 3 worker nodes with watch lines; scrub replicas, apply manifests, switch components off; numbered messages and an event log like kubectl get events. Zadaci: „Povežite pet simptoma s komponentom”, „Dovedite Pod iz ImagePullBackOff do Running”.

- _Pokvari:_ Scheduler off → Pending forever; controller-manager off → a deleted Pod is not replaced; whole control plane off → Pods keep serving but nothing heals; wrong tag → ImagePullBackOff; kubelet off → NotReady, and only after ~5 min are ReplicaSet Pods recreated elsewhere while the old ones hang in Terminating.
- _Uvid:_ kubectl apply only writes onto the whiteboard; independent components watch it and work asynchronously; the data plane survives a control-plane outage.

**Zablude koje razbijamo:**
- „Upravljačka ravnina pokreće moje kontejnere” — it decides and records; the kubelet starts containers through the runtime.
- „Ako padne upravljačka ravnina, padaju sve aplikacije” — running Pods keep serving; only healing, scheduling and changes stop.
- „Raspoređivač pokreće kontejnere” — it only binds a Pod to a node.
- „Komponente se pozivaju izravno” — everything watches the API server; only the API server talks to etcd.
- „Kubernetes koristi Docker” — dockershim was removed in 1.24; runtimes are reached through CRI.
- „master čvor” — say upravljačka ravnina; since 1.24 kubeadm uses only the control-plane label and taint.
- „Instalirajte Kubernetes Dashboard” — archived; use Headlamp.

**Kod:** namespace.yaml (yaml), kind create cluster, kubectl get nodes -o wide, get pods -n kube-system (bash), kubectl describe pod: Events (log)

**Prijelaz dalje:** Lana je ispravila tag i klopa-api nakratko piše Running – a onda se ruši, kubelet ga podiže sve sporije, a kad napokon radi, prvih 40 sekundi vraća greške jer puni predmemoriju. Što je točno Pod i kako Kubernetes zna je li aplikacija zdrava?

### 12. Pod: najmanja jedinica i njezino zdravlje

_Životni ciklus Poda, ponovna pokretanja i tri pitanja koja Kubernetes postavlja aplikaciji._ · ~40 min · nadovezuje se na 11, 05

**Hook:** klopa-api se ruši čim se pokrene, a kubelet ga diže nakon 10, 20, 40 sekundi… Kad se napokon pokrene, prvih 40 sekundi vraća greške iako piše Running. A Pod klopa-worker koji je Lana obrisala da ga ponovno pokrene nikad se nije vratio. Što je Pod i kako Kubernetes razlikuje „radi” od „spreman je”?

**Ciljevi učenja:**
- objasniti što je Pod: jedan ili više kontejnera koji dijele IP adresu i volumene
- prepoznati vrijednosti u stupcu STATUS naredbe `kubectl get pods` (Pending, ContainerCreating, ImagePullBackOff, Running, CrashLoopBackOff) i razlikovati ih od faze Poda i uvjeta Ready
- razlikovati provjere pokretanja, živosti i spremnosti te predvidjeti što se događa kad koja ne prođe
- objasniti zašto provjera živosti ne smije provjeravati bazu i zašto ni provjera spremnosti ne smije pasti zbog zajedničke ovisnosti
- objasniti zašto se goli Pod ne vraća i zašto novi Pod ima novo ime i adresu
- pročitati osnovni manifest Poda s oznakama

**Scene:**
1. **Stan s cimerima** (animation): Containers in a Pod share IP/localhost and volumes; one main concern per Pod (web + DB would scale together); first manifest with labels; note on `requests`: „objašnjavamo u 17. predavanju; zasad: koliko Pod rezervira na čvoru”.
2. **Životni ciklus i pad** (animation): Phase: Pending → Running → Succeeded/Failed. kubectl's STATUS column shows a reason instead: Pending (not scheduled); ContainerCreating or ImagePullBackOff (scheduled, phase still Pending); Running; CrashLoopBackOff (phase usually Running, container waiting to restart). Ready is a separate condition (READY 0/1 → 1/1). restartPolicy Always; CrashLoopBackOff 10 s → 20 s → 40 s … max 300 s, reset after 10 min; restart count +1, same Pod.
3. **Tri pitanja zdravlja** (animation): Startup (others wait until it succeeds), liveness „jesi li zaglavio?” (fail → restart), readiness „možeš li sada služiti?” – warm-up, own state, load shedding (fail → removed from traffic, no restart); httpGet 200–399, tcpSocket, exec exit 0, grpc SERVING; defaults period 10 s, timeout 1 s, failureThreshold 3.
4. **Kaskada** (interactive): Liveness that checks the DB + DB outage → every Pod restarts → outage worse; readiness that checks the DB → every Pod NotReady at once → 0 endpoints, clients get connection errors instead of a clear 503. Correct: liveness asks only about the process; readiness about this Pod; on a shared DB outage stay Ready and answer 503/degraded quickly.
5. **Pomoćnici: init i sidecar** (text): Closed DeepDive: init containers run to completion first; native sidecar = initContainer with restartPolicy: Always (GA 1.33): starts before, stops after, may have probes.
6. **Goli Pod** (interactive): Delete it or lose its node for longer than the eviction timeout → gone; a new Pod has a new name and IP; replace, don't repair.

**Glavna simulacija: Laboratorij zdravlja Poda.** E3: three bare klopa-api Pods and a traffic source that sends only to Ready Pods (like the L05 load balancer); choose app behaviour, configure probes, watch probe lanes, restart counter, phase/STATUS/Ready and back-off ring. Zadaci: „Spori start (40 s) do Ready bez ubijanja”, „Zaglavljeni proces neka se sam oporavi”, „Ispad baze od 60 s bez ijednog restarta i bez 0 endpointa”, „Dijagnosticirajte tri Poda iz stupca STATUS”.

- _Pokvari:_ Liveness on /ready-db + „Baza pala 60 s” restarts all Pods at once; readiness on /ready-db empties the traffic target list; slow start with aggressive liveness and no startup probe → CrashLoopBackOff; no readiness probe sends traffic to warming Pods; a deleted bare Pod is gone forever.
- _Uvid:_ A dead process restarts itself; a stuck one needs a question – and the wrong question turns a blip into an outage; Pods are replaced, never repaired, so something must recreate them.

**Zablude koje razbijamo:**
- „Pod je kontejner” — one or more containers sharing an IP and volumes.
- „Pod se popravi na mjestu i zadrži IP” — containers restart in place, but a replacement Pod has a new name and IP.
- „Web i bazu stavimo u isti Pod” — they would scale and be replaced together.
- „Provjera živosti treba provjeravati bazu” — a DB blip then restarts every Pod at once.
- „Provjera spremnosti neka provjerava bazu” — a shared outage makes every Pod NotReady at once and leaves 0 endpoints; answer 503 instead.
- „Neuspjela provjera spremnosti restarta Pod” — it only removes the Pod from traffic.
- „Bez provjera Kubernetes zna kad je aplikacija spremna” — without a readiness probe a Pod is Ready as soon as its container starts.
- „STATUS je faza Poda” — STATUS shows a reason (ImagePullBackOff, CrashLoopBackOff) while the phase may be Pending or Running.
- „Sidecar je samo još jedan kontejner u containers” — native sidecars are initContainers with restartPolicy: Always (GA 1.33; DeepDive).

**Kod:** pod.yaml s oznakama, provjerama i requests (yaml), /healthz i /ready (python), kubectl get pods -w, logs --previous, describe (bash), Pod s nativnim sidecarom (yaml)

**Prijelaz dalje:** Noćas je čvor-2 bio nedostupan dulje od pet minuta. Kubernetes je Podove s njega izbacio, a goli Pod s API-jem nitko nije ponovno stvorio. A Petra javlja: „Vegetarijanski meni mora biti vani danas u 11:00 – bez gašenja stranice.”

### 13. Deployment: replike, nove verzije i povratak

_Kako Kubernetes drži N replika živima i uvodi novu verziju bez gašenja – i zašto se sam ne vraća._ · ~40 min · nadovezuje se na 12

**Hook:** Goli Pod je nestao i nitko ga nije vratio. Klopi trebaju četiri replike API-ja koje se same obnavljaju, a u 11:00 mora izaći verzija 1.4.0 s vegetarijanskim menijem – dok studenti naručuju. Kako zamijeniti sve Podove novom verzijom, a da nijedna narudžba ne propadne?

**Ciljevi učenja:**
- objasniti lanac Deployment → ReplicaSet → Podovi i kako omogućuje samooporavak i skaliranje
- predvidjeti koja promjena stvara novi ReplicaSet
- izračunati granice postupnog ažuriranja iz `maxSurge` (zaokružuje se naviše) i `maxUnavailable` (zaokružuje se naniže)
- objasniti zašto pokvarena verzija zastaje umjesto da se vrati i kako napraviti rollback
- razlikovati objekt Deployment, postavljanje (deploy) i izdanje

**Scene:**
1. **Lanac vlasništva** (animation): Opening Callout „Tri riječi”: Deployment (object) vs postavljanje (act) vs izdanje (release, L20). Deployment → ReplicaSet → Pods via ownerReferences; selector = template labels; kill Pods → ghosts filled; relabel a Pod → it escapes and a new one appears; replicas ≠ machines (full nodes → Pending).
2. **Što stvara novi ReplicaSet?** (interactive): Changing replicas scales the existing RS; changing image/env creates a new pod-template-hash and RS. Predict, then run.
3. **Dva ReplicaSeta u suprotnim smjerovima** (animation): Rolling update N=4 (surge 1, unavailable 1); gauges available ≥ N − unavailable, total ≤ N + surge; gated by Ready; both versions serve at once (compatibility!).
4. **Ograde** (interactive): Rounding N 1→1/0, 2→1/0, 3→1/0, 4→1/1, 5→2/1, 10→3/2; both 0 invalid; 25/25 = 28 s, 1/0 = 51 s, 0/1 = 46 s, 100 %/0 = 17 s.
5. **Pokvarena verzija** (interactive): Crashing image stalls at 3 old Ready + 2 new unready; ProgressDeadlineExceeded after progressDeadlineSeconds (600 default); no auto rollback; rollout undo scales the old RS back (revisionHistoryLimit 10); Recreate = downtime.
6. **Galerija kontrolera** (text): Closed DeepDive gallery: DaemonSet, Job, CronJob (StatefulSet in L19).

**Glavna simulacija: Kontrolna ploča uvođenja.** E3: Deployment klopa-api with ReplicaSet tree, revision history, invariant gauges and 20 rps of traffic coloured by version (1.3.2 blue, 1.4.0 violet, 1.5.0 rose). Zadaci: „Uvedite 1.4.0 bez ijednog neuspjelog zahtjeva”, „Nikad ispod 4 dostupna Poda”, „Oporavite se od 1.5.0 u < 30 s sim vremena”.

- _Pokvari:_ Pushing the crashing 1.5.0 stalls at 3 old + 2 new (75 % capacity) and shows ProgressDeadlineExceeded – nothing rolls back by itself; Recreate empties the app during lunch; readiness off shows errors from warming Pods.
- _Uvid:_ A rollout is two ReplicaSets scaled in opposite directions under two limits; readiness is the gatekeeper; rollback is scaling the old ReplicaSet up – and someone must ask for it.

**Zablude koje razbijamo:**
- „Deployment i postavljanje su isto” — object vs act.
- „Više replika znači više računala” — replicas are Pods; many can share a node, and full nodes leave them Pending.
- „Postupno ažuriranje je uvijek bez prekida” — needs readiness and compatible versions.
- „Deployment se sam vraća na staru verziju” — the rollout stalls with ProgressDeadlineExceeded; rollback is rollout undo or tooling.
- „Deployment izravno upravlja Podovima” — through ReplicaSets, which hold the revision history.
- „minReadySeconds odgađa promet” — traffic follows Ready; it only delays 'Available'.
- „Blue-green i canary ugrađeni su u Deployment” — only RollingUpdate and Recreate.

**Kod:** deployment.yaml (yaml), kubectl rollout status / history / undo, get rs (bash), kubectl scale i set image (bash), job.yaml i cronjob.yaml (yaml)

**Prijelaz dalje:** Vegetarijanski meni je vani. Ali novi Podovi imaju nove IP adrese, a klopa-web je imao upisanu adresu jednog API Poda – i sada vraća greške. Kako drugi pronalaze Podove koji stalno mijenjaju adresu?

### 14. Service: stalna adresa za prolazne Podove

_Oznake, EndpointSlice, DNS i pravila na svakom čvoru – i zašto Service ne raspoređuje kružno._ · ~40 min · nadovezuje se na 13, 04

**Hook:** klopa-web je imao upisanu IP adresu jednog API Poda. Nakon uvođenja verzije 1.4.0 taj Pod više ne postoji i web vraća greške. Treba nam jedno stalno ime – ali što se krije iza njega i dijeli li promet kao load balancer iz četvrtog predavanja?

**Ciljevi učenja:**
- objasniti kako Service daje stalno ime i virtualnu IP adresu Podovima odabranima po oznakama
- objasniti zašto Service šalje promet samo Podovima koji su u EndpointSliceu označeni kao spremni (ready) i kako to omogućuje uvođenje bez grešaka
- pratiti paket od DNS upita do Poda i objasniti zašto ClusterIP ne pripada nijednom računalu
- objasniti zašto Service bira Pod nasumično po vezi, a ne po zahtjevu
- razlikovati vrste ClusterIP, NodePort i LoadBalancer (headless u 19. predavanju)

**Scene:**
1. **Oznake i selektor** (interactive): Pod IPs are temporary; Service selects Pods (not Deployments) by labels in its own Namespace; typo app: klopa-apii → 0 endpoints.
2. **Samo spremni** (interactive): EndpointSlices list every matching Pod with conditions ready, serving and terminating; kube-proxy sends traffic only to ready ones. A readiness failure flips ready: false without restart; replay the L13 rollout with readiness → 0 errors; EndpointSlices replace the deprecated Endpoints API.
3. **Ime i Namespace** (interactive): CoreDNS: klopa-api → klopa-api.klopa → klopa-api.klopa.svc.cluster.local; short names work only inside the same Namespace.
4. **Put paketa** (animation): ClusterIP is virtual; kube-proxy rules on the client's own node DNAT to a random ready Pod; conntrack rewrites the reply; iptables default in 1.37, nftables successor, ipvs deprecated; eBPF dataplanes one line.
5. **Service nije klasični load balancer** (interactive): L04 rack in Service mode: random per connection, no weights, ignores node size (uneven capacity is handled by requests/scheduler L17 and HPA L18); long-lived keep-alive/HTTP/2/gRPC connections pin to one Pod; fixes: new connections, an L7 proxy (the Gateway balances per request, L15), client-side balancing over a headless Service (L19). sessionAffinity: ClientIP (10800 s) is IP-based, not cookie-based: everyone behind campus NAT or eduroam shares one public IP and lands on the same Pod, and behind a cloud LB the Pod may see only the LB's or node's address unless externalTrafficPolicy: Local is set; cookie affinity lives at L7.
6. **Vrste i tiho gašenje** (animation): ClusterIP (default) → LoadBalancer (cloud or add-on; stays pending on kind unless cloud-provider-kind runs); NodePort 30000–32767 in one line; endpoint removal is async with SIGTERM → preStop sleep, grace 30 s.

**Glavna simulacija: Laboratorij selektora i put paketa.** E3 + E1 Service mode: Pods with draggable labels, selector chips and live EndpointSlice lines; per-Pod readiness; a client Pod with a hit histogram; rollout replay; the L04 rack reopened in Service mode. Zadaci: „Popravite Service bez endpointa”, „Uvođenje 1.4.0 → 1.4.1 s 0 grešaka”, „Rasporedite keep-alive klijenta na sva 4 Poda”, „Objasnite zašto svaki Pod dobiva jednako prometa bez obzira na veličinu čvora – i kako veći čvor ipak dobije više prometa (na njega stane više Podova, L17)”.

- _Pokvari:_ A selector typo leaves 0 endpoints while all Pods are healthy; one keep-alive connection sends 100 % to one Pod; ClientIP affinity behind NAT sends a whole campus to one Pod; a hardcoded IP breaks on the next rollout; without preStop a few requests fail during a rollout.
- _Uvid:_ A Service is a stable name and virtual IP implemented as rules on every node; it selects by labels, sends only to ready endpoints and balances connections at random, not requests in turn.

**Zablude koje razbijamo:**
- „Service je proces ili kutija kroz koju prolazi promet” — a virtual IP implemented as rules on every node.
- „Service raspoređuje round robin po zahtjevu” — a random backend per new connection.
- „Service pokazuje na Deployment” — it selects Pods by labels; a typo gives 0 endpoints.
- „EndpointSlice sadrži samo spremne Podove” — it lists not-ready ones too, with ready: false; kube-proxy skips them.
- „type: LoadBalancer radi svugdje” — needs a cloud controller or add-on; stays pending on kind.
- „Kratko ime radi iz svakog Namespacea” — only within the same Namespace.
- „Kubernetes prati Podove iza Servicea preko objekta Endpoints” — EndpointSlices; the Endpoints API is deprecated since 1.33.
- „Za performanse koristite ipvs” — deprecated since 1.35; nftables is the successor.
- „gRPC se balansira po zahtjevu” — HTTP/2 keeps one long-lived connection pinned to one Pod.

**Kod:** service.yaml (yaml), readinessProbe i preStop (diff), kubectl get endpointslices -l kubernetes.io/service-name=klopa-api -o yaml (bash), kubectl run dnsutils --rm -it --image=registry.k8s.io/e2e-test-images/jessie-dnsutils:<tag> -- nslookup klopa-api (bash), iptables-save | grep KUBE-SVC, nft list ruleset (bash)

**Prijelaz dalje:** Unutar klastera sve se nalazi po imenu. Ali kako studenti s interneta dolaze do Klope? LoadBalancer Service za web, API i administraciju znači tri javne adrese i tri računa, a trebaju nam i HTTPS te usmjeravanje /api na drugi Service nego /.

### 15. Ulaz u klaster: Gateway API

_Jedna ulazna vrata za mnogo objekata Service – usmjeravanje po domeni i putanji, TLS i težine._ · ~35 min · nadovezuje se na 14

**Hook:** Za web, API i administraciju Davor bi trebao tri LoadBalancer Servicea: tri javne adrese, tri računa i tri certifikata. A tutorial koji je pronašao koristi ingress-nginx – kontroler koji je u ožujku 2026. umirovljen. Kako sav promet izvana pustiti kroz jedna vrata i pametno ga rasporediti?

**Ciljevi učenja:**
- objasniti zašto jedan L7 ulaz zamjenjuje LoadBalancer za svaki Service
- opisati lanac GatewayClass → Gateway → HTTPRoute → Service → Podovi i tko je vlasnik kojeg dijela
- napisati pravila po domeni, putanji i zaglavlju te predvidjeti koje pravilo vrijedi
- objasniti terminaciju TLS-a na ulazu, raspodjelu po zahtjevu i podjelu prometa težinama
- objasniti današnji status Ingressa i kontrolera ingress-nginx

**Scene:**
1. **Zašto ne LoadBalancer za svaki Service** (interactive): Cost and certificate sprawl; cloud L4 LB → L7 Gateway → Pods. The HTTPRoute names a Service, but most implementations (Envoy Gateway, Istio, NGINX Gateway Fabric, Cilium, Traefik) use it only to look up ready endpoints from its EndpointSlices and send each request straight to a Pod IP with their own L7 algorithm (round robin or least request, implementation-specific) – the L04 algorithms come back here. kube-proxy's random per-connection choice applies to in-cluster ClusterIP traffic.
2. **Dodatak, a ne ugrađeni dio** (animation): Gateway API = CRDs installed separately + a controller (Envoy Gateway, NGINX Gateway Fabric, Traefik, Cilium, Istio…); a CRD extends the API, a controller adds the loop.
3. **Uloge** (interactive): GatewayClass = infrastructure provider, Gateway = cluster operator, HTTPRoute = app team.
4. **Pravila usmjeravanja** (interactive): hostnames, PathPrefix/Exact, headers; more specific wins (/api beats /); no match → 404.
5. **TLS i težine** (animation): HTTPS listener terminates TLS with a certificate from a kubernetes.io/tls Secret (teaser L16; cert-manager one line); backendRefs weights 90/10 chosen per request (teaser canary L20).
6. **Ingress koji ćete sresti** (diagram): Same intent as Ingress + annotations; Ingress GA but frozen, not deprecated; community ingress-nginx retired 2026-03-24; F5 NGINX Ingress Controller is a different maintained project; ingress2gateway migrates.

**Glavna simulacija: Gradska vrata.** A mixed request stream (klopa.example/, /api/…, admin.klopa.example, header x-beta: 1) flows through one Gateway straight to Pods; students drag-build HTTPRoute rules; the matching rule lights up in YAML; roles view and „Prikaži kao Ingress”. Zadaci: „/api → klopa-api, ostalo → klopa-web”, „admin.klopa.example samo na klopa-admin”, „10 % /api prometa na verziju 1.4.1”, „HTTPS radi”.

- _Pokvari:_ Deleting the /api rule sends API calls to the web app (prefix / catches them); a wrong certificate Secret breaks HTTPS for everyone; a wrong Service name returns 500 with ResolvedRefs=False.
- _Uvid:_ The same load-balancing idea from L04, split into layers and roles: the platform team owns the gate, each app team owns its routes; L7 routing, per-request balancing and weights live here, not in the Service.

**Zablude koje razbijamo:**
- „Ingress je vrsta Servicea” — a separate API that needs a controller.
- „Ingress je zastario i uklonjen” — GA and frozen; Gateway API is recommended.
- „Koristite ingress-nginx” — retired 2026-03-24: no releases or security fixes.
- „Gateway API je ugrađen u svaki klaster” — CRDs + a controller must be installed.
- „F5-ov NGINX Ingress Controller isto je što i ingress-nginx” — a different, still-maintained project.
- „Promet kroz Gateway prolazi kroz ClusterIP” — most implementations send each request straight to Pod IPs from the EndpointSlices.
- „Gateway zamjenjuje objekte Service” — routes still name Services (for endpoint discovery), and Services still serve in-cluster traffic.

**Kod:** Instalacija CRD-ova Gateway API-ja (bash), gateway.yaml (yaml), httproute.yaml (yaml), ingress.yaml za usporedbu (yaml)

**Prijelaz dalje:** HTTPS radi, a certifikat živi u objektu Secret. Ali lozinka baze i ključ SMS-gatewaya i dalje stoje kao obične varijable okruženja u `deployment.yaml` – u Git repozitoriju koji je jedan dan bio javan.

## Modul 4: Kubernetes u pogonu

Konfiguracija i tajne, resursi i raspoređivanje, automatsko skaliranje i podatci koji preživljavaju.

### 16. ConfigMap i Secret: konfiguracija i tajne u klasteru

_Ista slika u svakom okruženju, tajne izvan koda – i zašto base64 nije brava._ · ~40 min · nadovezuje se na 13, 14, 08

**Hook:** Repozitorij s `deployment.yaml` bio je jedan dan javan i netko je iskoristio ključ za SMS-gateway: stigao je račun za 40 000 poruka. Usto, testno okruženje treba drugu adresu baze nego produkcija, a slika mora biti ista. Gdje u Kubernetesu žive postavke i tajne, tko ih može pročitati i što se dogodi kad ih promijenimo?

**Ciljevi učenja:**
- odvojiti konfiguraciju od slike kontejnera ConfigMapom i Secretom
- objasniti razliku između kodiranja (base64) i šifriranja te gdje se Secret po zadanom čuva
- nabrojati tko može pročitati Secret, uključujući svakoga tko smije stvarati Podove u Namespaceu, i zašto uloga view vidi ConfigMape, ali ne i Secrete
- predvidjeti kada aplikacija vidi novu vrijednost: varijabla okruženja, volumen ili subPath
- primijeniti osnovne zaštite: šifriranje u mirovanju, RBAC s najmanjim ovlastima, bez tajni u Gitu i slici

**Scene:**
1. **Jedna slika, tri okruženja** (animation): Same digest + three ConfigMaps → three behaviours; envFrom vs mounted file.
2. **Dekodirajte** (interactive): Secret data in the API and YAML is base64 (stringData accepts plain text); a Secret is a ConfigMap with a 'pažljivo' sticker; max 1 MiB; types Opaque, kubernetes.io/tls, dockerconfigjson…; immutable.
3. **Gdje tajna živi** (animation): In etcd, unencrypted by default (identity provider; base64 is only the API representation). Providers: identity (no encryption) → secretbox or aesgcm (local key in a file on the control-plane host) → KMS v2 (key in an external KMS, recommended); aescbc exists but is not recommended (CBC padding-oracle). Envelope DEK/KEK in DeepDive; managed clusters differ (EKS encrypts by default).
4. **Tko može pročitati?** (interactive): get; list/watch also return contents; anyone who can create Pods/Deployments in the namespace can mount it; the built-in view ClusterRole reads Pods, Deployments and ConfigMaps but deliberately not Secrets – the real difference between ConfigMap and Secret; compromised Pod; Role/RoleBinding, ServiceAccount, least privilege, RBAC is additive.
5. **Kada aplikacija vidi promjenu** (interactive): Env var: stale until container restart; volume: eventually (kubelet sync + cache), app must re-read; subPath: never; kubectl rollout restart.
6. **Pravila** (text): Never store Secret manifests in Git; never ENV/ARG in Dockerfile (BuildKit secret mounts for build time, L08); prefer mounted files (env vars leak into logs/dumps/child processes); DeepDive: Namespace is not a security boundary alone (NetworkPolicy, Pod Security Admission; PSP removed 1.25); teaser L23.

**Glavna simulacija: Put tajne.** E5 threat model for the DB password: choose where it lives and how the Pod consumes it, toggle protections, see which attackers can read it (red eye = can read), then rotate it. Zadaci: „Zatvorite što više očiju”, „Objasnite zašto oko „smije stvarati Podove” ostaje crveno”, „Rotirajte lozinku bez ponovnog pokretanja Poda”.

- _Pokvari:_ „Ukradi kopiju baze etcd” reads every Secret until encryption at rest is on; „Ukradi disk upravljačke ravnine” still reads them with a local key; „Spremi secret.yaml u Git” exposes the password to every Git reader forever; rotation leaves env Pods stale and subPath mounts never update.
- _Uvid:_ base64 is a costume, not a lock; protection is layered – RBAC, encryption at rest with a key stored elsewhere, plaintext out of Git and images – and whoever can create Pods in a namespace can read its Secrets.

**Zablude koje razbijamo:**
- „Secreti su šifrirani” — base64 in the API and unencrypted in etcd by default.
- „Samo administratori, ili samo get, mogu čitati Secrete” — list/watch reveal contents and Pod creators can mount them.
- „Secret smijem spremiti u Git” — base64 is readable by anyone with the repo, forever.
- „Promjena Secreta odmah mijenja aplikaciju” — env needs a restart, a volume updates eventually, subPath never.
- „ConfigMap ili Secret, svejedno je” — separate RBAC (view reads ConfigMaps, not Secrets), handling and encryption scope.
- „Varijable okruženja najsigurniji su način” — env values leak into logs, dumps and child processes.
- „Šifriranje u mirovanju s ključem u datoteci rješava sve” — the key sits on the control-plane host; KMS v2 keeps it elsewhere.
- „Namespace je sigurnosna granica” — only together with RBAC, NetworkPolicy and Pod Security.

**Kod:** configmap.yaml (yaml), secret.yaml sa stringData (yaml), secretKeyRef ili volumen (yaml), kubectl get secret -o jsonpath | base64 -d (bash), Role, RoleBinding i kubectl auth can-i (yaml), EncryptionConfiguration (yaml)

**Prijelaz dalje:** Testno okruženje sada živi u istom klasteru, u Namespaceu klopa-staging. Ivini Podovi za test opterećenja rezerviraju po dvije procesorske jezgre, a novi worker za fotografije jela nema ograničenje memorije i pojede memoriju čvora-2. Produkcijski API Podovi umiru, a novi stoje u Pendingu, iako nadzor pokazuje da je procesor zauzet tek 30 %.

### 17. Resursi i raspoređivanje: koliko mjesta treba Podu

_Raspoređivač gleda `requests`, jezgra provodi `limits` – i zašto čvor na 30 % CPU-a može biti pun._ · ~40 min · nadovezuje se na 11, 12, 13, 07

**Hook:** Worker za fotografije pojeo je memoriju čvora-2, pa produkcijski API Podovi umiru s OOMKilled ili ih kubelet izbacuje. Novi Podovi stoje u Pendingu s porukom „0/3 nodes are available: 3 Insufficient cpu”, iako je procesor zauzet 30 % – jer Ivini testni Podovi rezerviraju jezgre koje ne troše. Kako raspoređivač odlučuje gdje ima mjesta – i tko kažnjava Pod koji uzme previše?

**Ciljevi učenja:**
- razlikovati `requests` (što raspoređivač rezervira) i `limits` (što provodi jezgra operacijskog sustava)
- pratiti raspoređivanje kroz filtriranje, bodovanje i vezanje te pročitati razlog stanja Pending
- predvidjeti posljedice prekoračenja: CPU se usporava, memorija završava s OOMKilled
- objasniti QoS klase i redoslijed izbacivanja pri nedostatku memorije
- povezati različito jake čvorove s pakiranjem Podova umjesto s težinama Servicea

**Scene:**
1. **Rezervacija, ne apetit** (animation): Scheduler seats by reservation (request), never by usage; allocatable = capacity − reserved − eviction threshold (example: 2 vCPU/4 GiB → 1930m/2972Mi, GKE formula, labelled).
2. **Filtar, bodovi, vezanje** (interactive): Filter: Ready, taints, selectors, Σrequests + pod ≤ allocatable, pods < 110; score LeastAllocated; random tie; bind.
3. **Predvidite: 30 % CPU-a, a Pending** (interactive): Node 30 % used but 95 % requested → Pending; fragmentation: enough free CPU in total, none on a single node.
4. **CPU se usporava, memorija ubija** (animation): CFS quota = limit × 100 ms per 100 ms: 200m limit, 50 ms of work → ≈210 ms latency (20 ms of CPU per 100 ms period: 20 + 80 throttled + 20 + 80 throttled + 10); memory over limit → OOMKilled, exit 137 → CrashLoopBackOff (L12).
5. **QoS i izbacivanje** (interactive): Guaranteed / Burstable / BestEffort; eviction when memory.available < 100Mi; ranking usage > request first, then priority, then usage − request; kernel OOM killer if faster.
6. **Veličine čvorova umjesto težina** (diagram): Payoff L04/L14: bigger nodes hold more Pods by requests; Service stays random per Pod; taints/tolerations and nodeSelector in one paragraph; in-place resize GA 1.35 changes a running Pod through its resize subresource – editing resources in a Deployment's template still rolls out new Pods; CPU limits as a trade-off.

**Glavna simulacija: Tetris raspoređivača.** E3 scheduler (SIM 3): three nodes with allocatable bars, eight Pod cards, manual drag then automatic scheduling with a filter/score table, usage sliders and break-it events. Zadaci: „Smjestite sve osim big-db i objasnite zašto big-db ne stane”, „Smjestite fragment bez novog čvora”, „Zaustavite OOM petlju Poda leaky”, „Učinite api Guaranteed”.

- _Pokvari:_ „Curenje memorije” ends in OOMKilled and CrashLoopBackOff without hurting neighbours; „Ukloni requests” makes a Pod BestEffort – packed anywhere, evicted first; „CPU petlja” is throttled, never killed; big-db and fragment stay Pending with the exact FailedScheduling message.
- _Uvid:_ The scheduler places Pods by reservations, the kernel punishes them by usage – two different worlds; memory is incompressible (kill), CPU compressible (throttle).

**Zablude koje razbijamo:**
- „Raspoređivač gleda stvarnu potrošnju” — requests only.
- „Limits se rezerviraju” — nothing is reserved; the kernel enforces limits at runtime.
- „Prekoračenje CPU limita ubija kontejner” — it is throttled.
- „Prekoračenje memorije samo usporava” — OOMKilled, exit 137.
- „Bez requests je u redu” — BestEffort: packed anywhere, evicted first, invisible to the HPA.
- „Promjena resources u deployment.yaml ne restarta Podove” — changing the Pod template still rolls out new Pods; in-place resize (GA 1.35) works on a running Pod via the resize subresource (or VPA InPlaceOrRecreate), and some changes (e.g. a memory decrease with RestartContainer) still restart the container.
- „CPU limit uvijek postavite” — a trade-off: limits cause throttling even on an idle node.

**Kod:** Blok resources (yaml), OOMKilled, Exit Code 137 i FailedScheduling (log), kubectl describe node i kubectl top pods (bash), kubectl patch pod … --subresource resize (bash), LimitRange i ResourceQuota za klopa-staging (yaml)

**Prijelaz dalje:** Limiti drže curenje pod kontrolom, a requests su točni. Ali svaki dan u 11:45 Davor i dalje ručno upisuje `kubectl scale --replicas=12`. Na blagdanski ponedjeljak zaboravi – i u 12:05 p95 je pet sekundi.

### 18. Automatsko skaliranje: ručak bez dežurstva

_HPA, Cluster Autoscaler i skaliranje po dubini reda – Podovi u sekundama, čvorovi u minutama._ · ~40 min · nadovezuje se na 17, 06

**Hook:** Na blagdanski ponedjeljak nitko nije povećao broj replika i u 12:05 p95 je pet sekundi. Na Ćevap-petak promet skoči s 20 na 100 zahtjeva u sekundi, a noću plaćamo prazne čvorove. Može li Klopa sama dodavati i uklanjati kapacitet – i koliko to traje?

**Ciljevi učenja:**
- izračunati željeni broj replika formulom HPA-a i objasniti toleranciju i namjerno sporo smanjivanje broja replika
- objasniti zašto HPA mjeri iskorištenost u odnosu na `requests`
- objasniti kada Cluster Autoscaler dodaje čvorove i zašto to traje minutama
- skalirati potrošače reda (klopa-worker) po dubini reda i objasniti skaliranje na nulu
- procijeniti kompromis između rezerve kapaciteta, latencije i troška

**Scene:**
1. **Formula uživo** (interactive): desired = ceil(cur × current/target); 3 Pods at 90 % with target 50 → 6; at 54 % → within 10 % tolerance → no change; max over metrics; sync 15 s.
2. **Mjeri se prema requests** (interactive): Utilisation = usage/request; no CPU request → HPA blind; limit = 2× request caps one step at ≈4×.
3. **Polako prema dolje** (animation): Scale-down window 300 s; scale-up policies 100 % or +4 Pods per 15 s.
4. **Podovi u sekundama, čvorovi u minutama** (animation): Pending → CA (scan 10 s) → node (minutes) → pull → start → readiness; Karpenter (one line) provisions nodes directly from pending Pods; scale-down when requests < 50 % for 10 min; drain respects PodDisruptionBudget (voluntary only).
5. **Potrošači po dubini reda** (interactive): KEDA: its operator handles 0↔1 (activation on the first message); the HPA it creates handles 1↔N with desired = ceil(queueLength / target); worker to zero at night; native HPA scale-to-zero beta in 1.37 only with object/external metrics.
6. **Vertikalno i trošak** (text): Callout, one paragraph: VPA is a separate add-on (Off, Initial, Recreate, InPlaceOrRecreate; Auto deprecated); don't mix VPA and HPA on the same metric; headroom vs €/h.

**Glavna simulacija: Preživite ručak.** E3 HPA + CA (SIM 4): a compressed day against klopa-api; the timeline annotates every HPA decision with its formula; a KEDA panel scales klopa-worker by queue depth. Zadaci: „p95 < 300 ms kroz nalet uz najmanji €/h”, „Objasnite zašto HPA stane na 9, a ne 10”, „Worker na 0 noću i natrag na prvu poruku”.

- _Pokvari:_ „Ukloni CPU request” blinds the HPA; „maxReplicas = 4” caps capacity and drops requests; a flash crowd with max 6 nodes leaves Pods Pending; a cold image cache lengthens every new node's lead time.
- _Uvid:_ Autoscaling is a thermostat with inertia: Pods in seconds, nodes in minutes, scale-down deliberately slow; you buy time with headroom, and HPA sees usage only relative to requests.

**Zablude koje razbijamo:**
- „HPA dodaje čvorove” — HPA adds Pods; the Cluster Autoscaler or Karpenter add nodes.
- „Cluster Autoscaler reagira na visok CPU” — it reacts to Pending Pods.
- „Skaliranje je trenutačno” — Pods take seconds, nodes minutes, and scale-down waits 300 s.
- „HPA ne može na nulu” — beta in 1.37 with object/external metrics; KEDA has done 0↔1 for years.
- „HPA na CPU-u može na nulu” — scale-to-zero needs object/external metrics.
- „HPA radi bez requests” — utilisation is usage/request.
- „VPA updateMode: Auto” — deprecated; use Recreate or InPlaceOrRecreate.
- „PDB štiti od pada čvora” — it covers only voluntary evictions.

**Kod:** hpa.yaml (yaml), kubectl get hpa -w (log), KEDA ScaledObject za RabbitMQ (yaml), pdb.yaml (yaml)

**Prijelaz dalje:** Cluster Autoscaler je noću ispraznio i uklonio jedan čvor. Na njemu je bio Postgres, koji je Iva pokrenula „kao i sve ostalo” – u Deploymentu. Pod se preselio, a ujutro su sve narudžbe nestale.

### 19. Podatci koji preživljavaju: volumeni i StatefulSet

_Zašto Pod smije umrijeti, a podatci ne – i zašto `replicas: 3` nije klaster baze._ · ~35 min · nadovezuje se na 13, 05, 14, 18

**Hook:** Postgres je radio u Deploymentu bez trajnog volumena i preselio se bez podataka. A kad je netko ranije postavio `replicas: 3`, dobili smo tri različite tablice narudžbi koje je Service nasumično miješao. Gdje u Kubernetesu žive podatci i kako bazi dati stalan identitet?

**Ciljevi učenja:**
- predvidjeti što preživljava ponovno pokretanje kontejnera, brisanje Poda i pad čvora uz datotečni sustav kontejnera, emptyDir i PersistentVolume
- objasniti lanac PersistentVolumeClaim → PersistentVolume → StorageClass
- objasniti načine pristupa (RWO = jedan čvor) i zašto premještanje diska nakon naglog pada čvora traje minutama ili čeka čovjeka
- objasniti što StatefulSet daje (ime, disk, redoslijed, headless Service), a što ne (replikaciju)
- odabrati između upravljane baze, operatora i baze u StatefulSetu

**Scene:**
1. **Preživljavaju li podatci?** (simulation): Flagship part 1.
2. **Narudžbenica za disk** (animation): PVC (10Gi, RWO, StorageClass) bound to a PV; StorageClass provisions on demand via a CSI driver; dynamic volumes default to reclaim Delete; WaitForFirstConsumer; PVC protection: a PVC in use stays Terminating until no Pod uses it.
3. **Načini pristupa i premještanje** (diagram): RWO = one node (Pods on it may share), ROX, RWX, RWOP = one Pod. After a sudden node failure: NotReady → after 300 s Pods marked for eviction but stay Terminating (kubelet unreachable); a replacement Pod waits with a Multi-Attach error until the volume is force-detached after 6 min, or until someone applies the node.kubernetes.io/out-of-service taint (non-graceful node shutdown, GA 1.28), which force-deletes Pods and detaches volumes immediately.
4. **Tri baze umjesto jedne** (animation): replicas: 3 Postgres with per-Pod storage (none or emptyDir) = three independent DBs behind a random Service; with one shared RWO PVC → Multi-Attach errors on other nodes or two Postgres processes on one data directory (startup failure or corruption risk); replication is the database's job (callback L05).
5. **Identitet: StatefulSet** (interactive): db-0/1/2 in order, PVC data-db-N each, headless Service (clusterIP: None – DNS returns Pod IPs, introduced here) gives stable DNS db-1.db.klopa.svc.cluster.local; delete db-1 → same name and PVC; scale down from highest ordinal, PVCs retained; after a sudden node loss db-N is NOT recreated until the node is confirmed dead – never two db-1.
6. **Kad StatefulSet nije dovoljan** (text): Operators (CRD + controller that knows replication, failover and backups, e.g. CloudNativePG) or a managed DB. For production Klopa we recommend a managed database or a Postgres operator; in the course Postgres stays a StatefulSet so we can see the mechanics. Backups/snapshots one line.

**Glavna simulacija: Preživljavaju li podatci?.** Part 1: three Postgres Pods (container filesystem / emptyDir / PVC) with order counters against destructive events. Part 2: Deployment vs StatefulSet small multiples. Zadaci: „Sačuvajte narudžbe kroz pad čvora (uključujući korak out-of-service)”, „Smanjite na 1 pa vratite na 3 – podatci db-2 ostaju”, „Dijagnosticirajte bug s tri baze”.

- _Pokvari:_ „Čvor pao” wipes the container-filesystem and emptyDir variants, delays the Deployment+PVC variant by minutes and leaves the StatefulSet waiting until someone marks the node out-of-service; replicas: 3 in a Deployment creates three databases (or clashing processes on one disk); „Obriši PVC” deletes the data for good once no Pod uses it.
- _Uvid:_ Pods are ephemeral and storage has its own lifecycle; a StatefulSet gives identity – name, disk, order – and prefers 'never two db-1' over availability, so after a sudden node loss someone must confirm the node is dead; replication remains the database's job.

**Zablude koje razbijamo:**
- „Datotečni sustav kontejnera je trajan” — it is lost on restart or replacement.
- „Svaki volumen je trajan” — emptyDir dies with the Pod.
- „RWO znači jedan Pod” — one node; RWOP is one Pod.
- „Postgres s replicas: 3 je klaster baze” — it gives three independent databases (or clashing processes on one disk).
- „StatefulSet replicira podatke” — it gives identity only.
- „StatefulSet se nakon pada čvora sam preseli” — its Pod stays Terminating until the node is confirmed down (out-of-service taint or force delete), so two Pods never share one identity and disk.
- „Brisanje StatefulSeta briše podatke” — PVCs are retained by default.

**Kod:** pvc.yaml (yaml), statefulset.yaml s headless Serviceom (yaml), kubectl get sc,pv,pvc i describe pvc (bash), kubectl taint nodes čvor-2 node.kubernetes.io/out-of-service=nodeshutdown:NoExecute (bash)

**Prijelaz dalje:** Infrastruktura je stabilna: Podovi se obnavljaju, skaliraju i čuvaju podatke. Najveći rizik postale su naše vlastite promjene. U petak u 11:30 izlazi verzija 2.0 s novom košaricom.

## Modul 5: Isporuka softvera

Od commita do korisnika: strategije postavljanja, CI/CD, GitOps s Argo CD-om i upravljanje tajnama u GitOpsu.

### 20. Što je deploy: postavljanje, izdanje i strategije

_Okruženja, četiri strategije i kako odabrati koliko će korisnika vidjeti grešku._ · ~40 min · nadovezuje se na 13, 14, 15

**Hook:** Petak, 11:30. Verzija 2.0 krene postupnim ažuriranjem i do 11:50 svi korisnici vide krivo izračunat PDV na svakoj petoj narudžbi. Usto je migracija preimenovala stupac u bazi pa se stari Podovi, koji još rade tijekom uvođenja, ruše. Što znači postaviti novu verziju i kako to napraviti tako da greška pogodi što manje ljudi?

**Ciljevi učenja:**
- razlikovati postavljanje (deploy), izdanje (release), uvođenje (rollout) i objekt Deployment
- objasniti okruženja i promociju istog artefakta do produkcije
- usporediti strategije Recreate, postupno ažuriranje, plavo-zeleno i canary po riziku, trošku i brzini
- objasniti zašto plavo-zeleno i canary nisu ugrađeni u Deployment i čime se izvode
- planirati promjenu sheme baze u tri koraka i odvojiti postavljanje od izdanja
- objasniti kako Kustomize iz istih manifesta stvara inačicu za svako okruženje

**Scene:**
1. **Četiri riječi** (diagram): postavljanje (deploy), izdanje (release), uvođenje (rollout), Deployment (object).
2. **Okruženja i promocija** (animation): dev → staging → prod with the same digest; „staging prošao ≠ produkcija radi”; Kustomize base + overlays render plain YAML per environment. Callout, one line: Helm = paketi predložaka s vrijednostima; Argo CD ga renderira (22. predavanje).
3. **Četiri strategije, isti bug** (simulation): Flagship.
4. **Plavo-zeleno i canary** (interactive): Blue-green: flip Service selector or Gateway backend; the flip is instant only for new connections – existing keep-alive/HTTP/2 connections keep reaching blue (conntrack, L14) until they close, so keep blue running until it drains (Argo Rollouts scaleDownDelaySeconds 30 s); fast rollback, 2× resources. Canary by replicas: 4 stable + 1 canary ≈ 20 % of connections (approximate, with variance) – the smallest step with N=4; HTTPRoute weight 95/5: each request goes to v2 with probability 5 %, independent of Pod count. Manual with two Deployments + Service selector or HTTPRoute weights; automated by Argo Rollouts (steps, analysis, abort; Gateway API plugin) or Flagger.
5. **Baza ne ide unatrag** (interactive): Expand/contract: add column + dual write → migrate readers → drop old; a one-step rename breaks v1 mid-rollout; rollback after a drop is impossible.
6. **Postavljanje nije izdanje** (animation): Feature flags: deploy dark, release to 1 % → staff → everyone without redeploying.

**Glavna simulacija: Četiri strategije, isti bug.** Four lanes on identical seeded traffic – Recreate, Rolling, Blue-green, Canary – each deploying 2.0.0 with a bug affecting a share of requests; per-lane downtime, users hit, extra €, time to rollback, mixed-version window. Zadaci: „Uvedite 2.0 tako da grešku vidi < 50 korisnika” (solvable only with Gateway weights – the lesson itself), „U skrivenom načinu uočite grešku prije 10 % izloženosti”, „Promijenite shemu bez rušenja v1”.

- _Pokvari:_ Rolling spreads the bug to everyone; blue-green switches everyone at once but rolls back instantly (old connections linger on blue); canary with analysis stops near 5 % exposure with Gateway weights, near 20 % with replicas; a one-step column rename crashes v1 mid-rollout.
- _Uvid:_ You can deploy without releasing; a strategy decides how many users a bug reaches and what it costs. Canary and blue-green aren't built into the Deployment object: do them by hand with two Deployments plus a Service selector or HTTPRoute weights, or automate them with Argo Rollouts or Flagger.

**Zablude koje razbijamo:**
- „Postavljanje = izdanje” — feature flags let you deploy dark and release later.
- „Rollback je uvijek siguran” — irreversible migrations break the old version.
- „Blue-green i canary ugrađeni su u Deployment” — they need a router (Service selector, Gateway weights) and usually tooling.
- „Prebacivanje selektora odmah prebaci sve korisnike” — only new connections; keep-alive connections stay on blue until they close.
- „Staging je prošao, znači produkcija radi” — data, scale and config differ.
- „Canary po replikama je točan postotak” — it is the Pod ratio per connection, with variance; with 4 Pods the smallest step is ~20 %.
- „Kubernetes treba Helm” — the API server receives ordinary objects; Helm renders them client-side (Helm 4 can use server-side apply) and keeps release history as Secrets in the namespace.

**Kod:** Recreate i RollingUpdate (yaml), Plavo-zeleno promjenom selektora (yaml), HTTPRoute 95/5 (yaml), kustomization.yaml s overlays/prod i kubectl kustomize (bash), Argo Rollouts canary s analizom (yaml), Proširi i suzi (sql)

**Prijelaz dalje:** Verzija 2.0.0 je vraćena, a ispravak PDV-a 2.0.1 čeka. Ali tko pritišće gumbe? Davor gradi sliku na svom laptopu s nespremljenim promjenama, šalje je kao `latest` i preskače testove „jer se žuri”. Sljedeći tjedan odlazi na Erasmus – i nitko drugi ne zna kako se Klopa postavlja.

### 21. CI/CD: od commita do provjerene slike

_Kontinuirana integracija kao navika, pipeline kao kod i razlika između isporuke i postavljanja._ · ~40 min · nadovezuje se na 08, 20

**Hook:** Slika u produkciji izgrađena je na Davorovom laptopu s nespremljenim promjenama, označena kao `latest`, bez testova. Nitko ne zna koji je commit u produkciji, a Davor sljedeći tjedan odlazi na Erasmus. Kako svaku promjenu – počevši od ispravka 2.0.1 – automatski provjeriti, zapakirati i pripremiti za produkciju, bez ičijeg laptopa?

**Ciljevi učenja:**
- objasniti kontinuiranu integraciju kao praksu malih, čestih spajanja s automatskom izgradnjom i testovima
- razlikovati kontinuiranu isporuku i kontinuirano postavljanje
- opisati faze pipelinea i zašto se ista slika (digest) promovira kroz okruženja
- označavati slike hashom commita ili semantičkom verzijom umjesto taga latest
- objasniti prednost kratkotrajnih OIDC tokena i rizik pipelinea koji s trajnim ključem radi kubectl apply u produkciju

**Scene:**
1. **Pakao integracije** (animation): Long-lived branches merged after weeks vs small merges at least daily (Fowler).
2. **Pokretna traka** (simulation): Flagship; fail fast.
3. **Izgradi jednom, promoviraj više puta** (animation): Tags = git SHA / semver; digest = sha256 of the image manifest, i.e. of the built content – rebuilding the same commit later usually gives a different digest (timestamps, a newer base image behind the same tag, a new dependency patch); one digest dev → staging → prod; rebuild for prod = different, untested artefact. If imagePullPolicy is omitted, :latest (or no tag) defaults it to Always; any other tag or a digest → IfNotPresent (set when the object is created).
4. **Isporuka ili postavljanje?** (interactive): Gate slider: CI only / continuous delivery (human button before prod) / continuous deployment (automatic).
5. **Pipeline kao kod** (diagram): GitHub Actions: .github/workflows, events, jobs parallel by default unless needs, steps, runners; GitLab CI: stages in order, jobs in a stage parallel.
6. **Tajne i tko gura u klaster** (animation): Long-lived cloud key vs OIDC token issued per job, scoped by the cloud trust policy (repo, branch, environment) and expiring on its own after a short lifetime (AWS STS default 1 h, down to 15 min) – nobody has to rotate it; never echo secrets; pin actions by SHA. Push model: CI holds powerful long-lived cluster credentials and runs kubectl apply – it works and is widely used, but nothing detects drift (teaser L22).

**Glavna simulacija: Tvornica commitova.** E4: the pipeline as an assembly line – lint → testovi → izgradnja slike → skeniranje → registar (digest) → staging → e2e → [ljudska vrata] → produkcija – with a DORA panel. Zadaci: „Od commita do produkcije < 10 min uz sve provjere”, „0 loših commitova u produkciji od 20”, „Postavite kontinuiranu isporuku pa kontinuirano postavljanje”.

- _Pokvari:_ „Preskoči testove” ships a bug; a flaky test erodes trust; a vulnerable base image is stopped by the scan; a production rebuild is not the tested artefact; a leaked long-lived key stays usable while an OIDC token expires on its own.
- _Uvid:_ CI is a habit, not a server; the artefact that was tested is the one that goes live, identified by its digest; delivery means you could release any time, deployment means you do.

**Zablude koje razbijamo:**
- „CI/CD je alat” — it is a practice; tools only automate it.
- „CD uvijek znači automatski u produkciju” — continuous delivery keeps a human release decision; continuous deployment removes it.
- „Testovi su neobavezni, CI je samo izgradnja” — without tests there is no feedback.
- „CI s trajnim administratorskim ključem klastera jednako je siguran kao GitOps” — push works, but CI holds powerful long-lived cluster credentials and nothing detects drift; pull moves the credentials into the cluster and adds continuous reconciliation.
- „Sliku izgradite posebno za svako okruženje” — a rebuild is a different artefact; promote one digest.
- „latest je u redu” — movable and unauditable; it defaults imagePullPolicy to Always.
- „Trajni ključevi u CI-ju su u redu” — prefer OIDC short-lived tokens scoped to repo/branch/environment.

**Kod:** .github/workflows/ci.yaml (yaml), .gitlab-ci.yml (yaml), docker buildx build --push i digest (bash), Korak kubectl apply (push model) (yaml)

**Prijelaz dalje:** Pipeline gradi i provjerava svaku promjenu, ali na kraju sam izvodi `kubectl apply` s ključem administratora klastera. U 02:00 netko je još i ručno pokrenuo `kubectl edit` – i više nitko ne zna što stvarno radi u produkciji.

### 22. GitOps i Argo CD: Git kao izvor istine

_Ista petlja usklađivanja, razinu više: klaster sam povlači željeno stanje iz Gita i – ako to uključite – poništava ručne promjene._ · ~40 min · nadovezuje se na 10, 13, 18, 20, 21

**Hook:** CI drži ključ administratora klastera – ako procuri, napadač ima sve. U 02:00 netko je naredbom `kubectl edit` promijenio varijablu, a nakon obnove klastera nitko ne zna rekonstruirati stanje. Što ako bi klaster sam povlačio željeno stanje iz Gita i neprestano ga uspoređivao – kao termostat iz desetog predavanja?

**Ciljevi učenja:**
- objasniti četiri načela GitOpsa
- objasniti Argo CD kao petlju usklađivanja između Gita i klastera te razliku između povlačenja i guranja, uključujući to da povlačenje premješta ključeve, a ne uklanja ih
- razlikovati status sinkronizacije (Synced, OutOfSync) i zdravlje aplikacije
- predvidjeti ponašanje uz auto-sync, prune i selfHeal te kada Argo CD primijeti promjenu u Gitu
- napraviti rollback naredbom git revert i objasniti podjelu posla između CI-ja i Argo CD-a

**Scene:**
1. **Gurati ili povlačiti** (animation): Push: CI with cluster credentials; pull: agent inside the cluster reads Git; OpenGitOps: declarative, versioned and immutable, pulled automatically, continuously reconciled. Pull moves the keys, it doesn't remove them: anyone who can merge to the config repo can deploy to production, and Argo CD runs with broad cluster rights – protect the repo with branch protection, required reviews and commit-signature verification (Argo CD AppProject sourceIntegrity, 3.5), and restrict Argo CD with AppProjects (one line).
2. **Matrjoška petlji** (animation): Thermostat (L10) → Kubernetes controller → Argo CD; target state (Git) vs live state (cluster).
3. **Od commita do sinkronizacije** (interactive): Refresh polls every 120 s + up to 60 s jitter, webhook is faster; OutOfSync diff → sync → Synced/Healthy; sync and health are separate (Synced + Degraded possible).
4. **Odstupanje** (interactive): Manual kubectl scale → OutOfSync; selfHeal off (default) stays, on → reverted after 5 s; file removed from Git: prune off (default) → orphan, on → deleted; a failed sync is not retried on the same commit unless syncPolicy.retry is configured (exponential backoff).
5. **Rollback je git revert** (animation): Bad commit → Degraded → git revert → audit trail; CI bumps the tag in the config repo, Argo CD pulls; Argo CD renders Helm with helm template (helm list is empty) and Kustomize. Closed DeepDive: sync waves (migration Job wave −1).
6. **Argo CD i HPA** (interactive): replicas in Git fights the HPA (L18). Preferred: omit spec.replicas from the Deployment in Git – but removing it from an existing manifest can drop the Deployment to 1 replica once (the default), so follow the HPA migration procedure. If it must stay: ignoreDifferences on /spec/replicas together with syncOptions RespectIgnoreDifferences=true (ignoreDifferences alone only hides the diff; the next sync still applies replicas). Flux as the alternative (one line); teaser „a lozinke?”.

**Glavna simulacija: Git je istina.** E6: config repo (file tree + commit graph + CI bot lane) on the left, Argo CD resource tree (Application → Deployment → ReplicaSet → Pods + Service) with sync/health badges and a poll ring on the right. Zadaci: „Uvedite 2.0.1 samo commitom”, „Ručno odstupanje neka se samo vrati”, „Vratite loš commit na GitOps način”, „Zaustavite borbu Argo CD-a i HPA-a – i nakon sljedećeg commita”.

- _Pokvari:_ A manual scale shows OutOfSync and stays unless selfHeal is on; a deleted Deployment is restored by selfHeal; a file removed from Git leaves an orphan unless prune is on; a bad commit is Synced but Degraded; replicas in Git plus an HPA make them fight – and ignoreDifferences alone only hides it until the next sync.
- _Uvid:_ Argo CD is the L10 loop one level up: Kubernetes reconciles the cluster to etcd, Argo CD reconciles it to Git; Git history becomes deployment history, rollback is a commit – and the config repo becomes the thing to protect.

**Zablude koje razbijamo:**
- „Argo CD gradi i testira kod” — CI does that.
- „Argo CD reagira odmah na push” — it polls every 120 s plus up to 60 s jitter unless a webhook is set up.
- „GitOps = YAML u Gitu” — it also means pulled automatically and continuously reconciled.
- „Moja ručna promjena ostaje” / „Auto-sync po zadanom vraća i briše” — drift shows as OutOfSync; it is reverted only with selfHeal and deleted only with prune, both off by default.
- „ignoreDifferences rješava borbu s HPA-om” — it only affects the diff; without RespectIgnoreDifferences=true the next sync applies replicas again.
- „GitOps uklanja sve ključeve iz CI-ja, pa je siguran” — whoever can merge to the config repo deploys to production; protect the repo and limit Argo CD with AppProjects.
- „Rollback je klik u sučelju” — prefer git revert so Git stays the truth.
- „Argo CD pokreće helm install” — it runs helm template.
- „Flux je umro s Weaveworksom” — Flux is CNCF graduated and actively released.

**Kod:** application.yaml (yaml), Struktura config repozitorija (text), CI korak: kustomize edit set image + commit (yaml), ignoreDifferences za /spec/replicas + RespectIgnoreDifferences=true (yaml), AppProject sa sourceIntegrity (yaml), Instalacija Argo CD-a (bash)

**Prijelaz dalje:** Sve što opisuje Klopu sada je u Gitu – osim lozinki, koje prema šesnaestom predavanju nikad ne smiju u Git. Lana zato `secret.yaml` primjenjuje ručno sa svog laptopa, a kad se podigne novi klaster, API Podovi ne mogu ni krenuti – stoje u CreateContainerConfigError jer Secreta nema.

### 23. Upravljanje tajnama u GitOpsu

_U Git smije brava ili adresa, nikad ključ: Sealed Secrets, External Secrets Operator i ostale mogućnosti._ · ~35 min · nadovezuje se na 16, 22

**Hook:** Lana je `secret.yaml` primijenila ručno, pa na novom klasteru API ne može ni krenuti. Netko je u međuvremenu u Git spremio Secret kodiran u base64 – brisanje commita ne uklanja ga iz povijesti. A kad je Davor otišao na Erasmus, zamjena ključa za SMS-gateway, koji je postojao samo na njegovu laptopu, trajala je dva dana. Kako tajne uklopiti u GitOps, a da ih nikad ne zapišemo u Git?

**Ciljevi učenja:**
- objasniti zašto obični Secret ne smije u Git i zašto nakon curenja tajnu treba promijeniti
- usporediti šifriranje u Gitu (Sealed Secrets, SOPS) i referencu u Gitu uz vanjski trezor (External Secrets Operator, Secrets Store CSI Driver)
- objasniti preporuku Argo CD-a da se tajnama upravlja u odredišnom klasteru
- isplanirati rotaciju tajne i predvidjeti kada je vidi koji Pod
- odabrati pristup za mali tim i za veću organizaciju u oblaku

**Scene:**
1. **Dilema** (animation): GitOps wants everything in Git; base64 is plaintext; deleting a commit doesn't clean clones → rotate.
2. **Sealed Secrets** (animation): kubeseal encrypts with the controller's public key; SealedSecret is safe in Git; only the in-cluster controller decrypts; scopes strict/namespace/cluster. Every 30 days the controller adds a new sealing key; old keys are kept so existing SealedSecrets still decrypt – renewal re-encrypts nothing and is not secret rotation. If the private keys leak, every SealedSecret ever committed becomes readable, so rotate the real values. Back up all keys (label sealedsecrets.bitnami.com/sealed-secrets-key).
3. **Trezor i External Secrets Operator** (animation): ExternalSecret reference in Git → ESO reads Vault/OpenBao/cloud secret manager → creates a Kubernetes Secret every refreshInterval; rotation path.
4. **Ostale mogućnosti** (diagram): One comparison diagram: SOPS encrypts values, keeps keys readable (age, cloud KMS); Flux decrypts natively, Argo CD needs a plugin (the discouraged approach). Secrets Store CSI Driver fetches at Pod start into tmpfs, optional sync to a Secret, store down → new Pods can't start. argocd-vault-plugin: Argo CD needs secret access, plaintext in its Redis cache, coupled syncs – discouraged.
5. **Odabir i ekosustav** (diagram): Decision guide (small team: Sealed Secrets; cloud org: ESO + cloud secret manager); ESO pause/resume as a bus-factor story; Vault BSL (now IBM) vs OpenBao MPL fork; OIDC in CI (L21).

**Glavna simulacija: Put tajne (2. dio).** E5 + E6: the L16 simulator across the GitOps pipeline (laptop → Git → CI → registry → Argo CD → API/etcd → node → Pod) with GitOps approaches unlocked. Zadaci: „Svi čitatelji Gita sivi”, „Rotirajte SMS ključ u < 5 min bez lozinke u Gitu”, „Ispravno reagirajte na procurjeli commit”, „Preživite nedostupan trezor”.

- _Pokvari:_ A plain Secret stored in Git turns the Git-history eye red forever until rotation; losing the private key blocks decryption after a rebuild and Pods can't start; a leaked private key exposes every SealedSecret ever committed; with the store down ESO keeps serving while CSI blocks new Pods; argocd-vault-plugin exposes plaintext in Argo CD's cache.
- _Uvid:_ Git may hold a lock (encrypted value) or an address (reference), never the key; whatever the tool, the value ends up readable to whoever can create Pods in the namespace – RBAC and rotation still matter.

**Zablude koje razbijamo:**
- „Secret u base64 u privatnom repozitoriju je u redu” — every clone, backup and CI log can decode it.
- „Obrisao sam commit, riješeno” — clones keep it; rotate the secret.
- „Obnova ključa Sealed Secretsa svakih 30 dana rotira tajne” — it only adds a new sealing key; old SealedSecrets and the real values stay the same.
- „Zapečaćena tajna sigurna je i unutar klastera” — once unsealed it is an ordinary Secret.
- „Koristite argocd-vault-plugin” — Argo CD discourages it (plaintext in the Redis cache); no release since June 2024.
- „Vault je open source pod MPL-om” — BSL 1.1 since August 2023; OpenBao is the MPL fork.
- „External Secrets Operator je napušten” — releases resumed in September 2025 and continue.
- „Uz vanjski trezor nema Kubernetesova Secreta” — ESO creates one.

**Kod:** kubeseal i SealedSecret (yaml), Sigurnosna kopija ključeva kontrolera (bash), ExternalSecret i ClusterSecretStore (yaml), SecretProviderClass (yaml), SOPS datoteka s age ključem (yaml)

**Prijelaz dalje:** Svi su dijelovi na mjestu: slike, klaster, pipeline, Git i tajne. Petak je, 11:55, a popust za Ćevap-petak krivo se obračunava. Ispravak mora stići do korisnika prije 12:00.

## Modul 6: Sve zajedno

Završni projekt: put jednog commita i jednog zahtjeva kroz cijelu Klopu, tri signala observabilityja i dijagnostika kvarova.

### 24. Dan izdanja: put jednog commita i jednog zahtjeva

_Cijela Klopa u jednom prolazu – za svaki kvar mehanizam koji vas štiti i signal koji ga otkriva._ · ~45 min · nadovezuje se na 15, 18, 19, 22, 23

**Hook:** Petak, 11:55. Nova košarica 2.0.1 radi od jutra, ali popust za Ćevap-petak krivo se obračunava. Ispravak 2.0.2 mora biti vani prije 12:00. Pratimo jedan commit od Lanine tipkovnice do produkcije i jedan studentski zahtjev od mobitela do kuhinje – a na svakoj postaji pitamo: što ako ovdje pukne?

**Ciljevi učenja:**
- pratiti put commita od git push do prometa na novim Podovima
- pratiti put zahtjeva od DNS-a do potrošača reda i objasniti ulogu svakog sloja
- za svaki kvar navesti mehanizam koji štiti sustav i predavanje koje ga objašnjava
- razlikovati metrike, logove i tragove i znati što koji od njih otkriva
- dijagnosticirati čest kvar iz stanja Poda, događaja i statusa Argo CD-a
- odabrati sljedeće korake učenja

**Scene:**
1. **Put jednog commita** (interactive): push → PR → CI (cache hits) → digest → bot commit → OutOfSync → sync → new ReplicaSet → scheduler → kubelet pulls only changed layers → probes → EndpointSlice ready → Gateway sends traffic.
2. **Put jednog zahtjeva** (interactive): DNS → cloud LB → Gateway (TLS, HTTPRoute, endpoints from the Service's EndpointSlice, per-request balancing) → Pod (ConfigMap/Secret) → Postgres (StatefulSet u tečaju; u produkciji upravljana baza ili operator) → queue → worker → SMS; in-cluster calls (web → api) go through the Service's ClusterIP.
3. **Što ako ovdje pukne?** (interactive): Per hop: health checks, readiness removal, self-healing, queue buffering, retries with backoff, HPA/CA, Argo CD self-heal.
4. **Tri signala: metrike, logovi, tragovi** (interactive): Metrics say that (RED per service: Rate, Errors, Duration), traces say where (one request's waterfall), logs say why; a trace ID links them; Prometheus pulls metrics, OpenTelemetry is the standard for traces.
5. **Dijagnostika** (simulation): Flagship.
6. **Mapa tečaja i kamo dalje** (diagram): Opens with a powers-of-ten zoom (region → cluster → node → Pod → container → Linux process, L07 PID view) – the reverse of the L01 trailer; then the concept graph lights up; next: observability in depth (Prometheus, OpenTelemetry), RBAC/NetworkPolicy/Pod Security, Helm in depth, service mesh, KCNA; Kubernetes release cadence and support window.

**Glavna simulacija: Incident u 12:00.** A seeded chaos run on the full Klopa: hidden faults, kubectl-style output, RED metrics, logs, a trace view and Argo CD status; a hypothesis is required before acting; fixes only through Git commits; score = affected users + time to recovery. Zadaci: „Riješite tri incidenta”, „Svaki popravak samo commitom”, „Za svaki kvar navedite predavanje i signal koji ga je otkrio”.

- _Pokvari:_ „Kaos majmun” injects a random fault mid-lunch; manual fixes are reverted – every fix must go through Git.
- _Uvid:_ Every layer of the course exists because of one concrete incident – and every symptom has a mechanism, a signal that reveals it and a place to look.

**Zablude koje razbijamo:**
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

**Kod:** Cijeli config repozitorij Klope (yaml), Šalabahter za dijagnostiku (bash)

**Prijelaz dalje:** Kraj tečaja. Kamo dalje: observability u dubini (Prometheus, OpenTelemetry), sigurnost klastera (RBAC, NetworkPolicy, Pod Security), Helm u dubini i KCNA – a Davorov dežurni priručnik možete preuzeti i ponijeti sa sobom.

## Design rationale

SYNTHESIS (unchanged core). Ordering follows the story lens's pain chain (each lecture's 'Cijena rješenja' is the next hook – every hook re-checked against the previous bridgeToNext after this revision), constrained by the dependency rule that every concept has one home and no forward use (named exceptions: Pending as a symptom in L11, explained in L17; release named in L13, taught in L20; the L11 replicas slider is a labelled ReplicaSet preview), built on six shared seeded sim engines (E1–E6) whose numbers come from the validated sim-models prototypes. Macro order: why distribute (M1) → packaging (M2) → Kubernetes core (M3) → operations (M4) → delivery (M5) → capstone (M6). 24 lectures, now ≈905 min ≈15 h (was ≈16 h): durations cut to the AUTHORING band (30–35 min; up to 40 for lectures with a heavy flagship; L24 45) by moving material into DeepDives/Callouts rather than deleting it (L03 USL, L05 replicas/CAP and LB-of-LB, L06 Kafka, L07 extra namespaces and isolation spectrum, L08 'Ispod haube', L12 init/sidecar, L13 'Tri riječi', L14 NodePort/headless, L18 VPA, L20 Helm, L22 sync waves/Flux/AppProject, L23 SOPS+CSI merged). L19 rose from 30 to 35 because the headless Service moved there and node-failure recovery is now modelled correctly. Shorter path (20): merge 01 into 02, 15 into 14, 09 into 08, make 19 a DeepDive. Key earlier decisions (1)–(12) stand: short network L01; LB split into L04 algorithms and L05 failure+state; queues after state; Compose motivates Kubernetes; desired state threshold in L10 before objects; probes in the Pod lecture; rollout in L13 with Service-dependent detail in L14; Gateway API separate; resources → autoscaling adjacent; secrets split L16/L23; delivery = what is deploy → CI/CD → GitOps → secrets; observability now a scene in L24 rather than a lecture.

CHANGES APPLIED FROM THE CRITIQUES (all accepted unless listed under 'rejected/adapted'). Technical: L01 private address/NAT scenario, DROP vs REJECT, NXDOMAIN costs one resolver RTT, stale-record toggle, SO_REUSEPORT nuance; L02 M/M/1 labelling + Erlang C note, RAM-as-DB-cache caveat; L03 143 %; L04 DNS rotation (not 'everyone hits server 1') and softened Service keyFact; L05 detection 30–60 s (65 s hung, re-entry 150 s), 'Sruši proces' vs 'Ugasi stroj'; L06 RabbitMQ vs SQS redelivery semantics (CRITICAL) with a broker switch, idempotency limited to same-transaction effects + SMS-duplicate counter + outbox DeepDive, SQS FIFO wording, share groups, KRaft dates; L07 eight namespaces, user namespaces don't stop kernel exploits, architecture/emulation; L08 cache rule wording, BuildKit secret mounts, Bitnami dates, imagePullPolicy moved to L21 in corrected form; L09 postgres VOLUME/anonymous volume + PG18 data path (also L19); L10/L11 two-manifest bridge, controller step only for owned objects, kubelet-down → Terminating; L12 phase vs STATUS vs Ready, readiness must not fail on a shared DB (sim gets /ready-db as the anti-pattern); L14 EndpointSlice ready/serving/terminating, dnsutils image, cloud-provider-kind; L15 Gateways bypass ClusterIP and balance per request (CRITICAL; L24 path fixed, glossary Service/Gateway API adjusted); L16 'view' eye, provider ranking (aescbc not recommended, local-key vs KMS v2, new control-plane-disk thief), Secret glossary; L17 in-place resize myth, two-reason FailedScheduling message, CFS ≈210 ms; L18 KEDA 0↔1 vs HPA 1↔N; L19 non-graceful node shutdown (out-of-service taint, 6-min force detach, StatefulSet waits), PVC protection, shared-PVC replicas: 3; L20 per-request weight probability, blue-green connection drain, insight/Helm myth; L21 digest = manifest hash, OIDC lifetime, push model is legitimate (myth replaced), DORA renamed; L22 RespectIgnoreDifferences (CRITICAL; sim now shows ignoreDifferences alone failing on the next sync), retry, 'pull moves the keys' + repo protection (sourceIntegrity verified on argo-cd docs for 3.5); L22/L23 missing Secret = CreateContainerConfigError/FailedMount, not a crash; L23 Sealed Secrets key renewal ≠ rotation, key backup; L24 Postgres note; L13 change-cause; release-support facts re-verified on kubernetes.io/releases (maintained 1.35–1.37, 1.37 EOL 2027-10-28; 1.34 already listed as EOL, so dropped). Pedagogy: version chain 2.0.0→2.0.1→2.0.2, server-size chain L02–L04, Davor replaces the unknown 'pripravnik', L05 motive for least connections, L10 capacity model (3×14 slots, 27 containers, no rebalancing), L11 hook/bridge consistency and bare-Pod plant, L12 bridge (node down > 5 min), L16→L17 cause of Pending, L20 canary-by-replicas snapping (20 % minimum with N=4), L09 'impossible' task now completes on discovery, L04 Predict for the lecturer's 4 GB vs 8 GB example, dockerization objective + Containerization term, command vs event in L06, observability scene + term, Rollback term (glossary now 83), prerequisites fixed (07, 17, 19, 22), forward references removed (L05 sessionAffinity → L14 with the NAT caveat; L08 imagePullPolicy → L21; L10 artifact labelled; requests note in L12/L13), keyFacts trivia removed (runner prices, OCI/containerd dates, Khepri, CNCF status list; Vault facts merged), worker/radnik/potrošač disambiguation, 'fotografije' vs 'slike', no 'commitati' in UI, Service plural, one translation for health check, procesorska jezgra, wording fixes in titles/subtitles/objectives, inline code rule, incident-number reproducibility rule, every misconception now has an English correction, L24 myths split into ten, missing 'breaks down' added (L14, L21).

REJECTED OR ADAPTED. (a) Node.js vs worker-pool conflict: the critics disagreed (technical: keep Node + callout; pedagogy: switch the API to Python/gunicorn). Adopted the pedagogy option because it makes the lecturer's RAM sim literally true for Klopa (gunicorn sync workers are RAM-bound) and gives L01 a natural 127.0.0.1 default; kept the technical critic's content as the L02 DeepDive and a Node/pg.Pool contrast tab. Ripple applied: port 8000, Python health endpoints, Django Redis sessions, pika consumer, klopa-web (npm/Vite → nginx) hosts the L08 cache lab. (b) L02 hook: both proposed texts ('p95 almost 5 s, 503 and 504') are not reproducible either – re-running docs/research/proto/lb-sim.ts (I/O preset, 2 vCPU/2 GB, seed 42) gives p95 ≈1,5 s at λ 4 and ≈3,0 s with ≈53 % errors, all 503, at λ 12 (504s need the 30-slot queue). Hook and model use the measured numbers. (c) L08 build time: took the pedagogy fix (Vite build 3 s → ≈4 s rebuild, task '< 5 s' kept) rather than raising the target to 20 s. (d) L06 visibility control: combined both critics – broker switch (technical) plus the neutral 'Rok za potvrdu' label (pedagogy). (e) 'avoidAnalogies' field: not in the output schema, so the avoided analogies moved out of analogies[] into a styleGuide list. (f) The Gateway API '500 on invalid backendRef' wording is now stated as spec fact (pedagogy critic verified it). (g) Postgres stays a StatefulSet for teaching, labelled with the managed-DB/operator recommendation (both critics). Nothing else rejected.

FOLLOW-UPS OUTSIDE THE JSON (repo owners): update docs/AUTHORING.md – §2 '25–35 min (lectures with a flagship simulation up to 40)', §3 deploy wording ('Deployment' object vs 'postavljanje (engl. deploy)'; 'isporuka' = delivery), 'podatci' rule, recap label „Što ste upravo vidjeli”; rename src/lectures/02-load-balancer to 04-load-balancer and align it with the radnik/potrošač terminology and the Python worker-pool framing; regenerate src/curriculum/data.ts (COURSE.tagline still says 'servera'). Version-sensitive items to re-verify at authoring: Node LTS, python slim, nginx-unprivileged, Postgres/RabbitMQ/dnsutils tags, GitHub Action SHAs, KEDA and ESO API versions, Gateway API and Argo CD install URLs, the exact 1.37 FailedScheduling text, AppProject sourceIntegrity field names.
