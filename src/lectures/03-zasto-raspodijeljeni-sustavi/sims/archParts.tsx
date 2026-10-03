/**
 * Pieces of the flagship „Arhitekt dostupnosti”: the chain drawing (ulaz → poslužitelji × N → baza), the year
 * calendar („godina u 10 sekundi”, one cell per day), the formula strip and the downtime-by-cause bars.
 * All lettering is drawn 1:1 in the container's width, so it stays ≥ 12 px on every screen.
 */
import { Check, Cross, Cylinder, DiagramDefs, MenzaGate, Rough, diagramIds, plural, type Pt } from '../../../kit'
import { CAUSE_LABEL, CAUSE_ORDER, HOURS_PER_YEAR, costsOf, dayView, fmtEur, fmtHours, hourLabel, num, pctA, survivorLoad, type ArchSim, type Formulas, type YearAverage } from '../model'
import { Srv } from './parts'
import styles from '../styles.module.css'

const hand = (size: number, fill = 'var(--ink-2)') => ({ fontSize: size, fill })
const mono = (size: number, fill = 'var(--ink-2)') => ({ fontSize: size, fill })

/* =====================================================================
   The chain
   ===================================================================== */

interface Box {
  x: number
  y: number
  w: number
  h: number
}

function serverGrid(n: number, area: Box): Box[] {
  const cols = n <= 3 ? 1 : 2
  const rows = Math.ceil(n / cols)
  const gap = 10
  const h = rows >= 3 ? 40 : 46
  const w = cols === 1 ? Math.min(210, area.w) : Math.min(180, (area.w - gap) / 2)
  const totalW = cols * w + (cols - 1) * gap
  const totalH = rows * h + (rows - 1) * gap
  const x0 = area.x + (area.w - totalW) / 2
  const y0 = area.y + (area.h - totalH) / 2
  return Array.from({ length: n }, (_, i) => ({ x: x0 + (i % cols) * (w + gap), y: y0 + Math.floor(i / cols) * (h + gap), w, h }))
}

function Plug({ x, y, seed }: { x: number; y: number; seed: number }) {
  return (
    <g aria-hidden="true">
      <Rough shape={{ k: 'rect', x: x - 9, y, w: 18, h: 12 }} seed={seed} strokeWidth={1.4} fillColor="var(--paper)" fillStyle="solid" />
      <Rough shape={{ k: 'line', x1: x - 4, y1: y + 12, x2: x - 4, y2: y + 18 }} seed={seed + 1} strokeWidth={1.4} />
      <Rough shape={{ k: 'line', x1: x + 4, y1: y + 12, x2: x + 4, y2: y + 18 }} seed={seed + 2} strokeWidth={1.4} />
    </g>
  )
}

/**
 * ulaz → app servers → database, with availability, price and failures. Two layouts:
 *  - wide (≥ 600 px; ≥ 700 px for 4–6 servers in two columns): left to right, roads fan out from the entry and
 *    converge on the database;
 *  - narrow (phones): a vertical chain with two buses — the entry's bus on the left feeds every server, the bus on
 *    the right collects them into the database — so no road ever crosses a label.
 */
