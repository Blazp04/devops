/**
 * Plain view models of the E3 cluster for this lecture's drawings: Deployment → ReplicaSets → Pods.
 * Everything here only READS the engine state (deploymentView, podShapeView, versionToneFor) and copies it into
 * small plain objects, so a snapshot can be kept and drawn later (Stepper steps, the stalled rollout figure).
 */
import {
  deploymentView,
  findDeployment,
  podShapeView,
  versionToneFor,
  type ClusterState,
  type IntOrPercent,
  type Pod,
  type PodShapeStatus,
  type RevisionInfo,
  type VersionColour,
} from '../../../engines/cluster'

export const DEPLOYMENT = 'klopa-api'

export interface PodDot {
  id: string
  name: string
  version: string
  tone: VersionColour
  status: PodShapeStatus
  /** kubectl STATUS column (Running, ContainerCreating, CrashLoopBackOff …) */
  statusText: string
  ready: boolean
  terminating: boolean
  restarts: number
  nodeName: string | null
  /** owning ReplicaSet id (null = no owner: released by a label change or its owner is gone) */
  ownerId: string | null
  appLabel: string | null
}

export interface RsRow {
  id: string
  name: string
  hash: string
  revision: number
  version: string
  tone: VersionColour
  desired: number
  current: number
  ready: number
  available: number
  terminating: number
  isNew: boolean
  changeCause: string
  /** its Pods, oldest first (terminating ones included) */
  pods: PodDot[]
}

export interface BoardModel {
  t: number
  exists: boolean
  replicas: number
  strategy: 'RollingUpdate' | 'Recreate'
  maxSurge: IntOrPercent
  maxUnavailable: IntOrPercent
  surge: number
  unavailable: number
  minAvailable: number
  maxTotal: number
  available: number
  /** non-terminating Pods (what the rollout counts) */
  total: number
  /** .status.terminatingReplicas */
  terminating: number
  paused: boolean
  progressing: { status: string; reason: string; message: string }
  /** ReplicaSets newest first (by revision) */
  rows: RsRow[]
  history: RevisionInfo[]
  /** Pods of klopa-api that no ReplicaSet owns (escaped by a label, or left over after a cascade) */
  orphans: PodDot[]
  /** the Deployment's current template version (what `kubectl apply` asked for) */
  templateVersion: string | null
}

export function podDot(c: ClusterState, p: Pod): PodDot {
  const sv = podShapeView(p)
  return {
    id: p.id,
    name: p.name,
    version: p.spec.app.version,
    tone: versionToneFor(c, p.spec.app.version),
    status: sv.status,
    statusText: sv.label,
    ready: p.ready.status && !p.deletion,
    terminating: p.deletion !== null,
    restarts: p.container.restartCount,
    nodeName: p.nodeName,
    ownerId: p.owner?.id ?? null,
    appLabel: p.labels.app ?? null,
  }
}

function isApiPod(p: Pod): boolean {
  return p.name.startsWith(`${DEPLOYMENT}-`) && p.phase !== 'Succeeded'
}

const EMPTY_PROGRESS = { status: 'Unknown', reason: '', message: '' }

/** Everything the lecture draws about Deployment klopa-api, copied out of the live engine state. */
export function boardModel(c: ClusterState): BoardModel {
  const v = deploymentView(c, DEPLOYMENT)
  const d = findDeployment(c, DEPLOYMENT)
  const rsIds = new Set(c.replicaSets.map((r) => r.id))
  const apiPods = c.pods.filter(isApiPod).sort((a, b) => a.seq - b.seq)
  const rows: RsRow[] = (v?.replicaSets ?? []).map((r) => {
    const rs = c.replicaSets.find((x) => x.name === r.name)!
    return {
      id: rs.id,
      name: r.name,
      hash: rs.templateHash,
      revision: r.revision,
      version: r.version,
      tone: versionToneFor(c, r.version),
      desired: r.desired,
      current: r.current,
      ready: r.ready,
      available: r.available,
      terminating: r.terminating,
      isNew: r.isNew,
      changeCause: rs.changeCause,
      pods: apiPods.filter((p) => p.owner?.id === rs.id).map((p) => podDot(c, p)),
    }
  })
  const orphans = apiPods.filter((p) => !p.owner || !rsIds.has(p.owner.id) || !rows.some((r) => r.id === p.owner!.id)).map((p) => podDot(c, p))
  if (!v || !d) {
    return {
      t: c.t,
      exists: false,
      replicas: 0,
      strategy: 'RollingUpdate',
      maxSurge: '25%',
      maxUnavailable: '25%',
      surge: 0,
      unavailable: 0,
      minAvailable: 0,
      maxTotal: 0,
      available: 0,
      total: 0,
      terminating: orphans.filter((p) => p.terminating).length,
      paused: false,
      progressing: EMPTY_PROGRESS,
      rows: [],
      history: [],
      orphans,
      templateVersion: null,
    }
  }
  return {
    t: c.t,
    exists: true,
    replicas: v.replicas,
    strategy: v.strategy.type,
    maxSurge: v.strategy.maxSurge,
    maxUnavailable: v.strategy.maxUnavailable,
    surge: v.surge,
    unavailable: v.unavailable,
    minAvailable: v.minAvailable,
    maxTotal: v.maxTotal,
    available: v.available,
    total: v.totalPods,
    terminating: v.terminatingPods,
    paused: v.paused,
    progressing: { status: v.progressing.status, reason: v.progressing.reason, message: v.progressing.message },
    rows,
    history: v.history,
    orphans,
    templateVersion: d.template.app.version,
  }
}

/** Screen-reader description of the board (counts as „label: number”, so no plural forms are needed). */
export function boardLabel(b: BoardModel, rows: RsRow[]): string {
  if (!b.exists) return `Deployment klopa-api je obrisan. Podova u gašenju: ${b.orphans.length}.`
  const rs = rows.map((r) => `revizija ${r.revision}, verzija ${r.version}, spremno ${r.ready} od ${r.desired}`).join('; ')
  return `Deployment klopa-api: dostupno ${b.available} od ${b.replicas}, Podova ukupno: ${b.total}, u gašenju: ${b.terminating}. ReplicaSetovi: ${rs}.`
}

/** Rows that have Pods (or want some): the ones worth drawing. Scaled-to-zero ReplicaSets live in the history list. */
export function activeRows(b: BoardModel): RsRow[] {
  return b.rows.filter((r) => r.desired > 0 || r.pods.length > 0)
}

/** Requests answered (ok) per version in the last `windowS` seconds – „who is serving right now”. */
export function servedByVersion(c: ClusterState, windowS = 3): Record<string, number> {
  const from = c.t - windowS
  const out: Record<string, number> = {}
  for (const r of c.recent) {
    if (r.t < from || r.outcome !== 'ok' || !r.version) continue
    out[r.version] = (out[r.version] ?? 0) + 1
  }
  return out
}

/** Short ReplicaSet name for small drawings: „…-755954b78f” stays readable as „rs 755954b7”. */
export function shortHash(hash: string): string {
  return hash.slice(0, 6)
}

/** „želi 4 · ima 4 · spremno 3 · u gašenju 1” – the ReplicaSet's counters (spec, non-terminating, Ready). */
export function countsText(r: RsRow, wide: boolean): string {
  const base = `želi ${r.desired} · ima ${r.current} · spremno ${r.ready}`
  if (!r.terminating) return base
  return wide ? `${base} · u gašenju ${r.terminating}` : `${base} · gasi ${r.terminating}`
}
