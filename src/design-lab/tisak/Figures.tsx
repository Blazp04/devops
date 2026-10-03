import { useMemo, useRef } from 'react'
import { useReducedMotion } from 'motion/react'
import { Disc, ReqDot, Student } from './Glyphs'
import { useWidth } from './hooks'
import f from './figures.module.css'

/**
 * Key-idea figure, set in HTML so it reflows: cores = lanes of work (throughput),
 * RAM = places that hold requests (how many fit at once).
 */
export function CoresVsRam() {
  const used = 11
  return (
    <figure className={f.kv}>
      <div className={f.kvCol}>
        <p className={f.kvHead}>
          <b className={f.kvBlue}>4 jezgre</b> rade istodobno
        </p>
        <div className={f.lanes} aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div className={f.lane} key={i}>
              <span className={f.laneFill} style={{ animationDelay: `${-i * 0.55}s` }} />
              <span className={f.rider} style={{ animationDelay: `${-i * 0.55}s` }}>
                <i className={f.dot} />
              </span>
            </div>
          ))}
        </div>
        <p className={f.kvCap}>
          <span aria-hidden="true">→ </span>propusnost: koliko zahtjeva u sekundi završi
        </p>
      </div>
      <div className={f.kvCol}>
        <p className={f.kvHead}>
          <b className={f.kvYellow}>8 GB RAM-a</b> 16 mjesta po 0,5 GB
        </p>
        <div className={f.slots} aria-hidden="true">
          {Array.from({ length: 16 }, (_, i) => (
            <span key={i} className={i < used ? f.slotUsed : f.slotFree} />
          ))}
        </div>
        <p className={f.kvCap}>
          <span aria-hidden="true">→ </span>koliko zahtjeva istodobno stane ({used} od 16 zauzeto)
        </p>
      </div>
    </figure>
  )
}

/* ------------------------------------------------------------------------------------------- */

interface MenzaGeo {
  w: number
  h: number
  hall: string
  door: string
  doorLabel: { x: number; y: number; anchor: 'start' | 'end' | 'middle' }
  outside: { x: number; y: number }[]
  disc: { x: number; y: number; r: number }
  discLabel: { x: number; y: number; anchor: 'start' | 'end' | 'middle' }
  counters: {
    label: { x: number; y: number }
    places: { x: number; y: number }[]
    block: { x: number; y: number; w: number; h: number }
    cooks: { x: number; y: number }[]
    route: string
  }[]
}

const COOKS = [1, 2, 4]
const WAITING = [3, 2, 1]

function menzaGeo(narrow: boolean): MenzaGeo {
  if (!narrow) {
    const ys = [96, 214, 332]
    return {
      w: 780,
      h: 420,
      hall: 'M150 22H762V402H150V262M150 160V22',
      door: 'M150 160A51 51 0 0 0 150 262Z',
      doorLabel: { x: 108, y: 150, anchor: 'middle' },
      outside: [0, 1, 2, 3].map((i) => ({ x: 104 - i * 28, y: 211 })),
      disc: { x: 238, y: 211, r: 52 },
      discLabel: { x: 238, y: 300, anchor: 'middle' },
      counters: ys.map((y, i) => {
        const places = [0, 1, 2, 3].map((k) => ({ x: 404 + k * 36, y: y - 15 }))
        return {
          label: { x: 404, y: y - 30 },
          places,
          block: { x: 562, y: y - 34, w: 34, h: 68 },
          cooks: Array.from({ length: COOKS[i] }, (_, k) => ({ x: 628 + (k % 2) * 30, y: y + (COOKS[i] > 2 ? (k < 2 ? -15 : 15) : COOKS[i] === 2 ? (k ? 15 : -15) : 0) })),
          route: `M${238 + 54} 211 C 330 211, 340 ${y}, 396 ${y}`,
        }
      }),
    }
  }
  const ys = [262, 372, 482]
  return {
    w: 360,
    h: 560,
    hall: 'M10 78H128M232 78H350V548H10V78',
    door: 'M128 78A52 52 0 0 1 232 78Z',
    doorLabel: { x: 248, y: 40, anchor: 'start' },
    outside: [0, 1, 2, 3].map((i) => ({ x: 180 + (i - 1.5) * 26, y: 22 })),
    disc: { x: 180, y: 158, r: 44 },
    discLabel: { x: 124, y: 150, anchor: 'end' },
    counters: ys.map((y, i) => {
      const places = [0, 1, 2, 3].map((k) => ({ x: 34 + k * 34, y: y - 14 }))
      return {
        label: { x: 34, y: y - 30 },
        places,
        block: { x: 184, y: y - 32, w: 32, h: 64 },
        cooks: Array.from({ length: COOKS[i] }, (_, k) => ({ x: 244 + (k % 2) * 30, y: y + (COOKS[i] > 2 ? (k < 2 ? -15 : 15) : COOKS[i] === 2 ? (k ? 15 : -15) : 0) })),
        route: `M150 190 C 40 196, 18 214, 18 ${y - 16} Q 18 ${y} 30 ${y}`,
      }
    }),
  }
}

