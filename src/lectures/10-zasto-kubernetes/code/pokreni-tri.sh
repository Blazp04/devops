#!/usr/bin/env bash
# Imperativno: koraci koji se izvrše jednom, redom.
for i in 1 2 3; do
  docker run -d --name "klopa-api-$i" -p "800$i:8000" \
    registry.klopa.example/klopa-api:1.3.2
done
# Skripta je gotova. Ako kontejner padne za sat vremena, nitko ga ne gleda.
# Ponovno pokretanje ne znači „neka ih bude tri”: Docker odbije imena i
# portove koji su već zauzeti, a skripta ne zna koliko kopija već radi.
