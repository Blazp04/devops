# Lecture 11 — Klaster iznutra: što se dogodi nakon kubectl apply
_Ploča na zidu, oni koji je čitaju i oni koji pokreću kontejnere._ · ~35 min · module m3 · prerequisites: 10, 08
Folder: `src/lectures/11-klaster-iznutra/` · URL: `/predavanje/klaster-iznutra`
Engines: E3 → src/engines/cluster/

## Continuity
- Previous lecture (10 Zašto Kubernetes: željeno stanje i petlja usklađivanja) ends with: Lana napiše prva dva manifesta, za API i za workera, i pokrene `kubectl apply`. Terminal odgovori „pod/klopa-api created” i „pod/klopa-worker created” – ali aplikacija ne odgovara. Tko zapravo radi posao i gdje je zapelo?
- Next lecture (12 Pod: najmanja jedinica i njezino zdravlje) opens with: Podovi s klopa-api naizmjence pišu Running 1/1 i CrashLoopBackOff 0/1, a od 3057 zahtjeva u 150 s nije prošao nijedan: aplikacija 40 sekundi puni predmemoriju, a kubelet je prije toga gasi i ponovno pokreće nakon 10, 20 pa 40 sekundi. A Pod klopa-worker koji je Lana obrisala da ga ponovno pokrene nikad se nije vratio. Što je Pod i kako Kubernetes razlikuje „radi” od „spreman je”?

## Hook (incident)
Terminal kaže „created”, ali klopa-api stoji u stanju ImagePullBackOff, a klopa-worker u Pendingu. „Created” očito ne znači „radi”. Tko je primio Lanin zahtjev, tko bira čvor, tko povlači sliku – i tko je tu zapeo?

## Objectives (rendered by the page hero)
- nabrojati komponente upravljačke ravnine i čvora te ulogu svake
- pratiti put manifesta od kubectl apply do pokrenutog kontejnera
- objasniti zašto sve komponente razgovaraju samo s API poslužiteljem i zašto je etcd izvor istine
- predvidjeti što se događa s aplikacijama kad stane upravljačka ravnina ili čvor
- čitati stanje klastera naredbama `kubectl get` i `kubectl describe` i iz događaja te odvojiti okruženja Namespaceom

## Scenes
### 1. Ploča na zidu (animation)
- Concept: API server + etcd = shared whiteboard; components watch it and never call each other; only the API server talks to etcd.
- Visual: Hub-and-spoke with pulsing watch lines.
### 2. Put jedne izjave (animation)
- Concept: 1 kubectl → API server (authn/authz/admission strip) 2 → etcd (kubectl returns here) 3 a controller creates Pod objects – only when a controller owns the object (a Deployment creates a ReplicaSet, which creates Pods, L13); a bare Pod skips this step 4 scheduler binds a node 5 kubelet → CRI → containerd pulls and starts 6 status back.
- Visual: Numbered messages; ghosts become solid; the bare-Pod path skips step 3.
### 3. Anatomija objekta (diagram)
- Concept: apiVersion/kind/metadata/spec/status; spec dashed (desired), status solid (actual).
- Visual: YAML split into ghost and solid halves.
### 4. Tko pokreće kontejnere (animation)
- Concept: kubelet → CRI → containerd/CRI-O → runc; no Docker daemon; Kubernetes ≥1.36 needs containerd 2.x.
- Visual: Stack (callback L08 DeepDive).
### 5. Namespace (interactive)
- Concept: Same names in klopa and klopa-staging; kube-system; names scoped, not a security boundary by itself.
- Visual: Two folders with identical names.
### 6. Gdje živi klaster (text)
- Concept: Managed (EKS/GKE/AKS) vs self-hosted; nodes are usually VMs; learning: kind, minikube, Killercoda; Headlamp replaces the archived Dashboard.
- Visual: Cards.

## Flagship simulation: Klaster pod mikroskopom
E3: control-plane hexagons and 3 worker nodes with watch lines; scrub replicas, apply manifests, switch components off; numbered messages and an event log like kubectl get events. Zadaci: „Povežite pet simptoma s komponentom”, „Dovedite Pod iz ImagePullBackOff do Running”.

Controls:
- Klizač „replicas (ReplicaSet – više u L13)” 0–9 / gumb „kubectl apply”
- Prekidači: API poslužitelj, etcd, raspoređivač, controller-manager, kubelet na čvoru-2
- Gumbi za kvar: „Krivi tag slike”, „Napuni čvorove”, „Obriši Pod”, „Ugasi čvor”
- Vremenska crta s premotavanjem

