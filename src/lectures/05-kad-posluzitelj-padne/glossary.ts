import type { GlossaryEntry } from '../../curriculum/types'

/**
 * Terms introduced in lecture 05 that the course glossary does not have yet. Course-wide entries win on id
 * conflicts (health-check and stateless-service live in src/curriculum/data.ts; n-plus-one, failover, redundancy and
 * network-partition come from lecture 03).
 */
const glossary: GlossaryEntry[] = [
  {
    id: 'passive-health-check',
    term: 'Passive health check',
    hr: 'pasivna provjera ispravnosti',
    definition:
      'Load balancer prati odgovore na prave zahtjeve: ako se veza prema poslužitelju ne uspostavi, odmah ga na neko vrijeme izbaci iz prometa (NGINX: max_fails=1, fail_timeout=10s). Ne vidi poslužitelj na koji trenutačno ne ide promet, pa dopunjuje aktivnu provjeru.',
    menza: 'redar primijeti da se pladanj vratio',
  },
  {
    id: 'retry',
    term: 'Retry',
    hr: 'ponovni pokušaj',
    definition:
      'Load balancer zahtjev koji nije uspio poslati jednom poslužitelju šalje drugome. Siguran je kad zahtjev nije ni stigao do aplikacije (odbijena veza); ako je već obrađen, ponavljanje može narudžbu napraviti dvaput.',
  },
  {
    id: 'connection-draining',
    term: 'Connection draining',
    hr: 'pražnjenje poslužitelja',
    definition:
      'Planirano uklanjanje poslužitelja: load balancer mu prestaje slati nove zahtjeve, a započeti se dovrše. Kad više ništa nije u obradi, poslužitelj se smije ugasiti bez ijedne greške (AWS ALB zadano čeka do 300 s).',
    menza: 'pult zatvara red, ali poslužuje one koji već stoje',
  },
  {
    id: 'session',
    term: 'Session',
    hr: 'sesija',
    definition:
      'Podatci o jednom korisniku između dva zahtjeva: je li prijavljen, što je u košarici. Preglednik čuva samo kolačić s oznakom sesije, a sami podatci žive na poslužitelju – u memoriji procesa, u Redisu ili u bazi.',
  },
  {
    id: 'sticky-session',
    term: 'Sticky session',
    hr: 'ljepljiva sesija',
    definition:
      'Load balancer korisnika (po kolačiću ili IP adresi) uvijek šalje istom poslužitelju, pa sesija u memoriji tog poslužitelja „radi”. Cijena: neravnomjerno opterećenje, sesije nestaju s poslužiteljem, a novi poslužitelj ne preuzima postojeće korisnike.',
  },
  {
    id: 'cache',
    term: 'Cache',
    hr: 'predmemorija',
    definition:
      'Brza kopija podataka koji se često čitaju (npr. jelovnik u Redisu). Kod obrasca cache-aside aplikacija prvo pita predmemoriju, a bazu samo kad podatka ondje nema. Rasterećuje bazu, ali podatak u njoj može zastarjeti.',
  },
  {
    id: 'read-replica',
    term: 'Read replica',
    hr: 'replika za čitanje',
    definition:
      'Kopija baze koja prima promjene od glavne baze i odgovara samo na čitanja. Skalira čitanje, ali ne i pisanje; kod asinkrone replikacije kasni, pa može vratiti zastarjeli podatak.',
  },
  {
    id: 'floating-ip',
    term: 'Floating IP (virtual IP)',
    hr: 'plutajuća adresa',
    definition:
      'IP adresa koja nije vezana uz jedan stroj: drži je glavni load balancer, a kad on padne, preuzima je rezervni (npr. protokolom VRRP, alatom keepalived). Klijenti ne mijenjaju adresu.',
  },
  {
    id: 'cap-theorem',
    term: 'CAP theorem',
    hr: 'CAP teorem',
    definition:
      'Dok je mreža između kopija podataka prekinuta (particija), sustav mora birati: odbiti dio zahtjeva (dosljednost) ili odgovarati s možda zastarjelim podatcima (dostupnost). Kad mreža radi, CAP ništa ne kaže.',
  },
]

export default glossary
