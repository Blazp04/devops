/**
 * The hook's story beat: Veliki without power on Friday at 12:03 (its cable pulled out of the socket), an empty dashed
 * place for „drugi poslužitelj?”, Davor proposing to buy it and Lana asking the question the whole lecture answers.
 * Wide (≥ 600 px, drawn 1:1 or larger) and narrow (360 units, at most 460 px) layouts; the narrow one uses larger
 * lettering, so it stays legible in a 320 px phone column.
 */
import { Cross, Davor, Lana, Rough, SpeechBubble, SvgStamp, useWidth, type Pt } from '../../../kit'
import { Srv } from './parts'

interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface Geo {
  W: number
  H: number
  veliki: Box
  spare: Box
  /** the red note under the servers, one or two lines */
  note: { x: number; y: number; lines: string[] }
  /** wall socket with the pulled-out plug (wide layout only) */
  socket?: { x: number; y: number }
  davor: { x: number; y: number; s: number; bubble: Box }
  lana: { x: number; y: number; s: number; bubble: Box }
  kalam: number
  hand: number
  mono: number
  name: number
}

const WIDE: Geo = {
  W: 600,
  H: 226,
  veliki: { x: 4, y: 104, w: 150, h: 72 },
  spare: { x: 168, y: 104, w: 150, h: 72 },
  note: { x: 4, y: 214, lines: ['petak, 12:03–14:03: nitko ne može naručiti ručak'] },
  socket: { x: 120, y: 14 },
  davor: { x: 336, y: 108, s: 0.9, bubble: { x: 304, y: 32, w: 100, h: 56 } },
  lana: { x: 508, y: 108, s: 0.9, bubble: { x: 413, y: 6, w: 186, h: 92 } },
  kalam: 18,
  hand: 19,
  mono: 13,
  name: 16,
}

const NARROW: Geo = {
  W: 360,
  H: 384,
  veliki: { x: 4, y: 244, w: 170, h: 74 },
  spare: { x: 186, y: 244, w: 170, h: 74 },
  note: { x: 4, y: 350, lines: ['petak, 12:03–14:03:', 'nitko ne može naručiti ručak'] },
  davor: { x: 34, y: 92, s: 0.8, bubble: { x: 2, y: 6, w: 116, h: 64 } },
  lana: { x: 254, y: 114, s: 0.8, bubble: { x: 150, y: 6, w: 208, h: 96 } },
  kalam: 21.5,
  hand: 21,
  mono: 14.5,
  name: 17,
}

/** The speaker's mouth inside the 80 × 120 character box. */
const mouth = (c: { x: number; y: number; s: number }): Pt => [c.x + 40 * c.s, c.y + 36 * c.s]

/** A wall socket and Veliki's power cable, pulled out: the provider's power failure, drawn. */
function PulledPlug({ socket, from }: { socket: { x: number; y: number }; from: Pt }) {
  const { x, y } = socket
  const plug: Pt = [x - 34, y + 16]
  return (
    <g aria-hidden="true">
      <Rough shape={{ k: 'rect', x, y, w: 34, h: 42 }} seed={8053} strokeWidth={1.6} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'ellipse', cx: x + 11, cy: y + 21, w: 5, h: 10 }} seed={8054} strokeWidth={1.4} fillColor="var(--ink)" fillStyle="solid" />
      <Rough shape={{ k: 'ellipse', cx: x + 23, cy: y + 21, w: 5, h: 10 }} seed={8055} strokeWidth={1.4} fillColor="var(--ink)" fillStyle="solid" />
      <Rough
        shape={{
          k: 'curve',
          pts: [from, [from[0] - 6, from[1] - 34], [plug[0] - 30, plug[1] + 18], [plug[0], plug[1] + 6]],
        }}
        seed={8056}
        strokeWidth={1.6}
      />
      <Rough shape={{ k: 'rect', x: plug[0], y: plug[1], w: 15, h: 12 }} seed={8057} strokeWidth={1.5} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'line', x1: plug[0] + 15, y1: plug[1] + 3, x2: plug[0] + 21, y2: plug[1] + 3 }} seed={8058} strokeWidth={1.4} />
      <Rough shape={{ k: 'line', x1: plug[0] + 15, y1: plug[1] + 9, x2: plug[0] + 21, y2: plug[1] + 9 }} seed={8059} strokeWidth={1.4} />
      <Cross x={x - 6} y={y - 2} size={6} />
    </g>
  )
}

export function HookScene() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const g = w !== null && w < 600 ? NARROW : WIDE
  const sp = g.spare
  const v = g.veliki
  return (
    // measure the full width; the narrow layout is capped inside, so it can switch back when the column grows
    <div ref={ref}>
      <div style={g === NARROW ? { maxWidth: 460, margin: '0 auto' } : undefined}>
        <svg
          viewBox={`0 0 ${g.W} ${g.H}`}
          role="img"
          aria-label="Veliki je bez struje: kabel je izvučen iz utičnice i poslužitelj ne radi. Uz njega je iscrtkano prazno mjesto za drugi poslužitelj. Davor kaže: kupimo drugi! Lana pita: dvostruko brže? Dvostruko pouzdanije?"
          style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}
        >
          {g.socket && (
            <>
              <PulledPlug socket={g.socket} from={[v.x + 40, v.y - 2]} />
              <text x={g.socket.x + 46} y={g.socket.y + 27} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--red)' }}>
                nestalo struje
              </text>
            </>
          )}
          <Srv x={v.x} y={v.y} w={v.w} h={v.h} name="Veliki" spec="4 vCPU · 8 GB" down seed={8051} nameSize={g.name} specSize={g.mono} faceR={13} />
          <SvgStamp x={v.x + v.w * 0.52} y={v.y + v.h + 1} text="NEMA STRUJE" size={g.mono} rotate={-6} />
          <Rough shape={{ k: 'rect', x: sp.x, y: sp.y, w: sp.w, h: sp.h }} seed={8052} stroke="var(--pen)" strokeWidth={1.6} dash="7 6" roughness={1} />
          <text x={sp.x + sp.w / 2} y={sp.y + sp.h / 2 - 2} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--pen)' }}>
            drugi poslužitelj?
          </text>
          <text x={sp.x + sp.w / 2} y={sp.y + sp.h / 2 + 20} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--ink-2)' }}>
            još ga nema
          </text>
          {g.note.lines.map((line, i) => (
            <text key={line} x={g.note.x} y={g.note.y + i * (g.hand + 4)} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--red)' }}>
              {line}
            </text>
          ))}

          <Davor x={g.davor.x} y={g.davor.y} scale={g.davor.s} mood="grin" />
          <SpeechBubble {...g.davor.bubble} tx={mouth(g.davor)[0]} ty={mouth(g.davor)[1]} lines={['Kupimo', 'drugi!']} size={g.kalam} seed={8061} />
          <Lana x={g.lana.x} y={g.lana.y} scale={g.lana.s} mood="open" flip />
          <SpeechBubble {...g.lana.bubble} tx={mouth(g.lana)[0]} ty={mouth(g.lana)[1]} lines={['Dvostruko brže?', 'Dvostruko', 'pouzdanije?']} size={g.kalam} seed={8071} />
        </svg>
      </div>
    </div>
  )
}
