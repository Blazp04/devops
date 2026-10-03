/// <reference types="node" />
/**
 * E5 „Tko vidi?” – tests. Run: node --test src/engines/access/*.test.ts
 * Reproduces the L16/L23 flagshipSimulation.model rules and the validated numbers in README.md.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACTORS,
  ACTOR_ORDER,
  APPROACHES,
  L16_ACTORS,
  L16_APPROACHES,
  L23_APPROACHES,
  MAX_EVENTS,
  PROVIDERS,
  ROLES,
  SECRET_MAX_BYTES,
  SECRET_TYPES,
  SERIES_LEN,
  ROTATION_GOAL_REAL_S,
  SEALED_SCOPES,
  TIMING,
  achievedAt,
  actorLabel,
  applySecretManually,
  argoSyncNow,
  attemptOptions,
  compareApproaches,
  consumeLocked,
  effectiveConsumeOf,
  encryptionScopeInfo,
  exposure,
  l16Goals,
  l23Goals,
  podView,
  rings,
  roleLabel,
  rotationEstimate,
  setActorRules,
  setAnimationScale,
  setArgoAutoSync,
  setFocus,
  setServiceAccountRules,
  storeOutageStatus,
  tokenSegment,
  tryVerb,
  versionInGit,
  assetsOf,
  argoHardRefresh,
  attempt,
  attemptAll,
  authFailingPods,
  can,
  commitPlainSecret,
  createAccess,
  createAccessPreset,
  deleteLeakedCommit,
  evaluateAccess,
  evaluateAll,
  explainVerdict,
  eyeSummary,
  forceEsoSync,
  fromBase64,
  gitExposesValidValue,
  gitLog,
  leakControllerKey,
  leakEnvToLog,
  leakToCiLog,
  loseControllerKey,
  memberLeaves,
  plaintextAssets,
  podSummary,
  rebuildCluster,
  redActors,
  reencryptSealed,
  renewSealingKey,
  resealAll,
  resolveConfig,
  restartPods,
  revokeOld,
  rotateSecret,
  rotationStatus,
  secretValue,
  setActorRoles,
  setApproach,
  setAppRereads,
  setConsume,
  setCsiRotation,
  setCsiSync,
  setEncryption,
  setEsoRefreshInterval,
  setLaptop,
  setLeastPrivilege,
  setReplicas,
  setStoreAvailable,
  setVisibleActors,
  staleConsumers,
  stealControlPlaneDisk,
  stealEtcdBackup,
  step,
  timingLabel,
  toBase64,
  verdictOf,
} from './index.ts'
import type { AccessState, ActorId, Approach } from './index.ts'

const sorted = (xs: readonly string[]) => [...xs].sort()
const red = (s: AccessState, id?: string) => sorted(redActors(s, id))
const podStates = (s: AccessState) => s.pods.map((p) => `${p.id}:${p.status}${p.reason ? `/${p.reason}` : ''}`)

/** Settle t and rotate the focused (or given) secret; returns the time of rotation. */
function rotateAt(s: AccessState, at: number, id?: string) {
  step(s, at - s.t)
  assert.equal(rotateSecret(s, id), true)
  return s.t
}

/* ====================================================================== */

describe('base64 is an encoding, not encryption', () => {
  it('encodes the L16 example and decodes without any key', () => {
    assert.equal(toBase64('klopa_db'), 'a2xvcGFfZGI=')
    assert.equal(fromBase64('a2xvcGFfZGI='), 'klopa_db')
  })
  it('round-trips UTF-8 and padding lengths', () => {
    for (const v of ['', 'a', 'ab', 'abc', 'lozinka-čćžšđ', 'sms-7f3a9c2e']) assert.equal(fromBase64(toBase64(v)), v)
  })
  it('rejects invalid input', () => {
    assert.equal(fromBase64('abc'), null)
    assert.equal(fromBase64('a$==' ), null)
    assert.equal(fromBase64('=abc'), null)
  })
})

describe('constants: compressed time is labelled with the real default', () => {
  it('exports sim and real values', () => {
    assert.equal(TIMING.kubeletSync.sim, 10)
    assert.equal(TIMING.kubeletSync.real, 90) // syncFrequency 1 min × jitter [1, 1,5) – same as E6 volumeSync
    assert.equal(TIMING.kubeletSync.ratio, 9)
    assert.equal(TIMING.esoRefresh.sim, 30)
    assert.equal(TIMING.esoRefresh.real, 3600)
    assert.equal(TIMING.esoRefresh.inManifest, true) // refreshInterval: 30s in the YAML, not compressed
    assert.equal(TIMING.esoRefresh.ratio, 1)
    assert.equal(TIMING.argoPoll.ratio, 10)
    assert.equal(TIMING.csiRotationPoll.ratio, 6)
    assert.equal(TIMING.argoCacheExpiry.real, 24 * 3600)
    assert.equal(TIMING.argoPoll.real, 120)
    assert.equal(TIMING.argoJitter.real, 60)
    assert.equal(TIMING.argoPoll.sim * 10, TIMING.argoPoll.real) // same ÷10 compression as E6
    assert.equal(TIMING.csiRotationPoll.real, 120)
    assert.equal(TIMING.sealedKeyRenewal.real, 30 * 24 * 3600)
  })
  it('formats the badge with a decimal comma', () => {
    assert.equal(timingLabel(TIMING.kubeletSync), '10 s (sim) · stvarno: s odgodom sinkronizacije kubeleta (do oko minute i pol)')
    assert.equal(timingLabel(TIMING.attemptHop), '0,6 s (sim) · samo animacija')
    assert.equal(TIMING.argoCacheExpiry.label, '12 min (sim) · stvarno: 24 h (--repo-cache-expiration)')
    assert.equal(timingLabel(TIMING.esoRefresh, 3600), '1 h (u YAML-u) · zadano: 1 h')
  })
  it('ranks providers like the Kubernetes docs', () => {
    assert.equal(PROVIDERS['kms-v2'].recommended, true)
    for (const p of ['aescbc', 'aesgcm', 'secretbox'] as const) assert.equal(PROVIDERS[p].keyLocation, 'control-plane-file')
    assert.equal(PROVIDERS.aescbc.recommended, false)
    assert.match(PROVIDERS.aescbc.note, /padding oracle/)
    assert.equal(PROVIDERS.identity.keyLocation, 'none')
  })
  it('every actor and approach has Croatian metadata', () => {
    for (const a of ACTOR_ORDER) assert.ok(ACTORS[a].label.length > 3)
    for (const a of [...L16_APPROACHES, ...L23_APPROACHES]) assert.ok(APPROACHES[a].label.length > 2)
  })
})

describe('RBAC: built-in roles and can-i', () => {
  const s = createAccessPreset('l16')
  it('view reads Pods, Deployments, ConfigMaps and logs but not Secrets', () => {
    assert.equal(can(s, 'view-user', 'get', 'secrets'), false)
    assert.equal(can(s, 'view-user', 'list', 'secrets'), false)
    assert.equal(can(s, 'view-user', 'get', 'configmaps'), true)
    assert.equal(can(s, 'view-user', 'get', 'pods/log'), true)
    assert.equal(can(s, 'view-user', 'create', 'pods'), false)
  })
  it('edit reads Secrets, creates Pods and may exec', () => {
    assert.equal(can(s, 'developer', 'get', 'secrets'), true)
    assert.equal(can(s, 'developer', 'create', 'pods'), true)
    assert.equal(can(s, 'developer', 'create', 'pods/exec'), true)
  })
  it('deployer has no verbs on secrets but may create Deployments', () => {
    assert.equal(can(s, 'pod-creator', 'get', 'secrets'), false)
    assert.equal(can(s, 'pod-creator', 'create', 'deployments'), true)
    assert.equal(ROLES.deployer.rules.some((r) => r.resources.includes('secrets')), false)
  })
  it('least privilege swaps the developer to view; RBAC is additive', () => {
    const x = createAccessPreset('l16')
    setLeastPrivilege(x, true)
    assert.deepEqual(x.bindings.developer, ['view'])
    assert.equal(can(x, 'developer', 'get', 'secrets'), false)
    setActorRoles(x, 'developer', ['view', 'secret-lister'])
    assert.equal(can(x, 'developer', 'list', 'secrets'), true)
    assert.equal(can(x, 'developer', 'get', 'secrets'), false)
    setActorRoles(x, 'laptop-thief', ['edit']) // inherits the developer's kubeconfig – ignored
    assert.deepEqual(x.bindings['laptop-thief'], [])
  })
})

/* ====================================================================== */

describe('L16 „Put tajne”: who reads the DB password, per location', () => {
  const expected: Record<Approach, ActorId[]> = {
    image: ['git-reader', 'image-puller', 'developer', 'pod-creator', 'compromised-pod'],
    'manifest-env': ['git-reader', 'etcd-backup-thief', 'cp-disk-thief', 'view-user', 'developer', 'pod-creator', 'compromised-pod'],
    configmap: ['git-reader', 'etcd-backup-thief', 'cp-disk-thief', 'view-user', 'developer', 'pod-creator', 'compromised-pod'],
    secret: ['etcd-backup-thief', 'cp-disk-thief', 'developer', 'pod-creator', 'compromised-pod'],
  } as Record<Approach, ActorId[]>
  for (const ap of L16_APPROACHES) {
    it(`${ap}: ${expected[ap].length} red eyes`, () => {
      const s = createAccessPreset('l16')
      setApproach(s, 'db', ap)
      assert.deepEqual(red(s), sorted(expected[ap]))
      assert.equal(eyeSummary(s).red, expected[ap].length)
      assert.equal(eyeSummary(s).total, L16_ACTORS.length)
    })
  }

  it('protection ladder: Secret 5 → secretbox 4 → KMS v2 3 → least privilege 2 (honest limits)', () => {
    const s = createAccessPreset('l16')
    assert.equal(eyeSummary(s).red, 5)
    setEncryption(s, 'secretbox')
    assert.deepEqual(red(s), sorted(['cp-disk-thief', 'developer', 'pod-creator', 'compromised-pod']))
    const disk = verdictOf(s, 'cp-disk-thief')
    assert.equal(disk.paths[0].channel, 'disk')
    assert.equal(verdictOf(s, 'etcd-backup-thief').blocked[0].control, 'encryption-at-rest')
    setEncryption(s, 'kms-v2')
    assert.deepEqual(red(s), sorted(['developer', 'pod-creator', 'compromised-pod']))
    assert.equal(verdictOf(s, 'cp-disk-thief').blocked[0].control, 'kms')
    setLeastPrivilege(s, true)
    assert.deepEqual(red(s), sorted(['pod-creator', 'compromised-pod']))
    const e = eyeSummary(s)
    assert.equal(e.red, 2)
    assert.equal(e.honestLimit, 2)
  })

  it('aescbc and aesgcm are local-key providers too: the disk thief stays red', () => {
    for (const p of ['aescbc', 'aesgcm'] as const) {
      const s = createAccessPreset('l16')
      setEncryption(s, p)
      assert.equal(verdictOf(s, 'etcd-backup-thief').reads, false)
      assert.equal(verdictOf(s, 'cp-disk-thief').reads, true)
    }
  })

  it('the Pod-creator eye stays red regardless of get/list: it mounts the Secret', () => {
    const s = createAccessPreset('l16', { leastPrivilege: true, encryption: { provider: 'kms-v2' } })
    const v = verdictOf(s, 'pod-creator')
    assert.equal(v.reads, true)
    assert.equal(v.paths[0].channel, 'mount')
    assert.equal(v.honestLimit, true)
    assert.equal(can(s, 'pod-creator', 'get', 'secrets'), false)
    assert.match(v.paths[0].text, /ni get na secrets ni pods\/log nisu potrebni/) // the deployer role has neither
    assert.equal(can(s, 'pod-creator', 'get', 'pods/log'), false)
    // the denied verbs are listed one by one (403 each), next to the working mount
    assert.deepEqual(v.blocked.filter((b) => b.control === 'rbac').map((b) => b.channel), ['api-get', 'api-list', 'api-watch', 'exec'])
  })

  it('view reads ConfigMaps and env literals but not Secrets – the real ConfigMap/Secret difference', () => {
    const s = createAccessPreset('l16')
    assert.equal(verdictOf(s, 'view-user').reads, false)
    assert.equal(verdictOf(s, 'view-user').blocked[0].control, 'rbac')
    setApproach(s, 'db', 'configmap')
    assert.deepEqual(verdictOf(s, 'view-user').paths.map((p) => p.channel), ['api-get', 'api-list', 'api-watch'])
    setApproach(s, 'db', 'manifest-env')
    assert.equal(verdictOf(s, 'view-user').paths[0].channel, 'pod-spec')
  })

  it('list (or watch) alone reveals Secret contents', () => {
    const s = createAccessPreset('l16')
    setActorRoles(s, 'view-user', ['secret-lister'])
    const v = verdictOf(s, 'view-user')
    assert.equal(v.reads, true)
    assert.deepEqual(v.paths.map((p) => p.channel), ['api-list'])
    assert.match(v.paths[0].text, /cijele objekte/)
  })

  it('encryption scope: only listed resources are encrypted (ConfigMap / Deployment stay plaintext by default)', () => {
    const cm = createAccessPreset('l16', { encryption: { provider: 'kms-v2' } })
    setApproach(cm, 'db', 'configmap')
    assert.equal(verdictOf(cm, 'etcd-backup-thief').reads, true)
    setEncryption(cm, 'kms-v2', { scope: 'secrets+configmaps' })
    assert.equal(verdictOf(cm, 'etcd-backup-thief').reads, false)
    const dep = createAccessPreset('l16', { encryption: { provider: 'kms-v2', scope: 'secrets+configmaps' } })
    setApproach(dep, 'db', 'manifest-env')
    assert.equal(verdictOf(dep, 'etcd-backup-thief').reads, true)
    setEncryption(dep, 'kms-v2', { scope: 'all' })
    assert.equal(verdictOf(dep, 'etcd-backup-thief').reads, false)
  })

  it('enabling encryption without rewriting leaves existing Secrets in plaintext until the next write', () => {
    const s = createAccessPreset('l16')
    setEncryption(s, 'kms-v2', { rewrite: false })
    assert.equal(verdictOf(s, 'etcd-backup-thief').reads, true)
    rotateAt(s, 1)
    assert.equal(s.secrets[0].obj.storedProvider, 'kms-v2')
    assert.equal(verdictOf(s, 'etcd-backup-thief').reads, false)
  })

  it('encryption at rest never changes the Git, image or log eyes', () => {
    for (const ap of L16_APPROACHES) {
      const s = createAccessPreset('l16')
      setApproach(s, 'db', ap)
      leakEnvToLog(s)
      const before = (['git-reader', 'image-puller', 'log-reader'] as const).map((a) => verdictOf(s, a).reads)
      setEncryption(s, 'kms-v2', { scope: 'all' })
      assert.deepEqual((['git-reader', 'image-puller', 'log-reader'] as const).map((a) => verdictOf(s, a).reads), before)
    }
  })

  it('„Ispiši env u log”: env consumers leak to logs (and to anyone with pods/log, like view); volume does not', () => {
    const s = createAccessPreset('l16', { leastPrivilege: true })
    assert.equal(leakEnvToLog(s), 2)
    assert.equal(verdictOf(s, 'log-reader').reads, true)
    assert.equal(verdictOf(s, 'view-user').paths[0].channel, 'pod-log')
    const v = createAccessPreset('l16')
    setConsume(v, 'api', 'volume')
    assert.equal(leakEnvToLog(v), 0)
    assert.equal(verdictOf(v, 'log-reader').reads, false)
    assert.equal(v.events.at(-1)?.tone, 'ok')
  })

  it('„Spremi secret.yaml u Git”: base64 readable forever; deleting the commit does not help, rotation does', () => {
    const s = createAccessPreset('l16', { leastPrivilege: true, encryption: { provider: 'kms-v2' } })
    setConsume(s, 'api', 'volume')
    assert.equal(verdictOf(s, 'git-reader').reads, false)
    commitPlainSecret(s)
    const v = verdictOf(s, 'git-reader')
    assert.equal(v.reads, true)
    assert.equal(v.paths[0].evidence, 'DB_PASSWORD: a2xvcGFfZGI=')
    assert.equal(deleteLeakedCommit(s), 1)
    assert.equal(verdictOf(s, 'git-reader').reads, true)
    assert.match(verdictOf(s, 'git-reader').paths[0].text, /ostaje u svakom klonu/)
    rotateAt(s, 1)
    step(s, 15)
    assert.equal(rotationStatus(s).phase, 'done')
    const after = verdictOf(s, 'git-reader')
    assert.equal(after.reads, false)
    assert.equal(after.level, 'stale')
    assert.equal(after.blocked[0].control, 'rotation')
    assert.equal(gitLog(s)[0].readable, true)
    assert.equal(gitLog(s)[0].valid, false)
  })

  it('explorer mode keeps explicit leaks when switching location', () => {
    const s = createAccessPreset('l16')
    commitPlainSecret(s)
    setApproach(s, 'db', 'configmap')
    setApproach(s, 'db', 'secret')
    assert.equal(verdictOf(s, 'git-reader').reads, true)
    assert.equal(s.commits.filter((c) => c.secretId === 'db' && !c.leak && c.form === 'configmap').length, 0)
  })
})

