import { Fragment, useEffect, useRef, useState } from 'react'
import { Badge, Button, LaptopDeck, RoughBox, Select, Stat, StatRow, fmt } from '../../../kit'
import * as G from '../../../engines/gitops'
import { FAULTS, LECTURE_OPTIONS, CAUSE_OPTIONS, SIGNAL_LABEL, type FaultId, type SignalId } from '../incident/faults'
import { apiRed, clock, hypothesisScore, incidentUsers, mttr, needsHypothesis, pagedIncidents, workerRed, type Incident, type IncidentState } from '../incident/model'
import { EDITABLE, EDITABLE_FILES, FILE_LABEL, draftToSet, fileYaml, headValue } from '../incident/editor'
import { ARGO_CHIPS, MANUAL_CHIPS, NO_TRACE_CHIPS, READ_CHIPS, podChips } from '../incident/console'
import type { TraceView } from '../incident/trace'
import css from '../styles.module.css'

const SIGNAL_OPTIONS = (Object.keys(SIGNAL_LABEL) as SignalId[]).map((id) => ({ value: id, label: SIGNAL_LABEL[id] }))

function plainCode(t: string): string {
  return t.replace(/`/g, '')
}

/** `code` spans in fault texts (plain strings with backticks). */
function codeSpans(t: string) {
  return t.split(/(`[^`]+`)/).map((part, k) => (part.startsWith('`') ? <code key={k}>{part.slice(1, -1)}</code> : <span key={k}>{part}</span>))
}

/** Pager cards: one per incident, open in red, closed in green with its MTTR. */
export function IncidentList({ s }: { s: IncidentState }) {
  const paged = pagedIncidents(s)
  if (!paged.length) return <p className={css.pagerQuiet}>Ručak teče mirno. Pager se javi kad neki signal prijeđe prag – pratite metrike.</p>
  return (
    <div className={css.pagers} aria-live="polite">
      {paged.map((i) => {
        const done = i.resolvedAt !== null
        const m = mttr(i)
        return (
          <div key={i.no} className={css.pager} data-done={done}>
            <span className={css.pagerNo}>{done ? '✓' : '✗'} #{i.no}</span>
            <span>
              {plainCode(FAULTS[i.fault].alert)}
              {i.source === 'kaos' ? ' (kaos majmun)' : ''}
            </span>
            <span className={css.pagerState}>{done ? `riješen · MTTR ${fmt.num(m ?? 0)} s` : `od ${clock(i.firstErrorAt ?? i.startedAt)}`}</span>
          </div>
        )
      })}
    </div>
  )
}

/** „Hipoteza” form for the first open incident without one, and the debrief of closed incidents. */
export function HypothesisPanel({ s, onSubmit }: { s: IncidentState; onSubmit: (no: number, cause: FaultId | 'drugo', signal: SignalId, lecture: string) => void }) {
  const [cause, setCause] = useState<FaultId | 'drugo'>('drugo')
  const [signal, setSignal] = useState<SignalId>('red')
  const [lecture, setLecture] = useState('14')
  const need = needsHypothesis(s) ?? s.incidents.find((i) => i.resolvedAt !== null && i.hypothesis === null) ?? null
  const closed = s.incidents.filter((i) => i.resolvedAt !== null).slice(-2).reverse()
  return (
    <div className={css.hyp}>
      {need ? (
        <>
          <p className={css.hypNote}>
            Incident #{need.no}: prije commita zapišite što mislite da se dogodilo.
          </p>
          <Select label="Uzrok" value={cause} options={CAUSE_OPTIONS} onChange={setCause} />
          <Select label="Signal koji ga otkriva" value={signal} options={SIGNAL_OPTIONS} onChange={setSignal} />
          <Select label="Predavanje" value={lecture} options={LECTURE_OPTIONS} onChange={setLecture} />
          <Button variant="primary" onClick={() => onSubmit(need.no, cause, signal, lecture)}>
            Zapiši hipotezu
          </Button>
        </>
      ) : (
        <p className={css.hypNote}>{pagedIncidents(s).some((i) => i.resolvedAt === null) ? 'Hipoteza je zapisana. Provjerite je signalima, pa popravite commitom.' : 'Nema otvorenog incidenta.'}</p>
      )}
      {closed.map((i) => (
        <Debrief key={i.no} inc={i} />
      ))}
    </div>
  )
}

