# 1) Kopija SVIH ključeva kontrolera (stari se ne brišu, pa ih je sve više).
#    Na postojećem klasteru, i ponovno nakon svake obnove ključa.
kubectl get secret -n kube-system \
  -l sealedsecrets.bitnami.com/sealed-secrets-key \
  -o yaml > sealed-secrets-kljucevi.yaml

# Datoteku spremite u trezor tima, IZVAN klastera i IZVAN Gita
# (npr. upravitelj lozinki tima ili upravitelj tajni u oblaku).
# Zatim je obrišite s laptopa: tko je ima, otključava svaki SealedSecret.
rm sealed-secrets-kljucevi.yaml
