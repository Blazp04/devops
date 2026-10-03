/** Short control hints (≤ 40 characters – the kit prints hints at 16 px) built from the engine's own facts. */
import { ackTimeoutInfo, deliveryLimitInfo, type QueueState } from '../../engines/queue'
import { fmt } from '../../kit'

const dur = (s: number) => (s >= 60 && s % 60 === 0 ? `${s / 60} min` : `${fmt.num(s, s < 10 && s % 1 ? 1 : 0)} s`)

/** „Najviše isporuka”: the real broker argument behind the slider (RabbitMQ: N isporuka = x-delivery-limit N − 1). */
export function deliveryLimitHint(s: QueueState): string {
  const d = deliveryLimitInfo(s)
  if (d.broker === 'rabbitmq') return `delivery-limit ${d.argValue} · zadano 20`
  if (d.argName === null) return 'SQS bez DLQ-a: bez ograničenja'
  return `maxReceiveCount ${d.argValue}`
}

/** The DLQ toggle: what happens to a message over the limit. */
export function dlqHint(s: QueueState): string {
  if (s.config.dlqEnabled) return 'preko granice → DLQ'
  return s.config.broker === 'sqs' ? 'SQS bez DLQ-a: bez granice' : 'bez DLX-a: poruka se odbacuje'
}

/** „Rok za potvrdu”: SQS visibility is real time; RabbitMQ consumer_timeout is compressed (stvarno: 30 min). */
export function ackTimeoutHint(s: QueueState): string {
  const a = ackTimeoutInfo(s)
  if (a.broker === 'sqs') return a.isDefault ? `${dur(a.simS)} · zadano u SQS-u` : `${dur(a.simS)} · zadano: ${dur(a.realDefaultS)}`
  return a.isDefault ? `${dur(a.simS)} (sim) · stvarno: ${dur(a.realDefaultS)}` : `${dur(a.simS)} (sim) · stvarno zadano ${dur(a.realDefaultS)}`
}
