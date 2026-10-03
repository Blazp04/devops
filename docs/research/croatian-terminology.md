# Croatian terminology and style guide: "Kubernetes i raspodijeljeni sustavi"

*Researched 2026-10-01. The sources are listed at the end. The Croatian examples follow the rules in section 2: the "vi" form, IHJJ spelling and „…” quotation marks.*

## 0. What the research found

| Source | What it shows |
|---|---|
| **FER, course "Raspodijeljeni sustavi"** | Uses *raspodijeljeni sustav*, *model klijent-poslužitelj*, *programski posrednički sloj* (middleware), *komunikacija porukama*, *objavi-pretplati*, *replikacija i konzistentnost podataka*, *otpornost na neispravnosti*, *računarstvo u oblaku*, *mikroservisi*. Docker and Kubernetes take one week of the course. |
| **PMF Split (PMIC50)** | Uses *raspodijeljeni sustavi* and *posrednički vezni programi (middleware)*. |
| **FIDIT Rijeka (course and the GASERI materials by V. Miletić)** | The richest Croatian Docker and CI source. Uses *distribuirani sustavi*, *kontejner*, *slika (kontejnera)*, *registar*, *volumen*, *domaćin* (host), *gostujući OS*, *jezgra OS-a*, *virtualni stroj* (also *virtualna mašina*), *prostor imena* (namespace), *demon (engl. daemon)*, *izgradnja*, *kontinuirana integracija/isporuka*, *kontinuirano postavljanje*, *glavna grana*, *commita/commitova*, *brancha*. It addresses readers with **vi** ("naučit ćete", "Pokrenite", "Programer ste u timu…") and uses the inclusive **mi** ("Pokušajmo", "Uočimo da"). |
| **Split, OSS course "Razvoj mikroservisa"** | Uses *slike i kontejneri*, *Pisanje Dockerfilea*, *višekontejnerske aplikacije*, *volumei*, *virtualne mašine*. This shows how much usage varies. |
| **Struna (IHJJ)** | Few cloud or Kubernetes entries. *Skalabilnost, latencija, virtualizacija* and *hipervizor* return no results. The ICT entries come from the library-science project: *poslužitelj*, *zamjenski poslužitelj* (proxy), *zalihost* (redundancy), *računalstvo u oblaku*, *autentifikacija*, *vatrozid*, *repozitorij*. |
| **Croatian Wikipedia** | No articles on Kubernetes or Docker. The articles *Hipervizor*, *Virtualizacija* and *LXC* use *host/gost*, *gostujući OS*, *kernel (jezgra)*, *imenični prostori*, *cgroups*, *klaster*, *visoka dostupnost* and *točka kvara*. They also use the non-standard *operativni sustav*; standard Croatian is *operacijski*. |
| **Kubernetes documentation** | There is no Croatian localisation, so students will read the English docs. The Polish localisation declines object names as normal nouns (*Kubernetesa*, *w Kubernetesie*, *Pody*, *Deploymentu*). That is a direct Slavic precedent. |
| **Hrvatski pravopis (IHJJ), Microsoft Croatian style guide** | Govern spelling, declension, quotation marks, numbers and form of address (section 2). |
| **Not reachable** | Thesis repositories for FER, FOI, Algebra and VERI (Dabar) are behind a bot-verification page. I did not bypass it and used only titles and search snippets. No relevant course pages were found for FOI, FESB, TVZ or Algebra. RIT Croatia teaches in English. Croatian DevOps job ads are mostly written in English. |

**Legend for the "Note" column:**
- **HR**: use the Croatian term only.
- **HR (EN)**: use the Croatian term and add the English one in brackets the first time it appears in each lecture, e.g. *upravljačka ravnina (engl. control plane)*.
- **EN**: keep the English term (a proper name, a Kubernetes API kind, or no natural Croatian equivalent). Decline it using section 2.2.
- **EN (HR)**: keep the English term and add a Croatian gloss on first use.

---

## 1. Glossary

### A. Distributed-systems foundations

