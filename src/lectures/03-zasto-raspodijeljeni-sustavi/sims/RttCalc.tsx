/**
 * „Brzina svjetlosti”: where should Klopa's server live? A sequence diagram of a new HTTPS connection from a student in
 * Zagreb (TCP 1 RTT + TLS 1.3 1 RTT + HTTP 1 RTT) on one fixed time axis, so a far server visibly costs more.
 * Physical lower bounds only: light in fibre ≈ 200 000 km/s → RTT ≥ 1 ms per 100 km of (great-circle) distance.
 */
import { useState } from 'react'
import { Arrow, Rough, Segmented, TrayDefs, useWidth } from '../../../kit'
import { num } from '../model'
import styles from '../styles.module.css'

const PLACES = [
  { id: 'split', label: 'Split', km: 259 },
  { id: 'frankfurt', label: 'Frankfurt', km: 723 },
  { id: 'ashburn', label: 'Ashburn (SAD)', km: 7254 },
  { id: 'tokio', label: 'Tokio', km: 9343 },
  { id: 'sydney', label: 'Sydney', km: 16028 },
] as const

type PlaceId = (typeof PLACES)[number]['id']

const LEGS = ['SYN', 'SYN-ACK', 'ClientHello', 'ServerHello…', 'GET /jelovnik', 'odgovor']
const GROUPS = ['TCP', 'TLS 1.3', 'HTTP']

const ms = (v: number) => (v >= 100 ? `${num(v, 0)} ms` : `${num(v, 1)} ms`)

