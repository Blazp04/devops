import { Check, Cross, Diagram, DLabel, Rough, Stepper, useWidth } from '../../../kit'
import { READY_AT } from '../model'
import { apiTimeline, AXIS, type Seg } from '../readyTimeline'
import { Fade } from './Drawn'

const CRASH_AT = 8.5

const STEPS = [
  {
    title: 'Samo redoslijed',
    body: (
      <>
        <code>depends_on: [db]</code> kaže samo da se <code>db</code> pokreće prvi. API krene pola sekunde kasnije, pri pokretanju pita bazu – a Postgres se još inicijalizira. <code>Connection refused</code> – API se ugasi i ostaje ugašen.
      </>
    ),
  },
  {
    title: 'restart pomaže – nespretno',
    body: (
      <>
        S <code>restart: unless-stopped</code> Docker ponovno pokreće API, sa sve duljom stankom. Nakon dva pada API uspije. Radi, ali logovi su puni grešaka, a „uspjeh” ovisi o sreći s vremenom.
      </>
    ),
  },
  {
    title: 'Provjera ispravnosti',
    body: (
      <>
        Bazi dodajemo provjeru ispravnosti (<code>healthcheck</code> s <code>pg_isready</code>), a API-ju <code>condition: service_healthy</code>. API čeka u stanju <code>Created</code> dok baza ne postane <code>healthy</code> – i spoji se iz prve.
      </>
    ),
  },
  {
    title: 'Pad usred rada',
    body: (
      <>
        Ako API padne usred rada, <code>restart: unless-stopped</code> ga digne nakon kratke stanke. Ali samo na <strong>ovom</strong> računalu: pravilo ponovnog pokretanja ne zna ni za jedno drugo.
      </>
    ),
  },
]

interface Geo {
  W: number
  H: number
  x0: number
  x1: number
  dbY: number
  apiY: number
  checkY: number
  axisY: number
  bar: number
  mono: number
  hand: number
  laneX: number
  labels: boolean
}

const WIDE: Geo = { W: 720, H: 300, x0: 128, x1: 700, dbY: 96, apiY: 190, checkY: 52, axisY: 262, bar: 30, mono: 13.5, hand: 13.5, laneX: 12, labels: true }
const NARROW: Geo = { W: 340, H: 320, x0: 56, x1: 330, dbY: 100, apiY: 196, checkY: 56, axisY: 284, bar: 28, mono: 13, hand: 13, laneX: 4, labels: false }

const FILL: Record<Seg['kind'], { fill?: string; stroke: string; dash?: string }> = {
  wait: { stroke: 'var(--ink-3)', dash: '5 4' },
  start: { fill: 'var(--hl-orange-ink)', stroke: 'var(--ink-2)' },
  up: { fill: 'var(--hl-green-ink)', stroke: 'var(--green)' },
  pause: { stroke: 'var(--orange)', dash: '3 4' },
  exited: { stroke: 'var(--red)', dash: '6 5' },
}

function Bar({ seg, G, y, i, wide }: { seg: Seg; G: Geo; y: number; i: number; wide: boolean }) {
  const sx = (t: number) => G.x0 + ((G.x1 - G.x0) * t) / AXIS
  const x = sx(seg.from)
  const w = Math.max(2, sx(seg.to) - x)
  const st = FILL[seg.kind]
  const cy = y + G.bar / 2
  const showLabel = seg.label && (wide ? w > seg.label.length * 7.5 : w > seg.label.length * 7.4)
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h: G.bar }} seed={3700 + i * 7 + Math.round(seg.from * 10)} stroke={st.stroke} strokeWidth={1.4} fillColor={st.fill} hachureGap={5} dash={st.dash} roughness={0.9} />
      {showLabel && (
        <text x={x + w / 2} y={cy + 5} textAnchor="middle" className="k-svg-mono k-dhalo" style={{ fontSize: G.mono - 1, fill: seg.kind === 'exited' ? 'var(--red)' : 'var(--ink)', fontWeight: 600 }}>
          {seg.label}
        </text>
      )}
      {!showLabel && seg.kind === 'pause' && (
        <text x={x + w / 2} y={y + G.bar + G.mono + 3} textAnchor="middle" className="k-svg-mono" style={{ fontSize: G.mono - 1, fill: 'var(--orange)', fontWeight: 600 }}>
          {seg.label}
        </text>
      )}
      {seg.end === 'fail' && <Cross x={sx(seg.to)} y={y - 2} size={12} />}
      {seg.end === 'crash' && <Cross x={sx(seg.to)} y={y - 2} size={14} />}
      {seg.end === 'ok' && <Check x={sx(seg.from + 1)} y={y - 4} size={13} />}
    </g>
  )
}

