/**
 * Read-outs of detail A drawn as instruments, not dashboard tiles:
 * a strip-chart recorder (paper scrolls, pens write), a p95 dial with an SLA mark,
 * a red-pencil tally of errors and dimension lines for "who gets the traffic".
 * Every instrument is drawn 1 unit = 1 px at its real width, so text never shrinks.
 */
import { useId, useMemo } from 'react'
import { Defs } from './Draw'
import { hr, roughLine, safeId } from './geom'
import { CPU_MS, QUEUE_MAX, SAMPLE_MS, SERIES_LEN, SLA_MS, SPECS, type Sample, type SrvView } from './lbModel'
import { useWidth } from './useWidth'
import m from './sim.module.css'

const VMAX = 40

export function StripRecorder({ series, t, now }: { series: Sample[]; t: number; now: Sample }) {
  const uid = safeId(useId())
  const [ref, w] = useWidth<HTMLDivElement>((vw) => (vw < 860 ? vw - 60 : 460))
  const W = Math.max(260, w)
  const H = 150
  const px0 = 20
  const px1 = W - 20
  const top = 10
  const bot = 136
  const penX = px1 - 44
  const dx = (penX - px0) / SERIES_LEN
  const y = (v: number) => bot - 6 - (Math.min(VMAX + 2, v) / VMAX) * (bot - top - 14)
  const lastSampleT = Math.floor(t / SAMPLE_MS) * SAMPLE_MS
  const xAt = (time: number) => penX - ((t - time) / SAMPLE_MS) * dx
  const n = series.length
  const pts = (k: keyof Sample) =>
    series.map((p, i) => `${i ? 'L' : 'M'}${xAt(lastSampleT - (n - 1 - i) * SAMPLE_MS).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ') +
    ` L${penX},${y(now[k]).toFixed(1)}`
  // paper moves: vertical grid lines are glued to sim time
  const lines: { x: number; major: boolean; sec: number }[] = []
  for (let sec = Math.floor(t / 1000); ; sec--) {
    const x = xAt(sec * 1000)
    if (x < px0) break
    if (x <= penX) lines.push({ x, major: sec % 5 === 0, sec })
  }
  return (
    <div ref={ref} className={m.instr}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className={m.instrSvg} role="img" aria-label="Zapisnik zadnjih 30 sekundi: obrađeni zahtjevi, greške i dolazni promet λ.">
        <Defs uid={uid} />
        <clipPath id={`${uid}-paper`}>
          <rect x={px0} y={top} width={penX - px0} height={bot - top} />
        </clipPath>
        <rect x={px0} y={top} width={px1 - px0} height={bot - top} className={m.paper} />
        {[0, 10, 20, 30, 40].map((v) => (
          <path key={v} d={`M${px0},${y(v)} H${px1}`} className={v % 20 ? m.gridMinor : m.gridMajor} />
        ))}
        {lines.map((l) => (
          <path key={l.sec} d={`M${l.x},${top} V${bot}`} className={l.major ? m.gridMajor : m.gridMinor} />
        ))}
        <g clipPath={`url(#${uid}-paper)`}>
          {n > 1 && <path d={pts('lam')} className={m.penLam} />}
          {n > 1 && <path d={pts('thr')} className={m.penInk} />}
          {n > 1 && <path d={pts('err')} className={m.penRed} />}
          {lines
            .filter((l) => l.major && l.x > px0 + 18 && (dx * 10 >= 46 || l.sec % 10 === 0))
            .map((l) => (
              <text key={l.sec} x={l.x + 3} y={top + 13} className={m.paperTxt}>
                {l.sec} s
              </text>
            ))}
        </g>
        {[0, 20, 40].map((v) => (
          <text key={v} x={px0 + 4} y={y(v) - 3} className={m.paperTxt}>
            {v}
          </text>
        ))}
        {/* rolls: take-up (left) and supply (right), drawn as cylinders in elevation */}
        {[2, W - 18].map((x) => (
          <g key={x} className={m.roll}>
            <path d={`M${x},${top - 4} V${bot + 4} M${x + 16},${top - 4} V${bot + 4} M${x + 5},${top - 4} V${bot + 4}`} />
            <path d={`M${x},${top - 4} A8,3 0 0 1 ${x + 16},${top - 4} A8,3 0 0 1 ${x},${top - 4} M${x},${bot + 4} A8,3 0 0 0 ${x + 16},${bot + 4}`} />
          </g>
        ))}
        {/* pen carriage */}
        <path d={`M${penX},${top - 6} V${bot + 6}`} className={m.carriage} />
        <path d={`M${penX},${y(now.lam)} l7,-4 v8 Z`} className={m.tipLam} />
        <path d={`M${penX},${y(now.thr)} l9,-5 v10 Z`} className={m.tipInk} />
        <path d={`M${penX},${y(now.err)} l9,-5 v10 Z`} className={m.tipRed} />
        <text x={penX + 12} y={bot + 12} className={m.paperTxt}>
          sada
        </text>
        <text x={px0} y={H - 1} className={m.paperTxt}>
          ← papir se odmata ulijevo · 30 s
        </text>
      </svg>
      <p className={m.keys}>
        <span className={m.keyInk}>obrađeno {hr(now.thr, 1)}/s</span>
        <span className={m.keyLam}>λ {hr(now.lam)}/s</span>
        <span className={m.keyRed}>greške {hr(now.err, 1)}/s</span>
      </p>
    </div>
  )
}

const G_MAX = 4
const SLA = SLA_MS / 1000

/** p95 dial: 0–4 s, the band past the target is red cross-hatching; the needle turns red only past the target. */
export function P95Gauge({ p95 }: { p95: number | null }) {
  const uid = safeId(useId())
  const [ref, w] = useWidth<HTMLDivElement>((vw) => (vw < 860 ? (vw - 60) / 2 : 230))
  const W = Math.max(150, Math.min(w, 300))
  const R = Math.min(W / 2 - 14, 92)
  const cx = W / 2
  const cy = R + 16
  const H = cy + 34
  const a = (v: number) => Math.PI + (Math.min(v, G_MAX) / G_MAX) * Math.PI
  const P = (v: number, r: number) => [cx + r * Math.cos(a(v)), cy + r * Math.sin(a(v))] as const
  const sec = p95 === null ? null : p95 / 1000
  const needle = sec === null ? 0 : Math.min(sec, G_MAX + 0.15)
  const ang = (needle / G_MAX) * 180
  const [s1x, s1y] = P(SLA, R)
  const [s4x, s4y] = P(G_MAX, R)
  const [i1x, i1y] = P(SLA, R - 9)
  const [i4x, i4y] = P(G_MAX, R - 9)
  const [kx1, ky1] = P(SLA, R + 4)
  const [kx2, ky2] = P(SLA, R - 16)
  const over = sec !== null && sec > SLA
  return (
    <div ref={ref} className={m.instr}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className={m.instrSvg} role="img" aria-label={sec === null ? 'p95 odziva: još nema podataka' : `p95 odziva ${hr(sec, 2)} s; cilj je najviše ${hr(SLA, 1)} s.`}>
        <Defs uid={uid} />
        <path
          d={`M${s1x},${s1y} A${R},${R} 0 0 1 ${s4x},${s4y} L${i4x},${i4y} A${R - 9},${R - 9} 0 0 0 ${i1x},${i1y} Z`}
          fill={`url(#${uid}-hr)`}
          className={m.slaBand}
        />
        <path d={`M${cx - R},${cy} A${R},${R} 0 0 1 ${cx + R},${cy}`} className={m.dialArc} />
        {Array.from({ length: G_MAX * 4 + 1 }, (_, k) => {
          const v = k / 4
          const major = k % 4 === 0
          const [x1, y1] = P(v, R)
          const [x2, y2] = P(v, R - (major ? 12 : 6))
          return <path key={k} d={`M${x1},${y1} L${x2},${y2}`} className={major ? m.tickMajor : m.tick} />
        })}
        <path d={`M${kx1},${ky1} L${kx2},${ky2}`} className={m.slaTick} />
        {[0, 1, 2, 3, 4].map((v) => {
          const [x, y] = P(v, R - 24)
          return (
            <text key={v} x={x} y={y + 4} textAnchor="middle" className={m.dialTxt}>
              {v}
            </text>
          )
        })}
        <text x={4} y={H - 4} className={m.dialRed}>
          cilj ≤ {hr(SLA, 1)} s
        </text>
        <g style={{ transform: `rotate(${ang}deg)`, transformOrigin: `${cx}px ${cy}px`, transition: 'transform 0.45s linear' }}>
          <path d={`M${cx + 10},${cy} L${cx - R + 16},${cy}`} className={over ? m.needleRed : m.needle} />
        </g>
        <circle cx={cx} cy={cy} r={4.5} className={m.hub} />
        <text x={W - 4} y={H - 4} textAnchor="end" className={over ? m.readRed : m.readInk}>
          {sec === null ? '—' : sec > G_MAX ? `> ${G_MAX} s` : `${hr(sec, 2)} s`}
        </text>
      </svg>
    </div>
  )
}

const TALLY_ROWS = 3

/**
 * Errors as a red-pencil tally: four strokes and a fifth across, like counting on the margin of a drawing.
 * Empty gates are pre-ruled in faint construction line, so the cell always reads as "the place where errors go".
 */
export function ErrorTally({ n }: { n: number }) {
  const [ref, w] = useWidth<HTMLDivElement>((vw) => (vw < 860 ? (vw - 60) / 2 : 200))
  const W = Math.max(140, w)
  const gateW = 38
  const perRow = Math.max(1, Math.floor((W - 4) / gateW))
  const cap = perRow * TALLY_ROWS * 5
  const strokes = useMemo(() => {
    const out: string[] = []
    for (let k = 0; k < perRow * TALLY_ROWS * 5; k++) {
      const g = Math.floor(k / 5)
      const j = k % 5
      const gx = 6 + (g % perRow) * gateW
      const gy = 8 + Math.floor(g / perRow) * 40
      out.push(j < 4 ? roughLine(gx + 4 + j * 6, gy, gx + 4 + j * 6, gy + 26, 31 + k, { strokeWidth: 1.6 }) : roughLine(gx - 1, gy + 21, gx + 27, gy + 5, 31 + k, { strokeWidth: 1.6 }))
    }
    return out
  }, [perRow])
  const ghosts = useMemo(() => {
    let d = ''
    for (let g = 0; g < perRow * TALLY_ROWS; g++) {
      const gx = 6 + (g % perRow) * gateW
      const gy = 8 + Math.floor(g / perRow) * 40
      for (let j = 0; j < 4; j++) d += `M${gx + 4 + j * 6},${gy + 2} V${gy + 24} `
    }
    return d
  }, [perRow])
  const shown = Math.min(n, cap)
  const H = 8 + TALLY_ROWS * 40
  return (
    <div ref={ref} className={m.instr}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className={m.instrSvg} role="img" aria-label={`Greške u zadnjih 5 sekundi: ${n}.`}>
        <path d={ghosts} className={m.tallyGhost} />
        {strokes.slice(0, shown).map((d, k) => (
          <path key={k} d={d} className={m.tally} />
        ))}
        {shown === 0 && (
          <text x={W / 2} y={H / 2 + 4} textAnchor="middle" className={m.tallyNone}>
            nema grešaka
          </text>
        )}
      </svg>
      {n > cap && <span className={m.tallyMore}>+ {n - cap}</span>}
    </div>
  )
}

/**
 * Share of traffic as dimension lines, with each server's share of capacity as a construction line under it.
 * A line turns red only when that server is actually not keeping up (it turned requests away, or its queue is half full).
 */
export function ShareDims({ share, servers }: { share: number[] | null; servers: SrvView[] }) {
  const uid = safeId(useId())
  const [ref, w] = useWidth<HTMLDivElement>((vw) => (vw < 860 ? vw - 60 : 340))
  const W = Math.max(240, Math.min(w, 560))
  const caps = SPECS.map((sp) => (sp.vcpu * 1000) / CPU_MS)
  const total = caps.reduce((a, b) => a + b, 0)
  const x0 = 84
  const x1 = W - 10
  const X = (f: number) => x0 + f * (x1 - x0)
  const rowH = 54
  const H = 14 + rowH * 3
  return (
    <div ref={ref} className={m.instr}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className={m.instrSvg} role="img" aria-label="Udio prometa po poslužitelju u odnosu na njegov udio u kapacitetu.">
        <Defs uid={uid} />
        {[0, 0.5, 1].map((f) => (
          <path key={f} d={`M${X(f)},4 V${H - 4}`} className={m.gridMinor} />
        ))}
        {SPECS.map((sp, i) => {
          const y = 10 + i * rowH
          const v = share ? share[i] : 0
          const cap = caps[i] / total
          const sv = servers[i]
          const over = sv.proc === 'up' && (sv.rej > 0 || sv.queue >= QUEUE_MAX / 2)
          const cls = over ? m.dimRed : m.dimInk
          const mk = `url(#${uid}-${over ? 'ar' : 'a'})`
          const lx = X(v)
          return (
            <g key={sp.name}>
              <text x={0} y={y + 20} className={m.shareName}>
                {sp.name.toUpperCase()}
              </text>
              {v > 0.005 && (
                <g className={cls}>
                  <path d={`M${x0},${y + 8} V${y + 24} M${lx},${y + 8} V${y + 24}`} />
                  <path d={`M${x0},${y + 16} H${lx}`} markerStart={v > 0.06 ? mk : undefined} markerEnd={v > 0.06 ? mk : undefined} />
                </g>
              )}
              <text
                x={v > 0.3 && !over ? (x0 + lx) / 2 : lx + 6}
                y={v > 0.3 && !over ? y + 11 : y + 20}
                textAnchor={v > 0.3 && !over ? 'middle' : 'start'}
                className={over ? m.shareRed : m.shareVal}
              >
                {share ? `${Math.round(v * 100)} %` : '—'}
                {over ? ' · ne stiže' : ''}
              </text>
              <path d={`M${x0},${y + 34} H${X(cap)} M${X(cap)},${y + 29} V${y + 39}`} className={m.capLine} />
              {X(cap) + 112 < W ? (
                <text x={X(cap) + 5} y={y + 39} className={m.paperTxt}>
                  kapacitet {Math.round(cap * 100)} %
                </text>
              ) : (
                <text x={X(cap)} y={y + 50} textAnchor="end" className={m.paperTxt}>
                  kapacitet {Math.round(cap * 100)} %
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
