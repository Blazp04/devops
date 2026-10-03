import type { ComponentType } from 'react'

export type AccentColor = 'blue' | 'violet' | 'teal' | 'amber' | 'rose' | 'green'

export interface CourseModule {
  id: string
  /** Short label like "Modul 1" */
  label: string
  title: string
  description: string
  color: AccentColor
}

export interface LectureMeta {
  /** Two-digit order, e.g. "02" */
  id: string
  /** ASCII kebab-case slug used in the URL */
  slug: string
  module: string
  title: string
  subtitle: string
  durationMin: number
  /** Lecture ids this one builds on */
  prerequisites: string[]
  /** "Nakon ovog predavanja moći ćete…" bullet points */
  objectives: string[]
}

export interface GlossaryEntry {
  /** Stable lookup id used by <Term id="…"> (kebab-case) */
  id: string
  /** Canonical (usually English) term */
  term: string
  /** Form used in Croatian text */
  hr: string
  definition: string
  /** Lecture id where the term is introduced */
  lecture?: string
  /** Optional picture from the menza story, shown in red handwriting in the glossary ("= redar na ulazu") */
  menza?: string
}

export type LectureComponent = ComponentType
export type LectureLoader = () => Promise<{ default: LectureComponent }>
