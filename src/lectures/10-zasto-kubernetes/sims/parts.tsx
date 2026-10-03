/**
 * Shared drawings of L10: a container box per app (solid = running, dashed = desired but not running yet) and a
 * server frame with 14 slots. Built only from the kit pen (Rough) and doodles (FoodBox, ServerFace, SvgStamp).
 */
import { memo } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { FoodBox, Rough, ServerFace, SvgStamp, hashSeed } from '../../../kit'
import { APP_BY_ID } from '../model'

/**
 * One container: solid food box hatched in the app's marker (running) or a dashed pencil outline (ghost = desired).
 * `faded` (a container that is gone): only the drawing fades, the label stays at full contrast in --ink-3.
 */
export function AppBox({ x, y, w, h, app, version = 1, ghost, faded, seedKey, size = 15 }: { x: number; y: number; w: number; h: number; app: string; version?: number; ghost?: boolean; faded?: boolean; seedKey: string; size?: number }) {
  const meta = APP_BY_ID[app]
  const seed = hashSeed(seedKey) % 90000
  const v2 = app === 'api' && version > 1
  if (faded) {
    // same label position as FoodBox (centred below the lid)
    const lid = Math.max(5, Math.min(12, h * 0.24))
    return (
      <g>
        <g opacity={0.4}>
          <FoodBox x={x} y={y} w={w} h={h} seed={seed} tint={meta?.tint ?? 'var(--hl-blue-ink)'} angle={-41} label="" labelSize={size} />
        </g>
        <text x={x + w / 2} y={y + lid + (h - lid) / 2 + size * 0.36} textAnchor="middle" className="k-svg-mono" style={{ fontSize: size, fontWeight: 600, fill: 'var(--ink-3)' }}>
          {meta?.short ?? app}
        </text>
      </g>
    )
  }
  if (ghost) {
    return (
      <g>
        <Rough shape={{ k: 'rect', x: x + 1, y: y + 1, w: w - 2, h: h - 2 }} seed={seed} stroke="var(--ink-2)" strokeWidth={1.4} dash="4 4" roughness={0.8} />
        <text x={x + w / 2} y={y + h / 2 + size * 0.36} textAnchor="middle" className="k-svg-mono" style={{ fontSize: size, fontWeight: 600, fill: 'var(--ink-2)' }}>
          {meta?.short ?? app}
        </text>
      </g>
    )
  }
  return <FoodBox x={x} y={y} w={w} h={h} seed={seed} tint={v2 ? 'var(--hl-green-ink)' : (meta?.tint ?? 'var(--hl-blue-ink)')} angle={v2 ? 41 : -41} label={meta?.short ?? app} labelSize={size} />
}

export interface SlotItem {
  id: string
  app: string
  version: number
  ghost: boolean
  slot: number
}

interface ServerBoxProps {
  x: number
  y: number
  w: number
  h: number
  id: string
  name: string
  up: boolean
  items: SlotItem[]
  slotXY: (slot: number) => { x: number; y: number }
  cell: { w: number; h: number }
  slots: number
  /** drop target / selected target: yellow marker behind the frame */
  highlight: boolean
  /** mono font size of the counts and box labels */
  fs: number
  /** changes whenever anything drawn here changes (memo key) */
  sig: string
}

function ServerBoxImpl({ x, y, w, h, id, name, up, items, slotXY, cell, slots, highlight, fs }: ServerBoxProps) {
  const reduce = !!useReducedMotion()
  const used = items.length
  const mood = !up ? 'dead' : used >= slots ? 'panic' : used >= slots - 2 ? 'busy' : 'calm'
  const seed = hashSeed(`srv|${id}`) % 90000
  return (
    <g data-server={id}>
      {/* hit area for drag-and-drop (elementFromPoint → closest [data-server]); the pen strokes ignore the pointer */}
      <rect x={x - 6} y={y - 6} width={w + 12} height={h + 12} fill="transparent" pointerEvents="all" />
      {highlight && <Rough shape={{ k: 'rect', x: x - 5, y: y - 5, w: w + 10, h: h + 10 }} seed={seed + 1} stroke="var(--hl-yellow-ink)" strokeWidth={1} fillColor="var(--hl-yellow)" fillStyle="solid" roughness={1.4} />}
      <Rough shape={{ k: 'rect', x, y, w, h }} seed={seed} stroke={up ? 'var(--ink)' : 'var(--red)'} strokeWidth={1.9} fillColor="var(--paper)" fillStyle="solid" />
      <text x={x + 10} y={y + 23} className="k-svg-display" style={{ fontSize: 17, fontWeight: 700, fill: up ? 'var(--ink)' : 'var(--red)' }}>
        {name}
      </text>
      <text x={x + w - 40} y={y + 24} textAnchor="end" className="k-svg-mono" style={{ fontSize: fs, fontWeight: 600, fill: up ? 'var(--ink-2)' : 'var(--red)' }}>
        {up ? `${used}/${slots}` : `—/${slots}`}
      </text>
      <g transform={`translate(${x + w - 19} ${y + 19})`}>
        <ServerFace mood={mood} r={12} />
      </g>
      {Array.from({ length: slots }, (_, k) => {
        const p = slotXY(k)
        return <Rough key={k} shape={{ k: 'rect', x: p.x + 2, y: p.y + 2, w: cell.w - 4, h: cell.h - 4 }} seed={seed + 10 + k} stroke="var(--ink-4)" strokeWidth={1} dash="2 5" roughness={0.6} />
      })}
      <AnimatePresence initial={false}>
        {items.map((it) => {
          const p = slotXY(it.slot)
          return (
            <motion.g key={`${it.id}`} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }} transition={{ duration: 0.3 }}>
              <AppBox x={p.x} y={p.y} w={cell.w} h={cell.h} app={it.app} version={it.version} ghost={it.ghost} seedKey={it.id} size={fs} />
            </motion.g>
          )
        })}
      </AnimatePresence>
      {!up && (
        <>
          <Rough shape={{ k: 'rect', x: x + 4, y: y + 32, w: w - 8, h: h - 38 }} seed={seed + 3} stroke="none" fillColor="var(--red)" hachureGap={16} fillWeight={0.7} />
          <SvgStamp x={x + w / 2} y={y + h / 2 + 14} text="SRUŠEN" size={18} />
        </>
      )}
    </g>
  )
}

/** A server frame with its slots; re-renders only when its signature changes (the stage redraws 30× a second). */
export const ServerBox = memo(ServerBoxImpl, (a, b) => a.sig === b.sig && a.fs === b.fs && a.highlight === b.highlight && a.x === b.x && a.y === b.y && a.w === b.w && a.slotXY === b.slotXY)
