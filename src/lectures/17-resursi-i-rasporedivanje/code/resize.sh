# Promjena resursa POKRENUTOG Poda bez ponovnog pokretanja (in-place resize)
kubectl patch pod klopa-api-7c9d8-x2kq -n klopa --subresource resize --patch \
  '{"spec":{"containers":[{"name":"api","resources":{"requests":{"cpu":"500m"},"limits":{"memory":"768Mi"}}}]}}'

# Je li kubelet promjenu primijenio? Gotovo je kad među uvjetima nema ni PodResizePending ni PodResizeInProgress
kubectl get pod klopa-api-7c9d8-x2kq -n klopa -o jsonpath='{range .status.conditions[*]}{.type}={.status} {end}'
# Vrijednosti koje kontejner stvarno ima (status, ne spec)
kubectl get pod klopa-api-7c9d8-x2kq -n klopa -o jsonpath='{.status.containerStatuses[0].resources}'

# Isto u Deploymentu NIJE resize: promijenjen predložak Poda = novi ReplicaSet = postupno uvođenje novih Podova
kubectl set resources deployment/klopa-api -n klopa -c api --requests=cpu=500m --limits=memory=768Mi
kubectl rollout status deployment/klopa-api -n klopa
