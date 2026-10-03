/**
 * Kubernetes in the port, drawn as a full-bleed night spread. The control tower (control plane) keeps a board
 * of desired vs actual state for the Deployment klopa-api (wants 3 ready Pods). Two docks are the worker nodes;
 * a Pod's footprint is its CPU request (v1 = 1 CPU, short teal; v2 = 2 CPU, long orange).
 * Story of one loop: a new v2 Pod appears in the waiting bay (Pending), the scheduler picks the only node with
 * two free CPUs, the yard gantry carries it there (ContainerCreating), it turns Ready and the Service starts
 * sending it traffic; the board ticks from 2 to 3 ready. Meanwhile a v1 Pod on node 1 keeps crashing
 * (CrashLoopBackOff) and gets no traffic; the redis Pod has no app=klopa label and gets none either.
 */
import { memo, useRef, type ReactNode } from 'react'
import { iso, lerp, pts, span, vbOf, vbStr, type V3, type VB } from './iso-math'
import { Archive, Box, FaceText, Gantry, HazardBand, LampDot, PodBox, Quad, RotBeacon, Tower, type Lamp } from './iso'
import { Pin } from './yard'
import { COMPACT_QUERY, useLoopTime, useMediaQuery, usePrefersReducedMotion } from './useLoop'
import c from './cluster.module.css'
import is from './iso.module.css'

const NODE_H = 0.26
const POD = { len: 1.6, wid: 0.78, hei: 0.78 }
const LONG = 2 * POD.len + 0.4
const NODES = [
  { x0: 0, name: 'Čvor 1' },
  { x0: 5.4, name: 'Čvor 2' },
]
const NODE_Y0 = 0.3
const NODE_W = 4.4
const NODE_D = 3.0
const ROW_Y = [0.6, 1.8]
const COL_X = (n: number, col: number) => NODES[n].x0 + 0.4 + col * 2.0
const SLAB = {
  x0: -1.1,
  x1: 13.3,
  y0: -2.55,
  y1: 5.55,
  back: -0.35,
  notch: 4.75,
}

type PodKind = 'v1' | 'v2' | 'redis'
const KIND_C: Record<PodKind, string> = {
  v1: 'var(--teal)',
  v2: 'var(--orange)',
  redis: 'var(--blue)',
}

const PERIOD = 12
const CRASH_PERIOD = 4
/** the gantry spans all of node 2 and rolls along y between its waiting bay (behind the node) and row 1 */
const GANTRY = {
  x0: 5.22,
  x1: 9.98,
  depth: 1.25,
  h: 2.7,
  parkY: -1.75,
  workY: ROW_Y[1] + POD.wid / 2 - 1.25 / 2,
}
const NEW_X = COL_X(1, 0)
const NEW_Y = ROW_Y[1]
const PARK_POD_Y = GANTRY.parkY + GANTRY.depth / 2 - POD.wid / 2
const TOWER = { x: 11.7, y: -1.25, h: 4.3 }
const ARCHIVE = { x: 10.45, y: 0.1, w: 1.0, d: 0.8, h: 0.9 }
const SVC: V3 = [0.15, 4.65, 1.62]
/** CPU requests on each node before the new Pod lands: node 1 = 3 × v1, node 2 = redis */
const BASE_CPU = [3, 1]

function podTop(x: number, y: number, len = POD.len): V3 {
  return [x + len / 2, y + POD.wid / 2, NODE_H + POD.hei + 0.14]
}

/* ------------------------------------------------------------------ statics */

function slotOutline(x: number, y: number, len: number) {
  return pts([
    [x - 0.08, y - 0.08, NODE_H + 0.002],
    [x + len + 0.08, y - 0.08, NODE_H + 0.002],
    [x + len + 0.08, y + POD.wid + 0.08, NODE_H + 0.002],
    [x - 0.08, y + POD.wid + 0.08, NODE_H + 0.002],
  ])
}

