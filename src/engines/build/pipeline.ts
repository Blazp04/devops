/**
 * E4 „Tvornica” – L21 „Tvornica commitova” (and the L24 commit path) as a discrete-event model.
 *
 * lint → testovi → izgradnja slike → skeniranje → registar (digest) → staging → e2e → [ljudska vrata] → produkcija
 *
 * - Durations are illustrative (L21 model): lint 30 s, tests 3 min (1 min with dependency cache), image build
 *   4 min cold / 40 s with layer cache, scan 1 min, push 20 s, staging 1 min, e2e 4 min, production 1 min.
 * - „Paralelni poslovi” runs lint and tests together; „Predmemorija” turns on the dependency + layer cache.
 * - main is cumulative (one mainline, Fowler): a commit's tree contains every earlier commit on main. A defect
 *   (a bug the tests catch, a vulnerable FROM, a committed secret) stays in every later tree – and keeps the line
 *   red – until a 'revert' or 'fix' commit removes it. A pull request runs on main + its own change and changes
 *   main only when merged.
 * - A failing station stops the line (fail fast). Scan blocks vulnerable bases and secrets before push.
 * - The image is built ONCE; its digest (sha256 of the manifest) is promoted staging → production.
 * - Gate: 'ci' stops after push; 'delivery' waits for a human click; 'deployment' goes on automatically.
 * - Events are processed at their exact times inside fixed steps, so lead times are exact (e.g. 9 min 0 s).
 */
import { createRng, percentile, plural, type Rng } from '../../kit/sim/math.ts'
import { advanceClock, clean, clockLabel, createClock, fmtSeconds, num, pushEvent, shortDigest, type Clock, type CompressedValue, type EngineEvent } from './common.ts'
import { applyPlanWrites, BASE_IMAGES, createCache, patchedBase, planBuild, type BuildCache, type BuildPlan, type CacheReason, type ContextFile, type Image, type Instruction } from './image.ts'
import { applyPush, createRegistry, layerDiff, planPush, type Registry } from './registry.ts'
import { PROJECTS } from './projects.ts'
import { sha256Hex } from './sha256.ts'

/** Fixed step of the pipeline model (seconds of simulated time). Use it as `useSimulation({ fixedDt: PIPELINE_DT })`. */
export const PIPELINE_DT = 0.5

/**
 * SimFrame speeds for the pipeline. Durations are minutes (a commit takes 9–15 min of sim time), so at the kit's
 * default 0,5–4× nothing visible happens for minutes. At 60× one real second is one sim minute: the first station
 * finishes in < 1 s and a whole commit in ≈ 9–15 s. Pair it with a „Sljedeći događaj” button (`stepToNextEvent`)
 * instead of SimFrame's 0,25 s step, which is shorter than PIPELINE_DT and shows nothing.
 */
export const PIPELINE_RECOMMENDED_SPEEDS = [30, 60, 120] as const
export const PIPELINE_DEFAULT_SPEED = 60

export type StationId = 'lint' | 'test' | 'build' | 'scan' | 'push' | 'staging' | 'e2e' | 'gate' | 'prod'

export const STATIONS: { id: StationId; label: string }[] = [
  { id: 'lint', label: 'Lint' },
  { id: 'test', label: 'Testovi' },
  { id: 'build', label: 'Izgradnja slike' },
  { id: 'scan', label: 'Skeniranje' },
  { id: 'push', label: 'Registar' },
  { id: 'staging', label: 'Staging' },
  { id: 'e2e', label: 'E2E testovi' },
  { id: 'gate', label: 'Ljudska vrata' },
  { id: 'prod', label: 'Produkcija' },
]
const ORDER: StationId[] = STATIONS.map((s) => s.id)
const stationLabel = (sid: StationId) => STATIONS.find((s) => s.id === sid)?.label ?? sid

export type CommitType = 'ok' | 'failing-test' | 'vulnerable-base' | 'flaky' | 'secret' | 'fix' | 'revert'

export const COMMIT_TYPE_LABEL: Record<CommitType, string> = {
  ok: 'Ispravan',
  'failing-test': 'Pada test',
  'vulnerable-base': 'Ranjiva bazna slika',
  flaky: 'Nestabilan test',
  secret: 'Tajna u kodu',
  fix: 'Ispravak',
  revert: 'git revert',
}

/**
 * What a commit leaves in the tree until someone reverts or fixes it. 'flaky' is a flaky TEST in the suite: it
 * ships nothing broken (never an incident), but every later run of the suite can fail on it.
 */
export type DefectKind = 'bug' | 'vulnerable-base' | 'secret' | 'flaky'

export const DEFECT_LABEL: Record<DefectKind, string> = {
  bug: 'greška koju test hvata',
  'vulnerable-base': 'ranjiva bazna slika',
  secret: 'tajna u kodu',
  flaky: 'nestabilan test',
}

/** The same labels in the accusative („nasljeđuje grešku koju test hvata”). */
const DEFECT_LABEL_ACC: Record<DefectKind, string> = {
  bug: 'grešku koju test hvata',
  'vulnerable-base': 'ranjivu baznu sliku',
  secret: 'tajnu u kodu',
  flaky: 'nestabilan test',
}

const INTRODUCES: Partial<Record<CommitType, DefectKind>> = { 'failing-test': 'bug', 'vulnerable-base': 'vulnerable-base', secret: 'secret', flaky: 'flaky' }

export interface Defect {
  kind: DefectKind
  /** The commit (= run id) that introduced it */
  commitId: number
  short: string
  message: string
  /** Who pushed that commit (the team reverts stream commits on the stream's schedule, others on `teamRevertAfterSec`) */
  author: 'student' | 'stream' | 'team'
}

/** A defect that breaks production when it ships (everything except a flaky test). */
const harmful = (d: Defect) => d.kind !== 'flaky'

/** The content of a commit's tree, as far as the pipeline cares. */
export interface TreeState {
  codeVersion: number
  depsVersion: number
  defects: Defect[]
}

export interface MainBranch extends TreeState {
  /** Newest commit on main (short SHA) – null before the first commit of the session */
  head: string | null
  headId: number | null
}

export type GateMode = 'ci' | 'delivery' | 'deployment'
export type CredentialKind = 'static' | 'oidc'
export type DeployMode = 'push' | 'gitops'
/** GitHub Actions environment concurrency: queue every run, or let a newer pending run replace an older pending one */
export type EnvironmentConcurrency = 'queue' | 'supersede'
/**
 * Where CI keeps its image LAYER cache: 'gha' = Actions cache, scoped per ref; 'registry' = a `type=registry` cache
 * every ref shares. The test job's dependency cache (actions/cache) is always scoped per ref.
 */
export type CacheBackend = 'gha' | 'registry'

export interface PipelineDurations {
  lint: number
  testCold: number
  testCached: number
  buildCold: number
  buildCached: number
  scan: number
  push: number
  staging: number
  e2e: number
  prod: number
  rollback: number
}

/** Illustrative durations from the L21 model, in seconds (label them „ilustrativno”). */
export const DEFAULT_DURATIONS: PipelineDurations = {
  lint: 30,
  testCold: 180,
  testCached: 60,
  buildCold: 240,
  buildCached: 40,
  scan: 60,
  push: 20,
  staging: 60,
  e2e: 240,
  prod: 60,
  rollback: 60,
}

/** Defaults merged with overrides; a missing, NaN, infinite or negative override keeps the default. */
export function resolveDurations(overrides: Partial<PipelineDurations> = {}): PipelineDurations {
  const out = { ...DEFAULT_DURATIONS }
  for (const k of Object.keys(DEFAULT_DURATIONS) as (keyof PipelineDurations)[]) out[k] = num(overrides[k], DEFAULT_DURATIONS[k])
  return out
}

/** OIDC token lifetime: compressed for class. */
export const OIDC_TOKEN_LIFETIME: CompressedValue = {
  simValue: 600,
  realValue: 3600,
  unit: 's',
  label: '10 min (sim) · stvarno: AWS STS zadano 1 h, najmanje 15 min',
}
/** AWS STS minimum session duration (real). */
export const OIDC_REAL_MIN_SECONDS = 900
/** GitHub App installation token (GitOps bot commits to the config repository): compressed like the OIDC token. */
export const GITHUB_APP_TOKEN_LIFETIME: CompressedValue = {
  simValue: 600,
  realValue: 3600,
  unit: 's',
  label: '10 min (sim) · stvarno: 1 h (GitHub App installation token)',
}

/** How production looked before the first pipeline run. */
export interface InitialProd {
  /** Tag production runs (`latest`, `1.4.0`) */
  tag: string
  /** 'laptop' = built by hand with uncommitted changes (L21 hook): a digest no commit and no CI run can reproduce */
  builtBy: 'ci' | 'laptop'
  tested: boolean
  /** Short SHA, or null when nobody knows which commit it is */
  commit: string | null
}

export interface PipelineConfig {
  seed?: number
  /** „Paralelni poslovi”: lint and tests at the same time (default false) */
  parallelJobs?: boolean
  /** „Predmemorija ovisnosti”: dependency cache for tests + layer cache for the image build (default false) */
  cache?: boolean
  /** Layer-cache backend (default 'gha': a PR's caches cannot be restored by main; 'registry' shares the layer cache) */
  cacheBackend?: CacheBackend
  /** „Preskoči testove”: skips unit tests AND e2e (default false) */
  skipTests?: boolean
  /** Human gate position (default 'delivery') */
  gate?: GateMode
  /** CI credential (default 'static' = long-lived key) */
  credential?: CredentialKind
  /** 'push' = CI runs kubectl apply with cluster credentials; 'gitops' = CI commits the digest to the config repo */
  deployMode?: DeployMode
  immutableTags?: boolean
  /**
   * After an incident is detected, the on-call person rolls back (default true): push mode re-deploys the last good
   * digest; GitOps mode commits `git revert` to the config repository and Argo CD syncs it. Not Kubernetes rolling
   * itself back – a person reacts to the alert.
   */
  rollbackOnIncident?: boolean
  /** @deprecated alias of rollbackOnIncident */
  autoRollback?: boolean
  /** GitOps: extra seconds until Argo CD sees a config commit (default 0 = webhook; polling: 120 s + up to 60 s jitter) */
  argoPollSec?: number
  /** 'supersede' cancels an older run still waiting for staging/production when a newer one arrives (default 'queue') */
  environmentConcurrency?: EnvironmentConcurrency
  durations?: Partial<PipelineDurations>
  /** Probability that one run of a flaky test fails (default 0.3) */
  flakyFailProb?: number
  /** Automatic re-runs of a failed flaky test (default 2 → up to 3 attempts) */
  flakyRetries?: number
  /** Time from a bad production deploy until users/monitoring notice it (default 300 s, illustrative) */
  incidentDetectSec?: number
  /** OIDC token lifetime in the sim (default 600 s; real AWS STS default 3600 s) */
  oidcTokenLifetimeSec?: number
  /** A leaked credential is tried by the attacker every N seconds (default 60) */
  attackerIntervalSec?: number
  registryHost?: string
  /** Image repository (default 'klopa-api') */
  repo?: string
  /** Version running in production at start when it was built by CI (default '1.4.0') */
  initialVersion?: string
  /** Production at start (default: built by CI from main, tag `initialVersion`, tested) */
  initialProd?: InitialProd
  /** First semver for `nextPatchVersion` when production has none (default '2.0.1') */
  firstVersion?: string
  /** Wall clock at t = 0, „HH:MM” (default '09:00'); `wallClock(s)` turns sim time into „12:00” */
  clockOrigin?: string
  /**
   * A teammate pushes `git revert` of a commit this many seconds after it turned main red (tests or scan failed
   * because of its defect) or after its incident was detected – „Fix broken builds immediately”. null (default) =
   * nobody reacts: main stays red until `revertCommit` / a 'fix' commit. The L21 presets use 60 s.
   * Commits of a running stream follow the stream's own `revertAfterSec`.
   */
  teamRevertAfterSec?: number | null
}

export interface ResolvedPipelineConfig {
  parallelJobs: boolean
  cache: boolean
  cacheBackend: CacheBackend
  skipTests: boolean
  gate: GateMode
  credential: CredentialKind
  deployMode: DeployMode
  immutableTags: boolean
  rollbackOnIncident: boolean
  argoPollSec: number
  environmentConcurrency: EnvironmentConcurrency
  durations: PipelineDurations
  flakyFailProb: number
  flakyRetries: number
  incidentDetectSec: number
  oidcTokenLifetimeSec: number
  attackerIntervalSec: number
  registryHost: string
  repo: string
  initialVersion: string
  initialProd: InitialProd | null
  firstVersion: string
  clockOrigin: string
  teamRevertAfterSec: number | null
}

export type PipelinePresetId = 'tvornica' | 'brza-tvornica' | 'dan-izdanja'

export const PIPELINE_PRESETS: Record<PipelinePresetId, PipelineConfig> = {
  /**
   * L21 start: sequential, no cache, delivery gate, long-lived key, push model; production = Davor's laptop build
   * tagged latest. A teammate reverts a commit that turns main red after 1 min, so one „Pada test” click does not
   * leave every later „Ispravan” commit failing (the UI can still offer `revertCommit` as a button).
   */
  tvornica: { initialProd: { tag: 'latest', builtBy: 'laptop', tested: false, commit: null }, teamRevertAfterSec: 60 },
  /** L21 after tuning: parallel jobs + cache */
  'brza-tvornica': { parallelJobs: true, cache: true, teamRevertAfterSec: 60 },
  /**
   * L24 „Put jednog commita”: cache hits, OIDC, GitOps bot commit, continuous deployment, production on 2.0.1.
   * Clock 11:48: PR checks (2 min 40 s) + merge to production (9 min) land the fix just before 12:00.
   */
  'dan-izdanja': { parallelJobs: true, cache: true, gate: 'deployment', credential: 'oidc', deployMode: 'gitops', initialVersion: '2.0.1', clockOrigin: '11:48' },
}

export interface Commit {
  id: number
  sha: string
  short: string
  type: CommitType
  message: string
  createdAt: number
  trigger: 'push' | 'pr'
  /** Semver tag added to the image (klopa-api:2.0.1) */
  version: string | null
  /** Defects in this commit's TREE (inherited from main + its own) */
  defects: Defect[]
  /** The defect this commit itself introduces, if any */
  introduces: DefectKind | null
  /** Commits whose defect this one removes (revert / fix) */
  removes: number[]
  /** PR: main's head when the branch was made (a merge reuses the PR tree only if main has not moved) */
  baseHeadId: number | null
  /** Who pushed it: a student, the 20-commit stream, or the stream's team reverting a red main */
  author: 'student' | 'stream' | 'team'
  /** Derived from `defects` (kept for UIs) */
  buggy: boolean
  vulnerableBase: boolean
  hasSecret: boolean
  flaky: boolean
  changesDeps: boolean
  codeVersion: number
  depsVersion: number
}

export type JobStatus = 'pending' | 'waiting' | 'running' | 'passed' | 'failed' | 'skipped' | 'stopped'

