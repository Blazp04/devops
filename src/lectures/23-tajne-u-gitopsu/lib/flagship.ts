/**
 * „Put tajne (2. dio)” (flagship, engine E5 `src/engines/access`): the two starting states and the drawing layouts.
 * The model lives in the engine – this file only creates the state and places things on the page.
 */
import { createAccessPreset, L23_ACTORS, rebuildCluster, step } from '../../../engines/access/index.ts'
import type { AccessState, ActorId, GraphNodeId } from '../../../engines/access/index.ts'

/** Seed of both starting states (E5 presets `l23` and `l23-rebuild`). */
export const SEED = 42

export type StartId = 'incident' | 'l23'

export const START_LABEL: Record<StartId, string> = {
  incident: 'incident: novi klaster',
  l23: 'sve u Gitu',
}

/** Simulated seconds after the rebuild at which the incident is read (the new worker Pod is up by then); the „incident” start begins here. */
export const INCIDENT_AT = 10

/** What the SimFrame subtitle prints for each start (preset + seed). */
export const START_PRESET: Record<StartId, string> = {
  incident: 'l23-rebuild · novi klaster',
  l23: 'l23',
}

/**
 * Incident 23 = preset `l23-rebuild` (DB password applied by hand, SMS key as a plain Secret in Git, both consumed as
 * env), `INCIDENT_AT` s after `rebuildCluster`: the klopa-api Pods stay in CreateContainerConfigError, the worker runs.
 * The sim starts at that moment, so its first view matches the incident card. The eyes and goals look at the SMS key.
 * `l23` = both values as plain Secrets in Git, consumed from a volume (the engine's validated preset).
 */
export function createStart(id: StartId): AccessState {
  if (id === 'l23') return createAccessPreset('l23', { seed: SEED })
  const s = createAccessPreset('l23-rebuild', { seed: SEED, focusSecretId: 'sms', goalSecretId: 'sms' })
  rebuildCluster(s)
  step(s, INCIDENT_AT)
  return s
}

/** The ten eyes of L23 in the engine's order (numbers 1–10 on the map and the board). */
export const EYES: readonly ActorId[] = L23_ACTORS

export type Pt = readonly [number, number]

export interface Zone {
  x: number
  y: number
  w: number
  h: number
  label: string
  lx: number
  ly: number
  kind: 'outside' | 'cluster' | 'ns' | 'cp' | 'disk' | 'node'
}

/** Places on the map (graph nodes this lecture draws). */
export type Place = 'laptop' | 'git' | 'ci' | 'cilog' | 'memory' | 'argocd' | 'redis' | 'api' | 'controller' | 'etcd' | 'store' | 'kms' | 'node'

export type EdgeId = 'commit' | 'pull' | 'ci' | 'cilog' | 'sync' | 'cache' | 'etcd' | 'kubelet' | 'ctrl' | 'storeCtrl' | 'storeArgo' | 'storeNode' | 'kms' | 'storeWrite'

export interface MapLayout {
  w: number
  h: number
  /** printed lettering (names, tags, numbers) in viewBox units – the layout is used only where it stays ≥ 12 px */
  font: number
  /** handwriting (zone labels, notes) */
  hand: number
  pod: number
  zones: Zone[]
  at: Record<Place, Pt>
  /** where each place's printed name sits (centre of the baseline) */
  name: Partial<Record<Place, Pt>>
  /** first tag of the stack of „where the value lives” tags for a place */
  tag: Partial<Record<Place, Pt>>
  pods: readonly Pt[]
  eyes: Record<string, Pt>
  /** offset of the eye's number from the eye centre */
  num: Pt
  edges: Record<EdgeId, Pt[]>
}

