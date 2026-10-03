# Kurikulum „Kubernetes od nule”: obavezne izmjene nakon recenzije

Napomene uz recenziju:
- U predavanjima su provjereni oblici obraćanja. Nigdje nema oblika „ti”. Zadaci su dosljedno u obliku „vi”, a kontrole u kratkom imperativu jednine. Taj dio ostaje kako jest.
- Prije recenzije provjereno je pet stvari:
  - `docs/AUTHORING.md`
  - postojeći prototip `src/lectures/02-load-balancer`
  - dokumentacija Kubernetesa o naglom gašenju čvora (non-graceful node shutdown) i forsiranom odvajanju diska nakon 6 min
  - dokumentacija Argo CD-a: selfHeal nakon 5 s, prune i selfHeal po zadanom isključeni, provjera Gita svakih 120 s uz do 60 s nasumičnog odmaka
  - specifikacija Gateway API-ja: nevažeći `backendRef` vraća HTTP 500

## A. Točnost: modeli simulacija i brojke koje si proturječe

**1. `runningExample` i L02/L04: Node.js ne odgovara modelu poslužitelja**
- **Problem:** klopa-api je zapisan kao Node.js/TypeScript. Simulacije L02 i L04 modeliraju poslužitelj s fiksnim skupom radnih procesa: jedan zahtjev po procesu, oko 256 MB po zahtjevu, a W ovisi o RAM-u. Hook u L02 („puno, a CPU na 15 %”) taj model izravno pripisuje Klopi. Za Node s event loopom to nije točno, pa simulacija uči nešto netočno.
- **Rješenje (preporuka):** promijeniti `runningExample.components`:
  - klopa-api (Python/Django iza gunicorna sa sinkronim radnim procesima: jedan zahtjev po procesu, oko 256 MB po procesu; upravo taj poslužitelj simuliraju L02 i L04)
  - klopa-worker (Python, potrošač iz reda preko knjižnice pika)
  - klopa-web (TypeScript frontend, izgrađen npm-om, poslužuje ga nginx)
- **Posljedice drugdje:**
  - L01: `localhost:3000` → `localhost:8000`. Artefakt „server.ts” postaje „gunicorn --bind 127.0.0.1:8000 ili 0.0.0.0:8000” (bash).
  - L05: artefakt „Sesije u Redisu” postaje Django `SESSION_ENGINE` → Redis (diff).
  - L06: potrošač u artefaktu koristi Python/pika.
  - L08: laboratorij predmemorije izgradnje ostaje na npm-u, ali za klopa-web (višefazno: node build → nginx). Dockerfile za klopa-api (pip) dolazi kao druga kartica.
  - L09: `8080:8000`.
  - L12: `/healthz` i `/ready` u Pythonu.
  - L14: paket ide na `10.244.2.15:8000`.
- **Ako Node mora ostati:** hook i prva scena L02 moraju eksplicitno reći da Davor Klopu pokreće iza poslužitelja s fiksnim skupom radnika. Postojeći DeepDive „vrijedi li to za Node.js?” tada postaje obavezan dio L02.

**2. L02.hook: brojke nisu moguće u vlastitom modelu**
- **Problem:**
  - Latencija od 80 ms nije moguća: preset I/O ima najmanje 1 050 ms, a preset API 500 ms.
  - p95 od 9 s nije moguć: istek klijenta je 5 s, a percentili se računaju samo nad uspješnim zahtjevima.
  - Hook spominje CPU na 15 %, što odgovara presetu I/O.
- **Ispravak hooka:** „Ponedjeljak, 12:00. Klopa radi na poslužitelju s dvije procesorske jezgre i 2 GB RAM-a. U 11:58 narudžba traje oko sekunde, a u 12:00 p95 naraste gotovo do 5 sekundi i počnu stizati greške 503 i 504. Davor otvori htop: procesor je na 15 %. Kako poslužitelj može biti pun dok procesor odmara?”
- **Isto vrijedi za karticu incidenta.** Zato u `styleGuide` treba dodati pravilo: „Every incident-card number must be reproducible in that lecture's sim with a stated preset and seed (store the seed on the card).”

**3. L06.hook: 445 narudžbi ne stane u deset sekundi**
- **Problem:** nalet od 15/s kroz 10 s je oko 170 narudžbi. Brojka 445 je zbroj cijelog validiranog izvođenja (oko 150 s).
- **Ispravak:** „SMS-gateway odgovara sve sporije, a API čeka svaki SMS, pa zapinju i narudžbe. Na Ćevap-petak narudžbe deset sekundi stižu po 15 u sekundi, a API istodobno može obrađivati samo četiri – od 445 narudžbi tog ručka izgubi se 152. Lana doda ponovne pokušaje – i teta Mira iz kuhinje viče: „Dvaput ćevapi za istu narudžbu?!” Kako odvojiti primanje narudžbe od posla koji slijedi, a da se ništa ne izgubi ni ne udvostruči?”
- Kartica simulacije mora prikazati trajanje izvođenja.

**4. L08: vremena izgradnje u modelu i hooku**
- **Problem:** `RUN npm run build` traje 15 s i nalazi se iza `COPY . .`, pa se izvodi kod svake promjene koda. Ispravan redoslijed tako daje oko 16 s, a ne 2–3 s, i zadatak „< 5 s” nije rješiv. Hook spominje „tri minute”, a model daje 56 s.
- **Ispravak modela:** „build 3 s (klopa-web, Vite); Expected: COPY . . before npm ci → code edit ≈44 s; correct order ≈4 s”.
- **Ispravak hooka:** „Iva je napisala prvi Dockerfile za klopu. Svaka promjena jednog retka koda znači 40-ak sekundi izgradnje, slika ima 1,1 GB, a Davor je u njoj pronašao datoteku `.env` s ključem za SMS-gateway. Uz to, `latest` na poslužitelju nije isti `latest` kao na Ivinom laptopu. Kako se slika zapravo gradi?”

**5. L10.flagshipSimulation.model: kapacitet ne odgovara priči**
- **Problem:**
  - 30 kontejnera na 5×6 = 30 mjesta znači da je klaster pun. Pad poslužitelja ne može se „popraviti u nekoliko ciklusa”, kako tvrdi `breakIt`.
  - Hook kaže „devet kontejnera” po poslužitelju, a model ima 6 mjesta.
  - Most iz L09 kaže „tri računala”, a model ima 5 poslužitelja.