| English | Recommended form | Note | Example sentence |
|---|---|---|---|
| distributed system | **raspodijeljeni sustav** | HR (EN). FER and PMF-ST say *raspodijeljeni*; FIDIT says *distribuirani*. Both are correct. Use *raspodijeljeni* and mention *distribuirani* once. | Raspodijeljeni sustav korisniku izgleda kao jedna aplikacija, a iza nje radi mnogo računala povezanih mrežom. |
| scalability | **skalabilnost** | HR | Skalabilnost je sposobnost sustava da podnese veće opterećenje kad mu dodamo resurse. |
| vertical scaling (scale up) | **vertikalno skaliranje** | HR (EN). Avoid *okomito*, which reads as machine-translated. | Vertikalno skaliranje znači da poslužitelju s 2 GB RAM-a damo 8 GB – sve dok ne udarimo u strop. |
| horizontal scaling (scale out) | **horizontalno skaliranje** | HR (EN) | Horizontalnim skaliranjem ne kupujemo jači poslužitelj, nego dodajemo još jednakih. |
| load balancer | **load balancer** | EN (HR gloss: *program ili uređaj koji raspoređuje zahtjeve*). GASERI uses *balanser opterećenja*. Forms: *load balancera, load balanceru*; plural *load balanceri*. | Load balancer prima sve zahtjeve i šalje ih poslužiteljima koji ih u tom trenutku mogu obraditi. |
| load balancing | **raspodjela opterećenja** | HR (EN). FER uses *uravnoteženje opterećenja*, which is also fine but more formal. Note the noun *raspodjela* (-je-) against the verb *raspodijeliti* (-ije-). | Raspodjela opterećenja ne znači uvijek „svima jednako” – jači poslužitelj može dobiti više zahtjeva. |
| round robin | **kružno raspoređivanje** | HR (EN) | Pri kružnom raspoređivanju svaki sljedeći zahtjev ide sljedećem poslužitelju na popisu. |
| weighted round robin | **težinsko raspoređivanje** | HR (EN) | Poslužitelj s 4 GB RAM-a dobiva težinu 2, pa prima dvostruko više zahtjeva od onoga s 2 GB. |
| least connections | **najmanje aktivnih veza** | HR (EN) | Algoritam „najmanje aktivnih veza” novi zahtjev šalje poslužitelju koji trenutačno obrađuje najmanje zahtjeva. |
| throughput | **propusnost** | HR (EN). Explain it as "zahtjeva u sekundi". | Nakon dodavanja trećeg poslužitelja propusnost je porasla s 500 na 1 400 zahtjeva u sekundi. |
| latency | **latencija** | HR. Gloss as *kašnjenje* on first use. | Latencija je vrijeme od slanja zahtjeva do primitka odgovora; mjerimo je u milisekundama. |
| availability / high availability (HA) | **dostupnost / visoka dostupnost** | HR (EN). Croatian Wikipedia uses *visoka dostupnost*; some FER and PMF texts use *raspoloživost*. | Dostupnost od 99,9 % dopušta oko 43 minute nedostupnosti mjesečno. |
| fault tolerance | **otpornost na kvarove** | HR (EN). FER: *otpornost na neispravnosti*. Croatian Wikipedia: *tolerancija na pogreške*. | Sustav otporan na kvarove radi dalje i kad jedan poslužitelj padne. |
| single point of failure (SPOF) | **jedinstvena točka kvara** | HR (EN, SPOF) | Ako imamo samo jedan load balancer, on sam postaje jedinstvena točka kvara. |
| redundancy | **redundancija** | HR. Struna (ICT/library) has *zalihost*; mention it at most once. | Redundancija je namjerni višak: dva poslužitelja ondje gdje bi bio dovoljan jedan. |
| replica / replication | **replika / replikacija** | HR (FER) | Tri replike iste aplikacije rade na tri različita čvora. |
| consistency | **konzistentnost** | HR (FER) | Kad se podatci repliciraju, nastaje pitanje konzistentnosti: vide li svi korisnici istu vrijednost? |
| client / server | **klijent / poslužitelj** | HR. *Server* is fine in the simulator's UI labels and in speech. FER: *model klijent-poslužitelj*; Struna and Microsoft: *(web-)poslužitelj*. | Klijent šalje zahtjev, a poslužitelj vraća odgovor. |
| request / response | **zahtjev / odgovor** | HR | Ako odgovor ne stigne u roku od dvije sekunde, klijent odustaje od zahtjeva. |
| traffic | **promet** | HR. Never *saobraćaj*. | Promet naglo raste svake večeri između 20 i 22 sata. |
| bottleneck | **usko grlo** | HR | Baza podataka postala je usko grlo: svi poslužitelji čekaju na nju. |
| overload / crash | **preopterećenje / pad (rušenje)** | HR. The colloquial *poslužitelj je pao* is natural. | Preopterećeni poslužitelj s 2 GB RAM-a ostane bez memorije i padne. |
| downtime / outage | **nedostupnost / ispad** | HR (EN) | Svaki ispad u produkciji košta – zato ga izbjegavamo redundancijom. |
| failover | **preuzimanje rada** | HR (EN) | Pri preuzimanju rada rezervni poslužitelj automatski preuzima promet palog poslužitelja. |
| stateless / stateful | **bez stanja / sa stanjem** | HR (EN) | Aplikaciju bez stanja lako je skalirati jer je svejedno koja replika obradi zahtjev. |
| microservice / monolith | **mikroservis / monolit** | HR (FER, OSS Split) | Monolit smo razdvojili na pet mikroservisa koje možemo zasebno skalirati. |
| cache | **predmemorija** | HR (EN). GASERI: *sustav za predmemoriju*. Developers say *keš*. | Odgovor iz predmemorije stiže za milisekundu, a iz baze za pedeset. |
| cloud / cloud computing | **oblak / računarstvo u oblaku** | HR. FER and Croatian Wikipedia say *računarstvo*; Struna says *računalstvo*. | Upravljani Kubernetes u oblaku (npr. EKS, GKE ili AKS) skida nam brigu o upravljačkoj ravnini. |

### B. Queues and events

| English | Recommended form | Note | Example sentence |
|---|---|---|---|
| queue | **red (red čekanja)** | HR | Zahtjevi koji se ne mogu odmah obraditi čekaju u redu. |
| message queue | **red poruka** | HR (EN) | Red poruka razdvaja onoga tko šalje posao od onoga tko ga obavlja. |
| event | **događaj** | HR | Događaj „narudžba zaprimljena” objavljuje se jednom, a obrađuju ga tri različita mikroservisa. |
| event-driven architecture | **arhitektura vođena događajima** | HR (EN) | U arhitekturi vođenoj događajima servisi ne zovu jedni druge izravno, nego reagiraju na događaje. |
| message broker | **posrednik poruka** | HR (EN). Used as a thesis title at Riteh ("Posrednici poruka", 2022). | Posrednik poruka, npr. RabbitMQ ili Kafka, čuva poruke dok ih potrošač ne preuzme. |
| producer / consumer | **proizvođač / potrošač** | HR (EN). This is the classic operating-systems pair *proizvođač – potrošač*. | Proizvođač samo objavi poruku i nastavi dalje; ne čeka da je potrošač obradi. |
| publish/subscribe | **objavi-pretplati (pub/sub)** | HR (EN) (FER) | Model objavi-pretplati omogućuje da istu poruku primi više pretplatnika. |
| topic (Kafka) | **topic (tema)** | EN (HR). Forms: *topica, u topicu*. | Sve narudžbe objavljujemo u topic `orders`. |
| retry | **ponovni pokušaj** | HR (EN) | Nakon neuspjeha klijent malo pričeka pa pokuša ponovno, svaki put s duljim razmakom. |
| idempotent | **idempotentan** | HR. Add a one-line explanation. | Obrada uplate je idempotentna ako i dvostruko primljena poruka kupcu naplati samo jednom. |
| asynchronous / synchronous | **asinkron / sinkron** | HR | Pri asinkronoj komunikaciji korisnik ne čeka da se e-poruka pošalje, nego odmah dobije odgovor. |
| loose coupling / decoupling | **labava povezanost / razdvajanje** | HR (EN) | Red poruka omogućuje labavu povezanost: proizvođač ne mora znati tko su potrošači. |
| acknowledgement (ack) | **potvrda (ack)** | HR (EN) | Poruka ostaje u redu dok potrošač ne potvrdi da ju je obradio. |
| dead-letter queue (DLQ) | **red neobrađenih poruka (DLQ)** | HR (EN) | Poruka koja ni nakon pet pokušaja nije obrađena završava u redu neobrađenih poruka. |

### C. Containers and virtualisation

