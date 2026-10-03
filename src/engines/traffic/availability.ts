/**
 * L03 „Arhitekt dostupnosti”: Klopa as a chain ulaz → app servers × N → baza, simulated hour by hour for one year
 * (8760 steps, seeded) and compared with the formulas.
 *
 * Each component fails independently; a failure lasts MTTR hours (4 h). The hourly failure probability is chosen so the
 * long-run availability equals the slider value exactly: p = (1−A) / ((1−A) + MTTR·A).
 * Things the formula ignores and the year shows:
 *   - shared rack / power ('Isti ormar'): one extra failure process that takes all app servers down together;
 *   - 'Loša konfiguracija': every app server down for 1 h (redundancy does not help against the same mistake);
 *   - N+1: during weekday lunch (12–14 h) the app tier counts as down if the surviving servers cannot carry the peak
 *     (2 servers at 70 % of peak each: one failure → 100/70 ≈ 143 % on the survivor);
 *   - detection time: each app-server failure adds that much downtime while the LB still sends it requests.
 *     By default ('full') the whole window counts as an outage (pessimistic: more servers → more windows);
 *     detectionWeight 'share' counts only the dead server's share of the traffic (k failed of n serving → k/n).
 * Pure TypeScript; step(state, dtSeconds) renders the year in ~10 s (876 h per simulated second).
 */
import { createRng, type Rng } from '../../kit/sim/math.ts'
import { monthlyPriceEur } from './constants.ts'
import { mtbfFor, parallelAvailability, seriesAvailability } from './formulas.ts'
import type { Tone } from './types.ts'

export const HOURS_PER_YEAR = 8760

export interface YearConfig {
  seed: number
  /** Availability of the entry (DNS + load balancer) */
  entry: number
  app: {
    count: number
    availability: number
    /** Share of the lunch peak one app server can carry (0.7 = 70 %) */
    capacityShare: number
  }
  db: number
  /** All app servers share one rack / power feed */
  sameRack: boolean
  rackAvailability: number
  /** Repair time per failure, hours */
  mttrH: number
  /** Extra downtime per app-server failure while the LB still sends it traffic, minutes */
  detectionMin: number
  /**
   * How a failover window counts. 'full' (default, validated): the whole window is an outage. 'share': only the
   * failed servers' share of the traffic fails (k new failures among n servers that were serving → k/n of the window).
   */
  detectionWeight: 'full' | 'share'
  lunch: { startH: number; endH: number }
  /** Illustrative monthly prices (€) */
  costs: { entryEur: number; appServerEur: number; dbEur: number }
  /** Simulated hours per second of step() time (8760 h in 10 s) */
  hoursPerSecond: number
}

export type YearCause = 'entry' | 'db' | 'app' | 'rack' | 'config' | 'capacity' | 'detection'

export const YEAR_CAUSE_LABEL: Record<YearCause, string> = {
  entry: 'ulaz',
  db: 'baza',
  app: 'svi poslužitelji aplikacije',
  rack: 'kvar ormara',
  config: 'loša konfiguracija',
  capacity: 'premalo kapaciteta (N+1)',
  detection: 'vrijeme otkrivanja kvara',
}

export interface YearComponent {
  name: string
  availability: number
  /** Hourly failure probability */
  pFail: number
  /** Hours of repair left */
  downLeft: number
  down: boolean
  failures: number
}

export interface YearOutage {
  startH: number
  endH: number
  cause: YearCause
}

export interface YearEvent {
  id: number
  /** Seconds into the „godina u 10 sekundi” animation (hour / hoursPerSecond), one decimal – fits the kit's EventLog */
  t: number
  /** Hour of the year */
  h: number
  text: string
  tone: Tone
}

export interface YearState {
  cfg: YearConfig
  rng: Rng
  /** Whole hours simulated so far (0..8760) */
  hour: number
  acc: number
  entry: YearComponent
  db: YearComponent
  app: YearComponent[]
  rack: YearComponent
  badConfigLeft: number
  /** Pending forced rack failure (button) */
  forceRack: boolean
  /** Forced app-server failures (rackFailure with countDetection) whose failover window the next hour still pays */
  forcedAppFailures: number
  downH: number
  downByCause: Record<YearCause, number>
  lunchesTotal: number
  lunchesLost: number
  lunchHit: boolean
  /** 1 = down that hour, 0.x = partial (detection), 0 = up */
  hourly: Float32Array
  outages: YearOutage[]
  events: YearEvent[]
  nextEventId: number
  done: boolean
}