- **Ispravak modela:** „3 servers × 14 abstract slots (42). Baseline api 9, worker 12, web 6 = 27 containers (9 per server). Seeded events: 03:00 server-2 fails → 28 slots for 27 (fits, one spare – callback to N+1 from L05); 08:00 Davor brings server-2 back repaired – existing containers are NOT moved back (Kubernetes does not rebalance running workloads); 10:00 api replaced by a new version; 12:00 api desired 9→15 for 1 h – new instances land mostly on server-2 (most free slots).”
- **Kontrola:** „Klizač željenog broja kopija po aplikaciji” → „Klizač željenog broja replika po aplikaciji”.

**6. L06: istek vidljivosti je ponašanje SQS-a, a Klopa koristi RabbitMQ**
- **Problem:** u RabbitMQ-u spori potrošač ne uzrokuje ponovnu isporuku. Poruka se vraća u red tek kad se zatvori kanal ili veza, ili kad istekne consumer timeout (zadano 30 min).
- **Ispravci:**
  - Kontrola „Klizač „Istek vidljivosti” 1–60 s” → „Klizač „Rok za potvrdu” 1–60 s”, uz natpis: „SQS: istek vidljivosti, zadano 30 s. RabbitMQ: neopotvrđena poruka vraća se u red kad se prekine veza potrošača ili istekne consumer timeout (zadano 30 min).”
  - Koncept scene „Potvrda i ponovna isporuka”: „redelivery deadline: SQS visibility timeout (default 30 s); RabbitMQ requeues on channel/connection close or consumer timeout (default 30 min)”.
  - Zadatak „Nula dvostrukih narudžbi uz istek vidljivosti 2 s” → „Nula dvostrukih narudžbi uz rok za potvrdu od 2 s”.

**7. L19: pad čvora nije točno modeliran**
- **Problem:** dokumentacija Kubernetesa navodi da Pod StatefulSeta na naglo ugašenom čvoru ostaje u stanju Terminating zauvijek, dok se čvor ne vrati, dok netko ne obriše Pod silom ili dok se čvor ne označi taintom `node.kubernetes.io/out-of-service`. Disk RWO forsirano se odvaja tek nakon 6 min.
- **Ispravak modela, dio za „Čvor pao”:** „Non-graceful node failure: node NotReady → after 300 s Pods are marked for eviction but stay Terminating (kubelet unreachable). Deployment+PVC: the ReplicaSet creates a replacement at once (terminating Pods not counted), but the RWO volume is still attached to the dead node → new Pod waits in ContainerCreating (Multi-Attach error) until force detach after 6 min. StatefulSet: db-N is NOT recreated (its name and PVC are still taken) until the node returns, the Pod is force-deleted, or the node gets the taint node.kubernetes.io/out-of-service (then Pods are force-deleted and volumes detached immediately). Badge: '20 s (sim) · stvarno: 5 min + do 6 min; StatefulSet čeka potvrdu da je čvor ugašen'.”
- **Nova kontrola:** „Označi čvor kao ugašen (out-of-service)”.
- **Dodatak uvidu (`insight`):** „…and a StatefulSet prefers 'never two db-1' over availability – after a sudden node loss someone must confirm the node is dead.”
- **Nova zabluda:** „StatefulSet se nakon pada čvora sam preseli” — its Pod stays Terminating until the node is confirmed down (out-of-service taint or force delete), so two Pods never share one identity and disk.

**8. L20: canary po replikama ne može ići u koracima od 5 %**
- **Problem:** s N = 4 najmanji udio canaryja po replikama je oko 20 % veza.
- **Ispravak modela:** „Canary by replicas: 4 stable + 1 canary ≈ 20 % of connections, then ≈33 %, 50 %, 100 %; requested steps snap to achievable ratios and show 'traženo 5 % → stvarno ~20 %'. Exact 5/25/50 % only in 'po težinama Gatewaya'.”
- **Ispravak `breakIt`:** „…canary with analysis stops near 5 % exposure with Gateway weights, near 20 % with replicas”.
- **Zadatak „< 50 korisnika”:** u opisu navesti da je rješiv samo načinom s težinama. To je i sam uvid lekcije.

**9. L17, scena „CPU se usporava, memorija ubija”: krivo izračunata latencija**
- **Ispravak:** „200m limit, 50 ms of work → ≈210 ms latency (20 ms per 100 ms period: 20 + 20 + 10)”. Prije je pisalo „~250 ms”.

**10. L01, kontrole i `breakIt`: DNS i vatrozid**
- **Problem:** krivi DNS zapis vodi na krivu adresu. NXDOMAIN se dobije samo kad zapis ne postoji. Vatrozid koji odbija vezu (REJECT) daje „refused”, a ne istek vremena.
- **Ispravci kontrola:**
  - „Prekidač „Krivi DNS zapis”” → „Prekidač „Nepostojeća domena (NXDOMAIN)””
  - „Prekidač „Vatrozid zatvara port”” → „Prekidač „Vatrozid odbacuje promet (DROP)””
- **Ispravak `breakIt`:** „NXDOMAIN appears instantly” → „NXDOMAIN arrives fast, after one DNS round trip”.

**11. L12.bridgeToNext: kratko ponovno pokretanje čvora ne briše goli Pod**
- **Problem:** nakon kratkog restarta čvora kubelet ponovno pokreće isti Pod.
- **Ispravak:** „Noćas je čvor-2 bio nedostupan dulje od pet minuta. Kubernetes je Podove s njega izbacio, a goli Pod s API-jem nitko nije ponovno stvorio. A Petra javlja: „Vegetarijanski meni mora biti vani danas u 11:00 – bez gašenja stranice.””

