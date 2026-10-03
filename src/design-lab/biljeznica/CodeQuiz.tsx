import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Rough, RoughBox, RoughButton, Check, Cross, Arrow, Boil, RoughAround } from './Sketch'
import { Davor, Lana, Mira } from './Doodles'
import { Mark, SecHead, Tape, PropBoxes, PropQuestion } from './Bits'
import { useSize } from './useSize'
import s from './bj.module.css'
import p from './parts.module.css'

/* ---------- 9. Code: a squared-paper page taped into the notebook ---------- */

const YAML = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: klopa-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: klopa-api
  template:
    metadata:
      labels:
        app: klopa-api
    spec:
      containers:
        - name: klopa-api
          image: registry.klopa.example/klopa-api:1.4.0
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: "1"
              memory: 2Gi`

const LINES = YAML.split('\n')
const PREVIEW = 9

type Pen = 'yellow' | 'pink' | 'green' | 'blue'

/** Notes written in the margin next to particular lines; the same marker as in the prose. */
const NOTES: Record<number, { text: string; c: Pen; who?: 'lana' }> = {
  5: { text: 'Tri kopije: jedna smije pasti.', c: 'yellow', who: 'lana' },
  8: { text: 'oznaka po kojoj ih Service nađe', c: 'green' },
  16: { text: 'točna verzija, nikad :latest', c: 'pink' },
  21: { text: 'rezervira 1 vCPU po Podu', c: 'blue' },
}

function highlightYaml(line: string): { indent: string; body: ReactNode[] } {
  const m = /^(\s*)(- )?([A-Za-z][\w.-]*)(:)(.*)$/.exec(line)
  if (!m) return { indent: '', body: [line] }
  const [, indent, dash, key, colon, rest] = m
  const body: ReactNode[] = []
  if (dash)
    body.push(
      <span key="d" className={p.tPunct}>
        {dash}
      </span>,
    )
  body.push(
    <span key="k" className={p.tKey}>
      {key}
    </span>,
  )
  body.push(
    <span key="c" className={p.tPunct}>
      {colon}
    </span>,
  )
  const val = rest.trim()
  if (val) {
    const cls = /^".*"$/.test(val) ? p.tStr : /^\d+(\.\d+)?$/.test(val) ? p.tNum : p.tVal
    body.push(' ')
    body.push(
      <span key="v" className={cls}>
        {val}
      </span>,
    )
  }
  return { indent, body }
}

function ClipboardGlyph() {
  return (
    <svg viewBox="0 0 20 22" aria-hidden="true">
      <Rough shape={{ k: 'rect', x: 3, y: 4, w: 14, h: 16 }} seed={911} stroke="currentColor" strokeWidth={1.5} roughness={0.8} />
      <Rough shape={{ k: 'rect', x: 7, y: 1.5, w: 6, h: 4 }} seed={912} stroke="currentColor" strokeWidth={1.4} roughness={0.5} />
      <Rough shape={{ k: 'line', x1: 6, y1: 11, x2: 14, y2: 11 }} seed={913} stroke="currentColor" strokeWidth={1.2} roughness={0.5} />
      <Rough shape={{ k: 'line', x1: 6, y1: 15, x2: 12, y2: 15 }} seed={914} stroke="currentColor" strokeWidth={1.2} roughness={0.5} />
    </svg>
  )
}

function CodeSheet() {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const shown = open ? LINES : LINES.slice(0, PREVIEW)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(YAML)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }
  return (
    <RoughBox as="figure" className={p.code} seed={921} strokeWidth={1.8} roughness={1.1} stroke="var(--ink-2)">
      <Tape style={{ top: -13, left: 70, transform: 'rotate(-4deg)' }} />
      <Tape c="blue" style={{ bottom: -12, right: 60, transform: 'rotate(3deg)' }} />
      <figcaption className={p.codeHead}>
        <span className={p.fileTab}>deployment.yaml</span>
        <span className={p.lang}>YAML · Kubernetes</span>
        <RoughButton className={p.copy} onClick={copy} seed={931}>
          <ClipboardGlyph />
          <span aria-live="polite">{copied ? 'Kopirano ✓' : 'Kopiraj'}</span>
        </RoughButton>
      </figcaption>
      <div className={`${p.codeBody} ${open ? '' : p.codeClosed}`}>
        <pre className={p.pre} aria-label="YAML datoteka deployment.yaml">
          <code>
            {shown.map((l, i) => {
              const { indent, body } = highlightYaml(l)
              const note = NOTES[i]
              return (
                <span key={i} className={p.line}>
                  <span className={p.ln} aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className={p.lc}>
                    {indent}
                    {note ? <Mark c={note.c}>{body}</Mark> : body}
                  </span>
                  {note &&
                    (note.who === 'lana' ? (
                      <span className={`${p.lineNote} ${p.lineSay}`} aria-hidden="true">
                        <svg viewBox="8 -2 64 56" className={p.lineFace}>
                          <Lana x={0} y={0} scale={0.62} mood="grin" holding="none" />
                        </svg>
                        <span>
                          <b>Lana:</b> {note.text}
                        </span>
                      </span>
                    ) : (
                      <span className={p.lineNote} aria-hidden="true">
                        ← {note.text}
                      </span>
                    ))}
                </span>
              )
            })}
          </code>
        </pre>
      </div>
      <button type="button" className={p.more} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <svg viewBox="0 0 120 12" preserveAspectRatio="none" aria-hidden="true">
          <Rough
            shape={{
              k: 'curve',
              pts: [
                [2, 7],
                [40, 4],
                [80, 8],
                [118, 5],
              ],
            }}
            seed={901}
            stroke="var(--pen)"
            strokeWidth={1.8}
          />
        </svg>
        {open ? 'Sakrij dio koda ↑' : `Prikaži cijeli kod (${LINES.length} redaka) ↓`}
      </button>
    </RoughBox>
  )
}

/* ---------- the terminal: Lana's laptop, drawn ---------- */

const POD_ROWS: [string, string, string, string, string][] = [
  ['klopa-api-7d9f8c6b5-4xkqp', '1/1', 'Running', '0', '3m12s'],
  ['klopa-api-7d9f8c6b5-9mzrt', '1/1', 'Running', '0', '3m12s'],
  ['klopa-api-7d9f8c6b5-hb2ln', '0/1', 'CrashLoopBackOff', '4 (38s ago)', '3m12s'],
]

function LaptopBase() {
  const [ref, size] = useSize<HTMLDivElement>()
  return (
    <div ref={ref} className={p.laptopBase} aria-hidden="true">
      {size && (
        <svg width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`}>
          <Rough
            shape={{ k: 'path', d: `M${size.w * 0.035} 2 L${size.w * 0.965} 2 L${size.w - 2} ${size.h - 6} L2 ${size.h - 6} Z` }}
            seed={951}
            strokeWidth={2}
            fillColor="var(--paper-2)"
            fillStyle="solid"
          />
          <Rough shape={{ k: 'line', x1: size.w * 0.06, y1: 9, x2: size.w * 0.94, y2: 9 }} seed={953} strokeWidth={1} stroke="var(--ink-3)" dash="3 5" />
          <Rough shape={{ k: 'rect', x: size.w / 2 - 54, y: 13, w: 108, h: size.h - 22 }} seed={952} strokeWidth={1.4} stroke="var(--ink-2)" />
        </svg>
      )}
    </div>
  )
}

