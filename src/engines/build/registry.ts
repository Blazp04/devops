/**
 * E4 „Tvornica” – registry, tags, digests and pulls (pure).
 *
 * - The registry stores blobs (layers) by digest and manifests by digest; a tag is a movable pointer
 *   `repo:tag → manifest digest` (a sticky note). Optional immutable tags reject re-pointing.
 * - Push uploads only blobs the registry does not have („Layer already exists”).
 * - A pull resolves `name:tag@digest` – if a digest is given, only the digest is used.
 * - Kubernetes' default imagePullPolicy: Always when the tag is `latest` (even `:latest@sha256:…`) or when there is
 *   neither a tag nor a digest; IfNotPresent otherwise (other tags, a bare digest).
 * - A host (server / node) downloads only the layers it does not already have.
 */
import type { Image } from './image.ts'
import { clean, rate, shortDigest } from './common.ts'

export interface RegistryBlob {
  digest: string
  sizeMB: number
  compressedMB: number
  label: string
}

export interface RegistryManifest {
  digest: string
  repo: string
  layers: string[]
  sizeMB: number
  compressedMB: number
  pushedAt: number
}

export interface TagChange {
  t: number
  repo: string
  tag: string
  from: string | null
  to: string
}

export interface Registry {
  host: string
  blobs: Map<string, RegistryBlob>
  manifests: Map<string, RegistryManifest>
  /** 'klopa-web:latest' → manifest digest */
  tags: Map<string, string>
  /** Reject moving an existing tag to another digest (Docker Hub / Harbor „immutable tags”) */
  immutableTags: boolean
  /** Every tag move, oldest first (the newest MAX_TAG_HISTORY kept) */
  tagHistory: TagChange[]
}

/** Bound on `registry.tagHistory` (a long classroom session never grows without limit). */
export const MAX_TAG_HISTORY = 500

function recordTag(reg: Registry, change: TagChange): void {
  reg.tagHistory.push(change)
  if (reg.tagHistory.length > MAX_TAG_HISTORY) reg.tagHistory.splice(0, reg.tagHistory.length - MAX_TAG_HISTORY)
}

export function createRegistry(host = 'registry.klopa.example', opts: { immutableTags?: boolean } = {}): Registry {
  return { host, blobs: new Map(), manifests: new Map(), tags: new Map(), immutableTags: opts.immutableTags ?? false, tagHistory: [] }
}

export interface TransferOptions {
  /** Compressed MB per second (default 10; below 0,1 counts as 0,1 – no bandwidth is slow, not instant) */
  mbps?: number
  /** Fixed cost per push/pull for auth + manifest (default 0.5 s) */
  overheadSec?: number
}

export interface PushLayerPlan {
  digest: string
  label: string
  compressedMB: number
  exists: boolean
  seconds: number
}

export interface PushPlan {
  repo: string
  digest: string
  layers: PushLayerPlan[]
  tags: string[]
  rejectedTags: { tag: string; reason: string }[]
  tagChanges: { tag: string; from: string | null; to: string }[]
  uploadedMB: number
  seconds: number
  /** Size of the manifest JSON in bytes (what `docker push` prints as `size:`) */
  manifestBytes: number
}

const repoTag = (repo: string, tag: string) => `${repo}:${tag}`

/** What a push would upload. Pure. */
export function planPush(reg: Registry, image: Image, repo: string, tags: readonly string[], opts: TransferOptions = {}): PushPlan {
  const mbps = rate(opts.mbps, 10)
  const overhead = opts.overheadSec ?? 0.5
  const seen = new Set<string>()
  const layers: PushLayerPlan[] = []
  for (const l of image.layers) {
    if (seen.has(l.digest)) continue
    seen.add(l.digest)
    const exists = reg.blobs.has(l.digest)
    layers.push({
      digest: l.digest,
      label: l.createdBy,
      compressedMB: l.compressedMB,
      exists,
      seconds: exists ? 0 : clean(l.compressedMB / mbps),
    })
  }
  const rejectedTags: PushPlan['rejectedTags'] = []
  const tagChanges: PushPlan['tagChanges'] = []
  for (const tag of tags) {
    const cur = reg.tags.get(repoTag(repo, tag)) ?? null
    if (cur === image.digest) continue
    if (cur && reg.immutableTags) {
      rejectedTags.push({ tag, reason: `tag ${tag} je nepromjenjiv i već pokazuje na ${shortDigest(cur)}` })
      continue
    }
    tagChanges.push({ tag, from: cur, to: image.digest })
  }
  const uploadedMB = clean(layers.filter((l) => !l.exists).reduce((s, l) => s + l.compressedMB, 0))
  const seconds = clean(overhead + layers.reduce((s, l) => s + l.seconds, 0))
  return { repo, digest: image.digest, layers, tags: [...tags], rejectedTags, tagChanges, uploadedMB, seconds, manifestBytes: new TextEncoder().encode(image.manifestJson).length }
}

