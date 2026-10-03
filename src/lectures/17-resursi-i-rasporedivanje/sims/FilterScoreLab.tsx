import { useState } from 'react'
import { Badge, RoughBox, Select, StickyNote } from '../../../kit'
import { effectiveRequests, explainScheduling, presetScheduler } from '../../../engines/cluster'
import { CARD_NOTE, CARD_ORDER, SEED } from '../lib/model'
import styles from '../styles.module.css'

function Line({ ok, children }: { ok: boolean | null; children: React.ReactNode }) {
  return (
    <li>
      <span className={ok === null ? styles.muted : ok ? styles.ok : styles.bad} aria-hidden="true">
        {ok === null ? '·' : ok ? '✓' : '✗'}
      </span>
      <span>
        <span className={styles.srOnly}>{ok === null ? 'nije provjereno: ' : ok ? 'prolazi: ' : 'ne prolazi: '}</span>
        {children}
      </span>
    </li>
  )
}

/**
 * Scene 2 „Filtar, bodovi, vezanje”: pick a Pod card, see the filter checklist and the LeastAllocated score per
 * node exactly as the engine's scheduler computes them on the incident's nodes (Iva's test Pods already there).
 * Binding one Pod after another is left to the flagship sim.
 */
export function FilterScoreLab() {
  const [pick, setPick] = useState<string>('web')
  const [s] = useState(() => presetScheduler({ seed: SEED, apiCard: 'burstable' }))
  const pod = s.pods.find((p) => p.name === pick && !p.nodeName)
  const exp = pod ? explainScheduling(s, pod) : null
  const need = pod ? effectiveRequests(pod.spec) : { cpuM: 0, memMi: 0 }
  const winner = exp && exp.best.length ? exp.best[0] : null
  const zero = need.cpuM === 0 && need.memMi === 0

  return (
    <div>
      <div className={styles.btnCol} style={{ alignItems: 'flex-end', marginBottom: 12 }}>
        <Select label="Pod koji čeka" value={pick} options={CARD_ORDER.map((c) => ({ value: c, label: c }))} onChange={(v) => setPick(v)} />
      </div>
      <p className={styles.phaseRow} aria-hidden="true">
        <span className={styles.phaseOn}>① filtriraj</span>→<span className={exp && exp.rows.some((r) => r.fits) ? styles.phaseOn : undefined}>② boduj</span>→
        <span className={winner ? styles.phaseOn : undefined}>{winner ? `③ veži na ${winner}` : '③ nema čvora: Pending'}</span>
      </p>
      {pod && (
        <p className={styles.hintText} style={{ marginBottom: 10 }}>
          <strong>{pod.name}</strong> traži {zero ? <>ništa (nema <code>requests</code>)</> : `${need.cpuM}m CPU-a i ${need.memMi}Mi memorije`} – {CARD_NOTE[pod.name]}.
        </p>
      )}
      {exp && (
        <div className={styles.labGrid}>
          {exp.rows.map((r, i) => {
            const freeCpu = r.allocatable.cpuM - r.requested.cpuM
            const freeMem = r.allocatable.memMi - r.requested.memMi
            const cpuOk = need.cpuM <= freeCpu
            const memOk = need.memMi <= freeMem
            const podsOk = r.requested.pods + 1 <= r.allocatable.pods
            const win = r.fits && exp.best.includes(r.node)
            return (
              <RoughBox key={r.node} seed={1730 + i} stroke={win ? 'var(--green)' : r.fits ? 'var(--ink-2)' : 'var(--red)'} double={win} pad={0}>
                <div className={styles.labCard}>
                  <div className={styles.labCardHead}>
                    <span className={styles.schedNode}>{r.node}</span>
                    {r.fits ? <Badge tone={win ? 'ok' : 'neutral'}>{win ? (exp.best.length > 1 ? 'izjednačeno' : 'pobjednik') : 'prolazi'}</Badge> : <Badge tone="bad">ispada</Badge>}
                  </div>
                  <ul className={styles.checkList}>
                    <Line ok={true}>čvor spreman (Ready) i otvoren za nove Podove</Line>
                    <Line ok={true}>nema zabrana (taint) koje Pod ne tolerira</Line>
                    <Line ok={true}>nodeSelector: nema ga</Line>
                    <Line ok={need.cpuM === 0 ? true : cpuOk}>
                      CPU: slobodno {freeCpu}m {need.cpuM === 0 ? '(Pod ne traži)' : cpuOk ? `≥ ${need.cpuM}m` : `< ${need.cpuM}m`}
                    </Line>
                    <Line ok={need.memMi === 0 ? true : memOk}>
                      RAM: slobodno {freeMem}Mi {need.memMi === 0 ? '(Pod ne traži)' : memOk ? `≥ ${need.memMi}Mi` : `< ${need.memMi}Mi`}
                    </Line>
                    <Line ok={podsOk}>
                      Podova: {r.requested.pods} od najviše {r.allocatable.pods}
                    </Line>
                  </ul>
                  {r.fits && r.score ? (
                    <p className={styles.specLine}>
                      bodovi: CPU {r.score.cpuScore} · RAM {r.score.memScore}
                      <br />
                      <span className={styles.scoreBig}>{r.score.score}</span> / 100
                    </p>
                  ) : (
                    <p className={styles.specLine}>
                      <span className={styles.bad}>{r.reasons.join(', ')}</span>
                    </p>
                  )}
                </div>
              </RoughBox>
            )
          })}
        </div>
      )}
      {exp?.message && (
        <StickyNote c="pink" rotate={-0.6} className={styles.eventNote} style={{ marginTop: 12 }}>
          Warning FailedScheduling: {exp.message}
        </StickyNote>
      )}
    </div>
  )
}
