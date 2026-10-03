/// <reference types="node" />
/**
 * E6 tests – run with: node --test src/engines/gitops/*.test.ts
 * Each block reproduces a behaviour from docs/curriculum.json (L22 model/breakIt, L23 model, L24 fault deck),
 * the validated rollout table in docs/research/sim-models.md (SIM 5) and Argo CD v3.5.3 controller semantics.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createRng } from '../../kit/sim/math.ts'
import * as E3 from '../cluster/index.ts'
import {
  addHpaToGit,
  advance,
  appView,
  argocdAppGet,
  argoRollback,
  attackerCommit,
  AUTO_SYNC_DEFAULT_RETRY_LIMIT,
  capacity,
  commitBadImage,
  commitField,
  commitGraph,
  commitImage,
  commitInvalidManifest,
  commitLatency,
  commitPlainSecret,
  commitReplicas,
  commitSealedSecret,
  createGitOps,
  DEFAULT_CONFIG,
  deleteFileFromGit,
  deployHistory,
  deployPaths,
  diffView,
  FILES,
  fenceposts,
  gitLeaks,
  gitMatchesCluster,
  helmList,
  integrityStatus,
  commitSopsSecret,
  leakSopsKey,
  setSopsKeyInArgo,
  rolloutPause,
  RETRY_PRESETS,
  objectHealth,
  deliveryView,
  setExternalWorkload,
  setExternalWorkloadStatus,
  deploymentSpec,
  gitRevert,
  kubectlApplySecret,
  kubectlDelete,
  kubectlGetPods,
  kubectlScale,
  kubectlSetImage,
  l22Goals,
  leakCiCredentials,
  leakSealingKeys,
  liveImageTag,
  PATHS,
  podsView,
  pollRing,
  PRESETS,
  rebuildCluster,
  refreshApp,
  removeReplicasFromGit,
  replicaFight,
  resourceTree,
  revertLastChange,
  rolloutRestart,
  rotateSecret,
  secretView,
  selfHealDelay,
  setDatabaseDown,
  setHpaDemand,
  setIgnoreReplicas,
  setProjectRestricted,
  setRepoProtection,
  setRespectIgnoreDifferences,
  setRetry,
  setSourceIntegrity,
  setStoreAvailable,
  setSyncPolicy,
  setWebhook,
  startCiRelease,
  step,
  syncApp,
  SYNC_RETRY_DEFAULTS,
  terminateSync,
  TIMINGS,
  type GitOpsConfig,
  type GitOpsState,
  type FieldValue,
  type PodView,
  addImage,
  retryPresetOf,
  argoCacheView,
  argocdAppDiff,
  commitChanges,
  commitTimeline,
  controllerStatusOf,
  deployedRevision,
  drainLiveChanges,
  externalPods,
  hpaHealth,
  hpaView,
  KLOPA,
  kubectlDescribePod,
  kubectlEdit,
  kubectlGetEvents,
  kubectlRolloutStatus,
  manifestToYaml,
  renewSealingKey,
  renewSopsKey,
  repoFiles,
  reportExternalChange,
  reportExternalSpec,
  RETRY_LABELS,
  setHpaDesired,
  setSecretsApproach,
} from './index.ts'

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Step in 0.1 s until pred is true; returns the time or null. */
function until(s: GitOpsState, pred: (s: GitOpsState) => boolean, maxS: number): number | null {
  const end = s.t + maxS
  while (s.t < end - 1e-9) {
    step(s, 0.1)
    if (pred(s)) return s.t
  }
  return null
}

const dep = (s: GitOpsState) => s.cluster.objects['Deployment/klopa-api']
const liveReplicas = (s: GitOpsState) => Number(dep(s)?.fields[PATHS.replicas])
const readyTags = (s: GitOpsState) => podsView(s).filter((p) => p.ready).map((p) => p.tag)

/** Rolling update measured on the live cluster (same criteria as docs/research/proto/rollout-sim.ts). */
function measureRollout(surge: string | number, unavailable: string | number, tag: string, n = 4, seconds = 150) {
  const s = createGitOps({ ...PRESETS.l22, replicas: n })
  commitField(s, FILES.deployment, PATHS.maxSurge, surge)
  commitField(s, FILES.deployment, PATHS.maxUnavailable, unavailable)
  syncApp(s)
  advance(s, 2)
  commitImage(s, tag)
  syncApp(s)
  const { surge: sg, unavailable: un } = fenceposts(surge, unavailable, n)
  let applied: number | null = null
  let done: number | null = null
  let peakAll = 0
  let peakActive = 0
  let minAvail = Infinity
  const end = s.t + seconds
  while (s.t < end) {
    step(s, 0.1)
    if (applied === null && String(dep(s).fields[PATHS.image]).endsWith(`:${tag}`)) applied = s.t
    if (applied === null) continue
    const pods = podsView(s)
    peakAll = Math.max(peakAll, pods.length)
    peakActive = Math.max(peakActive, pods.filter((p) => !p.terminating).length)
    if (s.t > applied + 0.2) minAvail = Math.min(minAvail, pods.filter((p) => p.ready).length)
    // invariants of a RollingUpdate (terminating Pods are not counted)
    assert.ok(pods.filter((p) => !p.terminating).length <= n + sg, `non-terminating Pods ≤ N + maxSurge at t=${s.t}`)
    if (s.t > applied + 0.2) assert.ok(pods.filter((p) => p.ready).length >= n - un, `available ≥ N − maxUnavailable at t=${s.t}`)
    if (done === null && pods.length === n && pods.every((p) => p.tag === tag && p.ready)) done = s.t
  }
  const pods = podsView(s)
  return {
    s,
    duration: done === null || applied === null ? null : done - applied,
    peakAll,
    peakActive,
    minAvail,
    oldReady: pods.filter((p) => p.tag !== tag && p.ready && !p.terminating).length,
    newPods: pods.filter((p) => p.tag === tag && !p.terminating).length,
  }
}

// ─── defaults and labels ─────────────────────────────────────────────────────

describe('defaults and compressed-time labels', () => {
  test('Argo CD defaults: manual sync, prune and selfHeal off, retry not set, polling only', () => {
    const s = createGitOps()
    assert.deepEqual(s.argo.policy, { automated: false, prune: false, selfHeal: false, allowEmpty: false, retry: null, respectIgnoreDifferences: false })
    assert.equal(s.argo.webhook, false)
    assert.equal(appView(s).sync, 'Synced')
    assert.equal(appView(s).health, 'Healthy')
    assert.equal(capacity(s).ready, 4)
    assert.equal(s.events.length, 1)
  })

  test('poll interval is real 120 s + up to 60 s, shown compressed ÷10 with a label', () => {
    assert.equal(TIMINGS.poll.realValue, 120)
    assert.equal(TIMINGS.poll.simValue, 12)
    assert.equal(TIMINGS.pollJitter.realValue, 60)
    assert.equal(TIMINGS.pollJitter.simValue, 6)
    assert.ok(TIMINGS.poll.compressed)
    assert.match(TIMINGS.pollTotal.label, /stvarno: 120 s \+ do 60 s/)
    assert.equal(DEFAULT_CONFIG.pollIntervalS, 12)
    assert.equal(TIMINGS.progressDeadline.realValue, 600)
    assert.equal(TIMINGS.esoRefresh.realValue, 3600)
  })

  test('retry and self-heal constants match Argo CD 3.5', () => {
    assert.deepEqual(SYNC_RETRY_DEFAULTS, { durationS: 5, factor: 2, maxDurationS: 180 })
    assert.equal(AUTO_SYNC_DEFAULT_RETRY_LIMIT, 5)
    const s = createGitOps()
    assert.deepEqual(
      [0, 1, 2, 3, 4, 5, 6, 7].map((n) => selfHealDelay(s, n)),
      [0, 2, 6, 18, 54, 162, 300, 300],
    )
    const legacy = createGitOps({ timing: { selfHeal: { mode: 'timeout', timeoutS: 5 } } })
    assert.equal(selfHealDelay(legacy, 3), 5)
  })

  test('fence posts: maxSurge rounds up, maxUnavailable down, both 0 → unavailable 1', () => {
    assert.deepEqual(fenceposts('25%', '25%', 4), { surge: 1, unavailable: 1 })
    assert.deepEqual(fenceposts('25%', '25%', 10), { surge: 3, unavailable: 2 })
    assert.deepEqual(fenceposts('25%', '25%', 1), { surge: 1, unavailable: 0 })
    assert.deepEqual(fenceposts('0%', '10%', 3), { surge: 0, unavailable: 1 })
  })
})

// ─── Git → Argo CD: polling vs webhook ───────────────────────────────────────

describe('refresh: polling vs webhook', () => {
  test('a commit is seen at the next poll: 12–18 s sim (= 120–180 s real); until then Argo CD still says Synced', () => {
    const delays: number[] = []
    for (let seed = 1; seed <= 40; seed++) {
      const s = createGitOps({ seed })
      commitImage(s, '2.0.1')
      advance(s, 5)
      assert.equal(appView(s).sync, 'Synced', 'Argo CD compares against the revision it knows')
      assert.equal(appView(s).behindGit, true)
      const seen = until(s, (x) => !appView(x).behindGit, 30)
      assert.ok(seen !== null)
      delays.push(seen)
      assert.equal(appView(s).sync, 'OutOfSync')
    }
    assert.ok(Math.min(...delays) >= 12 - 1e-9, `min ${Math.min(...delays)}`)
    assert.ok(Math.max(...delays) < 18 + 0.1 + 1e-9, `max ${Math.max(...delays)}`)
    assert.ok(delays.some((d) => d < 14.5) && delays.some((d) => d > 15.5), 'uniform jitter spreads the delays')
  })

  test('later polls repeat every 12 s + up to 6 s', () => {
    const s = createGitOps({ seed: 3 })
    const gaps: number[] = []
    let last = s.argo.lastGitRefreshAt
    for (let i = 0; i < 10; i++) {
      until(s, (x) => x.argo.lastGitRefreshAt !== last, 30)
      gaps.push(s.argo.lastGitRefreshAt - last)
      last = s.argo.lastGitRefreshAt
    }
    for (const g of gaps.slice(1)) assert.ok(g >= 12 - 1e-9 && g <= 18 + 1e-9, `gap ${g}`)
    const ring = pollRing(s)
    assert.ok(ring.progress >= 0 && ring.progress <= 1)
    assert.equal(ring.mode, 'poll')
  })

  test('with a webhook the commit is seen ≈ 1 s later; ring shows webhook mode', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, webhook: true })
    advance(s, 3)
    const r = commitImage(s, '2.0.1')
    assert.ok(r.ok)
    assert.equal(pollRing(s).webhookPendingInS, 1)
    const seen = until(s, (x) => !appView(x).behindGit, 5)
    assert.ok(seen !== null && Math.abs(seen - (r.commit.t + 1)) < 0.11)
    assert.equal(commitLatency(s)?.seenVia, 'webhook')
    assert.equal(pollRing(s).mode, 'webhook')
  })

  test('manual Refresh sees the commit immediately', () => {
    const s = createGitOps()
    commitImage(s, '2.0.1')
    refreshApp(s)
    assert.equal(appView(s).behindGit, false)
    advance(s, 1)
    assert.equal(appView(s).sync, 'OutOfSync')
  })
})

// ─── Sync and health ─────────────────────────────────────────────────────────

describe('sync status and health are separate dimensions', () => {
  test('„Uvedite 2.0.1 samo commitom”: auto-sync rolls it out, Progressing → Healthy, no kubectl', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, webhook: true })
    const r = commitImage(s, '2.0.1')
    assert.ok(r.ok)
    until(s, (x) => appView(x).health === 'Progressing', 5)
    assert.equal(appView(s).sync, 'Synced', 'Synced while the rollout is still Progressing')
    const healthy = until(s, (x) => appView(x).health === 'Healthy', 60)
    assert.ok(healthy !== null)
    assert.deepEqual(readyTags(s), ['2.0.1', '2.0.1', '2.0.1', '2.0.1'])
    assert.equal(s.stats.kubectlChanges, 0)
    assert.equal(l22Goals(s).shipped, true)
    const lat = commitLatency(s)
    assert.ok(lat && lat.seen !== null && lat.synced !== null && lat.healthy !== null)
    assert.ok(lat.seen <= 1.1 && lat.synced <= 2.5, JSON.stringify(lat))
    assert.ok(lat.healthy > 20 && lat.healthy < 30, `healthy after ${lat.healthy}`)
  })

  test('without auto-sync a new commit stays OutOfSync until „Sinkroniziraj”', () => {
    const s = createGitOps()
    commitImage(s, '2.0.1')
    advance(s, 60)
    assert.equal(appView(s).sync, 'OutOfSync')
    assert.equal(liveImageTag(s), '1.4.0')
    assert.ok(diffView(s).some((d) => d.path === PATHS.image && !d.ignored))
    assert.ok(syncApp(s).ok)
    assert.equal(syncApp(s).ok, false, 'second sync while one is running is rejected')
    const done = until(s, (x) => appView(x).health === 'Healthy' && readyTags(x).join() === '2.0.1,2.0.1,2.0.1,2.0.1', 60)
    assert.ok(done !== null)
    assert.equal(appView(s).sync, 'Synced')
  })

  test('„Loš commit” (typo tag): Synced but Degraded after progressDeadlineSeconds; stall 3 old + 2 new; no auto rollback', () => {
    const s = createGitOps(PRESETS.l22Auto)
    commitBadImage(s, 'typo')
    until(s, (x) => liveImageTag(x) === '2.0.l', 30)
    const applied = s.t
    const degraded = until(s, (x) => appView(x).health === 'Degraded', 120)
    assert.ok(degraded !== null)
    assert.equal(appView(s).sync, 'Synced')
    assert.ok(degraded - applied > 60 && degraded - applied < 80, `Degraded ${degraded - applied} s after apply`)
    const pods = podsView(s).filter((p) => !p.terminating)
    assert.equal(pods.filter((p) => p.tag === '1.4.0' && p.ready).length, 3)
    assert.deepEqual(pods.filter((p) => p.tag === '2.0.l').map((p) => p.status), ['ImagePullBackOff', 'ImagePullBackOff'])
    assert.equal(capacity(s).ready, 3)
    advance(s, 120)
    assert.equal(liveImageTag(s), '2.0.l', 'nothing rolls back by itself')
    assert.ok(kubectlGetPods(s).some((l) => l.includes('ImagePullBackOff')))
  })

  test('„Vratite loš commit na GitOps način”: git revert → new commit → sync → Healthy, history kept', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, webhook: true })
    const bad = commitBadImage(s, 'crash')
    assert.ok(bad.ok)
    until(s, (x) => podsView(x).some((p) => p.status === 'CrashLoopBackOff'), 30)
    const rev = gitRevert(s)
    assert.ok(rev.ok)
    assert.equal(rev.commit.revertOf, bad.sha)
    assert.equal(rev.commit.message, 'Revert "klopa-api 1.5.0"')
    const healthy = until(s, (x) => appView(x).health === 'Healthy' && appView(x).sync === 'Synced' && capacity(x).ready === 4 && liveImageTag(x) === '1.4.0', 60)
    assert.ok(healthy !== null)
    const graph = commitGraph(s)
    assert.equal(graph[0].revertOf, bad.sha)
    assert.equal(graph[1].revertedBy, rev.sha)
    assert.equal(s.repo.commits.length, 5, 'history keeps the bad commit')
    assert.ok(deployHistory(s).length >= 3)
    assert.equal(s.stats.reverts, 1)
    assert.equal(l22Goals(s).badCommitReverted, true)
  })

  test('shipping by kubectl set image does not count as „samo commitom”', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, policy: { automated: true, selfHeal: false } })
    kubectlSetImage(s, '2.0.1')
    advance(s, 40)
    assert.equal(liveImageTag(s), '2.0.1')
    assert.equal(appView(s).sync, 'OutOfSync')
    assert.equal(l22Goals(s).shipped, false)
    assert.equal(s.stats.kubectlImageChanges, 1)
  })

  test('revertLastChange skips reverts; revert of a field changed later conflicts', () => {
    const s = createGitOps()
    const a = commitImage(s, '2.0.0')
    commitImage(s, '2.0.1')
    assert.ok(a.ok)
    const conflict = gitRevert(s, a.sha)
    assert.equal(conflict.ok, false)
    const r = revertLastChange(s)
    assert.ok(r.ok)
    assert.equal(String(s.repo.commits.at(-1)?.files[FILES.deployment].fields[PATHS.image]).endsWith(':2.0.0'), true)
  })
})

