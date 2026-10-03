/**
 * „Put tajne” (flagship, engine E5): the starting state of the incident and the two drawing layouts (wide / narrow).
 * The model lives in src/engines/access – this file only places things on the page.
 */
import { createAccessPreset, DB_SECRET, L16_ACTORS } from '../../../engines/access/index.ts'
import type { AccessState, ActorId, AssetForm, GraphNodeId } from '../../../engines/access/index.ts'

/** Incident 16: preset `l16` with the password as an env literal in deployment.yaml (seed 42) → 7 of 9 eyes red. */
export const INCIDENT_PRESET = 'l16 · env u deployment.yaml'
export const INCIDENT_SEED = 42

export function createIncidentState(): AccessState {
  return createAccessPreset('l16', { seed: INCIDENT_SEED, secrets: [{ ...DB_SECRET, approach: 'manifest-env' }] })
}

export const EYES: readonly ActorId[] = L16_ACTORS

export type Pt = readonly [number, number]

export interface Zone {
  x: number
  y: number
  w: number
  h: number
  label: string
  /** label position (top-left of the text baseline) */
  lx: number
  ly: number
  kind: 'outside' | 'cluster' | 'disk' | 'node'
}

export type Anchor = 'start' | 'middle' | 'end'

export interface MapLayout {
  w: number
  h: number
  /** smallest font (viewBox units) – the layout is used only where it stays ≥ 12 px */
  font: number
  hand: number
  /** Pod size (the version tape must stay ≥ 12 px) */
  pod: number
  zones: Zone[]
  laptop: Pt
  git: Pt
  registry: Pt
  api: Pt
  etcd: Pt
  key: Pt
  kms: Pt
  logs: Pt
  /** where the „lozinka u logu” tag goes */
  logTag: Pt
  pods: readonly Pt[]
  /** where the kubelet arrow ends (node entry) */
  node: Pt
  eyes: Record<string, Pt>
  /** where each eye's „number + word” caption sits, relative to the eye centre (default: centred below) */
  eyeText: Record<string, { dx: number; dy: number; anchor: Anchor }>
  /** where a finished attempt stops next to its target (a free spot, so the result never covers the node's label) */
  slots: Partial<Record<GraphNodeId, { at: Pt; anchor: Anchor }>>
  /** routes: commit (laptop → Git), CI (Git → registry), kubectl apply (laptop → API), API → etcd, API → node, KMS → API */
  edges: { commit: Pt[]; ci: Pt[]; apply: Pt[]; applyLabel: Pt; etcd: Pt[]; kubelet: Pt[]; kms: Pt[] }
}

/** Short caption next to each eye on the map (the full name is on its card). */
export const EYE_WORD: Record<string, string> = {
  'git-reader': 'Git',
  'image-puller': 'slika',
  'etcd-backup-thief': 'kopija etcd',
  'cp-disk-thief': 'disk',
  'view-user': 'view',
  developer: 'programer',
  'pod-creator': 'CI bot',
  'compromised-pod': 'u Podu',
  'log-reader': 'log',
}

const below = (dy: number) => ({ dx: 0, dy, anchor: 'middle' as const })
const right = (dx: number) => ({ dx, dy: 6, anchor: 'start' as const })

/**
 * Wide map (≥ 669 px of stage at font 15): the three kubectl users stand above the control plane (they talk to the
 * API server, they do not live in it); the two thieves wait below the disk; the KMS talks only to the API server.
 */
export const WIDE: MapLayout = {
  w: 780,
  h: 456,
  font: 15,
  hand: 20,
  pod: 48,
  zones: [
    { x: 8, y: 8, w: 236, h: 440, label: 'izvan klastera', lx: 22, ly: 32, kind: 'outside' },
    { x: 262, y: 96, w: 262, h: 290, label: 'upravljačka ravnina', lx: 276, ly: 120, kind: 'cluster' },
    { x: 274, y: 200, w: 238, h: 174, label: 'disk', lx: 284, ly: 222, kind: 'disk' },
    { x: 546, y: 96, w: 226, h: 236, label: 'čvor (kubelet)', lx: 560, ly: 120, kind: 'node' },
  ],
  laptop: [82, 96],
  git: [82, 226],
  registry: [82, 356],
  api: [340, 152],
  etcd: [356, 282],
  key: [462, 282],
  kms: [584, 410],
  logs: [680, 410],
  logTag: [700, 352],
  pods: [
    [604, 196],
    [710, 196],
  ],
  node: [600, 150],
  eyes: {
    'git-reader': [196, 222],
    'image-puller': [196, 352],
    'view-user': [300, 44],
    developer: [400, 44],
    'pod-creator': [500, 44],
    'etcd-backup-thief': [292, 420],
    'cp-disk-thief': [452, 420],
    'compromised-pod': [600, 296],
    'log-reader': [748, 404],
  },
  eyeText: {
    'git-reader': below(28),
    'image-puller': below(28),
    'view-user': below(28),
    developer: below(28),
    'pod-creator': below(28),
    'etcd-backup-thief': right(22),
    'cp-disk-thief': right(22),
    'compromised-pod': right(22),
    'log-reader': { dx: 26, dy: 30, anchor: 'end' },
  },
  slots: {
    git: { at: [40, 196], anchor: 'start' },
    registry: { at: [140, 316], anchor: 'start' },
    etcd: { at: [396, 236], anchor: 'end' },
    'cp-disk': { at: [440, 236], anchor: 'start' },
    pod: { at: [657, 158], anchor: 'start' },
    logs: { at: [690, 380], anchor: 'start' },
  },
  edges: {
    commit: [
      [116, 110],
      [150, 140],
      [150, 204],
      [132, 220],
    ],
    ci: [
      [24, 236],
      [24, 340],
    ],
    apply: [
      [122, 92],
      [306, 140],
    ],
    applyLabel: [184, 78],
    etcd: [
      [340, 192],
      [352, 246],
    ],
    kubelet: [
      [370, 146],
      [552, 146],
    ],
    kms: [
      [572, 386],
      [534, 352],
      [534, 172],
      [372, 160],
    ],
  },
}

