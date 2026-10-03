import type { PodTone } from '../diagram/k8s-helpers'

/* =====================================================================
   Klopa karta: the running example's architecture, lecture by lecture
   (docs/curriculum.json → runningExample). Every thing on the map is a
   doodle from the illustration grammar; what a lecture adds is marked
   with a highlighter and a NOVO stamp.

   Three eras share the page: A (01–06) servers in the menza, B (07–09)
   containers on the same machines, C (10–24) the Kubernetes cluster.
   Each item has a box per layout: `wide` (viewBox 1000 wide, used when
   the container is ≥ 860 px) and `narrow` (viewBox 380 wide, ≤ 460 px,
   for phones). A box can change by lecture: [[from, box], …].
   Lettering (mapFont): handwriting ≥ 17 px and print ≥ 12 px on screen at
   every width — the sizes grow when the drawing is shown smaller than its
   viewBox (e.g. the wide map in an 872 px column).
   ===================================================================== */

/** [x, y, w, h] in the layout's viewBox units. */
export type Box = [number, number, number, number]
/** A box, or boxes that change by lecture: [[from lecture, box], …] (the last one whose `from` ≤ at wins). */
export type Place = Box | [string, Box][]
/** Same for any value that changes by lecture. */
export type ByLecture<T> = T | [string, T][]

export type MapKind =
  | 'crowd'
  | 'dns'
  | 'laptop'
  | 'lb'
  | 'hc'
  | 'server'
  | 'worker'
  | 'brace'
  | 'db'
  | 'queue'
  | 'sms'
  | 'host'
  | 'container'
  | 'dockerfile'
  | 'image'
  | 'compose'
  | 'cluster'
  | 'loop'
  | 'desired'
  | 'cp'
  | 'node'
  | 'pod'
  | 'bars'
  | 'svc'
  | 'gateway'
  | 'deploy'
  | 'hpa'
  | 'ca'
  | 'keda'
  | 'cm'
  | 'secret'
  | 'eso'
  | 'argo'
  | 'pvc'
  | 'ns'
  | 'note'
  | 'git'
  | 'ci'
  | 'registry'
  | 'vault'
  | 'obs'

export type LabelPos = 'below' | 'above' | 'right' | 'left' | 'inside' | 'top' | 'bottom-right' | 'none'

export interface StoryItem {
  id: string
  kind: MapKind
  /** first lecture it is on the map */
  from: string
  /** last lecture it is on the map (inclusive) */
  until?: string
  /** its name (handwritten under it, or printed inside for cards) */
  label?: ByLecture<string>
  /** a second line, e.g. the server spec */
  sub?: ByLecture<string>
  /** text lines (clipboard, sticky note) */
  lines?: ByLecture<string[]>
  wide: Place
  narrow: Place
  /** where the label goes (default per kind) */
  labelAt?: LabelPos | { wide: LabelPos; narrow: LabelPos }
  /** Pod version tint */
  tone?: ByLecture<PodTone>
  /** Pod version tape (v1 / v2) */
  tape?: ByLecture<string>
  /** highlight it again at these lectures with this stamp (e.g. { '02': 'JAČI' }; '' = marker only, no stamp) */
  marks?: Record<string, string>
  /** highlighted with the marker, but without its own NOVO stamp (a group shares one stamp) */
  noStamp?: boolean
  /** continues from the previous era: never marked new */
  quiet?: boolean
  /** the lecture that introduced this thing, for continuations of an earlier era (default: `from`); shown by `tags` */
  intro?: string
}

export interface StoryLink {
  from: string
  to: string
  since: string
  until?: string
  dashed?: boolean
  label?: string
  /** continues from the previous era: never marked new */
  quiet?: boolean
  /** drawn in one layout only (long links that would cross the narrow drawing) */
  only?: 'wide' | 'narrow'
  /** explicit route per layout (otherwise border to border) */
  pts?: { wide?: [number, number][]; narrow?: [number, number][] }
}

export interface StoryLecture {
  id: string
  /** short title for the map header */
  title: string
  /** one sentence: what changed on the map */
  caption: string
}

