import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Plus, Wrench, Zap } from 'lucide-react'
import { Button, ControlGroup, EventLog, Goals, LineChart, Segmented, Select, SimFrame, Slider, Stat, StatRow, Toggle, fmt, plural, useSimulation } from '../../../kit'
import {
  burstOutcome,
  burstState,
  consumerViews,
  controlsView,
  crashConsumer,
  drainTrial,
  duplicateGuard,
  finished,
  little,
  markTotals,
  metrics,
  publishBatch,
  publishPoison,
  repairConsumer,
  setAckTimeout,
  setConfig,
  setFlightDuration,
  setSmsGateway,
  slowConsumer,
  startBurst,
  step,
  theory,
  type QueueConfigPatch,
} from '../../../engines/queue'
import { FLAGSHIP_SCENARIOS, createScenario, type FlagshipState, type ScenarioId } from '../scenarios'
import { RailStage } from './RailStage'
import { ackTimeoutHint, deliveryLimitHint, dlqHint } from '../hints'
import { trackRejects } from '../stageView'

const secs = (v: number) => `${fmt.num(v, v < 10 ? 1 : 0)} s`

const NARUDZBE_GEN: [string, string, string] = ['narudžbe', 'narudžbe', 'narudžbi']
const PORUKA: [string, string, string] = ['poruka', 'poruke', 'poruka']

/**
 * The flagship „Kuhinjska šina”: E2 with every control of the spec. A new scenario remounts the sim (fresh seed,
 * fresh goals); focus goes back to the scenario picker, so keyboard and screen-reader users keep their place.
 */
export function KitchenRailSim() {
  const [scenario, setScenario] = useState<ScenarioId>('uzivo')
  const box = useRef<HTMLDivElement>(null)
  const picked = useRef(false)
  useEffect(() => {
    if (!picked.current) return
    picked.current = false
    box.current?.querySelector('select')?.focus()
  }, [scenario])
  // the wrapper takes over the SimFrame's wide breakout (.k-wide must be a direct child of the section body)
  return (
    <div ref={box} className="k-wide">
      <KitchenRail
        key={scenario}
        scenario={scenario}
        onScenario={(id) => {
          picked.current = true
          setScenario(id)
        }}
      />
    </div>
  )
}

/**
 * The sim's visibility probe: a 1 px sticky strip at the top of the wrapper. It stays on screen while any part of the
 * (very tall, 3000+ px on phones) sheet is, so the sim never freezes while it is in view – the kit's observer wants 15 %
 * of the observed element, which a whole sheet this tall does not reach near its edges.
 */
function VisibilityProbe({ sim }: { sim?: { ref?: RefObject<HTMLDivElement | null> } }) {
  return <div ref={sim?.ref} aria-hidden="true" style={{ position: 'sticky', top: 0, height: 1, marginBottom: -1, pointerEvents: 'none' }} />
}

function flagshipStep(s: FlagshipState, dt: number) {
  step(s, dt)
  trackRejects(s)
}

