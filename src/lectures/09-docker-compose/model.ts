import type { SimEvent } from '../../kit'
import { createRng, plural, type Rng } from '../../kit/sim/math.ts'

/* =====================================================================
   „Compose slagalica” — a deterministic model of `docker compose` on ONE
   computer (Docker Engine). Pure TypeScript, no React.

   The file (`cfg`) is what the student edits; containers keep the config
   they were created with (`applied`). Nothing changes until `compose up`
   (Compose has no loop that keeps watching — that is lecture 10).

   Rules (from the lecture spec):
   - up: project network `klopa_default` (user-defined bridge, embedded DNS)
     → named volumes → containers in depends_on order. Without
     `condition: service_healthy` a dependent starts as soon as its
     dependencies have *started*; with it, it waits for their healthcheck.
   - Postgres is healthy 5 s (sim) after it starts. The API runs database
     migrations when it starts (1 s in), so it needs the database right away.
   - Names resolve only between running containers on the same
     user-defined network; the default `bridge` network has no name DNS.
   - Inside a container localhost is the container itself.
   - The host browser reaches only published ports. Two containers cannot
     publish the same host port („port is already allocated”).
   - Postgres data: named volume at /var/lib/postgresql (postgres:18+)
     survives down and docker rm; a named volume at the old …/data path makes
     postgres:18+ refuse to start („Error: in 18+ … /var/lib/postgresql/data
     (unused mount/volume)”, exit 1) unless the image's anonymous VOLUME
     already holds a database; no volume → anonymous volume:
     survives a restart, but docker rm db or down + up get a fresh one and
     the old one is left dangling. down -v deletes named and anonymous
     volumes of the project's containers; a bind mount is a host folder.
     tmpfs lives in RAM and is gone whenever the container stops.
   - restart: unless-stopped restarts crashed containers with a growing
     pause (1, 2, 4, 8 s sim) — on this host only. „Ugasi računalo” stops
     everything; nothing moves anywhere else.
   ===================================================================== */

export type SvcId = 'web' | 'api' | 'worker' | 'redis' | 'db' | 'rabbitmq'
export type NetId = 'default' | 'bridge'
export type Mount = 'anon' | 'named' | 'named-old' | 'bind' | 'tmpfs'
export type DbHost = 'db' | 'localhost'
export type Bind = '0.0.0.0' | '127.0.0.1'
export type BrowsePort = 8080 | 8000

/** Display / grid order: web, api, worker on top; redis, db, rabbitmq below. */
export const SERVICES: SvcId[] = ['web', 'api', 'worker', 'redis', 'db', 'rabbitmq']
/** Start order Compose derives from depends_on. */
export const START_ORDER: SvcId[] = ['db', 'redis', 'rabbitmq', 'api', 'worker', 'web']

export const DEPS: Record<SvcId, SvcId[]> = {
  web: ['api'],
  api: ['db', 'redis', 'rabbitmq'],
  worker: ['rabbitmq'],
  redis: [],
  db: [],
  rabbitmq: [],
}

/** Who talks to whom at runtime (drawn as pencil lines). */
export const LINKS: [SvcId, SvcId][] = [
  ['web', 'api'],
  ['api', 'redis'],
  ['api', 'db'],
  ['api', 'rabbitmq'],
  ['worker', 'rabbitmq'],
]

export const PORT_OPTIONS: Record<SvcId, string[]> = {
  web: ['none', '8080:8080'],
  api: ['none', '8000:8000', '8080:8000'],
  worker: ['none'],
  redis: ['none'],
  db: ['none', '5432:5432'],
  rabbitmq: ['none'],
}

/** Port the program inside listens on. */
export const INNER_PORT: Record<SvcId, number> = { web: 8080, api: 8000, worker: 0, redis: 6379, db: 5432, rabbitmq: 5672 }

/** Seconds (sim) from start until the service is ready; api and worker connect to their dependencies at CONNECT_AT. */
export const READY_AT: Record<SvcId, number> = { web: 0.3, api: 1.5, worker: 1.5, redis: 1, db: 5, rabbitmq: 4 }
export const CONNECT_AT = 1
/** Compose starts a dependent at least this long after creating it. */
export const DEPENDENT_DELAY = 0.5
/** Pause before the n-th restart (sim seconds). Docker starts at 100 ms and doubles it; the sim uses whole seconds. */
export const BACKOFF = [1, 2, 4, 8]
/** Orders per second (sim) while Klopa works — compressed lunch traffic. */
export const ORDER_RATE = 1.5
export const FIXED_DT = 0.05
/** postgres:18+ with a volume at the old …/data path exits this soon after it starts (sim seconds). */
export const OLD_PATH_FAIL_AT = 0.4

