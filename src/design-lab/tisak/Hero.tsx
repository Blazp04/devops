import { memo, useCallback, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Disc, ReqDot, Stamp, Student } from './Glyphs'
import { useFrameLoop, useInView } from './hooks'
import { jitter } from './geo'
import {
  ACT_LEN,
  BUS_Y,
  CLOCK,
  CLUSTER,
  CP,
  HeroSim,
  LB2,
  LB3,
  NODES,
  PH,
  POD,
  PODS,
  PW,
  SOLO_BARS,
  SOLO_PLATE,
  STUDENTS,
  TRIO,
  targetPoint,
  type Act,
  type HeroView,
  type PodState,
} from './heroSim'
import h from './hero.module.css'

const ACTS: readonly { n: string; title: string; text: string }[] = [
  { n: 'I', title: 'Jedan poslužitelj', text: 'U 12:00 cijela menza naruči odjednom. Red raste, a poslužitelj počinje odbijati zahtjeve.' },
  { n: 'II', title: 'Load balancer', text: 'Isti promet, tri poslužitelja i netko na ulazu tko dijeli zahtjeve.' },
  { n: 'III', title: 'Klaster', text: 'Poslužitelji postaju Podovi. Kad jedan padne, platforma ga sama zamijeni.' },
]

const PRINT = [0.22, 0.9, 0.25, 1] as const
const M = 24 // crop-mark margin around the sheet

/* ---------- static: clock, students ---------- */
const PosterBase = memo(function PosterBase() {
  return (
    <g>
      <g filter="url(#tk-ink)">
        <circle cx={CLOCK.x} cy={CLOCK.y} r={CLOCK.r} className={h.fKnock} />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2
          const r0 = CLOCK.r - (i % 3 ? 9 : 15)
          return (
            <line
              key={i}
              x1={CLOCK.x + Math.sin(a) * r0}
              y1={CLOCK.y - Math.cos(a) * r0}
              x2={CLOCK.x + Math.sin(a) * (CLOCK.r - 4)}
              y2={CLOCK.y - Math.cos(a) * (CLOCK.r - 4)}
              className={h.tick}
            />
          )
        })}
        <path d={`M${CLOCK.x} ${CLOCK.y}V${CLOCK.y - 40}M${CLOCK.x} ${CLOCK.y}V${CLOCK.y - 28}`} className={h.hand} />
        <circle cx={CLOCK.x} cy={CLOCK.y} r="6" className={h.fPink} />
      </g>
      <text x={CLOCK.x} y={CLOCK.y + CLOCK.r + 30} textAnchor="middle" className={h.clockLabel}>
        12:00
      </text>
      <g filter="url(#tk-ink)">
        {STUDENTS.map((st, i) => (
          <Student key={i} x={st.x} y={st.y} ink={st.ink} s={st.s} tray="paper" />
        ))}
      </g>
      <text x="36" y="368" className={h.caps}>
        studenti · Klopa
      </text>
    </g>
  )
})

/* ---------- per-act static layers ---------- */
function Bars({ bars }: { bars: readonly { x: number; y: number; w: number; h: number }[] }) {
  return (
    <g>
      {bars.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} className={h.fKnock} />
          <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="url(#tk-ht-blue)" />
          <rect x={b.x} y={b.y} width={b.w} height={b.h} className={h.barEdge} />
        </g>
      ))}
    </g>
  )
}

function Pod({ rect, state }: { rect: { x: number; y: number; w: number; h: number }; state: PodState }) {
  const { x, y, w } = rect
  const fresh = state.alive && !state.ready
  return (
    <motion.g
      initial={{ opacity: 0, x: -14, y: 6 }}
      animate={{ opacity: 1, x: 0, y: 0, transition: { duration: 0.55, delay: 0.15, ease: PRINT } }}
      exit={{ opacity: 0, x: 16, transition: { duration: 0.18 } }}
    >
      {fresh ? (
        <>
          <rect x={x} y={y} width={w} height={w} rx="13" fill="url(#tk-hatch-blue)" opacity="0.6" />
          <rect x={x} y={y} width={w} height={w} rx="13" className={h.podPending} />
        </>
      ) : (
        <rect x={x} y={y} width={w} height={w} rx="13" className={`${h.fBlue} ${h.over}`} filter="url(#tk-ink)" />
      )}
      {!state.alive && (
        <>
          <rect x={x + 5} y={y + 4} width={w} height={w} rx="13" className={`${h.fPink} ${h.over}`} />
          <path d={`M${x + 16} ${y + 16}L${x + w - 12} ${y + w - 12}M${x + w - 12} ${y + 16}L${x + 16} ${y + w - 12}`} className={h.cross} />
        </>
      )}
      <text x={x + w / 2} y={y + w + 34} textAnchor="middle" className={h.podLabel}>
        {!state.alive ? 'pao' : fresh ? 'novi' : 'radi'}
      </text>
    </motion.g>
  )
}

