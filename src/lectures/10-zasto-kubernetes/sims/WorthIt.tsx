/**
 * Scene 6 „Što Kubernetes nije i isplati li se”: what it does (from the Kubernetes overview) written inside the
 * cluster frame (double blue pen + helm), what it does not do as a red-pencil list outside the frame, and a small
 * decision checklist for Klopa.
 */
import { useState } from 'react'
import { CheckBox, Helm, RoughBox, StickyNote } from '../../../kit'
import styles from '../styles.module.css'

interface Item {
  title: string
  body: string
}

const DOES: Item[] = [
  { title: 'Otkrivanje usluga i raspodjela opterećenja', body: 'Kopije dobiju jedno stalno ime i adresu, a promet se dijeli među njima (14. predavanje).' },
  { title: 'Uvođenje i povratak verzija', body: 'Nova verzija kopiju po kopiju, a ako ne valja – natrag na staru (13. predavanje).' },
  { title: 'Slaganje na čvorove', body: 'Za svaku kopiju bira čvor koji ima dovoljno mjesta (engl. bin packing, 17. predavanje).' },
  { title: 'Samooporavak', body: 'Ponovno pokreće srušene kontejnere i zamjenjuje Podove s čvorova koji ne rade (12. predavanje).' },
  { title: 'Konfiguracija i tajne', body: 'Postavke i lozinke drži izvan slike kontejnera (16. predavanje).' },
  { title: 'Horizontalno skaliranje', body: 'Više ili manje kopija – jednim brojem ili prema opterećenju (18. predavanje).' },
]

const DOES_NOT: Item[] = [
  { title: 'Ne gradi kod ni slike', body: 'Sliku kontejnera gradite vi (8. predavanje) ili vaš CI (21. predavanje).' },
  { title: 'Nema CI/CD', body: 'Pipeline i GitOps dodatni su alati iznad klastera (21. i 22. predavanje).' },
  { title: 'Ne daje bazu ni red poruka', body: 'Postgres, RabbitMQ i Redis pokrećete sami (19. predavanje) ili ih kupite kao uslugu.' },
  { title: 'Nije PaaS', body: 'Ne zna vaš jezik ni okvir i sam od sebe ne čini aplikaciju skalabilnom: mora biti bez stanja (5. predavanje).' },
  { title: 'Ne pokreće kontejnere sam', body: 'Na čvoru ih pokreće izvršno okruženje za kontejnere (containerd ili CRI-O). Slike izgrađene Dockerom rade bez promjene.' },
]

const CHECKS = [
  'Imamo više dijelova (web, API, potrošače…) kojima često izdajemo nove verzije.',
  'Treba nam više poslužitelja – zbog prometa ili da pad jednog ne sruši sve.',
  'Promet se jako mijenja (ručak, ispitni rok), pa broj kopija treba mijenjati.',
  'Aplikacija je bez stanja: stanje je u bazi i Redisu, pa se kopije smiju zamjenjivati.',
  'Netko će klaster održavati – ili plaćamo upravljani klaster.',
  'Jedan poslužitelj s Docker Composeom više nam nije dovoljan.',
]

function List({ items, mark }: { items: Item[]; mark: '✓' | '✗' }) {
  return (
    <ul className={styles.kList}>
      {items.map((c) => (
        <li key={c.title} className={styles.kItem}>
          <span className={`${styles.kMark} ${mark === '✓' ? styles.kMarkYes : styles.kMarkNo}`} aria-hidden="true">
            {mark}
          </span>
          <span>
            <span className={styles.kTitle}>{c.title}</span> <span className={styles.kBody}>{c.body}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** One notebook figure: the cluster frame holds what Kubernetes does; what it does not do stays outside, in red pencil. */
export function DoesAndDoesNot() {
  return (
    <div className={`k-wide ${styles.worth}`}>
      <RoughBox className={styles.clusterFrame} seed={8100} stroke="var(--pen)" strokeWidth={1.8} double>
        <div className={styles.frameHead}>
          <svg viewBox="0 0 44 44" width="40" height="40" aria-hidden="true">
            <Helm x={22} y={22} r={17} seed={8101} />
          </svg>
          <p className={`${styles.colHead} ${styles.colHeadYes}`}>✓ Što Kubernetes radi</p>
        </div>
        <List items={DOES} mark="✓" />
      </RoughBox>
      <div className={styles.notList}>
        <p className={`${styles.colHead} ${styles.colHeadNo}`}>✗ Što Kubernetes ne radi</p>
        <p className={styles.notHint}>izvan klastera – to dodajemo sami</p>
        <List items={DOES_NOT} mark="✗" />
      </div>
    </div>
  )
}

export function WorthItChecklist() {
  const [on, setOn] = useState<boolean[]>(() => CHECKS.map(() => false))
  const n = on.filter(Boolean).length
  const ops = on[4]
  const verdict =
    n <= 2
      ? { c: 'blue' as const, title: 'Vjerojatno se ne isplati', body: 'Jedan poslužitelj s Docker Composeom (9. predavanje) ili gotova platforma (PaaS) jednostavniji su i jeftiniji. Kubernetes bi bio novi sustav koji treba čuvati, a ne bi riješio vaš problem.' }
      : n <= 4 || !ops
        ? { c: 'yellow' as const, title: 'Možda – ali pazite na cijenu', body: ops ? 'Dobit je stvarna, ali i složenost. Razmislite o upravljanom klasteru ili jednostavnijoj platformi.' : 'Bez nekoga tko će klaster održavati, klaster postaje Davorov novi noćni posao. Ako ga uzimate, uzmite upravljani klaster.' }
        : { c: 'green' as const, title: 'Isplati se', body: 'Najčešće kao upravljani klaster: upravljačku ravninu održava pružatelj usluge, a vi i dalje brinete o čvorovima, aplikacijama i nadogradnjama.' }
  return (
    <div>
      <p className={styles.checkHead}>Isplati li se Klopi? Označite što vrijedi.</p>
      <ul className={styles.checklist}>
        {CHECKS.map((text, i) => (
          <li key={i}>
            <button type="button" className={styles.checkItem} aria-pressed={on[i]} onClick={() => setOn((o) => o.map((v, k) => (k === i ? !v : v)))}>
              <CheckBox checked={on[i]} seed={8300 + i} className={styles.checkBox} />
              <span>{text}</span>
            </button>
          </li>
        ))}
      </ul>
      <StickyNote c={verdict.c} className={styles.verdict} rotate={-0.6}>
        <div className={styles.verdictTitle} role="status">
          {`${n} od ${CHECKS.length}: ${verdict.title}`}
        </div>
        <p className={styles.verdictBody}>{verdict.body}</p>
      </StickyNote>
    </div>
  )
}
