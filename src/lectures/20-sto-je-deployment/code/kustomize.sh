# Što će se primijeniti? Kustomize izradi običan YAML (ništa ne šalje u klaster)
kubectl kustomize overlays/staging > staging.yaml
kubectl kustomize overlays/prod > prod.yaml
diff staging.yaml prod.yaml      # razlike = samo retci iz slojeva

# Primjena istog izlaza na klaster
kubectl apply -k overlays/prod
