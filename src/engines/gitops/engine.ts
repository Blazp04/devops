/** E6 engine core: createGitOps(config) → state; step(state, dt) with an internal fixed 100 ms tick. */
import type { CiRun, GitOpsState, ImageInfo, SyncOperation } from './types.ts'
import { createRng, Series } from '../../kit/sim/math.ts'
import { DT, FILES, KLOPA, PATHS, TRUSTED_KEYS } from './constants.ts'
import { DEFAULT_IMAGES, initialFiles, resolveConfig, SMS, type GitOpsConfig } from './config.ts'
import { applyManifest, createClusterState, registryKey, settleControllers, settleDeployment, settleHpa, tickCluster, writeField } from './cluster.ts'
import { compare, render, tickArgo, updateHpaIgnoreFix } from './argocd.ts'
import { checkSourceIntegrity, commit, headCommit, imageChanges, pathOf, seedCommit } from './git.ts'
import { asReplicas, emit, fakeDigest, hexHash, objKey, round1 } from './util.ts'

/** Extra external-store keys from the config (string values only; the SMS key always comes from SMS). */
function storeExtras(v: GitOpsConfig['storeValues']): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(v ?? {})) if (typeof val === 'string' && k !== SMS.remoteKey) out[k] = val
  return out
}

export function createGitOps(config: GitOpsConfig = {}): GitOpsState {
  const cfg = resolveConfig(config)
  const rng = createRng(cfg.seed)
  const len = cfg.seriesLength
  const recipient = `age1${hexHash(`klopa-age:${cfg.seed}`, 58)}`
  const state: GitOpsState = {
    t: 0,
    tick: 0,
    acc: 0,
    cfg,
    rng,
    mode: cfg.mode,
    repo: {
      url: KLOPA.repoUrl,
      branch: 'main',
      appPath: config.app?.path ?? KLOPA.appPath,
      commits: [],
      head: '',
      protection: { requirePullRequest: config.protection?.requirePullRequest ?? false, requireSignedCommits: config.protection?.requireSignedCommits ?? false },
      trustedKeys: { ...TRUSTED_KEYS },
    },
    registry: {},
    cluster: createClusterState(),
    argo: {
      appName: config.app?.name ?? KLOPA.app,
      project: { name: KLOPA.project, restricted: config.project?.restricted ?? false, sourceIntegrity: config.project?.sourceIntegrity ?? 'none' },
      policy: {
        automated: config.policy?.automated ?? false,
        prune: config.policy?.prune ?? false,
        selfHeal: config.policy?.selfHeal ?? false,
        allowEmpty: config.policy?.allowEmpty ?? false,
        retry: config.policy?.retry ? { ...config.policy.retry } : null,
        respectIgnoreDifferences: config.policy?.respectIgnoreDifferences ?? false,
      },
      ignoreDifferences: config.ignoreDifferences ? config.ignoreDifferences.map((r) => ({ ...r, jsonPointers: [...r.jsonPointers] })) : [],
      sourcePlugin: config.sourcePlugin ?? (config.secrets === 'avp' ? 'argocd-vault-plugin' : config.secrets === 'sops' ? 'ksops' : 'none'),
      webhook: config.webhook ?? false,
      knownRevision: null,
      lastGitRefreshAt: 0,
      pollStartedAt: 0,
      nextPollAt: 0,
      webhookRefreshAt: null,
      nextCompareAt: 0,
      compareRequested: false,
      target: {},
      renderError: null,
      integrityError: null,
      plaintextCache: {},
      renderCache: {},
      sync: { status: 'Unknown', revision: null },
      health: { status: 'Unknown', message: '' },
      resources: [],
      diffs: [],
      conditions: [],
      operation: null,
      lastOperation: null,
      history: [],
      nextOpId: 1,
      lastAutoSyncNote: '',
      lastAutoSyncKey: '',
      outOfSyncSince: null,
    },
    secrets: {
      store: {
        available: true,
        values: { ...storeExtras(config.storeValues), [SMS.remoteKey]: SMS.initialValue },
        versions: { ...Object.fromEntries(Object.keys(storeExtras(config.storeValues)).map((k) => [k, 1])), [SMS.remoteKey]: 1 },
      },
      sealing: { keys: [], clusterKeyIds: [], backupKeyIds: [], leaked: false, leakedKeyIds: [], ciphertexts: {}, nextRenewalAt: cfg.sealingKeyAutoRenew ? cfg.sealingKeyRenewalS : null },
      sops: { recipient, recipients: [recipient], argoHasKey: true, leaked: false, leakedRecipients: [], ciphertexts: {} },
    },
    ci: { runs: [], nextId: 1 },
    stats: {
      commits: 0,
      kubectlChanges: 0,
      kubectlImageChanges: 0,
      driftsDetected: 0,
      driftsReverted: 0,
      autoSyncs: 0,
      selfHealSyncs: 0,
      kubectlDriftsReverted: 0,
      manualSyncs: 0,
      failedSyncs: 0,
      retries: 0,
      prunes: 0,
      orphans: 0,
      reverts: 0,
      replicaFights: 0,
      lastFightAt: null,
      rejectedCommits: 0,
      blockedBySourceIntegrity: 0,
      replicaDrops: 0,
      hpaIgnoreFixAt: null,
    },
    security: { ciCredentialLeaked: false, clusterCompromised: false },
    metrics: {
      liveReplicas: new Series(len),
      gitReplicas: new Series(len),
      gitReplicasPresent: new Series(len),
      hpaDesired: new Series(len),
      fights: new Series(len),
      readyPods: new Series(len),
      synced: new Series(len),
      healthy: new Series(len),
      lastSampleAt: -1,
    },
    events: [],
    nextEventId: 1,
    mainDeployment: KLOPA.app,
    baselineTag: config.initialTag ?? '1.4.0',
  }

  for (const img of config.images ?? DEFAULT_IMAGES) addImage(state, img.tag, img.behaviour, img.repo ?? KLOPA.registry, img.bugRate ?? 0)
  if (!state.registry[registryKey(KLOPA.registry, state.baselineTag)]) addImage(state, state.baselineTag, 'ok')

  // Sealed Secrets controller key (generated 10 days ago, backed up)
  newSealingKey(state, -10 * 24 * 3600, true)
  const secrets = config.secrets ?? 'none'
  const token = secrets === 'sealed' ? sealValue(state, SMS.initialValue) : null
  const sops = secrets === 'sops' ? { token: sopsEncrypt(state, SMS.initialValue), recipient: state.secrets.sops.recipient } : null

  // Git history: three human commits, all signed (the first two hold only klopa-api's Deployment and Service)
  const files = initialFiles(config, token, sops)
  const deploymentOnly = Object.fromEntries(Object.entries(files).filter(([p]) => p === FILES.deployment || p === FILES.service))
  const firstFiles = Object.fromEntries(Object.entries(deploymentOnly).map(([p, m]) => [p, p === FILES.deployment ? { ...m, fields: { ...m.fields, [PATHS.image]: `${KLOPA.registry}:1.3.2` } } : m]))
  seedCommit(state, firstFiles, 'Dodaj klopa-api Deployment i Service', 'Davor', -7200)
  seedCommit(state, { ...firstFiles, ...deploymentOnly }, `klopa-api ${state.baselineTag}`, 'Lana', -3600)
  seedCommit(state, files, 'Konfiguracija za Ćevap-petak', 'Lana', -900)

  // Live cluster = HEAD applied (pull: by Argo CD; push: by CI's kubectl apply)
  const by = state.mode === 'pull' ? 'argocd' : 'ci'
  const head = headCommit(state.repo)
  // pull: what Argo CD rendered (e.g. argocd-vault-plugin substitutions); push: the files as CI applies them
  const initial = state.mode === 'pull' ? Object.values(render(state, head.sha).target) : Object.entries(head.files).filter(([p]) => p.startsWith(`${state.repo.appPath}/`)).map(([, m]) => m)
  for (const m of initial) if (!m.hook) applyManifest(state, m, { by })
  if (secrets === 'manual') {
    applyManifest(state, { kind: 'Secret', name: SMS.secretName, namespace: KLOPA.namespace, fields: { [`/data/${SMS.secretKey}`]: SMS.initialValue } }, { by: 'kubectl', managed: false })
  }
  state.cluster.hpaDemand = config.hpaDemand ?? (config.hpa ? 6 : 0)
  // an HPA that has been running for a while already set the replicas of a Deployment without `replicas` in Git
  for (const o of Object.values(state.cluster.objects)) {
    if (o.kind !== 'HorizontalPodAutoscaler' || state.cluster.hpaDemand <= 0) continue
    const d = state.cluster.objects[objKey('Deployment', String(o.fields[PATHS.hpaTarget] ?? o.name))]
    if (!d || PATHS.replicas in (d.lastApplied ?? {})) continue
    const min = asReplicas(o.fields[PATHS.hpaMin] ?? 1) ?? 1
    const max = asReplicas(o.fields[PATHS.hpaMax]) ?? min
    const n = Math.min(max, Math.max(min, state.cluster.hpaDemand))
    writeField(state, d.key, PATHS.replicas, n, 'hpa')
    const rt = state.cluster.hpas[o.name]
    if (rt) rt.lastDesired = n
  }
  settleControllers(state)
  for (const o of Object.values(state.cluster.objects)) if (o.kind === 'Deployment') settleDeployment(state, o)
  for (const o of Object.values(state.cluster.objects)) o.createdAt = -600
  state.cluster.replicaWrites = []
  state.cluster.liveChanges = []
  state.cluster.kubeEvents = []
  for (const p of state.cluster.pods) p.events = []
  for (const h of Object.values(state.cluster.hpas)) {
    h.nextEvalAt = cfg.hpaPeriodS
    settleHpa(h)
  }
  updateHpaIgnoreFix(state)

  // Argo CD: synced to HEAD 10 min ago
  if (state.mode === 'pull') {
    const a = state.argo
    a.knownRevision = head.sha
    const r = render(state, head.sha)
    a.target = r.target
    a.renderError = r.error
    a.integrityError = checkSourceIntegrity(state.repo, head.sha, a.project.sourceIntegrity)
    const synthetic: SyncOperation = {
      id: 0,
      revision: head.sha,
      initiatedBy: a.policy.automated ? 'auto' : 'manual',
      selfHealAttemptsCount: 0,
      prune: a.policy.prune,
      onlyKeys: null,
      retry: { limit: 0, durationS: 5, factor: 2, maxDurationS: 180, refresh: false },
      retryCount: 0,
      revertedManual: false,
      phase: 'Succeeded',
      message: 'successfully synced (all tasks run)',
      startedAt: -601,
      finishedAt: -600,
      nextRetryAt: null,
      steps: [],
      stepIdx: 0,
      stage: 'done',
      stageUntil: -600,
      results: [],
    }
    a.lastOperation = synthetic
    a.history = [{ id: 0, revision: head.sha, deployedAt: -600, initiatedBy: synthetic.initiatedBy }]
    a.pollStartedAt = 0
    a.nextPollAt = cfg.pollIntervalS + rng.next() * cfg.pollJitterS
    for (const c of state.repo.commits) {
      c.seenAt = c.t + 1
      c.seenVia = 'poll'
    }
    head.syncStartedAt = -601
    head.syncedAt = -600
    head.healthyAt = -580
    compare(state)
  }
  state.events = []
  if (state.mode === 'pull') emit(state, 'status', `Aplikacija ${state.argo.appName}: ${state.argo.sync.status}, ${state.argo.health.status} na ${head.short}. Git se provjerava svakih ${cfg.pollIntervalS} s + do ${cfg.pollJitterS} s (sim).`, 'info')
  else emit(state, 'status', `Model guranja: CI postavlja izravno u klaster vlastitim ključem; u klasteru nema kontrolera koji uspoređuje s Gitom.`, 'info')
  sample(state)
  return state
}

