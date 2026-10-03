import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { breakLine } from './geom'
import { tokenizeYaml } from './yaml'
import s from './nacrt.module.css'
import c from './spec.module.css'

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
          resources:
            requests:
              cpu: "500m"
              memory: 512Mi`

const LINES = YAML.split('\n')
/** item balloons: line number → note number */
const NOTES: Record<number, number> = { 6: 1, 9: 2, 17: 3, 19: 4 }
const NOTE_TEXT: [string, string][] = [
  ['replicas', 'Kubernetes stalno drži tri kopije Poda; ako jedna padne, pokreće novu.'],
  ['selector', 'ovom oznakom Deployment (i Service) prepoznaje „svoje” Podove.'],
  ['image', 'točna verzija slike. Nova oznaka, npr. 1.5.0, znači novo uvođenje.'],
  ['requests', 'koliko CPU-a i RAM-a scheduler rezervira na čvoru za svaki Pod.'],
]
/** the excerpt shows only the lines that carry the notes (plus the header) */
const EXCERPT = [1, 2, 3, 4, 5, 6, 9, 17, 19, 20, 21]
const LH = 28
const PAD = 12
/** code panel border + head: where the first row starts */
const TOP = 48

type Row = { kind: 'line'; n: number } | { kind: 'gap'; count: number }

function rows(open: boolean): Row[] {
  if (open) return LINES.map((_, i) => ({ kind: 'line', n: i + 1 }))
  const out: Row[] = []
  let prev = 0
  for (const n of EXCERPT) {
    if (n > prev + 1) out.push({ kind: 'gap', count: n - prev - 1 })
    out.push({ kind: 'line', n })
    prev = n
  }
  return out
}

function redaka(n: number): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return `${n} redak`
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} retka`
  return `${n} redaka`
}