/* ====================================================================== */

describe('L16 rotation: env vs volume vs subPath', () => {
  it('volume + app re-reads: every Pod sees the new value within one kubelet sync, no restart (seed 42: 3,6 s and 9,5 s)', () => {
    const s = createAccessPreset('l16')
    setConsume(s, 'api', 'volume')
    const t0 = rotateAt(s, 5)
    step(s, 30)
    const r = rotationStatus(s)
    assert.equal(r.phase, 'done')
    assert.equal(r.elapsed, 9.5)
    assert.ok(r.elapsed <= TIMING.kubeletSync.sim)
    assert.equal(r.record?.restartsDuring, 0)
    const apps = s.marks.filter((m) => m.kind === 'app').map((m) => [m.podId, Math.round((m.t - t0) * 10) / 10])
    assert.deepEqual(apps, [
      ['klopa-api-2', 3.6],
      ['klopa-api-1', 9.5],
    ])
    assert.equal(s.secrets[0].versions[0].revokedAt !== null, true)
  })

  it('volume worst case over 200 seeds ≤ kubelet sync period', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = createAccessPreset('l16', { seed })
      setConsume(s, 'api', 'volume')
      rotateAt(s, 5)
      step(s, 12)
      assert.equal(rotationStatus(s).phase, 'done', `seed ${seed}`)
      assert.ok(rotationStatus(s).elapsed <= 10 + 1e-9)
    }
  })

  it('env: the Secret changes at once but Pods keep the old value until restart; rollout restart completes it (seed 42: 16 s)', () => {
    const s = createAccessPreset('l16')
    rotateAt(s, 5)
    assert.equal(s.secrets[0].obj.version, 2)
    step(s, 600)
    assert.equal(rotationStatus(s).phase, 'propagating')
    assert.deepEqual(staleConsumers(s).map((p) => p.id), ['klopa-api-1', 'klopa-api-2'])
    assert.equal(s.secrets[0].versions[0].revokedAt, null) // old value still valid – not revoked yet
    const s2 = createAccessPreset('l16')
    rotateAt(s2, 5)
    step(s2, 10)
    restartPods(s2)
    step(s2, 30)
    const r = rotationStatus(s2)
    assert.equal(r.phase, 'done')
    assert.equal(r.elapsed, 16)
    assert.equal(r.record?.restartsDuring, 2)
  })

  it('subPath never updates, even after 10 minutes', () => {
    const s = createAccessPreset('l16')
    setConsume(s, 'api', 'subPath')
    rotateAt(s, 5)
    step(s, 600)
    assert.equal(rotationStatus(s).phase, 'propagating')
    assert.ok(s.pods.every((p) => p.file.db === 1 && p.uses.db === 1))
  })

  it('volume but the app does not re-read: file updated, app still on the old value', () => {
    const s = createAccessPreset('l16', { appRereadsFiles: false })
    setConsume(s, 'api', 'volume')
    rotateAt(s, 5)
    step(s, 60)
    assert.ok(s.pods.every((p) => p.file.db === 2 && p.uses.db === 1))
    assert.equal(rotationStatus(s).phase, 'propagating')
    assert.ok(s.events.some((e) => /ne čita ponovno/.test(e.text)))
    setAppRereads(s, true)
    rotateAt(s, s.t + 1)
    step(s, 15)
    assert.equal(rotationStatus(s).phase, 'done')
  })

  it('l16-timeline: env / volume / subPath side by side after 30 s', () => {
    const s = createAccessPreset('l16-timeline')
    rotateAt(s, 5)
    step(s, 30)
    const uses = Object.fromEntries(s.pods.map((p) => [p.workloadId, p.uses.db]))
    assert.deepEqual(uses, { env: 1, volume: 2, subpath: 1 })
  })

  it('revoking before propagation breaks stale Pods (failing logins)', () => {
    const s = createAccessPreset('l16')
    rotateAt(s, 5)
    assert.equal(revokeOld(s), 1)
    assert.equal(authFailingPods(s).length, 2)
    assert.equal(podSummary(s).authFailing, 2)
    restartPods(s)
    step(s, 20)
    assert.equal(authFailingPods(s).length, 0)
  })

  it('env literal in deployment.yaml: rotation = new Pods (seed 42: 6 s, 2 restarts) and never below replicas', () => {
    const s = createAccessPreset('l16')
    setApproach(s, 'db', 'manifest-env')
    rotateAt(s, 5)
    let minRunning = Infinity
    let maxActive = 0
    for (let i = 0; i < 300; i++) {
      step(s, 0.1)
      const active = s.pods.filter((p) => p.status !== 'Terminating')
      minRunning = Math.min(minRunning, s.pods.filter((p) => p.status === 'Running').length)
      maxActive = Math.max(maxActive, active.length)
    }
    const r = rotationStatus(s)
    assert.equal(r.phase, 'done')
    assert.equal(r.elapsed, 6)
    assert.equal(r.record?.restartsDuring, 2)
    assert.ok(minRunning >= 2, 'maxUnavailable 0')
    assert.ok(maxActive <= 3, 'maxSurge 1')
  })

  it('image: rebuild (20 s sim) + rollout; the old image keeps the old value (seed 42: 26 s)', () => {
    const s = createAccessPreset('l16')
    setApproach(s, 'db', 'image')
    rotateAt(s, 5)
    step(s, 60)
    const r = rotationStatus(s)
    assert.equal(r.phase, 'done')
    assert.equal(r.elapsed, 26)
    assert.deepEqual(s.images.map((i) => i.version), [1, 2])
    const v = verdictOf(s, 'image-puller')
    assert.deepEqual(v.paths[0].versions, [2])
    assert.equal(verdictOf(s, 'git-reader').reads, true) // the Dockerfile holds the new value too
  })
})

/* ====================================================================== */

describe('L23 „Put tajne (2. dio)”: GitOps approaches', () => {
  const expected: Record<string, ActorId[]> = {
    'git-secret': ['git-reader', 'argocd-redis', 'laptop-thief', 'ex-employee', 'etcd-backup-thief', 'cp-disk-thief', 'developer', 'pod-creator', 'compromised-pod'],
    sealed: ['laptop-thief', 'ex-employee', 'etcd-backup-thief', 'cp-disk-thief', 'developer', 'pod-creator', 'compromised-pod'],
    sops: ['argocd-redis', 'laptop-thief', 'ex-employee', 'etcd-backup-thief', 'cp-disk-thief', 'developer', 'pod-creator', 'compromised-pod'],
    eso: ['laptop-thief', 'ex-employee', 'etcd-backup-thief', 'cp-disk-thief', 'developer', 'pod-creator', 'compromised-pod'],
    csi: ['laptop-thief', 'ex-employee', 'developer', 'pod-creator', 'compromised-pod'],
    avp: ['argocd-redis', 'laptop-thief', 'ex-employee', 'etcd-backup-thief', 'cp-disk-thief', 'developer', 'pod-creator', 'compromised-pod'],
  }
  for (const ap of L23_APPROACHES) {
    it(`${ap}: ${expected[ap].length} red eyes (clean history)`, () => {
      const s = createAccessPreset('l23', { whatIf: true })
      setApproach(s, 'all', ap)
      assert.deepEqual(red(s, 'sms'), sorted(expected[ap]))
    })
  }

  it('after unsealing every approach yields a readable value for Pod creators (honest limit)', () => {
    for (const ap of L23_APPROACHES) {
      const s = createAccessPreset('l23', { whatIf: true, leastPrivilege: true, encryption: { provider: 'kms-v2' } })
      setApproach(s, 'all', ap)
      assert.equal(verdictOf(s, 'pod-creator', 'sms').reads, true, ap)
      assert.equal(verdictOf(s, 'pod-creator', 'sms').honestLimit, true, ap)
    }
  })

  it('best achievable: sealed/eso/csi + KMS v2 + least privilege + rotation → only the honest limits stay red', () => {
    for (const ap of ['sealed', 'eso', 'csi'] as const) {
      const s = createAccessPreset('l23', { leastPrivilege: true, encryption: { provider: 'kms-v2' } })
      setApproach(s, 'all', ap)
      setCsiRotation(s, true)
      step(s, 20)
      rotateSecret(s, 'sms')
      step(s, 120)
      assert.equal(rotationStatus(s, 'sms').phase, 'done', ap)
      assert.deepEqual(red(s, 'sms'), sorted(['pod-creator', 'compromised-pod']), ap)
      assert.equal(gitExposesValidValue(s, 'sms'), false)
    }
  })

  it('SealedSecret ciphertext and SOPS files are unreadable for Git readers; references carry no value', () => {
    const s = createAccessPreset('l23', { whatIf: true })
    setApproach(s, 'sms', 'sealed')
    assert.equal(verdictOf(s, 'git-reader', 'sms').blocked[0].control, 'git-encryption')
    setApproach(s, 'sms', 'sops')
    assert.match(verdictOf(s, 'git-reader', 'sms').blocked[0].reason, /SOPS/)
    setApproach(s, 'sms', 'eso')
    assert.equal(verdictOf(s, 'git-reader', 'sms').blocked[0].control, 'no-value-in-git')
  })

  it('migrating away from a plain Secret keeps the old value in Git history until rotation', () => {
    const s = createAccessPreset('l23')
    setApproach(s, 'sms', 'eso')
    assert.equal(verdictOf(s, 'git-reader', 'sms').reads, true)
    step(s, 20)
    rotateSecret(s, 'sms')
    step(s, 60)
    assert.equal(rotationStatus(s, 'sms').phase, 'done')
    assert.equal(verdictOf(s, 'git-reader', 'sms').reads, false)
    assert.equal(verdictOf(s, 'ex-employee', 'sms').reads, false)
  })

  it('Argo CD Redis: red for rendered plaintext (plain Secret, argocd-vault-plugin, KSOPS); Flux SOPS and kubectl: not', () => {
    const s = createAccessPreset('l23', { whatIf: true })
    setApproach(s, 'sms', 'avp')
    assert.match(verdictOf(s, 'argocd-redis', 'sms').paths[0].text, /Redisu/)
    const f = createAccessPreset('l23', { whatIf: true, sops: { decryptor: 'flux' } })
    setApproach(f, 'sms', 'sops')
    assert.equal(verdictOf(f, 'argocd-redis', 'sms').reads, false)
    const k = createAccessPreset('l16')
    const v = verdictOf(k, 'argocd-redis')
    assert.equal(v.applicable, false)
    assert.equal(v.reads, false)
  })

  it('laptop thief: Git clone + kubeconfig + local files + SOPS age key; disk encryption blocks all', () => {
    const s = createAccessPreset('l23', { whatIf: true, leastPrivilege: true, encryption: { provider: 'kms-v2' } })
    setApproach(s, 'sms', 'sops')
    assert.deepEqual(verdictOf(s, 'laptop-thief', 'sms').paths.map((p) => p.channel), ['git-sops'])
    setLaptop(s, { hasSopsKey: false })
    assert.equal(verdictOf(s, 'laptop-thief', 'sms').reads, false)
    setApproach(s, 'sms', 'secret')
    assert.deepEqual(verdictOf(s, 'laptop-thief', 'sms').paths.map((p) => p.channel), ['laptop-file'])
    setLaptop(s, { diskEncrypted: true })
    assert.equal(verdictOf(s, 'laptop-thief', 'sms').blocked[0].control, 'disk-encryption')
    const e = createAccessPreset('l23', { whatIf: true })
    setApproach(e, 'sms', 'eso')
    assert.ok(verdictOf(e, 'laptop-thief', 'sms').paths.some((p) => p.channel === 'api-get')) // kubeconfig with edit
  })

  it('CI log and ex-employee eyes close only with rotation', () => {
    const s = createAccessPreset('l23', { whatIf: true })
    setApproach(s, 'all', 'eso')
    leakToCiLog(s, 'sms')
    assert.equal(verdictOf(s, 'ci-log-reader', 'sms').reads, true)
    assert.equal(verdictOf(s, 'ex-employee', 'sms').reads, true)
    rotateAt(s, 1, 'sms')
    step(s, 60)
    assert.equal(verdictOf(s, 'ci-log-reader', 'sms').reads, false)
    assert.equal(verdictOf(s, 'ex-employee', 'sms').reads, false)
    memberLeaves(s)
    assert.equal(verdictOf(s, 'ex-employee', 'sms').reads, true)
    const fresh = createAccessPreset('l16')
    assert.equal(verdictOf(fresh, 'ex-employee').applicable, false)
  })
})

