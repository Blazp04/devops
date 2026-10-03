/**
 * „Kontejner je samo proces”: the same process list seen from inside the container and from the host. The rows keep
 * their identity while the view changes (layout animation): gunicorn is PID 1 inside and PID 48213 outside, and
 * `uname -r` prints the same kernel in both views.
 */
import { useState } from 'react'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { LaptopDeck, Segmented } from '../../../kit'
import styles from './ProcessView.module.css'

type View = 'ct' | 'host'

interface Row {
  key: string
  pid: string
  cmd: string
  depth: number
  me?: boolean
  /** a process that is not the point (the shell and the ps command itself) */
  dim?: boolean
}

const HOST: Row[] = [
  { key: 'init', pid: '1', cmd: '/sbin/init', depth: 0 },
  { key: 'sshd', pid: '904', cmd: 'sshd', depth: 0 },
  { key: 'containerd', pid: '1032', cmd: 'containerd', depth: 0 },
  { key: 'dockerd', pid: '1187', cmd: 'dockerd', depth: 0 },
  { key: 'pg', pid: '2210', cmd: 'postgres', depth: 0 },
  { key: 'shim', pid: '48190', cmd: 'containerd-shim-runc-v2', depth: 0 },
  { key: 'master', pid: '48213', cmd: 'gunicorn klopa.wsgi', depth: 1, me: true },
  { key: 'w1', pid: '48240', cmd: 'gunicorn klopa.wsgi', depth: 2, me: true },
  { key: 'w2', pid: '48241', cmd: 'gunicorn klopa.wsgi', depth: 2, me: true },
  // the shell Iva opened with docker exec is a child of the same shim: also just a host process
  { key: 'bash', pid: '50102', cmd: 'bash', depth: 1, dim: true },
  { key: 'shim2', pid: '49260', cmd: 'containerd-shim-runc-v2', depth: 0 },
  { key: 'worker', pid: '49288', cmd: 'python -m klopa.worker', depth: 1 },
  { key: 'more', pid: '…', cmd: '(još ~180 procesa domaćina)', depth: 0, dim: true },
]

const CT: Row[] = [
  { key: 'master', pid: '1', cmd: 'gunicorn klopa.wsgi', depth: 0, me: true },
  { key: 'w1', pid: '7', cmd: 'gunicorn klopa.wsgi', depth: 1, me: true },
  { key: 'w2', pid: '8', cmd: 'gunicorn klopa.wsgi', depth: 1, me: true },
  { key: 'bash', pid: '15', cmd: 'bash', depth: 0, dim: true },
  { key: 'ps', pid: '23', cmd: 'ps -e --forest -o pid,cmd', depth: 1, dim: true },
]

const FACTS: { label: string; host: string; ct: string; same?: boolean }[] = [
  { label: 'hostname', host: 'posluzitelj-2', ct: '3f9c2a7d1b8e' },
  { label: 'cat /etc/os-release', host: 'Ubuntu 22.04', ct: 'Ubuntu 24.04' },
  { label: 'uname -r', host: '6.8.0-85-generic', ct: '6.8.0-85-generic', same: true },
]

export function ProcessView() {
  const [view, setView] = useState<View>('ct')
  const reduce = useReducedMotion()
  const rows = view === 'host' ? HOST : CT
  const t = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 160, damping: 24 }
  return (
    <div className={styles.wrap}>
      <div className={styles.controls}>
        <Segmented<View>
          label="Pogled"
          value={view}
          onChange={setView}
          options={[
            { value: 'ct', label: 'Iz kontejnera' },
            { value: 'host', label: 'S domaćina' },
          ]}
        />
      </div>
      <div className={`${styles.laptop} k-pinned`}>
        <div className={styles.screen} role="region" aria-label={view === 'host' ? 'Popis procesa na domaćinu' : 'Popis procesa u kontejneru'}>
          <p className={styles.prompt}>
            <span className={styles.ps1}>{view === 'host' ? 'davor@posluzitelj-2:~$' : 'root@3f9c2a7d1b8e:/app#'}</span> ps -e --forest -o pid,cmd
          </p>
          <div className={styles.head} aria-hidden="true">
            <span>PID</span>
            <span>CMD</span>
          </div>
          <LayoutGroup>
            <ul className={styles.rows}>
              <AnimatePresence initial={false}>
                {rows.map((r) => (
                  <motion.li
                    key={r.key}
                    layout="position"
                    layoutId={r.key}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.15 } }}
                    transition={t}
                    className={`${styles.row}${r.me ? ` ${styles.me}` : ''}${r.dim ? ` ${styles.dim}` : ''}`}
                  >
                    <span className={styles.pid}>
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.span key={r.pid} initial={{ opacity: 0, y: reduce ? 0 : -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduce ? 0 : 8 }} transition={{ duration: reduce ? 0 : 0.25 }} className={styles.pidNum}>
                          {r.pid}
                        </motion.span>
                      </AnimatePresence>
                    </span>
                    <span className={styles.cmd} style={{ paddingLeft: `${r.depth * 1.6}ch` }}>
                      {r.depth > 0 && <span className={styles.tree}>\_ </span>}
                      {r.cmd}
                    </span>
                    {r.key === 'master' && <span className={styles.tag}>{view === 'host' ? '← isti proces' : '← klopa-api'}</span>}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </LayoutGroup>
          <dl className={styles.facts}>
            {FACTS.map((f) => (
              <div key={f.label} className={styles.fact}>
                <dt>$ {f.label}</dt>
                <dd>
                  <span className={f.same ? styles.same : undefined}>{view === 'host' ? f.host : f.ct}</span>
                  {f.same && <span className={styles.sameNote}> ✓ ista jezgra u oba pogleda</span>}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <LaptopDeck className={styles.deck} />
      </div>
    </div>
  )
}
