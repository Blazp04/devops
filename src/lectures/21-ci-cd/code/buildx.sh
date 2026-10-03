# Izgradite i pošaljite jednom: dva taga, jedna slika
docker buildx build --push \
  -t registry.klopa.example/klopa-api:5874b1e \
  -t registry.klopa.example/klopa-api:2.0.1 \
  --metadata-file build.json .

# Zapišite digest: samo ta slika ide na testiranje u staging i dalje u produkciju
jq -r '."containerimage.digest"' build.json

# Na što tag pokazuje sada? (tag se može pomaknuti, digest ne)
docker buildx imagetools inspect registry.klopa.example/klopa-api:2.0.1

# Okruženja dalje dobivaju digest, a ne ponovnu izgradnju:
#   image: registry.klopa.example/klopa-api:2.0.1@sha256:…
