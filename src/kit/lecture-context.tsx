import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export interface TocEntry {
  id: string
  title: string
  el: HTMLElement
}

interface LectureContextValue {
  slug: string
  sections: TocEntry[]
  register: (entry: TocEntry) => () => void
}

const LectureContext = createContext<LectureContextValue | null>(null)

export function LectureProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const [sections, setSections] = useState<TocEntry[]>([])

  const register = useCallback((entry: TocEntry) => {
    setSections((prev) => {
      const next = prev.filter((s) => s.id !== entry.id).concat(entry)
      next.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      return next
    })
    return () => setSections((prev) => prev.filter((s) => s.id !== entry.id))
  }, [])

  const value = useMemo(() => ({ slug, sections, register }), [slug, sections, register])
  return <LectureContext.Provider value={value}>{children}</LectureContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLecture(): LectureContextValue | null {
  return useContext(LectureContext)
}