export const WIDE: MapLayout = {
  w: 880,
  h: 548,
  font: 16,
  hand: 22,
  pod: 52,
  zones: [
    { x: 8, y: 8, w: 230, h: 532, label: 'izvan klastera: tim', lx: 20, ly: 33, kind: 'outside' },
    { x: 252, y: 8, w: 478, h: 532, label: 'klaster', lx: 266, ly: 33, kind: 'cluster' },
    { x: 266, y: 46, w: 138, h: 296, label: 'Argo CD', lx: 276, ly: 70, kind: 'ns' },
    { x: 416, y: 46, w: 302, h: 296, label: 'upravljačka ravnina', lx: 426, ly: 70, kind: 'cp' },
    { x: 428, y: 196, w: 278, h: 134, label: 'disk', lx: 438, ly: 218, kind: 'disk' },
    { x: 266, y: 356, w: 452, h: 170, label: 'čvor (kubelet)', lx: 276, ly: 380, kind: 'node' },
    { x: 744, y: 8, w: 128, h: 532, label: 'izvan klastera', lx: 752, ly: 33, kind: 'outside' },
  ],
  at: {
    laptop: [64, 88],
    git: [64, 214],
    ci: [44, 352],
    cilog: [122, 352],
    memory: [58, 452],
    argocd: [335, 124],
    redis: [335, 252],
    api: [476, 118],
    controller: [650, 118],
    etcd: [492, 266],
    store: [808, 120],
    kms: [808, 302],
    node: [330, 404],
  },
  name: {
    laptop: [64, 132],
    git: [64, 246],
    ci: [44, 394],
    cilog: [122, 394],
    memory: [72, 500],
    argocd: [335, 178],
    redis: [335, 302],
    api: [480, 152],
    controller: [650, 152],
    store: [808, 168],
    kms: [808, 344],
  },
  tag: {
    laptop: [64, 156],
    git: [64, 270],
    cilog: [122, 418],
    memory: [130, 470],
    redis: [335, 326],
    etcd: [492, 316],
    controller: [650, 178],
    store: [808, 192],
  },
  pods: [
    [384, 430],
    [500, 430],
    [630, 430],
  ],
  eyes: {
    'laptop-thief': [184, 80],
    'git-reader': [184, 206],
    'ci-log-reader': [196, 344],
    'ex-employee': [196, 430],
    'argocd-redis': [380, 222],
    developer: [560, 96],
    'pod-creator': [560, 150],
    'etcd-backup-thief': [600, 256],
    'cp-disk-thief': [666, 256],
    'compromised-pod': [684, 404],
  },
  num: [0, 27],
  edges: {
    commit: [
      [64, 116],
      [64, 194],
    ],
    pull: [
      [116, 214],
      [296, 132],
    ],
    ci: [
      [44, 228],
      [44, 326],
    ],
    cilog: [
      [78, 352],
      [92, 352],
    ],
    sync: [
      [370, 118],
      [444, 118],
    ],
    cache: [
      [335, 158],
      [335, 222],
    ],
    etcd: [
      [476, 164],
      [486, 234],
    ],
    kubelet: [
      [440, 140],
      [410, 160],
      [410, 384],
      [350, 400],
    ],
    ctrl: [
      [616, 118],
      [512, 118],
    ],
    storeCtrl: [
      [772, 120],
      [684, 120],
    ],
    storeArgo: [
      [776, 96],
      [700, 30],
      [360, 30],
      [342, 88],
    ],
    storeNode: [
      [790, 160],
      [760, 440],
      [652, 432],
    ],
    kms: [
      [766, 300],
      [524, 268],
    ],
    storeWrite: [
      [100, 70],
      [400, 22],
      [776, 96],
    ],
  },
}

