# Lecture 12 — Pod: najmanja jedinica i njezino zdravlje
_Životni ciklus Poda, ponovna pokretanja i tri pitanja koja Kubernetes postavlja aplikaciji._ · ~40 min · module m3 · prerequisites: 11, 05
Folder: `src/lectures/12-pod/` · URL: `/predavanje/pod`
Engines: E3 → src/engines/cluster/

## Continuity
- Previous lecture (11 Klaster iznutra: što se dogodi nakon kubectl apply) ends with: Lana je ispravila tag i Podovi s `klopa-api` pišu `Running` i `1/1` – ali narudžbe ne prolaze. Aplikacija 40 sekundi puni predmemoriju, kontejner se prije toga ruši, a kubelet ga podiže sve sporije: nakon 10, 20 pa 40 sekundi. Što je točno Pod i kako Kubernetes zna je li aplikacija zdrava?
- Next lecture (13 Deployment: replike, nove verzije i povratak) opens with: Goli Pod je nestao i nitko ga nije vratio. Klopi trebaju četiri replike API-ja koje se same obnavljaju, a u 11:00 mora izaći verzija 1.4.0 s vegetarijanskim menijem – dok studenti naručuju. Kako zamijeniti sve Podove novom verzijom, a da nijedna narudžba ne propadne?

## Hook (incident)
Podovi s klopa-api naizmjence pišu Running 1/1 i CrashLoopBackOff 0/1, a od 3057 zahtjeva u 150 s nije prošao nijedan: aplikacija 40 sekundi puni predmemoriju, a kubelet je prije toga gasi i ponovno pokreće nakon 10, 20 pa 40 sekundi. A Pod klopa-worker koji je Lana obrisala da ga ponovno pokrene nikad se nije vratio. Što je Pod i kako Kubernetes razlikuje „radi” od „spreman je”?

## Objectives (rendered by the page hero)
- objasniti što je Pod: jedan ili više kontejnera koji dijele IP adresu i volumene
- prepoznati vrijednosti u stupcu STATUS naredbe `kubectl get pods` (Pending, ContainerCreating, ImagePullBackOff, Running, CrashLoopBackOff) i razlikovati ih od faze Poda i uvjeta Ready
- razlikovati provjere pokretanja, živosti i spremnosti te predvidjeti što se događa kad koja ne prođe
- objasniti zašto provjera živosti ne smije provjeravati bazu i zašto ni provjera spremnosti ne smije pasti zbog zajedničke ovisnosti
- objasniti zašto se goli Pod ne vraća i zašto novi Pod ima novo ime i adresu
- pročitati osnovni manifest Poda s oznakama

## Scenes
### 1. Stan s cimerima (animation)
- Concept: Containers in a Pod share IP/localhost and volumes; one main concern per Pod (web + DB would scale together); first manifest with labels; note on `requests`: „objašnjavamo u 17. predavanju; zasad: koliko Pod rezervira na čvoru”.
- Visual: Pod as apartment; annotated YAML; -l app=klopa-api highlights matches.
### 2. Životni ciklus i pad (animation)
- Concept: Phase: Pending → Running → Succeeded/Failed. kubectl's STATUS column shows a reason instead: Pending (not scheduled); ContainerCreating or ImagePullBackOff (scheduled, phase still Pending); Running; CrashLoopBackOff (phase usually Running, container waiting to restart). Ready is a separate condition (READY 0/1 → 1/1). restartPolicy Always; CrashLoopBackOff 10 s → 20 s → 40 s … max 300 s, reset after 10 min; restart count +1, same Pod.
- Visual: Pod shape with three labelled lines (faza / STATUS / READY) changing independently; back-off ring doubling.
### 3. Tri pitanja zdravlja (animation)
- Concept: Startup (others wait until it succeeds), liveness „jesi li zaglavio?” (fail → restart), readiness „možeš li sada služiti?” – warm-up, own state, load shedding (fail → removed from traffic, no restart); httpGet 200–399, tcpSocket, exec exit 0, grpc SERVING; defaults period 10 s, timeout 1 s, failureThreshold 3.
- Visual: Three probe lanes with ✓/✕ ticks.
### 4. Kaskada (interactive)
- Concept: Liveness that checks the DB + DB outage → every Pod restarts → outage worse; readiness that checks the DB → every Pod NotReady at once → 0 endpoints, clients get connection errors instead of a clear 503. Correct: liveness asks only about the process; readiness about this Pod; on a shared DB outage stay Ready and answer 503/degraded quickly.
- Visual: Three Pods restarting simultaneously; then three Pods greyed out of traffic; then the correct setup answering 503.
### 5. Pomoćnici: init i sidecar (text)
- Concept: Closed DeepDive: init containers run to completion first; native sidecar = initContainer with restartPolicy: Always (GA 1.33): starts before, stops after, may have probes.
- Visual: Timeline lanes inside the DeepDive.
### 6. Goli Pod (interactive)
- Concept: Delete it or lose its node for longer than the eviction timeout → gone; a new Pod has a new name and IP; replace, don't repair.
- Visual: Pod vanishes, nothing returns.

## Flagship simulation: Laboratorij zdravlja Poda
E3: three bare klopa-api Pods and a traffic source that sends only to Ready Pods (like the L05 load balancer); choose app behaviour, configure probes, watch probe lanes, restart counter, phase/STATUS/Ready and back-off ring. Zadaci: „Spori start (40 s) do Ready bez ubijanja”, „Zaglavljeni proces neka se sam oporavi”, „Ispad baze od 60 s bez ijednog restarta i bez 0 endpointa”, „Dijagnosticirajte tri Poda iz stupca STATUS”.

