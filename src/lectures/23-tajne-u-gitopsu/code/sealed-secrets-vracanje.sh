# 2) Vraćanje: novi klaster, PRIJE prve sinkronizacije Argo CD-a.
# Datoteku najprije dohvatite iz trezora tima, pa:
kubectl apply -f sealed-secrets-kljucevi.yaml
# kontroler ključeve čita pri pokretanju, pa ga ponovno pokrenite
# (instalacija Helmom: oznaka Poda app.kubernetes.io/name=sealed-secrets)
kubectl delete pod -n kube-system -l name=sealed-secrets-controller
rm sealed-secrets-kljucevi.yaml
