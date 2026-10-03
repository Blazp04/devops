import { Fragment } from 'react'

/** Renders the tiny markdown used in curriculum text (titles, subtitles, objectives): `code` and *emphasis*. */
export function Ticks({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*[^*\s][^*]*\*)/g)
  if (parts.length === 1) return <>{text}</>
  return (
    <>
      {parts.map((p, i) => {
        if (p.length > 2 && p.startsWith('`') && p.endsWith('`'))
          return (
            <code key={i} className="k-code-inline">
              {p.slice(1, -1)}
            </code>
          )
        if (p.length > 2 && p.startsWith('*') && p.endsWith('*')) return <em key={i}>{p.slice(1, -1)}</em>
        return <Fragment key={i}>{p}</Fragment>
      })}
    </>
  )
}
