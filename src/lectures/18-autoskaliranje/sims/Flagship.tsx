/**
 * Flagship „Preživite ručak” (SIM 4) on the E3 engine: HPA + Cluster Autoscaler for klopa-api and KEDA for
 * klopa-worker in one cluster, seed 42. Every control is an engine action applied at once through sim.mutate;
 * the goals are measured on the engine's own numbers (fluid p95, nodes billed, worker replicas).
 */
import { useRef, useState } from 'react'
import {
  Button,
  ControlGroup,
  EventLog,
  Goals,
  LineChart,
  Segmented,
  SimFrame,
  Slider,
  Stat,
  StatRow,
  Toggle,
  fmt,
  useNarrow,
  useSimulation,
  type SimEvent,
} from '../../../kit'
import {
  COMPRESSED,
  clusterCost,
  latencyFormulaText,
  publishMessages,
  removeCpuRequest,
  seriesFor,
  setClusterAutoscaler,
  setColdImageCache,
  setCpuRequest,
  setHpa,
  setTrafficProfile,
  streamRate,
} from '../../../engines/cluster'
import {
  TRAFFIC_OPTIONS,
  apiHpaOf,
  billedNodes,
  createFlagship,
  note,
  profileOf,
  stepFlagship,
  trialPassed,
  webStream,
  type FlagshipState,
  type TrafficKey,
} from '../lib/flagship'
import { API, EUR_PER_NODE_H, apiReady, apiReplicas } from '../lib/story'
import { eur, latency, nodes as nodesWord } from '../lib/format'
import { FlagshipStage } from './FlagshipStage'
import { KedaPanel } from './KedaPanel'
import { HpaTimeline } from './HpaTimeline'
import { WhyNine } from './WhyNine'
import { TallSim } from './TallSim'
import styles from '../styles.module.css'

const SHOWN_KINDS = new Set(['hpa-scale', 'hpa-error', 'ca-scale-up', 'ca-scale-down', 'ca-removed', 'ca-max', 'failed-scheduling', 'keda-up', 'keda-down', 'node-ready', 'rollout-start', 'kubectl-error'])

