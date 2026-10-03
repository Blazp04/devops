import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Defs, Dim, Fade, Ink, Person, Pod, RevTri, Rotary, Valve } from './Draw'
import { drawVariants } from './variants'
import { pointAt, roughEllipse, roughPath, route, safeId, type Pt, type Route } from './geom'
import { useOnScreen, useWidth } from './useWidth'
import s from './nacrt.module.css'

interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface HeroGeo {
  tall: boolean
  vb: [number, number]
  people: Pt[]
  clock: Pt
  port: Pt
  crowdDim: [number, number, number, number]
  tb: Box
  A: { box: Box; route: Route; queue: Pt[]; ellipse: [number, number, number, number]; note: Pt; arrow: string }
  B: { lb: Pt; boxes: Box[]; routes: Route[]; angles: number[]; dim: [number, number, number, number]; note: Pt }
  C: {
    lb: Pt
    cluster: Box
    cp: Box
    nodes: Box[]
    pods: Pt[]
    routes: Route[]
    angles: number[]
    buses: string
    busY: number[]
    trunk: string
    note: Pt
  }
}

const SPEED = 0.3 // drawing units per ms
const CRASH_POD = 5
const CYCLE = 6200
/** the failing Pod has already restarted 4 times — the same Pod, the same count as in detail B and the legend */
const RESTARTS = 4

function geometry(tall: boolean): HeroGeo {
  if (!tall) {
    const port: Pt = [180, 240]
    const lb: Pt = [300, 240]
    const ys = [105, 240, 375]
    const podXs = [474, 588, 702]
    const pods: Pt[] = [...podXs.map((x): Pt => [x, 166]), ...podXs.map((x): Pt => [x, 340])]
    const busY = [226, 400]
    return {
      tall,
      vb: [900, 470],
      people: [
        [52, 206],
        [94, 194],
        [136, 206],
        [66, 286],
        [108, 274],
        [150, 286],
      ],
      clock: [96, 122],
      port,
      crowdDim: [22, 160, 22, 292],
      tb: { x: 14, y: 386, w: 340, h: 70 },
      A: {
        box: { x: 470, y: 156, w: 200, h: 168 },
        route: route([port, [470, 240]]),
        queue: Array.from({ length: 8 }, (_, k): Pt => [456 - k * 11, 240]),
        ellipse: [572, 240, 310, 262],
        note: [716, 108],
        arrow: 'M712,120 C684,122 668,134 656,150',
      },
      B: {
        lb,
        boxes: ys.map((y) => ({ x: 560, y: y - 46, w: 190, h: 92 })),
        routes: ys.map((y) => route([port, lb, [390, 240], [390, y], [560, y]])),
        angles: [-50, 0, 50],
        dim: [790, 59, 790, 421],
        note: [214, 132],
      },
      C: {
        lb,
        cluster: { x: 372, y: 20, w: 514, h: 432 },
        cp: { x: 392, y: 42, w: 474, h: 42 },
        nodes: [
          { x: 392, y: 102, w: 474, h: 152 },
          { x: 392, y: 276, w: 474, h: 152 },
        ],
        pods,
        routes: pods.map((p, i) => {
          const by = busY[i < 3 ? 0 : 1]
          return route([port, lb, [380, 240], [380, by], [p[0], by], [p[0], p[1] + 21]])
        }),
        angles: [-22, -22, -22, 22, 22, 22],
        trunk: 'M180,240 H380',
        buses: busY.map((y) => `M380,${y} H${podXs[2]}`).join(' ') + ` M380,${busY[0]} V${busY[1]}`,
        busY,
        note: [270, 150],
      },
    }
  }
  const port: Pt = [200, 138]
  const lb: Pt = [200, 250]
  const xs = [70, 200, 330]
  const podXs = [110, 200, 290]
  const pods: Pt[] = [...podXs.map((x): Pt => [x, 452]), ...podXs.map((x): Pt => [x, 628])]
  const busY = [514, 690]
  return {
    tall,
    vb: [400, 808],
    people: [
      [110, 120],
      [155, 110],
      [200, 120],
      [245, 110],
      [290, 120],
    ],
    clock: [48, 92],
    port,
    crowdDim: [90, 58, 310, 58],
    tb: { x: 16, y: 756, w: 368, h: 44 },
    A: {
      box: { x: 105, y: 430, w: 190, h: 168 },
      route: route([port, [200, 430]]),
      queue: Array.from({ length: 8 }, (_, k): Pt => [200, 416 - k * 11]),
      ellipse: [200, 512, 280, 250],
      note: [236, 678],
      arrow: 'M248,660 C252,648 254,636 250,622',
    },
    B: {
      lb,
      boxes: xs.map((x) => ({ x: x - 58, y: 440, w: 116, h: 110 })),
      routes: xs.map((x) => route([port, lb, [200, 330], [x, 330], [x, 440]])),
      angles: [135, 90, 45],
      dim: [12, 590, 388, 590],
      note: [246, 302],
    },
    C: {
      lb,
      cluster: { x: 8, y: 312, w: 384, h: 430 },
      cp: { x: 32, y: 330, w: 340, h: 38 },
      nodes: [
        { x: 32, y: 384, w: 340, h: 160 },
        { x: 32, y: 560, w: 340, h: 160 },
      ],
      pods,
      routes: pods.map((p, i) => {
        const by = busY[i < 3 ? 0 : 1]
        return route([port, lb, [200, 296], [20, 296], [20, by], [p[0], by], [p[0], p[1] + 21]])
      }),
      angles: [150, 150, 150, 150, 150, 150],
      buses: ` M200,296 H20 V${busY[1]}` + busY.map((y) => ` M20,${y} H${podXs[2]}`).join(''),
      busY,
      trunk: 'M200,138 V296',
      note: [244, 214],
    },
  }
}

