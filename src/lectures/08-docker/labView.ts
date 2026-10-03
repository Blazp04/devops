/**
 * L08 – pure view helpers over the E4 build lab (no React). The model itself lives in src/engines/build;
 * this file only turns its state into rows, chips and log lines for the lecture's drawings.
 */
import type { SimEvent } from '../../kit'
import {
  fmtMB,
  buildNow,
  buildView,
  CACHE_REASON_LABEL,
  createBuildLab,
  findSecrets,
  imageHistory,
  injectEnvSecret,
  mergedView,
  setMultiStage,
  setNpmTokenVia,
  shortDigest,
  type BuildSummary,
  type Image,
  type NpmTokenVia,
  type SecretExposure,
  type BuildLabState,
  type EngineEvent,
  type Instruction,
  type LabPresetId,
  type LiveStep,
  type ProjectId,
} from '../../engines/build/index.ts'

/** The state of one Dockerfile line / layer in the last (or running) build. */
export type ChipKind = 'cached' | 'new' | 'running' | 'pulling' | 'waiting' | 'failed' | 'skipped' | 'setting' | 'idle'

export function chipOf(step: LiveStep | undefined): ChipKind {
  if (!step) return 'idle'
  if (step.live === 'skipped') return 'skipped'
  if (step.metadataOnly) return step.live === 'waiting' ? 'waiting' : 'setting'
  switch (step.live) {
    case 'cached':
      return 'cached'
    case 'done':
      return 'new'
    case 'failed':
      return 'failed'
    case 'pulling':
      return 'pulling'
    case 'running':
      return 'running'
    default:
      return 'waiting'
  }
}

export interface CardStatus {
  kind: ChipKind
  duration: number
  /** seconds this step has been running (for the running chip) */
  elapsed: number
  progress: number
  /** why the step missed the cache (first miss in red, cascade in pencil) */
  reason: { text: string; first: boolean } | null
}

/** Engine events → the kit's EventLog (stable ids, the engine's own tone). */
/** The engine's „Promijeni kod / ovisnosti” also makes a git commit (so `.git/` changes); say so, or the next line's „.git/” is a riddle. */
const GIT_SUFFIX: Record<string, string> = {
  'change-code': ' i spremljen u Git (.git/)',
  'change-deps': ' i spremljene u Git (.git/)',
}

export function toSimEvents(events: readonly EngineEvent[]): SimEvent[] {
  return events.map((e) => ({ t: e.t, text: `${e.text}${GIT_SUFFIX[e.kind] ?? ''}`, tone: e.tone, id: e.id }))
}

export interface PresetOption {
  value: LabPresetId
  label: string
}

/** Starting Dockerfiles offered in the lab, per project. `ivin-prvi` reproduces incident #8. */
export const LAB_START: Record<ProjectId, PresetOption[]> = {
  'klopa-web': [
    { value: 'laboratorij', label: 'Laboratorij (loš redoslijed)' },
    { value: 'ivin-prvi', label: 'Ivin prvi Dockerfile (incident #8)' },
  ],
  'klopa-api': [
    { value: 'api-los', label: 'API: loš redoslijed' },
    { value: 'api-dobar', label: 'API: dobar redoslijed' },
  ],
}

/** Where a card from the tray goes: before the trailing settings (USER / CMD / EXPOSE) – a CMD goes last. */
export function insertIndexFor(state: BuildLabState, card: Instruction): number {
  if (card.kind === 'CMD') return state.cards.length
  const tail = card.kind === 'USER' ? ['CMD', 'EXPOSE'] : ['USER', 'CMD', 'EXPOSE']
  let at = state.cards.length
  while (at > 0 && tail.includes(state.cards[at - 1].kind) && state.cards[at - 1].kind !== 'FROM') at -= 1
  return at
}

/** One tray in the image stack (bottom = base image). */
export interface StackRow {
  key: string
  /** card id the row belongs to */
  id: string
  label: string
  sizeMB: number
  digest: string | null
  state: ChipKind
  progress: number
  /** indices into `state.image.layers` (several for a base image) */
  layerIdx: number[]
  base: boolean
}

