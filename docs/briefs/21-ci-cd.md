# Lecture 21 — CI/CD: od commita do provjerene slike
_Kontinuirana integracija kao navika, pipeline kao kod i razlika između isporuke i postavljanja._ · ~40 min · module m5 · prerequisites: 08, 20
Folder: `src/lectures/21-ci-cd/` · URL: `/predavanje/ci-cd`
Engines: E4 → src/engines/build/

## Continuity
- Previous lecture (20 Što je deploy: postavljanje, izdanje i strategije) ends with: Verzija 2.0.0 je vraćena, a ispravak PDV-a 2.0.1 čeka. Ali tko pritišće gumbe? Davor gradi sliku na svom laptopu s nespremljenim promjenama, šalje je kao `latest` i preskače testove „jer se žuri”. Sljedeći tjedan odlazi na Erasmus – i nitko drugi ne zna kako se Klopa postavlja.
- Next lecture (22 GitOps i Argo CD: Git kao izvor istine) opens with: CI drži ključ administratora klastera – ako procuri, napadač ima sve. U 02:00 netko je naredbom `kubectl edit` promijenio varijablu, a nakon obnove klastera nitko ne zna rekonstruirati stanje. Što ako bi klaster sam povlačio željeno stanje iz Gita i neprestano ga uspoređivao – kao termostat iz desetog predavanja?

## Hook (incident)
Slika u produkciji izgrađena je na Davorovom laptopu s nespremljenim promjenama, označena kao `latest`, bez testova. Nitko ne zna koji je commit u produkciji, a Davor sljedeći tjedan odlazi na Erasmus. Kako svaku promjenu – počevši od ispravka 2.0.1 – automatski provjeriti, zapakirati i pripremiti za produkciju, bez ičijeg laptopa?

## Objectives (rendered by the page hero)
- objasniti kontinuiranu integraciju kao praksu malih, čestih spajanja s automatskom izgradnjom i testovima
- razlikovati kontinuiranu isporuku i kontinuirano postavljanje
- opisati faze pipelinea i zašto se ista slika (digest) promovira kroz okruženja
- označavati slike hashom commita ili semantičkom verzijom umjesto taga latest
- objasniti prednost kratkotrajnih OIDC tokena i rizik pipelinea koji s trajnim ključem radi kubectl apply u produkciju

## Scenes
### 1. Pakao integracije (animation)
- Concept: Long-lived branches merged after weeks vs small merges at least daily (Fowler).
- Visual: Branch graph collisions.
### 2. Pokretna traka (simulation)
- Concept: Flagship; fail fast.
- Visual: See flagship.
### 3. Izgradi jednom, promoviraj više puta (animation)
- Concept: Tags = git SHA / semver; digest = sha256 of the image manifest, i.e. of the built content – rebuilding the same commit later usually gives a different digest (timestamps, a newer base image behind the same tag, a new dependency patch); one digest dev → staging → prod; rebuild for prod = different, untested artefact. If imagePullPolicy is omitted, :latest (or no tag) defaults it to Always; any other tag or a digest → IfNotPresent (set when the object is created).
- Visual: Digest-stamped card; red 'drugi artefakt'.
### 4. Isporuka ili postavljanje? (interactive)
- Concept: Gate slider: CI only / continuous delivery (human button before prod) / continuous deployment (automatic).
- Visual: Slider moving the gate.
### 5. Pipeline kao kod (diagram)
- Concept: GitHub Actions: .github/workflows, events, jobs parallel by default unless needs, steps, runners; GitLab CI: stages in order, jobs in a stage parallel.
- Visual: YAML blocks highlighting stations.
### 6. Tajne i tko gura u klaster (animation)
- Concept: Long-lived cloud key vs OIDC token issued per job, scoped by the cloud trust policy (repo, branch, environment) and expiring on its own after a short lifetime (AWS STS default 1 h, down to 15 min) – nobody has to rotate it; never echo secrets; pin actions by SHA. Push model: CI holds powerful long-lived cluster credentials and runs kubectl apply – it works and is widely used, but nothing detects drift (teaser L22).
- Visual: Key vs expiring token; CI box with key arrow into cluster.

## Flagship simulation: Tvornica commitova
E4: the pipeline as an assembly line – lint → testovi → izgradnja slike → skeniranje → registar (digest) → staging → e2e → [ljudska vrata] → produkcija – with a DORA panel. Zadaci: „Od commita do produkcije < 10 min uz sve provjere”, „0 loših commitova u produkciji od 20”, „Postavite kontinuiranu isporuku pa kontinuirano postavljanje”.

Controls:
- Tipovi commita: „Ispravan”, „Pada test”, „Ranjiva bazna slika”, „Nestabilan test”, „Tajna u kodu”
- Prekidači „Paralelni poslovi” i „Predmemorija ovisnosti”
- Prekidač „Preskoči testove”
- Klizač položaja ljudskih vrata
- Gumb „Ponovno izgradi za produkciju”
- Gumb za kvar „Procurio CI ključ” (trajni ključ / OIDC token)

