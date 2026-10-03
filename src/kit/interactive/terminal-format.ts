/* Terminal output helpers: column tables (kubectl, docker) and status words. */

export interface ParsedTable {
  header: string[]
  rows: string[][]
}

/**
 * Detects column-aligned table output (an UPPERCASE header with ≥ 3 columns separated by 2+ spaces, rows aligned
 * under it, as kubectl and docker print them). On a phone such a table is re-flowed into one block per row
 * (name, then "READY 1/1 · STATUS Running …"), so the point of the output is never cut off.
 */
export function parseTable(text: string): ParsedTable | null {
  const lines = text.split('\n').filter((l) => l.trim().length > 0)
  if (lines.length < 2) return null
  const head = lines[0]
  if (!/^[A-Z][A-Z0-9 ()/_.%-]*$/.test(head.trim())) return null
  const starts: number[] = []
  const names: string[] = []
  const re = /\S+(?: \S+)*/g
  let m: RegExpExecArray | null
  while ((m = re.exec(head))) {
    starts.push(m.index)
    names.push(m[0])
  }
  if (names.length < 3) return null
  const rows: string[][] = []
  for (const line of lines.slice(1)) {
    // slice at the header's column starts when the row is aligned to them, otherwise split on 2+ spaces
    const aligned = starts.every((s, j) => j === 0 || s >= line.length || line[s - 1] === ' ')
    let cells = aligned ? starts.map((s, j) => line.slice(s, j + 1 < starts.length ? starts[j + 1] : undefined).trim()) : line.trim().split(/\s{2,}/)
    if (cells.length < 2) return null
    if (cells.length > names.length) cells = [...cells.slice(0, names.length - 1), cells.slice(names.length - 1).join('  ')]
    rows.push(cells)
  }
  return { header: names, rows }
}

export type StatusTone = 'ok' | 'warn' | 'bad'

const OK = ['Running', 'Completed', 'Succeeded', 'Healthy', 'Synced', 'Bound', 'Active', 'Ready', 'Up']
const WARN = ['Pending', 'ContainerCreating', 'PodInitializing', 'Terminating', 'Progressing', 'OutOfSync', 'Suspended', 'Missing']
const BAD = ['CrashLoopBackOff', 'Error', 'OOMKilled', 'ImagePullBackOff', 'ErrImagePull', 'Failed', 'Evicted', 'Degraded', 'NotReady', 'CreateContainerConfigError', 'InvalidImageName', 'Exited']

const TONE_OF = new Map<string, StatusTone>([...OK.map((w) => [w, 'ok'] as const), ...WARN.map((w) => [w, 'warn'] as const), ...BAD.map((w) => [w, 'bad'] as const)])
const STATUS_RE = new RegExp(`\\b(${[...BAD, ...WARN, ...OK].join('|')})\\b`, 'g')

/** Splits text into plain parts and status words (Running, CrashLoopBackOff, OutOfSync…) with their tone. */
export function statusParts(text: string): { text: string; tone?: StatusTone }[] {
  const out: { text: string; tone?: StatusTone }[] = []
  let last = 0
  for (const m of text.matchAll(STATUS_RE)) {
    const i = m.index ?? 0
    if (i > last) out.push({ text: text.slice(last, i) })
    out.push({ text: m[0], tone: TONE_OF.get(m[0]) })
    last = i + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}