describe('health details', () => {
  test('Argo CD 3.5: a missing resource is Missing on its node, but app health ignores it (OutOfSync already says so)', () => {
    // argo-cd v3.5.3 controller/health.go setApplicationHealth: „Missing resources should not affect parent app health”
    const s = createGitOps(PRESETS.l22)
    kubectlDelete(s, 'ConfigMap', 'klopa-promo')
    advance(s, 1.5)
    assert.equal(s.argo.resources.find((r) => r.key === 'ConfigMap/klopa-promo')?.health, 'Missing')
    assert.equal(appView(s).sync, 'OutOfSync')
    assert.equal(appView(s).health, 'Healthy')
    kubectlDelete(s, 'Service', 'klopa-api')
    advance(s, 1.5)
    assert.equal(s.argo.resources.find((r) => r.key === 'Service/klopa-api')?.health, 'Missing')
    assert.ok(resourceTree(s).some((n) => n.id === 'Service/klopa-api' && n.health === 'Missing' && n.status === 'nema u klasteru'))
    assert.equal(appView(s).health, 'Healthy', 'a Service has a health check, but missing resources never count in 3.5')
    // only when nothing from Git exists live is the app itself Missing
    kubectlDelete(s, 'Deployment', 'klopa-api')
    advance(s, 1.5)
    assert.equal(appView(s).health, 'Missing')
  })

  test('„kubectl rollout pause”: Suspended while Synced; a new release waits; resume finishes it; no deadline while paused', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, webhook: true })
    assert.ok(rolloutPause(s, true))
    advance(s, 1.5)
    assert.equal(appView(s).health, 'Suspended')
    assert.equal(appView(s).sync, 'Synced', '/spec/paused is not in Git, so it is not a diff')
    assert.equal(objectHealth(s, 'Deployment/klopa-api').message, 'Deployment is paused')
    commitImage(s, '2.0.1')
    advance(s, 120)
    assert.equal(appView(s).sync, 'Synced')
    assert.equal(appView(s).health, 'Suspended', 'never Degraded: the deadline clock is stopped')
    assert.ok(readyTags(s).every((t) => t === '1.4.0'))
    assert.ok(rolloutPause(s, false))
    assert.ok(until(s, (x) => appView(x).health === 'Healthy' && readyTags(x).join() === '2.0.1,2.0.1,2.0.1,2.0.1', 60) !== null)
  })

  test('`helm list` is empty: Argo CD renders charts with helm template', () => {
    assert.deepEqual(helmList(), ['NAME\tNAMESPACE\tREVISION\tUPDATED\tSTATUS\tCHART\tAPP VERSION'])
  })
})

describe('deliveryView: one commit from Git to running Pods', () => {
  test('hops refresh → sync → rollout → done with monotonic progress; older commits are included or superseded', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, seed: 5 })
    assert.ok(deliveryView(s).every((d) => d.hop === 'done'), 'seed history is deployed')
    const r = commitImage(s, '2.0.1')
    assert.ok(r.ok)
    const seen: string[] = []
    let last = -1
    let lastHop = ''
    for (let i = 0; i < 600; i++) {
      step(s, 0.1)
      const d = deliveryView(s).find((x) => x.id === r.sha)
      assert.ok(d)
      if (d.hop !== lastHop) {
        seen.push(d.hop)
        lastHop = d.hop
        last = -1
      }
      assert.ok(d.progress >= last - 1e-9 && d.progress <= 1, `${d.hop} progress ${d.progress} after ${last}`)
      last = d.progress
      if (d.hop === 'done') break
    }
    assert.deepEqual(seen.filter((h) => h !== 'sync'), ['refresh', 'rollout', 'done'])
    const d2 = commitImage(s, '2.0.0')
    const d3 = commitReplicas(s, 5)
    assert.ok(d2.ok && d3.ok)
    const v = deliveryView(s)
    assert.equal(v[0].id, d3.sha)
    assert.equal(v[1].hop, 'superseded')
    assert.equal(v[2].hop, 'done')
  })

  test('manual sync waits; push mode never deploys from Git; unsigned commit is blocked', () => {
    const m = createGitOps(PRESETS.l22)
    commitImage(m, '2.0.1')
    refreshApp(m)
    assert.equal(deliveryView(m)[0].hop, 'sync')
    assert.match(deliveryView(m)[0].text, /ručnu sinkronizaciju/)
    const p = createGitOps(PRESETS.l22Push)
    commitImage(p, '2.0.1')
    assert.equal(deliveryView(p)[0].hop, 'notDeployed')
    const g = createGitOps({ ...PRESETS.l22Auto, webhook: true, project: { sourceIntegrity: 'head' } })
    attackerCommit(g)
    advance(g, 2)
    assert.equal(deliveryView(g)[0].hop, 'blocked')
  })
})

describe('timing distributions (40–200 seeds)', () => {
  test('commit right after a poll: seen after 12,1–18 s sim, mean ≈ 15 s (real 120 s + U(0, 60) s)', () => {
    const d: number[] = []
    for (let seed = 1; seed <= 200; seed++) {
      const s = createGitOps({ seed })
      commitImage(s, '2.0.1')
      const seen = until(s, (x) => x.argo.knownRevision === x.repo.head, 20)
      assert.ok(seen !== null)
      d.push(seen)
    }
    const mean = d.reduce((a, b) => a + b, 0) / d.length
    assert.ok(Math.min(...d) >= 12 && Math.max(...d) <= 18 + 1e-9)
    assert.ok(Math.abs(mean - 15) < 0.4, `mean ${mean}`)
  })

  test('commit at a random moment: seen within 0–18 s sim, mean ≈ 7,6 s (residual of a 12–18 s cycle)', () => {
    const d: number[] = []
    for (let seed = 1; seed <= 200; seed++) {
      const s = createGitOps({ seed })
      advance(s, Math.round(s.rng.next() * 400) / 10)
      commitImage(s, '2.0.1')
      const t0 = s.t
      const seen = until(s, (x) => x.argo.knownRevision === x.repo.head, 20)
      assert.ok(seen !== null)
      d.push(seen - t0)
    }
    const mean = d.reduce((a, b) => a + b, 0) / d.length
    assert.ok(Math.max(...d) <= 18 + 1e-9)
    assert.ok(mean > 6.8 && mean < 8.6, `mean ${mean}`)
  })
})

// ─── Rolling update numbers (SIM 5 validated table) ──────────────────────────

describe('workload model reproduces the validated rollout table (N = 4)', () => {
  const table = [
    { label: '25%/25%', surge: '25%', unav: '25%', duration: 28, peakAll: 7, peakActive: 5, minAvail: 3 },
    { label: 'surge 1 / unavailable 0', surge: 1, unav: 0, duration: 51, peakAll: 6, peakActive: 5, minAvail: 4 },
    { label: 'surge 0 / unavailable 1', surge: 0, unav: 1, duration: 46, peakAll: 5, peakActive: 4, minAvail: 3 },
    { label: '100% / 0', surge: '100%', unav: 0, duration: 17, peakAll: 8, peakActive: 8, minAvail: 4 },
  ] as const
  for (const row of table) {
    test(row.label, () => {
      const r = measureRollout(row.surge, row.unav, '2.0.1')
      assert.ok(r.duration !== null && Math.abs(r.duration - row.duration) <= 1, `duration ${r.duration} vs ${row.duration}`)
      assert.equal(r.peakAll, row.peakAll)
      assert.equal(r.peakActive, row.peakActive)
      assert.equal(r.minAvail, row.minAvail)
    })
  }
  test('broken image stalls at 3 old Ready + 2 new (75 % capacity)', () => {
    const r = measureRollout('25%', '25%', '1.5.0', 4, 90)
    assert.equal(r.duration, null)
    assert.equal(r.oldReady, 3)
    assert.equal(r.newPods, 2)
  })
  test('broken image, N = 10, surge 3 / unavailable 2 stalls at 8 old / 5 new (Kubernetes docs example)', () => {
    const r = measureRollout(3, 2, '1.5.0', 10, 90)
    assert.equal(r.oldReady, 8)
    assert.equal(r.newPods, 5)
  })
})

// ─── Drift, selfHeal, prune ──────────────────────────────────────────────────

describe('drift: reverted only with selfHeal, deleted only with prune', () => {
  test('„Ručni kubectl scale --replicas=10” with selfHeal off: OutOfSync and stays 10 (auto-sync on)', () => {
    const s = createGitOps(PRESETS.l22Auto)
    assert.ok(kubectlScale(s, 10))
    const out = until(s, (x) => appView(x).sync === 'OutOfSync', 2)
    assert.ok(out !== null && out <= 1.01, 'live drift is noticed within ≈1 s (watch)')
    advance(s, 120)
    assert.equal(liveReplicas(s), 10)
    assert.equal(appView(s).sync, 'OutOfSync')
    assert.match(appView(s).autoSyncNote, /selfHeal je isključen/)
    assert.equal(s.stats.driftsDetected, 1)
    assert.equal(s.stats.selfHealSyncs, 0)
  })

  test('with selfHeal on the drift is reverted within seconds (first self-heal has no wait)', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, policy: { automated: true, selfHeal: true } })
    advance(s, 30)
    kubectlScale(s, 10)
    const t0 = s.t
    const back = until(s, (x) => liveReplicas(x) === 4, 10)
    assert.ok(back !== null && back - t0 <= 2.5, `reverted after ${back === null ? 'never' : back - t0} s`)
    until(s, (x) => appView(x).sync === 'Synced', 3)
    assert.equal(s.stats.driftsReverted, 1)
    assert.equal(l22Goals(s).driftReverted, true)
    // second drift right away: waits 2 s after the previous self-heal finished (backoff 2 s × 3)
    kubectlScale(s, 9)
    const lastFinish = s.argo.lastOperation?.finishedAt ?? 0
    const back2 = until(s, (x) => liveReplicas(x) === 4, 10)
    assert.ok(back2 !== null && back2 - lastFinish >= 2, `second revert ${back2 === null ? 'never' : back2 - lastFinish} s after last sync`)
  })

  test('legacy self-heal timeout (5 s between attempts) is available as an option', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, policy: { automated: true, selfHeal: true }, timing: { selfHeal: { mode: 'timeout', timeoutS: 5 } } })
    advance(s, 30)
    kubectlScale(s, 10)
    until(s, (x) => liveReplicas(x) === 4 && x.argo.operation === null, 10)
    const fin = s.argo.lastOperation?.finishedAt ?? 0
    kubectlScale(s, 10)
    const back = until(s, (x) => liveReplicas(x) === 4, 10)
    assert.ok(back !== null && back - fin >= 5 && back - fin < 7, `${back === null ? 'never' : back - fin}`)
  })

  test('„Netko obriše Deployment”: resource Missing, app OutOfSync (health stays Healthy in 3.5); restored by selfHeal, not without it', () => {
    const off = createGitOps(PRESETS.l22Auto)
    kubectlDelete(off, 'Deployment', 'klopa-api')
    advance(off, 1.5)
    assert.equal(off.argo.resources.find((r) => r.key === 'Deployment/klopa-api')?.health, 'Missing')
    assert.equal(appView(off).health, 'Healthy', 'Service still live; missing resources do not affect app health')
    assert.equal(appView(off).sync, 'OutOfSync')
    assert.match(diffView(off).find((d) => d.key === 'Deployment/klopa-api')?.change ?? '', /missing-live/)
    advance(off, 30)
    assert.equal(dep(off), undefined)
    assert.equal(capacity(off).ratio, 0)
    assert.ok(syncApp(off).ok, 'a manual sync restores it')
    assert.ok(until(off, (x) => capacity(x).ready === 4, 20) !== null)

    const on = createGitOps({ ...PRESETS.l22Auto, policy: { automated: true, selfHeal: true } })
    advance(on, 10)
    kubectlDelete(on, 'Deployment', 'klopa-api')
    const t0 = on.t
    assert.ok(until(on, (x) => dep(x) !== undefined, 5) !== null)
    const ready = until(on, (x) => capacity(x).ready === 4, 20)
    assert.ok(ready !== null && ready - t0 < 12, 'cached image: schedule 1 s + start 6 s')
    until(on, (x) => appView(x).health === 'Healthy', 3)
    assert.equal(appView(on).sync, 'Synced')
  })

  test('„Obriši datoteku iz Gita” with prune off: orphan stays, auto-sync skips; prune on deletes it', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, webhook: true })
    const before = s.argo.lastOperation?.id
    assert.ok(deleteFileFromGit(s).ok)
    advance(s, 5)
    assert.ok(s.cluster.objects['ConfigMap/klopa-promo'])
    assert.equal(appView(s).sync, 'OutOfSync')
    assert.ok(s.argo.resources.find((r) => r.key === 'ConfigMap/klopa-promo')?.requiresPruning)
    assert.equal(s.argo.lastOperation?.id, before, 'no auto-sync when only pruning is needed')
    assert.match(appView(s).autoSyncNote, /prune je isključen/)
    assert.ok(resourceTree(s).some((n) => n.id === 'ConfigMap/klopa-promo' && n.status === 'zahtijeva brisanje'))
    // manual sync without prune: PruneSkipped, still OutOfSync
    syncApp(s)
    advance(s, 3)
    assert.ok(s.argo.lastOperation?.results.some((r) => r.result === 'PruneSkipped'))
    assert.equal(appView(s).sync, 'OutOfSync')
    setSyncPolicy(s, { prune: true })
    // a sync to the same revision already succeeded → only selfHeal would re-sync; a manual sync with prune deletes
    syncApp(s, { prune: true })
    advance(s, 3)
    assert.equal(s.cluster.objects['ConfigMap/klopa-promo'], undefined)
    assert.equal(appView(s).sync, 'Synced')
    assert.equal(s.stats.prunes, 1)
  })

  test('auto-sync with prune on deletes a file removed from Git', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, webhook: true, policy: { automated: true, prune: true } })
    deleteFileFromGit(s)
    const gone = until(s, (x) => !x.cluster.objects['ConfigMap/klopa-promo'], 5)
    assert.ok(gone !== null)
  })

  test('allowEmpty protects against wiping every resource', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, webhook: true, policy: { automated: true, prune: true } })
    deleteFileFromGit(s, FILES.promo)
    advance(s, 3)
    deleteFileFromGit(s, FILES.service)
    advance(s, 3)
    deleteFileFromGit(s, FILES.deployment)
    advance(s, 5)
    assert.ok(dep(s), 'Deployment kept')
    assert.ok(appView(s).conditions.some((c) => /wipe out all resources/.test(c.message)))
    setSyncPolicy(s, { allowEmpty: true })
    advance(s, 3)
    assert.equal(dep(s), undefined)
  })
})

