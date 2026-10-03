import { useCallback, useEffect, useRef, useState } from 'react'

export interface Size {
  w: number
  h: number
}

/**
 * Measures an element's border box and re-measures on resize. `size` is null until the first measurement.
 *   const [ref, size] = useSize<HTMLDivElement>()
 */
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState<Size | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const w = Math.round(el.offsetWidth)
      const h = Math.round(el.offsetHeight)
      setSize((old) => (old && old.w === w && old.h === h ? old : { w, h }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

/**
 * Content width of an element (null until measured). Drawings pick their layout (wide / medium / narrow) from the
 * width of their container, never from the window width:
 *   const [ref, w] = useWidth<HTMLDivElement>(); const layout = w === null || w >= 840 ? WIDE : w >= 580 ? MEDIUM : NARROW
 */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState<number | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const nw = Math.round(e.contentRect.width)
      setW((old) => (old === nw ? old : nw))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/**
 * Like `useWidth`, but with a callback ref, so it follows the element even when React re-creates it (a drawing inside a
 * Stepper page, a keyed subtree, something rendered only in one layout). `useWidth` only sees the element present at
 * mount.
 *   const [ref, w] = useWidthRef<HTMLDivElement>(); … <div ref={ref}>
 */
export function useWidthRef<T extends HTMLElement>() {
  const [w, setW] = useState<number | null>(null)
  const ref = useCallback((el: T | null) => {
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const nw = Math.round(e.contentRect.width)
      setW((old) => (old === nw ? old : nw))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/**
 * Is the element (at least partly) on screen? `once` keeps it true after the first sighting.
 * Simulations use it to run only while visible.
 */
export function useOnScreen<T extends Element>(threshold = 0.05, once = false) {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (once && !e.isIntersecting) return
        setInView(e.isIntersecting)
        if (once && e.isIntersecting) io.disconnect()
      },
      { threshold },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [threshold, once])
  return [ref, inView] as const
}