describe('L23 rotation timing („Rotirajte SMS ključ u < 5 min”)', () => {
  const cases: [Approach, number, number | null][] = [
    // approach, elapsed (seed 42, rotate at t = 20), deliveredAt − 20
    ['git-secret', 6.7, 4],
    ['sealed', 6.7, 5],
    ['sops', 6.7, 4],
    ['eso', 26.7, 25.8],
  ]
  for (const [ap, elapsed, delivered] of cases) {
    it(`${ap}: done in ${elapsed} s (sim), no restarts`, () => {
      const s = createAccessPreset('l23', { whatIf: true })
      setApproach(s, 'all', ap)
      const t0 = rotateAt(s, 20, 'sms')
      step(s, 300)
      const r = rotationStatus(s, 'sms')
      assert.equal(r.phase, 'done')
      assert.equal(r.elapsed, elapsed)
      assert.equal(Math.round(((r.record?.deliveredAt ?? 0) - t0) * 10) / 10, delivered)
      assert.equal(r.record?.restartsDuring, 0)
      assert.ok(r.elapsed < 300)
    })
  }

  it('bounds over 200 seeds: Git paths ≤ poll + jitter + unseal + kubelet; ESO ≤ refresh + kubelet', () => {
    const bound: Record<string, number> = { 'git-secret': 18 + 10, sealed: 18 + 1 + 10, eso: 30 + 10 }
    for (const ap of ['git-secret', 'sealed', 'eso'] as const) {
      for (let seed = 1; seed <= 200; seed += 7) {
        const s = createAccessPreset('l23', { whatIf: true, seed })
        setApproach(s, 'all', ap)
        rotateAt(s, 20, 'sms')
        step(s, 60)
        const r = rotationStatus(s, 'sms')
        assert.equal(r.phase, 'done', `${ap} seed ${seed}`)
        assert.ok(r.elapsed <= bound[ap] + 1e-9, `${ap} seed ${seed}: ${r.elapsed}`)
      }
    }
  })

  it('webhook makes Argo CD deliver in ~1 s', () => {
    const s = createAccessPreset('l23', { whatIf: true, argo: { webhook: true } })
    const t0 = rotateAt(s, 20, 'sms')
    step(s, 2)
    assert.equal(Math.round(((s.secrets[1].rotation?.deliveredAt ?? -1) - t0) * 10) / 10, 1)
  })

  it('ESO force-sync delivers immediately', () => {
    const s = createAccessPreset('l23', { whatIf: true })
    setApproach(s, 'all', 'eso')
    const t0 = rotateAt(s, 20, 'sms')
    forceEsoSync(s, 'sms')
    assert.equal(s.secrets[1].rotation?.deliveredAt, t0)
  })

  it('CSI: rotation off by default (real default) → only new Pods; on → re-fetch every poll (seed 42: 10,6 s)', () => {
    const s = createAccessPreset('l23', { whatIf: true })
    setApproach(s, 'all', 'csi')
    rotateAt(s, 20, 'sms')
    step(s, 300)
    assert.equal(rotationStatus(s, 'sms').phase, 'propagating')
    restartPods(s, 'worker')
    step(s, 10)
    assert.equal(rotationStatus(s, 'sms').phase, 'done')
    const on = createAccessPreset('l23', { whatIf: true, csi: { rotation: true } })
    setApproach(on, 'all', 'csi')
    rotateAt(on, 20, 'sms')
    step(on, 60)
    assert.equal(rotationStatus(on, 'sms').elapsed, 10.6)
    assert.ok(rotationStatus(on, 'sms').elapsed <= TIMING.csiRotationPoll.sim)
  })

  it('argocd-vault-plugin: a store change is invisible until a hard refresh (updates coupled to syncs)', () => {
    const s = createAccessPreset('l23', { whatIf: true })
    setApproach(s, 'all', 'avp')
    rotateAt(s, 20, 'sms')
    step(s, 300)
    assert.equal(rotationStatus(s, 'sms').phase, 'waiting-delivery')
    argoHardRefresh(s)
    step(s, 15)
    assert.equal(rotationStatus(s, 'sms').phase, 'done')
  })

  it('env consumers still need a restart with every approach', () => {
    const s = createAccessPreset('l23', { whatIf: true })
    setApproach(s, 'all', 'eso')
    setConsume(s, 'all', 'env')
    rotateAt(s, 20, 'sms')
    step(s, 120)
    assert.equal(rotationStatus(s, 'sms').phase, 'propagating')
    restartPods(s, 'worker')
    step(s, 10)
    assert.equal(rotationStatus(s, 'sms').phase, 'done')
  })
})

/* ====================================================================== */

describe('Sealed Secrets keys: renewal ≠ rotation, leaks, loss and backup', () => {
  it('a new sealing key every 30 days (60 s sim); old keys kept; nothing re-encrypted or rotated', () => {
    const s = createAccessPreset('l23', { whatIf: true })
    setApproach(s, 'all', 'sealed')
    const commits = s.commits.length
    const before = red(s, 'sms')
    step(s, 185)
    assert.deepEqual(s.sealedKeys.map((k) => k.id), ['k1', 'k2', 'k3', 'k4'])
    assert.equal(s.commits.length, commits)
    assert.equal(s.secrets[1].current, 1)
    assert.deepEqual(red(s, 'sms'), before)
    assert.ok(s.events.some((e) => /ne mijenjaju/.test(e.text)))
  })

  it('leaked private key: every SealedSecret ever committed opens; re-encrypting or rotating with the leaked key does not help', () => {
    const s = createAccessPreset('l23', { whatIf: true, sealed: { autoRenew: false } })
    setApproach(s, 'all', 'sealed')
    leakControllerKey(s)
    assert.equal(verdictOf(s, 'git-reader', 'sms').paths[0].channel, 'git-sealed')
    renewSealingKey(s)
    reencryptSealed(s)
    assert.equal(verdictOf(s, 'git-reader', 'sms').reads, true) // old commit still in history
    const bad = createAccessPreset('l23', { whatIf: true, sealed: { autoRenew: false } })
    setApproach(bad, 'all', 'sealed')
    leakControllerKey(bad)
    rotateAt(bad, 5, 'sms')
    step(bad, 60)
    assert.equal(rotationStatus(bad, 'sms').phase, 'done')
    assert.deepEqual(verdictOf(bad, 'git-reader', 'sms').paths[0].versions, [2]) // new value sealed with the leaked key
    renewSealingKey(bad)
    rotateAt(bad, bad.t + 1, 'sms')
    step(bad, 60)
    assert.equal(verdictOf(bad, 'git-reader', 'sms').reads, false)
  })

  it('lost key without backup: rebuilt cluster cannot unseal → CreateContainerConfigError (env) / FailedMount (volume), never a crash', () => {
    const s = createAccessPreset('l23', { whatIf: true })
    setApproach(s, 'all', 'sealed')
    setConsume(s, 'api', 'env')
    step(s, 5)
    loseControllerKey(s)
    step(s, 30)
    const api = s.pods.filter((p) => p.workloadId === 'api')
    const worker = s.pods.filter((p) => p.workloadId === 'worker')
    assert.ok(api.length === 2 && api.every((p) => p.status === 'CreateContainerConfigError' && p.message === 'Error: secret "klopa-db" not found'))
    assert.ok(worker.every((p) => p.status === 'ContainerCreating' && p.reason === 'FailedMount' && /secret "klopa-sms" not found/.test(p.message ?? '')))
    assert.ok(s.events.some((e) => /no key could decrypt/.test(e.text)))
    resealAll(s)
    step(s, 60)
    assert.ok(s.pods.every((p) => p.status === 'Running'), podStates(s).join(' '))
  })

  it('with a key backup the rebuilt cluster unseals and Pods start', () => {
    const s = createAccessPreset('l23', { whatIf: true, sealed: { keyBackup: true } })
    setApproach(s, 'all', 'sealed')
    step(s, 5)
    loseControllerKey(s)
    step(s, 30)
    assert.ok(s.pods.every((p) => p.status === 'Running'), podStates(s).join(' '))
  })
})

describe('store down and cluster rebuild', () => {
  it('ESO keeps the last synced Secret: running and new Pods fine, rotation refused/stalled', () => {
    const s = createAccessPreset('l23', { whatIf: true })
    setApproach(s, 'all', 'eso')
    step(s, 5)
    setStoreAvailable(s, false)
    assert.equal(rotateSecret(s, 'sms'), false)
    restartPods(s)
    step(s, 40)
    assert.ok(s.pods.every((p) => p.status === 'Running'))
    assert.equal(s.secrets[1].esoStatus, 'SecretSyncedError')
    assert.equal(s.secrets[1].obj.exists, true)
  })

  it('ESO: rotation started before the outage stalls and resumes when the store returns', () => {
    const s = createAccessPreset('l23', { whatIf: true })
    setApproach(s, 'all', 'eso')
    rotateAt(s, 1, 'sms')
    setStoreAvailable(s, false)
    step(s, 60)
    assert.equal(rotationStatus(s, 'sms').phase, 'waiting-delivery')
    assert.match(rotationStatus(s, 'sms').stalled ?? '', /trezor/)
    setStoreAvailable(s, true)
    step(s, 45)
    assert.equal(rotationStatus(s, 'sms').phase, 'done')
  })

  it('CSI: new Pods stuck in ContainerCreating (FailedMount) while old ones keep running; recovers', () => {
    const s = createAccessPreset('l23', { whatIf: true })
    setApproach(s, 'all', 'csi')
    step(s, 5)
    setStoreAvailable(s, false)
    restartPods(s)
    step(s, 30)
    const stuck = s.pods.filter((p) => p.reason === 'FailedMount')
    assert.equal(stuck.length, 2) // one surge Pod per Deployment
    assert.equal(s.pods.filter((p) => p.status === 'Running').length, 3) // rollout stalls, nothing taken down
    assert.equal(verdictOf(s, 'pod-creator', 'sms').blocked[0].control, 'store-down')
    setStoreAvailable(s, true)
    step(s, 30)
    assert.ok(s.pods.every((p) => p.status === 'Running') && s.pods.length === 3, podStates(s).join(' '))
  })

  it('L23 hook: a Secret applied by hand is missing in a rebuilt cluster → CreateContainerConfigError; re-apply fixes it', () => {
    const s = createAccessPreset('l23-rebuild')
    rebuildCluster(s)
    step(s, 20)
    const api = s.pods.filter((p) => p.workloadId === 'api')
    assert.ok(api.every((p) => p.status === 'CreateContainerConfigError'))
    assert.ok(s.pods.filter((p) => p.workloadId === 'worker').every((p) => p.status === 'Running'))
    assert.equal(applySecretManually(s, 'db'), true)
    step(s, 15)
    assert.ok(s.pods.every((p) => p.status === 'Running'))
    assert.equal(applySecretManually(s, 'sms'), false) // no local file for a Git-managed secret
  })

  it('ESO on a rebuilt cluster with the store down: no Secret to keep → Pods cannot start', () => {
    const s = createAccessPreset('l23', { whatIf: true })
    setApproach(s, 'all', 'eso')
    setStoreAvailable(s, false)
    rebuildCluster(s)
    step(s, 20)
    assert.ok(s.pods.every((p) => p.status !== 'Running'))
    setStoreAvailable(s, true)
    step(s, 45)
    assert.ok(s.pods.every((p) => p.status === 'Running'))
  })
})

/* ====================================================================== */

describe('attempt API (animation)', () => {
  it('a successful etcd theft walks its hops and logs a bad event on arrival', () => {
    const s = createAccessPreset('l16')
    const a = stealEtcdBackup(s)
    assert.ok(a)
    assert.equal(a.success, true)
    assert.deepEqual(a.hops, ['etcd'])
    assert.equal(s.events.some((e) => e.kind === 'attempt'), false)
    let last = 0
    for (let i = 0; i < 5; i++) {
      step(s, 0.1)
      const cur = s.attempts.find((x) => x.id === a.id)
      if (cur) {
        assert.ok(cur.progress >= last)
        last = cur.progress
      }
    }
    step(s, 0.5)
    const ev = s.events.filter((e) => e.kind === 'attempt')
    assert.equal(ev.length, 1)
    assert.equal(ev[0].tone, 'bad')
    assert.match(ev[0].text, /čita lozinku baze/)
    step(s, 3)
    assert.equal(s.attempts.length, 0)
  })

  it('a blocked disk theft stops at the KMS hop', () => {
    const s = createAccessPreset('l16', { encryption: { provider: 'kms-v2' } })
    const a = stealControlPlaneDisk(s)
    assert.ok(a)
    assert.equal(a.success, false)
    assert.deepEqual(a.hops, ['cp-disk', 'etcd', 'kms'])
    assert.equal(a.control, 'kms')
    step(s, 3 * TIMING.attemptHop.sim + 0.2)
    const ev = s.events.filter((e) => e.kind === 'attempt')
    assert.equal(ev[0].tone, 'ok')
    assert.match(ev[0].text, /ne može pročitati/)
  })

  it('attemptAll launches one per visible actor; unknown ids return null', () => {
    const s = createAccessPreset('l16')
    assert.equal(attemptAll(s).length, L16_ACTORS.length)
    assert.equal(attempt(s, 'nobody' as ActorId), null)
    assert.equal(attempt(s, 'git-reader', 'missing'), null)
  })

  it('cosmetic flows appear for propagation and vanish', () => {
    const s = createAccessPreset('l23', { whatIf: true })
    setApproach(s, 'all', 'eso')
    rotateAt(s, 1, 'sms')
    forceEsoSync(s, 'sms')
    assert.ok(s.flows.some((f) => f.kind === 'eso'))
    step(s, 5)
    assert.equal(s.flows.filter((f) => f.kind === 'eso').length, 0)
  })
})

/* ====================================================================== */

describe('determinism', () => {
  const script = (seed: number) => {
    const s = createAccessPreset('l23', { seed })
    setApproach(s, 'sms', 'sealed')
    step(s, 7.3)
    commitPlainSecret(s, 'db')
    rotateSecret(s, 'sms')
    step(s, 40)
    setApproach(s, 'db', 'eso')
    rotateSecret(s, 'db')
    leakControllerKey(s)
    step(s, 90)
    attempt(s, 'git-reader', 'sms')
    step(s, 3)
    return JSON.stringify({ events: s.events, pods: s.pods, marks: s.marks, commits: s.commits, report: evaluateAll(s) })
  }
  it('same seed + same actions ⇒ identical results', () => {
    assert.equal(script(42), script(42))
  })
  it('a different seed changes the timing', () => {
    assert.notEqual(script(42), script(7))
  })
  it('step size does not matter (fixed internal timestep)', () => {
    const a = createAccessPreset('l16')
    const b = createAccessPreset('l16')
    setConsume(a, 'api', 'volume')
    setConsume(b, 'api', 'volume')
    rotateSecret(a)
    rotateSecret(b)
    for (let i = 0; i < 1200; i++) step(a, 1 / 60)
    step(b, 20)
    assert.deepEqual(a.marks, b.marks)
    assert.equal(a.t, b.t)
  })
})

