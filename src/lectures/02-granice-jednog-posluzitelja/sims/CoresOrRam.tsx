import { useState } from 'react'
import { Figure, Mark, Rough, Segmented, fmt, useWidth } from '../../../kit'
import { WORKLOADS, capacityOf } from '../../../engines/traffic'
import { nb } from '../model'
import { BENCH_LAMBDA, BENCH_RAM, BENCH_VCPUS, benchRun, benchView, type BenchRam, type BenchVcpu, type BenchWorkload } from '../bench'
import { stageLayoutFor } from '../geometry'
import { ServerStage } from './ServerStage'
import styles from '../styles.module.css'

const WL_LABEL: Record<BenchWorkload, string> = { api: 'API (računa)', io: 'I/O (čeka bazu)' }
/** Local titles: Klopa at lunch is the I/O profile; the API profile is there for comparison. */
const WL_TITLE: Record<BenchWorkload, string> = {
  api: 'API koji više računa: 200 ms procesora + 300 ms baze po zahtjevu (za usporedbu)',
  io: 'Klopa u podne: 50 ms procesora + 1000 ms čekanja baze po zahtjevu',
}

/** Goodput for 2 / 4 / 8 GB as three pencil bars against the 30 requests/s that arrive. */
function Bars({ workload, vcpu, ram, narrow }: { workload: BenchWorkload; vcpu: BenchVcpu; ram: BenchRam; narrow: boolean }) {
  // same scale as the stage above (760 units wide), values printed right at the end of each bar
  const W = narrow ? 360 : 760
  const x0 = narrow ? 16 : 230
  const x1 = W - (narrow ? 74 : 96)
  const rowH = narrow ? 64 : 44
  const top = 34
  const H = top + BENCH_RAM.length * rowH + 8
  const sx = (v: number) => x0 + (Math.min(v, BENCH_LAMBDA) / BENCH_LAMBDA) * (x1 - x0)
  /** value label after the bar, or right of the „stiže 30/s” line when the bar almost reaches it */
  const valueX = (v: number) => (sx(v) + 10 + 56 > x1 - 4 ? x1 + 10 : sx(v) + 10)
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ display: 'block', width: '100%', maxWidth: narrow ? 460 : 860, height: 'auto', margin: '18px auto 0' }}
      role="img"
      aria-label={`Uspješni odgovori u sekundi pri 30 zahtjeva u sekundi (${vcpu} vCPU): ${BENCH_RAM.map((g) => `${g} GB ${fmt.num(benchRun(workload, vcpu, g).okRps, 1)}`).join(', ')}.`}
    >
      <text x={sx(BENCH_LAMBDA)} y={18} textAnchor="end" className="k-svg-hand" style={{ fontSize: 21, fill: 'var(--tray-ink)' }}>
        stiže {BENCH_LAMBDA}/s
      </text>
      <Rough shape={{ k: 'line', x1: sx(BENCH_LAMBDA), y1: 24, x2: sx(BENCH_LAMBDA), y2: H - 4 }} seed={2601} stroke="var(--tray-ink)" strokeWidth={1.5} dash="5 4" />
      {!narrow && <Rough shape={{ k: 'line', x1: x0, y1: 24, x2: x0, y2: H - 4 }} seed={2602} stroke="var(--ink-2)" strokeWidth={1.5} />}
      {BENCH_RAM.map((g, i) => {
        const r = benchRun(workload, vcpu, g)
        const y = top + i * rowH
        const on = g === ram
        const cap = capacityOf(vcpu, g, workload)
        const by = narrow ? y + 24 : y + 4
        const label = `${g} GB · ${cap.W} radnika`
        return (
          <g key={g}>
            <text x={narrow ? x0 : x0 - 12} y={narrow ? y + 16 : y + 21} textAnchor={narrow ? 'start' : 'end'} className="k-svg-mono" style={{ fontSize: 14.5, fontWeight: on ? 700 : 400 }}>
              {label}
            </text>
            {on && (
              <Rough
                shape={{ k: 'ellipse', cx: narrow ? x0 + 70 : x0 - 92, cy: narrow ? y + 11 : y + 16, w: 176, h: 32 }}
                seed={2630 + i}
                stroke="var(--red)"
                strokeWidth={1.6}
              />
            )}
            <Rough
              shape={{ k: 'rect', x: x0, y: by, w: Math.max(2, sx(r.okRps) - x0), h: 24 }}
              seed={2610 + i * 3 + (workload === 'io' ? 20 : 0) + (vcpu === 4 ? 40 : 0)}
              stroke={on ? 'var(--ink)' : 'var(--ink-3)'}
              strokeWidth={on ? 1.8 : 1.3}
              fillColor={on ? 'var(--hl-green-ink)' : 'var(--ink-4)'}
              hachureGap={on ? 3.2 : 4.5}
            />
            <text x={valueX(r.okRps)} y={by + 18} className="k-svg-mono" style={{ fontSize: 14.5, fontWeight: 700 }}>
              {fmt.num(r.okRps, 1)}/s
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/**
 * Scene „Jezgre ili RAM?”: the same server with 2 or 4 vCPU, two kinds of work, three RAM sizes, 30 requests/s.
 * The numbers are measured by the E1 engine (headless, seed 42); the formula beside them is the napkin version.
 */
export function CoresOrRam() {
  const [workload, setWorkload] = useState<BenchWorkload>('io')
  const [vcpu, setVcpu] = useState<BenchVcpu>(2)
  const [ram, setRam] = useState<BenchRam>(2)
  const [ref, width] = useWidth<HTMLDivElement>()
  const layout = stageLayoutFor(width)
  const r = benchRun(workload, vcpu, ram)
  const wl = WORKLOADS[workload]
  const cap = capacityOf(vcpu, ram, workload)
  const bottleneck = cap.bound === 'cpu' ? 'procesor' : 'radnici (RAM)'
  return (
    <Figure wide caption={`Izmjereno u simulaciji: ${BENCH_LAMBDA} zahtjeva u sekundi, 120 s, seed 42. Crtež je stanje na kraju mjerenja.`}>
      <div ref={ref}>
        <div className={styles.controlsRow}>
          <Segmented label="Vrsta posla" value={workload} options={(['api', 'io'] as const).map((x) => ({ value: x, label: WL_LABEL[x], title: WL_TITLE[x] }))} onChange={setWorkload} />
          <Segmented label="Jezgre" value={vcpu} options={BENCH_VCPUS.map((c) => ({ value: c, label: `${c} vCPU` }))} onChange={setVcpu} />
          <Segmented label="RAM" value={ram} options={BENCH_RAM.map((g) => ({ value: g, label: `${g} GB` }))} onChange={setRam} />
        </div>
        <ServerStage
          showDavor={false}
          view={benchView(workload, vcpu, ram)}
          layout={layout}
          label={`${vcpu} vCPU i ${ram} GB pod opterećenjem ${wl.label}: zauzeto ${cap.W} od ${cap.W} radnika, procesor ${fmt.pct(r.servers[0].cpu)}, uspješno ${fmt.num(r.okRps, 1)} odgovora u sekundi.`}
        />
        <Bars workload={workload} vcpu={vcpu} ram={ram} narrow={layout !== 'wide'} />
        <ul className={styles.formula}>
          <li>
            <span className={styles.formulaTag}>procesor</span>
            <span>
              {vcpu} jezgre × 1000 ms / {wl.cpuMs} ms = {fmt.num(cap.cpu, 1)} odgovora/s
            </span>
          </li>
          <li>
            <span className={styles.formulaTag}>radnici</span>
            <span>
              {cap.W} × 1000 ms / ({wl.cpuMs} + {wl.ioMs}) ms = {fmt.num(cap.mem, 1)} odgovora/s
            </span>
          </li>
          <li>
            <span className={styles.formulaTag}>usko grlo</span>
            <span>
              <Mark c={cap.bound === 'cpu' ? 'pink' : 'blue'}>{bottleneck}</Mark> – najviše ≈ {fmt.num(cap.cap, 1)}/s; izmjereno {fmt.num(r.okRps, 1)}/s uz procesor na {nb(fmt.pct(r.servers[0].cpu))}
            </span>
          </li>
        </ul>
      </div>
    </Figure>
  )
}