/** „42 narudžbe” with the Croatian plural form. */
export function nar(n: number): string {
  return plural(n, ['narudžba', 'narudžbe', 'narudžbi'])
}

/** Verb form agreeing with a count: agree(n, ['je nestala', 'su nestale', 'je nestalo']). */
function agree(n: number, forms: [string, string, string]): string {
  return plural(n, forms, false)
}

export interface Config {
  net: Record<SvcId, NetId>
  ports: Record<SvcId, string>
  mount: Mount
  dbHost: DbHost
  apiBind: Bind
  /** depends_on: condition: service_healthy */
  healthy: boolean
  /** restart: unless-stopped */
  restart: boolean
}

export type PresetId = 'ivin-readme' | 'dobar-compose'

export const PRESETS: Record<PresetId, { label: string; cfg: Config }> = {
  'ivin-readme': {
    label: 'Ivin compose.yaml (incident)',
    cfg: {
      net: { web: 'default', api: 'default', worker: 'default', redis: 'default', db: 'default', rabbitmq: 'default' },
      ports: { web: '8080:8080', api: 'none', worker: 'none', redis: 'none', db: 'none', rabbitmq: 'none' },
      mount: 'anon',
      dbHost: 'localhost',
      apiBind: '0.0.0.0',
      healthy: false,
      restart: false,
    },
  },
  'dobar-compose': {
    label: 'dobro složen compose.yaml',
    cfg: {
      net: { web: 'default', api: 'default', worker: 'default', redis: 'default', db: 'default', rabbitmq: 'default' },
      ports: { web: '8080:8080', api: 'none', worker: 'none', redis: 'none', db: 'none', rabbitmq: 'none' },
      mount: 'named',
      dbHost: 'db',
      apiBind: '0.0.0.0',
      healthy: true,
      restart: true,
    },
  },
}

export const SEED = 9

export type CState = 'created' | 'starting' | 'running' | 'exited' | 'backoff' | 'off'

interface Applied {
  net: NetId
  ports: string
  restart: boolean
  dbHost?: DbHost
  apiBind?: Bind
  mount?: Mount
}

export interface Container {
  svc: SvcId
  state: CState
  /** seconds in the current state */
  t: number
  /** backoff pause (state backoff) */
  wait: number
  restarts: number
  /** next backoff index (resets after 10 s of running) */
  level: number
  /** what happened last — shown under the card and in the log */
  reason: string
  applied: Applied
  ip: string
  /** db: the volume that holds the rows */
  vol: string | null
  /** db with the old path: the named volume mounted (empty) at …/data */
  extraVol: string | null
}

export type VolKind = 'named' | 'anon' | 'bind' | 'tmpfs'

export interface Volume {
  id: string
  kind: VolKind
  /** printed name: klopa_pgdata, 3f9a1c…, ./pgdata, tmpfs */
  label: string
  rows: number
  /** attached to an existing db container */
  inUse: boolean
  /** a database has been initialised in it (Postgres has run on it) */
  init?: boolean
}

export interface Seen {
  browser: boolean
  byName: boolean
  survivedDown: boolean
  survivedRm: boolean
  hostDown: boolean
  explained: boolean
}

export interface State {
  preset: PresetId
  cfg: Config
  host: 'on' | 'off'
  network: boolean
  containers: Partial<Record<SvcId, Container>>
  volumes: Volume[]
  time: number
  rng: Rng
  /** order arrivals: time accumulated while Klopa works, and the next gap */
  acc: number
  gap: number
  orders: number
  events: SimEvent[]
  eventId: number
  seen: Seen
  /** a down / docker rm whose effect on the rows we check when db is back */
  pending: { kind: 'down' | 'rm'; rows: number; vol: string | null } | null
  /** result of the last such check: old orders before / still in the database after */
  lastCheck: { kind: 'down' | 'rm'; before: number; after: number } | null
  anonCount: number
  ipCount: { default: number; bridge: number }
  /** depends_on mode used by the last `compose up` */
  upHealthy: boolean
  /** containers start ignoring depends_on (after the host boots, Docker starts them itself) */
  booted: boolean
}

const ANON_IDS = ['3f9a1c', 'b72e04', 'c51d9e', '8e0a77', 'd4c2f1', '19b6aa', 'e83f52', '6a0d3b']