/** Store blobs + manifest and move the (non-rejected) tags. */
export function applyPush(reg: Registry, image: Image, plan: PushPlan, t: number): void {
  for (const l of image.layers) {
    if (!reg.blobs.has(l.digest)) reg.blobs.set(l.digest, { digest: l.digest, sizeMB: l.sizeMB, compressedMB: l.compressedMB, label: l.createdBy })
  }
  if (!reg.manifests.has(image.digest)) {
    reg.manifests.set(image.digest, {
      digest: image.digest,
      repo: plan.repo,
      layers: image.layers.map((l) => l.digest),
      sizeMB: image.sizeMB,
      compressedMB: image.compressedMB,
      pushedAt: t,
    })
  }
  for (const c of plan.tagChanges) {
    reg.tags.set(repoTag(plan.repo, c.tag), c.to)
    recordTag(reg, { t, repo: plan.repo, tag: c.tag, from: c.from, to: c.to })
  }
}

/** `docker push`-style output lines. */
export function pushLog(plan: PushPlan): string[] {
  const lines = plan.layers.map((l) => `${l.digest.slice(7, 19)}: ${l.exists ? 'Layer already exists' : 'Pushed'}`)
  for (const r of plan.rejectedTags) lines.push(`${r.tag}: odbijeno – ${r.reason}`)
  for (const tag of plan.tags) if (!plan.rejectedTags.some((r) => r.tag === tag)) lines.push(`${tag}: digest: ${plan.digest} size: ${plan.manifestBytes}`)
  return lines
}

/** Re-point a tag at a manifest that is already in the registry (no layer upload). */
export function setTag(reg: Registry, repo: string, tag: string, digest: string, t: number): { ok: boolean; from: string | null; reason?: string } {
  const key = repoTag(repo, tag)
  const from = reg.tags.get(key) ?? null
  if (!reg.manifests.has(digest)) return { ok: false, from, reason: `manifest ${shortDigest(digest)} nije u registru` }
  if (from === digest) return { ok: true, from }
  if (from && reg.immutableTags) return { ok: false, from, reason: `tag ${tag} je nepromjenjiv` }
  reg.tags.set(key, digest)
  recordTag(reg, { t, repo, tag, from, to: digest })
  return { ok: true, from }
}

// ---------------------------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------------------------

export interface ImageRef {
  registry: string
  repository: string
  tag: string | null
  digest: string | null
}

/**
 * Parse `[registry/]name[:tag][@sha256:…]`. A first path segment with '.' or ':' (or 'localhost') is a
 * registry host; otherwise the image is on Docker Hub (`docker.io`, single names under `library/`).
 */
export function parseImageRef(ref: string): ImageRef {
  let rest = ref.trim()
  let digest: string | null = null
  const at = rest.indexOf('@')
  if (at >= 0) {
    digest = rest.slice(at + 1)
    rest = rest.slice(0, at)
  }
  const parts = rest.split('/')
  let registry = 'docker.io'
  if (parts.length > 1 && (parts[0].includes('.') || parts[0].includes(':') || parts[0] === 'localhost')) {
    registry = parts.shift() as string
  }
  let last = parts[parts.length - 1] ?? ''
  let tag: string | null = null
  const colon = last.lastIndexOf(':')
  if (colon >= 0) {
    tag = last.slice(colon + 1)
    last = last.slice(0, colon)
  }
  parts[parts.length - 1] = last
  if (registry === 'docker.io' && parts.length === 1) parts.unshift('library')
  return { registry, repository: parts.join('/'), tag, digest }
}

