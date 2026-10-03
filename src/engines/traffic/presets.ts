/**
 * Lecture presets: the exact configurations behind incident cards and validated numbers.
 * Every number a lecture prints must be reproducible here with the stated seed (styleGuide: INCIDENT NUMBERS).
 * `expected` holds what the engine produces (checked by traffic.test.ts); UIs may print these values.
 */
import { SERVER_SIZES, defaultRack, podSet, singleServer } from './constants.ts'
import { burst, crashServer, createTraffic, drainServer, mergeConfigInput, runUntil, schedule, setSlow, terminateServer } from './engine.ts'
import { runScenario, type RunAction, type RunReport } from './run.ts'
import type { TrafficConfigInput, TrafficState } from './types.ts'

export interface Scenario {
  id: string
  /** Lecture id, e.g. '05' */
  lecture: string
  /** Croatian title for a card or a „Pokreni scenarij” button */
  title: string
  description: string
  config: TrafficConfigInput
  /** Scripted actions at absolute simulated seconds */
  actions: RunAction[]
  /** Headless measurement window used for `expected` */
  warmupS: number
  measureS: number
  /**
   * Live replays start here (createScenario pre-runs this many simulated seconds synchronously), so the interesting
   * part shows within ~10 s (AUTHORING §5). The run is identical to starting at 0 and waiting.
   */
  prerollS?: number
  /** Values the engine reproduces (rounded as a lecture would print them) */
  expected: Record<string, number | string>
}

const io22 = (lambda: number, extra: TrafficConfigInput = {}): TrafficConfigInput => ({
  seed: 42,
  mode: 'direct',
  servers: singleServer(2, 2),
  workload: 'io',
  lambda,
  ...extra,
})