describe('edge cases', () => {
  it('ignores NaN, negative and infinite dt; clamps huge dt', () => {
    const s = createAccessPreset('l16')
    step(s, NaN)
    step(s, -5)
    step(s, Infinity)
    assert.equal(s.t, 0)
    step(s, 1e9)
    assert.equal(s.t, 3600)
  })

  it('zero replicas: no Pod to compromise, rotation completes on delivery', () => {
    const s = createAccessPreset('l16', { workloads: [{ id: 'api', name: 'klopa-api', replicas: 0, consume: 'env', secretIds: ['db'] }] })
    assert.equal(s.pods.length, 0)
    const v = verdictOf(s, 'compromised-pod')
    assert.equal(v.reads, false)
    assert.equal(v.blocked[0].control, 'no-pod')
    rotateSecret(s)
    assert.equal(rotationStatus(s).phase, 'done')
    assert.equal(staleConsumers(s).length, 0)
    assert.equal(podSummary(s).total, 0)
  })

  it('no secrets at all: nothing throws, nothing is readable', () => {
    const s = createAccess({ secrets: [] })
    assert.equal(s.config.focusSecretId, '')
    assert.equal(rotateSecret(s), false)
    assert.equal(eyeSummary(s).red, 0)
    assert.equal(evaluateAccess(s).red.length, 0)
    assert.equal(secretValue(s), null)
    assert.equal(commitPlainSecret(s), false)
    step(s, 30)
    assert.ok(s.pods.every((p) => p.status === 'Running'))
  })

  it('all Pods failing: the compromised-Pod eye is grey, metrics stay finite', () => {
    const s = createAccessPreset('l23-rebuild')
    rebuildCluster(s)
    step(s, 20)
    assert.equal(verdictOf(s, 'compromised-pod', 'db').reads, false)
    const m = s.metrics
    for (const ser of [m.redEyes, m.running, m.stale, m.authFailing]) assert.ok(ser.values.every(Number.isFinite))
  })

  it('no visible actors: summary 0 / 0', () => {
    const s = createAccessPreset('l16')
    setVisibleActors(s, [])
    assert.deepEqual(eyeSummary(s), { red: 0, grey: 0, total: 0, honestLimit: 0, redIds: [] })
  })

  it('setReplicas clamps and ignores NaN; unknown ids are no-ops', () => {
    const s = createAccessPreset('l16')
    setReplicas(s, 'api', NaN)
    assert.equal(s.workloads[0].replicas, 2)
    setReplicas(s, 'api', -3)
    step(s, 2)
    assert.equal(s.pods.length, 0)
    setReplicas(s, 'api', 3.7)
    step(s, 5)
    assert.equal(s.pods.filter((p) => p.status === 'Running').length, 3)
    setReplicas(s, 'nope', 2)
    setApproach(s, 'nope', 'eso')
    setApproach(s, 'db', 'bogus' as Approach)
    assert.equal(s.secrets[0].approach, 'secret')
    assert.equal(revokeOld(s, 'nope'), 0)
    restartPods(s, 'nope')
  })

  it('resolveConfig sanitises input', () => {
    const c = resolveConfig({
      secrets: [{ id: 'db' }, { id: 'db' }, { id: 'x' }],
      workloads: [{ id: 'w', replicas: 999, secretIds: ['db', 'ghost'] }],
      timing: { kubeletSync: -1, esoRefresh: NaN, argoPoll: 5 },
      focusSecretId: 'ghost',
      seed: 1.9,
    })
    assert.equal(c.secrets.length, 2)
    assert.equal(c.secrets[0].name, 'klopa-db')
    assert.equal(c.secrets[1].key, 'X')
    assert.equal(c.workloads[0].replicas, 20)
    assert.deepEqual(c.workloads[0].secretIds, ['db'])
    assert.equal(c.timing.kubeletSync, 10)
    assert.equal(c.timing.esoRefresh, 30)
    assert.equal(c.timing.argoPoll, 5)
    assert.equal(c.focusSecretId, 'db')
    assert.equal(c.seed, 1)
  })

  it('events are capped and well-formed', () => {
    const s = createAccessPreset('l16')
    for (let i = 0; i < 40; i++) {
      leakEnvToLog(s)
      setLeastPrivilege(s, i % 2 === 0)
      step(s, 0.1)
    }
    assert.equal(s.events.length, MAX_EVENTS)
    for (const e of s.events) {
      assert.ok(e.text.length > 0)
      assert.ok(['ok', 'warn', 'bad', 'info', 'neutral'].includes(e.tone))
    }
    assert.ok(s.events[s.events.length - 1].id > s.events[0].id)
  })

  it('metrics: one sample per simulated second, capped', () => {
    const s = createAccessPreset('l16')
    step(s, 10)
    assert.equal(s.metrics.redEyes.values.length, 11)
    assert.equal(s.metrics.redEyes.last(), 5)
    step(s, 300)
    assert.equal(s.metrics.redEyes.values.length, SERIES_LEN)
  })

  it('CSI sync toggle creates/removes the Kubernetes Secret (and so the etcd exposure)', () => {
    const s = createAccessPreset('l23', { whatIf: true })
    setApproach(s, 'all', 'csi')
    assert.equal(verdictOf(s, 'etcd-backup-thief', 'sms').reads, false)
    setCsiSync(s, true)
    assert.equal(verdictOf(s, 'etcd-backup-thief', 'sms').reads, true)
    setCsiSync(s, false)
    step(s, 1)
    assert.equal(verdictOf(s, 'etcd-backup-thief', 'sms').reads, false)
  })

  it('explainVerdict gives Croatian text for red and grey eyes', () => {
    const s = createAccessPreset('l16')
    assert.match(explainVerdict(verdictOf(s, 'pod-creator')), /^• /)
    assert.match(explainVerdict(verdictOf(s, 'view-user')), /^✕ RBAC/)
  })
})

/* ====================================================================== */

describe('assets: where the value lives (actors × assets × controls)', () => {
  const kinds = (s: AccessState, id?: string) => assetsOf(s, id).map((a) => a.kind)
  const asset = (s: AccessState, kind: string, id?: string) => assetsOf(s, id).find((a) => a.kind === kind)

  it('l16 default: local secret.yaml, plaintext Secret in etcd, env var in the Pods; readers come from the evaluation', () => {
    const s = createAccessPreset('l16')
    assert.deepEqual(kinds(s), ['laptop-file', 'etcd', 'pod-env'])
    const etcd = asset(s, 'etcd')
    assert.ok(etcd)
    assert.equal(etcd.form, 'plain') // identity: base64 is only the API representation
    assert.equal(etcd.node, 'etcd')
    assert.match(etcd.protection ?? '', /identity/)
    assert.deepEqual(sorted(etcd.readers), sorted(['etcd-backup-thief', 'cp-disk-thief', 'developer', 'pod-creator', 'laptop-thief']))
    assert.deepEqual(sorted(asset(s, 'pod-env')?.readers ?? []), sorted(['developer', 'compromised-pod', 'laptop-thief']))
  })

  it('encryption turns the etcd copy into ciphertext; the protection says where the key lives', () => {
    const s = createAccessPreset('l16')
    setEncryption(s, 'secretbox')
    let etcd = asset(s, 'etcd')
    assert.equal(etcd?.form, 'encrypted')
    assert.match(etcd?.protection ?? '', /upravljačkoj ravnini/)
    assert.ok(etcd?.readers.includes('cp-disk-thief'))
    assert.ok(!etcd?.readers.includes('etcd-backup-thief'))
    setEncryption(s, 'kms-v2')
    etcd = asset(s, 'etcd')
    assert.match(etcd?.protection ?? '', /vanjskom KMS-u/)
    assert.ok(!etcd?.readers.includes('cp-disk-thief'))
    setApproach(s, 'db', 'configmap')
    assert.equal(asset(s, 'etcd')?.form, 'plain') // scope `secrets`: ConfigMaps are not encrypted
    assert.match(asset(s, 'etcd')?.protection ?? '', /nije na popisu/)
  })

  it('Git forms: a base64 leak is readable, SealedSecret/SOPS are ciphertext, ESO/CSI/AVP are references', () => {
    const s = createAccessPreset('l23', { whatIf: true })
    assert.equal(asset(s, 'git-base64', 'sms')?.form, 'base64')
    setApproach(s, 'sms', 'sealed')
    assert.equal(asset(s, 'git-sealed', 'sms')?.form, 'encrypted')
    // no Git reader opens it; without encryption at rest the controller's key Secret lies readable in an etcd copy
    assert.deepEqual(asset(s, 'git-sealed', 'sms')?.readers, ['etcd-backup-thief', 'cp-disk-thief'])
    setEncryption(s, 'kms-v2')
    assert.deepEqual(asset(s, 'git-sealed', 'sms')?.readers, [])
    setEncryption(s, 'identity')
    assert.ok(kinds(s, 'sms').includes('sealed-object'))
    setApproach(s, 'sms', 'sops')
    assert.equal(asset(s, 'git-sops', 'sms')?.form, 'encrypted')
    for (const ap of ['eso', 'csi', 'avp'] as const) {
      setApproach(s, 'sms', ap)
      const ref = asset(s, 'git-reference', 'sms')
      assert.equal(ref?.form, 'reference', ap)
      assert.deepEqual(ref?.versions, [], ap)
      assert.ok(kinds(s, 'sms').includes('store'), ap)
    }
    assert.ok(kinds(s, 'sms').includes('redis')) // avp: rendered plaintext in Argo CD's cache
  })

  it('plaintext: CSI without sync keeps the value out of etcd – only the Pod tmpfs (and memory) hold it', () => {
    const s = createAccessPreset('l23', { whatIf: true })
    setApproach(s, 'all', 'csi')
    assert.deepEqual(plaintextAssets(s, 'sms').map((a) => a.kind), ['memory', 'pod-file'])
    assert.equal(asset(s, 'pod-file', 'sms')?.label, 'tmpfs u Podu (CSI driver)')
    assert.deepEqual(asset(s, 'store', 'sms')?.readers, ['developer', 'pod-creator', 'laptop-thief']) // a new Pod mounts the SecretProviderClass
    setCsiSync(s, true)
    assert.ok(plaintextAssets(s, 'sms').some((a) => a.kind === 'etcd'))
  })

  it('after rotation old copies stay listed but are no longer valid', () => {
    const s = createAccessPreset('l16', { leastPrivilege: true })
    setConsume(s, 'api', 'volume')
    commitPlainSecret(s)
    rotateAt(s, 1)
    step(s, 15)
    const git = asset(s, 'git-base64')
    assert.equal(git?.valid, false)
    assert.deepEqual(git?.readers, [])
    assert.ok(!plaintextAssets(s).some((a) => a.kind === 'git-base64'))
  })

  it('unknown secret → no assets', () => {
    assert.deepEqual(assetsOf(createAccessPreset('l16'), 'missing'), [])
    assert.deepEqual(assetsOf(createAccess({ secrets: [] })), [])
  })
})

describe('regressions', () => {
  it('a leaked sealing key stays leaked when the key ring is later lost; only rotation closes the Git eye', () => {
    const s = createAccessPreset('l23', { whatIf: true, sealed: { autoRenew: false } })
    setApproach(s, 'all', 'sealed')
    leakControllerKey(s)
    loseControllerKey(s) // no backup: new ring, rebuilt cluster
    assert.deepEqual(s.sealedKeys.map((k) => k.compromised), [false])
    assert.equal(verdictOf(s, 'git-reader', 'sms').reads, true)
    assert.equal(gitLog(s, 'sms').some((c) => c.readable && c.valid), true)
    resealAll(s)
    step(s, 30)
    assert.ok(s.pods.every((p) => p.status === 'Running'), podStates(s).join(' '))
    assert.equal(verdictOf(s, 'git-reader', 'sms').reads, true) // v1 still valid, sealed with the leaked key
    rotateSecret(s, 'sms')
    step(s, 60)
    assert.equal(rotationStatus(s, 'sms').phase, 'done')
    assert.equal(verdictOf(s, 'git-reader', 'sms').reads, false)
    assert.equal(verdictOf(s, 'git-reader', 'sms').level, 'stale')
  })

  it('explorer mode: changing the Pod template during a rotation is a restart (no shortcut to the goal)', () => {
    const s = createAccessPreset('l16')
    rotateAt(s, 5)
    step(s, 2)
    setConsume(s, 'api', 'volume')
    step(s, 20)
    assert.equal(rotationStatus(s).phase, 'done')
    assert.equal(rotationStatus(s).record?.restartsDuring, 2)
    const ok = createAccessPreset('l16')
    setConsume(ok, 'api', 'volume') // before the rotation: not counted
    rotateAt(ok, 5)
    step(ok, 20)
    assert.equal(rotationStatus(ok).record?.restartsDuring, 0)
  })

  it('ESO refreshInterval: changing the spec syncs at once (new generation); invalid values are ignored', () => {
    const s = createAccessPreset('l23', { whatIf: true })
    setApproach(s, 'all', 'eso')
    const t0 = rotateAt(s, 20, 'sms')
    assert.equal(setEsoRefreshInterval(s, 2), 2)
    assert.equal(s.secrets[1].rotation?.deliveredAt, t0) // immediate, not at the next tick
    assert.equal(s.secrets[1].nextRefresh, t0 + 2)
    assert.equal(setEsoRefreshInterval(s, NaN), 2)
    assert.equal(setEsoRefreshInterval(s, -1), 2)
    assert.equal(setEsoRefreshInterval(s, 1e9), 24 * 3600)
  })

  it('compressed times use the shared shape (simValue, realValue, label) and Secret facts are exported', () => {
    for (const v of Object.values(TIMING)) {
      assert.equal(v.simValue, v.sim)
      assert.equal(v.realValue, v.real)
      assert.equal(v.label, timingLabel(v))
      assert.equal(v.unit, 's')
    }
    assert.equal(TIMING.esoRefresh.label, '30 s (u YAML-u) · zadano: 1 h') // same framing as E6 TIMINGS.esoRefresh
    assert.equal(TIMING.esoRefresh.compressed, true) // the value is not the tool's default
    assert.equal(TIMING.argoWebhook.compressed, false)
    assert.equal(SECRET_MAX_BYTES, 1048576)
    assert.equal(SECRET_TYPES[0], 'Opaque')
    assert.ok(SECRET_TYPES.includes('kubernetes.io/tls'))
  })
})

/* ====================================================================== */

describe('invariants under a seeded random action sequence', () => {
  it('holds for 25 seeds × 60 actions', () => {
    const approaches: Approach[] = [...L16_APPROACHES, ...L23_APPROACHES]
    for (let seed = 1; seed <= 25; seed++) {
      let r = seed * 2654435761
      const rnd = () => {
        r = (Math.imul(r ^ (r >>> 15), 2246822507) + 0x9e3779b9) >>> 0
        return r / 4294967296
      }
      const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]
      const s = createAccessPreset(pick(['l16', 'l23'] as const), { seed })
      const ids = s.secrets.map((x) => x.id)
      const actions: (() => void)[] = [
        () => setApproach(s, pick(ids), pick(approaches)),
        () => setConsume(s, 'all', pick(['env', 'volume', 'subPath'] as const)),
        () => setEncryption(s, pick(['identity', 'aescbc', 'aesgcm', 'secretbox', 'kms-v2'] as const)),
        () => setLeastPrivilege(s, rnd() < 0.5),
        () => rotateSecret(s, pick(ids)),
        () => commitPlainSecret(s, pick(ids)),
        () => leakEnvToLog(s),
        () => leakToCiLog(s, pick(ids)),
        () => leakControllerKey(s),
        () => renewSealingKey(s),
        () => setStoreAvailable(s, rnd() < 0.6),
        () => restartPods(s),
        () => revokeOld(s, pick(ids)),
        () => rebuildCluster(s),
        () => attempt(s, pick(ACTOR_ORDER), pick(ids)),
        () => setReplicas(s, s.workloads[0].id, Math.floor(rnd() * 4)),
        () => loseControllerKey(s),
        () => setEsoRefreshInterval(s, 1 + rnd() * 40),
        () => memberLeaves(s),
      ]
      for (let i = 0; i < 60; i++) {
        pick(actions)()
        step(s, rnd() * 20)
        // rollout bounds
        for (const w of s.workloads) {
          const active = s.pods.filter((p) => p.workloadId === w.id && p.status !== 'Terminating')
          assert.ok(active.length <= w.replicas + 1, `surge bound seed ${seed}`)
        }
        for (const id of ids) {
          const sec = s.secrets.find((x) => x.id === id)
          if (!sec) continue
          for (const v of evaluateAccess(s, id).verdicts) {
            assert.equal(v.reads, v.paths.length > 0)
            for (const p of v.paths) {
              assert.ok(p.versions.length > 0)
              for (const ver of p.versions) assert.equal(sec.versions.find((x) => x.v === ver)?.revokedAt, null)
              assert.equal(p.hops.length, p.steps.length)
            }
            for (const b of v.blocked) assert.ok(b.blockedAt >= 0 && b.blockedAt < b.hops.length)
          }
          // every red path names an asset that exists, and that asset lists the actor as a reader
          const assets = new Map(assetsOf(s, id).map((a) => [a.kind, a]))
          for (const v of evaluateAccess(s, id).verdicts) {
            for (const p of v.paths) {
              assert.ok(p.assets.length > 0, `${v.actorId} ${p.id} has no asset`)
              for (const k of p.assets) assert.ok(assets.get(k)?.readers.includes(v.actorId), `seed ${seed}: ${v.actorId} via ${k} (${p.id})`)
            }
          }
          // honest limit: whoever is inside a running consumer Pod reads a value
          const running = s.pods.some((p) => p.status === 'Running' && s.workloads.find((w) => w.id === p.workloadId)?.secretIds.includes(id))
          const comp = verdictOf(s, 'compromised-pod', id)
          assert.equal(comp.reads || comp.level === 'stale', running, `compromised-pod seed ${seed}`)
          // revoked versions never come back
          assert.ok(sec.versions.every((x, k) => k === 0 || x.v === sec.versions[k - 1].v + 1))
        }
        assert.ok(s.events.length <= MAX_EVENTS)
        assert.ok(s.attempts.every((a) => a.progress >= 0 && a.progress <= 1))
      }
    }
  })
})

