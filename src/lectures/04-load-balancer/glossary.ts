import type { GlossaryEntry } from '../../curriculum/types'

/**
 * Terms introduced in lecture 04 (load balancer) that the course glossary does not have yet.
 * Course-wide entries with the same id take precedence (load-balancer, round-robin, least-connections,
 * l4-and-l7-load-balancing live in src/curriculum/data.ts).
 */
const glossary: GlossaryEntry[] = [
  {
    id: 'weighted-round-robin',
    term: 'Weighted round robin',
    hr: 'težinsko kružno raspoređivanje',
    definition:
      'Kružno raspoređivanje s težinama: poslužitelj s težinom 4 dobiva četiri puta više zahtjeva od onoga s težinom 1. Težine zadajemo unaprijed i one se same ne mijenjaju kad se poslužitelj uspori.',
    menza: 'redar zna da je jedan pult četiri puta brži',
  },
  {
    id: 'power-of-two-choices',
    term: 'Power of two choices',
    hr: 'dva nasumična izbora',
    definition:
      'Algoritam raspodjele: load balancer nasumično izvuče dva poslužitelja i zahtjev pošalje manje zauzetom. Gotovo jednako dobar kao „najmanje veza”, a radi i kad više load balancera dijeli iste poslužitelje (NGINX random two, Envoy LEAST_REQUEST).',
  },
  {
    id: 'worker',
    term: 'Worker',
    hr: 'radnik',
    definition:
      'Proces ili dretva poslužitelja koja obrađuje jedan zahtjev od početka do kraja (npr. sinkroni radnik gunicorna). Svaki radnik drži dio RAM-a, pa količina RAM-a određuje koliko radnika – i istodobnih zahtjeva – stane.',
    menza: 'tanjur na pultu',
  },
  {
    id: 'vcpu',
    term: 'vCPU',
    hr: 'vCPU (virtualni procesor)',
    definition:
      'Procesorska jezgra koju virtualni poslužitelj dobiva od pružatelja usluge u oblaku (često jedna hardverska dretva fizičke jezgre). Jedan zahtjev u jednom trenutku računa na najviše jednoj jezgri.',
    menza: 'jedan mozak na kartici poslužitelja',
  },
  {
    id: 'bottleneck',
    term: 'Bottleneck',
    hr: 'usko grlo',
    definition:
      'Resurs koji prvi ostane bez slobodnog kapaciteta i tako određuje propusnost cijelog sustava – npr. procesorske jezgre kod računanja ili broj radnika u RAM-u kod zahtjeva koji dugo čekaju bazu.',
  },
  {
    id: 'ttl',
    term: 'TTL (time to live)',
    hr: 'TTL (rok trajanja zapisa)',
    definition:
      'Koliko dugo smije razrješivač, operacijski sustav ili preglednik pamtiti DNS odgovor. Dok TTL ne istekne, promjena zapisa (npr. brisanje adrese palog poslužitelja) ne stiže do klijenta; neki klijenti pamte i dulje.',
  },
  {
    id: 'keep-alive',
    term: 'Keep-alive (persistent connection)',
    hr: 'trajna veza',
    definition:
      'HTTP veza koja ostaje otvorena za više uzastopnih zahtjeva. HTTP/2 i gRPC jednom vezom šalju mnogo zahtjeva istodobno – zato ih L4 load balancer sve šalje istom poslužitelju.',
  },
  {
    id: 'tls-termination',
    term: 'TLS termination',
    hr: 'terminacija TLS-a',
    definition: 'Load balancer dešifrira HTTPS promet (ima certifikat i privatni ključ), pročita zahtjev i proslijedi ga poslužitelju – nešifrirano ili ponovno šifrirano.',
  },
  {
    id: 'http-5xx',
    term: 'HTTP 502 / 503 / 504',
    hr: 'greške 502, 503 i 504',
    definition:
      '502 Bad Gateway: load balancer nije dobio valjan odgovor (npr. proces poslužitelja je pao). 503 Service Unavailable: nema slobodnog kapaciteta (pun red) ili nijednog ispravnog poslužitelja. 504 Gateway Timeout: odgovor nije stigao na vrijeme.',
    menza: 'pladanj na podu s crvenim ✗',
  },
]

export default glossary
