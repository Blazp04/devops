import { useState } from 'react'
import { Sparkline, fmt, useWidth } from '../../../kit'
import { clock } from '../incident/model'
import { FAULT_AT, FIX_AT, RUN_S, SIGNALS_SEED, runSignals, type Bucket } from '../signals'
import { TraceWaterfall } from './IncidentPanels'
import css from '../styles.module.css'

/** On narrow sheets two 5 s buckets become one 10 s bar, so every bar stays a ≥ 24 px target. */
function merge(buckets: Bucket[], k: number): (Bucket & { span: number })[] {
  if (k === 1) return buckets.map((b) => ({ ...b, span: 5 }))
  const out: (Bucket & { span: number })[] = []
  for (let i = 0; i < buckets.length; i += k) {
    const part = buckets.slice(i, i + k)
    const p95s = part.map((b) => b.p95).filter((v): v is number => v !== null)
    out.push({ t0: part[0].t0, total: part.reduce((a, b) => a + b.total, 0), failed: part.reduce((a, b) => a + b.failed, 0), p95: p95s.length ? Math.max(...p95s) : null, span: 5 * part.length })
  }
  return out
}

const pct = (t: number) => `${(t / RUN_S) * 100}%`

/** „Tri signala”: click a spike in the RED chart → the access log of that window → one request's trace. */
export function ThreeSignals() {
  const [run] = useState(runSignals)
  const [ref, width] = useWidth<HTMLDivElement>()
  const k = (width ?? 800) < 600 ? 2 : 1
  const buckets = merge(run.buckets, k)
  const [win, setWin] = useState<number | null>(null)
  const [traceId, setTraceId] = useState<string | null>(null)
  const max = Math.max(...buckets.map((b) => b.total), 1)
  const bucket = win === null ? null : (buckets[win] ?? null)
  const inWin = (t: number) => bucket !== null && t > bucket.t0 && t <= bucket.t0 + bucket.span
  const lines = bucket ? run.access.filter((a) => inWin(a.t)).slice(0, 8) : []
  const picked = run.access.find((a) => a.traceId === traceId) ?? null
  // the application log of one Pod in the same window: the database error, with the trace_id of the request it belongs to
  const dbError = run.appLogs.lines.filter((l) => /ERROR/.test(l)).at(-1)?.replace(/^ERROR\s+/, '') ?? ''
  const appLines = bucket && dbError ? run.access.filter((a) => !a.ok && inWin(a.t) && a.pod === run.appLogs.pod).slice(0, 2) : []
  const p95 = buckets.map((b) => (b.p95 === null ? Number.NaN : b.p95))
  const p95ok = buckets.map((b) => b.p95).filter((v): v is number => v !== null)
  return (
    <div className={css.signals} ref={ref}>
      <div className={css.sigStep}>
        <span className={css.sigNo}>1</span>
        <div>
          <strong>Metrike: da nešto ne valja.</strong> Zahtjevi i greške klopa-api po {k * 5} s. Kliknite stupac u skoku.
        </div>
      </div>
      <div className={css.redPlot}>
        <div className={css.redChart} role="group" aria-label={`Zahtjevi i greške klopa-api po ${k * 5} sekundi, od 12:00:00 do 12:02:00`}>
          {buckets.map((b, i) => {
            const errPct = b.total ? b.failed / b.total : 0
            return (
              <button
                key={b.t0}
                type="button"
                className={css.redBar}
                aria-pressed={win === i}
                aria-label={`${clock(b.t0)}–${clock(b.t0 + b.span)}: ${b.total} zahtjeva, ${fmt.pct(errPct)} grešaka`}
                onClick={() => {
                  setWin(i)
                  setTraceId(null)
                }}
              >
                <span className={css.redBarTotal} style={{ height: `${(b.total / max) * 100}%` }}>
                  <span className={css.redBarErr} style={{ height: `${errPct * 100}%` }} />
                </span>
              </button>
            )
          })}
        </div>
        {[
          { t: FAULT_AT, text: 'rotacija' },
          { t: FIX_AT, text: 'commit' },
        ].map((m) => (
          <span key={m.text} className={css.redMarker} style={{ left: pct(m.t) }} aria-hidden="true">
            <span>{m.text}</span>
          </span>
        ))}
      </div>
      <div className={css.redAxis} aria-hidden="true">
        {[0, 60, 120].map((t) => (
          <span key={t} style={{ left: pct(t) }} data-edge={t === 0 ? 'start' : t === RUN_S ? 'end' : undefined}>
            {clock(t)}
          </span>
        ))}
      </div>
      <div className={css.p95Row}>
        <span className={css.p95Label}>Duration p95{p95ok.length ? `: ${fmt.ms(Math.min(...p95ok))}–${fmt.ms(Math.max(...p95ok))}` : ''}</span>
        <Sparkline values={p95} color="var(--pen)" height={26} />
      </div>
      <p className={css.small}>
        Stupac = zahtjevi u {k * 5} s; crveno šrafirano = greške. Ispod je trajanje (p95) uspješnih zahtjeva; praznina = nijedan nije uspio. Okomite crte: rotacija lozinke u {clock(FAULT_AT)}, Lanin commit u {clock(FIX_AT)}. Snimka jednog ručka iz simulacije (seed {SIGNALS_SEED}).
      </p>

      <div className={css.sigStep}>
        <span className={css.sigNo}>2</span>
        <div>
          <strong>Logovi: zašto.</strong> {bucket ? `Pristupni log od ${clock(bucket.t0)} do ${clock(bucket.t0 + bucket.span)}. Kliknite redak s greškom.` : 'Najprije odaberite prozor na grafu.'}
        </div>
      </div>
      {bucket && (
        <div className="k-pinned">
          <div className={css.console}>
            <div className={css.logList}>
              {lines.map((l) => (
                <button key={`${l.traceId}-${l.t}`} type="button" className={`${css.logLine} ${l.ok ? '' : css.lerr}`} aria-pressed={traceId === l.traceId} onClick={() => setTraceId(l.traceId)}>
                  {l.text}
                </button>
              ))}
            </div>
            {appLines.length > 0 && (
              <div className={css.logApp}>
                <div className={css.lnote}># kubectl logs {run.appLogs.pod} (aplikacijski log, isti prozor)</div>
                {appLines.map((a) => (
                  <div key={a.traceId} className={css.lerr}>
                    {clock(a.t)} ERROR trace_id={a.traceId.slice(0, 8)} {dbError}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className={css.sigStep}>
        <span className={css.sigNo}>3</span>
        <div>
          <strong>Trag: gdje.</strong> {picked ? `Isti trace_id ${picked.traceId.slice(0, 8)} kao u logu.` : 'Trag se otvori kad kliknete redak loga.'}
        </div>
      </div>
      {picked && <TraceWaterfall trace={picked.trace} />}
    </div>
  )
}
