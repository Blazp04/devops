# jedna oznaka, dvije arhitekture procesora (x86-64 poslužitelji i ARM laptopi)
docker buildx build --platform linux/amd64,linux/arm64 \
  -t registry.klopa.example/klopa-api:1.3.2 --push .

# popis manifesta: koji digest pripada kojoj arhitekturi
docker buildx imagetools inspect registry.klopa.example/klopa-api:1.3.2
