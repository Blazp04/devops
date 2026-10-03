import { Diagram, Rough } from '../../../kit'
import { whereRows } from '../lib/scenes'
import type { Cell } from '../lib/scenes'
import { Fit, Lines, Txt } from './Draw'

const COLS: { key: 'git' | 'redis' | 'etcd' | 'pod'; head: string[] }[] = [
  { key: 'git', head: ['u Gitu', ''] },
  { key: 'redis', head: ['predmemorija', 'Argo CD-a'] },
  { key: 'etcd', head: ['etcd', '(Secret)'] },
  { key: 'pod', head: ['datoteka', 'u Podu'] },
]

const WORD: Record<Cell, string> = { readable: 'čitljivo', cipher: 'šifrat', address: 'adresa', none: '—' }

function CellBox({ x, y, w, h, cell, f, seed }: { x: number; y: number; w: number; h: number; cell: Cell; f: number; seed: number }) {
  const color = cell === 'readable' ? 'var(--red)' : cell === 'cipher' ? 'var(--green)' : cell === 'address' ? 'var(--pen)' : 'var(--ink-3)'
  return (
    <g>
      {cell !== 'none' && (
        <Rough
          shape={{ k: 'rect', x: x - w / 2, y: y - h / 2, w, h }}
          seed={seed}
          stroke={color}
          strokeWidth={cell === 'readable' ? 1.7 : 1.4}
          fillColor={cell === 'readable' ? 'var(--hl-pink-ink)' : undefined}
          hachureGap={5}
          fillWeight={0.8}
          dash={cell === 'address' ? '5 4' : undefined}
        />
      )}
      <Txt x={x} y={y + f * 0.36} size={f} fill={color}>
        {WORD[cell]}
      </Txt>
    </g>
  )
}

const WW = { w: 760, h: 430, f: 15, name: 16 }
const NW = { w: 400, h: 640, f: 15, name: 16 }
const WIDE_MIN = Math.ceil((WW.w * 12) / (WW.f - 1))

function Wide() {
  const rows = whereRows()
  const x0 = 230
  const cw = 132
  const top = 92
  const rh = 54
  return (
    <Diagram width={WW.w} height={WW.h} label={`Gdje živi čitljiva vrijednost za šest pristupa: ${rows.map((r) => `${r.label}: Git ${WORD[r.git]}, Argo CD ${WORD[r.redis]}, etcd ${WORD[r.etcd]}, Pod ${WORD[r.pod]}`).join('; ')}.`}>
      {COLS.map((c, i) => (
        <Lines key={c.key} x={x0 + cw * i + cw / 2} y={34} lines={c.head.filter(Boolean)} gap={WW.f + 4} v="display" size={WW.f} fill="var(--ink-2)" />
      ))}
      <Rough shape={{ k: 'line', x1: 14, y1: 70, x2: WW.w - 14, y2: 70 }} seed={2901} stroke="var(--ink-3)" strokeWidth={1.2} />
      {rows.map((r, j) => {
        const y = top + j * rh + rh / 2 - 8
        return (
          <g key={r.approach}>
            <Txt x={20} y={y + 6} v="display" size={WW.name} anchor="start">
              {r.label}
            </Txt>
            {COLS.map((c, i) => (
              <CellBox key={c.key} x={x0 + cw * i + cw / 2} y={y} w={108} h={32} cell={r[c.key]} f={WW.f} seed={2910 + j * 11 + i} />
            ))}
            {j < rows.length - 1 && <Rough shape={{ k: 'line', x1: 14, y1: y + rh / 2, x2: WW.w - 14, y2: y + rh / 2 }} seed={2960 + j} stroke="var(--ink-4)" strokeWidth={0.9} dash="2 6" />}
          </g>
        )
      })}
      <Txt x={WW.w / 2} y={WW.h - 12} v="hand" size={21} fill="var(--red)">
        zadnji stupac nikad nije prazan: Pod mora znati vrijednost
      </Txt>
    </Diagram>
  )
}

function Narrow() {
  const rows = whereRows()
  const cw = 94
  const x0 = 12
  const top = 84
  const rh = 88
  return (
    <Diagram width={NW.w} height={NW.h} label={`Gdje živi čitljiva vrijednost za šest pristupa: ${rows.map((r) => `${r.label}: Git ${WORD[r.git]}, Argo CD ${WORD[r.redis]}, etcd ${WORD[r.etcd]}, Pod ${WORD[r.pod]}`).join('; ')}.`}>
      {COLS.map((c, i) => (
        <Lines key={c.key} x={x0 + cw * i + cw / 2} y={28} lines={c.head.filter(Boolean)} gap={NW.f + 4} v="display" size={NW.f} fill="var(--ink-2)" />
      ))}
      <Rough shape={{ k: 'line', x1: 8, y1: 64, x2: NW.w - 8, y2: 64 }} seed={2902} stroke="var(--ink-3)" strokeWidth={1.2} />
      {rows.map((r, j) => {
        const y = top + j * rh
        return (
          <g key={r.approach}>
            <Txt x={x0 + 2} y={y + 12} v="display" size={NW.name} anchor="start">
              {r.label}
            </Txt>
            {COLS.map((c, i) => (
              <CellBox key={c.key} x={x0 + cw * i + cw / 2} y={y + 44} w={84} h={30} cell={r[c.key]} f={NW.f} seed={2930 + j * 11 + i} />
            ))}
          </g>
        )
      })}
      <Lines x={NW.w / 2} y={NW.h - 36} lines={['zadnji stupac nikad nije prazan:', 'Pod mora znati vrijednost']} gap={22} v="hand" size={22} fill="var(--red)" />
    </Diagram>
  )
}

/** Scene 4 „Ostale mogućnosti”: where a readable copy of the value lives for each approach (E5 compareApproaches). */
export function WhereGrid() {
  return <Fit wideMin={WIDE_MIN}>{(wide) => (wide ? <Wide /> : <Narrow />)}</Fit>
}
