import { useState } from 'react'
import {
  Badge,
  Button,
  ControlGroup,
  Diagram,
  EventLog,
  Goals,
  Legend,
  Segmented,
  SimFrame,
  Slider,
  StickyNote,
  Stat,
  StatRow,
  fmt,
  useSimulation,
  useWidth,
  type SimEvent,
} from '../../../kit'
import { COMPRESSED, effectiveRequests, explainScheduling, podView, qosClass, type Pod, type ResourceSpec } from '../../../engines/cluster'
import { CARD_NOTE, PRESETS, clusterNumbers, type PresetKey } from '../lib/model'
import { stageGeo } from '../lib/stage-geo'
import {
  LEAKY_OK_S,
  applyResources,
  leakyCleanS,
  stagePods,
  cpuLoop,
  createTetris,
  deleteIvaPods,
  dropOnNode,
  ivaPodsLeft,
  leak,
  livePod,
  markBigDbRead,
  setUsage,
  stepTetris,
  stripRequests,
  togglePressure,
  toggleScheduler,
  type TetrisState,
} from '../lib/tetris'
import { SchedTable } from './SchedTable'
import { TetrisStage } from './TetrisStage'
import styles from '../styles.module.css'

type Mutate = (fn: (w: TetrisState) => void) => void

const QOS_TONE = { Guaranteed: 'green', Burstable: 'blue', BestEffort: 'rose' } as const

/** oom_score_adj with a real minus sign (−997) */
function fmtAdj(n: number): string {
  return n < 0 ? `\u2212${-n}` : String(n)
}

function limitFmt(v: number, unit: string): string {
  return v === 0 ? 'bez limita' : `${v}${unit}`
}

/** Sliders for requests / limits of one Pod (a draft; applied by resize in place or by replacing the Pod). */
function ResourceDraft({ p, mutate }: { p: Pod; mutate: Mutate }) {
  const r = p.spec.resources
  const [cpuReq, setCpuReq] = useState(r.requests.cpuM ?? 0)
  const [cpuLim, setCpuLim] = useState(r.limits.cpuM ?? 0)
  const [memReq, setMemReq] = useState(r.requests.memMi ?? 0)
  const [memLim, setMemLim] = useState(r.limits.memMi ?? 0)
  const spec = (): ResourceSpec => {
    const out: ResourceSpec = { requests: {}, limits: {} }
    if (cpuReq > 0) out.requests.cpuM = cpuReq
    if (memReq > 0) out.requests.memMi = memReq
    if (cpuLim > 0) out.limits.cpuM = cpuLim
    if (memLim > 0) out.limits.memMi = memLim
    return out
  }
  const draftQos = qosClass({ ...p.spec, resources: spec() })
  return (
    <ControlGroup title="requests i limits" collapsible defaultOpen={p.name === 'api' || p.name === 'leaky'}>
      <Slider label="requests: CPU" value={cpuReq} min={0} max={2000} step={50} onChange={setCpuReq} format={(v) => (v === 0 ? 'ništa' : `${v}m`)} />
      <Slider label="limits: CPU" value={cpuLim} min={0} max={2000} step={50} onChange={setCpuLim} format={(v) => limitFmt(v, 'm')} />
      <Slider label="requests: memorija" value={memReq} min={0} max={2048} step={64} onChange={setMemReq} format={(v) => (v === 0 ? 'ništa' : `${v}Mi`)} />
      <Slider label="limits: memorija" value={memLim} min={0} max={2048} step={64} onChange={setMemLim} format={(v) => limitFmt(v, 'Mi')} />
      <p className={styles.specLine}>
        nova QoS klasa: <strong>{draftQos}</strong>
      </p>
      <div className={styles.btnCol}>
        <Button onClick={() => mutate((w) => applyResources(w, p.name, spec(), 'resize'))} title="kubectl patch pod … --subresource resize: isti Pod, bez ponovnog pokretanja">
          Promijeni na mjestu
        </Button>
        <Button onClick={() => mutate((w) => applyResources(w, p.name, spec(), 'replace'))} title="kubectl replace --force: novi Pod istog imena ide ponovno kroz raspoređivač">
          Zamijeni Pod
        </Button>
      </div>
    </ControlGroup>
  )
}

