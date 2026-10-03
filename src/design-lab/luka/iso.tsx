/**
 * Luka — isometric SVG primitive set. Every illustration on the page is built from these.
 * Colours are passed as CSS colour strings (normally 'var(--token)'); faces are shaded in CSS.
 */
import type { CSSProperties, ReactNode } from 'react'
import { faceMatrix, iso, pts, segs, U, type Dir, type V3 } from './iso-math'
import s from './iso.module.css'

const cvar = (c: string) => ({ '--c': c }) as CSSProperties

/* ------------------------------------------------------------------ box */

export function Box({
  x,
  y,
  z = 0,
  w,
  d,
  h,
  c,
  className,
  children,
}: {
  x: number
  y: number
  z?: number
  w: number
  d: number
  h: number
  c: string
  className?: string
  children?: ReactNode
}) {
  const top: V3[] = [
    [x, y, z + h],
    [x + w, y, z + h],
    [x + w, y + d, z + h],
    [x, y + d, z + h],
  ]
  const left: V3[] = [
    [x, y + d, z],
    [x + w, y + d, z],
    [x + w, y + d, z + h],
    [x, y + d, z + h],
  ]
  const right: V3[] = [
    [x + w, y, z],
    [x + w, y + d, z],
    [x + w, y + d, z + h],
    [x + w, y, z + h],
  ]
  return (
    <g className={`${s.box} ${className ?? ''}`} style={cvar(c)}>
      {h > 0 && <polygon className={s.l} points={pts(left)} />}
      {h > 0 && <polygon className={s.r} points={pts(right)} />}
      <polygon className={s.t} points={pts(top)} />
      {children}
    </g>
  )
}

/** A flat quad on a face. plane: 'z' = horizontal at `at`, 'y' = vertical plane y=at, 'x' = vertical plane x=at. */
export function Quad({
  plane,
  at,
  a0,
  a1,
  b0,
  b1,
  className,
  c,
}: {
  plane: 'x' | 'y' | 'z'
  at: number
  a0: number
  a1: number
  b0: number
  b1: number
  className?: string
  c?: string
}) {
  let p: V3[]
  if (plane === 'z')
    p = [
      [a0, b0, at],
      [a1, b0, at],
      [a1, b1, at],
      [a0, b1, at],
    ]
  else if (plane === 'y')
    p = [
      [a0, at, b0],
      [a1, at, b0],
      [a1, at, b1],
      [a0, at, b1],
    ]
  else
    p = [
      [at, a0, b0],
      [at, a1, b0],
      [at, a1, b1],
      [at, a0, b1],
    ]
  return <polygon className={className ?? s.flat} style={c ? cvar(c) : undefined} points={pts(p)} />
}

/* ------------------------------------------------------------ container */

export type Lamp = 'ok' | 'warn' | 'err' | 'off' | null

export function LampDot({ x, y, z, state, r = 0.13, blink }: { x: number; y: number; z: number; state: Lamp; r?: number; blink?: boolean }) {
  if (!state) return null
  const [sx, sy] = iso(x, y, z)
  const cls = state === 'ok' ? s.lampOk : state === 'warn' ? s.lampWarn : state === 'err' ? s.lampErr : s.lampOff
  return (
    <g className={blink ? s.blink : undefined}>
      {state !== 'off' && <circle className={`${cls} ${s.halo}`} cx={sx} cy={sy} r={r * U * 2.6} />}
      <circle className={cls} cx={sx} cy={sy} r={r * U} stroke="var(--edge)" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
    </g>
  )
}

