# E6 „Git ↔ klaster” — GitOps / Argo CD engine

Pure TypeScript (no React, no DOM), seeded, fixed-step. Used by **L22** (flagship „Git je istina”), **L23** („Put tajne (2. dio)”, the GitOps half next to E5) and **L24** („Incident u 12:00”: the Argo CD part of the fault deck, the config-repo editor and the „Put jednog commita” timeline).

```bash
node --test src/engines/gitops/*.test.ts     # 118 tests
```

```
src/engines/gitops/
  index.ts       public API (import from here)
  types.ts       all state/data types
  constants.ts   TIMINGS (sim vs real), REAL_FACTOR, POD_TIMINGS, PATHS (JSON pointers), KLOPA names, RETRY_PRESETS/LABELS, defaults
  config.ts      GitOpsConfig, PRESETS, manifest builders
  engine.ts      createGitOps, step, advance (+ CI lane, kubeseal / sops helpers)
  git.ts         config repo: commits, protection, revert, signatures, sourceIntegrity, kustomize-style image edit
  argocd.ts      Application controller: render (plugins, Redis cache), refresh, compare, health, auto-sync, sync operation, retry
  cluster.ts     live objects, API validation, Deployment/ReplicaSet/kubelet model, HPA, hook Jobs, Secret controllers, E3 bridge
  actions.ts     user actions (commit…, sync…, kubectl…, break-it buttons, secrets approach)
  selectors.ts   read-only views for UIs + kubectl / argocd / helm CLI output, YAML view
  gitops.test.ts node:test suite
```

Behaviour was checked against the **argo-cd v3.5.3 source** (latest release on 2026-10-01): `controller/appcontroller.go`, `controller/health.go`, `controller/sync.go`, `controller/state.go`, `cmd/argocd-application-controller`, `gitops-engine/pkg/sync/sync_context.go`, `gitops-engine/pkg/health/health_deployment.go` and `health_hpa.go`, `util/sourceintegrity`, `reposerver/repository/repository.go`; and Kubernetes `pkg/controller/deployment` (`rolling.go`, `sync.go`, `util/deployment_util.go`), `pkg/apis/apps/validation`, `pkg/controller/podautoscaler/horizontal.go`. Docs pages are listed under *Sources*.

## What it models

