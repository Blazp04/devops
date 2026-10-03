import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useReducedMotion } from 'motion/react'
import { Defs, Dim, Person, Rotary, Valve } from './Draw'
import { hr, roughEllipse, roughLine, safeId } from './geom'
import {
  BOOT_MS,
  CPU_MS,
  HC_EVERY,
  HC_FAILS,
  IO_MS,
  QUEUE_MAX,
  STEP_MS,
  crash,
  repair,
  snapshot,
  step,
  warmSim,
  type Algo,
  type Params,
  type Sim,
  type Snap,
  type SrvView,
} from './lbModel'
import { RATE_MAX, RATE_MIN, rateX, tallLayout, wideLayout, type Box, type Layout } from './simLayout'
import { ErrorTally, P95Gauge, ShareDims, StripRecorder } from './Instruments'
import { useOnScreen, useWidth } from './useWidth'
import s from './nacrt.module.css'
import m from './sim.module.css'

const INIT_LAMBDA = 10
const INIT_ALGO: Algo = 'rr'
const VELIKI = 2
/** below this drawing width the flow turns top-to-bottom and is drawn 1 unit = 1 px */
const TALL_BELOW = 860

const pct = (v: number, of: number) => `${(v / of) * 100}%`

export function LbSim() {
  const reduced = useReducedMotion() ?? false
  const [lambda, setLambda] = useState(INIT_LAMBDA)
  const [algo, setAlgo] = useState<Algo>(INIT_ALGO)
  const [running, setRunning] = useState(!reduced)
  const [wrapRef, width] = useWidth<HTMLDivElement>((vw) => (vw < 900 ? vw - 40 : 1240))
  const [screenRef, onScreen] = useOnScreen<HTMLDivElement>()
  const tallW = width < TALL_BELOW ? Math.max(300, Math.round(width / 10) * 10) : 0
  const geo = useMemo(() => (tallW ? tallLayout(tallW) : wideLayout()), [tallW])
  const uid = safeId(useId())
  const simRef = useRef<Sim | null>(null)
  const params = useRef<Params>({ lambda: INIT_LAMBDA, algo: INIT_ALGO })
  const [snap, setSnap] = useState<Snap | null>(null)
  // the drawing opens on a system that has been running for 30 s, so nothing starts empty
  const initial = useMemo(() => snapshot(warmSim(INIT_ALGO, INIT_LAMBDA, geo), geo), [geo])

  useEffect(() => {
    params.current = { lambda, algo }
  }, [lambda, algo])

  useEffect(() => {
    if (!running || !onScreen) return
    if (!simRef.current) simRef.current = warmSim(INIT_ALGO, INIT_LAMBDA, geo)
    const sim = simRef.current
    let raf = 0
    let last = performance.now()
    let acc = 0
    const tick = (ts: number) => {
      acc += Math.min(100, ts - last)
      last = ts
      while (acc >= STEP_MS) {
        step(sim, params.current, geo)
        acc -= STEP_MS
      }
      setSnap(snapshot(sim, geo))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [geo, running, onScreen])

  const view = snap ?? initial

  const act = (fn: (sim: Sim) => void) => {
    if (!simRef.current) simRef.current = warmSim(INIT_ALGO, INIT_LAMBDA, geo)
    fn(simRef.current)
    setSnap(snapshot(simRef.current, geo))
  }
  const reset = () => {
    simRef.current = warmSim(algo, lambda, geo)
    setSnap(snapshot(simRef.current, geo))
  }
  const pickAlgo = (a: Algo) => {
    setAlgo(a)
    params.current = { lambda, algo: a }
    if (!running) act((sim) => step(sim, params.current, geo))
  }

  const crashedIdx = view.servers.findIndex((v) => v.proc === 'down')
  const detecting = crashedIdx >= 0 && view.servers[crashedIdx].healthy
  const crashed = crashedIdx >= 0 ? view.servers[crashedIdx] : null
  const now = { thr: view.thr, err: view.err, lam: lambda }
  // who the switch will pick next: the round-robin pointer, or the fewest open connections
  const pick = useMemo(() => {
    if (algo === 'rr') return view.next
    let best = -1
    view.servers.forEach((v, i) => {
      if (v.healthy && (best < 0 || v.active < view.servers[best].active)) best = i
    })
    return best
  }, [algo, view])

  const handNote = crashed
    ? detecting
      ? algo === 'lc'
        ? `${crashed.name} „prazan” (0 veza) → dobiva još više → 502!`
        : `LB još ne zna da je ${crashed.name} pao${crashed.fails ? ` (HC ${crashed.fails}/${HC_FAILS})` : ''} → 502`
      : `${crashed.name} isključen: promet ide ostalima.`
    : null

  const notes = (
    <>
      <p className={m.noteGen}>
        <b>HC</b> = provjera zdravlja svake {HC_EVERY / 1000} s · {HC_FAILS} neuspjele → isključen · otkrivanje ≈ <b>2 s (sim)</b> · stvarno
        npr. 30 s
      </p>
      {handNote && <p className={m.noteHand}>{handNote}</p>}
    </>
  )

  return (
    <div className={s.simSheet} ref={screenRef}>
      <div className={m.simHead}>
        <span className={m.simHeadL}>
          Detalj A · raspodjela prometa · <span className={s.nowrap}>MJ 1:1</span>
        </span>
        <span className={m.simClock}>
          t = {hr(view.t / 1000, 1)} s <span className={s.dimNote}>(sim)</span>
        </span>
        <span className={m.simHeadBtns}>
          <button type="button" className={s.btnSmall} onClick={() => setRunning((r) => !r)} aria-pressed={!running}>
            {running ? 'Pauza' : 'Pokreni'}
          </button>
          <button type="button" className={s.btnSmall} onClick={reset}>
            Ponovo
          </button>
        </span>
      </div>

      <div className={m.stage} ref={wrapRef} data-tall={geo.tall}>
        <svg
          viewBox={`0 0 ${geo.W} ${geo.H}`}
          className={s.svg}
          role="img"
          aria-label={`Studenti šalju ${lambda} zahtjeva u sekundi. Load balancer (${algo === 'rr' ? 'kružno' : 'najmanje aktivnih veza'}) ih dijeli na tri poslužitelja: Mali, Srednji i Veliki.`}
        >
          <Defs uid={uid} />
          <RateRuler geo={geo} lambda={lambda} />
          {!geo.tall && (
            <g className={s.leadP}>
              <path d={`M236,146 V236`} className={s.thin} />
              <circle cx={236} cy={240} r={2.6} className={s.planHead} />
              <text x={243} y={196} className={s.lblPencil} style={{ fontSize: 15 }}>
                λ
              </text>
            </g>
          )}

          {/* forward pipes solid, return lanes dotted; a branch out of rotation becomes a chain line */}
          <path d={geo.inRoute.d} className={s.pipe} />
          {geo.out.map((r, i) => (
            <path key={i} d={r.d} className={view.servers[i].healthy ? s.pipe : m.pipeIdle} />
          ))}
          {geo.backLanes.map((d, i) => (
            <path key={i} d={d} className={s.pipeBack} />
          ))}
          <path d={geo.backMain} className={s.pipeBack} />

          <Source geo={geo} ok={view.okClient} err={view.errClient} />

          {view.servers.map((v, i) =>
            geo.tall ? (
              <ServerTall key={v.name} v={v} b={geo.boxes[i]} uid={uid} isNext={algo === 'rr' && pick === i} />
            ) : (
              <ServerWide key={v.name} v={v} b={geo.boxes[i]} uid={uid} />
            ),
          )}
          {view.servers.map((v, i) => (
            <Branch key={v.name} geo={geo} i={i} v={v} />
          ))}

          {view.dots.map((d) =>
            d.k === 'req' ? (
              <use key={d.id} href={`#${uid}-req`} x={d.x} y={d.y} className={s.dotReq} />
            ) : (
              <use key={d.id} href={`#${uid}-${geo.tall ? 'resU' : 'resL'}`} x={d.x} y={d.y} className={s.dotRes} />
            ),
          )}

          <Housing geo={geo} view={view} pick={pick} algo={algo} uid={uid} />

          {view.marks.map((mk) => (
            <use key={mk.id} href={`#${uid}-err`} x={mk.x} y={mk.y} className={s.dotErr} style={{ opacity: Math.max(0, 1 - mk.a) }} />
          ))}
          {crashed && <NoteRing geo={geo} i={crashedIdx} />}
        </svg>

        {/* controls live on the drawing */}
        <div
          className={m.rate}
          style={{
            left: `calc(${pct(rateX(geo, RATE_MIN), geo.W)} - 8px)`,
            width: `calc(${pct(rateX(geo, RATE_MAX) - rateX(geo, RATE_MIN), geo.W)} + 16px)`,
            top: pct(geo.ruler.y - 34, geo.H),
            height: pct(56, geo.H),
          }}
        >
          <input
            type="range"
            min={RATE_MIN}
            max={RATE_MAX}
            step={1}
            value={lambda}
            aria-label="Promet: zahtjeva u sekundi"
            aria-valuetext={`${lambda} zahtjeva u sekundi`}
            onChange={(e) => setLambda(Number(e.target.value))}
            className={m.rateInput}
          />
        </div>

        <AlgoSwitch geo={geo} algo={algo} onPick={pickAlgo} />

        {geo.tabs.map((b, i) => {
          const v = view.servers[i]
          const st = v.proc
          const label = st === 'up' ? 'Sruši' : st === 'down' ? 'Popravi' : 'Diže se'
          const aria =
            st === 'up'
              ? i === VELIKI
                ? 'Sruši poslužitelj Veliki'
                : `Sruši ${v.name}`
              : st === 'down'
                ? `Popravi ${v.name}`
                : `${v.name} se ponovno pokreće`
          return (
            <button
              key={v.name}
              type="button"
              className={m.tab}
              data-state={st}
              data-tall={geo.tall}
              disabled={st === 'boot'}
              aria-label={aria}
              style={{ left: pct(b.x, geo.W), top: pct(b.y, geo.H), width: pct(b.w, geo.W), height: pct(b.h, geo.H) }}
              onClick={() => act((sim) => (st === 'up' ? crash(sim, i) : repair(sim, i)))}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="8" cy="8" r="6.5" />
                {st === 'down' ? <path d="M4.6,8.6 A3.6,3.6 0 1 0 6,5 M6,2.6 V5.2 H3.4" /> : <path d="M5.2,5.2 L10.8,10.8 M10.8,5.2 L5.2,10.8" />}
              </svg>
              <span>{label}</span>
            </button>
          )
        })}

        {geo.notes && (
          <div
            className={m.notes}
            style={{ left: pct(geo.notes.x, geo.W), top: pct(geo.notes.y, geo.H), width: pct(geo.notes.w, geo.W) }}
          >
            {notes}
          </div>
        )}
      </div>
      {!geo.notes && <div className={m.notesTall}>{notes}</div>}

      <div className={m.panel}>
        <section className={m.cell} data-area="strip" aria-label="Zapisnik prometa">
          <h3 className={m.cellHead}>Zapisnik · 30 s</h3>
          <StripRecorder series={view.series} t={view.t} now={now} />
        </section>
        <section className={m.cell} data-area="p95" aria-label="p95 odziva">
          <h3 className={m.cellHead}>p95 odziva · zadnjih 5 s</h3>
          <P95Gauge p95={view.p95} />
        </section>
        <section className={m.cell} data-area="tally" aria-label="Greške">
          <h3 className={m.cellHead}>
            Greške · 5 s <b className={view.errRecent ? m.cellBad : undefined}>{view.errRecent}</b>
          </h3>
          <ErrorTally n={view.errRecent} />
        </section>
        <section className={m.cell} data-area="share" aria-label="Udio prometa">
          <h3 className={m.cellHead}>Udio prometa · zadnjih 5 s</h3>
          <ShareDims share={view.share} servers={view.servers} />
        </section>
      </div>

      <div className={s.revTable}>
        <div className={s.revTableHead}>
          <span>Rev.</span>
          <span>t (sim)</span>
          <span>Opis izmjene</span>
        </div>
        <ol>
          {view.revs.map((r) => (
            <li key={r.id} data-tone={r.tone}>
              <svg viewBox="0 0 24 22" aria-hidden="true">
                <path d="M12,2 L22,20 L2,20 Z" />
                <text x="12" y="17.5" textAnchor="middle">
                  {r.letter}
                </text>
              </svg>
              <span className={s.revT}>{hr(r.t / 1000, 1)} s</span>
              <span>{r.text}</span>
            </li>
          ))}
        </ol>
      </div>
      <p className={s.simFoot}>
        Model: zahtjev treba {hr(CPU_MS * 0.7)}–{hr(CPU_MS * 1.3)} ms procesora (prosječno {CPU_MS} ms) i {IO_MS} ms čekanja na bazu.
        Svaka jezgra radi na jednom zahtjevu odjednom, a svaki zahtjev u obradi drži 256 MB RAM-a. Red po poslužitelju ima{' '}
        {QUEUE_MAX} mjesta, nakon toga 503. Load balancer broji veze koje je sam otvorio i na koje još nije dobio odgovor; svi su
        njegovi izlazi jednako dugi, pa put do poslužitelja nijednom ne daje prednost. Ponovno pokretanje traje {hr(BOOT_MS / 1000, 1)} s
        (sim).
      </p>
      <p className={s.srOnly} aria-live="polite">
        {view.revs[0]?.text}
      </p>
    </div>
  )
}

/** The "Promet" control drawn as a scale rule: ticks, capacity mark and a pencil pointer. The real <input> lies on top. */
function RateRuler({ geo, lambda }: { geo: Layout; lambda: number }) {
  const { x0, x1, y } = geo.ruler
  const ticks = Array.from({ length: RATE_MAX + 1 }, (_, v) => v)
  const px = rateX(geo, lambda)
  const cap = rateX(geo, 35)
  const big = geo.tall ? 38 : 46
  return (
    <g>
      <text x={geo.caption[0]} y={geo.caption[1]} className={m.caption}>
        PROMET · λ
      </text>
      <text x={geo.readout[0]} y={geo.readout[1]} className={m.readout} style={{ fontSize: big }}>
        {lambda}
        <tspan className={m.readoutUnit} dx={6}>
          zahtjeva/s
        </tspan>
      </text>
      <path d={`M${x0},${y} H${x1}`} className={s.pipe} />
      <path
        d={ticks.map((v) => `M${rateX(geo, v)},${y} V${y - (v % 10 === 0 ? 13 : v % 5 === 0 ? 9 : 5)}`).join(' ')}
        className={s.thin}
      />
      {[0, 10, 20, 30, 40].map((v) => (
        <text key={v} x={rateX(geo, v)} y={y + 17} textAnchor="middle" className={s.lblMuted} style={{ fontSize: 13 }}>
          {v}
        </text>
      ))}
      <path d={`M${cap},${y - (geo.tall ? 22 : 30)} V${y + 4}`} className={m.capMark} />
      {geo.tall ? (
        <text x={geo.capLabel.at[0]} y={geo.capLabel.at[1]} textAnchor={geo.capLabel.anchor} className={s.redTxt} style={{ fontSize: 12.5 }}>
          kapacitet ≈ 35 ↑
        </text>
      ) : (
        <>
          <text x={cap + 6} y={y - 22} className={s.redTxt} style={{ fontSize: 12.5 }}>
            kapacitet
          </text>
          <text x={cap + 6} y={y - 8} className={s.redTxt} style={{ fontSize: 12.5 }}>
            ≈ 35
          </text>
        </>
      )}
      <g style={{ transform: `translateX(${px}px)`, transition: 'transform 0.12s linear' }}>
        <path d={`M-8,${y - 22} H8 L0,${y - 3} Z`} className={m.pointer} />
      </g>
    </g>
  )
}

/** Two-position selector switch. Wide: a row under the distributor's inlet; tall: a stacked plate in the top-right corner. */
function AlgoSwitch({ geo, algo, onPick }: { geo: Layout; algo: Algo; onPick: (a: Algo) => void }) {
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault()
      const next = algo === 'rr' ? 'lc' : 'rr'
      onPick(next)
      e.currentTarget.closest('[role="radiogroup"]')?.querySelector<HTMLButtonElement>(`[data-algo="${next}"]`)?.focus()
    }
  }
  const opt = (a: Algo, label: string) => (
    <button
      type="button"
      role="radio"
      data-algo={a}
      aria-checked={algo === a}
      tabIndex={algo === a ? 0 : -1}
      className={m.algoOpt}
      onClick={() => onPick(a)}
      onKeyDown={onKey}
    >
      {label}
    </button>
  )
  const knob = (
    <span className={m.knob} data-algo={algo} aria-hidden="true" onClick={() => onPick(algo === 'rr' ? 'lc' : 'rr')}>
      <i />
    </span>
  )
  if (geo.tall)
    return (
      <div className={m.algoStack} style={{ right: geo.W - geo.selector[0], top: geo.selector[1] }} role="radiogroup" aria-label="Algoritam load balancera">
        <span className={m.algoCap} aria-hidden="true">
          Algoritam
        </span>
        {knob}
        <span className={m.algoOpts}>
          {opt('rr', 'Kružno')}
          {opt('lc', 'Najmanje veza')}
        </span>
      </div>
    )
  return (
    <div className={m.algo} style={{ left: pct(geo.selector[0], geo.W), top: pct(geo.selector[1], geo.H) }} role="radiogroup" aria-label="Algoritam load balancera">
      {opt('rr', 'Kružno')}
      {knob}
      {opt('lc', 'Najmanje veza')}
    </div>
  )
}