export function defaultYearConfig(): YearConfig {
  return {
    seed: 42,
    entry: 0.9999,
    app: { count: 2, availability: 0.99, capacityShare: 0.7 },
    db: 0.999,
    sameRack: false,
    rackAvailability: 0.999,
    mttrH: 4,
    detectionMin: 1,
    detectionWeight: 'full',
    lunch: { startH: 12, endH: 14 },
    costs: { entryEur: 10, appServerEur: monthlyPriceEur(2, 4), dbEur: monthlyPriceEur(4, 8) },
    hoursPerSecond: HOURS_PER_YEAR / 10,
  }
}

const clamp01 = (v: number, fb: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fb)

export function resolveYearConfig(input: Partial<Omit<YearConfig, 'app' | 'lunch' | 'costs'>> & { app?: Partial<YearConfig['app']>; lunch?: Partial<YearConfig['lunch']>; costs?: Partial<YearConfig['costs']> } = {}): YearConfig {
  const d = defaultYearConfig()
  const app = { ...d.app, ...input.app }
  return {
    ...d,
    ...input,
    seed: Number.isFinite(input.seed) ? (input.seed as number) >>> 0 : d.seed,
    entry: clamp01(input.entry ?? d.entry, d.entry),
    db: clamp01(input.db ?? d.db, d.db),
    rackAvailability: clamp01(input.rackAvailability ?? d.rackAvailability, d.rackAvailability),
    app: {
      count: Math.max(0, Math.min(20, Math.round(Number.isFinite(app.count) ? app.count : d.app.count))),
      availability: clamp01(app.availability, d.app.availability),
      capacityShare: Number.isFinite(app.capacityShare) && app.capacityShare > 0 ? app.capacityShare : d.app.capacityShare,
    },
    mttrH: Math.max(1, Math.round(Number.isFinite(input.mttrH) ? (input.mttrH as number) : d.mttrH)),
    detectionMin: Math.max(0, Number.isFinite(input.detectionMin) ? (input.detectionMin as number) : d.detectionMin),
    detectionWeight: input.detectionWeight === 'share' ? 'share' : 'full',
    lunch: { ...d.lunch, ...input.lunch },
    costs: { ...d.costs, ...input.costs },
    hoursPerSecond: Number.isFinite(input.hoursPerSecond) && (input.hoursPerSecond as number) > 0 ? (input.hoursPerSecond as number) : d.hoursPerSecond,
  }
}

/** Hourly failure probability for availability A and repair time MTTR (h). A = 1 → 0; A = 0 → 1. */
export function hourlyFailureProbability(A: number, mttrH: number): number {
  const a = clamp01(A, 1)
  if (a >= 1) return 0
  if (a <= 0) return 1
  return (1 - a) / (1 - a + mttrH * a)
}

function comp(name: string, availability: number, mttrH: number): YearComponent {
  return { name, availability, pFail: hourlyFailureProbability(availability, mttrH), downLeft: 0, down: false, failures: 0 }
}

export function createYear(input: Parameters<typeof resolveYearConfig>[0] = {}): YearState {
  const cfg = resolveYearConfig(input)
  return {
    cfg,
    rng: createRng(cfg.seed),
    hour: 0,
    acc: 0,
    entry: comp('ulaz', cfg.entry, cfg.mttrH),
    db: comp('baza', cfg.db, cfg.mttrH),
    app: Array.from({ length: cfg.app.count }, (_, i) => comp(`app${i + 1}`, cfg.app.availability, cfg.mttrH)),
    rack: comp('ormar', cfg.rackAvailability, cfg.mttrH),
    badConfigLeft: 0,
    forceRack: false,
    forcedAppFailures: 0,
    downH: 0,
    downByCause: { entry: 0, db: 0, app: 0, rack: 0, config: 0, capacity: 0, detection: 0 },
    lunchesTotal: 0,
    lunchesLost: 0,
    lunchHit: false,
    hourly: new Float32Array(HOURS_PER_YEAR),
    outages: [],
    events: [],
    nextEventId: 1,
    done: false,
  }
}

