"""RabbitMQ (quorum redovi): glavni red, red čekanja i DLQ."""
import os

import pika

veza = pika.BlockingConnection(pika.ConnectionParameters(
    "rabbitmq.klopa.example",
    credentials=pika.PlainCredentials(
        "klopa-admin", os.environ["RABBITMQ_ADMIN_PASSWORD"])))
kanal = veza.channel()

# 1) DLQ i exchange koji vodi u njega
kanal.exchange_declare(
    "narudzbe.dlx", exchange_type="fanout", durable=True)
kanal.queue_declare(
    "narudzbe.dlq", durable=True,
    arguments={"x-queue-type": "quorum"})
kanal.queue_bind("narudzbe.dlq", "narudzbe.dlx")

# 2) glavni red: repliciran; odbačene poruke idu u DLQ
kanal.queue_declare(
    "narudzbe",
    durable=True,
    arguments={
        "x-queue-type": "quorum",
        # hvata potrošače koji padnu usred poruke (pad veze);
        # prolazne greške broji zaglavlje "pokusaj" u workeru
        "x-delivery-limit": 4,
        "x-dead-letter-exchange": "narudzbe.dlx",
        "x-dead-letter-strategy": "at-least-once",
        "x-overflow": "reject-publish",  # at-least-once to traži
    },
)

# 3) red čekanja: poruka odleži 2 s, zatim se vraća u "narudzbe"
kanal.queue_declare(
    "narudzbe.cekanje",
    durable=True,
    arguments={
        "x-queue-type": "quorum",
        "x-message-ttl": 2000,
        "x-dead-letter-exchange": "",  # zadani exchange …
        "x-dead-letter-routing-key": "narudzbe",  # … u glavni red
        "x-dead-letter-strategy": "at-least-once",
        "x-overflow": "reject-publish",
    },
)
veza.close()