export const NARROW: MapLayout = {
  w: 400,
  h: 1110,
  font: 16,
  hand: 22,
  pod: 52,
  zones: [
    { x: 6, y: 6, w: 388, h: 292, label: 'izvan klastera: tim', lx: 18, ly: 31, kind: 'outside' },
    { x: 6, y: 310, w: 388, h: 132, label: 'izvan klastera', lx: 250, ly: 335, kind: 'outside' },
    { x: 6, y: 454, w: 388, h: 650, label: 'klaster', lx: 18, ly: 479, kind: 'cluster' },
    { x: 18, y: 490, w: 364, h: 140, label: 'Argo CD', lx: 28, ly: 514, kind: 'ns' },
    { x: 18, y: 642, w: 364, h: 250, label: 'upravljačka ravnina', lx: 28, ly: 666, kind: 'cp' },
    { x: 30, y: 770, w: 340, h: 112, label: 'disk', lx: 40, ly: 792, kind: 'disk' },
    { x: 18, y: 904, w: 364, h: 190, label: 'čvor (kubelet)', lx: 28, ly: 928, kind: 'node' },
  ],
  at: {
    laptop: [60, 84],
    git: [250, 84],
    ci: [44, 204],
    cilog: [118, 204],
    memory: [300, 220],
    argocd: [84, 564],
    redis: [236, 564],
    api: [70, 710],
    controller: [296, 710],
    etcd: [82, 830],
    store: [110, 388],
    kms: [322, 388],
    node: [40, 946],
  },
  name: {
    laptop: [60, 126],
    git: [250, 114],
    ci: [44, 246],
    cilog: [118, 246],
    memory: [292, 262],
    argocd: [84, 618],
    redis: [236, 618],
    api: [76, 746],
    controller: [296, 746],
    store: [110, 434],
    kms: [322, 434],
  },
  tag: {
    laptop: [60, 150],
    git: [250, 138],
    cilog: [118, 270],
    memory: [234, 232],
    redis: [236, 640],
    etcd: [196, 870],
    controller: [296, 768],
    store: [206, 404],
  },
  pods: [
    [96, 986],
    [196, 986],
    [306, 986],
  ],
  eyes: {
    'laptop-thief': [150, 76],
    'git-reader': [346, 76],
    'ci-log-reader': [176, 196],
    'ex-employee': [346, 188],
    'argocd-redis': [320, 550],
    developer: [166, 694],
    'pod-creator': [222, 694],
    'etcd-backup-thief': [200, 818],
    'cp-disk-thief': [282, 818],
    'compromised-pod': [350, 938],
  },
  num: [0, 28],
  edges: {
    commit: [
      [104, 84],
      [196, 84],
    ],
    pull: [
      [290, 96],
      [390, 124],
      [390, 500],
      [130, 556],
    ],
    ci: [
      [210, 96],
      [70, 180],
    ],
    cilog: [
      [74, 204],
      [88, 204],
    ],
    sync: [
      [84, 598],
      [74, 684],
    ],
    cache: [
      [120, 564],
      [204, 564],
    ],
    etcd: [
      [70, 754],
      [78, 796],
    ],
    kubelet: [
      [30, 730],
      [30, 930],
    ],
    ctrl: [
      [262, 710],
      [108, 710],
    ],
    storeCtrl: [
      [140, 410],
      [290, 680],
    ],
    storeArgo: [
      [110, 422],
      [96, 530],
    ],
    storeNode: [
      [150, 400],
      [372, 460],
      [372, 960],
      [340, 970],
    ],
    kms: [
      [318, 414],
      [110, 806],
    ],
    storeWrite: [
      [30, 120],
      [30, 330],
      [74, 370],
    ],
  },
}

/* Medium (tablets, 495–680 px): the team in one row on top, below it the wide layout's cluster and store column (moved). */
const MDX = -244
const MDY = 220
const mv = (p: Pt): Pt => [p[0] + MDX, p[1] + MDY]
const mvAll = <K extends string>(r: Partial<Record<K, Pt>>, keys: readonly K[]): Partial<Record<K, Pt>> =>
  Object.fromEntries(keys.filter((k) => r[k]).map((k) => [k, mv(r[k] as Pt)])) as Partial<Record<K, Pt>>
