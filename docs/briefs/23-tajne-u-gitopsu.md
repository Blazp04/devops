# Lecture 23 — Upravljanje tajnama u GitOpsu
_U Git smije brava ili adresa, nikad ključ: Sealed Secrets, External Secrets Operator i ostale mogućnosti._ · ~35 min · module m5 · prerequisites: 16, 22
Folder: `src/lectures/23-tajne-u-gitopsu/` · URL: `/predavanje/tajne-u-gitopsu`
Engines: E5 → src/engines/access/, E6 → src/engines/gitops/

## Continuity
- Previous lecture (22 GitOps i Argo CD: Git kao izvor istine) ends with: Sve što opisuje Klopu sada je u Gitu – osim lozinki, koje prema 16. predavanju nikad ne smiju u Git. Lana zato `secret.yaml` primjenjuje ručno sa svog laptopa, a kad se podigne novi klaster, API Podovi ne mogu ni krenuti – stoje u CreateContainerConfigError jer Secreta nema.
- Next lecture (24 Dan izdanja: put jednog commita i jednog zahtjeva) opens with: Petak, 11:55. Nova košarica 2.0.1 radi od jutra, ali popust za Ćevap-petak krivo se obračunava. Ispravak 2.0.2 mora biti vani prije 12:00. Pratimo jedan commit od Lanine tipkovnice do produkcije i jedan studentski zahtjev od mobitela do kuhinje – a na svakoj postaji pitamo: što ako ovdje pukne?

## Hook (incident)
Lana je `secret.yaml` primijenila ručno, pa na novom klasteru API ne može ni krenuti. Netko je u međuvremenu u Git spremio Secret kodiran u base64 – brisanje commita ne uklanja ga iz povijesti. A kad je Davor otišao na Erasmus, zamjena ključa za SMS-gateway, koji je postojao samo na njegovu laptopu, trajala je dva dana. Kako tajne uklopiti u GitOps, a da ih nikad ne zapišemo u Git?

## Objectives (rendered by the page hero)
- objasniti zašto obični Secret ne smije u Git i zašto nakon curenja tajnu treba promijeniti
- usporediti šifriranje u Gitu (Sealed Secrets, SOPS) i referencu u Gitu uz vanjski trezor (External Secrets Operator, Secrets Store CSI Driver)
- objasniti preporuku Argo CD-a da se tajnama upravlja u odredišnom klasteru
- isplanirati rotaciju tajne i predvidjeti kada je vidi koji Pod
- odabrati pristup za mali tim i za veću organizaciju u oblaku

## Scenes
### 1. Dilema (animation)
- Concept: GitOps wants everything in Git; base64 is plaintext; deleting a commit doesn't clean clones → rotate.
- Visual: Git history with a leaked commit.
### 2. Sealed Secrets (animation)
- Concept: kubeseal encrypts with the controller's public key; SealedSecret is safe in Git; only the in-cluster controller decrypts; scopes strict/namespace/cluster. Every 30 days the controller adds a new sealing key; old keys are kept so existing SealedSecrets still decrypt – renewal re-encrypts nothing and is not secret rotation. If the private keys leak, every SealedSecret ever committed becomes readable, so rotate the real values. Back up all keys (label sealedsecrets.bitnami.com/sealed-secrets-key).
- Visual: Asymmetric key animation; key ring growing every 30 days.
### 3. Trezor i External Secrets Operator (animation)
- Concept: ExternalSecret reference in Git → ESO reads Vault/OpenBao/cloud secret manager → creates a Kubernetes Secret every refreshInterval; rotation path.
- Visual: Pipeline with a refresh ring.
### 4. Ostale mogućnosti (diagram)
- Concept: One comparison diagram: SOPS encrypts values, keeps keys readable (age, cloud KMS); Flux decrypts natively, Argo CD needs a plugin (the discouraged approach). Secrets Store CSI Driver fetches at Pod start into tmpfs, optional sync to a Secret, store down → new Pods can't start. argocd-vault-plugin: Argo CD needs secret access, plaintext in its Redis cache, coupled syncs – discouraged.
- Visual: Comparison grid with where the plaintext lives for each option.
### 5. Odabir i ekosustav (diagram)
- Concept: Decision guide (small team: Sealed Secrets; cloud org: ESO + cloud secret manager); ESO pause/resume as a bus-factor story; Vault BSL (now IBM) vs OpenBao MPL fork; OIDC in CI (L21).
- Visual: Decision tree with fact callouts.

## Flagship simulation: Put tajne (2. dio)
E5 + E6: the L16 simulator across the GitOps pipeline (laptop → Git → CI → registry → Argo CD → API/etcd → node → Pod) with GitOps approaches unlocked. Zadaci: „Svi čitatelji Gita sivi”, „Rotirajte SMS ključ u < 5 min bez lozinke u Gitu”, „Ispravno reagirajte na procurjeli commit”, „Preživite nedostupan trezor”.

Controls:
- Segmented pristup: običan Secret u Gitu / SealedSecret / SOPS / ESO + trezor / CSI driver / argocd-vault-plugin
- Prekidači „Šifriranje u mirovanju” i „RBAC s najmanjim ovlastima”
- Segmented potrošnja: env / volumen
- Gumb „Rotiraj ključ”
- Gumbi za kvar: „Spremi običan Secret u Git”, „Izgubi privatni ključ kontrolera”, „Procurio privatni ključ kontrolera”, „Trezor nedostupan”, „Token u CI logu”

