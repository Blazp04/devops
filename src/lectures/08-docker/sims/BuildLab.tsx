import { useState } from 'react'
import { Reorder, useReducedMotion } from 'motion/react'
import { Hammer } from 'lucide-react'
import { Button, ControlGroup, EventLog, Goals, Legend, Segmented, Select, SimFrame, Stat, StatRow, Toggle, useSimulation } from '../../../kit'
import {
  addCard,
  buildView,
  changeCode,
  changeDeps,
  createBuildLab,
  finishBuild,
  finishPush,
  fmtMB,
  fmtSeconds,
  injectEnvSecret,
  inspectLayer,
  labGoals,
  labMetrics,
  labNow,
  LAB_RECOMMENDED_SPEEDS,
  moveCard,
  moveTag,
  pullOnServer,
  pullView,
  pushImage,
  pushView,
  removeCard,
  removeEnvSecret,
  setCardOrder,
  setDockerignore,
  setMultiStage,
  shortDigest,
  startBuild,
  startPull,
  stepBuildLab,
  type BuildLabState,
  type LabPresetId,
  type ProjectId,
} from '../../../engines/build/index.ts'
import { cardStatuses, insertIndexFor, LAB_START, pendingLabel, stackView, toSimEvents, type StackRow } from '../labView'
import { CardItem, CardTray, LayerInspector, LayerStack, RegistryStrip, Stopwatch } from './LabParts'
import styles from '../styles.module.css'

const PROJECT_OPTIONS: { value: ProjectId; label: string }[] = [
  { value: 'klopa-web', label: 'klopa-web (npm)' },
  { value: 'klopa-api', label: 'klopa-api (pip)' },
]

/**
 * Flagship „Laboratorij predmemorije izgradnje” on the E4 engine (createBuildLab): Dockerfile cards to drag,
 * the layer stack with CACHED / rebuilt, a stopwatch, the .env break-it, and push / tag / pull on two servers.
 * Changing the project or the starting Dockerfile remounts the run (fresh, seeded lab).
 */
export function BuildLab() {
  const [project, setProject] = useState<ProjectId>('klopa-web')
  const [preset, setPreset] = useState<LabPresetId>('laboratorij')
  return (
    <BuildLabRun
      key={preset}
      project={project}
      preset={preset}
      onProject={(p) => {
        setProject(p)
        setPreset(LAB_START[p][0].value)
      }}
      onPreset={setPreset}
    />
  )
}