export function CodeSheet() {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [heights, setHeights] = useState<number[]>([0, 0, 0, 0])
  const notesRef = useRef<HTMLOListElement | null>(null)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  // measure the notes so stacked notes never overlap and leaders can bend to reach them
  useLayoutEffect(() => {
    const el = notesRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const hs = [...el.children].map((ch) => (ch as HTMLElement).offsetHeight)
      setHeights((prev) => (prev.length === hs.length && prev.every((h, i) => h === hs[i]) ? prev : hs))
    })
    ro.observe(el)
    for (const ch of el.children) ro.observe(ch)
    return () => ro.disconnect()
  }, [])

  const rs = rows(open)
  const rowOf = (n: number) => rs.findIndex((r) => r.kind === 'line' && r.n === n)
  const noteLines = Object.keys(NOTES).map(Number)
  const ys: number[] = []
  noteLines.forEach((ln, i) => {
    const want = PAD + rowOf(ln) * LH - 4
    ys.push(i === 0 ? Math.max(0, want) : Math.max(want, ys[i - 1] + heights[i - 1] + 14))
  })
  const bodyH = Math.max(PAD * 2 + rs.length * LH, ys[3] + heights[3] + 8)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(YAML)
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className={c.sheet}>
      <div className={c.code}>
        <div className={c.head}>
          <span className={c.file}>
            <svg viewBox="0 0 14 16" aria-hidden="true">
              <path d="M1,1 H9 L13,5 V15 H1 Z M9,1 V5 H13" />
            </svg>
            deployment.yaml
          </span>
          <span className={c.meta}>List K-01 · YAML · {redaka(LINES.length)}</span>
          <button type="button" className={s.btnSmall} onClick={copy}>
            {copied ? 'Kopirano ✓' : 'Kopiraj'}
          </button>
          <span className={s.srOnly} aria-live="polite">
            {copied ? 'Kod je kopiran.' : ''}
          </span>
        </div>
        <div className={c.body} style={{ minHeight: bodyH }}>
          <pre className={c.pre}>
            <code>
              {rs.map((r, i) =>
                r.kind === 'gap' ? (
                  <span key={`g${i}`} className={c.gap} aria-label={`${redaka(r.count)} izostavljeno`}>
                    <svg viewBox="0 0 400 14" preserveAspectRatio="none" aria-hidden="true">
                      <path d={breakLine(0, 400, 7, 5)} />
                    </svg>
                    <span>{redaka(r.count)}</span>
                    {'\n'}
                  </span>
                ) : (
                  <span key={r.n} className={c.line}>
                    <span className={c.ln} aria-hidden="true">
                      {String(r.n).padStart(2, '0')}
                    </span>
                    {tokenizeYaml(LINES[r.n - 1]).map((tk, j) => (
                      <span key={j} className={s[`y_${tk.k}`]}>
                        {tk.t}
                      </span>
                    ))}
                    {NOTES[r.n] && (
                      <span className={c.inlineBal} aria-label={`napomena ${NOTES[r.n]}`}>
                        {NOTES[r.n]}
                      </span>
                    )}
                    {'\n'}
                  </span>
                ),
              )}
            </code>
          </pre>
        </div>
        <div className={c.foot}>
          <span className={c.footNote}>{open ? 'Cijeli list' : 'Izvadak: samo retci s napomenama'}</span>
          <button type="button" className={s.btnSmall} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? 'Prikaži samo izvadak' : `Prikaži cijeli kod (${redaka(LINES.length)})`}
          </button>
        </div>
      </div>

      {/* balloons on the sheet margin, leaders bending to the notes */}
      <svg className={c.leaders} style={{ height: TOP + bodyH }} aria-hidden="true">
        {noteLines.map((ln, i) => {
          const ry = TOP + PAD + rowOf(ln) * LH + LH / 2
          const ny = TOP + ys[i] + 13
          return (
            <g key={ln}>
              <path d={`M0,${ry} H10 M30,${ry} H40 V${ny} H58`} className={c.leader} />
              <circle cx={20} cy={ry} r={10} className={c.balCircle} />
              <text x={20} y={ry + 4.5} textAnchor="middle" className={c.balTxt}>
                {i + 1}
              </text>
              <circle cx={58} cy={ny} r={2.2} className={c.leaderDot} />
            </g>
          )
        })}
      </svg>
      <ol className={c.notes} ref={notesRef} style={{ minHeight: TOP + bodyH }}>
        {NOTE_TEXT.map(([key, text], i) => (
          <li key={key} style={{ top: TOP + ys[i] }}>
            <span className={`${s.balloon} ${c.noteBal}`}>{i + 1}</span>
            <span>
              <code>{key}</code>: {text}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

const PODS = [
  ['klopa-api-7d9c6b8f5-2xkqp', '1/1', 'Running', '0', '12m'],
  ['klopa-api-7d9c6b8f5-9wz4m', '1/1', 'Running', '0', '12m'],
  ['klopa-api-7d9c6b8f5-lp6rt', '0/1', 'CrashLoopBackOff', '5 (40s ago)', '12m'],
  ['klopa-api-5f8b7c9d4-hk2vn', '1/1', 'Running', '0', '48s'],
  ['klopa-api-5f8b7c9d4-x7mzc', '0/1', 'Pending', '0', '48s'],
]

function Listing({ short }: { short: boolean }) {
  const pad = (v: string, n: number) => v.padEnd(n, ' ')
  const nw = short ? 10 : 29
  const name = (n: string) => (short ? '…' + n.slice(-6) : n)
  return (
    <pre className={short ? c.printShort : c.printLong}>
      <code>
        <span className={c.prompt}>$ </span>
        <span className={c.cmd}>kubectl get pods{short ? '' : ' -l app=klopa-api'}</span>
        {'\n'}
        <span className={c.thead}>{pad('NAME', nw) + pad('READY', 7) + pad('STATUS', 18) + pad('RESTARTS', 14) + 'AGE'}</span>
        {'\n'}
        {PODS.map(([n, r, st, re, age]) => (
          <span key={n} className={st === 'Running' ? undefined : c.rowFlag}>
            {pad(name(n), nw) + pad(r, 7)}
            <span className={st === 'Running' ? c.stOk : st === 'Pending' ? c.stWait : c.stBad}>{pad(st, 18)}</span>
            {pad(re, 14) + age}
            {'\n'}
          </span>
        ))}
      </code>
    </pre>
  )
}

export function Printout() {
  return (
    <figure className={c.printout}>
      <figcaption className={c.printHead}>
        <span>Ispis · terminal</span>
        <span>kubectl 1.31</span>
      </figcaption>
      <div className={c.paper}>
        <Listing short={false} />
        <Listing short />
      </div>
    </figure>
  )
}
