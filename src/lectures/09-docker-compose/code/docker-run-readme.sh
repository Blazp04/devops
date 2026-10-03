# README.md – „kako pokrenuti Klopu” (Ivina verzija: šest naredbi koje nitko ne pamti)
# pokrenite ih ovim redom!
docker network create klopa

docker run -d --name db --network klopa --env-file .env \
  postgres:18                                  # ← bez -v: podatci u anonimnom volumenu
docker run -d --name redis --network klopa redis:8
docker run -d --name rabbitmq --network klopa --env-file .env rabbitmq:4.3
docker run -d --name api --network klopa --env-file .env \
  -e DATABASE_HOST=localhost \
  -e REDIS_URL=redis://redis:6379/0 -e AMQP_HOST=rabbitmq \
  registry.klopa.example/klopa-api:1.3.2       # ← localhost? tako je radilo na laptopu
docker run -d --name worker --network klopa --env-file .env -e AMQP_HOST=rabbitmq \
  registry.klopa.example/klopa-worker:1.3.2
docker run -d --name web --network klopa -p 8080:8080 \
  registry.klopa.example/klopa-web:1.3.2
