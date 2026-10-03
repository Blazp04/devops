/**
 * Quiz as a customs inspection ticket: a stub with the question number and status, a form with three boxes.
 * Nothing is answered on load. A pick gets the inspector's stamp; the explanation folds out like a form flap.
 */
import { useState } from 'react'
import q from './quiz.module.css'

const OPTIONS = [
  { k: 'A', text: 'Svi poslužitelji zagušit će se istodobno, jer dobivaju jednako mnogo zahtjeva.' },
  { k: 'B', text: 'Prvi će se zagušiti Mali: dobiva jednak udio kao Veliki, a ima četiri puta manje jezgri.' },
  { k: 'C', text: 'Prvi će se zagušiti Veliki, jer ima najviše RAM‑a pa prima najviše zahtjeva.' },
]
const CORRECT = 'B'

function Barcode() {
  const bars = [2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3, 1, 2, 2, 1, 3, 1]
  let x = 0
  return (
    <svg viewBox="0 0 64 22" className={q.barcode} aria-hidden="true" preserveAspectRatio="none">
      {bars.map((w, i) => {
        const r = i % 2 === 0 ? <rect key={i} x={x} y={0} width={w} height={22} /> : null
        x += w
        return r
      })}
    </svg>
  )
}

export function Quiz() {
  const [pick, setPick] = useState<string | null>(null)
  const answered = pick !== null
  const ok = pick === CORRECT
  return (
    <section className={q.ticket} aria-labelledby="kviz-q" data-state={!answered ? 'open' : ok ? 'ok' : 'bad'}>
      <div className={q.stub}>
        <span className={q.stubLabel}>Inspekcija tereta</span>
        <span className={q.stubNo} aria-label="Pitanje 1 od 1">
          <b>01</b>
          <small>/ 01</small>
        </span>
        <span className={q.stubState} aria-live="polite">
          <i aria-hidden="true" />
          {!answered ? 'čeka inspekciju' : ok ? 'odgovoreno · točno' : 'odgovoreno · netočno'}
        </span>
        <Barcode />
      </div>
      <div className={q.form}>
        <p className={q.question} id="kviz-q">
          Load balancer koristi <strong>kružno raspoređivanje</strong> između poslužitelja Mali (1 vCPU), Srednji (2 vCPU) i Veliki (4 vCPU).
          Što se događa kad promet naraste?
        </p>
        <div className={q.options} role="radiogroup" aria-labelledby="kviz-q">
          {OPTIONS.map((o) => {
            const chosen = pick === o.k
            const state = chosen ? (o.k === CORRECT ? 'ok' : 'bad') : 'idle'
            const locked = ok && !chosen
            return (
              <button
                key={o.k}
                type="button"
                role="radio"
                aria-checked={chosen}
                aria-disabled={locked || undefined}
                className={q.option}
                data-state={state}
                data-locked={locked ? '1' : undefined}
                onClick={() => !locked && setPick(o.k)}
              >
                <span className={q.box} aria-hidden="true">
                  {chosen && (
                    <svg viewBox="0 0 20 20">
                      {o.k === CORRECT ? <path d="M3 10.5 8 15l9-11" /> : <path d="M4 4l12 12M16 4 4 16" />}
                    </svg>
                  )}
                </span>
                <span className={q.letter}>{o.k}</span>
                <span className={q.optText}>{o.text}</span>
                {chosen && (
                  <span className={q.stamp} aria-hidden="true">
                    {o.k === CORRECT ? 'Točno' : 'Netočno'}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className={q.flapWrap} data-open={answered ? '1' : undefined}>
          <div className={q.flapInner}>
            <div className={q.flap} data-ok={ok ? '1' : '0'} aria-live="polite">
              {answered && (
                <>
                  <b>{ok ? 'Obrazloženje inspektora' : 'Pogledajte još jednom'}</b>
                  <p>
                    {ok
                      ? 'Kružno raspoređivanje ne zna ništa o snazi poslužitelja: svaki dobiva trećinu prometa. Mali s jednom jezgrom obradi najmanje zahtjeva u sekundi, pa mu se prvom puni dvorište, a kad se napune i vrata, počinje odbijati zahtjeve. Isto možete vidjeti u simulaciji iznad.'
                      : 'Kružno raspoređivanje svima daje jednak udio, ali poslužitelji nisu jednako jaki. Koji će prvi ostati bez slobodne jezgre? Odaberite drugi odgovor.'}
                  </p>
                  <button type="button" className={q.reset} onClick={() => setPick(null)}>
                    Ponovi inspekciju
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
