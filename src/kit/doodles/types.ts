import type { Pt } from '../sketch/roughGen'

/* ---------- characters ---------- */

export type Hair = 'short' | 'bun' | 'pony' | 'curly' | 'beanie' | 'chef' | 'cap' | 'messy' | 'bob' | 'buns'
export type Mood = 'smile' | 'worry' | 'open' | 'flat' | 'grin'
export type Holding = 'phone' | 'laptop' | 'mug' | 'ladle' | 'tray' | 'pager' | 'clipboard' | 'note' | 'none'
/**
 * Silhouette. The story characters must read apart even as tiny doodles:
 * std (Lana, students) · hoodie (Davor) · wide + apron (teta Mira) · blazer (Petra) · tee + backpack (Iva).
 */
export type Build = 'std' | 'wide' | 'hoodie' | 'blazer' | 'tee'

/** Props shared by the named characters (Lana, Davor, Mira, Petra, Iva). Local box ≈ 80 × 120, head centre (40, 28). */
export interface CharacterProps {
  x?: number
  y?: number
  scale?: number
  mood?: Mood
  /** mirror horizontally (faces left) */
  flip?: boolean
  holding?: Holding
  /** override the default seed (a different "take" of the same person) */
  seed?: number
}

export interface BuildGeo {
  body: string
  leftShoulder: Pt
  rightShoulder: Pt
  leftHand: Pt
  rightHand: Pt
}

export const BUILDS: Record<Build, BuildGeo> = {
  std: { body: 'M24 55 Q40 46 56 55 L64 116 L16 116 Z', leftShoulder: [26, 60], rightShoulder: [54, 60], leftHand: [19, 86], rightHand: [62, 82] },
  wide: { body: 'M17 58 Q40 44 63 58 L75 116 L5 116 Z', leftShoulder: [21, 63], rightShoulder: [59, 63], leftHand: [12, 88], rightHand: [64, 84] },
  hoodie: { body: 'M19 60 Q40 46 61 60 L64 116 L16 116 Z', leftShoulder: [22, 63], rightShoulder: [58, 63], leftHand: [17, 88], rightHand: [62, 82] },
  // Petra: square shoulders, a long straight jacket that flares a little at the hem
  blazer: { body: 'M18 57 L40 50 L62 57 L68 116 L12 116 Z', leftShoulder: [20, 60], rightShoulder: [60, 60], leftHand: [16, 90], rightHand: [62, 80] },
  // Iva: narrow t-shirt, the backpack shows behind her left shoulder
  tee: { body: 'M26 56 Q40 49 54 56 L60 116 L20 116 Z', leftShoulder: [27, 60], rightShoulder: [53, 60], leftHand: [20, 88], rightHand: [62, 80] },
}

export interface StudentLook {
  hair: Hair
  shirt: string
  glasses?: boolean
}

/** Anonymous students alternate hair and shirt colour (never the named characters' silhouettes). */
export const STUDENTS: StudentLook[] = [
  { hair: 'bun', shirt: 'var(--hl-pink-ink)' },
  { hair: 'curly', shirt: 'var(--hl-green-ink)' },
  { hair: 'short', shirt: 'var(--hl-blue-ink)' },
  { hair: 'pony', shirt: 'var(--hl-orange-ink)', glasses: true },
  { hair: 'short', shirt: 'var(--hl-yellow-ink)', glasses: true },
  { hair: 'curly', shirt: 'var(--hl-pink-ink)' },
  { hair: 'bun', shirt: 'var(--hl-blue-ink)' },
  { hair: 'beanie', shirt: 'var(--hl-green-ink)' },
]

/** Redar's sweat drops (x, y, scale), local to the redar's origin. */
export const SWEAT_DROPS: [number, number, number][] = [
  [-30, -68, 1],
  [36, -80, 0.85],
  [-37, -48, 0.8],
]

export function dropPath(x: number, y: number, k: number): string {
  return `M${x} ${y} Q${x - 5 * k} ${y + 8 * k} ${x} ${y + 10 * k} Q${x + 5 * k} ${y + 8 * k} ${x} ${y} Z`
}

/* ---------- things ---------- */

/** Face of a server in its porthole: calm → busy → panic → dead (X eyes). */
export type ServerMood = 'calm' | 'busy' | 'panic' | 'dead'

/** Lunchbox (= Pod) states as they are drawn. */
export type LunchboxState = 'running' | 'pending' | 'crash'

/** App version shown by a strip of tape: v1 = blue tape, hatch −41°; v2 = green tape, hatch +41°. */
export type AppVersion = 'v1' | 'v2'

export type BubbleTone = 'ink' | 'red' | 'pen' | 'green'

/* ---------- paper ---------- */

/** Highlighter colours (same pen in prose and code). */
export type MarkColor = 'yellow' | 'pink' | 'green' | 'blue' | 'orange'
/** Sticky-note colours (orange and lilac are the module 5 / 6 index-tab colours). */
export type NoteColor = 'yellow' | 'pink' | 'green' | 'blue' | 'orange' | 'lilac'
/** Washi tape colours on paper (on the chalkboard every tape becomes a magnet). */
export type TapeColor = 'red' | 'blue' | 'green'
export type StampTone = 'green' | 'red' | 'pen' | 'ink'

/* ---------- section-head props (96 × 72, same pen) ---------- */

/**
 * Which doodle sits next to a section heading:
 * clock = story · bolt = try / break it · helm = Kubernetes · flip = step by step · boxes = code (replicas: 3) ·
 * question = check · index = glossary · queue = message queue · box = container · git = Git / CI ·
 * lock = secrets / access · loop = Argo CD / GitOps reconciliation.
 */
export type PropKind = 'clock' | 'bolt' | 'helm' | 'flip' | 'boxes' | 'question' | 'index' | 'queue' | 'box' | 'git' | 'lock' | 'loop'

export const PROP_KINDS: PropKind[] = ['clock', 'bolt', 'helm', 'flip', 'boxes', 'question', 'index', 'queue', 'box', 'git', 'lock', 'loop']

/* ---------- small doodles (64 × 48): glossary doodles, map stations, legends ---------- */

export type DoodleKind =
  | 'lb'
  | 'hc'
  | 'p95'
  | 'err'
  | 'pod'
  | 'svc'
  | 'node'
  | 'crash'
  | 'sched'
  | 'server'
  | 'clock'
  | 'scale'
  | 'spof'
  | 'queue'
  | 'box'
  | 'layers'
  | 'registry'
  | 'loop'
  | 'helm'
  | 'secret'
  | 'config'
  | 'git'
  | 'pipeline'
  | 'db'
  | 'dns'
  | 'eye'
  | 'tag'
  | 'flag'
  | 'gauge'

export const DOODLE_KINDS: DoodleKind[] = [
  'lb',
  'hc',
  'p95',
  'err',
  'pod',
  'svc',
  'node',
  'crash',
  'sched',
  'server',
  'clock',
  'scale',
  'spof',
  'queue',
  'box',
  'layers',
  'registry',
  'loop',
  'helm',
  'secret',
  'config',
  'git',
  'pipeline',
  'db',
  'dns',
  'eye',
  'tag',
  'flag',
  'gauge',
]
