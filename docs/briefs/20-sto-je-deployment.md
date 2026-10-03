# Lecture 20 — Što je deploy: postavljanje, izdanje i strategije
_Okruženja, četiri strategije i kako odabrati koliko će korisnika vidjeti grešku._ · ~40 min · module m5 · prerequisites: 13, 14, 15
Folder: `src/lectures/20-sto-je-deployment/` · URL: `/predavanje/sto-je-deployment`
Engines: E1 → src/engines/traffic/, E3 → src/engines/cluster/

## Continuity
- Previous lecture (19 Podatci koji preživljavaju: volumeni i StatefulSet) ends with: Infrastruktura je stabilna: Podovi se obnavljaju, skaliraju i čuvaju podatke. Najveći rizik postale su naše vlastite promjene. U petak u 11:30 izlazi `klopa-api:2.0.0` s novom košaricom.
- Next lecture (21 CI/CD: od commita do provjerene slike) opens with: Slika u produkciji izgrađena je na Davorovom laptopu s nespremljenim promjenama, označena kao `latest`, bez testova. Nitko ne zna koji je commit u produkciji, a Davor sljedeći tjedan odlazi na Erasmus. Kako svaku promjenu – počevši od ispravka 2.0.1 – automatski provjeriti, zapakirati i pripremiti za produkciju, bez ičijeg laptopa?

## Hook (incident)
Petak, 11:30. Verzija 2.0 krene postupnim ažuriranjem i do 11:50 svi korisnici vide krivo izračunat PDV na svakoj petoj narudžbi. Usto je migracija preimenovala stupac u bazi pa se stari Podovi, koji još rade tijekom uvođenja, ruše. Što znači postaviti novu verziju i kako to napraviti tako da greška pogodi što manje ljudi?

## Objectives (rendered by the page hero)
- razlikovati postavljanje (deploy), izdanje (release), uvođenje (rollout) i objekt Deployment
- objasniti okruženja i promociju istog artefakta do produkcije
- usporediti strategije Recreate, postupno ažuriranje, plavo-zeleno i canary po riziku, trošku i brzini
- objasniti zašto plavo-zeleno i canary nisu ugrađeni u Deployment i čime se izvode
- planirati promjenu sheme baze u tri koraka i odvojiti postavljanje od izdanja
- objasniti kako Kustomize iz istih manifesta stvara inačicu za svako okruženje

## Scenes
### 1. Četiri riječi (diagram)
- Concept: postavljanje (deploy), izdanje (release), uvođenje (rollout), Deployment (object).
- Visual: Four cards.
### 2. Okruženja i promocija (animation)
- Concept: dev → staging → prod with the same digest; „staging prošao ≠ produkcija radi”; Kustomize base + overlays render plain YAML per environment. Callout, one line: Helm = paketi predložaka s vrijednostima; Argo CD ga renderira (22. predavanje).
- Visual: Digest card travelling; overlay sheets (callback L08 layers); three rendered outputs diffed.
### 3. Četiri strategije, isti bug (simulation)
- Concept: Flagship.
- Visual: See flagship.
### 4. Plavo-zeleno i canary (interactive)
- Concept: Blue-green: flip Service selector or Gateway backend; the flip is instant only for new connections – existing keep-alive/HTTP/2 connections keep reaching blue (conntrack, L14) until they close, so keep blue running until it drains (Argo Rollouts scaleDownDelaySeconds 30 s); fast rollback, 2× resources. Canary by replicas: 4 stable + 1 canary ≈ 20 % of connections (approximate, with variance) – the smallest step with N=4; HTTPRoute weight 95/5: each request goes to v2 with probability 5 %, independent of Pod count. Manual with two Deployments + Service selector or HTTPRoute weights; automated by Argo Rollouts (steps, analysis, abort; Gateway API plugin) or Flagger.
- Visual: Selector flip with lingering blue connections; two canary lanes; analysis chart with threshold.
### 5. Baza ne ide unatrag (interactive)
- Concept: Expand/contract: add column + dual write → migrate readers → drop old; a one-step rename breaks v1 mid-rollout; rollback after a drop is impossible.
- Visual: Three-step stepper with v1/v2 Pods reading the schema.
### 6. Postavljanje nije izdanje (animation)
- Concept: Feature flags: deploy dark, release to 1 % → staff → everyone without redeploying.
- Visual: Flag rollout.

## Flagship simulation: Četiri strategije, isti bug
Four lanes on identical seeded traffic – Recreate, Rolling, Blue-green, Canary – each deploying 2.0.0 with a bug affecting a share of requests; per-lane downtime, users hit, extra €, time to rollback, mixed-version window. Zadaci: „Uvedite 2.0 tako da grešku vidi < 50 korisnika” (solvable only with Gateway weights – the lesson itself), „U skrivenom načinu uočite grešku prije 10 % izloženosti”, „Promijenite shemu bez rušenja v1”.

