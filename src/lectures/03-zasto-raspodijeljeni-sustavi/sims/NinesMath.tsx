/**
 * „Matematika devetki”: three small explainers on the engine's formulas.
 *   MtbfWidget          A = MTBF / (MTBF + MTTR), with one seeded year of a single server as red ticks
 *   RedundancyMultiples one / two in series / two in parallel / three in parallel, side by side
 *   AnyDownGrid         N servers at A: how often is at least one down? (look at random moments vs 1 − Aⁿ)
 */
import { useMemo, useRef, useState } from 'react'
import { Eye } from 'lucide-react'
import { Button, MiniServer, Rough, RoughBox, Slider, createRng, plural, useWidth, type Rng } from '../../../kit'
import { AVAIL_STEPS, downtime, fmtHours, num, oneServerYear, parallelAvailability, pctA, probAnyDown, seriesAvailability } from '../model'
import { Srv } from './parts'
import styles from '../styles.module.css'

/* =====================================================================
   MTBF / MTTR
   ===================================================================== */

const MTBF_STEPS = [40, 100, 200, 396, 1000, 4000, 9996]
const MTTR_STEPS = [1, 2, 4, 8, 24]

export function MtbfWidget() {
  const [bi, setBi] = useState(3)
  const [ri, setRi] = useState(2)
  const [ref, width] = useWidth<HTMLDivElement>()
  const mtbf = MTBF_STEPS[bi]
  const mttr = MTTR_STEPS[ri]
  const y = useMemo(() => oneServerYear(mtbf, mttr), [mtbf, mttr])
  const W = Math.max(300, Math.min(720, width ?? 640))
  const H = 92
  const x0 = 10
  const X = (h: number) => x0 + (h / 8760) * (W - 2 * x0)
  return (
    <div className={styles.widget} ref={ref}>
      <div className={styles.widgetControls}>
        <Slider label="MTBF: prosječno vrijeme između kvarova" value={bi} min={0} max={MTBF_STEPS.length - 1} onChange={setBi} format={(i) => `${num(MTBF_STEPS[i])} h`} hint={`≈ ${num(MTBF_STEPS[bi] / 24, MTBF_STEPS[bi] < 240 ? 1 : 0)} dana`} />
        <Slider label="MTTR: prosječno vrijeme popravka" value={ri} min={0} max={MTTR_STEPS.length - 1} onChange={setRi} format={(i) => `${MTTR_STEPS[i]} h`} />
      </div>
      <p className={styles.formulaLine}>
        A = MTBF / (MTBF + MTTR) = {num(mtbf)} / ({num(mtbf)} + {mttr}) = <b>{pctA(y.A)}</b>
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Jedna godina jednog poslužitelja: ${plural(y.failures, ['kvar', 'kvara', 'kvarova'])}, ukupno ${fmtHours(y.downtimeH)} nedostupno.`} style={{ display: 'block', height: 'auto', maxWidth: 720 }}>
        <text x={x0} y={16} className="k-svg-hand" style={{ fontSize: 18, fill: 'var(--ink-2)' }}>
          jedna godina jednog poslužitelja
        </text>
        <Rough shape={{ k: 'line', x1: x0, y1: 48, x2: W - x0, y2: 48 }} seed={8601} stroke="var(--green)" strokeWidth={2.2} roughness={0.6} />
        {y.outages.map((o, i) => (
          <rect key={i} x={X(o.startH)} y={32} width={Math.max(2, X(o.endH) - X(o.startH))} height={32} style={{ fill: 'var(--red)' }} />
        ))}
        {['dan 1', 'dan 91', 'dan 182', 'dan 274', 'dan 365'].map((d, i) => (
          <text key={d} x={x0 + (i / 4) * (W - 2 * x0)} y={84} textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'} className="k-svg-mono" style={{ fontSize: 12, fill: 'var(--ink-3)' }}>
            {d}
          </text>
        ))}
      </svg>
      <p className={styles.readout}>
        <span>
          formula: <strong>{fmtHours(y.formulaDownH)}</strong> nedostupno godišnje
        </span>
        <span>
          ova godina (seed 7): <strong>{y.failures}</strong> {plural(y.failures, ['kvar', 'kvara', 'kvarova'], false)}, <strong>{fmtHours(y.downtimeH)}</strong>
        </span>
      </p>
    </div>
  )
}

/* =====================================================================
   Series vs parallel, side by side
   ===================================================================== */

const MULTI_STEPS = AVAIL_STEPS.slice(0, 5)

type Kind = 'one' | 'series' | 'par2' | 'par3'

function MultiDrawing({ kind, seed }: { kind: Kind; seed: number }) {
  const card = (x: number, y: number, n: string, i: number) => <Srv key={n} x={x} y={y} w={50} h={30} name={n} seed={seed + i * 3} nameSize={18} />
  const line = (x1: number, y1: number, x2: number, y2: number, i: number) => <Rough key={`l${i}`} shape={{ k: 'line', x1, y1, x2, y2 }} seed={seed + 20 + i} stroke="var(--ink-3)" strokeWidth={1.3} roughness={0.6} />
  let body
  if (kind === 'one') body = [line(4, 55, 45, 55, 0), card(45, 40, 'A', 0), line(95, 55, 136, 55, 1)]
  else if (kind === 'series') body = [line(2, 55, 12, 55, 0), card(12, 40, 'A', 0), line(62, 55, 78, 55, 1), card(78, 40, 'B', 1), line(128, 55, 138, 55, 2)]
  else {
    const ys = kind === 'par2' ? [18, 62] : [2, 40, 78]
    body = [
      ...ys.map((y, i) => line(4, 55, 45, y + 15, i)),
      ...ys.map((y, i) => card(45, y, ['A', 'B', 'C'][i], i)),
      ...ys.map((y, i) => line(95, y + 15, 136, 55, i + 5)),
    ]
  }
  return (
    <svg viewBox="0 0 140 110" role="img" aria-label={{ one: 'jedan poslužitelj', series: 'dva poslužitelja u nizu', par2: 'dva poslužitelja paralelno', par3: 'tri poslužitelja paralelno' }[kind]} style={{ display: 'block', width: '100%', maxWidth: 190, height: 'auto', margin: '0 auto' }}>
      {body}
    </svg>
  )
}

export function RedundancyMultiples() {
  const [ai, setAi] = useState(2)
  const A = MULTI_STEPS[ai]
  const items: { kind: Kind; title: string; rule: string; value: number }[] = [
    { kind: 'one', title: 'jedan', rule: 'A', value: A },
    { kind: 'series', title: 'dva u nizu: moraju oba', rule: 'A × A', value: seriesAvailability([A, A]) },
    { kind: 'par2', title: 'dva paralelno: dovoljan je jedan', rule: '1 − (1 − A)²', value: parallelAvailability([A, A]) },
    { kind: 'par3', title: 'tri paralelno', rule: '1 − (1 − A)³', value: parallelAvailability([A, A, A]) },
  ]
  return (
    <div className={styles.widget}>
      <Slider label="Dostupnost jednog poslužitelja (A)" value={ai} min={0} max={MULTI_STEPS.length - 1} onChange={setAi} format={(i) => pctA(MULTI_STEPS[i])} hint={`sam: ${fmtHours(downtime(A).perYearH)} nedostupno godišnje`} />
      <div className={styles.reasons} style={{ margin: 0, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))', gap: 14 }}>
        {items.map((it, i) => (
          <RoughBox key={it.kind} className={styles.reason} seed={8640 + i} stroke={it.value < A ? 'var(--red)' : it.value > A ? 'var(--green)' : 'var(--ink-3)'} pad={2}>
            <span className={styles.formulaLabel}>{it.title}</span>
            <MultiDrawing kind={it.kind} seed={8650 + i * 30} />
            <span className={styles.formulaBig}>{pctA(it.value)}</span>
            <span className={styles.formulaSub}>{fmtHours(downtime(it.value).perYearH)} godišnje</span>
            <span className={styles.formulaExpr}>{it.rule}</span>
          </RoughBox>
        ))}
      </div>
    </div>
  )
}

/* =====================================================================
   „Barem jedan je dolje”
   ===================================================================== */

export function AnyDownGrid() {
  const [n, setN] = useState(10)
  const [ai, setAi] = useState(2)
  const [down, setDown] = useState<boolean[]>([])
  const [looks, setLooks] = useState({ total: 0, any: 0 })
  const rng = useRef<Rng | null>(null)
  const A = MULTI_STEPS[ai]
  const p = probAnyDown(n, A)

  const look = (times: number) => {
    rng.current ??= createRng(303)
    const r = rng.current
    let any = 0
    let last: boolean[] = []
    for (let k = 0; k < times; k++) {
      last = Array.from({ length: n }, () => r.next() > A)
      if (last.some(Boolean)) any++
    }
    setDown(last)
    setLooks((l) => ({ total: l.total + times, any: l.any + any }))
  }
  const resetLooks = () => {
    setDown([])
    setLooks({ total: 0, any: 0 })
  }

  const cols = 10
  const rows = Math.ceil(n / cols)
  const cw = 44
  const W = cols * cw
  const H = rows * 52 + 4
  const anyNow = down.some(Boolean)
  return (
    <div className={styles.widget}>
      <div className={styles.widgetControls}>
        <Slider
          label="Broj poslužitelja"
          value={n}
          min={1}
          max={20}
          onChange={(v) => {
            setN(v)
            resetLooks()
          }}
          format={(v) => `${v}`}
        />
        <Slider
          label="Dostupnost svakoga"
          value={ai}
          min={0}
          max={MULTI_STEPS.length - 1}
          onChange={(i) => {
            setAi(i)
            resetLooks()
          }}
          format={(i) => pctA(MULTI_STEPS[i])}
        />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${n} poslužitelja; ${down.length ? `u ovom trenutku dolje: ${down.filter(Boolean).length}` : 'još niste pogledali'}.`} style={{ display: 'block', height: 'auto', maxWidth: 520 }}>
        {Array.from({ length: n }, (_, i) => (
          <MiniServer key={i} x={(i % cols) * cw + 4} y={Math.floor(i / cols) * 52 + 4} w={36} h={44} mood={down[i] ? 'dead' : 'calm'} seed={8700 + i * 11} />
        ))}
      </svg>
      <div className={styles.buttonRow}>
        <Button icon={Eye} onClick={() => look(1)}>
          Pogledaj u nasumičnom trenutku
        </Button>
        <Button variant="secondary" onClick={() => look(100)}>
          Pogledaj 100 puta
        </Button>
      </div>
      <p className={styles.tally} aria-live="polite">
        {looks.total === 0 ? (
          'Još niste pogledali.'
        ) : (
          <>
            {anyNow ? 'Sad je barem jedan dolje. ' : 'Sad rade svi. '}
            Barem jedan dolje u <strong>{num(looks.any)}</strong> od {num(looks.total)} pogleda (<strong>{num((looks.any / looks.total) * 100, 1)} %</strong>)
          </>
        )}
        <br />
        formula: 1 − A<sup>{n}</sup> = 1 − {num(A, 5)}
        <sup>{n}</sup> = <strong>{num(p * 100, 1)} %</strong>
      </p>
    </div>
  )
}
