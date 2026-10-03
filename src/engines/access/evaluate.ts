/**
 * E5 „Tko vidi?” – deterministic evaluation: for the current state, which actor can read which secret, and HOW.
 * Pure: never mutates state. Rules follow docs/curriculum.json L16/L23 flagshipSimulation.model and tech-facts §4
 * (see README.md „Model” for the deliberate refinements).
 */
import { ACTOR_ORDER, APPROACHES, PROVIDERS } from './constants.ts'
import { toBase64 } from './base64.ts'
import {
  can,
  effectiveProvider,
  findSecret,
  isUsable,
  keysReadableFrom,
  objKindFor,
  resourceOf,
  roleLabel,
  rulesAllow,
  rulesFor,
  runningConsumers,
  uniqSorted,
  versionOf,
} from './shared.ts'
import type {
  AccessPath,
  AccessReport,
  AccessState,
  ActorId,
  AppPod,
  AssetKind,
  BlockedAttempt,
  Channel,
  ControlId,
  GitCommit,
  GraphNodeId,
  PolicyRule,
  SecretRuntime,
  Verdict,
} from './types.ts'

interface Raw {
  paths: AccessPath[]
  blocked: BlockedAttempt[]
  applicable: boolean
}

function emptyRaw(): Raw {
  return { paths: [], blocked: [], applicable: true }
}

function mkPath(
  id: string,
  channel: Channel,
  hops: GraphNodeId[],
  steps: string[],
  text: string,
  short: string,
  versions: number[],
  honestLimit = false,
  evidence?: string,
  action?: string,
): AccessPath {
  const p: AccessPath = { id, channel, assets: [], hops, steps, text, short, action: action ?? steps.join(' → '), versions: uniqSorted(versions), honestLimit }
  if (evidence !== undefined) p.evidence = evidence
  return p
}

function mkBlocked(channel: Channel, hops: GraphNodeId[], steps: string[], blockedAt: number, reason: string, control: ControlId, action?: string): BlockedAttempt {
  const at = Math.max(0, Math.min(blockedAt, hops.length - 1))
  return { channel, hops, steps, blockedAt: at, reason, control, action: action ?? steps.slice(0, at + 1).join(' → ') }
}

function valueOf(s: SecretRuntime, v: number): string {
  return versionOf(s, v)?.value ?? ''
}

/** newest usable version among vs (for evidence strings), else newest */
function bestVersion(s: SecretRuntime, vs: number[]): number | null {
  const usable = vs.filter((v) => isUsable(s, v))
  const pool = usable.length ? usable : vs
  return pool.length ? pool[pool.length - 1] : null
}

/* ---------- Git ---------- */

function gitPaths(state: AccessState, s: SecretRuntime, prefix: GraphNodeId[], prefixSteps: string[], withSopsKey: boolean): Raw {
  const out = emptyRaw()
  const commits = state.commits.filter((c) => c.secretId === s.id)
  const hops: GraphNodeId[] = [...prefix, 'git']
  const steps = [...prefixSteps, 'klon repozitorija (cijela povijest)']
  const compromised = new Set(state.leakedKeyIds)

  // group readable commits by (form, file, leak)
  const groups = new Map<string, GitCommit[]>()
  for (const c of commits) {
    if (c.version === null) continue
    const readable =
      c.form === 'base64' ||
      c.form === 'dockerfile-env' ||
      c.form === 'manifest-env' ||
      c.form === 'configmap' ||
      (c.form === 'sealed' && c.keyId !== null && compromised.has(c.keyId)) ||
      (c.form === 'sops' && withSopsKey)
    if (!readable) continue
    const key = `${c.form}|${c.file}|${c.leak ? 'leak' : ''}`
    const g = groups.get(key)
    if (g) g.push(c)
    else groups.set(key, [c])
  }

  for (const [key, cs] of groups) {
    const c0 = cs[cs.length - 1]
    const versions = uniqSorted(cs.map((c) => c.version))
    const bv = bestVersion(s, versions)
    const value = bv === null ? '' : valueOf(s, bv)
    const removed = cs.some((c) => c.removedFromBranch)
    const removedNote = removed ? ' Commit je uklonjen iz grane, ali ostaje u svakom klonu.' : ''
    let channel: Channel = 'git'
    let text: string
    let short: string
    let evidence: string | undefined
    switch (c0.form) {
      case 'base64':
        text = c0.leak
          ? `Commit ${c0.sha} spremio je secret.yaml u Git: base64 nije šifriranje, dovoljno je base64 -d.`
          : 'secret.yaml u Gitu: vrijednost je samo kodirana u base64, dovoljno je base64 -d.'
        short = c0.leak ? `commit ${c0.sha} sa secret.yaml, dovoljno je base64 -d` : 'secret.yaml u Gitu, dovoljno je base64 -d'
        evidence = `${s.key}: ${toBase64(value)}`
        break
      case 'dockerfile-env':
        text = `Dockerfile u Gitu sadrži redak ENV ${s.key}=… kao običan tekst.`
        short = 'redak ENV u Dockerfileu u Gitu'
        evidence = `ENV ${s.key}=${value}`
        break
      case 'manifest-env':
        text = 'deployment.yaml u Gitu: vrijednost je upisana izravno u env.'
        short = 'vrijednost upisana u env u deployment.yaml'
        evidence = `- name: ${s.key}  value: "${value}"`
        break
      case 'configmap':
        text = 'configmap.yaml u Gitu: ConfigMap čuva vrijednost kao običan tekst.'
        short = 'configmap.yaml u Gitu, običan tekst'
        evidence = `${s.key}: "${value}"`
        break
      case 'sealed':
        channel = 'git-sealed'
        text = 'SealedSecret iz Gita zapečaćen je ključem koji je procurio – napadač ga otpečati.'
        short = 'SealedSecret iz Gita i procurjeli ključ kontrolera'
        break
      case 'sops':
        channel = 'git-sops'
        text = 'age ključ s laptopa dešifrira SOPS datoteku iz Gita (sops -d).'
        short = 'SOPS datoteka iz Gita i age ključ s laptopa'
        break
      default:
        text = 'Vrijednost je u povijesti Gita.'
        short = 'vrijednost u povijesti Gita'
    }
    const stepLast = channel === 'git-sealed' ? 'procurjeli privatni ključ kontrolera' : channel === 'git-sops' ? 'sops -d s age ključem' : c0.form === 'base64' ? 'base64 -d' : 'čitljivo u datoteci'
    out.paths.push(mkPath(`git:${key}`, channel, hops, [...steps.slice(0, -1), `${steps[steps.length - 1]} → ${c0.file} → ${stepLast}`], text + removedNote, short, versions, false, evidence))
  }

  if (out.paths.length === 0) {
    const hasSealed = commits.some((c) => c.form === 'sealed')
    const hasSops = commits.some((c) => c.form === 'sops')
    if (hasSealed)
      out.blocked.push(mkBlocked('git-sealed', hops, steps, hops.length - 1, 'SealedSecret: u Gitu je samo šifrat; privatni ključ ima samo kontroler u klasteru.', 'git-encryption'))
    else if (hasSops)
      out.blocked.push(mkBlocked('git-sops', hops, steps, hops.length - 1, 'SOPS: vrijednosti su šifrirane (age); ključa nema u repozitoriju.', 'git-encryption'))
    else if (APPROACHES[s.approach].usesStore)
      out.blocked.push(mkBlocked('git', hops, steps, hops.length - 1, 'U Gitu je samo referenca na trezor – vrijednosti nema.', 'no-value-in-git'))
    else out.blocked.push(mkBlocked('git', hops, steps, hops.length - 1, 'U Gitu nema vrijednosti (u manifestu je samo referenca na Secret).', 'no-value-in-git'))
  }
  return out
}

