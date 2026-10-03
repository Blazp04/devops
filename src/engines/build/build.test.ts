/**
 * E4 „Tvornica” – tests. Run: node --test src/engines/build/*.test.ts
 * Reproduces the L08 and L21 model numbers from docs/curriculum.json and checks invariants.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRng } from '../../kit/sim/math.ts'
import { readFileSync } from 'node:fs'
import { advanceClock, clockLabel, createClock, fmtMB, fmtSeconds, logEvents, MAX_EVENTS, MIN_MBPS, pushEvent, rate, shortDigest, type EngineEvent } from './common.ts'
import * as engineApi from './index.ts'
import { digestOf, sha256Hex } from './sha256.ts'
import {
  BASE_IMAGES,
  basePullSeconds,
  CACHE_REASON_LABEL,
  createCache,
  devDepsInImage,
  DIGEST_NOTE,
  findSecrets,
  imageHistory,
  isRootUser,
  matchContext,
  mergedView,
  NODE_MODULES_DEV_MB,
  patchedBase,
  planBuild,
  applyPlanWrites,
  resolveTimings,
  WORKDIR_LAYER_MB,
  type BuildContext,
  type Instruction,
} from './image.ts'
import {
  applyPull,
  createHost,
  createRegistry,
  defaultPullPolicy,
  formatImageRef,
  layerDiff,
  MAX_TAG_HISTORY,
  parseImageRef,
  planPull,
  resolveRef,
  setTag,
} from './registry.ts'
import { LAB_PRESETS, PROJECTS, type LabPresetId } from './projects.ts'
import {
  addCard,
  buildNow,
  buildView,
  changeCode,
  changeDeps,
  createBuildLab,
  curlFromHost,
  deleteInContainer,
  dockerfileLines,
  dockerignoreLines,
  finishBuild,
  finishPush,
  gitShortSha,
  imageStale,
  ENV_TRICK_RESTORE_USER_ID,
  injectEnvSecret,
  inspectLayer,
  isMultiStage,
  LAB_RECOMMENDED_SPEEDS,
  labContext,
  labGoals,
  labGoalsCurrent,
  labMetrics,
  labNow,
  moveCard,
  moveTag,
  previewBuild,
  pullOnServer,
  pullView,
  pushImage,
  pushView,
  removeCard,
  removeContainer,
  removeEnvSecret,
  runContainer,
  searchInImage,
  serverReport,
  servesApp,
  setBaseVariant,
  setCardOrder,
  setDockerignore,
  setIgnoreDockerfile,
  setListenAddr,
  setMultiStage,
  setNpmTokenVia,
  setPrivateNpm,
  startBuild,
  startPull,
  stepBuildLab,
  swapCard,
  touchGit,
  tryRunContainer,
  writeInContainer,
  type BuildLabState,
} from './lab.ts'
import {
  approve,
  approveAll,
  commit,
  commitJourney,
  commitTimeline,
  createPipeline,
  credentialStatus,
  DEFAULT_DURATIONS,
  deployRef,
  dora,
  doraSeries,
  GITHUB_APP_TOKEN_LIFETIME,
  idealLeadTime,
  idealPrChecksTime,
  lastPromotionDiff,
  leakCredential,
  mainStatus,
  mergePullRequest,
  nextEventTime,
  nextPatchVersion,
  OIDC_TOKEN_LIFETIME,
  PIPELINE_DEFAULT_SPEED,
  PIPELINE_DT,
  PIPELINE_PRESETS,
  PIPELINE_RECOMMENDED_SPEEDS,
  pipelineBoard,
  pipelineGoals,
  pipelineView,
  predictLeadTime,
  rebuildForProduction,
  releaseDayJourney,
  revertCommit,
  revokeCredential,
  rotateSecrets,
  runPipelineUntil,
  runPipelineUntilIdle,
  runPosition,
  resolveDurations,
  setCredential,
  setDeployMode,
  setGate,
  setPipelineOption,
  setRebuildForProduction,
  setTeamRevert,
  simNow,
  startCommitStream,
  stationQueues,
  stepPipeline,
  stepToNextEvent,
  streamStatus,
  updateBaseImage,
  waitingAtGate,
  wallClock,
  type PipelineState,
  type StationId,
} from './pipeline.ts'

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`)

/** cold build → code edit → deps edit → no change, returning the four summaries */
function cycle(state: BuildLabState) {
  const cold = buildNow(state)!
  changeCode(state)
  const code = buildNow(state)!
  changeDeps(state)
  const deps = buildNow(state)!
  const none = buildNow(state)!
  return { cold, code, deps, none }
}