export interface Job {
  id: StationId
  status: JobStatus
  start: number | null
  end: number | null
  duration: number
  attempts: number
  waitingSince: number | null
  /** Short Croatian note („iz predmemorije”, „1 test pao”, „čeka staging”) */
  note: string | null
  cacheHit: boolean | null
}

export type RunStatus = 'running' | 'waiting-approval' | 'failed' | 'checks-passed' | 'in-registry' | 'in-prod' | 'cancelled'

/** One layer step of the CI image build, kept for the L24 timeline („which layers hit the cache”). */
export interface CiBuildStep {
  id: string
  text: string
  status: 'cached' | 'run' | 'failed' | 'skipped'
  reason: CacheReason
  /** Layer-model seconds (the L08 numbers); the CI job time is the L21 number in `jobs.build.duration` */
  duration: number
  sizeMB: number
  layerDigest: string | null
}

export interface PipelineRun {
  id: number
  commit: Commit
  createdAt: number
  /** Workflow settings at this commit */
  cfg: { parallelJobs: boolean; cache: boolean; skipTests: boolean }
  jobs: Record<StationId, Job>
  status: RunStatus
  failedAt: StationId | null
  failReason: string | null
  image: Image | null
  /** Digest built and tested in this run */
  digest: string | null
  tags: string[]
  stagingDigest: string | null
  prodDigest: string | null
  /** Production runs exactly the digest that went through the checks */
  tested: boolean | null
  rebuildForProd: boolean
  /** Why the production rebuild differs from the tested image (Croatian, for the „Drugi artefakt” card) */
  rebuildNote: string | null
  approvedBy: 'human' | 'auto' | null
  /** Seconds the run waited at the human gate (null until it passed) */
  gateWaitSec: number | null
  leadTimeSec: number | null
  finishedAt: number | null
  /** The pull request run this merge came from (L24) */
  mergedFrom: number | null
  /** The defect that stopped the line (a test caught the bug, the scan found the base/secret, the flaky test failed every attempt) */
  failedBy: Defect | null
  /** Per-layer result of the CI build (after the build job) */
  buildSteps: CiBuildStep[]
  /** Layer-cache scope the run writes to ('main', 'pr-7' or 'shared') */
  cacheScope: string
  /** Position in the current commit stream (0-based), null for other commits */
  streamIndex: number | null
  /** Cancelled by a newer run (environmentConcurrency 'supersede') */
  cancelledBy: number | null
  /** internal: pending CI layer-cache plan */
  pendingBuild: BuildPlan | null
}

export interface Deployment {
  t: number
  runId: number
  digest: string
  leadTimeSec: number
  bad: boolean
  tested: boolean
  approvedBy: 'human' | 'auto'
}

export type IncidentResolution = 'rollback' | 'revert' | 'fix-forward' | 'older-commit'

export interface Incident {
  id: number
  runId: number
  /** Commits whose defects were in the bad deploy */
  culprits: number[]
  startedAt: number
  detectAt: number
  detected: boolean
  resolvedAt: number | null
  recoverySec: number | null
  /** rollback = on-call rollback; revert / fix-forward = a newer commit that removes the defect; older-commit = an older tree deployed over the bad one */
  how: IncidentResolution | null
  /** For a rollback: re-deploy (push model) or a git revert in the config repository (GitOps) */
  rollbackVia: 'redeploy' | 'git-revert' | null
  /** Production was fixed before anyone noticed the incident */
  resolvedBeforeDetection: boolean
}

/** A commit in the GitOps config repository (bot: CI writes the new digest; revert: on-call rollback). */
export interface ConfigCommit {
  id: number
  t: number
  sha: string
  short: string
  env: 'staging' | 'production'
  digest: string
  kind: 'bot' | 'revert'
  by: 'ci-bot' | 'on-call'
  runId: number | null
  message: string
}

export type TokenKind = 'oidc' | 'github-app'

export interface CredentialLeak {
  id: number
  at: number
  kind: CredentialKind
  /** The compromised job's station (null: no job was running) */
  station: StationId | null
  scope: string
  /** OIDC: the leaked token (null for a long-lived key, or when the job holds no token) */
  tokenId: number | null
  tokenKind: TokenKind | null
  /** OIDC: when that token was issued – it stays usable only for the rest of its lifetime */
  issuedAt: number | null
  /** null = valid until someone revokes it */
  validUntil: number | null
  revokedAt: number | null
  attempts: number
  successes: number
  nextAttemptAt: number | null
}

/** A short-lived token, issued per job that needs one (push; staging/production deploy). */
export interface IssuedToken {
  id: number
  runId: number
  station: StationId
  /** 'oidc' = cloud token from the trust policy; 'github-app' = GitOps bot token for the config repository */
  kind: TokenKind
  /** What the token allows (Croatian) */
  scope: string
  issuedAt: number
  /** Not revoked when the job ends: it simply stops working at this time */
  expiresAt: number
}

export interface PipelineStats {
  commits: number
  finishedRuns: number
  blockedByTests: number
  blockedByScan: number
  blockedBySecret: number
  flakyFailedAttempts: number
  flakyRuns: number
  deploys: number
  failedDeploys: number
  badInProd: number
  untestedDeploys: number
  rollbacks: number
  approvals: number
  autoDeploys: number
  tokensIssued: number
  /** Revert commits pushed (by students or the stream's team) */
  reverts: number
  /** Runs cancelled by a newer one (environmentConcurrency 'supersede') */
  superseded: number
  /** Secrets that reached the Git remote (they must be rotated even though the scan stopped the image) */
  secretsInHistory: number
  /** Time of the first prod deploy through a human click, and of the first automatic one after it */
  firstApprovalDeployAt: number | null
  firstAutoAfterApprovalAt: number | null
  /** Best lead time of a deploy that ran every check and shipped the tested digest (sticky, survives trimming) */
  bestLeadTimeAllChecksSec: number | null
  /** „0 loših od 20” reached once (sticky) */
  zeroBadOf20Achieved: boolean
}

/** Scoreboard of the current commit stream (only its own runs count). */
export interface StreamResult {
  startedAt: number
  arrived: number
  /** Stream runs that reached a terminal state */
  finished: number
  /** Deploys of stream runs and of the team's reverts */
  deployed: number
  badInProd: number
  blocked: { tests: number; scan: number; secret: number; flaky: number; inherited: number; superseded: number; other: number }
  /** Revert commits the team pushed to un-break main */
  reverts: number
}

export interface CommitStream {
  types: CommitType[]
  intervalSec: number
  nextAt: number | null
  index: number
  /** The team reverts a commit that turned main red this many seconds after the failure (null = nobody reacts) */
  revertAfterSec: number | null
  /** Approve stream runs at the gate as soon as they arrive (a release manager who always clicks) */
  autoApprove: boolean
  result: StreamResult
}

export interface SecretInHistory {
  name: string
  commitId: number
  short: string
  at: number
  rotated: boolean
}

interface CiCacheScope {
  layers: BuildCache
  bases: Set<string>
  /** Dependency-cache keys (requirements versions) that are warm */
  deps: Set<number>
}

export interface PipelineState {
  clock: Clock
  t: number
  seed: number
  rng: Rng
  config: ResolvedPipelineConfig
  registry: Registry
  repo: string
  main: MainBranch
  runs: PipelineRun[]
  prod: {
    digest: string
    runId: number | null
    since: number
    bad: boolean
    tested: boolean
    version: string
    builtBy: 'ci' | 'laptop'
    /** Short SHA in production (null = unknown commit) */
    commit: string | null
    /** Commits whose defects production currently runs */
    defects: number[]
  }
  prodHistory: { t: number; digest: string; runId: number | null; kind: 'initial' | 'deploy' | 'rollback'; bad: boolean; via: 'kubectl' | 'config-repo' | 'laptop' | null; configSha: string | null }[]
  /** GitOps config repository history (newest last) */
  configRepo: ConfigCommit[]
  deployments: Deployment[]
  incidents: Incident[]
  rollback: { start: number; end: number; target: string; via: 'redeploy' | 'git-revert'; configSha: string | null } | null
  rollbackPending: boolean
  locks: { staging: number | null; prod: number | 'rollback' | null }
  /** Rebuild the next production deployment instead of promoting (break-it) */
  rebuildNextProd: boolean
  leaks: CredentialLeak[]
  /** Tokens issued so far (newest last, the last 30 kept) */
  tokens: IssuedToken[]
  /** How many times upstream republished the base tag (`updateBaseImage`) */
  baseRevision: number
  /** 1 = the team trusts red builds; flaky failures erode it */
  trust: number
  stats: PipelineStats
  stream: CommitStream | null
  /** Team reverts scheduled after a red main (stream) */
  pendingReverts: { at: number; commitId: number }[]
  secretsInHistory: SecretInHistory[]
  /** CI caches by scope ('main', 'pr-<id>', 'shared') */
  ciCaches: Map<string, CiCacheScope>
  /** Newest semver released (for `nextPatchVersion`) */
  lastVersion: string | null
  events: EngineEvent[]
  nextRunId: number
  nextBuildNonce: number
  nextLeakId: number
  nextIncidentId: number
  nextTokenId: number
  nextConfigId: number
  nextCodeVersion: number
  nextDepsVersion: number
}

const MAX_RUNS_KEPT = 60
/** Bounded history (a long classroom session never grows without limit) */
const MAX_HISTORY = 500
const MAX_TOKENS = 30
const MAX_LEAKS = 20
const MAX_CONFIG_COMMITS = 200
const MAX_PR_CACHES = 20
const MAX_SECRETS = 20

const CI_DOCKERFILE_IDS = ['api-from', 'api-workdir', 'api-copy-req', 'api-pip', 'api-copy-all', 'api-user', 'api-expose', 'api-cmd']

const MESSAGES: Record<CommitType, string[]> = {
  ok: ['Ispravak izračuna PDV-a', 'Vegetarijanski meni na vrhu', 'Brži upit za košaricu', 'Bolja poruka o grešci', 'Sređen kod za narudžbe'],
  'failing-test': ['Popust za Ćevap-petak', 'Novi obračun PDV-a', 'Zaokruživanje cijena'],
  'vulnerable-base': ['Bazna slika python:3.9-slim-buster'],
  flaky: ['Test košarice ovisi o satu', 'Test čeka RabbitMQ'],
  secret: ['SMS ključ u settings.py'],
  fix: ['Ispravljen obračun popusta'],
  revert: ['Revert zadnje promjene'],
}

const DEFAULT_SCOPE = 'main'

export function createPipeline(config: PipelineConfig = {}): PipelineState {
  const seed = Number.isFinite(config.seed) ? (config.seed as number) >>> 0 : 42
  const cfg: ResolvedPipelineConfig = {
    parallelJobs: config.parallelJobs ?? false,
    cache: config.cache ?? false,
    cacheBackend: config.cacheBackend ?? 'gha',
    skipTests: config.skipTests ?? false,
    gate: config.gate ?? 'delivery',
    credential: config.credential ?? 'static',
    deployMode: config.deployMode ?? 'push',
    immutableTags: config.immutableTags ?? false,
    rollbackOnIncident: config.rollbackOnIncident ?? config.autoRollback ?? true,
    argoPollSec: num(config.argoPollSec, 0),
    environmentConcurrency: config.environmentConcurrency ?? 'queue',
    durations: resolveDurations(config.durations),
    flakyFailProb: num(config.flakyFailProb, 0.3, 0, 1),
    flakyRetries: Math.floor(num(config.flakyRetries, 2, 0, 10)),
    incidentDetectSec: num(config.incidentDetectSec, 300),
    oidcTokenLifetimeSec: num(config.oidcTokenLifetimeSec, OIDC_TOKEN_LIFETIME.simValue, 1),
    attackerIntervalSec: num(config.attackerIntervalSec, 60, 1),
    registryHost: config.registryHost ?? 'registry.klopa.example',
    repo: config.repo ?? 'klopa-api',
    initialVersion: config.initialVersion ?? '1.4.0',
    initialProd: config.initialProd ?? null,
    firstVersion: config.firstVersion ?? '2.0.1',
    clockOrigin: config.clockOrigin ?? '09:00',
    teamRevertAfterSec: config.teamRevertAfterSec === undefined || config.teamRevertAfterSec === null ? null : num(config.teamRevertAfterSec, 60),
  }
  const laptop = cfg.initialProd?.builtBy === 'laptop'
  const prodTag = cfg.initialProd?.tag ?? cfg.initialVersion
  const state: PipelineState = {
    clock: createClock(PIPELINE_DT),
    t: 0,
    seed,
    rng: createRng(seed),
    config: cfg,
    registry: createRegistry(cfg.registryHost, { immutableTags: cfg.immutableTags }),
    repo: cfg.repo,
    main: { codeVersion: 1, depsVersion: 1, defects: [], head: null, headId: null },
    runs: [],
    prod: {
      digest: '',
      runId: null,
      since: 0,
      bad: false,
      tested: cfg.initialProd?.tested ?? true,
      version: prodTag,
      builtBy: laptop ? 'laptop' : 'ci',
      commit: cfg.initialProd ? cfg.initialProd.commit : null,
      defects: [],
    },
    prodHistory: [],
    configRepo: [],
    deployments: [],
    incidents: [],
    rollback: null,
    rollbackPending: false,
    locks: { staging: null, prod: null },
    rebuildNextProd: false,
    leaks: [],
    tokens: [],
    baseRevision: 0,
    trust: 1,
    stats: {
      commits: 0,
      finishedRuns: 0,
      blockedByTests: 0,
      blockedByScan: 0,
      blockedBySecret: 0,
      flakyFailedAttempts: 0,
      flakyRuns: 0,
      deploys: 0,
      failedDeploys: 0,
      badInProd: 0,
      untestedDeploys: 0,
      rollbacks: 0,
      approvals: 0,
      autoDeploys: 0,
      tokensIssued: 0,
      reverts: 0,
      superseded: 0,
      secretsInHistory: 0,
      firstApprovalDeployAt: null,
      firstAutoAfterApprovalAt: null,
      bestLeadTimeAllChecksSec: null,
      zeroBadOf20Achieved: false,
    },
    stream: null,
    pendingReverts: [],
    secretsInHistory: [],
    ciCaches: new Map(),
    lastVersion: null,
    events: [],
    nextRunId: 1,
    nextBuildNonce: 1,
    nextLeakId: 1,
    nextIncidentId: 1,
    nextTokenId: 1,
    nextConfigId: 1,
    nextCodeVersion: 1,
    nextDepsVersion: 1,
  }
  // The main branch was built by CI before: with the cache on, that run warmed the main cache (it cannot be warm
  // when the cache was off – a cache that is switched on later starts empty).
  const mainPlan = ciPlan(state, { codeVersion: 1, depsVersion: 1, vulnerableBase: false }, createCache(), new Set())
  if (cfg.cache) {
    const sc = cacheScope(state, cfg.cacheBackend === 'registry' ? 'shared' : DEFAULT_SCOPE)
    applyPlanWrites(mainPlan, sc.layers, sc.bases)
    cacheScope(state, DEFAULT_SCOPE).deps.add(1)
  }
  // Production: the CI image of main, or (L21 hook) an image built on a laptop from uncommitted changes.
  const image = laptop ? (ciPlan(state, { codeVersion: 0, depsVersion: 1, vulnerableBase: false }, createCache(), new Set()).image as Image) : (mainPlan.image as Image)
  applyPush(state.registry, image, planPush(state.registry, image, state.repo, [prodTag]), 0)
  state.prod.digest = image.digest
  state.prodHistory.push({ t: 0, digest: image.digest, runId: null, kind: 'initial', bad: false, via: laptop ? 'laptop' : null, configSha: null })
  if (SEMVER.test(prodTag)) state.lastVersion = prodTag
  return state
}

