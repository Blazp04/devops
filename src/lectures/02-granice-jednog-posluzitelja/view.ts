/**
 * What the server stage draws (StageView) — a plain description, so the step-by-step explainer and the live
 * simulation share one drawing. lunchView() reads it from the E1 engine state; the explainer writes it by hand.
 */
import { WORKLOADS, capacityOf, flightProgress, metrics, serverView } from '../../engines/traffic'
import { fmt, pointAt, type BubbleTone, type ServerMood } from '../../kit'
import type { StageGeo } from './geometry'
import { burstLeftS, priceOf, fmtEur, residentRamMB, type LunchState } from './model'

/** One radnik slot: free plate, food + working the CPU, food + waiting for the database, or a radnik beyond the RAM. */
export type PlateState = 'free' | 'cpu' | 'io' | 'over'

export interface TrayDraw {
  key: number
  x: number
  y: number
  /** go = request on its way · back = answer (✓) · fail = fell at the door (✗) · late = gave up (✗) */
  kind: 'go' | 'back' | 'fail' | 'late'
  rot: number
}

export interface StageView {
  offered: number
  /** red handwritten note under the traffic, e.g. „nalet ×3 · još 12 s” */
  burstNote: string | null
  students: number
  tap: boolean
  name: string
  spec: string
  /** busy 0..1 per core (one brain each) */
  cores: number[]
  plates: PlateState[]
  /** „6/6” */
  workers: string
  queue: number
  queueMax: number
  mood: ServerMood
  stamp: string | null
  footer: string
  footerBad: boolean
  dbWaiting: number
  trays: TrayDraw[]
  /** handwritten word next to fallen trays: „503”, „odbijeno” */
  fallLabel: string | null
  parked: number
  davor: { lines: string[]; tone: BubbleTone; buzz: boolean } | null
  /** the machine is off (plug pulled, resizing): drawing faded */
  dim: boolean
}

export function studentsFor(offered: number, max: number): number {
  return Math.max(1, Math.min(max, Math.round(1 + offered / 3)))
}

const FALL_MS = 900