export function addImage(state: GitOpsState, tag: string, behaviour: ImageInfo['behaviour'], repo: string = KLOPA.registry, bugRate = 0): ImageInfo {
  const info: ImageInfo = { tag, digest: fakeDigest(`${repo}:${tag}`), behaviour, bugRate: Number.isFinite(bugRate) ? Math.min(1, Math.max(0, bugRate)) : 0 }
  state.registry[registryKey(repo, tag)] = info
  return info
}

export function newSealingKey(state: GitOpsState, createdAt: number, backup: boolean): string {
  const s = state.secrets.sealing
  const id = `sealed-secrets-key${hexHash(`key${s.keys.length}:${state.cfg.seed}`, 5)}`
  s.keys.push({ id, createdAt })
  s.clusterKeyIds.push(id)
  if (backup) s.backupKeyIds.push(id)
  return id
}

/** kubeseal: encrypt with the newest public key the controller publishes. */
export function sealValue(state: GitOpsState, value: string): string {
  const s = state.secrets.sealing
  const key = s.keys[s.keys.length - 1]
  const token = `AgB${hexHash(`${key.id}|${value}|${Object.keys(s.ciphertexts).length}`, 40)}`
  s.ciphertexts[token] = { value, keyId: key.id }
  return token
}

/** `sops --encrypt` with the team's current age recipient: value → `ENC[AES256_GCM,…]` (keys stay readable). */
export function sopsEncrypt(state: GitOpsState, value: string): string {
  const sops = state.secrets.sops
  const n = Object.keys(sops.ciphertexts).length
  const token = `ENC[AES256_GCM,data:${hexHash(`${sops.recipient}|${value}|${n}`, 24)},iv:${hexHash(`iv${n}|${value}`, 16)},tag:${hexHash(`tag${n}`, 12)},type:str]`
  sops.ciphertexts[token] = { value, recipient: sops.recipient }
  return token
}

