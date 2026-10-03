/**
 * Headless runs of the E4 lab that feed the lecture's drawings and terminal sessions with REAL engine output
 * (digests, push logs, layer lists), so every number in a static figure is the one the lab would show.
 */
import { buildNow, changeCode, createBuildLab, finishPush, moveTag, pullOnServer, pushImage, serverReport, shortDigest, type BuildLabState, type PushSummary } from '../../engines/build/index.ts'

export interface StoryLayer {
  digest: string
  label: string
  sizeMB: number
}

export interface RegistryStory {
  repo: string
  host: string
  /** first image (pushed as `sha1` and `latest`) */
  digestA: string
  /** the image after one code change (pushed as `sha2`; then `latest` is moved to it) */
  digestB: string
  sha1: string
  sha2: string
  layersA: StoryLayer[]
  layersB: StoryLayer[]
  push1: PushSummary
  push2: PushSummary
  /** both servers pull `latest`: A before the tag moved, B after */
  serverA: string
  serverB: string
  sameDigest: boolean
}

function layersOf(s: BuildLabState): StoryLayer[] {
  return (s.image?.layers ?? []).map((l) => ({ digest: l.digest, label: l.createdBy, sizeMB: l.sizeMB }))
}

/** `visefazna` (good order, multi-stage, seed 42): push, pull on A, edit code, rebuild, push, move `latest`, pull on B. */
function computeRegistryStory(): RegistryStory {
  const s = createBuildLab({ preset: 'visefazna', warm: true })
  const digestA = s.image?.digest ?? ''
  const layersA = layersOf(s)
  pushImage(s)
  const push1 = finishPush(s) as PushSummary
  pullOnServer(s, 'a', 'latest')
  changeCode(s)
  buildNow(s)
  const digestB = s.image?.digest ?? ''
  const layersB = layersOf(s)
  pushImage(s)
  const push2 = finishPush(s) as PushSummary
  moveTag(s, 'latest')
  pullOnServer(s, 'b', 'latest')
  const rep = serverReport(s)
  return {
    repo: s.project.repo,
    host: s.registry.host,
    digestA,
    digestB,
    sha1: push1.tags[0],
    sha2: push2.tags[0],
    layersA,
    layersB,
    push1,
    push2,
    serverA: rep.servers[0].digest ?? '',
    serverB: rep.servers[1].digest ?? '',
    sameDigest: rep.sameDigest,
  }
}

export const REGISTRY_STORY: RegistryStory = computeRegistryStory()

/** `sha256:9f2c41ab07e3` → `sha256:9f2c41…` (short form for drawings). */
export const dShort = (d: string, n = 6) => `${shortDigest(d, n)}…`
