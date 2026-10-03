# Ecosystem fact sheet for the Kubernetes and distributed-systems curriculum (state as of 2026-10-01)

Format: each fact is tagged `[VERIFIED <url>]` or `[UNVERIFIED]`. "GH releases" means the project's GitHub Releases list, queried on 2026-10-01. Lines marked **Recommendation** are my teaching advice, not facts.

---

## 0. Version snapshot (what "current" means today)

| Component | Current version (date) | Source |
|---|---|---|
| Kubernetes | **1.37.1** (1.37.0 "Garhwal" released 2026-08-26). Supported: 1.37, 1.36, 1.35. 1.34 reaches EOL on 2026-10-27 | [VERIFIED https://kubernetes.io/releases/] |
| Gateway API | **v1.6.2** (v1.6.0 released 2026-06-29/30) | [VERIFIED https://github.com/kubernetes-sigs/gateway-api/releases] |
| containerd | 2.4.1 (2026-09-24). 1.7.36 still gets patches, but Kubernetes ≥1.36 requires containerd 2.x | [VERIFIED https://github.com/containerd/containerd/releases] |
| CRI-O / runc | 1.37.1 / 1.5.2 | [VERIFIED https://github.com/cri-o/cri-o/releases], [VERIFIED https://github.com/opencontainers/runc/releases] |
| Docker Engine | **29.8.2** (2026-09-30); 29.0.0 was released 2025-11-10 | [VERIFIED https://docs.docker.com/engine/release-notes/29/] |
| Docker Compose | **v5.5.1** (v5.0.0 released 2025-12-02) | [VERIFIED https://github.com/docker/compose/releases] |
| BuildKit | v0.33.1 | [VERIFIED https://github.com/moby/buildkit/releases] |
| Podman | 6.1.3 (6.0.0 released 2026-06-24) | [VERIFIED https://github.com/containers/podman/releases] |
| OCI specs | image-spec v1.1.1, runtime-spec v1.3.0, distribution-spec v1.1.1 | [VERIFIED https://github.com/opencontainers/image-spec/releases] |
| Helm | 4.3.0 (Helm 3.22.0 is still released) | [VERIFIED https://github.com/helm/helm/releases] |
| Argo CD | **3.5.3** (3.5.0 released 2026-08-04); 3.6.0-rc1 is out | [VERIFIED https://github.com/argoproj/argo-cd/releases] |
| Argo Rollouts / Flux | 1.10.0 / 2.9.6 | [VERIFIED https://github.com/argoproj/argo-rollouts/releases], [VERIFIED https://github.com/fluxcd/flux2/releases] |
| External Secrets Operator | v2.11.0 (2026-09-18) | [VERIFIED https://github.com/external-secrets/external-secrets/releases] |
| Sealed Secrets / SOPS | v0.40.0 / v3.13.3 | [VERIFIED https://github.com/bitnami-labs/sealed-secrets/releases], [VERIFIED https://github.com/getsops/sops/releases] |
| Vault / OpenBao | Vault 2.1.1 / OpenBao 2.7.0 | [VERIFIED https://github.com/hashicorp/vault/releases], [VERIFIED https://github.com/openbao/openbao/releases] |
| Secrets Store CSI Driver | 1.6.1 | [VERIFIED https://github.com/kubernetes-sigs/secrets-store-csi-driver/releases] |
| VPA / Karpenter / Cluster Autoscaler / KEDA / metrics-server | 1.8.0 / 1.14.1 / 1.36.1 / 2.21.0 / 0.9.0 | [VERIFIED https://github.com/kubernetes/autoscaler/releases], [VERIFIED https://github.com/kubernetes-sigs/karpenter/releases], [VERIFIED https://github.com/kedacore/keda/releases] |
| Kafka | **4.3.1** (2026-06-25); 4.2.2 (2026-09-29) | [VERIFIED https://kafka.apache.org/community/downloads/] |
| RabbitMQ / NATS server / Strimzi | 4.3.6 / 2.15.0 / 1.2.0 | [VERIFIED https://github.com/rabbitmq/rabbitmq-server/releases], [VERIFIED https://github.com/nats-io/nats-server/releases], [VERIFIED https://github.com/strimzi/strimzi-kafka-operator/releases] |
| kind / minikube / k3d | 0.33.0 / 1.39.0 / 5.9.0 | [VERIFIED https://github.com/kubernetes-sigs/kind/releases] |
| Gateway implementations | Envoy Gateway 1.9.2, NGINX Gateway Fabric 2.7.2, Traefik 3.7.13, ingress2gateway 1.2.0 | [VERIFIED https://github.com/envoyproxy/gateway/releases] |

---

## 1. Kubernetes

### 1.1 Release cadence and support
- Kubernetes ships **3 minor releases per year**. The cadence changed from 4 to 3 in 2021 (KEP merged 2021-04-23). [VERIFIED https://kubernetes.io/blog/2021/07/20/new-kubernetes-release-cadence/]
- Recent releases:
  - 1.33: 2025-04-23
  - 1.34: 2025-08-27
  - 1.35: 2025-12-17
  - 1.36: 2026-04-22
  - 1.37: 2026-08-26

  [VERIFIED https://kubernetes.io/blog/2026/08/26/kubernetes-v1-37-release/], [VERIFIED https://kubernetes.io/blog/2026/04/22/kubernetes-v1-36-release/], [VERIFIED https://kubernetes.io/blog/2025/12/17/kubernetes-v1-35-release/]
- 1.38 is "under planning", likely around December 2026. [UNVERIFIED exact date]
- The project keeps release branches for the **three most recent minors** (1.37, 1.36, 1.35). Each minor gets about **1 year of patch support**. [VERIFIED https://kubernetes.io/releases/]

### 1.2 Per-release changes worth teaching

**1.33**
- **Native sidecar containers are GA (stable).** [VERIFIED https://kubernetes.io/blog/2025/04/23/kubernetes-v1-33-release/]
- The **nftables kube-proxy backend is GA**, but iptables stays the default for compatibility. [VERIFIED same]
- The **Endpoints API is deprecated** in favour of EndpointSlices. [VERIFIED same; https://kubernetes.io/blog/2025/04/24/endpoints-deprecation/]

**1.34**
- The core of Dynamic Resource Allocation (DRA) is GA.
- KYAML arrives as alpha.
- containerd 1.x support was announced to end in 1.36.

[VERIFIED https://kubernetes.io/blog/2025/08/27/kubernetes-v1-34-release/]

**1.35**
- **In-place update of Pod resources (in-place resize) is GA.** CPU and memory can change without recreating the Pod.
- **cgroup v1:** the kubelet now fails to start on cgroup v1 nodes by default (`failCgroupV1: true`).
- **The ipvs mode of kube-proxy is deprecated.** nftables is the recommended replacement.
- **1.35 is the last release that supports containerd 1.x.**
- Image volumes are beta and on by default. They need containerd v2.1 or later.

[VERIFIED https://kubernetes.io/blog/2025/12/17/kubernetes-v1-35-release/]

**1.36**
- **OCI image/artifact volume source is GA**: a Pod can mount an image or OCI artifact as a volume.
- User namespaces in Pods are GA.
- Mutating Admission Policies are GA.
- `Service.spec.externalIPs` is deprecated, with removal planned for 1.43.
- The gitRepo volume is permanently disabled.
- The release blog records that **Ingress NGINX was retired on 2026-03-24**.

[VERIFIED https://kubernetes.io/blog/2026/04/22/kubernetes-v1-36-release/]

**1.37**
- 67 enhancements: 16 stable, 23 beta, 27 alpha, 1 deprecation.
- Stable: KYAML, the **metrics.k8s.io API (finally v1 after about 9 years in beta)**, Pod Certificates, ClusterTrustBundles, configurable HPA tolerance, the Storage Version Migrator moved in-tree, and several DRA features.
- Beta: **HPA scale-to-zero is enabled by default**. It only works with object or external metrics, not CPU or memory.
- Alpha: a Recreate strategy for StatefulSets, and Pod-level checkpoint/restore.
- Deprecations and removals:
  - **kube-dns is deprecated**; use CoreDNS. No new kube-dns packages after 1.40.
  - **kube-proxy ipvs mode**: disabled by default in 1.40 and removed in 1.43.
  - `kubectl run -f` is deprecated.
  - Static Pods can no longer reference Secrets or ConfigMaps.

[VERIFIED https://kubernetes.io/blog/2026/08/26/kubernetes-v1-37-release/]

### 1.3 Core concepts (verified definitions)
- **Control plane:** kube-apiserver, etcd, kube-scheduler, kube-controller-manager, and an optional cloud-controller-manager.
- **Node:** kubelet, kube-proxy and a container runtime. **kube-proxy is optional**, because some network plugins implement Services themselves.

  [VERIFIED https://kubernetes.io/docs/concepts/overview/components/]
- Say **"control plane", not "master"**. Since 1.24, kubeadm applies only the `node-role.kubernetes.io/control-plane` label and taint. [VERIFIED https://kubernetes.io/blog/2022/04/07/upcoming-changes-in-kubernetes-1-24/]
- The Kubernetes overview names three eras: traditional (physical servers), virtualized (VMs, each with a full OS), and containers ("relaxed isolation", sharing the OS).
  - Capabilities it lists: service discovery and load balancing, automated rollouts and rollbacks, bin packing, self-healing, secret and config management, horizontal scaling.
  - It also lists what Kubernetes **is not**: it does not build code, does not provide CI/CD, and does not provide middleware.

  [VERIFIED https://kubernetes.io/docs/concepts/overview/]
- **Native sidecars** are `initContainers` with `restartPolicy: Always`.
  - They start before the app containers, run for the Pod's whole life, and are terminated after the app containers.
  - They can have probes.
  - They do **not** block Job completion.

  [VERIFIED https://kubernetes.io/docs/concepts/workloads/pods/sidecar-containers/]
- **Deployment → ReplicaSet → Pods.**
  - The default strategy is RollingUpdate (`maxSurge` 25%, `maxUnavailable` 25%). The alternative is Recreate.
  - `revisionHistoryLimit` defaults to 10 and `progressDeadlineSeconds` to 600.
  - Roll back with `kubectl rollout undo`.

  [VERIFIED https://kubernetes.io/docs/concepts/workloads/controllers/deployment/]
- Avoid "naked Pods"; use Deployments, StatefulSets, DaemonSets or Jobs. Keep configuration in version control. [VERIFIED https://kubernetes.io/docs/concepts/configuration/overview/]
- Pod Security Admission (levels privileged, baseline, restricted; modes enforce, audit, warn) replaced PodSecurityPolicy, which was **removed in 1.25**. [VERIFIED https://kubernetes.io/docs/concepts/security/pod-security-admission/]

### 1.4 Container runtimes
- **Dockershim was removed in Kubernetes 1.24.** Kubernetes needs a runtime that implements CRI v1.
  - Documented runtimes: **containerd, CRI-O, Docker Engine through cri-dockerd, and Mirantis Container Runtime**.
  - On cgroup v2, use the systemd cgroup driver.

  [VERIFIED https://kubernetes.io/docs/setup/production-environment/container-runtimes/]
- Images built with `docker build` still work in Kubernetes because they are OCI images. "Docker" is a whole stack, and containerd is part of it. [VERIFIED https://kubernetes.io/blog/2020/12/02/dont-panic-kubernetes-and-docker/]

### 1.5 Services, kube-proxy and EndpointSlices
- **Service types:**
  - **ClusterIP** (the default): reachable only inside the cluster.
  - **NodePort**: a static port on every node; the default range is 30000–32767. It also creates a ClusterIP.
  - **LoadBalancer**: uses a cloud provider's load balancer.
  - **ExternalName**: returns a DNS CNAME.
  - **Headless** (`clusterIP: None`): DNS returns the Pod IPs directly.

  [VERIFIED https://kubernetes.io/docs/concepts/services-networking/service/]
- On bare metal, a LoadBalancer Service needs an add-on such as MetalLB. [UNVERIFIED in this pass; widely known]
- **kube-proxy modes on Linux:**
  - **iptables** is still the default in 1.37. A future version will switch the default to nftables.
  - **ipvs** is deprecated since 1.35, disabled by default from 1.40, and removed in 1.43.
  - **nftables** is the successor and needs kernel 5.13 or later.

  [VERIFIED https://kubernetes.io/docs/reference/networking/virtual-ips/]
- **How a Service picks a backend:** both iptables and nftables modes pick a backend Pod **at random** by default, unless `sessionAffinity: ClientIP` is set (default timeout 10800 s, i.e. 3 h). Only ipvs offered rr, wrr, lc, wlc and similar algorithms. [VERIFIED same]
- `spec.trafficDistribution`:
  - `PreferSameZone` prefers endpoints in the client's zone.
  - `PreferSameNode` (GA in 1.35) prefers endpoints on the client's node.
  - `PreferClose` is a deprecated alias.
  - With no value set, traffic is spread **evenly across all endpoints**.

  [VERIFIED same]
- Service load balancing works **per connection (L4)**. Long-lived HTTP/2 or gRPC connections stay pinned to one Pod. Fixes: client-side balancing over a headless Service, or a proxy or service mesh. [VERIFIED https://kubernetes.io/blog/2018/11/07/grpc-load-balancing-on-kubernetes-without-tears/]
- **EndpointSlices** replace Endpoints (deprecated since 1.33). When a readiness probe fails, the EndpointSlice controller **removes the Pod's IP** from the slices. [VERIFIED https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/]

### 1.6 Probes
- **Liveness probe fails:** the kubelet **restarts the container**.
- **Readiness probe fails:** the Pod is **removed from Service endpoints but not restarted**.
- **Startup probe:** liveness and readiness are **disabled until it succeeds**. If it fails, the container is killed and its restart policy applies.
- Probe mechanisms:
  - `exec`: succeeds on exit code 0.
  - `grpc`: succeeds when the status is SERVING.
  - `httpGet`: succeeds on status 200–399.
  - `tcpSocket`.

[VERIFIED https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/]

### 1.7 Autoscaling
- **HPA (autoscaling/v2)**:
  - Formula: `desiredReplicas = ceil(currentReplicas × currentMetricValue / desiredMetricValue)`.
  - The sync period is 15 s.
  - **Tolerance is 0.1 by default.** Since 1.37 it can be set per HPA (GA).
  - The **scale-down stabilization window is 300 s**.
  - With **multiple metrics, the highest proposed replica count wins**.
  - CPU and memory utilization is measured **relative to the container's resource requests**, so requests must be set.

  [VERIFIED https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/]
- HPA reads resource metrics from metrics-server through `metrics.k8s.io`, which became stable v1 in 1.37. [VERIFIED https://kubernetes.io/blog/2026/08/26/kubernetes-v1-37-release/]
- **VPA** is a **separate add-on** in the kubernetes/autoscaler repo, not part of core Kubernetes. Latest is 1.8.0 (2026-09-23). Update modes:
  - `Off`
  - `Initial`
  - `Recreate` (the default)
  - `InPlaceOrRecreate`: **GA in VPA 1.6.0** (2026-02-12) and on by default.
  - `InPlace`: added in VPA 1.7.0; never evicts Pods.
  - `Auto` is **deprecated** since VPA 1.5.

  [VERIFIED https://github.com/kubernetes/autoscaler/blob/master/vertical-pod-autoscaler/docs/quickstart.md; GH releases]
- Do not run VPA and HPA on the same CPU or memory metric. [VERIFIED https://github.com/kubernetes/autoscaler/blob/master/vertical-pod-autoscaler/docs/known-limitations.md]
- **Cluster Autoscaler and Karpenter** are both sponsored by SIG Autoscaling.
  - Cluster Autoscaler scales predefined **node groups**.
  - Karpenter **provisions nodes directly** from the constraints of pending Pods.
  - Karpenter supports AWS, Azure and GCP, plus AlibabaCloud, Cluster API, Hetzner, IBM, OCI, Proxmox and others. Some providers are alpha or beta.

  [VERIFIED https://kubernetes.io/docs/concepts/cluster-administration/node-autoscaling/], [VERIFIED https://github.com/kubernetes-sigs/karpenter]
- **KEDA** is CNCF graduated. It does event-driven autoscaling, including scale to and from zero, with 70+ scalers (RabbitMQ, Kafka, SQS…). It works alongside HPA. [VERIFIED https://keda.sh/]

### 1.8 PodDisruptionBudget
- A PDB limits how many replicas can be down at once during **voluntary** disruptions that go through the **Eviction API** (for example `kubectl drain`). It is set with `minAvailable` or `maxUnavailable`.
- It does **not** protect against node or hardware failures, or against deleting Deployments or Pods directly.

[VERIFIED https://kubernetes.io/docs/concepts/workloads/pods/disruptions/]

### 1.9 Tooling status
- The **Kubernetes Dashboard is archived** (moved to kubernetes-retired). **Headlamp** is the recommended successor. [VERIFIED https://kubernetes.io/blog/2026/06/01/dashboard-to-headlamp/]
- **Helm 4.0.0 was released on 2025-11-12**, the first major version in 6 years: WASM plugins and server-side apply. [VERIFIED https://helm.sh/blog/helm-at-kubecon-na-25]

---

## 2. Ingress vs Gateway API

- **The Ingress API is GA but FROZEN.** It is not deprecated and there are no plans to remove it, but it gets no further changes. The project recommends Gateway instead of Ingress. [VERIFIED https://kubernetes.io/docs/concepts/services-networking/ingress/]
- **Gateway API:**
  - It is an add-on whose CRDs are installed separately, and it needs a controller implementation.
  - It is "the successor to Ingress": role-oriented (infrastructure provider, cluster operator, application developer), portable, expressive (for example traffic weighting), and extensible.
  - Core kinds: GatewayClass, Gateway, HTTPRoute, GRPCRoute.

  [VERIFIED https://kubernetes.io/docs/concepts/services-networking/gateway/]
- Release history:
  - v1.0 GA: 2023-10-31. [VERIFIED https://kubernetes.io/blog/2023/10/31/gateway-api-ga/]
  - v1.5 (2026-03-14): ListenerSet, TLSRoute, CORS filter, ReferenceGrant and others moved to Standard. [VERIFIED https://kubernetes.io/blog/2026/04/21/gateway-api-v1-5/]
  - **v1.6.0 (2026-06-30):** **TCPRoute and UDPRoute moved to Standard (v1)**, and experimental resources moved to their own API group `gateway.networking.x-k8s.io`.
  - The Standard channel now contains Gateway, GatewayClass, HTTPRoute, GRPCRoute, TLSRoute, TCPRoute, UDPRoute, ListenerSet, ReferenceGrant and BackendTLSPolicy.

  [VERIFIED https://kubernetes.io/blog/2026/08/03/gateway-api-v1-6-release/]
- **Conformant implementations (v1.6.1)** include Envoy Gateway, Istio, Cilium, NGINX Gateway Fabric, Traefik, Kong Operator, GKE, kgateway, Calico, Airlock and others. AWS LB Controller and EKS are partially conformant. [VERIFIED https://gateway-api.sigs.k8s.io/implementations/]
- **Community ingress-nginx retirement:**
  - Announced on 2025-11-11 by SIG Network and the Security Response Committee: best-effort maintenance until March 2026, then no releases, bugfixes or security fixes, and read-only repositories.
  - Existing deployments keep working, and the charts and images remain available.
  - The replacement project, InGate, is also retired.
  - The "snippets" annotations were singled out as a security problem.
  - The guidance is to migrate to **Gateway API** (or another Ingress controller).

  [VERIFIED https://kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/]
  - On 2026-01-29 the Steering Committee and SRC repeated the warning, noting that ingress-nginx runs in about half of cloud-native environments. [VERIFIED https://kubernetes.io/blog/2026/01/29/ingress-nginx-statement/]
  - **Retirement took effect on 2026-03-24.** [VERIFIED https://kubernetes.io/blog/2026/04/22/kubernetes-v1-36-release/]
- **ingress2gateway 1.0** (2026-03-20) is the migration tool from Ingress to Gateway API; the current version is 1.2.0. [VERIFIED https://kubernetes.io/blog/2026/03/20/ingress2gateway-1-0-release/]
- **F5's "NGINX Ingress Controller"** (nginxinc/kubernetes-ingress) is a **different, still-maintained project** and is not affected by the retirement. [VERIFIED https://community.nginx.org/t/is-the-official-nginx-docker-image-affected-by-the-ingress-nginx-retirement/8321]
- **Recommendation:**
  - Teach the Ingress concept briefly, because students will meet it in existing clusters.
  - Teach **Gateway API (Gateway + HTTPRoute) as the primary way into the cluster**.
  - Never use ingress-nginx in examples. Use Envoy Gateway, NGINX Gateway Fabric, Traefik or Cilium.
  - Use HTTPRoute `backendRefs[].weight` to explain canary and weighted traffic.

---

## 3. Docker and containers

### 3.1 Concepts
- **Container vs VM:**
  - A VM is a whole OS with its own kernel.
  - A container is "an isolated process with all of the files it needs to run". Containers share the host kernel.

  [VERIFIED https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-a-container/]
- **Docker architecture:**
  - Client and server: the `docker` CLI talks to `dockerd` over a REST API.
  - Docker Hub is the default registry.
  - An image is read-only, and each Dockerfile instruction creates a layer.
  - Isolation comes from Linux **namespaces**.

  [VERIFIED https://docs.docker.com/get-started/docker-overview/]
- The OCI runtime spec covers namespaces and **cgroups**. [VERIFIED https://github.com/opencontainers/runtime-spec]
- **OCI (Open Container Initiative):**
  - Founded on 2015-06-22 by Docker, CoreOS and others under the Linux Foundation.
  - It defines three specs: Runtime, Image and Distribution.
  - Docker donated **runc** to it.

  [VERIFIED https://opencontainers.org/about/overview/]
- **Docker → containerd → runc:**
  - containerd manages the full container lifecycle: image transfer and storage, execution, supervision, storage and networking.
  - It uses the OCI runtime spec (runc).
  - It has been a CNCF graduated project since 2019-02-28.

  [VERIFIED https://containerd.io/]
  - Docker uses containerd internally. [VERIFIED https://kubernetes.io/blog/2020/12/02/dont-panic-kubernetes-and-docker/]
- On macOS, Docker Desktop runs containers in a **Linux VM**. The Apple Virtualization framework is the default, and Docker VMM is an option. [VERIFIED https://docs.docker.com/desktop/features/vmm/]

### 3.2 Current Docker state
- **Docker Engine 29.0.0 (2025-11-10)**:
  - **The containerd image store is the default for fresh installs** (except with userns-remap).
  - **cgroup v1 is deprecated** but supported until at least May 2029.
  - nftables firewall support is experimental.
  - The minimum API version is 1.44.
  - Docker Content Trust was removed from the CLI.

  [VERIFIED https://docs.docker.com/engine/release-notes/29/]
- **BuildKit is the default builder** for Docker Desktop and Docker Engine. [VERIFIED https://docs.docker.com/build/buildkit/]
  - On Linux this is the case since **Engine 23.0 (2023-02-01)**. The legacy builder needs `DOCKER_BUILDKIT=0` and is still used for Windows containers. [VERIFIED https://docs.docker.com/engine/release-notes/23.0/]
- **Compose:**
  - **v1** (`docker-compose`, Python) **stopped receiving updates in July 2023**. [VERIFIED https://docs.docker.com/compose/migrate/]
  - **v2** is written in Go and runs as a CLI plugin: `docker compose`.
  - **v5** (2025-12-02) is functionally the same as v2 plus an official Go SDK. The internal builder was removed, and builds go through Bake.
  - Versions 3 and 4 were **skipped** to avoid confusion with the old file-format versions 2.x/3.x.
  - The top-level `version:` key in `compose.yaml` is **ignored**.

  [VERIFIED https://docs.docker.com/compose/intro/history/], [VERIFIED https://github.com/docker/compose/releases/tag/v5.0.0]
- **Docker Hub pull rate limits (per 6 hours):**
  - Unauthenticated: **100 per IPv4 address or IPv6 /64**.
  - Personal (logged in): **200**.
  - Pro, Team, Business: unlimited, subject to fair use.
  - A separate abuse limit returns HTTP 429.

  [VERIFIED https://docs.docker.com/docker-hub/usage/]
- **Multi-stage builds** use several `FROM` stages and copy only the needed artifacts into the final image. BuildKit builds only the stages the target depends on. [VERIFIED https://docs.docker.com/build/building/multi-stage/]
- **Rootless mode** runs both the daemon and the containers as a non-root user inside a user namespace. With userns-remap, by contrast, the daemon still runs as root. [VERIFIED https://docs.docker.com/engine/security/rootless/]
- `docker init` generates `Dockerfile`, `compose.yaml`, `.dockerignore` and `README.Docker.md`. Templates: Go, Java, Node, Python, Rust, PHP, ASP.NET. [VERIFIED https://docs.docker.com/reference/cli/docker/init/]
- **Docker Desktop licence:** free for small businesses (fewer than 250 employees **and** less than $10M annual revenue), personal use, education and non-commercial open source. Other use needs a paid subscription. [VERIFIED https://docs.docker.com/subscription/desktop-license/]
- **Docker Hardened Images** (1,000+ minimal base images) have been **free and Apache-2.0 since 2025-12-17**. [VERIFIED https://www.docker.com/press-release/docker-makes-hardened-images-free-open-and-transparent-for-everyone/]
- **Bitnami images:** from 2025-08-28, Bitnami moved most free images from `docker.io/bitnami` to `docker.io/bitnamilegacy`, which gets no updates, in favour of the paid "Bitnami Secure Images". Old tutorials that use `bitnami/*` images may break. [VERIFIED https://www.docker.com/blog/broadcoms-new-bitnami-restrictions-migrate-easily-with-docker/]
- **Podman** (with Buildah and Skopeo) runs **without a daemon and without root**. "Podman Container Tools" joined the **CNCF Sandbox on 2025-01-21**. [VERIFIED https://www.cncf.io/projects/podman-container-tools/]
  - **Podman 6.0 (2026-06-24)** dropped cgroup v1, iptables (now nftables only), CNI (Netavark only), slirp4netns (Pasta only) and Intel Macs. [VERIFIED https://github.com/containers/podman/releases/tag/v6.0.0]

---

## 4. Secrets

### 4.1 Kubernetes Secret semantics
- **By default, Secrets are stored unencrypted in etcd.**
  - Anyone with API access can read or modify them, and so can anyone with access to etcd.
  - **Anyone who can create a Pod in a namespace can read any Secret in that namespace**, including indirectly through a Deployment.
- The docs prescribe at least four steps: encryption at rest, least-privilege RBAC, limiting access to specific containers, and external secret stores.

[VERIFIED https://kubernetes.io/docs/concepts/configuration/secret/]
- **Encoding:** `data` holds **base64** values, and `stringData` accepts plain text. A Secret can be at most **1 MiB**. Secrets can be marked `immutable: true`. [VERIFIED same]
- **Secret types:** Opaque, `kubernetes.io/tls`, `dockerconfigjson`, `basic-auth`, `ssh-auth`, `service-account-token`, bootstrap token. [VERIFIED same]
- **Base64 "is not an encryption method"**. Do not commit Secret manifests to Git. [VERIFIED https://kubernetes.io/docs/concepts/security/secrets-good-practices/]
- **`list` (or `watch`) permission on Secrets also reveals their contents.** [VERIFIED same]
- **Volume mounts vs environment variables:**
  - Secrets mounted as a volume update **eventually**, after the kubelet sync period plus cache delay. **A `subPath` mount never updates.** [VERIFIED https://kubernetes.io/docs/concepts/configuration/secret/]
  - A Secret consumed as an **environment variable is not updated until the container restarts**. [VERIFIED https://kubernetes.io/docs/tasks/inject-data-application/distribute-credentials-secure/]
- **Why environment variables are risky:** they "are generally accessible to all processes and may be included in logs or system dumps". Never bake secrets in with Dockerfile `ENV` or `ARG`. Prefer mounted files or a sidecar or agent. [VERIFIED https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html]
- **Encryption at rest:**
  - Providers: `identity` (the **default: no encryption**), aescbc, aesgcm, secretbox, kms v1, kms v2. [VERIFIED https://kubernetes.io/docs/tasks/administer-cluster/encrypt-data/]
  - **KMS v2 has been stable since 1.29.** KMS v1 has been deprecated since 1.28 and disabled by default since 1.29.
  - KMS uses envelope encryption: data is encrypted with a DEK, and the DEK is encrypted with a KEK held in an external KMS.

  [VERIFIED https://kubernetes.io/docs/tasks/administer-cluster/kms-provider/]
- **Managed clusters differ.** For example, **EKS envelope-encrypts all Kubernetes API data by default** (KMS v2) on 1.28+ clusters, since 2025-03-05. [VERIFIED https://aws.amazon.com/about-aws/whats-new/2025/03/amazon-eks-envelope-encrypts-kubernetes-api-data-default]

### 4.2 External tooling
- **Argo CD's official position** is to use **destination-cluster secret management** (Sealed Secrets, ESO, Secrets Store CSI Driver, Vault Secrets Operator), not manifest-generation plugins such as argocd-vault-plugin. Reasons:
  - Argo CD would need access to the secrets.
  - Rendered manifests sit **in plaintext in Argo CD's Redis cache**.
  - Secret updates get coupled to unrelated syncs.
  - It is incompatible with the rendered-manifests pattern.

  [VERIFIED https://argo-cd.readthedocs.io/en/stable/operator-manual/secret-management/]
  - argocd-vault-plugin's last release was v1.18.1 in June 2024. [VERIFIED https://github.com/argoproj-labs/argocd-vault-plugin/releases]
- **External Secrets Operator (ESO):**
  - CNCF **Sandbox** since 2022-07-26. [VERIFIED https://www.cncf.io/projects/external-secrets/]
  - **On 2025-08-13 it paused all releases and support** because of burnout: effectively one maintainer. [VERIFIED https://infisical.com/blog/external-secrets-operator-paused]
  - **Releases resumed** with new maintainers: v0.20.0 (2025-09-22), **v1.0.0 (2025-11-07)**, v2.0.0 (2026-02-06), and now **v2.11.0 (2026-09-18)**. [VERIFIED https://github.com/external-secrets/external-secrets/releases]
  - In July 2026 the maintainers proposed temporarily pausing the merge of **new** providers. Existing providers still get fixes. [VERIFIED https://github.com/external-secrets/external-secrets/issues/6651]
  - Bottom line: actively maintained, but a real bus-factor case study.
- **Sealed Secrets:**
  - `kubeseal` encrypts with the controller's public key, and only the in-cluster controller can decrypt. The `SealedSecret` CRD is safe to store in Git.
  - Scopes: strict (the default), namespace-wide, cluster-wide.
  - Sealing keys are **renewed automatically every 30 days**.
  - Images are published on Docker Hub and GHCR.

  [VERIFIED https://github.com/bitnami-labs/sealed-secrets]
- **SOPS:**
  - Encrypts **values but not keys** in YAML, JSON, ENV, INI and binary files.
  - Key backends: age, PGP, AWS KMS, GCP KMS, Azure Key Vault, HuaweiCloud KMS.
  - CNCF Sandbox since 2023.

  [VERIFIED https://github.com/getsops/sops]
  - **Flux decrypts SOPS natively** in kustomize-controller. [VERIFIED https://fluxcd.io/flux/guides/mozilla-sops/]
  - **Argo CD has no native SOPS support.** Options are KSOPS (a kustomize plugin) or helm-secrets through a Config Management Plugin. Both are the manifest-generation approach that Argo CD discourages. [VERIFIED https://github.com/viaduct-ai/kustomize-sops]
- **HashiCorp Vault:**
  - Licensed under **BSL 1.1 since August 2023**, which led to the **OpenBao** fork.
  - **IBM completed its acquisition of HashiCorp on 2025-02-27.** [VERIFIED https://newsroom.ibm.com/2025-02-27-ibm-completes-acquisition-of-hashicorp,-creates-comprehensive,-end-to-end-hybrid-cloud-platform]
  - **Vault 2.0 (April 2026)** jumped from 1.21 to IBM-style versioning and support. [VERIFIED https://infoq.com/news/2026/04/vault-2-0-ibm-identity/]
- **OpenBao** is an open-source, community-driven Vault fork run by the Linux Foundation's **OpenSSF** (Sandbox), under MPL-2.0. [VERIFIED https://openbao.org/]
- **Secrets Store CSI Driver:**
  - When a Pod starts or restarts, it fetches secrets from an external store via a `SecretProviderClass` and mounts them as a **tmpfs volume**.
  - It can optionally sync them to a Kubernetes Secret and supports auto-rotation.
  - Providers: Akeyless, AWS, Azure Key Vault, CyberArk Conjur, GCP, OpenBao, Vault.

  [VERIFIED https://secrets-store-csi-driver.sigs.k8s.io/concepts.html]
- **In CI**, prefer **OIDC** over long-lived cloud credentials. The cloud provider issues a short-lived token valid for a single job. [VERIFIED https://docs.github.com/en/actions/concepts/security/openid-connect]

---

## 5. Argo CD, GitOps and progressive delivery

- **OpenGitOps principles:** declarative; versioned and immutable; pulled automatically; continuously reconciled. [VERIFIED https://opengitops.dev/]
- **Argo CD** is "a declarative, GitOps continuous delivery tool for Kubernetes". Git is the source of truth, and a controller compares live state with target state. It supports Kustomize, Helm, Jsonnet, plain YAML and plugins. [VERIFIED https://argo-cd.readthedocs.io/en/stable/]
- **Versions:**
  - 3.0.0: 2025-05-06
  - 3.1.0: 2025-08-13
  - 3.2.0: 2025-11-04
  - 3.3.0: 2026-02-02
  - **3.5.0: 2026-08-04**, current 3.5.3
  - 3.6.0-rc1: 2026-09-16

  [VERIFIED https://github.com/argoproj/argo-cd/releases]
- **3.0 breaking changes:**
  - **Annotation-based resource tracking is now the default** (previously labels).
  - `update` and `delete` RBAC permissions no longer extend to sub-resources.
  - Logs access requires an explicit RBAC permission.
  - High-churn resources (Endpoints, Leases…) are excluded by default.
  - Repository configuration in `argocd-cm` was removed; repositories must be Secrets.
  - Dex `sub` claim changes and some metrics removed.

  [VERIFIED https://argo-cd.readthedocs.io/en/stable/operator-manual/upgrading/2.14-3.0/]
- **3.1:** OCI registries as an Application source (beta). [VERIFIED https://www.infoq.com/news/2025/08/argocd-oci-support-new-ui]
- **3.5:**
  - mTLS between the repo-server and the other components.
  - Git commit signature verification (`sourceIntegrity`).
  - **Helm 4 support**.
  - ApplicationSets can live in any namespace.
  - Source Hydrator and impersonation are now beta.

  [VERIFIED https://infoq.com/news/2026/06/argocd-supply-chain-security]
- **Install:** the official commands now use `kubectl apply -n argocd --server-side --force-conflicts -f …/install.yaml`. [VERIFIED https://github.com/argoproj/argo-cd/releases/tag/v3.5.0]
- **Core terms:**
  - **Application** is a CRD.
  - **Target state** is the desired state in Git; **live state** is what runs in the cluster.
  - **Sync status** says whether live matches target (Synced or OutOfSync).
  - **Sync** moves the cluster to the target state.
  - **Refresh** compares Git with the live state.
  - **Health** says whether the app works.

  [VERIFIED https://argo-cd.readthedocs.io/en/stable/core_concepts/]
- **Health statuses:** Healthy, Progressing, Degraded, Suspended, Missing, Unknown. [VERIFIED https://argo-cd.readthedocs.io/en/stable/operator-manual/health/]
- **Automated sync:**
  - It runs only when the app is OutOfSync.
  - **`prune` is off by default.**
  - **`selfHeal` is off by default.** When on, it reverts manual cluster changes after a 5 s timeout.
  - Git polling uses `timeout.reconciliation`, default **120 s plus up to 60 s jitter (at most about 3 min)**. Webhooks make it faster.
  - A sync that failed is not retried on the same commit.
  - `allowEmpty` controls whether pruning may leave an app empty.

  [VERIFIED https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/]
- **Sync phases and waves:**
  - Hooks: PreSync, Sync, PostSync, SyncFail, PreDelete, PostDelete, set with `argocd.argoproj.io/hook`.
  - Waves are set with `argocd.argoproj.io/sync-wave`. The default wave is 0, and negative waves are allowed.
  - Order: phase, then wave, then kind, then name.
  - Argo CD waits for resources to be healthy between waves, with a 2 s delay.

  [VERIFIED https://argo-cd.readthedocs.io/en/stable/user-guide/sync-waves/]
- **AppProject** restricts source repos, destination clusters and namespaces, allowed resource kinds, and roles. The `default` project allows everything. [VERIFIED https://argo-cd.readthedocs.io/en/stable/user-guide/projects/]
- **ApplicationSet** generates Applications from generators, for multi-cluster setups and monorepos.
  - Verified generators: List, Cluster, Git, Matrix. [VERIFIED https://argo-cd.readthedocs.io/en/stable/operator-manual/applicationset/]
  - Merge, SCM Provider, Pull Request, Cluster Decision Resource and Plugin also exist. [UNVERIFIED in this pass]
- **Architecture:**
  - The **API server** is the gRPC/REST API used by the UI, CLI and CI, and enforces auth and RBAC.
  - The **repo-server** keeps a Git cache and renders manifests.
  - The **application-controller** compares live and target state and runs hooks.

  [VERIFIED https://argo-cd.readthedocs.io/en/stable/operator-manual/architecture/]
  - A Redis cache exists. [VERIFIED secret-management doc]
  - The applicationset-controller, Dex, the notifications-controller and the commit-server also exist. [UNVERIFIED in this pass]
- **Helm inside Argo CD:** Argo CD only runs `helm template`, and **Argo CD (not Helm) manages the lifecycle**. As a result, `helm list` shows nothing. [VERIFIED https://argo-cd.readthedocs.io/en/stable/user-guide/helm/]
- **Flux:**
  - **Weaveworks shut down in February 2024.** ControlPlane hired the core maintainers (2024-02-15). Flux remains a **CNCF graduated** project (graduated in 2022). [VERIFIED https://www.theregister.com/2024/02/06/weaveworks_folds/]
  - Flux 2.9 (2026-06-30) added a CLI plugin system, SSA ignore rules and Vault/OpenBao workload identity. It is actively released (v2.9.6 on 2026-10-01). [VERIFIED https://github.com/fluxcd/flux2/releases]
- **Argo** graduated from the CNCF on 2022-12-06. [VERIFIED https://www.cncf.io/announcements/2022/12/06/the-cloud-native-computing-foundation-announces-argo-has-graduated/]
- **Argo CD vs Flux**: Argo CD is UI-centric with Application CRDs and a central multi-cluster model. Flux is a CLI-first set of controllers that installs real Helm releases through helm-controller. [UNVERIFIED in this pass; standard characterization]
- **Argo Rollouts:**
  - A controller plus CRDs for **blue-green, canary, analysis and experiments**. It exists because a plain RollingUpdate gives little control over speed or traffic, no metric-based checks, and no automatic abort or rollback. [VERIFIED https://argoproj.github.io/argo-rollouts/]
  - **Blue-green:** `activeService`, `previewService`, `autoPromotionEnabled` (default true), `scaleDownDelaySeconds` (default 30). [VERIFIED https://argoproj.github.io/argo-rollouts/features/bluegreen/]
  - **Traffic routers:** ALB, Ambassador, APISIX, Google Cloud, **Gateway API (via plugin)**, Istio, Kong, NGINX Ingress, SMI, Traefik.
  - **Without a router, the canary weight is only approximated by replica counts.**

  [VERIFIED https://argoproj.github.io/argo-rollouts/features/traffic-management/]
  - **Recommendation:** show the Gateway API plugin, not NGINX Ingress.

---

## 6. CI/CD

- **Continuous Integration** (Fowler): everyone merges into the mainline **at least daily**, and every integration is checked by an automated build with tests. [VERIFIED https://martinfowler.com/articles/continuousIntegration.html]
- **Continuous Delivery**: software "can be released to production at any time". Releasing is a **business decision**, often a manual button. [VERIFIED https://martinfowler.com/bliki/ContinuousDelivery.html]
- **Continuous Deployment**: "every change goes through the pipeline and automatically gets put into production". It **requires** Continuous Delivery. [VERIFIED same]
- **"Deployment" has two meanings:** the act of releasing software into an environment, and the Kubernetes `Deployment` object. Teach both explicitly. Kubernetes "does not deploy source code" and does not do CI/CD. [VERIFIED https://kubernetes.io/docs/concepts/overview/]
- **GitHub Actions:**
  - Workflows are YAML files in `.github/workflows`, triggered by events.
  - Jobs run **in parallel by default** unless dependencies are set, and each job is a sequence of steps.
  - Steps run actions or shell commands.
  - Runners are GitHub-hosted fresh VMs (Ubuntu, Windows, macOS) or self-hosted.

  [VERIFIED https://docs.github.com/en/actions/get-started/understand-github-actions]
  - Hosted-runner prices dropped by up to 39% on 2026-01-01. A proposed $0.002/min platform charge for self-hosted runners was postponed. [VERIFIED https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/]
- **GitLab CI:** configured in `.gitlab-ci.yml` at the repository root. A pipeline is made of stages (which run in order) and jobs (jobs in the same stage run in parallel), executed by runners, with CI/CD variables. [VERIFIED https://docs.gitlab.com/ci/]
- **Image tags:**
  - Image reference format: `registry/name:tag@digest`. If both a tag and a digest are given, **only the digest is used**.
  - **A digest is immutable.**
  - Default `imagePullPolicy` is `Always` for `:latest` or no tag, and `IfNotPresent` for other tags and for digests.
  - **Avoid `:latest` in production.**

  [VERIFIED https://kubernetes.io/docs/concepts/containers/images/]
  - Docker Hub supports **immutable tags** per repository, including regex rules. [VERIFIED https://docs.docker.com/docker-hub/repos/manage/hub-images/immutable-tags/]
  - Harbor and GCP Artifact Registry have similar settings. [VERIFIED https://goharbor.io/docs/1.10/working-with-projects/working-with-images/create-tag-immutability-rules]
- **Recommendation:**
  - Tag images with the Git SHA and/or semver, and push once.
  - CI updates the tag or digest in the GitOps repository, and Argo CD pulls it.
  - This splits the work: CI is push-based and builds and tests; CD in GitOps is pull-based.

---

## 7. Message queues and streaming

- **Delivery semantics:**
  - **At most once**: a message may be lost but is never redelivered.
  - **At least once**: a message is never lost but may be redelivered.
  - **Exactly once**: each message is processed once and only once.

  [VERIFIED https://kafka.apache.org/43/design/design/]
- **Kafka exactly-once:**
  - It relies on the idempotent producer and transactions (since 0.11) plus consumers using `read_committed`.
  - Without them, Kafka gives **at-least-once by default**.
  - **Exactly-once into external systems needs those systems to cooperate.**

  [VERIFIED same]
- **Kafka 4.0 (2025-03-18): ZooKeeper removed, KRaft only.**
  - ZooKeeper clusters must migrate to KRaft on 3.x before upgrading.
  - Brokers need Java 17; clients need Java 11.

  [VERIFIED https://kafka.apache.org/40/getting-started/upgrade/], [VERIFIED https://kafka.apache.org/community/downloads/]
- **Kafka 4.2.0 (2026-02-17):** **Queues for Kafka (share groups, KIP-932) are production-ready**. Several consumers can process the same partition with per-message acknowledgement. [VERIFIED https://kafka.apache.org/blog/2026/02/17/apache-kafka-4.2.0-release-announcement/]
- Kafka 4.3.0 was released 2026-05-22; 4.3.1 on 2026-06-25. [VERIFIED https://kafka.apache.org/community/downloads/]
- Strimzi (Kafka on Kubernetes) reached 1.0.0 on 2026-04-28. [VERIFIED https://github.com/strimzi/strimzi-kafka-operator/releases]
- **RabbitMQ:**
  - **Classic queue mirroring was removed in 4.0.** Classic queues are now non-replicated.
  - **Quorum queues** (Raft-based, replicated, durable) are "the default choice" for HA. They are a poor fit for temporary or very latency-sensitive queues. Poison messages hit a **delivery-limit of 20** by default.

  [VERIFIED https://www.rabbitmq.com/docs/quorum-queues]
  - **Streams** (since 3.9) are an append-only log with **non-destructive** consumption: replay, large fan-out, large backlogs. [VERIFIED https://www.rabbitmq.com/docs/streams]
  - In 4.2.0 (2025-10-27) the Khepri (Raft) metadata store became the default for new clusters. [VERIFIED https://github.com/rabbitmq/rabbitmq-server/releases/tag/v4.2.0]
  - **4.3.0 (2026-04-23): Khepri is the only metadata store, Mnesia was removed**, CQv1 storage was removed, and deprecated transient non-exclusive queues are disabled by default. [VERIFIED https://github.com/rabbitmq/rabbitmq-server/releases/tag/v4.3.0]
- **NATS:**
  - Core NATS is fire-and-forget, **at most once**.
  - **JetStream** adds persistence and **at-least-once** delivery, with streams, consumers, and KV and Object stores. [VERIFIED https://docs.nats.io/nats-concepts/jetstream]
  - **Exactly-once** in JetStream combines `Nats-Msg-Id` deduplication (default 2-minute window) with "double ack" (`AckSync`). [VERIFIED https://docs.nats.io/using-nats/developer/develop_jetstream/model_deep_dive]
  - In 2025 Synadia tried to take NATS back from the CNCF and relicense it, then backed down and agreed to transfer the trademark. [VERIFIED https://www.runtime.news/tag/synadia]
- **AWS SQS:**
  - **Standard queues:** at least once, **best-effort ordering**, nearly unlimited throughput.
  - **FIFO queues:** **exactly-once processing** (deduplication ID), ordering **within a message group**, 300 API calls/s without batching, 3,000 messages/s with batching, up to 30k TPS in high-throughput mode.
  - The **visibility timeout** hides a message from other consumers while it is being processed.

  [VERIFIED https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-queue-types.html]

---

## 8. Notes for the interactive simulations

- **Load-balancer sim (2 GB vs 4 GB servers):**
  - A classic load balancer can do round robin, weighted round robin, least connections and so on. IPVS documents rr, wrr, lc, wlc and lblc. [VERIFIED https://kubernetes.io/docs/reference/networking/virtual-ips/]
  - **A Kubernetes Service picks a backend at random**, per connection, and does not look at node size. [VERIFIED same]
  - In Kubernetes, uneven server capacity is handled by the **scheduler (resource requests and bin packing)** and by HPA, not by Service weights.
  - Weighted splitting at L7 is done with Gateway API weights.
  - Label the sim's modes clearly: "classic LB" vs "what a Kubernetes Service actually does".
- **HPA sim:** use the exact formula, the 10% tolerance, the 5-minute scale-down window, utilization measured against *requests*, and "max of metrics".
- **Probe sim:** a failing readiness probe removes the Pod from the endpoints without restarting it. A failing liveness probe restarts the container.
- **Queue sim:** show ack and redelivery (at least once), duplicates leading to idempotent consumers, and queue vs stream (destructive vs replay). Kafka share groups (4.2) blur that line.

---

## 9. Commonly taught but now outdated or wrong

1. **"Kubernetes uses Docker."** Wrong since 1.24, when dockershim was removed. Kubernetes talks to CRI runtimes (containerd, CRI-O). Docker-built images still work because they are OCI images. [VERIFIED https://kubernetes.io/docs/setup/production-environment/container-runtimes/]
2. **"Containers are lightweight VMs."** Misleading. A container is an isolated process sharing the host kernel. Docker Desktop on a Mac actually runs a Linux VM. [VERIFIED https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-a-container/]
3. **"Secrets are encrypted."** Wrong by default. They are base64-encoded and stored in plain text in etcd unless encryption at rest is configured. Some managed services, such as EKS, now encrypt by default. [VERIFIED https://kubernetes.io/docs/concepts/configuration/secret/]
4. **"Only users with get on Secrets can read them."** Wrong. `list`/`watch` and Pod-creation rights also expose them. [VERIFIED https://kubernetes.io/docs/concepts/security/secrets-good-practices/]
5. **"Updating a Secret updates the app."** Not for environment variables (needs a restart) or `subPath` mounts. Volume mounts update eventually. [VERIFIED https://kubernetes.io/docs/concepts/configuration/secret/]
6. **"Use Ingress NGINX."** Community ingress-nginx was retired on 2026-03-24: no security fixes. Teach Gateway API. Do not confuse it with F5's NGINX Ingress Controller. [VERIFIED https://kubernetes.io/blog/2026/04/22/kubernetes-v1-36-release/]
7. **"Ingress is deprecated."** Also wrong. Ingress is GA and frozen, not deprecated or removed. [VERIFIED https://kubernetes.io/docs/concepts/services-networking/ingress/]
8. **"ZooKeeper is required for Kafka."** Wrong since Kafka 4.0 (March 2025): KRaft only. [VERIFIED https://kafka.apache.org/40/getting-started/upgrade/]
9. **"Kafka can't do queues."** Out of date. Share groups (Queues for Kafka) are production-ready since 4.2. [VERIFIED https://kafka.apache.org/blog/2026/02/17/apache-kafka-4.2.0-release-announcement/]
10. **"Use mirrored classic queues for HA in RabbitMQ."** Removed in 4.0. Use quorum queues or streams. In 4.3, Mnesia is gone too. [VERIFIED https://www.rabbitmq.com/docs/quorum-queues]
11. **"`docker-compose up` with `version: '3.8'`."** Compose v1 has been dead since July 2023. Use `docker compose`; the `version:` key is ignored; the current release is v5. [VERIFIED https://docs.docker.com/compose/intro/history/]
12. **"`DOCKER_BUILDKIT=1` is needed to enable BuildKit."** BuildKit has been the default since Engine 23.0. [VERIFIED https://docs.docker.com/engine/release-notes/23.0/]
13. **"Docker Hub allows 100 or 200 anonymous pulls per hour."** The current limits are 100 per 6 hours unauthenticated and 200 per 6 hours for Personal accounts. [VERIFIED https://docs.docker.com/docker-hub/usage/]
14. **"`:latest` is fine."** Avoid it in production. It also changes the default `imagePullPolicy` to `Always`. Use immutable tags or digests. [VERIFIED https://kubernetes.io/docs/concepts/containers/images/]
15. **"kube-proxy uses round robin" / "use ipvs mode for performance."** iptables and nftables pick a backend at random. ipvs is deprecated (1.35) and will be removed in 1.43. nftables is the successor. [VERIFIED https://kubernetes.io/docs/reference/networking/virtual-ips/]
16. **"Services track Pods via the Endpoints object."** EndpointSlices replace it, and the Endpoints API has been deprecated since 1.33. [VERIFIED https://kubernetes.io/blog/2025/04/24/endpoints-deprecation/]
17. **"Changing CPU or memory requires recreating the Pod."** No longer true. In-place resize is GA since 1.35, and VPA has `InPlaceOrRecreate`. [VERIFIED https://kubernetes.io/blog/2025/12/17/kubernetes-v1-35-release/]
18. **"Sidecars are just extra containers in `containers:`."** Native sidecars are `initContainers` with `restartPolicy: Always`, GA since 1.33. [VERIFIED https://kubernetes.io/docs/concepts/workloads/pods/sidecar-containers/]
19. **"HPA can't scale to zero."** It can since 1.37 (beta, on by default), but only with object or external metrics. KEDA has done this for years. [VERIFIED https://kubernetes.io/blog/2026/08/26/kubernetes-v1-37-release/]
20. **"VPA `updateMode: Auto`."** Deprecated. Use an explicit mode: Recreate, InPlaceOrRecreate or Initial. [VERIFIED https://github.com/kubernetes/autoscaler/blob/master/vertical-pod-autoscaler/docs/quickstart.md]
21. **"PodSecurityPolicy"** was removed in 1.25; use Pod Security Admission. [VERIFIED https://kubernetes.io/docs/concepts/security/pod-security-admission/]
22. **"Install the Kubernetes Dashboard."** It is archived; use Headlamp. [VERIFIED https://kubernetes.io/blog/2026/06/01/dashboard-to-headlamp/]
23. **"master node."** Say "control plane". kubeadm has applied only the control-plane label and taint since 1.24. [VERIFIED https://kubernetes.io/blog/2022/04/07/upcoming-changes-in-kubernetes-1-24/]
24. **"cgroup v1 is fine" / "containerd 1.7 is fine."** On 1.35+, the kubelet fails on cgroup v1 by default, and Kubernetes ≥1.36 requires containerd 2.x. Docker 29 and Podman 6 also deprecate or drop cgroup v1. [VERIFIED https://kubernetes.io/blog/2025/12/17/kubernetes-v1-35-release/]
25. **"PDBs protect against node crashes."** They only cover voluntary disruptions that go through the Eviction API. [VERIFIED https://kubernetes.io/docs/concepts/workloads/pods/disruptions/]
26. **"Argo CD runs `helm install`."** It runs `helm template`, and Argo CD manages the lifecycle. [VERIFIED https://argo-cd.readthedocs.io/en/stable/user-guide/helm/]
27. **"Argo CD auto-sync deletes removed resources and reverts manual edits."** Only if `prune: true` and `selfHeal: true` are set; both are off by default. [VERIFIED https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/]
28. **"Inject secrets with argocd-vault-plugin."** Argo CD's docs discourage this approach, and the plugin has had no release since mid-2024. Use ESO, Sealed Secrets or the CSI driver. [VERIFIED https://argo-cd.readthedocs.io/en/stable/operator-manual/secret-management/]
29. **"Vault is open source (MPL)."** It has been under BSL 1.1 since 2023 and is now owned by IBM, at v2.x. OpenBao is the MPL fork. [VERIFIED https://infoq.com/news/2026/04/vault-2-0-ibm-identity/]
30. **"Flux died with Weaveworks."** False. Flux is CNCF graduated and still actively released (2.9.x in 2026). [VERIFIED https://github.com/fluxcd/flux2/releases]
31. **"ESO is abandoned (Aug 2025 pause)."** Out of date. Releases resumed in September 2025, and it is now at v2.11. [VERIFIED https://github.com/external-secrets/external-secrets/releases]
32. **"Continuous Delivery = automatic deploy to production."** That is Continuous *Deployment*. Continuous Delivery only means you *can* release at any time. [VERIFIED https://martinfowler.com/bliki/ContinuousDelivery.html]
33. **"Use `bitnami/<app>` images from old tutorials."** They moved to `bitnamilegacy` in August/September 2025 and get no updates. [VERIFIED https://www.docker.com/blog/broadcoms-new-bitnami-restrictions-migrate-easily-with-docker/]
34. **"A Kubernetes Service balances gRPC/HTTP2 per request."** Balancing is per connection, so long-lived HTTP/2 connections stick to one Pod. [VERIFIED https://kubernetes.io/blog/2018/11/07/grpc-load-balancing-on-kubernetes-without-tears/]