function Debrief({ inc }: { inc: Incident }) {
  const f = FAULTS[inc.fault]
  const h = hypothesisScore(inc)
  const yes = (ok: boolean) => (
    <span className={css.verdict} data-ok={ok}>
      {ok ? '✓' : '✗'}
    </span>
  )
  return (
    <div className={css.debrief}>
      <p>
        <strong>#{inc.no}: {plainCode(f.cause)}</strong>
      </p>
      <p>{codeSpans(f.mechanism)}</p>
      <p>
        <strong>Kako se popravlja:</strong> {codeSpans(f.fix)}
      </p>
      <p className={css.verdict}>
        predavanje {f.lectures.join(', ')} · signal: {f.signals.map((x) => SIGNAL_LABEL[x]).join(' / ')}
      </p>
      {inc.hypothesis && (
        <p className={css.verdict}>
          vaša hipoteza: uzrok {yes(h.cause)} · signal {yes(h.signal)} · predavanje {yes(h.lecture)}
        </p>
      )}
      <p className={css.verdict}>
        popravak: {inc.fixedBy === 'manual' ? 'ručno (kubectl)' : inc.fixedBy === 'sync' ? 'argocd app sync' : inc.fixedBy === 'mehanizam' ? 'mehanizam (bez commita)' : 'commit'} · neuspjelih {fmt.num(inc.failed)} · studenata {fmt.num(incidentUsers(inc))}
      </p>
    </div>
  )
}

/** RED per service (Rate, Errors, Duration) with links into logs and traces. */
export function RedPanel({ s, onLogs, onTrace }: { s: IncidentState; onLogs: (service: 'api' | 'worker') => void; onTrace: (service: 'api' | 'worker') => void }) {
  const a = apiRed(s, 5)
  const w = workerRed(s)
  const err = s.series.err.slice(-60)
  const p95 = s.series.p95.slice(-60).map((v) => v ?? 0)
  const q = s.series.queue.slice(-60)
  return (
    <div className={css.red}>
      <div className={css.redRow}>
        <div className={css.redName}>
          <span>Gateway → klopa-api</span>
          <span className={css.redBtns}>
            <Button size="sm" onClick={() => onLogs('api')}>
              Logovi
            </Button>
            <Button size="sm" onClick={() => onTrace('api')}>
              Trag
            </Button>
          </span>
        </div>
        <StatRow>
          <Stat label="Rate" value={fmt.num(a.rps)} unit="zahtj./s" />
          <Stat label="Errors" value={fmt.pct(a.errPct, 1)} tone={a.errPct > 0.05 ? 'bad' : a.errPct > 0.01 ? 'warn' : 'ok'} spark={err} />
          <Stat label="Duration p95" value={a.p95 === null ? 'n/a' : fmt.ms(a.p95)} tone={a.p95 === null ? 'neutral' : a.p95 > 800 ? 'bad' : a.p95 > 400 ? 'warn' : 'ok'} spark={p95} />
        </StatRow>
        <div className={css.redSplit}>
          greške: 404 · {fmt.num(a.e404)} | 503 · {fmt.num(a.e503)} | 500 · {fmt.num(a.e500)} (zadnjih 5 s)
        </div>
      </div>
      <div className={css.redRow}>
        <div className={css.redName}>
          <span>klopa-worker (red narudžbi)</span>
          <span className={css.redBtns}>
            <Button size="sm" onClick={() => onLogs('worker')}>
              Logovi
            </Button>
            <Button size="sm" onClick={() => onTrace('worker')}>
              Trag
            </Button>
          </span>
        </div>
        <StatRow>
          <Stat label="Rate" value={fmt.num(w.rps, 1)} unit="narudžbi/s" />
          <Stat label="Errors" value={fmt.pct(w.errPct, 1)} tone={w.errPct > 0.05 ? 'bad' : 'ok'} />
          <Stat label="Duration p95" value={w.p95 === null ? 'n/a' : fmt.ms(w.p95)} />
          <Stat label="u redu" value={fmt.num(w.backlog)} tone={w.backlog > 25 ? 'bad' : 'neutral'} spark={q} sub={w.dlq ? `DLQ: ${w.dlq}` : undefined} />
        </StatRow>
      </div>
    </div>
  )
}