Model (exact rules):
Discrete events with illustrative durations (labelled): lint 30 s, tests (pytest + web unit tests) 3 min (1 min cached), image build 4 min cold / 40 s with layer cache, scan 1 min, push 20 s, staging deploy 1 min, e2e 4 min; parallel jobs run lint and tests together. Failing test → line stops, nothing deployed; vulnerable base → scan gate blocks; flaky test fails 30 % at random → retries, trust meter drops; secret in code → secret-scan fails before push; skip tests → buggy commits reach prod, change failure rate rises. Gate: CI only stops after push; delivery waits for a click; deployment goes automatically. Digest = sha256 of the image manifest (built content); promotion carries the same digest; 'Ponovno izgradi za produkciju' produces a different digest (newer base image/dependency/timestamps) that was never tested. Tags: short SHA + semver (klopa-api:2.0.1). DORA: deployment frequency, lead time for changes, change failure rate, failed deployment recovery time (vrijeme oporavka od neuspjelog postavljanja). Leaked credential: long-lived key stays usable until someone revokes it; OIDC token usable only for its remaining lifetime (sim 10 min; badge 'AWS STS zadano 1 h, najmanje 15 min').

Break it: „Preskoči testove” ships a bug; a flaky test erodes trust; a vulnerable base image is stopped by the scan; a production rebuild is not the tested artefact; a leaked long-lived key stays usable while an OIDC token expires on its own.

Insight: CI is a habit, not a server; the artefact that was tested is the one that goes live, identified by its digest; delivery means you could release any time, deployment means you do.

## Code artifacts
- .github/workflows/ci.yaml (yaml): Test + build-push tagged ${{ github.sha }}, permissions id-token: write, actions pinned by SHA (verify versions)
- .gitlab-ci.yml (yaml): Same pipeline in stages (tab)
- docker buildx build --push i digest (bash): Record the digest
- Korak kubectl apply (push model) (yaml): Closed contrast for L22

## Misconceptions (Croatian myth + English correction)
- „CI/CD je alat” — it is a practice; tools only automate it.
- „CD uvijek znači automatski u produkciju” — continuous delivery keeps a human release decision; continuous deployment removes it.
- „Testovi su neobavezni, CI je samo izgradnja” — without tests there is no feedback.
- „CI s trajnim administratorskim ključem klastera jednako je siguran kao GitOps” — push works, but CI holds powerful long-lived cluster credentials and nothing detects drift; pull moves the credentials into the cluster and adds continuous reconciliation.
- „Sliku izgradite posebno za svako okruženje” — a rebuild is a different artefact; promote one digest.
- „latest je u redu” — movable and unauditable; it defaults imagePullPolicy to Always.
- „Trajni ključevi u CI-ju su u redu” — prefer OIDC short-lived tokens scoped to repo/branch/environment.

## Key facts (verified; date-sensitive ones belong in fact callouts)
- [tech-facts] CI (Fowler): everyone merges to mainline at least daily, each integration verified by automated build and tests; continuous delivery = releasable at any time, release is a business decision; continuous deployment = every change goes to production automatically and requires continuous delivery.
- [tech-facts] GitHub Actions: workflows in .github/workflows, jobs parallel by default, GitHub-hosted or self-hosted runners.
- [tech-facts] GitLab CI: .gitlab-ci.yml, stages in order, jobs in a stage in parallel.
- [tech-facts] Prefer OIDC short-lived tokens over long-lived cloud credentials (AWS STS session default 1 h, minimum 15 min); Docker Hub supports immutable tags; avoid :latest in production; log in from CI because of pull limits.
- [tech-facts] imagePullPolicy default: Always for :latest or no tag, IfNotPresent otherwise (including digests); set at object creation.
- [tech-facts] DORA's fourth key metric is now called failed deployment recovery time.

## Analogies (always with where they break down)
- Automatska provjera pravopisa i probni ispis pri svakom spremanju (CI). Breaks down: it suggests a tool – CI is the practice of integrating small changes often.
- Pokretna traka od tvornice do police, s gumbom ili bez (CD). Breaks down: nothing is copied or rebuilt between stations – the same image digest is promoted, and it can be taken back off the shelf (rollback) in seconds.

## Glossary terms introduced
Continuous integration, Continuous delivery, Continuous deployment, Pipeline

## Bridge to next (CostNote)
Pipeline gradi i provjerava svaku promjenu, ali na kraju sam izvodi `kubectl apply` s ključem administratora klastera. U 02:00 netko je još i ručno pokrenuo `kubectl edit` – i više nitko ne zna što stvarno radi u produkciji.