| English | Recommended form | Note | Example sentence |
|---|---|---|---|
| container | **kontejner** | HR. Do not use *spremnik*: in Croatian computing *spremnik/međuspremnik* means storage or buffer. | Kontejner je izolirani proces s vlastitim datotečnim sustavom u kojem je sve što aplikaciji treba. |
| containerization | **kontejnerizacija** | HR (GASERI) | Kontejnerizacija znači zapakirati aplikaciju i sve njezine ovisnosti u sliku kontejnera. |
| container image | **slika kontejnera** (short: *slika*) | HR (EN *image*). Used by GASERI and OSS Split. It declines naturally, while *imagea* is unreadable. Do not use *slika* for figures in the lectures; call those *prikaz, dijagram, animacija*. | Iz jedne slike kontejnera možemo pokrenuti stotinu jednakih kontejnera. |
| layer | **sloj** | HR | Svaka naredba `RUN` u Dockerfileu dodaje novi sloj slike. |
| registry | **registar** | HR (EN) (GASERI) | Gotovu sliku šaljemo u registar, npr. na Docker Hub. |
| tag | **tag** | EN. Forms: *taga*; plural *tagovi*. Do not translate it as *oznaka*, which is reserved for *label*. | Tag `latest` ne jamči najnoviju verziju – to je samo dogovoreno ime. |
| Dockerfile | **Dockerfile** | EN. Forms: *Dockerfilea, u Dockerfileu* (the silent -e stays; OSS Split writes *Pisanje Dockerfilea*). | U Dockerfileu redom opisujemo kako se slika gradi. |
| build (an image) | **izgradnja; izgraditi sliku** | HR (EN) (GASERI) | Izgradnja slike prvi put traje dulje; poslije se nepromijenjeni slojevi uzimaju iz predmemorije. |
| pull / push | **povući sliku / poslati sliku u registar** | HR (EN) | Prije pokretanja kontejnera čvor mora povući sliku iz registra, ako je već nema. |
| virtual machine (VM) | **virtualni stroj (VM)** | HR (EN). GASERI and Croatian Wikipedia; *virtualna mašina* is colloquial. Form: *VM-a*. | Svaki virtualni stroj pokreće cijeli vlastiti operacijski sustav, pa zauzima više memorije i sporije se pokreće. |
| hypervisor | **hipervizor** | HR. GASERI also uses *monitor virtualnih strojeva*. | Hipervizor dijeli procesor i memoriju fizičkog računala između virtualnih strojeva. |
| host / guest | **domaćin / gost (gostujući OS)** | HR (EN). GASERI: *operacijski sustav domaćina*, *gostujući operacijski sustav*. | Svi kontejneri na jednom domaćinu dijele istu jezgru operacijskog sustava. |
| kernel | **jezgra (operacijskog sustava)** | HR (EN). Keep it distinct from *procesorska jezgra* (CPU core), which matters in the RAM/CPU simulator. | Kontejner nema vlastitu jezgru – koristi jezgru domaćina. |
| CPU core / RAM | **procesorska jezgra / radna memorija (RAM)** | HR. Forms: *RAM-a, CPU-a*. GASERI: *jednu procesorsku jezgru i 2 GB radne memorije*. | Dodajte poslužitelj s dvije procesorske jezgre i 4 GB RAM-a. |
| namespace (Linux) | **imenski prostor** | HR (EN). GASERI says *prostor imena*, Croatian Wikipedia *imenični prostor*; settle on one. Never confuse it with the Kubernetes `Namespace`. | Imenski prostori određuju što proces vidi: druge procese, mrežu i datotečni sustav. |
| cgroup | **kontrolna grupa (cgroup)** | HR (EN) | Kontrolne grupe ograničavaju koliko procesora i memorije kontejner smije potrošiti. |
| OS-level virtualization | **virtualizacija na razini operacijskog sustava** | HR (GASERI, Croatian Wikipedia) | Kontejneri su virtualizacija na razini operacijskog sustava, a virtualni strojevi hardverska virtualizacija. |
| container runtime | **izvršno okruženje za kontejnere** | HR (EN) | Agent `kubelet` ne pokreće kontejnere sam, nego to prepušta izvršnom okruženju, npr. alatu `containerd`. |
| volume | **volumen** | HR (GASERI). Avoid *volume/volumei*. | Podatci zapisani izvan volumena nestaju zajedno s kontejnerom. |
| environment variable | **varijabla okruženja** | HR (GASERI) | Adresu baze aplikaciji predajemo kao varijablu okruženja. |
| port / port mapping | **port / preslikavanje porta** | HR | Opcija `-p 8080:80` preslikava port 8080 domaćina na port 80 u kontejneru. |
| daemon | **pozadinski proces** | HR (EN *daemon*). GASERI uses *demon*. | Dockerov pozadinski proces prima naredbe od klijenta `docker`. |

### D. Kubernetes