const Ground = memo(function Ground({ compact }: { compact: boolean }) {
  const [ax, ay] = iso(ARCHIVE.x + 0.1, ARCHIVE.y + 0.4, 0.02)
  const [tx, ty] = iso(TOWER.x + 0.6, TOWER.y + 0.95, 0.02)
  const [mx, my] = iso(ARCHIVE.x + 0.1, TOWER.y + 0.95, 0.02)
  return (
    <g>
      {/* the quay: an L-shaped slab, cut back behind node 1 */}
      <Box x={SLAB.notch} y={SLAB.y0} z={-0.4} w={SLAB.x1 - SLAB.notch} d={SLAB.back - SLAB.y0 + 0.01} h={0.4} c="var(--concrete)" />
      <Box x={SLAB.x0} y={SLAB.back} z={-0.4} w={SLAB.x1 - SLAB.x0} d={SLAB.y1 - SLAB.back} h={0.4} c="var(--concrete)" />
      <Quad plane="z" at={0.002} a0={SLAB.x0} a1={SLAB.x1} b0={SLAB.y1 - 0.28} b1={SLAB.y1 - 0.08} c="var(--yellow)" />
      {/* gantry rails running from the waiting bay over node 2 */}
      <path
        className={c.rail}
        d={`M${iso(GANTRY.x0 + 0.08, GANTRY.parkY - 0.2, 0.002).join(' ')}L${iso(GANTRY.x0 + 0.08, 3.9, 0.002).join(' ')}M${iso(GANTRY.x1 - 0.08, GANTRY.parkY - 0.2, 0.002).join(' ')}L${iso(GANTRY.x1 - 0.08, 3.9, 0.002).join(' ')}`}
      />
      {/* waiting bay for Pods the scheduler has not placed yet: hatched */}
      <polygon
        className={c.park}
        points={pts([
          [GANTRY.x0, GANTRY.parkY, 0.003],
          [GANTRY.x1, GANTRY.parkY, 0.003],
          [GANTRY.x1, GANTRY.parkY + GANTRY.depth, 0.003],
          [GANTRY.x0, GANTRY.parkY + GANTRY.depth, 0.003],
        ])}
      />
      {NODES.map((n, i) => (
        <g key={i}>
          <Box x={n.x0} y={NODE_Y0} w={NODE_W} d={NODE_D} h={NODE_H} c="var(--dock)" />
          {i === 0
            ? [0, 1].map((row) =>
                [0, 1].map((col) => (
                  <polygon key={`${col}${row}`} className={c.slot} points={slotOutline(COL_X(0, col), ROW_Y[row], POD.len)} />
                )),
              )
            : [
                <polygon key="a" className={c.slot} points={slotOutline(COL_X(1, 0), ROW_Y[0], POD.len)} />,
                <polygon key="b" className={c.slot} points={slotOutline(COL_X(1, 1), ROW_Y[0], POD.len)} />,
              ]}
        </g>
      ))}
      {/* cable tray: archive (etcd) ↔ tower (API server) */}
      {!compact && <path className={c.cable} d={`M${ax} ${ay}L${mx} ${my}L${tx} ${ty}`} />}
      {/* the Service: a dispatch kiosk */}
      <Box x={-0.4} y={4.1} w={1.2} d={1.1} h={1.0} c="var(--cab)" />
      <Quad plane="x" at={0.8} a0={4.25} a1={5.05} b0={0.45} b1={0.8} className={is.glass} />
      <Box x={-0.46} y={4.04} z={1.0} w={1.32} d={1.22} h={0.1} c="var(--yellow)" />
      <Box x={0.1} y={4.6} z={1.1} w={0.1} d={0.1} h={0.42} c="var(--steel)" />
      <FaceText face="left" x={0.2} y={5.2} z={0.16} size={0.2} anchor="middle" fit={0.95} dark>
        SERVICE
      </FaceText>
    </g>
  )
})

const ControlPlane = memo(function ControlPlane() {
  return (
    <g>
      <Tower x={TOWER.x} y={TOWER.y} h={TOWER.h} sign="KONTROLA" />
      <Archive x={ARCHIVE.x} y={ARCHIVE.y} w={ARCHIVE.w} d={ARCHIVE.d} h={ARCHIVE.h} />
    </g>
  )
})

/* ------------------------------------------------------------------ pods */

function Pod({
  x,
  y,
  z,
  kind,
  lamp,
  blink,
  len = POD.len,
  label,
  ghost,
}: {
  x: number
  y: number
  z?: number
  kind: PodKind
  lamp: Lamp
  blink?: boolean
  len?: number
  label?: string
  ghost?: boolean
}) {
  return (
    <PodBox
      x={x}
      y={y}
      z={z ?? NODE_H}
      len={len}
      wid={POD.wid}
      hei={POD.hei}
      c={KIND_C[kind]}
      label={label ?? (kind === 'redis' ? 'redis' : kind)}
      lamp={lamp}
      blink={blink}
      ghost={ghost}
      tag={kind === 'redis' ? 'var(--steel-3)' : 'var(--yellow)'}
    />
  )
}

