/** Footer skyline: a quay of stacked containers along the screen horizontal (x+y constant). */
import { memo } from 'react'
import { Box, Container } from './iso'

const COLORS = ['var(--rust)', 'var(--teal)', 'var(--mustard)', 'var(--blue)', 'var(--orange)', 'var(--teal)', 'var(--rust)']
const HEIGHTS = [2, 1, 3, 2, 0, 1, 2, 3, 1, 0, 2, 2, 1, 3, 2, 1, 0, 2, 3, 1, 2, 1, 0, 3, 2, 2, 1, 3, 0, 1, 2, 3, 2, 1, 0, 2, 1, 3, 2, 1]
const STEP = 1.25

export const Skyline = memo(function Skyline() {
  const items: { k: number; tier: number; c: string }[] = []
  HEIGHTS.forEach((h, k) => {
    for (let tier = 0; tier < h; tier++) items.push({ k, tier, c: COLORS[(k * 3 + tier * 2) % COLORS.length] })
  })
  return (
    <svg viewBox="-20 -72 2000 96" preserveAspectRatio="xMinYMax slice" aria-hidden="true" focusable="false">
      {items.map(({ k, tier, c }) => (
        <Container key={`${k}-${tier}`} x={STEP * k} y={-STEP * k} z={tier * 0.86} len={1.6} wid={0.8} hei={0.86} c={c} />
      ))}
      {/* a yard crane straddling two empty slots */}
      <Box x={STEP * 4 - 0.1} y={-STEP * 4 - 0.05} w={0.12} d={0.12} h={2.7} c="var(--yellow)" />
      <Box x={STEP * 4 + 1.6} y={-STEP * 4 - 0.05} w={0.12} d={0.12} h={2.7} c="var(--yellow)" />
      <Box x={STEP * 4 - 0.1} y={-STEP * 4 - 0.05} z={2.7} w={1.82} d={0.14} h={0.18} c="var(--yellow)" />
    </svg>
  )
})