export function Container({
  x,
  y,
  z = 0,
  axis = 'x',
  len = 2,
  wid = 0.8,
  hei = 0.86,
  c,
  label,
  labelSize,
  lamp = null,
  lampBlink,
  ghost,
  className,
}: {
  x: number
  y: number
  z?: number
  axis?: 'x' | 'y'
  len?: number
  wid?: number
  hei?: number
  c: string
  label?: string
  labelSize?: number
  lamp?: Lamp
  lampBlink?: boolean
  ghost?: boolean
  className?: string
}) {
  const w = axis === 'x' ? len : wid
  const d = axis === 'x' ? wid : len
  const ribs: [V3, V3][] = []
  const roof: [V3, V3][] = []
  const door: [V3, V3][] = []
  const step = 0.17
  const n = Math.max(2, Math.floor((len - 0.2) / step))
  for (let i = 0; i <= n; i++) {
    const t = 0.1 + ((len - 0.2) * i) / n
    if (axis === 'x') ribs.push([[x + t, y + d, z + 0.05], [x + t, y + d, z + hei - 0.05]])
    else ribs.push([[x + w, y + t, z + 0.05], [x + w, y + t, z + hei - 0.05]])
  }
  const rn = Math.max(1, Math.floor(len / 0.34))
  for (let i = 1; i < rn; i++) {
    const t = (len * i) / rn
    if (axis === 'x') roof.push([[x + t, y + 0.04, z + hei], [x + t, y + d - 0.04, z + hei]])
    else roof.push([[x + 0.04, y + t, z + hei], [x + w - 0.04, y + t, z + hei]])
  }
  // door end: seam + 4 locking bars
  for (const f of [0.2, 0.38, 0.62, 0.8]) {
    if (axis === 'x') door.push([[x + w, y + d * f, z + 0.06], [x + w, y + d * f, z + hei - 0.06]])
    else door.push([[x + w * f, y + d, z + 0.06], [x + w * f, y + d, z + hei - 0.06]])
  }
  const fs = labelSize ?? Math.min(hei * 0.42, 0.42)
  return (
    <g className={`${ghost ? s.ghost : ''} ${className ?? ''}`}>
      <Box x={x} y={y} z={z} w={w} d={d} h={hei} c={c} />
      {!ghost && (
        <g style={cvar(c)}>
          <path className={s.rib} d={segs(ribs)} />
          <path className={s.ribLight} d={segs(roof)} />
          <path className={s.rib} d={segs(door)} />
          {label && (
            <text
              className={s.stencil}
              fontSize={fs * U}
              transform={axis === 'x' ? faceMatrix('left', x + 0.16, y + d, z + hei * 0.5 + fs * 0.36) : faceMatrix('right', x + w, y + d - 0.16, z + hei * 0.5 + fs * 0.36)}
            >
              {label}
            </text>
          )}
        </g>
      )}
      <LampDot x={x + w / 2} y={y + d / 2} z={z + hei + 0.05} state={lamp} blink={lampBlink} r={0.11} />
    </g>
  )
}

/* ---------------------------------------------------------------- truck */

export function Truck({
  x,
  y,
  dir,
  cargo,
  cab = 'var(--cab)',
  scale = 1,
  lights,
  beacon,
  placard,
  hazard,
}: {
  x: number
  y: number
  dir: Dir
  cargo: string
  cab?: string
  scale?: number
  lights?: boolean
  /** red rotating light on the roof: this truck carries an error */
  beacon?: boolean
  /** short code painted on a white plate on the cargo side (e.g. 503) */
  placard?: string
  /** amber hazard blinkers: standing and waiting */
  hazard?: boolean
}) {
  const k = scale
  const L = 1.0 * k
  const W = 0.44 * k
  const alongX = dir === 'x+' || dir === 'x-'
  const fwd = dir === 'x+' || dir === 'y+' ? 1 : -1
  // local frame: a along travel, b across. Convert local boxes (a0, len, b0, wid) to world boxes.
  const box = (a0: number, len: number, b0: number, wid: number) =>
    alongX
      ? { x: fwd > 0 ? x + a0 : x - a0 - len, y: y + b0, w: len, d: wid }
      : { x: x + b0, y: fwd > 0 ? y + a0 : y - a0 - len, w: wid, d: len }
  const chassis = box(-L / 2, L, -W / 2, W)
  const cargoB = box(-L / 2 + 0.03 * k, 0.64 * k, -W / 2 + 0.02 * k, W - 0.04 * k)
  const cabB = box(L / 2 - 0.29 * k, 0.29 * k, -W / 2 + 0.02 * k, W - 0.04 * k)
  const front = fwd > 0
  const parts = [
    <Box key="ch" {...chassis} z={0.06 * k} h={0.1 * k} c="var(--chassis)" />,
    ...(front
      ? [<Box key="cg" {...cargoB} z={0.16 * k} h={0.38 * k} c={cargo} />, <Box key="cb" {...cabB} z={0.16 * k} h={0.36 * k} c={cab} />]
      : [<Box key="cb" {...cabB} z={0.16 * k} h={0.36 * k} c={cab} />, <Box key="cg" {...cargoB} z={0.16 * k} h={0.38 * k} c={cargo} />]),
  ]
  // windscreen on the visible front face (x+ or y+) and a side window otherwise
  const z0 = 0.34 * k
  const z1 = 0.48 * k
  let glass: ReactNode
  if (dir === 'x+') glass = <Quad plane="x" at={cabB.x + cabB.w} a0={cabB.y + 0.05 * k} a1={cabB.y + cabB.d - 0.05 * k} b0={z0} b1={z1} className={s.glass} />
  else if (dir === 'y+') glass = <Quad plane="y" at={cabB.y + cabB.d} a0={cabB.x + 0.05 * k} a1={cabB.x + cabB.w - 0.05 * k} b0={z0} b1={z1} className={s.glass} />
  else if (dir === 'x-') glass = <Quad plane="y" at={cabB.y + cabB.d} a0={cabB.x + 0.04 * k} a1={cabB.x + 0.17 * k} b0={z0} b1={z1} className={s.glass} />
  else glass = <Quad plane="x" at={cabB.x + cabB.w} a0={cabB.y + 0.04 * k} a1={cabB.y + 0.17 * k} b0={z0} b1={z1} className={s.glass} />
  let beam: ReactNode = null
  if (lights) {
    const tip = L / 2 + 0.9 * k
    const p = (a: number, b: number): V3 =>
      alongX ? [x + fwd * a, y + b, 0.02] : [x + b, y + fwd * a, 0.02]
    beam = <polygon className={s.pool} points={pts([p(L / 2, -W * 0.45), p(tip, -W * 1.1), p(tip, W * 1.1), p(L / 2, W * 0.45)])} />
  }
  const top = iso(cabB.x + cabB.w / 2, cabB.y + cabB.d / 2, 0.53 * k)
  // placard painted on the roof of the cargo box: the roof is never hidden by the truck in the next lane
  let plate: ReactNode = null
  if (placard) {
    const zr = 0.54 * k + 0.002
    const m = 0.07 * k
    plate = (
      <g>
        <Quad plane="z" at={zr} a0={cargoB.x + m} a1={cargoB.x + cargoB.w - m} b0={cargoB.y + m} b1={cargoB.y + cargoB.d - m} className={s.placard} />
        {alongX ? (
          <FaceText face="top" x={cargoB.x + cargoB.w / 2} y={cargoB.y + cargoB.d / 2 + 0.075 * k} z={zr} size={0.24 * k} anchor="middle" fit={(cargoB.w - 2 * m) * 0.8} className={s.placardText}>
            {placard}
          </FaceText>
        ) : (
          <FaceText face="topY" x={cargoB.x + cargoB.w / 2 + 0.075 * k} y={cargoB.y + cargoB.d / 2} z={zr} size={0.24 * k} anchor="middle" fit={(cargoB.d - 2 * m) * 0.8} className={s.placardText}>
            {placard}
          </FaceText>
        )}
      </g>
    )
  }
  let blinkers: ReactNode = null
  if (hazard) {
    const c1 = iso(cabB.x + (alongX ? (front ? cabB.w : 0) : 0.04 * k), cabB.y + (alongX ? 0.04 * k : front ? cabB.d : 0), 0.3 * k)
    const c2 = iso(cabB.x + (alongX ? (front ? cabB.w : 0) : cabB.w - 0.04 * k), cabB.y + (alongX ? cabB.d - 0.04 * k : front ? cabB.d : 0), 0.3 * k)
    blinkers = (
      <g className={s.blinkSlowStep}>
        <circle className={s.blinker} cx={c1[0]} cy={c1[1]} r={1.9 * k} />
        <circle className={s.blinker} cx={c2[0]} cy={c2[1]} r={1.9 * k} />
      </g>
    )
  }
  return (
    <g>
      {beam}
      {parts}
      {glass}
      {plate}
      {blinkers}
      {beacon && (
        <g className={s.blink}>
          <circle className={`${s.lampErr} ${s.halo}`} cx={top[0]} cy={top[1] - 1} r={0.09 * U * k * 3.2} />
          <path className={s.lampErr} d={`M${top[0] - 2.6 * k} ${top[1] + 0.6}a${2.6 * k} ${2.6 * k} 0 0 1 ${5.2 * k} 0z`} stroke="var(--edge)" strokeWidth={0.6} />
        </g>
      )}
    </g>
  )
}

