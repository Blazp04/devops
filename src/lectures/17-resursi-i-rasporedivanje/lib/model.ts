/**
 * Thin adapters over the E3 cluster engine for lecture 17 (no own scheduling / kubelet logic here):
 * named presets of the flagship sim, the incident numbers, small helper clusters for the stepper scenes,
 * the GKE allocatable formula (a documented fact, shown with its label) and number formatting.
 */
import {
  COMPRESSED_FAILURE_TIMINGS,
  REGISTRY,
  advance,
  appBehaviour,
  createCluster,
  createPodObject,
  effectiveRequests,
  nodeSpec,
  nodeView,
  oomScoreAdj,
  podTemplate,
  presetScheduler,
  qosClass,
  resources,
  setNodeExtraMemory,
  setPodUsage,
  warmStart,
  type ClusterState,
  type Pod,
} from '../../../engines/cluster'

export const SEED = 42

export type PresetKey = 'tetris' | 'incident'

export const PRESETS: { value: PresetKey; label: string; title: string }[] = [
  { value: 'tetris', label: 'Tetris (ručno)', title: 'Raspoređivač je ugašen: vi smještate kartice' },
  { value: 'incident', label: 'Incident 17', title: 'Raspoređivač radi, batch troši 700m – brojke s kartice incidenta' },
]

/** Cards of the deck in display order (engine names, api = the Burstable variant for „Učinite api Guaranteed”). */
export const CARD_ORDER = ['web', 'api', 'cpu-burner', 'batch', 'leaky', 'besteffort', 'big-db', 'fragment'] as const
export const IVA_PODS = ['ivina-proba-1', 'ivina-proba-2', 'ivina-proba-3']

/** What each card stands for (shown under the card / in the panel). */
export const CARD_NOTE: Record<string, string> = {
  web: 'klopa-web: mala rezervacija, limit dvostruko veći',
  api: 'klopa-api: requests ≠ limits (Burstable)',
  'cpu-burner': 'rezervira 250m, želi 1000m, limit 500m',
  batch: 'noćni izvještaj: CPU limita nema',
  leaky: 'curi 5 Mi/s, limit memorije 256Mi',
  besteffort: 'bez requests i limits',
  'big-db': 'baza: 4 procesorske jezgre i 8 GiB rezervacije',
  fragment: 'novi Pod: 1500m u jednom komadu',
  'ivina-proba-1': 'Ivin testni Pod: rezervira 1500m, troši 20m',
  'ivina-proba-2': 'Ivin testni Pod: rezervira 1000m, troši 20m',
  'ivina-proba-3': 'Ivin testni Pod: rezervira 1000m, troši 20m',
}

/** batch's „Stvarna potrošnja” in the incident preset (the rest of the deck runs at its card values). */
export const INCIDENT_BATCH_CPU_M = 700
/** The incident card's numbers are read after this many simulated seconds. */
export const INCIDENT_READ_AT_S = 10

export function makePreset(key: PresetKey): ClusterState {
  if (key === 'incident') {
    const s = presetScheduler({ seed: SEED, manual: false, apiCard: 'burstable', cards: CARD_ORDER.filter((c) => c !== 'big-db') })
    setPodUsage(s, 'batch', { cpuM: INCIDENT_BATCH_CPU_M })
    return s
  }
  return presetScheduler({ seed: SEED, apiCard: 'burstable' })
}

export interface ClusterNumbers {
  usedCpuM: number
  requestedCpuM: number
  allocCpuM: number
  usedPct: number
  requestedPct: number
  /** Σ (allocatable − requested) over nodes */
  freeCpuM: number
  /** largest free CPU on one node */
  maxFreeOnNodeM: number
  pending: number
}

export function clusterNumbers(s: ClusterState): ClusterNumbers {
  let used = 0
  let req = 0
  let alloc = 0
  let maxFree = 0
  for (const n of s.nodes) {
    const v = nodeView(s, n)
    used += v.used.cpuM
    req += v.requested.cpuM
    alloc += v.allocatable.cpuM
    maxFree = Math.max(maxFree, v.allocatable.cpuM - v.requested.cpuM)
  }
  const pending = s.pods.filter((p) => p.nodeName === null && p.deletion === null && p.phase === 'Pending').length
  return {
    usedCpuM: used,
    requestedCpuM: req,
    allocCpuM: alloc,
    usedPct: alloc ? used / alloc : 0,
    requestedPct: alloc ? req / alloc : 0,
    freeCpuM: alloc - req,
    maxFreeOnNodeM: maxFree,
    pending,
  }
}

