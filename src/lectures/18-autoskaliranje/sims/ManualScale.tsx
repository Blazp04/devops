/**
 * „Davorov posao” (feel the pain): the incident cluster without KEDA and without an HPA; the reader plays
 * `kubectl scale` (the engine's scaleDeployment), so nothing reacts by itself. The burst comes at noon (t = 60 s of
 * profile time); the goals ask the reader to be on time, to be late once and to remember to scale back down.
 */
import { Button, EventLog, Goals, SimFrame, Slider, Stat, StatRow, fmt, useSimulation, type SimEvent } from '../../../kit'
import { clusterCost, scaleDeployment, setTrafficProfile, streamRate } from '../../../engines/cluster'
import { billedNodes, createFlagship, menzaClock, note, profileOf, profileTime, stepFlagship, trialPassed, webStream, type FlagshipState } from '../lib/flagship'
import { API, EUR_PER_NODE_H, apiReady, apiReplicas } from '../lib/story'
import { eur, latency, nodes as nodesWord } from '../lib/format'
import { FlagshipStage } from './FlagshipStage'
import styles from '../styles.module.css'

const SHOWN = new Set(['ca-scale-up', 'ca-scale-down', 'ca-removed', 'failed-scheduling', 'node-ready'])

export function ManualScale() {
  const sim = useSimulation<FlagshipState>({
    init: () => createFlagship('manual'),
    step: (st, dt) => stepFlagship(st, dt),
    fixedDt: 0.1,
    speed: 5,
  })
  const st = sim.state
  const c = st.c
  const web = webStream(c)
  const rps = web ? streamRate(c, web) : 0
  const p95 = web ? web.p95Ms : 0
  const mean = web ? web.latencyMs : 0
  const errPerS = Math.max(0, c.series.errPerS.last(0))
  const replicas = apiReplicas(c)
  const ready = apiReady(c)
  const pending = c.pods.filter((p) => !p.nodeName && !p.deletion && p.labels.app === API).length
  const cost = clusterCost(c, EUR_PER_NODE_H)
  const pt = profileTime(c)
  const passed = st.results.some(trialPassed)
  const tr = st.trial
  const last = st.results.at(-1)
  const events: SimEvent[] = [...c.events.filter((e) => SHOWN.has(e.kind)).map((e) => ({ t: e.t, text: e.text, tone: e.tone, id: e.id })), ...st.ui].sort((a, b) => a.t - b.t)

  const scale = (v: number) =>
    sim.mutate((x) => {
      const before = apiReplicas(x.c)
      if (v === before || !scaleDeployment(x.c, API, v).ok) return
      note(x, `kubectl scale --replicas=${v}`)
      if (x.trial && v > before) x.lateRaise = true
      if (!x.trial && x.results.length > 0 && v <= 2) x.loweredAfter = true
    })

  return (
    <SimFrame
      title="Davorov posao"
      subtitle="klopa-api bez HPA-a: replike postavljate sami · nalet u 12:00 · seed 42"
      sim={{ ...sim, time: c.t }}
      showTime
      speeds={[1, 5, 10, 30]}
      minHeight={320}
      hint="Budite Davor: postavite broj replika prije 12:00 i prođite nalet. Zatim zakasnite jednom – pa se sjetite vratiti replike na 2."
      controls={
        <>
          <Slider label="Replike (kubectl scale)" value={replicas} min={1} max={12} onChange={scale} />
          <Button
            variant="secondary"
            onClick={() =>
              sim.mutate((x) => {
                setTrafficProfile(x.c, 'web', profileOf('spike'))
                x.trial = null
                note(x, 'Novo podne: nalet za 60 s')
              })
            }
          >
            Ponovi podne
          </Button>
          <p className={styles.ctlNote}>Na jedan čvor stanu 3 Poda. Za više Podova Cluster Autoscaler naručuje novi čvor: {fmt.num(75)} s (sim), stvarno minute.</p>
        </>
      }
      stats={
        <>
          <StatRow>
            <Stat label="Sat u menzi" value={menzaClock(c)} sub={pt < 60 ? `nalet za ${Math.ceil(60 - pt)} s` : tr ? 'nalet traje' : 'nalet je prošao'} tone={pt < 60 ? undefined : tr ? 'warn' : undefined} />
            <Stat label="Podovi klopa-api" value={`${ready}/${replicas}`} sub={pending > 0 ? `${pending} Pending` : 'spremni / željeno'} tone={pending > 0 ? 'warn' : undefined} />
            <Stat label="p95 (procjena)" value={latency(p95)} sub={`prosjek ${latency(mean)}`} tone={p95 < 300 ? 'ok' : p95 < 1000 ? 'warn' : 'bad'} />
            <Stat label="Odbijeno" value={`${fmt.num((100 * errPerS) / Math.max(rps, 1))} %`} sub={`${fmt.num(errPerS)} zahtjeva/s`} tone={errPerS > 0.5 ? 'bad' : 'ok'} />
            <Stat label="Trošak sada" value={eur(cost.eurPerHourNow)} unit="/h" sub={`${nodesWord(billedNodes(c))} · zamišljeno 0,10 € po čvoru`} />
          </StatRow>
          <div className={styles.statsGrid}>
            <Goals
              goals={[
                { text: 'Prođite nalet: p95 < 300 ms, bez odbijenih zahtjeva', done: passed },
                { text: 'Zakasnite: povećajte replike tek kad nalet već traje', done: st.lateRaise },
                { text: 'Poslije naleta vratite replike na 2 (inače plaćate rezervu cijelo poslijepodne)', done: st.loweredAfter },
              ]}
            />
            <EventLog events={events} max={6} />
          </div>
        </>
      }
    >
      <div className={styles.stageCol}>
        <FlagshipStage c={c} />
        <p className={styles.trial} aria-live="off">
          {tr
            ? `Nalet u tijeku: najgori p95 ${latency(tr.worstP95)} · odbijeno ${fmt.num(tr.dropped)}`
            : last
              ? `Zadnji nalet: najgori p95 ${latency(last.worstP95)} · odbijeno ${fmt.num(last.dropped)} · najviše ${nodesWord(last.maxNodes)}${trialPassed(last) ? ' ✓' : ' ✗'}`
              : `Nalet počinje u 12:00 (t = 60 s): 20 → 100 zahtjeva/s, šest minuta.`}
        </p>
      </div>
    </SimFrame>
  )
}