export function SurviveLunch() {
  const sim = useSimulation<FlagshipState>({
    init: () => createFlagship('start'),
    step: (st, dt) => stepFlagship(st, dt),
    fixedDt: 0.1,
    speed: 5,
  })
  const [why, setWhy] = useState<{ chosen: number | null; solved: boolean }>({ chosen: null, solved: false })
  // on phones the frame would be ~4000 px tall: fold the less used groups (and keep WhyNine and the log outside)
  const narrow = useNarrow(600)
  // the frame itself is not observed (see TallSim): its own ref stays unattached
  const frameRef = useRef<HTMLDivElement>(null)
  const st = sim.state
  const c = st.c
  const hpa = apiHpaOf(c)
  const ca = c.cfg.autoscaler
  const web = webStream(c)
  const rps = web ? streamRate(c, web) : 0
  const p95 = web ? web.p95Ms : 0
  const mean = web ? web.latencyMs : 0
  const rho = web ? web.rho : 0
  const errPerS = Math.max(0, c.series.errPerS.last(0))
  const replicas = apiReplicas(c)
  const ready = apiReady(c)
  const pending = c.pods.filter((p) => !p.nodeName && !p.deletion && p.labels.app === API).length
  const running = c.nodes.filter((n) => n.machine === 'running').length
  const provisioning = c.nodes.filter((n) => n.machine === 'provisioning').length
  const cost = clusterCost(c, EUR_PER_NODE_H)
  const ser = seriesFor(c, API)
  const target = hpa && hpa.metric.type === 'cpu' ? hpa.metric.targetUtilization : 50
  const minR = hpa?.minReplicas ?? 2
  const maxR = hpa?.maxReplicas ?? 20

  const act = (fn: (x: FlagshipState) => void) => sim.mutate(fn)
  const setTraffic = (v: TrafficKey) =>
    act((x) => {
      x.traffic = v
      setTrafficProfile(x.c, 'web', profileOf(v))
      x.trial = null
      const o = TRAFFIC_OPTIONS.find((t) => t.value === v)
      note(x, `Promet: ${o?.title ?? v}`)
    })
  const burst = st.traffic === 'spike' || st.traffic === 'flash'
  const repeatBurst = () =>
    act((x) => {
      setTrafficProfile(x.c, 'web', profileOf(x.traffic))
      x.trial = null
      note(x, 'Ponovljeni nalet: počinje za 60 s')
    })

  const passed = st.results.filter(trialPassed)
  const events: SimEvent[] = [...c.events.filter((e) => SHOWN_KINDS.has(e.kind)).map((e) => ({ t: e.t, text: e.text, tone: e.tone, id: e.id })), ...st.ui].sort((a, b) => a.t - b.t)
  const tr = st.trial
  const lastResult = st.results.at(-1)

  return (
    <>
    <TallSim simRef={sim.ref}>
    <SimFrame
      title="Preživite ručak"
      subtitle="klopa-api s HPA-om i Cluster Autoscalerom, klopa-worker s KEDA-om · seed 42"
      sim={{ ...sim, ref: frameRef, time: c.t }}
      showTime
      speeds={[1, 5, 10, 30]}
      minHeight={420}
      hint="Provedite Klopu kroz Ćevap-petak: p95 ispod 300 ms kroz cijeli nalet, uz što manje čvorova. Zatim pokvarite: bez CPU requesta ili uz nagli val prometa (flash crowd)."
      controls={
        <>
          <ControlGroup>
            <Segmented label="Promet" value={st.traffic} options={TRAFFIC_OPTIONS.map(({ value, label, title }) => ({ value, label, title }))} onChange={setTraffic} />
            {burst && (
              <Button size="sm" variant="secondary" onClick={repeatBurst}>
                Ponovi nalet
              </Button>
            )}
          </ControlGroup>
          <ControlGroup title="HPA za klopa-api">
            <Slider
              label="Ciljna iskorištenost CPU-a"
              value={target}
              min={20}
              max={90}
              step={5}
              format={(v) => `${v} %`}
              onChange={(v) =>
                act((x) => {
                  if (setHpa(x.c, API, { targetUtilization: v })) note(x, `HPA: cilj ${v} %`)
                })
              }
            />
            <Slider
              label="minReplicas"
              value={minR}
              min={1}
              max={10}
              onChange={(v) =>
                act((x) => {
                  const h = apiHpaOf(x.c)
                  if (h && setHpa(x.c, API, { minReplicas: v, maxReplicas: Math.max(h.maxReplicas, v) })) note(x, `HPA: minReplicas ${v}`)
                })
              }
            />
            <Slider
              label="maxReplicas"
              value={maxR}
              min={1}
              max={20}
              onChange={(v) =>
                act((x) => {
                  const h = apiHpaOf(x.c)
                  if (h && setHpa(x.c, API, { maxReplicas: v, minReplicas: Math.min(h.minReplicas, v) })) note(x, `HPA: maxReplicas ${v}`)
                })
              }
            />
          </ControlGroup>
          <ControlGroup title="Pod klopa-api" collapsible={narrow} defaultOpen={!narrow}>
            <Slider
              label="CPU request"
              value={st.requestM}
              min={100}
              max={1000}
              step={50}
              disabled={st.noRequest}
              format={(v) => `${v}m`}
              onChange={(v) =>
                act((x) => {
                  x.requestM = v
                  const r = setCpuRequest(x.c, API, v)
                  note(x, r.ok ? `CPU request ${v}m, limit ${2 * v}m` : r.message, r.ok ? 'info' : 'bad')
                })
              }
            />
            <p className={styles.ctlNote}>Limit = 2 × request. Svaka promjena je novo uvođenje Podova.</p>
          </ControlGroup>
          <ControlGroup title="Čvorovi" collapsible={narrow} defaultOpen={!narrow}>
            <Toggle
              label="Cluster Autoscaler"
              checked={ca?.enabled ?? false}
              onChange={(v) =>
                act((x) => {
                  setClusterAutoscaler(x.c, { enabled: v })
                  note(x, v ? 'Cluster Autoscaler uključen' : 'Cluster Autoscaler isključen', v ? 'info' : 'warn')
                })
              }
            />
            <Slider
              label="Najmanje čvorova"
              value={ca?.minNodes ?? 2}
              min={1}
              max={6}
              onChange={(v) =>
                act((x) => {
                  const a = x.c.cfg.autoscaler
                  if (a && setClusterAutoscaler(x.c, { minNodes: v, maxNodes: Math.max(a.maxNodes, v) })) note(x, `Čvorovi: najmanje ${v}`)
                })
              }
            />
            <Slider
              label="Najviše čvorova"
              value={ca?.maxNodes ?? 6}
              min={1}
              max={8}
              onChange={(v) =>
                act((x) => {
                  const a = x.c.cfg.autoscaler
                  if (a && setClusterAutoscaler(x.c, { maxNodes: v, minNodes: Math.min(a.minNodes, v) })) note(x, `Čvorovi: najviše ${v}`)
                })
              }
            />
            <Toggle
              label="Hladna predmemorija slika"
              checked={st.cold}
              onChange={(v) =>
                act((x) => {
                  x.cold = v
                  setColdImageCache(x.c, v, 30, 5)
                  note(x, v ? 'Predmemorija slika ispražnjena: povlačenje 30 s' : 'Predmemorija slika: povlačenje 5 s', v ? 'warn' : 'info')
                })
              }
            />
            <p className={styles.ctlNote}>Novi čvor: {COMPRESSED.caProvision.label}. Hladna predmemorija: slika se povlači 30 s (sim) umjesto 5 s.</p>
          </ControlGroup>
          <ControlGroup title="Red narudžbi (KEDA)" collapsible={narrow} defaultOpen={!narrow}>
            <div className={styles.btnRow}>
              <Button
                onClick={() =>
                  act((x) => {
                    publishMessages(x.c, 1)
                    note(x, 'Jedna narudžba u red narudzbe')
                  })
                }
              >
                Pošalji narudžbu
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  act((x) => {
                    publishMessages(x.c, 50)
                    note(x, '50 narudžbi u red narudzbe')
                  })
                }
              >
                +50 narudžbi
              </Button>
            </div>
          </ControlGroup>
          <ControlGroup title="Pokvarite" collapsible={narrow} defaultOpen={!narrow}>
            <div className={styles.btnCol}>
              {st.noRequest ? (
                <Button
                  variant="success"
                  onClick={() =>
                    act((x) => {
                      x.noRequest = false
                      const r = setCpuRequest(x.c, API, x.requestM)
                      note(x, r.ok ? `CPU request i limit vraćeni: ${x.requestM}m / ${2 * x.requestM}m` : r.message, r.ok ? 'ok' : 'bad')
                    })
                  }
                >
                  Vrati CPU request i limit
                </Button>
              ) : (
                <Button
                  variant="danger"
                  onClick={() =>
                    act((x) => {
                      x.noRequest = true
                      removeCpuRequest(x.c, API)
                      note(x, 'CPU request i limit uklonjeni: HPA nema s čime usporediti potrošnju', 'bad')
                    })
                  }
                >
                  Ukloni CPU request i limit
                </Button>
              )}
              <Button
                variant="danger"
                onClick={() =>
                  act((x) => {
                    const h = apiHpaOf(x.c)
                    if (h && setHpa(x.c, API, { maxReplicas: 4, minReplicas: Math.min(h.minReplicas, 4) })) note(x, 'HPA: maxReplicas = 4', 'warn')
                  })
                }
              >
                maxReplicas = 4
              </Button>
              <Button
                variant="danger"
                onClick={() =>
                  act((x) => {
                    x.traffic = 'flash'
                    setTrafficProfile(x.c, 'web', profileOf('flash'))
                    x.trial = null
                    setClusterAutoscaler(x.c, { enabled: true, maxNodes: 6, minNodes: Math.min(x.c.cfg.autoscaler?.minNodes ?? 2, 6) })
                    note(x, 'Nagli val 20 → 200 zahtjeva/s za 60 s, najviše 6 čvorova', 'warn')
                  })
                }
              >
                Flash crowd uz najviše 6 čvorova
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  act((x) => {
                    // keep the reader's progress (goals) across the preset
                    const keep = { results: x.results, workerSleptAt: x.workerSleptAt, workerWokeAt: x.workerWokeAt }
                    Object.assign(x, createFlagship('incident'), keep)
                    note(x, 'Incident 18: minReplicas = maxReplicas = 2, nalet u t = 60 s', 'warn')
                  })
                }
              >
                Incident 18: bez skaliranja
              </Button>
            </div>
          </ControlGroup>
        </>
      }
      stats={
        <>
          <StatRow>
            <Stat label="Promet" value={fmt.num(rps)} unit="zahtjeva/s" />
            <Stat label="Podovi klopa-api" value={`${ready}/${replicas}`} sub={pending > 0 ? `${pending} Pending` : 'Ready / željeno'} tone={pending > 0 ? 'warn' : undefined} />
            <Stat label="p95 (procjena)" value={latency(p95)} tone={p95 < 300 ? 'ok' : p95 < 1000 ? 'warn' : 'bad'} sub={`prosjek ${latency(mean)} · opterećenje ρ = ${fmt.num(Math.min(rho, 9.99), 2)}`} />
            <Stat label="Odbijeno" value={`${fmt.num((100 * errPerS) / Math.max(rps, 1))} %`} tone={errPerS > 0.5 ? 'bad' : 'ok'} sub={`${fmt.num(errPerS)}/s${web ? ` · ukupno ${fmt.num(web.dropped)}` : ''}`} />
            <Stat label="Čvorovi" value={running} sub={provisioning > 0 ? `+${provisioning} se pokreće` : `dopušteno ${ca?.minNodes ?? 2}–${ca?.maxNodes ?? 6}`} tone={provisioning > 0 ? 'warn' : undefined} />
            <Stat label="Trošak sada" value={eur(cost.eurPerHourNow)} unit="/h" sub="zamišljeno 0,10 € po čvoru na sat" />
          </StatRow>
          <div className={styles.statsGrid}>
            <Goals
              goals={[
                { text: 'Prođite nalet s p95 < 300 ms cijelo vrijeme, bez odbijenih zahtjeva', done: passed.length > 0 },
                { text: '… i to uz najmanji €/h: najviše 2 čvora kroz cijeli nalet', done: passed.some((r) => r.maxNodes <= 2) },
                { text: 'Objasnite zašto HPA stane na 9 Podova, a ne na 10 (pitanje ispod simulacije)', done: why.solved },
                { text: 'klopa-worker noću na 0, a na prvu poruku natrag na 1', done: st.workerWokeAt !== null },
              ]}
            />
            <EventLog events={events} max={narrow ? 5 : 7} />
          </div>
        </>
      }
    >
      <div className={styles.stageCol}>
        <FlagshipStage c={c} />
        <KedaPanel c={c} />
        <p className={styles.trial} aria-live="off">
          {tr
            ? `Nalet u tijeku: najgori p95 ${latency(tr.worstP95)} · najviše ${nodesWord(tr.maxNodes)} · odbijeno ${fmt.num(tr.dropped)}`
            : lastResult
              ? `Zadnji nalet: najgori p95 ${latency(lastResult.worstP95)} · najviše ${nodesWord(lastResult.maxNodes)} · odbijeno ${fmt.num(lastResult.dropped)}${trialPassed(lastResult) ? ' ✓' : ' ✗ – promijenite minReplicas ili cilj pa „Ponovi nalet”'}`
              : `Nalet počinje 60 s nakon odabira prometa „nalet” (sada ${nodesWord(billedNodes(c))} u računu).`}
        </p>
        <div className={styles.charts}>
          <LineChart
            series={[
              { label: 'željeno (replicas)', values: ser?.replicas.values ?? [], color: 'var(--pen)', dashed: true },
              { label: 'Ready', values: ser?.ready.values ?? [], color: 'var(--green)', dashed: false },
              { label: 'Pending', values: ser?.pending.values ?? [], color: 'var(--orange)' },
            ]}
            window={600}
            height={narrow ? 100 : 130}
            yLabel="Podovi klopa-api"
            xLabel="zadnjih 10 min (sim)"
          />
          <LineChart
            series={[{ label: 'p95 (procjena)', values: c.series.p95Ms.values, color: 'var(--red)', dashed: false }]}
            threshold={{ value: 300, label: 'cilj 300 ms' }}
            yMax={2000}
            window={600}
            height={narrow ? 100 : 130}
            yLabel="p95 u ms (iznad 2 s odrezano)"
            formatY={(v) => (v >= 1000 ? `${fmt.num(v / 1000, 1)} s` : `${Math.round(v)}`)}
            xLabel="zadnjih 10 min (sim)"
          />
        </div>
      </div>
    </SimFrame>
    </TallSim>
    <p className={styles.small}>
      Model simulacije – latencija: {latencyFormulaText()}; p95 ≈ 3 × prosjek. Svaki Pod: 25 ms CPU-a po zahtjevu, request 500m, limit 1000m – 20 zahtjeva/s na 100 % requesta, najviše 40 na limitu. Čvor: 2 vCPU · 8 GiB, za Podove 1930m.
    </p>
    {hpa && <HpaTimeline decisions={hpa.decisions} />}
    <WhyNine chosen={why.chosen} onChoose={(i, ok) => setWhy((w) => ({ chosen: i, solved: w.solved || ok }))} />
    </>
  )
}
