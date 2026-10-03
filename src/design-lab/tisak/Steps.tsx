import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Disc, ReqDot, Student } from './Glyphs'
import { polyLength, type Pt } from './geo'
import st from './steps.module.css'

const STEPS = [
  {
    title: 'Zahtjev stiže na load balancer',
    text: 'Student u Klopi pritisne „Rezerviraj ručak”. Preglednik ne zna koliko poslužitelja postoji: zna samo jednu adresu, a iza nje čeka load balancer.',
  },
  {
    title: 'Load balancer bira poslužitelj',
    text: 'Pravilo je „najmanje aktivnih veza”: Mali ima jednu, Veliki dvije, a Srednji nijednu. Zahtjev zato ide na Srednji, koji ga odmah počne obrađivati.',
  },
  {
    title: 'Odgovor se vraća',
    text: 'Srednji vrati odgovor istim putem, kroz load balancer, do studenta. Student vidi samo jednu adresu; koliko je poslužitelja iza nje, nikad ne sazna.',
  },
] as const

const NAMES = ['Mali', 'Srednji', 'Veliki'] as const
const CORES = [1, 2, 4]
const CONN_BEFORE = [1, 0, 2]
const PICK = 1
const SPEED = 170

/* scene geometry (each frame: 360 × 250) */
const STUDENT: Pt = { x: 46, y: 214 }
const EMIT: Pt = { x: 66, y: 176 }
const LB: Pt = { x: 168, y: 120 }
const R = 46
const SRV = [0, 1, 2].map((i) => {
  const top = [42, 102, 168][i]
  return {
    name: { x: 262, y: top - 8 },
    conn: { x: 262, y: top + CORES[i] * 13 + 11 },
    bars: Array.from({ length: CORES[i] }, (_, k) => ({ x: 262, y: top + k * 13, w: 86, h: 9 })),
    entry: { x: 250, y: top + (CORES[i] * 13 - 4) / 2 },
  }
})
const RIM_IN: Pt = { x: LB.x - R * 0.72, y: LB.y + R * 0.72 }

function along(pts: Pt[]) {
  const total = polyLength(pts)
  let acc = 0
  const times = pts.map((p, i) => {
    if (i > 0) acc += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y)
    return total ? acc / total : 0
  })
  return { x: pts.map((p) => p.x), y: pts.map((p) => p.y), times, duration: total / SPEED }
}

const PATHS: Pt[][] = [
  [EMIT, RIM_IN],
  [LB, SRV[PICK].entry],
  [SRV[PICK].entry, LB, EMIT],
]

function Scene({ i, active, reduced, cycle }: { i: number; active: boolean; reduced: boolean; cycle: number }) {
  const a = along(PATHS[i])
  const target = SRV[PICK].entry
  const toTarget = (Math.atan2(target.y - LB.y, target.x - LB.x) * 180) / Math.PI
  const angle = i === 0 ? -90 : toTarget
  const conns = CONN_BEFORE.map((n, k) => (k === PICK && i === 1 ? n + 1 : n))
  const still = !active || reduced
  const end = { x: a.x[a.x.length - 1], y: a.y[a.y.length - 1] }
  return (
    <svg className={st.scene} viewBox="0 0 360 250" aria-hidden="true">
      <line x1={EMIT.x} y1={EMIT.y} x2={LB.x} y2={LB.y} className={st.wire} />
      {SRV.map((s, k) => (
        <line key={k} x1={LB.x} y1={LB.y} x2={s.entry.x} y2={s.entry.y} className={k === PICK && i > 0 ? st.wireHot : st.wire} />
      ))}
      <g filter="url(#tk-ink)">
        <Student x={STUDENT.x} y={STUDENT.y} ink="pink" s={1.25} />
      </g>
      {SRV.map((s, k) => (
        <g key={k}>
          <text x={s.name.x} y={s.name.y} className={st.name}>
            {NAMES[k]}
          </text>
          <text x={s.conn.x} y={s.conn.y} className={k === PICK && i === 1 ? st.badgeHot : st.badge}>
            veze: {conns[k]}
          </text>
          {s.bars.map((b, j) => (
            <g key={j}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="url(#tk-ht-blue)" />
              <rect x={b.x} y={b.y} width={b.w} height={b.h} className={st.barEdge} />
            </g>
          ))}
        </g>
      ))}
      {/* Srednji works on it once it has arrived (frame 2), and is done in frame 3 */}
      {i >= 1 && (
        <motion.rect
          key={`work-${cycle}`}
          x={SRV[PICK].bars[0].x}
          y={SRV[PICK].bars[0].y}
          height={SRV[PICK].bars[0].h}
          className={`${st.fBlue} ${st.over}`}
          initial={still || i === 2 ? false : { width: 0 }}
          animate={{ width: SRV[PICK].bars[0].w }}
          transition={{ duration: 1.1, delay: a.duration, ease: 'linear' }}
        />
      )}

      {/* the request (frames 1–2) or the response (frame 3), moving at constant speed */}
      <motion.g
        key={`dot-${cycle}`}
        initial={still ? false : { x: a.x[0], y: a.y[0] }}
        animate={still ? { x: end.x, y: end.y } : { x: a.x, y: a.y }}
        transition={still ? { duration: 0 } : { duration: a.duration, times: a.times, ease: 'linear' }}
      >
        {i === 2 ? <circle r="8" className={st.okRing} /> : <ReqDot x={0} y={0} r={8} />}
      </motion.g>

      <Disc x={LB.x} y={LB.y} r={R} angle={angle} id={`tk-step-disc-${i}`} needleClass={st.needle} />
      {i === 2 && (
        <motion.circle
          key={`ok-${cycle}`}
          cx={STUDENT.x}
          cy={STUDENT.y - 44}
          r="17"
          className={st.okRing}
          initial={still ? false : { opacity: 0, scale: 1.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, delay: still ? 0 : a.duration }}
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        />
      )}
      <text x="8" y="92" className={st.addr}>
        klopa.example
      </text>
    </svg>
  )
}

