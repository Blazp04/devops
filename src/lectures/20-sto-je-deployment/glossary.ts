import type { GlossaryEntry } from '../../curriculum/types'

/** Terms introduced in lecture 20 (postavljanje, izdanje i strategije). Course-wide entries with the same id take precedence. */
const glossary: GlossaryEntry[] = [
  {
    id: 'environment',
    term: 'Environment',
    hr: 'okruženje',
    definition: 'Mjesto u kojem radi jedna kopija aplikacije: dev, staging ili produkcija. Okruženja se razlikuju u podatcima, opterećenju i konfiguraciji.',
    menza: 'probna kuhinja i prava menza',
    lecture: '20',
  },
  {
    id: 'promotion',
    term: 'Promotion',
    hr: 'promocija artefakta',
    definition: 'Ista slika, s istim digestom, premješta se iz jednog okruženja u sljedeće. Ne gradi se ponovno za svako okruženje.',
    lecture: '20',
  },
  {
    id: 'kustomize',
    term: 'Kustomize',
    hr: 'Kustomize',
    definition: 'Alat ugrađen u kubectl koji iz zajedničke osnove (base) i tankog sloja za okruženje (overlay) izradi običan YAML, bez predložaka.',
    menza: 'isti recept, druga količina',
    lecture: '20',
  },
  {
    id: 'feature-flag',
    term: 'Feature flag',
    hr: 'zastavica značajke (engl. feature flag)',
    definition: 'Uvjet u kodu koji se mijenja bez novog postavljanja: novu funkcionalnost uključuje za dio korisnika, za sve ili je gasi u sekundi.',
    menza: 'novo jelo samo za probu',
    lecture: '20',
  },
  {
    id: 'expand-contract',
    term: 'Expand and contract',
    hr: 'proširi pa suzi (engl. expand and contract)',
    definition: 'Promjena sheme baze u koracima: dodaj novo uz staro, prebaci čitatelje, tek onda obriši staro. Svaki korak radi sa starom i novom verzijom.',
    lecture: '20',
  },
  {
    id: 'argo-rollouts',
    term: 'Argo Rollouts',
    hr: 'Argo Rollouts',
    definition: 'Kontroler za Kubernetes koji dodaje plavo-zeleno i canary uvođenje s koracima, analizom metrika i automatskim prekidom.',
    lecture: '20',
  },
]

export default glossary
