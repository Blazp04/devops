import { DBar, Rough, fmt } from '../../../kit'
import { fmtSec } from '../lb'
import { HIST_BINS, HIST_BIN_MS, type AlgoResult } from './compare'
import css from '../styles.module.css'

/* Small multiples: one sheet per algorithm, same traffic. A pencil histogram of how long the successful requests
   took, with the average and the p95 / p99 marked on it, then each server's CPU and share of the traffic. */

const W = 300
const X0 = 18
const X1 = 286
const HY0 = 70
const HY1 = 140
const MAX_MS = HIST_BINS * HIST_BIN_MS

const xOf = (ms: number) => X0 + (Math.min(MAX_MS, Math.max(0, ms)) / MAX_MS) * (X1 - X0)

function Sheet({ r, idx, yMax }: { r: AlgoResult; idx: number; yMax: number }) {
  const bad = r.errPct >= 0.5
  const bw = (X1 - X0) / HIST_BINS
  const rows = r.servers.length
  const H = 252 + rows * 24
  const marks: { ms: number | null; label: string; dash?: string; color: string }[] = [
    { ms: r.mean, label: 'prosjek', dash: '5 4', color: 'var(--ink-2)' },
    { ms: r.p95, label: 'p95', color: 'var(--red)' },
    { ms: r.p99, label: 'p99', dash: '2 3', color: 'var(--red)' },
  ]
  return (
    <figure className={css.multiple}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${r.label}: greške ${fmt.num(r.errPct, 1)} %, prosjek ${fmtSec(r.mean)}, p95 ${fmtSec(r.p95)}, p99 ${fmtSec(r.p99)}.`}>
        <Rough shape={{ k: 'rect', x: 2, y: 2, w: W - 4, h: H - 4 }} seed={5100 + idx} stroke="var(--ink-3)" strokeWidth={1.3} roughness={1.2} />
        <text x={14} y={30} className="k-svg-display" style={{ fontSize: 20 }}>
          {r.label}
        </text>
        <text x={14} y={54} className="k-svg-mono" style={{ fontSize: 15, fill: bad ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>
          {bad ? '✗' : '✓'} greške {fmt.num(r.errPct, 1)} %
        </text>
        {/* histogram */}
        {r.hist.map((n, i) => {
          if (!n) return null
          const h = (n / yMax) * (HY1 - HY0)
          return (
            <Rough
              key={i}
              shape={{ k: 'rect', x: X0 + i * bw + 1, y: HY1 - h, w: bw - 2, h }}
              seed={5200 + i}
              stroke="var(--tray-ink)"
              strokeWidth={1}
              roughness={0.6}
              fillColor="var(--tray)"
              fillStyle="hachure"
              hachureGap={3.5}
              fillWeight={1}
            />
          )
        })}
        <Rough shape={{ k: 'line', x1: X0, y1: HY1, x2: X1, y2: HY1 }} seed={5301} stroke="var(--ink-2)" strokeWidth={1.4} />
        {[0, 1, 2, 3, 4, 5].map((s) => (
          <text key={s} x={xOf(s * 1000)} y={HY1 + 17} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 13, fill: 'var(--ink-3)' }}>
            {s} s
          </text>
        ))}
        {marks.map((mk, i) =>
          mk.ms === null ? null : (
            <g key={mk.label}>
              <Rough shape={{ k: 'line', x1: xOf(mk.ms), y1: HY0 - 8 + i * 0, x2: xOf(mk.ms), y2: HY1 }} seed={5310 + i} stroke={mk.color} strokeWidth={2} dash={mk.dash} roughness={0.5} />
            </g>
          ),
        )}
        <text x={14} y={HY1 + 42} className="k-svg-mono" style={{ fontSize: 14, fill: 'var(--ink-2)' }}>
          prosjek {fmtSec(r.mean)}
        </text>
        <text x={14} y={HY1 + 62} className="k-svg-mono" style={{ fontSize: 14, fill: 'var(--red)', fontWeight: 600 }}>
          p95 {fmtSec(r.p95)} · p99 {fmtSec(r.p99)}
        </text>
        <text x={W - 14} y={HY1 + 90} textAnchor="end" className="k-svg-hand" style={{ fontSize: 18.5, fill: 'var(--ink-3)' }}>
          CPU · udio prometa
        </text>
        {/* servers: CPU and share of the traffic */}
        {r.servers.map((v, i) => {
          const y = HY1 + 112 + i * 24
          const hot = v.cpu >= 0.9
          return (
            <g key={v.id}>
              <text x={14} y={y + 5} className="k-svg-mono" style={{ fontSize: 13.5 }}>
                {v.name.length > 8 ? v.name.slice(0, 8) : v.name}
              </text>
              <DBar x={92} y={y - 7} w={100} h={12} value={v.cpu} />
              <text x={W - 14} y={y + 5} textAnchor="end" className="k-svg-mono" style={{ fontSize: 13.5, fill: hot ? 'var(--red)' : 'var(--ink-2)' }}>
                {Math.round(v.cpu * 100)} % · {Math.round(v.share * 100)} %
              </text>
            </g>
          )
        })}
      </svg>
    </figure>
  )
}

export function CompareRuns({ results, caption }: { results: AlgoResult[]; caption: string }) {
  const yMax = Math.max(1, ...results.flatMap((r) => r.hist))
  return (
    <div className={css.compare}>
      <p className={css.compareHead}>
        <span className={css.handLabel}>isti promet, tri algoritma →</span> {caption}
      </p>
      <div className={css.multiples}>
        {results.map((r, i) => (
          <Sheet key={r.algo} r={r} idx={i} yMax={yMax} />
        ))}
      </div>
      <p className={css.compareFoot}>
        Narančasti stupci: koliko je uspješnih zahtjeva trajalo toliko. Crtkana crta je prosjek, crvena puna p95, a crvena točkasta p99. Ispod: opterećenje procesora i udio prometa svakog poslužitelja.
      </p>
    </div>
  )
}
