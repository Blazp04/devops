/** Croatian labels and number formatting for the release lanes (helpers live in .ts: .tsx files export components only). */
import type { ReleaseStats } from '../../../engines/cluster'
import type { Lane, LaneKey, CanaryMode } from './race'

export type BadgeTone = 'ok' | 'warn' | 'bad' | 'neutral' | 'blue' | 'violet'

/** 12,3 → "12,3" (Croatian decimal comma) */
export function dec(v: number, digits = 1): string {
  return v.toLocaleString('hr-HR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function laneTitle(key: LaneKey, canary: CanaryMode): string {
  switch (key) {
    case 'recreate':
      return 'Recreate'
    case 'rolling':
      return 'Postupno ažuriranje'
    case 'blue-green':
      return 'Plavo-zeleno'
    case 'canary':
      return canary === 'weights' ? 'Canary po težinama' : 'Canary po replikama'
  }
}

/** How a lane is built: prose + an optional code part (rendered in code font). */
export function laneHow(key: LaneKey, canary: CanaryMode): { text: string; code?: string } {
  switch (key) {
    case 'recreate':
      return { text: 'jedan Deployment, ', code: 'strategy: Recreate' }
    case 'rolling':
      return { text: 'jedan Deployment, ', code: 'strategy: RollingUpdate' }
    case 'blue-green':
      return { text: 'dva Deploymenta, Service mijenja selektor' }
    case 'canary':
      return { text: canary === 'weights' ? 'dva Deploymenta, HTTPRoute dijeli zahtjeve' : 'dva Deploymenta, jedan Service za sve Podove' }
  }
}

export function laneHowText(key: LaneKey, canary: CanaryMode): string {
  const h = laneHow(key, canary)
  return h.text + (h.code ?? '')
}

/** Engine event texts say „Izdanje" for the start of a rollout; in this lecture izdanje ≠ uvođenje. */
export function relabelEvent(text: string): string {
  return text.replace(/^Izdanje (\S+) \(/, 'Uvođenje $1 (').replace(/^Izdanje (\S+) promovirano/, 'Uvođenje $1 promovirano')
}

export function phaseLabel(lane: Lane, st: ReleaseStats, bugPct: number): { text: string; tone: BadgeTone } {
  const rel = lane.s.release!
  switch (st.phase) {
    case 'idle':
      return { text: 'čeka 11:30', tone: 'neutral' }
    case 'deploying':
      return lane.key === 'blue-green' ? { text: 'green se pokreće', tone: 'warn' } : { text: 'uvodi se 2.0.0', tone: 'warn' }
    case 'canary': {
      const req = Math.round(st.requestedPct)
      const act = Math.round(st.actualPct)
      return { text: lane.strategy === 'canary-replicas' && act !== req ? `canary: traženo ${req} % → stvarno ~${act} %` : `canary: ${req} %`, tone: 'violet' }
    }
    case 'promoted':
      return lane.key === 'blue-green' ? { text: 'selektor na green', tone: 'violet' } : { text: 'promovirano na 100 %', tone: 'violet' }
    case 'done':
      return bugPct > 0 ? { text: '2.0.0 na svim Podovima', tone: 'bad' } : { text: 'gotovo: 2.0.0', tone: 'ok' }
    case 'aborted':
      return rel.abortReason.startsWith('analiza') ? { text: 'analiza prekinula canary', tone: 'ok' } : { text: 'canary prekinut', tone: 'ok' }
    case 'rolled-back':
      return { text: 'vraćeno na 1.4.1', tone: 'ok' }
  }
}

export interface Chip {
  label: string
  value: string
  tone: 'bad' | 'warn' | 'ok' | 'neutral'
}

export function laneChips(lane: Lane, st: ReleaseStats, thresholdPct: number): Chip[] {
  const rel = lane.s.release!
  const m = rel.metrics
  const chips: Chip[] = [
    { label: 'krivi PDV', value: `${lane.vat.size}`, tone: lane.vat.size > 0 ? 'bad' : 'ok' },
    { label: 'vidjeli 2.0.0', value: `${dec(st.exposurePct)} %`, tone: 'neutral' },
    { label: 'bez odgovora', value: `${st.downtimeS} s`, tone: st.downtimeS > 0 ? 'bad' : 'neutral' },
    { label: 'dvije verzije', value: `${st.mixedVersionS} s`, tone: 'neutral' },
    { label: 'dodatni Podovi', value: `${Math.round(st.extraPodHours * 3600)} Pod·s`, tone: st.extraPodHours * 3600 > 100 ? 'warn' : 'neutral' },
    { label: 'povratak', value: st.timeToRollbackS !== null ? `${dec(st.timeToRollbackS)} s` : rel.metrics.rollbackAt !== null ? 'u tijeku…' : '–', tone: st.timeToRollbackS !== null ? 'ok' : 'neutral' },
  ]
  if (lane.key === 'canary' && st.phase === 'canary' && rel.stepStartedAt !== null) {
    const n = m.stepOk + m.stepFailed
    const rate = n > 0 ? (100 * m.stepFailed) / n : 0
    chips.push({ label: rel.analysis ? 'analiza: krivi PDV' : 'krivi PDV (analiza slijepa)', value: `${dec(rate)} % / prag ${dec(thresholdPct)} %`, tone: rate > thresholdPct ? 'bad' : 'ok' })
  }
  return chips
}

export const LANE_COLOR: Record<LaneKey, string> = {
  recreate: 'var(--ink-2)',
  rolling: 'var(--orange)',
  'blue-green': 'var(--pen)',
  canary: 'var(--violet)',
}
