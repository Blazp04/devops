# Lecture 14 — Service: stalna adresa za prolazne Podove
_Oznake, EndpointSlice, DNS i pravila na svakom čvoru – i zašto Service ne raspoređuje kružno._ · ~40 min · module m3 · prerequisites: 13, 04
Folder: `src/lectures/14-service/` · URL: `/predavanje/service`
Engines: E1 → src/engines/traffic/, E3 → src/engines/cluster/

## Continuity
- Previous lecture (13 Deployment: replike, nove verzije i povratak) ends with: Vegetarijanski meni je vani. Ali novi Podovi imaju nove IP adrese, a klopa-web je imao upisanu adresu jednog API Poda – i sada vraća greške. Kako drugi pronalaze Podove koji stalno mijenjaju adresu?
- Next lecture (15 Ulaz u klaster: Gateway API) opens with: Za web, API i administraciju Davor bi trebao tri LoadBalancer Servicea: tri javne adrese, tri računa i tri certifikata. A tutorial koji je pronašao koristi ingress-nginx – kontroler koji je u ožujku 2026. umirovljen. Kako sav promet izvana pustiti kroz jedna vrata i pametno ga rasporediti?

## Hook (incident)
klopa-web je imao upisanu IP adresu jednog API Poda. Nakon uvođenja verzije 1.4.0 taj Pod više ne postoji i web vraća greške. Treba nam jedno stalno ime – ali što se krije iza njega i dijeli li promet kao load balancer iz četvrtog predavanja?

## Objectives (rendered by the page hero)
- objasniti kako Service daje stalno ime i virtualnu IP adresu Podovima odabranima po oznakama
- objasniti zašto Service šalje promet samo Podovima koji su u EndpointSliceu označeni kao spremni (ready) i kako to omogućuje uvođenje bez grešaka
- pratiti paket od DNS upita do Poda i objasniti zašto ClusterIP ne pripada nijednom računalu
- objasniti zašto Service bira Pod nasumično po vezi, a ne po zahtjevu
- razlikovati vrste ClusterIP, NodePort i LoadBalancer (headless u 19. predavanju)

## Scenes
### 1. Oznake i selektor (interactive)
- Concept: Pod IPs are temporary; Service selects Pods (not Deployments) by labels in its own Namespace; typo app: klopa-apii → 0 endpoints.
- Visual: Label stickers; endpoint lines attach/detach.
### 2. Samo spremni (interactive)
- Concept: EndpointSlices list every matching Pod with conditions ready, serving and terminating; kube-proxy sends traffic only to ready ones. A readiness failure flips ready: false without restart; replay the L13 rollout with readiness → 0 errors; EndpointSlices replace the deprecated Endpoints API.
- Visual: Ready endpoints as solid lines, not-ready as dashed lines carrying no traffic; replayed rollout.
### 3. Ime i Namespace (interactive)
- Concept: CoreDNS: klopa-api → klopa-api.klopa → klopa-api.klopa.svc.cluster.local; short names work only inside the same Namespace.
- Visual: Name assembled piece by piece.
### 4. Put paketa (animation)
- Concept: ClusterIP is virtual; kube-proxy rules on the client's own node DNAT to a random ready Pod; conntrack rewrites the reply; iptables default in 1.37, nftables successor, ipvs deprecated; eBPF dataplanes one line.
- Visual: Packet header labels rewriting in place.
### 5. Service nije klasični load balancer (interactive)
- Concept: L04 rack in Service mode: random per connection, no weights, ignores node size (uneven capacity is handled by requests/scheduler L17 and HPA L18); long-lived keep-alive/HTTP/2/gRPC connections pin to one Pod; fixes: new connections, an L7 proxy (the Gateway balances per request, L15), client-side balancing over a headless Service (L19). sessionAffinity: ClientIP (10800 s) is IP-based, not cookie-based: everyone behind campus NAT or eduroam shares one public IP and lands on the same Pod, and behind a cloud LB the Pod may see only the LB's or node's address unless externalTrafficPolicy: Local is set; cookie affinity lives at L7.
- Visual: Per-Pod hit histogram for each client mode; affinity toggle collapsing a whole campus onto one Pod.
### 6. Vrste i tiho gašenje (animation)
- Concept: ClusterIP (default) → LoadBalancer (cloud or add-on; stays pending on kind unless cloud-provider-kind runs); NodePort 30000–32767 in one line; endpoint removal is async with SIGTERM → preStop sleep, grace 30 s.
- Visual: Reachability rings; shutdown race timeline.

## Flagship simulation: Laboratorij selektora i put paketa
E3 + E1 Service mode: Pods with draggable labels, selector chips and live EndpointSlice lines; per-Pod readiness; a client Pod with a hit histogram; rollout replay; the L04 rack reopened in Service mode. Zadaci: „Popravite Service bez endpointa”, „Uvođenje 1.4.0 → 1.4.1 s 0 grešaka”, „Rasporedite keep-alive klijenta na sva 4 Poda”, „Objasnite zašto svaki Pod dobiva jednako prometa bez obzira na veličinu čvora – i kako veći čvor ipak dobije više prometa (na njega stane više Podova, L17)”.

