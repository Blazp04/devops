# izgradnja: -t daje slici ime i tag (ovdje verziju 1.3.2)
docker build -t registry.klopa.example/klopa-api:1.3.2 .

# pokretanje: port 8080 domaćina preslikava se na port 8000 u kontejneru
docker run -d --name klopa-api -p 8080:8000 registry.klopa.example/klopa-api:1.3.2
curl -i http://localhost:8080/healthz

# slojevi i naredbe koje su ih stvorile (tu se vide i vrijednosti ARG-a i ENV-a!)
docker image history registry.klopa.example/klopa-api:1.3.2

# slanje u registar: šalju se samo slojevi kojih tamo još nema
docker push registry.klopa.example/klopa-api:1.3.2

# digest: nepromjenjivo ime upravo ove slike
docker image inspect --format '{{index .RepoDigests 0}}' registry.klopa.example/klopa-api:1.3.2

# kontejner se briše zajedno sa svojim zapisivim slojem
docker rm -f klopa-api
