import { useEffect } from 'react'
import { Button, Diagram, EventLog, Goals, PodShape, Rough, SimFrame, Stat, StatRow, Toggle, useSimulation, useWidth } from '../../../kit'
import { createAccessPreset, podView, restartPods, rotateSecret, setAnimationScale, setAppRereads, step, TIMING } from '../../../engines/access/index.ts'
import type { AccessState } from '../../../engines/access/index.ts'
import { LANES, laneSegments, podTone } from '../lib/timeline'
import styles from '../styles.module.css'

interface Geo {
  w: number
  h: number
  x0: number
  x1: number
  top: number
  gap: number
  font: number
  hand: number
  pod: number
}

const WIDE: Geo = { w: 720, h: 300, x0: 176, x1: 700, top: 64, gap: 74, font: 14, hand: 20, pod: 44 }
const NARROW: Geo = { w: 400, h: 350, x0: 128, x1: 388, top: 74, gap: 86, font: 16, hand: 22, pod: 50 }

/** Hatch per password version: odd versions blue (−41°), even versions green (+41°) – so v2 and v3 differ. */
const hatchOf = (v: number) => (v % 2 === 1 ? { fillColor: 'var(--hl-blue-ink)', hachureAngle: -41 } : { fillColor: 'var(--hl-green-ink)', hachureAngle: 41 })

/** Quantize a growing x so the pen paths are regenerated only every few units, not every frame. */
const q = (x: number) => Math.round(x / 4) * 4

function Lanes({ s, g }: { s: AccessState; g: Geo }) {
  const now = s.t
  // the scale changes only every 10 s of simulated time (pen paths stay put in between)
  const tMax = Math.max(40, Math.ceil((now + 4) / 10) * 10)
  const X = (t: number) => g.x0 + ((g.x1 - g.x0) * t) / tMax
  const pods = podView(s)
  const current = s.secrets[0].current
  const rotated = s.marks.filter((m) => m.kind === 'rotated')
  const tickStep = tMax > 160 ? 40 : tMax > 80 ? 20 : 10
  const ticks: number[] = []
  for (let t = 0; t <= tMax; t += tickStep) ticks.push(t)
  const axisY = g.h - 30
  return (
    <>
      {/* time axis (simulated time: the kubelet sync is compressed) */}
      <Rough shape={{ k: 'line', x1: g.x0, y1: axisY, x2: g.x1, y2: axisY }} seed={2801} stroke="var(--ink-3)" strokeWidth={1.2} />
      {ticks.map((t) => (
        <g key={t}>
          <Rough shape={{ k: 'line', x1: X(t), y1: axisY - 4, x2: X(t), y2: axisY + 4 }} seed={2810 + t} stroke="var(--ink-3)" strokeWidth={1.2} />
          <text x={X(t)} y={g.h - 10} textAnchor={X(t) > g.x1 - 24 ? 'end' : 'middle'} className="k-svg-mono" style={{ fontSize: g.font - 1, fill: 'var(--ink-2)' }}>
            {t} s
          </text>
        </g>
      ))}
      <text x={g.x0 - 18} y={g.h - 10} textAnchor="end" className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--ink-2)' }}>
        vrijeme (sim)
      </text>
      {LANES.map((lane, i) => {
        const y = g.top + i * g.gap
        const segs = laneSegments(s, lane.id)
        const lanePods = pods.filter((p) => p.workloadId === lane.id).slice(0, 2)
        const last = segs[segs.length - 1]
        const behind = rotated.length > 0 && last.version < current
        // the kubelet already wrote the new file, but the app never read it again
        const fileMark = lane.id === 'volume' ? s.marks.find((m) => m.workloadId === 'volume' && m.kind === 'file' && m.version === current) : undefined
        const unread = behind && fileMark !== undefined
        const note = lane.id === 'subpath' ? 'subPath: nikad sam' : lane.id === 'env' ? 'čeka ponovno pokretanje' : unread ? 'aplikacija je ne čita' : 'čeka sinkronizaciju'
        return (
          <g key={lane.id}>
            <text x={8} y={y - 12} className="k-svg-display" style={{ fontSize: g.font + 1, fontWeight: 800 }}>
              {lane.title}
            </text>
            {lanePods.map((p, k) => (
              <PodShape key={p.id} x={g.x0 - g.pod * 0.75 - k * g.pod * 0.9} y={y + 26} size={g.pod} status={p.kitStatus} tone={podTone(p)} label={p.usesVersion === null ? '–' : `v${p.usesVersion}`} ariaLabel={`Pod ${p.id}: ${p.label}, lozinka v${p.usesVersion ?? '–'}`} />
            ))}
            {segs.map((sg, k) => {
              const xa = q(X(sg.from))
              const xb = sg.to === null ? q(X(now)) : q(X(sg.to))
              if (xb - xa < 2) return null
              return (
                <g key={k}>
                  <Rough shape={{ k: 'rect', x: xa, y: y - 10, w: xb - xa, h: 22 }} seed={2830 + i * 17 + k} stroke="var(--ink-2)" strokeWidth={1.3} {...hatchOf(sg.version)} />
                  {xb - xa > 34 && (
                    <text x={xa + 6} y={y + 6} className="k-svg-mono k-dhalo" style={{ fontSize: g.font - 1, fontWeight: 700 }}>
                      v{sg.version}
                    </text>
                  )}
                </g>
              )
            })}
            {fileMark && behind && (
              <g>
                <Rough shape={{ k: 'line', x1: X(fileMark.t), y1: y - 16, x2: X(fileMark.t), y2: y + 18 }} seed={2860} stroke="var(--green)" strokeWidth={1.6} />
                <text x={X(fileMark.t)} y={y - 20} textAnchor="middle" className="k-svg-mono k-dhalo" style={{ fontSize: g.font - 1, fill: 'var(--green)', fontWeight: 600 }}>
                  datoteka v{current}
                </text>
              </g>
            )}
            {behind && (
              <text x={X(now) + 6 + note.length * g.hand * 0.42 > g.w - 4 ? Math.min(X(now) - 6, g.x1 - 4) : X(now) + 6} y={y + 30} textAnchor={X(now) + 6 + note.length * g.hand * 0.42 > g.w - 4 ? 'end' : 'start'} className="k-svg-hand k-dhalo" style={{ fontSize: g.hand, fill: 'var(--red)' }}>
                {note}
              </text>
            )}
          </g>
        )
      })}
      {rotated.map((m, k) => (
        <g key={k}>
          <Rough shape={{ k: 'line', x1: X(m.t), y1: g.top - 34, x2: X(m.t), y2: axisY }} seed={2870 + k} stroke="var(--red)" strokeWidth={1.6} dash="5 4" />
          <text x={X(m.t) + 4} y={g.top - 38} textAnchor={X(m.t) > g.x1 - 140 ? 'end' : 'start'} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--red)' }}>
            {`nova lozinka v${m.version}`}
          </text>
        </g>
      ))}
      <line x1={X(now)} y1={g.top - 20} x2={X(now)} y2={axisY} style={{ stroke: 'var(--pen)', strokeWidth: 1.3 }} />
    </>
  )
}

