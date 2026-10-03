# E3 Klaster: Kubernetes control loops

A small but faithful Kubernetes in pure TypeScript (no React, no DOM), shared by lectures **10–14, 17–19** and
used by **20** and **24**. One seeded cluster state; independent controllers that compare desired with actual
state every tick; every number a student sees comes from the same mechanics, so lectures agree with each other
and with `docs/research/sim-models.md`.

```bash
node --test src/engines/cluster/*.test.ts        # 156 tests, about 1 s
npm run -s typecheck 2>&1 | grep src/engines/cluster
npx eslint src/engines/cluster
```

---

## What it models

| Area | Files | What is simulated (real Kubernetes behaviour) |
|---|---|---|
| Loop & state | `core.ts`, `types.ts`, `util.ts` | One `ClusterState`, fixed internal tick **0,1 s** with an accumulator (`stepCluster(s, dt)` fits `useSimulation`). Seeded RNG (`createRng`) for names, tie-breaks, traffic; same seed + same actions ⇒ identical run. Croatian event log (≤ 50, stable ids `ev1, ev2, …`, plurals via `Intl.PluralRules('hr')`) + English `kubectl get events` records (aggregated `(xN)`). Series of `cfg.seriesLengthS` seconds (default 600), also per Deployment. |
| L10 desired state | `desired-state.ts` (`desiredState` namespace) | Abstract servers × slots before any component has a name: dashed ghosts (desired) → solid instances (actual), a level-triggered loop every 10 s (sim · stvarno: sekunde), placement on the server with most free slots, no rebalancing, lost events don't matter, scores (missing instance-minutes, wrong placements, „Davorovi sati sna”). Events carry the day clock in `clock`. |
| Control plane (L11) | `actions.ts`, `util.ts` (`observed`, `message`) | The API server is the only writer to etcd; controllers, scheduler and kubelets *watch* and react after 0,1–0,3 s. Numbered messages 1–6 are **causal**: 1 kubectl → API, 2 API → etcd when 1 lands, the etcd ack, the reply to kubectl; a watcher sees a write only after it is committed (`s.writeVisibleAt`), so step 3 starts after the ack, step 4 after the Pod was created, step 5 after the binding was written. Switches: **API server off** – every write *and* read is refused with the real error, Pod status in the API is frozen (`apiPod`, `podView(…).stale`) while kubelets keep acting locally, the data plane keeps serving; **etcd off** – writes and reads time out; scheduler off – Pending forever; controller-manager off – nothing replaced. |
| Nodes | `nodes.ts` | Heartbeats; NotReady/Unknown after `node-monitor-grace-period`; `unreachable`/`not-ready` taints; taint-based eviction after the default **300 s** toleration (Pods stay *Terminating* until a kubelet confirms); kubelet off vs machine off; cordon; **drain** like kubectl (refuses bare Pods without `--force` and emptyDir Pods without `--delete-emptydir-data`, cordoning anyway); **out-of-service** taint (non-graceful shutdown: force delete + immediate detach). |
| Pods & kubelet (L12) | `pods.ts`, `kubelet.ts` | Pending → ContainerCreating (image pull, cached per node) → Running; **phase vs STATUS vs READY**; `ErrImagePull → ImagePullBackOff` (10 s doubling, 300 s cap); startup / liveness / readiness probes with `initialDelaySeconds/periodSeconds/failureThreshold/successThreshold`, startup gating, readiness keeps probing during termination; liveness kill → restart in place (same name and IP); **CrashLoopBackOff**: 1st restart immediate, then 10 → 20 → 40 … 300 s, reset after 10 min clean (`flowcontrol.Backoff` + `doBackOff`); stop sequence preStop → SIGTERM → drain / exit / ignore → SIGKILL at the grace period (exit 143 / 137); app behaviours (slow start, crash, deadlock, DB-dependent, never ready, bug rate, schema column); container stdout for `kubectl logs [--previous]`; env from Secrets resolved at container creation (missing Secret/key ⇒ `CreateContainerConfigError`, a rotated Secret is stale until the container restarts). |
| Resources (L17) | `kubelet.ts`, `scheduler.ts`, `util.ts` | Requests vs limits, `effectiveRequests` (limit-only ⇒ request = limit), QoS classes, `oom_score_adj` (−997 / 1000 / Burstable `1000 − ⌊1000·memReq/capacity⌋` with int64 maths, bounded 3…999); CPU per node: demand capped by the limit (**throttled, never killed**), contention water-filled ∝ `max(request, 2m)`; memory over the limit ⇒ **OOMKilled 137** by the kernel's cgroup – **with or without a running kubelet**; kernel OOM killer when the node runs out (usage‰ + adj, narrated as „čvoru je ponestalo memorije”); eviction manager every 10 s when `memory.available < 100Mi`, ranking usage > request → priority → usage − request; `memory-pressure` taint keeps BestEffort Pods off; **in-place resize** (`resizePod`, GA 1.35: no restart, QoS change rejected, Deferred / Infeasible); CFS quota calculator (`cfsLatencyMs({ limitM: 200, workMs: 50 })` ⇒ 210 ms). |
| Scheduler (L11, L17) | `scheduler.ts` | Queue by priority → Filter (NodeUnschedulable → TaintToleration → NodeAffinity/nodeSelector → NodeResourcesFit on **requests** + `maxPods` 110) → Score (LeastAllocated / MostAllocated, non-zero defaults 100m/200Mi for scoring only) → seeded tie-break → Bind. Upstream FitError message incl. the preemption suffix; per-node explain table; manual placement with the filter's reasons. Never looks at usage. |
| ReplicaSet | `replicaset.ts` | Level-triggered diff on active Pods (terminating/finished don't count), adoption and release by labels, deletion ranking (unscheduled → pending → not ready → … → newest), cascading garbage collection. |
| Deployment (L13) | `rollout.ts` | **Exactly** `rolling.go` / `recreate.go` / `sync.go`: fence posts (surge rounds up, unavailable down, 0/0 ⇒ 1, explicit 0/0 rejected, percents must match `^[0-9]+%$`), one scale-up **or** scale-down per sync, `maxTotal = N + surge` over Σ`spec.replicas` (terminating not counted), cleanup of unhealthy old replicas, proportional scaling mid-rollout, Recreate waits for old Pods to be gone, `minReadySeconds` (Available, never traffic), `progressDeadlineSeconds` ⇒ `ProgressDeadlineExceeded` (no automatic rollback), revision history (`revisionHistoryLimit`, change-cause), `rollout undo [--to-revision]`, pause/resume, `rollout restart`, `.status.terminatingReplicas`; template labels may change while they match the immutable selector. Each rollout record counts the requests to its Service (`rollout.requests`). |
| Services (L14) | `service.ts`, `traffic.ts` | EndpointSlice = Pods in the namespace matching **all** selector pairs with `ready / serving / terminating`; kube-proxy rules lag by 1 s (sim) and contain the **ready** endpoints – or, when none is ready, the **serving-and-terminating** ones (`CategorizeEndpoints` fallback, KEP-1669, GA 1.28: a draining Pod keeps answering); a **random backend per new connection**; keep-alive connections pinned to one Pod (closed gracefully by a terminating server); `sessionAffinity: ClientIP` (10800 s; source = the client Pod or a NAT `clientIp`); ClusterIP / NodePort (30000–32767) / LoadBalancer (`<pending>` without a cloud controller); **CoreDNS with the Pod's search path** (`<ns>.svc.cluster.local svc.cluster.local cluster.local`, ndots:5: `klopa-api`, `db-1.db`, `db-1.db.klopa.svc` resolve inside the Namespace, short names of another Namespace do not; headless; not-ready `db-N` ⇒ NXDOMAIN); packet path DNS → ClusterIP → DNAT → conntrack. |
| Traffic | `traffic.ts` | `requests` model (Poisson/uniform from a per-stream RNG, users, keep-alive, Gateway weights, a hard-coded Pod IP, outcomes ok / noEndpoints / refused / timeout / 503 / 500 / 404, per version) and `fluid` model for SIM 4 (rate split over ready Pods, CPU demand = rate × 25 ms; served = what the CPU water-fill granted; **ρ = rate / the CPU the Pod could really get** – its limit, the node's headroom or its contention share – so whenever requests are dropped ρ ≥ 1; latency ≈ 50 ms / (1 − min(ρ, 0,99)) labelled M/M/1). Nearest-rank p50/p95/p99 over successful requests only, `null` (n/a) below 20. Profiles are anchored when set (`profileT0`). Goal windows (`markWindow` / `windowStats`) measure from a mark without resetting anything. |
| HPA (L18) | `hpa.ts` | `replica_calculator.go` + `horizontal.go`: metrics-server mean over 15 s, sync 15 s, `util = floor(100·Σusage/Σrequest)` over ready Pods, tolerance 10 % (per-HPA field), unready Pods at 0 % when scaling up (incl. the 300 s CPU-initialisation rule), missing metrics at 100 % (down) / 0 % (up) and **left out at exactly 1,0**, stabilisation (up 0 s, down 300 s max-of-recommendations), rate limits (up max(+100 %, +4 Pods)/15 s, down 100 %/15 s), min/max; no CPU request ⇒ `FailedGetResourceMetric`, HPA blind. Every decision carries a Croatian formula string. |
| Cluster Autoscaler (L18) | `autoscaler.ts` | Scan 10 s; only **Pending/Unschedulable** Pods trigger scale-up (bin-packing on a template node, minus nodes already provisioning, up to max); new node Ready after 75 s (sim · stvarno: minute, ovisi o oblaku) and must pull images; scale-down when `max(cpu, mem requests / allocatable) < 0,5` and Pods fit elsewhere, after 10 min unneeded and 10 min after the last scale-up; empty nodes in bulk, otherwise one drain at a time; bare Pods / emptyDir block removal. Pods are stamped `timeline.unschedulableAt` / `scaleUpTriggeredAt` for lead-time bars (`podLeadTime`). |
| KEDA (L18) | `keda.ts` | Operator activates 0 → 1 when the queue has messages (polling 30 s), HPA with an External metric `desired = ceil(messages / target)` does 1 ↔ N, back to 0 after the 300 s cooldown. Queue: ready messages + **unacknowledged** ones (prefetch 1 per Ready worker, finished at `perWorkerRate`, redelivered when a worker goes away); the scaler reads ready + unacked like the RabbitMQ scaler over HTTP (`excludeUnacknowledged: false`), so a busy worker is never scaled to 0. Arrival constant or along a profile (`setQueueProfile`, `QUEUE_DAY`). |
| Storage (L19) | `storage.ts`, `statefulset.ts` | StorageClass (WaitForFirstConsumer, reclaim Delete) → PVC → PV provisioning; attach/detach (RWO = one node, **Multi-Attach** error elsewhere; RWX/ROX shared); force detach 6 min after an unconfirmed deletion on an unhealthy node (or immediately with out-of-service); PVC protection; data stores: container layer (lost on restart), emptyDir (lost with the Pod), PV (survives); Postgres data-directory lock. StatefulSet: ordinals, `volumeClaimTemplates`, OrderedReady, scale-down from the highest ordinal, PVCs retained, **never two `db-N`** (waits until the node is confirmed dead). The shared database can be backed by a workload (`setDatabaseBacking`). |
| Release lanes (L20) | `release.ts`, `presetRelease` | Recreate, Rolling (SIM 5), Blue-green (two Deployments, selector flip after all green Ready, keep-alive connections stay on blue, scale-down delay 30 s), Canary by replicas (share = k/(N+k), steps snap 5 → 20 %, 25 → 33 %, 50 → 50 %), Canary by Gateway weights (per request p = weight/Σ), automatic analysis (abort > 2 %), metrics (downtime, users hit, **users exposed / exposure % / requests to the new version**, mixed-version window, extra Pod-seconds, time to rollback), expand/contract schema migrations. |
| Views (all) | `views.ts`, `replay.ts`, `actions.ts` | `kubectl get pods/nodes/deploy/rs/svc/endpointslices/events/hpa/pvc`, `describe pod`, `logs` – as tables (`kubectlGet*`) or as a console that answers with the real connection error while the API is down (`kubectlRun`); Pod/Node/Deployment views (three-layer node bars: requests / usage / Σ limits); kit adapters (`podShapeView`, `nodeFrameStatus`, `versionToneFor`); smooth animation at `renderTime` (`requestProgress`, `inFlightAt`, `messageProgress`, `activeMessages`, `messageChain`); cost; timeline with non-destructive `seek`. |

## What it deliberately simplifies (and why the lesson stays true)

- **One container per Pod**, HTTP probes only (`/healthz`, `/ready`, `/ready-db`). Multi-container Pods, init and
  sidecar containers are DeepDive text in L12; nothing here contradicts them.
- **Watches are instantaneous** unless a preset sets `watchDelayS` (L11 uses 0,1–0,3 s). Controllers are still
  level-triggered and independent; only the latency is hidden. With animated messages on, every write becomes
  visible only after it is committed, so the numbered hops are causal.
- **The API server and etcd are switches**, not a consensus system. Leader election, quorum loss and
  resourceVersion conflicts are out of scope (no lecture teaches them). With etcd off reads time out too (kubectl's
  default read is a consistent read).
- **Nodes have no IPs, kube-proxy has no per-node rule tables**: one shared rule set lagging the EndpointSlice by
  1 s. This keeps the lesson (rules exist on every node, update asynchronously, send to ready endpoints; only when
  none is ready, to the ones still draining).
- **Container logs are what the simulated app prints** (start, warm-up, SIGTERM, database errors, Postgres lock);
  there is no `kubectl exec`.
- **CPU is evaluated once per simulated second** (water-fill), memory every tick, eviction every 10 s; this is the
  housekeeping cadence the kubelet really uses for eviction.
- **Probe timeouts are not separately timed**: a hung process answers `timeout` immediately at the probe tick
  (detection still needs `failureThreshold × periodSeconds`, which is the visible part).
- **The kubelet does not report Pod status while the API server or etcd is off** (the status the API shows is frozen
  at the outage), but its local actions (restarts, probes) continue – the data plane survives, which is the L11
  point. A stopped kubelet's own status reporting is not frozen separately (the node goes NotReady instead).
- **ImagePullBackOff/CrashLoopBackOff have no jitter** (real `flowcontrol.Backoff` adds a little), so the doubling is
  exact and testable.
- **Gateway / HTTPRoute** exists only as weights on a traffic stream (L15 is another engine's job).
- **KEDA's queue is fluid** (fractional messages, prefetch 1 per worker); the activation/cooldown/HPA logic is the real
  one.
- **L10** uses abstract slots, no requests and an instant „new version” replacement (surge 100 %), because the
  lecture introduces the loop before Deployments and resources.
- **L20 canary by replicas keeps the stable Deployment at N** and adds k canary Pods (curriculum model), so the
  share is k/(N+k) per connection. Argo Rollouts' basic canary instead shrinks stable; the lesson (Pod ratio,
  coarse steps, variance) is the same.

### Compressed time (labelled in the UI)

Every value shortened for class is exported with both numbers (`COMPRESSED.x.sim/simValue`, `.real/realValue`,
`.label`, `.compressed`). Use `COMPRESSED.x.label` or `compressedLabel(COMPRESSED.x)` for the badge.

| Key | Sim | Real default | Where |
|---|---|---|---|
| `nodeMonitorGrace` | 10 s | 50 s | L11, L12, L19 (NotReady) |
| `podEvictionToleration` | 20 s | 5 min (300 s) | L11, L12, L19 |
| `forceDetach` | 24 s | 6 min | L19 (`NODE_FAILURE_BADGE`: „20 s (sim) · stvarno: 5 min + do 6 min; StatefulSet čeka potvrdu da je čvor ugašen”) |
| `pressureTransition` | 30 s | 5 min | L17 |
| `rolloutReadinessPeriod` | 2 s (in the YAML) | 10 s | L13, L14, L20 |
| `rolloutProgressDeadline` | 60 s (in the YAML) | 600 s | L13 |
| `probePeriod` | 2 s | 10 s | L12 (optional ×5) |
| `caProvision` | 75 s | minutes, cloud-dependent | L18 |
| `l10LoopTick` | 10 s | seconds | L10 |
| `l10DayMinute` | 1 s | 1 min of the day | L10 day clock |
| `l18Day` | 1200 s | 1 day | L18 `TRAFFIC_PRESETS.daily` |

Real defaults used as-is: probe 10 s / 1 s / 1 / 3 / 0, grace 30 s, back-off 10 s → 300 s (reset 10 min), HPA
15 s / 10 % / 300 s, metrics 15 s, CA 10 s / 0,5 / 10 min / 10 min, KEDA 30 s / 300 s, housekeeping 10 s,
eviction 100Mi, maxPods 110, ClientIP affinity 10800 s, revisionHistoryLimit 10 (`REAL`).

**Model values that differ from sim-models' parameter list** (each exported, so the UI label matches what is
computed): latency cap `LATENCY_MODEL.rhoCap` **0,99** (the validated SIM 4 timeline „≈ 5 s” uses it; the parameter
list says 0,95) – show `latencyFormulaText()`; graceful drain of klopa-api `ROLLOUT_DRAIN_S` **5 s** (the validated
SIM 5 durations 28 / 51 / 46 / 17 s come from it; the timing list says 2 s); Burstable `oom_score_adj` is
**938** for 256Mi on 4096Mi (kubelet integer maths) with the lower bound **3**.

---

## API

Everything is exported from `src/engines/cluster/index.ts` (`import … from '../../engines/cluster'`).

### Create and step

| Function | Purpose |
|---|---|
| `createCluster(init?)` | Empty cluster: `{ seed, nodes: NodeSpec[], timings?: Partial<Timings>, messages?, registry?, cachedImages?, scoring?, latency?, autoscaler?, keda?, cloudLoadBalancer?, versionRoles?, seriesFocus?, seriesLengthS? }`. |
| `stepCluster(s, dtSeconds)` | Accumulator; runs internal 0,1 s ticks (`processTick`). Ignores NaN / ≤ 0, clamps one call to 120 s. Use as `useSimulation({ step: (s, dt) => stepCluster(s, dt) })`. |
| `advance(s, seconds)`, `runUntil(s, pred, maxS)`, `processTick(s)` | Headless runs, "premotaj" buttons, tests. |
| `warmStart(s)` | Settle a preset's workloads instantly (Running/Ready, as if up for a long time). |
| `createTimeline(init)`, `act(tl, label, fn)`, `stepTimeline(tl, dt)`, `seek(tl, t)`, `rewindTo(tl, t)`, `timelineTime`, `timelineIsLive`, `timelineMarks` | L11 timeline: `seek` rebuilds the past by deterministic replay and keeps the recorded actions – stepping on replays them and reaches the live state again; `act` in the past starts a new future; `rewindTo` = seek + drop the future. Use the **timeline** as the hook's state (see the example). |

### Presets (call inside `useSimulation`'s `init`)

| Preset | Lecture | Contents |
|---|---|---|
| `desiredState.createDesiredState({ mode, seed, dayEvents? })` | 10 | Separate tiny model (see below). |
| `presetControlPlane({ seed, replicas })` | 11 | 3 nodes × 6 slots (512Mi), ReplicaSet preview `klopa-api` (3), bare Pod `klopa-worker`, Service, animated causal messages, watch delay 0,1–0,3 s, compressed node failure. |
| `presetPodHealth({ behaviour, probes, wrongTag, warm, rps })` | 12 | 3 bare `klopa-api` Pods, 20 rps to Ready Pods, shared DB. Behaviours: `healthy`, `slowStart` (40 s), `crashOnStart` (exit 1 after 2 s), `hangsAfter60`, `dependsOnDb`. |
| `presetRollout({ replicas, version, maxSurge, maxUnavailable, strategy, readinessProbe, sigterm, preStopSleepS, minReadySeconds, rps, traffic, nodes: NodeSpec[] \| 'small', clientPod, clusterIP, versionLabel, seriesLengthS })` | 13 (14, 20, 24) | Deployment N = 4, SIM 5 timings (schedule 1 s, pull 4 s per Pod, start 6 s, readiness 2 s, drain 5 s, deadline 60 s). `nodes: 'small'` = 3 nodes × 3 Pods, so `replicas: 10` leaves one Pending („replicas ≠ strojevi”). Version roles: start version blue, its successor violet, 1.5.0 rose. |
| `presetService(o)` | 14 | `presetRollout` with an app that exits immediately on SIGTERM (shutdown race) unless `preStopSleepS`; client Pod **`klopa-web` 10.244.1.7** (traffic source, so `sendRequest` / `tracePacket` have a path), ClusterIP **10.96.12.7**, Pods labelled `app` + `version` (selector `app` only). For „Uvođenje 1.4.0 → 1.4.1” use `presetService({ version: '1.4.0' })`. |
| `presetScheduler({ manual, testPods, cards, apiCard })` | 17 | SIM 3 nodes and the 8 Pod cards; scheduler off until „Pokreni raspoređivač”; Iva's idle test Pods (cause of `fragment` Pending). `apiCard: 'burstable'` swaps `api-guaranteed` for `api` (500m/512Mi requests, 1000m/1Gi limits) for „Učinite api Guaranteed”. |
| `presetAutoscaling({ profile, targetUtilization, minReplicas, maxReplicas, cpuRequestM, clusterAutoscaler, minNodes, maxNodes, keda, queueRate, queueProfile, seriesLengthS })` | 18 | SIM 4: HPA, CA 2–6 nodes, fluid traffic (`TRAFFIC_PRESETS.steady/spike/daily/flash`), optional KEDA `klopa-worker`; series 1500 s (the spike story 0–720 s and a 1200 s day fit). |
| `presetStorage({ part: 'volumes' \| 'statefulset', postgresDeployment, writesPerSecond, writes: 'per-ordinal' \| 'db-0' })` | 19 | Three Postgres variants (container FS / emptyDir / PVC) or StatefulSet `db` ×3 with headless Service; by default every `db-N` gets its own writes through Service `db-N`, so each PVC holds its own orders; optional `replicas: 3` Postgres Deployment (no volume / shared RWO PVC). |
| `presetRelease({ strategy, replicas, bugRate, rps, users, steps, stepS, abortErrorRate, analysis, scaleDownDelayS, keepAlive, schema })` | 20 | One lane per state: 1.4.1 (blue) → 2.0.0 (violet, bug 20 %), same seed ⇒ identical traffic in every lane. |

### Actions (plain functions; call inside `sim.mutate(...)`)

API writes go through a simulated `kubectl` and return `{ ok, message }` with kubectl's output: with the API
server off they fail with „The connection to the server 10.0.0.1:6443 was refused …”, with etcd off with
„etcdserver: request timed out”, and nothing changes (`s.kubectlLog` keeps the terminal lines). Physical events
(power, kubelet, a hung process, the database, usage sliders) are not API writes and always happen.

- **Control plane / nodes:** `setComponent(s, 'apiServer'|'etcd'|'scheduler'|'controllerManager', on)`,
  `setKubelet(s, node, up)`, `powerOffNode` / `failNode`, `powerOnNode` (booleans); `cordonNode(s, node, on?)`,
  `drainNode(s, node, { force?, deleteEmptyDirData? })`, `setOutOfService(s, node, on?)`, `fillNodes(s)` (ActionResult).
- **Pods:** `applyBarePod`, `deletePod(s, name, { force })`, `setPodImage`, `replaceBarePod(s, name, patch)`
  (`kubectl replace --force`: probes/resources of a bare Pod), `setPodLabel(s, pod, key, value | null)`;
  `killContainer`, `hangProcess`, `setPodReadiness(s, name, false|null)`, `setDatabase(s, up, seconds)`,
  `setDatabaseBacking(s, service | null)`, `setDatabasePassword(s, pw | null)` (booleans / void).
- **ReplicaSet preview (L11):** `applyReplicaSetReplicas` (integer 0–1000), `setReplicaSetImage(s, rs, image,
  { recreateOne? })` – only new Pods get it; `recreateOne` deletes one Pod so the wrong tag shows up.
- **Deployment:** `setDeploymentVersion(s, name, KlopaApiVersion, extra?)` (a `version` label follows),
  `patchDeploymentTemplate`, `setDeploymentProbes`, `scaleDeployment` (integer 0–1000; NaN, fractions, negatives
  refused with kubectl's / the API's text), `setDeploymentStrategy` (rejects 0/0 with „maxSurge i maxUnavailable ne
  mogu oba biti 0” and malformed percents), `undoRollout(s, name, toRevision?)`, `pauseDeployment`, `rolloutRestart`,
  `deleteDeploymentByName` (cascades), `setVersionRoles(s, { stable, next, broken })`.
- **Secrets:** `applySecret(s, name, data)` (created / configured / unchanged), `deleteSecret`.
- **Service & clients:** `setServiceSelectorByName`, `setServiceTypeByName`, `setServiceSessionAffinity(s, name,
  'None' | 'ClientIP', timeoutS?)` (clears the affinity table), `addTrafficStream(s, { serviceName, rps, profile,
  model, arrival, clientIp, users, keepAlive: { connections, maxAgeS }, routes, targetIp, fromPod })`,
  `setTrafficClient(s, stream, { mode: 'per-request' } | { mode: 'keep-alive', connections, maxAgeS? }, { clientIp? })`,
  `setTrafficTarget(s, stream, ip | null)` („Upiši IP”), `sendRequest(s, stream)` („Pošalji zahtjev”: one request +
  its packet path), `setTrafficProfile(s, stream, profile, { anchor: 'now' | 'absolute' })` (default: the profile
  starts now), `setTrafficEnabled`, `resetTrafficTotals`.
- **Resources:** `placePod` (manual drag; refused with filter reasons, or the API / etcd error), `setPodUsage(s, name,
  { cpuM, memMi, memGrowthMiPerS })`, `resizePod(s, name, resources)` (in place), `setPodResources` (new Pod, like
  `replace --force`), `removeRequests`, `setNodeExtraMemory`.
- **Autoscaling:** `setHpa(s, name, { minReplicas, maxReplicas, targetUtilization })` (rejects min > max, NaN, CPU
  min 0, and while the API is down), `setCpuRequest(s, d, cpuM, { limit: 'ratio' | 'keep' | m, ratio = 2 })`
  (limit follows the request by default; request > limit refused with the API message), `removeCpuRequest`,
  `setClusterAutoscaler`, `setColdImageCache`, `publishMessages`, `setQueueArrivalRate` (both reject NaN/∞/negative),
  `setQueueProfile(s, profile | null)`.
- **Storage:** `scaleStatefulSet`, `deleteStatefulSetByName` (PVCs kept), `deletePvcByName` (pvc-protection),
  `applyPostgresDeployment(s, 'no-volume' | 'shared-pvc')`.
- **Releases (L20):** `startRelease`, `rollbackRelease`, `nextCanaryStep`, `migrateSchema(s, { kind: 'add'|'drop'|'rename', … })`.
- **Goal windows:** `markWindow(s, label)` → id; `windowStats(s, id)` (totals, users hit, per version, per Service
  min ready / seconds with 0 ready endpoints since the mark). Global totals are never reset by it.

### Selectors (read-only)

- **Console:** `kubectlRun(s, 'get pods -o wide' | 'get nodes' | 'get deploy' | 'get rs' | 'get svc' | 'get
  endpointslices' | 'get events' | 'get hpa' | 'get pvc' | 'describe pod X' | 'logs X [--previous] [--timestamps]
  [--tail=N]')` → `{ ok, lines }` (refused / timed out while the API server / etcd is down), `kubectlRead(s, cmd, fn)`.
- **Tables** (what the API holds, frozen status during an outage): `kubectlGetPods(s, { wide })`, `kubectlGetNodes`,
  `kubectlGetDeployments`, `kubectlGetReplicaSets`, `kubectlGetServices`, `kubectlGetEndpointSlices`,
  `kubectlGetEvents`, `kubectlGetHpa`, `kubectlGetPvc`, `kubectlDescribePod(s, name)`, `kubectlLogs(s, name, o)`;
  columns: `podStatus`, `podReadyColumn`, `podRestartsColumn`, `humanDuration`; `apiPod(p)`, `apiStatusStale(p)`.
- **Views:** `podView(s, pod)` (phase / STATUS / READY / restarts as the API holds them + `stale` + `live`, back-off
  ring, probe lanes ✓✕, CPU & memory, QoS, oom_score_adj, orders, pending message, `shape`, `tone`),
  `nodeView(s, node)` (requested vs used vs Σ limits, memory.available, taints, CA unneeded timer),
  `deploymentView(s, name)` (gauges `minAvailable`/`maxTotal`, ReplicaSet tree, history, conditions, rollout record
  with peaks and `requests`), `statusCounts`, `podByIp`, `clusterCost(s, €/node-h)`, `crashLoopDelays(n)`.
- **Kit adapters:** `podShapeView(p)` → `{ status, label }` (pass `label` as PodShape's `caption` – the kit labels
  every `crash` dot „CrashLoopBackOff”, also ImagePullBackOff), `nodeFrameStatus(node | nodeView)` →
  `'ready' | 'notready' | 'cordoned'`, `versionToneFor(s, version)` (preset roles; `versionTone` = fixed table).
- **Scheduling:** `explainScheduling(s, pod)` (✓/✗ per node with reasons and score breakdown),
  `failedSchedulingMessage`, `filterNode`, `scoreNode`, `requestedOnNode`.
- **Services & traffic:** `getEndpointSlice`, `getProxyEndpoints`, `resolveDns(s, name, fromNamespace)`,
  `dnsCandidates`, `tracePacket(s, fromPod, service, i)`, `requestStats(s, windowS, stream?)` (p50/p95/p99 or
  `null`), `redMetrics(s, service, windowS)` (L24 RED panel), `trafficTotals(s, { streamId?, version? })`,
  `serviceStats(s, service)` (ready now, minimum, seconds with 0 ready endpoints), `fluidStats(s, stream)`
  (p95 now / worst, dropped, served, ρ), `streamRate`, `hitShares`, `openConnections`, `distinctUsersHit`, `pickRoute`.
- **Autoscaling:** `s.hpas[i].decisions` (raw / stabilised / final / limitedBy / formula text), `hpaFormula`,
  `pendingUnschedulable`, `podLeadTime(pod)` (waitScheduler / waitNode / pull / start / ready seconds),
  `kedaQueueMetric`, `s.series.*` (replicas, ready, pending, nodes, rps, ok/s, err/s, utilisation, latency, p95,
  queue; `cfg.seriesLengthS` long), `seriesFor(s, deployment)`, `cfg.seriesFocus`.
- **Storage:** `podOrders(s, pod)`, `podsUsingPvc`, `claimName`.
- **Releases:** `releaseStats(s)` (incl. `usersExposed`, `exposurePct`, `requestsToNewPct`),
  `s.release.metrics.exposureSeries`, `canaryReplicasFor`, `replicaSharePct`, `strategyLabel`.
- **Animation:** `renderTime(s)` (last tick + accumulator); `inFlightAt(s)` → `{ r, progress }` for the request
  dots already sent (≤ 200, version and outcome; progress reaches 1 at the Pod); `requestProgress(s, r, at?)`;
  `activeMessages(s)` + `messageProgress(s, m, at?)` for the L11 hops (a message may start slightly in the future –
  draw only the active ones); `messageChain(s, rootId)` for a Stepper; stable ids on every Pod/node/RS/connection.
- **Events:** `s.events` (`{ id, t, kind, text, tone, objectId?, clock? }`, ≤ 50, for the kit's `EventLog`),
  `s.kubeEvents` (kubectl-style).

### L10 model (`desiredState`)

`createDesiredState({ mode: 'manual'|'loop', seed, scripted, dayEvents })`, `stepDesiredState(s, dt)`,
`advanceDesiredState`, actions `handOver`, `placeInstance(s, app, server)` / `setDesired(s, app, n)` (both
`{ ok, reason }`; unknown apps and NaN refused), `removeInstance`, `newVersion`, `failServer`, `repairServer`,
`loseNextEvent`, `reconcile`; selectors `diffs`, `deficit`, `capacity`, `freeSlots`, `usedSlots`, `runningCount`,
`davorSleep`, `clock`, `dayMinute`, `seededDay`, `s.scores`. Events keep the day clock in `clock` („03:00”).

---

### Post-lecture review additions (2026-10)

- Wording: release events say „Uvođenje 2.0.0 (…) je počelo” / „Uvođenje 2.0.0 promovirano na 100 %” (uvođenje = rollout; izdanje = release); action messages „uvođenje je već pokrenuto”, „nema uvođenja za vraćanje”. `NODE_FAILURE_BADGE` includes the ≈ 50 s NotReady detection.
- A traffic stream with a client Pod (`presetService`: klopa-web) is named by that Pod in the client log lines („Klijent klopa-web: …”); the stream id stays `web`.
- `presetScheduler`: Iva's `ivina-proba-*` Pods live in namespace `klopa-staging` (`kubectlRun('get pods')` still lists every namespace).
- `kubectlGetReplicaSets`: only ReplicaSets the preset created (t ≤ 0) are dated an hour back; one created during the sim shows its real age. `kubectlGetHpa`: REPLICAS is `status.currentReplicas` (falls back to the Deployment's replicas before the first sync), and TARGETS is always as wide as its `<unknown>` form, so `-w` rows line up. `formatTable(header, rows, minWidths?)`.
- Evicted message: the „Container … has larger consumption” clause only when usage > request; a zero request prints as `0` (upstream evictionMessage).
- `ControlPlaneMessage.object?` – the Pod name for create / bind / start / status messages and their watch notifications (`message(…, { object })`, `observed(…, object)`).
- Additive helpers: `setTrafficRoutes(s, streamId, routes | null)` (same as writing `stream.routes`), `presetPodHealth({ app })` (behaviour overrides on every Pod, e.g. `{ dependsOnDb: true }`), and `isHung`, `dbAuthFails` exported from the index.

## Usage in a lecture (React + `useSimulation`)

Both components were type-checked and linted with the project's rules (React 19 hooks plugin, `verbatimModuleSyntax`).

```tsx
import { useState } from 'react'
import { Badge, Button, Diagram, EventLog, NodeFrame, PodShape, Segmented, SimFrame, Slider, Stat, StatRow, fmt, useSimulation } from '../../kit'
import {
  COMPRESSED,
  act,
  activeMessages,
  applyReplicaSetReplicas,
  createTimeline,
  messageProgress,
  presetControlPlane,
  seek,
  stepTimeline,
  timelineTime,
  deploymentView,
  inFlightAt,
  markWindow,
  nodeFrameStatus,
  nodeView,
  podShapeView,
  presetRollout,
  requestStats,
  setDeploymentStrategy,
  setDeploymentVersion,
  stepCluster,
  undoRollout,
  versionToneFor,
  windowStats,
  type IntOrPercent,
  type KlopaApiVersion,
} from '../../engines/cluster'

const VERSIONS: { value: KlopaApiVersion; label: string }[] = [
  { value: '1.3.2', label: '1.3.2' },
  { value: '1.4.0', label: '1.4.0' },
  { value: '1.5.0-crash', label: '1.5.0 (ruši se)' },
]
const FENCES: IntOrPercent[] = [0, 1, '25%', '100%']

export function RolloutSim() {
  const [version, setVersion] = useState<KlopaApiVersion>('1.3.2')
  const [surge, setSurge] = useState<IntOrPercent>('25%')
  const [goal, setGoal] = useState<string | null>(null)
  const sim = useSimulation({
    init: () => presetRollout({ seed: 42 }),
    step: (s, dt) => stepCluster(s, dt), // fixed 0,1 s ticks inside; dt = 1/60 s from the hook
  })
  const s = sim.state
  const d = deploymentView(s, 'klopa-api')!
  const req = requestStats(s, 10)
  const win = goal ? windowStats(s, goal) : null

  return (
    <SimFrame
      title="Kontrolna ploča uvođenja"
      sim={sim}
      showTime
      hint="Uvedite 1.4.0 bez ijednog neuspjelog zahtjeva, pa pošaljite 1.5.0 i vratite se s „rollout undo”."
      controls={
        <>
          <Segmented
            label="Slika"
            value={version}
            options={VERSIONS}
            onChange={(v) => {
              setVersion(v)
              sim.mutate((st) => {
                setGoal(markWindow(st, `uvođenje ${v}`))
                setDeploymentVersion(st, 'klopa-api', v)
              })
            }}
          />
          <Segmented
            label="maxSurge"
            value={String(surge)}
            options={FENCES.map((f) => ({ value: String(f), label: String(f) }))}
            onChange={(v) => {
              const next = FENCES.find((f) => String(f) === v)!
              setSurge(next)
              sim.mutate((st) => setDeploymentStrategy(st, 'klopa-api', { maxSurge: next }))
            }}
          />
          <Button variant="success" onClick={() => sim.mutate((st) => undoRollout(st, 'klopa-api'))}>
            rollout undo
          </Button>
          <Badge tone="neutral">{COMPRESSED.rolloutReadinessPeriod.label}</Badge>
        </>
      }
      stats={
        <StatRow>
          <Stat label="Dostupno" value={`${d.available}/${d.replicas}`} sub={`najmanje ${d.minAvailable}`} />
          <Stat label="Podova" value={d.totalPods} sub={`najviše ${d.maxTotal} + ${d.terminatingPods} u gašenju`} />
          <Stat label="Greške (10 s)" value={fmt.pct(req.errorRate, 1)} tone={req.errorRate > 0 ? 'bad' : 'ok'} />
          <Stat label="Neuspjeli u ovom uvođenju" value={win ? win.totals.failed : '–'} tone={win && win.totals.failed > 0 ? 'bad' : 'ok'} />
        </StatRow>
      }
    >
      <Diagram width={760} height={250} label="Tri čvora s Podovima klopa-api; boja označava verziju">
        {s.nodes.map((n, i) => {
          const v = nodeView(s, n)
          const pods = s.pods.filter((p) => p.nodeName === n.name)
          return (
            <NodeFrame key={n.id} x={20 + i * 250} y={20} w={230} h={200} name={n.name} cpu={{ used: v.requested.cpuM, total: v.allocatable.cpuM }} status={nodeFrameStatus(v)}>
              {pods.map((p, j) => {
                const shape = podShapeView(p)
                return <PodShape key={p.id} x={60 + i * 250 + (j % 4) * 48} y={120 + Math.floor(j / 4) * 50} status={shape.status} caption={shape.label} tone={versionToneFor(s, p.spec.app.version)} label={p.spec.app.version} />
              })}
            </NodeFrame>
          )
        })}
        {inFlightAt(s).map(({ r, progress }) => (
          <circle key={r.id} cx={20 + progress * 700} cy={235} r={3} fill={r.outcome === 'ok' ? 'var(--ok)' : 'var(--bad)'} />
        ))}
      </Diagram>
      <EventLog events={s.events.slice(-8)} />
    </SimFrame>
  )
}

export function ControlPlaneTimeline() {
  // the TIMELINE is the hook's state: seek() replaces tl.state, the recorded actions stay
  const sim = useSimulation({
    init: () => createTimeline(() => presetControlPlane()),
    step: (tl, dt) => stepTimeline(tl, dt),
  })
  const tl = sim.state
  const s = tl.state
  return (
    <SimFrame
      title="Klaster pod mikroskopom"
      sim={sim}
      toolbar={<Badge tone="neutral">{fmt.num(timelineTime(tl), 1)} s</Badge>}
      controls={
        <>
          <Button onClick={() => sim.mutate((x) => act(x, 'replicas 5', (st) => applyReplicaSetReplicas(st, 'klopa-api', 5)))}>kubectl apply</Button>
          <Slider label="Premotaj" value={timelineTime(tl)} min={0} max={Math.max(1, tl.headT)} step={0.1} onChange={(t) => sim.mutate((x) => seek(x, t))} />
        </>
      }
    >
      <Diagram width={760} height={120} label="Poruke upravljačke ravnine">
        {activeMessages(s).map((m) => (
          <circle key={m.id} cx={20 + messageProgress(s, m) * 700} cy={20 + m.step * 14} r={4} fill="var(--k8s)" />
        ))}
      </Diagram>
      <EventLog events={s.events.slice(-6)} />
    </SimFrame>
  )
}
```

Notes:
- Read sliders inside `step` or apply them with `sim.mutate(...)`; never mutate the state during render.
- Animate at `renderTime(s)` (the default of every progress helper): the engine ticks every 0,1 s, the hook every
  1/60 s, so dots and hops then move at constant speed. Draw request dots from `inFlightAt(s)` and hops from
  `activeMessages(s)` in one pooled SVG layer.
- The kit's `EventLog` keys rows by time + text; two identical texts in one tick (e.g. two Pods created) then share a
  key. Engine events carry a stable `id` – a lecture-specific log should key by `e.id` (kit owner: consider
  `key={e.id ?? …}`).
- For a lane comparison (L20) create one state per lane with the same seed; traffic is drawn from a per-stream RNG
  so arrivals and users are identical across lanes.
- With a timeline, show `timelineTime(tl)` instead of SimFrame's `showTime` (the hook's clock is not rewound).

---

## Validated numbers (reproduced by the tests)

| Source | Scenario | Engine result | Test |
|---|---|---|---|
| SIM 5 | Fence posts 25 %/25 %, N = 1, 2, 3, 4, 5, 10 | 1/0, 1/0, 1/0, 1/1, 2/1, 3/2; 0 %/10 % of 3 ⇒ 0/1 | `rollout.test.ts` fence posts |
| SIM 5 | N = 4, 25 %/25 % | **28 s** (27,5), peak 5, **7** incl. terminating, min available 3 | validated N=4 timings |
| SIM 5 | surge 1 / unavailable 0 | **51 s** (50,1), peak 5 / 6, min available **4** | 〃 |
| SIM 5 | surge 0 / unavailable 1 | **46 s** (45,2), peak 4 / 5, min available 3 | 〃 |
| SIM 5 | 100 % / 0 | **17 s** (16,2), peak 8 / 8, min available 4 | 〃 |
| SIM 5 | Broken image, N = 4 | stalls at **3 old Ready + 2 new unready**, `ProgressDeadlineExceeded` at 60–61,5 s (sim deadline 60), nothing rolls back after 5 more minutes | crashing 1.5.0 stalls … |
| SIM 5 | Broken image, N = 10, surge 3, unavailable 2 | **8 old / 5 new** (docs example) | N=10 … |
| L13 | Healthy rollout 1.3.2 → 1.4.0 | `rollout.requests`: **0 failed** (≈ 560 ok) | `regressions.test.ts` per-rollout counters |
| L13 | Recover from 1.5.0 with `rollout undo` | complete in **< 30 s**; history renumbers (1, 3, 4) | rollout undo … |
| L13 | Recreate | old Pods drain **5,0 s** through the terminating fallback, then **0 endpoints for 11,2 s** (schedule 1 + pull 4 + start 6 s); ≈ 200 connection errors | Recreate empties the app |
| L13 | No readiness probe | ≈ 100 HTTP 503 during warm-up (> 50) | readiness probe off |
| L13 | `nodes: 'small'`, replicas 10 | 1 Pod Pending „0/3 nodes are available: 3 Insufficient cpu.” | presetRollout small |
| L14 | Shutdown race | no preStop: a few failed requests (**24** at seed 42); `preStop: sleep 5`: **0**; switching preStop on is itself a rollout (**25** failed), the next 1.4.0 → 1.4.1 rollout **0** | L14 shutdown race, per-rollout counters |
| L14 | DNS from Namespace `klopa` | `db-1.db`, `db-1.db.klopa`, `db-1.db.klopa.svc`, FQDN ⇒ the Pod IP; `db-1.db` from `drugi` ⇒ NXDOMAIN | DNS search path |
| SIM 4 | Spike 20 → 100 rps at t = 60 | HPA **2→3 (60), 3→7 (75, raw 8 capped by +4), 7→9 (90)**; CA triggered **t = 80**, node Ready **t = 155**, all 9 Ready ≤ **180** | `hpa.test.ts` validated spike timeline |
| SIM 4 | t = 60–75 | ρ = 1,25 (shown capped at 0,99), latency ≈ **5 s** (M/M/1 estimate), requests dropped | during t = 60–75 … |
| SIM 4 | Any drop (flash crowd, no CPU request, 6 limitless Pods at 180 rps) | **ρ ≥ 1 in every second with drops** (e.g. 6 limitless Pods: ρ 1,30, 41,6 req/s dropped) | fluid model ρ |
| SIM 4 | Lead time of a Pod on the new node | Pending 5 s → node 75 s → pull 5 s → start 1 s → Ready 10,1 s | lead time per Pod |
| SIM 4 | Dead band, scale-down | stays **9** (util **55 %**, ratio 1,10 within tolerance); back to **2 at t = 720** | dead band … |
| E1 | Formula | 3 Pods at 90 %, target 50 ⇒ **6**; 54 % ⇒ no change | formula … |
| HPA | 3 Pods at 50 % of a 50 % target + 1 without a metric | ratio 1,0 ⇒ the missing Pod is left out, stays **4** (was wrongly 3) | HPA missing metrics |
| SIM 4 | CA scale-down | extra node removed after ≥ 10 min unneeded, never below min | Cluster Autoscaler removes … |
| KEDA | Steady 0,5 / 1 / 5 msg/s | worker **never scaled to 0** under load (ready + unacked > 0); night → 0, first message → 1 at the next poll | KEDA … |
| SIM 3 | `big-db` | „0/3 nodes are available: 2 Insufficient memory, 3 Insufficient cpu. preemption: 0/3 nodes are available: 3 No preemption victims found for incoming pod.” | `scheduler.test.ts` big-db |
| SIM 3 | `fragment` | Pending („3 Insufficient cpu”) although Σ free CPU ≥ 1500m | automatic scheduling … |
| SIM 3 | `cpu-burner` | throttled **50 %** (500m of 1000m), 0 restarts | CPU over the limit … |
| SIM 3 | `leaky` | **OOMKilled 137 at 31,3 s** after start (156 Mi / 5 Mi/s = 31,2 s + one 0,1 s tick), CrashLoopBackOff, neighbours unharmed; also with the kubelet stopped | leaky …, cgroup limit |
| SIM 3 | LeastAllocated `web` on node-2 | cpu 91, mem 96 ⇒ **93** | LeastAllocated scoring … |
| L17 | CFS quota 200m, 50 ms of work | **210 ms** (20 + 80 + 20 + 80 + 10) | CFS quota … |
| D | QoS / oom_score_adj | Guaranteed −997, BestEffort 1000, Burstable **938** (256Mi of 4096Mi, `1000 − ⌊62,5⌋`), bounds 3…999 | QoS classes … |
| L17 | `resizePod` leaky to a 1Gi limit | same Pod, same IP, 0 restarts, OOM loop stops; QoS change refused | L17 resizePod |
| L10 | Server-2 fails at 03:00 | 27 containers in 28 slots, restored within one pass + 5 s; manual: > 2700 missing instance-minutes, Davor sleeps ≤ 31 of 270 min; loop: < 100, 270 of 270 | `cluster.test.ts` L10 … |
| L10 | 12:00 lunch, loop | the six extra api instances spread **2/2/2** (every server 9/14 used after the 10:00 version); with the version after lunch ≥ 4 land on server-2 | L10 lunch |
| L11 | `kubectl apply` replicas | hop starts: 1 at 0,0 s, 2 at 0,3, ack 0,6, reply 0,75, 3 at ≈ 0,9, 4 at ≈ 1,5, 5 at ≈ 2,0 s | L11 causal |
| L11 | kubelet off | NotReady after **10 s** (sim · 50 s), Pods Terminating after +**20 s** (sim · 5 min), RS Pods recreated, bare Pod not | L11 kubelet off … |
| L11 | Wrong tag | ErrImagePull → ImagePullBackOff, retries **10, 20, 40, 80 s** | L11 wrong tag … |
| L11 | Napuni čvorove | „0/3 nodes are available: 3 Insufficient memory. preemption: …” | L11 „Napuni čvorove” |
| L12 | Crash at start | restarts after **1 (sync), 10, 20, 40, 80 s** from exit; `crashLoopDelays` 0, 10, 20, 40, 80, 160, 300, 300 | L12 crash on start … |
| L12 | Slow start 40 s | no startup probe ⇒ CrashLoopBackOff; startup probe (6 × 10 s) ⇒ Ready at **40–45 s**, 0 restarts | L12 slow start … |
| L12 | DB down 60 s (seed 42) | liveness on DB: every Pod restarts (6 restarts, 1533 failed); readiness on DB: 0 restarts, **37 s** with 0 endpoints (782 connection errors); process-only: 0 restarts, 0 empty-endpoint seconds, ≈ 1200 fast 503 | L12 DB outage …, serviceStats, goal windows |
| L19 | Node failure, Deployment + RWO PVC | replacement at **+30 s** (10 + 20 sim), Multi-Attach, Running at **+56 s** (after 24 s force detach), data kept | `storage.test.ts` node failure … |
| L19 | StatefulSet, node lost | `db-1` stays Terminating, **never two db-1**; out-of-service ⇒ moved and Ready ≤ 10 s | sudden node loss … |
| L19 | Scale 3 → 1 → 3 | `db-2` keeps its orders (each ordinal writes through its own Service) | L19 StatefulSet writes |
| L20 | Lanes, seed 42 | Recreate downtime **12 s**; Rolling mixed-version **12 s**; Blue-green switch **11,2 s** after start, **168** extra Pod-seconds; Canary by replicas ≈ **20 %**, aborted after the first step, **21 users hit**, 11 % of users exposed; by weights ≈ 5 %, **7 users hit**, 3 % exposed | `release.test.ts`, L20 users and exposure |
| L20 | Rollback | rolling **17 s**, recreate 14 s, blue-green inside the delay **2,8 s** (flip + 1 s propagation) | 〃 |
| L20 | Hidden mode (no analysis) | users exposed after 20 / 40 s: weights 1 % / 3 %, replicas 3 % / 11 % | L20 users and exposure |
| L20 | Expand/contract | one-step rename ⇒ v1 HTTP 500 until the rollout ends; add → roll out → drop ⇒ **0 errors**; rollback after the drop ⇒ v1 errors | expand/contract … |
| L24 | Secret rotated | running Pods keep the old `DB_PASSWORD` (HTTP 500 „password authentication failed”) until `rollout restart` | env from a Secret |
| Invariants | Random actions on 4 presets × 3 seeds | Σ requests ≤ allocatable on every node, unique Pod IPs, terminating endpoints never ready, never two Pods with one StatefulSet identity, ReplicaSets converge; rollout never exceeds N + surge, never below N − unavailable; unique event ids | invariants …, `rollout()` helper |

---

## Which lecture uses what

| Lecture | Preset / API | Features |
|---|---|---|
| **10** Željeno stanje | `desiredState.*` | manual vs „Predaj Kubernetesu”, desired slider (`setDesired`), `failServer` / „Ugasi poslužitelj u 03:00”, `loseNextEvent`, mid-repair change, capacity limit („nema mjesta”), scores, `COMPRESSED.l10LoopTick`, event `clock`. |
| **11** Klaster iznutra | `presetControlPlane`, `createTimeline/stepTimeline/seek` | `applyReplicaSetReplicas` (0–9), `setComponent`, `setKubelet('node-2')`, `setReplicaSetImage(WRONG_TAG_IMAGE, { recreateOne: true })`, `fillNodes`, `deletePod`, `powerOffNode`, `activeMessages` / `messageProgress` / `messageChain` (steps 1–6, causal), `kubectlRun` (refused while the API is down), `kubectlGetEvents`, `podView(…).stale`, `s.kubectlLog`. |
| **12** Pod i zdravlje | `presetPodHealth` | behaviours, probes (`probe(path, {…})`, `replaceBarePod` to change them), `setPodImage` (dobar/krivi tag), `hangProcess`, `setDatabase(false, 60)`, `deletePod`, `powerOffNode`, `podView` (probe lanes, back-off ring, phase/STATUS/READY), `kubectlDescribePod`, `kubectlLogs`, `statusCounts`, `markWindow` + `windowStats(…).services` („bez 0 endpointa”). |
| **13** Deployment | `presetRollout` | versions 1.3.2 / 1.4.0 / 1.5.0-crash / 1.5.0-never-ready, `scaleDeployment` (1–10), `nodes: 'small'` (replicas ≠ machines), `setDeploymentStrategy`, `setDeploymentProbes` (readiness toggle), `pauseDeployment`, `undoRollout(…, N)`, `deleteDeploymentByName`, `setPodLabel` (escape the RS), `deploymentView` (`rollout.requests` for „bez ijednog neuspjelog zahtjeva”), `versionToneFor`. |
| **14** Service | `presetService` | draggable `app` / `version` labels (`setPodLabel`), `setServiceSelectorByName` (typo), `setPodReadiness`, `getEndpointSlice` (ready/serving/terminating), `setTrafficClient` (nova veza / jedna dugotrajna / N veza, `maxAgeS`), `setServiceSessionAffinity`, `setServiceTypeByName`, `sendRequest` (korak po korak) + `tracePacket`, `preStopSleepS`, `setTrafficTarget` + `podByIp` („Upiši IP”), `resolveDns`, `hitShares`, `rollout.requests` („1.4.0 → 1.4.1 s 0 grešaka”). (The L04 rack in Service mode is E1.) |
| **17** Resursi | `presetScheduler` | `placePod`, `setComponent('scheduler', true)`, `explainScheduling`, `setPodUsage` (Curenje memorije / CPU petlja), `resizePod` (klizači requests/limits, in place), `setPodResources` / `removeRequests` (new Pod), `apiCard: 'burstable'`, `setNodeExtraMemory`, `nodeView` (three layers), `podView` (QoS, throttling), `cfsLatencyMs({ limitM, workMs })`. |
| **18** Autoskaliranje | `presetAutoscaling` | `TRAFFIC_PRESETS` + `setTrafficProfile` (anchored at the click), `setHpa`, `setCpuRequest` (limit 2× request), `removeCpuRequest`, `setClusterAutoscaler`, `setColdImageCache`, KEDA (`keda: true`, `publishMessages`, `setQueueArrivalRate`, `setQueueProfile(QUEUE_DAY)` for „Worker na 0 noću”), `hpas[0].decisions` (formula timeline), `fluidStats` (worst p95 for „p95 < 300 ms”), `podLeadTime`, `clusterCost`, `s.series` (1500 s). |
| **19** Volumeni i StatefulSet | `presetStorage` | `killContainer`, `deletePod`, `powerOffNode` („Čvor pao”), `setOutOfService`, `scaleStatefulSet` (0–3, per-ordinal data), `applyPostgresDeployment('no-volume' \| 'shared-pvc')`, `deletePvcByName`, `deleteStatefulSetByName`, `podOrders`, `resolveDns('db-1.db')`, `NODE_FAILURE_BADGE`, `drainNode` (emptyDir refused). |
| **20** Strategije | `presetRelease` | lanes `recreate` / `rolling` / `blue-green` / `canary-replicas` / `canary-weights`, `startRelease`, `rollbackRelease`, `nextCanaryStep`, `releaseStats` (downtime, users hit, users exposed / exposure %, extra Pod-hours, time to rollback, mixed window), `exposureSeries` (hidden mode, `analysis: false`), bug-rate slider (`bugRate`), steps / threshold, `keepAlive` (blue-green), `migrateSchema` + `schema: true`. |
| **24** Dan izdanja | any preset | fault deck: selector typo (`setServiceSelectorByName`), liveness/readiness on DB (`probe('/ready-db')` + `setDatabase`), OOM (`resources` + `setPodUsage`), tag typo (`patchDeploymentTemplate({ image: WRONG_TAG_IMAGE })` ⇒ ImagePullBackOff + `ProgressDeadlineExceeded`), missing Secret / key (`env: { X: { secretRef, key } }` ⇒ CreateContainerConfigError), stale Secret after rotation (`applySecret` + `setDatabasePassword`, fixed by `rolloutRestart`), `setHpa({ maxReplicas })`, `removeCpuRequest`; console `kubectlRun` (get / describe / logs / events / endpointslices), `redMetrics`, `markWindow` for MTTR. |

### Notes for curriculum and lecture authors

These lines of the course spec disagree with the (correct) engine; the engine follows upstream Kubernetes:

- **L14 model** says „kube-proxy routes only to ready endpoints”. Since 1.28 kube-proxy falls back to
  serving-and-terminating endpoints when none is ready (KEP-1669); the engine does this, which is why a Recreate
  rollout keeps answering during the 5 s drain. Suggested wording: „…only to ready endpoints; if none is ready, to
  Pods that are shutting down but still answer”.
- **L20 task** „Uvedite 2.0 tako da grešku vidi < 50 korisnika (solvable only with Gateway weights)”: at the model's
  own defaults (20 rps, 30 s steps, bug 20 %, analysis on) canary by replicas hits **21** users and by weights **7**,
  so both pass. A threshold of **< 15** makes it hold.
- **L10 model** „12:00 … new instances land mostly on server-2”: the 10:00 new version already filled the repaired
  server-2, so with the loop the lunch instances spread 2/2/2. Either move the new version after lunch (`dayEvents`)
  or drop the claim.
- **L17 task** „Učinite api Guaranteed” vs the SIM 3 card list (api-guaranteed is Guaranteed): use
  `presetScheduler({ apiCard: 'burstable' })` for the task, or change the task text.
- **sim-models.md** SIM 3: the Burstable bound is 3 (1000 − 997), not 2, and 256Mi on 4096Mi gives 938, not 937;
  SIM 4 / SIM 5 parameter lists say ρ cap 0,95 and shutdown 2 s while the validated timelines use 0,99 and 5 s.

---

## Files

`index.ts` (public API) · `types.ts` · `config.ts` (REAL / COMPRESSED / templates) · `core.ts` (state + loop) ·
`util.ts` · `pods.ts` · `nodes.ts` · `kubelet.ts` · `scheduler.ts` · `replicaset.ts` · `rollout.ts` ·
`statefulset.ts` · `storage.ts` · `service.ts` · `traffic.ts` · `hpa.ts` · `autoscaler.ts` · `keda.ts` ·
`release.ts` · `actions.ts` · `presets.ts` · `views.ts` · `replay.ts` · `desired-state.ts` (L10) ·
tests: `cluster.test.ts`, `rollout.test.ts`, `scheduler.test.ts`, `hpa.test.ts`, `storage.test.ts`, `release.test.ts`,
`regressions.test.ts`.

Tick order inside `processTick` (matches the validated prototypes): API status freeze/thaw → database state → node
lifecycle → [whole second: traffic demand → CPU → served; metrics scrape; HPA] → KEDA → Deployment → StatefulSet →
ReplicaSet → garbage collector → scheduler → storage → kubelets (memory cgroup check on every running machine) →
EndpointSlices/kube-proxy → Service stats → requests → Cluster Autoscaler → rollout bookkeeping → release lanes →
series.