// ─── Loop ────────────────────────────────────────────────────────────────────

/** Advance by `dt` seconds of simulated time (plugs into useSimulation's step). */
export function step(state: GitOpsState, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return
  state.acc += Math.min(dt, 60)
  while (state.acc >= DT - 1e-9) {
    state.acc -= DT
    tick(state)
  }
}

/** Run `seconds` of simulated time (tests, presets, „skip ahead” buttons). */
export function advance(state: GitOpsState, seconds: number): void {
  if (!Number.isFinite(seconds) || seconds <= 0) return
  let left = seconds
  while (left > 1e-9) {
    const d = Math.min(30, left)
    step(state, d)
    left -= d
  }
}

function tick(state: GitOpsState) {
  state.tick++
  state.t = round1(state.tick * DT)
  tickCi(state)
  tickSealingKeys(state)
  tickArgo(state)
  tickCluster(state)
  if (state.tick % 10 === 0) sample(state)
}

/** Automatic sealing-key renewal (Sealed Secrets: every 30 days real, 60 s sim like E5; off unless `timing.sealingKeyAutoRenew`). */
function tickSealingKeys(state: GitOpsState) {
  const s = state.secrets.sealing
  if (s.nextRenewalAt === null || state.t < s.nextRenewalAt - 1e-9) return
  s.nextRenewalAt += state.cfg.sealingKeyRenewalS
  const id = newSealingKey(state, state.t, false)
  emit(state, 'secret', `Sealed Secrets: automatska obnova – novi ključ za pečaćenje ${id}; stari ključevi ostaju, ništa se ne šifrira ponovno.`, 'neutral')
}