export function Steps() {
  const reduced = useReducedMotion() ?? false
  const [step, setStep] = useState(0)
  const [cycle, setCycle] = useState(0)
  const [playing, setPlaying] = useState(false)
  const stripRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    if (!playing) return
    const t = window.setTimeout(() => {
      if (step >= STEPS.length - 1) setPlaying(false)
      else {
        setStep(step + 1)
        setCycle((c) => c + 1)
      }
    }, 3600)
    return () => window.clearTimeout(t)
  }, [playing, step])

  // On phones the frames sit in a horizontal strip: keep the current frame in view.
  useEffect(() => {
    const el = stripRef.current
    if (!el || el.scrollWidth <= el.clientWidth + 2) return
    const panel = el.children[step] as HTMLElement | undefined
    if (!panel) return
    el.scrollTo({ left: panel.offsetLeft - el.offsetLeft - 2, behavior: reduced ? 'auto' : 'smooth' })
  }, [step, reduced])

  const go = (n: number) => {
    setPlaying(false)
    setStep(Math.max(0, Math.min(STEPS.length - 1, n)))
    setCycle((c) => c + 1)
  }
  const play = () => {
    if (playing) {
      setPlaying(false)
      return
    }
    if (step >= STEPS.length - 1) setStep(0)
    setCycle((c) => c + 1)
    setPlaying(true)
  }
  const onScrollEnd = () => {
    const el = stripRef.current
    if (!el || el.scrollWidth <= el.clientWidth + 2) return
    const w = (el.children[0] as HTMLElement | undefined)?.offsetWidth ?? 1
    const n = Math.round(el.scrollLeft / (w + 14))
    if (n !== step && n >= 0 && n < STEPS.length) {
      setStep(n)
      setCycle((c) => c + 1)
    }
  }

  return (
    <div className={st.wrap}>
      <div className={st.bar}>
        <p className={st.counter} aria-live="polite">
          Korak <b>{step + 1}</b> / {STEPS.length}
        </p>
        <div className={st.controls}>
          <button type="button" className={st.btn} onClick={() => go(step - 1)} disabled={step === 0}>
            <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true">
              <path d="M21 7H3M8 1L2 7l6 6" />
            </svg>
            Natrag
          </button>
          <button type="button" className={`${st.btn} ${st.btnMain}`} onClick={() => go(step + 1)} disabled={step === STEPS.length - 1}>
            Dalje
            <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true">
              <path d="M1 7h18M14 1l6 6-6 6" />
            </svg>
          </button>
          <button type="button" className={st.btnPlay} onClick={play} aria-pressed={playing}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              {playing ? <path d="M2 1h3.5v12H2zM8.5 1H12v12H8.5z" /> : <path d="M2 1l11 6-11 6z" />}
            </svg>
            {playing ? 'Pauza' : 'Reproduciraj'}
          </button>
        </div>
      </div>

      <ol className={st.strip} ref={stripRef} onScrollEnd={onScrollEnd} aria-label="Strip: put jednog zahtjeva">
        {STEPS.map((s, i) => {
          const state = i < step ? 'past' : i === step ? 'now' : 'next'
          return (
            <li key={i} className={st.panel} data-state={state} aria-current={i === step ? 'step' : undefined}>
              <button type="button" className={st.panelHead} onClick={() => go(i)}>
                <span className={st.panelN} data-n={i + 1} aria-hidden="true">
                  {i + 1}
                </span>
                <span className={st.panelTitle}>
                  <span className={st.srOnly}>Korak {i + 1}: </span>
                  {s.title}
                </span>
              </button>
              <div className={st.sceneBox}>
                <Scene i={i} active={i === step} reduced={reduced} cycle={cycle} />
                {state === 'next' && <span className={st.proof}>probni otisak</span>}
              </div>
              <p className={st.panelText}>{s.text}</p>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
