/**
 * Small engine-driven labs of scene 4 (blue-green flip, two canary lanes) and scene 5 (expand / contract).
 * Thin wrappers over E3: they start releases at a fixed second, sample a few series and merge logs.
 */
import { Series, type SimEvent } from '../../../kit'
import {
  findService,
  migrateSchema,
  openConnections,
  presetRelease,
  releaseStats,
  rollbackRelease,
  startRelease,
  stepCluster,
  trafficTotals,
  type ClusterState,
} from '../../../engines/cluster'
import { SEED, tallyFailures } from './race'
import { relabelEvent } from './labels'

/** Share (0–100) of the requests of the last `windowS` seconds that reached the new version; NaN when too few. */
export function shareToNewPct(s: ClusterState, windowS = 5): number {
  const rel = s.release
  if (!rel) return Number.NaN
  let all = 0
  let toNew = 0
  for (const r of s.recent) {
    if (r.t < s.t - windowS || r.version === null) continue
    all++
    if (r.version === rel.newVersion) toNew++
  }
  return all >= 10 ? (100 * toNew) / all : Number.NaN
}

/** Error rate (percent) of the new version inside the current canary step (what the analysis looks at). */
export function stepErrorPct(s: ClusterState): number {
  const rel = s.release
  if (!rel || rel.phase !== 'canary' || rel.stepStartedAt === null) return Number.NaN
  const n = rel.metrics.stepOk + rel.metrics.stepFailed
  return n >= 5 ? (100 * rel.metrics.stepFailed) / n : Number.NaN
}

export function engineLog(s: ClusterState, kinds: Set<string>, prefix = '', from = 0): SimEvent[] {
  return s.events
    .filter((e) => kinds.has(e.kind) && e.t >= from)
    .map((e) => ({ id: `${prefix}${e.id}`, t: e.t, text: prefix ? `${prefix}: ${relabelEvent(e.text)}` : relabelEvent(e.text), tone: e.tone }))
}

// ---------------------------------------------------------------- blue-green flip

export type ClientMode = 'keep-alive' | 'per-request'
export const FLIP_CONNECTIONS = 6

export function createFlip(mode: ClientMode): ClusterState {
  return presetRelease({ strategy: 'blue-green', seed: SEED, bugRate: 0, keepAlive: mode === 'keep-alive' ? { connections: FLIP_CONNECTIONS, maxAgeS: null } : null })
}

export function flipView(s: ClusterState) {
  const rel = s.release!
  const byVersion = { blue: 0, green: 0 }
  for (const c of openConnections(s, 'web')) {
    const v = s.pods.find((p) => p.id === c.podId)?.spec.app.version
    if (v === rel.stableVersion) byVersion.blue++
    else if (v === rel.newVersion) byVersion.green++
  }
  const track = findService(s, 'klopa-api')?.selector.track ?? 'blue'
  const blueLeftS = rel.phase === 'promoted' && rel.promotedAt !== null ? Math.max(0, rel.scaleDownDelayS - (s.t - rel.promotedAt)) : null
  return { phase: rel.phase, track, conns: byVersion, toNew: shareToNewPct(s, 5), blueLeftS, delay: rel.scaleDownDelayS }
}

export const FLIP_KINDS = new Set(['release-start', 'release-rollback', 'bg-switch', 'bg-scale-down', 'client'])

// ---------------------------------------------------------------- two canary lanes

export const CANARY_START = 3

export interface CanaryLab {
  bug: boolean
  /** vat = distinct users with a wrong bill (see tallyFailures), noAnswer = orders without an answer */
  lanes: { key: 'replicas' | 'weights'; s: ClusterState; share: Series; err: Series; vat: Set<number>; noAnswer: Set<number> }[]
  started: boolean
  last: number
}

