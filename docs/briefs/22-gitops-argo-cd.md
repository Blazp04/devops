# Lecture 22 — GitOps i Argo CD: Git kao izvor istine
_Ista petlja usklađivanja, razinu više: klaster sam povlači željeno stanje iz Gita i – ako to uključite – poništava ručne promjene._ · ~40 min · module m5 · prerequisites: 10, 13, 18, 20, 21
Folder: `src/lectures/22-gitops-argo-cd/` · URL: `/predavanje/gitops-argo-cd`
Engines: E6 → src/engines/gitops/

## Continuity
- Previous lecture (21 CI/CD: od commita do provjerene slike) ends with: Pipeline gradi i provjerava svaku promjenu, ali na kraju sam izvodi `kubectl apply` s ključem administratora klastera. U 02:00 netko je još i ručno pokrenuo `kubectl edit` – i više nitko ne zna što stvarno radi u produkciji.
- Next lecture (23 Upravljanje tajnama u GitOpsu) opens with: Lana je `secret.yaml` primijenila ručno, pa na novom klasteru API ne može ni krenuti. Netko je u međuvremenu u Git spremio Secret kodiran u base64 – brisanje commita ne uklanja ga iz povijesti. A kad je Davor otišao na Erasmus, zamjena ključa za SMS-gateway, koji je postojao samo na njegovu laptopu, trajala je dva dana. Kako tajne uklopiti u GitOps, a da ih nikad ne zapišemo u Git?

## Hook (incident)
CI drži ključ administratora klastera – ako procuri, napadač ima sve. U 02:00 netko je naredbom `kubectl edit` promijenio varijablu, a nakon obnove klastera nitko ne zna rekonstruirati stanje. Što ako bi klaster sam povlačio željeno stanje iz Gita i neprestano ga uspoređivao – kao termostat iz desetog predavanja?

## Objectives (rendered by the page hero)
- objasniti četiri načela GitOpsa
- objasniti Argo CD kao petlju usklađivanja između Gita i klastera te razliku između povlačenja i guranja, uključujući to da povlačenje premješta ključeve, a ne uklanja ih
- razlikovati status sinkronizacije (Synced, OutOfSync) i zdravlje aplikacije
- predvidjeti ponašanje uz auto-sync, prune i selfHeal te kada Argo CD primijeti promjenu u Gitu
- napraviti rollback naredbom git revert i objasniti podjelu posla između CI-ja i Argo CD-a

## Scenes
### 1. Gurati ili povlačiti (animation)
- Concept: Push: CI with cluster credentials; pull: agent inside the cluster reads Git; OpenGitOps: declarative, versioned and immutable, pulled automatically, continuously reconciled. Pull moves the keys, it doesn't remove them: anyone who can merge to the config repo can deploy to production, and Argo CD runs with broad cluster rights – protect the repo with branch protection, required reviews and commit-signature verification (Argo CD AppProject sourceIntegrity, 3.5), and restrict Argo CD with AppProjects (one line).
- Visual: Two diagrams with firewall arrows; four principle cards; a lock on the config repo.
### 2. Matrjoška petlji (animation)
- Concept: Thermostat (L10) → Kubernetes controller → Argo CD; target state (Git) vs live state (cluster).
- Visual: Nested rings in ghost/solid grammar.
### 3. Od commita do sinkronizacije (interactive)
- Concept: Refresh polls every 120 s + up to 60 s jitter, webhook is faster; OutOfSync diff → sync → Synced/Healthy; sync and health are separate (Synced + Degraded possible).
- Visual: Poll countdown ring; diff view; two badges.
### 4. Odstupanje (interactive)
- Concept: Manual kubectl scale → OutOfSync; selfHeal off (default) stays, on → reverted after 5 s; file removed from Git: prune off (default) → orphan, on → deleted; a failed sync is not retried on the same commit unless syncPolicy.retry is configured (exponential backoff).
- Visual: Toggles and drift animation.
### 5. Rollback je git revert (animation)
- Concept: Bad commit → Degraded → git revert → audit trail; CI bumps the tag in the config repo, Argo CD pulls; Argo CD renders Helm with helm template (helm list is empty) and Kustomize. Closed DeepDive: sync waves (migration Job wave −1).
- Visual: Commit graph; end-to-end chain.
### 6. Argo CD i HPA (interactive)
- Concept: replicas in Git fights the HPA (L18). Preferred: omit spec.replicas from the Deployment in Git – but removing it from an existing manifest can drop the Deployment to 1 replica once (the default), so follow the HPA migration procedure. If it must stay: ignoreDifferences on /spec/replicas together with syncOptions RespectIgnoreDifferences=true (ignoreDifferences alone only hides the diff; the next sync still applies replicas). Flux as the alternative (one line); teaser „a lozinke?”.
- Visual: Tug of war; then peace.

## Flagship simulation: Git je istina
E6: config repo (file tree + commit graph + CI bot lane) on the left, Argo CD resource tree (Application → Deployment → ReplicaSet → Pods + Service) with sync/health badges and a poll ring on the right. Zadaci: „Uvedite 2.0.1 samo commitom”, „Ručno odstupanje neka se samo vrati”, „Vratite loš commit na GitOps način”, „Zaustavite borbu Argo CD-a i HPA-a – i nakon sljedećeg commita”.

Controls:
- Gumb „Commit u Git” (replicas ili tag slike)
- Prekidač „Webhook”
- Prekidači „Automatska sinkronizacija”, „selfHeal”, „prune”, „retry”
- Gumbi „Sinkroniziraj” i „git revert”
- Mir s HPA-om: „ukloni replicas iz Gita” / „ignoreDifferences” / „ignoreDifferences + RespectIgnoreDifferences”
- Gumbi za kvar: „Ručni kubectl scale --replicas=10”, „Netko obriše Deployment”, „Obriši datoteku iz Gita”, „Loš commit”, „replicas u Gitu + HPA”

