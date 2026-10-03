import { useState } from 'react'
import { Button } from '../../../kit'
import { HANDBOOK, handbookMarkdown } from '../content'
import { lectureHref } from '../lectures'
import css from '../styles.module.css'

/** Davor's on-call handbook: symptom → cause → first command, downloadable as Markdown. */
export function Handbook() {
  const [saved, setSaved] = useState(false)
  const download = () => {
    try {
      const blob = new Blob([handbookMarkdown()], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'davorov-dezurni-prirucnik.md'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setSaved(true)
    } catch {
      setSaved(false)
    }
  }
  return (
    <div className={css.handbook}>
      <div className={css.tableWrap} tabIndex={0} role="region" aria-label="Davorov dežurni priručnik">
        <table className={css.table}>
          <thead>
            <tr>
              <th scope="col">Simptom</th>
              <th scope="col">Vjerojatan uzrok</th>
              <th scope="col">Prva naredba</th>
              <th scope="col">Pred.</th>
            </tr>
          </thead>
          <tbody>
            {HANDBOOK.map((r) => (
              <tr key={r.symptom}>
                <td>{r.symptom}</td>
                <td>{r.cause.replace(/`/g, '')}</td>
                <td>
                  <code>{r.command}</code>
                </td>
                <td>
                  <a href={lectureHref(r.lecture)}>{r.lecture}</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={css.btnRow}>
        <Button variant="primary" onClick={download}>
          Preuzmi priručnik (.md)
        </Button>
        {saved && <span className={css.small}>Spremljeno: davorov-dezurni-prirucnik.md</span>}
      </div>
    </div>
  )
}