/** One request (or order) as a waterfall: name, duration, a bar on a shared time axis; errors in red with ✗. */
export function TraceWaterfall({ trace, empty = 'Još nema zahtjeva.' }: { trace: TraceView | null; empty?: string }) {
  if (!trace) return <p className={css.small}>{empty}</p>
  const total = Math.max(1, trace.totalMs)
  return (
    <RoughBox className={css.trace} stroke="var(--ink-3)" strokeWidth={1.4} seed={2471} role="group" ariaLabel={`Trag ${trace.title}: ${trace.outcome}, ukupno ${fmt.ms(trace.totalMs)}`}>
      <div className={css.traceHead}>
        trace_id {trace.traceId.slice(0, 16)} · {trace.title} · {fmt.ms(trace.totalMs)} · {trace.ok ? '✓' : '✗'} {trace.outcome}
      </div>
      {trace.spans.map((sp, i) => (
        <div className={css.span} key={i}>
          <div className={css.spanName} style={{ paddingLeft: sp.depth * 12 }}>
            {sp.status === 'err' ? '✗ ' : ''}
            {sp.name}
            {sp.note && (
              <span className={css.spanNote} data-err={sp.status === 'err'}>
                {sp.note}
              </span>
            )}
          </div>
          <div className={css.spanTrack} aria-hidden="true">
            <div className={css.spanBar} data-err={sp.status === 'err'} style={{ left: `${(sp.start / total) * 100}%`, width: `${Math.max(0.6, (sp.dur / total) * 100)}%` }} />
          </div>
        </div>
      ))}
    </RoughBox>
  )
}

const CHIP_GROUPS = [
  { label: 'ručne promjene (selfHeal ih vraća)', chips: MANUAL_CHIPS, write: true },
  { label: 'ručno, ali bez traga u Gitu', chips: NO_TRACE_CHIPS, write: true },
  { label: 'Argo CD', chips: ARGO_CHIPS, write: false },
]