/* ======================================================================
 * Review fixes (model + API reviews) – one regression test per finding
 * ==================================================================== */

const running = (s: AccessState, wid: string) => s.pods.filter((p) => p.workloadId === wid && p.status === 'Running').length

describe('review: rollout never kills a Running Pod to make room (maxUnavailable 0)', () => {
  it('a second rollout on top of a stuck surge Pod removes the stuck Pod, not a Running one (store down, CSI)', () => {
    const s = createAccessPreset('l23', { whatIf: true })
    setApproach(s, 'all', 'csi')
    setStoreAvailable(s, false)
    restartPods(s, 'api')
    step(s, 5)
    assert.deepEqual(podStates(s).filter((x) => x.startsWith('klopa-api')), ['klopa-api-1:Running', 'klopa-api-2:Running', 'klopa-api-3:ContainerCreating/FailedMount'])
    restartPods(s, 'api')
    step(s, 5)
    assert.equal(running(s, 'api'), 2)
    assert.deepEqual(podStates(s).filter((x) => x.startsWith('klopa-api')), ['klopa-api-1:Running', 'klopa-api-2:Running', 'klopa-api-4:ContainerCreating/FailedMount'])
    setStoreAvailable(s, true)
    step(s, 40)
    assert.ok(s.pods.every((p) => p.status === 'Running') && running(s, 'api') === 2, podStates(s).join(' '))
  })

  it('back-to-back consumption changes (two rollouts) keep both replicas running', () => {
    const s = createAccessPreset('l23')
    step(s, 5)
    setConsume(s, 'api', 'env')
    let min = Infinity
    for (let i = 0; i < 5; i++) {
      step(s, 0.1)
      min = Math.min(min, running(s, 'api'))
    }
    setConsume(s, 'api', 'volume')
    for (let i = 0; i < 300; i++) {
      step(s, 0.1)
      min = Math.min(min, running(s, 'api'))
      assert.ok(s.pods.filter((p) => p.workloadId === 'api' && p.status !== 'Terminating').length <= 3)
    }
    assert.equal(min, 2)
    assert.ok(s.pods.filter((p) => p.workloadId === 'api').every((p) => p.status === 'Running' && !p.outdated))
  })

  it('fuzz: Running Pods per Deployment never drop below min(replicas, Running before) – 30 seeds × 40 actions', () => {
    for (let seed = 1; seed <= 30; seed++) {
      let r = seed * 2654435761
      const rnd = () => {
        r = (Math.imul(r ^ (r >>> 15), 2246822507) + 0x9e3779b9) >>> 0
        return r / 4294967296
      }
      const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]
      const s = createAccessPreset(pick(['l16', 'l23'] as const), { seed, whatIf: false })
      const ids = s.secrets.map((x) => x.id)
      const actions: (() => void)[] = [
        () => restartPods(s, pick(s.workloads).id),
        () => setConsume(s, pick(s.workloads).id, pick(['env', 'volume', 'subPath'] as const)),
        () => setApproach(s, pick(ids), pick([...L16_APPROACHES, ...L23_APPROACHES])),
        () => setStoreAvailable(s, rnd() < 0.5),
        () => rotateSecret(s, pick(ids)),
        () => setCsiSync(s, rnd() < 0.5),
        () => argoHardRefresh(s),
      ]
      for (let i = 0; i < 40; i++) {
        const before = new Map(s.workloads.map((w) => [w.id, Math.min(w.replicas, running(s, w.id))]))
        pick(actions)()
        const n = 1 + Math.floor(rnd() * 80)
        for (let k = 0; k <= n; k++) {
          for (const w of s.workloads) {
            const floor = before.get(w.id) ?? 0
            assert.ok(running(s, w.id) >= floor, `seed ${seed} action ${i}: ${w.id} ${running(s, w.id)} < ${floor} – ${podStates(s).join(' ')}`)
            assert.ok(s.pods.filter((p) => p.workloadId === w.id && p.status !== 'Terminating').length <= w.replicas + 1)
          }
          step(s, 0.1)
        }
      }
    }
  })
})

describe('review: CSI with sync – the synced Secret stays mountable while the store is down', () => {
  it('Pod creators stay red through the synced Secret (honest limit); without sync the store outage blocks them', () => {
    const s = createAccessPreset('l23', { whatIf: true })
    setApproach(s, 'all', 'csi')
    setCsiSync(s, true)
    step(s, 5)
    setStoreAvailable(s, false)
    const v = verdictOf(s, 'pod-creator', 'sms')
    assert.equal(v.reads, true)
    assert.equal(v.honestLimit, true)
    assert.deepEqual(v.paths.map((p) => [p.id, p.assets]), [['mount:synced', ['etcd']]])
    assert.ok(assetsOf(s, 'sms').find((a) => a.kind === 'etcd')?.readers.includes('pod-creator'))
    // env consumption turns the sync on by itself – same result
    const e = createAccessPreset('l23', { whatIf: true })
    setApproach(e, 'all', 'csi')
    setConsume(e, 'all', 'env')
    step(e, 5)
    setStoreAvailable(e, false)
    assert.equal(verdictOf(e, 'pod-creator', 'sms').reads, true)
    // no sync: nothing to mount without the store
    const n = createAccessPreset('l23', { whatIf: true })
    setApproach(n, 'all', 'csi')
    setStoreAvailable(n, false)
    assert.equal(verdictOf(n, 'pod-creator', 'sms').reads, false)
    assert.equal(verdictOf(n, 'pod-creator', 'sms').blocked.find((b) => b.channel === 'mount')?.control, 'store-down')
  })
})

describe('review: rotation time in real terms („< 5 min”)', () => {
  const cases: [Approach, number, number][] = [
    // seed 42, rotate at t = 20, volume consumers: sim elapsed, real-time equivalent
    ['git-secret', 6.7, 64.3], // Argo CD 4 s × 10 + kubelet 2,7 s × 9
    ['sealed', 6.7, 56.3], // Argo CD 4 s × 10 + unseal 1 s + kubelet 1,7 s × 9
    ['sops', 6.7, 64.3],
    ['eso', 26.7, 33.9], // refreshInterval 30 s (YAML, ×1): 25,8 s + kubelet 0,9 s × 9
  ]
  for (const [ap, sim, real] of cases) {
    it(`${ap}: ${sim} s (sim) ≈ ${real} s real`, () => {
      const s = createAccessPreset('l23', { whatIf: true })
      setApproach(s, 'all', ap)
      rotateAt(s, 20, 'sms')
      step(s, 300)
      const r = rotationStatus(s, 'sms')
      assert.equal(r.phase, 'done')
      assert.equal(r.elapsed, sim)
      assert.equal(r.realElapsed, real)
      const waited = Object.values(r.record?.waits ?? {}).reduce((a, b) => a + b, 0)
      assert.ok(Math.abs(waited - sim) < 1e-6, 'every simulated second is attributed to one wait')
      assert.ok(r.realElapsed < ROTATION_GOAL_REAL_S)
      assert.match(r.label, /\(sim\) ≈ .* stvarno$/)
    })
  }

  it('measured real time never exceeds the worst-case estimate (200 seeds; Git ≤ 270 s, sealed ≤ 271 s, ESO ≤ 120 s, CSI ≤ 120 s)', () => {
    const cfgs: [Approach, boolean, number][] = [
      ['git-secret', false, 270],
      ['sealed', false, 271],
      ['eso', false, 120],
      ['csi', true, 120],
    ]
    for (const [ap, csiRotation, bound] of cfgs) {
      for (let seed = 1; seed <= 200; seed += 3) {
        const s = createAccessPreset('l23', { whatIf: true, seed, csi: { rotation: csiRotation } })
        setApproach(s, 'all', ap)
        const est = rotationEstimate(s, 'sms')
        assert.equal(est.realWorst, bound, ap)
        assert.equal(est.automaticUnder5Min, true, ap)
        rotateAt(s, 20, 'sms')
        step(s, 60)
        const r = rotationStatus(s, 'sms')
        assert.equal(r.phase, 'done', `${ap} seed ${seed}`)
        assert.ok(r.realElapsed <= bound + 1e-6 && r.realElapsed < ROTATION_GOAL_REAL_S, `${ap} seed ${seed}: ${r.realElapsed}`)
      }
    }
  })

  it('CSI with rotation on: 10,6 s (sim) ≈ 63,6 s real (rotation-poll ×6)', () => {
    const s = createAccessPreset('l23', { whatIf: true, csi: { rotation: true } })
    setApproach(s, 'all', 'csi')
    rotateAt(s, 20, 'sms')
    step(s, 60)
    assert.equal(rotationStatus(s, 'sms').realElapsed, 63.6)
  })

  it('ESO with its real default refreshInterval (1 h) misses the goal; force-sync meets it', () => {
    const s = createAccessPreset('l23', { whatIf: true })
    setApproach(s, 'all', 'eso')
    setEsoRefreshInterval(s, 3600)
    assert.equal(rotationEstimate(s, 'sms').automaticUnder5Min, false)
    assert.equal(rotationEstimate(s, 'sms').realWorst, 3600 + 90)
    rotateAt(s, 20, 'sms')
    step(s, 3600)
    step(s, 100)
    const r = rotationStatus(s, 'sms')
    assert.equal(r.phase, 'done')
    assert.ok(r.realElapsed > ROTATION_GOAL_REAL_S, String(r.realElapsed))
    assert.equal(l23Goals(s).rotateFast.done, false)
    rotateSecret(s, 'sms')
    forceEsoSync(s, 'sms')
    step(s, 15)
    assert.equal(rotationStatus(s, 'sms').phase, 'done')
    assert.ok(rotationStatus(s, 'sms').realElapsed <= 90 + 1e-9)
    assert.equal(l23Goals(s).rotateFast.done, true)
  })

  it('worst-case estimates: Git paths ≈ 4,5 min, ESO (30 s) ≈ 2 min, env needs a restart, AVP a hard refresh', () => {
    const s = createAccessPreset('l23', { whatIf: true })
    let e = rotationEstimate(s, 'sms')
    assert.deepEqual([e.simWorst, e.realWorst, e.automaticUnder5Min], [28, 270, true]) // (12 + 6) × 10 + 10 × 9
    assert.equal(e.label, 'najviše 28 s (sim) ≈ 4,5 min stvarno')
    setApproach(s, 'all', 'sealed')
    assert.equal(rotationEstimate(s, 'sms').realWorst, 271)
    setApproach(s, 'all', 'eso')
    e = rotationEstimate(s, 'sms')
    assert.deepEqual([e.simWorst, e.realWorst], [40, 120])
    setConsume(s, 'all', 'env')
    e = rotationEstimate(s, 'sms')
    assert.equal(e.automaticUnder5Min, false)
    assert.match(e.needs.join(), /rollout restart/)
    setApproach(s, 'all', 'avp')
    e = rotationEstimate(s, 'sms')
    assert.match(e.shortcuts.join(), /hard refresh/) // faster, not required: the cache expiry (24 h) regenerates too
    assert.equal(e.realWorst, 720 * 120 + 18 * 10 + 3) // cache 24 h + Argo CD poll + restart of the worker Pod (env)
    assert.equal(e.automaticUnder5Min, false)
    setStoreAvailable(s, false)
    assert.equal(rotationEstimate(s, 'sms').realWorst, null)
    const w = createAccessPreset('l23', { whatIf: true, argo: { webhook: true } })
    assert.equal(rotationEstimate(w, 'sms').realWorst, 1 + 90)
    assert.equal(rotationEstimate(w, 'missing').blocked, 'nepoznata tajna')
  })
})

describe('review: Pod file storage and encryption texts', () => {
  it('Secret volumes are tmpfs, ConfigMap volumes are files on the node disk', () => {
    const s = createAccessPreset('l16')
    setConsume(s, 'api', 'volume')
    const file = () => assetsOf(s).find((a) => a.kind === 'pod-file')
    assert.match(file()?.protection ?? '', /^tmpfs \(RAM\)/)
    setApproach(s, 'db', 'configmap')
    assert.doesNotMatch(file()?.protection ?? '', /tmpfs na čvoru/)
    assert.match(file()?.protection ?? '', /disku čvora.*nije tmpfs/)
  })

  it('rewrite: false says „written before encryption”, not „not on the list”', () => {
    const s = createAccessPreset('l16')
    setEncryption(s, 'secretbox', { rewrite: false })
    assert.match(assetsOf(s).find((a) => a.kind === 'etcd')?.protection ?? '', /prije uključivanja šifriranja/)
    const c = createAccessPreset('l16')
    setApproach(c, 'db', 'configmap')
    setEncryption(c, 'secretbox', { scope: 'secrets+configmaps', rewrite: false })
    assert.match(verdictOf(c, 'etcd-backup-thief').paths[0].text, /prije uključivanja šifriranja/)
    const o = createAccessPreset('l16')
    setApproach(o, 'db', 'configmap')
    setEncryption(o, 'secretbox') // scope `secrets`: ConfigMaps really are not listed
    assert.match(verdictOf(o, 'etcd-backup-thief').paths[0].text, /ne obuhvaća ovu vrstu objekta/)
    assert.match(assetsOf(o).find((a) => a.kind === 'etcd')?.protection ?? '', /nije na popisu/)
  })
})

describe('review: ESO refreshInterval 0 and spec changes', () => {
  it('0 = sync once: a rotation stalls until force-sync', () => {
    const s = createAccessPreset('l23', { whatIf: true })
    setApproach(s, 'all', 'eso')
    assert.equal(setEsoRefreshInterval(s, 0), 0)
    assert.equal(s.secrets[1].nextRefresh, Infinity)
    rotateAt(s, 5, 'sms')
    step(s, 600)
    const r = rotationStatus(s, 'sms')
    assert.equal(r.phase, 'waiting-delivery')
    assert.match(r.stalled ?? '', /refreshInterval: 0/)
    assert.equal(r.waiting, 'blocked')
    assert.equal(rings(s).eso.sms.nextInS, null)
    forceEsoSync(s, 'sms')
    step(s, 15)
    assert.equal(rotationStatus(s, 'sms').phase, 'done')
    assert.equal(resolveConfig({ timing: { esoRefresh: 0 } }).timing.esoRefresh, 0)
  })
})

describe('review: Argo CD Redis keeps rendered values after a change of tool', () => {
  it('migrating a plain Secret to SealedSecret leaves v1 in Redis until rotation; rebuild clears the cache', () => {
    const s = createAccessPreset('l23')
    step(s, 30)
    setApproach(s, 'sms', 'sealed')
    step(s, 30)
    const v = verdictOf(s, 'argocd-redis', 'sms')
    assert.equal(v.reads, true)
    assert.deepEqual(v.paths[0].versions, [1])
    assert.match(v.paths[0].text, /ranije generirao/)
    rotateSecret(s, 'sms')
    step(s, 60)
    assert.equal(rotationStatus(s, 'sms').phase, 'done')
    assert.equal(verdictOf(s, 'argocd-redis', 'sms').level, 'stale')
    const r = createAccessPreset('l23')
    setApproach(r, 'sms', 'sealed')
    rebuildCluster(r)
    assert.equal(verdictOf(r, 'argocd-redis', 'sms').reads, false)
  })

  it('old renders expire after argoCacheExpiry (12 min sim · stvarno 24 h)', () => {
    const s = createAccessPreset('l23', { timing: { argoCacheExpiry: 50 } })
    setApproach(s, 'sms', 'eso')
    step(s, 49)
    assert.equal(verdictOf(s, 'argocd-redis', 'sms').reads, true)
    step(s, 2)
    assert.equal(verdictOf(s, 'argocd-redis', 'sms').reads, false)
    // the current plain Secret is re-rendered at every poll, so it never expires
    const p = createAccessPreset('l23', { timing: { argoCacheExpiry: 50 } })
    step(p, 200)
    assert.equal(verdictOf(p, 'argocd-redis', 'sms').reads, true)
  })
})

