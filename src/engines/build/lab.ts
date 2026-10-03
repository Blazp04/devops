/**
 * E4 „Tvornica” – L08 „Laboratorij predmemorije izgradnje” as a mutable, steppable model.
 *
 *   const sim = useSimulation({ init: () => createBuildLab({ preset: 'laboratorij', warm: true }), step: stepBuildLab })
 *   sim.mutate((s) => { changeCode(s); startBuild(s) })
 *
 * The build is planned at once (`planBuild`) and then animated: `stepBuildLab` advances the stopwatch,
 * flips layers to CACHED / done at their exact times and writes the cache as layers finish.
 */
import { plural } from '../../kit/sim/math.ts'
import { advanceClock, clean, createClock, fmtMB, fmtSeconds, pushEvent, rate, shortDigest, type Clock, type EngineEvent } from './common.ts'
import {
  applyPlanWrites,
  BASE_IMAGES,
  CACHE_REASON_LABEL,
  contextSizeMB,
  createCache,
  resolveTimings,
  devDepsInImage,
  findSecrets,
  isRootUser,
  mergedView,
  planBuild,
  searchImage,
  type BuildCache,
  type BuildContext,
  type BuildPlan,
  type BuildTimings,
  type ContextFile,
  type Image,
  type Instruction,
  type Layer,
  type PlanStep,
  type SecretExposure,
} from './image.ts'
import { applyPull, applyPush, createHost, createRegistry, planPull, planPush, pushLog, setTag, type ImageHost, type PullPlan, type PushPlan, type Registry } from './registry.ts'
import { LAB_PRESETS, NPM_SECRET, PROJECTS, type LabPresetId, type ProjectId, type ProjectSpec } from './projects.ts'
import { sha256Hex } from './sha256.ts'

/** Fixed step of the lab (seconds of simulated time). */
export const LAB_DT = 0.05

/**
 * Speeds for the lab's SimFrame. A cold build is 53 s and a bad-order rebuild 44 s of sim time (the stopwatch
 * shows sim seconds, labelled „ilustrativno”), so 4× and 10× keep the lab within AUTHORING's „~10 s at 1×” spirit.
 */
export const LAB_RECOMMENDED_SPEEDS = [1, 4, 10] as const

export type ChangeKind = 'code' | 'deps' | 'git' | 'dockerfile' | 'dockerignore' | 'base' | 'secret'
export type NpmTokenVia = 'none' | 'copy-rm' | 'arg' | 'secret-mount'

export interface BuildLabConfig {
  /** Seed for digests of non-reproducible layers (default 42) */
  seed?: number
  /** Default: the preset's project, else 'klopa-web' */
  project?: ProjectId
  /** Default: 'laboratorij' for klopa-web, 'api-dobar' for klopa-api */
  preset?: LabPresetId
  /** Override the preset's .dockerignore toggle */
  dockerignore?: boolean
  /** Override the preset's multi-stage toggle */
  multiStage?: boolean
  /** Override step durations (illustrative defaults: npm ci 40 s, build 3 s, COPY 1 s, pull 10 MB/s) */
  timings?: Partial<BuildTimings>
  /** Registry upload / server download speed in compressed MB/s (default 10; below 0,1 counts as 0,1) */
  transferMBps?: number
  /** Reproducible RUN layers (SOURCE_DATE_EPOCH); default false like a plain docker build */
  reproducible?: boolean
  registryHost?: string
  immutableTags?: boolean
  /** Server names for the tag panel (default „Poslužitelj A”, „Poslužitelj B”) */
  servers?: string[]
  /**
   * Build once silently at creation: the cache, the local base images and the image are ready, but `builds`,
   * `events`, `build` and `t` stay empty. The first „Promijeni kod” → „Izgradi” then shows the hook's 44 s at once.
   */
  warm?: boolean
  /** klopa-web depends on a private npm package: `npm ci` needs the token (default false; `setNpmTokenVia` turns it on) */
  privateNpm?: boolean
}

export interface LabBuild {
  id: number
  startedAt: number
  plan: BuildPlan
  elapsed: number
  status: 'running' | 'done' | 'failed'
  changes: ChangeKind[]
  /** Git SHA of the source tree (incl. the Dockerfile) this build was started from */
  gitSha: string
}

export interface BuildSummary {
  id: number
  startedAt: number
  seconds: number
  ok: boolean
  error: string | null
  sizeMB: number | null
  digest: string | null
  /** Layer steps rebuilt / served from the cache (FROM included, settings-only lines not) */
  rebuilt: number
  cached: number
  changes: ChangeKind[]
  /** Only source code changed since the previous build (the „< 5 s” task) */
  codeOnly: boolean
  /** The changed code reached the image (a rebuilt step lists a code path among its changed inputs) */
  codeRebuilt: boolean
  /** The image contains the app and a CMD that runs it (see `servesApp`) */
  servesApp: boolean
  /** First rebuilt layer step (what invalidated the cache) */
  firstRebuilt: { line: number; text: string; reason: string; changedFiles: string[] } | null
  dockerfile: string[]
  /** Git SHA the image was built from (its immutable tag) */
  gitSha: string
}

export interface LabPush {
  id: number
  startedAt: number
  plan: PushPlan
  image: Image
  elapsed: number
  status: 'running' | 'done'
}

export interface PushSummary {
  id: number
  at: number
  digest: string
  tags: string[]
  uploaded: number
  existed: number
  uploadedMB: number
  seconds: number
  rejected: string[]
  log: string[]
}

export interface LabPull {
  serverId: string
  ref: string
  plan: PullPlan
  startedAt: number
  elapsed: number
  status: 'running' | 'done'
}

export interface Container {
  id: string
  name: string
  image: Image
  publish: { host: number; container: number }[]
  /** Thin writable layer: lost when the container is removed. copyUp = a lower-layer file was copied up to be edited; whiteout = deleted */
  writable: { path: string; sizeMB: number; copyUp: boolean; whiteout: boolean }[]
  running: boolean
  createdAt: number
}

export interface BuildLabState {
  clock: Clock
  /** Simulated seconds (mirror of clock.t) */
  t: number
  seed: number
  project: ProjectSpec
  preset: LabPresetId
  timings: BuildTimings
  transferMBps: number
  reproducible: boolean
  /** The Dockerfile, in order (the draggable cards) */
  cards: Instruction[]
  /** Cards available but not in the Dockerfile */
  tray: Instruction[]
  multiStage: boolean
  baseVariant: 'slim' | 'full'
  npmTokenVia: NpmTokenVia
  /** The project needs a private npm package (npm ci fails with E401 without a token) */
  privateNpm: boolean
  /** .dockerignore also lists Dockerfile and .dockerignore (then editing the Dockerfile does not touch COPY . .) */
  ignoreDockerfile: boolean
  context: BuildContext
  cache: BuildCache
  /** Digests of base images already pulled into the builder */
  localBases: Set<string>
  build: LabBuild | null
  builds: BuildSummary[]
  /** Last successfully built image */
  image: Image | null
  /** Git SHA the last image was built from (null before the first build) */
  imageSha: string | null
  registry: Registry
  push: LabPush | null
  pushes: PushSummary[]
  /** Animated pulls (`startPull`); the newest per server */
  pulls: LabPull[]
  servers: ImageHost[]
  containers: Container[]
  /** Changes since the last build started */
  pendingChanges: ChangeKind[]
  found: { secret: boolean; how: string | null }
  /**
   * What „Kopiraj .env pa ga obriši” changed, so `removeEnvSecret` can undo it. `restoreUser`: the USER card the
   * break-it added after `RUN rm .env` to switch back from root (taken from the tray, or a new card).
   */
  envTrick: { userRoot: boolean; unignored: boolean; restoreUser: { id: string; fromTray: boolean } | null } | null
  /** Sim time each L08 task was first reached (null = not yet): `labGoals` stays ticked once reached */
  goalsReached: Record<LabGoalId, number | null>
  events: EngineEvent[]
  nextBuildId: number
  nextPushId: number
  nextContainerId: number
}

const MAX_HISTORY = 20

