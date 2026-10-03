# Šalabahter za dijagnostiku: od simptoma prema uzroku (namespace klopa)

# 1. Što radi, a što ne?
kubectl get pods -n klopa -o wide                 # STATUS, READY, RESTARTS, čvor
kubectl get deploy,rs -n klopa                    # koliko je replika spremno
kubectl rollout status deploy/klopa-api -n klopa  # stoji li uvođenje?

# 2. Zašto Pod nije Running ili Ready?
kubectl describe pod <pod> -n klopa               # Events, Last State (OOMKilled, exit 137), provjere
kubectl logs <pod> -n klopa                       # log aplikacije
kubectl logs <pod> -n klopa --previous            # log prije zadnjeg ponovnog pokretanja
kubectl get events -n klopa --sort-by=.lastTimestamp

# 3. Stiže li promet do Podova?
kubectl get endpointslices -n klopa -l kubernetes.io/service-name=klopa-api
kubectl get httproute klopa -n klopa -o yaml      # ima li pravilo za /api?

# 4. Resursi i skaliranje
kubectl top pods -n klopa                         # treba metrics-server
kubectl get hpa -n klopa                          # TARGETS <unknown>: nema requests.cpu, metrics-servera ili još nema mjerenja
kubectl describe hpa klopa-api -n klopa           # ScalingLimited, FailedGetResourceMetric

# 5. Odgovara li klaster Gitu?
argocd app get klopa                              # Sync i Health po resursu
argocd app diff klopa                             # što se razlikuje od Gita
argocd app history klopa

# 6. Popravak ide kroz Git
git revert <sha> && git push                      # vrati loš commit