interface HDot {
  id: number
  r: number
  t0: number
  fail: boolean
  passed: boolean
}

interface HState {
  now: number
  acc: number
  n: number
  id: number
  target: number
  dots: HDot[]
  marks: { id: number; x: number; y: number; t: number }[]
}

interface HSnap {
  dots: { id: number; x: number; y: number }[]
  marks: { id: number; x: number; y: number; a: number }[]
  angle: number
  phase: 'ready' | 'crash' | 'creating'
  restarts: number
}

function podPhase(now: number): HSnap['phase'] {
  const p = now % CYCLE
  return p < 3400 ? 'ready' : p < 4900 ? 'crash' : 'creating'
}

function routesFor(g: HeroGeo, rev: number): Route[] {
  return rev === 0 ? [g.A.route] : rev === 1 ? g.B.routes : g.C.routes
}

function staticSnap(g: HeroGeo, rev: number): HSnap {
  const rs = routesFor(g, rev)
  const dots = rs.flatMap((r, i) =>
    [0.28, 0.62].map((f, k) => {
      const [x, y] = pointAt(r, r.len * (f + i * 0.04))
      return { id: i * 10 + k, x, y }
    }),
  )
  return { dots, marks: [], angle: rev === 1 ? g.B.angles[1] : g.C.angles[0], phase: 'ready', restarts: RESTARTS }
}

const REVS = [
  { key: 'A', title: 'Jedan poslužitelj', text: 'U 12:00 stiže 400 studenata. Jedan poslužitelj ne stiže, red se puni.' },
  { key: 'B', title: 'Load balancer', text: 'Tri poslužitelja i load balancer koji dijeli zahtjeve.' },
  { key: 'C', title: 'Klaster', text: 'Kubernetes raspoređuje kontejnere i sam ponovno pokreće one koji padnu.' },
]

