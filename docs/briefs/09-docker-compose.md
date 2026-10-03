# Lecture 09 — Docker Compose: cijela Klopa na jednom računalu
_Mreže, imena servisa, volumeni i provjere ispravnosti – i zašto jedno računalo i dalje nije dovoljno._ · ~35 min · module m2 · prerequisites: 08, 06
Folder: `src/lectures/09-docker-compose/` · URL: `/predavanje/docker-compose`
Engines: none (small local seeded models / steppers)

## Continuity
- Previous lecture (08 Docker: od Dockerfilea do kontejnera) ends with: Slike su gotove. Ali u README-u sada stoji šest naredbi `docker run` s po tri retka zastavica. Iva ih pokrene krivim redoslijedom, a API traži bazu na `localhost:5432` i ne nalazi je.
- Next lecture (10 Zašto Kubernetes: željeno stanje i petlja usklađivanja) opens with: 03:00. Poslužitelj-2 je umro, a s njim devet kontejnera. Davor u pidžami mora zapamtiti što je gdje radilo, pronaći slobodno mjesto i sve pokrenuti ručno, a u 11:45 opet ručno dodaje kopije API-ja za ručak. Što ako bismo samo zapisali što želimo – „devet kopija API-ja, uvijek” – a netko drugi neprestano pazio da tako i bude?

## Hook (incident)
Iva je pokrenula Postgres i API u dva kontejnera, ali API javlja da baze na `localhost:5432` nema. Kad ih napokon spoji, nakon `docker rm` baze narudžbe nestanu. Šest naredbi koje nitko ne pamti nije način rada. Kako cijelu Klopu opisati jednom datotekom?

## Objectives (rendered by the page hero)
- opisati višekontejnersku aplikaciju jednom datotekom compose.yaml
- objasniti zašto se servisi na korisnički definiranoj mreži nalaze po imenu i zašto localhost u kontejneru nije vaše računalo
- predvidjeti što preživljava docker compose down i down -v uz imenovane i anonimne volumene te bind mountove
- razlikovati pokretanje i spremnost servisa (depends_on s provjerom ispravnosti)
- objasniti zašto pravila ponovnog pokretanja ne štite od pada cijelog računala

## Scenes
### 1. Šest naredbi ili jedna datoteka (animation)
- Concept: docker run lines collapse into compose.yaml – the first taste of describing what you want.
- Visual: Commands fold into YAML.
### 2. Tko je localhost? (animation)
- Concept: Inside the api container localhost is the api itself (own network namespace).
- Visual: Packet loops inside the api container.
### 3. Imena servisa kao DNS (interactive)
- Concept: User-defined network with embedded DNS resolves db:5432; the default bridge network has no name DNS.
- Visual: Networks as coloured regions; drag db out → 'could not resolve'.
### 4. Vrata i podatci (interactive)
- Concept: ports: web '8080:8080' (unprivileged nginx, proxies /api to api:8000 by name); api needs no published port ('8000:8000' only for debugging); two containers may both use the same port inside, not the same host port. Named volume vs anonymous volume vs bind mount vs tmpfs: the postgres image declares VOLUME, so without a named volume Docker creates an anonymous one – rows survive a restart, but docker rm db or down + up attaches a fresh anonymous volume, so orders appear lost (old volume left dangling until docker volume prune). postgres:18+ keeps data under /var/lib/postgresql (PGDATA /var/lib/postgresql/18/docker); mounting a volume at the old /var/lib/postgresql/data path from older tutorials makes postgres:18+ refuse to start (log: „Error: in 18+, these Docker images are configured … /var/lib/postgresql/data (unused mount/volume)”, exit 1) unless a database already exists in the image's anonymous VOLUME. down keeps named volumes, down -v deletes them.
- Visual: Host wall doors; volume cylinders incl. a grey dangling anonymous one.
### 5. Pokrenut nije isto što i spreman (animation)
- Concept: depends_on orders start only; condition: service_healthy with a pg_isready healthcheck (provjera ispravnosti) waits for readiness; restart: unless-stopped heals crashes on this host only.
- Visual: DB health light; api waits; crashed container restarts.
### 6. 12:05: računalo je palo (animation)
- Concept: Host dies → all of Klopa down; Davor's list: more machines, automatic placement, replacement elsewhere, gradual updates, stable addresses.
- Visual: Host goes dark; checklist appears.

