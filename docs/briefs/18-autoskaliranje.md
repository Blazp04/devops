# Lecture 18 — Automatsko skaliranje: ručak bez dežurstva
_HPA, Cluster Autoscaler i skaliranje po dubini reda – Podovi u sekundama, čvorovi u minutama._ · ~40 min · module m4 · prerequisites: 17, 06
Folder: `src/lectures/18-autoskaliranje/` · URL: `/predavanje/autoskaliranje`
Engines: E2 → src/engines/queue/, E3 → src/engines/cluster/

## Continuity
- Previous lecture (17 Resursi i raspoređivanje: koliko mjesta treba Podu) ends with: Limiti drže curenje pod kontrolom, a requests su točni. Ali svaki dan u 11:45 Davor i dalje ručno upisuje `kubectl scale --replicas=12`. Na blagdanski ponedjeljak zaboravi – i u 12:05 prosječna narudžba čeka pet sekundi.
- Next lecture (19 Podatci koji preživljavaju: volumeni i StatefulSet) opens with: Postgres je radio u Deploymentu bez trajnog volumena i preselio se bez podataka. A kad je netko ranije postavio `replicas: 3`, dobili smo tri različite tablice narudžbi koje je Service nasumično miješao. Gdje u Kubernetesu žive podatci i kako bazi dati stalan identitet?

## Hook (incident)
Na blagdanski ponedjeljak nitko nije povećao broj replika i u 12:05 prosječna narudžba čeka pet sekundi (p95 ≈ 15 s). Na Ćevap-petak promet skoči s 20 na 100 zahtjeva u sekundi, a noću plaćamo prazne čvorove. Može li Klopa sama dodavati i uklanjati kapacitet – i koliko to traje?

## Objectives (rendered by the page hero)
- izračunati željeni broj replika formulom HPA-a i objasniti toleranciju i namjerno sporo smanjivanje broja replika
- objasniti zašto HPA mjeri iskorištenost u odnosu na `requests`
- objasniti kada Cluster Autoscaler dodaje čvorove i zašto to traje minutama
- skalirati potrošače reda (klopa-worker) po dubini reda i objasniti skaliranje na nulu
- procijeniti kompromis između rezerve kapaciteta, latencije i troška

## Scenes
### 1. Formula uživo (interactive)
- Concept: desired = ceil(cur × current/target); 3 Pods at 90 % with target 50 → 6; at 54 % → within 10 % tolerance → no change; max over metrics; sync 15 s.
- Visual: Scrubbable numbers.
### 2. Mjeri se prema requests (interactive)
- Concept: Utilisation = usage/request; no CPU request → HPA blind; limit = 2× request caps one step at ≈4×.
- Visual: Request bar vs usage.
### 3. Polako prema dolje (animation)
- Concept: Scale-down window 300 s; scale-up policies 100 % or +4 Pods per 15 s.
- Visual: Timeline with the window.
### 4. Podovi u sekundama, čvorovi u minutama (animation)
- Concept: Pending → CA (scan 10 s) → node (minutes) → pull → start → readiness; Karpenter (one line) provisions nodes directly from pending Pods; scale-down when requests < 50 % for 10 min; drain respects PodDisruptionBudget (voluntary only).
- Visual: Stacked lead-time bar.
### 5. Potrošači po dubini reda (interactive)
- Concept: KEDA: its operator handles 0↔1 (activation on the first message); the HPA it creates handles 1↔N with desired = ceil(queueLength / target); worker to zero at night; native HPA scale-to-zero beta in 1.37 only with object/external metrics.
- Visual: Queue depth vs worker count; worker waking from 0.
### 6. Vertikalno i trošak (text)
- Concept: Callout, one paragraph: VPA is a separate add-on (Off, Initial, Recreate, InPlaceOrRecreate; Auto deprecated); don't mix VPA and HPA on the same metric; headroom vs €/h.
- Visual: Small €/h vs p95 plot.

## Flagship simulation: Preživite ručak
E3 HPA + CA (SIM 4): a compressed day against klopa-api; the timeline annotates every HPA decision with its formula; a KEDA panel scales klopa-worker by queue depth. Zadaci: „p95 < 300 ms kroz nalet uz najmanji €/h”, „Objasnite zašto HPA stane na 9, a ne 10”, „Worker na 0 noću i natrag na prvu poruku”.

Controls:
- Segmented promet: stalni 20 / nalet 20→100 / dnevni val 10–80 / flash crowd 20→200
- HPA: ciljna iskorištenost, minReplicas, maxReplicas
- Klizač CPU requests (zadano 500m)
- Prekidač Cluster Autoscaler, min/max čvorova
- Prekidač „Hladna predmemorija slika”
- Brzina 1×–30×
- Gumbi za kvar: „Ukloni CPU request”, „maxReplicas = 4”, „Flash crowd uz najviše 6 čvorova”

