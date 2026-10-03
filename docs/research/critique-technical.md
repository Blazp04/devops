**Klopa curriculum: technical review (as of 2026-10-01)**

Each item gives the lecture and field, what is wrong, and the corrected content. Lecture-facing text is in Croatian; model and concept fields stay in English, as in the draft. Severity runs CRITICAL > MAJOR > MINOR.

**L01**

1. **[MAJOR] L01 scenes[3] "Tko sluša na kojim vratima", flagshipSimulation.model, codeArtifacts[0].purpose**
   - **Wrong:** The draft implies that binding to 0.0.0.0 is enough for Petra to reach Lana's laptop. It leaves out private addresses and NAT. It also never says that Node binds to all interfaces by default.
   - **Corrected concept:** "A process binds IP:port. 127.0.0.1 means only this machine; 0.0.0.0 or :: means all interfaces. Node's `server.listen(3000)` with no host already binds :: (all interfaces), while dev servers such as Vite default to localhost. Even with 0.0.0.0, a laptop on home or campus Wi-Fi has a private address (192.168.x.x, 10.x) behind NAT, so Petra on mobile data still cannot reach it. That is why we rent a server with a public IP (scene 6)."
   - **Model, add:** "Scenario 'Lanin laptop': external client → private IP → unroutable → timeout, labelled 'privatna adresa iza NAT-a', whatever the bind address."
   - **codeArtifacts[0].purpose:** "Minimal Node HTTP server; `listen(3000, '127.0.0.1')` vs `listen(3000)` (default: all interfaces)."

2. **[MAJOR] L01 flagshipSimulation.controls, model, breakIt: firewall and DNS toggles**
   - **Wrong:**
     - A firewall can also REJECT, which looks exactly like "refused".
     - "Krivi DNS zapis" usually means a stale or wrong IP, not NXDOMAIN.
     - NXDOMAIN is not instant: it costs one resolver round trip.
   - **Corrected controls:**
     - „Vatrozid tiho odbacuje (DROP)”
     - „Ime ne postoji (NXDOMAIN)”
     - „Zapis pokazuje na staru IP adresu”
   - **Model:**
     - "DROP (cloud security groups, ufw default) → client timeout. A REJECT rule would answer at once like 'refused'; note this in a tooltip."
     - "Stale A record → timeout, or a different server answers."
     - "NXDOMAIN arrives after one resolver RTT; no TCP connection is ever attempted."
   - **breakIt:** replace "NXDOMAIN appears instantly" with "NXDOMAIN stops before any TCP connection".

3. **[MINOR] L01 analogies[1] and scenes[3]: "exactly one process … behind one IP:port"**
   - **Corrected:** "By default one process per IP:port. SO_REUSEPORT and Node's cluster module are deliberate exceptions, where the kernel or a primary process shares the port."

**L02**

4. **[MAJOR] runningExample; L02 scenes[0], codeArtifacts[0]; L04 scenes[2]: Node.js vs the worker-pool model**
   - **Wrong:** klopa-api is Node.js/TypeScript, but the L02–L05 sims model it as a worker-pool server (256 MB per in-flight request, RAM bounds concurrency). Node serves many requests concurrently in one process with async I/O. Its real limits are one core per process for JavaScript and, usually, the DB connection pool. Students would leave with a false model of Node.
   - **Corrected:** Promote the tooltip to a visible callout in L02 scene 1:
     > Model, ne Node.js: poslužitelj u simulaciji ima bazen workera – jedan worker obrađuje jedan zahtjev i zauzima ≈256 MB (kao PHP-FPM, gunicorn ili Puma). Node.js u jednom procesu istodobno obrađuje mnogo zahtjeva, ali JavaScript izvodi na samo jednoj jezgri; skalira se procesom po jezgri (cluster/PM2) ili s više Podova, a istodobnost mu najčešće ograničava bazen veza prema bazi.
   - **runningExample, add:** "In M1 sims klopa-api is modelled as a worker-pool server (labelled)."
   - **codeArtifacts[0]:** make it two tabs:
     - "Bazen workera: gunicorn `workers` / `pm.max_children` ≈ slobodni RAM / veličina procesa"
     - "Node: PM2 `instances` = broj jezgri, `pg.Pool({ max: 10 })` = granica istodobnih upita"