function sample(state: GitOpsState) {
  const m = state.metrics
  if (m.lastSampleAt === state.t) return
  m.lastSampleAt = state.t
  const d = state.cluster.objects[objKey('Deployment', state.mainDeployment)]
  const live = typeof d?.fields[PATHS.replicas] === 'number' ? Number(d.fields[PATHS.replicas]) : 0
  const target = state.argo.target[objKey('Deployment', state.mainDeployment)]
  const gitR = target?.fields[PATHS.replicas]
  m.liveReplicas.push(Number.isFinite(live) ? live : 0)
  const present = typeof gitR === 'number' && Number.isFinite(gitR)
  // without replicas in Git hold the last value (gitReplicasPresent = 0) instead of drawing a false drop to 0
  m.gitReplicas.push(present ? gitR : m.gitReplicas.last(live))
  m.gitReplicasPresent.push(present ? 1 : 0)
  const hpa = state.cluster.hpas[state.mainDeployment]
  m.hpaDesired.push(hpa?.lastDesired ?? m.hpaDesired.last(0))
  m.fights.push(state.stats.replicaFights)
  const rt = state.cluster.deployments[state.mainDeployment]
  const ready = state.cluster.external[state.mainDeployment] ? (rt?.status.readyReplicas ?? 0) : state.cluster.pods.filter((p) => p.deployment === state.mainDeployment && p.ready).length
  m.readyPods.push(ready)
  const s = state.argo.sync.status
  m.synced.push(state.mode !== 'pull' ? 0 : s === 'Synced' ? 1 : s === 'OutOfSync' ? 0 : 0.5)
  const h = state.argo.health.status
  m.healthy.push(state.mode !== 'pull' ? 0 : h === 'Healthy' ? 1 : h === 'Progressing' || h === 'Suspended' ? 0.5 : 0)
}

