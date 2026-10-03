# Lecture 08 — Docker: od Dockerfilea do kontejnera
_Kontejnerizacija, slike kontejnera, slojevi i predmemorija izgradnje, registar te tagovi koji se pomiču._ · ~40 min · module m2 · prerequisites: 07, 01
Folder: `src/lectures/08-docker/` · URL: `/predavanje/docker`
Engines: E4 → src/engines/build/

## Continuity
- Previous lecture (07 Virtualni stroj i kontejner) ends with: Sad znamo da je kontejner proces s naočalama i pojasom. Ali kako Klopu – kod, Python, Node za izgradnju weba i sistemske biblioteke – zapakirati tako da se na Ivinom laptopu i na poslužitelju pokrene potpuno isto?
- Next lecture (09 Docker Compose: cijela Klopa na jednom računalu) opens with: Iva je pokrenula Postgres i API u dva kontejnera, ali API javlja da baze na `localhost:5432` nema. Kad ih napokon spoji, nakon `docker rm` baze narudžbe nestanu. Šest naredbi koje nitko ne pamti nije način rada. Kako cijelu Klopu opisati jednom datotekom?

## Hook (incident)
Iva je napisala prvi Dockerfile za Klopu, u korijenu repozitorija. Nakon promjene jednog retka koda izgradnja traje 44 s, slika ima 1,7 GB, a Davor je u njoj pronašao datoteku `.env` s ključem za SMS-gateway. Uz to, `latest` na poslužitelju nije isti `latest` kao na Ivinom laptopu. Kako se slika zapravo gradi?

## Objectives (rendered by the page hero)
- objasniti što znači kontejnerizirati (dockerizirati) aplikaciju i koji problem „kod mene radi” time rješavamo
- razlikovati sliku kontejnera i kontejner kao klasu i objekt
- objasniti kako naredbe u Dockerfileu stvaraju slojeve i kako predmemorija izgradnje odlučuje što se ponovno gradi
- napisati višefazni Dockerfile s dobrim redoslijedom naredbi i bez tajni u slojevima
- objasniti razliku između taga i digesta te zašto latest nije verzija
- pokrenuti kontejner s preslikanim portom, objasniti zašto zapisi u njemu nestaju i znati da Kubernetes pokreće iste OCI slike bez Dockera

## Scenes
### 1. Slika i kontejner (animation)
- Concept: Dockerizacija = Dockerfile → izgradnja slike → pokretanje; isti artefakt na laptopu i poslužitelju. One image, many containers, each with a thin writable layer; layers stacked like transparent sheets (copy-up, whiteout).
- Visual: Dockerfile → image → three containers fan-out; acetate sheets.
### 2. Laboratorij predmemorije izgradnje (simulation)
- Concept: Flagship: cache check from the base upwards; the first changed layer and everything after it rebuild; order = speed decision.
- Visual: See flagship.
### 3. Tajna u sloju (interactive)
- Concept: COPY .env then RUN rm .env leaves it in the lower layer; never ENV/ARG for secrets; .dockerignore keeps it out of the context. Correct mechanism for build-time secrets: BuildKit secret mounts (RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci) – never written to a layer; runtime secrets arrive as env or files when the container starts (L16). Multi-stage leaves build tools behind.
- Visual: Layer inspector search finds the key; secret-mount variant shows nothing; two-stage stack shrinks.
### 4. Registar, tag i digest (animation)
- Concept: Push uploads only missing layers; a tag is a movable sticky note, a digest is immutable; with tag@digest the digest wins.
- Visual: Sticky note latest moves from sha256:a1… to sha256:9f…; two servers run different code.
### 5. Vrata u zidu (interactive)
- Concept: docker run -p 8080:8000 klopa-api; the app must listen on 0.0.0.0 inside – gunicorn's default 127.0.0.1 makes the published port answer with a reset (callback L01); EXPOSE doesn't publish; docker rm loses the writable layer.
- Visual: Host wall with a door; writable layer vanishing.
### 6. Ispod haube (text)
- Concept: Closed DeepDive (L11 repeats the Kubernetes side): CLI → REST → dockerd → containerd → runc; OCI image/runtime/distribution specs; Kubernetes talks to containerd/CRI-O directly and runs Docker-built OCI images.
- Visual: Stepper through the stack with an OCI badge inside the DeepDive.

## Flagship simulation: Laboratorij predmemorije izgradnje
E4 on klopa-web (TypeScript, npm, Vite): Dockerfile as draggable cards; the build animates a layer stack with CACHED/REBUILT, size, short digest and a stopwatch; then push and tag panels. A second tab shows the klopa-api Dockerfile (pip). Zadaci: „Ponovna izgradnja nakon promjene koda < 5 s”, „Slika < 200 MB”, „Pronađite ključ u slici”, „Slika radi kao korisnik koji nije root”.

Controls:
- Povlačenje kartica: FROM node (build), WORKDIR, COPY package*.json, RUN npm ci, COPY . ., RUN npm run build, FROM nginx-unprivileged (runtime), COPY --from=build, USER, CMD
- Gumbi „Promijeni kod”, „Promijeni ovisnosti”, „Izgradi”
- Prekidači „.dockerignore” i „Višefazna izgradnja”
- Gumb za kvar „Kopiraj .env pa ga obriši”
- Gumbi „Pošalji u registar” i „Pomakni latest na novu sliku”

