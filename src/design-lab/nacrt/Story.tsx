import { useEffect, useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { KeyIdea } from './KeyIdea'
import { Defs, SectionMark } from './Draw'
import { handCloud, roughLine, roughPath, safeId } from './geom'
import { GLOSSARY } from './glossary'
import { useSize, useWidth } from './useWidth'
import s from './nacrt.module.css'

export function SecHead({ n, sheet, kicker, title, id }: { n: string; sheet: string; kicker: string; title: ReactNode; id: string }) {
  return (
    <header className={s.secHead}>
      <SectionMark n={n} sheet={sheet} />
      <div>
        <p className={s.kicker}>{kicker}</p>
        <h2 className={s.h2} id={id}>
          {title}
        </h2>
      </div>
    </header>
  )
}

/**
 * Inline glossary term: dotted underline + item balloon (its number in the parts list at the foot of the sheet).
 * The definition opens as a callout with a leader to the balloon; it is shifted sideways so it never leaves the screen.
 */
export function Term({ n, children }: { n: number; children: ReactNode }) {
  const g = GLOSSARY.find((e) => e.n === n)
  const id = safeId(useId())
  const [shift, setShift] = useState(0)
  const place = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    const vw = document.documentElement.clientWidth
    const tipW = Math.min(330, vw - 32)
    const c = r.left + r.width / 2
    setShift(Math.round(Math.min(Math.max(0, 16 - (c - tipW / 2)), vw - 16 - (c + tipW / 2))))
  }
  if (!g) return <>{children}</>
  return (
    <span
      className={s.term}
      onPointerEnter={(e) => place(e.currentTarget)}
      onFocus={(e) => place(e.currentTarget)}
      style={{ '--tip-shift': `${shift}px` } as CSSProperties}
    >
      <button type="button" className={s.termBtn} aria-describedby={id}>
        {children}
        <span className={s.termBal} aria-hidden="true">
          {n}
        </span>
      </button>
      <span role="tooltip" id={id} className={s.termTip}>
        <span className={s.termTipHead}>Pojmovnik · poz. {n}</span>
        <strong>{g.term}</strong>
        {g.alt ? ` (${g.alt})` : ''} {g.def}
      </span>
    </span>
  )
}

/** Margin note: requests per second around noon, drawn like a strip-chart recording. */
function NoonChart() {
  const pts = 'M0,92 L40,90 L70,91 L96,88 L104,30 L112,18 L140,14 L170,16 L200,13'
  return (
    <figure className={s.marginNote}>
      <svg viewBox="-34 -14 248 136" className={s.svg} role="img" aria-label="Promet oko podneva: u 12:00 skoči oko dvadeset puta.">
        <path d="M0,0 V100 H200" className={s.axis} />
        {[0, 50, 100, 150, 200].map((x) => (
          <path key={x} d={`M${x},100 v5`} className={s.axis} />
        ))}
        <path d="M100,-6 V100" className={s.centerLineSvg} />
        <motion.path
          d={pts}
          className={s.trace}
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.6, ease: 'linear' }}
        />
        <text x="0" y="119" className={s.lblMuted} style={{ fontSize: 11 }}>
          11:50
        </text>
        <text x="100" y="119" textAnchor="middle" className={s.lblStrong} style={{ fontSize: 11 }}>
          12:00
        </text>
        <text x="200" y="119" textAnchor="end" className={s.lblMuted} style={{ fontSize: 11 }}>
          12:10
        </text>
        <text x="-6" y="16" textAnchor="end" className={s.lblMuted} style={{ fontSize: 11 }}>
          ×20
        </text>
        <text x="-6" y="94" textAnchor="end" className={s.lblMuted} style={{ fontSize: 11 }}>
          ×1
        </text>
        <text x="120" y="48" className={s.handSmall}>
          kraj
        </text>
        <text x="120" y="68" className={s.handSmall}>
          predavanja
        </text>
      </svg>
      <figcaption className={s.marginCap}>Zahtjeva u sekundi oko podneva (ilustracija)</figcaption>
    </figure>
  )
}

interface Counter {
  y: number
  cooks: number
  trays: number
  queue: number
}

