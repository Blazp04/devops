/** Pieces of the „Tvornica commitova” stage: commit chips, station drawers, production, registry, credential, log. */
import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { Rough, Drawer, Arrow, Cross, Diagram, Helm, PodShape, SvgStamp, Meter, RoughBox, plural } from '../../../kit'
import { credentialStatus, fmtSeconds, logEvents, wallClock, OIDC_TOKEN_LIFETIME, type PipelineRun, type PipelineState } from '../../../engines/build/index.ts'
import { TYPE_SHORT, short, prodInfo, registryShelf, STATION_NAME, type OutcomeTone } from '../factory'
import css from '../styles.module.css'

export type ChipState = 'running' | 'waiting' | 'failed' | 'done'

const CHIP_STROKE: Record<ChipState, string> = { running: 'var(--pen)', waiting: 'var(--orange)', failed: 'var(--red)', done: 'var(--ink-2)' }

/** One commit on the line: `#id sha`, its type in words, a progress bar while a job runs. Moves between stations (layout). */
export function CommitChip({ run, state, progress, mark }: { run: PipelineRun; state: ChipState; progress?: number; mark?: { glyph: string; tone: OutcomeTone } }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      layoutId={reduce ? undefined : `ci-run-${run.id}`}
      layout="position"
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      className={css.chip}
      data-state={state}
    >
      <svg className={css.chipBg} viewBox="0 0 122 50" preserveAspectRatio="none" aria-hidden="true">
        <Rough
          shape={{ k: 'rect', x: 1.5, y: 1.5, w: 119, h: 47 }}
          seed={9000 + run.id}
          stroke={CHIP_STROKE[state]}
          strokeWidth={state === 'running' || state === 'failed' ? 1.9 : 1.4}
          fillColor="var(--paper)"
          fillStyle="solid"
          roughness={0.9}
          dash={state === 'waiting' ? '5 4' : undefined}
        />
      </svg>
      <div className={css.chipTop}>
        <span>
          #{run.id} {run.commit.short}
        </span>
        {mark && (
          <span className={css.chipMark} data-tone={mark.tone}>
            {mark.glyph}
          </span>
        )}
      </div>
      <div className={css.chipType}>{TYPE_SHORT[run.commit.type]}</div>
      {progress !== undefined && (
        <div className={css.chipBar}>
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
    </motion.div>
  )
}

/** A station drawer on the line (status shown by the pen colour and a ✗ when a run just failed here). */
export function StationRow({ index, name, duration, busy, failed, last, children }: { index: number; name: string; duration: string; busy: boolean; failed: boolean; last: boolean; children?: ReactNode }) {
  const stroke = failed ? 'var(--red)' : busy ? 'var(--pen)' : 'var(--ink-3)'
  return (
    <li>
      <RoughBox className={css.station} stroke={stroke} seed={8800 + index} strokeWidth={busy || failed ? 1.8 : 1.2} roughness={1}>
        <svg className={css.drawer} viewBox="0 0 30 30" aria-hidden="true">
          <Drawer x={3} y={4} w={24} h={22} seed={8700 + index} />
          {failed && <Cross x={22} y={8} size={5} seed={8750 + index} />}
        </svg>
        <span className={css.sname}>
          {name}
          <span className={css.sdur}>{duration}</span>
        </span>
        <div className={css.belt}>{children}</div>
      </RoughBox>
      {!last && (
        <svg className={css.link} viewBox="0 0 30 10" aria-hidden="true">
          <Arrow pts={[[15, 0], [15, 9.5]]} head={4} seed={8900 + index} stroke="var(--ink-3)" strokeWidth={1.3} />
        </svg>
      )}
    </li>
  )
}

/** Production: three lunchboxes with the running tag, and the facts that matter (digest, commit, tested, who built it). */
export function ProdCard({ s }: { s: PipelineState }) {
  const p = prodInfo(s)
  const tone = p.bad ? 'rose' : p.laptop || !p.tested ? 'amber' : 'green'
  const label = `Produkcija: tri Poda s verzijom ${p.label}${p.bad ? '; u produkciji je greška' : ''}${p.rollingBack ? '; u tijeku je povratak na prethodnu verziju' : ''}`
  return (
    <div>
      <p className={css.panelTitle}>Produkcija</p>
      <div style={{ maxWidth: 300 }}>
        <Diagram width={236} height={100} label={label}>
          <Helm x={16} y={16} r={11} />
          {[44, 118, 192].map((x, i) => (
            <PodShape key={i} x={x} y={62} size={44} status={p.rollingBack ? 'creating' : 'running'} label={p.label} tone={tone} />
          ))}
          {p.bad && <SvgStamp x={150} y={14} text="GREŠKA" tone="red" size={14} rotate={-4} />}
        </Diagram>
      </div>
      <dl className={css.kv}>
        <dt>tag</dt>
        <dd>
          <code>{p.label}</code>
        </dd>
        <dt>digest</dt>
        <dd>
          <code>{short(p.digest)}</code>
        </dd>
        <dt>commit</dt>
        <dd className={p.commit ? undefined : css.bad}>{p.commit ? <code>{p.commit}</code> : '✗ nepoznat'}</dd>
        <dt>testirano</dt>
        <dd className={p.tested ? css.ok : css.bad}>{p.tested ? '✓ da, isti digest' : p.skipped ? '✗ ne – testovi preskočeni' : '✗ ne'}</dd>
        <dt>izgradio</dt>
        <dd className={p.laptop ? css.bad : undefined}>{p.laptop ? '✗ Davorov laptop' : 'CI'}</dd>
      </dl>
    </div>
  )
}

/** The registry shelf: the newest pushed images (tags → digest) and Davor's laptop image at the bottom. */
export function RegistryShelf({ s }: { s: PipelineState }) {
  const items = registryShelf(s, 3)
  return (
    <div>
      <p className={css.panelTitle}>Registar</p>
      <ul className={css.shelf}>
        {items.map((i) => (
          <li key={i.key}>
            <span className={css.tags}>klopa-api:{i.tags}</span>
            <span>→ {short(i.digest)}</span>
            {i.laptop && <span className={css.note}>! s laptopa, bez testova</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** What the CI credential is, and – after „Ukradi CI ključ” – how long the attacker can use it. */
export function CredPanel({ s }: { s: PipelineState }) {
  const c = credentialStatus(s)
  const leak = c.leaks[c.leaks.length - 1]
  let status: ReactNode = null
  if (leak) {
    const where = leak.station ? STATION_NAME[leak.station] : 'CI'
    const nothing = leak.kind === 'oidc' && leak.tokenKind === null
    const tries = plural(leak.successes, ['uspješna upotreba', 'uspješne upotrebe', 'uspješnih upotreba'])
    if (nothing) status = <span className={css.ok}>✓ Posao „{where}” nema token – napadač nema što ukrasti.</span>
    else if (leak.revokedAt !== null) status = <span className={css.ok}>✓ Opozvano nakon {fmtSeconds(leak.exposureSec)} ({tries}).</span>
    else if (leak.active && leak.kind === 'static') status = <span className={css.bad}>✗ Napadač ima trajni ključ: {tries}. Vrijedi dok ga netko ne opozove.</span>
    else if (leak.active)
      status = (
        <>
          <span className={css.warn}>
            ! Napadač ima token posla „{where}”: {tries}, istječe sam za {fmtSeconds(leak.remainingSec ?? 0)}.
          </span>
          <Meter value={(leak.remainingSec ?? 0) / OIDC_TOKEN_LIFETIME.simValue} label="preostali život tokena" valueLabel={fmtSeconds(leak.remainingSec ?? 0)} tone="warn" />
        </>
      )
    else status = <span className={css.ok}>✓ Ukradeni token istekao je sam ({tries} prije toga).</span>
  }
  return (
    <div className={css.cred}>
      <p className={css.panelTitle}>Vjerodajnica CI-ja</p>
      <span className={css.credLine}>{c.kind === 'static' ? 'Trajni ključ' : 'OIDC token samo za poslove koji ga trebaju (push, staging, produkcija)'}</span>
      <span>{c.lifetimeLabel}</span>
      {status}
    </div>
  )
}

const GLYPH: Record<string, string> = { ok: '✓', warn: '!', bad: '✗', info: '→', neutral: '·' }

/** „Što se upravo dogodilo” with wall-clock times (the kit's EventLog prints seconds, which reads badly for minutes). */
export function FactoryLog({ s }: { s: PipelineState }) {
  const ev = logEvents(s.events, (t) => wallClock(s, t), 7)
  const alarm = ev.find((e) => e.tone === 'bad')
  return (
    <div className={`k-events ${css.log}`}>
      <div className="k-events__title">Što se upravo dogodilo</div>
      <ol>
        {ev.map((e) => (
          <li key={e.key} data-tone={e.tone}>
            <span className="k-events__t mono">{e.timeLabel}</span>
            <span className={`k-events__text ${css.logText}`}>
              <span className="k-events__glyph" aria-hidden="true">
                {GLYPH[e.tone] ?? '·'}
              </span>{' '}
              {e.text}
            </span>
          </li>
        ))}
        {ev.length === 0 && <li className="k-events__empty">Još ništa – pokrenite simulaciju.</li>}
      </ol>
      <span className="visually-hidden" role="status">
        {alarm?.text ?? ''}
      </span>
    </div>
  )
}
