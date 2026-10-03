/**
 * „Slagač stoga” — the flagship model of lecture 07 (pure TypeScript, no React).
 *
 * One 16 GB physical host, three ways to run Klopa's apps on it:
 *   vm         every app in its own virtual machine (guest OS with its own kernel ≈ 1 GB + the app)
 *   ct         every app in a container: an isolated process on the shared host kernel (+ 0,2 GB runtime)
 *   ct + cloud containers inside two node VMs of 7,5 GB (what cloud Kubernetes nodes usually are)
 *
 * Rules (docs/curriculum.json → lectures[07].flagshipSimulation.model):
 *  - Host 16 GB, host OS (+ hypervisor) 1 GB. A VM reserves its whole memory up front: guest OS + the app.
 *    Containers reserve nothing: they use what the process uses.
 *  - App memory (illustrative): api 300 MB, worker 400 MB, web 150 MB, Postgres 1 GB, Redis 200 MB, RabbitMQ 300 MB.
 *  - Start race: a VM boots firmware → kernel → init → app (each a seeded random duration inside a range);
 *    a container only starts the process (same "app" range; the runtime's own set-up, ≈ 0,1–0,5 s, is left out).
 *    The ranges are the headline numbers; one run's sampled time is only shown as „ova utrka ≈ …”.
 *  - Memory leak +20 MB/s in the selected app:
 *      vm                → the guest kernel's OOM killer kills the app inside its VM (the host never notices)
 *      ct + memory.max   → the cgroup's limit is reached: only that container is OOM-killed
 *      ct, no limit      → the leak may eat the whole host (or node VM); then the OOM killer picks the process
 *                          with the highest score (≈ the most memory) — not necessarily the culprit. The preset
 *                          „Kontejneri, pun domaćin (6,5 GB)” leaves 0,6 GB free, so it hits a neighbour (Postgres).
 *  - Kernel exploit from the selected app:
 *      ct                → the shared kernel is compromised → every container on the host (a user namespace only
 *                          lowers what the attacker is on the host; the kernel is still shared)
 *      vm                → stops at the hypervisor (only that VM's guest kernel)
 *      ct + cloud        → confined to one node VM
 *  - The container stack never has a guest kernel.
 * Units: MB with 1 GB = 1000 MB (the drawing says „16 GB”). Seeded: createRng(SEED).
 */
import { createRng, plural, type Rng } from '../../kit/sim/math'
import type { SimEvent } from '../../kit'

export const SEED = 7
export const HOST_MB = 16000
export const HOST_OS_MB = 1000
export const GUEST_OS_MB = 1000
/** the guest OS gives up its cache under pressure, down to this; then the guest kernel's OOM killer acts */
export const GUEST_OS_MIN_MB = 700
export const RUNTIME_MB = 200
export const LEAK_MB_S = 20
export const MAX_APPS = 12
export const NODE_VMS = 2
/** the small host of the „pun domaćin” preset: 12 containers use 5,9 GB, so only 0,6 GB is left */
export const SMALL_HOST_MB = 6500
/** "almost out of memory" = less than this left (the whole host / node slows down) */
export const PRESSURE_MB = 400
/** fast-forward stops this far before the memory runs out, so the end is watched at 1× */
export const FF_LEFT_MB = 240

export type AppKind = 'api' | 'worker' | 'web' | 'postgres' | 'redis' | 'rabbitmq'
export const KINDS: AppKind[] = ['api', 'worker', 'web', 'postgres', 'redis', 'rabbitmq']

export interface KindInfo {
  /** name on the box (mono) */
  short: string
  /** full name in the event log */
  name: string
  /** button label */
  button: string
  /** memory of the running app, MB (illustrative) */
  mem: number
  /** memory.max when the belt is on, MB */
  limit: number
}

