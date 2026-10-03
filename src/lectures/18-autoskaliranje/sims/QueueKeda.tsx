/**
 * Scene 5 „Potrošači po dubini reda” on the E2 queue engine (preset l18-keda-day): a compressed canteen day for
 * klopa-worker. KEDA's operator wakes the Deployment 0 → 1 on the first message, the HPA it creates does 1 ↔ N
 * with ⌈poruke / 10⌉, and after a quiet cooldown KEDA puts it back to 0. The day is squeezed into 300 s; KEDA's
 * timings are compressed ÷10 and every badge carries its real value.
 */
import {
  Button,
  DLabel,
  Diagram,
  Elastic,
  EventLog,
  Goals,
  LineChart,
  PodShape,
  Rough,
  SimFrame,
  Stat,
  StatRow,
  fmt,
  useSimulation,
  useWidth,
} from '../../../kit'
import { consumerViews, createPresetSim, currentRate, publishBatch, scalerView, step, type QueueState } from '../../../engines/queue'
import { messages, pods as podsWord } from '../lib/format'
import styles from '../styles.module.css'

const DAY = 300
const PARTS: { from: number; to: number; label: string }[] = [
  { from: 0, to: 30, label: 'noć' },
  { from: 30, to: 90, label: 'jutro' },
  { from: 90, to: 140, label: 'ručak' },
  { from: 140, to: 220, label: 'popodne' },
  { from: 220, to: 300, label: 'noć' },
]

export function QueueKeda() {
  const sim = useSimulation<QueueState>({ init: () => createPresetSim('l18-keda-day', { stopAtEnd: false }), step, speed: 2 })
  const s = sim.state
  const v = scalerView(s)
  const hist = v.history
  const woke = hist.some((d) => d.reason === 'keda-activate')
  const many = hist.some((d) => d.reason === 'hpa' && d.to >= 4)
  const slept = hist.some((d) => d.reason === 'keda-cooldown')
  return (
    <SimFrame
      title="Potrošači po dubini reda"
      subtitle="klopa-worker uz KEDA-u · jedan dan sažet u 300 s · KEDA-ina vremena ÷10"
      sim={{ ...sim, time: s.t }}
      showTime
      speeds={[1, 2, 4, 8]}
      hint="Gledajte noć, jutro i ručak. Pošaljite jednu narudžbu dok potrošač spava, pa +100 narudžbi usred ručka."
      controls={
        <>
          <div className={styles.btnCol}>
            <Button onClick={() => sim.mutate((x) => void publishBatch(x, 1))}>Pošalji jednu narudžbu</Button>
            <Button variant="secondary" onClick={() => sim.mutate((x) => void publishBatch(x, 100))}>
              +100 narudžbi
            </Button>
          </div>
          <dl className={styles.timings}>
            <dt>provjera reda (KEDA)</dt>
            <dd>{v.labels.polling}</dd>
            <dt>HPA</dt>
            <dd>{v.labels.hpaSync}</dd>
            <dt>natrag na 0 nakon</dt>
            <dd>{v.labels.cooldown}</dd>
          </dl>
        </>
      }
      stats={
        <>
          <StatRow>
            <Stat label="U redu" value={messages(Math.round(v.metric))} sub={`dolazi ${fmt.num(currentRate(s), 1)}/s`} />
            <Stat label="Potrošači" value={`${v.ready}/${v.replicas}`} sub={v.replicas === 0 ? 'spava (0 Podova)' : 'spremni / željeno'} tone={v.replicas === 0 ? undefined : 'ok'} />
            <Stat label="HPA: ⌈poruke / 10⌉" value={v.formulaDesired} sub="vrijedi kad je KEDA aktivna" />
            <Stat
              label="Natrag na 0 za"
              value={v.cooldownLeftS === null ? '–' : `${fmt.num(v.cooldownLeftS, 0)} s`}
              sub={v.cooldownLeftRealS === null ? 'red nije prazan' : `stvarno ${fmt.num(v.cooldownLeftRealS / 60, 1)} min`}
            />
          </StatRow>
          <LineChart
            series={[
              { label: 'poruke (spremne + nepotvrđene)', values: s.series.ready.values.map((r, i) => r + (s.series.unacked.values[i] ?? 0)), color: 'var(--tray-ink)', area: true },
              { label: 'potrošači × 10', values: s.series.replicas.values.map((r) => r * 10), color: 'var(--pen)' },
            ]}
            window={240}
            height={130}
            yLabel="poruke"
            xLabel="zadnje 2 min (sim)"
          />
          <div className={styles.statsGrid}>
            <Goals
              goals={[
                { text: 'Prva poruka budi potrošača iz nule (operator KEDA, 0 → 1)', done: woke },
                { text: 'Gužva u redu: HPA dodaje potrošače (1 → 4 ili više)', done: many },
                { text: 'Noću, kad je red prazan, KEDA vraća potrošače na 0', done: slept },
              ]}
            />
            <EventLog events={s.events} max={6} />
          </div>
        </>
      }
    >
      <QueueStage s={s} />
    </SimFrame>
  )
}

