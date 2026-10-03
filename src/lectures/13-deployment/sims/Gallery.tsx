/** Scene 6 „Galerija kontrolera”: the other workload controllers, each with its doodle and a Klopa example. */
import { K8sGlyph, RoughBox, Term, type K8sKind } from '../../../kit'
import styles from '../styles.module.css'

const CARDS: { kind: K8sKind; name: string; term?: string; text: string }[] = [
  {
    kind: 'ds',
    name: 'DaemonSet',
    term: 'daemonset',
    text: 'Točno jedan Pod na svakom čvoru (ili na odabranima). Za ono što treba svakom stroju: skupljanje zapisa, nadzor čvora, mrežni dodatak. Novi čvor odmah dobije svoj Pod.',
  },
  {
    kind: 'job',
    name: 'Job',
    term: 'job',
    text: 'Posao koji ima kraj: Pod radi dok ne završi uspješno, a pri neuspjehu ga Job pokrene ponovno (do backoffLimit). Klopa: migracija baze prije verzije 1.4.0.',
  },
  {
    kind: 'cronjob',
    name: 'CronJob',
    text: 'Job po rasporedu, kao cron: svako pokretanje stvori novi Job. Klopa: izvještaj kuhinji radnim danom u 6:30.',
  },
  {
    kind: 'sts',
    name: 'StatefulSet',
    text: 'Podovi sa stalnim imenom i vlastitim diskom (db-0, db-1…). Za baze podataka – vidimo ga u 19. predavanju.',
  },
]

export function ControllerGallery() {
  return (
    <div className={styles.gallery}>
      {CARDS.map((c, i) => (
        <RoughBox key={c.kind} className={styles.galleryCard} seed={9950 + i} stroke="var(--ink-3)">
          <div className={styles.galleryTitle}>
            <svg viewBox="0 0 40 30" width="40" height="30" aria-hidden="true">
              <K8sGlyph kind={c.kind} x={2} y={2} w={36} h={26} />
            </svg>
            {c.term ? <Term id={c.term}>{c.name}</Term> : c.name}
          </div>
          <p className={styles.galleryText}>{c.text}</p>
        </RoughBox>
      ))}
    </div>
  )
}
