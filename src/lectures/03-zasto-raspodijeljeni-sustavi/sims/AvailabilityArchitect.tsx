/**
 * Flagship „Arhitekt dostupnosti”: build Klopa as a chain (ulaz → poslužitelji aplikacije × N → baza), set availability,
 * rack, capacity and detection time, then run a seeded „godina u 10 sekundi” on the E1 engine (availability.ts).
 * The formula, the simulated year and the 100-year average sit side by side; the calendar shows every lost lunch.
 */
import { useDeferredValue, useMemo, useState } from 'react'
import { Play, Plug, Shuffle, Wrench } from 'lucide-react'
import { Button, ControlGroup, EventLog, Goals, Segmented, SimFrame, Slider, Stat, StatRow, Toggle, plural, useSimulation, useWidth } from '../../../kit'
import {
  AVAIL_STEPS,
  BUDGET_EUR,
  DETECTION_STEPS,
  MTTR_STEPS,
  PRESETS,
  armRackFailure,
  averageYears,
  breakConfig,
  costsOf,
  createArchSim,
  fmtEur,
  fmtHours,
  formulasOf,
  logArch,
  mergedEvents,
  num,
  pctA,
  stepArch,
  stepIndex,
  survivorLoad,
  yearReport,
  type ArchSim,
  type Architecture,
  type PresetId,
} from '../model'
import { ArchChain, CauseBars, FormulaStrip, YearCalendar } from './archParts'
import styles from '../styles.module.css'

const availLabel = (i: number) => pctA(AVAIL_STEPS[i])

