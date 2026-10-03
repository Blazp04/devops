import { useEffect, useRef, useState } from 'react'

/** One rendered line of text, relative to the top-left corner of the measured element's parent (px). */
export interface LineBox {
  x: number
  y: number
  w: number
  h: number
}

function sameLines(a: LineBox[], b: LineBox[]) {
  return a.length === b.length && a.every((l, i) => Math.abs(l.x - b[i].x) < 0.5 && Math.abs(l.y - b[i].y) < 0.5 && Math.abs(l.w - b[i].w) < 0.5 && Math.abs(l.h - b[i].h) < 0.5)
}

/**
 * Measures the line boxes of the text inside an element (one entry per visual line), so a pen can cross out
 * each line separately. Boxes are relative to the element's parent (the positioned block an overlay <svg> lives in).
 * Re-measures on resize and once the web fonts have loaded. The text must not be rotated (client rects of rotated
 * text are inflated): tilt a background layer instead.
 *   const [ref, lines] = useLineBoxes<HTMLSpanElement>()
 */
export function useLineBoxes<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [lines, setLines] = useState<LineBox[]>([])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let alive = true
    const measure = () => {
      if (!alive) return
      const base = (el.parentElement ?? el).getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(el)
      const out: LineBox[] = []
      for (const r of Array.from(range.getClientRects())) {
        if (r.width < 2 || r.height < 2) continue
        const x = r.left - base.left
        const y = r.top - base.top
        const mid = y + r.height / 2
        const line = out.find((l) => Math.abs(l.y + l.h / 2 - mid) < Math.min(l.h, r.height) * 0.5)
        if (line) {
          const right = Math.max(line.x + line.w, x + r.width)
          const bottom = Math.max(line.y + line.h, y + r.height)
          line.x = Math.min(line.x, x)
          line.y = Math.min(line.y, y)
          line.w = right - line.x
          line.h = bottom - line.y
        } else {
          out.push({ x, y, w: r.width, h: r.height })
        }
      }
      out.sort((a, b) => a.y - b.y)
      setLines((prev) => (sameLines(prev, out) ? prev : out))
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el.parentElement ?? el)
    document.fonts?.ready.then(measure).catch(() => undefined)
    return () => {
      alive = false
      ro.disconnect()
    }
  }, [])
  return [ref, lines] as const
}
