/**
 * „Naočale”: Linux namespaces change what a process SEES. Three lenses (pid, net, mnt) on one process
 * (klopa-api's gunicorn); each panel shows the world through it, with the lens off (the host's view) or on.
 */
import { useState } from 'react'
import { Button, Rough } from '../../../kit'
import styles from './Lenses.module.css'

type Lens = 'pid' | 'net' | 'mnt'

const LENSES: { id: Lens; title: string; what: string }[] = [
  { id: 'pid', title: 'Procesi', what: 'imenski prostor PID-ova' },
  { id: 'net', title: 'Mreža', what: 'mrežni imenski prostor' },
  { id: 'mnt', title: 'Datoteke', what: 'imenski prostor montiranja' },
]

// lines stay ≤ 22 characters so they never wrap in the narrow panels
const VIEW: Record<Lens, { off: string[]; on: string[]; offNote: string; onNote: string }> = {
  pid: {
    off: ['1      init', '904    sshd', '2210   postgres', '48213  gunicorn ← ja', '49288  klopa.worker', '…      još ~180'],
    on: ['1  gunicorn ← ja', '7  gunicorn', '8  gunicorn'],
    offNote: 'vidi sve procese domaćina',
    onNote: 'vidi samo sebe i svoju djecu; on je PID 1',
  },
  net: {
    off: ['lo       127.0.0.1', 'eth0     203.0.113.12', 'docker0  172.17.0.1', ':8000    zajednički'],
    on: ['lo    127.0.0.1', 'eth0  172.17.0.3', ':8000 samo njegov'],
    offNote: 'dijeli mrežu i portove s domaćinom',
    onNote: 'vlastita sučelja; localhost je samo on',
  },
  mnt: {
    off: ['OS       Ubuntu 22.04', 'libvips  8.12', '/home/davor/', '/var/lib/postgresql/'],
    on: ['OS       Ubuntu 24.04', 'libvips  8.15', '/app/klopa/'],
    offNote: 'vidi datoteke domaćina',
    onNote: 'vlastita montiranja; kao „/” dobije datoteke slike',
  },
}

/** Three round lenses on one frame; a lens that is on is hatched with the blue pen. */
function Glasses({ on }: { on: Record<Lens, boolean> }) {
  const cx = [62, 160, 258]
  return (
    <svg viewBox="0 0 320 96" className={styles.glasses} aria-hidden="true">
      <Rough shape={{ k: 'curve', pts: [[4, 34], [14, 26], [26, 30]] }} seed={7901} strokeWidth={1.8} />
      <Rough shape={{ k: 'curve', pts: [[294, 30], [306, 26], [316, 34]] }} seed={7902} strokeWidth={1.8} />
      {[0, 1].map((i) => (
        <Rough key={i} shape={{ k: 'curve', pts: [[cx[i] + 38, 40], [(cx[i] + cx[i + 1]) / 2, 30], [cx[i + 1] - 38, 40]] }} seed={7903 + i} strokeWidth={1.8} />
      ))}
      {LENSES.map((l, i) => (
        <g key={l.id}>
          <Rough shape={{ k: 'ellipse', cx: cx[i], cy: 44, w: 76, h: 64 }} seed={7910 + i} strokeWidth={2} stroke="var(--ink)" fillColor={on[l.id] ? 'var(--pen)' : undefined} hachureGap={6} fillWeight={0.8} />
          <text x={cx[i]} y={50} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 16, fontWeight: 700 }}>
            {l.id}
          </text>
        </g>
      ))}
    </svg>
  )
}

export function Lenses() {
  const [on, setOn] = useState<Record<Lens, boolean>>({ pid: false, net: false, mnt: false })
  const count = LENSES.filter((l) => on[l.id]).length
  const toggle = (id: Lens) => setOn((o) => ({ ...o, [id]: !o[id] }))
  return (
    <div className={styles.wrap}>
      <div className={styles.top}>
        <Glasses on={on} />
        <div className={styles.buttons} role="group" aria-label="Imenski prostori (naočale)">
          {LENSES.map((l) => (
            <Button key={l.id} size="sm" active={on[l.id]} onClick={() => toggle(l.id)} title={l.what}>
              {`naočale ${l.id}`}
            </Button>
          ))}
        </div>
      </div>
      <div className={styles.panels}>
        {LENSES.map((l) => {
          const v = VIEW[l.id]
          const lens = on[l.id]
          return (
            <div key={l.id} role="group" className={`${styles.panel} k-card`} aria-label={`${l.title}: ${lens ? v.onNote : v.offNote}`}>
              <p className={styles.title}>
                {l.title} <span className={styles.ns}>({l.id})</span>
              </p>
              <ul className={styles.list}>
                {(lens ? v.on : v.off).map((line) => (
                  <li key={line} className={line.includes('← ja') ? styles.me : undefined}>
                    {line}
                  </li>
                ))}
              </ul>
              <p className={lens ? styles.noteOn : styles.noteOff}>
                {lens ? '✓ ' : '! '}
                {lens ? v.onNote : v.offNote}
              </p>
            </div>
          )
        })}
      </div>
      <p className={styles.readout} aria-live="polite">
        {count === 0 && 'Bez naočala gunicorn je običan proces domaćina: vidi sve procese, mrežu i datoteke.'}
        {count > 0 && count < 3 && `Uključeno: ${LENSES.filter((l) => on[l.id]).map((l) => l.id).join(', ')}. Proces je i dalje isti – samo vidi manje.`}
        {count === 3 &&
          'Sve tri: proces vidi svijet kao da je sam na računalu – a i dalje je isti proces na istoj jezgri. Docker uključuje i još neke imenske prostore (npr. uts za ime računala).'}
      </p>
    </div>
  )
}
