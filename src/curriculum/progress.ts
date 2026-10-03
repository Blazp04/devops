import { useSyncExternalStore } from 'react'

/** Per-viewer study progress, kept in localStorage (best effort; works without it). */
export interface LectureProgress {
  completed?: boolean
  quiz?: Record<string, { correct: number; total: number }>
}

type ProgressState = Record<string, LectureProgress>

const KEY = 'k8s-lekcije:progress'
const listeners = new Set<() => void>()
let state: ProgressState = load()

function load(): ProgressState {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as ProgressState) : {}
  } catch {
    return {}
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // ignore: progress is a convenience
  }
}

function update(slug: string, patch: (p: LectureProgress) => LectureProgress) {
  state = { ...state, [slug]: patch(state[slug] ?? {}) }
  save()
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useProgress(): ProgressState {
  return useSyncExternalStore(subscribe, () => state, () => state)
}

export function setCompleted(slug: string, completed: boolean) {
  update(slug, (p) => ({ ...p, completed }))
}

export function recordQuiz(slug: string, quizId: string, correct: number, total: number) {
  update(slug, (p) => ({ ...p, quiz: { ...p.quiz, [quizId]: { correct, total } } }))
}
