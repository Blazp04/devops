# Nova verzija: promijenite image u deployment.yaml (i change-cause), pa:
kubectl apply -f deployment.yaml

# Pratite uvođenje (čeka dok ne završi ili ne istekne progressDeadlineSeconds)
kubectl rollout status deployment/klopa-api -n klopa --timeout=3m

# Dva ReplicaSeta u suprotnim smjerovima
kubectl get rs -n klopa -l app=klopa-api

# Povijest revizija (CHANGE-CAUSE dolazi iz anotacije kubernetes.io/change-cause;
# zastarjelu zastavicu --record ne koristite)
kubectl rollout history deployment/klopa-api -n klopa

# Povratak na prethodnu reviziju – ili na točno određenu
kubectl rollout undo deployment/klopa-api -n klopa
kubectl rollout undo deployment/klopa-api -n klopa --to-revision=2

# Zaustavite uvođenje na pola i nastavite kad provjerite
kubectl rollout pause deployment/klopa-api -n klopa
kubectl rollout resume deployment/klopa-api -n klopa