function Terminal() {
  const pad = (x: string, n: number) => x.padEnd(n, ' ')
  return (
    <figure className={p.laptop} aria-label="Terminal na Laninom laptopu: izlaz naredbe kubectl get pods">
      <RoughBox className={p.bezel} seed={941} strokeWidth={2.2} roughness={1.1} fillColor="var(--bezel)" fillStyle="solid">
        <span className={p.camera} aria-hidden="true" />
        <div className={p.screen}>
          <pre className={`${p.termPre} ${p.termWide}`}>
            <code>
              <span className={p.tPrompt}>lana@klopa:~$ </span>
              kubectl get pods -l app=klopa-api
              {'\n'}
              <span className={p.tDim}>{`${pad('NAME', 29)}${pad('READY', 8)}${pad('STATUS', 19)}${pad('RESTARTS', 14)}AGE`}</span>
              {'\n'}
              {POD_ROWS.map((r) => (
                <span key={r[0]}>
                  {pad(r[0], 29)}
                  {pad(r[1], 8)}
                  <span className={r[2] === 'Running' ? p.tOk : p.tBad}>{pad(r[2], 19)}</span>
                  {pad(r[3], 14)}
                  {r[4]}
                  {'\n'}
                </span>
              ))}
            </code>
          </pre>
          <pre className={`${p.termPre} ${p.termNarrow}`}>
            <code>
              <span className={p.tPrompt}>$ </span>
              kubectl get pods
              {'\n'}
              {POD_ROWS.map((r) => (
                <span key={r[0]}>
                  {'\n'}
                  {r[0]}
                  {'\n'}
                  <span className={p.tDim}>{'  '}READY </span>
                  {r[1]}
                  <span className={p.tDim}> · </span>
                  <span className={r[2] === 'Running' ? p.tOk : p.tBad}>{r[2]}</span>
                  {'\n'}
                </span>
              ))}
            </code>
          </pre>
        </div>
        <span className={p.sticker} aria-hidden="true">
          Klopa
        </span>
      </RoughBox>
      <LaptopBase />
      <aside className={`${s.note} ${p.termNote}`} data-c="pink" aria-label="Davorova bilješka">
        <Tape style={{ top: -12, left: 20, transform: 'rotate(-10deg)' }} />
        <svg className={p.termNoteArrow} viewBox="0 0 200 90" aria-hidden="true">
          <Arrow
            pts={[
              [196, 80],
              [150, 40],
              [80, 22],
              [8, 14],
            ]}
            stroke="var(--red)"
            strokeWidth={2}
            seed={961}
            draw
          />
        </svg>
        <b>Davor:</b> hb2ln opet pada. Service mu ne šalje ništa, ostala dva rade!
      </aside>
    </figure>
  )
}