function QueueStage({ s }: { s: QueueState }) {
  const [ref, measured] = useWidth<HTMLDivElement>()
  const W = Math.max(300, Math.round(measured ?? 700))
  const wide = W >= 600
  const v = scalerView(s)
  const workers = consumerViews(s).filter((c) => c.status !== 'cancelled')
  const dayT = ((s.t % DAY) + DAY) % DAY
  const part = PARTS.find((p) => dayT >= p.from && dayT < p.to) ?? PARTS[0]
  const H = wide ? 254 : 390
  const dx0 = 10
  const dx1 = W - 10
  const dx = (t: number) => dx0 + (t / DAY) * (dx1 - dx0)
  const railY = 92
  const railW = wide ? Math.min(300, W * 0.42) : W - 20
  const per = Math.max(1, Math.floor((railW - 12) / 9))
  const shown = Math.min(Math.round(v.metric), per)
  const kx = wide ? 10 + railW + 30 : 10
  const ky = wide ? 78 : 160
  const px = 10
  const py = wide ? 210 : 300
  const activated = v.lastDecision?.reason
  return (
    <div ref={ref}>
      <Diagram width={W} height={H} label={`Dan u menzi: ${part.label}. U redu ${messages(Math.round(v.metric))}, potrošača ${v.replicas}.`}>
        {/* the day */}
        {PARTS.map((p, i) => (
          <g key={i}>
            <Rough shape={{ k: 'rect', x: dx(p.from), y: 18, w: dx(p.to) - dx(p.from), h: 18 }} seed={1990 + i} strokeWidth={1.1} stroke="var(--ink-3)" fillColor={p.label === 'noć' ? 'var(--ink-3)' : p.label === 'ručak' ? 'var(--hl-orange-ink)' : 'var(--hl-yellow-ink)'} hachureGap={p.label === 'noć' ? 4 : 6} />
            {dx(p.to) - dx(p.from) > 44 && <DLabel x={(dx(p.from) + dx(p.to)) / 2} y={54} text={p.label} size={12} />}
          </g>
        ))}
        <Rough shape={{ k: 'lin', pts: [[dx(dayT) - 7, 8], [dx(dayT), 17], [dx(dayT) + 7, 8]] }} seed={1999} stroke="var(--red)" strokeWidth={2} roughness={0.5} />

        {/* the queue */}
        <DLabel x={10} y={railY - 10} anchor="start" text={`red „narudzbe”: ${messages(Math.round(v.metric))}`} mono bold size={14} />
        <Rough shape={{ k: 'rect', x: 10, y: railY, w: railW, h: 32 }} seed={2001} strokeWidth={1.5} fillColor="var(--paper)" fillStyle="solid" />
        {Array.from({ length: shown }, (_, i) => (
          <Rough key={i} shape={{ k: 'rect', x: 16 + i * 9, y: railY + 5, w: 6, h: 22 }} seed={2010 + i} strokeWidth={1} fillColor="var(--hl-yellow-ink)" fillStyle="solid" roughness={0.6} />
        ))}
        {v.metric > per && <DLabel x={10 + railW} y={railY + 52} anchor="end" text={`+ još ${Math.round(v.metric) - per}`} mono size={13} />}

        {/* KEDA: operator 0 ↔ 1 + HPA 1 ↔ N */}
        <Elastic x={kx} y={ky - 6} w={40} h={30} />
        <DLabel x={kx + 48} y={ky + 12} anchor="start" text="KEDA" mono bold size={14} />
        <DLabel
          x={kx}
          y={ky + 44}
          anchor="start"
          mono
          size={13}
          tone={activated === 'keda-activate' || activated === 'keda-cooldown' ? 'blue' : 'neutral'}
          text={v.replicas === 0 ? (v.metric > 0 ? `operator: 0 → 1 za ${fmt.num(v.secondsUntilPoll, 0)} s` : 'operator: red prazan, spava') : 'operator: aktivno (0 ↔ 1)'}
        />
        <DLabel
          x={kx}
          y={ky + 66}
          anchor="start"
          mono
          size={13}
          tone={activated === 'hpa' ? 'blue' : 'neutral'}
          text={v.replicas === 0 ? 'HPA: čeka (radi samo 1 ↔ N)' : `HPA: ⌈${Math.round(v.metric)} / 10⌉ = ${v.formulaDesired}${v.formulaDesired < 1 ? ' → najmanje 1' : ''}`}
        />

        {/* the workers */}
        <DLabel x={px} y={py - 40} anchor="start" size={13} tone={v.replicas === 0 ? 'neutral' : 'teal'} text={v.replicas === 0 ? 'klopa-worker spava: 0 Podova' : `klopa-worker: ${podsWord(v.replicas)}`} />
        {workers.length === 0 ? (
          // no Pod exists at all: an empty dashed place, not a (Pending) lunchbox
          <g aria-hidden="true">
            <Rough shape={{ k: 'rect', x: px, y: py - 20, w: 48, h: 40 }} seed={2030} dash="6 5" stroke="var(--ink-3)" strokeWidth={1.3} />
            <DLabel x={px + 60} y={py + 5} anchor="start" text="0 · nijedan Pod" mono size={13} />
          </g>
        ) : (
          workers.slice(0, Math.max(1, Math.floor((W - px - 10) / 52))).map((c, i) => (
            <PodShape
              key={c.id}
              x={px + 24 + i * 52}
              y={py}
              size={42}
              status={c.status === 'starting' ? 'creating' : c.status === 'stopping' ? 'terminating' : c.status === 'crashed' || c.status === 'crashloop' ? 'crash' : 'running'}
              label="wrk"
              tone="teal"
              ariaLabel={`Potrošač ${c.pod}: ${c.status}`}
            />
          ))
        )}
      </Diagram>
    </div>
  )
}