/** Advance the year by dtSeconds of sim time (876 h per second by default). */
export function stepYear(s: YearState, dtSeconds: number): void {
  if (!(dtSeconds > 0) || s.done) return
  s.acc += Math.min(dtSeconds, 60) * s.cfg.hoursPerSecond
  while (s.acc >= 1 && !s.done) {
    hourTick(s)
    s.acc -= 1
  }
}

/** Run the rest of the year at once. */
export function finishYear(s: YearState): YearState {
  while (!s.done) hourTick(s)
  return s
}

/**
 * „Kvar ormara”: with a shared rack every app server goes down together; otherwise only the first one.
 * By default that single failure is taken over instantly (no failover window). { countDetection: true } makes it pay
 * the detection window like a random failure does (counted on the next simulated hour).
 */
export function rackFailure(s: YearState, opts: { countDetection?: boolean } = {}) {
  if (s.cfg.sameRack) s.forceRack = true
  else if (s.app[0]) {
    if (opts.countDetection && s.app[0].downLeft === 0) s.forcedAppFailures++
    s.app[0].downLeft = s.cfg.mttrH
    s.app[0].failures++
    yearLog(s, `Kvar ormara: ${s.app[0].name} je pao, ostali poslužitelji su u drugim ormarima.`, 'warn')
  }
}

/** „Loša konfiguracija na svim poslužiteljima”: all app servers down for 1 h. */
export function badConfig(s: YearState) {
  s.badConfigLeft = 1
  yearLog(s, 'Loša konfiguracija na svim poslužiteljima: redundancija ne pomaže protiv iste greške.', 'bad')
}

/** "dan 37 · 12:00" */
export function hourLabel(h: number): string {
  const day = Math.floor(h / 24) + 1
  const hod = Math.floor(h % 24)
  return `dan ${day} · ${String(hod).padStart(2, '0')}:00`
}

function yearLog(s: YearState, text: string, tone: Tone) {
  s.events.push({ id: s.nextEventId++, t: Math.round((s.hour / s.cfg.hoursPerSecond) * 10) / 10, h: s.hour, text, tone })
  while (s.events.length > 50) s.events.shift()
}

function failMaybe(s: YearState, c: YearComponent, force = false): boolean {
  if (c.downLeft === 0 && (force || s.rng.next() < c.pFail)) {
    c.downLeft = s.cfg.mttrH
    c.failures++
    return true
  }
  return false
}

function consume(c: YearComponent) {
  c.down = c.downLeft > 0
  if (c.downLeft > 0) c.downLeft--
}

