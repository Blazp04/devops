import { memo } from 'react'
import { Cross } from '../sketch/Sketch'
import { hashSeed } from '../sketch/roughGen'
import { Brain, Cylinder, Envelope } from '../doodles/Things'
import { BoxedComputer, Cloud, CommitString, Disk, FoodBox, Globe, MiniLaptop, MiniLunchbox, MiniPerson, MiniServer, Network, QueueSlots, Shelf, TrayStack } from '../doodles/diagram-doodles'
import type { GlyphKind } from './glyph-kinds'
import { markerOf, type DiagramTone } from './helpers'

interface GlyphProps {
  kind: GlyphKind
  /** box the doodle is drawn into (top-left + size) */
  x: number
  y: number
  w: number
  h: number
  tone?: DiagramTone
  /** crashed / unreachable: dead face, red cross */
  down?: boolean
}

/**
 * The doodle drawn in a DNode's icon slot (or anywhere: it fills the box x, y, w, h). Drawn with the notebook pen at
 * a constant line width, so it stays crisp from ≈ 20 px up. Memoised: diagrams in simulations re-render often.
 */
export const NodeGlyph = memo(function NodeGlyph({ kind, x, y, w, h, tone = 'neutral', down }: GlyphProps) {
  const seed = 9000 + (hashSeed(kind) % 800)
  const tint = tone === 'neutral' ? undefined : markerOf(tone)
  const cx = x + w / 2
  const cy = y + h / 2
  const s = Math.min(w, h)
  const body = (() => {
    switch (kind) {
      case 'server':
        return <MiniServer x={cx - s * 0.42} y={y + h * 0.04} w={s * 0.84} h={h * 0.92} mood={down ? 'dead' : 'calm'} seed={seed} />
      case 'user':
        return <MiniPerson cx={cx} cy={y + h * 0.21} s={h * 0.8} shirt={tint ?? 'var(--hl-blue-ink)'} seed={seed} />
      case 'users':
        return (
          <g>
            <MiniPerson cx={cx + w * 0.2} cy={y + h * 0.2} s={h * 0.74} shirt="var(--hl-pink-ink)" hair="bun" seed={seed + 20} />
            <MiniPerson cx={cx - w * 0.16} cy={y + h * 0.27} s={h * 0.74} shirt={tint ?? 'var(--hl-blue-ink)'} seed={seed} />
          </g>
        )
      case 'lb':
        return <MiniPerson cx={cx - w * 0.14} cy={y + h * 0.24} s={h * 0.8} hair="cap" vest sign seed={seed} />
      case 'laptop':
        return <MiniLaptop x={x + w * 0.04} y={y + h * 0.16} w={w * 0.92} h={h * 0.7} seed={seed} />
      case 'database':
        return <Cylinder x={cx - s * 0.4} y={y + h * 0.06} w={s * 0.8} h={h * 0.86} seed={seed} />
      case 'queue':
        return <QueueSlots x={x} y={y + h * 0.24} w={w} h={h * 0.5} slots={3} filled={2} seed={seed} />
      case 'cloud':
        return <Cloud x={x} y={y + h * 0.12} w={w} h={h * 0.76} seed={seed} />
      case 'globe':
        return <Globe cx={cx} cy={cy} r={s * 0.44} seed={seed} />
      case 'git':
        return <CommitString x={x + w * 0.06} y={y + h * 0.7} w={w * 0.86} n={3} branch r={Math.max(2.6, h * 0.11)} seed={seed} />
      case 'registry':
        return <Shelf x={x + w * 0.04} y={y + h * 0.04} w={w * 0.92} h={h * 0.9} seed={seed} />
      case 'image':
        return <TrayStack x={x + w * 0.06} y={y + h * 0.08} w={w * 0.88} h={h * 0.84} seed={seed} />
      case 'lock':
      case 'secret':
        return <Envelope x={x + w * 0.04} y={y + h * 0.18} w={w * 0.92} h={h * 0.64} seed={seed} />
      case 'vm':
        return <BoxedComputer x={x + w * 0.06} y={y + h * 0.04} w={w * 0.88} h={h * 0.92} seed={seed} />
      case 'cpu':
        return <Brain x={x + w * 0.08} y={y + h * 0.12} w={w * 0.84} h={h * 0.76} busy={0.45} seed={seed} />
      case 'disk':
        return <Disk x={x + w * 0.1} y={y + h * 0.1} w={w * 0.8} h={h * 0.8} seed={seed} />
      case 'network':
        return <Network x={x} y={y + h * 0.06} w={w} h={h * 0.9} seed={seed} />
      case 'pod':
        return <MiniLunchbox x={x + w * 0.06} y={y + h * 0.06} w={w * 0.88} h={h * 0.86} tint={tint ?? 'var(--hl-blue-ink)'} seed={seed} />
      case 'container':
        return <FoodBox x={x + w * 0.06} y={y + h * 0.1} w={w * 0.88} h={h * 0.8} tint={tint ?? 'var(--hl-pink-ink)'} seed={seed} />
      case 'box':
        return <FoodBox x={x + w * 0.06} y={y + h * 0.1} w={w * 0.88} h={h * 0.8} tint={tint ?? 'var(--hl-yellow-ink)'} seed={seed} sw={1.5} />
    }
  })()
  return (
    <g className="k-glyph">
      {body}
      {down && kind !== 'server' && <Cross x={x + w - 4} y={y + 5} size={Math.max(4, s * 0.16)} seed={seed + 99} strokeWidth={2} />}
    </g>
  )
})
