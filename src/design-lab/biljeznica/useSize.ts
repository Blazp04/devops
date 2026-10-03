import { useEffect, useRef, useState } from 'react'

export interface Size {
  w: number
  h: number
}

/** Measures an element (border box) and re-measures on resize. */
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

/** Is the element narrower than `px`? (layout switch for drawings) */
export function useNarrow<T extends HTMLElement>(px: number) {
  const ref = useRef<T>(null)
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < px))
    ro.observe(el)
    return () => ro.disconnect()
  }, [px])
  return [ref, narrow] as const
}

/** Content width of an element (null until measured). Drawings pick their layout from it. */
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

/** Is the element (at least partly) on screen? `once` keeps it true after the first sighting. */
export function useInView<T extends Element>(threshold = 0.05, once = false) {
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