function KitchenRail({ scenario, onScenario }: { scenario: ScenarioId; onScenario: (id: ScenarioId) => void }) {
  const sim = useSimulation<FlagshipState>({ init: () => createScenario(scenario), step: flagshipStep })
  const s = sim.state
  const m = metrics(s)
  const th = theory(s)
  const ui = controlsView(s)
  const cooks = consumerViews(s)
  const lit = little(s)
  const k = s.config.consumers
  const direct = s.config.mode === 'direct'
  const sqs = s.config.broker === 'sqs'
  const set = (patch: QueueConfigPatch) => sim.mutate((x) => setConfig(x, patch))
  const canCrashBefore = cooks.some((c) => (c.status === 'busy' && c.phase === 'work' && !c.committed) || c.status === 'idle')
  const canCrashAfter = cooks.some((c) => (c.status === 'busy' || c.status === 'idle') && !c.crashArmed)
  const slowId = cooks.find((c) => c.fault === 'slow')?.id
  const canSlow = cooks.some((c) => c.status !== 'crashed' && c.status !== 'crashloop' && c.fault === 'none')
  const smsDown = s.sms.state === 'down'
  const burst = burstOutcome(s)
  const burstHappened = burstState(s).happened
  const drain = useMemo(() => drainTrial(k), [k])
  const dup = s.dupMark ? duplicateGuard(s, s.dupMark) : null
  const poisonInDlq = s.dlqRecent.some((e) => e.reason === 'max-deliveries' && e.poison)

  // the incident scenarios stop at their run length (150 s): pause the loop too
  useEffect(() => {
    if (finished(s) && sim.running) sim.pause()
  })

  const setSpeed = (v: number) => {
    sim.setSpeed(v)
    sim.mutate((x) => setFlightDuration(x, 0.3 * Math.max(1, v)))
  }
  const queueLimit = !Number.isFinite(s.config.maxQueue) ? 'inf' : s.config.overflow === 'reject-publish' ? 'reject' : 'drop'
  const rho = Number.isFinite(th.rho) ? fmt.num(th.rho, 2) : '∞'
  const backlogSub = direct
    ? `Erlang B pri λ ${fmt.num(th.lambda, 1)}/s: ${fmt.pct(th.directLossErlangB, 1)}`
    : th.stable
      ? m.backlog > 0 && Number.isFinite(th.drainTimeS)
        ? `ρ ${rho} · prazno za ~${secs(th.drainTimeS)}`
        : `ρ ${rho} · kapacitet ${fmt.num(th.capacity, 1)}/s`
      : `ρ ${rho} · raste +${fmt.num(th.growthPerS, 1)}/s`

  return (
    <>
    <VisibilityProbe sim={sim} />
    <SimFrame
      title="Kuhinjska šina"
      subtitle="Narudžbe stižu na API, listići čekaju na šini (u redu poruka), potrošači uzimaju sljedeći listić, kuhaju i šalju SMS. Kuhanje traje u prosjeku 1 s."
      sim={{ ...sim, setSpeed, time: s.t, ref: undefined }}
      showTime
      speeds={[0.5, 1, 2, 4]}
      hint="pošaljite nalet i gledajte kako šina upija narudžbe. Zatim nešto pokvarite (gumbi s munjom) i popravite to postavkama – zadaci ispod sami se označe kvačicom."
      controls={
        <>
          <Select label="Scenarij" value={scenario} onChange={(v) => onScenario(v as ScenarioId)} options={FLAGSHIP_SCENARIOS.map((o) => ({ value: o.id, label: o.label }))} />
          <ControlGroup title="Promet">
            <Slider label="Narudžbe/s" value={s.config.rate} min={0} max={20} step={0.5} disabled={!ui.rate.enabled} hint={ui.rate.reason ?? 'izvan naleta'} format={(v) => `${fmt.num(v, 1)}/s`} onChange={(v) => set({ rate: v })} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button variant="danger" icon={Zap} onClick={() => sim.mutate((x) => void startBurst(x))} title="15 narudžbi u sekundi tijekom 10 s">
                Nalet
              </Button>
              <Button variant="secondary" icon={Plus} onClick={() => sim.mutate((x) => void publishBatch(x, 100))}>
                +100 odmah
              </Button>
            </div>
          </ControlGroup>
          <ControlGroup title="Red i potrošači">
            <Segmented label="Način" value={s.config.mode} onChange={(v) => set({ mode: v })} options={[{ value: 'direct', label: 'bez reda' }, { value: 'queue', label: 's redom' }]} />
            <Segmented label="Posrednik" value={s.config.broker} onChange={(v) => set({ broker: v })} options={[{ value: 'rabbitmq', label: 'RabbitMQ' }, { value: 'sqs', label: 'SQS' }]} />
            <Slider label="Potrošači" value={ui.consumers.value} min={0} max={12} disabled={!ui.consumers.enabled} hint={`kapacitet kμ = ${fmt.num(th.capacity, 1)}/s`} onChange={(v) => set({ consumers: v })} />
            <Toggle
              label="Idempotentnost"
              hint="ključ = broj narudžbe"
              checked={s.config.idempotent}
              onChange={(v) =>
                sim.mutate((x) => {
                  setConfig(x, { idempotent: v })
                  x.dupMark = v ? markTotals(x) : undefined
                })
              }
            />
          </ControlGroup>
          <ControlGroup title="Pokvarite">
            {smsDown ? (
              <Button variant="success" icon={Wrench} onClick={() => sim.mutate((x) => void setSmsGateway(x, 'ok'))}>
                Popravi SMS-gateway
              </Button>
            ) : (
              <Button variant="danger" onClick={() => sim.mutate((x) => void setSmsGateway(x, 'down', 30))} title="SMS-gateway ne odgovara 30 s">
                SMS-gateway pao
              </Button>
            )}
            <Button variant="danger" disabled={direct || !canCrashBefore} onClick={() => sim.mutate((x) => void crashConsumer(x))}>
              Sruši potrošača prije kuhanja
            </Button>
            <Button variant="danger" disabled={direct || !canCrashAfter} onClick={() => sim.mutate((x) => void crashConsumer(x, undefined, 'after-effect'))}>
              Sruši potrošača nakon kuhanja, prije potvrde
            </Button>
            {slowId === undefined ? (
              <Button variant="danger" disabled={!canSlow} onClick={() => sim.mutate((x) => void slowConsumer(x))} title="jedan potrošač kuha 40 s dulje">
                Spori potrošač
              </Button>
            ) : (
              <Button variant="success" icon={Wrench} onClick={() => sim.mutate((x) => void repairConsumer(x, slowId))}>
                Popravi potrošača {slowId}
              </Button>
            )}
            <Button variant="danger" disabled={direct} onClick={() => sim.mutate((x) => void publishPoison(x))}>
              Pošalji otrovnu poruku
            </Button>
          </ControlGroup>
          <ControlGroup title="Napredno" collapsible defaultOpen={false}>
            <Segmented
              label="Potvrda"
              value={s.config.ackMode}
              onChange={(v) => set({ ackMode: v })}
              options={[
                { value: 'manual', label: 'nakon obrade' },
                sqs ? { value: 'auto', label: 'obriši odmah', title: 'DeleteMessage prije obrade' } : { value: 'auto', label: 'automatski', title: 'auto-ack: potvrda već pri isporuci' },
              ]}
            />
            <Slider label={sqs ? 'Rok vidljivosti (SQS)' : 'consumer_timeout'} value={ui.ackTimeout.simS} min={1} max={60} hint={ackTimeoutHint(s)} format={(v) => `${v} s`} onChange={(v) => sim.mutate((x) => setAckTimeout(x, v))} />
            <Slider label="Najviše isporuka" value={ui.maxDeliveries.value} min={1} max={25} disabled={!ui.maxDeliveries.enabled} hint={deliveryLimitHint(s)} onChange={(v) => set({ maxDeliveries: v })} />
            <Toggle label="DLQ" checked={ui.dlqEnabled.value} hint={dlqHint(s)} onChange={(v) => set({ dlqEnabled: v })} />
            <Slider label="Prolazne greške (pFail)" value={s.config.pFail} min={0} max={0.5} step={0.01} format={(v) => fmt.pct(v)} onChange={(v) => set({ pFail: v })} />
            <Slider label="Otrovne poruke (pPoison)" value={s.config.pPoison} min={0} max={0.05} step={0.005} format={(v) => fmt.pct(v, 1)} onChange={(v) => set({ pPoison: v })} />
            <Segmented
              label="Najveća duljina reda"
              value={queueLimit}
              onChange={(v) => set(v === 'inf' ? { maxQueue: Infinity } : { maxQueue: 50, overflow: v === 'reject' ? 'reject-publish' : 'drop-head' })}
              options={[
                { value: 'inf', label: '∞' },
                { value: 'reject', label: '50 · odbij', title: 'reject-publish: nova narudžba se odbija' },
                { value: 'drop', label: '50 · izbaci', title: 'drop-head: izbacuje se najstarija poruka' },
              ]}
            />
            {!ui.maxQueue.enabled && <p style={{ margin: 0, fontSize: 17, fontStyle: 'italic', color: 'var(--ink-3)' }}>{ui.maxQueue.reason}</p>}
          </ControlGroup>
        </>
      }
      stats={
        <>
          <StatRow>
            <Stat label="U redu" value={m.backlog} tone={th.stable ? (m.backlog > 30 ? 'warn' : 'ok') : 'bad'} sub={backlogSub} spark={s.series.ready.values.slice(-40)} />
            <Stat label="Najstarija čeka" value={secs(m.oldestAgeS)} tone={m.oldestAgeS > 20 ? 'warn' : 'neutral'} sub={`u obradi: ${m.unacked}`} />
            <Stat label={direct ? 'p95 odgovora' : 'p95 do potvrde'} value={m.p95 === null ? 'n/a' : secs(m.p95)} sub={m.p50 === null ? 'premalo uzoraka' : `p50 ${secs(m.p50)}`} />
            <Stat label="Izgubljeno" value={m.lost} tone={m.lost > 0 ? 'bad' : 'ok'} sub={`${direct ? '503 · ' : ''}od ${plural(s.totals.orders, NARUDZBE_GEN)}`} />
            <Stat label="DLQ" value={s.totals.dlq} tone={s.totals.dlq > 0 ? 'warn' : 'neutral'} sub={`ponovnih pokušaja: ${s.totals.retries}`} />
            <Stat label="Skuhano dvaput" value={s.totals.duplicates} tone={s.totals.duplicates > 0 ? 'bad' : 'ok'} sub={`već skuhano: ${s.totals.alreadyCooked} · SMS 2×: ${s.totals.smsDuplicates}`} />
          </StatRow>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 24, marginTop: 18 }}>
            <LineChart
              series={[
                { label: 'u redu', values: s.series.ready.values, color: 'var(--tray-ink)', area: true },
                { label: 'u obradi', values: s.series.unacked.values, color: 'var(--pen)' },
              ]}
              window={240}
              height={130}
              yLabel="poruka"
              xLabel="zadnje 2 min"
            />
            <LineChart
              series={[
                { label: 'stiže λ', values: s.series.lambda.values, color: 'var(--tray-ink)' },
                { label: 'kapacitet kμ', values: s.series.capacity.values, color: 'var(--green)' },
              ]}
              window={240}
              height={130}
              yLabel="narudžbi/s"
              xLabel="zadnje 2 min"
            />
          </div>
          <p style={{ margin: '14px 0 0', fontSize: 17, color: 'var(--ink-2)' }}>
            <strong>Littleov zakon</strong> (prosjek od početka; poklapa se kad se red smiri): u sustavu je prosječno <span className="mono">L = {fmt.num(lit.L, 2)}</span> narudžbi, a stiže ih{' '}
            <span className="mono">λ = {fmt.num(lit.lambda, 2)}/s</span> i svaka ostaje <span className="mono">W = {secs(lit.W)}</span>; <span className="mono">λ·W = {fmt.num(lit.lambdaW, 2)}</span>.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 28, alignItems: 'start', marginTop: 22 }}>
            <div>
              <Goals
                goals={[
                  { text: 'Ćevap-petak bez izgubljene narudžbe (Nalet s redom).', done: (burst?.servedBursts ?? 0) > 0 },
                  { text: 'Ispraznite red nakon naleta za manje od 20 s s najmanje potrošača.', done: burstHappened && !direct && k <= 7 && (drain?.durationS ?? Infinity) < 20 },
                  { text: 'Nula dvostrukih narudžbi kad potrošač padne nakon kuhanja (RabbitMQ) ili kuha dulje od roka (SQS).', done: dup !== null && dup.triggered && dup.duplicates === 0 },
                  { text: 'Otrovnu poruku odvojite u DLQ.', done: poisonInDlq },
                ]}
              />
              <p style={{ margin: '10px 0 0', fontSize: 17, fontStyle: 'italic', color: 'var(--ink-3)' }}>
                Nalet s kartice incidenta (seed 36343, nalet u 30. s) s {k} {k === 1 ? 'potrošačem' : 'potrošača'}: {drain ? `vrh ${drain.peak}, prazno za ${secs(drain.durationS)}` : 'red se ne isprazni'}.
              </p>
            </div>
            <EventLog events={s.events} max={14} />
          </div>
        </>
      }
    >
      <div style={{ width: '100%', marginBottom: 'auto' }}>
        <RailStage
          s={s}
          id="flag"
          freeSlots
          label={`Kuhinjska šina: u redu ${plural(m.backlog, PORUKA)}, ${m.consumers.busy} od ${m.consumers.total} potrošača radi, izgubljeno ${m.lost}, skuhano dvaput ${s.totals.duplicates}, DLQ ${s.totals.dlq}.`}
        />
      </div>
    </SimFrame>
    </>
  )
}