/* --------------------------------------------------------------- person */

export function Person({ x, y, c, phone = true }: { x: number; y: number; c: string; phone?: boolean }) {
  const [hx, hy] = iso(x + 0.09, y + 0.09, 0.62)
  const [px2, py2] = iso(x + 0.24, y + 0.2, 0.42)
  return (
    <g>
      <Box x={x} y={y} z={0} w={0.18} d={0.18} h={0.26} c="var(--trousers)" />
      <Box x={x - 0.02} y={y - 0.02} z={0.26} w={0.22} d={0.22} h={0.26} c={c} />
      <circle cx={hx} cy={hy} r={0.12 * U} fill="var(--skin)" stroke="var(--edge)" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
      {phone && <rect x={px2 - 1.6} y={py2 - 2.2} width={3.2} height={4.4} rx={0.6} fill="var(--phone)" />}
    </g>
  )
}

/* ----------------------------------------------------------------- lamp */

export function LampPost({ x, y, h = 2.4, dir = 'x+' }: { x: number; y: number; h?: number; dir?: Dir }) {
  const reach = 0.5
  const hx = dir === 'x+' ? x + reach : dir === 'x-' ? x - reach : x
  const hy = dir === 'y+' ? y + reach : dir === 'y-' ? y - reach : y
  const [gx, gy] = iso(hx, hy, h - 0.12)
  const pool: V3[] = []
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    pool.push([hx + Math.cos(a) * 1.5, hy + Math.sin(a) * 1.5, 0])
  }
  const arm =
    dir === 'x+'
      ? { x: x, y: y - 0.04, w: reach + 0.08, d: 0.08 }
      : dir === 'x-'
        ? { x: x - reach, y: y - 0.04, w: reach + 0.08, d: 0.08 }
        : dir === 'y+'
          ? { x: x - 0.04, y: y, w: 0.08, d: reach + 0.08 }
          : { x: x - 0.04, y: y - reach, w: 0.08, d: reach + 0.08 }
  return (
    <g>
      <polygon className={s.pool} points={pts(pool)} />
      <Box x={x - 0.09} y={y - 0.09} w={0.18} d={0.18} h={0.12} c="var(--steel)" />
      <Box x={x - 0.05} y={y - 0.05} w={0.1} d={0.1} h={h} c="var(--steel)" />
      <Box {...arm} z={h} h={0.07} c="var(--steel)" />
      <Box x={hx - 0.14} y={hy - 0.1} z={h - 0.1} w={0.28} d={0.2} h={0.1} c="var(--lamp-head)" />
      <circle cx={gx} cy={gy + 2} r={U * 0.55} className={s.pool} />
    </g>
  )
}

