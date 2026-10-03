/**
 * "Udaljenost je latencija": a ruler from Zagreb to the server's city, drawn to scale (0 – 16 028 km). The tray goes
 * there and back at the speed of light in fibre (≈ 200 000 km/s), slowed down 20× on screen and the same for every
 * city — so Frankfurt is a blink and Sydney a long walk. One round trip, or the three of a new HTTPS connection.
 */
import { useState } from 'react'
import { Play } from 'lucide-react'
import { Button, DiagramDefs, Rough, Segmented, SimFrame, Stat, StatRow, diagramIds, useWidth, type Pt } from '../../../kit'
import { WIDE_MIN } from '../geometry'
import { PLACES, fmtKm, fmtMs, type Place } from '../model'
import { useElapsed } from '../useElapsed'
import { TraySprite } from './parts'
import styles from '../styles.module.css'

/** on-screen slow motion: 1 ms of real time = 20 ms on screen, for every city */
const SLOW = 20
const MAX_KM = 16028
const CITIES: Place[] = ['split', 'frankfurt', 'ashburn', 'sydney']
const TRIP_LABEL = ['TCP', 'TLS', 'HTTP']

interface RulerGeo {
  vb: [number, number]
  vertical: boolean
  a: Pt
  b: Pt
  labels: Record<Place | 'zagreb', { at: Pt; anchor: 'start' | 'middle' | 'end'; leader?: boolean }>
  ticks: { at: Pt; anchor: 'start' | 'middle' | 'end' }
  font: { hand: number; mono: number }
}

const WIDE: RulerGeo = {
  vb: [760, 210],
  vertical: false,
  a: [56, 130],
  b: [716, 130],
  labels: {
    zagreb: { at: [56, 184], anchor: 'middle' },
    split: { at: [116, 58], anchor: 'start', leader: true },
    frankfurt: { at: [170, 92], anchor: 'start', leader: true },
    ashburn: { at: [362, 58], anchor: 'middle', leader: true },
    sydney: { at: [716, 190], anchor: 'end' },
  },
  ticks: { at: [0, 160], anchor: 'middle' },
  font: { hand: 21, mono: 15 },
}

const TALL: RulerGeo = {
  vb: [360, 470],
  vertical: true,
  a: [86, 40],
  b: [86, 440],
  labels: {
    zagreb: { at: [110, 30], anchor: 'start' },
    split: { at: [170, 72], anchor: 'start', leader: true },
    frankfurt: { at: [170, 108], anchor: 'start', leader: true },
    ashburn: { at: [110, 222], anchor: 'start' },
    sydney: { at: [110, 446], anchor: 'start' },
  },
  ticks: { at: [72, 0], anchor: 'end' },
  font: { hand: 21, mono: 15 },
}

function along(g: RulerGeo, km: number): Pt {
  const f = km / MAX_KM
  return [g.a[0] + (g.b[0] - g.a[0]) * f, g.a[1] + (g.b[1] - g.a[1]) * f]
}

