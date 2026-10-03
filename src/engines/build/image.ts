/**
 * E4 „Tvornica” – image build model (pure, no React/DOM).
 *
 * A Dockerfile is a list of instructions. `planBuild` walks it like BuildKit does:
 *  - stages start at every FROM; only stages the final stage needs are built, independent stages in parallel;
 *  - only FROM, COPY, RUN and a WORKDIR that creates a directory are build steps that produce a layer
 *    (a BuildKit vertex). USER, ENV, ARG, CMD, EXPOSE (and WORKDIR on an existing directory) only change
 *    settings: they create no vertex, so they never invalidate a later COPY;
 *  - each layer step gets a cache key = hash(parent layer key, its definition, inputs), where
 *    COPY: content checksums of the matched build-context files (after .dockerignore) + destination (+ --chown),
 *    COPY --from: content checksum of the copied path in the source stage,
 *    RUN: the command text + the environment it runs in (WORKDIR, USER, ENV, ARG values in scope),
 *         NOT the files it reads and NOT secret mounts;
 *  - a layer step is CACHED iff its definition and inputs are unchanged AND every layer beneath it is cached;
 *  - files have owners: COPY writes root-owned files (unless --chown), WORKDIR creates the directory as the
 *    current USER, a non-root RUN cannot write into a root-owned directory (EACCES, like real Docker);
 *  - layers are immutable: `RUN rm` adds a whiteout, the file stays in the lower layer;
 *  - the image digest is sha256 of the OCI image manifest JSON the engine builds (config digest + layer digests).
 */
import { digestOf, sha256Hex } from './sha256.ts'
import { clean, num, rate } from './common.ts'

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

export type InstructionKind = 'FROM' | 'WORKDIR' | 'COPY' | 'RUN' | 'USER' | 'CMD' | 'EXPOSE' | 'ENV' | 'ARG'

/** Instructions that only change image settings and never create a build step of their own. */
export const METADATA_KINDS: readonly InstructionKind[] = ['USER', 'CMD', 'EXPOSE', 'ENV', 'ARG']

/** What a RUN does to the filesystem (the engine does not execute shell). */
export type RunAction = 'npm-ci' | 'npm-ci-prod' | 'npm-build' | 'pip-install' | 'rm' | 'shell'

export interface Listen {
  /** 0.0.0.0 = reachable through a published port; 127.0.0.1 = only from inside the container */
  addr: '0.0.0.0' | '127.0.0.1'
  port: number
}

export interface SecretValue {
  name: string
  value: string
}

/** One Dockerfile line (a draggable card in the L08 lab). */
export interface Instruction {
  /** Stable card id (used as React key and in plans) */
  id: string
  kind: InstructionKind
  /** The Dockerfile line exactly as shown */
  text: string
  /** FROM: key in BASE_IMAGES */
  base?: string
  /** FROM … AS <name> */
  as?: string
  /** COPY from the build context: patterns ('.', 'package*.json', 'requirements.txt', '.env') */
  src?: string[]
  /** COPY --from=<stage> */
  from?: string
  /** COPY --from: the file key in the source stage (e.g. 'dist/') */
  fromPath?: string
  /** COPY destination (display only) */
  dest?: string
  /** COPY --chown=<user> (without it COPY writes root-owned files, whatever USER says) */
  chown?: string
  /** RUN: modelled effect */
  action?: RunAction
  /** RUN rm <target> */
  target?: string
  /** RUN --mount=type=secret,id=<id> (never written to a layer, not part of the cache key) */
  secretMounts?: string[]
  /**
   * RUN: ARG names the command reads (display only). Like Docker, the engine puts EVERY ARG declared
   * earlier in the stage into each later RUN's environment, cache key and `docker history` line.
   */
  usesArgs?: string[]
  /** USER */
  user?: string
  /** CMD: where the process listens */
  listen?: Listen
  /** ENV / ARG name and default value */
  name?: string
  value?: string
  /** ENV / ARG holds a secret (anti-pattern) */
  secret?: boolean
  /** EXPOSE (documentation only – it does not publish) */
  port?: number
  /** RUN shell: duration override in seconds */
  seconds?: number
}

export type FileRole = 'deps' | 'code' | 'asset' | 'config' | 'local-deps' | 'vcs' | 'secret'

/** A top-level entry of the build context (a file or a directory, modelled as one unit). */
export interface ContextFile {
  path: string
  sizeMB: number
  /** compressed / uncompressed (gzip ratio used for push/pull sizes) */
  ratio: number
  /** Bumped by „Promijeni kod” / „Promijeni ovisnosti” / git operations */
  version: number
  role: FileRole
  /** Listed in .dockerignore (excluded from the context when .dockerignore is on) */
  ignored: boolean
  secret?: SecretValue
  /** Part of the size that is development dependencies (a local node_modules/: 120 MB) */
  devDepsMB?: number
  /** Literal content (Dockerfile, .dockerignore): when set, the checksum is of this text, not of the version */
  content?: string
}

export interface BuildContext {
  files: ContextFile[]
  dockerignore: boolean
  /** docker build --secret id=…  (BuildKit secret mounts) */
  secrets: Record<string, SecretValue>
  /** docker build --build-arg NAME=value */
  args: Record<string, string>
}

export interface BaseLayer {
  digest: string
  sizeMB: number
  compressedMB: number
  label: string
}

export interface BaseImage {
  ref: string
  /** Manifest digest the tag currently resolves to */
  digest: string
  layers: BaseLayer[]
  sizeMB: number
  compressedMB: number
  /** Default user ('root' unless the image sets one) */
  user: string
  workdir: string
  env: string[]
  cmd: string
  listen?: Listen
  /** Programs available in the image (npm, node, python, pip, nginx) */
  provides: string[]
  /** Known critical CVEs (used by the L21 scan station) */
  vulnerable?: boolean
  /** BusyBox coreutils (Alpine): `rm: can't remove …` instead of GNU `rm: cannot remove …` */
  busybox?: boolean
  note: string
}

export interface BuildTimings {
  /** COPY from the build context (illustrative): 1 s */
  copySeconds: number
  /** COPY --from another stage (small, local): 0.2 s */
  copyFromSeconds: number
  /** RUN npm ci (illustrative): 40 s */
  npmCiSeconds: number
  /** RUN npm run build – Vite (illustrative): 3 s */
  npmBuildSeconds: number
  /** RUN pip install (illustrative): 30 s */
  pipInstallSeconds: number
  /** RUN rm: 0.3 s */
  rmSeconds: number
  /** Any other RUN: 1 s */
  shellSeconds: number
  /** WORKDIR / USER / CMD / ENV / ARG / EXPOSE: 0 s */
  metadataSeconds: number
  /** How long a failing step runs before it errors: 1 s */
  failSeconds: number
  /** Base-image pull speed, compressed MB/s: 10 → node:24-slim (80 MB) pulls in 8 s. Values below 0,1 become 0,1. */
  pullMBps: number
}

export const DEFAULT_TIMINGS: BuildTimings = {
  copySeconds: 1,
  copyFromSeconds: 0.2,
  npmCiSeconds: 40,
  npmBuildSeconds: 3,
  pipInstallSeconds: 30,
  rmSeconds: 0.3,
  shellSeconds: 1,
  metadataSeconds: 0,
  failSeconds: 1,
  pullMBps: 10,
}

/**
 * Defaults merged with overrides; a missing, NaN, infinite or negative override keeps the default.
 * `pullMBps` is a speed: 0 or a tiny value is clamped to MIN_MBPS (0,1 MB/s) – never „infinitely fast”.
 */
export function resolveTimings(overrides: Partial<BuildTimings> = {}): BuildTimings {
  const out = { ...DEFAULT_TIMINGS }
  for (const k of Object.keys(DEFAULT_TIMINGS) as (keyof BuildTimings)[]) {
    const v = overrides[k]
    out[k] = k === 'pullMBps' ? (v !== undefined && v < 0 ? DEFAULT_TIMINGS[k] : rate(v, DEFAULT_TIMINGS[k])) : num(v, DEFAULT_TIMINGS[k])
  }
  return out
}

