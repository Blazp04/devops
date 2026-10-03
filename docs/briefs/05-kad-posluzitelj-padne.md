# Lecture 05 — Kad poslužitelj padne: provjere ispravnosti i gdje živi stanje
_Kvar se nikad ne otkrije odmah, a košarica u memoriji poslužitelja nestaje s njim._ · ~35 min · module m1 · prerequisites: 04
Folder: `src/lectures/05-kad-posluzitelj-padne/` · URL: `/predavanje/kad-posluzitelj-padne`
Engines: E1 → src/engines/traffic/

## Continuity
- Previous lecture (04 Load balancer: tko dijeli promet) ends with: S težinskim raspoređivanjem ručak je preživio, a nakon pokusa „Sporiji procesor” Davor je prešao na „najmanje veza”. Ali u 12:03 procesu na Velikom ponestane memorije i sruši se, a load balancer mu još nekoliko sekundi šalje narudžbe. Usto, studenti se žale: „Košarica mi se sama ispraznila!”
- Next lecture (06 Redovi poruka i događaji) opens with: SMS-gateway odgovara sve sporije, a API čeka svaki SMS, pa zapinju i narudžbe. Na Ćevap-petak narudžbe deset sekundi stižu po 15 u sekundi (inače dvije), a API ih istodobno može obrađivati samo četiri – od 445 narudžbi tog ručka izgubi se 152. Lana doda ponovne pokušaje – i teta Mira iz kuhinje viče: „Dvaput ćevapi za istu narudžbu?!” Kako odvojiti primanje narudžbe od posla koji slijedi, a da se ništa ne izgubi ni ne udvostruči?

## Hook (incident)
12:03, procesu na Velikom ponestalo je memorije i srušio se. Nakon pokusa „Sporiji procesor” Davor je prešao na algoritam „najmanje veza” – i propalo je 37 narudžbi prije nego što je load balancer shvatio što se dogodilo. Istodobno studenti javljaju da im se košarica ispraznila i da su odjavljeni. Zašto load balancer kasni i gdje bi zapravo trebala živjeti košarica?

## Objectives (rendered by the page hero)
- objasniti kako aktivne i pasivne provjere ispravnosti otkrivaju kvar i koliko to traje
- po simptomima razlikovati pad procesa, gašenje stroja, zastoj i pražnjenje poslužitelja
- objasniti zašto zalihost bez slobodnog kapaciteta (N+1) ne štiti
- objasniti zašto ljepljive sesije nisu rješenje i zašto stanje treba premjestiti u Redis ili bazu
- objasniti zašto baza postaje usko grlo i kako pomaže predmemorija

