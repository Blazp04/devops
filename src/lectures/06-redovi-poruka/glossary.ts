import type { GlossaryEntry } from '../../curriculum/types'

/** Terms introduced in lecture 06 (redovi poruka). Course-wide entries with the same id take precedence. */
const glossary: GlossaryEntry[] = [
  {
    id: 'message-broker',
    term: 'Message broker',
    hr: 'posrednik poruka',
    definition: 'Poslužitelj koji prima poruke od proizvođača, čuva ih u redovima i predaje potrošačima, npr. RabbitMQ, Amazon SQS ili Kafka.',
    lecture: '06',
    menza: 'kuhinjska šina s listićima',
  },
  {
    id: 'exchange',
    term: 'Exchange',
    hr: 'razdjelnik (exchange)',
    definition: 'U RabbitMQ-u proizvođač ne piše izravno u red, nego na exchange, a on poruku proslijedi u jedan ili više povezanih redova (fanout: u svaki). Dead-letter exchange prima odbačene poruke.',
    lecture: '06',
    menza: 'pult koji listić stavi na jednu ili više šina',
  },
  {
    id: 'producer-consumer',
    term: 'Producer / consumer',
    hr: 'proizvođač / potrošač',
    definition: 'Proizvođač objavi poruku i nastavi dalje; potrošač je kasnije preuzme i obradi. Ne moraju raditi u isto vrijeme ni istom brzinom.',
    lecture: '06',
    menza: 'konobar zakači listić, kuhar ga skine',
  },
  {
    id: 'acknowledgement',
    term: 'Acknowledgement (ack)',
    hr: 'potvrda (ack)',
    definition: 'Poruka potrošača posredniku da je poruku obradio, pa je posrednik smije obrisati. Dok potvrda ne stigne, poruka je „nepotvrđena” i može se isporučiti ponovno.',
    lecture: '06',
  },
  {
    id: 'at-most-once-delivery',
    term: 'At-most-once delivery',
    hr: 'isporuka najviše jednom',
    definition: 'Poruka se nikad ne obrađuje dvaput, ali se može izgubiti – npr. kad se potvrđuje već pri isporuci, a potrošač padne prije obrade.',
    lecture: '06',
  },
  {
    id: 'visibility-timeout',
    term: 'Visibility timeout',
    hr: 'rok vidljivosti (SQS)',
    definition: 'U Amazon SQS-u primljena poruka je nevidljiva ostalim potrošačima dok rok ne istekne (zadano 30 s). Ako je potrošač do tada ne obriše, poruka se ponovno pojavljuje u redu – i kad je potrošač pao i kad je samo spor.',
    lecture: '06',
  },
  {
    id: 'exponential-backoff',
    term: 'Exponential backoff with jitter',
    hr: 'sve dulji, nasumično raspršen razmak',
    definition: 'Pravilo za ponovne pokušaje: prije n-tog pokušaja čeka se nasumično vrijeme između 0 i min(strop, osnovica · 2ⁿ). Razmak raste, a nasumičnost sprječava da svi klijenti pokušaju u istom trenutku.',
    lecture: '06',
  },
  {
    id: 'poison-message',
    term: 'Poison message',
    hr: 'otrovna poruka',
    definition: 'Poruka čija obrada nikad ne uspije (npr. neispravan sadržaj). Bez ograničenja isporuka vraća se zauvijek i troši potrošače; zato je nakon nekoliko pokušaja premještamo u red neobrađenih poruka.',
    lecture: '06',
  },
  {
    id: 'competing-consumers',
    term: 'Competing consumers',
    hr: 'potrošači koji se natječu (radni red)',
    definition: 'Više potrošača čita isti red, a svaku poruku dobiva samo jedan od njih. Tako se posao dijeli; s više potrošača redoslijed obrade više nije zajamčen.',
    lecture: '06',
  },
  {
    id: 'publish-subscribe',
    term: 'Publish/subscribe',
    hr: 'objavi-pretplati (pub/sub)',
    definition: 'Proizvođač objavi događaj, a svaki pretplatnik dobije vlastitu kopiju (u RabbitMQ-u: fanout exchange i red po pretplatniku). Proizvođač ne mora znati tko su pretplatnici.',
    lecture: '06',
  },
  {
    id: 'transactional-outbox',
    term: 'Transactional outbox',
    hr: 'transakcijski outbox',
    definition: 'Uzorak u kojem se poruka za van (npr. SMS ili događaj) upisuje u tablicu baze u istoj transakciji kao i promjena podataka, a zaseban proces je kasnije šalje. Tako se ne može dogoditi da je podatak spremljen, a poruka zauvijek izgubljena.',
    lecture: '06',
  },
  {
    id: 'consumer-lag',
    term: 'Consumer lag',
    hr: 'zaostatak potrošača (lag)',
    definition: 'U logu poput Kafke: koliko zapisa grupa potrošača još nije obradila, tj. kraj particije minus spremljeni pomak.',
    lecture: '06',
  },
]

export default glossary