function card(project: ProjectSpec, id: string): Instruction {
  const c = project.catalog[id]
  if (!c) throw new Error(`E4: nepoznata kartica ${id}`)
  return { ...c }
}

export function createBuildLab(config: BuildLabConfig = {}): BuildLabState {
  const projectId: ProjectId = config.project ?? (config.preset ? LAB_PRESETS[config.preset].project : 'klopa-web')
  const project = PROJECTS[projectId]
  const presetId: LabPresetId = config.preset && LAB_PRESETS[config.preset].project === projectId ? config.preset : project.defaultPreset
  const preset = LAB_PRESETS[presetId]
  const cards = preset.cards.map((id) => card(project, id))
  const used = new Set(preset.cards)
  // The runtime-stage cards (FROM nginx-unprivileged, COPY --from=build) are draggable from the tray too (L08 spec);
  // the Dockerfile's shape decides `multiStage` (see `isMultiStage`).
  const hidden = new Set<string>([
    ...Object.values(project.baseVariants),
    ...project.envTrick,
    project.userRootCard,
    'env-secret',
    'copy-npmrc',
    'rm-npmrc',
    'arg-npm-token',
    'npm-ci-arg',
    'npm-ci-secret',
    'npm-ci-omit-dev',
    'api-cmd-local',
  ])
  if (project.slots) {
    const other = preset.multiStage ? 'single' : 'multi'
    hidden.add(project.slots.user[other])
    hidden.add(project.slots.cmd[other])
  }
  const tray = Object.keys(project.catalog)
    .filter((id) => !used.has(id) && !hidden.has(id))
    .map((id) => card(project, id))

  const seed = config.seed ?? 42
  const state: BuildLabState = {
    clock: createClock(LAB_DT),
    t: 0,
    seed,
    project,
    preset: presetId,
    timings: resolveTimings(config.timings),
    transferMBps: rate(config.transferMBps !== undefined && config.transferMBps < 0 ? undefined : config.transferMBps, 10),
    reproducible: config.reproducible ?? false,
    cards,
    tray,
    multiStage: preset.multiStage,
    baseVariant: preset.baseVariant,
    npmTokenVia: 'none',
    privateNpm: (config.privateNpm ?? false) && project.npmToken,
    ignoreDockerfile: false,
    context: { files: project.files.map((f) => ({ ...f })), dockerignore: preset.dockerignore, secrets: {}, args: {} },
    cache: createCache(),
    localBases: new Set(),
    build: null,
    builds: [],
    image: null,
    imageSha: null,
    registry: createRegistry(config.registryHost, { immutableTags: config.immutableTags }),
    push: null,
    pushes: [],
    pulls: [],
    servers: (config.servers ?? ['Poslužitelj A', 'Poslužitelj B']).map((name, i) => createHost(String.fromCharCode(97 + i), name)),
    containers: [],
    pendingChanges: [],
    found: { secret: false, how: null },
    envTrick: null,
    goalsReached: { rebuildUnder5s: null, imageUnder200MB: null, foundKey: null, nonRoot: null },
    events: [],
    nextBuildId: 1,
    nextPushId: 1,
    nextContainerId: 1,
  }
  if (config.dockerignore !== undefined) state.context.dockerignore = config.dockerignore
  if (config.multiStage !== undefined && config.multiStage !== state.multiStage) setMultiStage(state, config.multiStage)
  if (config.warm) {
    // Build 0: silent, so the first visible build is #1 and already uses the cache.
    const plan = planBuild(state.cards, planOptions(state, 0))
    applyPlanWrites(plan, state.cache, state.localBases)
    if (plan.ok && plan.image) {
      state.image = plan.image
      state.imageSha = gitShortSha(state)
    }
    recordGoals(state)
  }
  state.pendingChanges = []
  state.events = []
  return state
}

const note = (state: BuildLabState, kind: ChangeKind) => {
  if (!state.pendingChanges.includes(kind)) state.pendingChanges.push(kind)
}

const event = (state: BuildLabState, kind: string, text: string, tone: EngineEvent['tone'] = 'neutral') => pushEvent(state.events, state.t, kind, text, tone)

// ---------------------------------------------------------------------------------------------
// Step
// ---------------------------------------------------------------------------------------------

/** Advance the lab by `dt` seconds (fixed internal step LAB_DT). */
export function stepBuildLab(state: BuildLabState, dt: number): void {
  advanceClock(state.clock, dt, (tEnd) => {
    state.t = tEnd
    const b = state.build
    if (b && b.status === 'running') {
      b.elapsed = Math.min(b.plan.totalSeconds, clean(tEnd - b.startedAt))
      applyPlanWrites(b.plan, state.cache, state.localBases, b.elapsed)
      if (b.elapsed >= b.plan.totalSeconds) finalizeBuild(state)
    }
    const p = state.push
    if (p && p.status === 'running') {
      p.elapsed = Math.min(p.plan.seconds, clean(tEnd - p.startedAt))
      if (p.elapsed >= p.plan.seconds) finalizePush(state)
    }
    for (const pl of state.pulls) {
      if (pl.status !== 'running') continue
      pl.elapsed = Math.min(pl.plan.seconds, clean(tEnd - pl.startedAt))
      if (pl.elapsed >= pl.plan.seconds) finalizePull(state, pl)
    }
  })
  state.t = state.clock.t
}

/** Sim time including the part of a fixed step not yet taken – for smooth progress bars between steps. */
export function labNow(state: BuildLabState): number {
  return clean(state.clock.t + state.clock.acc)
}

// ---------------------------------------------------------------------------------------------
// Dockerfile editing
// ---------------------------------------------------------------------------------------------

/** The Dockerfile as text lines. */
export function dockerfileLines(state: BuildLabState): string[] {
  return state.cards.map((c) => c.text)
}

/** The .dockerignore file's lines (what it currently excludes). */
export function dockerignoreLines(state: BuildLabState): string[] {
  const lines = state.context.files.filter((f) => f.ignored).map((f) => f.path)
  return state.ignoreDockerfile ? [...lines, 'Dockerfile', '.dockerignore'] : lines
}

/**
 * The build context as the builder sees it: the project files plus the Dockerfile itself (it sits in the
 * repository root, so `COPY . .` copies it and any Dockerfile edit changes that layer's input) and, when
 * .dockerignore is on, the .dockerignore file.
 */
export function labContext(state: BuildLabState): BuildContext {
  const extra: ContextFile[] = [{ path: 'Dockerfile', sizeMB: 0.001, ratio: 0.5, version: 1, role: 'config', ignored: state.ignoreDockerfile, content: dockerfileLines(state).join('\n') }]
  if (state.context.dockerignore) {
    extra.push({ path: '.dockerignore', sizeMB: 0.0001, ratio: 0.5, version: 1, role: 'config', ignored: state.ignoreDockerfile, content: dockerignoreLines(state).join('\n') })
  }
  return { ...state.context, files: [...state.context.files, ...extra] }
}

/** Move a card to a new index (drag and drop). A non-finite index (NaN from a drag handler) is refused. */
export function moveCard(state: BuildLabState, id: string, toIndex: number): boolean {
  if (!Number.isFinite(toIndex)) return false
  const from = state.cards.findIndex((c) => c.id === id)
  if (from < 0) return false
  const to = Math.max(0, Math.min(state.cards.length - 1, Math.floor(toIndex)))
  if (to === from) return false
  const [c] = state.cards.splice(from, 1)
  state.cards.splice(to, 0, c)
  note(state, 'dockerfile')
  syncMultiStage(state)
  return true
}

/** Set the full order (e.g. from Motion `Reorder`). Unknown ids are ignored; missing cards keep their relative order at the end. */
export function setCardOrder(state: BuildLabState, ids: readonly string[]): void {
  const byId = new Map(state.cards.map((c) => [c.id, c]))
  const next: Instruction[] = []
  for (const id of ids) {
    const c = byId.get(id)
    if (c && !next.includes(c)) next.push(c)
  }
  for (const c of state.cards) if (!next.includes(c)) next.push(c)
  if (next.some((c, i) => c !== state.cards[i])) {
    state.cards = next
    note(state, 'dockerfile')
    syncMultiStage(state)
  }
}