function Source({ geo, ok, err }: { geo: Layout; ok: number; err: number }) {
  const { at, anchor } = geo.tally
  return (
    <g>
      {geo.people.map(([x, y], i) => (
        <Person key={i} x={x} y={y} />
      ))}
      <path
        d={geo.tall ? `M${geo.port[0]},${geo.port[1] - 8} V${geo.port[1]}` : `M${geo.port[0] - 14},${geo.port[1]} H${geo.port[0]}`}
        className={s.pipe}
      />
      <text x={geo.studentsLabel[0]} y={geo.studentsLabel[1]} className={s.partSmallStrong} style={{ fontSize: geo.tall ? 16 : 18 }}>
        STUDENTI
      </text>
      <text x={at[0]} y={at[1]} textAnchor={anchor} className={s.lblPencil} style={{ fontSize: 14 }}>
        ✓ {ok} odgovora
      </text>
      <text x={at[0]} y={at[1] + 19} textAnchor={anchor} className={s.redTxt} style={{ fontSize: 14 }}>
        ✗ {err} grešaka
      </text>
    </g>
  )
}

/**
 * The load balancer as a distributor housing (section view: hatched walls), a rotary selector inside,
 * and on every outlet a counter window with the connections it holds open to that server.
 * Requests disappear into the housing and come out of the chosen port; the pencil triangle marks the next pick.
 */