/** The read-only console (plus the manual commands, and Argo CD's sync). */
export function ConsolePanel({ s, onRun }: { s: IncidentState; onRun: (cmd: string) => void }) {
  const [value, setValue] = useState('')
  const outRef = useRef<HTMLPreElement>(null)
  const last = s.console.at(-1)?.id ?? 0
  useEffect(() => {
    const el = outRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [last])
  const run = (c: string) => {
    onRun(c)
    setValue('')
  }
  return (
    <div className="k-pinned">
      <div className={css.console}>
        <pre className={css.consoleOut} ref={outRef} tabIndex={0} aria-label="Izlaz konzole" aria-live="polite">
          {s.console.map((l) => (
            <div key={l.id} className={l.kind === 'cmd' ? css.lcmd : l.kind === 'err' ? css.lerr : l.kind === 'note' ? css.lnote : undefined}>
              {l.text}
            </div>
          ))}
        </pre>
        <form
          className={css.consoleIn}
          onSubmit={(e) => {
            e.preventDefault()
            run(value)
          }}
        >
          <label htmlFor="l24-cmd">$</label>
          <input id="l24-cmd" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" spellCheck={false} placeholder="kubectl get pods" aria-label="Naredba" />
        </form>
      </div>
      <LaptopDeck />
      <div className={css.chips} role="group" aria-label="Gotove naredbe">
        <span className={css.chipsLabel}>čitanje</span>
        {[...READ_CHIPS, ...podChips(s)].map((c) => (
          <button key={c} type="button" className={css.chip} onClick={() => run(c)} title={c}>
            {c}
          </button>
        ))}
        {CHIP_GROUPS.map((g) => (
          <Fragment key={g.label}>
            <span className={css.chipsLabel}>{g.label}</span>
            {g.chips.map((c) => (
              <button key={c} type="button" className={`${css.chip} ${g.write ? css.chipWrite : ''}`} onClick={() => run(c)} title={c}>
                {c}
              </button>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

function restartStamp(t: number): string {
  return `2026-10-02T${clock(t).padStart(8, '0')}Z`
}

/** „Uređivač config repozitorija” + Commit + git revert. */
export function RepoPanel({ s, onCommit, onRevert }: { s: IncidentState; onCommit: (path: string, set: Record<string, G.FieldValue | null>, message: string) => string; onRevert: (sha: string) => string }) {
  const [path, setPath] = useState(EDITABLE_FILES[0])
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const blocked = needsHypothesis(s)
  const set = draftToSet(s.git, path, draft)
  const changed = Object.keys(set).length > 0
  const history = G.commitGraph(s.git, 6)
  const pick = (p: string) => {
    setPath(p)
    setDraft({})
    setResult(null)
  }
  return (
    <div className={css.repo}>
      <div>
        <ul className={css.files} aria-label="Datoteke u config repozitoriju">
          {EDITABLE_FILES.map((p) => (
            <li key={p}>
              <button type="button" className={css.file} aria-pressed={p === path} onClick={() => pick(p)}>
                {FILE_LABEL[p]}
              </button>
            </li>
          ))}
        </ul>
        <p className={css.small}>Ostale datoteke (Gateway, Postgres, klopa-web) ne treba mijenjati.</p>
      </div>
      <div>
        <div className={css.fields}>
          {EDITABLE[path].map((f) => {
            const head = headValue(s.git, path, f.ptr)
            const v = draft[f.ptr] ?? head
            const id = `l24-f-${f.ptr.replace(/[^a-z0-9]/gi, '-')}`
            return (
              <div className={css.field} key={f.ptr}>
                <label className={css.fieldLabel} htmlFor={id}>
                  {f.label}
                </label>
                {f.kind === 'select' ? (
                  <select id={id} className={css.fieldInput} data-changed={v !== head} value={v} onChange={(e) => setDraft({ ...draft, [f.ptr]: e.target.value })}>
                    {[...new Set([head, ...(f.options ?? [])])].filter(Boolean).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : f.kind === 'restart' ? (
                  <span className={css.btnRow}>
                    <input id={id} className={css.fieldInput} data-changed={v !== head} value={v} readOnly placeholder="(nije postavljeno)" />
                    <Button size="sm" onClick={() => setDraft({ ...draft, [f.ptr]: restartStamp(s.k8s.t) })}>
                      Postavi na sada
                    </Button>
                  </span>
                ) : (
                  <input id={id} className={css.fieldInput} data-changed={v !== head} value={v} inputMode={f.kind === 'number' ? 'numeric' : undefined} onChange={(e) => setDraft({ ...draft, [f.ptr]: e.target.value })} spellCheck={false} />
                )}
              </div>
            )
          })}
        </div>
        <div className={css.commitRow}>
          <input className={css.fieldInput} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="poruka commita" aria-label="Poruka commita" />
          <Button
            variant="success"
            disabled={!changed || blocked !== null}
            onClick={() => {
              setResult(onCommit(path, set, message.trim() || `${FILE_LABEL[path]}: popravak`))
              setDraft({})
              setMessage('')
            }}
          >
            Commit
          </Button>
        </div>
        {blocked && <p className={css.result}>Commit čeka hipotezu za incident #{blocked.no}.</p>}
        {result && <p className={css.result}>{result}</p>}
        <ul className={css.history} aria-label="Povijest commitova">
          {history.map((c) => (
            <li key={c.sha}>
              <span className={css.sha}>{c.short}</span>
              <span>{c.message}</span>
              <span className={css.who}>
                {c.author}
                {c.isDeployed ? ' · u klasteru' : ''}
              </span>
              {c.kind !== 'initial' && c.kind !== 'revert' && c.author !== 'Vi' && (
                <Button size="sm" disabled={blocked !== null} onClick={() => setResult(onRevert(c.sha))}>
                  git revert
                </Button>
              )}
            </li>
          ))}
        </ul>
        <details>
          <summary className={css.small}>YAML datoteke u Gitu (HEAD)</summary>
          <pre className={css.consoleOut} style={{ height: 'auto', maxHeight: 320, whiteSpace: 'pre', fontFamily: 'var(--f-mono)', fontSize: 13 }}>
            {fileYaml(s.git, path)}
          </pre>
        </details>
      </div>
    </div>
  )
}

/** Small „Argo CD” badge pair for the toolbar. */
export function ArgoBadges({ s }: { s: IncidentState }) {
  const a = G.appView(s.git)
  const syncTone = a.sync === 'Synced' ? 'ok' : a.sync === 'OutOfSync' ? 'warn' : 'neutral'
  const healthTone = a.health === 'Healthy' ? 'ok' : a.health === 'Degraded' || a.health === 'Missing' ? 'bad' : 'blue'
  return (
    <span className={css.btnRow}>
      <Badge tone={syncTone}>{a.sync}</Badge>
      <Badge tone={healthTone}>{a.health}</Badge>
    </span>
  )
}