export function createCanaryLab(bug: boolean): CanaryLab {
  const mk = (key: 'replicas' | 'weights') => ({
    key,
    s: presetRelease({ strategy: key === 'replicas' ? 'canary-replicas' : 'canary-weights', seed: SEED, bugRate: bug ? 0.2 : 0 }),
    share: new Series(170),
    err: new Series(170),
    vat: new Set<number>(),
    noAnswer: new Set<number>(),
  })
  return { bug, lanes: [mk('replicas'), mk('weights')], started: false, last: -1 }
}

export function stepCanaryLab(c: CanaryLab, dt: number): void {
  for (const l of c.lanes) {
    const t0 = l.s.t
    stepCluster(l.s, dt)
    tallyFailures(l.s, t0, l.vat, l.noAnswer)
  }
  const t = c.lanes[0].s.t
  if (!c.started && t >= CANARY_START - 1e-9) {
    c.started = true
    for (const l of c.lanes) startRelease(l.s)
  }
  const sec = Math.floor(t + 1e-9)
  if (sec !== c.last) {
    c.last = sec
    for (const l of c.lanes) {
      l.share.push(shareToNewPct(l.s, 5))
      l.err.push(stepErrorPct(l.s))
    }
  }
}

export const CANARY_KINDS = new Set(['release-start', 'canary-step', 'release-promote', 'release-rollback'])

// ---------------------------------------------------------------- expand / contract

export interface SchemaLab {
  s: ClusterState
  goal: boolean
  /** a destructive step was taken in this run (rename in one step, or rollback after the drop) */
  broke: boolean
  /** the old column `cijena` was dropped in this run */
  dropped: boolean
}

export function createSchemaLab(): SchemaLab {
  return { s: presetRelease({ strategy: 'rolling', seed: SEED, schema: true }), goal: false, broke: false, dropped: false }
}

export function stepSchemaLab(x: SchemaLab, dt: number): void {
  stepCluster(x.s, dt)
  const rel = x.s.release!
  if (!x.goal && !x.broke && rel.phase === 'done' && !x.s.db.columns.includes('cijena') && x.s.db.columns.includes('cijena_s_pdv') && trafficTotals(x.s).failed === 0) x.goal = true
}

export function schemaView(x: SchemaLab) {
  const s = x.s
  const rel = s.release!
  const v1 = trafficTotals(s, { version: rel.stableVersion })
  const v2 = trafficTotals(s, { version: rel.newVersion })
  return { phase: rel.phase, columns: [...s.db.columns], v1Failed: v1.failed, v2Failed: v2.failed, failed: trafficTotals(s).failed, usersHit: releaseStats(s)?.usersHit ?? 0 }
}

export function expand(x: SchemaLab): boolean {
  return migrateSchema(x.s, { kind: 'add', column: 'cijena_s_pdv' })
}

export function contract(x: SchemaLab): boolean {
  const ok = migrateSchema(x.s, { kind: 'drop', column: 'cijena' })
  if (ok) x.dropped = true
  return ok
}

export function deployV2(x: SchemaLab): boolean {
  return startRelease(x.s).ok
}

export function rollbackV1(x: SchemaLab): boolean {
  return rollbackRelease(x.s).ok
}

/** Break it: Friday's plan – rename the column and start the rollout at once. */
export function renameAtOnce(x: SchemaLab): boolean {
  const ok = migrateSchema(x.s, { kind: 'rename', from: 'cijena', to: 'cijena_s_pdv' })
  if (!ok) return false
  x.broke = true
  if (x.s.release!.phase === 'idle') startRelease(x.s)
  return true
}

/** Break it: drop the old column, then roll back to 1.4.1 – the database does not go back. */
export function dropThenRollback(x: SchemaLab): boolean {
  const rel = x.s.release!
  if (rel.phase === 'idle' || rel.phase === 'rolled-back') return false
  if (x.s.db.columns.includes('cijena') && migrateSchema(x.s, { kind: 'drop', column: 'cijena' })) x.dropped = true
  x.broke = true
  return rollbackRelease(x.s, 'vraćanje nakon brisanja stupca').ok
}

export const SCHEMA_KINDS = new Set(['release-start', 'release-rollback', 'schema', 'rollout-done'])