**12. Faza Pending u rječniku i u L12**
- **Rječnik, definicija „Pending”:** „Faza Poda koji je prihvaćen, ali mu kontejneri još ne rade: čeka da ga raspoređivač smjesti na čvor ili da se preuzme slika. Ako čeka čvor, razlog (npr. Insufficient cpu) piše u događajima Poda.”
- **L12, drugi cilj:** „prepoznati vrijednosti u stupcu STATUS naredbe `kubectl get pods`: Pending, ContainerCreating, Running, ImagePullBackOff i CrashLoopBackOff”.
- **L12, koncept scene „Životni ciklus i pad”, dodati:** „STATUS shows a reason (ContainerCreating, ImagePullBackOff) while the phase is still Pending”.

**13. L05, koncept scene „Prozor otkrivanja”**
- **Ispravak:** „ALB defaults 30 s/5 s/healthy 5/unhealthy 2 → detection 30–60 s after a crash, up to 65 s when the server hangs; back in rotation only after 5 passing checks (≈150 s)”.

**14. L21.flagshipSimulation.model, DORA metrike**
- „time to restore” zamijeniti trenutačnim nazivom: „failed deployment recovery time (vrijeme oporavka od neuspjelog postavljanja)”.

**15. L06.keyFacts, stavka o SQS-u**
- **Ispravak:** „SQS Standard: at-least-once, best-effort order; SQS FIFO: deduplication within a 5-minute window and order within a message group (AWS calls it 'exactly-once processing').”

**16. L22.subtitle: selfHeal je po zadanom isključen**
- **Ispravak:** „Ista petlja usklađivanja, razinu više: klaster sam povlači željeno stanje iz Gita i – ako to uključite – poništava ručne promjene.”

## B. Povezanost priče

**17. Veličine poslužitelja u L02 i L03 ne odgovaraju poslužiteljima iz L04**
- **Problem:** u L02 Davor kupi „najveći poslužitelj iz kataloga”, a L04 ima poslužitelje Mali 1/2, Srednji 2/4 i Veliki 4/8.
- **L02.bridgeToNext:** „Davor je poslužitelj zamijenio velikim, s četiri procesorske jezgre i 8 GB RAM-a. U petak u 12:03 pružatelj ima kvar napajanja i Klope nema dva sata, baš za ručak – a ispitni rok tek dolazi. „Kupimo drugi poslužitelj!””
- **L03.bridgeToNext:** „Drugi poslužitelj stoji i čeka jer DNS sve šalje na prvi. Davor u međuvremenu doda i treći: uz veliki (4 vCPU, 8 GB) Klopa sada ima mali (1 vCPU, 2 GB) i srednji (2 vCPU, 4 GB) poslužitelj. Netko mora dijeliti promet – i to pametno.”
- **Klopa karta 02:** „one VPS, resized 2 vCPU/2 GB → 4 vCPU/8 GB”.

**18. L10 → L11: jedan manifest Poda ne može dati dva Poda**
- **L10.bridgeToNext:** „Lana napiše prva dva manifesta, za API i za workera, i pokrene `kubectl apply`. Terminal odgovori „pod/klopa-api created” i „pod/klopa-worker created” – ali aplikacija ne odgovara. Tko zapravo radi posao i gdje je zapelo?”
- **L11.hook:** „Terminal kaže „created”, ali klopa-api stoji u stanju ImagePullBackOff, a klopa-worker u Pendingu. „Created” očito ne znači „radi”. Tko je primio Lanin zahtjev, tko bira čvor, tko povlači sliku – i tko je tu zapeo?”
- **L11.flagshipSimulation.model, dodati:** „Klizač replicas drives an object labelled 'ReplicaSet (pretpregled – detaljno u 13. predavanju)'; the scene also contains one bare Pod (klopa-worker) that is NOT replaced when deleted, even with the controller-manager on (plants L12).”
- **L11.bridgeToNext:** „Lana je ispravila tag i klopa-api nakratko piše Running – a onda se ruši, kubelet ga podiže sve sporije, a kad napokon radi, prvih 40 sekundi vraća greške jer puni predmemoriju. Što je točno Pod i kako Kubernetes zna je li aplikacija zdrava?”

**19. Lanac verzija 2.0.x**
- **Problem:** L20 kaže da canary zaustavlja 2.0.0 zbog greške u PDV-u. L24 tada „ispravlja popust” verzijom 2.0.1, koja je u `runningExample` hotfix za PDV.
- **`runningExample`:** „… → 2.0.0 'nova košarica' with a VAT bug, stopped by the canary (L20) → 2.0.1 VAT fix shipped through CI + Argo CD (L21–L22) → 2.0.2 hotfix for the Ćevap-petak discount (L24)”.
- **L24.hook:** „Petak, 11:55. Nova košarica 2.0.1 radi od jutra, ali popust za Ćevap-petak krivo se obračunava. Ispravak 2.0.2 mora biti vani prije 12:00. Pratimo jedan commit od Lanine tipkovnice do produkcije i jedan studentski zahtjev od mobitela do kuhinje – a na svakoj postaji pitamo: što ako ovdje pukne?”
- **L22, zadatak:** „Nova verzija samo commitom” → „Uvedite 2.0.1 samo commitom”.

**20. L23.hook: „pripravnik” je nepoznat lik**
- Priča o bus factoru već postoji s Davorom, pa se pripravnik zamjenjuje Davorom.
- **Ispravak:** „Lana je `secret.yaml` primijenila ručno, pa novi klaster ne zna lozinku i API se ruši. Netko je u međuvremenu u Git spremio Secret kodiran u base64 – brisanje commita ne uklanja ga iz povijesti. A kad je Davor otišao na Erasmus, zamjena ključa za SMS-gateway, koji je postojao samo na njegovu laptopu, trajala je dva dana. Kako tajne uklopiti u GitOps, a da ih nikad ne zapišemo u Git?”

**21. L05.hook: zašto Davor mijenja algoritam**
- L04 je završio s težinskim raspoređivanjem, pa hook mora objasniti prelazak na najmanje aktivnih veza.
- **Ispravak:** „12:03, veliki poslužitelj se srušio. Nakon pokusa sa „sporim diskom” Davor je prešao na algoritam najmanje aktivnih veza – i propalo je 37 narudžbi prije nego što je load balancer shvatio što se dogodilo. Istodobno studenti javljaju da im se košarica ispraznila i da su odjavljeni. Zašto load balancer kasni i gdje bi zapravo trebala živjeti košarica?”

