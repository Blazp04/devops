/**
 * Thin view layer over the E4 „Tvornica” pipeline engine (src/engines/build) for L21. No model logic lives here:
 * labels, the starting state of the flagship sim and small selectors the UI needs.
 */
import {
  createPipeline,
  commit,
  fmtSeconds,
  shortDigest,
  PIPELINE_PRESETS,
  type CommitType,
  type GateMode,
  type PipelineRun,
  type PipelineState,
  type StationId,
} from '../../engines/build/index.ts'

/** The incident card's reproduction: preset `tvornica`, seed 42 (production = Davor's laptop build tagged latest). */
export const FACTORY_PRESET = 'tvornica'
export const FACTORY_SEED = 42

/** Fresh flagship state: the `tvornica` preset with Lana's VAT fix 2.0.1 already pushed at 09:00. */
export function createFactory(): PipelineState {
  const s = createPipeline({ ...PIPELINE_PRESETS.tvornica, seed: FACTORY_SEED })
  commit(s, 'ok', { version: '2.0.1' })
  return s
}

export const GATE_ORDER: GateMode[] = ['ci', 'delivery', 'deployment']

export const GATE_LABEL: Record<GateMode, string> = {
  ci: 'samo CI',
  delivery: 'kontinuirana isporuka',
  deployment: 'kontinuirano postavljanje',
}

export const GATE_NOTE: Record<GateMode, string> = {
  ci: 'traka staje u registru',
  delivery: 'čovjek klikne prije produkcije',
  deployment: 'zeleni commit ide sam',
}

/** Commit types the student can push (labels from the spec, same as the engine's COMMIT_TYPE_LABEL). */
export const PUSHABLE: CommitType[] = ['ok', 'failing-test', 'vulnerable-base', 'flaky', 'secret']

/** Short label on a commit token (never colour alone). */
export const TYPE_SHORT: Record<CommitType, string> = {
  ok: 'ispravan',
  'failing-test': 'pada test',
  'vulnerable-base': 'ranjiva slika',
  flaky: 'nestabilan test',
  secret: 'tajna u kodu',
  fix: 'ispravak',
  revert: 'git revert',
}

/** Station names as printed on the drawers (Croatian, sentence case). */
export const STATION_NAME: Record<StationId, string> = {
  lint: 'Lint',
  test: 'Testovi',
  build: 'Izgradnja slike',
  scan: 'Skeniranje',
  push: 'Registar',
  staging: 'Staging',
  e2e: 'E2E testovi',
  gate: 'Ljudska vrata',
  prod: 'Produkcija',
}

/** The illustrative duration written under each station (the engine's L21 numbers). */
export function stationDuration(s: PipelineState, sid: StationId): string {
  const d = s.config.durations
  const c = s.config
  switch (sid) {
    case 'lint':
      return fmtSeconds(d.lint)
    case 'test':
      return c.skipTests ? 'preskočeno' : c.cache ? `${fmtSeconds(d.testCold)} · ${fmtSeconds(d.testCached)} s predmemorijom` : fmtSeconds(d.testCold)
    case 'build':
      return c.cache ? `${fmtSeconds(d.buildCold)} · ${fmtSeconds(d.buildCached)} s predmemorijom` : fmtSeconds(d.buildCold)
    case 'scan':
      return fmtSeconds(d.scan)
    case 'push':
      return fmtSeconds(d.push)
    case 'staging':
      return `${fmtSeconds(d.staging)} · jedno okruženje`
    case 'e2e':
      return c.skipTests ? 'preskočeno' : fmtSeconds(d.e2e)
    case 'gate':
      return c.gate === 'delivery' ? 'čeka klik' : c.gate === 'deployment' ? 'otvoreno' : 'zatvoreno'
    case 'prod':
      return fmtSeconds(d.prod)
  }
}

export type OutcomeTone = 'ok' | 'bad' | 'warn' | 'info' | 'neutral'

