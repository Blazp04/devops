import { useId, type ReactNode } from 'react'
import { Link } from 'react-router'
import { getNeighbours, lecturePath } from '../../curriculum/registry'
import { useLecture } from '../lecture-context'
import { Arrow, Check, RoughAround, RoughBox, RoughRule } from '../sketch/Sketch'
import { Davor, Iva, Lana, Mira, Petra } from '../doodles/Characters'
import { SpeechBubble } from '../doodles/Things'
import { StickyNote, Tape } from '../doodles/Paper'
import { CAST_NAME, type CastName } from './types'

/* =====================================================================
   The course's two story devices:
   IncidentCard — the pager alert that opens every lecture (the problem, with numbers);
   CostNote     — "Cijena rješenja", the ledger page that closes it (what we gained, what it cost) and
                  the next incident on a sticky note pointing to the next page.
   ===================================================================== */

export interface IncidentMetric {
  /** short label, e.g. "p95", "greške", "zahtjeva/s" */
  label: ReactNode
  /** the reading, e.g. "2,4 s" or "18 %" (format with fmt.* and Croatian decimals) */
  value: ReactNode
  /** bad = red pencil + ✗ and circled · warn = orange + ! · ok = green + ✓ · neutral (default) = graphite */
  tone?: 'ok' | 'warn' | 'bad' | 'neutral'
}

interface IncidentCardProps {
  /** incident number in the course's running story (1, 2, 3 …) */
  no: number | string
  /** when the pager went off, e.g. "ponedjeljak, 12:03" */
  when: string
  /** the symptom as one short headline, e.g. "Klopa odbija narudžbe u podne" */
  title: ReactNode
  /** 1–3 sentences: what users see, what the on-call person sees (optional) */
  children?: ReactNode
  /** 2–4 numbers from the pager screen; must be reproducible in the lecture's sim with `preset` + `seed` */
  metrics?: IncidentMetric[]
  /** who got paged (default Davor, the on-call person — his pager buzzes) */
  who?: CastName
  /** what they say, 1–3 short lines (Kalam speech bubble). A string or the lines. */
  says?: string | string[]
  /** the sim preset that reproduces these numbers, e.g. "podne-jedan-posluzitelj" */
  preset?: string
  /** the sim seed that reproduces these numbers */
  seed?: number
}

const TONE_MARK: Record<NonNullable<IncidentMetric['tone']>, string> = { bad: '✗', warn: '!', ok: '✓', neutral: '' }

/** Splits a short sentence into ≤ 3 bubble lines of ≈ 16 characters. */
function bubbleLines(says: string | string[]): string[] {
  if (Array.isArray(says)) return says.slice(0, 3)
  const words = says.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > 16) {
      lines.push(cur)
      cur = w
    } else cur = cur ? `${cur} ${w}` : w
  }
  if (cur) lines.push(cur)
  return lines.slice(0, 3)
}

/** The paged character (with the buzzing pager when it is Davor) and what they say. Own <svg>, drawn at 1:1. */
function Paged({ who, says }: { who: CastName; says?: string | string[] }) {
  const lines = says ? bubbleLines(says) : []
  const bubbleH = lines.length ? 22 + lines.length * 27 : 0
  const top = lines.length ? -bubbleH - 14 : -6
  const figure =
    who === 'davor' ? (
      <Davor x={6} y={0} mood="worry" holding="pager" buzz />
    ) : who === 'lana' ? (
      <Lana x={6} y={0} mood="worry" holding="laptop" />
    ) : who === 'petra' ? (
      <Petra x={6} y={0} mood="worry" holding="phone" />
    ) : who === 'iva' ? (
      <Iva x={6} y={0} mood="worry" holding="phone" />
    ) : (
      <Mira x={6} y={0} mood="worry" holding="ladle" />
    )
  return (
    <svg className="k-incident__who" viewBox={`-4 ${top} 188 ${140 - top}`} role="img" aria-label={`${CAST_NAME[who]}${lines.length ? `: „${lines.join(' ')}”` : ''}`}>
      {figure}
      {lines.length > 0 && <SpeechBubble x={34} y={top + 4} w={146} h={bubbleH} tx={58} ty={18} lines={lines} size={20} seed={6101} tail={16} />}
      <text x={46} y={130} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 19, fill: 'var(--ink-2)' }}>
        {CAST_NAME[who]}
      </text>
    </svg>
  )
}