/* ---------- Image ---------- */

function imagePaths(state: AccessState, s: SecretRuntime): Raw {
  const out = emptyRaw()
  const imgs = state.images.filter((i) => i.secretId === s.id)
  const hops: GraphNodeId[] = ['registry']
  if (imgs.length === 0) {
    out.blocked.push(mkBlocked('image', hops, ['docker pull'], 0, 'Slika ne sadrži vrijednost.', 'no-value-in-image'))
    return out
  }
  const versions = uniqSorted(imgs.map((i) => i.version))
  const bv = bestVersion(s, versions)
  const tag = imgs[imgs.length - 1].tag
  out.paths.push(
    mkPath(
      'image:env',
      'image',
      hops,
      [`docker pull ${tag} → docker image inspect`],
      `Slika sadrži ENV ${s.key} – vidi se naredbom docker image inspect ili docker history. Stari tagovi ostaju u registru.`,
      'ENV u konfiguraciji slike (docker image inspect)',
      versions,
      false,
      bv === null ? undefined : `ENV ${s.key}=${valueOf(s, bv)}`,
    ),
  )
  return out
}

/* ---------- etcd copy / control-plane disk ---------- */

function etcdPaths(state: AccessState, s: SecretRuntime, mode: 'backup' | 'disk'): Raw {
  const out = etcdObjectPaths(state, s, mode)
  const key = sealingKeyPath(state, s, mode)
  if (key) out.paths.push(key)
  return out
}

/**
 * The Sealed Secrets controller keeps its private keys as ordinary Secrets (kube-system, label
 * sealedsecrets.bitnami.com/sealed-secrets-key). A copy of etcd that holds them readable opens every SealedSecret in Git
 * sealed with them – also after the in-cluster Secret is encrypted.
 */
function sealingKeyPath(state: AccessState, s: SecretRuntime, mode: 'backup' | 'disk'): AccessPath | null {
  const readable = new Set(keysReadableFrom(state, mode))
  if (readable.size === 0) return null
  const cs = state.commits.filter((c) => c.secretId === s.id && c.form === 'sealed' && c.version !== null && c.keyId !== null && readable.has(c.keyId))
  if (cs.length === 0) return null
  const ids = [...new Set(cs.map((c) => c.keyId as string))].join(', ')
  const channel: Channel = mode === 'backup' ? 'etcd' : 'disk'
  const localKey = mode === 'disk' && state.sealedKeys.some((k) => readable.has(k.id) && k.storedProvider !== 'identity')
  const how = localKey ? ' (šifriran, ali ključ za šifriranje leži na istom disku)' : ' (nešifriran)'
  const unseal = 'SealedSecret iz Gita → otpečaćen ključem kontrolera'
  const hops: GraphNodeId[] = mode === 'backup' ? ['etcd', 'git'] : ['cp-disk', 'etcd', 'git']
  const steps = mode === 'backup' ? ['ukradena kopija baze etcd → ključ kontrolera (Secret u kube-system)', unseal] : ['ukradeni disk', 'datoteke baze etcd → ključ kontrolera (Secret u kube-system)', unseal]
  return mkPath(
    `${channel}:sealing-key`,
    channel,
    hops,
    steps,
    `Kontroler Sealed Secrets čuva privatne ključeve kao Secrete u bazi etcd${how} – ključem ${ids} otpečati se SealedSecret iz Gita.`,
    'otpečati SealedSecret ključem kontrolera iz baze etcd',
    cs.map((c) => c.version as number),
  )
}