## Scenes
### 1. Prozor otkrivanja (animation)
- Concept: Active check: unhealthy after U consecutive failures → detection between (U−1)·interval and U·interval (+timeout if hung). AWS ALB defaults 30 s / 5 s / healthy 5 / unhealthy 2 → detection ≈30–60 s after a crash, up to ≈65 s for a hung target; back in rotation only after 5 passing checks (≈150 s).
- Visual: Timeline with probe ticks and a red window of failed requests; badge „2 s (sim) · stvarno: 30 s (AWS ALB)”.
### 2. Pad, gašenje, zastoj ili pražnjenje (interactive)
- Concept: Process crash → port closed → RST → instant 502; machine off → no RST, the LB waits for its connect timeout → 502/504, like a hang; hang → requests wait until timeout → 504 (hollow); drain → no new requests, in-flight finish. Callback to L01 refused vs timeout.
- Visual: Four servers react side by side to the same traffic.
### 3. Crna rupa (interactive)
- Concept: Least connections + fast-failing server attracts traffic; crash the S3 process at λ 15: RR 11 vs LC 37 failures; passive ejection and LB retry fix it; N+1: survivors at 100 % of capacity.
- Visual: Dead server with 0 active pulling dots; capacity bars overflowing.
### 4. Gdje živi košarica (interactive)
- Concept: In-memory session → next request elsewhere = „sesija izgubljena”; sticky cookie → uneven load, lost on crash, no rebalance on scale-out; Redis (Django SESSION_ENGINE with the Redis cache) → stateless app servers. (Kubernetes' IP-based affinity comes in L14.)
- Visual: 20 users with cart stacks drawn wherever state lives.
### 5. Kamera prelazi na bazu (animation)
- Concept: State moved to the DB → DB is the new bottleneck and SPOF; cache-aside: h 0,9, cache 1 ms, DB 20 ms → avg 3 ms, 10 % DB load. Closed DeepDive: read replicas scale reads not writes; async lag breaks read-your-writes; CAP applies only during a partition.
- Visual: Pan to DB; hit-ratio slider; in the DeepDive a replica-lag slider shows a stale read.
### 6. Tko balansira load balancer? (text)
- Concept: Callout: the LB is itself a SPOF: HA pair with a floating IP (VRRP), DNS with several records (slow failover), anycast, managed cloud LBs.
- Visual: Small figure: two LBs; the floating VIP moves on failure.

## Flagship simulation: Ugasite poslužitelj usred ručka
The L04 rack with active/passive health checks, LB retry, per-server failure buttons and 20 users with carts. Zadaci: „Preživite pad procesa na S3 pri λ = 15 uz < 2 % grešaka”, „Ispraznite S2 bez ijedne neuspjele narudžbe”, „Nula izgubljenih sesija nakon pada bilo kojeg poslužitelja”. Incident card: λ 15, Najmanje veza, crash S3, seed 42.

Controls:
- Po poslužitelju: „Sruši proces”, „Ugasi stroj”, „Zamrzni”, „Isprazni”, „Ponovno pokreni”
- Klizači provjere: interval (1–10 s sim), prag neuspjeha (1–5)
- Prekidač „Pasivna provjera”
- Prekidač „Ponovni pokušaj na load balanceru”
- Segmented sesije: lokalno / ljepljivo / Redis
- Algoritam iz L04
- Gumbi za kvar: „Ugasi Redis”, „Ugasi load balancer”

Model (exact rules):
sim-models SIM 1 lifecycle. Active check per server every 2 s sim (staggered), timeout 1 s; pass iff process Up; Unhealthy after 2 fails, Healthy after 2 passes; restarted servers start Unhealthy. Process crashed → port closed, routed requests get 502 at once. Machine off → no RST: new connections wait the LB connect timeout (1 s sim; badge 'NGINX proxy_connect_timeout zadano 60 s') then 502, in-flight requests hang until the 5 s client timeout → 504, probes time out. Hung → park until 5 s client timeout → 504, probes time out. Draining → no new routing, show „sigurno za uklanjanje” when inflight+queue = 0. Crashed → 6 s → Starting (3 s warm-up, probes fail) → Up. Passive: any 502/504 → eject 10 s (NGINX max_fails=1, fail_timeout=10s). LB retry: on 502 before processing, retry once elsewhere. No healthy target → 503 (toggle fail-open = ALB behaviour). Sessions: 20 users, random user per request; local store dies with its server; no affinity + local → „sesija izgubljena”; cookie affinity set on first request, reassigned if unhealthy; Redis → no loss, but Redis down → every session read fails. Validated: process crash on S3 at λ15 → RR 11, LC 37 failures in the detection window; afterwards cluster at 100 % of remaining capacity.

Break it: „Sruši proces” under least connections shows the black hole; „Ugasi stroj” and „Zamrzni” fill queues with hollow 504s; „Ugasi Redis” logs everyone out at once – shared state is the new SPOF; „Ugasi load balancer” takes everything down.

Insight: Failure detection always has a window; a crashed process, a dead machine, a hang and a drain look different; redundancy needs spare capacity; stateless servers are interchangeable, but state moves into the database, which becomes the hard part.

## Code artifacts
- nginx: max_fails, fail_timeout, proxy_next_upstream (nginx): Passive checks and retry; note active checks need NGINX Plus, HAProxy, Envoy or a cloud LB
- /healthz view (python): Minimal Django health endpoint
- Sesije u Redisu (diff): Django settings: default DB sessions → SESSION_ENGINE cache + django.core.cache.backends.redis.RedisCache

## Misconceptions (Croatian myth + English correction)
- „Load balancer odmah zna da je poslužitelj pao” — only after U consecutive failed checks: (U−1)·interval to U·interval, plus the timeout when the server hangs.
- „Load balancer uklanja jedinstvenu točku kvara” — it is one unless it is redundant itself.
- „Ljepljive sesije rješavaju stanje” — they skew load, lose sessions on crash and don't rebalance on scale-out; move state to Redis/DB.
- „Bez stanja znači da aplikacija nema podataka” — the state lives elsewhere (Redis, DB).
- „Replike za čitanje skaliraju i pisanje” — every write still goes to the primary; replicas lag and can return stale reads (DeepDive).
- „CAP: uvijek birate dva od tri” — the trade-off applies only during a partition (DeepDive).

## Key facts (verified; date-sensitive ones belong in fact callouts)
- [sim-models] AWS ALB health checks: 30 s interval, 5 s timeout, healthy 5, unhealthy 2 → detection ≈30–60 s (≈65 s hung), re-entry ≈150 s; deregistration delay 300 s; fails open when all targets unhealthy.
- [sim-models] NGINX passive: max_fails=1, fail_timeout=10s; proxy_connect_timeout default 60 s.

## Analogies (always with where they break down)
- Vlastiti bicikl i gradski romobili: a broken scooter is swapped, not repaired. Breaks down: databases and other stateful systems keep identity (L19).

## Glossary terms introduced
Health check, Stateless service

## Bridge to next (CostNote)
Poslužitelji aplikacije sada su zamjenjivi, a stanje živi u Postgresu i Redisu. No API sve radi sinkrono: spremi narudžbu, upiše listić za kuhinju i pošalje SMS – i tek onda odgovori. Ćevap-petak, 12:00: deset sekundi stiže po petnaest narudžbi u sekundi, a SMS-gateway počne kasniti.
