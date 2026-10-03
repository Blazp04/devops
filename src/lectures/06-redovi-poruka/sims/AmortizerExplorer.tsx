import { useMemo, useState } from 'react'
import { LineChart, Rough, SimFrame, Slider, Stat, StatRow, fmt, plural } from '../../../kit'
import { BASE_RATE, BURST_AT, BURST_S, RUN_S, runAmortizer, snapshotAt } from '../amortizer'
import { RailStage } from './RailStage'
import { metrics } from '../../../engines/queue'
import styles from '../styles.module.css'

const PORUKA: [string, string, string] = ['poruka', 'poruke', 'poruka']
/** depth chart height and where LineChart draws its plot inside its sheet (padding 10/12/8/6 + y label 21 px + plot inset 44/16/12) */
const DEPTH_H = 170
const PLOT_TOP = 43
const PLOT_LEFT = 50
const PLOT_RIGHT = 28
const secs = (v: number) => `${fmt.num(v, v < 10 ? 1 : 0)} s`

/**
 * Scene „Red kao amortizer”: two scrubbable rates (the burst λ and the consumers k·μ) and the depth of the queue over the
 * seeded Ćevap-petak (E2, sjeme 36343), next to the same orders sent without a queue.
 */
export function AmortizerExplorer() {
  const [rate, setRate] = useState(15)
  const [k, setK] = useState(4)
  const [at, setAt] = useState(BURST_AT + BURST_S - 1)
  const run = useMemo(() => runAmortizer(rate, k), [rate, k])
  const snap = useMemo(() => snapshotAt(rate, k, at), [rate, k, at])
  const snapM = metrics(snap)
  const snapReady = snapM.backlog
  const snapBusy = snapM.consumers.busy
  const grow = rate - k
  const drains = k > BASE_RATE
  const predictedPeak = Math.max(0, grow) * BURST_S
  const predictedDrain = drains ? predictedPeak / (k - BASE_RATE) : Infinity
  return (
    <SimFrame
      title="Red kao amortizer"
      subtitle={`Isti petak dvaput: 150 s, inače ${BASE_RATE} narudžbe u sekundi, a od 30. do 40. sekunde nalet. Svaki potrošač (ili radnik API-ja bez reda) obradi prosječno jednu narudžbu u sekundi.`}
      hint="pomaknite oba klizača. Kad je nalet jači od kapaciteta, red raste; kad nalet prođe, prazni se razlikom kapaciteta i prometa. Klizač „Trenutak” pokazuje šinu u odabranoj sekundi."
      minHeight={0}
      controls={
        <>
          <Slider label="Nalet λ" value={rate} min={2} max={20} onChange={setRate} format={(v) => `${v}/s`} hint={`tijekom ${BURST_S} s`} />
          <Slider label="Potrošači k" value={k} min={1} max={12} onChange={setK} hint={`kapacitet kμ = ${k} × 1/s = ${k}/s`} />
          <div className={styles.formula}>
            <p>
              <span className={styles.formulaLabel}>za vrijeme naleta</span>
              {grow > 0 ? (
                <>
                  red raste za <span className="mono">λ − kμ = {rate} − {k} = {grow}</span> {plural(grow, PORUKA, false)}/s → za {BURST_S} s oko <span className="mono">{predictedPeak}</span> {plural(predictedPeak, PORUKA, false)}
                </>
              ) : (
                <>kapacitet prati nalet: red jedva nastane</>
              )}
            </p>
            <p>
              <span className={styles.formulaLabel}>nakon naleta</span>
              {drains && predictedPeak === 0 ? (
                <>nema zaostatka – red se isprazni odmah</>
              ) : drains ? (
                <>
                  prazni se za <span className="mono">zaostatak / (kμ − λ) ≈ {predictedPeak} / ({k} − {BASE_RATE}) ≈ {secs(predictedDrain)}</span>
                </>
              ) : k === BASE_RATE ? (
                <>
                  <span className={styles.bad}>kμ = λ: zaostatak se ne smanjuje</span>
                </>
              ) : (
                <>
                  <span className={styles.bad}>kμ &lt; λ: red se nikad ne isprazni</span> – raste bez kraja
                </>
              )}
            </p>
          </div>
        </>
      }
      stats={
        <StatRow>
          <Stat label="Bez reda: izgubljeno" value={`${run.lostDirect} / ${run.ordersDirect}`} tone={run.lostDirect > 0 ? 'bad' : 'ok'} sub={`${fmt.pct(run.ordersDirect ? run.lostDirect / run.ordersDirect : 0)} dobije 503`} />
          <Stat label="S redom: izgubljeno" value={`${run.lostQueue} / ${run.orders}`} tone={run.lostQueue > 0 ? 'bad' : 'ok'} sub="red čuva svaku narudžbu" />
          <Stat label="Vrh reda" value={run.peak} tone={run.peak > 60 ? 'warn' : 'neutral'} sub={grow > 0 ? `predviđeno ~${predictedPeak}` : 'nalet ≤ kapacitet'} />
          <Stat label="Red prazan nakon" value={run.drainS !== null ? secs(run.drainS) : drains ? '–' : '∞'} tone={run.drainS === null && !drains ? 'bad' : 'neutral'} sub={`najdulje čekanje ${secs(run.maxWaitS)}`} />
        </StatRow>
      }
    >
      <div style={{ display: 'grid', gap: 18, width: '100%' }}>
        <RailStage
          s={snap}
          id="amort"
          lanes={{ retry: false, invisible: false, dlq: false, sms: false }}
          label={`Kuhinjska šina u ${at}. sekundi: listića na šini ${snapReady}, potrošača koji kuhaju ${snapBusy} od ${k}.`}
        />
        {/* the scrubber sits right under the rail it moves (on phones the controls panel is far below) */}
        <Slider label="Trenutak" value={at} min={0} max={RUN_S} onChange={setAt} format={(v) => `${v}. s`} hint={at >= BURST_AT && at <= BURST_AT + BURST_S ? 'usred naleta' : at < BURST_AT ? 'prije naleta' : 'nakon naleta'} />
        <div style={{ position: 'relative' }}>
          <LineChart series={[{ label: 'poruka u redu (s redom)', values: run.depth, color: 'var(--tray-ink)', area: true }]} window={RUN_S * 2} height={DEPTH_H} yLabel="poruka u redu" xLabel={`0–${RUN_S} s`} />
          {/* the chosen second as a red pencil line over the plot (LineChart has no marker prop; geometry = its padding) */}
          <div aria-hidden="true" style={{ position: 'absolute', top: PLOT_TOP, left: PLOT_LEFT, right: PLOT_RIGHT, height: DEPTH_H - 22, pointerEvents: 'none' }}>
            <svg style={{ position: 'absolute', left: `calc(${(100 * at) / RUN_S}% - 6px)`, top: -16, width: 12, height: DEPTH_H - 6, overflow: 'visible' }}>
              <Rough shape={{ k: 'line', x1: 6, y1: 14, x2: 6, y2: DEPTH_H - 6 }} seed={8350} stroke="var(--red)" strokeWidth={1.6} dash="4 4" roughness={0.5} />
              <text x={at > RUN_S * 0.8 ? 2 : 10} y={30} textAnchor={at > RUN_S * 0.8 ? 'end' : 'start'} className="k-svg-hand" style={{ fontSize: 18, fill: 'var(--red)' }}>
                {at}. s
              </text>
            </svg>
          </div>
        </div>
        <LineChart
          series={[
            { label: 'stiže λ', values: run.lambda, color: 'var(--tray-ink)' },
            { label: 'kapacitet kμ', values: run.capacity, color: 'var(--green)' },
          ]}
          window={RUN_S * 2}
          height={110}
          yMax={20}
          yLabel="narudžbi/s"
          xLabel={`0–${RUN_S} s`}
        />
      </div>
    </SimFrame>
  )
}
