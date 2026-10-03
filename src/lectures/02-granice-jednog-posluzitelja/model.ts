/**
 * Lecture 02 flagship „Jedan poslužitelj protiv ručka”: a thin wrapper around the shared E1 engine
 * (src/engines/traffic, mode 'direct'). The engine owns the model (worker pool, queue, 503, OOM, resize, power);
 * this file only adds what the lecture needs on top: the burst measurement window behind the incident card,
 * availability over the last 60 s (share of successful requests, plus how long the process was up), the goals, and
 * Davor's reactions.
 *
 * Incident card numbers (preset `l02-incident`, seed 42): the burst window gives 51,3 % errors (all 503),
 * p95 3,0 s, CPU 17 %, goodput 5,7/s — identical to runPreset('l02-incident') (checked tick for tick).
 */
import {
  BASE_RAM_MB,
  DT_MS,
  WORKLOADS,
  burst,
  capacityOf,
  configure,
  createScenario,
  mark,
  metrics,
  monthlyPriceEur,
  nextBiggerSize,
  powerOff,
  powerOn,
  pushEvent,
  ramUsedMB,
  resizeServer,
  setServerSize,
  since,
  singleServer,
  tick,
  workersFor,
  type ErrorCounts,
  type Mark,
  type TrafficState,
  type WorkloadId,
} from '../../engines/traffic'
import { fmt } from '../../kit'

export interface LunchParams {
  lambda: number
  workload: WorkloadId
  queueMax: number
  unbounded: boolean
}

/** Ponedjeljak 11:58 on Klopa's VPS: I/O workload (requests mostly wait for Postgres), λ 4, queue 10. */
export const INCIDENT_PARAMS: LunchParams = { lambda: 4, workload: 'io', queueMax: 10, unbounded: false }
export const INCIDENT_SIZE = { vcpu: 2, ramGB: 2 }
export const PRESET_ID = 'l02-incident'
export const SEED = 42
/** The scripted burst starts at 20 s (12:00:00); createScenario pre-runs 15 s, so it comes 5 s after a replay starts. */
export const BURST_AT_S = 20

/** Goals (README of E1: p95 < 1 s is below the I/O latency floor of 1,15 s, so the goal is p95 < 2 s). */
export const GOAL_P95_MS = 2000
export const GOAL_ERR = 0.01
export const GOAL_PRICE = 18
export const GOAL_OFFERED = 12

export interface BurstReport {
  id: number
  /** sim seconds when the burst ended */
  t: number
  vcpu: number
  ramGB: number
  price: number
  workload: WorkloadId
  offered: number
  ok: number
  okRps: number
  errors: ErrorCounts
  errorRate: number
  p95: number | null
  cpu: number
  /** nothing was changed while it ran */
  valid: boolean
  survived: boolean
}

interface BurstWindow {
  mark: Mark
  busy0: number
  vcpu: number
  ramGB: number
  params: LunchParams
  offered: number
  valid: boolean
  until: number
}

export interface LunchGoals {
  survived: boolean
  survivedCheap: boolean
  ramNoHelp: boolean
  oom: boolean
}

export interface LunchState {
  s: TrafficState
  params: LunchParams
  burst: BurstWindow | null
  lastBurstUntil: number
  reports: BurstReport[]
  reportId: number
  /** a resize is in progress (the machine is off because of it, not because the plug was pulled) */
  resizing: boolean
  plugged: boolean
  /** the last 60 s, one entry per tick: process up (1/0), successful requests, failed requests */
  upRing: Uint8Array
  okRing: Uint16Array
  errRing: Uint16Array
  upIdx: number
  upN: number
  upSum: number
  okSum: number
  errSum: number
  lastOk: number
  lastErr: number
  lastOoms: number
  goals: LunchGoals
}

const UP_WINDOW = 60_000 / DT_MS

/** Goals survive „ispočetka” (only one flagship sim lives on the page). */
const memory: { goals: LunchGoals } = { goals: { survived: false, survivedCheap: false, ramNoHelp: false, oom: false } }

/**
 * RAM as `htop` / `free -m` would show it. gunicorn pre-forks its whole pool, so a bounded pool keeps all W radnici
 * resident (512 MB + W × 256 MB) even while they idle or wait for the database. Only with „Neograničeni radnici”
 * (a new radnik per request) does RAM follow the requests in progress, which is what the engine counts.
 */
