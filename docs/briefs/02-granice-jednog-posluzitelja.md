# Lecture 02 — Jedan poslužitelj u 12:00
_Propusnost, latencija i percentili – i zašto jači poslužitelj pomaže samo do neke mjere._ · ~35 min · module m1 · prerequisites: 01
Folder: `src/lectures/02-granice-jednog-posluzitelja/` · URL: `/predavanje/granice-jednog-posluzitelja`
Engines: E1 → src/engines/traffic/

## Continuity
- Previous lecture (01 Put jednog zahtjeva) ends with: Klopa sada radi na iznajmljenom poslužitelju s dvije procesorske jezgre i 2 GB RAM-a i Petra je napokon vidi. Ponedjeljak, 12:00 – cijeli kampus otkrio je Klopu, a stranica se počinje vući.
- Next lecture (03 Zašto raspodijeljeni sustavi – i što to košta) opens with: Dva sata bez Klope usred ručka. Davor predlaže: „Kupimo drugi poslužitelj!” Lana pita: „Hoće li onda biti dvostruko brže i dvostruko pouzdanije?” Prije kupnje pogledajmo što dobivamo kad aplikaciju raširimo na više računala – i što pritom plaćamo.

## Hook (incident)
Ponedjeljak, 12:00. Klopa radi na poslužitelju s dvije procesorske jezgre i 2 GB RAM-a. U 11:58 p95 je oko 1,6 s, a u 12:00 skoči na 3 s i otprilike svaki drugi zahtjev dobiva grešku 503 jer je red pun. Davor otvori htop: procesor je na 17 %. Kako poslužitelj može biti pun dok procesor odmara?

## Objectives (rendered by the page hero)
- opisati opterećenje propusnošću, latencijom (p50, p95, p99), stopom grešaka i iskorištenošću
- objasniti zašto procesorske jezgre određuju propusnost, a RAM koliko radnika (zahtjeva) istodobno stane
- predvidjeti nagli rast latencije kad se iskorištenost približi 100 %
- procijeniti kada vertikalno skaliranje pomaže i prepoznati jedinstvenu točku kvara
- izračunati dopuštenu nedostupnost iz postotka dostupnosti

## Scenes
### 1. Što poslužitelj radi sa zahtjevom (animation)
- Concept: Worker-pool server: each in-flight request holds a radnik (engl. worker) process (RAM) and needs CPU time; while waiting on the DB it holds RAM but no CPU; W = floor((RAM−512 MB)/256 MB). Visible Callout „Model”: Klopin API je Django iza gunicorna sa sinkronim radnicima – jedan radnik obrađuje jedan zahtjev i zauzima ≈256 MB (kao PHP-FPM ili Puma). DeepDive „A Node.js, Go, async Python?”: one process serves many requests concurrently with async I/O; JavaScript runs on one core per process (scale with a process per core or more Pods), and concurrency is usually capped by the DB connection pool.
- Visual: Server glyph with vCPU lanes, RAM worker slots and a small queue; one request's life as a shrinking CPU clock, then I/O wait.
### 2. Prosjek laže (interactive)
- Concept: Nearest-rank percentiles over successful requests only; the mean hides the tail.
- Visual: Latency histogram with a draggable tail; mean barely moves while p99 explodes.
### 3. Hokejaška palica (interactive)
- Concept: Labelled 'model M/M/1 (jedan poslužitelj, slučajni dolasci i trajanja)': W/S = 1/(1−ρ) – 2× at 0,5, 3,3× at 0,7, 5× at 0,8, 10× at 0,9, 100× at 0,99; caused by randomness. With c parallel workers the knee moves right (Erlang C, c=4 at ρ=0,95 → ≈5,5×, not 20×) but is still there. Little's law in a DeepDive.
- Visual: Utilisation slider drives the curve with a „vi ste ovdje” dot; predict the shape first; toggle c = 1 / 4.
### 4. Jezgre ili RAM? (interactive)
- Concept: Validated: 2 vCPU, API preset ≈10 rps at 2/4/8 GB; I/O preset 2 GB ≈5,7 rps at ~15 % CPU, 4 GB ≈13, 8 GB ≈27.
- Visual: Same server, two workload tabs, RAM selector, goodput bar.
### 5. Veći poslužitelj (interactive)
- Concept: Vertical scaling: each resize = restart gap; catalogue ends at „Nema većeg”; price per vCPU roughly linear within an instance family – limits are the ceiling, the restart and the SPOF.
- Visual: Catalogue cards 1→8 vCPU, 2→16 GB with €/mj.; resize animation with a grey downtime band.
### 6. Izvucite utikač (animation)
- Concept: SPOF; downtime table 99 % = 87,6 h/god., 99,9 % = 8,76 h (43,2 min/30 dana), 99,99 % = 52,6 min, 99,999 % = 5,3 min. (A = MTBF/(MTBF+MTTR) moves to L03.)
- Visual: Plug pulled, all dots fail; table with scrubbable nines.

## Flagship simulation: Jedan poslužitelj protiv ručka
E1 with one worker-pool server under Poisson traffic. Zadaci: „Preživite 12:00 uz p95 < 1 s i < 1 % grešaka na najjeftinijem poslužitelju”, „Pronađite opterećenje za koje više RAM-a ne pomaže”. Incident card preset: I/O, 2 vCPU/2 GB, λ 4 → nalet ×3, seed 42.

