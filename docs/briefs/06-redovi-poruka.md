# Lecture 06 — Redovi poruka i događaji
_Kako preživjeti nalet bez izgubljenih narudžbi – i zašto se ista narudžba ponekad skuha dvaput._ · ~40 min · module m1 · prerequisites: 04, 05
Folder: `src/lectures/06-redovi-poruka/` · URL: `/predavanje/redovi-poruka`
Engines: E2 → src/engines/queue/

## Continuity
- Previous lecture (05 Kad poslužitelj padne: provjere ispravnosti i gdje živi stanje) ends with: Poslužitelji aplikacije sada su zamjenjivi, a stanje živi u Postgresu i Redisu. No API sve radi sinkrono: spremi narudžbu, upiše listić za kuhinju i pošalje SMS – i tek onda odgovori. Ćevap-petak, 12:00: deset sekundi stiže po petnaest narudžbi u sekundi, a SMS-gateway počne kasniti.
- Next lecture (07 Virtualni stroj i kontejner) opens with: Iva na laptopu ima najnoviji Python, a na poslužitelju je verzija stara dvije godine. API i worker trebaju dvije različite verzije sistemske biblioteke za obradu fotografija (libvips) koju instalira operacijski sustav, a poslužitelj-2 netko je prije godinu dana ručno konfigurirao pa se razlikuje od poslužitelja-1. Kako aplikaciji dati njezino okruženje, a da ne kupimo računalo za svaku?

## Hook (incident)
SMS-gateway odgovara sve sporije, a API čeka svaki SMS, pa zapinju i narudžbe. Na Ćevap-petak narudžbe deset sekundi stižu po 15 u sekundi (inače dvije), a API ih istodobno može obrađivati samo četiri – od 445 narudžbi tog ručka izgubi se 152. Lana doda ponovne pokušaje – i teta Mira iz kuhinje viče: „Dvaput ćevapi za istu narudžbu?!” Kako odvojiti primanje narudžbe od posla koji slijedi, a da se ništa ne izgubi ni ne udvostruči?

## Objectives (rendered by the page hero)
- objasniti kako red poruka razdvaja proizvođača i potrošača u vremenu i ublažava nalete
- pokazati zašto red ne povećava kapacitet
- objasniti potvrde i ponovnu isporuku u RabbitMQ-u i SQS-u te zašto isporuka barem jednom traži idempotentnog potrošača
- postaviti ponovne pokušaje sa sve duljim, nasumično raspršenim razmakom (engl. *exponential backoff with jitter*) i red neobrađenih poruka
- razlikovati naredbu (posao za jednog potrošača) i događaj (obavijest koju dobiva svaki pretplatnik) te red i objavi-pretplati; znati da log (Kafka) čuva poruke za ponovno čitanje

## Scenes
### 1. Sinkroni lanac (animation)
- Concept: The request waits for payment + SMS + ticket; one slow dependency stalls everything; answer 202 + order ID instead.
- Visual: Chain of calls with a clock; SMS box turns amber, whole request stalls.
### 2. Red kao amortizer (interactive)
- Concept: Bursts absorbed; if λ > kμ persists the queue grows without bound; drain time = backlog/(kμ−λ); consumers pull work (vs LB push).
- Visual: Two scrubbable rates; depth chart; kitchen ticket rail with cooks taking the next ticket.
### 3. Potvrda i ponovna isporuka (interactive)
- Concept: Ack before processing (crash → lost, at-most-once) vs after (crash after side effect → duplicate, at-least-once). Redelivery trigger differs by broker: RabbitMQ requeues unacked deliveries immediately when the consumer's channel/connection closes (redelivered=true), and closes a consumer that doesn't ack within consumer_timeout (default 30 min); SQS uses a visibility timeout (default 30 s) after which the message reappears.
- Visual: Broker toggle; two crash buttons; the message reappears (instantly on disconnect in RabbitMQ, after the timer in SQS).
### 4. Ključ idempotentnosti (interactive)
- Concept: Order ID + unique constraint (INSERT … ON CONFLICT DO NOTHING) makes database effects effectively-once when the dedup row and the effect commit in one transaction. External effects (SMS gateway, card payment) need the provider's idempotency key or must tolerate an occasional duplicate: record then send → risk of loss; send then record → risk of a duplicate. Outbox pattern in a DeepDive.
- Visual: Teta Mira's board stamps the duplicate „već skuhano”; a separate SMS counter can still show „SMS poslan dvaput”.
### 5. Otrovna poruka (interactive)
- Concept: Full-jitter backoff random(0, min(cap, base·2ⁿ)); one sentence: retries multiply load across layers (3 × 3 × 3 = 27×). RabbitMQ nack/requeue is immediate – backoff needs a retry queue (TTL + dead-letter exchange) or the delayed-message plugin; SQS supports per-message delay. Delivery limit → DLQ; RabbitMQ quorum default delivery-limit 20; without a dead-letter exchange the message is dropped.
- Visual: Poison message loops through the retry lane, then moves to the DLQ lane.
### 6. Red, pub/sub ili log (interactive)
- Concept: Command „Skuhaj narudžbu 42” (work queue, one consumer) vs event „NarudzbaZaprimljena” (fan-out: kitchen, SMS, analytics each get a copy). Closed DeepDive „Za znatiželjne: log i Kafka”: a log keeps messages for replay; partitions, per-key order, offsets, lag; in a classic consumer group consumers beyond the partition count sit idle; Kafka ≥4.2 share groups let more consumers than partitions share work with per-message acks and no per-key order.
- Visual: Topology toggle work queue / fan-out; DeepDive Stepper with partitions, offsets and lag (no consumer-group sim).

