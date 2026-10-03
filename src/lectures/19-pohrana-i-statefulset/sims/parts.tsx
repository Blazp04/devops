/**
 * Drawing pieces shared by the lecture's stages and steppers, composed from kit doodles (same pen, fixed seeds).
 * Where the rows live: container layer = food box (pink, −41°), emptyDir = food box (yellow, +41°), a
 * PersistentVolume = the menza fridge (kit grammar: pv = fridge) with the order count on its door.
 */
import { Cross, FoodBox, Fridge, Rough } from '../../../kit'

export type StoreKind = 'container' | 'emptyDir' | 'pv'

/** A small store icon (≈ 20 × 16) with its top-left at x, y. */
export function StoreIcon({ x, y, kind, seed = 19100 }: { x: number; y: number; kind: StoreKind; seed?: number }) {
  if (kind === 'pv') return <Fridge x={x + 3} y={y - 2} w={14} h={19} seed={seed} />
  return <FoodBox x={x} y={y} w={20} h={16} seed={seed} tint={kind === 'container' ? 'var(--hl-pink-ink)' : 'var(--hl-yellow-ink)'} angle={kind === 'container' ? -41 : 41} sw={1.3} />
}

/** The fridge (= PersistentVolume) with the order count on its door; `deleting` = PVC Terminating. */
export function FridgeDisk({ x, y, w, h, count, deleting, dim, seed = 19200 }: { x: number; y: number; w: number; h: number; count: number | null; deleting?: boolean; dim?: boolean; seed?: number }) {
  return (
    <g>
      <g opacity={dim ? 0.55 : 1}>
        <Fridge x={x} y={y} w={w} h={h} seed={seed} />
      </g>
      {count !== null && (
        <text x={x + w * 0.42} y={y + h * 0.74} textAnchor="middle" className="k-svg-mono k-dhalo" style={{ fontSize: 13, fontWeight: 700, fill: 'var(--ink)' }}>
          {count}
        </text>
      )}
      {deleting && <Rough shape={{ k: 'rect', x: x - 4, y: y - 4, w: w + 8, h: h + 8 }} seed={seed + 7} stroke="var(--red)" strokeWidth={1.6} dash="5 4" />}
    </g>
  )
}

/** The cable between a fridge and a node: pen = attached, dashed pen = attaching, red dashed + ✗ = stuck on a dead node. */
export function Cable({ pts, state, seed = 19300 }: { pts: [number, number][]; state: 'attached' | 'attaching' | 'stuck'; seed?: number }) {
  const stroke = state === 'stuck' ? 'var(--red)' : 'var(--pen)'
  const mid = pts[Math.floor((pts.length - 1) / 2)]
  const nxt = pts[Math.floor((pts.length - 1) / 2) + 1] ?? mid
  const cx = (mid[0] + nxt[0]) / 2
  const cy = (mid[1] + nxt[1]) / 2
  return (
    <g>
      <Rough shape={{ k: 'lin', pts }} seed={seed} stroke={stroke} strokeWidth={state === 'attached' ? 2.2 : 1.8} dash={state === 'attached' ? undefined : '6 5'} roughness={0.8} />
      {state === 'stuck' && <Cross x={cx} y={cy} size={8} />}
    </g>
  )
}

/** Dashed placeholder where a Pod would be (scaled down, deleted, waiting). Centre x, y. */
export function GhostPod({ x, y, size, seed = 19400 }: { x: number; y: number; size: number; seed?: number }) {
  return <Rough shape={{ k: 'rect', x: x - size * 0.55, y: y - size * 0.4, w: size * 1.1, h: size * 0.8 }} seed={seed} stroke="var(--ink-3)" strokeWidth={1.3} dash="4 4" />
}