Controls:
- Klizač „Udio zahtjeva s greškom” 0–100 % (zadano 20 %)
- Prekidač „Skrivena greška”
- Koraci canaryja 5 → 25 → 50 → 100 % i prag prekida (zadano 2 %)
- Segmented canary: po replikama / po težinama Gatewaya
- Gumb „Vrati” po traci
- Gumbi za kvar: „Preimenuj stupac u jednom koraku”, „Vrati nakon nepovratne migracije”

Model (exact rules):
Shared seed: 20 rps, distinct users, N 4. v2 requests fail with probability bugRate; count unique users hit. Recreate: old → 0, gap until new Ready (1 + 4 + 6 s sim) where all requests fail, then 100 % v2. Rolling: SIM 5 rules at 25/25, traffic over Ready Pods per new connection. Blue-green: 4 green Pods start beside blue; when all Ready the selector flips → new connections 100 % v2, existing keep-alive connections finish on blue until closed; rollback = flip back; double Pods during overlap (Argo Rollouts default scaleDownDelaySeconds 30). Canary by replicas: stable 4 + canary k Pods → share ≈ k/(4+k) of connections with random variance: ≈20 %, ≈33 %, 50 %, then 100 %; requested steps snap to achievable ratios and show 'traženo 5 % → stvarno ~20 %'. By weights: each request independently to v2 with p = weight/Σweights (≈5 % over many requests). Each step 30 s sim; v2 error rate > threshold → abort (weight 0 / canary scaled to 0). Expand/contract: v1 reads cijena, v2 reads cijena_s_pdv; one-step rename → v1 Pods fail until rollout ends; three steps → 0 errors; rollback after drop → v1 errors.

Break it: Rolling spreads the bug to everyone; blue-green switches everyone at once but rolls back instantly (old connections linger on blue); canary with analysis stops near 5 % exposure with Gateway weights, near 20 % with replicas; a one-step column rename crashes v1 mid-rollout.

Insight: You can deploy without releasing; a strategy decides how many users a bug reaches and what it costs. Canary and blue-green aren't built into the Deployment object: do them by hand with two Deployments plus a Service selector or HTTPRoute weights, or automate them with Argo Rollouts or Flagger.

## Code artifacts
- Recreate i RollingUpdate (yaml): Built-in strategies
- Plavo-zeleno promjenom selektora (yaml): Service selector version: blue → green
- HTTPRoute 95/5 (yaml): Weighted canary
- kustomization.yaml s overlays/prod i kubectl kustomize (bash): Per-environment rendering (helm template as a one-line tab)
- Argo Rollouts canary s analizom (yaml): Closed; verify Gateway API plugin config
- Proširi i suzi (sql): Closed

## Misconceptions (Croatian myth + English correction)
- „Postavljanje = izdanje” — feature flags let you deploy dark and release later.
- „Rollback je uvijek siguran” — irreversible migrations break the old version.
- „Blue-green i canary ugrađeni su u Deployment” — they need a router (Service selector, Gateway weights) and usually tooling.
- „Prebacivanje selektora odmah prebaci sve korisnike” — only new connections; keep-alive connections stay on blue until they close.
- „Staging je prošao, znači produkcija radi” — data, scale and config differ.
- „Canary po replikama je točan postotak” — it is the Pod ratio per connection, with variance; with 4 Pods the smallest step is ~20 %.
- „Kubernetes treba Helm” — the API server receives ordinary objects; Helm renders them client-side (Helm 4 can use server-side apply) and keeps release history as Secrets in the namespace.

## Key facts (verified; date-sensitive ones belong in fact callouts)
- [tech-facts] Native Deployment strategies are RollingUpdate and Recreate.
- [tech-facts] Argo Rollouts (1.10.0) adds blue-green, canary, analysis; blue-green autoPromotionEnabled default true, scaleDownDelaySeconds 30; routers include Gateway API via plugin; without a router the canary weight is approximated by replica counts.
- [tech-facts] Helm 4.0.0 released 2025-11-12 (first major in 6 years); current 4.3.0, Helm 3.22 still released (as of 2026-10).

## Analogies (always with where they break down)
- Kanarinac u rudniku. Breaks down: users are not disposable – you choose a small share and stop automatically.
- Dva jednaka postava i jedan prekidač (plavo-zeleno). Breaks down: double resources, existing connections don't switch at once, and the database is shared, so the schema must suit both.

## Glossary terms introduced
Release, Blue-green deployment, Canary release, Helm

## Bridge to next (CostNote)
Verzija 2.0.0 je vraćena, a ispravak PDV-a 2.0.1 čeka. Ali tko pritišće gumbe? Davor gradi sliku na svom laptopu s nespremljenim promjenama, šalje je kao `latest` i preskače testove „jer se žuri”. Sljedeći tjedan odlazi na Erasmus – i nitko drugi ne zna kako se Klopa postavlja.
