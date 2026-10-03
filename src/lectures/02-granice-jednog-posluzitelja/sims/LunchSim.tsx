import { ArrowUpRight, Power, RotateCcw, Zap } from 'lucide-react'
import {
  Button,
  Check,
  ControlGroup,
  Cross,
  EventLog,
  Goals,
  Legend,
  LineChart,
  RoughBox,
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
import { RAM_OPTIONS_GB, VCPU_OPTIONS, WORKLOADS, capacityOf, errorLabel, metrics, nextBiggerSize, serverView, type WorkloadId } from '../../../engines/traffic'
import { STAGE, stageLayoutFor } from '../geometry'
import {
  GOAL_PRICE,
  PRESET_ID,
  SEED,
  availability,
  biggerServer,
  clockOf,
  createLunch,
  fmtEur,
  fmtLat,
  nb,
  priceOf,
  pullPlug,
  plugIn,
  replayLunch,
  sendBurst,
  setLambda,
  setQueueMax,
  setSize,
  setUnbounded,
  setWorkload,
  sizeLocked,
  stepLunch,
  type BurstReport,
  type LunchState,
} from '../model'
import { lunchView } from '../view'
import { ServerStage } from './ServerStage'
import styles from '../styles.module.css'

/** Local titles: Klopa at lunch is the I/O profile; API and CPU are there for comparison. */
const WORKLOAD_OPTIONS: { value: WorkloadId; label: string; title: string }[] = [
  { value: 'api', label: 'API', title: 'API koji više računa: 200 ms procesora + 300 ms baze po zahtjevu (za usporedbu)' },
  { value: 'io', label: 'I/O – Klopa', title: 'Klopa u podne: 50 ms procesora + 1000 ms čekanja baze po zahtjevu' },
  { value: 'cpu', label: 'CPU', title: 'Obrada fotografija: 400 ms procesora + 50 ms baze po zahtjevu (za usporedbu)' },
]

const WORKLOAD_HINT: Record<WorkloadId, string> = {
  api: '200 ms procesora + 300 ms baze',
  io: '50 ms procesora + 1000 ms baze',
  cpu: '400 ms procesora + 50 ms baze',
}

/** The last measured bursts: the 30 s window behind the incident card, one line each. */
function BurstReports({ reports }: { reports: BurstReport[] }) {
  if (!reports.length)
    return (
      <p className={styles.burstEmpty}>
        Mjerenje naleta pojavit će se ovdje kad nalet završi (30 s). Preset <code>{PRESET_ID}</code>, seed {SEED}.
      </p>
    )
  return (
    <RoughBox seed={2401} stroke="var(--ink-3)" pad={2} className={styles.burstBox}>
      <div className={styles.burstHead}>mjerenje naleta · 30 s</div>
      <ul className={styles.burstList}>
        {[...reports].reverse().map((r) => (
          <li key={r.id}>
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
              {r.survived ? <Check x={10} y={11} size={7} seed={2402} /> : <Cross x={10} y={10} size={6.5} seed={2403} />}
            </svg>
            <span className={styles.burstLine}>
              <span className={`${styles.burstMachine} mono`}>
                {nb(`${fmt.num(r.vcpu)} vCPU / ${fmt.num(r.ramGB)} GB · ${fmtEur(r.price)}/mj. · ${WORKLOADS[r.workload].label} · ${fmt.num(r.offered)}/s`)}
              </span>
              <span className={`${styles.burstNums} mono`}>
                <span>{nb(`uspješno ${fmt.num(r.okRps, 1)}/s`)}</span>
                <span className={r.errorRate >= 0.01 ? styles.burstBad : undefined}>
                  {nb(`greške ${fmt.pct(r.errorRate, 1)}`)}
                  {r.errors.total > 0 ? nb(` (503: ${r.errors[503]} · isteklo: ${r.errors[504]} · odbijeno: ${r.errors.refused})`) : ''}
                </span>
                <span>{nb(`p95 ${fmtLat(r.p95)}`)}</span>
                <span>{nb(`procesor ${fmt.pct(r.cpu)}`)}</span>
              </span>
            </span>
            <span className="visually-hidden">{r.survived ? ' – preživjeli ste nalet.' : ' – nalet nije preživljen.'}</span>
            {!r.valid && <em className={styles.burstNote}> mjerenje ne vrijedi: postavke su se mijenjale</em>}
          </li>
        ))}
      </ul>
    </RoughBox>
  )
}

/**
 * Flagship: „Jedan poslužitelj protiv ručka”. One worker-pool server (E1 engine, mode 'direct') under Poisson
 * traffic. Starts as the incident: I/O workload, 2 vCPU / 2 GB, λ 4, the 12:00 burst ×3 arrives 5 s after start.
 */
export function LunchSim() {
  const sim = useSimulation<LunchState>({ init: () => createLunch(), step: stepLunch })
  const [ref, width] = useWidth<HTMLDivElement>()
  const layout = stageLayoutFor(width)
  const w = sim.state
  const s = w.s
  const v = s.servers[0]
  const sv = serverView(s, v)
  const m = metrics(s)
  const view = lunchView(w, STAGE[layout])
  const cap = capacityOf(v.vcpu, v.ramGB, w.params.workload)
  const next = nextBiggerSize(v.vcpu, v.ramGB)
  const avail = availability(w)
  const locked = sizeLocked(w)
  const g = w.goals
  const p95 = m.p95
  const mutate = sim.mutate

  const label = `Poslužitelj Klopa (${v.vcpu} vCPU, ${v.ramGB} GB): ${fmt.num(m.offered, 1)} zahtjeva u sekundi, zauzeto ${sv.busy} od ${sv.workersLabel} radnika, u redu ${sv.queue} od ${sv.queueMax}, procesor ${fmt.pct(sv.cpuSmooth)}.${view.stamp ? ` Stanje: ${view.stamp}.` : ''}`

  return (
    <SimFrame
      title="Jedan poslužitelj protiv ručka"
      subtitle={`Isti model kao gore (sinkroni radnici gunicorna, red od 10 mjesta ispred njih); isti seed (${SEED}) daje isti promet.`}
      sim={sim}
      toolbar={
        <span className={`${styles.clock} mono`} aria-label={`Vrijeme u simulaciji ${clockOf(w)}`}>
          {clockOf(w)}
        </span>
      }
      hint={
        <>
          u 12:00 (za nekoliko sekundi) stiže nalet. Gledajte procesor i radnike. Zatim pokušajte preživjeti nalet: promijenite vCPU ili RAM i kliknite „Ponovi isti promet”.
        </>
      }
      minHeight={420}
      controls={
        <>
          <ControlGroup title="Promet">
            <Slider
              label="Promet"
              value={w.params.lambda}
              min={1}
              max={50}
              onChange={(x) => mutate((st) => setLambda(st, x))}
              format={(x) => `${plural(x, ['zahtjev', 'zahtjeva', 'zahtjeva'])}/s`}
            />
            <Button variant="danger" icon={Zap} onClick={() => mutate(sendBurst)} title="Promet ×3 tijekom 30 s">
              Nalet u 12:00
            </Button>
            <Button variant="primary" icon={RotateCcw} onClick={() => mutate(replayLunch)} title="Isti seed: nalet u 12:00 stiže za 5 s">
              Ponovi isti promet
            </Button>
            <Segmented label="Opterećenje" value={w.params.workload} options={WORKLOAD_OPTIONS} onChange={(x) => mutate((st) => setWorkload(st, x))} size="sm" />
            <span className={styles.ctlHint}>{WORKLOAD_HINT[w.params.workload]}</span>
          </ControlGroup>
          <ControlGroup title="Poslužitelj">
            <Segmented label="vCPU" value={v.vcpu} options={VCPU_OPTIONS.map((n) => ({ value: n, label: String(n), title: `${n} vCPU` }))} onChange={(n) => mutate((st) => setSize(st, { vcpu: n }))} size="sm" />
            <Segmented
              label="RAM (GB)"
              value={v.ramGB}
              options={RAM_OPTIONS_GB.map((n) => ({ value: n, label: String(n), title: `${n} GB` }))}
              onChange={(n) => mutate((st) => setSize(st, { ramGB: n }))}
              size="sm"
            />
            <span className={styles.ctlHint}>{locked ?? 'Odmah; cijene su ilustrativne.'}</span>
            <Button
              icon={ArrowUpRight}
              onClick={() => mutate(biggerServer)}
              disabled={!next}
              title={next ? `Sljedeća veličina u ponudi: ${next.vcpu} vCPU / ${next.ramGB} GB, ${fmtEur(priceOf(next.vcpu, next.ramGB))}/mj. Promjena znači gašenje.` : '8 vCPU / 16 GB je najveći u ponudi.'}
            >
              {next ? 'Veći poslužitelj' : 'Nema većeg'}
            </Button>
            <span className={styles.ctlHint}>
              {next ? nb(`sljedeći: ${next.vcpu} vCPU / ${next.ramGB} GB, ${fmtEur(priceOf(next.vcpu, next.ramGB))}`) : 'Kraj ponude: 8 vCPU / 16 GB.'}
            </span>
            {w.plugged ? (
              <Button variant="danger" icon={Power} onClick={() => mutate(pullPlug)} disabled={w.resizing} title={w.resizing ? 'Poslužitelj je već ugašen: mijenja veličinu' : 'Kvar napajanja: poslužitelj se gasi bez upozorenja'}>
                Izvuci utikač
              </Button>
            ) : (
              <Button variant="success" icon={Power} onClick={() => mutate(plugIn)}>
                Uključi poslužitelj
              </Button>
            )}
          </ControlGroup>
          <ControlGroup title="Napredno" collapsible>
            <Toggle label="Neograničeni radnici" checked={w.params.unbounded} onChange={(on) => mutate((st) => setUnbounded(st, on))} hint="poslužitelj prima zahtjeve bez obzira na RAM" />
            <Slider label="Duljina reda" value={w.params.queueMax} min={10} max={30} step={5} onChange={(x) => mutate((st) => setQueueMax(st, x))} format={(x) => `${x} mjesta`} />
          </ControlGroup>
        </>
      }
      stats={
        <>
          <StatRow>
            <Stat
              label="Uspješno"
              value={fmt.num(m.goodput, 1)}
              unit="/s"
              sub={`ponuđeno ${fmt.num(m.offered, m.offered % 1 ? 1 : 0)}/s · kapacitet ≈ ${fmt.num(cap.cap, 1)}/s`}
              tone={m.goodput < m.offered * 0.95 && m.offered > 0 ? 'warn' : 'ok'}
            />
            <Stat
              label="p95 latencija"
              value={fmtLat(p95)}
              sub={`p50 ${fmtLat(m.p50)} · p99 ${fmtLat(m.p99)} (uspješni, 10 s)`}
              tone={p95 === null ? 'neutral' : p95 >= 2000 ? 'bad' : 'ok'}
            />
            <Stat
              label="Greške (10 s)"
              value={fmt.pct(m.errorRate, 1)}
              sub={`503: ${m.errors[503]} · isteklo: ${m.errors[504]} · odbijeno: ${m.errors.refused}`}
              tone={m.errorRate >= 0.01 ? 'bad' : 'ok'}
            />
            <Stat label="Procesor" value={fmt.pct(sv.cpuSmooth)} sub={`radnici ${sv.busy}/${sv.workersLabel} · red ${sv.queue}/${sv.queueMax}`} tone={sv.cpuSmooth >= 0.9 ? 'bad' : sv.cpuSmooth >= 0.7 ? 'warn' : 'neutral'} />
            <Stat
              label={`Dostupnost (${avail.windowS < 60 ? `${avail.windowS} s` : '60 s'})`}
              value={avail.requests === null ? 'n/a' : fmt.pct(avail.requests, 1)}
              sub={`udio uspješnih zahtjeva · proces radi ${avail.processUp === null ? 'n/a' : fmt.pct(avail.processUp)}`}
              tone={avail.requests === null ? 'neutral' : avail.requests < 0.999 ? 'bad' : 'ok'}
            />
          </StatRow>
          <div className={styles.charts}>
            <LineChart
              series={[
                { label: 'ponuđeno/s', values: s.series.offered.values, color: 'var(--tray-ink)', dashed: true },
                { label: 'uspješno/s', values: s.series.goodput.values, color: 'var(--ok)', dashed: false },
                { label: 'greške/s', values: s.series.errors.values, color: 'var(--bad)' },
              ]}
              threshold={{ value: cap.cap, label: 'kapacitet', color: 'var(--pen)' }}
              window={120}
              height={150}
              yLabel="zahtjeva u sekundi"
              xLabel="zadnjih 60 s"
              formatY={(x) => fmt.num(x)}
            />
            <LineChart
              series={[{ label: 'p95 (s), samo uspješni', values: s.series.p95.values.map((x) => x / 1000), color: 'var(--pen)' }]}
              threshold={{ value: 2, label: 'cilj 2 s' }}
              yMax={5}
              window={120}
              height={150}
              yLabel="p95 latencija (s)"
              xLabel="zadnjih 60 s · rupa = n/a"
              formatY={(x) => fmt.num(x, 1)}
            />
          </div>
          <BurstReports reports={w.reports} />
          <div className={styles.goalsGrid}>
            <Goals
              goals={[
                { text: 'Preživite nalet u 12:00 (I/O, 12 zahtjeva/s): p95 ispod 2 s i manje od 1 % grešaka.', done: g.survived },
                { text: `Isto, s poslužiteljem do ${GOAL_PRICE} € mjesečno (vCPU i RAM smijete složiti i izvan ponude).`, done: g.survivedCheap },
                { text: 'Pronađite opterećenje za koje više RAM-a ne pomaže.', done: g.ramNoHelp },
                { text: 'Uključite „Neograničene radnike” i dočekajte OOM.', done: g.oom },
              ]}
            />
            <EventLog events={s.events.slice(-20)} />
          </div>
          <p className={styles.simNote}>
            Simulacija mjeri poslužitelj s redom od {w.params.queueMax} mjesta ispred radnika (kao HAProxy s <code>maxconn</code> i <code>maxqueue</code>, vidi „Tko vraća 503, a tko 502?”), bez Caddyja
            ispred: {errorLabel(503, s.cfg.mode)} odmah kad su radnici i red puni · {errorLabel(504, s.cfg.mode)} nakon {fmt.num(s.cfg.clientTimeoutMs / 1000)} s (sim) ·{' '}
            {errorLabel('refused', s.cfg.mode)} kad stroj radi, a proces ne (OOM, ponovno pokretanje); kroz Caddy bi to bio 502.
          </p>
        </>
      }
    >
      <div ref={ref}>
        <ServerStage layout={layout} label={label} view={view} />
        <Legend
          items={[
            { color: 'var(--tray)', label: 'zahtjev', shape: 'tray' },
            { color: 'var(--food)', label: 'tanjur s hranom = radnik zauzet', shape: 'dot' },
            { color: 'var(--pen)', label: 'radnik čeka bazu', shape: 'dashed' },
            { color: 'var(--hl-pink-ink)', label: 'jezgra radi', shape: 'square' },
            { color: 'var(--red)', label: 'odbijen / istekao', shape: 'cross' },
          ]}
        />
      </div>
    </SimFrame>
  )
}