// ─── Failed syncs and retry ──────────────────────────────────────────────────

describe('failed syncs and retry', () => {
  test('automated sync of an invalid manifest: 1 attempt + 5 default retries (5, 10, 20, 40, 80 s), then no more for that commit', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, webhook: true })
    commitInvalidManifest(s)
    const started = until(s, (x) => x.argo.operation !== null, 3)
    assert.ok(started !== null)
    const failed = until(s, (x) => x.argo.operation === null, 400)
    assert.ok(failed !== null)
    const op = s.argo.lastOperation
    assert.equal(op?.phase, 'Failed')
    assert.equal(op?.retryCount, 5)
    const elapsed = failed - started
    assert.ok(Math.abs(elapsed - (5 + 10 + 20 + 40 + 80)) < 3, `retries took ${elapsed} s`)
    assert.equal(op?.message, 'one or more objects failed to apply (dry run) (retried 5 times).')
    assert.match(op?.results.find((x) => x.result === 'SyncFailed')?.message ?? '', /must be of type integer/)
    assert.equal(liveReplicas(s), 4, 'dry-run failed – nothing applied')
    const opsBefore = s.argo.nextOpId
    advance(s, 60)
    assert.equal(s.argo.nextOpId, opsBefore, 'auto-sync does not retry the same commit')
    assert.equal(appView(s).sync, 'OutOfSync')
    assert.ok(appView(s).conditions.some((c) => c.type === 'SyncError'))
    // a new commit (revert) is a new revision → synced
    gitRevert(s)
    assert.ok(until(s, (x) => appView(x).sync === 'Synced', 10) !== null)
  })

  test('manual sync without syncPolicy.retry fails once; syncPolicy.retry.limit is respected', () => {
    const s = createGitOps()
    commitInvalidManifest(s)
    syncApp(s)
    advance(s, 2)
    assert.equal(s.argo.lastOperation?.phase, 'Failed')
    assert.equal(s.argo.lastOperation?.retryCount, 0)
    setRetry(s, { limit: 2 })
    syncApp(s)
    const t0 = s.t
    until(s, (x) => x.argo.operation === null, 60)
    assert.equal(s.argo.lastOperation?.retryCount, 2)
    assert.ok(Math.abs(s.t - t0 - 15) < 2)
  })

  test('a failing PreSync migration (DB down) recovers through retries; phases and waves run in order', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, webhook: true, migration: 'presync', configMapWaveMinus1: true })
    setDatabaseDown(s, true)
    commitImage(s, '2.0.1')
    until(s, (x) => x.argo.operation?.stage === 'retryWait', 15)
    assert.match(s.argo.operation?.message ?? '', /^one or more synchronization tasks completed unsuccessfully, reason: Job has reached the specified backoff limit\. Retrying attempt #1/)
    assert.equal(liveImageTag(s), '1.4.0', 'wave 0 not applied after a failed PreSync hook')
    setDatabaseDown(s, false)
    const ok = until(s, (x) => x.argo.lastOperation?.phase === 'Succeeded' && x.argo.lastOperation.revision === x.repo.head, 120)
    assert.ok(ok !== null)
    const results = s.argo.lastOperation?.results.map((r) => r.key) ?? []
    assert.deepEqual(results.slice(0, 3), ['Job/klopa-migracija', 'ConfigMap/klopa-promo', 'Deployment/klopa-api'])
    assert.equal(liveImageTag(s), '2.0.1')
    assert.ok(s.stats.retries >= 1)
  })

  test('L22 DeepDive sync waves: migration Job (wave −1) completes before the Deployment (wave 0) is applied', () => {
    const s = createGitOps({ ...PRESETS.l22Waves, webhook: true })
    assert.equal(s.repo.commits.at(-1)?.files[FILES.migration].wave, -1)
    const r = commitImage(s, '2.0.1')
    assert.ok(r.ok)
    // kustomize-style image update: the migration Job gets the same new tag as the Deployment
    assert.match(String(r.commit.files[FILES.migration].fields[PATHS.image]), /:2\.0\.1$/)
    let jobDoneAt: number | null = null
    let deploymentAt: number | null = null
    until(
      s,
      (x) => {
        const job = x.cluster.jobs['Job/klopa-migracija']
        if (jobDoneAt === null && job?.status === 'Complete' && job.startedAt > 0) jobDoneAt = x.t
        if (deploymentAt === null && liveImageTag(x) === '2.0.1') deploymentAt = x.t
        return deploymentAt !== null
      },
      30,
    )
    const job = s.cluster.jobs['Job/klopa-migracija']
    assert.ok(jobDoneAt !== null && deploymentAt !== null)
    // wave −1 applied → 2 s pause (delayBetweenSyncWaves) → wait until the Job completes (3 s) → wave 0 applied (0,5 s)
    assert.ok(deploymentAt - job.startedAt >= 3, `wave 0 applied ${deploymentAt - job.startedAt} s after the Job started`)
    assert.ok(deploymentAt - jobDoneAt <= 1, `wave gap ${deploymentAt - jobDoneAt}`)
    // the final wave has no hooks: the sync succeeds right after apply, while the Deployment is still rolling out
    const fin = until(s, (x) => x.argo.operation === null && x.argo.lastOperation?.revision === r.sha, 5)
    assert.ok(fin !== null)
    assert.equal(s.argo.lastOperation?.phase, 'Succeeded')
    assert.equal(s.argo.lastOperation?.message, 'successfully synced (all tasks run)')
    assert.equal(appView(s).health, 'Progressing')
    assert.deepEqual(s.argo.lastOperation?.results.map((x) => x.key).slice(0, 3), ['Job/klopa-migracija', 'ConfigMap/klopa-promo', 'Deployment/klopa-api'])
    assert.ok(until(s, (x) => appView(x).health === 'Healthy', 60) !== null)
    assert.ok(resourceTree(s).some((n) => n.id === 'Job/klopa-migracija' && /hook/.test(n.status)))
    assert.equal(appView(s).sync, 'Synced', 'hooks are not part of the diff')
  })

  test('a migration Job whose image cannot be pulled never finishes – the sync waits until terminated', () => {
    const s = createGitOps({ ...PRESETS.l22Waves, webhook: true })
    commitBadImage(s, 'typo')
    advance(s, 60)
    assert.equal(s.argo.operation?.phase, 'Running')
    assert.match(s.argo.operation?.message ?? '', /waiting for completion of wave -1/)
    assert.equal(liveImageTag(s), '1.4.0', 'wave 0 never applied')
    assert.ok(s.cluster.pods.some((p) => p.ownerKind === 'Job' && p.status === 'ImagePullBackOff'))
    const fix = gitRevert(s)
    assert.ok(fix.ok)
    advance(s, 20)
    assert.notEqual(s.argo.lastOperation?.revision, fix.sha, 'auto-sync cannot start while the old operation runs')
    assert.ok(terminateSync(s))
    advance(s, 2)
    // the revert matches what runs (wave 0 was never applied), so nothing needs syncing
    assert.equal(appView(s).sync, 'Synced')
    assert.equal(appView(s).knownRevision, fix.sha)
    assert.equal(s.argo.lastOperation?.message, 'Operation terminated')
  })

  test('RETRY_PRESETS: none stops automated retries, unlimited keeps going with 3 min cap', () => {
    const off = createGitOps({ ...PRESETS.l22Auto, webhook: true, policy: { automated: true, retry: RETRY_PRESETS.none } })
    commitInvalidManifest(off)
    until(off, (x) => x.argo.lastOperation?.revision === x.repo.head, 10)
    assert.equal(off.argo.lastOperation?.phase, 'Failed')
    assert.equal(off.argo.lastOperation?.retryCount, 0)
    const inf = createGitOps({ ...PRESETS.l22Auto, webhook: true, policy: { automated: true, retry: RETRY_PRESETS.unlimited } })
    commitInvalidManifest(inf)
    advance(inf, 900)
    assert.ok(inf.argo.operation !== null, 'still retrying')
    assert.ok((inf.argo.operation?.retryCount ?? 0) >= 8)
    // 5, 10, 20, 40, 80, 160, then capped at 180 s
    assert.ok((appView(inf).operation?.nextRetryInS ?? 0) <= 180)
  })

  test('explicit retry.limit 0 makes the same failure final', () => {
    const s = createGitOps({ ...PRESETS.l22Waves, webhook: true, policy: { automated: true, retry: { limit: 0 } } })
    setDatabaseDown(s, true)
    commitImage(s, '2.0.1')
    until(s, (x) => x.argo.lastOperation?.phase === 'Failed', 20)
    setDatabaseDown(s, false)
    advance(s, 60)
    assert.equal(liveImageTag(s), '1.4.0')
    assert.equal(s.argo.lastOperation?.phase, 'Failed')
  })

  test('retries keep the original revision unless retry.refresh; terminate stops them', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, webhook: true })
    commitInvalidManifest(s)
    until(s, (x) => x.argo.operation?.stage === 'retryWait', 5)
    const badRev = s.argo.operation?.revision
    commitReplicas(s, 5)
    advance(s, 20)
    assert.equal(s.argo.operation?.revision, badRev, 'a fix commit waits behind the retrying operation')
    assert.ok(terminateSync(s))
    assert.equal(s.argo.operation, null)
    assert.ok(until(s, (x) => liveReplicas(x) === 5, 5) !== null, 'after terminate the new revision is auto-synced')

    const r = createGitOps({ ...PRESETS.l22Auto, webhook: true, policy: { automated: true, retry: { limit: 5, refresh: true } } })
    commitInvalidManifest(r)
    until(r, (x) => x.argo.operation?.stage === 'retryWait', 5)
    commitReplicas(r, 5)
    assert.ok(until(r, (x) => liveReplicas(x) === 5, 10) !== null, 'retry.refresh picks up the fix')
  })
})

// ─── HPA vs replicas in Git ──────────────────────────────────────────────────

describe('Argo CD and the HPA', () => {
  test('replicas in Git + HPA + selfHeal → tug of war; self-heal backs off but never stops', () => {
    const s = createGitOps(PRESETS.l22Hpa)
    advance(s, 130)
    assert.equal(l22Goals(s).hpaPeace, false)
    const f = replicaFight(s)
    assert.ok(f.fights >= 4, `fights ${f.fights}`)
    const argoWrites = s.cluster.replicaWrites.filter((w) => w.by === 'argocd').map((w) => w.t)
    const gaps = argoWrites.slice(1).map((t, i) => t - argoWrites[i])
    assert.ok(gaps.at(-1)! > gaps[0], `gaps grow: ${gaps.join(', ')}`)
    assert.ok(s.cluster.replicaWrites.some((w) => w.by === 'hpa' && w.to === 6))
  })

  test('tug-of-war timeline (HPA every 15 s, self-heal back-off 0, 2, 6, 18, 54, 162, 300 s): exact writes', () => {
    const s = createGitOps(PRESETS.l22Hpa)
    advance(s, 620)
    const w = s.cluster.replicaWrites.map((x) => `${x.by === 'hpa' ? 'H' : 'A'}${x.t}`)
    // A31.1: the Git poll at 30.5 s (the poll countdown restarts after every refresh – here the one after the 16.6 s
    // sync) re-compares at once and sees the HPA's 30 s write; the 2 s back-off since the last self-heal has passed
    assert.deepEqual(w, ['H15', 'A16.6', 'H30', 'A31.1', 'H45', 'A46.6', 'H60', 'A65.6', 'H75', 'A120.6', 'H135', 'A283.6', 'H285', 'A584.6', 'H585'])
    assert.equal(s.stats.replicaFights, 7)
    assert.equal(l22Goals(s).driftReverted, false, 'self-heals that only fought the HPA are not „reverted manual drift”')
    assert.equal(s.stats.kubectlDriftsReverted, 0)
  })

  test('ignoreDifferences alone hides the diff, but the next sync resets replicas → one more fight', () => {
    const s = createGitOps(PRESETS.l22Hpa)
    setIgnoreReplicas(s, true)
    advance(s, 60)
    const f0 = s.stats.replicaFights
    assert.equal(appView(s).sync, 'Synced')
    assert.equal(liveReplicas(s), 6)
    assert.ok(diffView(s).some((d) => d.path === PATHS.replicas && d.ignored))
    commitImage(s, '2.0.1')
    advance(s, 60)
    assert.equal(s.stats.replicaFights - f0, 1)
    advance(s, 120)
    assert.equal(s.stats.replicaFights - f0, 1, 'quiet again until the next commit')
    assert.equal(liveReplicas(s), 6)
    assert.equal(l22Goals(s).hpaPeace, false, 'the fix did not survive the next commit')
  })

  test('ignoreDifferences + RespectIgnoreDifferences=true → peace, also after the next commit', () => {
    const s = createGitOps(PRESETS.l22Hpa)
    setIgnoreReplicas(s, true)
    setRespectIgnoreDifferences(s, true)
    advance(s, 60)
    const f0 = s.stats.replicaFights
    commitImage(s, '2.0.1')
    advance(s, 90)
    assert.equal(s.stats.replicaFights, f0)
    assert.equal(liveImageTag(s), '2.0.1')
    assert.equal(liveReplicas(s), 6)
    assert.equal(appView(s).health, 'Healthy')
    assert.equal(l22Goals(s).hpaPeace, true)
  })

  test('removing replicas from Git drops the Deployment to 1 once unless the migration procedure is followed', () => {
    for (const migrate of [false, true]) {
      const s = createGitOps({ ...PRESETS.l22Hpa, webhook: true })
      setSyncPolicy(s, { selfHeal: false })
      advance(s, 20)
      removeReplicasFromGit(s, migrate)
      advance(s, 60)
      const dropped = s.cluster.replicaWrites.some((w) => w.by === 'argocd' && w.to === 1)
      assert.equal(dropped, !migrate, `migrate=${migrate}`)
      assert.equal(liveReplicas(s), 6)
      assert.equal(appView(s).sync, 'Synced')
      const f0 = s.stats.replicaFights
      commitImage(s, '2.0.1')
      advance(s, 60)
      assert.equal(s.stats.replicaFights, f0, 'no replicas in Git → no fight after the next commit')
      assert.equal(replicaFight(s).replicasInGit, false)
    }
  })

  test('„replicas u Gitu + HPA” break-it adds hpa.yaml to Git', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, policy: { automated: true, selfHeal: true }, webhook: true })
    assert.ok(addHpaToGit(s).ok)
    advance(s, 60)
    assert.ok(s.stats.replicaFights >= 1)
  })
})

