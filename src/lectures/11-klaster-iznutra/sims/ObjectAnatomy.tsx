import { RoughBox, Tape } from '../../../kit'
import styles from '../styles.module.css'

/**
 * Scene 3 „Anatomija objekta”: the same Pod as Lana wrote it (top + spec, dashed = desired) and as the cluster
 * reports it back (status, solid = actual). Real fields, shortened.
 */
export function ObjectAnatomy() {
  return (
    <figure className={styles.anatomy} aria-label="Anatomija objekta Pod: zaglavlje apiVersion, kind i metadata; spec je željeno stanje koje piše Lana, status je stvarno stanje koje piše kubelet.">
      <RoughBox className={styles.anaHead} seed={4101} stroke="var(--ink)">
        <div className={styles.anaLabel}>tko je objekt</div>
        <pre className={styles.anaCode} tabIndex={0} aria-label="Zaglavlje objekta">{`apiVersion: v1
kind: Pod
metadata:
  name: klopa-worker
  namespace: klopa
  labels: { app: klopa-worker }`}</pre>
      </RoughBox>
      <div className={styles.anaCols}>
        <RoughBox className={styles.anaSpec} seed={4111} stroke="var(--pen)" dash="7 5" strokeWidth={1.8}>
          <Tape c="blue" style={{ top: -10, left: 18, transform: 'rotate(-3deg)' }} />
          <div className={styles.anaLabel} style={{ color: 'var(--pen)' }}>
            spec = željeno · piše Lana
          </div>
          <pre className={styles.anaCode} tabIndex={0} aria-label="spec, željeno stanje">{`spec:
  containers:
  - name: klopa-worker
    image: registry.klopa.example/klopa-worker:1.3.2
  # nodeName upiše raspoređivač:
  nodeName: node-2`}</pre>
        </RoughBox>
        <RoughBox className={styles.anaStatus} seed={4121} stroke="var(--green)" strokeWidth={2} double>
          <Tape c="green" style={{ top: -10, right: 18, transform: 'rotate(3deg)' }} />
          <div className={styles.anaLabel} style={{ color: 'var(--green)' }}>
            status = stvarno · piše kubelet
          </div>
          <pre className={styles.anaCode} tabIndex={0} aria-label="status, stvarno stanje">{`status:
  phase: Running
  podIP: 10.244.2.4
  conditions:
  - type: Ready
    status: "True"`}</pre>
        </RoughBox>
      </div>
      <figcaption className={styles.anaCaption}>
        Iscrtkano je ono što želimo, puna linija ono što jest. Kontroleri cijelo vrijeme rade samo jedno: smanjuju razliku između <code>spec</code> i <code>status</code>. Najvažnija iznimka: polje <code>nodeName</code> u <code>spec</code> ne piše Lana, nego raspoređivač. I kontrola prihvata dopisuje zadane vrijednosti – npr. toleranciju od 300 s zbog koje Podovi s mrtvog čvora čekaju pet minuta.
      </figcaption>
    </figure>
  )
}