/** Move a card from the tray (or any unused catalogue card, e.g. 'env-secret') into the Dockerfile (default / non-finite index: at the end). */
export function addCard(state: BuildLabState, id: string, index = state.cards.length): boolean {
  if (state.cards.some((c) => c.id === id)) return false
  const i = state.tray.findIndex((c) => c.id === id)
  let c: Instruction
  if (i >= 0) c = state.tray.splice(i, 1)[0]
  else if (state.project.catalog[id]) c = card(state.project, id)
  else return false
  const at = Number.isFinite(index) ? Math.max(0, Math.min(state.cards.length, Math.floor(index))) : state.cards.length
  state.cards.splice(at, 0, c)
  note(state, 'dockerfile')
  syncMultiStage(state)
  return true
}

/** Move a card from the Dockerfile to the tray. */
export function removeCard(state: BuildLabState, id: string): boolean {
  const i = state.cards.findIndex((c) => c.id === id)
  if (i < 0) return false
  const [c] = state.cards.splice(i, 1)
  state.tray.push(c)
  note(state, 'dockerfile')
  syncMultiStage(state)
  return true
}

function replaceCard(state: BuildLabState, fromId: string, toId: string): boolean {
  let done = false
  for (const list of [state.cards, state.tray]) {
    const i = list.findIndex((c) => c.id === fromId)
    if (i >= 0) {
      list[i] = card(state.project, toId)
      done = true
    }
  }
  return done
}

/** Swap a card (in the Dockerfile or the tray) for another catalogue card, keeping its position. */
export function swapCard(state: BuildLabState, fromId: string, toId: string): boolean {
  if (fromId === toId || !state.project.catalog[toId] || state.cards.some((c) => c.id === toId)) return false
  const inDockerfile = state.cards.some((c) => c.id === fromId)
  if (!replaceCard(state, fromId, toId)) return false
  if (inDockerfile) {
    note(state, 'dockerfile')
    syncMultiStage(state)
  }
  return true
}

/**
 * „Vrata u zidu”: where the app listens inside the container. klopa-api swaps
 * `CMD ["gunicorn", "--bind", "0.0.0.0:8000", …]` ↔ `CMD ["gunicorn", "klopa.wsgi"]` (gunicorn's default 127.0.0.1).
 * Returns false for a project without both variants.
 */
export function setListenAddr(state: BuildLabState, addr: '0.0.0.0' | '127.0.0.1'): boolean {
  const v = state.project.listenVariants
  if (!v) return false
  const from = addr === '0.0.0.0' ? v['127.0.0.1'] : v['0.0.0.0']
  const ok = swapCard(state, from, v[addr])
  if (ok) event(state, 'listen', addr === '0.0.0.0' ? 'gunicorn sluša na 0.0.0.0:8000 (dostupno kroz -p)' : 'gunicorn sluša na zadanoj adresi 127.0.0.1:8000 (samo unutar kontejnera)', 'info')
  return ok
}

/**
 * Derived from the cards (what the „Višefazna izgradnja” toggle shows): the Dockerfile's LAST `FROM` is the
 * runtime-stage card (`FROM nginx-unprivileged … AS runtime`) and an earlier `FROM` exists. Dragging that card in or
 * out of the Dockerfile flips it just like the toggle does.
 */
export function isMultiStage(state: BuildLabState): boolean {
  const p = state.project
  const froms = state.cards.filter((c) => c.kind === 'FROM')
  return froms.length > 1 && p.multiStageCards.includes(froms[froms.length - 1].id)
}

/** USER/CMD slot cards follow the final stage: `USER node` + `npm start` (node) or `USER 101` + nginx (runtime). */
function swapSlots(state: BuildLabState, multi: boolean): void {
  const s = state.project.slots
  if (!s) return
  replaceCard(state, multi ? s.user.single : s.user.multi, multi ? s.user.multi : s.user.single)
  replaceCard(state, multi ? s.cmd.single : s.cmd.multi, multi ? s.cmd.multi : s.cmd.single)
}

/** After a card edit: keep `state.multiStage` (and the USER/CMD slot variants) in line with the Dockerfile's shape. */
function syncMultiStage(state: BuildLabState): void {
  const derived = isMultiStage(state)
  if (derived === state.multiStage) return
  state.multiStage = derived
  swapSlots(state, derived)
  event(state, 'multistage', derived ? 'Višefazna izgradnja: konačna faza je nginx-unprivileged' : 'Jedna faza: konačna slika sadrži sve iz faze izgradnje', 'info')
}

/** „Višefazna izgradnja”: moves the runtime-stage cards between the tray and the Dockerfile and swaps USER/CMD to their variants. */
export function setMultiStage(state: BuildLabState, on: boolean): void {
  const p = state.project
  if (!p.slots || p.multiStageCards.length === 0 || on === isMultiStage(state)) return
  const slotIds = [p.slots.user.single, p.slots.cmd.single, p.slots.user.multi, p.slots.cmd.multi]
  if (on) {
    // runtime cards already in the Dockerfile (dragged in by hand, maybe out of place) are re-inserted in order
    const existing = new Map(state.cards.filter((c) => p.multiStageCards.includes(c.id)).map((c) => [c.id, c]))
    state.cards = state.cards.filter((c) => !existing.has(c.id))
    const firstSlot = state.cards.findIndex((c) => slotIds.includes(c.id))
    const at = firstSlot >= 0 ? firstSlot : state.cards.length
    const add = p.multiStageCards.map((id) => {
      const have = existing.get(id)
      if (have) return have
      const i = state.tray.findIndex((c) => c.id === id)
      return i >= 0 ? state.tray.splice(i, 1)[0] : card(p, id)
    })
    state.cards.splice(at, 0, ...add)
  } else {
    const gone = state.cards.filter((c) => p.multiStageCards.includes(c.id))
    state.cards = state.cards.filter((c) => !p.multiStageCards.includes(c.id))
    state.tray.push(...gone)
  }
  // Without a build-stage FROM above it there is still only one stage: the toggle follows the Dockerfile.
  state.multiStage = isMultiStage(state)
  swapSlots(state, state.multiStage)
  note(state, 'dockerfile')
  event(state, 'multistage', state.multiStage ? 'Višefazna izgradnja: konačna slika = nginx + dist' : 'Jedna faza: konačna slika sadrži sve iz faze izgradnje', 'info')
}

/** .dockerignore on/off (keeps node_modules, .git and .env out of the build context). */
export function setDockerignore(state: BuildLabState, on: boolean): void {
  if (state.context.dockerignore === on) return
  state.context.dockerignore = on
  note(state, 'dockerignore')
  event(state, 'dockerignore', `.dockerignore ${on ? 'uključen' : 'isključen'}: kontekst izgradnje ${fmtMB(contextSizeMB(labContext(state)))}`, 'info')
}

/** „.dockerignore sadrži Dockerfile”: list Dockerfile and .dockerignore too, so a Dockerfile edit no longer invalidates `COPY . .`. */
export function setIgnoreDockerfile(state: BuildLabState, on: boolean): void {
  if (state.ignoreDockerfile === on) return
  state.ignoreDockerfile = on
  note(state, 'dockerignore')
}

/** Full (`node:24`, ≈1,1 GB) vs slim (`node:24-slim`, ≈250 MB) build base. */
export function setBaseVariant(state: BuildLabState, variant: 'slim' | 'full'): void {
  const v = state.project.baseVariants
  if (state.baseVariant === variant || v.slim === v.full) return
  replaceCard(state, variant === 'full' ? v.slim : v.full, variant === 'full' ? v.full : v.slim)
  state.baseVariant = variant
  note(state, 'base')
}

// ---------------------------------------------------------------------------------------------
// Changes to the source tree
// ---------------------------------------------------------------------------------------------

function bump(state: BuildLabState, paths: readonly string[]) {
  for (const f of state.context.files) if (paths.includes(f.path)) f.version += 1
}

