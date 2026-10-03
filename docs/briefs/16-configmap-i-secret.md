# Lecture 16 — ConfigMap i Secret: konfiguracija i tajne u klasteru
_Ista slika u svakom okruženju, tajne izvan koda – i zašto base64 nije brava._ · ~40 min · module m4 · prerequisites: 13, 14, 08
Folder: `src/lectures/16-configmap-i-secret/` · URL: `/predavanje/configmap-i-secret`
Engines: E5 → src/engines/access/

## Continuity
- Previous lecture (15 Ulaz u klaster: Gateway API) ends with: HTTPS radi, a certifikat živi u objektu Secret. Ali lozinka baze i ključ SMS-gatewaya i dalje stoje kao obične varijable okruženja u `deployment.yaml` – u Git repozitoriju koji je jedan dan bio javan.
- Next lecture (17 Resursi i raspoređivanje: koliko mjesta treba Podu) opens with: Potrošač za fotografije pojeo je memoriju čvora node-2, pa produkcijski API Podovi umiru s OOMKilled ili ih kubelet izbacuje. Novi Pod od 1500m stoji u Pendingu s porukom „0/3 nodes are available: 3 Insufficient cpu”, iako klaster troši tek 30 % procesora – jer Ivini testni Podovi rezerviraju jezgre koje ne troše. Kako raspoređivač odlučuje gdje ima mjesta – i tko kažnjava Pod koji uzme previše?

## Hook (incident)
Repozitorij s `deployment.yaml` bio je jedan dan javan i netko je iskoristio ključ za SMS-gateway: stigao je račun za 40 000 poruka. Usto, testno okruženje treba drugu adresu baze nego produkcija, a slika mora biti ista. Gdje u Kubernetesu žive postavke i tajne, tko ih može pročitati i što se dogodi kad ih promijenimo?

## Objectives (rendered by the page hero)
- odvojiti konfiguraciju od slike kontejnera ConfigMapom i Secretom
- objasniti razliku između kodiranja (base64) i šifriranja te gdje se Secret po zadanom čuva
- nabrojati tko može pročitati Secret, uključujući svakoga tko smije stvarati Podove u Namespaceu, i zašto uloga view vidi ConfigMape, ali ne i Secrete
- predvidjeti kada aplikacija vidi novu vrijednost: varijabla okruženja, volumen ili subPath
- primijeniti osnovne zaštite: šifriranje u mirovanju, RBAC s najmanjim ovlastima, bez tajni u Gitu i slici

## Scenes
### 1. Jedna slika, tri okruženja (animation)
- Concept: Same digest + three ConfigMaps → three behaviours; envFrom vs mounted file.
- Visual: One image, three ConfigMaps, two consumption styles.
### 2. Dekodirajte (interactive)
- Concept: Secret data in the API and YAML is base64 (stringData accepts plain text); a Secret is a ConfigMap with a 'pažljivo' sticker; max 1 MiB; types Opaque, kubernetes.io/tls, dockerconfigjson…; immutable.
- Visual: „Dekodiraj” button reveals the password instantly.
### 3. Gdje tajna živi (animation)
- Concept: In etcd, unencrypted by default (identity provider; base64 is only the API representation). Providers: identity (no encryption) → secretbox or aesgcm (local key in a file on the control-plane host) → KMS v2 (key in an external KMS, recommended); aescbc exists but is not recommended (CBC padding-oracle). Envelope DEK/KEK in DeepDive; managed clusters differ (EKS encrypts by default).
- Visual: etcd disk with plaintext; provider ladder; key file sitting next to etcd on the control-plane disk.
### 4. Tko može pročitati? (interactive)
- Concept: get; list/watch also return contents; anyone who can create Pods/Deployments in the namespace can mount it; the built-in view ClusterRole reads Pods, Deployments and ConfigMaps but deliberately not Secrets – the real difference between ConfigMap and Secret; compromised Pod; Role/RoleBinding, ServiceAccount, least privilege, RBAC is additive.
- Visual: Attacker eyes red/grey.
### 5. Kada aplikacija vidi promjenu (interactive)
- Concept: Env var: stale until container restart; volume: eventually (kubelet sync + cache), app must re-read; subPath: never; kubectl rollout restart.
- Visual: Side-by-side update timeline.
### 6. Pravila (text)
- Concept: Never store Secret manifests in Git; never ENV/ARG in Dockerfile (BuildKit secret mounts for build time, L08); prefer mounted files (env vars leak into logs/dumps/child processes); DeepDive: Namespace is not a security boundary alone (NetworkPolicy, Pod Security Admission; PSP removed 1.25); teaser L23.
- Visual: Checklist.

## Flagship simulation: Put tajne
E5 threat model for the DB password: choose where it lives and how the Pod consumes it, toggle protections, see which attackers can read it (red eye = can read), then rotate it. Zadaci: „Zatvorite što više očiju”, „Objasnite zašto oko „smije stvarati Podove” ostaje crveno”, „Rotirajte lozinku bez ponovnog pokretanja Poda”.