// ─── Rollback in the UI vs git revert ────────────────────────────────────────

describe('Argo CD history rollback', () => {
  test('refused while auto-sync is on; when allowed, the app ends OutOfSync with Git', () => {
    const auto = createGitOps({ ...PRESETS.l22Auto, webhook: true })
    commitImage(auto, '2.0.1')
    advance(auto, 40)
    assert.equal(argoRollback(auto, 0).ok, false)

    const s = createGitOps()
    commitImage(s, '2.0.1')
    syncApp(s)
    advance(s, 40)
    assert.equal(liveImageTag(s), '2.0.1')
    assert.ok(argoRollback(s, 0).ok)
    advance(s, 40)
    assert.equal(liveImageTag(s), '1.4.0')
    assert.equal(appView(s).sync, 'OutOfSync', 'Git is no longer the truth')
  })
})

// ─── Pull moves the keys ─────────────────────────────────────────────────────

describe('security: repository protection, sourceIntegrity, AppProject', () => {
  test('without protection an unreviewed, unsigned commit is deployed by auto-sync', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, webhook: true })
    assert.ok(attackerCommit(s).ok)
    advance(s, 30)
    assert.match(String(dep(s).fields[PATHS.image]), /napadac\.example/)
  })

  test('branch protection rejects direct pushes; required signatures reject unsigned commits', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, protection: { requirePullRequest: true } })
    const head = s.repo.head
    const r = attackerCommit(s)
    assert.equal(r.ok, false)
    assert.equal(s.repo.head, head)
    const s2 = createGitOps({ protection: { requireSignedCommits: true } })
    assert.equal(commitImage(s2, '2.0.1', { signed: false }).ok, false)
    assert.ok(commitImage(s2, '2.0.1').ok, 'Lana signs with a trusted key')
    assert.equal(s2.stats.rejectedCommits, 1)
  })

  test('sourceIntegrity head: unsigned HEAD is diffed (OutOfSync) but never synced – ComparisonError, operations end in Error', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, webhook: true, project: { sourceIntegrity: 'head' } })
    const bad = attackerCommit(s)
    assert.ok(bad.ok)
    advance(s, 3)
    assert.equal(appView(s).sync, 'OutOfSync', 'Argo CD 3.5 still renders and diffs the revision')
    const cond = appView(s).conditions.find((c) => c.type === 'ComparisonError')
    assert.ok(cond)
    assert.equal(cond.message, `GIT/GPG: Failed verifying revision ${bad.sha} by 'nepoznati-korisnik': unsigned (key_id=)`)
    assert.equal(s.stats.blockedBySourceIntegrity, 1)
    // the automated sync is attempted, errors, retries 5× (default) and then stops for this commit
    const done = until(s, (x) => x.argo.operation === null && x.argo.lastOperation?.revision === bad.sha, 200)
    assert.ok(done !== null)
    assert.equal(s.argo.lastOperation?.phase, 'Error')
    assert.equal(s.argo.lastOperation?.retryCount, AUTO_SYNC_DEFAULT_RETRY_LIMIT)
    assert.match(s.argo.lastOperation?.message ?? '', /^ComparisonError: GIT\/GPG/)
    assert.equal(liveImageTag(s), '1.4.0', 'nothing from the unsigned commit reached the cluster')
    // a manual sync is accepted as an operation but ends in Error at once (no retry for manual syncs)
    assert.ok(syncApp(s).ok)
    advance(s, 1)
    assert.equal(s.argo.lastOperation?.phase, 'Error')
    assert.equal(s.argo.lastOperation?.retryCount, 0)
    // a signed fix on top passes 'head' …
    gitRevert(s)
    advance(s, 3)
    assert.equal(appView(s).sync, 'Synced')
    assert.equal(appView(s).conditions.filter((c) => c.type === 'ComparisonError').length, 0)
    // … but not 'strict', because an ancestor is unsigned: the next signed release is not deployed
    setSourceIntegrity(s, 'strict')
    advance(s, 1)
    assert.ok(appView(s).conditions.some((c) => c.type === 'ComparisonError' && c.message.includes(bad.sha)))
    commitImage(s, '2.0.1')
    advance(s, 10)
    assert.equal(appView(s).sync, 'OutOfSync')
    assert.equal(liveImageTag(s), '1.4.0')
    assert.equal(s.argo.operation?.phase ?? s.argo.lastOperation?.phase, s.argo.operation ? 'Running' : 'Error')
  })

  test('sourceIntegrity: a commit signed with a key outside the keyring is rejected too', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, webhook: true, project: { sourceIntegrity: 'head' } })
    const r = commitImage(s, '2.0.1', { author: 'Iva', signed: true })
    assert.ok(r.ok)
    advance(s, 3)
    assert.match(appView(s).conditions.find((c) => c.type === 'ComparisonError')?.message ?? '', /signed with key not in keyring \(key_id=UNTRUSTED-/)
    assert.equal(integrityStatus(s).ok, false)
  })

  test('a restricted AppProject refuses cluster-scoped objects', () => {
    const open = createGitOps({ ...PRESETS.l22Auto, webhook: true })
    attackerCommit(open, 'rbac')
    advance(open, 10)
    assert.ok(open.cluster.objects['ClusterRoleBinding/monitoring-admin'])
    const s = createGitOps({ ...PRESETS.l22Auto, webhook: true })
    setProjectRestricted(s, true)
    attackerCommit(s, 'rbac')
    advance(s, 10)
    assert.equal(s.cluster.objects['ClusterRoleBinding/monitoring-admin'], undefined)
    assert.match(s.argo.operation?.message ?? s.argo.lastOperation?.message ?? '', /not permitted in project klopa/)
  })

  test('deploy paths: push = CI holds the cluster key; pull = repo + Argo CD, CI only a repo token', () => {
    const push = createGitOps(PRESETS.l22Push)
    const pp = deployPaths(push)
    assert.equal(pp.length, 1)
    assert.equal(pp[0].where, 'ci')
    leakCiCredentials(push)
    assert.equal(push.security.clusterCompromised, true)
    const pull = createGitOps(PRESETS.l22)
    const pl = deployPaths(pull)
    assert.deepEqual(pl.map((p) => p.where).sort(), ['ci', 'cluster', 'git'])
    assert.equal(pl.find((p) => p.where === 'git')?.guarded, false)
    setRepoProtection(pull, { requirePullRequest: true })
    assert.equal(deployPaths(pull).find((p) => p.where === 'git')?.guarded, true)
    leakCiCredentials(pull)
    assert.equal(pull.security.clusterCompromised, false)
  })
})

// ─── Push vs pull, CI lane ───────────────────────────────────────────────────

describe('CI and the two delivery models', () => {
  test('pull: CI bot commits tag@digest (signed, no cluster credentials); Argo CD pulls it', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, webhook: true })
    startCiRelease(s, '2.0.2')
    advance(s, 9)
    assert.equal(s.repo.commits.length, 3)
    const done = until(s, (x) => x.repo.commits.length === 4, 3)
    assert.ok(done !== null && Math.abs(done - 10) < 0.15)
    const c = s.repo.commits.at(-1)!
    assert.equal(c.author, 'ci-bot')
    assert.ok(c.signature)
    assert.match(String(c.files[FILES.deployment].fields[PATHS.image]), /:2\.0\.2@sha256:[0-9a-f]{64}$/)
    assert.ok(until(s, (x) => liveImageTag(x) === '2.0.2' && appView(x).health === 'Healthy' && capacity(x).ready === 4, 60) !== null)
    assert.equal(commitGraph(s)[0].lane, 'bot')
  })

  test('push: CI applies directly, Git no longer describes production, drift goes unnoticed', () => {
    const s = createGitOps(PRESETS.l22Push)
    assert.equal(appView(s).sync, 'Unknown')
    startCiRelease(s, '2.0.2')
    advance(s, 40)
    assert.equal(liveImageTag(s), '2.0.2')
    assert.equal(gitMatchesCluster(s).matches, false)
    kubectlScale(s, 10)
    advance(s, 60)
    assert.equal(liveReplicas(s), 10)
    assert.equal(s.argo.operation, null)
    assert.match(argocdAppGet(s)[0], /not found/)
  })
})

// ─── Secrets (L23) ───────────────────────────────────────────────────────────