export function cloneCfg(c: Config): Config {
  return { ...c, net: { ...c.net }, ports: { ...c.ports } }
}

export function createState(preset: PresetId = 'ivin-readme', seed = SEED): State {
  const rng = createRng(seed)
  return {
    preset,
    cfg: cloneCfg(PRESETS[preset].cfg),
    host: 'on',
    network: false,
    containers: {},
    volumes: [],
    time: 0,
    rng,
    acc: 0,
    gap: rng.exp(ORDER_RATE),
    orders: 0,
    events: [],
    eventId: 0,
    seen: { browser: false, byName: false, survivedDown: false, survivedRm: false, hostDown: false, explained: false },
    pending: null,
    lastCheck: null,
    anonCount: 0,
    ipCount: { default: 1, bridge: 1 },
    upHealthy: PRESETS[preset].cfg.healthy,
    booted: false,
  }
}

export function cname(svc: SvcId): string {
  return `klopa-${svc}-1`
}

function log(s: State, text: string, tone: SimEvent['tone'] = 'neutral') {
  // oldest first: the kit's EventLog shows the newest at the top
  s.events.push({ t: s.time, text, tone, id: ++s.eventId })
  if (s.events.length > 24) s.events.splice(0, s.events.length - 24)
}

function appliedOf(cfg: Config, svc: SvcId): Applied {
  const a: Applied = { net: cfg.net[svc], ports: cfg.ports[svc], restart: cfg.restart }
  if (svc === 'api') {
    a.dbHost = cfg.dbHost
    a.apiBind = cfg.apiBind
  }
  if (svc === 'db') a.mount = cfg.mount
  return a
}

/** Keys of a service whose value in the file differs from the running container (empty = up to date). */
export function changedKeys(s: State, svc: SvcId): string[] {
  const c = s.containers[svc]
  if (!c) return []
  const want = appliedOf(s.cfg, svc)
  const keys: string[] = []
  if (want.net !== c.applied.net) keys.push('net')
  if (want.ports !== c.applied.ports) keys.push('ports')
  if (want.restart !== c.applied.restart) keys.push('restart')
  if (want.dbHost !== c.applied.dbHost) keys.push('env')
  if (want.apiBind !== c.applied.apiBind) keys.push('command')
  if (want.mount !== c.applied.mount) keys.push('volumes')
  return keys
}

/** Does the running project lag behind compose.yaml? (something to apply with `compose up`) */
export function needsUp(s: State): boolean {
  if (s.host === 'off') return false
  if (SERVICES.some((v) => changedKeys(s, v).length > 0)) return true
  return Object.keys(s.containers).length > 0 && s.upHealthy !== s.cfg.healthy
}

/* ---------- queries ---------- */

/** The process in the container is running (it has an IP in DNS). */
export function procUp(c: Container | undefined): c is Container {
  return !!c && (c.state === 'starting' || c.state === 'running')
}

/** Can `from` find `to` by its service name? Only on the same user-defined network, only while `to` runs. */
export function resolves(s: State, from: SvcId, to: SvcId): boolean {
  const a = s.containers[from]
  const b = s.containers[to]
  if (!procUp(a) || !procUp(b)) return false
  return a.applied.net === 'default' && b.applied.net === 'default'
}

/** Why `from` cannot find `to` (null = it can). */
export function resolveError(s: State, from: SvcId, to: SvcId): string | null {
  if (resolves(s, from, to)) return null
  const a = s.containers[from]
  const b = s.containers[to]
  if (!b) return `${to} ne postoji`
  if (!procUp(b)) return `${to} ne radi`
  if (a && b && a.applied.net === 'bridge' && b.applied.net === 'bridge') return 'bridge nema DNS po imenu'
  return 'druga mreža'
}

/** Does `to` accept connections from `from` right now? */
export function reaches(s: State, from: SvcId, to: SvcId): boolean {
  if (!resolves(s, from, to)) return false
  const b = s.containers[to]!
  if (b.state !== 'running') return false
  if (to === 'api' && b.applied.apiBind === '127.0.0.1') return false
  return true
}

/** The API's database address: by name, or localhost (= the api container itself). */
function apiReachesDb(s: State): boolean {
  const api = s.containers.api
  if (!api || api.applied.dbHost === 'localhost') return false
  return reaches(s, 'api', 'db')
}

