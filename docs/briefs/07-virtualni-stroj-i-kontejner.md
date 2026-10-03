# Lecture 07 — Virtualni stroj i kontejner
_Dva načina dijeljenja jednog računala – i zašto je kontejner samo proces s naočalama i pojasom._ · ~35 min · module m2 · prerequisites: 02, 06
Folder: `src/lectures/07-virtualni-stroj-i-kontejner/` · URL: `/predavanje/virtualni-stroj-i-kontejner`
Engines: none (small local seeded models / steppers)

## Continuity
- Previous lecture (06 Redovi poruka i događaji) ends with: Klopa sad ima šest vrsta procesa – web, API, worker, Postgres, Redis i RabbitMQ – na tri ručno konfigurirana poslužitelja. U tim dolazi Iva, prvi dan pokrene API i kaže: „Kod mene radi, na poslužitelju ne.”
- Next lecture (08 Docker: od Dockerfilea do kontejnera) opens with: Iva je napisala prvi Dockerfile za Klopu, u korijenu repozitorija. Nakon promjene jednog retka koda izgradnja traje 44 s, slika ima 1,7 GB, a Davor je u njoj pronašao datoteku `.env` s ključem za SMS-gateway. Uz to, `latest` na poslužitelju nije isti `latest` kao na Ivinom laptopu. Kako se slika zapravo gradi?

## Hook (incident)
Iva na laptopu ima najnoviji Python, a na poslužitelju je verzija stara dvije godine. API i worker trebaju dvije različite verzije sistemske biblioteke za obradu fotografija (libvips) koju instalira operacijski sustav, a poslužitelj-2 netko je prije godinu dana ručno konfigurirao pa se razlikuje od poslužitelja-1. Kako aplikaciji dati njezino okruženje, a da ne kupimo računalo za svaku?

## Objectives (rendered by the page hero)
- objasniti put od fizičkog poslužitelja preko virtualnog stroja do kontejnera
- usporediti virtualni stroj i kontejner po izolaciji, gustoći i brzini pokretanja
- objasniti da je kontejner izolirani proces: imenski prostori određuju što vidi, kontrolne grupe koliko smije potrošiti
- objasniti zašto u oblaku kontejneri rade unutar virtualnih strojeva i zašto Docker na Macu pokreće Linux VM
- prepoznati kada arhitektura procesora sprječava pokretanje slike

## Scenes
### 1. Tri ere (animation)
- Concept: Traditional (one app per server), virtualized (VM with full OS), containers (shared OS) – from the Kubernetes overview; system-library conflicts and snowflake servers.
- Visual: Three panels morphing; library-conflict glyph (libvips 8.12 vs 8.15).
### 2. Slojevi: VM ili kontejner (animation)
- Concept: hardware → hypervisor → guest OS with own kernel → app vs hardware → host kernel → runtime → app process with its userspace libraries.
- Visual: Stack morph with layoutId.
### 3. Kontejner je samo proces (interactive)
- Concept: Same process is PID 1 inside, PID 48213 on the host; uname -r identical.
- Visual: Process tree toggle „Pogled iz kontejnera / s domaćina” preserving identity.
### 4. Naočale i pojas (interactive)
- Concept: Namespaces change what the process sees – main path shows pid, net and mnt; DeepDive lists all eight Linux namespace types (pid, net, mnt, uts, ipc, user, cgroup, time). cgroups: memory.max → OOM kill, cpu.max 20000 100000 → throttled periods (planted for L17).
- Visual: Three lens toggles (+ DeepDive list); memory scrubber with OOM burst; greyed CPU periods.
### 5. Cijena izolacije (animation)
- Concept: Main path: shared kernel → a kernel exploit crosses containers; a VM stops at the hypervisor. Closed DeepDive spectrum: plain container → container with a user namespace (an escape lands as an unprivileged host UID; the kernel is still shared, so a kernel exploit still crosses; user namespaces in Pods GA in Kubernetes 1.36) → gVisor (user-space kernel) → microVM (Kata, Firecracker) → full VM.
- Visual: Crack spreading; isolation spectrum slider inside the DeepDive.
### 6. Kontejneri u VM-ovima (animation)
- Concept: Cloud nodes are VMs; Docker Desktop on macOS runs a Linux VM; amd64 vs arm64 images: on Apple silicon Docker Desktop runs amd64 images under emulation (slower, sometimes broken); on an arm64 Linux node without emulation an amd64-only image fails ('no matching manifest' or 'exec format error').
- Visual: Nested boxes; Mac laptop with hidden VM; architecture mismatch error.