Model (exact rules):
Deterministic. A layer is CACHED iff its instruction and inputs are unchanged (COPY: hash of matching build-context files; RUN: parent layer + command) AND every preceding instruction (all layers beneath it in the stack) is CACHED. 'Promijeni kod' changes src (affects COPY . .); 'Promijeni ovisnosti' changes package files (COPY package*.json and COPY . .). Illustrative timings (labelled): base pull 8 s first time, npm ci 40 s, npm run build 3 s (Vite), COPY ~1 s; sizes: full node base ~1,1 GB vs slim ~250 MB, node_modules 180 MB, dev deps 120 MB, nginx-unprivileged runtime + dist ~50 MB. .dockerignore off → context includes node_modules, .git and the repo-root .env (+400 MB, COPY . . invalidated by any git change). Multi-stage → final = nginx runtime + dist only (unprivileged image listens on 8080 as a non-root user). .env trick → lower layer contains the file, whiteout above; inspector and image history reveal it. Registry stores layer digests; push uploads only missing ('Layer already exists'). Tag map tag → digest; re-pointing latest makes two nodes report different digests. Expected: COPY . . before npm ci → code edit ≈44 s; correct order ≈4 s (COPY 1 s + build 3 s). klopa-api tab: python slim base, COPY requirements.txt → pip install (≈30 s, illustrative) → COPY . . → USER → gunicorn --bind 0.0.0.0:8000; correct order rebuild ≈1 s.

Break it: COPY . . before RUN npm ci re-runs the 40 s install on every code edit; „Kopiraj .env pa ga obriši” leaves the key findable; moving latest leaves two servers running different code under one name.

Insight: Order instructions from least to most frequently changing; layers are immutable, so a deleted file is only hidden; a tag is a label, a digest is the identity.

## Code artifacts
- Dockerfile za klopa-web: loš redoslijed i dobar višefazni (dockerfile): Pinned Node LTS build stage + pinned nginx-unprivileged runtime (verify tags when authoring), npm ci, non-root
- Dockerfile za klopa-api (dockerfile): Pinned python slim base, pip install --no-cache-dir, USER, gunicorn --bind 0.0.0.0:8000
- BuildKit secret mount (dockerfile): RUN --mount=type=secret … npm ci and docker build --secret
- .dockerignore (text): Keep node_modules, .git and .env out of the context
- docker build, run -p, image history, push, inspect (bash): Tag klopa-api:1.3.2, read RepoDigests
- docker buildx --platform linux/amd64,linux/arm64 (bash): Closed: multi-arch

## Misconceptions (Croatian myth + English correction)
- „Slika i kontejner su isto” — immutable template (class) vs running instance with its own writable layer (object).
- „Promjene u pokrenutom kontejneru se spremaju” — the writable layer is deleted with the container; data needs a volume, code needs a rebuild.
- „RUN rm briše tajnu iz slike” — the file stays in the lower layer; the new layer only hides it.
- „latest je fiksna, najnovija verzija” — a movable tag that can point to different digests on different machines.
- „EXPOSE objavljuje port” — documentation only; publishing needs -p / ports.
- „Kubernetes pokreće Docker” — dockershim removed in 1.24; containerd/CRI-O run the same OCI images.
- „Za BuildKit treba DOCKER_BUILDKIT=1” — default since Engine 23.0.

## Key facts (verified; date-sensitive ones belong in fact callouts)
- [tech-facts] Docker Engine 29.0.0 (2025-11-10) makes the containerd image store default for fresh installs; current 29.8.2 (as of 2026-10).
- [tech-facts] BuildKit default since Engine 23.0 (2023-02-01); secret mounts keep build secrets out of layers.
- [tech-facts] Docker Hub pulls per 6 h: 100 unauthenticated (per IPv4 or IPv6 /64), 200 Personal (as of 2026).
- [tech-facts] Bitnami images were copied to docker.io/bitnamilegacy from 2025-08-28 (with brownouts); the free docker.io/bitnami catalogue was removed on 2025-09-29; Docker Hardened Images free (Apache-2.0) since 2025-12-17.
- [tech-facts] OCI specs (runtime, image, distribution); Docker donated runc.
- [tech-facts] Image ref registry/name:tag@digest – only the digest is used if both are given.
- [conflict] Docker Desktop licensing: tech-facts lists education as free, pedagogy research found a Dec 2024 change limiting free educational use to enrolled students – show a „provjerite za svoju ustanovu” callout and offer Podman Desktop, Rancher Desktop or Docker Engine on Linux (Podman is daemonless, CNCF Sandbox since 2025-01-21).

## Analogies (always with where they break down)
- Klasa i objekt (slika i kontejner). Breaks down: images are layered and immutable; container state is discarded on removal.
- Slojevi kao git commitovi. Breaks down: layers can't be edited; a secret in one layer stays even if deleted in the next.
- Brodski kontejner (standardizacija). Breaks down: 'runs anywhere' fails across CPU architectures and kernels; a steel box is a security boundary, a software container is a restricted process.

## Glossary terms introduced
Containerization, Container image, Registry, Tag, Digest, Container runtime

## Bridge to next (CostNote)
Slike su gotove. Ali u README-u sada stoji šest naredbi `docker run` s po tri retka zastavica. Iva ih pokrene krivim redoslijedom, a API traži bazu na `localhost:5432` i ne nalazi je.