function dbError(s: State): string {
  const api = s.containers.api
  if (api?.applied.dbHost === 'localhost') return 'connection to server at "localhost" (127.0.0.1), port 5432 failed: Connection refused'
  if (!resolves(s, 'api', 'db')) return 'could not translate host name "db" to address: Name or service not known'
  return 'connection to server at "db", port 5432 failed: Connection refused'
}

export interface Browse {
  /** short code shown in the browser drawing */
  code: string
  ok: boolean
  /** one line for the status under the drawing */
  detail: string
}

/** What the browser on the host sees at localhost:<port>. */
export function browse(s: State, port: BrowsePort): Browse {
  if (s.host === 'off') return { code: '—', ok: false, detail: 'nema odgovora: računalo je ugašeno' }
  const holder = SERVICES.map((v) => s.containers[v]).find((c) => procUp(c) && c.applied.ports !== 'none' && Number(c.applied.ports.split(':')[0]) === port)
  if (!holder) {
    const owner = SERVICES.map((v) => s.containers[v]).find((c) => c && c.applied.ports !== 'none' && Number(c.applied.ports.split(':')[0]) === port)
    if (Object.keys(s.containers).length === 0) return { code: 'refused', ok: false, detail: 'Connection refused: ništa još ne radi (pokrenite compose up)' }
    return { code: 'refused', ok: false, detail: owner ? `Connection refused: ${owner.svc} s tim portom ne radi` : `Connection refused: na localhost:${port} nitko ne sluša (port nije objavljen)` }
  }
  if (holder.state !== 'running') return { code: 'reset', ok: false, detail: `Connection reset by peer: ${holder.svc} se još pokreće` }
  if (holder.svc === 'api') {
    if (holder.applied.apiBind === '127.0.0.1') return { code: 'reset', ok: false, detail: 'Connection reset by peer: gunicorn u kontejneru sluša samo na 127.0.0.1' }
    if (!apiReachesDb(s)) return { code: '500', ok: false, detail: '500: API je tu, ali ne može do baze' }
    if (port === 8080) return { code: '404', ok: false, detail: '404 Not Found: na 8080 odgovara API, a ne web (stranica „/” nije njegova)' }
    return { code: '200', ok: true, detail: '200 OK: JSON jelovnika izravno iz API-ja (vrata za otklanjanje grešaka)' }
  }
  if (holder.svc === 'db') return { code: '—', ok: false, detail: 'to je Postgres, a ne web' }
  // web: nginx asks Docker's DNS for „api” on every request
  if (!resolves(s, 'web', 'api')) return { code: '502', ok: false, detail: `502 Bad Gateway: nginx ne nalazi „api” (${resolveError(s, 'web', 'api')})` }
  if (!reaches(s, 'web', 'api')) {
    const api = s.containers.api!
    return { code: '502', ok: false, detail: api.applied.apiBind === '127.0.0.1' ? '502 Bad Gateway: api sluša samo na svom 127.0.0.1' : '502 Bad Gateway: api se još pokreće' }
  }
  if (!apiReachesDb(s)) return { code: '500', ok: false, detail: '500 Internal Server Error: API ne može do baze' }
  if (!reaches(s, 'api', 'redis')) return { code: '500', ok: false, detail: '500 Internal Server Error: API ne nalazi redis (sesije)' }
  return { code: '200', ok: true, detail: '200 OK: Klopa · današnji jelovnik' }
}

/** Rows in the database the db container currently uses (null = no db). */
export function dbRows(s: State): number | null {
  const db = s.containers.db
  if (!db || !db.vol) return null
  return s.volumes.find((v) => v.id === db.vol)?.rows ?? 0
}

export function danglingCount(s: State): number {
  return s.volumes.filter((v) => v.kind === 'anon' && !v.inUse).length
}

/** Klopa works: the page opens and an order reaches the database and the queue. */
export function klopaWorks(s: State): boolean {
  return browse(s, 8080).ok && reaches(s, 'api', 'rabbitmq')
}

/* ---------- volumes ---------- */

function newAnon(s: State): Volume {
  const v: Volume = { id: `anon-${s.anonCount}`, kind: 'anon', label: `${ANON_IDS[s.anonCount % ANON_IDS.length]}…`, rows: 0, inUse: true }
  s.anonCount++
  s.volumes.push(v)
  return v
}

function ensureVolume(s: State, id: string, kind: VolKind, label: string): Volume {
  let v = s.volumes.find((x) => x.id === id)
  if (!v) {
    v = { id, kind, label, rows: 0, inUse: false }
    s.volumes.push(v)
    if (kind === 'named') log(s, 'Volume klopa_pgdata  Created', 'info')
  }
  return v
}