function Housing({ geo, view, pick, algo, uid }: { geo: Layout; view: Snap; pick: number; algo: Algo; uid: string }) {
  const h = geo.housing
  const fresh = view.targetAge < 260
  const lbl = geo.lbLabel
  return (
    <g>
      <rect x={h.x} y={h.y} width={h.w} height={h.h} className={m.housingBase} />
      <rect x={h.x} y={h.y} width={h.w} height={h.h} fill={`url(#${uid}-hl)`} className={m.housingWall} />
      {/* passages bored through the solid body: drawn as a double line (wall edge, then the open bore) */}
      {[geo.inlet, ...geo.channels].map((d, i) => (
        <path key={`e${i}`} d={d} className={m.boreEdge} />
      ))}
      {[geo.inlet, ...geo.channels].map((d, i) => (
        <path key={`o${i}`} d={d} className={m.boreOpen} />
      ))}
      {fresh && <path d={geo.channels[view.target]} className={m.channelHot} />}
      <circle cx={geo.lb[0]} cy={geo.lb[1]} r={geo.r + 6} className={m.bore} />
      {/* return lanes pass through the wall at these ports */}
      {geo.cuts.map((c, i) => {
        const vert = c.side === 'l' || c.side === 'r'
        const wx = c.side === 'l' ? h.x : c.side === 'r' ? h.x + h.w : 0
        const wy = c.side === 't' ? h.y : c.side === 'b' ? h.y + h.h : 0
        return vert ? (
          <path key={`c${i}`} d={`M${wx},${c.at - 3} v6`} className={m.cut} />
        ) : (
          <path key={`c${i}`} d={`M${c.at - 3},${wy} h6`} className={m.cut} />
        )
      })}
      {geo.counters.map((c, i) => {
        const v = view.servers[i]
        const isPick = pick === i
        return (
          <g key={i}>
            <rect x={c.x} y={c.y} width={c.w} height={c.h} className={!v.healthy ? m.counterOff : isPick ? m.counterPick : m.counter} />
            <text x={c.x + c.w / 2} y={c.y + c.h / 2 + 5} textAnchor="middle" className={!v.healthy ? m.counterTxtOff : m.counterTxt}>
              {v.healthy ? v.active : '—'}
            </text>
            {isPick &&
              (geo.tall ? (
                <path d={`M${c.x + c.w / 2 - 5},${c.y - 9} h10 l-5,7 Z`} className={m.pickTri} />
              ) : (
                <path d={`M${c.x - 9},${c.y + c.h / 2 - 5} v10 l7,-5 Z`} className={m.pickTri} />
              ))}
          </g>
        )
      })}
      <Rotary cx={geo.lb[0]} cy={geo.lb[1]} r={geo.r} angle={geo.angles[view.target] ?? 0} label="" />
      <text x={lbl.at[0]} y={lbl.at[1]} textAnchor={lbl.anchor} className={s.partName} style={{ fontSize: lbl.size }}>
        LOAD BALANCER
      </text>
      {geo.counterNote && (
        <>
          <text x={geo.counterNote[0]} y={geo.counterNote[1]} textAnchor="middle" className={s.lblMuted} style={{ fontSize: 12.5 }}>
            brojači = otvorene veze
          </text>
          <text x={geo.counterNote[0]} y={geo.counterNote[1] + 17} textAnchor="middle" className={s.lblPencil} style={{ fontSize: 12.5 }}>
            ▸ {algo === 'rr' ? 'sljedeći na redu' : 'najmanje veza'}
          </text>
        </>
      )}
    </g>
  )
}