function hourTick(s: YearState) {
  if (s.hour >= HOURS_PER_YEAR) {
    s.done = true
    return
  }
  const h = s.hour
  const cfg = s.cfg
  const day = Math.floor(h / 24)
  const hod = h % 24
  const weekday = day % 7 < 5
  const isLunch = weekday && hod >= cfg.lunch.startH && hod < cfg.lunch.endH

  // failures (fixed draw order: entry, db, app servers, rack → reproducible)
  if (failMaybe(s, s.entry)) yearLog(s, `${hourLabel(h)}: kvar ulaza (${cfg.mttrH} h).`, 'bad')
  if (failMaybe(s, s.db)) yearLog(s, `${hourLabel(h)}: kvar baze (${cfg.mttrH} h) – cijeli lanac stoji.`, 'bad')
  let newAppFailures = 0
  for (const a of s.app) {
    if (failMaybe(s, a)) {
      newAppFailures++
      yearLog(s, `${hourLabel(h)}: ${a.name} je pao (${cfg.mttrH} h).`, 'warn')
    }
  }
  newAppFailures += s.forcedAppFailures
  s.forcedAppFailures = 0
  const rackDraw = cfg.sameRack && failMaybe(s, s.rack, s.forceRack)
  if (rackDraw) yearLog(s, `${hourLabel(h)}: kvar ormara – svi poslužitelji aplikacije padaju zajedno.`, 'bad')
  s.forceRack = false
  consume(s.entry)
  consume(s.db)
  for (const a of s.app) consume(a)
  consume(s.rack)
  const rackDown = cfg.sameRack && s.rack.down
  const configDown = s.badConfigLeft > 0
  if (configDown) s.badConfigLeft--

  const appUp = rackDown || configDown ? 0 : s.app.filter((a) => !a.down).length
  const shortOfCapacity = isLunch && appUp > 0 && appUp * cfg.app.capacityShare < 1

  let cause: YearCause | null = null
  if (s.entry.down) cause = 'entry'
  else if (s.db.down) cause = 'db'
  else if (rackDown) cause = 'rack'
  else if (configDown) cause = 'config'
  else if (appUp === 0) cause = 'app'
  else if (shortOfCapacity) cause = 'capacity'

  let down = cause ? 1 : 0
  if (!cause && newAppFailures > 0 && cfg.detectionMin > 0) {
    const share = cfg.detectionWeight === 'share' ? 1 / (appUp + newAppFailures) : 1
    down = Math.min(1, (newAppFailures * share * cfg.detectionMin) / 60)
    s.downByCause.detection += down
  }
  if (cause) s.downByCause[cause] += 1
  s.downH += down
  s.hourly[h] = down

  if (cause) {
    const last = s.outages[s.outages.length - 1]
    if (last && last.endH === h && last.cause === cause) last.endH = h + 1
    else if (s.outages.length < 1000) s.outages.push({ startH: h, endH: h + 1, cause })
  }

  // lunches
  if (weekday && hod === cfg.lunch.startH) {
    s.lunchesTotal++
    s.lunchHit = false
  }
  if (isLunch && down > 0) s.lunchHit = true
  if (weekday && hod === cfg.lunch.endH - 1 && s.lunchHit) {
    s.lunchesLost++
    s.lunchHit = false
  }

  s.hour++
  if (s.hour >= HOURS_PER_YEAR) s.done = true
}

export interface YearReport {
  hours: number
  downtimeH: number
  /** Simulated availability so far */
  availability: number
  /** Formula: entry × (parallel app servers) × db (× rack if shared); assumes independent failures, instant failover, enough capacity */
  formulaAvailability: number
  /** The naive formula: entry × (parallel app servers) × db, ignoring the shared rack */
  naiveFormulaAvailability: number
  formulaDowntimeH: number
  lunchesTotal: number
  lunchesLost: number
  failures: { entry: number; db: number; app: number; rack: number }
  downByCause: Record<YearCause, number>
  /** Load on the survivors after one app-server failure (1.43 = 143 %) */
  survivorLoad: number
  nPlusOne: boolean
  costEurPerMonth: number
}

/**
 * Analytic availability of the chain. By default it includes the shared rack as one more component in series when
 * „Isti ormar” is on; { naive: true } gives the number students compute first (independent failures only), so the UI
 * can show naive formula vs rack-aware formula vs the simulated year side by side.
 */
export function formulaAvailability(cfg: YearConfig, opts: { naive?: boolean } = {}): number {
  const appTier = parallelAvailability(Array.from({ length: cfg.app.count }, () => cfg.app.availability))
  const parts = [cfg.entry, appTier, cfg.db]
  if (cfg.sameRack && !opts.naive) parts.push(cfg.rackAvailability)
  return seriesAvailability(parts)
}

export function yearReport(s: YearState): YearReport {
  const cfg = s.cfg
  const fa = formulaAvailability(cfg)
  const hours = s.hour
  const n = cfg.app.count
  return {
    hours,
    downtimeH: s.downH,
    availability: hours ? 1 - s.downH / hours : 1,
    formulaAvailability: fa,
    naiveFormulaAvailability: formulaAvailability(cfg, { naive: true }),
    formulaDowntimeH: (1 - fa) * HOURS_PER_YEAR,
    lunchesTotal: s.lunchesTotal,
    lunchesLost: s.lunchesLost,
    failures: { entry: s.entry.failures, db: s.db.failures, app: s.app.reduce((a, c) => a + c.failures, 0), rack: s.rack.failures },
    downByCause: { ...s.downByCause },
    survivorLoad: n > 1 ? 1 / ((n - 1) * cfg.app.capacityShare) : Infinity,
    nPlusOne: n > 1 && (n - 1) * cfg.app.capacityShare >= 1,
    costEurPerMonth: cfg.costs.entryEur + n * cfg.costs.appServerEur + cfg.costs.dbEur,
  }
}

