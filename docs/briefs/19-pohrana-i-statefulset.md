# Lecture 19 — Podatci koji preživljavaju: volumeni i StatefulSet
_Zašto Pod smije umrijeti, a podatci ne – i zašto `replicas: 3` nije klaster baze._ · ~35 min · module m4 · prerequisites: 13, 05, 14, 18
Folder: `src/lectures/19-pohrana-i-statefulset/` · URL: `/predavanje/pohrana-i-statefulset`
Engines: E3 → src/engines/cluster/

## Continuity
- Previous lecture (18 Automatsko skaliranje: ručak bez dežurstva) ends with: Cluster Autoscaler je noću ispraznio i uklonio jedan čvor. Na njemu je bio Postgres, koji je Iva pokrenula „kao i sve ostalo” – u Deploymentu. Pod se preselio, a ujutro su sve narudžbe nestale.
- Next lecture (20 Što je deploy: postavljanje, izdanje i strategije) opens with: Petak, 11:30. Verzija 2.0 krene postupnim ažuriranjem i do 11:50 svi korisnici vide krivo izračunat PDV na svakoj petoj narudžbi. Usto je migracija preimenovala stupac u bazi pa se stari Podovi, koji još rade tijekom uvođenja, ruše. Što znači postaviti novu verziju i kako to napraviti tako da greška pogodi što manje ljudi?

## Hook (incident)
Postgres je radio u Deploymentu bez trajnog volumena i preselio se bez podataka. A kad je netko ranije postavio `replicas: 3`, dobili smo tri različite tablice narudžbi koje je Service nasumično miješao. Gdje u Kubernetesu žive podatci i kako bazi dati stalan identitet?

## Objectives (rendered by the page hero)
- predvidjeti što preživljava ponovno pokretanje kontejnera, brisanje Poda i pad čvora uz datotečni sustav kontejnera, emptyDir i PersistentVolume
- objasniti lanac PersistentVolumeClaim → PersistentVolume → StorageClass
- objasniti načine pristupa (RWO = jedan čvor) i zašto premještanje diska nakon naglog pada čvora traje minutama ili čeka čovjeka
- objasniti što StatefulSet daje (ime, disk, redoslijed, headless Service), a što ne (replikaciju)
- odabrati između upravljane baze, operatora i baze u StatefulSetu

## Scenes
### 1. Preživljavaju li podatci? (simulation)
- Concept: Flagship part 1.
- Visual: See flagship.
### 2. Narudžbenica za disk (animation)
- Concept: PVC (10Gi, RWO, StorageClass) bound to a PV; StorageClass provisions on demand via a CSI driver; dynamic volumes default to reclaim Delete; WaitForFirstConsumer; PVC protection: a PVC in use stays Terminating until no Pod uses it.
- Visual: Claim ticket and factory.
### 3. Načini pristupa i premještanje (diagram)
- Concept: RWO = one node (Pods on it may share), ROX, RWX, RWOP = one Pod. After a sudden node failure: NotReady → after 300 s Pods marked for eviction but stay Terminating (kubelet unreachable); a replacement Pod waits with a Multi-Attach error until the volume is force-detached after 6 min, or until someone applies the node.kubernetes.io/out-of-service taint (non-graceful node shutdown, GA 1.28), which force-deletes Pods and detaches volumes immediately.
- Visual: Nodes allowed to attach; disk stuck on the dead node with a timer; out-of-service taint releasing it.
### 4. Tri baze umjesto jedne (animation)
- Concept: replicas: 3 Postgres with per-Pod storage (none or emptyDir) = three independent DBs behind a random Service; with one shared RWO PVC → Multi-Attach errors on other nodes or two Postgres processes on one data directory (startup failure or corruption risk); replication is the database's job (callback L05).
- Visual: Three DBs with different rows; variant with one disk and two clashing processes.
### 5. Identitet: StatefulSet (interactive)
- Concept: db-0/1/2 in order, PVC data-db-N each, headless Service (clusterIP: None – DNS returns Pod IPs, introduced here) gives stable DNS db-1.db.klopa.svc.cluster.local; delete db-1 → same name and PVC; scale down from highest ordinal, PVCs retained; after a sudden node loss db-N is NOT recreated until the node is confirmed dead – never two db-1.
- Visual: Deployment vs StatefulSet small multiples; DNS lookup of the headless Service returning Pod IPs.
### 6. Kad StatefulSet nije dovoljan (text)
- Concept: Operators (CRD + controller that knows replication, failover and backups, e.g. CloudNativePG) or a managed DB. For production Klopa we recommend a managed database or a Postgres operator; in the course Postgres stays a StatefulSet so we can see the mechanics. Backups/snapshots one line.
- Visual: Decision tree.

## Flagship simulation: Preživljavaju li podatci?
Part 1: three Postgres Pods (container filesystem / emptyDir / PVC) with order counters against destructive events. Part 2: Deployment vs StatefulSet small multiples. Zadaci: „Sačuvajte narudžbe kroz pad čvora (uključujući korak out-of-service)”, „Smanjite na 1 pa vratite na 3 – podatci db-2 ostaju”, „Dijagnosticirajte bug s tri baze”.

