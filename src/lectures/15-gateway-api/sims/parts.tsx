import { Rough } from '../../../kit'

/** A padlock (TLS) in the same pen: body + shackle. `state`: ok = green, bad = red with ✗, off = dashed grey. Centre (x, y). */
export function Padlock({ x, y, s = 1, state = 'ok', seed = 1501 }: { x: number; y: number; s?: number; state?: 'ok' | 'bad' | 'off'; seed?: number }) {
  const stroke = state === 'ok' ? 'var(--green)' : state === 'bad' ? 'var(--red)' : 'var(--ink-3)'
  const w = 16 * s
  const h = 12 * s
  return (
    <g>
      <Rough shape={{ k: 'arc', cx: x, cy: y - h * 0.15, w: w * 0.7, h: h * 1.25, start: Math.PI, stop: Math.PI * 2 }} seed={seed} stroke={stroke} strokeWidth={1.6} dash={state === 'off' ? '3 3' : undefined} />
      <Rough
        shape={{ k: 'rect', x: x - w / 2, y: y - h * 0.15, w, h }}
        seed={seed + 1}
        stroke={stroke}
        strokeWidth={1.6}
        fillColor={state === 'off' ? undefined : stroke}
        hachureGap={2.6}
        dash={state === 'off' ? '3 3' : undefined}
      />
      {state === 'bad' && <Rough shape={{ k: 'lin', pts: [[x - w * 0.8, y - h], [x + w * 0.8, y + h]] }} seed={seed + 2} stroke="var(--red)" strokeWidth={2} />}
    </g>
  )
}

/** GatewayClass = the gate's blueprint: an index card with a small dashed gate on it and the class name. Box x, y, w, h. */
export function ClassCard({ x, y, w, h, name = 'eg', size = 14, seed = 1521 }: { x: number; y: number; w: number; h: number; name?: string; size?: number; seed?: number }) {
  const gx = x + w * 0.2
  const gw = w * 0.6
  const gy = y + h * 0.16
  const gh = h * 0.46
  return (
    <g>
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} strokeWidth={1.5} fillColor="var(--note-yellow)" fillStyle="solid" />
      <Rough shape={{ k: 'lin', pts: [[gx, gy + gh], [gx, gy + gh * 0.35], [gx + gw / 2, gy], [gx + gw, gy + gh * 0.35], [gx + gw, gy + gh]] }} seed={seed + 1} strokeWidth={1.3} dash="3 2.5" stroke="var(--note-ink)" />
      <text x={x + w / 2} y={y + h - h * 0.12} textAnchor="middle" className="k-svg-mono" style={{ fontSize: size, fill: 'var(--note-ink)', fontWeight: 600 }}>
        {name}
      </text>
    </g>
  )
}

/** An owner label in the roles view: handwritten words with a marker stroke under the baseline (the colour also has a word, never colour alone). */
export function OwnerTag({ x, y, text, tone, size = 14, anchor = 'middle' }: { x: number; y: number; text: string; tone: 'class' | 'gw' | 'route'; size?: number; anchor?: 'start' | 'middle' | 'end' }) {
  const ink = tone === 'class' ? 'var(--hl-yellow-ink)' : tone === 'gw' ? 'var(--hl-blue-ink)' : 'var(--hl-green-ink)'
  const w = text.length * size * 0.62
  const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x
  return (
    <g>
      <Rough shape={{ k: 'line', x1: x0 - 2, y1: y + 5.5, x2: x0 + w + 2, y2: y + 4.5 }} seed={1541 + text.length} stroke={ink} strokeWidth={size * 0.4} roughness={0.8} />
      <text x={x} y={y} textAnchor={anchor} className="k-svg-hand" style={{ fontSize: size * 1.45, fill: 'var(--ink)' }}>
        {text}
      </text>
    </g>
  )
}