const event = (state: PipelineState, kind: string, text: string, tone: EngineEvent['tone'] = 'neutral') => pushEvent(state.events, state.t, kind, text, tone)

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/

/** The next patch version: 2.0.1 → 2.0.2; with no semver released yet (production tagged `latest`), `firstVersion` (2.0.1). */
export function nextPatchVersion(state: PipelineState): string {
  const m = state.lastVersion ? SEMVER.exec(state.lastVersion) : null
  return m ? `${m[1]}.${m[2]}.${Number(m[3]) + 1}` : state.config.firstVersion
}

/** Wall-clock label for sim time `t` (default now) from `config.clockOrigin`: „11:48” + 12 min → „12:00”. */
export function wallClock(state: PipelineState, t: number = state.t, withSeconds = false): string {
  return clockLabel(state.config.clockOrigin, t, withSeconds)
}

/** Sim time including the part of a fixed step not yet taken – for smooth progress between 0,5 s steps. */
export function simNow(state: PipelineState): number {
  return clean(state.clock.t + state.clock.acc)
}

// ---------------------------------------------------------------------------------------------
// CI image build (reuses the L08 layer model, so digests are real manifest hashes)
// ---------------------------------------------------------------------------------------------

function ciInstructions(vulnerableBase: boolean): Instruction[] {
  const cat = PROJECTS['klopa-api'].catalog
  return CI_DOCKERFILE_IDS.map((id) => {
    const c = { ...cat[id] }
    if (id === 'api-from' && vulnerableBase) {
      c.text = 'FROM python:3.9-slim-buster'
      c.base = 'python:3.9-slim-buster'
    }
    return c
  })
}

function ciContext(codeVersion: number, depsVersion: number, vulnerableBase: boolean): ContextFile[] {
  const files = PROJECTS['klopa-api'].files.map((f) => ({
    ...f,
    version: f.path === 'requirements.txt' ? depsVersion : f.path === 'klopa/' ? codeVersion : f.version,
  }))
  // The Dockerfile and .dockerignore are in the repository root, so `COPY . .` copies them too.
  files.push({ path: 'Dockerfile', sizeMB: 0.001, ratio: 0.5, version: 1, role: 'config', ignored: false, content: ciInstructions(vulnerableBase).map((i) => i.text).join('\n') })
  files.push({ path: '.dockerignore', sizeMB: 0.0001, ratio: 0.5, version: 1, role: 'config', ignored: false, content: '.venv/\n.git/\n.env' })
  return files
}

const CI_BASE = 'python:3.13-slim'

/** The base catalogue CI resolves against: `python:3.13-slim` moves to a new digest after `updateBaseImage`. */
function ciBaseCatalog(state: PipelineState) {
  return state.baseRevision > 0 ? { ...BASE_IMAGES, [CI_BASE]: patchedBase(BASE_IMAGES[CI_BASE], state.baseRevision) } : BASE_IMAGES
}

/** The CI image build of a tree. `dryRun` (predictions) leaves the build counter alone, so the state is not changed. */
function ciPlan(state: PipelineState, tree: { codeVersion: number; depsVersion: number; vulnerableBase: boolean }, cache: BuildCache, bases: Set<string>, dryRun = false): BuildPlan {
  return planBuild(ciInstructions(tree.vulnerableBase), {
    context: { files: ciContext(tree.codeVersion, tree.depsVersion, tree.vulnerableBase), dockerignore: true, secrets: {}, args: {} },
    cache,
    localBases: bases,
    buildId: dryRun ? state.nextBuildNonce : state.nextBuildNonce++,
    now: state.t,
    seed: state.seed,
    bases: ciBaseCatalog(state),
  })
}

function cacheScope(state: PipelineState, key: string): CiCacheScope {
  let sc = state.ciCaches.get(key)
  if (!sc) {
    sc = { layers: createCache(), bases: new Set(), deps: new Set() }
    state.ciCaches.set(key, sc)
    const prs = [...state.ciCaches.keys()].filter((k) => k.startsWith('pr-'))
    for (const k of prs.slice(0, Math.max(0, prs.length - MAX_PR_CACHES))) state.ciCaches.delete(k)
  }
  return sc
}

/** Actions-cache scope of a run: main → 'main'; a PR → its own 'pr-<id>' (GitHub scopes caches per ref). */
function refScope(run: PipelineRun): string {
  return run.commit.trigger === 'pr' ? `pr-${run.id}` : DEFAULT_SCOPE
}

/** Where a run writes its layer cache: its ref scope, or 'shared' with the registry backend. */
function writeScope(state: PipelineState, run: PipelineRun): string {
  return state.config.cacheBackend === 'registry' ? 'shared' : refScope(run)
}

/** Actions-cache scopes a run may restore from: a PR reads its own and its base branch's; main reads only main's. */
function readScopesFor(trigger: 'push' | 'pr', runId: number): string[] {
  return trigger === 'pr' ? [`pr-${runId}`, DEFAULT_SCOPE] : [DEFAULT_SCOPE]
}
const refReadScopes = (run: PipelineRun) => readScopesFor(run.commit.trigger, run.id)

function readCache(state: PipelineState, run: PipelineRun): { layers: BuildCache; bases: Set<string>; empty: boolean } {
  return readCacheFor(state, run.commit.trigger, run.id)
}

function readCacheFor(state: PipelineState, trigger: 'push' | 'pr', runId: number): { layers: BuildCache; bases: Set<string>; empty: boolean } {
  const scopes = (state.config.cacheBackend === 'registry' ? ['shared'] : readScopesFor(trigger, runId))
    .map((k) => state.ciCaches.get(k))
    .filter((x): x is CiCacheScope => !!x)
  if (scopes.length === 0) return { layers: createCache(), bases: new Set(), empty: true }
  if (scopes.length === 1) return { layers: scopes[0].layers, bases: scopes[0].bases, empty: scopes[0].layers.entries.size === 0 }
  const layers = createCache()
  const bases = new Set<string>()
  for (const sc of [...scopes].reverse()) {
    for (const [k, v] of sc.layers.entries) layers.entries.set(k, v)
    for (const [k, v] of sc.layers.lastInputs) layers.lastInputs.set(k, v)
    for (const b of sc.bases) bases.add(b)
  }
  return { layers, bases, empty: layers.entries.size === 0 }
}

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------

export interface CommitOptions {
  /** 'push' to main runs the whole pipeline; 'pr' runs only the checks (no push, no deploy) */
  trigger?: 'push' | 'pr'
  /** Adds a semver image tag, e.g. '2.0.1', or 'next-patch' for `nextPatchVersion` */
  version?: string
  /** The commit changes requirements.txt (cold dependency + layer cache) */
  changesDeps?: boolean
  message?: string
  /** 'revert': the commit to revert (default: the newest commit whose defect is still on main) */
  reverts?: number
  /** 'fix': the commit whose defect to fix (default: the newest defect on main) */
  fixes?: number
}

interface InternalCommit {
  mergeOf?: PipelineRun
  streamIndex?: number
  author?: Commit['author']
}

/** Push a commit of the given type; returns its pipeline run. */
export function commit(state: PipelineState, type: CommitType = 'ok', opts: CommitOptions = {}): PipelineRun {
  return makeCommit(state, type, opts, { author: 'student' })
}

/** `git revert <commit>` pushed to main: removes that commit's defect from every later tree. Default: the newest defect on main. */
export function revertCommit(state: PipelineState, commitId?: number, opts: Omit<CommitOptions, 'reverts' | 'trigger'> = {}): PipelineRun {
  return makeCommit(state, 'revert', { ...opts, reverts: commitId }, { author: 'student' })
}

function makeCommit(state: PipelineState, type: CommitType, opts: CommitOptions, internal: InternalCommit): PipelineRun {
  const redBefore = mainStatus(state).cause
  const id = state.nextRunId++
  const main = state.main
  const pr = internal.mergeOf?.commit
  const trigger: 'push' | 'pr' = pr ? 'push' : (opts.trigger ?? 'push')
  let tree: TreeState
  let removes: number[] = []
  let introduces: DefectKind | null = pr ? null : (INTRODUCES[type] ?? null)
  let message = opts.message
  if (pr) {
    removes = pr.removes
    if (main.headId === pr.baseHeadId) tree = { codeVersion: pr.codeVersion, depsVersion: pr.depsVersion, defects: [...pr.defects] }
    else {
      // main moved on: the merge tree is main + the PR's own change
      const defects = main.defects.filter((d) => !pr.removes.includes(d.commitId))
      for (const d of pr.defects) if (d.commitId === pr.id && !defects.some((x) => x.commitId === d.commitId)) defects.push(d)
      tree = { codeVersion: ++state.nextCodeVersion, depsVersion: pr.changesDeps ? ++state.nextDepsVersion : main.depsVersion, defects }
    }
    introduces = null
  } else {
    let defects = [...main.defects]
    if (type === 'fix' || type === 'revert') {
      const target = (type === 'revert' ? opts.reverts : opts.fixes) ?? main.defects[main.defects.length - 1]?.commitId ?? null
      if (target !== null && target !== undefined) {
        removes = [target]
        const culprit = defects.find((d) => d.commitId === target)
        defects = defects.filter((d) => d.commitId !== target)
        if (!message && culprit) message = type === 'revert' ? `Revert „${culprit.message}”` : `Ispravak: ${culprit.message}`
      }
    }
    tree = { codeVersion: ++state.nextCodeVersion, depsVersion: opts.changesDeps ? ++state.nextDepsVersion : main.depsVersion, defects }
  }
  const sha = sha256Hex(`commit|${state.seed}|${id}|${type}|${tree.codeVersion}`).slice(0, 40)
  const short = sha.slice(0, 7)
  const msgs = MESSAGES[type]
  if (pr) message = opts.message ?? `Merge: ${pr.message}`
  if (introduces) tree.defects.push({ kind: introduces, commitId: id, short, message: message ?? msgs[(id - 1) % msgs.length], author: internal.author ?? 'student' })
  let version: string | null = opts.version ?? null
  if (version === 'next-patch') version = nextPatchVersion(state)
  if (version && SEMVER.test(version)) state.lastVersion = version
  const c: Commit = {
    id,
    sha,
    short,
    type,
    message: message ?? msgs[(id - 1) % msgs.length],
    createdAt: state.t,
    trigger,
    version,
    defects: tree.defects,
    introduces,
    removes,
    baseHeadId: trigger === 'pr' ? main.headId : null,
    author: internal.author ?? 'student',
    buggy: tree.defects.some((d) => d.kind === 'bug'),
    vulnerableBase: tree.defects.some((d) => d.kind === 'vulnerable-base'),
    hasSecret: tree.defects.some((d) => d.kind === 'secret'),
    flaky: tree.defects.some((d) => d.kind === 'flaky'),
    changesDeps: pr?.changesDeps ?? opts.changesDeps ?? false,
    codeVersion: tree.codeVersion,
    depsVersion: tree.depsVersion,
  }
  if (trigger === 'push') state.main = { ...tree, defects: [...tree.defects], head: short, headId: id }
  if (type === 'revert' && !pr) state.stats.reverts += 1

  const cfg = { parallelJobs: state.config.parallelJobs, cache: state.config.cache, skipTests: state.config.skipTests }
  const jobs = Object.fromEntries(
    ORDER.map((sid) => [sid, { id: sid, status: 'pending', start: null, end: null, duration: 0, attempts: 0, waitingSince: null, note: null, cacheHit: null } as Job]),
  ) as Record<StationId, Job>
  if (cfg.skipTests) {
    for (const sid of ['test', 'e2e'] as StationId[]) {
      jobs[sid].status = 'skipped'
      jobs[sid].note = 'preskočeno'
    }
  }
  if (c.trigger === 'pr') {
    for (const sid of ['push', 'staging', 'e2e', 'gate', 'prod'] as StationId[]) {
      jobs[sid].status = 'skipped'
      jobs[sid].note = 'samo za push na main'
    }
  }
  const run: PipelineRun = {
    id,
    commit: c,
    createdAt: state.t,
    cfg,
    jobs,
    status: 'running',
    failedAt: null,
    failReason: null,
    image: null,
    digest: null,
    tags: [],
    stagingDigest: null,
    prodDigest: null,
    tested: null,
    rebuildForProd: false,
    rebuildNote: null,
    approvedBy: null,
    gateWaitSec: null,
    leadTimeSec: null,
    finishedAt: null,
    mergedFrom: internal.mergeOf?.id ?? null,
    failedBy: null,
    buildSteps: [],
    cacheScope: '',
    streamIndex: internal.streamIndex ?? null,
    cancelledBy: null,
    pendingBuild: null,
  }
  run.cacheScope = writeScope(state, run)
  state.runs.push(run)
  state.stats.commits += 1
  event(state, 'commit', `${c.short} „${c.message}” (${COMMIT_TYPE_LABEL[type]}) → pipeline #${id}${c.trigger === 'pr' ? ' (PR)' : ''}`, 'info')
  if (redBefore && c.defects.some((d) => d.commitId === redBefore.commitId)) {
    event(
      state,
      'inherits',
      `#${id} nasljeđuje ${DEFECT_LABEL_ACC[redBefore.kind]} iz ${redBefore.short} – main je crven dok se ${redBefore.short} ne vrati (git revert) ili ispravi`,
      'warn',
    )
  }
  if (cfg.skipTests) event(state, 'tests-skipped', `#${id}: testovi i e2e preskočeni – greške idu dalje neprovjerene`, 'warn')
  schedule(state)
  trimRuns(state)
  return run
}

/**
 * Merge a pull request whose checks passed (branch protection: a failed PR cannot be merged).
 * The push to main runs the whole pipeline. If main has not moved since the PR branched, the merge commit has the
 * PR's tree; otherwise it is main + the PR's change. With the default 'gha' cache backend the main run cannot
 * restore the PR's caches (GitHub Actions scopes caches per ref), so it builds from main's own cache.
 */
export function mergePullRequest(state: PipelineState, prRunId: number, opts: { version?: string } = {}): PipelineRun | null {
  const pr = state.runs.find((r) => r.id === prRunId && r.commit.trigger === 'pr')
  if (!pr || pr.status !== 'checks-passed') return null
  return makeCommit(state, pr.commit.type, { version: opts.version }, { mergeOf: pr, author: pr.commit.author })
}

/** Default commit mix for the „0 loših commitova od 20” stream. */
export const DEFAULT_COMMIT_MIX: Record<CommitType, number> = { ok: 0.55, 'failing-test': 0.15, 'vulnerable-base': 0.1, flaky: 0.1, secret: 0.1, fix: 0, revert: 0 }