const ActLayer = memo(
  function ActLayer({ act, pods }: { act: Act; pods: PodState[] }) {
    return (
      <AnimatePresence initial={false}>
        {act === 0 && (
          <motion.g key="a0" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }} transition={{ duration: 0.6, ease: PRINT }}>
            <rect x={SOLO_PLATE.x} y={SOLO_PLATE.y} width={SOLO_PLATE.w} height={SOLO_PLATE.h} rx="8" className={h.plate} />
            <Bars bars={SOLO_BARS} />
            <text x="300" y="752" textAnchor="middle" className={h.caps}>
              1 poslužitelj · 3 jezgre
            </text>
          </motion.g>
        )}
        {act === 1 && (
          <motion.g key="a1" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }} transition={{ duration: 0.6, ease: PRINT }}>
            {TRIO.map((s) => (
              <g key={s.cx}>
                <line x1={LB2.x} y1={LB2.y} x2={s.cx} y2={600} className={h.spoke} />
                <rect x={s.plate.x} y={s.plate.y} width={s.plate.w} height={s.plate.h} rx="8" className={h.plate} />
                <Bars bars={s.bars} />
              </g>
            ))}
            <text x="300" y="758" textAnchor="middle" className={h.caps}>
              3 poslužitelja · isti promet
            </text>
          </motion.g>
        )}
        {act === 2 && (
          <motion.g key="a2" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }} transition={{ duration: 0.7, ease: PRINT }}>
            <rect x={CLUSTER.x} y={CLUSTER.y} width={CLUSTER.w} height={CLUSTER.h} rx={CLUSTER.r} className={h.clusterEdge} />
            {NODES.map((n, i) => (
              <g key={i}>
                <rect x={n.x} y={n.y} width={n.w} height={n.h} rx="14" className={h.node} />
                {/* the node's name as a tab on its bottom edge */}
                <rect x={n.x + 18} y={n.y + n.h - 15} width="98" height="30" rx="4" className={h.nodeTab} />
                <text x={n.x + 67} y={n.y + n.h + 7} textAnchor="middle" className={h.nodeLabel}>
                  čvor {i + 1}
                </text>
              </g>
            ))}
            {/* the Service bus: trunk, rail, and a drop to every Pod — solid only to ready ones */}
            <path d={`M${LB3.x} ${LB3.y}V${BUS_Y}M${PODS[0].x + POD / 2} ${BUS_Y}H${PODS[5].x + POD / 2}`} className={h.bus} />
            {pods.map((p) => {
              const r = PODS[p.slot]
              return <line key={p.id} x1={r.x + POD / 2} y1={BUS_Y} x2={r.x + POD / 2} y2={r.y} className={p.ready ? h.drop : h.dropIdle} />
            })}
            <g filter="url(#tk-ink)">
              <circle cx={CP.x} cy={CP.y} r={CP.r} className={h.fBlue} />
              <circle cx={CP.x} cy={CP.y} r={CP.r - 9} className={h.fKnock} />
              <circle cx={CP.x} cy={CP.y} r="5" className={h.fPink} />
            </g>
            <text x={CP.x + CP.r + 10} y={CP.y - 9} className={h.caps}>
              control plane
            </text>
            <AnimatePresence>
              {pods.map((p) => (
                <Pod key={p.id} rect={PODS[p.slot]} state={p} />
              ))}
            </AnimatePresence>
          </motion.g>
        )}
      </AnimatePresence>
    )
  },
  (a, b) => a.act === b.act && podKey(a.pods) === podKey(b.pods),
)

