# Lecture 15 — Ulaz u klaster: Gateway API
_Jedna ulazna vrata za mnogo objekata Service – usmjeravanje po domeni i putanji, TLS i težine._ · ~35 min · module m3 · prerequisites: 14
Folder: `src/lectures/15-gateway-api/` · URL: `/predavanje/gateway-api`
Engines: none (small local seeded models / steppers)

## Continuity
- Previous lecture (14 Service: stalna adresa za prolazne Podove) ends with: Unutar klastera sve se nalazi po imenu. Ali kako studenti s interneta dolaze do Klope? LoadBalancer Service za web, API i administraciju znači tri javne adrese i tri računa, a trebaju nam i HTTPS te usmjeravanje /api na drugi Service nego /.
- Next lecture (16 ConfigMap i Secret: konfiguracija i tajne u klasteru) opens with: Repozitorij s `deployment.yaml` bio je jedan dan javan i netko je iskoristio ključ za SMS-gateway: stigao je račun za 40 000 poruka. Usto, testno okruženje treba drugu adresu baze nego produkcija, a slika mora biti ista. Gdje u Kubernetesu žive postavke i tajne, tko ih može pročitati i što se dogodi kad ih promijenimo?

## Hook (incident)
Za web, API i administraciju Davor bi trebao tri LoadBalancer Servicea: tri javne adrese, tri računa i tri certifikata. A tutorial koji je pronašao koristi ingress-nginx – kontroler koji je u ožujku 2026. umirovljen. Kako sav promet izvana pustiti kroz jedna vrata i pametno ga rasporediti?

## Objectives (rendered by the page hero)
- objasniti zašto jedan L7 ulaz zamjenjuje LoadBalancer za svaki Service
- opisati lanac GatewayClass → Gateway → HTTPRoute → Service → Podovi i tko je vlasnik kojeg dijela
- napisati pravila po domeni, putanji i zaglavlju te predvidjeti koje pravilo vrijedi
- objasniti terminaciju TLS-a na ulazu, raspodjelu po zahtjevu i podjelu prometa težinama
- objasniti današnji status Ingressa i kontrolera ingress-nginx

## Scenes
### 1. Zašto ne LoadBalancer za svaki Service (interactive)
- Concept: Cost and certificate sprawl; cloud L4 LB → L7 Gateway → Pods. The HTTPRoute names a Service, but most implementations (Envoy Gateway, Istio, NGINX Gateway Fabric, Cilium, Traefik) use it only to look up ready endpoints from its EndpointSlices and send each request straight to a Pod IP with their own L7 algorithm (round robin or least request, implementation-specific) – the L04 algorithms come back here. kube-proxy's random per-connection choice applies to in-cluster ClusterIP traffic.
- Visual: € counter; layered path with the ClusterIP hop drawn as bypassed.
### 2. Dodatak, a ne ugrađeni dio (animation)
- Concept: Gateway API = CRDs installed separately + a controller (Envoy Gateway, NGINX Gateway Fabric, Traefik, Cilium, Istio…); a CRD extends the API, a controller adds the loop.
- Visual: API extended with new kinds; controller ring.
### 3. Uloge (interactive)
- Concept: GatewayClass = infrastructure provider, Gateway = cluster operator, HTTPRoute = app team.
- Visual: Ownership colours.
### 4. Pravila usmjeravanja (interactive)
- Concept: hostnames, PathPrefix/Exact, headers; more specific wins (/api beats /); no match → 404.
- Visual: Route builder; requests light their rule.
### 5. TLS i težine (animation)
- Concept: HTTPS listener terminates TLS with a certificate from a kubernetes.io/tls Secret (teaser L16; cert-manager one line); backendRefs weights 90/10 chosen per request (teaser canary L20).
- Visual: Padlock handshake; colour mix of the stream.
### 6. Ingress koji ćete sresti (diagram)
- Concept: Same intent as Ingress + annotations; Ingress GA but frozen, not deprecated; community ingress-nginx retired 2026-03-24; F5 NGINX Ingress Controller is a different maintained project; ingress2gateway migrates.
- Visual: Side-by-side YAML and a timeline.

## Flagship simulation: Gradska vrata
A mixed request stream (klopa.example/, /api/…, admin.klopa.example, header x-beta: 1) flows through one Gateway straight to Pods; students drag-build HTTPRoute rules; the matching rule lights up in YAML; roles view and „Prikaži kao Ingress”. Zadaci: „/api → klopa-api, ostalo → klopa-web”, „admin.klopa.example samo na klopa-admin”, „10 % /api prometa na verziju 1.4.1”, „HTTPS radi”.

