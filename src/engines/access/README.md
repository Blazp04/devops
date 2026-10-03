# E5 „Tko vidi?” – secret access-graph engine

Pure TypeScript (no React, no DOM), seeded and deterministic. Used by **L16** „Put tajne” (ConfigMap i Secret) and **L23** „Put tajne (2. dio)” (Upravljanje tajnama u GitOpsu). E5 owns the L23 flagship (eyes, rotation timing and goals); E6 (`src/engines/gitops`) only shares the rules (see „Relation to E6”).

```bash
node --test src/engines/access/*.test.ts    # 160 tests
```

## What it models

A threat model around one or more secrets (DB password `klopa-db`, SMS key `klopa-sms`):

- **Approach** (`Approach`: where the value is kept and how it reaches the cluster): `image` (Dockerfile `ENV`), `manifest-env` (literal in deployment.yaml), `configmap`, `secret` (applied by hand with kubectl), `git-secret` (plain Secret in Git), `sealed` (SealedSecret), `sops`, `eso` (External Secrets Operator + store), `csi` (Secrets Store CSI Driver), `avp` (argocd-vault-plugin).
- **How Pods consume it**: `env`, `volume`, `subPath`, per Deployment (`image`/`manifest-env` are always env).
- **Controls**:
  - Encryption at rest, with the provider and the list of encrypted resources.
  - RBAC with the built-in `view`/`edit` roles, a custom `deployer` role, a `list secrets` role and per-verb custom rules (`setActorRules`). RBAC is additive.
  - Sealed Secrets: key backup and automatic key renewal.
  - CSI: rotation and optional sync to a Secret.
  - Argo CD: webhook and automated sync (`syncPolicy.automated`).
  - Laptop disk encryption.
- **Delivery**: `kubectl` (L16: applied at once) or `gitops` (L23: Argo CD polls Git, renders manifests into its Redis cache, syncs).
- **Assets** (`assetsOf`: every copy of the value right now): Git history (plain, base64, SealedSecret, SOPS, reference), image, etcd (plaintext or ciphertext and where the key is), SealedSecret object, external store, Argo CD's Redis cache, env vars and mounted files of running Pods (tmpfs for Secret/CSI volumes, node disk for ConfigMap volumes), logs, CI log, the laptop's secret.yaml and a former team member's memory. Each asset lists the actors that read a valid value through it (`readers`, and `visibleReaders` for the eyes the lecture shows).
- **Who can read** a still-valid value, and how (13 actors, the „eyes”). For each actor the engine gives:
  - the ways the actor can read a valid value, each with the assets it reads, the route over graph nodes, Croatian steps, a Croatian explanation, a short form for event texts and evidence (e.g. `DB_PASSWORD: a2xvcGFfZGI=`);
  - the ways that only expose rotated-out (revoked) values;
  - the attempts that fail, with the control that stopped them.
- **Time**:
  - kubelet sync of mounted volumes, ESO `refreshInterval`, Argo CD polling with jitter, CSI rotation polling, Sealed Secrets key renewal, Argo CD cache expiry, Pod start and rolling restarts, image builds;
  - rotation, with old values valid until every running consumer uses the new one, and the **real-time equivalent** of every rotation (`realElapsed`) next to its simulated duration;
  - missing Secrets cause `CreateContainerConfigError` (env) or `ContainerCreating` + `FailedMount` (volume/CSI). They never crash the app.
- **Leaks („break-it”)**: secret.yaml committed to Git (deleting the commit does not help), env printed to logs, token in a CI log, controller key leaked or lost, store down, cluster rebuilt, a team member leaves.
- **Incidents and exposure** for the goals: store outages (Pods started / stuck during each), refused rotations, leaks and when they were closed; per-actor exposure windows (sampled once per simulated second).

### Evaluation rules (evaluate.ts)

| Actor (eye) | Red when… | Grey because… |
|---|---|---|
| `git-reader` Čitatelj Git repozitorija | Any valid value was ever committed in readable form. That includes plain/base64 Secrets, a Dockerfile `ENV`, an env literal, a ConfigMap, and a SealedSecret sealed with a leaked key. History counts: clones keep it. | SealedSecret/SOPS ciphertext, references (ExternalSecret, SecretProviderClass, AVP placeholder), only revoked values |
| `image-puller` Tko povuče sliku | A valid value is baked into an image tag in the registry (old tags stay) | – |
| `etcd-backup-thief` Kradljivac kopije baze etcd | The carrier object (Secret / ConfigMap / Deployment) is stored with `identity`. That includes kinds outside the EncryptionConfiguration list and objects written before encryption was enabled and not rewritten. **Also** when a Sealed Secrets key Secret (kube-system) is stored with `identity`: that key opens the SealedSecrets in Git (`etcd:sealing-key`). | encrypted (any provider: the key is not in the snapshot); not in etcd (image, CSI without sync) |
| `cp-disk-thief` Kradljivac diska upravljačke ravnine | Like the etcd thief, but **also red with a local-key provider** (aescbc / aesgcm / secretbox: key file on the same disk), for the carrier and for the sealing keys | only KMS v2 (KEK in an external KMS) |
| `view-user` Uloga view u Namespaceu | The value is in a ConfigMap or an env literal (view reads Pods, Deployments, ConfigMaps). Also when env was printed to logs (view has `pods/log`). | Secret (view deliberately has no `secrets` verbs) |
| `developer` Razvojni programer | Default role `edit`: get/list/watch secrets, create Pods, `pods/exec`. With least privilege the role is `view` (see the row above). | least privilege + Secret |
| `pod-creator` Smije stvarati Podove (CI bot, role `deployer`, no verbs on secrets) | A Secret/ConfigMap exists in the namespace (mount it – including the Secret the CSI driver syncs, whether or not the store is up), the CSI SecretProviderClass is reachable, or the value is in the image. The new Pod carries the value out of the cluster itself, so neither `get secrets` nor `pods/log` is needed (the deployer has neither). Honest limit. Also reads env literals (needs `get deployments` for `kubectl apply`). | the object does not exist; store down with CSI **without** sync |
| `compromised-pod` Kompromitirani Pod aplikacije | Any running consumer Pod (honest limit: the app must know the value); worded and attributed by where a **usable** value is (env var, mounted file, or both). Also the app's ServiceAccount token: rules set with `setServiceAccountRules` are evaluated like any identity from any running app Pod (`sa:` paths, closable, so not an honest limit). | no running consumer and no ServiceAccount rights |
| `log-reader` Čitatelj logova | env was printed to logs (`leakEnvToLog`) | consumed as a file; nothing printed |
| `ci-log-reader` Čitatelj CI logova | `leakToCiLog` | – |
| `argocd-redis` Pristup predmemoriji Argo CD-a | Argo CD rendered the plaintext **within the cache lifetime**: `avp`, a plain Secret / ConfigMap / env literal from Git, SOPS via KSOPS – also after switching to another tool | Sealed/ESO/CSI from the start; SOPS decrypted by Flux; renders expired; argocd-vault-plugin while the store was down (nothing rendered); not applicable with kubectl delivery |
| `laptop-thief` Kradljivac laptopa | Any of: the Git clone; the developer's kubeconfig (same RBAC as `developer`); a local plaintext secret.yaml (`secret` approach); the SOPS age key | full-disk encryption + locked screen |
| `ex-employee` Bivši član tima | Remembers a value that is still valid (L23 preset: version 1; `memberLeaves`) | after rotation; not applicable if nobody left |