export const STORY_LECTURES: StoryLecture[] = [
  { id: '01', title: 'Put jednog zahtjeva', caption: 'Studenti upisuju klopa.example, DNS vraća adresu, a Klopa s Lanina laptopa seli na iznajmljeni poslužitelj (2 vCPU, 2 GB).' },
  { id: '02', title: 'Jedan poslužitelj u 12:00', caption: 'Poslužitelj je ojačan na 4 vCPU i 8 GB RAM-a, a narudžbe sada čuva baza Postgres.' },
  { id: '03', title: 'Zašto raspodijeljeni sustavi', caption: 'Drugi poslužitelj (Srednji): DNS vraća dvije adrese, a oba poslužitelja koriste istu bazu.' },
  { id: '04', title: 'Load balancer', caption: 'Redar na ulazu (load balancer) dijeli promet na tri poslužitelja: Mali, Srednji i Veliki.' },
  { id: '05', title: 'Kad poslužitelj padne', caption: 'Redar provjerava ispravnost poslužitelja, a sesije žive u Redisu, a ne u memoriji poslužitelja.' },
  { id: '06', title: 'Redovi poruka', caption: 'Narudžbe idu u red poruka (RabbitMQ), a potrošač klopa-worker šalje SMS „narudžba je spremna”.' },
  { id: '07', title: 'Virtualni stroj i kontejner', caption: 'Dijelovi Klope pakiraju se u kontejnere: isto okruženje na svakom poslužitelju.' },
  { id: '08', title: 'Docker', caption: 'Dockerfile opisuje sliku kontejnera, a iz jedne slike pokrećemo isti kontejner bilo gdje.' },
  { id: '09', title: 'Docker Compose', caption: 'Cijela Klopa (web, API, worker, Postgres, Redis, RabbitMQ) opisana je jednom datotekom.' },
  { id: '10', title: 'Zašto Kubernetes', caption: 'Klaster: zapišemo željeno stanje, a petlja usklađivanja pazi da stvarno stanje bude jednako.' },
  { id: '11', title: 'Klaster iznutra', caption: 'Upravljačka ravnina (API server, etcd, scheduler) i tri radna čvora.' },
  { id: '12', title: 'Pod', caption: 'Prvi Podovi: klopa-api i klopa-worker, svaki u svojoj kutiji za ručak na čvoru.' },
  { id: '13', title: 'Deployment', caption: 'Deployment i ReplicaSet drže četiri replike API-ja; verzija 1.4.0 (v2, zelena traka) zamijenila je 1.3.2.' },
  { id: '14', title: 'Service', caption: 'Service je stalna adresa: promet ide samo spremnim Podovima API-ja.' },
  { id: '15', title: 'Gateway API', caption: 'Gateway je ulaz u klaster: klopa.example vodi studente do pravog Servicea.' },
  { id: '16', title: 'ConfigMap i Secret', caption: 'ConfigMap (recept) i Secret (zapečaćena omotnica) daju Podovima konfiguraciju i tajne.' },
  { id: '17', title: 'Resursi i raspoređivanje', caption: 'Čvorovi imaju različit kapacitet (2 vCPU · 4 GiB, 4 vCPU · 16 GiB, 2 vCPU · 8 GiB): requests rezerviraju CPU i RAM, a scheduler traži mjesto.' },
  { id: '18', title: 'Automatsko skaliranje', caption: 'HPA dodaje replike, Cluster Autoscaler dodaje čvorove (2 vCPU · 8 GiB), a KEDA skalira workera prema redu poruka.' },
  { id: '19', title: 'Volumeni i StatefulSet', caption: 'Postgres kao StatefulSet (Pod db-0) s trajnim volumenom (PVC).' },
  { id: '20', title: 'Što je deploy', caption: 'Dva okruženja u dva namespacea: klopa-staging za probu i klopa za produkciju.' },
  { id: '21', title: 'CI/CD', caption: 'CI provjerava svaki commit, gradi sliku i sprema je u registry.' },
  { id: '22', title: 'GitOps i Argo CD', caption: 'Git s konfiguracijom je izvor istine, a Argo CD usklađuje klaster s njim.' },
  { id: '23', title: 'Tajne u GitOpsu', caption: 'Tajne žive u trezoru, a External Secrets Operator iz njih stvara Secret u klasteru.' },
  { id: '24', title: 'Dan izdanja', caption: 'Cijela Klopa, a uz nju observability: metrike, logovi i tragovi pokazuju što se događa.' },
]

/* ---------- era A: servers in the menza (01–06) ---------- */

/** the DNS phone book is lettered inside: „DNS”, the name and its address (RFC 5737 documentation range) */
const DNS_LABEL = 'inside' as const
/** what the course's DNS answers for klopa.example (the address L01 uses) */
export const DNS_ANSWER = '203.0.113.10'
const DNS_W: Box = [10, 6, 140, 78]
const DNS_N: Box = [244, 4, 128, 88]
const LB_LABEL = { wide: 'below', narrow: 'left' } as const

const ERA_A: StoryItem[] = [
  { id: 'dns-a', kind: 'dns', from: '01', until: '06', label: 'DNS', labelAt: DNS_LABEL, wide: DNS_W, narrow: DNS_N },
  { id: 'crowd-a', kind: 'crowd', from: '01', until: '06', label: 'studenti', wide: [12, 150, 120, 132], narrow: [12, 4, 88, 96] },
  { id: 'laptop-a', kind: 'laptop', from: '01', until: '06', label: 'Lanin laptop', wide: [20, 476, 110, 80], narrow: [252, 488, 116, 78] },
  { id: 'lb', kind: 'lb', from: '04', until: '06', label: 'load balancer', labelAt: LB_LABEL, wide: [206, 150, 116, 176], narrow: [136, 124, 108, 160] },
  { id: 'hc', kind: 'hc', from: '05', until: '06', label: 'provjere', labelAt: 'right', wide: [304, 118, 52, 40], narrow: [250, 142, 48, 36] },
  { id: 'srednji', kind: 'server', from: '03', until: '06', label: 'Srednji', sub: '2 vCPU · 4 GB', wide: [430, 92, 176, 80], narrow: [8, 328, 116, 100] },
  {
    id: 'vps',
    kind: 'server',
    from: '01',
    until: '06',
    label: [
      ['01', 'VPS'],
      ['03', 'Veliki'],
    ],
    sub: [
      ['01', '2 vCPU · 2 GB'],
      ['02', '4 vCPU · 8 GB'],
    ],
    marks: { '02': 'JAČI' },
    wide: [430, 222, 176, 80],
    narrow: [132, 328, 116, 100],
  },
  { id: 'mali', kind: 'server', from: '04', until: '06', label: 'Mali', sub: '1 vCPU · 2 GB', wide: [430, 352, 176, 80], narrow: [256, 328, 116, 100] },
  { id: 'brace-a', kind: 'brace', from: '03', until: '06', quiet: true, wide: [618, 92, 16, 340], narrow: [20, 438, 340, 16] },
  { id: 'pg-a', kind: 'db', from: '02', until: '06', label: 'Postgres', wide: [700, 112, 96, 100], narrow: [22, 480, 96, 96] },
  { id: 'redis-a', kind: 'db', from: '05', until: '06', label: 'Redis', wide: [704, 258, 88, 88], narrow: [140, 486, 90, 88] },
  { id: 'mq-a', kind: 'queue', from: '06', until: '06', label: 'RabbitMQ', wide: [676, 418, 136, 52], narrow: [8, 650, 112, 48] },
  { id: 'worker-a', kind: 'worker', from: '06', until: '06', label: 'klopa-worker', wide: [854, 396, 96, 78], narrow: [150, 630, 92, 76] },
  { id: 'sms-a', kind: 'sms', from: '06', until: '06', label: 'SMS gateway', noStamp: true, wide: [866, 512, 104, 72], narrow: [272, 632, 96, 70] },
]