const COUNTERS: Counter[] = [
  { y: 70, cooks: 1, trays: 2, queue: 3 },
  { y: 150, cooks: 2, trays: 4, queue: 2 },
  { y: 230, cooks: 4, trays: 8, queue: 2 },
]
const PERSON: [number, number] = [190, 170]
const Q_GAP = 17
const tailX = (c: Counter) => 418 - c.queue * Q_GAP
/** walking route: door → the person directing → an orthogonal route to the end of a counter's queue */
const walkPts = (c: Counter): [number, number][] => [
  [24, 170],
  [PERSON[0] - 18, 170],
  [PERSON[0] + 18, 170],
  [290, 170],
  [290, c.y + 20],
  [tailX(c), c.y + 20],
]
const WALKERS = [2, 0, 1, 2, 1, 0]

/**
 * Floor plan of the canteen (analogy). Item balloons refer to the parts list next to it.
 * The person at the entrance routes every student along a drawn route to the end of a queue;
 * queue lengths are dimensioned. On narrow screens the plan is transposed so labels stay legible.
 */
/**
 * Where the person directing students stands, in the plan's viewBox units, and the clear corridor
 * (between counter 1 and the label of counter 2) along which the checker's leader reaches them.
 */
function personAt(tall: boolean): [number, number, number] {
  return tall ? [PERSON[1], PERSON[0], PERSON[0] - 34] : [PERSON[0], PERSON[1], 124]
}