/* ----------------------------------------------------------------- road */

export function Road({ x0, y0, x1, y1, w = 1, center = true }: { x0: number; y0: number; x1: number; y1: number; w?: number; center?: boolean }) {
  const alongX = Math.abs(x1 - x0) >= Math.abs(y1 - y0)
  const ax = Math.min(x0, x1)
  const bx = Math.max(x0, x1)
  const ay = Math.min(y0, y1)
  const by = Math.max(y0, y1)
  const h = w / 2
  const quad: V3[] = alongX
    ? [
        [ax, ay - h, 0],
        [bx, ay - h, 0],
        [bx, ay + h, 0],
        [ax, ay + h, 0],
      ]
    : [
        [ax - h, ay, 0],
        [ax + h, ay, 0],
        [ax + h, by, 0],
        [ax - h, by, 0],
      ]
  const kerbs: [V3, V3][] = alongX
    ? [
        [[ax, ay - h, 0], [bx, ay - h, 0]],
        [[ax, ay + h, 0], [bx, ay + h, 0]],
      ]
    : [
        [[ax - h, ay, 0], [ax - h, by, 0]],
        [[ax + h, ay, 0], [ax + h, by, 0]],
      ]
  const mid: [V3, V3][] = alongX ? [[[ax + 0.1, ay, 0], [bx - 0.1, ay, 0]]] : [[[ax, ay + 0.1, 0], [ax, by - 0.1, 0]]]
  return (
    <g>
      <polygon className={s.road} points={pts(quad)} />
      <path className={s.kerb} d={segs(kerbs)} />
      {center && <path className={s.roadLine} d={segs(mid)} />}
    </g>
  )
}

/** Free-form flat asphalt/concrete area. */
export function Area({ points, className, c }: { points: V3[]; className?: 'road' | 'water' | 'flat'; c?: string }) {
  const cls = className === 'water' ? s.water : className === 'road' ? s.road : s.flat
  return <polygon className={cls} style={c ? cvar(c) : undefined} points={pts(points)} />
}

/** Painted line(s) on the ground. */
export function Paint({ lines, dashed, color }: { lines: [V3, V3][]; dashed?: boolean; color?: string }) {
  return (
    <path
      className={s.paintLine}
      d={segs(lines)}
      style={{ ...(color ? { stroke: color } : null), ...(dashed ? { strokeDasharray: '6 5' } : null) }}
    />
  )
}

/** Water surface with drifting wave dashes (only motion that is ambient; kept quiet). */
export function Water({ x0, y0, x1, y1, waves = true }: { x0: number; y0: number; x1: number; y1: number; waves?: boolean }) {
  const quad: V3[] = [
    [x0, y0, -0.25],
    [x1, y0, -0.25],
    [x1, y1, -0.25],
    [x0, y1, -0.25],
  ]
  const lines: [V3, V3][] = []
  let k = 0
  for (let yy = y0 + 0.6; yy < y1 - 0.3; yy += 0.9) {
    const off = (k++ % 3) * 0.7
    lines.push([[x0 + 0.3 + off, yy, -0.25], [x1 - 0.3, yy, -0.25]])
  }
  return (
    <g>
      <polygon className={s.water} points={pts(quad)} />
      {waves && <path className={s.wave} d={segs(lines)} />}
    </g>
  )
}

/* ---------------------------------------------------------------- crane */

/**
 * Rubber-tyred gantry crane straddling an area. Legs at x0/x1 and y0/y1; the trolley runs along x on the
 * top girders at position `tx` (world x); the spreader hangs at height `hookZ`. `load` renders under the spreader.
 */
