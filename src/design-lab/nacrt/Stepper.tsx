import { useEffect, useId, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Defs, Person, Rotary } from './Draw'
import { route, safeId, type Pt, type Route } from './geom'
import s from './nacrt.module.css'
import t from './stepper.module.css'

/* One small scene, drawn three times — like the numbered details of one assembly on a sheet. */
const YS = [44, 104, 164]
const NAMES = ['Mali', 'Srednji', 'Veliki']
const CONNS = [2, 0, 1]
const LB: Pt = [150, 104]
const BUS = 214
const BOX_X = 250

const toLb = route([[60, 104], [LB[0] - 26, 104]])
const toSrv = route([LB, [BUS, 104], [BOX_X, 104]])
const back = route([[BOX_X, 114], [62, 114]])

const STEPS = [
  {
    title: 'Zahtjev stiže na load balancer',
    text: 'Student otvori jelovnik. Aplikacija šalje zahtjev na jednu javnu adresu, a na njoj čeka load balancer. Student ne zna, i ne treba znati, koliko poslužitelja stoji iza nje.',
  },
  {
    title: 'Load balancer bira poslužitelj',
    text: 'Load balancer broji otvorene veze: Mali 2, Srednji 0, Veliki 1. Uz pravilo „najmanje aktivnih veza” bira Srednji i prosljeđuje mu zahtjev.',
  },
  {
    title: 'Odgovor se vraća',
    text: 'Srednji obradi zahtjev i vrati odgovor istim putem, preko load balancera do studenta. Tek tada load balancer zatvara vezu i Srednjem vraća brojač na 0.',
  },
]

const DUR = [1.1, 1.0, 1.7]

function keyframes(r: Route, dur: number) {
  return {
    animate: { x: r.pts.map((p) => p[0]), y: r.pts.map((p) => p[1]) },
    transition: { duration: dur, ease: 'linear' as const, times: r.cum.map((c) => c / r.len), repeat: Infinity, repeatDelay: 0.9 },
  }
}

function Detail({ k, active, uid }: { k: number; active: boolean; uid: string }) {
  const reduced = useReducedMotion() ?? false
  const conns = CONNS.map((c, i) => (i === 1 && k === 1 ? 1 : c))
  const angle = k === 0 ? -48 : 0
  const r = k === 0 ? toLb : k === 1 ? toSrv : back
  const end = r.pts[r.pts.length - 1]
  const dot = keyframes(r, DUR[k])
  return (
    <svg viewBox="0 0 340 200" className={s.svg} role="img" aria-label={`Detalj ${k + 1}: ${STEPS[k].title}`}>
      <Defs uid={uid} />
      <path d={toLb.d} className={k === 0 ? s.pipeHot : s.pipe} />
      <path d={`M${LB[0] + 26},104 H${BUS} M${BUS},${YS[0]} V${YS[2]}`} className={s.pipe} />
      {YS.map((y, i) => (
        <path key={i} d={`M${BUS},${y} H${BOX_X}`} className={k === 1 && i === 1 ? s.pipeHot : s.pipe} />
      ))}
      <path d={back.d} className={k === 2 ? s.pipeHotBack : s.pipeBack} />
      <Person x={34} y={122} k={0.95} />
      <text x={34} y={143} textAnchor="middle" className={s.partTiny} style={{ fontSize: 12 }}>
        STUDENT
      </text>
      {YS.map((y, i) => {
        const hot = k >= 1 && i === 1
        return (
          <g key={i}>
            <rect x={BOX_X} y={y - 19} width={84} height={38} className={hot ? s.boxHot : s.boxLine} />
            <text x={BOX_X + 7} y={y - 3} className={s.partSmallStrong} style={{ fontSize: 15 }}>
              {NAMES[i].toUpperCase()}
            </text>
            <text x={BOX_X + 7} y={y + 13} className={k === 1 && i === 1 ? s.lblPencil : s.lblMuted} style={{ fontSize: 12.5 }}>
              veze: {conns[i]}
            </text>
          </g>
        )
      })}
      {k === 0 && <circle cx={LB[0]} cy={LB[1]} r={35} className={s.ringHot} />}
      <Rotary cx={LB[0]} cy={LB[1]} r={26} angle={angle} label="LOAD BALANCER" labelSize={14} />
      {k === 0 && (
        <g className={s.leadP}>
          <path d="M92,104 V46" className={s.thin} />
          <circle cx={92} cy={104} r={2} className={s.planHead} />
          <text x={40} y={40} className={s.lblPencil} style={{ fontSize: 12.5 }}>
            GET /jelovnik
          </text>
        </g>
      )}
      {k === 1 && (
        <g className={s.leadP}>
          <path d={`M${LB[0]},${LB[1] + 30} V170 H140`} className={s.thin} />
          <text x={64} y={186} className={s.lblPencil} style={{ fontSize: 12.5 }}>
            min(2, 0, 1) → Srednji
          </text>
        </g>
      )}
      {k === 2 && (
        <g className={s.leadP}>
          <path d="M70,114 V150 H78" className={s.thin} />
          <text x={80} y={154} className={s.lblPencil} style={{ fontSize: 12.5 }}>
            200 OK · 84 ms
          </text>
        </g>
      )}
      {active && !reduced ? (
        <motion.g key={`dot-${k}`} initial={{ x: r.pts[0][0], y: r.pts[0][1] }} animate={dot.animate} transition={dot.transition}>
          <use href={`#${uid}-${k === 2 ? 'res' : 'req'}`} className={k === 2 ? s.dotRes : s.dotReq} />
        </motion.g>
      ) : (
        <use href={`#${uid}-${k === 2 ? 'res' : 'req'}`} x={end[0] - (k === 2 ? -6 : 8)} y={end[1]} className={k === 2 ? s.dotRes : s.dotReq} />
      )}
    </svg>
  )
}