5. **[MAJOR] L02 hook: numbers the sim cannot produce**
   - **Wrong:** "p95 s 80 ms na 9 s" is impossible in this model:
     - Successes are capped by the 5 s client timeout; anything later counts as 504.
     - The I/O preset, which is the one giving ~15 % CPU, has a service time of at least 1,05 s.
   - **Corrected hook:**
     > Ponedjeljak, 12:00. Klopa radi na poslužitelju s dvije procesorske jezgre i 2 GB RAM-a. U 11:58 p95 je 1,2 s, a u 12:00 skoči na gotovo 5 s i sve više zahtjeva završava greškom 503 (red je pun) ili 504 (istekao je rok od 5 s). Davor otvori htop: procesor je na 15 %. Kako poslužitelj može biti pun dok procesor odmara?

6. **[MINOR] L02 scenes[2] "Hokejaška palica" and the "70 % CPU-a" myth**
   - **Corrected concept:** "Label it 'model M/M/1 (jedan poslužitelj, slučajni dolasci i trajanja)'. With c parallel workers the knee moves right (Erlang C, c=4 at ρ=0,95 → ≈5,5×, not 20×), but it is still there."
   - **Myth correction:** "In M/M/1, at 70 % the wait is already 3,3× the service time; more cores move the knee, they do not remove it."

7. **[MINOR] L02 misconceptions[0] "Više RAM-a = brži poslužitelj"**
   - **Corrected:** "For this app server RAM bounds concurrency and cores bound throughput. For a database, RAM is cache (page cache, shared_buffers) and does speed up reads (L05, L19)."

**L03**

8. **[MINOR] L03 flagshipSimulation.model defaults**
   - **Wrong:** Two servers each sized at 70 % of peak leave the survivor at 100/70 ≈ 143 %, not 140 %.
   - **Corrected:** Write "(≈143 %)", or define the default as "each server at 70 % utilisation at peak" if the 140 % figure is kept.

**L04**

9. **[MAJOR] L04 hook and scenes[0] "DNS kao load balancer"**
   - **Wrong:** "klijenti pamte odgovor pa većina i dalje ide na prvi" is false as a rule, because resolvers rotate or shuffle the records. The real faults are three:
     - DNS cannot weight by server size.
     - DNS knows nothing about health.
     - Caching makes failover slow.
   - **Corrected hook sentence:**
     > Davor je najprije sve tri adrese stavio u DNS, ali DNS korisnike dijeli otprilike jednako – ne zna da je veliki poslužitelj četiri puta jači od malog, a kad jedan padne, klijenti njegovu adresu još minutama pamte. Zato postavlja load balancer s kružnim raspoređivanjem – i u 12:00 mali poslužitelj vraća greške dok veliki radi na četvrtini snage.
     
     The last clause matches the validated figure of S3 at 27 % CPU.
   - **Scene concept:** "Several A records: resolvers rotate the order, so clients spread roughly evenly by count. DNS cannot weight 1:2:4, does not know which server is alive, and caches (resolver, OS, browser, sometimes ignoring TTL) keep a dead IP in use. A whole campus behind one caching resolver shares one answer per TTL, which makes the split lumpy."

10. **[MINOR] L04 keyFacts[1]**
    - **Wrong:** "A Kubernetes Service does none of this" is too absolute.
    - **Corrected:** "A Kubernetes Service (kube-proxy in the default iptables/nftables mode) uses none of these algorithms. It picks a ready endpoint at random for each new connection, with no weights and no notion of node size. It does skip Pods that fail readiness (L12, L14)."

**L05**

11. **[MAJOR] L05 scenes[0] "Prozor otkrivanja"**
    - **Wrong:** "≈ 60–65 s" contradicts the scene's own formula. With U=2 and a 30 s interval, detection takes 30–60 s.
    - **Corrected:** "ALB defaults 30 s / 5 s / healthy 5 / unhealthy 2 → detection ≈30–60 s (up to ≈65 s for a hung target); back in rotation only after 5 passing checks (≈2,5 min)."

12. **[MAJOR] L05 controls "Sruši"; L04 bridgeToNext**
    - **Wrong:** A crashed process and a dead machine look different, and this contradicts the L01 lesson on refused vs timeout.
    - **Corrected controls:**
      - „Sruši proces” (port closed → RST → instant 502)
      - „Ugasi stroj” (no RST → the load balancer waits for its connect timeout, then 502/504, behaving like a hang)
    - **L04 bridge:** "veliki poslužitelj se sruši" becomes "procesu na velikom poslužitelju ponestane memorije i sruši se".

13. **[MINOR] L05 scenes[3] "Gdje živi košarica"**
    - **Wrong:** sessionAffinity ClientIP is not an "equivalent" of cookie stickiness.
    - **Corrected:** "Closest Kubernetes analogue is sessionAffinity: ClientIP (10800 s). It is IP-based, not cookie-based: everyone behind campus NAT or eduroam shares one public IP and lands on the same Pod, and behind a cloud LB the Pod may only see the LB's or node's address unless externalTrafficPolicy: Local is set. Cookie affinity lives in L7 (Gateway implementations)."

