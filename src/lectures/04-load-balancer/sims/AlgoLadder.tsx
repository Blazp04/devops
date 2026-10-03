import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Rough, StepBadge, Stepper, Tray, stepColor, useWidth } from '../../../kit'
import { ALGO_LABEL, type Algo } from '../../../engines/traffic'
import { LADDER_GAP_MS, LADDER_N, ladderOf, type Rung } from './ladder'
import { HandNote } from './Sketches'
import css from '../styles.module.css'

/* „Ljestve algoritama”: the same 12 requests (same sizes, one every 0,15 s, nothing else on the servers) sent to
   Mali, Srednji and Veliki by each algorithm in turn. Lanes = servers, columns = request number. For least
   connections every cell also shows how many requests that server had open when the decision was made. */

const SERVERS = [
  { id: 's1', name: 'Mali', fair: 12 / 7 },
  { id: 's2', name: 'Srednji', fair: 24 / 7 },
  { id: 's3', name: 'Veliki', fair: 48 / 7 },
]

interface Geo {
  W: number
  H: number
  x0: number
  col: number
  top: number
  lane0: number
  laneH: number
  countX: number
  label: number
  mono: number
  hand: number
  tray: number
  showMs: boolean
}

/** drawing units per second for a tray dropping into its lane */
const DROP_SPEED = 520

const WIDE: Geo = { W: 760, H: 322, x0: 112, col: 46, top: 52, lane0: 130, laneH: 56, countX: 700, label: 19, mono: 13.5, hand: 21, tray: 30, showMs: true }
const NARROW: Geo = { W: 340, H: 316, x0: 60, col: 21.5, top: 50, lane0: 128, laneH: 54, countX: 326, label: 15, mono: 12.5, hand: 18, tray: 17, showMs: false }

