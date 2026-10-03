import { useState } from 'react'
import { PenMark } from './Glyphs'
import q from './quiz.module.css'

interface Option {
  id: string
  text: string
  correct: boolean
  why: string
}

interface Question {
  id: string
  text: string
  options: readonly Option[]
  /** shown already solved, as a worked example */
  solved?: string
}

const QUESTIONS: readonly Question[] = [
  {
    id: 'pravilo',
    text: 'Klopa ima Mali (1 vCPU) i Veliki (4 vCPU) iza istog load balancera. U 12:00 promet naglo poraste. Koje pravilo raspoređivanja manje opterećuje Malog?',
    solved: 'b',
    options: [
      {
        id: 'a',
        text: 'Kružno: svaki poslužitelj dobije jednak broj zahtjeva.',
        correct: false,
        why: 'Upravo zato Mali strada: dobiva jednako zahtjeva kao Veliki, a ima četiri puta manje jezgri. Red mu se brzo napuni i počne odbijati zahtjeve (503).',
      },
      {
        id: 'b',
        text: 'Najmanje aktivnih veza: novi zahtjev ide onome tko trenutačno ima najmanje zahtjeva u obradi.',
        correct: true,
        why: 'Mali sporije završava posao, pa ima više otvorenih veza i dobiva manje novih zahtjeva. Veliki ih brže završava i dobiva više.',
      },
      {
        id: 'c',
        text: 'Svejedno je, load balancer ionako zna koliko je koji poslužitelj jak.',
        correct: false,
        why: 'Ne zna. Bez dodatnih podataka (težina ili mjerenja) load balancer ne zna ništa o jezgrama ni RAM-u. Vidi samo zahtjeve koje šalje i veze koje su još otvorene.',
      },
    ],
  },
  {
    id: 'kvar',
    text: 'Veliki se sruši, a health check to potvrdi tek nakon 2 sekunde. Koju grešku studenti dobivaju u te dvije sekunde?',
    options: [
      {
        id: 'a',
        text: '503: red Velikog je pun.',
        correct: false,
        why: '503 znači da je poslužitelj živ, ali mu je red pun. Srušeni Veliki ne odgovara uopće.',
      },
      {
        id: 'b',
        text: '502: load balancer i dalje šalje zahtjeve Velikom, a on ne odgovara.',
        correct: true,
        why: 'Dok health check ne potvrdi kvar, Veliki je još u rotaciji, pa svaki zahtjev poslan njemu završi s 502. Kad ga ukloni, 502 prestaju; ako Mali i Srednji ne stižu, javljaju se 503.',
      },
      {
        id: 'c',
        text: 'Nijednu: load balancer odmah preusmjeri promet na Malog i Srednjeg.',
        correct: false,
        why: 'Ne odmah. Kvar se otkriva tek nakon nekoliko neuspjelih provjera: u simulaciji 2 s, u stvarnosti npr. 30 s.',
      },
    ],
  },
  {
    id: 'selektor',
    text: 'Kako Service zna kojim Podovima smije slati promet?',
    options: [
      {
        id: 'a',
        text: 'Po imenu Poda, npr. klopa-api-7d9c6b5f4-2xkqp.',
        correct: false,
        why: 'Imena se mijenjaju svaki put kad Kubernetes napravi novi Pod, pa ih Service ne pamti po imenu.',
      },
      {
        id: 'b',
        text: 'Po oznaci: bira Podove s oznakom app=klopa-api, a promet šalje samo spremnima.',
        correct: true,
        why: 'Selektor app=klopa-api odgovara oznaci iz predloška u Deploymentu. Pod u CrashLoopBackOffu i dalje ima oznaku, ali nije spreman, pa ne dobiva promet.',
      },
      {
        id: 'c',
        text: 'Po čvoru: svaki čvor ima svoj Service.',
        correct: false,
        why: 'Service je jedan objekt za cijeli klaster i ne ovisi o tome na kojem čvoru Podovi rade.',
      },
    ],
  },
]

function QuestionBlock({ item, n, total }: { item: Question; n: number; total: number }) {
  const [picked, setPicked] = useState<string | null>(item.solved ?? null)
  const [tried, setTried] = useState<readonly string[]>([])
  const at = item.options.findIndex((o) => o.id === picked)
  const chosen = at >= 0 ? item.options[at] : null
  const qid = `tk-quiz-${item.id}`

  const pick = (o: Option) => {
    setPicked(o.id)
    if (!o.correct) setTried((t) => (t.includes(o.id) ? t : [...t, o.id]))
  }

  return (
    <div className={q.q}>
      <div className={q.qHead}>
        <p className={q.kicker}>
          Pitanje {n} od {total} · {item.solved ? 'riješeni primjer' : 'zaokružite jedan odgovor'}
        </p>
        <h3 className={q.question} id={qid}>
          {item.text}
        </h3>
      </div>
      {n === 1 && (
        <p className={q.marginHead} aria-hidden="true">
          bilješke
        </p>
      )}
      <span className={q.marginRule} aria-hidden="true" />

      <ol className={q.options} aria-labelledby={qid}>
        {item.options.map((o, i) => {
          const on = o.id === picked
          const struck = tried.includes(o.id) && !on
          return (
            <li key={o.id} className={q.row} style={{ gridRow: i + 2, order: 2 * i + 2 }}>
              <button
                type="button"
                className={q.option}
                aria-pressed={on}
                onClick={() => pick(o)}
                data-state={on ? (o.correct ? 'right' : 'wrong') : struck ? 'struck' : undefined}
              >
                <span className={q.letter}>
                  {String.fromCharCode(65 + i)}
                  {on && <PenMark key={`c${picked}`} kind="circle" w={74} h={64} seed={11 + i + n} className={q.circle} />}
                </span>
                <span className={q.optText}>
                  <span className={q.optInner}>
                    {o.text}
                    {(struck || (on && !o.correct)) && <PenMark kind="strike" w={600} h={22} seed={30 + i + n} stretch className={q.strike} />}
                  </span>
                </span>
                {(on || struck) && (
                  <span className={`${q.stamp} ${o.correct ? q.stampRight : q.stampWrong}`} aria-hidden="true">
                    {o.correct ? 'Točno' : 'Netočno'}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ol>

      {/* the teacher's pen note: starts level with the circled answer and may run past it into the
          flexible last row, instead of stretching that answer's row */}
      <div className={q.margin} aria-live="polite" style={{ gridRow: `${Math.max(0, at) + 2} / -1`, order: 2 * Math.max(0, at) + 3 }}>
        {chosen && (
          <div className={q.note} key={`${chosen.id}`}>
            <PenMark kind="arrow" w={64} h={40} seed={40 + at + n} className={q.arrow} />
            <p className={q.noteHead}>{chosen.correct ? 'Točno.' : 'Nije točno.'}</p>
            <p className={q.noteText}>{chosen.why}</p>
            {!chosen.correct && <p className={q.noteRetry}>Pokušajte s drugim odgovorom.</p>}
          </div>
        )}
      </div>
    </div>
  )
}

export function Quiz() {
  return (
    <div className={q.sheet}>
      {QUESTIONS.map((item, i) => (
        <QuestionBlock key={item.id} item={item} n={i + 1} total={QUESTIONS.length} />
      ))}
    </div>
  )
}
