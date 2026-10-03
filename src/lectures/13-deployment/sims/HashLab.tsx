/**
 * Scene 2 „Što stvara novi ReplicaSet?”: four edits of deployment.yaml. The student predicts „isti” or „novi”
 * ReplicaSet, then the edit is applied to an E3 cluster (presetRollout, seed 42) and `kubectl get rs` answers.
 */
import { useState } from 'react'
import { Button, RoughBox, Stamp, useSimulation } from '../../../kit'
import { advance, findDeployment, patchDeploymentTemplate, presetRollout, scaleDeployment, setDeploymentStrategy, setDeploymentVersion, type ClusterState } from '../../../engines/cluster'
import { boardModel } from '../lib/board'
import styles from '../styles.module.css'

interface Change {
  id: string
  title: string
  what: string
  makesNew: boolean
  apply: (c: ClusterState) => void
  why: string
}

const CHANGES: Change[] = [
  {
    id: 'replicas',
    title: 'replicas: 4 → 6',
    what: 'više porcija istog jela',
    makesNew: false,
    apply: (c) => void scaleDeployment(c, 'klopa-api', 6),
    why: 'Polje replicas pripada Deploymentu, a ne predlošku Poda. Postojeći ReplicaSet samo dobije novi broj i stvori dva Poda.',
  },
  {
    id: 'strategy',
    title: 'maxSurge: 25% → 1',
    what: 'kako mijenjati Podove, ne kakvi su',
    makesNew: false,
    apply: (c) => void setDeploymentStrategy(c, 'klopa-api', { maxSurge: 1 }),
    why: 'Strategija je također polje Deploymenta. Kaže kako će se jednom mijenjati Podovi, a sama ne mijenja nijedan Pod.',
  },
  {
    id: 'image',
    title: 'image: …klopa-api:1.4.0',
    what: 'nova verzija aplikacije',
    makesNew: true,
    apply: (c) => void setDeploymentVersion(c, 'klopa-api', '1.4.0'),
    why: 'Slika je dio predloška Poda (spec.template). Novi predložak ima novi sažetak pod-template-hash, a to znači novi ReplicaSet i uvođenje.',
  },
  {
    id: 'env',
    title: 'env: MENI=vegetarijanski',
    what: 'ista slika, nova varijabla okoline',
    makesNew: true,
    apply: (c) => {
      const d = findDeployment(c, 'klopa-api')
      if (d) patchDeploymentTemplate(c, 'klopa-api', { env: { ...d.template.env, MENI: 'vegetarijanski' } })
    },
    why: 'I varijabla okoline je u predlošku Poda. Bilo koja promjena predloška (varijabla, oznaka, provjera, resursi) daje novi ReplicaSet, iako je slika ista.',
  },
]

export function HashLab() {
  const sim = useSimulation<ClusterState>({ init: () => presetRollout({ seed: 42, traffic: false }), step: () => {}, autoStart: false })
  const c = sim.state
  const [guesses, setGuesses] = useState<Record<string, boolean>>({})
  const [fresh, setFresh] = useState<string | null>(null)
  const b = boardModel(c)
  const rows = [...b.rows].sort((a, z) => a.revision - z.revision)

  const guess = (ch: Change, saysNew: boolean) => {
    const before = c.replicaSets.length
    sim.mutate((s) => {
      ch.apply(s)
      advance(s, 0.5)
    })
    setGuesses((g) => ({ ...g, [ch.id]: saysNew }))
    setFresh(sim.state.replicaSets.length > before ? sim.state.replicaSets[sim.state.replicaSets.length - 1].name : null)
  }

  return (
    <div>
      <div className={styles.changes}>
        {CHANGES.map((ch, i) => {
          const g = guesses[ch.id]
          const answered = g !== undefined
          return (
            <RoughBox key={ch.id} className={styles.change} seed={9700 + i} stroke="var(--ink-2)">
              <div className={styles.changeTitle}>{ch.title}</div>
              <p className={styles.changeWhat}>{ch.what}</p>
              {/* the buttons stay after the answer (the chosen one pressed), so keyboard focus never drops to <body> */}
              <div className={styles.btnRow}>
                <Button size="sm" active={g === false} onClick={() => !answered && guess(ch, false)}>
                  Isti ReplicaSet
                </Button>
                <Button size="sm" active={g === true} onClick={() => !answered && guess(ch, true)}>
                  Novi ReplicaSet
                </Button>
              </div>
              {answered && (
                <p className={styles.verdict} role="status">
                  <span className={g === ch.makesNew ? styles.ok : styles.bad}>{g === ch.makesNew ? '✓ Točno. ' : '✗ Ne baš. '}</span>
                  {ch.makesNew ? 'Novi ReplicaSet. ' : 'Isti ReplicaSet. '}
                  {ch.why}
                </p>
              )}
            </RoughBox>
          )
        })}
      </div>
      <div className={`${styles.historyHead} mono`}>kubectl get rs -l app=klopa-api</div>
      <div className={styles.rsList} aria-live="polite">
        {rows.map((r, i) => (
          <RoughBox key={r.id} className={styles.rsCard} seed={9800 + i} stroke={r.isNew ? 'var(--pen)' : 'var(--ink-3)'} dash={r.desired === 0 ? '4 4' : undefined}>
            <div>
              <strong>{r.name}</strong>
            </div>
            <div>
              pod-template-hash: {r.hash} · rev {r.revision}
            </div>
            <div>
              {r.version} · želi {r.desired}
              {r.name === fresh ? ' ' : ''}
              {r.name === fresh && (
                <Stamp tone="green" rotate={-6}>
                  NOVI
                </Stamp>
              )}
            </div>
          </RoughBox>
        ))}
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          sim.reset()
          setGuesses({})
          setFresh(null)
        }}
      >
        Kreni ispočetka
      </Button>
    </div>
  )
}