Model (exact rules):
sim-models SIM 4. Sync 15 s; util = floor(100·Σusage(ready)/Σrequest(ready)); tolerance 0,1 → no change, else ceil(ratio·readyPods); unready Pods counted at 0 % when scaling up, missing metrics conservative; clamp [min,max]; stabilisation up 0 s, down 300 s (max of recs); up policy max(+100 %, +4 Pods)/15 s, down 100 %/15 s. App: request 500m/256Mi, limit 1000m, 25 ms CPU per request → 20 rps/Pod at 100 % of request, 40 at limit; target 50 % → 10 rps/Pod; min 2 max 20. Scrape = mean over 15 s. Pod start: schedule 1 s, pull 1 s cached / 6 s new node, app 10 s, readiness every 5 s. Traffic even over Ready Pods; ρ = perPod/capacityAtLimit; latency ≈ 50 ms/(1 − min(ρ,0,95)) labelled M/M/1 approximation; ρ>1 → 1 − 1/ρ dropped. Nodes 2 vCPU/8 GiB (1930m/6,1Gi), 3 app Pods each; start 2, group 2–6. CA scan 10 s; Pending → add nodes; provisioning 75 s ('stvarno: minute, ovisi o oblaku'); scale-down if max(cpu, mem request ratio) < 0,5 and Pods fit elsewhere, after 10 min unneeded and 10 min after last scale-up. KEDA: operator activates 0→1 on the first message; HPA desired = ceil(queue/10) for 1↔N; back to 0 after the cooldown with an empty queue. Validated spike at t=60: 2→3 (60), 3→7 (75, capped by +4), 7→9 (90); CA triggered t=80, node Ready t=155, all Ready ~t=180; stays 9 (util 55 %, ratio 1,10 within tolerance); load drop t=420 → back to 2 at t=720.

Break it: „Ukloni CPU request” blinds the HPA; „maxReplicas = 4” caps capacity and drops requests; a flash crowd with max 6 nodes leaves Pods Pending; a cold image cache lengthens every new node's lead time.

Insight: Autoscaling is a thermostat with inertia: Pods in seconds, nodes in minutes, scale-down deliberately slow; you buy time with headroom, and HPA sees usage only relative to requests.

## Code artifacts
- hpa.yaml (yaml): autoscaling/v2 with behavior
- kubectl get hpa -w (log): Watch decisions
- KEDA ScaledObject za RabbitMQ (yaml): Closed; verify API version when authoring
- pdb.yaml (yaml): Closed

## Misconceptions (Croatian myth + English correction)
- „HPA dodaje čvorove” — HPA adds Pods; the Cluster Autoscaler or Karpenter add nodes.
- „Cluster Autoscaler reagira na visok CPU” — it reacts to Pending Pods.
- „Skaliranje je trenutačno” — Pods take seconds, nodes minutes, and scale-down waits 300 s.
- „HPA ne može na nulu” — beta in 1.37 with object/external metrics; KEDA has done 0↔1 for years.
- „HPA na CPU-u može na nulu” — scale-to-zero needs object/external metrics.
- „HPA radi bez requests” — utilisation is usage/request.
- „VPA updateMode: Auto” — deprecated; use Recreate or InPlaceOrRecreate.
- „PDB štiti od pada čvora” — it covers only voluntary evictions.

## Key facts (verified; date-sensitive ones belong in fact callouts)
- [tech-facts] HPA: desiredReplicas = ceil(current × currentMetric/desiredMetric); sync 15 s; tolerance 0,1 (per-HPA configurable, GA 1.37); scale-down stabilisation 300 s; highest of multiple metrics wins; CPU/memory relative to requests.
- [tech-facts] metrics.k8s.io became v1 in 1.37; HPA scale-to-zero beta and on by default in 1.37, object/external metrics only.
- [tech-facts] VPA is a separate add-on (1.8.0); modes Off, Initial, Recreate (default), InPlaceOrRecreate (GA in VPA 1.6.0), InPlace (1.7.0); Auto deprecated since 1.5; don't combine VPA and HPA on the same metric.
- [tech-facts] Cluster Autoscaler scales node groups; Karpenter provisions nodes from pending Pods; KEDA (CNCF graduated, 70+ scalers) handles 0↔1 itself and drives an HPA for 1↔N.
- [tech-facts] PDB covers only voluntary disruptions through the Eviction API.

## Analogies (always with where they break down)
- Termostat s inercijom: grijanje se uključi odmah, a soba se zagrije kasnije. Breaks down: HPA works in discrete steps and depends on requests; nodes are bought, not heated.

## Glossary terms introduced
HorizontalPodAutoscaler, Cluster Autoscaler

## Bridge to next (CostNote)
Cluster Autoscaler je noću ispraznio i uklonio jedan čvor. Na njemu je bio Postgres, koji je Iva pokrenula „kao i sve ostalo” – u Deploymentu. Pod se preselio, a ujutro su sve narudžbe nestale.