export const SCENARIOS = {
  /* ---------- L02 ---------- */
  'l02-hook-1158': {
    id: 'l02-hook-1158',
    lecture: '02',
    title: 'Ponedjeljak 11:58',
    description: 'Jedan poslužitelj (2 vCPU, 2 GB), opterećenje I/O, 4 zahtjeva/s, seed 42, 300 s.',
    config: io22(4),
    actions: [],
    warmupS: 10,
    measureS: 300,
    expected: { okRps: 4.0, errPct: 0, p95Ms: 1640, cpuPct: 11 },
  },
  'l02-hook-1200': {
    id: 'l02-hook-1200',
    lecture: '02',
    title: 'Ponedjeljak 12:00',
    description: 'Isti poslužitelj, nalet ×3 = 12 zahtjeva/s: red je pun, svaki drugi zahtjev dobiva 503, a procesor je na 16 %.',
    config: io22(12),
    actions: [],
    warmupS: 10,
    measureS: 300,
    expected: { okRps: 5.67, errPct: 52.4, p95Ms: 3010, cpuPct: 16, share503: 1 },
  },
  'l02-incident': {
    id: 'l02-incident',
    lecture: '02',
    title: 'Nalet u 12:00',
    description: 'I/O, 2 vCPU / 2 GB, λ 4; u 20. sekundi nalet ×3 tijekom 30 s (seed 42). Mjeri se prozor naleta.',
    config: io22(4),
    actions: [{ atS: 20, label: 'Nalet u 12:00', run: (s) => burst(s, 3, 30_000) }],
    warmupS: 20,
    measureS: 30,
    prerollS: 15,
    expected: { errPct: 51.3, p95Ms: 3000, cpuPct: 17 },
  },
  'l02-ram-io-2gb': {
    id: 'l02-ram-io-2gb',
    lecture: '02',
    title: 'Jezgre ili RAM? 2 GB',
    description: '2 vCPU / 2 GB, I/O, λ 30: 6 radnika – oko 5,7 odgovora/s uz procesor na ~16 %.',
    config: { seed: 42, mode: 'direct', servers: singleServer(2, 2), workload: 'io', lambda: 30 },
    actions: [],
    warmupS: 10,
    measureS: 120,
    expected: { okRps: 5.7, cpuPct: 16 },
  },
  'l02-ram-io-4gb': {
    id: 'l02-ram-io-4gb',
    lecture: '02',
    title: 'Jezgre ili RAM? 4 GB',
    description: '2 vCPU / 4 GB, I/O, λ 30: 14 radnika – oko 13 odgovora/s.',
    config: { seed: 42, mode: 'direct', servers: singleServer(2, 4), workload: 'io', lambda: 30 },
    actions: [],
    warmupS: 10,
    measureS: 120,
    expected: { okRps: 13.3 },
  },
  'l02-ram-io-8gb': {
    id: 'l02-ram-io-8gb',
    lecture: '02',
    title: 'Jezgre ili RAM? 8 GB',
    description: '2 vCPU / 8 GB, I/O, λ 30: 30 radnika – oko 27 odgovora/s.',
    config: { seed: 42, mode: 'direct', servers: singleServer(2, 8), workload: 'io', lambda: 30 },
    actions: [],
    warmupS: 10,
    measureS: 120,
    expected: { okRps: 26.9 },
  },
  'l02-unbounded': {
    id: 'l02-unbounded',
    lecture: '02',
    title: 'Neograničeni radnici',
    description: '1 vCPU / 2 GB, API, λ 4, radnici nisu ograničeni RAM-om: OOM, ponovno pokretanje (6 s + 3 s), opet OOM.',
    config: { seed: 42, mode: 'direct', servers: singleServer(1, 2), workload: 'api', lambda: 4, unboundedWorkers: true },
    actions: [],
    warmupS: 10,
    measureS: 120,
    expected: { ooms: 9, okRps: 0.76, boundedOkRps: 3.92 },
  },
  'l02-bufferbloat': {
    id: 'l02-bufferbloat',
    lecture: '02',
    title: 'Predugačak red',
    description: 'I/O, 2 vCPU / 2 GB, red od 30 mjesta, λ 12: svi čekaju gotovo 5 s i odustaju – propusnost pada gotovo na nulu.',
    config: io22(12, { queueMax: 30 }),
    actions: [],
    warmupS: 10,
    measureS: 120,
    expected: { okRpsBelow: 0.2 },
  },

  /* ---------- L04 ---------- */
  'l04-incident': {
    id: 'l04-incident',
    lecture: '04',
    title: '12:00, kružno raspoređivanje',
    description: 'Mali, srednji i veliki poslužitelj, kružno, API, 15 zahtjeva/s, seed 42, 300 s: mali na granici, veliki dokoličari.',
    config: { seed: 42, mode: 'lb', servers: defaultRack(), workload: 'api', lambda: 15, algo: 'rr' },
    actions: [],
    warmupS: 10,
    measureS: 300,
    expected: { errPct: 2.8, p95Ms: 3240, cpuS1Pct: 98, cpuS3Pct: 25, wrrErrPct: 0, wrrP95Ms: 980, lcErrPct: 0, lcP95Ms: 1230 },
  },
  'l04-mixed-io': {
    id: 'l04-mixed-io',
    lecture: '04',
    title: 'Različiti poslužitelji, I/O',
    description: 'A = 4 vCPU / 2 GB, B = 1 vCPU / 8 GB, I/O, λ 15: A je pun uz 8 % procesora.',
    config: {
      seed: 42,
      mode: 'lb',
      servers: [
        { id: 'a', name: 'A', vcpu: 4, ramGB: 2, weight: 1 },
        { id: 'b', name: 'B', vcpu: 1, ramGB: 8, weight: 1 },
      ],
      workload: 'io',
      lambda: 15,
      algo: 'rr',
    },
    actions: [],
    warmupS: 10,
    measureS: 300,
    expected: { rrErrPct: 11.8, lcErrPct: 0.4, cpuAPct: 8 },
  },
  'l04-slow-disk': {
    id: 'l04-slow-disk',
    lecture: '04',
    title: 'Sporiji procesor na velikom poslužitelju',
    description:
      'Zadani poslužitelji, API, λ 15; u 10. sekundi procesor velikog poslužitelja postaje 3× sporiji (npr. bučni susjed). Težinsko kružno mu i dalje šalje 4/7 prometa. (Id ostaje „slow-disk” radi kompatibilnosti; model je usporen procesor, ne disk.)',
    config: { seed: 42, mode: 'lb', servers: defaultRack(), workload: 'api', lambda: 15, algo: 'wrr' },
    actions: [{ atS: 10, label: 'Sporiji procesor', run: (s) => setSlow(s, 's3', 3) }],
    warmupS: 10,
    measureS: 120,
    expected: { errPct: 27.1, lcErrPct: 0.1, s3Share: 0.57 },
  },

  /* ---------- L05 ---------- */
  'l05-incident': {
    id: 'l05-incident',
    lecture: '05',
    title: '12:03, pad procesa na S3',
    description:
      'Najmanje veza, API, λ 15, seed 42; proces na S3 (veliki) pada u 60. sekundi. Provjere svake 2 s (sim), 2 neuspjele → izbačen; ovdje sve provjere kreću u istom trenutku (nisu raspoređene, kao u validiranom prototipu). Do otkrivanja propada 37 narudžbi (kružno: 11).',
    config: {
      seed: 42,
      mode: 'lb',
      servers: defaultRack(),
      workload: 'api',
      lambda: 15,
      algo: 'lc',
      healthCheck: { stagger: false },
      lifecycle: { autoRestart: false },
    },
    actions: [{ atS: 60, label: 'Sruši proces na S3', run: (s) => crashServer(s, 's3', { autoRestart: false }) }],
    warmupS: 10,
    measureS: 120,
    prerollS: 55,
    expected: { failedBeforeDetection: 37, rrFailedBeforeDetection: 11, detectionMs: 2000 },
  },
  'l05-drain': {
    id: 'l05-drain',
    lecture: '05',
    title: 'Isprazni S2',
    description: 'Težinsko kružno, API, λ 10; S2 se prazni u 30. sekundi: nijedna narudžba ne propada.',
    config: { seed: 42, mode: 'lb', servers: defaultRack(), workload: 'api', lambda: 10, algo: 'wrr' },
    actions: [{ atS: 30, label: 'Isprazni S2', run: (s) => drainServer(s, 's2') }],
    warmupS: 10,
    measureS: 60,
    prerollS: 25,
    expected: { failed: 0 },
  },
  'l05-sessions-local': {
    id: 'l05-sessions-local',
    lecture: '05',
    title: 'Košarica u memoriji poslužitelja',
    description: '20 korisnika, sesije lokalno, bez afiniteta, težinsko kružno, λ 10: gotovo svaki zahtjev završi na drugom poslužitelju.',
    config: { seed: 42, mode: 'lb', servers: defaultRack(), workload: 'api', lambda: 10, algo: 'wrr', sessions: { enabled: true, store: 'local', affinity: 'none' } },
    actions: [],
    warmupS: 10,
    measureS: 60,
    expected: { sessionLost: 343, ok: 599, cookieSessionLost: 0, redisSessionLost: 0 },
  },

  /* ---------- L14 ---------- */
  'l14-rack': {
    id: 'l14-rack',
    lecture: '14',
    title: 'L04 poslužitelji iza Kubernetes Servicea',
    description: 'Nasumičan spreman Pod po vezi, bez težina: ponaša se kao nasumično raspoređivanje (≈ kružno), λ 15 → ≈2,8 % grešaka.',
    config: { seed: 42, mode: 'service', servers: defaultRack(), workload: 'api', lambda: 15 },
    actions: [],
    warmupS: 10,
    measureS: 300,
    expected: { errPct: 2.8 },
  },
  'l14-keepalive': {
    id: 'l14-keepalive',
    lecture: '14',
    title: 'Jedna dugotrajna veza',
    description: 'klopa-web s jednom keep-alive vezom prema 4 Poda: sav promet ide jednom Podu.',
    config: { seed: 42, mode: 'service', servers: podSet(4, SERVER_SIZES.mali.vcpu, SERVER_SIZES.mali.ramGB), workload: 'api', lambda: 4, clients: { count: 1, mode: 'keepAlive' } },
    actions: [],
    warmupS: 10,
    measureS: 60,
    expected: { maxShare: 1 },
  },
  'l14-shutdown': {
    id: 'l14-shutdown',
    lecture: '14',
    title: 'Gašenje Poda bez preStop',
    description:
      '4 Poda (2 vCPU / 4 GB), λ 12, aplikacija odmah izlazi na SIGTERM; Pod se briše u 20. sekundi, a kube-proxy ga uklanja tek nakon 1 s: 10 zahtjeva dobiva odbijenu ili prekinutu vezu. Uredno gašenje bez preStop: 4. preStop sleep 5: 0.',
    config: {
      seed: 42,
      mode: 'service',
      servers: podSet(4, SERVER_SIZES.srednji.vcpu, SERVER_SIZES.srednji.ramGB),
      workload: 'api',
      lambda: 12,
      service: { sigterm: 'immediate', preStopSleepS: 0 },
    },
    actions: [{ atS: 20, label: 'Obriši Pod', run: (s) => terminateServer(s, 'pod1') }],
    warmupS: 10,
    measureS: 40,
    prerollS: 15,
    expected: { droppedRefused: 10, gracefulDroppedRefused: 4, preStopDroppedRefused: 0 },
  },
} satisfies Record<string, Scenario>