/** Attach db storage for a new container; `reuse` = anonymous volume of the container being recreated. */
function attachDb(s: State, c: Container, mount: Mount, reuse: string | null) {
  c.vol = null
  c.extraVol = null
  if (mount === 'named') {
    const v = ensureVolume(s, 'named', 'named', 'klopa_pgdata')
    v.inUse = true
    c.vol = v.id
  } else if (mount === 'bind') {
    const v = ensureVolume(s, 'bind', 'bind', './pgdata')
    v.inUse = true
    c.vol = v.id
  } else if (mount === 'tmpfs') {
    const v: Volume = { id: `tmpfs-${s.anonCount++}`, kind: 'tmpfs', label: 'tmpfs (RAM)', rows: 0, inUse: true }
    s.volumes.push(v)
    c.vol = v.id
  } else {
    // anonymous volume from the image's VOLUME /var/lib/postgresql (also when the named one sits at the old …/data path:
    // then postgres:18+ refuses to start unless this volume already holds a database — see step())
    const old = reuse ? s.volumes.find((v) => v.id === reuse) : undefined
    const v = old ?? newAnon(s)
    v.inUse = true
    c.vol = v.id
    if (mount === 'named-old') {
      const n = ensureVolume(s, 'named', 'named', 'klopa_pgdata')
      n.inUse = true
      c.extraVol = n.id
    }
  }
}

/** The db container goes away (removed) or stops (tmpfs only): detach / drop its storage. */
function releaseDb(s: State, c: Container, removed: boolean) {
  const vol = s.volumes.find((v) => v.id === c.vol)
  if (vol?.kind === 'tmpfs') {
    s.volumes = s.volumes.filter((v) => v.id !== vol.id)
    if (vol.rows > 0) log(s, `tmpfs je bio u RAM-u: ${nar(vol.rows)} ${agree(vol.rows, ['je nestala', 'su nestale', 'je nestalo'])}`, 'bad')
    c.vol = null
  }
  if (!removed) return
  for (const id of [c.vol, c.extraVol]) {
    const v = s.volumes.find((x) => x.id === id)
    if (v) v.inUse = false
  }
  if (vol?.kind === 'anon') log(s, `anonimni volumen ${vol.label} ostaje bez kontejnera (viseći)${vol.rows ? ` – u njemu ${agree(vol.rows, ['je', 'su', 'je'])} ${nar(vol.rows)}` : ''}`, 'warn')
}

/** tmpfs content disappears as soon as the container stops; a running db gets an empty one when it starts again. */
function freshTmpfs(s: State, c: Container) {
  if (c.svc !== 'db' || c.applied.mount !== 'tmpfs' || c.vol) return
  const v: Volume = { id: `tmpfs-${s.anonCount++}`, kind: 'tmpfs', label: 'tmpfs (RAM)', rows: 0, inUse: true }
  s.volumes.push(v)
  c.vol = v.id
}

/* ---------- container lifecycle ---------- */

function makeContainer(s: State, svc: SvcId, reuse: string | null, keepIp?: string): Container {
  const applied = appliedOf(s.cfg, svc)
  const ip = keepIp ?? (applied.net === 'default' ? `172.18.0.${1 + s.ipCount.default++}` : `172.17.0.${1 + s.ipCount.bridge++}`)
  const c: Container = { svc, state: 'created', t: 0, wait: 0, restarts: 0, level: 0, reason: 'Created', applied, ip, vol: null, extraVol: null }
  if (svc === 'db') attachDb(s, c, applied.mount ?? 'anon', reuse)
  return c
}

function hostPortOf(c: Container): number | null {
  return c.applied.ports === 'none' ? null : Number(c.applied.ports.split(':')[0])
}

function startContainer(s: State, c: Container) {
  const hp = hostPortOf(c)
  if (hp !== null) {
    const other = SERVICES.map((v) => s.containers[v]).find((o) => o && o !== c && procUp(o) && hostPortOf(o) === hp)
    if (other) {
      c.state = 'exited'
      c.t = 0
      c.reason = 'port zauzet'
      log(s, `${c.svc}: Bind for 0.0.0.0:${hp} failed: port is already allocated (drži ga ${other.svc})`, 'bad')
      return
    }
  }
  freshTmpfs(s, c)
  c.state = 'starting'
  c.t = 0
  c.reason = 'starting'
}