| English | Recommended form | Note | Example sentence |
|---|---|---|---|
| orchestration | **orkestracija** | HR. A FER thesis title: "Sigurnosni aspekti sustava za orkestraciju Kubernetes". | Orkestracija je automatsko upravljanje stotinama kontejnera: gdje će se pokrenuti, koliko ih treba i što ako padnu. |
| Kubernetes (K8s) | **Kubernetes** | EN (proper name). Forms: *Kubernetesa, u Kubernetesu*; possessive adjective *Kubernetesov*. Use *K8s* only in labels. | U Kubernetesu ne pokrećemo kontejnere ručno – opišemo što želimo, a Kubernetes to ostvari. |
| cluster | **klaster** | HR (a settled loanword, used in Croatian Wikipedia and FER theses). Not *grozd*, which Struna lists only for physics and chemistry. | Klaster čine upravljačka ravnina i nekoliko radnih čvorova. |
| node | **čvor** | HR. Write *Node* only for the API object (`kubectl get nodes`). | Kad čvor otkaže, kontroleri na ostalim čvorovima stvaraju nove Podove umjesto izgubljenih. |
| control plane | **upravljačka ravnina** | HR (EN). Established in Croatian networking/SDN texts (*upravljačka i podatkovna ravnina*). It declines cleanly, unlike *control planea*. | Upravljačka ravnina odlučuje gdje će se koji Pod pokrenuti, ali sama ne izvodi aplikacije. |
| worker node | **radni čvor** | HR (EN) | Aplikacije se izvode na radnim čvorovima. |
| API server | **API poslužitelj** (`kube-apiserver`) | HR (EN). An abbreviation before a noun takes no hyphen and is not declined. | Sve komponente komuniciraju s klasterom isključivo preko API poslužitelja. |
| scheduler | **raspoređivač** | HR (EN) | Raspoređivač traži čvor na kojem ima dovoljno nerezerviranih resursa za novi Pod. |
| etcd, kubelet, kubectl | **`etcd`, `kubelet`, `kubectl`** | EN in code font, never declined. Put a Croatian head noun before them. | Agent `kubelet` na svakom čvoru pokreće kontejnere, a stanje cijelog klastera čuva se u bazi `etcd`. |
| Pod | **Pod** | EN (API kind). Always capital P, to avoid a clash with *pod* (floor, under). Forms: *Poda, u Podu, Podom*; plural *Podovi, Podova*. | Pod je najmanja jedinica koju Kubernetes raspoređuje; u njemu je najčešće jedan kontejner. |
| Deployment (object) | **Deployment** | EN (API kind). Forms: *Deploymenta, u Deploymentu*; plural *Deploymenti, Deploymenata*. Keep it separate from the act of deploying (section E). | U Deploymentu navodimo da želimo tri replike, a Kubernetes se brine da ih uvijek bude tri. |
| ReplicaSet | **ReplicaSet** | EN. Forms: *ReplicaSeta*; plural *ReplicaSetovi*. | Deployment ne upravlja Podovima izravno, nego preko ReplicaSeta. |
| StatefulSet | **StatefulSet** | EN | Baze podataka obično pokrećemo kao StatefulSet jer svaka replika treba stalno ime i vlastiti volumen. |
| DaemonSet | **DaemonSet** | EN | DaemonSet pokreće po jedan Pod na svakom čvoru – idealno za prikupljanje logova. |
| Job / CronJob | **Job / CronJob** | EN. Forms: *Joba, Jobovi; CronJoba*. | Job pokreće Pod koji obavi zadatak i završi, a CronJob to ponavlja po rasporedu. |
| Service (object) | **Service** | EN (API kind). Never *usluga*. Forms: *Servicea* [servisa], *u Serviceu, Serviceom*; the rule that keeps a silent final -e also gives *Pierre → Pierrea*. In awkward oblique cases you can write *objekt Service*. The generic word is *servis/usluga*. | Service skupini Podova daje jednu stalnu adresu i raspoređuje promet među njima. |
| Ingress | **Ingress** | EN. Forms: *Ingressa, u Ingressu*. The Ingress API still exists, but the widely used ingress-nginx controller is retired: best-effort maintenance ended in March 2026. Gateway API is the recommended successor. | Ingress usmjerava HTTP zahtjeve na odgovarajući Service prema domeni i putanji. |
| Gateway (Gateway API) | **Gateway, Gateway API** | EN. Forms: *Gatewaya, u Gatewayu, Gatewayem*, with no inserted *j* (like *Hemingway – Hemingwaya*). A network gateway in general is *pristupnik*. | Nove klastere sve češće konfiguriramo preko Gateway API-ja umjesto Ingressa. |
| Namespace (Kubernetes) | **Namespace** | EN. Forms: *Namespacea, u Namespaceu*. Not the Linux *imenski prostor*. | Timovi dijele isti klaster, ali svaki radi u svojem Namespaceu. |
| ConfigMap | **ConfigMap** | EN. Forms: *ConfigMapa, u ConfigMapu*; plural *ConfigMapovi*. | Postavke koje nisu tajne, npr. adresu vanjskog API-ja, spremamo u ConfigMap. |
| Secret (object) | **Secret** | EN for the object; the concept in general is *tajna*. Forms: *Secreta, u Secretu*; plural *Secreti*. | Secret je po zadanim postavkama samo kodiran u base64, a ne šifriran. |
| PersistentVolume / PersistentVolumeClaim | **PersistentVolume (trajni volumen) / PersistentVolumeClaim (zahtjev za volumenom)** | EN (HR) | Pod traži prostor za podatke preko PersistentVolumeClaima, a klaster mu dodjeljuje odgovarajući PersistentVolume. |
| StorageClass | **StorageClass (klasa pohrane)** | EN (HR) | StorageClass određuje kakav se disk automatski stvara za svaki novi PersistentVolumeClaim. |
| label | **oznaka** | HR (EN). Not *labela* or *etiketa*. | Svim Podovima naše aplikacije dodajemo oznaku `app: web`. |
| selector | **selektor** | HR | Service pronalazi svoje Podove pomoću selektora `app: web`. |
| manifest | **manifest** | HR | YAML manifest opisuje jedan ili više objekata u Kubernetesu. |
| declarative / imperative | **deklarativno / imperativno** | HR | Deklarativno kažemo što želimo, a imperativno kako to postići, korak po korak. |
| desired state | **željeno stanje** | HR (EN) | U YAML-u opisujemo željeno stanje, a ne korake kojima se do njega dolazi. |
| actual state | **stvarno stanje** | HR (EN). For "current", normative style prefers *trenutačno* over *trenutno*. | Kontroler neprestano uspoređuje stvarno stanje sa željenim. |
| reconciliation loop | **petlja usklađivanja** | HR (EN) | Petlja usklađivanja nikad ne staje: promotri, usporedi, ispravi – i tako ispočetka. |
| controller | **kontroler** | HR | Kontroler primijeti da nedostaje jedan Pod i odmah stvori novi. |
| self-healing | **samooporavak** | HR (EN) | Samooporavak nije magija, nego petlja usklađivanja koja radi bez prestanka. |
| health check | **provjera ispravnosti** | HR (EN) | Load balancer svakih pet sekundi šalje provjeru ispravnosti i prestaje slati promet poslužitelju koji ne odgovara. |
| liveness / readiness / startup probe | **provjera živosti / spremnosti / pokretanja** | HR (EN). Field names stay English in code. | Dok provjera spremnosti ne prođe, Service tom Podu ne šalje promet. |
| autoscaling / HPA | **automatsko skaliranje; HorizontalPodAutoscaler (HPA)** | HR (EN). Form: *HPA-a*. | HorizontalPodAutoscaler dodaje replike kad prosječno opterećenje procesora prijeđe 70 %. |
| resource requests / limits | **`requests` (zajamčeni minimum) / `limits` (gornja granica)** | EN (HR). Do not translate *request* as *zahtjev*: it would clash with the HTTP *zahtjev*. | Ako u `requests` zatražimo 2 GiB memorije, raspoređivač će Pod smjestiti samo na čvor na kojem je još toliko nerezervirano; kontejner koji prijeđe `limits` za memoriju jezgra prekida (OOMKilled). |
| rolling update | **postupno ažuriranje** | HR (EN). Use *postupno*, not *postepeno*. | Pri postupnom ažuriranju Kubernetes stare Podove zamjenjuje novima malo-pomalo, pa aplikacija cijelo vrijeme radi. |
| rollback | **vraćanje na prethodnu verziju** | HR (EN *rollback*) | Ako nova verzija ruši Podove, naredba `kubectl rollout undo` vraća prethodnu. |
| workload | **radno opterećenje** | HR (EN) | Deployment, StatefulSet i DaemonSet služe za različite vrste radnih opterećenja. |
| sidecar | **pomoćni kontejner** | HR (EN) | Pomoćni kontejner u istom Podu skuplja logove glavne aplikacije i šalje ih dalje. |

