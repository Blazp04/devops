# Brze naredbe za probu. Pažnja: mijenjaju klaster, a ne vašu datoteku.
# U GitOpsu (22. predavanje) iste promjene radite u Gitu, inače ih Argo CD vrati.

# Šest replika: postojeći ReplicaSet dobije dva Poda više
kubectl scale deployment/klopa-api -n klopa --replicas=6

# Nova slika: novi predložak, novi ReplicaSet, postupno ažuriranje
kubectl set image deployment/klopa-api -n klopa \
  klopa-api=registry.klopa.example/klopa-api:1.4.0
kubectl annotate deployment/klopa-api -n klopa \
  kubernetes.io/change-cause="uvođenje 1.4.0 (vegetarijanski meni)" --overwrite