function PodPanel({ w, name, mutate }: { w: TetrisState; name: string; mutate: Mutate }) {
  const p = livePod(w, name)
  if (!p) return <p className={styles.hintText}>Pod {name} više ne postoji.</p>
  const v = podView(w.c, p)
  const req = effectiveRequests(p.spec)
  const lim = p.spec.resources.limits
  const pending = !p.nodeName
  const exp = pending ? explainScheduling(w.c, p) : null
  const growth = p.usage.memGrowthMiPerS ?? p.spec.app.memGrowthMiPerS
  return (
    <div className={styles.panel}>
      <div>
        <div className={styles.podHead}>
          <span className={styles.podName}>{p.name}</span>
          <Badge tone={QOS_TONE[v.qos]}>{v.qos}</Badge>
          <Badge tone={p.reason === 'Evicted' ? 'bad' : v.status === 'Running' ? 'ok' : pending ? 'warn' : v.status === 'ContainerCreating' ? 'neutral' : 'bad'}>{p.reason === 'Evicted' ? 'Evicted' : v.status}</Badge>
        </div>
        {CARD_NOTE[p.name] && <p className={styles.podNote}>{CARD_NOTE[p.name]}</p>}
        <p className={styles.specLine}>
          requests {req.cpuM}m · {req.memMi}Mi
          <br />
          limits {lim.cpuM !== undefined ? `${lim.cpuM}m` : '–'} · {lim.memMi !== undefined ? `${lim.memMi}Mi` : '–'}
          {!pending && (
            <>
              <br />
              troši {Math.round(v.cpu.usedM)}m, a želi {Math.round(v.cpu.demandM)}m{v.cpu.throttledPct > 0.05 ? ` (prigušen ${Math.round(v.cpu.throttledPct * 100)} %)` : ''} · {Math.round(v.mem.usedMi)}Mi
              {v.oomScoreAdj !== null && (
                <>
                  <br />
                  oom_score_adj {fmtAdj(v.oomScoreAdj)} · ponovna pokretanja: {v.restarts}
                </>
              )}
            </>
          )}
        </p>
      </div>
      {pending && exp && (
        <>
          <SchedTable exp={exp} need={req} />
          {exp.message && (
            <StickyNote c="pink" rotate={-0.6} className={styles.eventNote}>
              Warning FailedScheduling: {exp.message}
            </StickyNote>
          )}
          <div className={styles.placeRow}>
            {w.c.nodes.map((n) => (
              <Button key={n.name} size="sm" onClick={() => mutate((x) => dropOnNode(x, p.name, n.name))}>
                {`Smjesti na ${n.name}`}
              </Button>
            ))}
          </div>
        </>
      )}
      {!pending && p.reason !== 'Evicted' && (
        <ControlGroup title="Stvarna potrošnja">
          <Slider label="CPU koji proces želi" value={Math.round(v.cpu.demandM)} min={0} max={2000} step={50} onChange={(x) => mutate((ww) => setUsage(ww, p.name, { cpuM: x }))} format={(x) => `${x}m`} />
          <Slider label="memorija" value={Math.round(p.usage.memBaseOverrideMi ?? p.spec.app.memMi)} min={0} max={2048} step={16} onChange={(x) => mutate((ww) => setUsage(ww, p.name, { memMi: x }))} format={(x) => `${x}Mi`} />
          <Slider label="curenje memorije" value={growth} min={0} max={40} step={1} onChange={(x) => mutate((ww) => setUsage(ww, p.name, { memGrowthMiPerS: x }))} format={(x) => (x === 0 ? 'nema' : `${x} Mi/s`)} />
        </ControlGroup>
      )}
      <ResourceDraft key={p.id} p={p} mutate={mutate} />
    </div>
  )
}

