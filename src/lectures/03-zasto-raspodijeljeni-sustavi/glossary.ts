import type { GlossaryEntry } from '../../curriculum/types'

/** Terms introduced in lecture 03 (zašto raspodijeljeni sustavi). Course-wide entries with the same id take precedence. */
const glossary: GlossaryEntry[] = [
  {
    id: 'mtbf',
    term: 'MTBF (mean time between failures)',
    hr: 'prosječno vrijeme između kvarova',
    definition: 'Koliko sati komponenta u prosjeku radi od jednog kvara do sljedećeg. Što je veći, kvarovi su rjeđi.',
    menza: 'koliko dugo štednjak radi bez kvara',
  },
  {
    id: 'mttr',
    term: 'MTTR (mean time to repair)',
    hr: 'prosječno vrijeme popravka',
    definition: 'Koliko u prosjeku traje od kvara do ponovnog rada: otkrivanje, popravak i ponovno pokretanje. Dostupnost je A = MTBF / (MTBF + MTTR).',
    menza: 'koliko dugo čekamo majstora',
  },
  {
    id: 'redundancy',
    term: 'Redundancy',
    hr: 'redundancija',
    definition: 'Namjerni višak: dva ili više dijelova ondje gdje bi bio dovoljan jedan, da sustav radi i kad jedan padne. Pomaže samo ako kvarovi nisu povezani i ako preživjeli imaju dovoljno kapaciteta.',
  },
  {
    id: 'n-plus-one',
    term: 'N+1',
    hr: 'N+1 (jedan rezervni)',
    definition: 'Pravilo planiranja kapaciteta: ako za vršni promet treba N poslužitelja, imamo ih N+1, pa pad bilo kojeg od njih ne preoptereti ostale.',
  },
  {
    id: 'failover',
    term: 'Failover',
    hr: 'preuzimanje rada',
    definition: 'Kad komponenta padne, njezin posao preuzme rezervna. Nije trenutačno: kvar prvo treba otkriti.',
  },
  {
    id: 'bottleneck',
    term: 'Bottleneck',
    hr: 'usko grlo',
    definition: 'Dio sustava koji prvi dođe do svoje granice i time ograniči cijeli sustav, npr. jedna baza ispred koje stoji deset poslužitelja aplikacije.',
    menza: 'jedan štednjak za sve kuhare',
  },
  {
    id: 'partial-failure',
    term: 'Partial failure',
    hr: 'djelomični kvar',
    definition: 'Dio raspodijeljenog sustava ne radi (ili radi sporo), a ostatak radi dalje. Na jednom računalu sve obično stane odjednom; u raspodijeljenom sustavu treba otkriti što je palo.',
  },
  {
    id: 'timeout',
    term: 'Timeout',
    hr: 'timeout (rok čekanja)',
    definition: 'Najdulje vrijeme koje pošiljatelj čeka odgovor prije nego što odustane. Prekratak timeout spori, ali živi poslužitelj proglasi mrtvim, a zbog predugog korisnici dugo čekaju.',
  },
  {
    id: 'rtt',
    term: 'RTT (round-trip time)',
    hr: 'vrijeme povratnog puta',
    definition: 'Vrijeme da poruka stigne do odredišta i odgovor se vrati. Svjetlost u optičkom vlaknu prijeđe oko 200 km u milisekundi, pa svakih 100 km udaljenosti dodaje barem 1 ms RTT-u.',
  },
  {
    id: 'network-partition',
    term: 'Network partition',
    hr: 'mrežna particija',
    definition: 'Prekid mreže zbog kojeg se dijelovi sustava ne čuju, iako svi rade. Svaka strana misli da je druga mrtva.',
  },
]

export default glossary
