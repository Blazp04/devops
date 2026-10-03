/**
 * Goal 3 of the flagship: „Objasnite zašto HPA stane na 9, a ne na 10”. Three short handwritten answers with pen
 * outlines; the chosen one is circled in blue pen, a wrong one is struck out in red and may be changed, the right
 * one gets a tick and the arithmetic (including the whole-percent rounding the HPA does).
 */
import { Check, Cross, RoughAround, RoughButton } from '../../../kit'
import styles from '../styles.module.css'

const CORRECT = 1

const OPTIONS = ['Na čvorovima nema mjesta za deseti Pod.', '55 % je unutar tolerancije.', 'maxReplicas je postavljen na 9.']

export function WhyNine({ chosen, onChoose }: { chosen: number | null; onChoose: (i: number, correct: boolean) => void }) {
  return (
    <div className={styles.why} role="group" aria-labelledby="why-nine-q">
      <p id="why-nine-q" className={styles.whyQ}>
        <strong>Zadatak iz simulacije:</strong> pri 100 zahtjeva/s i cilju od 50 % svaki Pod treba nositi 10 zahtjeva/s (pola od 20 na 100 % requesta). Zašto onda HPA stane na 9 Podova, a ne na 10?
      </p>
      <div className={styles.whyOpts}>
        {OPTIONS.map((o, i) => {
          const on = chosen === i
          const right = on && i === CORRECT
          const wrong = on && i !== CORRECT
          return (
            <RoughButton
              key={i}
              className={styles.whyOpt}
              seed={1870 + i}
              strokeWidth={right || wrong ? 1.8 : 1.3}
              stroke={right ? 'var(--green)' : wrong ? 'var(--red)' : 'var(--ink-3)'}
              ariaPressed={on}
              onClick={() => onChoose(i, i === CORRECT)}
            >
              <svg className={styles.whyMark} viewBox="0 0 24 24" aria-hidden="true">
                {right && <Check x={12} y={13} size={8} />}
                {wrong && <Cross x={12} y={12} size={7} />}
              </svg>
              {right ? (
                <RoughAround stroke="var(--pen)" padX={10} padY={5} seed={1880}>
                  <span>{o}</span>
                </RoughAround>
              ) : (
                <span data-wrong={wrong ? 'yes' : undefined}>{o}</span>
              )}
            </RoughButton>
          )
        })}
      </div>
      {chosen !== null && (
        <p className={styles.whyExplain} aria-live="polite">
          {chosen === CORRECT
            ? 'Točno. 100 zahtjeva/s × 25 ms = 2500m CPU-a na 9 Podova po 500m: 2500 / 4500 = 55,6 %, a HPA odbacuje decimale → 55 %. Omjer 55 / 50 = 1,10 je točno na rubu tolerancije (rub se računa kao unutra), pa HPA ostaje na 9. Tek na 56 % tražio bi ⌈1,12 × 9⌉ = 11.'
            : 'Ne baš. Pogledajte odluke HPA-a nakon t = 180 s: tamo piše 55 % (cilj 50 %) i „omjer 1,10 unutar tolerancije”. Odaberite drugi odgovor.'}
        </p>
      )}
    </div>
  )
}
