# Prebacivanje: nove veze idu na green, postojeće ostaju na blue dok se ne zatvore
kubectl -n klopa patch service klopa-api \
  -p '{"spec":{"selector":{"app":"klopa-api","track":"green"}}}'

# Povratak je ista naredba s track: blue (blue mora još raditi!)
kubectl -n klopa patch service klopa-api \
  -p '{"spec":{"selector":{"app":"klopa-api","track":"blue"}}}'

# Blue ugasite tek kad se njegove veze isprazne
kubectl -n klopa scale deployment klopa-api-blue --replicas=0