export function residentRamMB(s: TrafficState, v: TrafficState['servers'][number]): number {
  const engineMB = ramUsedMB(s, v)
  if (s.cfg.unboundedWorkers || v.proc !== 'up') return engineMB
  return Math.max(engineMB, BASE_RAM_MB + v.leakMB + workersFor(v.ramGB, WORKLOADS[s.cfg.workload].memMB) * WORKLOADS[s.cfg.workload].memMB)
}

export function priceOf(vcpu: number, ramGB: number): number {
  return monthlyPriceEur(vcpu, ramGB)
}

/** Keep a number and its unit on one line in running text (the kit's fmt uses a normal space): „17 %”, „3 s”, „15 €”. */
export function nb(t: string): string {
  return t.replace(/(\d) (?=%|ms\b|s\b|min\b|h\b|GB\b|vCPU\b|€)/g, '$1\u00a0')
}

/** Latency with one decimal from a second up („3,0 s”, „1,6 s”, „850 ms”), as on the incident card. */
export function fmtLat(ms: number | null): string {
  if (ms === null) return 'n/a'
  return ms >= 1000 ? `${fmt.num(ms / 1000, 1)} s` : fmt.ms(ms)
}

export function fmtEur(v: number): string {
  return `${fmt.num(v, v % 1 ? 1 : 0)} €`
}

/** A fresh run of the incident scenario with the given settings (same seed ⇒ the same traffic). */
export function createLunch(params: LunchParams = INCIDENT_PARAMS, size: { vcpu: number; ramGB: number } = INCIDENT_SIZE): LunchState {
  const s = createScenario(PRESET_ID, {
    servers: singleServer(size.vcpu, size.ramGB),
    workload: params.workload,
    lambda: params.lambda,
    queueMax: params.queueMax,
    unboundedWorkers: params.unbounded,
  })
  return {
    s,
    params: { ...params },
    burst: null,
    lastBurstUntil: s.burstUntil,
    reports: [],
    reportId: 1,
    resizing: false,
    plugged: true,
    upRing: new Uint8Array(UP_WINDOW),
    okRing: new Uint16Array(UP_WINDOW),
    errRing: new Uint16Array(UP_WINDOW),
    upIdx: 0,
    upN: 0,
    upSum: 0,
    okSum: 0,
    errSum: 0,
    lastOk: s.totals.ok,
    lastErr: errorsTotal(s),
    lastOoms: s.totals.ooms,
    goals: memory.goals,
  }
}

/** „Ponovi isti promet”: same seed and the same scripted 12:00 burst, with the current settings. Reports and goals stay. */
export function replayLunch(w: LunchState): void {
  const v = w.s.servers[0]
  const fresh = createLunch(w.params, { vcpu: v.vcpu, ramGB: v.ramGB })
  const keep = { reports: w.reports, reportId: w.reportId }
  Object.assign(w, fresh, keep)
  pushEvent(w.s, `Isti promet ispočetka (seed ${SEED}): nalet u 12:00 stiže za 5 s.`, 'info')
}

/** Advance by dt seconds in fixed 10 ms engine ticks (exactly like the engine's step), with the lecture's bookkeeping after each tick. */
export function stepLunch(w: LunchState, dt: number): void {
  if (!(dt > 0)) return
  const s = w.s
  s.acc += Math.min(dt, 1) * 1000
  while (s.acc >= DT_MS - 1e-9) {
    tick(s)
    s.acc -= DT_MS
    afterTick(w)
  }
}

function errorsTotal(s: TrafficState): number {
  return s.totals.e502 + s.totals.e503 + s.totals.e504 + s.totals.refused
}

function afterTick(w: LunchState): void {
  const s = w.s
  const v = s.servers[0]
  const i = w.upIdx
  const up = v.proc === 'up' ? 1 : 0
  w.upSum += up - w.upRing[i]
  w.upRing[i] = up
  const err = errorsTotal(s)
  const dOk = Math.min(65535, s.totals.ok - w.lastOk)
  const dErr = Math.min(65535, err - w.lastErr)
  w.lastOk = s.totals.ok
  w.lastErr = err
  w.okSum += dOk - w.okRing[i]
  w.okRing[i] = dOk
  w.errSum += dErr - w.errRing[i]
  w.errRing[i] = dErr
  w.upIdx = (i + 1) % UP_WINDOW
  w.upN = Math.min(UP_WINDOW, w.upN + 1)
  // a burst started by the scenario's script (12:00) — clicks open their window in sendBurst()
  if (s.burstUntil !== w.lastBurstUntil) {
    w.lastBurstUntil = s.burstUntil
    if (s.burstUntil > s.t) openBurst(w)
  }
  if (w.burst && s.t >= w.burst.until) closeBurst(w)
  // the engine narrates the OOM itself („nestalo je RAM-a (OOM) – proces je ubijen …”); here only the goal ticks
  if (s.totals.ooms > w.lastOoms) {
    w.lastOoms = s.totals.ooms
    w.goals.oom = true
  }
  if (w.resizing && v.proc === 'up') w.resizing = false
}