### E. Deployment, CI/CD and GitOps

| English | Recommended form | Note | Example sentence |
|---|---|---|---|
| deployment (the act) | **postavljanje (nove verzije)** | HR (EN *deploy*). GASERI: *kontinuirano postavljanje*. Avoid *implementacija* (which means writing code) and *raspoređivanje* (which means scheduling). | Postavljanje nove verzije trebalo bi biti dosadno: spojimo pull request, a sve ostalo ide automatski. |
| release | **izdanje; objaviti izdanje** | HR (EN) (GASERI) | Izdanje 2.3 donosi novu stranicu za plaćanje. |
| rollout | **uvođenje (nove verzije)** | HR (EN) | Uvođenje nove verzije možemo pauzirati ako se pojave pogreške. |
| canary / blue-green | **canary izdanje / plavo-zeleno postavljanje** | EN / HR (EN) | Canary izdanje najprije dobiva 5 % prometa; ako je sve u redu, postupno preuzima ostatak. |
| continuous integration (CI) | **kontinuirana integracija (CI)** | HR (EN) (GASERI) | Kontinuirana integracija znači da se svaka promjena odmah izgradi i testira. |
| continuous delivery / deployment (CD) | **kontinuirana isporuka / kontinuirano postavljanje** | HR (EN). Forms: *CI/CD-a, u CI/CD-u*. | Pri kontinuiranoj isporuci svaka je promjena spremna za produkciju; pri kontinuiranom postavljanju ondje i automatski završi. |
| pipeline | **pipeline** | EN (HR gloss: *niz automatiziranih koraka*; *cjevovod* also acceptable). Forms: *pipelinea, u pipelineu*. | Svaki commit pokreće pipeline: izgradnju, testove i objavu slike u registar. |
| build (CI) | **izgradnja** | HR (EN) | Ako izgradnja ne uspije, pipeline staje i ništa ne odlazi u produkciju. |
| artifact | **artefakt** | HR | Artefakt ovog pipelinea je slika kontejnera s tagom jednakim hashu commita. |
| environment (dev / staging / prod) | **okruženje: razvojno, testno (staging), produkcijsko** | HR (EN). The colloquial *u produkciji* is fine. | Promjena najprije ide u testno okruženje, a tek nakon provjere u produkcijsko. |
| repository | **repozitorij** | HR (Struna, GASERI) | Konfiguracija klastera nalazi se u zasebnom Git repozitoriju. |
| commit | **commit** | EN. Forms: *commita*; plural *commitovi, commitova* (GASERI). In prose write *napraviti commit*, not *commitati*. | Svaki commit u glavnu granu pokreće novi pipeline. |
| branch / merge | **grana / spajanje** | HR (EN). GASERI: *glavna grana*. | Kad granu spojimo u `main`, pokreće se postavljanje. |
| pull request / merge request | **pull request (PR)** | EN (HR gloss: *zahtjev za spajanje*) | Kolegica pregleda pull request prije nego što ga spojimo. |
| GitOps | **GitOps** | EN. Forms: *GitOpsa, u GitOpsu*. | U GitOpsu Git repozitorij postaje jedini izvor istine o stanju klastera. |
| Argo CD | **Argo CD** | EN. The official spelling has a space, not *ArgoCD*. Forms: *Argo CD-a, u Argo CD-u*. | Argo CD neprestano uspoređuje ono što piše u Gitu s onim što stvarno radi u klasteru. |
| source of truth | **izvor istine** | HR | Ako Git kaže tri replike, a u klasteru ih radi pet, vrijedi ono što piše u Gitu. |
| drift | **odstupanje** | HR (EN) | Ručna promjena naredbom `kubectl edit` stvara odstupanje koje Argo CD prikazuje kao OutOfSync. |
| sync | **sinkronizacija** | HR (EN). Status names (*Synced, OutOfSync*) stay English, as in the tool. | Nakon sinkronizacije klaster ponovno odgovara stanju u repozitoriju. |
| Helm chart | **Helm chart** | EN. Form: *charta*. | Helm chart je paket predložaka iz kojih nastaju manifesti. |

### F. Secrets and security

| English | Recommended form | Note | Example sentence |
|---|---|---|---|
| secret (concept) | **tajna** | HR (passwords, keys, tokens) | Tajne nikad ne spremamo u Git u otvorenom obliku. |
| secret management | **upravljanje tajnama** | HR (EN) | Upravljanje tajnama odgovara na pitanja gdje tajna živi, tko joj smije pristupiti i kako je mijenjamo. |
| credentials | **vjerodajnice** | HR (Microsoft terminology) | Vjerodajnice za bazu aplikacija čita iz Secreta, a ne iz koda. |
| encoding vs encryption | **kodiranje vs šifriranje** | HR. A key distinction to teach. Use *šifriranje* consistently; *enkripcija* is common in speech. | Base64 je kodiranje, a ne šifriranje: svatko ga može dekodirati jednom naredbom. |
| encryption at rest / in transit | **šifriranje u mirovanju / u prijenosu** | HR (EN) | Šifriranje u mirovanju štiti Secrete u bazi `etcd` ako netko dođe do diska ili sigurnosne kopije. |
| RBAC | **RBAC (kontrola pristupa temeljena na ulogama)** | EN (HR). Form: *RBAC-a*. | Pomoću RBAC-a određujemo tko smije čitati Secrete u kojem Namespaceu. |
| ServiceAccount | **ServiceAccount (servisni račun)** | EN (HR) | Svaki Pod se API poslužitelju predstavlja svojim ServiceAccountom. |
| least privilege | **načelo najmanjih ovlasti** | HR | Prema načelu najmanjih ovlasti aplikacija dobiva samo ona prava koja joj stvarno trebaju. |
| authentication / authorization | **autentifikacija / autorizacija** | HR (Struna: *autentifikacija*) | Autentifikacija provjerava tko šalje zahtjev, a autorizacija što taj korisnik smije. |

### G. Observability

