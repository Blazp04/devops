import { useEffect, useRef, type ReactNode } from 'react'
import { useLecture } from '../lecture-context'
import { SectionProp } from '../doodles/Props'
import type { PropKind } from '../doodles/types'
import { propForKicker } from './kicker'

interface SectionProps {
  /** Anchor id (ASCII kebab-case). Appears in the table of contents. */
  id: string
  title: string
  /**
   * Handwritten label after the section number, e.g. "priča", "isprobajte", "kod", "provjera".
   * Shown in red Caveat as „N · kicker”; it also picks the drawn prop next to the title (see `prop`).
   */
  kicker?: string
  /** Optional one-sentence lead under the title (Newsreader italic). */
  lead?: ReactNode
  /**
   * The doodle next to the title (96 × 72): clock = story · bolt = try / break it · helm = Kubernetes ·
   * flip = step by step · boxes = code · question = check · index = glossary · queue · box (container) · git ·
   * lock (secrets) · loop (GitOps). Default: chosen from the kicker. `false` = no prop.
   */
  prop?: PropKind | false
  children: ReactNode
}

/**
 * One scene of a lecture. Registers itself in the lecture's table of contents and numbers itself (CSS counter,
 * in document order — the same order as the kazalo). Heading system of the notebook: red handwritten kicker
 * „N · oznaka” above the printed title, plus a drawn prop. Children are written in the reading column that starts
 * at the margin; wrap visuals in <Figure wide> / <SimFrame> to use the full width.
 */
export function Section({ id, title, kicker, lead, prop, children }: SectionProps) {
  const ref = useRef<HTMLElement>(null)
  const lecture = useLecture()
  const register = lecture?.register

  useEffect(() => {
    if (!register || !ref.current) return
    return register({ id, title, el: ref.current })
  }, [id, title, register])

  const kind = prop === false ? null : (prop ?? propForKicker(kicker))

  return (
    <section ref={ref} id={id} className="k-section" aria-labelledby={`${id}-naslov`}>
      <header className="k-section__header">
        <div className="k-section__heading">
          <p className="k-section__kicker">
            <b className="k-section__no" aria-hidden="true" />
            {kicker && (
              <>
                <span aria-hidden="true"> · </span>
                {kicker}
              </>
            )}
          </p>
          {/* the "#" link sits beside the h2, not inside it: the heading's (and the region's) name is the title alone */}
          <div className="k-section__titlerow">
            <a href={`#${id}`} className="k-section__anchor" aria-label={`Poveznica na odjeljak ${title}`}>
              #
            </a>
            <h2 className="k-section__title" id={`${id}-naslov`}>
              {title}
            </h2>
          </div>
        </div>
        {kind && (
          <span className="k-section__prop" data-prop={kind} aria-hidden="true">
            <SectionProp kind={kind} />
          </span>
        )}
      </header>
      {lead && <p className="k-section__lead">{lead}</p>}
      <div className="k-section__body prose">{children}</div>
    </section>
  )
}
