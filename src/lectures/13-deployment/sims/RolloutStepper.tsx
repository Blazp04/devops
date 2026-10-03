/**
 * Scene 3 „Dva ReplicaSeta u suprotnim smjerovima”: the default rolling update 1.3.2 → 1.4.0 (N = 4, surge 1,
 * unavailable 1), step by step. Every picture is an E3 engine snapshot (lib/snapshots.ts), not a drawing by hand.
 */
import { useState } from 'react'
import { Stepper, useWidth } from '../../../kit'
import { rolloutStory, type Snapshot } from '../lib/snapshots'
import { WIDE_MIN } from '../lib/layout'
import { secs } from '../lib/options'
import { BoardStage } from './BoardStage'
import styles from '../styles.module.css'

const STEPS = [
  {
    title: 'Prije: četiri Poda verzije 1.3.2',
    body: 'Deployment želi 4 replike. Iz maxSurge 25 % i maxUnavailable 25 % slijede dvije ograde: ukupno najviše 5 Podova (4 + 1) i najmanje 3 dostupna (4 − 1). Lana primijeni sliku 1.4.0.',
  },
  {
    title: 'Novi ReplicaSet raste, stari se smanjuje',
    body: 'Nova slika = novi predložak = novi ReplicaSet. U svakom prolazu kontroler ili povećava ili smanjuje: novi dobije 1 Pod (ukupno 5, ograda), stari padne na 3 (dostupna 3, ograda), novi naraste na 2. Pod u gašenju ograda ne broji.',
  },
  {
    title: 'Čekamo spremnost',
    body: 'Novi Podovi rade, ali se još zagrijavaju i provjera spremnosti ne prolazi. Obje ograde su dosegnute (3 dostupna, 5 ukupno), pa kontroler čeka. Provjera spremnosti je vratar cijelog uvođenja.',
  },
  {
    title: 'Prva dva nova Poda su spremna',
    body: 'Prvi novi Pod postane spreman (11,2 s; dostupna 4), pa stari padne na 2, a novi naraste na 3. Odmah zatim (11,4 s) spreman je i drugi: stari na 1, novi na 4. Cijelo su vrijeme dostupna barem 3 Poda. Dva stara Poda još 5 s dovršavaju narudžbe – zato je na crtežu 7 kutija, a ograda broji 5.',
  },
  {
    title: 'Obje verzije poslužuju',
    body: 'Narudžbe sada primaju i 1.3.2 i 1.4.0, svaka otprilike prema broju spremnih Podova. Zato nova verzija mora raditi s istom bazom i istim klijentima kao stara.',
  },
  {
    title: 'Zadnji stari Pod odlazi',
    body: 'Sva četiri nova Poda su spremna i stari ReplicaSet je na 0. Zadnji stari Pod još nekoliko sekundi završava započete narudžbe.',
  },
  {
    title: 'Gotovo nakon 28 s',
    body: (
      <>
        Četiri Poda 1.4.0. Stari ReplicaSet ostaje s 0 Podova: to je revizija 1 u povijesti, i baš njega naredba <code>kubectl rollout undo</code> ponovno poveća.
      </>
    ),
  },
]

/** which way each ReplicaSet moves in a step (new grows ↑ green, old shrinks ↓ red) */
const MOVES: ('both' | 'old' | null)[] = [null, 'both', null, 'both', 'old', 'old', null]

export function RolloutStepper() {
  const [snaps] = useState(rolloutStory)
  return (
    <Stepper steps={STEPS} title="Postupno ažuriranje, korak po korak" autoPlay={0} caption="Svaki prikaz je stanje simulacije u tom trenutku (N = 4, maxSurge 25 %, maxUnavailable 25 %, seed 42).">
      {(step) => <StepPicture snap={snaps[step]} move={MOVES[step]} />}
    </Stepper>
  )
}

function StepPicture({ snap, move }: { snap: Snapshot; move: 'both' | 'old' | null }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const layout = width !== null && width >= WIDE_MIN ? 'wide' : 'narrow'
  const arrows: Record<string, 'up' | 'down'> = {}
  for (const r of snap.board.rows) {
    if (r.isNew && move === 'both') arrows[r.id] = 'up'
    if (!r.isNew && move) arrows[r.id] = 'down'
  }
  const served = Object.entries(snap.served).sort((a, b) => a[0].localeCompare(b[0]))
  return (
    <div ref={ref}>
      <BoardStage
        b={snap.board}
        layout={layout}
        rowSlots={2}
        arrows={arrows}
        label={`t = ${secs(snap.t)}: dostupno ${snap.board.available} (ograda ≥ ${snap.board.minAvailable}), ukupno ${snap.board.total} (ograda ≤ ${snap.board.maxTotal}), u gašenju ${snap.board.terminating}.`}
      />
      <div className={styles.served}>
        <span>t = {secs(snap.t)} nakon kubectl apply</span>
        <span>
          odgovorili u zadnje 3 s:{' '}
          {served.map(([v, n]) => (
            <span key={v} className={styles.tape} data-tone={v === '1.3.2' ? 'blue' : 'violet'}>
              {`${v} × ${n}`}
            </span>
          ))}
        </span>
      </div>
    </div>
  )
}
