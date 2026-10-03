# Lecture 01 — Put jednog zahtjeva
_Što se dogodi između upisane adrese i prikazane stranice – i zašto localhost nije adresa za druge._ · ~30 min · module m1 · prerequisites: —
Folder: `src/lectures/01-put-jednog-zahtjeva/` · URL: `/predavanje/put-jednog-zahtjeva`
Engines: none (small local seeded models / steppers)

## Continuity
- First lecture.
- Next lecture (02 Jedan poslužitelj u 12:00) opens with: Ponedjeljak, 12:00. Klopa radi na poslužitelju s dvije procesorske jezgre i 2 GB RAM-a. U 11:58 p95 je oko 1,6 s, a u 12:00 skoči na 3 s i otprilike svaki drugi zahtjev dobiva grešku 503 jer je red pun. Davor otvori htop: procesor je na 17 %. Kako poslužitelj može biti pun dok procesor odmara?

## Hook (incident)
Lana je napisala Klopu, aplikaciju za naručivanje ručka u menzi, i ona savršeno radi na adresi `localhost:8000`. Pošalje poveznicu Petri, a Petra odgovori: „Ne otvara se.” Što se zapravo događa kad netko upiše adresu – i zašto Lanin localhost nije i Petrin?

## Objectives (rendered by the page hero)
- pratiti zahtjev od upisane adrese do odgovora: DNS, IP adresa, port, TCP veza i HTTP
- objasniti zašto aplikacija koja sluša na 127.0.0.1 ili na laptopu iza kućnog usmjerivača nije dostupna s drugog računala
- po simptomu razlikovati NXDOMAIN, odbijenu vezu i istek vremena
- procijeniti najmanju latenciju zbog udaljenosti i broja povratnih putovanja
- opisati što znači postaviti aplikaciju na poslužitelj u najjednostavnijem obliku

## Scenes
### 1. Kamo idemo: Klopa na kraju tečaja (animation)
- Concept: Course trailer: the final Klopa architecture so students know the destination; every box labelled with the lecture that introduces it.
- Visual: User-paced zoom-out from the L24 Klopa map (users → cloud LB → Gateway → Pods, queue, Postgres, Git/Argo CD) down to one laptop on localhost:8000 (L24 ends with the reverse zoom).
### 2. Zašto Petra ne vidi localhost (animation)
- Concept: Loopback 127.0.0.1 always means 'this machine'.
- Visual: Packet leaves Petra's phone addressed to localhost and U-turns back into her own phone with the label „127.0.0.1 = ovo računalo”.
### 3. Put zahtjeva korak po korak (animation)
- Concept: DNS (resolver, TTL cache; a missing name costs one resolver round trip and returns NXDOMAIN) → IP → TCP handshake (1 RTT) → TLS 1.3 (1 RTT) → HTTP request/response → process listening on a port; status families 2xx/4xx/5xx; 502/503/504 named for later.
- Visual: Stepper; packet header label (src IP:port → dst IP:port) rewrites at each hop; a waterfall bar grows.
### 4. Tko sluša na kojim vratima (interactive)
- Concept: A process binds IP:port. 127.0.0.1 = only this machine; 0.0.0.0 or :: = all interfaces. Defaults differ: gunicorn and Django runserver bind 127.0.0.1:8000, Node's server.listen(port) binds all interfaces. By default one process per IP:port (SO_REUSEPORT and gunicorn's/Node's pre-fork master sharing one socket are deliberate exceptions). Even bound to 0.0.0.0, a laptop on home or campus Wi-Fi has a private address (192.168.x.x, 10.x) behind NAT, so Petra on mobile data still cannot reach it – that is why we rent a server with a public IP. Firewall in front of the doors.
- Visual: Building (IP) with doors (ports); toggle bind address and watch an external packet bounce or enter; second process on same port shows 'address already in use'; a second view puts the building behind a NAT router labelled „privatna adresa”.
### 5. Udaljenost je latencija (interactive)
- Concept: Light in fibre ≈200 000 km/s → ≥1 ms RTT per 100 km; Zagreb→Frankfurt ≥7,2 ms, →Sydney ≥160 ms; new HTTPS connection ≥3 RTT before first byte.
- Visual: Map with server-location dropdown and animated round-trip counter labelled 'donja granica'.
### 6. Prvo postavljanje: s laptopa na poslužitelj (animation)
- Concept: Informal deploy (postavljanje): rent a VPS with 2 vCPU/2 GB and a public IP, copy code, run gunicorn --bind 0.0.0.0:8000, add a DNS A record; Petra opens http://klopa.example:8000. One line: in practice a reverse proxy (Caddy/nginx) listens on :443, terminates TLS and forwards to the app – the app may then listen on 127.0.0.1, which is safer (DeepDive). Chip: postavljanje ≠ Kubernetesov Deployment (L13).
- Visual: Code travels laptop → VPS; DNS record appears; Petra's request reaches the VPS; optional proxy box slides in front; Klopa karta v1.

## Flagship simulation: Put jednog zahtjeva
Packet tracer: pick a scenario, the request walks resolver → DNS → TCP → TLS → HTTP → app while a waterfall builds; break-it toggles produce distinct symptoms. Zadaci: „Dijagnosticirajte četiri pokvarena URL-a samo po simptomu”, „Dovedite Petrin zahtjev do odgovora 200”.

