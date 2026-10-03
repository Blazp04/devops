# E4 „Tvornica”: image build cache, registry and CI/CD pipeline

This is a pure TypeScript engine, with no React and no DOM. It is seeded and deterministic, and it runs directly under Node 24.

| Lecture | What it uses |
|---|---|
| **L08** Docker | `createBuildLab`: Dockerfile cards, layer cache, multi-stage builds, secrets in layers, push/tag/digest, servers, containers with `-p` |
| **L21** CI/CD | `createPipeline`: stations, fail fast, a red main and `git revert`, cache and parallel jobs, push vs. PR triggers, gate, digest promotion, rebuild for production, base tag republished upstream, OIDC (per-job tokens, remaining lifetime) vs. a long-lived key, DORA |
| **L24** Dan izdanja | `releaseDayJourney()` (the whole commit path, deterministic), or `createPipeline(PIPELINE_PRESETS['dan-izdanja'])` + `mergePullRequest`, `commitJourney`, `lastPromotionDiff` (the node pulls only the changed layer) |

Run the tests with `node --test src/engines/build/*.test.ts`. `npm run -s typecheck` and `npx eslint src/engines/build` print nothing for this directory. Two tests guard this README: every runtime export must be documented here, and the rows of §4 marked with † are regenerated from the engine and compared word for word.

---

## 1. What it models

### Image build (`image.ts`, used by L08 and by the CI build in L21)

`planBuild(instructions, opts)` walks a Dockerfile the same way BuildKit does.

- **Stages.** Every `FROM` starts a stage, and the last stage is the target. A stage is built only if the target needs it through `COPY --from`. Independent stages run **in parallel**: a cold multi-stage build takes 53,2 s, not 55,2 s.
- **Cache key** = hash(parent key, instruction text, inputs).
  - `COPY` from the build context: the content checksums of the matched files, after `.dockerignore`.
  - `COPY --from`: the content checksum of the copied path in the source stage.
  - `RUN`: the command text and its environment (`WORKDIR`, `USER`, `ENV`, the values of the `ARG`s in scope). It does **not** include the files it reads or `--mount=type=secret`.
  - `ARG`: like Docker, every `ARG` declared earlier in the stage is in the environment of **every** later `RUN`, so its value is part of each of their keys and shows in each of their `docker history` lines (`RUN |1 NPM_TOKEN=… /bin/sh -c npm run build`). A new value misses at its **first use**, not at the `ARG` line (reason `args-changed`, labelled with the ARG name, never its value). A global `ARG` (before `FROM`) is in scope only where a stage re-declares it; `--build-arg` beats the stage default, which beats the global default.
  - `FROM`: the digest the base tag resolves to. The builder keeps base images **by digest**, so a tag that upstream republished (same ref, new digest, `patchedBase()`) is pulled again and invalidates every layer above it.
  - Settings-only lines (`USER`, `ENV`, `ARG`, `CMD`, `EXPOSE`, `WORKDIR` on an existing directory, `METADATA_KINDS`) create no layer and never invalidate a later `COPY`; a `WORKDIR` that creates a directory is a tiny layer (`WORKDIR_LAYER_MB`).
- **The cascade comes from the key itself.** The parent key is part of every key, so a step is CACHED **iff** its instruction and inputs are unchanged **and** every step beneath it is cached. A test checks this over 480 random reorders and edits.
- **A cache hit never executes.** Errors that only happen while a command runs (npm `E401` without a token, a `--mount=type=secret` whose secret was not passed) fail the build only when the step misses the cache. That is why adding the private package (`setPrivateNpm`, or the first `setNpmTokenVia`) also edits `package.json` and `package-lock.json`: `COPY package*.json` misses, `npm ci` really runs, and only then does it need the token.
- **Why a step missed** (`PlanStep.reason`, labels in `CACHE_REASON_LABEL`): `first-build`, `inputs-changed` (with `changedFiles`, e.g. `['.git/', 'src/']`), `args-changed`, `env-changed`, `instruction-changed` (new or moved), `parent-rebuilt` (cascade), `base-pull` / `base-new`, `unused-stage`, `cancelled`.
- **Errors look like real errors.** Wrong orders fail instead of silently getting faster: `npm ci` before `COPY package*.json`; `npm run build` before `COPY . .`; `npm` in the nginx stage (exit 127); `RUN npm ci --omit=dev` then `npm run build` (`sh: vite: not found`, which is why the build gets its own stage); `COPY .env` when `.dockerignore` lists it; `COPY --from` an undefined stage or its own stage; anything before the first `FROM`; a non-root `RUN` writing to a root-owned directory (`EACCES`, pip `Errno 13`, BusyBox `rm: can't remove`). A failure stops the build at that step's time. Steps that already finished stay cached.
- **Layers are immutable.** `RUN rm` adds a whiteout. `findSecrets(image)` reports every place a secret can be read from: a layer file (flagged `hiddenByWhiteout` when a later layer deletes it), `docker history` (ARG values in a `RUN` line, and `ENV` lines), `docker inspect` (ENV). `mergedView(image)` is what a container sees. `devDepsInImage(image)` gives the development dependencies a container carries: 120 MB (`NODE_MODULES_DEV_MB`) in a single-stage image, 0 MB with multi-stage.
- **Digests are real hashes:** `image.digest = sha256(manifestJson)` and `configDigest = sha256(configJson)` (`DIGEST_NOTE` explains which digest Docker 29 shows). COPY layers from the context are content-addressed (`contentId`); RUN layers get new timestamps in every build that actually runs them; a fully cached rebuild gives the **same** digest; a fresh builder gives a **different** one; `reproducible: true` models `SOURCE_DATE_EPOCH`.

### Registry (`registry.ts`)

- **Push** stores blobs and manifests by digest and uploads only missing blobs; `pushLog()` prints `Layer already exists` / `Pushed`, then `tag: digest: sha256:… size: N` with the real manifest size in bytes.
- **Tags** are movable pointers `repo:tag → digest` (history capped at `MAX_TAG_HISTORY`); optional `immutableTags` rejects re-pointing a tag.
- **References.** `parseImageRef('registry/name:tag@sha256:…')`; with `tag@digest` only the digest is used.
- **Pull policy.** `defaultPullPolicy(ref)`: `Always` for `:latest` or no tag, `IfNotPresent` for any other tag or a digest. `planPull` on a host downloads only the layers it lacks; `IfNotPresent` keeps a stale image under a moved tag.

### L08 lab (`lab.ts`, `projects.ts`)

