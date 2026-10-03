import { useEffect, useRef, useState } from 'react'
import { BarChart3, Plus, RotateCcw, Wrench, Zap } from 'lucide-react'
import {
  Button,
  CastDoodle,
  ControlGroup,
  EventLog,
  Goals,
  LineChart,
  PenGlyph,
  RoughBox,
  RoughButton,
  Segmented,
  SimFrame,
  Slider,
  Stat,
  StatRow,
  Toggle,
  fmt,
  plural,
  useSimulation,
  useWidth,
} from '../../../kit'
import {
  ALGO_LABEL,
  ALGO_RULE,
  MODEL_NOTES,
  WORKLOADS,
  addServer,
  burst,
  capacityOf,
  configure,
  metrics,
  removeServer,
  resetWeights,
  routeManual,
  setAlgo,
  setSlow,
  setWeight,
  stepTraffic,
  type Algo,
  type RuntimePatch,
  type ServerSpec,
  type WorkloadId,
} from '../../../engines/traffic'
import {
  ADVANCED_ALGOS,
  COMPARE_ALGOS,
  DEFAULT_PRICE,
  INCIDENT,
  MAIN_ALGOS,
  MAX_RACK,
  PATTERN_LABEL,
  PATTERN_PROFILE,
  SIZES,
  WORKLOAD_SHORT,
  fmtEur,
  fmtSec,
  klopaRack,
  nextId,
  nextName,
  rackPrice,
  zahtjeva,
  type Pattern,
  type SizeKey,
} from '../lb'
import { RackStage, type DavorSay } from './RackStage'
import { StageLegend } from './StageLegend'
import { CompareRuns } from './CompareRuns'
import { createFlag, davorFor, noteFor, updateGoals, type FlagSettings } from './flagship'
import { runCompare, type AlgoResult } from './compare'
import css from '../styles.module.css'

const RAM_CHOICES = [1, 2, 4, 8, 16] as const

/** Davor under the drawing when the stage layout has no room for him (medium and narrow layouts). */
function DavorLine({ say }: { say: DavorSay }) {
  const text = say.lines.join(' ')
  return (
    <div className={css.davorLine} aria-hidden="true">
      <CastDoodle who="davor" mood={say.worried ? 'worry' : 'smile'} boil={false} className={css.davorFace} />
      <RoughBox className={css.davorSays} stroke={say.worried ? 'var(--red)' : 'var(--ink-3)'} seed={4911} pad={6}>
        <span style={{ visibility: text ? 'visible' : 'hidden' }}>{text || '…'}</span>
      </RoughBox>
    </div>
  )
}

function rackFromEngine(servers: { id: string; name: string; vcpu: number; ramGB: number; weight: number }[]): ServerSpec[] {
  return servers.map((v) => ({ id: v.id, name: v.name, vcpu: v.vcpu, ramGB: v.ramGB, weight: v.weight }))
}