export function formatImageRef(r: ImageRef): string {
  const name = r.registry === 'docker.io' ? r.repository.replace(/^library\//, '') : `${r.registry}/${r.repository}`
  return `${name}${r.tag ? `:${r.tag}` : ''}${r.digest ? `@${r.digest}` : ''}`
}

export type PullPolicy = 'Always' | 'IfNotPresent' | 'Never'

/**
 * Kubernetes default when `imagePullPolicy` is omitted (set once, when the object is created).
 * Mirrors `SetDefaults_Container`: `ParseImageName` returns the tag, defaulting it to `latest` only when there is
 * neither a tag nor a digest, and the policy is Always iff that tag is `latest`. So:
 * `name`, `name:latest` and `name:latest@sha256:…` → Always; `name:2.0.1`, `name@sha256:…`, `name:2.0.1@sha256:…` → IfNotPresent.
 */
export function defaultPullPolicy(ref: string): PullPolicy {
  const r = parseImageRef(ref)
  const tag = r.tag ?? (r.digest ? null : 'latest')
  return tag === 'latest' ? 'Always' : 'IfNotPresent'
}

export interface ResolvedRef {
  digest: string | null
  /** 'digest' when the reference carried a digest (the tag, if any, is ignored) */
  via: 'digest' | 'tag'
  tagIgnored: boolean
  error?: string
}

/** Resolve a reference against the registry: with tag@digest the digest wins. */
export function resolveRef(reg: Registry, ref: string): ResolvedRef {
  const r = parseImageRef(ref)
  if (r.registry !== reg.host) return { digest: null, via: r.digest ? 'digest' : 'tag', tagIgnored: false, error: `slika nije u registru ${reg.host}` }
  if (r.digest) {
    return reg.manifests.has(r.digest)
      ? { digest: r.digest, via: 'digest', tagIgnored: r.tag !== null }
      : { digest: null, via: 'digest', tagIgnored: r.tag !== null, error: `manifest unknown: ${shortDigest(r.digest)}` }
  }
  const d = reg.tags.get(repoTag(r.repository, r.tag ?? 'latest')) ?? null
  return d ? { digest: d, via: 'tag', tagIgnored: false } : { digest: null, via: 'tag', tagIgnored: false, error: `manifest unknown: ${r.repository}:${r.tag ?? 'latest'}` }
}

// ---------------------------------------------------------------------------------------------
// Hosts (servers in L08, nodes in L21/L24)
// ---------------------------------------------------------------------------------------------

export interface ImageHost {
  id: string
  name: string
  /** Layer digests present locally */
  blobs: Set<string>
  /** Local name → digest (what `docker images` / the kubelet's image store knows) */
  images: Map<string, string>
  running: { ref: string; digest: string; since: number } | null
  /** A pull in progress (L08 lab animates it; layers arrive one after another) */
  pulling: { ref: string; digest: string; startedAt: number; seconds: number } | null
}

export function createHost(id: string, name: string): ImageHost {
  return { id, name, blobs: new Set(), images: new Map(), running: null, pulling: null }
}

export interface PullPlan {
  ref: string
  policy: PullPolicy
  digest: string | null
  /** true = used the local copy, no registry call (IfNotPresent hit) */
  usedLocal: boolean
  layers: { digest: string; compressedMB: number; cached: boolean; seconds: number }[]
  downloadMB: number
  seconds: number
  error?: string
}

/** What a pull would download onto `host`. Pure. */
export function planPull(reg: Registry, host: ImageHost, ref: string, policy: PullPolicy = defaultPullPolicy(ref), opts: TransferOptions = {}): PullPlan {
  const mbps = rate(opts.mbps, 10)
  const overhead = opts.overheadSec ?? 0.5
  const parsed = parseImageRef(ref)
  const localDigest = parsed.digest ? (host.images.has(parsed.digest) ? parsed.digest : null) : (host.images.get(ref) ?? null)
  if (policy === 'Never' || (policy === 'IfNotPresent' && localDigest)) {
    if (!localDigest) return { ref, policy, digest: null, usedLocal: true, layers: [], downloadMB: 0, seconds: 0, error: 'ErrImageNeverPull: slika nije na čvoru' }
    return { ref, policy, digest: localDigest, usedLocal: true, layers: [], downloadMB: 0, seconds: 0 }
  }
  const res = resolveRef(reg, ref)
  if (!res.digest) return { ref, policy, digest: null, usedLocal: false, layers: [], downloadMB: 0, seconds: overhead, error: res.error ?? 'manifest unknown' }
  const man = reg.manifests.get(res.digest) as RegistryManifest
  const layers = man.layers.map((d) => {
    const blob = reg.blobs.get(d)
    const cached = host.blobs.has(d)
    const mb = blob?.compressedMB ?? 0
    return { digest: d, compressedMB: mb, cached, seconds: cached ? 0 : clean(mb / mbps) }
  })
  const downloadMB = clean(layers.filter((l) => !l.cached).reduce((s, l) => s + l.compressedMB, 0))
  return { ref, policy, digest: res.digest, usedLocal: false, layers, downloadMB, seconds: clean(overhead + layers.reduce((s, l) => s + l.seconds, 0)) }
}

/** Store the pulled layers and remember `ref → digest` locally. */
export function applyPull(host: ImageHost, plan: PullPlan): void {
  if (!plan.digest) return
  for (const l of plan.layers) host.blobs.add(l.digest)
  host.images.set(plan.ref, plan.digest)
  host.images.set(plan.digest, plan.digest)
}

/** Layers two manifests share vs the ones a host must download to move from `from` to `to` (with per-layer rows for a diagram). */
export function layerDiff(
  reg: Registry,
  fromDigest: string | null,
  toDigest: string,
): { shared: string[]; changed: string[]; downloadMB: number; totalMB: number; layers: { digest: string; label: string; sizeMB: number; compressedMB: number; changed: boolean }[] } {
  const to = reg.manifests.get(toDigest)
  if (!to) return { shared: [], changed: [], downloadMB: 0, totalMB: 0, layers: [] }
  const fromLayers = new Set(fromDigest ? (reg.manifests.get(fromDigest)?.layers ?? []) : [])
  const shared = to.layers.filter((d) => fromLayers.has(d))
  const changed = to.layers.filter((d) => !fromLayers.has(d))
  const mb = (ds: string[]) => clean(ds.reduce((s, d) => s + (reg.blobs.get(d)?.compressedMB ?? 0), 0))
  const layers = to.layers.map((d) => {
    const b = reg.blobs.get(d)
    return { digest: d, label: b?.label ?? '', sizeMB: b?.sizeMB ?? 0, compressedMB: b?.compressedMB ?? 0, changed: !fromLayers.has(d) }
  })
  return { shared, changed, downloadMB: mb(changed), totalMB: mb(to.layers), layers }
}
