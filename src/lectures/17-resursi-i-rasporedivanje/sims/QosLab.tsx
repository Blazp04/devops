import { useState } from 'react'
import { Badge, Button, RoughBox, Stamp, StickyNote } from '../../../kit'
import { qosRun } from '../lib/model'
import styles from '../styles.module.css'

const RULE: Record<string, { rule: string; text: string; tone: 'green' | 'blue' | 'rose' }> = {
  Guaranteed: { rule: 'requests = limits (CPU i memorija)', text: 'Dobiva točno ono što je rezervirao. Ne može trošiti više od rezervacije, pa je u zadnjoj skupini za izbacivanje.', tone: 'green' },
  Burstable: { rule: 'barem jedan kontejner ima requests ili limits, ali Pod nije Guaranteed', text: 'Smije uzeti više kad ima mjesta. Ako troši više nego što je rezervirao, ide među prve.', tone: 'blue' },
  BestEffort: { rule: 'nema ni requests ni limits', text: 'Raspoređivač ga smjesti bilo gdje, jer ništa ne rezervira. Rezervacija mu je 0, pa uvijek troši više od nje – među prvima je za izbacivanje.', tone: 'rose' },
}
const ORDER = ['Guaranteed', 'Burstable', 'BestEffort']

/**
 * Scene 5: three Pods of three QoS classes on one node; „Stisni memoriju” takes memory from outside the Pods until
 * memory.available < 100Mi, and the engine's kubelet evicts one Pod per housekeeping pass – in its ranking order.
 */
export function QosLab() {
  const [run] = useState(() => qosRun())
  const [shown, setShown] = useState(0)
  const pods = ORDER.map((q) => run.pods.find((p) => p.qos === q)!).filter(Boolean)
  const msg = shown > 0 ? run.messages[shown - 1] : null
  return (
    <div>
      <div className={styles.qosGrid}>
        {pods.map((p, i) => {
          const r = RULE[p.qos]
          const rank = run.evicted.indexOf(p.name)
          const out = rank >= 0 && rank < shown
          return (
            <RoughBox key={p.name} seed={1780 + i} stroke={out ? 'var(--red)' : 'var(--ink-2)'} pad={0}>
              <div className={styles.qosCard}>
                <div className={styles.labCardHead}>
                  <p className={styles.qosTitle}>{p.qos}</p>
                  <Badge tone={r.tone}>{`oom_score_adj ${p.adj < 0 ? `\u2212${-p.adj}` : p.adj}`}</Badge>
                </div>
                <p className={styles.qosRule}>{r.rule}</p>
                <p className={styles.qosText}>{r.text}</p>
                <p className={styles.specLine}>
                  Pod <strong>{p.name}</strong>: rezervira {p.reqMi}Mi, troši {Math.round(p.usedMi)}Mi{p.limMi ? `, limit ${p.limMi}Mi` : ', bez limita'}
                  <br />
                  {p.usedMi > p.reqMi ? <span className={styles.bad}>troši više nego što je rezervirao</span> : <span className={styles.ok}>unutar svoje rezervacije</span>}
                </p>
                {out && (
                  <div>
                    <Stamp tone="red" rotate={-4}>
                      {`izbačen ${rank + 1}.`}
                    </Stamp>
                  </div>
                )}
              </div>
            </RoughBox>
          )
        })}
      </div>
      <div className={styles.btnCol} style={{ marginTop: 14 }}>
        <Button variant="danger" disabled={shown >= run.evicted.length} onClick={() => setShown((n) => Math.min(run.evicted.length, n + 1))}>
          Stisni memoriju čvora
        </Button>
        <Button variant="ghost" disabled={shown === 0} onClick={() => setShown(0)}>
          Kreni ispočetka
        </Button>
      </div>
      <p className={styles.hintText} style={{ marginTop: 8 }} aria-live="polite">
        {shown === 0
          ? 'Svaki klik: nešto izvan Podova uzme memoriju dok memory.available ne padne ispod 100Mi, a kubelet pri sljedećoj provjeri (svakih 10 s) izbaci jedan Pod.'
          : `Kubelet je izbacio ${run.evicted.slice(0, shown).join(', zatim ')}.`}
      </p>
      {msg && (
        <StickyNote c="pink" rotate={-0.6} className={styles.eventNote} style={{ marginTop: 12 }}>
          Warning Evicted: {msg}
        </StickyNote>
      )}
    </div>
  )
}
