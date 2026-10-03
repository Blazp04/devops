import { Plus } from 'lucide-react'
import { Button, ControlGroup, EventLog, Goals, Segmented, SimFrame, Slider, Toggle, useSimulation } from '../../../kit'
import { controlsView, publishBatch, setAckTimeout, setConfig, type AckMode, type QueueConfigPatch, type SmsGuard } from '../../../engines/queue'
import { LAB_COOK_S, cell, cellPending, crashTarget, createLab, labStep, requestCrash, type CrashWhen, type ExpResult, type Experiment, type LabState } from '../ackLab'
import { RailStage } from './RailStage'
import { ackTimeoutHint } from '../hints'
import styles from '../styles.module.css'

const RESULT: Record<ExpResult, { text: string; mark: string; cls: 'ok' | 'bad' }> = {
  once: { text: 'skuhano 1×', mark: '✓', cls: 'ok' },
  twice: { text: 'skuhano 2×', mark: '✗', cls: 'bad' },
  lost: { text: 'izgubljeno', mark: '✗', cls: 'bad' },
}

function Cell({ e, lead, pending }: { e: Experiment | null; lead: string; pending: boolean }) {
  if (pending) return <td className={styles.cellEmpty}>čeka se ishod…</td>
  if (!e || e.result === null) return <td className={styles.cellEmpty}>{lead}</td>
  const r = RESULT[e.result]
  return (
    <td className={r.cls === 'ok' ? styles.cellOk : styles.cellBad}>
      <span aria-hidden="true">{r.mark} </span>
      {r.text}
      <span className={styles.cellSub}>
        #{e.orderId} · {e.broker === 'sqs' ? 'SQS' : 'RabbitMQ'}
      </span>
    </td>
  )
}

const PENDING_TEXT: Record<CrashWhen, string> = {
  before: 'Potrošač pada čim počne kuhati sljedeću narudžbu.',
  after: 'Potrošač pada čim skuha sljedeću narudžbu.',
  sms: 'Potrošač pada dok čeka SMS-gateway za sljedeću narudžbu.',
}

const SMS_GUARD: { value: SmsGuard; label: string; title: string }[] = [
  { value: 'none', label: 'pošalji pa zapiši', title: 'pad nakon slanja → SMS se šalje ponovno' },
  { value: 'record-first', label: 'zapiši pa pošalji', title: 'pad između zapisa i slanja → SMS se nikad ne pošalje' },
  { value: 'provider-key', label: 'ključ pružatelja', title: 'gateway sam odbacuje drugi SMS s istim ključem' },
]

const WHEN_TEXT: Record<CrashWhen, string> = { before: 'pad prije kuhanja', after: 'pad nakon kuhanja', sms: 'pad dok se šalje SMS' }

function ExpLine({ e }: { e: Experiment }) {
  const guard = SMS_GUARD.find((g) => g.value === e.smsGuard)?.label
  return (
    <li>
      <span className="mono">#{e.orderId}</span> ({WHEN_TEXT[e.when]}; {e.idempotent ? 'idempotentno' : 'bez ključa'}, {guard}):{' '}
      {e.result === null ? (
        'čeka se ishod…'
      ) : (
        <>
          skuhano <span className="mono">{e.cooked}×</span>
          {e.deduped > 0 && (
            <>
              {' '}
              · „već skuhano” <span className="mono">{e.deduped}×</span>
            </>
          )}{' '}
          · SMS <span className="mono">{e.sms}×</span>
        </>
      )}
    </li>
  )
}

/**
 * Lab for „Potvrda i ponovna isporuka” (variant 'ack': broker × ack mode × crash timing → the four cells) and
 * „Ključ idempotentnosti” (variant 'idem': idempotency key + how the SMS is guarded). E2 does the work.
 */
