/**
 * „Trebate li to uopće?” — a short checklist that ends in a verdict. Distribute only when load, availability or
 * geography demand it; otherwise one (bigger) server with backups is the simpler, cheaper answer.
 */
import { useState } from 'react'
import { Button, CheckBox, RoughBox } from '../../../kit'
import styles from '../styles.module.css'

type Reason = 'kapacitet' | 'dostupnost' | 'blizina'

const ITEMS: { id: string; text: string; reason: Reason }[] = [
  { id: 'peak', text: 'U vršnom satu ni najveći poslužitelj koji si možete priuštiti ne stigne obraditi promet.', reason: 'kapacitet' },
  { id: 'growth', text: 'Promet raste toliko brzo da ćete uskoro udariti u strop najvećeg stroja.', reason: 'kapacitet' },
  { id: 'outage', text: 'Nekoliko sati ispada (kvar napajanja, diska, pružatelja) skuplje je od drugog poslužitelja i posla oko njega.', reason: 'dostupnost' },
  { id: 'updates', text: 'Aplikacija ne smije stati ni dok je nadograđujete ili popravljate stroj.', reason: 'dostupnost' },
  { id: 'far', text: 'Korisnici su na više kontinenata i osjete stotinjak milisekundi po zahtjevu.', reason: 'blizina' },
]

const KLOPA = new Set(['outage'])

const REASON_LABEL: Record<Reason, string> = { kapacitet: 'kapacitet', dostupnost: 'dostupnost', blizina: 'blizina korisnicima' }

export function NeedChecklist() {
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const reasons = (['kapacitet', 'dostupnost', 'blizina'] as Reason[]).filter((r) => ITEMS.some((it) => it.reason === r && checked.has(it.id)))
  const none = reasons.length === 0
  return (
    <div className={styles.checkWrap}>
      <div className={styles.checkHead}>
        <span className={styles.checkHeadTitle}>Trebate li to uopće?</span>
        <span className={styles.buttonRow}>
          <Button size="sm" variant="secondary" onClick={() => setChecked(new Set(KLOPA))}>
            Ispuni za Klopu
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setChecked(new Set())}>
            Očisti
          </Button>
        </span>
      </div>
      <ul className={styles.checklist}>
        {ITEMS.map((it, i) => (
          <li key={it.id}>
            <label className={styles.checkItem}>
              <input type="checkbox" checked={checked.has(it.id)} onChange={() => toggle(it.id)} />
              <CheckBox checked={checked.has(it.id)} seed={8500 + i} className={styles.checkBox} />
              <span>
                {it.text}
                <span className={styles.checkTag}>· {REASON_LABEL[it.reason]}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <RoughBox className={`k-card ${styles.verdict}`} seed={8520} stroke={none ? 'var(--ink-2)' : 'var(--green)'} double={!none} role="status">
        <p className={styles.verdictTitle}>{none ? 'Ostanite na jednom poslužitelju' : `Više računala ima smisla: ${reasons.map((r) => REASON_LABEL[r]).join(', ')}`}</p>
        <p>
          {none
            ? 'Jedan (po potrebi veći) poslužitelj uz redovite kopije baze i plan oporavka jednostavniji je i jeftiniji. Vertikalno skaliranje često je pravi prvi korak.'
            : reasons.includes('dostupnost') && reasons.length === 1
              ? 'Za dostupnost je dovoljno nekoliko jednakih kopija aplikacije (replikacija) – ne trebaju vam mikroservisi. Ali tek ako kvarovi nisu povezani i ako preživjeli mogu nositi sav promet.'
              : 'Planirajte i cijenu: djelomične kvarove, mrežu koja kasni i gubi poruke te zajedničku bazu koja postaje usko grlo.'}
        </p>
      </RoughBox>
    </div>
  )
}
