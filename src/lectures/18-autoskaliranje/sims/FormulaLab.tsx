/**
 * Scene 1 „Formula uživo”: desired = ⌈current × currentUtil / targetUtil⌉ with the ±10 % tolerance band, computed
 * by the engine's hpaFormula (the same function the flagship's HPA uses). Optional second metric shows that the
 * HPA takes the larger recommendation. The drawing then applies what the lecture's HPA adds on top: minReplicas 1,
 * maxReplicas 20 and the scale-up fence (+100 % or +4 Pods per 15 s), so it never draws 120 lunchboxes.
 */
import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { Button, DLabel, Diagram, PodShape, Rough, Slider, Toggle, fmt, useWidth } from '../../../kit'
import { hpaFormula } from '../../../engines/cluster'
import { pods as podsWord } from '../lib/format'
import styles from '../styles.module.css'

const WIDE_MIN = 680
const RULER_MAX = 4
const MIN_REPLICAS = 1
const MAX_REPLICAS = 20

interface Setup {
  cur: number
  util: number
  target: number
}

const PRESETS: { label: string; s: Setup }[] = [
  { label: '3 Poda na 90 %', s: { cur: 3, util: 90, target: 50 } },
  { label: '3 Poda na 54 %', s: { cur: 3, util: 54, target: 50 } },
  { label: '9 Podova na 55 %', s: { cur: 9, util: 55, target: 50 } },
  { label: '4 Poda na 20 %', s: { cur: 4, util: 20, target: 50 } },
]

