# gunicorn.conf.py – Klopin API (Django) na poslužitelju s 2 vCPU i 2 GB RAM-a
bind = "127.0.0.1:8000"  # samo iznutra: izvana dolazi Caddy
worker_class = "sync"  # sinkroni radnik: jedan zahtjev odjednom

# Uobičajeni početak: 2 × broj jezgri + 1 = 5 radnika.
# Klopini zahtjevi većinom čekaju bazu, pa više radnika pomaže –
# ali samo dok stanu u RAM: (2048 MB − 512 MB) / 256 MB = 6.
workers = 6

timeout = 30  # radnik koji 30 s ne javi da je živ ubija se i pokreće novi
backlog = 2048  # veze koje čekaju u redu operacijskog sustava

# nakon ~1000 zahtjeva radnik se zamijeni novim (protiv curenja memorije)
max_requests = 1000
max_requests_jitter = 100