export const NARROW: MapLayout = {
  w: 400,
  h: 910,
  font: 16,
  hand: 22,
  pod: 52,
  zones: [
    { x: 6, y: 6, w: 388, h: 300, label: 'izvan klastera', lx: 18, ly: 30, kind: 'outside' },
    { x: 6, y: 322, w: 388, h: 300, label: 'upravljačka ravnina', lx: 18, ly: 346, kind: 'cluster' },
    { x: 20, y: 440, w: 330, h: 168, label: 'disk', lx: 30, ly: 462, kind: 'disk' },
    { x: 6, y: 694, w: 252, h: 210, label: 'čvor (kubelet)', lx: 18, ly: 718, kind: 'node' },
  ],
  laptop: [70, 82],
  git: [200, 82],
  registry: [328, 82],
  api: [92, 390],
  etcd: [126, 512],
  key: [276, 512],
  kms: [330, 732],
  logs: [306, 852],
  logTag: [306, 796],
  pods: [
    [76, 770],
    [184, 770],
  ],
  node: [130, 704],
  eyes: {
    'git-reader': [200, 196],
    'image-puller': [328, 196],
    'view-user': [130, 262],
    developer: [230, 262],
    'pod-creator': [334, 262],
    'etcd-backup-thief': [130, 656],
    'cp-disk-thief': [290, 656],
    'compromised-pod': [130, 872],
    'log-reader': [368, 846],
  },
  eyeText: {
    'git-reader': below(30),
    'image-puller': below(30),
    'view-user': below(30),
    developer: below(30),
    'pod-creator': below(30),
    'etcd-backup-thief': right(22),
    'cp-disk-thief': right(22),
    'compromised-pod': right(22),
    'log-reader': { dx: 26, dy: 30, anchor: 'end' },
  },
  slots: {
    git: { at: [262, 40], anchor: 'start' },
    registry: { at: [372, 40], anchor: 'end' },
    etcd: { at: [178, 486], anchor: 'start' },
    'cp-disk': { at: [226, 522], anchor: 'end' },
    pod: { at: [226, 734], anchor: 'end' },
    logs: { at: [306, 826], anchor: 'start' },
  },
  edges: {
    commit: [
      [108, 72],
      [150, 74],
    ],
    ci: [
      [250, 74],
      [284, 74],
    ],
    apply: [
      [34, 100],
      [20, 150],
      [20, 330],
      [62, 362],
    ],
    applyLabel: [92, 206],
    etcd: [
      [96, 428],
      [118, 476],
    ],
    kubelet: [
      [60, 614],
      [60, 690],
    ],
    kms: [
      [330, 704],
      [370, 660],
      [370, 420],
      [124, 396],
    ],
  },
}

/** Where a graph node sits in a layout (nodes this lecture does not draw fall back to the API server). */
export function nodePos(L: MapLayout, n: GraphNodeId | 'actor'): Pt {
  switch (n) {
    case 'laptop':
      return L.laptop
    case 'git':
      return L.git
    case 'registry':
      return L.registry
    case 'etcd':
      return L.etcd
    case 'cp-disk':
      return [(L.etcd[0] + L.key[0]) / 2, L.etcd[1] + 40]
    case 'kms':
      return L.kms
    case 'node':
      return L.node
    case 'pod':
      return [(L.pods[0][0] + L.pods[1][0]) / 2, L.pods[0][1]]
    case 'logs':
      return L.logs
    default:
      return L.api
  }
}

export const FORM_WORD: Record<AssetForm, string> = {
  plain: 'čitljivo',
  base64: 'base64',
  encrypted: 'šifrat',
  reference: 'referenca',
}