export function Hero() {
  const reduced = useReducedMotion() ?? false
  const [rev, setRev] = useState(reduced ? 2 : 0)
  const [auto, setAuto] = useState(!reduced)
  const [wrapRef, width] = useWidth<HTMLDivElement>((vw) => (vw < 900 ? vw - 40 : vw * 0.55))
  const [screenRef, onScreen] = useOnScreen<HTMLDivElement>()
  const tall = width < 560
  const g = useMemo(() => geometry(tall), [tall])
  const uid = safeId(useId())
  const [snap, setSnap] = useState<HSnap | null>(null)
  const st = useRef<HState | null>(null)

  // revisions advance on their own until the reader picks one
  useEffect(() => {
    if (!auto || reduced) return
    const id = window.setTimeout(() => setRev((r) => (r + 1) % 3), rev === 2 ? 9000 : 6500)
    return () => window.clearTimeout(id)
  }, [rev, auto, reduced])

  useEffect(() => {
    if (reduced || !onScreen) return
    st.current = { now: 0, acc: 0, n: 0, id: 1, target: 1, dots: [], marks: [] }
    const routes = routesFor(g, rev)
    const lbDist = Math.hypot(g.B.lb[0] - g.port[0], g.B.lb[1] - g.port[1])
    let raf = 0
    let last = performance.now()
    const tick = (ts: number) => {
      const S = st.current
      if (!S) return
      const dt = Math.min(48, ts - last)
      last = ts
      S.now += dt
      const phase = podPhase(S.now)
      // spawn after the linework has drawn itself
      if (S.now > 1300) {
        S.acc += dt
        const every = rev === 0 ? 120 : 150
        while (S.acc >= every) {
          S.acc -= every
          let r = 0
          if (rev === 1) r = S.n % 3
          if (rev === 2) {
            const ready = [0, 1, 2, 3, 4, 5].filter((i) => i !== CRASH_POD || phase === 'ready')
            r = ready[S.n % ready.length]
          }
          S.dots.push({ id: S.id++, r, t0: S.now, fail: rev === 0 && S.n % 3 === 2, passed: false })
          S.n++
        }
      }
      const keep: HDot[] = []
      for (const d of S.dots) {
        const rt = routes[d.r]
        const dist = (S.now - d.t0) * SPEED
        if (!d.passed && dist >= lbDist) {
          d.passed = true
          S.target = d.r
        }
        if (dist < rt.len) {
          keep.push(d)
          continue
        }
        const end = rt.pts[rt.pts.length - 1]
        if (d.fail)
          S.marks.push(
            g.tall
              ? { id: d.id, x: end[0] + (d.id % 2 ? -14 : 14), y: end[1] - 14, t: S.now }
              : { id: d.id, x: end[0] - 14, y: end[1] + (d.id % 2 ? -14 : 14), t: S.now },
          )
        else if (rev === 2 && d.r === CRASH_POD && phase !== 'ready') S.marks.push({ id: d.id, x: end[0], y: end[1] - 21, t: S.now })
      }
      S.dots = keep
      S.marks = S.marks.filter((m) => S.now - m.t < 800)
      const angles = rev === 1 ? g.B.angles : g.C.angles
      setSnap({
        dots: S.dots.map((d) => {
          const [x, y] = pointAt(routes[d.r], (S.now - d.t0) * SPEED)
          return { id: d.id, x, y }
        }),
        marks: S.marks.map((m) => ({ id: m.id, x: m.x, y: m.y, a: (S.now - m.t) / 800 })),
        angle: angles[S.target] ?? 0,
        phase,
        restarts: RESTARTS + Math.floor(S.now / CYCLE),
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [g, rev, reduced, onScreen])

  const view = reduced || !snap ? staticSnap(g, rev) : snap
  const pick = (i: number) => {
    setAuto(false)
    setRev(i)
  }

  return (
    <section className={s.hero} id="vrh" aria-labelledby="hero-title">
      <div className={s.heroHead}>
        <p className={s.kicker}>Tehnička dokumentacija tečaja · 6 modula · 24 lista</p>
        <div className={s.titleDimWrap}>
          <span className={s.titleDim} aria-hidden="true">
            <svg>
              <line x1="0" y1="7" x2="100%" y2="7" markerStart={`url(#${uid}-ap)`} markerEnd={`url(#${uid}-ap)`} />
            </svg>
            <span>24 lista · ≈ 14 h · od 01 do 24</span>
          </span>
          <h1 className={s.heroTitle} id="hero-title">
            <span>Kubernetes</span> <span>od nule</span>
          </h1>
        </div>
      </div>
      <div className={s.heroText}>
        <p className={s.tagline}>Od jednog poslužitelja do platforme koja se sama popravlja.</p>
        <p className={s.heroDesc}>
          Tečaj prati Klopu, aplikaciju za narudžbe u studentskoj menzi, od jednog preopterećenog poslužitelja do klastera koji sam
          raspoređuje i ponovno pokreće kontejnere. Svaki pojam nacrtamo, izmjerimo i namjerno srušimo u simulaciji, a zatim ga
          primijenimo na pravom Kubernetesu.
        </p>
        <div className={s.ctaRow}>
          <a className={s.cta} href="#kurikulum">
            Kreni od početka
            <svg viewBox="0 0 34 14" aria-hidden="true">
              <path d="M0,7 H32 M25,1.5 L32,7 L25,12.5" />
            </svg>
          </a>
          <a className={s.ctaAlt} href="#predavanje">
            ili otvorite list 04
          </a>
        </div>
        <dl className={s.specGrid}>
          <div>
            <dt>Moduli</dt>
            <dd>6</dd>
          </div>
          <div>
            <dt>Listovi</dt>
            <dd>24</dd>
          </div>
          <div>
            <dt>Trajanje</dt>
            <dd>≈ 14 h</dd>
          </div>
          <div data-wide>
            <dt>Predznanje</dt>
            <dd>terminal, mreže</dd>
          </div>
        </dl>
      </div>

      <figure className={s.heroFig} ref={screenRef}>
        <div className={s.figFrame} ref={wrapRef}>
          <span className={s.figCorner} aria-hidden="true">
            DETALJ 0 · PUT TEČAJA
          </span>
          <svg
            viewBox={`0 0 ${g.vb[0]} ${g.vb[1]}`}
            className={`${s.svg} ${s.heroSvg}`}
            data-tall={tall}
            role="img"
            aria-label={`Revizija ${REVS[rev].key}: ${REVS[rev].text}`}
          >
            <Defs uid={uid} />
            <motion.g initial="hidden" animate="shown">
              <Crowd g={g} uid={uid} />
            </motion.g>
            <AnimatePresence mode="sync">
              <motion.g key={`${rev}-${tall}`} initial="hidden" animate="shown" exit="gone">
                {rev === 0 && <RevA g={g} uid={uid} />}
                {rev === 1 && <RevB g={g} uid={uid} />}
                {rev === 2 && <RevC g={g} uid={uid} phase={view.phase} restarts={view.restarts} />}
              </motion.g>
            </AnimatePresence>
            <g>
              {view.dots.map((d) => (
                <use key={d.id} href={`#${uid}-req`} x={d.x} y={d.y} className={s.dotReq} />
              ))}
              {view.marks.map((m) => (
                <use key={m.id} href={`#${uid}-err`} x={m.x} y={m.y} className={s.dotErr} style={{ opacity: 1 - m.a }} />
              ))}
            </g>
            {rev > 0 && (
              <Rotary
                cx={g.B.lb[0]}
                cy={g.B.lb[1]}
                r={30}
                angle={view.angle}
                label={rev === 1 ? 'LOAD BALANCER' : 'SERVICE'}
                sub={rev === 1 ? 'kružno' : 'app=klopa'}
                subRight={tall}
              />
            )}
            <TitleBlock g={g} rev={rev} />
          </svg>
        </div>
        <div className={s.revTabs} role="group" aria-label="Revizije crteža">
          {REVS.map((r, i) => (
            <button key={r.key} type="button" className={s.revTab} aria-pressed={rev === i} onClick={() => pick(i)}>
              <span className={s.revTabTri} aria-hidden="true">
                {r.key}
              </span>
              <span className={s.revTabTitle}>{r.title}</span>
              {auto && rev === i && <span key={rev} className={s.revTabTimer} style={{ animationDuration: rev === 2 ? '9s' : '6.5s' }} />}
            </button>
          ))}
        </div>
        <figcaption className={s.figCaption}>
          <span className={s.capLabel}>Rev. {REVS[rev].key}</span> {REVS[rev].text}
        </figcaption>
      </figure>
    </section>
  )
}

function Crowd({ g, uid }: { g: HeroGeo; uid: string }) {
  const [cx, cy] = g.clock
  return (
    <g>
      {g.people.map(([x, y], i) => (
        <motion.g key={i} custom={i} variants={drawVariants}>
          <Person x={x} y={y} />
        </motion.g>
      ))}
      <Fade i={2}>
        <Dim
          x1={g.crowdDim[0]}
          y1={g.crowdDim[1]}
          x2={g.crowdDim[2]}
          y2={g.crowdDim[3]}
          label="≈ 400 studenata"
          size={g.tall ? 14 : 15}
          uid={uid}
          tone="pencil"
        />
      </Fade>
      {/* the clock runs up to 12:00 — that is when the trouble starts */}
      <g className={s.clock}>
        <circle cx={cx} cy={cy} r={18} />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2
          return (
            <line key={i} x1={cx + Math.sin(a) * 14} y1={cy - Math.cos(a) * 14} x2={cx + Math.sin(a) * 17} y2={cy - Math.cos(a) * 17} />
          )
        })}
        <motion.g initial={{ rotate: -120 }} animate={{ rotate: 0 }} transition={{ duration: 1.2, ease: 'easeInOut' }}>
          <circle cx={cx} cy={cy} r={14} className={s.invisible} />
          <line x1={cx} y1={cy} x2={cx} y2={cy - 13} className={s.clockHand} />
        </motion.g>
        <motion.g initial={{ rotate: -10 }} animate={{ rotate: 0 }} transition={{ duration: 1.2, ease: 'easeInOut' }}>
          <circle cx={cx} cy={cy} r={14} className={s.invisible} />
          <line x1={cx} y1={cy} x2={cx} y2={cy - 8} className={s.clockHandThick} />
        </motion.g>
        <text x={cx} y={cy + 34} textAnchor="middle" className={s.lbl}>
          12:00
        </text>
      </g>
      <Ink d={g.tall ? `M${g.port[0]},${g.port[1] - 12} V${g.port[1]}` : `M${g.port[0] - 12},${g.port[1]} H${g.port[0]}`} className={s.pipe} />
    </g>
  )
}

function rectD(b: Box): string {
  return `M${b.x},${b.y} H${b.x + b.w} V${b.y + b.h} H${b.x} Z`
}

function Cores({ x, y, n, load, uid, size = 16 }: { x: number; y: number; n: number; load: number; uid: string; size?: number }) {
  return (
    <g>
      {Array.from({ length: n }, (_, k) => {
        const f = Math.max(0, Math.min(1, load * n - k))
        const over = load >= 0.98
        return (
          <g key={k}>
            <rect x={x + k * (size + 5)} y={y} width={size} height={size} className={s.core} />
            {f > 0 && (
              <rect
                x={x + k * (size + 5)}
                y={y + size * (1 - f)}
                width={size}
                height={size * f}
                fill={`url(#${uid}-${over ? 'hr' : 'h'})`}
                className={over ? s.coreHotStroke : undefined}
              />
            )}
          </g>
        )
      })}
    </g>
  )
}

function RevA({ g, uid }: { g: HeroGeo; uid: string }) {
  const b = g.A.box
  const [ex, ey, ew, eh] = g.A.ellipse
  const ellipse = useMemo(() => roughEllipse(ex, ey, ew, eh, 4, { roughness: 1.6 }), [ex, ey, ew, eh])
  const arrow = useMemo(() => roughPath(g.A.arrow, 9), [g.A.arrow])
  const cx = b.x + b.w / 2
  return (
    <g>
      <Ink d={g.A.route.d} className={s.pipe} />
      <Ink d={rectD(b)} i={2} className={s.boxLine} />
      <Fade i={1}>
        <text x={cx} y={b.y + 26} textAnchor="middle" className={s.partName}>
          POSLUŽITELJ
        </text>
        <text x={cx} y={b.y + 46} textAnchor="middle" className={s.lblMuted}>
          1 vCPU · 2 GB
        </text>
        <text x={b.x + 14} y={b.y + 66} className={s.partTiny}>
          CPU
        </text>
        <Cores x={b.x + 14} y={b.y + 74} n={1} load={1} uid={uid} size={38} />
        <text x={b.x + 70} y={b.y + 66} className={s.partTiny}>
          RAM
        </text>
        {Array.from({ length: 6 }, (_, k) => (
          <rect key={k} x={b.x + 70 + k * 19} y={b.y + 74} width={19} height={38} fill={`url(#${uid}-hr)`} className={s.ramFull} />
        ))}
        <text x={cx} y={b.y + 140} textAnchor="middle" className={s.redTxt}>
          CPU 100 % · RAM pun
        </text>
        {g.A.queue.map(([x, y], k) => (
          <circle key={k} cx={x} cy={y} r={3.6} className={s.bead} />
        ))}
      </Fade>
      <Ink d={ellipse} i={6} className={s.redPencil} />
      <Ink d={arrow} i={8} className={s.redPencil} />
      <Fade i={9}>
        <text x={g.A.note[0]} y={g.A.note[1]} className={s.hand} textAnchor={g.tall ? 'start' : 'start'}>
          ne stiže!
        </text>
        <text x={g.A.note[0]} y={g.A.note[1] + 22} className={s.handSmall}>
          red pun → greške 503
        </text>
      </Fade>
    </g>
  )
}

const B_NAMES = [
  { name: 'MALI', spec: '1 vCPU · 2 GB', n: 1, load: 1 },
  { name: 'SREDNJI', spec: '2 vCPU · 4 GB', n: 2, load: 0.62 },
  { name: 'VELIKI', spec: '4 vCPU · 8 GB', n: 4, load: 0.3 },
]

function RevB({ g, uid }: { g: HeroGeo; uid: string }) {
  return (
    <g>
      {g.B.routes.map((r, i) => (
        <Ink key={i} d={r.d} i={i} className={s.pipe} />
      ))}
      {g.B.boxes.map((b, i) => {
        const m = B_NAMES[i]
        const coreSize = g.tall ? 14 : 16
        return (
          <g key={i}>
            <Ink d={rectD(b)} i={3 + i} className={s.boxLine} />
            <Fade i={3 + i}>
              <text x={b.x + 10} y={b.y + 22} className={s.partName}>
                {m.name}
              </text>
              <text x={b.x + 10} y={b.y + 40} className={s.lblMuted}>
                {g.tall ? m.spec.replace(' · ', '·') : m.spec}
              </text>
              <Cores x={b.x + 10} y={b.y + b.h - coreSize - 14} n={m.n} load={m.load} uid={uid} size={coreSize} />
            </Fade>
          </g>
        )
      })}
      <Fade i={7}>
        <Dim x1={g.B.dim[0]} y1={g.B.dim[1]} x2={g.B.dim[2]} y2={g.B.dim[3]} label="3 poslužitelja" uid={uid} side="below" size={g.tall ? 14 : 15} />
        <RevTri x={g.B.note[0]} y={g.B.note[1]} label="B" />
        <text x={g.B.note[0] + 16} y={g.B.note[1] + 5} className={s.lblPencil}>
          + load balancer
        </text>
      </Fade>
    </g>
  )
}

function RevC({ g, uid, phase, restarts }: { g: HeroGeo; uid: string; phase: HSnap['phase']; restarts: number }) {
  const C = g.C
  const cpu = C.cp
  return (
    <g>
      <Ink d={rectD(C.cluster)} className={s.phantom} />
      <Ink d={rectD(cpu)} i={1} className={s.boxLine} />
      {C.nodes.map((n, i) => (
        <Ink key={i} d={rectD(n)} i={2 + i} className={s.boxLine} />
      ))}
      <Ink d={C.buses} i={4} className={s.pipe} />
      <Ink d={C.trunk} i={0} className={s.pipe} />
      <Fade i={3}>
        <text
          x={g.tall ? C.cluster.x + C.cluster.w - 6 : C.cluster.x + 10}
          y={C.cluster.y - 6}
          textAnchor={g.tall ? 'end' : 'start'}
          className={s.lblStrong}
        >
          KLASTER · klopa-prod
        </text>
        <text x={cpu.x + 12} y={cpu.y + 26} className={s.partSmallStrong}>
          CONTROL PLANE
        </text>
        <text x={cpu.x + cpu.w - 12} y={cpu.y + 26} textAnchor="end" className={s.lblMuted}>
          {g.tall ? 'api · etcd · scheduler' : 'api-server · etcd · scheduler'}
        </text>
        {C.nodes.map((n, i) => (
          <g key={i}>
            <text x={n.x + 10} y={n.y + 20} className={s.partSmallStrong}>
              čvor-{i + 1}
            </text>
            <text x={n.x + n.w - 10} y={n.y + 21} textAnchor="end" className={s.lblMuted}>
              4 vCPU · 8 GB
            </text>
          </g>
        ))}
        {C.pods.map(([x, y], i) => {
          const crash = i === CRASH_POD
          const state = crash ? (phase === 'ready' ? 'ready' : phase === 'crash' ? 'crash' : 'creating') : 'ready'
          const by = C.busY[i < 3 ? 0 : 1]
          const ready = state === 'ready'
          // same grammar as detail B: only a Ready Pod gets a solid branch and an open valve
          return (
            <g key={i}>
              <path d={`M${x},${by} V${by - 20}`} className={s.pipe} />
              <path d={`M${x},${by - 6} V${y + 24}`} className={ready ? s.pipe : s.chainDrop} />
              <Valve x={x} y={by - 13} closed={!ready} vertical />
              <Pod cx={x} cy={y} r={24} state={state} version={i === 2 ? 2 : 1} uid={uid} restarts={crash ? restarts : undefined} />
            </g>
          )
        })}
      </Fade>
      <Fade i={8}>
        <RevTri x={C.note[0]} y={C.note[1]} label="C" />
        <text x={C.note[0] + 16} y={C.note[1] + 5} className={s.lblPencil}>
          {phase === 'ready' ? 'sam se popravlja' : phase === 'crash' ? 'Pod pao →' : 'novi Pod se diže'}
        </text>
      </Fade>
    </g>
  )
}

function TitleBlock({ g, rev }: { g: HeroGeo; rev: number }) {
  const b = g.tb
  const c1 = b.x + b.w * (g.tall ? 0.54 : 0.54)
  const c2 = b.x + b.w * (g.tall ? 0.74 : 0.74)
  const midY = b.y + b.h / 2
  return (
    <g className={s.tb0}>
      <path d={`M${b.x},${b.y} H${b.x + b.w} V${b.y + b.h} H${b.x} Z M${c1},${b.y} V${b.y + b.h} M${c2},${b.y} V${b.y + b.h} M${c2},${midY} H${b.x + b.w}`} />
      <text x={b.x + 8} y={b.y + 15} className={s.tbTiny}>
        PROJEKT
      </text>
      <text x={b.x + 8} y={b.y + (g.tall ? 36 : 44)} className={s.tbName}>
        KLOPA · narudžbe
      </text>
      {!g.tall && (
        <text x={b.x + 8} y={b.y + 61} className={s.tbTiny}>
          IZRADIO: tečaj K8s
        </text>
      )}
      <text x={c1 + 8} y={b.y + 15} className={s.tbTiny}>
        REV
      </text>
      <AnimatePresence mode="wait">
        <motion.text
          key={rev}
          x={g.tall ? c2 - 10 : (c1 + c2) / 2}
          y={b.y + b.h - (g.tall ? 7 : 12)}
          textAnchor={g.tall ? 'end' : 'middle'}
          className={s.tbRev}
          style={g.tall ? { fontSize: 26 } : undefined}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {REVS[rev].key}
        </motion.text>
      </AnimatePresence>
      <text x={c2 + 8} y={midY - 7} className={s.tbTiny}>
        LIST 00
      </text>
      <text x={c2 + 8} y={b.y + b.h - 8} className={s.tbTiny}>
        {'MJ\u00a01:1'}
      </text>
    </g>
  )
}