export const CATALOG: Record<AppKind, KindInfo> = {
  api: { short: 'api', name: 'klopa-api', button: 'api', mem: 300, limit: 512 },
  worker: { short: 'worker', name: 'klopa-worker', button: 'worker', mem: 400, limit: 512 },
  web: { short: 'web', name: 'klopa-web', button: 'web', mem: 150, limit: 256 },
  postgres: { short: 'postgres', name: 'postgres', button: 'Postgres', mem: 1000, limit: 1536 },
  redis: { short: 'redis', name: 'redis', button: 'Redis', mem: 200, limit: 256 },
  rabbitmq: { short: 'rabbitmq', name: 'rabbitmq', button: 'RabbitMQ', mem: 300, limit: 512 },
}

export interface Stage {
  label: string
  min: number
  max: number
}

/** VM boot: firmware → kernel → init → the program (seconds, illustrative ranges) */
export const VM_STAGES: Stage[] = [
  { label: 'firmware', min: 1, max: 3 },
  { label: 'jezgra', min: 1, max: 3 },
  { label: 'init', min: 2, max: 10 },
  { label: 'program', min: 0.3, max: 2.5 },
]
/** container start: just the program's process (the same range as the last VM stage) */
export const CT_STAGES: Stage[] = [{ label: 'program', min: 0.3, max: 2.5 }]

export type Mode = 'vm' | 'ct'
export type AppStatus = 'nofit' | 'stopped' | 'booting' | 'running' | 'oom'
export type KilledBy = 'guest' | 'cgroup' | 'host' | 'node'

export interface App {
  id: number
  kind: AppKind
  /** instance number of this kind (1, 2 …) */
  n: number
  /** memory used now (MB); 0 when not running */
  mem: number
  /** memory.max on (containers only) */
  limitOn: boolean
  status: AppStatus
  /** cloud: which node VM (0 / 1) */
  node: number
  /** boot stage durations (s) */
  boot: number[]
  bootT: number
  /** part of the current "Pokreni sve" race */
  inRace: boolean
  leaking: boolean
  pwned: boolean
  killedBy: KilledBy | null
  /** sim time of the OOM kill (for the burst) */
  killedAt: number
}

export type PresetId = 'vm12' | 'ct12' | 'ctFull' | 'empty'

export const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'vm12', label: 'VM za svaku aplikaciju (12)' },
  { id: 'ct12', label: 'Kontejneri (12)' },
  { id: 'ctFull', label: 'Kontejneri, pun domaćin (6,5 GB)' },
  { id: 'empty', label: 'Prazan domaćin' },
]

export interface StackState {
  /** the physical host's RAM (MB): 16 GB, or 6,5 GB in the „pun domaćin” preset */
  hostMb: number
  mode: Mode
  cloud: boolean
  userns: boolean
  apps: App[]
  nextId: number
  rng: Rng
  time: number
  events: SimEvent[]
  eventId: number
  /** selected app id (target of the leak / exploit / memory.max toggle) */
  selected: number | null
  race: { mode: Mode; ready: number[]; total: number } | null
  lastRace: { vm: number[] | null; ct: number[] | null }
  pressure: boolean
  /** ct (no cloud): the shared host kernel is compromised */
  kernelPwned: boolean
  /** cloud: the node VM whose kernel is compromised */
  pwnedNode: number | null
  /** vm: the VM (app id) whose guest kernel is compromised */
  pwnedVm: number | null
  /** where the last exploit started (app id) */
  attacker: number | null
  goals: { packed12: boolean; leakContained: boolean; exploitStopped: boolean; raceBoth: boolean }
  preset: PresetId
  /** RAM used (GB), sampled every 0,5 s for the chart */
  ramSeries: number[]
  sampleAcc: number
}

/* ---------- helpers ---------- */

