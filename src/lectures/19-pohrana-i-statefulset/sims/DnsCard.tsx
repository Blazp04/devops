/**
 * Live nslookup answer from the engine's CoreDNS model (resolveDns), written on a small pencil card under the
 * flagship part 2. A headless Service answers with the Pods' own IP addresses; db-1.db always leads to db-1.
 */
import { Rough } from '../../../kit'

export function DnsCard({ query, lines }: { query: string; lines: string[] }) {
  const W = 340
  const H = 34 + Math.max(1, lines.length) * 20 + 10
  return (
    <div style={{ maxWidth: 460 }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`nslookup ${query}: ${lines.join('; ')}`} style={{ display: 'block', width: '100%', height: 'auto' }}>
        <Rough shape={{ k: 'rect', x: 2, y: 2, w: W - 4, h: H - 4 }} seed={20500} stroke="var(--ink-2)" strokeWidth={1.4} fillColor="var(--paper)" fillStyle="solid" />
        <text x={14} y={24} className="k-svg-mono" style={{ fontSize: 13, fontWeight: 700, fill: 'var(--pen)' }}>
          $ nslookup {query}
        </text>
        {lines.map((l, i) => (
          <text key={i} x={14} y={46 + i * 20} className="k-svg-mono" style={{ fontSize: 13, fill: l.startsWith('**') ? 'var(--red)' : 'var(--ink)' }}>
            {l}
          </text>
        ))}
      </svg>
    </div>
  )
}
