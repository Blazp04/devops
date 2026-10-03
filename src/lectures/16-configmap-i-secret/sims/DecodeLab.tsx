import { useState } from 'react'
import { Button, CodeBlock, Envelope, Rough } from '../../../kit'
import { DB_SECRET, fromBase64, toBase64 } from '../../../engines/access/index.ts'
import styles from '../styles.module.css'

const ENCODED = toBase64(DB_SECRET.initialValue)

const SECRET_AS_API_SHOWS = `# kubectl get secret klopa-db -n klopa -o yaml (skraćeno)
apiVersion: v1
kind: Secret
metadata:
  name: klopa-db
  namespace: klopa
type: Opaque
data:
  DB_PASSWORD: ${ENCODED}`

/** The Secret drawn as an envelope with a „pažljivo” sticker – and the flap opens without any key. */
function EnvelopeFigure({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 -30 260 206" className={styles.mapWrap} style={{ maxWidth: 300 }} role="img" aria-label={open ? 'Omotnica Secreta je otvorena: lozinka se vidi bez ikakvog ključa.' : 'Secret kao omotnica s naljepnicom „pažljivo”.'}>
      <Envelope x={60} y={60} w={140} h={92} open={open} seed={2101} />
      <g transform="translate(150 132) rotate(-8)">
        <Rough shape={{ k: 'rect', x: -44, y: -15, w: 88, h: 30 }} seed={2111} strokeWidth={1.3} fillColor="var(--note-yellow)" fillStyle="solid" />
        <text x={0} y={7} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 22, fill: 'var(--note-ink)' }}>
          pažljivo
        </text>
      </g>
      {open ? (
        <text x={130} y={-8} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 22, fill: 'var(--red)' }}>
          otvoreno bez ključa
        </text>
      ) : (
        <text x={130} y={34} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 22, fill: 'var(--ink-2)' }}>
          Secret klopa-db
        </text>
      )}
    </svg>
  )
}

/** Scene „Dekodirajte”: the base64 in a Secret comes back with one click, and any text you type round-trips. */
export function DecodeLab() {
  const [open, setOpen] = useState(false)
  const [mine, setMine] = useState('ćevapi-petak')
  const encoded = toBase64(mine)
  const back = fromBase64(encoded)
  return (
    <div className={styles.decode}>
      <div className={styles.decodeSide}>
        <CodeBlock title="kako API vraća Secret" code={SECRET_AS_API_SHOWS} mode="open" highlight="9" notes={[{ lines: '9', text: 'izgleda šifrirano – a nije' }]} />
      </div>
      <div className={styles.decodeSide}>
        <EnvelopeFigure open={open} />
        <div>
          <Button variant={open ? 'secondary' : 'primary'} onClick={() => setOpen((o) => !o)}>
            {open ? 'Vrati u base64' : 'Dekodiraj'}
          </Button>
        </div>
        <p className={styles.mono} aria-live="polite">
          {open ? (
            <>
              <span>DB_PASSWORD = </span>
              <span className={styles.plain}>{fromBase64(ENCODED)}</span>
              <br />
              <span>ključeva potrebno: 0 · naredbi: 1 (base64 -d)</span>
            </>
          ) : (
            <span>DB_PASSWORD = {ENCODED}</span>
          )}
        </p>
        <label className={styles.field}>
          Upišite bilo koji tekst
          <input value={mine} onChange={(e) => setMine(e.target.value)} maxLength={60} spellCheck={false} autoComplete="off" />
        </label>
        <p className={styles.mono}>
          base64: <strong>{encoded || '–'}</strong>
          <br />
          natrag: <strong>{back ?? '–'}</strong>
        </p>
      </div>
    </div>
  )
}