// ─── CI lane ─────────────────────────────────────────────────────────────────

function tickCi(state: GitOpsState) {
  for (const run of state.ci.runs) {
    if (run.status !== 'running') continue
    run.progress = Math.min(1, (state.t - run.startedAt) / run.durationS)
    if (run.progress < 1) continue
    run.status = 'done'
    finishCi(state, run)
  }
  if (state.ci.runs.length > 20) state.ci.runs.splice(0, state.ci.runs.length - 20)
}

function finishCi(state: GitOpsState, run: CiRun) {
  const info = addImage(state, run.version, run.behaviour, KLOPA.registry, run.bugRate)
  const ref = `${KLOPA.registry}:${run.version}@${info.digest}`
  emit(state, 'ci', `CI: slika ${run.version} izgrađena, testirana i poslana u registar (${info.digest.slice(0, 19)}…).`, 'ok')
  const path = pathOf(state.repo, 'Deployment', state.mainDeployment)
  if (state.mode === 'pull') {
    if (!path) return
    const res = commit(state, { message: `ci: klopa-api ${run.version}`, author: KLOPA.ciBot, changes: imageChanges(state.repo, ref), kind: 'ci', ciRunId: run.id })
    if (res.ok) {
      run.resultSha = res.sha
      res.commit.stations.ci = run.startedAt
    }
    return
  }
  // push model: CI uses its own cluster credentials (kubectl set image / apply)
  const key = objKey('Deployment', state.mainDeployment)
  const live = state.cluster.objects[key]
  if (live) {
    applyManifest(state, { kind: 'Deployment', name: live.name, namespace: live.namespace, fields: { ...live.fields, [PATHS.image]: ref } }, { by: 'ci', managed: false })
  } else if (path) {
    const m = headCommit(state.repo).files[path]
    applyManifest(state, { ...m, fields: { ...m.fields, [PATHS.image]: ref } }, { by: 'ci', managed: false })
  }
  emit(state, 'ci', `CI izvodi kubectl apply u produkciju svojim ključem klastera (Git ne bilježi novu verziju).`, 'warn')
}