/** „Promijeni kod”: edits source code (and creates a git commit, so `.git/` changes too). */
export function changeCode(state: BuildLabState): void {
  bump(state, [...state.project.codePaths, '.git/'])
  note(state, 'code')
  note(state, 'git')
  event(state, 'change-code', `Promijenjen kod (${state.project.codePaths.join(', ')})`, 'info')
}

/** „Promijeni ovisnosti”: edits the dependency manifest (package*.json / requirements.txt). */
export function changeDeps(state: BuildLabState): void {
  bump(state, [...state.project.depsPaths, '.git/'])
  note(state, 'deps')
  note(state, 'git')
  event(state, 'change-deps', `Promijenjene ovisnosti (${state.project.depsPaths.join(', ')})`, 'info')
}

/** Any git operation (fetch, commit, checkout): only `.git/` changes. */
export function touchGit(state: BuildLabState): void {
  bump(state, ['.git/'])
  note(state, 'git')
}

// ---------------------------------------------------------------------------------------------
// Secrets
// ---------------------------------------------------------------------------------------------

/** The USER in effect before card index `at`, inside the stage that starts at card index `fromIdx`. */
function userAt(state: BuildLabState, fromIdx: number, at: number): string {
  let user = (state.cards[fromIdx]?.base && BASE_IMAGES[state.cards[fromIdx].base as string]?.user) || 'root'
  for (let i = fromIdx + 1; i < at; i++) {
    const c = state.cards[i]
    if (c.kind === 'USER') user = c.user ?? c.text.replace(/^USER\s+/, '')
  }
  return user
}

/**
 * Break-it „Kopiraj .env pa ga obriši”: `COPY .env .` + `RUN rm .env` at the end of the final stage (before its
 * trailing USER/CMD/EXPOSE).
 * - The stage must run `rm` as root: in a non-root stage (nginx-unprivileged runs as UID 101 in `/`, owned by
 *   root) `RUN rm` would fail with „Permission denied”, so a `USER root` card goes in front; the stage's own
 *   USER card after it switches back.
 * - `unignore` (default true): with .dockerignore on, `.env` is not in the context and `COPY .env` would fail, so
 *   the break-it adds the exception `!.env` (as a hurried developer would). Pass false to show the failure.
 * Returns whether cards were added and, if the next build would fail anyway, its error.
 */
export function injectEnvSecret(state: BuildLabState, opts: { unignore?: boolean } = {}): { added: boolean; willFail: string | null } {
  const [copyId, rmId] = state.project.envTrick
  if (state.cards.some((c) => c.id === copyId)) return { added: false, willFail: null }
  let lastFrom = -1
  state.cards.forEach((c, i) => {
    if (c.kind === 'FROM') lastFrom = i
  })
  let at = state.cards.length
  while (at - 1 > lastFrom && ['USER', 'CMD', 'EXPOSE'].includes(state.cards[at - 1].kind)) at -= 1
  const add = [card(state.project, copyId), card(state.project, rmId)]
  const prevUser = lastFrom >= 0 ? userAt(state, lastFrom, at) : 'root'
  const userRoot = lastFrom >= 0 && !isRootUser(prevUser) && !state.cards.some((c) => c.id === state.project.userRootCard)
  let restoreUser: { id: string; fromTray: boolean } | null = null
  if (userRoot) {
    add.unshift(card(state.project, state.project.userRootCard))
    // Switch back after `RUN rm` unless the stage's own USER card follows (visefazna: `USER 101`). Without this the
    // break-it would change two things at once: the secret AND an image that now runs as root.
    const userFollows = state.cards.slice(at).some((c) => c.kind === 'USER')
    if (!userFollows) {
      const restore = restoreUserCard(state, prevUser)
      add.push(restore.card)
      restoreUser = { id: restore.card.id, fromTray: restore.fromTray }
    }
  }
  state.cards.splice(at, 0, ...add)
  let unignored = false
  if (opts.unignore !== false) {
    const env = state.context.files.find((f) => f.path === '.env')
    if (env?.ignored) {
      env.ignored = false
      unignored = true
      if (state.context.dockerignore) event(state, 'dockerignore', '.dockerignore: dodana iznimka !.env – datoteka je opet u kontekstu izgradnje', 'warn')
    }
  }
  state.envTrick = { userRoot, unignored, restoreUser }
  note(state, 'secret')
  const restoreText = restoreUser ? `, USER ${prevUser}` : ''
  event(state, 'env-trick', `Dodano: ${userRoot ? 'USER root, ' : ''}COPY .env pa RUN rm .env${restoreText}`, 'warn')
  const plan = previewBuild(state)
  return { added: true, willFail: plan.error ? `redak ${plan.error.line}: ${plan.error.message}` : null }
}

/** Card id of the USER card the break-it creates when no catalogue USER card for that user is free. */
export const ENV_TRICK_RESTORE_USER_ID = 'env-user-restore'

/** A `USER <user>` card: the catalogue card for that user from the tray (or catalogue) if it is not in the Dockerfile, else a new one. */
function restoreUserCard(state: BuildLabState, user: string): { card: Instruction; fromTray: boolean } {
  const ids = Object.keys(state.project.catalog).filter((id) => {
    const c = state.project.catalog[id]
    return c.kind === 'USER' && (c.user ?? c.text.replace(/^USER\s+/, '')) === user && !state.cards.some((x) => x.id === id)
  })
  const inTray = state.tray.findIndex((c) => ids.includes(c.id))
  if (inTray >= 0) return { card: state.tray.splice(inTray, 1)[0], fromTray: true }
  if (ids.length > 0) return { card: card(state.project, ids[0]), fromTray: false }
  return { card: { id: ENV_TRICK_RESTORE_USER_ID, kind: 'USER', text: `USER ${user}`, user }, fromTray: false }
}

/** Undo the break-it: removes its cards (incl. its `USER root` and the USER card that switched back) and the `!.env` exception. */
export function removeEnvSecret(state: BuildLabState): boolean {
  const restore = state.envTrick?.restoreUser ?? null
  const ids = [...state.project.envTrick, ...(state.envTrick?.userRoot ? [state.project.userRootCard] : []), ...(restore ? [restore.id] : [])]
  const before = state.cards.length
  if (restore?.fromTray) {
    const c = state.cards.find((x) => x.id === restore.id)
    if (c) state.tray.push(c)
  }
  state.cards = state.cards.filter((c) => !ids.includes(c.id))
  if (state.envTrick?.unignored) {
    const env = state.context.files.find((f) => f.path === '.env')
    if (env) env.ignored = true
  }
  const had = state.envTrick !== null
  state.envTrick = null
  if (state.cards.length === before && !had) return false
  note(state, 'secret')
  return true
}

const NPM_CI_IDS = ['npm-ci', 'npm-ci-arg', 'npm-ci-secret']

/**
 * How the build gets an npm token for a private registry (klopa-web only):
 * 'copy-rm' COPY .npmrc + RUN rm (token stays in a lower layer), 'arg' ARG NPM_TOKEN (visible in
 * `docker history`), 'secret-mount' RUN --mount=type=secret (never written to a layer), 'none'.
 * Any choice other than 'none' turns on `privateNpm` (the project now needs the token): from then on
 * 'none', an ARG outside the stage or a missing secret makes `npm ci` fail with E401.
 */
