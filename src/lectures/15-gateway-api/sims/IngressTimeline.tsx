import { Check, Cross, Diagram, Rough, useWidth } from '../../../kit'
import css from '../styles.module.css'

const EVENTS: { date: string; text: string[]; tone: 'ok' | 'bad' | 'info' }[] = [
  { date: '31. listopada 2023.', text: ['Gateway API v1.0', 'stabilan (GA)'], tone: 'ok' },
  { date: '11. studenoga 2025.', text: ['najava: ingress-nginx', 'ide u mirovinu'], tone: 'info' },
  { date: '20. ožujka 2026.', text: ['ingress2gateway 1.0', '(alat za prelazak)'], tone: 'ok' },
  { date: '24. ožujka 2026.', text: ['ingress-nginx umirovljen:', 'bez izdanja i zakrpa'], tone: 'bad' },
  { date: 'lipanj 2026.', text: ['Gateway API v1.6'], tone: 'ok' },
]

const LABEL = `Vremenska crta: ${EVENTS.map((e) => `${e.date} ${e.text.join(' ')}`).join('; ')}.`

/** Pen timeline of Ingress → Gateway API (dated facts; the page wraps it in a fact callout). */
export function IngressTimeline() {
  const [ref, w] = useWidth<HTMLDivElement>()
  // wide lettering is 14–15 units in a 680 viewBox: ≥ 12 px from 583 px up
  const narrow = w !== null && w < 584
  const m = 14
  if (narrow) {
    const H = 40 + EVENTS.length * 78
    return (
      <div ref={ref}>
        <div className={css.narrowCap}>
          <Diagram width={340} height={H} label={LABEL}>
            <Rough shape={{ k: 'line', x1: 30, y1: 16, x2: 30, y2: H - 10 }} seed={2001} strokeWidth={1.8} />
            {EVENTS.map((e, i) => {
              const y = 40 + i * 78
              const color = e.tone === 'bad' ? 'var(--red)' : e.tone === 'ok' ? 'var(--green)' : 'var(--pen)'
              return (
                <g key={e.date}>
                  {e.tone === 'bad' ? <Cross x={30} y={y} size={9} /> : e.tone === 'ok' ? <Check x={30} y={y} size={8} /> : <Rough shape={{ k: 'ellipse', cx: 30, cy: y, w: 12, h: 12 }} seed={2010 + i} stroke={color} fillColor={color} fillStyle="solid" />}
                  <text x={52} y={y - 8} className="k-svg-mono" style={{ fontSize: m, fill: color, fontWeight: 700 }}>
                    {e.date}
                  </text>
                  {e.text.map((t, j) => (
                    <text key={j} x={52} y={y + 14 + j * 19} className="k-svg-display" style={{ fontSize: 15 }}>
                      {t}
                    </text>
                  ))}
                </g>
              )
            })}
          </Diagram>
        </div>
      </div>
    )
  }
  const W = 680
  const x0 = 40
  const step = (W - 2 * x0) / (EVENTS.length - 1)
  return (
    <div ref={ref}>
      <Diagram width={W} height={210} label={LABEL}>
        <Rough shape={{ k: 'line', x1: 16, y1: 100, x2: W - 10, y2: 100 }} seed={2002} strokeWidth={1.8} />
        {EVENTS.map((e, i) => {
          const x = x0 + i * step
          const color = e.tone === 'bad' ? 'var(--red)' : e.tone === 'ok' ? 'var(--green)' : 'var(--pen)'
          const anchor = i === 0 ? 'start' : i === EVENTS.length - 1 ? 'end' : 'middle'
          const tx = i === 0 ? x - 20 : i === EVENTS.length - 1 ? x + 20 : x
          const below = i % 2 === 0
          const dateY = below ? 128 : 80
          const textY = (j: number) => (below ? 150 + j * 19 : 58 - (e.text.length - 1 - j) * 19)
          return (
            <g key={e.date}>
              {e.tone === 'bad' ? <Cross x={x} y={100} size={10} /> : e.tone === 'ok' ? <Check x={x} y={98} size={9} /> : <Rough shape={{ k: 'ellipse', cx: x, cy: 100, w: 12, h: 12 }} seed={2020 + i} stroke={color} fillColor={color} fillStyle="solid" />}
              <text x={tx} y={dateY} textAnchor={anchor} className="k-svg-mono" style={{ fontSize: m, fill: color, fontWeight: 700 }}>
                {e.date}
              </text>
              {e.text.map((t, j) => (
                <text key={j} x={tx} y={textY(j)} textAnchor={anchor} className="k-svg-display" style={{ fontSize: 15 }}>
                  {t}
                </text>
              ))}
            </g>
          )
        })}
      </Diagram>
    </div>
  )
}