export function Stepper() {
  const uid = safeId(useId())
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (!playing) return
    const id = window.setTimeout(() => {
      if (step < STEPS.length - 1) setStep(step + 1)
      else setPlaying(false)
    }, 3800)
    return () => window.clearTimeout(id)
  }, [playing, step])

  const play = () => {
    if (playing) return setPlaying(false)
    if (step === STEPS.length - 1) setStep(0)
    setPlaying(true)
  }
  const cols = STEPS.map((_, i) => (i === step ? '1.6fr' : '1fr')).join(' ')

  return (
    <div className={t.sheet}>
      <div className={t.head}>
        <span className={t.headL}>Slijed · put jednog zahtjeva · detalji 1–3</span>
        <span className={t.count} aria-live="polite">
          Korak {step + 1} / {STEPS.length}
        </span>
        <span className={t.ctrls}>
          <button type="button" className={s.btnSmall} onClick={() => setStep((v) => Math.max(0, v - 1))} disabled={step === 0}>
            ‹ Natrag
          </button>
          <button type="button" className={s.btnSmall} onClick={play} aria-pressed={playing}>
            {playing ? 'Pauza' : 'Pokreni'}
          </button>
          <button
            type="button"
            className={s.btnSmall}
            onClick={() => setStep((v) => Math.min(STEPS.length - 1, v + 1))}
            disabled={step === STEPS.length - 1}
          >
            Dalje ›
          </button>
        </span>
      </div>
      <ol className={t.details} style={{ gridTemplateColumns: cols }}>
        {STEPS.map((st, i) => (
          <li key={i} className={t.detail} data-active={i === step}>
            <div className={t.fig} onClick={() => setStep(i)} aria-hidden={i !== step}>
              <Detail k={i} active={i === step} uid={`${uid}${i}`} />
              <span className={t.scale}>{i === step ? 'DETALJ ' + (i + 1) + ' · MJ\u00a02:1' : 'DETALJ ' + (i + 1)}</span>
            </div>
            <button type="button" className={t.noteHead} onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined}>
              <span className={t.bal}>{i + 1}</span>
              <span>{st.title}</span>
            </button>
            <p className={t.noteText}>{st.text}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}