export function setNpmTokenVia(state: BuildLabState, via: NpmTokenVia): boolean {
  if (!state.project.npmToken || state.npmTokenVia === via) return false
  const p = state.project
  // reset to 'none'
  state.cards = state.cards.filter((c) => !['copy-npmrc', 'rm-npmrc', 'arg-npm-token'].includes(c.id))
  const idx = () => state.cards.findIndex((c) => NPM_CI_IDS.includes(c.id))
  let i = idx()
  if (i >= 0) state.cards[i] = card(p, 'npm-ci')
  state.context.files = state.context.files.filter((f) => f.path !== '.npmrc')
  delete state.context.secrets.npmrc
  delete state.context.args.NPM_TOKEN

  i = idx()
  if (via === 'copy-rm') {
    state.context.files.push({ path: '.npmrc', sizeMB: 0.001, ratio: 1, version: 1, role: 'secret', ignored: false, secret: NPM_SECRET })
    if (i >= 0) {
      state.cards.splice(i + 1, 0, card(p, 'rm-npmrc'))
      state.cards.splice(i, 0, card(p, 'copy-npmrc'))
    }
  } else if (via === 'arg') {
    state.context.args.NPM_TOKEN = NPM_SECRET.value
    if (i >= 0) {
      state.cards[i] = card(p, 'npm-ci-arg')
      state.cards.splice(i, 0, card(p, 'arg-npm-token'))
    }
  } else if (via === 'secret-mount') {
    state.context.secrets.npmrc = NPM_SECRET
    if (i >= 0) state.cards[i] = card(p, 'npm-ci-secret')
  }
  state.npmTokenVia = via
  if (via !== 'none') togglePrivateDep(state, true)
  note(state, 'secret')
  return true
}

/**
 * Adding (or dropping) the private dependency `@klopa/ui` edits package.json and package-lock.json – a commit like
 * „Promijeni ovisnosti”. So `COPY package*.json` misses and `RUN npm ci` really runs (and needs the token): a cache
 * hit never executes a command, so without this change a cached `npm ci` would still pass.
 */
function togglePrivateDep(state: BuildLabState, on: boolean): void {
  if (state.privateNpm === on) return
  state.privateNpm = on
  bump(state, [...state.project.depsPaths, '.git/'])
  note(state, 'deps')
  note(state, 'git')
  event(state, 'private-dep', on ? 'Dodana privatna ovisnost @klopa/ui (package.json) – npm ci treba NPM_TOKEN' : 'Uklonjena privatna ovisnost @klopa/ui (package.json)', 'info')
}

/** The project depends on a private npm package (`@klopa/ui`): `npm ci` must get a token or fail with E401. */
export function setPrivateNpm(state: BuildLabState, on: boolean): boolean {
  if (!state.project.npmToken || state.privateNpm === on) return false
  togglePrivateDep(state, on)
  note(state, 'secret')
  return true
}

// ---------------------------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------------------------

function planOptions(state: BuildLabState, buildId: number) {
  return {
    context: labContext(state),
    cache: state.cache,
    localBases: state.localBases,
    timings: state.timings,
    buildId,
    now: state.t,
    reproducible: state.reproducible,
    seed: state.seed,
    privateNpm: state.privateNpm,
  }
}

/** What the next build would do, without changing anything (for „Predvidi”). */
export function previewBuild(state: BuildLabState): BuildPlan {
  return planBuild(state.cards, planOptions(state, state.nextBuildId))
}

/** „Izgradi”: plans the build and starts the animation. Returns null if a build is already running. */
export function startBuild(state: BuildLabState): BuildPlan | null {
  if (state.build?.status === 'running') return null
  const plan = previewBuild(state)
  const id = state.nextBuildId++
  state.build = { id, startedAt: state.t, plan, elapsed: 0, status: 'running', changes: [...state.pendingChanges], gitSha: gitShortSha(state) }
  state.pendingChanges = []
  event(state, 'build-start', `Izgradnja #${id} započela`, 'info')
  if (plan.totalSeconds <= 0) finalizeBuild(state)
  return plan
}

/** Skip the animation of the running build. */
export function finishBuild(state: BuildLabState): BuildSummary | null {
  const b = state.build
  if (!b || b.status !== 'running') return null
  b.elapsed = b.plan.totalSeconds
  return finalizeBuild(state)
}

/** Build without animation; returns the summary. */
export function buildNow(state: BuildLabState): BuildSummary | null {
  if (!startBuild(state)) return null
  return state.build?.status === 'running' ? finishBuild(state) : state.builds[state.builds.length - 1] ?? null
}

/**
 * The image runs the app: its CMD starts one of the project's programs, it listens somewhere, and the merged
 * view contains what that program needs (multi-stage nginx: dist/; single-stage `npm start`: dist/, node_modules/,
 * package.json; gunicorn: klopa/ and site-packages/). An image without the code cannot pass the L08 tasks.
 */
export function servesApp(project: ProjectSpec, image: Image | null): boolean {
  if (!image || !image.config.listen) return false
  const paths = new Set(mergedView(image).keys())
  return project.app.some((a) => image.config.cmd.includes(a.cmd) && a.needs.every((p) => paths.has(p)))
}

function finalizeBuild(state: BuildLabState): BuildSummary {
  const b = state.build as LabBuild
  const plan = b.plan
  applyPlanWrites(plan, state.cache, state.localBases)
  b.elapsed = plan.totalSeconds
  b.status = plan.ok ? 'done' : 'failed'
  const firstRun = plan.steps.find((s) => s.status === 'run' && s.kind !== 'FROM' && !s.metadataOnly) ?? null
  const codePaths = state.project.codePaths
  const summary: BuildSummary = {
    id: b.id,
    startedAt: b.startedAt,
    seconds: plan.totalSeconds,
    ok: plan.ok,
    error: plan.error ? `redak ${plan.error.line}: ${plan.error.message}` : null,
    sizeMB: plan.image?.sizeMB ?? null,
    digest: plan.image?.digest ?? null,
    rebuilt: plan.rebuilt,
    cached: plan.cachedCount,
    changes: b.changes,
    codeOnly: b.changes.includes('code') && b.changes.every((c) => c === 'code' || c === 'git'),
    codeRebuilt: plan.steps.some((s) => s.status === 'run' && s.changedFiles.some((f) => codePaths.includes(f))),
    servesApp: servesApp(state.project, plan.image),
    firstRebuilt: firstRun ? { line: firstRun.line, text: firstRun.text, reason: CACHE_REASON_LABEL[firstRun.reason], changedFiles: firstRun.changedFiles } : null,
    dockerfile: plan.steps.map((s) => s.text),
    gitSha: b.gitSha,
  }
  state.builds.push(summary)
  if (state.builds.length > MAX_HISTORY) state.builds.splice(0, state.builds.length - MAX_HISTORY)
  if (plan.ok && plan.image) {
    state.image = plan.image
    state.imageSha = b.gitSha
    if (firstRun && firstRun.reason !== 'first-build') {
      const files = firstRun.changedFiles.length ? ` (${firstRun.changedFiles.join(', ')})` : ''
      event(state, 'cache-miss', `Prvi ponovno izgrađeni sloj: ${firstRun.text} – ${CACHE_REASON_LABEL[firstRun.reason]}${files}`, 'warn')
    }
    event(
      state,
      'build-done',
      `Izgradnja #${b.id} gotova za ${fmtSeconds(plan.totalSeconds)} · ${plural(plan.cachedCount, ['korak', 'koraka', 'koraka'])} iz predmemorije · slika ${fmtMB(plan.image.sizeMB)} · ${shortDigest(plan.image.digest)}`,
      plan.totalSeconds < 5 ? 'ok' : 'neutral',
    )
  } else {
    event(state, 'build-failed', `Izgradnja #${b.id} nije uspjela – ${summary.error}`, 'bad')
  }
  recordGoals(state)
  return summary
}

export type LiveStatus = 'waiting' | 'pulling' | 'running' | 'cached' | 'done' | 'failed' | 'skipped'

export interface LiveStep extends PlanStep {
  live: LiveStatus
  /** 0..1 for the progress bar */
  progress: number
}

/**
 * The running (or last) build with live per-step status for the layer-stack animation.
 * Pass `at: labNow(s)` for progress between fixed steps (clamped to the build).
 */
