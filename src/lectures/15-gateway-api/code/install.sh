# 1) CRD-ovi Gateway API-ja (Standard kanal): nove vrste u API-ju.
#    Treba kontrolerima koji CRD-ove ne donose sami – za druge implementacije:
# kubectl apply --server-side -f \
#   https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.6.2/standard-install.yaml

# 2) Kontroler – ovdje Envoy Gateway. Njegov install.yaml već sadrži CRD-ove
#    Gateway API-ja (u verziji koju podržava), pa s njim korak 1 preskačemo;
#    inače bi ovaj korak ionako prepisao CRD-ove iz koraka 1.
kubectl apply --server-side -f \
  https://github.com/envoyproxy/gateway/releases/download/v1.9.2/install.yaml

# 3) GatewayClass „eg”: ova vrsta vrata postoji i gradi ih Envoy Gateway
kubectl apply -f gatewayclass.yaml
kubectl get gatewayclass