- **Card catalogues** (`PROJECTS`): **klopa-web** (npm/Vite → `nginxinc/nginx-unprivileged`, port 8080, UID 101) and **klopa-api** (pip → gunicorn, port 8000). `node_modules/`, `.git/`, `.env` and `.venv/` are in `.dockerignore`. The Dockerfile itself is in the build context (`labContext`), so `COPY . .` copies it.
- **The tray** (`state.tray`) holds the draggable cards that are not in the Dockerfile, including `FROM nginx-unprivileged … AS runtime` and `COPY --from=build` (the L08 spec lists both as draggable). **`multiStage` follows the Dockerfile** (`isMultiStage`): dragging the runtime `FROM` in or out flips it exactly like the „Višefazna izgradnja” toggle, and the USER/CMD slot cards switch between `USER node` + `npm start` and `USER 101` + nginx.
- **„Kopiraj .env pa ga obriši”** (`injectEnvSecret`) adds `COPY .env .` + `RUN rm .env` at the end of the final stage. In a non-root stage (nginx-unprivileged runs as 101) `rm` needs root, so `USER root` goes in front, and if no `USER` card follows in that stage the break-it also adds `USER 101` after `RUN rm` (taken from the tray). The break-it changes **only** the secret: the image still runs as 101. With `.dockerignore` on it adds the `!.env` exception (`unignore: false` shows the „not found” failure instead). `removeEnvSecret` undoes all of it.
- **Tasks are sticky** (`labGoals`, like `pipelineGoals`): once reached, a task stays ticked while students keep experimenting. `labGoalsCurrent` gives the live values, `state.goalsReached` the sim time each was first reached. The size, rebuild and non-root tasks count only an image that runs the app (`servesApp`).
- **Animated build, push and pull** at exact layer end times; registry push/tag/`latest`; servers A and B; containers with a writable layer (copy-up, whiteout, lost on `docker rm`); `curl` from the host: 200 / connection reset (gunicorn on `127.0.0.1`, wrong container port) / connection refused (no `-p`).

### L21 pipeline (`pipeline.ts`)

A discrete-event model: events are processed at their **exact** times inside fixed 0,5 s steps (`PIPELINE_DT`), so lead times are exact numbers.

- **Stations** (`STATIONS`): `lint → testovi → izgradnja slike → skeniranje → registar → staging → e2e → [ljudska vrata] → produkcija`. With „Paralelni poslovi” lint and tests run together; build needs both. Staging and e2e share **one environment lock**; production has its own; waiting runs get a lock FIFO (`environmentConcurrency: 'supersede'` cancels an older waiting run instead).
- **main is cumulative** (one mainline). A commit's tree contains every earlier commit on main, so a defect stays in every later tree until a `revert` or `fix` commit removes it:

  | Commit type (`COMMIT_TYPE_LABEL`) | Leaves in the tree (`DEFECT_LABEL`) | Stops the line at |
  |---|---|---|
  | „Pada test” | a bug | tests (or e2e); with „Preskoči testove” it reaches production → incident |
  | „Ranjiva bazna slika” | `FROM python:3.9-slim-buster` | a cold build, then the scan |
  | „Tajna u kodu” | `SMS_API_KEY` in `settings.py` | the scan, even with tests skipped (and the key is already in Git history: `rotateSecrets`) |
  | „Nestabilan test” | a flaky test **in the suite** | each test run fails with 1 − (1 − p)^k for k flaky tests (p = 0,3); 2 automatic retries; trust −0,1 per failed attempt |

  A flaky test ships nothing broken (never an incident, never counted in CFR), but every later run of the suite can fail on it until someone reverts it; trust recovers (+0,02 per clean first-attempt pass) only once no flaky test is left.