function Ladder({ algo, rungs, narrow, stepNo, notes }: { algo: Algo | null; rungs: Rung[]; narrow: boolean; stepNo: number; notes: string[] }) {
  const g = narrow ? NARROW : WIDE
  const cx = (i: number) => g.x0 + i * g.col + g.col / 2
  const ly = (k: number) => g.lane0 + k * g.laneH
  const lc = algo === 'lc' || algo === 'wlc' || algo === 'p2c'
  const counts = SERVERS.map((sv) => rungs.filter((r) => r.server === sv.id).length)
  const c = stepColor(stepNo)
  const maxMs = Math.max(...rungs.map((r) => r.cpuMs))
  const reduce = useReducedMotion()
  return (
    <svg
      className={`${css.drawing} ${narrow ? css.drawingNarrow : ''}`}
      viewBox={`0 0 ${g.W} ${g.H}`}
      role="img"
      aria-label={
        algo
          ? `${ALGO_LABEL[algo]}: od 12 zahtjeva Mali dobiva ${counts[0]}, Srednji ${counts[1]}, Veliki ${counts[2]}. Prema snazi bi bilo otprilike 2, 3 i 7.`
          : 'Dvanaest zahtjeva različite veličine čeka da ih load balancer rasporedi na Malog, Srednjeg i Velikog.'
      }
    >
      {/* the 12 requests, sized by how much CPU they need */}
      <text x={6} y={g.top + 6} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--ink-2)' }}>
        {narrow ? 'zahtjevi' : 'zahtjevi →'}
      </text>
      {rungs.map((r, i) => {
        const w = g.tray * (0.7 + 0.6 * Math.sqrt(r.cpuMs / maxMs))
        return (
          <g key={i}>
            <Tray x={cx(i)} y={g.top - 4} w={w} />
            <text x={cx(i)} y={g.top + 18} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--ink-3)' }}>
              {r.n}
            </text>
            {g.showMs && (
              <text x={cx(i)} y={g.top + 34} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 13, fill: r.cpuMs > 500 ? 'var(--red)' : 'var(--ink-3)' }}>
                {Math.round(r.cpuMs)}
              </text>
            )}
          </g>
        )
      })}
      {g.showMs && (
        <text x={g.x0 + LADDER_N * g.col + 4} y={g.top + 34} className="k-svg-mono" style={{ fontSize: 13, fill: "var(--ink-3)" }}>
          ms
        </text>
      )}
      {/* lanes */}
      {SERVERS.map((sv, k) => (
        <g key={sv.id}>
          <text x={6} y={ly(k) + 6} className="k-svg-display" style={{ fontSize: g.label }}>
            {sv.name}
          </text>
          <Rough shape={{ k: 'line', x1: g.x0, y1: ly(k) + 16, x2: g.x0 + LADDER_N * g.col, y2: ly(k) + 16 }} seed={6300 + k} stroke="var(--ink-3)" strokeWidth={1.2} />
          {algo && (
            <text x={g.countX} y={ly(k) + 7} textAnchor="end" className="k-svg-mono" style={{ fontSize: narrow ? 15 : 18, fontWeight: 700, fill: c }}>
              {counts[k]}
            </text>
          )}
        </g>
      ))}
      {algo &&
        rungs.map((r, i) => {
          const k = SERVERS.findIndex((sv) => sv.id === r.server)
          // the requests are routed one by one, in order: each tray drops from the top row into its lane
          // (straight down at one constant speed); the counts it was decided on appear when it lands
          const dist = k >= 0 ? ly(k) + 2 - (g.top - 4) : 0
          const delay = 0.25 + i * 0.12
          const dur = dist / DROP_SPEED
          return (
            <g key={`${algo}-${i}`}>
              <motion.g initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + dur, duration: 0.15 }}>
                {lc &&
                  !narrow &&
                  SERVERS.map((sv, j) =>
                    j === k ? null : (
                      <text key={sv.id} x={cx(i)} y={ly(j) + 10} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 13, fill: 'var(--ink-3)' }}>
                        {r.active[sv.id]}
                      </text>
                    ),
                  )}
                {k >= 0 && lc && !narrow && (
                  <text x={cx(i)} y={ly(k) - 16} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 13, fontWeight: 700, fill: 'var(--pen)' }}>
                    {r.active[SERVERS[k].id]}
                  </text>
                )}
              </motion.g>
              {k >= 0 && (
                <motion.g initial={reduce ? false : { opacity: 0, y: -dist }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: dur, ease: 'linear' }}>
                  <Tray x={cx(i)} y={ly(k) + 2} w={g.tray} />
                </motion.g>
              )}
            </g>
          )
        })}
      {!narrow && algo && (
        <text x={g.countX} y={g.lane0 - 26} textAnchor="end" className="k-svg-hand" style={{ fontSize: 19, fill: 'var(--ink-2)' }}>
          dobio
        </text>
      )}
      <StepBadge n={stepNo + 1} x={narrow ? 14 : 18} y={g.H - 28} color={c} r={narrow ? 12 : 13} />
      <HandNote x={narrow ? 32 : 40} y={g.H - 22} lines={notes} size={g.hand} color={c} />
    </svg>
  )
}

interface LadderStep {
  algo: Algo | null
  title: string
  body: ReactNode
  notes: [string[], string[]]
}

