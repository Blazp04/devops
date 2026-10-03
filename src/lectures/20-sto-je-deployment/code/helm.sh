# Helm: chart = predlošci + vrijednosti. Rezultat je isto običan YAML.
helm template klopa ./charts/klopa -f values-prod.yaml > prod.yaml