function exitContainer(s: State, c: Container, why: string, short: string) {
  c.state = 'exited'
  c.t = 0
  c.reason = short
  log(s, `${c.svc}: ${why}`, 'bad')
  if (c.svc === 'db') releaseDb(s, c, false)
  if (c.applied.restart) {
    c.state = 'backoff'
    c.wait = BACKOFF[Math.min(c.level, BACKOFF.length - 1)]
    c.level++
    log(s, `${c.svc}: restart: unless-stopped → novi pokušaj za ${c.wait} s`, 'info')
  } else {
    log(s, `${c.svc}: Exited (1) – nema pravila restart, ostaje ugašen`, 'warn')
  }
}

function depsSatisfied(s: State, c: Container): { ok: boolean; why: string } {
  if (s.booted) return { ok: true, why: '' }
  for (const d of DEPS[c.svc]) {
    const dc = s.containers[d]
    if (s.upHealthy && DEPS[d].length === 0) {
      if (!dc || dc.state !== 'running') return { ok: false, why: `čeka zdrav ${d}` }
    } else if (!dc || !(dc.state === 'starting' || dc.state === 'running' || dc.state === 'backoff')) return { ok: false, why: `čeka ${d}` }
  }
  return { ok: true, why: '' }
}

/** One step of `dt` simulated seconds. */
export function step(s: State, dt: number) {
  s.time += dt
  if (s.host === 'off') return
  for (const svc of START_ORDER) {
    const c = s.containers[svc]
    if (!c) continue
    c.t += dt
    switch (c.state) {
      case 'created': {
        const d = depsSatisfied(s, c)
        c.reason = d.ok ? 'Created' : d.why
        if (d.ok && (DEPS[svc].length === 0 || c.t >= DEPENDENT_DELAY)) startContainer(s, c)
        break
      }
      case 'backoff':
        if (c.t >= c.wait) {
          c.restarts++
          log(s, `${svc}: ponovno pokretanje (↻ ${c.restarts})`, 'info')
          startContainer(s, c)
        }
        break
      case 'starting': {
        if ((svc === 'api' || svc === 'worker') && c.t >= CONNECT_AT && c.t - dt < CONNECT_AT) {
          if (svc === 'api' && !apiReachesDb(s)) {
            exitContainer(s, c, `manage.py migrate: ${dbError(s)}`, c.applied.dbHost === 'localhost' ? 'localhost:5432 ✗' : resolves(s, 'api', 'db') ? 'baza nije spremna' : 'ne nalazi db')
            break
          }
          if (svc === 'worker' && !reaches(s, 'worker', 'rabbitmq')) {
            const r = resolves(s, 'worker', 'rabbitmq')
            exitContainer(s, c, r ? 'pika: AMQPConnectionError – rabbitmq još nije spreman' : 'pika: AMQPConnectionError – ne nalazi „rabbitmq”', r ? 'mq nije spreman' : 'ne nalazi mq')
            break
          }
        }
        if (svc === 'db' && c.applied.mount === 'named-old' && c.t >= OLD_PATH_FAIL_AT && !s.volumes.find((x) => x.id === c.vol)?.init) {
          exitContainer(s, c, 'Error: in 18+, these Docker images are configured to store database data in a format which is compatible with "pg_ctlcluster" … /var/lib/postgresql/data (unused mount/volume)', 'stara putanja ✗')
          break
        }
        if (c.t >= READY_AT[svc]) {
          c.state = 'running'
          c.t = 0
          c.reason = DEPS[svc].length === 0 && svc !== 'web' ? 'healthy' : 'running'
          if (svc === 'db') {
            const dv = s.volumes.find((x) => x.id === c.vol)
            if (dv) dv.init = true
            log(s, 'db: pg_isready ✓ – baza je spremna (healthy)', 'ok')
          }
          else if (svc === 'api') {
            log(s, `api: migracije gotove, gunicorn sluša na ${c.applied.apiBind}:8000`, c.applied.apiBind === '0.0.0.0' ? 'ok' : 'warn')
            if (c.applied.dbHost === 'db') s.seen.byName = true
          } else if (svc === 'web') log(s, 'web: nginx sluša na 8080', 'ok')
          else log(s, `${svc}: spreman`, 'ok')
          if (svc === 'db') checkPending(s)
        }
        break
      }
      case 'running':
        if (c.t >= 10) c.level = 0
        if (svc === 'worker' && !reaches(s, 'worker', 'rabbitmq')) exitContainer(s, c, 'pika: veza s rabbitmq je prekinuta', 'veza s mq ✗')
        break
      default:
        break
    }
  }
  // students order lunch while Klopa works (seeded Poisson arrivals)
  if (klopaWorks(s)) {
    s.seen.browser = true
    s.acc += dt
    while (s.acc >= s.gap) {
      s.acc -= s.gap
      s.gap = s.rng.exp(ORDER_RATE)
      const db = s.containers.db
      const v = s.volumes.find((x) => x.id === db?.vol)
      if (v) {
        v.rows++
        s.orders++
      }
    }
  } else {
    s.acc = 0
    if (browse(s, 8080).ok) s.seen.browser = true
  }
}