describe('secrets in GitOps (L23)', () => {
  test('SealedSecret: safe in Git until the controller key leaks; rotation through Git; env Pods need a restart', () => {
    const s = createGitOps({ ...PRESETS.l23, webhook: true })
    assert.equal(secretView(s).clusterSecretValue, 'sms-kljuc-v1')
    assert.ok(secretView(s).pods.every((p) => p.value === 'sms-kljuc-v1' && p.source === 'env'))
    assert.deepEqual(gitLeaks(s).exposedCurrent, [])
    leakSealingKeys(s)
    assert.deepEqual(gitLeaks(s).exposedCurrent, ['sms-kljuc-v1'])
    const v2 = rotateSecret(s)
    commitSealedSecret(s, v2)
    assert.ok(until(s, (x) => secretView(x).clusterSecretValue === v2, 10) !== null)
    assert.ok(secretView(s).pods.every((p) => p.stale), 'env consumers keep the old value')
    rolloutRestart(s)
    assert.ok(until(s, (x) => secretView(x).pods.length === 4 && secretView(x).pods.every((p) => p.value === v2 && p.status === 'Running'), 60) !== null)
    // leaked keys also expose v2 (sealed with a leaked key) – rotation of the keys themselves is needed
    assert.deepEqual(gitLeaks(s).exposedStale, ['sms-kljuc-v1'])
  })

  test('plain Secret in Git stays readable after the file is deleted; only rotation makes it stale', () => {
    const s = createGitOps({ ...PRESETS.l23, secrets: 'none' })
    commitPlainSecret(s, 'sms-kljuc-v1')
    deleteFileFromGit(s, FILES.secret)
    assert.deepEqual(gitLeaks(s).exposedCurrent, ['sms-kljuc-v1'])
    rotateSecret(s)
    assert.deepEqual(gitLeaks(s).exposedCurrent, [])
    assert.deepEqual(gitLeaks(s).exposedStale, ['sms-kljuc-v1'])
  })

  test('rebuilt cluster without the sealing-key backup: SealedSecret Degraded, Pods CreateContainerConfigError', () => {
    const lost = createGitOps(PRESETS.l23)
    rebuildCluster(lost, { restoreSealingKeys: false })
    advance(lost, 30)
    assert.equal(lost.cluster.objects['Secret/klopa-sms'], undefined)
    assert.ok(podsView(lost).length > 0 && podsView(lost).every((p) => p.status === 'CreateContainerConfigError'))
    assert.equal(lost.argo.resources.find((r) => r.kind === 'SealedSecret')?.health, 'Degraded')
    assert.equal(appView(lost).health, 'Degraded')

    const ok = createGitOps(PRESETS.l23)
    rebuildCluster(ok, { restoreSealingKeys: true })
    assert.ok(until(ok, (x) => capacity(x).ready === 4 && appView(x).health === 'Healthy', 60) !== null)
  })

  test('L22 bridge: a Secret applied by hand from a laptop is gone after a rebuild', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, secrets: 'manual' })
    assert.equal(capacity(s).ready, 4)
    rebuildCluster(s)
    advance(s, 30)
    assert.ok(podsView(s).every((p) => p.status === 'CreateContainerConfigError'))
    kubectlApplySecret(s)
    assert.ok(until(s, (x) => capacity(x).ready === 4, 20) !== null)
  })

  test("SOPS via KSOPS: ciphertext in Git, plaintext only in the cluster and in Argo CD's cache; age key leak exposes history", () => {
    const s = createGitOps({ ...PRESETS.l23, secrets: 'sops', webhook: true })
    assert.equal(s.argo.sourcePlugin, 'ksops')
    const file = s.repo.commits.at(-1)?.files[FILES.sopsSecret]
    assert.match(String(file?.fields[PATHS.data('kljuc')]), /^ENC\[AES256_GCM,data:/)
    assert.equal(secretView(s).clusterSecretValue, 'sms-kljuc-v1')
    assert.deepEqual(gitLeaks(s).exposedValues, [])
    assert.equal(gitLeaks(s).argoCacheHasPlaintext, true, 'KSOPS renders the plaintext Secret into the manifest cache')
    leakSopsKey(s)
    assert.deepEqual(gitLeaks(s).exposedCurrent, ['sms-kljuc-v1'])
    const v2 = rotateSecret(s)
    assert.ok(commitSopsSecret(s, v2).ok)
    assert.ok(until(s, (x) => secretView(x).clusterSecretValue === v2, 5) !== null)
    assert.deepEqual(gitLeaks(s).exposedStale, ['sms-kljuc-v1'])
    // without the age key in the repo-server the app cannot be rendered
    setSopsKeyInArgo(s, false)
    advance(s, 1)
    assert.equal(appView(s).sync, 'Unknown')
    assert.match(appView(s).conditions[0]?.message ?? '', /ksops/)
  })

  test('SOPS without a plugin: Argo CD has no native support – the encrypted Secret fails validation', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, webhook: true, policy: { automated: true, retry: RETRY_PRESETS.none } })
    assert.ok(commitSopsSecret(s, 'sms-kljuc-v1').ok)
    advance(s, 5)
    assert.equal(s.argo.lastOperation?.phase, 'Failed')
    assert.equal(s.argo.lastOperation?.message, 'one or more objects failed to apply (dry run)')
    assert.match(s.argo.lastOperation?.results.find((x) => x.key === 'Secret/klopa-sms')?.message ?? '', /illegal base64 data/)
    assert.equal(s.cluster.objects['Secret/klopa-sms'], undefined)
  })

  test("a plain Secret rendered from Git puts readable values into Argo CD's cache; sealed/ESO do not", () => {
    const plain = createGitOps({ ...PRESETS.l23, secrets: 'plain' })
    assert.equal(gitLeaks(plain).argoCacheHasPlaintext, true)
    for (const secrets of ['sealed', 'eso'] as const) assert.equal(gitLeaks(createGitOps({ ...PRESETS.l23, secrets })).argoCacheHasPlaintext, false, secrets)
  })

  test('ESO: rotation reaches the Secret within refreshInterval; store down keeps the last Secret', () => {
    const s = createGitOps({ ...PRESETS.l24, secretConsumption: 'volume' })
    const v2 = rotateSecret(s)
    const updated = until(s, (x) => secretView(x).clusterSecretValue === v2, 35)
    assert.ok(updated !== null && updated <= 31.1)
    const podsUpdated = until(s, (x) => secretView(x).pods.every((p) => p.value === v2), 15)
    assert.ok(podsUpdated !== null && podsUpdated - updated >= 9.9, 'volume Pods see it after the kubelet sync delay (10 s sim)')
    setStoreAvailable(s, false)
    advance(s, 40)
    assert.equal(secretView(s).clusterSecretValue, v2)
    assert.equal(s.argo.resources.find((r) => r.kind === 'ExternalSecret')?.health, 'Degraded')
    rolloutRestart(s)
    assert.ok(until(s, (x) => capacity(x).ready === 4 && podsView(x).every((p) => p.terminating || p.ready), 60) !== null, 'new Pods still start')
  })

  test('CSI driver: store down → new Pods stuck in ContainerCreating (FailedMount)', () => {
    const s = createGitOps({ ...PRESETS.l24, secrets: 'csi' })
    assert.equal(capacity(s).ready, 4)
    assert.equal(s.cluster.objects['Secret/klopa-sms'], undefined, 'no Secret object without sync')
    setStoreAvailable(s, false)
    rolloutRestart(s)
    advance(s, 20)
    const fresh = podsView(s).filter((p) => !p.ready && !p.terminating)
    assert.ok(fresh.length > 0 && fresh.every((p) => p.status === 'ContainerCreating' && /FailedMount/.test(p.reason)))
  })

  test('argocd-vault-plugin: plaintext in Argo CD cache, rotation only after a hard refresh, store down → ComparisonError', () => {
    const s = createGitOps({ ...PRESETS.l24, secrets: 'avp' })
    assert.equal(gitLeaks(s).argoCacheHasPlaintext, true)
    assert.equal(secretView(s).clusterSecretValue, 'sms-kljuc-v1')
    const v2 = rotateSecret(s)
    advance(s, 40)
    assert.equal(secretView(s).clusterSecretValue, 'sms-kljuc-v1', 'cached render – nothing changes')
    refreshApp(s, true)
    assert.ok(until(s, (x) => secretView(x).clusterSecretValue === v2, 10) !== null)
    setStoreAvailable(s, false)
    refreshApp(s, true)
    advance(s, 2)
    assert.equal(appView(s).sync, 'Unknown')
  })
})

// ─── L24 fault deck items owned by E6 ────────────────────────────────────────

describe('L24 incidents', () => {
  test('tag typo with webhook + auto-sync: ImagePullBackOff, Synced but Degraded; fix only by commit', () => {
    const s = createGitOps(PRESETS.l24)
    commitBadImage(s, 'typo')
    assert.ok(until(s, (x) => appView(x).health === 'Degraded', 120) !== null)
    assert.equal(appView(s).sync, 'Synced')
    const lines = argocdAppGet(s).join('\n')
    assert.match(lines, /Health Status: {6}Degraded/)
    assert.match(lines, /exceeded its progress deadline/)
    // manual kubectl fix is reverted by selfHeal
    kubectlEdit(s)
    gitRevert(s)
    assert.ok(until(s, (x) => appView(x).health === 'Healthy' && liveImageTag(x) === '2.0.1', 60) !== null)
  })

  function kubectlEdit(s: GitOpsState) {
    // someone "fixes" production by hand: selfHeal puts Git's (bad) value back
    const before = s.stats.selfHealSyncs
    kubectlScale(s, 2)
    until(s, (x) => liveReplicas(x) === 4, 5)
    assert.ok(s.stats.selfHealSyncs > before)
  }
})

// ─── Edge cases ──────────────────────────────────────────────────────────────

describe('edge cases', () => {
  test('step ignores 0, negative, NaN and Infinity; large dt is clamped', () => {
    const s = createGitOps()
    for (const dt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) step(s, dt)
    assert.equal(s.t, 0)
    step(s, 1000)
    assert.ok(Math.abs(s.t - 60) < 0.11)
    advance(s, Number.NaN)
    advance(s, -5)
    assert.ok(Math.abs(s.t - 60) < 0.11)
  })

  test('zero replicas in Git: Healthy with no Pods, capacity ratio 0 (no division by zero)', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, webhook: true })
    commitReplicas(s, 0)
    advance(s, 15)
    assert.equal(podsView(s).length, 0)
    assert.equal(appView(s).health, 'Healthy')
    const c = capacity(s)
    assert.equal(c.ratio, 0)
    assert.ok(Number.isFinite(c.ratio))
  })

  test('all Pods unhealthy: Degraded, capacity 0', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, webhook: true, replicas: 1 })
    commitBadImage(s, 'crash')
    advance(s, 90)
    assert.equal(capacity(s).ready, 1, 'maxUnavailable 0 with N = 1 keeps the old Pod')
    kubectlDelete(s, 'Deployment', 'klopa-api')
    syncApp(s)
    advance(s, 90)
    assert.equal(capacity(s).ready, 0)
    assert.equal(appView(s).health, 'Degraded')
  })

  test('HPA without demand does nothing; invalid seed falls back to default', () => {
    const s = createGitOps({ hpa: { min: 2, max: 10 }, hpaDemand: 0, seed: Number.NaN })
    assert.equal(s.cfg.seed, DEFAULT_CONFIG.seed)
    advance(s, 60)
    assert.equal(liveReplicas(s), 4)
    assert.equal(s.cluster.replicaWrites.length, 0)
  })

  test('NaN / negative inputs are rejected or clamped', () => {
    const s = createGitOps(PRESETS.l22Hpa)
    assert.equal(kubectlScale(s, Number.NaN), false)
    assert.equal(commitReplicas(s, Number.NaN).ok, false)
    assert.equal(commitReplicas(s, -1).ok, false)
    setHpaDemand(s, Number.NaN)
    assert.equal(s.cluster.hpaDemand, 0)
    advance(s, 30)
    assert.ok(Number.isInteger(liveReplicas(s)))
    for (const series of Object.values(s.metrics)) if (typeof series === 'object') assert.ok(series.values.every((v: number) => Number.isFinite(v)))
  })

  test('actions on missing objects and empty commits are safe', () => {
    const s = createGitOps()
    assert.equal(kubectlDelete(s, 'Deployment', 'ne-postoji'), false)
    kubectlDelete(s, 'Deployment', 'klopa-api')
    assert.equal(kubectlScale(s, 3), false)
    assert.equal(commitImage(s, '1.4.0').ok, false, 'no changes → nothing to commit')
    assert.equal(deleteFileFromGit(s, 'apps/klopa-api/nema.yaml').ok, false)
    assert.equal(gitRevert(s, 'deadbeef').ok, false)
    assert.equal(gitRevert(s, s.repo.commits[0].sha).ok, false)
    assert.equal(argoRollback(s, 99).ok, false)
    assert.equal(terminateSync(s), false)
    advance(s, 5)
    assert.equal(s.argo.resources.find((r) => r.key === 'Deployment/klopa-api')?.health, 'Missing')
    assert.equal(appView(s).sync, 'OutOfSync')
    assert.equal(capacity(s).ratio, 0)
  })

  test('events are capped and have stable increasing ids', () => {
    const s = createGitOps(PRESETS.l22Hpa)
    for (let i = 0; i < 40; i++) {
      kubectlScale(s, 5 + (i % 3))
      advance(s, 3)
    }
    assert.ok(s.events.length <= 50)
    for (let i = 1; i < s.events.length; i++) assert.ok(s.events[i].id > s.events[i - 1].id)
    assert.ok(s.events.every((e) => ['ok', 'warn', 'bad', 'info', 'neutral'].includes(e.tone) && e.text.length > 0))
  })

  test('webhook toggle at runtime', () => {
    const s = createGitOps(PRESETS.l22Auto)
    setWebhook(s, true)
    commitImage(s, '2.0.1')
    assert.ok(until(s, (x) => !appView(x).behindGit, 2) !== null)
  })
})

// ─── Combining with an external workload model (E3) ──────────────────────────

describe('external workload model (E3 bridge)', () => {
  test('E6 hands the Pods to another engine: it publishes the applied spec and derives Argo CD health from the reported status', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, webhook: true })
    setExternalWorkload(s, 'klopa-api', true)
    assert.equal(podsView(s).length, 0, 'E6 no longer simulates these Pods')
    const before = deploymentSpec(s, 'klopa-api')
    assert.ok(before)
    assert.equal(before.tag, '1.4.0')
    assert.equal(before.effectiveReplicas, 4)
    commitImage(s, '2.0.1')
    advance(s, 3)
    const spec = deploymentSpec(s, 'klopa-api')
    assert.ok(spec)
    assert.equal(spec.tag, '2.0.1')
    assert.equal(spec.generation, before.generation + 1)
    assert.notEqual(spec.templateHash, before.templateHash)
    assert.equal(appView(s).health, 'Progressing', 'the external controller has not observed the new generation yet')
    // a stale report (no hash) after a template change never counts – a complete old rollout must not look Healthy
    setExternalWorkloadStatus(s, 'klopa-api', { replicas: 4, updatedReplicas: 4, readyReplicas: 4, availableReplicas: 4 })
    advance(s, 1)
    assert.equal(appView(s).healthMessage, 'Waiting for rollout to finish: observed deployment generation less than desired generation')
    assert.ok(setExternalWorkloadStatus(s, 'klopa-api', { replicas: 5, updatedReplicas: 2, readyReplicas: 3, availableReplicas: 3, observedTemplateHash: spec.templateHash }))
    advance(s, 1)
    assert.equal(appView(s).healthMessage, 'Waiting for rollout to finish: 2 out of 4 new replicas have been updated...')
    setExternalWorkloadStatus(s, 'klopa-api', { replicas: 4, updatedReplicas: 4, readyReplicas: 4, availableReplicas: 4, observedTemplateHash: spec.templateHash })
    advance(s, 1)
    assert.equal(appView(s).health, 'Healthy')
    setExternalWorkloadStatus(s, 'klopa-api', { replicas: 5, updatedReplicas: 2, readyReplicas: 3, availableReplicas: 3, progressDeadlineExceeded: true })
    advance(s, 1)
    assert.equal(appView(s).health, 'Degraded')
    assert.equal(appView(s).sync, 'Synced')
    assert.equal(podsView(s).length, 0)
    assert.equal(setExternalWorkloadStatus(s, 'ne-postoji', { replicas: 0, updatedReplicas: 0, readyReplicas: 0, availableReplicas: 0 }), false)
    assert.equal(deploymentSpec(s, 'ne-postoji'), null)
    // a pure scale (no template change) is current without a hash – an HPA-driven E3 never gets stuck Progressing
    kubectlScale(s, 6)
    setExternalWorkloadStatus(s, 'klopa-api', { replicas: 6, updatedReplicas: 6, readyReplicas: 6, availableReplicas: 6 })
    advance(s, 1)
    assert.equal(objectHealth(s, 'Deployment/klopa-api').status, 'Healthy')
  })
})

// ─── Chaos run: structural invariants under random actions ───────────────────

