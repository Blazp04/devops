/**
 * Scene 0 „Osjetite problem”: Davor's rehearsal on the same E3 board as the flagship (lib/flagship createBoard
 * 'incident': Recreate, 1.3.2 → 1.4.0 applied after 5 s, 20 req/s, seed 42). The incident card's numbers come from here.
 */
import { Button, SimFrame, Stat, StatRow, fmt, useSimulation, useWidth } from '../../../kit'
import { findDeployment } from '../../../engines/cluster'
import { boardLabel, boardModel } from '../lib/board'
import { createBoard, INCIDENT_APPLY_AT, SEED, stepBoard, type BoardSim } from '../lib/flagship'
import { boardGeo, boardRows, podPositions, WIDE_MIN } from '../lib/layout'
import { secs } from '../lib/options'
import { responseStrip, traysFor } from '../lib/traffic'
import { BoardStage } from './BoardStage'
import styles from '../styles.module.css'

export function DavorPlan() {
  const sim = useSimulation<BoardSim>({ init: () => createBoard('incident'), step: (st, dt) => stepBoard(st, dt), autoStart: false })
  const st = sim.state
  const c = st.c
  const [ref, width] = useWidth<HTMLDivElement>()
  const layout = width !== null && width >= WIDE_MIN ? 'wide' : 'narrow'
  const b = boardModel(c)
  const geo = boardGeo(layout, 2)
  const { rows } = boardRows(b, geo.rows.length)
  const trays = traysFor(c, geo, podPositions(rows, geo, b.orphans))
  const strip = responseStrip(c, 40)
  const ro = findDeployment(c, 'klopa-api')?.rollout ?? null
  const failed = ro ? ro.requests.failed : 0
  const restart = () => {
    sim.mutate((s) => {
      Object.assign(s, createBoard('incident'))
    })
    sim.play()
  }
  return (
    <SimFrame
      title="Davorov plan: prvo ugasi sve, pa pokreni nove"
      subtitle={`Probni klaster: četiri Poda 1.3.2 i 20 zahtjeva u sekundi. U ${INCIDENT_APPLY_AT}. sekundi Davor ugasi sve stare Podove i pokrene nove s 1.4.0 (seed ${SEED}).`}
      sim={sim}
      toolbar={<span className={`${styles.chip} mono`}>{`t = ${fmt.num(c.t, 1)} s`}</span>}
      hint="Pokrenite probu i pratite pladnjeve od 10. do 22. sekunde."
      minHeight={360}
      controls={
        <Button variant="primary" onClick={restart}>
          Pokreni Davorov plan
        </Button>
      }
      stats={
        <StatRow>
          <Stat label="Dostupno" value={`${b.available}/${b.replicas}`} tone={b.available === 0 ? 'bad' : b.available < b.replicas ? 'warn' : 'ok'} />
          <Stat label="Nitko ne odgovara" value={secs(st.noPodS)} tone={st.noPodS > 0 ? 'bad' : 'neutral'} sub="nijedan Pod ne prima promet" />
          <Stat label="Neuspjelih narudžbi" value={ro ? failed : '–'} tone={failed > 0 ? 'bad' : 'neutral'} sub={ro ? 'od primjene 1.4.0' : 'još ništa nije primijenjeno'} />
        </StatRow>
      }
    >
      <div ref={ref}>
        <BoardStage b={b} layout={layout} lane rowSlots={2} rps={20} trays={trays} strip={strip} label={boardLabel(b, rows)} />
      </div>
    </SimFrame>
  )
}