**22. L19: upravljana baza ili StatefulSet**
- **Problem:** scena „Kad StatefulSet nije dovoljan” preporučuje upravljanu bazu, a Klopa karta 19 i L24 koriste Postgres u StatefulSetu.
- **Dodati u koncept scene:** „For production Klopa we recommend a managed database or a Postgres operator; in the course Postgres stays a StatefulSet so we can see the mechanics.”
- **Klopa karta 19 i put zahtjeva u L24:** „Postgres (StatefulSet u tečaju; u produkciji upravljana baza)”.

**23. L16 → L17: zašto su Podovi u Pendingu**
- **L16.bridgeToNext:** „Testno okruženje sada živi u istom klasteru, u Namespaceu klopa-staging. Ivini Podovi za test opterećenja rezerviraju po dvije jezgre, a novi worker za fotografije jela nema ograničenje memorije i pojede memoriju čvora-2. Produkcijski API Podovi umiru, a novi stoje u Pendingu, iako nadzor pokazuje da je procesor zauzet tek 30 %.”
- **L17.hook:** „Worker za fotografije pojeo je memoriju čvora-2, pa produkcijski API Podovi umiru s OOMKilled ili ih kubelet izbacuje. Novi Podovi stoje u Pendingu s porukom „0/3 nodes are available: 3 Insufficient cpu”, iako je procesor zauzet 30 % – jer Ivini testni Podovi rezerviraju jezgre koje ne troše. Kako raspoređivač odlučuje gdje ima mjesta – i tko kažnjava Pod koji uzme previše?”

## C. Pokrivenost zahtjeva

**24. Dockerizacija i kontejnerizacija su pretanko obrađene, a predavač ih je izričito tražio**
- **L08, novi prvi cilj:** „objasniti što znači kontejnerizirati (dockerizirati) aplikaciju i koji problem „kod mene radi” time rješavamo”.
- **L08, koncept scene „Slika i kontejner”, dodati:** „dockerizacija = Dockerfile → izgradnja slike → pokretanje; isti artefakt na laptopu i poslužitelju”.
- **Novi pojam u rječniku:** {"term":"Containerization","hr":"kontejnerizacija","definition":"Pakiranje aplikacije i svih njezinih ovisnosti u sliku kontejnera, tako da se svugdje pokreće jednako. Kad se to radi Dockerom, kaže se i dockerizacija."}
- U `glossaryTerms` lekcije L08 dodati „Containerization”.

**25. Događaji kao pojam nisu eksplicitni u L06**
- **L06, peti cilj:** „razlikovati naredbu (posao za jednog potrošača) i događaj (obavijest koju dobiva svaki pretplatnik) te red i objavi-pretplati; znati da log (Kafka) čuva poruke za ponovno čitanje”.
- **Koncept scene „Red, pub/sub ili log”, dodati:** „command „Skuhaj narudžbu 42” vs event „NarudzbaZaprimljena””.

**26. Observability nedostaje, a moderan uvodni tečaj je mora imati**
- Ograničenje na 24 lekcije ostaje. Zato se u L24 scena „Od regije do procesa” zamjenjuje novom scenom:
  - `{"title":"Tri signala: metrike, logovi, tragovi"`
  - `"kind":"interactive"`
  - `"concept":"Metrics say that (RED per service: Rate, Errors, Duration), traces say where (one request's waterfall), logs say why; a trace ID links them; Prometheus pulls metrics, OpenTelemetry is the standard for traces"`
  - `"visual":"Click a spike on a RED chart → logs filtered to that window → open the trace waterfall"}`
- **Novi cilj L24:** „razlikovati metrike, logove i tragove i znati što koji od njih otkriva”.
- **Novi pojam u rječniku:** {"term":"Observability","hr":"observability (uvid u stanje sustava)","definition":"Sposobnost da iz metrika, logova i tragova zaključimo što se događa unutar sustava. Metrike kažu da nešto ne valja, tragovi gdje, a logovi zašto."}

**27. U rječniku nedostaje pojam rollback**
- **Dodati:** {"term":"Rollback","hr":"vraćanje na prethodnu verziju (engl. rollback)","definition":"Povratak na zadnju ispravnu verziju. Deployment to ne radi sam, nego naredba kubectl rollout undo, alat poput Argo Rollouts ili, u GitOpsu, git revert."}
- U `glossaryTerms` lekcije L13 dodati „Rollback”.
- U `designRationale` broj pojmova promijeniti s 80 na 83.

## D. Redoslijed, unaprijedne reference i preduvjeti

**28. Popraviti preduvjete**
- 07: ["02","06"]
- 17: ["11","12","13","07"]
- 19: ["13","05","14","18"] (hook ovisi o tome da Cluster Autoscaler prazni čvor)
- 22: ["10","13","18","20","21"] (borba Argo CD-a i HPA-a, Kustomize)

**29. Ukloniti ili označiti unaprijedne reference**
- **L05:** iz koncepta scene „Gdje živi košarica” ukloniti „(Kubernetes equivalent sessionAffinity: ClientIP, 3 h)”, a iz keyFacts ukloniti stavku o `sessionAffinity`. Obje su već u L14.
- **L08.keyFacts:** iz stavke o referenci slike ukloniti „:latest makes imagePullPolicy Always”. Ta je činjenica već u L21.
- **L10, drugi kodni artefakt:**
  - naslov: „Željeno i stvarno stanje: kubectl get -w”
  - svrha: „READY 1/3 → 3/3: apply succeeded ≠ app running. Callout: objekt u primjeru je Deployment – upoznat ćemo ga u 13. predavanju.”
- **L12 `pod.yaml` i L13 `deployment.yaml`:** `requests` ostaje, jer ga AUTHORING traži. Dodati bilješku uz CodeBlock: „`requests` objašnjavamo u 17. predavanju; zasad: koliko Pod rezervira na čvoru.”

## E. Kognitivno opterećenje

