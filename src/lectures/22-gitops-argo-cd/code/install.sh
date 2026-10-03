# Argo CD u vlastitom Namespaceu, verzija zadana točno (stanje: listopad 2026.)
kubectl create namespace argocd
kubectl apply -n argocd --server-side --force-conflicts \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/v3.5.3/manifests/install.yaml

# početna lozinka korisnika admin (promijenite je i obrišite ovaj Secret)
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d