/** Run a whole year headless. */
export function runYear(input: Parameters<typeof resolveYearConfig>[0] = {}): YearReport {
  return yearReport(finishYear(createYear(input)))
}

/** MTBF (h) the year uses for availability A (exposed for the „A = MTBF/(MTBF+MTTR)” explainer). */
export function yearMtbf(A: number, mttrH = 4): number {
  return mtbfFor(A, mttrH)
}

/* ---------- L03 „Spor ili mrtav?” ---------- */

export interface TimeoutTradeoffInput {
  seed?: number
  /** The detector's timeout: no answer within it → „mrtav” */
  timeoutMs: number
  /** Number of checked requests (heartbeats), default 1000 */
  n?: number
  /** Mean answer time of a healthy server (exponential), ms; default 100 */
  latencyMs?: number
  faults?: {
    /** Share of requests that go to a crashed server (never answers), default 0.02 */
    crash?: number
    /** Share hit by a stop-the-world GC pause, default 0.05 */
    gcPause?: number
    /** GC pause length range, ms, default [200, 3000] */
    gcPauseMs?: [number, number]
    /** Share of lost packets (alive server, answer never arrives), default 0.01 */
    loss?: number
  }
}

export interface TimeoutTradeoffReport {
  n: number
  crashes: number
  /** Declared dead although the server was alive */
  falseAlarms: number
  /** falseAlarms / requests to live servers */
  falseAlarmRate: number
  byCause: { gcPause: number; loss: number; slow: number }
  /** A crash is noticed exactly when the timeout expires: a timeout never misses a crash, it only notices it late */
  detectMs: number
  /** Mean time a user waits per request: the answer time, or the timeout when no answer came */
  meanUserWaitMs: number
}

/**
 * A timeout-based failure detector against hidden faults (crash, GC pause, packet loss), seeded.
 * Short timeouts detect crashes fast but call slow-but-alive servers dead; long ones keep users waiting.
 */
export function timeoutTradeoff(input: TimeoutTradeoffInput): TimeoutTradeoffReport {
  const rng = createRng(Number.isFinite(input.seed) ? (input.seed as number) >>> 0 : 42)
  const timeout = Number.isFinite(input.timeoutMs) && input.timeoutMs > 0 ? input.timeoutMs : 1
  const n = Math.max(0, Math.min(1_000_000, Math.floor(Number.isFinite(input.n) ? (input.n as number) : 1000)))
  const mean = Number.isFinite(input.latencyMs) && (input.latencyMs as number) > 0 ? (input.latencyMs as number) : 100
  const f = input.faults ?? {}
  const p = (v: number | undefined, d: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v as number)) : d)
  const pCrash = p(f.crash, 0.02)
  const pGc = p(f.gcPause, 0.05)
  const pLoss = p(f.loss, 0.01)
  const [g0, g1] = f.gcPauseMs && f.gcPauseMs.every((x) => Number.isFinite(x) && x >= 0) ? f.gcPauseMs : [200, 3000]
  let crashes = 0
  let alive = 0
  const byCause = { gcPause: 0, loss: 0, slow: 0 }
  let waitSum = 0
  for (let i = 0; i < n; i++) {
    // fixed draw order per request: fault type, latency, pause length → same seed, same run
    const u = rng.next()
    const lat = rng.exp(1 / mean)
    const pause = rng.range(Math.min(g0, g1), Math.max(g0, g1))
    if (u < pCrash) {
      crashes++
      waitSum += timeout
      continue
    }
    alive++
    if (u < pCrash + pLoss) {
      byCause.loss++
      waitSum += timeout
      continue
    }
    const gc = u < pCrash + pLoss + pGc
    const answer = lat + (gc ? pause : 0)
    if (answer > timeout) {
      if (gc) byCause.gcPause++
      else byCause.slow++
      waitSum += timeout
    } else waitSum += answer
  }
  const falseAlarms = byCause.gcPause + byCause.loss + byCause.slow
  return {
    n,
    crashes,
    falseAlarms,
    falseAlarmRate: alive ? falseAlarms / alive : 0,
    byCause,
    detectMs: timeout,
    meanUserWaitMs: n ? waitSum / n : 0,
  }
}