export function ArchChain({ s, width, live }: { s: ArchSim; width: number; live: boolean }) {
  const a = s.arch
  const y = s.year
  const c = costsOf(a)
  const narrow = width < (a.appCount > 3 ? 700 : 600)
  const W = Math.max(300, width)
  const load = survivorLoad(a)
  const okLoad = load <= 1
  const rackDown = a.sameRack && y.rack.down
  const appDown = (i: number) => live && (y.app[i]?.down || rackDown)
  const fails = (n: number, short = false) => (short ? `✗ ${num(n)}` : `✗ ${plural(n, ['kvar', 'kvara', 'kvarova'])}`)
  const label = `Lanac Klope: ulaz ${pctA(a.entry)}, ${plural(a.appCount, ['poslužitelj', 'poslužitelja', 'poslužitelja'])} aplikacije po ${pctA(a.app)}${a.appCount === 1 ? '' : a.sameRack ? ' u istom ormaru' : ' u odvojenim ormarima'}, baza ${pctA(a.db)}.`

  // ---------- geometry ----------
  let gate: Box
  let dbBox: Box
  let cards: Box[]
  let H: number
  let gateInfo: Pt
  let dbInfo: Pt
  let notes: Pt
  const roads: Pt[][] = []
  if (narrow) {
    gate = { x: 0, y: 8, w: 66, h: 76 }
    const lx = gate.x + gate.w / 2
    const rx = W - 14
    const ch = a.appCount >= 5 ? 42 : 46
    const top = 128
    cards = Array.from({ length: a.appCount }, (_, i) => ({ x: 46, y: top + i * (ch + 8), w: W - 72, h: ch }))
    const last = cards[cards.length - 1]
    notes = [8, last.y + last.h + 8 + (a.sameRack ? 40 : 22)]
    dbBox = { x: W - 100, y: notes[1] + 34, w: 62, h: 70 }
    const dbMid = dbBox.y + dbBox.h / 2
    gateInfo = [gate.x + gate.w + 14, gate.y + 22]
    dbInfo = [4, dbBox.y + 22]
    H = dbBox.y + dbBox.h + 12
    roads.push([
      [lx, gate.y + gate.h + 4],
      [lx, last.y + last.h / 2],
    ])
    roads.push([
      [rx, cards[0].y + cards[0].h / 2],
      [rx, dbMid],
      [dbBox.x + dbBox.w + 6, dbMid],
    ])
    for (const b of cards) {
      roads.push([
        [lx, b.y + b.h / 2],
        [b.x - 3, b.y + b.h / 2],
      ])
      roads.push([
        [b.x + b.w + 3, b.y + b.h / 2],
        [rx, b.y + b.h / 2],
      ])
    }
  } else {
    gate = { x: 14, y: 78, w: 84, h: 96 }
    dbBox = { x: W - 128, y: 88, w: 70, h: 80 }
    cards = serverGrid(a.appCount, { x: 170, y: 46, w: W - 170 - 210, h: 164 })
    H = 250
    gateInfo = [4, gate.y + gate.h + 24]
    dbInfo = [W - 160, dbBox.y + dbBox.h + 24]
    notes = [0, 0]
    const gateOut: Pt = [gate.x + gate.w + 6, gate.y + gate.h * 0.62]
    const dbIn: Pt = [dbBox.x - 6, dbBox.y + dbBox.h / 2]
    for (const b of cards) {
      roads.push([gateOut, [b.x - 3, b.y + b.h / 2]])
      roads.push([[b.x + b.w + 3, b.y + b.h / 2], dbIn])
    }
  }
  const pad = narrow ? 8 : 12
  const rackFrame: Box = {
    x: Math.min(...cards.map((b) => b.x)) - pad,
    y: Math.min(...cards.map((b) => b.y)) - pad,
    w: Math.max(...cards.map((b) => b.x + b.w)) - Math.min(...cards.map((b) => b.x)) + 2 * pad,
    h: Math.max(...cards.map((b) => b.y + b.h)) - Math.min(...cards.map((b) => b.y)) + 2 * pad,
  }
  if (!narrow) {
    notes = [rackFrame.x + 10, rackFrame.y + rackFrame.h + 19]
    H = Math.max(250, notes[1] + 30)
  }
  const shortSpec = cards[0].w < 150

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label} style={{ display: 'block', height: 'auto', overflow: 'visible' }}>
      {/* roads: entry → every server → database */}
      {roads.map((pts, i) => (
        <Rough key={`r${i}-${a.appCount}-${narrow}`} shape={{ k: 'lin', pts }} seed={7300 + i} stroke="var(--ink-3)" strokeWidth={1.3} roughness={0.8} />
      ))}
      {/* entry */}
      <MenzaGate x={gate.x} y={gate.y} w={gate.w} h={gate.h} label="ULAZ" labelSize={13} />
      <text x={gateInfo[0]} y={gateInfo[1]} className="k-svg-hand" style={hand(18, 'var(--ink)')}>
        ulaz: DNS ili load balancer
      </text>
      <text x={gateInfo[0]} y={gateInfo[1] + 17} className="k-svg-mono" style={mono(12.5)}>
        {pctA(a.entry)} · {fmtEur(c.entryEur)}
      </text>
      <text x={gateInfo[0]} y={gateInfo[1] + 33} className="k-svg-mono" style={mono(12, y.entry.failures ? 'var(--red)' : 'var(--ink-3)')}>
        {fails(y.entry.failures)}
      </text>
      {/* the rack(s) */}
      {a.sameRack ? (
        <g>
          <Rough shape={{ k: 'rect', ...rackFrame }} seed={7340} stroke={rackDown && live ? 'var(--red)' : 'var(--orange)'} strokeWidth={1.6} dash="7 5" roughness={0.9} />
          <text x={rackFrame.x + 6} y={rackFrame.y - 7} className="k-svg-hand" style={hand(18, 'var(--orange)')}>
            isti ormar · isto napajanje
          </text>
          <Plug x={rackFrame.x + rackFrame.w - 22} y={rackFrame.y + rackFrame.h - 1} seed={7350} />
        </g>
      ) : (
        <text x={rackFrame.x + 6} y={rackFrame.y - 7} className="k-svg-hand" style={hand(18)}>
          {a.appCount > 1 ? 'svaki u svom ormaru' : 'poslužitelj aplikacije'}
        </text>
      )}
      {cards.map((b, i) => (
        <g key={`c${i}`}>
          <Srv x={b.x} y={b.y} w={b.w} h={b.h} name={`app${i + 1}`} spec={fails(y.app[i]?.failures ?? 0, shortSpec)} seed={7400 + i * 7} down={appDown(i)} nameSize={14} />
        </g>
      ))}
      {/* N+1 note under the servers */}
      <g>
        {a.appCount > 1 ? (
          <>
            {okLoad ? <Check x={notes[0] + 2} y={notes[1] - 6} size={9} /> : <Cross x={notes[0] + 2} y={notes[1] - 6} size={8} />}
            <text x={notes[0] + 16} y={notes[1]} className="k-svg-hand" style={hand(18, okLoad ? 'var(--green)' : 'var(--red)')}>
              ako jedan padne, {a.appCount === 2 ? 'drugi nosi' : 'preostali nose'} {num(Math.round(load * 100))} %
            </text>
          </>
        ) : (
          <text x={notes[0]} y={notes[1]} className="k-svg-hand" style={hand(18, 'var(--red)')}>
            nema zamjene: kad padne, Klopa stoji
          </text>
        )}
        <text x={narrow ? notes[0] + 16 : rackFrame.x + rackFrame.w} y={notes[1] + 19} textAnchor={narrow ? 'start' : 'end'} className="k-svg-mono" style={mono(12)}>
          {pctA(a.app)} · {fmtEur(c.appServerEur)} po poslužitelju
        </text>
      </g>
      {/* database */}
      <Cylinder x={dbBox.x} y={dbBox.y} w={dbBox.w} h={dbBox.h} label="baza" seed={7500} fillColor={live && y.db.down ? 'var(--red)' : undefined} />
      <text x={dbInfo[0]} y={dbInfo[1]} className="k-svg-hand" style={hand(18, 'var(--ink)')}>
        jedna baza: Postgres
      </text>
      <text x={dbInfo[0]} y={dbInfo[1] + 17} className="k-svg-mono" style={mono(12.5)}>
        {pctA(a.db)} · {fmtEur(c.dbEur)}
      </text>
      <text x={dbInfo[0]} y={dbInfo[1] + 33} className="k-svg-mono" style={mono(12, y.db.failures ? 'var(--red)' : 'var(--ink-3)')}>
        {fails(y.db.failures)}
      </text>
    </svg>
  )
}