Controls:
- Klizač „Promet” 1–50 zahtjeva/s
- Gumb „Nalet u 12:00”
- Segmented opterećenje: API / I/O (čeka bazu) / CPU (obrada fotografija)
- vCPU: 1, 2, 4, 8
- RAM: 1, 2, 4, 8, 16 GB
- Gumb „Veći poslužitelj”
- Gumb „Izvuci utikač”
- Napredno: „Neograničeni radnici”, duljina reda 10–30
- Gumb „Ponovi isti promet”

Model (exact rules):
sim-models SIM 1, single server. DT 10 ms, seeded mulberry32, Poisson arrivals (default λ 10, burst ×3 for 30 s). Presets (cpuMs exponential mean / ioMs fixed / memMB): API 200/300/256, I/O 50/1000/256, CPU 400/50/256. BASE_RAM 512 MB; W = max(1, floor((RAM−512)/memMB)) → 1 GB:2, 2:6, 4:14, 8:30, 16:62. Admit if inflight<W, else queue (QUEUE_MAX 10), else 503. Per tick share = min(1, vCPU/nCpu) (one request never uses >1 core); cpu then io; queued age > 5000 ms → 504; completed after timeout → 504 'wasted work'. No proxy yet: crash = connection refused (counted as 'odbijeno'). Unbounded workers: BASE + inflight·mem > RAM → OOM crash, restart after 6 s. Resize: down 20 s sim (badge 'stvarno: minute'). Metrics: goodput 5 s window; errors 10 s split 503/504/odbijeno; p50/p95/p99 nearest-rank over last 10 s successes, 'n/a' if n<20; CPU%, busy/W, RAM. Validated: API preset ≈10 rps regardless of RAM; I/O preset 2 GB ≈5,7 rps at ~15 % CPU, 4 GB ≈13, 8 GB ≈27 (λ 30); unbounded on 1 vCPU/2 GB at λ 4 → ~11 OOM crashes in 120 s, goodput ~0,8 vs ~4 rps bounded. Hook numbers (prototype lb-sim, I/O preset, 2 vCPU/2 GB, seed 42): λ 4 → p95 ≈1,5 s, 0 % errors, CPU ≈12 %; λ 12 → goodput 5,6–5,7 rps, p95 ≈3,0 s, ≈53 % errors – all 503 (queue full), CPU ≈15–16 %. With QUEUE_MAX 10 overload yields 503s; 504s appear only with a longer queue (Napredno 30 → bufferbloat, goodput collapses). Cost linear per vCPU, labelled 'ilustrativno'.

Break it: „Izvuci utikač” takes availability to zero; „Neograničeni radnici” turns 2 GB into an OOM crash loop; every resize shows a downtime gap and the catalogue ends with „Nema većeg”; a 30-slot queue turns 503s into 504s and wasted work.

Insight: A server can be full while its CPU idles, because RAM bounds how many workers fit; more RAM does nothing for a CPU-bound app; latency explodes near 100 %; one machine is always a single point of failure.

## Code artifacts
- Broj radnika: gunicorn / PHP-FPM i usporedba s Node.js (ini): Tab 1: gunicorn `workers` – usual start 2×jezgre+1, upper bound slobodni RAM / veličina procesa (`pm.max_children` for PHP-FPM); the sim assumes workers fill RAM. Tab 2 (contrast): Node PM2 `instances` = broj jezgri, `pg.Pool({ max: 10 })` = limit on concurrent DB queries
- k6 test opterećenja (javascript): 10-line load test reproducing the 12:00 burst
- htop i free -m (text): Annotated snapshot: low CPU, all gunicorn workers busy

## Misconceptions (Croatian myth + English correction)
- „Više RAM-a = brži poslužitelj” — for this app server RAM bounds concurrency and cores bound throughput; for a database RAM is cache (page cache, shared_buffers) and does speed up reads (L05, L19).
- „Latencija raste linearno s opterećenjem” — it grows like 1/(1−ρ) in M/M/1; more workers move the knee, they don't remove it.
- „Prosječna latencija je dovoljna” — watch p95/p99; the mean hides the tail.
- „Vertikalno skaliranje je zastarjelo” — often the right first move; its limits are the ceiling, the restart gap and the SPOF.
- „70 % CPU-a znači 30 % rezerve” — in M/M/1 at 70 % the wait is already 3,3× the service time; more cores move the knee, they don't remove it.

## Key facts (verified; date-sensitive ones belong in fact callouts)
- [sim-models] Validated single-server numbers listed in the model (incl. hook preset and seed).
- [math] Downtime: 99 % = 87,6 h/yr; 99,9 % = 8,76 h/yr (43,2 min per 30 days); 99,99 % = 52,6 min/yr; 99,999 % = 5,3 min/yr.
- [math] M/M/1 W/S = 1/(1−ρ): 3,3× at 0,7; Erlang C c=4 at ρ 0,95 ≈5,5×.
- [sim-models] In the cloud price per vCPU is roughly linear within an instance family – do not draw an exponential cost curve.

## Analogies (always with where they break down)
- Jedan kuhar u kuhinji: procesorske jezgre su ruke, RAM je pult na koji stane ograničen broj narudžbi. Breaks down: a cook tires gradually; a server can fall over suddenly (OOM) or fail silently.

## Glossary terms introduced
Throughput, Percentile, Vertical scaling, Single point of failure, Availability

## Bridge to next (CostNote)
Davor je poslužitelj povećao na četiri procesorske jezgre i 8 GB RAM-a. U petak u 12:03 pružatelj ima kvar napajanja i Klope nema dva sata, baš za ručak – a ispitni rok tek dolazi. „Kupimo drugi poslužitelj!”
