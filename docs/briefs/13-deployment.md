# Lecture 13 — Deployment: replike, nove verzije i povratak
_Kako Kubernetes drži N replika živima i uvodi novu verziju bez gašenja – i zašto se sam ne vraća._ · ~40 min · module m3 · prerequisites: 12
Folder: `src/lectures/13-deployment/` · URL: `/predavanje/deployment`
Engines: E3 → src/engines/cluster/

## Continuity
- Previous lecture (12 Pod: najmanja jedinica i njezino zdravlje) ends with: Noćas je čvor node-2 bio nedostupan dulje od pet minuta. Kubernetes je Podove s njega izbacio, a goli Pod s API-jem nitko nije ponovno stvorio. A Petra javlja: „Vegetarijanski meni mora biti vani danas u 11:00 – bez gašenja stranice.”
- Next lecture (14 Service: stalna adresa za prolazne Podove) opens with: klopa-web je imao upisanu IP adresu jednog API Poda. Nakon uvođenja verzije 1.4.0 taj Pod više ne postoji i web vraća greške. Treba nam jedno stalno ime – ali što se krije iza njega i dijeli li promet kao load balancer iz četvrtog predavanja?

## Hook (incident)
Goli Pod je nestao i nitko ga nije vratio. Klopi trebaju četiri replike API-ja koje se same obnavljaju, a u 11:00 mora izaći verzija 1.4.0 s vegetarijanskim menijem – dok studenti naručuju. Kako zamijeniti sve Podove novom verzijom, a da nijedna narudžba ne propadne?

## Objectives (rendered by the page hero)
- objasniti lanac Deployment → ReplicaSet → Podovi i kako omogućuje samooporavak i skaliranje
- predvidjeti koja promjena stvara novi ReplicaSet
- izračunati granice postupnog ažuriranja iz `maxSurge` (zaokružuje se naviše) i `maxUnavailable` (zaokružuje se naniže)
- objasniti zašto pokvarena verzija zastaje umjesto da se vrati i kako napraviti rollback
- razlikovati objekt Deployment, postavljanje (deploy) i izdanje

## Scenes
### 1. Lanac vlasništva (animation)
- Concept: Opening Callout „Tri riječi”: Deployment (object) vs postavljanje (act) vs izdanje (release, L20). Deployment → ReplicaSet → Pods via ownerReferences; selector = template labels; kill Pods → ghosts filled; relabel a Pod → it escapes and a new one appears; replicas ≠ machines (full nodes → Pending).
- Visual: Callout with three cards; ownership tree with ghosts; replicas slider.
### 2. Što stvara novi ReplicaSet? (interactive)
- Concept: Changing replicas scales the existing RS; changing image/env creates a new pod-template-hash and RS. Predict, then run.
- Visual: Predict card, then the tree updates.
### 3. Dva ReplicaSeta u suprotnim smjerovima (animation)
- Concept: Rolling update N=4 (surge 1, unavailable 1); gauges available ≥ N − unavailable, total ≤ N + surge; gated by Ready; both versions serve at once (compatibility!).
- Visual: v1 blue / v2 violet Pods; request stream coloured by version.
### 4. Ograde (interactive)
- Concept: Rounding N 1→1/0, 2→1/0, 3→1/0, 4→1/1, 5→2/1, 10→3/2; both 0 invalid; 25/25 = 28 s, 1/0 = 51 s, 0/1 = 46 s, 100 %/0 = 17 s.
- Visual: Table + four small-multiple lanes.
### 5. Pokvarena verzija (interactive)
- Concept: Crashing image stalls at 3 old Ready + 2 new unready; ProgressDeadlineExceeded after progressDeadlineSeconds (600 default); no auto rollback; rollout undo scales the old RS back (revisionHistoryLimit 10); Recreate = downtime.
- Visual: Stalled gauges; undo button.
### 6. Galerija kontrolera (text)
- Concept: Closed DeepDive gallery: DaemonSet, Job, CronJob (StatefulSet in L19).
- Visual: Gallery cards.

## Flagship simulation: Kontrolna ploča uvođenja
E3: Deployment klopa-api with ReplicaSet tree, revision history, invariant gauges and 20 rps of traffic coloured by version (1.3.2 blue, 1.4.0 violet, 1.5.0 rose). Zadaci: „Uvedite 1.4.0 bez ijednog neuspjelog zahtjeva”, „Nikad ispod 4 dostupna Poda”, „Oporavite se od 1.5.0 u < 30 s sim vremena”.

Controls:
- Segmented slika: 1.3.2 / 1.4.0 / 1.5.0 (ruši se) / 1.5.0 (nikad spremna)
- Klizač „replicas” 1–10
- maxSurge i maxUnavailable: 0, 1, 2, 25 %, 50 %, 100 % (poruka kad su oba 0)
- Segmented strategija: RollingUpdate / Recreate
- Prekidač „Provjera spremnosti”
- Gumbi „Primijeni”, „Pauziraj”, „rollout undo”, „Vrati na reviziju N”
- Gumb za kvar „Obriši Deployment”