function etcdObjectPaths(state: AccessState, s: SecretRuntime, mode: 'backup' | 'disk'): Raw {
  const out = emptyRaw()
  const obj = s.obj
  const hops: GraphNodeId[] = mode === 'backup' ? ['etcd'] : ['cp-disk', 'etcd']
  const steps = mode === 'backup' ? ['ukradena kopija baze etcd'] : ['ukradeni disk', 'datoteke baze etcd']
  const channel: Channel = mode === 'backup' ? 'etcd' : 'disk'
  if (!obj.exists || obj.kind === null || obj.version === null) {
    const reason =
      s.approach === 'image'
        ? 'Vrijednost je u slici, ne u bazi etcd.'
        : s.approach === 'csi'
          ? 'CSI bez sinkronizacije: vrijednost je samo u tmpfs-u Poda, ne u bazi etcd.'
          : 'Objekt s vrijednošću trenutačno ne postoji u bazi etcd.'
    out.blocked.push(mkBlocked(channel, hops, steps, hops.length - 1, reason, 'not-in-etcd'))
    return out
  }
  const kindLabel = obj.kind === 'Secret' ? `Secret ${s.name}` : obj.kind === 'ConfigMap' ? `ConfigMap ${s.name}` : 'Deployment s env vrijednošću'
  const prov = obj.storedProvider
  const info = PROVIDERS[prov]
  const versions = [obj.version]
  if (prov === 'identity') {
    const why = plainReason(state, obj.kind)
    const text =
      why === 'not-rewritten'
        ? `${kindLabel} zapisan je prije uključivanja šifriranja – leži nešifriran dok se ponovno ne zapiše (kubectl replace).`
        : why === 'out-of-scope'
          ? `Šifriranje u mirovanju ne obuhvaća ovu vrstu objekta – ${kindLabel} leži u bazi etcd nešifriran.`
          : obj.kind === 'Secret'
            ? `${kindLabel} leži u bazi etcd nešifriran (pružatelj identity); base64 je samo prikaz u API-ju.`
            : `${kindLabel} leži u bazi etcd nešifriran.`
    const short =
      why === 'not-rewritten' ? 'zapisan prije šifriranja, još nešifriran' : why === 'out-of-scope' ? 'ta vrsta objekta nije na popisu za šifriranje' : 'objekt leži nešifriran u bazi etcd'
    out.paths.push(mkPath(`${channel}:plain`, channel, hops, [...steps.slice(0, -1), `${steps[steps.length - 1]} → čitljivo`], text, short, versions))
    return out
  }
  if (info.keyLocation === 'control-plane-file') {
    if (mode === 'backup') {
      out.blocked.push(
        mkBlocked(channel, hops, steps, 0, `Šifrirano (${info.label}); ključ nije u kopiji baze – leži u datoteci na upravljačkoj ravnini.`, 'encryption-at-rest'),
      )
    } else {
      out.paths.push(
        mkPath(
          'disk:local-key',
          'disk',
          hops,
          ['ukradeni disk', `šifrirani podatci + datoteka s ključem (${info.label})`],
          `Ključ za ${info.label} leži u datoteci na istom disku kao i baza etcd – podatci se dešifriraju.`,
          `ključ za ${info.label} leži na istom disku`,
          versions,
        ),
      )
    }
    return out
  }
  // KMS v2
  if (mode === 'backup') {
    out.blocked.push(mkBlocked(channel, hops, steps, 0, 'Šifrirano (KMS v2): ključ (KEK) je u vanjskom KMS-u, a u kopiji su samo šifrirani podatci.', 'encryption-at-rest'))
  } else {
    out.blocked.push(
      mkBlocked(
        channel,
        [...hops, 'kms'],
        [...steps, 'vanjski KMS'],
        2,
        'KMS v2: ključ (KEK) je u vanjskom KMS-u – na disku su samo šifrirani podatci i šifrirani DEK-ovi.',
        'kms',
      ),
    )
  }
  return out
}

/* ---------- Kubernetes API (RBAC) ---------- */

/**
 * Why an object stored with `identity` is plaintext although encryption may be on:
 * - `off`: encryption at rest is off (provider identity)
 * - `out-of-scope`: its resource is not in the EncryptionConfiguration list (e.g. ConfigMaps with scope `secrets`)
 * - `not-rewritten`: its resource IS listed, but it was written before encryption was enabled and not rewritten
 */
