import { useEffect, useState, type RefObject } from 'react'

/** Live content width of an element (ResizeObserver). Returns `fallback` until measured. */
export function useElementWidth(ref: RefObject<HTMLElement | null>, fallback = 720): number {
  const [w, setW] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return w
}

/** True when the viewport is narrower than `px` (phone layouts). */
export function useNarrow(px = 640): boolean {
  const query = `(max-width: ${px - 1}px)`
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return narrow
}