Controls:
- Segmented „Gdje je lozinka”: u slici (ENV) / env u deployment.yaml / ConfigMap / Secret
- Prekidač „Šifriranje u mirovanju” s izborom pružatelja: lokalni ključ (secretbox/aesgcm) / KMS v2
- Prekidač „RBAC s najmanjim ovlastima”
- Segmented potrošnja: env / volumen / subPath
- Gumb „Rotiraj lozinku”
- Gumbi za kvar: „Ukradi kopiju baze etcd”, „Ukradi disk upravljačke ravnine”, „Spremi secret.yaml u Git”, „Ispiši env u log”

Model (exact rules):
Access graph. Git reader: reads iff the value (plain or base64) is in a committed file. Image puller: iff baked into the image. etcd-backup thief: iff stored in etcd (Pod spec env, ConfigMap or Secret) AND encryption at rest off. Control-plane disk thief: like the etcd thief, but also red with a local-key provider (key file on the same host); grey only with KMS v2. User with role view in the namespace (reads Pods, Deployments, ConfigMaps): red iff the value is an env literal in the Pod spec or in a ConfigMap; grey for a Secret. User with get or list on secrets/configmaps: iff value is in that kind; least-privilege toggle removes these verbs from the developer role. User who can create Pods/Deployments in the namespace: iff value is in a Secret/ConfigMap there (can mount it) – stays red regardless of get/list. Compromised app Pod: always red (honest limit). Log reader: iff consumed as env and 'Ispiši env u log' pressed. Rotation: env consumers keep the old value until restart; volume consumers see it after kubelet sync + cache delay (sim 10 s, labelled 'stvarno: s odgodom sinkronizacije kubeleta'), and only if the app re-reads; subPath never.

Break it: „Ukradi kopiju baze etcd” reads every Secret until encryption at rest is on; „Ukradi disk upravljačke ravnine” still reads them with a local key; „Spremi secret.yaml u Git” exposes the password to every Git reader forever; rotation leaves env Pods stale and subPath mounts never update.

Insight: base64 is a costume, not a lock; protection is layered – RBAC, encryption at rest with a key stored elsewhere, plaintext out of Git and images – and whoever can create Pods in a namespace can read its Secrets.

## Code artifacts
- configmap.yaml (yaml): Non-secret settings per environment
- secret.yaml sa stringData (yaml): With a big „NE SPREMATI U GIT” banner
- secretKeyRef ili volumen (yaml): Two consumption styles in a Deployment
- kubectl get secret -o jsonpath | base64 -d (bash): Decode in one command
- Role, RoleBinding i kubectl auth can-i (yaml): Least privilege; can-i as view vs as developer
- EncryptionConfiguration (yaml): Closed: kms v2 (secretbox for a self-managed lab)

## Misconceptions (Croatian myth + English correction)
- „Secreti su šifrirani” — base64 in the API and unencrypted in etcd by default.
- „Samo administratori, ili samo get, mogu čitati Secrete” — list/watch reveal contents and Pod creators can mount them.
- „Secret smijem spremiti u Git” — base64 is readable by anyone with the repo, forever.
- „Promjena Secreta odmah mijenja aplikaciju” — env needs a restart, a volume updates eventually, subPath never.
- „ConfigMap ili Secret, svejedno je” — separate RBAC (view reads ConfigMaps, not Secrets), handling and encryption scope.
- „Varijable okruženja najsigurniji su način” — env values leak into logs, dumps and child processes.
- „Šifriranje u mirovanju s ključem u datoteci rješava sve” — the key sits on the control-plane host; KMS v2 keeps it elsewhere.
- „Namespace je sigurnosna granica” — only together with RBAC, NetworkPolicy and Pod Security.

## Key facts (verified; date-sensitive ones belong in fact callouts)
- [tech-facts] Secrets are stored unencrypted in etcd by default; anyone with API or etcd access can read them; anyone who can create a Pod in a namespace can read its Secrets.
- [tech-facts] base64 is not encryption; Secrets ≤1 MiB; immutable: true; types Opaque, kubernetes.io/tls, dockerconfigjson, basic-auth, ssh-auth, service-account-token.
- [tech-facts] list/watch permission reveals Secret contents; the built-in view ClusterRole excludes Secrets.
- [tech-facts] Volume mounts update eventually, subPath never; env vars only after container restart.
- [tech-facts] Encryption providers identity (default), aescbc (not recommended), aesgcm, secretbox, kms v1 (deprecated)/v2; KMS v2 stable since 1.29 and recommended; EKS envelope-encrypts API data by default since 2025-03-05.
- [tech-facts] Pod Security Admission (privileged/baseline/restricted) replaced PodSecurityPolicy, removed in 1.25.

## Analogies (always with where they break down)
- Secret kao „ConfigMap s naljepnicom pažljivo”. Breaks down: the sticker changes handling (separate RBAC, tooling) but adds no encryption.

## Glossary terms introduced
ConfigMap, Secret, base64, Encryption at rest, RBAC

## Bridge to next (CostNote)
Testno okruženje sada živi u istom klasteru, u Namespaceu `klopa-staging`. Ivini Podovi za test opterećenja rezerviraju po cijelu procesorsku jezgru ili jednu i pol, a novi potrošač iz reda poruka koji obrađuje fotografije jela nema ograničenje memorije i pojede memoriju čvora node-2. Produkcijski API Podovi umiru, a novi Pod koji Lana pokrene ostaje u stanju `Pending`, iako nadzor pokazuje da klaster troši tek 30 % procesora.
