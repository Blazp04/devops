import { useState } from 'react'
import { Burst, Diagram, PodShape, Rough, Stepper, stepColor, useDiagramIds, useWidth } from '../../../kit'
import { leakyRun, type LeakyRun } from '../lib/model'
import styles from '../styles.module.css'

const STEPS = [
  { title: 'Memorija raste', body: 'Pod leaky troši 100Mi i curi 5 Mi/s. Limit memorije mu je 256Mi. Dok je ispod limita, ništa se ne događa – memorija se ne može „usporiti” kao procesor.' },
  { title: 'Limit: OOMKilled, izlazni kod 137', body: 'Čim kontejner prijeđe 256Mi, jezgra operacijskog sustava (kontrolna grupa, cgroup) ubija proces signalom SIGKILL: 128 + 9 = izlazni kod 137. Razlog u Podu: OOMKilled.' },
  { title: 'Kubelet ga ponovno pokreće', body: 'Kubelet pokreće isti kontejner u istom Podu (restartPolicy: Always). Memorija kreće od 100Mi – i curi dalje, jer je greška u kodu.' },
  { title: 'CrashLoopBackOff', body: 'Svaki sljedeći pokušaj kubelet odgađa sve dulje: 10 s, 20 s, 40 s … do 5 minuta. Susjedi na čvoru to ne osjete – kažnjen je samo Pod koji je prešao svoj limit.' },
]

interface Geo {
  W: number
  H: number
  x0: number
  x1: number
  yTop: number
  yBot: number
  font: { mono: number; hand: number }
  narrow: boolean
}

function geoFor(width: number | null): Geo {
  // wide lettering is 13,5 units in a 760 viewBox: ≥ 12 px on screen only from 700 px up
  if (width !== null && width < 700) return { W: 380, H: 300, x0: 50, x1: 368, yTop: 70, yBot: 236, font: { mono: 14, hand: 20.5 }, narrow: true }
  return { W: 760, H: 280, x0: 80, x1: 740, yTop: 60, yBot: 220, font: { mono: 13.5, hand: 20 }, narrow: false }
}