export function lunchView(w: LunchState, geo: StageGeo): StageView {
  const s = w.s
  const v = s.servers[0]
  const sv = serverView(s, v)
  const m = metrics(s)
  const wl = WORKLOADS[s.cfg.workload]
  const cap = capacityOf(v.vcpu, v.ramGB, wl).cap
  const up = v.proc === 'up' || v.proc === 'hung'

  // radnici: working the CPU first, then waiting for Postgres, then free plates; beyond the RAM-bound pool = 'over'
  let cpu = 0
  let io = 0
  for (const r of v.inflight) {
    if (r.cpuLeft > 0) cpu++
    else io++
  }
  const boundW = capacityOf(v.vcpu, v.ramGB, wl).W
  const plates: PlateState[] = []
  for (let i = 0; i < sv.slots; i++) {
    const st: PlateState = i < cpu ? 'cpu' : i < cpu + io ? 'io' : 'free'
    plates.push(sv.unbounded && i >= boundW && st !== 'free' ? 'over' : st)
  }

  // errors of the last 1,5 s drive the face and Davor
  let e503 = 0
  let eLate = 0
  let eRefused = 0
  for (const e of s.errs) {
    if (e.t < s.t - 1500) continue
    if (e.code === 503) e503++
    else if (e.code === 504) eLate++
    else eRefused++
  }

  // a machine that is down has X eyes (crashed process or pulled plug); resizing / booting is not calm either
  let mood: ServerMood = 'calm'
  if (v.proc === 'crashed' || (v.proc === 'off' && !w.resizing)) mood = 'dead'
  else if (!up) mood = 'busy'
  else if (e503 > 0 || sv.queue >= sv.queueMax) mood = 'panic'
  else if (up && (sv.busy >= Math.min(sv.slots, boundW) || sv.cpuSmooth >= 0.7)) mood = 'busy'

  let stamp: string | null = null
  if (v.proc === 'crashed') stamp = v.ooms > 0 && s.t - v.crashedAt < 7000 ? 'OOM · SRUŠEN' : 'SRUŠEN'
  else if (v.proc === 'off') stamp = w.resizing ? 'MIJENJA VELIČINU' : 'ISKLJUČEN'
  else if (v.proc === 'booting') stamp = 'POKREĆE SE'
  else if (v.proc === 'starting') stamp = 'ZAGRIJAVA SE'

  // trays: the engine's flight dots, in one pooled layer
  const trays: TrayDraw[] = []
  let fallLabel: string | null = null
  for (const f of s.flights) {
    const p = flightProgress(s, f)
    if (p < 0) continue
    const failed = f.outcome !== 'ok' && f.outcome !== 'waiting'
    if (f.dir === 'in') {
      if (p <= 1) {
        const [x, y] = pointAt(geo.inPath, p)
        trays.push({ key: f.id, x, y, kind: 'go', rot: 0 })
      } else if (failed && (p - 1) * f.durationMs <= FALL_MS) {
        const j = f.id % 5
        const drop = Math.min(1, ((p - 1) * f.durationMs) / 300)
        trays.push({ key: f.id, x: geo.fall[0] - j * 5, y: geo.fall[1] - 14 + drop * 14 - j * 2, kind: 'fail', rot: 28 + j * 9 })
        fallLabel = f.outcome === 503 ? '503' : 'odbijeno'
      }
    } else if (p <= 1) {
      const [x, y] = pointAt(geo.outPath, p)
      trays.push({ key: f.id, x, y, kind: failed ? 'late' : 'back', rot: 0 })
    }
  }

  let davor: StageView['davor'] = null
  const cpuPct = fmt.pct(sv.cpuSmooth)
  if (!w.plugged) davor = { lines: ['Sve je stalo!'], tone: 'red', buzz: true }
  else if (w.resizing) davor = { lines: ['Mijenjamo', 'veličinu…'], tone: 'ink', buzz: false }
  else if (v.proc === 'crashed' && v.ooms > 0) davor = { lines: ['OOM! Proces', 'je pao.'], tone: 'red', buzz: true }
  else if (v.proc !== 'up') davor = { lines: ['Diže se…'], tone: 'ink', buzz: eRefused > 0 }
  else if (e503 > 0)
    davor = sv.cpuSmooth < 0.5 ? { lines: ['503! A CPU', `je na ${cpuPct}?!`], tone: 'red', buzz: true } : { lines: ['503! Procesor', `je na ${cpuPct}.`], tone: 'red', buzz: true }
  else if (eLate > 0) davor = { lines: ['Studenti', 'odustaju!'], tone: 'red', buzz: true }
  else if (eRefused > 0) davor = { lines: ['Odbijena', 'veza!'], tone: 'red', buzz: true }

  const ramUsed = residentRamMB(s, v)
  const left = burstLeftS(w)
  return {
    offered: m.offered,
    burstNote: left > 0 ? `nalet ×${fmt.num(s.burstFactor)} · još ${left} s` : null,
    students: studentsFor(m.offered, geo.students.max),
    tap: m.offered > cap * 0.95,
    name: 'Klopa',
    spec: `${fmt.num(v.vcpu)} vCPU · ${fmt.num(v.ramGB)} GB · ${fmtEur(priceOf(v.vcpu, v.ramGB))}/mj.`,
    cores: Array.from({ length: v.vcpu }, () => (up ? sv.cpuSmooth : 0)),
    plates,
    workers: `${sv.busy}/${sv.workersLabel}`,
    queue: sv.queue,
    queueMax: sv.queueMax,
    mood,
    stamp,
    footer: `CPU ${fmt.pct(sv.cpuSmooth)} · RAM ${fmt.num(ramUsed / 1024, 1)}/${fmt.num(v.ramGB)} GB`,
    footerBad: ramUsed > sv.ramMB,
    dbWaiting: io,
    trays,
    fallLabel,
    parked: sv.parked + sv.connecting,
    davor,
    dim: v.proc === 'off' || v.proc === 'booting',
  }
}
