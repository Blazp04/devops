import { Arrow, Check, Cross, DLabel, PodShape, Rough } from '../../../kit'
import { SCHEMA_H, readsOk, type SchemaFrame } from '../lib/schema'

const G = {
  wide: { w: 560, podX: 50, labelX: 80, from: 140, tableX: 330, tableW: 214, font: 13 },
  narrow: { w: 340, podX: 22, labelX: 46, from: 98, tableX: 182, tableW: 154, font: 13 },
} as const

/**
 * The orders table and the klopa-api Pods reading „their" price column (green ✓ found, red ✗ HTTP 500 missing).
 * A column a running version asks for but the table no longer has is drawn as a dashed ghost row under the table.
 */
export function SchemaDrawing({ frame, layout }: { frame: SchemaFrame; layout: 'wide' | 'narrow' }) {
  const g = G[layout]
  const n = Math.max(1, frame.pods.length)
  const gap = Math.min(50, 196 / n)
  const podY = (i: number) => 44 + i * gap + (n <= 4 ? (4 - n) * 12 : 0)
  const rowTop = 52
  const rowH = layout === 'wide' ? 40 : 44
  const rowY = (j: number) => rowTop + j * rowH + rowH / 2
  const tableH = frame.cols.length * rowH
  const live = frame.pods.filter((pod) => pod.status !== 'terminating' && pod.status !== 'creating')
  // the column a Pod asks for that is not in the table at all (Friday: cijena after the rename)
  const ghost = live.map((pod) => pod.reads).find((c) => !frame.cols.some((col) => col.name === c)) ?? null
  const rowOf = (name: string) => {
    const j = frame.cols.findIndex((c) => c.name === name)
    return j >= 0 ? j : frame.cols.length
  }
  // one ✓ / ✗ per row (every Pod of a version reads the same column)
  const marks = new Map<number, boolean>()
  for (const pod of live) marks.set(rowOf(pod.reads), readsOk(frame, pod))
  const ghostY = rowTop + tableH
  return (
    <g>
      <text x={g.tableX} y={rowTop - 12} className="k-svg-display" style={{ fontSize: g.font + 2 }}>
        tablica{' '}
        <tspan className="k-svg-mono" style={{ fontSize: g.font + 1 }}>
          narudzbe
        </tspan>
      </text>
      <Rough shape={{ k: 'rect', x: g.tableX, y: rowTop, w: g.tableW, h: tableH }} seed={2301} stroke="var(--ink-2)" fillColor="var(--paper)" fillStyle="solid" />
      {frame.cols.map((c, j) => {
        const y = rowTop + j * rowH
        return (
          <g key={c.name}>
            {j > 0 && <line x1={g.tableX + 4} y1={y} x2={g.tableX + g.tableW - 4} y2={y} stroke="var(--ink-3)" strokeWidth={1} />}
            {c.state === 'new' && <rect x={g.tableX + 6} y={y + 8} width={c.name.length * g.font * 0.62 + 10} height={rowH - 16} fill="var(--hl-green)" />}
            <text x={g.tableX + 10} y={layout === 'wide' || c.state === 'ok' ? y + rowH / 2 + 5 : y + 18} className="k-svg-mono" style={{ fontSize: g.font, fill: c.state === 'dropped' ? 'var(--ink-3)' : 'var(--ink)', fontWeight: c.name.startsWith('cijena') ? 600 : 400 }}>
              {c.name}
            </text>
            {c.state === 'dropped' && <line x1={g.tableX + 8} y1={layout === 'wide' ? y + rowH / 2 : y + 14} x2={g.tableX + 14 + c.name.length * g.font * 0.6} y2={layout === 'wide' ? y + rowH / 2 - 2 : y + 12} stroke="var(--red)" strokeWidth={2} />}
            {c.state !== 'ok' && (
              <DLabel
                x={g.tableX + g.tableW - 6}
                y={layout === 'wide' ? y + rowH / 2 + 6 : y + rowH - 5}
                anchor="end"
                size={12.5}
                tone={c.state === 'new' ? 'green' : 'bad'}
                text={c.state === 'new' ? '+ novo' : c.state === 'renamed' ? 'preimenovan' : 'obrisan'}
              />
            )}
          </g>
        )
      })}
      {ghost && (
        <g>
          <Rough shape={{ k: 'rect', x: g.tableX, y: ghostY + 4, w: g.tableW, h: rowH - 6 }} seed={2305} stroke="var(--red)" dash="5 4" strokeWidth={1.3} />
          <text x={g.tableX + 10} y={ghostY + 4 + (rowH - 6) / 2 + 5} className="k-svg-mono" style={{ fontSize: g.font, fill: 'var(--ink-3)', fontWeight: 600 }}>
            {ghost}
          </text>
          <line x1={g.tableX + 8} y1={ghostY + 4 + (rowH - 6) / 2} x2={g.tableX + 14 + ghost.length * g.font * 0.6} y2={ghostY + 2 + (rowH - 6) / 2} stroke="var(--red)" strokeWidth={2} />
          <DLabel x={g.tableX + g.tableW - 6} y={ghostY + 4 + (rowH - 6) / 2 + 6} anchor="end" size={12.5} tone="bad" text="nema" />
        </g>
      )}
      {frame.pods.map((pod, i) => {
        const y = podY(i)
        const ok = pod.status === 'terminating' || pod.status === 'creating' ? null : readsOk(frame, pod)
        const ty = rowY(rowOf(pod.reads)) + (rowOf(pod.reads) === frame.cols.length ? 1 : 0)
        const tx = g.tableX - 8
        const stroke = ok === null ? 'var(--ink-4)' : ok ? 'var(--green)' : 'var(--red)'
        return (
          <g key={pod.id}>
            <PodShape x={g.podX} y={y} size={layout === 'wide' ? 30 : 26} status={pod.status} tone={pod.version === '1.4.1' ? 'blue' : 'violet'} ariaLabel={`Pod ${pod.version} čita stupac ${pod.reads}${ok === false ? ' i ne nalazi ga: HTTP 500' : ok ? ' i nalazi ga' : ''}`} />
            <text x={g.labelX} y={y + 5} className="k-svg-mono" style={{ fontSize: g.font, fontWeight: 600, fill: pod.version === '1.4.1' ? 'var(--pen)' : 'var(--violet)' }}>
              {pod.version}
            </text>
            <Arrow pts={[[g.from, y], [tx, ty]]} stroke={stroke} dash={ok === false ? '6 4' : undefined} seed={2310 + i} strokeWidth={1.5} />
          </g>
        )
      })}
      {[...marks].map(([row, ok]) => {
        const ty = rowY(row)
        const tx = g.tableX - 8
        return ok ? <Check key={`m-${row}`} x={tx - 14} y={ty - 13} size={9} /> : <Cross key={`m-${row}`} x={tx - 16} y={ty - 13} size={9} />
      })}
      {live.some((pod) => readsOk(frame, pod) === false) && <DLabel x={(g.from + g.tableX) / 2 - 8} y={SCHEMA_H - 6} size={12.5} tone="bad" text="✗ HTTP 500: stupca nema" />}
    </g>
  )
}