// =============================================================================================
describe('sha256 + common helpers', () => {
  test('sha256Hex matches node:crypto (ASCII, UTF-8, multi-block)', () => {
    for (const s of ['', 'abc', 'Ćevap-petak · č ž đ', 'x'.repeat(1000), '{"schemaVersion":2}']) {
      assert.equal(sha256Hex(s), createHash('sha256').update(s, 'utf8').digest('hex'))
    }
    assert.equal(digestOf('abc'), 'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  test('Croatian formatting with decimal comma', () => {
    assert.equal(fmtSeconds(4.2), '4,2 s')
    assert.equal(fmtSeconds(44), '44 s')
    assert.equal(fmtSeconds(540), '9 min')
    assert.equal(fmtSeconds(890), '14 min 50 s')
    assert.equal(fmtSeconds(3900), '1 h 5 min')
    assert.equal(fmtSeconds(Number.NaN), 'n/a')
    assert.equal(fmtMB(50), '50 MB')
    assert.equal(fmtMB(0.5), '0,5 MB')
    assert.equal(fmtMB(1693.5), '1,7 GB')
    assert.equal(fmtMB(Number.POSITIVE_INFINITY), 'n/a')
    assert.equal(shortDigest('sha256:0123456789abcdef'), 'sha256:0123456789ab')
    assert.equal(shortDigest(null), '—')
  })

  test('fixed-step clock: same total time in any chunking, ignores bad dt', () => {
    const a = createClock(0.05)
    const b = createClock(0.05)
    let ta = 0
    let tb = 0
    for (let i = 0; i < 600; i++) advanceClock(a, 1 / 60, () => ta++)
    advanceClock(b, 10, () => tb++)
    assert.equal(ta, 200)
    assert.equal(tb, 200)
    assert.equal(a.t, 10)
    assert.equal(b.t, 10)
    advanceClock(a, Number.NaN, () => ta++)
    advanceClock(a, -1, () => ta++)
    advanceClock(a, 0, () => ta++)
    assert.equal(ta, 200)
  })

  test('event list is capped', () => {
    const ev: EngineEvent[] = []
    for (let i = 0; i < 120; i++) pushEvent(ev, i, 'x', `e${i}`)
    assert.equal(ev.length, MAX_EVENTS)
    assert.equal(ev[ev.length - 1].text, 'e119')
  })
})

// =============================================================================================
describe('L08 build cache – validated numbers', () => {
  test('base pull: node:24-slim pulls in 8 s the first time, 0 s after', () => {
    assert.equal(basePullSeconds(BASE_IMAGES['node:24-slim']), 8)
    assert.equal(BASE_IMAGES['node:24'].sizeMB, 1100)
    assert.equal(BASE_IMAGES['node:24-slim'].sizeMB, 250)
    const s = createBuildLab({ preset: 'dobar-redoslijed' })
    const first = buildNow(s)!
    assert.equal(first.seconds, 8 + 1 + 40 + 1 + 3)
    const from = s.build!.plan.steps[0]
    assert.equal(from.reason, 'base-pull')
    assert.equal(from.duration, 8)
    setDockerignore(s, false)
    setDockerignore(s, true)
    const again = buildNow(s)!
    assert.equal(again.seconds, 0)
  })

  test('COPY . . before npm ci → code edit ≈ 44 s (COPY 1 + npm ci 40 + build 3)', () => {
    const r = cycle(createBuildLab({ preset: 'los-redoslijed' }))
    assert.equal(r.code.seconds, 44)
    assert.equal(r.code.firstRebuilt?.text, 'COPY . .')
    assert.deepEqual(r.code.firstRebuilt?.changedFiles, ['src/'])
  })

  test('correct order → code edit ≈ 4 s (COPY 1 + build 3), deps edit 45 s, no change 0 s', () => {
    const r = cycle(createBuildLab({ preset: 'dobar-redoslijed' }))
    assert.equal(r.code.seconds, 4)
    assert.ok(r.code.seconds < 5)
    assert.equal(r.deps.seconds, 45)
    assert.equal(r.deps.firstRebuilt?.text, 'COPY package*.json ./')
    assert.deepEqual(r.deps.firstRebuilt?.changedFiles, ['package-lock.json', 'package.json'])
    assert.equal(r.none.seconds, 0)
    assert.equal(r.none.rebuilt, 0)
    assert.equal(r.none.digest, r.deps.digest, 'a fully cached rebuild gives the same digest')
  })

  test('multi-stage: stages build in parallel (53,2 s cold, not 55,2 s); code edit 4,2 s < 5 s; final image 50 MB, non-root', () => {
    const s = createBuildLab({ preset: 'visefazna' })
    const r = cycle(s)
    assert.equal(r.cold.seconds, 53.2)
    assert.equal(r.code.seconds, 4.2)
    assert.ok(r.code.seconds < 5)
    assert.equal(r.deps.seconds, 45.2)
    assert.equal(s.image!.sizeMB, 50)
    assert.equal(s.image!.config.user, '101')
    assert.equal(s.image!.config.listen?.port, 8080)
    assert.equal(s.image!.stage, 'runtime')
    assert.deepEqual(labGoals(s), { rebuildUnder5s: true, imageUnder200MB: true, foundKey: false, nonRoot: true })
  })

  test('image sizes: Iva 1,7 GB → good single-stage 444 MB → multi-stage 50 MB (< 200 MB only with multi-stage)', () => {
    const iva = createBuildLab({ preset: 'ivin-prvi' })
    buildNow(iva)
    close(iva.image!.sizeMB, 1100 + 0.008 + (410.501 + 0.001) + 180 + 3) // WORKDIR layer 8 kB; COPY . . also copies the Dockerfile
    assert.equal(fmtMB(iva.image!.sizeMB), '1,7 GB')
    const good = createBuildLab({ preset: 'dobar-redoslijed' })
    buildNow(good)
    close(good.image!.sizeMB, 444 + WORKDIR_LAYER_MB + 0.001 + 0.0001) // WORKDIR layer, Dockerfile, .dockerignore
    assert.equal(fmtMB(good.image!.sizeMB), '444 MB')
    const multi = createBuildLab({ preset: 'visefazna' })
    buildNow(multi)
    assert.equal(multi.image!.sizeMB, 50)
    // node_modules (180 MB, of which 120 MB dev deps) only lives in the build stage
    assert.ok(!mergedView(multi.image!).has('node_modules/'))
    assert.ok(mergedView(good.image!).has('node_modules/'))
    assert.equal(labMetrics(good).devDepsMB, 120, 'single stage ships Vite, TypeScript, ESLint…')
    assert.equal(labMetrics(multi).devDepsMB, 0)
    assert.equal(labMetrics(iva).devDepsMB, 120)
    assert.equal(devDepsInImage(good.image!), NODE_MODULES_DEV_MB)
  })

  test('npm ci --omit=dev in the only stage: −120 MB, but npm run build cannot find Vite (why the build gets its own stage)', () => {
    const s = createBuildLab({ preset: 'dobar-redoslijed' })
    const i = s.cards.findIndex((c) => c.id === 'npm-ci')
    assert.equal(removeCard(s, 'npm-ci'), true)
    assert.equal(addCard(s, 'npm-ci-omit-dev', i), true)
    const r = buildNow(s)!
    assert.equal(r.ok, false)
    assert.match(r.error!, /vite: not found/)
    const failed = s.build!.plan.steps.find((x) => x.status === 'failed')!
    assert.equal(failed.id, 'npm-build')
    // the runtime-only install itself works and is 60 MB
    const ci = s.build!.plan.steps.find((x) => x.id === 'npm-ci-omit-dev')!
    assert.equal(ci.sizeMB, 60)
    assert.equal(ci.status, 'run')
  })

  test('Iva\'s first Dockerfile: 40-ak s per code edit, root, .env with the SMS key in a layer', () => {
    const s = createBuildLab({ preset: 'ivin-prvi' })
    const r = cycle(s)
    assert.equal(r.code.seconds, 44)
    assert.deepEqual(r.code.firstRebuilt?.changedFiles, ['.git/', 'src/'])
    assert.equal(s.image!.config.user, 'root')
    const ex = findSecrets(s.image!)
    assert.equal(ex.length, 1)
    assert.equal(ex[0].secret.name, 'SMS_API_KEY')
    assert.equal(ex[0].hiddenByWhiteout, false)
    assert.equal(labMetrics(s).nonRoot, false)
  })

  test('.dockerignore: context 410,5 MB → 10,5 MB; without it any git change invalidates COPY . .', () => {
    const s = createBuildLab({ preset: 'dobar-redoslijed', dockerignore: false })
    close(labMetrics(s).contextSizeMB, 410.502) // + the Dockerfile (1 kB)
    buildNow(s)
    touchGit(s)
    const g = buildNow(s)!
    assert.equal(g.seconds, 4, 'COPY . . + build re-run because .git/ changed')
    assert.deepEqual(g.firstRebuilt?.changedFiles, ['.git/'])
    setDockerignore(s, true)
    close(labMetrics(s).contextSizeMB, 10.5011) // + Dockerfile and .dockerignore
    buildNow(s)
    touchGit(s)
    assert.equal(buildNow(s)!.seconds, 0, 'with .dockerignore a git change does not touch the image')
  })

  test('klopa-api: correct order code edit ≈ 1 s; COPY . . before pip install ≈ 31 s', () => {
    const api = createBuildLab({ preset: 'api-dobar' })
    const good = cycle(api)
    assert.equal(good.code.seconds, 1)
    close(api.image!.sizeMB, 198.0391)
    assert.equal(api.image!.config.user, '10001')
    assert.equal(good.cold.seconds, 4.5 + 1 + 30 + 1)
    assert.equal(good.deps.seconds, 1 + 30 + 1)
    const bad = cycle(createBuildLab({ preset: 'api-los' }))
    assert.equal(bad.code.seconds, 31)
  })

  test('cascade invariant: never a CACHED step above a rebuilt one in the same stage (random orders and edits)', () => {
    const rng = createRng(7)
    for (let trial = 0; trial < 60; trial++) {
      const preset = rng.pick(['laboratorij', 'dobar-redoslijed', 'visefazna', 'api-dobar', 'api-los'] as LabPresetId[])
      const s = createBuildLab({ preset, seed: trial })
      for (let k = 0; k < 8; k++) {
        const a = rng.int(0, 4)
        if (a === 0) changeCode(s)
        else if (a === 1) changeDeps(s)
        else if (a === 2) touchGit(s)
        else if (a === 3) moveCard(s, rng.pick(s.cards).id, rng.int(0, s.cards.length - 1))
        else setDockerignore(s, rng.chance(0.5))
        const plan = previewBuild(s)
        buildNow(s)
        const byStage = new Map<number, typeof plan.steps>()
        for (const st of plan.steps) byStage.set(st.stageIndex, [...(byStage.get(st.stageIndex) ?? []), st])
        for (const steps of byStage.values()) {
          let rebuiltSeen = false
          for (const st of steps) {
            if (st.metadataOnly) continue // USER/ENV/ARG/CMD/EXPOSE are settings, not layers
            if (st.status === 'run' && st.kind !== 'FROM') rebuiltSeen = true
            if (rebuiltSeen) assert.notEqual(st.status, 'cached', `${preset}: ${st.text} cached above a rebuilt layer`)
          }
        }
        // the stopwatch equals the critical path through the rebuilt steps
        if (plan.ok) assert.ok(plan.totalSeconds >= Math.max(0, ...plan.steps.map((x) => x.end)) - 1e-9)
      }
    }
  })

  test('cache reasons: first build, inputs changed, parent rebuilt, USER moved (settings line, then env-changed)', () => {
    const s = createBuildLab({ preset: 'dobar-redoslijed' })
    const p0 = previewBuild(s)
    assert.ok(p0.steps.filter((x) => x.kind !== 'FROM' && !x.metadataOnly).every((x) => x.reason === 'first-build'))
    assert.ok(p0.steps.filter((x) => x.metadataOnly).every((x) => x.reason === 'metadata'))
    buildNow(s)
    changeCode(s)
    const p1 = previewBuild(s)
    const byId = Object.fromEntries(p1.steps.map((x) => [x.id, x]))
    assert.equal(byId['npm-ci'].reason, 'cache-hit')
    assert.equal(byId['copy-all'].reason, 'inputs-changed')
    assert.deepEqual(byId['copy-all'].changedFiles, ['src/'])
    assert.equal(byId['npm-build'].reason, 'parent-rebuilt')
    buildNow(s)
    // USER node right after WORKDIR /app: USER is a setting (no layer), COPY stays CACHED (BuildKit), but npm ci
    // now runs as node in the root-owned /app → EACCES, exactly like real Docker.
    moveCard(s, 'user-node', 2)
    const p2 = previewBuild(s)
    assert.equal(p2.steps.find((x) => x.id === 'user-node')!.reason, 'metadata')
    assert.equal(p2.steps.find((x) => x.id === 'copy-pkg')!.status, 'cached')
    assert.equal(p2.ok, false)
    assert.equal(p2.error!.stepId, 'npm-ci')
    assert.match(p2.error!.message, /EACCES: permission denied, mkdir '\/app\/node_modules'/)
    // USER node before WORKDIR: /app is created as node → the build works; WORKDIR's layer changed owner
    moveCard(s, 'user-node', 1)
    const p3 = previewBuild(s)
    assert.equal(p3.ok, true)
    const wd = p3.steps.find((x) => x.id === 'workdir')!
    assert.equal(wd.reason, 'env-changed')
    assert.deepEqual(wd.changedFiles, ['USER'])
    assert.equal(wd.user, 'node')
    assert.equal(p3.steps.find((x) => x.id === 'copy-pkg')!.reason, 'parent-rebuilt')
  })

  test('RUN cache key ignores the files RUN reads; ARG values are part of it (miss at first use); secret mounts are not', () => {
    const s = createBuildLab({ preset: 'dobar-redoslijed' })
    setNpmTokenVia(s, 'secret-mount')
    buildNow(s)
    s.context.secrets.npmrc = { name: 'NPM_TOKEN', value: 'rotated-token' }
    assert.equal(buildNow(s)!.seconds, 0, 'a new secret value does not bust the cache')
    setNpmTokenVia(s, 'arg')
    buildNow(s)
    s.context.args.NPM_TOKEN = 'rotated-token'
    const p = previewBuild(s)
    assert.equal(p.steps.find((x) => x.id === 'arg-npm-token')!.status, 'cached', 'the ARG definition itself does not miss')
    const ci = p.steps.find((x) => x.id === 'npm-ci-arg')!
    assert.equal(ci.status, 'run', 'a new ARG value misses at its first use')
    assert.equal(ci.reason, 'args-changed')
    assert.deepEqual(ci.changedFiles, ['NPM_TOKEN'], 'the label names the ARG, never its value')
    assert.equal(p.totalSeconds, 40 + 1 + 3, 'npm ci and everything after it')
    // a RUN before the ARG is not affected; an unrelated build arg that no ARG declares changes nothing
    const t = createBuildLab({ preset: 'dobar-redoslijed' })
    buildNow(t)
    t.context.args.UNUSED = 'x'
    assert.equal(buildNow(t)!.seconds, 0)
  })

  test('digest = sha256 of the manifest JSON; config digest = sha256 of the config JSON', () => {
    const s = createBuildLab({ preset: 'visefazna' })
    buildNow(s)
    const img = s.image!
    assert.equal(img.digest, `sha256:${createHash('sha256').update(img.manifestJson).digest('hex')}`)
    assert.equal(img.configDigest, `sha256:${createHash('sha256').update(img.configJson).digest('hex')}`)
    const manifest = JSON.parse(img.manifestJson)
    assert.equal(manifest.config.digest, img.configDigest)
    assert.deepEqual(
      manifest.layers.map((l: { digest: string }) => l.digest),
      img.layers.map((l) => l.digest),
    )
  })

  test('non-reproducible by default: same inputs in a fresh builder → same COPY layers, new RUN layers, new digest; reproducible → identical', () => {
    const a = createBuildLab({ preset: 'dobar-redoslijed' })
    const b = createBuildLab({ preset: 'dobar-redoslijed' })
    buildNow(a)
    buildNow(b)
    b.nextBuildId = 99
    b.cache = createCache()
    buildNow(b)
    const la = a.image!.layers
    const lb = b.image!.layers
    assert.equal(la.find((l) => l.createdBy === 'COPY . .')!.digest, lb.find((l) => l.createdBy === 'COPY . .')!.digest)
    assert.notEqual(la.find((l) => l.createdBy === 'RUN npm ci')!.digest, lb.find((l) => l.createdBy === 'RUN npm ci')!.digest)
    assert.notEqual(a.image!.digest, b.image!.digest)
    const r1 = createBuildLab({ preset: 'dobar-redoslijed', reproducible: true })
    const r2 = createBuildLab({ preset: 'dobar-redoslijed', reproducible: true, seed: 5 })
    r2.nextBuildId = 77
    buildNow(r1)
    buildNow(r2)
    assert.equal(r1.image!.digest, r2.image!.digest)
  })

  test('determinism: same seed and actions → identical digests and events; another seed → other RUN digests', () => {
    const go = (seed: number) => {
      const s = createBuildLab({ preset: 'visefazna', seed })
      startBuild(s)
      for (let i = 0; i < 4000; i++) stepBuildLab(s, 1 / 60)
      changeCode(s)
      startBuild(s)
      for (let i = 0; i < 400; i++) stepBuildLab(s, 1 / 60)
      pushImage(s)
      for (let i = 0; i < 600; i++) stepBuildLab(s, 1 / 60)
      return s
    }
    const a = go(1)
    const b = go(1)
    const c = go(2)
    assert.equal(a.image!.digest, b.image!.digest)
    assert.deepEqual(a.events, b.events)
    assert.notEqual(a.image!.digest, c.image!.digest)
  })
})

// =============================================================================================
describe('L08 errors and edge cases', () => {
  const ctx = (): BuildContext => ({ files: PROJECTS['klopa-web'].files.map((f) => ({ ...f })), dockerignore: true, secrets: {}, args: {} })
  const cat = PROJECTS['klopa-web'].catalog
  const plan = (ids: string[], c = ctx()) => planBuild(ids.map((id) => ({ ...cat[id] }) as Instruction), { context: c, cache: createCache(), localBases: new Set(), buildId: 1, now: 0 })

  test('empty Dockerfile and instructions before FROM fail', () => {
    const empty = planBuild([], { context: ctx(), cache: createCache(), localBases: new Set(), buildId: 1, now: 0 })
    assert.equal(empty.ok, false)
    assert.equal(empty.totalSeconds, 0)
    const before = plan(['workdir', 'from-build'])
    assert.equal(before.ok, false)
    assert.match(before.error!.message, /prije prve FROM/)
  })

  test('npm ci before COPY package*.json, build before COPY . ., rm of a missing file, npm in nginx → errors', () => {
    assert.match(plan(['from-build', 'workdir', 'npm-ci']).error!.message, /package\.json/)
    assert.match(plan(['from-build', 'workdir', 'copy-pkg', 'npm-ci', 'npm-build', 'copy-all']).error!.message, /src\//)
    assert.match(plan(['from-build', 'workdir', 'npm-build']).error!.message, /vite: not found/)
    assert.match(plan(['from-build', 'rm-env']).error!.message, /cannot remove/)
    assert.match(plan(['from-runtime', 'copy-pkg', 'npm-ci']).error!.message, /npm: not found/)
  })

  test('COPY --from: undefined stage, self reference, missing path', () => {
    assert.match(plan(['from-runtime', 'copy-dist']).error!.message, /nije definirana/)
    const self = [{ ...cat['from-build'] }, { ...cat['copy-dist'] }] as Instruction[]
    assert.match(planBuild(self, { context: ctx(), cache: createCache(), localBases: new Set(), buildId: 1, now: 0 }).error!.message, /same sebe/)
    assert.match(plan(['from-build', 'workdir', 'from-runtime', 'copy-dist']).error!.message, /not found/)
  })

  test('a failing step stops the build at its time; finished steps stay cached for the next build', () => {
    const s = createBuildLab({ preset: 'dobar-redoslijed' })
    moveCard(s, 'npm-build', 4) // build before COPY . . → fails after npm ci
    const r = buildNow(s)!
    assert.equal(r.ok, false)
    assert.match(r.error!, /redak/)
    assert.equal(s.image, null)
    const p = s.build!.plan
    assert.equal(p.steps.find((x) => x.id === 'npm-ci')!.status, 'run')
    assert.equal(p.steps.find((x) => x.id === 'copy-all')!.status, 'skipped')
    setCardOrder(s, LAB_PRESETS['dobar-redoslijed'].cards)
    const fixed = buildNow(s)!
    assert.equal(fixed.ok, true)
    assert.equal(fixed.seconds, 4, 'npm ci from the failed build is reused')
  })

  test('unused stage is skipped (BuildKit builds only what the target needs)', () => {
    const s = createBuildLab({ preset: 'visefazna' })
    removeCard(s, 'copy-dist')
    const p = previewBuild(s)
    assert.ok(p.steps.filter((x) => x.stage === 'build').every((x) => x.reason === 'unused-stage' && x.status === 'skipped'))
    assert.equal(p.totalSeconds, 2) // only the nginx base pull
    buildNow(s)
    assert.equal(s.image!.sizeMB, 47)
  })

  test('applyPlanWrites(upTo) writes only the layers finished by then', () => {
    const p = plan(['from-build', 'workdir', 'copy-pkg', 'npm-ci', 'copy-all', 'npm-build'])
    const cache = createCache()
    const bases = new Set<string>()
    applyPlanWrites(p, cache, bases, 10) // pull 8 s, COPY package*.json ends at 9 s, npm ci at 49 s
    assert.equal(bases.has(BASE_IMAGES['node:24-slim'].digest), true, 'the builder stores base images by digest')
    assert.equal(bases.has('node:24-slim'), false)
    assert.equal(cache.entries.has(p.steps[2].cacheKey), true)
    assert.equal(cache.entries.has(p.steps[3].cacheKey), false)
    applyPlanWrites(p, cache, bases)
    assert.equal(cache.entries.size, p.steps.length)
  })

  test('matchContext: globs, dot, missing patterns', () => {
    const files = ctx().files.filter((f) => !f.ignored)
    assert.deepEqual(
      matchContext(['package*.json'], files).matched.map((f) => f.path),
      ['package-lock.json', 'package.json'],
    )
    assert.equal(matchContext(['.'], files).matched.length, files.length)
    assert.deepEqual(matchContext(['nema.txt'], files).missing, ['nema.txt'])
  })

  test('isRootUser', () => {
    assert.equal(isRootUser('root'), true)
    assert.equal(isRootUser('0'), true)
    assert.equal(isRootUser('0:0'), true)
    assert.equal(isRootUser(''), true)
    assert.equal(isRootUser('node'), false)
    assert.equal(isRootUser('101'), false)
  })
})

// =============================================================================================
describe('L08 secrets in layers', () => {
  test('„Kopiraj .env pa ga obriši” (no .dockerignore): the key stays in lower layers, hidden from the container', () => {
    const s = createBuildLab({ preset: 'laboratorij' })
    assert.deepEqual(injectEnvSecret(s), { added: true, willFail: null })
    assert.deepEqual(injectEnvSecret(s), { added: false, willFail: null }, 'only once')
    buildNow(s)
    const ex = findSecrets(s.image!).filter((e) => e.where === 'layer')
    assert.ok(ex.length >= 1)
    assert.ok(ex.every((e) => e.hiddenByWhiteout), 'RUN rm only adds a whiteout')
    assert.ok(!mergedView(s.image!).has('.env'), 'the container does not see it')
    assert.equal(labGoals(s).foundKey, false)
    const idx = ex[0].layerIndex!
    inspectLayer(s, idx)
    assert.equal(labGoals(s).foundKey, true)
    assert.equal(s.events.some((e) => e.kind === 'secret-found'), true)
    assert.ok(imageHistory(s.image!).some((h) => h.createdBy === 'RUN rm .env' && h.sizeMB === 0))
  })

  test('with .dockerignore the .env is not in the context: COPY .env fails with „not found” (unignore: false)', () => {
    const s = createBuildLab({ preset: 'dobar-redoslijed' })
    const inj = injectEnvSecret(s, { unignore: false })
    assert.match(inj.willFail!, /not found.*\.dockerignore/, 'the break-it warns that the build will fail')
    const r = buildNow(s)!
    assert.equal(r.ok, false)
    assert.match(r.error!, /not found.*\.dockerignore/)
    removeEnvSecret(s)
    assert.equal(removeEnvSecret(s), false)
    assert.equal(buildNow(s)!.ok, true)
    assert.equal(findSecrets(s.image!).length, 0)
  })

  test('npm token: COPY+rm and ARG leak, BuildKit secret mount does not; ENV leaks to docker inspect', () => {
    const via = (v: 'copy-rm' | 'arg' | 'secret-mount') => {
      const s = createBuildLab({ preset: 'dobar-redoslijed' })
      setNpmTokenVia(s, v)
      buildNow(s)
      return findSecrets(s.image!).filter((e) => e.secret.name === 'NPM_TOKEN')
    }
    const copyRm = via('copy-rm')
    assert.ok(copyRm.some((e) => e.where === 'layer' && e.hiddenByWhiteout))
    assert.ok(copyRm.some((e) => e.where === 'layer' && !e.hiddenByWhiteout), 'COPY . . copies .npmrc again unless .dockerignore lists it')
    // every RUN after `ARG NPM_TOKEN` carries it: npm ci AND npm run build show it in docker history
    const arg = via('arg')
    assert.deepEqual(
      arg.map((e) => e.where),
      ['history', 'history'],
    )
    assert.match(arg[0].how, /^docker history: RUN \|1 NPM_TOKEN=npm_k1Op4Pr1v4t3T0k3n \/bin\/sh -c npm ci$/)
    assert.match(arg[1].how, /npm run build$/)
    assert.deepEqual(via('secret-mount'), [])
    const s = createBuildLab({ preset: 'dobar-redoslijed' })
    assert.equal(setNpmTokenVia(s, 'none'), false)
    assert.equal(setNpmTokenVia(createBuildLab({ preset: 'api-dobar' }), 'arg'), false)
    addCard(s, 'env-secret', 2)
    buildNow(s)
    assert.deepEqual(
      findSecrets(s.image!).map((e) => e.where),
      ['history', 'config'],
      'ENV shows in docker history and docker inspect',
    )
    assert.equal(searchInImage(s, 'sms_api').length, 2)
    assert.equal(labGoals(s).foundKey, true)
  })

  test('multi-stage leaves a build-stage secret behind', () => {
    const s = createBuildLab({ preset: 'visefazna' })
    setNpmTokenVia(s, 'copy-rm')
    buildNow(s)
    assert.equal(findSecrets(s.image!).length, 0)
    assert.deepEqual(searchInImage(s, 'NPM'), [])
    // the build stage's ARG history stays behind too (the final image has only the runtime stage's history)
    const a = createBuildLab({ preset: 'visefazna' })
    setNpmTokenVia(a, 'arg')
    buildNow(a)
    assert.equal(findSecrets(a.image!).length, 0)
    assert.ok(a.image!.history.every((h) => !h.createdBy.includes('NPM_TOKEN')))
  })

  test('ARG scope: a global ARG must be re-declared in the stage; --build-arg beats the defaults', () => {
    const cat = PROJECTS['klopa-web'].catalog
    const ctx: BuildContext = { files: PROJECTS['klopa-web'].files.map((f) => ({ ...f })), dockerignore: true, secrets: {}, args: {} }
    const shell = (text: string): Instruction => ({ id: text, kind: 'RUN', text, action: 'shell' })
    const globalArg: Instruction = { id: 'g', kind: 'ARG', text: 'ARG MODE=prod', name: 'MODE', value: 'prod' }
    const stageArg: Instruction = { id: 's', kind: 'ARG', text: 'ARG MODE', name: 'MODE' }
    const go = (list: Instruction[], args: Record<string, string> = {}) =>
      planBuild(list, { context: { ...ctx, args }, cache: createCache(), localBases: new Set(), buildId: 1, now: 0 }).image!.history.map((h) => h.createdBy)
    assert.deepEqual(go([globalArg, { ...cat['from-build'] }, shell('RUN echo a')]).at(-1), 'RUN echo a', 'not in scope without re-declaring')
    assert.deepEqual(go([globalArg, { ...cat['from-build'] }, stageArg, shell('RUN echo a')]).at(-1), 'RUN |1 MODE=prod /bin/sh -c echo a')
    assert.deepEqual(go([globalArg, { ...cat['from-build'] }, stageArg, shell('RUN echo a')], { MODE: 'dev' }).at(-1), 'RUN |1 MODE=dev /bin/sh -c echo a')
  })
})

// =============================================================================================
describe('L08 lab actions, animation and goals', () => {
  test('animation: cache writes land when a layer finishes; stopwatch reaches exactly the plan total', () => {
    const s = createBuildLab({ preset: 'dobar-redoslijed' })
    const plan = startBuild(s)!
    assert.equal(startBuild(s), null, 'one build at a time')
    const npmKey = plan.steps.find((x) => x.id === 'npm-ci')!.cacheKey
    for (let i = 0; i < 60 * 20; i++) stepBuildLab(s, 1 / 60) // 20 s: npm ci (9–49 s) is still running
    assert.equal(s.cache.entries.has(npmKey), false)
    const v = buildView(s)!
    assert.equal(v.steps.find((x) => x.id === 'npm-ci')!.live, 'running')
    assert.ok(v.steps.find((x) => x.id === 'npm-ci')!.progress > 0.2)
    assert.equal(v.steps.find((x) => x.id === 'copy-all')!.live, 'waiting')
    for (let i = 0; i < 60 * 40; i++) stepBuildLab(s, 1 / 60)
    assert.equal(s.cache.entries.has(npmKey), true)
    assert.equal(s.build!.status, 'done')
    assert.equal(s.build!.elapsed, 53)
    assert.equal(buildView(s)!.steps.every((x) => x.live === 'done' || x.live === 'cached'), true)
    assert.equal(finishBuild(s), null)
  })

  test('same build animated with 1/60 s steps or one big step ends in the same state', () => {
    const a = createBuildLab({ preset: 'visefazna' })
    const b = createBuildLab({ preset: 'visefazna' })
    startBuild(a)
    startBuild(b)
    for (let i = 0; i < 60 * 60; i++) stepBuildLab(a, 1 / 60)
    stepBuildLab(b, 60)
    assert.equal(a.t, b.t)
    assert.equal(a.image!.digest, b.image!.digest)
    assert.deepEqual(a.builds, b.builds)
  })

  test('„< 5 s” task needs a code-only change (not a reorder)', () => {
    const s = createBuildLab({ preset: 'laboratorij' })
    buildNow(s)
    changeCode(s)
    assert.equal(buildNow(s)!.seconds, 44)
    assert.equal(labGoals(s).rebuildUnder5s, false)
    moveCard(s, 'copy-all', 4) // after npm ci
    changeCode(s)
    const reorder = buildNow(s)!
    assert.equal(reorder.codeOnly, false)
    assert.equal(labGoals(s).rebuildUnder5s, false)
    changeCode(s)
    const fast = buildNow(s)!
    assert.equal(fast.codeOnly, true)
    assert.equal(fast.seconds, 4)
    assert.equal(labGoals(s).rebuildUnder5s, true)
  })

  test('flagship path: multi-stage toggle, USER card, .dockerignore → all four tasks', () => {
    const s = createBuildLab({ preset: 'laboratorij' })
    assert.equal(s.cards.length, 7)
    assert.ok(s.tray.some((c) => c.id === 'user-node'))
    buildNow(s)
    assert.equal(labGoals(s).nonRoot, false)
    addCard(s, 'user-node', 6)
    buildNow(s)
    assert.equal(labGoals(s).nonRoot, true)
    setMultiStage(s, true)
    assert.deepEqual(
      s.cards.map((c) => c.id),
      ['from-build', 'workdir', 'copy-pkg', 'copy-all', 'npm-ci', 'npm-build', 'from-runtime', 'copy-dist', 'user-nginx', 'cmd-nginx'],
    )
    setMultiStage(s, true) // no-op
    setDockerignore(s, true)
    moveCard(s, 'copy-all', 4)
    buildNow(s)
    changeCode(s)
    buildNow(s)
    searchInImage(createBuildLab(), 'x')
    const g = labGoals(s)
    assert.equal(g.rebuildUnder5s, true)
    assert.equal(g.imageUnder200MB, true)
    assert.equal(g.nonRoot, true)
    setMultiStage(s, false)
    assert.ok(s.cards.some((c) => c.id === 'user-node') && !s.cards.some((c) => c.id === 'from-runtime'))
    setBaseVariant(s, 'full')
    assert.equal(s.cards[0].text, 'FROM node:24 AS build')
    setBaseVariant(s, 'slim')
    assert.equal(s.cards[0].text, 'FROM node:24-slim AS build')
  })

  test('card editing: bounds, unknown ids, order, tray', () => {
    const s = createBuildLab({ preset: 'dobar-redoslijed' })
    assert.equal(moveCard(s, 'nope', 0), false)
    assert.equal(moveCard(s, 'workdir', 1), false, 'same place')
    assert.equal(moveCard(s, 'workdir', 999), true)
    assert.equal(s.cards[s.cards.length - 1].id, 'workdir')
    setCardOrder(s, ['workdir', 'ghost'])
    assert.equal(s.cards[0].id, 'workdir')
    assert.equal(s.cards.length, 8)
    assert.equal(removeCard(s, 'ghost'), false)
    assert.equal(removeCard(s, 'workdir'), true)
    assert.equal(addCard(s, 'workdir', -5), true)
    assert.equal(s.cards[0].id, 'workdir')
    assert.equal(addCard(s, 'workdir'), false, 'already in the Dockerfile')
    assert.equal(addCard(s, 'ghost'), false)
  })

  test('zero servers, zero bandwidth: 0 MB/s means 0,1 MB/s (slow, never instant), no NaN anywhere', () => {
    const s = createBuildLab({ preset: 'visefazna', servers: [], transferMBps: 0, timings: { pullMBps: 0 } })
    assert.deepEqual(dockerfileLines(s), LAB_PRESETS.visefazna.cards.map((id) => PROJECTS['klopa-web'].catalog[id].text))
    assert.equal(s.transferMBps, MIN_MBPS)
    assert.equal(s.timings.pullMBps, MIN_MBPS)
    const r = buildNow(s)!
    assert.equal(r.seconds, 800 + 1 + 40 + 1 + 3 + 0.2, 'node:24-slim (80 MB) at 0,1 MB/s takes 800 s; nginx pulls in parallel')
    const p = pushImage(s)!
    close(p.seconds, 0.5 + s.image!.compressedMB / MIN_MBPS)
    close(labMetrics(s).coldPullSeconds!, 0.5 + s.image!.compressedMB / MIN_MBPS)
    assert.ok(labMetrics(s).coldPullSeconds! > 200)
    assert.equal(basePullSeconds(BASE_IMAGES['node:24-slim'], 0), 800)
    assert.equal(basePullSeconds(BASE_IMAGES['node:24-slim'], -3), 800)
    assert.equal(createBuildLab({ transferMBps: -1 }).transferMBps, 10, 'negative → default')
    assert.equal(pullOnServer(s, 'a'), null)
    assert.deepEqual(serverReport(s), { servers: [], sameDigest: true })
    for (const v of Object.values(labMetrics(s))) if (typeof v === 'number') assert.ok(Number.isFinite(v))
  })

  test('NaN / negative / infinite timings fall back to the defaults (the build still ends)', () => {
    const s = createBuildLab({
      preset: 'los-redoslijed',
      timings: { npmCiSeconds: Number.NaN, copySeconds: -5, npmBuildSeconds: Number.POSITIVE_INFINITY },
      transferMBps: Number.NaN,
    })
    assert.deepEqual(s.timings, resolveTimings())
    assert.equal(s.transferMBps, 10)
    const p = startBuild(s)!
    assert.equal(p.totalSeconds, 8 + 1 + 40 + 3, 'pull + COPY . . + npm ci + build, all at their defaults')
    for (let i = 0; i < 60 * 60; i++) stepBuildLab(s, 1 / 60)
    assert.equal(s.build!.status, 'done')
    assert.equal(resolveTimings({ npmCiSeconds: 0 }).npmCiSeconds, 0, '0 is a valid override')
    // a NaN start time cannot break the deterministic timestamps
    const plan = planBuild(LAB_PRESETS.visefazna.cards.map((id) => ({ ...PROJECTS['klopa-web'].catalog[id] })), {
      context: { files: PROJECTS['klopa-web'].files.map((f) => ({ ...f })), dockerignore: true, secrets: {}, args: {} },
      cache: createCache(),
      localBases: new Set(),
      buildId: 1,
      now: Number.NaN,
    })
    assert.equal(plan.ok, true)
    assert.match(JSON.parse(plan.image!.configJson).created as string, /^2026-10-01T/)
  })

  test('the builder stores base images by digest: a republished tag (same ref, new digest) is pulled again and misses the cache', () => {
    const cards = LAB_PRESETS['dobar-redoslijed'].cards.map((id) => ({ ...PROJECTS['klopa-web'].catalog[id] }))
    const context: BuildContext = { files: PROJECTS['klopa-web'].files.map((f) => ({ ...f })), dockerignore: true, secrets: {}, args: {} }
    const cache = createCache()
    const local = new Set<string>()
    const first = planBuild(cards, { context, cache, localBases: local, buildId: 1, now: 0 })
    applyPlanWrites(first, cache, local)
    const same = planBuild(cards, { context, cache, localBases: local, buildId: 2, now: 100 })
    assert.equal(same.totalSeconds, 0)
    assert.equal(same.image!.digest, first.image!.digest)
    const slim = BASE_IMAGES['node:24-slim']
    const patched = patchedBase(slim, 1)
    assert.equal(patched.ref, slim.ref)
    assert.notEqual(patched.digest, slim.digest)
    assert.equal(patchedBase(slim, 0), slim)
    const drift = planBuild(cards, { context, cache, localBases: local, buildId: 3, now: 200, bases: { ...BASE_IMAGES, 'node:24-slim': patched } })
    assert.equal(drift.steps[0].reason, 'base-pull')
    assert.equal(drift.steps[0].duration, 8)
    assert.equal(drift.cachedCount, 0, 'a new base digest invalidates every layer above it')
    assert.equal(drift.totalSeconds, 53)
    assert.notEqual(drift.image!.digest, first.image!.digest)
  })

  test('actions before any image are safe no-ops', () => {
    const s = createBuildLab()
    assert.equal(pushImage(s), null)
    assert.equal(moveTag(s), false)
    assert.equal(inspectLayer(s, 0), null)
    assert.deepEqual(searchInImage(s, 'SMS'), [])
    assert.equal(runContainer(s), null)
    assert.equal(buildView(s), null)
    assert.equal(pushView(s), null)
    assert.equal(finishPush(s), null)
    assert.equal(pullOnServer(s, 'zz'), null)
    assert.equal(pullOnServer(s, 'a')!.digest, null)
    assert.deepEqual(labMetrics(s).exposures, [])
    assert.deepEqual(labGoals(s), { rebuildUnder5s: false, imageUnder200MB: false, foundKey: false, nonRoot: false })
    assert.equal(removeContainer(s, 'c9'), 0)
    assert.equal(writeInContainer(s, 'c9'), false)
  })

  test('push uploads only missing layers („Layer already exists”), latest moves, two servers run different code', () => {
    const s = createBuildLab({ preset: 'visefazna' })
    buildNow(s)
    const p1 = pushImage(s)!
    assert.ok(p1.tags.includes('latest'))
    assert.equal(p1.layers.every((l) => !l.exists), true)
    finishPush(s)
    const first = s.image!.digest
    assert.equal(s.registry.tags.get('klopa-web:latest'), first)
    pullOnServer(s, 'a')
    changeCode(s)
    buildNow(s)
    const p2 = pushImage(s)!
    assert.equal(p2.tags.includes('latest'), false, 'push alone does not move latest')
    assert.equal(p2.layers.filter((l) => !l.exists).length, 1, 'only the new dist layer')
    close(p2.uploadedMB, 1.05)
    for (let i = 0; i < 600; i++) stepBuildLab(s, 1 / 60)
    assert.equal(s.pushes[1].existed, p2.layers.length - 1)
    assert.ok(s.pushes[1].log.some((l) => l.endsWith('Layer already exists')))
    assert.equal(s.pushes[1].log.at(-1), `${p2.tags[0]}: digest: ${s.image!.digest} size: ${new TextEncoder().encode(s.image!.manifestJson).length}`)
    assert.equal(pushView(s)!.layers.every((l) => l.progress === 1), true)
    assert.equal(moveTag(s), true)
    pullOnServer(s, 'b')
    const rep = serverReport(s)
    assert.equal(rep.sameDigest, false)
    assert.equal(rep.servers[0].digest, first)
    assert.equal(rep.servers[1].digest, s.image!.digest)
    // tag@digest: the digest wins
    pullOnServer(s, 'b', `latest@${first}`)
    assert.equal(serverReport(s).sameDigest, true)
    // the second pull on server a needs only the changed layer
    const plan = planPull(s.registry, s.servers[0], `registry.klopa.example/klopa-web@${s.image!.digest}`)
    assert.equal(plan.layers.filter((l) => !l.cached).length, 1)
  })

  test('image size → pull time: Iva ≈ 72 s onto an empty server, multi-stage ≈ 2,6 s', () => {
    const iva = createBuildLab({ preset: 'ivin-prvi' })
    buildNow(iva)
    const m = labMetrics(iva)
    assert.ok(m.imageCompressedMB! > 700 && m.imageCompressedMB! < 730, `${m.imageCompressedMB}`)
    assert.ok(Math.abs(m.coldPullSeconds! - 72) < 1.5, `${m.coldPullSeconds}`)
    const multi = createBuildLab({ preset: 'visefazna' })
    buildNow(multi)
    close(labMetrics(multi).coldPullSeconds!, 0.5 + 21.05 / 10)
  })

  test('one image, many containers: each has its own writable layer (copy-up on edit, whiteout on delete)', () => {
    const s = createBuildLab({ preset: 'api-dobar' })
    buildNow(s)
    const a = runContainer(s)!
    const b = runContainer(s)!
    assert.equal(a.image, b.image)
    assert.equal(writeInContainer(s, a.id, '/app/klopa/'), true)
    assert.equal(a.writable[0].copyUp, true, 'editing an image file copies it up')
    assert.equal(deleteInContainer(s, a.id, '/app/manage.py'), true)
    assert.equal(a.writable.find((w) => w.path === '/app/manage.py')!.whiteout, true)
    assert.equal(deleteInContainer(s, a.id, '/nema'), false)
    writeInContainer(s, a.id, '/tmp/x.log')
    assert.equal(deleteInContainer(s, a.id, '/tmp/x.log'), true)
    assert.equal(a.writable.some((w) => w.path === '/tmp/x.log'), false, 'a file only in the writable layer is simply gone')
    assert.equal(b.writable.length, 0, 'the other container is untouched')
    assert.equal(deleteInContainer(s, 'c99', '/app/manage.py'), false)
    assert.ok(mergedView(s.image!).has('manage.py'), 'the image never changes')
  })

  test('immutable tags: moving latest is rejected', () => {
    const s = createBuildLab({ preset: 'visefazna', immutableTags: true })
    buildNow(s)
    pushImage(s)
    finishPush(s)
    changeCode(s)
    buildNow(s)
    pushImage(s, { tags: ['latest'] })
    finishPush(s)
    assert.equal(s.pushes[1].rejected.length, 1)
    assert.equal(moveTag(s), false)
    assert.notEqual(s.registry.tags.get('klopa-web:latest'), s.image!.digest)
  })

  test('„Vrata u zidu”: -p and 0.0.0.0 → 200; gunicorn on 127.0.0.1 → reset; no -p (EXPOSE only) → refused; writable layer is lost', () => {
    const s = createBuildLab({ preset: 'api-dobar' })
    buildNow(s)
    assert.deepEqual(s.image!.config.exposed, [8000])
    const noPublish = runContainer(s)!
    assert.equal(curlFromHost(s, 8080).outcome, 'refused')
    removeContainer(s, noPublish.id)
    const c = runContainer(s, { publish: [[8080, 8000]] })!
    assert.equal(curlFromHost(s, 8080).outcome, 'ok')
    assert.equal(runContainer(s, { publish: [[8080, 8000]] }), null, 'port already allocated')
    assert.equal(writeInContainer(s, c.id), true)
    assert.equal(removeContainer(s, c.id), 1)
    const fresh = runContainer(s, { publish: [[8080, 80]] })!
    assert.equal(fresh.writable.length, 0, 'a new container starts from the image')
    assert.equal(curlFromHost(s, 8080).outcome, 'reset', 'nothing listens on container port 80')
    removeContainer(s, fresh.id)
    const local = createBuildLab({ preset: 'api-los' })
    buildNow(local)
    runContainer(local, { publish: [[8080, 8000]] })
    const r = curlFromHost(local, 8080)
    assert.equal(r.outcome, 'reset')
    assert.match(r.text, /reset by peer/)
  })
})

// =============================================================================================
describe('registry, references and pull policy', () => {
  test('parseImageRef / formatImageRef', () => {
    assert.deepEqual(parseImageRef('node:24-slim'), { registry: 'docker.io', repository: 'library/node', tag: '24-slim', digest: null })
    assert.deepEqual(parseImageRef('registry.klopa.example/klopa-api:2.0.1@sha256:abc'), {
      registry: 'registry.klopa.example',
      repository: 'klopa-api',
      tag: '2.0.1',
      digest: 'sha256:abc',
    })
    assert.deepEqual(parseImageRef('localhost:5000/app'), { registry: 'localhost:5000', repository: 'app', tag: null, digest: null })
    assert.equal(formatImageRef(parseImageRef('node:24')), 'node:24')
    assert.equal(formatImageRef(parseImageRef('registry.klopa.example/klopa-api:2.0.1')), 'registry.klopa.example/klopa-api:2.0.1')
  })

  test('default imagePullPolicy (SetDefaults_Container): Always iff the tag is latest (also latest@digest) or there is neither tag nor digest', () => {
    assert.equal(defaultPullPolicy('registry.klopa.example/klopa-api:latest'), 'Always')
    assert.equal(defaultPullPolicy('registry.klopa.example/klopa-api'), 'Always')
    assert.equal(defaultPullPolicy('registry.klopa.example/klopa-api:2.0.1'), 'IfNotPresent')
    assert.equal(defaultPullPolicy('registry.klopa.example/klopa-api@sha256:abc'), 'IfNotPresent')
    assert.equal(defaultPullPolicy('registry.klopa.example/klopa-api:latest@sha256:abc'), 'Always', 'ParseImageName keeps the tag „latest” when a digest is present too')
    assert.equal(defaultPullPolicy('registry.klopa.example/klopa-api:2.0.1@sha256:abc'), 'IfNotPresent')
  })

  test('IfNotPresent keeps a stale image under a moved tag; Always resolves the new digest; Never fails without a local copy', () => {
    const s = createBuildLab({ preset: 'visefazna' })
    buildNow(s)
    pushImage(s, { tags: ['1.0'] })
    finishPush(s)
    const old = s.image!.digest
    const ref = 'registry.klopa.example/klopa-web:1.0'
    const node = createHost('n1', 'čvor 1')
    applyPull(node, planPull(s.registry, node, ref))
    changeCode(s)
    buildNow(s)
    pushImage(s, { tags: ['2.0'] })
    finishPush(s)
    assert.equal(setTag(s.registry, 'klopa-web', '1.0', s.image!.digest, s.t).ok, true)
    const stale = planPull(s.registry, node, ref, 'IfNotPresent')
    assert.equal(stale.usedLocal, true)
    assert.equal(stale.digest, old)
    const fresh = planPull(s.registry, node, ref, 'Always')
    assert.equal(fresh.digest, s.image!.digest)
    assert.equal(fresh.layers.filter((l) => !l.cached).length, 1)
    assert.ok(fresh.downloadMB < 2)
    assert.match(planPull(s.registry, createHost('n2', 'čvor 2'), ref, 'Never').error!, /ErrImageNeverPull/)
    assert.equal(setTag(s.registry, 'klopa-web', 'x', 'sha256:nope', 0).ok, false)
  })

  test('resolveRef: digest wins over tag; unknown → error, wrong registry → error', () => {
    const reg = createRegistry()
    assert.match(resolveRef(reg, 'registry.klopa.example/a:latest').error!, /manifest unknown/)
    assert.match(resolveRef(reg, 'docker.io/a:latest').error!, /nije u registru/)
    assert.match(resolveRef(reg, 'registry.klopa.example/a@sha256:00').error!, /manifest unknown/)
    assert.deepEqual(layerDiff(reg, null, 'sha256:none'), { shared: [], changed: [], downloadMB: 0, totalMB: 0, layers: [] })
  })
})

// =============================================================================================
describe('L21 pipeline – validated lead times', () => {
  const lead = (cfg: { parallelJobs: boolean; cache: boolean; skipTests: boolean }) => {
    const s = createPipeline({ ...cfg, gate: 'deployment' })
    const r = commit(s, 'ok')
    runPipelineUntilIdle(s)
    assert.equal(r.status, 'in-prod')
    return r.leadTimeSec
  }

  test('commit → production: 14:50 sequential, 14:20 parallel, 9:30 cache, 9:00 parallel+cache', () => {
    assert.equal(lead({ parallelJobs: false, cache: false, skipTests: false }), 890)
    assert.equal(lead({ parallelJobs: true, cache: false, skipTests: false }), 860)
    assert.equal(lead({ parallelJobs: false, cache: true, skipTests: false }), 570)
    assert.equal(lead({ parallelJobs: true, cache: true, skipTests: false }), 540)
    assert.equal(lead({ parallelJobs: false, cache: false, skipTests: true }), 470)
    assert.equal(lead({ parallelJobs: true, cache: true, skipTests: true }), 270)
    for (const parallelJobs of [false, true]) for (const cache of [false, true]) for (const skipTests of [false, true]) {
      assert.equal(lead({ parallelJobs, cache, skipTests }), idealLeadTime({ parallelJobs, cache, skipTests }))
    }
    assert.equal(idealLeadTime({ parallelJobs: true, cache: true, skipTests: false, gate: 'ci' }), 60 + 40 + 60 + 20)
  })

  test('„< 10 min uz sve provjere” needs the cache; parallel jobs alone are not enough', () => {
    const goal = (cfg: object) => {
      const s = createPipeline({ ...cfg, gate: 'deployment' })
      commit(s, 'ok')
      runPipelineUntilIdle(s)
      return pipelineGoals(s).leadTimeUnder10MinAllChecks
    }
    assert.equal(goal({ parallelJobs: true }), false)
    assert.equal(goal({ cache: true }), true)
    assert.equal(goal({ cache: true, parallelJobs: true, skipTests: true }), false, 'skipping tests does not count')
  })

  test('job timeline with parallel jobs and cache (L24 „Put jednog commita”)', () => {
    const s = createPipeline(PIPELINE_PRESETS['dan-izdanja'])
    const r = commit(s, 'ok', { version: '2.0.2' })
    runPipelineUntilIdle(s)
    const tl = Object.fromEntries(commitTimeline(r).map((e) => [e.station, [e.start, e.end]]))
    assert.deepEqual(tl.lint, [0, 30])
    assert.deepEqual(tl.test, [0, 60])
    assert.deepEqual(tl.build, [60, 100])
    assert.deepEqual(tl.scan, [100, 160])
    assert.deepEqual(tl.push, [160, 180])
    assert.deepEqual(tl.staging, [180, 240])
    assert.deepEqual(tl.e2e, [240, 480])
    assert.deepEqual(tl.gate, [480, 480])
    assert.deepEqual(tl.prod, [480, 540])
    assert.equal(r.jobs.build.cacheHit, true)
    assert.deepEqual(r.tags, [r.commit.short, '2.0.2'])
    assert.equal(r.jobs.staging.note, 'bot commit u config repozitorij')
    // the node pulls only the changed code layer (deps + base layers are shared)
    const diff = lastPromotionDiff(s)!
    assert.equal(diff.changed, 1)
    assert.equal(diff.shared, 6, '3 base layers, WORKDIR, requirements, pip install')
    close(diff.downloadMB, 0.90855)
    close(diff.totalMB, 70.41175)
    assert.deepEqual(
      diff.layers.map((l) => l.changed),
      [false, false, false, false, false, false, true],
    )
    assert.equal(diff.layers.at(-1)!.label, 'COPY . .')
  })

  test('without cache the node also downloads the rebuilt dependency layer', () => {
    const s = createPipeline({ gate: 'deployment' })
    commit(s, 'ok')
    runPipelineUntilIdle(s)
    const diff = lastPromotionDiff(s)!
    assert.equal(diff.changed, 2)
    close(diff.downloadMB, 25.40855)
  })

  test('changing dependencies makes tests and the build cold even with the cache on', () => {
    const s = createPipeline({ cache: true, parallelJobs: true, gate: 'deployment' })
    const r = commit(s, 'ok', { changesDeps: true })
    runPipelineUntilIdle(s)
    assert.equal(r.jobs.test.duration, 180)
    assert.equal(r.jobs.build.duration, 240)
    const r2 = commit(s, 'ok')
    runPipelineUntilIdle(s)
    assert.equal(r2.jobs.test.duration, 60)
    assert.equal(r2.jobs.build.duration, 40)
  })
})

// =============================================================================================
describe('L21 pipeline – failures stop the line', () => {
  test('failing test: line stops at tests, nothing pushed or deployed', () => {
    const s = createPipeline({ gate: 'deployment' })
    const before = s.prod.digest
    const manifests = s.registry.manifests.size
    const r = commit(s, 'failing-test')
    runPipelineUntilIdle(s)
    assert.equal(r.status, 'failed')
    assert.equal(r.failedAt, 'test')
    assert.equal(r.jobs.build.status, 'stopped')
    assert.equal(r.jobs.prod.status, 'stopped')
    assert.equal(s.registry.manifests.size, manifests)
    assert.equal(s.prod.digest, before)
    assert.equal(s.stats.blockedByTests, 1)
    assert.equal(runPosition(r, s.t).station, 'test')
  })

  test('vulnerable base: cold build (base changed) then the scan blocks it', () => {
    const s = createPipeline({ cache: true, gate: 'deployment' })
    const r = commit(s, 'vulnerable-base')
    runPipelineUntilIdle(s)
    assert.equal(r.jobs.build.cacheHit, false)
    assert.equal(r.jobs.build.duration, 240)
    assert.equal(r.failedAt, 'scan')
    assert.match(r.failReason!, /ranjivost/)
    assert.equal(r.jobs.push.status, 'stopped')
  })

  test('secret in code: the scan fails before push even when tests are skipped', () => {
    const s = createPipeline({ skipTests: true, gate: 'deployment' })
    const r = commit(s, 'secret')
    runPipelineUntilIdle(s)
    assert.equal(r.failedAt, 'scan')
    assert.match(r.failReason!, /SMS_API_KEY/)
    assert.equal(s.registry.manifests.has(r.digest!), false)
  })

  test('skip tests: a buggy commit reaches production → incident → rollback after 5 + 1 min; DORA reacts', () => {
    const s = createPipeline({ skipTests: true, parallelJobs: true, cache: true, gate: 'deployment' })
    const good = s.prod.digest
    const r = commit(s, 'failing-test')
    runPipelineUntilIdle(s)
    assert.equal(r.status, 'in-prod')
    assert.equal(s.stats.badInProd, 1)
    assert.equal(s.stats.rollbacks, 1)
    assert.equal(s.prod.digest, good)
    const d = dora(s)
    assert.equal(d.deployments, 1)
    assert.equal(d.changeFailureRate, 1)
    assert.equal(d.recoveryMedianSec, 300 + 60)
    assert.equal(d.openIncident, false)
    assert.equal(s.incidents[0].how, 'rollback')
  })

  test('fix forward: an unrelated commit still ships the bug; only a fix commit resolves the incident (labelled before detection)', () => {
    const s = createPipeline({ skipTests: true, parallelJobs: true, cache: true, gate: 'deployment', incidentDetectSec: 3600 })
    commit(s, 'failing-test')
    runPipelineUntil(s, 300)
    const unrelated = commit(s, 'ok')
    runPipelineUntil(s, 600)
    assert.equal(unrelated.commit.buggy, true, 'main is cumulative: the next commit contains the bug')
    assert.equal(s.stats.badInProd, 2)
    assert.equal(s.incidents[0].resolvedAt, null, 'an unrelated commit does not „fix” production')
    const fix = commit(s, 'fix')
    assert.equal(fix.commit.message, 'Ispravak: Popust za Ćevap-petak')
    assert.equal(fix.commit.buggy, false)
    runPipelineUntilIdle(s)
    assert.equal(s.incidents[0].how, 'fix-forward')
    assert.equal(s.incidents[0].resolvedBeforeDetection, true)
    assert.match(s.events.find((e) => e.kind === 'recovered')!.text, /prije nego što je incident otkriven/)
    assert.equal(s.stats.rollbacks, 0)
    assert.equal(dora(s).recoveryMedianSec, 600, 'bad deploy at 270 s, fix in production at 870 s')
  })

  test('autoRollback off: the incident stays open until a fix', () => {
    const s = createPipeline({ skipTests: true, gate: 'deployment', autoRollback: false })
    commit(s, 'failing-test')
    runPipelineUntilIdle(s)
    assert.equal(dora(s).openIncident, true)
    assert.equal(s.stats.rollbacks, 0)
  })

  test('flaky test: ≈30 % of attempts fail, retries hide most of them, trust drops (seeded, reproducible)', () => {
    // one flaky test stays in the suite: every later commit runs it (nobody fixes it in this test)
    const mk = () => {
      const s = createPipeline({ parallelJobs: true, cache: true, gate: 'ci', seed: 3 })
      const runs = [commit(s, 'flaky')]
      for (let i = 0; i < 299; i++) runs.push(commit(s, 'ok'))
      runPipelineUntilIdle(s)
      return { s, runs }
    }
    const { s, runs } = mk()
    assert.ok(runs.every((r) => r.commit.flaky), 'the flaky test is in every later tree')
    let attempts = 0
    for (const r of runs) attempts += r.jobs.test.attempts
    const failRatio = s.stats.flakyFailedAttempts / attempts
    assert.ok(Math.abs(failRatio - 0.3) < 0.04, `fail ratio ${failRatio}`)
    const failedRuns = runs.filter((r) => r.status === 'failed').length
    assert.ok(failedRuns / runs.length < 0.07, `runs failed after 3 attempts: ${failedRuns}`) // 0.3³ = 2.7 %
    assert.equal(s.trust, 0)
    assert.deepEqual(mk().s.stats, s.stats)
  })

  test('a retried flaky test costs time: each attempt is a full test run', () => {
    const s = createPipeline({ cache: true, parallelJobs: true, gate: 'deployment', flakyFailProb: 1, flakyRetries: 2 })
    const r = commit(s, 'flaky')
    runPipelineUntilIdle(s)
    assert.equal(r.jobs.test.attempts, 3)
    assert.equal(r.status, 'failed')
    assert.equal(r.jobs.test.end, 180)
    assert.ok(s.events.some((e) => e.kind === 'flaky'))
    const ok = createPipeline({ flakyFailProb: 0, gate: 'deployment' })
    const r2 = commit(ok, 'flaky')
    runPipelineUntilIdle(ok)
    assert.equal(r2.status, 'in-prod')
  })
})

// =============================================================================================
describe('L21 gate, promotion and rebuild', () => {
  test('gate „ci” stops after push; „delivery” waits for a click; „deployment” is automatic', () => {
    const ci = createPipeline({ gate: 'ci', cache: true, parallelJobs: true })
    const r = commit(ci, 'ok')
    runPipelineUntilIdle(ci)
    assert.equal(r.status, 'in-registry')
    assert.equal(ci.registry.manifests.has(r.digest!), true)
    assert.equal(ci.stats.deploys, 0)
    assert.equal(dora(ci).deployments, 0)

    const del = createPipeline({ gate: 'delivery', cache: true, parallelJobs: true })
    const r2 = commit(del, 'ok')
    runPipelineUntilIdle(del)
    assert.equal(r2.status, 'waiting-approval')
    assert.equal(r2.jobs.prod.status, 'pending')
    runPipelineUntil(del, 600)
    assert.equal(approve(del), true)
    assert.equal(approve(del), false, 'nothing else waiting')
    runPipelineUntilIdle(del)
    assert.equal(r2.status, 'in-prod')
    assert.equal(r2.approvedBy, 'human')
    assert.equal(r2.leadTimeSec, 660, 'lead time includes the wait at the gate')
    assert.equal(pipelineGoals(del).deliveryThenDeployment, false)
    setGate(del, 'deployment')
    commit(del, 'ok')
    runPipelineUntilIdle(del)
    assert.equal(pipelineGoals(del).deliveryThenDeployment, true)
  })

  test('switching a waiting gate to „deployment” lets it through', () => {
    const s = createPipeline({ gate: 'delivery', cache: true, parallelJobs: true })
    const r = commit(s, 'ok')
    runPipelineUntilIdle(s)
    setGate(s, 'deployment')
    runPipelineUntilIdle(s)
    assert.equal(r.status, 'in-prod')
    assert.equal(r.approvedBy, 'auto')
  })

  test('build once, promote: built = staging = production digest; digest = sha256(manifest)', () => {
    const s = createPipeline({ gate: 'deployment' })
    const r = commit(s, 'ok', { version: '2.0.1' })
    runPipelineUntilIdle(s)
    assert.ok(r.digest)
    assert.equal(r.stagingDigest, r.digest)
    assert.equal(r.prodDigest, r.digest)
    assert.equal(r.tested, true)
    assert.equal(r.image!.digest, `sha256:${createHash('sha256').update(r.image!.manifestJson).digest('hex')}`)
    assert.equal(s.registry.tags.get('klopa-api:2.0.1'), r.digest)
    assert.equal(s.registry.tags.get(`klopa-api:${r.commit.short}`), r.digest)
  })

  test('„Ponovno izgradi za produkciju”: production gets a different, untested digest', () => {
    const s = createPipeline({ gate: 'deployment', cache: true, parallelJobs: true })
    rebuildForProduction(s)
    const r = commit(s, 'ok')
    runPipelineUntilIdle(s)
    assert.equal(r.status, 'in-prod')
    assert.notEqual(r.prodDigest, r.digest)
    assert.equal(r.tested, false)
    assert.equal(s.stats.untestedDeploys, 1)
    assert.equal(r.leadTimeSec, 540 + 240 + 20)
    assert.equal(r.rebuildNote, 'nove vremenske oznake RUN slojeva', 'same base, same code – only the build timestamps differ')
    assert.ok(s.events.some((e) => e.kind === 'untested'))
    assert.equal(s.rebuildNextProd, false, 'only the next deployment')
  })

  test('upstream republishes the base tag: the next build is cold, nodes download the base again, a rebuild is another artefact', () => {
    const s = createPipeline({ cache: true, parallelJobs: true, gate: 'deployment' })
    const r1 = commit(s, 'ok')
    runPipelineUntilIdle(s)
    assert.equal(r1.jobs.build.duration, 40)
    const before = s.prod.digest
    const newBase = updateBaseImage(s)
    assert.notEqual(newBase, BASE_IMAGES['python:3.13-slim'].digest)
    assert.equal(s.events.at(-1)!.kind, 'base-updated')
    const r2 = commit(s, 'ok')
    runPipelineUntilIdle(s)
    assert.equal(r2.jobs.build.cacheHit, false, 'FROM resolves to a new digest → every layer above misses')
    assert.equal(r2.jobs.build.duration, 240)
    assert.equal(r2.leadTimeSec, 60 + 240 + 60 + 20 + 60 + 240 + 60)
    const diff = lastPromotionDiff(s)!
    assert.equal(diff.from, before)
    assert.equal(diff.changed, 5, '3 base layers + pip install + code; the WORKDIR and requirements COPY layers are content-addressed and shared')
    assert.equal(diff.shared, 2)
    close(diff.downloadMB, 45 + 24.5 + 0.90855)
    // the base moves again while a commit is in e2e, and production is rebuilt instead of promoted
    rebuildForProduction(s)
    const r3 = commit(s, 'ok')
    runPipelineUntil(s, s.t + 300)
    assert.equal(r3.jobs.e2e.status, 'running')
    updateBaseImage(s)
    runPipelineUntilIdle(s)
    assert.equal(r3.tested, false)
    assert.match(r3.rebuildNote!, /^nova bazna slika iza istog taga, nove vremenske oznake RUN slojeva$/)
    assert.match(s.events.find((e) => e.kind === 'untested')!.text, /nova bazna slika/)
  })

  test('immutable tags refuse the production rebuild under the same tag', () => {
    const s = createPipeline({ gate: 'deployment', immutableTags: true })
    const before = s.prod.digest
    rebuildForProduction(s)
    const r = commit(s, 'ok')
    runPipelineUntilIdle(s)
    assert.equal(r.status, 'failed')
    assert.equal(r.failedAt, 'prod')
    assert.match(r.failReason!, /nepromjenjiv/)
    assert.equal(s.prod.digest, before)
    assert.equal(s.locks.prod, null)
  })

  test('PR → merge: a failed PR cannot be merged and never reaches main; the merge build uses main\'s cache (GitHub scopes caches per ref)', () => {
    const s = createPipeline({ gate: 'deployment', cache: true, parallelJobs: true })
    const bad = commit(s, 'failing-test', { trigger: 'pr' })
    runPipelineUntilIdle(s)
    assert.equal(mergePullRequest(s, bad.id), null)
    assert.equal(mergePullRequest(s, 999), null)
    assert.deepEqual(s.main.defects, [], 'an unmerged PR does not change main')
    const pr = commit(s, 'ok', { trigger: 'pr' })
    runPipelineUntilIdle(s)
    assert.equal(pr.commit.buggy, false, 'the next PR branches from a clean main')
    const merged = mergePullRequest(s, pr.id, { version: '2.0.2' })!
    runPipelineUntilIdle(s)
    assert.equal(merged.status, 'in-prod')
    assert.match(merged.commit.message, /^Merge: /)
    assert.equal(merged.mergedFrom, pr.id)
    assert.equal(merged.commit.codeVersion, pr.commit.codeVersion, 'main had not moved: the merge commit has the PR tree')
    assert.equal(merged.jobs.build.cacheHit, true, 'pip install comes from main\'s own cache')
    assert.notEqual(merged.digest, pr.digest, 'the code layer is rebuilt on main (new history timestamps)')
    const cold = createPipeline({ gate: 'deployment' })
    const pr2 = commit(cold, 'ok', { trigger: 'pr' })
    runPipelineUntilIdle(cold)
    const m2 = mergePullRequest(cold, pr2.id)!
    runPipelineUntilIdle(cold)
    assert.notEqual(m2.digest, pr2.digest, 'a cold rebuild of the same tree gets new RUN layers')
    // a shared registry cache (type=registry) lets main reuse every PR layer → the same image manifest
    const reg = createPipeline({ gate: 'deployment', cache: true, parallelJobs: true, cacheBackend: 'registry' })
    const pr3 = commit(reg, 'ok', { trigger: 'pr' })
    runPipelineUntilIdle(reg)
    const m3 = mergePullRequest(reg, pr3.id)!
    runPipelineUntilIdle(reg)
    assert.equal(m3.digest, pr3.digest)
  })

  test('pull request: checks only, nothing pushed', () => {
    const s = createPipeline({ gate: 'deployment' })
    const manifests = s.registry.manifests.size
    const r = commit(s, 'ok', { trigger: 'pr' })
    runPipelineUntilIdle(s)
    assert.equal(r.status, 'checks-passed')
    assert.equal(r.jobs.push.status, 'skipped')
    assert.equal(s.registry.manifests.size, manifests)
    assert.equal(s.stats.deploys, 0)
  })
})

// =============================================================================================
describe('L21 credentials: long-lived key vs OIDC', () => {
  test('a leaked OIDC token works only for its remaining lifetime (sim 10 min); a static key until revoked', () => {
    assert.equal(OIDC_TOKEN_LIFETIME.simValue, 600)
    assert.equal(OIDC_TOKEN_LIFETIME.realValue, 3600)
    const o = createPipeline({ credential: 'oidc' })
    const leak = leakCredential(o)
    runPipelineUntil(o, 3600)
    assert.equal(leak.successes, 9, 'attempts at 1–9 min succeed')
    assert.equal(leak.attempts, 10, 'the 10-min attempt is denied, then the attacker stops')
    assert.equal(credentialStatus(o).attackerHasAccess, false)
    assert.equal(credentialStatus(o).leaks[0].exposureSec, 600)

    const k = createPipeline({ credential: 'static' })
    const kl = leakCredential(k)
    runPipelineUntil(k, 3600)
    assert.equal(kl.successes, 60)
    assert.equal(credentialStatus(k).attackerHasAccess, true)
    assert.equal(credentialStatus(k).leaks[0].remainingSec, null)
    assert.equal(revokeCredential(k), 1)
    assert.equal(revokeCredential(k), 0)
    runPipelineUntil(k, 3700)
    assert.equal(kl.successes, 60)
    assert.equal(credentialStatus(k).attackerHasAccess, false)
    assert.match(credentialStatus(k).scope, /cluster-admin/)
    assert.match(createPipeline({ credential: 'oidc', deployMode: 'gitops' }).config.deployMode, /gitops/)
  })

  test('credential and deploy mode change the scope of what leaks', () => {
    const s = createPipeline()
    assert.match(credentialStatus(s).scope, /^trajni ključ: cluster-admin/)
    setDeployMode(s, 'gitops')
    assert.match(credentialStatus(s).scope, /^trajni ključ: push u registar i pisanje u config repozitorij/)
    setCredential(s, 'oidc')
    assert.match(credentialStatus(s).scope, /^OIDC token posla: .*grana main/)
    assert.equal(credentialStatus(s).lifetimeLabel, OIDC_TOKEN_LIFETIME.label)
    assert.equal(credentialStatus(s).attackerHasAccess, false)
  })

  test('a token leaked mid-pipeline is usable only for the rest of its lifetime; tokens are not revoked when their job ends', () => {
    const s = createPipeline({ ...PIPELINE_PRESETS['brza-tvornica'], credential: 'oidc', gate: 'deployment' })
    commit(s, 'ok')
    runPipelineUntil(s, 170) // push runs 160–180 s and asked for its token at 160 s
    const leak = leakCredential(s)
    assert.equal(leak.issuedAt, 160)
    assert.equal(leak.validUntil, 760)
    assert.equal(credentialStatus(s).leaks[0].remainingSec, 590)
    assert.match(s.events.at(-1)!.text, /istječe sam za 9 min 50 s/)
    runPipelineUntil(s, 3600)
    assert.equal(leak.successes, 9, 'attempts at 230 … 710 s')
    assert.equal(leak.attempts, 10, 'the attempt at 770 s is denied')
    assert.equal(credentialStatus(s).leaks[0].exposureSec, 590)
    assert.deepEqual(
      credentialStatus(s).tokens.map((tk) => [tk.station, tk.issuedAt, tk.expiresAt, tk.valid]),
      [
        ['push', 160, 760, false],
        ['staging', 180, 780, false],
        ['prod', 480, 1080, false],
      ],
    )

    const after = createPipeline({ ...PIPELINE_PRESETS['brza-tvornica'], credential: 'oidc', gate: 'deployment' })
    commit(after, 'ok')
    runPipelineUntil(after, 600) // the run ended at 540 s, the production job's token (480 s) still lives
    const l2 = leakCredential(after)
    assert.equal(l2.validUntil, 1080)
    runPipelineUntil(after, 2000)
    const l3 = leakCredential(after) // every token has expired → the compromised job is one starting now
    assert.equal(l3.tokenId, null)
    assert.equal(l3.validUntil, 2600)
    // a static key ignores tokens entirely
    const k = createPipeline({ ...PIPELINE_PRESETS['brza-tvornica'], gate: 'deployment' })
    commit(k, 'ok')
    runPipelineUntilIdle(k)
    assert.deepEqual(credentialStatus(k).tokens, [])
    assert.equal(leakCredential(k).validUntil, null)
  })

  test('leaks and tokens stay bounded', () => {
    const s = createPipeline({ credential: 'oidc', gate: 'deployment', parallelJobs: true, cache: true })
    for (let i = 0; i < 40; i++) {
      commit(s, 'ok')
      leakCredential(s)
      runPipelineUntilIdle(s)
    }
    assert.ok(s.leaks.length <= 20)
    assert.ok(s.tokens.length <= 30)
    assert.equal(s.stats.tokensIssued, 120)
  })

  test('OIDC tokens are issued per job (push, staging, production)', () => {
    const s = createPipeline({ credential: 'oidc', gate: 'deployment' })
    commit(s, 'ok')
    runPipelineUntilIdle(s)
    assert.equal(s.stats.tokensIssued, 3)
  })
})

// =============================================================================================
describe('L21 commit stream, DORA and invariants', () => {
  test('20 commits with all checks: 0 bad commits in production; skipping tests ships the buggy ones', () => {
    const mk = (skipTests: boolean) => {
      const s = createPipeline({ parallelJobs: true, cache: true, gate: 'deployment', skipTests })
      const types = startCommitStream(s, { count: 20 })
      runPipelineUntilIdle(s)
      return { s, types }
    }
    const safe = mk(false)
    assert.equal(safe.types.length, 20)
    const st = streamStatus(safe.s)!
    assert.equal(st.done, true)
    assert.equal(st.finished, 20)
    assert.deepEqual(st.blocked, { tests: 2, scan: 1, secret: 2, flaky: 1, inherited: 2, superseded: 0, other: 0 })
    assert.equal(st.reverts, 8, 'the team reverts every commit that turned main red (the flaky test too, once it fails a run)')
    assert.equal(st.deployed, 18, '12 stream commits + 6 reverts')
    assert.equal(st.badInProd, 0)
    assert.equal(safe.s.stats.deploys, 18)
    assert.equal(safe.s.stats.badInProd, 0)
    assert.equal(pipelineGoals(safe.s).zeroBadOf20, true)
    const buggy = safe.types.filter((t) => t === 'failing-test').length
    assert.equal(safe.s.stats.blockedByTests, buggy)
    const d = dora(safe.s)
    assert.equal(d.changeFailureRate, 0)
    assert.equal(d.leadTimeMedianSec, 600, 'the flaky test stays in the suite: retries add a minute to many runs')
    assert.equal(safe.s.trust, 0.1, 'and trust in red builds erodes')
    const risky = mk(true)
    assert.equal(risky.s.stats.badInProd, 4, 'each bug ships, and so does the next commit until the revert lands')
    assert.equal(streamStatus(risky.s)!.badInProd, 4)
    assert.equal(pipelineGoals(risky.s).zeroBadOf20, false)
    assert.equal(risky.s.stats.deploys, 21)
    close(dora(risky.s).changeFailureRate!, 4 / 21)
    assert.equal(dora(risky.s).recoveryMedianSec, 420, 'detect 5 min + wait for the production lock 1 min + rollback 1 min')
    assert.equal(dora(risky.s).leadTimeMedianSec, 270)
    const series = doraSeries(risky.s, 5)
    assert.equal(series.leadTimeSec.length, 5)
    assert.equal(series.bad.length, 5)
    assert.deepEqual(doraSeries(risky.s).recoverySec, [420, 420])
    assert.deepEqual(doraSeries(risky.s, Number.NaN).leadTimeSec.length, 20)
    assert.deepEqual(doraSeries(risky.s, 0), { leadTimeSec: [], bad: [], recoverySec: [] })
    // seed 42 → the documented mix
    assert.deepEqual(
      Object.fromEntries(['ok', 'failing-test', 'vulnerable-base', 'flaky', 'secret'].map((k) => [k, safe.types.filter((t) => t === k).length])),
      { ok: 12, 'failing-test': 2, 'vulnerable-base': 1, flaky: 2, secret: 3 },
    )
  })

  test('commit stream edge cases: empty, NaN, custom mix replaces the default', () => {
    const s = createPipeline()
    assert.deepEqual(startCommitStream(s, { count: 0 }), [])
    assert.deepEqual(startCommitStream(s, { count: Number.NaN }), [])
    assert.deepEqual(startCommitStream(s, { count: -3 }), [])
    assert.equal(s.stats.commits, 0)
    const only = startCommitStream(s, { count: 10, intervalSec: Number.NaN, mix: { secret: 1 } })
    assert.deepEqual(only, Array(10).fill('secret'))
    assert.equal(s.stream!.intervalSec, 360)
    assert.equal(s.stats.commits, 1, 'the first commit arrives immediately')
    assert.deepEqual(startCommitStream(createPipeline(), { count: 3, mix: { ok: 0 } }), ['ok', 'ok', 'ok'])
  })

  test('DORA with no deployments: nulls, never NaN', () => {
    const s = createPipeline()
    const d = dora(s)
    assert.equal(d.deployments, 0)
    assert.equal(d.perDay, null)
    assert.equal(d.leadTimeMedianSec, null)
    assert.equal(d.changeFailureRate, null)
    assert.equal(d.recoveryMedianSec, null)
    runPipelineUntil(s, 100)
    const d2 = dora(s, 50)
    assert.equal(d2.perDay, 0)
    assert.equal(d2.windowSec, 50)
    for (const v of Object.values(d2)) if (typeof v === 'number') assert.ok(Number.isFinite(v))
  })

  test('environment locks: never two runs in staging/e2e or production at once; staging is FIFO', () => {
    const s = createPipeline({ parallelJobs: true, cache: true, gate: 'deployment', flakyFailProb: 0 })
    startCommitStream(s, { count: 12, intervalSec: 60, mix: { ok: 1, flaky: 1 } })
    let maxStaging = 0
    let maxProd = 0
    for (let i = 0; i < 4 * 3600 * 2; i++) {
      stepPipeline(s, 0.5)
      const inStaging = s.runs.filter((r) => r.jobs.staging.status === 'running' || r.jobs.e2e.status === 'running').length
      const inProd = s.runs.filter((r) => r.jobs.prod.status === 'running').length + (s.rollback ? 1 : 0)
      maxStaging = Math.max(maxStaging, inStaging)
      maxProd = Math.max(maxProd, inProd)
    }
    assert.equal(maxStaging, 1)
    assert.equal(maxProd, 1)
    const order = s.runs.filter((r) => r.jobs.staging.start !== null).sort((a, b) => a.jobs.staging.start! - b.jobs.staging.start!).map((r) => r.id)
    assert.deepEqual(order, [...order].sort((a, b) => a - b))
    assert.equal(s.stats.deploys, 12)
    // queueing at the shared staging environment makes later commits slower
    assert.ok(dora(s).leadTimeLastSec! > 540)
  })

  test('step chunking does not change results; same seed → same events', () => {
    const go = (dt: number) => {
      const s = createPipeline({ seed: 9, gate: 'deployment' })
      startCommitStream(s, { count: 6, intervalSec: 400 })
      const steps = Math.ceil(5 * 3600 / dt)
      for (let i = 0; i < steps; i++) stepPipeline(s, dt)
      return s
    }
    const a = go(1 / 60 * 30)
    const b = go(7)
    assert.deepEqual(
      a.deployments.map((d) => [d.t, d.leadTimeSec, d.digest]),
      b.deployments.map((d) => [d.t, d.leadTimeSec, d.digest]),
    )
    const c = go(7)
    assert.deepEqual(b.events, c.events)
  })

  test('long sessions stay bounded; options apply to new commits only', () => {
    const s = createPipeline({ gate: 'ci', parallelJobs: true, cache: true })
    for (let i = 0; i < 100; i++) {
      commit(s, 'failing-test')
      stepPipeline(s, 120)
    }
    runPipelineUntilIdle(s)
    assert.ok(s.runs.length <= 60)
    assert.ok(s.events.length <= 50)
    const r1 = commit(s, 'ok')
    setPipelineOption(s, 'skipTests', true)
    const r2 = commit(s, 'ok')
    assert.equal(r1.jobs.test.status === 'skipped', false)
    assert.equal(r2.jobs.test.status, 'skipped')
    setPipelineOption(s, 'immutableTags', true)
    assert.equal(s.registry.immutableTags, true)
    assert.equal(pipelineView(s).length > 0, true)
  })

  test('NaN / negative / out-of-range config falls back to safe values', () => {
    const s = createPipeline({
      durations: { lint: Number.NaN, e2e: -10, scan: Number.POSITIVE_INFINITY },
      flakyFailProb: 7,
      flakyRetries: Number.NaN,
      incidentDetectSec: Number.NaN,
      oidcTokenLifetimeSec: 0,
      attackerIntervalSec: -1,
      seed: Number.NaN,
      gate: 'deployment',
    })
    assert.deepEqual(s.config.durations, DEFAULT_DURATIONS)
    assert.equal(resolveDurations({ scan: 0 }).scan, 0, '0 is a valid override')
    assert.equal(s.config.flakyFailProb, 1)
    assert.equal(s.config.flakyRetries, 2)
    assert.equal(s.config.incidentDetectSec, 300)
    assert.equal(s.config.oidcTokenLifetimeSec, 600)
    assert.equal(s.config.attackerIntervalSec, 60)
    assert.equal(s.seed, 42)
    const r = commit(s, 'ok')
    runPipelineUntilIdle(s)
    assert.equal(r.leadTimeSec, 890)
    const t = s.t
    stepPipeline(s, Number.NaN)
    stepPipeline(s, -5)
    stepPipeline(s, Number.POSITIVE_INFINITY)
    assert.equal(s.t, t)
  })

  test('durations are the L21 model values', () => {
    assert.deepEqual(DEFAULT_DURATIONS, { lint: 30, testCold: 180, testCached: 60, buildCold: 240, buildCached: 40, scan: 60, push: 20, staging: 60, e2e: 240, prod: 60, rollback: 60 })
    const s: PipelineState = createPipeline()
    assert.equal(s.prod.version, '1.4.0')
    const stations: StationId[] = ['lint', 'test', 'build', 'scan', 'push', 'staging', 'e2e', 'gate', 'prod']
    assert.deepEqual(Object.keys(commit(s).jobs), stations)
  })
})

// =============================================================================================
// Review round 2: regression tests, one block per finding (M = model lens, A = API lens)
// =============================================================================================
describe('review M1: main is cumulative – a defect stays until a revert or fix', () => {
  test('a failing test on main fails every later commit until git revert', () => {
    const s = createPipeline({ gate: 'deployment', cache: true, parallelJobs: true })
    const bad = commit(s, 'failing-test')
    runPipelineUntilIdle(s)
    assert.equal(bad.status, 'failed')
    assert.equal(mainStatus(s).red, true)
    assert.equal(mainStatus(s).defects[0].commitId, bad.id)
    assert.ok(s.events.some((e) => e.kind === 'main-red'))
    const next = commit(s, 'ok')
    runPipelineUntilIdle(s)
    assert.equal(next.status, 'failed', 'the next commit contains the bug')
    assert.equal(next.failedAt, 'test')
    assert.match(next.failReason!, new RegExp(`greška iz ${bad.commit.short}`))
    const rv = revertCommit(s)
    assert.equal(rv.commit.message, 'Revert „Popust za Ćevap-petak”')
    assert.deepEqual(rv.commit.removes, [bad.id])
    runPipelineUntilIdle(s)
    assert.equal(rv.status, 'in-prod')
    assert.deepEqual(mainStatus(s), { head: rv.commit.short, defects: [], red: false, cause: null })
    assert.equal(s.stats.reverts, 1)
    const after = commit(s, 'ok')
    runPipelineUntilIdle(s)
    assert.equal(after.status, 'in-prod')
  })

  test('a committed secret and a vulnerable FROM stay in every later tree', () => {
    for (const ty of ['secret', 'vulnerable-base'] as const) {
      const s = createPipeline({ gate: 'deployment' })
      commit(s, ty)
      runPipelineUntilIdle(s)
      const next = commit(s, 'ok')
      runPipelineUntilIdle(s)
      assert.equal(next.status, 'failed', ty)
      assert.equal(next.failedAt, 'scan')
      if (ty === 'vulnerable-base') assert.equal(next.commit.vulnerableBase, true)
      else assert.equal(next.commit.hasSecret, true)
    }
  })

  test('skip tests: the next unrelated commit ships the bug again; the incident ends by rollback, not „fix-forward”', () => {
    const s = createPipeline({ gate: 'deployment', skipTests: true })
    commit(s, 'failing-test')
    runPipelineUntil(s, 200)
    const unrelated = commit(s, 'ok')
    runPipelineUntilIdle(s)
    assert.equal(unrelated.commit.buggy, true)
    assert.equal(s.stats.badInProd, 2)
    assert.equal(s.incidents.length, 1)
    assert.equal(s.incidents[0].how, 'rollback')
    assert.equal(s.incidents[0].rollbackVia, 'redeploy')
    assert.equal(s.incidents[0].resolvedAt, 830, 'detected at 770 s, rolled back in 60 s – never before detection')
    assert.equal(s.incidents[0].resolvedBeforeDetection, false)
    assert.ok(!s.events.some((e) => e.kind === 'recovered' && /ispravkom/.test(e.text)))
    assert.equal(mainStatus(s).defects.length, 1, 'main still has the bug: rollback fixes production, not main')
  })

  test('a revert that lands is labelled as a revert; a PR on a red main inherits the defect; merges after main moved combine trees', () => {
    const s = createPipeline({ gate: 'deployment', cache: true, parallelJobs: true, skipTests: true, incidentDetectSec: 3600 })
    const bad = commit(s, 'failing-test')
    runPipelineUntil(s, 300)
    revertCommit(s, bad.id)
    runPipelineUntilIdle(s)
    assert.equal(s.incidents[0].how, 'revert')
    // PR branched while main is clean, main moves, then the merge = main + PR change
    const t = createPipeline({ gate: 'deployment', cache: true, parallelJobs: true })
    const pr = commit(t, 'ok', { trigger: 'pr' })
    runPipelineUntilIdle(t)
    const onMain = commit(t, 'ok')
    runPipelineUntilIdle(t)
    const merged = mergePullRequest(t, pr.id)!
    assert.notEqual(merged.commit.codeVersion, pr.commit.codeVersion)
    assert.notEqual(merged.commit.codeVersion, onMain.commit.codeVersion)
    // a PR opened on a red main fails its checks too
    const u = createPipeline({ gate: 'deployment' })
    commit(u, 'failing-test')
    runPipelineUntilIdle(u)
    const pr2 = commit(u, 'ok', { trigger: 'pr' })
    runPipelineUntilIdle(u)
    assert.equal(pr2.status, 'failed')
    assert.equal(mergePullRequest(u, pr2.id), null)
  })

  test('without the team reverting, a red main blocks everyone (the stream mostly inherits the defect)', () => {
    const s = createPipeline({ gate: 'deployment', cache: true, parallelJobs: true })
    startCommitStream(s, { count: 20, revertAfterSec: null })
    runPipelineUntilIdle(s)
    const st = streamStatus(s)!
    assert.equal(st.reverts, 0)
    assert.equal(st.blocked.inherited, 14)
    assert.equal(st.deployed, 3)
    assert.equal(mainStatus(s).red, true)
  })
})

describe('review M2: a failing build stage is reported as itself, not as COPY --from', () => {
  test('multi-stage with a late build-stage failure fails at ~50 s on the real step and keeps finished layers', () => {
    const s = createBuildLab({ preset: 'visefazna' })
    moveCard(s, 'copy-all', 5) // COPY . . below RUN npm run build
    const r = buildNow(s)!
    assert.equal(r.ok, false)
    assert.equal(r.seconds, 50)
    assert.match(r.error!, /^redak 5: vite: nema izvornog koda/)
    const p = s.build!.plan
    assert.equal(p.steps.find((x) => x.id === 'copy-dist')!.status, 'skipped')
    assert.equal(p.steps.find((x) => x.id === 'copy-dist')!.reason, 'cancelled')
    assert.equal(p.steps.find((x) => x.id === 'npm-ci')!.status, 'run')
    setCardOrder(s, LAB_PRESETS.visefazna.cards)
    const fixed = buildNow(s)!
    assert.equal(fixed.seconds, 4.2, 'npm ci and both base pulls from the failed build are reused')
    assert.equal(s.build!.plan.steps[0].reason, 'base-local')
    assert.equal(s.build!.plan.steps.find((x) => x.id === 'npm-ci')!.status, 'cached')
  })

  test('COPY --from of a missing path fails when the source stage is done, not at t = 0', () => {
    const cat = PROJECTS['klopa-web'].catalog
    const ctx: BuildContext = { files: PROJECTS['klopa-web'].files.map((f) => ({ ...f })), dockerignore: true, secrets: {}, args: {} }
    const p = planBuild(['from-build', 'workdir', 'copy-pkg', 'npm-ci', 'from-runtime', 'copy-dist'].map((id) => ({ ...cat[id] }) as Instruction), {
      context: ctx,
      cache: createCache(),
      localBases: new Set(),
      buildId: 1,
      now: 0,
    })
    assert.match(p.error!.message, /not found/)
    assert.equal(p.totalSeconds, 8 + 1 + 40, 'after the build stage finished (49 s)')
  })
})

describe('review M3 + M7: settings lines are not cache links; the Dockerfile is in the context', () => {
  test('moving CMD or EXPOSE keeps every later layer CACHED (only the Dockerfile copy changes)', () => {
    const d = createBuildLab({ preset: 'dobar-redoslijed' })
    buildNow(d)
    moveCard(d, 'cmd-node', 1)
    const r = buildNow(d)!
    assert.equal(r.seconds, 4, 'COPY . . (it copies the edited Dockerfile) + npm run build – not npm ci')
    assert.deepEqual(r.firstRebuilt?.changedFiles, ['Dockerfile'])
    const steps = d.build!.plan.steps
    assert.equal(steps.find((x) => x.id === 'cmd-node')!.reason, 'metadata')
    assert.equal(steps.find((x) => x.id === 'cmd-node')!.metadataOnly, true)
    for (const id of ['workdir', 'copy-pkg', 'npm-ci']) assert.equal(steps.find((x) => x.id === id)!.status, 'cached', id)
    // moving it back restores the old Dockerfile content → everything CACHED again (content checksums, not versions)
    setCardOrder(d, LAB_PRESETS['dobar-redoslijed'].cards)
    assert.equal(buildNow(d)!.seconds, 0)
    // klopa-api: EXPOSE right after FROM → only COPY . . (1 s)
    const a = createBuildLab({ preset: 'api-dobar' })
    buildNow(a)
    moveCard(a, 'api-expose', 1)
    const ra = buildNow(a)!
    assert.equal(ra.seconds, 1)
    assert.equal(a.build!.plan.steps.find((x) => x.id === 'api-pip')!.status, 'cached')
  })

  test('„.dockerignore sadrži Dockerfile”: then a CMD move costs nothing at all', () => {
    const d = createBuildLab({ preset: 'dobar-redoslijed' })
    setIgnoreDockerfile(d, true)
    assert.ok(dockerignoreLines(d).includes('Dockerfile'))
    buildNow(d)
    moveCard(d, 'cmd-node', 1)
    assert.equal(buildNow(d)!.seconds, 0)
  })

  test('ENV moved above COPY: COPY stays cached, the RUN below misses with env-changed (no value in the label)', () => {
    const s = createBuildLab({ preset: 'dobar-redoslijed' })
    addCard(s, 'env-secret', 7)
    setIgnoreDockerfile(s, true)
    buildNow(s)
    moveCard(s, 'env-secret', 2)
    const r = buildNow(s)!
    const steps = s.build!.plan.steps
    assert.equal(steps.find((x) => x.id === 'copy-pkg')!.status, 'cached')
    const ci = steps.find((x) => x.id === 'npm-ci')!
    assert.equal(ci.reason, 'env-changed')
    assert.deepEqual(ci.changedFiles, ['ENV SMS_API_KEY'])
    assert.ok(!ci.changedFiles.join().includes('klopa-sms'))
    assert.equal(r.seconds, 44)
    assert.equal(CACHE_REASON_LABEL['env-changed'].length > 0, true)
  })

  test('the Dockerfile is part of the build context and of COPY . .', () => {
    const s = createBuildLab({ preset: 'dobar-redoslijed' })
    const files = labContext(s).files.map((f) => f.path)
    assert.ok(files.includes('Dockerfile') && files.includes('.dockerignore'))
    buildNow(s)
    assert.ok(mergedView(s.image!).has('Dockerfile'))
    addCard(s, 'env-secret') // after COPY . .: settings only, but the Dockerfile text changed
    assert.equal(buildNow(s)!.seconds, 4)
  })
})

describe('review M4 + M11: users own files; WORKDIR makes a layer', () => {
  test('USER 10001 before pip install → Errno 13 (pip cannot write to root-owned /usr/local)', () => {
    const a = createBuildLab({ preset: 'api-dobar' })
    moveCard(a, 'api-user', 2)
    const r = buildNow(a)!
    assert.equal(r.ok, false)
    assert.match(r.error!, /OSError: \[Errno 13\] Permission denied/)
  })

  test('a non-root RUN rm in a root-owned directory fails (busybox wording on Alpine)', () => {
    const cat = PROJECTS['klopa-web'].catalog
    const ctx: BuildContext = { files: PROJECTS['klopa-web'].files.map((f) => ({ ...f, ignored: f.path === '.env' ? false : f.ignored })), dockerignore: true, secrets: {}, args: {} }
    const p = planBuild(['from-runtime', 'copy-env', 'rm-env'].map((id) => ({ ...cat[id] }) as Instruction), { context: ctx, cache: createCache(), localBases: new Set(), buildId: 1, now: 0 })
    assert.equal(p.ok, false)
    assert.match(p.error!.message, /^rm: can't remove '\.env': Permission denied – \/ pripada korisniku root, a RUN se izvodi kao 101/)
    assert.equal(p.steps.find((x) => x.id === 'copy-env')!.user, 'root', 'COPY writes root-owned files whatever USER says')
  })

  test('break-it in the nginx-unprivileged stage: USER root goes in front, the build works, the key stays in a lower layer, user is 101 again', () => {
    const v = createBuildLab({ preset: 'visefazna' })
    const inj = injectEnvSecret(v)
    assert.deepEqual(inj, { added: true, willFail: null })
    const ids = v.cards.map((c) => c.id)
    assert.deepEqual(
      ids.slice(ids.indexOf('copy-dist')),
      ['copy-dist', 'user-root', 'copy-env', 'rm-env', 'user-nginx', 'cmd-nginx'],
      'inserted after COPY --from, before the stage\'s own USER 101 (which switches back)',
    )
    assert.equal(v.envTrick!.restoreUser, null, 'the stage already has its own USER card')
    const r = buildNow(v)!
    assert.equal(r.ok, true)
    assert.equal(v.image!.config.user, '101')
    const ex = findSecrets(v.image!)
    assert.equal(ex.length, 1)
    assert.equal(ex[0].hiddenByWhiteout, true)
    assert.equal(ex[0].at, '/.env')
    assert.equal(removeEnvSecret(v), true)
    assert.deepEqual(v.cards.map((c) => c.id), LAB_PRESETS.visefazna.cards)
    assert.equal(v.context.files.find((f) => f.path === '.env')!.ignored, true, 'the !.env exception is removed again')
  })

  test('WORKDIR /app is an 8 kB layer owned by the current user; an existing directory is only a setting', () => {
    const s = createBuildLab({ preset: 'dobar-redoslijed' })
    buildNow(s)
    assert.equal(s.image!.layers.length, 3 + 5, '3 base + WORKDIR + COPY + npm ci + COPY + build')
    const wd = s.image!.layers.find((l) => l.createdBy === 'WORKDIR /app')!
    assert.equal(wd.sizeMB, WORKDIR_LAYER_MB)
    assert.ok(imageHistory(s.image!).some((h) => h.createdBy === 'WORKDIR /app' && h.size === '8.19kB'))
    const cat = PROJECTS['klopa-web'].catalog
    const ctx: BuildContext = { files: PROJECTS['klopa-web'].files.map((f) => ({ ...f })), dockerignore: true, secrets: {}, args: {} }
    const p = planBuild([{ ...cat['from-build'] }, { id: 'w', kind: 'WORKDIR', text: 'WORKDIR /' }] as Instruction[], { context: ctx, cache: createCache(), localBases: new Set(), buildId: 1, now: 0 })
    assert.equal(p.steps[1].metadataOnly, true)
    assert.equal(p.image!.layers.length, 3)
  })

  test('COPY --chown gives the files to that user', () => {
    const cat = PROJECTS['klopa-web'].catalog
    const ctx: BuildContext = { files: PROJECTS['klopa-web'].files.map((f) => ({ ...f })), dockerignore: true, secrets: {}, args: {} }
    const chown: Instruction = { id: 'cp', kind: 'COPY', text: 'COPY --chown=node package*.json ./', src: ['package*.json'], dest: './', chown: 'node' }
    const p = planBuild([{ ...cat['from-build'] }, { ...cat.workdir }, chown], { context: ctx, cache: createCache(), localBases: new Set(), buildId: 1, now: 0 })
    assert.ok(p.image!.layers.at(-1)!.added.every((f) => f.owner === 'node'))
  })
})

describe('review M5: GitOps rollback is a git revert in the config repository', () => {
  test('dan-izdanja: incident → on-call git revert commit → Argo CD sync; history and config repo show it', () => {
    const s = createPipeline({ ...PIPELINE_PRESETS['dan-izdanja'], skipTests: true })
    commit(s, 'failing-test')
    runPipelineUntilIdle(s)
    assert.deepEqual(
      s.configRepo.map((c) => [c.env, c.kind, c.by]),
      [
        ['staging', 'bot', 'ci-bot'],
        ['production', 'bot', 'ci-bot'],
        ['production', 'revert', 'on-call'],
      ],
    )
    const rb = s.prodHistory.at(-1)!
    assert.equal(rb.kind, 'rollback')
    assert.equal(rb.via, 'config-repo')
    assert.equal(rb.configSha, s.configRepo.at(-1)!.short)
    assert.equal(s.configRepo.at(-1)!.digest, s.prodHistory[0].digest)
    assert.equal(s.incidents[0].rollbackVia, 'git-revert')
    assert.match(s.events.find((e) => e.kind === 'rollback-start')!.text, /git revert u config repozitoriju/)
    assert.ok(!s.events.some((e) => /sam vraća/.test(e.text)))
  })

  test('Argo CD polling instead of a webhook adds to the rollback and to every GitOps deploy', () => {
    const s = createPipeline({ ...PIPELINE_PRESETS['dan-izdanja'], skipTests: true, argoPollSec: 150 })
    commit(s, 'failing-test')
    runPipelineUntilIdle(s)
    assert.equal(s.incidents[0].recoverySec, 300 + 60 + 150)
    const off = createPipeline({ ...PIPELINE_PRESETS['dan-izdanja'], skipTests: true, rollbackOnIncident: false })
    commit(off, 'failing-test')
    runPipelineUntilIdle(off)
    assert.ok(!off.configRepo.some((c) => c.kind === 'revert'))
    assert.equal(dora(off).openIncident, true)
    setPipelineOption(off, 'autoRollback', true)
    assert.equal(off.config.rollbackOnIncident, true, 'autoRollback is a deprecated alias')
  })
})

describe('review M6: CI caches are scoped per ref; the digest is the platform manifest digest', () => {
  test('a PR that changes requirements is cold, and so is its merge on main (main cannot restore PR caches)', () => {
    const s = createPipeline(PIPELINE_PRESETS['dan-izdanja'])
    const pr = commit(s, 'ok', { trigger: 'pr', changesDeps: true })
    runPipelineUntilIdle(s)
    assert.equal(pr.jobs.build.duration, 240)
    assert.match(pr.jobs.build.note!, /promijenjen requirements\.txt/)
    const m = mergePullRequest(s, pr.id)!
    runPipelineUntilIdle(s)
    assert.equal(m.jobs.test.duration, 180)
    assert.equal(m.jobs.build.duration, 240)
    assert.equal(m.cacheScope, 'main')
    assert.equal(pr.cacheScope, `pr-${pr.id}`)
    // the next commit on main is warm: main's own run wrote main's cache
    const next = commit(s, 'ok')
    runPipelineUntilIdle(s)
    assert.equal(next.jobs.build.duration, 40)
    assert.equal(next.jobs.test.duration, 60)
  })

  test('registry layer cache is shared, the dependency cache (actions/cache) is not', () => {
    const s = createPipeline({ ...PIPELINE_PRESETS['dan-izdanja'], cacheBackend: 'registry' })
    const pr = commit(s, 'ok', { trigger: 'pr', changesDeps: true })
    runPipelineUntilIdle(s)
    const m = mergePullRequest(s, pr.id)!
    runPipelineUntilIdle(s)
    assert.equal(m.jobs.build.duration, 40)
    assert.equal(m.jobs.test.duration, 180)
    assert.equal(m.digest, pr.digest)
    assert.match(DIGEST_NOTE, /digest manifesta slike/)
  })
})

describe('review M8 + A2: the git SHA tag belongs to the tree the image was built from', () => {
  test('a Dockerfile-only change gets a new SHA, so immutable tags accept the new build', () => {
    const s = createBuildLab({ preset: 'visefazna', immutableTags: true })
    buildNow(s)
    pushImage(s)
    finishPush(s)
    const before = gitShortSha(s)
    setMultiStage(s, false)
    assert.notEqual(gitShortSha(s), before)
    const b = buildNow(s)!
    assert.equal(b.gitSha, gitShortSha(s))
    const p = pushImage(s)!
    assert.deepEqual(p.tags, [b.gitSha])
    assert.deepEqual(p.rejectedTags, [])
    touchGit(s)
    assert.equal(gitShortSha(s), b.gitSha, 'a git fetch is not a new commit')
  })

  test('push after „Promijeni kod” without a build pushes the old image under ITS SHA and warns', () => {
    const s = createBuildLab({ preset: 'visefazna' })
    buildNow(s)
    const built = s.imageSha
    changeCode(s)
    assert.equal(imageStale(s), true)
    assert.equal(labMetrics(s).imageStale, true)
    const p = pushImage(s)!
    assert.deepEqual(p.tags, [built, 'latest'])
    assert.ok(s.events.some((e) => e.kind === 'push-stale' && e.tone === 'warn'))
    buildNow(s)
    assert.equal(imageStale(s), false)
  })
})

describe('review M9 + A3: tasks need a working app', () => {
  test('L08: a Dockerfile without the code cannot pass „< 5 s”; an empty nginx cannot pass „< 200 MB” or „nije root”', () => {
    const s = createBuildLab({ preset: 'laboratorij' })
    removeCard(s, 'copy-all')
    removeCard(s, 'npm-build')
    buildNow(s)
    changeCode(s)
    const r = buildNow(s)!
    assert.equal(r.seconds, 0)
    assert.equal(r.servesApp, false)
    assert.equal(labGoals(s).rebuildUnder5s, false)
    const v = createBuildLab({ preset: 'visefazna' })
    removeCard(v, 'copy-dist')
    buildNow(v)
    assert.equal(v.image!.sizeMB, 47)
    assert.equal(servesApp(v.project, v.image), false)
    assert.deepEqual(labGoals(v), { rebuildUnder5s: false, imageUnder200MB: false, foundKey: false, nonRoot: false })
    const ok = createBuildLab({ preset: 'visefazna' })
    buildNow(ok)
    assert.equal(labMetrics(ok).servesApp, true)
    const api = createBuildLab({ preset: 'api-dobar' })
    buildNow(api)
    assert.equal(servesApp(api.project, api.image), true)
  })

  test('L21: „0 od 20” needs a finished 20-commit stream with deploys; earlier experiments do not count', () => {
    const ci = createPipeline({ gate: 'ci', skipTests: true, parallelJobs: true, cache: true })
    startCommitStream(ci, { count: 20 })
    runPipelineUntilIdle(ci)
    assert.equal(streamStatus(ci)!.done, true)
    assert.equal(streamStatus(ci)!.deployed, 0)
    assert.equal(pipelineGoals(ci).zeroBadOf20, false, 'no deploys is not „0 bad in production”')
    const prs = createPipeline({ gate: 'deployment' })
    for (let i = 0; i < 20; i++) commit(prs, 'failing-test', { trigger: 'pr' })
    runPipelineUntilIdle(prs)
    assert.equal(pipelineGoals(prs).zeroBadOf20, false)
    // A4: an earlier break-it (skip tests + bug) does not block the task
    const s = createPipeline({ gate: 'deployment', cache: true, parallelJobs: true, skipTests: true })
    commit(s, 'failing-test')
    runPipelineUntilIdle(s)
    revertCommit(s)
    runPipelineUntilIdle(s)
    setPipelineOption(s, 'skipTests', false)
    startCommitStream(s, { count: 20 })
    runPipelineUntilIdle(s)
    assert.equal(s.stats.badInProd, 1)
    assert.equal(streamStatus(s)!.badInProd, 0)
    assert.equal(pipelineGoals(s).zeroBadOf20, true)
  })

  test('L21: goals are sticky – trimming old runs does not un-tick „< 10 min”', () => {
    const q = createPipeline({ gate: 'deployment', cache: true })
    commit(q, 'ok')
    runPipelineUntilIdle(q)
    assert.equal(pipelineGoals(q).leadTimeUnder10MinAllChecks, true)
    for (let i = 0; i < 61; i++) commit(q, 'flaky')
    runPipelineUntilIdle(q, 48 * 3600)
    assert.ok(q.runs.length <= 60 || q.runs.every((r) => r.id > 1))
    assert.equal(pipelineGoals(q).leadTimeUnder10MinAllChecks, true)
    assert.equal(q.stats.bestLeadTimeAllChecksSec, 570)
  })
})

describe('review M10, M12, M13, M14, M15, M16, M17', () => {
  test('M12 private npm package: npm ci needs the token in scope', () => {
    const s = createBuildLab({ preset: 'dobar-redoslijed' })
    assert.equal(s.privateNpm, false)
    assert.equal(buildNow(s)!.ok, true, 'the default lab has no private package')
    setNpmTokenVia(s, 'arg')
    assert.equal(s.privateNpm, true)
    assert.equal(buildNow(s)!.ok, true)
    moveCard(s, 'arg-npm-token', 0) // a global ARG, not re-declared in the stage
    const g = buildNow(s)!
    assert.match(g.error!, /E401/)
    setNpmTokenVia(s, 'none')
    assert.match(buildNow(s)!.error!, /E401/, 'no token at all')
    setNpmTokenVia(s, 'secret-mount')
    assert.equal(buildNow(s)!.ok, true)
    delete s.context.secrets.npmrc
    assert.equal(previewBuild(s).ok, true, 'a cached npm ci never runs, so a missing secret does not matter (BuildKit)')
    changeDeps(s)
    assert.match(previewBuild(s).error!.message, /E401/, 'the mount without `docker build --secret`, once npm ci really runs')
    setNpmTokenVia(s, 'copy-rm')
    assert.equal(buildNow(s)!.ok, true)
    assert.equal(setPrivateNpm(s, false), true)
    assert.equal(setPrivateNpm(createBuildLab({ preset: 'api-dobar' }), true), false)
  })

  test('M13 a committed secret is in Git history: event, list, rotation', () => {
    const s = createPipeline({ gate: 'deployment' })
    const r = commit(s, 'secret')
    runPipelineUntilIdle(s)
    assert.equal(s.secretsInHistory.length, 1)
    assert.equal(s.secretsInHistory[0].short, r.commit.short)
    assert.equal(s.stats.secretsInHistory, 1)
    assert.ok(s.events.some((e) => e.kind === 'secret-in-history' && /opozovite ga i zamijenite/.test(e.text)))
    commit(s, 'ok') // still contains the secret: the scan fails again, but the key is listed once
    runPipelineUntilIdle(s)
    assert.equal(s.secretsInHistory.length, 1)
    assert.equal(rotateSecrets(s), 1)
    assert.equal(rotateSecrets(s), 0)
    assert.equal(s.secretsInHistory[0].rotated, true)
  })

  test('M14 a cache switched on later starts empty: first run cold, the next warm', () => {
    const s = createPipeline(PIPELINE_PRESETS.tvornica)
    assert.equal(s.ciCaches.size, 0)
    setPipelineOption(s, 'cache', true)
    const r1 = commit(s, 'ok')
    runPipelineUntil(s, 2000)
    assert.equal(r1.jobs.test.duration, 180)
    assert.equal(r1.jobs.build.duration, 240)
    assert.match(r1.jobs.build.note!, /predmemorija maina je prazna/)
    const r2 = commit(s, 'ok')
    runPipelineUntil(s, 4000)
    assert.equal(r2.jobs.test.duration, 60)
    assert.equal(r2.jobs.build.duration, 40)
  })

  test('M15 rate(): 0 or tiny → 0,1 MB/s, NaN/∞ → default', () => {
    assert.equal(rate(0, 10), MIN_MBPS)
    assert.equal(rate(-5, 10), MIN_MBPS)
    assert.equal(rate(Number.NaN, 10), 10)
    assert.equal(rate(Number.POSITIVE_INFINITY, 10), 10)
    assert.equal(rate(undefined, 10), 10)
    assert.equal(rate(25, 10), 25)
    const reg = createRegistry()
    const host = createHost('h', 'h')
    assert.ok(Number.isFinite(planPull(reg, host, 'registry.klopa.example/x:1', 'Always', { mbps: 0 }).seconds))
  })

  test('M16 a NaN drop index is refused; addCard with NaN appends', () => {
    const s = createBuildLab({ preset: 'visefazna' })
    const before = s.cards.map((c) => c.id)
    assert.equal(moveCard(s, 'npm-ci', Number.NaN), false)
    assert.equal(moveCard(s, 'npm-ci', Number.POSITIVE_INFINITY), false)
    assert.deepEqual(s.cards.map((c) => c.id), before)
    assert.equal(addCard(s, 'env-secret', Number.NaN), true)
    assert.equal(s.cards.at(-1)!.id, 'env-secret')
  })

  test('M17 python:3.13-slim is Debian trixie; node slim is bookworm', () => {
    assert.equal(BASE_IMAGES['python:3.13-slim'].layers[0].label, 'Debian (trixie-slim)')
    assert.equal(BASE_IMAGES['node:24-slim'].layers[0].label, 'Debian (bookworm-slim)')
  })
})

describe('review A1: „why did it miss” compares with the previous build, cached or not', () => {
  test('after a fully cached build, a code-only change names only src/', () => {
    const s = createBuildLab({ preset: 'dobar-redoslijed' })
    buildNow(s)
    setDockerignore(s, false)
    const two = buildNow(s)!
    assert.deepEqual(two.firstRebuilt?.changedFiles, ['.dockerignore', '.env', '.git/', 'node_modules/'])
    setDockerignore(s, true)
    assert.equal(buildNow(s)!.seconds, 0)
    changeCode(s)
    const four = buildNow(s)!
    assert.deepEqual(four.firstRebuilt?.changedFiles, ['src/'])
    assert.match(s.events.find((e) => e.kind === 'cache-miss' && e.id === Math.max(...s.events.filter((x) => x.kind === 'cache-miss').map((x) => x.id)))!.text, /\(src\/\)$/)
  })
})

describe('review A4: the commit stream has its own scoreboard', () => {
  test('delivery gate: stream runs wait for approval unless autoApprove', () => {
    const s = createPipeline(PIPELINE_PRESETS.tvornica)
    startCommitStream(s, { count: 20 })
    runPipelineUntilIdle(s)
    assert.equal(streamStatus(s)!.done, false)
    assert.ok(waitingAtGate(s).length > 0)
    const t = createPipeline(PIPELINE_PRESETS.tvornica)
    startCommitStream(t, { count: 20, autoApprove: true })
    runPipelineUntilIdle(t, 20 * 3600)
    const st = streamStatus(t)!
    assert.equal(st.done, true)
    assert.equal(st.badInProd, 0)
    assert.equal(st.deployed, 15)
    assert.equal(pipelineGoals(t).zeroBadOf20, true)
    assert.equal(waitingAtGate(t).length, 0, 'the team\'s reverts are approved too')
  })
})

describe('review A5: OIDC tokens are per job', () => {
  test('a leak during tests finds no token; staging/production tokens are scoped to their environment', () => {
    const s = createPipeline({ ...PIPELINE_PRESETS['brza-tvornica'], credential: 'oidc', gate: 'deployment' })
    commit(s, 'ok')
    runPipelineUntil(s, 50)
    const l = leakCredential(s, { target: 'running-job' })
    assert.equal(l.station, 'test')
    assert.equal(l.tokenId, null)
    assert.equal(l.validUntil, 50)
    assert.equal(l.nextAttemptAt, null)
    assert.match(s.events.at(-1)!.text, /U poslu Testovi nema oblačnog tokena/)
    assert.equal(s.events.at(-1)!.tone, 'ok')
    runPipelineUntil(s, 200)
    const st = leakCredential(s) // staging job runs 180–240
    assert.equal(st.station, 'staging')
    assert.equal(st.tokenKind, 'oidc')
    assert.match(st.scope, /okruženje staging/)
    assert.ok(!/production/.test(st.scope))
    assert.equal(st.validUntil, 780)
    const pinned = leakCredential(s, { station: 'lint' })
    assert.equal(pinned.tokenId, null)
    // a static key is a workflow-level secret: every job has it
    const k = createPipeline({ ...PIPELINE_PRESETS['brza-tvornica'], gate: 'deployment' })
    commit(k, 'ok')
    runPipelineUntil(k, 50)
    assert.equal(leakCredential(k).validUntil, null)
  })

  test('GitOps: deploy jobs hold a GitHub App token for the config repository, not a cloud token', () => {
    const s = createPipeline(PIPELINE_PRESETS['dan-izdanja'])
    commit(s, 'ok')
    runPipelineUntilIdle(s)
    assert.deepEqual(
      s.tokens.map((t) => [t.station, t.kind]),
      [
        ['push', 'oidc'],
        ['staging', 'github-app'],
        ['prod', 'github-app'],
      ],
    )
    assert.match(s.tokens[2].scope, /config repozitorij/)
    assert.equal(GITHUB_APP_TOKEN_LIFETIME.realValue, 3600)
  })
})

describe('review A6 + A7: one commit\'s journey for L24, on the wall clock', () => {
  test('dan-izdanja: PR checks + merge land 2.0.2 in production at 11:59:40 when merged right away', () => {
    const s = createPipeline(PIPELINE_PRESETS['dan-izdanja'])
    assert.equal(wallClock(s), '11:48')
    assert.equal(nextPatchVersion(s), '2.0.2')
    const pr = commit(s, 'fix', { trigger: 'pr' })
    runPipelineUntil(s, idealPrChecksTime({ parallelJobs: true, cache: true, skipTests: false }))
    assert.equal(pr.status, 'checks-passed')
    const m = mergePullRequest(s, pr.id, { version: 'next-patch' })!
    runPipelineUntilIdle(s)
    assert.equal(m.commit.version, '2.0.2')
    assert.equal(m.mergedFrom, pr.id)
    assert.equal(m.jobs.prod.end, 160 + 540)
    assert.equal(wallClock(s, m.jobs.prod.end!, true), '11:59:40')
    const j = commitJourney(s, m.id)
    assert.deepEqual(
      j.map((e) => `${e.phase}:${e.station}`),
      ['pr:lint', 'pr:test', 'pr:build', 'pr:scan', ...STATION_IDS.map((x) => `main:${x}`)],
    )
    assert.equal(j.at(-1)!.end, 700)
    assert.equal(j.find((e) => e.phase === 'main' && e.station === 'lint')!.atClock, '11:50')
    assert.equal(commitTimeline(m, s)[0].atClock, '11:50')
    assert.equal(deployRef(s, m), `registry.klopa.example/klopa-api:2.0.2@${m.prodDigest}`)
    assert.deepEqual(
      m.buildSteps.filter((b) => !['USER', 'EXPOSE', 'CMD'].some((k) => b.text.startsWith(k))).map((b) => b.status),
      ['cached', 'cached', 'cached', 'cached', 'run'],
      'FROM, WORKDIR, requirements and pip from the cache; only COPY . . is rebuilt',
    )
    assert.equal(commitJourney(s, 999).length, 0)
    assert.equal(deployRef(s, pr), null, 'a PR is never pushed')
    assert.equal(clockLabel('bad', 0), '09:00')
  })
})

const STATION_IDS: StationId[] = ['lint', 'test', 'build', 'scan', 'push', 'staging', 'e2e', 'gate', 'prod']

describe('review A8 + A9: warm lab and the .env break-it with .dockerignore on', () => {
  test('warm: the first visible build already shows the 44 s cascade and is build #1', () => {
    const s = createBuildLab({ preset: 'laboratorij', warm: true })
    assert.deepEqual([s.builds.length, s.events.length, s.t, s.build], [0, 0, 0, null])
    assert.ok(s.image)
    changeCode(s)
    const r = buildNow(s)!
    assert.equal(r.id, 1)
    assert.equal(r.seconds, 44)
    assert.deepEqual([...LAB_RECOMMENDED_SPEEDS], [1, 4, 10])
  })

  test('the break-it adds the !.env exception by default, so the lesson is visible with .dockerignore on', () => {
    const s = createBuildLab({ preset: 'dobar-redoslijed' })
    const r = injectEnvSecret(s)
    assert.deepEqual(r, { added: true, willFail: null })
    assert.ok(s.events.some((e) => e.kind === 'dockerignore' && /!\.env/.test(e.text)))
    assert.ok(!dockerignoreLines(s).includes('.env'))
    buildNow(s)
    assert.ok(findSecrets(s.image!).some((e) => e.where === 'layer'))
    removeEnvSecret(s)
    assert.ok(dockerignoreLines(s).includes('.env'))
  })
})

describe('review A10: gate edge cases', () => {
  test('switching to „samo CI” releases runs waiting at the gate; approve() takes the longest wait; rebuild can be disarmed', () => {
    const s = createPipeline({ cache: true, parallelJobs: true })
    const a = commit(s, 'ok')
    runPipelineUntil(s, 100)
    const b = commit(s, 'ok')
    runPipelineUntilIdle(s)
    assert.deepEqual(waitingAtGate(s).map((r) => r.id), [a.id, b.id])
    assert.equal(waitingAtGate(s)[0].waitSec, 310)
    assert.equal(approve(s), true)
    runPipelineUntilIdle(s)
    assert.equal(a.status, 'in-prod')
    assert.equal(a.gateWaitSec, 310)
    setGate(s, 'ci')
    runPipelineUntilIdle(s)
    assert.equal(b.status, 'in-registry')
    assert.equal(b.jobs.prod.status, 'skipped')
    assert.equal(approve(s), false)
    rebuildForProduction(s)
    assert.equal(s.rebuildNextProd, true)
    setRebuildForProduction(s, false)
    assert.equal(s.rebuildNextProd, false)
  })
})

describe('review A11: queues, overflow and superseded runs', () => {
  test('stationQueues and pipelineBoard cap what is drawn per station', () => {
    const s = createPipeline({ cache: true, parallelJobs: true, gate: 'deployment' })
    for (let i = 0; i < 6; i++) {
      commit(s, 'ok')
      runPipelineUntil(s, s.t + 10)
    }
    runPipelineUntil(s, 400)
    const q = stationQueues(s)
    assert.deepEqual(q.staging.waiting, [2, 3, 4, 5, 6])
    assert.deepEqual(q.e2e.running, [1])
    const board = pipelineBoard(s, { maxPerStation: 2 })
    assert.equal(board.overflow.staging, 3)
    assert.equal(pipelineView(s, { maxPerStation: 2 }).length, board.runs.length)
    assert.ok(s.events.some((e) => e.kind === 'staging-queued' && e.text === '#2 čeka staging iza #1'))
  })

  test('environmentConcurrency „supersede”: a newer waiting run cancels the older one', () => {
    const s = createPipeline({ cache: true, parallelJobs: true, gate: 'deployment', environmentConcurrency: 'supersede' })
    const runs = []
    for (let i = 0; i < 30; i++) {
      runs.push(commit(s, 'ok'))
      runPipelineUntil(s, s.t + 10)
    }
    runPipelineUntilIdle(s)
    assert.equal(s.stats.superseded, 28)
    assert.equal(s.stats.deploys, 2)
    assert.equal(runs[1].status, 'cancelled')
    assert.equal(runs[29].status, 'in-prod')
    assert.ok(s.events.some((e) => e.kind === 'superseded'))
  })

  test('registry tag history is bounded', () => {
    const reg = createRegistry()
    const s = createBuildLab({ preset: 'visefazna' })
    buildNow(s)
    pushImage(s, { tags: ['a'] })
    finishPush(s)
    const d = s.image!.digest
    changeCode(s)
    buildNow(s)
    pushImage(s, { tags: ['b'] })
    finishPush(s)
    for (let i = 0; i < MAX_TAG_HISTORY + 50; i++) setTag(s.registry, 'klopa-web', 'a', i % 2 ? d : s.image!.digest, i)
    assert.equal(s.registry.tagHistory.length, MAX_TAG_HISTORY)
    assert.equal(reg.tagHistory.length, 0)
  })
})

describe('review A12: stepping a discrete-event model', () => {
  test('nextEventTime / stepToNextEvent jump to the next event; simNow gives smooth progress', () => {
    const s = createPipeline({ gate: 'deployment' })
    assert.equal(nextEventTime(s), null)
    assert.deepEqual(stepToNextEvent(s), [])
    assert.equal(s.t, 0)
    const r = commit(s, 'ok')
    assert.equal(nextEventTime(s), 30)
    stepToNextEvent(s)
    assert.equal(s.t, 30)
    assert.equal(r.jobs.lint.status, 'passed')
    let produced: string[] = []
    for (let i = 0; i < 20 && !produced.includes('prod'); i++) produced = stepToNextEvent(s).map((e) => e.kind)
    assert.equal(r.status, 'in-prod')
    stepPipeline(s, 0.25) // half a fixed step: t stays, simNow moves
    assert.equal(simNow(s), s.t + 0.25)
    const t = createPipeline({ gate: 'deployment' })
    const run = commit(t, 'ok')
    stepPipeline(t, 10.25)
    assert.equal(t.t, 10)
    assert.ok(runPosition(run, simNow(t)).progress > runPosition(run, t.t).progress)
    assert.equal(PIPELINE_DT, 0.5)
  })

  test('lab: buildView({ at: labNow }) between fixed steps', () => {
    const s = createBuildLab({ preset: 'dobar-redoslijed' })
    startBuild(s)
    stepBuildLab(s, 20.02)
    const v = buildView(s, { at: labNow(s) })!
    assert.ok(v.elapsed > buildView(s)!.elapsed)
    assert.ok(v.elapsed <= v.total)
  })
})

describe('review A13: animated pull', () => {
  test('startPull downloads layers over time, then the server runs the image', () => {
    const s = createBuildLab({ preset: 'ivin-prvi' })
    buildNow(s)
    pushImage(s)
    finishPush(s)
    const p = startPull(s, 'a')!
    assert.ok(p.seconds > 70 && p.seconds < 74)
    assert.equal(startPull(s, 'a'), null, 'one pull per server at a time')
    stepBuildLab(s, 10)
    const v = pullView(s)[0]
    assert.equal(v.status, 'running')
    assert.ok(v.layers[0].progress > 0 && v.layers[0].progress < 1)
    assert.equal(s.servers[0].running, null)
    assert.ok(s.servers[0].pulling)
    stepBuildLab(s, 70)
    assert.equal(s.servers[0].running!.digest, s.image!.digest)
    assert.equal(s.servers[0].pulling, null)
    assert.equal(pullView(s)[0].status, 'done')
    assert.equal(startPull(s, 'zz'), null)
    assert.equal(startPull(s, 'b', 'nema')!.digest, null)
  })
})

describe('review A14 + A15: event ids and explanations', () => {
  test('ids are unique and increasing, also after the cap', () => {
    const s = createBuildLab()
    changeCode(s)
    changeCode(s)
    assert.notEqual(s.events[0].id, s.events[1].id)
    const ev: EngineEvent[] = []
    for (let i = 0; i < 120; i++) pushEvent(ev, 0, 'x', 'isto')
    assert.equal(ev.length, MAX_EVENTS)
    assert.equal(new Set(ev.map((e) => e.id)).size, MAX_EVENTS)
    assert.equal(ev.at(-1)!.id, 120)
  })

  test('pipeline explains cold builds, skipped tests and staging; the lab counts steps, not layers', () => {
    const s = createPipeline({ gate: 'deployment', skipTests: true })
    commit(s, 'ok', { changesDeps: true })
    runPipelineUntilIdle(s)
    const kinds = s.events.map((e) => e.kind)
    for (const k of ['tests-skipped', 'build-cache', 'staging-done']) assert.ok(kinds.includes(k), k)
    assert.match(s.events.find((e) => e.kind === 'build-cache')!.text, /hladna izgradnja 4 min – predmemorija isključena/)
    const lab = createBuildLab({ preset: 'dobar-redoslijed' })
    buildNow(lab)
    changeCode(lab)
    buildNow(lab)
    assert.match(lab.events.at(-1)!.text, /· 4 koraka iz predmemorije ·/)
  })
})

describe('review A16 + A17: L21 starting state; Docker errors in „Vrata u zidu”', () => {
  test('tvornica: production is Davor\'s laptop image tagged latest, untested, unknown commit; first release 2.0.1', () => {
    const s = createPipeline(PIPELINE_PRESETS.tvornica)
    assert.equal(s.prod.version, 'latest')
    assert.equal(s.prod.builtBy, 'laptop')
    assert.equal(s.prod.tested, false)
    assert.equal(s.prod.commit, null)
    assert.equal(s.registry.tags.get('klopa-api:latest'), s.prod.digest)
    assert.equal(nextPatchVersion(s), '2.0.1')
    const r = commit(s, 'ok', { version: 'next-patch' })
    assert.equal(r.commit.version, '2.0.1')
    assert.equal(nextPatchVersion(s), '2.0.2')
    assert.equal(createPipeline().prod.builtBy, 'ci')
    assert.equal(nextPatchVersion(createPipeline()), '1.4.1')
  })

  test('port conflict returns Docker\'s message and logs it; setListenAddr swaps gunicorn\'s bind', () => {
    const s = createBuildLab({ preset: 'api-dobar' })
    const none = tryRunContainer(s)
    assert.ok('error' in none)
    buildNow(s)
    runContainer(s, { publish: [[8080, 8000]] })
    const r = tryRunContainer(s, { publish: [[8080, 8000]] })
    assert.ok('error' in r && /port is already allocated/.test(r.error))
    assert.equal(s.events.at(-1)!.kind, 'run-failed')
    assert.equal(setListenAddr(s, '127.0.0.1'), true)
    assert.ok(s.cards.some((c) => c.id === 'api-cmd-local'))
    assert.equal(setListenAddr(s, '127.0.0.1'), false, 'already there')
    buildNow(s)
    for (const c of [...s.containers]) removeContainer(s, c.id)
    runContainer(s, { publish: [[8080, 8000]] })
    assert.equal(curlFromHost(s, 8080).outcome, 'reset')
    assert.equal(setListenAddr(s, '0.0.0.0'), true)
    assert.equal(setListenAddr(createBuildLab({ preset: 'visefazna' }), '127.0.0.1'), false)
    assert.equal(swapCard(s, 'nope', 'api-cmd'), false)
  })
})

// =============================================================================================
// Review round 2 (model + API lenses): regression tests, one per fixed finding
// =============================================================================================

describe('round 2 – gate „samo CI” never deploys', () => {
  test('switching delivery → ci while a run is in e2e: it stops in the registry, no automatic deploy, the goal stays open', () => {
    const s = createPipeline({ ...PIPELINE_PRESETS['brza-tvornica'], gate: 'delivery' })
    const first = commit(s, 'ok')
    runPipelineUntilIdle(s)
    approve(s)
    runPipelineUntilIdle(s)
    assert.equal(first.status, 'in-prod')
    const r = commit(s, 'ok')
    runPipelineUntil(s, s.t + 300)
    assert.equal(runPosition(r, s.t).station, 'e2e')
    setGate(s, 'ci')
    runPipelineUntilIdle(s)
    assert.equal(r.status, 'in-registry')
    assert.equal(r.jobs.gate.status, 'skipped')
    assert.equal(r.jobs.prod.status, 'skipped')
    assert.equal(r.jobs.gate.note, 'samo CI')
    assert.equal(r.approvedBy, null)
    assert.equal(s.stats.deploys, 1, 'only the approved first run')
    assert.equal(s.stats.autoDeploys, 0)
    assert.equal(pipelineGoals(s).deliveryThenDeployment, false, 'continuous deployment was never chosen')
    assert.ok(s.events.some((e) => e.kind === 'ci-only' && e.text.startsWith(`#${r.id}: samo CI`)))
  })

  test('deployment → ci: runs queued for staging or production, and runs in staging/e2e, are not deployed', () => {
    // queued for staging behind another run
    const q = createPipeline({ gate: 'deployment', cache: true, parallelJobs: true })
    const a = commit(q, 'ok')
    runPipelineUntil(q, 5)
    const b = commit(q, 'ok')
    runPipelineUntil(q, 200)
    assert.equal(a.jobs.staging.status, 'running')
    assert.equal(b.jobs.staging.status, 'waiting')
    setGate(q, 'ci')
    runPipelineUntilIdle(q)
    assert.deepEqual([a.status, b.status], ['in-registry', 'in-registry'])
    assert.equal(b.jobs.staging.status, 'skipped', 'never deployed to staging either')
    assert.equal(q.stats.deploys, 0)
    // queued for the production lock while another production deploy (a slow rebuild) runs
    const p = createPipeline({ gate: 'deployment', skipTests: true })
    rebuildForProduction(p)
    const c = commit(p, 'ok')
    runPipelineUntil(p, 10)
    const d = commit(p, 'ok')
    runPipelineUntil(p, 500)
    assert.equal(c.jobs.prod.status, 'running')
    assert.equal(d.jobs.prod.status, 'waiting')
    setGate(p, 'ci')
    runPipelineUntilIdle(p)
    assert.equal(c.status, 'in-prod', 'a deploy already running finishes')
    assert.equal(d.status, 'in-registry')
    assert.equal(p.stats.deploys, 1)
  })
})

describe('round 2 – red main: the team reverts, the next commit says it inherits', () => {
  test('tvornica preset: a teammate reverts the failing commit after 1 min; a commit pushed meanwhile inherits the bug', () => {
    assert.equal(PIPELINE_PRESETS.tvornica.teamRevertAfterSec, 60)
    assert.equal(createPipeline().config.teamRevertAfterSec, null, 'the bare model: nobody reacts')
    const s = createPipeline(PIPELINE_PRESETS.tvornica)
    setGate(s, 'deployment')
    const bad = commit(s, 'failing-test')
    runPipelineUntil(s, 215)
    assert.equal(bad.status, 'failed')
    assert.equal(bad.failedBy!.commitId, bad.id)
    assert.equal(mainStatus(s).cause!.commitId, bad.id)
    assert.equal(s.events.at(-1)!.kind, 'revert-planned')
    assert.match(s.events.at(-1)!.text, /^Kolega za 1 min vraća 0c242ba \(git revert\)/)
    const during = commit(s, 'ok')
    assert.equal(s.events.at(-1)!.kind, 'inherits')
    assert.equal(s.events.at(-1)!.text, `#${during.id} nasljeđuje grešku koju test hvata iz 0c242ba – main je crven dok se 0c242ba ne vrati (git revert) ili ispravi`)
    runPipelineUntilIdle(s)
    assert.equal(during.status, 'failed', 'pushed before the revert landed: it contains the bug')
    const rv = s.runs.find((r) => r.commit.type === 'revert')!
    assert.equal(rv.commit.author, 'team')
    assert.equal(rv.createdAt, 270, 'tests failed at 210 s (lint 30 + tests 180), the revert 60 s later')
    assert.equal(rv.status, 'in-prod')
    assert.deepEqual(mainStatus(s), { head: rv.commit.short, defects: [], red: false, cause: null })
    const after = commit(s, 'ok')
    runPipelineUntilIdle(s)
    assert.equal(after.status, 'in-prod', 'one „Pada test” click does not block the „< 10 min” task')
  })

  test('setTeamRevert(null) leaves main red until revertCommit; a revert or fix pushes no „inherits” event', () => {
    const s = createPipeline({ ...PIPELINE_PRESETS['brza-tvornica'], gate: 'deployment' })
    setTeamRevert(s, null)
    commit(s, 'vulnerable-base')
    runPipelineUntilIdle(s)
    assert.equal(s.pendingReverts.length, 0)
    assert.equal(mainStatus(s).red, true)
    revertCommit(s)
    assert.ok(!s.events.some((e) => e.kind === 'inherits'))
    runPipelineUntilIdle(s)
    assert.equal(mainStatus(s).red, false)
    setTeamRevert(s, Number.NaN)
    assert.equal(s.config.teamRevertAfterSec, 60, 'NaN → default')
  })
})

describe('round 2 – a flaky test stays in the suite until it is reverted or fixed', () => {
  test('the next commits inherit it; only a revert of that commit removes it; it never makes production „bad”', () => {
    const s = createPipeline({ gate: 'deployment', flakyFailProb: 1, flakyRetries: 0 })
    const f = commit(s, 'flaky')
    runPipelineUntilIdle(s)
    assert.equal(f.status, 'failed')
    assert.equal(f.failedBy!.kind, 'flaky')
    const next = commit(s, 'ok')
    runPipelineUntilIdle(s)
    assert.equal(next.commit.flaky, true)
    assert.equal(next.status, 'failed')
    assert.equal(next.failReason, `nestabilan test pao 1 puta (test iz ${f.commit.short})`)
    assert.equal(mainStatus(s).cause!.kind, 'flaky')
    const rv = revertCommit(s, f.id)
    assert.equal(rv.commit.message, 'Revert „Test košarice ovisi o satu”')
    runPipelineUntilIdle(s)
    assert.equal(rv.status, 'in-prod')
    assert.equal(rv.commit.flaky, false)
    // a flaky test that ships (tests skipped) is not a bad deploy: no incident, CFR 0
    const k = createPipeline({ gate: 'deployment', skipTests: true })
    commit(k, 'flaky')
    runPipelineUntilIdle(k)
    assert.equal(k.stats.badInProd, 0)
    assert.equal(k.incidents.length, 0)
    assert.equal(dora(k).changeFailureRate, 0)
  })

  test('two flaky tests in the suite: an attempt fails with 1 − 0,7² = 51 % (seeded); trust only recovers once they are gone', () => {
    const s = createPipeline({ gate: 'ci', cache: true, parallelJobs: true, flakyRetries: 0, seed: 42 })
    commit(s, 'flaky')
    commit(s, 'flaky')
    const runs = []
    for (let i = 0; i < 400; i++) runs.push(commit(s, 'ok'))
    runPipelineUntilIdle(s)
    const ratio = runs.filter((r) => r.status === 'failed').length / runs.length
    assert.ok(Math.abs(ratio - 0.51) < 0.06, `fail ratio ${ratio}`)
    const t0 = s.trust
    revertCommit(s)
    revertCommit(s)
    const clean = commit(s, 'ok')
    runPipelineUntilIdle(s)
    assert.equal(clean.commit.flaky, false)
    assert.ok(s.trust > t0, 'a clean first-attempt pass rebuilds trust')
  })
})

describe('round 2 – the node keeps the images it ran', () => {
  test('a rollback downloads nothing; `against: previous` shows the old one-step diff', () => {
    for (const cache of [true, false]) {
      const s = createPipeline({ gate: 'deployment', cache, parallelJobs: true, skipTests: true })
      commit(s, 'ok')
      runPipelineUntilIdle(s)
      commit(s, 'failing-test')
      runPipelineUntilIdle(s)
      assert.deepEqual(s.prodHistory.map((h) => h.kind), ['initial', 'deploy', 'deploy', 'rollback'])
      const d = lastPromotionDiff(s)!
      assert.equal(d.kind, 'rollback')
      assert.equal(d.to, s.prodHistory[1].digest, 'back to the good digest the node ran minutes ago')
      assert.equal(d.changed, 0)
      assert.equal(d.downloadMB, 0)
      assert.equal(d.shared, 7)
      const prev = lastPromotionDiff(s, { against: 'previous' })!
      assert.equal(prev.changed, cache ? 1 : 2)
      close(prev.downloadMB, cache ? 0.90855 : 25.40855)
      assert.equal(d.changedVsPrevious, prev.changed)
    }
  })
})

describe('round 2 – execution-time errors only on a cache miss', () => {
  test('npm E401 never fails a cached `npm ci`; adding the private package edits package*.json, so npm ci really runs', () => {
    // planBuild level: same cache, same key → CACHED even though the token is missing
    const s = createBuildLab({ preset: 'dobar-redoslijed' })
    buildNow(s)
    const plan = planBuild(s.cards, { context: labContext(s), cache: s.cache, localBases: s.localBases, buildId: 99, now: 0, privateNpm: true })
    assert.equal(plan.ok, true)
    assert.equal(plan.steps.find((x) => x.id === 'npm-ci')!.status, 'cached')
    // lab level: the private dependency changes package.json → COPY package*.json misses → npm ci runs → E401
    setPrivateNpm(s, true)
    assert.ok(s.events.some((e) => e.kind === 'private-dep'))
    const b = buildNow(s)!
    assert.equal(b.ok, false)
    assert.match(b.error!, /E401/)
    const step = s.build!.plan.steps.find((x) => x.id === 'npm-ci')!
    assert.equal(step.reason, 'parent-rebuilt', 'not „nova ili premještena naredba”: nothing moved')
    assert.deepEqual(b.firstRebuilt!.changedFiles, ['package-lock.json', 'package.json'])
    setNpmTokenVia(s, 'secret-mount')
    assert.equal(buildNow(s)!.ok, true)
  })
})

describe('round 2 – „Kopiraj .env pa ga obriši” changes only the secret', () => {
  test('laboratorij + multi-stage: USER root … RUN rm .env, then USER 101 again; undo puts the USER card back in the tray', () => {
    const s = createBuildLab({ preset: 'laboratorij' })
    setCardOrder(s, ['from-build', 'workdir', 'copy-pkg', 'npm-ci', 'copy-all', 'npm-build', 'cmd-node'])
    setMultiStage(s, true)
    setDockerignore(s, true)
    buildNow(s)
    assert.equal(labGoalsCurrent(s).nonRoot, true)
    injectEnvSecret(s)
    const ids = s.cards.map((c) => c.id)
    assert.deepEqual(ids.slice(ids.indexOf('copy-dist')), ['copy-dist', 'user-root', 'copy-env', 'rm-env', 'user-nginx', 'cmd-nginx'])
    assert.deepEqual(s.envTrick!.restoreUser, { id: 'user-nginx', fromTray: true })
    assert.equal(s.events.find((e) => e.kind === 'env-trick')!.text, 'Dodano: USER root, COPY .env pa RUN rm .env, USER 101')
    const r = buildNow(s)!
    assert.equal(r.ok, true)
    assert.equal(s.image!.config.user, '101')
    assert.equal(labGoalsCurrent(s).nonRoot, true, 'the image still runs as UID 101')
    assert.ok(findSecrets(s.image!).some((e) => e.hiddenByWhiteout), 'the key is still in the lower layer')
    assert.equal(removeEnvSecret(s), true)
    assert.ok(!s.cards.some((c) => c.id === 'user-nginx'))
    assert.ok(s.tray.some((c) => c.id === 'user-nginx'))
  })

  test('a stage whose USER card is already used elsewhere gets a new restore card; undo removes it', () => {
    const s = createBuildLab({ preset: 'visefazna' })
    // USER 101 moved above COPY --from: nothing switches back after the break-it's USER root
    moveCard(s, 'user-nginx', s.cards.findIndex((c) => c.id === 'copy-dist'))
    injectEnvSecret(s)
    assert.equal(s.envTrick!.restoreUser!.id, ENV_TRICK_RESTORE_USER_ID)
    assert.equal(s.cards.filter((c) => c.text === 'USER 101').length, 2)
    buildNow(s)
    assert.equal(s.image!.config.user, '101')
    removeEnvSecret(s)
    assert.ok(!s.cards.some((c) => c.id === ENV_TRICK_RESTORE_USER_ID))
    assert.ok(!s.tray.some((c) => c.id === ENV_TRICK_RESTORE_USER_ID))
  })
})

describe('round 2 – L08 tasks are sticky', () => {
  test('once reached, a task stays ticked: bad-order rebuild, multi-stage off, the .env break-it, 25 more builds', () => {
    const s = createBuildLab({ preset: 'visefazna' })
    buildNow(s)
    changeCode(s)
    buildNow(s)
    assert.deepEqual(labGoals(s), { rebuildUnder5s: true, imageUnder200MB: true, foundKey: false, nonRoot: true })
    assert.deepEqual(s.goalsReached, { rebuildUnder5s: s.builds[1].startedAt, imageUnder200MB: 0, foundKey: null, nonRoot: 0 })
    moveCard(s, 'copy-all', 2) // COPY . . before npm ci again
    buildNow(s)
    changeCode(s)
    assert.equal(buildNow(s)!.seconds, 45.2, 'COPY . . 1 + COPY package*.json 1 + npm ci 40 + build 3 + COPY --from 0,2')
    setMultiStage(s, false)
    buildNow(s)
    assert.deepEqual(labGoalsCurrent(s), { rebuildUnder5s: false, imageUnder200MB: false, foundKey: false, nonRoot: true })
    for (let i = 0; i < 25; i++) {
      changeCode(s)
      buildNow(s)
    }
    assert.deepEqual(labGoals(s), { rebuildUnder5s: true, imageUnder200MB: true, foundKey: false, nonRoot: true })
    // warm start: a preset that already meets a task shows it at once
    assert.equal(labGoals(createBuildLab({ preset: 'visefazna', warm: true })).imageUnder200MB, true)
    assert.equal(labGoals(createBuildLab({ preset: 'laboratorij', warm: true })).imageUnder200MB, false)
  })
})

describe('round 2 – „Višefazna izgradnja” follows the Dockerfile', () => {
  test('dragging the runtime FROM in or out flips multiStage and the USER/CMD variants; the tray offers the runtime cards', () => {
    const lab = createBuildLab({ preset: 'laboratorij' })
    assert.deepEqual(lab.tray.map((c) => c.id), ['user-node', 'from-runtime', 'copy-dist'])
    assert.equal(isMultiStage(lab), false)
    setMultiStage(lab, true)
    assert.deepEqual(lab.tray.map((c) => c.id), ['user-nginx'], 'taken from the tray; the USER slot follows the final stage')
    setMultiStage(lab, false)
    assert.deepEqual(lab.tray.map((c) => c.id).sort(), ['copy-dist', 'from-runtime', 'user-node'])
    const v = createBuildLab({ preset: 'visefazna' })
    assert.equal(removeCard(v, 'from-runtime'), true)
    assert.equal(v.multiStage, false)
    assert.equal(isMultiStage(v), false)
    assert.deepEqual(v.cards.slice(-2).map((c) => c.id), ['user-node', 'cmd-node'], 'one stage again: node user and npm start')
    addCard(v, 'from-runtime', v.cards.findIndex((c) => c.id === 'copy-dist'))
    assert.equal(v.multiStage, true)
    assert.deepEqual(v.cards.map((c) => c.id), LAB_PRESETS.visefazna.cards)
    assert.equal(buildNow(v)!.sizeMB, 50)
    // the toggle from a hand-made half state re-inserts the runtime cards in order
    const h = createBuildLab({ preset: 'laboratorij' })
    addCard(h, 'copy-dist', 0)
    setMultiStage(h, true)
    assert.deepEqual(h.cards.map((c) => c.id), ['from-build', 'workdir', 'copy-pkg', 'copy-all', 'npm-ci', 'npm-build', 'from-runtime', 'copy-dist', 'cmd-nginx'])
    assert.equal(createBuildLab({ preset: 'api-dobar' }).multiStage, false)
  })
})

describe('round 2 – predictions, speeds, approvals, leaks, the L24 helper', () => {
  test('predictLeadTime: a cache switched on a moment ago is cold (860 s), then warm (540 s); pure', () => {
    const s = createPipeline(PIPELINE_PRESETS.tvornica)
    setGate(s, 'deployment')
    setPipelineOption(s, 'cache', true)
    setPipelineOption(s, 'parallelJobs', true)
    const before = JSON.stringify({ nonce: s.nextBuildNonce, runs: s.runs.length, events: s.events.length, caches: [...s.ciCaches.keys()] })
    const p = predictLeadTime(s)
    assert.equal(JSON.stringify({ nonce: s.nextBuildNonce, runs: s.runs.length, events: s.events.length, caches: [...s.ciCaches.keys()] }), before)
    assert.equal(p.seconds, 860)
    assert.deepEqual(p.cold, { test: true, build: true, reason: 'predmemorija maina je prazna' })
    assert.equal(idealLeadTime({ parallelJobs: true, cache: true, skipTests: false }), 540, 'the best case')
    const a = commit(s, 'ok')
    runPipelineUntilIdle(s)
    assert.equal(a.leadTimeSec, p.seconds)
    const q = predictLeadTime(s)
    assert.equal(q.seconds, 540)
    assert.deepEqual(q.cold, { test: false, build: false, reason: null })
    const b = commit(s, 'ok')
    runPipelineUntilIdle(s)
    assert.equal(b.leadTimeSec, q.seconds)
    assert.equal(predictLeadTime(s, { changesDeps: true }).seconds, 860)
    assert.equal(predictLeadTime(s, { changesDeps: true }).cold.reason, 'promijenjen requirements.txt')
    assert.deepEqual([predictLeadTime(s, { type: 'failing-test' }).failsAt, predictLeadTime(s, { type: 'failing-test' }).seconds], ['test', 60])
    assert.deepEqual([predictLeadTime(s, { trigger: 'pr' }).until, predictLeadTime(s, { trigger: 'pr' }).seconds], ['checks', idealPrChecksTime({ parallelJobs: true, cache: true, skipTests: false })])
    setGate(s, 'ci')
    assert.deepEqual([predictLeadTime(s).until, predictLeadTime(s).seconds], ['registry', 180])
    setGate(s, 'delivery')
    assert.match(predictLeadTime(s).excludes, /čekanje na ljudskim vratima/)
  })

  test('recommended speeds: at 60× a whole commit is ≈ 9–15 s of real time; the lab keeps its own', () => {
    assert.deepEqual([...PIPELINE_RECOMMENDED_SPEEDS], [30, 60, 120])
    assert.equal(PIPELINE_DEFAULT_SPEED, 60)
    assert.ok(PIPELINE_RECOMMENDED_SPEEDS.includes(PIPELINE_DEFAULT_SPEED))
    const real = (sec: number) => sec / PIPELINE_DEFAULT_SPEED
    assert.ok(real(idealLeadTime({ parallelJobs: true, cache: true, skipTests: false })) === 9)
    assert.ok(real(idealLeadTime({ parallelJobs: false, cache: false, skipTests: false })) < 15)
    assert.ok(DEFAULT_DURATIONS.lint / PIPELINE_DEFAULT_SPEED <= 1, 'the first station finishes within a second')
    assert.deepEqual([...LAB_RECOMMENDED_SPEEDS], [1, 4, 10])
  })

  test('approveAll clears the gate queue in one click; the stream says when it will wait', () => {
    const s = createPipeline(PIPELINE_PRESETS.tvornica)
    startCommitStream(s)
    assert.equal(s.events.find((e) => e.kind === 'stream')!.text, 'Tok od 20 commitova, jedan svakih 6 min – izdanja čekaju na ljudskim vratima (Odobri sve)')
    assert.equal(approveAll(s), 0)
    let approved = 0
    for (let i = 0; i < 40 && !(streamStatus(s)!.done && waitingAtGate(s).length === 0); i++) {
      runPipelineUntilIdle(s)
      const lastId = s.events.at(-1)!.id
      const n = approveAll(s)
      approved += n
      if (n > 0) assert.equal(s.events.filter((e) => e.id > lastId && e.kind === 'approve').length, 1, 'one event per click')
    }
    const st = streamStatus(s)!
    assert.equal(st.done, true)
    assert.equal(st.deployed, approved)
    assert.equal(st.badInProd, 0)
    assert.equal(pipelineGoals(s).zeroBadOf20, true)
    const auto = createPipeline({ ...PIPELINE_PRESETS.tvornica, gate: 'deployment' })
    startCommitStream(auto)
    assert.ok(!auto.events.find((e) => e.kind === 'stream')!.text.includes('čekaju'))
  })

  test('OIDC leak: by default the newest live token (countdown); `running-job` shows that tests hold nothing', () => {
    const s = createPipeline({ ...PIPELINE_PRESETS['brza-tvornica'], credential: 'oidc', gate: 'deployment' })
    commit(s, 'ok')
    runPipelineUntil(s, 200)
    commit(s, 'ok')
    runPipelineUntil(s, 215) // run 2 is in lint/tests; run 1's staging token (180 s) still lives
    const l = leakCredential(s)
    assert.equal(l.station, 'staging')
    assert.equal(l.issuedAt, 180)
    assert.equal(l.validUntil, 780)
    assert.match(s.events.at(-1)!.text, /^Procurio OIDC token posla Staging – istječe sam za 9 min 25 s$/)
    const least = leakCredential(s, { target: 'running-job' })
    assert.equal(least.station, 'test')
    assert.equal(least.tokenId, null)
    assert.equal(leakCredential(s, { target: 'push' }).tokenKind, 'oidc')
  })

  test('releaseDayJourney: deterministic L24 path – production 11:59:40, 0,9 MB; a 30 s merge delay misses 12:00', () => {
    const j = releaseDayJourney()
    assert.equal(j.prodAt, '11:59:40')
    assert.equal(j.prodAtSec, 700)
    close(j.downloadMB, 0.90855)
    assert.deepEqual([j.changedLayers, j.totalLayers], [1, 7])
    assert.notEqual(j.digest, j.prDigest, "'gha' cache: main rebuilds COPY . ., so the promoted digest is the one built on main")
    assert.deepEqual(j.entries.filter((e) => e.phase === 'pr').map((e) => e.station), ['lint', 'test', 'build', 'scan'])
    assert.equal(j.entries.find((e) => e.phase === 'main' && e.station === 'prod')!.end, 700)
    assert.equal(releaseDayJourney().digest, j.digest, 'same seed → same digest')
    assert.equal(releaseDayJourney({ mergeDelaySec: 30 }).prodAt, '12:00:10')
    const reg = releaseDayJourney({ config: { cacheBackend: 'registry' } })
    assert.equal(reg.digest, reg.prDigest, 'shared registry cache + unchanged main: the PR digest goes to production')
  })

  test('logEvents: unique keys for identical events, time labels for minutes and the wall clock', () => {
    const s = createBuildLab()
    changeCode(s)
    changeCode(s)
    const rows = logEvents(s.events)
    assert.equal(rows.length, 2)
    assert.notEqual(rows[0].key, rows[1].key)
    assert.equal(rows[0].timeLabel, '0 s')
    const p = createPipeline(PIPELINE_PRESETS['dan-izdanja'])
    commit(p, 'ok')
    runPipelineUntilIdle(p)
    assert.equal(logEvents(p.events, fmtSeconds)[0].timeLabel, '9 min')
    assert.equal(logEvents(p.events, (t) => wallClock(p, t))[0].timeLabel, '11:57')
    assert.equal(logEvents(p.events, fmtSeconds, Number.NaN).length, Math.min(6, p.events.length), 'NaN → the default 6')
    assert.deepEqual(logEvents(p.events, fmtSeconds, 0), [])
  })
})

describe('round 2 – the README cannot drift from the engine', () => {
  const readme = readFileSync(new URL('./README.md', import.meta.url), 'utf8')

  test('every runtime export is documented', () => {
    const missing = Object.keys(engineApi).filter((k) => !readme.includes(`\`${k}`) && !readme.includes(`${k}(`))
    assert.deepEqual(missing, [])
  })

  test('the §4 rows match what the engine produces', () => {
    const row = (scenario: string, value: string) => `| ${scenario} | ${value} |`
    const rows: string[] = []
    // L08
    const bad = createBuildLab({ preset: 'los-redoslijed' })
    const badCycle = cycle(bad)
    rows.push(row('Code edit, `COPY . .` before `npm ci`', `**${fmtSeconds(badCycle.code.seconds)}**`))
    const good = cycle(createBuildLab({ preset: 'dobar-redoslijed' }))
    rows.push(row('Code edit, correct order (single stage)', `**${fmtSeconds(good.code.seconds)}**`))
    const iva = createBuildLab({ preset: 'ivin-prvi' })
    buildNow(iva)
    rows.push(row('Image: Iva (`node:24`, no `.dockerignore`)', `**${fmtMB(iva.image!.sizeMB)}** (${String(iva.image!.sizeMB).replace('.', ',')} MB)`))
    const multi = createBuildLab({ preset: 'visefazna' })
    buildNow(multi)
    rows.push(row('Image: multi-stage (`nginx-unprivileged` 47 MB + dist 3 MB)', `**${fmtMB(multi.image!.sizeMB)}**`))
    // L21 lead times
    const lead = (o: { parallelJobs: boolean; cache: boolean }) => {
      const s = createPipeline({ ...o, gate: 'deployment' })
      commit(s, 'ok')
      runPipelineUntilIdle(s)
      return s.runs[0].leadTimeSec!
    }
    rows.push(row('Sequential, no cache', `**${fmtSeconds(lead({ parallelJobs: false, cache: false }))}** (${lead({ parallelJobs: false, cache: false })} s)`))
    rows.push(row('Parallel + cache', `**${fmtSeconds(lead({ parallelJobs: true, cache: true }))}** (${lead({ parallelJobs: true, cache: true })} s)`))
    // stream
    const stream = (skipTests: boolean) => {
      const s = createPipeline({ parallelJobs: true, cache: true, gate: 'deployment', skipTests })
      startCommitStream(s, { count: 20 })
      runPipelineUntilIdle(s)
      return { st: streamStatus(s)!, d: dora(s), s }
    }
    const safe = stream(false)
    rows.push(row('20-commit stream, seed 42, all checks', `${safe.st.deployed} deploys, **${safe.st.badInProd} bad in production**, median lead time ${fmtSeconds(safe.d.leadTimeMedianSec!)}, ${safe.st.reverts} team reverts`))
    const risky = stream(true)
    const cfr = Math.round(risky.d.changeFailureRate! * 100)
    rows.push(row('Same stream with skip tests', `${risky.s.stats.deploys} deploys, ${risky.s.stats.badInProd} bad, CFR ${cfr} %, median recovery ${fmtSeconds(risky.d.recoveryMedianSec!)}`))
    // promotion and rollback
    const j = releaseDayJourney()
    rows.push(row('L24: production moves 2.0.1 → 2.0.2 with the cache (`releaseDayJourney()`)', `node downloads ${j.changedLayers} of ${j.totalLayers} layers, **${fmtMB(j.downloadMB)}**; production at ${j.prodAt}`))
    const rb = createPipeline({ gate: 'deployment', cache: true, parallelJobs: true, skipTests: true })
    commit(rb, 'ok')
    runPipelineUntilIdle(rb)
    commit(rb, 'failing-test')
    runPipelineUntilIdle(rb)
    const rd = lastPromotionDiff(rb)!
    rows.push(row('Rollback to the digest production ran before', `node downloads ${rd.changed} of ${rd.layers.length} layers (${fmtMB(rd.downloadMB)})`))
    // merge digest by cache backend
    rows.push(row("PR → merge, `cacheBackend: 'gha'` (default, `dan-izdanja`)", j.digest === j.prDigest ? 'same digest' : 'new digest (main rebuilds `COPY . .`)'))
    const r = releaseDayJourney({ config: { cacheBackend: 'registry' } })
    rows.push(row("PR → merge, `cacheBackend: 'registry'`, main unchanged", r.digest === r.prDigest ? 'same digest' : 'new digest'))
    // prediction
    const pz = createPipeline(PIPELINE_PRESETS.tvornica)
    setGate(pz, 'deployment')
    setPipelineOption(pz, 'cache', true)
    setPipelineOption(pz, 'parallelJobs', true)
    rows.push(row('First commit after switching the cache on', `${fmtSeconds(predictLeadTime(pz).seconds)} (\`predictLeadTime\`), best case ${fmtSeconds(idealLeadTime({ parallelJobs: true, cache: true, skipTests: false }))} (\`idealLeadTime\`)`))
    const missing = rows.filter((x) => !readme.includes(x))
    assert.deepEqual(missing, [], 'README §4 rows that no longer match the engine')
    assert.ok(!/\(\d+ tests\)/.test(readme), 'no hard-coded test count')
  })
})
