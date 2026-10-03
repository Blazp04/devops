import type { GlossaryEntry } from '../../curriculum/types'

/**
 * Terms introduced in lecture 13 that the course glossary does not have yet. Course-wide entries with the same id
 * take precedence (deployment, replicaset, rolling-update, rollback, deploy live in src/curriculum/data.ts).
 */
const glossary: GlossaryEntry[] = [
  {
    id: 'pod-template-hash',
    term: 'pod-template-hash',
    hr: 'sažetak predloška Poda (pod-template-hash)',
    definition:
      'Oznaka koju Deployment dodaje ReplicaSetu i njegovim Podovima: sažetak predloška Poda. Svaka promjena predloška (slika, varijabla okoline, provjera) daje novi sažetak, a time i novi ReplicaSet.',
    lecture: '13',
  },
  {
    id: 'owner-reference',
    term: 'ownerReferences',
    hr: 'vlasnik objekta (ownerReferences)',
    definition:
      'Polje u metapodatcima koje kaže tko je vlasnik objekta: Pod pokazuje na svoj ReplicaSet, ReplicaSet na Deployment. Brisanje vlasnika briše i ono što posjeduje (kaskadno).',
    lecture: '13',
    menza: 'ime na kutiji za ručak',
  },
  {
    id: 'max-surge',
    term: 'maxSurge / maxUnavailable',
    hr: 'ograde postupnog ažuriranja',
    definition:
      'maxSurge kaže koliko Podova smije biti iznad zadanog broja replika (postotak se zaokružuje naviše), a maxUnavailable koliko ih smije nedostajati među dostupnima (zaokružuje se naniže). Zadano je 25 % i 25 %; oba ne smiju biti 0.',
    lecture: '13',
  },
  {
    id: 'progress-deadline',
    term: 'ProgressDeadlineExceeded',
    hr: 'istek roka uvođenja',
    definition:
      'Stanje Deploymenta kad uvođenje nije napredovalo dulje od progressDeadlineSeconds (zadano 600 s). Samo je oznaka: Kubernetes se ne vraća sam na staru verziju.',
    lecture: '13',
  },
  {
    id: 'daemonset',
    term: 'DaemonSet',
    hr: 'DaemonSet',
    definition: 'Kontroler koji na svakom čvoru (ili na odabranima) drži po jedan Pod, npr. za skupljanje zapisa ili nadzor čvora.',
    lecture: '13',
  },
  {
    id: 'job',
    term: 'Job',
    hr: 'Job',
    definition: 'Kontroler za posao koji završava: pokreće Pod dok ne uspije (uz ograničen broj ponovnih pokušaja). CronJob stvara Jobove po rasporedu.',
    lecture: '13',
  },
]

export default glossary
