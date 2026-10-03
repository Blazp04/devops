import { useMemo, useState } from 'react'
import { Button, Diagram, DLabel, FoodBox, Rough, RoughBox, Segmented, useWidth } from '../../../kit'
import * as M from '../model'
import { VolumeThing } from './SlagalicaParts'
import styles from '../styles.module.css'

type Action = 'restart' | 'rm' | 'down' | 'downv'

const ACTIONS: { id: Action; label: string; cmd: string }[] = [
  { id: 'restart', label: 'Ponovno pokreni db', cmd: 'docker compose restart db' },
  { id: 'rm', label: 'docker rm db, pa up', cmd: 'docker rm -f klopa-db-1 && docker compose up -d' },
  { id: 'down', label: 'down, pa up', cmd: 'docker compose down && docker compose up -d' },
  { id: 'downv', label: 'down -v, pa up', cmd: 'docker compose down -v && docker compose up -d' },
]

type LabMount = 'anon' | 'named' | 'bind' | 'tmpfs'

const MOUNTS: { value: LabMount; label: string }[] = [
  { value: 'anon', label: 'bez volumena' },
  { value: 'named', label: 'imenovani' },
  { value: 'bind', label: 'bind mount' },
  { value: 'tmpfs', label: 'tmpfs' },
]

const START_ROWS = 37

interface Run {
  s: M.State
  history: { action: Action; before: number; after: number }[]
}

function advance(s: M.State, seconds: number) {
  const n = Math.round(seconds / M.FIXED_DT)
  for (let i = 0; i < n; i++) M.step(s, M.FIXED_DT)
}

/** Replays the student's actions on the flagship model (the same rules), without traffic. */
function simulate(mount: LabMount, actions: Action[]): Run {
  const s = M.createState('dobar-compose')
  s.cfg.mount = mount
  s.cfg.ports.web = 'none'
  M.composeUp(s)
  advance(s, 7)
  const v = s.volumes.find((x) => x.id === s.containers.db?.vol)
  if (v) v.rows = START_ROWS
  const history: Run['history'] = []
  for (const a of actions) {
    const before = M.dbRows(s) ?? 0
    if (a === 'restart') M.crash(s, 'db')
    if (a === 'rm') {
      M.removeDb(s)
      M.composeUp(s)
    }
    if (a === 'down' || a === 'downv') {
      M.composeDown(s, a === 'downv')
      M.composeUp(s)
    }
    advance(s, 8)
    history.push({ action: a, before, after: M.dbRows(s) ?? 0 })
  }
  return { s, history }
}

const YAML: Record<LabMount, string> = {
  anon: '# db bez volumes: → anonimni volumen iz slike',
  named: 'volumes: ["pgdata:/var/lib/postgresql"]',
  bind: 'volumes: ["./pgdata:/var/lib/postgresql"]',
  tmpfs: 'tmpfs: [/var/lib/postgresql]',
}