/* =====================================================================
   „Godina u 10 sekundi”: one cell per day, weeks as columns
   ===================================================================== */

const DAY_FULL = ['pon', 'uto', 'sri', 'čet', 'pet', 'sub', 'ned']

export function YearCalendar({ s, width }: { s: ArchSim; width: number }) {
  const y = s.year
  const W = Math.max(300, width)
  const wide = W >= 640
  const weeks = 53
  const blocks = wide ? 1 : 2
  const perBlock = Math.ceil(weeks / blocks)
  const labelW = wide ? 34 : 28
  const step = Math.floor(((W - labelW - 6) / perBlock) * 10) / 10
  const gap = wide ? 2 : 1.5
  const cell = step - gap
  const top = 30
  const blockH = 7 * step + 22
  // the key sits under the calendar and uses the very marks the cells use (one row when wide, two when narrow)
  const keyY = top + blocks * blockH + 10
  const keyRows = W >= 600 ? 1 : 2
  const H = keyY + keyRows * 26 + 2
  const ids = diagramIds('l03cal')
  const curDay = Math.min(364, Math.floor(y.hour / 24))
  const cells = []
  for (let d = 0; d < 365; d++) {
    const v = dayView(y, d)
    const week = Math.floor(d / 7)
    const block = Math.floor(week / perBlock)
    const col = week - block * perBlock
    const row = d % 7
    const x = labelW + 4 + col * step
    const yy = top + block * blockH + 16 + row * step
    const started = y.hour > d * 24
    const isNow = !y.done && started && d === curDay
    let el
    if (!started) el = <rect x={x} y={yy} width={cell} height={cell} rx={1} style={{ fill: 'none', stroke: 'var(--ink-4)', strokeWidth: 0.7, strokeDasharray: '1.5 2' }} />
    else if (v.lunchLost)
      el = (
        <g>
          <rect x={x} y={yy} width={cell} height={cell} rx={1} style={{ fill: 'var(--red)', stroke: 'var(--red)', strokeWidth: 1 }} />
          <path d={`M${x + cell * 0.25} ${yy + cell * 0.25}L${x + cell * 0.75} ${yy + cell * 0.75}M${x + cell * 0.75} ${yy + cell * 0.25}L${x + cell * 0.25} ${yy + cell * 0.75}`} style={{ stroke: 'var(--paper)', strokeWidth: 1.6, strokeLinecap: 'round' }} />
        </g>
      )
    else if (v.down > 0) el = <rect x={x} y={yy} width={cell} height={cell} rx={1} style={{ fill: `url(${ids.hatchRed})`, stroke: 'var(--red)', strokeWidth: 1 }} />
    else el = <rect x={x} y={yy} width={cell} height={cell} rx={1} style={{ fill: 'none', stroke: row >= 5 ? 'var(--ink-4)' : 'var(--ink-3)', strokeWidth: 0.8 }} />
    cells.push(
      <g key={d}>
        {el}
        {isNow && <rect x={x - 1.5} y={yy - 1.5} width={cell + 3} height={cell + 3} rx={1.5} style={{ fill: 'none', stroke: 'var(--pen)', strokeWidth: 2 }} />}
      </g>,
    )
  }
  const pct = Math.round((y.hour / HOURS_PER_YEAR) * 100)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Godina u 10 sekundi: ${y.done ? 'gotova' : `${pct} % godine`}, ${hourLabel(Math.min(y.hour, HOURS_PER_YEAR - 1))}. Crveno šrafirani dani imali su ispad, puni crveni dani s ✗ izgubili su ručak.`} style={{ display: 'block', height: 'auto' }}>
      <DiagramDefs id="l03cal" />
      <text x={0} y={18} className="k-svg-hand" style={hand(19, 'var(--ink)')}>
        godina u 10 sekundi
      </text>
      <text x={W} y={18} textAnchor="end" className="k-svg-mono" style={mono(12.5, y.done ? 'var(--green)' : 'var(--pen)')}>
        {y.done ? 'godina je gotova ✓' : y.hour === 0 ? 'dan 1 · 00:00' : hourLabel(y.hour)}
      </text>
      {Array.from({ length: blocks }, (_, b) => (
        <g key={b}>
          {(wide ? [0, 12, 25, 38] : [0, 13]).map((wk) => {
            const week = b * perBlock + wk
            if (week >= weeks || wk >= perBlock) return null
            return (
              <text key={wk} x={labelW + 4 + wk * step} y={top + b * blockH + 10} className="k-svg-mono" style={mono(12, 'var(--ink-3)')}>
                {week + 1}. tj.
              </text>
            )
          })}
          {DAY_FULL.map((dn, r) =>
            (wide ? r % 2 === 1 && r < 5 : r !== 0 && r !== 4 && r !== 6) ? null : (
              <text key={r} x={0} y={top + b * blockH + 16 + r * step + cell - 1} className="k-svg-mono" style={mono(12, r >= 5 ? 'var(--ink-3)' : 'var(--ink-2)')}>
                {dn}
              </text>
            ),
          )}
        </g>
      ))}
      {cells}
      <CalendarKey y={keyY} rows={keyRows} hatch={ids.hatchRed} />
    </svg>
  )
}

/** The calendar's key, drawn with the cells' own marks (empty, hatched, ✗, today's ring) next to their words. */
function CalendarKey({ y, rows, hatch }: { y: number; rows: number; hatch: string }) {
  const s = 13
  const items = [
    { w: 112, mark: (x: number, yy: number) => <rect x={x} y={yy} width={s} height={s} rx={1} style={{ fill: 'none', stroke: 'var(--ink-3)', strokeWidth: 0.9 }} />, text: 'bez ispada' },
    { w: 150, mark: (x: number, yy: number) => <rect x={x} y={yy} width={s} height={s} rx={1} style={{ fill: `url(${hatch})`, stroke: 'var(--red)', strokeWidth: 1 }} />, text: 'ispad tog dana' },
    {
      w: 228,
      mark: (x: number, yy: number) => (
        <g>
          <rect x={x} y={yy} width={s} height={s} rx={1} style={{ fill: 'var(--red)', stroke: 'var(--red)', strokeWidth: 1 }} />
          <path d={`M${x + 3.5} ${yy + 3.5}L${x + s - 3.5} ${yy + s - 3.5}M${x + s - 3.5} ${yy + 3.5}L${x + 3.5} ${yy + s - 3.5}`} style={{ stroke: 'var(--paper)', strokeWidth: 1.6, strokeLinecap: 'round' }} />
        </g>
      ),
      text: 'izgubljen ručak (12–14 h)',
    },
    { w: 90, mark: (x: number, yy: number) => <rect x={x - 1} y={yy - 1} width={s + 2} height={s + 2} rx={1.5} style={{ fill: 'none', stroke: 'var(--pen)', strokeWidth: 2 }} />, text: 'danas' },
  ]
  const perRow = Math.ceil(items.length / rows)
  return (
    <g aria-hidden="true">
      {items.map((it, i) => {
        const row = Math.floor(i / perRow)
        const x = items.slice(row * perRow, i).reduce((a, b) => a + b.w, 0)
        const yy = y + row * 26
        return (
          <g key={it.text}>
            {it.mark(x + 1, yy)}
            <text x={x + s + 8} y={yy + s - 1} className="k-svg-hand" style={hand(18, 'var(--ink-2)')}>
              {it.text}
            </text>
          </g>
        )
      })}
    </g>
  )
}

/* =====================================================================
   Formula vs simulated year vs 100-year average
   ===================================================================== */

export function FormulaStrip({ s, f, avg, simA, simDown }: { s: ArchSim; f: Formulas; avg: YearAverage | null; simA: number; simDown: number }) {
  const a = s.arch
  const appTier = a.appCount > 1 ? `[1 − (1 − ${pctA(a.app)})${a.appCount === 2 ? '²' : a.appCount === 3 ? '³' : `^${a.appCount}`}]` : pctA(a.app)
  const formulaDown = (1 - f.rackAware) * HOURS_PER_YEAR
  // the three results are compared side by side, so they share one precision
  const d = 3
  return (
    <div className={styles.formulaStrip}>
      <div className={styles.formulaCell}>
        <span className={styles.formulaLabel}>formula (neovisni kvarovi)</span>
        <span className={styles.formulaExpr}>
          {pctA(a.entry)} × {appTier} × {pctA(a.db)}
          {a.sameRack ? ` × ormar ${pctA(f.rack)}` : ''}
        </span>
        <span className={styles.formulaBig}>= {pctA(f.rackAware, d)}</span>
        <span className={styles.formulaSub}>
          ≈ {fmtHours(formulaDown)} nedostupno godišnje{a.sameRack ? ` · bez ormara: ${pctA(f.naive, d)}` : ''}
        </span>
      </div>
      <div className={styles.formulaCell}>
        <span className={styles.formulaLabel}>ova godina (simulacija)</span>
        <span className={styles.formulaBig}>{s.year.hour > 0 ? pctA(simA, d) : '–'}</span>
        <span className={styles.formulaSub}>
          {s.year.hour > 0 ? `${fmtHours(simDown)} nedostupno · seed ${a.seed}` : `pokrenite godinu · seed ${a.seed}`}
        </span>
      </div>
      <div className={styles.formulaCell}>
        <span className={styles.formulaLabel}>prosjek 100 godina</span>
        <span className={styles.formulaBig}>{avg ? pctA(avg.availability, d) : '…'}</span>
        <span className={styles.formulaSub}>{avg ? `${fmtHours(avg.downtimeH)} i ${num(avg.lunchesLost, 1)} ručka godišnje` : 'računam…'}</span>
      </div>
    </div>
  )
}

/* =====================================================================
   Where the downtime came from
   ===================================================================== */

export function CauseBars({ s, width }: { s: ArchSim; width: number }) {
  const by = s.year.downByCause
  const rows = CAUSE_ORDER.filter((c) => by[c] > 0.001)
  const W = Math.max(280, width)
  const stacked = W < 560
  const labelW = stacked ? 0 : 250
  const max = Math.max(1, ...rows.map((c) => by[c]))
  const rowH = stacked ? 40 : 26
  const H = Math.max(1, rows.length) * rowH + 32
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={rows.length ? `Kamo je otišlo vrijeme: ${rows.map((c) => `${CAUSE_LABEL[c]} ${fmtHours(by[c])}`).join(', ')}.` : 'Još nema ispada.'} style={{ display: 'block', height: 'auto' }}>
      <text x={0} y={17} className="k-svg-hand" style={hand(19, 'var(--ink)')}>
        kamo je otišlo vrijeme
      </text>
      {rows.length === 0 && (
        <text x={0} y={46} className="k-svg-hand" style={hand(18, 'var(--ink-3)')}>
          (još nijedan ispad)
        </text>
      )}
      {rows.map((c, i) => {
        const yy = 30 + i * rowH
        const barY = stacked ? yy + 20 : yy + 4
        const bw = Math.max(3, ((W - labelW - 70) * by[c]) / max)
        return (
          <g key={c}>
            <text x={stacked ? 0 : labelW - 8} y={yy + 15} textAnchor={stacked ? 'start' : 'end'} className="k-svg-mono" style={mono(12, 'var(--ink)')}>
              {CAUSE_LABEL[c]}
            </text>
            <Rough shape={{ k: 'rect', x: labelW, y: barY, w: bw, h: 14 }} seed={7600 + i} stroke="var(--red)" strokeWidth={1.2} fillColor="var(--red)" hachureAngle={-41} hachureGap={4} roughness={0.7} />
            <text x={labelW + bw + 6} y={barY + 11} className="k-svg-mono" style={mono(12, 'var(--ink)')}>
              {fmtHours(by[c])}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