export function buildView(state: BuildLabState, opts: { at?: number } = {}): { id: number; status: LabBuild['status']; elapsed: number; total: number; steps: LiveStep[] } | null {
  const b = state.build
  if (!b) return null
  const e = b.status === 'running' && opts.at !== undefined && Number.isFinite(opts.at) ? clean(Math.min(b.plan.totalSeconds, Math.max(b.elapsed, opts.at - b.startedAt))) : b.elapsed
  const steps = b.plan.steps.map((s): LiveStep => {
    let live: LiveStatus
    let progress = 0
    if (s.status === 'skipped') live = 'skipped'
    else if (e < s.start || (e === s.start && s.duration > 0 && b.status === 'running')) live = 'waiting'
    else if (s.status === 'cached') {
      live = 'cached'
      progress = 1
    } else if (e >= s.end) {
      live = s.status === 'failed' ? 'failed' : 'done'
      progress = 1
    } else {
      live = s.pullsBase ? 'pulling' : 'running'
      progress = s.duration > 0 ? clean((e - s.start) / s.duration) : 1
    }
    return { ...s, live, progress }
  })
  return { id: b.id, status: b.status, elapsed: e, total: b.plan.totalSeconds, steps }
}

// ---------------------------------------------------------------------------------------------
// Registry, tags, servers
// ---------------------------------------------------------------------------------------------

/**
 * Short git SHA of the current source tree: every tracked file, including the Dockerfile and .dockerignore
 * (both are committed). Not `.git/` itself, ignored local folders or the `.env`/`.npmrc` secrets.
 */
export function gitShortSha(state: BuildLabState): string {
  const tracked = labContext(state).files.filter((f) => f.role !== 'vcs' && f.role !== 'local-deps' && f.role !== 'secret')
  const v = tracked.map((f) => `${f.path}@${f.content !== undefined ? sha256Hex(f.content).slice(0, 12) : f.version}`).join(',')
  return sha256Hex(`tree|${v}`).slice(0, 7)
}

/** Full reference in the lab's registry, e.g. `registry.klopa.example/klopa-web:latest`. */
export function labRef(state: BuildLabState, tagOrDigest = 'latest'): string {
  if (tagOrDigest.includes('/')) return tagOrDigest
  const base = `${state.registry.host}/${state.project.repo}`
  return tagOrDigest.startsWith('@') ? `${base}${tagOrDigest}` : tagOrDigest.startsWith('sha256:') ? `${base}@${tagOrDigest}` : `${base}:${tagOrDigest}`
}

/** The last image was built from an older tree than the current one (code, deps or Dockerfile changed since). */
export function imageStale(state: BuildLabState): boolean {
  return state.image !== null && state.imageSha !== gitShortSha(state)
}

/**
 * „Pošalji u registar”: pushes the last image. Default tags: the git SHA the image was BUILT from (like
 * `docker build -t klopa-web:$(git rev-parse --short HEAD)`), plus `latest` if the repository has none yet.
 * If the tree changed since that build, the old image still goes out under its own SHA and an event says so.
 * Uploads only missing layers.
 */
export function pushImage(state: BuildLabState, opts: { tags?: string[] } = {}): PushPlan | null {
  const image = state.image
  if (!image || state.push?.status === 'running') return null
  const sha = state.imageSha ?? gitShortSha(state)
  const tags = opts.tags ?? [sha, ...(state.registry.tags.has(`${state.project.repo}:latest`) ? [] : ['latest'])]
  if (imageStale(state)) event(state, 'push-stale', `Slika je izgrađena iz ${sha}; trenutni kod (${gitShortSha(state)}) još nije izgrađen – najprije Izgradi`, 'warn')
  const plan = planPush(state.registry, image, state.project.repo, tags, { mbps: state.transferMBps })
  state.push = { id: state.nextPushId++, startedAt: state.t, plan, image, elapsed: 0, status: 'running' }
  event(state, 'push-start', `docker push ${state.project.repo} (${tags.length === 1 ? 'tag' : 'tagovi'}: ${tags.join(', ')})`, 'info')
  if (plan.seconds <= 0) finalizePush(state)
  return plan
}

export function finishPush(state: BuildLabState): PushSummary | null {
  const p = state.push
  if (!p || p.status !== 'running') return null
  return finalizePush(state)
}

function finalizePush(state: BuildLabState): PushSummary {
  const p = state.push as LabPush
  p.elapsed = p.plan.seconds
  p.status = 'done'
  applyPush(state.registry, p.image, p.plan, state.t)
  const uploaded = p.plan.layers.filter((l) => !l.exists).length
  const existed = p.plan.layers.length - uploaded
  const summary: PushSummary = {
    id: p.id,
    at: state.t,
    digest: p.plan.digest,
    tags: p.plan.tags,
    uploaded,
    existed,
    uploadedMB: p.plan.uploadedMB,
    seconds: p.plan.seconds,
    rejected: p.plan.rejectedTags.map((r) => r.reason),
    log: pushLog(p.plan),
  }
  state.pushes.push(summary)
  if (state.pushes.length > MAX_HISTORY) state.pushes.splice(0, state.pushes.length - MAX_HISTORY)
  event(
    state,
    'push-done',
    `Push: ${plural(existed, ['sloj već postoji', 'sloja već postoje', 'slojeva već postoji'])}, ${plural(uploaded, ['poslan', 'poslana', 'poslano'])} (${fmtMB(p.plan.uploadedMB)})`,
    'ok',
  )
  for (const c of p.plan.tagChanges) event(state, 'tag', `Tag ${c.tag} → ${shortDigest(c.to)}${c.from ? ` (prije ${shortDigest(c.from)})` : ''}`, c.from ? 'warn' : 'info')
  for (const r of p.plan.rejectedTags) event(state, 'tag-rejected', `Registar odbio: ${r.reason}`, 'bad')
  return summary
}

/** Push progress for the push panel: per layer 0..1 (layers upload one after another). */
export function pushView(state: BuildLabState): { status: LabPush['status']; elapsed: number; total: number; layers: { digest: string; label: string; exists: boolean; progress: number }[] } | null {
  const p = state.push
  if (!p) return null
  let cursor = 0
  return {
    status: p.status,
    elapsed: p.elapsed,
    total: p.plan.seconds,
    layers: p.plan.layers.map((l) => {
      const start = cursor
      cursor += l.seconds
      const progress = l.exists ? 1 : l.seconds <= 0 ? 1 : Math.max(0, Math.min(1, (p.elapsed - start) / l.seconds))
      return { digest: l.digest, label: l.label, exists: l.exists, progress: clean(progress) }
    }),
  }
}

/** „Pomakni latest na novu sliku”: re-point a tag (default `latest`) at the last pushed/built image. */
export function moveTag(state: BuildLabState, tag = 'latest', digest: string | undefined = state.image?.digest): boolean {
  if (!digest) return false
  const r = setTag(state.registry, state.project.repo, tag, digest, state.t)
  if (!r.ok) {
    event(state, 'tag-rejected', `Tag ${tag} nije pomaknut: ${r.reason}`, 'bad')
    return false
  }
  if (r.from !== digest) event(state, 'tag', `Tag ${tag}: ${shortDigest(r.from)} → ${shortDigest(digest)} – isti naziv, druga slika`, 'warn')
  return true
}

function resolvePull(state: BuildLabState, serverId: string, refOrTag: string): { host: ImageHost; ref: string; plan: PullPlan } | null {
  const host = state.servers.find((s) => s.id === serverId)
  if (!host) return null
  const ref = labRef(state, refOrTag)
  const plan = planPull(state.registry, host, ref, 'Always', { mbps: state.transferMBps })
  if (!plan.digest) event(state, 'pull-failed', `${host.name}: ${plan.error ?? 'pull nije uspio'}`, 'bad')
  return { host, ref, plan }
}

function finishOnHost(state: BuildLabState, host: ImageHost, ref: string, refOrTag: string, plan: PullPlan): void {
  applyPull(host, plan)
  host.running = { ref, digest: plan.digest as string, since: state.t }
  host.pulling = null
  event(state, 'pull', `${host.name} pokreće ${refOrTag} → ${shortDigest(plan.digest)} (preuzeto ${fmtMB(plan.downloadMB)} za ${fmtSeconds(plan.seconds)})`, 'info')
}

/** `docker pull` + run on a server, instantly. Accepts a tag, `tag@digest`, `@digest` or a full reference. */
export function pullOnServer(state: BuildLabState, serverId: string, refOrTag = 'latest'): PullPlan | null {
  const r = resolvePull(state, serverId, refOrTag)
  if (!r) return null
  if (r.plan.digest) finishOnHost(state, r.host, r.ref, refOrTag, r.plan)
  return r.plan
}

