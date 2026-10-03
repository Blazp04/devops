import { useState } from 'react'
import { Button, Diagram, EventLog, Segmented, SimFrame, Stat, StatRow, useSimulation, useWidth } from '../../../kit'
import { rollbackRelease, setTrafficClient, startRelease, stepCluster } from '../../../engines/cluster'
import { FLIP_CONNECTIONS, FLIP_KINDS, createFlip, engineLog, flipView, type ClientMode } from '../lib/labs'
import { dec } from '../lib/labels'
import { GEOM } from '../lib/lane-view'
import { LaneDrawing } from './LaneDrawing'
import styles from '../styles.module.css'

const PHASE: Record<string, string> = {
  idle: 'radi 1.4.1 (blue)',
  deploying: 'green se pokreće',
  promoted: 'selektor na green',
  done: 'blue ugašen',
  'rolled-back': 'selektor natrag na blue',
}

/** Scene 4a: the blue-green selector flip with long-lived connections (E3, presetRelease blue-green, keep-alive). */
export function SelectorFlip() {
  const [mode, setMode] = useState<ClientMode>('keep-alive')
  const sim = useSimulation({ init: () => createFlip(mode), step: (s, dt) => stepCluster(s, dt) })
  const s = sim.state
  const v = flipView(s)
  const [ref, width] = useWidth<HTMLDivElement>()
  const layout = (width ?? 0) >= 520 ? 'wide' : 'narrow'
  const g = GEOM[layout]
  const canStart = v.phase === 'idle'
  const canBack = v.phase === 'deploying' || v.phase === 'promoted' || v.phase === 'done'

  return (
    <SimFrame
      title="Prekidač i duge veze"
      subtitle={`plavo-zeleno · ${FLIP_CONNECTIONS} dugotrajnih veza (klopa-web → Service klopa-api) · seed 42`}
      sim={sim}
      showTime
      hint="Uvedite 2.0.0 i gledajte debele linije: selektor se prebaci na green, a postojeće veze ostaju na blue. Zatim isto probajte s novom vezom po zahtjevu."
      controls={
        <>
          <Button variant="primary" disabled={!canStart} onClick={() => sim.mutate((x) => startRelease(x))}>
            Uvedi 2.0.0
          </Button>
          <Button variant="success" disabled={!canBack} onClick={() => sim.mutate((x) => rollbackRelease(x))}>
            Vrati na blue
          </Button>
          <Segmented<ClientMode>
            label="Klijent"
            value={mode}
            options={[
              { value: 'keep-alive', label: `${FLIP_CONNECTIONS} dugih veza` },
              { value: 'per-request', label: 'veza po zahtjevu' },
            ]}
            onChange={(m) => {
              setMode(m)
              sim.mutate((x) => setTrafficClient(x, 'web', m === 'keep-alive' ? { mode: 'keep-alive', connections: FLIP_CONNECTIONS, maxAgeS: null } : { mode: 'per-request' }))
            }}
          />
          <p className={styles.controlNote}>
            <code>blue</code> ostaje {v.delay} s nakon prebacivanja, kao zadana vrijednost <code>scaleDownDelaySeconds</code> u alatu Argo Rollouts.
          </p>
        </>
      }
      stats={
        <div className={styles.statsStack}>
          <StatRow>
            <Stat label="Selektor" value={v.track} tone={v.track === 'green' ? 'warn' : 'neutral'} sub={PHASE[v.phase] ?? v.phase} />
            <Stat label="Veze na blue" value={v.conns.blue} tone={v.track === 'green' && v.conns.blue > 0 ? 'warn' : 'neutral'} sub="1.4.1" />
            <Stat label="Veze na green" value={v.conns.green} sub="2.0.0" />
            <Stat label="Na 2.0.0" value={Number.isNaN(v.toNew) ? '–' : `${dec(v.toNew, 0)} %`} sub="zahtjeva, zadnjih 5 s" />
            <Stat label="Blue još" value={v.blueLeftS === null ? '–' : `${Math.ceil(v.blueLeftS)} s`} sub="pa se smanji na 0" />
          </StatRow>
          <EventLog events={engineLog(s, FLIP_KINDS)} max={5} />
        </div>
      }
    >
      <div ref={ref}>
        <div className={styles.laneArt} style={layout === 'narrow' ? { maxWidth: 460 } : undefined}>
          <Diagram width={g.w} height={g.h} label="Service klopa-api sa selektorom track: blue ili green; gore Podovi blue (1.4.1), dolje green (2.0.0). Debele linije su dugotrajne veze klijenta, broj uz liniju kaže koliko ih je.">
            <LaneDrawing s={s} layout={layout} router="selector" conns />
          </Diagram>
        </div>
      </div>
    </SimFrame>
  )
}
