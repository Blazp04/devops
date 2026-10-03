import { useState } from 'react'
import { Button, ControlGroup, EventLog, Goals, Segmented, SimFrame, Stat, StatRow, fmt, plural, useSimulation } from '../../../kit'
import * as K from '../../../engines/cluster'
import { DEFAULT_SEED, apiPods, chaosMonkey, commitFix, createIncident, goals, log, mttr, revertCommit, setHypothesis, stepIncident, totals, WORKER } from '../incident/model'
import { runCommand } from '../incident/console'
import { apiTrace, orderTraceView } from '../incident/trace'
import * as Q from '../../../engines/queue'
import { ArgoBadges, ConsolePanel, HypothesisPanel, IncidentList, RedPanel, RepoPanel, TraceWaterfall } from './IncidentPanels'
import { IncidentStage } from './IncidentStage'
import css from '../styles.module.css'

type Panel = 'metrike' | 'konzola' | 'trag' | 'git'

const PANELS: { value: Panel; label: string }[] = [
  { value: 'metrike', label: 'Metrike' },
  { value: 'konzola', label: 'Konzola' },
  { value: 'trag', label: 'Trag' },
  { value: 'git', label: 'Config repo' },
]

function readSeed(): number {
  try {
    const v = Number(new URLSearchParams(window.location.search).get('incident'))
    return Number.isInteger(v) && v > 0 && v < 1_000_000 ? v : DEFAULT_SEED
  } catch {
    return DEFAULT_SEED
  }
}

function writeSeed(n: number) {
  try {
    const u = new URL(window.location.href)
    u.searchParams.set('incident', String(n))
    window.history.replaceState(window.history.state, '', u)
  } catch {
    /* no URL API: the seed still shows in the subtitle */
  }
}

/** Flagship „Incident u 12:00”: the seed lives in the URL (?incident=…); „Novi incident” remounts the run with a new one. */
export function IncidentSim() {
  const [seed, setSeed] = useState(readSeed)
  return (
    <IncidentRun
      key={seed}
      seed={seed}
      onNew={() => {
        const n = 1000 + Math.floor(Math.random() * 9000)
        writeSeed(n)
        setSeed(n)
      }}
    />
  )
}