function Chart({ run, step, g }: { run: LeakyRun; step: number; g: Geo }) {
  const ids = useDiagramIds()
  const tMax = run.end
  const tEnd = step === 0 ? run.ooms[0] - 0.4 : step === 1 ? run.ooms[0] + 0.6 : step === 2 ? run.ooms[1] - 2 : tMax
  const memMax = 300
  const X = (t: number) => g.x0 + (t / tMax) * (g.x1 - g.x0)
  const Y = (m: number) => g.yBot - (m / memMax) * (g.yBot - g.yTop)
  const pts = run.samples.filter((p) => p.t <= tEnd)
  // split into runs (memory 0 = no process)
  const lines: string[] = []
  let cur: string[] = []
  for (const p of pts) {
    if (p.mem <= 0) {
      if (cur.length > 1) lines.push(cur.join(' '))
      cur = []
    } else cur.push(`${X(p.t).toFixed(1)},${Y(p.mem).toFixed(1)}`)
  }
  if (cur.length > 1) lines.push(cur.join(' '))
  const ooms = run.ooms.filter((t) => t <= tEnd)
  const restarts = run.restarts.filter((t) => t <= tEnd)
  // a wait is finished when its restart happened before tEnd; the last one may still be running at the end of the run
  const waits = ooms.map((o, i) => ({ from: o, to: run.restarts[i] !== undefined && run.restarts[i] <= tEnd ? run.restarts[i] : tEnd, done: run.restarts[i] !== undefined && run.restarts[i] <= tEnd })).filter((w) => w.from <= tEnd)
  const prevWait = (i: number) => (i > 0 && waits[i - 1].done ? waits[i - 1].to - waits[i - 1].from : 0)
  const last = pts[pts.length - 1]
  const crash = step === 3
  return (
    <g>
      {/* axes */}
      <Rough shape={{ k: 'lin', pts: [[g.x0, g.yTop - 10], [g.x0, g.yBot], [g.x1, g.yBot]] }} seed={1761} stroke="var(--ink-2)" strokeWidth={1.4} />
      {[0, 60, 120, 180, 240].filter((t) => t <= tMax).map((t) => (
        <text key={t} x={X(t)} y={g.yBot + 20} textAnchor={X(t) > g.x1 - 20 ? 'end' : 'middle'} className={styles.svgMono} style={{ fontSize: g.font.mono, fill: 'var(--ink-2)' }}>
          {t} s
        </text>
      ))}
      <text x={g.x0 - 8} y={Y(100) + 5} textAnchor="end" className={styles.svgMono} style={{ fontSize: g.font.mono, fill: 'var(--ink-2)' }}>
        100Mi
      </text>
      {/* the limit */}
      <line x1={g.x0} y1={Y(run.limitMi)} x2={g.x1} y2={Y(run.limitMi)} style={{ stroke: 'var(--red)', strokeWidth: 2, strokeDasharray: '6 4' }} />
      <text x={g.narrow ? g.x1 : g.x0 - 8} y={g.narrow ? Y(run.limitMi) - 8 : Y(run.limitMi) + 5} textAnchor="end" className={styles.svgMono} style={{ fontSize: g.font.mono, fill: 'var(--red)' }}>
        {g.narrow ? 'limit 256Mi' : '256Mi'}
      </text>
      {/* back-off waits */}
      {step >= 2 &&
        waits.map((w, i) => (
          <g key={i}>
            <rect x={X(w.from)} y={g.yTop} width={Math.max(0, X(Math.min(w.to, tEnd)) - X(w.from))} height={g.yBot - g.yTop} style={{ fill: ids ? `url(${ids.hatch})` : 'none', opacity: 0.6 }} />
            {crash && i > 0 && w.done && X(w.to) - X(w.from) > 26 && (
              <text x={(X(w.from) + X(w.to)) / 2} y={g.yTop + (g.narrow ? 40 : 18)} textAnchor="middle" className={styles.svgMono} style={{ fontSize: g.font.mono, fill: 'var(--ink)', paintOrder: 'stroke', stroke: 'var(--paper)', strokeWidth: 3 }}>
                {Math.round(w.to - w.from)} s
              </text>
            )}
            {crash && !w.done && prevWait(i) > 0 && (
              <text x={g.x1} y={g.yTop + (g.narrow ? 62 : 18)} textAnchor="end" className={styles.svgHand} style={{ fontSize: g.font.hand, fill: 'var(--ink-2)' }}>
                čeka {Math.round(prevWait(i) * 2)} s →
              </text>
            )}
          </g>
        ))}
      {/* memory (food on the plate) */}
      {lines.map((l, i) => (
        <polyline key={i} points={l} style={{ fill: 'none', stroke: 'var(--food)', strokeWidth: 3, strokeLinejoin: 'round' }} />
      ))}
      {ooms.map((t, i) => (
        <g key={t}>
          <Burst cx={X(t)} cy={Y(run.limitMi)} r={step === 1 && i === 0 ? 16 : 10} seed={1770 + i} />
        </g>
      ))}
      {restarts.map((t) => (
        <text key={t} x={X(t)} y={Y(100) + 26} textAnchor="middle" className={styles.svgHand} style={{ fontSize: g.font.hand, fill: 'var(--pen)' }}>
          ↻
        </text>
      ))}
      {/* the Pod itself */}
      <PodShape
        x={g.narrow ? 30 : 36}
        y={g.narrow ? 30 : 30}
        size={28}
        status={crash ? 'crash' : step === 1 ? 'oom' : 'running'}
        tone="blue"
        restarts={crash ? restarts.length : undefined}
      />
      <text x={g.narrow ? 56 : 62} y={g.narrow ? 36 : 36} className={styles.svgMono} style={{ fontSize: g.font.mono }}>
        leaky · {crash ? `CrashLoopBackOff · ↻ ${restarts.length}` : step === 1 ? 'OOMKilled · izlazni kod 137' : last ? `${Math.round(last.mem)}Mi` : ''}
      </text>
      {step === 1 && (
        <text x={X(run.ooms[0]) + 20} y={Y(run.limitMi) - 14} className={styles.svgHand} style={{ fontSize: g.font.hand, fill: stepColor(1) }}>
          ② 137 = 128 + 9 (SIGKILL)
        </text>
      )}
      {step === 2 && (
        <text x={X(run.restarts[0]) + 8} y={Y(100) + 54} className={styles.svgHand} style={{ fontSize: g.font.hand, fill: stepColor(2) }}>
          ③ isti Pod, novi proces
        </text>
      )}
    </g>
  )
}

/** Scene 4 (memory): leaky climbs to its limit, gets OOMKilled (137), restarts, ends in CrashLoopBackOff – engine run. */
export function OomStepper() {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [run] = useState(() => leakyRun(240))
  const g = geoFor(width)
  return (
    <div ref={ref}>
      <Stepper wide title="Memorija preko limita" steps={STEPS} caption="Krivulja je izračunata simulatorom klastera: 100Mi + 5 Mi/s, limit 256Mi, stvarne pauze CrashLoopBackOffa (10 s, 20 s, 40 s …).">
        {(step) => (
          <div className={g.narrow ? styles.stageNarrow : undefined}>
            <Diagram width={g.W} height={g.H} label={`Memorija Poda leaky kroz ${Math.round(run.end)} sekundi: raste do limita 256Mi, OOMKilled u ${run.ooms.map((t) => Math.round(t)).join(', ')}. sekundi, ponovna pokretanja sa sve duljim pauzama. Korak ${step + 1}: ${STEPS[step].title}.`}>
              <Chart run={run} step={step} g={g} />
            </Diagram>
          </div>
        )}
      </Stepper>
    </div>
  )
}
