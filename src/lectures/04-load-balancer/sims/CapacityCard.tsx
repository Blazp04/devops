import { useState, type ReactNode } from 'react'
import { Brain, Button, Plate, Rough, RoughAround, Segmented, Slider, fmt, plural, useWidth } from '../../../kit'
import { BASE_RAM_MB, WORKLOADS, capacityOf, type WorkloadId } from '../../../engines/traffic'
import { WORKLOAD_SHORT } from '../lb'
import css from '../styles.module.css'

/* „Koliko može koji poslužitelj?” – a server builder card. Brains = cores (throughput), plates = radnici that fit in
   RAM (concurrency). Capacity ≈ the smaller of the two limits; the bottleneck gets a red pencil circle.
   Numbers come from the E1 engine's capacityOf() – the same arithmetic the simulations run on. */

const RAM_CHOICES = [1, 2, 4, 8, 16] as const
const PRESETS: { label: string; vcpu: number; ram: number }[] = [
  { label: 'Mali', vcpu: 1, ram: 2 },
  { label: 'Srednji', vcpu: 2, ram: 4 },
  { label: 'Veliki', vcpu: 4, ram: 8 },
  { label: '4 vCPU / 2 GB', vcpu: 4, ram: 2 },
  { label: '1 vCPU / 8 GB', vcpu: 1, ram: 8 },
]
const MAX_PLATES = 32
const PER_ROW = 8

function ServerSheet({ vcpu, ram, W, narrow }: { vcpu: number; ram: number; W: number; narrow: boolean }) {
  const per = W > MAX_PLATES ? Math.ceil(W / MAX_PLATES) : 1
  const plates = Math.ceil(W / per)
  const rows = Math.ceil(plates / PER_ROW)
  const brainRows = vcpu > 4 ? 2 : 1
  const plateY0 = 120 + (brainRows - 1) * 30
  const H = plateY0 + (rows - 1) * 21 + 62
  const w = 300
  return (
    <svg className={css.drawing} viewBox={`0 0 ${w} ${H}`} style={{ maxWidth: narrow ? 420 : 340 }} role="img" aria-label={`Poslužitelj s ${vcpu} vCPU i ${ram} GB RAM-a: ${plural(vcpu, ['procesorska jezgra', 'procesorske jezgre', 'procesorskih jezgri'])} i ${plural(W, ['radnik', 'radnika', 'radnika'])}.`}>
      <Rough shape={{ k: 'rect', x: 4, y: 4, w: w - 8, h: H - 8 }} seed={5401} strokeWidth={2} fillColor="var(--paper)" fillStyle="solid" />
      <text x={20} y={36} className="k-svg-display" style={{ fontSize: 24 }}>
        Vaš poslužitelj
      </text>
      <text x={20} y={60} className="k-svg-mono" style={{ fontSize: 16, fill: 'var(--ink-2)' }}>
        {vcpu} vCPU · {ram} GB RAM
      </text>
      <text x={20} y={96} className="k-svg-hand" style={{ fontSize: 21, fill: 'var(--ink-2)' }}>
        CPU
      </text>
      {Array.from({ length: vcpu }, (_, c) => (
        <Brain key={c} x={72 + (c % 4) * 34} y={78 + Math.floor(c / 4) * 30} w={28} h={23} busy={0} seed={5410 + c} />
      ))}
      <text x={20} y={plateY0 + 6} className="k-svg-hand" style={{ fontSize: 21, fill: 'var(--ink-2)' }}>
        RAM
      </text>
      {Array.from({ length: plates }, (_, k) => (
        <Plate key={k} cx={80 + (k % PER_ROW) * 25} cy={plateY0 + Math.floor(k / PER_ROW) * 21} r={8.5} />
      ))}
      <text x={20} y={H - 22} className="k-svg-mono" style={{ fontSize: 15, fill: 'var(--ink-2)' }}>
        {W} radnika{per > 1 ? ` · 1 tanjur = ${per}` : ''} · sustav {fmt.num(BASE_RAM_MB / 1024, 1)} GB
      </text>
    </svg>
  )
}

export function CapacityCard() {
  const [vcpu, setVcpu] = useState(2)
  const [ram, setRam] = useState(4)
  const [wl, setWl] = useState<WorkloadId>('api')
  const [ref, w] = useWidth<HTMLDivElement>()
  const narrow = w !== null && w < 640
  const work = WORKLOADS[wl]
  const c = capacityOf(vcpu, ram, wl)
  const cpuWins = c.bound === 'cpu'
  const line = (on: boolean, children: ReactNode) =>
    on ? (
      <RoughAround stroke="var(--red)" padX={10} padY={5} strokeWidth={2} seed={5450}>
        {children}
      </RoughAround>
    ) : (
      children
    )
  return (
    <div ref={ref} className={css.capWrap} data-narrow={narrow ? '' : undefined}>
      <div className={css.capControls}>
        <div className={css.presetRow} role="group" aria-label="Gotovi poslužitelji">
          {PRESETS.map((p) => (
            <Button
              key={p.label}
              size="sm"
              active={p.vcpu === vcpu && p.ram === ram}
              onClick={() => {
                setVcpu(p.vcpu)
                setRam(p.ram)
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <Slider label="Procesorske jezgre" value={vcpu} min={1} max={8} onChange={setVcpu} format={(v) => `${v} vCPU`} />
        <Segmented label="RAM" size="sm" value={ram} onChange={setRam} options={RAM_CHOICES.map((r) => ({ value: r, label: `${r} GB` }))} />
        <Segmented label="Vrsta zahtjeva" size="sm" value={wl} onChange={setWl} options={(['api', 'io', 'cpu'] as WorkloadId[]).map((x) => ({ value: x, label: WORKLOAD_SHORT[x] }))} />
        <p className={css.small}>{work.description}</p>
      </div>
      <div className={css.capResult}>
        <ServerSheet vcpu={vcpu} ram={ram} W={c.W} narrow={narrow} />
        <dl className={css.calc} aria-live="polite">
          <div>
            <dt>procesor</dt>
            <dd>
              {vcpu} × 1000 ms ÷ {work.cpuMs} ms = {line(cpuWins, <b>{fmt.num(c.cpu, 1)}/s</b>)}
            </dd>
          </div>
          <div>
            <dt>radnici u RAM-u</dt>
            <dd>
              ({fmt.num(ram)} GB − 0,5 GB) ÷ {work.memMB} MB = <b>{c.W}</b>
            </dd>
          </div>
          <div>
            <dt>RAM</dt>
            <dd>
              {c.W} × 1000 ms ÷ ({work.cpuMs} + {work.ioMs}) ms = {line(!cpuWins, <b>{fmt.num(c.mem, 1)}/s</b>)}
            </dd>
          </div>
          <div className={css.calcTotal}>
            <dt>kapacitet ≈ manji broj</dt>
            <dd>
              <b>{fmt.num(c.cap, 1)} zahtjeva/s</b> · usko grlo: <span className={css.bad}>{cpuWins ? 'procesor' : 'RAM (premalo radnika)'}</span>
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