const LINKS_A: StoryLink[] = [
  { from: 'crowd-a', to: 'dns-a', since: '01', until: '06', dashed: true, label: 'klopa.example?' },
  { from: 'laptop-a', to: 'vps', since: '01', until: '01', dashed: true, label: 'na poslužitelj' },
  { from: 'crowd-a', to: 'vps', since: '01', until: '03' },
  { from: 'crowd-a', to: 'srednji', since: '03', until: '03', label: 'DNS: dvije adrese' },
  { from: 'vps', to: 'pg-a', since: '02', until: '02' },
  { from: 'brace-a', to: 'pg-a', since: '03', until: '06' },
  { from: 'crowd-a', to: 'lb', since: '04', until: '06' },
  { from: 'lb', to: 'srednji', since: '04', until: '06' },
  { from: 'lb', to: 'vps', since: '04', until: '06' },
  { from: 'lb', to: 'mali', since: '04', until: '06' },
  { from: 'brace-a', to: 'redis-a', since: '05', until: '06' },
  { from: 'brace-a', to: 'mq-a', since: '06', until: '06', pts: { narrow: [[190, 456], [129, 472], [129, 628], [96, 646]] } },
  { from: 'mq-a', to: 'worker-a', since: '06', until: '06' },
  { from: 'worker-a', to: 'sms-a', since: '06', until: '06' },
]

/* ---------- era B: containers on the same three machines (07–09) ---------- */

const hostW = (y: number): Box => [410, y, 272, 112]
const hostN = (y: number): Box => [6, y, 368, 100]

const ERA_B: StoryItem[] = [
  { id: 'dns-b', kind: 'dns', from: '07', until: '09', quiet: true, intro: '01', label: 'DNS', labelAt: DNS_LABEL, wide: DNS_W, narrow: DNS_N },
  { id: 'crowd-b', kind: 'crowd', from: '07', until: '09', quiet: true, intro: '01', label: 'studenti', wide: [12, 150, 120, 132], narrow: [12, 4, 88, 96] },
  { id: 'laptop-b', kind: 'laptop', from: '07', until: '09', quiet: true, intro: '01', label: 'Lanin laptop', wide: [20, 476, 110, 80], narrow: [8, 816, 100, 64] },
  { id: 'lb-b', kind: 'lb', from: '07', until: '09', quiet: true, intro: '04', label: 'load balancer', labelAt: LB_LABEL, wide: [206, 150, 116, 176], narrow: [136, 124, 108, 160] },
  { id: 'hc-b', kind: 'hc', from: '07', until: '09', quiet: true, intro: '05', label: 'provjere', labelAt: 'right', wide: [304, 118, 52, 40], narrow: [250, 142, 48, 36] },
  { id: 'host-s', kind: 'host', from: '07', until: '09', quiet: true, intro: '03', label: 'Srednji', wide: hostW(70), narrow: hostN(318) },
  { id: 'host-v', kind: 'host', from: '07', until: '09', quiet: true, intro: '01', label: 'Veliki', wide: hostW(196), narrow: hostN(428) },
  { id: 'host-m', kind: 'host', from: '07', until: '09', quiet: true, intro: '04', label: 'Mali', wide: hostW(322), narrow: hostN(538) },
  { id: 'c-api-1', kind: 'container', from: '07', until: '09', label: 'api', wide: [422, 118, 78, 52], narrow: [16, 360, 84, 48] },
  { id: 'c-web', kind: 'container', from: '07', until: '09', label: 'web', noStamp: true, wide: [506, 118, 78, 52], narrow: [106, 360, 84, 48] },
  { id: 'c-api-2', kind: 'container', from: '07', until: '09', label: 'api', noStamp: true, wide: [422, 244, 78, 52], narrow: [16, 470, 84, 48] },
  { id: 'c-worker', kind: 'container', from: '07', until: '09', label: 'worker', noStamp: true, wide: [506, 244, 78, 52], narrow: [106, 470, 84, 48] },
  { id: 'c-api-3', kind: 'container', from: '07', until: '09', label: 'api', noStamp: true, wide: [422, 370, 78, 52], narrow: [16, 580, 84, 48] },
  { id: 'c-mq', kind: 'container', from: '09', until: '09', label: 'rabbitmq', noStamp: true, wide: [590, 118, 78, 52], narrow: [196, 360, 84, 48] },
  { id: 'c-pg', kind: 'container', from: '09', until: '09', label: 'postgres', wide: [506, 370, 78, 52], narrow: [106, 580, 84, 48] },
  { id: 'c-redis', kind: 'container', from: '09', until: '09', label: 'redis', noStamp: true, wide: [590, 370, 78, 52], narrow: [196, 580, 84, 48] },
  { id: 'brace-b', kind: 'brace', from: '07', until: '08', quiet: true, wide: [694, 70, 16, 364], narrow: [20, 648, 340, 16] },
  { id: 'pg-b', kind: 'db', from: '07', until: '08', quiet: true, intro: '02', label: 'Postgres', wide: [744, 100, 96, 100], narrow: [16, 684, 88, 92] },
  { id: 'redis-b', kind: 'db', from: '07', until: '08', quiet: true, intro: '05', label: 'Redis', wide: [748, 240, 88, 88], narrow: [116, 690, 84, 86] },
  { id: 'mq-b', kind: 'queue', from: '07', until: '08', quiet: true, intro: '06', label: 'RabbitMQ', wide: [726, 384, 130, 52], narrow: [212, 706, 76, 46] },
  { id: 'sms-b', kind: 'sms', from: '07', until: '09', quiet: true, intro: '06', label: 'SMS gateway', wide: [876, 512, 100, 72], narrow: [296, 690, 80, 64] },
  { id: 'compose', kind: 'compose', from: '09', until: '09', label: 'compose.yaml', sub: 'ista datoteka na sva tri', wide: [740, 112, 136, 104], narrow: [20, 684, 150, 96] },
  { id: 'dockerfile', kind: 'dockerfile', from: '08', until: '09', label: 'Dockerfile', wide: [146, 470, 108, 90], narrow: [118, 806, 106, 86] },
  { id: 'image', kind: 'image', from: '08', until: '09', label: 'slika klopa-api', wide: [282, 470, 128, 92], narrow: [232, 806, 138, 88] },
]

