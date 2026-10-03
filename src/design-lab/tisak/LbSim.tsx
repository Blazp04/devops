import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { Disc, ReqDot, Stamp, Student } from './Glyphs'
import { hr, jitter, pointAt, polyD } from './geo'
import { useFrameLoop, useInView, useWidth } from './hooks'
import { buildGeo, type LbGeo } from './lbGeo'
import {
  CAPACITY,
  CRASHABLE,
  DEFAULT_RATE,
  DETECT_S,
  GB_PER_REQ,
  LbSim as Model,
  MAX_RATE,
  SPECS,
  type Algo,
  type SimView,
} from './lbModel'
import l from './lb.module.css'

const CORES = SPECS.reduce((a, s) => a + s.cores, 0)
const RIM: Record<Algo, string> = { rr: 'LOAD BALANCER · KRUŽNO · ', lc: 'LOAD BALANCER · NAJMANJE VEZA · ' }
const RULE: Record<Algo, string> = { rr: 'KRUŽNO', lc: 'NAJMANJE VEZA' }

/* ---------------- static drawing (changes only with layout) ---------------- */
const Static = memo(function Static({ geo }: { geo: LbGeo }) {
  return (
    <g>
      <path d={polyD(geo.srcRoute)} className={l.route} />
      <g filter="url(#tk-ink)">
        {geo.students.map((s, i) => (
          <Student key={i} x={s.x} y={s.y} ink={s.ink} s={s.s} />
        ))}
      </g>
      {geo.studentsLabel && (
        <text x={geo.studentsLabel.x} y={geo.studentsLabel.y} className={l.caps}>
          studenti · Klopa
        </text>
      )}
      {geo.srv.map((g, i) => (
        <g key={i}>
          {g.bars.map((b, k) => (
            <g key={k}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="url(#tk-ht-blue)" />
              <rect x={b.x} y={b.y} width={b.w} height={b.h} className={l.barEdge} />
            </g>
          ))}
          {g.queue.map((q, k) => (
            <circle key={k} cx={q.x} cy={q.y} r="2" className={l.qSlot} />
          ))}
          {g.ram.map((r, k) => (
            <rect key={k} x={r.x} y={r.y} width={r.w} height={r.h} className={l.ramFree} />
          ))}
        </g>
      ))}
    </g>
  )
})

function Spark({ data, max, tone }: { data: number[]; max: number; tone: 'ink' | 'blue' | 'pink' }) {
  const n = 36
  const w = 4
  const pad = n - data.length
  return (
    <svg className={l.spark} viewBox={`0 0 ${n * (w + 2)} 36`} preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" y1="35.5" x2={n * (w + 2)} y2="35.5" className={l.sparkBase} />
      {data.map((v, i) => {
        const hgt = Math.max(1, Math.min(1, v / max) * 34)
        return <rect key={i} x={(pad + i) * (w + 2)} y={36 - hgt} width={w} height={hgt} className={l[`spark_${tone}`]} />
      })}
    </svg>
  )
}

function Corners() {
  return (
    <>
      {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
        <svg key={c} className={`${l.cropMark} ${l[`crop_${c}`]}`} width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
          <path d="M0 11h9M11 0v9" />
        </svg>
      ))}
    </>
  )
}