describe('review: scale to 0 and back during a rotation is a restart', () => {
  it('counts the removed Running Pods; the goal stays unmet', () => {
    const s = createAccessPreset('l16')
    rotateAt(s, 5)
    step(s, 5)
    setReplicas(s, 'api', 0)
    step(s, 2)
    setReplicas(s, 'api', 2)
    step(s, 5)
    const r = rotationStatus(s)
    assert.equal(r.phase, 'done')
    assert.equal(r.record?.restartsDuring, 2)
    assert.equal(l16Goals(s).rotateWithoutRestart, false)
  })
})

describe('review: Argo CD automated sync is a stated setting', () => {
  it('autoSync off: a poll only reports OutOfSync; Sync applies; the rotation waits on „manual-sync” (×1)', () => {
    const s = createAccessPreset('l23', { whatIf: true, argo: { autoSync: false } })
    assert.equal(s.config.argo.autoSync, false)
    assert.equal(createAccessPreset('l23').config.argo.autoSync, true)
    rotateAt(s, 5, 'sms')
    step(s, 60)
    assert.equal(rotationStatus(s, 'sms').phase, 'waiting-delivery')
    assert.equal(rotationStatus(s, 'sms').waiting, 'manual-sync')
    assert.equal(s.events.filter((e) => /OutOfSync/.test(e.text)).length, 1) // reported once per commit
    assert.match(rotationEstimate(s, 'sms').needs.join(), /Sync u Argo CD-u/)
    argoSyncNow(s)
    step(s, 15)
    assert.equal(rotationStatus(s, 'sms').phase, 'done')
    assert.equal(rotationStatus(s, 'sms').record?.waits['manual-sync'], 60)
    setArgoAutoSync(s, true)
    assert.match(s.events.at(-1)?.text ?? '', /syncPolicy.automated/)
  })

  it('autoSync off + argocd-vault-plugin: hard refresh renders, Sync applies', () => {
    const s = createAccessPreset('l23', { whatIf: true, argo: { autoSync: false } })
    setApproach(s, 'all', 'avp')
    rotateAt(s, 5, 'sms')
    argoHardRefresh(s)
    assert.equal(s.secrets[1].obj.version, 1)
    assert.equal(verdictOf(s, 'argocd-redis', 'sms').paths[0].versions.includes(2), true) // rendered = cached
    argoSyncNow(s)
    assert.equal(s.secrets[1].obj.version, 2)
  })
})

describe('review: goals have state to check against', () => {
  it('gitExposesValidValue defaults to the focused secret; rotateSecret / gitExposesValidValue accept „all”', () => {
    const s = createAccessPreset('l23')
    setApproach(s, 'all', 'sealed')
    rotateAt(s, 20, 'sms')
    step(s, 60)
    assert.equal(gitExposesValidValue(s), false) // the SMS key – the eyes' secret
    assert.equal(gitExposesValidValue(s, 'all'), true) // the DB password's old commit is still valid
    assert.equal(l23Goals(s).gitGrey, true)
    rotateSecret(s, 'all')
    step(s, 60)
    assert.equal(gitExposesValidValue(s, 'all'), false)
  })

  it('L23 leak goal: a leak, then rotation without new plaintext; deleting the commit is not enough', () => {
    const s = createAccessPreset('l23', { whatIf: true })
    setApproach(s, 'all', 'eso')
    assert.equal(l23Goals(s).leakHandled, false) // no leak yet
    step(s, 3)
    commitPlainSecret(s, 'sms')
    deleteLeakedCommit(s, 'sms')
    step(s, 5)
    assert.equal(l23Goals(s).leakHandled, false)
    assert.equal(s.incidents.leaks[0].closedAt, null)
    rotateSecret(s, 'sms')
    step(s, 60)
    assert.equal(l23Goals(s).leakHandled, true)
    assert.ok((s.incidents.leaks[0].closedAt ?? 0) > 8)
    // with a plain Secret in Git the rotation itself commits the new value: not handled
    const g = createAccessPreset('l23', { whatIf: true })
    commitPlainSecret(g, 'sms')
    rotateAt(g, 5, 'sms')
    step(g, 60)
    assert.equal(l23Goals(g).leakHandled, false)
  })

  it('L23 store outage: ESO survives (a Pod starts during the outage), CSI does not, nothing counts without a new Pod', () => {
    const e = createAccessPreset('l23', { whatIf: true })
    setApproach(e, 'all', 'eso')
    setStoreAvailable(e, false)
    step(e, 10)
    assert.equal(l23Goals(e).survivedStoreOutage, false) // nothing was tested yet
    assert.equal(podSummary(e).failing, 0)
    setConsume(e, 'worker', 'env') // a rollout during the outage
    step(e, 20)
    assert.equal(l23Goals(e).survivedStoreOutage, true)
    assert.equal(rotateSecret(e, 'sms'), false)
    assert.equal(e.incidents.rotationsRefused, 1)
    const c = createAccessPreset('l23', { whatIf: true })
    setApproach(c, 'all', 'csi')
    setStoreAvailable(c, false)
    restartPods(c, 'worker')
    step(c, 20)
    assert.equal(l23Goals(c).survivedStoreOutage, false)
    assert.equal(c.incidents.outages[0].podsBlocked, 1)
    setStoreAvailable(c, true)
    assert.notEqual(c.incidents.outages[0].to, null)
  })

  it('L23 rotate-fast goal needs the new value out of Git', () => {
    const g = createAccessPreset('l23', { whatIf: true })
    rotateAt(g, 20, 'sms')
    step(g, 60)
    const goal = l23Goals(g).rotateFast
    assert.deepEqual([goal.done, goal.plaintextInGit, goal.realElapsed], [false, true, 64.3])
  })

  it('L16 goals: closing every closable eye; rotating with a volume and no restart', () => {
    const s = createAccessPreset('l16')
    assert.equal(l16Goals(s).closeEyes, false)
    setEncryption(s, 'kms-v2')
    setLeastPrivilege(s, true)
    assert.deepEqual(l16Goals(s), { closeEyes: true, red: 2, honestLimitRed: 2, rotateWithoutRestart: false, podCreatorShown: false })
    setConsume(s, 'api', 'volume')
    rotateAt(s, 5)
    step(s, 20)
    assert.equal(l16Goals(s).rotateWithoutRestart, true)
  })
})

describe('review: smooth tokens and flow origin', () => {
  it('tokenSegment interpolates between 0,1 s ticks (≥ 50 distinct positions over 90 frames at 60 fps)', () => {
    const s = createAccessPreset('l16')
    const a = stealControlPlaneDisk(s)
    assert.ok(a)
    const seen = new Set<string>()
    for (let i = 0; i < 90; i++) {
      step(s, 1 / 60)
      const cur = s.attempts.find((x) => x.id === a.id)
      if (!cur) break
      const seg = tokenSegment(s, cur)
      seen.add(`${seg.from}>${seg.to}:${seg.f.toFixed(4)}`)
      assert.ok(seg.f >= 0 && seg.f <= 1 && seg.progress >= 0 && seg.progress <= 1)
    }
    assert.ok(seen.size >= 50, String(seen.size))
    const s2 = createAccessPreset('l16')
    const a2 = stealControlPlaneDisk(s2)
    assert.ok(a2)
    assert.deepEqual(tokenSegment(s2, a2), { from: 'actor', to: 'cp-disk', f: 0, progress: 0 })
  })

  it('flows start at hops[0] and take (hops − 1) × FLOW_HOP', () => {
    const s = createAccessPreset('l23', { whatIf: true })
    setApproach(s, 'all', 'eso')
    rotateAt(s, 1, 'sms')
    forceEsoSync(s, 'sms')
    const f = s.flows.find((x) => x.kind === 'eso')
    assert.ok(f)
    assert.deepEqual(f.hops, ['store', 'controller', 'api'])
    assert.equal(f.duration, 0.8)
    assert.deepEqual(tokenSegment(s, f), { from: 'store', to: 'controller', f: 0, progress: 0 })
    step(s, 0.6)
    const seg = tokenSegment(s, f)
    assert.deepEqual([seg.from, seg.to], ['controller', 'api'])
    assert.equal(f.hopIndex, 2)
  })
})

describe('review: Croatian narration and merged events', () => {
  it('events name the actor as a subject and say HOW; no software versions in event text', () => {
    const s = createAccessPreset('l16')
    setEncryption(s, 'secretbox')
    attempt(s, 'cp-disk-thief')
    attempt(s, 'image-puller')
    attempt(s, 'pod-creator')
    step(s, 3)
    const texts = s.events.filter((e) => e.kind === 'attempt').map((e) => e.text)
    assert.ok(texts.includes('Kradljivac diska upravljačke ravnine čita lozinku baze: ključ za secretbox leži na istom disku.'), texts.join('\n'))
    assert.ok(texts.includes('Svatko tko povuče sliku ne može pročitati lozinku baze: slika ne sadrži vrijednost.'))
    assert.ok(texts.includes('Korisnik koji smije stvarati Podove čita lozinku baze: novi Pod montira Secret klopa-db.'))
    setEncryption(s, 'kms-v2')
    rotateSecret(s)
    assert.ok(s.events.every((e) => !/\b1\.\d\d\b/.test(e.text)))
    assert.ok(s.events.some((e) => e.text === 'Rotacija: lozinka baze dobiva novu vrijednost (v2).'))
    assert.match(PROVIDERS['kms-v2'].versionNote ?? '', /1\.29 \(stanje: listopad 2026\.\)/)
    for (const a of ACTOR_ORDER) assert.ok(ACTORS[a].subject.length > 3)
    for (const ap of [...L16_APPROACHES, ...L23_APPROACHES]) {
      const x = createAccessPreset(L16_APPROACHES.includes(ap) ? 'l16' : 'l23', { whatIf: true })
      setApproach(x, 'all', ap)
      for (const v of evaluateAccess(x).verdicts) for (const p of v.paths) assert.ok(p.short.length > 0 && p.short.length <= 60, `${p.id}: ${p.short}`)
    }
  })

  it('identical events at the same instant are merged („… (×2)”) so (t, text) stays unique', () => {
    const s = createAccessPreset('l16')
    leakEnvToLog(s)
    leakEnvToLog(s)
    attempt(s, 'cp-disk-thief')
    attempt(s, 'cp-disk-thief')
    step(s, 2)
    const keys = s.events.map((e) => `${e.t}-${e.text}`)
    assert.equal(new Set(keys).size, keys.length)
    const leak = s.events.filter((e) => e.kind === 'leak')
    assert.equal(leak.length, 1)
    assert.equal(leak[0].count, 2)
    assert.match(leak[0].text, /\(×2\)$/)
  })
})