## Flagship simulation: Compose slagalica
A canvas of one host with web, api, worker, postgres, redis and rabbitmq; networks as regions, volumes as cylinders, published ports as doors; live compose.yaml with two-way highlight; a test browser on localhost:8080. Zadaci: „Klopa se otvara u pregledniku”, „API pronalazi bazu po imenu”, „Narudžbe preživljavaju down i docker rm db”, „Pokušajte preživjeti pad računala” (marked solved once the student presses „Ugasi računalo” and opens the explanation – no task ever stays unsolvable).

Controls:
- Povlačenje servisa između mreža
- Uređivanje ports po servisu
- Spajanje imenovanog volumena / bind mounta / tmpfs (bez odabira = anonimni volumen)
- Prekidač „depends_on: service_healthy”
- Gumbi „compose up”, „compose down”, „compose down -v”, „docker rm db”
- Gumbi za kvar: „Sruši kontejner”, „Ugasi računalo”

Model (exact rules):
Deterministic state machine. up: create project network (user-defined bridge, embedded DNS) → named volumes → containers in depends_on order; with service_healthy a dependent waits for the dependency's healthcheck (Postgres healthy after 5 s sim); without it api starts early, fails its first DB connect and restarts if a restart policy is set. Name resolution only between services sharing a user-defined network. Host browser reaches only published ports; container localhost = itself; app bound to 127.0.0.1 inside → connection reset through the published port. Duplicate host port → 'port is already allocated'. Postgres rows: named volume mounted at /var/lib/postgresql (postgres:18+) → survive down; named volume at the old /var/lib/postgresql/data path → postgres:18+ refuses to start („Error: in 18+ … /var/lib/postgresql/data (unused mount/volume)”, exit 1) unless the image's anonymous VOLUME already holds a database; no named volume → anonymous volume: survives container restart, but docker rm db or down+up gets a fresh anonymous volume (rows 'lost', old volume dangling); down removes containers and network, keeps named volumes; down -v removes named and anonymous volumes. restart: unless-stopped → crashed container restarts with backoff; 'Ugasi računalo' → everything stops, nothing moves elsewhere.

Break it: Moving db to another network breaks name resolution; two services on host 8080 fail; docker rm db without a named volume loses all orders (they sit in a dangling anonymous volume); „Ugasi računalo” takes all of Klopa down and no restart policy helps.

Insight: Compose already teaches declarative YAML and DNS by service name – what's missing is more than one machine and someone who keeps watch.

## Code artifacts
- compose.yaml za cijelu Klopu (yaml): No version key, healthchecks, named volume at /var/lib/postgresql (postgres:18+), env_file, pinned tags (verify when authoring)
- docker compose up -d, ps, logs -f api, docker volume ls (bash): Day-to-day commands; spot dangling anonymous volumes

## Misconceptions (Croatian myth + English correction)
- „Kontejneri razgovaraju preko IP adresa koje moram potražiti” — on a user-defined network services resolve each other by name.
- „localhost u kontejneru je moje računalo” — each container has its own network namespace; localhost is the container itself.
- „depends_on čeka da baza bude spremna” — only with condition: service_healthy and a healthcheck.
- „Bez volumena podatci baze žive u kontejneru” — the postgres image's VOLUME creates an anonymous volume, which a recreated container doesn't reuse.
- „Treba docker-compose i version: '3.8'” — v1 has been dead since July 2023; use docker compose; the version key is ignored.
- „restart: always znači visoku dostupnost” — it restarts containers on the same host only; a dead host moves nothing.

## Key facts (verified; date-sensitive ones belong in fact callouts)
- [tech-facts] Compose v1 (docker-compose, Python) stopped receiving updates in July 2023; v2+ is the docker compose plugin; v5.0.0 (2025-12-02) adds a Go SDK, versions 3 and 4 were skipped; the top-level version key is ignored; current v5.5.1 (as of 2026-10).
- [explainers] The default bridge network has no name-based DNS; user-defined networks (which Compose creates) do.
- [tech-facts] postgres:18+ image: PGDATA /var/lib/postgresql/18/docker, VOLUME /var/lib/postgresql; older images used /var/lib/postgresql/data. A mount at that old path makes 18+ refuse to start (docker-entrypoint.sh check, exit 1) instead of silently writing elsewhere.

## Analogies (always with where they break down)
- Recept za cijeli ručak umjesto pojedinačnih uputa. Breaks down: the recipe still uses one kitchen – if it burns, nothing is cooked.

## Glossary terms introduced
Volume, Docker Compose

## Bridge to next (CostNote)
Klopa sada radi na tri računala, a Davor ručno odlučuje koji kontejner ide kamo. U 03:00 poslužitelj-2 umre s devet kontejnera na sebi, a Davorov mobitel zvoni.