export function plainReason(state: AccessState, kind: 'Secret' | 'ConfigMap' | 'Deployment'): 'off' | 'out-of-scope' | 'not-rewritten' {
  if (state.config.encryption.provider === 'identity') return 'off'
  return effectiveProvider(state, kind) === 'identity' ? 'out-of-scope' : 'not-rewritten'
}

/**
 * What the API does for one identity: read the object (get / list / watch – one route per verb, a 403 for each denied
 * one), read an env literal from the Pod spec, create a Pod that mounts the value, exec into a running app Pod, read
 * printed logs.
 */
function rbacPaths(state: AccessState, actorId: ActorId, s: SecretRuntime, rules: readonly PolicyRule[], prefix: GraphNodeId[], prefixSteps: string[]): Raw {
  const out = emptyRaw()
  const obj = s.obj
  const kind = objKindFor(state, s)
  const roles = roleLabel(state, actorId)
  const who = actorId === 'compromised-pod' ? `ServiceAccount aplikacije (${roles})` : `uloga ${roles}`
  const api: GraphNodeId[] = [...prefix, 'api']
  const apiSteps = [...prefixSteps]
  const ns = state.config.namespace

  // 1) read the object directly (Secret / ConfigMap) – get, list and watch each return the full content
  if (obj.exists && obj.version !== null && (obj.kind === 'Secret' || obj.kind === 'ConfigMap')) {
    const res = resourceOf(obj.kind)
    const noun = obj.kind === 'Secret' ? 'secret' : 'configmap'
    const decode = obj.kind === 'Secret' ? ' pa base64 -d' : ''
    // `kubectl get --watch` lists first (needs list too); a watch-only identity uses the raw watch API, which starts with
    // a synthetic ADDED event for every existing object
    const watchCmd = `kubectl get --raw "/api/v1/namespaces/${ns}/${res}?watch=1"`
    const verbs: [('get' | 'list' | 'watch'), Channel, string, string, string][] = [
      ['get', 'api-get', `kubectl get ${noun} ${s.name} -o yaml`, `get na ${res}: kubectl get ${noun} ${s.name} -o yaml${decode}.`, `kubectl get ${noun} ${s.name} -o yaml`],
      ['list', 'api-list', `kubectl get ${res} -o yaml`, `list na ${res}: popis vraća cijele objekte, sa sadržajem${decode}.`, `list na ${res} vraća cijele objekte`],
      [
        'watch',
        'api-watch',
        watchCmd,
        `watch na ${res}: watch odmah pošalje svaki postojeći objekt (događaj ADDED) s cijelim sadržajem${decode}, a zatim svaku promjenu.`,
        `watch na ${res} odmah šalje cijele objekte`,
      ],
    ]
    for (const [verb, channel, cmd, text, short] of verbs) {
      if (rulesAllow(rules, verb, res)) out.paths.push(mkPath(`${channel}:${res}`, channel, [...api, 'etcd'], [...apiSteps, cmd, 'API vraća objekt iz baze etcd'], text, short, [obj.version], false, undefined, cmd))
      else out.blocked.push(mkBlocked(channel, api, [...apiSteps, cmd], api.length - 1, `RBAC: ${who} nema ${verb} na ${res} (403 Forbidden).`, 'rbac', cmd))
    }
  }

  // 2) env literal in the Deployment / Pod spec
  if (s.approach === 'manifest-env' && s.specVersion !== null) {
    const ok = (['get', 'list', 'watch'] as const).some((v) => rulesAllow(rules, v, 'deployments') || rulesAllow(rules, v, 'pods'))
    const w = state.workloads.find((x) => x.secretIds.includes(s.id))
    const wname = w ? w.name : 'klopa-api'
    const cmd = `kubectl get deployment ${wname} -o yaml`
    if (ok)
      out.paths.push(
        mkPath(
          'pod-spec:env',
          'pod-spec',
          api,
          [...apiSteps, cmd],
          `Čita Deploymente i Podove: vrijednost piše izravno u env (${cmd}).`,
          'vrijednost piše u specifikaciji Deploymenta',
          [s.specVersion],
          false,
          undefined,
          cmd,
        ),
      )
    else out.blocked.push(mkBlocked('pod-spec', api, [...apiSteps, cmd], api.length - 1, `RBAC: ${who} ne čita Deploymente ni Podove (403 Forbidden).`, 'rbac', cmd))
  }

  // 3) create a Pod (directly or through a Deployment) that mounts the value. The new Pod sends the value out itself
  //    out of the cluster, so neither get on secrets nor pods/log is needed (a deployer has neither).
  const createsPods = rulesAllow(rules, 'create', 'pods')
  const createsDeploys = rulesAllow(rules, 'create', 'deployments')
  const canCreate = createsPods || createsDeploys
  const via = createsPods ? 'novi Pod' : 'novi Deployment → Pod'
  const mountHops: GraphNodeId[] = [...api, 'node', 'pod']
  const exfil = 'Pod iznese vrijednost izvan klastera'
  if (s.approach === 'image') {
    const versions = state.images.filter((i) => i.secretId === s.id).map((i) => i.version)
    const cmd = `kubectl apply: ${via} sa slikom aplikacije`
    if (canCreate && versions.length)
      out.paths.push(
        mkPath(
          'run-image',
          'run-image',
          mountHops,
          [...apiSteps, cmd, 'kubelet povuče sliku', 'kontejner iznese env izvan klastera'],
          `Smije stvarati Podove: pokrene sliku aplikacije, a kontejner iznese ${s.key} iz okruženja izvan klastera – pods/log nije potreban.`,
          'pokrene sliku aplikacije i iznese env',
          versions,
          false,
          undefined,
          cmd,
        ),
      )
    else if (versions.length)
      out.blocked.push(mkBlocked('run-image', api, [...apiSteps, cmd], api.length - 1, `RBAC: ${who} ne smije stvarati Podove ni Deploymente (403 Forbidden).`, 'rbac', cmd))
  } else if (kind !== null || s.approach === 'csi') {
    let versions: number[] = []
    let blockedReason: string | null = null
    let blockedControl: ControlId = 'rbac'
    // CSI with sync: the synced Kubernetes Secret exists in the namespace – any Pod can mount it by name,
    // whether or not the store is reachable (the sync does not need the store to keep existing)
    const synced = s.approach === 'csi' && kind === 'Secret' && obj.exists && obj.version !== null ? obj.version : null
    if (s.approach === 'csi') {
      if (!state.config.store.available) {
        blockedReason = 'CSI driver ne može dohvatiti vrijednost: trezor je nedostupan.'
        blockedControl = 'store-down'
      } else if (s.storeVersion !== null) versions = [s.storeVersion]
    } else if (obj.exists && obj.version !== null && (obj.kind === 'Secret' || obj.kind === 'ConfigMap')) versions = [obj.version]
    const objNoun = obj.kind === 'ConfigMap' ? 'ConfigMap' : 'Secret'
    const objRes = obj.kind === 'ConfigMap' ? 'configmaps' : 'secrets'
    const cmd = `kubectl apply: ${via} montira ${s.approach === 'csi' ? 'SecretProviderClass' : `${objNoun} ${s.name}`}`
    const cmdSynced = `kubectl apply: ${via} montira Secret ${s.name}`
    const mountSteps = [...apiSteps, cmd, 'kubelet montira vrijednost', exfil]
    if (canCreate && versions.length) {
      const text =
        s.approach === 'csi'
          ? 'Smije stvarati Podove: novi Pod montira isti SecretProviderClass, CSI driver mu donese vrijednost iz trezora, a Pod je iznese izvan klastera.'
          : `Smije stvarati Podove: ${via} montira ${objNoun} ${s.name} i iznese vrijednost izvan klastera – ni get na ${objRes} ni pods/log nisu potrebni.`
      const short = s.approach === 'csi' ? 'novi Pod montira SecretProviderClass' : `novi Pod montira ${objNoun} ${s.name}`
      out.paths.push(mkPath('mount', 'mount', mountHops, mountSteps, text, short, versions, true, undefined, cmd))
    }
    if (canCreate && synced !== null)
      out.paths.push(
        mkPath(
          'mount:synced',
          'mount',
          mountHops,
          [...apiSteps, cmdSynced, 'kubelet montira vrijednost', exfil],
          `Smije stvarati Podove: ${via} montira Secret ${s.name} koji CSI driver sinkronizira u klaster i iznese vrijednost – trezor za to ne treba.`,
          `novi Pod montira sinkronizirani Secret ${s.name}`,
          [synced],
          true,
          undefined,
          cmdSynced,
        ),
      )
    if (!canCreate && (versions.length || synced !== null)) {
      const c = versions.length ? cmd : cmdSynced
      out.blocked.push(mkBlocked('mount', api, [...apiSteps, c], api.length - 1, `RBAC: ${who} ne smije stvarati Podove ni Deploymente (403 Forbidden).`, 'rbac', c))
    } else if (canCreate && blockedReason && synced === null) {
      out.blocked.push(mkBlocked('mount', [...api, 'node', 'store'], [...apiSteps, cmd, 'CSI mount', 'trezor'], api.length + 1, blockedReason, blockedControl, cmd))
    }
  }

  // 4) exec into a running app Pod
  const running = runningConsumers(state, s.id)
  if (running.length) {
    const vs = running.flatMap((p) => [p.env[s.id], p.file[s.id], p.uses[s.id]])
    const cmd = `kubectl exec ${running[0].id} -- printenv`
    if (rulesAllow(rules, 'create', 'pods/exec'))
      out.paths.push(
        mkPath(
          'exec',
          'exec',
          mountHops,
          [...apiSteps, `kubectl exec ${running[0].id}`, 'kubelet otvori ljusku u kontejneru', 'printenv / cat datoteke'],
          'Smije exec: ulazi u Pod aplikacije i čita okruženje ili montiranu datoteku.',
          `kubectl exec u ${running[0].id}`,
          uniqSorted(vs),
          false,
          undefined,
          cmd,
        ),
      )
    else out.blocked.push(mkBlocked('exec', api, [...apiSteps, cmd], api.length - 1, `RBAC: ${who} nema create na pods/exec (403 Forbidden).`, 'rbac', cmd))
  }

  // 5) kubectl logs (pods/log) – only while the Pod that logged still exists
  const alive = new Set(state.pods.map((p) => p.id))
  const logged = state.podLogs.filter((l) => l.secretId === s.id && l.podId !== null && alive.has(l.podId))
  if (logged.length) {
    const cmd = `kubectl logs ${logged[0].podId}`
    if (rulesAllow(rules, 'get', 'pods/log'))
      out.paths.push(
        mkPath(
          'pod-log',
          'pod-log',
          [...api, 'logs'],
          [...apiSteps, cmd, 'log kontejnera'],
          `kubectl logs: aplikacija je ispisala ${s.key} u log, a ${actorId === 'compromised-pod' ? 'ServiceAccount' : 'uloga'} ima pods/log.`,
          cmd,
          logged.map((l) => l.version),
          false,
          undefined,
          cmd,
        ),
      )
    else out.blocked.push(mkBlocked('pod-log', api, [...apiSteps, cmd], api.length - 1, `RBAC: ${who} nema get na pods/log (403 Forbidden).`, 'rbac', cmd))
  }
  if (out.paths.length === 0 && out.blocked.length === 0)
    out.blocked.push(mkBlocked('api-get', api, [...apiSteps, `kubectl get secret ${s.name}`], api.length - 1, 'Objekt s vrijednošću trenutačno ne postoji u klasteru.', 'not-in-etcd'))
  return out
}