describe('review: render helpers', () => {
  it('podView maps a missing Secret to pending/creating – never a crash – and flags stale Pods', () => {
    const s = createAccessPreset('l23', { whatIf: true })
    setApproach(s, 'all', 'sealed')
    setConsume(s, 'api', 'env')
    step(s, 5)
    loseControllerKey(s)
    step(s, 30)
    const v = podView(s, 'db')
    const api = v.filter((p) => p.workloadId === 'api')
    assert.ok(api.every((p) => p.kitStatus === 'pending' && p.label === 'CreateContainerConfigError' && p.statusTone === 'bad'))
    const worker = podView(s, 'sms').filter((p) => p.workloadId === 'worker')
    assert.ok(worker.every((p) => p.kitStatus === 'creating' && p.reason === 'FailedMount'))
    const l = createAccessPreset('l16')
    rotateAt(l, 5)
    const pv = podView(l)
    assert.ok(pv.every((p) => p.kitStatus === 'running' && p.stale && p.statusTone === 'warn' && p.usesVersion === 1))
    restartPods(l)
    step(l, 0.1)
    assert.ok(podView(l).some((p) => p.startProgress !== null && p.startProgress >= 0 && p.startProgress <= 1))
  })

  it('rings: Argo CD poll, ESO refresh, CSI poll and key renewal progress 0..1', () => {
    const s = createAccessPreset('l23', { whatIf: true, csi: { rotation: true } })
    setApproach(s, 'sms', 'eso')
    setApproach(s, 'db', 'csi')
    step(s, 7.35)
    const r = rings(s)
    assert.ok(r.argo && r.argo.progress >= 0 && r.argo.progress <= 1 && (r.argo.nextInS ?? -1) >= 0)
    assert.equal(r.eso.sms.status, 'Ready')
    assert.equal(r.eso.sms.label, '30 s (u YAML-u) · zadano: 1 h')
    assert.ok(r.csi.db && r.csi.db.intervalS === 20)
    assert.equal(r.keyRenewal.keys, 1)
    assert.ok(Math.abs(r.keyRenewal.progress - 7.35 / 60) < 1e-9)
    assert.equal(rings(createAccessPreset('l16')).argo, null)
  })

  it('setActorRules: watch-only reads Secrets; create-pods-only mounts; labels follow the rules', () => {
    const s = createAccessPreset('l16')
    setActorRoles(s, 'view-user', [])
    setActorRules(s, 'view-user', [{ resources: ['secrets'], verbs: ['watch'] }])
    assert.deepEqual(verdictOf(s, 'view-user').paths.map((p) => p.channel), ['api-watch'])
    assert.equal(roleLabel(s, 'view-user'), 'vlastita pravila: watch na secrets')
    assert.equal(actorLabel(s, 'view-user'), 'Uloga vlastita pravila: watch na secrets u Namespaceu')
    setActorRules(s, 'view-user', [{ resources: ['pods'], verbs: ['create'] }], 'samo create na pods')
    assert.deepEqual(verdictOf(s, 'view-user').paths.map((p) => p.channel), ['mount'])
    assert.equal(roleLabel(s, 'view-user'), 'samo create na pods')
    setActorRules(s, 'view-user', [])
    setActorRoles(s, 'view-user', ['view'])
    assert.equal(actorLabel(s, 'view-user'), ACTORS['view-user'].label)
    assert.equal(actorLabel(s, 'pod-creator'), ACTORS['pod-creator'].label)
    setActorRules(s, 'laptop-thief', [{ resources: ['secrets'], verbs: ['get'] }]) // ignored: uses the developer's kubeconfig
    assert.equal(s.customRules['laptop-thief'], undefined)
  })

  it('attempt can follow a chosen route; attemptOptions lists working, revoked and blocked ones', () => {
    const s = createAccessPreset('l16')
    const opts = attemptOptions(s, 'developer')
    assert.deepEqual(opts.filter((o) => o.ok).map((o) => o.channel), ['api-get', 'api-list', 'api-watch', 'mount', 'exec'])
    const a = attempt(s, 'developer', undefined, { channel: 'api-watch' })
    assert.equal(a?.channel, 'api-watch')
    assert.equal(a?.success, true)
    const m = attempt(s, 'developer', undefined, { pathId: 'mount' })
    assert.equal(m?.pathId, 'mount')
    const blocked = attemptOptions(s, 'view-user').find((o) => !o.ok)
    assert.ok(blocked)
    const b = attempt(s, 'view-user', undefined, { pathId: blocked.pathId })
    assert.equal(b?.success, false)
    assert.equal(b?.control, 'rbac')
    assert.equal(attempt(s, 'developer', undefined, { pathId: 'nope' })?.channel, 'api-get') // falls back
    assert.deepEqual(attemptOptions(s, 'developer', 'missing'), [])
  })

  it('setConsume on an env-only approach changes nothing and says so; effectiveConsumeOf reports env', () => {
    const s = createAccessPreset('l16')
    setApproach(s, 'db', 'image')
    const ids = s.pods.map((p) => p.id).join()
    setConsume(s, 'api', 'volume')
    assert.equal(effectiveConsumeOf(s, 'api'), 'env')
    assert.match(s.events.at(-1)?.text ?? '', /uvijek varijabla okruženja/)
    step(s, 10)
    assert.equal(s.pods.map((p) => p.id).join(), ids)
    assert.equal(effectiveConsumeOf(s, 'nope'), 'env')
    setApproach(s, 'db', 'secret')
    assert.equal(effectiveConsumeOf(s, 'api'), 'volume') // the stored choice applies once it can
  })

  it('migration keeps Pods when the template does not change (Secret-backed → Secret-backed); CSI rolls; GitOps animates', () => {
    const s = createAccessPreset('l23')
    const ids = s.pods.map((p) => p.id).join()
    setApproach(s, 'all', 'sealed')
    step(s, 10)
    assert.equal(s.pods.map((p) => p.id).join(), ids)
    assert.ok(s.flows.length === 0 || s.flows.every((f) => f.hops.length >= 2))
    const f = createAccessPreset('l23')
    setApproach(f, 'sms', 'eso')
    assert.deepEqual(f.flows.map((x) => x.kind), ['commit', 'sync', 'eso'])
    setApproach(s, 'all', 'csi')
    step(s, 10)
    assert.notEqual(s.pods.map((p) => p.id).join(), ids)
    assert.ok(s.pods.every((p) => p.status === 'Running'))
  })

  it('deleteLeakedCommit removes only leaked commits by default; never the commit HEAD deploys', () => {
    const s = createAccessPreset('l23')
    commitPlainSecret(s, 'sms')
    assert.equal(deleteLeakedCommit(s, 'sms'), 1)
    assert.deepEqual(gitLog(s, 'sms').map((c) => [c.leak, c.removedFromBranch]), [[true, true], [false, false]])
    assert.equal(deleteLeakedCommit(s, 'sms', { allPlain: true }), 0) // the only other commit is HEAD
    setApproach(s, 'sms', 'sealed')
    assert.equal(deleteLeakedCommit(s, 'sms', { allPlain: true }), 1) // the old plain Secret, no longer HEAD
    assert.equal(verdictOf(s, 'git-reader', 'sms').reads, true) // clones keep it
  })

  it('asset cards: visibleReaders hides actors the lecture does not show', () => {
    const s = createAccessPreset('l16')
    const etcd = assetsOf(s).find((a) => a.kind === 'etcd')
    assert.ok(etcd?.readers.includes('laptop-thief'))
    assert.ok(!etcd?.visibleReaders.includes('laptop-thief'))
    assert.deepEqual(etcd?.visibleReaders, etcd?.readers.filter((a) => L16_ACTORS.includes(a)))
  })

  it('rotation marks carry the Deployment and consumption (timeline lanes survive Pod replacement)', () => {
    const s = createAccessPreset('l16-timeline')
    rotateAt(s, 5)
    step(s, 15)
    restartPods(s, 'env')
    step(s, 10)
    const podMarks = s.marks.filter((m) => m.podId !== null)
    assert.ok(podMarks.length > 0)
    for (const m of podMarks) assert.ok(m.workloadId !== null && m.consume !== null)
    assert.ok(podMarks.some((m) => m.workloadId === 'env' && m.consume === 'env' && m.kind === 'pod-started'))
    assert.ok(podMarks.some((m) => m.workloadId === 'volume' && m.consume === 'volume' && m.kind === 'app'))
    assert.ok(s.marks.filter((m) => m.podId === null).every((m) => m.workloadId === null && m.consume === null))
  })

  it('exposure: the Git eye is exposed from the leak until the rotation revokes the value', () => {
    const s = createAccessPreset('l16', { leastPrivilege: true })
    setConsume(s, 'api', 'volume')
    step(s, 3)
    commitPlainSecret(s)
    step(s, 10)
    rotateSecret(s)
    step(s, 20)
    const git = exposure(s).filter((w) => w.actorId === 'git-reader')
    assert.equal(git.length, 1)
    assert.equal(git[0].from, 4) // first sample after the commit at t = 3
    assert.ok(git[0].to !== null && git[0].to > 13 && git[0].to <= 24)
    assert.deepEqual(git[0].versions, [1])
    assert.ok(exposure(s).some((w) => w.actorId === 'pod-creator' && w.to === null)) // honest limit: still open
    assert.ok(exposure(s, 'db', false).length >= exposure(s).length)
  })

  it('compareApproaches: one row per approach, no former team member in any row', () => {
    const c = compareApproaches(L23_APPROACHES)
    assert.deepEqual(Object.keys(c), [...L23_APPROACHES])
    for (const ap of L23_APPROACHES) {
      assert.ok(!c[ap]?.plaintext.includes('memory'), ap)
      assert.ok(!c[ap]?.red.includes('ex-employee'), ap)
      assert.deepEqual(c[ap]?.honestLimit, ['pod-creator', 'compromised-pod'])
    }
    assert.deepEqual(c.csi?.plaintext, ['pod-file'])
    assert.deepEqual(c.sealed?.plaintext, ['etcd', 'pod-file'])
    assert.deepEqual(c['git-secret']?.plaintext, ['git-base64', 'redis', 'etcd', 'pod-file'])
    assert.deepEqual(compareApproaches(['bogus' as Approach]), {})
  })
})

/* ======================================================================
 * Second review – one regression test per confirmed finding
 * ==================================================================== */

describe('review 2: a rotation completes only on a running consumer', () => {
  it('lost key → Pods stuck → rotate: no „svi Podovi koriste v2” and no revocation until a consumer runs on v2; the goal counts', () => {
    const s = createAccessPreset('l23', { whatIf: true })
    setApproach(s, 'all', 'sealed')
    step(s, 20)
    loseControllerKey(s)
    step(s, 5)
    assert.ok(s.pods.every((p) => p.reason === 'FailedMount'), podStates(s).join(' '))
    rotateSecret(s, 'sms')
    let deliveredWhileStuck = false
    for (let i = 0; i < 400; i++) {
      step(s, 0.1)
      const r = rotationStatus(s, 'sms')
      const runningWorker = s.pods.some((p) => p.workloadId === 'worker' && p.status === 'Running')
      if (r.phase === 'propagating' && !runningWorker) {
        deliveredWhileStuck = true
        assert.equal(s.secrets[1].versions[0].revokedAt, null) // v1 not revoked while nothing runs on v2
        assert.ok(r.waiting === 'kubelet' || r.waiting === 'pod-start' || r.waiting === 'blocked', String(r.waiting))
      }
      if (r.phase === 'done') assert.ok(runningWorker)
    }
    assert.ok(deliveredWhileStuck)
    const r = rotationStatus(s, 'sms')
    assert.equal(r.phase, 'done')
    assert.equal(r.record?.consumersAtCompletion, 1)
    assert.ok(s.events.some((e) => e.text.startsWith('klopa-sms: rotacija je završena') && /svi Podovi koriste v2/.test(e.text)))
    // seed 42: Argo CD 16,2 s ×10 + unseal 1 s + kubelet retry 4,1 s ×9 + Pod start 3 s = 24,3 s (sim) ≈ 202,9 s
    assert.deepEqual([r.elapsed, r.realElapsed], [24.3, 202.9])
    assert.deepEqual(r.record?.waits, { 'argo-poll': 16.2, unseal: 1, kubelet: 4.1, 'pod-start': 3 })
    assert.ok(r.realElapsed <= ROTATION_GOAL_REAL_S)
    assert.equal(l23Goals(s).rotateFast.done, true)
  })

  it('zero replicas: completes at once, but says that no Pod uses the value', () => {
    const s = createAccessPreset('l16')
    setReplicas(s, 'api', 0)
    step(s, 2)
    rotateSecret(s)
    assert.equal(rotationStatus(s).phase, 'done')
    assert.equal(rotationStatus(s).record?.consumersAtCompletion, 0)
    assert.ok(s.events.some((e) => /nijedan Pod trenutačno ne koristi vrijednost \(v2\)/.test(e.text)))
    assert.ok(!s.events.some((e) => /svi Podovi/.test(e.text)))
    assert.equal(l16Goals(s).rotateWithoutRestart, false)
  })
})

describe('review 2: the Sealed Secrets keys live in etcd too', () => {
  it('an etcd copy without encryption carries the sealing key: Git turns red until the key is renewed and the value rotated', () => {
    const s = createAccessPreset('l23', { whatIf: true, sealed: { autoRenew: false } })
    setApproach(s, 'all', 'sealed')
    const path = verdictOf(s, 'etcd-backup-thief', 'sms').paths.find((p) => p.id === 'etcd:sealing-key')
    assert.ok(path)
    assert.deepEqual(path.assets, ['git-sealed'])
    assert.equal(verdictOf(s, 'git-reader', 'sms').reads, false)
    stealEtcdBackup(s, 'sms')
    step(s, 2)
    assert.deepEqual(s.leakedKeyIds, ['k1'])
    assert.ok(s.events.some((e) => e.kind === 'leak' && /ključem k1 sada su čitljivi/.test(e.text)))
    // encryption, least privilege and a rotation do not help: v2 is sealed with the stolen key
    setEncryption(s, 'kms-v2')
    setLeastPrivilege(s, true)
    rotateSecret(s, 'sms')
    step(s, 40)
    assert.equal(rotationStatus(s, 'sms').phase, 'done')
    assert.match(rotationStatus(s, 'sms').warning ?? '', /procurio/)
    assert.deepEqual(verdictOf(s, 'git-reader', 'sms').paths[0].versions, [2])
    assert.equal(l23Goals(s).gitGrey, false)
    renewSealingKey(s)
    rotateSecret(s, 'sms')
    step(s, 40)
    assert.equal(l23Goals(s).gitGrey, true)
    assert.deepEqual(red(s, 'sms'), ['compromised-pod', 'pod-creator'])
  })

  it('which copy holds the keys readable: KMS v2 none; a local key only for the disk thief; rewrite: false leaves them plaintext', () => {
    const k = createAccessPreset('l23', { whatIf: true })
    setApproach(k, 'all', 'sealed')
    setEncryption(k, 'kms-v2')
    stealEtcdBackup(k, 'sms')
    stealControlPlaneDisk(k, 'sms')
    step(k, 3)
    assert.deepEqual(k.leakedKeyIds, [])
    const l = createAccessPreset('l23', { whatIf: true })
    setApproach(l, 'all', 'sealed')
    setEncryption(l, 'secretbox')
    assert.equal(verdictOf(l, 'etcd-backup-thief', 'sms').paths.some((p) => p.id === 'etcd:sealing-key'), false)
    assert.equal(verdictOf(l, 'cp-disk-thief', 'sms').paths.some((p) => p.id === 'disk:sealing-key'), true)
    const n = createAccessPreset('l23', { whatIf: true })
    setApproach(n, 'all', 'sealed')
    setEncryption(n, 'secretbox', { rewrite: false })
    rotateSecret(n, 'sms')
    step(n, 40) // the new Secret is written encrypted, the key Secret was written before encryption
    const backup = verdictOf(n, 'etcd-backup-thief', 'sms')
    assert.deepEqual(backup.paths.map((p) => p.id), ['etcd:sealing-key'])
    // without Sealed Secrets there is no controller key to steal
    const g = createAccessPreset('l23', { whatIf: true })
    stealEtcdBackup(g, 'sms')
    step(g, 2)
    assert.deepEqual(g.leakedKeyIds, [])
  })
})

describe('review 2: a leaked-key warning is not a stall', () => {
  it('sealing with a leaked key keeps the real Argo CD timing; stalled is cleared on completion', () => {
    const s = createAccessPreset('l23', { whatIf: true })
    setApproach(s, 'all', 'sealed')
    leakControllerKey(s)
    rotateAt(s, 20, 'sms')
    assert.equal(rotationStatus(s, 'sms').waiting, 'argo-poll')
    assert.equal(rotationStatus(s, 'sms').stalled, null)
    step(s, 40)
    const r = rotationStatus(s, 'sms')
    assert.equal(r.phase, 'done')
    assert.equal(r.realElapsed, 56.3) // same as without the leak
    assert.deepEqual(r.record?.waits, { 'argo-poll': 4, unseal: 1, kubelet: 1.7 })
    assert.equal(r.stalled, null)
    assert.match(r.warning ?? '', /zapečaćeno ključem k1 koji je procurio/)
  })
})

describe('review 2: argocd-vault-plugin regenerates at cache expiry', () => {
  it('a store change reaches the cluster after the 24 h cache expires (re-weighted ×120); a hard refresh stays fast', () => {
    const s = createAccessPreset('l23')
    setApproach(s, 'all', 'avp')
    rotateSecret(s, 'sms')
    step(s, 300)
    assert.equal(rotationStatus(s, 'sms').waiting, 'argo-cache')
    step(s, 500)
    const r = rotationStatus(s, 'sms')
    assert.equal(r.phase, 'done')
    assert.ok(r.elapsed > TIMING.argoCacheExpiry.sim && r.elapsed <= TIMING.argoCacheExpiry.sim + 18 + 10, String(r.elapsed))
    assert.ok(r.realElapsed > 24 * 3600, String(r.realElapsed))
    assert.deepEqual([r.elapsed, r.realElapsed, r.label], [736.7, 87371.7, '736,7 s (sim) ≈ 24 h 16 min stvarno']) // seed 42
    assert.equal(l23Goals(s).rotateFast.done, false)
    const h = createAccessPreset('l23')
    setApproach(h, 'all', 'avp')
    rotateAt(h, 3, 'sms')
    step(h, 3)
    argoHardRefresh(h)
    step(h, 15)
    assert.equal(rotationStatus(h, 'sms').phase, 'done')
    assert.ok(rotationStatus(h, 'sms').realElapsed < ROTATION_GOAL_REAL_S)
    assert.equal(l23Goals(h).rotateFast.done, true)
    // rotate at t = 20 and hard-refresh at once (seed 42, explorer mode): 6,7 s (sim) ≈ 60,3 s – only the kubelet sync
    const n = createAccessPreset('l23', { whatIf: true })
    setApproach(n, 'all', 'avp')
    rotateAt(n, 20, 'sms')
    argoHardRefresh(n)
    step(n, 30)
    assert.deepEqual([rotationStatus(n, 'sms').elapsed, rotationStatus(n, 'sms').realElapsed], [6.7, 60.3])
  })

  it('store down at expiry: one ComparisonError, no new manifest; the next poll after recovery regenerates', () => {
    const s = createAccessPreset('l23', { timing: { argoCacheExpiry: 50 } })
    setApproach(s, 'all', 'avp')
    rotateSecret(s, 'sms')
    step(s, 1)
    setStoreAvailable(s, false)
    step(s, 120)
    assert.equal(rotationStatus(s, 'sms').phase, 'waiting-delivery')
    assert.equal(rotationStatus(s, 'sms').waiting, 'blocked')
    assert.equal(s.events.filter((e) => /ComparisonError/.test(e.text) && e.secretId === 'sms').length, 1)
    setStoreAvailable(s, true)
    step(s, 40)
    assert.equal(rotationStatus(s, 'sms').phase, 'done')
  })
})