**30. Trajanja su veća od `docs/AUTHORING.md` (25–35 min)**
- Deset lekcija traje 45 min, a L24 traje 50. Ukupno je oko 16 h. Ciljna trajanja i rezovi po lekcijama:
  - **L02 (35):** formulu A = MTBF/(MTBF+MTTR) premjestiti u L03. L02 zadržava samo tablicu nedostupnosti.
  - **L03 (35):** USL premjestiti u zatvoreni DeepDive. Koncept četvrte scene postaje „Shared bottleneck (DB); Amdahl p=0,95 → max 20× (model); USL in DeepDive”.
  - **L04 (45 → 40):**
    - Scenu „DNS kao load balancer?” spojiti s hook animacijom.
    - Ljestvica algoritama prikazuje Nasumično, Kružno, Težinsko kružno i Najmanje veza. Dva nasumična izbora i Najkraće vrijeme odgovora idu samo pod Napredno i u DeepDive.
    - Treći cilj: „usporediti kružno i težinsko raspoređivanje te algoritam najmanje aktivnih veza na istom prometu”.
  - **L05 (40 → 35):**
    - Scenu „Kamera prelazi na bazu” svesti na „state moved to the DB → DB is the new bottleneck and SPOF; cache-aside hit-ratio slider”. Replike za čitanje, kašnjenje replikacije i CAP idu u DeepDive.
    - Peti cilj: „objasniti zašto baza postaje usko grlo i kako pomaže predmemorija”.
    - Scena „Tko balansira load balancer?” postaje Callout. Gumb „Ugasi load balancer” ostaje.
  - **L06 (45 → 40):** Kafka podsimulaciju zamijeniti zatvorenim DeepDiveom „Za znatiželjne: log i Kafka” (Stepper s particijama, offsetima i kašnjenjem, bez simulacije grupa potrošača). Umnožavanje ponovnih pokušaja (27×) svesti na jednu rečenicu.
  - **L07 (35):** od imenskih prostora prikazati samo pid, net i mnt, a ostala četiri prebaciti u DeepDive. Spektar izolacije (gVisor, microVM, user namespaces) premjestiti u DeepDive.
  - **L08 (45 → 40):**
    - Scenu „Ispod haube” premjestiti u DeepDive, jer je L11 ponavlja.
    - Šesti cilj: „znati da Kubernetes pokreće iste OCI slike bez Dockera”.
  - **L12 (45 → 40):** scenu „Pomoćnici: init i sidecar” i zabludu o sidecaru premjestiti u DeepDive.
  - **L13 (45 → 40):** scenu „Tri riječi” svesti na Callout u sceni „Lanac vlasništva”. Cijela tema obrađuje se u L20.
  - **L14 (45 → 40):** u sceni „Vrste i tiho gašenje” zadržati ClusterIP, LoadBalancer i postupno gašenje. NodePort svesti na jedan redak, a headless Service premjestiti u L19.
  - **L16 (40).**
  - **L18 (45 → 40):** scenu „Vertikalno i trošak” svesti na Callout s jednim odlomkom o VPA. Karpenter u jednom retku.
  - **L20 (45 → 40):**
    - Helm svesti na Callout u jednom retku: „Helm: paketi predložaka; Argo CD ga renderira – 22. predavanje”. Kustomize overlays ostaju, jer ih koristi L22.
    - Šesti cilj: „objasniti kako Kustomize iz istih manifesta stvara inačicu za svako okruženje”.
  - **L22 (45 → 40):** Flux i AppProject po jedan redak. Sync waves u DeepDive.
  - **L23 (40 → 35):** scene „SOPS” i „Secrets Store CSI Driver i zašto ne dodatak u Argo CD-u” spojiti u jedan dijagram usporedbe „Ostale mogućnosti”. Sealed Secrets i ESO ostaju glavni putovi.
  - **L24 (50 → 45):** prema točki 26.
- Ukupno to daje oko 15 h, pa u `designRationale` treba ažurirati brojku. U AUTHORING §2 napisati: „25–35 min (lectures with a flagship simulation up to 40)”.

**31. Ukloniti sitnice iz keyFacts (načelo koherentnosti)**
- **L21:** stavku o pojeftinjenju hosted runnera za 39 %.
- **L08:** datume osnivanja OCI-ja i graduacije containerd-a. Zadržati „OCI specs; Docker donated runc”.
- **L06:** „4.3 uses only Khepri”.
- **L23:** dvije stavke o Vaultu (BSL i IBM, Vault 2.0) zamijeniti jednom: „Vault is BSL 1.1 since Aug 2023 (now IBM); OpenBao is the MPL-2.0 fork”.
- **L24:** popis statusa projekata u CNCF-u.

## F. Simulacije

**32. L04: predavačev primjer s 2 GB i 4 GB mora dati jasan uvid**
- Prije flagship simulacije dodati Predict:
  - pitanje: „Srednji poslužitelj (2 vCPU, 4 GB) i poslužitelj s 2 vCPU i 8 GB – koji obradi više API zahtjeva?”
  - točan odgovor: „Jednako, oko 10 u sekundi.”
  - objašnjenje: „Jezgre određuju propusnost; RAM pomaže tek kad zahtjevi dugo čekaju bazu – prebacite opterećenje na I/O.”
- Nakon toga odmah slijedi drugi zadatak.

**33. L09: namjerno nemoguć zadatak**
- „Preživite pad računala (namjerno nemoguće)” → „Pokušajte preživjeti pad računala”.
- Cilj se označava kao riješen kad student pritisne „Ugasi računalo” i otvori objašnjenje. Tako na ekranu nikad ne ostaje zadatak koji se ne može riješiti.

## G. Hrvatski jezik i nazivlje

**34. „Worker” ima dva značenja**
- U L02 i L04 worker je radni proces poslužitelja, a u L06 potrošač iz reda.
- **L02 i L04:** u tekstu „radnik (engl. *worker*)”, što već koristi postojeći prototip (pojam `worker`). Kontrola „Neograničeni workeri” → „Neograničeni radnici”.
- **L06:**
  - klizač „Workeri” → „Potrošači”
  - zadatak „… s najmanje workera” → „… s najmanje potrošača”
- **L18, cilj:** „skalirati workere po dubini reda” → „skalirati potrošače reda (klopa-worker) po dubini reda”.
- Riječ „worker” ostaje samo u imenu klopa-worker.

