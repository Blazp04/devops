/**
 * Centrepiece: the load balancer as the gate of the port. Trucks (requests) drive at constant speed from the
 * students to the gate; the gate sends each one down one of three equal lanes to a server dock. Yellow portal
 * cranes are cores, dashed yard slots are RAM. When a dock's yard is full, trucks queue at its door (amber
 * blinkers) and a rotating amber beacon turns on; a truck that finds the queue full turns back red with a 503.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { vbStr, type VB } from './iso-math'
import { Truck } from './iso'
import { DispatchBoard, DockView, GateBeam, GatePost, LaneSignal, Pin, Plaza, YardApron, YardGround, YardPools, type BoardRow } from './yard'
import { boomUp, CARGO, DOCK_LABEL, DOCK_LABEL_COMPACT, GATE_SIGN, gatePostDepth, PLAZA_SIGN, signalDepth, YARD_VB, YARD_VB_COMPACT } from './yard-geo'
import {
  BACKLOG,
  HC_FAILS,
  HC_INTERVAL,
  LbSim,
  RAM_PER_REQ,
  SERVICE,
  SPECS,
  steadyScore,
  TRUCK_K,
  type Algo,
  type LogEntry,
  type Metrics,
  type Outcome,
  type ServerView,
  type Snapshot,
  type Steady,
} from './sim-model'
import { COMPACT_QUERY, useMediaQuery, usePrefersReducedMotion } from './useLoop'
import s from './sim.module.css'
import l from './luka.module.css'

const fmt = (n: number, d = 1) => n.toFixed(d).replace('.', ',')
const fmtRate = (n: number) => fmt(n, 2).replace(/,?0+$/, '')
const ALGO_NAME: Record<Algo, string> = { rr: 'Kružno', lc: 'Najmanje veza' }
const isFull = (sv: ServerView) => sv.up && sv.used >= sv.slots

/* ------------------------------------------------------------------ yard */

function Yard({ snap, vb, compact }: { snap: Snapshot; vb: VB; compact: boolean }) {
  const { servers, crates, trucks } = snap
  const actors: { depth: number; node: ReactNode }[] = trucks.map((t) => ({
    depth: t.x + t.y,
    node: (
      <Truck
        key={`t${t.id}`}
        x={t.x}
        y={t.y}
        dir={t.dir}
        cargo={CARGO[t.status]}
        scale={TRUCK_K}
        beacon={t.status === 'err'}
        placard={t.status === 'err' ? '503' : undefined}
        hazard={t.waiting}
        lights
      />
    ),
  }))
  actors.push({ depth: gatePostDepth('back'), node: <GatePost key="gb" side="back" /> })
  actors.push({ depth: gatePostDepth('front') + 0.3, node: <GatePost key="gf" side="front" /> })
  servers.forEach((sv, i) =>
    actors.push({
      depth: signalDepth(i),
      node: <LaneSignal key={`s${i}`} i={i} lamp={sv.healthy ? 'ok' : 'err'} up={boomUp(sv.healthy, sv.sinceHealth)} flash={sv.healthy && sv.sinceDispatch < 0.22} />,
    }),
  )
  actors.sort((a, b) => a.depth - b.depth)
  const dock = (i: number) => (
    <DockView key={`d${i}`} i={i} st={{ ...servers[i], full: isFull(servers[i]) }} crates={crates.filter((c) => c.srv === i)} t={snap.t} />
  )
  return (
    <svg
      className={s.yardSvg}
      viewBox={vbStr(vb)}
      role="img"
      aria-label="Simulacija: kamioni sa zahtjevima voze od menze Klopa do rampe load balancera, a rampa ih šalje jednom od tri doka: Mali, Srednji i Veliki. Zeleni se vraćaju s odgovorom, crveni s greškom 503."
    >
      <YardApron />
      <YardGround plaza={!compact} />
      <YardPools />
      {!compact && <Plaza />}
      {dock(0)}
      {actors.map((a) => a.node)}
      <GateBeam />
      {dock(1)}
      {dock(2)}
    </svg>
  )
}

function boardRows(snap: Snapshot): BoardRow[] {
  return snap.servers.map((sv, i) => ({
    name: SPECS[i].name,
    conns: sv.healthy ? sv.conns : null,
    flash: sv.healthy && sv.sinceDispatch < 0.25,
    next: snap.next === i,
  }))
}