Model (exact rules):
Extends the L16 graph. Git-history reader: reads any value ever committed as plain/base64; SealedSecret/SOPS ciphertext unreadable – unless the controller's private keys leak, then every SealedSecret ever committed turns red until the real values are rotated. Argo CD Redis reader: red iff argocd-vault-plugin (rendered plaintext cached). Ex-employee: red until rotation. CI-log reader: red iff token printed. After decryption/sync every approach yields an ordinary Secret (CSI without sync: none, but Pod creators can still mount) → Pod creators stay red (honest limit). Rotation: ESO polls every refreshInterval (sim 30 s) → Secret updated → volume consumers after kubelet sync, env after restart; Sealed Secrets: re-seal, commit, Argo CD sync (key renewal alone rotates nothing); CSI re-fetches when rotation is enabled. Store down: ESO keeps the last synced Secret (running and new Pods fine, rotation stalls); CSI → new Pods stuck ContainerCreating. Lost private key → rebuilt cluster can't decrypt SealedSecrets → no Secret → Pods stuck in CreateContainerConfigError (secretKeyRef) or ContainerCreating with FailedMount (secret volume). Deleting a leaked commit doesn't close the eye – only rotation does.

Break it: A plain Secret stored in Git turns the Git-history eye red forever until rotation; losing the private key blocks decryption after a rebuild and Pods can't start; a leaked private key exposes every SealedSecret ever committed; with the store down ESO keeps serving while CSI blocks new Pods; argocd-vault-plugin exposes plaintext in Argo CD's cache.

Insight: Git may hold a lock (encrypted value) or an address (reference), never the key; whatever the tool, the value ends up readable to whoever can create Pods in the namespace – RBAC and rotation still matter.

## Code artifacts
- kubeseal i SealedSecret (yaml): bitnami.com/v1alpha1
- Sigurnosna kopija ključeva kontrolera (bash): kubectl get secret -l sealedsecrets.bitnami.com/sealed-secrets-key -o yaml (store outside the cluster)
- ExternalSecret i ClusterSecretStore (yaml): external-secrets.io/v1 – verify against ESO v2.x
- SecretProviderClass (yaml): Closed
- SOPS datoteka s age ključem (yaml): Closed

## Misconceptions (Croatian myth + English correction)
- „Secret u base64 u privatnom repozitoriju je u redu” — every clone, backup and CI log can decode it.
- „Obrisao sam commit, riješeno” — clones keep it; rotate the secret.
- „Obnova ključa Sealed Secretsa svakih 30 dana rotira tajne” — it only adds a new sealing key; old SealedSecrets and the real values stay the same.
- „Zapečaćena tajna sigurna je i unutar klastera” — once unsealed it is an ordinary Secret.
- „Koristite argocd-vault-plugin” — Argo CD discourages it (plaintext in the Redis cache); no release since June 2024.
- „Vault je open source pod MPL-om” — BSL 1.1 since August 2023; OpenBao is the MPL fork.
- „External Secrets Operator je napušten” — releases resumed in September 2025 and continue.
- „Uz vanjski trezor nema Kubernetesova Secreta” — ESO creates one.

## Key facts (verified; date-sensitive ones belong in fact callouts)
- [tech-facts] Argo CD recommends destination-cluster secret management (Sealed Secrets, ESO, CSI driver, Vault Secrets Operator), not manifest-generation plugins: Argo CD would need secret access, rendered manifests sit in plaintext in its Redis cache, updates couple to syncs; argocd-vault-plugin last released v1.18.1 (June 2024).
- [tech-facts] ESO: CNCF Sandbox; paused releases 2025-08-13, resumed with v0.20.0 (2025-09-22), v1.0.0 (2025-11-07), now v2.11.0 (2026-09-18).
- [tech-facts] Sealed Secrets: SealedSecret safe in Git, scopes strict/namespace/cluster, a new sealing key added every 30 days with old keys kept (v0.40.0).
- [tech-facts] SOPS encrypts values not keys (age, PGP, cloud KMS), CNCF Sandbox; Flux decrypts natively, Argo CD has no native support.
- [tech-facts] Vault is BSL 1.1 since Aug 2023 (now IBM); OpenBao is the MPL-2.0 fork under OpenSSF.
- [tech-facts] Secrets Store CSI Driver mounts tmpfs at Pod start, optional sync and rotation.
- [tech-facts] A missing Secret: secretKeyRef → CreateContainerConfigError; secret volume → ContainerCreating with FailedMount.

## Analogies (always with where they break down)
- Brava ili adresa: u Git smije zaključana kutija (SealedSecret) ili adresa sefa (ExternalSecret), nikad ključ. Breaks down: once unlocked in the cluster it is an ordinary Secret again, and if the lock's private key leaks, every old box opens.

## Glossary terms introduced
Sealed Secrets, External Secrets Operator

## Bridge to next (CostNote)
Svi su dijelovi na mjestu: slike, klaster, pipeline, Git i tajne. Petak je, 11:55, a popust za Ćevap-petak krivo se obračunava. Ispravak mora stići do korisnika prije 12:00.
