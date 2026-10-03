import { useState } from 'react'
import { Button, Diagram } from '../../../kit'
import { HOPS, breakInfos, selfHealLabel, type HopId } from '../hops'
import { lectureHref } from '../lectures'
import { HopIcon, PathDrawing } from './RequestJourney'
import css from '../styles.module.css'

function code(t: string) {
  return t.split(/(`[^`]+`)/).map((part, k) => (part.startsWith('`') ? <code key={k}>{part.slice(1, -1)}</code> : <span key={k}>{part}</span>))
}

/** „Što ako ovdje pukne?”: break any hop; the mechanism that protects it (and the signal that reveals it) lights up. */
export function BreakHop() {
  const [info] = useState(breakInfos)
  const [broken, setBroken] = useState<Set<HopId>>(() => new Set())
  const [last, setLast] = useState<HopId | null>(null)
  const toggle = (id: HopId) => {
    const next = new Set(broken)
    if (next.has(id)) next.delete(id)
    else {
      next.add(id)
      setLast(id)
    }
    setBroken(next)
  }
  const shown = last && broken.has(last) ? info.find((x) => x.hop === last) : null
  return (
    <div>
      <PathDrawing active={null} visited={HOPS.length} broken={broken} label={broken.size ? `Srušeno: ${[...broken].join(', ')}.` : 'Put narudžbe kroz Klopu; ništa nije srušeno.'} />
      <div className={css.hopGrid}>
        {HOPS.map((h) => {
          const b = broken.has(h.id)
          return (
            <div key={h.id} className={css.hopCard} data-broken={b}>
              <span className={css.hopName}>
                <span className={css.hopIcon} aria-hidden="true">
                  <Diagram width={84} height={66} label={h.name}>
                    <HopIcon id={h.id} x={42} y={34} dim={false} broken={b} />
                  </Diagram>
                </span>
                {h.name}
              </span>
              <Button size="sm" variant={b ? 'success' : 'danger'} onClick={() => toggle(h.id)} active={b}>
                {b ? 'Popravi' : 'Sruši'}
              </Button>
            </div>
          )
        })}
      </div>
      <div className={css.mechanism} aria-live="polite">
        {shown ? (
          <>
            <p className={css.mechFail}>✗ {code(shown.failure)}</p>
            <p className={css.mechSave}>
              <strong>Što štiti:</strong> {code(shown.mechanism)}
            </p>
            <p>
              <strong>Signal:</strong> {code(shown.signal)}
            </p>
            {shown.evidence && <p className={css.mechEvidence}>{shown.evidence}</p>}
            <p className={css.stationLinks}>
              {shown.lectures.map((id) => (
                <a key={id} href={lectureHref(id)}>
                  predavanje {id}
                </a>
              ))}
            </p>
          </>
        ) : (
          <p className={css.small}>Srušite bilo koji sloj. Ispod se pojavi mehanizam koji ga štiti i signal po kojem biste kvar primijetili.</p>
        )}
      </div>
      <p className={css.small}>
        I iznad svih slojeva: ručna promjena u klasteru vraća se na stanje iz Gita (Argo CD selfHeal, {selfHealLabel()}).
      </p>
    </div>
  )
}
