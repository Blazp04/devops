import { Diagram, Rough } from '../../../kit'
import { ROTATION_GOAL_REAL_S } from '../../../engines/access/index.ts'
import { fmtReal, rotationRows } from '../lib/scenes'
import { Fit, Txt } from './Draw'

const MIN_S = 10
const MAX_S = 30 * 3600
const TICKS: { s: number; label: string }[] = [
  { s: 60, label: '1 min' },
  { s: 300, label: '5 min' },
  { s: 3600, label: '1 h' },
  { s: 24 * 3600, label: '24 h' },
]

const WG = { w: 760, h: 360, f: 15, label: 260, x0: 280, x1: 740, row: 44, top: 46 }
const NG = { w: 400, h: 560, f: 16, label: 0, x0: 16, x1: 384, row: 78, top: 50 }
const WIDE_MIN = Math.ceil((WG.w * 12) / (WG.f - 1))

function Chart({ g, wide }: { g: typeof WG; wide: boolean }) {
  const rows = rotationRows()
  const xs = (s: number) => g.x0 + ((Math.log10(Math.max(MIN_S, s)) - 1) / (Math.log10(MAX_S) - 1)) * (g.x1 - g.x0)
  const bottom = g.top + rows.length * g.row + 8
  const goalX = xs(ROTATION_GOAL_REAL_S)
  return (
    <Diagram width={g.w} height={g.h} label={`Najdulje čekanje da nova vrijednost stigne u datoteku u Podu, stvarno vrijeme: ${rows.map((r) => `${r.label} ${fmtReal(r.realWorst)}`).join('; ')}.`}>
      {/* the goal: < 5 min */}
      <Rough shape={{ k: 'line', x1: goalX, y1: g.top - 22, x2: goalX, y2: bottom }} seed={3001} stroke="var(--red)" strokeWidth={1.5} dash="6 5" />
      <Txt x={goalX + 6} y={g.top - 26} v="hand" size={wide ? 21 : 23} fill="var(--red)" anchor="start">
        cilj: &lt; 5 min
      </Txt>
      {rows.map((r, i) => {
        const y = g.top + i * g.row + (wide ? 0 : 26)
        const ok = r.realWorst <= ROTATION_GOAL_REAL_S
        const end = xs(r.realWorst)
        return (
          <g key={r.id}>
            <Txt x={wide ? 16 : g.x0} y={wide ? y + 20 : y - 6} v="display" size={g.f} anchor="start" fill="var(--ink)">
              {r.label}
            </Txt>
            <Rough shape={{ k: 'rect', x: g.x0, y: y + 6, w: Math.max(6, end - g.x0), h: 20 }} seed={3010 + i} stroke={ok ? 'var(--green)' : 'var(--red)'} strokeWidth={1.4} fillColor={ok ? 'var(--hl-green-ink)' : 'var(--hl-pink-ink)'} hachureGap={4.5} />
            <Txt x={Math.min(end + 8, g.x1 - 4)} y={y + 21} size={g.f} anchor={end + 90 > g.x1 ? 'end' : 'start'} fill={ok ? 'var(--green)' : 'var(--red)'} halo>
              {`${ok ? '✓' : '✗'} ${fmtReal(r.realWorst)}`}
            </Txt>
          </g>
        )
      })}
      {/* log axis */}
      <Rough shape={{ k: 'line', x1: g.x0, y1: bottom, x2: g.x1, y2: bottom }} seed={3002} stroke="var(--ink-3)" strokeWidth={1.2} />
      {TICKS.map((t) => (
        <g key={t.s}>
          <Rough shape={{ k: 'line', x1: xs(t.s), y1: bottom - 4, x2: xs(t.s), y2: bottom + 5 }} seed={3003 + t.s} stroke="var(--ink-3)" strokeWidth={1.2} />
          <Txt x={xs(t.s)} y={bottom + 24} size={wide ? g.f - 1 : g.f} fill="var(--ink-2)">
            {t.label}
          </Txt>
        </g>
      ))}
    </Diagram>
  )
}

/** „Kada nova vrijednost stigne do Poda”: worst case per approach (volume consumers, real time) from E5 rotationEstimate, on a log scale. */
export function RotationChart() {
  return <Fit wideMin={WIDE_MIN}>{(wide) => <Chart g={wide ? WG : NG} wide={wide} />}</Fit>
}