Model (exact rules):
Target = manifests rendered from Git HEAD; live = cluster objects. Refresh every 120 s + uniform 0–60 s jitter (sim ÷10, badge 'stvarno: 120 s + do 60 s'); webhook → ~1 s. Sync status Synced iff every target object equals live (minus ignoreDifferences), else OutOfSync; health independent: Progressing during rollout, Healthy when available = desired, Degraded after ProgressDeadlineExceeded, Missing if absent (also Suspended, Unknown). Auto-sync (off by default) syncs only when OutOfSync after a Git change; selfHeal (off by default) also syncs live drift after 5 s; prune (off by default) deletes objects removed from Git, else flagged. Failed sync not retried on the same commit unless retry is on (exponential backoff). Bad commit → Synced but Degraded; git revert → new commit → sync → Healthy, visible in history. replicas in Git + HPA → selfHeal and HPA flap (counter). Fixes: remove replicas from Git (first sync shows a one-time drop to 1 unless the migration procedure is followed) → peace; ignoreDifferences alone → no flapping on drift, but the next commit (e.g. a new tag) syncs and resets replicas → one more fight; ignoreDifferences + RespectIgnoreDifferences=true → peace. CI bot commits the new digest; CI holds no cluster credentials.

Break it: A manual scale shows OutOfSync and stays unless selfHeal is on; a deleted Deployment is restored by selfHeal; a file removed from Git leaves an orphan unless prune is on; a bad commit is Synced but Degraded; replicas in Git plus an HPA make them fight – and ignoreDifferences alone only hides it until the next sync.

Insight: Argo CD is the L10 loop one level up: Kubernetes reconciles the cluster to etcd, Argo CD reconciles it to Git; Git history becomes deployment history, rollback is a commit – and the config repo becomes the thing to protect.

## Code artifacts
- application.yaml (yaml): argoproj.io/v1alpha1, syncPolicy.automated with prune/selfHeal, optional retry
- Struktura config repozitorija (text): base/overlays per environment
- CI korak: kustomize edit set image + commit (yaml): The bot commit
- ignoreDifferences za /spec/replicas + RespectIgnoreDifferences=true (yaml): Peace with HPA when replicas must stay in Git
- AppProject sa sourceIntegrity (yaml): Closed: allowed repos/destinations and commit-signature verification (verify field names against 3.5 docs)
- Instalacija Argo CD-a (bash): Closed: kubectl apply -n argocd --server-side --force-conflicts -f …/v3.5.x/manifests/install.yaml (pin when authoring)

## Misconceptions (Croatian myth + English correction)
- „Argo CD gradi i testira kod” — CI does that.
- „Argo CD reagira odmah na push” — it polls every 120 s plus up to 60 s jitter unless a webhook is set up.
- „GitOps = YAML u Gitu” — it also means pulled automatically and continuously reconciled.
- „Moja ručna promjena ostaje” / „Auto-sync po zadanom vraća i briše” — drift shows as OutOfSync; it is reverted only with selfHeal and deleted only with prune, both off by default.
- „ignoreDifferences rješava borbu s HPA-om” — it only affects the diff; without RespectIgnoreDifferences=true the next sync applies replicas again.
- „GitOps uklanja sve ključeve iz CI-ja, pa je siguran” — whoever can merge to the config repo deploys to production; protect the repo and limit Argo CD with AppProjects.
- „Rollback je klik u sučelju” — prefer git revert so Git stays the truth.
- „Argo CD pokreće helm install” — it runs helm template.
- „Flux je umro s Weaveworksom” — Flux is CNCF graduated and actively released.

## Key facts (verified; date-sensitive ones belong in fact callouts)
- [tech-facts] OpenGitOps principles: declarative; versioned and immutable; pulled automatically; continuously reconciled.
- [tech-facts] Argo CD current 3.5.3 (3.5.0 released 2026-08-04), 3.6.0-rc1 out (as of 2026-10); 3.0 made annotation-based tracking the default; 3.5 AppProject .spec.sourceIntegrity configures commit-signature (GnuPG) verification.
- [tech-facts] Auto-sync only when OutOfSync; prune and selfHeal off by default; selfHeal reverts after 5 s; polling 120 s + up to 60 s jitter; failed sync not retried on the same commit unless syncPolicy.retry is set.
- [tech-facts] ignoreDifferences affects only diff/status; RespectIgnoreDifferences=true makes sync respect it.
- [tech-facts] Health statuses: Healthy, Progressing, Degraded, Suspended, Missing, Unknown; sync waves via argocd.argoproj.io/sync-wave (default 0).
- [tech-facts] Argo CD runs helm template and owns the lifecycle; Argo graduated CNCF 2022-12-06; Flux is CNCF graduated and active (2.9.x) after Weaveworks shut down in Feb 2024.

## Analogies (always with where they break down)
- Termostat čija je postavka zapisana u Gitu. Breaks down: it checks about every 3 minutes unless webhooks, it doesn't make the bricks (no image builds), and whoever can edit the setting controls the house.

## Glossary terms introduced
GitOps, Argo CD, Drift

## Bridge to next (CostNote)
Sve što opisuje Klopu sada je u Gitu – osim lozinki, koje prema 16. predavanju nikad ne smiju u Git. Lana zato `secret.yaml` primjenjuje ručno sa svog laptopa, a kad se podigne novi klaster, API Podovi ne mogu ni krenuti – stoje u CreateContainerConfigError jer Secreta nema.
