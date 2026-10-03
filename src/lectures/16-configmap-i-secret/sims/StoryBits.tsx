import type { ReactNode } from 'react'
import { Boil, Lana, Petra, SpeechBubble, TickBox } from '../../../kit'
import styles from '../styles.module.css'

/** Story beat after the incident: Petra needs a different database for staging, Lana refuses a second image. */
export function StagingBeat() {
  return (
    <figure style={{ margin: '1.4em auto', maxWidth: 460 }}>
      <svg viewBox="0 0 360 236" width="100%" role="img" aria-label="Petra: „Staging treba drugu bazu!” Lana: „Opet nova slika? Ne!”">
        <Boil>
          <Lana x={34} y={108} scale={1} mood="worry" holding="laptop" />
        </Boil>
        <Boil slow>
          <Petra x={244} y={108} scale={1} mood="open" holding="clipboard" flip />
        </Boil>
        <SpeechBubble x={168} y={20} w={150} h={64} tx={282} ty={138} lines={['Staging treba', 'drugu bazu!']} size={20} seed={2601} />
        <SpeechBubble x={8} y={8} w={150} h={64} tx={78} ty={136} lines={['Opet nova', 'slika? Ne!']} size={20} seed={2603} />
      </svg>
    </figure>
  )
}

/** „Pravila za tajne” as a checklist whose boxes tick themselves when scrolled into view. */
export function Checklist({ items }: { items: ReactNode[] }) {
  return (
    <ul className={styles.checklist}>
      {items.map((it, i) => (
        <li key={i}>
          <TickBox checked delay={0.25 * i} seed={2700 + i * 3} className={styles.tick} />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  )
}