## Flagship simulation: Slagač stoga
A 16 GB host in VM mode or container mode: add Klopa apps, watch RAM accounting, a start race and isolation. Zadaci: „Smjestite 12 aplikacija na 16 GB”, „Ograničite curenje memorije na jednu aplikaciju”, „Pronađite način u kojem napad na jezgru ne prelazi granicu”.

Controls:
- Prekidač „VM / Kontejneri”
- Gumb „Dodaj aplikaciju” (api, worker, web, Postgres, Redis, RabbitMQ)
- Gumb „Pokreni sve”
- Prekidač „memory.max” po aplikaciji
- Gumbi za kvar: „Curenje memorije”, „Napad na jezgru”
- Prekidač „U oblaku: kontejneri u VM-ovima”
- Napredno: prekidač „Korisnički imenski prostor (user namespace)”

Model (exact rules):
Host 16 GB, host OS 1 GB. VM mode: each VM reserves guest OS ~1 GB (shown as range 0,5–2 GB, 'ilustrativno') + app memory; container mode: app memory + shared runtime 0,2 GB. App memory (illustrative): api 300 MB, worker 400 MB, web 150 MB, Postgres 1 GB, Redis 200 MB, RabbitMQ 300 MB. Start race: VM stages firmware → kernel → init → app as ranges of seconds; container 'process start' as a sub-second-to-seconds range (no fake precise numbers). Leak +20 MB/s: container without memory.max → host OOM killer may kill another large process; with memory.max → only that container OOM-killed; VM mode → confined to its VM. Exploit: container mode → all containers on host (with user namespace on: still all containers, attacker labelled 'neprivilegirani korisnik na domaćinu'); VM mode → stops at hypervisor; cloud toggle → confined to one VM. The container stack never shows a guest kernel.

Break it: „Napad na jezgru” cracks every container (user namespaces only lower the attacker's privileges) but stops at the hypervisor; „Curenje memorije” without memory.max lets the host OOM killer hit a neighbour.

Insight: A container is an isolated process sharing the host kernel – isolation is traded for density and speed; in the cloud the answer is usually both.

## Code artifacts
- docker run --memory 256m --cpus 0.5 i ps na domaćinu (bash): See the container as a host process
- uname -r unutra i vani (bash): Same kernel (on a Mac: the VM's kernel)
- unshare --pid --fork --mount-proc bash (bash): Closed, Linux-only container from scratch

## Misconceptions (Croatian myth + English correction)
- „Kontejner je lagani virtualni stroj” — an isolated host process with no kernel of its own (visible in the host's ps, same uname -r).
- „Kontejneri izoliraju jednako kao VM-ovi” — they share the host kernel; a kernel exploit crosses containers, a VM stops at the hypervisor.
- „Kontejneri su zamijenili VM-ove” — cloud nodes are usually VMs running containers.
- „Docker na Macu radi nativno” — Docker Desktop runs Linux containers in a hidden Linux VM.
- „Svaka slika radi svugdje” — CPU architecture and kernel matter (amd64 vs arm64, emulation).

## Key facts (verified; date-sensitive ones belong in fact callouts)
- [tech-facts] A container is an isolated process with all the files it needs; containers share the host kernel; a VM has its own kernel.
- [tech-facts] Isolation via Linux namespaces (eight types incl. time) and cgroups (OCI runtime spec).
- [tech-facts] Docker Desktop on macOS runs containers in a Linux VM (Apple Virtualization framework default); amd64 images run under emulation on Apple silicon.
- [tech-facts] User namespaces in Pods GA in Kubernetes 1.36 (reduce privileges after an escape, do not stop kernel exploits); kubelet fails on cgroup v1 by default since 1.35; Docker 29 deprecates and Podman 6.0 drops cgroup v1.

## Analogies (always with where they break down)
- Kuća (VM) i stan (kontejner). Breaks down: apartment walls are solid but container isolation is weaker, a container has no own kernel, and containers are disposable.
- Naočale (imenski prostori) i pojas (kontrolne grupe). Breaks down: glasses and belt are added by the kernel, not worn by the process – it can't take them off.

## Glossary terms introduced
Virtual machine, Kernel, Container, Linux namespace, cgroup

## Bridge to next (CostNote)
Sad znamo da je kontejner proces s naočalama i pojasom. Ali kako Klopu – kod, Python, Node za izgradnju weba i sistemske biblioteke – zapakirati tako da se na Ivinom laptopu i na poslužitelju pokrene potpuno isto?