Model (exact rules):
sim-models SIM 5 (rolling.go). DT 100 ms. surge = ceil(maxSurge%·N), unavail = floor(maxUnavailable%·N); both 0 after rounding → unavail 1; explicit 0/0 rejected ('maxSurge i maxUnavailable ne mogu oba biti 0'). Each reconcile scales up OR down: maxTotal = N + surge; all = Σ rs.spec.replicas (terminating NOT counted); if all < maxTotal → newRS += min(maxTotal − all, N − newRS); else minAvailable = N − unavail; maxScaledDown = all − minAvailable − (newRS.spec − newRS.available); ≤0 → stop; clean up unhealthy old first, then scale old (oldest first) down by Σavailable − minAvailable. Available = Ready ≥ minReadySeconds (0); traffic follows Ready. Recreate: old → 0, wait until gone, then new. Timings (sim): schedule 1 s, pull 4 s new (0 cached), start 6 s, readiness period 2 s in YAML (real default 10), progressDeadlineSeconds 60 in YAML (real 600), shutdown 2 s. No readiness probe → Ready on start → errors during 6 s warm-up. Validated N=4: 25/25 28 s, peak incl. terminating 7, min available 3; 1/0 51 s, peak 6, min 4; 0/1 46 s, peak 5, min 3; 100 %/0 17 s, peak 8. Crashing image stalls at 3 old + 2 new; N=10 surge 3 unavail 2 stalls at 8 old / 5 new (matches docs). Show .status.terminatingReplicas. Undo = scale previous RS up by the same rules; history shows kubernetes.io/change-cause. Deleting the Deployment cascades.

Break it: Pushing the crashing 1.5.0 stalls at 3 old + 2 new (75 % capacity) and shows ProgressDeadlineExceeded – nothing rolls back by itself; Recreate empties the app during lunch; readiness off shows errors from warming Pods.

Insight: A rollout is two ReplicaSets scaled in opposite directions under two limits; readiness is the gatekeeper; rollback is scaling the old ReplicaSet up – and someone must ask for it.

## Code artifacts
- deployment.yaml (yaml): apps/v1, replicas 4, selector/labels, strategy, readinessProbe, requests (explained in L17), pinned tag, containerPort 8000
- kubectl rollout status / history / undo, get rs (bash): Watch and undo; set the kubernetes.io/change-cause annotation for history (--record is deprecated)
- kubectl scale i set image (bash): With a warning: u GitOpsu to radite u Gitu (L22)
- job.yaml i cronjob.yaml (yaml): Closed gallery

## Misconceptions (Croatian myth + English correction)
- „Deployment i postavljanje su isto” — object vs act.
- „Više replika znači više računala” — replicas are Pods; many can share a node, and full nodes leave them Pending.
- „Postupno ažuriranje je uvijek bez prekida” — needs readiness and compatible versions.
- „Deployment se sam vraća na staru verziju” — the rollout stalls with ProgressDeadlineExceeded; rollback is rollout undo or tooling.
- „Deployment izravno upravlja Podovima” — through ReplicaSets, which hold the revision history.
- „minReadySeconds odgađa promet” — traffic follows Ready; it only delays 'Available'.
- „Blue-green i canary ugrađeni su u Deployment” — only RollingUpdate and Recreate.

## Key facts (verified; date-sensitive ones belong in fact callouts)
- [tech-facts] Deployment → ReplicaSet → Pods; strategies RollingUpdate (default maxSurge 25 %, maxUnavailable 25 %) and Recreate; revisionHistoryLimit 10; progressDeadlineSeconds 600; roll back with kubectl rollout undo.
- [tech-facts] 'Deployment' has two meanings (act and object); Kubernetes does not deploy source code.
- [sim-models] maxSurge rounds up, maxUnavailable down; terminating Pods not counted (status.terminatingReplicas beta since 1.35).
- [tech-facts] kubectl --record is deprecated; use the kubernetes.io/change-cause annotation.

## Analogies (always with where they break down)
- Ugovor o smjeni: „uvijek četiri konobara, zamijeni svakoga tko ode, uniforme mijenjaj jednog po jednog”. Breaks down: the contract doesn't name the waiter – Pods must be interchangeable.

## Glossary terms introduced
ReplicaSet, Deployment, Rolling update, Deploy, Rollback

## Bridge to next (CostNote)
Vegetarijanski meni je vani. Ali novi Podovi imaju nove IP adrese, a klopa-web je imao upisanu adresu jednog API Poda – i sada vraća greške. Kako drugi pronalaze Podove koji stalno mijenjaju adresu?