/**
 * Animated `docker pull` + run: the layers arrive over `plan.seconds` of sim time (`pullView`), then the server
 * runs the image. Returns null for an unknown server or while that server is still pulling.
 */
export function startPull(state: BuildLabState, serverId: string, refOrTag = 'latest'): PullPlan | null {
  const host = state.servers.find((s) => s.id === serverId)
  if (!host || host.pulling) return null
  const r = resolvePull(state, serverId, refOrTag)
  if (!r || !r.plan.digest) return r?.plan ?? null
  const pull: LabPull = { serverId, ref: refOrTag, plan: r.plan, startedAt: state.t, elapsed: 0, status: 'running' }
  state.pulls = [...state.pulls.filter((p) => p.serverId !== serverId), pull]
  host.pulling = { ref: r.ref, digest: r.plan.digest, startedAt: state.t, seconds: r.plan.seconds }
  event(state, 'pull-start', `${host.name}: docker pull ${refOrTag} (${fmtMB(r.plan.downloadMB)})`, 'info')
  if (r.plan.seconds <= 0) finalizePull(state, pull)
  return r.plan
}

function finalizePull(state: BuildLabState, pull: LabPull): void {
  const host = state.servers.find((s) => s.id === pull.serverId)
  pull.elapsed = pull.plan.seconds
  pull.status = 'done'
  if (host) finishOnHost(state, host, labRef(state, pull.ref), pull.ref, pull.plan)
}

/** Pull progress per server: the manifest first (0,5 s), then layers one after another; cached layers are done at once. */
export function pullView(state: BuildLabState): { serverId: string; ref: string; status: LabPull['status']; elapsed: number; total: number; layers: { digest: string; cached: boolean; progress: number }[] }[] {
  return state.pulls.map((p) => {
    let cursor = clean(p.plan.seconds - p.plan.layers.reduce((s, l) => s + l.seconds, 0))
    return {
      serverId: p.serverId,
      ref: p.ref,
      status: p.status,
      elapsed: p.elapsed,
      total: p.plan.seconds,
      layers: p.plan.layers.map((l) => {
        const start = cursor
        cursor += l.seconds
        const progress = l.cached || l.seconds <= 0 ? 1 : Math.max(0, Math.min(1, (p.elapsed - start) / l.seconds))
        return { digest: l.digest, cached: l.cached, progress: clean(progress) }
      }),
    }
  })
}

/** Which digest each server runs („Poslužitelj A: sha256:a1…, B: sha256:9f…”). */
export function serverReport(state: BuildLabState): { servers: { id: string; name: string; ref: string | null; digest: string | null; short: string }[]; sameDigest: boolean } {
  const servers = state.servers.map((h) => ({ id: h.id, name: h.name, ref: h.running?.ref ?? null, digest: h.running?.digest ?? null, short: shortDigest(h.running?.digest) }))
  const running = servers.filter((s) => s.digest)
  return { servers, sameDigest: running.every((s) => s.digest === running[0]?.digest) }
}

// ---------------------------------------------------------------------------------------------
// Inspector
// ---------------------------------------------------------------------------------------------

/** Open one layer of the last image in the inspector; finding a secret file completes the task. */
export function inspectLayer(state: BuildLabState, layerIndex: number): Layer | null {
  const layer = state.image?.layers[layerIndex]
  if (!layer) return null
  const hit = layer.added.find((f) => f.secret)
  if (hit?.secret && !state.found.secret) {
    state.found = { secret: true, how: `sloj ${layerIndex + 1}: ${hit.at}` }
    event(state, 'secret-found', `Ključ pronađen: ${hit.secret.name} u sloju ${layerIndex + 1} (${hit.at})`, 'ok')
    recordGoals(state)
  }
  return layer
}

/** Search the image (layers, history, config) – e.g. „SMS_API_KEY” or „.env”. */
export function searchInImage(state: BuildLabState, query: string): SecretExposure[] {
  if (!state.image) return []
  const hits = searchImage(state.image, query)
  if (hits.length > 0 && !state.found.secret) {
    state.found = { secret: true, how: hits[0].how }
    event(state, 'secret-found', `Ključ pronađen: ${hits[0].how}`, 'ok')
    recordGoals(state)
  }
  return hits
}

// ---------------------------------------------------------------------------------------------
// Containers („Vrata u zidu”)
// ---------------------------------------------------------------------------------------------

/**
 * `docker run [-p host:container]` from the last image, with Docker's error when it cannot start
 * (no image yet, or a host port already allocated by a running container). EXPOSE alone publishes nothing.
 */
export function tryRunContainer(state: BuildLabState, opts: { publish?: [number, number][]; name?: string } = {}): { container: Container } | { error: string } {
  if (!state.image) return { error: `Unable to find image '${state.project.repo}:latest' locally – najprije Izgradi` }
  const publish = (opts.publish ?? []).map(([host, container]) => ({ host, container }))
  for (const c of state.containers) {
    const clash = c.running ? publish.find((q) => c.publish.some((p) => p.host === q.host)) : undefined
    if (clash) {
      const error = `docker: Error response from daemon: Bind for 0.0.0.0:${clash.host} failed: port is already allocated (koristi ga ${c.name})`
      event(state, 'run-failed', error, 'bad')
      return { error }
    }
  }
  const id = `c${state.nextContainerId++}`
  const ct: Container = { id, name: opts.name ?? `${state.project.repo}-${id}`, image: state.image, publish, writable: [], running: true, createdAt: state.t }
  state.containers.push(ct)
  event(state, 'run', `docker run ${publish.map((p) => `-p ${p.host}:${p.container} `).join('')}${state.project.repo} → ${ct.name}`, 'info')
  return { container: ct }
}

/** `docker run` returning the container, or null (the reason is in the event log; use `tryRunContainer` for it). */
export function runContainer(state: BuildLabState, opts: { publish?: [number, number][]; name?: string } = {}): Container | null {
  const r = tryRunContainer(state, opts)
  return 'container' in r ? r.container : null
}

export type CurlOutcome = 'ok' | 'refused' | 'reset'

/** `curl localhost:<hostPort>` from the host. */
export function curlFromHost(state: BuildLabState, hostPort: number): { outcome: CurlOutcome; text: string } {
  const c = state.containers.find((x) => x.running && x.publish.some((p) => p.host === hostPort))
  if (!c) return { outcome: 'refused', text: `curl: (7) Failed to connect to localhost port ${hostPort}: Connection refused` }
  const p = c.publish.find((x) => x.host === hostPort) as { host: number; container: number }
  const listen = c.image.config.listen
  if (!listen || listen.port !== p.container || listen.addr === '127.0.0.1') {
    return { outcome: 'reset', text: 'curl: (56) Recv failure: Connection reset by peer' }
  }
  return { outcome: 'ok', text: 'HTTP/1.1 200 OK' }
}

function imagePaths(image: Image): Set<string> {
  return new Set([...mergedView(image).values()].map((v) => v.at))
}

/** Write a file inside a running container (lands in its writable layer; editing an image file copies it up first). */
export function writeInContainer(state: BuildLabState, id: string, path = '/app/zapis.log', sizeMB = 0.1): boolean {
  const c = state.containers.find((x) => x.id === id && x.running)
  if (!c) return false
  const copyUp = imagePaths(c.image).has(path)
  c.writable = c.writable.filter((w) => w.path !== path)
  c.writable.push({ path, sizeMB, copyUp, whiteout: false })
  return true
}

/** Result of writeInContainerAs: ok, or the shell's error (EACCES) and the user the write ran as. */
export interface ContainerWriteResult {
  ok: boolean
  /** e.g. „sh: 1: cannot create /app/zapis.log: Permission denied” (null when ok) */
  error: string | null
  /** The user the write ran as (`docker exec -u` or the image's USER) */
  user: string
}

const userName = (u: string) => u.trim().split(':')[0] || 'root'