function dockState(sv: ServerView): { word: string; sub?: string; tone?: 'full' | 'down' } {
  if (!sv.up) return { word: 'pao', tone: 'down' }
  if (!sv.healthy) return { word: 'čeka provjere', tone: 'full' }
  if (isFull(sv)) return { word: 'dvorište puno', sub: sv.backlog ? `${sv.backlog} ${sv.backlog === 1 ? 'kamion' : 'kamiona'} pred vratima` : undefined, tone: 'full' }
  return { word: '' }
}

function Overlays({ snap, vb, compact }: { snap: Snapshot; vb: VB; compact: boolean }) {
  return (
    <>
      {!compact && (
        <Pin vb={vb} at={PLAZA_SIGN} className={`${s.dockLabel} ${s.dl_right} ${s.plazaLabel}`}>
          <b>Studenti</b>
          <span>ispred menze Klopa</span>
        </Pin>
      )}
      {!compact && (
        <Pin vb={vb} at={GATE_SIGN} className={s.vmsPin}>
          <DispatchBoard algo={ALGO_NAME[snap.algo]} rows={boardRows(snap)} />
        </Pin>
      )}
      {snap.servers.map((sv, i) => {
        const st = dockState(sv)
        const lb = (compact ? DOCK_LABEL_COMPACT : DOCK_LABEL)[i]
        return (
          <Pin key={`lbl${i}`} vb={vb} at={lb.at} className={`${s.dockLabel} ${s[`dl_${lb.align}`]}`}>
            <b data-tone={st.tone}>{SPECS[i].name}</b>
            {!compact && (
              <span>
                {SPECS[i].cores} vCPU · {SPECS[i].ramGb} GB
              </span>
            )}
            {st.word && <em data-tone={st.tone}>{st.word}</em>}
            {st.sub && !compact && <small>{st.sub}</small>}
          </Pin>
        )
      })}
    </>
  )
}

/* ------------------------------------------------------------- panel bits */

/** Seven-segment style display; the unlit segments only show behind digits that are actually in use. */
function Led({ label, value, unit, tone }: { label: string; value: string; unit: string; tone?: 'bad' | 'good' }) {
  return (
    <div className={s.led}>
      <small>{label}</small>
      <div className={`${s.ledVal} ${tone === 'bad' ? s.ledBad : tone === 'good' ? s.ledGood : ''}`}>
        <span className={s.ledGhost} aria-hidden="true">
          {value.replace(/\d/g, '8')}
        </span>
        <span>{value}</span>
      </div>
      <div className={s.ledUnit}>{unit}</div>
    </div>
  )
}

const rate = (m: Metrics | null, k: 'okRate' | 'errRate') => (m && m[k] !== null ? fmt(m[k] as number, 2) : '—')

