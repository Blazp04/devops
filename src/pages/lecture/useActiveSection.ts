import { useEffect, useState } from 'react'

/** The section whose top has passed 30 % of the viewport (measured on scroll, once per frame). */
export function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null)
  useEffect(() => {
    if (ids.length === 0) return
    let raf = 0
    const measure = () => {
      raf = 0
      const line = window.innerHeight * 0.3
      let current: string | null = null
      for (const id of ids) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= line) current = id
      }
      setActive(current ?? ids[0])
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure)
    }
    raf = requestAnimationFrame(measure)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [ids])
  return active
}

/** Smooth-scroll to a section and keep the hash in the URL without a router navigation. */
export function goToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  history.replaceState(history.state, '', `#${id}`)
}
