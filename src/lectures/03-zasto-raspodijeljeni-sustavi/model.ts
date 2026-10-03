/**
 * L03 „Zašto raspodijeljeni sustavi” — thin adapters over the shared E1 engine (src/engines/traffic).
 * Every number the lecture prints comes from the engine: the „godina u 10 sekundi” (availability.ts), the formulas
 * (formulas.ts), the timeout detector (timeoutTradeoff) and the DNS cliffhanger (runScenario in dns mode).
 * This file only adds lecture glue: presets, illustrative prices, a 100-year average, a histogram derived from
 * timeoutTradeoff and the „Kvar ormara u podne” scheduling. Pure TypeScript (no React), runs under Node type stripping.
 */
import {
  HOURS_PER_YEAR,
  SERVER_SIZES,
  YEAR_CAUSE_LABEL,
  badConfig,
  availabilityFromMtbf,
  createYear,
  downtime,
  finishYear,
  formulaAvailability,
  hourLabel,
  monthlyPriceEur,
  parallelAvailability,
  rackFailure,
  resolveYearConfig,
  runScenario,
  runYear,
  stepYear,
  timeoutTradeoff,
  yearReport,
  type TimeoutTradeoffReport,
  type YearCause,
  type YearReport,
  type YearState,
} from '../../engines/traffic/index.ts'
import { plural } from '../../kit/sim/math.ts'

/* =====================================================================
   Formatting (Croatian decimals, enough nines to tell values apart)
   ===================================================================== */

const nf = (v: number, max: number, min = 0) => v.toLocaleString('hr-HR', { minimumFractionDigits: min, maximumFractionDigits: max })

/** Decimals pctA picks for a value on its own: enough to show every nine (0.9988 → 2, 0.99988 → 3). */
export function pctDigits(a: number): number {
  if (!Number.isFinite(a) || a >= 1 || a <= 0) return 2
  return Math.min(6, Math.max(2, Math.ceil(-Math.log10(1 - a)) - 1))
}

/**
 * 0.9988 → „99,88 %”, 0.999999 → „99,9999 %”, 0.9801 → „98,01 %” (rounded half-up, never up to „100 %”).
 * `digits` fixes the decimals, so values compared side by side share one precision (see pctDigits).
 */
export function pctA(a: number, digits?: number): string {
  if (!Number.isFinite(a)) return '–'
  if (a >= 1) return '100 %'
  if (a <= 0) return '0 %'
  const d = digits ?? pctDigits(a)
  const k = 10 ** d
  let p = Math.round(a * 100 * k) / k
  if (p >= 100) p = Math.floor(a * 100 * k) / k
  return `${nf(p, d, digits === undefined ? 0 : d)} %`
}

/** Hours → „87,6 h” / „53 min” / „26 s”. */
export function fmtHours(h: number): string {
  if (!Number.isFinite(h)) return '–'
  if (h >= 100) return `${nf(h, 0)} h`
  if (h >= 1) return `${nf(h, 1)} h`
  const min = h * 60
  if (min >= 1) return `${nf(min, min >= 10 ? 0 : 1)} min`
  const s = min * 60
  return `${nf(s, 0)} s`
}

export const fmtEur = (v: number) => `${nf(v, v % 1 ? 1 : 0)} €`
export const num = (v: number, d = 0) => nf(v, d)

/* =====================================================================
   „Arhitekt dostupnosti”: the architecture, presets and (illustrative) prices
   ===================================================================== */

/** Availability steps of every slider (90 % … 99,99 %). */
export const AVAIL_STEPS = [0.9, 0.95, 0.99, 0.995, 0.999, 0.9995, 0.9999] as const
/** Illustrative price multiplier per step: every extra nine costs more (a better machine, a replica, a contract). */
const PRICE_FACTOR = [0.5, 0.75, 1, 1.5, 2, 3, 4] as const
export const DETECTION_STEPS = [0, 1, 2, 5, 10, 15, 30] as const
export const MTTR_STEPS = [1, 2, 4, 8] as const
export const BUDGET_EUR = 120
/** Seed of every preset: the numbers on the incident card come from this year. */
export const YEAR_SEED = 320

export interface Architecture {
  entry: number
  appCount: number
  app: number
  /** Share of the lunch peak one app server carries (0.7 = 70 %) */
  capacity: number
  db: number
  sameRack: boolean
  detectionMin: number
  mttrH: number
  seed: number
}