Controls:
- Povlačenje oznaka na Podove (app, version)
- Uređivanje selektora
- Prekidač spremnosti po Podu
- Segmented klijent: nova veza po zahtjevu / jedna dugotrajna veza / N veza
- Segmented vrsta: ClusterIP / NodePort / LoadBalancer
- Prekidač „sessionAffinity: ClientIP” (klijenti iza jednog NAT-a)
- Gumb „Pošalji zahtjev” (korak po korak)
- Prekidač „preStop: sleep 5”
- Prekidač „Klasični LB (L04) / Kubernetes Service”
- Gumbi za kvar: „Greška u selektoru”, „Podu padne readiness”, „Upiši IP pa uvedi novu verziju”

Model (exact rules):
EndpointSlice = Pods in the namespace matching ALL selector pairs, each with conditions ready/serving/terminating; kube-proxy routes only to ready endpoints (not-ready drawn dashed, terminating marked); recomputed on change, propagated to every node's rules after 1 s (sim). Each NEW connection picks a ready backend uniformly at random (iptables/nftables default); all requests on it go to that Pod; sessionAffinity ClientIP pins by source IP for 10800 s (a NAT'd campus = one IP = one Pod). No weights, node size ignored. 0 ready endpoints → requests fail. Client modes: per-request connections → random spread with visible variance; one keep-alive connection → 100 % on one Pod; N connections → N random picks. Shutdown: deletion sends SIGTERM and starts endpoint removal concurrently; app exiting immediately drops requests arriving in the 1 s lag; preStop sleep 5 → 0 drops; SIGKILL after 30 s. Packet stepper: 10.244.1.7 → DNS → 10.96.12.7:80 → DNAT 10.244.2.15:8000 → reply via conntrack. Service mode of the L04 engine behaves like random (≈RR: λ15 → ~2,7 % errors on the default rack).

Break it: A selector typo leaves 0 endpoints while all Pods are healthy; one keep-alive connection sends 100 % to one Pod; ClientIP affinity behind NAT sends a whole campus to one Pod; a hardcoded IP breaks on the next rollout; without preStop a few requests fail during a rollout.

Insight: A Service is a stable name and virtual IP implemented as rules on every node; it selects by labels, sends only to ready endpoints and balances connections at random, not requests in turn.

## Code artifacts
- service.yaml (yaml): ClusterIP for klopa-api, port 80 → targetPort 8000
- readinessProbe i preStop (diff): Zero-error rollout
- kubectl get endpointslices -l kubernetes.io/service-name=klopa-api -o yaml (bash): See ready/serving/terminating conditions
- kubectl run dnsutils --rm -it --image=registry.k8s.io/e2e-test-images/jessie-dnsutils:<tag> -- nslookup klopa-api (bash): DNS from inside (pin the tag when authoring; image used by the Kubernetes DNS-debugging docs)
- iptables-save | grep KUBE-SVC, nft list ruleset (bash): Closed DeepDive

## Misconceptions (Croatian myth + English correction)
- „Service je proces ili kutija kroz koju prolazi promet” — a virtual IP implemented as rules on every node.
- „Service raspoređuje round robin po zahtjevu” — a random backend per new connection.
- „Service pokazuje na Deployment” — it selects Pods by labels; a typo gives 0 endpoints.
- „EndpointSlice sadrži samo spremne Podove” — it lists not-ready ones too, with ready: false; kube-proxy skips them.
- „type: LoadBalancer radi svugdje” — needs a cloud controller or add-on; stays pending on kind.
- „Kratko ime radi iz svakog Namespacea” — only within the same Namespace.
- „Kubernetes prati Podove iza Servicea preko objekta Endpoints” — EndpointSlices; the Endpoints API is deprecated since 1.33.
- „Za performanse koristite ipvs” — deprecated since 1.35; nftables is the successor.
- „gRPC se balansira po zahtjevu” — HTTP/2 keeps one long-lived connection pinned to one Pod.

## Key facts (verified; date-sensitive ones belong in fact callouts)
- [tech-facts] Service types ClusterIP (default), NodePort (30000–32767), LoadBalancer, ExternalName, headless (clusterIP: None, L19).
- [tech-facts] kube-proxy: iptables default in 1.37; nftables GA since 1.33 (kernel ≥5.13) is the successor; ipvs deprecated since 1.35, off by default from 1.40, removal planned 1.43 (as of 2026-10).
- [tech-facts] iptables/nftables pick a backend at random per connection; sessionAffinity ClientIP timeout 10800 s; trafficDistribution PreferSameZone / PreferSameNode (GA 1.35).
- [tech-facts] Endpoints API deprecated in 1.33 in favour of EndpointSlices; endpoints carry ready/serving/terminating conditions; failing readiness sets ready: false.
- [tech-facts] Service.spec.externalIPs deprecated in 1.36; on kind LoadBalancer stays pending unless cloud-provider-kind runs; bare-metal LoadBalancer needs an add-on such as MetalLB (mention only as example).

## Analogies (always with where they break down)
- Glavni broj telefona tvrtke. Breaks down: there is no receptionist – only forwarding rules on every node; a ClusterIP can't usually be pinged; the pick is random per connection.
- Oznake kao hashtagovi, selektor kao spremljena pretraga. Breaks down: a selector matches only Pods in the Service's own Namespace and needs ALL listed key=value pairs to match exactly.

## Glossary terms introduced
Service, EndpointSlice

## Bridge to next (CostNote)
Unutar klastera sve se nalazi po imenu. Ali kako studenti s interneta dolaze do Klope? LoadBalancer Service za web, API i administraciju znači tri javne adrese i tri računa, a trebaju nam i HTTPS te usmjeravanje /api na drugi Service nego /.
