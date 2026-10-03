/**
 * The terminal yard: one drawing shared by the load-balancer simulation and the step-through.
 * Main road → gate (load balancer) → box junction → three equal lanes → three docks (servers).
 * A dock: yellow portal cranes = cores (CPU), dashed yard slots = RAM, beacon post = health check.
 */
import { memo, type CSSProperties, type ReactNode } from 'react'
import { iso, pts, segs, type V2, type V3, type VB } from './iso-math'
import { Barrier, Box, Container, FaceText, LampDot, Person, Quad, Road, RotBeacon, SignBoard, type Lamp } from './iso'
import { DOCK_H, DOCKS, GATE_X, LANE, PITCH, ROAD_W, toWorld, type CrateView, type DockGeo, type Status } from './sim-model'
import { beaconAt, CARGO, CRATE, GP, PLAZA, PORTAL_H, SIG_H, YARD_POOLS, type DockState } from './yard-geo'
import s from './sim.module.css'
import is from './iso.module.css'

/* -------------------------------------------------------------- ground */

function lineD(a: V3, b: V3) {
  const [x1, y1] = iso(...a)
  const [x2, y2] = iso(...b)
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}`
}

/** painted arrow on a lane: start point, unit direction */
function ArrowPaint({ at, dir }: { at: V2; dir: V2 }) {
  const [x, y] = at
  const [dx, dy] = dir
  const nx = -dy
  const ny = dx
  const p = (a: number, b: number): V3 => [x + dx * a + nx * b, y + dy * a + ny * b, 0.002]
  return <polygon className={s.arrowPaint} points={pts([p(0, -0.04), p(0.32, -0.04), p(0.32, -0.12), p(0.5, 0), p(0.32, 0.12), p(0.32, 0.04), p(0, 0.04)])} />
}

/** concrete apron that runs past every edge of the frame, with expansion joints every two metres */
const APRON = { x0: -18, x1: 12, y0: -10, y1: 13 }
export const YardApron = memo(function YardApron() {
  const joints: [V3, V3][] = []
  for (let x = APRON.x0 + 2; x < APRON.x1; x += 2) joints.push([[x, APRON.y0, 0], [x, APRON.y1, 0]])
  for (let y = APRON.y0 + 2; y < APRON.y1; y += 2) joints.push([[APRON.x0, y, 0], [APRON.x1, y, 0]])
  return (
    <g>
      <polygon
        className={s.apron}
        points={pts([
          [APRON.x0, APRON.y0, -0.01],
          [APRON.x1, APRON.y0, -0.01],
          [APRON.x1, APRON.y1, -0.01],
          [APRON.x0, APRON.y1, -0.01],
        ])}
      />
      <path className={s.joint} d={segs(joints)} />
    </g>
  )
})

export const YardGround = memo(function YardGround({ plaza = true }: { plaza?: boolean }) {
  const H = ROAD_W / 2
  const j: V3[] = [
    [-H, -H, 0],
    [H, -H, 0],
    [H, H, 0],
    [-H, H, 0],
  ]
  return (
    <g>
      {plaza && <Box x={PLAZA.x0} y={PLAZA.y0} z={-0.06} w={PLAZA.x1 - PLAZA.x0} d={PLAZA.y1 - PLAZA.y0} h={0.06} c="var(--concrete-dark)" />}
      {/* gate apron in front of the gate */}
      <Quad plane="z" at={0.001} a0={GATE_X - 1.3} a1={GATE_X + 0.55} b0={-1.0} b1={1.0} c="var(--asphalt)" />
      <Road x0={plaza ? PLAZA.x1 : -14} y0={0} x1={-H} y1={0} w={ROAD_W} />
      {DOCKS.map((g, i) => {
        const [ax, ay] = toWorld(g, 0, -0.02)
        return i === 1 ? (
          <Road key={i} x0={H} y0={0} x1={ax} y1={0} w={ROAD_W} />
        ) : (
          <Road key={i} x0={0} y0={i === 0 ? -H : H} x1={0} y1={ay} w={ROAD_W} />
        )
      })}
      {/* box junction: keep clear */}
      <polygon className={is.road} points={pts(j)} />
      <path className={s.boxJunction} d={segs([[j[0], j[1]], [j[1], j[2]], [j[2], j[3]], [j[3], j[0]], [j[0], j[2]], [j[1], j[3]]])} />
      {/* stop line at the gate and lane arrows */}
      <path className={s.stopLine} d={lineD([GATE_X - 0.18, 0.02, 0], [GATE_X - 0.18, H - 0.04, 0])} />
      <ArrowPaint at={[GATE_X - 1.1, LANE]} dir={[1, 0]} />
      <ArrowPaint at={[GATE_X - 0.6, -LANE]} dir={[-1, 0]} />
      {DOCKS.map((g, i) => {
        const a = toWorld(g, g.uIn, -1.5)
        return <ArrowPaint key={i} at={a} dir={g.V} />
      })}
    </g>
  )
})

/** sodium pools on the ground from floodlight masts outside the frame (transparent on the day shift) */
export function YardPools({ fades }: { fades?: number[] }) {
  return (
    <g>
      {YARD_POOLS.map((p, k) => {
        const ring: V3[] = []
        for (let a = 0; a < 20; a++) ring.push([p.x + Math.cos((a / 20) * Math.PI * 2) * p.r, p.y + Math.sin((a / 20) * Math.PI * 2) * p.r, 0.005])
        const f = fades?.[k] ?? 1
        return <polygon key={k} className={is.pool} points={pts(ring)} style={f < 1 ? { opacity: `calc(var(--pool-op) * ${f})` } : undefined} />
      })}
    </g>
  )
}

/* ---------------------------------------------------------- the canteen */

const STUDENTS: [number, number, string][] = [
  [-9.6, -1.3, 'var(--teal)'],
  [-8.85, -1.45, 'var(--orange)'],
  [-9.3, -0.5, 'var(--blue)'],
  [-8.3, -0.65, 'var(--rust)'],
  [-9.7, 0.4, 'var(--mustard)'],
  [-8.7, 0.5, 'var(--teal)'],
  [-9.25, 1.25, 'var(--orange)'],
  [-8.15, 1.15, 'var(--blue)'],
]

/** the canteen Klopa (its corner bleeds out of the frame) with its students on the plaza in front */
export const Plaza = memo(function Plaza() {
  const bx = PLAZA.x0 - 3.2
  return (
    <g>
      <Box x={bx} y={-5.2} w={3.0} d={5.4} h={1.5} c="var(--cab)" />
      <Quad plane="x" at={bx + 3.0} a0={-4.6} a1={-1.4} b0={0.6} b1={1.05} className={is.window} />
      <Quad plane="x" at={bx + 3.0} a0={-1.0} a1={-0.2} b0={0.02} b1={1.0} className={is.glass} />
      <Box x={bx - 0.1} y={-5.3} z={1.5} w={3.2} d={5.6} h={0.1} c="var(--steel)" />
      <Box x={bx + 3.0} y={-4.4} z={1.6} w={0.12} d={2.6} h={0.62} c="var(--orange)" />
      <FaceText face="right" x={bx + 3.12} y={-3.1} z={1.72} size={0.42} anchor="middle" fit={2.2}>
        KLOPA
      </FaceText>
      {STUDENTS.map(([x, y, c], i) => (
        <Person key={i} x={x} y={y} c={c} />
      ))}
    </g>
  )
})

/* ---------------------------------------------------------------- gate */

export function GatePost({ side }: { side: 'back' | 'front' }) {
  return <Box x={GP.x} y={side === 'back' ? GP.y0 : GP.y1} w={GP.t} d={GP.t} h={GP.h} c="var(--yellow)" />
}

export const GateBeam = memo(function GateBeam() {
  const len = GP.y1 + GP.t - GP.y0
  return (
    <g>
      <Box x={GP.x} y={GP.y0} z={GP.h} w={GP.t} d={len} h={0.42} c="var(--yellow)" />
      <FaceText face="right" x={GP.x + GP.t} y={GP.y0 + len / 2} z={GP.h + 0.09} size={0.25} anchor="middle" fit={len * 0.84} dark>
        LOAD BALANCER
      </FaceText>
    </g>
  )
})

/* ---------------------------------------------------------- lane signal */

/**
 * Lane signal: post + lamp, and a striped boom across the lane. `up` = 1 (open) … 0 (closed: the server is out of
 * rotation). `flash` lights the lamp when the gate has just sent a request down this lane.
 */
export function LaneSignal({ i, lamp, up, flash }: { i: number; lamp: Lamp; up: number; flash: boolean }) {
  const g = DOCKS[i]
  const [px, py] = g.signal
  const [tx, ty] = g.boomTo
  const len = Math.hypot(tx - px, ty - py)
  const dx = (tx - px) / len
  const dy = (ty - py) / len
  const th = (up * Math.PI) / 2.15
  const zp = 0.42
  const pivot: V3 = [px + 0.05, py + 0.05, zp]
  const end: V3 = [pivot[0] + dx * len * Math.cos(th), pivot[1] + dy * len * Math.cos(th), zp + len * Math.sin(th) * 0.8]
  const [ax, ay] = iso(...pivot)
  const [bx, by] = iso(...end)
  const head = iso(px + 0.05, py + 0.05, SIG_H + 0.2)
  return (
    <g>
      <Box x={px} y={py} w={0.1} d={0.1} h={SIG_H} c="var(--steel)" />
      <Box x={px - 0.05} y={py - 0.05} z={SIG_H} w={0.2} d={0.2} h={0.36} c="var(--navy-2)" />
      <LampDot x={px + 0.05} y={py + 0.05} z={SIG_H + 0.2} state={lamp} r={flash ? 0.15 : 0.12} />
      {flash && <circle className={s.flashRing} cx={head[0]} cy={head[1]} r={9} />}
      <line className={s.boomBase} x1={ax} y1={ay} x2={bx} y2={by} />
      <line className={s.boomStripe} x1={ax} y1={ay} x2={bx} y2={by} />
    </g>
  )
}

/* ----------------------------------------------------------------- dock */

function crateBox(g: DockGeo, u: number, v: number, status: Status, key: number | string) {
  const [wx, wy] = toWorld(g, u, v)
  const alongX = g.V[0] !== 0
  return (
    <Container
      key={key}
      x={wx - (alongX ? CRATE.len : CRATE.wid) / 2}
      y={wy - (alongX ? CRATE.wid : CRATE.len) / 2}
      z={DOCK_H}
      axis={alongX ? 'x' : 'y'}
      len={CRATE.len}
      wid={CRATE.wid}
      hei={CRATE.hei}
      c={CARGO[status]}
    />
  )
}

function slotQuad(g: DockGeo, u: number, v: number, half: number): string {
  const c = (a: number, b: number): V3 => {
    const [x, y] = toWorld(g, u + a, v + b)
    return [x, y, DOCK_H + 0.002]
  }
  return pts([c(-half, -half), c(half, -half), c(half, half), c(-half, half)])
}

function Bay({ g, b, crate, prog, down }: { g: DockGeo; b: number; crate: ReactNode; prog: number; down: boolean }) {
  const [bu, bv] = g.bays[b]
  const off = PITCH / 2 - 0.08
  const legs = [toWorld(g, bu - off, bv), toWorld(g, bu + off, bv)].sort((p, q) => p[0] + p[1] - (q[0] + q[1]))
  const alongX = g.U[0] !== 0
  const t = 0.08
  const leg = ([x, y]: V2, k: string) => <Box key={k} x={x - t / 2} y={y - t / 2} z={DOCK_H} w={t} d={t} h={PORTAL_H} c="var(--yellow)" />
  const zb = DOCK_H + PORTAL_H
  const [lo, hi] = legs
  const beam = alongX ? (
    <Box x={lo[0] - t / 2} y={lo[1] - 0.06} z={zb} w={hi[0] - lo[0] + t} d={0.12} h={0.12} c="var(--yellow)" />
  ) : (
    <Box x={lo[0] - 0.06} y={lo[1] - t / 2} z={zb} w={0.12} d={hi[1] - lo[1] + t} h={0.12} c="var(--yellow)" />
  )
  const [cx, cy] = toWorld(g, bu, bv)
  const busy = prog >= 0
  const [tx, ty] = iso(cx, cy, zb)
  const [hx, hy] = iso(cx, cy, DOCK_H + CRATE.hei + 0.04)
  const bar = iso(cx, cy, zb + 0.42)
  return (
    <g>
      {leg(lo, 'a')}
      {crate}
      {busy && <line className={s.cable} x1={tx} y1={ty} x2={hx} y2={hy} />}
      {leg(hi, 'b')}
      {beam}
      <LampDot x={cx} y={cy} z={zb + 0.16} state={down ? 'off' : busy ? 'warn' : 'off'} r={0.08} />
      {busy && (
        <g className={s.progBar}>
          <rect x={bar[0] - 10} y={bar[1] - 2.5} width={20} height={5} />
          <rect className={s.progFill} x={bar[0] - 10} y={bar[1] - 2.5} width={20 * Math.min(1, prog)} height={5} />
        </g>
      )}
    </g>
  )
}

export function DockView({ i, st, crates, t, fade }: { i: number; st: DockState; crates: CrateView[]; t: number; fade?: number }) {
  const g = DOCKS[i]
  const down = !st.up
  const half = PITCH / 2 - 0.06
  // crates sitting under a crane are drawn between the crane's legs; everything else is depth-sorted with the cranes
  const inBay = new Map<number, CrateView>()
  const loose: CrateView[] = []
  for (const c of crates) {
    if (!c.inBay) {
      loose.push(c)
      continue
    }
    let best = 0
    let bd = Infinity
    g.bays.forEach(([u, v], b) => {
      const dd = Math.hypot(u - c.u, v - c.v)
      if (dd < bd) {
        bd = dd
        best = b
      }
    })
    inBay.set(best, c)
  }
  const items: { depth: number; node: ReactNode }[] = []
  g.bays.forEach(([u, v], b) => {
    const [wx, wy] = toWorld(g, u, v)
    const c = inBay.get(b)
    items.push({
      depth: wx + wy,
      node: <Bay key={`bay${b}`} g={g} b={b} down={down} prog={st.progress[b] ?? -1} crate={c ? crateBox(g, c.u, c.v, c.status, c.id) : null} />,
    })
  })
  for (const c of loose) {
    const [wx, wy] = toWorld(g, c.u, c.v)
    items.push({ depth: wx + wy, node: crateBox(g, c.u, c.v, c.status, c.id) })
  }
  items.sort((a, b) => a.depth - b.depth)
  // a yard slot is "taken" while a waiting container stands on it
  const taken = g.yard.map(([u, v]) => loose.some((c) => c.status === 'req' && Math.abs(c.u - u) < 0.12 && Math.abs(c.v - v) < 0.12))

  const [bx, by, bz] = beaconAt(i)
  const ringT = st.sinceCheck / 0.45
  const [rx, ry] = iso(bx, by, bz)
  // crash gear: sawhorses across the lane end, PAD board on the dock
  const [sx0, sy0] = toWorld(g, -0.6, -0.24)
  const [sx1, sy1] = toWorld(g, 0.6, -0.24)
  const alongX = g.U[0] !== 0
  const [px, py] = toWorld(g, -g.w / 2 + 0.25, 0.32)
  const [qx, qy] = toWorld(g, -g.w / 2 + 1.55, 0.32)
  const rejFlash = st.sinceReject < 0.35
  const full = !down && !!st.full
  return (
    <g opacity={fade} className={s.dockG}>
      <Box x={g.x0} y={g.y0} w={g.x1 - g.x0} d={g.y1 - g.y0} h={DOCK_H} c={down ? 'var(--dock-down)' : 'var(--dock)'} />
      {/* quay edge paint at the entry */}
      <polygon
        className={down ? s.edgeDown : full ? s.edgeFull : s.edgePaint}
        points={(() => {
          const c = (u: number, v: number): V3 => {
            const [x, y] = toWorld(g, u, v)
            return [x, y, DOCK_H + 0.003]
          }
          return pts([c(-g.w / 2 + 0.05, 0.04), c(g.w / 2 - 0.05, 0.04), c(g.w / 2 - 0.05, 0.13), c(-g.w / 2 + 0.05, 0.13)])
        })()}
      />
      {g.bays.map(([u, v], b) => (
        <polygon key={`m${b}`} className={s.bayMark} points={slotQuad(g, u, v, half)} />
      ))}
      {g.yard.map(([u, v], k) => (
        <polygon key={`y${k}`} className={taken[k] ? s.yardTaken : s.yardMark} points={slotQuad(g, u, v, half)} />
      ))}
      {rejFlash && <polygon className={s.rejFlash} points={slotQuad(g, g.uIn, 0.3, 0.32)} />}
      {items.map((it) => it.node)}
      {/* health post: green lamp; amber rotating beacon while the yard is full; red when the server is down */}
      <Box x={bx - 0.05} y={by - 0.05} z={DOCK_H} w={0.1} d={0.1} h={bz - DOCK_H - 0.08} c="var(--steel)" />
      {full ? (
        <RotBeacon x={bx} y={by} z={bz - 0.02} angle={t * 4.5} r={0.15} />
      ) : (
        <LampDot x={bx} y={by} z={bz} state={down ? 'err' : st.healthy ? 'ok' : 'warn'} r={0.12} blink={down} />
      )}
      {ringT < 1 && <circle className={s.ring} cx={rx} cy={ry} r={5 + ringT * 18} stroke={st.lastCheckOk ? 'var(--sig-green)' : 'var(--sig-red)'} opacity={1 - ringT} />}
      {down && (
        <g>
          <SignBoard
            x={alongX ? Math.min(px, qx) : px - 0.035}
            y={alongX ? py - 0.035 : Math.min(py, qy)}
            len={1.3}
            axis={alongX ? 'x' : 'y'}
            z={DOCK_H}
            postH={0.42}
            plateH={0.58}
            text="PAD"
            size={0.44}
          />
          <RotBeacon x={(px + qx) / 2 + (alongX ? 0 : 0.035)} y={(py + qy) / 2 + (alongX ? 0.035 : 0)} z={DOCK_H + 0.42 + 0.58 + 0.04} angle={t * 5.5} r={0.15} tone="red" />
          <Barrier x={Math.min(sx0, sx1)} y={Math.min(sy0, sy1)} len={1.2} axis={alongX ? 'x' : 'y'} h={0.36} />
        </g>
      )}
    </g>
  )
}

/* -------------------------------------------------------- HTML overlay */

/** Absolutely positioned HTML label pinned to a world point of a diorama. */
export function Pin({ vb, at, xy, className, style, children }: { vb: VB; at?: V3; xy?: [number, number]; className?: string; style?: CSSProperties; children: ReactNode }) {
  const [sx, sy] = xy ?? iso(...(at ?? [0, 0, 0]))
  return (
    <div
      className={className}
      style={{ left: `${(((sx - vb.x) / vb.w) * 100).toFixed(3)}%`, top: `${(((sy - vb.y) / vb.h) * 100).toFixed(3)}%`, ...style }}
    >
      {children}
    </div>
  )
}

/* ------------------------------------------------------ dispatch board */

export interface BoardRow {
  name: string
  conns: number | null
  flash?: boolean
  next?: boolean
}

/** The gate's variable-message sign: the algorithm and the open connections it sees for each lane. */
export function DispatchBoard({ algo, rows, scan }: { algo: string; rows: BoardRow[]; scan?: boolean }) {
  return (
    <div className={s.vms} data-scan={scan ? '1' : undefined}>
      <div className={s.vmsHead}>
        <small>Rampa</small>
        <span>{algo}</span>
      </div>
      <div className={s.vmsCols} aria-hidden="true">
        <span />
        <span>dok</span>
        <span>veze</span>
      </div>
      {rows.map((r) => (
        <div key={r.name} className={s.vmsRow} data-flash={r.flash ? '1' : undefined} data-out={r.conns === null ? '1' : undefined}>
          <i aria-hidden="true">{r.next ? '▸' : ''}</i>
          <span>{r.name}</span>
          <b>{r.conns === null ? 'van' : r.conns}</b>
        </div>
      ))}
    </div>
  )
}
