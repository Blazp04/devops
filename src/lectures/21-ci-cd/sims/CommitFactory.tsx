import { LayoutGroup } from 'motion/react'
import { SimFrame, useSimulation, Button, Toggle, Slider, Segmented, ControlGroup, Goals, Stat, StatRow, Meter, RoughBox, useWidth, fmt, plural } from '../../../kit'
import {
  stepPipeline,
  simNow,
  pipelineBoard,
  mainStatus,
  pipelineGoals,
  dora,
  doraSeries,
  predictLeadTime,
  waitingAtGate,
  streamStatus,
  stepToNextEvent,
  commit,
  revertCommit,
  setPipelineOption,
  setGate,
  approveAll,
  setRebuildForProduction,
  leakCredential,
  revokeCredential,
  setCredential,
  credentialStatus,
  startCommitStream,
  wallClock,
  fmtSeconds,
  DEFECT_LABEL,
  COMMIT_TYPE_LABEL,
  PIPELINE_DT,
  PIPELINE_DEFAULT_SPEED,
  PIPELINE_RECOMMENDED_SPEEDS,
  STATIONS,
  type PipelineState,
  type CredentialKind,
} from '../../../engines/build/index.ts'
import { createFactory, GATE_ORDER, GATE_LABEL, GATE_NOTE, PUSHABLE, STATION_NAME, stationDuration, recentFinished, runOutcome } from '../factory'
import { CommitChip, StationRow, ProdCard, RegistryShelf, CredPanel, FactoryLog } from './FactoryParts'
import css from '../styles.module.css'

/** How long (sim seconds) a failed run stays on its station before it moves to the „Gotovo” shelf. */
const FAIL_LINGER = 90

/**
 * Flagship „Tvornica commitova” on the E4 engine (`createPipeline(PIPELINE_PRESETS.tvornica)`, seed 42):
 * lint → testovi → izgradnja → skeniranje → registar → staging → e2e → [ljudska vrata] → produkcija, with DORA.
 */
