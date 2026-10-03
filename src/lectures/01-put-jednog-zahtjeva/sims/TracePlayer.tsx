/**
 * Plays a range of a trace's segments on the route drawing (for the step-by-step explainers): the tray travels at
 * constant speed, the stopwatch and the waterfall follow, and the packet header of the current hop is written under
 * the drawing. Mount it with `key={step}` so every step plays from its start; reduced motion shows the end state.
 * A step starts playing only once most of its drawing is on screen (on phones the Dalje button sits far below it).
 * Narrow sheets skip the URL anatomy (`above`) and show the waterfall only on the step that ends the request.
 */
import type { ReactNode } from 'react'
import { RoughBox, useOnScreen, useWidth } from '../../../kit'
import { NARROW, WIDE, WIDE_MIN, playheadAt, rangeSeconds } from '../geometry'
import { fmtMs, msAt, type Trace } from '../model'
import { useElapsed } from '../useElapsed'
import { RouteStage } from './RouteStage'
import { Waterfall } from './Waterfall'
import styles from '../styles.module.css'

interface TracePlayerProps {
  trace: Trace
  /** play segments [from, to); from === to shows the scene without a tray */
  from: number
  to: number
  idPrefix: string
  /** who is typing, shown in the address bar */
  who: string
  above?: ReactNode
  waterfall?: boolean
}

export function TracePlayer({ trace, from, to, idPrefix, who, above, waterfall }: TracePlayerProps) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const geo = w !== null && w < WIDE_MIN ? NARROW : WIDE
  const [stageRef, onScreen] = useOnScreen<HTMLDivElement>(0.6, true)
  const quiet = to <= from
  const total = quiet ? 0 : rangeSeconds(trace, from, to, geo)
  const t = useElapsed(total, 0.4, onScreen)
  const ph = quiet ? { seg: from, frac: 0, done: false } : playheadAt(trace, from, to, t, geo)
  const atEnd = !quiet && to >= trace.segs.length && ph.done
  const head = { seg: ph.seg, frac: ph.done ? 1 : ph.frac, done: atEnd }
  const now = quiet ? (from > 0 ? trace.segs[from - 1].t1 : 0) : msAt(trace, head.seg, head.frac)
  const seg = trace.segs[head.seg]
  // while the app works (no packet on the wire) keep showing the last packet's header
  let header = seg?.header
  for (let i = head.seg - 1; !header && i >= from; i--) header = trace.segs[i].header
  const ok = trace.outcome === 'ok'
  const ariaLabel = `${who} otvara ${trace.url}. ${atEnd ? `Rezultat: ${ok ? '200 OK' : trace.browser.code} nakon ${fmtMs(trace.total)}.` : quiet ? '' : (seg?.note ?? '')}`
  return (
    <div ref={ref} className={styles.stageWrap}>
      <RoughBox className={styles.urlbar} stroke="var(--ink-3)" strokeWidth={1.4} seed={9001} pad={1}>
        <span className={styles.urlwho}>{who} upisuje</span>
        <code className={styles.url}>{trace.url}</code>
      </RoughBox>
      {geo === WIDE && above}
      <div ref={stageRef} style={geo === NARROW ? { maxWidth: 460, width: '100%', margin: '0 auto' } : undefined}>
        <RouteStage geo={geo} trace={trace} head={head} idPrefix={idPrefix} ariaLabel={ariaLabel} quiet={quiet} />
      </div>
      {atEnd ? (
        <p className={styles.playerLine} data-tone={ok ? 'ok' : 'bad'} data-geo={geo.name}>
          <span aria-hidden="true">{ok ? '✓' : '✗'}</span> {ok ? '200 OK' : trace.browser.code} <span className={styles.playerMs}>nakon {fmtMs(trace.total)}</span>
        </p>
      ) : (
        <p className={styles.playerLine} data-geo={geo.name}>
          {!quiet && header ? (
            <>
              <span className={styles.playerTag}>paket</span> <code>{header}</code> <span className={styles.playerMs}>t = {fmtMs(now)}</span>
            </>
          ) : (
            <span className={styles.playerMs}>t = {fmtMs(now)}</span>
          )}
        </p>
      )}
      {waterfall && (geo === WIDE || to >= trace.segs.length) && <Waterfall trace={trace} nowMs={now} />}
    </div>
  )
}