/* ---------- Per actor ---------- */

function evalActor(state: AccessState, actorId: ActorId, s: SecretRuntime): Raw {
  switch (actorId) {
    case 'git-reader':
      return gitPaths(state, s, [], [], false)
    case 'image-puller':
      return imagePaths(state, s)
    case 'etcd-backup-thief':
      return etcdPaths(state, s, 'backup')
    case 'cp-disk-thief':
      return etcdPaths(state, s, 'disk')
    case 'view-user':
    case 'developer':
    case 'pod-creator':
      return rbacPaths(state, actorId, s, rulesFor(state, actorId), [], [])
    case 'compromised-pod': {
      const out = emptyRaw()
      const running = runningConsumers(state, s.id)
      if (running.length === 0) out.blocked.push(mkBlocked('pod-inside', ['pod'], ['napadač u kontejneru'], 0, 'Nijedan Pod aplikacije ne radi – nema vrijednosti za krađu.', 'no-pod'))
      else {
        // worded by where a usable value is (after rotate + revoke an env var may hold only the revoked value)
        const { env, file } = podCarriers(s, running)
        const vs = running.flatMap((p) => [p.env[s.id], p.file[s.id], p.uses[s.id]])
        const step = env && file ? 'napadač u kontejneru → /proc/self/environ i montirana datoteka' : env ? 'napadač u kontejneru → /proc/self/environ' : 'napadač u kontejneru → montirana datoteka'
        const what = env && file ? 'varijable okruženja i montiranu datoteku' : env ? 'varijable okruženja' : 'montiranu datoteku'
        out.paths.push(
          mkPath(
            'pod-inside',
            'pod-inside',
            ['pod'],
            [step],
            `Napadač u kontejneru čita ${what} – aplikacija mora znati vrijednost (iskrena granica).`,
            env && file ? 'čita okruženje procesa i montiranu datoteku' : env ? 'čita varijable okruženja procesa' : 'čita montiranu datoteku',
            uniqSorted(vs),
            true,
          ),
        )
      }
      // the app's ServiceAccount token (automounted) is an API identity too: an over-privileged one opens more than the
      // app's own value – and unlike the app's own value it can be closed (no Role, or automountServiceAccountToken: false)
      if (state.pods.some((p) => p.status === 'Running')) {
        const r = rbacPaths(state, 'compromised-pod', s, rulesFor(state, 'compromised-pod'), ['pod'], ['token ServiceAccounta iz Poda'])
        out.paths.push(...r.paths.map((p) => ({ ...p, id: `sa:${p.id}`, honestLimit: false })))
        out.blocked.push(...r.blocked)
      }
      return out
    }
    case 'log-reader': {
      const out = emptyRaw()
      const logged = state.centralLogs.filter((l) => l.secretId === s.id)
      if (logged.length)
        out.paths.push(
          mkPath(
            'log',
            'log',
            ['logs'],
            ['sustav za logove'],
            `Aplikacija je ispisala okruženje u log – ${s.key} je u sustavu za logove.`,
            'ispis okruženja u sustavu za logove',
            logged.map((l) => l.version),
          ),
        )
      else out.blocked.push(mkBlocked('log', ['logs'], ['sustav za logove'], 0, 'U logovima nema vrijednosti.', 'no-leak'))
      return out
    }
    case 'ci-log-reader': {
      const out = emptyRaw()
      const logged = state.ciLogs.filter((l) => l.secretId === s.id)
      if (logged.length)
        out.paths.push(
          mkPath('ci-log', 'ci-log', ['ci', 'ci-log'], ['pipeline', 'log posla'], `Pipeline je ispisao ${s.key} u CI log.`, 'vrijednost ispisana u CI logu', logged.map((l) => l.version)),
        )
      else out.blocked.push(mkBlocked('ci-log', ['ci', 'ci-log'], ['pipeline', 'log posla'], 1, 'U CI logu nema vrijednosti.', 'no-leak'))
      return out
    }
    case 'argocd-redis': {
      const out = emptyRaw()
      const gitops = state.config.delivery === 'gitops'
      const flux = s.approach === 'sops' && state.config.sops.decryptor === 'flux'
      if (!gitops) {
        out.applicable = false
        out.blocked.push(mkBlocked('redis', ['argocd', 'redis'], ['Argo CD', 'Redis'], 0, 'Nema Argo CD-a: manifesti se primjenjuju naredbom kubectl.', 'not-applicable'))
        return out
      }
      // every manifest Argo CD generated with a readable value stays in Redis until the cache expires –
      // switching tools does not clean it; only rotation (revocation) or expiry does
      const ttl = state.config.timing.argoCacheExpiry
      const cached = state.redisRendered.filter((r) => r.secretId === s.id && state.t - r.t < ttl - 1e-9)
      if (cached.length) {
        const last = cached[cached.length - 1]
        const current = last.approach === s.approach
        const text = !current
          ? `Argo CD je ranije generirao manifeste s vrijednošću (${APPROACHES[last.approach].label}) – Redis ih čuva do isteka predmemorije i nakon promjene alata.`
          : s.approach === 'avp'
            ? 'argocd-vault-plugin: Argo CD umetne vrijednost iz trezora u manifest i generirani manifest čuva nešifriran u Redisu.'
            : s.approach === 'sops'
              ? 'KSOPS dešifrira SOPS u Argo CD-u – generirani Secret leži nešifriran u Redisu.'
              : 'Argo CD generira manifeste iz Gita i čuva ih u Redisu – zajedno s vrijednošću.'
        const short = current ? 'generirani manifest u Redisu Argo CD-a' : 'stari generirani manifest u Redisu Argo CD-a'
        out.paths.push(
          mkPath(`redis:${last.approach}`, 'redis', ['argocd', 'redis'], ['repo-server generira manifeste', 'predmemorija u Redisu'], text, short, cached.map((r) => r.version)),
        )
      } else {
        const reason = flux
          ? 'Flux dešifrira SOPS u kustomize-controlleru – Argo CD ga ne generira.'
          : 'Argo CD iz Gita dobiva samo šifrat ili referencu – u predmemoriji nema vrijednosti.'
        out.blocked.push(mkBlocked('redis', ['argocd', 'redis'], ['repo-server generira manifeste', 'predmemorija u Redisu'], 1, reason, 'gitops-tool'))
      }
      return out
    }
    case 'laptop-thief': {
      const out = emptyRaw()
      if (state.config.laptop.diskEncrypted) {
        out.blocked.push(mkBlocked('laptop-file', ['laptop'], ['ukradeni laptop'], 0, 'Disk laptopa je šifriran, a zaslon zaključan.', 'disk-encryption'))
        return out
      }
      const hasSopsKey = state.config.laptop.hasSopsKey && state.commits.some((c) => c.secretId === s.id && c.form === 'sops')
      const g = gitPaths(state, s, ['laptop'], ['ukradeni laptop'], hasSopsKey)
      out.paths.push(...g.paths)
      out.blocked.push(...g.blocked)
      const files = state.laptopFiles.filter((f) => f.secretId === s.id)
      if (files.length)
        out.paths.push(
          mkPath(
            'laptop-file',
            'laptop-file',
            ['laptop'],
            ['ukradeni laptop → lokalni secret.yaml'],
            'Na laptopu je lokalni secret.yaml iz kojeg je Secret primijenjen ručno.',
            'lokalni secret.yaml na laptopu',
            files.map((f) => f.version),
          ),
        )
      const r = rbacPaths(state, 'laptop-thief', s, rulesFor(state, 'laptop-thief'), ['laptop'], ['kubeconfig s laptopa'])
      out.paths.push(...r.paths)
      out.blocked.push(...r.blocked)
      return out
    }
    case 'ex-employee': {
      const out = emptyRaw()
      const known = state.exEmployeeKnows.filter((k) => k.secretId === s.id)
      if (known.length === 0) {
        out.applicable = false
        out.blocked.push(mkBlocked('memory', ['memory'], ['sjećanje'], 0, 'Nitko tko zna vrijednost nije napustio tim.', 'not-applicable'))
        return out
      }
      out.paths.push(
        mkPath(
          'memory',
          'memory',
          ['memory'],
          ['zna staru vrijednost'],
          'Pamti vrijednost iz vremena dok je bila važeća – pristupi su ukinuti, ali vrijednost zatvara samo rotacija.',
          'pamti vrijednost iz vremena rada u timu',
          known.map((k) => k.version),
        ),
      )
      return out
    }
  }
}

