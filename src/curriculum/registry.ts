import { createElement, lazy, useSyncExternalStore, type ReactNode } from 'react'
import { GLOSSARY, LECTURES, MODULES } from './data'
import type { CourseModule, GlossaryEntry, LectureComponent, LectureLoader, LectureMeta } from './types'

/**
 * Lecture components are discovered by folder name: src/lectures/<id>-<slug>/index.tsx.
 * Adding a lecture = adding its metadata to data.ts and creating that folder.
 */
const modules = import.meta.glob<{ default: LectureComponent }>('../lectures/*/index.tsx')

const loaders: Record<string, LectureLoader> = {}
for (const [path, loader] of Object.entries(modules)) {
  const folder = path.split('/').at(-2) ?? ''
  const slug = folder.replace(/^\d+-/, '')
  loaders[slug] = loader as LectureLoader
}

/** Lazy components, created once at module load (one per lecture folder). */
const components: Record<string, LectureComponent> = Object.fromEntries(Object.entries(loaders).map(([slug, loader]) => [slug, lazy(loader)]))

/** Renders the lecture body for `slug` (lazy-loaded), or `fallback` if the lecture has no content yet. */
export function renderLecture(slug: string, fallback: ReactNode): ReactNode {
  const C = components[slug]
  return C ? createElement(C) : fallback
}

export function hasLectureContent(slug: string): boolean {
  return slug in loaders
}

export function getLecture(slug: string): LectureMeta | undefined {
  return LECTURES.find((l) => l.slug === slug)
}

export function getLectureById(id: string): LectureMeta | undefined {
  return LECTURES.find((l) => l.id === id)
}

export function getModule(id: string): CourseModule | undefined {
  return MODULES.find((m) => m.id === id)
}

export function getNeighbours(slug: string): { prev?: LectureMeta; next?: LectureMeta } {
  const i = LECTURES.findIndex((l) => l.slug === slug)
  if (i < 0) return {}
  return { prev: LECTURES[i - 1], next: LECTURES[i + 1] }
}

export function lecturesInModule(moduleId: string): LectureMeta[] {
  return LECTURES.filter((l) => l.module === moduleId)
}

/**
 * Glossary = the course glossary (data.ts) + optional per-lecture additions in src/lectures/<folder>/glossary.ts
 * (default export: GlossaryEntry[]). Course entries win on id conflicts. Lecture files are loaded lazily and
 * independently, so a broken file in one lecture cannot take the whole site down.
 */
const glossaryById = new Map<string, GlossaryEntry>(GLOSSARY.map((g) => [g.id, g]))
let glossaryVersion = 0
const glossaryListeners = new Set<() => void>()
let glossaryLoaded = false
const lectureGlossaries = import.meta.glob<{ default: GlossaryEntry[] }>('../lectures/*/glossary.ts')
const glossaryLoads = Object.entries(lectureGlossaries).map(([path, load]) => {
  const lectureId = path.split('/').at(-2)?.slice(0, 2)
  return load().then(
    (mod) => {
      let added = false
      for (const g of mod.default ?? []) {
        if (!glossaryById.has(g.id)) {
          glossaryById.set(g.id, { lecture: lectureId, ...g })
          added = true
        }
      }
      if (added) {
        glossaryVersion++
        glossaryListeners.forEach((l) => l())
      }
    },
    (e) => console.error(`[glossary] ${path} failed to load`, e),
  )
})
Promise.allSettled(glossaryLoads).then(() => {
  glossaryLoaded = true
  glossaryVersion++
  glossaryListeners.forEach((l) => l())
})

/** True once every lecture glossary file has loaded (or failed). */
export function isGlossaryLoaded(): boolean {
  return glossaryLoaded
}

function subscribeGlossary(l: () => void) {
  glossaryListeners.add(l)
  return () => glossaryListeners.delete(l)
}

/** Re-renders when lecture glossaries finish loading. */
export function useGlossaryVersion(): number {
  return useSyncExternalStore(subscribeGlossary, () => glossaryVersion)
}

export function getGlossaryEntry(id: string): GlossaryEntry | undefined {
  return glossaryById.get(id)
}

export function getAllGlossary(): GlossaryEntry[] {
  return [...glossaryById.values()]
}

export function lecturePath(l: Pick<LectureMeta, 'slug'>): string {
  return `/predavanje/${l.slug}`
}
