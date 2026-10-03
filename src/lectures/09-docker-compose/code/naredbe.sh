# pokreni sve (u pozadini) – mreža, volumeni, kontejneri pravim redom
docker compose up -d

# što radi i je li zdravo
docker compose ps

# logovi jednog servisa, uživo (Ctrl+C za izlaz)
docker compose logs -f api

# volumeni: imenovani (klopa_pgdata) i anonimni (dugo heksadecimalno ime)
docker volume ls
docker volume ls --filter dangling=true    # oni bez kontejnera

# ugasi i obriši kontejnere i mrežu – imenovani volumeni ostaju
docker compose down

# … i obriši volumene projekta – s njima i sve narudžbe!
docker compose down -v