/**
 * Do running Pods carry the value as env / as a file? Counts only carriers with a usable (not revoked) version when
 * there is one at all, otherwise any version (for a path that exposes only revoked values).
 */
function podCarriers(s: SecretRuntime, running: AppPod[]): { env: boolean; file: boolean } {
  const usable = running.some((p) => isUsable(s, p.env[s.id]) || isUsable(s, p.file[s.id]))
  const has = (v: number | null | undefined) => (usable ? isUsable(s, v) : v !== null && v !== undefined)
  const env = running.some((p) => has(p.env[s.id]))
  const file = running.some((p) => has(p.file[s.id]))
  return env || file ? { env, file } : { env: true, file: false }
}

/** Which asset(s) a path reads the value from (see assets.ts). */
function pathAssets(state: AccessState, s: SecretRuntime, p: AccessPath): AssetKind[] {
  const id = p.id.replace(/^sa:/, '')
  if (id.endsWith(':sealing-key')) return ['git-sealed']
  switch (p.channel) {
    case 'git': {
      const form = p.id.slice('git:'.length).split('|')[0]
      return [form === 'base64' ? 'git-base64' : 'git-plain']
    }
    case 'git-sealed':
      return ['git-sealed']
    case 'git-sops':
      return ['git-sops']
    case 'image':
    case 'run-image':
      return ['image']
    case 'etcd':
    case 'disk':
    case 'api-get':
    case 'api-list':
    case 'api-watch':
    case 'pod-spec':
      return ['etcd']
    case 'mount':
      return [s.approach === 'csi' && id !== 'mount:synced' ? 'store' : 'etcd']
    case 'exec':
    case 'pod-inside': {
      const { env, file } = podCarriers(s, runningConsumers(state, s.id))
      const out: AssetKind[] = []
      if (env) out.push('pod-env')
      if (file) out.push('pod-file')
      return out
    }
    case 'pod-log':
    case 'log':
      return ['log']
    case 'ci-log':
      return ['ci-log']
    case 'redis':
      return ['redis']
    case 'laptop-file':
      return ['laptop-file']
    case 'memory':
      return ['memory']
  }
}