function RulerStage({ place, trips, narrow }: { place: Place; trips: number; narrow: boolean }) {
  const g = narrow ? TALL : WIDE
  const ids = diagramIds(`l01ruler${narrow ? 'n' : 'w'}`)
  const rtt = PLACES[place].rtt
  const oneWay = ((rtt / 2) * SLOW) / 1000
  const total = oneWay * 2 * trips
  const t = useElapsed(total, 0.3)
  const leg = Math.min(trips * 2 - 1, Math.floor(t / oneWay))
  const f = Math.min(1, (t - leg * oneWay) / oneWay)
  const done = t >= total - 1e-6
  const target = along(g, PLACES[place].km)
  const out = leg % 2 === 0
  const pos: Pt = done ? g.a : out ? [g.a[0] + (target[0] - g.a[0]) * f, g.a[1] + (target[1] - g.a[1]) * f] : [target[0] + (g.a[0] - target[0]) * f, target[1] + (g.a[1] - target[1]) * f]
  const trip = Math.min(trips - 1, Math.floor(leg / 2))
  const label = trips === 1 ? (out ? 'SYN' : 'SYN-ACK') : `${TRIP_LABEL[trip]}${out ? '' : ' ✓'}`
  const realMs = Math.min(rtt * trips, (t / (SLOW / 1000)))
  const ticks = [4000, 8000, 12000, 16000]
  return (
    <svg viewBox={`0 0 ${g.vb[0]} ${g.vb[1]}`} role="img" aria-label={`Ravnalo udaljenosti od Zagreba. ${PLACES[place].label}: ${fmtKm(PLACES[place].km)} km, povratno putovanje najmanje ${fmtMs(rtt)}.`} style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}>
      <DiagramDefs id={ids.id} />
      {/* the ruler */}
      <Rough shape={{ k: 'line', x1: g.a[0], y1: g.a[1], x2: g.b[0], y2: g.b[1] }} seed={9501} strokeWidth={2} />
      {[0, ...ticks].map((km, i) => {
        const p = along(g, km)
        const tick = g.vertical ? { x1: p[0] - 7, y1: p[1], x2: p[0] + 7, y2: p[1] } : { x1: p[0], y1: p[1] - 7, x2: p[0], y2: p[1] + 7 }
        return (
          <g key={km}>
            <Rough shape={{ k: 'line', ...tick }} seed={9510 + i} strokeWidth={1.5} />
            {km > 0 && (
              <text
                x={g.vertical ? g.ticks.at[0] : p[0]}
                y={g.vertical ? p[1] + 5 : g.ticks.at[1]}
                textAnchor={g.ticks.anchor}
                className="k-svg-mono"
                style={{ fontSize: g.font.mono, fill: 'var(--ink-3)' }}
              >
                {fmtKm(km)}
                {km === 16000 && !g.vertical ? ' km' : ''}
              </text>
            )}
          </g>
        )
      })}
      {/* the route there and back */}
      <Rough key={place} shape={{ k: 'line', x1: g.a[0], y1: g.a[1], x2: target[0], y2: target[1] }} seed={9530} strokeWidth={3} stroke="var(--pen)" dash="7 6" roughness={0.6} />
      {/* city pins and labels */}
      {(['zagreb', ...CITIES] as (Place | 'zagreb')[]).map((c, i) => {
        const p = c === 'zagreb' ? g.a : along(g, PLACES[c].km)
        const L = g.labels[c]
        const on = c === place
        const name = c === 'zagreb' ? 'Zagreb (Petra)' : PLACES[c].label
        return (
          <g key={c}>
            {L.leader && <Rough shape={{ k: 'lin', pts: [p, [L.at[0] - 4, L.at[1] + (g.vertical ? -6 : 6)]] }} seed={9540 + i} strokeWidth={1.1} stroke="var(--ink-3)" />}
            <Rough shape={{ k: 'ellipse', cx: p[0], cy: p[1], w: 9, h: 9 }} seed={9550 + i} strokeWidth={1.6} stroke={on || c === 'zagreb' ? 'var(--red)' : 'var(--ink-2)'} fillColor={on || c === 'zagreb' ? 'var(--red)' : 'var(--paper)'} fillStyle="solid" />
            <text x={L.at[0]} y={L.at[1]} textAnchor={L.anchor} className="k-svg-hand k-dhalo" style={{ fontSize: g.font.hand, fill: on ? 'var(--pen)' : 'var(--ink-2)', fontWeight: on ? 700 : 600 }}>
              {name}
            </text>
          </g>
        )
      })}
      <TraySprite x={pos[0]} y={pos[1] - (g.vertical ? 0 : 22)} w={34} tone={done ? 'ok' : out ? 'req' : 'ok'} label={done ? undefined : label} size={g.font.hand} trayHref={ids.tray} labelDy={-24} />
      <text x={g.vertical ? 250 : 716} y={g.vertical ? 300 : 30} textAnchor="end" className="k-svg-mono" style={{ fontSize: g.font.mono + 3, fontWeight: 600 }}>
        {fmtMs(realMs)}
      </text>
      <text x={g.vertical ? 250 : 716} y={g.vertical ? 324 : 54} textAnchor="end" className="k-svg-hand" style={{ fontSize: g.font.hand, fill: 'var(--ink-2)' }}>
        {g.vertical ? 'donja granica' : `donja granica · usporeno ${SLOW}×`}
      </text>
      {g.vertical && (
        <text x={250} y={348} textAnchor="end" className="k-svg-hand" style={{ fontSize: g.font.hand, fill: 'var(--ink-2)' }}>
          usporeno {SLOW}×
        </text>
      )}
    </svg>
  )
}

export function DistanceRuler() {
  const [place, setPlace] = useState<Place>('frankfurt')
  const [trips, setTrips] = useState(1)
  const [shot, setShot] = useState(1)
  const [ref, w] = useWidth<HTMLDivElement>()
  const narrow = w !== null && w < WIDE_MIN
  const rtt = PLACES[place].rtt
  const km = PLACES[place].km
  return (
    <SimFrame
      title="udaljenost je latencija"
      subtitle="Ravnalo je u mjerilu: od Zagreba do Sydneya 16 028 km zračne linije. Pladanj putuje brzinom svjetlosti u optičkom vlaknu, usporeno 20× – jednako za svaki grad."
      hint="pošaljite jedno povratno putovanje do Frankfurta, pa do Sydneya. Zatim odaberite novu HTTPS vezu: tri povratna putovanja prije prvog bajta."
      minHeight={200}
      controls={
        <>
          <Segmented
            label="Poslužitelj je u"
            size="sm"
            value={place}
            options={CITIES.map((c) => ({ value: c, label: PLACES[c].label.replace(' (SAD)', '') }))}
            onChange={(v) => {
              setPlace(v)
              setShot((n) => n + 1)
            }}
          />
          <Segmented
            label="Što šaljemo"
            size="sm"
            value={trips}
            options={[
              { value: 1, label: '1 povratno putovanje' },
              { value: 3, label: 'nova HTTPS veza (3 RTT)' },
            ]}
            onChange={(v) => {
              setTrips(v)
              setShot((n) => n + 1)
            }}
          />
          <Button variant="primary" size="sm" icon={Play} onClick={() => setShot((n) => n + 1)}>
            Pošalji ponovno
          </Button>
        </>
      }
      stats={
        <>
          <StatRow>
            <Stat label="udaljenost" value={fmtKm(km)} unit="km" sub="zračnom linijom" />
            <Stat label="RTT, donja granica" value={fmtMs(rtt)} sub="stvarni je veći" />
            <Stat label="nova HTTPS veza ≥" value={fmtMs(3 * rtt)} sub="TCP + TLS 1.3 + HTTP" tone={3 * rtt > 200 ? 'warn' : 'neutral'} />
          </StatRow>
          <p className={styles.formula}>
            2 × {fmtKm(km)} km ÷ {fmtKm(200000)} km/s ≈ {fmtMs(rtt)} <span>· svjetlost u vlaknu: ≈ 1 ms povratnog puta na svakih 100 km</span>
          </p>
        </>
      }
    >
      <div ref={ref} className={styles.stageWrap}>
        <div style={narrow ? { maxWidth: 460, width: '100%', margin: '0 auto' } : undefined}>
          <RulerStage key={shot} place={place} trips={trips} narrow={narrow} />
        </div>
      </div>
    </SimFrame>
  )
}