describe('invariants under a seeded random action sequence', () => {
  const SYNC = ['Synced', 'OutOfSync', 'Unknown']
  const HEALTH = ['Healthy', 'Progressing', 'Degraded', 'Suspended', 'Missing', 'Unknown']
  for (const preset of ['l22Auto', 'l22Hpa', 'l22Waves', 'l23', 'l24'] as const) {
    test(`preset ${preset}: 600 s of random actions keep the state consistent`, () => {
      const s = createGitOps({ ...PRESETS[preset], policy: { ...PRESETS[preset].policy, selfHeal: true } })
      const rng = createRng(7)
      const actions: ((x: GitOpsState) => unknown)[] = [
        (x) => commitImage(x, rng.pick(['1.3.2', '1.4.0', '2.0.0', '2.0.1'])),
        (x) => commitBadImage(x, rng.pick(['typo', 'crash'] as const)),
        (x) => commitReplicas(x, rng.int(0, 6)),
        (x) => gitRevert(x),
        (x) => kubectlScale(x, rng.int(0, 10)),
        (x) => kubectlDelete(x, 'Deployment', 'klopa-api'),
        (x) => syncApp(x, { prune: rng.chance(0.5) }),
        (x) => setSyncPolicy(x, { selfHeal: rng.chance(0.5), prune: rng.chance(0.5) }),
        (x) => setHpaDemand(x, rng.int(0, 9)),
        (x) => rolloutPause(x, rng.chance(0.3)),
        (x) => terminateSync(x),
        (x) => setWebhook(x, rng.chance(0.5)),
      ]
      let lastEventId = 0
      for (let i = 0; i < 6000; i++) {
        if (i % 40 === 0) rng.pick(actions)(s)
        step(s, 0.1)
        const v = appView(s)
        assert.ok(SYNC.includes(v.sync), v.sync)
        assert.ok(HEALTH.includes(v.health), v.health)
        assert.ok(s.events.length <= 50)
        const ids = new Set(s.cluster.pods.map((p) => p.id))
        assert.equal(ids.size, s.cluster.pods.length, 'Pod names are unique')
        for (const p of s.cluster.pods) {
          // terminating Pods of a deleted Deployment may outlive their ReplicaSet (as in Kubernetes); live ones may not
          if (p.ownerKind === 'ReplicaSet' && p.status !== 'Terminating') assert.ok(s.cluster.replicaSets.some((r) => r.name === p.owner), `orphan Pod ${p.id}`)
        }
        for (const rs of s.cluster.replicaSets) assert.ok(Number.isInteger(rs.replicas) && rs.replicas >= 0)
        const d = s.cluster.deployments['klopa-api']
        if (d && s.cluster.objects['Deployment/klopa-api']) assert.equal(d.status.replicas, podsView(s).filter((p) => !p.terminating).length)
        assert.ok(findCommitSafe(s, s.repo.head))
        if (s.argo.operation) assert.equal(s.argo.operation.phase, 'Running')
      }
      for (const e of s.events) {
        assert.ok(e.id > lastEventId)
        lastEventId = e.id
      }
      for (const series of [s.metrics.liveReplicas, s.metrics.readyPods, s.metrics.synced, s.metrics.healthy, s.metrics.gitReplicas]) {
        assert.ok(series.values.length > 0 && series.values.every((x) => Number.isFinite(x)))
      }
    })
  }
})

function findCommitSafe(s: GitOpsState, sha: string) {
  return s.repo.commits.some((c) => c.sha === sha)
}

// ─── Determinism ─────────────────────────────────────────────────────────────

describe('determinism', () => {
  function script(cfg: GitOpsConfig) {
    const s = createGitOps(cfg)
    commitImage(s, '2.0.1')
    advance(s, 20)
    kubectlScale(s, 7)
    advance(s, 20)
    commitBadImage(s, 'crash')
    advance(s, 30)
    gitRevert(s)
    advance(s, 60)
    return JSON.stringify({ events: s.events, pods: podsView(s).map((p) => p.id), commits: s.repo.commits.map((c) => c.sha), poll: s.argo.nextPollAt, fights: s.stats })
  }
  test('same config + seed + actions ⇒ identical run', () => {
    const cfg = { ...PRESETS.l22Hpa, webhook: false }
    assert.equal(script(cfg), script(cfg))
  })
  test('a different seed changes poll jitter and Pod names', () => {
    assert.notEqual(script({ ...PRESETS.l22Hpa, seed: 1 }), script({ ...PRESETS.l22Hpa, seed: 2 }))
  })
})

// ─── Regression tests for the review findings ───────────────────────────────

describe('review fixes: secrets eyes follow the leaked keys (E5 rules)', () => {
  test('SOPS: a leaked age key exposes only values encrypted for it; new age key + rotation closes the eye', () => {
    const s = createGitOps({ ...PRESETS.l23, secrets: 'sops', webhook: true })
    leakSopsKey(s)
    assert.deepEqual(gitLeaks(s).exposedCurrent, ['sms-kljuc-v1'])
    assert.deepEqual(secretView(s).sops.leakedRecipients, [s.secrets.sops.recipients[0]])
    // re-encrypting the rotated value for the SAME (leaked) key does not help
    const bad = createGitOps({ ...PRESETS.l23, secrets: 'sops', webhook: true })
    leakSopsKey(bad)
    const w2 = rotateSecret(bad)
    commitSopsSecret(bad, w2)
    assert.deepEqual(gitLeaks(bad).exposedCurrent, [w2])
    // correct response: new age key, rotate, re-encrypt for the new key
    renewSopsKey(s)
    const v2 = rotateSecret(s)
    assert.ok(commitSopsSecret(s, v2).ok)
    assert.ok(until(s, (x) => secretView(x).clusterSecretValue === v2, 5) !== null, 'KSOPS has the new key too')
    assert.deepEqual(gitLeaks(s).exposedCurrent, [])
    assert.deepEqual(gitLeaks(s).exposedStale, ['sms-kljuc-v1'])
  })

  test('Sealed Secrets: leaked key ids are recorded; renew key → rotate → re-seal makes the Git-history eye grey', () => {
    const s = createGitOps({ ...PRESETS.l23, webhook: true })
    leakSealingKeys(s)
    assert.deepEqual(s.secrets.sealing.leakedKeyIds, [...s.secrets.sealing.clusterKeyIds])
    assert.deepEqual(gitLeaks(s).exposedCurrent, ['sms-kljuc-v1'])
    renewSealingKey(s)
    const v2 = rotateSecret(s)
    commitSealedSecret(s, v2)
    assert.ok(until(s, (x) => secretView(x).clusterSecretValue === v2, 10) !== null)
    assert.deepEqual(gitLeaks(s).exposedCurrent, [], 'sealed with a key the attacker does not have')
    assert.deepEqual(gitLeaks(s).exposedStale, ['sms-kljuc-v1'])
    assert.equal(secretView(s).sealing.keys.filter((k) => k.leaked).length, 1)
    // without a new key the re-sealed value is readable as well
    const t = createGitOps({ ...PRESETS.l23, webhook: true })
    leakSealingKeys(t)
    const w2 = rotateSecret(t)
    commitSealedSecret(t, w2)
    assert.deepEqual(gitLeaks(t).exposedCurrent, [w2])
  })

  test('Argo CD cache eye: only still-valid values count; renders expire after 12 min sim (24 h real) unless renewed', () => {
    assert.equal(TIMINGS.argoCacheExpiry.realValue, 24 * 3600)
    const s = createGitOps({ ...PRESETS.l23, secrets: 'plain', webhook: true })
    assert.equal(gitLeaks(s).argoCacheHasPlaintext, true)
    // switch to SealedSecret in one commit; v1 is still in the cache and still valid → red
    assert.ok(setSecretsApproach(s, 'sealed').ok)
    advance(s, 20)
    assert.equal(gitLeaks(s).argoCacheHasPlaintext, true)
    // rotation makes the cached v1 harmless; nothing readable is rendered any more
    const v2 = rotateSecret(s)
    setSecretsApproach(s, 'sealed', { value: v2 })
    advance(s, 10)
    assert.equal(gitLeaks(s).argoCacheHasPlaintext, false)
    assert.deepEqual(gitLeaks(s).argoCacheValues, ['sms-kljuc-v1'])
    advance(s, TIMINGS.argoCacheExpiry.simValue + 5)
    assert.deepEqual(gitLeaks(s).argoCacheValues, [], 'expired')
    // a render in use is renewed at every refresh and never expires
    const avp = createGitOps({ ...PRESETS.l24, secrets: 'avp' })
    advance(avp, TIMINGS.argoCacheExpiry.simValue + 60)
    assert.equal(gitLeaks(avp).argoCacheHasPlaintext, true)
    rebuildCluster(avp)
    assert.deepEqual(gitLeaks(avp).argoCacheValues, [], 'a reinstalled Argo CD starts with an empty Redis')
  })

  test('setSecretsApproach switches carrier, consumption and plugin in ONE commit; history keeps the plain value', () => {
    const s = createGitOps({ ...PRESETS.l23, secrets: 'plain', webhook: true })
    const r = setSecretsApproach(s, 'sealed')
    assert.ok(r.ok)
    assert.deepEqual(r.commit.changes.map((c) => `${c.path.split('/').pop()}:${c.change}`).sort(), ['sealedsecret-sms.yaml:added', 'secret-sms.yaml:removed'])
    advance(s, 20)
    assert.equal(appView(s).sync, 'Synced')
    assert.equal(secretView(s).clusterSecretOwner, 'SealedSecret/klopa-sms', 'prune removed the plain Secret, the controller took over')
    assert.ok(secretView(s).pods.every((p) => p.status === 'Running' && p.value === 'sms-kljuc-v1'))
    assert.deepEqual(gitLeaks(s).exposedCurrent, ['sms-kljuc-v1'], 'switching does not clean Git history – rotate')
    const e = setSecretsApproach(s, 'eso', { consumption: 'volume' })
    assert.ok(e.ok)
    assert.ok(e.commit.changes.some((c) => c.path === FILES.deployment && c.fields.some((f) => f.path === PATHS.volumeSecretName && f.after === 'klopa-sms')))
    assert.ok(until(s, (x) => secretView(x).pods.length === 4 && secretView(x).pods.every((p) => p.source === 'volume' && p.status === 'Running'), 60) !== null)
    assert.ok(setSecretsApproach(s, 'avp').ok)
    assert.equal(s.argo.sourcePlugin, 'argocd-vault-plugin')
    assert.ok(setSecretsApproach(s, 'csi').ok)
    assert.equal(s.argo.sourcePlugin, 'none')
    assert.equal(setSecretsApproach(s, 'csi').ok, false, 'nothing to change')
  })
})

describe('review fixes: proportional scaling (sync.go scale)', () => {
  function stall(n = 10) {
    const s = createGitOps({ ...PRESETS.l22, replicas: n })
    commitField(s, FILES.deployment, PATHS.maxSurge, 3)
    commitField(s, FILES.deployment, PATHS.maxUnavailable, 2)
    syncApp(s)
    advance(s, 3)
    commitBadImage(s, 'typo')
    syncApp(s)
    advance(s, 60)
    return s
  }
  const sizes = (s: GitOpsState) => s.cluster.replicaSets.filter((r) => r.replicas > 0).map((r) => `${r.tag}=${r.replicas}`).sort().join(' ')

  test('Kubernetes docs example: 10 replicas stalled at 8 old / 5 new, scaled to 15 → 11 old / 7 new; capacity never drops', () => {
    const s = stall()
    assert.equal(sizes(s), '1.4.0=8 2.0.l=5')
    kubectlScale(s, 15)
    step(s, 0.1)
    assert.equal(sizes(s), '1.4.0=11 2.0.l=7')
    let minReady = Infinity
    for (let i = 0; i < 300; i++) {
      step(s, 0.1)
      const pods = podsView(s)
      assert.ok(pods.filter((p) => !p.terminating).length <= 15 + 3, `≤ N + maxSurge at t=${s.t}`)
      minReady = Math.min(minReady, pods.filter((p) => p.ready).length)
    }
    assert.equal(minReady, 8, 'never below the Ready count before the scale')
    assert.equal(capacity(s).ready, 11)
  })

  test('scaling a stalled rollout down keeps ≥ N − maxUnavailable Ready and ≤ N + maxSurge Pods at every tick', () => {
    const s = stall()
    kubectlScale(s, 6)
    step(s, 0.1)
    assert.equal(sizes(s), '1.4.0=6 2.0.l=3')
    for (let i = 0; i < 300; i++) {
      step(s, 0.1)
      const pods = podsView(s)
      assert.ok(pods.filter((p) => !p.terminating).length <= 6 + 3)
      assert.ok(pods.filter((p) => p.ready).length >= 6 - 2, `ready ≥ minAvailable at t=${s.t}`)
    }
    assert.equal(sizes(s), '1.4.0=4 2.0.l=5', 'same stall as a fresh N = 6 rollout')
  })

  test('paused Deployment scales proportionally too', () => {
    const s = stall()
    rolloutPause(s, true)
    kubectlScale(s, 15)
    step(s, 0.2)
    assert.equal(sizes(s), '1.4.0=11 2.0.l=7')
  })

  test('L22 path: replicas in Git + HPA + „Loš commit” – the HPA scale goes mostly to the working version', () => {
    const s = createGitOps({ ...PRESETS.l22Hpa, webhook: true })
    commitBadImage(s, 'typo')
    for (let i = 0; i < 1500; i++) {
      step(s, 0.1)
      const n = liveReplicas(s)
      const { surge } = fenceposts('25%', '25%', n)
      assert.ok(podsView(s).filter((p) => !p.terminating).length <= n + surge, `≤ N + maxSurge at t=${s.t}`)
    }
    const n = liveReplicas(s)
    const { unavailable } = fenceposts('25%', '25%', n)
    assert.ok(capacity(s).ready >= n - unavailable, `ready ${capacity(s).ready} ≥ ${n} − ${unavailable}`)
  })
})

describe('review fixes: HPA health and CPU requests (L24 fault deck „HPA bez requests.cpu”)', () => {
  test('removing requests.cpu through Git: the HPA stops scaling, HPA and app are Degraded with the real message', () => {
    const s = createGitOps(PRESETS.l24Full)
    assert.equal(objectHealth(s, 'HorizontalPodAutoscaler/klopa-api').status, 'Healthy')
    assert.ok(commitField(s, FILES.deployment, PATHS.cpuRequest, null).ok)
    setHpaDemand(s, 8)
    advance(s, 40)
    assert.equal(liveReplicas(s), 4, 'no scaling without a CPU request')
    const h = objectHealth(s, 'HorizontalPodAutoscaler/klopa-api')
    assert.equal(h.status, 'Degraded')
    assert.match(h.message, /^the HPA was unable to compute the replica count: failed to get cpu utilization: missing request for cpu in container klopa-api of Pod klopa-api-/)
    assert.equal(appView(s).sync, 'Synced')
    assert.equal(appView(s).health, 'Degraded')
    assert.ok(argocdAppGet(s).some((l) => l.includes('HorizontalPodAutoscaler') && l.includes('Degraded')))
    assert.ok(kubectlGetEvents(s).some((l) => l.includes('FailedGetResourceMetric')))
    assert.equal(hpaView(s)?.conditions.find((c) => c.type === 'ScalingActive')?.reason, 'FailedGetResourceMetric')
    // the fix is a commit: the request is back, the HPA scales again and turns Healthy
    revertLastChange(s)
    assert.ok(until(s, (x) => liveReplicas(x) === 8, 40) !== null)
    assert.equal(objectHealth(s, 'HorizontalPodAutoscaler/klopa-api').status, 'Healthy')
  })

  test('a new HPA is Progressing „Waiting to Autoscale” until its first evaluation; a missing target is FailedGetScale', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, webhook: true })
    addHpaToGit(s)
    assert.ok(until(s, (x) => Boolean(x.cluster.objects['HorizontalPodAutoscaler/klopa-api']), 5) !== null)
    assert.deepEqual(objectHealth(s, 'HorizontalPodAutoscaler/klopa-api'), { status: 'Progressing', message: 'Waiting to Autoscale' })
    assert.ok(until(s, (x) => objectHealth(x, 'HorizontalPodAutoscaler/klopa-api').status === 'Healthy', 16) !== null)
    const d = createGitOps({ ...PRESETS.l22Hpa, policy: { automated: true } })
    kubectlDelete(d, 'Deployment', 'klopa-api')
    advance(d, 16)
    assert.equal(objectHealth(d, 'HorizontalPodAutoscaler/klopa-api').status, 'Degraded')
    assert.match(objectHealth(d, 'HorizontalPodAutoscaler/klopa-api').message, /unable to get the target's current scale: deployments\/scale\.apps "klopa-api" not found/)
  })

  test('hpaHealth follows gitops-engine health_hpa.go', () => {
    assert.deepEqual(hpaHealth([]), { status: 'Progressing', message: 'Waiting to Autoscale' })
    assert.equal(hpaHealth([{ type: 'AbleToScale', status: 'True', reason: 'SucceededRescale', message: 'ok' }, { type: 'ScalingActive', status: 'False', reason: 'FailedGetResourceMetric', message: 'x' }]).status, 'Degraded')
    assert.equal(hpaHealth([{ type: 'AbleToScale', status: 'False', reason: 'BackoffBoth', message: '' }, { type: 'ScalingLimited', status: 'True', reason: 'TooManyReplicas', message: 'max' }]).message, 'max')
  })
})