/** What the load balancer believes (its last probes), not what is true: a fresh crash still reads "HC ✓". */
function hcText(v: SrvView): string {
  if (v.healthy) return v.fails > 0 ? `HC ✗ ${v.fails}/${HC_FAILS}` : 'HC ✓'
  return v.oks > 0 ? `HC ✓ ${v.oks}/2` : 'HC ✗'
}

/** Valve, health-check reading and queue beads on one outlet pipe. */
function Branch({ geo, i, v }: { geo: Layout; i: number; v: SrvView }) {
  const [vx, vy] = geo.valves[i]
  const probing = v.probe && v.probe.age < 380
  const hcBad = (v.healthy && v.fails > 0) || (!v.healthy && v.oks === 0)
  const [hx, hy] = geo.hcAt[i]
  const txt = hcText(v)
  return (
    <g>
      {probing && v.probe && (
        <circle
          cx={vx}
          cy={vy}
          r={10 + (v.probe.age / 380) * 9}
          className={v.probe.ok ? m.probeOk : m.probeBad}
          style={{ opacity: 1 - v.probe.age / 380 }}
        />
      )}
      <Valve x={vx} y={vy} closed={!v.healthy} vertical={geo.tall} />
      {Array.from({ length: QUEUE_MAX }, (_, k) => {
        const [x, y] = geo.queueAt(i, k)
        return <circle key={k} cx={x} cy={y} r={3.2} className={k < v.queue ? s.bead : s.beadEmpty} />
      })}
      {geo.tall ? (
        <text x={hx} y={hy} textAnchor="end" className={hcBad ? s.redTxt : s.lblPencil} style={{ fontSize: 12 }}>
          <tspan x={hx}>HC</tspan>
          <tspan x={hx} dy={14}>
            {txt.replace('HC ', '')}
          </tspan>
        </text>
      ) : (
        <text x={hx} y={hy} textAnchor={geo.hcAnchor[i]} className={hcBad ? s.redTxt : s.lblPencil} style={{ fontSize: 13 }}>
          {txt}
        </text>
      )}
    </g>
  )
}