export function FlagshipSim() {
  const [rack, setRack] = useState<ServerSpec[]>(klopaRack)
  const [lambda, setLambda] = useState(INCIDENT.lambda)
  const [pattern, setPattern] = useState<Pattern>('constant')
  const [workload, setWorkload] = useState<WorkloadId>(INCIDENT.workload)
  const [algo, setAlgoState] = useState<Algo>(INCIDENT.algo)
  const [queueMax, setQueueMax] = useState(10)
  const [unbounded, setUnbounded] = useState(false)
  const [customCpu, setCustomCpu] = useState(4)
  const [customRam, setCustomRam] = useState(4)
  const [resetToken, setResetToken] = useState(0)
  const [compare, setCompare] = useState<{ results: AlgoResult[]; caption: string } | null>(null)
  const [stageRef, stageW] = useWidth<HTMLDivElement>()
  const rackListRef = useRef<HTMLUListElement>(null)
  const addRowRef = useRef<HTMLDivElement>(null)

  const settings: FlagSettings = { rack, lambda, pattern, workload, algo, queueMax, unbounded }
  const sim = useSimulation({
    init: () => createFlag(settings),
    step: (st, dt) => {
      configure(st.tr, { lambda, workload, queueMax, unboundedWorkers: unbounded, profile: PATTERN_PROFILE[pattern] })
      stepTraffic(st.tr, dt)
      updateGoals(st)
    },
  })

  // a preset changes several settings at once: rebuild the run after React has applied them
  const { reset } = sim
  useEffect(() => {
    if (resetToken > 0) reset()
  }, [resetToken, reset])

  const st = sim.state
  const s = st.tr
  const m = metrics(s)
  // the engine refreshes its current rate on the next tick: while paused, show the slider's value right away
  const offered = sim.running && s.t > 0 ? m.offered : s.cfg.lambda
  const price = rackPrice(rack)
  const slowOn = s.servers.find((v) => v.slowFactor > 1)
  const strongest = s.servers.length ? s.servers.reduce((a, b) => (capacityOf(b.vcpu, b.ramGB, s.cfg.workload).cap > capacityOf(a.vcpu, a.ramGB, s.cfg.workload).cap ? b : a)) : null
  const burstOn = s.t < s.burstUntil
  const weighted = algo === 'wrr' || algo === 'wlc'
  const davor = davorFor(s)
  // the wide stage draws Davor himself (stage.ts: side layout = width ≥ 680 and at most three servers)
  const davorInStage = stageW !== null && stageW >= 680 && s.servers.length <= 3

  // controls apply right away (also while paused); `step` keeps them in sync afterwards
  const apply = (patch: RuntimePatch) => sim.mutate((x) => configure(x.tr, patch))
  const changeLambda = (v: number) => {
    setLambda(v)
    apply({ lambda: v })
  }
  const changePattern = (p: Pattern) => {
    setPattern(p)
    apply({ profile: PATTERN_PROFILE[p] })
  }
  const changeWorkload = (w: WorkloadId) => {
    setWorkload(w)
    apply({ workload: w })
  }
  const changeQueue = (q: number) => {
    setQueueMax(q)
    apply({ queueMax: q })
  }
  const changeUnbounded = (u: boolean) => {
    setUnbounded(u)
    apply({ unboundedWorkers: u })
  }
  const changeAlgo = (a: Algo) => {
    setAlgoState(a)
    sim.mutate((x) => setAlgo(x.tr, a))
  }
  const add = (key: SizeKey | 'custom') => {
    if (rack.length >= MAX_RACK) return
    const size = key === 'custom' ? { vcpu: customCpu, ramGB: customRam } : { vcpu: SIZES[key].vcpu, ramGB: SIZES[key].ramGB }
    const id = nextId(s.servers)
    const name = nextName(s.servers, key === 'custom' ? null : SIZES[key].name)
    sim.mutate((x) => {
      addServer(x.tr, { id, name, ...size })
    })
    setRack(rackFromEngine(sim.state.tr.servers))
  }
  const remove = (id: string) => {
    if (rack.length <= 1) return
    const idx = s.servers.findIndex((v) => v.id === id)
    sim.mutate((x) => {
      removeServer(x.tr, id)
    })
    setRack(rackFromEngine(sim.state.tr.servers))
    // the focused × disappears with its row: keep focus on the next row's × (or the first add button)
    requestAnimationFrame(() => {
      const left = rackListRef.current ? Array.from(rackListRef.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')) : []
      const next = left[Math.min(Math.max(0, idx), left.length - 1)] ?? addRowRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')
      next?.focus()
    })
  }
  const weight = (id: string, w: number) => {
    sim.mutate((x) => {
      setWeight(x.tr, id, Math.max(1, Math.min(20, w)))
    })
    setRack(rackFromEngine(sim.state.tr.servers))
  }
  const autoWeights = () => {
    sim.mutate((x) => {
      resetWeights(x.tr)
    })
    setRack(rackFromEngine(sim.state.tr.servers))
  }
  const incident = () => {
    setRack(klopaRack())
    setLambda(INCIDENT.lambda)
    setPattern('constant')
    setWorkload(INCIDENT.workload)
    setAlgoState(INCIDENT.algo)
    setQueueMax(10)
    setUnbounded(false)
    setCompare(null)
    setResetToken((t) => t + 1)
  }
  const doCompare = () => {
    const results = runCompare(settings, COMPARE_ALGOS)
    const cap = rack.map((r) => r.name).join(' + ')
    setCompare({
      results,
      caption: `${cap} · ${WORKLOAD_SHORT[workload]} · ${zahtjeva(lambda)}/s · ${PATTERN_LABEL[pattern]} promet · seed 42 · 5 min prometa (10 s zagrijavanja + 300 s mjerenja)`,
    })
  }

  const goals = [
    { text: <>0 % grešaka pri 20 zahtjeva/s s Klopinim poslužiteljima (30&nbsp;s bez ijedne greške)</>, done: st.g1.done },
    { text: <>Dodajte prilagođeni 2 vCPU / 8 GB i pokažite da on i Srednji (2 vCPU / 4 GB) pri punom procesoru obrade jednako mnogo API zahtjeva</>, done: st.g2a.done },
    { text: <>Ostavite samo 2 vCPU / 4 GB i 2 vCPU / 8 GB, prebacite na I/O i pronađite promet u kojem 8 GB obradi barem 30 % više</>, done: st.g2b.done },
    { text: <>Jeftinije od {fmtEur(DEFAULT_PRICE)}/mj.: pri 25 zahtjeva/s p95 &lt; 1,5&nbsp;s i &lt; 1&nbsp;% grešaka kroz 30&nbsp;s</>, done: st.g3.done },
  ]

  const errTone = m.errorRate > 0.01 ? 'bad' : m.errorRate > 0 ? 'warn' : 'ok'
  const label = `Simulacija: ${fmt.num(offered, 1)} zahtjeva u sekundi stiže na load balancer (${ALGO_LABEL[algo]}) i dijeli se na ${plural(rack.length, ['poslužitelj', 'poslužitelja', 'poslužitelja'])}: ${s.servers
    .map((v) => `${v.name} ${v.vcpu} vCPU / ${v.ramGB} GB`)
    .join(', ')}. Uspješno ${fmt.num(m.goodput, 1)} u sekundi, greške ${fmt.pct(m.errorRate, 1)}.`

  return (
    <SimFrame
      title="load balancer u vašim rukama"
      subtitle={`${MODEL_NOTES.workerPool} Opterećenje ${WORKLOAD_SHORT[workload]}: ${fmt.num(WORKLOADS[workload].cpuMs)} ms procesora i ${fmt.num(WORKLOADS[workload].ioMs)} ms čekanja baze po zahtjevu.`}
      sim={sim}
      showTime
      minHeight={420}
      hint="nađite algoritam koji na prometu iz incidenta (kružno, 15 zahtjeva/s) nema grešaka, a zatim riješite zadatke ispod."
      controls={
        <>
          <ControlGroup title="Algoritam">
            <Segmented size="sm" value={algo} onChange={changeAlgo} options={MAIN_ALGOS.map((a) => ({ value: a, label: ALGO_LABEL[a], title: ALGO_RULE[a] }))} />
            <p className={css.rule}>{ALGO_RULE[algo]}</p>
            {weighted && (
              <div className={css.weights}>
                {s.servers.map((v) => (
                  <div key={v.id} className={css.weightRow}>
                    <span className={css.weightName}>{v.name}</span>
                    <RoughButton className={css.mini} seed={4950} strokeWidth={1.4} ariaLabel={`Smanji težinu: ${v.name}`} onClick={() => weight(v.id, v.weight - 1)}>
                      <PenGlyph kind="minus" size={15} />
                    </RoughButton>
                    <span className={css.weightVal}>{fmt.num(v.weight)}</span>
                    <RoughButton className={css.mini} seed={4951} strokeWidth={1.4} ariaLabel={`Povećaj težinu: ${v.name}`} onClick={() => weight(v.id, v.weight + 1)}>
                      <PenGlyph kind="plus" size={15} />
                    </RoughButton>
                  </div>
                ))}
                <Button size="sm" variant="ghost" onClick={autoWeights}>
                  Težine prema kapacitetu
                </Button>
              </div>
            )}
          </ControlGroup>
          <ControlGroup title="Promet">
            <Slider label="Promet" value={lambda} min={1} max={50} onChange={changeLambda} format={(v) => `${zahtjeva(v)}/s`} />
            <Segmented label="Uzorak" size="sm" value={pattern} onChange={changePattern} options={(Object.keys(PATTERN_LABEL) as Pattern[]).map((p) => ({ value: p, label: PATTERN_LABEL[p] }))} />
            <Segmented
              label="Opterećenje"
              size="sm"
              value={workload}
              onChange={changeWorkload}
              options={(['api', 'io', 'cpu'] as WorkloadId[]).map((w) => ({ value: w, label: WORKLOAD_SHORT[w], title: WORKLOADS[w].description }))}
            />
          </ControlGroup>
          <ControlGroup title="Pokvarite">
            <Button
              variant={slowOn ? 'success' : 'danger'}
              icon={slowOn ? Wrench : Zap}
              disabled={!strongest}
              onClick={() =>
                sim.mutate((x) => {
                  const target = slowOn ?? strongest
                  if (target) setSlow(x.tr, target.id, slowOn ? 1 : 3)
                })
              }
            >
              {slowOn ? `Popravi procesor (${slowOn.name})` : `Sporiji procesor (${strongest?.name ?? '–'})`}
            </Button>
            <Button variant="danger" active={burstOn} onClick={() => sim.mutate((x) => burst(x.tr, 3, 30_000))}>
              Nalet u 12:00
            </Button>
            <Toggle label="Neograničeni radnici" checked={unbounded} onChange={changeUnbounded} hint="broj radnika više ne prati RAM" />
          </ControlGroup>
          <ControlGroup title={`Poslužitelji · ${fmtEur(price)}/mj.`} collapsible>
            <ul className={css.rackList} ref={rackListRef}>
              {s.servers.map((v) => (
                <li key={v.id}>
                  <span className={css.rackName}>{v.name}</span>
                  <span className={css.rackSpec}>
                    {fmt.num(v.vcpu)} vCPU · {fmt.num(v.ramGB)} GB
                  </span>
                  <RoughButton className={css.mini} seed={4952} strokeWidth={1.4} onClick={() => remove(v.id)} disabled={s.servers.length <= 1} ariaLabel={`Ukloni ${v.name}`} title={`Ukloni ${v.name}`}>
                    <PenGlyph kind="cross" size={15} />
                  </RoughButton>
                </li>
              ))}
            </ul>
            <div className={css.addRow} ref={addRowRef}>
              {(Object.keys(SIZES) as SizeKey[]).map((k) => (
                <Button key={k} size="sm" icon={Plus} onClick={() => add(k)} disabled={rack.length >= MAX_RACK} title={`${SIZES[k].vcpu} vCPU / ${SIZES[k].ramGB} GB`}>
                  {SIZES[k].name}
                </Button>
              ))}
            </div>
            <ControlGroup title="Prilagođeni poslužitelj" collapsible>
              <Slider label="vCPU" value={customCpu} min={1} max={8} onChange={setCustomCpu} format={(v) => `${v} vCPU`} />
              <Segmented label="RAM" size="sm" value={customRam} onChange={setCustomRam} options={RAM_CHOICES.map((r) => ({ value: r, label: `${r} GB` }))} />
              <Button size="sm" icon={Plus} onClick={() => add('custom')} disabled={rack.length >= MAX_RACK}>
                Dodaj {customCpu} vCPU / {customRam} GB
              </Button>
            </ControlGroup>
            <p className={css.small}>Cijena je ilustrativna: 6 € po vCPU i 1,5 € po GB RAM-a mjesečno.</p>
          </ControlGroup>
          <ControlGroup title="Napredno" collapsible>
            <Segmented label="Još dva algoritma" size="sm" value={algo} onChange={changeAlgo} options={ADVANCED_ALGOS.map((a) => ({ value: a, label: ALGO_LABEL[a], title: ALGO_RULE[a] }))} />
            <Slider label="Duljina reda po poslužitelju" value={queueMax} min={0} max={100} onChange={changeQueue} format={(v) => `${v} mjesta`} />
            <Toggle label="Kubernetes Service (L14)" checked={false} onChange={() => undefined} disabled hint="nasumična kopija aplikacije za svaku novu vezu – predavanje 14" />
          </ControlGroup>
          <div className={css.addRow}>
            <Button variant="primary" onClick={incident}>
              Incident 12:00
            </Button>
            <Button icon={RotateCcw} onClick={reset} title="Isti seed i iste postavke: točno isti dolasci zahtjeva">
              Ponovi isti promet
            </Button>
          </div>
        </>
      }
      stats={
        <>
          <StatRow>
            <Stat label="uspješno (5 s)" value={fmt.num(m.goodput, 1)} unit="/s" sub={`zadani promet ${fmt.num(offered, 1)}/s`} />
            <Stat label="p50" value={fmtSec(m.p50)} />
            <Stat label="p95" value={fmtSec(m.p95)} tone={m.p95 !== null && m.p95 > 1500 ? 'warn' : 'neutral'} />
            <Stat label="p99" value={fmtSec(m.p99)} />
            <Stat label="greške (10 s)" value={fmt.pct(m.errorRate, 1)} tone={errTone} sub={`502: ${m.errors[502]} · 503: ${m.errors[503]} · 504: ${m.errors[504]}`} />
          </StatRow>
          <div className={css.charts}>
            <LineChart
              series={[
                { label: 'zadani promet/s', values: s.series.offered.values, color: 'var(--tray-ink)' },
                { label: 'uspješno/s', values: s.series.goodput.values, color: 'var(--green)' },
                { label: 'greške/s', values: s.series.errors.values, color: 'var(--red)' },
              ]}
              window={120}
              height={130}
              yLabel="zahtjeva/s"
              xLabel="zadnjih 60 s"
            />
            <LineChart
              series={[{ label: 'p95 (s)', values: s.series.p95.values.map((v) => v / 1000), color: 'var(--red)' }]}
              threshold={{ value: 1.5, label: 'cilj 1,5 s' }}
              window={120}
              height={130}
              yMax={5}
              yLabel="p95, sekunde"
              xLabel="zadnjih 60 s"
              formatY={(v) => fmt.num(v, 1)}
            />
          </div>
          <div className={css.compareBar}>
            <Button icon={BarChart3} onClick={doCompare}>
              Usporedi tri algoritma
            </Button>
            <span className={css.small}>Kružno, težinsko kružno i najmanje veza na istom prometu i s istim postavkama (5 min prometa, izračunato odjednom).</span>
          </div>
          {compare && <CompareRuns results={compare.results} caption={compare.caption} />}
          <div className={css.goalsGrid}>
            <Goals goals={goals} />
            <EventLog events={s.events} />
          </div>
        </>
      }
    >
      <div className={css.stick}>
        <div ref={stageRef} className={css.stage}>
          <RackStage
            s={s}
            width={stageW}
            lambda={offered || lambda}
            onPick={algo === 'manual' ? (id) => sim.mutate((x) => routeManual(x.tr, id)) : undefined}
            note={noteFor(s)}
            davor={davor}
            label={label}
          />
        </div>
        {!davorInStage && <DavorLine say={davor} />}
        <StageLegend />
      </div>
    </SimFrame>
  )
}