export type PresetId = 'jedan' | 'dva'

export const PRESETS: Record<PresetId, { label: string; title: string; arch: Architecture }> = {
  jedan: {
    label: 'Jedan poslužitelj',
    title: 'Klopa u petak: samo Veliki (nosi oko 130 % vršnog prometa), popravak traje 2 h',
    arch: { entry: 0.9999, appCount: 1, app: 0.99, capacity: 1.3, db: 0.999, sameRack: false, detectionMin: 1, mttrH: 2, seed: YEAR_SEED },
  },
  dva: {
    label: 'Dva poslužitelja',
    title: 'Polazište iz zadatka: dva poslužitelja od 99 %, svaki nosi 70 % vršnog prometa; baza 99,9 %',
    arch: { entry: 0.9999, appCount: 2, app: 0.99, capacity: 0.7, db: 0.999, sameRack: false, detectionMin: 1, mttrH: 4, seed: YEAR_SEED },
  },
}

export function stepIndex(a: number): number {
  let best = 0
  AVAIL_STEPS.forEach((s, i) => {
    if (Math.abs(s - a) < Math.abs(AVAIL_STEPS[best] - a)) best = i
  })
  return best
}

/** A Srednji (2 vCPU · 4 GB) carries ≈ 70 % of the lunch peak; the engine prices it at 18 €/mj. */
const APP_BASE_EUR = monthlyPriceEur(SERVER_SIZES.srednji.vcpu, SERVER_SIZES.srednji.ramGB)
/** The engine's default database (36 €/mj) is the 99,9 % step (×2), so the 99 % base is 18 €. */
const DB_BASE_EUR = monthlyPriceEur(SERVER_SIZES.veliki.vcpu, SERVER_SIZES.veliki.ramGB) / 2
/** The engine's entry (10 €/mj) is the 99,99 % step (×4). */
const ENTRY_BASE_EUR = 2.5

export interface Costs {
  entryEur: number
  appServerEur: number
  dbEur: number
  total: number
}

/** Illustrative monthly prices: linear in capacity, ×factor per availability step. Defaults reproduce the engine's 82 €. */
export function costsOf(a: Architecture): Costs {
  const f = (x: number) => PRICE_FACTOR[stepIndex(x)]
  const entryEur = ENTRY_BASE_EUR * f(a.entry)
  const appServerEur = APP_BASE_EUR * (a.capacity / 0.7) * f(a.app)
  const dbEur = DB_BASE_EUR * f(a.db)
  return { entryEur, appServerEur, dbEur, total: entryEur + a.appCount * appServerEur + dbEur }
}

export function toYearInput(a: Architecture) {
  const c = costsOf(a)
  return {
    seed: a.seed,
    entry: a.entry,
    app: { count: a.appCount, availability: a.app, capacityShare: a.capacity },
    db: a.db,
    sameRack: a.sameRack,
    detectionMin: a.detectionMin,
    mttrH: a.mttrH,
    costs: { entryEur: c.entryEur, appServerEur: c.appServerEur, dbEur: c.dbEur },
  }
}

export interface Formulas {
  /** entry × parallel app tier × db (independent failures, instant failover, enough capacity) */
  naive: number
  /** … × the shared rack when „Isti ormar” is on */
  rackAware: number
  appTier: number
  rack: number
}

export function formulasOf(a: Architecture): Formulas {
  const cfg = resolveYearConfig(toYearInput(a))
  return {
    naive: formulaAvailability(cfg, { naive: true }),
    rackAware: formulaAvailability(cfg),
    appTier: parallelAvailability(Array.from({ length: a.appCount }, () => a.app)),
    rack: cfg.rackAvailability,
  }
}

/** Survivor load after one app-server failure (1.43 = 143 %); Infinity with a single server. */
export const survivorLoad = (a: Architecture) => (a.appCount > 1 ? 1 / ((a.appCount - 1) * a.capacity) : Infinity)

export interface YearAverage {
  years: number
  availability: number
  downtimeH: number
  lunchesLost: number
}

const avgCache = new Map<string, YearAverage>()