- **A red main and the revert.** When a run fails because of a defect still on main, `mainStatus(s)` returns `red: true` and `cause` (that defect), the event `main-red` says so, and every commit pushed meanwhile logs `inherits` („#5 nasljeđuje grešku koju test hvata iz 0c242ba – main je crven dok se 0c242ba ne vrati (git revert) ili ispravi”). Two ways back to green:
  - the UI's „Vrati commit (git revert)” button: `revertCommit(s)` (default: the newest defect on main);
  - `teamRevertAfterSec` (the `tvornica` and `brza-tvornica` presets: 60 s; `setTeamRevert`): a teammate pushes the revert by themselves (event `revert-planned`), also after an incident is detected. The bare `createPipeline()` has `null`: nobody reacts. Commits of the 20-commit stream follow the stream's own `revertAfterSec` (default 60 s).
- **Cache.** With „Predmemorija”, tests take 1 min if the dependency cache for that `requirements.txt` is warm (3 min otherwise), and the image build uses the real layer model on klopa-api: 40 s when the `pip install` layer is a cache hit, 4 min otherwise. A cache switched on later starts empty, so the first commit after it is cold: `predictLeadTime(s)` says so, `idealLeadTime` is the best case.
- **„Preskoči testove”** skips unit tests **and** e2e. A bad deploy opens an incident, detected after 5 min; the on-call rollback takes 1 min (push mode: re-deploy the last good digest; GitOps: `git revert` in the config repository, Argo CD syncs).
- **Gate** (`GateMode`, applies live): `ci` stops after push (`in-registry`) — switching to it also stops every deployment that has not started (runs waiting at the gate, runs queued for staging or production, and runs still in staging/e2e when they reach the gate; a deploy already running finishes); `delivery` waits for `approve()` / `approveAll()` (the lead time includes the wait); `deployment` is automatic.
- **Build once, promote.** The built digest is the staging and the production digest. `rebuildForProduction()` rebuilds the next production deploy on a fresh runner: a new digest, `tested: false`, plus 4 min 20 s, and `run.rebuildNote` says why (`nova bazna slika iza istog taga`, `nove vremenske oznake RUN slojeva`). With immutable tags the registry rejects it.
- **Triggers.** A push to main runs everything; a PR (`trigger: 'pr'`) runs lint/tests/build/scan; `mergePullRequest` works only if the PR checks passed. **Which digest reaches production after a merge** depends on `cacheBackend`:
  - `'gha'` (default, also in `dan-izdanja`): GitHub Actions scopes caches per ref, so main cannot restore the PR's layer cache. The merge build is a warm build from main's own cache (pip layer hit, 40 s), but `COPY . .` is rebuilt, so the digest built **on main** is a new one, and that one is promoted. The PR digest never reaches production. This is the L24 story: „digest = what main built”.
  - `'registry'` (a `type=registry` cache shared by every ref): if main has not moved since the PR branched, every layer is a hit and the merge build has the **same** digest as the PR. Use this only if a scene must show one digest from PR to production.
- **Base image republished upstream.** `updateBaseImage()` moves `python:3.13-slim` to a new digest under the same tag: the next build misses from `FROM` upwards (4 min) and nodes download the base layers again.
- **What the node downloads** (`lastPromotionDiff`): the node keeps the layers of every image it has run (digest references default to `IfNotPresent`), so a deploy with the cache downloads only the code layer, and a **rollback to a digest the node ran minutes earlier downloads nothing**. `{ against: 'previous' }` gives the one-step diff.
- **Credentials.** With OIDC every job that talks to the cloud (push, staging, production) gets its own token (`state.tokens`, `OIDC_TOKEN_LIFETIME` 10 min in the sim); a token is not revoked when its job ends, it expires. In GitOps mode the deploy jobs hold a GitHub App token for the config repository (`GITHUB_APP_TOKEN_LIFETIME`). `leakCredential()` compromises one job (`LeakTarget`):
  - default with OIDC `'newest-token'`: the job holding the newest token that still works → the expiring-token countdown („istječe sam za 9 min 25 s”); if every token expired, a push job starting now (a fresh 10 min token);
  - `'running-job'` (default with a long-lived key): the furthest running job; with OIDC that is usually lint or tests, which hold nothing („napadač nema što ukrasti”) — the least-privilege demo;
  - a station id: that job.

  A long-lived key works until `revokeCredential()`. The scope text depends on `deployMode` (`push`: CI holds cluster-admin; `gitops`: CI pushes the image and commits the digest).
- **DORA** (`dora(state, windowSec?)`): deployment frequency, median lead time, change failure rate, median failed deployment recovery time (vrijeme oporavka od neuspjelog postavljanja). Missing data gives `null`, never NaN.
- **Robust config.** Every duration, probability and interval passes through `resolveTimings` / `resolveDurations` / `num`: a missing, NaN, infinite or negative value keeps the default (0 is a valid override), probabilities are clamped to 0..1, speeds below `MIN_MBPS` become 0,1 MB/s (`rate`), `dt` that is NaN, negative or infinite is ignored. History lists are capped (events 50 = `MAX_EVENTS`, runs 60, deployments/incidents/production history 500, tokens 30, leaks 20).

---

## 2. What it deliberately simplifies (and why it is still true)

| Simplification | Why it is still correct for the lesson |
|---|---|
| Files are top-level groups (`src/`, `node_modules/`, `.git/`) with a version number, not real trees. | BuildKit's COPY cache key is a content checksum of the matched files. A version bump is exactly „the content changed”. |
| RUN does not execute. Each action (`npm-ci`, `npm-build`, `pip-install`, `rm`) has a fixed product, size and duration (L08 model values). | The cache rule for RUN depends only on the command, its environment and the parent, never on what it reads. Execution-time errors (E401) are applied only on a miss, as in BuildKit. |
| Durations are fixed: no jitter, no network variance. The base pull uses 10 MB/s compressed (`node:24-slim`, 80 MB → 8 s). | Every number on a card must come back with the same preset and seed. All durations are labelled *ilustrativno*. |
| Parallel stages and parallel pulls do not share bandwidth. | It changes the cold multi-stage build by at most the 2 s nginx pull. |
| The L21 CI durations (4 min cold / 40 s cached) are not derived from the L08 layer times; the layer model only decides **whether** the build is a cache hit, and produces the digests. | A CI build on a fresh runner includes runner start, buildx setup and cache import/export; the L21 spec gives those numbers. |
| One shared staging environment; unlimited CI runners. | It shows the real bottleneck of shared environments without modelling runner pricing. |
| An incident is detected after a fixed 5 min; a rollback is one production deploy (1 min). | Enough to make CFR and recovery time move for the right reasons. L24's fault deck models detection in detail. |
| The teammate who reverts a red main is a timer (`teamRevertAfterSec`), not a person who might fix forward. | „Fix broken builds immediately”, and a revert is the fastest fix. A UI can still offer `revertCommit` and `commit(s, 'fix')`. |
| A flaky test fails each attempt independently with p; k flaky tests combine as 1 − (1 − p)^k. | That is how a suite with independent flaky tests behaves; retries and trust erosion follow from it. |
| The production node keeps every image it ran; image garbage collection is not modelled. | Within a lesson's minutes the kubelet's GC (disk ≥ 85 %) does not run; rollbacks reuse the image on the node. |
| A leak is one compromised job; tokens are issued per job at job start; the attacker tries every 60 s. | The lesson is the contrast: a long-lived key works until revoked, a token only for the rest of its lifetime. Real tokens are also scoped by the trust policy, which `credentialStatus().scope` states in words. |
| Upstream republishing a base tag changes every base layer digest; the CI pull time is not modelled. | The tag stays the same while the digest and the cache key change: exactly why a later rebuild is a different artefact. |
| `npm ci --omit=dev` takes the same 40 s as a full `npm ci`. | The lesson is about size and the failing build, not install speed. |

---

## 3. API

Everything is re-exported from `src/engines/build/index.ts`. Engine files import each other with explicit `.ts` extensions.

### Scene → API

| Scene | Use |
|---|---|
| L08 „Laboratorij predmemorije izgradnje” | `createBuildLab({ preset: 'laboratorij', warm: true })`, `setCardOrder` (Motion `Reorder`), `addCard`/`removeCard` (tray = `state.tray`), `changeCode`/`changeDeps`, `startBuild` + `buildView(s, { at: labNow(s) })`, `setDockerignore`, `setMultiStage` (toggle shows `state.multiStage`), `labGoals`, `LAB_RECOMMENDED_SPEEDS` |
| L08 „Tajna u sloju” | `injectEnvSecret`/`removeEnvSecret`, `inspectLayer`, `searchInImage`, `imageHistory`, `setNpmTokenVia('copy-rm'\|'arg'\|'secret-mount')`, `findSecrets` |
| L08 „Registar, tag i digest” | `pushImage` + `pushView`, `moveTag`, `startPull` + `pullView` (or `pullOnServer`), `serverReport().sameDigest` |
| L08 „Vrata u zidu” (klopa-api) | `setListenAddr('0.0.0.0'\|'127.0.0.1')`, `tryRunContainer({ publish: [[8080, 8000]] })`, `curlFromHost(8080)`, `writeInContainer`/`deleteInContainer`, `removeContainer` |
| L21 „Tvornica commitova” | `createPipeline(PIPELINE_PRESETS.tvornica)` at `PIPELINE_DEFAULT_SPEED` with `PIPELINE_RECOMMENDED_SPEEDS`, `commit(s, type)`, `setPipelineOption`, `setGate`, `approve`/`approveAll`, `pipelineBoard(s, { at: simNow(s) })`, `stationQueues`, `dora`/`doraSeries`, `pipelineGoals`, `predictLeadTime` („Predvidi”), a „Sljedeći događaj” button → `stepToNextEvent` |
| L21 red main | `mainStatus(s)` (banner „main je crven – uzrok: …”), a „Vrati commit (git revert)” button → `revertCommit(s)`, `setTeamRevert` |
| L21 „Izgradi jednom, promoviraj” | `rebuildForProduction`/`setRebuildForProduction`, `updateBaseImage`, `run.rebuildNote`, `deployRef` |
| L21 „Procurio CI ključ” | `leakCredential(s)` (OIDC: newest live token), `leakCredential(s, { target: 'running-job' })` (tests hold nothing), `revokeCredential`, `credentialStatus` (countdowns), `setCredential`, `setDeployMode` |
| L21 „0 od 20” | `startCommitStream(s, { autoApprove? })`, `streamStatus`, `approveAll` |
| L24 „Put jednog commita” | `releaseDayJourney()` (entries with `atClock`, `prodAt`, `downloadMB`), or step by step: `commit(s, 'ok', { trigger: 'pr' })`, `mergePullRequest`, `commitJourney`, `wallClock`, `lastPromotionDiff` |
| Any event log | `logEvents(state.events, fmtSeconds \| ((t) => wallClock(s, t)))` → `key`, `timeLabel`; `eventsSince(events, id)` |

### Common (`common.ts`, `sha256.ts`)

| Export | Purpose |
|---|---|
| `EngineEvent` `{ id, t, kind, text, tone }` | One log line. `id` increases per model: a stable key even for two identical events at the same t. Every model keeps `events` (at most `MAX_EVENTS` = 50). |
| `pushEvent(events, t, kind, text, tone?)` | Append (and drop the oldest beyond 50). |
| `eventsSince(events, afterId)` | Events after an id (for „what did this step do”). |
| `logEvents(events, formatTime = fmtSeconds, max = 6)` | Newest first, with `key` (`e<id>`) and `timeLabel`. See §6 for the kit's `EventLog`. |
| `fmtSeconds(s)`, `fmtMB(mb)`, `shortDigest(d, hexChars?)`, `clockLabel(origin, t, withSeconds?)` | „4,2 s” / „14 min 50 s”; „50 MB” / „1,7 GB”; `sha256:9f2c41ab07e3`; „11:59”. |
| `CompressedValue { simValue, realValue, unit, label }` | Compressed time with its real default for badges. |
| `clean(v)`, `num(v, fallback, min?, max?)`, `rate(v, fallback)`, `MIN_MBPS` | Float clean-up and config sanitising. |
| `createClock(DT)`, `advanceClock(clock, dt, onTick)`, `Clock` | The fixed-step driver both models use. |
| `sha256Hex(text)`, `digestOf(text)` | Synchronous SHA-256 („sha256:…”). |

### Image model (`image.ts`)

| Export | Purpose |
|---|---|
| `planBuild(instructions, { context, cache, localBases, timings?, buildId, now, reproducible?, seed?, bases?, privateNpm? }) → BuildPlan` | Pure. `steps[]` (status `cached`/`run`/`failed`/`skipped`, `reason`, `changedFiles`, `start`/`duration`/`end`, `layer`, `sizeMB`, `user`, `pullsBase`), `totalSeconds`, `ok`, `error`, `image`, `writes`, `seen`, `basePulls`, `rebuilt`, `cachedCount`. |
| `applyPlanWrites(plan, cache, localBases, upTo?)` | Apply the cache writes of the layers finished by `upTo` seconds. |
| `createCache()`, `DEFAULT_TIMINGS`, `resolveTimings(partial)`, `BASE_IMAGES`, `basePullSeconds(base, mbps?)`, `patchedBase(base, revision)` | Building blocks. `localBases` holds base image **digests**. |
| `findSecrets(image)`, `searchImage(image, q)`, `mergedView(image)`, `imageHistory(image)`, `isRootUser(user)`, `devDepsInImage(image)`, `NODE_MODULES_DEV_MB` | Inspector. |
| `matchContext(patterns, files)`, `effectiveContext(ctx)`, `contextSizeMB(ctx)`, `contentId(file)` | Build context. |
| `CACHE_REASON_LABEL`, `METADATA_KINDS`, `WORKDIR_LAYER_MB`, `DIGEST_NOTE`, `simIso(t)` | Labels and constants (`simIso` = the sim time as the ISO date in image configs). |

### Registry (`registry.ts`)

`createRegistry(host?, { immutableTags? })`, `planPush(reg, image, repo, tags, { mbps? })` / `applyPush` / `pushLog`, `setTag`, `parseImageRef` / `formatImageRef`, `resolveRef`, `defaultPullPolicy`, `createHost(id, name)`, `planPull(reg, host, ref, policy?, { mbps? })` / `applyPull`, `layerDiff(reg, from, to)`, `MAX_TAG_HISTORY`.

### L08 lab (`lab.ts`, `projects.ts`)

**Create and step**

- `createBuildLab({ preset?, project?, seed?, dockerignore?, multiStage?, timings?, transferMBps?, reproducible?, registryHost?, immutableTags?, servers?, warm?, privateNpm? })`.
  - `warm: true` builds once silently at creation, so the first „Promijeni kod” → „Izgradi” already shows the hook's 44 s cascade, and the first visible build is #1.
  - `privateNpm: true` starts with the private package `@klopa/ui` (npm ci needs a token).
- `stepBuildLab(state, dt)` with the fixed internal step `LAB_DT` = 0,05 s; `labNow(state)` = sim time including the part of a step not yet taken (smooth bars).
- `LAB_RECOMMENDED_SPEEDS` = `[1, 4, 10]`: a cold build is 53 s of sim time.
- Presets (`LAB_PRESETS`): `ivin-prvi` (hook: full `node:24`, no `.dockerignore`, `COPY . .` before `npm ci`, root), `laboratorij` (flagship start: slim, bad order, no `.dockerignore`, single stage, `USER` and the runtime cards in the tray), `los-redoslijed`, `dobar-redoslijed`, `visefazna`, `api-los`, `api-dobar`.
- Fictional secrets: `SMS_SECRET` (`.env`), `NPM_SECRET` (the npm token).

**Dockerfile and source**

- Cards: `moveCard(s, id, toIndex)`, `setCardOrder(s, ids)` (Motion `Reorder`), `addCard(s, id, index?)` (from the tray or any catalogue card, e.g. `'env-secret'`), `removeCard(s, id)` (to the tray), `swapCard(s, fromId, toId)`.
- `dockerfileLines(s)`, `dockerignoreLines(s)`, `labContext(s)` (the context including the Dockerfile).
- Toggles: `setMultiStage(s, on)` and `isMultiStage(s)` (what the toggle shows; equals `state.multiStage`), `setDockerignore(s, on)`, `setIgnoreDockerfile(s, on)` („.dockerignore sadrži Dockerfile”), `setBaseVariant(s, 'slim'|'full')`, `setListenAddr(s, '0.0.0.0'|'127.0.0.1')` (klopa-api's gunicorn bind).
- Source: `changeCode(s)`, `changeDeps(s)`, `touchGit(s)`.
- Secrets: `injectEnvSecret(s, { unignore? })` → `{ added, willFail }` / `removeEnvSecret(s)` (`state.envTrick` records what it changed; a restore card that had to be created gets the id `ENV_TRICK_RESTORE_USER_ID`), `setNpmTokenVia(s, 'none'|'copy-rm'|'arg'|'secret-mount')`, `setPrivateNpm(s, on)`.

**Build**

- `previewBuild(s)` (pure, for „Predvidi”), `startBuild(s)` (null while a build runs), `finishBuild(s)`, `buildNow(s)`.
- `buildView(s, { at? })`: steps with `live: 'waiting'|'pulling'|'running'|'cached'|'done'|'failed'|'skipped'` and `progress` 0..1.
- `servesApp(project, image)`: the image runs the app (CMD program + the files it needs).

**Registry and servers**

- `pushImage(s, { tags? })` (default tags: the git SHA the image was built from, plus `latest` if it does not exist yet), `finishPush(s)`, `pushView(s)`.
- `gitShortSha(s)`, `labRef(s, tagOrDigest?)`, `imageStale(s)` (the code changed since the last build: push warns).
- `moveTag(s, tag?, digest?)` („Pomakni latest na novu sliku”).
- `pullOnServer(s, 'a'|'b', ref?)` (instant) or `startPull(s, id, ref?)` + `pullView(s)` (animated); `serverReport(s)` (with `sameDigest`).

**Inspector, containers, metrics, tasks**

- `inspectLayer(s, i)`, `searchInImage(s, q)`: finding a secret completes „Pronađite ključ u slici”.
- `tryRunContainer(s, { publish?, name? })` → `{ container }` or `{ error }` (Docker's own message, e.g. a port already allocated); `runContainer` (container or null); `curlFromHost(s, port)`; `writeInContainer`, `deleteInContainer`, `removeContainer` (returns lost files). Opt-in ownership: `writeInContainerAs(s, id, path?, sizeMB?, { user? })` → `{ ok, error, user }` runs the write as `user` (`docker exec -u`) or the image's USER and refuses it with the shell's EACCES (`sh: 1: cannot create /app/zapis.log: Permission denied`; BusyBox wording on Alpine) unless the user is root, the path is under /tmp, or the user owns the file / its directory; `imagePathOwner(image, path)` → `{ owner, kind }` reads COPY owners (root unless `--chown`) and `Image.dirOwners` (WORKDIR creates its directory as the USER at that line). `writeInContainer` itself never checks.
- `labMetrics(s)`: `lastCodeRebuildSeconds`, `imageSizeMB`, `devDepsMB`, `imageCompressedMB`, `coldPullSeconds`, `contextSizeMB`, `user`, `nonRoot`, `servesApp`, `exposures`, `latestDigest`, `imageSha`, `currentSha`, `imageStale`.
- `labGoals(s)` → `{ rebuildUnder5s, imageUnder200MB, foundKey, nonRoot }`, **sticky**. `labGoalsCurrent(s)`: the same four on the current lab (for hints). `rebuildUnder5s` counts only a build whose sole changes since the previous build were code (and git), so a reorder does not count.

### L21 pipeline (`pipeline.ts`)

**Create and step**

- `createPipeline({ seed?, parallelJobs?, cache?, cacheBackend?, skipTests?, gate?, credential?, deployMode?, immutableTags?, rollbackOnIncident?, argoPollSec?, environmentConcurrency?, teamRevertAfterSec?, durations?, flakyFailProb?, flakyRetries?, incidentDetectSec?, oidcTokenLifetimeSec?, attackerIntervalSec?, registryHost?, repo?, initialVersion?, initialProd?, firstVersion?, clockOrigin? })`.
  - `cacheBackend`: `'gha'` (default) or `'registry'` (see §1 „Triggers”).
  - `rollbackOnIncident` (default true; `autoRollback` is its deprecated alias).
  - `argoPollSec`: GitOps sync delay (0 = webhook; Argo CD polling is 120 s + up to 60 s jitter).
  - `environmentConcurrency`: `'queue'` (default) or `'supersede'`.
  - `teamRevertAfterSec`: see §1 „A red main”; default `null`.
  - `initialProd`: what production ran before the first run (`tvornica`: Davor's laptop build tagged `latest`, untested, unknown commit); `initialVersion` (default 1.4.0); `firstVersion` (2.0.1, for `nextPatchVersion`).
  - `clockOrigin`: wall clock at t = 0 („11:48” in `dan-izdanja`), used by `wallClock`.
  - `durations`: `DEFAULT_DURATIONS` (L21 model, *ilustrativno*); `resolveDurations(partial)` gives the sanitised set.
- Presets (`PIPELINE_PRESETS`): `tvornica` (sequential, no cache, delivery gate, long-lived key, push model, laptop production, team revert 60 s), `brza-tvornica` (parallel jobs + cache, team revert 60 s), `dan-izdanja` (parallel + cache, automatic deployment, OIDC, GitOps, production on 2.0.1, clock 11:48).
- `stepPipeline(s, dt)` (fixed step `PIPELINE_DT` = 0,5 s), `runPipelineUntil(s, t)`, `runPipelineUntilIdle(s, maxSec?)` (runs waiting at the gate count as idle), `nextEventTime(s)`, `stepToNextEvent(s)` → the events it produced, `simNow(s)` (smooth progress between steps), `wallClock(s, t?, withSeconds?)`.
- Speeds: `PIPELINE_DEFAULT_SPEED` = 60 and `PIPELINE_RECOMMENDED_SPEEDS` = `[30, 60, 120]`. SimFrame's default speeds (0,5–4×) are far too slow for minutes, and its 0,25 s „Korak naprijed” is shorter than one 0,5 s step: wire a „Sljedeći događaj” button to `stepToNextEvent` instead.

**Commits and main**

- `commit(s, type, { trigger?, version?, changesDeps?, message?, reverts?, fixes? })` → `PipelineRun`. `type` is a `CommitType`: `'ok' | 'failing-test' | 'vulnerable-base' | 'flaky' | 'secret' | 'fix' | 'revert'`. `version: 'next-patch'` uses `nextPatchVersion(s)`.
- `revertCommit(s, commitId?, opts?)`: `git revert` pushed to main (default: the newest defect on main).
- `mainStatus(s)` → `{ head, defects, red, cause }`.
- `setTeamRevert(s, afterSec | null)`.
- `rotateSecrets(s)`: marks the committed `SMS_API_KEY` values as rotated (`state.secretsInHistory`).
- `mergePullRequest(s, prRunId, { version? })` (null unless the PR checks passed).
- `startCommitStream(s, { count = 20, intervalSec = 360, mix?, revertAfterSec = 60, autoApprove = false })` uses `DEFAULT_COMMIT_MIX` (a passed `mix` replaces it). Under the delivery gate stream runs wait at the gate unless `autoApprove`; the start event says so. `streamStatus(s)` is the stream's own scoreboard (`done`, `deployed`, `badInProd`, `blocked`, `reverts`).

**Gate and settings**

- `approve(s, runId?)` (the longest wait by default), `approveAll(s)` (every waiting run, oldest first, one event), `waitingAtGate(s)` (with `waitSec`).
- `setGate(s, 'ci'|'delivery'|'deployment')`: applies live (see §1).
- `rebuildForProduction(s)` / `setRebuildForProduction(s, on)`: the next production deploy only.
- `updateBaseImage(s)`: upstream republishes `python:3.13-slim`; returns the new base digest.
- `setPipelineOption(s, 'parallelJobs'|'cache'|'skipTests'|'rollbackOnIncident'|'autoRollback'|'immutableTags', v)`: applies to commits pushed afterwards (the workflow file is versioned with the code).
- `setCredential(s, 'static'|'oidc')`, `setDeployMode(s, 'push'|'gitops')`.

**Credentials**

`leakCredential(s, { target?: LeakTarget, station? })` → `{ kind, station, tokenId, issuedAt, validUntil, attempts, successes, … }`; `revokeCredential(s)`; `leakActive(leak, t)`; `credentialStatus(s)` (`attackerHasAccess`, per leak `remainingSec` / `exposureSec`, `tokens` with `valid` / `remainingSec`, `scope`, `lifetimeLabel`). `OIDC_TOKEN_LIFETIME` and `GITHUB_APP_TOKEN_LIFETIME` are the `CompressedValue`s for the badges; `OIDC_REAL_MIN_SECONDS` = 900.

**Selectors**

- `pipelineBoard(s, { recent?, maxPerStation?, at? })` → `{ runs, overflow }` (each run with `position: { station, progress }`); `pipelineView(s, recentOrOpts)` = its `runs`; `runPosition(run, t)`; `stationQueues(s)` (running/waiting run ids per station for „+26 u redu”).
- `predictLeadTime(s, { type?, changesDeps?, trigger? })` → `{ seconds, until, perStation, cold: { test, build, reason }, failsAt, excludes }`: the next commit with the current caches (pure).
- `idealLeadTime({ parallelJobs, cache, skipTests, gate? })` and `idealPrChecksTime(...)`: the best case (warm caches), pure arithmetic. Label it „u najboljem slučaju”.
- `dora(s, windowSec?)`, `doraSeries(s, n?)` (sparklines).
- `pipelineGoals(s)` → `{ leadTimeUnder10MinAllChecks, zeroBadOf20, deliveryThenDeployment }`, sticky.
- `commitTimeline(run, s?, t0?)` (stations with start/end relative to the commit, `atClock` with a state), `commitJourney(s, runId)` (PR checks + merged main run as one timeline), `releaseDayJourney({ seed?, mergeDelaySec?, config? })` (the whole L24 path on a fresh `dan-izdanja` state), `deployRef(s, run)` (`registry/klopa-api:2.0.2@sha256:…`).
- `lastPromotionDiff(s, { against?: 'node'|'previous' })` → `{ from, to, kind, shared, changed, downloadMB, totalMB, layers, changedVsPrevious }`.
- Labels: `STATIONS`, `COMMIT_TYPE_LABEL`, `DEFECT_LABEL`.

**Run state**

- `run.jobs[station]`: `status` (`pending`/`waiting`/`running`/`passed`/`failed`/`skipped`/`stopped`), `start`, `end`, `duration`, `attempts`, `note`, `cacheHit`.
- `run.status` (`running`, `waiting-approval`, `failed`, `checks-passed`, `in-registry`, `in-prod`, `cancelled`), `failedAt`, `failReason`, `failedBy` (the defect that stopped the line), `digest`, `stagingDigest`, `prodDigest`, `tested`, `tags`, `leadTimeSec`, `buildSteps` (per-layer CI build result), `rebuildForProd`, `rebuildNote`, `approvedBy`, `gateWaitSec`, `mergedFrom`, `streamIndex`.
- `run.commit`: `type`, `short`, `message`, `author` (`student`/`stream`/`team`), `defects`, `buggy`, `vulnerableBase`, `hasSecret`, `flaky`.
- `state.main`, `state.prod`, `state.prodHistory`, `state.configRepo`, `state.deployments`, `state.incidents`, `state.stats`, `state.trust`, `state.tokens`, `state.leaks`, `state.secretsInHistory`, `state.baseRevision`.

### Usage in a lecture (L08)

```tsx
import { useSimulation, SimFrame, Button, Toggle, Goals, EventLog, Stat, StatRow } from '../../kit'
import {
  createBuildLab, stepBuildLab, startBuild, changeCode, changeDeps, setDockerignore, setMultiStage, setCardOrder,
  injectEnvSecret, pushImage, moveTag, buildView, labGoals, labMetrics, labNow, fmtSeconds, fmtMB, LAB_RECOMMENDED_SPEEDS,
} from '../../engines/build/index.ts'

export function BuildCacheLab() {
  const sim = useSimulation({ init: () => createBuildLab({ preset: 'laboratorij', warm: true }), step: stepBuildLab, speed: 4 })
  const s = sim.state
  const view = buildView(s, { at: labNow(s) })
  const goals = labGoals(s) // sticky: once ticked, stays ticked
  const m = labMetrics(s)
  return (
    <SimFrame title="Laboratorij predmemorije izgradnje" sim={sim} speeds={[...LAB_RECOMMENDED_SPEEDS]} hint="Ponovna izgradnja nakon promjene koda < 5 s"
      controls={<>
        <Button onClick={() => sim.mutate((x) => { changeCode(x) })}>Promijeni kod</Button>
        <Button onClick={() => sim.mutate((x) => { changeDeps(x) })}>Promijeni ovisnosti</Button>
        <Button variant="primary" onClick={() => sim.mutate((x) => { startBuild(x) })}>Izgradi</Button>
        <Toggle label=".dockerignore" checked={s.context.dockerignore} onChange={(v) => sim.mutate((x) => setDockerignore(x, v))} />
        <Toggle label="Višefazna izgradnja" checked={s.multiStage} onChange={(v) => sim.mutate((x) => setMultiStage(x, v))} />
        <Button variant="danger" onClick={() => sim.mutate((x) => { injectEnvSecret(x) })}>Kopiraj .env pa ga obriši</Button>
        <Button onClick={() => sim.mutate((x) => { pushImage(x) })}>Pošalji u registar</Button>
        <Button onClick={() => sim.mutate((x) => { moveTag(x) })}>Pomakni latest na novu sliku</Button>
      </>}
      stats={<StatRow>
        <Stat label="Izgradnja" value={view ? fmtSeconds(view.elapsed) : '—'} sub="ilustrativno" />
        <Stat label="Slika" value={m.imageSizeMB === null ? '—' : fmtMB(m.imageSizeMB)} />
      </StatRow>}>
      {/* cards: <Reorder.Group values={s.cards.map(c => c.id)} onReorder={(ids) => sim.mutate((x) => setCardOrder(x, ids))}>, tray: s.tray */}
      {/* layer stack: view?.steps.map(st => <Layer key={st.id} status={st.live} progress={st.progress} size={st.sizeMB} digest={st.layer?.digest} />) */}
      <Goals goals={[
        { text: 'Ponovna izgradnja nakon promjene koda < 5 s', done: goals.rebuildUnder5s },
        { text: 'Slika < 200 MB', done: goals.imageUnder200MB },
        { text: 'Pronađite ključ u slici', done: goals.foundKey },
        { text: 'Slika radi kao korisnik koji nije root', done: goals.nonRoot },
      ]} />
      <EventLog events={s.events} />
    </SimFrame>
  )
}
```

### Usage in a lecture (L21)

```tsx
import { useSimulation } from '../../kit'
import {
  createPipeline, stepPipeline, commit, revertCommit, mainStatus, setPipelineOption, setGate, approveAll,
  leakCredential, credentialStatus, dora, pipelineBoard, pipelineGoals, predictLeadTime, simNow, stepToNextEvent,
  logEvents, fmtSeconds, PIPELINE_PRESETS, PIPELINE_DEFAULT_SPEED, PIPELINE_RECOMMENDED_SPEEDS, PIPELINE_DT,
} from '../../engines/build/index.ts'

const sim = useSimulation({ init: () => createPipeline(PIPELINE_PRESETS.tvornica), step: stepPipeline, fixedDt: PIPELINE_DT, speed: PIPELINE_DEFAULT_SPEED })
const s = sim.state
sim.mutate((x) => { commit(x, 'failing-test') })              // „Pada test”
const main = mainStatus(s)                                    // main.red → banner + „Vrati commit (git revert)” → revertCommit(x)
sim.mutate((x) => setPipelineOption(x, 'cache', true))        // „Predmemorija ovisnosti”
const next = predictLeadTime(s)                               // „Predvidi”: 860 s right after the switch, 540 s once warm
sim.mutate((x) => setGate(x, 'delivery'))                     // the gate slider (Segmented: 'ci' | 'delivery' | 'deployment')
sim.mutate((x) => { approveAll(x) })                          // the human click (or approve(x) for one run)
sim.mutate((x) => { leakCredential(x) })                      // „Procurio CI ključ” – OIDC: the newest token's countdown
sim.mutate((x) => { stepToNextEvent(x) })                     // toolbar „Sljedeći događaj” instead of the 0,25 s step
const board = pipelineBoard(s, { at: simNow(s), maxPerStation: 3 }) // runs + position for the assembly line, overflow badges
const log = logEvents(s.events, fmtSeconds)                   // „1 h 30 min” instead of „5400,0 s”, unique keys
// <SimFrame sim={sim} speeds={[...PIPELINE_RECOMMENDED_SPEEDS]} …>
```

### Usage in a lecture (L24)

```tsx
import { releaseDayJourney, fmtMB } from '../../engines/build/index.ts'

const j = releaseDayJourney()            // fresh 'dan-izdanja', PR at 11:48, merged as soon as its checks pass
// j.entries: [{ phase: 'pr' | 'main', station, label, start, end, atClock, note }] → the scrubbable timeline
// j.prodAt === '11:59:40', fmtMB(j.downloadMB) === '0,9 MB' (1 of 7 layers), j.digest = the digest built on main
const late = releaseDayJourney({ mergeDelaySec: 30 }) // late.prodAt === '12:00:10' – missed 12:00
```

---

## 4. Validated numbers

Every row is asserted in `build.test.ts`. Rows marked † are regenerated from the engine by the README test and compared word for word.

### L08: klopa-web (illustrative timings: base pull 8 s, `npm ci` 40 s, `npm run build` 3 s, COPY 1 s, `COPY --from` 0,2 s)

| Scenario | Number | Curriculum |
|---|---|---|
| Code edit, `COPY . .` before `npm ci` | **44 s** | „≈44 s” ✓ † |
| Code edit, correct order (single stage) | **4 s** | „≈4 s (COPY 1 s + build 3 s)”, task „< 5 s” ✓ † |
| Code edit, correct order, multi-stage | **4,2 s** (+ `COPY --from` 0,2 s) | < 5 s ✓ |
| Dependency edit, correct order | 45 s (multi-stage: 45,2 s) | — |
| No change | 0 s, same digest | — |
| Cold build: good single-stage / multi-stage / Iva (`node:24` full pull 39 s) | 53 s / 53,2 s / 83 s | — |
| `.dockerignore` off: context | 410,5 MB (+400 MB: `node_modules` 180 + `.git` 220) | „+400 MB” ✓ |
| `.dockerignore` off: a git change rebuilds `COPY . .` | 4 s; with `.dockerignore`: 0 s | „invalidated by any git change” ✓ |
| Image: Iva (`node:24`, no `.dockerignore`) | **1,7 GB** (1693,51 MB) | the hook says 1,1 GB: see §6 † |
| Image: `laboratorij` start (slim, no `.dockerignore`) | 844 MB | — |
| Image: good order, slim, single stage | 444 MB | — |
| Image: multi-stage (`nginx-unprivileged` 47 MB + dist 3 MB) | **50 MB** | „~50 MB”, task „< 200 MB” ✓ (only multi-stage passes) † |
| Development dependencies in the image: single stage / multi-stage | 120 MB / 0 MB | „dev deps 120 MB” ✓ |
| `npm ci --omit=dev` (60 MB) then `npm run build` | fails: `sh: vite: not found` | — |
| `--build-arg NPM_TOKEN` rotated (good order, single stage) | `ARG` stays CACHED, `npm ci` misses (`args-changed`): 44 s | miss at first use ✓ |
| `ARG NPM_TOKEN` before `npm ci` | token in `docker history` of `npm ci` **and** `npm run build`; multi-stage final image: 0 places | „never ENV/ARG for secrets” ✓ |
| Private package added, no token | `COPY package*.json` misses (`package-lock.json`, `package.json`), `npm ci` runs and fails with E401; a cached `npm ci` never fails | BuildKit: a cache hit never executes ✓ |
| Final user: single stage without `USER` / with `USER node` / multi-stage | `root` / `node` / `101` | task „nije root” ✓ |
| „Kopiraj .env pa ga obriši” in the runtime stage (`laboratorij` + multi-stage) | `USER root`, `COPY .env`, `RUN rm .env`, `USER 101`: still UID 101, key in a lower layer | changes only the secret ✓ |
| Pull onto an empty server at 10 MB/s: Iva / multi-stage | ≈72 s (715 MB transfer) / 2,6 s (21 MB) | — |
| Push after a code edit (multi-stage) | 3 layers „Layer already exists”, 1 „Pushed” (1,1 MB) | „push uploads only missing” ✓ |

### L08: klopa-api

| Scenario | Number | Curriculum |
|---|---|---|
| Code edit, correct order | **1 s** | „≈1 s” ✓ |
| Code edit, `COPY . .` before `pip install` (30 s) | 31 s | — |
| Image (`python:3.13-slim` 125 MB + site-packages 70 MB) | 198 MB, user 10001 | — |
| gunicorn without `--bind` behind `-p 8080:8000` | connection reset by peer | „reset” ✓ |

### L21: lead time commit → production (gate = deployment)

| Settings | Lead time | Notes |
|---|---|---|
| Sequential, no cache | **14 min 50 s** (890 s) | 30 + 180 + 240 + 60 + 20 + 60 + 240 + 60 † |
| Parallel jobs only | 14 min 20 s (860 s) | not < 10 min |
| Cache only | **9 min 30 s** (570 s) | < 10 min ✓ |
| Parallel + cache | **9 min** (540 s) | −39 % † |
| First commit after switching the cache on | 14 min 20 s (`predictLeadTime`), best case 9 min (`idealLeadTime`) | a cache switched on later starts empty † |
| Skip tests (no cache / cache + parallel) | 7 min 50 s / 4 min 30 s | does not count for „uz sve provjere” |
| Delivery, click after 10 min | 11 min (660 s) | lead time includes the wait |
| Rebuild for production (cache + parallel) | 13 min 20 s, `tested: false` | + 4 min build + 20 s push |
| Flaky test with all three attempts failing (cache + parallel) | tests end at 3 min, run fails | each retry is a full test run |
| One flaky test in the suite, 300 commits (seed 3) | ≈30 % of attempts fail; < 7 % of runs fail (0,3³ = 2,7 %) | — |
| Two flaky tests in the suite, 400 commits, no retries (seed 42) | ≈51 % of runs fail (1 − 0,7²) | — |
| „Pada test” with the `tvornica` preset | tests fail at 3 min 30 s; the teammate's revert is pushed at 4 min 30 s; a commit pushed in between inherits the bug and fails | „line stops” ✓ |
| Skip tests + buggy commit | CFR 100 %, recovery **6 min** (detect 5 + rollback 1) | — |
| Switch to „samo CI” while a run is in e2e | the run stops in the registry; 0 automatic deploys | „CI only stops after push” ✓ |
| Leaked OIDC token (sim lifetime 10 min, attacker every 60 s) | 9 successful uses, then denied | — |
| Same, leaked 10 s into the push job (token issued at 160 s) | valid for **9 min 50 s** (until 760 s), 9 uses | „usable only for its remaining lifetime” ✓ |
| Default leak with OIDC while run 2 is in tests (run 1's staging token from 180 s) | the staging token, „istječe sam za 9 min 25 s”; `running-job`: tests hold no token | — |
| Tokens per commit with OIDC (push, staging, production) | 3, each 10 min (sim) | „issued per job” ✓ |
| Leaked long-lived key, 1 h, not revoked | 60 successful uses, still valid | — |

### L21: the 20-commit stream (seed 42: 12 ok, 2 failing test, 1 vulnerable, 2 flaky, 3 secrets; one every 6 min; the team reverts a red main after 1 min)

| Scenario | Result | Notes |
|---|---|---|
| 20-commit stream, seed 42, all checks | 18 deploys, **0 bad in production**, median lead time 10 min, 8 team reverts | task ✓; the flaky test from commit #5 stays in the suite: retries add 1 min to many runs, trust falls to 0,1 † |
| Same stream with skip tests | 21 deploys, 4 bad, CFR 19 %, median recovery 7 min | detect 5 + wait for the production lock 1 + rollback 1 † |
| `tvornica` (delivery gate) with `autoApprove`, or `approveAll` after each wave | 15 deploys, 0 bad, stream done | without approvals the stream never finishes |
| Nobody reverts (`revertAfterSec: null`) | 3 deploys, 14 runs blocked by an inherited defect, main stays red | „a red main blocks everyone” |

### L21 / L24: digests, layers and the node

| Scenario | Result | Notes |
|---|---|---|
| L24: production moves 2.0.1 → 2.0.2 with the cache (`releaseDayJourney()`) | node downloads 1 of 7 layers, **0,9 MB**; production at 11:59:40 | „pulls only changed layers” ✓ (7 layers: 3 base, WORKDIR, `COPY requirements.txt`, `pip install`, `COPY . .`) † |
| Same without the cache | 2 of 7 layers, 25,4 MB (the rebuilt `pip install` layer too) | — |
| `releaseDayJourney({ mergeDelaySec: 30 })` | production at 12:00:10 | every second of delay moves it |
| Rollback to the digest production ran before | node downloads 0 of 7 layers (0 MB) | the node still has the image (`IfNotPresent`) † |
| Base tag republished, then a commit (cache + parallel) | build cold **4 min**, lead time 12 min 20 s; node downloads 5 of 7 layers (70,4 MB: base 45 + `pip install` 24,5 + code 0,9); WORKDIR and `COPY requirements.txt` are shared | „a newer base image behind the same tag” ✓ |
| PR → merge, `cacheBackend: 'gha'` (default, `dan-izdanja`) | new digest (main rebuilds `COPY . .`) | the promoted digest is the one built on main † |
| PR → merge, `cacheBackend: 'registry'`, main unchanged | same digest | † |
| PR checks (`dan-izdanja`) | 2 min 40 s (lint ‖ tests 1 min, build 40 s, scan 1 min) | — |

### Invariants asserted

- Never a CACHED step above a rebuilt one (random reorders and edits).
- Never two runs in staging/e2e, and never two production deployments, at the same time. Staging is FIFO.
- `digest == sha256(manifest)`; the push log's `size:` is the manifest's byte length.
- A secret value never appears in a cache-miss label.
- The built, staging and production digests are equal (unless a rebuild is forced).
- Under „samo CI” nothing that had not started deploying is deployed.
- A flaky test never makes a deploy „bad”; a rollback never downloads layers the node already has.
- Results do not depend on how `dt` is chunked; the same seed and actions give identical events and digests.
- Events are capped at 50 and runs at 60; DORA never returns NaN.
- `predictLeadTime` does not change the state.

---

## 5. Labels the UI must show

| Value | Label |
|---|---|
| All build and pipeline durations, image sizes | *ilustrativno* (illustrative, not real defaults) |
| OIDC token lifetime | `OIDC_TOKEN_LIFETIME.label`: „10 min (sim) · stvarno: AWS STS zadano 1 h, najmanje 15 min” |
| Incident detection (5 min), the teammate's revert (1 min) | *ilustrativno* |
| `idealLeadTime` | „u najboljem slučaju (topla predmemorija)”; `predictLeadTime(s).excludes` for the prediction's footnote |
| Base tags (`node:24-slim`, `nginxinc/nginx-unprivileged:1.30-alpine`, `python:3.13-slim`) | Pinned in `image.ts`. Verify current tags when authoring (stanje: listopad 2026.). |

## 6. Open questions for authors (outside this directory)

1. **L08 hook „slika ima 1,1 GB”.** With the spec's own sizes (full `node:24` ≈ 1,1 GB, slim ≈ 250 MB) Iva's Dockerfile gives **1,7 GB** (preset `ivin-prvi`), and no lab setting gives ≈ 1,1 GB (full + `.dockerignore`: 1,3 GB; slim without `.dockerignore`: 844 MB): the base alone is 1,1 GB. The engine keeps the spec's base sizes. Suggested hook wording: „slika ima 1,7 GB”. The „40-ak sekundi” in the hook does reproduce (44 s).
2. **L24 hook „Petak, 11:55 … prije 12:00”.** The L21 durations make the commit path 11 min 40 s (PR checks 2 min 40 s + main 9 min), so it cannot start at 11:55 and land before 12:00. `dan-izdanja` starts the clock at 11:48 (Lana pushes the PR); production is at 11:59:40 only if the merge happens as soon as the checks pass. Either the hook names 11:48 as the moment Lana pushes, or the scene uses `releaseDayJourney()` as a replay rather than a live race.
3. **Kit `EventLog`** keys rows by `${t}-${text}` and prints `t` as „x,y s”. Two identical events at the same t (e.g. „Promijeni kod” twice while paused) collide, and pipeline times read „5400,0 s”. Engine events carry a unique `id`; the kit should key on `e.id` when present and accept a `formatTime` prop. Until then, pipeline UIs can render `logEvents(s.events, fmtSeconds)` themselves.
