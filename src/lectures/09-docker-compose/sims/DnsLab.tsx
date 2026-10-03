import { useState } from 'react'
import { Button, Check, Cross, Diagram, DLabel, FoodBox, Packet, Rough, RoughBox, Segmented, useWidth } from '../../../kit'
import styles from '../styles.module.css'

type Net = 'default' | 'bridge'
type P = [number, number]

interface Geo {
  W: number
  H: number
  region: Record<Net, { x: number; y: number; w: number; h: number }>
  label: Record<Net, P>
  at: Record<Net, { api: P; db: P }>
  book: { x: number; y: number; w: number }
  card: { w: number; h: number }
  mono: number
  hand: number
}

const WIDE: Geo = {
  W: 720,
  H: 300,
  region: { default: { x: 8, y: 16, w: 430, h: 276 }, bridge: { x: 452, y: 16, w: 260, h: 276 } },
  label: { default: [22, 44], bridge: [466, 44] },
  at: { default: { api: [88, 120], db: [88, 226] }, bridge: { api: [582, 120], db: [582, 226] } },
  book: { x: 214, y: 76, w: 206 },
  card: { w: 116, h: 56 },
  mono: 14,
  hand: 13.5,
}

const NARROW: Geo = {
  W: 340,
  H: 540,
  region: { default: { x: 6, y: 10, w: 328, h: 300 }, bridge: { x: 6, y: 324, w: 328, h: 208 } },
  label: { default: [18, 36], bridge: [18, 350] },
  at: { default: { api: [88, 100], db: [252, 100] }, bridge: { api: [88, 430], db: [252, 430] } },
  book: { x: 60, y: 168, w: 220 },
  card: { w: 116, h: 54 },
  mono: 14,
  hand: 13,
}

const IP: Record<Net, { api: string; db: string }> = { default: { api: '172.18.0.4', db: '172.18.0.2' }, bridge: { api: '172.17.0.2', db: '172.17.0.3' } }