/** Did the run actually execute its tests (unit and e2e)? „Preskoči testove” marks both jobs 'skipped'. */
export const ranChecks = (r: PipelineRun) => r.jobs.test.status !== 'skipped' && r.jobs.e2e.status !== 'skipped'

/** What happened to a finished run, for the „Gotovo” shelf. */
export function runOutcome(r: PipelineRun, s: PipelineState): { glyph: string; text: string; tone: OutcomeTone } {
  if (r.status === 'in-prod') {
    if (s.deployments.some((d) => d.runId === r.id && d.bad)) {
      const live = s.prod.bad && s.prod.digest === r.prodDigest
      return { glyph: '✗', text: live ? 'u produkciji – greška (incident)' : 'bio u produkciji – greška, vraćeno', tone: 'bad' }
    }
    if (!ranChecks(r)) return { glyph: '!', text: 'u produkciji – testovi preskočeni', tone: 'warn' }
    if (r.tested === false) return { glyph: '!', text: `u produkciji – netestiran digest${r.leadTimeSec !== null ? ` · ${fmtSeconds(r.leadTimeSec)}` : ''}`, tone: 'warn' }
    return { glyph: '✓', text: `u produkciji${r.leadTimeSec !== null ? ` za ${fmtSeconds(r.leadTimeSec)}` : ''}`, tone: 'ok' }
  }
  if (r.status === 'in-registry') return { glyph: '→', text: 'u registru (samo CI)', tone: 'info' }
  if (r.status === 'cancelled') return { glyph: '·', text: 'otkazan', tone: 'neutral' }
  if (r.status === 'failed') return { glyph: '✗', text: `stao: ${r.failedAt ? STATION_NAME[r.failedAt] : '?'}`, tone: 'bad' }
  return { glyph: '·', text: r.status, tone: 'neutral' }
}

/** Short failure reason for a token (the engine's text, trimmed). */
export function failText(r: PipelineRun): string {
  const t = r.failReason ?? ''
  return t.length > 70 ? `${t.slice(0, 68)}…` : t
}

export const short = (d: string | null | undefined, n = 12) => shortDigest(d, n)

/** Runs that finished recently (sim seconds), newest first. */
export function recentFinished(s: PipelineState, n: number): PipelineRun[] {
  return s.runs.filter((r) => r.finishedAt !== null).slice(-n).reverse()
}

/** Images in the registry pushed by CI runs, newest first, plus the laptop image at the bottom. */
export function registryShelf(s: PipelineState, n: number): { key: string; tags: string; digest: string; laptop: boolean; tested: boolean }[] {
  const pushed = s.runs
    .filter((r) => r.digest && r.jobs.push.status === 'passed')
    .slice(-n)
    .reverse()
    .map((r) => ({ key: `r${r.id}`, tags: r.tags.join(', '), digest: r.digest as string, laptop: false, tested: true }))
  const first = s.prodHistory[0]
  const laptop = first && first.via === 'laptop' ? [{ key: 'laptop', tags: 'latest', digest: first.digest, laptop: true, tested: false }] : []
  return [...pushed, ...laptop]
}

/** What production runs right now, resolved through the run that first shipped that digest (also after a rollback). */
export function prodInfo(s: PipelineState): { label: string; digest: string; commit: string | null; tested: boolean; skipped: boolean; laptop: boolean; bad: boolean; rollingBack: boolean } {
  const digest = s.prod.digest
  const run = [...s.runs].reverse().find((r) => r.prodDigest === digest && r.status === 'in-prod')
  const first = s.prodHistory[0]
  const laptop = !run && first?.via === 'laptop' && first.digest === digest
  return {
    label: run ? (run.commit.version ?? run.commit.short) : laptop ? 'latest' : s.prod.version,
    digest,
    commit: run ? run.commit.short : laptop ? null : s.prod.commit,
    tested: run ? run.tested === true && ranChecks(run) : s.prod.tested,
    skipped: run ? !ranChecks(run) : false,
    laptop,
    bad: s.prod.bad,
    rollingBack: s.rollback !== null,
  }
}
