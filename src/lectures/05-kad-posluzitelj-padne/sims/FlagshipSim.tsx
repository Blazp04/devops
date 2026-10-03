/**
 * Flagship „Ugasite poslužitelj usred ručka”: the L04 rack behind a load balancer with active and passive health
 * checks, LB retry, per-server faults, and 20 users whose carts live locally, behind a sticky cookie or in Redis.
 * Model: E1 Promet (src/engines/traffic), the validated preset l05-incident (see ../lib/flagship.ts).
 */
import { useState } from 'react'
import { Pause, Power, RotateCcw, Snowflake } from 'lucide-react'
import {
  Button,
  ControlGroup,
  EventLog,
  Goals,
  Legend,
  LineChart,
  Meter,
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
  TIMING,
  capacityReport,
  crashServer,
  drainServer,
  hangServer,
  mark,
  metrics,
  powerOff,
  pushEvent,
  restartServer,
  setLbUp,
  setRedisUp,
  stepTraffic,
  undrainServer,
  type Algo,
} from '../../../engines/traffic'
import {
  INCIDENT_CONTROLS,
  INCIDENT_PRESET,
  SESSION_NAME,
  applyControls,
  REPLAY_START_MS,
  createReplay,
  goalsReached,
  lastWindow,
  menzaClock,
  track,
  type FlagControls,
  type FlagGoals,
  type FlagState,
  type SessionMode,
} from '../lib/flagship'
import { stageGeo } from '../lib/stage'
import { FlagshipStage } from './FlagshipStage'

const ALGOS: { value: Algo; label: string }[] = [
  { value: 'rr', label: 'Kružno' },
  { value: 'wrr', label: 'Težinsko' },
  { value: 'lc', label: 'Najmanje veza' },
]

const SESSIONS: { value: SessionMode; label: string; title: string }[] = [
  { value: 'local', label: 'U memoriji', title: 'Košarica u memoriji poslužitelja koji je obradio zahtjev' },
  { value: 'cookie', label: 'Ljepljivo', title: 'Košarica u memoriji, a kolačić load balancera vraća studenta na isti poslužitelj' },
  { value: 'redis', label: 'U Redisu', title: 'Košarica u zajedničkom Redisu' },
]

const SERVERS = [
  { value: 's1', label: 'S1 · mali' },
  { value: 's2', label: 'S2 · srednji' },
  { value: 's3', label: 'S3 · veliki' },
]

const NO_GOALS: FlagGoals = { crash: false, drain: false, sessions: false }