**L06**

14. **[MAJOR] L06 hook: numbers inconsistent with the sim**
    - **Wrong:** The burst is 15/s × 10 s ≈ 150 orders. The 445 / 152 figures are totals over the whole ~2,5-minute validated run, not over ten seconds.
    - **Corrected:**
      > Na Ćevap-petak u deset sekundi stigne oko 150 narudžbi (inače dvadesetak), a od 445 narudžbi u tih dvije i pol minute 152 se izgube.

15. **[CRITICAL] L06 scenes[2], controls „Istek vidljivosti”, Zadatak "Nula dvostrukih narudžbi uz istek vidljivosti 2 s", model steps (2)/(3)**
    - **Wrong:** Klopa uses RabbitMQ, but this is SQS behaviour.
      - RabbitMQ has no visibility timeout. Unacked deliveries are requeued immediately when the consumer's channel or connection closes. A consumer that does not ack within `consumer_timeout` (default 30 min) has its channel closed, and its deliveries are requeued.
      - nack/requeue is immediate. There is no per-message delay, so backoff needs a retry queue (TTL + dead-letter exchange) or the delayed-message plugin.
    - **Corrected:** Add a segmented control „Posrednik: RabbitMQ / SQS”.
      - **RabbitMQ mode:**
        - Redelivery is triggered by „Sruši workera” (connection closes → immediate requeue, redelivered=true, delivery count +1) or by a slow worker exceeding consumer_timeout (compressed, badge 'stvarno: 30 min').
        - Backoff runs through a „red za ponovni pokušaj (TTL + DLX)”.
        - When delivery-limit 20 is exceeded, the message goes to the DLX, or is dropped if there is none.
      - **SQS mode:** keeps the visibility timeout (default 30 s) and per-message delay.
    - **Scene concept:** "Visibility timeout is SQS's mechanism (default 30 s). RabbitMQ instead requeues on consumer disconnect and enforces consumer_timeout (default 30 min)."
    - **Zadatak:** „Nula dvostrukih narudžbi kad worker padne nakon kuhanja (RabbitMQ) ili kad obrada traje dulje od isteka vidljivosti (SQS)”.

16. **[MAJOR] L06 scenes[3] "Ključ idempotentnosti", insight, glossary "Idempotency"**
    - **Wrong:** "at-least-once + idempotent = effectively once" is presented as universal. It holds only for effects committed in the same transaction as the dedup record.
    - **Corrected concept:** "Order ID + unique constraint makes database effects effectively-once when the dedup row and the effect commit in one transaction. External effects (SMS gateway, card payment) need the provider's idempotency key or must tolerate an occasional duplicate:
      - record, then send → risk of loss
      - send, then record → risk of a duplicate
      
      The outbox pattern goes in a DeepDive."
    - **Sim:** add a separate counter „SMS poslan dvaput”.

17. **[MINOR] L06 keyFacts[3]: SQS FIFO**
    - **Corrected:** "SQS FIFO: strict order within a message group and send-deduplication within 5 min (AWS calls this exactly-once processing). A message not deleted before its visibility timeout is still redelivered, so consumers stay idempotent."

18. **[MINOR] L06 scenes[5] and misconceptions[4]**
    - **Corrected scene text:** "In a classic consumer group, consumers beyond the partition count sit idle. Kafka ≥4.2 share groups let more consumers than partitions share work, with per-message acks and no per-key order."
    - **Myth correction:** "KRaft production-ready since 3.3; ZooKeeper removed in 4.0 (March 2025)."

**L07**

19. **[MINOR] L07 hook**
    - **Wrong:** npm already isolates JavaScript dependencies per project, so the conflict only makes sense for a system library.
    - **Corrected:** "…API i worker trebaju dvije različite verzije sistemske biblioteke za obradu slika (libvips) koju instalira operacijski sustav…"

20. **[MAJOR] L07 scenes[3], scenes[4], sim "Napad na jezgru"**
    - **Wrong:**
      - Linux has eight namespace types, not seven; the time namespace is missing.
      - User namespaces do not stop a kernel exploit.
    - **Corrected scene[3]:** "seven lens toggles + note 'time namespace (rijetko)'."
    - **Corrected scene[4] spectrum:** "plain container → container with a user namespace (an escape lands as an unprivileged host UID; the kernel is still shared, so a kernel exploit still crosses) → gVisor (user-space kernel) → microVM (Kata, Firecracker) → full VM."
    - **Sim:** with user namespaces on, „Napad na jezgru” still cracks every container, but the attacker is labelled 'neprivilegirani korisnik na domaćinu'.