function ScorePlate({ score, algo, traffic }: { score: Record<Algo, Steady>; algo: Algo; traffic: number }) {
  const best = (k: 'errRate' | 'p95') => (score.rr[k] < score.lc[k] - 0.02 ? 'rr' : score.lc[k] < score.rr[k] - 0.02 ? 'lc' : null)
  const rows: { k: 'errRate' | 'p95'; label: string; f: (v: number) => string }[] = [
    { k: 'errRate', label: 'greške/s', f: (v) => fmt(v, 2) },
    { k: 'p95', label: 'p95 obrade', f: (v) => `${fmt(v)} s` },
  ]
  return (
    <table className={s.score}>
      <caption>
        Usporedba pri {fmtRate(traffic)} zahtjeva/s
        <small>Stabilno stanje: 40 s (sim) nakon zagrijavanja, svi poslužitelji rade.</small>
      </caption>
      <thead>
        <tr>
          <th scope="col">
            <span className={l.srOnly}>Mjera</span>
          </th>
          {(['rr', 'lc'] as const).map((a) => (
            <th key={a} scope="col" data-live={a === algo ? '1' : undefined}>
              {ALGO_NAME[a]}
              {a === algo && <small>uključeno</small>}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const b = best(r.k)
          return (
            <tr key={r.k}>
              <th scope="row">{r.label}</th>
              {(['rr', 'lc'] as const).map((a) => (
                <td key={a} data-bad={r.k === 'errRate' && score[a].errRate > 0.02 ? '1' : undefined} data-best={b === a ? '1' : undefined}>
                  {r.f(score[a][r.k])}
                </td>
              ))}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Plate({ i, sv }: { i: number; sv: ServerView }) {
  const sp = SPECS[i]
  const state = !sv.up ? (sv.healthy ? 'down' : 'out') : !sv.healthy ? 'back' : isFull(sv) ? 'full' : 'ok'
  return (
    <div className={s.plate} data-state={state}>
      <div className={s.plateHead}>
        <span className={s.plateName}>{sp.name}</span>
        <span className={s.plateSpec}>
          {sp.cores} vCPU · {sp.ramGb} GB
        </span>
      </div>
      <div className={s.meterRow}>
        <span className={s.meterLabel}>CPU</span>
        <span className={s.segs} aria-hidden="true">
          {Array.from({ length: sp.cores }, (_, k) => (
            <i key={k} data-on={k < sv.busy ? 'cpu' : undefined} />
          ))}
        </span>
        <span className={s.meterVal}>{Math.round((sv.busy / sp.cores) * 100)} %</span>
      </div>
      <div className={s.meterRow}>
        <span className={s.meterLabel}>RAM</span>
        <span className={s.segs} aria-hidden="true">
          {Array.from({ length: sv.slots }, (_, k) => (
            <i key={k} data-on={k < sv.busy ? 'busy' : k < sv.used ? 'wait' : undefined} />
          ))}
        </span>
        <span className={s.meterVal}>
          {fmt(sv.used * RAM_PER_REQ)}/{sp.ramGb} GB
        </span>
      </div>
      <div className={s.meterRow}>
        <span className={s.meterLabel}>Red</span>
        <span className={s.queueText}>
          {sv.queued === 0 && sv.backlog === 0 ? 'nitko ne čeka' : `${sv.queued} u dvorištu${sv.backlog ? ` · ${sv.backlog} pred vratima` : ''}`}
        </span>
        <span className={s.doorPips} aria-label={`pred vratima ${sv.backlog} od ${BACKLOG}`}>
          {Array.from({ length: BACKLOG }, (_, k) => (
            <b key={k} data-on={k < sv.backlog ? '1' : undefined} />
          ))}
        </span>
      </div>
      {state === 'ok' && (
        <span className={s.state}>
          <i /> Radi
        </span>
      )}
      {state === 'full' && (
        <span className={`${s.state} ${s.stateFull}`}>
          <i /> Puno · višak dobiva 503
        </span>
      )}
      {state === 'down' && (
        <span className={`${s.state} ${s.stateDown}`}>
          <i /> Pao · provjera
          <span className={s.pips} aria-label={`${sv.fails} od ${HC_FAILS} neuspjelih provjera`}>
            {Array.from({ length: HC_FAILS }, (_, k) => (
              <b key={k} data-f={k < sv.fails ? '1' : '0'} />
            ))}
          </span>
        </span>
      )}
      {state === 'out' && (
        <span className={`${s.state} ${s.stateDown}`}>
          <i /> Pao · izbačen iz rotacije
        </span>
      )}
      {state === 'back' && (
        <span className={`${s.state} ${s.stateOut}`}>
          <i /> Popravljen · čeka provjere
        </span>
      )}
    </div>
  )
}

function Padlock() {
  return (
    <svg viewBox="0 0 14 16" aria-hidden="true" className={s.padlock}>
      <path d="M3.5 7V4.8a3.5 3.5 0 0 1 7 0V7" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="1.5" y="7" width="11" height="8" fill="currentColor" />
    </svg>
  )
}

const OUTCOME: Record<Outcome, { word: string; tone: 'go' | 'wait' | 'ok' | 'err' }> = {
  put: { word: 'vozi', tone: 'go' },
  obrada: { word: 'obrada', tone: 'go' },
  ceka: { word: 'dvorište', tone: 'wait' },
  vrata: { word: 'pred vratima', tone: 'wait' },
  ok: { word: '200', tone: 'ok' },
  err: { word: '503', tone: 'err' },
}

/** The gate's dispatch log: the last decisions and what became of them. */
function GateLog({ log, algo }: { log: LogEntry[]; algo: Algo }) {
  return (
    <div className={s.logBox}>
      <span className={s.engraved}>
        Dnevnik rampe
        <small>{algo === 'lc' ? 'veze M · S · V u trenutku odluke' : 'redom: Mali → Srednji → Veliki'}</small>
      </span>
      <ol className={s.log} aria-label="Zadnje odluke rampe">
        {log.length === 0 && <li className={s.logEmpty}>čeka prvi kamion…</li>}
        {log.map((e) => {
          const o = OUTCOME[e.outcome]
          return (
            <li key={e.id}>
              <span className={s.logId}>#{e.id}</span>
              <span className={s.logTo}>→ {e.srv < 0 ? 'nitko' : SPECS[e.srv].name}</span>
              <span className={s.logWhy} aria-hidden={e.conns ? undefined : 'true'}>
                {e.conns
                  ? e.conns.map((c, k) => (
                      <b key={k} data-pick={k === e.srv ? '1' : undefined}>
                        {c < 0 ? '–' : c}
                      </b>
                    ))
                  : null}
              </span>
              <span className={s.logOut} data-tone={o.tone}>
                {o.word}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function PlayGlyph({ playing }: { playing: boolean }) {
  return playing ? (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <rect x="4" y="3" width="3.5" height="12" fill="currentColor" />
      <rect x="10.5" y="3" width="3.5" height="12" fill="currentColor" />
    </svg>
  ) : (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path d="M5 3v12l10-6z" fill="currentColor" />
    </svg>
  )
}

/* ------------------------------------------------------------------- sim */

const PRESETS = [
  { at: '11:58', name: 'mirno', rate: 1 },
  { at: '12:00', name: 'nalet', rate: 2.25 },
]

function warmSim(r: number) {
  const sim = new LbSim()
  sim.rate = r
  for (let k = 0; k < 6 * 30; k++) sim.step(1 / 30)
  return { sim, snap: sim.snapshot(sim.metrics()) }
}

export function LoadBalancerSim() {
  const reduce = usePrefersReducedMotion()
  const compact = useMediaQuery(COMPACT_QUERY)
  const [initial] = useState(() => warmSim(1.25))
  const simRef = useRef(initial.sim)
  const [snap, setSnap] = useState<Snapshot>(initial.snap)
  const [traffic, setTraffic] = useState(1.25)
  const [veliki, setVeliki] = useState(true)
  const [paused, setPaused] = useState<boolean | null>(null)
  const running = paused === null ? !reduce : !paused
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!running) return
    const el = hostRef.current
    if (!el) return
    let raf = 0
    let last = 0
    let visible = false
    let lastMetrics = 0
    let score = simRef.current.metrics()
    const frame = (now: number) => {
      const sim = simRef.current
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
      last = now
      sim.step(dt)
      if (now - lastMetrics > 250) {
        score = sim.metrics()
        lastMetrics = now
      }
      setSnap(sim.snapshot(score))
      if (visible) raf = requestAnimationFrame(frame)
    }
    const io = new IntersectionObserver(
      ([e]) => {
        const was = visible
        visible = e.isIntersecting
        if (visible && !was) {
          last = 0
          raf = requestAnimationFrame(frame)
        } else if (!visible) cancelAnimationFrame(raf)
      },
      { rootMargin: '60px' },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [running])

  const refresh = () => setSnap(simRef.current.snapshot(simRef.current.metrics()))
  const onRate = (v: number) => {
    setTraffic(v)
    simRef.current.rate = v
  }
  const onAlgo = (a: Algo) => {
    simRef.current.algo = a
    refresh()
  }
  const crash = () => {
    simRef.current.crash(2)
    setVeliki(false)
    refresh()
  }
  const repair = () => {
    simRef.current.repair(2)
    setVeliki(true)
    refresh()
  }

  const steady = useMemo(() => steadyScore(traffic), [traffic])
  const algo = snap.algo
  const m = snap.score[algo]
  const errTone = (m?.errRate ?? 0) > 0.05 ? 'bad' : undefined
  const vb = compact ? YARD_VB_COMPACT : YARD_VB
  return (
    <div className={`${l.frame} ${l.machine}`} ref={hostRef}>
      <div className={l.frameBar}>
        <span className={l.frameTitle}>Simulacija · terminal Klopa</span>
        <span className={l.frameNote}>pojednostavljeni model · vrijeme simulacije</span>
      </div>
      <div className={s.body}>
        <div className={s.yard}>
          <div className={s.stage} style={{ aspectRatio: `${vb.w} / ${vb.h}` }}>
            <Yard snap={snap} vb={vb} compact={compact} />
            <Overlays snap={snap} vb={vb} compact={compact} />
          </div>
          {compact && (
            <div className={s.vmsStrip}>
              <DispatchBoard algo={ALGO_NAME[algo]} rows={boardRows(snap)} />
            </div>
          )}
        </div>
        <aside className={s.desk} aria-label="Upravljačka ploča simulacije">
          <div className={s.group}>
            <label className={s.engraved} htmlFor="luka-rate">
              Promet
              <output htmlFor="luka-rate">{fmtRate(traffic)} zahtjeva/s</output>
            </label>
            <div className={s.rangeRow}>
              <input
                id="luka-rate"
                className={s.range}
                type="range"
                min={0.5}
                max={4}
                step={0.25}
                value={traffic}
                onChange={(e) => onRate(Number(e.target.value))}
              />
              <button type="button" className={`${l.btn} ${s.pause}`} onClick={() => setPaused(running)} aria-pressed={!running}>
                <PlayGlyph playing={running} />
                {running ? 'Pauza' : 'Pokreni'}
              </button>
              <div className={s.scale} aria-hidden="true">
                <span>0,5</span>
                <span>kapacitet ≈ 3,5</span>
                <span>4</span>
              </div>
            </div>
            <div className={s.presets}>
              {PRESETS.map((p) => (
                <button key={p.at} type="button" className={s.preset} aria-pressed={traffic === p.rate} onClick={() => onRate(p.rate)}>
                  <b>{p.at}</b>
                  {p.name} · {fmtRate(p.rate)}/s
                </button>
              ))}
            </div>
          </div>
          <div className={s.group} role="group" aria-label="Algoritam raspoređivanja">
            <span className={s.engraved}>Algoritam</span>
            <div className={s.switch}>
              <button type="button" aria-pressed={algo === 'rr'} onClick={() => onAlgo('rr')}>
                Kružno
              </button>
              <button type="button" aria-pressed={algo === 'lc'} onClick={() => onAlgo('lc')}>
                Najmanje aktivnih veza
              </button>
            </div>
          </div>
          <div className={s.group}>
            <span className={s.engraved}>Kvar</span>
            <div className={s.faultRow}>
              <button type="button" className={`${l.btn} ${s.crash}`} onClick={crash} disabled={!veliki}>
                Sruši poslužitelj
              </button>
              <button type="button" className={`${l.btn} ${s.repair}`} onClick={repair} disabled={veliki} aria-describedby={veliki ? 'luka-lock' : undefined}>
                {veliki && <Padlock />}
                Popravi
                {veliki && (
                  <small id="luka-lock" className={s.lockNote}>
                    nedostupno
                  </small>
                )}
              </button>
            </div>
            <p className={s.hcNote}>
              Pada Veliki. Rampa ga provjerava svakih {fmt(HC_INTERVAL)} s i izbacuje tek nakon {HC_FAILS} neuspjeha; dotad mu šalje zahtjeve.
              <span className={s.hcTime}>2 s (sim) · stvarno npr. 30 s</span>
            </p>
          </div>
          <div className={s.group}>
            <span className={s.engraved}>
              Mjerenja
              <small>{ALGO_NAME[algo].toLowerCase()} · zadnje 3 s</small>
            </span>
            <div className={s.leds} aria-live="off">
              <Led label="Obrađeno" value={rate(m, 'okRate')} unit="/s" tone="good" />
              <Led label="p95 obrade" value={m && m.p95 !== null ? fmt(m.p95) : '—'} unit="s (sim)" />
              <Led label="Greške" value={rate(m, 'errRate')} unit="/s" tone={errTone} />
            </div>
          </div>
          <GateLog log={snap.log} algo={algo} />
        </aside>
        <div className={s.plates}>
          {snap.servers.map((sv, i) => (
            <Plate key={i} i={i} sv={sv} />
          ))}
        </div>
        <div className={s.under}>
          <ScorePlate score={steady} algo={algo} traffic={traffic} />
          <ul className={s.legend} aria-label="Legenda">
            <li>
              <i style={{ ['--sw' as string]: 'var(--yellow)' }} />
              zahtjev
            </li>
            <li>
              <i style={{ ['--sw' as string]: 'var(--sig-green)' }} />
              odgovor 200
            </li>
            <li>
              <i style={{ ['--sw' as string]: 'var(--sig-red)' }} />
              greška 503 (rotirka)
            </li>
            <li>
              <i className={s.swCrane} />
              dizalica = 1 jezgra
            </li>
            <li>
              <i className={s.swSlot} />
              mjesto u dvorištu = {fmt(RAM_PER_REQ)} GB RAM-a
            </li>
            <li>
              <i className={s.swBeacon} />
              žuta rotirka = dvorište puno
            </li>
          </ul>
        </div>
        <p className={s.modelNote}>
          <b>Model</b>
          Svaki zahtjev zauzima jednu jezgru {fmt(SERVICE)} s i drži {fmt(RAM_PER_REQ)} GB RAM-a dok je na poslužitelju. Kad su sve dizalice
          zauzete, kontejner čeka u dvorištu; kad je i dvorište puno, najviše {BACKLOG} kamiona čeka pred vratima, a sljedeći dobiva 503.
          „Najmanje veza” broji samo veze, ne jezgre: kad su svi jednako zauzeti, i Mali dobiva svoj dio. To ispravljaju težinske inačice
          algoritma.
        </p>
      </div>
    </div>
  )
}
