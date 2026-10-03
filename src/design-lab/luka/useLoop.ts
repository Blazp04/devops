import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'

/**
 * Animation clock for looping illustrations. Runs a requestAnimationFrame loop only while the element is
 * on screen and motion is allowed; returns elapsed seconds (frozen at `still` otherwise). Pass `layout` when the
 * observed element is swapped for another one (e.g. a phone framing), so the observer follows it.
 */
export function useLoopTime(ref: RefObject<Element | null>, enabled: boolean, still = 0, layout: unknown = null): number {
  const [t, setT] = useState(still)
  const acc = useRef(still)
  useEffect(() => {
    if (!enabled) return
    const el = ref.current
    if (!el) return
    let raf = 0
    let last = 0
    let visible = false
    const frame = (now: number) => {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
      last = now
      acc.current += dt
      setT(acc.current)
      if (visible) raf = requestAnimationFrame(frame)
    }
    const io = new IntersectionObserver(
      ([e]) => {
        const was = visible
        visible = e.isIntersecting
        if (visible && !was) {
          last = 0
          raf = requestAnimationFrame(frame)
        } else if (!visible) cancelAnimationFrame(raf)
      },
      { rootMargin: '80px' },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [ref, enabled, layout])
  return enabled ? t : still
}

const RM_QUERY = '(prefers-reduced-motion: reduce)'
function subscribeRM(cb: () => void) {
  const mq = window.matchMedia(RM_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
/** prefers-reduced-motion as a live boolean (own hook, so Motion's dev notice is not triggered). */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeRM,
    () => window.matchMedia(RM_QUERY).matches,
    () => false,
  )
}

/** Live media query (compact layouts of the dioramas). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
export const COMPACT_QUERY = '(max-width: 600px)'