21. **[MINOR] L07 scenes[5] and misconceptions[4] (CPU architecture)**
    - **Corrected:** "On Apple silicon, Docker Desktop runs amd64 images under emulation (slower, sometimes broken). On an arm64 Linux node without emulation, an amd64-only image fails ('no matching manifest' or 'exec format error')."

**L08**

22. **[MAJOR] L08 flagshipSimulation.model 'Expected' and Zadatak "< 5 s"**
    - **Wrong:** In the correct order, a code edit invalidates `COPY . .`, so `RUN npm run build` (15 s) always re-runs. The rebuild takes about 16 s, not 2–3 s, and the "< 5 s" task is impossible.
    - **Corrected:** "Expected: `COPY . .` before `npm ci` → ≈56 s; correct order → ≈16 s (COPY 1 s + build 15 s)." Change the Zadatak to „Ponovna izgradnja nakon promjene koda < 20 s”. Alternative: lower the illustrative build time to 3 s and state ≈4 s.

23. **[MINOR] L08 model cache rule**
    - **Wrong:** "AND all layers above are CACHED" reads backwards against the stack visual, where the base is at the bottom.
    - **Corrected:** "AND every preceding instruction (all layers beneath it in the stack) is CACHED."

24. **[MAJOR] L08 scenes[2] "Tajna u sloju" and codeArtifacts[0]**
    - **Wrong:** The scene only says what not to do and gives no correct mechanism.
    - **Add:** "Build-time secrets via BuildKit secret mounts: `RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci`. The secret is never written to a layer. Runtime secrets arrive as env or files when the container starts (L16)."

25. **[MINOR] L08 keyFacts: imagePullPolicy and Bitnami**
    - **Corrected:**
      - "If imagePullPolicy is omitted, `:latest` (or no tag) defaults it to Always. Any other tag or a digest defaults to IfNotPresent. The default is set when the object is created."
      - "Bitnami images were copied to docker.io/bitnamilegacy from 28 Aug 2025 (with brownouts); the free docker.io/bitnami catalogue was removed on 29 Sep 2025."

**L09**

26. **[MAJOR] L09 model "else the writable layer"; codeArtifacts[0]; L19 codeArtifacts[1]**
    - **Wrong (two problems):**
      - The official postgres image declares VOLUME, so without a named volume Docker creates an anonymous volume. The rows do not sit in the writable layer.
      - postgres:18+ changed PGDATA to /var/lib/postgresql/18/docker and VOLUME to /var/lib/postgresql. A mount at the old /var/lib/postgresql/data path (every pre-2025 tutorial) does not hold the data.
    - **Corrected model:** "Without a named volume, the image's VOLUME creates an anonymous volume. Rows survive a container restart, but `docker rm db` or `down` + `up` attaches a fresh anonymous volume, so orders appear lost. The old volume is left dangling until `docker volume prune`. With a named volume at /var/lib/postgresql (postgres:18+), data survives `down`; `down -v` deletes it."
    - **compose.yaml and statefulset.yaml:** "mount at /var/lib/postgresql. A fresh cloud disk contains lost+found, so PGDATA must stay in a subdirectory (the 18+ default 18/docker does this)."

**L10 and L11**

27. **[MINOR] L10 scenes[3]**
    - **Corrected:** "Pods are replaced, not repaired (new name, new IP). Only the kubelet restarts a crashed container in place, inside the same Pod (L12)."

28. **[MAJOR] L10 bridgeToNext, L11 hook, L11 scenes[1] step 3**
    - **Wrong:** "pod/klopa-api created" means one bare Pod. Yet the hook describes two Pods, and step 3 and the replicas slider need a controller.
    - **Corrected L10 bridge:**
      > Lana napiše prve manifeste i pokrene kubectl apply. Terminal odgovori „pod/klopa-api created” i „pod/klopa-worker created” – ali aplikacija ne odgovara. Tko zapravo radi posao i gdje je zapelo?
    - **Corrected L11 hook start:**
      > „Created”, kaže terminal, ali klopa-api stoji u stanju Pending, a klopa-worker u ImagePullBackOff.
    - **Scene step 3:** "only when a controller owns the object (a Deployment creates a ReplicaSet, which creates Pods, L13); a bare Pod goes straight to the scheduler."
    - **Sim:** label the slider „replicas (ReplicaSet – više u L13)”.

29. **[MINOR] L11 model "kubelet on node-2 off"**
    - **Corrected:** "With the kubelet down, the containers on node-2 keep running. The node shows NotReady (Unknown). After the 300 s toleration its Pods are marked for deletion but stay Terminating, because no kubelet confirms. ReplicaSet-owned Pods are recreated elsewhere; StatefulSet Pods are not (L19)." Add „Ugasi čvor” as a separate button.