const LINKS_B: StoryLink[] = [
  { from: 'crowd-b', to: 'dns-b', since: '07', until: '09', dashed: true, label: 'klopa.example?', quiet: true },
  { from: 'crowd-b', to: 'lb-b', since: '07', until: '09', quiet: true },
  { from: 'lb-b', to: 'host-s', since: '07', until: '09', quiet: true, only: 'wide' },
  { from: 'lb-b', to: 'host-v', since: '07', until: '09', quiet: true, only: 'wide' },
  { from: 'lb-b', to: 'host-m', since: '07', until: '09', quiet: true, only: 'wide' },
  // phones: the machines are stacked, so one arrow "to all three"
  { from: 'lb-b', to: 'host-s', since: '07', until: '09', quiet: true, only: 'narrow', label: 'na sva tri' },
  { from: 'brace-b', to: 'pg-b', since: '07', until: '08', quiet: true },
  { from: 'brace-b', to: 'redis-b', since: '07', until: '08', quiet: true },
  { from: 'brace-b', to: 'mq-b', since: '07', until: '08', quiet: true },
  { from: 'laptop-b', to: 'dockerfile', since: '08', until: '09' },
  { from: 'dockerfile', to: 'image', since: '08', until: '09' },
  { from: 'image', to: 'host-m', since: '08', until: '09', dashed: true, label: 'docker run', only: 'wide' },
  { from: 'compose', to: 'host-v', since: '09', until: '09', dashed: true, only: 'wide' },
]

/* ---------- era C: the Kubernetes cluster (10–24) ---------- */

/** a pod's box from its centre (wide pods are size 52 → box 70 × 64) */
const pod = (cx: number, cy: number): Box => [cx - 35, cy - 32, 70, 64]
// wide: three nodes side by side, pods at y 232
const W1 = [226, 310, 394]
const W2 = [500, 584, 668]
const W3 = [772, 856, 940]
const WY = 240
// narrow: three nodes stacked, three slots each
const NX = [76, 190, 304]
const NY = [394, 562, 730]
/**
 * A node's spec line by lecture: the course's nodes are 4 vCPU · 8 GB; lecture 17's simulation has three different
 * nodes (`l17`), lecture 18's autoscaled node group is 2 vCPU · 8 GiB (as its simulations show).
 */
const nodeSpec = (l17: string): [string, string][] => [
  ['11', '4 vCPU · 8 GB'],
  ['17', l17],
  ['18', '2 vCPU · 8 GiB'],
  ['19', '4 vCPU · 8 GB'],
]

