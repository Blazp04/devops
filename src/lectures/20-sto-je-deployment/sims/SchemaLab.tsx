import { Badge, Button, Diagram, EventLog, Goals, SimFrame, Stat, StatRow, useSimulation, useWidth } from '../../../kit'
import { COMPRESSED } from '../../../engines/cluster'
import { SCHEMA_KINDS, contract, createSchemaLab, deployV2, dropThenRollback, engineLog, expand, renameAtOnce, rollbackV1, schemaView, stepSchemaLab } from '../lib/labs'
import { SCHEMA_H, liveFrame } from '../lib/schema'
import { SchemaDrawing } from './SchemaDrawing'
import styles from '../styles.module.css'

const PHASE: Record<string, [string, string]> = {
  idle: ['1.4.1', 'radi stara verzija'],
  deploying: ['uvodi se', '1.4.1 → 2.0.0'],
  done: ['2.0.0', 'svi Podovi na 2.0.0'],
  'rolled-back': ['vraćeno', 'natrag na 1.4.1'],
}

/** Scene 5 lab: the shared database and a rolling update of 2.0.0 (E3, presetRelease rolling + schema). */
export function SchemaLab() {
  const sim = useSimulation({ init: createSchemaLab, step: (x, dt) => stepSchemaLab(x, dt) })
  const x = sim.state
  const v = schemaView(x)
  const [ref, width] = useWidth<HTMLDivElement>()
  const wide = (width ?? 0) >= 560
  const has = (c: string) => v.columns.includes(c)
  const idle = v.phase === 'idle'

  return (
    <SimFrame
      title="Baza ne ide unatrag"
      subtitle="postupno ažuriranje 1.4.1 → 2.0.0 · zajednička baza · seed 42"
      sim={sim}
      showTime
      hint="Promijenite shemu tako da nijedan zahtjev ne padne: proširite, uvedite, pa suzite. Zatim pokvarite: preimenujte stupac u jednom koraku ili se vratite nakon brisanja."
      controls={
        <>
          <Button variant="secondary" disabled={has('cijena_s_pdv')} onClick={() => sim.mutate((s) => expand(s))}>
            ① Dodaj cijena_s_pdv
          </Button>
          <Button variant="primary" disabled={!idle} onClick={() => sim.mutate((s) => deployV2(s))}>
            ② Uvedi 2.0.0
          </Button>
          <Button variant="secondary" disabled={!has('cijena')} onClick={() => sim.mutate((s) => contract(s))}>
            ③ Obriši stupac cijena
          </Button>
          <Button variant="success" disabled={idle || v.phase === 'rolled-back'} onClick={() => sim.mutate((s) => rollbackV1(s))}>
            Vrati na 1.4.1
          </Button>
          <Button variant="danger" disabled={!has('cijena') || has('cijena_s_pdv')} onClick={() => sim.mutate((s) => renameAtOnce(s))}>
            Preimenuj stupac u jednom koraku
          </Button>
          <Button variant="danger" disabled={idle || v.phase === 'rolled-back'} onClick={() => sim.mutate((s) => dropThenRollback(s))}>
            Vrati nakon nepovratne migracije
          </Button>
          <Badge tone="neutral">{COMPRESSED.rolloutReadinessPeriod.label}</Badge>
        </>
      }
      stats={
        <div className={styles.statsStack}>
          <StatRow>
            <Stat label="Uvođenje" value={PHASE[v.phase]?.[0] ?? v.phase} sub={PHASE[v.phase]?.[1]} />
            <Stat label="Neuspjeli 1.4.1" value={v.v1Failed} tone={v.v1Failed > 0 ? 'bad' : 'ok'} sub="HTTP 500" />
            <Stat label="Neuspjeli 2.0.0" value={v.v2Failed} tone={v.v2Failed > 0 ? 'bad' : 'ok'} />
            <Stat label="Pogođenih" value={v.usersHit} tone={v.usersHit > 0 ? 'bad' : 'ok'} sub="studenata" />
          </StatRow>
          <div className={styles.statsGrid}>
            <Goals goals={[{ text: 'Promijenite shemu bez rušenja 1.4.1: na kraju samo cijena_s_pdv, svi Podovi na 2.0.0 i nijedan neuspjeli zahtjev.', done: x.goal }]} />
            <EventLog events={engineLog(x.s, SCHEMA_KINDS)} max={6} />
          </div>
        </div>
      }
    >
      <div ref={ref}>
        <div style={wide ? { maxWidth: 680 } : { maxWidth: 460, margin: '0 auto' }}>
          <Diagram width={wide ? 560 : 340} height={SCHEMA_H} label="Podovi klopa-api lijevo i tablica narudzbe (narudžbe) desno; strelica pokazuje koji stupac koja verzija čita: zelena s ✓ ako ga nađe, crvena s ✗ i HTTP 500 ako ga nema.">
            <SchemaDrawing frame={liveFrame(x.s, x.dropped)} layout={wide ? 'wide' : 'narrow'} />
          </Diagram>
        </div>
      </div>
    </SimFrame>
  )
}
