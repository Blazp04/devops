import { Play } from 'lucide-react'
import { Button, EventLog, Goals, SimFrame, Stat, StatRow, fmt, useSimulation, useWidth } from '../../../kit'
import { configure, createTraffic, mark, metrics, routeManual, setAlgo, since, stepTraffic, type Mark, type TrafficState } from '../../../engines/traffic'
import { klopaRack, zahtjeva } from '../lb'
import { RackStage, type StageNote } from './RackStage'
import { StageLegend } from './StageLegend'
import css from '../styles.module.css'

/* „Vi ste load balancer”: the engine in manual mode (algo 'manual'). Requests wait at the redar until the student
   clicks a server; after 5 s of waiting the redar gives up and answers 504 (the engine's 5 s timeout, labelled as sim). Traffic rises from 1 to 6 requests/s over
   25 s – fine for a program, too fast for a person. „Automatski” hands the pile to least connections. */

interface GameState {
  tr: TrafficState
  /** set when the student switches to the algorithm */
  auto: Mark | null
  autoClearMs: number
  routed: number
  /** sticky goals */
  clean15: boolean
  held: boolean
}

const RAMP_S = 25
const PEAK = 6

function rateAt(tS: number): number {
  return Math.min(PEAK, 1 + ((PEAK - 1) * tS) / RAMP_S)
}

function createGame(): GameState {
  return {
    tr: createTraffic({ seed: 7, mode: 'lb', servers: klopaRack(), workload: 'api', lambda: 1, algo: 'manual' }),
    auto: null,
    autoClearMs: 0,
    routed: 0,
    clean15: false,
    held: false,
  }
}

function noteOf(g: GameState): StageNote {
  const s = g.tr
  if (g.auto) return s.pending.length ? { key: 'auto', text: 'Algoritam odlučuje u djeliću milisekunde.', tone: 'green' } : { key: 'auto2', text: 'Nema hrpe: svaki zahtjev odmah dobiva poslužitelj.', tone: 'green' }
  if (s.pending.length >= 6) return { key: 'pile', text: 'Hrpa raste! Studenti čekaju na vašu odluku.', tone: 'red' }
  return { key: 'go', text: 'kliknite poslužitelj: tamo ide sljedeći pladanj', tone: 'pen' }
}

export function ManualGame() {
  const [stageRef, stageW] = useWidth<HTMLDivElement>()
  const sim = useSimulation({
    init: createGame,
    step: (g, dt) => {
      const tS = g.tr.t / 1000
      configure(g.tr, { lambda: g.auto ? PEAK : rateAt(tS) })
      stepTraffic(g.tr, dt)
      if (g.auto) g.autoClearMs = g.tr.pending.length === 0 ? g.autoClearMs + dt * 1000 : 0
      const t = g.tr.totals
      if (!g.clean15 && g.routed >= 15 && t.e502 + t.e503 + t.e504 === 0) g.clean15 = true
      if (!g.held && !g.auto && g.tr.t >= RAMP_S * 1000 && t.e502 + t.e503 + t.e504 <= 3) g.held = true
    },
  })
  const g = sim.state
  const s = g.tr
  const m = metrics(s)
  const you = g.auto ? g.auto.totals : s.totals
  const after = g.auto ? since(s, g.auto) : null
  const pick = (id: string) =>
    sim.mutate((x) => {
      if (routeManual(x.tr, id)) x.routed++
    })
  const goAuto = () =>
    sim.mutate((x) => {
      if (x.auto) return
      x.auto = mark(x.tr)
      setAlgo(x.tr, 'lc')
    })
  const youOk = you.ok
  const youErr = you.e503 + you.e504 + you.e502
  const goals = [
    { text: 'Rasporedite 15 zahtjeva bez ijedne greške', done: g.clean15 },
    { text: 'Izdržite ručno 25 s (do 6 zahtjeva/s) s najviše 3 greške', done: g.held },
    { text: 'Pritisnite „Automatski” i gledajte kako hrpa nestaje', done: !!g.auto && g.autoClearMs >= 3000 },
  ]
  return (
    <SimFrame
      title="vi ste load balancer"
      subtitle="Klopini poslužitelji: Mali (1 vCPU / 2 GB), Srednji (2 / 4) i Veliki (4 / 8). Promet raste od 1 do 6 zahtjeva u sekundi."
      sim={sim}
      showTime
      minHeight={360}
      hint="kliknite poslužitelj (ili gumb ispod crteža) za svaki pladanj koji čeka kod redara. Kad vam postane previše, pritisnite „Automatski”."
      controls={
        <>
          <p className={css.rule}>
            Ako zahtjev kod redara čeka dulje od 5 s, load balancer odustaje i vraća grešku <strong>504</strong> (isteklo vrijeme). Pun red na poslužitelju vraća <strong>503</strong>.
          </p>
          <Button variant="primary" icon={Play} onClick={goAuto} active={!!g.auto}>
            {g.auto ? 'Automatski: najmanje veza' : 'Automatski'}
          </Button>
          <Button onClick={sim.reset}>Ispočetka, ručno</Button>
        </>
      }
      stats={
        <>
          <StatRow>
            <Stat label="stiže" value={fmt.num(m.offered, 1)} unit="/s" />
            <Stat label="čeka kod redara" value={s.pending.length} tone={s.pending.length >= 6 ? 'bad' : s.pending.length >= 3 ? 'warn' : 'neutral'} />
            <Stat label="vi: obrađeno" value={youOk} sub={`greške: ${youErr}${g.auto ? ' (ručni dio)' : ''}`} tone={youErr > 0 ? 'warn' : 'neutral'} />
            <Stat label="algoritam: obrađeno" value={after ? after.ok : '—'} sub={after ? `greške: ${after.errors.total}` : 'pritisnite „Automatski”'} tone={after && after.errors.total === 0 ? 'ok' : 'neutral'} />
          </StatRow>
          <div className={css.goalsGrid}>
            <Goals goals={goals} />
            <EventLog events={s.events} />
          </div>
        </>
      }
    >
      <div ref={stageRef} className={css.stage}>
        <RackStage
          s={s}
          width={stageW}
          lambda={m.offered}
          onPick={g.auto ? undefined : pick}
          note={noteOf(g)}
          label={`Ručno raspoređivanje: kod redara čeka ${zahtjeva(s.pending.length)}. Kliknite poslužitelj kojem želite poslati sljedeći zahtjev.`}
        />
      </div>
      {!g.auto && (
        <div className={css.pickRow} role="group" aria-label="Pošalji sljedeći zahtjev na">
          {s.servers.map((v) => (
            <Button key={v.id} size="sm" onClick={() => pick(v.id)}>
              → {v.name}
            </Button>
          ))}
        </div>
      )}
      <StageLegend compact />
    </SimFrame>
  )
}
