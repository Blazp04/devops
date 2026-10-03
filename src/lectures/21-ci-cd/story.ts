/**
 * Numbers for the incident card and the explainers, computed once from the E4 engine with the flagship's preset and
 * seed – so what the text says is exactly what the simulation shows.
 */
import {
  approve,
  createPipeline,
  idealLeadTime,
  OIDC_TOKEN_LIFETIME,
  PIPELINE_PRESETS,
  rebuildForProduction,
  runPipelineUntilIdle,
  shortDigest,
  fmtSeconds,
} from '../../engines/build/index.ts'
import { createFactory, FACTORY_SEED } from './factory.ts'

/** Production at 09:00 in the `tvornica` preset: Davor's laptop build. */
const start = createPipeline({ ...PIPELINE_PRESETS.tvornica, seed: FACTORY_SEED })

/** The 2.0.1 run, once promoted normally and once with „Ponovno izgradi za produkciju” armed. */
function promote(rebuild: boolean) {
  const s = createFactory()
  if (rebuild) rebuildForProduction(s)
  runPipelineUntilIdle(s)
  approve(s)
  runPipelineUntilIdle(s)
  return s.runs[0]
}
const promoted = promote(false)
const rebuilt = promote(true)

const D = (d: string | null) => shortDigest(d, 12)

export const STORY = {
  laptop: { tag: start.prod.version, digest: D(start.prod.digest), commit: start.prod.commit },
  fix: {
    sha: promoted.commit.short,
    message: promoted.commit.message,
    tags: promoted.tags,
    digest: D(promoted.digest),
    prodDigest: D(promoted.prodDigest),
    rebuiltDigest: D(rebuilt.prodDigest),
    rebuildNote: rebuilt.rebuildNote ?? 'nove vremenske oznake RUN slojeva',
  },
  lead: {
    sequential: fmtSeconds(idealLeadTime({ parallelJobs: false, cache: false, skipTests: false, gate: 'deployment' })),
    parallel: fmtSeconds(idealLeadTime({ parallelJobs: true, cache: false, skipTests: false, gate: 'deployment' })),
    cache: fmtSeconds(idealLeadTime({ parallelJobs: false, cache: true, skipTests: false, gate: 'deployment' })),
    both: fmtSeconds(idealLeadTime({ parallelJobs: true, cache: true, skipTests: false, gate: 'deployment' })),
  },
  oidcLabel: OIDC_TOKEN_LIFETIME.label,
}