describe('review 2: RBAC texts and options', () => {
  it('watch-only: the raw watch API (kubectl get --watch would list first); it starts with every existing object', () => {
    const s = createAccessPreset('l16')
    setActorRoles(s, 'view-user', [])
    setActorRules(s, 'view-user', [{ resources: ['secrets'], verbs: ['watch'] }])
    const p = verdictOf(s, 'view-user').paths[0]
    assert.equal(p.action, 'kubectl get --raw "/api/v1/namespaces/klopa/secrets?watch=1"')
    assert.match(p.text, /ADDED/)
    assert.equal(can(s, 'view-user', 'list', 'secrets'), false)
  })

  it('attemptOptions: one 403 per denied verb with action and outcome; a chosen channel animates its own command', () => {
    const s = createAccessPreset('l16')
    const opts = attemptOptions(s, 'view-user')
    assert.deepEqual(opts.map((o) => o.channel), ['api-get', 'api-list', 'api-watch', 'mount', 'exec'])
    assert.ok(opts.every((o) => !o.ok && o.outcome === 'RBAC: 403 Forbidden' && o.label === `${o.action} → ${o.outcome}`))
    assert.equal(opts[1].action, 'kubectl get secrets -o yaml')
    const a = attempt(s, 'view-user', 'db', { channel: 'api-list' })
    assert.deepEqual(a?.steps, ['kubectl get secrets -o yaml'])
    setActorRoles(s, 'view-user', [])
    setActorRules(s, 'view-user', [{ resources: ['secrets'], verbs: ['watch'] }])
    const mixed = attemptOptions(s, 'view-user')
    assert.deepEqual(mixed.filter((o) => o.ok).map((o) => o.channel), ['api-watch'])
    assert.ok(mixed.some((o) => o.channel === 'api-list' && !o.ok))
    assert.match(mixed[0].outcome, /^čita v1$/)
    // tryVerb: one permission at a time; a permission that leads nowhere fails, never another route
    assert.equal(tryVerb(s, 'view-user', 'list', 'secrets')?.success, false)
    assert.equal(tryVerb(s, 'view-user', 'watch', 'secrets')?.success, true)
    const none = tryVerb(s, 'developer', 'delete', 'secrets')
    assert.equal(none?.success, false)
    assert.equal(none?.pathId, 'none')
  })

  it('the Pod creator exfiltrates from its own Pod: the deployer role has neither pods/log nor pods/exec', () => {
    const s = createAccessPreset('l16')
    const p = verdictOf(s, 'pod-creator').paths[0]
    assert.equal(p.channel, 'mount')
    assert.doesNotMatch(p.steps.join(' '), /ispiše/)
    assert.match(p.text, /ni get na secrets ni pods\/log nisu potrebni/)
    assert.equal(can(s, 'pod-creator', 'get', 'pods/log'), false)
    assert.equal(can(s, 'pod-creator', 'create', 'pods/exec'), false)
  })
})

describe('review 2: the compromised Pod', () => {
  it('is worded and attributed by where a usable value is (env holds only the revoked v1 after rotate + revoke)', () => {
    const s = createAccessPreset('l16-timeline')
    step(s, 5)
    rotateSecret(s)
    step(s, 15)
    revokeOld(s)
    const v = verdictOf(s, 'compromised-pod')
    assert.deepEqual(v.paths[0].versions, [2])
    assert.match(v.paths[0].text, /čita montiranu datoteku/)
    assert.deepEqual(v.paths[0].assets, ['pod-file'])
    const env = assetsOf(s).find((a) => a.kind === 'pod-env')
    assert.equal(env?.valid, false)
    assert.deepEqual(env?.readers, []) // a revoked copy is not „read”
    const both = createAccessPreset('l16-timeline')
    assert.match(verdictOf(both, 'compromised-pod').paths[0].text, /varijable okruženja i montiranu datoteku/)
  })

  it('its ServiceAccount token is an API identity: over-privileged = closable red; default = 403s only', () => {
    const s = createAccessPreset('l23')
    const d = verdictOf(s, 'compromised-pod', 'sms')
    assert.deepEqual(d.paths.map((p) => p.id), ['pod-inside'])
    assert.equal(d.honestLimit, true)
    assert.ok(d.blocked.some((b) => /ServiceAccount aplikacije \(bez uloge\) nema list na secrets/.test(b.reason)))
    setServiceAccountRules(s, [{ resources: ['secrets'], verbs: ['list'] }])
    setReplicas(s, 'api', 0)
    step(s, 3)
    assert.equal(can(s, 'compromised-pod', 'list', 'secrets'), true)
    const v = verdictOf(s, 'compromised-pod', 'db') // no klopa-api Pod runs, but the worker's token lists Secrets
    assert.equal(v.reads, true)
    assert.deepEqual(v.paths.map((p) => p.id), ['sa:api-list:secrets'])
    assert.equal(v.honestLimit, false)
    setServiceAccountRules(s, [])
    assert.equal(verdictOf(s, 'compromised-pod', 'db').reads, false)
  })
})

describe('review 2: migrating to a store while it is down', () => {
  it('ESO cannot sync: SecretSyncedError, nothing written; Pods on the leftover Secret do not „survive” the outage', () => {
    const s = createAccessPreset('l23')
    step(s, 5)
    setStoreAvailable(s, false)
    const res = setApproach(s, 'all', 'eso')
    assert.equal(res.applied, true)
    assert.match(res.reason ?? '', /SecretSyncedError/)
    const sms = s.secrets[1]
    assert.equal(sms.esoStatus, 'SecretSyncedError')
    assert.equal(sms.storeVersion, null)
    assert.equal(sms.lastSyncedAt, null)
    restartPods(s)
    step(s, 15)
    assert.ok(s.pods.every((p) => p.status === 'Running')) // the old plain Secret still exists (no prune)
    assert.equal(l23Goals(s).survivedStoreOutage, false)
    assert.ok(!s.events.some((e) => /zadržava zadnju sinkroniziranu vrijednost/.test(e.text)))
    assert.match(storeOutageStatus(s).next ?? '', /nikad nije stigla iz trezora/)
    setStoreAvailable(s, true)
    assert.equal(sms.storeVersion, 1) // written to the store now
    step(s, 35)
    assert.notEqual(sms.lastSyncedAt, null)
    setStoreAvailable(s, false)
    restartPods(s)
    step(s, 15)
    assert.equal(l23Goals(s).survivedStoreOutage, true)
    assert.equal(storeOutageStatus(s).next, null)
  })

  it('argocd-vault-plugin cannot render: no Redis entry from the store; the next poll after recovery renders', () => {
    const s = createAccessPreset('l23')
    step(s, 5)
    setStoreAvailable(s, false)
    setApproach(s, 'all', 'avp')
    assert.equal(s.secrets[1].avpRendered, null)
    assert.ok(!verdictOf(s, 'argocd-redis', 'sms').paths.some((p) => p.id === 'redis:avp'))
    assert.ok(!s.flows.some((f) => f.hops[0] === 'store'))
    setStoreAvailable(s, true)
    step(s, 20)
    assert.equal(s.secrets[1].avpRendered, 1)
    assert.ok(verdictOf(s, 'argocd-redis', 'sms').paths.some((p) => p.id === 'redis:avp'))
  })

  it('explorer mode keeps „as if it had always been so”: synced before the outage', () => {
    const e = createAccessPreset('l23', { whatIf: true })
    setStoreAvailable(e, false)
    assert.equal(setApproach(e, 'all', 'eso').reason, null)
    assert.equal(e.secrets[1].storeVersion, 1)
  })
})

describe('review 2: goals', () => {
  it('l23 starts with the hook\'s leaked commit: reacting correctly (move out of Git + rotate) ticks the leak goal', () => {
    const s = createAccessPreset('l23')
    assert.equal(l23Goals(s).leaks, 1)
    assert.deepEqual(s.incidents.leaks.map((l) => [l.secretId, l.initial]), [['db', true], ['sms', true]])
    assert.equal(deleteLeakedCommit(s, 'sms'), 0) // it is HEAD: the app's configuration
    assert.match(s.events.at(-1)?.text ?? '', /trenutačna konfiguracija \(HEAD\)/)
    setApproach(s, 'all', 'sealed')
    assert.equal(deleteLeakedCommit(s, 'sms'), 1) // now it is history
    rotateSecret(s, 'all')
    step(s, 40)
    assert.equal(l23Goals(s).leakHandled, true)
    assert.equal(l23Goals(s, { secretId: 'db' }).leakHandled, true)
    const w = createAccessPreset('l23', { whatIf: true })
    setApproach(w, 'all', 'sealed')
    assert.equal(l23Goals(w).leaks, 0) // explorer mode: the history (and its leak) is gone
  })

  it('event goals are latched and tied to the goal secret, not to the focus', () => {
    const s = createAccessPreset('l23')
    setApproach(s, 'all', 'sealed')
    rotateSecret(s, 'sms')
    step(s, 40)
    assert.equal(l23Goals(s).rotateFast.done, true)
    const at = achievedAt(s, 'rotateFast', 'sms')
    assert.ok(at !== null && at > 0)
    commitPlainSecret(s, 'sms')
    assert.equal(l23Goals(s).rotateFast.done, true) // latched
    assert.equal(l23Goals(s).gitGrey, false) // live
    assert.equal(versionInGit(s, 'sms', 2), true)
    setFocus(s, 'db')
    assert.equal(l23Goals(s).rotateFast.done, true) // still the SMS key
    assert.equal(l23Goals(s, { secretId: 'db' }).rotateFast.done, false)
  })

  it('„Objasnite zašto oko „smije stvarati Podove” ostaje crveno”: the Pod creator mounts while only honest limits are red', () => {
    const s = createAccessPreset('l16')
    attempt(s, 'pod-creator')
    step(s, 3)
    assert.equal(l16Goals(s).podCreatorShown, false) // other eyes still red
    setEncryption(s, 'kms-v2')
    setLeastPrivilege(s, true)
    attempt(s, 'pod-creator')
    step(s, 3)
    assert.equal(l16Goals(s).podCreatorShown, true)
    assert.deepEqual(s.attemptLog.map((x) => [x.actorId, x.channel, x.success]), [['pod-creator', 'mount', true], ['pod-creator', 'mount', true]])
  })
})

describe('review 2: attempts and tokens', () => {
  it('an attempt is judged when it arrives: KMS v2 turned on mid-flight stops the theft; „launch” keeps the snapshot', () => {
    const s = createAccessPreset('l16')
    const a = stealControlPlaneDisk(s)
    assert.equal(a?.success, true) // preliminary
    setEncryption(s, 'kms-v2')
    step(s, 2)
    assert.equal(a?.success, false)
    assert.equal(a?.changedOnArrival, true)
    assert.ok(a?.decidedAt !== null)
    const ev = s.events.filter((e) => e.kind === 'attempt')
    assert.deepEqual(ev.map((e) => e.tone), ['ok'])
    const l = createAccessPreset('l16')
    attempt(l, 'cp-disk-thief', 'db', { resolve: 'launch' })
    setEncryption(l, 'kms-v2')
    step(l, 2)
    assert.match(l.events.filter((e) => e.kind === 'attempt')[0].text, /čita lozinku baze: .*\(stanje u 0 s\)\.$/)
  })

  it('setAnimationScale keeps tokens at a constant wall-clock pace (model outcomes unchanged)', () => {
    const s = createAccessPreset('l23', { whatIf: true })
    setAnimationScale(s, 4)
    setAnimationScale(s, NaN)
    setAnimationScale(s, -1)
    assert.equal(s.animScale, 4)
    const a = stealEtcdBackup(s, 'sms')
    assert.equal(a?.hopDur, TIMING.attemptHop.sim * 4)
    assert.equal(a?.linger, 1.5 * 4)
    setApproach(s, 'all', 'eso')
    rotateAt(s, 1, 'sms')
    forceEsoSync(s, 'sms')
    const f = s.flows.find((x) => x.kind === 'eso')
    assert.equal(f?.duration, 0.8 * 4)
    step(s, 3)
    assert.ok(s.flows.some((x) => x.id === f?.id)) // still on screen at 4× (0,75 s of wall clock so far)
    setAnimationScale(s, 1000)
    assert.equal(s.animScale, 64)
    // the rotation timing is the same at any animation scale
    const b = createAccessPreset('l23', { whatIf: true })
    setAnimationScale(b, 8)
    setApproach(b, 'all', 'sealed')
    rotateAt(b, 20, 'sms')
    step(b, 40)
    assert.equal(rotationStatus(b, 'sms').realElapsed, 56.3)
  })

  it('pipeline tokens for the store write and for plaintext landing in Argo CD\'s cache', () => {
    const s = createAccessPreset('l23')
    step(s, 1)
    setApproach(s, 'all', 'avp')
    assert.ok(s.flows.some((f) => f.kind === 'cache' && f.hops.join() === 'argocd,redis'))
    rotateSecret(s, 'sms')
    assert.ok(s.flows.some((f) => f.kind === 'store-write' && f.hops.join() === 'laptop,store'))
    const fresh = createAccessPreset('l23')
    assert.equal(fresh.flows.length, 0) // the initial state does not animate
  })
})

describe('review 2: narration and helpers', () => {
  it('key renewals update one row; per-secret texts never merge across secrets', () => {
    const s = createAccessPreset('l23')
    setApproach(s, 'all', 'sealed')
    rotateSecret(s, 'all')
    step(s, 600)
    assert.equal(s.events.filter((e) => e.group === 'key-renewal').length, 1)
    assert.match(s.events.find((e) => e.group === 'key-renewal')?.text ?? '', /^Kontroler ima 11 ključeva za pečaćenje/)
    assert.ok(s.events.some((e) => /^klopa-sms: rotacija je završena/.test(e.text)))
    assert.ok(!s.events.some((e) => /\(×2\)/.test(e.text) && e.kind !== 'attempt'), s.events.map((e) => e.text).join('\n'))
  })

  it('turning on „aplikacija ponovno čita datoteku” picks up a file that already changed', () => {
    const s = createAccessPreset('l16', { appRereadsFiles: false })
    setConsume(s, 'api', 'volume')
    rotateSecret(s)
    step(s, 12)
    assert.equal(rotationStatus(s).phase, 'propagating')
    setAppRereads(s, true)
    step(s, 0.1)
    assert.equal(rotationStatus(s).phase, 'done')
    assert.equal(rotationStatus(s).record?.restartsDuring, 0)
  })

  it('consumeLocked, version tones (v1 blue, v2 violet, revoked rose), encryption scope, Sealed Secrets scopes', () => {
    const s = createAccessPreset('l16')
    assert.deepEqual(consumeLocked(s, 'api'), { locked: false, reason: null })
    setApproach(s, 'db', 'manifest-env')
    assert.equal(consumeLocked(s, 'api').locked, true)
    const t = createAccessPreset('l16')
    assert.ok(podView(t).every((p) => p.versionTone === 'blue'))
    rotateSecret(t)
    revokeOld(t)
    assert.ok(podView(t).every((p) => p.versionTone === 'rose' && p.statusTone === 'bad'))
    restartPods(t)
    step(t, 10)
    assert.ok(podView(t).every((p) => p.versionTone === 'violet'))
    const c = createAccessPreset('l16')
    setApproach(c, 'db', 'configmap')
    setEncryption(c, 'kms-v2')
    assert.deepEqual(encryptionScopeInfo(c), { provider: 'kms-v2', scope: 'secrets', label: 'Šifriraju se samo Secreti', uncoveredKinds: ['ConfigMap', 'Deployment'] })
    setEncryption(c, 'kms-v2', { scope: 'all' })
    assert.deepEqual(encryptionScopeInfo(c).uncoveredKinds, [])
    assert.deepEqual(Object.keys(SEALED_SCOPES), ['strict', 'namespace-wide', 'cluster-wide'])
  })
})
