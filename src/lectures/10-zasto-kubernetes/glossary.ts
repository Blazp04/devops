import type { GlossaryEntry } from '../../curriculum/types'

/** Terms introduced in lecture 10 (zašto Kubernetes). Course-wide entries with the same id take precedence. */
const glossary: GlossaryEntry[] = [
  {
    id: 'imperative-declarative',
    term: 'Imperative vs declarative',
    hr: 'imperativno i deklarativno',
    definition: 'Imperativno opisujemo korake („pokreni tri kontejnera”), deklarativno rezultat („neka uvijek rade tri kopije”). Deklarativnu izjavu možemo ponoviti koliko god puta – ishod je isti.',
    menza: '„skuhaj 12 porcija” prema „na pultu neka uvijek bude 12 porcija”',
  },
  {
    id: 'level-triggered',
    term: 'Level-triggered',
    hr: 'okidanje razinom',
    definition: 'Sustav svaki put iznova pogleda trenutačno stanje i ispravi razliku, umjesto da reagira samo na poruke o promjenama (okidanje rubom, engl. edge-triggered). Zato mu izgubljena obavijest ne smeta.',
    menza: 'teta Mira gleda pult, a ne čeka da joj netko javi da je nestalo ćevapa',
  },
]

export default glossary
