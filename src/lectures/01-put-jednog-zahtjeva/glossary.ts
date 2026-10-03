import type { GlossaryEntry } from '../../curriculum/types'

/** Terms introduced in lecture 01 (put jednog zahtjeva). Course-wide entries with the same id take precedence. */
const glossary: GlossaryEntry[] = [
  {
    id: 'ip-address',
    term: 'IP address',
    hr: 'IP adresa',
    definition: 'Broj računala na mreži, npr. 203.0.113.10. Paketi se šalju na IP adresu, a ne na ime; ime u adresu prevodi DNS.',
    menza: 'adresa zgrade',
  },
  {
    id: 'port',
    term: 'Port',
    hr: 'port',
    definition: 'Broj od 1 do 65535 koji uz IP adresu određuje kojem procesu na računalu paket ide. Zadano: 80 za http, 443 za https. Na jednoj IP adresi i portu po zadanom sluša jedan proces.',
    menza: 'vrata stana u zgradi',
  },
  {
    id: 'localhost',
    term: 'localhost (loopback)',
    hr: 'localhost, 127.0.0.1',
    definition: 'Ime i adresa koji uvijek znače „ovo računalo”. Zahtjev na localhost ne izlazi na mrežu – zato Lanin localhost nije i Petrin.',
  },
  {
    id: 'bind-address',
    term: 'Bind address',
    hr: 'adresa na kojoj proces sluša',
    definition: 'IP adresa i port na kojima proces čeka veze. 127.0.0.1 znači samo s istog računala, a 0.0.0.0 (ili ::) sve adrese tog računala. gunicorn i Django runserver zadano slušaju na 127.0.0.1:8000.',
  },
  {
    id: 'dns-resolver',
    term: 'DNS resolver',
    hr: 'DNS razrješivač',
    definition: 'Poslužitelj koji za klijenta pronalazi IP adresu imena: pita autoritativne DNS poslužitelje i odgovor pamti onoliko koliko kaže TTL.',
    menza: 'imenik',
  },
  {
    id: 'ttl',
    term: 'TTL (DNS)',
    hr: 'TTL (rok trajanja odgovora)',
    definition: 'Koliko sekundi razrješivači i klijenti smiju pamtiti DNS odgovor. Dok ne istekne, promjena zapisa ne stiže do svih.',
  },
  {
    id: 'nxdomain',
    term: 'NXDOMAIN',
    hr: 'NXDOMAIN (ime ne postoji)',
    definition: 'DNS odgovor „takvo ime ne postoji”. Preglednik tada ne zna kamo poslati paket, pa se nijedna veza ne otvara.',
  },
  {
    id: 'tcp',
    term: 'TCP',
    hr: 'TCP veza',
    definition: 'Pouzdana veza između dvaju procesa (IP adresa + port na svakoj strani). Otvara se rukovanjem SYN → SYN-ACK → ACK, što traje jedno povratno putovanje.',
  },
  {
    id: 'tls',
    term: 'TLS',
    hr: 'TLS (šifrirani kanal)',
    definition: 'Protokol koji šifrira vezu i certifikatom dokazuje da je poslužitelj stvarno klopa.example. To je „s” u https. TLS 1.3 za uspostavu treba jedno povratno putovanje.',
  },
  {
    id: 'http-status',
    term: 'HTTP status code',
    hr: 'statusni kod',
    definition: 'Troznamenkasti broj na početku HTTP odgovora: 2xx uspjeh, 3xx preusmjeravanje, 4xx greška klijenta (404), 5xx greška poslužitelja (502, 503, 504).',
  },
  {
    id: 'rtt',
    term: 'Round-trip time (RTT)',
    hr: 'povratno putovanje (RTT)',
    definition: 'Vrijeme da paket stigne do odredišta i odgovor se vrati. Svjetlost u optičkom vlaknu prijeđe oko 200 000 km u sekundi, pa svakih 100 km udaljenosti dodaje najmanje 1 ms.',
  },
  {
    id: 'connection-refused',
    term: 'Connection refused',
    hr: 'odbijena veza',
    definition: 'Paket je stigao do računala, ali na tom portu nitko ne sluša, pa operacijski sustav odmah vrati RST. Stiže brzo – nakon jednog povratnog putovanja.',
  },
  {
    id: 'timeout',
    term: 'Timeout',
    hr: 'istek vremena',
    definition: 'Klijent je čekao odgovor i odustao. Znači da paketu nitko nije odgovorio: vatrozid ga je tiho odbacio, adresa je kriva ili nedostupna.',
  },
  {
    id: 'firewall',
    term: 'Firewall',
    hr: 'vatrozid',
    definition: 'Pravila koja propuštaju ili odbacuju pakete prema portu i adresi. DROP paket tiho baca (klijent čeka do isteka vremena), REJECT odmah odgovara odbijanjem.',
  },
  {
    id: 'private-address',
    term: 'Private address, NAT',
    hr: 'privatna adresa, NAT',
    definition: 'Adrese 10.x, 172.16–31.x i 192.168.x vrijede samo u lokalnoj mreži. Kućni usmjerivač preko NAT-a pušta veze prema van, ali izvana nitko ne može izravno doći do privatne adrese. NAT (prevođenje adresa) zamjenjuje privatnu adresu javnom adresom usmjerivača.',
    menza: 'broj sobe u studentskom domu',
  },
  {
    id: 'reverse-proxy',
    term: 'Reverse proxy',
    hr: 'posrednički poslužitelj (proxy)',
    definition: 'Poslužitelj (npr. Caddy ili nginx) koji prima zahtjeve klijenata, obično na portu 443 s TLS-om, i prosljeđuje ih aplikaciji iza sebe. Kad se ne može spojiti na aplikaciju (npr. aplikacija ne radi), sam vraća 502 Bad Gateway.',
  },
  {
    id: 'vps',
    term: 'VPS',
    hr: 'VPS (iznajmljeni virtualni poslužitelj)',
    definition: 'Virtualni poslužitelj koji iznajmljujemo kod pružatelja usluge: ima zadan broj procesorskih jezgri, RAM i javnu IP adresu.',
  },
]

export default glossary