export function gb(mb: number, digits = 1): string {
  return (mb / 1000).toLocaleString('hr-HR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function mbLabel(mb: number): string {
  return mb >= 1000 ? `${gb(mb)} GB` : `${Math.round(mb)} MB`
}

export function secs(v: number): string {
  return `${v.toLocaleString('hr-HR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`
}

export function duration(sec: number): string {
  const t = Math.round(sec)
  const m = Math.floor(t / 60)
  const s = t % 60
  return m > 0 ? `${m} min ${s} s` : `${s} s`
}

/** the illustrative start range of a whole VM boot / a container start, e.g. „4–19 s” and „0,3–2,5 s” */
export function rangeLabel(mode: Mode): string {
  const st = mode === 'vm' ? VM_STAGES : CT_STAGES
  const min = st.reduce((x, y) => x + y.min, 0)
  const max = st.reduce((x, y) => x + y.max, 0)
  return mode === 'vm' ? `${Math.floor(min)}–${Math.ceil(max)} s` : `${secs(min).replace(' s', '')}–${secs(max)}`
}

/** a host size in GB for labels: „16”, „6,5” */
export function hostGb(s: StackState): string {
  return (s.hostMb / 1000).toLocaleString('hr-HR', { maximumFractionDigits: 1 })
}

/** memory of one node VM in the cloud mode (the host minus its OS, split in two) */
export function nodeVmMb(s: StackState): number {
  return (s.hostMb - HOST_OS_MB) / NODE_VMS
}

export function appName(a: App, s: StackState): string {
  const many = s.apps.filter((b) => b.kind === a.kind).length > 1
  return many ? `${CATALOG[a.kind].name} #${a.n}` : CATALOG[a.kind].name
}

export const alive = (a: App) => a.status === 'booting' || a.status === 'running'
export const fits = (a: App) => a.status !== 'nofit'
const isCloud = (s: StackState) => s.mode === 'ct' && s.cloud

function log(s: StackState, text: string, tone: SimEvent['tone']) {
  s.events.push({ id: s.eventId++, t: s.time, text, tone })
  if (s.events.length > 20) s.events.shift()
}

/** the stages of an app's start in the current mode */
export function stagesFor(s: StackState): Stage[] {
  return s.mode === 'vm' ? VM_STAGES : CT_STAGES
}

export function bootTotal(a: App): number {
  return a.boot.reduce((x, y) => x + y, 0)
}

/** index of the stage an app is booting through right now (and how far, 0..1) */
export function bootStage(a: App): { i: number; f: number } {
  let t = a.bootT
  for (let i = 0; i < a.boot.length; i++) {
    if (t < a.boot[i]) return { i, f: t / a.boot[i] }
    t -= a.boot[i]
  }
  return { i: a.boot.length - 1, f: 1 }
}

/* ---------- memory accounting ---------- */

export interface Usage {
  /** total capacity of the box being shown (the host) */
  total: number
  hostOs: number
  guestOs: number
  runtime: number
  /** app memory (without the leak) */
  apps: number
  /** extra memory eaten by leaks */
  leak: number
  used: number
  free: number
}

/** Memory of the whole host (vm: VM reservations; ct: what processes use; cloud: inside the node VMs). */
export function usage(s: StackState): Usage {
  let guestOs = 0
  let runtime = 0
  let apps = 0
  let leak = 0
  if (s.mode === 'vm') {
    // a VM reserves its memory up front (guest OS + app), running or not; a leak stays inside the VM
    for (const a of s.apps) {
      if (!fits(a)) continue
      guestOs += GUEST_OS_MB
      apps += CATALOG[a.kind].mem
    }
  } else {
    runtime = isCloud(s) ? RUNTIME_MB * NODE_VMS : RUNTIME_MB
    guestOs = isCloud(s) ? GUEST_OS_MB * NODE_VMS : 0
    for (const a of s.apps) {
      if (!alive(a)) continue
      const base = Math.min(a.mem, CATALOG[a.kind].mem)
      apps += base
      leak += a.mem - base
    }
  }
  const used = HOST_OS_MB + guestOs + runtime + apps + leak
  return { total: s.hostMb, hostOs: HOST_OS_MB, guestOs, runtime, apps, leak, used, free: s.hostMb - used }
}

/** Memory inside one node VM (cloud mode). */
export function nodeUsage(s: StackState, node: number): { used: number; free: number } {
  let used = GUEST_OS_MB + RUNTIME_MB
  for (const a of s.apps) if (a.node === node && alive(a)) used += a.mem
  return { used, free: nodeVmMb(s) - used }
}

export function fitCount(s: StackState): number {
  return s.apps.filter(fits).length
}

/* ---------- state ---------- */

function makeApp(s: StackState, kind: AppKind): App {
  const n = s.apps.filter((a) => a.kind === kind).reduce((m, a) => Math.max(m, a.n), 0) + 1
  return { id: s.nextId++, kind, n, mem: 0, limitOn: false, status: 'stopped', node: 0, boot: [], bootT: 0, inRace: false, leaking: false, pwned: false, killedBy: null, killedAt: -99 }
}

/** VM mode: first fit in order (a VM needs guest OS + app); containers always fit here. Also assigns node VMs. */
function place(s: StackState) {
  let used = HOST_OS_MB
  s.apps.forEach((a, i) => {
    a.node = isCloud(s) ? i % NODE_VMS : 0
    if (s.mode === 'vm') {
      const need = GUEST_OS_MB + CATALOG[a.kind].mem
      if (used + need <= s.hostMb) {
        used += need
        if (a.status === 'nofit') a.status = 'stopped'
      } else {
        a.status = 'nofit'
        a.mem = 0
        a.leaking = false
      }
    } else if (a.status === 'nofit') a.status = 'stopped'
  })
}

function clearAttack(s: StackState) {
  s.kernelPwned = false
  s.pwnedNode = null
  s.pwnedVm = null
  s.attacker = null
  for (const a of s.apps) a.pwned = false
}

function sampleBoot(s: StackState): number[] {
  return stagesFor(s).map((st) => st.min + (st.max - st.min) * s.rng.next())
}

function startApp(s: StackState, a: App, inRace: boolean) {
  a.status = 'booting'
  a.boot = sampleBoot(s)
  a.bootT = 0
  a.mem = CATALOG[a.kind].mem
  a.leaking = false
  a.pwned = false
  a.killedBy = null
  a.inRace = inRace
}

function updateGoals(s: StackState) {
  if (s.hostMb === HOST_MB && s.apps.length >= MAX_APPS && s.apps.every(fits)) s.goals.packed12 = true
}

export function createState(preset: PresetId = 'vm12'): StackState {
  const s: StackState = {
    hostMb: HOST_MB,
    mode: 'vm',
    cloud: false,
    userns: false,
    apps: [],
    nextId: 1,
    rng: createRng(SEED),
    time: 0,
    events: [],
    eventId: 1,
    selected: null,
    race: null,
    lastRace: { vm: null, ct: null },
    pressure: false,
    kernelPwned: false,
    pwnedNode: null,
    pwnedVm: null,
    attacker: null,
    goals: { packed12: false, leakContained: false, exploitStopped: false, raceBoth: false },
    preset,
    ramSeries: [],
    sampleAcc: 0,
  }
  applyPreset(s, preset)
  return s
}

/** Replace the state's contents with a preset (used by reset and by the „Primjer” picker; same seed). */
export function applyPreset(s: StackState, preset: PresetId) {
  s.preset = preset
  s.hostMb = preset === 'ctFull' ? SMALL_HOST_MB : HOST_MB
  s.mode = preset === 'ct12' || preset === 'ctFull' ? 'ct' : 'vm'
  s.cloud = false
  s.apps = []
  s.nextId = 1
  s.rng = createRng(SEED)
  s.time = 0
  s.events = []
  s.eventId = 1
  s.race = null
  s.lastRace = { vm: null, ct: null }
  s.pressure = false
  clearAttack(s)
  s.goals = { packed12: false, leakContained: false, exploitStopped: false, raceBoth: false }
  s.ramSeries = []
  s.sampleAcc = 0
  if (preset !== 'empty') {
    for (let k = 0; k < 2; k++) for (const kind of KINDS) s.apps.push(makeApp(s, kind))
  }
  place(s)
  s.selected = s.apps[0]?.id ?? null
  if (preset === 'vm12') log(s, `Svaka aplikacija u svoj VM: stalo ${fitCount(s)} od ${s.apps.length}`, fitCount(s) < s.apps.length ? 'bad' : 'info')
  if (preset === 'ct12') log(s, `Kontejneri: stalo ${fitCount(s)} od ${s.apps.length}`, 'ok')
  if (preset === 'ctFull') {
    const free = s.hostMb - HOST_OS_MB - RUNTIME_MB - s.apps.reduce((x, a) => x + CATALOG[a.kind].mem, 0)
    log(s, `Kontejneri na domaćinu od ${hostGb(s)} GB: kad svi rade, slobodno je samo ${mbLabel(free)}`, 'info')
  }
  if (preset === 'empty') log(s, 'Prazan domaćin od 16 GB', 'info')
  updateGoals(s)
  if (s.apps.length) startAll(s)
}

/* ---------- user actions (call inside sim.mutate) ---------- */

export function startAll(s: StackState) {
  const list = s.apps.filter(fits)
  if (!list.length) {
    log(s, 'Nema aplikacija za pokretanje', 'neutral')
    return
  }
  clearAttack(s)
  s.pressure = false
  for (const a of list) startApp(s, a, true)
  s.race = { mode: s.mode, ready: [], total: list.length }
  const n = list.length
  log(s, `Pokreni sve: ${s.mode === 'vm' ? plural(n, ['VM se diže', 'VM-a se dižu', 'VM-ova se diže']) : plural(n, ['kontejner se pokreće', 'kontejnera se pokreću', 'kontejnera se pokreće'])}`, 'info')
}

export function addApp(s: StackState, kind: AppKind) {
  if (s.apps.length >= MAX_APPS) {
    log(s, `U simulaciji najviše ${MAX_APPS} aplikacija`, 'neutral')
    return
  }
  const a = makeApp(s, kind)
  s.apps.push(a)
  place(s)
  s.selected = a.id
  if (a.status === 'nofit') {
    const u = usage(s)
    log(s, `${appName(a, s)}: VM treba ${mbLabel(GUEST_OS_MB + CATALOG[kind].mem)}, slobodno ${mbLabel(u.free)}`, 'bad')
  } else {
    startApp(s, a, false)
    log(s, `Dodano: ${appName(a, s)}${s.mode === 'vm' ? ' u novom VM-u' : ' u kontejneru'}`, 'info')
  }
  updateGoals(s)
}

export function removeLast(s: StackState) {
  const a = s.apps.pop()
  if (!a) return
  place(s)
  if (s.selected === a.id) s.selected = s.apps[s.apps.length - 1]?.id ?? null
  if (s.race) s.race.total = s.apps.filter((b) => b.inRace).length
  log(s, `Uklonjeno: ${CATALOG[a.kind].name}`, 'neutral')
}

export function setMode(s: StackState, mode: Mode) {
  if (s.mode === mode) return
  s.mode = mode
  place(s)
  for (const a of s.apps) if (!fits(a)) a.mem = 0
  log(s, mode === 'vm' ? `VM-ovi: svaki s OS-om gosta – stalo ${fitCount(s)} od ${s.apps.length}` : `Kontejneri: zajednička jezgra – stalo ${fitCount(s)} od ${s.apps.length}`, mode === 'vm' && fitCount(s) < s.apps.length ? 'bad' : 'info')
  updateGoals(s)
  startAll(s)
}

export function setCloud(s: StackState, cloud: boolean) {
  // the two 7,5 GB VMs need the 16 GB host
  if (cloud && s.hostMb !== HOST_MB) return
  s.cloud = cloud
  if (s.mode !== 'ct') return
  place(s)
  log(s, cloud ? 'U oblaku: kontejneri u dva VM-a' : 'Kontejneri izravno na domaćinu', 'info')
  startAll(s)
}

export function setUserns(s: StackState, on: boolean) {
  s.userns = on
  log(s, on ? 'Korisnički imenski prostor: root u kontejneru = neprivilegirani korisnik na domaćinu' : 'Korisnički imenski prostor isključen: root u kontejneru = root na domaćinu', 'info')
}

export function setLimit(s: StackState, id: number, on: boolean) {
  const a = s.apps.find((b) => b.id === id)
  if (!a) return
  a.limitOn = on
  log(s, on ? `${appName(a, s)}: memory.max = ${mbLabel(CATALOG[a.kind].limit)}` : `${appName(a, s)}: bez memory.max`, 'info')
  // a limit set below what the process already uses: the kernel reclaims, then OOM-kills at once
  if (on && s.mode === 'ct' && alive(a) && a.mem >= CATALOG[a.kind].limit) kill(s, a, 'cgroup')
}

export function startLeak(s: StackState, id: number) {
  const a = s.apps.find((b) => b.id === id)
  if (!a) return
  if (!alive(a)) {
    log(s, `${appName(a, s)} ne radi – nema što curiti`, 'neutral')
    return
  }
  if (a.leaking) return
  a.leaking = true
  const where = s.mode === 'vm' ? 'u svojem VM-u' : a.limitOn ? `s pojasom memory.max ${mbLabel(CATALOG[a.kind].limit)}` : 'bez memory.max'
  log(s, `Curenje: ${appName(a, s)} +${LEAK_MB_S} MB/s (${where})`, 'warn')
}

/** Free memory where the leaking, unlimited container lives (host or its node VM), or null. */
export function leakRoom(s: StackState): { app: App; free: number } | null {
  if (s.mode !== 'ct') return null
  const a = s.apps.find((b) => b.leaking && alive(b) && !b.limitOn)
  if (!a) return null
  const free = isCloud(s) ? nodeUsage(s, a.node).free : usage(s).free
  return { app: a, free }
}

/** Skip the long wait of an unlimited leak: jump until only FF_LEFT_MB are left (the time is counted). */
export function fastForward(s: StackState) {
  const room = leakRoom(s)
  if (!room || room.free <= FF_LEFT_MB + 1) return
  const eat = room.free - FF_LEFT_MB
  const dt = eat / LEAK_MB_S
  room.app.mem += eat
  s.time += dt
  log(s, `Premotano ${duration(dt)}: ${appName(room.app, s)} je pojeo još ${mbLabel(eat)}`, 'neutral')
}

export function exploit(s: StackState, id: number) {
  const src = s.apps.find((b) => b.id === id && b.status === 'running') ?? s.apps.find((b) => b.status === 'running')
  if (!src) {
    log(s, 'Nijedna aplikacija ne radi – napadač nema odakle krenuti', 'neutral')
    return
  }
  clearAttack(s)
  s.attacker = src.id
  const others = s.apps.filter((a) => a !== src && alive(a))
  if (s.mode === 'vm') {
    s.pwnedVm = src.id
    src.pwned = true
    log(s, `Napad na jezgru gosta u VM-u ${appName(src, s)}: zaustavljen na hipervizoru`, 'warn')
    if (others.length) s.goals.exploitStopped = true
    return
  }
  if (isCloud(s)) {
    s.pwnedNode = src.node
    let hit = 0
    for (const a of s.apps) {
      if (a.node === src.node && alive(a)) {
        a.pwned = true
        hit++
      }
    }
    log(s, `Napad na jezgru VM-a ${src.node + 1} u oblaku: ${plural(hit, ['pogođen kontejner', 'pogođena kontejnera', 'pogođenih kontejnera'])}; drugi VM netaknut`, 'bad')
    if (s.apps.some((a) => a.node !== src.node && alive(a))) s.goals.exploitStopped = true
    return
  }
  s.kernelPwned = true
  let hit = 0
  for (const a of s.apps) {
    if (alive(a)) {
      a.pwned = true
      hit++
    }
  }
  log(s, `Napad na zajedničku jezgru: pogođeni su svi kontejneri na domaćinu (${hit})`, 'bad')
  if (s.userns) log(s, 'User namespace: napadač je krenuo kao neprivilegirani korisnik, ali tko pokori jezgru, ima sve ovlasti', 'warn')
}

export function patchKernel(s: StackState) {
  clearAttack(s)
  log(s, 'Jezgra zakrpana, kontejneri i VM-ovi ponovno pokrenuti', 'ok')
  startAll(s)
}

/* ---------- the loop ---------- */

function kill(s: StackState, a: App, by: KilledBy) {
  const mem = a.mem
  const culprit = a.leaking
  a.status = 'oom'
  a.killedBy = by
  a.killedAt = s.time
  a.leaking = false
  a.mem = 0
  const name = appName(a, s)
  // the OOM killer picks by score, not by guilt: say whom it hit
  const who = culprit ? 'samog krivca' : 'susjeda, ne krivca'
  if (by === 'guest') log(s, `OOM killer u VM-u ubio je ${name}; ostali VM-ovi ništa ne osjećaju`, 'bad')
  else if (by === 'cgroup') log(s, `${name} je dosegao memory.max (${mbLabel(mem)}): OOMKilled – samo on`, 'bad')
  else if (by === 'node') log(s, `OOM killer u VM-u ${a.node + 1} u oblaku ubio je ${name} (${mbLabel(mem)}, najviše bodova) – ${who}`, 'bad')
  else log(s, `OOM killer domaćina ubio je ${name} (${mbLabel(mem)}, najviše bodova) – ${who}`, 'bad')
}

/** The OOM killer: the alive process with the highest score (≈ the most memory) in that box. */
function oomVictim(list: App[]): App | null {
  let best: App | null = null
  for (const a of list) if (alive(a) && (!best || a.mem > best.mem)) best = a
  return best
}

export function step(s: StackState, dt: number) {
  s.time += dt
  // boot
  for (const a of s.apps) {
    if (a.status !== 'booting') continue
    a.bootT += dt
    if (a.bootT >= bootTotal(a)) {
      a.status = 'running'
      if (a.inRace && s.race) s.race.ready.push(bootTotal(a))
    }
  }
  if (s.race && s.race.ready.length >= s.race.total) {
    const r = s.race
    const ready = [...r.ready].sort((x, y) => x - y)
    s.lastRace[r.mode] = ready
    s.race = null
    if (ready.length) {
      const last = ready[ready.length - 1]
      log(s, r.mode === 'vm' ? `Svi VM-ovi rade (ova utrka ≈ ${Math.round(last)} s; raspon ${rangeLabel('vm')})` : `Svi kontejneri rade (ova utrka ≈ ${secs(last)}; raspon ${rangeLabel('ct')})`, 'ok')
    }
    if (s.lastRace.vm && s.lastRace.ct) s.goals.raceBoth = true
  }
  // leaks
  for (const a of s.apps) {
    if (!a.leaking || !alive(a)) continue
    a.mem += LEAK_MB_S * dt
    const base = CATALOG[a.kind].mem
    if (s.mode === 'vm') {
      if (a.mem - base >= GUEST_OS_MB - GUEST_OS_MIN_MB) {
        kill(s, a, 'guest')
      }
    } else if (a.limitOn && a.mem >= CATALOG[a.kind].limit) {
      a.mem = CATALOG[a.kind].limit
      kill(s, a, 'cgroup')
      s.goals.leakContained = true
    }
  }
  // the host (or a node VM) runs out of memory → the OOM killer picks by score, not by guilt
  let pressure = false
  if (s.mode === 'ct') {
    if (isCloud(s)) {
      for (let n = 0; n < NODE_VMS; n++) {
        const u = nodeUsage(s, n)
        if (u.free < PRESSURE_MB) pressure = true
        if (u.free <= 0) {
          const v = oomVictim(s.apps.filter((a) => a.node === n))
          if (v) kill(s, v, 'node')
        }
      }
    } else {
      const u = usage(s)
      if (u.free < PRESSURE_MB) pressure = true
      if (u.free <= 0) {
        const v = oomVictim(s.apps)
        if (v) kill(s, v, 'host')
      }
    }
  }
  if (pressure && !s.pressure) log(s, isCloud(s) ? 'VM-u u oblaku ponestaje memorije: svi njegovi kontejneri usporavaju' : 'Domaćinu ponestaje memorije: svi kontejneri usporavaju', 'warn')
  s.pressure = pressure
  // chart
  s.sampleAcc += dt
  if (s.sampleAcc >= 0.5) {
    s.sampleAcc = 0
    s.ramSeries.push(usage(s).used / 1000)
    if (s.ramSeries.length > 120) s.ramSeries.shift()
  }
}
