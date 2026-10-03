/** Semantic tones shared by stats, meters and charts. */
export type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'blue' | 'violet' | 'teal' | 'amber' | 'rose' | 'green' | 'cyan'

export const TONE_VAR: Record<Tone, string> = {
  neutral: 'var(--text)',
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
  blue: 'var(--blue)',
  violet: 'var(--violet)',
  teal: 'var(--teal)',
  amber: 'var(--amber)',
  rose: 'var(--rose)',
  green: 'var(--green)',
  cyan: 'var(--cyan)',
}

export function toneColor(t: Tone): string {
  return TONE_VAR[t]
}

/** Tone by utilization: green < warnAt <= amber < badAt <= red */
export function utilTone(v: number, warnAt = 0.7, badAt = 0.9): Tone {
  return v >= badAt ? 'bad' : v >= warnAt ? 'warn' : 'ok'
}