export function Gantry({
  x0,
  x1,
  y0,
  y1,
  h,
  tx,
  hookZ,
  load,
  c = 'var(--yellow)',
}: {
  x0: number
  x1: number
  y0: number
  y1: number
  h: number
  tx: number
  hookZ: number
  load?: ReactNode
  c?: string
}) {
  const t = 0.16
  const ym = (y0 + y1) / 2
  const [cx, cy] = iso(tx, ym, h - 0.05)
  const [hx, hy] = iso(tx, ym, hookZ + 0.1)
  return (
    <g>
      {/* back legs */}
      <Box x={x0} y={y0} w={t} d={t} h={h} c={c} />
      <Box x={x1 - t} y={y0} w={t} d={t} h={h} c={c} />
      {/* back girder */}
      <Box x={x0} y={y0} z={h} w={x1 - x0} d={t} h={0.22} c={c} />
      {load}
      <line x1={cx - 3} y1={cy} x2={hx - 3} y2={hy} className={s.cable} />
      <line x1={cx + 3} y1={cy} x2={hx + 3} y2={hy} className={s.cable} />
      <Box x={tx - 0.35} y={ym - 0.3} z={hookZ + 0.02} w={0.7} d={0.6} h={0.07} c="var(--steel)" />
      {/* front legs + girder + cross beams + trolley */}
      <Box x={x0} y={y1 - t} w={t} d={t} h={h} c={c} />
      <Box x={x1 - t} y={y1 - t} w={t} d={t} h={h} c={c} />
      <Box x={x0} y={y0} z={h} w={t} d={y1 - y0} h={0.22} c={c} />
      <Box x={x1 - t} y={y0} z={h} w={t} d={y1 - y0} h={0.22} c={c} />
      <Box x={x0} y={y1 - t} z={h} w={x1 - x0} d={t} h={0.22} c={c} />
      <Box x={tx - 0.3} y={y0 + 0.05} z={h + 0.22} w={0.6} d={y1 - y0 - 0.1} h={0.2} c="var(--steel)" />
    </g>
  )
}

/* ---------------------------------------------------------------- tower */

export function Tower({ x, y, h = 4.2, beacon = true, label, sign }: { x: number; y: number; h?: number; beacon?: boolean; label?: string; sign?: string }) {
  const cabZ = h - 1
  const [bx, by] = iso(x + 0.6, y + 0.6, h + 0.75)
  return (
    <g>
      <Box x={x + 0.25} y={y + 0.25} w={0.7} d={0.7} h={cabZ} c="var(--concrete-dark)" />
      {label && (
        <text className={s.stencil} fontSize={0.36 * U} transform={faceMatrix('right', x + 0.95, y + 0.85, cabZ - 0.6)}>
          {label}
        </text>
      )}
      {sign && (
        <g>
          <Box x={x + 0.02} y={y + 1.2} z={cabZ - 0.46} w={1.16} d={0.05} h={0.4} c="var(--navy)" />
          <FaceText face="left" x={x + 0.6} y={y + 1.25} z={cabZ - 0.36} size={0.22} anchor="middle" className={s.signText}>
            {sign}
          </FaceText>
        </g>
      )}
      <Box x={x} y={y} z={cabZ} w={1.2} d={1.2} h={0.9} c="var(--navy-2)" />
      <Quad plane="y" at={y + 1.2} a0={x + 0.08} a1={x + 1.12} b0={cabZ + 0.32} b1={cabZ + 0.72} className={s.window} />
      <Quad plane="x" at={x + 1.2} a0={y + 0.08} a1={y + 1.12} b0={cabZ + 0.32} b1={cabZ + 0.72} className={s.window} />
      <Box x={x - 0.1} y={y - 0.1} z={cabZ + 0.9} w={1.4} d={1.4} h={0.1} c="var(--steel)" />
      <line x1={bx} y1={by + 12} x2={bx} y2={by} stroke="var(--steel)" strokeWidth={1.6} />
      {beacon && (
        <g className={s.aviation}>
          <circle cx={bx} cy={by} r={U * 0.45} className={`${s.aviationLamp} ${s.halo}`} />
          <circle cx={bx} cy={by} r={2.6} className={s.aviationLamp} stroke="var(--edge)" strokeWidth={0.6} />
        </g>
      )}
    </g>
  )
}

/* -------------------------------------------------------------- bollard */

export function Bollard({ x, y }: { x: number; y: number }) {
  return <Box x={x} y={y} w={0.22} d={0.22} h={0.32} c="var(--navy-2)" />
}

/* ---------------------------------------------------------- face text */

export function FaceText({
  face,
  x,
  y,
  z,
  size,
  children,
  dark,
  className,
  anchor,
  fit,
}: {
  face: 'left' | 'right' | 'top' | 'topY'
  x: number
  y: number
  z: number
  size: number
  children: ReactNode
  dark?: boolean
  className?: string
  anchor?: 'start' | 'middle' | 'end'
  /** squeeze/stretch the lettering to exactly this many world units (so it never runs off its plate) */
  fit?: number
}) {
  return (
    <text
      className={className ?? (dark ? s.stencilDark : s.stencil)}
      fontSize={size * U}
      textAnchor={anchor}
      transform={faceMatrix(face, x, y, z)}
      textLength={fit ? fit * U : undefined}
      lengthAdjust={fit ? 'spacingAndGlyphs' : undefined}
    >
      {children}
    </text>
  )
}

/** Small flat sign label in screen space (not projected) — for legibility of key names. */
export function SignLabel({ x, y, z, children, size = 0.5 }: { x: number; y: number; z: number; children: ReactNode; size?: number }) {
  const [sx, sy] = iso(x, y, z)
  return (
    <text className={s.label} x={sx} y={sy} fontSize={size * U} textAnchor="middle">
      {children}
    </text>
  )
}