/** The incident preset run headlessly for INCIDENT_READ_AT_S – the numbers printed on the IncidentCard. */
export function incidentSnapshot(): { s: ClusterState; numbers: ClusterNumbers; node2RequestedPct: number; node2UsedPct: number; fragmentMessage: string } {
  const s = makePreset('incident')
  advance(s, INCIDENT_READ_AT_S)
  const n2 = nodeView(s, s.nodes.find((n) => n.name === 'node-2')!)
  const frag = s.pods.find((p) => p.name === 'fragment')
  return {
    s,
    numbers: clusterNumbers(s),
    node2RequestedPct: n2.requested.cpuM / n2.allocatable.cpuM,
    node2UsedPct: n2.used.cpuM / n2.allocatable.cpuM,
    fragmentMessage: frag?.scheduled.message ?? '',
  }
}

// ------------------------------------------------------------------ formatting

/** 1500 → „1500m”; 2000 → „2000m” (kubectl style keeps millicores in the sim). */
export function cpu(m: number): string {
  return `${Math.round(m)}m`
}
export function mem(mi: number): string {
  return `${Math.round(mi)}Mi`
}
export function pct(v: number): string {
  return `${Math.round(v * 100)} %`
}

// ------------------------------------------------------------------ GKE allocatable (a documented formula, labelled)

/**
 * Allocatable as GKE computes it (other clouds use other tables): CPU reserve 6 % of the 1st core, 1 % of the 2nd,
 * 0,5 % of cores 3–4, 0,25 % above; memory reserve 25 % of the first 4 GiB (255 MiB below 1 GiB), 20 % of the next 4,
 * 10 % of the next 8, 6 % of the next 112, 2 % above; plus the 100Mi eviction threshold.
 */
export function gkeAllocatable(cpuM: number, memMi: number): { cpuM: number; memMi: number; cpuReservedM: number; memReservedMi: number; evictionMi: number } {
  const cores = cpuM / 1000
  let cpuRes = 0
  cpuRes += Math.min(cores, 1) * 60
  cpuRes += Math.max(0, Math.min(cores, 2) - 1) * 10
  cpuRes += Math.max(0, Math.min(cores, 4) - 2) * 5
  cpuRes += Math.max(0, cores - 4) * 2.5
  let memRes = 0
  if (memMi < 1024) memRes = 255
  else {
    const tiers: [number, number][] = [
      [4096, 0.25],
      [4096, 0.2],
      [8192, 0.1],
      [114688, 0.06],
      [Infinity, 0.02],
    ]
    let left = memMi
    for (const [size, rate] of tiers) {
      const part = Math.min(left, size)
      memRes += part * rate
      left -= part
      if (left <= 0) break
    }
  }
  const evictionMi = 100
  return { cpuM: Math.round(cpuM - cpuRes), memMi: Math.round(memMi - memRes - evictionMi), cpuReservedM: Math.round(cpuRes), memReservedMi: Math.round(memRes), evictionMi }
}

// ------------------------------------------------------------------ small helper clusters (engine, headless)

const FAST = { ...COMPRESSED_FAILURE_TIMINGS, scheduleDelayS: 0, containerCreateS: 1, imagePullS: 2, imageCache: 'node' as const }

/** Node sizes scene: Mali 1/2, Srednji 2/4, Veliki 4/8 (L04 machines), filled with klopa-api Pods by the real scheduler. */
export const SIZE_NODES = [
  { name: 'mali', cpuM: 1000, memMi: 2048, label: 'Mali', spec: '1 vCPU · 2 GiB' },
  { name: 'srednji', cpuM: 2000, memMi: 4096, label: 'Srednji', spec: '2 vCPU · 4 GiB' },
  { name: 'veliki', cpuM: 4000, memMi: 8192, label: 'Veliki', spec: '4 vCPU · 8 GiB' },
]
export const SIZE_POD = { cpuM: 250, memMi: 384 }

export function packNodeSizes(replicas: number): { perNode: Record<string, number>; pending: number; alloc: Record<string, { cpuM: number; memMi: number }> } {
  const s = createCluster({
    seed: SEED,
    nodes: SIZE_NODES.map((n) => {
      const a = gkeAllocatable(n.cpuM, n.memMi)
      return nodeSpec(n.name, { cpuM: n.cpuM, memMi: n.memMi, allocatableCpuM: a.cpuM, allocatableMemMi: a.memMi })
    }),
    timings: FAST,
  })
  const tpl = podTemplate({
    labels: { app: 'klopa-api' },
    image: `${REGISTRY}/klopa-api:1.4.0`,
    resources: resources(SIZE_POD.cpuM, SIZE_POD.memMi, undefined, 512),
    app: appBehaviour({ cpuDemandM: 120, memMi: 260, warmS: 1 }),
  })
  for (let i = 0; i < replicas; i++) createPodObject(s, tpl, { name: `klopa-api-${i + 1}`, namespace: 'klopa', owner: null })
  advance(s, 4)
  const perNode: Record<string, number> = {}
  const alloc: Record<string, { cpuM: number; memMi: number }> = {}
  for (const n of s.nodes) {
    perNode[n.name] = s.pods.filter((p) => p.nodeName === n.name).length
    alloc[n.name] = { ...n.allocatable }
  }
  return { perNode, pending: s.pods.filter((p) => p.nodeName === null).length, alloc }
}

