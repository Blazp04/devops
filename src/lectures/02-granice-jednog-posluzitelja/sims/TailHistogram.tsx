import { useState } from 'react'
import { Arrow, Figure, Rough, Slider, Stat, StatRow, fmt, plural, useWidth, type Pt } from '../../../kit'
import { fmtLat } from '../model'
import { TAIL_N, withTail } from '../tail'
import styles from '../styles.module.css'

const BIN_MS = 100
const MAX_MS = 10_000
const BINS = MAX_MS / BIN_MS

const MARKS = [
  { key: 'mean', label: 'prosjek', color: 'var(--ink)', dash: '6 4', seed: 2741 },
  { key: 'p50', label: 'p50', color: 'var(--pen)', dash: undefined, seed: 2742 },
  { key: 'p95', label: 'p95', color: 'var(--orange)', dash: '3 3', seed: 2743 },
  { key: 'p99', label: 'p99', color: 'var(--red)', dash: undefined, seed: 2744 },
] as const

/** The outline of a run of bars as one stepped polygon (drawn with the pen, hatched in one go). */
function stepOutline(counts: number[], x0: number, bw: number, base: number, y: (c: number) => number): Pt[] | null {
  const first = counts.findIndex((c) => c > 0)
  if (first < 0) return null
  let last = first
  counts.forEach((c, i) => {
    if (c > 0) last = i
  })
  const pts: Pt[] = [[x0 + first * bw, base]]
  for (let i = first; i <= last; i++) {
    const top = counts[i] > 0 ? y(counts[i]) : base
    pts.push([x0 + i * bw, top], [x0 + (i + 1) * bw, top])
  }
  pts.push([x0 + (last + 1) * bw, base])
  return pts
}