function toVerdict(actorId: ActorId, s: SecretRuntime, raw: Raw): Verdict {
  const paths: AccessPath[] = []
  const stalePaths: AccessPath[] = []
  for (const p of raw.paths) {
    const usable = p.versions.filter((v) => isUsable(s, v))
    if (usable.length) paths.push({ ...p, versions: usable })
    else if (p.versions.length) stalePaths.push(p)
  }
  const blocked = [...raw.blocked]
  if (paths.length === 0 && stalePaths.length) {
    const p = stalePaths[0]
    blocked.unshift(mkBlocked(p.channel, p.hops, p.steps, p.hops.length - 1, `Vrijednost ${p.versions.map((v) => `v${v}`).join(', ')} je opozvana – rotacija je zatvorila ovaj put.`, 'rotation', p.action))
  }
  const reads = paths.length > 0
  return {
    actorId,
    secretId: s.id,
    reads,
    level: reads ? 'reads' : stalePaths.length ? 'stale' : 'none',
    applicable: raw.applicable,
    paths,
    stalePaths,
    blocked,
    honestLimit: reads && paths.every((p) => p.honestLimit),
  }
}

/** Verdict for one actor and one secret (default: focused secret). Unknown secret → not applicable. */
export function verdictOf(state: AccessState, actorId: ActorId, secretId: string = state.config.focusSecretId): Verdict {
  const s = findSecret(state, secretId)
  if (!s) {
    return { actorId, secretId, reads: false, level: 'none', applicable: false, paths: [], stalePaths: [], blocked: [], honestLimit: false }
  }
  const raw = evalActor(state, actorId, s)
  for (const p of raw.paths) p.assets = pathAssets(state, s, p)
  return toVerdict(actorId, s, raw)
}