| English | Recommended form | Note | Example sentence |
|---|---|---|---|
| observability | **observability (uvid u stanje sustava)** | EN (HR). There is no settled Croatian term. | Observability znači da iz logova, metrika i tragova možemo zaključiti što se događa unutar sustava. |
| monitoring | **nadzor** | HR (EN) | Nadzor nas upozori da latencija raste prije nego što to primijete korisnici. |
| logs | **logovi** (formal: *zapisi*) | HR (settled loanword). Form: *logova*. | Logove svih Podova skupljamo na jedno mjesto. |
| metrics | **metrike** | HR | Prometheus redovito prikuplja metrike sa svih Podova. |
| traces / distributed tracing | **tragovi / raspodijeljeno praćenje** | HR (EN) | Trag pokazuje kroz koje je mikroservise zahtjev prošao i gdje je izgubio najviše vremena. |
| alert / dashboard | **upozorenje / nadzorna ploča** | HR (EN) | Kad latencija prijeđe 500 ms, upozorenje stiže na Slack, a nadzorna ploča pocrveni. |

---

## 2. Writing style

### 2.1 Form of address: use **vi**, plus the inclusive **mi**

- **Recommendation:** use second-person plural **vi**, written in lowercase, for instructions and tasks ("Dodajte poslužitelj s 4 GB RAM-a i pošaljite 500 zahtjeva."). Use first-person plural **mi** for walk-throughs and animations ("Pošaljimo 100 zahtjeva i pogledajmo što se događa.").
- **Evidence:**
  - Croatian university materials do this. FIDIT/GASERI writes "U ovom dijelu naučit ćete…", "Pokrenite kontejner…" and "Programer ste u timu…", and uses "Pokušajmo", "Uočimo da…".
  - The Microsoft Croatian style guide requires second-person *vi*. It explicitly notes that *vi* avoids marking gender ("Jeste li sigurni" rather than "Jesi li siguran/sigurna"). With *ti*, every past tense or adjective forces a choice between masculine and feminine.
  - A lecture addresses a group, so plural *vi* is natural rather than stiff. Capital **Vi** is for polite address to a single person in letters; do not use it here.
- **UI controls:** buttons and controls follow Croatian software convention: a short imperative with no full stop, e.g. "Pošalji promet", "Dodaj poslužitelj", "Ugasi poslužitelj", "Kreni ispočetka". Microsoft's own UI example is "Premjesti dolje". Tooltips and instructions use *vi*.
- *Ti* appears mainly in marketing copy and children's material. If the lecturer still prefers it, use it everywhere and avoid gendered past forms.

### 2.2 How to decline English terms

