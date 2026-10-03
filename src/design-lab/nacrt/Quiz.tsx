import { Fragment, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { roughEllipse, roughLine } from './geom'
import s from './nacrt.module.css'
import q from './quiz.module.css'

const OPTIONS = [
  {
    t: 'Veliki, jer kao najjači dobiva najviše posla.',
    ok: false,
    why: 'Kružno raspoređivanje ne gleda snagu poslužitelja: Veliki dobiva jednako kao Mali, 6 zahtjeva/s, a može obraditi 20.',
  },
  {
    t: 'Mali: dobiva 6 zahtjeva/s, a obradi tek oko 5.',
    ok: true,
    why: '',
  },
  {
    t: 'Nijedan, jer je ukupni kapacitet 35 zahtjeva/s.',
    ok: false,
    why: 'Ukupni kapacitet ne pomaže ako algoritam ne šalje posao tamo gdje ima mjesta: svaki poslužitelj dobiva trećinu, a Mali ne stiže.',
  },
]

const RING_OK = roughEllipse(25, 22, 44, 38, 7, { strokeWidth: 2 })
const RING_BAD = roughEllipse(25, 22, 46, 38, 13, { strokeWidth: 2 })
const STRIKE = roughLine(2, 7, 298, 5, 19, { strokeWidth: 2 })

export function Quiz() {
  const [tried, setTried] = useState<number[]>([])
  const right = useMemo(() => tried.find((i) => OPTIONS[i].ok), [tried])
  const lastWrong = tried.length && !OPTIONS[tried[tried.length - 1]].ok ? tried[tried.length - 1] : null
  const pick = (i: number) => {
    if (right !== undefined || tried.includes(i)) return
    setTried((t) => [...t, i])
  }
  const status = right !== undefined ? (tried.length === 1 ? 'točno iz prve' : 'točno') : tried.length ? 'netočno · pokušajte ponovno' : 'neodgovoreno'
  return (
    <div className={q.sheet}>
      <div className={q.head}>
        <span className={q.headL}>Kontrolni list · kontrola 1 / 1</span>
        <span className={q.status} data-tone={right !== undefined ? 'ok' : tried.length ? 'bad' : undefined} aria-live="polite">
          {status}
        </span>
      </div>
      <div className={q.body}>
        <dl className={q.cond}>
          <div>
            <dt>Promet</dt>
            <dd>λ = 18 zahtjeva/s</dd>
          </div>
          <div>
            <dt>Algoritam</dt>
            <dd>kružno</dd>
          </div>
          <div>
            <dt>Kapacitet</dt>
            <dd>Mali 5 · Srednji 10 · Veliki 20 /s</dd>
          </div>
        </dl>
        <p className={q.stem} id="quiz-q">
          Koji će se poslužitelj prvi zagušiti?
        </p>
        <ol className={q.opts} aria-labelledby="quiz-q">
          {OPTIONS.map((o, i) => {
            const marked = tried.includes(i)
            const state = marked ? (o.ok ? 'right' : 'wrong') : 'idle'
            const locked = right !== undefined || marked
            const letter = String.fromCharCode(65 + i)
            const noteHere = right !== undefined ? right === i : lastWrong === i
            return (
              <Fragment key={i}>
                <li>
                  <button
                    type="button"
                    className={q.opt}
                    data-state={state}
                    aria-pressed={marked}
                    aria-disabled={locked && !marked ? true : undefined}
                    onClick={() => pick(i)}
                  >
                    <span className={q.letter}>
                      {letter}
                      {marked && (
                        <svg viewBox="0 0 50 44" aria-hidden="true">
                          <motion.path
                            d={o.ok ? RING_OK : RING_BAD}
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{ duration: 0.45, ease: 'linear' }}
                          />
                        </svg>
                      )}
                    </span>
                    <span className={q.text}>
                      {o.t}
                      {marked && !o.ok && (
                        <svg className={q.strike} viewBox="0 0 300 12" preserveAspectRatio="none" aria-hidden="true">
                          <motion.path d={STRIKE} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.35, duration: 0.35, ease: 'linear' }} />
                        </svg>
                      )}
                    </span>
                    <span className={q.mark}>
                      {marked && !o.ok && (
                        <motion.span className={q.ne} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }}>
                          ne
                        </motion.span>
                      )}
                      {marked && o.ok && (
                        <motion.span
                          className={s.stamp}
                          data-tone="pencil"
                          initial={{ scale: 1.35, rotate: -16, opacity: 0 }}
                          animate={{ scale: 1, rotate: -7, opacity: 1 }}
                          transition={{ delay: 0.3, duration: 0.22, ease: [0.3, 0.7, 0.2, 1] }}
                        >
                          Točno
                        </motion.span>
                      )}
                    </span>
                  </button>
                </li>
                <AnimatePresence>
                  {noteHere && (
                    <motion.li
                      key={`note-${i}-${right !== undefined ? 'ok' : 'bad'}`}
                      className={q.rev}
                      data-tone={right !== undefined ? 'ok' : 'bad'}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3, delay: 0.35 }}
                    >
                      <span className={q.revLead} aria-hidden="true" />
                      <Tri label={letter} />
                      <div className={q.revBody}>
                        <span className={q.revHead}>
                          Rev. {letter} · {right !== undefined ? 'obrazloženje' : 'ispravak'}
                        </span>
                        {right !== undefined ? (
                          <>
                            <p>
                              Kružno raspoređivanje ne gleda kapacitet: svaki poslužitelj dobiva trećinu prometa, 6 zahtjeva/s. Mali s
                              jednom jezgrom obradi oko 5 zahtjeva/s (200 ms procesora po zahtjevu), pa mu red raste i počinje odbijati
                              zahtjeve, iako Veliki ima mnogo slobodnog mjesta. Provjerite u detalju A: promet 18, kružno.
                            </p>
                            <button type="button" className={s.btnSmall} onClick={() => setTried([])}>
                              Ponovi kontrolu
                            </button>
                          </>
                        ) : (
                          <p>
                            {o.why} <b>Odaberite drugi odgovor.</b>
                          </p>
                        )}
                      </div>
                    </motion.li>
                  )}
                </AnimatePresence>
              </Fragment>
            )
          })}
        </ol>
        {!tried.length && (
          <p className={q.hint}>Odaberite jedan odgovor. Provjeravatelj ga zaokružuje: plavo je točno, crveno se ispravlja.</p>
        )}
      </div>
    </div>
  )
}

function Tri({ label }: { label: string }) {
  return (
    <svg className={q.tri} viewBox="0 0 24 22" aria-hidden="true">
      <path d="M12,2 L22,20 L2,20 Z" />
      <text x="12" y="17.5" textAnchor="middle">
        {label}
      </text>
    </svg>
  )
}