export interface LayerFile {
  /** File key in the stage filesystem ('src/', '.env', 'node_modules/') */
  path: string
  /** Absolute path shown in the inspector ('/app/.env') */
  at: string
  sizeMB: number
  secret?: SecretValue
  /** Development dependencies inside this file group (node_modules/ from `npm ci`: 120 MB of 180 MB) */
  devDepsMB?: number
  /** Owner (COPY: root unless --chown; RUN: the USER it ran as) */
  owner?: string
}

/** An image layer (immutable). Settings-only instructions have no layer. */
export interface Layer {
  digest: string
  sizeMB: number
  compressedMB: number
  createdBy: string
  instructionId: string | null
  added: LayerFile[]
  /** Whiteouts: paths hidden by this layer (the bytes stay in the lower layer) */
  removed: string[]
  /** Sim time when the layer was built (or pulled for base layers) */
  createdAt: number
  /** Base image ref for layers that came with FROM */
  fromBase?: string
}

export interface HistoryEntry {
  createdBy: string
  sizeMB: number
  empty: boolean
  createdAt: number
  layerDigest: string | null
  instructionId: string | null
  /** Secret ARG values visible in `docker history` (`RUN |1 NPM_TOKEN=… /bin/sh -c …`) */
  secretArgs?: SecretValue[]
  /** Secret ENV values visible in `docker history` (`ENV SMS_API_KEY=…`) */
  secretEnv?: SecretValue[]
}

export interface CacheEntry {
  key: string
  layer: Layer | null
  history: HistoryEntry
  inputs: string
  createdAt: number
}

/** BuildKit-style local cache: key → result. Entries are never evicted in the sim. */
export interface BuildCache {
  entries: Map<string, CacheEntry>
  /** (parent key + instruction) → inputs seen by the LAST build that reached this step (run or cached), to explain WHY a step missed */
  lastInputs: Map<string, string>
}

export function createCache(): BuildCache {
  return { entries: new Map(), lastInputs: new Map() }
}

export type CacheReason =
  | 'cache-hit'
  | 'first-build'
  | 'inputs-changed'
  | 'args-changed'
  | 'env-changed'
  | 'instruction-changed'
  | 'parent-rebuilt'
  | 'metadata'
  | 'base-local'
  | 'base-pull'
  | 'base-new'
  | 'unused-stage'
  | 'cancelled'

/** Croatian labels for CacheReason (short, for layer cards). */
export const CACHE_REASON_LABEL: Record<CacheReason, string> = {
  'cache-hit': 'iz predmemorije (CACHED)',
  'first-build': 'prva izgradnja',
  'inputs-changed': 'promijenjene ulazne datoteke',
  'args-changed': 'promijenjena vrijednost ARG-a (--build-arg)',
  'env-changed': 'promijenjen USER, ENV ili WORKDIR iznad (okruženje naredbe)',
  'instruction-changed': 'nova ili premještena naredba',
  'parent-rebuilt': 'sloj ispod je nov ili ponovno izgrađen',
  'metadata': 'samo postavka slike – nema sloja, ne poništava predmemoriju',
  'base-local': 'bazna slika je već lokalno',
  'base-pull': 'povlačenje bazne slike',
  'base-new': 'nova bazna slika',
  'unused-stage': 'faza se ne koristi – preskočena',
  'cancelled': 'prekinuto zbog greške',
}

export type PlanStatus = 'cached' | 'run' | 'failed' | 'skipped'

export interface PlanStep {
  id: string
  /** 1-based line in the effective Dockerfile */
  line: number
  kind: InstructionKind
  text: string
  stage: string
  stageIndex: number
  status: PlanStatus
  cached: boolean
  reason: CacheReason
  /**
   * What changed: for 'inputs-changed' the context paths ('src/', 'Dockerfile'), for 'args-changed' the ARG
   * names, for 'env-changed' 'USER' / 'WORKDIR' / 'ENV <name>' (never a value)
   */
  changedFiles: string[]
  /** Seconds from build start */
  start: number
  duration: number
  end: number
  layer: Layer | null
  sizeMB: number
  cacheKey: string
  /** A settings-only line (USER, ENV, ARG, CMD, EXPOSE, WORKDIR on an existing directory): no layer, never invalidates a later layer by itself */
  metadataOnly: boolean
  /** The user the step ran as (RUN) or the owner of what it wrote (COPY, WORKDIR) */
  user: string
  error?: string
  /** Pull of a base image into the builder (FROM, not yet local) */
  pullsBase?: string
}

export interface ImageConfigView {
  user: string
  cmd: string
  workdir: string
  env: string[]
  exposed: number[]
  listen: Listen | null
}

export interface Image {
  /** sha256 of the image manifest JSON (the platform manifest – see DIGEST_NOTE) */
  digest: string
  configDigest: string
  manifestJson: string
  configJson: string
  /** Final-stage layers (base layers first) – settings-only lines are not layers */
  layers: Layer[]
  history: HistoryEntry[]
  sizeMB: number
  compressedMB: number
  config: ImageConfigView
  /** Name of the final stage */
  stage: string
  baseRef: string
  createdAt: number
  /** env secrets set with ENV (visible in `docker inspect`) */
  envSecrets: SecretValue[]
  /**
   * Owner of every directory the final stage knows (absolute path → user; base directories are root-owned, WORKDIR
   * creates its directory as the USER at that line). Not part of the digest. Absent on images made outside build().
   */
  dirOwners?: Record<string, string>
}

/**
 * What `Image.digest` is. Docker 29 (containerd image store) adds provenance attestations by default and pushes
 * an image index whose digest changes on every build (the attestation records build times); the platform image
 * manifest inside it – what this engine computes – is what stays the same for an unchanged, fully cached build.
 */
export const DIGEST_NOTE =
  'digest manifesta slike (linux/amd64). Docker 29 uz zadane atestacije šalje i popis manifesta (indeks) čiji se digest mijenja svakom izgradnjom; isti ostaje digest manifesta slike, npr. uz --provenance=false ili u docker buildx imagetools inspect.'

export interface BuildPlan {
  steps: PlanStep[]
  totalSeconds: number
  ok: boolean
  error: { stepId: string; line: number; message: string } | null
  image: Image | null
  /** Cache writes, applied when the step's end time passes (failed builds keep what finished) */
  writes: { at: number; key: string; sigKey: string; entry: CacheEntry }[]
  /** Inputs of steps served from the cache: recorded too, so the next miss is explained against THIS build */
  seen: { at: number; sigKey: string; inputs: string }[]
  /** Base images that become local when their FROM step ends (the builder stores them by digest) */
  basePulls: { at: number; ref: string; digest: string }[]
  /** Number of layer steps rebuilt / served from cache (excluding unused stages and settings-only lines) */
  rebuilt: number
  cachedCount: number
}

export interface PlanOptions {
  context: BuildContext
  cache: BuildCache
  /**
   * Base image DIGESTS already in the builder's local store. Stored by content, so a tag that now
   * resolves to a newer image (same ref, new digest) is pulled again and invalidates the cache.
   */
  localBases: ReadonlySet<string>
  timings?: Partial<BuildTimings>
  /** Distinguishes builds: RUN layers built in different builds get different digests (timestamps) */
  buildId: number
  /** Sim time at build start (layer `createdAt` = now + step end) */
  now: number
  /** SOURCE_DATE_EPOCH-style reproducible RUN layers (default false, like a plain `docker build`) */
  reproducible?: boolean
  seed?: number
  /** Override the base catalogue (tests, L21 base-tag drift) */
  bases?: Record<string, BaseImage>
  /**
   * The project depends on a private npm package (`@klopa/ui`): `npm ci` must see a token – an ARG or ENV
   * NPM_TOKEN in scope, a copied `.npmrc`, or a `--mount=type=secret` whose secret was passed – or it fails with E401.
   */
  privateNpm?: boolean
}