export type ScenarioId = keyof typeof SCENARIOS

/**
 * Live replay: a fresh state with the scenario's actions scheduled (for „Ponovi incident” buttons).
 * Overrides are deep-merged (an override of healthCheck.intervalMs keeps the preset's stagger: false).
 * opts.prerollS (default: the scenario's prerollS, else 0) runs that many simulated seconds synchronously,
 * so the incident happens a few seconds after the replay starts; the run is the same as waiting.
 */
export function createScenario(id: ScenarioId, overrides: TrafficConfigInput = {}, opts: { prerollS?: number } = {}): TrafficState {
  const sc: Scenario = SCENARIOS[id]
  const s = createTraffic(mergeConfigInput(sc.config, overrides))
  for (const a of sc.actions) schedule(s, a.atS * 1000, a.run, a.label)
  const pre = opts.prerollS ?? sc.prerollS ?? 0
  if (Number.isFinite(pre) && pre > 0) runUntil(s, Math.min(pre, 3600) * 1000)
  return s
}

/** Headless run of a scenario's measurement window (overrides deep-merged). */
export function runPreset(id: ScenarioId, overrides: TrafficConfigInput = {}): RunReport {
  const sc: Scenario = SCENARIOS[id]
  return runScenario({ config: mergeConfigInput(sc.config, overrides), actions: sc.actions, warmupS: sc.warmupS, measureS: sc.measureS })
}
