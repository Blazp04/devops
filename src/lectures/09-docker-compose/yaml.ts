import { changedKeys, type Config, type State, type SvcId } from './model'

/* The live compose.yaml of the flagship sim, generated from the model's config (what the file says). */

export interface YamlLine {
  text: string
  /** service block this line belongs to (two-way highlight) */
  svc?: SvcId
  /** model key the line expresses (marked when it differs from the running container) */
  key?: string
  /** the `  api:` line that opens a service block */
  head?: boolean
  /** a YAML comment (dimmed) */
  comment?: boolean
}

const IMAGE: Record<SvcId, string> = {
  web: 'registry.klopa.example/klopa-web:1.3.2',
  api: 'registry.klopa.example/klopa-api:1.3.2',
  worker: 'registry.klopa.example/klopa-worker:1.3.2',
  redis: 'redis:8',
  db: 'postgres:18',
  rabbitmq: 'rabbitmq:4.3',
}

const HEALTH: Partial<Record<SvcId, string>> = {
  db: '["CMD-SHELL", "pg_isready -h 127.0.0.1 -U klopa -d klopa"]',
  redis: '["CMD", "redis-cli", "ping"]',
  rabbitmq: '["CMD", "rabbitmq-diagnostics", "-q", "ping"]',
}

/** start_period / start_interval per service — the same values as code/compose.yaml */
const START: Partial<Record<SvcId, [string, string]>> = { db: ['30s', '1s'], redis: ['10s', '1s'], rabbitmq: ['60s', '2s'] }

const ORDER: SvcId[] = ['web', 'api', 'worker', 'redis', 'db', 'rabbitmq']

function depends(cfg: Config, svc: SvcId, deps: SvcId[], out: YamlLine[]) {
  if (deps.length === 0) return
  // web only needs api to exist (nginx asks DNS on every request), so it keeps the short form
  if (!cfg.healthy || svc === 'web') {
    out.push({ text: `    depends_on: [${deps.join(', ')}]`, svc, key: 'depends' })
    return
  }
  out.push({ text: '    depends_on:', svc, key: 'depends' })
  for (const d of deps) out.push({ text: `      ${d}: { condition: service_healthy }`, svc, key: 'depends' })
}

const DEPS_OF: Record<SvcId, SvcId[]> = { web: ['api'], api: ['db', 'redis', 'rabbitmq'], worker: ['rabbitmq'], redis: [], db: [], rabbitmq: [] }

export function composeYaml(cfg: Config): YamlLine[] {
  const out: YamlLine[] = [{ text: 'name: klopa' }, { text: 'services:' }]
  for (const svc of ORDER) {
    out.push({ text: `  ${svc}:`, svc, head: true })
    out.push({ text: `    image: ${IMAGE[svc]}`, svc })
    if (svc === 'api') {
      out.push({ text: `    command: sh -c "python manage.py migrate && exec gunicorn -b ${cfg.apiBind}:8000 klopa.wsgi"`, svc, key: 'command' })
      out.push({ text: '    environment:', svc, key: 'env' })
      out.push({ text: `      DATABASE_HOST: ${cfg.dbHost}`, svc, key: 'env' })
      out.push({ text: '      REDIS_URL: redis://redis:6379/0', svc })
      out.push({ text: '      AMQP_HOST: rabbitmq', svc })
    }
    if (svc === 'worker') out.push({ text: '    environment: { AMQP_HOST: rabbitmq }', svc })
    if (svc === 'db') out.push({ text: '    env_file: .env', svc })
    if (cfg.ports[svc] !== 'none') out.push({ text: `    ports: ["${cfg.ports[svc]}"]`, svc, key: 'ports' })
    if (cfg.net[svc] === 'bridge') out.push({ text: '    network_mode: bridge', svc, key: 'net' })
    if (svc === 'db') {
      if (cfg.mount === 'anon') out.push({ text: '    # bez volumena: Docker stvara anonimni volumen (VOLUME u slici)', svc, key: 'volumes', comment: true })
      if (cfg.mount === 'named') out.push({ text: '    volumes: ["pgdata:/var/lib/postgresql"]', svc, key: 'volumes' })
      if (cfg.mount === 'named-old') out.push({ text: '    volumes: ["pgdata:/var/lib/postgresql/data"]  # stara putanja: postgres:18 odbija start', svc, key: 'volumes' })
      if (cfg.mount === 'bind') out.push({ text: '    volumes: ["./pgdata:/var/lib/postgresql"]', svc, key: 'volumes' })
      if (cfg.mount === 'tmpfs') out.push({ text: '    tmpfs: [/var/lib/postgresql]', svc, key: 'volumes' })
    }
    depends(cfg, svc, DEPS_OF[svc], out)
    const h = HEALTH[svc]
    if (h) {
      out.push({ text: '    healthcheck:', svc })
      out.push({ text: `      test: ${h}`, svc })
      const [period, every] = START[svc] ?? ['30s', '1s']
      out.push({ text: '      interval: 10s', svc })
      out.push({ text: `      start_period: ${period}`, svc })
      out.push({ text: `      start_interval: ${every}`, svc })
    }
    if (cfg.restart) out.push({ text: '    restart: unless-stopped', svc, key: 'restart' })
  }
  if (cfg.mount === 'named' || cfg.mount === 'named-old') {
    out.push({ text: 'volumes:' })
    out.push({ text: '  pgdata:', key: 'volumes', svc: 'db' })
  }
  return out
}

/** Lines whose value differs from what runs right now (to be applied by `compose up`). */
export function changedLine(s: State, l: YamlLine): boolean {
  if (!l.svc) return false
  const keys = changedKeys(s, l.svc)
  if (keys.length === 0) return false
  if (l.head) return true
  return !!l.key && keys.includes(l.key)
}