function openBurst(w: LunchState): void {
  const s = w.s
  const v = s.servers[0]
  w.burst = {
    mark: mark(s),
    busy0: v.busyCoreMsTotal,
    vcpu: v.vcpu,
    ramGB: v.ramGB,
    params: { ...w.params },
    offered: w.params.lambda * s.burstFactor,
    valid: v.proc === 'up',
    until: s.burstUntil,
  }
}

function closeBurst(w: LunchState): void {
  const b = w.burst
  if (!b) return
  const s = w.s
  const v = s.servers[0]
  const r = since(s, b.mark)
  const cpu = r.durationS > 0 && b.vcpu > 0 ? (v.busyCoreMsTotal - b.busy0) / (r.durationS * 1000 * b.vcpu) : 0
  const price = priceOf(b.vcpu, b.ramGB)
  const survived =
    b.valid && b.params.workload === 'io' && b.offered >= GOAL_OFFERED - 1e-9 && r.errorRate < GOAL_ERR && r.p95 !== null && r.p95 < GOAL_P95_MS
  const report: BurstReport = {
    id: w.reportId++,
    t: Math.round(s.t / 100) / 10,
    vcpu: b.vcpu,
    ramGB: b.ramGB,
    price,
    workload: b.params.workload,
    offered: b.offered,
    ok: r.ok,
    okRps: r.durationS > 0 ? r.ok / r.durationS : 0,
    errors: r.errors,
    errorRate: r.errorRate,
    p95: r.p95,
    cpu: Math.min(1, Math.max(0, cpu)),
    valid: b.valid,
    survived,
  }
  w.reports = [...w.reports, report].slice(-3)
  w.burst = null
  if (survived) {
    w.goals.survived = true
    if (price <= GOAL_PRICE) w.goals.survivedCheap = true
  }
  const p95 = fmtLat(r.p95)
  pushEvent(
    s,
    `Mjerenje naleta (30 s): ${fmt.pct(r.errorRate, 1)} grešaka, p95 ${p95}, procesor ${fmt.pct(report.cpu)}${b.valid ? '' : ' – ne vrijedi, postavke su se mijenjale'}.`,
    !b.valid ? 'info' : survived ? 'ok' : 'bad',
  )
}

function invalidate(w: LunchState, why: string): void {
  if (w.burst && w.burst.valid) {
    w.burst.valid = false
    pushEvent(w.s, `Mjerenje naleta ne vrijedi: ${why} usred naleta.`, 'info')
  }
}

/* ---------- actions (called through sim.mutate) ---------- */

function apply(w: LunchState): void {
  configure(w.s, { lambda: w.params.lambda, workload: w.params.workload, queueMax: w.params.queueMax, unboundedWorkers: w.params.unbounded })
}

export function setLambda(w: LunchState, lambda: number): void {
  if (lambda === w.params.lambda) return
  w.params.lambda = lambda
  apply(w)
  invalidate(w, 'promet se promijenio')
}

export function setWorkload(w: LunchState, workload: WorkloadId): void {
  if (workload === w.params.workload) return
  w.params.workload = workload
  apply(w)
  invalidate(w, 'vrsta posla se promijenila')
}

export function setQueueMax(w: LunchState, queueMax: number): void {
  if (queueMax === w.params.queueMax) return
  w.params.queueMax = queueMax
  apply(w)
  invalidate(w, 'duljina reda se promijenila')
}

export function setUnbounded(w: LunchState, on: boolean): void {
  if (on === w.params.unbounded) return
  w.params.unbounded = on
  apply(w)
  invalidate(w, 'broj radnika se promijenio')
}

/** Why the size cannot change right now (plug pulled or a resize running), or null. */
export function sizeLocked(w: LunchState): string | null {
  if (!w.plugged) return 'Najprije uključite poslužitelj.'
  if (w.resizing) return 'Poslužitelj već mijenja veličinu.'
  return null
}