**L12**

30. **[MAJOR] L12 objectives[1], scenes[1], glossary "Pending"**
    - **Wrong:** The draft mixes Pod phase, kubectl STATUS reasons and the Ready condition. ImagePullBackOff is phase Pending; CrashLoopBackOff is usually phase Running.
    - **Corrected scene concept:** "Phase: Pending → Running → Succeeded/Failed. kubectl's STATUS column shows a reason instead:
      - Pending: not scheduled
      - ContainerCreating or ImagePullBackOff: scheduled, phase still Pending
      - Running
      - CrashLoopBackOff: phase Running, container waiting to restart
      
      Ready is a separate condition (READY 0/1 → 1/1)."
    - **Objective:** „prepoznati u stupcu STATUS Pending, ContainerCreating, ImagePullBackOff, Running i CrashLoopBackOff te ih razlikovati od faze Poda i uvjeta Ready”.
    - **Glossary Pending:**
      > Faza Poda koji je prihvaćen, ali još ne radi: čeka raspoređivanje (npr. nijedan čvor nema dovoljno nerezerviranih resursa) ili preuzimanje slike. U stupcu STATUS tada vidite Pending, ContainerCreating ili ImagePullBackOff; razlog piše u događajima Poda.

31. **[MAJOR] L12 codeArtifacts[1] "readiness may check dependencies"; Zadatak "Ispad baze od 60 s bez ijednog restarta"**
    - **Wrong:** A readiness probe on the DB takes every Pod out at once. The Service is left with 0 endpoints, and clients see connection errors instead of a clear 503.
    - **Corrected purpose:** "Liveness: only 'is this process alive' (no dependencies). Readiness: 'can this Pod serve right now' (warm-up, its own state, load shedding). Do not fail readiness on a shared dependency such as the DB; stay Ready and return 503 or a degraded response."
    - **Zadatak solution:** liveness on /healthz, readiness not tied to the DB. Show readiness-on-DB explicitly as the 0-endpoints anti-pattern.

**L14**

32. **[MAJOR] L14 objectives[1], scenes[1], model "Endpoints = … AND Ready", glossary "EndpointSlice"**
    - **Wrong:** EndpointSlices include not-ready Pods with conditions ready, serving and terminating. kube-proxy filters them out. Students running the `kubectl get endpointslices` artifact will see `ready: false` entries.
    - **Corrected objective:** „objasniti zašto Service šalje promet samo Podovima koji su u EndpointSliceu označeni kao spremni (ready) i kako to omogućuje uvođenje bez grešaka”.
    - **Glossary:**
      > Popis adresa Podova koji odgovaraju selektoru Servicea, svaka s uvjetima ready, serving i terminating. kube-proxy promet šalje samo spremnima; Pod koji padne na provjeri spremnosti ostaje na popisu s ready: false.
    - **Sim:** draw not-ready endpoints as dashed lines that carry no traffic.

33. **[MINOR] L14 Zadatak „Objasnite zašto mali čvor dobiva jednako prometa”**
    - **Corrected:** „Objasnite zašto svaki Pod dobiva jednako prometa bez obzira na veličinu čvora – i kako veći čvor ipak dobije više prometa (na njega stane više Podova, L17)”.

34. **[MINOR] L14 codeArtifacts[3] and scenes[5]**
    - **Wrong:** busybox nslookup is unreliable with search domains, and the K8s DNS-debugging docs use a dnsutils image instead.
    - **Corrected:** `kubectl run dnsutils --rm -it --image=registry.k8s.io/e2e-test-images/jessie-dnsutils:<tag> -- nslookup klopa-api` (pin the tag when authoring).
    - **scenes[5]:** "LoadBalancer stays pending on kind unless cloud-provider-kind runs."

**L15 (also L24)**

35. **[CRITICAL] L15 scenes[0], model "Beyond the Gateway, Service routing follows L14"; L24 scenes[1]**
    - **Wrong:** Most Gateway implementations bypass ClusterIP and kube-proxy. This includes Envoy Gateway, Istio, NGINX Gateway Fabric, Cilium and Traefik. They read the Service's EndpointSlices and send each request straight to a Pod IP with their own L7 algorithm.
    - **Corrected:** "The HTTPRoute names a Service, but the Gateway uses it only to look up ready endpoints and balances each request itself (round robin or least request, depending on implementation). The L04 algorithms come back here. kube-proxy's random per-connection choice applies to in-cluster ClusterIP traffic, not to traffic through the Gateway."
    - **L24 path:** "DNS → cloud LB → Gateway (TLS, HTTPRoute, endpoints from the Service's EndpointSlice) → Pod."