Every eye turns grey for a value once it is **revoked**. Only rotation does that, never deleting a commit, re-encrypting, renewing a key or switching tools.

The RBAC eyes list every denied verb as its own blocked route (`get`, `list`, `watch`, create Pods, `pods/exec`, `pods/log`: one 403 each), so a UI can show „list → 403” next to „watch → čita”. A watch-only identity uses the raw watch API (`kubectl get --raw "/api/v1/namespaces/klopa/secrets?watch=1"`): `kubectl get --watch` lists first and would get a 403. A watch starts with an `ADDED` event, with full content, for every existing object.

## Deliberate simplifications (true, but incomplete)

- **One namespace, one cluster.** A Namespace is not a security boundary on its own. NetworkPolicy, Pod Security Admission, node root and ServiceAccount token abuse are not modelled.
- **Rotation = dual validity.** The source of truth gets a new value. Old values stay valid until every running consumer uses the new one; then they are revoked (`autoRevoke`). `revokeOld()` revokes early, and Pods that still hold the old value show failing logins. Real systems need a backend that accepts two credentials during the switch (two DB roles, two API keys).
- **Rolling restarts** follow `pkg/controller/deployment/rolling.go` with maxSurge 1 / maxUnavailable 0. This is exact for 1–3 replicas with the 25 % defaults; E3 has the full controller. The new ReplicaSet scales up within the surge. Old Pods are removed within `all − minAvailable − newUnavailable`, **unhealthy old Pods first**; a Running Pod is removed only while more than `replicas` are Running. So a new Pod stuck on a missing Secret stalls the rollout and the Running Pods keep serving. That holds when a second rollout starts on top of a stuck one too (the stuck Pod goes, never a Running one; fuzz-tested).
- **Kubelet sync**: one periodic sync per Pod (seeded phase) stands for „sync period + jitter + cache propagation delay” (sim 10 s ↔ real up to ~90 s). A deleted Secret leaves the last file content in place.
- **Migration** (`setApproach` without explorer mode) moves the current value into the new carrier at once. With GitOps delivery the commit → Argo CD → controller path is animated with flows (`state.flows`) but **not delayed**; only rotation timing is modelled per approach. Pods are replaced only when the Pod template changes (`templateKey`): between Secret-backed approaches (Secret, plain Secret in Git, SealedSecret, SOPS, ESO, AVP) `secretKeyRef` / the secret volume keep the same name, so Pods keep running. Old Git history and old Argo CD cache entries are kept, so old values stay readable until rotated. Ownership hand-over details (the Sealed Secrets controller refusing an unmanaged Secret, ESO `creationPolicy`) are not modelled.
- **etcd** keeps only the current revision (no MVCC history or compaction). Backups taken before encryption was enabled are not modelled separately. `setEncryption(…, { rewrite: false })` shows that existing objects stay plaintext until rewritten.
- **ESO / CSI / AVP store auth** is assumed to be workload identity. A static store token kept in a Secret, which the etcd thief would also steal, is not modelled.
- **ESO** reacts to a spec change (`setEsoRefreshInterval`) with an immediate sync, as the controller does when the resource version changes. In L23 that change would arrive through Git and Argo CD; the engine applies it directly.
- **Argo CD** renders HEAD at every refresh (poll, webhook, hard refresh). Readable renders stay in Redis for `argoCacheExpiry` (sim 12 min ↔ real 24 h); the current render is refreshed at every poll, so it never expires while in use. **argocd-vault-plugin** reads the store only when the manifests are generated: on a new commit, a hard refresh, or the first poll after the cached manifests expire (`argoCacheExpiry`). A store change therefore reaches the cluster within 24 h + one poll (real) without any action. While the store is down that generation fails (ComparisonError, reported once). Bootstrapping a rebuilt cluster applies everything, also with automated sync off.
- **Attempts** are judged when the token arrives (`resolve: 'arrival'`, default): the attempt happens then, so turning on KMS v2 while a disk theft is in flight stops it. `resolve: 'launch'` keeps a snapshot and the event names its time. A stolen etcd copy / disk also carries the Sealed Secrets keys stored readable in it (`state.leakedKeyIds`).
- **Animation pace**: tokens move in simulated time; `setAnimationScale(state, sim.speed)` stretches the hop and linger time of new tokens by the playback speed, so they keep the same wall-clock pace at 4×. It never changes a model outcome.
- **SOPS**: the age key is assumed to be provisioned in the cluster after a rebuild. Flux and Argo CD share the same poll timing (only Redis exposure differs).
- **Exposure windows** are sampled once per simulated second.
- **Secrets marked `optional: true`** and **`immutable: true`** are not modelled.

## Refinements relative to the spec text (docs/curriculum.json)

Each one is needed so the sim never teaches something false. Lecture authors should phrase the UI to match.

1. **Encryption scope.**
   - *Spec:* the etcd thief is grey for env literals, ConfigMaps and Secrets once encryption is on.
   - *Engine:* typical configs encrypt only `secrets` (`scope: 'secrets'`, the default). ConfigMaps and Deployments stay plaintext unless the scope is `secrets+configmaps` or `all`. Objects written before encryption was enabled stay plaintext until rewritten (`plainReason()` tells the two cases apart).
   - This is the L16 myth „ConfigMap ili Secret, svejedno je … encryption scope”.
2. **Developer role.**
   - *Spec:* the least-privilege toggle removes get/list on secrets/configmaps from the developer.
   - *Engine:* the developer is the built-in `edit` role (reads Secrets, creates Pods, may exec); least privilege swaps it for the built-in `view`.
   - With a Secret the outcome is the spec's (grey). With a ConfigMap or an env literal the developer stays red, because `view` reads ConfigMaps and Pod specs. That is the L16 point: only Secrets are excluded from `view`.
3. **Pod creator.** Also reads values baked into the image (it can run the image) and env literals (a deployer needs `get deployments`). With CSI sync it mounts the synced Secret, so a store outage does not protect the value from Pod creators (L23 insight: whatever the tool, the value ends up readable to whoever can create Pods).
4. **view** also reads env values printed to logs, because the built-in `view` role includes `pods/log`.
5. **`image` location.** The Dockerfile with `ENV` is in Git, so the Git reader is red too.
6. **Leaked Sealed Secrets key.**
   - *Spec:* „red until the real values are rotated”.
   - *Engine:* a value re-sealed with the leaked key is readable as well. The fix is early key renewal (`renewSealingKey`) **then** rotation, as the Sealed Secrets README says. Re-encrypting (`reencryptSealed`) changes nothing.
   - A leak is permanent: losing or replacing the key ring later (`loseControllerKey`, `rebuildCluster`) does not make old ciphertext safe again (`state.leakedKeyIds`).
7. **Argo CD Redis.**
   - *Spec:* red only for `avp`.
   - *Engine:* red whenever Argo CD rendered plaintext: `avp`, SOPS through KSOPS, and a plain Secret / ConfigMap / env literal from Git. The cache keeps those renders after a switch to another tool (`--repo-cache-expiration`, default 24 h), so only rotation or expiry closes the eye.