export interface StackView {
  rows: StackRow[]
  /** settings-only lines of the final stage (USER, CMD, EXPOSE…) */
  settings: string[]
  /** layer steps of earlier stages (multi-stage: they never reach the final image) */
  otherStageSteps: number
  /** the rows describe `state.image` (clicking a row inspects it) */
  inspectable: boolean
}

/** The final image as a stack of trays: the running / last build, or the warm image when nothing was built yet. */
export function stackView(state: BuildLabState, at: number): StackView {
  const view = buildView(state, { at })
  const image = state.image
  if (!view) {
    if (!image) return { rows: [], settings: [], otherStageSteps: 0, inspectable: false }
    const rows: StackRow[] = []
    image.layers.forEach((l, i) => {
      const id = l.instructionId ?? `layer-${i}`
      const prev = rows[rows.length - 1]
      if (prev && prev.id === id && l.fromBase) {
        prev.sizeMB += l.sizeMB
        prev.layerIdx.push(i)
        return
      }
      rows.push({ key: `${id}-${i}`, id, label: l.fromBase ? `FROM ${l.fromBase}` : l.createdBy, sizeMB: l.sizeMB, digest: l.fromBase ? null : l.digest, state: 'idle', progress: 1, layerIdx: [i], base: !!l.fromBase })
    })
    const settings = state.cards.filter((c) => ['USER', 'CMD', 'EXPOSE', 'ENV', 'ARG'].includes(c.kind)).map((c) => c.text)
    return { rows, settings, otherStageSteps: 0, inspectable: true }
  }
  const live = view.steps.filter((s) => s.live !== 'skipped')
  const finalStage = live.length ? Math.max(...live.map((s) => s.stageIndex)) : 0
  const finalSteps = view.steps.filter((s) => s.stageIndex === finalStage && s.live !== 'skipped')
  const done = view.status === 'done' && image !== null
  const rows: StackRow[] = []
  for (const s of finalSteps) {
    if (s.metadataOnly) continue
    const layerIdx = done && image ? image.layers.map((l, i) => (l.instructionId === s.id ? i : -1)).filter((i) => i >= 0) : []
    rows.push({
      key: `${view.id}-${s.id}`,
      id: s.id,
      label: s.kind === 'FROM' ? `FROM ${s.text.replace(/^FROM\s+/, '').replace(/\s+AS\s+\S+$/i, '')}` : s.text,
      sizeMB: s.sizeMB,
      digest: s.kind === 'FROM' ? null : (s.layer?.digest ?? null),
      state: chipOf(s),
      progress: s.progress,
      layerIdx,
      base: s.kind === 'FROM',
    })
  }
  const settings = finalSteps.filter((s) => s.metadataOnly).map((s) => s.text)
  const otherStageSteps = view.steps.filter((s) => s.stageIndex !== finalStage && !s.metadataOnly && s.live !== 'skipped').length
  return { rows, settings, otherStageSteps, inspectable: done }
}

/** Tags of the lab's repository: `latest`, git SHAs… → short digests. */
export function tagRows(state: BuildLabState): { tag: string; digest: string; short: string }[] {
  const prefix = `${state.project.repo}:`
  return [...state.registry.tags.entries()]
    .filter(([k]) => k.startsWith(prefix))
    .map(([k, d]) => ({ tag: k.slice(prefix.length), digest: d, short: shortDigest(d, 6) }))
    .sort((a, b) => (a.tag === 'latest' ? -1 : b.tag === 'latest' ? 1 : 0))
}

/** Changes waiting for the next build, in words. */
export function pendingLabel(state: BuildLabState): string | null {
  const words: Record<string, string> = { code: 'kod', deps: 'ovisnosti', git: 'git', dockerfile: 'Dockerfile', dockerignore: '.dockerignore', base: 'bazna slika', secret: '.env' }
  const list = state.pendingChanges.filter((c) => c !== 'git').map((c) => words[c] ?? c)
  return list.length ? list.join(', ') : null
}

