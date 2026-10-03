import type { GlossaryEntry } from '../../curriculum/types'

/** Terms introduced in lecture 09 (Docker Compose) that the course glossary does not have. Course entries win on id conflicts. */
const glossary: GlossaryEntry[] = [
  {
    id: 'compose-service',
    term: 'Service (Compose)',
    hr: 'servis (u Composeu)',
    definition: 'Jedan dio aplikacije u datoteci compose.yaml (web, api, db…): koja slika, koji portovi, mreže i volumeni. Iz servisa Compose stvara kontejner, a ime servisa postaje DNS ime na mreži projekta.',
    lecture: '09',
    menza: 'jedno jelo u receptu za ručak',
  },
  {
    id: 'user-defined-network',
    term: 'User-defined network',
    hr: 'korisnički definirana mreža',
    definition: 'Mreža koju stvorite sami (docker network create) ili koju Compose stvori za projekt (klopa_default). Na njoj ugrađeni DNS na 127.0.0.11 pretvara imena servisa u IP adrese; zadana mreža bridge to ne radi.',
    lecture: '09',
  },
  {
    id: 'named-volume',
    term: 'Named volume',
    hr: 'imenovani volumen',
    definition: 'Volumen s imenom (npr. pgdata) kojim upravlja Docker. Preživi brisanje kontejnera i docker compose down; briše ga tek docker compose down -v ili docker volume rm.',
    lecture: '09',
    menza: 'hladnjak s natpisom',
  },
  {
    id: 'anonymous-volume',
    term: 'Anonymous volume',
    hr: 'anonimni volumen',
    definition: 'Volumen bez imena koji Docker stvori sam kad slika ima naredbu VOLUME, a vi ništa ne spojite na tu putanju. Kontejner stvoren nakon docker rm ili docker compose down dobije novi, prazan anonimni volumen (kad Compose kontejner samo ponovno stvori, preda mu stari); stari ostaje „viseći” dok ga ne obrišete (docker volume prune).',
    lecture: '09',
    menza: 'hladnjak bez natpisa',
  },
  {
    id: 'bind-mount',
    term: 'Bind mount',
    hr: 'bind mount',
    definition: 'Mapa s računala (npr. ./pgdata) spojena u kontejner. Docker njome ne upravlja: ostaje i nakon docker compose down -v. Zgodno za razvoj (izmjena koda odmah se vidi), opasnije za bazu jer ovisi o mapi i ovlastima na računalu.',
    lecture: '09',
  },
  {
    id: 'tmpfs',
    term: 'tmpfs mount',
    hr: 'tmpfs',
    definition: 'Datotečni sustav u radnoj memoriji računala. Brz, ali prazan svaki put kad se kontejner zaustavi ili ponovno pokrene – za privremene datoteke, nikad za podatke baze.',
    lecture: '09',
  },
  {
    id: 'compose-healthcheck',
    term: 'Healthcheck (Compose)',
    hr: 'provjera ispravnosti (Compose healthcheck)',
    definition: 'Naredba koju Docker periodički pokreće unutar kontejnera (za Postgres pg_isready). Stanja: starting dok se servis pokreće, healthy nakon uspjeha, unhealthy nakon više neuspjeha zaredom. Uz depends_on s condition: service_healthy Compose čeka stanje healthy.',
    lecture: '09',
  },
  {
    id: 'restart-policy',
    term: 'Restart policy',
    hr: 'pravilo ponovnog pokretanja',
    definition: 'Postavka restart određuje hoće li Docker ponovno pokrenuti kontejner kad mu proces završi: no (nikad), on-failure (samo nakon greške), always i unless-stopped (uvijek; unless-stopped ne ako ste ga sami zaustavili), s rastućom stankom između pokušaja. Radi samo na istom računalu – ako računalo padne, nitko ne pokreće kontejner drugdje.',
    lecture: '09',
  },
]

export default glossary
