/**
 * Icons a DNode can carry. Each one is a small doodle from the illustration grammar:
 * server = server card with a face · user / users = students · lb = the redar (load balancer) ·
 * database = cylinder · queue = dashed slots with trays · secret / lock = envelope with a wax seal ·
 * git = commits on a string · registry = shelf of boxes · image = stacked trays (layers) ·
 * container / box = food box · pod = lunchbox · cloud · globe · cpu = brain · disk · network ·
 * laptop · vm = a computer in a box.
 */
export const GLYPH_KINDS = [
  'server',
  'pod',
  'container',
  'box',
  'user',
  'users',
  'laptop',
  'database',
  'queue',
  'lb',
  'cloud',
  'git',
  'registry',
  'image',
  'lock',
  'secret',
  'vm',
  'cpu',
  'disk',
  'network',
  'globe',
] as const

export type GlyphKind = (typeof GLYPH_KINDS)[number]

export function isGlyphKind(v: unknown): v is GlyphKind {
  return typeof v === 'string' && (GLYPH_KINDS as readonly string[]).includes(v)
}

/** Width : height of the slot a glyph is drawn into (4 : 3.4, a little wider than tall). */
export const GLYPH_ASPECT = 1.18