function Card({ name, at, w, h, mono, onClick, net }: { name: 'api' | 'db'; at: P; w: number; h: number; mono: number; onClick: () => void; net: Net }) {
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${name} je na mreži ${net === 'default' ? 'klopa_default' : 'bridge'}. Premjesti na drugu mrežu.`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      style={{ cursor: 'pointer' }}
    >
      <rect x={at[0] - w / 2} y={at[1] - h / 2} width={w} height={h} className="k-paper-fill" />
      <FoodBox x={at[0] - w / 2} y={at[1] - h / 2} w={w} h={h} seed={name === 'api' ? 3401 : 3411} tint={name === 'api' ? 'var(--hl-blue-ink)' : 'var(--ink-4)'} />
      <text x={at[0]} y={at[1] + 10} textAnchor="middle" className="k-svg-mono k-dhalo" style={{ fontSize: mono + 1, fontWeight: 700 }}>
        {name}
      </text>
      <text x={at[0]} y={at[1] + h / 2 + mono + 4} textAnchor="middle" className="k-svg-mono" style={{ fontSize: mono, fill: 'var(--ink-2)' }}>
        {IP[net][name]}
      </text>
    </g>
  )
}

/** Scene 3: names resolve only on a user-defined network (Docker's embedded DNS); the default bridge has no name DNS. */
export function DnsLab() {
  const [api, setApiNet] = useState<Net>('default')
  const [db, setDbNet] = useState<Net>('default')
  // how many times DNS was asked in the current arrangement (moving a container clears the answer: predict first, then ask)
  const [asked, setAsked] = useState(0)
  const setApi = (n: Net) => {
    setApiNet(n)
    setAsked(0)
  }
  const setDb = (n: Net) => {
    setDbNet(n)
    setAsked(0)
  }
  const answered = asked > 0
  const [ref, w] = useWidth<HTMLDivElement>()
  const wide = w === null || w >= 600
  const G = wide ? WIDE : NARROW
  const pa = G.at[api].api
  const pd = G.at[db].db
  const found = api === 'default' && db === 'default'
  const hasBook = api === 'default'
  const book = G.book
  const names = [...(api === 'default' ? [['api', IP.default.api]] : []), ...(db === 'default' ? [['db', IP.default.db]] : []), ['web', '172.18.0.5'], ['redis', '172.18.0.3']]
  const bookH = 30 + names.length * 22
  const bookIn: P = [book.x, book.y + bookH / 2]
  const below = (p: P): P => [p[0], p[1] + G.card.h / 2 + 24]
  const path: P[] = !hasBook
    ? [[pa[0] + G.card.w / 2, pa[1]], [pa[0] + G.card.w / 2 + 30, pa[1]]]
    : wide
      ? found
        ? [[pa[0] + G.card.w / 2, pa[1]], bookIn, [pd[0] + G.card.w / 2, pd[1]]]
        : [[pa[0] + G.card.w / 2, pa[1]], [book.x - 22, bookIn[1]]]
      : found
        ? [below(pa), [pa[0], book.y], [pd[0], book.y], below(pd)]
        : [below(pa), [pa[0], book.y - 4]]
  const last = path[path.length - 1]
  const crossAt: P = wide || !hasBook ? [last[0] + 12, last[1] - 2] : [last[0] + 16, last[1] - 4]

  const result = found
    ? { ok: true, text: <>✓ <code>172.18.0.2   db</code> – ugrađeni DNS mreže <code>klopa_default</code> zna ime svakog kontejnera na njoj.</> }
    : api === 'bridge' && db === 'bridge'
      ? { ok: false, text: <>✗ Nema odgovora za ime <code>db</code>. Oba su kontejnera na zadanoj mreži <code>bridge</code>: adresa <code>172.17.0.3</code> bi radila, ime ne radi. Zato Compose za svaki projekt stvara vlastitu mrežu.</> }
      : api === 'bridge'
        ? { ok: false, text: <>✗ Nema odgovora: <code>api</code> je na zadanoj mreži <code>bridge</code>, a ona nema DNS po imenu (a <code>db</code> je uz to i na drugoj mreži).</> }
        : { ok: false, text: <>✗ Nema odgovora: <code>db</code> je na drugoj mreži, pa ga imenik mreže <code>klopa_default</code> ne zna. API bi javio <code className={styles.wrap}>could not translate host name "db"</code>.</> }

  return (
    <RoughBox className={styles.labPanel} stroke="var(--ink-2)" seed={3409}>
      <div ref={ref}>
      <p className={styles.labTitle}>Imenik mreže</p>
      <p className={styles.labHint}>Kliknite kontejner da ga premjestite na drugu mrežu, pa pitajte DNS za ime (getent hosts db).</p>
      <div style={{ maxWidth: wide ? 760 : 420, margin: '8px auto 0' }}>
        <Diagram width={G.W} height={G.H} label={`api je na mreži ${api}, db na mreži ${db}.${answered ? (found ? ' Ime db se pronalazi.' : ' Ime db se ne pronalazi.') : ''}`} interactive>
          {(['default', 'bridge'] as const).map((n) => {
            const r = G.region[n]
            return (
              <g key={n}>
                <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={4} style={{ fill: n === 'default' ? 'color-mix(in srgb, var(--pen) 8%, transparent)' : 'color-mix(in srgb, var(--ink-3) 9%, transparent)' }} />
                <Rough shape={{ k: 'rect', ...r }} seed={n === 'default' ? 3421 : 3422} stroke={n === 'default' ? 'var(--pen)' : 'var(--ink-3)'} strokeWidth={1.5} dash="7 6" />
                <DLabel x={G.label[n][0]} y={G.label[n][1]} text={n === 'default' ? (wide ? 'klopa_default · korisnički definirana mreža' : 'klopa_default · mreža projekta') : 'bridge · zadana mreža'} size={G.hand} anchor="start" tone={n === 'default' ? 'blue' : 'neutral'} bold />
              </g>
            )
          })}
          {/* the embedded DNS of the user-defined network */}
          <rect x={book.x} y={book.y} width={book.w} height={bookH} className="k-paper-fill" />
          <Rough shape={{ k: 'rect', x: book.x, y: book.y, w: book.w, h: bookH }} seed={3431} strokeWidth={1.6} stroke="var(--pen)" fillColor="var(--note-blue)" fillStyle="solid" />
          <text x={book.x + 10} y={book.y + 20} className="k-svg-mono" style={{ fontSize: G.mono, fontWeight: 700, fill: 'var(--note-ink)' }}>
            DNS 127.0.0.11
          </text>
          {names.map(([n, ip], i) => (
            <text key={n} x={book.x + 10} y={book.y + 42 + i * 22} className="k-svg-mono" style={{ whiteSpace: 'pre', fontSize: G.mono, fill: 'var(--note-ink)' }}>
              {n.padEnd(6, ' ')} {ip}
            </text>
          ))}
          <DLabel x={G.label.bridge[0]} y={G.label.bridge[1] + 26} text="nema DNS-a po imenu" size={G.hand} anchor="start" tone="bad" />

          {/* the question's route */}
          {/* before the question the route is plain pencil; the answer (colour, ✓ / ✗) comes only after „Pitaj” */}
          <Rough shape={{ k: 'lin', pts: path }} seed={3441} stroke={!answered ? 'var(--ink-3)' : found ? 'var(--green)' : 'var(--red)'} strokeWidth={1.5} dash={answered && found ? undefined : '6 5'} />
          {answered && <Packet key={asked} path={path} duration={1.4} tone={found ? 'ok' : 'bad'} />}
          {answered && (found ? <Check x={pd[0] + G.card.w / 2 + 6} y={pd[1] - G.card.h / 2} size={16} /> : <Cross x={crossAt[0]} y={crossAt[1]} size={14} />)}

          <Card name="api" at={pa} w={G.card.w} h={G.card.h} mono={G.mono} net={api} onClick={() => setApi(api === 'default' ? 'bridge' : 'default')} />
          <Card name="db" at={pd} w={G.card.w} h={G.card.h} mono={G.mono} net={db} onClick={() => setDb(db === 'default' ? 'bridge' : 'default')} />
        </Diagram>
      </div>
      <div className={styles.labRow}>
        <Segmented
          label="api je na mreži"
          size="sm"
          value={api}
          options={[
            { value: 'default', label: 'klopa_default' },
            { value: 'bridge', label: 'bridge' },
          ]}
          onChange={setApi}
        />
        <Segmented
          label="db je na mreži"
          size="sm"
          value={db}
          options={[
            { value: 'default', label: 'klopa_default' },
            { value: 'bridge', label: 'bridge' },
          ]}
          onChange={setDb}
        />
        <Button variant="primary" onClick={() => setAsked((a) => a + 1)}>
          Pitaj: getent hosts db
        </Button>
      </div>
      <p className={styles.labOut} aria-live="polite">
        <span className={!answered ? undefined : result.ok ? styles.statusOk : styles.statusBad}>api$ getent hosts db</span>
        <br />
        {answered ? result.text : <>Pritisnite „Pitaj” – što će odgovoriti DNS?</>}
      </p>
      </div>
    </RoughBox>
  )
}