describe('review fixes: API-server validation', () => {
  function lastFailure(field: string, value: FieldValue | null) {
    const s = createGitOps({ ...PRESETS.l22Auto, webhook: true, policy: { automated: true, retry: RETRY_PRESETS.none } })
    assert.ok(commitField(s, FILES.deployment, field, value).ok)
    advance(s, 3)
    return { s, phase: s.argo.lastOperation?.phase, msg: s.argo.lastOperation?.results.find((r) => r.result === 'SyncFailed')?.message ?? '' }
  }
  test('maxSurge 0 + maxUnavailable 0, non-percent strings, > 100 % unavailable and negative replicas are rejected in the dry run', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, webhook: true, policy: { automated: true, retry: RETRY_PRESETS.none } })
    commitField(s, FILES.deployment, PATHS.maxSurge, 0)
    advance(s, 3)
    assert.equal(s.argo.lastOperation?.phase, 'Succeeded', 'surge 0 alone is fine')
    commitField(s, FILES.deployment, PATHS.maxUnavailable, 0)
    advance(s, 3)
    assert.equal(s.argo.lastOperation?.phase, 'Failed')
    assert.equal(s.argo.lastOperation?.results.find((r) => r.result === 'SyncFailed')?.message, 'Deployment.apps "klopa-api" is invalid: spec.strategy.rollingUpdate.maxUnavailable: Invalid value: 0: may not be 0 when `maxSurge` is 0')
    assert.match(lastFailure(PATHS.maxSurge, 'abc').msg, /maxSurge: Invalid value: "abc": a valid percent string must be a numeric string followed by an ending '%'/)
    assert.match(lastFailure(PATHS.maxUnavailable, '150%').msg, /must not be greater than 100%/)
    assert.equal(lastFailure(PATHS.replicas, -3).msg, 'Deployment.apps "klopa-api" is invalid: spec.replicas: Invalid value: -3: must be greater than or equal to 0')
    assert.equal(lastFailure(PATHS.maxSurge, '0%').phase, 'Succeeded')
  })

  test('kubectl scale/edit go through validation; invalid image references are not committed', () => {
    const s = createGitOps(PRESETS.l22Auto)
    assert.equal(kubectlScale(s, -3), false)
    assert.equal(kubectlScale(s, 2.5), false)
    assert.equal(liveReplicas(s), 4)
    assert.equal(kubectlEdit(s, 'Deployment', 'klopa-api', PATHS.image, ''), false)
    assert.equal(kubectlEdit(s, 'Deployment', 'klopa-api', PATHS.maxSurge, 'pola'), false)
    assert.equal(s.stats.kubectlChanges, 0)
    for (const bad of ['', ' 2.0.1', '2.0 1', 'registry.klopa.example/klopa-api:', 'Registry/X:1']) assert.equal(commitImage(s, bad).ok, false, bad)
    assert.ok(commitImage(s, `${KLOPA.registry}:2.0.1`).ok)
    assert.equal(startCiRelease(s, 'a b'), null)
  })

  test('a CI rebuild of 2.0.0 keeps its 20 % VAT bug for E3 (bugRate), unless given', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, webhook: true })
    startCiRelease(s, '2.0.0')
    advance(s, 12)
    assert.equal(s.registry[`${KLOPA.registry}:2.0.0`].bugRate, 0.2)
    assert.equal(deploymentSpec(s, 'klopa-api')?.bugRate, 0.2)
    startCiRelease(s, '2.0.0', 'ok', 0)
    advance(s, 12)
    assert.equal(s.registry[`${KLOPA.registry}:2.0.0`].bugRate, 0)
  })
})

describe('review fixes: L22 goals', () => {
  test('driftReverted needs a reverted kubectl change; a deleted Deployment restored by selfHeal counts', () => {
    const hpa = createGitOps(PRESETS.l22Hpa)
    advance(hpa, 40)
    assert.ok(hpa.stats.driftsReverted > 0)
    assert.equal(l22Goals(hpa).driftReverted, false)
    const s = createGitOps({ ...PRESETS.l22Auto, policy: { automated: true, selfHeal: true } })
    advance(s, 3)
    kubectlDelete(s, 'Deployment', 'klopa-api')
    advance(s, 15)
    assert.equal(s.stats.kubectlDriftsReverted, 1)
    assert.equal(l22Goals(s).driftReverted, true)
  })

  test('hpaPeace: both ways of removing replicas complete it; the migration-less drop is narrated, not a fight', () => {
    for (const migrate of [true, false]) {
      const s = createGitOps({ ...PRESETS.l22Hpa, webhook: true })
      advance(s, 40)
      const fights = s.stats.replicaFights
      assert.ok(fights >= 2)
      removeReplicasFromGit(s, migrate)
      advance(s, 25)
      assert.equal(l22Goals(s).hpaPeace, true, `migrate=${migrate}`)
      assert.equal(s.stats.replicaFights, fights, 'the one-time drop is not counted as a fight')
      assert.equal(s.stats.replicaDrops, migrate ? 0 : 1)
      assert.equal(s.events.some((e) => e.text.startsWith('spec.replicas uklonjen iz Gita → vrijedi zadano 1')), !migrate)
      // and it survives the next commit
      commitImage(s, '2.0.1')
      advance(s, 60)
      assert.equal(s.stats.replicaFights, fights)
      assert.equal(l22Goals(s).hpaPeace, true)
    }
  })

  test('hpaPeace with ignoreDifferences needs RespectIgnoreDifferences AND a commit after the fix', () => {
    const s = createGitOps(PRESETS.l22Hpa)
    advance(s, 40)
    setIgnoreReplicas(s, true)
    setRespectIgnoreDifferences(s, true)
    advance(s, 40)
    assert.equal(l22Goals(s).hpaPeace, false, 'not yet shown to survive a commit')
    commitImage(s, '2.0.1')
    advance(s, 60)
    assert.equal(l22Goals(s).hpaPeace, true)
    setRespectIgnoreDifferences(s, false)
    assert.equal(l22Goals(s).hpaPeace, false)
    assert.equal(s.stats.hpaIgnoreFixAt, null)
  })
})

describe('review fixes: delivery view and auto-sync narration', () => {
  test('a commit that becomes Synced without a sync operation is shown deployed', () => {
    const a = createGitOps({ ...PRESETS.l22Auto, webhook: true })
    commitInvalidManifest(a)
    advance(a, 170)
    revertLastChange(a)
    advance(a, 30)
    assert.equal(appView(a).sync, 'Synced')
    assert.equal(deliveryView(a)[0].hop, 'done')
    const b = createGitOps(PRESETS.l22)
    kubectlScale(b, 6)
    const c = commitReplicas(b, 6)
    refreshApp(b)
    advance(b, 15)
    assert.equal(appView(b).sync, 'Synced')
    assert.ok(c.ok && deliveryView(b)[0].id === c.sha)
    assert.equal(deliveryView(b)[0].hop, 'done')
    assert.ok(commitGraph(b)[0].isDeployed)
  })

  test('after a history rollback HEAD is not deployed any more', () => {
    const s = createGitOps()
    commitImage(s, '2.0.1')
    syncApp(s)
    advance(s, 40)
    assert.equal(deliveryView(s)[0].hop, 'done')
    argoRollback(s, 0)
    advance(s, 40)
    assert.equal(deliveryView(s)[0].hop, 'sync')
    assert.match(deliveryView(s)[0].text, /ručnu sinkronizaciju/)
  })

  test('a fix waiting behind a retrying operation is „queued” and auto-sync explains why', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, webhook: true })
    const bad = commitInvalidManifest(s)
    advance(s, 8)
    const fix = commitReplicas(s, 5)
    advance(s, 3)
    assert.ok(bad.ok && fix.ok)
    const [head, old] = deliveryView(s, 2)
    assert.equal(head.hop, 'queued')
    assert.equal(head.blockedBy?.revision, bad.sha)
    assert.ok((head.blockedBy?.retryCount ?? 0) >= 1)
    assert.equal(old.hop, 'sync')
    assert.match(appView(s).autoSyncNote, new RegExp(`^Novi commit ${fix.sha.slice(0, 7)} čeka: operacija za ${bad.sha.slice(0, 7)} se ponavlja \\(pokušaj #\\d, sljedeći za .+\\)\\. „Prekini” je zaustavlja\\.$`))
    terminateSync(s)
    assert.ok(until(s, (x) => liveReplicas(x) === 5, 5) !== null)
  })
})

describe('review fixes: commit journey, compressed-time labels', () => {
  test('commitTimeline stamps every station in order; CI (×60) and polling (×10) are labelled as compressed', () => {
    const s = createGitOps(PRESETS.l24)
    startCiRelease(s, '2.0.2')
    advance(s, 60)
    const tl = commitTimeline(s)
    assert.deepEqual(tl.map((x) => x.station), ['ci', 'commit', 'seen', 'outOfSync', 'syncStarted', 'applied', 'rsCreated', 'firstScheduled', 'imagePulled', 'firstReady', 'allReady', 'healthy'])
    for (let i = 1; i < tl.length; i++) assert.ok(tl[i].t >= tl[i - 1].t)
    assert.equal(tl[1].simS, 10)
    assert.equal(tl[1].realS, 600, 'CI 10 s sim ↔ ~10 min real')
    assert.match(tl.at(-1)!.text, /^35 s \(sim\) · stvarno ≈ 625 s$/)
    assert.equal(commitLatency(s)?.compressed, false, 'webhook: real time from the commit on')
    const p = createGitOps(PRESETS.l22)
    commitImage(p, '2.0.1')
    advance(p, 20)
    const lat = commitLatency(p)
    assert.ok(lat && lat.seen !== null && lat.realS.seen !== null && lat.compressed)
    assert.ok(Math.abs(lat.realS.seen - lat.seen * 10) < 0.11)
    assert.ok(p.events.some((e) => /\(redovita provjera Gita\), \d+,\d s \(sim\) · stvarno ≈ \d+(,\d)? s nakon commita\./.test(e.text)))
    assert.equal(commitTimeline(p, 'deadbeef').length, 0)
  })
})