**L16**

36. **[MAJOR] L16 flagshipSimulation.model (access graph)**
    - **Wrong:** The graph misses the mechanism that actually makes Secret differ from ConfigMap. Inline env values and ConfigMaps are readable by anyone who can get Pods, Deployments or ConfigMaps, including the built-in `view` ClusterRole, which deliberately excludes Secrets.
    - **Add an eye:** „Ima ulogu view u Namespaceu (čita Podove, Deploymente i ConfigMape)”. It is red if the value is an env literal in the Pod spec or sits in a ConfigMap, and grey for a Secret.

37. **[MAJOR] L16 scenes[2], codeArtifacts[5], glossary "Secret"**
    - **Wrong:**
      - The docs mark aescbc as not recommended because of CBC padding-oracle attacks.
      - Local-key providers keep the key in a file on the control-plane host.
      - Base64 is the API representation, not how etcd stores the data.
    - **Corrected scene:** "identity (default, no encryption) → secretbox or aesgcm (local key in a file on the control-plane host) → KMS v2 (key in an external KMS, recommended). aescbc exists but is not recommended."
    - **Sim:** the etcd-backup thief turns grey with encryption on, but stays red for „Ukradi disk upravljačke ravnine” when the provider uses a local key.
    - **codeArtifacts[5]:** "kms v2 (secretbox for a self-managed lab)."
    - **Glossary:**
      > Objekt za osjetljive podatke poput lozinki. U API-ju i YAML-u vrijednosti su samo kodirane u base64, a u bazi etcd po zadanom leže nešifrirano; štite ga RBAC, šifriranje u mirovanju i vanjski trezori.

**L17**

38. **[MAJOR] L17 misconceptions[5] (in-place resize)**
    - **Wrong:** As written, it teaches that editing resources in deployment.yaml will not restart Pods.
    - **Corrected:** "Changing resources in a Deployment's Pod template still rolls out new Pods. In-place resize (GA 1.35) changes a running Pod through its resize subresource (`kubectl patch pod … --subresource resize`, or VPA InPlaceOrRecreate). Some changes, such as a memory decrease with the RestartContainer policy, still restart the container."

39. **[MAJOR] L17 model / breakIt "exact FailedScheduling message"**
    - **Wrong:** big-db also lacks memory on node-1 (2972Mi) and node-3 (6249Mi), so the message must list both reasons.
    - **Corrected:** `0/3 nodes are available: 2 Insufficient memory, 3 Insufficient cpu. preemption: 0/3 nodes are available: 3 No preemption victims found for incoming pod.` Copy the text verbatim from a real 1.37 kind run when authoring.

40. **[MINOR] L17 scenes[3] CFS example**
    - **Corrected:** "200m limit, 50 ms of work → ≈210 ms (20 ms of CPU per 100 ms period: 20 + 80 throttled + 20 + 80 throttled + 10)."

**L18**

41. **[MINOR] L18 scenes[4]**
    - **Corrected:** "KEDA's operator handles 0↔1 (activation); the HPA it creates handles 1↔N with desired = ceil(queueLength / target)."

**L19**

42. **[MAJOR] L19 model "after node failure an RWO volume must detach and attach (sim 20 s…)"; Zadatak „Sačuvajte narudžbe kroz pad čvora”**
    - **Corrected model:**
      - "The Pod is evicted only after the 300 s not-ready toleration, then stays Terminating because the kubelet is unreachable."
      - "A StatefulSet will not recreate db-N until the old Pod object is gone. That needs a manual force delete or the `node.kubernetes.io/out-of-service` taint (non-graceful node shutdown, GA 1.28), which also force-detaches the volume."
      - "A Deployment Pod gets a Multi-Attach error until the attach/detach controller force-detaches the volume after 6 min."
      - "Sim compresses this, with badge 'stvarno: 5–11 min ili dok netko ne intervenira'."
    - **Zadatak:** include the out-of-service step. Tie it to scene 6: this is why operators or a managed DB are recommended.

43. **[MINOR] L19 model „Obriši PVC” and „replicas: 3 za Postgres u Deploymentu”**
    - **Corrected:**
      - "PVC protection: a PVC in use stays Terminating until no Pod uses it, then the PV and disk are deleted (reclaim Delete)."
      - "With one shared RWO PVC, replicas: 3 gives Multi-Attach errors on other nodes, or two Postgres processes on one data directory on the same node (startup failure or corruption risk). Three separate databases happen only with per-Pod storage (no volume or emptyDir)."

