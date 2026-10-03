/** Stacked step areas for the four rollout lanes (small multiples of laneRuns()). */
import type { LaneRun, LaneSample } from './snapshots'

export const LAYERS: { key: keyof Omit<LaneSample, 't'>; label: string }[] = [
  { key: 'oldReady', label: '1.3.2 spreman' },
  { key: 'newReady', label: '1.4.0 spreman' },
  { key: 'oldNotReady', label: '1.3.2 nije spreman' },
  { key: 'newNotReady', label: '1.4.0 još nije spreman' },
  { key: 'terminating', label: 'u gašenju' },
]

export const LANE_MAX_T = 52

/** One closed step-area path per layer: x = time · sx from x0, y grows upwards from baseY by sy per Pod. */
export function laneAreas(run: LaneRun, x0: number, baseY: number, sx: number, sy: number): { key: string; d: string }[] {
  const s = run.samples
  const out: { key: string; d: string }[] = []
  const below = s.map(() => 0)
  for (const layer of LAYERS) {
    const top = s.map((p, i) => below[i] + p[layer.key])
    if (top.some((v, i) => v > below[i])) {
      let d = ''
      // top edge, left → right (steps)
      for (let i = 0; i < s.length; i++) {
        const xa = x0 + s[i].t * sx
        const xb = x0 + (i + 1 < s.length ? s[i + 1].t : s[i].t + 0.5) * sx
        const y = baseY - top[i] * sy
        d += `${i === 0 ? 'M' : 'L'}${xa.toFixed(1)} ${y.toFixed(1)} L${xb.toFixed(1)} ${y.toFixed(1)} `
      }
      // bottom edge, right → left
      for (let i = s.length - 1; i >= 0; i--) {
        const xa = x0 + s[i].t * sx
        const xb = x0 + (i + 1 < s.length ? s[i + 1].t : s[i].t + 0.5) * sx
        const y = baseY - below[i] * sy
        d += `L${xb.toFixed(1)} ${y.toFixed(1)} L${xa.toFixed(1)} ${y.toFixed(1)} `
      }
      out.push({ key: layer.key, d: `${d}Z` })
    }
    for (let i = 0; i < s.length; i++) below[i] = top[i]
  }
  return out
}