export function CodeSection() {
  return (
    <section className={`${s.section} ${s.secCode}`} aria-labelledby="kod-title">
      <SecHead n="5" kicker="kod" title="Tri kopije Klope u YAML-u" id="kod-title" prop={<PropBoxes />} />
      <p className={s.lede}>
        Ovako izgleda Deployment koji traži tri jednaka Poda. Kubernetes ih sam raspodijeli po čvorovima, a Service s prethodnog crteža dijeli promet među one koji su spremni.
      </p>
      <div className={p.codeGrid}>
        <CodeSheet />
        <Terminal />
      </div>
    </section>
  )
}

/* ---------- 10. Quiz: a test sheet, graded in red pen ---------- */

const OPTIONS = [
  { t: 'Veliki, jer kružno raspoređivanje njemu šalje najviše zahtjeva.', ok: false },
  { t: 'Mali, jer dobiva jednako zahtjeva kao ostali, a ima najmanje jezgri.', ok: true },
  { t: 'Nijedan: kružno raspoređivanje uvijek jednako optereti sve poslužitelje.', ok: false },
]

function Feedback({ right }: { right: boolean }) {
  return (
    <motion.div
      className={p.feedback}
      initial={{ opacity: 0, y: -6, rotate: right ? -1.8 : 1.4 }}
      animate={{ opacity: 1, y: 0, rotate: right ? -0.8 : 0.6 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.3 }}
    >
      {/* a short pen arrow from the note up to the answer just picked */}
      <svg className={p.feedbackArrow} viewBox="0 0 60 44" aria-hidden="true">
        <Arrow
          pts={[
            [44, 42],
            [36, 24],
            [20, 8],
          ]}
          stroke={right ? 'var(--green)' : 'var(--red)'}
          strokeWidth={2.2}
          seed={right ? 981 : 982}
          head={8}
          draw="mount"
        />
      </svg>
      <aside className={`${s.note} ${p.feedbackNote}`} data-c={right ? 'green' : 'pink'}>
        <Tape style={{ top: -12, left: 34, transform: 'rotate(-5deg)' }} />
        <svg className={p.feedbackWho} viewBox="0 -10 90 132" aria-hidden="true">
          <Boil slow>{right ? <Mira x={4} y={0} scale={0.95} mood="grin" /> : <Davor x={4} y={0} scale={0.95} mood="worry" />}</Boil>
        </svg>
        <div>
          <strong className={p.feedbackSays}>{right ? 'Teta Mira: „Bravo, točno!”' : 'Davor: „Hmm, ne baš…”'}</strong>
          <p>
            {right
              ? 'Kružno raspoređivanje dijeli broj zahtjeva, a ne posao prema snazi. Mali s jednom jezgrom obradi oko 5 zahtjeva u sekundi, pa kad svatko dobije trećinu prometa, Mali prvi dođe do granice: red mu se napuni i zahtjevi počnu padati.'
              : 'Kružno svakom poslužitelju šalje jednak broj zahtjeva, bez obzira na to koliko je jak. Pogledajte koji poslužitelj ima najmanje jezgri i pokušajte ponovo (ili isprobajte u simulaciji gore).'}
          </p>
        </div>
      </aside>
    </motion.div>
  )
}