8. **CSI rotation** is off by default, like the real driver (alpha). With it off, only new Pods get a new value.
9. **Explorer mode and restarts.** In explorer mode (`whatIf`) a change of approach or consumption reconfigures Pods at once. During a rotation that counts as a restart (`restartsDuring`), so „Rotirajte lozinku bez ponovnog pokretanja Poda” cannot be met by rotating with env and then switching to a volume. Scaling a Deployment down during a rotation counts each removed Running Pod as a restart too (scaling to 0 and back is no shortcut).
10. **ESO `refreshInterval`** is not compressed. The Klopa ExternalSecret sets `refreshInterval: 30s` and ESO's default is 1 h; the badge reads „30 s (u YAML-u) · zadano: 1 h”, as in E6. The spec's „sim 30 s” is kept. With the 1 h default (`setEsoRefreshInterval(s, 3600)`) the „< 5 min” goal fails unless the student uses `forceEsoSync`.
11. **„< 5 min” is judged in real time.** Each compressed mechanism has its own factor (Argo CD ×10, kubelet ×9, CSI poll ×6, CI ×30). A rotation therefore records `realElapsed`: every simulated second is weighted by the factor of what it was waiting for (`rotationWait`), and the goal is checked on that. `rotationEstimate` gives the worst case for the current configuration.
12. **Argo CD automated sync.** The Klopa Application has `syncPolicy.automated` (`argo.autoSync: true`), while Argo CD's own default, taught in L22, is manual sync. With `autoSync: false` a poll or webhook only reports OutOfSync and `argoSyncNow()` applies.
13. **Sealed Secrets keys are Secrets.** The controller keeps its private keys as Secrets in kube-system (label `sealedsecrets.bitnami.com/sealed-secrets-key`). Each key records the provider it was stored with (`SealingKey.storedProvider`; `setEncryption` with rewrite and a rebuild rewrite them). An etcd copy or disk that holds them readable is a path to every SealedSecret in Git sealed with them, and a successful theft marks those keys as leaked. Encryption plus rotation does not close that hole: renew the key first, then rotate (as for `leakControllerKey`).
14. **When a rotation is complete.** Every Running consumer uses the new value, and at least one consumer runs, unless no consumer Pod exists at all (0 replicas: „nijedan Pod trenutačno ne koristi vrijednost”). Consumer Pods that are only starting or stuck defer completion and `autoRevoke`. Waiting on a stuck Pod counts as `blocked` while its Secret is missing, then as `kubelet` (the kubelet retries) once it exists.
15. **Migrating to a store while it is down** (not explorer mode) changes Git, but nothing comes out of the store. ESO reports `SecretSyncedError`, argocd-vault-plugin a ComparisonError, and CSI Pods cannot mount. A Secret left by the previous approach keeps serving (Argo CD does not prune by default). The value is written to the store when it returns (`setStoreAvailable(s, true)`). „Preživite nedostupan trezor” counts only Pods whose store-backed values reached the cluster from the store **before** the outage (`SecretRuntime.lastSyncedAt`).
16. **argocd-vault-plugin real time.** While a rotation waits for regeneration (`argo-cache`) the seconds count ×1, because a hard refresh could end the wait at once. If the cache expiry ends it instead, those seconds are re-weighted to the cache's ratio (×120): the rotation then took about 24 h real.

## API

```ts
import {
  createAccessPreset, step, evaluateAccess, eyeSummary, assetsOf, rotateSecret, setApproach, setConsume, setEncryption,
  setLeastPrivilege, commitPlainSecret, leakEnvToLog, stealEtcdBackup, stealControlPlaneDisk, rotationStatus,
  rotationEstimate, l16Goals, l23Goals, podView, rings, tokenSegment, TIMING, ACTORS,
} from '../../engines/access/index.ts'
```

### Creation and time

| Function | Notes |
|---|---|
| `createAccess(config?)` | `AccessConfigInput`: every field optional, nested objects merged with defaults. See `types.ts`. |
| `createAccessPreset(name, overrides?)` | Presets: `'l16'`, `'l16-timeline'`, `'l23'`, `'l23-rebuild'` (see `constants.ts` → `PRESETS`). |
| `step(state, dt)` | Any dt (s). Internal fixed DT = 0.1 s. NaN or negative dt is ignored; dt is capped at 3600 s per call. |
| `resolveConfig(input)` | Sanitised config (clamps replicas 0–20, drops dangling ids, invalid timings → defaults; `timing.esoRefresh: 0` is allowed = sync once). |

**Defaults:**

- seed 42, namespace `klopa`, one secret `db` (`secret`), Deployment `klopa-api` × 2 (env), delivery `kubectl`; `goalSecretId` = the focus; no `leakedAtStart`;
- encryption `identity` / scope `secrets`, developer `edit`;
- `appRereadsFiles: true`, `autoRevoke: true`, `whatIf: false`;
- Sealed Secrets: no key backup, auto-renew on; CSI: rotation off, sync off; Argo CD: webhook off, `autoSync` on; store up.

### Actions (mutate state; wrap in `sim.mutate`)

| Group | Functions |
|---|---|
| Configuration | `setApproach(s, secretId \| 'all', approach)` → `{ applied, reason }` (`reason`: Croatian caveat, e.g. the store is down); `setConsume(s, workloadId \| 'all', mode)` (no-op with a note for image / env literal; see `consumeLocked`); `setEncryption(s, provider, { scope?, rewrite? })`; `setLeastPrivilege(s, on)`; `setActorRoles(s, actorId, roles)`; `setActorRules(s, actorId, rules, label?)` (per-verb rules, e.g. only `watch` on secrets; `[]` removes); `setServiceAccountRules(s, rules, label?)` (the app's ServiceAccount = the compromised-Pod eye's API identity; default none); `setEsoRefreshInterval(s, seconds)` → interval in use (0 = sync once; a change syncs at once); `setArgoAutoSync(s, on)`; `setAppRereads(s, on)` (turning it on also picks up files that already changed); `setReplicas`, `setCsiRotation`, `setCsiSync`, `setArgoWebhook`, `setKeyBackup`, `setLaptop`, `setFocus`, `setVisibleActors`; `setAnimationScale(s, playbackSpeed)` (cosmetic, 0,25–64) |
| Rotation and recovery | `rotateSecret(s, id \| 'all'?)` → boolean (false: unknown id, or store down for store-based approaches); `revokeOld(s, id?)`; `restartPods(s, workloadId?)` (`kubectl rollout restart`); `forceEsoSync(s, id?)`; `argoHardRefresh(s)` (re-render; applies with automated sync); `argoSyncNow(s)`; `applySecretManually(s, id?)`; `resealAll(s)`; `renewSealingKey(s)` (early renewal); `reencryptSealed(s)` |
| Break-it | `commitPlainSecret(s, id?)` („Spremi secret.yaml u Git”); `deleteLeakedCommit(s, id?, { allPlain? })` (default: only leaked commits; `allPlain` also older readable commits, never the one HEAD deploys); `leakEnvToLog(s)`; `leakToCiLog(s, id?)`; `leakControllerKey(s)`; `loseControllerKey(s, { rebuild = true })`; `setStoreAvailable(s, false)`; `rebuildCluster(s)`; `memberLeaves(s)` |
| Attempts (animation) | `attempt(s, actorId, secretId?, { pathId?, channel?, resolve?: 'arrival' \| 'launch', strict? })` → `Attempt \| null` (default: first working route, judged on arrival; `success` is preliminary until `decidedAt`; `changedOnArrival`); `attemptOptions(s, actorId, secretId?)` → `{ pathId, channel, ok, action, outcome, label }[]` (working, revoked, then one blocked entry per denied verb: `outcome` „RBAC: 403 Forbidden”); `tryVerb(s, actorId, verb, resource, secretId?)` (one permission; a permission that leads nowhere fails); `attemptAll(s)`; `stealEtcdBackup(s)`; `stealControlPlaneDisk(s)` (a successful theft also takes readable Sealed Secrets keys) |

