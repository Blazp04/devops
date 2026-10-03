import type { GlossaryEntry } from '../../curriculum/types'

/** Terms introduced in lecture 02 that the course glossary does not have yet (course entries win on id conflicts). */
const glossary: GlossaryEntry[] = [
  {
    id: 'worker',
    term: 'Worker',
    hr: 'radnik',
    definition:
      'Proces (ili dretva) poslužitelja koji obrađuje zahtjeve. Sinkroni radnik obrađuje jedan zahtjev odjednom i drži svoju memoriju i dok čeka bazu, pa koliko radnika stane, određuje RAM.',
    menza: '= mjesto na pultu (tanjur)',
  },
  {
    id: 'utilization',
    term: 'Utilization',
    hr: 'iskorištenost',
    definition:
      'Udio vremena u kojem je neki resurs zauzet: procesor, radnici, veza prema bazi. Kad se iskorištenost približi 100 %, zahtjevi sve dulje čekaju u redu.',
  },
  {
    id: 'vcpu',
    term: 'vCPU',
    hr: 'vCPU (virtualna procesorska jezgra)',
    definition:
      'Procesorska jezgra koju pružatelj u oblaku dodjeljuje virtualnom poslužitelju (često jedna hardverska dretva fizičke jezgre). Jedan zahtjev u jednom trenutku koristi najviše jednu.',
  },
  {
    id: 'oom',
    term: 'Out of memory (OOM)',
    hr: 'OOM (nestalo memorije)',
    definition:
      'Stanje kad procesima ponestane RAM-a. Linuxov OOM killer tada ubija proces: aplikacija naglo pada, a zahtjevi u njoj propadaju.',
  },
  {
    id: 'load-test',
    term: 'Load test',
    hr: 'test opterećenja',
    definition: 'Program koji namjerno šalje zadani promet (npr. 12 zahtjeva u sekundi) i mjeri propusnost, latenciju i greške. Pokreće se samo prema vlastitim poslužiteljima.',
  },
]

export default glossary
