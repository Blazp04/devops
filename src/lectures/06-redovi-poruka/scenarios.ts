/**
 * Scenarios of the flagship „Kuhinjska šina” – thin wrappers around the E2 presets (src/engines/queue/presets.ts).
 * The incident card numbers come from `l06-cevap-petak-direct` (seed 36343, 150 s): 445 orders, 152 lost.
 */
import { createPresetSim, setFlightDuration, type PresetId, type QueueState, type Totals } from '../../engines/queue'
import type { RejectTrack } from './stageView'

/** The flagship's state: the engine state + the epoch for the „nula dvostrukih” goal (reset() clears it). */
export type FlagshipState = QueueState & RejectTrack & { dupMark?: Totals }

export type ScenarioId = 'uzivo' | 'incident' | 'incident-red' | 'sms-sporo' | 'otrovne' | 'sqs-rok' | 'sms'

export const FLAGSHIP_SCENARIOS: { id: ScenarioId; label: string; preset: PresetId; stopAtEnd: boolean }[] = [
  { id: 'uzivo', label: 'Uživo: nalet u 5. s', preset: 'l06-cevap-petak-live', stopAtEnd: false },
  { id: 'incident', label: 'Incident #6 · l06-cevap-petak-direct (bez reda)', preset: 'l06-cevap-petak-direct', stopAtEnd: true },
  { id: 'incident-red', label: 'Incident #6 s redom', preset: 'l06-cevap-petak-queue', stopAtEnd: true },
  { id: 'sms-sporo', label: 'Spori SMS-gateway (bez reda)', preset: 'l06-sms-slow-direct', stopAtEnd: true },
  { id: 'sms', label: 'SMS-gateway pada', preset: 'l06-sms-down-queue', stopAtEnd: false },
  { id: 'otrovne', label: 'Greške i otrovne', preset: 'l06-poison-dlq', stopAtEnd: false },
  { id: 'sqs-rok', label: 'SQS: rok 2 s', preset: 'l06-sqs-short-visibility', stopAtEnd: false },
]

export function createScenario(id: ScenarioId): FlagshipState {
  const sc = FLAGSHIP_SCENARIOS.find((x) => x.id === id) ?? FLAGSHIP_SCENARIOS[0]
  const s: FlagshipState = createPresetSim(sc.preset, { stopAtEnd: sc.stopAtEnd })
  setFlightDuration(s, 0.3)
  return s
}
