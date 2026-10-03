/**
 * Flagship: „Kontrolna ploča uvođenja” on the E3 engine (presetRollout, seed 42). The student edits a draft of
 * deployment.yaml and applies it (kubectl apply); rollout pause / undo / undo --to-revision and deleting the
 * Deployment go straight to the engine. Goals are measured from the engine's own rollout records.
 */
import {
  Button,
  ControlGroup,
  EventLog,
  Goals,
  Segmented,
  Select,
  SimFrame,
  Slider,
  Stat,
  StatRow,
  Toggle,
  fmt,
  useSimulation,
  useWidth,
} from '../../../kit'
import { COMPRESSED, deleteDeploymentByName, findDeployment, pauseDeployment, requestStats, undoRollout } from '../../../engines/cluster'
import { activeRows, boardLabel, boardModel } from '../lib/board'
import { appliedDraft, applyDraft, createBoard, draftDiff, draftError, INCIDENT_APPLY_AT, markUndo, observe, sameDraft, SEED, stepBoard, type BoardSim, type Draft, type PresetId } from '../lib/flagship'
import { boardGeo, boardRows, podPositions, WIDE_MIN } from '../lib/layout'
import { FENCE_SEG, IMAGE_OPTIONS, fenceKey, parseFence, secs } from '../lib/options'
import { responseStrip, traysFor } from '../lib/traffic'
import { BoardStage } from './BoardStage'
import { HistoryList } from './HistoryList'
import styles from '../styles.module.css'

interface FlagshipState extends BoardSim {
  draft: Draft
  out: { ok: boolean; text: string } | null
  toRev: string
  /** most ReplicaSet rows seen since the last reset: the stage keeps that height instead of jumping */
  rowsSeen: number
}

function init(preset: PresetId): FlagshipState {
  const b = createBoard(preset)
  const applied = appliedDraft(b.c)!
  return { ...b, draft: preset === 'incident' ? { ...applied, image: '1.4.0', strategy: 'Recreate' } : applied, out: null, toRev: '', rowsSeen: 2 }
}

function step(st: FlagshipState, dt: number): void {
  stepBoard(st, dt)
  st.rowsSeen = Math.max(st.rowsSeen, activeRows(boardModel(st.c)).length)
}

