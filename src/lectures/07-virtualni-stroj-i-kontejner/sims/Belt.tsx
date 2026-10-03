/**
 * „Pojas”: control groups limit what a process may USE.
 *  BeltMemory — a small 2 GB server (Mali) with Postgres and klopa-api; scrub klopa-api's leak upward.
 *    with memory.max 512M: the kernel kills only klopa-api at its limit (OOMKilled);
 *    without: the server runs out of memory and the OOM killer kills the process with the highest score —
 *    Postgres, the bigger one — while the leak lives on (a pure function of the slider: a timeline you can scrub).
 *  BeltCpu — cpu.max "20000 100000": 20 ms of CPU in every 100 ms period; a request that needs 100 ms of CPU
 *    waits in the greyed (throttled) part of each period and finishes after ≈ 420 ms. Nobody is killed.
 */
import { useState } from 'react'
import { Burst, Rough, Slider, Toggle, useWidth } from '../../../kit'
import { BeltStrap, Face, Hatches, ProgramCard } from './parts'
import styles from '../styles.module.css'

const TOTAL = 2000
const OS = 400
const PG = 1000
const BASE = 300
const LIMIT = 512

function memState(m: number, belt: boolean) {
  if (belt) {
    const apiKilled = m >= LIMIT
    return { pgKilled: false, apiKilled, api: apiKilled ? 0 : m, killedAt: apiKilled ? LIMIT : null }
  }
  const pgKilled = m >= TOTAL - OS - PG
  const apiKilled = m >= TOTAL - OS
  return { pgKilled, apiKilled, api: apiKilled ? 0 : m, killedAt: null }
}

