import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { getAllGlossary, getLectureById, lecturePath, useGlossaryVersion } from '../curriculum/registry'
import type { GlossaryEntry } from '../curriculum/types'
import { DoodleIcon, PropIndex, Rough } from '../kit'
import { artFor } from './glossary-art'
import { usePageTitle } from '../shell/usePageTitle'

const collator = new Intl.Collator('hr', { sensitivity: 'base' })

/** Lowercase without diacritics (č ć → c, š → s, ž → z, đ → d), so "cvor" finds "čvor". */
function fold(s: string): string {
  return s.toLocaleLowerCase('hr').replace(/đ/g, 'd').normalize('NFD').replace(/\p{M}/gu, '')
}

function letterOf(term: string): string {
  const c = term.trim().charAt(0).toLocaleUpperCase('hr')
  return /[0-9]/.test(c) ? '#' : c
}

/** The back pages of the notebook: every term with its doodle and (where it has one) its picture from the menza. */
export function GlossaryPage() {
  usePageTitle('Pojmovnik')
  const [q, setQ] = useState('')
  const version = useGlossaryVersion()
  const all = useMemo(
    () => [...getAllGlossary()].sort((a, b) => collator.compare(a.term, b.term)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version changes when lecture glossaries load
    [version],
  )
  const groups = useMemo(() => {
    const needle = fold(q.trim())
    const list = needle ? all.filter((g) => [g.term, g.hr, g.definition, g.menza ?? artFor(g.id).menza ?? ''].some((s) => fold(s).includes(needle))) : all
    const out: { letter: string; items: GlossaryEntry[] }[] = []
    for (const g of list) {
      const l = letterOf(g.term)
      const last = out[out.length - 1]
      if (last && last.letter === l) last.items.push(g)
      else out.push({ letter: l, items: [g] })
    }
    return out
  }, [all, q])
  const count = groups.reduce((n, g) => n + g.items.length, 0)

  return (
    <div className="nb-page nb-gloss">
      <header className="nb-pagehead">
        <div>
          <span className="nb-kicker">zadnje stranice bilježnice</span>
          <h1 className="nb-h1">Pojmovnik</h1>
          <p className="nb-pagehead__lead">Svaka riječ ima svoj crtež iz menze. Kad je sretnete u predavanju, potražite isti crtež. U tekstu predavanja pojam s točkastom crtom pokazuje definiciju kad ga dodirnete ili prijeđete mišem.</p>
        </div>
        <span className="nb-pagehead__prop" aria-hidden="true">
          <PropIndex />
        </span>
      </header>

      <div className="nb-search">
        <svg className="nb-search__icon" viewBox="0 0 28 28" aria-hidden="true">
          <Rough shape={{ k: 'ellipse', cx: 11, cy: 11, w: 15, h: 15 }} seed={3501} strokeWidth={1.8} stroke="var(--pen)" />
          <Rough shape={{ k: 'line', x1: 16.5, y1: 16.5, x2: 25, y2: 25 }} seed={3502} strokeWidth={2.4} stroke="var(--pen)" />
        </svg>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Traži pojam…" aria-label="Traži pojam" />
        <svg className="nb-search__line" viewBox="0 0 400 10" preserveAspectRatio="none" aria-hidden="true">
          <Rough shape={{ k: 'line', x1: 2, y1: 5, x2: 398, y2: 6 }} seed={3503} strokeWidth={1.8} stroke="var(--ink-2)" roughness={1.2} />
        </svg>
        <span className="nb-search__count k-hand" aria-live="polite">
          {count} {count % 10 === 1 && count % 100 !== 11 ? 'pojam' : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? 'pojma' : 'pojmova'}
        </span>
      </div>

      {groups.map((grp) => (
        <section key={grp.letter} className="nb-gloss__group" aria-label={`Slovo ${grp.letter}`}>
          <h2 className="nb-gloss__letter">{grp.letter}</h2>
          <dl className="nb-gloss__list">
            {grp.items.map((g) => {
              const art = artFor(g.id)
              const menza = g.menza ?? art.menza
              const lec = g.lecture ? getLectureById(g.lecture) : undefined
              return (
                <div key={g.id} className="nb-gloss__item" id={`pojam-${g.id}`}>
                  <dt>
                    <DoodleIcon kind={art.doodle} className="nb-gloss__doodle" />
                    <span className="nb-gloss__term">{g.term}</span>
                    {menza && <span className="nb-gloss__menza">= {menza}</span>}
                  </dt>
                  <dd>
                    {g.hr.toLocaleLowerCase('hr') !== g.term.toLocaleLowerCase('hr') && <span className="nb-gloss__hr">{g.hr}. </span>}
                    {g.definition}{' '}
                    {lec && (
                      <Link className="nb-gloss__lec" to={lecturePath(lec)}>
                        pred. {lec.id} →
                      </Link>
                    )}
                  </dd>
                </div>
              )
            })}
          </dl>
        </section>
      ))}
      {count === 0 && <p className="nb-gloss__empty k-hand">Nema pojmova za „{q}”. Pokušajte s hrvatskim ili engleskim nazivom.</p>}
    </div>
  )
}
