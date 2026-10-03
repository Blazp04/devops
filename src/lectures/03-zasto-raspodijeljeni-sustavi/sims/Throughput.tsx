/**
 * „Zašto 10 × poslužitelja ≠ 10 × propusnosti” — the engine's scaling formulas, drawn:
 *   BottleneckExplorer  N app servers (≈ 10 zahtjeva/s each) in front of ONE database (sharedBottleneck)
 *   AmdahlChart         speed-up with a serial share 1 − p (amdahl, amdahlMax) — labelled as a model
 *   UslChart            Universal Scalability Law with contention α and coherency β (usl, uslPeak) — DeepDive
 */
import { useState } from 'react'
import { Cylinder, DBar, MiniServer, QueueSlots, Rough, ServerFace, Slider, useWidth, type Pt } from '../../../kit'
import { amdahl, amdahlMax, num, sharedBottleneck, usl, uslPeak } from '../model'
import { CurveChart } from './parts'
import styles from '../styles.module.css'

const PER_SERVER = 10

export function BottleneckExplorer() {
  const [n, setN] = useState(3)
  const [db, setDb] = useState(45)
  const [ref, width] = useWidth<HTMLDivElement>()
  const r = sharedBottleneck(n, PER_SERVER, db)
  const dbLoad = Math.min(1, (n * PER_SERVER) / db)
  const W = Math.max(300, Math.min(720, width ?? 640))
  const twoRows = W < 640
  const cols = twoRows ? 5 : 10
  const cw = twoRows ? 40 : 42
  const sy = 40
  const rowsH = twoRows ? 2 * 70 : 70
  const dbX = W - 112
  const dbY = sy + rowsH / 2 - 40
  const noteY = sy + rowsH + 6
  // narrow: the note takes two lines, so it never runs into the database's „% zauzeta”
  const H = Math.max(noteY + (twoRows ? 32 : 10), dbY + 150)
  const busy = r.bottleneck === 'db'
  // wide layout: a „red pred bazom” between the servers and the database (trays = requests waiting for the DB)
  const showQueue = !twoRows
  const qW = 84
  const qX = dbX - qW - 14
  const dbIn: Pt = showQueue ? [qX, dbY + 40] : [dbX - 4, dbY + 40]
  const waiting = busy ? Math.min(4, Math.ceil((n * PER_SERVER - db) / PER_SERVER)) : 0
  const perServer = r.throughput / n
  const xs = Array.from({ length: 10 }, (_, i) => i + 1)
  return (
    <div className={styles.widget} ref={ref}>
      <div className={styles.widgetControls}>
        <Slider label="Poslužitelji aplikacije" value={n} min={1} max={10} onChange={setN} format={(v) => `${v} × ${PER_SERVER}/s`} hint="svaki sam stigne ≈ 10 zahtjeva/s" />
        <Slider label="Koliko stigne baza" value={db} min={20} max={90} step={5} onChange={setDb} format={(v) => `${v} zahtjeva/s`} hint="jedna, zajednička" />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${n} poslužitelja aplikacije ispred jedne baze: Klopa obradi ${num(r.throughput)} zahtjeva u sekundi; usko grlo je ${busy ? 'baza' : 'broj poslužitelja'}.`} style={{ display: 'block', height: 'auto', maxWidth: 720 }}>
        <text x={4} y={18} className="k-svg-hand" style={{ fontSize: 18, fill: 'var(--ink-2)' }}>
          poslužitelji aplikacije
        </text>
        {Array.from({ length: n }, (_, i) => {
          const x = 4 + (i % cols) * cw
          const y = sy + Math.floor(i / cols) * 70
          const out: Pt = [x + 17, y + 42]
          // when the database is the bottleneck the app servers are idle, waiting on it: calm faces, ink numbers
          return (
            <g key={i}>
              <Rough shape={{ k: 'line', x1: out[0], y1: out[1], x2: dbIn[0], y2: dbIn[1] }} seed={8800 + i} stroke="var(--ink-3)" strokeWidth={1.1} roughness={0.6} />
              <MiniServer x={x} y={y} w={34} h={42} mood="calm" seed={8820 + i * 7} />
              <text x={x + 17} y={y + 58} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 12, fill: 'var(--ink-2)' }}>
                {num(perServer, perServer % 1 ? 1 : 0)}
              </text>
            </g>
          )
        })}
        {showQueue && (
          <g>
            <text x={qX + qW / 2} y={dbY + 14} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 18, fill: busy ? 'var(--red)' : 'var(--ink-2)' }}>
              red pred bazom
            </text>
            <QueueSlots x={qX} y={dbY + 26} w={qW} h={28} slots={4} filled={waiting} seed={8870} />
            <Rough shape={{ k: 'line', x1: qX + qW, y1: dbY + 40, x2: dbX - 4, y2: dbY + 40 }} seed={8871} stroke={busy ? 'var(--red)' : 'var(--ink-3)'} strokeWidth={1.1} roughness={0.6} />
          </g>
        )}
        <Cylinder x={dbX} y={dbY} w={74} h={80} label="baza" seed={8890} fillColor={busy ? 'var(--red)' : undefined} />
        <g transform={`translate(${dbX + 92} ${dbY + 8})`}>
          <ServerFace mood={dbLoad >= 1 ? 'panic' : dbLoad > 0.7 ? 'busy' : 'calm'} r={13} />
        </g>
        <DBar x={dbX} y={dbY + 90} w={74} h={10} value={dbLoad} />
        <text x={dbX + 37} y={dbY + 118} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 12.5, fill: busy ? 'var(--red)' : 'var(--ink-2)' }}>
          {num(Math.round(dbLoad * 100))} % zauzeta
        </text>
        {busy && (
          <text x={dbX + 37} y={dbY + 140} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 19, fill: 'var(--red)' }}>
            usko grlo!
          </text>
        )}
        <text x={4} y={noteY} className="k-svg-hand" style={{ fontSize: 18, fill: 'var(--ink-2)' }}>
          {twoRows ? (
            <>
              <tspan>↑ zahtjeva/s koje svaki</tspan>
              <tspan x={4} dy={22}>
                stvarno obradi
              </tspan>
            </>
          ) : (
            '↑ zahtjeva/s koje svaki stvarno obradi'
          )}
        </text>
      </svg>
      <p className={styles.readout}>
        <span>
          Klopa obradi <strong>{num(r.throughput)}</strong> zahtjeva/s
        </span>
        <span>idealno bi bilo {num(n * PER_SERVER)}</span>
        {busy && <span>poslužitelji aplikacije čekaju bazu, procesor im se odmara</span>}
      </p>
      <CurveChart
        width={Math.min(720, width ?? 640)}
        height={190}
        xs={xs}
        series={[
          { label: 'idealno', ys: xs.map((k) => k * PER_SERVER), color: 'var(--ink-3)', dash: '6 5', width: 1.8 },
          { label: 'stvarno', ys: xs.map((k) => sharedBottleneck(k, PER_SERVER, db).throughput), color: 'var(--pen)' },
        ]}
        yMax={100}
        yTicks={[0, 25, 50, 75, 100]}
        xTicks={xs.filter((k) => (W < 420 ? k % 3 === 1 : true) || k === 10).map((k) => ({ v: k, label: String(k) }))}
        marker={{ x: n, y: r.throughput, label: `${num(r.throughput)}/s` }}
        xLabel="broj poslužitelja"
        yLabel="zahtjeva/s (isprekidano: idealno)"
        label={`Propusnost prema broju poslužitelja: raste do ${db} zahtjeva u sekundi, a onda stane jer je baza puna.`}
        seed={8900}
      />
    </div>
  )
}

const P_STEPS = [0.5, 0.75, 0.9, 0.95, 0.99]

export function AmdahlChart() {
  const [pi, setPi] = useState(3)
  const [ref, width] = useWidth<HTMLDivElement>()
  const p = P_STEPS[pi]
  const xs = Array.from({ length: 64 }, (_, i) => i + 1)
  const max = amdahlMax(p)
  return (
    <div className={styles.widget} ref={ref}>
      <Slider label="Dio posla koji se može podijeliti (p)" value={pi} min={0} max={P_STEPS.length - 1} onChange={setPi} format={(i) => `${num(P_STEPS[i] * 100)} %`} hint={`ostatak (${num((1 - p) * 100)} %) ide kroz jedno mjesto`} />
      <CurveChart
        width={Math.min(720, width ?? 640)}
        height={210}
        xs={xs}
        series={[
          { label: 'idealno', ys: xs, color: 'var(--ink-3)', dash: '6 5', width: 1.8 },
          { label: 'Amdahl', ys: xs.map((k) => amdahl(k, p)), color: 'var(--pen)' },
        ]}
        yMax={64}
        yTicks={[0, 16, 32, 48, 64]}
        xTicks={[1, 16, 32, 48, 64].map((v) => ({ v, label: String(v) }))}
        marker={{ x: 10, y: amdahl(10, p), label: `10 poslužitelja: ${num(amdahl(10, p), 1)}×` }}
        hline={{ y: max, label: `strop ${num(max, max < 10 ? 1 : 0)}×` }}
        xLabel="broj poslužitelja"
        yLabel="ubrzanje (×)"
        label={`Amdahlov model: s p = ${num(p * 100)} % ubrzanje nikad ne prijeđe ${num(max, 0)}×.`}
        seed={8920}
      />
      <p className={styles.readout}>
        <span>
          strop: 1 / (1 − p) = <strong>{num(max, max < 10 ? 1 : 0)}×</strong>
        </span>
        <span>model, ne zakon prirode</span>
      </p>
    </div>
  )
}

const ALPHA = [0, 0.01, 0.02, 0.05, 0.1, 0.2]
const BETA = [0, 0.0001, 0.0005, 0.001, 0.005]

export function UslChart() {
  const [ai, setAi] = useState(3)
  const [bi, setBi] = useState(3)
  const [ref, width] = useWidth<HTMLDivElement>()
  const a = ALPHA[ai]
  const b = BETA[bi]
  const xs = Array.from({ length: 100 }, (_, i) => i + 1)
  const ys = xs.map((k) => usl(k, a, b))
  const peak = uslPeak(a, b)
  const peakN = Number.isFinite(peak) ? Math.min(100, Math.max(1, Math.round(peak))) : 100
  const top = Math.max(...ys)
  const yMax = top <= 10 ? 12 : top <= 20 ? 24 : top <= 40 ? 48 : 100
  const step = yMax / 4
  return (
    <div className={styles.widget} ref={ref}>
      <div className={styles.widgetControls}>
        <Slider label="α: čekanje na zajedničko (red, zaključavanje)" value={ai} min={0} max={ALPHA.length - 1} onChange={setAi} format={(i) => num(ALPHA[i], 2)} />
        <Slider label="β: usklađivanje svakog sa svakim" value={bi} min={0} max={BETA.length - 1} onChange={setBi} format={(i) => num(BETA[i], 4)} />
      </div>
      <CurveChart
        width={Math.min(720, width ?? 640)}
        height={210}
        xs={xs}
        series={[{ label: 'USL', ys, color: 'var(--pen)' }]}
        yMax={yMax}
        yTicks={[0, step, 2 * step, 3 * step, 4 * step]}
        formatY={(v) => num(v, 0)}
        xTicks={[1, 25, 50, 75, 100].map((v) => ({ v, label: String(v) }))}
        marker={{ x: peakN, y: usl(peakN, a, b), label: Number.isFinite(peak) && peak <= 100 ? `vrh: N ≈ ${num(peak, 0)}` : 'bez vrha do 100' }}
        xLabel="broj poslužitelja"
        yLabel="propusnost (× jednog)"
        label={`Univerzalni zakon skalabilnosti s α = ${num(a, 2)} i β = ${num(b, 4)}: ${Number.isFinite(peak) && peak <= 100 ? `propusnost je najveća oko N = ${num(peak, 0)}, a zatim pada` : a === 0 && b === 0 ? 'propusnost raste linearno' : 'propusnost raste sve sporije'}.`}
        seed={8940}
      />
    </div>
  )
}