/** Full report for one secret: every actor's verdict, red actors and visible counts. */
export function evaluateAccess(state: AccessState, secretId: string = state.config.focusSecretId): AccessReport {
  const verdicts = ACTOR_ORDER.map((a) => verdictOf(state, a, secretId))
  const red = verdicts.filter((v) => v.reads).map((v) => v.actorId)
  const visible = new Set(state.config.visibleActors)
  return {
    secretId,
    verdicts,
    red,
    visibleRed: red.filter((a) => visible.has(a)).length,
    visibleTotal: state.config.visibleActors.length,
  }
}

export function evaluateAll(state: AccessState): Record<string, AccessReport> {
  const out: Record<string, AccessReport> = {}
  for (const s of state.secrets) out[s.id] = evaluateAccess(state, s.id)
  return out
}

/** Actors (visible only by default) that can read a valid value of the secret. */
export function redActors(state: AccessState, secretId: string = state.config.focusSecretId, onlyVisible = true): ActorId[] {
  const r = evaluateAccess(state, secretId).red
  if (!onlyVisible) return r
  const visible = new Set(state.config.visibleActors)
  return r.filter((a) => visible.has(a))
}

/** Croatian multi-line explanation of a verdict (for tooltips / screen readers). */
export function explainVerdict(v: Verdict): string {
  if (v.reads) return v.paths.map((p) => `• ${p.text}`).join('\n')
  if (v.blocked.length) return v.blocked.map((b) => `✕ ${b.reason}`).join('\n')
  return 'Nema puta do vrijednosti.'
}

/**
 * Is a still-valid value readable from Git (by anyone with a clone)? Goal „Svi čitatelji Gita sivi”.
 * Default: the focused secret (the one the eyes show); `'all'`: any secret.
 */
export function gitExposesValidValue(state: AccessState, secretId: string | 'all' = state.config.focusSecretId): boolean {
  const ids = secretId === 'all' ? state.secrets.map((s) => s.id) : [secretId]
  return ids.some((id) => verdictOf(state, 'git-reader', id).reads)
}

/** RBAC helper re-export for UIs (`kubectl auth can-i`). */
export { can }