/* ----------------------------------------------------------------- pod */

/** Pod = container(s) on a dark pallet. Tag on the side = label; lamp on top = status; footprint = resource request. */
export function PodBox({
  x,
  y,
  z = 0,
  len = 1.6,
  wid = 0.78,
  hei = 0.78,
  c,
  lamp,
  blink,
  ghost,
  label,
  tag = 'var(--yellow)',
}: {
  x: number
  y: number
  z?: number
  len?: number
  wid?: number
  hei?: number
  c: string
  lamp: Lamp
  blink?: boolean
  ghost?: boolean
  label?: string
  tag?: string
}) {
  return (
    <g>
      <Box x={x - 0.06} y={y - 0.06} z={z} w={len + 0.12} d={wid + 0.12} h={0.08} c="var(--chassis)" />
      <Container x={x} y={y} z={z + 0.08} len={len} wid={wid} hei={hei - 0.08} c={c} label={label} lamp={lamp} lampBlink={blink} ghost={ghost} />
      {!ghost && <Quad plane="y" at={y + wid + 0.001} a0={x + len - 0.42} a1={x + len - 0.12} b0={z + 0.3} b1={z + 0.52} c={tag} />}
    </g>
  )
}

/* ---------------------------------------------------------------- silo */

/** Database = storage silo; the gauge on the front shows how full it is. */
export function Silo({ x, y, r = 0.7, h = 1.8, c = 'var(--steel-3)', level = 0.6 }: { x: number; y: number; r?: number; h?: number; c?: string; level?: number }) {
  const [cx, by] = iso(x, y, 0)
  const ty = iso(x, y, h)[1]
  const rx = r * Math.SQRT2 * U
  const ry = rx / 2
  const left = `M${cx - rx} ${ty}L${cx - rx} ${by}A${rx} ${ry} 0 0 0 ${cx} ${by + ry}L${cx} ${ty + ry}A${rx} ${ry} 0 0 1 ${cx - rx} ${ty}Z`
  const right = `M${cx} ${ty + ry}L${cx} ${by + ry}A${rx} ${ry} 0 0 0 ${cx + rx} ${by}L${cx + rx} ${ty}A${rx} ${ry} 0 0 1 ${cx} ${ty + ry}Z`
  const band = (yy: number) => `M${cx - rx} ${yy}A${rx} ${ry} 0 0 0 ${cx + rx} ${yy}`
  const g0 = ty + ry + 6
  const g1 = by + ry - 6
  return (
    <g className={s.box} style={cvar(c)}>
      <path className={s.l} d={left} />
      <path className={s.r} d={right} />
      <path className={s.rib} d={`${band(ty + (by - ty) * 0.33)}${band(ty + (by - ty) * 0.66)}`} />
      <ellipse className={s.t} cx={cx} cy={ty} rx={rx} ry={ry} />
      <ellipse cx={cx} cy={ty} rx={rx * 0.45} ry={ry * 0.45} fill="none" stroke="var(--edge)" strokeWidth={0.8} />
      <rect x={cx - rx * 0.55} y={g0} width={5} height={g1 - g0} fill="var(--chassis)" stroke="var(--edge)" strokeWidth={0.8} />
      <rect x={cx - rx * 0.55} y={g1 - (g1 - g0) * level} width={5} height={(g1 - g0) * level} fill="var(--sig-green)" />
    </g>
  )
}

/* ------------------------------------------------------------- lockbox */

/** Secret = sealed lockbox with a padlock; its value is never painted on it. */
export function Lockbox({ x, y, w = 1, d = 0.7, h = 0.6 }: { x: number; y: number; w?: number; d?: number; h?: number }) {
  const [px, py] = iso(x + w * 0.5, y + d, h * 0.55)
  return (
    <g>
      <Box x={x} y={y} w={w} d={d} h={h} c="var(--navy-2)" />
      <Box x={x - 0.04} y={y - 0.04} z={h} w={w + 0.08} d={d + 0.08} h={0.06} c="var(--steel)" />
      <path d={`M${px - 5} ${py - 4}v-5a5 5 0 0 1 10 0v5`} fill="none" stroke="var(--yellow)" strokeWidth={2.4} />
      <rect x={px - 8} y={py - 4} width={16} height={12} fill="var(--yellow)" stroke="var(--edge)" strokeWidth={1} />
      <circle cx={px} cy={py + 1.5} r={1.8} fill="var(--edge)" />
    </g>
  )
}

/* ---------------------------------------------------------------- rails */

