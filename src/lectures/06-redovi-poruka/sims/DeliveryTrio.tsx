import type { ReactNode } from 'react'
import { Check, Cross, Rough, RoughBox, Term } from '../../../kit'
import styles from '../styles.module.css'

type Variant = 'most' | 'least' | 'exact'

interface Item {
  v: Variant
  kicker: string
  title: ReactNode
  text: ReactNode
  /** where the ack happens on the 0–200 timeline */
  ackX: number
  /** where the consumer crashes */
  crashX: number
  result: string
  tone: 'red' | 'pen' | 'green'
}

const ITEMS: Item[] = [
  {
    v: 'most',
    kicker: 'potvrda pri isporuci',
    title: <Term id="at-most-once-delivery">Najviše jednom</Term>,
    text: 'Poruka je potvrđena čim je stigla. Pad usred kuhanja: posrednik je već obrisao poruku, narudžba je izgubljena. Nikad se ne kuha dvaput.',
    ackX: 30,
    crashX: 92,
    result: 'pad: izgubljeno',
    tone: 'red',
  },
  {
    v: 'least',
    kicker: 'potvrda nakon obrade',
    title: <Term id="at-least-once-delivery">Barem jednom</Term>,
    text: 'Pad prije potvrde: poruka se vraća i stiže ponovno. Ništa se ne gubi, ali isti posao može se obaviti dvaput.',
    ackX: 162,
    crashX: 144,
    result: 'pad: skuhano 2×',
    tone: 'pen',
  },
  {
    v: 'exact',
    kicker: 'što bismo htjeli',
    title: 'Točno jednom',
    text: 'Posrednik to ne može sam zajamčiti: ne zna je li potrošač pao prije ili poslije kuhanja. Za učinke u našoj bazi učinak „točno jednom” dobivamo kao „barem jednom” + idempotentan potrošač; vanjski poziv (SMS) i dalje može otići dvaput.',
    ackX: 162,
    crashX: 144,
    result: '2. put: već skuhano',
    tone: 'green',
  },
]

const INK: Record<Item['tone'], string> = { red: 'var(--red)', pen: 'var(--pen)', green: 'var(--green)' }

/** One consumer's timeline: takes the message, cooks (hatched bar), the ack (blue flag) and where a crash lands (✗). */
function Timeline({ it }: { it: Item }) {
  const seed = it.v === 'most' ? 8100 : it.v === 'least' ? 8120 : 8140
  const label =
    it.v === 'most'
      ? 'Potvrda pri isporuci: potvrda prije kuhanja, pad usred kuhanja – narudžba izgubljena.'
      : it.v === 'least'
        ? 'Potvrda nakon obrade: pad nakon kuhanja, a prije potvrde – narudžba se kuha dvaput.'
        : 'Točno jednom: potvrda nakon obrade i ključ idempotentnosti – druga isporuka samo zabilježi „već skuhano”.'
  return (
    <svg viewBox="0 0 200 70" role="img" aria-label={label} className={styles.trioSvg}>
      <Rough shape={{ k: 'line', x1: 6, y1: 38, x2: 194, y2: 38 }} seed={seed} stroke="var(--ink-3)" strokeWidth={1.3} />
      <circle cx={8} cy={38} r={3} style={{ fill: 'var(--ink)' }} />
      <Rough shape={{ k: 'rect', x: 50, y: 31, w: 80, h: 14 }} seed={seed + 1} stroke="var(--ink-2)" strokeWidth={1.2} fillColor="var(--hl-orange-ink)" hachureGap={4} fillWeight={0.8} />
      <text x={90} y={22} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 13, fill: 'var(--ink-2)' }}>
        kuha
      </text>
      {/* the ack: a blue pen flag */}
      <Rough shape={{ k: 'line', x1: it.ackX, y1: 28, x2: it.ackX, y2: 48 }} seed={seed + 2} stroke="var(--pen)" strokeWidth={2.2} roughness={0.5} />
      <text x={it.ackX} y={22} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 13, fontWeight: 700, fill: 'var(--pen)' }}>
        ack
      </text>
      <Cross x={it.crashX} y={38} size={7} seed={seed + 3} />
      {it.v === 'exact' ? <Check x={38} y={61} size={6} seed={seed + 4} /> : null}
      <text x={196} y={66} textAnchor="end" className="k-svg-mono" style={{ fontSize: 13, fontWeight: 600, fill: INK[it.tone] }}>
        {it.result}
      </text>
    </svg>
  )
}

/** „Najviše jednom / barem jednom / točno jednom”: three notebook cards, each with the consumer's timeline. */
export function DeliveryTrio() {
  return (
    <div className={styles.semantics}>
      {ITEMS.map((it) => (
        <RoughBox key={it.v} className={styles.trioCard} seed={it.v === 'most' ? 8201 : it.v === 'least' ? 8202 : 8203} stroke={it.v === 'exact' ? 'var(--green)' : 'var(--ink)'} dash={it.v === 'exact' ? '7 5' : undefined} strokeWidth={1.5}>
          <span className={styles.semKicker}>{it.kicker}</span>
          <h4>{it.title}</h4>
          <Timeline it={it} />
          <p>{it.text}</p>
        </RoughBox>
      ))}
    </div>
  )
}