export function RolloutBoard() {
  const sim = useSimulation<FlagshipState>({
    init: () => init('start'),
    step,
  })
  const st = sim.state
  const c = st.c
  const [ref, width] = useWidth<HTMLDivElement>()
  const layout = width !== null && width >= WIDE_MIN ? 'wide' : 'narrow'
  const b = boardModel(c)
  // two ReplicaSet rows (old + new); a third once a rollover kept three alive (and from then on, so nothing jumps)
  const rowSlots = Math.max(2, Math.min(3, Math.max(st.rowsSeen, activeRows(b).length)))
  const geo = boardGeo(layout, rowSlots)
  const { rows } = boardRows(b, geo.rows.length)
  const trays = traysFor(c, geo, podPositions(rows, geo, b.orphans))
  const strip = responseStrip(c, 40)
  const req = requestStats(c, 10)
  const cluster = appliedDraft(c)
  const diff = draftDiff(st.draft, cluster)
  const dirty = !sameDraft(st.draft, cluster)
  const err = draftError(st.draft)
  const ro = findDeployment(c, 'klopa-api')?.rollout ?? null
  const revs = b.history.filter((h) => !h.current)
  // the picked revision may have vanished (undo renumbers it): fall back to the newest one still listed
  const pick = revs.some((h) => String(h.revision) === st.toRev) ? st.toRev : revs.length ? String(revs[revs.length - 1].revision) : ''

  const edit = (patch: Partial<Draft>) => sim.mutate((s) => Object.assign(s.draft, patch))
  const run = (fn: (s: FlagshipState) => { ok: boolean; message: string }) =>
    sim.mutate((s) => {
      const r = fn(s)
      s.out = { ok: r.ok, text: r.message }
      s.toRev = ''
      observe(s)
    })
  const loadPreset = (p: PresetId) => {
    sim.mutate((s) => {
      Object.assign(s, init(p))
    })
    sim.play()
  }

  const progressing = b.progressing.reason
  // „završeno” only when the rollout itself is complete (the condition's reason can be stale, e.g. at a Recreate start)
  const stalled = progressing === 'ProgressDeadlineExceeded'
  const done = !!ro && ro.completedAt !== null && !stalled
  const progressTone = !b.exists || !ro ? 'neutral' : stalled ? 'bad' : done ? 'ok' : 'warn'
  const progressWord = !b.exists ? '–' : b.paused ? 'pauzirano' : !ro ? '–' : stalled ? '✗ zastoj' : done ? '✓ završeno' : 'u tijeku'
  const progressSub = !b.exists ? 'nema Deploymenta' : !ro ? 'početno stanje, bez uvođenja' : progressing ? `Progressing: ${progressing}` : 'u tijeku'
  const roFailed = ro ? ro.requests.failed : 0
  const by = ro?.requests.byOutcome
  const failSplit = by
    ? [
        by.noEndpoints ? `nitko ne prima ${by.noEndpoints}` : '',
        by.refused ? `odbijeno ${by.refused}` : '',
        by.http503 ? `503: ${by.http503}` : '',
        by.timeout ? `istek ${by.timeout}` : '',
        by.http500 ? `500: ${by.http500}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : ''
  const availTone = !b.exists || b.available === 0 || b.available < b.minAvailable ? 'bad' : b.available < b.replicas ? 'warn' : 'ok'

  return (
    <SimFrame
      title="Kontrolna ploča uvođenja"
      subtitle="Deployment klopa-api: četiri replike, 20 zahtjeva u sekundi i vaša datoteka deployment.yaml."
      sim={sim}
      toolbar={<span className={`${styles.chip} mono`}>{`t = ${fmt.num(c.t, 1)} s`}</span>}
      hint="Uvedite 1.4.0 bez neuspjelih zahtjeva, zatim pokvarite uvođenje s 1.5.0 i oporavite se."
      minHeight={420}
      controls={
        <>
          <ControlGroup title="deployment.yaml (vaša datoteka)">
            <Segmented label="Slika (image)" value={st.draft.image} options={IMAGE_OPTIONS} onChange={(v) => edit({ image: v })} size="sm" />
            <Slider label="replicas" value={st.draft.replicas} min={1} max={10} onChange={(v) => edit({ replicas: v })} />
            <Segmented
              label="Strategija"
              value={st.draft.strategy}
              options={[
                { value: 'RollingUpdate', label: 'RollingUpdate' },
                { value: 'Recreate', label: 'Recreate' },
              ]}
              onChange={(v) => edit({ strategy: v })}
              size="sm"
            />
            {st.draft.strategy === 'RollingUpdate' && (
              <>
                <Segmented label="maxSurge" value={fenceKey(st.draft.maxSurge)} options={FENCE_SEG} onChange={(v) => edit({ maxSurge: parseFence(v) })} size="sm" />
                <Segmented label="maxUnavailable" value={fenceKey(st.draft.maxUnavailable)} options={FENCE_SEG} onChange={(v) => edit({ maxUnavailable: parseFence(v) })} size="sm" />
              </>
            )}
            <Toggle label="Provjera spremnosti" hint="readinessProbe na /ready" checked={st.draft.readiness} onChange={(v) => edit({ readiness: v })} />
            {err && <p className={styles.err}>✗ {err}</p>}
            <Button variant="primary" disabled={!dirty || !!err} onClick={() => run((s) => applyDraft(s.c, s.draft))} title="kubectl apply -f deployment.yaml">
              Primijeni
            </Button>
            {dirty && !err && cluster && <p className={styles.small}>Datoteka i klaster razlikuju se u: {diff.join(', ')}.</p>}
          </ControlGroup>
          <ControlGroup title="kubectl rollout">
            <div className={styles.btnRow}>
              <Button disabled={!b.exists} onClick={() => run((s) => pauseDeployment(s.c, 'klopa-api', !b.paused))} title={b.paused ? 'kubectl rollout resume – nastavlja uvođenje' : 'kubectl rollout pause – pauzira uvođenje, ne simulaciju'}>
                {b.paused ? 'Nastavi uvođenje' : 'Pauziraj uvođenje'}
              </Button>
              <Button
                variant="success"
                disabled={!b.exists}
                onClick={() =>
                  run((s) => {
                    markUndo(s)
                    return undoRollout(s.c, 'klopa-api')
                  })
                }
              >
                rollout undo
              </Button>
            </div>
            {revs.length > 0 && (
              <div className={styles.btnRow}>
                <Select
                  label="Revizija"
                  value={pick}
                  options={revs.map((h) => ({ value: String(h.revision), label: `${h.revision} · ${h.version}` }))}
                  onChange={(v) =>
                    sim.mutate((s) => {
                      s.toRev = v
                    })
                  }
                />
                <Button
                  onClick={() =>
                    run((s) => {
                      markUndo(s)
                      return undoRollout(s.c, 'klopa-api', Number(pick))
                    })
                  }
                >
                  Vrati na reviziju {pick}
                </Button>
              </div>
            )}
          </ControlGroup>
          <ControlGroup title="Pokvarite i probajte ponovno">
            <Button variant="danger" disabled={!b.exists} onClick={() => run((s) => deleteDeploymentByName(s.c, 'klopa-api'))}>
              Obriši Deployment
            </Button>
            <Button onClick={() => loadPreset('incident')} title={`Recreate, 1.3.2 → 1.4.0 nakon ${INCIDENT_APPLY_AT} s, seed ${SEED}`}>
              Incident 13: Davorov plan
            </Button>
            <Button variant="ghost" onClick={() => loadPreset('start')}>
              Kreni ispočetka
            </Button>
          </ControlGroup>
          {st.out && (
            <p className={`${styles.kubectl} k-card k-pinned mono`} role="status">
              <span aria-hidden="true">$ </span>
              {st.out.ok ? '' : '✗ '}
              {st.out.text}
            </p>
          )}
        </>
      }
      stats={
        <>
          <StatRow>
            <Stat label="Dostupno" value={`${b.available}/${b.replicas}`} sub={!b.exists ? 'nema Deploymenta' : b.strategy === 'Recreate' ? 'Recreate: bez ograde' : `ograda ≥ ${b.minAvailable}`} tone={availTone} />
            <Stat label="Podova" value={b.total} sub={`ograda ≤ ${b.maxTotal} · u gašenju ${b.terminating}`} />
            <Stat label="Greške (10 s)" value={fmt.pct(req.errorRate, 1)} tone={req.errorRate > 0 ? 'bad' : 'ok'} sub={`zadano 20/s · izmjereno ${fmt.num(req.rps, 0)}/s`} />
            {b.exists ? (
              <Stat label="Neuspjelih" value={ro ? roFailed : '–'} sub={!ro ? 'još nije bilo uvođenja' : failSplit ? `u ovom uvođenju: ${failSplit}` : `u ovom uvođenju · ${ro.requests.ok} uspješnih`} tone={roFailed > 0 ? 'bad' : 'ok'} />
            ) : (
              <Stat label="Neuspjelih (10 s)" value={req.total - req.ok} sub="Deployment je obrisan" tone={req.total - req.ok > 0 ? 'bad' : 'neutral'} />
            )}
            <Stat label="Nitko ne odgovara" value={secs(st.noPodS)} tone={st.noPodS > 0 ? 'bad' : 'neutral'} sub="nijedan Pod ne prima promet" />
            <Stat label="Uvođenje" value={progressWord} tone={progressTone} sub={progressSub} />
          </StatRow>
          <div className={styles.statsGrid}>
            <Goals
              goals={[
                { text: 'Uvedite 1.4.0 (s 1.3.2) bez ijednog neuspjelog zahtjeva.', done: st.goals.clean },
                { text: 'Uvedite novu verziju s četiri replike tako da nikad ne bude manje od 4 dostupna Poda.', done: st.goals.neverBelow },
                { text: `Oporavite se od 1.5.0 u manje od 30 s simuliranog vremena, računajući od primjene 1.5.0${st.recoverS !== null ? ` (${secs(st.recoverS)})` : ''}.`, done: st.goals.recover },
              ]}
            />
            <EventLog events={c.events.slice(-20).map((e) => ({ id: e.id, t: e.t, text: e.text, tone: e.tone }))} />
          </div>
        </>
      }
    >
      <div ref={ref} style={{ marginBottom: 'auto' }}>
        <BoardStage
          b={b}
          layout={layout}
          lane
          rowSlots={rowSlots}
          rps={20}
          trays={trays}
          strip={strip}
          label={boardLabel(b, rows)}
        />
        <HistoryList history={b.history} />
        <p className={styles.small}>
          <span className={`${styles.chip} mono`}>readinessProbe: {COMPRESSED.rolloutReadinessPeriod.label}</span> <span className={`${styles.chip} mono`}>progressDeadlineSeconds: {COMPRESSED.rolloutProgressDeadline.label}</span> Promet do Podova ovdje vodi Service – njega upoznajemo u sljedećem predavanju.
        </p>
      </div>
    </SimFrame>
  )
}