// ---------------------------------------------------------------------------------------------
// Base images (sizes are uncompressed like `docker history`; compressed = transfer size)
// ---------------------------------------------------------------------------------------------

function makeBase(
  ref: string,
  sizeMB: number,
  compressedMB: number,
  split: [string, number][],
  rest: Omit<BaseImage, 'ref' | 'digest' | 'layers' | 'sizeMB' | 'compressedMB'>,
): BaseImage {
  const layers: BaseLayer[] = split.map(([label, frac], i) => ({
    digest: digestOf(`base-layer|${ref}|${i}|${label}`),
    sizeMB: clean(sizeMB * frac),
    compressedMB: clean(compressedMB * frac),
    label,
  }))
  const digest = digestOf(`base-manifest|${ref}|${layers.map((l) => l.digest).join(',')}`)
  return { ref, digest, layers, sizeMB, compressedMB, ...rest }
}

/**
 * Base images used by the lectures. Tags are pinned (verify current tags when authoring a lecture).
 * Sizes: node full ≈1,1 GB vs slim ≈250 MB (L08 model); nginx-unprivileged runtime ≈47 MB (+ dist ≈ 50 MB).
 * Debian releases behind the tags (docker-library, listopad 2026.): node:24 / node:24-slim → bookworm,
 * python:3.13-slim → trixie (bookworm is the separate -slim-bookworm tag).
 */
export const BASE_IMAGES: Record<string, BaseImage> = {
  'node:24': makeBase('node:24', 1100, 390, [['Debian (bookworm)', 0.45], ['alati za izgradnju', 0.4], ['Node.js', 0.13], ['npm i yarn', 0.02]], {
    user: 'root',
    workdir: '/',
    env: ['NODE_VERSION=24'],
    cmd: 'node',
    provides: ['node', 'npm', 'git', 'gcc'],
    note: 'puna slika s alatima za izgradnju',
  }),
  'node:24-slim': makeBase('node:24-slim', 250, 80, [['Debian (bookworm-slim)', 0.3], ['Node.js', 0.6], ['npm i yarn', 0.1]], {
    user: 'root',
    workdir: '/',
    env: ['NODE_VERSION=24'],
    cmd: 'node',
    provides: ['node', 'npm'],
    note: 'manja slika bez alata za izgradnju',
  }),
  'nginxinc/nginx-unprivileged:1.30-alpine': makeBase(
    'nginxinc/nginx-unprivileged:1.30-alpine',
    47,
    20,
    [['Alpine Linux', 0.18], ['nginx', 0.8], ['konfiguracija (port 8080)', 0.02]],
    {
      user: '101',
      workdir: '/',
      env: [],
      cmd: 'nginx -g "daemon off;"',
      listen: { addr: '0.0.0.0', port: 8080 },
      provides: ['nginx'],
      busybox: true,
      note: 'nginx kao korisnik koji nije root (UID 101), sluša na 8080',
    },
  ),
  'python:3.13-slim': makeBase('python:3.13-slim', 125, 45, [['Debian (trixie-slim)', 0.6], ['Python', 0.38], ['pip', 0.02]], {
    user: 'root',
    workdir: '/',
    env: ['PYTHON_VERSION=3.13'],
    cmd: 'python3',
    provides: ['python', 'pip'],
    note: 'Python bez alata za izgradnju',
  }),
  'python:3.9-slim-buster': makeBase('python:3.9-slim-buster', 115, 42, [['Debian (buster)', 0.62], ['Python', 0.36], ['pip', 0.02]], {
    user: 'root',
    workdir: '/',
    env: ['PYTHON_VERSION=3.9'],
    cmd: 'python3',
    provides: ['python', 'pip'],
    vulnerable: true,
    note: 'zastarjela slika: Debian buster i Python 3.9 više ne dobivaju sigurnosne zakrpe',
  }),
}

/**
 * The same tag after upstream republished it (e.g. a Debian security patch): every layer and the
 * manifest digest change, the ref stays. `revision` 0 returns the image unchanged.
 * Used by L21 „Izgradi jednom”: a later rebuild of the same commit is a different artefact.
 */
export function patchedBase(base: BaseImage, revision: number): BaseImage {
  if (!(revision > 0)) return base
  const layers = base.layers.map((l) => ({ ...l, digest: digestOf(`${l.digest}|zakrpa:${revision}`) }))
  const digest = digestOf(`base-manifest|${base.ref}|${layers.map((l) => l.digest).join(',')}`)
  return { ...base, layers, digest, note: `${base.note} (nova verzija iza istog taga, ${revision}.)` }
}

/** Seconds to pull a base image into an empty builder (a speed below 0,1 MB/s counts as 0,1 MB/s). */
export function basePullSeconds(base: BaseImage, pullMBps = DEFAULT_TIMINGS.pullMBps): number {
  return clean(base.compressedMB / rate(pullMBps, DEFAULT_TIMINGS.pullMBps))
}

// ---------------------------------------------------------------------------------------------
// RUN effects
// ---------------------------------------------------------------------------------------------

interface ProductSpec {
  path: string
  sizeMB: number
  ratio: number
  /** paths whose content defines the product */
  dependsOn: string[]
  /** program needed in the image */
  needs: string
  /** files that must exist, with the error shown when one is missing */
  requires: { path: string; error: string }[]
  seconds: keyof BuildTimings
  at: string
  /** Development dependencies inside the product */
  devDepsMB?: number
  /** Where the product is written: the WORKDIR, or a fixed system directory */
  writesTo: 'workdir' | '/usr/local'
}

const PRODUCTS: Partial<Record<RunAction, ProductSpec>> = {
  'npm-ci': {
    path: 'node_modules/',
    sizeMB: 180,
    ratio: 0.3,
    dependsOn: ['package.json', 'package-lock.json'],
    needs: 'npm',
    requires: [
      { path: 'package.json', error: 'npm error enoent: package.json ne postoji – COPY package*.json mora biti prije RUN npm ci' },
      { path: 'package-lock.json', error: 'npm error: `npm ci` radi samo uz postojeći package-lock.json' },
    ],
    seconds: 'npmCiSeconds',
    at: 'node_modules/',
    devDepsMB: 120,
    writesTo: 'workdir',
  },
  // `npm ci --omit=dev`: only runtime dependencies – but Vite itself is a development dependency
  'npm-ci-prod': {
    path: 'node_modules/',
    sizeMB: 60,
    ratio: 0.3,
    dependsOn: ['package.json', 'package-lock.json'],
    needs: 'npm',
    requires: [
      { path: 'package.json', error: 'npm error enoent: package.json ne postoji – COPY package*.json mora biti prije RUN npm ci' },
      { path: 'package-lock.json', error: 'npm error: `npm ci` radi samo uz postojeći package-lock.json' },
    ],
    seconds: 'npmCiSeconds',
    at: 'node_modules/',
    devDepsMB: 0,
    writesTo: 'workdir',
  },
  'npm-build': {
    path: 'dist/',
    sizeMB: 3,
    ratio: 0.35,
    dependsOn: ['src/', 'index.html', 'public/', 'vite.config.ts', 'node_modules/'],
    needs: 'npm',
    requires: [
      { path: 'node_modules/', error: 'sh: vite: not found (exit 127) – ovisnosti još nisu instalirane' },
      { path: 'src/', error: 'vite: nema izvornog koda (src/) – COPY . . mora biti prije RUN npm run build' },
      { path: 'index.html', error: 'vite: Could not resolve entry module "index.html"' },
    ],
    seconds: 'npmBuildSeconds',
    at: 'dist/',
    writesTo: 'workdir',
  },
  'pip-install': {
    path: 'site-packages/',
    sizeMB: 70,
    ratio: 0.35,
    dependsOn: ['requirements.txt'],
    needs: 'pip',
    requires: [{ path: 'requirements.txt', error: 'ERROR: Could not open requirements file: requirements.txt ne postoji' }],
    seconds: 'pipInstallSeconds',
    at: '/usr/local/lib/python3/site-packages/',
    writesTo: '/usr/local',
  },
}

