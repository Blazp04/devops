import { Button, ControlGroup, EventLog, Goals, Segmented, SimFrame, Slider, Toggle, fmt, useSimulation } from '../../../kit'
import { controlsView, setConfig, step, type QueueConfigPatch, type RetryMode } from '../../../engines/queue'
import { createPoisonLab, poisonWhere, sendPoison, trackPoison, type PoisonState } from '../poisonLab'
import { RailStage } from './RailStage'
import { deliveryLimitHint, dlqHint } from '../hints'
import styles from '../styles.module.css'

const RETRY_RABBIT: { value: RetryMode; label: string; title: string }[] = [
  { value: 'backoff', label: 'čekaj pa ponovi', title: 'red za ponovni pokušaj s TTL-om i dead-letter exchangeom' },
  { value: 'immediate', label: 'odmah natrag', title: 'basic.reject s requeue: poruka se odmah vraća u red' },
  { value: 'nack-requeue', label: 'nack + requeue', title: 'RabbitMQ: basic.nack se ne broji u delivery-limit' },
]

const RETRY_SQS: { value: RetryMode; label: string; title: string }[] = [
  { value: 'backoff', label: 'čekaj pa ponovi', title: 'produljeni rok vidljivosti iste poruke (ChangeMessageVisibility)' },
  { value: 'immediate', label: 'odmah natrag', title: 'rok vidljivosti 0: poruka se odmah vraća' },
]

/** Scene „Otrovna poruka”: a message that always fails, retries with full-jitter backoff, then the DLQ (E2). */
export function PoisonLab() {
  const sim = useSimulation<PoisonState>({
    init: createPoisonLab,
    step: (s, dt) => {
      step(s, dt)
      trackPoison(s)
    },
  })
  const s = sim.state
  const ui = controlsView(s)
  const set = (patch: QueueConfigPatch) => sim.mutate((x) => setConfig(x, patch))
  const w = poisonWhere(s)
  const rabbit = s.config.broker === 'rabbitmq'
  const limit = ui.deliveryLimit
  const nackMode = rabbit && s.config.retryMode === 'nack-requeue'
  const unlimited = !limit.enforced || nackMode
  // screen readers hear only where the message is and its delivery count, not the 0,1 s countdown
  const where = w?.where ?? null
  const deliveries = w?.deliveries ?? 0
  const orderId = w?.orderId ?? 0
  // the engine's nack note names the broker version; versions belong in the fact callout above the lab
  const events = s.events.map((e) => (e.text.startsWith('RabbitMQ 4.3: ') ? { ...e, text: `RabbitMQ: ${e.text.slice(14)}` } : e))
  const spoken = where === null ? 'Još niste poslali otrovnu poruku.' : `Otrovna #${orderId}: ${where}, isporuka ${deliveries}${unlimited ? ', bez ograničenja' : ''}.`
  return (
    <SimFrame
      title="Otrovna poruka"
      subtitle="Mirne narudžbe (0,8 u sekundi), dva potrošača. Otrovna poruka ima neispravan sadržaj: njezina obrada ne uspije nikad."
      sim={{ ...sim, time: s.t }}
      showTime
      minHeight={0}
      speeds={[1, 2, 4]}
      hint="pošaljite otrovnu poruku i pratite je kroz red ponovnih pokušaja do DLQ-a. Zatim probajte „nack + requeue” i ugasite DLQ."
      controls={
        <>
          <Button variant="danger" onClick={() => sim.mutate((x) => sendPoison(x))}>
            Pošalji otrovnu poruku
          </Button>
          <Segmented label="Posrednik" value={s.config.broker} onChange={(v) => set(v === 'sqs' && s.config.retryMode === 'nack-requeue' ? { broker: v, retryMode: 'backoff' } : { broker: v })} options={[{ value: 'rabbitmq', label: 'RabbitMQ' }, { value: 'sqs', label: 'SQS' }]} />
          <Segmented<RetryMode> label="Nakon greške" value={s.config.retryMode} onChange={(v) => set({ retryMode: v })} options={rabbit ? RETRY_RABBIT : RETRY_SQS} />
          <ControlGroup title="Ograničenje">
            <Slider label="Najviše isporuka" value={ui.maxDeliveries.value} min={1} max={21} disabled={!ui.maxDeliveries.enabled} hint={deliveryLimitHint(s)} onChange={(v) => set({ maxDeliveries: v })} />
            <Toggle label="DLQ" checked={ui.dlqEnabled.value} hint={dlqHint(s)} onChange={(v) => set({ dlqEnabled: v })} />
          </ControlGroup>
        </>
      }
      stats={
        <div className={styles.statsGrid}>
          <div>
            <p className="visually-hidden" aria-live="polite">
              {spoken}
            </p>
            <p className={styles.poisonLine} aria-hidden="true">
              {w === null ? (
                'Još niste poslali otrovnu poruku.'
              ) : (
                <>
                  Otrovna <span className="mono">#{w.orderId}</span>: <strong>{w.where}</strong>
                  {w.waitS !== null && <> (još {fmt.num(w.waitS, 1)} s)</>} · isporuka <span className="mono">{w.deliveries}</span>
                  {!unlimited ? <> od najviše {s.config.maxDeliveries}</> : <> · bez ograničenja</>}
                </>
              )}
            </p>
            <Goals
              title="Zadaci"
              goals={[
                { text: 'Otrovnu poruku odvojite u DLQ.', done: s.done.dlq },
                { text: 'RabbitMQ s „nack + requeue”: poruka kruži dalje od ograničenja.', done: s.done.loop },
                { text: 'RabbitMQ bez DLQ-a: poruka preko ograničenja se odbacuje.', done: s.done.drop },
              ]}
            />
          </div>
          <EventLog events={events} max={8} />
        </div>
      }
    >
      <RailStage s={s} id="poison" lanes={{ invisible: false, sms: false }} label={`Otrovna poruka: ${w ? `${w.where}, isporuka ${w.deliveries}` : 'nije poslana'}; u DLQ-u ${s.totals.dlq}.`} />
    </SimFrame>
  )
}
