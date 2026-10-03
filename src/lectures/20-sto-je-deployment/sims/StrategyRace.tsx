import { useState } from 'react'
import { Badge, Button, ControlGroup, Diagram, EventLog, Goals, LineChart, Segmented, Select, SimFrame, Slider, plural, useSimulation, useWidth } from '../../../kit'
import { COMPRESSED } from '../../../engines/cluster'
import { DEFAULT_PARAMS, SERIES_S, START_AT, createRace, laneStats, raceLog, raceTime, rebuildRace, rollbackLane, stepRace, type CanaryMode, type LaneKey, type RaceParams, type StepPlan } from '../lib/race'
import { LANE_COLOR, dec, laneChips, laneHow, laneHowText, laneTitle, phaseLabel } from '../lib/labels'
import { GEOM, type RouterKind } from '../lib/lane-view'
import { LaneDrawing } from './LaneDrawing'
import styles from '../styles.module.css'

const ROUTER: Record<LaneKey, (c: CanaryMode) => RouterKind> = {
  recreate: () => 'service',
  rolling: () => 'service',
  'blue-green': () => 'selector',
  canary: (c) => (c === 'weights' ? 'gateway' : 'service'),
}

const STUDENT: [string, string, string] = ['student', 'studenta', 'studenata']

const PLAN_OPTIONS:{ value: StepPlan; label: string }[] = [
  { value: 'std', label: '5 → 25 → 50 → 100 %' },
  { value: 'fine', label: '1 → 5 → 25 → 100 %' },
  { value: 'coarse', label: '20 → 50 → 100 %' },
]