/** Mean of 100 seeded years (seeds 9001…9100): what the architecture gives „on average”, N+1 and detection included. */
export function averageYears(a: Architecture, years = 100): YearAverage {
  const key = JSON.stringify({ ...a, seed: 0, years })
  const hit = avgCache.get(key)
  if (hit) return hit
  let av = 0
  let dt = 0
  let ll = 0
  for (let i = 0; i < years; i++) {
    const r = runYear({ ...toYearInput(a), seed: 9001 + i })
    av += r.availability
    dt += r.downtimeH
    ll += r.lunchesLost
  }
  const out = { years, availability: av / years, downtimeH: dt / years, lunchesLost: ll / years }
  if (avgCache.size > 300) avgCache.clear()
  avgCache.set(key, out)
  return out
}

/** The incident card's numbers: preset „Jedan poslužitelj”, seed 320, one whole year. */
export function incidentYear(): YearReport {
  return runYear(toYearInput(PRESETS.jedan.arch))
}

/** One server alone for a whole seeded year (entry and database perfect): the MTBF/MTTR explainer's strip. */
export function oneServerYear(mtbfH: number, mttrH: number, seed = 7) {
  const A = availabilityFromMtbf(mtbfH, mttrH)
  const y = finishYear(createYear({ seed, entry: 1, db: 1, app: { count: 1, availability: A, capacityShare: 1 }, mttrH, detectionMin: 0 }))
  return { A, failures: y.app[0].failures, downtimeH: y.downH, outages: y.outages, formulaDownH: downtime(A).perYearH }
}

/* ---------- the live year (UI state for useSimulation) ---------- */

export type LogTone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral'

export interface LogEvent {
  id: string
  t: number
  text: string
  tone: LogTone
}

export interface ArchSim {
  arch: Architecture
  year: YearState
  /** „Kvar ormara u podne” waits for the next weekday 12:00 */
  rackPending: boolean
  rackWatch: { fromH: number; untilH: number; base: number } | null
  rackResult: 'survived' | 'failed' | null
  doneLogged: boolean
  events: LogEvent[]
  eventId: number
  achieved: { budget: boolean; db: boolean; rack: boolean }
}

export function createArchSim(a: Architecture, achieved = { budget: false, db: false, rack: false }): ArchSim {
  return {
    arch: a,
    year: createYear(toYearInput(a)),
    rackPending: false,
    rackWatch: null,
    rackResult: null,
    doneLogged: false,
    events: [],
    eventId: 1,
    achieved: { ...achieved },
  }
}

export function logArch(s: ArchSim, text: string, tone: LogTone) {
  s.events.push({ id: `m${s.eventId++}`, t: Math.round((s.year.hour / s.year.cfg.hoursPerSecond) * 10) / 10, text, tone })
  while (s.events.length > 20) s.events.shift()
}

/** Engine events and the lecture's own notes, oldest first (the EventLog shows the newest on top). */
export function mergedEvents(s: ArchSim): LogEvent[] {
  const eng = s.year.events.slice(-20).map((e) => ({ id: `e${e.id}`, t: e.t, text: e.text, tone: e.tone as LogTone }))
  return [...eng, ...s.events].sort((x, y) => x.t - y.t || (x.id < y.id ? -1 : 1))
}

const isLunchStart = (h: number, startH: number) => Math.floor(h / 24) % 7 < 5 && h % 24 === startH

function nextLunch(fromH: number, startH: number): number {
  for (let h = fromH; h < HOURS_PER_YEAR; h++) if (isLunchStart(h, startH)) return h
  return -1
}

const lossOf = (y: YearState) => y.downByCause.app + y.downByCause.rack + y.downByCause.capacity + y.downByCause.config

function triggerRack(s: ArchSim) {
  const y = s.year
  s.rackPending = false
  rackFailure(y)
  s.rackWatch = { fromH: y.hour, untilH: y.hour + y.cfg.mttrH, base: lossOf(y) }
  // the engine's forced rack failure skips the failover window that random failures pay, so say so
  logArch(s, `${hourLabel(y.hour)}: kvar ormara usred ručka${y.cfg.sameRack ? ' – svi poslužitelji su u istom ormaru!' : ' (preuzimanje rada ovdje je trenutačno).'}`, 'bad')
}

/** „Kvar ormara u podne”: arm the failure for the next weekday 12:00 (it fires exactly then). */
export function armRackFailure(s: ArchSim) {
  if (s.year.done) return
  s.rackPending = true
  const h = nextLunch(s.year.hour, s.year.cfg.lunch.startH)
  logArch(s, h >= 0 ? `Kvar ormara zakazan za ${hourLabel(h)} (prvo sljedeće podne).` : 'U ovoj godini više nema podneva.', 'warn')
  if (h < 0) s.rackPending = false
}