/** Owner of an absolute path in the image: the file (or COPY'd directory group) that holds it, else its nearest directory. */
export function imagePathOwner(image: Image, path: string): { owner: string; kind: 'file' | 'dir' } {
  // the merged view (like mergedView) with owners: file key → where it is and who owns it
  const view = new Map<string, { at: string; owner: string }>()
  for (const l of image.layers) {
    for (const r of l.removed) view.delete(r)
    for (const f of l.added) view.set(f.path, { at: f.at, owner: f.owner ?? 'root' })
  }
  let group: { at: string; owner: string } | null = null
  for (const v of view.values()) {
    if (v.at === path) return { owner: v.owner, kind: 'file' }
    if (v.at.endsWith('/') && path.startsWith(v.at) && (!group || v.at.length > group.at.length)) group = v
  }
  if (group) return { owner: group.owner, kind: 'dir' }
  const dirs = image.dirOwners ?? {}
  let dir = path.endsWith('/') ? path.slice(0, -1) : path.slice(0, path.lastIndexOf('/'))
  while (dir.length > 0 && dirs[dir] === undefined) dir = dir.slice(0, dir.lastIndexOf('/'))
  return { owner: dirs[dir || '/'] ?? 'root', kind: 'dir' }
}

/**
 * Opt-in ownership check for writes inside a running container (L08 PortLab). The write runs as `opts.user`
 * (`docker exec -u`) or the image's USER. root writes anywhere and /tmp is world-writable; otherwise an image file
 * must belong to that user, and a new file needs a directory that user owns (COPY without --chown and WORKDIR before
 * USER leave root-owned content). On success it behaves exactly like writeInContainer, which itself never checks.
 */
export function writeInContainerAs(state: BuildLabState, id: string, path = '/app/zapis.log', sizeMB = 0.1, opts: { user?: string } = {}): ContainerWriteResult {
  const c = state.containers.find((x) => x.id === id && x.running)
  const user = opts.user ?? c?.image.config.user ?? 'root'
  if (!c) return { ok: false, error: `Error response from daemon: container ${id} is not running`, user }
  const allowed = isRootUser(user) || path.startsWith('/tmp/') || userName(imagePathOwner(c.image, path).owner) === userName(user)
  // BusyBox ash (Alpine) vs dash (Debian slim images) word the same EACCES differently
  const busybox = BASE_IMAGES[c.image.baseRef]?.busybox === true
  if (!allowed) return { ok: false, error: busybox ? `sh: can't create ${path}: Permission denied` : `sh: 1: cannot create ${path}: Permission denied`, user }
  writeInContainer(state, id, path, sizeMB)
  return { ok: true, error: null, user }
}

/** Delete a file inside a running container: an image file gets a whiteout in the writable layer (the image is unchanged). */
export function deleteInContainer(state: BuildLabState, id: string, path: string): boolean {
  const c = state.containers.find((x) => x.id === id && x.running)
  if (!c) return false
  const inImage = imagePaths(c.image).has(path)
  const had = c.writable.some((w) => w.path === path && !w.whiteout)
  if (!inImage && !had) return false
  c.writable = c.writable.filter((w) => w.path !== path)
  if (inImage) c.writable.push({ path, sizeMB: 0, copyUp: false, whiteout: true })
  return true
}

/** `docker rm -f`: the writable layer is deleted with the container. Returns the number of lost files. */
export function removeContainer(state: BuildLabState, id: string): number {
  const i = state.containers.findIndex((x) => x.id === id)
  if (i < 0) return 0
  const [c] = state.containers.splice(i, 1)
  if (c.writable.length > 0) event(state, 'rm', `docker rm ${c.name}: zapisivi sloj obrisan, izgubljeno: ${plural(c.writable.length, ['datoteka', 'datoteke', 'datoteka'])}`, 'warn')
  return c.writable.length
}

// ---------------------------------------------------------------------------------------------
// Metrics and goals
// ---------------------------------------------------------------------------------------------

export interface LabMetrics {
  lastBuild: BuildSummary | null
  /** Duration of the most recent successful build after a code-only change */
  lastCodeRebuildSeconds: number | null
  imageSizeMB: number | null
  /** Development dependencies shipped in the image (single stage: 120 MB of node_modules; multi-stage: 0) */
  devDepsMB: number | null
  /** Transfer (gzip) size – what push and pull move */
  imageCompressedMB: number | null
  /** Pull onto an empty server at transferMBps (+0,5 s for the manifest) */
  coldPullSeconds: number | null
  contextSizeMB: number
  layerCount: number
  user: string | null
  nonRoot: boolean | null
  /** The last image contains the app and runs it (see `servesApp`) */
  servesApp: boolean
  exposures: SecretExposure[]
  latestDigest: string | null
  /** Git SHA the last image was built from, and the current tree's SHA */
  imageSha: string | null
  currentSha: string
  /** The code (or Dockerfile) changed since the last image was built */
  imageStale: boolean
}

export function labMetrics(state: BuildLabState): LabMetrics {
  const codeOnly = [...state.builds].reverse().find((b) => b.ok && b.codeOnly) ?? null
  const img = state.image
  return {
    lastBuild: state.builds[state.builds.length - 1] ?? null,
    lastCodeRebuildSeconds: codeOnly ? codeOnly.seconds : null,
    imageSizeMB: img?.sizeMB ?? null,
    devDepsMB: img ? devDepsInImage(img) : null,
    imageCompressedMB: img?.compressedMB ?? null,
    coldPullSeconds: img ? clean(0.5 + img.compressedMB / state.transferMBps) : null,
    contextSizeMB: contextSizeMB(labContext(state)),
    layerCount: img?.layers.length ?? 0,
    user: img?.config.user ?? null,
    nonRoot: img ? !isRootUser(img.config.user) : null,
    servesApp: servesApp(state.project, img),
    exposures: img ? findSecrets(img) : [],
    latestDigest: state.registry.tags.get(`${state.project.repo}:latest`) ?? null,
    imageSha: state.imageSha,
    currentSha: gitShortSha(state),
    imageStale: imageStale(state),
  }
}

export type LabGoalId = 'rebuildUnder5s' | 'imageUnder200MB' | 'foundKey' | 'nonRoot'
export type LabGoals = Record<LabGoalId, boolean>

/**
 * The four L08 tasks evaluated on the CURRENT lab: the last code-only rebuild, the current image, the inspector.
 * The size, rebuild and non-root tasks count only an image that actually runs the app (`servesApp`); the rebuild
 * task also needs the changed code to have reached the image. Use it for live hints („trenutno: 44 s”).
 */
export function labGoalsCurrent(state: BuildLabState): LabGoals {
  const m = labMetrics(state)
  const codeBuild = [...state.builds].reverse().find((b) => b.ok && b.codeOnly) ?? null
  return {
    rebuildUnder5s: codeBuild !== null && codeBuild.seconds < 5 && codeBuild.servesApp && codeBuild.codeRebuilt,
    imageUnder200MB: m.servesApp && m.imageSizeMB !== null && m.imageSizeMB < 200,
    foundKey: state.found.secret,
    nonRoot: m.servesApp && m.nonRoot === true,
  }
}

/** Remember when each task was first reached (called after builds, the warm start and the inspector). */
function recordGoals(state: BuildLabState): void {
  const now = labGoalsCurrent(state)
  for (const k of Object.keys(now) as LabGoalId[]) if (now[k] && state.goalsReached[k] === null) state.goalsReached[k] = state.t
}

/**
 * The four L08 tasks („Zadaci”), sticky like `pipelineGoals`: once reached, a task stays ticked while students
 * keep experimenting (a bad-order rebuild, multi-stage off, the `.env` break-it, 20 builds later).
 * `labGoalsCurrent` gives the live values; `state.goalsReached` the sim time each was first reached.
 */
export function labGoals(state: BuildLabState): LabGoals {
  const r = state.goalsReached
  return { rebuildUnder5s: r.rebuildUnder5s !== null, imageUnder200MB: r.imageUnder200MB !== null, foundKey: r.foundKey !== null, nonRoot: r.nonRoot !== null }
}