/**
 * Generate `count` commits pushed to main, one every `intervalSec`, with a seeded mix of types (for „0 od 20”).
 * - `revertAfterSec` (default 60): when a stream commit turns main red (tests or scan fail because of its defect),
 *   or ships a defect that becomes an incident, the team pushes `git revert` of it this many seconds later – a red
 *   main blocks everyone. null = nobody reacts (main stays red).
 * - `autoApprove` (default false): approve stream runs at the human gate at once; otherwise, with the delivery
 *   gate, they wait for `approve()` and the stream is not finished until they are approved.
 * The stream has its own scoreboard (`streamStatus`), so earlier experiments do not count.
 */
export function startCommitStream(
  state: PipelineState,
  opts: { count?: number; intervalSec?: number; mix?: Partial<Record<CommitType, number>>; revertAfterSec?: number | null; autoApprove?: boolean } = {},
): CommitType[] {
  const rawCount = opts.count ?? 20
  const count = Number.isFinite(rawCount) ? Math.max(0, Math.floor(rawCount)) : 0
  // A passed mix replaces the default (types it leaves out never occur).
  const mix: Partial<Record<CommitType, number>> = opts.mix ?? DEFAULT_COMMIT_MIX
  const rng = createRng((state.seed ^ 0x5eed) >>> 0)
  const entries = (Object.entries(mix) as [CommitType, number][]).filter(([, w]) => Number.isFinite(w) && w > 0)
  const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0)
  const types: CommitType[] = []
  for (let i = 0; i < count; i++) {
    let u = rng.next() * (total || 1)
    let pick: CommitType = 'ok'
    for (const [k, w] of entries) {
      u -= Math.max(0, w)
      if (u < 0) {
        pick = k
        break
      }
    }
    types.push(pick)
  }
  const interval = opts.intervalSec ?? 360
  const revertAfter = opts.revertAfterSec === undefined ? 60 : opts.revertAfterSec
  state.stream = {
    types,
    intervalSec: Number.isFinite(interval) ? Math.max(1, interval) : 360,
    nextAt: count > 0 ? state.t : null,
    index: 0,
    revertAfterSec: revertAfter === null ? null : num(revertAfter, 60),
    autoApprove: opts.autoApprove ?? false,
    result: { startedAt: state.t, arrived: 0, finished: 0, deployed: 0, badInProd: 0, blocked: { tests: 0, scan: 0, secret: 0, flaky: 0, inherited: 0, superseded: 0, other: 0 }, reverts: 0 },
  }
  // reverts already scheduled stay: their defects are still on main
  if (count > 0) {
    const waits = state.config.gate === 'delivery' && !state.stream.autoApprove
    event(
      state,
      'stream',
      `Tok od ${count} commitova, jedan svakih ${fmtSeconds(state.stream.intervalSec)}${waits ? ' – izdanja čekaju na ljudskim vratima (Odobri sve)' : ''}`,
      'info',
    )
    processUntil(state, state.t)
  }
  return types
}

/** Scoreboard of the current stream: `done` when every stream commit reached a terminal state. */
export function streamStatus(state: PipelineState): (StreamResult & { total: number; done: boolean }) | null {
  const st = state.stream
  if (!st) return null
  return { ...st.result, blocked: { ...st.result.blocked }, total: st.types.length, done: st.result.finished >= st.types.length }
}

/** Runs waiting at the human gate, longest wait first, with how long each has waited. */
export function waitingAtGate(state: PipelineState): (PipelineRun & { waitSec: number })[] {
  return state.runs
    .filter((r) => r.jobs.gate.status === 'waiting')
    .sort((a, b) => (a.jobs.gate.waitingSince ?? 0) - (b.jobs.gate.waitingSince ?? 0) || a.id - b.id)
    .map((r) => ({ ...r, waitSec: clean(state.t - (r.jobs.gate.waitingSince ?? state.t)) }))
}

/** Human approval at the gate (continuous delivery). Default: the run that has waited longest. */
export function approve(state: PipelineState, runId?: number): boolean {
  const waiting = waitingAtGate(state)
  const pick = runId === undefined ? waiting[0] : waiting.find((r) => r.id === runId)
  const run = pick ? state.runs.find((r) => r.id === pick.id) : undefined
  if (!run) return false
  passGate(state, run, 'human')
  event(state, 'approve', `#${run.id}: ljudska vrata otvorena – ${run.commit.short} ide u produkciju`, 'info')
  schedule(state)
  return true
}

/**
 * „Odobri sve”: approve every run waiting at the human gate, oldest first (a release manager who clears the queue,
 * e.g. for the „0 od 20” stream under the delivery gate). Returns how many were approved; one event for all.
 */
