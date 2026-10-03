import type { GlossaryEntry } from '../../curriculum/types'

const entries: GlossaryEntry[] = [
  {
    id: 'red-metrike',
    term: 'RED metrike',
    hr: 'RED (Rate, Errors, Duration)',
    definition: 'Tri broja po servisu: koliko zahtjeva stiže u sekundi, koliki je udio grešaka i koliko traju (npr. p95). Kažu da nešto ne valja.',
    lecture: '24',
  },
  {
    id: 'trag',
    term: 'Trag',
    hr: 'trag (engl. trace)',
    definition: 'Put jednog zahtjeva kroz sve slojeve, kao niz vremenskih raspona s istim trace_id-jem. Pokazuje gdje zahtjev gubi vrijeme ili pada.',
    lecture: '24',
  },
  {
    id: 'mttr',
    term: 'MTTR',
    hr: 'srednje vrijeme oporavka (engl. mean time to recovery)',
    definition: 'Koliko u prosjeku prođe od prve greške do oporavka sustava. Mjeri se po incidentu i prati kroz vrijeme.',
    lecture: '24',
  },
]

export default entries