**L20**

44. **[MINOR] L20 scenes[3] and model "by weights: exact per-request share"**
    - **Corrected:** "With HTTPRoute weights the share is set independently of Pod count. Each request goes to v2 with probability 5 %, so ≈5 % over many requests."
    - **Sim:** per-request random choice with p = weight / Σweights.

45. **[MAJOR] L20 scenes[3] and glossary "Blue-green deployment"**
    - **Corrected scene:** "A Service-selector flip is instant only for new connections. Existing keep-alive or HTTP/2 connections keep reaching blue Pods (conntrack, L14) until they close, so keep blue running until it drains. This is why Argo Rollouts has scaleDownDelaySeconds (30 s)."
    - **Glossary:**
      > Nova verzija pokrene se uz staru, a promet se prebaci na nju; nove veze odmah idu na novu verziju, a postojeće tek kad se zatvore. Povratak je brz, ali treba dvostruko resursa.

46. **[MINOR] L20 insight and misconceptions[5]**
    - **Corrected insight:** "Canary and blue-green aren't built into the Deployment object. You can do them by hand with two Deployments plus a Service selector or HTTPRoute weights, and automate them with Argo Rollouts or Flagger."
    - **Corrected myth:** "The API server receives ordinary objects. Helm renders them client-side (Helm 4 can use server-side apply) and keeps release history as Secrets in the namespace."

**L21**

47. **[MAJOR] L21 model "Digest = hash of commit + deps"**
    - **Wrong:** This contradicts "rebuild for prod → different digest".
    - **Corrected:** "Digest = sha256 of the image manifest, i.e. of the built content. Rebuilding the same commit later usually gives a different digest (timestamps, a newer base image behind the same tag, a new dependency patch). That is why we promote the tested digest instead of rebuilding."

48. **[MAJOR] L21 model "OIDC token expires at job end"**
    - **Corrected:** "Issued per job and scoped by the cloud trust policy (repo, branch, environment). It expires on its own after a short lifetime (AWS STS sessions default to 1 h, configurable down to 15 min). It is not revoked the instant the job ends, but nobody has to rotate it. A leaked token is usable only for its remaining lifetime (sim: 10 min)."

49. **[MAJOR] L21 misconceptions[3] "Pipeline neka radi kubectl apply u produkciju"**
    - **Wrong:** Push-based CD is legitimate and widely used, so it should not be presented as a myth.
    - **Replace with:** „CI s trajnim administratorskim ključem klastera jednako je siguran kao GitOps”.
    - **Correction:** "Push works, but CI holds powerful long-lived cluster credentials and nothing detects drift. Pull moves the credentials into the cluster and adds continuous reconciliation."
    - **DORA panel:** rename "time to restore" to "failed deployment recovery time".

**L22**

50. **[CRITICAL] L22 scenes[5], model fix "remove replicas or ignoreDifferences /spec/replicas", codeArtifacts[3]**
    - **Wrong:** Per the Argo CD docs, ignoreDifferences affects only the diff and status. During a sync the manifest is applied as-is, so the next sync (for example a new image tag) resets replicas and fights the HPA again.
    - **Corrected:** "Preferred: omit spec.replicas from the Deployment in Git. If it must stay, use ignoreDifferences on /spec/replicas together with `syncOptions: [RespectIgnoreDifferences=true]`."
    - **Add the K8s-docs gotcha:** "Removing replicas from an existing manifest can drop the Deployment to 1 replica once (the default), so follow the HPA migration procedure."

51. **[MINOR] L22 model and keyFacts "failed sync not retried on the same commit"**
    - **Corrected:** "…unless syncPolicy.retry is configured (exponential backoff)."

52. **[MAJOR] L22 scenes[0] (push vs pull)**
    - **Add:** "Pull moves the keys, it doesn't remove them. Anyone who can merge to the config repo can deploy to production, and Argo CD itself runs with broad cluster rights. Protect the repo with branch protection, required reviews and commit-signature verification (Argo CD 3.5 sourceIntegrity), and restrict Argo CD with AppProjects."

**L22 bridge and L23**

53. **[MAJOR] L22 bridgeToNext; L23 hook; L23 model "Lost private key → … app crashes"**
    - **Wrong:** A missing Secret does not crash the app; the container never starts.
      - secretKeyRef → CreateContainerConfigError
      - secret volume → stuck in ContainerCreating with FailedMount
    - **Corrected L22 bridge ending:** "…a kad se podigne novi klaster, API Podovi ne mogu ni krenuti – stoje u CreateContainerConfigError jer Secreta nema."
    - **L23 hook:** "…pa na novom klasteru API ne može ni krenuti."
    - **Model:** "→ no Secret → Pods stuck in CreateContainerConfigError or ContainerCreating."