export function TetrisSim() {
  const [preset, setPreset] = useState<PresetKey>('tetris')
  const [selected, setSelected] = useState<string | null>(null)
  const [ref, width] = useWidth<HTMLDivElement>()
  const sim = useSimulation({ init: () => createTetris(preset), step: (w: TetrisState, dt: number) => stepTetris(w, dt) })
  const w = sim.state
  const s = w.c
  const onStage = stagePods(w)
  const busiest = Math.max(0, ...s.nodes.map((n) => onStage.filter((p) => p.nodeName === n.name).length))
  const geo = stageGeo(width, busiest)
  const num = clusterNumbers(s)
  const mutate: Mutate = (fn) => sim.mutate(fn)
  const sel = selected ? livePod(w, selected) : undefined
  const pressureNode = sel?.nodeName ?? 'node-2'
  const events: SimEvent[] = [...s.events.slice(-20).map((e) => ({ id: e.id, t: e.t, text: e.text, tone: e.tone })), ...w.log.map((e) => ({ id: e.id, t: e.t, text: e.text, tone: e.tone }))].sort((a, b) => a.t - b.t)
  const leakyUp = leakyCleanS(w)

  const select = (name: string) => {
    setSelected(name)
    if (name === 'big-db') sim.mutate((x) => markBigDbRead(x))
  }

  return (
    <SimFrame
      title="Tetris raspoređivača"
      subtitle="tri čvora, Ivini testni Podovi i osam kartica Podova"
      sim={sim}
      toolbar={<Badge tone="neutral">{`t = ${fmt.num(s.t, 0)} s`}</Badge>}
      hint={
        <>
          Povucite kartice na čvorove (ili kliknite karticu pa „Smjesti na…”), zatim pokrenite raspoređivač. Pratite šrafirane rezervacije, a ne narančastu traku potrošnje.
        </>
      }
      controls={
        <>
          <Segmented
            label="Početno stanje"
            value={preset}
            options={PRESETS.map((p) => ({ value: p.value, label: p.label, title: p.title }))}
            onChange={(v) => {
              setPreset(v)
              setSelected(null)
              sim.mutate((x) => Object.assign(x, createTetris(v)))
            }}
          />
          <Button
            variant={s.components.scheduler ? 'secondary' : 'primary'}
            onClick={() => {
              const turningOn = !s.components.scheduler
              mutate(toggleScheduler)
              // a paused sim (reduced motion, or paused by hand) would otherwise only change this label
              if (turningOn && !sim.running) sim.play()
            }}
          >
            {s.components.scheduler ? 'Zaustavi raspoređivač' : 'Pokreni raspoređivač'}
          </Button>
          <ControlGroup title={sel ? `Odabrani Pod` : 'Odaberite Pod'}>
            {selected ? <PodPanel key={selected} w={w} name={selected} mutate={mutate} /> : <p className={styles.hintText}>
                Kliknite kutiju za ručak (Pod) na crtežu: vidjet ćete njegove <code>requests</code> i <code>limits</code>, zašto ne stane i klizače potrošnje.
              </p>}
          </ControlGroup>
          <ControlGroup title="Pokvarite">
            <div className={styles.btnCol}>
              <Button variant="danger" disabled={!sel?.nodeName} onClick={() => sel && mutate((x) => leak(x, sel.name))} title="memorija odabranog Poda raste 20 Mi/s">
                Curenje memorije
              </Button>
              <Button variant="danger" disabled={!sel?.nodeName} onClick={() => sel && mutate((x) => cpuLoop(x, sel.name))} title="odabrani Pod želi trošiti 2000m CPU-a">
                CPU petlja
              </Button>
              <Button variant="danger" disabled={!sel} onClick={() => sel && mutate((x) => stripRequests(x, sel.name))} title="requests i limits odabranog Poda brišu se: novi Pod, BestEffort">
                Ukloni requests i limits
              </Button>
              <Button variant="danger" active={w.pressure.includes(pressureNode)} onClick={() => mutate((x) => togglePressure(x, pressureNode))} title={`nešto izvan Podova troši memoriju čvora ${pressureNode}`}>
                Pritisak memorije na čvoru
              </Button>
            </div>
            <p className={styles.hintText}>
              Curenje, petlja i uklanjanje <code>requests</code> djeluju na odabrani Pod; pritisak na njegov čvor (inače node-2). Kad pritisak prestane, čvor ostaje u stanju MemoryPressure još {COMPRESSED.pressureTransition.label}.
            </p>
          </ControlGroup>
          <Button variant="success" disabled={ivaPodsLeft(w) === 0} onClick={() => mutate(deleteIvaPods)} title="kubectl delete pod ivina-proba-1 ivina-proba-2 ivina-proba-3">
            Obriši Ivine testne Podove
          </Button>
        </>
      }
      stats={
        <>
          <StatRow>
            <Stat label="potrošnja CPU-a (klaster)" value={fmt.pct(num.usedPct, 0)} sub="što vidi nadzor" />
            <Stat label="rezervirano CPU-a" value={fmt.pct(num.requestedPct, 0)} sub="što vidi raspoređivač" tone={num.requestedPct > 0.9 ? 'bad' : num.requestedPct > 0.7 ? 'warn' : 'ok'} />
            <Stat label="Pending" value={num.pending} sub={`slobodno zbirno ${num.freeCpuM}m, najviše ${num.maxFreeOnNodeM}m na jednom čvoru`} tone={num.pending > 0 ? 'bad' : 'ok'} />
            <Stat label="OOMKilled" value={w.oomKills} sub="izlazni kod 137" tone={w.oomKills > 0 ? 'bad' : 'ok'} />
            <Stat label="Izbačeno" value={w.evictions} sub="memory.available < 100Mi" tone={w.evictions > 0 ? 'bad' : 'ok'} />
          </StatRow>
          <div className={styles.statsGrid}>
            <Goals
              goals={[
                { text: 'Smjestite web, api, cpu-burner, batch, leaky i besteffort, pa kliknite big-db i pročitajte zašto ne stane', done: w.goals.placed && w.goals.bigDbRead },
                { text: 'Smjestite fragment bez novog čvora', done: w.goals.fragment },
                { text: `Popravite curenje u Podu leaky (klizač „curenje memorije” na 0) i održite ga ${LEAKY_OK_S} s bez ponovnog pokretanja${leakyUp > 0 && !w.goals.leaky ? ` (sada ${Math.floor(leakyUp)} s)` : ''}`, done: w.goals.leaky },
                { text: 'Učinite api Guaranteed', done: w.goals.guaranteed },
              ]}
            />
            <EventLog events={events} max={8} />
          </div>
        </>
      }
    >
      <div ref={ref} className={styles.stageWrap}>
        <div className={geo.narrow ? styles.stageNarrow : undefined}>
          <Diagram width={geo.W} height={geo.H} interactive label="Tri čvora kao trake rezervacija: šrafirani blokovi su requests Podova, narančasta traka ispod stvarna potrošnja, crvena crtkana crta zbroj limita. Gore čekaju Podovi bez čvora.">
            <TetrisStage w={w} geo={geo} selected={selected} onSelect={select} onDrop={(pod, node) => mutate((x) => dropOnNode(x, pod, node))} />
          </Diagram>
        </div>
        <Legend
          items={[
            { color: 'var(--hl-blue-ink)', label: 'requests (rezervirano)', shape: 'square' },
            { color: 'var(--food)', label: 'stvarna potrošnja', shape: 'line' },
            { color: 'var(--red)', label: 'zbroj limits', shape: 'dashed' },
            { color: 'var(--ink-3)', label: 'DaemonSet (sustav, na svakom čvoru)', shape: 'square' },
          ]}
        />
      </div>
    </SimFrame>
  )
}