const gbs = (mb: number) => (mb / 1000).toLocaleString('hr-HR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export function BeltMemory() {
  const [m, setM] = useState(BASE)
  const [belt, setBelt] = useState(true)
  const [ref, width] = useWidth<HTMLDivElement>()
  const narrow = width !== null && width < 640
  const W = narrow ? 360 : 640
  const H = narrow ? 268 : 232
  const st = memState(m, belt)
  const ids = 'blt7'
  // wide: the bar leaves room on its right for the „memory.max” label, so the label stays inside the drawing
  const bar = narrow ? { x: 10, y: 44, w: 340, h: 34 } : { x: 20, y: 46, w: 540, h: 36 }
  const sx = (mb: number) => bar.x + (mb / TOTAL) * bar.w
  const pgMem = st.pgKilled ? 0 : PG
  const used = OS + pgMem + st.api
  const segs = [
    { v: OS, fill: `url(#${ids}-ink)` },
    { v: pgMem, fill: `url(#${ids}-food)` },
    { v: Math.min(st.api, BASE), fill: `url(#${ids}-pen)` },
    { v: Math.max(0, st.api - BASE), fill: `url(#${ids}-red)` },
  ]
  let acc = 0
  const cardY = narrow ? 142 : 120
  const cards = narrow
    ? [
        { x: 10, w: 164 },
        { x: 186, w: 164 },
      ]
    : [
        { x: 100, w: 180 },
        { x: 320, w: 180 },
      ]
  const procs = [
    { name: 'postgres', killed: st.pgKilled, mem: pgMem, note: st.pgKilled ? 'ubio ga OOM killer' : 'radi' },
    { name: 'klopa-api', killed: st.apiKilled, mem: st.api, note: st.apiKilled ? (belt ? 'OOMKilled (pojas)' : 'ubio ga OOM killer') : m > BASE ? 'curi' : 'radi' },
  ]
  let text: string
  if (belt) {
    text = st.apiKilled
      ? 'klopa-api je dosegao memory.max (512 MB): jezgra je ubila samo njega – OOMKilled, izlazni kod 137. Postgres i dalje radi.'
      : `klopa-api troši ${m} MB od dopuštenih 512 MB.`
  } else if (!st.pgKilled) {
    text = `klopa-api troši ${m} MB; poslužitelju je ostalo još ${TOTAL - used} MB.`
  } else if (!st.apiKilled) {
    text = 'Memorija poslužitelja je potrošena. OOM killer ubija proces s najviše bodova – a to je postgres (1,0 GB), ne krivac. Curenje se nastavlja.'
  } else {
    text = 'Postgres je već pao, a sad je klopa-api najveći – pa je ubijen i on. Dva pada zbog jednog curenja.'
  }
  const label = `Poslužitelj Mali s 2 GB RAM-a: OS 0,4 GB, postgres ${st.pgKilled ? 'ubijen' : '1,0 GB'}, klopa-api ${st.apiKilled ? 'ubijen' : `${m} MB`}${belt ? ', s ograničenjem memory.max 512 MB' : ', bez ograničenja'}.`
  return (
    <div ref={ref} className={styles.beltBox}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ display: 'block', width: '100%', maxWidth: narrow ? 460 : undefined, margin: '0 auto', height: 'auto', overflow: 'visible' }}>
        <Hatches id={ids} />
        <text x={bar.x} y={28} className="k-svg-hand" style={{ fontSize: 21 }}>
          poslužitelj Mali · 2 GB RAM-a
        </text>
        <text x={bar.x + bar.w} y={28} textAnchor="end" className="k-svg-mono" style={{ fontSize: 14, fill: used >= TOTAL - 1 ? 'var(--red)' : 'var(--ink-2)' }}>
          {gbs(Math.min(used, TOTAL))} / 2,0 GB
        </text>
        {segs.map((sg, i) => {
          const x = sx(acc)
          const w = (Math.min(sg.v, TOTAL - acc) / TOTAL) * bar.w
          acc += sg.v
          return w > 0.3 ? <rect key={i} x={x} y={bar.y} width={w} height={bar.h} fill={sg.fill} /> : null
        })}
        <Rough shape={{ k: 'rect', ...bar }} seed={8101} strokeWidth={1.7} />
        {/* labels on the bar's segments */}
        <text x={sx(OS / 2)} y={bar.y + bar.h + 20} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 14, fill: 'var(--ink-2)' }}>
          OS
        </text>
        {!st.pgKilled && (
          <text x={sx(OS + PG / 2)} y={bar.y + bar.h + 20} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 14, fill: 'var(--ink-2)' }}>
            postgres
          </text>
        )}
        {st.api > 0 && (st.api / TOTAL) * bar.w > 80 && (
          <text x={sx(OS + pgMem + Math.min(st.api, TOTAL - OS - pgMem) / 2)} y={bar.y + bar.h + 20} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 14, fill: st.api > BASE ? 'var(--red)' : 'var(--ink-2)' }}>
            klopa-api
          </text>
        )}
        {belt && (
          <g>
            {/* phones: the label goes on a second row, ending at the line, so it never runs off the drawing */}
            <line x1={sx(OS + PG + LIMIT)} y1={bar.y - 8} x2={sx(OS + PG + LIMIT)} y2={bar.y + bar.h + (narrow ? 30 : 8)} style={{ stroke: 'var(--pen)', strokeWidth: 2, strokeDasharray: '5 3' }} />
            <text
              x={sx(OS + PG + LIMIT) + (narrow ? -6 : 6)}
              y={bar.y + bar.h + (narrow ? 42 : 20)}
              textAnchor={narrow ? 'end' : 'start'}
              className="k-svg-mono"
              style={{ fontSize: 14, fill: 'var(--pen)', fontWeight: 600 }}
            >
              memory.max
            </text>
          </g>
        )}
        {procs.map((p, i) => {
          const c = cards[i]
          return (
            <g key={p.name}>
              {p.killed && <Burst cx={c.x + c.w / 2} cy={cardY + 22} r={narrow ? 40 : 44} seed={8110 + i} />}
              <ProgramCard x={c.x} y={cardY} w={c.w} h={46} name={p.name} size={14} seed={8120 + i * 3} stroke={p.killed ? 'var(--red)' : 'var(--ink)'} dashed={p.killed} />
              {i === 1 && belt && !p.killed && <BeltStrap x={c.x} y={cardY + 40} w={c.w} seed={8130} />}
              <Face cx={c.x + c.w - 6} cy={cardY + 2} r={11} mood={p.killed ? 'dead' : i === 1 && m > BASE ? 'busy' : 'calm'} seed={8140 + i} />
              <text x={c.x + c.w / 2} y={cardY + 72} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 14, fill: p.killed ? 'var(--red)' : 'var(--ink-2)' }}>
                {p.killed ? '0 MB' : `${Math.round(p.mem)} MB`}
              </text>
              <text x={c.x + c.w / 2} y={cardY + 98} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 20, fill: p.killed ? 'var(--red)' : p.note === 'curi' ? 'var(--orange)' : 'var(--green)' }}>
                {p.killed ? `✗ ${p.note}` : p.note === 'curi' ? `! ${p.note}` : `✓ ${p.note}`}
              </text>
            </g>
          )
        })}
      </svg>
      <div className={styles.controls}>
        <Toggle label="pojas: memory.max = 512M" checked={belt} onChange={setBelt} hint="kontrolna grupa za klopa-api" />
        <div style={{ flex: '1 1 100%', minWidth: 0 }}>
          <Slider label="klopa-api curi: koliko memorije traži" value={m} min={BASE} max={1700} step={10} onChange={setM} format={(v) => `${v} MB`} />
        </div>
      </div>
      <p className={styles.readout} aria-live="polite">
        {text}
      </p>
    </div>
  )
}