function FloorPlan({ uid, tall }: { uid: string; tall: boolean }) {
  const reduced = useReducedMotion() ?? false
  const P = (x: number, y: number): [number, number] => (tall ? [y, x] : [x, y])
  const R = (x: number, y: number, w: number, h: number) => (tall ? { x: y, y: x, width: h, height: w } : { x, y, width: w, height: h })
  const L = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${P(x, y).join(',')}`).join(' ')
  const [px, py] = P(PERSON[0], PERSON[1])
  const fs = tall ? 12.5 : 13
  return (
    <svg
      viewBox={tall ? '0 0 330 600' : '0 0 600 330'}
      className={s.svg}
      role="img"
      aria-label="Tlocrt menze: jedan ulaz, osoba koja usmjerava studente prema kraju reda pred jednim od tri pulta; pultovi imaju jednog, dva i četiri kuhara."
    >
      <Defs uid={uid} />
      {/* overall dimension */}
      <path d={`${L([[8, 10], [8, 22]])} ${L([[592, 10], [592, 22]])}`} className={s.thin} />
      <path d={L([[8, 16], [592, 16]])} className={s.thin} markerStart={`url(#${uid}-a)`} markerEnd={`url(#${uid}-a)`} />
      <text
        x={P(300, 11)[0]}
        y={P(300, 11)[1]}
        textAnchor="middle"
        className={s.lbl}
        style={{ fontSize: fs }}
        transform={tall ? `rotate(-90 ${P(300, 11)[0]} ${P(300, 11)[1]})` : undefined}
      >
        24,00 m
      </text>
      {/* walls (poché) with the door opening */}
      {[
        [8, 30, 584, 12],
        [8, 310, 584, 12],
        [580, 42, 12, 268],
        [8, 42, 12, 98],
        [8, 200, 12, 110],
      ].map(([x, y, w, h], i) => (
        <rect key={i} {...R(x, y, w, h)} className={s.wall} style={{ fill: `url(#${uid}-h)` }} />
      ))}
      <path d={L([[20, 200], [80, 200]])} className={s.thick} />
      <path d={`M${P(20, 140).join(',')} A60,60 0 0 ${tall ? 0 : 1} ${P(80, 200).join(',')}`} className={s.thinDash} />
      {/* routes the person draws: orthogonal, ending with an arrowhead at the end of each queue */}
      {COUNTERS.map((c, i) => (
        <path key={i} d={L(walkPts(c).slice(2))} className={s.pencilThin} markerEnd={`url(#${uid}-ap)`} />
      ))}
      {/* person directing */}
      <ellipse cx={px} cy={py} rx={tall ? 7.5 : 13} ry={tall ? 13 : 7.5} className={s.planPerson} />
      <circle cx={px} cy={py} r="5" className={s.planHead} />
      {/* counters, cooks (cores), tray spots (RAM) and the queue in front */}
      {COUNTERS.map((c, i) => {
        const lab = tall ? ([c.y + 20, 424] as const) : ([485, c.y - 6] as const)
        const mid = c.y + 20
        const t0 = tailX(c)
        const [d1x, d1y] = P(t0 - 4, mid - 15)
        const [d2x, d2y] = P(426, mid - 15)
        return (
          <g key={i}>
            <rect {...R(430, c.y, 110, 40)} className={s.counter} />
            {Array.from({ length: c.trays }, (_, k) => (
              <rect key={k} {...R(436 + (k % 4) * 25, c.y + 5 + Math.floor(k / 4) * 17, 18, 12)} className={s.tray} />
            ))}
            {Array.from({ length: c.cooks }, (_, k) => {
              const [x, y] = P(558, mid + (k - (c.cooks - 1) / 2) * 11)
              return <circle key={k} cx={x} cy={y} r="4.6" className={s.cook} />
            })}
            {Array.from({ length: c.queue }, (_, k) => {
              const [x, y] = P(418 - Q_GAP / 2 - k * Q_GAP + 8, mid)
              return <circle key={k} cx={x} cy={y} r="5.5" className={s.planStudent} />
            })}
            <path d={`M${d1x},${d1y} L${d2x},${d2y}`} className={s.thin} markerStart={`url(#${uid}-a)`} markerEnd={`url(#${uid}-a)`} />
            <text
              x={(d1x + d2x) / 2 + (tall ? -5 : 0)}
              y={(d1y + d2y) / 2 + (tall ? 0 : -5)}
              textAnchor="middle"
              className={s.lblMuted}
              style={{ fontSize: fs - 1 }}
              transform={tall ? `rotate(-90 ${(d1x + d2x) / 2 - 5} ${(d1y + d2y) / 2})` : undefined}
            >
              red {c.queue}
            </text>
            <text x={lab[0]} y={lab[1]} textAnchor="middle" className={s.lbl} style={{ fontSize: fs }}>
              PULT {i + 1}
            </text>
          </g>
        )
      })}
      {/* students walking in at constant speed along the drawn routes */}
      {!reduced &&
        WALKERS.map((ci, k) => {
          const pts = walkPts(COUNTERS[ci])
          const cum = [0]
          for (let j = 1; j < pts.length; j++) cum.push(cum[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]))
          const len = cum[cum.length - 1]
          const tp = pts.map((p) => P(p[0], p[1]))
          const times = cum.map((d) => (d / len) * 0.9)
          return (
            <motion.circle
              key={k}
              r="5.5"
              className={s.planWalker}
              initial={{ cx: tp[0][0], cy: tp[0][1], opacity: 0 }}
              animate={{
                cx: [...tp.map((p) => p[0]), tp[tp.length - 1][0]],
                cy: [...tp.map((p) => p[1]), tp[tp.length - 1][1]],
                opacity: [1, ...tp.slice(1).map(() => 1), 0],
              }}
              transition={{ duration: len / 70, repeat: Infinity, delay: k * 1.15, ease: 'linear', times: [...times, 1], repeatDelay: 1.2 }}
            />
          )
        })}
      {/* item balloons with leaders */}
      {(
        [
          [52, 262, '1', 20, 214],
          [190, 222, '2', 190, 182],
          [470, 296, '3', 470, 272],
          [556, 296, '4', 557, 273],
          [513, 296, '5', 520, 262],
        ] as const
      ).map(([x, y, n, tx, ty]) => {
        const [bx, by] = P(x, y)
        const [lx, ly] = P(tx, ty)
        return (
          <g key={n} className={s.planBalloon}>
            <path d={`M${bx},${by} L${lx},${ly}`} className={s.pencilThin} />
            <circle cx={lx} cy={ly} r="2" className={s.planHead} />
            <circle cx={bx} cy={by} r="10.5" />
            <text x={bx} y={by + 4.5} textAnchor="middle">
              {n}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

interface LeaderGeo {
  w: number
  h: number
  px: number
  py: number
  /** y of the clear corridor the leader runs along */
  cy: number
  nx: number
  ny: number
}

/**
 * Floor plan of the canteen with its parts list. "Where the analogy fails" is the checker's red-pencil note:
 * no box, just handwriting with a leader drawn to the part it is about (the person at the door, balloon 2).
 */
function Analogy() {
  const uid = safeId(useId())
  const [planRef, planW] = useWidth<HTMLDivElement>((vw) => (vw < 1040 ? vw - 80 : 600))
  const tall = planW > 0 && planW < 420
  const [fig, setFig] = useState<HTMLElement | null>(null)
  const [plan, setPlan] = useState<HTMLDivElement | null>(null)
  const [note, setNote] = useState<HTMLDivElement | null>(null)
  const [lg, setLg] = useState<LeaderGeo | null>(null)

  useEffect(() => {
    if (!fig || !plan || !note) return
    const measure = () => {
      const svg = plan.querySelector('svg')
      if (!svg) return
      const f = fig.getBoundingClientRect()
      const p = svg.getBoundingClientRect()
      const n = note.getBoundingClientRect()
      const vb = svg.viewBox.baseVal
      const [ux, uy, uc] = personAt(tall)
      setLg({
        w: Math.round(f.width),
        h: Math.round(f.height),
        px: Math.round(p.left - f.left + (ux / vb.width) * p.width),
        py: Math.round(p.top - f.top + (uy / vb.height) * p.height),
        cy: Math.round(p.top - f.top + (uc / vb.height) * p.height),
        nx: Math.round(n.left - f.left),
        ny: Math.round(n.top - f.top),
      })
    }
    const ro = new ResizeObserver(measure)
    ro.observe(fig)
    ro.observe(note)
    ro.observe(plan)
    return () => ro.disconnect()
  }, [fig, plan, note, tall])

  const leader = useMemo(() => {
    if (!lg) return ''
    const lx = Math.max(6, lg.nx - 16)
    const y0 = lg.ny + 15
    return roughPath(`M${lg.nx - 4},${y0} H${lx} V${lg.cy} H${lg.px + 16} L${lg.px + 5},${lg.py - 10}`, 23, { roughness: 0.9, bowing: 0.6, strokeWidth: 1.5 })
  }, [lg])

  return (
    <figure className={s.analogy} ref={setFig}>
      <div className={s.blockHead}>
        <span className={s.blockTab}>Analogija</span>
        <span className={s.blockMeta}>
          Tlocrt menze · <span className={s.nowrap}>MJ 1:200</span>
        </span>
      </div>
      <div className={s.analogyGrid}>
        <div
          className={s.analogyPlan}
          ref={(el) => {
            planRef(el)
            setPlan(el)
          }}
        >
          <FloorPlan uid={uid + 'p'} tall={tall} />
        </div>
        <div className={s.analogyText}>
          <p>
            Menza ima jedan ulaz i tri pulta. Na ulazu stoji osoba koja usmjerava studente: „Vi na pult 2, vi na pult 3.” Bez nje bi
            se svi nagurali pred prvi pult, a ostali bi stajali prazni.
          </p>
          <ol className={s.partsList}>
            <li>
              <span className={s.balloon}>1</span>
              <span>
                ulaz <i>=</i> javna adresa aplikacije
              </span>
            </li>
            <li>
              <span className={s.balloon}>2</span>
              <span>
                osoba na ulazu <i>=</i> load balancer
              </span>
            </li>
            <li>
              <span className={s.balloon}>3</span>
              <span>
                pult <i>=</i> poslužitelj
              </span>
            </li>
            <li>
              <span className={s.balloon}>4</span>
              <span>
                kuhari za pultom <i>=</i> jezgre (vCPU)
              </span>
            </li>
            <li>
              <span className={s.balloon}>5</span>
              <span>
                mjesta za pladnjeve <i>=</i> RAM
              </span>
            </li>
          </ol>
        </div>
        <div className={s.caveat} ref={setNote}>
          <span className={s.caveatLabel}>Gdje analogija ne vrijedi</span>
          <p>
            Osoba na ulazu vidi koliko ljudi čeka pred svakim pultom. Load balancer to ne vidi: zna samo koliko je veza sam otvorio
            prema svakom poslužitelju, a ne koliko su mu procesor i memorija stvarno zauzeti.
          </p>
        </div>
      </div>
      {lg && (
        <svg className={s.leaderLayer} width={lg.w} height={lg.h} viewBox={`0 0 ${lg.w} ${lg.h}`} aria-hidden="true">
          <motion.path
            d={leader}
            className={s.redPencil}
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 1.1, ease: 'linear' }}
          />
          <circle cx={lg.px + 3} cy={lg.py - 7} r={2.6} className={s.redDot} />
        </svg>
      )}
    </figure>
  )
}

/**
 * Myth and correction. The myth sits at reading size inside a revision cloud the checker drew by hand,
 * struck through above the x-height so it stays legible; the correction is the statement that carries the weight.
 */
function Myth() {
  const [claimRef, claim] = useSize<HTMLDivElement>()
  const cloudD = useMemo(() => (claim.w ? handCloud(8, 8, claim.w - 16, claim.h - 16, 19, 5) : ''), [claim.w, claim.h])
  const fixLine = useMemo(() => roughLine(2, 6, 118, 5, 21, { strokeWidth: 2 }), [])
  return (
    <div className={s.myth}>
      <div className={s.mythClaim} ref={claimRef}>
        <motion.svg
          className={s.mythCloud}
          width={claim.w}
          height={claim.h}
          aria-hidden="true"
          initial="hidden"
          whileInView="shown"
          viewport={{ once: true, margin: '-60px' }}
        >
          {cloudD && (
            <motion.path d={cloudD} variants={{ hidden: { pathLength: 0 }, shown: { pathLength: 1, transition: { duration: 1.4, ease: 'linear' } } }} />
          )}
        </motion.svg>
        <span className={s.mythLabel}>Mit</span>
        <p className={s.mythText}>
          <span className={s.struck}>Više RAM-a znači brži poslužitelj.</span>
        </p>
      </div>
      <div className={s.mythFix}>
        <span className={s.fixLabel}>
          <svg viewBox="0 0 24 22" aria-hidden="true">
            <path d="M12,2 L22,20 L2,20 Z" />
            <text x="12" y="17.5" textAnchor="middle">
              1
            </text>
          </svg>
          Ispravak
          <svg className={s.fixUnder} viewBox="0 0 120 10" aria-hidden="true">
            <path d={fixLine} />
          </svg>
        </span>
        <p className={s.fixHead}>RAM određuje koliko zahtjeva stane istodobno, a ne koliko ih se obradi u sekundi.</p>
        <p>Kad su sve jezgre zauzete, dodatni RAM samo pusti više zahtjeva da čekaju na procesor: odziv postaje sporiji, a ne brži.</p>
      </div>
    </div>
  )
}

export function Story() {
  return (
    <section className={s.section} id="podne" aria-labelledby="podne-title">
      <SecHead n="01" sheet="1/6" kicker="Priča · uvod" title="Podne u menzi" id="podne-title" />
      <div className={s.storyGrid}>
        <div className={s.prose}>
          <p>
            Klopa je aplikacija za naručivanje obroka u studentskoj menzi. Do 11:55 sve teče mirno: nekoliko narudžbi u minuti, a
            jedini poslužitelj uglavnom čeka posao.
          </p>
          <p>
            U 12:00 završava predavanje i stotine studenata u istoj minuti otvore aplikaciju. Poslužitelj više ne stiže: zahtjevi
            čekaju u redu, neki istječu, a menza ima hranu, ali ne prima narudžbe. Dodali smo još dva poslužitelja, no netko mora
            odlučiti koji zahtjev ide kamo. To je posao koji obavlja <Term n={1}>load balancer</Term>.
          </p>
        </div>
        <NoonChart />
      </div>

      <KeyIdea />
      <Analogy />
      <Myth />
    </section>
  )
}
