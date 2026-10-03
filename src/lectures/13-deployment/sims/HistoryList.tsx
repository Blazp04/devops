import { Mark } from '../../../kit'
import type { RevisionInfo } from '../../../engines/cluster'
import styles from '../styles.module.css'

/** `kubectl rollout history` as a small printed table: every revision is a ReplicaSet the Deployment keeps. */
export function HistoryList({ history }: { history: RevisionInfo[] }) {
  if (!history.length) return null
  return (
    <div className={styles.history} tabIndex={0} role="region" aria-label="Povijest revizija Deploymenta klopa-api">
      <div className={styles.historyHead}>
        povijest revizija (<span className="mono">kubectl rollout history</span> + broj Podova)
      </div>
      <table className={`${styles.historyTable} mono`}>
        <thead>
          <tr>
            <th scope="col">REVISION</th>
            <th scope="col">CHANGE-CAUSE</th>
            <th scope="col">Podova</th>
          </tr>
        </thead>
        <tbody>
          {history.map((h) => (
            <tr key={h.replicaSet}>
              <td>{h.revision}</td>
              <td>{h.current ? <Mark c="yellow">{h.changeCause || '<none>'}</Mark> : h.changeCause || '<none>'}</td>
              <td>
                {h.replicas}
                {h.current ? ' ← trenutačna' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