export function QuizSection() {
  const [picked, setPicked] = useState<number | null>(null)
  const right = picked !== null && OPTIONS[picked].ok
  return (
    <section className={`${s.section} ${s.secQuiz}`} aria-labelledby="kviz-title">
      <div className={p.test}>
        <QuizSheet />
        <div className={p.testHead}>
          <SecHead n="6" kicker="provjera" title="Kratko pitanje" id="kviz-title" prop={<PropQuestion />} />
          <div className={p.testFields} aria-hidden="true">
            <span>
              Ime: <i className={p.blank}>Lana K.</i>
            </span>
            <span className={p.scoreField}>
              Bodovi:{' '}
              <i className={p.blank}>
                {picked === null ? (
                  '   '
                ) : (
                  <RoughAround key={right ? 'ok' : 'no'} seed={right ? 951 : 952} padX={12} padY={5} className={p.score}>
                    {right ? '1' : '0'}
                  </RoughAround>
                )}
              </i>{' '}
              / 1
            </span>
          </div>
        </div>
        <p className={p.question}>
          Load balancer dijeli zahtjeve <em>kružno</em> na Malog (1&nbsp;vCPU), Srednjeg (2&nbsp;vCPU) i Velikog (4&nbsp;vCPU). Promet polako raste. Koji će se poslužitelj prvi zagušiti?
        </p>
        <ol className={p.options}>
          {OPTIONS.map((o, i) => {
            const sel = picked === i
            return (
              <li key={i}>
                <button type="button" className={p.option} aria-pressed={sel} onClick={() => setPicked(i)} data-state={sel ? (o.ok ? 'ok' : 'bad') : undefined}>
                  <span className={p.optLetter}>
                    {sel && (
                      <svg viewBox="0 0 40 40" aria-hidden="true">
                        <Rough shape={{ k: 'ellipse', cx: 20, cy: 20, w: 36, h: 34 }} seed={960 + i} stroke="var(--pen)" strokeWidth={2.2} multi draw="mount" duration={0.35} />
                      </svg>
                    )}
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className={p.optText}>
                    <span className={sel && !o.ok ? p.struck : undefined}>{o.t}</span>
                  </span>
                  <span className={p.optMark} aria-hidden="true">
                    {sel && (
                      <motion.span
                        className={p.verdict}
                        data-ok={o.ok}
                        initial={{ opacity: 0, rotate: -12, scale: 1.25 }}
                        animate={{ opacity: 1, rotate: -6, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                      >
                        <svg viewBox="0 0 40 40">
                          {o.ok ? <Check x={20} y={22} size={14} seed={970} strokeWidth={3} draw="mount" /> : <Cross x={20} y={20} size={11} seed={971} strokeWidth={3} />}
                        </svg>
                        {o.ok ? 'Točno!' : 'Ne baš…'}
                      </motion.span>
                    )}
                  </span>
                  {sel && <span className={s.srOnly}>{o.ok ? 'Točan odgovor.' : 'Netočan odgovor.'}</span>}
                </button>
                <div aria-live="polite">
                  <AnimatePresence>{sel && <Feedback key={`f${i}`} right={o.ok} />}</AnimatePresence>
                </div>
              </li>
            )
          })}
        </ol>
        {picked === null && <p className={p.quizHint}>Zaokružite jedan odgovor. Ako niste sigurni, vratite se na simulaciju i pustite promet na 25/s.</p>}
      </div>
    </section>
  )
}

/**
 * The test sheet's outline: a cut corner folded over. On paper it is a crisp sheet with a shadow;
 * on the chalkboard the same shape is drawn in chalk (outline + the fold), so it still reads as a sheet.
 */
function QuizSheet() {
  const [ref, size] = useSize<HTMLDivElement>()
  const f = size && size.w < 600 ? 40 : 58
  return (
    <div ref={ref} className={p.sheetSvg} aria-hidden="true">
      {size && (
        <svg width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`}>
          <Rough
            shape={{
              k: 'poly',
              pts: [
                [2, 2],
                [size.w - f, 2],
                [size.w - 2, f],
                [size.w - 2, size.h - 2],
                [2, size.h - 2],
              ],
            }}
            seed={991}
            strokeWidth={1.8}
            roughness={0.9}
            stroke="var(--sheet-edge)"
          />
          <Rough
            shape={{
              k: 'lin',
              pts: [
                [size.w - f, 2],
                [size.w - f + 4, f - 4],
                [size.w - 2, f],
              ],
            }}
            seed={992}
            strokeWidth={1.6}
            stroke="var(--sheet-edge)"
            fillColor="var(--sheet-fold)"
            fillStyle="solid"
          />
        </svg>
      )}
    </div>
  )
}
