/**
 * "Četiri prijave kvara": four broken URLs, seen only from Petra's side — what her browser says, how long she waited,
 * what curl prints and the waterfall. The student names the broken layer (name · route · door · process) from the
 * symptom alone; the cause is revealed after a correct answer. Uses the same model as the lab (../model.ts).
 */
import { useState } from 'react'
import { Play } from 'lucide-react'
import { Button, Goals, RoughBox, SimFrame, StickyNote } from '../../../kit'
import { DIAGNOSES, LAYER_LABEL, OUTCOME_LABEL, TICKETS, fmtMs, traceRequest, type Layer, type Outcome } from '../model'
import { useElapsed } from '../useElapsed'
import { Coded } from './Coded'
import { Waterfall } from './Waterfall'
import styles from '../styles.module.css'

const TRACES = TICKETS.map((t) => traceRequest(t.params))
const NOTE_C = ['yellow', 'blue', 'pink', 'green'] as const

const HINT: Record<Outcome, string> = {
  nxdomain: 'Pogledajte vodopad: je li ijedan paket krenuo prema poslužitelju nakon DNS-a?',
  refused: 'Greška je stigla za dvadesetak milisekundi – netko je odgovorio „ne”. Tko to može biti?',
  timeout: 'Petra je čekala pet sekundi i nitko nije rekao ni „ne”. Gdje je paket mogao nestati?',
  'bad-gateway': 'Ovaj odgovor ima statusni kod, dakle stigao je od nekoga na poslužitelju. Od koga?',
  ok: '',
}

/** Petra's phone while she waits and after: the address bar, the browser's page and a stopwatch. */
function PhoneView({ i, shot }: { i: number; shot: number }) {
  const t = TRACES[i]
  const anim = shot ? Math.min(2.6, 0.5 + t.total / 2000) : 0
  const e = useElapsed(anim, 0.15)
  const waiting = shot > 0 && e < anim - 1e-6
  const ms = shot ? (anim ? (t.total * e) / anim : t.total) : 0
  const shown = shot > 0 && !waiting
  return (
    <div className={styles.phoneRow}>
      <RoughBox className={styles.phone} strokeWidth={2.2} double seed={9601 + i} pad={2} ariaLabel="Petrin mobitel">
        <RoughBox className={styles.phoneUrl} stroke="var(--ink-3)" strokeWidth={1.2} seed={9611 + i} pad={1}>
          {t.url}
        </RoughBox>
        <div className={styles.phoneScreen}>
          {!shot && <p className={styles.phoneTitle}>Pošaljite zahtjev</p>}
          {waiting && <p className={styles.phoneTitle}>Učitavanje…</p>}
          {shown && (
            <>
              <p className={styles.phoneTitle}>{t.browser.title}</p>
              <p className={styles.phoneCode}>{t.browser.code}</p>
            </>
          )}
          <p className={styles.phoneWait} aria-live="off">
            {shot ? `${fmtMs(ms)}` : '0 ms'}
          </p>
        </div>
      </RoughBox>
      <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
        {shown ? (
          <>
            <RoughBox className={`${styles.clue} k-pinned`} fillColor="var(--term-bg)" fillStyle="solid" stroke="var(--ink-2)" strokeWidth={1.6} seed={9621 + i} ariaLabel="Ispis naredbe curl na Laninu laptopu">
              <span className={styles.clueTitle}>Lanin laptop</span>
              <span className={styles.cluePrompt}>
                <b>$</b> {t.curlCmd}
              </span>
              <span className={t.outcome === 'ok' ? styles.clueOk : styles.clueBad}>{t.curl}</span>
            </RoughBox>
            <Waterfall trace={t} nowMs={t.total} caption={`Petra je čekala ${fmtMs(t.total)}.${t.timeoutNote ? ` Istek vremena: ${t.timeoutNote}.` : ''}`} />
          </>
        ) : (
          <p className={styles.controlNote}>Simptom ćete vidjeti kao Petra: poruku preglednika, koliko je čekala, ispis naredbe curl i vodopad.</p>
        )}
      </div>
    </div>
  )
}

