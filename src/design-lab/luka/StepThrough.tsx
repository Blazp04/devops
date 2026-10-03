/**
 * Step-through explainer: one request's round trip through the same terminal as the simulation.
 * Each step spotlights its part of the yard (everything else fades), draws the leg as a painted route and pins a
 * numbered marker that matches the step's placard. Every truck drives at one constant speed.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { iso, lerp, span, vbStr, type V2, type V3 } from './iso-math'
import { Truck } from './iso'
import { DispatchBoard, DockView, GateBeam, GatePost, LaneSignal, Pin, Plaza, YardApron, YardGround, YardPools, type BoardRow } from './yard'
import { CARGO, DOCK_LABEL, DOCK_LABEL_COMPACT, GATE_SIGN, gatePostDepth, PLAZA, PLAZA_SIGN, signalDepth, YARD_VB, YARD_VB_COMPACT, type DockState } from './yard-geo'
import { DOCKS, GATE_X, LANE, SPECS, STOP, TRUCK_K, type CrateView, type Status } from './sim-model'
import { COMPACT_QUERY, useMediaQuery, usePrefersReducedMotion } from './useLoop'
import l from './luka.module.css'
import s from './sim.module.css'
import st from './steps.module.css'

const STEPS = [
  {
    title: 'Zahtjev stiže na load balancer',
    text: 'Student dodirne „Naruči”. Mobitel šalje HTTP zahtjev na jednu javnu adresu, adresu load balancera. Izvana se ne vidi koliko poslužitelja stoji iza rampe.',
  },
  {
    title: 'Load balancer bira poslužitelj',
    text: 'Rampa gleda samo zdrave poslužitelje i uspoređuje njihove aktivne veze: Mali 2, Srednji 1, Veliki 3. Bira Srednji i odmah mu broji jednu vezu više.',
  },
  {
    title: 'Odgovor se vraća',
    text: 'Srednji obradi zahtjev i vrati odgovor istim putem, kroz rampu, do studenta. Veza se zatvara, pa Srednji opet ima samo jednu aktivnu vezu.',
  },
]

const V = 2.6 // world units per second, the same for every leg
const STOP_X = GATE_X + 0.3
const START_X = PLAZA.x1 - 0.3
const S = DOCKS[1]
const IN_END_X = S.ex - STOP
const LEG1 = (STOP_X - START_X) / V
const LEG2 = (IN_END_X - STOP_X) / V
const PICK = 0.8 // s the gate spends comparing before it sends the truck
const SLIDE_T = 0.45
const WORK = 1.0 // the crane finishes our request
const LEG3 = (IN_END_X - START_X) / V
const DUR = [LEG1, PICK + LEG2 + SLIDE_T, WORK + SLIDE_T + LEG3]

/** the painted route of each step (world points on the ground) and where its marker stands */
const ROUTES: { pts: V2[]; tone: 'in' | 'out'; marker: V3 }[] = [
  {
    pts: [
      [START_X, LANE],
      [GATE_X, LANE],
    ],
    tone: 'in',
    marker: [GATE_X - 0.35, 1.55, 0],
  },
  {
    pts: [
      [GATE_X, LANE],
      [IN_END_X, LANE],
    ],
    tone: 'in',
    marker: [1.0, 1.45, 0],
  },
  {
    pts: [
      [IN_END_X, -LANE],
      [START_X, -LANE],
    ],
    tone: 'out',
    marker: [2.5, -1.35, 0],
  },
]

/** how strongly each part of the yard shows in each step (1 = in focus) */
const FOCUS = [
  { plaza: 1, docks: [0.28, 0.28, 0.28], lanes: 0.35 },
  { plaza: 0.35, docks: [0.55, 1, 0.55], lanes: 1 },
  { plaza: 1, docks: [0.28, 1, 0.28], lanes: 0.35 },
]

