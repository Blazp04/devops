"""klopa-worker: narudžbe iz reda → listić za kuhinju i SMS."""
import json
import os

import pika
import psycopg

from klopa import kuhinja, sms

NAJVISE_POKUSAJA = 5

# lozinku čita iz varijable okoline PGPASSWORD
db = psycopg.connect(
    "host=postgres.klopa.example dbname=klopa", autocommit=True)
# lozinka iz varijable okoline, kao za Postgres
veza = pika.BlockingConnection(pika.ConnectionParameters(
    "rabbitmq.klopa.example",
    credentials=pika.PlainCredentials(
        "klopa-worker", os.environ["RABBITMQ_PASSWORD"])))
kanal = veza.channel()
kanal.basic_qos(prefetch_count=1)  # najviše 1 nepotvrđena poruka
kanal.confirm_delivery()  # objava čeka potvrdu posrednika


def obradi(ch, method, props, body):
    pokusaj = (props.headers or {}).get("pokusaj", 1)
    try:
        narudzba = json.loads(body)
        with db.transaction():  # oznaka i listić: ISTA transakcija
            kuhinja.zabiljezi(db, narudzba)  # ON CONFLICT DO NOTHING
        # SMS je izvan baze: ključ pružatelja sprječava dvostruki SMS
        sms.posalji(narudzba, kljuc=f"narudzba-{narudzba['id']}")
    except (ValueError, kuhinja.NeispravnaNarudzba):
        # otrovna poruka: ponavljanje ne pomaže → ravno u DLQ
        ch.basic_reject(method.delivery_tag, requeue=False)
        return
    except Exception:
        if pokusaj >= NAJVISE_POKUSAJA:
            # preko dead-letter exchangea u DLQ
            ch.basic_reject(method.delivery_tag, requeue=False)
        else:
            # u red čekanja; za 2 s vraća se u "narudzbe"
            ch.basic_publish(
                "", "narudzbe.cekanje", body,
                pika.BasicProperties(
                    delivery_mode=2,
                    headers={"pokusaj": pokusaj + 1}),
                mandatory=True)  # bez potvrde: iznimka, stara ostaje
            ch.basic_ack(method.delivery_tag)
        return
    ch.basic_ack(method.delivery_tag)  # tek nakon commita i SMS-a


kanal.basic_consume("narudzbe", obradi)  # auto_ack=False je zadano
kanal.start_consuming()
