import { useCallback, useState } from 'react'

/**
 * Width of an element that may be re-created (e.g. inside a Stepper page): a callback ref with its own
 * ResizeObserver, so the layout follows the element actually on screen. Pick drawing layouts by this width.
 */
export function useBoxWidth<T extends HTMLElement>() {
  const [w, setW] = useState<number | null>(null)
  const ref = useCallback((el: T | null) => {
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => {
      const nw = Math.round(e.contentRect.width)
      setW((old) => (old === nw ? old : nw))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}