## Flagship simulation: Kuhinjska šina
E2: producer → queue → k potrošača with visible acks, redelivery, retries and DLQ; switch between direct calls and a queue, and between RabbitMQ and SQS semantics. Zadaci: „Ćevap-petak bez izgubljene narudžbe”, „Ispraznite red u < 20 s s najmanje potrošača”, „Nula dvostrukih narudžbi kad potrošač padne nakon kuhanja (RabbitMQ) ili kad obrada traje dulje od roka za potvrdu (SQS)”, „Otrovnu poruku odvojite u DLQ”. Incident card: direct mode, nalet, k 4, seed 42, run length 150 s.

Controls:
- Segmented način: bez reda (izravni pozivi) / s redom
- Segmented posrednik: RabbitMQ / SQS
- Klizač „Narudžbe/s” 0–20; „Nalet” (15/s tijekom 10 s); „+100 odmah”
- Klizač „Potrošači” 0–12
- Klizači pFail 0–50 %, pPoison 0–5 %
- Klizač „Najviše isporuka” (zadano 5; oznaka „RabbitMQ quorum: 20”)
- Klizač „Rok za potvrdu” 1–60 s (SQS: istek vidljivosti, zadano 30 s; RabbitMQ: consumer_timeout, zadano 30 min – sažeto)
- Segmented potvrda: nakon obrade / automatski
- Prekidač „Idempotentnost”
- Najveća duljina reda: ∞ ili 50 (reject-publish / drop-head)
- Gumbi za kvar: „SMS-gateway pao”, „Sruši potrošača prije kuhanja”, „Sruši potrošača nakon kuhanja, prije potvrde”, „Spori potrošač”, „Pošalji otrovnu poruku”

Model (exact rules):
sim-models SIM 2. DT 10 ms; Poisson λ 2 msg/s; burst 15/s × 10 s; k 4; service Exp mean 1000 ms; maxDeliveries 5; full jitter base 500 ms cap 30 s; manual ack after processing. Tick: (1) direct mode: free consumer starts it, else lost (503); queue mode: publish or overflow policy. (2) Redelivery – SQS mode: unacked past visibility deadline (default 30 s) → visible again (receiveCount already incremented); RabbitMQ mode: consumer crash closes its connection → its unacked deliveries requeue immediately (redelivered=true, delivery count +1); a consumer exceeding consumer_timeout (slider, compressed, badge 'stvarno: 30 min') has its channel closed and deliveries requeued. (3) success → side effect (if idempotent only for unseen IDs; SMS side effect counted separately and can still duplicate) then ack; late ack after redelivery → possible duplicate; failure → DLQ if count ≥ maxDeliveries else retry after jitter (SQS: per-message delay; RabbitMQ: via retry queue with TTL + DLX). (4) idle consumers take first visible (label 'redoslijed nije zajamčen'). Auto-ack + crash → lost. Metrics: depth, in-flight, oldest age, p50/p95 publish→ack, retries, DLQ, side effects unique vs total, „SMS poslan dvaput”, lost, Little's law panel. Validated: direct 2/s, k 4 → 10,3 % lost (Erlang B 9,5 %); queue → 0 lost, p50 0,77 s, p95 3,1 s; burst direct 152/445 lost over a 150 s run; burst queue k 4 → peak ~100, drains ~50 s; k 8 → peak 66, ~15 s; pFail 10 % + poison 2 % → DLQ 24/~1245, 236 retries; SQS visibility 2 s → 13 % duplicates, 0 with idempotency. Kafka only in the DeepDive stepper: P 3, 10 user keys (hot key 50 %), partition = hash(key) mod P (text: Kafka uses murmur2), each partition to one consumer per classic group, C > P idle, lag = end − committed, commit after processing, replay resets offset.