export function AckLab({ variant }: { variant: 'ack' | 'idem' }) {
  const sim = useSimulation<LabState>({ init: () => createLab(), step: labStep })
  const s = sim.state
  const ui = controlsView(s)
  const set = (patch: QueueConfigPatch) => sim.mutate((x) => setConfig(x, patch))
  const target = crashTarget(s)
  const pending = s.pending !== null
  const sqs = s.config.broker === 'sqs'
  const events = s.events.map((e) => (e.kind === 'batch' ? { ...e, text: 'Nova narudžba stigla u red' } : e))
  const idem = variant === 'idem'
  const settled = s.exps.filter((e) => e.result !== null && e.ack === 'manual' && e.when === 'after')
  const recent = [...s.exps].reverse().slice(0, 4)
  return (
    <SimFrame
      title={idem ? 'Ključ idempotentnosti' : 'Potvrda i ponovna isporuka'}
      subtitle={`Dva potrošača, svako kuhanje traje točno ${LAB_COOK_S} s. Gumb za pad pošalje narudžbu i sruši potrošača koji je kuha.`}
      sim={{ ...sim, time: s.t }}
      showTime
      minHeight={0}
      hint={
        idem
          ? 'srušite potrošača nakon kuhanja bez ključa, pa uključite idempotentnost i ponovite. Zatim promijenite zaštitu SMS-a.'
          : 'isprobajte sve četiri kombinacije potvrde i trenutka pada. Zatim isto na SQS-u: kad se poruka vraća?'
      }
      controls={
        <>
          <Segmented label="Posrednik" value={s.config.broker} onChange={(v) => set({ broker: v })} options={[{ value: 'rabbitmq', label: 'RabbitMQ' }, { value: 'sqs', label: 'SQS' }]} />
          {!idem && (
            <Segmented<AckMode>
              label="Potvrda (ack)"
              value={s.config.ackMode}
              onChange={(v) => set({ ackMode: v })}
              options={[
                { value: 'manual', label: 'nakon obrade' },
                sqs ? { value: 'auto', label: 'obriši odmah po primitku', title: 'DeleteMessage prije obrade' } : { value: 'auto', label: 'automatski', title: 'auto-ack: potvrda već pri isporuci' },
              ]}
            />
          )}
          {idem && (
            <>
              <Toggle label="Idempotentnost" hint="ključ = broj narudžbe" checked={s.config.idempotent} onChange={(v) => set({ idempotent: v })} />
              <Segmented<SmsGuard> label="SMS" value={s.config.smsGuard} onChange={(v) => set({ smsGuard: v })} options={SMS_GUARD} />
            </>
          )}
          {sqs && <Slider label="Rok vidljivosti" value={ui.ackTimeout.simS} min={1} max={30} hint={ackTimeoutHint(s)} format={(v) => `${v} s`} onChange={(v) => sim.mutate((x) => setAckTimeout(x, v))} />}
          <ControlGroup title="Akcije">
            <Button variant="primary" icon={Plus} onClick={() => sim.mutate((x) => void publishBatch(x, 1))}>
              Pošalji narudžbu
            </Button>
            <Button variant="danger" onClick={() => sim.mutate((x) => requestCrash(x, 'before'))} title={target ? `potrošač ${target.id} pada dok kuha #${target.orderId}` : 'pošalje novu narudžbu i sruši potrošača čim je počne kuhati'}>
              Sruši potrošača prije kuhanja
            </Button>
            <Button variant="danger" onClick={() => sim.mutate((x) => requestCrash(x, 'after'))} title={target ? `potrošač ${target.id} pada čim skuha #${target.orderId}` : 'pošalje novu narudžbu; potrošač pada čim je skuha'}>
              Sruši potrošača nakon kuhanja, prije potvrde
            </Button>
            {idem && (
              <Button variant="danger" onClick={() => sim.mutate((x) => requestCrash(x, 'sms'))} title="SMS-gateway zastane 3 s; potrošač pada nakon zapisa u bazu, prije nego što SMS ode">
                Sruši potrošača dok šalje SMS
              </Button>
            )}
            <p className={styles.controlNote} aria-live="polite">
              {pending ? PENDING_TEXT[s.pending ?? 'before'] : 'Ako nitko ne kuha, gumb za pad pošalje novu narudžbu.'}
            </p>
          </ControlGroup>
        </>
      }
      stats={
        <div className={styles.statsGrid}>
          {idem ? (
            <div>
              <Goals
                title="Zadaci"
                goals={[
                  { text: 'Bez ključa: pad nakon kuhanja skuha narudžbu dvaput.', done: settled.some((e) => !e.idempotent && e.cooked > 1) },
                  { text: 'S ključem: isti pad – teta Mira žigoše „već skuhano”.', done: settled.some((e) => e.idempotent && e.cooked === 1 && e.deduped > 0) },
                  { text: 'Ni SMS ne ode dvaput (ključ pružatelja).', done: settled.some((e) => e.idempotent && e.smsGuard === 'provider-key' && e.sms === 1 && e.cooked === 1) },
                  { text: '„Zapiši pa pošalji”: pad dok se SMS šalje – SMS ne ode nijednom.', done: s.exps.some((e) => e.result !== null && e.when === 'sms' && e.smsGuard === 'record-first' && e.sms === 0) },
                ]}
              />
              <ul className={styles.expList}>
                {recent.map((e) => (
                  <ExpLine key={e.id} e={e} />
                ))}
              </ul>
            </div>
          ) : (
            <div>
              <table className={styles.matrix}>
                <caption>Što se dogodi s narudžbom kad potrošač padne</caption>
                <thead>
                  <tr>
                    <th scope="col">potvrda</th>
                    <th scope="col">pad prije kuhanja</th>
                    <th scope="col">pad nakon kuhanja (prije ručne potvrde)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">
                      nakon obrade<span className={styles.cellSub}>barem jednom</span>
                    </th>
                    <Cell e={cell(s, 'manual', 'before')} pending={cellPending(s, 'manual', 'before')} lead="probajte" />
                    <Cell e={cell(s, 'manual', 'after')} pending={cellPending(s, 'manual', 'after')} lead="probajte" />
                  </tr>
                  <tr>
                    <th scope="row">
                      automatski<span className={styles.cellSub}>najviše jednom · potvrda već pri preuzimanju</span>
                    </th>
                    <Cell e={cell(s, 'auto', 'before')} pending={cellPending(s, 'auto', 'before')} lead="probajte" />
                    <Cell e={cell(s, 'auto', 'after')} pending={cellPending(s, 'auto', 'after')} lead="probajte" />
                  </tr>
                </tbody>
              </table>
              <Goals
                title="Zadaci"
                goals={[
                  { text: 'Popunite sve četiri ćelije.', done: !!(cell(s, 'manual', 'before') && cell(s, 'manual', 'after') && cell(s, 'auto', 'before') && cell(s, 'auto', 'after')) },
                  { text: 'Pad s potvrdom nakon obrade na RabbitMQ-u i na SQS-u.', done: !!(cell(s, 'manual', 'before', 'rabbitmq') ?? cell(s, 'manual', 'after', 'rabbitmq')) && !!(cell(s, 'manual', 'before', 'sqs') ?? cell(s, 'manual', 'after', 'sqs')) },
                ]}
              />
            </div>
          )}
          <EventLog events={events} max={8} />
        </div>
      }
    >
      <RailStage s={s} id={idem ? 'idem' : 'ack'} lanes={{ retry: false, dlq: false }} label={`Pokus: ${s.ready.size} u redu, ${s.unacked.size} nepotvrđeno, skuhano ${s.totals.effectsUnique}, dvaput ${s.totals.duplicates}.`} />
    </SimFrame>
  )
}