### Selectors (pure)

| Function | Returns |
|---|---|
| `evaluateAccess(s, secretId?)` | `AccessReport { verdicts (all 13 actors in ACTOR_ORDER), red, visibleRed, visibleTotal }` |
| `evaluateAll(s)` | `Record<secretId, AccessReport>` |
| `verdictOf(s, actorId, secretId?)` | `Verdict { reads, level: 'reads' \| 'stale' \| 'none', applicable, paths, stalePaths, blocked, honestLimit }`. Each `AccessPath` has `channel`, `assets`, `hops`, `steps`, `action` (command or phrase), `text`, `short` (≤ 60 characters), `evidence?`, `versions`, `honestLimit`; each `BlockedAttempt` has `action`, `reason`, `control`, `blockedAt`. |
| `assetsOf(s, secretId?)` | `Asset[]` in pipeline order: `{ id, kind, node, label, form: plain \| base64 \| encrypted \| reference, versions, valid, protection, readers, visibleReaders }`. A copy holding only revoked values has no readers. |
| `plaintextAssets(s, secretId?)` | assets holding a still-valid value as plain text or base64 („gdje živi običan tekst”) |
| `compareApproaches(approaches, base = PRESETS.l23, secretId?)` | `{ [approach]: { plaintext: AssetKind[], red, honestLimit } }`. Each approach is built fresh in explorer mode, without the former team member. For „Ostale mogućnosti”. |
| `redActors(s, secretId?, onlyVisible = true)` | `ActorId[]` |
| `eyeSummary(s, secretId?)` | `{ red, grey, total, honestLimit, redIds }` (visible eyes) |
| `explainVerdict(v)` | Croatian multi-line text |
| `can(s, actorId, verb, resource)`, `roleLabel(s, actorId)`, `actorLabel(s, actorId)` | `kubectl auth can-i`; „edit”, „view + list secrets”; eye label that stays true after rebinding |
| `rotationStatus(s, id?)` | `{ phase: idle \| waiting-delivery \| propagating \| done, record, elapsed (sim s), realElapsed (real-time equivalent), label („6,7 s (sim) ≈ 64,3 s stvarno”), waiting, stalePodIds, stalled (null once done), warning (non-blocking caveat, e.g. sealed with a leaked key) }`. `record.waits` = simulated seconds per `RotationWait`. |
| `rotationWait(s, id?)` | what an active rotation waits for: `argo-poll` / `argo-webhook` / `manual-sync` / `unseal` / `eso-refresh` / `image-build` / `kubelet` / `csi-poll` / `argo-cache` / `pod-start` / `action` / `blocked`, decided by the pending mechanism (never by a warning). `WAIT_RATIO` holds the real-time factor of each and `WAIT_LABELS` the Croatian label. |
| `rotationEstimate(s, id?)` | worst case for the current configuration: `{ parts: { what, sim, real }[], simWorst, realWorst, needs: string[] (manual actions required), shortcuts: string[] (manual actions that make it faster: force-sync, hard refresh), blocked, automaticUnder5Min, label }` |
| `l16Goals(s, { secretId? })` | `{ closeEyes, red, honestLimitRed, rotateWithoutRestart, podCreatorShown }` |
| `l23Goals(s, { secretId? })` | `{ gitGrey, rotateFast: { done, realElapsed, plaintextInGit }, leakHandled, leaks, survivedStoreOutage }` |
| goal rules | Goals judge `config.goalSecretId` (L23: the SMS key, L16: the DB password), not the focus. State goals (`closeEyes`, `gitGrey`) are live. Event goals are latched in `state.achieved` when they happen: `rotateWithoutRestart` / `rotateFast` at completion, `leakHandled` when the last open leak closes, `survivedStoreOutage` when a Pod starts on a pre-outage sync, `podCreatorShown` when the Pod creator's mount attempt succeeds while only honest limits are red. Read one with `achievedAt(s, goal, secretId?)`. |
| `storeOutageStatus(s)` | `{ active, since, podsStarted, podsBlocked, survived, next }`: `next` is a Croatian hint for „Preživite nedostupan trezor” (null when done) |
| `versionInGit(s, id, version)` | is that value version readable from Git history |
| `podView(s, id?)` | render-ready Pods: `{ id, workloadId, kitStatus: running \| creating \| pending \| terminating, label (kubectl STATUS), reason, message, statusTone, versionTone, usesVersion, stale, authFailing, outdated, startProgress }`. A missing Secret maps to `pending` / `creating`, never to the kit's `crash` (CrashLoopBackOff). `versionTone` is the PodShape tint (AUTHORING §5): the newest value after a rotation `violet`, an older value `blue`, a revoked value `rose`. |
| `consumeLocked(s, workloadId)` | `{ locked, reason }`: the consumption control does nothing (image ENV / env literal are always env vars) |
| `encryptionScopeInfo(s)` | `{ provider, scope, label („Šifriraju se samo Secreti”), uncoveredKinds }`: show it next to the encryption toggle |
| `rings(s)` | countdown rings `{ argo, eso[id] (+ status), csi[id], keyRenewal (+ keys) }`, each `{ progress 0..1, nextInS (null = never), intervalS, label }` |
| `tokenSegment(s, attempt \| flow)` | `{ from: node \| 'actor', to, f 0..1, progress }`, interpolated with `state.acc` for smooth 60 fps tokens |
| `exposure(s, id?, onlyVisible = true)` | `{ actorId, from, to (null = open), versions, duration }[]`: when each eye could read a valid value |
| `staleConsumers(s, id?)`, `authFailingPods(s)`, `podSummary(s)` | Pods not yet on the newest value; Pods using a revoked value; Pod counts |
| `gitLog(s, id?)` | commits newest first, each with `readable` / `valid` |
| `gitExposesValidValue(s, id \| 'all' = focus)` | goal „Svi čitatelji Gita sivi” (the focused secret by default) |
| `effectiveConsumeOf(s, workloadId, secretId?)` | env / volume / subPath as actually used (bind the consumption Segmented to this) |
| `plainReason(s, kind)` | `off` / `out-of-scope` / `not-rewritten`: why an `identity` object is plaintext |
| `secretValue(s, id?, version?)`, `toBase64`, `fromBase64` | the „Dekodiraj” scene |

