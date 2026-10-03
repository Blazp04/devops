/**
 * „Prozor otkrivanja”: a timeline of S3's health-check probes around a failure (E1 run per setting, lib/detection.ts).
 * Red band = the time the load balancer still believes in a dead server; trays under it = requests lost meanwhile.
 */
import { useMemo, useState } from 'react'
import { Check, Cross, Rough, Segmented, SimFrame, Slider, Stat, StatRow, TrayDefs, fmt, plural, useWidth } from '../../../kit'
import { detectionRun, withStreaks, type FaultKind } from '../lib/detection'
import { TimeoutClock } from './parts'

const KINDS: { value: FaultKind; label: string }[] = [
  { value: 'crash', label: 'Proces pao' },
  { value: 'hang', label: 'Proces visi' },
]

const H = 312
const AXIS = 150
const STACK_BOTTOM = 298
const TRAY_ID = 'l05dw'
const PROBES_LABEL = 'provjere (kuc-kuc)'
const TRAYS_LABEL = 'narudžbe za S3 nakon kvara'

function sec(ms: number): string {
  const v = Math.round(ms / 100) / 10
  return `${fmt.num(v === 0 ? 0 : v, Number.isInteger(v) ? 0 : 1)} s`
}

export function DetectionWindow() {
  const [interval, setIntervalS] = useState(2)
  const [threshold, setThreshold] = useState(2)
  const [phase, setPhase] = useState(0)
  const [kind, setKind] = useState<FaultKind>('crash')
  const [ref, width] = useWidth<HTMLDivElement>()
  const narrow = width !== null && width < 650
  const W = narrow ? 380 : 760
  const x0 = narrow ? 18 : 30
  const x1 = W - (narrow ? 16 : 24)
  // narrow: ~320 px on a phone, so the lettering is one size up (≥ 12 px mono, ≥ 17 px handwriting)
  const mono = narrow ? 15 : 14
  const hand = narrow ? 21 : 20

  const run = useMemo(() => detectionRun(interval * 1000, threshold, phase / 100, kind), [interval, threshold, phase, kind])
  const det = run.detectedAt ?? run.failAt + threshold * run.intervalMs
  const tStart = run.lastPassAt - run.intervalMs * 0.35
  const tEnd = Math.max(det, ...run.probes.filter((p) => p.t <= det).map((p) => p.at)) + run.intervalMs * 0.55
  const x = (t: number) => x0 + ((t - tStart) / (tEnd - tStart)) * (x1 - x0)
  const win = det - run.failAt
  const probes = run.probes.filter((p) => p.t >= tStart && p.t <= tEnd)

  // consecutive failures per probe (what the clipboard would say after it)
  const marks = withStreaks(probes)
  const minGap = probes.length > 1 ? x(probes[1].t) - x(probes[0].t) : Infinity
  const labelEvery = minGap >= 64 ? 1 : minGap >= 32 ? 2 : 3

  // failed trays: a histogram in buckets along the time axis (stacked, like trays on the floor)
  const bucketW = narrow ? 14 : 16
  const buckets = new Map<number, number>()
  for (const t of run.failedArrivals) {
    const b = Math.floor((x(Math.max(t, run.failAt)) - x0) / bucketW)
    buckets.set(b, (buckets.get(b) ?? 0) + 1)
  }
  const MAX_STACK = 7

  const bandX = x(run.failAt)
  const bandW = Math.max(2, x(det) - bandX)
  const bandLabel = `prozor otkrivanja: ${sec(win)}`
  const labelW = bandLabel.length * 9.6
  const labelX = Math.min(Math.max(bandX + bandW / 2, x0 + labelW / 2), x1 - labelW / 2)
  const realLo = (threshold - 1) * 30 + (kind === 'hang' ? 5 : 0)
  const realHi = threshold * 30 + (kind === 'hang' ? 5 : 0)

  // the red failure line skips the two row labels when it would run through their letters
  const charW = hand * 0.37
  const crosses = (label: string) => bandX > x0 - 4 && bandX < x0 + label.length * charW + 6
  const padBreaks: [number, number][] = []
  if (crosses(PROBES_LABEL)) padBreaks.push([74, 98])
  if (crosses(TRAYS_LABEL)) padBreaks.push([184, 208])
  const padSegments: [number, number][] = []
  let from = 38
  for (const [a, b] of padBreaks) {
    padSegments.push([from, a])
    from = b
  }
  padSegments.push([from, STACK_BOTTOM + 4])

  return (
    <SimFrame
      title="prozor otkrivanja"
      subtitle="Load balancer provjerava S3 u stalnom ritmu. Proces pada između dviju provjera; točke su stvarne provjere i stvarne narudžbe iz simulacije (kružno, 15 zahtjeva/s)."
      hint="pomičite trenutak pada između dviju provjera, pa promijenite interval i prag. Može li prozor ikad biti nula?"
      controls={
        <>
          <Slider label="Interval provjere" value={interval} min={1} max={10} onChange={setIntervalS} format={(v) => `${v} s (sim)`} hint="stvarno, AWS ALB zadano: 30 s" />
          <Slider label="Prag (neuspjeha zaredom)" value={threshold} min={1} max={5} onChange={setThreshold} format={(v) => String(v)} hint="AWS ALB zadano: 2" />
          <Slider label="Trenutak pada" value={phase} min={0} max={100} step={5} onChange={setPhase} format={(v) => (v === 0 ? 'odmah nakon' : v === 100 ? 'tik prije' : `${v} %`)} hint="položaj između dviju provjera" />
          <Segmented label="Kvar" value={kind} options={KINDS} onChange={setKind} size="sm" />
        </>
      }
      stats={
        <StatRow>
          <Stat label="prozor otkrivanja" value={sec(win)} tone="bad" sub={`između ${sec((threshold - 1) * run.intervalMs)} i ${sec(threshold * run.intervalMs)}${kind === 'hang' ? ` + ${sec(run.timeoutMs)} čekanja na provjeru` : ''}`} />
          <Stat label="propalo u prozoru" value={fmt.num(run.failedBeforeDetection)} tone={run.failedBeforeDetection > 0 ? 'bad' : 'ok'} sub={plural(run.failedBeforeDetection, ['narudžba', 'narudžbe', 'narudžbi'], false) + ' za S3 nakon kvara'} />
          <Stat label="isti prag, interval 30 s" value={`${realLo}–${realHi} s`} sub={kind === 'hang' ? 'AWS ALB: provjera čeka do 5 s' : 'koliko bi to trajalo u stvarnosti'} />
        </StatRow>
      }
    >
      <div ref={ref} style={{ width: '100%' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Vremenska crta: provjera svakih ${interval} s, prag ${threshold}. ${kind === 'crash' ? 'Proces pada' : 'Proces se zamrzne'}, a load balancer ga izbacuje ${sec(win)} kasnije. U tom prozoru propalo je ${run.failedBeforeDetection} narudžbi.`}
          style={{ display: 'block', width: '100%', maxWidth: narrow ? 460 : undefined, margin: '0 auto', height: 'auto', overflow: 'visible' }}
        >
          <TrayDefs id={TRAY_ID} />
          {/* the window: from the failure to the moment the LB stops sending */}
          <Rough shape={{ k: 'rect', x: bandX, y: 40, w: bandW, h: STACK_BOTTOM + 4 - 40 }} stroke="none" strokeWidth={0} fillColor="var(--red)" hachureGap={10} fillWeight={0.8} seed={6109} />
          {padSegments.map(([a, b], i) => (
            <Rough key={i} shape={{ k: 'line', x1: bandX, y1: a, x2: bandX, y2: b }} seed={6110 + i * 7} stroke="var(--red)" strokeWidth={2} />
          ))}
          {/* the moment the LB stops sending; the pen line breaks around the probe marks and the tick label */}
          <Rough shape={{ k: 'line', x1: x(det), y1: 38, x2: x(det), y2: AXIS - 58 }} seed={6111} stroke="var(--pen)" strokeWidth={2} dash="5 4" />
          <Rough shape={{ k: 'line', x1: x(det), y1: AXIS + 30, x2: x(det), y2: STACK_BOTTOM + 4 }} seed={6113} stroke="var(--pen)" strokeWidth={2} dash="5 4" />
          <text x={bandX - 6} y={30} textAnchor="end" className="k-svg-hand" style={{ fontSize: 21, fill: 'var(--red)' }}>
            {kind === 'crash' ? 'pad' : 'zastoj'}
          </text>
          <text x={x(det) + 6} y={30} className="k-svg-hand" style={{ fontSize: 21, fill: 'var(--pen)' }}>
            izbačen
          </text>
          {/* the label sits on a paper tag, never on the hatching */}
          <Rough shape={{ k: 'rect', x: labelX - labelW / 2 - 6, y: 46, w: labelW + 12, h: 28 }} stroke="var(--red)" strokeWidth={1.2} fillColor="var(--paper)" fillStyle="solid" seed={6108} />
          <text x={labelX} y={66} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 21, fill: 'var(--red)', fontWeight: 700 }}>
            {bandLabel}
          </text>

          {/* probes */}
          <text x={x0} y={92} className="k-svg-hand" style={{ fontSize: hand, fill: 'var(--ink-2)' }}>
            {PROBES_LABEL}
          </text>
          <Rough shape={{ k: 'line', x1: x0, y1: AXIS, x2: x1, y2: AXIS }} seed={6112} strokeWidth={1.6} />
          {marks.map(({ p, n }, i) => {
            const px = x(p.t)
            const late = p.outcome === 'timeout'
            return (
              <g key={p.t}>
                {late && (
                  <>
                    <Rough shape={{ k: 'line', x1: px, y1: AXIS - 14, x2: x(p.at), y2: AXIS - 14 }} seed={6200 + i} stroke="var(--pen)" strokeWidth={1.4} dash="3 3" />
                    <TimeoutClock x={(px + x(p.at)) / 2} y={AXIS - 14} f={0.7} r={6} />
                  </>
                )}
                <circle cx={px} cy={AXIS} r={5} style={{ fill: 'var(--paper)', stroke: 'var(--pen)', strokeWidth: 1.8 }} />
                <g transform={`translate(${late ? x(p.at) : px} ${AXIS - 30})`}>{p.outcome === 'pass' ? <Check x={0} y={0} size={7} seed={6300 + i} /> : <Cross x={0} y={0} size={7} seed={6400 + i} />}</g>
                {p.outcome !== 'pass' && (
                  <text x={late ? x(p.at) : px} y={AXIS - 46} textAnchor="middle" className="k-svg-mono" style={{ fontSize: mono, fontWeight: 700, fill: n >= threshold ? 'var(--red)' : 'var(--orange)' }}>
                    {Math.min(n, threshold)}/{threshold}
                  </text>
                )}
                {i % labelEvery === 0 && (
                  <text x={px} y={AXIS + 22} textAnchor="middle" className="k-svg-mono" style={{ fontSize: mono, fill: 'var(--ink-2)' }}>
                    {Math.round((p.t - run.failAt) / 100) > 0 ? '+' : ''}
                    {sec(p.t - run.failAt)}
                  </text>
                )}
              </g>
            )
          })}

          {/* failed requests: trays on the floor */}
          <text x={x0} y={202} className="k-svg-hand" style={{ fontSize: hand, fill: 'var(--ink-2)' }}>
            {TRAYS_LABEL}
          </text>
          {[...buckets.entries()].map(([b, n]) => {
            const bx = x0 + b * bucketW + 1
            return (
              <g key={b}>
                {Array.from({ length: Math.min(n, MAX_STACK) }, (_, k) => (
                  <use key={k} href={`#${TRAY_ID}-tray`} x={bx} y={STACK_BOTTOM - 10 - k * 10} width={bucketW - 2} height={9.5} transform={`rotate(${k % 2 ? 9 : -7} ${bx + bucketW / 2} ${STACK_BOTTOM - 5 - k * 10})`} />
                ))}
                {n > MAX_STACK && (
                  <text x={bx + bucketW / 2} y={STACK_BOTTOM - 14 - MAX_STACK * 10} textAnchor="middle" className="k-svg-mono" style={{ fontSize: mono, fill: 'var(--red)' }}>
                    +{n - MAX_STACK}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>
    </SimFrame>
  )
}