describe('review fixes: L24 config repo, both directions of the E3 contract', () => {
  test('l24Full: whole Klopa as one Application; commitChanges = one revision; drainLiveChanges hands applied fields over', () => {
    const s = createGitOps(PRESETS.l24Full)
    assert.equal(appView(s).sync, 'Synced')
    assert.equal(appView(s).health, 'Healthy')
    assert.equal(s.argo.resources.length, 11)
    assert.deepEqual(drainLiveChanges(s), [], 'the initial state is not a change')
    const before = s.repo.commits.length
    const r = commitChanges(s, [{ path: FILES.httpRoute, set: { [PATHS.routePathType(2)]: 'PathPrefix', [PATHS.routePath(2)]: '/narudzbe', [PATHS.routeBackend(2)]: 'klopa-api', [PATHS.routeBackendPort(2)]: 80 } }], { message: 'HTTPRoute: /narudzbe' })
    assert.ok(r.ok)
    assert.equal(s.repo.commits.length, before + 1, 'one revision for a 4-field fix')
    advance(s, 5)
    assert.equal(s.argo.history.filter((h) => h.revision === r.sha).length, 1)
    const applied = drainLiveChanges(s, { by: ['argocd'] })
    assert.deepEqual(applied.map((c) => `${c.kind}/${c.name}${c.path}=${String(c.after)}`).sort(), [
      'HTTPRoute/klopa/spec/rules/2/backendRefs/0/name=klopa-api',
      'HTTPRoute/klopa/spec/rules/2/backendRefs/0/port=80',
      'HTTPRoute/klopa/spec/rules/2/matches/0/path/type=PathPrefix',
      'HTTPRoute/klopa/spec/rules/2/matches/0/path/value=/narudzbe',
    ])
    assert.deepEqual(drainLiveChanges(s, { by: ['argocd'] }), [], 'drained')
    assert.equal(commitChanges(s, []).ok, false)
    assert.equal(commitChanges(s, [{ path: 'apps/nema.yaml', set: { '/spec/x': 1 } }]).ok, false)
  })

  test('reportExternalChange: an edit in E3`s console is drift that selfHeal reverts; delete with path ""', () => {
    const s = createGitOps(PRESETS.l24Full)
    advance(s, 2)
    assert.ok(reportExternalChange(s, 'Service', 'klopa-api', PATHS.serviceSelector, 'klopa-apl'))
    assert.equal(s.stats.kubectlChanges, 1)
    assert.ok(until(s, (x) => x.cluster.objects['Service/klopa-api'].fields[PATHS.serviceSelector] === 'klopa-api', 5) !== null)
    advance(s, 1)
    assert.equal(s.stats.kubectlDriftsReverted, 1)
    const back = drainLiveChanges(s, { by: ['argocd'] })
    assert.ok(back.some((c) => c.kind === 'Service' && c.path === PATHS.serviceSelector && c.after === 'klopa-api'), 'the revert flows back to E3')
    assert.equal(drainLiveChanges(s, { by: ['kubectl'] }).length, 1)
    assert.ok(reportExternalChange(s, 'HTTPRoute', 'klopa', '', null))
    assert.ok(until(s, (x) => Boolean(x.cluster.objects['HTTPRoute/klopa']), 5) !== null)
    assert.equal(reportExternalChange(s, 'HTTPRoute', 'klopa', '', 'x'), false, 'creating needs a manifest')
    assert.equal(reportExternalChange(s, 'Service', 'ne-postoji', PATHS.servicePort, 81), false)
  })

  test('external Pods feed every Pod view; setHpaDesired writes exactly what E3 decided', () => {
    const s = createGitOps({ ...PRESETS.l22Hpa, webhook: true })
    setExternalWorkload(s, 'klopa-api', true)
    const spec = deploymentSpec(s, 'klopa-api')
    assert.ok(spec)
    const pods = Array.from({ length: 4 }, (_, i) => ({ id: `klopa-api-e3-${i}`, status: i === 3 ? 'ContainerCreating' : 'Running', ready: i < 3, tag: '1.4.0', current: true }))
    setExternalWorkloadStatus(s, 'klopa-api', { replicas: 4, updatedReplicas: 4, readyReplicas: 3, availableReplicas: 3, observedTemplateHash: spec.templateHash, pods })
    assert.equal(podsView(s).length, 4)
    assert.deepEqual(capacity(s), { ready: 3, desired: 4, ratio: 0.75, endpoints: 3 })
    assert.equal(kubectlGetPods(s).filter((l) => l.startsWith('klopa-api-e3-')).length, 4)
    assert.equal(resourceTree(s).filter((n) => n.kind === 'Pod' && n.parentId === 'Deployment/klopa-api').length, 4)
    assert.equal(podsView(s)[3].kitStatus, 'creating')
    assert.ok(setHpaDesired(s, 'klopa-api', 7))
    assert.equal(liveReplicas(s), 7)
    advance(s, 60)
    assert.ok(s.cluster.replicaWrites.every((w) => w.by !== 'hpa' || w.to === 7), 'E6`s own HPA maths is off')
    assert.equal(setHpaDesired(s, 'klopa-api', -1), false)
  })

  test('E3 + E6 side by side through the README glue loop: Progressing → Healthy, never a stale Healthy', () => {
    const git = createGitOps({ ...PRESETS.l22Auto, webhook: true })
    const k8s = E3.presetRollout({ version: '1.4.0', traffic: false })
    setExternalWorkload(git, 'klopa-api', true)
    let pushed = deploymentSpec(git, 'klopa-api')!.templateHash
    let observed = pushed
    let pushedAtTick = -1
    const frame = (dt: number) => {
      step(git, dt)
      const spec = deploymentSpec(git, 'klopa-api')!
      if (spec.templateHash !== pushed) {
        E3.setDeploymentVersion(k8s, 'klopa-api', spec.tag as E3.KlopaApiVersion)
        pushed = spec.templateHash
        pushedAtTick = k8s.tick
      }
      const d = E3.findDeployment(k8s, 'klopa-api')!
      if (spec.effectiveReplicas !== d.replicas) E3.scaleDeployment(k8s, 'klopa-api', spec.effectiveReplicas)
      E3.stepCluster(k8s, dt)
      if (k8s.tick > pushedAtTick) observed = pushed // E3 has run its controllers on the pushed template
      const st = d.status
      setExternalWorkloadStatus(git, 'klopa-api', {
        replicas: st.replicas,
        updatedReplicas: st.updatedReplicas,
        readyReplicas: st.readyReplicas,
        availableReplicas: st.availableReplicas,
        terminatingReplicas: st.terminatingReplicas,
        observedTemplateHash: observed,
        progressDeadlineExceeded: d.conditions.progressing.reason === 'ProgressDeadlineExceeded',
        pods: k8s.pods.filter((p) => p.labels.app === 'klopa-api').map((p) => ({ id: p.name, status: E3.podStatus(p), ready: E3.isReady(p), tag: p.spec.image.split(':').pop() ?? '', restarts: p.container.restartCount, ageS: k8s.t - p.createdAt, terminating: p.deletion !== null })),
      })
    }
    for (let i = 0; i < 60; i++) frame(1 / 60)
    assert.equal(appView(git).health, 'Healthy')
    assert.equal(capacity(git).ready, 4)
    const r = commitImage(git, '2.0.1')
    assert.ok(r.ok)
    let progressing = false
    let healthyAt: number | null = null
    for (let i = 0; i < 60 * 60 && healthyAt === null; i++) {
      frame(1 / 60)
      if (git.argo.lastOperation?.revision !== r.sha) continue
      const d = E3.findDeployment(k8s, 'klopa-api')!
      const e3Done = E3.deploymentComplete(d, d.status) && d.template.image.endsWith(':2.0.1')
      if (appView(git).health === 'Progressing') progressing = true
      if (appView(git).health === 'Healthy') {
        assert.ok(e3Done, `Healthy only when E3 finished the rollout (t=${git.t})`)
        healthyAt = git.t
      }
    }
    assert.ok(progressing && healthyAt !== null && healthyAt < 40, `healthy at ${healthyAt}`)
    assert.deepEqual(podsView(git).filter((p) => p.ready).map((p) => p.tag), ['2.0.1', '2.0.1', '2.0.1', '2.0.1'])
    assert.equal(l22Goals(git).shipped, true)
  })
})

describe('review fixes: CLI output and Pod stages', () => {
  test('kubectl get events / describe pod / rollout status and argocd app diff use the real formats', () => {
    const s = createGitOps(PRESETS.l22)
    assert.deepEqual(argocdAppDiff(s), [], 'no differences → no output')
    assert.deepEqual(kubectlRolloutStatus(s), ['deployment "klopa-api" successfully rolled out'])
    commitBadImage(s, 'typo')
    refreshApp(s)
    advance(s, 1)
    const diff = argocdAppDiff(s)
    assert.equal(diff[0], '===== apps/Deployment klopa/klopa-api ======')
    assert.ok(diff.includes('< spec.template.spec.containers[0].image: registry.klopa.example/klopa-api:1.4.0'))
    assert.ok(diff.includes('> spec.template.spec.containers[0].image: registry.klopa.example/klopa-api:2.0.l'))
    syncApp(s)
    advance(s, 30)
    assert.deepEqual(kubectlRolloutStatus(s), ['Waiting for deployment "klopa-api" rollout to finish: 2 out of 4 new replicas have been updated...'])
    const ev = kubectlGetEvents(s)
    assert.match(ev[0], /^LAST SEEN\s+TYPE\s+REASON\s+OBJECT\s+MESSAGE$/)
    assert.ok(ev.some((l) => /\(x\d+ over \d+s\)\s+Normal\s+BackOff\s+pod\/klopa-api-/.test(l)))
    const bad = podsView(s).find((p) => p.status === 'ImagePullBackOff')
    assert.ok(bad)
    const desc = kubectlDescribePod(s, bad.id).join('\n')
    assert.match(desc, /Status:\s+Pending/)
    assert.match(desc, /Reason:\s+ImagePullBackOff/)
    assert.match(desc, /SMS_API_KLJUC|POPUST_CEVAP_PETAK/)
    assert.match(desc, /Warning\s+Failed\s+\S+\s+kubelet\s+Error: ErrImagePull/)
    assert.deepEqual(kubectlDescribePod(s, 'nema'), ['Error from server (NotFound): pods "nema" not found'])
    advance(s, 60)
    assert.deepEqual(kubectlRolloutStatus(s), ['error: deployment "klopa-api" exceeded its progress deadline'])
    kubectlDelete(s, 'Deployment', 'klopa-api')
    assert.match(kubectlRolloutStatus(s)[0], /NotFound/)
  })

  test('PodView stages animate the way to Ready: scheduling → pulling → starting → probing → ready', () => {
    const s = createGitOps({ ...PRESETS.l22Auto, webhook: true })
    commitImage(s, '2.0.1')
    const seen: string[] = []
    let id: string | null = null
    for (let i = 0; i < 300; i++) {
      step(s, 0.1)
      const p: PodView | undefined = id ? podsView(s).find((x) => x.id === id) : podsView(s).find((x) => x.tag === '2.0.1')
      if (!p) continue
      id = p.id
      assert.ok(p.stageProgress >= 0 && p.stageProgress <= 1)
      if (seen.at(-1) !== p.stage) seen.push(p.stage)
      if (p.stage === 'ready') break
    }
    // readiness probes run every 2 s from container start; the 6 s app start ends exactly on a probe → straight to ready
    assert.deepEqual(seen, ['scheduling', 'pulling', 'starting', 'ready'])
    assert.equal(podsView(s).find((x) => x.id === id)?.pulledFromCache, false, 'a brand-new image is pulled')
    // a build whose readiness never passes stays in „probing”
    const n = createGitOps({ ...PRESETS.l22Auto, webhook: true })
    addImage(n, '2.0.9', 'notReady')
    commitImage(n, '2.0.9')
    advance(n, 20)
    const probing = podsView(n).find((x) => x.tag === '2.0.9')
    assert.equal(probing?.stage, 'probing')
    assert.equal(probing?.kitStatus, 'notready')
  })

  test('manifestToYaml and repoFiles render the config repo', () => {
    const s = createGitOps(PRESETS.l22Waves)
    const yaml = manifestToYaml(s.repo.commits.at(-1)!.files[FILES.migration])
    assert.match(yaml, /^apiVersion: batch\/v1\nkind: Job\nmetadata:\n {2}name: klopa-migracija\n {2}namespace: klopa\n {2}annotations:\n {4}argocd.argoproj.io\/hook: Sync\n {4}argocd.argoproj.io\/sync-wave: "-1"\n/)
    const dep = manifestToYaml(s.repo.commits.at(-1)!.files[FILES.deployment])
    assert.match(dep, /\n {6}containers:\n {6}- name: klopa-api\n {8}image: registry\.klopa\.example\/klopa-api:1\.4\.0\n/)
    assert.match(dep, /- name: POPUST_CEVAP_PETAK\n {10}value: "20"/)
    assert.match(dep, /maxSurge: 25%/)
    const r = deleteFileFromGit(s)
    assert.ok(r.ok)
    const files = repoFiles(s)
    assert.equal(files.find((f) => f.path === FILES.promo)?.change, 'removed')
    assert.ok(files.every((f) => f.inAppPath))
  })
})

describe('review fixes: selectors are pure, everything is exported', () => {
  const SELECTORS: [string, (s: GitOpsState) => unknown][] = [
    ['appView', appView],
    ['pollRing', pollRing],
    ['diffView', diffView],
    ['resourceTree', resourceTree],
    ['commitGraph', (s) => commitGraph(s)],
    ['commitLatency', (s) => commitLatency(s)],
    ['commitTimeline', (s) => commitTimeline(s)],
    ['deliveryView', (s) => deliveryView(s)],
    ['deployHistory', deployHistory],
    ['deployedRevision', deployedRevision],
    ['gitMatchesCluster', gitMatchesCluster],
    ['repoFiles', (s) => repoFiles(s)],
    ['podsView', (s) => podsView(s)],
    ['capacity', (s) => capacity(s)],
    ['liveImageTag', (s) => liveImageTag(s)],
    ['replicaFight', replicaFight],
    ['hpaView', (s) => hpaView(s)],
    ['l22Goals', (s) => l22Goals(s)],
    ['deployPaths', deployPaths],
    ['integrityStatus', integrityStatus],
    ['gitLeaks', gitLeaks],
    ['argoCacheView', argoCacheView],
    ['secretView', secretView],
    ['kubectlGetPods', kubectlGetPods],
    ['kubectlGetEvents', (s) => kubectlGetEvents(s)],
    ['kubectlRolloutStatus', (s) => kubectlRolloutStatus(s)],
    ['kubectlDescribePod', (s) => kubectlDescribePod(s, s.cluster.pods[0]?.id ?? 'x')],
    ['argocdAppGet', argocdAppGet],
    ['argocdAppDiff', argocdAppDiff],
    ['deploymentSpec', (s) => deploymentSpec(s, 'klopa-api')],
  ]
  const snapshot = (s: GitOpsState) => JSON.stringify(s)
  for (const [name, cfg] of [
    ['l22 + commit', { ...PRESETS.l22 }],
    ['push + plain Secret', { ...PRESETS.l22Push, secrets: 'plain' as const }],
    ['l23 avp', { ...PRESETS.l23, secrets: 'avp' as const }],
    ['l24Full', PRESETS.l24Full],
  ] as const) {
    test(`no selector changes the state (${name})`, () => {
      const s = createGitOps(cfg)
      commitImage(s, '2.0.1')
      commitPlainSecret(s, 'sms-kljuc-v1')
      advance(s, 3)
      rotateSecret(s)
      const before = snapshot(s)
      for (const [sel, fn] of SELECTORS) {
        fn(s)
        assert.equal(snapshot(s), before, `${sel} mutated the state`)
      }
    })
  }

  test('the E3-bridge and L24 functions are part of the public API', () => {
    for (const fn of [reportExternalSpec, reportExternalChange, drainLiveChanges, setHpaDesired, externalPods, controllerStatusOf, commitChanges, setSecretsApproach, renewSopsKey, manifestToYaml, repoFiles, commitTimeline]) assert.equal(typeof fn, 'function')
    assert.deepEqual(Object.keys(RETRY_LABELS).sort(), Object.keys(RETRY_PRESETS).sort())
    assert.match(RETRY_LABELS.notSet, /5×/)
    const s = createGitOps(PRESETS.l22Auto)
    assert.equal(retryPresetOf(s), 'notSet', 'the default is „not set” – automated syncs still retry 5×, so not „off”')
    setRetry(s, RETRY_PRESETS.none)
    assert.equal(retryPresetOf(s), 'none')
    setRetry(s, { limit: 3, refresh: true })
    assert.equal(retryPresetOf(s), null)
  })

  test('rebuildCluster with manual sync: empty until „Sinkroniziraj” – or synced at once with bootstrapSync', () => {
    const m = createGitOps(PRESETS.l22)
    rebuildCluster(m)
    advance(m, 20)
    assert.equal(appView(m).health, 'Missing', 'nothing from Git is live')
    assert.equal(capacity(m).ready, 0)
    const b = createGitOps(PRESETS.l22)
    rebuildCluster(b, { bootstrapSync: true })
    assert.ok(until(b, (x) => capacity(x).ready === 4 && appView(x).health === 'Healthy', 30) !== null)
  })
})