/**
 * The incident that opens a lecture: a pager alert torn off and taped into the notebook (on the board: drawn in chalk,
 * held by magnets). Number and time, the symptom as a printed headline, the pager's numbers — bad ones circled in red
 * pencil — the person who got paged, and in small print how to reproduce the numbers in the lecture's simulation.
 *   <IncidentCard no={3} when="ponedjeljak, 12:03" title="Klopa odbija narudžbe u podne" who="davor" says="502! Opet!"
 *     metrics={[{ label: 'zahtjeva/s', value: '18' }, { label: 'p95', value: '4,2 s', tone: 'bad' }]} preset="podne" seed={42} />
 */
export function IncidentCard({ no, when, title, children, metrics, who = 'davor', says, preset, seed }: IncidentCardProps) {
  const titleId = useId()
  const repro = preset !== undefined || seed !== undefined
  return (
    <figure className="k-incident" aria-labelledby={titleId}>
      <div className="k-incident__grid">
      <div className="k-incident__ticket">
        <RoughBox className="k-incident__box" stroke="var(--red)" strokeWidth={1.9} roughness={1.3} seed={6001} double>
          <Tape c="red" className="k-incident__tape" style={{ top: -12, left: 28, transform: 'rotate(-6deg)' }} />
          <Tape c="red" className="k-incident__tape" style={{ top: -12, right: 34, transform: 'rotate(5deg)' }} />
          <div className="k-incident__head">
            <span className="k-incident__alert">
              <svg className="k-incident__pager" viewBox="0 0 30 22" aria-hidden="true">
                <rect x={3} y={4} width={22} height={15} rx={3} className="k-incident__pagerbody" />
                <rect x={7} y={8} width={14} height={5} rx={1} className="k-incident__pagerscreen" />
                <path d="M27 6 q3 5 0 10 M29.5 3.5 q4.5 7.5 0 15" className="k-incident__pagerbuzz" />
              </svg>
              incident <b>#{no}</b>
            </span>
            <time className="k-incident__when">{when}</time>
          </div>
          <h3 className="k-incident__title" id={titleId}>
            {title}
          </h3>
          {children && <div className="k-incident__body">{children}</div>}
          {metrics && metrics.length > 0 && (
            <dl className="k-incident__metrics">
              {metrics.map((m, i) => {
                const tone = m.tone ?? 'neutral'
                const reading = (
                  <>
                    {TONE_MARK[tone] && (
                      <span className="k-incident__mark" aria-hidden="true">
                        {TONE_MARK[tone]}
                      </span>
                    )}
                    {m.value}
                  </>
                )
                return (
                  <div key={i} className="k-incident__metric" data-tone={tone}>
                    <dt>{m.label}</dt>
                    <dd>
                      {tone === 'bad' ? (
                        <RoughAround stroke="var(--red)" seed={6011 + i} padX={18} padY={6} strokeWidth={2} draw>
                          {reading}
                        </RoughAround>
                      ) : (
                        reading
                      )}
                      {tone !== 'neutral' && <span className="visually-hidden">{tone === 'bad' ? ' (loše)' : tone === 'warn' ? ' (upozorenje)' : ' (u redu)'}</span>}
                    </dd>
                  </div>
                )
              })}
            </dl>
          )}
          {repro && (
            <p className="k-incident__repro">
              reproducirajte u simulaciji:{preset !== undefined && <> preset {preset}</>}
              {preset !== undefined && seed !== undefined && ' ·'}
              {seed !== undefined && <> seed {seed}</>}
            </p>
          )}
        </RoughBox>
      </div>
      <div className="k-incident__side">
        <Paged who={who} says={says} />
      </div>
      </div>
    </figure>
  )
}