/** Histogram of 200 latencies with the slow tail hatched red, and the mean / p50 / p95 / p99 lines drawn on it. */
function Histogram({ k, slowMs, narrow }: { k: number; slowMs: number; narrow: boolean }) {
  const st = withTail(k, slowMs)
  const W = narrow ? 380 : 720
  const H = narrow ? 342 : 312
  const pad = { l: narrow ? 34 : 44, r: 16, t: 108, b: 58 }
  const plotW = W - pad.l - pad.r
  const plotH = H - pad.t - pad.b
  const counts = new Array<number>(BINS).fill(0)
  const slow = new Array<number>(BINS).fill(0)
  st.lats.forEach((v, i) => {
    const b = Math.min(BINS - 1, Math.floor(v / BIN_MS))
    if (st.slowIdx.has(i)) slow[b]++
    else counts[b]++
  })
  const maxC = Math.max(10, ...counts.map((c, i) => c + slow[i]))
  const x = (ms: number) => pad.l + (Math.min(ms, MAX_MS) / MAX_MS) * plotW
  const y = (c: number) => pad.t + plotH - (c / maxC) * plotH
  const bw = plotW / BINS
  const normalOutline = stepOutline(counts, pad.l, bw, pad.t + plotH, y)
  const values = { mean: st.mean, p50: st.p50, p95: st.p95, p99: st.p99 }
  const ticks = narrow ? [0, 2, 4, 6, 8, 10] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Histogram ${TAIL_N} uspješnih zahtjeva: prosjek ${fmtLat(st.mean)}, p50 ${fmtLat(st.p50)}, p95 ${fmtLat(st.p95)}, p99 ${fmtLat(st.p99)}.`}
      style={{ display: 'block', width: '100%', maxWidth: narrow ? 460 : undefined, height: 'auto', margin: '0 auto', overflow: 'visible' }}
    >
      {/* the usual requests as one hatched pencil silhouette (−41°), the slow ones as red bars hatched the other way */}
      {normalOutline && (
        <Rough shape={{ k: 'poly', pts: normalOutline }} seed={2730} stroke="var(--ink-2)" strokeWidth={1.1} roughness={0.6} fillColor="var(--hl-blue-ink)" hachureAngle={-41} hachureGap={3.2} fillWeight={1.2} />
      )}
      {slow.map((c, i) =>
        c > 0 ? (
          <Rough
            key={`s${i}`}
            shape={{ k: 'rect', x: pad.l + i * bw, y: y(c + counts[i]), w: Math.max(3, bw), h: y(counts[i]) - y(c + counts[i]) }}
            seed={2731 + (i % 7)}
            stroke="var(--red)"
            strokeWidth={1.2}
            roughness={0.6}
            fillColor="var(--red)"
            hachureAngle={41}
            hachureGap={2.6}
            fillWeight={1.1}
          />
        ) : null,
      )}
      {/* the slow tail gets a handwritten name, so four requests are not lost in the drawing */}
      {k > 0 && (() => {
        const tx = x(slowMs + 150)
        const left = tx > W - 190
        const ty = pad.t + plotH - 46
        return (
          <g>
            <text x={left ? tx - 30 : tx + 30} y={ty} textAnchor={left ? 'end' : 'start'} className="k-svg-hand" style={{ fontSize: 21, fill: 'var(--red)' }}>
              {plural(k, ['spori zahtjev', 'spora zahtjeva', 'sporih zahtjeva'])}
            </text>
            <Arrow
              pts={[
                [left ? tx - 26 : tx + 26, ty - 4],
                [left ? tx - 10 : tx + 10, ty + 14],
                [tx + (left ? -3 : 3), pad.t + plotH - 10],
              ]}
              stroke="var(--red)"
              strokeWidth={1.5}
              seed={2720}
              head={7}
            />
          </g>
        )
      })()}
      {/* axes */}
      <Rough shape={{ k: 'line', x1: pad.l, y1: pad.t + plotH + 1, x2: W - pad.r + 4, y2: pad.t + plotH + 1 }} seed={2701} stroke="var(--ink-2)" strokeWidth={1.5} roughness={0.8} />
      {ticks.map((t) => (
        <text key={t} x={x(t * 1000)} y={pad.t + plotH + 22} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 14.5, fill: 'var(--ink-2)' }}>
          {t}
        </text>
      ))}
      <text x={W - pad.r} y={pad.t + plotH + 48} textAnchor="end" className="k-svg-hand" style={{ fontSize: 21, fill: 'var(--ink-2)' }}>
        latencija (s) →
      </text>
      {/* the four lines, then their labels (each on its own row, on a scrap of paper so no line runs through the words) */}
      {MARKS.map((mk, row) => {
        const lx = x(values[mk.key])
        return <Rough key={mk.key} shape={{ k: 'line', x1: lx, y1: 24 + row * 24 + 6, x2: lx, y2: pad.t + plotH }} seed={mk.seed} stroke={mk.color} strokeWidth={2} roughness={0.5} dash={mk.dash} />
      })}
      {MARKS.map((mk, row) => {
        const v = values[mk.key]
        const lx = x(v)
        const ly = 24 + row * 24
        const text = `${mk.label} ${fmtLat(v)}`
        const tw = text.length * 21 * 0.43
        const anchor = lx + tw + 10 > W ? 'end' : 'start'
        const tx = anchor === 'end' ? lx - 6 : lx + 6
        return (
          <g key={mk.key}>
            <rect x={anchor === 'end' ? tx - tw - 3 : tx - 3} y={ly - 15} width={tw + 6} height={22} rx={3} style={{ fill: 'var(--paper)', opacity: 0.92 }} />
            <text x={tx} y={ly + 2} textAnchor={anchor} className="k-svg-hand" style={{ fontSize: 21, fill: mk.color }}>
              {text}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** Scene „Prosjek laže”: drag the slow tail out and watch the mean barely move while p99 (then p95) jumps. */
export function TailHistogram() {
  const [k, setK] = useState(4)
  const [slowS, setSlowS] = useState(6)
  const [ref, width] = useWidth<HTMLDivElement>()
  const narrow = width !== null && width < 640
  const base = withTail(0, 0)
  const st = withTail(k, slowS * 1000)
  const delta = (a: number, b: number) => {
    const r = a / b
    return r < 1.05 ? `bez repa ${fmtLat(b)}` : r < 1.95 ? `+${fmt.pct(r - 1)} (bez repa ${fmtLat(b)})` : `${fmt.num(r, 1)}× (bez repa ${fmtLat(b)})`
  }
  return (
    <Figure wide caption={`${TAIL_N} uspješnih zahtjeva iz simulacije u 11:58 (I/O, 2 vCPU / 2 GB, 4 zahtjeva/s, seed 42). Percentili metodom najbližeg ranga.`}>
      <div ref={ref}>
        <div className={styles.controlsRow}>
          <Slider label="Sporih zahtjeva" value={k} min={0} max={20} onChange={setK} format={(v) => `${v} od ${TAIL_N} (${fmt.num((v / TAIL_N) * 100, 1)} %)`} />
          <Slider label="Spori traju" value={slowS} min={2} max={10} step={0.5} onChange={setSlowS} format={(v) => `${fmt.num(v, 1)} s`} />
        </div>
        <Histogram k={k} slowMs={slowS * 1000} narrow={narrow} />
        <StatRow>
          <Stat label="Prosjek" value={fmtLat(st.mean)} sub={delta(st.mean, base.mean)} />
          <Stat label="p50" value={fmtLat(st.p50)} sub={delta(st.p50, base.p50)} />
          <Stat label="p95" value={fmtLat(st.p95)} sub={delta(st.p95, base.p95)} tone={st.p95 > 2 * base.p95 ? 'bad' : 'neutral'} />
          <Stat label="p99" value={fmtLat(st.p99)} sub={delta(st.p99, base.p99)} tone={st.p99 > 2 * base.p99 ? 'bad' : 'neutral'} />
        </StatRow>
      </div>
    </Figure>
  )
}