/** The checker rings the health-check reading of the crashed branch in red pencil (ties it to the handwritten note). */
function NoteRing({ geo, i }: { geo: Layout; i: number }) {
  const [hx, hy] = geo.hcAt[i]
  const tall = geo.tall
  const cx = tall ? hx - 16 : hx + 33
  const cy = tall ? hy + 2 : hy - 5
  const w = tall ? 52 : 82
  const h = tall ? 40 : 26
  const d = useMemo(() => roughEllipse(cx, cy, w, h, 17, { strokeWidth: 1.4 }), [cx, cy, w, h])
  return <path d={d} className={s.redThin} />
}

function useCross(b: Box, down: boolean, inset: { t: number; b: number; x: number }) {
  return useMemo(() => {
    if (!down) return ''
    const x1 = b.x + inset.x
    const x2 = b.x + b.w - inset.x
    const y1 = b.y + inset.t
    const y2 = b.y + b.h - inset.b
    return roughLine(x1, y1, x2, y2, 5, { strokeWidth: 2.2 }) + ' ' + roughLine(x2, y1, x1, y2, 12, { strokeWidth: 2.2 })
  }, [b, down, inset.t, inset.b, inset.x])
}

function outlineCls(v: SrvView): string {
  if (v.proc === 'down') return s.boxDown
  if (!v.healthy || v.proc === 'boot') return m.boxIdle
  return s.boxLine
}