Controls:
- Segmented ponašanje: zdrava / spori start 40 s / ruši se pri pokretanju / zaglavi nakon 60 s / ovisi o bazi
- Po provjeri (startup, liveness, readiness): uključi, endpoint /healthz (samo proces) ili /ready (zagrijan, bez baze) ili /ready-db (provjerava bazu), initialDelaySeconds, periodSeconds, failureThreshold
- Segmented slika: dobar tag / krivi tag
- Gumbi za kvar: „Zaglavi proces”, „Baza pala 60 s”, „Obriši Pod”, „Ugasi čvor”

Model (exact rules):
Real defaults: periodSeconds 10, timeoutSeconds 1, successThreshold 1, failureThreshold 3, initialDelaySeconds 0 (sim may compress ×5 with badge). Startup: until success liveness/readiness don't run; failureThreshold fails → kill, restartPolicy applies. Liveness fails ×threshold → container restarted (count +1, same name/IP). Readiness fail → Ready=False → no traffic, no restart. No readiness probe → Ready as soon as container starts (warm-up errors). Back-off 10, 20, 40 … 300 s, reset after 10 min clean. Wrong tag → phase Pending, STATUS ImagePullBackOff; crash at start → phase Running, STATUS CrashLoopBackOff. Behaviours: slow start → /healthz and /ready fail 40 s; deadlock → alive process, endpoints time out; /ready-db returns 503 while DB down, /healthz and /ready stay OK while the app itself answers 503 on order requests; crash at start → exit 1 after 2 s. DB 60 s outage: liveness on /ready-db → all three Pods restart after ~30 s and keep failing until DB returns; readiness on /ready-db → all NotReady → 0 targets, clients see connection errors (anti-pattern); liveness /healthz + readiness /ready → no restarts, Pods stay Ready and answer 503 quickly, recovery is instant. Bare Pods: deleted, or node off longer than the 300 s toleration → never recreated. Traffic 20 rps evenly over Ready Pods.

Break it: Liveness on /ready-db + „Baza pala 60 s” restarts all Pods at once; readiness on /ready-db empties the traffic target list; slow start with aggressive liveness and no startup probe → CrashLoopBackOff; no readiness probe sends traffic to warming Pods; a deleted bare Pod is gone forever.

Insight: A dead process restarts itself; a stuck one needs a question – and the wrong question turns a blip into an outage; Pods are replaced, never repaired, so something must recreate them.

## Code artifacts
- pod.yaml s oznakama, provjerama i requests (yaml): First real manifest (containerPort 8000); note that requests are explained in L17
- /healthz i /ready (python): Liveness: only 'is this process alive' (no dependencies). Readiness: 'can this Pod serve right now' (warm-up, own state, load shedding). Do not fail readiness on a shared dependency such as the DB; stay Ready and return 503 or a degraded response.
- kubectl get pods -w, logs --previous, describe (bash): Reading STATUS, READY and CrashLoopBackOff
- Pod s nativnim sidecarom (yaml): Closed (DeepDive)

## Misconceptions (Croatian myth + English correction)
- „Pod je kontejner” — one or more containers sharing an IP and volumes.
- „Pod se popravi na mjestu i zadrži IP” — containers restart in place, but a replacement Pod has a new name and IP.
- „Web i bazu stavimo u isti Pod” — they would scale and be replaced together.
- „Provjera živosti treba provjeravati bazu” — a DB blip then restarts every Pod at once.
- „Provjera spremnosti neka provjerava bazu” — a shared outage makes every Pod NotReady at once and leaves 0 endpoints; answer 503 instead.
- „Neuspjela provjera spremnosti restarta Pod” — it only removes the Pod from traffic.
- „Bez provjera Kubernetes zna kad je aplikacija spremna” — without a readiness probe a Pod is Ready as soon as its container starts.
- „STATUS je faza Poda” — STATUS shows a reason (ImagePullBackOff, CrashLoopBackOff) while the phase may be Pending or Running.
- „Sidecar je samo još jedan kontejner u containers” — native sidecars are initContainers with restartPolicy: Always (GA 1.33; DeepDive).

## Key facts (verified; date-sensitive ones belong in fact callouts)
- [tech-facts] Liveness failure restarts the container; readiness failure removes the Pod from Service traffic without restart; startup probe disables the others until it succeeds.
- [tech-facts] Pod phases: Pending, Running, Succeeded, Failed (Unknown); ImagePullBackOff and ContainerCreating occur in phase Pending; Ready is a Pod condition.
- [tech-facts] Probe success: httpGet 200–399, exec exit 0, grpc SERVING, tcpSocket connect.
- [tech-facts] Native sidecars (initContainers with restartPolicy: Always) GA in 1.33; they don't block Job completion.
- [sim-models] CrashLoopBackOff 10 s, 20 s, 40 s … capped at 300 s, reset after 10 min; probe defaults 10 s / 1 s / 1 / 3 / 0; terminationGracePeriodSeconds 30.

## Analogies (always with where they break down)
- Pod kao stan s cimerima (zajednička adresa i hladnjak). Breaks down: Pods are not long-lived homes; they are replaced, not repaired.

## Glossary terms introduced
Pod, Label, CrashLoopBackOff, Liveness probe, Readiness probe

## Bridge to next (CostNote)
Noćas je čvor node-2 bio nedostupan dulje od pet minuta. Kubernetes je Podove s njega izbacio, a goli Pod s API-jem nitko nije ponovno stvorio. A Petra javlja: „Vegetarijanski meni mora biti vani danas u 11:00 – bez gašenja stranice.”
