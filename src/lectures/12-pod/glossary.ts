import type { GlossaryEntry } from '../../curriculum/types'

/** Terms introduced in lecture 12 that the course glossary does not have (course-wide entries win on id conflicts). */
const glossary: GlossaryEntry[] = [
  {
    id: 'startup-probe',
    term: 'Startup probe',
    hr: 'provjera pokretanja',
    definition:
      'Provjera koju kubelet izvodi dok se aplikacija pokreće. Dok ne uspije, provjere živosti i spremnosti ne rade, pa spora aplikacija ima vremena; ako padne failureThreshold puta zaredom, kubelet ubija kontejner.',
    menza: 'kuharica pita „jesi li već upalila štednjak?”',
  },
  {
    id: 'init-container',
    term: 'Init container',
    hr: 'init kontejner',
    definition: 'Kontejner u Podu koji se pokreće prije glavnih i mora uspješno završiti, na primjer da pričeka bazu ili pripremi datoteke. Init kontejneri rade jedan za drugim.',
  },
  {
    id: 'sidecar-container',
    term: 'Sidecar container',
    hr: 'sidecar (pomoćni kontejner)',
    definition:
      'Pomoćni kontejner koji radi uz glavni cijelo vrijeme, na primjer šalje zapise dalje. Nativni sidecar je init kontejner s restartPolicy: Always: pokrene se prije glavnog, smije imati provjere i gasi se nakon njega.',
  },
]

export default glossary