export function FormulaLab() {
  // opens on the tolerance case, so the Predict above („3 Poda na 90 %”) is not answered before the reader commits
  const [s, setS] = useState<Setup>(PRESETS[1].s)
  const [mem, setMem] = useState<{ on: boolean; util: number }>({ on: false, util: 40 })
  const [ref, width] = useWidth<HTMLDivElement>()
  const wide = width !== null && width >= WIDE_MIN
  const cpu = hpaFormula(s.cur, s.util, s.target)
  const memTarget = 70
  const m = hpaFormula(s.cur, mem.util, memTarget)
  const fromFormula = mem.on ? Math.max(cpu.desired, m.desired) : cpu.desired
  // the HPA's clamps: [minReplicas, maxReplicas], then at most max(+100 %, +4 Pods) in one 15 s step
  const desired = Math.min(MAX_REPLICAS, Math.max(MIN_REPLICAS, fromFormula))
  const firstStep = desired > s.cur ? Math.min(desired, Math.max(2 * s.cur, s.cur + 4)) : desired
  const W = wide ? 720 : 340
  const rows = Math.max(2, Math.ceil(Math.max(s.cur, desired) / (wide ? 12 : 6)))
  const podY0 = wide ? 262 : 330
  const H = podY0 + rows * 62 + (wide ? 10 : 14)
  const rx0 = wide ? 40 : 20
  const rx1 = W - (wide ? 40 : 20)
  const ry = wide ? 136 : 196
  const rx = (r: number) => rx0 + (Math.min(r, RULER_MAX) / RULER_MAX) * (rx1 - rx0)
  const ratioText = fmt.num(cpu.ratio, 2)
  const raw = s.cur * cpu.ratio
  const result = cpu.withinTolerance ? `${s.cur} (tolerancija)` : cpu.desired < MIN_REPLICAS ? `${cpu.desired} → najmanje 1` : `${cpu.desired}`
  const lines = wide
    ? [`željeno = ⌈ ${s.cur} × ${s.util} % / ${s.target} % ⌉ = ⌈ ${fmt.num(raw, 2)} ⌉ = ${result}`]
    : [`željeno = ⌈ ${s.cur} × ${s.util} / ${s.target} ⌉`, `= ⌈ ${fmt.num(raw, 2)} ⌉ = ${result}`]
  const per = wide ? 12 : 6
  const step = wide ? 54 : 52
  const items = Array.from({ length: Math.max(s.cur, desired) }, (_, i) => i)
  const label = `HPA računa: ${s.cur} × ${s.util} % / ${s.target} % = omjer ${ratioText}; ${cpu.withinTolerance ? 'unutar tolerancije, broj replika ostaje' : `željeno ${desired}`}.`

  return (
    <div ref={ref} className={styles.lab}>
      <div className={wide ? undefined : styles.narrowFig}>
      <Diagram width={W} height={H} label={label}>
        {lines.map((l, i) => (
          <DLabel key={i} x={wide ? 24 : 14} y={40 + i * 30} anchor="start" text={l} mono bold size={wide ? 19 : 16} />
        ))}
        {mem.on && (
          <DLabel
            x={wide ? 24 : 14}
            y={wide ? 74 : 106}
            anchor="start"
            mono
            size={wide ? 15 : 14}
            text={`memorija: ⌈ ${s.cur} × ${mem.util} / ${memTarget} ⌉ = ${m.withinTolerance ? s.cur : m.desired} → HPA uzme veći: ${desired}`}
          />
        )}
        {!mem.on && <DLabel x={wide ? 24 : 14} y={wide ? 74 : 106} anchor="start" text="HPA ovo računa svakih 15 s, za svaku metriku" size={wide ? 14 : 13} />}

        {/* ratio ruler with the dead band */}
        <Rough shape={{ k: 'line', x1: rx0, y1: ry, x2: rx1, y2: ry }} seed={1851} strokeWidth={1.6} />
        <Rough shape={{ k: 'rect', x: rx(0.9), y: ry - 22, w: rx(1.1) - rx(0.9), h: 22 }} seed={1852} stroke="var(--green)" strokeWidth={1.3} fillColor="var(--hl-green-ink)" hachureGap={4} />
        {[0, 1, 2, 3, 4].map((t) => (
          <g key={t}>
            <Rough shape={{ k: 'line', x1: rx(t), y1: ry - 5, x2: rx(t), y2: ry + 5 }} seed={1860 + t} strokeWidth={1.3} />
            <DLabel x={rx(t)} y={ry + 24} text={`${t}`} mono size={13} />
          </g>
        ))}
        <DLabel x={rx(1)} y={ry - 30} text={wide ? 'tolerancija 0,9–1,1: ništa se ne mijenja' : '0,9–1,1: ništa'} tone="ok" size={13} />
        <DLabel x={rx0} y={ry + 72} anchor="start" text="omjer = izmjereno / cilj" size={13} />
        <g>
          <Rough shape={{ k: 'lin', pts: [[rx(cpu.ratio) - 8, ry + 14], [rx(cpu.ratio), ry + 2], [rx(cpu.ratio) + 8, ry + 14]] }} seed={1870} stroke="var(--pen)" strokeWidth={2} roughness={0.6} />
          <DLabel x={Math.min(rx1 - 20, Math.max(rx0 + 30, rx(cpu.ratio)))} y={ry + 46} anchor={wide ? 'middle' : 'end'} text={`${ratioText}${cpu.ratio > RULER_MAX ? ' →' : ''}`} tone="blue" mono bold size={15} />
        </g>

        {/* the replicas: current (solid) and the change (dashed new ones / struck-out extras) */}
        <DLabel
          x={wide ? 24 : 14}
          y={podY0 - 30}
          anchor="start"
          size={14}
          text={
            desired === s.cur
              ? `ostaje ${podsWord(s.cur)}`
              : desired > s.cur
                ? `${s.cur} → ${firstStep}${firstStep < desired ? ` u 15 s, pa do ${desired}` : ''}${fromFormula > MAX_REPLICAS ? ` (maxReplicas ${MAX_REPLICAS})` : ''}`
                : `${s.cur} → ${desired}: višak se gasi (nakon 300 s)`
          }
          tone={desired === s.cur ? 'neutral' : desired > s.cur ? 'blue' : 'warn'}
        />
        <AnimatePresence>
          {items.map((i) => {
            const status = i >= s.cur ? 'creating' : i >= desired ? 'terminating' : 'running'
            return (
              <PodShape
                key={i}
                x={(wide ? 46 : 36) + (i % per) * step}
                y={podY0 + Math.floor(i / per) * 62}
                size={42}
                status={status}
                tone="blue"
                ariaLabel={`Pod ${i + 1}: ${status === 'creating' ? 'novi' : status === 'terminating' ? 'višak' : 'radi'}`}
              />
            )
          })}
        </AnimatePresence>
      </Diagram>
      </div>
      <div className={styles.labControls}>
        <div className={styles.btnRow}>
          {PRESETS.map((p) => (
            <Button key={p.label} size="sm" variant="secondary" active={p.s.cur === s.cur && p.s.util === s.util && p.s.target === s.target} onClick={() => setS(p.s)}>
              {p.label}
            </Button>
          ))}
        </div>
        <div className={styles.sliders}>
          <Slider label="Trenutačni broj replika" value={s.cur} min={1} max={12} onChange={(v) => setS((x) => ({ ...x, cur: v }))} />
          <Slider label="Izmjerena iskorištenost CPU-a" value={s.util} min={0} max={200} format={(v) => `${v} %`} onChange={(v) => setS((x) => ({ ...x, util: v }))} />
          <Slider label="Ciljna iskorištenost" value={s.target} min={20} max={90} step={5} format={(v) => `${v} %`} onChange={(v) => setS((x) => ({ ...x, target: v }))} />
          <Toggle label="Druga metrika: memorija (cilj 70 %)" checked={mem.on} onChange={(v) => setMem((x) => ({ ...x, on: v }))} />
          {mem.on && <Slider label="Izmjerena memorija" value={mem.util} min={0} max={200} format={(v) => `${v} %`} onChange={(v) => setMem((x) => ({ ...x, util: v }))} />}
        </div>
      </div>
    </div>
  )
}