export function FlagshipSim() {
  const [c, setC] = useState<FlagControls>(INCIDENT_CONTROLS)
  const [target, setTarget] = useState('s3')
  const [goals, setGoals] = useState<FlagGoals>(NO_GOALS)
  const [ref, width] = useWidth<HTMLDivElement>()
  const geo = stageGeo(width !== null && width < 650)

  const sim = useSimulation<FlagState>({
    init: () => createReplay(c),
    step: (w, dt) => {
      applyControls(w, w.controls)
      stepTraffic(w.s, dt)
      track(w)
      const g = goalsReached(w)
      if ((g.crash && !goals.crash) || (g.drain && !goals.drain) || (g.sessions && !goals.sessions)) {
        setGoals((old) => ({ crash: old.crash || g.crash, drain: old.drain || g.drain, sessions: old.sessions || g.sessions }))
      }
    },
  })

  /** A control changes the model at once (also while paused) and leaves a line in the log. */
  const change = (patch: Partial<FlagControls>, note?: string) => {
    const next = { ...c, ...patch }
    setC(next)
    sim.mutate((w) => {
      applyControls(w, next)
      if (note) pushEvent(w.s, note, 'info', 'config')
    })
  }
  const act = (fn: (w: FlagState) => void) => sim.mutate(fn)
  /** Back to the incident's preset: its controls and the replay from 12:02:55 */
  const incidentPreset = () => {
    setC(INCIDENT_CONTROLS)
    setTarget('s3')
    sim.mutate((st) => {
      Object.assign(st, createReplay(INCIDENT_CONTROLS))
    })
  }

  const w = sim.state
  const s = w.s
  const m = metrics(s)
  const v = s.servers.find((x) => x.id === target)
  const last = lastWindow(w)
  const cap = capacityReport(s)
  const after = last && last.inc.after30s
  const afterRate = after && after.ok + after.failed > 0 ? after.failed / (after.ok + after.failed) : 0
  const det = last && last.inc.detectedAt !== null ? last.inc.detectedAt - last.inc.t0 : null
  // detection was fast, yet the goal failed: the errors come from the survivors running at 100 % (N+1)
  const n1Note = !!(after && after.done && afterRate >= 0.02 && last && last.inc.failedBeforeDetection <= 5)
  const logouts = s.totals.sessionLost - w.logoutBase
  // the log runs on the story clock, and its loss summaries count from 12:02:55 like the stat (the engine's „ukupno”
  // includes the unseen pre-roll, and its first summary covers mostly pre-roll seconds, so that one is left out)
  const events = s.events
    .slice(-20)
    .filter((e) => !(e.t * 1000 < REPLAY_START_MS + 5000 && e.text.startsWith('Sesije izgubljene')))
    .map((e) => ({
      ...e,
      t: e.t - REPLAY_START_MS / 1000,
      text: `${menzaClock(e.t * 1000)} · ${e.text.replace(/\(ukupno ([\d.]+)\)/, (_, n: string) => `(od 12:02:55 ukupno ${Math.max(0, Number(n.replace(/\./g, '')) - w.logoutBase)})`)}`,
    }))

  return (
    <SimFrame
      title="Ugasite poslužitelj usred ručka"
      subtitle={`Simulacija kreće u 12:02:55 s postavkama s dana incidenta (${INCIDENT_PRESET}, seed 42); u 12:03:00 proces na S3 pada. „Ispočetka” ponavlja ručak s istim seedom i vašim postavkama – ali svaka promjena postavki mijenja i redoslijed slučajnih događaja.`}
      sim={sim}
      hint="gledajte kako redar još dvije sekunde šalje narudžbe srušenom S3. Zatim uključite ponovni pokušaj, prebacite košarice u Redis i pokrenite isti ručak ispočetka."
      controls={
        <>
          <ControlGroup title="Promet i raspodjela">
            <Button size="sm" icon={RotateCcw} onClick={incidentPreset} title="Vrati postavke s dana incidenta i pokreni ručak ispočetka (12:02:55)">
              Postavke incidenta
            </Button>
            <Slider label="Promet" value={c.lambda} min={5} max={30} onChange={(x) => change({ lambda: x }, `Promet: ${x} zahtjeva/s`)} format={(x) => `${x} zahtjeva/s`} />
            <Segmented label="Algoritam" value={c.algo} options={ALGOS} onChange={(a) => change({ algo: a })} size="sm" />
          </ControlGroup>
          <ControlGroup title="Kvar na poslužitelju">
            <Segmented label="Poslužitelj" value={target} options={SERVERS} onChange={setTarget} size="sm" />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Button variant="danger" size="sm" onClick={() => act((st) => crashServer(st.s, target))}>
                Sruši proces
              </Button>
              <Button variant="danger" size="sm" icon={Power} onClick={() => act((st) => powerOff(st.s, target))}>
                Ugasi stroj
              </Button>
              <Button variant="danger" size="sm" icon={Snowflake} onClick={() => act((st) => hangServer(st.s, target))}>
                Zamrzni
              </Button>
              {v?.draining ? (
                <Button size="sm" icon={Pause} active onClick={() => act((st) => undrainServer(st.s, target))}>
                  Vrati u promet
                </Button>
              ) : (
                <Button
                  size="sm"
                  icon={Pause}
                  onClick={() =>
                    act((st) => {
                      if (target === 's2') st.drain = { m: mark(st.s), drainedAt: null }
                      drainServer(st.s, target)
                    })
                  }
                >
                  Isprazni
                </Button>
              )}
              <Button variant="success" size="sm" icon={RotateCcw} onClick={() => act((st) => restartServer(st.s, target))}>
                Ponovno pokreni
              </Button>
            </div>
          </ControlGroup>
          <ControlGroup title="Provjere ispravnosti">
            <Slider
              label="Interval provjere"
              value={c.intervalMs / 1000}
              min={1}
              max={10}
              onChange={(x) => change({ intervalMs: x * 1000 }, `Provjera svakih ${x} s (sim)`)}
              format={(x) => `${x} s (sim)`}
              hint={`stvarno, AWS ALB zadano: ${TIMING.healthInterval.real / 1000} s`}
            />
            <Slider label="Prag (neuspjeha zaredom)" value={c.threshold} min={1} max={5} onChange={(x) => change({ threshold: x }, `Prag: ${plural(x, ['neuspjeh', 'neuspjeha', 'neuspjeha'])} zaredom`)} format={(x) => `${x}`} hint="AWS ALB zadano: 2" />
            <Toggle label="Pasivna provjera" checked={c.passive} onChange={(x) => change({ passive: x }, x ? 'Pasivna provjera uključena: prvi neuspjeh izbacuje poslužitelj na 10 s.' : 'Pasivna provjera isključena.')} hint="zadano u NGINX-u (max_fails=1)" />
            <Toggle label="Ponovni pokušaj" checked={c.retry} onChange={(x) => change({ retry: x }, x ? 'Ponovni pokušaj uključen: odbijeni zahtjev ide jednom drugom poslužitelju.' : 'Ponovni pokušaj isključen.')} hint="odbijeno → još jednom, na drugom" />
            <Toggle
              label="Svi izbačeni → šalji svima"
              checked={c.failOpen}
              onChange={(x) => change({ failOpen: x }, x ? 'Kad nijedan poslužitelj ne prođe provjeru, load balancer ipak šalje svima (kao AWS ALB).' : 'Kad nijedan poslužitelj ne prođe provjeru, load balancer odgovara 503.')}
              hint="kao AWS ALB (engl. fail-open); inače 503"
            />
          </ControlGroup>
          <ControlGroup title="Gdje žive košarice">
            <Segmented label="Sesije" value={c.sessions} options={SESSIONS} onChange={(x) => change({ sessions: x }, `Košarice: ${SESSION_NAME[x]}.`)} size="sm" />
          </ControlGroup>
          <ControlGroup title="Pokvarite i ovo">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {s.redisUp ? (
                <Button variant="danger" size="sm" onClick={() => act((st) => setRedisUp(st.s, false))}>
                  Ugasi Redis
                </Button>
              ) : (
                <Button variant="success" size="sm" icon={Power} onClick={() => act((st) => setRedisUp(st.s, true))}>
                  Upali Redis
                </Button>
              )}
              {s.lbUp ? (
                <Button variant="danger" size="sm" onClick={() => act((st) => setLbUp(st.s, false))}>
                  Ugasi load balancer
                </Button>
              ) : (
                <Button variant="success" size="sm" icon={Power} onClick={() => act((st) => setLbUp(st.s, true))}>
                  Upali load balancer
                </Button>
              )}
            </div>
          </ControlGroup>
        </>
      }
      stats={
        <>
          <StatRow>
            <Stat label="uspješno" value={fmt.num(m.goodput, 1)} unit="/s" tone="ok" spark={s.series.goodput.values.slice(-40)} />
            <Stat label="p95 (10 s)" value={m.p95 === null ? 'n/a' : fmt.ms(m.p95)} tone={m.p95 !== null && m.p95 > 3000 ? 'bad' : undefined} sub="samo uspješni zahtjevi" />
            <Stat
              label="greške (10 s)"
              value={fmt.pct(m.errorRate, 1)}
              tone={m.errorRate > 0.02 ? 'bad' : m.errorRate > 0 ? 'warn' : 'ok'}
              sub={`502: ${m.errors[502]} · 503: ${m.errors[503]} · 504: ${m.errors[504]}${m.errors.refused ? ` · odbijeno: ${m.errors.refused}` : ''}`}
            />
            <Stat label="odjave od 12:02:55" value={fmt.num(logouts)} tone={logouts > 0 ? 'bad' : 'ok'} sub={c.sessions === 'local' ? 'i bez pada: svaki skok na drugi poslužitelj = odjava' : `20 studenata · košarice ${SESSION_NAME[c.sessions]}`} />
          </StatRow>
          <div style={{ marginTop: 16 }}>
            <Meter
              label="ako sada padne najveći poslužitelj, ostali rade na"
              value={Math.min(1, cap.utilisationAfterFailure)}
              valueLabel={Number.isFinite(cap.utilisationAfterFailure) ? fmt.pct(cap.utilisationAfterFailure) : 'nema preživjelih'}
              tone={cap.ok ? 'ok' : 'bad'}
            />
          </div>
          <LineChart
            series={[
              { label: 'uspješno/s', values: s.series.goodput.values, color: 'var(--ok)' },
              { label: 'greške/s', values: s.series.errors.values, color: 'var(--bad)', area: true },
            ]}
            window={120}
            height={130}
            yLabel="zahtjeva u sekundi"
            xLabel="zadnjih 60 s"
          />
          <div style={{ marginTop: 22 }}>
            <EventLog events={events} />
          </div>
        </>
      }
    >
      {/* marginBottom auto: keep the stage at the top of the sheet beside the tall controls column */}
      <div ref={ref} style={{ width: '100%', marginBottom: 'auto' }}>
        <div style={geo.narrow ? { maxWidth: 460, margin: '0 auto' } : undefined}>
          <FlagshipStage s={s} geo={geo} sessions={c.sessions} drops={w.drops} />
        </div>
        <Legend
          items={[
            { color: 'var(--tray)', label: 'narudžba (zahtjev)', shape: 'tray' },
            { color: 'var(--green)', label: 'odgovor stigao', shape: 'check' },
            { color: 'var(--red)', label: 'propala (502 · 503 · 504)', shape: 'cross' },
            { color: 'var(--red)', label: 'redar tamo više ne šalje', shape: 'dashed' },
          ]}
        />
        <p style={{ fontFamily: 'var(--f-hand)', fontSize: 21, fontWeight: 600, color: 'var(--red)', margin: '18px 0 6px' }}>
          {last ? `zadnji pad: ${last.inc.server.toUpperCase()} (${last.inc.kind === 'crash' ? 'proces' : last.inc.kind === 'off' ? 'stroj ugašen' : last.inc.kind === 'hang' ? 'zamrznut' : 'OOM'})` : 'zadnji pad: još nema'}
        </p>
        <StatRow>
          <Stat label="propalo prije otkrivanja" value={last ? fmt.num(last.inc.failedBeforeDetection) : '–'} tone={last ? (last.inc.failedBeforeDetection > 5 ? 'bad' : 'ok') : undefined} sub={det === null ? (last ? 'load balancer još ne zna' : 'srušite poslužitelj') : `otkriveno nakon ${fmt.num(det / 1000, 1)} s (sim)`} />
          <Stat
            label="greške u 30 s nakon pada"
            value={after ? (after.done ? fmt.pct(afterRate, 1) : `${after.failed} od ${after.ok + after.failed}`) : '–'}
            tone={after ? (after.done ? (afterRate < 0.02 ? 'ok' : 'bad') : after.failed > 0 ? 'warn' : undefined) : undefined}
            sub={after ? (after.done ? (n1Note ? 'preživjeli na 100 % – vidi N+1' : 'cilj: manje od 2 %') : 'mjeri se…') : undefined}
          />
          <Stat label="odjave u 30 s nakon pada" value={last && last.win.logouts30 !== null ? fmt.num(last.win.logouts30) : last ? `${fmt.num(last.inc.sessionsLost)}…` : '–'} tone={last && last.win.logouts30 !== null ? (last.win.logouts30 === 0 ? 'ok' : 'bad') : undefined} />
        </StatRow>
        <div style={{ marginTop: 22 }}>
          <Goals
            goals={[
              { text: 'Preživite pad procesa na S3 pri prometu od 15 zahtjeva/s uz manje od 2 % grešaka u 30 s nakon pada.', done: goals.crash },
              { text: 'Ispraznite S2 i držite ga 10 s izvan prometa bez ijedne neuspjele narudžbe.', done: goals.drain },
              { text: 'Neka pad bilo kojeg poslužitelja ne odjavi nikoga (0 odjava u 30 s nakon pada).', done: goals.sessions },
            ]}
          />
        </div>
      </div>
    </SimFrame>
  )
}