/** The canteen analogy, drawn in the same grammar as the simulation (plan view). */
export function Menza() {
  const reduced = useReducedMotion() ?? false
  const ref = useRef<HTMLDivElement>(null)
  const width = useWidth(ref, () => (typeof window === 'undefined' ? 900 : Math.min(window.innerWidth, 900)))
  const narrow = width < 520
  const g = useMemo(() => menzaGeo(narrow), [narrow])
  const id = narrow ? 'tk-menza-n' : 'tk-menza-w'
  const CYCLE = 4.5

  return (
    <figure className={f.menza} ref={ref}>
      <svg
        viewBox={`0 0 ${g.w} ${g.h}`}
        role="img"
        aria-label="Tlocrt menze: studenti ulaze na jedan ulaz, osoba na ulazu ih usmjerava prema tri pulta s jednom, dvije i četiri kuharice. Ispred svakog pulta su četiri mjesta za čekanje."
      >
        {/* walls and the entrance (the same pink half-disc "door" a Service is drawn with) */}
        <path d={g.hall} className={f.wall} />
        <g filter="url(#tk-ink)">
          <path d={g.door} className={`${f.fPink} ${f.over}`} />
        </g>
        <text x={g.doorLabel.x} y={g.doorLabel.y} textAnchor={g.doorLabel.anchor} className={f.label}>
          ulaz
        </text>
        {g.outside.map((p, i) => (
          <ReqDot key={i} x={p.x} y={p.y} r={10} />
        ))}

        {g.counters.map((c, i) => (
          <path key={i} id={`${id}-r${i}`} d={c.route} className={f.route} />
        ))}

        {g.counters.map((c, i) => (
          <g key={i}>
            <text x={c.label.x} y={c.label.y} className={f.label}>
              pult {i + 1} · {COOKS[i]} {COOKS[i] === 1 ? 'kuharica' : 'kuharice'}
            </text>
            {/* places to wait in front of the counter = RAM */}
            {c.places.map((p, k) => (
              <rect key={k} x={p.x} y={p.y} width="28" height="30" className={k >= 4 - WAITING[i] ? `${f.placeUsed} ${f.over}` : f.place} />
            ))}
            {c.places.slice(4 - WAITING[i]).map((p, k) => (
              <ReqDot key={k} x={p.x + 14} y={p.y + 15} r={9} />
            ))}
            {/* the counter = the server, cooks = cores */}
            <g filter="url(#tk-ink)">
              <rect x={c.block.x} y={c.block.y} width={c.block.w} height={c.block.h} rx="3" className={`${f.fBlue} ${f.over}`} />
              {c.cooks.map((k, j) => (
                <circle key={j} cx={k.x} cy={k.y} r="11" className={f.fInk} />
              ))}
            </g>
          </g>
        ))}

        {/* students walking to the counter they were sent to */}
        {!reduced &&
          g.counters.map((_, i) => (
            <g key={`walk${i}-${id}`} opacity="0">
              <animate
                attributeName="opacity"
                values="0;1;1;0;0"
                keyTimes={`0;${(i / 3).toFixed(3)};${((i + 0.92) / 3).toFixed(3)};${((i + 0.95) / 3).toFixed(3)};1`}
                dur={`${CYCLE}s`}
                repeatCount="indefinite"
                calcMode="discrete"
              />
              <animateMotion
                dur={`${CYCLE}s`}
                repeatCount="indefinite"
                keyPoints="0;0;1;1"
                keyTimes={`0;${(i / 3).toFixed(3)};${((i + 0.9) / 3).toFixed(3)};1`}
                calcMode="linear"
              >
                <mpath href={`#${id}-r${i}`} />
              </animateMotion>
              <ReqDot x={0} y={0} r={10} />
            </g>
          ))}

        {/* the person at the entrance = a small dispatcher */}
        <Disc x={g.disc.x} y={g.disc.y} r={g.disc.r} angle={0} id={`${id}-disc`} needleClass={narrow ? f.needleN : f.needleW} />
        {narrow ? (
          <text x={g.discLabel.x} y={g.discLabel.y} textAnchor={g.discLabel.anchor} className={f.label}>
            <tspan x={g.discLabel.x}>osoba</tspan>
            <tspan x={g.discLabel.x} dy="19">
              na ulazu
            </tspan>
          </text>
        ) : (
          <text x={g.discLabel.x} y={g.discLabel.y} textAnchor={g.discLabel.anchor} className={f.label}>
            osoba na ulazu
          </text>
        )}
      </svg>
      <ul className={f.key}>
        <li>
          <svg viewBox="-12 -12 24 24" width="22" height="22" aria-hidden="true">
            <ReqDot x={0} y={0} r={8} />
          </svg>
          student ≈ zahtjev
        </li>
        <li>
          <i className={f.keyPlace} aria-hidden="true" /> mjesto u redu ≈ RAM
        </li>
        <li>
          <i className={f.keyBlock} aria-hidden="true" /> pult ≈ poslužitelj
        </li>
        <li>
          <i className={f.keyCook} aria-hidden="true" /> kuharica ≈ jezgra
        </li>
      </ul>
    </figure>
  )
}

