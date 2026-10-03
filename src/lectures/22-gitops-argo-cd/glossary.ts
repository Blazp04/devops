import type { GlossaryEntry } from '../../curriculum/types'

/**
 * Terms introduced in lecture 22 that the course glossary does not have yet. Course-wide entries with the same id
 * take precedence (gitops, argo-cd and drift live in src/curriculum/data.ts).
 */
const glossary: GlossaryEntry[] = [
  {
    id: 'config-repo',
    term: 'Config repository',
    hr: 'config repozitorij',
    definition:
      'Git repozitorij u kojem su samo manifesti – željeno stanje klastera po okruženjima. Kod aplikacije je u drugom repozitoriju; CI u config repozitorij sprema samo novi digest slike.',
    lecture: '22',
    menza: '= bilježnica s receptima',
  },
  {
    id: 'sync-status',
    term: 'Sync status',
    hr: 'status sinkronizacije',
    definition:
      'Odgovor Argo CD-a na pitanje „je li klaster isti kao Git?”: Synced ako svaki objekt iz Gita jednako postoji u klasteru, inače OutOfSync. Ne govori radi li aplikacija.',
    lecture: '22',
  },
  {
    id: 'app-health',
    term: 'Health (Argo CD)',
    hr: 'zdravlje aplikacije',
    definition:
      'Odgovor Argo CD-a na pitanje „radi li to što je u klasteru?”: Healthy, Progressing, Degraded, Suspended, Missing ili Unknown. Neovisno o statusu sinkronizacije – moguće je Synced i Degraded.',
    lecture: '22',
  },
  {
    id: 'self-heal',
    term: 'selfHeal',
    hr: 'samoizlječenje (selfHeal)',
    definition:
      'Opcija automatske sinkronizacije: Argo CD vraća ručne promjene u klasteru na stanje iz Gita čim ih primijeti. Po zadanom je isključena.',
    lecture: '22',
  },
  {
    id: 'prune',
    term: 'prune',
    hr: 'čišćenje (prune)',
    definition:
      'Opcija sinkronizacije: Argo CD briše iz klastera objekte koje je sam postavio, a više ih nema u Gitu. Po zadanom je isključena, pa takav objekt ostaje i aplikacija je OutOfSync. Objekte koje je netko ručno stvorio ne dira.',
    lecture: '22',
  },
  {
    id: 'appproject',
    term: 'AppProject',
    hr: 'AppProject (projekt u Argo CD-u)',
    definition:
      'Objekt Argo CD-a koji ograničava aplikacije: iz kojih repozitorija smiju čitati, u koje klastere i Namespacee postavljati, koje vrste objekata smiju stvarati i čije potpise commitova moraju provjeriti (novije verzije Argo CD-a). Provodi ga sam Argo CD; njegova prava u Kubernetesu ograničava RBAC.',
    lecture: '22',
  },
  {
    id: 'ignore-differences',
    term: 'ignoreDifferences',
    hr: 'ignoreDifferences',
    definition:
      'Popis polja koja Argo CD ne uspoređuje (npr. /spec/replicas). Utječe samo na prikaz razlike; da ih ni sinkronizacija ne prepisuje, treba i opcija RespectIgnoreDifferences=true.',
    lecture: '22',
  },
]

export default glossary