function narration(v: SimView, algo: Algo, rate: number): string {
  const big = v.servers[CRASHABLE]
  if (big.crashed && big.inRotation)
    return algo === 'lc'
      ? 'Veliki je pao, ali load balancer to još ne zna. Srušeni poslužitelj odmah vraća grešku, pa mu se veze brzo „oslobađaju” i dobiva još više prometa, sve dok ga health check ne ukloni.'
      : 'Veliki je pao, ali load balancer to još ne zna: svaki treći zahtjev i dalje ide na Veliki i vraća grešku 502, sve dok health check ne potvrdi kvar.'
  if (big.crashed) return 'Health check je uklonio Veliki iz rotacije. Sav promet sada nose Mali i Srednji. Pratite rastu li im redovi.'
  if (!big.inRotation) return 'Veliki je ponovno pokrenut. U rotaciju se vraća tek kad health check potvrdi da odgovara.'
  if (rate > CAPACITY)
    return `Promet je veći od ukupnog kapaciteta (≈ ${hr(CAPACITY, 1)} zahtjeva/s). Nijedno pravilo raspoređivanja to ne može spasiti: redovi su puni posvuda.`
  if (v.metrics.errPct > 1.5 && algo === 'rr')
    return 'Kružno raspoređivanje daje svakom poslužitelju trećinu prometa, bez obzira na snagu. Mali se prvi zaguši i počinje odbijati zahtjeve (503).'
  if (algo === 'lc' && v.metrics.errPct > 1.5)
    return 'Najmanje veza rasterećuje Malog, ali ga ne spašava: kad mu je red pun, odbijeni zahtjev (503) odmah oslobađa vezu, pa Mali opet izgleda „slobodno”. Blizu ukupnog kapaciteta pomaže samo još snage.'
  if (algo === 'lc')
    return 'Najmanje aktivnih veza: novi zahtjev ide poslužitelju koji trenutačno ima najmanje zahtjeva u obradi. Mali sporije završava posao, pa dobiva manje prometa nego kod kružnog raspoređivanja.'
  return 'Kružno: zahtjevi idu redom Mali → Srednji → Veliki. Pojačajte promet i pratite što se događa s Malim.'
}

