import { RoughBox } from '../../../kit'
import type { SchedulingExplanation } from '../../../engines/cluster'
import styles from '../styles.module.css'

const REASON_HR: Record<string, string> = {
  'Insufficient cpu': 'premalo nerezerviranog CPU-a',
  'Insufficient memory': 'premalo nerezervirane memorije',
  'Too many pods': 'već 110 Podova',
}

/** Per-node ✓/✗ with the filter's reasons and LeastAllocated scores – straight from explainScheduling(). */
export function SchedTable({ exp, need }: { exp: SchedulingExplanation; need: { cpuM: number; memMi: number } }) {
  return (
    <div className={styles.sched} role="list" aria-label="Rezultat filtriranja i bodovanja po čvorovima">
      {exp.rows.map((r, i) => {
        const freeCpu = r.allocatable.cpuM - r.requested.cpuM
        const freeMem = r.allocatable.memMi - r.requested.memMi
        const win = r.fits && exp.best.includes(r.node)
        return (
          <RoughBox key={r.node} seed={1760 + i} stroke={win ? 'var(--green)' : r.fits ? 'var(--ink-2)' : 'var(--red)'} double={win} pad={0}>
          <div role="listitem" className={styles.schedRow}>
            <span className={r.fits ? styles.ok : styles.bad} aria-hidden="true">
              {r.fits ? '✓' : '✗'}
            </span>
            <span className={styles.schedNode}>{r.node}</span>
            <span className={styles.schedScore}>{r.fits && r.score ? `${r.score.score} bod.` : 'ispada'}</span>
            <span />
            <span className={styles.schedWhy} style={{ gridColumn: '2 / 4' }}>
              {r.fits ? (
                <>
                  slobodno {freeCpu}m · {freeMem}Mi ≥ traži {need.cpuM}m · {need.memMi}Mi
                  {r.score && (
                    <>
                      <br />
                      bodovi: CPU {r.score.cpuScore}, RAM {r.score.memScore} → {r.score.score}
                      {win && exp.best.length > 1 ? ' (izjednačeno: slučajni odabir)' : win ? ' · pobjednik' : ''}
                    </>
                  )}
                </>
              ) : (
                <>
                  <span className={styles.bad}>{r.reasons.join(', ')}</span>
                  {r.reasons.some((x) => REASON_HR[x]) && <> – {r.reasons.map((x) => REASON_HR[x] ?? x).join(', ')}</>}
                  <br />
                  slobodno {freeCpu}m · {freeMem}Mi, traži {need.cpuM}m · {need.memMi}Mi
                </>
              )}
            </span>
          </div>
          </RoughBox>
        )
      })}
    </div>
  )
}
