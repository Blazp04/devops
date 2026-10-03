import { useState } from 'react'
import { Figure, Mark, Slider, fmt, plural } from '../../../kit'
import { NINES, downtime } from '../../../engines/traffic'
import { nb } from '../model'
import styles from '../styles.module.css'

/** Availability values the slider scrubs through (the table keeps the four classic rows). */
const LEVELS = [0.9, 0.95, 0.99, 0.995, 0.999, 0.9995, 0.9999, 0.99999] as const

function pctLabel(a: number): string {
  return `${(a * 100).toLocaleString('hr-HR', { maximumFractionDigits: 3 })} %`
}

/** Minutes as „87,6 h”, „43,2 min” or „26 s”. */
function dur(min: number): string {
  const up = (v: number, digits: number) => v.toLocaleString('hr-HR', { maximumFractionDigits: digits })
  if (min >= 90) return `${up(min / 60, min / 60 >= 100 ? 0 : min / 60 >= 10 ? 1 : 2)} h`
  if (min >= 1) return `${up(min, min >= 100 ? 0 : 1)} min`
  return `${fmt.num(min * 60)} s`
}

/** One lunch rush (11:30–14:00) = 150 minutes. */
const LUNCH_MIN = 150

function lunches(minPerYear: number): string {
  const n = minPerYear / LUNCH_MIN
  if (n >= 1.5) {
    const shown = fmt.num(n, n < 10 ? 1 : 0)
    // a decimal number takes the genitive singular („3,5 podnevne gužve”); whole numbers follow the plural rules
    return shown.includes(',') ? `≈ ${shown} podnevne gužve` : `≈ ${plural(Math.round(n), ['podnevna gužva', 'podnevne gužve', 'podnevnih gužvi'])}`
  }
  if (n >= 0.75) return 'otprilike jednu podnevnu gužvu'
  if (n >= 0.25) return `oko ${fmt.num(n * 100)} % jedne podnevne gužve`
  return 'nekoliko minuta jedne podnevne gužve'
}

/** Scene „Izvucite utikač”, second half: scrub the nines and read the allowed downtime. */
export function NinesTable() {
  const [idx, setIdx] = useState(4)
  const a = LEVELS[idx]
  const d = downtime(a)
  return (
    <Figure wide framed={false} caption="Nedostupnost = (1 − dostupnost) × vrijeme. Podnevna gužva ovdje traje 2,5 h (11:30–14:00).">
      <div className={styles.controlsRow}>
        <Slider label="Dostupnost" value={idx} min={0} max={LEVELS.length - 1} onChange={setIdx} format={(i) => pctLabel(LEVELS[i])} />
      </div>
      <p className={styles.readout}>
        Uz <strong>{pctLabel(a)}</strong> Klopa smije biti nedostupna <Mark c="yellow">{nb(dur(d.perYearMin))} godišnje</Mark>, {nb(dur(d.per30DaysMin))} u 30 dana i{' '}
        {nb(dur(d.perWeekMin))} tjedno. Kad bi sav zastoj pao u podne, to bi bilo {nb(lunches(d.perYearMin))} godišnje.
      </p>
      <div className={styles.ninesWrap}>
        <table className={styles.nines}>
          <caption className="visually-hidden">Dopuštena nedostupnost za klasične razine dostupnosti</caption>
          <thead>
            <tr>
              <th scope="col">dostupnost</th>
              <th scope="col">godišnje</th>
              <th scope="col">u 30 dana</th>
              <th scope="col">tjedno</th>
            </tr>
          </thead>
          <tbody>
            {NINES.map((n) => {
              const x = downtime(n)
              return (
                <tr key={n} className={n === a ? styles.isCurrent : undefined}>
                  <td>{pctLabel(n)}</td>
                  <td>{dur(x.perYearMin)}</td>
                  <td>{dur(x.per30DaysMin)}</td>
                  <td>{dur(x.perWeekMin)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Figure>
  )
}
