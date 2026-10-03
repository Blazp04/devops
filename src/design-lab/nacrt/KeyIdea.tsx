/**
 * Key idea as two section views of the same server:
 *   A–A  cores are an orifice: one opening per vCPU, one request per opening every 200 ms → throughput;
 *   B–B  RAM is a vessel: 256 MB per request in flight; a bigger vessel holds more, the outflow stays the same.
 * Numbers are the simulation's own (Mali 1 vCPU · 2 GB, Srednji 2 · 4, Veliki 4 · 8).
 * Each view is a small rAF model with state in refs, drawn 1 unit = 1 px at its real width.
 */
import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import { useReducedMotion } from 'motion/react'
import { Defs, Dim } from './Draw'
import { hr, pointAt, route, safeId, type Pt, type Route } from './geom'
import { useOnScreen, useWidth } from './useWidth'
import s from './nacrt.module.css'
import k from './keyidea.module.css'

const SERVE_MS = 200
/** of the 200 ms an opening needs per request, 70 ms are the hop into it */
const HOP_MS = 70
const STEP = 16

type Variant = 0 | 1 | 2
const NAMES = ['Mali', 'Srednji', 'Veliki'] as const
const CORES = [1, 2, 4]
const RAM = [2, 4, 8]

function Variants({ value, onChange, labels, name }: { value: Variant; onChange: (v: Variant) => void; labels: string[]; name: string }) {
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const nv = ((value + d + 3) % 3) as Variant
    onChange(nv)
    e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[nv]?.focus()
  }
  return (
    <div className={k.variants} role="radiogroup" aria-label={name}>
      {labels.map((l, i) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={value === i}
          tabIndex={value === i ? 0 : -1}
          className={k.variant}
          onClick={() => onChange(i as Variant)}
          onKeyDown={onKey}
        >
          <b>{l}</b>
          <span>{NAMES[i]}</span>
        </button>
      ))}
    </div>
  )
}

function SectionTitle({ letter, title }: { letter: string; title: string }) {
  return (
    <span className={k.secTitle}>
      <svg viewBox="0 0 44 22" aria-hidden="true">
        <path d="M2,4 V18 M2,4 L9,11" />
        <path d="M2,11 L12,6 L12,16 Z" className={k.secArrow} />
        <circle cx="30" cy="11" r="10" />
        <text x="30" y="15.5" textAnchor="middle">
          {letter}
        </text>
      </svg>
      <span>
        Presjek {letter}–{letter} · {title}
      </span>
    </span>
  )
}

/* ---------------- A–A: the orifice ---------------- */

interface ADot {
  id: number
  ph: 'q' | 'move' | 'serve' | 'exit'
  x: number
  y: number
  fx: number
  fy: number
  t0: number
  lane: number
}

interface AState {
  T: number
  id: number
  dots: ADot[]
  out: number[]
}

function aGeo(W: number, n: number) {
  const mid = 112
  const lane = 24
  const plateX = Math.round(W * 0.52)
  const opens = Array.from({ length: n }, (_, i) => mid + (i - (n - 1) / 2) * lane)
  return { W, mid, lane, plateX, opens, top: mid - 2 * lane - 6, bot: mid + 2 * lane + 6, H: 240 }
}

function aStep(S: AState, W: number, n: number) {
  const g = aGeo(W, n)
  S.T += STEP
  const q = S.dots.filter((d) => d.ph === 'q')
  // backlog never runs dry: there is always more waiting than the server can take
  const want = Math.max(4, Math.floor((g.plateX - 40) / 13))
  for (let i = q.length; i < want; i++) {
    const d: ADot = { id: S.id++, ph: 'q', x: -10 - (i - q.length) * 13, y: g.mid, fx: 0, fy: 0, t0: S.T, lane: -1 }
    S.dots.push(d)
    q.push(d)
  }
  // queue creeps forward at constant speed to its spot
  q.forEach((d, i) => {
    const tx = g.plateX - 18 - i * 13
    if (d.x < tx) d.x = Math.min(tx, d.x + 0.4 * STEP)
  })
  for (let o = 0; o < n; o++) {
    const busy = S.dots.some((d) => (d.ph === 'move' || d.ph === 'serve') && d.lane === o)
    const head = S.dots.find((d) => d.ph === 'q')
    if (!busy && head && head.x >= g.plateX - 34) {
      head.ph = 'move'
      head.lane = o
      head.fx = head.x
      head.fy = head.y
      head.t0 = S.T
    }
  }
  const keep: ADot[] = []
  for (const d of S.dots) {
    if (d.ph === 'move') {
      const f = Math.min(1, (S.T - d.t0) / HOP_MS)
      d.x = d.fx + (g.plateX - d.fx) * f
      d.y = d.fy + (g.opens[d.lane] - d.fy) * f
      if (f >= 1) {
        d.ph = 'serve'
        d.t0 = S.T
      }
    } else if (d.ph === 'serve') {
      if (S.T - d.t0 >= SERVE_MS - HOP_MS) {
        d.ph = 'exit'
        S.out.push(S.T)
      }
    } else if (d.ph === 'exit') {
      d.x += 0.22 * STEP
      if (d.x > W + 8) continue
    }
    keep.push(d)
  }
  S.dots = keep
  while (S.out.length && S.out[0] < S.T - 2000) S.out.shift()
}