/** Bottom-right reading of a server: requests it turned away (red) or requests it has answered. */
function tail(v: SrvView): { text: string; cls: string } {
  if (v.proc === 'down') return { text: '', cls: s.lblMuted }
  if (v.proc === 'boot') return { text: 'pokreće se…', cls: s.lblMuted }
  if (v.rej > 0) return { text: `503 × ${v.rej}`, cls: s.redTxt }
  return { text: `obrađeno ${v.done}`, cls: s.lblMuted }
}

const G = 20 // RAM drawn to scale: 20 units per GB

function ServerWide({ v, b, uid }: { v: SrvView; b: Box; uid: string }) {
  const down = v.proc === 'down'
  const hot = v.busy / v.vcpu > 0.92
  const crossD = useCross(b, down, { t: 48, b: 26, x: 30 })
  const cores = Array.from({ length: v.vcpu }, (_, k) => Math.max(0, Math.min(1, v.busy - k)))
  const ramUsedGB = (512 + v.work * 256) / 1024
  const cs = 26
  const cx0 = b.x + 12
  const cy0 = b.y + 62
  const rx0 = b.x + 150
  const ramW = v.ramGB * G
  const osW = G / 2
  const slotW = (ramW - osW) / v.W
  const tl = tail(v)
  return (
    <g>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} className={outlineCls(v)} />
      <path d={`M${b.x},${b.y + 38} H${b.x + b.w}`} className={s.thinSoft} />
      <text x={b.x + 12} y={b.y + 28} className={s.partName}>
        {v.name.toUpperCase()}
      </text>
      <text x={b.x + 100} y={b.y + 27} className={s.lblMuted} style={{ fontSize: 13.5 }}>
        {v.vcpu} vCPU · {v.ramGB} GB
      </text>
      {tl.text && (
        <text x={b.x + b.w - 12} y={b.y + b.h - 6} textAnchor="end" className={tl.cls} style={{ fontSize: 13 }}>
          {tl.text}
        </text>
      )}
      <text x={cx0} y={b.y + 55} className={s.partTiny} style={{ fontSize: 12.5 }}>
        CPU
      </text>
      {cores.map((f, k) => (
        <g key={k}>
          <rect x={cx0 + k * (cs + 6)} y={cy0} width={cs} height={cs} className={s.core} />
          {f > 0.01 && (
            <rect x={cx0 + k * (cs + 6)} y={cy0 + cs * (1 - f)} width={cs} height={cs * f} fill={`url(#${uid}-${hot ? 'hr' : 'h'})`} />
          )}
        </g>
      ))}
      <Dim x1={cx0} y1={b.y + 96} x2={cx0 + v.vcpu * (cs + 6) - 6} y2={b.y + 96} label={`${v.vcpu} vCPU`} uid={uid} size={12.5} side="below" />
      <text x={rx0} y={b.y + 55} className={s.partTiny} style={{ fontSize: 12.5 }}>
        RAM
      </text>
      <text x={b.x + b.w - 12} y={b.y + 55} textAnchor="end" className={s.lblMuted} style={{ fontSize: 12.5 }}>
        {hr(down ? 0 : ramUsedGB, 1)} GB u uporabi
      </text>
      <rect x={rx0} y={cy0} width={ramW} height={cs} className={s.core} />
      <rect x={rx0} y={cy0} width={osW} height={cs} fill={`url(#${uid}-st)`} />
      {Array.from({ length: v.W }, (_, k) => (
        <rect
          key={k}
          x={rx0 + osW + k * slotW}
          y={cy0}
          width={slotW}
          height={cs}
          className={s.slot}
          style={k < v.work ? { fill: `url(#${uid}-${k < v.cpuJobs ? (hot ? 'hr' : 'h') : 'hp'})` } : undefined}
        />
      ))}
      <Dim x1={rx0} y1={b.y + 96} x2={rx0 + ramW} y2={b.y + 96} label={`${v.ramGB} GB`} uid={uid} size={12.5} side="below" />
      <text x={b.x + 12} y={b.y + b.h - 6} className={down ? s.redTxt : s.lbl} style={{ fontSize: 13 }}>
        {down ? 'ne odgovara · veze odbijene (502)' : `u obradi ${v.work}/${v.W} · red ${v.queue}/${QUEUE_MAX}`}
      </text>
      {down && (
        <>
          <path d={crossD} className={s.redPencil} />
          <g className={s.stampSvg} transform={`rotate(-6 ${b.x + b.w * 0.62} ${b.y + 74})`}>
            <rect x={b.x + b.w * 0.62 - 36} y={b.y + 60} width={72} height={28} />
            <text x={b.x + b.w * 0.62} y={b.y + 81} textAnchor="middle">
              PAO
            </text>
          </g>
        </>
      )}
    </g>
  )
}