/** CrashLoopBackOff: hazard tape round the container, a red rotating beacon on the roof, the restart count stencilled on. */
function CrashPod({ x, y, t, restarts, shake, lamp }: { x: number; y: number; t: number; restarts: number; shake: number; lamp: Lamp }) {
  const z = NODE_H
  return (
    <g transform={shake ? `translate(${shake.toFixed(2)} 0)` : undefined}>
      <Pod x={x} y={y} kind="v1" lamp={null} label={`v1 ×${restarts}`} />
      <HazardBand x={x} y={y} w={POD.len} d={POD.wid} z={z + POD.hei - 0.2} h={0.14} />
      <RotBeacon x={x + POD.len / 2} y={y + POD.wid / 2} z={z + POD.hei + 0.06} angle={t * 6} r={0.13} tone="red" />
      <LampDot x={x + 0.3} y={y + POD.wid / 2} z={z + POD.hei + 0.05} state={lamp} r={0.09} blink={lamp === 'err'} />
    </g>
  )
}

function Arc({ from, to, t }: { from: [number, number]; to: V3; t: number }) {
  const [tx, ty] = iso(...to)
  const [fx, fy] = from
  const mx = (fx + tx) / 2
  const my = Math.min(fy, ty) - 46
  return <path className={c.arc} d={`M${fx} ${fy} Q${mx} ${my} ${tx} ${ty - 2}`} style={{ strokeDashoffset: (-t * 24).toFixed(1) }} />
}

/* --------------------------------------------------------------- badges */

interface Badge {
  n: number
  at: V3
  dx: number
  dy: number
  tone?: 'err' | 'warn' | 'ok'
}

function Leaders({ badges }: { badges: { at: V3; dx: number; dy: number }[] }) {
  return (
    <g>
      {badges.map((b, k) => {
        const [x, y] = iso(...b.at)
        return (
          <g key={k}>
            <line className={c.leader} x1={x} y1={y} x2={x + b.dx} y2={y + b.dy} />
            <circle className={c.dot} cx={x} cy={y} r={2.2} />
          </g>
        )
      })}
    </g>
  )
}

/** node name plates hang in free apron space, each on a leader line from its node's front face */
const NODE_TAG: { at: V3; dx: number; dy: number }[] = [
  { at: [0.3, NODE_Y0 + 0.2, NODE_H], dx: -30, dy: -40 },
  { at: [8.2, NODE_Y0 + NODE_D, 0.1], dx: 8, dy: 30 },
]

/* ------------------------------------------------------------- viewBox */

const BODY: V3[] = [
  [SLAB.x0, SLAB.y1, -0.4],
  [SLAB.x1, SLAB.y1, -0.4],
  [SLAB.x0, SLAB.back, 0],
  [SLAB.x1, SLAB.y0, 0],
  [GANTRY.x0, GANTRY.parkY, GANTRY.h + 0.55],
  [-0.4, 4.1, 2.2],
]
const VB_WIDE: VB = vbOf([...BODY, [TOWER.x, TOWER.y, TOWER.h + 1.0]], 8, 14)
/** phone: crop to the nodes and the Service; the tower and its board move to an inset above */
const VB_COMPACT: VB = vbOf(
  [
    [SLAB.x0, SLAB.y1, -0.4],
    [-1.1, 4.0, 1.4],
    [10.2, -2.0, 0],
    [10.2, SLAB.y1, -0.4],
    [GANTRY.x0, GANTRY.parkY, GANTRY.h + 0.9],
  ],
  4,
)
const VB_INSET: VB = vbOf(
  [
    [TOWER.x - 0.2, TOWER.y - 0.2, TOWER.h + 1.0],
    [ARCHIVE.x - 0.1, ARCHIVE.y + ARCHIVE.d, 0],
    [TOWER.x + 1.3, TOWER.y + 1.3, 0],
    [TOWER.x + 1.3, TOWER.y - 0.2, 0],
  ],
  6,
)