export function approveAll(state: PipelineState): number {
  const waiting = waitingAtGate(state)
  for (const w of waiting) {
    const run = state.runs.find((r) => r.id === w.id)
    if (run) passGate(state, run, 'human')
  }
  if (waiting.length > 0) {
    event(state, 'approve', `Ljudska vrata: ${plural(waiting.length, ['izdanje odobreno', 'izdanja odobrena', 'izdanja odobreno'])} (${waiting.map((w) => `#${w.id}`).join(', ')})`, 'info')
    schedule(state)
  }
  return waiting.length
}

/** „Ponovno izgradi za produkciju”: the next production deployment rebuilds instead of promoting the tested digest. */
export function rebuildForProduction(state: PipelineState): void {
  setRebuildForProduction(state, true)
}

/** Arm or disarm „Ponovno izgradi za produkciju” (applies to the next production deployment only). */
export function setRebuildForProduction(state: PipelineState, on: boolean): void {
  if (state.rebuildNextProd === on) return
  state.rebuildNextProd = on
  event(state, 'rebuild-armed', on ? 'Sljedeće postavljanje u produkciju gradi sliku ponovno' : 'Ponovna izgradnja za produkciju otkazana – promovira se testirani digest', on ? 'warn' : 'info')
}

/**
 * Upstream republishes `python:3.13-slim` (e.g. a Debian security patch): same tag, new digest.
 * The next CI build misses the layer cache from FROM upwards (cold build), and a later rebuild of an
 * already tested commit can no longer reproduce its digest. Returns the new base digest.
 */
export function updateBaseImage(state: PipelineState): string {
  state.baseRevision += 1
  const base = ciBaseCatalog(state)[CI_BASE]
  event(state, 'base-updated', `${CI_BASE} sada pokazuje na novu sliku (${shortDigest(base.digest)}) – isti tag, drugi sadržaj`, 'info')
  return base.digest
}

/** Settings take effect for commits pushed after the change (the workflow file is versioned with the code). */
export function setPipelineOption(
  state: PipelineState,
  key: 'parallelJobs' | 'cache' | 'skipTests' | 'rollbackOnIncident' | 'autoRollback' | 'immutableTags',
  value: boolean,
): void {
  if (key === 'autoRollback' || key === 'rollbackOnIncident') state.config.rollbackOnIncident = value
  else state.config[key] = value
  if (key === 'immutableTags') state.registry.immutableTags = value
}

/**
 * „Samo CI” for one run: every deployment station that has not started yet (`from`) is skipped. The image stays in
 * the registry (status 'in-registry'); nothing is deployed. Returns whether anything was skipped.
 */
function stopAtRegistry(state: PipelineState, run: PipelineRun, from: StationId[]): boolean {
  let changed = false
  for (const sid of from) {
    const j = run.jobs[sid]
    if (j.status !== 'pending' && j.status !== 'waiting') continue
    j.status = 'skipped'
    j.note = 'samo CI'
    if (j.waitingSince !== null || sid === 'gate') j.end = state.t
    changed = true
  }
  if (changed) event(state, 'ci-only', `#${run.id}: samo CI – slika ${shortDigest(run.digest)} ostaje u registru, ništa se ne postavlja`, 'info')
  return changed
}

/**
 * Gate position takes effect immediately (environment protection rules are repository settings).
 * Switching to 'ci' stops every deployment that has not started: runs waiting at the gate, runs queued for
 * staging or production, and – when they get there – runs still in staging/e2e. Jobs already running finish.
 */
export function setGate(state: PipelineState, gate: GateMode): void {
  state.config.gate = gate
  if (gate === 'ci') {
    for (const run of state.runs) {
      if (!isActive(run) || run.commit.trigger !== 'push') continue
      if (run.jobs.staging.status === 'waiting') stopAtRegistry(state, run, ['staging', 'e2e', 'gate', 'prod'])
      else if (run.jobs.gate.status === 'waiting' || run.jobs.prod.status === 'waiting') stopAtRegistry(state, run, ['gate', 'prod'])
    }
  }
  schedule(state)
}

/**
 * „Tim odmah vraća pokvareni commit”: a teammate reverts a commit that turned main red after `afterSec` (null = nobody
 * does; then `revertCommit` is the only way back to green). Applies to failures from now on.
 */
export function setTeamRevert(state: PipelineState, afterSec: number | null): void {
  state.config.teamRevertAfterSec = afterSec === null ? null : num(afterSec, 60)
}

export function setCredential(state: PipelineState, kind: CredentialKind): void {
  state.config.credential = kind
}

export function setDeployMode(state: PipelineState, mode: DeployMode): void {
  state.config.deployMode = mode
}

/** Mark every secret that reached the Git remote as rotated (revoked and replaced). Returns how many. */
export function rotateSecrets(state: PipelineState): number {
  let n = 0
  for (const s of state.secretsInHistory) {
    if (!s.rotated) {
      s.rotated = true
      n += 1
    }
  }
  if (n > 0) event(state, 'secret-rotated', `${plural(n, ['ključ opozvan i zamijenjen', 'ključa opozvana i zamijenjena', 'ključeva opozvano i zamijenjeno'])} – stara vrijednost u povijesti Gita više ne vrijedi`, 'ok')
  return n
}

/**
 * main's current state: its defects and whether CI has already shown it red – the newest finished main run failed
 * because of a defect that is still on main (`cause`). A red main is what a „Vrati commit (git revert)” button fixes.
 */
export function mainStatus(state: PipelineState): { head: string | null; defects: Defect[]; red: boolean; cause: Defect | null } {
  const lastMain = [...state.runs].reverse().find((r) => r.commit.trigger === 'push' && r.finishedAt !== null && r.status !== 'cancelled')
  const by = lastMain?.status === 'failed' ? lastMain.failedBy : null
  const cause = by && state.main.defects.some((x) => x.commitId === by.commitId) ? by : null
  return { head: state.main.head, defects: [...state.main.defects], red: cause !== null, cause }
}

// ---------------------------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------------------------

/** Which token a job of station `sid` gets with OIDC (null = the job has no `id-token: write` and gets none). */
function jobToken(state: PipelineState, sid: StationId): { kind: TokenKind; scope: string } | null {
  const env = sid === 'staging' ? 'staging' : 'production'
  if (sid === 'push') return { kind: 'oidc', scope: `OIDC: push u registar ${state.repo} (repo klopa/${state.repo}, grana main)` }
  if (sid === 'staging' || sid === 'prod') {
    return state.config.deployMode === 'gitops'
      ? { kind: 'github-app', scope: `GitHub App token: pisanje u config repozitorij (${env}) – tko piše u config repozitorij, postavlja u ${env}` }
      : { kind: 'oidc', scope: `OIDC: kubectl apply u okruženje ${env} (repo klopa/${state.repo}, grana main, okruženje ${env})` }
  }
  return null
}

function credentialScope(state: PipelineState, kind: CredentialKind): string {
  const target = state.config.deployMode === 'push' ? 'cluster-admin na produkcijskom klasteru' : 'push u registar i pisanje u config repozitorij'
  if (kind === 'static') return `trajni ključ: ${target} (u varijablama okruženja svih poslova)`
  const deploy = state.config.deployMode === 'push' ? 'staging/produkcija → kubectl apply u svoje okruženje' : 'staging/produkcija → GitHub App token za config repozitorij'
  return `OIDC token posla: registar → push slike; ${deploy}; lint, testovi i skeniranje nemaju token; samo klopa/${state.repo}, grana main`
}

/**
 * Which job the attacker compromises in „Procurio CI ključ”:
 * - 'newest-token' (default with OIDC): the job that holds the newest token that still works – the expiring-token
 *   countdown the break-it is about. No live token → a push job starting now (a fresh full-lifetime token).
 * - 'running-job' (default with a long-lived key): the furthest running job of the newest run – with OIDC usually
 *   lint or tests, which hold no token at all (the least-privilege demo: „napadač nema što ukrasti”).
 * - a station id: that job.
 */
export type LeakTarget = StationId | 'newest-token' | 'running-job'

/**
 * Break-it „Procurio CI ključ”: code running inside a CI job (e.g. a compromised dependency) steals the job's
 * credential (`opts.target`, see LeakTarget; `opts.station` is the same as a station target).
 * - Long-lived key: it is a workflow-level secret every job sees – valid until someone revokes it.
 * - OIDC: only jobs that request a token have one (push; staging/production deploys – in GitOps mode those get a
 *   GitHub App token for the config repository). Lint, tests, build and scan hold nothing to steal. A stolen token
 *   works only for the REST of its lifetime.
 */
export function leakCredential(state: PipelineState, opts: { target?: LeakTarget; station?: StationId } = {}): CredentialLeak {
  const kind = state.config.credential
  const target: LeakTarget = opts.station ?? opts.target ?? (kind === 'oidc' ? 'newest-token' : 'running-job')
  let station: StationId | null = target === 'newest-token' || target === 'running-job' ? null : target
  let runId: number | null = null
  if (target === 'running-job') {
    const active = [...state.runs].reverse().find((r) => isActive(r) && ORDER.some((s) => r.jobs[s].status === 'running'))
    if (active) {
      runId = active.id
      station = [...ORDER].reverse().find((s) => active.jobs[s].status === 'running') ?? null
    }
  }
  let tokenId: number | null = null
  let tokenKind: TokenKind | null = null
  let issuedAt: number | null = null
  let validUntil: number | null = null
  let scope = credentialScope(state, kind)
  let nothing = false
  if (kind === 'oidc') {
    const spec = station ? jobToken(state, station) : null
    if (station && !spec) {
      nothing = true
      scope = 'ovaj posao nema token (nema id-token: write)'
      validUntil = state.t
    } else {
      const live = [...state.tokens].reverse().find((tk) => tk.expiresAt > state.t && (station === null || (tk.station === station && (runId === null || tk.runId === runId))))
      if (live) {
        tokenId = live.id
        tokenKind = live.kind
        issuedAt = live.issuedAt
        validUntil = live.expiresAt
        scope = live.scope
        station ??= live.station
      } else {
        // the compromised job is one starting now: its fresh token lives for the full (sim) lifetime
        station ??= 'push'
        const fresh = jobToken(state, station)
        tokenKind = fresh?.kind ?? 'oidc'
        scope = fresh?.scope ?? scope
        issuedAt = state.t
        validUntil = clean(state.t + state.config.oidcTokenLifetimeSec)
      }
    }
  }
  const leak: CredentialLeak = {
    id: state.nextLeakId++,
    at: state.t,
    kind,
    station,
    scope,
    tokenId,
    tokenKind,
    issuedAt,
    validUntil,
    revokedAt: null,
    attempts: 0,
    successes: 0,
    nextAttemptAt: nothing ? null : clean(state.t + state.config.attackerIntervalSec),
  }
  state.leaks.push(leak)
  if (state.leaks.length > MAX_LEAKS) {
    const drop = state.leaks.find((l) => l.nextAttemptAt === null)
    state.leaks.splice(drop ? state.leaks.indexOf(drop) : 0, 1)
  }
  if (nothing) event(state, 'leak', `U poslu ${stationLabel(station as StationId)} nema oblačnog tokena – napadač nema što ukrasti`, 'ok')
  else
    event(
      state,
      'leak',
      kind === 'static'
        ? 'Procurio trajni CI ključ – vrijedi dok ga netko ne opozove'
        : `Procurio ${tokenKind === 'github-app' ? 'GitHub App token' : 'OIDC token'}${station ? ` posla ${stationLabel(station)}` : ''} – istječe sam za ${fmtSeconds(Math.max(0, (validUntil as number) - state.t))}`,
      'bad',
    )
  return leak
}

/** Revoke every active leaked credential (a long-lived key must then be rotated everywhere). Returns how many. */
export function revokeCredential(state: PipelineState): number {
  let n = 0
  for (const l of state.leaks) {
    if (l.revokedAt === null && leakActive(l, state.t)) {
      l.revokedAt = state.t
      l.validUntil = state.t
      n += 1
    }
  }
  if (n > 0) event(state, 'revoke', 'Vjerodajnica opozvana – napadač više nema pristup', 'ok')
  return n
}

export function leakActive(l: CredentialLeak, t: number): boolean {
  return l.revokedAt === null && (l.validUntil === null || t < l.validUntil)
}

/** Credential panel: what leaked, whether the attacker still has access, how long it lasts. */
export function credentialStatus(state: PipelineState): {
  kind: CredentialKind
  scope: string
  lifetimeLabel: string
  leaks: (CredentialLeak & { active: boolean; remainingSec: number | null; exposureSec: number })[]
  /** Tokens of recent jobs with their countdown (empty for a long-lived key) */
  tokens: (IssuedToken & { valid: boolean; remainingSec: number })[]
  attackerHasAccess: boolean
} {
  const leaks = state.leaks.map((l) => {
    const active = leakActive(l, state.t)
    const end = l.validUntil ?? state.t
    return { ...l, active, remainingSec: l.validUntil === null ? null : clean(Math.max(0, l.validUntil - state.t)), exposureSec: clean(Math.max(0, Math.min(state.t, end) - l.at)) }
  })
  return {
    kind: state.config.credential,
    scope: credentialScope(state, state.config.credential),
    lifetimeLabel: state.config.credential === 'oidc' ? OIDC_TOKEN_LIFETIME.label : 'ne istječe – vrijedi dok ga netko ne opozove',
    leaks,
    tokens: state.tokens.map((tk) => ({ ...tk, valid: tk.expiresAt > state.t, remainingSec: clean(Math.max(0, tk.expiresAt - state.t)) })),
    attackerHasAccess: leaks.some((l) => l.active),
  }
}

// ---------------------------------------------------------------------------------------------
// Step and event processing
// ---------------------------------------------------------------------------------------------

/** Advance the pipeline by `dt` seconds (fixed internal step PIPELINE_DT, events at exact times). */
export function stepPipeline(state: PipelineState, dt: number): void {
  advanceClock(state.clock, dt, (tEnd) => processUntil(state, tEnd))
  state.t = state.clock.t
}

/** Jump to absolute sim time `t` (tests, „skip to the end”). */
export function runPipelineUntil(state: PipelineState, t: number): void {
  if (t <= state.t) return
  stepPipeline(state, t - state.t)
}

/** Run until nothing is in flight (or `maxSec` passes). Runs waiting at the human gate count as idle. */
export function runPipelineUntilIdle(state: PipelineState, maxSec = 6 * 3600): void {
  const limit = state.t + maxSec
  while (state.t < limit && hasPendingWork(state)) stepPipeline(state, 30)
}

/** Time of the next scheduled event (job end, rollback end, incident detection, revert, attacker try, stream commit), or null. */
export function nextEventTime(state: PipelineState): number | null {
  return nextEvent(state)?.time ?? null
}

/**
 * „Sljedeći događaj”: advance to the fixed step that contains the next event and return the events it produced.
 * Nothing scheduled (e.g. only runs waiting at the gate) → no change, [].
 */
export function stepToNextEvent(state: PipelineState): EngineEvent[] {
  const target = nextEventTime(state)
  if (target === null) return []
  const lastId = state.events[state.events.length - 1]?.id ?? 0
  const DT = state.clock.DT
  const ticks = Math.max(1, Math.ceil((target - state.clock.t) / DT - 1e-9))
  stepPipeline(state, Math.max(1e-6, ticks * DT - state.clock.acc))
  return state.events.filter((e) => e.id > lastId)
}

function hasPendingWork(state: PipelineState): boolean {
  if (state.stream?.nextAt != null) return true
  if (state.pendingReverts.length > 0) return true
  if (state.rollback || state.rollbackPending) return true
  if (state.incidents.some((i) => !i.detected)) return true
  return state.runs.some((r) => ORDER.some((s) => r.jobs[s].status === 'running' || (r.jobs[s].status === 'waiting' && s !== 'gate')))
}

interface NextEvt {
  time: number
  prio: number
  a: number
  b: number
  fire: () => void
}

function nextEvent(state: PipelineState): NextEvt | null {
  let best: NextEvt | null = null
  const consider = (e: NextEvt) => {
    if (!best || e.time < best.time - 1e-9 || (Math.abs(e.time - best.time) <= 1e-9 && (e.prio < best.prio || (e.prio === best.prio && (e.a < best.a || (e.a === best.a && e.b < best.b)))))) best = e
  }
  for (const run of state.runs) {
    ORDER.forEach((sid, i) => {
      const j = run.jobs[sid]
      if (j.status === 'running' && j.end !== null) consider({ time: j.end, prio: 0, a: run.id, b: i, fire: () => finishJob(state, run, sid) })
    })
  }
  if (state.rollback) consider({ time: state.rollback.end, prio: 1, a: 0, b: 0, fire: () => finishRollback(state) })
  for (const inc of state.incidents) if (!inc.detected) consider({ time: inc.detectAt, prio: 2, a: inc.id, b: 0, fire: () => detectIncident(state, inc) })
  state.pendingReverts.forEach((p, i) => consider({ time: p.at, prio: 3, a: p.commitId, b: i, fire: () => teamRevert(state, p) }))
  for (const l of state.leaks) if (l.nextAttemptAt !== null) consider({ time: l.nextAttemptAt, prio: 4, a: l.id, b: 0, fire: () => attackerAttempt(state, l) })
  const st = state.stream
  if (st && st.nextAt !== null) consider({ time: st.nextAt, prio: 5, a: 0, b: 0, fire: () => streamArrival(state) })
  return best
}

function processUntil(state: PipelineState, T: number): void {
  for (let guard = 0; guard < 100000; guard++) {
    const e = nextEvent(state)
    if (!e || e.time > T + 1e-9) break
    state.t = clean(Math.max(state.t, e.time))
    e.fire()
    schedule(state)
  }
  state.t = clean(Math.max(state.t, T))
}

function streamArrival(state: PipelineState): void {
  const st = state.stream
  if (!st || st.nextAt === null) return
  const type = st.types[st.index]
  const index = st.index
  st.index += 1
  st.result.arrived += 1
  st.nextAt = st.index < st.types.length ? clean(st.nextAt + st.intervalSec) : null
  makeCommit(state, type, {}, { streamIndex: index, author: 'stream' })
}

/**
 * The team reverts a commit whose defect turned main red (or caused an incident): stream commits on the stream's
 * `revertAfterSec`, every other commit on `config.teamRevertAfterSec` (null = nobody reacts).
 */
function scheduleTeamRevert(state: PipelineState, commitId: number): void {
  const d = state.main.defects.find((x) => x.commitId === commitId)
  if (!d) return
  if (state.pendingReverts.some((p) => p.commitId === commitId)) return
  const st = state.stream
  const after = st && d.author !== 'student' ? st.revertAfterSec : state.config.teamRevertAfterSec
  if (after === null) return
  state.pendingReverts.push({ at: clean(state.t + after), commitId })
  if (d.author === 'student') event(state, 'revert-planned', `Kolega za ${fmtSeconds(after)} vraća ${d.short} (git revert) – crveni main blokira sve`, 'info')
}

function teamRevert(state: PipelineState, p: { at: number; commitId: number }): void {
  state.pendingReverts = state.pendingReverts.filter((x) => x !== p)
  if (!state.main.defects.some((d) => d.commitId === p.commitId)) return
  const st = state.stream
  if (st) st.result.reverts += 1
  makeCommit(state, 'revert', { reverts: p.commitId }, { author: 'team' })
}

function attackerAttempt(state: PipelineState, l: CredentialLeak): void {
  l.attempts += 1
  if (leakActive(l, state.t)) {
    l.successes += 1
    if (l.successes === 1) event(state, 'attack', `Napadač koristi procurjelu vjerodajnicu (${l.kind === 'static' ? 'trajni ključ' : l.tokenKind === 'github-app' ? 'GitHub App token' : 'OIDC token'})`, 'bad')
    l.nextAttemptAt = clean(state.t + state.config.attackerIntervalSec)
  } else {
    l.nextAttemptAt = null
    event(state, 'attack-denied', l.revokedAt !== null ? 'Napadač odbijen: vjerodajnica je opozvana' : 'Napadač odbijen: token je istekao sam od sebe', 'ok')
  }
}

// ---------------------------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------------------------

const deps = (run: PipelineRun, sid: StationId): StationId[] => {
  switch (sid) {
    case 'lint':
      return []
    case 'test':
      return run.cfg.parallelJobs ? [] : ['lint']
    case 'build':
      return ['lint', 'test']
    case 'scan':
      return ['build']
    case 'push':
      return ['scan']
    case 'staging':
      return ['push']
    case 'e2e':
      return ['staging']
    case 'gate':
      return ['e2e']
    case 'prod':
      return ['gate']
  }
}

/** A job is complete when it passed, or was skipped and everything it depends on is complete. */
const complete = (run: PipelineRun, sid: StationId): boolean => {
  const j = run.jobs[sid]
  if (j.status === 'passed') return true
  if (j.status === 'skipped') return deps(run, sid).every((d) => complete(run, d))
  return false
}
const isActive = (run: PipelineRun) => run.status === 'running' || run.status === 'waiting-approval'

function schedule(state: PipelineState): void {
  for (let pass = 0; pass < 50; pass++) {
    let changed = false
    for (const run of state.runs) if (isActive(run) && advanceRun(state, run)) changed = true
    if (grantLocks(state)) changed = true
    for (const run of state.runs) if (isActive(run)) updateRunStatus(state, run)
    if (!changed) break
  }
}

function supersedeWaiting(state: PipelineState, run: PipelineRun, lock: 'staging' | 'prod'): void {
  if (state.config.environmentConcurrency !== 'supersede') return
  for (const other of state.runs) {
    if (other === run || !isActive(other) || other.jobs[lock].status !== 'waiting') continue
    other.cancelledBy = run.id
    for (const s of ORDER) {
      const x = other.jobs[s]
      if (x.status === 'pending' || x.status === 'waiting') {
        x.status = 'stopped'
        x.note = `preskočeno – noviji commit #${run.id} čeka ${lock === 'staging' ? 'staging' : 'produkciju'}`
      }
    }
    state.stats.superseded += 1
    event(state, 'superseded', `#${other.id} preskočen – noviji commit #${run.id} čeka ${lock === 'staging' ? 'staging' : 'produkciju'}`, 'info')
  }
}

function advanceRun(state: PipelineState, run: PipelineRun): boolean {
  let changed = false
  for (const sid of ORDER) {
    const j = run.jobs[sid]
    if (sid === 'gate' && j.status === 'waiting') {
      if (state.config.gate === 'deployment') {
        passGate(state, run, 'auto')
        changed = true
      }
      continue
    }
    if (j.status !== 'pending') continue
    if (!deps(run, sid).every((d) => complete(run, d))) continue
    if (sid === 'staging' && state.config.gate === 'ci') {
      // push already announced „samo CI” for runs that started under it
      for (const s of ['staging', 'e2e', 'gate', 'prod'] as StationId[]) {
        if (run.jobs[s].status === 'pending') {
          run.jobs[s].status = 'skipped'
          run.jobs[s].note = 'samo CI'
        }
      }
      changed = true
      continue
    }
    if (sid === 'gate' && state.config.gate === 'ci') {
      // switched to „samo CI” while this run was in staging/e2e: it stops here, it is never auto-approved
      stopAtRegistry(state, run, ['gate', 'prod'])
      changed = true
      continue
    }
    if (sid === 'staging' || sid === 'prod') {
      j.status = 'waiting'
      j.waitingSince = state.t
      j.note = sid === 'staging' ? 'čeka staging' : 'čeka produkciju'
      supersedeWaiting(state, run, sid)
      const holder = state.locks[sid]
      if (sid === 'staging' && typeof holder === 'number' && holder !== run.id) event(state, 'staging-queued', `#${run.id} čeka staging iza #${holder}`, 'neutral')
      changed = true
      continue
    }
    if (sid === 'gate') {
      j.start = state.t
      if (state.config.gate === 'delivery') {
        j.status = 'waiting'
        j.waitingSince = state.t
        j.note = 'čeka odobrenje'
        if (state.stream?.autoApprove && (run.streamIndex !== null || run.commit.author === 'team')) {
          passGate(state, run, 'human')
          j.note = 'odobreno (tok commitova)'
        } else event(state, 'gate', `#${run.id} (${run.commit.short}) čeka na ljudskim vratima`, 'info')
      } else passGate(state, run, 'auto')
      changed = true
      continue
    }
    startJob(state, run, sid)
    changed = true
  }
  return changed
}

function passGate(state: PipelineState, run: PipelineRun, by: 'auto' | 'human'): void {
  const g = run.jobs.gate
  g.status = 'passed'
  g.start ??= state.t
  g.end = state.t
  g.duration = clean(state.t - g.start)
  g.note = by === 'auto' ? 'automatski' : 'odobreno'
  run.approvedBy = by
  run.gateWaitSec = g.duration
}

function grantLocks(state: PipelineState): boolean {
  let changed = false
  if (state.locks.prod === null && state.rollbackPending) {
    startRollback(state)
    changed = true
  }
  for (const lock of ['staging', 'prod'] as const) {
    if (state.locks[lock] !== null) continue
    let best: PipelineRun | null = null
    for (const run of state.runs) {
      const j = run.jobs[lock]
      if (j.status !== 'waiting' || !isActive(run)) continue
      if (!best || (j.waitingSince ?? 0) < (best.jobs[lock].waitingSince ?? 0) || ((j.waitingSince ?? 0) === (best.jobs[lock].waitingSince ?? 0) && run.id < best.id)) best = run
    }
    if (best) {
      state.locks[lock] = best.id
      startJob(state, best, lock)
      changed = true
    }
  }
  return changed
}

function testCacheWarm(state: PipelineState, run: PipelineRun): boolean {
  return run.cfg.cache && refReadScopes(run).some((k) => state.ciCaches.get(k)?.deps.has(run.commit.depsVersion))
}

/** A job that needs one asks for a short-lived token (OIDC via the cloud trust policy, or a GitHub App token in GitOps). */
function issueToken(state: PipelineState, run: PipelineRun, station: StationId): void {
  if (state.config.credential !== 'oidc') return
  const spec = jobToken(state, station)
  if (!spec) return
  state.stats.tokensIssued += 1
  state.tokens.push({ id: state.nextTokenId++, runId: run.id, station, kind: spec.kind, scope: spec.scope, issuedAt: state.t, expiresAt: clean(state.t + state.config.oidcTokenLifetimeSec) })
  if (state.tokens.length > MAX_TOKENS) state.tokens.splice(0, state.tokens.length - MAX_TOKENS)
}

function coldBuildReason(run: PipelineRun, plan: BuildPlan, cacheEmpty: boolean): string {
  return coldReasonFor(run.cfg.cache, run.commit.trigger, run.commit.vulnerableBase, plan, cacheEmpty)
}

function coldReasonFor(cache: boolean, trigger: 'push' | 'pr', vulnerableBase: boolean, plan: BuildPlan, cacheEmpty: boolean): string {
  if (!cache) return 'predmemorija isključena'
  if (cacheEmpty) return trigger === 'push' ? 'predmemorija maina je prazna' : 'predmemorija je prazna'
  const from = plan.steps.find((s) => s.kind === 'FROM')
  if (from && from.status !== 'cached') return vulnerableBase ? 'nova bazna slika python:3.9-slim-buster' : 'nova bazna slika iza istog taga'
  if (plan.steps.find((s) => s.id === 'api-copy-req')?.status === 'run') return 'promijenjen requirements.txt'
  return 'sloj s ovisnostima nije u predmemoriji'
}

function startJob(state: PipelineState, run: PipelineRun, sid: StationId): void {
  const d = state.config.durations
  const j = run.jobs[sid]
  j.status = 'running'
  j.start = state.t
  j.attempts += 1
  j.note = null
  let dur = 0
  switch (sid) {
    case 'lint':
      dur = d.lint
      break
    case 'test': {
      const warm = testCacheWarm(state, run)
      j.cacheHit = warm
      dur = warm ? d.testCached : d.testCold
      j.note = warm ? 'ovisnosti iz predmemorije' : 'instalacija ovisnosti'
      break
    }
    case 'build': {
      const c = run.commit
      const src = run.cfg.cache ? readCache(state, run) : { layers: createCache(), bases: new Set<string>(), empty: true }
      const plan = ciPlan(state, { codeVersion: c.codeVersion, depsVersion: c.depsVersion, vulnerableBase: c.vulnerableBase }, src.layers, src.bases)
      run.pendingBuild = plan
      const pip = plan.steps.find((s) => s.id === 'api-pip')
      const hit = run.cfg.cache && pip?.status === 'cached'
      j.cacheHit = hit
      dur = hit ? d.buildCached : d.buildCold
      j.note = hit ? 'slojevi iz predmemorije' : `hladna izgradnja – ${coldBuildReason(run, plan, src.empty)}`
      event(state, 'build-cache', hit ? `#${run.id}: slojevi iz predmemorije – izgradnja ${fmtSeconds(dur)}` : `#${run.id}: hladna izgradnja ${fmtSeconds(dur)} – ${coldBuildReason(run, plan, src.empty)}`, hit ? 'info' : 'warn')
      break
    }
    case 'scan':
      dur = d.scan
      break
    case 'push':
      dur = d.push
      issueToken(state, run, sid)
      break
    case 'staging':
      dur = d.staging + (state.config.deployMode === 'gitops' ? state.config.argoPollSec : 0)
      j.note = state.config.deployMode === 'gitops' ? 'bot commit u config repozitorij' : 'kubectl apply'
      issueToken(state, run, sid)
      break
    case 'e2e':
      dur = d.e2e
      break
    case 'prod': {
      const rebuild = state.rebuildNextProd
      if (rebuild) {
        state.rebuildNextProd = false
        run.rebuildForProd = true
      }
      dur = d.prod + (rebuild ? d.buildCold + d.push : 0) + (state.config.deployMode === 'gitops' ? state.config.argoPollSec : 0)
      j.note = rebuild ? 'ponovna izgradnja + postavljanje' : state.config.deployMode === 'gitops' ? 'bot commit u config repozitorij' : 'kubectl apply'
      issueToken(state, run, sid)
      break
    }
    case 'gate':
      break
  }
  j.duration = clean(dur)
  j.end = clean(state.t + dur)
}

function releaseLocks(state: PipelineState, run: PipelineRun): void {
  if (state.locks.staging === run.id) state.locks.staging = null
  if (state.locks.prod === run.id) state.locks.prod = null
}

/** Why the line stopped: a defect in the tree (`flaky`: the flaky test failed every attempt), or null (build error, rejected tag) */
type FailCause = { defect: Defect; flaky?: boolean } | null

function failRun(state: PipelineState, run: PipelineRun, sid: StationId, reason: string, cause: FailCause = null): void {
  const j = run.jobs[sid]
  j.status = 'failed'
  j.note = reason
  run.failedAt = sid
  run.failReason = reason
  run.failedBy = cause?.defect ?? null
  for (const s of ORDER) {
    const x = run.jobs[s]
    if (x.status === 'pending' || x.status === 'waiting' || x.status === 'running') {
      x.status = 'stopped'
      x.note = 'linija zaustavljena'
    }
  }
  releaseLocks(state, run)
  event(state, 'run-failed', `#${run.id} ${run.commit.short}: ${stationLabel(sid)} – ${reason}. Ništa nije postavljeno.`, 'bad')
  const st = state.stream
  if (st && run.streamIndex !== null) {
    const b = st.result.blocked
    if (cause?.flaky) b.flaky += 1
    else if (cause) {
      if (cause.defect.commitId !== run.commit.id) b.inherited += 1
      else if (cause.defect.kind === 'bug') b.tests += 1
      else if (cause.defect.kind === 'secret') b.secret += 1
      else b.scan += 1
    } else b.other += 1
  }
  if (cause && run.commit.trigger === 'push') {
    const d = cause.defect
    if (state.main.defects.some((x) => x.commitId === d.commitId)) {
      event(state, 'main-red', `main je crven: ${DEFECT_LABEL[d.kind]} iz ${d.short} ostaje u svakom sljedećem commitu dok se ${d.short} ne vrati (git revert) ili ispravi`, 'warn')
      scheduleTeamRevert(state, d.commitId)
    }
  }
}

function defectOf(c: Commit, kind: DefectKind): Defect | undefined {
  // the newest such defect in the tree (a commit's own defect wins)
  return c.defects.find((d) => d.kind === kind && d.commitId === c.id) ?? [...c.defects].reverse().find((d) => d.kind === kind)
}

function finishJob(state: PipelineState, run: PipelineRun, sid: StationId): void {
  const j = run.jobs[sid]
  const c = run.commit
  switch (sid) {
    case 'test': {
      if (j.cacheHit === false && run.cfg.cache) cacheScope(state, refScope(run)).deps.add(c.depsVersion)
      const bug = defectOf(c, 'bug')
      if (bug) {
        state.stats.blockedByTests += 1
        const n = c.defects.filter((d) => d.kind === 'bug').length
        return failRun(state, run, sid, `${plural(n, ['test pao', 'testa pala', 'testova palo'])}: test_popust_cevap_petak (greška iz ${bug.short})`, { defect: bug })
      }
      // Every flaky test in the tree (inherited ones too) can fail an attempt: the suite fails if any of them does.
      const flaky = c.defects.filter((d) => d.kind === 'flaky')
      if (flaky.length > 0) {
        const p = state.config.flakyFailProb
        if (state.rng.chance(flaky.length === 1 ? p : 1 - (1 - p) ** flaky.length)) {
          state.stats.flakyFailedAttempts += 1
          state.trust = clean(Math.max(0, state.trust - 0.1))
          if (j.attempts <= state.config.flakyRetries) {
            event(state, 'flaky', `#${run.id}: nestabilan test pao – ponovni pokušaj ${j.attempts + 1}/${state.config.flakyRetries + 1}`, 'warn')
            startJob(state, run, sid)
            j.note = `ponovni pokušaj ${j.attempts}`
            return
          }
          state.stats.flakyRuns += 1
          const d = flaky[flaky.length - 1]
          return failRun(state, run, sid, `nestabilan test pao ${j.attempts} puta${d.commitId !== c.id ? ` (test iz ${d.short})` : ''}`, { defect: d, flaky: true })
        }
        if (j.attempts > 1) state.stats.flakyRuns += 1
      } else if (j.attempts === 1) state.trust = clean(Math.min(1, state.trust + 0.02))
      j.status = 'passed'
      break
    }
    case 'build': {
      const plan = run.pendingBuild
      run.pendingBuild = null
      if (plan) {
        run.buildSteps = plan.steps.map((s) => ({
          id: s.id,
          text: s.text,
          status: s.status,
          reason: s.reason,
          duration: s.duration,
          sizeMB: s.sizeMB,
          layerDigest: s.layer?.digest ?? null,
        }))
      }
      if (!plan?.ok || !plan.image) return failRun(state, run, sid, plan?.error?.message ?? 'izgradnja nije uspjela')
      if (run.cfg.cache) {
        const sc = cacheScope(state, run.cacheScope)
        applyPlanWrites(plan, sc.layers, sc.bases)
      }
      run.image = plan.image
      run.digest = plan.image.digest
      j.status = 'passed'
      break
    }
    case 'scan': {
      const vuln = defectOf(c, 'vulnerable-base')
      if (vuln) {
        state.stats.blockedByScan += 1
        return failRun(state, run, sid, `kritična ranjivost u baznoj slici python:3.9-slim-buster (iz ${vuln.short})`, { defect: vuln })
      }
      const secret = defectOf(c, 'secret')
      if (secret) {
        state.stats.blockedBySecret += 1
        noteSecretInHistory(state, secret)
        return failRun(state, run, sid, `pronađena tajna SMS_API_KEY u klopa/settings.py (iz ${secret.short})`, { defect: secret })
      }
      j.status = 'passed'
      break
    }
    case 'push': {
      const image = run.image as Image
      const tags = [c.short, ...(c.version ? [c.version] : [])]
      const plan = planPush(state.registry, image, state.repo, tags)
      if (plan.rejectedTags.length > 0) return failRun(state, run, sid, plan.rejectedTags[0].reason)
      applyPush(state.registry, image, plan, state.t)
      run.tags = tags
      j.status = 'passed'
      j.note = `${tags.join(', ')} → ${shortDigest(image.digest)}`
      event(state, 'pushed', `#${run.id}: ${state.repo}:${tags.join(', ')} → ${shortDigest(image.digest)}`, 'ok')
      if (state.config.gate === 'ci') event(state, 'ci-only', `#${run.id}: slika je u registru – samo CI, ništa se ne postavlja`, 'info')
      break
    }
    case 'staging':
      run.stagingDigest = run.digest
      j.status = 'passed'
      if (state.config.deployMode === 'gitops' && run.digest) configCommit(state, 'staging', run.digest, 'bot', run.id)
      event(state, 'staging-done', `#${run.id} na stagingu (${shortDigest(run.digest)}) – ${run.jobs.e2e.status === 'skipped' ? 'e2e preskočeni' : 'slijede e2e testovi'}`, 'neutral')
      if (run.jobs.e2e.status === 'skipped' && state.locks.staging === run.id) state.locks.staging = null
      break
    case 'e2e': {
      if (state.locks.staging === run.id) state.locks.staging = null
      const bug = defectOf(c, 'bug')
      if (bug) return failRun(state, run, sid, `e2e: krivi iznos u košarici (greška iz ${bug.short})`, { defect: bug })
      j.status = 'passed'
      break
    }
    case 'prod':
      return finishProd(state, run)
    default:
      j.status = 'passed'
  }
}

function noteSecretInHistory(state: PipelineState, d: Defect): void {
  if (state.secretsInHistory.some((s) => s.commitId === d.commitId)) return
  state.secretsInHistory.push({ name: 'SMS_API_KEY', commitId: d.commitId, short: d.short, at: state.t, rotated: false })
  if (state.secretsInHistory.length > MAX_SECRETS) state.secretsInHistory.splice(0, state.secretsInHistory.length - MAX_SECRETS)
  state.stats.secretsInHistory += 1
  event(state, 'secret-in-history', `SMS_API_KEY je već u povijesti Gita (commit ${d.short}, poslan prije skeniranja) – opozovite ga i zamijenite`, 'bad')
}

function configCommit(state: PipelineState, env: 'staging' | 'production', digest: string, kind: 'bot' | 'revert', runId: number | null, message?: string): ConfigCommit {
  const id = state.nextConfigId++
  const sha = sha256Hex(`config|${state.seed}|${id}|${env}|${digest}|${kind}`).slice(0, 40)
  const cc: ConfigCommit = {
    id,
    t: state.t,
    sha,
    short: sha.slice(0, 7),
    env,
    digest,
    kind,
    by: kind === 'bot' ? 'ci-bot' : 'on-call',
    runId,
    message: message ?? `${env}: ${state.repo}@${shortDigest(digest)}`,
  }
  state.configRepo.push(cc)
  if (state.configRepo.length > MAX_CONFIG_COMMITS) state.configRepo.splice(0, state.configRepo.length - MAX_CONFIG_COMMITS)
  return cc
}

function finishProd(state: PipelineState, run: PipelineRun): void {
  const j = run.jobs.prod
  let digest = run.digest as string
  if (run.rebuildForProd) {
    // A separate production build on a fresh runner: RUN layers get new timestamps, and the base tag may
    // resolve to a newer image by now (updateBaseImage) → a new digest that no test has seen.
    const c = run.commit
    const plan = ciPlan(state, { codeVersion: c.codeVersion, depsVersion: c.depsVersion, vulnerableBase: c.vulnerableBase }, createCache(), new Set())
    const image = plan.image as Image
    const pplan = planPush(state.registry, image, state.repo, run.tags)
    if (pplan.rejectedTags.length > 0) {
      if (state.locks.prod === run.id) state.locks.prod = null
      return failRun(state, run, 'prod', `registar odbio ponovnu izgradnju: ${pplan.rejectedTags[0].reason}`)
    }
    applyPush(state.registry, image, pplan, state.t)
    digest = image.digest
    const tested = run.image as Image
    const reasons = ['nove vremenske oznake RUN slojeva']
    if (image.layers[0]?.digest !== tested.layers[0]?.digest) reasons.unshift('nova bazna slika iza istog taga')
    run.rebuildNote = reasons.join(', ')
  }
  if (state.locks.prod === run.id) state.locks.prod = null
  j.status = 'passed'
  run.prodDigest = digest
  run.tested = digest === run.digest
  run.leadTimeSec = clean(state.t - run.commit.createdAt)
  // a flaky test ships nothing broken; bugs, vulnerable bases and secrets do
  const shipped = run.commit.defects.filter(harmful)
  const bad = shipped.length > 0
  const cc = state.config.deployMode === 'gitops' ? configCommit(state, 'production', digest, 'bot', run.id) : null
  state.prod = {
    digest,
    runId: run.id,
    since: state.t,
    bad,
    tested: run.tested,
    version: run.commit.version ?? run.commit.short,
    builtBy: 'ci',
    commit: run.commit.short,
    defects: shipped.map((d) => d.commitId),
  }
  pushCapped(state.prodHistory, { t: state.t, digest, runId: run.id, kind: 'deploy', bad, via: cc ? 'config-repo' : 'kubectl', configSha: cc?.short ?? null })
  pushCapped(state.deployments, { t: state.t, runId: run.id, digest, leadTimeSec: run.leadTimeSec, bad, tested: run.tested, approvedBy: run.approvedBy ?? 'auto' })
  state.stats.deploys += 1
  if (run.approvedBy === 'human') {
    state.stats.approvals += 1
    state.stats.firstApprovalDeployAt ??= state.t
  } else {
    state.stats.autoDeploys += 1
    if (state.stats.firstApprovalDeployAt !== null) state.stats.firstAutoAfterApprovalAt ??= state.t
  }
  if (!run.cfg.skipTests && run.tested && (state.stats.bestLeadTimeAllChecksSec === null || run.leadTimeSec < state.stats.bestLeadTimeAllChecksSec)) {
    state.stats.bestLeadTimeAllChecksSec = run.leadTimeSec
  }
  const st = state.stream
  if (st && (run.streamIndex !== null || run.commit.author === 'team')) {
    st.result.deployed += 1
    if (bad) st.result.badInProd += 1
  }
  if (!run.tested) {
    state.stats.untestedDeploys += 1
    event(state, 'untested', `#${run.id}: produkcija pokreće ${shortDigest(digest)} – testiran je bio ${shortDigest(run.digest)} (${run.rebuildNote}). Drugi artefakt!`, 'bad')
  } else {
    event(state, 'prod', `#${run.id} ${run.commit.short} u produkciji (${shortDigest(digest)}${cc ? `, config ${cc.short}` : ''}) – od commita ${fmtSeconds(run.leadTimeSec)}`, bad ? 'warn' : 'ok')
  }
  const open = state.incidents.find((i) => i.resolvedAt === null)
  if (bad) {
    state.stats.failedDeploys += 1
    state.stats.badInProd += 1
    if (!open) {
      pushCapped(state.incidents, {
        id: state.nextIncidentId++,
        runId: run.id,
        culprits: shipped.map((d) => d.commitId),
        startedAt: state.t,
        detectAt: clean(state.t + state.config.incidentDetectSec),
        detected: false,
        resolvedAt: null,
        recoverySec: null,
        how: null,
        rollbackVia: null,
        resolvedBeforeDetection: false,
      })
    }
  } else if (open) {
    const how: IncidentResolution = run.commit.id > open.runId ? (run.commit.type === 'revert' ? 'revert' : 'fix-forward') : 'older-commit'
    resolveIncident(state, open, how, null)
  }
}

function pushCapped<T>(list: T[], item: T): void {
  list.push(item)
  if (list.length > MAX_HISTORY) list.splice(0, list.length - MAX_HISTORY)
}

function detectIncident(state: PipelineState, inc: Incident): void {
  inc.detected = true
  if (inc.resolvedAt !== null) return
  event(state, 'incident', `Incident: korisnici prijavljuju krivi obračun (otkriveno nakon ${fmtSeconds(state.t - inc.startedAt)})`, 'bad')
  if (state.config.rollbackOnIncident) state.rollbackPending = true
  // the stream's team also takes the defect out of main, or the next deploy ships it again
  for (const id of inc.culprits) scheduleTeamRevert(state, id)
}

function lastGoodDigest(state: PipelineState): string | null {
  for (let i = state.prodHistory.length - 1; i >= 0; i--) if (!state.prodHistory[i].bad) return state.prodHistory[i].digest
  return null
}

function startRollback(state: PipelineState): void {
  state.rollbackPending = false
  const target = lastGoodDigest(state)
  const open = state.incidents.find((i) => i.resolvedAt === null)
  if (!target || !open || !state.prod.bad) return
  state.locks.prod = 'rollback'
  if (state.config.deployMode === 'gitops') {
    // GitOps: the rollback is a commit – git revert in the config repository; Argo CD then syncs the old digest.
    const cc = configCommit(state, 'production', target, 'revert', null, `Revert „production: ${state.repo}@${shortDigest(state.prod.digest)}”`)
    state.rollback = { start: state.t, end: clean(state.t + state.config.durations.rollback + state.config.argoPollSec), target, via: 'git-revert', configSha: cc.short }
    event(state, 'rollback-start', `Dežurna osoba: git revert u config repozitoriju (${cc.short}) – Argo CD vraća ${shortDigest(target)}`, 'warn')
  } else {
    state.rollback = { start: state.t, end: clean(state.t + state.config.durations.rollback), target, via: 'redeploy', configSha: null }
    event(state, 'rollback-start', `Dežurna osoba vraća prethodnu verziju (${shortDigest(target)}) – ponovno postavljanje starog digesta`, 'warn')
  }
}

function finishRollback(state: PipelineState): void {
  const rb = state.rollback
  if (!rb) return
  state.rollback = null
  if (state.locks.prod === 'rollback') state.locks.prod = null
  state.prod = { ...state.prod, digest: rb.target, runId: null, since: state.t, bad: false, tested: true, version: 'povratak', defects: [] }
  pushCapped(state.prodHistory, { t: state.t, digest: rb.target, runId: null, kind: 'rollback', bad: false, via: rb.via === 'git-revert' ? 'config-repo' : 'kubectl', configSha: rb.configSha })
  state.stats.rollbacks += 1
  const open = state.incidents.find((i) => i.resolvedAt === null)
  if (open) resolveIncident(state, open, 'rollback', rb.via)
}

const HOW_LABEL: Record<IncidentResolution, string> = {
  rollback: 'povratak na prethodnu verziju',
  revert: 'git revert lošeg commita',
  'fix-forward': 'novi commit s ispravkom',
  'older-commit': 'postavljen stariji commit bez greške',
}

function resolveIncident(state: PipelineState, inc: Incident, how: IncidentResolution, via: Incident['rollbackVia']): void {
  inc.resolvedAt = state.t
  inc.recoverySec = clean(state.t - inc.startedAt)
  inc.how = how
  inc.rollbackVia = via
  inc.resolvedBeforeDetection = !inc.detected
  inc.detected = true
  event(
    state,
    'recovered',
    `Produkcija oporavljena (${how === 'rollback' && via === 'git-revert' ? 'git revert u config repozitoriju' : HOW_LABEL[how]}) nakon ${fmtSeconds(inc.recoverySec)}${inc.resolvedBeforeDetection ? ' – prije nego što je incident otkriven' : ''}`,
    'ok',
  )
}

function updateRunStatus(state: PipelineState, run: PipelineRun): void {
  const prev = run.status
  if (run.cancelledBy !== null) run.status = 'cancelled'
  else if (ORDER.some((s) => run.jobs[s].status === 'failed')) run.status = 'failed'
  else if (run.jobs.prod.status === 'passed') run.status = 'in-prod'
  else if (run.jobs.gate.status === 'waiting') run.status = 'waiting-approval'
  else if (ORDER.every((s) => ['passed', 'skipped'].includes(run.jobs[s].status))) run.status = run.commit.trigger === 'pr' ? 'checks-passed' : 'in-registry'
  else run.status = 'running'
  if (prev !== run.status && !isActive(run) && run.finishedAt === null) {
    run.finishedAt = state.t
    state.stats.finishedRuns += 1
    if (run.status === 'checks-passed') event(state, 'pr-ok', `#${run.id} (PR): provjere prošle – spajanje pokreće cijeli pipeline`, 'ok')
    const st = state.stream
    if (st && run.streamIndex !== null) {
      st.result.finished += 1
      if (run.status === 'cancelled') st.result.blocked.superseded += 1
    }
    checkStreamGoal(state)
  }
}

function checkStreamGoal(state: PipelineState): void {
  const st = state.stream
  if (!st || st.types.length < 20 || state.stats.zeroBadOf20Achieved) return
  const r = st.result
  if (r.finished >= st.types.length && r.badInProd === 0 && r.deployed >= 1) {
    state.stats.zeroBadOf20Achieved = true
    event(state, 'goal', `Tok od ${st.types.length} commitova: 0 loših u produkciji (${r.deployed} postavljanja)`, 'ok')
  }
}

function trimRuns(state: PipelineState): void {
  if (state.runs.length <= MAX_RUNS_KEPT) return
  const removable = state.runs.filter((r) => !isActive(r)).slice(0, state.runs.length - MAX_RUNS_KEPT)
  const drop = new Set(removable)
  state.runs = state.runs.filter((r) => !drop.has(r))
}

// ---------------------------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------------------------

/** Where a run is on the assembly line: the furthest active station and its progress 0..1 (pass `simNow(s)` for smooth bars). */
export function runPosition(run: PipelineRun, t: number): { station: StationId | null; progress: number; status: RunStatus } {
  let station: StationId | null = null
  let progress = 0
  for (const sid of ORDER) {
    const j = run.jobs[sid]
    if (j.status === 'running' || j.status === 'waiting') {
      station = sid
      progress = j.status === 'running' && j.duration > 0 && j.start !== null ? clean(Math.min(1, Math.max(0, (t - j.start) / j.duration))) : 0
    } else if (j.status === 'failed') {
      station = sid
      progress = 1
    }
  }
  if (!station) {
    const last = [...ORDER].reverse().find((s) => run.jobs[s].status === 'passed')
    station = last ?? null
    progress = 1
  }
  return { station, progress, status: run.status }
}

/**
 * Best-case lead time with the given settings: every cache warm, no waiting (pure arithmetic). Label it as the best
 * case; `predictLeadTime(state)` gives what the next commit would really take with the current caches.
 */
export function idealLeadTime(
  opts: { parallelJobs: boolean; cache: boolean; skipTests: boolean; gate?: GateMode },
  durations: PipelineDurations = DEFAULT_DURATIONS,
): number {
  const test = opts.skipTests ? 0 : opts.cache ? durations.testCached : durations.testCold
  const pre = opts.parallelJobs ? Math.max(durations.lint, test) : durations.lint + test
  const build = opts.cache ? durations.buildCached : durations.buildCold
  const ci = pre + build + durations.scan + durations.push
  if (opts.gate === 'ci') return clean(ci)
  return clean(ci + durations.staging + (opts.skipTests ? 0 : durations.e2e) + durations.prod)
}

/** Duration of the PR checks only (lint, tests, build, scan) with the given settings – the PR half of L24's path. */
export function idealPrChecksTime(opts: { parallelJobs: boolean; cache: boolean; skipTests: boolean }, durations: PipelineDurations = DEFAULT_DURATIONS): number {
  const test = opts.skipTests ? 0 : opts.cache ? durations.testCached : durations.testCold
  const pre = opts.parallelJobs ? Math.max(durations.lint, test) : durations.lint + test
  return clean(pre + (opts.cache ? durations.buildCached : durations.buildCold) + durations.scan)
}

export interface LeadTimePrediction {
  /** Seconds from the commit to the end of the last station it reaches (production, registry, PR checks, or the failing station) */
  seconds: number
  until: 'prod' | 'registry' | 'checks'
  /** Duration of each station the commit would go through (0 = skipped) */
  perStation: Partial<Record<StationId, number>>
  /** Which caches would be cold right now, and why (first reason: build, else tests) */
  cold: { test: boolean; build: boolean; reason: string | null }
  /** The station that would stop the line (a red main, or this commit's own defect), null if it gets through */
  failsAt: StationId | null
  /** What the prediction leaves out (Croatian, for a footnote) */
  excludes: string
}

/**
 * „Predvidi” for the NEXT commit with the current settings and the current caches – unlike `idealLeadTime` (the best
 * case with warm caches). A cache switched on a moment ago is still empty, so the first commit after it is cold
 * (860 s, not 540 s). Pure: runs a dry layer-cache plan and changes nothing.
 * Leaves out waits: the human gate, the queue for staging/production, retried flaky tests.
 */
export function predictLeadTime(state: PipelineState, opts: { type?: CommitType; changesDeps?: boolean; trigger?: 'push' | 'pr' } = {}): LeadTimePrediction {
  const cfg = state.config
  const d = cfg.durations
  const type = opts.type ?? 'ok'
  const trigger = opts.trigger ?? 'push'
  const runId = state.nextRunId
  let defects = [...state.main.defects]
  if (type === 'revert' || type === 'fix') defects = defects.slice(0, -1)
  const own = INTRODUCES[type]
  const kinds = new Set([...defects.map((x) => x.kind), ...(own ? [own] : [])])
  const depsVersion = opts.changesDeps ? state.nextDepsVersion + 1 : state.main.depsVersion
  const vulnerableBase = kinds.has('vulnerable-base')
  // caches as they are now (a PR has no scope of its own yet: it reads main's)
  const testWarm = cfg.cache && readScopesFor(trigger, runId).some((k) => state.ciCaches.get(k)?.deps.has(depsVersion) ?? false)
  const src = cfg.cache ? readCacheFor(state, trigger, runId) : { layers: createCache(), bases: new Set<string>(), empty: true }
  const plan = ciPlan(state, { codeVersion: state.nextCodeVersion + 1, depsVersion, vulnerableBase }, src.layers, src.bases, true)
  const buildHit = cfg.cache && plan.steps.find((x) => x.id === 'api-pip')?.status === 'cached'
  const gitops = cfg.deployMode === 'gitops' ? cfg.argoPollSec : 0
  const per: Partial<Record<StationId, number>> = {
    lint: d.lint,
    test: cfg.skipTests ? 0 : testWarm ? d.testCached : d.testCold,
    build: buildHit ? d.buildCached : d.buildCold,
    scan: d.scan,
  }
  const until: LeadTimePrediction['until'] = trigger === 'pr' ? 'checks' : cfg.gate === 'ci' ? 'registry' : 'prod'
  if (until !== 'checks') per.push = d.push
  if (until === 'prod') {
    per.staging = d.staging + gitops
    per.e2e = cfg.skipTests ? 0 : d.e2e
    per.prod = d.prod + (state.rebuildNextProd ? d.buildCold + d.push : 0) + gitops
  }
  const failsAt: StationId | null = kinds.has('bug') && !cfg.skipTests ? 'test' : vulnerableBase || kinds.has('secret') ? 'scan' : null
  const test = per.test ?? 0
  const pre = cfg.parallelJobs ? Math.max(d.lint, test) : d.lint + test
  let seconds: number
  if (failsAt === 'test') seconds = cfg.parallelJobs ? test : d.lint + test
  else {
    seconds = pre + (per.build ?? 0) + (per.scan ?? 0)
    if (failsAt === null) seconds += (per.push ?? 0) + (per.staging ?? 0) + (per.e2e ?? 0) + (per.prod ?? 0)
  }
  const coldTest = cfg.cache && !cfg.skipTests && !testWarm
  const reason = !cfg.cache
    ? 'predmemorija isključena'
    : !buildHit
      ? coldReasonFor(cfg.cache, trigger, vulnerableBase, plan, src.empty)
      : coldTest
        ? opts.changesDeps
          ? 'promijenjen requirements.txt'
          : 'predmemorija ovisnosti je prazna'
        : null
  const waits = [cfg.gate === 'delivery' && until === 'prod' ? 'čekanje na ljudskim vratima' : null, 'red za staging i produkciju', kinds.has('flaky') ? 'ponovljeni nestabilni testovi' : null].filter(Boolean)
  return {
    seconds: clean(seconds),
    until,
    perStation: per,
    cold: { test: !cfg.skipTests && !testWarm, build: !buildHit, reason },
    failsAt,
    excludes: `bez: ${waits.join(', ')}`,
  }
}

export interface DoraMetrics {
  deployments: number
  windowSec: number
  /** Deployments per day / hour of simulated time (null when no time has passed) */
  perDay: number | null
  perHour: number | null
  /** Median commit → production, seconds */
  leadTimeMedianSec: number | null
  leadTimeLastSec: number | null
  /** failed / all deployments, 0..1 */
  changeFailureRate: number | null
  failedDeployments: number
  /** Median „failed deployment recovery time” (vrijeme oporavka od neuspjelog postavljanja) */
  recoveryMedianSec: number | null
  openIncident: boolean
}

/** The four DORA metrics over the last `windowSec` (default: whole run). Never NaN: missing data → null. */
export function dora(state: PipelineState, windowSec?: number): DoraMetrics {
  const from = windowSec === undefined ? 0 : Math.max(0, state.t - windowSec)
  const span = state.t - from
  const deps = state.deployments.filter((d) => d.t >= from)
  const failed = deps.filter((d) => d.bad).length
  const recov = state.incidents.filter((i) => i.recoverySec !== null && (i.resolvedAt ?? 0) >= from).map((i) => i.recoverySec as number)
  const leads = deps.map((d) => d.leadTimeSec)
  return {
    deployments: deps.length,
    windowSec: clean(span),
    perDay: span > 0 ? clean((deps.length * 86400) / span) : null,
    perHour: span > 0 ? clean((deps.length * 3600) / span) : null,
    leadTimeMedianSec: leads.length ? percentile(leads, 50) : null,
    leadTimeLastSec: leads.length ? leads[leads.length - 1] : null,
    changeFailureRate: deps.length ? clean(failed / deps.length) : null,
    failedDeployments: failed,
    recoveryMedianSec: recov.length ? percentile(recov, 50) : null,
    openIncident: state.incidents.some((i) => i.resolvedAt === null),
  }
}

/** Recent values for the DORA panel's sparklines (oldest first): lead time per deployment, recovery per resolved incident. */
export function doraSeries(state: PipelineState, n = 20): { leadTimeSec: number[]; bad: boolean[]; recoverySec: number[] } {
  const k = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 20
  const deps = k > 0 ? state.deployments.slice(-k) : []
  const rec = state.incidents.filter((i) => i.recoverySec !== null).map((i) => i.recoverySec as number)
  return { leadTimeSec: deps.map((d) => d.leadTimeSec), bad: deps.map((d) => d.bad), recoverySec: k > 0 ? rec.slice(-k) : [] }
}

/**
 * The three L21 tasks („Zadaci”), sticky once reached:
 * - lead time < 10 min for a deploy that ran every check and shipped the tested digest;
 * - „0 od 20”: a stream of ≥ 20 commits finished with ≥ 1 deploy and no bad commit in production
 *   (only that stream counts – earlier experiments do not);
 * - a deploy through the human gate, then an automatic one.
 */
export function pipelineGoals(state: PipelineState): { leadTimeUnder10MinAllChecks: boolean; zeroBadOf20: boolean; deliveryThenDeployment: boolean } {
  const best = state.stats.bestLeadTimeAllChecksSec
  return {
    leadTimeUnder10MinAllChecks: best !== null && best < 600,
    zeroBadOf20: state.stats.zeroBadOf20Achieved,
    deliveryThenDeployment: state.stats.firstApprovalDeployAt !== null && state.stats.firstAutoAfterApprovalAt !== null,
  }
}

/** Running and waiting runs per station (ids, oldest first) – queue lengths for „+26 u redu” badges. */
export function stationQueues(state: PipelineState): Record<StationId, { running: number[]; waiting: number[] }> {
  const out = Object.fromEntries(ORDER.map((s) => [s, { running: [] as number[], waiting: [] as number[] }])) as Record<StationId, { running: number[]; waiting: number[] }>
  for (const run of state.runs) {
    if (!isActive(run)) continue
    for (const s of ORDER) {
      const j = run.jobs[s]
      if (j.status === 'running') out[s].running.push(run.id)
      else if (j.status === 'waiting') out[s].waiting.push(run.id)
    }
  }
  for (const s of ORDER) out[s].waiting.sort((a, b) => (state.runs.find((r) => r.id === a)?.jobs[s].waitingSince ?? 0) - (state.runs.find((r) => r.id === b)?.jobs[s].waitingSince ?? 0) || a - b)
  return out
}

export interface PipelineViewOptions {
  /** Finished runs to keep on the line (default 8) */
  recent?: number
  /** Active runs drawn per station (default unlimited); the rest go to `overflow` */
  maxPerStation?: number
  /** Time for progress bars (default state.t; pass simNow(s) for smooth bars) */
  at?: number
}

/** Runs to draw on the line (everything in flight, capped per station, plus the last `recent` finished) and the overflow per station. */
export function pipelineBoard(state: PipelineState, opts: PipelineViewOptions = {}): { runs: (PipelineRun & { position: ReturnType<typeof runPosition> })[]; overflow: Record<StationId, number> } {
  const recent = Number.isFinite(opts.recent) ? Math.max(0, Math.floor(opts.recent as number)) : 8
  const cap = Number.isFinite(opts.maxPerStation) ? Math.max(0, Math.floor(opts.maxPerStation as number)) : Infinity
  const at = opts.at !== undefined && Number.isFinite(opts.at) ? opts.at : state.t
  const overflow = Object.fromEntries(ORDER.map((s) => [s, 0])) as Record<StationId, number>
  const perStation = Object.fromEntries(ORDER.map((s) => [s, 0])) as Record<StationId, number>
  const shown: PipelineRun[] = []
  for (const r of state.runs.filter(isActive)) {
    const st = runPosition(r, at).station
    if (st && perStation[st] >= cap) {
      overflow[st] += 1
      continue
    }
    if (st) perStation[st] += 1
    shown.push(r)
  }
  const finished = recent > 0 ? state.runs.filter((r) => !isActive(r)).slice(-recent) : []
  const runs = [...finished, ...shown].sort((a, b) => a.id - b.id).map((r) => ({ ...r, position: runPosition(r, at) }))
  return { runs, overflow }
}

/** Runs to draw on the line: everything in flight plus the last `recent` finished ones (`pipelineBoard` adds per-station caps). */
export function pipelineView(state: PipelineState, opts: number | PipelineViewOptions = 8): (PipelineRun & { position: ReturnType<typeof runPosition> })[] {
  return pipelineBoard(state, typeof opts === 'number' ? { recent: opts } : opts).runs
}

export interface TimelineEntry {
  station: StationId
  label: string
  status: JobStatus
  /** Seconds after the commit */
  start: number | null
  end: number | null
  note: string | null
  /** Wall clock at the start („11:51”), when a state is passed */
  atClock?: string | null
}

/** One run as a scrubbable timeline (L24 „Put jednog commita”): station, start/end relative to the commit. */
export function commitTimeline(run: PipelineRun, state?: PipelineState, t0: number = run.commit.createdAt): TimelineEntry[] {
  return STATIONS.map(({ id, label }) => {
    const j = run.jobs[id]
    const entry: TimelineEntry = {
      station: id,
      label,
      status: j.status,
      start: j.start === null ? null : clean(j.start - t0),
      end: j.end === null || j.status === 'running' || j.status === 'waiting' ? null : clean(j.end - t0),
      note: j.note,
    }
    if (state) entry.atClock = j.start === null ? null : wallClock(state, j.start)
    return entry
  })
}

/**
 * L24 „Put jednog commita”: the PR checks and the merged main run as one timeline, offsets from the PR commit
 * (or from the commit itself when the run is not a merge). PR stations that do not run (push … prod) are left out.
 */
export function commitJourney(state: PipelineState, runId: number): (TimelineEntry & { runId: number; phase: 'pr' | 'main' })[] {
  const run = state.runs.find((r) => r.id === runId)
  if (!run) return []
  const pr = run.mergedFrom !== null ? (state.runs.find((r) => r.id === run.mergedFrom) ?? null) : null
  const t0 = (pr ?? run).commit.createdAt
  const prPart = pr ? commitTimeline(pr, state, t0).filter((e) => e.status !== 'skipped').map((e) => ({ ...e, runId: pr.id, phase: 'pr' as const })) : []
  return [...prPart, ...commitTimeline(run, state, t0).map((e) => ({ ...e, runId: run.id, phase: 'main' as const }))]
}

export interface ReleaseDayJourney {
  /** PR checks + the merged main run, offsets from the PR commit, with wall-clock labels */
  entries: (TimelineEntry & { runId: number; phase: 'pr' | 'main' })[]
  prRunId: number
  mainRunId: number
  /** Wall clock when 2.0.2 is in production („11:59:40”), and the same in seconds from the PR commit */
  prodAt: string
  prodAtSec: number
  /** What the production node downloads (only the code layer with the cache) */
  downloadMB: number
  changedLayers: number
  totalLayers: number
  /** Digest built on main and promoted (the PR's digest differs with the default 'gha' cache: main rebuilds COPY . .) */
  digest: string
  prDigest: string | null
  /** The state after the journey (for drill-down views) */
  state: PipelineState
}

/**
 * L24 „Put jednog commita”, deterministic: a fresh `dan-izdanja` state (clock 11:48), Lana's PR with the 2.0.2 fix,
 * merged `mergeDelaySec` after its checks pass (default 0 = at once), then run until 2.0.2 is in production.
 * With the defaults: PR checks end 11:50:40, production at 11:59:40, the node downloads 0,9 MB (1 of 7 layers).
 * Every 20 s of merge delay moves production by 20 s (11:59:40 + delay), so a delay over 20 s misses 12:00.
 */
export function releaseDayJourney(opts: { seed?: number; mergeDelaySec?: number; config?: PipelineConfig } = {}): ReleaseDayJourney {
  const s = createPipeline({ ...PIPELINE_PRESETS['dan-izdanja'], ...(opts.config ?? {}), ...(opts.seed !== undefined ? { seed: opts.seed } : {}) })
  const pr = commit(s, 'ok', { trigger: 'pr', message: 'Ispravak popusta za Ćevap-petak' })
  for (let i = 0; i < 1000 && isActive(pr); i++) if (stepToNextEvent(s).length === 0 && nextEventTime(s) === null) break
  const delay = num(opts.mergeDelaySec, 0)
  if (delay > 0) runPipelineUntil(s, s.t + delay)
  const merged = mergePullRequest(s, pr.id, { version: 'next-patch' })
  if (!merged) throw new Error(`E4: PR #${pr.id} nije prošao provjere (${pr.status})`)
  for (let i = 0; i < 1000 && isActive(merged); i++) if (stepToNextEvent(s).length === 0 && nextEventTime(s) === null) break
  const diff = lastPromotionDiff(s)
  const endAt = merged.jobs.prod.end ?? merged.finishedAt ?? s.t
  return {
    entries: commitJourney(s, merged.id),
    prRunId: pr.id,
    mainRunId: merged.id,
    prodAt: wallClock(s, endAt, true),
    prodAtSec: clean(endAt - pr.commit.createdAt),
    downloadMB: diff?.downloadMB ?? 0,
    changedLayers: diff?.changed ?? 0,
    totalLayers: diff ? diff.layers.length : 0,
    digest: merged.prodDigest ?? merged.digest ?? '',
    prDigest: pr.digest,
    state: s,
  }
}

/** The reference a deployment uses: `registry.klopa.example/klopa-api:2.0.2@sha256:…` (tag for people, digest for the node). Null before push. */
export function deployRef(state: PipelineState, run: PipelineRun): string | null {
  const digest = run.prodDigest ?? run.digest
  if (!digest || run.tags.length === 0) return null
  return `${state.config.registryHost}/${state.repo}:${run.commit.version ?? run.commit.short}@${digest}`
}

export interface PromotionDiff {
  /** Production's previous digest */
  from: string | null
  to: string
  /** What the latest production move was: a deploy or a rollback to an older digest */
  kind: 'deploy' | 'rollback' | 'initial'
  /** Layers of `to` already on the node / downloaded */
  shared: number
  changed: number
  downloadMB: number
  totalMB: number
  /** `changed` = the node downloads it */
  layers: { digest: string; label: string; sizeMB: number; changed: boolean }[]
  /** Layers that differ from `from` only (what a node that ran nothing but `from` would download) */
  changedVsPrevious: number
}

/**
 * What the production node downloads when production moves to the current digest (L24: „kubelet pulls only
 * changed layers”). The node keeps the layers of every image it has run (digest references default to
 * IfNotPresent; image garbage collection is not modelled), so:
 * - a deploy with the layer cache downloads only the code layer (0,9 MB);
 * - a rollback to a digest the node ran a few minutes earlier downloads nothing (the old image is still there).
 * `against: 'previous'` compares with the previous digest only (a node that ran nothing else).
 */
export function lastPromotionDiff(state: PipelineState, opts: { against?: 'node' | 'previous' } = {}): PromotionDiff | null {
  const h = state.prodHistory
  if (h.length < 2) return null
  const last = h[h.length - 1]
  const to = last.digest
  const from = h[h.length - 2].digest
  const vsPrev = layerDiff(state.registry, from, to)
  const onNode = new Set<string>()
  const earlier = opts.against === 'previous' ? [h[h.length - 2]] : h.slice(0, -1)
  for (const e of earlier) for (const l of state.registry.manifests.get(e.digest)?.layers ?? []) onNode.add(l)
  const layers = vsPrev.layers.map((l) => ({ digest: l.digest, label: l.label, sizeMB: l.sizeMB, changed: !onNode.has(l.digest), compressedMB: l.compressedMB }))
  const changed = layers.filter((l) => l.changed)
  return {
    from,
    to,
    kind: last.kind,
    shared: layers.length - changed.length,
    changed: changed.length,
    downloadMB: clean(changed.reduce((sum, l) => sum + l.compressedMB, 0)),
    totalMB: vsPrev.totalMB,
    layers: layers.map(({ digest, label, sizeMB, changed: c }) => ({ digest, label, sizeMB, changed: c })),
    changedVsPrevious: vsPrev.changed.length,
  }
}