Model (exact rules):
Tick 100 ms. Objects live in 'etcd'; API server is the only writer; watchers react after 100–300 ms. The replicas slider drives an object labelled 'ReplicaSet (pretpregled – detaljno u 13. predavanju)' whose controller creates/deletes Pod objects to match; the scene also contains one bare Pod (klopa-worker) that is NOT replaced when deleted, even with the controller-manager on (plants L12). Scheduler binds unbound Pods to Ready nodes with free abstract slots (requests come in L17), most free first. kubelet: pull (1 s cached / 3 s) → ContainerCreating → Running; wrong tag → ErrImagePull → ImagePullBackOff with growing retry. Off-switches: API server → kubectl errors, nothing changes, Pods keep serving; etcd → writes fail, Pods keep serving; scheduler → new Pods Pending forever; controller-manager → deleted Pod not replaced. kubelet on node-2 off → containers there keep running, node shows NotReady (Unknown) after tens of seconds (compressed); after the default 300 s not-ready toleration (badge 'stvarno ~5 min') its Pods are marked for deletion but stay Terminating because no kubelet confirms; ReplicaSet-owned Pods are recreated elsewhere, the bare Pod is not (StatefulSet Pods behave differently – L19). 'Ugasi čvor' (separate button) → machine and containers gone, same control-plane sequence. 'Napuni čvorove' → FailedScheduling '0/3 nodes are available: 3 Insufficient memory' (mechanism in L17). Events: Scheduled, Pulling, Pulled, Created, Started, FailedScheduling, BackOff.

Break it: Scheduler off → Pending forever; controller-manager off → a deleted Pod is not replaced; whole control plane off → Pods keep serving but nothing heals; wrong tag → ImagePullBackOff; kubelet off → NotReady, and only after ~5 min are ReplicaSet Pods recreated elsewhere while the old ones hang in Terminating.

Insight: kubectl apply only writes onto the whiteboard; independent components watch it and work asynchronously; the data plane survives a control-plane outage.

## Code artifacts
- namespace.yaml (yaml): First manifest
- kind create cluster, kubectl get nodes -o wide, get pods -n kube-system (bash): Look around a cluster
- kubectl describe pod: Events (log): Scheduled → Pulling → BackOff

## Misconceptions (Croatian myth + English correction)
- „Upravljačka ravnina pokreće moje kontejnere” — it decides and records; the kubelet starts containers through the runtime.
- „Ako padne upravljačka ravnina, padaju sve aplikacije” — running Pods keep serving; only healing, scheduling and changes stop.
- „Raspoređivač pokreće kontejnere” — it only binds a Pod to a node.
- „Komponente se pozivaju izravno” — everything watches the API server; only the API server talks to etcd.
- „Kubernetes koristi Docker” — dockershim was removed in 1.24; runtimes are reached through CRI.
- „master čvor” — say upravljačka ravnina; since 1.24 kubeadm uses only the control-plane label and taint.
- „Instalirajte Kubernetes Dashboard” — archived; use Headlamp.

## Key facts (verified; date-sensitive ones belong in fact callouts)
- [tech-facts] Control plane: kube-apiserver, etcd, kube-scheduler, kube-controller-manager, optional cloud-controller-manager; node: kubelet, container runtime, optional kube-proxy.
- [tech-facts] kubeadm applies only the control-plane label/taint since 1.24.
- [tech-facts] Dockershim removed in 1.24; runtimes: containerd, CRI-O, cri-dockerd, Mirantis; 1.35 is the last release supporting containerd 1.x (current containerd 2.4.1, as of 2026-10).
- [tech-facts] Default not-ready/unreachable toleration 300 s before eviction; Pods on an unreachable node stay Terminating until the kubelet confirms or they are force-deleted.
- [tech-facts] Kubernetes Dashboard archived; Headlamp is the successor (2026-06).
- [tech-facts] kube-dns deprecated in 1.37 – use CoreDNS.

## Analogies (always with where they break down)
- Ploča na zidu u restoranu: jedina istina, osoblje je čita i radi samostalno. Breaks down: nobody gives orders – components watch the board and act on their own.

## Glossary terms introduced
Control plane, API server, etcd, Scheduler, kubelet, Namespace, Pending

## Bridge to next (CostNote)
Lana je ispravila tag i Podovi s `klopa-api` pišu `Running` i `1/1` – ali narudžbe ne prolaze. Aplikacija 40 sekundi puni predmemoriju, kontejner se prije toga ruši, a kubelet ga podiže sve sporije: nakon 10, 20 pa 40 sekundi. Što je točno Pod i kako Kubernetes zna je li aplikacija zdrava?
