/** Data for the „Baza ne ide unatrag" drawings (stepper frames and the live lab share one drawing). */
import { podShapeView, type ClusterState } from '../../../engines/cluster'
import type { PodStatus } from '../../../kit'

/** height of the schema drawing (both layouts) */
export const SCHEMA_H = 250

export type ColState = 'ok' | 'new' | 'renamed' | 'dropped'

export interface SchemaCol {
  name: string
  state: ColState
}

export interface SchemaPod {
  id: string
  version: '1.4.1' | '2.0.0'
  status: PodStatus
  /** the column this version reads */
  reads: string
}

export const READS: Record<SchemaPod['version'], string> = { '1.4.1': 'cijena', '2.0.0': 'cijena_s_pdv' }

export interface SchemaFrame {
  pods: SchemaPod[]
  cols: SchemaCol[]
}

const p = (id: string, version: SchemaPod['version'], status: PodStatus = 'running'): SchemaPod => ({ id, version, status, reads: READS[version] })

/** Stepper frames: 0 = Friday's one-step rename, 1–3 = expand → migrate readers → contract. */
export const SCHEMA_FRAMES: SchemaFrame[] = [
  {
    pods: [p('a', '1.4.1'), p('b', '1.4.1'), p('c', '2.0.0'), p('d', '2.0.0', 'creating')],
    cols: [
      { name: 'id', state: 'ok' },
      { name: 'jelo', state: 'ok' },
      { name: 'cijena_s_pdv', state: 'renamed' },
    ],
  },
  {
    pods: [p('a', '1.4.1'), p('b', '1.4.1'), p('c', '1.4.1'), p('d', '1.4.1')],
    cols: [
      { name: 'id', state: 'ok' },
      { name: 'jelo', state: 'ok' },
      { name: 'cijena', state: 'ok' },
      { name: 'cijena_s_pdv', state: 'new' },
    ],
  },
  {
    pods: [p('a', '1.4.1'), p('b', '1.4.1', 'terminating'), p('c', '2.0.0'), p('d', '2.0.0')],
    cols: [
      { name: 'id', state: 'ok' },
      { name: 'jelo', state: 'ok' },
      { name: 'cijena', state: 'ok' },
      { name: 'cijena_s_pdv', state: 'ok' },
    ],
  },
  {
    pods: [p('a', '2.0.0'), p('b', '2.0.0'), p('c', '2.0.0'), p('d', '2.0.0')],
    cols: [
      { name: 'id', state: 'ok' },
      { name: 'jelo', state: 'ok' },
      { name: 'cijena', state: 'dropped' },
      { name: 'cijena_s_pdv', state: 'ok' },
    ],
  },
]

/** Live frame from the engine (lab): Pods of klopa-api by age, the table's columns now. */
export function liveFrame(s: ClusterState, everDropped: boolean): SchemaFrame {
  const pods = s.pods
    .filter((x) => x.labels.app === 'klopa-api')
    .sort((a, b) => a.createdAt - b.createdAt || (a.name < b.name ? -1 : 1))
    .slice(0, 6)
    .map((x) => {
      const version = x.spec.app.version === '2.0.0' ? '2.0.0' : '1.4.1'
      return { id: x.id, version, status: podShapeView(x).status, reads: READS[version] } as SchemaPod
    })
  const cols: SchemaCol[] = [
    { name: 'id', state: 'ok' },
    { name: 'jelo', state: 'ok' },
  ]
  const have = s.db.columns
  if (have.includes('cijena')) cols.push({ name: 'cijena', state: 'ok' })
  else if (everDropped) cols.push({ name: 'cijena', state: 'dropped' })
  if (have.includes('cijena_s_pdv')) cols.push({ name: 'cijena_s_pdv', state: have.includes('cijena') || everDropped ? 'ok' : 'renamed' })
  return { pods, cols }
}

/** Can a Pod of this version read its column right now? */
export function readsOk(f: SchemaFrame, pod: SchemaPod): boolean {
  return f.cols.some((c) => c.name === pod.reads && c.state !== 'dropped')
}
