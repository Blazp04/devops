import { Rough } from '../../../kit'

/**
 * „Tko vidi?” – an onlooker's eye, drawn with the course pen (composed locally from Rough primitives).
 * open + red pencil = this onlooker can read the value; closed lid + grey = cannot. The two differ by shape as well
 * as colour (WCAG 1.4.1). Centre (x, y), width w.
 */
export function Eye({ x, y, w = 34, open, seed = 1, selected }: { x: number; y: number; w?: number; open: boolean; seed?: number; selected?: boolean }) {
  const h = w * 0.6
  const l = x - w / 2
  const r = x + w / 2
  if (open) {
    return (
      <g>
        {selected && <Rough shape={{ k: 'ellipse', cx: x, cy: y, w: w + 16, h: h + 18 }} seed={seed + 9} stroke="var(--pen)" strokeWidth={1.6} dash="5 4" />}
        <Rough shape={{ k: 'curve', pts: [[l, y], [x - w * 0.22, y - h * 0.55], [x + w * 0.22, y - h * 0.55], [r, y]] }} seed={seed} stroke="var(--red)" strokeWidth={1.9} roughness={0.8} />
        <Rough shape={{ k: 'curve', pts: [[l, y], [x - w * 0.22, y + h * 0.5], [x + w * 0.22, y + h * 0.5], [r, y]] }} seed={seed + 1} stroke="var(--red)" strokeWidth={1.7} roughness={0.8} />
        <Rough shape={{ k: 'ellipse', cx: x, cy: y, w: h * 0.82, h: h * 0.82 }} seed={seed + 2} stroke="var(--red)" strokeWidth={1.5} fillColor="var(--red)" hachureGap={2.2} roughness={0.7} />
        <circle cx={x} cy={y} r={Math.max(1.8, w * 0.07)} style={{ fill: 'var(--ink)' }} />
        {[-0.3, 0, 0.3].map((k, i) => (
          <Rough key={i} shape={{ k: 'line', x1: x + k * w, y1: y - h * 0.5, x2: x + k * w * 1.4, y2: y - h * 0.85 }} seed={seed + 3 + i} stroke="var(--red)" strokeWidth={1.3} roughness={0.5} />
        ))}
      </g>
    )
  }
  return (
    <g>
      {selected && <Rough shape={{ k: 'ellipse', cx: x, cy: y, w: w + 16, h: h + 18 }} seed={seed + 9} stroke="var(--pen)" strokeWidth={1.6} dash="5 4" />}
      <Rough shape={{ k: 'curve', pts: [[l, y - h * 0.05], [x - w * 0.22, y + h * 0.32], [x + w * 0.22, y + h * 0.32], [r, y - h * 0.05]] }} seed={seed + 5} stroke="var(--ink-3)" strokeWidth={1.7} roughness={0.8} />
      {[-0.3, 0, 0.3].map((k, i) => (
        <Rough key={i} shape={{ k: 'line', x1: x + k * w, y1: y + h * 0.26, x2: x + k * w * 1.3, y2: y + h * 0.55 }} seed={seed + 6 + i} stroke="var(--ink-3)" strokeWidth={1.2} roughness={0.5} />
      ))}
    </g>
  )
}

/** The same eye as its own little <svg> (for HTML cards and lists). Decorative: the text next to it says the verdict. */
export function EyeIcon({ open, seed = 1, size = 40 }: { open: boolean; seed?: number; size?: number }) {
  return (
    <svg viewBox="0 0 44 32" width={size} height={(size * 32) / 44} aria-hidden="true" style={{ flex: 'none', overflow: 'visible' }}>
      <Eye x={22} y={17} w={34} open={open} seed={seed} />
    </svg>
  )
}