Controls:
- Odabir scenarija: Lanin laptop / VPS bez proxyja (http, :8000) / VPS s proxyjem (https, :443)
- Prekidač „Ime ne postoji (NXDOMAIN)”
- Prekidač „Zapis pokazuje na staru IP adresu”
- Prekidač „Vatrozid tiho odbacuje (DROP)”
- Prekidač „Aplikacija ne radi”
- Prekidač „Sluša samo na 127.0.0.1”
- Izbornik „Lokacija poslužitelja”: Zagreb / Frankfurt / Ashburn / Sydney
- Gumb „Pošalji zahtjev”, korak naprijed/natrag

Model (exact rules):
Deterministic step model. DNS: NXDOMAIN → answer after one resolver RTT, stop – no TCP connection is ever attempted; stale A record → TCP to an IP where nothing answers → client timeout (or, variant, a different server answers 404). Scenario 'Lanin laptop': external client → private IP behind NAT → unroutable → timeout, labelled 'privatna adresa iza NAT-a', whatever the bind address. TCP to IP:port: firewall DROP (cloud security groups, ufw default) → no reply, client waits full client timeout (5 s sim) → hollow 'timeout' glyph; tooltip: a REJECT rule would answer at once and look like 'refused'. Nothing listening OR app bound to 127.0.0.1 with an external client (no-proxy scenario) → RST within 1 RTT → spiky 'connection refused' glyph (same request from the server itself succeeds). With-proxy scenario: the proxy on the same host reaches an app on 127.0.0.1 fine (DeepDive), 'Aplikacija ne radi' → proxy answers 502. Then TLS 1.3 1 RTT (https only), HTTP 1 RTT → 200. RTT lower bound = great-circle km / 100 ms (Split 2,6; Frankfurt 7,2; Ashburn 72,5; Sydney 160 ms), always labelled 'donja granica, stvarna je veća'. TTFB on a new HTTPS connection = DNS (0 if cached) + 3·RTT + server 20 ms (http: 2·RTT). Refused and timeout must never share timing.

Break it: NXDOMAIN stops before any TCP connection; a DROP firewall or a stale DNS record hangs until timeout (hollow); app down or bound to 127.0.0.1 gives instant 'connection refused' (spiky); the laptop scenario times out whatever the bind address; a Sydney server stretches the waterfall to ≥480 ms before the first byte.

Insight: Every symptom points to a layer – name, address, door, process; 'refused' and 'timeout' tell different stories, and distance costs time no code can remove.

## Code artifacts
- gunicorn --bind 127.0.0.1:8000 ili 0.0.0.0:8000 (bash): Diff of the bind address; tab with Node `listen(8000, '127.0.0.1')` vs `listen(8000)` (default: all interfaces) to show that defaults differ
- curl -v https://klopa.example (bash): Annotated DNS/TCP/TLS/HTTP lines
- dig i ss -ltnp (bash): Name → IP; which process listens on which IP:port

## Misconceptions (Croatian myth + English correction)
- „localhost je moj poslužitelj” — 127.0.0.1 always means the machine making the request.
- „Domena pokazuje na moju aplikaciju” — DNS returns only an IP; the port is separate (80/443 by default).
- „Connection refused znači da je poslužitelj spor” — refused = nothing listens (fast); silently dropped or unreachable = timeout.
- „Ako slušam na 0.0.0.0, svi me mogu dohvatiti” — a laptop behind NAT has a private address; you need a public IP (and an open firewall).
- „Latencija se može optimizirati do nule” — the speed of light sets a floor.

## Key facts (verified; date-sensitive ones belong in fact callouts)
- [sim-models] Minimum RTT ≈1 ms per 100 km of fibre (light ≈200 000 km/s); Zagreb→Split ≥2,6 ms, Frankfurt ≥7,2 ms, Ashburn ≥72,5 ms, Sydney ≥160 ms (lower bounds).
- [sim-models] New HTTPS connection: TCP 1 RTT + TLS 1.3 1 RTT (TLS 1.2: 2) + HTTP 1 RTT ⇒ ≥3 RTT to first byte; QUIC merges transport and crypto into 1 RTT.
- [tech-facts] gunicorn and Django runserver bind 127.0.0.1:8000 by default; Node's server.listen(port) without a host binds :: / 0.0.0.0.
- [tech-facts] Private ranges 10/8, 172.16/12, 192.168/16 are not routable on the internet (NAT).
- Use the reserved domain klopa.example in all examples (never a real domain).

## Analogies (always with where they break down)
- DNS = imenik (ime → broj). Breaks down: the phone book doesn't know whether anyone answers or on which port.
- IP + port = zgrada i vrata stana. Breaks down: a port is not a security boundary, and by default exactly one process lives behind one IP:port (SO_REUSEPORT is a deliberate exception).
- Privatna adresa = kućni broj sobe u studentskom domu. Breaks down: NAT lets you call out but nobody outside can dial your room directly.

## Glossary terms introduced
DNS, Latency

## Bridge to next (CostNote)
Klopa sada radi na iznajmljenom poslužitelju s dvije procesorske jezgre i 2 GB RAM-a i Petra je napokon vidi. Ponedjeljak, 12:00 – cijeli kampus otkrio je Klopu, a stranica se počinje vući.
