/**
 * The three reasons for more than one computer — capacity, availability, proximity — as three index cards, each with
 * a small drawing from the menza grammar and a verdict for Klopa.
 * Layout by container width: three columns (≥ 700 px, each drawing ≥ 190 px), one card per row with the drawing
 * beside the text (≥ 520 px), or stacked cards on phones. Drawings are 200 units wide, so lettering stays ≥ 12 px.
 */
import { Check, Cross, Globe, Rough, RoughBox, TrayDefs, useWidth } from '../../../kit'
import { Srv } from './parts'
import styles from '../styles.module.css'

function CapacityDoodle() {
  return (
    <svg viewBox="0 0 200 106" role="img" aria-label="Red pladnjeva pred poslužiteljem koji je već najveći stroj u ponudi: iznad njega je strop." style={{ display: 'block', width: '100%', height: 'auto' }}>
      <TrayDefs id="l03cap" />
      <Rough shape={{ k: 'line', x1: 92, y1: 28, x2: 198, y2: 28 }} seed={8301} stroke="var(--red)" strokeWidth={1.9} dash="7 5" roughness={0.8} />
      <text x={198} y={20} textAnchor="end" className="k-svg-hand" style={{ fontSize: 19, fill: 'var(--red)' }}>
        strop
      </text>
      <Srv x={100} y={36} w={96} h={48} name="Veliki" mood="panic" seed={8302} nameSize={14} faceR={12} />
      {[0, 1, 2].map((i) => (
        <use key={i} href="#l03cap-tray" x={2 + i * 30} y={66 - (i % 2) * 3} width={28} height={19} />
      ))}
      <use href="#l03cap-tray" x={16} y={46} width={28} height={19} />
      <use href="#l03cap-tray" x={46} y={44} width={28} height={19} />
      <text x={2} y={102} className="k-svg-hand" style={{ fontSize: 19, fill: 'var(--tray-ink)' }}>
        zahtjevi čekaju
      </text>
    </svg>
  )
}

function AvailabilityDoodle() {
  return (
    <svg viewBox="0 0 200 106" role="img" aria-label="Dva poslužitelja: jedan je srušen, drugi i dalje odgovara i pladanj dobiva kvačicu." style={{ display: 'block', width: '100%', height: 'auto' }}>
      <TrayDefs id="l03av" />
      <Srv x={2} y={38} w={94} h={62} name="app1" down stamp="SRUŠEN" stampSize={13} seed={8311} nameSize={14} faceR={12} />
      <Srv x={104} y={38} w={94} h={62} name="app2" seed={8312} nameSize={14} faceR={12} />
      <use href="#l03av-tray" x={124} y={6} width={30} height={20} />
      <Check x={170} y={15} size={9} />
      <Cross x={48} y={18} size={7} />
    </svg>
  )
}

function ProximityDoodle() {
  return (
    <svg viewBox="0 0 200 106" role="img" aria-label="Globus: Zagreb je blizu Frankfurta (najmanje 7 ms), a Sydney je daleko (najmanje 160 ms po povratnom putu)." style={{ display: 'block', width: '100%', height: 'auto' }}>
      <Globe cx={44} cy={64} r={32} />
      <circle cx={56} cy={44} r={4} style={{ fill: 'var(--pen)' }} />
      <text x={50} y={18} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 13, fill: 'var(--ink)' }}>
        Zagreb
      </text>
      <Rough
        shape={{
          k: 'curve',
          pts: [
            [56, 44],
            [120, 26],
            [166, 78],
          ],
        }}
        seed={8321}
        stroke="var(--pen)"
        strokeWidth={1.6}
        dash="5 4"
      />
      <circle cx={168} cy={82} r={4} style={{ fill: 'var(--red)' }} />
      <text x={198} y={103} textAnchor="end" className="k-svg-mono" style={{ fontSize: 13, fill: 'var(--red)' }}>
        Sydney ≥ 160 ms
      </text>
    </svg>
  )
}

const CARDS = [
  {
    no: '①',
    title: 'Kapacitet',
    text: 'Promet je veći nego što stigne i najveći stroj u ponudi. Više strojeva zajedno nosi više od bilo kojeg pojedinačnog.',
    klopa: 'Klopa: još ne. Veliki nosi ručak.',
    yes: false,
    doodle: <CapacityDoodle />,
  },
  {
    no: '②',
    title: 'Dostupnost',
    text: 'Jedan stroj je jedinstvena točka kvara. S dva stroja jedan smije pasti, a aplikacija radi dalje.',
    klopa: 'Klopa: da! Petak, 12:03.',
    yes: true,
    doodle: <AvailabilityDoodle />,
  },
  {
    no: '③',
    title: 'Blizina korisnicima',
    text: 'Svjetlost u optičkom vlaknu za 1 ms prijeđe oko 200 km. Udaljenom korisniku ni najbrži poslužitelj ne može odgovoriti brže od toga.',
    klopa: 'Klopa: ne. Svi su u kampusu.',
    yes: false,
    doodle: <ProximityDoodle />,
  },
]

type Mode = 'three' | 'row' | 'stack'

export function ReasonCards() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const mode: Mode = w === null || w >= 700 ? 'three' : w >= 520 ? 'row' : 'stack'
  return (
    <div ref={ref} className={styles.reasons} style={{ gridTemplateColumns: mode === 'three' ? 'repeat(3, minmax(0, 1fr))' : 'minmax(0, 1fr)' }}>
      {CARDS.map((c, i) => (
        <RoughBox key={c.title} className="k-card" seed={8330 + i} pad={2}>
          <div className={mode === 'row' ? styles.reasonRow : styles.reason}>
            <h3 className={styles.reasonTitle}>
              <span className={styles.reasonNo} aria-hidden="true">
                {c.no}
              </span>{' '}
              {c.title}
            </h3>
            <div className={styles.reasonPic}>{c.doodle}</div>
            <p className={styles.reasonText}>{c.text}</p>
            <p className={`${styles.reasonKlopa} ${c.yes ? styles.yes : styles.no}`}>{c.klopa}</p>
          </div>
        </RoughBox>
      ))}
    </div>
  )
}
