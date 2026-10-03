import { useState } from 'react'
import { Figure, Rough, Segmented, Slider, fmt, useWidth, type Pt } from '../../../kit'
import { MODEL_NOTES, mm1WaitFactor, mmcWaitFactor } from '../../../engines/traffic'
import styles from '../styles.module.css'

const Y_MAX = 20

function factor(c: 1 | 4, rho: number): number {
  return c === 1 ? mm1WaitFactor(rho) : mmcWaitFactor(4, rho)
}

function fmtFactor(f: number): string {
  if (!Number.isFinite(f)) return '∞'
  return `${fmt.num(f, f < 10 ? 1 : 0)}×`
}

interface BoxR {
  x0: number
  x1: number
  y0: number
  y1: number
}

function hits(a: BoxR, b: BoxR, gap = 3): boolean {
  return a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap
}

/** Points of one curve up to the top of the chart (rho in 0..0.995). */
function curve(c: 1 | 4, x: (r: number) => number, y: (f: number) => number): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i <= 199; i++) {
    const r = i / 200
    const f = factor(c, r)
    if (f > Y_MAX) {
      pts.push([x(r), y(Y_MAX)])
      break
    }
    pts.push([x(r), y(f)])
  }
  return pts
}

function Chart({ rho, c, narrow }: { rho: number; c: 1 | 4; narrow: boolean }) {
  const W = narrow ? 380 : 680
  const H = 340
  const pad = { l: 46, r: 22, t: 40, b: 50 }
  const pw = W - pad.l - pad.r
  const ph = H - pad.t - pad.b
  const x = (r: number) => pad.l + r * pw
  const y = (f: number) => pad.t + ph - (Math.min(f, Y_MAX) / Y_MAX) * ph
  const f = factor(c, rho)
  const dot: Pt = [x(rho), y(f)]
  const marks = [0.5, 0.7, 0.8, 0.9]
  // „vi ste ovdje”: left of the dot from 60 % up, below the key when it would run into it (narrow, high ρ)
  const here = `vi ste ovdje: ${f > Y_MAX ? `↑ ${fmtFactor(f)}` : fmtFactor(f)}`
  const hereW = here.length * 22 * 0.45
  const right = rho > 0.6
  const hereX = right ? dot[0] - 14 : dot[0] + 14
  const keyText = c === 1 ? 'c = 1 (jedan radnik)' : 'c = 4 (četiri radnika)'
  const keyBox: BoxR = { x0: pad.l + 10, x1: pad.l + 60 + keyText.length * 21 * 0.45, y0: y(18) - 20, y1: y(15.5) + 6 }
  const boxAt = (ly: number): BoxR => (right ? { x0: hereX - hereW, x1: hereX, y0: ly - 18, y1: ly + 6 } : { x0: hereX, x1: hereX + hereW, y0: ly - 18, y1: ly + 6 })
  let hereY = Math.max(pad.t + 12, dot[1] - 14)
  if (hits(boxAt(hereY), keyBox)) hereY = keyBox.y1 + 24
  const hereBox = boxAt(hereY)
  const xTicks = narrow ? [0, 0.5, 0.7, 0.9, 1] : [0, 0.25, 0.5, 0.7, 0.8, 0.9, 1]
  /** box of a fixed factor label on the c = 1 curve (mono 14,5, right-aligned 8 units left of the point) */
  const markBox = (r: number): BoxR => {
    const fx = x(r) - 8
    const fy = y(factor(1, r)) - 8
    return { x0: fx - fmtFactor(factor(1, r)).length * 14.5 * 0.6, x1: fx, y0: fy - 12, y1: fy + 3 }
  }
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Krivulja vremena u sustavu: pri iskorištenosti ${fmt.pct(rho)} zahtjev provede ${fmtFactor(f)} vremena obrade u sustavu (${c === 1 ? 'jedan radnik' : 'četiri radnika'}).`}
      style={{ display: 'block', width: '100%', maxWidth: narrow ? 460 : undefined, height: 'auto', margin: '0 auto', overflow: 'visible' }}
    >
      {[5, 10, 15, 20].map((g) => (
        <g key={g}>
          <line x1={pad.l} x2={W - pad.r} y1={y(g)} y2={y(g)} style={{ stroke: 'var(--ink-4)', strokeWidth: 0.8, strokeDasharray: '2 5' }} />
          <text x={pad.l - 8} y={y(g) + 5} textAnchor="end" className="k-svg-mono" style={{ fontSize: 14.5, fill: 'var(--ink-2)' }}>
            {g}×
          </text>
        </g>
      ))}
      <Rough shape={{ k: 'line', x1: pad.l, y1: pad.t - 10, x2: pad.l, y2: pad.t + ph + 2 }} seed={2801} stroke="var(--ink-2)" strokeWidth={1.5} roughness={0.8} />
      <Rough shape={{ k: 'line', x1: pad.l - 3, y1: pad.t + ph, x2: W - pad.r + 6, y2: pad.t + ph }} seed={2802} stroke="var(--ink-2)" strokeWidth={1.5} roughness={0.8} />
      {xTicks.map((t) => (
        <text key={t} x={x(t)} y={pad.t + ph + 22} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 14.5, fill: 'var(--ink-2)' }}>
          {fmt.num(t * 100)}
        </text>
      ))}
      <text x={W - pad.r} y={H - 4} textAnchor="end" className="k-svg-hand" style={{ fontSize: 21, fill: 'var(--ink-2)' }}>
        iskorištenost (%) →
      </text>
      <text x={pad.l + 8} y={pad.t - 18} className="k-svg-hand" style={{ fontSize: 21, fill: 'var(--ink-2)' }}>
        {narrow ? '↑ × vrijeme obrade' : '↑ vrijeme u sustavu (× vrijeme obrade)'}
      </text>
      {/* the other curve stays as faint dashed pencil: one native polyline, so the dash runs on along the whole curve
          (a rough polyline restarts the dash on every 3-unit segment and would look solid where the curve is flat) */}
      <polyline
        points={curve(c === 1 ? 4 : 1, x, y)
          .map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`)
          .join(' ')}
        style={{ fill: 'none', stroke: 'var(--ink-3)', strokeWidth: 1.6, strokeDasharray: '5 5', strokeLinecap: 'round', strokeLinejoin: 'round' }}
      />
      <Rough shape={{ k: 'lin', pts: curve(c, x, y) }} seed={2810 + c} stroke="var(--ink)" strokeWidth={2.3} roughness={0.4} />
      {/* key for both curves, in the empty upper-left of the plot: solid = the chosen c, dashed = the other one */}
      <line x1={pad.l + 16} x2={pad.l + 52} y1={y(18) - 6} y2={y(18) - 6} style={{ stroke: 'var(--ink)', strokeWidth: 2.3 }} />
      <text x={pad.l + 60} y={y(18)} className="k-svg-hand" style={{ fontSize: 21, fill: 'var(--ink)' }}>
        {keyText}
      </text>
      <line x1={pad.l + 16} x2={pad.l + 52} y1={y(15.5) - 6} y2={y(15.5) - 6} style={{ stroke: 'var(--ink-3)', strokeWidth: 1.6, strokeDasharray: '4 5' }} />
      <text x={pad.l + 60} y={y(15.5)} className="k-svg-hand" style={{ fontSize: 21, fill: 'var(--ink-2)' }}>
        {c === 1 ? 'c = 4, za usporedbu' : 'c = 1, za usporedbu'}
      </text>
      {c === 1 &&
        marks.map((r) => (
          <g key={r}>
            <circle cx={x(r)} cy={y(factor(1, r))} r={3.2} style={{ fill: 'var(--ink)' }} />
            {!hits(markBox(r), hereBox) && (
              <text x={x(r) - 8} y={y(factor(1, r)) - 8} textAnchor="end" className="k-svg-mono" style={{ fontSize: 14.5, fill: 'var(--ink-2)' }}>
                {fmtFactor(factor(1, r))}
              </text>
            )}
          </g>
        ))}
      {/* vi ste ovdje */}
      <Rough shape={{ k: 'line', x1: dot[0], y1: dot[1] + 6, x2: dot[0], y2: pad.t + ph }} seed={2830} stroke="var(--red)" strokeWidth={1.4} dash="3 4" roughness={0.6} />
      <Rough shape={{ k: 'ellipse', cx: dot[0], cy: dot[1], w: 14, h: 14 }} seed={2831} stroke="var(--red)" strokeWidth={1.6} fillColor="var(--red)" fillStyle="solid" roughness={0.7} />
      {hereY > dot[1] + 20 && (
        <Rough shape={{ k: 'line', x1: right ? hereX + 4 : hereX - 4, y1: hereY - 20, x2: right ? dot[0] - 8 : dot[0] + 8, y2: dot[1] + 8 }} seed={2832} stroke="var(--red)" strokeWidth={1.3} roughness={0.7} />
      )}
      <text
        x={hereX}
        y={hereY}
        textAnchor={right ? 'end' : 'start'}
        className="k-svg-hand"
        style={{ fontSize: 22, fill: 'var(--red)', paintOrder: 'stroke', stroke: 'var(--paper)', strokeWidth: 5, strokeLinejoin: 'round' }}
      >
        {here}
      </text>
    </svg>
  )
}