function IncidentRun({ seed, onNew }: { seed: number; onNew: () => void }) {
  const sim = useSimulation({ init: () => createIncident(seed), step: (s, dt) => stepIncident(s, dt) })
  const s = sim.state
  const [panel, setPanel] = useState<Panel>('metrike')
  const [traceOf, setTraceOf] = useState<'api' | 'worker'>('api')
  const run = (cmd: string) => sim.mutate((st) => runCommand(st, cmd))
  const g = goals(s)
  const tot = totals(s)
  const lastDone = [...s.incidents].reverse().find((i) => i.resolvedAt !== null)
  const lastMttr = lastDone ? mttr(lastDone) : null
  const failing = s.series.err.at(-1) ?? 0
  const trace = traceOf === 'api' ? apiTrace(s, failing > 1 ? 'failed' : 'latest') : orderTraceView(s)
  const openLogs = (svc: 'api' | 'worker') => {
    if (svc === 'api') {
      const p = apiPods(s).find((x) => !K.isReady(x)) ?? apiPods(s)[0]
      if (p) run(`kubectl logs ${p.name}`)
    } else {
      const w = Q.podViews(s.q, { namePrefix: WORKER })
      const p = w.find((x) => x.ready !== '1/1') ?? w[0]
      if (p) run(`kubectl logs ${p.name}`)
    }
    setPanel('konzola')
  }
  return (
    <SimFrame
      title="Incident u 12:00"
      subtitle={`cijela Klopa · Git + Argo CD, klaster, red poruka · seed ${seed}`}
      sim={sim}
      showTime
      hint="Riješite tri incidenta. Prije svakog popravka zapišite hipotezu, a popravak pošaljite samo commitom u config repozitorij."
      toolbar={<ArgoBadges s={s} />}
      controls={
        <>
          <ControlGroup title="Hipoteza">
            <HypothesisPanel
              s={s}
              onSubmit={(no, cause, signal, lecture) =>
                sim.mutate((st) => {
                  setHypothesis(st, no, { cause, signal, lecture })
                })
              }
            />
          </ControlGroup>
          <ControlGroup title="Pokvarite">
            <div className={css.btnRow}>
              <Button variant="danger" onClick={() => sim.mutate((st) => void chaosMonkey(st))}>
                Kaos majmun
              </Button>
              <Button onClick={onNew}>Novi incident</Button>
            </div>
            <p className={css.small}>Kaos majmun usred ručka ubaci nasumičan kvar. Ručnu promjenu polja iz Gita selfHeal vraća; ostale ručne naredbe ne ostavljaju trag u Gitu.</p>
          </ControlGroup>
        </>
      }
      stats={
        <>
          <StatRow>
            <Stat label="neuspjelih zahtjeva" value={fmt.num(tot.failed)} tone={tot.failed > 0 ? 'bad' : 'ok'} />
            <Stat label="pogođenih studenata" value={fmt.num(tot.users)} tone={tot.users > 0 ? 'bad' : 'ok'} />
            <Stat label="bodovi (manje je bolje)" value={fmt.num(tot.score)} sub="neuspjeli × studenti" />
            <Stat label="MTTR zadnjeg incidenta" value={lastMttr === null ? '–' : `${fmt.num(lastMttr)} s`} sub="od prve greške do oporavka" />
          </StatRow>
          <div className={css.statsGrid}>
            <Goals
              goals={[
                { text: `Riješite tri incidenta (${g.done}/3)`, done: g.three },
                { text: 'Svaki popravak samo commitom', done: g.onlyGit },
                { text: `Za svaki kvar navedite predavanje i signal koji ga je otkrio (${g.namedCount}/3)`, done: g.named },
              ]}
            />
            <EventLog events={s.events} max={8} />
          </div>
        </>
      }
    >
      <IncidentList s={s} />
      <IncidentStage
        s={s}
        onPod={(name) => {
          run(`kubectl describe pod ${name}`)
          setPanel('konzola')
        }}
      />
      <div className={css.panelHead}>
        <Segmented label="Ploča" value={panel} options={PANELS} onChange={setPanel} />
      </div>
      <div className={css.panelArea}>
      {panel === 'metrike' && (
        <RedPanel
          s={s}
          onLogs={openLogs}
          onTrace={(svc) => {
            setTraceOf(svc)
            setPanel('trag')
          }}
        />
      )}
      {panel === 'konzola' && <ConsolePanel s={s} onRun={run} />}
      {panel === 'trag' && (
        <>
          <Segmented
            label="Trag"
            size="sm"
            value={traceOf}
            options={[
              { value: 'api', label: 'zahtjev (HTTP)' },
              { value: 'worker', label: 'narudžba (red)' },
            ]}
            onChange={setTraceOf}
          />
          <TraceWaterfall trace={trace} empty="Još nema praćene narudžbe." />
          <p className={css.small}>{traceOf === 'api' ? (failing > 1 ? 'Prikazan je zadnji neuspjeli zahtjev.' : 'Prikazan je zadnji zahtjev.') : 'Prikazana je zadnja narudžba koju je red pratio.'}</p>
        </>
      )}
      {panel === 'git' && (
        <RepoPanel
          s={s}
          onCommit={(path, set, message) => {
            let out = ''
            sim.mutate((st) => {
              const r = commitFix(st, path, set, message)
              out = r.ok ? `Commit ${r.sha.slice(0, 7)} je u Gitu. Webhook javlja Argo CD-u; pratite sinkronizaciju.` : `Git je odbio commit: ${r.reason}`
              log(st, 'note', `# ${out}`)
            })
            return out
          }}
          onRevert={(sha) => {
            let out = ''
            sim.mutate((st) => {
              const r = revertCommit(st, sha)
              out = r.ok ? `git revert ${sha.slice(0, 7)} → novi commit ${r.sha.slice(0, 7)}.` : `git revert nije uspio: ${r.reason}`
            })
            return out
          }}
        />
      )}
      </div>
      <p className={css.small}>
        Skraćeno vrijeme: progressDeadlineSeconds {K.compressedLabel(K.COMPRESSED.rolloutProgressDeadline)}; readinessProbe.periodSeconds {K.compressedLabel(K.COMPRESSED.rolloutReadinessPeriod)}.
      </p>
      <p className={css.small}>
        Ručak: {plural(Math.round(s.series.rps.at(-1) ?? 0), ['zahtjev', 'zahtjeva', 'zahtjeva'])} u sekundi, {plural(900, ['student', 'studenta', 'studenata'])} naručuje.
      </p>
    </SimFrame>
  )
}