/** Scene 4b: what survives restart, docker rm, down and down -v — for each kind of storage. */
export function VolumeLab() {
  const [mount, setMount] = useState<LabMount>('anon')
  const [actions, setActions] = useState<Action[]>([])
  const [ref, w] = useWidth<HTMLDivElement>()
  const wide = w === null || w >= 560
  const run = useMemo(() => simulate(mount, actions), [mount, actions])
  const s = run.s
  const W = wide ? 600 : 340
  const H = wide ? 230 : 300
  const mono = 14
  const hand = 13.5
  const vols = [...s.volumes].sort((a, b) => Number(b.inUse) - Number(a.inUse)).slice(0, wide ? 5 : 6)
  const shelf: [number, number][] = wide ? vols.map((_, i) => [70 + i * 112, 130]) : vols.map((_, i) => [62 + (i % 3) * 108, i < 3 ? 130 : 214])
  const db = s.containers.db
  const dbAt: [number, number] = wide ? [70, 30] : [62, 30]
  const dataAt = vols.findIndex((v) => v.id === db?.vol)
  const last = run.history[run.history.length - 1]
  const lostTo = last && last.after < last.before ? s.volumes.find((v) => v.kind === 'anon' && !v.inUse && v.rows === last.before) : undefined

  const pick = (m: LabMount) => {
    setMount(m)
    setActions([])
  }

  return (
    <RoughBox className={styles.labPanel} stroke="var(--ink-2)" seed={3609}>
      <div ref={ref}>
      <p className={styles.labTitle}>Što preživljava?</p>
      <p className={styles.labHint}>U bazi je {START_ROWS} narudžbi. Odaberite gdje Postgres drži podatke, pa izvedite naredbe redom i gledajte valjke.</p>
      <div className={styles.labRow}>
        <Segmented label="Podatci baze" size="sm" value={mount} options={MOUNTS} onChange={pick} />
      </div>
      <p className={styles.labOut}>
        <code className={styles.wrap}>{YAML[mount]}</code>
      </p>
      <div style={{ maxWidth: wide ? 640 : 420, margin: '8px auto 0' }}>
        <Diagram width={W} height={H} label={`Postgres: ${MOUNTS.find((m) => m.value === mount)?.label}. U bazi je ${M.dbRows(s) ?? 0} narudžbi, visećih volumena: ${M.danglingCount(s)}.`}>
          <rect x={dbAt[0] - 50} y={dbAt[1]} width={100} height={50} className="k-paper-fill" />
          <FoodBox x={dbAt[0] - 50} y={dbAt[1]} w={100} h={50} seed={3601} tint="var(--ink-4)" label="db" labelSize={mono + 1} />
          <DLabel x={dbAt[0] + 64} y={dbAt[1] + 24} text={db ? `kontejner ${M.cname('db')}` : 'kontejnera nema'} size={hand} anchor="start" bold />
          <DLabel x={dbAt[0] + 64} y={dbAt[1] + 48} text={db ? `u bazi: ${M.dbRows(s) ?? 0} narudžbi` : ''} size={hand} anchor="start" tone={M.dbRows(s) === START_ROWS ? 'ok' : 'bad'} />
          {dataAt >= 0 && <Rough shape={{ k: 'line', x1: dbAt[0], y1: dbAt[1] + 52, x2: shelf[dataAt][0], y2: shelf[dataAt][1] - 4 }} seed={3602} stroke="var(--pen)" strokeWidth={1.6} roughness={0.6} />}
          {vols.map((v, i) => (
            <VolumeThing key={v.id} v={v} at={shelf[i]} w={50} h={44} size={mono} />
          ))}
        </Diagram>
      </div>
      <div className={styles.labRow}>
        {ACTIONS.map((a) => (
          <Button key={a.id} size="sm" onClick={() => setActions((x) => [...x, a.id].slice(-6))} title={a.cmd}>
            {a.label}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => setActions([])} disabled={actions.length === 0}>
          Kreni ispočetka
        </Button>
      </div>
      <p className={styles.labOut} aria-live="polite">
        {last ? (
          <>
            <code className={styles.wrap}>{ACTIONS.find((a) => a.id === last.action)?.cmd}</code>
            <br />
            <span className={last.after === last.before ? styles.statusOk : styles.statusBad}>
              {last.after === last.before ? '✓' : '✗'} {last.before} → {last.after} narudžbi.
            </span>{' '}
            {last.after === last.before
              ? mount === 'bind'
                ? 'Mapa ./pgdata je na računalu; Compose je ne briše ni s -v.'
                : 'Isti volumen, isti podatci.'
              : lostTo
                ? `Novi kontejner dobio je novi, prazan anonimni volumen; stari (${lostTo.label}) visi s ${last.before} narudžbi dok ga ne obrišete.`
                : mount === 'tmpfs'
                  ? 'tmpfs je bio u RAM-u: nestao je čim je kontejner stao.'
                  : 'down -v obrisao je volumen zajedno s podatcima.'}
          </>
        ) : (
          'Još nijedna naredba.'
        )}
      </p>
      </div>
    </RoughBox>
  )
}