1. **If a natural Croatian term exists, use it:** čvor, klaster, kontejner, zahtjev, red poruka, slika kontejnera.
2. **Kubernetes API kinds are proper names.** Write them in PascalCase, without code font in running prose, as the Kubernetes style guide also does. Add Croatian endings directly, with **no hyphen**: the Pravopis rule is that foreign words are declined without a hyphen (*catering, cateringa*).
   - A silent final **-e** stays: *Service → Servicea* (like *Pierre → Pierrea*); *Namespace → Namespacea*; *Dockerfile → Dockerfilea*; *pipeline → pipelinea*.
   - A final **-y read as /j/** takes no inserted *j*: *Gateway → Gatewaya, Gatewayem* (like *Hemingway → Hemingwaya, Hemingwayem*).
   - The accusative of these inanimate nouns equals the nominative: *pokrećemo Pod*, *brišemo Deployment*.
3. **Abbreviations always take a hyphen** (Pravopis and Microsoft):
   - *API-ja* (it is read with a final *i*, so *j* is inserted, like *PC-ja*), *RAM-a, CPU-a, VM-a, OS-a, YAML-a, RBAC-a, HPA-a, CI/CD-a, Argo CD-a*.
   - Before a noun an abbreviation is not declined and takes no hyphen: *HTTP zahtjev, YAML datoteka, API poslužitelj*.
4. **Never decline anything in code font.** Put a declinable Croatian head noun in front: *naredbom `kubectl apply`*, *u datoteci `deployment.yaml`*, *polje `replicas`*, *agent `kubelet`*, *alat `containerd`*.
5. **Plurals:** if the last element is a single syllable, add **-ov-**: *Podovi, Jobovi, ReplicaSetovi, ConfigMapovi, tagovi, logovi, commitovi* (GASERI uses *commitova*). Otherwise there is no *-ov-*: *Deploymenti, Secreti, Ingressi, klasteri, kontejneri*.
   - Genitive plural of words ending in *-ent* inserts *a*: *Deploymenata* (like *argumenata*).
   - Avoid the plural of *Service* and *Namespace*. Write *objekti Service*, *više Namespacea* instead.
6. **Gender** follows form. Words ending in a consonant are masculine (*Pod, Deployment, Service*). Words ending in -a decline as feminine (*Kafka → u Kafki*, *Grafana → Grafane*). When unsure, use a head noun: *alat Terraform*, *sustav GitHub Actions*.
7. **Possessive adjectives:** *Dockerov registar*, *Kubernetesova upravljačka ravnina* (GASERI writes *Dockerove slike*).
8. **Verbs:** in lecture prose use Croatian verbs: *postaviti, poslati u registar, napraviti commit, spojiti granu, izgraditi*. *Skalirati* is fine. Keep *deployati, pushati, mergeati, commitati, buildati, rollbackati* for speech bubbles or "kako to kažu developeri" asides, never in definitions.

**Quick declension table**

| Nominative | Genitive | Locative | Instrumental | Nom. plural | Gen. plural |
|---|---|---|---|---|---|
| Kubernetes | Kubernetesa | Kubernetesu | Kubernetesom | – | – |
| Docker | Dockera | Dockeru | Dockerom | – | – |
| Pod | Poda | Podu | Podom | Podovi | Podova |
| Deployment | Deploymenta | Deploymentu | Deploymentom | Deploymenti | Deploymenata |
| ReplicaSet | ReplicaSeta | ReplicaSetu | ReplicaSetom | ReplicaSetovi | ReplicaSetova |
| Service | Servicea | Serviceu | Serviceom | (objekti Service) | – |
| Ingress | Ingressa | Ingressu | Ingressom | Ingressi | Ingressa |
| Gateway | Gatewaya | Gatewayu | Gatewayem | Gatewayi | Gatewaya |
| Secret | Secreta | Secretu | Secretom | Secreti | Secreta |
| ConfigMap | ConfigMapa | ConfigMapu | ConfigMapom | ConfigMapovi | ConfigMapova |
| Namespace | Namespacea | Namespaceu | Namespaceom | – | – |
| Job | Joba | Jobu | Jobom | Jobovi | Jobova |
| load balancer | load balancera | load balanceru | load balancerom | load balanceri | load balancera |
| pipeline | pipelinea | pipelineu | pipelineom | – | – |
| commit | commita | commitu | commitom | commitovi | commitova |
| Argo CD | Argo CD-a | Argo CD-u | Argo CD-om | – | – |
| API | API-ja | API-ju | API-jem | API-ji | API-ja |

### 2.3 Capital letters, italics and first use

- **Kubernetes object kinds** use PascalCase: Pod, Deployment, Service, ConfigMap. Croatian common nouns are lowercase: kontejner, čvor, klaster, slika. Use *Node* only when you mean the API object.
- **Product names** are written as their makers write them: Kubernetes, Docker, Docker Hub, Argo CD, GitHub Actions, GitLab CI/CD, Helm, Prometheus. Command-line tools and components are lowercase in code font: `kubectl`, `kubelet`, `etcd`, `containerd`.
- **Headings use sentence case.** English-style Title Case is an error in Croatian, per the Microsoft guide. Write "Kako radi load balancer", not "Kako Radi Load Balancer". The Croatian title format is e.g. "Lekcija 3: Load balancer – zašto jedan poslužitelj nije dovoljan".
- **Lowercase** names of months and days, and the words *internet* and *web*.
- **Hyphenated compounds:** *web-aplikacija, web-poslužitelj*. FER and Microsoft both write them this way.
- **Brackets:** text inside brackets starts with a lowercase letter unless it is a full sentence.
- **First use of an English term:** follow the GASERI pattern **hrvatski termin (engl. *English term*)**. Italicise unadapted English common nouns (*load balancer, pipeline, rollback*) on first use in each lecture, then write them in plain text. Strict Pravopis would italicise them every time; this lighter convention reads better on a website.
- **Kubernetes object names cannot contain diacritics** (only lowercase letters, digits and `-`). Use English identifiers in manifests (`web`, `orders`), and Croatian, with diacritics, in prose and YAML comments.

### 2.4 Punctuation and numbers

- **Quotation marks:** „…” (U+201E and U+201D), per Croatian Wikipedia and the Microsoft guide. No space after the opening mark or before the closing one. For a quote inside a quote use ‘…’. Never use English "…" in Croatian prose; code keeps ASCII quotes.
- **Commas:**
  - Put a comma after a subordinate clause only when it comes first: "Ako Pod padne, kontroler ga zamijeni." but "Kontroler zamijeni Pod ako padne."
  - No comma before *da* in object clauses: "Vidimo da je Pod spreman."
  - Always put a comma before *a, ali, nego*.
- **Dashes:**
  - A spaced en dash for asides: " – ".
  - An unspaced en dash for ranges: *2–4 GB*.
- **Numbers and units:**
  - Decimal comma: *1,5 GB*.
  - Thousands separated by a (non-breaking) space: *10 000*.
  - A space before the per cent sign: *50 %*.
  - A space before units: *250 ms, 2 GB*.
  - Version numbers keep the full stop: *verzija 2.3*.
  - Ordinal numbers take a full stop: *3. lekcija*. Dates: *1. listopada 2026.*
- **Counters in the simulator need three plural forms.** Use `Intl.PluralRules('hr')`, which returns one / few / other:
  - 1 zahtjev / 2 zahtjeva / 5 zahtjeva
  - 1 Pod / 2 Poda / 5 Podova
  - 1 replika / 2 replike / 5 replika
  - 1 čvor / 2 čvora / 5 čvorova
  - 21 poslužitelj / 22 poslužitelja / 25 poslužitelja
- **Common abbreviations:** *npr., tj., itd., engl.*

### 2.5 Standard Croatian (ijekavica): Serbian and Bosnian forms to avoid

| Avoid | Use |
|---|---|
| tačka, tačno | točka, točno |
| uslov | uvjet |
| hiljada | tisuća |
| sedmica / nedelja (week) | tjedan |
| saobraćaj | promet |
| računar | računalo |
| fajl, folder | datoteka, mapa (or direktorij) |
| operativni sustav | operacijski sustav |
| bezbjednost; obezbijediti | sigurnost; osigurati |
| opšti, uopšte | opći, uopće |
| ko, šta | tko, što |
| da li je…? | je li…? / radi li…? |
| moram da pokrenem; treba da | moram pokrenuti; treba + infinitive |
| pokrenuću | pokrenut ću |
| uraditi, desiti se | napraviti / učiniti, dogoditi se |
| historija, nivo, komanda | povijest, razina, naredba |
| oktobar | listopad |
| startovati, sačuvati, skinuti | pokrenuti, spremiti, preuzeti |
| postepeno | postupno |

- **Ijekavica checklist:**
  - zahtjev, vrijeme/vremena, mjesto, primjer
  - promjena / mijenjati, zamjena / zamijeniti, raspodjela / raspodijeliti, podijeliti (not *podjeliti*)
  - dio / dijela / dijelovi, uvijek, cijena, rješenje / riješiti
  - tijek / tijekom, slijed, pogreška, vjerojatnost, prijenos, procjena / procijeniti
- **Negation:** *ne* is written separately from verbs (*ne može, ne radi*). Exceptions: *neću, nisam, nemoj, nemam*.
- ***Podatci* or *podaci*:** the IHJJ Pravopis prescribes *podatci, zadatci, nedostatci, početci, trenutci*. *Podaci* is the Matica hrvatska form and the more common one. Both are acceptable. The examples above use *podatci* to match the IHJJ rules followed everywhere else. Pick one and use it site-wide.
- **Preferred normative forms:**
  - *omogućuje* rather than *omogućava*
  - *budući da* rather than causal *pošto*
  - *ako* rather than *ukoliko*
  - *s obzirom na to da* rather than *obzirom da*
  - *u vezi s* rather than *vezano za*
  - *trenutačno* (currently) rather than *trenutno* (instantly)
- **s / sa:** use *s* by default. Use *sa* before words starting with s, š, z, ž and in *sa mnom*.

---

## 3. Natural text versus machine-translated text

### 3.1 Phrases that make an explanation sound natural

- Zamislite da… / Recimo da… / Uzmimo primjer…
- Što se događa kad…? / Što ako jedan poslužitelj padne?
- Upravo zato nam treba… / Tu nastaje problem. / Rješenje je…
- Drugim riječima, … / Ukratko: … / U praksi to znači da…
- Pogledajmo… / Pokušajmo… / Uočimo da… / Primijetite da…
- Na prvi pogled …, ali … / Zvuči jednostavno, ali…
- Kvaka je u tome što… (lively and colloquial, fine in asides)
- Važno je razumjeti da… / To nas dovodi do… / Za usporedbu, …
- Kao što smo vidjeli u prethodnoj lekciji, …
- Connectors: dakle, naime, pritom, ipak, stoga, međutim, zato, odnosno
- Real developer phrases, acceptable in asides or speech bubbles: *poslužitelj je pao*, *podići (dignuti) novi Pod*, *aplikacija se vrti na…*, *usko grlo*, *ispod haube*, *ručno*, *u hodu*

### 3.2 Signs of machine translation, and the fix

| Sounds machine-translated or calqued | Natural Croatian |
|---|---|
| Pod je kreiran **od strane** kontrolera. | Kontroler stvara Pod. / Pod stvara kontroler. |
| Kubernetes **vrši skaliranje** / **vrši provjeru** | Kubernetes skalira / provjerava |
| Instalirajte Docker i pokrenite **isti**. | …i pokrenite ga. |
| **Ono što** load balancer **radi je** raspoređivanje… | Load balancer raspoređuje… |
| **Ovo je gdje** / **Ovo je razlog zašto** | Ovdje… / Zato… |
| **Koristeći** Service, možete… | Pomoću Servicea možete… / S pomoću Servicea… |
| promet ide **kroz** Service; objasnit ćemo **kroz** primjer | preko Servicea; na primjeru |
| **Vaša** aplikacija šalje **vaše** zahtjeve na **vaš** poslužitelj. | Aplikacija šalje zahtjeve poslužitelju. |
| **u cilju** smanjenja latencije | kako bismo smanjili latenciju |
| **u slučaju da** / **ukoliko** | ako |
| **na dnevnoj bazi** | svakodnevno |
| **osigurati se da** (make sure) | pobrinuti se da / provjeriti da |
| **adresirati** problem | riješiti problem / pozabaviti se problemom |
| **baziran na** | temeljen na / koji se temelji na |
| **Da li** je Pod spreman? | Je li Pod spreman? |
| Kubernetes **je ga** ponovno pokrenuo. | Kubernetes ga je ponovno pokrenuo. (unstressed pronouns go in second position) |
| Literal translations of object names: Pod as *mahuna*, Service as *Kubernetes usluga*, Deployment as *implementacija*, rolling update as *kotrljajuće ažuriranje*, load balancer as *uravnotežitelj tereta* | Keep the API kinds in English and use the forms in section 1. |
| Title Case: "Kako Radi Load Balancer" | "Kako radi load balancer" |
| Piled-up nouns: *izvršenje pokretanja kontejnera* | *pokretanje kontejnera* |
| *kreirati* in every sentence | *stvoriti, izraditi, napraviti* (*kreirati* is acceptable but overused) |

---

### Sources

- FER, *Raspodijeljeni sustavi*: https://www.fer.unizg.hr/predmet/rassus
- PMF Split, *Raspodijeljeni sustavi* (PMIC50): https://www.pmfst.unist.hr/wp-content/uploads/predmeti/PMIC50.pdf
- FIDIT Rijeka, *Distribuirani sustavi*: https://inf.uniri.hr/images/nastava/izvedbeni/2019_2020/diplomski/1_godina/DINP_DS_2019_2020.pdf
- GASERI / FIDIT materials:
  - https://gaseri.org/hr/nastava/materijali/docker-kontejneri/
  - https://gaseri.org/hr/nastava/materijali/web-kontejnerizacija/
  - https://gaseri.org/hr/nastava/materijali/web-kontinuirana-integracija/
  - https://gaseri.org/hr/nastava/materijali/gitlab-ci-cd/
  - https://gaseri.org/hr/nastava/materijali/kvm-virtualizacija/
  - https://gaseri.org/hr/nastava/materijali/git-upravljanje-verzijama/
- OSS Split, *Razvoj mikroservisa*: https://www.oss.unist.hr/Portals/0/adam/Programs/uMKU0NgA-UyvYaFpRQZ32w/Document/28%20-%20Razvoj%20mikroservisa.pdf
- Struna:
  - http://struna.ihjj.hr/naziv/posluzitelj/48899/
  - http://struna.ihjj.hr/naziv/zalihost/55126/
  - http://struna.ihjj.hr/naziv/zamjenski-posluzitelj/47283/
- Croatian Wikipedia:
  - https://hr.wikipedia.org/wiki/Hipervizor
  - https://hr.wikipedia.org/wiki/Virtualizacija
  - https://hr.wikipedia.org/wiki/LXC
- Hrvatski pravopis (IHJJ):
  - http://pravopis.hr/pravilo/navodnici/71/
  - http://pravopis.hr/pravilo/pisanje-oblika-i-posvojnih-pridjeva-od-opcih-rijeci-i-imena/48/
  - http://pravopis.hr/pravilo/pisanje-opcih-rijeci-i-sveza/46/
  - http://pravopis.hr/pravilo/oblici-pokrata-i-njihove-izvedenice/51/
  - http://pravopis.hr/pravilo/ispadanje-glasova/8/
- Wikipedia, *Quotation mark* (Croatian row): https://en.wikipedia.org/wiki/Quotation_mark
- Microsoft Croatian Style Guide: https://download.microsoft.com/download/0/6/2/0626b4d3-ed24-4c11-8676-ec5aa03576c7/hrv-hrv-StyleGuide.pdf
- Kubernetes:
  - Documentation style guide: https://kubernetes.io/docs/contribute/style/style-guide/
  - Available localisations (Croatian absent): https://kubernetes.io/docs/home/
  - Polish localisation: https://kubernetes.io/pl/docs/concepts/overview/components/
  - Ingress NGINX retirement: https://kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/
- Argo CD documentation: https://argo-cd.readthedocs.io/en/stable/
- Titles taken from search snippets only, because full texts are behind bot verification:
  - FER thesis "Sigurnosni aspekti sustava za orkestraciju Kubernetes": https://dabar.srce.hr/islandora/object/fer:10765
  - FER thesis "Uravnoteženje opterećenja u raspodijeljenom WWW poslužitelju": https://repozitorij.fer.unizg.hr/en/islandora/object/fer%3A4730
  - FER thesis on SDN controllers (upravljačka / podatkovna ravnina): https://dabar.srce.hr/en/islandora/object/fer%3A1417
  - Riteh thesis "Posrednici poruka": https://repository.riteh.uniri.hr/islandora/object/riteh:3352/datastream/PDF/view