/**
 * Glossary as a drawing's parts list: every term has an item number (balloon). The same number appears
 * on the term's balloon in the text and in the list at the foot of the sheet ("Pojmovnik").
 */
export interface GlossEntry {
  n: number
  term: string
  alt?: string
  def: string
  /** sheet where the term first appears */
  sheet: string
  anchor: string
}

export const GLOSSARY: GlossEntry[] = [
  {
    n: 1,
    term: 'load balancer',
    alt: 'raspodjeljivač opterećenja',
    def: 'prima sve dolazne zahtjeve i prosljeđuje svaki jednom od više poslužitelja, prema odabranom pravilu.',
    sheet: '04 · 1/6',
    anchor: '#podne',
  },
  {
    n: 2,
    term: 'provjera zdravlja',
    alt: 'health check',
    def: 'load balancer redovito pita svaki poslužitelj odgovara li; tko nekoliko puta zaredom ne odgovori, izlazi iz rotacije.',
    sheet: '04 · 2/6',
    anchor: '#simulacija',
  },
  {
    n: 3,
    term: 'p95',
    alt: '95. percentil odziva',
    def: 'vrijeme unutar kojeg dobije odgovor 95 % zahtjeva; preostalih 5 % čekalo je dulje.',
    sheet: '04 · 2/6',
    anchor: '#simulacija',
  },
  {
    n: 4,
    term: 'Pod',
    def: 'najmanja jedinica koju Kubernetes pokreće: jedan ili više kontejnera koji dijele mrežnu adresu.',
    sheet: '04 · 3/6',
    anchor: '#klaster',
  },
  {
    n: 5,
    term: 'Service',
    def: 'stalna adresa ispred skupine Podova s istom oznakom; promet šalje samo Podovima koji su spremni (Ready).',
    sheet: '04 · 3/6',
    anchor: '#klaster',
  },
  {
    n: 6,
    term: 'Deployment',
    def: 'opis željenog stanja aplikacije (slika, broj kopija, resursi); Kubernetes ga sam održava.',
    sheet: '04 · 5/6',
    anchor: '#specifikacija',
  },
]