### State for rendering (stable ids)

| Field | Contents |
|---|---|
| `state.pods` | `AppPod` objects with fixed ids (`klopa-api-3`): `status: AppPodStatus` (`ContainerCreating` / `Running` / `CreateContainerConfigError` / `Terminating`), `reason` (`FailedMount`), kubelet-style `message`, and per secret `env` / `file` / `uses` versions. Prefer `podView(s)`. |
| `state.secrets[i]` | `versions` (with `revokedAt`), `current`, `obj` (the carrier in etcd and its `storedProvider`), `storeVersion`, `sealedObj`, `esoStatus`, `avpRendered`, `rotation`, `rotations` |
| `state.commits` | Git history, each with `form`, `leak` and `removedFromBranch`; `state.images` |
| `state.sealedKeys` | the key ring, each key with `compromised`; `state.leakedKeyIds` keeps every key that ever leaked |
| `state.redisRendered` | Argo CD renders with a readable value `{ secretId, version, approach, t }` |
| `state.attempts`, `state.flows` | moving tokens with `hops`, `hopDur`, `hopIndex`, `hopProgress` and `progress` (0..1) along `GRAPH_NODES`. **Attempts** start at the actor's eye and travel to `hops[0]`, `hops[1]`, …. **Flows** start at `hops[0]` and take `(hops.length − 1) × hopDur` (`FLOW_HOP × animScale`). The fields change on the 0,1 s tick; draw with `tokenSegment()`. Attempts carry `success`, `text`, `short`, `pathId`, `control`, `resolve`, `decidedAt`, `changedOnArrival`; flows are cosmetic (`store-write`: laptop → store, `cache`: argocd → redis when a new readable render lands in the cache, plus commit / sync / eso / unseal / kubelet / csi / build / log / ci-log / restore). |
| `state.attemptLog` | ≤ 50 decided attempts `{ id, t, actorId, secretId, channel, pathId, success }` (outlives the tokens) |
| `state.achieved` | latched goals: `${goal}:${secretId}` (or `survivedStoreOutage`) → simulated time |
| `state.events` | ≤ 50 entries of `{ id, t, kind, text (Croatian), tone, count, group? }`; identical events at the same instant are merged into „… (×n)”, so `${t}-${text}` stays unique (the kit's EventLog key). Per-secret texts name the object (`klopa-sms: …`), so two secrets never merge. Events of one `group` replace each other (`key-renewal`: one row for the growing key ring). Pass them to `EventLog`. |
| `state.marks` | rotation timeline (`rotated` / `delivered` / `file` / `app` / `pod-started` / `completed` / `revoked`) with `workloadId` and `consume`, so the env / volume / subPath lanes survive Pod replacement |
| `state.incidents` | `outages[] { from, to, podsStarted, podsBlocked }`, `rotationsRefused`, `leaks[] { secretId, version, sha, t, closedAt, initial }` (`initial`: the preset's `leakedAtStart`) |
| `state.exposure` | exposure windows (≤ 200); read them with `exposure()` |
| `state.metrics` | `Series` (1 sample per simulated second, 120 kept): `redEyes`, `running`, `stale`, `authFailing` |
| `state.config` | the live toggles |

### Constants

| Constant | Contents |
|---|---|
| `TIMING` | `{ sim, simValue, real, realValue, unit, realLabel, label, compressed, ratio, inManifest, note? }` per value. `ratio` = real seconds per simulated second (1 = not compressed). `TIMING.kubeletSync.label` → „10 s (sim) · stvarno: s odgodom sinkronizacije kubeleta (do oko minute i pol)”, `TIMING.esoRefresh.label` → „30 s (u YAML-u) · zadano: 1 h”. `timingLabel(t, simOverride)` labels a slider value; `fmtDuration(s)` → „4,5 min”. |
| `ROTATION_GOAL_REAL_S` | 300 (goal „< 5 min”, judged on `realElapsed`) |
| `WAIT_RATIO`, `WAIT_LABELS` | real-time factor and Croatian label per `RotationWait` |
| `ACTORS`, `ACTOR_ORDER`, `L16_ACTORS`, `L23_ACTORS` | the eyes, each with `label` (eye) and `subject` (event sentences: „Korisnik koji smije stvarati Podove čita …”) |
| `ROLES` | RBAC roles |
| `APPROACHES`, `L16_APPROACHES`, `L23_APPROACHES` | approaches with Croatian Segmented labels and `plaintextLivesIn` |
| `PROVIDERS` | encryption providers with the docs' ranking, Croatian `note` and `versionNote` (software versions only for fact callouts, e.g. „KMS v2 je stabilan od Kubernetesa 1.29 (stanje: listopad 2026.)”) |
| `GRAPH_NODES` | pipeline layout hints (column 0–8, lane) |
| `CONTROL_LABELS` | Croatian names of the controls |
| `ASSET_NODE`, `ASSET_ORDER` | graph node per asset kind; pipeline order |
| `SECRET_MAX_BYTES`, `SECRET_TYPES` | 1 MiB limit and the built-in Secret types (scene „Dekodirajte”) |
| `SEALED_SCOPES` | `strict` / `namespace-wide` / `cluster-wide` with Croatian notes (scene „Sealed Secrets”; the engine models `strict` only) |

| Time | sim | real | real-time factor |
|---|---|---|---|
| kubelet sync (volume update) | 10 s | sync-frequency 1 min + up to 50 % jitter (~1,5 min) + cache delay → 90 s (same as E6 `volumeSync`) | ×9 |
| ESO `refreshInterval` | 30 s, **set in the YAML** | ESO default 1 h | ×1 (not compressed) |
| Argo CD poll | 12 s + 0–6 s | 120 s + up to 60 s (same ÷10 as E6) | ×10 |
| Argo CD webhook | 1 s | ~1 s | ×1 |
| Argo CD cache (Redis) | 12 min | 24 h (`--repo-cache-expiration`) | ×120 |
| CSI `rotation-poll-interval` | 20 s | 2 min (rotation alpha, off by default) | ×6 |
| Sealed Secrets key renewal | 60 s | 30 days | ×43 200 |
| unseal | 1 s | almost immediate | ×1 |
| Pod start / terminate | 3 s / 1 s | a few seconds / up to `terminationGracePeriodSeconds` | ×1 |
| image build (CI) | 20 s | CI pipeline, ~10 min (E6 uses 600 s too) | ×30 |

### Post-lecture review additions (2026-10)

- `attemptsRemainingS(state)` – simulated seconds until the last attempt in flight arrives (0 when none travels; an attempt covers `hops.length × hopDur` from `startedAt`). `settleAttempts(state)` steps the state until they have all arrived and returns the seconds advanced (for a paused sim or reduced motion). With `useSimulation`, call `sim.stepOnce(attemptsRemainingS(s) + 0.1)` instead so the hook keeps control of time.

## Usage in a React component

```tsx
import { useEffect } from 'react'
import { useSimulation, SimFrame, Button, Segmented, Toggle, Stat, EventLog, Goals, Diagram, PodShape } from '../../kit'
import {
  createAccessPreset, step, evaluateAccess, eyeSummary, assetsOf, rotationStatus, rotateSecret, setApproach, setConsume,
  setEncryption, setLeastPrivilege, commitPlainSecret, leakEnvToLog, stealEtcdBackup, stealControlPlaneDisk,
  restartPods, l16Goals, podView, tokenSegment, effectiveConsumeOf, actorLabel, setAnimationScale, encryptionScopeInfo,
  APPROACHES, L16_APPROACHES, TIMING,
} from '../../engines/access/index.ts'
import type { Approach, ConsumeMode } from '../../engines/access/index.ts'

export function PutTajne() {
  const sim = useSimulation({ init: () => createAccessPreset('l16'), step })
  const { mutate, speed } = sim
  // tokens keep their wall-clock pace at 2× / 4× (cosmetic; outcomes do not change)
  useEffect(() => mutate((st) => setAnimationScale(st, speed)), [mutate, speed])
  const s = sim.state
  const report = evaluateAccess(s) // cheap (~20 µs): call during render
  const eyes = eyeSummary(s)
  const rot = rotationStatus(s)
  const goals = l16Goals(s)
  const assets = assetsOf(s) // „Gdje tajna živi”: highlight a.node, show a.form / a.protection
  const db = s.secrets[0]
  return (
    <SimFrame
      title="Put tajne"
      sim={sim}
      hint={`Zatvorite što više očiju. Osvježavanje datoteke: ${TIMING.kubeletSync.label}`}
      controls={
        <>
          <Segmented
            value={db.approach}
            options={L16_APPROACHES.map((a) => ({ value: a, label: APPROACHES[a].label }))}
            onChange={(a: Approach) => sim.mutate((st) => setApproach(st, 'db', a))}
          />
          <Toggle label={`Šifriranje u mirovanju (KMS v2) – ${encryptionScopeInfo(s).label}`} checked={s.config.encryption.provider === 'kms-v2'}
            onChange={(on) => sim.mutate((st) => setEncryption(st, on ? 'kms-v2' : 'identity'))} />
          <Toggle label="RBAC s najmanjim ovlastima" checked={s.config.leastPrivilege}
            onChange={(on) => sim.mutate((st) => setLeastPrivilege(st, on))} />
          <Segmented<ConsumeMode> value={effectiveConsumeOf(s, 'api')}
            options={[{ value: 'env', label: 'env' }, { value: 'volume', label: 'volumen' }, { value: 'subPath', label: 'subPath' }]}
            onChange={(m) => sim.mutate((st) => setConsume(st, 'api', m))} />
          <Button onClick={() => sim.mutate((st) => { rotateSecret(st) })}>Rotiraj lozinku</Button>
          <Button onClick={() => sim.mutate((st) => restartPods(st))}>Ponovno pokreni Podove</Button>
          <Button variant="danger" onClick={() => sim.mutate((st) => { stealEtcdBackup(st) })}>Ukradi kopiju baze etcd</Button>
          <Button variant="danger" onClick={() => sim.mutate((st) => { stealControlPlaneDisk(st) })}>Ukradi disk upravljačke ravnine</Button>
          <Button variant="danger" onClick={() => sim.mutate((st) => { commitPlainSecret(st) })}>Spremi secret.yaml u Git</Button>
          <Button variant="danger" onClick={() => sim.mutate((st) => { leakEnvToLog(st) })}>Ispiši env u log</Button>
        </>
      }
      stats={
        <>
          <Stat label="Crvene oči" value={`${eyes.red}/${eyes.total}`} tone={goals.closeEyes ? 'ok' : 'bad'} />
          <Stat label="Rotacija" value={rot.phase === 'idle' ? '–' : rot.label} />
        </>
      }
    >
      {report.verdicts.filter((v) => s.config.visibleActors.includes(v.actorId)).map((v) => (
        <div key={v.actorId} title={v.reads ? v.paths[0].text : v.blocked[0]?.reason}>
          {v.reads ? '●' : '○'} {actorLabel(s, v.actorId)}{v.honestLimit ? ' (iskrena granica)' : ''}
        </div>
      ))}
      {assets.map((a) => (
        <div key={a.id}>{a.label}: {a.form === 'encrypted' ? 'šifrirano' : a.form === 'reference' ? 'referenca' : 'čitljivo'} ({a.visibleReaders.length} čitatelja)</div>
      ))}
      <Diagram width={720} height={120} label="Podovi aplikacije">
        {podView(s).map((p, i) => (
          <PodShape key={p.id} x={60 + i * 90} y={60} status={p.kitStatus} label={p.usesVersion === null ? '–' : `v${p.usesVersion}`}
            tone={p.versionTone} caption={p.reason ?? p.label} />
        ))}
      </Diagram>
      {/* tokens, every frame: const seg = tokenSegment(s, a) → lerp(position(seg.from === 'actor' ? ACTORS[a.actorId].entry : seg.from), position(seg.to), seg.f) */}
      {s.attempts.map((a) => <span key={a.id} hidden>{tokenSegment(s, a).to}</span>)}
      <Goals goals={[
        { text: 'Zatvorite što više očiju', done: goals.closeEyes },
        { text: 'Objasnite zašto oko „smije stvarati Podove” ostaje crveno', done: goals.podCreatorShown },
        { text: 'Rotirajte lozinku bez ponovnog pokretanja Poda', done: goals.rotateWithoutRestart },
      ]} />
      <EventLog events={s.events} />
    </SimFrame>
  )
}
```

The example type-checks against the current kit. `ACTORS[a.actorId].entry` is the graph node where an attempt's eye sits. For the „Tko može pročitati?” picker, render `attemptOptions(s, actorId)` as `{action} → {outcome}` rows and launch the chosen one with `attempt(…, { pathId })`, or use `tryVerb` for verb buttons.

## Validated numbers (reproduced by `access.test.ts`)

### L16, preset `l16` (seed 42; DB password; developer `edit`; no encryption; env)

| Location | Red eyes (of 9) | Who |
|---|---|---|
| `image` (Dockerfile ENV) | 5 | Git reader, image puller, developer, Pod creator, compromised Pod |
| `manifest-env` | 7 | Git, etcd copy, CP disk, view, developer, Pod creator, compromised Pod |
| `configmap` | 7 | Git, etcd copy, CP disk, view, developer, Pod creator, compromised Pod |
| `secret` | 5 | etcd copy, CP disk, developer, Pod creator, compromised Pod |

Protection ladder for `secret`. **Minimum = 2**, both honest limits; this is the answer to „Zatvorite što više očiju” (`l16Goals(s).closeEyes`).

| Step | Red eyes | Change |
|---|---|---|
| `secret` | 5 | – |
| + secretbox | 4 | etcd copy grey; CP disk stays red |
| + KMS v2 | 3 | CP disk grey |
| + least privilege | **2** | Pod creator + compromised Pod remain |

With a ConfigMap, encryption scoped to `secrets` leaves the etcd thief red; `secrets+configmaps` closes it.

| L16 rotation (rotate at t = 5 s) | Result (sim → real-time equivalent) |
|---|---|
| volume + app re-reads | done in **9,5 s ≈ 85,5 s real**: Pods at 3,6 s and 9,5 s, 0 restarts. Worst case over 200 seeds ≤ 10 s ≈ 90 s (one kubelet sync). |
| env | Secret updated at once, Pods stay on v1 forever. `rollout restart` at t = 15 s → done at **16 s**, 2 restarts. |
| subPath | never (checked for 600 s) |
| 0 replicas | completes at once with „nijedan Pod trenutačno ne koristi vrijednost (v2)”; `consumersAtCompletion` 0, so no goal counts |
| volume, app does not re-read | file v2, app v1, never completes |
| env literal in deployment.yaml | new Pods: **6 s**, 2 restarts; running Pods never below 2, never above 3 |
| image | build 20 s + rollout → **26 s ≈ 10,1 min real** (CI ×30); the old tag still holds v1 |
| scale to 0 and back during the rotation | completes, but `restartsDuring` = 2 → goal not met |

### L23, preset `l23` (GitOps; SMS key)

| Approach | Red eyes (of 10), explorer mode (`whatIf: true`, clean history) | Red eyes, migration from the preset (`whatIf: false`) | Note |
|---|---|---|---|
| `git-secret` | 9 | 9 | Git, Redis, laptop, ex-employee, etcd, CP disk, developer, Pod creator, compromised Pod |
| `sealed` | 7 | 9 | Git and Redis grey only with a clean history; after a migration v1 stays in Git history and in Argo CD's cache until rotated |
| `sops` (KSOPS in Argo CD) | 8 | 9 | Redis red (plaintext in cache) |
| `eso` | 7 | 9 | |
| `csi` (no sync) | 5 | 7 | not in etcd; the migration rolls the Pods (template changes) |
| `avp` | 8 | 9 | Redis red |

A migration replaces Pods only when the Pod template changes (to or from `csi`, `image`, `manifest-env` or `configmap`); between the Secret-backed approaches the same Pods keep running. With KMS v2, least privilege and a completed rotation, `sealed`, `eso` and `csi` all end at **2** (Pod creator + compromised Pod).

`compareApproaches(L23_APPROACHES)` („Ostale mogućnosti”, no former team member) gives the following readable copies: `git-secret` Git (base64), Redis, etcd, Pod file; `sealed` etcd, Pod file; `sops` Redis, etcd, Pod file; `eso` etcd, Pod file; `csi` Pod file only; `avp` Redis, etcd, Pod file.

| L23 rotation (rotate at t = 20 s, volume consumers, seed 42) | Delivered | Done (sim) | Real-time equivalent | Worst case (`rotationEstimate`, sim → real) | Measured max, 200 seeds (real) |
|---|---|---|---|---|---|
| plain Secret in Git | +4 s | **6,7 s** | **64,3 s** (Argo CD 4 s ×10 + kubelet 2,7 s ×9) | 28 s → 270 s ≈ 4,5 min | 252 s |
| SealedSecret | +5 s | **6,7 s** | **56,3 s** | 29 s → 271 s | 244 s |
| SOPS | +4 s | **6,7 s** | **64,3 s** | 28 s → 270 s | – |
| ESO (`refreshInterval: 30s`) | +25,8 s | **26,7 s** | **33,9 s** | 40 s → 120 s | 115 s |
| ESO with the default 1 h | ≤ 3600 s | – | > 300 s → goal **not** met; `forceEsoSync` → ≤ 90 s | 3610 s → 3690 s | |
| CSI, rotation on | 0 | **10,6 s** | **63,6 s** (CSI poll ×6) | 20 s → 120 s | 119 s |
| webhook (plain Secret) | +1 s | 6,7 s | 52,3 s | 11 s → 91 s | |
| CSI, rotation off (default) | – | needs new Pods | | `needs: rollout restart` | |
| argocd-vault-plugin + immediate hard refresh | 0 | **6,7 s** | **60,3 s** (kubelet only) | – | |
| argocd-vault-plugin, no action (preset `l23`, rotate at t = 0) | +727,4 s (cache expiry) | **736,7 s** | **24 h 16 min** (cache ×120) → goal not met | 748 s → 24 h 5 min (cache 12 min ×120 + poll 18 s ×10 + kubelet 10 s ×9; `shortcuts: hard refresh`) | |
| SealedSecret sealed with a leaked key | +5 s | 6,7 s | 56,3 s (same pipeline; `warning` set, not `stalled`) | | |
| lost key → Pods stuck → rotate (`whatIf`, lose at 20 s, rotate at 25 s) | +17,2 s | **24,3 s** | **202,9 s** (Argo CD 16,2 s ×10 + unseal + kubelet retry 4,1 s ×9 + Pod start 3 s); completes only when `klopa-worker` runs on v2 | | |
| any approach, env | – | needs a restart | | `needs: rollout restart` | |

The „< 5 min” goal (`l23Goals(s).rotateFast`) is judged on `realElapsed ≤ 300 s` with at least one consumer running on the new value, and the new value must not be readable from Git at completion (then it is latched). A plain Secret in Git meets the time but fails „bez lozinke u Gitu”. Every simulated second of a rotation is attributed to exactly one `RotationWait` (`record.waits` sums to `elapsed`).

Break-it outcomes:

| Scenario | Result |
|---|---|
| Lost key without backup + rebuild | env Pods `CreateContainerConfigError` (`Error: secret "klopa-db" not found`); volume Pods `ContainerCreating` / `FailedMount`. With a backup, all Running. `resealAll` or a rotation (re-sealed with the new key) recovers; the rotation completes only when a consumer runs on the new value. |
| Store down | ESO: Secret kept, Pods restart fine, rotation refused or stalled → `survivedStoreOutage` once a Pod starts during the outage on a value synced before it. CSI: surge Pods `FailedMount`, old Pods keep running (rollout stalls; a second restart replaces the stuck Pod, never a Running one). CSI with sync: Pod creators still mount the synced Secret. |
| Migrate to ESO / AVP / CSI while the store is down (preset `l23`) | `setApproach` → `reason` „… SecretSyncedError …”; ESO never syncs, Pods run on the old plain Secret, the goal does not count; AVP renders nothing (no Redis entry); CSI Pods `FailedMount`. Store back → value written to the store, ESO syncs at its next refresh, AVP at the next poll. |
| Steal the etcd copy with SealedSecrets and no encryption | key `k1` leaks; KMS v2 + least privilege + rotation still leave the Git eye red (v2 sealed with `k1`); renewal + rotation → only the two honest limits stay red. With KMS v2 (rewritten) first, nothing leaks. |
| L23 hook (`l23-rebuild` + `rebuildCluster`) | API Pods `CreateContainerConfigError`; `applySecretManually` fixes them. |
| Key renewal | 185 s → 4 keys; no commits, values or eyes change. |
| Leaked key | Rotating without renewal leaves v2 readable; renewal + rotation turns the eye grey. Losing the key ring after a leak keeps the old commits readable until rotation. |
| Leaked commit | `deleteLeakedCommit` removes it from the branch (clones keep it), but never the commit HEAD deploys (it says to move the secret out of Git first); `leakHandled` only after every leaked value is revoked and Git exposes no valid value. Preset `l23` starts with the hook's leak (`leakedAtStart: ['db', 'sms']`): moving to SealedSecret and rotating ticks the goal without pressing a break-it. |
| Rotate with env, then switch to volume (explorer mode) | done, but `restartsDuring` = 2 (the goal „bez ponovnog pokretanja Poda” is not met) |
| Migration to another tool | the Redis eye stays red with v1 until rotation (or cache expiry, 12 min sim ≈ 24 h real) |

## Which lecture uses what

**L16** (preset `l16`, `l16-timeline`; `delivery: 'kubectl'`, explorer mode)

| Spec | Engine |
|---|---|
| „Gdje je lozinka” | `setApproach(s, 'db', 'image' \| 'manifest-env' \| 'configmap' \| 'secret')` |
| „Šifriranje u mirovanju” + provider | `setEncryption(s, 'secretbox' \| 'aesgcm' \| 'kms-v2' \| 'identity')` |
| „RBAC s najmanjim ovlastima” | `setLeastPrivilege` |
| potrošnja env / volumen / subPath | `setConsume(s, 'api', …)`, bound to `effectiveConsumeOf(s, 'api')` |
| „Rotiraj lozinku” | `rotateSecret`, plus `restartPods`; badge `rotationStatus(s).label` |
| „Ukradi kopiju baze etcd” / „… disk upravljačke ravnine” | `stealEtcdBackup` / `stealControlPlaneDisk` (animated; draw with `tokenSegment`) |
| „Spremi secret.yaml u Git” / „Ispiši env u log” | `commitPlainSecret` / `leakEnvToLog` |
| Scene „Dekodirajte” | `toBase64` / `fromBase64` / `secretValue`, `SECRET_MAX_BYTES`, `SECRET_TYPES` |
| Scene „Gdje tajna živi” | `assetsOf(s)` (etcd `form` / `protection` per provider; Pod file tmpfs vs node disk), `visibleReaders`, `PROVIDERS` |
| Scene „Kada aplikacija vidi promjenu” | preset `l16-timeline` + `state.marks` (lane = `workloadId`) |
| Scene „Tko može pročitati?” | `can()`, `setActorRules(s, 'view-user', [{ resources: ['secrets'], verbs: ['watch'] }])` (get / list / watch / create pods one at a time), `attemptOptions` (`action` → `outcome`) + `attempt(…, { pathId })` or `tryVerb`, `actorLabel`; ServiceAccount and least privilege: `setServiceAccountRules` (the compromised-Pod eye) |
| Encryption toggle | `encryptionScopeInfo(s).label` next to it („Šifriraju se samo Secreti”): with a ConfigMap the etcd eyes stay red under KMS v2 (see open question on the scope control) |
| Consumption control | `consumeLocked(s, 'api')` disables it for image ENV / env literal |
| Goals | `l16Goals(s)`: `closeEyes`, `podCreatorShown` (pair with a Predict for „objasnite”; `explainVerdict(verdictOf(s, 'pod-creator'))` gives the text), `rotateWithoutRestart` |
| Static scenes | „Jedna slika, tri okruženja” (one digest, three ConfigMaps, dev / staging / prod) is Stepper / Diagram content: the engine has one namespace and only secret values |

**L23** (preset `l23`, `l23-rebuild`; `delivery: 'gitops'`)

| Spec | Engine |
|---|---|
| pristup | `setApproach(s, 'all', 'git-secret' \| 'sealed' \| 'sops' \| 'eso' \| 'csi' \| 'avp')`; history and the Argo CD cache are kept, so a leaked commit stays until rotation |
| toggles | `setEncryption`, `setLeastPrivilege`, `setConsume(s, 'all', 'env' \| 'volume')` |
| „Rotiraj ključ” | `rotateSecret(s, 'sms')` (or `'all'`); `forceEsoSync`, `argoHardRefresh`, `restartPods`; `rotationStatus(s, 'sms').label` + `rotationEstimate(s, 'sms').label` |
| „Spremi običan Secret u Git” | `commitPlainSecret`, then `deleteLeakedCommit` does not help |
| „Izgubi privatni ključ kontrolera” | `loseControllerKey`, with `setKeyBackup` and `resealAll` |
| „Procurio privatni ključ kontrolera” | `leakControllerKey`, then `renewSealingKey` + `rotateSecret` |
| „Trezor nedostupan” | `setStoreAvailable(s, false)` |
| „Token u CI logu” | `leakToCiLog` |
| Hook | preset `l23-rebuild` + `rebuildCluster` |
| Rings (Argo CD poll, ESO refresh, CSI poll, key ring) | `rings(s)` (labels from `TIMING`; `nextInS: null` = never) |
| Scene „Ostale mogućnosti” (where the plaintext lives) | `compareApproaches(L23_APPROACHES)` |
| Pipeline animation | `state.flows` / `state.attempts` over `GRAPH_NODES`, drawn with `tokenSegment` |
| Pods | `podView(s)` → `PodShape status={p.kitStatus} tone={p.versionTone}` with `p.label` / `p.reason` as caption |
| Goals | `l23Goals(s)` (goal secret: the SMS key, whatever the focus): `gitGrey` („Svi čitatelji Gita sivi”), `rotateFast.done` („< 5 min bez lozinke u Gitu”, real time), `leakHandled` („Ispravno reagirajte na procurjeli commit”; preset `l23` starts with the hook's leaked commit, `leaks` = 1), `survivedStoreOutage` („Preživite nedostupan trezor”, hint: `storeOutageStatus(s).next`) |
| Speed control | `setAnimationScale(s, sim.speed)` so tokens stay visible at 4× while waiting for Argo CD, ESO or the kubelet |
| Static scenes | „Sealed Secrets” scopes (`SEALED_SCOPES`, the engine models `strict`), „Odabir i ekosustav” (decision tree) |
| Incident card numbers | `exposure(s)` (how long each eye could read a valid value, sim seconds). **Not reproducible:** the L16 hook („jedan dan javan”, „40 000 poruka”) and the L23 hook („dva dana” to replace the key) are day-scale story numbers. The engine has no cost model and no day-scale clock, and inventing a conversion would only launder the numbers. The style guide requires hook numbers to be reproducible, so lecture authors must reword these hooks without numbers or with numbers the sim shows (e.g. „rotacija traje 6,7 s (sim) ≈ 1 min”). |

## Relation to E6 (`src/engines/gitops`)

E5 owns the L23 flagship: the eyes, the rotation timing and the goals. E6 drives the GitOps scenes and states the same eye rules (`gitLeaks().exposedCurrent` ↔ the Git-history reader, `argoCacheHasPlaintext` ↔ the Argo CD Redis eye). Shared constants are aligned:

- kubelet volume update: 10 s (sim) ↔ real 90 s („do oko minute i pol”) in both;
- ESO: `refreshInterval: 30s` set in the YAML, default 1 h („30 s (u YAML-u) · zadano: 1 h”) in both;
- Argo CD poll: 12 s + up to 6 s (÷10) in both; CI build ≈ 600 s real in both.

Remaining differences, harmless while the two engines are not on the same page:

- Pod start: E5 uses one 3 s step. E6 models schedule, image pull, app start and readiness.
- Sealed Secrets key renewal: E5 compresses it to 60 s so the key ring visibly grows. E6 keeps 30 days.
- Seeds: E5 `l23` = 42, E6 `l23` = 23.