function checkPending(s: State) {
  const p = s.pending
  if (!p) return
  s.pending = null
  const rows = dbRows(s) ?? 0
  if (p.rows === 0) {
    log(s, `nakon ${p.kind === 'down' ? 'down' : 'docker rm'} baza je opet tu – ali u njoj nije ni bilo narudžbi; pustite da studenti naruče pa probajte ponovno`, 'info')
    return
  }
  const same = s.containers.db?.vol === p.vol
  s.lastCheck = { kind: p.kind, before: p.rows, after: same ? Math.min(rows, p.rows) : 0 }
  if (rows >= p.rows && same) {
    log(s, `narudžbe su preživjele ${p.kind === 'down' ? 'compose down' : 'docker rm'}: u bazi ${agree(p.rows, ['je', 'su', 'je'])} i dalje ${nar(p.rows)}`, 'ok')
    if (p.kind === 'down') s.seen.survivedDown = true
    else s.seen.survivedRm = true
  } else {
    const old = s.volumes.find((v) => v.id === p.vol)
    log(s, `baza je prazna! ${nar(p.rows)} ${old ? `${agree(p.rows, ['čeka', 'čekaju', 'čeka'])} u visećem volumenu ${old.label}` : agree(p.rows, ['je nestala', 'su nestale', 'je nestalo'])}`, 'bad')
  }
}

/* ---------- user actions (call inside sim.mutate) ---------- */

export function composeUp(s: State) {
  if (s.host === 'off') return
  s.booted = false
  s.upHealthy = s.cfg.healthy
  log(s, 'docker compose up -d', 'info')
  if (!s.network) {
    s.network = true
    log(s, 'Network klopa_default  Created', 'info')
  }
  if (s.cfg.mount === 'named' || s.cfg.mount === 'named-old') ensureVolume(s, 'named', 'named', 'klopa_pgdata')
  for (const svc of START_ORDER) {
    const c = s.containers[svc]
    if (!c) {
      s.containers[svc] = makeContainer(s, svc, null)
      continue
    }
    if (changedKeys(s, svc).length > 0) {
      // Compose recreates a changed service and hands the old container's anonymous volume to the new one
      const reuse = svc === 'db' && c.applied.mount !== 'tmpfs' && c.vol?.startsWith('anon') && (s.cfg.mount === 'anon' || s.cfg.mount === 'named-old') ? c.vol : null
      if (svc === 'db') {
        if (!reuse) releaseDb(s, c, true)
        else for (const id of [c.extraVol]) {
          const v = s.volumes.find((x) => x.id === id)
          if (v) v.inUse = false
        }
      }
      const keepIp = c.applied.net === s.cfg.net[svc] ? c.ip : undefined
      s.containers[svc] = makeContainer(s, svc, reuse, keepIp)
      log(s, `Container ${cname(svc)}  Recreate`, 'info')
    } else if (c.state === 'exited' || c.state === 'off') {
      c.state = 'created'
      c.t = 0
      c.level = 0
      c.reason = 'Created'
    }
  }
}