/** Scene „Kada aplikacija vidi promjenu”: one Secret, three Pods (env / volume / subPath), engine preset l16-timeline. */
export function UpdateTimeline() {
  const sim = useSimulation<AccessState>({ init: () => createAccessPreset('l16-timeline'), step: (st, dt) => step(st, dt) })
  const { mutate, speed } = sim
  useEffect(() => mutate((st) => setAnimationScale(st, speed)), [mutate, speed])
  const [ref, width] = useWidth<HTMLDivElement>()
  const g = width === null || width >= Math.ceil((WIDE.w * 12) / (WIDE.font - 1)) ? WIDE : NARROW
  const s = sim.state
  const current = s.secrets[0].current
  const uses = (id: string) => podView(s).find((p) => p.workloadId === id && p.kitStatus === 'running')?.usesVersion ?? null
  const rotatedOnce = current > 1
  const allNew = rotatedOnce && LANES.every((l) => uses(l.id) === current)
  return (
    <SimFrame
      title="Tri Poda, jedna promjena"
      subtitle="isti Secret klopa-db · preset l16-timeline"
      sim={sim}
      showTime
      hint="Promijenite lozinku i gledajte koja traka prijeđe na v2 sama. Zatim dovedite i ostale Podove na novu lozinku."
      controls={
        <>
          <Button
            variant="primary"
            onClick={() =>
              mutate((st) => {
                rotateSecret(st)
              })
            }
          >
            Promijeni lozinku
          </Button>
          <Button title="kubectl rollout restart" onClick={() => mutate((st) => restartPods(st))}>
            Ponovno pokreni Podove
          </Button>
          <Toggle label="Aplikacija ponovno čita datoteku" checked={s.config.appRereadsFiles} hint="bez toga ni nova datoteka ne pomaže" onChange={(on) => mutate((st) => setAppRereads(st, on))} />
          <p className={styles.ctlNote}>Datoteka u volumenu: {TIMING.kubeletSync.label}.</p>
          {!sim.running && rotatedOnce && !allNew && <p className={styles.ctlNote}>Simulacija stoji – pokrenite je da vrijeme teče.</p>}
        </>
      }
      stats={
        <>
          <StatRow>
            {LANES.map((l) => {
              const v = uses(l.id)
              return <Stat key={l.id} label={l.title} value={v === null ? '–' : `v${v}`} tone={v === current ? 'ok' : 'warn'} sub={v === null ? 'Pod se pokreće' : v === current ? 'nova lozinka' : 'stara lozinka'} />
            })}
          </StatRow>
          <div className={styles.statsGrid}>
            <Goals
              goals={[
                { text: 'Promijenite lozinku', done: rotatedOnce },
                { text: 'Dočekajte da Pod s volumenom prijeđe na novu lozinku', done: rotatedOnce && uses('volume') === current },
                { text: 'Dovedite sva tri Poda na novu lozinku', done: allNew },
              ]}
            />
            <EventLog events={s.events.map((e) => ({ id: e.id, t: e.t, text: e.text, tone: e.tone }))} />
          </div>
        </>
      }
    >
      <div ref={ref}>
        <div style={g === NARROW ? { maxWidth: 460, margin: '0 auto' } : undefined}>
          <Diagram width={g.w} height={g.h} label={`Vremenska crta: koja verzija lozinke se koristi u Podu s varijablom okruženja, s volumenom i sa subPath. Trenutačna lozinka: v${current}.`}>
            <Lanes s={s} g={g} />
          </Diagram>
        </div>
      </div>
    </SimFrame>
  )
}