Controls:
- Gumbi „Ponovno pokreni kontejner”, „Obriši Pod”, „Čvor pao”
- Gumb „Označi čvor kao ugašen (out-of-service)”
- Klizač replicas StatefulSeta 0–3
- Gumb „replicas: 3 za Postgres u Deploymentu” (bez volumena / jedan zajednički PVC)
- Gumbi za kvar: „Obriši PVC”, „Obriši StatefulSet”

Model (exact rules):
Container writable layer: lost on container restart (a restarted container starts fresh from the image). emptyDir: survives container restart, deleted with the Pod. PVC-backed PV (mounted at /var/lib/postgresql for postgres:18+; fresh cloud disks contain lost+found, so PGDATA stays in a subdirectory – the 18+ default 18/docker does this): survives restart, deletion and rescheduling. Non-graceful node failure ('Čvor pao'): node NotReady → after 300 s Pods are marked for eviction but stay Terminating (kubelet unreachable). Deployment+PVC: the ReplicaSet creates a replacement at once (terminating Pods not counted), but the RWO volume is still attached to the dead node → new Pod waits in ContainerCreating (Multi-Attach error) until force detach after 6 min. StatefulSet: db-N is NOT recreated (its name and PVC are still taken) until the node returns, the Pod is force-deleted, or the node gets the taint node.kubernetes.io/out-of-service (then Pods are force-deleted and volumes detached immediately). Badge: '20 s (sim) · stvarno: 5 min + do 6 min; StatefulSet čeka potvrdu da je čvor ugašen'. Deployment replicas 3 without a volume or with emptyDir → three databases; Service picks one at random per connection → orders appear to vanish; with one shared RWO PVC → Multi-Attach on other nodes, or two Postgres processes on one directory on the same node (startup lock failure / corruption risk). StatefulSet (OrderedReady): db-N created after db-(N−1) Ready; PVC per ordinal from volumeClaimTemplates; stable DNS via headless Service; deleted db-1 returns as db-1 on the same PVC; scale-down removes highest ordinal first; PVCs retained by default; deleting the StatefulSet keeps PVCs. 'Obriši PVC': PVC protection keeps it Terminating while a Pod uses it, then PV and disk are deleted (reclaim Delete). No data replication by the StatefulSet.

Break it: „Čvor pao” wipes the container-filesystem and emptyDir variants, delays the Deployment+PVC variant by minutes and leaves the StatefulSet waiting until someone marks the node out-of-service; replicas: 3 in a Deployment creates three databases (or clashing processes on one disk); „Obriši PVC” deletes the data for good once no Pod uses it.

Insight: Pods are ephemeral and storage has its own lifecycle; a StatefulSet gives identity – name, disk, order – and prefers 'never two db-1' over availability, so after a sudden node loss someone must confirm the node is dead; replication remains the database's job.

## Code artifacts
- pvc.yaml (yaml): Claim with StorageClass
- statefulset.yaml s headless Serviceom (yaml): volumeClaimTemplates; mount at /var/lib/postgresql (postgres:18+)
- kubectl get sc,pv,pvc i describe pvc (bash): Why a PVC is Pending
- kubectl taint nodes node-3 node.kubernetes.io/out-of-service=nodeshutdown:NoExecute (bash): Closed: non-graceful node shutdown recovery

## Misconceptions (Croatian myth + English correction)
- „Datotečni sustav kontejnera je trajan” — it is lost on restart or replacement.
- „Svaki volumen je trajan” — emptyDir dies with the Pod.
- „RWO znači jedan Pod” — one node; RWOP is one Pod.
- „Postgres s replicas: 3 je klaster baze” — it gives three independent databases (or clashing processes on one disk).
- „StatefulSet replicira podatke” — it gives identity only.
- „StatefulSet se nakon pada čvora sam preseli” — its Pod stays Terminating until the node is confirmed down (out-of-service taint or force delete), so two Pods never share one identity and disk.
- „Brisanje StatefulSeta briše podatke” — PVCs are retained by default.

## Key facts (verified; date-sensitive ones belong in fact callouts)
- [explainers] RWO = one node, RWOP = one Pod; StatefulSet PVC retention defaults to Retain.
- [tech-facts] Non-graceful node shutdown (out-of-service taint) GA in 1.28; attach/detach controller force-detaches after 6 min; default eviction toleration 300 s.
- [tech-facts] Avoid naked Pods – use Deployments, StatefulSets, DaemonSets or Jobs.
- [tech-facts] Old tutorials using bitnami/* database images break: the free catalogue moved to bitnamilegacy and docker.io/bitnami was removed on 2025-09-29; postgres:18+ changed its data path.

## Analogies (always with where they break down)
- Numerirana mjesta u dvorani: db-1 uvijek sjeda na svoje mjesto. Breaks down: the seat doesn't copy what's in your bag – no replication.

## Glossary terms introduced
PersistentVolume, PersistentVolumeClaim, StatefulSet

## Bridge to next (CostNote)
Infrastruktura je stabilna: Podovi se obnavljaju, skaliraju i čuvaju podatke. Najveći rizik postale su naše vlastite promjene. U petak u 11:30 izlazi `klopa-api:2.0.0` s novom košaricom.