| Piece | Model |
|---|---|
| **Config repo** | Immutable commits (author, message, time, GnuPG signature, file snapshot, field-level diff). One Kubernetes object per file; fields are JSON pointers (`/spec/replicas`), exactly what `ignoreDifferences.jsonPointers` uses. `commitChanges` puts any number of file/field changes into **one** revision (a multi-field fix is never synced half-done). `git revert` = a *new* commit with the inverse field changes (three-way check → conflict if a later commit touched the same field). History is never rewritten. Image updates work like `kustomize edit set image`: every container of the same image repository changes (Deployment **and** the migration Job). Image references are validated (Docker reference grammar). |
| **Git host protection** | Branch protection (`requirePullRequest`) rejects direct pushes; `requireSignedCommits` rejects unsigned commits. |
| **Argo CD refresh** | Git is polled every `timeout.reconciliation` **120 s + uniform 0–60 s jitter** – compressed ÷10 to **12 s + 0–6 s** and labelled (`TIMINGS.pollTotal.label`, event texts „16,7 s (sim) · stvarno ≈ 167 s”). Every refresh (poll, webhook, manual, after a sync) restarts the poll countdown (`needRefreshAppStatus`). Webhook → refresh ≈ 1 s after the push. „Osvježi” (Refresh) and „Sinkroniziraj” resolve HEAD immediately. Until a refresh, Argo CD compares against the revision it already knows: a fresh commit leaves the app **Synced** (to the old revision) with `behindGit: true`. |
| **Live drift** | Argo CD watches the cluster; the model re-compares the cached live state every **1 s**, so `kubectl scale/edit/delete` shows as OutOfSync within ≤ 1 s. |
| **Sync status vs health** | Separate dimensions. Sync = every target object equals live (minus `ignoreDifferences`), plus no tracked object that Git no longer has (`requiresPruning`). Resource health = Argo CD's built-in checks: Deployment (`health_deployment.go`: paused → **Suspended**, generation, updated/available replicas, `ProgressDeadlineExceeded` → **Degraded**), HPA (`health_hpa.go`, from its conditions), Job, Service/Gateway/PVC Healthy, HTTPRoute (missing backend Service → Degraded), SealedSecret/ExternalSecret from their controller status, missing object → **Missing**. **App health (3.5 rule, `controller/health.go`)** = worst health of the resources that exist live, by `Healthy < Suspended < Progressing < Missing < Degraded < Unknown`; a missing resource shows Missing on its own node but does **not** change app health („the OutOfSync status already indicates resources are missing”). The app is Missing only when Git has resources and none of them is live. A render error (plugin, store down) → sync **Unknown** + ComparisonError. |
| **Diff semantics** | Client-side-apply three-way (Argo CD's default; `ServerSideApply` is opt-in): a field differs if Git sets it to another value, or if it was in the last-applied configuration but is no longer in Git (→ removed on apply, API default applies: `replicas` → 1, narrated as a one-time drop). Fields set only by others (`kubectl rollout restart` annotation, `kubectl rollout pause`) are not compared. |
| **API-server validation** | `kubectl apply --dry-run=server` of every object at sync start (any error fails the whole sync, nothing is applied) and on `kubectlEdit`/`kubectlScale`: replicas type / ≥ 0 / ≤ int32, image required, `maxSurge`/`maxUnavailable` int-or-percent (`[0-9]+%`, ≥ 0, unavailable ≤ 100 %), **both 0 rejected** („may not be 0 when \`maxSurge\` is 0”), HPA max ≥ min, SOPS ciphertext in a plain Secret („illegal base64 data”). Messages are the API server's. |
| **Automated sync** (`autoSync`) | Off by default. Runs only when OutOfSync and no operation is running – while one runs (e.g. retrying an older revision) a newer commit waits and `autoSyncNote` / `deliveryView` (`queued`, `blockedBy`) say so. Skips when only pruning is needed and prune is off. Same revision already attempted: failed → never again on that commit (SyncError condition); succeeded → only with **selfHeal**. `prune` with `allowEmpty: false` refuses to delete every resource. |
| **selfHeal** | Off by default. Argo CD 3.x default: `--self-heal-timeout-seconds 0` and exponential back-off between self-heal attempts on the same revision: **0 s, 2 s, 6 s, 18 s, 54 s, 162 s, then 300 s**, counted from the end of the previous sync; the attempt counter resets with a new revision or a manual sync (the cooldown flag is deprecated, „has no effect”). A first drift is reverted **1,6 s** after the change (`TIMINGS.selfHealFirst`). The legacy fixed timeout is available: `timing: { selfHeal: { mode: 'timeout', timeoutS: 5 } }`. A self-heal sync is a selective sync of the out-of-sync resources (no hooks, no history entry). `stats.kubectlDriftsReverted` counts only self-heals that undid a manual (kubectl) change – not the ones that fought the HPA. |
| **prune** | Off by default: a file deleted from Git leaves an orphan flagged „zahtijeva brisanje”, the app stays OutOfSync. On: deleted during sync (the model prunes last). |
| **Sync operation** | (1) task validation – AppProject permissions (`one or more synchronization tasks are not valid: …`); (2) dry run (above); (3) phases and waves: PreSync → Sync (by `sync-wave`, default 0) → PostSync, apply 0,5 s per step. After every **non-final** wave Argo CD pauses **2 s** (`delayBetweenSyncWaves`) and then waits until that wave is Healthy / its hooks completed (Degraded or a failed hook → `one or more synchronization tasks completed unsuccessfully, reason: …`). The **final** wave without hooks succeeds right after apply – „EVEN if those objects subsequently degrade” (sync_context.go). Hooks are recreated on every full sync (BeforeHookCreation) and excluded from diff/health. |
| **Retry** | A failed or errored operation is retried while `retryCount < limit` (negative = unlimited) after `5 s × 2ⁿ`, max 3 min. **Automated syncs get `limit: 5` when `syncPolicy.retry` is not set** (`Retry: appv1.RetryStrategy{Limit: 5}` in `autoSync`); manual syncs get no retry unless `syncPolicy.retry` is set. A retrying operation keeps its original revision (unless `retry.refresh: true`) and blocks new auto-syncs; „Prekini” (terminate) stops it. `RETRY_PRESETS` = `notSet` / `none` (`limit: 0`) / `five` / `unlimited`, `RETRY_LABELS` their Croatian labels, `retryPresetOf(state)` the current one. |
| **ignoreDifferences / RespectIgnoreDifferences** | `ignoreDifferences` only removes fields from the diff/status. A sync still applies the whole manifest → `replicas` from Git overwrite the HPA. With `syncOptions: RespectIgnoreDifferences=true` the target is normalised with the live values of the ignored fields before apply (existing objects only). |
| **History / rollback** | Successful full syncs are recorded (limit 10). `argoRollback` (UI „History and rollback”) is refused while auto-sync is on and leaves the app OutOfSync with Git – the reason to prefer `git revert`. |
| **AppProject** | `restricted`: only namespace `klopa`, no cluster-scoped kinds (sync fails: „… is not permitted in project klopa”). `sourceIntegrity.git.policies[].gpg.mode` `none` / `head` (target revision signed by a key in the policy) / `strict` (target and every ancestor). As in 3.5, an unverified revision is still rendered and diffed (usually **OutOfSync**), Argo CD adds a **ComparisonError** (`GIT/GPG: Failed verifying revision <sha> by '<author>': unsigned (key_id=)`) and every sync of it ends in phase **Error** (automated ones after their 5 retries). |
| **Push vs pull** | `mode: 'push'`: no controller; CI applies the new image with its own long-lived cluster credentials; Git stops describing production (`gitMatchesCluster`), drift is never noticed. `mode: 'pull'`: the CI bot commits `tag@digest` to the config repo (signed, through a PR) and holds no cluster key; Argo CD pulls. `deployPaths()` lists who can change production in each mode – pull **moves** the keys to the repo and to Argo CD, it does not remove them. |
| **Workload (minimal, E3-compatible)** | Deployment → ReplicaSets → Pods following Kubernetes' deployment controller: `rolling.go` exactly as the validated SIM 5 prototype (fence posts, scale up *or* down per reconcile, cleanup of unhealthy old RS, deletion order, `progressDeadlineSeconds` → ProgressDeadlineExceeded, no automatic rollback; a revert reuses the old ReplicaSet); **scaling events and paused Deployments go through `sync.go scale()`** – the desired/max-replicas annotations mark a scaling event and the extra (or removed) Pods are spread over the active ReplicaSets in proportion to their size (*proportional scaling*: a stalled 8 old / 5 new rollout scaled to 15 → 11 / 7, as in the Kubernetes docs). kubelet: schedule 1 s → pull 4 s (0 s for an image already on the nodes) → start 6 s, readiness every 2 s; crash image → CrashLoopBackOff (10 s, 20 s … 300 s); unknown tag → ImagePullBackOff; Kubernetes events per Pod and namespace. Terminating Pods vanish after 5 s and are not counted by the rollout maths. Namespace quota `pods: 50`. Another engine can take over the Pods (see *Combining with E3*). |
| **HPA (minimal)** | Every 15 s (a new HPA first after one period, like the controller's queue): target missing → `AbleToScale=False FailedGetScale`; 0 replicas → ScalingDisabled; outside min/max → set to the bound; otherwise the CPU-utilization metric needs `resources.requests.cpu` in the Pod template – **without it: `ScalingActive=False FailedGetResourceMetric` („failed to get cpu utilization: missing request for cpu in container klopa-api of Pod …”), no scaling, Argo CD health Degraded**; with it desired = clamp(`hpaDemand`, min, max), scale-up limited to max(+100 %, +4 Pods), scale-down to the maximum recommendation of the last 300 s. Conditions (AbleToScale, ScalingActive, ScalingLimited) drive Argo CD health exactly like `health_hpa.go` (Degraded reasons first, then the first True AbleToScale/ScalingLimited → Healthy, none yet → Progressing „Waiting to Autoscale”). Writes `spec.replicas` through the scale subresource (does not touch last-applied). Every time Argo CD overwrites a value the HPA set, `stats.replicaFights` increments („borbe”); the one-time drop when `replicas` leaves Git is counted separately (`stats.replicaDrops`). |
| **Hook Jobs** | Run 3 s; fail when the database is down or the image crashes (`backoffLimit: 0`); an image that cannot be pulled leaves the Job (and a sync waiting for it) hanging until terminated. |
| **Secrets (L23)** | Plain `Secret` in Git; `SealedSecret` (controller decrypts with its private keys → owned Secret; keys: renew adds, backup, leak, lost on rebuild); **SOPS** through **KSOPS** (`ENC[AES256_GCM,…]` values in Git, the repo-server decrypts with the age keys; without the plugin the encrypted Secret fails the dry-run with „illegal base64 data” – Argo CD has no native SOPS support; `renewSopsKey` = a new age key); `ExternalSecret` (ESO reads the store every `refreshInterval` → owned Secret; store down → keeps the last Secret, health Degraded); Secrets Store CSI (Pods mount from the store at start, store down → new Pods stuck `ContainerCreating` FailedMount); `argocd-vault-plugin` (plaintext rendered into Argo CD's cache, cached per commit → rotation needs a hard refresh, store down → ComparisonError). `setSecretsApproach` switches between all of them at runtime in **one commit** (old carrier removed, new one added, Deployment rewired to env / volume / CSI, plugin switched) – history is kept. Pods: `secretKeyRef` missing → `CreateContainerConfigError`; secret volume missing → `ContainerCreating` (FailedMount); env values are captured at start (stale after rotation until `rollout restart`), volume values follow after the kubelet delay (10 s sim). **Eyes (same rules as E5):** `gitLeaks()` = every plaintext value ever committed (deleting the file does not help) plus every SealedSecret sealed with a **leaked** key (`sealing.leakedKeyIds`) and every SOPS value encrypted for a **leaked** age key (`sops.leakedRecipients`); only rotation (after a key leak: new key, rotate, re-seal) makes them stale. `argoCacheHasPlaintext` = Argo CD's Redis holds a still-valid readable value rendered within the cache lifetime (12 min sim ↔ 24 h real; the render in use is renewed at every refresh) – plain Secret from Git, avp, KSOPS. |

## Deliberate simplifications (and why they stay true)

- **One Application, one namespace, one cluster, one object per file.** Multi-source apps, ApplicationSets and app-of-apps are not needed by L22–L24. The behaviour of a single Application is exactly Argo CD's. `PRESETS.l24Full` puts the whole Klopa config repo into one Application (`klopa`, path `apps`, directory.recurse).
- **No nodes/scheduler.** Pods start after a fixed 1 s scheduling delay (E3 owns scheduling). The image-cache rule follows the validated prototype: every Pod created during the rollout of a brand-new image pulls it (4 s); an image that ran before, or a ReplicaSet whose rollout completed, starts without pulling. Rollout numbers therefore match SIM 5 (table below).
- **HPA demand is an input** (`setHpaDemand`, default 6 when an HPA exists) instead of CPU maths – the L22 point is the fight over `spec.replicas`, not how the HPA computes its number (that is L18/E3). Scale-up policy, the 300 s down-stabilisation, the CPU-request requirement and the conditions are kept so the HPA never behaves unlike a real one. With E3 in charge use `setHpaDesired`.
- **Proportional scaling** uses the real annotations and rounding (`getReplicaSetFraction`, leftovers to the largest ReplicaSet). One deviation: when a lone active ReplicaSet already has the right size its annotations are refreshed (Kubernetes would leave them, which can only matter after a manual edit of the annotations).
- **Live drift re-compare every 1 s** stands in for Argo CD's watch-driven refresh (real latency is about a second too).
- **Prune always runs last** (like `PruneLast=true`); with one object per kind this never changes the outcome.
- **Validation errors are modelled at sync (dry-run), not at render** – a schema-invalid but well-formed YAML renders fine in Argo CD and fails in the sync dry-run, as here. Only the first error is reported (the API server lists them all in `[…]`).
- **Operation processing is instant between ticks.** Real Argo CD re-processes a running operation on its own requeue cadence (seconds); here the next stage starts on the next 100 ms tick.
- **Source integrity**: only Git GnuPG policies; seal commits (`Argocd-gpg-seal` trailer) and annotated tags are not modelled.
- **The migration Job in wave −1 is a `Sync` hook** (`argocd.argoproj.io/hook: Sync` + `sync-wave: "-1"`), recreated on every sync. A plain (non-hook) Job would fail on the next image change because a Job's Pod template is immutable.
- **Secrets** are abstract strings (`sms-kljuc-v1`); E5 decides who can read what and owns the L23 eyes, rotation timing and goals. Ciphertexts are opaque tokens; „decryption” is a lookup only the holder of the right private key can do. A leak is permanent and covers the keys that exist at that moment. The SOPS age key is assumed provisioned in the repo-server after a rebuild (as in E5); `setSopsKeyInArgo(false)` removes it.
- **Rebuilt cluster** (`rebuildCluster`): automated sync reapplies everything at the next poll; with manual sync the app waits OutOfSync/Missing until „Sinkroniziraj” – `bootstrapSync: true` models a bootstrap script (E5's behaviour).
- **Pod/commit identifiers** are deterministic hashes (not real SHA-1/SHA-256); digests look like `sha256:<64 hex>`.

## Fact notes for lecture authors (checked against argo-cd v3.5.3, 2026-10-01)

These correct statements in `docs/curriculum.json` L22 (keyFacts[2], scene 4 „Odstupanje”, flagship model) and `docs/research/tech-facts.md` §5 „Automated sync”; the engine follows the source.

1. **„selfHeal vraća nakon 5 s” is out of date.** The auto-sync docs page still says *„after self-heal timeout (5 seconds by default)”*, but in 3.x `--self-heal-timeout-seconds` defaults to 0 and self-heal uses back-off (`--self-heal-backoff-timeout-seconds 2`, `factor 3`, `cap 300`). The wait is measured from the previous sync, so a first drift is reverted as soon as it is noticed (**1,6 s** in the sim, `TIMINGS.selfHealFirst`) and repeated drift on the same commit after 2 s, 6 s, 18 s … up to 5 min. Suggested wording: *„selfHeal vraća ručnu promjenu čim je Argo CD primijeti (za nekoliko sekundi); ako se odstupanje ponavlja, svaki sljedeći pokušaj čeka dulje (2 s, 6 s, 18 s … najviše 5 min).”* For a lecture that must show the old behaviour: `timing: { selfHeal: { mode: 'timeout', timeoutS: 5 } }`.
2. **„A failed sync is not retried on the same commit unless syncPolicy.retry is set” is only true for manual syncs.** `autoSync()` creates operations with `Retry: {Limit: 5}` when `syncPolicy.retry` is nil, so an automated sync retries 5× (5, 10, 20, 40, 80 s → Failed after **155 s**) and only then stops for that commit. Suggested wording: *„Neuspjela automatska sinkronizacija pokušava se još nekoliko puta (zadano 5, s rastućom stankom); nakon toga Argo CD za isti commit više ne pokušava – treba novi commit ili ručna sinkronizacija.”* The „retry” control must not be an on/off toggle: use a Segmented with `RETRY_PRESETS` + `RETRY_LABELS` (`nije postavljen (automatska 5×, ručna 0)` / `isključen` / `5×` / `neograničeno`), current value `retryPresetOf(state)`.
3. **„Missing if absent” is no longer app health in 3.5.** `controller/health.go setApplicationHealth`: *„Missing resources should not affect parent app health – the OutOfSync status already indicates resources are missing”*; the app is Missing only when none of its resources is live. Suggested fact: *„Obrisani Deployment: resurs je Missing, aplikacija OutOfSync – zdravlje aplikacije ostaje Healthy (Argo CD 3.5); Missing je cijela aplikacija tek kad u klasteru nema ničega iz Gita.”* In the UI highlight the resource node's Missing badge (`resourceTree`, `TreeNode.health`).
4. **Sync waves: Argo CD waits for health between waves, not after the last one.** After a non-final wave it pauses 2 s and waits until the wave is Healthy; the last wave (without hooks) ends the sync right after apply, so a migration Job in wave −1 delays the Deployment, but the sync is „Succeeded” while the new Pods are still starting (health stays Progressing).
5. **sourceIntegrity does not make the app „Unknown”**: the unsigned revision is still diffed (OutOfSync), a ComparisonError explains why, and syncs end in phase Error. Field names: AppProject `.spec.sourceIntegrity.git.policies[].{repos[].url, gpg.mode, gpg.keys}`, modes `none | head | strict`; cannot be combined with the legacy `signatureKeys`.
6. **The „Argo CD Redis” eye is red for KSOPS and for a plain Secret from Git too**, not only for argocd-vault-plugin – any manifest-generation path that renders readable secret values puts them in the manifest cache (Argo CD *Secret Management* page). E5 uses the same rule.
7. **„HPA bez requests.cpu” (L24 fault deck) is visible in Argo CD**: the HPA resource turns **Degraded** (`FailedGetResourceMetric`), so the app is Degraded while Synced – a second „Synced but Degraded” example next to the tag typo.
8. **A git revert that waits**: a fix commit cannot overtake an automated operation that is still retrying an older revision (up to ~155 s); the UI shows it as `queued` with „Prekini” as the way out.
9. Argo CD history is written only for successful **full** syncs; self-heal syncs (selective) do not add entries.
10. Rollout numbers use the prototype's 5 s termination (sim-models „Sim defaults” says 2 s shutdown, but the validated table was produced with 5 s).

## Validated numbers (all reproduced by `gitops.test.ts`)

| Behaviour | Engine | Reference |
|---|---|---|
| Commit → seen by Argo CD, polling (commit right after a poll, 200 seeds) | 12,1–18 s sim, mean 15,1 s | 120 s + U(0, 60) s real (L22 model, ÷10) |
| Commit at a random moment (200 seeds) | 0–18 s sim, mean ≈ 8 s (theory 7,6 s) | „najviše oko 3 min” |
| Commit → seen, webhook | 1,0 s | ≈ 1 s |
| Commit → synced / → Healthy (auto-sync, webhook, 4 Pods, 25 %/25 %) | 1,7 s / 25 s | — |
| L24 CI release → Healthy (`commitTimeline`, webhook) | 35 s sim · real ≈ 625 s (CI 10 s ↔ 600 s) | „Put jednog commita” |
| Rolling update N = 4, 25 %/25 %: duration, peak incl. terminating, peak non-terminating, min available | 27,5 s, 7, 5, 3 | 28 s, 7, ≤ 5, 3 (SIM 5) |
| surge 1 / unavailable 0 | 50,1 s, 6, 5, 4 | 51 s, 6, ≤ 5, 4 |
| surge 0 / unavailable 1 | 45,1 s, 5, 4, 3 | 46 s, 5, ≤ 4, 3 |
| 100 % / 0 | 16,2 s, 8, 8, 4 | 17 s, 8, ≤ 8, 4 |
| Broken image (crash or typo), N = 4 | stalls at 3 old Ready + 2 new | 3 + 2 (75 % capacity) |
| Broken image, N = 10, surge 3 / unavailable 2 | 8 old / 5 new | 8 / 5 (docs example) |
| … then scaled to 15 (proportional scaling) | 11 old / 7 new, Ready never below 8, ≤ 18 Pods | 11 / 7 (Kubernetes docs „Proportional scaling”) |
| … or scaled to 6 | 6 / 3 at once, then 4 / 5; Ready ≥ 4 at every tick | rolling.go + sync.go |
| `l22Hpa` + „Loš commit” (HPA 4 → 6 during the stall) | 5 old / 3 new, 5 Ready = 6 − maxUnavailable | proportional scaling |
| Bad commit → Degraded | 60,7 s after apply (60 s after the last progress; `progressDeadlineSeconds: 60` in YAML, real default 600) | Synced + Degraded, no auto rollback |
| Rollout invariants | non-terminating ≤ N + surge, ready ≥ N − unavailable at every tick | rolling.go |
| `kubectl scale --replicas=10`, selfHeal off | OutOfSync after ≤ 1 s, stays 10 | „stays unless selfHeal” |
| … selfHeal on | reverted 1,6 s after the change | „reverted only with selfHeal” |
| Self-heal waits on the same revision | 0, 2, 6, 18, 54, 162, 300, 300 s | argo-cd 3.5.3 defaults |
| Deleted Deployment | resource Missing, app OutOfSync + Healthy (3.5); selfHeal recreates it after 1,6 s, 4 Pods Ready after 8,7 s (cached image) | „restored by selfHeal” |
| File deleted from Git, prune off | orphan stays, auto-sync skips, manual sync → PruneSkipped | „orphan unless prune” |
| Invalid manifest, auto-sync, no `syncPolicy.retry` | 1 + 5 retries, Failed after 155,1 s, never again for that commit | `Retry{Limit: 5}` |
| HPA (2–10, needs 6) + `replicas: 4` + selfHeal | writes H15 A16,6 H30 A31,1 H45 A46,6 H60 A65,6 H75 A120,6 H135 A283,6 H285 A584,6 H585 → 7 fights in 600 s, never stops (A31,1: the poll at 30,5 s re-compares) | „flap (counter)” |
| `ignoreDifferences` alone | no fights until the next commit, then exactly 1 more | CRITICAL fix in curriculum |
| `ignoreDifferences` + `RespectIgnoreDifferences=true` | 0 fights after the next commit, replicas stay at the HPA's 6 | „peace” |
| Remove `replicas` from Git | without the migration step one write to 1 (narrated, `replicaDrops`, not a fight), HPA back to 2 at the next period, 6 later; with it none; no fights afterwards | Kubernetes HPA migration note |
| HPA without `requests.cpu` (`l24Full`, demand 8) | no scaling, HPA + app Degraded 16 s after the commit (next HPA period) | `FailedGetResourceMetric`, health_hpa.go |
| Sync waves (`l22Waves`, webhook) | Job (wave −1) created 1,6 s, done 4,6 s → Deployment (wave 0) applied 5,2 s → sync Succeeded 5,3 s → Healthy 28 s | waves + 2 s delay |
| Unsigned commit, sourceIntegrity `head`, auto-sync | OutOfSync + ComparisonError; operation Error after 155,1 s (5 retries); nothing applied | argo-cd 3.5 state.go / sync.go |
| SealedSecret rotation through Git (webhook) | Secret updated 2,6 s after the commit | L23 model |
| ESO rotation (refreshInterval `30s`) | Secret updated ≤ 30 s after the store change; volume Pods 10 s later; env Pods only after restart | L23 model |
| E3 + E6 through the glue loop (commit 2.0.1, webhook) | Progressing → Healthy at 26 s, never Healthy before E3 finished | — |
| Determinism | same config + seed + actions → identical events, Pod names, SHAs | AUTHORING §5 |

## API

All functions take the mutable state first. Actions mutate it (call them inside `sim.mutate`); selectors only read (a test checks every selector leaves the state byte-identical).

### Create and run

| | |
|---|---|
| `createGitOps(config?: GitOpsConfig): GitOpsState` | Builds repo history (3 signed commits), registry, live cluster (Pods Ready, image cached, HPA settled) and Argo CD synced to HEAD 10 min ago. |
| `step(state, dtSeconds)` | Advances with an internal 100 ms tick (accumulator; ignores 0/negative/NaN, clamps one call to 60 s). Plug straight into `useSimulation({ step })`. |
| `advance(state, seconds)` | Run ahead (tests, „preskoči” buttons). |
| `PRESETS.l22 / l22Auto / l22Hpa / l22Waves / l22Push / l23 / l24 / l24Full` | Spread and override: `createGitOps({ ...PRESETS.l22, webhook: true })`. |

`GitOpsConfig` (all optional): `seed` (22), `mode: 'pull'|'push'`, `timing` (any `ResolvedConfig` value, e.g. `pollIntervalS`, `selfHeal`, `argoCacheExpiryS`, `pod.pullS`), `policy` (`automated, prune, selfHeal, allowEmpty, retry, respectIgnoreDifferences` – defaults all off / `retry: null`), `ignoreDifferences`, `webhook` (false), `sourcePlugin` (`'none'|'argocd-vault-plugin'|'ksops'`), `project: { restricted, sourceIntegrity }`, `protection: { requirePullRequest, requireSignedCommits }`, `initialTag` (`'1.4.0'`), `replicas` (4, `null` = omitted), `hpa: { min, max }`, `hpaDemand`, `promo` (ConfigMap `klopa-promo`, default on), `migration: 'none'|'presync'|'wave'` (`migrationHook: true` = `'presync'`), `configMapWaveMinus1`, `secrets: 'none'|'plain'|'sealed'|'sops'|'eso'|'csi'|'avp'|'manual'`, `secretConsumption: 'env'|'volume'`, `images` (`{ tag, behaviour, repo?, bugRate? }`), `extraFiles` (more files in the initial commit), `app: { name, path }`.

### Actions (Croatian control labels from the curriculum)

| Action | Control |
|---|---|
| `commitImage(s, tag, opts?)`, `commitReplicas(s, n \| null)`, `commitField(s, path, field, value)` | „Commit u Git” (invalid image references → `{ ok: false }`) |
| `commitChanges(s, FileChange[], opts?)` | L24 „Uređivač config repozitorija” + „Commit”: several files/fields in one revision (`{ path, manifest }` add/replace, `{ path, manifest: null }` delete, `{ path, set: { pointer: value \| null } }`) |
| `commitBadImage(s, 'typo' \| 'crash')` | „Loš commit” (`2.0.l` → ImagePullBackOff, `1.5.0` → CrashLoopBackOff) |
| `commitInvalidManifest(s)` | sync fails in the dry-run (retry demo) |
| `deleteFileFromGit(s, path = configmap-promo)` | „Obriši datoteku iz Gita” |
| `addHpaToGit(s, min, max)` | „replicas u Gitu + HPA” |
| `removeReplicasFromGit(s, migrate)` | „ukloni replicas iz Gita” (with/without the migration step) |
| `gitRevert(s, sha?)`, `revertLastChange(s)` | „git revert” |
| `attackerCommit(s, 'image' \| 'rbac')` | unreviewed, unsigned push (pull moves the keys) |
| `startCiRelease(s, version, behaviour?, bugRate?) → runId \| null` | CI bot lane (10 s sim) → bot commit `tag@digest` (pull) or `kubectl apply` (push); `bugRate` defaults to what the registry knows about the tag (2.0.0 keeps its 20 % VAT bug) |
| `syncApp(s, { prune?, resources? })`, `refreshApp(s, hard?)`, `terminateSync(s)`, `argoRollback(s, historyId)` | „Sinkroniziraj”, „Osvježi”, „Prekini”, history rollback |
| `setSyncPolicy(s, { automated, prune, selfHeal, allowEmpty, respectIgnoreDifferences })`, `setRetry(s, RetryStrategy \| null)`, `setWebhook(s, on)` | „Automatska sinkronizacija”, „selfHeal”, „prune”, „retry” (`RETRY_PRESETS`), „Webhook” |
| `setIgnoreReplicas(s, on)`, `setRespectIgnoreDifferences(s, on)`, `setIgnoreDifferences(s, rules)` | „ignoreDifferences” / „+ RespectIgnoreDifferences” |
| `setSourceIntegrity(s, mode)`, `setProjectRestricted(s, on)`, `setRepoProtection(s, patch)`, `setDeliveryMode(s, 'push' \| 'pull')` | security scene |
| `kubectlScale(s, n)`, `kubectlEdit(s, kind, name, path, value)`, `kubectlSetImage(s, tag)`, `kubectlDelete(s, kind, name)`, `rolloutRestart(s)`, `rolloutPause(s, on)` | „Ručni kubectl scale --replicas=10”, „Netko obriše Deployment”, Suspended demo (validated like the API server: negative/non-integer counts, invalid fields → false) |
| `setHpaDemand(s, n)`, `setDatabaseDown(s, on)`, `rebuildCluster(s, { restoreSealingKeys, bootstrapSync })` | load, DB outage, „novi klaster” |
| `setSecretsApproach(s, approach, { consumption?, value? })` | L23 „Segmented pristup” / „Segmented potrošnja” (one commit; plugin switched) |
| `commitPlainSecret`, `commitSealedSecret`, `commitSopsSecret`, `commitExternalSecret`, `kubectlApplySecret`, `rotateSecret`, `setStoreAvailable`, `renewSealingKey`, `backupSealingKeys`, `leakSealingKeys`, `renewSopsKey`, `leakSopsKey`, `setSopsKeyInArgo`, `leakCiCredentials` | L23 „Spremi običan Secret u Git”, „Rotiraj ključ”, „Trezor nedostupan”, „Izgubi/Procurio privatni ključ”, „Token u CI logu” |
| `setExternalWorkload`, `setExternalWorkloadStatus`, `setHpaDesired`, `reportExternalSpec`, `reportExternalChange`, `drainLiveChanges` | E3 bridge (below) |

### Selectors

- `appView` – sync, health, `behindGit`, running/last operation with retry countdown, conditions, `autoSyncNote` (why auto-sync is or is not acting, incl. „Novi commit … čeka: operacija za … se ponavlja”), policy. `retryPresetOf` – the current `RETRY_PRESETS` id.
- `pollRing` – progress 0..1, `nextInS`, `label`, webhook pending.
- `deliveryView(s, limit?)` – the newest commits with stable ids (`sha`), `hop` (`refresh` → `sync` → `rollout` → `done`, or `queued` (with `blockedBy`) / `blocked` / `superseded` / `notDeployed`) and `progress` 0..1 along the hop: the commit-dot animation for L22 and L24. `deployedRevision(s)` – the revision the cluster corresponds to (also when it became Synced without a sync).
- `commitTimeline(s, sha?)` – L24 „Put jednog commita”: stations `ci, commit, seen, outOfSync, syncStarted, applied, rsCreated, firstScheduled, imagePulled, firstReady, allReady, healthy` with `simS`, `realS`, `compressed` and a ready label („35 s (sim) · stvarno ≈ 625 s”), `STATION_LABELS`. `commitLatency(sha)` – seconds to seen/sync/synced/healthy in sim and `realS`.
- `diffView` (entries with `ignored`), `resourceTree` (Application → objects → ReplicaSets → Pods / owned Secret / hook Pod; each node has `sync`, `health`, `status`, `tag`, `broken`, `newVersion`), `commitGraph` (lanes human/bot/attacker, signed/trusted, HEAD/known/deployed markers, revert links, pipeline timestamps), `deployHistory`, `repoFiles(s, sha?)` (file tree with `inAppPath`, `change`), `manifestToYaml(manifest)` (kubectl-style YAML).
- `podsView` (+ `kitStatus` for the kit `PodShape`, `current`, `stage` / `stageProgress` 0..1 / `pulledFromCache` for smooth animation), `capacity`, `liveImageTag`, `gitImageTag`, `replicaFight` (incl. `drops`), `hpaView` (conditions + health), `l22Goals` (the four L22 tasks), `deploymentSpec` (E3 bridge). With an external workload all Pod views show the reported Pods.
- `deployPaths`, `integrityStatus`, `gitMatchesCluster`, `gitLeaks` (`exposedCurrent/Stale`, `argoCacheHasPlaintext`, `argoCacheValues`), `argoCacheView`, `secretView`.
- CLI text (real formats): `kubectlGetPods`, `kubectlGetEvents` („5s (x3 over 30s)”), `kubectlDescribePod(s, podId)`, `kubectlRolloutStatus(s, name?)`, `argocdAppGet`, `argocdAppDiff`, `helmList` (always empty – Argo CD runs `helm template`). `kubectl logs` / `get endpointslices` belong to E3 (traffic and endpoints are simulated there).
- Health helpers: `objectHealth(s, key)`, `deploymentHealth`, `hpaHealth(conditions)`, `validateManifest(manifest)`, `renderTarget(s, sha)` (pure render).
- State fields useful directly: `state.events` (≤ 50, `{ id, t, kind, text, tone }` → kit `EventLog`), `state.metrics.*` (`Series`, 1 s samples → `LineChart`), `state.stats`, `state.cluster.replicaWrites`, `state.cluster.kubeEvents`, `state.ci.runs` (`progress` 0..1).

### Constants

`TIMINGS.*` – `{ simValue, realValue, label, compressed }` for every shortened value (poll, jitter, progress deadline, readiness period, CI, ESO refresh, volume sync, Argo CD cache, first self-heal…); `REAL_FACTOR` (poll ×10, CI ×60), `POD_TIMINGS`, `SYNC_RETRY_DEFAULTS`, `AUTO_SYNC_DEFAULT_RETRY_LIMIT`, `RETRY_PRESETS`, `RETRY_LABELS`, `PATHS` (JSON pointers), `FILES`, `KLOPA`, `API_VERSIONS`, `POD_QUOTA`, `selfHealDelay(state, attempts)`; manifest builders (`workloadManifest`, `serviceManifest`, `httpRouteManifest`, `hpaManifest`, …).

### Post-lecture review additions (2026-10)

- `PRESETS.l24FullDetailed` – `l24Full` as the L24 YAML shows it (additive; `l24Full` is unchanged): the ConfigMap `klopa-promo` (Ćevap-petak popust), `apps/postgres/externalsecret-db.yaml` (ExternalSecret `klopa-db` ← store key `klopa/db-lozinka`), and on the Postgres StatefulSet env `POSTGRES_PASSWORD` (secretKeyRef `klopa-db/password`) plus the volumeMount `podatci` → `/var/lib/postgresql`. Synced + Healthy after start. Not included: the image as `tag@digest` (the engine's image parsing and catalogue are tag-based).
- `GitOpsConfig.storeValues` – extra keys in the external secret store next to the SMS key. `DB_SECRET`, `dbExternalSecretManifest()`, `FILES.dbExternalSecret`.

## Usage in a lecture

```tsx
// src/lectures/22-gitops-argo-cd/sims/GitIstinaSim.tsx
import { SimFrame, Button, Toggle, Segmented, ControlGroup, Goals, EventLog, Stat, StatRow, Badge, useSimulation } from '../../../kit'
import {
  createGitOps, step, PRESETS, TIMINGS, RETRY_PRESETS, RETRY_LABELS, appView, pollRing, resourceTree, deliveryView, l22Goals,
  retryPresetOf, commitImage, syncApp, gitRevert, commitBadImage, kubectlScale, kubectlDelete, deleteFileFromGit,
  setSyncPolicy, setRetry, setWebhook, setIgnoreReplicas, setRespectIgnoreDifferences, addHpaToGit, removeReplicasFromGit,
  type RetryPresetId,
} from '../../../engines/gitops'

const RETRY_IDS: RetryPresetId[] = ['notSet', 'none', 'five', 'unlimited']

export function GitIstinaSim() {
  const sim = useSimulation({ init: () => createGitOps(PRESETS.l22), step })
  const s = sim.state
  const app = appView(s)
  const ring = pollRing(s)
  const goals = l22Goals(s)
  const head = deliveryView(s, 1)[0]
  return (
    <SimFrame
      title="Git je istina"
      sim={sim}
      showTime
      hint="Uvedite 2.0.1 samo commitom – pa pokvarite klaster i gledajte što Argo CD radi."
      controls={
        <>
          <ControlGroup title="Git">
            <Button variant="primary" onClick={() => sim.mutate((x) => commitImage(x, '2.0.1'))}>Commit u Git</Button>
            <Button onClick={() => sim.mutate((x) => gitRevert(x))}>git revert</Button>
          </ControlGroup>
          <ControlGroup title="Argo CD">
            <Toggle label="Automatska sinkronizacija" checked={app.policy.automated} onChange={(v) => sim.mutate((x) => setSyncPolicy(x, { automated: v }))} />
            <Toggle label="selfHeal" checked={app.policy.selfHeal} onChange={(v) => sim.mutate((x) => setSyncPolicy(x, { selfHeal: v }))} />
            <Toggle label="prune" checked={app.policy.prune} onChange={(v) => sim.mutate((x) => setSyncPolicy(x, { prune: v }))} />
            {/* not a Toggle: „nije postavljen” still retries automated syncs 5× */}
            <Segmented
              label="retry"
              size="sm"
              value={retryPresetOf(s) ?? 'notSet'}
              options={RETRY_IDS.map((id) => ({ value: id, label: RETRY_LABELS[id] }))}
              onChange={(id) => sim.mutate((x) => setRetry(x, RETRY_PRESETS[id]))}
            />
            <Toggle label="Webhook" checked={ring.mode === 'webhook'} onChange={(v) => sim.mutate((x) => setWebhook(x, v))} />
            <Button onClick={() => sim.mutate((x) => syncApp(x))}>Sinkroniziraj</Button>
          </ControlGroup>
          <ControlGroup title="Mir s HPA-om">
            <Button onClick={() => sim.mutate((x) => removeReplicasFromGit(x, true))}>ukloni replicas iz Gita</Button>
            <Button onClick={() => sim.mutate((x) => setIgnoreReplicas(x, true))}>ignoreDifferences</Button>
            <Button onClick={() => sim.mutate((x) => { setIgnoreReplicas(x, true); setRespectIgnoreDifferences(x, true) })}>ignoreDifferences + RespectIgnoreDifferences</Button>
          </ControlGroup>
          <ControlGroup title="Pokvari">
            <Button variant="danger" onClick={() => sim.mutate((x) => kubectlScale(x, 10))}>Ručni kubectl scale --replicas=10</Button>
            <Button variant="danger" onClick={() => sim.mutate((x) => kubectlDelete(x, 'Deployment', 'klopa-api'))}>Netko obriše Deployment</Button>
            <Button variant="danger" onClick={() => sim.mutate((x) => deleteFileFromGit(x))}>Obriši datoteku iz Gita</Button>
            <Button variant="danger" onClick={() => sim.mutate((x) => commitBadImage(x, 'typo'))}>Loš commit</Button>
            <Button variant="danger" onClick={() => sim.mutate((x) => addHpaToGit(x))}>replicas u Gitu + HPA</Button>
          </ControlGroup>
        </>
      }
      stats={
        <StatRow>
          <Stat label="Sinkronizacija" value={app.sync} tone={app.sync === 'Synced' ? 'ok' : 'warn'} />
          <Stat label="Zdravlje" value={app.health} tone={app.health === 'Healthy' ? 'ok' : app.health === 'Progressing' ? 'blue' : 'bad'} />
          <Stat label="Sljedeća provjera Gita" value={ring.nextInS.toFixed(0)} unit="s" sub={TIMINGS.pollTotal.label} />
          <Stat label="Borbe s HPA-om" value={s.stats.replicaFights} />
        </StatRow>
      }
    >
      {/* left: commitGraph(s) + repoFiles(s); right: resourceTree(s) drawn with DNode/PodShape (Missing badge on the node!); commit dot from head.hop/head.progress */}
      <Badge tone={app.behindGit ? 'warn' : 'ok'}>{head ? `${head.short}: ${head.text}` : ''}</Badge>
      <pre>{resourceTree(s).map((n) => `${n.kind}/${n.name} ${n.sync ?? ''} ${n.health ?? ''} ${n.status}`).join('\n')}</pre>
      <Goals goals={[
        { text: 'Uvedite 2.0.1 samo commitom', done: goals.shipped },
        { text: 'Ručno odstupanje neka se samo vrati', done: goals.driftReverted },
        { text: 'Vratite loš commit na GitOps način', done: goals.badCommitReverted },
        { text: 'Zaustavite borbu Argo CD-a i HPA-a – i nakon sljedećeg commita', done: goals.hpaPeace },
      ]} />
      <EventLog events={s.events} />
    </SimFrame>
  )
}
```

Import path: the engine files use explicit `.ts` extensions so they run under Node's type stripping; from `.tsx` lecture code import the folder index (`'../../../engines/gitops'`) or `'…/gitops/index.ts'` – both work with the project's `allowImportingTsExtensions`. The example above type-checks against the current kit.

## Which lecture uses what

| Lecture | Preset | Features |
|---|---|---|
| **L22** „Gurati ili povlačiti” | `l22Push` vs `l22` | `setDeliveryMode`, `deployPaths`, `leakCiCredentials`, `attackerCommit`, `setRepoProtection`, `setSourceIntegrity`, `setProjectRestricted`, `integrityStatus` |
| L22 „Od commita do sinkronizacije” | `l22` (+ webhook toggle) | `pollRing`, `deliveryView`, `commitLatency` (sim + real), `appView.behindGit`, `diffView`, sync vs health badges (`rolloutPause` → Suspended while Synced), `startCiRelease` (CI bot lane) |
| L22 „Odstupanje” | `l22Auto` | `kubectlScale`, `kubectlEdit`, `kubectlDelete` (resource Missing, app OutOfSync), `deleteFileFromGit`, selfHeal/prune toggles, `autoSyncNote` (self-heal back-off countdown, queued fix), `commitInvalidManifest` + `retryPresetOf` / `RETRY_LABELS` |
| L22 „Rollback je git revert” | `l22Auto` | `commitBadImage`, `gitRevert`, `commitGraph`, `deployHistory`, `argoRollback` (why not), `helmList`; DeepDive sync waves: `l22Waves` (+ `setDatabaseDown`) |
| L22 „Argo CD i HPA” | `l22Hpa` | `replicaFight`, `hpaView`, `setIgnoreReplicas`, `setRespectIgnoreDifferences`, `removeReplicasFromGit(migrate)` (the drop is narrated) |
| L22 flagship goals | any | `l22Goals` |
| **L23** „Put tajne (2. dio)” (E5 owns the eyes and goals) | `l23` | `setSecretsApproach` (Segmented pristup / potrošnja, one commit), `commitPlainSecret`, `commitSealedSecret`, `commitSopsSecret`, `commitExternalSecret`, `rotateSecret`, `rolloutRestart`, `setStoreAvailable`, `leakSealingKeys` + `renewSealingKey`, `leakSopsKey` + `renewSopsKey`, `rebuildCluster({ restoreSealingKeys })`, `gitLeaks`, `argoCacheView`, `secretView`; `gitLeaks().exposedCurrent` ↔ E5 „Git-history reader”, `argoCacheHasPlaintext` ↔ E5 „Argo CD Redis” |
| L22 bridge / L23 hook | `{ ...PRESETS.l22Auto, secrets: 'manual' }` | `rebuildCluster` → `CreateContainerConfigError` |
| **L24** „Put jednog commita” | `l24` | `startCiRelease` → `commitTimeline` (stations, sim/real labels) / `deliveryView` / `commitLatency`; `podsView().stage` for the Pod animation |
| L24 „Incident u 12:00” | `l24Full` (whole Klopa config repo; `l24` for klopa-api only) | `commitChanges` / `commitField` as the only fix path (`repoFiles` + `manifestToYaml` for the editor), `commitBadImage('typo')` (Synced + Degraded), removing `requests.cpu` (HPA Degraded), `kubectlScale`/`kubectlEdit` with selfHeal (manual fixes reverted), `kubectlGetPods`, `kubectlGetEvents`, `kubectlDescribePod`, `kubectlRolloutStatus`, `argocdAppGet`, `argocdAppDiff`, `commitLatency` for MTTR; with E3 for traffic/scheduler/probes: the bridge below |

## Combining with E3 (Klaster)

E6 keeps its own minimal workload model so it never depends on E3 internals; its rules and timings are the validated SIM 5 ones, so numbers agree with L13. When a lecture needs both (L24 with the scheduler, probes, traffic or real HPA maths), E6 hands the Pods over through a small, engine-neutral contract. The loop below is the one `gitops.test.ts` runs side by side with E3 („E3 + E6 side by side through the README glue loop”):

```ts
import * as G from '../../../engines/gitops'
import * as K from '../../../engines/cluster'

// one state for useSimulation({ init, step: stepBoth })
const git = G.createGitOps({ ...G.PRESETS.l24Full })
const k8s = K.presetRollout({ version: '2.0.1' })
G.setExternalWorkload(git, 'klopa-api', true)               // E6 stops simulating Pods for this Deployment
const glue = { pushed: G.deploymentSpec(git, 'klopa-api')!.templateHash, observed: '', pushedAtTick: -1 }
glue.observed = glue.pushed
export const init = () => ({ git, k8s })

/** Map a field Argo CD applied onto the lecture's E3 preset (whatever that preset models). */
function mapToE3(k8s: K.ClusterState, ch: G.LiveChange) {
  if (ch.kind === 'Service' && ch.path === G.PATHS.serviceSelector && typeof ch.after === 'string') K.setServiceSelectorByName(k8s, ch.name, { app: ch.after })
  // … HTTPRoute rules, memory limits, probes, ConfigMaps
}

export function stepBoth(s: { git: G.GitOpsState; k8s: K.ClusterState }, dt: number) {
  G.step(s.git, dt)
  // E6 → E3: the Deployment spec Argo CD (or kubectl / the HPA) last wrote
  const spec = G.deploymentSpec(s.git, 'klopa-api')!
  if (spec.templateHash !== glue.pushed) {
    K.setDeploymentVersion(s.k8s, 'klopa-api', spec.tag as K.KlopaApiVersion)   // or patchDeploymentTemplate(…)
    glue.pushed = spec.templateHash
    glue.pushedAtTick = s.k8s.tick
  }
  const d = K.findDeployment(s.k8s, 'klopa-api')!
  if (spec.effectiveReplicas !== d.replicas) K.scaleDeployment(s.k8s, 'klopa-api', spec.effectiveReplicas)
  // E6 → E3: every other field Argo CD applied (Service selector, HTTPRoute rule, memory limit, ConfigMap …)
  for (const ch of G.drainLiveChanges(s.git, { by: ['argocd'] })) mapToE3(s.k8s, ch)
  K.stepCluster(s.k8s, dt)
  if (s.k8s.tick > glue.pushedAtTick) glue.observed = glue.pushed            // E3's controllers have seen the new template
  // E3 → E6: status + Pods; Argo CD health is derived from it (health_deployment.go)
  G.setExternalWorkloadStatus(s.git, 'klopa-api', {
    ...d.status,
    observedTemplateHash: glue.observed,                                     // REQUIRED after a template change
    progressDeadlineExceeded: d.conditions.progressing.reason === 'ProgressDeadlineExceeded',
    pods: s.k8s.pods.filter((p) => p.labels.app === 'klopa-api').map((p) => ({
      id: p.name, status: K.podStatus(p), ready: K.isReady(p), tag: p.spec.image.split(':').pop() ?? '',
      restarts: p.container.restartCount, ageS: s.k8s.t - p.createdAt, terminating: p.deletion !== null,
    })),
  })
  // E3's HPA decides; E6 only records the write (no second HPA policy): G.setHpaDesired(s.git, 'klopa-api', e3Hpa.desired)
  // E3's console changed something by hand → drift in E6 (selfHeal reverts it):
  //   G.reportExternalChange(s.git, 'Service', 'klopa-api', G.PATHS.serviceSelector, 'klopa-apl')   // path '' + null = delete
}
```

Contract rules:

- **Status is current only when E3 has seen the spec.** A report counts as current when it names `observedGeneration`, or echoes the live `templateHash` (`observedTemplateHash`), or – for pure scaling (HPA, kubectl scale) – has neither field while no template change is pending. Until then Argo CD shows Progressing („observed deployment generation less than desired generation”), like a real controller that has not caught up; a stale „all updated” report of the old template can never make the new revision Healthy.
- **Pods**: pass them in `pods` and every E6 Pod view (`podsView`, `capacity`, `kubectlGetPods`, `resourceTree`, `deliveryView`, `l22Goals`) shows them.
- **HPA**: use `setHpaDesired` (writes exactly E3's number as the HPA, switches E6's own HPA maths off for it) – not `setHpaDemand`, which would run E6's 15 s policy next to E3's HPA.
- **Writers**: drain with `by: ['argocd']` so changes reported from E3 (`'kubectl'`) do not echo back; Secrets the controllers write come with `by: 'controller'`.
- Sync status, drift, self-heal, prune and the HPA fight stay in E6.

## Sources

- argo-cd v3.5.3: `controller/appcontroller.go` (autoSync with `Retry: appv1.RetryStrategy{Limit: 5}`, alreadyAttemptedSync, selfHealRemainingBackoff, processRequestedAppOperation retry, needRefreshAppStatus), `controller/health.go` (setApplicationHealth: missing resources do not affect app health), `controller/sync.go` (ComparisonError blocks the operation, RespectIgnoreDifferences normalisation, delayBetweenSyncWaves), `controller/state.go` (source-integrity result → ComparisonError condition), `cmd/argocd-application-controller` (app-resync 120, jitter 60, self-heal timeout 0, back-off 2/3/300, cooldown deprecated), `pkg/apis/application/v1alpha1` (retry 5 s × 2, max 3 m), `util/sourceintegrity` (GIT/GPG messages), `gitops-engine/pkg/sync/sync_context.go` (dry run, multi-step waits, final wave), `gitops-engine/pkg/health/health_deployment.go`, `health_hpa.go`.
- Kubernetes: `pkg/controller/deployment/rolling.go`, `sync.go` (`scale()`, `isScalingEvent`), `util/deployment_util.go` (`GetReplicaSetProportion`, `getReplicaSetFraction`, `ResolveFenceposts`, replica annotations), `pkg/apis/apps/validation/validation.go` (rollingUpdate rules), `pkg/controller/podautoscaler/horizontal.go` + `replica_calculator.go` (conditions, „missing request for cpu”); Deployment docs „Proportional scaling”.
- Argo CD docs: auto-sync, sync options (RespectIgnoreDifferences, PruneLast), sync waves, source integrity (Git GnuPG), secret management.
- docs/research/tech-facts.md §4–6, docs/research/sim-models.md E1 pitfalls + E2 (SIM 5), docs/curriculum.json L22–L24, src/engines/access/README.md (E5 eye rules).