/** Git history = rail track along x; a siding joins at `branchAt` (optional). */
export function Rails({ x0, x1, y, branchAt }: { x0: number; x1: number; y: number; branchAt?: number }) {
  const sleepers: [V3, V3][] = []
  for (let xx = x0 + 0.15; xx < x1; xx += 0.35) sleepers.push([[xx, y - 0.32, 0], [xx, y + 0.32, 0]])
  const rails: [V3, V3][] = [
    [[x0, y - 0.18, 0], [x1, y - 0.18, 0]],
    [[x0, y + 0.18, 0], [x1, y + 0.18, 0]],
  ]
  if (branchAt !== undefined) {
    rails.push([[branchAt, y + 0.18, 0], [branchAt + 1.2, y + 1.38, 0]])
    rails.push([[branchAt + 0.36, y + 0.18, 0], [branchAt + 1.56, y + 1.38, 0]])
    rails.push([[branchAt + 1.2, y + 1.38, 0], [x1, y + 1.38, 0]])
    rails.push([[branchAt + 1.56, y + 1.38, 0], [x1, y + 1.38, 0]])
  }
  return (
    <g>
      <path d={segs(sleepers)} stroke="var(--rust)" strokeWidth={2.2} vectorEffect="non-scaling-stroke" opacity={0.7} />
      <path d={segs(rails)} stroke="var(--steel)" strokeWidth={1.8} vectorEffect="non-scaling-stroke" fill="none" />
    </g>
  )
}

/** Git commit = sealed wagon with a short hash stencilled on its side. */
export function Wagon({ x, y, hash, c = 'var(--cab)', head }: { x: number; y: number; hash: string; c?: string; head?: boolean }) {
  return (
    <g>
      <Box x={x} y={y - 0.3} z={0.08} w={1.1} d={0.6} h={0.1} c="var(--chassis)" />
      <Box x={x + 0.05} y={y - 0.26} z={0.18} w={1.0} d={0.52} h={0.5} c={c} />
      <FaceText face="left" x={x + 0.14} y={y + 0.26} z={0.34} size={0.2} dark>
        {hash}
      </FaceText>
      {head && <LampDot x={x + 0.55} y={y} z={0.75} state="ok" r={0.1} />}
    </g>
  )
}

/* -------------------------------------------------------------- barrier */

/** Sawhorse barrier: two legs and a plank of alternating hazard blocks, along x or y. */
export function Barrier({ x, y, len, axis = 'x', z = 0, h = 0.42, n = 7 }: { x: number; y: number; len: number; axis?: 'x' | 'y'; z?: number; h?: number; n?: number }) {
  const t = 0.07
  const legs =
    axis === 'x'
      ? [
          { x: x + 0.04, y: y - 0.06, w: t, d: 0.12 },
          { x: x + len - 0.04 - t, y: y - 0.06, w: t, d: 0.12 },
        ]
      : [
          { x: x - 0.06, y: y + 0.04, w: 0.12, d: t },
          { x: x - 0.06, y: y + len - 0.04 - t, w: 0.12, d: t },
        ]
  const seg = len / n
  return (
    <g>
      {legs.map((l, k) => (
        <Box key={k} {...l} z={z} h={h} c="var(--steel)" />
      ))}
      {Array.from({ length: n }, (_, k) => (
        <Box
          key={`b${k}`}
          x={axis === 'x' ? x + k * seg : x - 0.05}
          y={axis === 'x' ? y - 0.05 : y + k * seg}
          z={z + h - 0.02}
          w={axis === 'x' ? seg : 0.1}
          d={axis === 'x' ? 0.1 : seg}
          h={0.16}
          c={k % 2 ? 'var(--hazard-dark)' : 'var(--yellow)'}
        />
      ))}
    </g>
  )
}

/* ----------------------------------------------------------- sign board */

/** Free-standing sign plate on two posts, facing the viewer (+y face for axis x, +x face for axis y). */
export function SignBoard({
  x,
  y,
  len,
  axis = 'x',
  z = 0,
  postH = 0.5,
  plateH = 0.62,
  c = 'var(--sig-red)',
  text,
  size = 0.42,
  textClass,
}: {
  x: number
  y: number
  len: number
  axis?: 'x' | 'y'
  z?: number
  postH?: number
  plateH?: number
  c?: string
  text: string
  size?: number
  textClass?: string
}) {
  const p = 0.07
  const zp = z + postH
  return (
    <g>
      {axis === 'x' ? (
        <>
          <Box x={x + 0.12} y={y} z={z} w={p} d={p} h={postH} c="var(--steel)" />
          <Box x={x + len - 0.12 - p} y={y} z={z} w={p} d={p} h={postH} c="var(--steel)" />
          <Box x={x} y={y} z={zp} w={len} d={0.07} h={plateH} c={c} />
          <FaceText face="left" x={x + len / 2} y={y + 0.07} z={zp + plateH / 2 - size * 0.36} size={size} anchor="middle" className={textClass}>
            {text}
          </FaceText>
        </>
      ) : (
        <>
          <Box x={x} y={y + 0.12} z={z} w={p} d={p} h={postH} c="var(--steel)" />
          <Box x={x} y={y + len - 0.12 - p} z={z} w={p} d={p} h={postH} c="var(--steel)" />
          <Box x={x} y={y} z={zp} w={0.07} d={len} h={plateH} c={c} />
          <FaceText face="right" x={x + 0.07} y={y + len / 2} z={zp + plateH / 2 - size * 0.36} size={size} anchor="middle" className={textClass}>
            {text}
          </FaceText>
        </>
      )}
    </g>
  )
}

