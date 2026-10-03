"""Za znatiželjne: narudžba kao događaj u Kafki."""
import json

from confluent_kafka import Producer

producer = Producer({
    "bootstrap.servers": "kafka.klopa.example:9092",
    # zapis je spremljen kad ga imaju sve sinkronizirane replike
    "acks": "all",
    # ponovno slanje ne upiše isti zapis dvaput
    "enable.idempotence": True,
})


def objavi(narudzba: dict) -> None:
    producer.produce(
        "narudzbe",  # topic
        # isti ključ → ista particija → redoslijed sačuvan
        key=str(narudzba["korisnik_id"]),
        value=json.dumps(
            {"tip": "NarudzbaZaprimljena", **narudzba}),
    )
    producer.poll(0)


objavi({"id": 42, "korisnik_id": 7, "jelo": "ćevapi"})
producer.flush()
