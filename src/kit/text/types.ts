/** A story character drawn next to a text block (analogy note, quiz feedback). */
export type CastName = 'mira' | 'lana' | 'davor' | 'petra' | 'iva'

/** Which glyph a callout gets (drawn with the notebook's pen). */
export type CalloutGlyphKind = 'info' | 'tip' | 'warn' | 'danger' | 'fact'

/** Pencil colour of a margin note. */
export type MarginTone = 'pen' | 'red' | 'green' | 'ink'

/** The cast's display names (Croatian), used in "Teta Mira: …" lines and aria labels. */
export const CAST_NAME: Record<CastName, string> = {
  mira: 'Teta Mira',
  lana: 'Lana',
  davor: 'Davor',
  petra: 'Petra',
  iva: 'Iva',
}