**35. Riječ „slika” sudara se sa slikom kontejnera**
- L02, kontrola „CPU (obrada slika)” → „CPU (obrada fotografija)”.
- L07.hook: „biblioteke za obradu slika” → „biblioteke za obradu fotografija”.
- Isto vrijedi i za natpis preseta u modelu.

**36. Kolokvijalni glagoli u kontrolama i tekstu**
- L16, kontrola „Commitaj secret.yaml” → „Spremi secret.yaml u Git”.
- L16, natpis u artefaktu „NE COMMITATI” → „NE SPREMATI U GIT”.
- L16, zabluda „Secret smijem commitati u Git” → „Secret smijem spremiti u Git”.
- L23, kontrola „Commitaj običan Secret” → „Spremi običan Secret u Git”.

**37. Množina od Service (styleGuide traži izbjegavanje)**
- L15.subtitle: „Jedna ulazna vrata za mnogo objekata Service – usmjeravanje po domeni i putanji, TLS i težine.”
- L15, zabluda: „Gateway zamjenjuje Serviceove” → „Gateway zamjenjuje objekte Service”.
- L14, zabluda: „Servicei se prate preko objekta Endpoints” → „Kubernetes prati Podove iza Servicea preko objekta Endpoints”.
- Rječnik, „Label”: „Deploymenti i Serviceovi pronalaze Podove” → „Deploymenti i objekti Service pronalaze Podove”.

**38. Health check se kroz kurikulum prevodi na dva načina**
- Ujednačiti na „provjera ispravnosti”.
- L09.subtitle: „Mreže, imena servisa, volumeni i provjere ispravnosti – i zašto jedno računalo i dalje nije dovoljno.”
- L09, četvrti cilj: „(depends_on s provjerom ispravnosti)”.

**39. Pojedinačni ispravci teksta**
- **Opis modula m5:** „Od commita do korisnika: strategije postavljanja, CI/CD, GitOps s Argo CD-om i upravljanje tajnama u GitOpsu.” Prijašnji tekst „u Gitu” proturječi poruci tečaja.
- **L01.bridgeToNext:** „s dvije jezgre” → „s dvije procesorske jezgre”. Riječ „jezgra” inače označava i jezgru operacijskog sustava.
- **L04:**
  - naziv flagship simulacije: „Load balancer u vašim rukama”
  - oznake algoritama: „Ručno, Nasumično, Kružno (round robin), Težinsko kružno, Najmanje veza, Težinski najmanje veza; Napredno: Dva nasumična izbora, Najkraće vrijeme odgovora”
  - zabluda „Balansira se uvijek po zahtjevu” → „Promet se uvijek raspoređuje po zahtjevu”
- **L06:**
  - „(15/s kroz 10 s)” → „(15/s tijekom 10 s)”
  - kontrola „SMS servis pao” → „SMS-gateway pao”
  - četvrti cilj: „postaviti ponovne pokušaje sa sve duljim, nasumično raspršenim razmakom (engl. *exponential backoff with jitter*) i red neobrađenih poruka”
- **L07.hook:** „Iva na laptopu ima Node 24, a poslužitelj stariju verziju” → „Iva na laptopu ima najnoviji Python, a na poslužitelju je verzija stara dvije godine”. Time u priči nema broja verzije.
- **L10.subtitle:** „Kubernetesu ne opisujete korake, nego ono što želite – a on to nikad ne prestaje provjeravati.” Izbacuje se konstrukcija „što da radi”.
- **L11, peti cilj:** „čitati stanje klastera naredbama `kubectl get` i `kubectl describe` i iz događaja te odvojiti okruženja Namespaceom”.
- **L13:**
  - naslov: „Deployment: replike, nove verzije i povratak”
  - subtitle: „Kako Kubernetes drži N replika živima i uvodi novu verziju bez gašenja – i zašto se sam ne vraća.”
  - treći cilj: „izračunati granice postupnog ažuriranja iz `maxSurge` (zaokružuje se naviše) i `maxUnavailable` (zaokružuje se naniže)”
- **L14.subtitle:** „Oznake, EndpointSlice, DNS i pravila na svakom čvoru – i zašto Service ne raspoređuje kružno.”
- **L17.subtitle:** „Raspoređivač gleda `requests`, jezgra provodi `limits` – i zašto čvor na 30 % CPU-a može biti pun.”
- **L17.hook:** „bivaju izbačeni” → „ili ih kubelet izbacuje” (prema točki 23).
- **L18:**
  - prvi cilj: „… i objasniti toleranciju i namjerno sporo smanjivanje broja replika”
  - drugi cilj: „… u odnosu na `requests`”
- **L19:**
  - subtitle: „… i zašto `replicas: 3` nije klaster baze.”
  - prvi cilj: „restart kontejnera” → „ponovno pokretanje kontejnera”
- **L20.title:** „Što je deploy: postavljanje, izdanje i strategije”. Mala početna slova u „deployment” krše styleGuide.
- **Rječnik, „Container”:** „Izolirani proces koji dijeli jezgru domaćina, a ima vlastiti pogled na datoteke, mrežu i druge procese. Nije mali virtualni stroj.” Prijašnja relativna rečenica bila je dvosmislena.
- **Rječnik, „Percentile”:** „p95 od 300 ms znači da je 95 % uspješnih zahtjeva trajalo 300 ms ili kraće. Percentili pokazuju spori rep koji prosjek skriva.”
- **Tagline (preporuka):** „Od jednog poslužitelja do klastera koji se sam popravlja – na primjeru aplikacije za menzu.”

**40. Kod u tekstu piše se kodnim fontom**
- U hookovima, mostovima i podnaslovima naredbe, datoteke, polja i tagovi pišu se u backtickovima. Hero i kartice incidenta moraju prikazivati inline kod. Mjesta:
  - L01 `localhost:8000`
  - L08 `.env`, `latest`
  - L09 `localhost:5432`, `docker rm`
  - L10 i L11 `kubectl apply`
  - L15 `deployment.yaml`
  - L17 `kubectl scale --replicas=12`
  - L19 `replicas: 3`
  - L21 `kubectl apply`, `kubectl edit`
  - L22 `kubectl edit`
  - L23 `secret.yaml`

