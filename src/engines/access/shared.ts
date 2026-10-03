/** Small helpers shared by the evaluator and the engine (pure, no mutation). */
import { fmt } from '../../kit/sim/math.ts'
import { APPROACHES, PROVIDERS, ROLES } from './constants.ts'
import type {
  AccessState,
  ActorId,
  AppPod,
  Approach,
  ConsumeMode,
  ObjKind,
  PolicyRule,
  Provider,
  Resource,
  SecretRuntime,
  SecretVersion,
  Verb,
  WorkloadRuntime,
} from './types.ts'

export function findSecret(state: AccessState, id: string | undefined): SecretRuntime | undefined {
  if (id === undefined) return undefined
  return state.secrets.find((s) => s.id === id)
}

export function findWorkload(state: AccessState, id: string): WorkloadRuntime | undefined {
  return state.workloads.find((w) => w.id === id)
}

export function versionOf(s: SecretRuntime, v: number | null | undefined): SecretVersion | undefined {
  if (v === null || v === undefined) return undefined
  return s.versions.find((x) => x.v === v)
}

/** A value version still accepted by the backend (not revoked). */
export function isUsable(s: SecretRuntime, v: number | null | undefined): boolean {
  const ver = versionOf(s, v)
  return ver !== undefined && ver.revokedAt === null
}

/** image / manifest-env are env vars by construction. */
export function effectiveConsume(approach: Approach, mode: ConsumeMode): ConsumeMode {
  return APPROACHES[approach].envOnly ? 'env' : mode
}

/** Effective RBAC rules of an actor: bound roles ∪ custom rules (the laptop thief uses the developer's kubeconfig). */
export function rulesFor(state: AccessState, actorId: ActorId): PolicyRule[] {
  const who: ActorId = actorId === 'laptop-thief' ? 'developer' : actorId
  const roles = state.bindings[who]
  const custom = state.customRules[who]
  return [...(roles ?? []).flatMap((r) => ROLES[r].rules), ...(custom ? custom.rules : [])]
}

/** „edit”, „view + list secrets”, „vlastita pravila: watch na secrets”, „bez uloge” */
export function roleLabel(state: AccessState, actorId: ActorId): string {
  const who: ActorId = actorId === 'laptop-thief' ? 'developer' : actorId
  const parts = (state.bindings[who] ?? []).map((r) => ROLES[r].label)
  const custom = state.customRules[who]
  if (custom) parts.push(custom.label)
  return parts.length ? parts.join(' + ') : 'bez uloge'
}

export function rulesAllow(rules: readonly PolicyRule[], verb: Verb, resource: Resource): boolean {
  return rules.some((r) => r.resources.includes(resource) && r.verbs.includes(verb))
}

/** Mirrors `kubectl auth can-i <verb> <resource> --as <actor>` in the app namespace. RBAC is additive: no denies. */
export function can(state: AccessState, actorId: ActorId, verb: Verb, resource: Resource): boolean {
  return rulesAllow(rulesFor(state, actorId), verb, resource)
}

/** Pods of workloads that consume the secret (Terminating Pods excluded). */
export function consumerPods(state: AccessState, secretId: string): AppPod[] {
  const ws = new Set(state.workloads.filter((w) => w.secretIds.includes(secretId)).map((w) => w.id))
  return state.pods.filter((p) => ws.has(p.workloadId) && p.status !== 'Terminating')
}

export function runningConsumers(state: AccessState, secretId: string): AppPod[] {
  return consumerPods(state, secretId).filter((p) => p.status === 'Running')
}

export function consumeOf(state: AccessState, pod: AppPod, s: SecretRuntime): ConsumeMode {
  const w = findWorkload(state, pod.workloadId)
  return effectiveConsume(s.approach, w ? w.consume : 'env')
}

/**
 * How a workload effectively consumes a secret: image / manifest-env are always env, whatever `consume` says.
 * Bind a consumption Segmented to this (not to `workload.consume`). Unknown workload → 'env'.
 */
export function effectiveConsumeOf(state: AccessState, workloadId: string, secretId?: string): ConsumeMode {
  const w = findWorkload(state, workloadId)
  if (!w) return 'env'
  const s = findSecret(state, secretId ?? w.secretIds[0])
  return s ? effectiveConsume(s.approach, w.consume) : w.consume
}

