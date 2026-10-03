/* Helpers for the pencil charts (Sparkline, LineChart). */

export type XY = [number, number]

/** Runs of finite values: a chart breaks its line at NaN / ±Infinity ("n/a") instead of drawing to 0. */
export function finiteRuns(values: number[]): { start: number; vals: number[] }[] {
  const out: { start: number; vals: number[] }[] = []
  let cur: { start: number; vals: number[] } | null = null
  values.forEach((v, i) => {
    if (Number.isFinite(v)) {
      if (!cur) {
        cur = { start: i, vals: [] }
        out.push(cur)
      }
      cur.vals.push(v)
    } else cur = null
  })
  return out
}

/** Largest finite value (non-finite values are left out of the axis maximum). */
export function finiteMax(values: number[]): number {
  let m = -Infinity
  for (const v of values) if (Number.isFinite(v) && v > m) m = v
  return m
}

export function niceCeil(v: number): number {
  if (!(v > 0)) return 1
  const exp = Math.pow(10, Math.floor(Math.log10(v)))
  const f = v / exp
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return nice * exp
}

/**
 * Round tick values from 0 to max (3–6 ticks, steps of 1 / 2 / 5 × 10ⁿ). Falls back to [0, max] when the
 * formatter would print two equal labels (e.g. 0,25 and 0,5 both rounded to "0").
 */
export function niceTicks(max: number, format: (v: number) => string): number[] {
  if (!(max > 0)) return [0]
  const raw = max / 4
  const exp = Math.pow(10, Math.floor(Math.log10(raw)))
  const f = raw / exp
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp
  const ticks: number[] = []
  for (let t = 0; t <= max * 1.0001; t += step) ticks.push(Math.round(t / step) * step)
  if (ticks.length < 2) return [0, max]
  const labels = ticks.map(format)
  if (new Set(labels).size !== labels.length) return [0, max]
  return ticks
}

/** SVG path through points. */
export function pathOf(pts: XY[]): string {
  let d = ''
  pts.forEach(([x, y], i) => {
    d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
  })
  return d
}

/**
 * A second, lighter pencil stroke next to the main one (tiny deterministic offsets), so a live line reads as drawn
 * by hand without running roughjs on every frame.
 */
export function ghostPath(pts: XY[], amount = 0.7): string {
  return pathOf(pts.map(([x, y], i) => [x + (((i * 7) % 5) - 2) * 0.16 * amount, y + (((i * 13) % 5) - 2) * 0.28 * amount + 0.45 * amount]))
}