export function composeDown(s: State, withVolumes: boolean) {
  if (s.host === 'off') return
  log(s, withVolumes ? 'docker compose down -v' : 'docker compose down', 'info')
  const db = s.containers.db
  const rows = dbRows(s) ?? 0
  const dataVol = db?.vol ?? null
  const attached = new Set<string>()
  let removed = 0
  for (const svc of START_ORDER) {
    const c = s.containers[svc]
    if (!c) continue
    if (svc === 'db') {
      if (c.vol) attached.add(c.vol)
      if (c.extraVol) attached.add(c.extraVol)
      releaseDb(s, c, true)
    }
    delete s.containers[svc]
    removed++
  }
  if (removed > 0) log(s, `Container klopa-…-1  Removed (${removed})`, 'neutral')
  if (s.network) {
    s.network = false
    log(s, 'Network klopa_default  Removed', 'neutral')
  }
  s.booted = false
  if (withVolumes) {
    const gone = s.volumes.filter((v) => attached.has(v.id) && (v.kind === 'anon' || v.kind === 'named'))
    // named volumes declared in the file go too, even when no container uses them right now
    const declared = s.cfg.mount === 'named' || s.cfg.mount === 'named-old'
    const named = s.volumes.find((v) => v.id === 'named')
    if (declared && named && !gone.includes(named)) gone.push(named)
    for (const g of gone) log(s, `Volume ${g.kind === 'named' ? 'klopa_pgdata' : g.label}  Removed${g.rows ? ` – s njim i ${nar(g.rows)}` : ''}`, g.rows ? 'bad' : 'warn')
    s.volumes = s.volumes.filter((x) => !gone.includes(x))
    if (s.volumes.some((x) => x.kind === 'bind')) log(s, './pgdata ostaje: bind mount je obična mapa na računalu', 'info')
    s.pending = null
  } else {
    if (s.volumes.some((x) => x.id === 'named')) log(s, 'imenovani volumen klopa_pgdata ostaje', 'ok')
    s.pending = { kind: 'down', rows, vol: dataVol }
  }
}

export function removeDb(s: State) {
  const c = s.containers.db
  if (!c || s.host === 'off') return
  log(s, `docker rm -f ${cname('db')}`, 'info')
  const rows = dbRows(s) ?? 0
  s.pending = { kind: 'rm', rows, vol: c.vol }
  releaseDb(s, c, true)
  delete s.containers.db
  log(s, 'kontejner klopa-db-1 je obrisan – vratit će ga tek „docker compose up”', 'warn')
}

export function volumePrune(s: State) {
  const gone = s.volumes.filter((x) => x.kind === 'anon' && !x.inUse)
  log(s, 'docker volume prune', 'info')
  if (gone.length === 0) {
    log(s, 'nema visećih anonimnih volumena', 'neutral')
    return
  }
  const rows = gone.reduce((a, x) => a + x.rows, 0)
  s.volumes = s.volumes.filter((x) => !gone.includes(x))
  log(s, `obrisano visećih volumena: ${gone.length}${rows ? ` (s njima i ${nar(rows)})` : ''}`, rows ? 'bad' : 'warn')
}

export function crash(s: State, svc: SvcId) {
  const c = s.containers[svc]
  if (!c || !procUp(c) || s.host === 'off') return
  exitContainer(s, c, 'proces je pao (exit 1)', 'pao (exit 1)')
}

export function hostOff(s: State) {
  if (s.host === 'off') return
  s.host = 'off'
  s.seen.hostDown = true
  log(s, '12:05 – računalo se ugasilo: stali su svi kontejneri', 'bad')
  for (const svc of START_ORDER) {
    const c = s.containers[svc]
    if (!c) continue
    if (svc === 'db') releaseDb(s, c, false)
    c.state = 'off'
    c.t = 0
    c.reason = 'računalo ✗'
  }
  log(s, 'nijedan kontejner nije prešao na drugo računalo – drugog nema', 'warn')
}

export function hostOn(s: State) {
  if (s.host === 'on') return
  s.host = 'on'
  log(s, 'računalo se ponovno pokrenulo, Docker Engine radi', 'info')
  let any = false
  for (const svc of START_ORDER) {
    const c = s.containers[svc]
    if (!c) continue
    if (c.applied.restart) {
      any = true
      startContainer(s, c)
      c.level = 0
    } else {
      c.state = 'exited'
      c.reason = 'Exited (255)'
    }
  }
  s.booted = any
  if (any) log(s, 'Docker sam diže kontejnere s pravilom restart – sve odjednom, bez redoslijeda iz depends_on', 'info')
  else log(s, 'bez pravila restart kontejneri ostaju ugašeni dok netko ne pokrene compose up', 'warn')
}

/* ---------- presets ---------- */

export function loadPreset(s: State, preset: PresetId) {
  const fresh = createState(preset)
  Object.assign(s, fresh)
  log(s, `preset ${preset} · seed ${SEED}: pritisnite compose up`, 'info')
}

/** A line in the event log for an edit of compose.yaml (the file changes; nothing runs differently yet). */
export function note(s: State, text: string, tone: SimEvent['tone'] = 'neutral') {
  log(s, text, tone)
}