export function LbSim() {
  const reduced = useReducedMotion() ?? false
  const [sim] = useState(() => {
    const m = new Model(7)
    for (let i = 0; i < 6 * 30; i++) m.step(1 / 30)
    return m
  })
  const [view, setView] = useState<SimView>(() => sim.view())
  const [algo, setAlgo] = useState<Algo>('rr')
  const [rate, setRate] = useState(DEFAULT_RATE)
  const [userPaused, setUserPaused] = useState<boolean | null>(null)
  const playing = userPaused === null ? !reduced : !userPaused

  const boxRef = useRef<HTMLDivElement>(null)
  const width = useWidth(boxRef, () => (typeof window === 'undefined' ? 1200 : window.innerWidth))
  const narrow = width < 620
  const geo = useMemo(() => buildGeo(narrow), [narrow])
  const inView = useInView(boxRef)

  const onFrame = useCallback(
    (dt: number) => {
      sim.step(dt)
      setView(sim.view())
    },
    [sim],
  )
  useFrameLoop(playing && inView, onFrame)

  const big = view.servers[CRASHABLE]
  const target = view.target >= 0 ? geo.srv[view.target].entry : null
  const angle = target ? (Math.atan2(target.y - geo.lb.y, target.x - geo.lb.x) * 180) / Math.PI : 0
  const m = view.metrics

  const changeRate = (r: number) => {
    setRate(r)
    sim.setRate(r)
  }
  const changeAlgo = (a: Algo) => {
    setAlgo(a)
    sim.setAlgo(a)
  }
  const crash = () => {
    sim.crash()
    setView(sim.view())
  }
  const repair = () => {
    sim.repair()
    setView(sim.view())
  }
  const hcNote =
    big.healthMode === 'detect'
      ? `kvar se otkriva… ${hr(big.health * DETECT_S, 1)} / 2 s`
      : big.healthMode === 'rejoin'
        ? `provjera prolazi… ${hr(big.health * DETECT_S, 1)} / 2 s`
        : big.crashed
          ? 'izvan rotacije: ne prima promet'
          : 'odgovara · u rotaciji'

  return (
    <div className={l.sim}>
      <Corners />

      <div className={l.metrics} aria-label="Mjerenja" role="group">
        <div className={l.metric}>
          <p className={l.mLabel}>Obrađeno</p>
          <p className={l.mValue}>
            {hr(m.thr, 1)}
            <span className={l.mUnit}>zahtjeva/s</span>
          </p>
          <Spark data={view.history.thr} max={14} tone="ink" />
        </div>
        <div className={l.metric}>
          <p className={l.mLabel}>p95 latencija</p>
          <p className={l.mValue}>
            {m.p95 === null ? '—' : hr(m.p95, 2)}
            <span className={l.mUnit}>s (sim.)</span>
          </p>
          <Spark data={view.history.p95} max={3} tone="blue" />
        </div>
        <div className={`${l.metric} ${m.errPct >= 0.5 ? l.metricBad : ''}`}>
          <p className={l.mLabel}>Greške</p>
          <p className={l.mValue}>
            {hr(m.errPct, 0)}
            <span className={l.mUnit}>% zahtjeva</span>
          </p>
          <Spark data={view.history.err} max={60} tone="pink" />
        </div>
      </div>

      <div className={l.canvas} ref={boxRef}>
        <svg
          viewBox={`0 0 ${geo.w} ${geo.h}`}
          className={geo.narrow ? l.svgN : undefined}
          role="img"
          aria-label={`Simulacija: studenti šalju ${rate} zahtjeva u sekundi load balanceru (${algo === 'rr' ? 'kružno' : 'najmanje aktivnih veza'}), koji ih dijeli na Mali, Srednji i Veliki.`}
        >
          {/* LB → server lines; a server out of rotation gets a broken line */}
          {geo.routes.map((r, i) => {
            const out = !view.servers[i].inRotation
            const mid = pointAt(r, geo.narrow ? 0.9 : 0.55)
            return (
              <g key={i}>
                <path d={polyD(r)} className={out ? l.routeOut : l.route} />
                {out && <path d={`M${mid.x - 8} ${mid.y - 8}l16 16m0 -16l-16 16`} className={l.routeX} />}
              </g>
            )
          })}
          <Static geo={geo} />

          {view.servers.map((sv, i) => {
            const g = geo.srv[i]
            const inUse = sv.busy.filter(Boolean).length
            const used = inUse + sv.queue.length
            return (
              <g key={i} className={sv.inRotation ? undefined : l.dimmed}>
                {/* RAM in use */}
                {g.ram.slice(0, used).map((r, k) => (
                  <rect key={k} x={r.x} y={r.y} width={r.w} height={r.h} className={`${l.ramUsed} ${l.over}`} />
                ))}
                {/* cores at work */}
                {sv.busy.map((b, k) => {
                  if (!b) return null
                  const bar = g.bars[k]
                  return (
                    <g key={b.id}>
                      <rect x={bar.x} y={bar.y} width={bar.w * b.prog} height={bar.h} className={`${l.fBlue} ${l.over}`} />
                      <ReqDot x={bar.x + Math.max(9, bar.w * b.prog)} y={bar.y + bar.h / 2} r={geo.dotR} busy />
                    </g>
                  )
                })}
                {/* waiting room */}
                {sv.queue.map((id, k) => (
                  <g key={id} className={l.queued} style={{ transform: `translate(${g.queue[k].x}px, ${g.queue[k].y}px)` }}>
                    <ReqDot x={0} y={0} r={geo.narrow ? 5.5 : 6} />
                  </g>
                ))}
                <text x={g.barX} y={g.nameY}>
                  <tspan className={l.name}>{SPECS[i].name}</tspan>
                  <tspan dx="10" className={l.spec}>
                    {SPECS[i].cores} vCPU · {SPECS[i].ram} GB
                  </tspan>
                </text>
                <text x={g.barX} y={g.statsY} className={l.stats}>
                  CPU {inUse}/{SPECS[i].cores} · RAM {hr(used * GB_PER_REQ, 1)}/{SPECS[i].ram} GB · red {sv.queue.length}
                </text>
                {sv.crashed && (
                  <g>
                    <rect x={g.box.x} y={g.box.y} width={g.box.w} height={g.box.h} fill="url(#tk-hatch-pink)" className={l.over} />
                    <Stamp x={g.barX + g.barW / 2} y={g.box.y + g.box.h / 2} label="SRUŠEN" rot={-6} size={geo.narrow ? 1.3 : 1.6} solid />
                  </g>
                )}
              </g>
            )
          })}

          {/* requests on the wire */}
          {view.dots.map((d) => {
            const route = d.route < 0 ? geo.srcRoute : geo.routes[d.route]
            const p = pointAt(route, d.p)
            return <ReqDot key={d.id} x={p.x} y={p.y} r={geo.dotR} />
          })}

          <Disc
            x={geo.lb.x}
            y={geo.lb.y}
            r={geo.lbR}
            angle={angle}
            rim={geo.ruleChip ? undefined : RIM[algo]}
            id={geo.narrow ? 'tk-lb-rim-n' : 'tk-lb-rim-w'}
          />
          {geo.ruleChip && (
            <g>
              <text x={geo.ruleChip.x - RULE[algo].length * 8.3 - 28} y={geo.ruleChip.y + 5} textAnchor="end" className={l.caps}>
                pravilo
              </text>
              <rect
                x={geo.ruleChip.x - RULE[algo].length * 8.3 - 18}
                y={geo.ruleChip.y - 12}
                width={RULE[algo].length * 8.3 + 18}
                height="24"
                className={l.ruleBg}
              />
              <text x={geo.ruleChip.x - (RULE[algo].length * 8.3 + 18) / 2} y={geo.ruleChip.y + 5} textAnchor="middle" className={l.ruleText}>
                {RULE[algo]}
              </text>
            </g>
          )}

          {/* outcomes */}
          {view.fx.map((f) => {
            const g = geo.srv[f.srv]
            if (f.kind === 'ok') {
              const bar = g.bars[f.slot] ?? g.bars[0]
              return <circle key={f.id} cx={bar.x + bar.w + 10} cy={bar.y + bar.h / 2} r={4 + f.age * 9} className={l.okRing} opacity={1 - f.age} />
            }
            const at = f.kind === 'full' ? g.queue[g.queue.length - 1] : g.entry
            return (
              <Stamp
                key={f.id}
                x={at.x - (geo.narrow ? 8 : 26) + jitter(f.id, 1) * 10}
                y={at.y - 6 + jitter(f.id, 2) * 12}
                label={f.kind === 'full' ? '503' : '502'}
                rot={jitter(f.id) * 16}
                size={geo.narrow ? 0.9 : 0.95}
                solid
                opacity={Math.min(1, 3 * (1 - f.age))}
              />
            )
          })}

          {/* health check of Veliki */}
          <g transform={`translate(${geo.health.x} ${geo.health.y})`}>
            <text y="-10" className={l.hcLabel}>
              health check → Veliki
            </text>
            <rect y="0" width={geo.health.w} height="8" className={l.hcTrack} />
            {big.health >= 0 && (
              <rect y="0" width={geo.health.w * big.health} height="8" className={big.healthMode === 'detect' ? l.hcDetect : l.hcRejoin} />
            )}
            <text y="26" className={l.hcNote}>
              {hcNote}
            </text>
            <text y="45" className={l.hcNote}>
              2 s (sim) · stvarno npr. 30 s
            </text>
          </g>
        </svg>

        <p className={l.narration} aria-live="polite">
          {narration(view, algo, rate)}
        </p>
      </div>

      <div className={l.controls} role="group" aria-label="Upravljanje simulacijom">
        <label className={l.rate}>
          <span className={l.ctlLabel}>Promet</span>
          <input
            type="range"
            min={0}
            max={MAX_RATE}
            step={1}
            value={rate}
            onChange={(e) => changeRate(Number(e.target.value))}
            aria-valuetext={`${rate} zahtjeva u sekundi`}
            className={l.slider}
            style={{ ['--fill' as string]: `${(rate / MAX_RATE) * 100}%` }}
          />
          <output className={l.rateOut}>
            <b>{rate}</b>
            <span className={l.unitLong}> zahtjeva</span>/s
          </output>
        </label>

        <div className={l.algo} role="group" aria-labelledby="tk-algo-label">
          <span className={l.ctlLabel} id="tk-algo-label">
            Raspoređivanje
          </span>
          <div className={l.algoOpts}>
            <button type="button" className={l.algoOpt} aria-pressed={algo === 'rr'} onClick={() => changeAlgo('rr')}>
              Kružno
            </button>
            <button type="button" className={l.algoOpt} aria-pressed={algo === 'lc'} onClick={() => changeAlgo('lc')}>
              Najmanje <span className={l.wideOnly}>aktivnih </span>veza
            </button>
          </div>
        </div>

        <div className={l.actions}>
          <span className={l.ctlLabel}>Kvar</span>
          <div className={l.actionRow}>
            <button type="button" className={l.crash} onClick={crash} disabled={big.crashed} aria-label="Sruši poslužitelj Veliki">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M2 2l12 12M14 2L2 14" />
              </svg>
              Sruši <span className={l.wideOnly}>poslužitelj</span>
            </button>
            <button type="button" className={l.fix} onClick={repair} disabled={!big.crashed} aria-label="Popravi Veliki">
              Popravi
            </button>
            <button
              type="button"
              className={l.play}
              onClick={() => setUserPaused(playing)}
              aria-pressed={!playing}
              aria-label={playing ? 'Pauziraj simulaciju' : 'Pokreni simulaciju'}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                {playing ? <path d="M2 1h3.5v12H2zM8.5 1H12v12H8.5z" /> : <path d="M2 1l11 6-11 6z" />}
              </svg>
              <span className={l.wideOnly}>{playing ? 'Pauza' : 'Pokreni'}</span>
            </button>
          </div>
        </div>
      </div>

      <figure className={l.shareFig}>
        <figcaption className={l.shareHead}>
          <span className={l.shareTitle}>Tko nosi promet?</span>
          <span className={l.shareKey}>
            <i className={l.keyTraffic} aria-hidden="true" /> udio prometa (zadnjih 5 s)
          </span>
          <span className={l.shareKey}>
            <i className={l.keyCores} aria-hidden="true" /> udio jezgri
          </span>
          <span className={l.shareKey}>
            <i className={l.keyMix} aria-hidden="true">
              <i />
            </i>{' '}
            preklop: promet unutar snage
          </span>
        </figcaption>
        {SPECS.map((sp, i) => {
          const share = view.servers[i].share
          const cap = sp.cores / CORES
          const over = share - cap > 0.04
          return (
            <div key={sp.name} className={l.shareRow}>
              <span className={l.shareName}>{sp.name}</span>
              <span className={l.shareTrack} aria-hidden="true">
                <span className={l.shareCores} style={{ width: `${cap * 100}%` }} />
                <span className={l.shareTraffic} style={{ width: `${share * 100}%` }} />
                <span className={l.shareTick} style={{ left: `${cap * 100}%` }} />
              </span>
              <span className={l.sharePct}>
                <b className={over ? l.pctOver : undefined}>{Math.round(share * 100)} %</b>
                <span> / {Math.round(cap * 100)} %</span>
              </span>
            </div>
          )
        })}
        <p className={l.shareNote}>
          Gdje se boje preklapaju, promet stane u snagu poslužitelja. Čisto ružičasto iza crne crte znači da poslužitelj
          dobiva više prometa nego što ima snage. Ukupni kapacitet ≈{' '}
          {hr(CAPACITY, 1)} zahtjeva/s; obrada jednog zahtjeva traje 0,4–0,8 s (sim.).
        </p>
      </figure>

      <ul className={l.legend} aria-label="Legenda">
        <li>
          <svg viewBox="-10 -10 20 20" width="20" height="20" aria-hidden="true">
            <ReqDot x={0} y={0} r={6} />
          </svg>
          zahtjev
        </li>
        <li>
          <svg viewBox="-16 -10 32 20" width="32" height="20" aria-hidden="true">
            <rect x="-16" y="-6" width="16" height="12" className={l.fBlue} />
            <rect x="0" y="-6" width="16" height="12" fill="url(#tk-ht-blue)" />
            <ReqDot x={0} y={0} r={6} busy />
          </svg>
          zahtjev u obradi (preklop)
        </li>
        <li>
          <svg viewBox="-10 -10 20 20" width="20" height="20" aria-hidden="true">
            <circle r="6" className={l.okRing} />
          </svg>
          odgovor poslan
        </li>
        <li>
          <span className={l.legendBar} aria-hidden="true" />
          jezgra (CPU)
        </li>
        <li>
          <span className={l.legendRam} aria-hidden="true" />
          0,5 GB RAM-a = jedan zahtjev
        </li>
        <li>
          <span className={l.legendStamp}>503</span>
          red je pun, zahtjev odbijen
        </li>
        <li>
          <span className={l.legendStamp}>502</span>
          poslužitelj ne odgovara
        </li>
      </ul>
    </div>
  )
}
