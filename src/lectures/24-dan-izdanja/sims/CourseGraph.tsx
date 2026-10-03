import { Arrow, DLabel, Diagram, Doodle, Rough, Stepper, useWidth } from '../../../kit'
import { COURSE, MODULE_TITLE, lectureHref, type LectureRef } from '../lectures'
import css from '../styles.module.css'

type Mod = LectureRef['module']
type Pt = [number, number]

const MODULES: Mod[] = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']

const WHY: Record<Mod, string> = {
  m1: 'jedan poslužitelj nije dovoljan u 12:00',
  m2: '„kod mene radi” – pakiramo cijelo okruženje',
  m3: 'ručno održavanje kontejnera ne može pratiti rast',
  m4: 'Klopa u klasteru: promet, tajne, resursi, podatci',
  m5: 'kako nova verzija sigurno stiže do korisnika',
  m6: 'sve zajedno, plus signali koji pokazuju što se događa',
}

/** The price of the previous module = the problem of this one (short, for the arrow into it). */
const PRICE: Record<Mod, string> = {
  m1: '',
  m2: '„kod mene radi”',
  m3: 'ručno ne ide',
  m4: 'pogon u klasteru',
  m5: 'nova verzija?',
  m6: 'što se događa?',
}

const ICON: Record<Mod, Parameters<typeof Doodle>[0]['kind']> = { m1: 'server', m2: 'box', m3: 'helm', m4: 'svc', m5: 'pipeline', m6: 'eye' }

interface Layout {
  w: number
  h: number
  at: Pt[]
  title: (i: number) => { x: number; y: number; anchor: 'start' | 'middle' }
  mod: (i: number) => { x: number; y: number; anchor: 'start' | 'middle' }
  /** arrow i → i+1 and the place of its price note */
  arrow: (i: number) => { pts: Pt[]; note: { x: number; y: number; anchor: 'start' | 'middle' | 'end' } }
}

const R = 34

/** Two rows, the second one back to the left (a snake), ≥ 608 px. */
const WIDE: Layout = {
  w: 760,
  h: 330,
  at: [
    [120, 95],
    [380, 95],
    [640, 95],
    [640, 248],
    [380, 248],
    [120, 248],
  ],
  title: (i) => ({ x: WIDE.at[i][0], y: WIDE.at[i][1] + 58, anchor: 'middle' }),
  mod: (i) => ({ x: WIDE.at[i][0], y: WIDE.at[i][1] - 44, anchor: 'middle' }),
  arrow: (i) => {
    const [a, b] = [WIDE.at[i], WIDE.at[i + 1]]
    if (a[1] !== b[1]) return { pts: [[a[0], a[1] + 70], [b[0], b[1] - 58]], note: { x: a[0] - 12, y: (a[1] + b[1]) / 2 + 22, anchor: 'end' } }
    const dir = Math.sign(b[0] - a[0])
    return { pts: [[a[0] + dir * (R + 10), a[1]], [b[0] - dir * (R + 10), b[1]]], note: { x: (a[0] + b[0]) / 2, y: a[1] - 12, anchor: 'middle' } }
  },
}

/** One column for phones. */
const NARROW: Layout = {
  w: 360,
  h: 640,
  at: MODULES.map((_, i): Pt => [52, 48 + i * 108]),
  title: (i) => ({ x: 100, y: NARROW.at[i][1] + 20, anchor: 'start' }),
  mod: (i) => ({ x: 100, y: NARROW.at[i][1] - 4, anchor: 'start' }),
  arrow: (i) => ({ pts: [[52, NARROW.at[i][1] + R + 8], [52, NARROW.at[i + 1][1] - R - 8]], note: { x: 72, y: NARROW.at[i][1] + 62, anchor: 'start' } }),
}

function Graph({ step }: { step: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const L = (width ?? 760) >= 608 ? WIDE : NARROW
  return (
    <div ref={ref} style={{ maxWidth: L === NARROW ? 420 : undefined, margin: '0 auto' }}>
      <Diagram width={L.w} height={L.h} label={`Šest modula tečaja kao lanac: cijena svakog modula je problem sljedećeg. Osvijetljeno do modula ${step + 1}: ${MODULE_TITLE[MODULES[step]]}.`}>
        {MODULES.slice(0, -1).map((m, i) => {
          const a = L.arrow(i)
          const lit = i < step
          const next = MODULES[i + 1]
          return (
            <g key={m}>
              <Arrow pts={a.pts} stroke={lit ? 'var(--pen)' : 'var(--ink-3)'} strokeWidth={lit ? 1.8 : 1.3} dash={lit ? undefined : '3 6'} seed={2480 + i} />
              <DLabel x={a.note.x} y={a.note.y} text={PRICE[next]} anchor={a.note.anchor} size={14} tone={lit ? 'blue' : 'neutral'} />
            </g>
          )
        })}
        {MODULES.map((m, i) => {
          const [x, y] = L.at[i]
          const lit = i <= step
          const t = L.title(i)
          const mo = L.mod(i)
          return (
            <g key={m}>
              <Rough shape={{ k: 'ellipse', cx: x, cy: y, w: R * 2, h: R * 2 }} stroke={lit ? 'var(--pen)' : 'var(--ink-3)'} strokeWidth={lit ? 1.8 : 1.2} dash={lit ? undefined : '4 5'} seed={2490 + i} />
              <g opacity={lit ? 1 : 0.35}>
                <Doodle kind={ICON[m]} x={x - 24} y={y - 18} scale={0.75} />
              </g>
              {i === step && <Rough shape={{ k: 'ellipse', cx: x, cy: y, w: R * 2 + 22, h: R * 2 + 18 }} stroke="var(--red)" strokeWidth={2.2} seed={2500 + i} />}
              <DLabel x={mo.x} y={mo.y} text={m.toUpperCase()} anchor={mo.anchor} mono bold size={15} tone={i === step ? 'bad' : 'neutral'} />
              <DLabel x={t.x} y={t.y} text={MODULE_TITLE[m]} anchor={t.anchor} mono size={14} />
            </g>
          )
        })}
      </Diagram>
    </div>
  )
}

/** The course as a chain „problem → mechanism → its price → next problem”, lit module by module. */
export function CourseGraph() {
  return (
    <Stepper
      title="Mapa tečaja: svaka cijena je sljedeći problem"
      wide
      steps={MODULES.map((m) => ({ title: MODULE_TITLE[m], body: `Zašto: ${WHY[m]}.` }))}
      caption="Svaki modul rješava cijenu prethodnog. Kliknite naslov predavanja za povratak na njega."
    >
      {(step) => (
        <div>
          <Graph step={step} />
          <ul className={css.graphList} aria-label={`Predavanja modula ${MODULE_TITLE[MODULES[step]]}`}>
            {COURSE.filter((l) => l.module === MODULES[step]).map((l) => (
              <li key={l.id}>
                <a href={lectureHref(l.id)}>
                  <span className={css.graphNo}>{l.id}</span> {l.title}
                </a>
                <span className={css.graphAdded}> → {l.added}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Stepper>
  )
}
