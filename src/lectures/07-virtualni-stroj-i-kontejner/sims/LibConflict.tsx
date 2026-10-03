/**
 * Feel the pain: one server, one operating system, one copy of a system library — and two apps that need two
 * different versions of it. klopa-api needs a function added in 8.15 (it does not start with 8.12); klopa-worker is
 * tested and pinned to 8.12 (libvips keeps its ABI across 8.x, so with 8.15 it starts — but behaves differently).
 * Whichever version is installed, one of them is not OK.
 */
import { useState } from 'react'
import { Check, Cross, Figure, Iva, Laptop, Rough, Segmented, SpeechBubble, useWidth } from '../../../kit'
import { Band, Face, ProgramCard } from './parts'
import styles from '../styles.module.css'

type Ver = '8.12' | '8.15'

interface Geo {
  W: number
  H: number
  iva: { x: number; y: number; s: number }
  bubble: { x: number; y: number; w: number; h: number; tx: number; ty: number }
  laptop: { x: number; y: number; w: number }
  laptopLabel: [number, number]
  frame: { x: number; y: number; w: number; h: number }
  card: (i: number) => { x: number; y: number; w: number; h: number }
  band: { x: number; y: number; w: number; h: number }
  mono: number
  hand: number
  speech: number
}

const WIDE: Geo = {
  W: 660,
  H: 286,
  iva: { x: 18, y: 120, s: 1.05 },
  bubble: { x: 4, y: 26, w: 168, h: 54, tx: 56, ty: 136 },
  laptop: { x: 120, y: 140, w: 134 },
  laptopLabel: [187, 266],
  frame: { x: 290, y: 30, w: 362, h: 244 },
  card: (i) => ({ x: 306 + i * 172, y: 74, w: 158, h: 48 }),
  band: { x: 302, y: 212, w: 338, h: 48 },
  mono: 14,
  hand: 20,
  speech: 21,
}

const NARROW: Geo = {
  W: 360,
  H: 520,
  iva: { x: 14, y: 96, s: 1 },
  bubble: { x: 112, y: 14, w: 176, h: 56, tx: 70, ty: 112 },
  laptop: { x: 136, y: 116, w: 150 },
  laptopLabel: [211, 248],
  frame: { x: 6, y: 268, w: 348, h: 244 },
  card: (i) => ({ x: 16 + i * 168, y: 310, w: 160, h: 48 }),
  band: { x: 16, y: 452, w: 328, h: 48 },
  mono: 14,
  hand: 20.5,
  speech: 21,
}

const APPS = [
  { name: 'klopa-api', need: 'treba ≥ 8.15', ok: (v: Ver) => v === '8.15', fail: 'ne kreće' },
  { name: 'klopa-worker', need: 'zaključan na 8.12', ok: (v: Ver) => v === '8.12', fail: 'radi drukčije' },
]

export function LibConflict() {
  const [ver, setVer] = useState<Ver>('8.12')
  const [ref, width] = useWidth<HTMLDivElement>()
  const g = width !== null && width < 620 ? NARROW : WIDE
  const narrow = g === NARROW
  const apiOk = APPS[0].ok(ver)
  const bubble = apiOk ? ['A sad', 'klopa-worker?!'] : ['Kod mene', 'radi!']
  const label = `Ivin laptop: klopa-api radi s libvips 8.15. Poslužitelj-2 ima libvips ${ver}: ${APPS.map((a) => `${a.name} ${a.ok(ver) ? 'radi' : a.fail}`).join(', ')}.`
  return (
    <div ref={ref}>
      <Figure caption="Jedan operacijski sustav, jedna kopija sistemske biblioteke – i dvije aplikacije koje traže različite verzije.">
      <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={label} style={{ display: 'block', width: '100%', maxWidth: narrow ? 460 : undefined, margin: '0 auto', height: 'auto', overflow: 'visible' }}>
        {/* Iva and her laptop: there it works */}
        <Iva x={g.iva.x} y={g.iva.y} scale={g.iva.s} mood={apiOk ? 'worry' : 'grin'} holding="none" />
        <SpeechBubble {...g.bubble} lines={bubble} size={g.speech} seed={apiOk ? 7021 : 7011} />
        <Laptop
          x={g.laptop.x}
          y={g.laptop.y}
          w={g.laptop.w}
          seed={7031}
          screen={
            <g>
              <text x={8} y={22} className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--term-ok)' }}>
                ✓ klopa-api
              </text>
              <text x={8} y={42} className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--term-ink)' }}>
                libvips 8.15
              </text>
            </g>
          }
        />
        <text x={g.laptopLabel[0]} y={g.laptopLabel[1]} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--ink-2)' }}>
          Ivin laptop
        </text>

        {/* the server: one OS, one copy of the library, two apps */}
        <Rough shape={{ k: 'rect', ...g.frame }} seed={7041} strokeWidth={2} multi />
        <text x={g.frame.x + 12} y={g.frame.y + 28} className="k-svg-hand" style={{ fontSize: g.hand + 1 }}>
          poslužitelj-2
        </text>
        {APPS.map((a, i) => {
          const c = g.card(i)
          const ok = a.ok(ver)
          return (
            <g key={a.name}>
              <ProgramCard x={c.x} y={c.y} w={c.w} h={c.h} name={a.name} size={g.mono} seed={7050 + i * 9} stroke={ok ? 'var(--ink)' : 'var(--red)'} />
              <Face cx={c.x + c.w - 4} cy={c.y + 2} r={10} mood={ok ? 'calm' : 'dead'} seed={7060 + i * 5} />
              <text x={c.x + c.w / 2} y={c.y + c.h + 24} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--ink-2)' }}>
                {a.need}
              </text>
              {ok ? <Check x={c.x + 22} y={c.y + c.h + 50} size={9} seed={7070 + i} /> : <Cross x={c.x + 22} y={c.y + c.h + 50} size={8} seed={7072 + i} />}
              <text x={c.x + 38} y={c.y + c.h + 56} className="k-svg-hand" style={{ fontSize: g.hand, fill: ok ? 'var(--green)' : 'var(--red)' }}>
                {ok ? 'radi' : a.fail}
              </text>
              {/* both programs load the same library from the OS */}
              <Rough shape={{ k: 'line', x1: c.x + c.w / 2, y1: c.y + c.h + 64, x2: c.x + c.w / 2, y2: g.band.y }} seed={7080 + i} stroke="var(--pen)" strokeWidth={1.4} dash="4 5" />
            </g>
          )
        })}
        <Band x={g.band.x} y={g.band.y} w={g.band.w} h={g.band.h} label={`libvips ${ver}`} sub="jedna kopija za cijeli OS" size={16} subSize={g.mono} hatch="var(--hl-blue-ink)" seed={7090} />
      </svg>
      </Figure>
        <div className={styles.controls}>
          <Segmented<Ver>
            label="Koju verziju libvips-a instalirati na poslužitelj-2?"
            value={ver}
            onChange={setVer}
            options={[
              { value: '8.12', label: '8.12 (sada)' },
              { value: '8.15', label: '8.15 (za API)' },
            ]}
          />
        </div>
        <p className={styles.readout} aria-live="polite">
          {ver === '8.12' ? (
            <>
              <strong className={styles.bad}>klopa-api ne kreće</strong> – treba noviju biblioteku. klopa-worker radi.
            </>
          ) : (
            <>
              klopa-api radi, ali <strong className={styles.bad}>klopa-worker sad radi drukčije</strong>: fotografije izlaze drukčije, a provjeren je i zaključan samo na staru verziju.
            </>
          )}
        </p>
    </div>
  )
}