**41. Uskladiti `docs/AUTHORING.md` s novim styleGuideom**
- **§3:** „Always distinguish Deployment from deploy / isporuka” → „Always distinguish *Deployment* (the object) from *postavljanje (engl. deploy)* (the activity); *isporuka* is software delivery in general (kontinuirana isporuka = continuous delivery).”
- Dodati pravilo „podatci (IHJJ) site-wide”.
- Natpis rekapitulacije u simulacijama: „Što ste upravo vidjeli”, a ne „Što si upravo vidio” iz istraživanja.

## H. Format specifikacije

**42. Zablude bez ispravka**
- StyleGuide traži hrvatsku rečenicu mita i engleski ispravak. Ispravci koji nedostaju:
- **L03:** „Svaka aplikacija treba mikroservise i Kubernetes” — many apps run fine on one server; distribute only when load, availability or geography demand it.
- **L04:** „Više RAM-a = veća propusnost” — RAM bounds concurrency, cores bound throughput (2/4 GB and 2/8 GB give the same ~10 rps on the API preset).
- **L05:**
  - „Load balancer odmah zna da je poslužitelj pao” — only after U consecutive failed checks: (U−1)·interval to U·interval, plus the timeout when the server hangs.
  - „Ljepljive sesije rješavaju stanje” — they skew load, lose sessions on crash and don't rebalance on scale-out; move state to Redis/DB.
  - „Replike za čitanje skaliraju i pisanje” — every write still goes to the primary; replicas lag and can return stale reads.
- **L06:**
  - „Red ubrzava obradu” — it absorbs bursts; if λ > kμ persists the backlog grows without bound; only more consumers add capacity.
  - „Svaka poruka stiže točno jednom” — at-least-once is the norm; redelivery after a crash or timeout is expected, so consumers must be idempotent.
