# Lecture 03 — Zašto raspodijeljeni sustavi – i što to košta
_Tri razloga za više računala i nova vrsta problema koju time kupujemo._ · ~35 min · module m1 · prerequisites: 02
Folder: `src/lectures/03-zasto-raspodijeljeni-sustavi/` · URL: `/predavanje/zasto-raspodijeljeni-sustavi`
Engines: E1 → src/engines/traffic/

## Continuity
- Previous lecture (02 Jedan poslužitelj u 12:00) ends with: Davor je poslužitelj povećao na četiri procesorske jezgre i 8 GB RAM-a. U petak u 12:03 pružatelj ima kvar napajanja i Klope nema dva sata, baš za ručak – a ispitni rok tek dolazi. „Kupimo drugi poslužitelj!”
- Next lecture (04 Load balancer: tko dijeli promet) opens with: Klopa ima tri poslužitelja: mali (1 vCPU, 2 GB), srednji (2 vCPU, 4 GB) i veliki (4 vCPU, 8 GB). Davor je najprije sve tri adrese stavio u DNS, ali DNS korisnike dijeli otprilike jednako – ne zna da je veliki poslužitelj četiri puta jači od malog, a kad jedan padne, klijenti njegovu adresu još minutama pamte. Zato postavlja load balancer s kružnim raspoređivanjem – i u 12:00 mali poslužitelj vraća greške dok veliki radi na četvrtini snage. Kako dijeliti promet pošteno?

## Hook (incident)
Dva sata bez Klope usred ručka. Davor predlaže: „Kupimo drugi poslužitelj!” Lana pita: „Hoće li onda biti dvostruko brže i dvostruko pouzdanije?” Prije kupnje pogledajmo što dobivamo kad aplikaciju raširimo na više računala – i što pritom plaćamo.

## Objectives (rendered by the page hero)
- navesti tri razloga za raspodijeljeni sustav: kapacitet, dostupnost i blizinu korisnicima
- izračunati dostupnost iz MTBF-a i MTTR-a te komponenti u nizu i paralelno i objasniti zašto kvarovi često nisu neovisni
- objasniti zašto deset poslužitelja ne daje deset puta veću propusnost
- objasniti djelomični kvar i zašto se spor poslužitelj ne može razlikovati od mrtvog
- procijeniti treba li aplikaciji uopće raspodijeljeni sustav

## Scenes
### 1. Tri razloga (animation)
- Concept: Capacity beyond the biggest machine, availability beyond one machine, proximity to users; scale up vs scale out; replication (same app ×N) vs decomposition (microservices). Term raspodijeljeni (also distribuirani) sustav.
- Visual: One tall server morphs into many short ones; three reason cards.
### 2. Trebate li ovo uopće? (interactive)
- Concept: Many apps run fine on one server; distribute only when load, availability or geography require it.
- Visual: Checklist producing a verdict.
### 3. Matematika devetki (interactive)
- Concept: A = MTBF/(MTBF+MTTR) (moved here from L02); series ΠAᵢ (2×99 % → 98,01 %); parallel 1−Π(1−Aᵢ) (2×99 % → 99,99 %); LB 99,99 % × app pair × single DB 99,9 % ≈ 99,88 %; 10 servers at 99 % → at least one down ≈9,6 % of the time.
- Visual: Scrubbable numbers inside formulas; small multiples for 1/2/3 replicas.
### 4. Zašto 10 × poslužitelja ≠ 10 × propusnosti (interactive)
- Concept: Shared bottleneck (DB); Amdahl p=0,95 → max 20× (model). USL α=0,05, β=0,001 → peak N≈31 then decline – in a closed DeepDive, labelled as a model.
- Visual: Add app servers until the DB bar saturates; Amdahl curve; USL curve with scrubbable α, β inside the DeepDive.
### 5. Spor ili mrtav? (interactive)
- Concept: Partial failure and the fallacies (lost, delayed, duplicated, reordered, partitioned); a slow node looks like a dead one; timeouts trade false alarms against waiting.
- Visual: Mini-game: pick a timeout against hidden faults (crash, GC pause, packet loss) and see false alarms vs user wait; six flip cards.
### 6. Dodajmo drugi poslužitelj (animation)
- Concept: Cliffhanger: DNS still points to server 1, so server 2 idles.
- Visual: Two servers, all dots to server 1, server 2 at 0 %.