const ERA_C: StoryItem[] = [
  { id: 'dns-c', kind: 'dns', from: '10', quiet: true, intro: '01', label: 'DNS', labelAt: DNS_LABEL, wide: DNS_W, narrow: DNS_N },
  { id: 'crowd-c', kind: 'crowd', from: '10', quiet: true, intro: '01', label: 'studenti', wide: [12, 150, 120, 132], narrow: [12, 4, 88, 96] },
  {
    id: 'cluster',
    kind: 'cluster',
    from: '10',
    label: 'klaster',
    labelAt: { wide: 'top', narrow: 'bottom-right' },
    wide: [160, 14, 830, 432],
    narrow: [
      ['10', [6, 176, 368, 356]],
      ['11', [6, 176, 368, 622]],
      ['13', [6, 176, 368, 764]],
      ['16', [6, 176, 368, 862]],
    ],
  },
  { id: 'loop', kind: 'loop', from: '10', until: '10', label: 'petlja usklađivanja', wide: [430, 120, 170, 150], narrow: [110, 196, 160, 130] },
  { id: 'desired', kind: 'desired', from: '10', until: '10', label: 'željeno stanje', lines: ['željeno:', '9× klopa-api'], noStamp: true, wide: [660, 150, 160, 96], narrow: [96, 372, 188, 90] },
  { id: 'cp', kind: 'cp', from: '11', label: 'upravljačka ravnina', wide: [180, 36, 336, 88], narrow: [96, 196, 270, 88] },
  { id: 'n1', kind: 'node', from: '11', label: 'čvor 1', sub: nodeSpec('2 vCPU · 4 GiB'), wide: [176, 138, 264, 192], narrow: [16, 294, 348, 158] },
  { id: 'n2', kind: 'node', from: '11', label: 'čvor 2', sub: nodeSpec('4 vCPU · 16 GiB'), noStamp: true, wide: [450, 138, 264, 192], narrow: [16, 462, 348, 158] },
  { id: 'n3', kind: 'node', from: '11', label: 'čvor 3', sub: nodeSpec('2 vCPU · 8 GiB'), noStamp: true, wide: [724, 138, 256, 192], narrow: [16, 630, 348, 158] },
  {
    id: 'api-1',
    kind: 'pod',
    from: '12',
    label: 'api',
    tone: [
      ['12', 'blue'],
      ['13', 'green'],
    ],
    tape: [
      ['12', 'v1'],
      ['13', 'v2'],
    ],
    // 13: the new version replaced v1, so the box is marked again (no stamp of its own; the Deployment has it)
    marks: { '13': '' },
    wide: pod(W1[0], WY),
    narrow: pod(NX[0], NY[0]),
  },
  { id: 'worker-1', kind: 'pod', from: '12', label: 'worker', tone: 'amber', wide: pod(W2[1], WY), narrow: pod(NX[1], NY[1]) },
  { id: 'api-2', kind: 'pod', from: '13', label: 'api', tone: 'green', tape: 'v2', noStamp: true, wide: pod(W2[0], WY), narrow: pod(NX[0], NY[1]) },
  { id: 'api-3', kind: 'pod', from: '13', label: 'api', tone: 'green', tape: 'v2', noStamp: true, wide: pod(W3[2], WY), narrow: pod(NX[0], NY[2]) },
  { id: 'web', kind: 'pod', from: '13', label: 'web', tone: 'violet', noStamp: true, wide: pod(W1[1], WY), narrow: pod(NX[1], NY[0]) },
  { id: 'mq-c', kind: 'pod', from: '13', label: 'rabbitmq', tone: 'rose', noStamp: true, wide: pod(W2[2], WY), narrow: pod(NX[2], NY[1]) },
  { id: 'pg-c', kind: 'pod', from: '13', until: '18', label: 'postgres', tone: 'teal', noStamp: true, wide: pod(W3[1], WY), narrow: pod(NX[1], NY[2]) },
  { id: 'pg-0', kind: 'pod', from: '19', label: 'db-0', tone: 'teal', wide: pod(W3[1], WY), narrow: pod(NX[1], NY[2]) },
  { id: 'api-4', kind: 'pod', from: '13', label: 'api', tone: 'green', tape: 'v2', noStamp: true, wide: pod(W1[2], WY), narrow: pod(NX[2], NY[0]) },
  { id: 'worker-2', kind: 'pod', from: '18', label: 'worker', tone: 'amber', noStamp: true, wide: pod(W3[0], WY), narrow: pod(NX[2], NY[2]) },
  { id: 'keda', kind: 'keda', from: '18', label: 'KEDA', noStamp: true, wide: [741, 276, 62, 22], narrow: [271, 762, 66, 22] },
  { id: 'bars-1', kind: 'bars', from: '17', label: 'requests', wide: [190, 168, 236, 14], narrow: [28, 324, 324, 14] },
  { id: 'bars-2', kind: 'bars', from: '17', noStamp: true, wide: [464, 168, 236, 14], narrow: [28, 492, 324, 14] },
  { id: 'bars-3', kind: 'bars', from: '17', noStamp: true, wide: [738, 168, 228, 14], narrow: [28, 660, 324, 14] },
  { id: 'ca', kind: 'ca', from: '18', label: '+ čvor', sub: 'Cluster Autoscaler', wide: [858, 36, 118, 88], narrow: [16, 798, 348, 40] },
  { id: 'svc', kind: 'svc', from: '14', label: 'Service', sub: 'klopa-api', wide: [206, 356, 160, 56], narrow: [16, 850, 150, 54] },
  { id: 'gateway', kind: 'gateway', from: '15', label: 'Gateway', wide: [124, 330, 70, 88], narrow: [22, 138, 64, 78] },
  {
    id: 'deploy',
    kind: 'deploy',
    from: '13',
    lines: ['Deployment', 'ReplicaSet', 'replicas: 4'],
    wide: [376, 354, 108, 84],
    narrow: [178, 842, 108, 84],
  },
  { id: 'hpa', kind: 'hpa', from: '18', label: 'HPA', wide: [494, 360, 64, 56], narrow: [298, 848, 70, 56] },
  { id: 'cm', kind: 'cm', from: '16', label: 'ConfigMap', wide: [570, 360, 60, 58], narrow: [20, 944, 56, 56] },
  { id: 'secret', kind: 'secret', from: '16', label: 'Secret', noStamp: true, wide: [644, 368, 64, 44], narrow: [92, 950, 60, 44] },
  { id: 'eso', kind: 'eso', from: '23', label: 'ESO', wide: [722, 362, 56, 54], narrow: [166, 944, 52, 54] },
  { id: 'argo', kind: 'argo', from: '22', label: 'Argo CD', wide: [792, 356, 64, 64], narrow: [234, 940, 60, 60] },
  { id: 'pvc', kind: 'pvc', from: '19', label: 'PVC', wide: [886, 350, 58, 82], narrow: [308, 936, 54, 72] },
  {
    id: 'ns-prod',
    kind: 'ns',
    from: '20',
    label: 'klopa',
    wide: [536, 50, 140, 46],
    narrow: [98, 136, 118, 52],
  },
  { id: 'ns-stg', kind: 'ns', from: '20', label: 'klopa-staging', noStamp: true, wide: [690, 50, 158, 46], narrow: [224, 136, 150, 52] },
  {
    id: 'note-sts',
    kind: 'note',
    from: '19',
    quiet: true,
    // paragraphs: wrapped to the note's width at the lettering size in use (the note grows downwards)
    lines: ['u tečaju StatefulSet;', 'u produkciji: upravljana baza ili operator'],
    wide: [826, 446, 166, 62],
    narrow: [12, 1046, 356, 70],
  },
  { id: 'laptop-c', kind: 'laptop', from: '21', label: 'Lanin laptop', noStamp: true, wide: [20, 476, 96, 60], narrow: [8, 1126, 100, 64] },
  { id: 'git', kind: 'git', from: '21', label: 'Git · kod', noStamp: true, wide: [140, 490, 110, 32], narrow: [126, 1148, 112, 32] },
  { id: 'ci', kind: 'ci', from: '21', label: 'CI', wide: [278, 470, 84, 62], narrow: [264, 1122, 92, 70] },
  { id: 'registry', kind: 'registry', from: '21', label: 'registry', noStamp: true, wide: [408, 470, 96, 64], narrow: [262, 1238, 100, 72] },
  { id: 'configrepo', kind: 'git', from: '22', label: 'Git · konfiguracija', noStamp: true, wide: [396, 584, 124, 32], narrow: [126, 1258, 112, 32] },
  { id: 'vault', kind: 'vault', from: '23', label: 'trezor tajni', noStamp: true, wide: [716, 492, 70, 72], narrow: [12, 1234, 64, 72] },
  { id: 'obs', kind: 'obs', from: '24', label: 'Prometheus · Grafana', wide: [850, 582, 100, 72], narrow: [134, 1346, 112, 82] },
]

/** the Service's wires in the narrow layout run up a bus on the left edge of the nodes */
const bus = (y: number): [number, number][] => [
  [24, 850],
  [22, y],
  [41, y],
]
/** …and in the wide layout along a bus just under the nodes, then up into each Pod */
const busW = (x: number): [number, number][] => [
  [286, 356],
  [286, 343],
  [x, 343],
  [x, WY + 34],
]

const LINKS_C: StoryLink[] = [
  { from: 'crowd-c', to: 'dns-c', since: '10', dashed: true, label: 'klopa.example?', quiet: true },
  { from: 'crowd-c', to: 'cluster', since: '10', until: '14', dashed: true },
  { from: 'crowd-c', to: 'gateway', since: '15' },
  { from: 'gateway', to: 'svc', since: '15', pts: { narrow: [[30, 212], [10, 236], [10, 872], [16, 877]] } },
  { from: 'svc', to: 'api-1', since: '14', pts: { wide: busW(W1[0]), narrow: bus(NY[0]) } },
  { from: 'svc', to: 'api-2', since: '14', pts: { wide: busW(W2[0]), narrow: bus(NY[1]) } },
  { from: 'svc', to: 'api-3', since: '14', pts: { wide: busW(W3[2]), narrow: bus(NY[2]) } },
  { from: 'svc', to: 'api-4', since: '14', only: 'wide', pts: { wide: busW(W1[2]) } },
  { from: 'hpa', to: 'deploy', since: '18', dashed: true },
  { from: 'mq-c', to: 'worker-2', since: '18', dashed: true, only: 'wide' },
  { from: 'pg-0', to: 'pvc', since: '19', dashed: true, only: 'wide' },
  { from: 'laptop-c', to: 'git', since: '21' },
  { from: 'git', to: 'ci', since: '21' },
  { from: 'ci', to: 'registry', since: '21' },
  { from: 'registry', to: 'cluster', since: '21', dashed: true, only: 'wide' },
  { from: 'ci', to: 'configrepo', since: '22' },
  { from: 'configrepo', to: 'argo', since: '22', only: 'wide' },
  { from: 'vault', to: 'eso', since: '23', dashed: true, only: 'wide' },
  { from: 'eso', to: 'secret', since: '23' },
]