export function breakConfig(s: ArchSim) {
  if (s.year.done) return
  badConfig(s.year)
}

/** One sim step: advance the year, fire a pending rack failure at exactly 12:00, judge the watch window, wrap up. */
export function stepArch(s: ArchSim, dt: number) {
  const y = s.year
  if (!y.done) {
    let rest = dt
    if (s.rackPending) {
      const target = nextLunch(y.hour, y.cfg.lunch.startH)
      if (target < 0) s.rackPending = false
      else {
        const hps = y.cfg.hoursPerSecond
        const toGo = target - y.hour
        if (toGo === 0) triggerRack(s)
        else if (y.acc + rest * hps >= toGo) {
          const dt1 = (toGo - y.acc) / hps + 1e-7
          stepYear(y, dt1)
          rest = Math.max(0, rest - dt1)
          triggerRack(s)
        }
      }
    }
    stepYear(y, rest)
  }
  if (s.rackWatch && (y.hour >= s.rackWatch.untilH || y.done)) {
    const lost = lossOf(y) - s.rackWatch.base
    s.rackResult = lost > 0 ? 'failed' : 'survived'
    if (lost > 0) logArch(s, `Kvar ormara: Klopa je stajala ${fmtHours(lost)}${y.cfg.sameRack ? ' (isti ormar – svi su pali zajedno)' : ' (preživjeli nisu imali dovoljno kapaciteta)'}.`, 'bad')
    else {
      logArch(s, 'Kvar ormara: Klopa je radila dalje – preživjeli su nosili cijeli ručak.', 'ok')
      s.achieved.rack = true
    }
    s.rackWatch = null
  }
  if (y.done && !s.doneLogged) {
    s.doneLogged = true
    const r = yearReport(y)
    logArch(s, `Godina je gotova: ${pctA(r.availability)}, ${fmtHours(r.downtimeH)} nedostupno, ${plural(r.lunchesLost, ['izgubljen ručak', 'izgubljena ručka', 'izgubljenih ručkova'])}.`, r.availability >= 0.999 ? 'ok' : r.availability >= 0.995 ? 'warn' : 'bad')
    const avg = averageYears(s.arch)
    const cost = costsOf(s.arch).total
    if (avg.availability >= 0.999 && cost <= BUDGET_EUR) {
      if (!s.achieved.budget) logArch(s, `Prosjek 100 godina: ${pctA(avg.availability)} za ${fmtEur(cost)} mjesečno – cilj je postignut.`, 'ok')
      s.achieved.budget = true
    }
    if (s.arch.db <= 0.999 && s.arch.appCount >= 4) {
      if (!s.achieved.db) {
        // one seeded year (and even the 100-year sample) can be lucky; the expected chain is always below the database
        const below = avg.availability < s.arch.db
        logArch(
          s,
          `Prosjek 100 godina: ${pctA(avg.availability, 3)} – ${below ? `baza od ${pctA(s.arch.db)} drži lanac ispod sebe (pojedina godina može imati sreće).` : `tek uzorak sa srećom; očekivano je lanac ispod baze od ${pctA(s.arch.db)} (formula: ${pctA(formulasOf(s.arch).rackAware, 3)}).`}`,
          'info',
        )
      }
      s.achieved.db = true
    }
  }
}

/** Per-day view of the year for the calendar: hours down, lunch lost (same rule as the engine). */
export function dayView(y: YearState, d: number): { down: number; lunchLost: boolean; done: boolean } {
  const h0 = d * 24
  const done = y.hour >= h0 + 24
  let down = 0
  for (let h = h0; h < Math.min(h0 + 24, y.hour); h++) down += y.hourly[h]
  const weekday = d % 7 < 5
  const { startH, endH } = y.cfg.lunch
  let lunchLost = false
  if (weekday && y.hour >= h0 + endH) for (let h = h0 + startH; h < h0 + endH; h++) if (y.hourly[h] > 0) lunchLost = true
  return { down, lunchLost, done }
}

export const CAUSE_ORDER: YearCause[] = ['db', 'entry', 'app', 'rack', 'config', 'capacity', 'detection']
/**
 * Klopa has no load balancer yet, so the entry is DNS and the provider's network. The engine counts every failover
 * window as a full outage (in reality only the dead server's share of traffic fails), so that label says „pesimistično”.
 */