/** Scene „Hokejaška palica”: utilisation slider on the M/M/1 curve (and M/M/c with c = 4 for comparison). */
export function HockeyStick() {
  const [pct, setPct] = useState(70)
  const [c, setC] = useState<1 | 4>(1)
  const [ref, width] = useWidth<HTMLDivElement>()
  const narrow = width !== null && width < 620
  const rho = pct / 100
  const f = factor(c, rho)
  return (
    <Figure wide caption="Model, ne mjerenje: slučajni dolasci i slučajna trajanja obrade. Stvarni poslužitelji odstupaju, ali oblik krivulje ostaje.">
      <div ref={ref}>
        <div className={styles.controlsRow}>
          <Slider label="Iskorištenost (ρ)" value={pct} min={0} max={99} onChange={setPct} format={(v) => `${v} %`} />
          <Segmented
            label="Paralelnih radnika (c)"
            value={c}
            options={[
              { value: 1, label: '1 (M/M/1)' },
              { value: 4, label: '4 (M/M/4)' },
            ]}
            onChange={setC}
          />
        </div>
        <Chart rho={rho} c={c} narrow={narrow} />
        <p className={styles.readout}>
          Pri iskorištenosti <strong>{fmt.num(pct)} %</strong> zahtjev u prosjeku provede u sustavu{' '}
          {f < 1.05 ? (
            'gotovo samo onoliko koliko traje sama obrada'
          ) : (
            <>
              <strong>{Number.isFinite(f) ? `${fmt.num(f, f < 10 ? 1 : 0)} puta` : 'beskonačno'}</strong> dulje nego što traje sama obrada
            </>
          )}
          {c === 1 ? ' (jedan radnik)' : ' (četiri paralelna radnika)'}. Ako obrada traje 200{'\u00a0'}ms, to je <strong>{Number.isFinite(f) ? fmt.ms(200 * f) : '∞'}</strong>.
          <span className={styles.modelTag}>{c === 1 ? MODEL_NOTES.mm1 : MODEL_NOTES.mmc}</span>
        </p>
      </div>
    </Figure>
  )
}
