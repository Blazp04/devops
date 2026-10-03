/**
 * Text & structure: sections (heading system „N · oznaka” + drawn prop), callouts as notebook paper (sticky notes,
 * taped cards, red-pencil boxes), glossary terms, layout pieces, checks (exam-sheet quiz, predict, myth-or-fact),
 * simulation tasks and the margin-note event log, and the course's two story devices (IncidentCard opens a lecture,
 * CostNote closes it). Styles: ./text.css (imported once from src/main.tsx).
 */
export { Section } from './Section'
export { Callout, Analogy, Myth, DeepDive, KeyIdea, type CalloutKind } from './Callout'
export { Term } from './Term'
export { Figure, Compare, Tabs, Recap, Badge, Legend, Kbd, ScrollX, MarginNote } from './Layout'
export { Quiz, type QuizQuestion } from './Quiz'
export { Predict, MythOrFact } from './Predict'
export { Goals, EventLog, type Goal, type SimEvent } from './Goals'
export { IncidentCard, CostNote, type IncidentMetric } from './Incident'
export { propForKicker } from './kicker'
export { useLineBoxes, type LineBox } from './lines'
export { CAST_NAME, type CastName, type CalloutGlyphKind, type MarginTone } from './types'
export { CalloutGlyph, Paperclip, CastDoodle, TickBox, PenCircle } from '../doodles/text-doodles'