function BuildLabRun({ project, preset, onProject, onPreset }: { project: ProjectId; preset: LabPresetId; onProject: (p: ProjectId) => void; onPreset: (p: LabPresetId) => void }) {
  const reduce = useReducedMotion()
  const sim = useSimulation<BuildLabState>({ init: () => createBuildLab({ preset, warm: true }), step: stepBuildLab, speed: 4 })
  const [picked, setPicked] = useState<string | null>(null)
  const s = sim.state
  const at = labNow(s)
  const view = buildView(s, { at })
  const building = s.build?.status === 'running'
  const pushing = s.push?.status === 'running'
  const statuses = cardStatuses(s, at)
  const stack = stackView(s, at)
  const m = labMetrics(s)
  const goals = labGoals(s)
  const pv = pushView(s)
  const pulls = pullView(s)
  const pending = pendingLabel(s)
  const web = s.project.id === 'klopa-web'
  const envOn = s.envTrick !== null
  const selectedRow = stack.rows.find((r) => r.key === picked) ?? null
  const image = s.image

  /** Actions that start something timed: make sure the clock runs (under reduced motion: finish at once). */
  const timed = (fn: (x: BuildLabState) => void, finish: (x: BuildLabState) => void) => {
    sim.mutate((x) => {
      fn(x)
      if (reduce) finish(x)
    })
    if (!reduce && !sim.running) sim.play()
  }
  const build = () =>
    timed(
      (x) => void startBuild(x),
      (x) => void finishBuild(x),
    )
  const push = () =>
    timed(
      (x) => void pushImage(x),
      (x) => void finishPush(x),
    )
  const pull = (id: string) =>
    reduce
      ? sim.mutate((x) => void pullOnServer(x, id, 'latest'))
      : timed(
          (x) => void startPull(x, id, 'latest'),
          () => undefined,
        )
  const pick = (row: StackRow) => {
    setPicked(row.key)
    sim.mutate((x) => {
      for (const i of row.layerIdx) inspectLayer(x, i)
    })
  }
  const addFromTray = (id: string) =>
    sim.mutate((x) => {
      const c = x.tray.find((t) => t.id === id)
      if (c) addCard(x, id, insertIndexFor(x, c))
    })

  const firstFrom = s.cards.findIndex((c) => c.kind === 'FROM')
  const ids = s.cards.map((c) => c.id)
  const stale = m.imageStale && !building
  const lastCode = m.lastCodeRebuildSeconds

  return (
    <SimFrame
      title="Laboratorij predmemorije izgradnje"
      subtitle={
        web
          ? 'klopa-web: TypeScript, npm i Vite, poslužuje ga nginx. Vremena i veličine su ilustrativni, a pravila predmemorije su BuildKitova.'
          : 'klopa-api: Python, Django i gunicorn. Vremena i veličine su ilustrativni, a pravila predmemorije su BuildKitova.'
      }
      sim={sim}
      speeds={[...LAB_RECOMMENDED_SPEEDS]}
      hint="presložite kartice tako da izgradnja nakon „Promijeni kod” traje manje od 5 s, pa riješite i ostale zadatke ispod."
      minHeight={520}
      controls={
        <>
          <ControlGroup title="Projekt">
            <Segmented label="Aplikacija" value={project} options={PROJECT_OPTIONS} onChange={onProject} size="sm" />
            <Select label="Početni Dockerfile" value={preset} options={LAB_START[project]} onChange={onPreset} />
          </ControlGroup>
          <ControlGroup title="Izvorni kod">
            <div className={styles.ctlRow}>
              <Button onClick={() => sim.mutate((x) => changeCode(x))}>Promijeni kod</Button>
              <Button onClick={() => sim.mutate((x) => changeDeps(x))}>Promijeni ovisnosti</Button>
            </div>
            <Button variant="primary" icon={Hammer} onClick={build} disabled={building}>
              {building ? 'Gradi se…' : 'Izgradi'}
            </Button>
          </ControlGroup>
          <ControlGroup title="Dockerfile">
            <Toggle label=".dockerignore" checked={s.context.dockerignore} onChange={(v) => sim.mutate((x) => setDockerignore(x, v))} hint={`kontekst izgradnje: ${fmtMB(m.contextSizeMB)}`} />
            {web && <Toggle label="Višefazna izgradnja" checked={s.multiStage} onChange={(v) => sim.mutate((x) => setMultiStage(x, v))} hint="faza build + nginx za posluživanje" />}
            {envOn ? (
              <Button variant="success" onClick={() => sim.mutate((x) => void removeEnvSecret(x))}>
                Makni .env iz Dockerfilea
              </Button>
            ) : (
              <Button variant="danger" onClick={() => sim.mutate((x) => void injectEnvSecret(x))}>
                Kopiraj .env pa ga obriši
              </Button>
            )}
          </ControlGroup>
          <ControlGroup title="Registar i poslužitelji">
            <div className={styles.ctlRow}>
              <Button onClick={push} disabled={!s.image || pushing}>
                Pošalji u registar
              </Button>
              <Button onClick={() => sim.mutate((x) => void moveTag(x))} disabled={!s.image || s.registry.tags.size === 0}>
                Pomakni latest na novu sliku
              </Button>
            </div>
            <div className={styles.ctlRow}>
              <Button size="sm" onClick={() => pull('a')} disabled={s.registry.tags.size === 0}>
                Pokreni latest na A
              </Button>
              <Button size="sm" onClick={() => pull('b')} disabled={s.registry.tags.size === 0}>
                Pokreni latest na B
              </Button>
            </div>
          </ControlGroup>
        </>
      }
      stats={
        <>
          <StatRow>
            <Stat label="Izgradnja" value={view ? fmtSeconds(view.elapsed) : '—'} sub={view ? `#${view.id} · ilustrativno` : 'ilustrativno'} tone={view && view.total >= 30 ? 'warn' : 'neutral'} />
            <Stat label="Nakon promjene koda" value={lastCode === null ? '—' : fmtSeconds(lastCode)} sub="zadatak: < 5 s" tone={lastCode === null ? 'neutral' : lastCode < 5 ? 'ok' : 'bad'} />
            <Stat
              label="Slika"
              value={m.imageSizeMB === null ? '—' : fmtMB(m.imageSizeMB)}
              sub={m.devDepsMB ? `razvojni alati: ${fmtMB(m.devDepsMB)}` : 'bez razvojnih alata'}
              tone={m.imageSizeMB === null ? 'neutral' : m.imageSizeMB < 200 ? 'ok' : m.imageSizeMB > 1000 ? 'bad' : 'warn'}
            />
            <Stat label="Kontekst izgradnje" value={fmtMB(m.contextSizeMB)} sub={s.context.dockerignore ? 's .dockerignore' : 'bez .dockerignore'} tone={m.contextSizeMB > 100 ? 'warn' : 'neutral'} />
            <Stat label="Korisnik u slici" value={m.user ?? '—'} sub={m.nonRoot === null ? '' : m.nonRoot ? 'nije root ✓' : 'root ✗'} tone={m.nonRoot === null ? 'neutral' : m.nonRoot ? 'ok' : 'bad'} />
          </StatRow>
          <div className={styles.statsGrid}>
            <Goals
              goals={[
                { text: 'Ponovna izgradnja nakon promjene koda < 5 s', done: goals.rebuildUnder5s },
                { text: 'Slika < 200 MB', done: goals.imageUnder200MB },
                { text: 'Pronađite ključ u slici', done: goals.foundKey },
                { text: 'Slika radi kao korisnik koji nije root', done: goals.nonRoot },
              ]}
            />
            <EventLog events={toSimEvents(s.events)} />
          </div>
        </>
      }
    >
      <div className={styles.lab}>
        <div className={styles.cols}>
          <div>
            <div className={styles.colHead}>
              <span className={styles.colTitle}>Dockerfile</span>
              <span className={styles.colSub}>čita se odozgo; povucite karticu za ⋮⋮</span>
            </div>
            <Reorder.Group axis="y" values={ids} onReorder={(next) => sim.mutate((x) => setCardOrder(x, next))} className={styles.cards} as="ol">
              {s.cards.map((c, i) => (
                <CardItem
                  key={c.id}
                  card={c}
                  index={i}
                  total={s.cards.length}
                  stageBreak={c.kind === 'FROM' && i > firstFrom}
                  status={statuses.get(c.id) ?? { kind: 'idle', duration: 0, elapsed: 0, progress: 0, reason: null }}
                  onMove={(to) => sim.mutate((x) => void moveCard(x, c.id, to))}
                  onRemove={() => sim.mutate((x) => void removeCard(x, c.id))}
                />
              ))}
            </Reorder.Group>
            {pending && (
              <p className={styles.pending}>
                <b>!</b> čeka sljedeću izgradnju: {pending}
              </p>
            )}
            <CardTray cards={s.tray} onAdd={addFromTray} />
          </div>
          <div>
            <div className={styles.colHead}>
              <span className={styles.colTitle}>Slika</span>
              <span className={styles.colSub}>slojevi odozdo prema gore · kliknite sloj</span>
            </div>
            {/* narrow sheets: the controls sit far below the stage, so the two buttons of the main loop are repeated here */}
            <div className={styles.quick} role="group" aria-label="Brze radnje">
              <Button size="sm" onClick={() => sim.mutate((x) => changeCode(x))}>
                Promijeni kod
              </Button>
              <Button size="sm" variant="primary" icon={Hammer} onClick={build} disabled={building}>
                {building ? 'Gradi se…' : 'Izgradi'}
              </Button>
            </div>
            <Stopwatch elapsed={view ? view.elapsed : null} total={view ? view.total : null} running={building} />
            {s.image && (
              <p className={styles.imageHead}>
                <b>{s.project.repo}</b> · {fmtMB(s.image.sizeMB)} · {shortDigest(s.image.digest, 12)}
                {stale ? ' · starija od koda' : ''}
              </p>
            )}
            <Legend
              items={[
                { color: 'var(--hl-blue-ink)', label: 'iz predmemorije (CACHED)', shape: 'square' },
                { color: 'var(--hl-green-ink)', label: 'izgrađen sada', shape: 'square' },
                { color: 'var(--hl-orange-ink)', label: 'gradi se', shape: 'line' },
              ]}
            />
            <LayerStack view={stack} selected={selectedRow?.key ?? null} onPick={pick} />
            {selectedRow && image && stack.inspectable && <LayerInspector row={selectedRow} layers={selectedRow.layerIdx.map((i) => image.layers[i]).filter(Boolean)} />}
          </div>
        </div>
        <RegistryStrip
          s={s}
          push={pv && s.push ? { status: pv.status, elapsed: pv.elapsed, total: pv.total, uploaded: pv.layers.filter((l) => !l.exists).length, existed: pv.layers.filter((l) => l.exists).length } : null}
          pulls={pulls.map((p) => ({ serverId: p.serverId, status: p.status, elapsed: p.elapsed, total: p.total }))}
        />
      </div>
    </SimFrame>
  )
}
