/**
 * „Odluke HPA-a”: every sync of the klopa-api HPA with its own formula (the engine writes the Croatian one-liner),
 * newest first. Decisions that changed something or were held back by a rule stay in the list; the latest sync is
 * always on top, so the reader sees the 15 s rhythm.
 */
import { Badge } from '../../../kit'
import type { HpaDecision } from '../../../engines/cluster'
import { secs } from '../lib/format'
import styles from '../styles.module.css'

const LIMIT: Partial<Record<HpaDecision['limitedBy'], { text: string; tone: 'warn' | 'bad' | 'blue' | 'neutral' }>> = {
  ScaleUpLimit: { text: 'ograničenje brzine', tone: 'warn' },
  ScaleDownLimit: { text: 'ograničenje brzine', tone: 'warn' },
  stabilization: { text: 'prozor 300 s', tone: 'blue' },
  tolerance: { text: 'tolerancija ±10 %', tone: 'neutral' },
  TooManyReplicas: { text: 'maxReplicas', tone: 'bad' },
  TooFewReplicas: { text: 'minReplicas', tone: 'neutral' },
  error: { text: 'nema metrike', tone: 'bad' },
}

function interesting(d: HpaDecision): boolean {
  return d.final !== d.current || (d.limitedBy !== 'none' && d.limitedBy !== 'tolerance')
}

export function HpaTimeline({ decisions, max = 5 }: { decisions: HpaDecision[]; max?: number }) {
  const last = decisions.at(-1)
  const rest = decisions.slice(0, -1).filter(interesting).slice(-(max - 1)).reverse()
  const rows = last ? [last, ...rest] : []
  return (
    <div className={styles.hpaLog} aria-live="off">
      <div className={styles.hpaLogHead}>Odluke HPA-a (svakih 15 s)</div>
      {rows.length === 0 && <p className={styles.hpaEmpty}>Prva provjera stiže za nekoliko sekundi.</p>}
      <ol className={styles.hpaList}>
        {rows.map((d, i) => {
          const lim = LIMIT[d.limitedBy]
          const changed = d.final !== d.current
          return (
            <li key={d.t} className={styles.hpaRow} data-changed={changed ? 'yes' : 'no'}>
              <span className={styles.hpaT}>{i === 0 ? 'zadnja · ' : ''}t = {secs(d.t)}</span>
              <span className={styles.hpaMove}>
                {d.current} → {d.final}
                {changed ? (d.final > d.current ? ' ↑' : ' ↓') : ''}
              </span>
              {lim && <Badge tone={lim.tone}>{lim.text}</Badge>}
              <span className={styles.hpaText}>{d.error ?? d.text}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