export const STORY_ITEMS: StoryItem[] = [...ERA_A, ...ERA_B, ...ERA_C]
export const STORY_LINKS: StoryLink[] = [...LINKS_A, ...LINKS_B, ...LINKS_C]

/* ---------- resolving a stage ---------- */

export type Layout = 'wide' | 'narrow'

export const LAYOUT_WIDTH: Record<Layout, number> = { wide: 1000, narrow: 380 }

function isSeq<T>(v: ByLecture<T>): v is [string, T][] {
  return Array.isArray(v) && v.length > 0 && Array.isArray(v[0]) && typeof (v[0] as unknown[])[0] === 'string'
}

/** The value of a by-lecture setting at lecture `at`. */
export function valueAt<T>(v: ByLecture<T>, at: string): T {
  if (!isSeq(v)) return v as T
  let out = v[0][1]
  for (const [from, val] of v) if (from <= at) out = val
  return out
}

const inRange = (at: string, from: string, until?: string) => at >= from && (!until || at <= until)

/** Lettering sizes in viewBox units: names, handwriting, the smaller handwriting (bar labels, notes), print, edge labels, stamps. */
export interface MapFont {
  /** handwritten names (Caveat) */
  hand: number
  /** secondary handwriting: CPU / RAM, sticky-note lines, the Cluster Autoscaler note */
  small: number
  /** Plex Mono: specs, Pod names, labels on doodles */
  mono: number
  /** printed names (Bricolage) on server cards and frames */
  name: number
  /** handwritten link labels („klopa.example?”) */
  edge: number
  /** the NOVO stamp */
  stamp: number
}

/** Lettering sizes per layout at 1:1 (viewBox units). */
export const MAP_FONT: Record<Layout, MapFont> = {
  wide: { hand: 18, small: 16, mono: 14, name: 16, edge: 17.4, stamp: 14 },
  narrow: { hand: 19, small: 17, mono: 14, name: 15, edge: 19.5, stamp: 14 },
}

/**
 * Lettering for a layout shown at `scale` px per unit: never under the notebook's minimums on screen (handwriting
 * 17 px, print 12 px). The wide map is 1000 units, so in an 872 px column every handwritten word grows to ≈ 20 units.
 */
export function mapFont(layout: Layout, scale?: number | null): MapFont {
  const b = MAP_FONT[layout]
  if (!scale || !(scale > 0)) return b
  const hand = 17.4 / scale
  const print = 12.3 / scale
  const r = (v: number) => Math.round(v * 10) / 10
  return {
    hand: r(Math.max(b.hand, hand)),
    small: r(Math.max(b.small, hand)),
    mono: r(Math.max(b.mono, print)),
    name: r(Math.max(b.name, print)),
    edge: r(Math.max(b.edge, hand)),
    stamp: r(Math.max(b.stamp, print)),
  }
}

/** The NOVO stamp: SvgStamp size 14 (grows with the lettering, `MapFont.stamp`), rotated −8° (its centre is `stampAt`). */
export const STAMP_SIZE = 14
export const STAMP_ROTATE = -8

export interface StageItem {
  item: StoryItem
  box: Box
  label?: string
  sub?: string
  lines?: string[]
  tone?: PodTone
  tape?: string
  /** marked with the highlighter at this lecture */
  isNew: boolean
  /** stamp text (null = no stamp) */
  stamp: string | null
  /** centre of the stamp: placed where it covers no other drawing and no lettering (null = no stamp) */
  stampAt: [number, number] | null
  /** the stamp is a lecture tag (the number of the lecture that introduced the thing), not NOVO */
  tag: boolean
  labelAt: LabelPos
}

export interface StageLink {
  link: StoryLink
  key: string
  isNew: boolean
}

export interface StoryStage {
  at: string
  lecture?: StoryLecture
  layout: Layout
  items: StageItem[]
  links: StageLink[]
  /** viewBox [w, h] for this stage and layout */
  size: [number, number]
  /** the lettering the stage was laid out for */
  font: MapFont
}

const DEFAULT_LABEL: Partial<Record<MapKind, LabelPos>> = {
  server: 'inside',
  host: 'inside',
  container: 'inside',
  db: 'inside',
  queue: 'below',
  dockerfile: 'inside',
  compose: 'inside',
  cluster: 'top',
  cp: 'inside',
  node: 'inside',
  pod: 'above',
  bars: 'none',
  svc: 'inside',
  deploy: 'none',
  ca: 'inside',
  keda: 'inside',
  pvc: 'inside',
  ns: 'inside',
  note: 'none',
  brace: 'none',
  desired: 'below',
}

/* ---------- where the lettering and the stamps go ---------- */

/** Rough width of handwriting (Caveat) and of Plex Mono in viewBox units. */
const handWidth = (s: string, fs: number) => s.length * fs * 0.46
const monoWidth = (s: string, fs: number) => s.length * fs * 0.6

/** The box of the cluster's name tag (helm + handwriting on a paper patch on the frame). */
export function clusterTag(si: Pick<StageItem, 'box' | 'label' | 'labelAt'>, L: Layout, f: MapFont = MAP_FONT[L]): { x: number; y: number; w: number } {
  const [x, y, w, h] = si.box
  const tw = handWidth(si.label ?? '', f.hand + 4) + 34
  const top = si.labelAt === 'top'
  return { x: top ? x + 22 : x + w - tw - 16, y: top ? y : y + h, w: tw }
}