Break it: „SMS-gateway pao”: direct mode fails orders, queue mode keeps accepting while depth climbs then drains; crashing a consumer after cooking but before ack duplicates the order unless idempotent (and the SMS can still go out twice); in SQS mode a slow consumer past the visibility timeout duplicates too; a poison message loops until the DLQ.

Insight: A queue doesn't make work faster – it makes waiting safe; delivered twice is normal, so consumers must be idempotent – and idempotency is easy only inside your own database transaction.

## Code artifacts
- Potrošač s potvrdom nakon obrade (python): pika consumer loop with basic_qos and basic_ack after commit
- Idempotentni upis narudžbe (sql): INSERT … ON CONFLICT (order_id) DO NOTHING in the same transaction as the effect
- Quorum red s x-delivery-limit, retry redom i dead-letter exchangeom (python): RabbitMQ declarations with pika
- Kafka producer s ključem (python): Closed, optional (confluent-kafka)

## Misconceptions (Croatian myth + English correction)
- „Red ubrzava obradu” — it absorbs bursts; if λ > kμ persists the backlog grows without bound; only more consumers add capacity.
- „Svaka poruka stiže točno jednom” — at-least-once is the norm; redelivery after a crash or timeout is expected, so consumers must be idempotent.
- „Poruke se obrađuju redom” — not with several consumers.
- „Asinkrono znači da nitko ne čeka rezultat” — return an ID, notify later.
- „Idempotentnost rješava i dvostruke SMS-ove” — only effects in the same DB transaction; external calls need the provider's idempotency key.
- „Kafka treba ZooKeeper” — KRaft production-ready since 3.3; ZooKeeper removed in 4.0 (March 2025).
- „Kafka ne zna raditi redove” — share groups (production-ready in 4.2) give queue-like semantics.

## Key facts (verified; date-sensitive ones belong in fact callouts)
- [tech-facts] At-most-once / at-least-once / exactly-once definitions; Kafka is at-least-once by default; exactly-once only within Kafka (idempotent producer + transactions + read_committed).
- [tech-facts] Kafka 4.0 (2025-03-18) removed ZooKeeper; Kafka 4.2.0 (2026-02-17) share groups production-ready; current 4.3.1 (as of 2026-10).
- [tech-facts] RabbitMQ 4.0 removed classic mirroring; quorum queues are the HA default, delivery-limit 20; streams are non-destructive; unacked deliveries are requeued on channel/connection close; consumer_timeout default 30 min; no per-message visibility timeout.
- [tech-facts] NATS core at-most-once, JetStream at-least-once; SQS Standard at-least-once with best-effort order, visibility timeout default 30 s; SQS FIFO: strict order within a message group and send-deduplication within 5 min (AWS calls it exactly-once processing) – a message not deleted before its visibility timeout is still redelivered, so consumers stay idempotent.

## Analogies (always with where they break down)
- Kuhinjska šina za listiće. Breaks down: paper tickets don't duplicate; real queues redeliver, so the same order can be cooked twice.
- Radio emisija (pub/sub). Breaks down: late listeners miss it, but a log keeps messages for replay.

## Glossary terms introduced
Message queue, At-least-once delivery, Idempotency, Dead-letter queue

## Bridge to next (CostNote)
Klopa sad ima šest vrsta procesa – web, API, worker, Postgres, Redis i RabbitMQ – na tri ručno konfigurirana poslužitelja. U tim dolazi Iva, prvi dan pokrene API i kaže: „Kod mene radi, na poslužitelju ne.”