/** Size of node_modules that are development dependencies (Vite, TypeScript, ESLint…). */
export const NODE_MODULES_DEV_MB = 120

/** The layer `WORKDIR /app` makes when it creates the directory (`docker history`: „8.19kB”). */
export const WORKDIR_LAYER_MB = 0.008

/** Development dependencies a container of this image carries (whiteouts applied): 120 MB single-stage, 0 multi-stage. */
export function devDepsInImage(image: Image): number {
  const visible = new Map<string, number>()
  for (const l of image.layers) {
    for (const r of l.removed) visible.delete(r)
    for (const f of l.added) visible.set(f.path, f.devDepsMB ?? 0)
  }
  return clean([...visible.values()].reduce((a, b) => a + b, 0))
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

/** Content identity of a context file version (or of its literal content, e.g. the Dockerfile text). */
export function contentId(file: Pick<ContextFile, 'path' | 'version' | 'content'>): string {
  return sha256Hex(file.content !== undefined ? `content|${file.path}|text:${file.content}` : `content|${file.path}|v${file.version}`).slice(0, 16)
}

/** Files that are actually sent to the builder (after .dockerignore). */
export function effectiveContext(ctx: BuildContext): ContextFile[] {
  return ctx.files.filter((f) => !(ctx.dockerignore && f.ignored))
}

export function contextSizeMB(ctx: BuildContext): number {
  return clean(effectiveContext(ctx).reduce((s, f) => s + f.sizeMB, 0))
}

function globToRegExp(pattern: string): RegExp {
  const esc = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${esc}$`)
}

/** Match COPY source patterns against context files. '.' matches everything that is in the context. */
export function matchContext(patterns: readonly string[], files: readonly ContextFile[]): { matched: ContextFile[]; missing: string[] } {
  const matched = new Map<string, ContextFile>()
  const missing: string[] = []
  for (const p of patterns) {
    const hits = p === '.' || p === './' ? [...files] : files.filter((f) => globToRegExp(p.replace(/^\.\//, '')).test(f.path) || f.path === p)
    if (hits.length === 0) missing.push(p)
    for (const h of hits) matched.set(h.path, h)
  }
  return { matched: [...matched.values()].sort((a, b) => a.path.localeCompare(b.path)), missing }
}

const joinPath = (dir: string, p: string) => (p.startsWith('/') ? p : `${dir.replace(/\/$/, '')}/${p}`)

/** Resolve a WORKDIR argument against the current one ('/app', 'src' → '/app/src'), without a trailing slash. */
function resolveDir(cur: string, arg: string): string {
  const raw = arg.trim() || cur
  const abs = raw.startsWith('/') ? raw : joinPath(cur, raw)
  const out = abs.replace(/\/+$/, '')
  return out === '' ? '/' : out
}

const userOf = (u: string) => u.trim().split(':')[0]

interface FsEntry {
  path: string
  /** Content identity (what BuildKit checksums for COPY cache keys – mtimes are ignored) */
  cid: string
  sizeMB: number
  secret?: SecretValue
  /** Digest of the layer that wrote the bytes: files produced by RUN carry that build's timestamps */
  origin?: string
  devDepsMB?: number
  owner: string
}

interface StageState {
  index: number
  name: string
  base: BaseImage | null
  steps: PlanStep[]
  fs: Map<string, FsEntry>
  /** Absolute directory → owner (base directories are root-owned) */
  dirs: Map<string, string>
  workdir: string
  user: string
  cmd: string
  listen: Listen | null
  env: string[]
  envSecrets: SecretValue[]
  exposed: number[]
  /** ARGs declared in this stage (global ARGs must be re-declared to be in scope), in declaration order */
  args: Record<string, string>
  secretArgNames: Set<string>
  layers: Layer[]
  history: HistoryEntry[]
  end: number
  failed: boolean
  needed: boolean
}

const ISO_EPOCH = Date.UTC(2026, 9, 1, 9, 0, 0) // 1. listopada 2026. 09:00 UTC – deterministic timestamps

/** ISO time for a sim second (deterministic). */
export function simIso(t: number): string {
  return new Date(ISO_EPOCH + Math.round((Number.isFinite(t) ? t : 0) * 1000)).toISOString()
}

function instrSignature(i: Instruction): string {
  // Everything that changes the meaning of the line (text alone is what BuildKit hashes).
  return `${i.kind}|${i.text}`
}

const h12 = (v: string) => sha256Hex(`v|${v}`).slice(0, 12)

function diffInputs(prev: string, next: string): string[] {
  const parse = (s: string) => new Map(s.split(',').filter(Boolean).map((kv) => kv.split('@') as [string, string]))
  const a = parse(prev)
  const b = parse(next)
  const changed = new Set<string>()
  for (const [k, v] of b) if (a.get(k) !== v) changed.add(k)
  for (const k of a.keys()) if (!b.has(k)) changed.add(k)
  return [...changed].sort()
}

/** Turn changed input keys into a reason and student-facing names (never values). */
function explainChange(changed: string[]): { reason: CacheReason; names: string[] } {
  const envKey = (k: string) => k === 'cwd' || k === 'user' || k === 'dest' || k === 'chown' || k.startsWith('env:')
  const label = (k: string) => (k === 'cwd' || k === 'dest' ? 'WORKDIR' : k === 'user' ? 'USER' : k === 'chown' ? '--chown' : k.startsWith('env:') ? `ENV ${k.slice(4)}` : k.replace(/^arg:/, ''))
  const names = [...new Set(changed.map(label))]
  if (changed.every((k) => k.startsWith('arg:'))) return { reason: 'args-changed', names }
  if (changed.every((k) => k.startsWith('arg:') || envKey(k))) return { reason: 'env-changed', names }
  return { reason: 'inputs-changed', names: [...new Set(changed.filter((k) => !k.startsWith('arg:') && !envKey(k)))] }
}

// ---------------------------------------------------------------------------------------------
// planBuild
// ---------------------------------------------------------------------------------------------

/**
 * Compute what `docker build` would do, step by step, with times relative to the build start.
 * Pure: does not mutate the cache – apply `plan.writes` / `plan.seen` / `plan.basePulls` when their time passes
 * (the lab does it during the animation; `applyPlanWrites` does it at once).
 */
export function planBuild(instructions: readonly Instruction[], opts: PlanOptions): BuildPlan {
  const timing = resolveTimings(opts.timings)
  const now = num(opts.now, 0)
  const bases = opts.bases ?? BASE_IMAGES
  const ctxFiles = effectiveContext(opts.context)
  const firstBuild = opts.cache.entries.size === 0
  const nonce = opts.reproducible ? '' : `|built:${opts.seed ?? 0}:${opts.buildId}`

  const lines = instructions.map((ins, i) => ({ ins, line: i + 1 }))
  const steps: PlanStep[] = []
  const writes: BuildPlan['writes'] = []
  const seen: BuildPlan['seen'] = []
  const basePulls: BuildPlan['basePulls'] = []
  let error: BuildPlan['error'] = null

  const blankStep = (ins: Instruction, line: number, stage: string, stageIndex: number): PlanStep => ({
    id: ins.id,
    line,
    kind: ins.kind,
    text: ins.text,
    stage,
    stageIndex,
    status: 'skipped',
    cached: false,
    reason: 'unused-stage',
    changedFiles: [],
    start: 0,
    duration: 0,
    end: 0,
    layer: null,
    sizeMB: 0,
    cacheKey: '',
    metadataOnly: METADATA_KINDS.includes(ins.kind),
    user: 'root',
  })
  const fail = (): BuildPlan => ({ steps, totalSeconds: 0, ok: false, error, image: null, writes, seen, basePulls, rebuilt: 0, cachedCount: 0 })

  // ---- 1. split into stages ----
  const stages: { name: string; index: number; items: { ins: Instruction; line: number }[] }[] = []
  const globalArgs: Record<string, string> = {}
  for (const item of lines) {
    if (item.ins.kind === 'FROM') {
      stages.push({ name: item.ins.as ?? String(stages.length), index: stages.length, items: [item] })
      continue
    }
    if (stages.length === 0) {
      if (item.ins.kind === 'ARG' && item.ins.name) {
        globalArgs[item.ins.name] = opts.context.args[item.ins.name] ?? item.ins.value ?? ''
        continue
      }
      const s = blankStep(item.ins, item.line, '—', -1)
      s.status = 'failed'
      s.reason = 'cancelled'
      s.error = 'naredba prije prve FROM: nema faze izgradnje (no build stage in current context)'
      steps.push(s)
      error ??= { stepId: s.id, line: s.line, message: s.error }
      continue
    }
    stages[stages.length - 1].items.push(item)
  }
  if (stages.length === 0) {
    if (!error) error = { stepId: '', line: 0, message: 'Dockerfile nema naredbu FROM' }
    return fail()
  }
  if (error) {
    for (const st of stages) for (const it of st.items) steps.push({ ...blankStep(it.ins, it.line, st.name, st.index), reason: 'cancelled' })
    steps.sort((a, b) => a.line - b.line)
    return fail()
  }

  // ---- 2. which stages are needed (final = last stage, plus COPY --from closure) ----
  const byName = new Map(stages.map((s) => [s.name, s]))
  const needed = new Set<number>()
  const visit = (idx: number) => {
    if (needed.has(idx)) return
    needed.add(idx)
    for (const it of stages[idx].items) {
      if (it.ins.kind === 'COPY' && it.ins.from) {
        const src = byName.get(it.ins.from)
        if (src && src.index < idx) visit(src.index)
      }
    }
  }
  visit(stages.length - 1)

  // ---- 3. simulate each needed stage ----
  const states: StageState[] = []
  for (const st of stages) {
    const ss: StageState = {
      index: st.index,
      name: st.name,
      base: null,
      steps: [],
      fs: new Map(),
      dirs: new Map([['/', 'root']]),
      workdir: '/',
      user: 'root',
      cmd: '',
      listen: null,
      env: [],
      envSecrets: [],
      exposed: [],
      args: {},
      secretArgNames: new Set(),
      layers: [],
      history: [],
      end: 0,
      failed: false,
      needed: needed.has(st.index),
    }
    states.push(ss)
    if (!ss.needed) {
      for (const it of st.items) {
        const s = blankStep(it.ins, it.line, st.name, st.index)
        ss.steps.push(s)
        steps.push(s)
      }
      continue
    }

    /** Key of the newest step that produced the filesystem (FROM, COPY, RUN, WORKDIR mkdir) */
    let parentKey = ''
    /** That step was rebuilt in this build */
    let parentMissed = false
    let tCursor = 0
    let stopped = false

    const canWrite = (dir: string) => {
      const u = userOf(ss.user)
      return u === 'root' || u === '0' || userOf(ss.dirs.get(dir) ?? 'root') === u
    }
    const denied = (dir: string) => `${dir} pripada korisniku ${ss.dirs.get(dir) ?? 'root'}, a RUN se izvodi kao ${ss.user} (COPY bez --chown i WORKDIR prije USER stvaraju sadržaj korisnika root)`

    for (const { ins, line } of st.items) {
      const step = blankStep(ins, line, st.name, st.index)
      ss.steps.push(step)
      steps.push(step)
      if (stopped) {
        step.reason = 'cancelled'
        continue
      }

      let inputs = ''
      let seconds = timing.metadataSeconds
      let err: string | undefined
      /**
       * An error that happens only when the command actually EXECUTES (npm E401 without a token). BuildKit never
       * executes a cache hit, so this fails the build only on a cache miss.
       */
      let execErr: string | undefined
      let startAt = tCursor
      let vertex = !step.metadataOnly
      let depFailed: StageState | null = null
      // Effects are computed first, applied after the cache decision (they are identical either way).
      let apply: (() => { layer: Omit<Layer, 'digest' | 'createdAt' | 'createdBy' | 'instructionId'> | null; contentKey: string }) | null = null
      let pullsBase: string | undefined
      step.user = ss.user

      switch (ins.kind) {
        case 'FROM': {
          const base = ins.base ? bases[ins.base] : undefined
          if (!base) {
            err = `bazna slika „${ins.base ?? '?'}” ne postoji u katalogu`
            break
          }
          ss.base = base
          inputs = base.digest
          if (!opts.localBases.has(base.digest)) {
            seconds = basePullSeconds(base, timing.pullMBps)
            pullsBase = base.ref
          } else seconds = 0
          break
        }
        case 'WORKDIR': {
          const wd = resolveDir(ss.workdir, ins.text.replace(/^WORKDIR\s+/, ''))
          if (wd === '/' || ss.dirs.has(wd)) {
            // The directory exists: only the working directory setting changes (no layer).
            vertex = false
            step.metadataOnly = true
            inputs = `cwd@${h12(wd)}`
            break
          }
          // BuildKit: mkdir -p as the current USER, committed as a (tiny) layer.
          const owner = ss.user
          step.user = owner
          inputs = `user@${h12(owner)}`
          apply = () => {
            ss.dirs.set(wd, owner)
            return { layer: { sizeMB: WORKDIR_LAYER_MB, compressedMB: 0.0002, added: [], removed: [] }, contentKey: `workdir|${wd}|${owner}` }
          }
          break
        }
        case 'USER':
        case 'CMD':
        case 'EXPOSE':
        case 'ENV':
          inputs = ins.text
          break
        case 'ARG':
          // The definition itself never misses: a new value misses at its first use (Dockerfile reference).
          inputs = ins.name ?? ''
          break
        case 'COPY': {
          const owner = ins.chown ?? 'root'
          step.user = owner
          if (ins.from !== undefined) {
            const src = byName.get(ins.from)
            if (!src || src.index >= st.index) {
              err =
                src && src.index === st.index
                  ? `COPY --from=${ins.from}: faza ne može kopirati iz same sebe (circular dependency)`
                  : `COPY --from=${ins.from}: faza „${ins.from}” nije definirana iznad ove naredbe`
              break
            }
            const srcState = states[src.index]
            // The copy runs only after the source stage has finished (or failed).
            startAt = Math.max(tCursor, srcState.end)
            if (srcState.failed) {
              depFailed = srcState
              break
            }
            const key = ins.fromPath ?? ''
            const entry = srcState.fs.get(key)
            if (!entry) {
              err = `COPY --from=${ins.from}: "${key ? joinPath('/app', key) : '?'}" not found – faza „${ins.from}” to ne proizvodi`
              break
            }
            const dest = ins.dest ?? key
            inputs = `${key}@${entry.cid},dest@${h12(dest)},chown@${h12(owner)}`
            seconds = timing.copyFromSeconds
            apply = () => {
              ss.fs.set(key, { path: key, cid: entry.cid, sizeMB: entry.sizeMB, secret: entry.secret, origin: entry.origin, devDepsMB: entry.devDepsMB, owner })
              return {
                layer: {
                  sizeMB: entry.sizeMB,
                  compressedMB: clean(entry.sizeMB * 0.35),
                  added: [{ path: key, at: dest, sizeMB: entry.sizeMB, secret: entry.secret, devDepsMB: entry.devDepsMB, owner }],
                  removed: [],
                },
                // Same content → cache hit; but the copied files keep the mtimes of the RUN that made them,
                // so a freshly rebuilt dist/ gives a new layer digest unless the build is reproducible.
                contentKey: `copyfrom|${inputs}|${dest}|${entry.origin ?? ''}`,
              }
            }
            break
          }
          const { matched, missing } = matchContext(ins.src ?? [], ctxFiles)
          if (missing.length > 0) {
            const ignoredHit = missing.some((p) => opts.context.files.some((f) => f.ignored && opts.context.dockerignore && (f.path === p || globToRegExp(p).test(f.path))))
            err = `"/${missing[0]}": not found${ignoredHit ? ' – datoteka je u .dockerignore, pa nije u kontekstu izgradnje' : ''}`
            break
          }
          const wd = ss.workdir
          const dest = joinPath(wd, ins.dest ?? '.')
          inputs = [...matched.map((f) => `${f.path}@${contentId(f)}`), `dest@${h12(dest)}`, `chown@${h12(owner)}`].join(',')
          seconds = timing.copySeconds
          apply = () => {
            for (const f of matched) ss.fs.set(f.path, { path: f.path, cid: contentId(f), sizeMB: f.sizeMB, secret: f.secret, devDepsMB: f.devDepsMB, owner })
            const sizeMB = clean(matched.reduce((s, f) => s + f.sizeMB, 0))
            return {
              layer: {
                sizeMB,
                compressedMB: clean(matched.reduce((s, f) => s + f.sizeMB * f.ratio, 0)),
                added: matched.map((f) => ({ path: f.path, at: joinPath(wd, f.path), sizeMB: f.sizeMB, secret: f.secret, devDepsMB: f.devDepsMB, owner })),
                removed: [],
              },
              contentKey: `copy|${inputs}`,
            }
          }
          break
        }
        case 'RUN': {
          // A RUN's definition includes its whole environment: working directory, user, ENV and every ARG in
          // scope (values hashed, so no secret ever reaches a label or a key in clear text).
          inputs = [
            `cwd@${h12(ss.workdir)}`,
            `user@${h12(ss.user)}`,
            ...ss.env.map((e) => {
              const i = e.indexOf('=')
              return `env:${i < 0 ? e : e.slice(0, i)}@${h12(i < 0 ? '' : e.slice(i + 1))}`
            }),
            ...Object.keys(ss.args).map((n) => `arg:${n}@${h12(`arg|${ss.args[n]}`)}`),
          ].join(',')
          const action = ins.action ?? 'shell'
          const wd = ss.workdir
          if (action === 'rm') {
            const target = ins.target ?? ''
            seconds = timing.rmSeconds
            const rmCmd = ss.base?.busybox ? "rm: can't remove" : 'rm: cannot remove'
            if (!ss.fs.has(target)) {
              err = `${rmCmd} '${target}': No such file or directory`
              break
            }
            if (!canWrite(wd)) {
              err = `${rmCmd} '${target}': Permission denied – ${denied(wd)}`
              break
            }
            apply = () => {
              ss.fs.delete(target)
              return { layer: { sizeMB: 0, compressedMB: 0, added: [], removed: [target] }, contentKey: `rm|${target}` }
            }
            break
          }
          if (action === 'shell') {
            seconds = num(ins.seconds, timing.shellSeconds)
            apply = () => ({ layer: { sizeMB: 0, compressedMB: 0, added: [], removed: [] }, contentKey: `shell|${ins.text}` })
            break
          }
          const spec = PRODUCTS[action]
          if (!spec) break
          seconds = timing[spec.seconds]
          if (!ss.base?.provides.includes(spec.needs)) {
            err = `/bin/sh: ${spec.needs}: not found (exit 127) – bazna slika nema ${spec.needs}`
            break
          }
          const missingReq = spec.requires.find((r) => !ss.fs.has(r.path))
          if (missingReq) {
            err = missingReq.error
            break
          }
          const outDir = spec.writesTo === 'workdir' ? wd : spec.writesTo
          if (!canWrite(outDir)) {
            err =
              action === 'pip-install'
                ? `ERROR: Could not install packages due to an OSError: [Errno 13] Permission denied: '/usr/local/lib/python3/site-packages' – pip kao korisnik ${ss.user} ne smije pisati u /usr/local (vlasnik root)`
                : action === 'npm-build'
                  ? `Error: EACCES: permission denied, mkdir '${joinPath(wd, 'dist')}' – ${denied(wd)}`
                  : `npm error EACCES: permission denied, mkdir '${joinPath(wd, 'node_modules')}' – ${denied(wd)}`
            break
          }
          if (opts.privateNpm && (action === 'npm-ci' || action === 'npm-ci-prod')) {
            const envToken = ss.env.some((e) => e.startsWith('NPM_TOKEN=') && e.length > 'NPM_TOKEN='.length)
            const argToken = (ss.args.NPM_TOKEN ?? '') !== ''
            const mount = (ins.secretMounts ?? []).some((id) => !!opts.context.secrets[id])
            if (!envToken && !argToken && !mount && !ss.fs.has('.npmrc')) {
              // Not part of the cache key (a secret mount never is): decided after the cache lookup below.
              execErr = 'npm error code E401 – 401 Unauthorized - GET https://npm.klopa.example/@klopa%2fui – RUN npm ci ne vidi NPM_TOKEN (ARG u ovoj fazi, .npmrc ili --mount=type=secret)'
            }
          }
          if (action === 'npm-build' && ss.fs.get('node_modules/')?.devDepsMB === 0) {
            err = 'sh: vite: not found (exit 127) – Vite je razvojna ovisnost, a npm ci --omit=dev je ne instalira'
            break
          }
          const depIds = spec.dependsOn.map((p) => `${p}@${ss.fs.get(p)?.cid ?? '-'}`).join(',')
          const productCid = sha256Hex(`product|${action}|${depIds}`).slice(0, 16)
          const owner = ss.user
          apply = () => {
            const removed: string[] = []
            if (ss.fs.has(spec.path)) removed.push(spec.path) // e.g. npm ci deletes a copied node_modules first
            ss.fs.set(spec.path, { path: spec.path, cid: productCid, sizeMB: spec.sizeMB, devDepsMB: spec.devDepsMB, owner })
            return {
              layer: {
                sizeMB: spec.sizeMB,
                compressedMB: clean(spec.sizeMB * spec.ratio),
                added: [{ path: spec.path, at: spec.at.startsWith('/') ? spec.at : joinPath(wd, spec.at), sizeMB: spec.sizeMB, devDepsMB: spec.devDepsMB, owner }],
                removed,
              },
              contentKey: `run|${action}|${productCid}`,
            }
          }
          break
        }
      }

      if (depFailed) {
        // BuildKit never starts a COPY --from whose source stage failed: the source's own error is the build error.
        step.status = 'skipped'
        step.reason = 'cancelled'
        step.start = clean(startAt)
        step.end = step.start
        ss.failed = true
        ss.end = depFailed.end
        stopped = true
        continue
      }

      if (err) {
        step.status = 'failed'
        step.metadataOnly = false
        step.reason = firstBuild ? 'first-build' : parentMissed ? 'parent-rebuilt' : 'instruction-changed'
        step.error = err
        step.start = clean(startAt)
        step.duration = clean(Math.min(timing.failSeconds, Math.max(seconds, 0)))
        step.end = clean(step.start + step.duration)
        ss.failed = true
        ss.end = step.end
        stopped = true
        continue
      }

      const sigKey = `${parentKey}|${instrSignature(ins)}`
      const key = sha256Hex(`${parentKey}|${instrSignature(ins)}|${inputs}`)
      const hit = opts.cache.entries.get(key)
      step.cacheKey = key

      if (ins.kind === 'FROM') {
        const base = ss.base as BaseImage
        step.cached = !!hit
        step.status = hit ? 'cached' : 'run'
        step.reason = firstBuild ? 'first-build' : pullsBase ? 'base-pull' : hit ? 'base-local' : 'base-new'
        if (pullsBase) step.reason = 'base-pull'
        step.start = clean(startAt)
        step.duration = clean(seconds)
        step.end = clean(step.start + step.duration)
        step.pullsBase = pullsBase
        step.sizeMB = base.sizeMB
        ss.user = base.user
        step.user = base.user
        ss.workdir = base.workdir
        ss.dirs = new Map([
          ['/', 'root'],
          ['/usr/local', 'root'],
          [base.workdir, 'root'],
        ])
        ss.cmd = base.cmd
        ss.listen = base.listen ?? null
        ss.env = [...base.env]
        ss.args = {}
        ss.secretArgNames = new Set()
        for (const bl of base.layers) {
          ss.layers.push({
            digest: bl.digest,
            sizeMB: bl.sizeMB,
            compressedMB: bl.compressedMB,
            createdBy: `${bl.label} (bazna slika ${base.ref})`,
            instructionId: ins.id,
            added: [],
            removed: [],
            createdAt: 0,
            fromBase: base.ref,
          })
          ss.history.push({ createdBy: `${bl.label} (bazna slika ${base.ref})`, sizeMB: bl.sizeMB, empty: false, createdAt: 0, layerDigest: bl.digest, instructionId: ins.id })
        }
        if (pullsBase) basePulls.push({ at: step.end, ref: pullsBase, digest: base.digest })
        const entry: CacheEntry = {
          key,
          layer: null,
          history: { createdBy: ins.text, sizeMB: 0, empty: true, createdAt: 0, layerDigest: null, instructionId: ins.id },
          inputs,
          createdAt: 0,
        }
        if (!hit) writes.push({ at: step.end, key, sigKey, entry })
        parentMissed = !hit && !firstBuild
        parentKey = key
        tCursor = step.end
        continue
      }

      // Non-FROM steps
      /** Why a layer step missed: the first build, a rebuilt parent, or what changed since the last build of this line. */
      const explainMiss = () => {
        if (firstBuild) step.reason = 'first-build'
        else if (parentMissed) step.reason = 'parent-rebuilt'
        else {
          const prev = opts.cache.lastInputs.get(sigKey)
          if (prev !== undefined && prev !== inputs) {
            const { reason, names } = explainChange(diffInputs(prev, inputs))
            step.reason = reason
            step.changedFiles = names
          } else step.reason = 'instruction-changed'
        }
      }

      if (execErr && !hit) {
        // The command runs (cache miss) and fails while running; a cache hit would never have executed it.
        step.status = 'failed'
        step.metadataOnly = false
        explainMiss()
        step.error = execErr
        step.cacheKey = key
        step.start = clean(startAt)
        step.duration = clean(Math.min(timing.failSeconds, Math.max(seconds, 0)))
        step.end = clean(step.start + step.duration)
        ss.failed = true
        ss.end = step.end
        stopped = true
        continue
      }

      const result = apply ? apply() : { layer: null, contentKey: '' }
      // settings effects
      if (ins.kind === 'WORKDIR') ss.workdir = resolveDir(ss.workdir, ins.text.replace(/^WORKDIR\s+/, ''))
      if (ins.kind === 'USER') {
        ss.user = ins.user ?? ins.text.replace(/^USER\s+/, '').trim()
        step.user = ss.user
      }
      if (ins.kind === 'CMD') {
        ss.cmd = ins.text.replace(/^CMD\s+/, '')
        ss.listen = ins.listen ?? null
      }
      if (ins.kind === 'EXPOSE' && ins.port) ss.exposed.push(ins.port)
      if (ins.kind === 'ENV' && ins.name) {
        ss.env = ss.env.filter((e) => !e.startsWith(`${ins.name}=`))
        ss.env.push(`${ins.name}=${ins.value ?? ''}`)
        if (ins.secret) ss.envSecrets.push({ name: ins.name, value: ins.value ?? '' })
      }
      if (ins.kind === 'ARG' && ins.name) {
        // --build-arg wins, then this ARG's own default, then the global ARG's value
        ss.args[ins.name] = opts.context.args[ins.name] ?? ins.value ?? globalArgs[ins.name] ?? ''
        if (ins.secret) ss.secretArgNames.add(ins.name)
      }

      const scope = ins.kind === 'RUN' ? Object.keys(ss.args) : []
      const secretArgs: SecretValue[] = scope.filter((n) => ss.secretArgNames.has(n) && ss.args[n] !== '').map((n) => ({ name: n, value: ss.args[n] }))
      const secretEnv: SecretValue[] = ins.kind === 'ENV' && ins.secret && ins.name ? [{ name: ins.name, value: ins.value ?? '' }] : []
      const historyText =
        scope.length > 0 ? `RUN |${scope.length} ${scope.map((n) => `${n}=${ss.args[n]}`).join(' ')} /bin/sh -c ${ins.text.replace(/^RUN\s+/, '')}` : ins.text

      step.start = clean(startAt)
      if (!vertex) {
        // Settings only: 0 s, no layer, and the parent key passes through unchanged – it cannot invalidate a
        // later COPY. (A RUN below sees the new USER/ENV/ARG/WORKDIR in its own definition.)
        step.metadataOnly = true
        step.cached = !!hit
        step.status = hit ? 'cached' : 'run'
        step.reason = hit ? 'cache-hit' : 'metadata'
        step.end = step.start
        const hist: HistoryEntry = hit
          ? hit.history
          : {
              createdBy: historyText,
              sizeMB: 0,
              empty: true,
              createdAt: clean(now + step.end),
              layerDigest: null,
              instructionId: ins.id,
              secretEnv: secretEnv.length ? secretEnv : undefined,
            }
        ss.history.push(hist)
        if (hit) seen.push({ at: step.end, sigKey, inputs })
        else writes.push({ at: step.end, key, sigKey, entry: { key, layer: null, history: hist, inputs, createdAt: hist.createdAt } })
        continue
      }

      if (hit) {
        step.cached = true
        step.status = 'cached'
        step.reason = 'cache-hit'
        step.duration = 0
        step.layer = hit.layer
        step.sizeMB = hit.layer?.sizeMB ?? 0
      } else {
        step.cached = false
        step.status = 'run'
        explainMiss()
        step.duration = clean(seconds)
        const createdAt = clean(now + step.start + step.duration)
        if (result.layer) {
          const reproducible = ins.kind === 'COPY' || ins.kind === 'WORKDIR' || ins.action === 'rm'
          step.layer = {
            ...result.layer,
            digest: digestOf(`layer|${result.contentKey}${reproducible ? '' : nonce}`),
            createdBy: historyText,
            instructionId: ins.id,
            createdAt,
          }
          step.sizeMB = result.layer.sizeMB
        }
      }
      step.end = clean(step.start + step.duration)

      const hist: HistoryEntry = hit
        ? hit.history
        : {
            createdBy: historyText,
            sizeMB: step.layer?.sizeMB ?? 0,
            empty: !step.layer,
            createdAt: clean(now + step.end),
            layerDigest: step.layer?.digest ?? null,
            instructionId: ins.id,
            secretArgs: secretArgs.length ? secretArgs : undefined,
            secretEnv: secretEnv.length ? secretEnv : undefined,
          }
      if (step.layer) {
        ss.layers.push(step.layer)
        if (ins.kind === 'RUN') {
          for (const f of step.layer.added) {
            const e = ss.fs.get(f.path)
            if (e) e.origin = step.layer.digest
          }
        }
      }
      ss.history.push(hist)
      if (hit) seen.push({ at: step.end, sigKey, inputs })
      else writes.push({ at: step.end, key, sigKey, entry: { key, layer: step.layer, history: hist, inputs, createdAt: hist.createdAt } })

      parentMissed = !hit
      parentKey = key
      tCursor = step.end
    }
    ss.end = clean(tCursor > ss.end ? tCursor : ss.end)
  }

  // ---- 4. failures cancel everything that would finish later ----
  const failedSteps = steps.filter((s) => s.status === 'failed')
  if (failedSteps.length > 0) {
    const first = failedSteps.reduce((a, b) => (b.end < a.end || (b.end === a.end && b.line < a.line) ? b : a))
    error = { stepId: first.id, line: first.line, message: first.error ?? 'greška' }
    const tFail = first.end
    for (const s of steps) {
      if (s === first || s.status === 'skipped') continue
      if (s.status === 'failed' || s.end > tFail) {
        s.status = 'skipped'
        s.reason = 'cancelled'
        s.layer = null
        s.cached = false
      }
    }
    const keep = writes.filter((w) => w.at <= tFail)
    writes.length = 0
    writes.push(...keep)
    const keepSeen = seen.filter((w) => w.at <= tFail)
    seen.length = 0
    seen.push(...keepSeen)
    const keepPulls = basePulls.filter((p) => p.at <= tFail)
    basePulls.length = 0
    basePulls.push(...keepPulls)
  }

  steps.sort((a, b) => a.line - b.line)
  const used = steps.filter((s) => s.reason !== 'unused-stage' && !s.metadataOnly)
  const totalSeconds = clean(error ? Math.max(0, ...steps.filter((s) => s.status === 'failed').map((s) => s.end)) : Math.max(0, ...states.filter((s) => s.needed).map((s) => s.end)))
  const rebuilt = used.filter((s) => s.status === 'run').length
  const cachedCount = used.filter((s) => s.status === 'cached').length

  if (error) return { steps, totalSeconds, ok: false, error, image: null, writes, seen, basePulls, rebuilt, cachedCount }

  const final = states[states.length - 1]
  const image = assembleImage(final)
  return { steps, totalSeconds, ok: true, error: null, image, writes, seen, basePulls, rebuilt, cachedCount }
}

function assembleImage(ss: StageState): Image {
  const layers = ss.layers
  const createdAt = ss.history.reduce((m, h) => Math.max(m, h.createdAt), 0)
  const cmdArr = ss.cmd.startsWith('[') ? safeJsonArray(ss.cmd) : ['/bin/sh', '-c', ss.cmd]
  const configObj = {
    architecture: 'amd64',
    os: 'linux',
    created: simIso(createdAt),
    config: {
      User: ss.user,
      Env: ss.env,
      Cmd: cmdArr,
      WorkingDir: ss.workdir,
      ExposedPorts: Object.fromEntries(ss.exposed.map((p) => [`${p}/tcp`, {}])),
    },
    rootfs: { type: 'layers', diff_ids: layers.map((l) => digestOf(`diff|${l.digest}`)) },
    history: ss.history.map((h) => (h.empty ? { created: simIso(h.createdAt), created_by: h.createdBy, empty_layer: true } : { created: simIso(h.createdAt), created_by: h.createdBy })),
  }
  const configJson = JSON.stringify(configObj)
  const configDigest = digestOf(configJson)
  const manifest = {
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    config: { mediaType: 'application/vnd.oci.image.config.v1+json', digest: configDigest, size: configJson.length },
    layers: layers.map((l) => ({ mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip', digest: l.digest, size: Math.round(l.compressedMB * 1_000_000) })),
  }
  const manifestJson = JSON.stringify(manifest)
  return {
    digest: digestOf(manifestJson),
    configDigest,
    manifestJson,
    configJson,
    layers,
    history: ss.history,
    sizeMB: clean(layers.reduce((s, l) => s + l.sizeMB, 0)),
    compressedMB: clean(layers.reduce((s, l) => s + l.compressedMB, 0)),
    config: { user: ss.user, cmd: ss.cmd, workdir: ss.workdir, env: ss.env, exposed: ss.exposed, listen: ss.listen },
    stage: ss.name,
    baseRef: ss.base?.ref ?? '',
    createdAt,
    envSecrets: ss.envSecrets,
    dirOwners: Object.fromEntries(ss.dirs),
  }
}

function safeJsonArray(s: string): string[] {
  try {
    const v: unknown = JSON.parse(s)
    return Array.isArray(v) ? v.map(String) : [s]
  } catch {
    return [s]
  }
}

/** Apply a plan's cache writes, seen inputs and base pulls (by digest) up to time `upTo` (seconds from build start). */
export function applyPlanWrites(plan: BuildPlan, cache: BuildCache, localBases: Set<string>, upTo = Infinity): void {
  for (const w of plan.writes) {
    if (w.at > upTo) continue
    cache.entries.set(w.key, w.entry)
    cache.lastInputs.set(w.sigKey, w.entry.inputs)
  }
  for (const s of plan.seen ?? []) if (s.at <= upTo) cache.lastInputs.set(s.sigKey, s.inputs)
  for (const p of plan.basePulls) if (p.at <= upTo) localBases.add(p.digest)
}

// ---------------------------------------------------------------------------------------------
// Inspection
// ---------------------------------------------------------------------------------------------

export function isRootUser(user: string): boolean {
  const u = userOf(user)
  return u === '' || u === 'root' || u === '0'
}

/** Union view a container sees: path → index of the layer that provides it (whiteouts applied). */
export function mergedView(image: Image): Map<string, { layerIndex: number; at: string; sizeMB: number }> {
  const view = new Map<string, { layerIndex: number; at: string; sizeMB: number }>()
  image.layers.forEach((l, i) => {
    for (const r of l.removed) view.delete(r)
    for (const f of l.added) view.set(f.path, { layerIndex: i, at: f.at, sizeMB: f.sizeMB })
  })
  return view
}

export type ExposureWhere = 'layer' | 'history' | 'config'

export interface SecretExposure {
  secret: SecretValue
  where: ExposureWhere
  /** For 'layer': index into image.layers */
  layerIndex: number | null
  /** File path in the layer */
  at: string | null
  /** The file is whited-out by a later layer: invisible in the container, still in the image */
  hiddenByWhiteout: boolean
  /** Where a student finds it */
  how: string
}

/** Every place a secret value can be read from the image (layers, `docker history`, `docker inspect`). */
export function findSecrets(image: Image): SecretExposure[] {
  const out: SecretExposure[] = []
  image.layers.forEach((l, i) => {
    for (const f of l.added) {
      if (!f.secret) continue
      const hidden = image.layers.slice(i + 1).some((later) => later.removed.includes(f.path))
      out.push({
        secret: f.secret,
        where: 'layer',
        layerIndex: i,
        at: f.at,
        hiddenByWhiteout: hidden,
        how: hidden ? `sloj ${i + 1}: ${f.at} (gornji sloj ga samo skriva)` : `sloj ${i + 1}: ${f.at}`,
      })
    }
  })
  for (const h of image.history) {
    for (const s of [...(h.secretArgs ?? []), ...(h.secretEnv ?? [])]) {
      out.push({ secret: s, where: 'history', layerIndex: null, at: null, hiddenByWhiteout: false, how: `docker history: ${h.createdBy}` })
    }
  }
  for (const s of image.envSecrets) out.push({ secret: s, where: 'config', layerIndex: null, at: null, hiddenByWhiteout: false, how: `docker inspect: Env ${s.name}=…` })
  return out
}

/** Search layers, history and config for a substring of a path, secret name or value. */
export function searchImage(image: Image, query: string): SecretExposure[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return findSecrets(image).filter(
    (e) => e.secret.name.toLowerCase().includes(q) || e.secret.value.toLowerCase().includes(q) || (e.at ?? '').toLowerCase().includes(q),
  )
}

/** `docker history`-style rows, newest first. */
export function imageHistory(image: Image): { createdBy: string; size: string; sizeMB: number; empty: boolean }[] {
  return [...image.history].reverse().map((h) => ({
    createdBy: h.createdBy,
    sizeMB: h.sizeMB,
    empty: h.empty,
    size: h.empty ? '0B' : h.sizeMB < 0.1 ? `${Math.round(h.sizeMB * 1024 * 100) / 100}kB` : `${Math.round(h.sizeMB * 10) / 10}MB`,
  }))
}