function useLoop<T>(make: () => T, advance: (S: T) => void, deps: unknown[], active: boolean, warm: number): T {
  const [snap, setSnap] = useState<T>(() => {
    const S = make()
    for (let t = 0; t < warm; t += STEP) advance(S)
    return S
  })
  useEffect(() => {
    const S = make()
    for (let t = 0; t < warm; t += STEP) advance(S)
    if (!active) {
      const id = requestAnimationFrame(() => setSnap(structuredClone(S)))
      return () => cancelAnimationFrame(id)
    }
    let raf = 0
    let last = performance.now()
    let acc = 0
    const tick = (ts: number) => {
      acc += Math.min(80, ts - last)
      last = ts
      while (acc >= STEP) {
        advance(S)
        acc -= STEP
      }
      setSnap(structuredClone(S))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, active])
  return snap
}

function Orifice({ n, uid }: { n: number; uid: string }) {
  const reduced = useReducedMotion() ?? false
  const [ref, w] = useWidth<HTMLDivElement>((vw) => (vw < 900 ? vw - 70 : 540))
  const [scr, on] = useOnScreen<HTMLDivElement>()
  const W = Math.max(280, Math.floor(w / 10) * 10)
  const g = aGeo(W, n)
  const S = useLoop<AState>(() => ({ T: 0, id: 1, dots: [], out: [] }), (st) => aStep(st, W, n), [W, n], on && !reduced, 2600)
  const plateRects: { y: number; h: number }[] = []
  let y = g.top
  for (const oy of g.opens) {
    plateRects.push({ y, h: oy - 8 - y })
    y = oy + 8
  }
  plateRects.push({ y, h: g.bot - y })
  const rate = n * (1000 / SERVE_MS)
  return (
    <div ref={scr}>
      <div ref={ref}>
        <svg viewBox={`0 0 ${W} ${g.H}`} width={W} height={g.H} className={k.svg} role="img" aria-label={`Presjek A–A: ${n} ${n === 1 ? 'jezgra' : 'jezgre'}, ${n} ${n === 1 ? 'prolaz' : 'prolaza'} na otvoru; izlazi ${rate} zahtjeva u sekundi.`}>
          {/* cut walls are hatched, as in a section view */}
          <rect x={6} y={g.top - 12} width={W - 12} height={12} fill={`url(#${uid}-h)`} className={k.wall} />
          <rect x={6} y={g.bot} width={W - 12} height={12} fill={`url(#${uid}-h)`} className={k.wall} />
          <path d={`M6,${g.mid} H${W - 6}`} className={k.axis} />
          {plateRects.map((r, i) => (r.h > 0 ? <rect key={i} x={g.plateX - 5} y={r.y} width={10} height={r.h} fill={`url(#${uid}-h)`} className={k.plate} /> : null))}
          {g.opens.map((oy, i) => (
            <path key={i} d={`M${g.plateX + 8},${oy} h10`} className={k.laneTick} />
          ))}
          {S.dots.map((d) => (
            <circle key={d.id} cx={d.x} cy={d.y} r={d.ph === 'serve' ? 5 : 4.2} className={d.ph === 'serve' ? k.dotServe : d.ph === 'exit' ? k.dotOut : k.dot} />
          ))}
          <Dim x1={g.plateX + 28} y1={g.top} x2={g.plateX + 28} y2={g.bot} label={`${n} vCPU`} uid={uid} size={12.5} side="below" tone="pencil" />
          <text x={10} y={g.top - 20} className={s.lblMuted} style={{ fontSize: 13 }}>
            zahtjevi čekaju
          </text>
          <text x={g.plateX - 8} y={g.top - 20} className={s.lbl} style={{ fontSize: 13 }}>
            otvor: {n} {n === 1 ? 'prolaz' : 'prolaza'}
          </text>
          <Dim x1={g.plateX} y1={g.bot + 34} x2={W - 8} y2={g.bot + 34} label={W < 440 ? `izlaz ${rate} zaht./s` : `izlaz = ${n} × 5 = ${rate} zaht./s`} uid={uid} size={13} side="below" />
        </svg>
      </div>
      <p className={k.live}>
        izmjereno: <b>{hr(S.out.length / 2, 1)}</b> zaht./s
      </p>
    </div>
  )
}

/* ---------------- B–B: the vessel ---------------- */

const IN_MS = 140 // 7 requests/s arrive: more than one core can take
const COLS = 4

interface BDot {
  id: number
  ph: 'in' | 'drop' | 'held' | 'out' | 'rej'
  slot: number
  t0: number
  tIn: number
  x: number
  y: number
  fx: number
  fy: number
}

interface BState {
  T: number
  id: number
  next: number
  serveAt: number
  dots: BDot[]
  waits: number[]
}

function bGeo(W: number, ramGB: number) {
  const slots = ramGB * 4
  const cap = slots - 2
  const rows = Math.ceil(cap / COLS)
  const cell = 22
  const rowH = 15
  const sys = 9 // the 512 MB the system keeps, as a stippled layer on the floor
  const vw = COLS * cell + 10
  const vh = Math.max(rows * rowH + sys + 16, 64)
  const bottom = 204
  const vx = Math.round(W * (W < 440 ? 0.3 : 0.42) - vw / 2)
  const vy = bottom - vh
  const inY = 30
  const inlet: Route = route([
    [8, inY],
    [vx + vw / 2, inY],
    [vx + vw / 2, vy + 2],
  ])
  const outY = bottom - 7
  const outlet: Route = route([
    [vx + vw, outY],
    [W - 8, outY],
  ])
  /** requests rest on the floor, filling row by row from the bottom up */
  const slotAt = (k: number): Pt => [vx + 5 + (k % COLS) * cell + cell / 2, bottom - sys - Math.floor(k / COLS) * rowH - rowH / 2]
  /** liquid level for k requests held */
  const levelAt = (k: number) => bottom - sys - Math.ceil(k / COLS) * rowH
  return { slots, cap, rows, vx, vy, vw, vh, bottom, inlet, outlet, outY, slotAt, levelAt, H: 240, cell, rowH, sys }
}

function bStep(S: BState, W: number, ramGB: number) {
  const g = bGeo(W, ramGB)
  S.T += STEP
  if (S.T >= S.next) {
    S.next += IN_MS
    S.dots.push({ id: S.id++, ph: 'in', slot: -1, t0: S.T, tIn: 0, x: 8, y: 30, fx: 0, fy: 0 })
  }
  // the single core takes the oldest request every 200 ms
  if (S.T >= S.serveAt) {
    const held = S.dots.filter((d) => d.ph === 'held').sort((a, b) => a.tIn - b.tIn)[0]
    if (held) {
      held.ph = 'out'
      held.t0 = S.T
      held.fx = held.x
      held.fy = held.y
      S.waits.push(S.T - held.tIn)
      if (S.waits.length > 12) S.waits.shift()
      S.serveAt = S.T + SERVE_MS
    } else S.serveAt = S.T + STEP
  }
  const used = new Set(S.dots.filter((d) => d.slot >= 0 && (d.ph === 'drop' || d.ph === 'held')).map((d) => d.slot))
  const keep: BDot[] = []
  for (const d of S.dots) {
    if (d.ph === 'in') {
      const dist = (S.T - d.t0) * 0.2
      ;[d.x, d.y] = pointAt(g.inlet, dist)
      if (dist >= g.inlet.len) {
        let free = -1
        for (let i = 0; i < g.cap; i++)
          if (!used.has(i)) {
            free = i
            break
          }
        if (free < 0) {
          d.ph = 'rej'
          d.t0 = S.T
        } else {
          d.ph = 'drop'
          d.slot = free
          used.add(free)
          d.t0 = S.T
          d.fx = d.x
          d.fy = d.y
          d.tIn = S.T
        }
      }
    } else if (d.ph === 'drop') {
      const [tx, ty] = g.slotAt(d.slot)
      const f = Math.min(1, (S.T - d.t0) / 160)
      d.x = d.fx + (tx - d.fx) * f
      d.y = d.fy + (ty - d.fy) * f
      if (f >= 1) d.ph = 'held'
    } else if (d.ph === 'out') {
      const f = Math.min(1, (S.T - d.t0) / 120)
      if (f < 1) {
        d.x = d.fx + (g.vx + g.vw - d.fx) * f
        d.y = d.fy + (g.outY - d.fy) * f
      } else {
        const dist = (S.T - d.t0 - 120) * 0.22
        if (dist > g.outlet.len) continue
        ;[d.x, d.y] = pointAt(g.outlet, dist)
      }
    } else if (d.ph === 'rej') {
      if (S.T - d.t0 > 700) continue
    }
    keep.push(d)
  }
  S.dots = keep
}

function Vessel({ v, uid }: { v: Variant; uid: string }) {
  const reduced = useReducedMotion() ?? false
  const [ref, w] = useWidth<HTMLDivElement>((vw) => (vw < 900 ? vw - 70 : 540))
  const [scr, on] = useOnScreen<HTMLDivElement>()
  const W = Math.max(280, Math.floor(w / 10) * 10)
  const ram = RAM[v]
  const g = bGeo(W, ram)
  const S = useLoop<BState>(
    () => ({ T: 0, id: 1, next: 0, serveAt: SERVE_MS, dots: [], waits: [] }),
    (st) => bStep(st, W, ram),
    [W, ram],
    on && !reduced,
    ram * 1800,
  )
  const held = S.dots.filter((d) => d.ph === 'held' || d.ph === 'drop').length
  const cap = g.cap
  const full = held >= cap
  const wait = S.waits.length ? S.waits.reduce((a, b) => a + b, 0) / S.waits.length / 1000 : 0
  const orX = g.vx + g.vw + 26
  const lvl = g.levelAt(held)
  const top = g.levelAt(cap)
  const lx = g.vx + g.vw - 22
  return (
    <div ref={scr}>
      <div ref={ref}>
        <svg viewBox={`0 0 ${W} ${g.H}`} width={W} height={g.H} className={k.svg} role="img" aria-label={`Presjek B–B: posuda od ${ram} GB prima ${cap} zahtjeva odjednom; izlaz kroz jednu jezgru ostaje 5 zahtjeva u sekundi.`}>
          <path d={g.inlet.d} className={k.pipe} />
          <path d={g.outlet.d} className={k.pipe} />
          {/* tank in section: hatched walls and floor, the outlet cut through the right wall */}
          <rect x={g.vx - 6} y={g.vy - 6} width={6} height={g.vh + 12} fill={`url(#${uid}-h)`} className={k.wallCut} />
          <rect x={g.vx} y={g.bottom} width={g.vw + 6} height={6} fill={`url(#${uid}-h)`} className={k.wallCut} />
          <rect x={g.vx + g.vw} y={g.vy - 6} width={6} height={g.outY - 6 - (g.vy - 6)} fill={`url(#${uid}-h)`} className={k.wallCut} />
          <rect x={g.vx} y={g.bottom - g.sys} width={g.vw} height={g.sys} fill={`url(#${uid}-st)`} className={k.sysLayer} />
          {/* what is held fills the tank from the floor: a hatched body under the liquid level */}
          {held > 0 && <rect x={g.vx} y={lvl} width={g.vw} height={g.bottom - g.sys - lvl} fill={`url(#${uid}-hp)`} className={k.fill} />}
          {/* maximum level, and the current level with the drafting symbol for a liquid surface */}
          <path d={`M${g.vx - 14},${top} H${g.vx + g.vw + 14}`} className={k.maxLine} />
          <text x={g.vx + 3} y={top - 4} className={s.lblMuted} style={{ fontSize: 11.5 }}>
            max {cap}
          </text>
          {held > 0 && (
            <g className={full ? k.levelFull : k.level}>
              <path d={`M${g.vx},${lvl} H${g.vx + g.vw}`} />
              <path d={`M${lx - 6},${lvl - 9} h12 l-6,8 Z`} className={k.levelTri} />
              <path d={`M${lx - 5},${lvl + 3} h10 M${lx - 3},${lvl + 6} h6`} />
            </g>
          )}
          {/* one core at the outlet: the orifice does not grow with the vessel */}
          <path d={`M${orX},${g.outY - 13} V${g.outY - 5} M${orX},${g.outY + 5} V${g.outY + 13}`} className={k.plateLine} />
          <text x={orX + 8} y={g.outY - 16} className={s.lbl} style={{ fontSize: 12.5 }}>
            1 vCPU
          </text>
          {S.dots.map((d) =>
            d.ph === 'rej' ? (
              full ? <use key={d.id} href={`#${uid}-err`} x={d.x} y={d.y - 8} className={s.dotErr} style={{ opacity: 1 - (S.T - d.t0) / 700 }} /> : null
            ) : (
              <circle key={d.id} cx={d.x} cy={d.y} r={4} className={d.ph === 'out' ? k.dotOut : k.dot} />
            ),
          )}
          <Dim x1={g.vx - 26} y1={top} x2={g.vx - 26} y2={g.bottom} label={`${ram} GB`} uid={uid} size={12.5} tone="pencil" />
          <text x={g.vx + g.vw / 2 + 16} y={70} className={s.lbl} style={{ fontSize: 13 }}>
            u posudi {held}/{cap}
          </text>
          <text x={g.vx + g.vw / 2 + 16} y={89} className={wait > 1 ? s.redTxt : s.lblMuted} style={{ fontSize: 13 }}>
            čeka ≈ {hr(wait, 1)} s
          </text>
          <text x={12} y={18} className={s.lblMuted} style={{ fontSize: 13 }}>
            dolazi 7 zaht./s
          </text>
          <Dim x1={orX} y1={g.bottom + 22} x2={W - 8} y2={g.bottom + 22} label="izlaz = 5 zaht./s" uid={uid} size={13} side="below" />
        </svg>
      </div>
      <p className={k.live}>
        {full ? 'posuda je puna: višak dobiva 503' : 'posuda se puni'} · izlaz ostaje <b>5</b> zaht./s
      </p>
    </div>
  )
}

export function KeyIdea() {
  const uid = safeId(useId())
  const [a, setA] = useState<Variant>(0)
  const [b, setB] = useState<Variant>(0)
  return (
    <aside className={k.key} aria-label="Ključna ideja">
      <span className={s.blockTab}>Ključna ideja</span>
      <p className={k.keyText}>
        Jezgre određuju{' '}
        <span className={k.dimRef} data-ref="presjek A–A">
          propusnost
        </span>
        , a RAM određuje koliko zahtjeva{' '}
        <span className={k.dimRef} data-ref="presjek B–B">
          istodobno stane
        </span>
        .
      </p>
      <svg width="0" height="0" className={k.defs} aria-hidden="true">
        <Defs uid={uid} />
      </svg>
      <div className={k.sections}>
        <figure className={k.fig}>
          <figcaption className={k.figHead}>
            <SectionTitle letter="A" title="jezgre su otvor" />
            <Variants value={a} onChange={setA} labels={CORES.map((n) => `${n} vCPU`)} name="Broj jezgri u presjeku A–A" />
          </figcaption>
          <Orifice n={CORES[a]} uid={uid} />
          <p className={k.note}>
            Kroz svaki prolaz prođe jedan zahtjev u 200 ms. Više jezgri znači više prolaza, pa više zahtjeva u sekundi.
          </p>
        </figure>
        <figure className={k.fig}>
          <figcaption className={k.figHead}>
            <SectionTitle letter="B" title="RAM je posuda" />
            <Variants value={b} onChange={setB} labels={RAM.map((n) => `${n} GB`)} name="Količina RAM-a u presjeku B–B" />
          </figcaption>
          <Vessel v={b} uid={uid} />
          <p className={k.note}>
            Svaki zahtjev u obradi drži 256 MB (dva mjesta zauzima sustav). Veća posuda primi više zahtjeva odjednom, ali uz jednu jezgru
            oni samo dulje čekaju.
          </p>
        </figure>
      </div>
    </aside>
  )
}