/* ------------------------------------------------------ rotating beacon */

/** Rotating amber warning beacon: a dome and two light beams sweeping the ground plane at its height. */
export function RotBeacon({ x, y, z, angle, r = 0.12, tone = 'amber' }: { x: number; y: number; z: number; angle: number; r?: number; tone?: 'amber' | 'red' }) {
  const R = 1.7
  const w = 0.3
  const beam = (a: number) =>
    pts([
      [x, y, z],
      [x + R * Math.cos(a - w), y + R * Math.sin(a - w), z],
      [x + R * Math.cos(a + w), y + R * Math.sin(a + w), z],
    ])
  const [cx, cy] = iso(x, y, z)
  return (
    <g className={tone === 'red' ? s.beaconRed : undefined}>
      <polygon className={s.beam} points={beam(angle)} />
      <polygon className={s.beam} points={beam(angle + Math.PI)} />
      <circle className={s.beaconHalo} cx={cx} cy={cy} r={r * U * 2.8} />
      <path className={s.beaconDome} d={`M${cx - r * U} ${cy + 2}a${r * U} ${r * U} 0 0 1 ${2 * r * U} 0z`} />
      <rect x={cx - r * U - 1} y={cy + 1.5} width={2 * r * U + 2} height={2.4} fill="var(--edge)" />
    </g>
  )
}

/* -------------------------------------------------------------- archive */

/** etcd = the port's records archive: a steel cabinet of drawers (the cluster's state, written down). */
export function Archive({ x, y, w = 1.3, d = 0.9, h = 1.0 }: { x: number; y: number; w?: number; d?: number; h?: number }) {
  const rows = 3
  const cols = 2
  const drawers: ReactNode[] = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const a0 = x + 0.08 + (c * (w - 0.16)) / cols
      const a1 = x + 0.08 + ((c + 1) * (w - 0.16)) / cols - 0.06
      const b0 = 0.08 + (r * (h - 0.16)) / rows
      const b1 = 0.08 + ((r + 1) * (h - 0.16)) / rows - 0.06
      drawers.push(<Quad key={`d${r}${c}`} plane="y" at={y + d + 0.001} a0={a0} a1={a1} b0={b0} b1={b1} className={s.drawer} />)
      const [hx, hy] = iso((a0 + a1) / 2, y + d, (b0 + b1) / 2 + 0.03)
      drawers.push(<rect key={`h${r}${c}`} x={hx - 3} y={hy - 1} width={6} height={2} className={s.drawerHandle} />)
    }
  // ledger stripes on the side face
  const stripes: [V3, V3][] = []
  for (let k = 1; k <= 4; k++) stripes.push([[x + w, y + 0.1, (h * k) / 5], [x + w, y + d - 0.1, (h * k) / 5]])
  return (
    <g>
      <Box x={x} y={y} w={w} d={d} h={h} c="var(--steel-3)" />
      {drawers}
      <path d={segs(stripes)} className={s.ledger} />
      <Box x={x - 0.04} y={y - 0.04} z={h} w={w + 0.08} d={d + 0.08} h={0.07} c="var(--steel)" />
    </g>
  )
}

/** Diagonal hazard tape wrapped around the visible faces of a box (front-left +y face and front-right +x face). */
export function HazardBand({ x, y, w, d, z, h = 0.16 }: { x: number; y: number; w: number; d: number; z: number; h?: number }) {
  const step = 0.18
  const sk = 0.09
  const polys: ReactNode[] = []
  let k = 0
  for (let a = 0; a < w - 0.02; a += step / 2) {
    const a1 = Math.min(w, a + step / 2)
    const sk1 = Math.min(sk, w - a1)
    polys.push(
      <polygon
        key={`l${k}`}
        className={k % 2 ? s.tapeDark : s.tapeLight}
        points={pts([
          [x + a, y + d + 0.002, z],
          [x + a1, y + d + 0.002, z],
          [x + a1 + sk1, y + d + 0.002, z + h],
          [x + a + Math.min(sk, w - a), y + d + 0.002, z + h],
        ])}
      />,
    )
    k++
  }
  k = 0
  for (let b = 0; b < d - 0.02; b += step / 2) {
    const b1 = Math.min(d, b + step / 2)
    polys.push(
      <polygon
        key={`r${k}`}
        className={k % 2 ? s.tapeDark : s.tapeLight}
        points={pts([
          [x + w + 0.002, y + d - b, z],
          [x + w + 0.002, y + d - b1, z],
          [x + w + 0.002, y + d - Math.min(d, b1 + sk), z + h],
          [x + w + 0.002, y + d - Math.min(d, b + sk), z + h],
        ])}
      />,
    )
    k++
  }
  return <g>{polys}</g>
}