export function BeltCpu() {
  const [limit, setLimit] = useState(true)
  const [ref, width] = useWidth<HTMLDivElement>()
  const narrow = width !== null && width < 640
  const W = narrow ? 360 : 640
  const H = 164
  const x0 = narrow ? 12 : 24
  const span = W - 2 * x0
  const ms = (t: number) => x0 + (t / 500) * span
  const y = 64
  const h = 34
  const done = limit ? 420 : 100
  const ids = 'cpu7'
  const runs: [number, number][] = limit ? [0, 1, 2, 3, 4].map((p) => [p * 100, p * 100 + 20]) : [[0, 100]]
  const waits: [number, number][] = limit ? [0, 1, 2, 3].map((p) => [p * 100 + 20, (p + 1) * 100]) : []
  return (
    <div ref={ref} className={styles.beltBox}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={limit ? 'Uz cpu.max 20000 100000 proces u svakih 100 ms radi 20 ms, a ostatak čeka; zahtjev od 100 ms procesora gotov je nakon oko 420 ms.' : 'Bez ograničenja zahtjev od 100 ms procesora gotov je nakon 100 ms.'} style={{ display: 'block', width: '100%', maxWidth: narrow ? 460 : undefined, margin: '0 auto', height: 'auto', overflow: 'visible' }}>
        <Hatches id={ids} />
        <text x={x0} y={20} className="k-svg-hand" style={{ fontSize: 21 }}>
          zahtjev kojem treba 100 ms procesora
        </text>
        {waits.map(([a, b], i) => (
          <rect key={`w${i}`} x={ms(a)} y={y} width={ms(b) - ms(a)} height={h} fill={`url(#${ids}-ink)`} />
        ))}
        {runs.map(([a, b], i) => (
          <rect key={`r${i}`} x={ms(a)} y={y} width={ms(b) - ms(a)} height={h} fill={`url(#${ids}-green)`} style={{ stroke: 'var(--green)', strokeWidth: 1.5 }} />
        ))}
        <Rough shape={{ k: 'line', x1: x0, y1: y + h, x2: W - x0, y2: y + h }} seed={8201} strokeWidth={1.5} />
        {[0, 100, 200, 300, 400, 500].map((t) => (
          <g key={t}>
            <line x1={ms(t)} y1={y - 6} x2={ms(t)} y2={y + h + 6} style={{ stroke: 'var(--ink-3)', strokeWidth: 1, strokeDasharray: t ? '3 3' : undefined }} />
            <text x={ms(t)} y={y + h + 24} textAnchor={t === 0 ? 'start' : t === 500 ? 'end' : 'middle'} className="k-svg-mono" style={{ fontSize: 13.5, fill: 'var(--ink-2)' }}>
              {t === 0 ? '0' : narrow && t % 200 ? '' : `${t} ms`}
            </text>
          </g>
        ))}
        {/* done marker */}
        <line x1={ms(done)} y1={y - 12} x2={ms(done)} y2={y + h + 4} style={{ stroke: 'var(--red)', strokeWidth: 2 }} />
        <text x={ms(done) + (limit ? -6 : 6)} y={y - 16} textAnchor={limit ? 'end' : 'start'} className="k-svg-hand" style={{ fontSize: 20, fill: 'var(--red)' }}>
          gotovo: {limit ? '≈ 420 ms' : '100 ms'}
        </text>
        {limit && !narrow && (
          <text x={ms(60)} y={y + h / 2 + 6} textAnchor="middle" className="k-svg-hand k-dhalo" style={{ fontSize: 19, fill: 'var(--ink-2)' }}>
            čeka
          </text>
        )}
        <text x={W - x0} y={H - 4} textAnchor="end" className="k-svg-hand" style={{ fontSize: 19, fill: 'var(--ink-2)' }}>
          {limit ? (narrow ? 'zeleno radi · sivo čeka' : 'zeleno = radi · sivo = čeka (throttled)') : 'zeleno = radi'}
        </text>
      </svg>
      <div className={styles.controls}>
        <Toggle label="cpu.max: 20000 100000" checked={limit} onChange={setLimit} hint="20 ms procesora u svakih 100 ms" />
      </div>
      <p className={styles.readout} aria-live="polite">
        {limit ? 'Proces nije ubijen – samo čeka. Zahtjev od 100 ms procesora traje ≈ 420 ms, a brojač prigušivanja (nr_throttled u cpu.stat) raste.' : 'Bez ograničenja proces dobije procesor kad god ga treba: gotov je za 100 ms.'}
      </p>
    </div>
  )
}