/**
 * vCPU / RAM selectors: instant in the sim (a real resize means stop + start, see biggerServer). The sim also sets
 * the number of radnici to fill the new RAM ((RAM − 512 MB) / 256 MB); with real gunicorn that is `workers` in
 * gunicorn.conf.py and a restart.
 */
export function setSize(w: LunchState, size: { vcpu?: number; ramGB?: number }): void {
  const s = w.s
  const v = s.servers[0]
  const vcpu = size.vcpu ?? v.vcpu
  const ramGB = size.ramGB ?? v.ramGB
  if (vcpu === v.vcpu && ramGB === v.ramGB) return
  const locked = sizeLocked(w)
  if (locked) {
    pushEvent(s, locked, 'info')
    return
  }
  const wl = w.params.workload
  const before = capacityOf(v.vcpu, v.ramGB, wl)
  const after = capacityOf(vcpu, ramGB, wl)
  const offered = metrics(s).offered
  if (ramGB > v.ramGB && vcpu === v.vcpu && before.bound === 'cpu' && after.cap <= before.cap + 1e-9) {
    w.goals.ramNoHelp = true
    const low = offered < 0.8 * before.cap
    pushEvent(
      s,
      `Više RAM-a, isti kapacitet: usko grlo je procesor (${fmt.num(v.vcpu)} vCPU × 1000 / ${WORKLOADS[wl].cpuMs} ms = najviše ${fmt.num(before.cpu, 1)} odgovora/s).${
        low ? ' Pošaljite nalet pa će se to vidjeti i u brojkama.' : ''
      }`,
      'warn',
    )
  }
  setServerSize(s, 's1', { vcpu, ramGB })
  invalidate(w, 'poslužitelj je promijenio veličinu')
}

/** „Veći poslužitelj”: the next catalogue size, with the resize downtime (20 s sim · stvarno: minute). */
export function biggerServer(w: LunchState): boolean {
  const s = w.s
  const v = s.servers[0]
  const next = nextBiggerSize(v.vcpu, v.ramGB)
  if (!next) {
    pushEvent(s, 'Nema većeg poslužitelja u ponudi: 8 vCPU i 16 GB je strop.', 'warn')
    return false
  }
  const locked = sizeLocked(w)
  if (locked) {
    pushEvent(s, locked, 'info')
    return false
  }
  const ok = resizeServer(s, 's1', next.vcpu, next.ramGB)
  if (ok) {
    w.resizing = true
    invalidate(w, 'poslužitelj je mijenjao veličinu')
  }
  return ok
}

export function sendBurst(w: LunchState): void {
  const s = w.s
  burst(s)
  w.lastBurstUntil = s.burstUntil
  openBurst(w)
}

export function pullPlug(w: LunchState): void {
  if (powerOff(w.s, 's1')) {
    w.plugged = false
    w.resizing = false
    invalidate(w, 'utikač je izvučen')
  }
}

export function plugIn(w: LunchState): void {
  if (powerOn(w.s, 's1')) w.plugged = true
}

/* ---------- read-only helpers for the UI ---------- */

/** At least 10 s of data before the stat shows a number. */
const AVAIL_MIN_TICKS = 10_000 / DT_MS

export interface Availability {
  /** share of finished requests that succeeded (null = n/a) */
  requests: number | null
  /** share of time the process was up */
  processUp: number | null
  /** seconds the window covers (≤ 60) */
  windowS: number
}

/** „Dostupnost”: the share of requests answered successfully over the last 60 s — and, for contrast, process uptime. */
export function availability(w: LunchState): Availability {
  const enough = w.upN >= AVAIL_MIN_TICKS
  const done = w.okSum + w.errSum
  return {
    requests: enough && done >= 20 ? w.okSum / done : null,
    processUp: enough ? w.upSum / w.upN : null,
    windowS: Math.floor((w.upN * DT_MS) / 1000),
  }
}

/** Simulated time as a wall clock: the scripted burst at 20 s is 12:00:00. */
export function clockOf(w: LunchState): string {
  const sec = Math.floor(w.s.t / 1000) - BURST_AT_S + 12 * 3600
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const ss = sec % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

export function burstLeftS(w: LunchState): number {
  return Math.max(0, Math.ceil((w.s.burstUntil - w.s.t) / 1000))
}