export function RttCalc() {
  const [place, setPlace] = useState<PlaceId>('frankfurt')
  const [ref, width] = useWidth<HTMLDivElement>()
  const p = PLACES.find((x) => x.id === place) ?? PLACES[1]
  const rtt = p.km / 100 // 2 · km / (200 000 km/s), in ms
  const W = Math.max(300, Math.min(720, width ?? 640))
  // phones: two-line headers and shorter notes, so every label stays inside the drawing
  const narrow = W < 480
  const y0 = narrow ? 80 : 58
  const H = y0 + 250 + 32
  const scale = 250 / 500 // px per ms on a fixed 0–500 ms axis
  const Y = (t: number) => y0 + t * scale
  const cx = narrow ? 56 : 74
  const sx = W - 70
  const leg = rtt / 2
  const roomy = leg * scale >= 15
  return (
    <div className={styles.widget} ref={ref}>
      <Segmented label="Gdje stoji poslužitelj?" value={place} onChange={setPlace} options={PLACES.map((x) => ({ value: x.id, label: x.label }))} size="sm" />
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Nova HTTPS veza od Zagreba do poslužitelja u mjestu ${p.label} (${num(p.km)} km): tri povratna puta, prvi bajt odgovora najranije nakon ${ms(3 * rtt)}.`} style={{ display: 'block', height: 'auto', maxWidth: 720 }}>
        <TrayDefs id="l03rtt" />
        {(narrow ? ['studentica', 'u Zagrebu'] : ['studentica u Zagrebu']).map((t, i) => (
          <text key={t} x={narrow ? 4 : cx - 30} y={20 + i * 19} className="k-svg-hand" style={{ fontSize: 18, fill: 'var(--ink)' }}>
            {t}
          </text>
        ))}
        {(narrow ? ['poslužitelj:', p.label] : [`poslužitelj: ${p.label}`]).map((t, i) => (
          <text key={t} x={W - 6} y={20 + i * 19} textAnchor="end" className="k-svg-hand" style={{ fontSize: 18, fill: 'var(--ink)' }}>
            {t}
          </text>
        ))}
        <text x={W - 6} y={narrow ? 57 : 38} textAnchor="end" className="k-svg-mono" style={{ fontSize: 12, fill: 'var(--ink-2)' }}>
          {num(p.km)} km
        </text>
        {/* time axis */}
        {[0, 100, 200, 300, 400, 500].map((t) => (
          <g key={t}>
            <line x1={cx - 6} x2={sx} y1={Y(t)} y2={Y(t)} style={{ stroke: 'var(--ink-4)', strokeWidth: 0.7, strokeDasharray: '2 5' }} />
            <text x={cx - 10} y={Y(t) + 4} textAnchor="end" className="k-svg-mono" style={{ fontSize: 12, fill: 'var(--ink-3)' }}>
              {t}
            </text>
          </g>
        ))}
        <text x={cx - 10} y={Y(500) + 22} textAnchor="end" className="k-svg-mono" style={{ fontSize: 12, fill: 'var(--ink-3)' }}>
          ms ↓
        </text>
        {/* lifelines */}
        <Rough shape={{ k: 'line', x1: cx, y1: y0 - 10, x2: cx, y2: Y(500) + 6 }} seed={8401} stroke="var(--ink)" strokeWidth={1.8} roughness={0.7} />
        <Rough shape={{ k: 'line', x1: sx, y1: y0 - 10, x2: sx, y2: Y(500) + 6 }} seed={8402} stroke="var(--ink)" strokeWidth={1.8} roughness={0.7} />
        {/* the six legs of TCP + TLS 1.3 + HTTP */}
        {LEGS.map((name, i) => {
          const t0 = i * leg
          const t1 = (i + 1) * leg
          const fwd = i % 2 === 0
          const from: [number, number] = [fwd ? cx : sx, Y(t0)]
          const to: [number, number] = [fwd ? sx : cx, Y(t1)]
          const color = i >= 4 ? (i === 5 ? 'var(--green)' : 'var(--tray-ink)') : i >= 2 ? 'var(--pen)' : 'var(--ink-2)'
          return (
            <g key={`${place}-${i}`}>
              <Arrow pts={[from, to]} stroke={color} strokeWidth={1.7} seed={8410 + i} head={8} />
              {roomy && (
                <text x={(from[0] + to[0]) / 2} y={(from[1] + to[1]) / 2 - 5} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 12, fill: color }}>
                  {name}
                </text>
              )}
            </g>
          )
        })}
        {roomy &&
          GROUPS.map((gname, k) => (
            <text key={gname} x={sx + 8} y={Y((2 * k + 1) * leg) + 4} className="k-svg-mono" style={{ fontSize: 12, fill: 'var(--ink-2)' }}>
              {gname}
            </text>
          ))}
        {roomy && <use href="#l03rtt-tray" x={cx + 0.12 * (sx - cx) - 16} y={Y(4.12 * leg) - 26} width={32} height={22} />}
        {/* first byte */}
        <Rough shape={{ k: 'line', x1: cx - 6, y1: Y(3 * rtt), x2: cx + 40, y2: Y(3 * rtt) }} seed={8420} stroke="var(--red)" strokeWidth={2} roughness={0.6} />
        <text x={cx + 46} y={Y(3 * rtt) + (roomy ? 18 : 22)} className="k-svg-hand" style={{ fontSize: 19, fill: 'var(--red)' }}>
          {narrow ? 'prvi bajt' : 'prvi bajt odgovora'}: ≥ {ms(3 * rtt)}
        </text>
        {!roomy &&
          (narrow ? ['sva tri povratna puta', 'stanu u tu crticu'] : ['sva tri povratna puta stanu u tu crticu']).map((t, i) => (
            <text key={t} x={cx + 46} y={Y(3 * rtt) + 44 + i * 20} className="k-svg-hand" style={{ fontSize: 18, fill: 'var(--ink-2)' }}>
              {t}
            </text>
          ))}
      </svg>
      <p className={styles.readout}>
        <span>
          povratni put (RTT) ≥ <strong>{ms(rtt)}</strong>
        </span>
        <span>
          nova HTTPS veza (3 RTT) ≥ <strong>{ms(3 * rtt)}</strong>
        </span>
      </p>
    </div>
  )
}
