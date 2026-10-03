/**
 * The last stop of the course trailer: where lecture 01 starts. Lana's laptop runs gunicorn on 127.0.0.1:8000 —
 * „Kod mene radi!” — and Petra, on her phone, cannot open it. Composed from the kit's doodles; two layouts by
 * container width (wide 760 × 300 from 640 px: Kalam 22 → ≥ 18,5 px; narrow 360 × 552 from 300 px: 22 → ≥ 18,3 px).
 */
import { Laptop, Lana, Petra, ServerFace, SpeechBubble, useWidth } from '../../../kit'

interface StartGeo {
  vb: [number, number]
  laptop: { x: number; y: number; w: number }
  laptopLabel: [number, number]
  laptopAddr: [number, number]
  lana: { x: number; y: number; s: number; label: [number, number]; bubble: [number, number, number, number]; tail: [number, number] }
  petra: { x: number; y: number; s: number; label: [number, number]; bubble: [number, number, number, number]; tail: [number, number] }
}

const WIDE: StartGeo = {
  vb: [760, 300],
  laptop: { x: 290, y: 52, w: 200 },
  laptopLabel: [390, 226],
  laptopAddr: [390, 250],
  lana: { x: 150, y: 112, s: 1.1, label: [194, 272], bubble: [26, 62, 176, 46], tail: [178, 122] },
  petra: { x: 560, y: 112, s: 1.1, label: [604, 272], bubble: [566, 62, 168, 46], tail: [612, 122] },
}

const NARROW: StartGeo = {
  vb: [360, 552],
  laptop: { x: 90, y: 22, w: 180 },
  laptopLabel: [180, 180],
  laptopAddr: [180, 204],
  lana: { x: 16, y: 252, s: 1, label: [56, 398], bubble: [112, 240, 174, 46], tail: [94, 276] },
  petra: { x: 264, y: 400, s: 1, label: [304, 544], bubble: [100, 404, 156, 46], tail: [268, 424] },
}

export function RewindStart() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const narrow = w !== null && w < 615 /* 760 × 17 / 21: Caveat 21 stays ≥ 17 px */
  const g = narrow ? NARROW : WIDE
  const sw = g.laptop.w * 0.9
  const [lb, pb] = [g.lana.bubble, g.petra.bubble]
  return (
    <div ref={ref}>
      <svg
        viewBox={`0 0 ${g.vb[0]} ${g.vb[1]}`}
        role="img"
        aria-label="Lanin laptop s Klopom na adresi localhost:8000. Lana kaže: „Kod mene radi!”. Petra na mobitelu kaže: „Ne otvara se.”"
        style={{ display: 'block', width: '100%', height: 'auto', maxWidth: narrow ? 460 : 860, margin: '0 auto', overflow: 'visible' }}
      >
        <Laptop
          x={g.laptop.x}
          y={g.laptop.y}
          w={g.laptop.w}
          seed={9871}
          screen={
            <g>
              <text x={10} y={26} className="k-svg-mono" style={{ fontSize: 15, fill: 'var(--term-ink)' }}>
                gunicorn
              </text>
              <text x={10} y={48} className="k-svg-mono" style={{ fontSize: 15, fill: 'var(--term-ink)' }}>
                127.0.0.1:8000
              </text>
              <g transform={`translate(${sw - 26} ${g.laptop.w * 0.36})`}>
                <ServerFace mood="calm" r={14} />
              </g>
            </g>
          }
        />
        <text x={g.laptopLabel[0]} y={g.laptopLabel[1]} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 21 }}>
          Lanin laptop
        </text>
        <text x={g.laptopAddr[0]} y={g.laptopAddr[1]} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 15, fill: 'var(--ink-2)' }}>
          localhost:8000
        </text>

        <Lana x={g.lana.x} y={g.lana.y} scale={g.lana.s} holding="mug" mood="grin" />
        <text x={g.lana.label[0]} y={g.lana.label[1]} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 21 }}>
          Lana
        </text>
        <SpeechBubble x={lb[0]} y={lb[1]} w={lb[2]} h={lb[3]} tx={g.lana.tail[0]} ty={g.lana.tail[1]} lines={['Kod mene radi!']} size={22} seed={9872} />

        <Petra x={g.petra.x} y={g.petra.y} scale={g.petra.s} holding="phone" mood="worry" />
        <text x={g.petra.label[0]} y={g.petra.label[1]} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 21 }}>
          Petra
        </text>
        <SpeechBubble x={pb[0]} y={pb[1]} w={pb[2]} h={pb[3]} tx={g.petra.tail[0]} ty={g.petra.tail[1]} lines={['Ne otvara se.']} size={22} seed={9873} />
      </svg>
    </div>
  )
}