const CLUSTER_PLACES = ['argocd', 'redis', 'api', 'controller', 'etcd', 'store', 'kms', 'node'] as const
const CLUSTER_EYES = ['argocd-redis', 'developer', 'pod-creator', 'etcd-backup-thief', 'cp-disk-thief', 'compromised-pod'] as const

export const MEDIUM: MapLayout = {
  w: 640,
  h: 768,
  font: 16,
  hand: 22,
  pod: 52,
  zones: [
    { x: 8, y: 8, w: 624, h: 206, label: 'izvan klastera: tim', lx: 20, ly: 33, kind: 'outside' },
    ...WIDE.zones.slice(1).map((z) => ({ ...z, x: z.x + MDX, y: z.y + MDY, lx: z.lx + MDX, ly: z.ly + MDY })),
  ],
  at: {
    laptop: [76, 96],
    git: [226, 96],
    ci: [360, 100],
    cilog: [436, 100],
    memory: [548, 100],
    ...(mvAll(WIDE.at, CLUSTER_PLACES) as Record<(typeof CLUSTER_PLACES)[number], Pt>),
  },
  name: {
    laptop: [76, 142],
    git: [226, 132],
    ci: [360, 142],
    cilog: [436, 142],
    memory: [548, 142],
    ...mvAll(WIDE.name, CLUSTER_PLACES),
  },
  tag: {
    laptop: [76, 166],
    git: [226, 156],
    cilog: [436, 166],
    memory: [548, 188],
    ...mvAll(WIDE.tag, CLUSTER_PLACES),
  },
  pods: WIDE.pods.map(mv),
  eyes: {
    'laptop-thief': [136, 64],
    'git-reader': [300, 64],
    'ci-log-reader': [490, 64],
    'ex-employee': [604, 64],
    ...Object.fromEntries(CLUSTER_EYES.map((id) => [id, mv(WIDE.eyes[id])])),
  },
  num: [0, 27],
  edges: {
    commit: [
      [116, 96],
      [176, 96],
    ],
    pull: [
      [184, 112],
      [176, 220],
      [112, 312],
    ],
    ci: [
      [274, 104],
      [328, 104],
    ],
    cilog: [
      [390, 100],
      [406, 100],
    ],
    sync: WIDE.edges.sync.map(mv),
    cache: WIDE.edges.cache.map(mv),
    etcd: WIDE.edges.etcd.map(mv),
    kubelet: WIDE.edges.kubelet.map(mv),
    ctrl: WIDE.edges.ctrl.map(mv),
    storeCtrl: WIDE.edges.storeCtrl.map(mv),
    storeArgo: WIDE.edges.storeArgo.map(mv),
    storeNode: WIDE.edges.storeNode.map(mv),
    kms: WIDE.edges.kms.map(mv),
    storeWrite: [
      [40, 112],
      [18, 130],
      [18, 221],
      [493, 221],
      [493, 334],
      [528, 338],
    ],
  },
}

/** Where a graph node of the engine sits in a layout (nodes this lecture does not draw map to their neighbour). */
export function nodePos(L: MapLayout, n: GraphNodeId | 'actor'): Pt {
  switch (n) {
    case 'laptop':
      return L.at.laptop
    case 'git':
    case 'registry':
      return L.at.git
    case 'ci':
      return L.at.ci
    case 'ci-log':
      return L.at.cilog
    case 'argocd':
      return L.at.argocd
    case 'redis':
      return L.at.redis
    case 'controller':
      return L.at.controller
    case 'store':
      return L.at.store
    case 'etcd':
      return L.at.etcd
    case 'cp-disk':
      return [L.at.etcd[0] + 40, L.at.etcd[1] + 30]
    case 'kms':
      return L.at.kms
    case 'node':
    case 'logs':
      return L.at.node
    case 'pod':
      return L.pods[1]
    case 'memory':
      return L.at.memory
    default:
      return L.at.api
  }
}