/** Where an item's written name sits (an estimate, for keeping stamps off it). */
function labelBox(si: StageItem, L: Layout, f: MapFont): Box | null {
  const [x, y, w, h] = si.box
  const out: Box[] = []
  if (si.label) {
    const hw = handWidth(si.label, f.hand)
    switch (si.labelAt) {
      case 'below':
        out.push([x + w / 2 - hw / 2, y + h + 4, hw, f.hand])
        break
      case 'above': {
        const pod = si.item.kind === 'pod'
        const fs = pod ? f.mono : f.hand
        const tw = pod ? monoWidth(si.label, fs) : hw
        out.push([x + w / 2 - tw / 2, y - 6 - fs * 0.8, tw, fs * 0.8 + 2])
        break
      }
      case 'right':
        out.push([x + w + 6, y + h / 2 + 6 - f.hand * 0.75, hw, f.hand])
        break
      case 'left':
        out.push([x - 4 - hw, y + h / 2 + 6 - f.hand * 0.75, hw, f.hand])
        break
      case 'top':
      case 'bottom-right': {
        const t = clusterTag(si, L, f)
        out.push([t.x - 6, t.y - 13, t.w + 12, 26])
        break
      }
    }
  }
  // a node's header: its printed name and the handwritten spec after it
  if (si.item.kind === 'node') out.push([x + 8, y + 6, Math.min(w - 16, (si.label ?? '').length * f.name * 0.55 + 12 + handWidth(`(${si.sub ?? ''})`, Math.max(17, f.small))), 24])
  // the second line written under a recipe card (compose: "ista datoteka na sva tri")
  if (si.sub && (si.item.kind === 'compose' || si.item.kind === 'dockerfile')) {
    const sw = handWidth(si.sub, f.hand)
    out.push([x + w / 2 - sw / 2, y + h + 6, sw, f.hand])
  }
  if (!out.length) return null
  const x0 = Math.min(...out.map((b) => b[0]))
  const y0 = Math.min(...out.map((b) => b[1]))
  const x1 = Math.max(...out.map((b) => b[0] + b[2]))
  const y1 = Math.max(...out.map((b) => b[1] + b[3]))
  return [x0, y0, x1 - x0, y1 - y0]
}

/** Point on the border of box a (padded), on the line towards point p: where a link leaves or enters a thing. */
export function borderPoint(a: Box, p: [number, number], pad = 5): [number, number] {
  const [x, y, w, h] = a
  const cx = x + w / 2
  const cy = y + h / 2
  const dx = p[0] - cx
  const dy = p[1] - cy
  if (dx === 0 && dy === 0) return [cx, cy]
  const sx = dx !== 0 ? (w / 2 + pad) / Math.abs(dx) : Infinity
  const sy = dy !== 0 ? (h / 2 + pad) / Math.abs(dy) : Infinity
  const s = Math.min(sx, sy, 1)
  return [cx + dx * s, cy + dy * s]
}

/** Where a straight link's handwritten label sits (Edge writes it 10 units above the line's midpoint, `f.edge` tall). */
function linkLabelBox(sl: StageLink, boxes: Map<string, Box>, L: Layout, f: MapFont): Box | null {
  const label = sl.link.label
  const a = boxes.get(sl.link.from)
  const b = boxes.get(sl.link.to)
  if (!label || !a || !b || sl.link.pts?.[L]) return null
  const p = borderPoint(a, [b[0] + b[2] / 2, b[1] + b[3] / 2])
  const q = borderPoint(b, [a[0] + a[2] / 2, a[1] + a[3] / 2])
  const mx = (p[0] + q[0]) / 2
  const my = (p[1] + q[1]) / 2 - 10
  const tw = handWidth(label, f.edge)
  return [mx - tw / 2, my - f.edge * 0.8, tw, f.edge + 1]
}

/** What a stamp must not cover: drawings (frames only by their written header) and lettering. */
function solidBox(si: StageItem): Box | null {
  const [x, y, w] = si.box
  switch (si.item.kind) {
    case 'cluster':
      return null // its name tag is in labelBox
    case 'node':
      return null // its header (name + spec) is in labelBox
    case 'host':
      return [x + 8, y + 6, Math.min(w - 16, 200), 24]
    default:
      return si.box
  }
}

function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0])
  const h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1])
  return w > 0 && h > 0 ? w * h : 0
}

/** Candidate centres for an item's stamp, best first (sw × sh = the stamp's footprint). */
function stampCandidates(si: StageItem, L: Layout, f: MapFont, sw: number, sh: number): [number, number][] {
  const [x, y, w, h] = si.box
  const above = si.labelAt === 'above' ? (si.item.kind === 'pod' ? f.mono : f.hand) + 4 : 0
  const below = si.labelAt === 'below' ? f.hand + 6 : 0
  const corner: [number, number] = [x + w - 8, y - sh / 2 + 1 - above]
  const others: [number, number][] = [
    [x + 8, y - sh / 2 + 1 - above],
    [x + w + sw / 2 - 4, y + h / 2],
    [x + w + sw / 2 - 4, y + sh / 2],
    [x - sw / 2 + 4, y + sh / 2],
    [x + w - 8, y + h + sh / 2 - 4 + below],
    [x + w / 2, y + h + sh / 2 - 2 + below],
    [x - sw / 2 + 4, y + h / 2],
    [x + w / 2, y - sh / 2 - above],
  ]
  switch (si.item.kind) {
    case 'pod':
      // under the lunchbox: above it are its name and the node's fuel bars
      return [[x + w / 2, y + h + sh / 2 - 3], corner, ...others]
    case 'node':
    case 'host':
      return [
        [x + w - sw / 2 - 10, y + sh / 2 + 3],
        [x + w - 40, y],
      ]
    case 'cluster': {
      const t = clusterTag(si, L, f)
      const ty = t.y
      return [
        [t.x + t.w + 12 + sw / 2, ty],
        [t.x - 14 - sw / 2, ty],
      ]
    }
    default:
      return [corner, ...others]
  }
}

/**
 * Stamps go where they cover the least: every candidate position of an item's stamp is scored by how much of other
 * drawings, all lettering, earlier stamps and the page edge it would cover; the first best one wins.
 */
