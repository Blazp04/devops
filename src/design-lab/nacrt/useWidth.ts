import { useEffect, useState } from 'react'

/** Width of an element (callback ref + ResizeObserver). Starts from a viewport-based guess. */
export function useWidth<T extends Element>(guess: (vw: number) => number = (vw) => vw): [(el: T | null) => void, number] {
  const [el, setEl] = useState<T | null>(null)
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 1200 : guess(window.innerWidth)))
  useEffect(() => {
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width
      if (cw) setW(Math.round(cw))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return [setEl, w]
}

/** True while the element is (nearly) on screen. */
export function useOnScreen<T extends Element>(): [(el: T | null) => void, boolean] {
  const [el, setEl] = useState<T | null>(null)
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!el) return
    const io = new IntersectionObserver((entries) => setOn(entries[0]?.isIntersecting ?? false), { rootMargin: '120px' })
    io.observe(el)
    return () => io.disconnect()
  }, [el])
  return [setEl, on]
}

/** Width and height of an element. */
export function useSize<T extends Element>(): [(el: T | null) => void, { w: number; h: number }] {
  const [el, setEl] = useState<T | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const b = entries[0]?.borderBoxSize?.[0]
      if (b) setSize({ w: Math.round(b.inlineSize), h: Math.round(b.blockSize) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return [setEl, size]
}