- **L07:**
  - „Kontejner je lagani virtualni stroj” — an isolated host process with no kernel of its own (visible in the host's ps, same uname -r).
  - „Kontejneri izoliraju jednako kao VM-ovi” — they share the host kernel; a kernel exploit crosses containers, a VM stops at the hypervisor.
  - „Kontejneri su zamijenili VM-ove” — cloud nodes are usually VMs running containers.
  - „Docker na Macu radi nativno” — Docker Desktop runs Linux containers in a hidden Linux VM.
- **L08:**
  - „Slika i kontejner su isto” — immutable template (class) vs running instance with its own writable layer (object).
  - „Promjene u pokrenutom kontejneru se spremaju” — the writable layer is deleted with the container; data needs a volume, code needs a rebuild.
  - „RUN rm briše tajnu iz slike” — the file stays in the lower layer; the new layer only hides it.
  - „latest je fiksna, najnovija verzija” — a movable tag that can point to different digests on different machines.
  - „EXPOSE objavljuje port” — documentation only; publishing needs -p / ports.
- **L09:**
  - „Kontejneri razgovaraju preko IP adresa koje moram potražiti” — on a user-defined network services resolve each other by name.
  - „localhost u kontejneru je moje računalo” — each container has its own network namespace; localhost is the container itself.
  - „Treba docker-compose i version: '3.8'” — v1 has been dead since July 2023; use docker compose; the version key is ignored.
  - „restart: always znači visoku dostupnost” — it restarts containers on the same host only; a dead host moves nothing.
- **L10:**
  - „Kubernetes je container runtime / zamjena za Docker” — it orchestrates; containerd/CRI-O run containers, and Docker-built images still run.
  - „kubectl apply odmah sve napravi” — apply records desired state; controllers act asynchronously.
  - „Kubernetes izvršava plan korak po korak” — independent level-triggered loops converge on desired state.
  - „Kubernetes mi daje CI/CD, logove i bazu” — it builds no code and provides no CI/CD, middleware or databases (not a PaaS).
- **L11:**
  - „Upravljačka ravnina pokreće moje kontejnere” — it decides and records; the kubelet starts containers through the runtime.
  - „Ako padne upravljačka ravnina, padaju sve aplikacije” — running Pods keep serving; only healing, scheduling and changes stop.
  - „Raspoređivač pokreće kontejnere” — it only binds a Pod to a node.
  - „Komponente se pozivaju izravno” — everything watches the API server; only the API server talks to etcd.
  - „Kubernetes koristi Docker” — dockershim was removed in 1.24; runtimes are reached through CRI.
  - „master čvor” — say upravljačka ravnina; since 1.24 kubeadm uses only the control-plane label and taint.
- **L12:**
  - „Pod je kontejner” — one or more containers sharing an IP and volumes.
  - „Pod se popravi na mjestu i zadrži IP” — containers restart in place, but a replacement Pod has a new name and IP.
  - „Web i bazu stavimo u isti Pod” — they would scale and be replaced together.
  - „Provjera živosti treba provjeravati bazu” — a DB blip then restarts every Pod at once.
  - „Neuspjela provjera spremnosti restarta Pod” — it only removes the Pod from traffic.
  - „Bez provjera Kubernetes zna kad je aplikacija spremna” — without a readiness probe a Pod is Ready as soon as its container starts.
  - „Sidecar je samo još jedan kontejner u containers” — native sidecars are initContainers with restartPolicy: Always (GA 1.33).
- **L13:**
  - „Deployment i postavljanje su isto” — object vs act.
  - „Deployment se sam vraća na staru verziju” — the rollout stalls with ProgressDeadlineExceeded; rollback is rollout undo or tooling.
  - „Deployment izravno upravlja Podovima” — through ReplicaSets, which hold the revision history.
  - „minReadySeconds odgađa promet” — traffic follows Ready; it only delays 'Available'.
  - „Blue-green i canary ugrađeni su u Deployment” — only RollingUpdate and Recreate.
- **L14:**
  - „Service je proces ili kutija kroz koju prolazi promet” — a virtual IP implemented as rules on every node.
  - „Service raspoređuje round robin po zahtjevu” — a random backend per new connection.
  - „Service pokazuje na Deployment” — it selects Pods by labels; a typo gives 0 endpoints.
  - „type: LoadBalancer radi svugdje” — needs a cloud controller or add-on; stays pending on kind.
  - „Kratko ime radi iz svakog Namespacea” — only within the same Namespace.
  - Zabluda o objektu Endpoints (tekst prema točki 37) — EndpointSlices; the Endpoints API is deprecated since 1.33.
  - „Za performanse koristite ipvs” — deprecated since 1.35; nftables is the successor.
  - „gRPC se balansira po zahtjevu” — HTTP/2 keeps one long-lived connection pinned to one Pod.
- **L15:**
  - „Ingress je vrsta Servicea” — a separate API that needs a controller.
  - „F5-ov NGINX Ingress Controller isto je što i ingress-nginx” — a different, still-maintained project.
  - „Gateway zamjenjuje objekte Service” — Gateway routes to Services, and Services still select Pods.
- **L16:**
  - „Secreti su šifrirani” — base64 and unencrypted in etcd by default.
  - „Samo administratori, ili samo get, mogu čitati Secrete” — list/watch reveal contents and Pod creators can mount them.
  - „Promjena Secreta odmah mijenja aplikaciju” — env needs a restart, a volume updates eventually, subPath never.
  - „ConfigMap ili Secret, svejedno je” — separate RBAC, handling and encryption scope.
  - „Varijable okruženja najsigurniji su način” — env values leak into logs, dumps and child processes.
  - „Namespace je sigurnosna granica” — only together with RBAC, NetworkPolicy and Pod Security.
- **L17:**
  - „Raspoređivač gleda stvarnu potrošnju” — requests only.
  - „Limits se rezerviraju” — nothing is reserved; the kernel enforces limits at runtime.
  - „Prekoračenje CPU limita ubija kontejner” — it is throttled.
  - „Prekoračenje memorije samo usporava” — OOMKilled, exit 137.
  - „Bez requests je u redu” — BestEffort: packed anywhere, evicted first, invisible to the HPA.
- **L18:**
  - „HPA dodaje čvorove” — HPA adds Pods; the Cluster Autoscaler or Karpenter add nodes.
  - „Skaliranje je trenutačno” — Pods take seconds, nodes minutes, and scale-down waits 300 s.
  - „HPA na CPU-u može na nulu” — scale-to-zero needs object/external metrics.
  - „HPA radi bez requests” — utilisation is usage/request.
  - „PDB štiti od pada čvora” — it covers only voluntary evictions.
- **L19:**
  - „Datotečni sustav kontejnera je trajan” — it is lost on restart or replacement.
  - „Postgres s replicas: 3 je klaster baze” — it gives three independent databases.
  - „StatefulSet replicira podatke” — it gives identity only.
  - „Brisanje StatefulSeta briše podatke” — PVCs are retained by default.
- **L20:**
  - „Postavljanje = izdanje” — feature flags let you deploy dark and release later.
  - „Rollback je uvijek siguran” — irreversible migrations break the old version.
  - „Blue-green i canary ugrađeni su u Deployment” — they need a router and tooling.
  - „Staging je prošao, znači produkcija radi” — data, scale and config differ.
  - „Canary po replikama je točan postotak” — it is the Pod ratio per connection, with variance.
- **L21:**
  - „CI/CD je alat” — it is a practice.
  - „Testovi su neobavezni, CI je samo izgradnja” — without tests there is no feedback.
  - „Sliku izgradite posebno za svako okruženje” — a rebuild is a different artefact; promote one digest.
  - „latest je u redu” — movable and unauditable; it forces imagePullPolicy Always.
  - „Trajni ključevi u CI-ju su u redu” — prefer OIDC short-lived tokens.
  - „Pipeline neka radi kubectl apply u produkciju” — CI then holds cluster-admin and drift goes unseen.
- **L22:**
  - „Argo CD gradi i testira kod” — CI does that.
  - „Argo CD reagira odmah na push” — it polls every 120 s plus up to 60 s jitter unless a webhook is set up.
  - „GitOps = YAML u Gitu” — it also means pulled automatically and continuously reconciled.
  - „Moja ručna promjena ostaje / Auto-sync po zadanom vraća i briše” — drift shows as OutOfSync; it is reverted only with selfHeal and deleted only with prune, both off by default.
  - „Argo CD pokreće helm install” — it runs helm template.
  - „Flux je umro s Weaveworksom” — Flux is CNCF graduated and actively released.
- **L23:**
  - „Secret u base64 u privatnom repozitoriju je u redu” — every clone, backup and CI log can decode it.
  - „Obrisao sam commit, riješeno” — clones keep it; rotate the secret.
  - „Zapečaćena tajna sigurna je i unutar klastera” — once unsealed it is an ordinary Secret.
  - „Koristite argocd-vault-plugin” — Argo CD discourages it (plaintext in the Redis cache); no release since June 2024.
  - „Vault je open source pod MPL-om” — BSL 1.1 since August 2023; OpenBao is the MPL fork.
  - „External Secrets Operator je napušten” — releases resumed in September 2025 and continue.

**43. Analogije**
- Unose „Avoid…” ili „shown only as a myth” premjestiti u novo polje `avoidAnalogies`, da se ne prikazuju kao Analogy:
  - L04 „Avoid 'prometni policajac'…”
  - L10 „Dirigent – shown only as a myth…”
  - L16 „Sef ili zapečaćena omotnica – avoid…”
- Dodati dio „breaks down” gdje nedostaje:
  - **L14:** „Oznake kao hashtagovi, selektor kao spremljena pretraga. Breaks down: a selector matches only Pods in the Service's own Namespace and needs ALL listed key=value pairs to match exactly.”
  - **L21:** „Pokretna traka od tvornice do police, s gumbom ili bez (CD). Breaks down: nothing is copied or rebuilt between stations – the same image digest is promoted, and it can be taken back off the shelf (rollback) in seconds.”

**44. L24, format**
- Zablude razdvojiti u deset zasebnih unosa, svaki s ispravkom iz njegove lekcije.
- `glossaryTerms`: ["Observability"] umjesto pojmova koji se ponavljaju.
- `durationMin`: 45.

**45. Usvajanje u kodu**
- Postojeći prototip `src/lectures/02-load-balancer` treba preimenovati u `src/lectures/04-load-balancer`. Prema AUTHORING §1 ime mape mora biti točno `<id>-<slug>`.
- Prototip već koristi „radnik (engl. workers)” i DeepDive o Node.js-u. Treba ga uskladiti s točkama 1 i 34.