function clock(t: number): string {
  const d = t - START_AT
  if (d < 0) return `uvođenje za ${Math.ceil(-d)} s`
  const s = Math.floor(d)
  return `od početka uvođenja ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Flagship „Četiri strategije, isti bug": four lanes on identical seeded traffic (engine E3, presetRelease, seed 42),
 * the same 2.0.0 with a VAT bug, the release starting in every lane at 3 s.
 */
export function StrategyRace() {
  const [params, setParams] = useState<RaceParams>(DEFAULT_PARAMS)
  const sim = useSimulation({ init: () => createRace(params), step: (r, dt) => stepRace(r, dt), speed: 2 })
  const r = sim.state
  const [wrapRef, width] = useWidth<HTMLDivElement>()
  const layout = (width ?? 0) >= 520 ? 'wide' : 'narrow'
  const g = GEOM[layout]
  const t = raceTime(r)

  const change = (next: RaceParams, why: string) => {
    setParams(next)
    sim.mutate((x) => rebuildRace(x, next, why))
  }

  const rows = r.lanes.map((lane) => {
    const st = laneStats(lane)
    return { lane, st, ph: phaseLabel(lane, st, r.params.bugPct), chips: laneChips(lane, st, r.params.thresholdPct), title: laneTitle(lane.key, r.params.canary) }
  })
  const series = rows.map(({ lane, title }) => ({ label: title, values: lane.hit.values, color: LANE_COLOR[lane.key] }))

  return (
    <SimFrame
      title="Četiri strategije, isti bug"
      subtitle={`1000 studenata · 20 narudžbi/s · seed 42 · 2.0.0 kreće u ${START_AT}. sekundi u svim trakama`}
      sim={sim}
      speeds={[1, 2, 4]}
      toolbar={<Badge tone="neutral">{clock(t)}</Badge>}
      hint="Pratite koliko studenata u svakoj traci dobije krivi račun, a koliko ostane bez odgovora. Zatim pokušajte proći s manje od 15 krivih računa, a da nitko ne pritisne „Vrati”."
      controls={
        <>
          <Slider
            label="Udio zahtjeva s greškom"
            value={params.bugPct}
            min={0}
            max={100}
            step={5}
            format={(v) => `${v} %`}
            onChange={(v) => change({ ...params, bugPct: v }, `Greška u ${v} % narudžbi`)}
          />
          <Segmented<CanaryMode>
            label="Canary dijeli promet"
            value={params.canary}
            options={[
              { value: 'replicas', label: 'po replikama' },
              { value: 'weights', label: 'po težinama' },
            ]}
            onChange={(v) => change({ ...params, canary: v }, v === 'weights' ? 'Canary po težinama HTTPRoutea' : 'Canary po broju Podova')}
          />
          <Button variant="danger" active={params.hidden} onClick={() => change({ ...params, hidden: !params.hidden }, params.hidden ? 'Analiza opet mjeri udio krivih računa' : 'Analiza gleda samo HTTP 5xx: krivi PDV vraća 200 OK i analiza ga ne vidi')}>
            Sakrij grešku od analize
          </Button>
          <ControlGroup title="Koraci i prag analize" collapsible>
            <Select<StepPlan> label="Koraci canaryja" value={params.plan} options={PLAN_OPTIONS} onChange={(v) => change({ ...params, plan: v }, `Koraci ${PLAN_OPTIONS.find((o) => o.value === v)?.label}`)} />
            <Slider
              label="Prag prekida"
              value={params.thresholdPct}
              min={0.5}
              max={10}
              step={0.5}
              format={(v) => `${dec(v)} %`}
              onChange={(v) => change({ ...params, thresholdPct: v }, `Prag analize ${dec(v)} %`)}
            />
          </ControlGroup>
          <p className={styles.controlNote}>
            Zadano analiza mjeri poslovnu metriku: udio narudžbi 2.0.0 s krivim PDV-om. „Sakrij grešku od analize” znači da analiza gleda samo HTTP 5xx, a krivi PDV vraća <code>200 OK</code>.
          </p>
          <p className={styles.controlNote}>Promjena postavki pokreće utrku ispočetka: isti seed, isti studenti.</p>
          <p className={styles.controlNote}>
            Korak canaryja traje 30 s (sim), u stvarnosti obično nekoliko minuta. Spremnost: {COMPRESSED.rolloutReadinessPeriod.label}.
          </p>
        </>
      }
      stats={
        <div className={styles.statsStack}>
          {layout === 'wide' && (
            <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Usporedba traka">
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Traka</th>
                    {rows[0].chips.slice(0, 6).map((c) => (
                      <th key={c.label} scope="col">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ lane, chips, title }) => (
                    <tr key={lane.key}>
                      <td>
                        <span className={styles.laneSwatch} style={{ background: LANE_COLOR[lane.key] }} aria-hidden="true" /> {title}
                      </td>
                      {chips.slice(0, 6).map((c) => (
                        <td key={c.label} className={`${styles.cell} ${styles[`cell_${c.tone}`]}`}>
                          <span>{c.value}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <LineChart series={series} window={SERIES_S} height={150} yLabel="studenata s krivim računom (PDV)" xLabel="sekunde (sim)" />
          <div className={styles.statsGrid}>
            <Goals
              goals={[
                { text: 'Uvedite 2.0.0 tako da krivi račun dobije manje od 15 studenata, bez ručnog vraćanja (greška barem 20 %).', done: r.goals.fewUsers },
                { text: 'Uz „Sakrij grešku od analize” vratite canary prije nego što 2.0.0 vidi 10 % studenata.', done: r.goals.hiddenEarly },
                { text: 'Nakon prebacivanja vratite plavo-zelenu traku za manje od 5 s.', done: r.goals.bgFast },
              ]}
            />
            <EventLog events={raceLog(r)} max={7} />
          </div>
        </div>
      }
    >
      <div ref={wrapRef} className={styles.lanes}>
        {rows.map(({ lane, st, ph, chips, title }) => {
          const can = st.phase !== 'idle' && st.phase !== 'rolled-back' && st.phase !== 'aborted'
          const how = laneHow(lane.key, r.params.canary)
          const vat = lane.vat.size
          const noAnswer = lane.noAnswer.size
          return (
            <div key={lane.key} className={styles.lane}>
              <div className={styles.laneHead}>
                <span className={styles.laneSwatch} style={{ background: LANE_COLOR[lane.key] }} aria-hidden="true" />
                <span className={styles.laneName}>{title}</span>
                <span className={styles.laneHow}>
                  {how.text}
                  {how.code && <code>{how.code}</code>}
                </span>
              </div>
              <div className={styles.laneBar}>
                <span className={`${styles.hitChip} ${vat > 0 ? styles.hitBad : ''}`}>
                  {vat > 0 ? '✗' : '✓'} {vat} <span>{plural(vat, STUDENT, false)} s krivim PDV-om</span>
                </span>
                {noAnswer > 0 && (
                  <span className={`${styles.hitChip} ${styles.hitBad}`}>
                    ✗ {noAnswer} <span>{plural(noAnswer, STUDENT, false)} bez odgovora</span>
                  </span>
                )}
                <Badge tone={ph.tone}>{ph.text}</Badge>
                <Button size="sm" variant="success" disabled={!can} onClick={() => sim.mutate((x) => rollbackLane(x, lane.key))} title={`Vrati traku ${title} na 1.4.1`}>
                  Vrati<span className="visually-hidden"> traku {title}</span>
                </Button>
              </div>
              <div className={styles.laneArt} style={layout === 'narrow' ? { maxWidth: 460 } : undefined}>
                <Diagram width={g.w} height={g.h} label={`Traka ${title}: ${laneHowText(lane.key, r.params.canary)}. Gore Podovi 1.4.1, dolje Podovi 2.0.0; pladnjevi su zahtjevi, crveni s ✗ su narudžbe s greškom.`}>
                  <LaneDrawing s={lane.s} layout={layout} router={ROUTER[lane.key](r.params.canary)} />
                </Diagram>
              </div>
              {(layout === 'narrow' || chips.length > 6) && (
                <dl className={styles.chips}>
                  {(layout === 'narrow' ? chips : chips.slice(6)).map((c) => (
                    <div key={c.label} className={`${styles.chip} ${styles[`chip_${c.tone}`]}`}>
                      <dt>{c.label}</dt>
                      <dd>{c.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )
        })}
      </div>
    </SimFrame>
  )
}