/* ------------------------------------------------------------------------------------------- */

/** Tiny cover glyphs for the contents page, drawn in the same grammar as the lectures. */
export function LessonThumb({ n, className }: { n: string; className?: string }) {
  return (
    <svg className={`${f.thumb} ${className ?? ''}`} viewBox="0 0 88 88" aria-hidden="true">
      <rect x="1" y="1" width="86" height="86" className={f.thumbSheet} />
      {n === '01' && (
        <g>
          <g filter="url(#tk-ink)">
            <Student x={22} y={72} ink="blue" s={0.82} />
          </g>
          <path d="M34 50L54 38" className={f.thumbRoute} />
          <rect x="52" y="24" width="28" height="12" fill="url(#tk-ht-blue)" />
          <rect x="52" y="24" width="28" height="12" className={f.thumbBar} />
          <rect x="52" y="40" width="28" height="12" className={`${f.fBlue} ${f.over}`} />
          <ReqDot x={42} y={45} r={5.5} />
        </g>
      )}
      {n === '02' && (
        <g>
          <g filter="url(#tk-ink)">
            <circle cx="26" cy="26" r="17" className={f.fYellow} />
          </g>
          <path d="M26 26V13M26 26V16" className={f.thumbHand} />
          {[0, 1, 2, 3, 4].map((i) => (
            <ReqDot key={i} x={46 + (i % 3) * 12} y={52 - Math.floor(i / 3) * 11} r={5} />
          ))}
          <rect x="12" y="62" width="66" height="16" className={`${f.fBlue} ${f.over}`} />
          <rect x="15" y="65" width="66" height="16" fill="url(#tk-hatch-pink)" className={f.over} />
        </g>
      )}
      {n === '03' && (
        <g>
          {/* vertical: one server grows (and hits a ceiling) · horizontal: more of the same */}
          <path d="M10 14H40" className={f.thumbCeil} />
          <rect x="14" y="30" width="22" height="46" className={`${f.fBlue} ${f.over}`} />
          <path d="M25 26V19M20.5 23.5 25 19l4.5 4.5" className={f.thumbArrow} />
          {[48, 61, 74].map((x) => (
            <g key={x}>
              <rect x={x} y="50" width="10" height="26" fill="url(#tk-ht-blue)" />
              <rect x={x} y="50" width="10" height="26" className={f.thumbBar} />
            </g>
          ))}
          <path d="M48 42h32M75 38l5 4-5 4" className={f.thumbArrow} />
        </g>
      )}
      {n === '05' && (
        <g>
          {/* state: three servers, one shared store */}
          {[18, 40, 62].map((y) => (
            <rect key={y} x="10" y={y - 6} width="24" height="12" className={`${f.fBlue} ${f.over}`} />
          ))}
          {[18, 40, 62].map((y) => (
            <path key={y} d={`M36 ${y}L54 44`} className={f.thumbRoute} />
          ))}
          <g className={f.thumbDb}>
            <ellipse cx="66" cy="32" rx="13" ry="5" />
            <path d="M53 32v22c0 2.8 5.8 5 13 5s13-2.2 13-5V32M53 43c0 2.8 5.8 5 13 5s13-2.2 13-5" />
          </g>
          <ReqDot x={66} y={72} r={5} />
        </g>
      )}
      {n === '04' && (
        <g>
          {[22, 44, 66].map((y) => (
            <path key={y} d={`M30 44L58 ${y}`} className={f.thumbRoute} />
          ))}
          {[16, 38, 60].map((y, i) => (
            <rect key={y} x="58" y={y} width="22" height="12" className={i === 1 ? `${f.fBlue} ${f.over}` : f.thumbBarFill} />
          ))}
          <Disc x={28} y={44} r={20} angle={-2} id="tk-thumb-04" />
        </g>
      )}
    </svg>
  )
}