54. **[MAJOR] L23 scenes[1] and keyFacts "keys renewed every 30 days"**
    - **Corrected:** "Every 30 days the controller adds a new sealing key. Old keys are kept, so existing SealedSecrets still decrypt. Renewal re-encrypts nothing and is not secret rotation. If the private keys leak, every SealedSecret ever committed becomes readable, so rotate the real values. Back up all keys (label sealedsecrets.bitnami.com/sealed-secrets-key)."

**L24 and glossary**

55. **[MINOR] L24 scenes[1] / Klopa karta 19 vs L19 scenes[5]**
    - **Wrong:** L24 runs Postgres as a StatefulSet while L19 recommends a managed DB for Klopa.
    - **Corrected:** Keep the StatefulSet for teaching, and add „u produkciji bi Klopa koristila upravljanu bazu ili operator (npr. CloudNativePG)”.

56. **[MINOR] L13 codeArtifacts[1]; L10 and L24 keyFacts; glossary**
    - **L13:** `rollout history` → "set the `kubernetes.io/change-cause` annotation; `--record` is deprecated."
    - **L10 and L24:** drop "1.34 EOL 2026-10-27" (the releases page lists only 1.35–1.37 as maintained). Write: "three most recent minors (1.35–1.37); each reaches EOL ≈14 months after release (1.37 → 28. 10. 2027.)."
    - **Glossary "Virtual machine":**
      > Računalo koje hipervizor virtualizira (uz hardversku podršku procesora, bez emulacije), s vlastitim operacijskim sustavom i jezgrom. Izolacija je jaka, ali svaki VM troši memoriju na cijeli OS.
    - **Glossary "Volume", add:** „U Kubernetesu trajnost ovisi o vrsti: emptyDir nestaje s Podom, PersistentVolume ga nadživi.”

**Checked and correct as written; no change needed:**
- Docker is not the Kubernetes runtime: dockershim removed in 1.24, cri-dockerd noted.
- ingress-nginx retired on 2026-03-24; Ingress is GA and frozen; Gateway API is primary.
- Secrets are not encrypted by default; the EKS default is noted as a managed exception.
- Kafka is KRaft-only since 4.0; share groups are production-ready in 4.2.
- ipvs is deprecated.
- Kubernetes Dashboard is archived; Headlamp is the successor.
- PodSecurityPolicy removed in 1.25.
- VPA `Auto` is deprecated.
- Compose v1 and the `version:` key are obsolete.
- `DOCKER_BUILDKIT` is no longer needed.
- Docker Hub limits: 100 per 6 h unauthenticated, 200 per 6 h Personal (confirmed).
- Kubernetes 1.37: HPA scale-to-zero beta, Metrics API GA (confirmed).
- Argo CD: refresh 120 s + 60 s jitter; selfHeal after 5 s (confirmed).
- RabbitMQ consumer_timeout default 30 min (confirmed).
- KCNA 44/28/16/12 (confirmed).
- All HPA, rollout, Erlang and availability arithmetic.

**Sources:**
- [EndpointSlice conditions](https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/)
- [Kubernetes v1.37 release](https://kubernetes.io/blog/2026/08/26/kubernetes-v1-37-release/)
- [Kubernetes releases](https://kubernetes.io/releases/)
- [Postgres image (PG18 PGDATA/VOLUME change)](https://hub.docker.com/_/postgres/)
- [Docker docs PR for the PG18 change](https://github.com/docker-library/docs/pull/2582/files)
- [Argo CD auto-sync](https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/)
- [Argo CD sync options (RespectIgnoreDifferences)](https://argo-cd.readthedocs.io/en/stable/user-guide/sync-options/)
- [RabbitMQ consumers](https://www.rabbitmq.com/docs/consumers)
- [Docker Hub usage](https://docs.docker.com/docker-hub/usage/)
- [GitHub OIDC](https://docs.github.com/en/actions/concepts/security/openid-connect)
- [KCNA program changes](https://training.linuxfoundation.org/kcna-program-changes/)
- [Istio: Envoy routes to endpoints directly](https://discuss.istio.io/t/does-envoy-route-service-call-to-the-service-pod-directly-or-does-it-go-through-the-kube-service-clusterip/1838)
- [Bitnami catalogue changes](https://community.broadcom.com/blogs/beltran-rueda-borrego/2025/08/18/how-to-prepare-for-the-bitnami-changes-coming-soon)
- [Bitnami postponement note](https://docs.rafay.co/blog/2025/09/04/important-update-changes-to-bitnami-public-catalog/)