interface CostNoteProps {
  /** what the solution gave us (2–4 short points) */
  gained: ReactNode[]
  /** what it cost, or what is still unsolved (2–4 short points) — the reason for the next lecture */
  paid: ReactNode[]
  /** teaser of the next incident (1–2 sentences), on a sticky note pointing to the next page */
  next?: ReactNode
  /** link of the next page; default: the next lecture in the curriculum */
  nextTo?: string
  /** text of the link; default „sljedeća stranica → NN · naslov” */
  nextLabel?: ReactNode
  /** printed title (default „Cijena rješenja”) */
  title?: ReactNode
}

/**
 * "Cijena rješenja": the end of every lecture as a ledger page — „dobili smo” (green, ✓) and „platili smo” (red, −)
 * in two columns with a double pencil rule between them (stacked on narrow pages), and the next incident as a sticky
 * note with a pen arrow to the next page. On the board the ledger is drawn in chalk and the note is pinned on top.
 */
export function CostNote({ gained, paid, next, nextTo, nextLabel, title = 'Cijena rješenja' }: CostNoteProps) {
  const titleId = useId()
  const lecture = useLecture()
  const auto = lecture ? getNeighbours(lecture.slug).next : undefined
  const to = nextTo ?? (auto ? lecturePath(auto) : undefined)
  const label =
    nextLabel ??
    (auto && !nextTo ? (
      <>
        sljedeća stranica → <b>{auto.id}</b> {auto.title}
      </>
    ) : (
      'sljedeća stranica →'
    ))
  return (
    <section className="k-cost" aria-labelledby={titleId}>
      <div className={`k-cost__grid${next ? ' has-next' : ''}`}>
      <RoughBox className="k-cost__ledger" stroke="var(--ink-2)" strokeWidth={1.6} roughness={1.2} seed={6201}>
        <div className="k-cost__head">
          <span className="k-cost__kicker">kraj predavanja</span>
          <h3 className="k-cost__title" id={titleId}>
            {title}
          </h3>
        </div>
        <RoughRule className="k-cost__headrule" stroke="var(--ink-3)" seed={6202} double />
        <div className="k-cost__cols">
          <div className="k-cost__col" data-side="gained">
            <h4 className="k-cost__colhead">dobili smo</h4>
            <ul>
              {gained.map((g, i) => (
                <li key={i}>
                  <svg className="k-cost__mark" viewBox="0 0 24 24" aria-hidden="true">
                    <Check x={11} y={13} size={7} seed={6210 + i} strokeWidth={2.4} />
                  </svg>
                  <span>{g}</span>
                </li>
              ))}
            </ul>
          </div>
          <span className="k-cost__rule" aria-hidden="true" />
          <div className="k-cost__col" data-side="paid">
            <h4 className="k-cost__colhead">platili smo</h4>
            <ul>
              {paid.map((p, i) => (
                <li key={i}>
                  <span className="k-cost__minus" aria-hidden="true">
                    −
                  </span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </RoughBox>
      {next && (
        <div className="k-cost__nextwrap">
          <StickyNote as="aside" c="pink" tape="red" rotate={1.4} className="k-cost__next" ariaLabel="Sljedeći incident">
            <span className="k-cost__nextlabel">sljedeći incident…</span>
            <div className="k-cost__nexttext">{next}</div>
            {to && (
              <Link to={to} className="k-cost__nextlink">
                {label}
              </Link>
            )}
          </StickyNote>
          <svg className="k-cost__nextarrow" viewBox="0 0 90 60" aria-hidden="true">
            <Arrow
              pts={[
                [6, 10],
                [40, 6],
                [62, 26],
                [84, 52],
              ]}
              stroke="var(--red)"
              strokeWidth={2}
              seed={6231}
              head={9}
              draw
            />
          </svg>
        </div>
      )}
      </div>
    </section>
  )
}