Controls:
- Graditelj pravila: hostname, putanja (PathPrefix/Exact), zaglavlje, backendRefs s težinama
- Prekidač HTTPS slušatelja i odabir Secreta
- Prekidači „Uloge” i „Prikaži kao Ingress”
- Prekidač „Prikaži put do Podova” (EndpointSlice → Pod IP)
- Gumbi za kvar: „Obriši pravilo za /api”, „Krivi Secret za certifikat”, „Krivi naziv Servicea”

Model (exact rules):
Listener hostname match first (exact beats wildcard); among matching rules precedence simplified per Gateway API spec: Exact path > longest PathPrefix > more header matches; no match → 404. Weights: each request picks a backend Service with probability weight/Σweights (per request, L7). Within a backend the Gateway reads the Service's EndpointSlices (ready endpoints only) and picks a Pod per request (sim: least request, labelled 'ovisi o implementaciji'); ClusterIP/kube-proxy is not on this path. backendRef to a missing Service → route condition ResolvedRefs=False and matching requests get HTTP 500 (Gateway API spec). HTTPS: TLS terminated at the Gateway via certificateRefs to a kubernetes.io/tls Secret in the same namespace (cross-namespace needs ReferenceGrant); invalid Secret → listener not programmed, HTTPS handshakes fail. Ingress view shows spec.rules; weights shown as 'ovisi o kontroleru' annotations.

Break it: Deleting the /api rule sends API calls to the web app (prefix / catches them); a wrong certificate Secret breaks HTTPS for everyone; a wrong Service name returns 500 with ResolvedRefs=False.

Insight: The same load-balancing idea from L04, split into layers and roles: the platform team owns the gate, each app team owns its routes; L7 routing, per-request balancing and weights live here, not in the Service.

## Code artifacts
- Instalacija CRD-ova Gateway API-ja (bash): kubectl apply --server-side -f …/v1.6.x/standard-install.yaml (pin when authoring)
- gateway.yaml (yaml): HTTPS listener with certificateRefs
- httproute.yaml (yaml): hostnames, PathPrefix, backendRefs with weights
- ingress.yaml za usporedbu (yaml): Closed legacy example

## Misconceptions (Croatian myth + English correction)
- „Ingress je vrsta Servicea” — a separate API that needs a controller.
- „Ingress je zastario i uklonjen” — GA and frozen; Gateway API is recommended.
- „Koristite ingress-nginx” — retired 2026-03-24: no releases or security fixes.
- „Gateway API je ugrađen u svaki klaster” — CRDs + a controller must be installed.
- „F5-ov NGINX Ingress Controller isto je što i ingress-nginx” — a different, still-maintained project.
- „Promet kroz Gateway prolazi kroz ClusterIP” — most implementations send each request straight to Pod IPs from the EndpointSlices.
- „Gateway zamjenjuje objekte Service” — routes still name Services (for endpoint discovery), and Services still serve in-cluster traffic.

## Key facts (verified; date-sensitive ones belong in fact callouts)
- [tech-facts] Ingress API is GA but frozen – not deprecated; the project recommends Gateway API.
- [tech-facts] Gateway API is an add-on (CRDs + controller); core kinds GatewayClass, Gateway, HTTPRoute, GRPCRoute; v1.0 GA 2023-10-31; v1.6.0 (2026-06) moved TCPRoute/UDPRoute to Standard; current v1.6.2 (as of 2026-10).
- [tech-facts] ingress-nginx retirement announced 2025-11-11, effective 2026-03-24 (no releases or security fixes); ingress2gateway 1.0 released 2026-03-20, current 1.2.0.
- [tech-facts] Conformant implementations include Envoy Gateway, Istio, Cilium, NGINX Gateway Fabric, Traefik, Kong, GKE; Envoy-based gateways route to endpoints directly, bypassing kube-proxy.
- [tech-facts] Invalid backendRef → ResolvedRefs=False and HTTP 500 for matching requests.

## Analogies (always with where they break down)
- Gradska vrata: jedan ulaz, a prema natpisu (domena, putanja) šalju vas u pravu četvrt. Breaks down: the gate only routes, it doesn't run the shops, and different owners write different rules.

## Glossary terms introduced
Gateway API, Ingress

## Bridge to next (CostNote)
HTTPS radi, a certifikat živi u objektu Secret. Ali lozinka baze i ključ SMS-gatewaya i dalje stoje kao obične varijable okruženja u `deployment.yaml` – u Git repozitoriju koji je jedan dan bio javan.