## Flagship simulation: Arhitekt dostupnosti
Build Klopa as a chain (ulaz → poslužitelji aplikacije × N → baza), set availability, failure domain and capacity per component, then run a seeded 'godina u 10 sekundi'. Zadaci: „Dosegnite 99,9 % unutar budžeta”, „Pokažite da jedna baza od 99,9 % određuje cijeli lanac”, „Preživite kvar ormara”.

Controls:
- Dodaj/ukloni poslužitelj aplikacije (1–6)
- Klizač dostupnosti po komponenti (90–99,99 %)
- Prekidač „Isti ormar / isto napajanje”
- Klizač „Kapacitet po poslužitelju” (% vršnog prometa)
- Klizač „Vrijeme otkrivanja kvara”
- Gumb „Pokreni godinu”
- Gumbi za kvar: „Kvar ormara”, „Loša konfiguracija na svim poslužiteljima”

Model (exact rules):
Analytic: A = MTBF/(MTBF+MTTR); series ΠAᵢ; parallel (need ≥1 of n) 1−Π(1−Aᵢ). Monte Carlo: 8760 hourly steps rendered in 10 s, seeded; each component fails with MTTR 4 h and MTBF = MTTR·A/(1−A); 'isti ormar' adds a shared rack failure process taking down all members at once. N+1 rule: app tier counts as down during lunch hours (12–14 h weekdays) if surviving capacity < peak load. Each failure adds 'detection time' of downtime. 'Loša konfiguracija' fails all app servers for 1 h. Outputs: downtime h/yr next to the formula, lost lunches, €/mj. (linear, illustrative). Defaults: 2 app servers 99 %, each able to carry 70 % of peak, DB 99,9 %, entry 99,99 % → ≈99,88 %, and one failure overloads the survivor (100/70 ≈ 143 %).

Break it: With the rack toggle on, „Kvar ormara” takes both app servers down together; „Loša konfiguracija” shows redundancy does not help against the same mistake everywhere; at 70 % of peak per server, losing one server overloads the other (≈143 %).

Insight: Redundancy pays only when failures are independent and survivors have spare capacity; the single database dominates the chain; more machines also means more things that fail.

## Code artifacts
- availability.ts (typescript): MTBF/MTTR, series and parallel availability in ten lines
- ping i mtr do bliskog i dalekog poslužitelja (bash): Students measure real RTT; no hostnames hard-coded

## Misconceptions (Croatian myth + English correction)
- „Dvostruko poslužitelja = dvostruki kapacitet” — a shared component (the DB) caps throughput.
- „Raspodijeljeno je automatski pouzdanije” — more parts, more failures; reliability needs redundancy plus design.
- „Mreža je pouzdana i brza” — messages get lost, delayed, duplicated and reordered.
- „Dva poslužitelja od 99 % uvijek daju 99,99 %” — only with independent failures, failover and N+1 capacity.
- „Svaka aplikacija treba mikroservise i Kubernetes” — many apps run fine on one server; distribute only when load, availability or geography demand it.

## Key facts (verified; date-sensitive ones belong in fact callouts)
- [math] A = MTBF/(MTBF+MTTR). Two 99 % in series = 98,01 %; in parallel = 99,99 %; LB 99,99 % × app pair × DB 99,9 % ≈ 99,88 %.
- [sim-models] USL defaults α 0,05, β 0,001 → peak ≈31 nodes; Amdahl p 0,95 → max 20×; both labelled as models.

## Analogies (always with where they break down)
- Tim kolega koji komuniciraju samo porukama. Breaks down: people can phone and use intuition; machines only have timeouts.
- Više kuhara, jedan štednjak: more cooks don't help when the shared stove (DB) is the bottleneck. Breaks down: a DB can be replicated, a stove cannot be copied by software.

## Glossary terms introduced
Distributed system, Horizontal scaling

## Bridge to next (CostNote)
Drugi poslužitelj stoji i čeka jer DNS sve šalje na prvi. Davor u međuvremenu doda i treći: uz veliki (4 vCPU, 8 GB) Klopa sada ima mali (1 vCPU, 2 GB) i srednji (2 vCPU, 4 GB) poslužitelj. Netko mora dijeliti promet – i to pametno.