function podKey(p: PodState[]) {
  return p.map((x) => `${x.id}${x.alive ? 1 : 0}${x.ready ? 1 : 0}`).join('.')
}

/** Stamp landing: 1.6× → 1× in the first ~0.12 s, then it holds. */
function stampScale(age: number) {
  return age < 0.08 ? 1.6 - (age / 0.08) * 0.6 : 1
}

function needleAngle(act: Act, target: number) {
  const lb = act === 2 ? LB3 : LB2
  const p = act === 2 && target >= 0 ? { x: PODS[target].x + POD / 2, y: PODS[target].y } : targetPoint(act, target)
  if (!p) return 90
  return (Math.atan2(p.y - lb.y, p.x - lb.x) * 180) / Math.PI
}

export function Hero() {
  const reduced = useReducedMotion() ?? false
  const [sim] = useState(() => new HeroSim(0, 2.6))
  const [view, setView] = useState<HeroView>(() => sim.view())
  const [paused, setPaused] = useState(false)
  const posterRef = useRef<HTMLDivElement>(null)
  const inView = useInView(posterRef)
  const running = inView && !reduced && !paused

  const onFrame = useCallback(
    (dt: number) => {
      sim.step(dt)
      setView(sim.view())
    },
    [sim],
  )
  useFrameLoop(running, onFrame)

  const choose = (a: Act) => {
    sim.goto(a, reduced ? (a === 2 ? 4.6 : 3.4) : 1)
    setView(sim.view())
  }

  const act = view.act
  const progress = Math.min(1, view.actT / ACT_LEN[act])
  const lb = act === 2 ? LB3 : LB2

  return (
    <section className={h.hero} aria-labelledby="tk-hero-title">
      <div className={h.intro}>
        <p className={h.kicker}>
          <span>Tečaj u 24 predavanja</span>
          <span className={h.kickRule} aria-hidden="true" />
          <span>za studente računarstva</span>
        </p>
        <h1 id="tk-hero-title" className={h.title}>
          <span className={h.titleA} data-text="Kubernetes">
            Kubernetes
          </span>
          <span className={h.titleB} data-text="od nule">
            od nule
          </span>
        </h1>
      </div>

      <div className={h.text}>
        <p className={h.tagline}>Od jednog poslužitelja do platforme koja se sama popravlja.</p>
        <p className={h.lede}>
          Pratimo studentsku aplikaciju Klopa od prvog poslužitelja u studentskom domu do klastera koji sam podiže
          srušene dijelove. Svaki pojam, od load balancera do Argo CD-a, najprije vidite kako radi, a tek onda kako se
          zove.
        </p>
        <a className={h.cta} href="#sadrzaj">
          <span>Krenite od početka</span>
          <svg width="46" height="18" viewBox="0 0 46 18" aria-hidden="true">
            <path d="M0 9h40M32 2l9 7-9 7" />
          </svg>
        </a>
      </div>

      <figure className={h.figure}>
        <div className={h.poster} ref={posterRef}>
          <svg
            viewBox={`${-M} ${-M} ${PW + 2 * M} ${PH + 2 * M}`}
            role="img"
            aria-label={`Plakat, čin ${ACTS[act].n}: ${ACTS[act].title}. ${ACTS[act].text}`}
          >
            <defs>
              <clipPath id="tk-poster-sheet">
                <rect x="0" y="0" width={PW} height={PH} />
              </clipPath>
            </defs>
            {/* crop marks, printed outside the trimmed sheet */}
            <path
              className={h.crop}
              d={`M-22 0h14M0 -22v14M${PW + 22} 0h-14M${PW} -22v14M-22 ${PH}h14M0 ${PH + 22}v-14M${PW + 22} ${PH}h-14M${PW} ${PH + 22}v-14`}
            />
            <g clipPath="url(#tk-poster-sheet)">
              <rect x="0" y="0" width={PW} height={PH} className={h.flood} />
              <AnimatePresence initial={false} mode="popLayout">
                <motion.text
                  key={act}
                  x="-22"
                  y="252"
                  className={`${h.actNumeral} ${h.over}`}
                  aria-hidden="true"
                  initial={{ opacity: 0, x: -60 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 40 }}
                  transition={{ duration: 0.55, ease: PRINT }}
                >
                  {ACTS[act].n}
                </motion.text>
              </AnimatePresence>
              <PosterBase />

              <ActLayer act={act} pods={view.pods} />

              {/* heat: the single server overprinted pink as its queue fills */}
              {act === 0 && view.heat > 0.05 && (
                <g opacity={Math.min(1, view.heat * 1.1)}>
                  {SOLO_BARS.map((b, i) => (
                    <rect key={i} x={b.x + 5} y={b.y + 4} width={b.w} height={b.h} fill="url(#tk-hatch-pink)" className={h.over} />
                  ))}
                </g>
              )}

              {/* work in progress */}
              {view.busy.map((b) =>
                b.vertical ? (
                  <g key={b.key}>
                    <rect x={b.rect.x} y={b.rect.y + b.rect.h + 6} width={b.rect.w * b.prog} height="6" className={h.fInk} />
                    <ReqDot x={b.rect.x + b.rect.w / 2} y={b.rect.y + b.rect.h / 2} r={9} busy />
                  </g>
                ) : (
                  <g key={b.key}>
                    <rect x={b.rect.x} y={b.rect.y} width={b.rect.w * b.prog} height={b.rect.h} className={`${h.fBlue} ${h.over}`} />
                    <ReqDot x={b.rect.x + Math.max(11, b.rect.w * b.prog)} y={b.rect.y + b.rect.h / 2} r={act === 0 ? 11 : 9} busy />
                  </g>
                ),
              )}
              {view.queued.map((q) => (
                <ReqDot key={q.id} x={q.x} y={q.y} r={q.r} />
              ))}
              {view.dots.map((d) => (
                <ReqDot key={d.id} x={d.x} y={d.y} r={act === 0 ? 9 : 8} />
              ))}

              <AnimatePresence>
                {act > 0 && (
                  <motion.g
                    key={`lb${act}`}
                    initial={{ opacity: 0, x: -50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 50 }}
                    transition={{ duration: 0.6, ease: PRINT }}
                  >
                    <Disc
                      x={lb.x}
                      y={lb.y}
                      r={lb.r}
                      knockout
                      id={`tk-hero-rim-${act}`}
                      angle={needleAngle(act, view.target)}
                      rim={act === 1 ? 'LOAD BALANCER · ' : 'SERVICE · KLOPA-API · '}
                    />
                  </motion.g>
                )}
              </AnimatePresence>

              {view.fx.map((f) =>
                f.kind === 'ok' ? (
                  <circle key={f.id} cx={f.x} cy={f.y} r={5 + f.age * 11} className={h.okRing} opacity={1 - f.age} />
                ) : (
                  // a stamp lands: it comes down big and fast, then holds and fades
                  <g key={f.id} transform={`translate(${f.x} ${f.y}) scale(${stampScale(f.age)}) translate(${-f.x} ${-f.y})`}>
                    <Stamp
                      x={f.x}
                      y={f.y}
                      label={f.label}
                      rot={act === 0 ? [-9, 7, -4][f.id % 3] : jitter(f.id) * 14}
                      size={act === 0 ? 1.7 : 1.15}
                      solid
                      opacity={Math.min(1, 2.4 * (1 - f.age), f.age * 14)}
                    />
                  </g>
                ),
              )}
              {act === 0 && view.heat > 0.85 && <Stamp x={428} y={556} label="PREOPTEREĆEN" rot={-6} size={1.45} solid />}
            </g>
          </svg>
        </div>

        <figcaption className={h.acts}>
          <ol className={h.actList} aria-label="Priča tečaja u tri čina">
            {ACTS.map((a, i) => (
              <li key={a.n}>
                <button type="button" className={h.actBtn} aria-pressed={act === i} onClick={() => choose(i as Act)}>
                  <span className={h.actN}>{a.n}</span>
                  <span className={h.actTitle}>{a.title}</span>
                  <span className={h.actBar} aria-hidden="true">
                    <span style={{ transform: `scaleX(${act === i ? (reduced ? 1 : progress) : 0})` }} />
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <p className={h.actText}>
            <span className={h.actTextN}>Čin {ACTS[act].n}.</span> {ACTS[act].text}
            {!reduced && (
              <button type="button" className={h.pause} onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
                {paused ? 'Nastavi' : 'Zaustavi'}
              </button>
            )}
          </p>
        </figcaption>
      </figure>
    </section>
  )
}