function ServerTall({ v, b, uid, isNext }: { v: SrvView; b: Box; uid: string; isNext: boolean }) {
  const down = v.proc === 'down'
  const hot = v.busy / v.vcpu > 0.92
  const crossD = useCross(b, down, { t: 56, b: 52, x: 10 })
  const cores = Array.from({ length: v.vcpu }, (_, k) => Math.max(0, Math.min(1, v.busy - k)))
  const cx = b.x + b.w / 2
  const cs = 22
  const coreX = (k: number) => cx - (v.vcpu > 1 ? 24 : 11) + (k % 2) * 26
  const coreY = (k: number) => b.y + 72 + Math.floor(k / 2) * 26
  const barH = v.ramGB * 12
  const barB = b.y + 238
  const slotH = (barH - 6) / v.W
  const barX = cx - 22
  let third: { text: string; cls: string }
  if (down) third = { text: 'ne odgovara', cls: s.redTxt }
  else if (!v.healthy) third = { text: 'isključen', cls: s.redTxt }
  else if (v.proc === 'boot') third = { text: 'pokreće se…', cls: s.lblMuted }
  else if (v.rej > 0) third = { text: `503 × ${v.rej}`, cls: s.redTxt }
  else if (isNext) third = { text: '▸ sljedeći', cls: s.lblPencil }
  else third = { text: `obrađeno ${v.done}`, cls: s.lblMuted }
  return (
    <g>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} className={outlineCls(v)} />
      <path d={`M${b.x},${b.y + 50} H${b.x + b.w}`} className={s.thinSoft} />
      <text x={cx} y={b.y + 23} textAnchor="middle" className={s.partName} style={{ fontSize: 19 }}>
        {v.name.toUpperCase()}
      </text>
      <text x={cx} y={b.y + 41} textAnchor="middle" className={s.lblMuted} style={{ fontSize: 12 }}>
        {v.vcpu} vCPU · {v.ramGB} GB
      </text>
      <text x={b.x + 6} y={b.y + 67} className={s.partTiny} style={{ fontSize: 12 }}>
        CPU
      </text>
      {cores.map((f, k) => (
        <g key={k}>
          <rect x={coreX(k)} y={coreY(k)} width={cs} height={cs} className={s.core} />
          {f > 0.01 && (
            <rect x={coreX(k)} y={coreY(k) + cs * (1 - f)} width={cs} height={cs * f} fill={`url(#${uid}-${hot ? 'hr' : 'h'})`} />
          )}
        </g>
      ))}
      <text x={b.x + 6} y={b.y + 136} className={s.partTiny} style={{ fontSize: 12 }}>
        RAM
      </text>
      <rect x={barX} y={barB - barH} width={30} height={barH} className={s.core} />
      <rect x={barX} y={barB - 6} width={30} height={6} fill={`url(#${uid}-st)`} />
      {Array.from({ length: v.work }, (_, k) => (
        <rect
          key={k}
          x={barX}
          y={barB - 6 - (k + 1) * slotH}
          width={30}
          height={slotH}
          fill={`url(#${uid}-${k < v.cpuJobs ? (hot ? 'hr' : 'h') : 'hp'})`}
        />
      ))}
      <Dim x1={barX + 42} y1={barB - barH} x2={barX + 42} y2={barB} label={`${v.ramGB} GB`} uid={uid} size={12} side="below" />
      <text x={cx} y={b.y + 256} textAnchor="middle" className={down ? s.lblMuted : s.lbl} style={{ fontSize: 12 }}>
        u obradi {down ? 0 : v.work}/{v.W}
      </text>
      <text x={cx} y={b.y + 271} textAnchor="middle" className={down ? s.lblMuted : s.lbl} style={{ fontSize: 12 }}>
        red {v.queue}/{QUEUE_MAX}
      </text>
      <text x={cx} y={b.y + 286} textAnchor="middle" className={third.cls} style={{ fontSize: 12 }}>
        {third.text}
      </text>
      {down && (
        <>
          <path d={crossD} className={s.redPencil} />
          <g className={s.stampSvg} transform={`rotate(-8 ${cx} ${b.y + 70})`}>
            <rect x={cx - 30} y={b.y + 57} width={60} height={26} />
            <text x={cx} y={b.y + 77} textAnchor="middle" style={{ fontSize: 19 }}>
              PAO
            </text>
          </g>
        </>
      )}
    </g>
  )
}