export function AvailabilityArchitect() {
  const [arch, setArch] = useState<Architecture>(PRESETS.dva.arch)
  const [preset, setPreset] = useState<PresetId | 'vlastito'>('dva')
  const [stageRef, stageW] = useWidth<HTMLDivElement>()
  const [causeRef, causeW] = useWidth<HTMLDivElement>()
  // the sheet is as wide as the stats under it: from 860 px the controls stand beside the stage (SimFrame's rule)
  const [statsRef, statsW] = useWidth<HTMLDivElement>()
  const besideControls = (statsW ?? 0) >= 860

  const sim = useSimulation<ArchSim>({
    init: () => createArchSim(arch),
    step: (s, dt) => stepArch(s, dt),
    // the year starts when the reader presses „Pokreni godinu” (after the prediction above), not on scroll
    autoStart: false,
  })

  // the 100-year average is ~40 ms: compute it for the deferred architecture so sliders stay smooth
  const deferred = useDeferredValue(arch)
  const avg = useMemo(() => averageYears(deferred), [deferred])
  const formulas = useMemo(() => formulasOf(arch), [arch])

  // a new year keeps the goals and an armed „Kvar ormara u podne” (it is re-armed for the new year's first lunch)
  const freshYear = (st: ArchSim, next: Architecture, note?: string) => {
    const armed = st.rackPending && !st.year.done
    Object.assign(st, createArchSim(next, st.achieved))
    if (note) logArch(st, `${note} – kreće nova godina.`, 'info')
    if (armed) armRackFailure(st)
  }

  const restartYear = () => sim.mutate((st) => freshYear(st, st.arch))

  const apply = (next: Architecture, note: string, p: PresetId | 'vlastito' = 'vlastito') => {
    setArch(next)
    setPreset(p)
    // after a finished year the clock is still „running”: stop it, so the new year waits for „Pokreni godinu”
    if (sim.state.year.done) sim.pause()
    sim.mutate((st) => freshYear(st, next, note))
  }
  const change = (patch: Partial<Architecture>, note: string) => apply({ ...arch, ...patch }, note)

  const s = sim.state
  const y = s.year
  const r = yearReport(y)
  const c = costsOf(arch)
  const load = survivorLoad(arch)
  const W = stageW ?? 720
  const overBudget = c.total > BUDGET_EUR
  const simA = r.availability
  const tone = (v: number) => (v >= 0.999 ? 'ok' : v >= 0.995 ? 'warn' : 'bad')

  const frameSim = { ...sim, reset: restartYear }

  return (
    <SimFrame
      title="Arhitekt dostupnosti"
      subtitle="Klopa kao lanac: ulaz, poslužitelji aplikacije i jedna baza. Komponente se kvare nasumično (seed), popravak traje MTTR sati, a jedna godina = 8760 sati u 10 sekundi. 99 % po poslužitelju je namjerno pesimistično (kvar otprilike svakih 16 dana); stvarni strojevi u oblaku kvare se rjeđe."
      sim={frameSim}
      minHeight={520}
      hint={
        <>
          dosegnite očekivanih 99,9 % za najviše {BUDGET_EUR} € mjesečno. Zatim pokvarite: „Kvar ormara u podne” i „Loša konfiguracija”.
        </>
      }
      toolbar={
        <Button
          variant="primary"
          size="sm"
          icon={Play}
          onClick={() => {
            // a fresh year keeps a „Kvar ormara u podne” armed before the start; a used one starts over
            if (y.hour > 0) restartYear()
            sim.play()
          }}
        >
          Pokreni godinu
        </Button>
      }
      controls={
        <>
          <ControlGroup title="Polazište">
            <Segmented
              label="Preset"
              value={preset}
              onChange={(v) => {
                if (v !== 'vlastito') apply(PRESETS[v].arch, `Preset „${PRESETS[v].label}”`, v)
              }}
              options={[
                { value: 'jedan', label: 'Jedan', title: PRESETS.jedan.title },
                { value: 'dva', label: 'Dva', title: PRESETS.dva.title },
                { value: 'vlastito', label: 'Vlastito', title: 'Vaša arhitektura' },
              ]}
              size="sm"
            />
          </ControlGroup>
          <ControlGroup title="Kvarovi">
            <Toggle label="Isti ormar / isto napajanje" checked={arch.sameRack} onChange={(v) => change({ sameRack: v }, v ? 'Svi poslužitelji u istom ormaru' : 'Poslužitelji u odvojenim ormarima')} hint="zajednički ormar: 99,9 %" />
            <div className={styles.buttonRow}>
              <Button
                variant="danger"
                icon={Plug}
                disabled={s.rackPending}
                onClick={() => {
                  // after a finished year the failure is armed for a fresh one, which waits for „Pokreni godinu”
                  if (y.done) sim.pause()
                  sim.mutate((st) => {
                    if (st.year.done) freshYear(st, st.arch)
                    armRackFailure(st)
                  })
                }}
              >
                Kvar ormara u podne
              </Button>
              <Button
                variant="danger"
                icon={Wrench}
                disabled={y.done}
                onClick={() =>
                  sim.mutate((st) => {
                    breakConfig(st)
                    // before the start nothing moves yet: say where the failure went
                    if (st.year.hour === 0) logArch(st, 'Loša konfiguracija čeka prvi sat godine – pokrenite godinu.', 'warn')
                  })
                }
              >
                Loša konfiguracija
              </Button>
            </div>
          </ControlGroup>
          <ControlGroup title="Poslužitelji aplikacije">
            <Slider label="Broj poslužitelja" value={arch.appCount} min={1} max={6} onChange={(v) => change({ appCount: v }, `Poslužitelja aplikacije: ${v}`)} format={(v) => `${v}`} />
            <Slider
              label="Kapacitet po poslužitelju"
              value={Math.round(arch.capacity * 100)}
              min={30}
              max={150}
              step={10}
              onChange={(v) => change({ capacity: v / 100 }, `Kapacitet po poslužitelju: ${v} % vršnog prometa`)}
              format={(v) => `${v} % vrha`}
              hint={arch.appCount > 1 ? `ako jedan padne: ${num(Math.round(load * 100))} % ${arch.appCount === 2 ? 'na drugome' : 'na preostalima'} ${load > 1 ? '✗' : '✓'}` : 'jedan poslužitelj nema zamjenu'}
            />
          </ControlGroup>
          <ControlGroup title="Dostupnost i cijena (mj.)">
            <Slider label="Ulaz" value={stepIndex(arch.entry)} min={0} max={AVAIL_STEPS.length - 1} onChange={(i) => change({ entry: AVAIL_STEPS[i] }, `Ulaz: ${availLabel(i)}`)} format={(i) => `${availLabel(i)} · ${fmtEur(costsOf({ ...arch, entry: AVAIL_STEPS[i] }).entryEur)}`} />
            <Slider
              label="Svaki poslužitelj"
              value={stepIndex(arch.app)}
              min={0}
              max={AVAIL_STEPS.length - 1}
              onChange={(i) => change({ app: AVAIL_STEPS[i] }, `Poslužitelj aplikacije: ${availLabel(i)}`)}
              format={(i) => `${availLabel(i)} · ${fmtEur(costsOf({ ...arch, app: AVAIL_STEPS[i] }).appServerEur)}`}
            />
            <Slider
              label="Baza"
              value={stepIndex(arch.db)}
              min={0}
              max={AVAIL_STEPS.length - 1}
              onChange={(i) => change({ db: AVAIL_STEPS[i] }, `Baza: ${availLabel(i)}`)}
              format={(i) => `${availLabel(i)} · ${fmtEur(costsOf({ ...arch, db: AVAIL_STEPS[i] }).dbEur)}`}
              hint="svaka nova devetka košta više"
            />
          </ControlGroup>
          <ControlGroup title="Napredno" collapsible defaultOpen={false}>
            <Slider
              label="Vrijeme do preuzimanja rada"
              value={DETECTION_STEPS.indexOf(arch.detectionMin as (typeof DETECTION_STEPS)[number])}
              min={0}
              max={DETECTION_STEPS.length - 1}
              onChange={(i) => change({ detectionMin: DETECTION_STEPS[i] }, `Vrijeme do preuzimanja rada: ${DETECTION_STEPS[i]} min`)}
              format={(i) => `${DETECTION_STEPS[i]} min`}
              hint="promet još ide na pali poslužitelj; simulacija to broji kao ispad cijele Klope (stvarno pada samo dio prometa)"
            />
            <Segmented
              label="Vrijeme popravka (MTTR)"
              value={arch.mttrH}
              onChange={(v) => change({ mttrH: v }, `MTTR: ${v} h`)}
              options={MTTR_STEPS.map((h) => ({ value: h, label: `${h} h` }))}
              size="sm"
            />
            <Button variant="secondary" size="sm" icon={Shuffle} onClick={() => change({ seed: arch.seed + 1 }, `Druga godina (seed ${arch.seed + 1})`)}>
              Druga godina
            </Button>
          </ControlGroup>
        </>
      }
      stats={
        <div ref={statsRef}>
          <StatRow>
            <Stat label="Dostupnost (ova godina)" value={y.hour ? pctA(simA, 3) : '–'} tone={y.hour ? tone(simA) : undefined} sub={`formula: ${pctA(formulas.rackAware, 3)}`} />
            <Stat label="Nedostupno" value={y.hour ? fmtHours(r.downtimeH) : '–'} tone={y.hour ? (r.downtimeH > 8.76 ? 'bad' : 'ok') : undefined} sub={`99,9 % dopušta 8,8 h/god.`} />
            <Stat
              label="Izgubljeni ručkovi"
              value={y.hour ? num(r.lunchesLost) : '–'}
              tone={y.hour ? (r.lunchesLost ? 'bad' : 'ok') : undefined}
              sub={`od ${plural(r.lunchesTotal, ['ručka', 'ručka', 'ručkova'])} dosad`}
            />
            <Stat label="Cijena" value={fmtEur(c.total)} unit="/mj." tone={overBudget ? 'warn' : undefined} sub={`ilustrativno · budžet ${BUDGET_EUR} €`} />
          </StatRow>
          {/* „kamo je otišlo vrijeme”: in the stage when the controls stand beside it, else with the tasks (a shorter stage) */}
          <div className={styles.goalsGrid}>
            {!besideControls && (
              <div ref={causeRef}>
                <CauseBars s={s} width={causeW ?? 320} />
              </div>
            )}
            <Goals
              goals={[
                { text: `Dosegnite očekivanih 99,9 % (prosjek 100 godina) za najviše ${BUDGET_EUR} € mjesečno.`, done: s.achieved.budget },
                { text: 'Uz bazu od 99,9 % stavite barem četiri poslužitelja i odvrtite godinu: prijeđe li prosjek 100 godina 99,9 %?', done: s.achieved.db },
                { text: 'Preživite „Kvar ormara u podne” bez ijednog izgubljenog sata.', done: s.achieved.rack },
              ]}
            />
            <EventLog events={mergedEvents(s)} max={6} />
          </div>
        </div>
      }
    >
      <div ref={stageRef} className={styles.stage}>
        <ArchChain s={s} width={W} live={!sim.running || y.done} />
        <FormulaStrip s={s} f={formulas} avg={deferred === arch ? avg : null} simA={simA} simDown={r.downtimeH} />
        <YearCalendar s={s} width={W} />
        {besideControls && <CauseBars s={s} width={Math.min(W, 640)} />}
      </div>
    </SimFrame>
  )
}
