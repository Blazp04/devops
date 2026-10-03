import { K8sGlyph, PodShape, Rough, ServiceTag, useDiagramIds } from '../../../kit'
import { findService, openConnections, type ClusterState } from '../../../engines/cluster'
import { GEOM, podSpots, routedRows, rowTone, toneVar, trayDots, trayWidth, type LaneLayout, type RouterKind } from '../lib/lane-view'

/**
 * One release lane inside a <Diagram>: the router on the left (Service tag, Service with a selector, or an
 * HTTPRoute with weights), then the stable Pods (top row) and the new Pods (bottom row), and the request trays
 * in flight from the engine (orange = served, red ✗ = failed). Routes go only to ready Pods (solid); a Pod that
 * is not ready gets a grey dashed line with ✗, a Pod the router does not select a grey dashed line.
 */
export function LaneDrawing({ s, layout, router, conns = false }: { s: ClusterState; layout: LaneLayout; router: RouterKind; conns?: boolean }) {
  const ids = useDiagramIds()
  const g = GEOM[layout]
  const spots = podSpots(s, layout, router)
  const dots = trayDots(s, layout, spots, layout === 'wide' ? 18 : 12)
  const routed = routedRows(s, router)
  const rel = s.release
  const stable = rel?.stableVersion ?? '1.4.1'
  const next = rel?.newVersion ?? '2.0.0'
  const track = router === 'selector' ? findService(s, 'klopa-api')?.selector.track ?? 'blue' : null
  const routes = s.traffic[0]?.routes ?? []
  const weight = (name: string) => routes.find((r) => r.serviceName === name)?.weight ?? 0
  const cx = g.rx + g.rw / 2
  const cy = g.ry + g.rh / 2
  const trayW = trayWidth(layout)
  const rowColor = [toneVar(rowTone(s, stable, 0, router)), toneVar(rowTone(s, next, 1, router))]
  const rowNote = (row: 0 | 1): string | null => {
    if (router === 'selector') return row === 0 ? (routed[0] ? 'blue ✓' : 'blue') : routed[1] ? 'green ✓' : 'green'
    if (router === 'gateway') return `${weight(row === 0 ? 'klopa-api-stable' : 'klopa-api-canary')} %`
    return null
  }
  const fallen = dots.filter((d) => d.dropped)
  return (
    <g>
      {/* routes from the router to every Pod: solid = ready and selected, dashed = not selected or not ready (✗) */}
      {spots.map((p) => {
        const x2 = p.x - g.pod * 0.62
        const notReady = !p.ready && routed[p.row]
        return (
          <g key={`ln-${p.pod.id}`}>
            <line
              x1={g.outX}
              y1={g.outY}
              x2={x2}
              y2={p.y}
              stroke={p.routed ? 'var(--ink-3)' : 'var(--ink-4)'}
              strokeWidth={p.routed ? 1.3 : 1}
              strokeDasharray={p.routed ? undefined : '3 4'}
              strokeLinecap="round"
            />
            {notReady && (
              <text x={x2 - 7} y={p.y + (p.row === 0 ? -3 : 12)} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 12, fill: 'var(--ink-3)' }} aria-hidden="true">
                ✗
              </text>
            )}
          </g>
        )
      })}

      {/* long-lived client connections (keep-alive): pinned to the Pod chosen when they opened */}
      {conns &&
        spots.map((p) => {
          const n = openConnections(s, 'web').filter((c) => c.podId === p.pod.id).length
          if (n === 0) return null
          const x2 = p.x - g.pod * 0.62
          return (
            <g key={`cn-${p.pod.id}`}>
              <line x1={g.outX} y1={g.outY} x2={x2} y2={p.y} stroke={rowColor[p.row]} strokeWidth={2.5 + n * 1.2} strokeLinecap="round" opacity={0.8} />
              <text x={p.x + g.pod * 0.62} y={p.y - g.pod * 0.5} className="k-svg-mono" style={{ fontSize: 12.5, fontWeight: 700, fill: rowColor[p.row] }}>
                {n}×
              </text>
            </g>
          )
        })}

      {router === 'gateway' ? (
        <g>
          <Rough shape={{ k: 'rect', x: g.rx + 2, y: g.ry + 2, w: g.rw - 4, h: g.rh - 4 }} seed={2051} stroke="var(--ink-2)" fillColor="var(--paper)" fillStyle="solid" strokeWidth={1.6} />
          <K8sGlyph kind="route" x={g.rx + 6} y={cy - (layout === 'wide' ? 16 : 12)} w={layout === 'wide' ? 34 : 22} h={layout === 'wide' ? 32 : 24} />
          <text x={g.rx + (layout === 'wide' ? 44 : 30)} y={cy - 12} className="k-svg-display" style={{ fontSize: g.font }}>
            HTTPRoute
          </text>
          <text x={g.rx + (layout === 'wide' ? 44 : 30)} y={cy + 10} className="k-svg-mono" style={{ fontSize: g.font, fill: 'var(--ink-2)' }}>
            {weight('klopa-api-stable')} / {weight('klopa-api-canary')}
          </text>
          <text x={g.rx + (layout === 'wide' ? 44 : 30)} y={cy + 27} className="k-svg-mono" style={{ fontSize: 12, fill: 'var(--ink-3)' }}>
            težine
          </text>
        </g>
      ) : (
        <ServiceTag x={g.rx} y={g.ry} w={g.rw} h={g.rh}>
          <text x={cx + 8} y={cy - (track ? 9 : 4)} textAnchor="middle" className="k-svg-display" style={{ fontSize: g.font }}>
            Service
          </text>
          {track ? (
            <text x={cx + 8} y={cy + 12} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 12, fill: track === 'green' ? 'var(--green)' : 'var(--pen)', fontWeight: 600 }}>
              {layout === 'wide' ? `track: ${track}` : `→ ${track}`}
            </text>
          ) : (
            <text x={cx + 8} y={cy + 14} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 12, fill: 'var(--ink-2)' }}>
              klopa-api
            </text>
          )}
        </ServiceTag>
      )}

      {/* row labels outside the route fan: the top row's version above the router, the bottom row's below it */}
      {([0, 1] as const).map((row) => {
        const note = rowNote(row)
        const [lx, ly] = g.labels[row]
        return (
          <text key={`lb-${row}`} x={lx} y={ly} className="k-svg-mono" style={{ fontSize: g.font, fontWeight: 700, fill: rowColor[row] }}>
            {row === 0 ? stable : next}
            {note && (
              <tspan style={{ fontSize: 12, fontWeight: 600, fill: routed[row] ? rowColor[row] : 'var(--ink-3)' }}>
                {' · '}
                {note}
              </tspan>
            )}
          </text>
        )
      })}

      {spots.map((p) => (
        <PodShape key={p.pod.id} x={p.x} y={p.y} size={g.pod} status={p.status} tone={p.tone} ariaLabel={`Pod ${p.pod.name}, verzija ${p.pod.spec.app.version}, ${p.caption}`} />
      ))}

      {/* request trays: one pooled layer from the engine's in-flight list */}
      <g aria-hidden="true">
        {dots.map((d) => (
          <g key={d.id} transform={d.rot ? `rotate(${d.rot.toFixed(1)} ${d.x.toFixed(1)} ${d.y.toFixed(1)})` : undefined}>
            <use href={ids?.tray} x={d.x - trayW / 2} y={d.y - trayW * 0.35} width={trayW} height={trayW * 0.7} fill={d.bad ? 'var(--red)' : 'var(--tray)'} />
            {d.bad && !d.dropped && (
              <text x={d.x} y={d.y - trayW * 0.45} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 12, fontWeight: 700, fill: 'var(--red)' }}>
                ✗
              </text>
            )}
          </g>
        ))}
        {fallen.length > 0 && (
          <text x={fallen[fallen.length - 1].x + trayW * 0.8} y={fallen[fallen.length - 1].y + 4} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 13, fontWeight: 700, fill: 'var(--red)' }}>
            ✗
          </text>
        )}
      </g>
    </g>
  )
}