export const CAUSE_LABEL: Record<YearCause, string> = {
  ...YEAR_CAUSE_LABEL,
  entry: 'ulaz (DNS i mreža pružatelja)',
  app: 'svi poslužitelji odjednom',
  capacity: 'premalo kapaciteta u podne (N+1)',
  detection: 'preuzimanje rada (pesimistično)',
}

export { hourLabel, yearReport, HOURS_PER_YEAR }
export type { YearReport, YearCause }

/* =====================================================================
   „Spor ili mrtav?”: the timeout detector (engine) and a histogram derived from it
   ===================================================================== */

export const TIMEOUT_STEPS = [50, 100, 150, 200, 300, 500, 700, 1000, 1500, 2000, 3000, 5000] as const

/** Bin edges for answer times, log-spaced 10 ms … 10 s (4 per decade). */
export const HIST_EDGES = [10, 17.8, 31.6, 56.2, 100, 178, 316, 562, 1000, 1778, 3162, 5623, 10000]

export interface TimeoutHistogram {
  bins: { lo: number; hi: number; healthy: number; gc: number }[]
  /** answered faster than the first edge */
  under: { healthy: number; gc: number }
  crashes: number
  lost: number
  n: number
}

let histCache: TimeoutHistogram | null = null

/**
 * Answer-time histogram of the engine's 1000 seeded requests, read off timeoutTradeoff itself: the number of answers
 * slower than T is exactly the engine's false alarms by cause at timeout T, so the bin (a, b] holds S(a) − S(b).
 */
export function timeoutHistogram(): TimeoutHistogram {
  if (histCache) return histCache
  const at = HIST_EDGES.map((t) => timeoutTradeoff({ timeoutMs: t }))
  const first = at[0]
  const alive = first.n - first.crashes
  const lost = first.byCause.loss
  const bins = HIST_EDGES.slice(0, -1).map((lo, i) => ({
    lo,
    hi: HIST_EDGES[i + 1],
    healthy: at[i].byCause.slow - at[i + 1].byCause.slow,
    gc: at[i].byCause.gcPause - at[i + 1].byCause.gcPause,
  }))
  const slowerThanFirst = first.byCause.slow + first.byCause.gcPause
  const gcAll = timeoutTradeoff({ timeoutMs: 1e-6 }).byCause.gcPause
  const under = { healthy: alive - lost - slowerThanFirst - (gcAll - first.byCause.gcPause), gc: gcAll - first.byCause.gcPause }
  histCache = { bins, under, crashes: first.crashes, lost, n: first.n }
  return histCache
}

const tradeCache = new Map<number, TimeoutTradeoffReport>()
export function tradeoffAt(timeoutMs: number): TimeoutTradeoffReport {
  let r = tradeCache.get(timeoutMs)
  if (!r) {
    r = timeoutTradeoff({ timeoutMs })
    tradeCache.set(timeoutMs, r)
  }
  return r
}

/* =====================================================================
   Cliffhanger: the second server is not in DNS yet (engine, dns mode, API workload, λ 12, seed 42)
   ===================================================================== */

export interface DnsNumbers {
  lambda: number
  before: { veliki: number; srednji: number }
}

let dnsCache: DnsNumbers | null = null

export function dnsNumbers(): DnsNumbers {
  if (dnsCache) return dnsCache
  const lambda = 12
  const veliki = { id: 's1', name: 'Veliki', ...SERVER_SIZES.veliki }
  const srednji = { id: 's2', name: 'Srednji', ...SERVER_SIZES.srednji }
  const base = { seed: 42, mode: 'dns' as const, workload: 'api' as const, lambda }
  const b = runScenario({ config: { ...base, servers: [veliki, { ...srednji, inDns: false }] }, warmupS: 10, measureS: 60 })
  dnsCache = { lambda, before: { veliki: b.servers[0].cpu, srednji: b.servers[1].cpu } }
  return dnsCache
}

/* =====================================================================
   Formulas used by the explainers (engine formulas.ts, re-exported so the sims import one module)
   ===================================================================== */

export { seriesAvailability, parallelAvailability, probAnyDown, downtime, amdahl, amdahlMax, usl, uslPeak, sharedBottleneck, mtbfFor } from '../../engines/traffic/index.ts'