/** elapsed seconds since `key` changed, capped at `limit` (rAF-driven; full value when motion is off) */
function useStepTime(key: number, limit: number, enabled: boolean): number {
  const [state, setState] = useState({ key, t: 0 })
  useEffect(() => {
    if (!enabled) return
    let raf = 0
    let t0 = 0
    const frame = (now: number) => {
      if (!t0) t0 = now
      const t = Math.min(limit, (now - t0) / 1000)
      setState({ key, t })
      if (t < limit) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [key, limit, enabled])
  if (!enabled) return limit
  return state.key === key ? state.t : 0
}

/* background load on the three docks: Mali 2 (1 working, 1 waiting), Srednji 1, Veliki 3 */
const BG: CrateView[][] = [
  [
    { id: 101, srv: 0, u: DOCKS[0].bays[0][0], v: DOCKS[0].bays[0][1], status: 'req', inBay: true },
    { id: 102, srv: 0, u: DOCKS[0].yard[0][0], v: DOCKS[0].yard[0][1], status: 'req', inBay: false },
  ],
  [{ id: 201, srv: 1, u: DOCKS[1].bays[0][0], v: DOCKS[1].bays[0][1], status: 'req', inBay: true }],
  [0, 1, 2].map((b) => ({ id: 301 + b, srv: 2, u: DOCKS[2].bays[b][0], v: DOCKS[2].bays[b][1], status: 'req' as Status, inBay: true })),
]
const BG_PROGRESS = [[0.55], [0.3, -1], [0.2, 0.7, 0.45, -1]]
const CONNS = [2, 1, 3]

function dockState(progress: number[]): DockState {
  return { up: true, healthy: true, progress, sinceCheck: 9, lastCheckOk: true, sinceReject: 9 }
}

function routeD(p: V2[]) {
  return p
    .map(([x, y], k) => {
      const [sx, sy] = iso(x, y, 0.01)
      return `${k ? 'L' : 'M'}${sx.toFixed(1)} ${sy.toFixed(1)}`
    })
    .join('')
}

function Arrow({ dir }: { dir: 'l' | 'r' }) {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path d={dir === 'l' ? 'M11 3 5 9l6 6' : 'm7 3 6 6-6 6'} fill="none" stroke="currentColor" strokeWidth="2.6" />
    </svg>
  )
}

export function StepThrough() {
  const reduce = usePrefersReducedMotion()
  const compact = useMediaQuery(COMPACT_QUERY)
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const t = useStepTime(step, DUR[step], !reduce)

  useEffect(() => {
    if (!playing) return
    const id = window.setTimeout(
      () => {
        if (step >= STEPS.length - 1) setPlaying(false)
        else setStep(step + 1)
      },
      (DUR[step] + 1.6) * 1000,
    )
    return () => window.clearTimeout(id)
  }, [playing, step])

  const play = () => {
    if (playing) {
      setPlaying(false)
      return
    }
    if (step >= STEPS.length - 1) setStep(0)
    setPlaying(true)
  }
  const go = (k: number) => {
    setPlaying(false)
    setStep(k)
  }

  /* ---- what the picture shows at time t of this step ---- */
  let truck: { x: number; y: number; dir: 'x+' | 'x-'; status: Status } | null = null
  const ours: CrateView[] = []
  let conns = [...CONNS]
  let flash = -1
  let scan = false
  const sProg = [...BG_PROGRESS[1]]
  const bay: V2 = S.bays[1]
  if (step === 0) {
    truck = { x: lerp(START_X, STOP_X, span(t, 0, LEG1)), y: LANE, dir: 'x+', status: 'req' }
  } else if (step === 1) {
    scan = t < PICK
    if (t >= PICK) {
      conns = [2, 2, 3]
      flash = t < PICK + 0.5 ? 1 : -1
    }
    const d = span(t, PICK, PICK + LEG2)
    if (t < PICK + LEG2) truck = { x: lerp(STOP_X, IN_END_X, d), y: LANE, dir: 'x+', status: 'req' }
    else {
      const k = span(t, PICK + LEG2, PICK + LEG2 + SLIDE_T)
      ours.push({ id: 1, srv: 1, u: lerp(S.uIn, bay[0], k), v: lerp(0.12, bay[1], k), status: 'req', inBay: k >= 1 })
      if (k >= 1) sProg[1] = 0.08
    }
  } else {
    const done = t >= WORK
    conns = done ? [2, 1, 3] : [2, 2, 3]
    if (!done) {
      sProg[1] = lerp(0.55, 1, span(t, 0, WORK))
      ours.push({ id: 1, srv: 1, u: bay[0], v: bay[1], status: 'req', inBay: true })
    } else if (t < WORK + SLIDE_T) {
      const k = span(t, WORK, WORK + SLIDE_T)
      ours.push({ id: 1, srv: 1, u: lerp(bay[0], S.uOut, k), v: lerp(bay[1], 0.12, k), status: 'ok', inBay: false })
    } else {
      truck = { x: lerp(IN_END_X, START_X, span(t, WORK + SLIDE_T, WORK + SLIDE_T + LEG3)), y: -LANE, dir: 'x-', status: 'ok' }
    }
  }
  const pick = step === 1 && t >= PICK
  const rows: BoardRow[] = [0, 1, 2].map((i) => ({
    name: SPECS[i].name,
    conns: conns[i],
    flash: pick && i === 1 && t < PICK + 0.9,
    next: step === 1 ? t >= PICK && i === 1 : false,
  }))
  const f = FOCUS[step]
  const route = ROUTES[step]

  const vb = compact ? YARD_VB_COMPACT : YARD_VB
  const actors: { depth: number; node: ReactNode }[] = [
    { depth: gatePostDepth('back'), node: <GatePost key="gb" side="back" /> },
    { depth: gatePostDepth('front') + 0.3, node: <GatePost key="gf" side="front" /> },
    ...[0, 1, 2].map((i) => ({
      depth: signalDepth(i),
      node: (
        <g key={`s${i}`} opacity={i === 1 ? f.docks[1] : f.lanes} className={s.dockG}>
          <LaneSignal i={i} lamp="ok" up={1} flash={flash === i} />
        </g>
      ),
    })),
  ]
  if (truck)
    actors.push({ depth: truck.x + truck.y, node: <Truck key="tr" x={truck.x} y={truck.y} dir={truck.dir} cargo={CARGO[truck.status]} scale={TRUCK_K} lights /> })
  actors.sort((a, b) => a.depth - b.depth)

  return (
    <div className={`${l.frame} ${l.machine}`}>
      <div className={l.frameBar}>
        <span className={l.frameTitle}>Korak po korak · najmanje aktivnih veza</span>
        <span className={l.frameNote}>3 koraka · usporeno</span>
      </div>
      <div className={st.art}>
        <div className={s.stage} style={{ aspectRatio: `${vb.w} / ${vb.h}` }}>
          <svg className={s.yardSvg} viewBox={vbStr(vb)} role="img" aria-label={`Korak ${step + 1}: ${STEPS[step].title}`}>
            <YardApron />
            <YardGround plaza={!compact} />
            <YardPools fades={[1, f.lanes, f.docks[0] * 0.5, f.docks[1], f.docks[2] * 0.5]} />
            {!compact && (
              <g opacity={f.plaza} className={s.dockG}>
                <Plaza />
              </g>
            )}
            <DockView i={0} st={dockState(BG_PROGRESS[0])} crates={BG[0]} t={0} fade={f.docks[0]} />
            <path className={st.routeCasing} d={routeD(route.pts)} />
            <path className={route.tone === 'in' ? st.routeIn : st.routeOut} d={routeD(route.pts)} />
            {actors.map((a) => a.node)}
            <GateBeam />
            <DockView i={1} st={dockState(sProg)} crates={[...BG[1], ...ours]} t={0} fade={f.docks[1]} />
            <DockView i={2} st={dockState(BG_PROGRESS[2])} crates={BG[2]} t={0} fade={f.docks[2]} />
          </svg>
          {!compact && (
            <Pin vb={vb} at={PLAZA_SIGN} className={`${s.dockLabel} ${s.dl_right} ${s.plazaLabel}`} style={{ opacity: f.plaza }}>
              <b>Studenti</b>
              <span>ispred menze Klopa</span>
            </Pin>
          )}
          {!compact && (
            <Pin vb={vb} at={GATE_SIGN} className={s.vmsPin}>
              <DispatchBoard algo="Najmanje veza" rows={rows} scan={scan} />
            </Pin>
          )}
          {[0, 1, 2].map((i) => (
            <Pin
              key={`lbl${i}`}
              vb={vb}
              at={(compact ? DOCK_LABEL_COMPACT : DOCK_LABEL)[i].at}
              className={`${s.dockLabel} ${s[`dl_${(compact ? DOCK_LABEL_COMPACT : DOCK_LABEL)[i].align}`]}`}
              style={{ opacity: Math.max(0.55, f.docks[i]) }}
            >
              <b>{SPECS[i].name}</b>
              <span>
                {conns[i]} {conns[i] === 1 ? 'aktivna veza' : 'aktivne veze'}
              </span>
            </Pin>
          ))}
          {ROUTES.map((r, k) => (
            <Pin key={`m${k}`} vb={vb} at={r.marker} className={st.marker} style={{ zIndex: k === step ? 3 : 1 }}>
              <button type="button" data-on={k === step ? '1' : undefined} data-done={k < step ? '1' : undefined} onClick={() => go(k)} aria-label={`Korak ${k + 1}: ${STEPS[k].title}`}>
                <span>{k + 1}</span>
              </button>
            </Pin>
          ))}
        </div>
        {compact && (
          <div className={s.vmsStrip}>
            <DispatchBoard algo="Najmanje veza" rows={rows} scan={scan} />
          </div>
        )}
      </div>
      <div className={st.deck}>
        <ol className={st.placards} style={{ ['--cols' as string]: STEPS.map((_, k) => (k === step ? '1.7fr' : '0.75fr')).join(' ') }}>
          {STEPS.map((p, k) => (
            <li key={k} className={st.placard} data-on={k === step ? '1' : undefined} data-done={k < step ? '1' : undefined}>
              <button type="button" className={st.placardBtn} onClick={() => go(k)} aria-current={k === step ? 'step' : undefined}>
                <span className={st.counter}>
                  Korak {k + 1} / {STEPS.length}
                  <i aria-hidden="true" />
                </span>
                <span className={st.title}>{p.title}</span>
              </button>
              {k === step && (
                <p className={st.text} aria-live="polite">
                  {p.text}
                </p>
              )}
            </li>
          ))}
        </ol>
        <div className={st.controls}>
          <button type="button" className={l.btn} onClick={() => go(Math.max(0, step - 1))} disabled={step === 0}>
            <Arrow dir="l" />
            Natrag
          </button>
          <button type="button" className={`${l.btn} ${l.btnYellow}`} onClick={play} aria-pressed={playing}>
            {playing ? (
              <svg viewBox="0 0 18 18" aria-hidden="true">
                <rect x="4" y="3" width="3.5" height="12" fill="currentColor" />
                <rect x="10.5" y="3" width="3.5" height="12" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 18 18" aria-hidden="true">
                <path d="M5 3v12l10-6z" fill="currentColor" />
              </svg>
            )}
            {playing ? 'Pauza' : 'Pokreni'}
          </button>
          <button type="button" className={l.btn} onClick={() => go(Math.min(STEPS.length - 1, step + 1))} disabled={step === STEPS.length - 1}>
            Dalje
            <Arrow dir="r" />
          </button>
        </div>
      </div>
    </div>
  )
}
