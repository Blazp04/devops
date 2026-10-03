import { useState } from 'react'
import { Badge, Diagram, EventLog, LineChart, Segmented, SimFrame, plural, useSimulation, useWidth } from '../../../kit'
import { releaseStats } from '../../../engines/cluster'
import { CANARY_KINDS, CANARY_START, createCanaryLab, engineLog, stepCanaryLab } from '../lib/labs'
import { dec } from '../lib/labels'
import { GEOM } from '../lib/lane-view'
import { LaneDrawing } from './LaneDrawing'
import styles from '../styles.module.css'

const NAME = { replicas: 'Po replikama: 4 stabilna + k canary Podova', weights: 'Po težinama: HTTPRoute (5 → 25 → 50 %)' } as const

/** Scene 4b: the same canary steps by replica ratio vs by Gateway weights, with the analysis threshold. */
export function CanaryLab() {
  const [bug, setBug] = useState(true)
  const sim = useSimulation({ init: () => createCanaryLab(bug), step: (c, dt) => stepCanaryLab(c, dt), speed: 2 })
  const c = sim.state
  const [ref, width] = useWidth<HTMLDivElement>()
  const layout = (width ?? 0) >= 520 ? 'wide' : 'narrow'
  const g = GEOM[layout]
  const log = c.lanes.flatMap((l) => engineLog(l.s, CANARY_KINDS, l.key === 'replicas' ? 'Replike' : 'Težine', CANARY_START - 0.5)).sort((a, b) => a.t - b.t)

  return (
    <SimFrame
      title="Dvije canary trake"
      subtitle="isti koraci 5 → 25 → 50 → 100 % · prag analize 2 % · korak 30 s (sim) · stvarno: npr. 5 min · seed 42"
      sim={sim}
      toolbar={<Badge tone="neutral">t = {dec(c.lanes[0].s.t)} s</Badge>}
      speeds={[1, 2, 4]}
      hint="Usporedite gornji grafikon: po replikama „5 %” je zapravo oko 20 % zahtjeva i jako skače, a po težinama ostaje blizu 5 %. Na donjem grafikonu analiza na kraju svakog koraka usporedi udio krivih računa s crtom od 2 % i prekine canary ako je iznad."
      controls={
        <>
          <Segmented<'bug' | 'ok'>
            label="Verzija 2.0.0"
            value={bug ? 'bug' : 'ok'}
            options={[
              { value: 'bug', label: 's greškom (20 %)' },
              { value: 'ok', label: 'ispravna' },
            ]}
            onChange={(v) => {
              setBug(v === 'bug')
              sim.mutate((x) => Object.assign(x, createCanaryLab(v === 'bug')))
            }}
          />
          <p className={styles.controlNote}>Promjena kreće ispočetka. S ispravnom verzijom canary prolazi sve korake do 100 %.</p>
        </>
      }
      stats={
        <div className={styles.statsStack}>
          <LineChart
            series={c.lanes.map((l) => ({ label: l.key === 'replicas' ? 'po replikama' : 'po težinama', values: l.share.values, color: l.key === 'replicas' ? 'var(--violet)' : 'var(--pen)' }))}
            window={120}
            height={130}
            yLabel="% zahtjeva na 2.0.0 (prozor 5 s)"
            xLabel="sekunde (sim)"
            formatY={(v) => `${Math.round(v)} %`}
          />
          <LineChart
            series={c.lanes.map((l) => ({ label: l.key === 'replicas' ? 'po replikama' : 'po težinama', values: l.err.values, color: l.key === 'replicas' ? 'var(--violet)' : 'var(--pen)' }))}
            window={120}
            height={120}
            yMax={40}
            threshold={{ value: 2, label: 'prag 2 %', color: 'var(--red)' }}
            yLabel="analiza: % krivih računa 2.0.0 u koraku"
            xLabel="sekunde (sim)"
            formatY={(v) => `${Math.round(v)} %`}
          />
          <EventLog events={log} max={6} />
        </div>
      }
    >
      <div ref={ref} className={styles.labStage}>
        {c.lanes.map((l) => {
          const st = releaseStats(l.s)!
          return (
            <div key={l.key} className={styles.labRow}>
              <div className={styles.laneHead}>
                <span className={styles.labTitle}>{NAME[l.key]}</span>
                <Badge tone="violet">
                  {st.phase === 'canary' ? `traženo ${Math.round(st.requestedPct)} % → ${l.key === 'replicas' ? `~${Math.round(st.actualPct)} % veza` : `${Math.round(st.actualPct)} % zahtjeva`}` : st.phase === 'aborted' ? 'analiza prekinula' : st.phase === 'done' || st.phase === 'promoted' ? 'promovirano' : 'čeka'}
                </Badge>
                <span className={`${styles.hitChip} ${l.vat.size > 0 ? styles.hitBad : ''}`}>
                  {l.vat.size > 0 ? '✗' : '✓'} {l.vat.size} <span>{plural(l.vat.size, ['student', 'studenta', 'studenata'], false)} s krivim PDV-om · vidjelo 2.0.0: {dec(st.exposurePct)} %</span>
                </span>
              </div>
              <div className={styles.laneArt} style={layout === 'narrow' ? { maxWidth: 460 } : undefined}>
                <Diagram width={g.w} height={g.h} label={`${NAME[l.key]}. Gore stabilni Podovi 1.4.1, dolje canary Podovi 2.0.0.`}>
                  <LaneDrawing s={l.s} layout={layout} router={l.key === 'weights' ? 'gateway' : 'service'} />
                </Diagram>
              </div>
            </div>
          )
        })}
      </div>
    </SimFrame>
  )
}