/** QoS scene: one node-3-sized node with three Pods of three QoS classes; memory pressure from outside the Pods. */
export interface QosRun {
  pods: { name: string; qos: string; reqMi: number; usedMi: number; limMi: number | null; adj: number }[]
  /** eviction order as the kubelet did it (names) */
  evicted: string[]
  /** the kernel OOM killer's victim when memory runs out between two housekeeping passes */
  kernelVictim: string | null
  messages: string[]
}

function qosCluster(): ClusterState {
  const s = createCluster({ seed: SEED, nodes: [nodeSpec('node-3', { cpuM: 2000, memMi: 8192, allocatableCpuM: 1930, allocatableMemMi: 6249 })], timings: FAST })
  const mk = (name: string, r: ReturnType<typeof resources>, cpuDemandM: number, memMi: number) =>
    createPodObject(s, podTemplate({ labels: { app: name }, image: `${REGISTRY}/${name}:1.0.0`, resources: r, app: appBehaviour({ cpuDemandM, memMi, warmS: 1 }) }), { name, namespace: 'klopa', owner: null, nodeName: 'node-3' })
  mk('api', resources(500, 512, 500, 512), 400, 400)
  mk('web', resources(250, 256, 500, 512), 150, 300)
  mk('fotografije', resources(), 200, 900)
  warmStart(s)
  return s
}

/**
 * The upstream kubelet names the container only when it uses more than its request, and prints a zero request as
 * „0” (resource.Quantity); the engine always appends the clause with „0Mi” – trimmed here to the real wording.
 */
function kubeletEvictionMessage(m: string): string {
  return m.replace(/ ?Container (\S+) was using (\d+)Mi, request is (\d+)Mi, has larger consumption of memory\./, (_all, name: string, used: string, req: string) => {
    if (Number(used) <= Number(req)) return ''
    return ` Container ${name} was using ${used}Mi, request is ${req === '0' ? '0' : `${req}Mi`}, has larger consumption of memory.`
  })
}

export function qosRun(): QosRun {
  const s = qosCluster()
  const node = s.nodes[0]
  const pods = s.pods.map((p: Pod) => ({
    name: p.name,
    qos: qosClass(p.spec),
    reqMi: effectiveRequests(p.spec).memMi,
    usedMi: p.usage.memMi,
    limMi: p.spec.resources.limits.memMi ?? null,
    adj: oomScoreAdj(p.spec, node.capacity.memMi),
  }))
  // squeeze the node from outside the Pods (a process the scheduler does not see): memory.available 60Mi, again after
  // every eviction, so one housekeeping pass at a time shows the kubelet's ranking
  const evicted: string[] = []
  const messages: string[] = []
  for (let i = 0; i < 3; i++) {
    const v = nodeView(s, s.nodes[0])
    if (v.memoryAvailableMi > 60) setNodeExtraMemory(s, 'node-3', s.nodes[0].extraSystemMemMi + v.memoryAvailableMi - 60)
    advance(s, 10)
    for (const p of s.pods) if (p.reason === 'Evicted' && !evicted.includes(p.name)) evicted.push(p.name)
  }
  for (const e of s.kubeEvents) if (e.reason === 'Evicted') messages.push(kubeletEvictionMessage(e.message))
  // kernel OOM: memory jumps past allocatable + 100Mi before the kubelet looks again
  const k = qosCluster()
  const v1 = nodeView(k, k.nodes[0])
  setNodeExtraMemory(k, 'node-3', v1.memoryAvailableMi + 50)
  advance(k, 0.2)
  const victim = k.pods.find((p) => p.container.lastTermination?.reason === 'OOMKilled')?.name ?? null
  return { pods, evicted, kernelVictim: victim, messages }
}

/** Scene 4 (memory): the leaky card alone on a node – memory samples, OOM kills and restarts from the engine. */
export interface LeakyRun {
  limitMi: number
  samples: { t: number; mem: number }[]
  ooms: number[]
  restarts: number[]
  end: number
}

export function leakyRun(seconds = 240): LeakyRun {
  const s = presetScheduler({ seed: SEED, testPods: false, manual: false, cards: ['leaky'] })
  const samples: { t: number; mem: number }[] = []
  const ooms: number[] = []
  const restarts: number[] = []
  let last = 0
  for (let t = 0; t <= seconds; t += 0.5) {
    advance(s, 0.5)
    const p = s.pods[0]
    samples.push({ t: s.t, mem: p.processUp ? p.usage.memMi : 0 })
    for (const e of s.events) {
      const no = Number(e.id.replace(/\D/g, ''))
      if (no <= last) continue
      last = no
      if (e.kind === 'oom') ooms.push(e.t)
      if (e.kind === 'container-restarted') restarts.push(e.t)
    }
  }
  return { limitMi: s.pods[0].spec.resources.limits.memMi ?? 0, samples, ooms, restarts, end: s.t }
}