function placeStamps(items: StageItem[], links: StageLink[], L: Layout, f: MapFont, size: [number, number]): void {
  const sh = f.stamp * 1.6 + 6
  const obstacles: { id: string; b: Box }[] = []
  const boxes = new Map(items.map((i) => [i.item.id, i.box] as const))
  for (const sl of links) {
    const lb = linkLabelBox(sl, boxes, L, f)
    if (lb) obstacles.push({ id: `${sl.key}#label`, b: lb })
  }
  for (const si of items) {
    const sb = solidBox(si)
    if (sb) obstacles.push({ id: si.item.id, b: sb })
    const lb = labelBox(si, L, f)
    if (lb) obstacles.push({ id: `${si.item.id}#label`, b: lb })
  }
  for (const si of items) {
    if (!si.stamp) continue
    const sw = si.stamp.length * f.stamp * 0.78 + f.stamp * 1.2 + 2
    let best: [number, number] | null = null
    let bestScore = Infinity
    for (const [cx, cy] of stampCandidates(si, L, f, sw, sh)) {
      const r: Box = [cx - sw / 2, cy - sh / 2, sw, sh]
      let score = 0
      for (const o of obstacles) if (o.id !== si.item.id) score += overlapArea(r, o.b)
      // the page edge: a stamp must stay on the page (the drawing may overflow its top a little, into the header's air)
      const inside = overlapArea(r, [2, -8, size[0] - 4, size[1] + 4])
      score += (sw * sh - inside) * 6
      if (score < bestScore - 0.5) {
        best = [cx, cy]
        bestScore = score
      }
    }
    si.stampAt = best
    if (best) obstacles.push({ id: `${si.item.id}#stamp`, b: [best[0] - sw / 2, best[1] - sh / 2, sw, sh] })
  }
}

/** Paragraphs wrapped into lines of at most `width` units of handwriting at size `fs`. */
function wrapHand(paragraphs: string[], width: number, fs: number): string[] {
  const out: string[] = []
  for (const para of paragraphs) {
    let cur = ''
    for (const word of para.split(/\s+/)) {
      const next = cur ? `${cur} ${word}` : word
      if (cur && handWidth(next, fs) > width) {
        out.push(cur)
        cur = word
      } else cur = next
    }
    if (cur) out.push(cur)
  }
  return out
}

/** A sticky note's lines at the lettering in use and the note's box, grown to hold them. */
export function noteLayout(box: Box, paragraphs: string[], f: MapFont): { box: Box; lines: string[]; step: number } {
  const [x, y, w, h] = box
  const step = f.small * 1.06
  const lines = wrapHand(paragraphs, w - 18, f.small)
  return { box: [x, y, w, Math.max(h, Math.ceil(f.small + 2 + (lines.length - 1) * step + 12))], lines, step }
}

/** Things that get a lecture tag (one per group, like the NOVO stamp): not braces or notes, not continuations without `intro`. */
function taggable(it: StoryItem): boolean {
  return it.kind !== 'brace' && it.kind !== 'note' && !it.noStamp && (!it.quiet || it.intro !== undefined)
}

export interface StageOptions {
  /** NOVO stamps on what this lecture added (default true) */
  novo?: boolean
  /** every thing gets a small tag with the number of the lecture that introduced it */
  tags?: boolean
}

/**
 * What the map looks like at the end of lecture `at` ("01"…"24"), in the given layout. `font` is the lettering the
 * drawing will use (default: the layout's 1:1 sizes; StoryMap passes `mapFont(layout, scale)`), so stamps and the
 * sticky note make room for it.
 */
export function storyStage(at: string, layout: Layout = 'wide', font?: MapFont, opts: StageOptions = {}): StoryStage {
  const f = font ?? MAP_FONT[layout]
  const { novo = true, tags = false } = opts
  const items: StageItem[] = STORY_ITEMS.filter((it) => inRange(at, it.from, it.until)).map((it) => {
    const markText = it.marks?.[at]
    const isNew = !it.quiet && (it.from === at || markText !== undefined)
    const lp = it.labelAt ?? DEFAULT_LABEL[it.kind] ?? 'below'
    const novoStamp = !novo || !isNew ? null : markText !== undefined ? markText || null : it.noStamp ? null : 'NOVO'
    const tag = !novoStamp && tags && taggable(it)
    const stamp = tag ? (it.intro ?? it.from) : novoStamp
    let box = valueAt(it[layout], at)
    let lines = it.lines === undefined ? undefined : valueAt(it.lines, at)
    if (it.kind === 'note' && lines) {
      const n = noteLayout(box, lines, f)
      box = n.box
      lines = n.lines
    }
    return {
      item: it,
      box,
      label: it.label === undefined ? undefined : valueAt(it.label, at),
      sub: it.sub === undefined ? undefined : valueAt(it.sub, at),
      lines,
      tone: it.tone === undefined ? undefined : valueAt(it.tone, at),
      tape: it.tape === undefined ? undefined : valueAt(it.tape, at),
      isNew,
      stamp,
      stampAt: null,
      tag,
      labelAt: typeof lp === 'string' ? lp : lp[layout],
    }
  })
  const ids = new Set(items.map((i) => i.item.id))
  const links: StageLink[] = STORY_LINKS.filter((l) => inRange(at, l.since, l.until) && ids.has(l.from) && ids.has(l.to) && (!l.only || l.only === layout)).map((l) => ({
    link: l,
    key: `${l.from}>${l.to}`,
    isNew: !l.quiet && l.since === at,
  }))
  // the drawing is as tall as what is on it (+ room for the handwritten labels under the lowest things)
  let bottom = 0
  for (const i of items) {
    const [, y, , h] = i.box
    const extra = i.labelAt === 'below' ? f.hand + 12 : i.labelAt === 'bottom-right' ? 14 : 6
    bottom = Math.max(bottom, y + h + extra)
  }
  const size: [number, number] = [LAYOUT_WIDTH[layout], Math.ceil(bottom + 8)]
  placeStamps(items, links, layout, f, size)
  return {
    at,
    lecture: STORY_LECTURES.find((l) => l.id === at),
    layout,
    items,
    links,
    size,
    font: f,
  }
}
