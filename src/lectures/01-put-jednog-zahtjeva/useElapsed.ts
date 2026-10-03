import { useEffect, useState } from 'react'
import { useReducedMotion } from 'motion/react'

/**
 * Seconds since playback started (after a short `delay` in which the route is drawn first), ticking with
 * requestAnimationFrame until `until`. Playback starts when `active` first becomes true (e.g. once the drawing is on
 * screen), so a step that mounts above the viewport waits for the reader. Key the component by its step so every step
 * plays from the start. Reduced motion: `until` at once (the drawing shows its final state, nothing flies).
 */
export function useElapsed(until: number, delay = 0.4, active = true): number {
  const reduce = useReducedMotion()
  const [t, setT] = useState(0)
  useEffect(() => {
    if (reduce || !active) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const e = (now - start) / 1000 - delay
      setT(Math.max(0, Math.min(until, e)))
      if (e < until) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reduce, until, delay, active])
  return reduce ? until : t
}
