import { Wrench, Zap } from 'lucide-react'
import { Button, Rough, ServerFace, SimFrame, Tray, fmt, useSimulation } from '../../../kit'
import { ALGO_LABEL, mark, metrics, resetHits, serversView, setSlow, since, stepTraffic, createTraffic, type Algo, type Mark, type ServerView, type TrafficState } from '../../../engines/traffic'
import { fmtSec, klopaRack } from '../lb'
import css from '../styles.module.css'

/* „Kad se poslužitelj uspori”: two copies of Klopa's rack get exactly the same arrivals (seed 42, split RNG streams).
   Left: weighted round robin (static weights 1 : 2 : 4). Right: least connections. One button makes Veliki's CPU
   work 3× slower in both (a noisy neighbour, a throttled CPU – engine setSlow). */

const ALGOS: [Algo, Algo] = ['wrr', 'lc']
const LAMBDA = 15

interface PairState {
  runs: TrafficState[]
  slowSince: Mark[] | null
}

function createPair(): PairState {
  return {
    runs: ALGOS.map((algo) => createTraffic({ seed: 42, mode: 'lb', servers: klopaRack(), workload: 'api', lambda: LAMBDA, algo, rngStreams: 'split' })),
    slowSince: null,
  }
}

const COLS = [62, 158, 254]
const SLOT_H = 11
const QTOP = 96

function moodOf(v: ServerView): 'calm' | 'busy' | 'panic' {
  if (v.queue >= v.queueMax - 1 || v.errors10s.full + v.errors10s.timeout > 0) return 'panic'
  if (v.cpuSmooth > 0.75 || v.queue > 0) return 'busy'
  return 'calm'
}

function Panel({ s }: { s: TrafficState }) {
  const views = serversView(s)
  const hits = views.reduce((a, v) => a + v.hits, 0) || 1
  return (
    <svg
      className={css.drawing}
      viewBox="0 0 300 288"
      style={{ maxWidth: 380 }}
      role="img"
      aria-label={views.map((v) => `${v.name}: ${v.active} nezavršenih zahtjeva, red ${v.queue} od ${v.queueMax}, CPU ${Math.round(v.cpuSmooth * 100)} %, dobiva ${Math.round((v.hits / hits) * 100)} % prometa`).join('; ')}
    >
      {views.map((v, i) => {
        const x = COLS[i]
        const slow = v.slowFactor > 1
        return (
          <g key={v.id}>
            {slow && <Rough shape={{ k: 'rect', x: x - 44, y: 4, w: 88, h: 280 }} seed={6600 + i} stroke="var(--orange)" strokeWidth={1.8} dash="6 5" />}
            <g transform={`translate(${x} 34)`}>
              <ServerFace mood={moodOf(v)} r={19} />
            </g>
            <text x={x} y={76} textAnchor="middle" className="k-svg-display" style={{ fontSize: 17 }}>
              {v.name}
            </text>
            {slow && (
              <text x={x} y={92} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 18, fill: 'var(--orange)' }}>
                3× sporiji
              </text>
            )}
            {Array.from({ length: v.queueMax }, (_, q) => {
              const y = QTOP + 104 - (q + 1) * SLOT_H
              return (
                <g key={q}>
                  <rect x={x - 17} y={y} width={34} height={SLOT_H - 2} rx={1.5} className={css.qslot} />
                  {q < v.queue && <Tray x={x} y={y + 4} w={22} />}
                </g>
              )
            })}
            <text x={x} y={QTOP + 124} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 13.5, fill: v.cpuSmooth >= 0.95 ? 'var(--red)' : 'var(--ink-2)' }}>
              CPU {Math.round(v.cpuSmooth * 100)} %
            </text>
            <text x={x} y={QTOP + 146} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 13.5, fontWeight: 700, fill: 'var(--pen)' }}>
              {v.active}
            </text>
            <text x={x} y={QTOP + 170} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 13.5, fontWeight: 700, fill: 'var(--tray-ink)' }}>
              {Math.round((v.hits / hits) * 100)} %
            </text>
          </g>
        )
      })}
      <text x={2} y={QTOP + 100} className="k-svg-hand" style={{ fontSize: 17, fill: 'var(--ink-3)' }}>
        red
      </text>
      <text x={2} y={QTOP + 146} className="k-svg-hand" style={{ fontSize: 17, fill: 'var(--pen)' }}>
        veze
      </text>
      <text x={2} y={QTOP + 170} className="k-svg-hand" style={{ fontSize: 17, fill: 'var(--tray-ink)' }}>
        udio
      </text>
    </svg>
  )
}

export function SlowServer() {
  const sim = useSimulation({
    init: createPair,
    step: (p, dt) => {
      for (const s of p.runs) stepTraffic(s, dt)
    },
  })
  const p = sim.state
  const slowOn = p.runs[0].servers[2].slowFactor > 1
  const toggle = () =>
    sim.mutate((x) => {
      const f = slowOn ? 1 : 3
      for (const s of x.runs) {
        setSlow(s, 's3', f)
        resetHits(s)
      }
      x.slowSince = slowOn ? null : x.runs.map((s) => mark(s))
    })
  return (
    <SimFrame
      title="isti promet, Veliki se uspori"
      subtitle={`Lijevo i desno stižu točno isti zahtjevi (seed 42, ${LAMBDA} zahtjeva/s, API). Lijevo dijeli težinsko kružno (1 : 2 : 4), desno najmanje veza.`}
      sim={sim}
      showTime
      minHeight={300}
      hint="pustite da se promet smiri, pa usporite Velikog i gledajte redove i udio prometa."
      controls={
        <>
          <Button variant={slowOn ? 'success' : 'danger'} icon={slowOn ? Wrench : Zap} onClick={toggle}>
            {slowOn ? 'Popravi Velikog' : 'Uspori Velikog (×3)'}
          </Button>
          <p className={css.small}>Usporen procesor: isti posao traje 3× dulje i drži jezgru (npr. bučni susjed na istom fizičkom stroju).</p>
          <p className={css.small}>„Veze” su zahtjevi koji su u obradi ili čekaju u redu – broj koji gleda algoritam najmanje veza.</p>
        </>
      }
    >
      <div className={css.pair}>
        {p.runs.map((s, i) => {
          const m = metrics(s)
          const w = p.slowSince ? since(s, p.slowSince[i]) : null
          return (
            <div key={i} className={css.pairCol}>
              <p className={css.pairTitle}>{ALGO_LABEL[ALGOS[i]]}</p>
              <Panel s={s} />
              <p className={css.pairStats}>
                <span className={m.errorRate > 0.01 ? css.bad : css.ok}>
                  {m.errorRate > 0.01 ? '✗' : '✓'} greške (10 s): {fmt.pct(m.errorRate, 1)}
                </span>
                <span>p95: {fmtSec(m.p95)}</span>
                {w && w.durationS > 1 && <span>od usporavanja: {fmt.pct(w.errorRate, 1)} grešaka</span>}
              </p>
            </div>
          )
        })}
      </div>
    </SimFrame>
  )
}