export function CommitFactory() {
  const sim = useSimulation({ init: createFactory, step: stepPipeline, fixedDt: PIPELINE_DT, speed: PIPELINE_DEFAULT_SPEED })
  const [ref, w] = useWidth<HTMLDivElement>()
  const wide = w === null || w >= 620
  const s = sim.state
  const now = simNow(s)
  const board = pipelineBoard(s, { at: now, maxPerStation: wide ? 3 : 2, recent: 0 })
  const main = mainStatus(s)
  const goals = pipelineGoals(s)
  const d = dora(s)
  const series = doraSeries(s, 12)
  const pred = predictLeadTime(s)
  const waiting = waitingAtGate(s)
  const stream = streamStatus(s)
  const cred = credentialStatus(s)
  /** Stream commits that reached production (the engine's `deployed` also counts the team's revert deploys). */
  const streamInProd = stream ? s.runs.filter((r) => r.streamIndex !== null && r.createdAt >= stream.startedAt && r.status === 'in-prod').length : 0
  const lingering = s.runs.filter((r) => r.status === 'failed' && r.finishedAt !== null && now - r.finishedAt < FAIL_LINGER)
  const lingerIds = new Set(lingering.map((r) => r.id))
  const done = recentFinished(s, wide ? 6 : 4).filter((r) => !lingerIds.has(r.id))
  const gateIndex = GATE_ORDER.indexOf(s.config.gate)
  const act = (fn: (x: PipelineState) => unknown) => () => sim.mutate((x) => void fn(x))
  const frameSim = { ...sim, stepOnce: undefined }

  const commitButtons = (
    <>
      {PUSHABLE.map((t) => (
        <Button key={t} variant={t === 'ok' ? 'primary' : 'secondary'} size="sm" onClick={act((x) => commit(x, t))}>
          {COMMIT_TYPE_LABEL[t]}
        </Button>
      ))}
      <Button size="sm" disabled={stream !== null && !stream.done} onClick={act((x) => startCommitStream(x))}>
        Pošalji 20 commitova
      </Button>
    </>
  )

  const controls = (
    <>
      {wide && <ControlGroup title="Pošaljite commit">{commitButtons}</ControlGroup>}
      <ControlGroup title="Pipeline (za nove commitove)">
        <Toggle label="Paralelni poslovi" hint="lint i testovi istodobno" checked={s.config.parallelJobs} onChange={(v) => sim.mutate((x) => setPipelineOption(x, 'parallelJobs', v))} />
        <Toggle label="Predmemorija ovisnosti" hint="pip i slojevi slike" checked={s.config.cache} onChange={(v) => sim.mutate((x) => setPipelineOption(x, 'cache', v))} />
        <Toggle label="Preskoči testove" hint="i jedinične i e2e" checked={s.config.skipTests} onChange={(v) => sim.mutate((x) => setPipelineOption(x, 'skipTests', v))} />
      </ControlGroup>
      <ControlGroup title="Ljudska vrata">
        <Slider
          label="Položaj"
          value={gateIndex}
          min={0}
          max={2}
          step={1}
          format={(v) => GATE_LABEL[GATE_ORDER[v] ?? 'delivery']}
          hint={GATE_NOTE[s.config.gate]}
          onChange={(v) => sim.mutate((x) => setGate(x, GATE_ORDER[v] ?? 'delivery'))}
        />
      </ControlGroup>
      <ControlGroup title="Pokvarite">
        <Button variant="danger" size="sm" active={s.rebuildNextProd} onClick={() => sim.mutate((x) => setRebuildForProduction(x, !x.rebuildNextProd))}>
          Ponovno izgradi za produkciju
        </Button>
        <Segmented<CredentialKind>
          label="Vjerodajnica CI-ja"
          size="sm"
          value={s.config.credential}
          options={[
            { value: 'static', label: 'trajni ključ' },
            { value: 'oidc', label: 'OIDC token' },
          ]}
          onChange={(v) => sim.mutate((x) => setCredential(x, v))}
        />
        <Button variant="danger" size="sm" onClick={act((x) => leakCredential(x))}>
          {s.config.credential === 'oidc' ? 'Ukradi OIDC token' : 'Ukradi CI ključ'}
        </Button>
        {cred.attackerHasAccess && s.config.credential === 'static' && (
          <Button variant="success" size="sm" onClick={act(revokeCredential)}>
            Opozovi ključ
          </Button>
        )}
      </ControlGroup>
    </>
  )

  /** One deploy cannot give a rate yet: show „—” until there are two. */
  const freqKnown = d.deployments >= 2 && d.perHour !== null
  const leadTone = d.leadTimeMedianSec === null ? 'neutral' : d.leadTimeMedianSec < 600 ? 'ok' : 'warn'
  const cfr = d.changeFailureRate
  const stats = (
    <div className={css.statsWrap}>
      <p className={css.panelTitle}>Četiri DORA metrike (sat simulacije, trajanja ilustrativna)</p>
      <StatRow>
        <Stat
          label="Učestalost"
          value={freqKnown ? fmt.num(d.perHour as number, 1) : '—'}
          unit={freqKnown ? '/ h' : undefined}
          sub={`postavljanja · ${plural(d.deployments, ['postavljanje', 'postavljanja', 'postavljanja'])}`}
        />
        <Stat label="Do produkcije" value={d.leadTimeMedianSec === null ? '—' : fmtSeconds(d.leadTimeMedianSec)} sub="medijan vremena od commita do produkcije" tone={leadTone} spark={series.leadTimeSec.length > 1 ? series.leadTimeSec : undefined} />
        <Stat
          label="Neuspjele promjene"
          value={cfr === null ? '—' : fmt.pct(cfr)}
          sub={`stopa · ${plural(d.failedDeployments, ['loše postavljanje', 'loša postavljanja', 'loših postavljanja'])}`}
          tone={cfr === null ? 'neutral' : cfr > 0 ? 'bad' : 'ok'}
        />
        <Stat label="Oporavak" value={d.recoveryMedianSec === null ? '—' : fmtSeconds(d.recoveryMedianSec)} sub={d.openIncident ? '✗ incident u tijeku' : 'od neuspjelog postavljanja · medijan'} tone={d.openIncident ? 'bad' : 'neutral'} />
      </StatRow>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px 18px', margin: '12px 0' }}>
        <Stat label="Sljedeći commit (predviđanje)" value={fmtSeconds(pred.seconds)} sub={`${pred.failsAt ? `staje na: ${STATION_NAME[pred.failsAt]}` : pred.cold.reason ?? 'predmemorija je topla'} · ${pred.excludes}`} />
        <Meter value={s.trust} label="Povjerenje u crveni pipeline" valueLabel={fmt.pct(s.trust)} tone={s.trust < 0.5 ? 'bad' : s.trust < 0.85 ? 'warn' : 'ok'} />
      </div>
      <div className={css.statsGrid}>
        <Goals
          goals={[
            { text: 'Od commita do produkcije < 10 min uz sve provjere', done: goals.leadTimeUnder10MinAllChecks },
            { text: '0 loših commitova u produkciji od 20', done: goals.zeroBadOf20 },
            { text: 'Postavite kontinuiranu isporuku pa kontinuirano postavljanje', done: goals.deliveryThenDeployment },
          ]}
        />
        <FactoryLog s={s} />
      </div>
    </div>
  )

  return (
    <SimFrame
      title="Tvornica commitova"
      subtitle="Klopin pipeline za klopa-api. Trajanja su ilustrativna; 1 s stvarnog vremena = 1 min simulacije pri 60×."
      sim={frameSim}
      speeds={[...PIPELINE_RECOMMENDED_SPEEDS]}
      toolbar={
        <Button size="sm" variant="ghost" onClick={act(stepToNextEvent)}>
          Sljedeći događaj
        </Button>
      }
      hint="Odobrite ispravak 2.0.1 na ljudskim vratima. Zatim skratite put do produkcije ispod 10 minuta uz sve provjere i pošaljite 20 commitova tako da nijedan loš ne stigne u produkciju."
      controls={controls}
      stats={stats}
      minHeight={560}
    >
      <div ref={ref} className={css.stage} data-layout={wide ? 'wide' : 'narrow'}>
        <div className={css.topbar}>
          <span className={css.mainStatus}>
            main <code>{main.head ?? '—'}</code>
            {main.red ? <span className={css.mainRed}>✗ crven</span> : <span className={css.mainGreen}>✓ zelen</span>}
          </span>
          <span className={css.clock}>
            sat <strong>{wallClock(s)}</strong>
            <span>· trajanja ilustrativna</span>
          </span>
        </div>
        {main.red && main.cause && (
          <RoughBox className={css.banner} stroke="var(--red)" seed={8601}>
            main je crven – uzrok: {DEFECT_LABEL[main.cause.kind]} iz <code>{main.cause.short}</code>. Dok ga netko ne vrati (<code>git revert</code>), pada i svaki sljedeći commit.
            {s.config.teamRevertAfterSec !== null && <> Kolega ga vraća {fmtSeconds(s.config.teamRevertAfterSec)} nakon pada – ili to učinite sami: </>}{' '}
            <Button variant="success" size="sm" onClick={act((x) => revertCommit(x))}>
              Vrati commit (git revert)
            </Button>
          </RoughBox>
        )}
        {!wide && (
          <div className={css.sendRow} role="group" aria-label="Pošaljite commit">
            {commitButtons}
          </div>
        )}
        {stream && (
          <p className={css.foot} style={{ fontStyle: 'normal' }}>
            Tok commitova: {stream.arrived}/{stream.total} poslano · u produkciji {streamInProd} · loših u produkciji {stream.badInProd} · zaustavljeno{' '}
            {stream.blocked.tests + stream.blocked.scan + stream.blocked.secret + stream.blocked.flaky + stream.blocked.inherited + stream.blocked.other}
            {stream.blocked.superseded > 0 ? ` · otkazano ${stream.blocked.superseded}` : ''}
            {stream.reverts > 0 ? ` · tim vratio (git revert) ${stream.reverts}×` : ''}
            {stream.done ? ' · gotovo' : ''}
          </p>
        )}
        <LayoutGroup id="ci-factory">
          <div className={css.body}>
            <ol className={css.line} aria-label="Pipeline: stanice od linta do produkcije">
              {STATIONS.map((st, i) => {
                const here = board.runs.filter((r) => r.position.station === st.id)
                const failedHere = lingering.filter((r) => r.failedAt === st.id)
                return (
                  <StationRow
                    key={st.id}
                    index={i}
                    name={STATION_NAME[st.id]}
                    duration={stationDuration(s, st.id)}
                    busy={here.some((r) => r.jobs[st.id].status === 'running' || r.jobs[st.id].status === 'waiting')}
                    failed={failedHere.length > 0}
                    last={i === STATIONS.length - 1}
                  >
                    {here.map((r) => {
                      const j = r.jobs[st.id]
                      return <CommitChip key={r.id} run={r} state={j.status === 'waiting' ? 'waiting' : 'running'} progress={j.status === 'running' ? r.position.progress : 0} />
                    })}
                    {failedHere.map((r) => (
                      <CommitChip key={r.id} run={r} state="failed" mark={{ glyph: '✗', tone: 'bad' }} />
                    ))}
                    {board.overflow[st.id] > 0 && <span className={css.overflow}>+{board.overflow[st.id]} u redu</span>}
                    {st.id === 'gate' && waiting.length > 0 && (
                      <Button size="sm" variant="primary" onClick={act(approveAll)}>
                        {waiting.length > 1 ? `Odobri sve (${waiting.length})` : 'Odobri izdanje'}
                      </Button>
                    )}
                  </StationRow>
                )
              })}
            </ol>
            <aside className={css.side}>
              <ProdCard s={s} />
              <RegistryShelf s={s} />
              <CredPanel s={s} />
            </aside>
          </div>
          <div>
            <p className={css.doneTitle}>Gotovo</p>
            <div className={css.done}>
              {done.length === 0 && <span className={css.foot}>Još nijedan commit nije stigao do kraja.</span>}
              {done.map((r) => {
                const o = runOutcome(r, s)
                return (
                  <div key={r.id} className={css.doneItem}>
                    <CommitChip run={r} state="done" mark={{ glyph: o.glyph, tone: o.tone }} />
                    <span className={css.doneText} data-tone={o.tone}>
                      {o.glyph} {o.text}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </LayoutGroup>
      </div>
    </SimFrame>
  )
}