export function DiagnosisChallenge() {
  const [sel, setSel] = useState(0)
  const [shots, setShots] = useState<number[]>([0, 0, 0, 0])
  const [picked, setPicked] = useState<(Layer | 'spor' | null)[]>([null, null, null, null])
  const [solved, setSolved] = useState<boolean[]>([false, false, false, false])
  const ticket = TICKETS[sel]
  const trace = TRACES[sel]
  const shot = shots[sel]
  const choice = picked[sel]
  const right = choice === ticket.layer

  const send = () => setShots((s) => s.map((v, i) => (i === sel ? v + 1 : v)))
  const answer = (v: Layer | 'spor') => {
    setPicked((p) => p.map((x, i) => (i === sel ? v : x)))
    if (v === ticket.layer) setSolved((s) => s.map((x, i) => (i === sel ? true : x)))
  }

  return (
    <SimFrame
      title="četiri prijave kvara"
      subtitle="Četiri dana, četiri poruke od Petre. Vidite samo ono što vidi ona – i odredite koji je sloj pokvaren."
      hint="odaberite prijavu, pošaljite zahtjev kao Petra i po simptomu odaberite uzrok. Gledajte koliko je čekala i postoji li statusni kod."
      minHeight={300}
      controls={
        <>
          <Button variant="primary" icon={Play} onClick={send}>
            {shot ? 'Pošalji ponovno' : 'Pošalji zahtjev kao Petra'}
          </Button>
          <div className={styles.answers} role="group" aria-label="Što je pokvareno?">
            <p className={styles.controlNote} style={{ fontStyle: 'normal', fontFamily: 'var(--f-ui)', fontWeight: 700 }}>
              Što je pokvareno?
            </p>
            {DIAGNOSES.map((d) => (
              <Button key={d.value} size="sm" active={choice === d.value} disabled={!shot} onClick={() => answer(d.value)}>
                {d.label}
              </Button>
            ))}
          </div>
          {choice && (
            <StickyNote c={right ? 'green' : 'pink'} className={styles.feedbackNote}>
              <p className={styles.feedback} aria-live="polite">
                {right ? (
                  <>
                    <b>✓ Točno – {LAYER_LABEL[ticket.layer]}.</b> <Coded text={ticket.reveal} />
                  </>
                ) : (
                  <>
                    <b>✗ Ne baš.</b> {HINT[trace.outcome]}
                  </>
                )}
              </p>
            </StickyNote>
          )}
        </>
      }
      stats={
        <Goals
          title="Dijagnosticirajte četiri pokvarena URL-a samo po simptomu"
          goals={TICKETS.map((t, i) => ({ text: `Prijava ${t.id} (${t.when}): ${solved[i] ? OUTCOME_LABEL[TRACES[i].outcome] + ' → ' + LAYER_LABEL[t.layer] : '?'}`, done: solved[i] }))}
        />
      }
    >
      <div className={styles.challengeWrap}>
        <div className={styles.tickets} role="group" aria-label="Prijave kvara">
          {TICKETS.map((t, i) => (
            <StickyNote key={t.id} c={NOTE_C[i]} rotate={i % 2 ? 0.8 : -0.7} className={styles.ticketNote}>
              <button type="button" className={styles.ticket} aria-pressed={i === sel} onClick={() => setSel(i)}>
                <span className={styles.ticketWhen}>
                  {t.when} {solved[i] ? '✓' : ''}
                </span>
                <span className={styles.ticketSays}>„{t.says}”</span>
                <span className={styles.ticketUrl}>{TRACES[i].url}</span>
              </button>
            </StickyNote>
          ))}
        </div>
        <PhoneView key={`${sel}-${shot}`} i={sel} shot={shot} />
      </div>
    </SimFrame>
  )
}
