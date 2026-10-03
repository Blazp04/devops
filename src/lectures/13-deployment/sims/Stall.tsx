/**
 * Scene 5 „Pokvarena verzija”: the stalled rollout of 1.5.0 as the engine left it 70 s after `kubectl apply`
 * (3 × 1.4.0 Ready + 2 × 1.5.0 in CrashLoopBackOff, ProgressDeadlineExceeded), and the terminal around it.
 * Every table line below comes from the engine's own kubectl views (lib/snapshots.stallRun).
 */
import { useState } from 'react'
import { Figure, Terminal, useWidth, type TerminalLine } from '../../../kit'
import { WIDE_MIN } from '../lib/layout'
import { secs } from '../lib/options'
import { stallRun } from '../lib/snapshots'
import { BoardStage } from './BoardStage'

export function StallFigure() {
  const [run] = useState(stallRun)
  const [ref, width] = useWidth<HTMLDivElement>()
  const layout = width !== null && width >= WIDE_MIN ? 'wide' : 'narrow'
  return (
    <Figure wide caption={`Stanje ${secs(70, 0)} nakon primjene 1.5.0: tri Poda 1.4.0 i dalje rade, dva nova se ruše, a ograda „najmanje 3 dostupna” ne dopušta ugasiti nijedan stari. Rok je istekao nakon ${secs(run.timedOutAfterS, 0)} – i ništa se nije vratilo samo.`}>
      <div ref={ref}>
        <BoardStage b={run.board} layout={layout} rowSlots={2} label="Zastoj uvođenja: ReplicaSet 1.4.0 ima 3 spremna Poda, ReplicaSet 1.5.0 ima 2 Poda u stanju CrashLoopBackOff. Dostupno 3 od 4." />
      </div>
    </Figure>
  )
}

const tableLines = (lines: string[]): TerminalLine[] => lines.map((out) => ({ out }))

/**
 * `kubectl get rs` as kubectl prints it: rows sorted by NAME. The AGE column is dropped – the engine dates every
 * ReplicaSet an hour back (a long-lived Deployment), which would make the 1.5.0 ReplicaSet older than its Pods.
 */
const rsTable = (lines: string[]): string[] => {
  const [head, ...rows] = lines
  return [head, ...[...rows].sort()].map((l) => l.replace(/\s+\S+$/, ''))
}

export function StallTerminal() {
  const [run] = useState(stallRun)
  const lines: TerminalLine[] = [
    { comment: 'Lana je primijenila 1.5.0 i gleda uvođenje' },
    { cmd: 'kubectl rollout status deployment/klopa-api' },
    { out: 'Waiting for deployment "klopa-api" rollout to finish: 2 out of 4 new replicas have been updated...' },
    { out: 'error: deployment "klopa-api" exceeded its progress deadline', tone: 'bad', note: 'Rok je istekao, ali stari Podovi i dalje rade – ništa se ne vraća samo.', who: 'davor' },
    { cmd: 'kubectl get rs' },
    ...tableLines(rsTable(run.getRs)),
    { cmd: 'kubectl get pods' },
    ...tableLines(run.getPods),
  ]
  return <Terminal title="Lanin laptop" lines={lines} caption="Tablice su izlaz simulacije u tom trenutku (seed 42); stupac AGE kod ReplicaSetova je izostavljen." />
}

export function UndoTerminal() {
  const [run] = useState(stallRun)
  const hist = (h: { revision: number; changeCause: string }[]): TerminalLine[] => [{ out: 'deployment.apps/klopa-api' }, { out: 'REVISION  CHANGE-CAUSE' }, ...h.map((x) => ({ out: `${String(x.revision).padEnd(10)}${x.changeCause}` }))]
  const lines: TerminalLine[] = [
    { cmd: 'kubectl rollout history deployment/klopa-api' },
    ...hist(run.history),
    { cmd: 'kubectl rollout undo deployment/klopa-api' },
    { out: 'deployment.apps/klopa-api rolled back', tone: 'ok' },
    { cmd: 'kubectl rollout status deployment/klopa-api' },
    { out: 'deployment "klopa-api" successfully rolled out', tone: 'ok', note: `Natrag na 4 × 1.4.0 za ${secs(run.undoS, 0)}: stari ReplicaSet je samo narastao.` },
    { cmd: 'kubectl rollout history deployment/klopa-api' },
    ...hist(run.historyAfterUndo),
  ]
  return <Terminal title="Lanin laptop" lines={lines} caption="Revizija 2 postala je revizija 4: undo je novo uvođenje starog predloška." />
}