/**
 * What the Pod template references for this approach. A change of approach rolls Pods only when this changes
 * (a Secret-backed approach → another Secret-backed one keeps `secretKeyRef` / the secret volume by name).
 */
export function templateKey(approach: Approach): string {
  switch (approach) {
    case 'image':
      return 'image'
    case 'manifest-env':
      return 'env-literal'
    case 'configmap':
      return 'configmap'
    case 'csi':
      return 'csi'
    default:
      return 'secret'
  }
}

/** The value comes from an external store at runtime (ESO, CSI, argocd-vault-plugin). */
export function storeBacked(s: SecretRuntime): boolean {
  return APPROACHES[s.approach].usesStore
}

/** Argo CD's repo-server renders the readable value into manifests (and so into its Redis cache). */
export function rendersPlaintext(state: AccessState, s: SecretRuntime): boolean {
  if (state.config.delivery !== 'gitops') return false
  if (s.approach === 'sops' && state.config.sops.decryptor === 'flux') return false
  return APPROACHES[s.approach].rendersPlaintext
}

/** CSI: is the optional sync to a Kubernetes Secret active (explicitly, or because a workload uses env)? */
export function csiSyncActive(state: AccessState, s: SecretRuntime): boolean {
  if (s.approach !== 'csi') return false
  if (state.config.csi.syncSecret) return true
  return state.workloads.some((w) => w.secretIds.includes(s.id) && w.consume === 'env')
}

/** Cluster object kind carrying the value for the current approach (CSI: Secret only with sync). */
export function objKindFor(state: AccessState, s: SecretRuntime): ObjKind | null {
  if (s.approach === 'csi') return csiSyncActive(state, s) ? 'Secret' : null
  return APPROACHES[s.approach].objKind
}

/** Provider an object of this kind is written with, given the EncryptionConfiguration resources list. */
export function effectiveProvider(state: AccessState, kind: ObjKind): Provider {
  const { provider, scope } = state.config.encryption
  if (provider === 'identity') return 'identity'
  if (kind === 'Secret') return provider
  if (kind === 'ConfigMap') return scope === 'secrets' ? 'identity' : provider
  return scope === 'all' ? provider : 'identity'
}

/** Sealed Secrets is installed: some secret uses it now, or a SealedSecret was ever committed. */
export function sealedInUse(state: AccessState): boolean {
  return state.secrets.some((s) => s.approach === 'sealed') || state.commits.some((c) => c.form === 'sealed')
}

/**
 * Sealing keys (ids) readable from a stolen etcd copy (`backup`: key Secrets stored with identity) or control-plane disk
 * (`disk`: also with a local-key provider, whose key file is on the same disk). The controller keeps its private keys as
 * ordinary Secrets in kube-system. Empty when Sealed Secrets is not in use.
 */
export function keysReadableFrom(state: AccessState, mode: 'backup' | 'disk'): string[] {
  if (!sealedInUse(state)) return []
  return state.sealedKeys
    .filter((k) => k.storedProvider === 'identity' || (mode === 'disk' && PROVIDERS[k.storedProvider].keyLocation === 'control-plane-file'))
    .map((k) => k.id)
}

export function resourceOf(kind: ObjKind): Resource {
  return kind === 'Secret' ? 'secrets' : kind === 'ConfigMap' ? 'configmaps' : 'deployments'
}

/** „7,4 s” */
export function fmtS(sec: number): string {
  const r = Math.round(sec * 10) / 10
  return `${fmt.num(r, Number.isInteger(r) ? 0 : 1)} s`
}

export function uniqSorted(vs: Iterable<number | null | undefined>): number[] {
  const set = new Set<number>()
  for (const v of vs) if (v !== null && v !== undefined && Number.isFinite(v)) set.add(v)
  return [...set].sort((a, b) => a - b)
}

/** Deterministic fake short commit hash (FNV-1a), no RNG consumption. */
export function fakeSha(seed: number, seq: number): string {
  let h = 0x811c9dc5 ^ (seed >>> 0)
  const s = `${seq}:${seed}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0').slice(0, 7)
}