function Drawing({ step, G, wide }: { step: number; G: Geo; wide: boolean }) {
  const sx = (t: number) => G.x0 + ((G.x1 - G.x0) * t) / AXIS
  const healthy = step >= 2
  const segs = apiTimeline(healthy, step >= 1, step === 3 ? CRASH_AT : undefined)
  const dbReady = READY_AT.db
  const ticks = Array.from({ length: AXIS + 1 }, (_, i) => i)
  return (
    <Diagram width={G.W} height={G.H} label={`Korak ${step + 1}: ${STEPS[step].title}. Baza je spremna nakon ${dbReady} s.`}>
      {/* time axis */}
      <Rough shape={{ k: 'line', x1: G.x0, y1: G.axisY, x2: G.x1, y2: G.axisY }} seed={3751} strokeWidth={1.4} stroke="var(--ink-2)" />
      {ticks.map((t) => (
        <g key={t}>
          <line x1={sx(t)} y1={G.axisY - 4} x2={sx(t)} y2={G.axisY + 4} style={{ stroke: 'var(--ink-3)', strokeWidth: 1.2 }} />
          {(t % (wide ? 1 : 2) === 0 || t === 5) && (
            <text x={sx(t)} y={G.axisY + G.mono + 6} textAnchor={t === AXIS ? 'end' : 'middle'} className="k-svg-mono" style={{ fontSize: G.mono - 1, fill: 'var(--ink-2)' }}>
              {t === AXIS ? `${t} s` : t}
            </text>
          )}
        </g>
      ))}
      <DLabel x={G.x1} y={G.axisY - 10} text="vrijeme (sim)" size={G.hand} anchor="end" tone="neutral" />
      {/* the moment the database is ready */}
      <line x1={sx(dbReady)} y1={G.checkY - 14} x2={sx(dbReady)} y2={G.axisY} style={{ stroke: 'var(--green)', strokeWidth: 1.3, strokeDasharray: '4 4' }} />

      {/* lanes */}
      <text x={G.laneX} y={G.dbY + G.bar / 2 + 5} className="k-svg-mono" style={{ fontSize: G.mono + 1, fontWeight: 700 }}>
        db
      </text>
      <text x={G.laneX} y={G.apiY + G.bar / 2 + 5} className="k-svg-mono" style={{ fontSize: G.mono + 1, fontWeight: 700 }}>
        api
      </text>
      <Bar seg={{ from: 0, to: dbReady, kind: 'start', label: wide ? 'pokreće se (initdb)' : 'pokreće se' }} G={G} y={G.dbY} i={0} wide={wide} />
      {/* without a healthcheck nobody checks readiness: docker ps shows just „Up” */}
      <Bar seg={{ from: dbReady, to: AXIS, kind: 'up', label: healthy ? (wide ? 'spreman · healthy' : 'healthy') : wide ? 'spreman (Up) · bez provjere' : 'spreman (Up)' }} G={G} y={G.dbY} i={1} wide={wide} />
      {segs.map((s, i) => (
        <Bar key={`${step}-${i}`} seg={s} G={G} y={G.apiY} i={i + 2} wide={wide} />
      ))}

      {/* the health checks (pg_isready) — only when there is a healthcheck */}
      <Fade show={healthy}>
        <text x={wide ? G.laneX : G.x0} y={wide ? G.checkY + 5 : G.checkY - 16} className="k-svg-mono" style={{ fontSize: G.mono - 1, fill: 'var(--pen)', fontWeight: 600 }}>
          pg_isready{wide ? '' : ' (provjera ispravnosti)'}
        </text>
        {[1, 2, 3, 4].map((t) => (
          <Cross key={t} x={sx(t)} y={G.checkY} size={9} />
        ))}
        <Check x={sx(dbReady)} y={G.checkY - 2} size={13} />
        {/* start_interval applies only while the status is „starting”; after that the checks run every `interval` */}
        <DLabel x={sx(dbReady) + 18} y={G.checkY + 5} text="dalje svakih 10 s" size={G.hand} anchor="start" tone="blue" />
      </Fade>
      <Fade show={step === 3}>
        <DLabel x={sx(CRASH_AT) - 4} y={G.apiY - 16} text="pad!" size={G.hand} anchor="end" tone="bad" bold />
      </Fade>
    </Diagram>
  )
}

/** Scene 5: started is not ready — depends_on, healthcheck + service_healthy, restart policy. */
export function ReadyStepper() {
  const [ref, w] = useWidth<HTMLDivElement>()
  // wide lettering (12,5 units) stays ≥ 12 px only from 692 px up (720 × 12 / 12,5)
  const wide = w === null || w >= 692
  const G = wide ? WIDE : NARROW
  return (
    <div ref={ref}>
      <Stepper title="Pokrenut nije isto što i spreman" steps={STEPS} autoPlay={0} caption="Vrijeme je prilagođeno (sim): Postgres je spreman za 5 s, a stanke prije ponovnog pokretanja su 1 i 2 s (stvarno: Docker kreće od 100 ms i udvostručuje).">
        {(step) => (
          <div style={{ maxWidth: wide ? 760 : 460, margin: '0 auto' }}>
            <Drawing step={step} G={G} wide={wide} />
          </div>
        )}
      </Stepper>
    </div>
  )
}
