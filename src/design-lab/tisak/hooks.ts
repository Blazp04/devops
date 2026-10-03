import { useEffect, useState, type RefObject } from 'react'

/** True while the element is (nearly) on screen — simulations only run while visible. */
export function useInView(ref: RefObject<Element | null>, margin = '120px'): boolean {
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: margin })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, margin])
  return inView
}

/** Content width of an element (ResizeObserver); starts from a window-based guess. */
export function useWidth(ref: RefObject<Element | null>, guess: () => number): number {
  const [w, setW] = useState(guess)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return w
}

/** requestAnimationFrame loop with a clamped delta (seconds). Runs only while `active`. */
export function useFrameLoop(active: boolean, onFrame: (dt: number) => void) {
  useEffect(() => {
    if (!active) return
    let raf = 0
    let last = -1
    const tick = (now: number) => {
      const dt = last < 0 ? 1 / 60 : Math.min(0.05, (now - last) / 1000)
      last = now
      onFrame(dt)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, onFrame])
}