/** the tower's board: what the Deployment wants and what is really running */
function StateBoard({ ready, pending }: { ready: number; pending: number }) {
  return (
    <div className={c.board} aria-label={`klopa-api: želi 3, spremno ${ready}, čeka ${pending}`}>
      <div className={c.boardHead}>
        <small>Deployment</small>
        <span>klopa-api</span>
      </div>
      <div className={c.boardRow}>
        <span>želi</span>
        <b>3</b>
      </div>
      <div className={c.boardRow} data-tone={ready === 3 ? 'ok' : 'warn'}>
        <span>spremno</span>
        <b key={ready}>{ready}</b>
      </div>
      <div className={c.boardRow} data-tone={pending ? 'warn' : undefined}>
        <span>čeka</span>
        <b key={`p${pending}`}>{pending}</b>
      </div>
    </div>
  )
}

export function ClusterView() {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = usePrefersReducedMotion()
  const compact = useMediaQuery(COMPACT_QUERY)
  const t = useLoopTime(ref, !reduce, 0.9, compact)
  const loop = ((t % PERIOD) + PERIOD) % PERIOD

  /* ---- new v2 Pod: Pending in the bay → scheduler binds it to node 2 → the gantry carries it over and sets it down ---- */
  const appear = span(loop, 0, 0.5) * (1 - span(loop, 11.3, 12))
  const bound = loop >= 1.5 && loop < 11.6
  const sched = span(loop, 0.3, 1.5)
  const rollIn = span(loop, 2.7, 4.2)
  const rollOut = span(loop, 5.6, 7.1)
  const gy = lerp(GANTRY.parkY, GANTRY.workY, rollIn) + (GANTRY.parkY - GANTRY.workY) * rollOut
  const top = GANTRY.h - 0.15
  const lifted = 1.55
  let podZ = 0
  let hook = top
  if (loop < 1.5) {
    // waiting in the bay, hook up
  } else if (loop < 2.1) hook = lerp(top, POD.hei + 0.12, span(loop, 1.5, 2.1))
  else if (loop < 2.7) {
    podZ = lerp(0, lifted, span(loop, 2.1, 2.7))
    hook = podZ + POD.hei + 0.12
  } else if (loop < 4.2) {
    podZ = lifted
    hook = podZ + POD.hei + 0.12
  } else if (loop < 5.0) {
    podZ = lerp(lifted, NODE_H, span(loop, 4.2, 5.0))
    hook = podZ + POD.hei + 0.12
  } else {
    podZ = NODE_H
    hook = lerp(NODE_H + POD.hei + 0.12, top, span(loop, 5.0, 5.6))
  }
  const placed = loop >= 5.0
  const podY = loop < 2.7 ? PARK_POD_Y : loop < 4.2 ? lerp(PARK_POD_Y, NEW_Y, rollIn) : NEW_Y
  const creating = placed && loop < 7.0
  const ready = loop >= 7.0 && loop < 11.6
  const newLamp: Lamp = ready ? 'ok' : 'warn'
  const newState = ready ? 'Running · Ready' : creating ? 'ContainerCreating' : bound ? 'dodijeljen čvoru 2' : 'Pending · čeka raspored'
  const pendingCount = appear > 0.5 && !ready && loop < 11.3 ? 1 : 0
  const readyCount = ready ? 3 : 2

  /* ---- CrashLoopBackOff on node 1: start (yellow) → crash (red, shake) → back-off ---- */
  const cl = ((t % CRASH_PERIOD) + CRASH_PERIOD) % CRASH_PERIOD
  const restarts = 6 + Math.floor(t / CRASH_PERIOD)
  const cLamp: Lamp = cl < 0.7 ? 'warn' : 'err'
  const cShake = cl > 0.7 && cl < 1.1 ? Math.sin(cl * 90) * 2.2 : 0

  const [sx, sy] = iso(...SVC)
  const [tx, ty] = iso(TOWER.x + 0.6, TOWER.y + 0.6, TOWER.h)
  const [nx, ny] = iso(NEW_X + LONG / 2, NEW_Y + POD.wid / 2, 2.2)
  const pulse = { x: lerp(tx, nx, sched), y: lerp(ty, ny, sched) }
  const used = [BASE_CPU[0], BASE_CPU[1] + (bound ? 2 : 0)]

  const targets: V3[] = [podTop(COL_X(0, 0), ROW_Y[0]), podTop(COL_X(0, 1), ROW_Y[0])]
  if (ready) targets.push(podTop(NEW_X, NEW_Y, LONG))

  const newPod = (
    <g opacity={appear}>
      <Pod x={NEW_X} y={podY} z={podZ} kind="v2" len={LONG} lamp={newLamp} blink={!ready} label="v2 · 2 CPU" />
    </g>
  )
  const gantryIn = gy > NODE_Y0 + 0.2
  const node2Row0 = <Pod x={COL_X(1, 0)} y={ROW_Y[0]} kind="redis" lamp="ok" />
  const gantry = (
    <Gantry
      x0={GANTRY.x0}
      x1={GANTRY.x1}
      y0={gy}
      y1={gy + GANTRY.depth}
      h={GANTRY.h}
      tx={NEW_X + LONG / 2}
      hookZ={hook}
      load={!placed || gantryIn ? newPod : null}
    />
  )

  const vb = compact ? VB_COMPACT : VB_WIDE
  const badges: Badge[] = [
    {
      n: 2,
      at: [COL_X(0, 0) + 0.3, ROW_Y[1] + POD.wid, NODE_H + 0.5],
      dx: -38,
      dy: 26,
      tone: 'err',
    },
    { n: 3, at: [GANTRY.x0, GANTRY.parkY, 0.05], dx: -34, dy: -22, tone: 'warn' },
    {
      n: 4,
      at: [NEW_X + LONG, NEW_Y + POD.wid / 2, NODE_H + 0.3],
      dx: 40,
      dy: 10,
      tone: ready ? 'ok' : 'warn',
    },
    { n: 5, at: [-0.4, 5.2, 0.6], dx: compact ? 6 : -22, dy: compact ? 40 : 24 },
  ]
  if (!compact)
    badges.unshift({
      n: 1,
      at: [TOWER.x + 1.2, TOWER.y + 1.2, TOWER.h - 0.6],
      dx: 26,
      dy: 4,
    })
  const boardAt: [number, number] = [tx - 8, ty - 30]

  const svgBody: ReactNode = (
    <>
      <Ground compact={compact} />
      {NODES.map((n, i) => (
        <g key={i}>
          {[0, 1, 2, 3].map((k) => (
            <Quad
              key={k}
              plane="z"
              at={NODE_H + 0.001}
              a0={n.x0 + 0.4 + k * 0.42}
              a1={n.x0 + 0.4 + k * 0.42 + 0.32}
              b0={NODE_Y0 + NODE_D - 0.36}
              b1={NODE_Y0 + NODE_D - 0.14}
              c={k < used[i] ? 'var(--orange)' : 'var(--steel-2)'}
            />
          ))}
        </g>
      ))}
      {/* where the scheduler is putting the new Pod: lit slot on node 2 */}
      {bound && !ready && <polygon className={c.target} points={slotOutline(NEW_X, NEW_Y, LONG)} />}
      {/* node 1: two v1 Pods that serve, one that keeps crashing */}
      <Pod x={COL_X(0, 0)} y={ROW_Y[0]} kind="v1" lamp="ok" />
      <Pod x={COL_X(0, 1)} y={ROW_Y[0]} kind="v1" lamp="ok" />
      <CrashPod x={COL_X(0, 0)} y={ROW_Y[1]} t={reduce ? 0.4 : t} restarts={restarts} shake={cShake} lamp={cLamp} />
      {/* node 2 + gantry, in depth order */}
      {gantryIn && node2Row0}
      {gantry}
      {!gantryIn && node2Row0}
      {placed && !gantryIn && newPod}
      {/* the tower and the archive stand in front of the gantry's waiting bay */}
      {!compact && <ControlPlane />}
      {/* scheduler decision: a pulse from the tower to the chosen place */}
      {loop > 0.3 && loop < 1.5 && (
        <g>
          <line x1={compact ? vb.x + vb.w : tx} y1={compact ? vb.y + 20 : ty} x2={nx} y2={ny} className={c.cmd} />
          <circle
            cx={compact ? lerp(vb.x + vb.w, nx, sched) : pulse.x}
            cy={compact ? lerp(vb.y + 20, ny, sched) : pulse.y}
            r={3.6}
            className={c.pulse}
          />
        </g>
      )}
      {/* Service traffic: only to Ready Pods with the label */}
      {targets.map((p, i) => (
        <Arc key={i} from={[sx, sy]} to={p} t={t} />
      ))}
      <LampDot x={SVC[0]} y={SVC[1]} z={SVC[2]} state="ok" r={0.14} />
      <Leaders badges={[...badges, ...NODE_TAG]} />
      {!compact && <line className={c.leader} x1={tx} y1={ty - 4} x2={boardAt[0]} y2={boardAt[1] + 4} />}
    </>
  )

  const notes = [
    {
      title: 'Kontrolni toranj · control plane',
      text: 'API server i scheduler u tornju, stanje klastera u arhivi etcd. Ploča na tornju uspoređuje željeno (3) i stvarno stanje.',
    },
    {
      title: `CrashLoopBackOff · ×${restarts}`,
      text: 'Kontejner pada čim se pokrene. Kubernetes ga pokreće ponovno, sa sve duljom stankom između pokušaja.',
      tone: 'err',
    },
    {
      title: 'Pending',
      text: 'Novi Pod v2 traži 2 CPU-a i čeka u čekaonici. Scheduler bira čvor po slobodnom CPU-u: samo čvor 2 ima dva slobodna.',
      tone: 'warn',
    },
    {
      title: `Pod v2 · ${newState}`,
      text: 'Dizalica ga spušta na čvor 2. Promet dobiva tek kad postane Ready, a ploča tada pokaže 3 od 3.',
      tone: ready ? 'ok' : 'warn',
    },
    {
      title: 'Service klopa-api',
      text: (
        <>
          Bira Podove po oznaci <code>app=klopa</code> i šalje promet samo spremnima (zelene točkaste linije). Pod <code>redis</code> nema
          tu oznaku.
        </>
      ),
    },
  ]

  return (
    <div ref={ref}>
      <div className={c.wide}>
        {compact && (
          <div className={c.inset}>
            <svg viewBox={vbStr(VB_INSET)} aria-hidden="true">
              <ControlPlane />
              {loop > 0.3 && loop < 1.5 && <circle cx={tx} cy={ty} r={6} className={c.pulse} />}
            </svg>
            <StateBoard ready={readyCount} pending={pendingCount} />
          </div>
        )}
        <div className={c.stage} style={{ aspectRatio: `${vb.w} / ${vb.h}` }}>
          <svg
            className={c.svg}
            viewBox={vbStr(vb)}
            role="img"
            aria-label="Klaster: kontrolni toranj raspoređuje Podove na dva čvora. Service šalje promet samo Podovima s oznakom app=klopa koji su spremni; Pod u stanju CrashLoopBackOff i Pod u stanju Pending ne dobivaju promet."
          >
            {svgBody}
          </svg>
          {!compact && (
            <Pin vb={vb} xy={boardAt} className={c.boardPin}>
              <StateBoard ready={readyCount} pending={pendingCount} />
            </Pin>
          )}
          {NODES.map((n, i) => {
            const [x, y] = iso(...NODE_TAG[i].at)
            return (
              <Pin key={n.name} vb={vb} xy={[x + NODE_TAG[i].dx, y + NODE_TAG[i].dy]} className={c.plinth}>
                <b>{n.name}</b>
                <span>
                  CPU {used[i]}/4 · {used[i] * 2}/8 GB
                </span>
              </Pin>
            )
          })}
          {badges.map((b) => {
            const [x, y] = iso(...b.at)
            return (
              <Pin key={b.n} vb={vb} xy={[x + b.dx, y + b.dy]} className={c.badge}>
                <span data-tone={b.tone}>{b.n}</span>
              </Pin>
            )
          })}
        </div>
      </div>
      <div className={c.wrap}>
        <ol className={c.notes}>
          {notes.map((n, k) => (
            <li key={k} data-tone={n.tone}>
              <b>{n.title}</b>
              {n.text}
            </li>
          ))}
        </ol>
        <ul className={c.legend} aria-label="Legenda">
          <li>
            <i className={c.swTeal} /> v1 · 1 CPU
          </li>
          <li>
            <i className={c.swOrange} /> v2 · 2 CPU (dulji kontejner)
          </li>
          <li>
            <i className={c.swBlue} /> drugi Pod (app=redis)
          </li>
          <li>
            <b className={c.lampOk} /> Running
          </li>
          <li>
            <b className={c.lampWarn} /> Pending · ContainerCreating
          </li>
          <li>
            <b className={c.lampErr} /> CrashLoopBackOff
          </li>
          <li>
            <i className={c.swTag} /> oznaka app=klopa
          </li>
          <li>
            <em className={c.swArc} /> promet Servicea
          </li>
          <li>
            <i className={c.swCpu} /> zauzeti CPU na čvoru
          </li>
        </ul>
      </div>
    </div>
  )
}