const LOUD_REASONS = new Set(['inputs-changed', 'instruction-changed', 'args-changed', 'env-changed'])

/** Status of every Dockerfile card in the running / last build, with the reason the first miss happened. */
export function cardStatuses(state: BuildLabState, at: number): Map<string, CardStatus> {
  const out = new Map<string, CardStatus>()
  const view = buildView(state, { at })
  if (!view) return out
  const missedStages = new Set<number>()
  for (const st of view.steps) {
    const kind = chipOf(st)
    let reason: CardStatus['reason'] = null
    if (st.status === 'failed' && st.error) reason = { text: st.error, first: true }
    else if (st.status === 'run' && !st.metadataOnly) {
      if (st.reason === 'parent-rebuilt') reason = { text: '↳ gradi se ponovno jer se gradi i redak iznad', first: false }
      else if (!missedStages.has(st.stageIndex)) {
        const files = st.changedFiles.length ? `: ${st.changedFiles.join(', ')}` : ''
        reason = { text: `${CACHE_REASON_LABEL[st.reason]}${files}`, first: LOUD_REASONS.has(st.reason) }
      }
      missedStages.add(st.stageIndex)
    }
    out.set(st.id, { kind, duration: st.duration, elapsed: Math.max(0, Math.min(st.duration, view.elapsed - st.start)), progress: st.progress, reason })
  }
  return out
}

/** Card ids that carry or handle a secret (marked in the „Tajna u sloju” Dockerfile). */
const SECRET_CARDS = new Set(['copy-npmrc', 'rm-npmrc', 'arg-npm-token', 'npm-ci-arg', 'npm-ci-secret', 'copy-env', 'rm-env', 'user-root', 'env-user-restore'])

export interface SecretLab {
  lines: { text: string; hot: boolean }[]
  image: Image | null
  summary: BuildSummary | null
  /** what `ls` shows inside a container (merged view) */
  visible: string[]
  exposures: SecretExposure[]
  /** paths of secret files a process in the container can read (not hidden by a whiteout) */
  visibleSecretAt: string[]
  /** the instruction that created each layer (`sloj N` = index N − 1) */
  layerTexts: string[]
  history: { createdBy: string; size: string; secret: boolean }[]
  user: string
  sizeMB: number | null
}

/**
 * „Tajna u sloju”: klopa-web with a private npm package (good order, `dobar-redoslijed`, seed 42), the token
 * delivered three ways, optionally multi-stage and the `.env` break-it. Built at once (no animation needed).
 */
export function secretLab(via: Exclude<NpmTokenVia, 'none'>, multi: boolean, env: boolean): SecretLab {
  const s = createBuildLab({ preset: 'dobar-redoslijed', warm: true })
  setNpmTokenVia(s, via)
  if (multi) setMultiStage(s, true)
  if (env) injectEnvSecret(s)
  const summary = buildNow(s)
  const image = s.image
  const exposures = image ? findSecrets(image) : []
  const values = exposures.map((e) => e.secret.value)
  return {
    lines: s.cards.map((c) => ({ text: c.text, hot: SECRET_CARDS.has(c.id) })),
    image,
    summary,
    visible: image ? [...mergedView(image).values()].map((v) => v.at).sort() : [],
    exposures,
    visibleSecretAt: exposures.filter((e) => e.where === 'layer' && !e.hiddenByWhiteout && e.at).map((e) => e.at as string),
    layerTexts: image ? image.layers.map((l) => l.createdBy) : [],
    history: image ? imageHistory(image).map((h) => ({ createdBy: h.createdBy, size: h.size, secret: values.some((v) => h.createdBy.includes(v)) })) : [],
    user: image?.config.user ?? 'root',
    sizeMB: image?.sizeMB ?? null,
  }
}

/** Sizes for layer labels: small files in kB (a `.env` is not „0 MB”), everything else like the Docker CLI. */
export function fmtSize(mb: number): string {
  if (mb > 0 && mb < 0.1) return `${Math.max(1, Math.round(mb * 1024))} kB`
  return fmtMB(mb)
}