const MAIN: LadderStep[] = [
  {
    algo: null,
    title: 'Dvanaest istih zahtjeva',
    body: (
      <>
        Svaki algoritam dobiva isti niz: 12 zahtjeva, jedan svakih {LADDER_GAP_MS} ms, a poslužitelji su prazni. Zahtjevi nisu jednako teški – broj ispod pladnja govori koliko milisekundi procesora treba (prosjek je 200&nbsp;ms).
      </>
    ),
    notes: [['isti promet za svaki algoritam'], ['isti promet za sve']],
  },
  {
    algo: 'random',
    title: 'Nasumično',
    body: <>Svaki zahtjev ide nasumično odabranom ispravnom poslužitelju. U prosjeku svaki poslužitelj dobije trećinu, ali u kratkom nizu raspodjela zna biti neravnomjerna.</>,
    notes: [['nasumično: otprilike trećina svakome'], ['trećina svakome, ugrubo']],
  },
  {
    algo: 'rr',
    title: 'Kružno (round robin)',
    body: <>Redom, ukrug: Mali, Srednji, Veliki, Mali… Točno 4 · 4 · 4. Pošteno po broju zahtjeva – a Veliki je četiri puta jači od Malog.</>,
    notes: [['kružno: 4 · 4 · 4, a prema snazi ≈ 2 · 3 · 7'], ['4 · 4 · 4, a snaga 1 : 2 : 4']],
  },
  {
    algo: 'wrr',
    title: 'Težinsko kružno',
    body: (
      <>
        Redom, ali s težinama 1 : 2 : 4 (prema kapacitetu 5, 10 i 20 zahtjeva/s). NGINX ih glatko isprepliće – V, S, V, M, V, S, V – umjesto da Velikom pošalje četiri zaredom. Težine su statične: postavljate ih vi.
      </>
    ),
    notes: [['težinsko: 2 · 3 · 7, kao snaga 1 : 2 : 4'], ['2 · 3 · 7 = snaga 1 : 2 : 4']],
  },
  {
    algo: 'lc',
    title: 'Najmanje veza',
    body: (
      <>
        Svaki zahtjev ide poslužitelju koji trenutačno ima najmanje zahtjeva u obradi i u redu (sivi brojevi; plavi je broj kod odabranog). Kod izjednačenja odlučuje slučaj. Algoritam ne zna za snagu, ali spor poslužitelj sporije
        završava – pa se kod njega nakupe veze i dobiva manje novih. Pri ovako malom prometu nitko nije zauzet, pa je najmanje veza gotovo nasumično (3 · 5 · 4). Razlika se vidi tek pod opterećenjem – u simulaciji
        ispod i kad se Veliki uspori.
      </>
    ),
    notes: [['najmanje veza: nitko nije zauzet → gotovo nasumično'], ['malo prometa → gotovo nasumično']],
  },
]

const ADVANCED: LadderStep[] = [
  {
    algo: 'wlc',
    title: 'Težinski najmanje veza',
    body: <>Bira najmanji (aktivni + 1) ÷ težina. Na praznim poslužiteljima to je Veliki (1 ÷ 4). Mali, s (0 + 1) ÷ 1 = 1, dolazi u obzir tek kad Srednji ima barem jedan, a Veliki barem tri nezavršena zahtjeva – dugo prije nego što se napune.</>,
    notes: [['(aktivni + 1) ÷ težina'], ['(aktivni + 1) ÷ težina']],
  },
  {
    algo: 'p2c',
    title: 'Dva nasumična izbora',
    body: <>Izvuku se dva različita nasumična poslužitelja; ide manje opterećenom. Gotovo jednako dobro kao „najmanje veza”, a radi i kad mnogo load balancera dijeli iste poslužitelje (Envoy: LEAST_REQUEST).</>,
    notes: [['dva nasumična, ide manje zauzetom'], ['dva nasumična → manje zauzet']],
  },
  {
    algo: 'lrt',
    title: 'Najkraće vrijeme odgovora',
    body: <>Bira najmanji umnožak (prosječno vrijeme odgovora) × (aktivni + 1). Prosjek se računa iz nedavnih odgovora (EWMA), pa reagira na spore poslužitelje – ali tek kad oni odgovore.</>,
    notes: [['vrijeme odgovora × (aktivni + 1)'], ['vrijeme × (aktivni + 1)']],
  },
]

export function AlgoLadder({ advanced }: { advanced?: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const narrow = w !== null && w < 720
  const steps = advanced ? ADVANCED : MAIN
  return (
    <Stepper steps={steps.map((s) => ({ title: s.title, body: s.body }))} title={advanced ? 'Još tri algoritma' : 'Ljestve algoritama'} autoPlay={0}>
      {(step) => {
        const s = steps[step]
        const rungs = ladderOf(s.algo ?? 'rr')
        return (
          <div ref={ref} className={css.stage}>
            <Ladder algo={s.algo} rungs={rungs} narrow={narrow} stepNo={step} notes={narrow ? s.notes[1] : s.notes[0]} />
          </div>
        )
      }}
    </Stepper>
  )
}
