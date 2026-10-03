/**
 * Scene 4 „Podovi u sekundama, čvorovi u minutama”: two lead-time bars from the same engine run (seed 42) – a Pod
 * that lands on a node with room vs the first Pod that had to wait for the Cluster Autoscaler – and below them the
 * nodes themselves: full nodes, the Pending lunchbox, the node being bought, then the way back down.
 */
import { useState } from 'react'
import { COMPRESSED } from '../../../engines/cluster'
import { Cloud, DLabel, Diagram, Magnifier, NodeFrame, PodShape, Rough, Stepper, stepColor, useWidth } from '../../../kit'
import { spikeStory, type LeadBar } from '../lib/story'
import { secs } from '../lib/format'
import styles from '../styles.module.css'

const WIDE_MIN = 680

const STEPS = [
  {
    title: 'Na čvoru ima mjesta: 11 sekundi',
    body: 'HPA je u t = 60 s zatražio treći Pod. Na čvoru ima mjesta i slika je već tamo: kontejner se pokrene za 1 s, aplikacija se zagrijava 10 s, a provjera spremnosti svakih 5 s. Pod prima promet nakon 11 s.',
  },
  {
    title: 'Nema mjesta: Pod ostaje Pending',
    body: 'U t = 75 s HPA traži 7 Podova, a na dva čvora stanu samo 6 (svaki traži 500m od 1930m). Raspoređivač javlja „Insufficient cpu” i Pod čeka. Cluster Autoscaler pregledava klaster svakih 10 s i vidi ga u t = 80 s.',
  },
  {
    title: 'Cluster Autoscaler naručuje čvor',
    body: 'Cluster Autoscaler ne gleda CPU – gleda Podove koji ne stanu. Provjeri bi li Pod stao na novi čvor iz grupe (2 vCPU · 8 GiB) i zatraži ga od oblaka. Pokretanje stroja traje: u simulaciji 75 s, stvarno minute.',
  },
  {
    title: 'Čvor je spreman: slika, start, spremnost',
    body: 'U t = 155 s čvor je Ready i raspoređivač na njega stavi Pod. Novi čvor nema sliku: povlačenje 5 s (s hladnom predmemorijom i velikom slikom puno dulje), start 1 s, zagrijavanje 10 s. Ukupno 96 s u simulaciji – devet puta dulje od Poda na postojećem čvoru; u stvarnom oblaku pokretanje stroja traje minutama, pa je omjer još veći.',
  },
  {
    title: 'I natrag dolje – polako',
    body: 'Kad promet padne, HPA nakon 300 s smanji Podove. Cluster Autoscaler čvor uklanja tek kad je zbroj requesta na njemu ispod 50 % kapaciteta 10 minuta, a Podovi s njega stanu drugdje. Prazan čvor 3 ide prvi; čvorovi 1 i 2 također su ispod 50 %, ali grupa ima najmanje 2 čvora. Da na čvoru ima Podova, Cluster Autoscaler bi ga najprije ispraznio (drain) i pritom poštovao PodDisruptionBudget.',
  },
]

const PHASES: { key: keyof Omit<LeadBar, 'total' | 'createdAt'>; label: string; short: string; color: string }[] = [
  { key: 'waitCa', label: 'Pending → CA', short: 'CA', color: 'var(--orange)' },
  { key: 'node', label: 'pokretanje čvora', short: 'čvor', color: 'var(--pen)' },
  { key: 'pull', label: 'slika', short: 'slika', color: 'var(--ink-3)' },
  { key: 'start', label: 'start', short: '', color: 'var(--ink-3)' },
  { key: 'ready', label: 'zagrijavanje + spremnost', short: 'spremnost', color: 'var(--green)' },
]

export function LeadTimeStepper() {
  const [story] = useState(spikeStory)
  return (
    <Stepper steps={STEPS} title="Koliko traje novi kapacitet" autoPlay={0} caption={`Iz iste simulacije (seed 42). Novi čvor: ${COMPRESSED.caProvision.label}.`}>
      {(step) => <LeadFigure step={step} fast={story.onNode} slow={story.newNode} />}
    </Stepper>
  )
}

function LeadFigure({ step, fast, slow }: { step: number; fast: LeadBar; slow: LeadBar }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const wide = width !== null && width >= WIDE_MIN
  const W = wide ? 720 : 340
  const H = wide ? 352 : 576
  const L = wide ? 160 : 14
  const R = W - (wide ? 40 : 26)
  const maxT = 100
  const x = (t: number) => L + (t / maxT) * (R - L)
  const laneA = wide ? 46 : 62
  const laneB = wide ? 102 : 146
  const bh = 26
  // how much of the slow bar is drawn in each step
  const slowShown: (keyof LeadBar)[] = step <= 0 ? [] : step === 1 ? ['waitCa'] : step === 2 ? ['waitCa', 'node'] : ['waitCa', 'node', 'pull', 'start', 'ready']
  const col = stepColor(step)
  const nodesY = wide ? 228 : 258
  const label = `Pod na čvoru s mjestom spreman je za ${secs(fast.total)}, Pod koji čeka novi čvor za ${secs(slow.total)}.`

  const bar = (b: LeadBar, y: number, shown: (keyof LeadBar)[]) => {
    let t0 = 0
    return PHASES.map((p) => {
      const d = b[p.key]
      const from = t0
      t0 += d
      if (d <= 0 || !shown.includes(p.key)) return null
      const w = x(from + d) - x(from)
      return (
        <g key={p.key}>
          <Rough shape={{ k: 'rect', x: x(from), y, w, h: bh }} seed={1950 + PHASES.indexOf(p) + y} stroke="var(--ink)" strokeWidth={1.3} fillColor={p.color} hachureGap={5} />
          {w > 44 && <BarLabel cx={x(from) + w / 2} right={x(from) + w} R={R} y={y + bh + 18} text={`${wide ? p.label : p.short} ${secs(d)}`} short={`${p.short || p.label} ${secs(d)}`} wide={wide} />}
        </g>
      )
    })
  }

  return (
    <div ref={ref} className={styles.stepFig}>
      <div className={wide ? undefined : styles.narrowFig}>
      <Diagram width={W} height={H} label={label}>
        {/* time axis */}
        <Rough shape={{ k: 'line', x1: L, y1: laneB + bh + 34, x2: R, y2: laneB + bh + 34 }} seed={1940} strokeWidth={1.3} stroke="var(--ink-3)" />
        {[0, 20, 40, 60, 80, 100].map((t) => (
          <DLabel key={t} x={x(t)} y={laneB + bh + 52} text={`${t} s`} mono size={12} anchor={t === 100 ? 'end' : 'middle'} />
        ))}
        <DLabel x={wide ? 10 : L} y={wide ? laneA + 18 : laneA - 10} anchor="start" text="na čvoru s mjestom" size={13} />
        <DLabel x={wide ? 10 : L} y={wide ? laneB + 18 : laneB - 10} anchor="start" text="čeka novi čvor" size={13} tone={step >= 1 ? 'warn' : 'neutral'} />
        {bar(fast, laneA, ['start', 'ready'])}
        <DLabel x={x(fast.total) + 8} y={laneA + 18} anchor="start" text={`Ready za ${secs(fast.total)}`} tone="ok" mono bold size={13} />
        {bar(slow, laneB, slowShown)}
        {step >= 3 && <DLabel x={Math.min(R, x(slow.total))} y={laneB - 8} anchor="end" text={`Ready za ${secs(slow.total)} (sim)`} tone="ok" mono bold size={13} />}

        {/* the nodes */}
        <Nodes step={step} wide={wide} y0={nodesY} W={W} color={col} />
      </Diagram>
      </div>
    </div>
  )
}

function Nodes({ step, wide, y0, W, color }: { step: number; wide: boolean; y0: number; W: number; color: string }) {
  const nw = wide ? 180 : 150
  const nh = 112
  const gap = wide ? 16 : 12
  const n1 = { x: wide ? 14 : 14, y: y0 }
  const n2 = { x: n1.x + nw + gap, y: y0 }
  const n3 = wide ? { x: W - nw - 14, y: y0 } : { x: 14, y: y0 + nh + 70 }
  const pend = wide ? { x: n2.x + nw + 44, y: y0 + 64 } : { x: n2.x + 40, y: y0 + nh + 120 }
  const scaleDown = step === 4
  // step 1: t = 60 s, 2 → 3 Pods – the third one is starting on čvor 1, there is still room; from step 2 on: 3 + 3 + Pending
  const first = step === 0
  const k1 = first ? 1 : scaleDown ? 1 : 3
  const k2 = first ? 1 : scaleDown ? 1 : 3
  const podsOn = (x: number, y: number, k: number, key: string, creating = 0) =>
    Array.from({ length: k + creating }, (_, i) => (
      <PodShape key={`${key}${i}`} x={x + 28 + i * 46} y={y + 66} size={38} status={i >= k ? 'creating' : 'running'} tone="blue" ariaLabel={i >= k ? 'Pod se pokreće' : 'Pod radi'} />
    ))
  return (
    <g>
      <NodeFrame x={n1.x} y={n1.y} w={nw} h={nh} name="čvor 1" cpu={{ used: (k1 + (first ? 1 : 0)) * 500, total: 1930 }}>
        {podsOn(n1.x, n1.y, k1, 'a', first ? 1 : 0)}
      </NodeFrame>
      <NodeFrame x={n2.x} y={n2.y} w={nw} h={nh} name="čvor 2" cpu={{ used: k2 * 500, total: 1930 }}>
        {podsOn(n2.x, n2.y, k2, 'b')}
      </NodeFrame>
      {first &&
        (wide ? (
          <DLabel x={pend.x - 14} y={pend.y + 4} anchor="start" text="3. Pod: ima mjesta na čvoru 1" tone="ok" size={13} />
        ) : (
          <DLabel x={n1.x + 6} y={n1.y + nh + 22} anchor="start" text="3. Pod: ima mjesta na čvoru 1" tone="ok" size={13} />
        ))}
      {step >= 1 && step <= 2 && (
        <g>
          <PodShape x={pend.x} y={pend.y} size={42} status="pending" tone="blue" ariaLabel="Pod Pending" />
          <Magnifier cx={pend.x + 30} cy={pend.y - 30} r={13} />
          <DLabel x={pend.x} y={pend.y + 40} text="Insufficient cpu" mono size={12} tone="warn" />
        </g>
      )}
      {step === 2 && (
        <g>
          <Rough shape={{ k: 'rect', x: n3.x, y: n3.y, w: nw, h: nh }} seed={1960} stroke={color} strokeWidth={1.6} dash="9 6" />
          <Cloud x={n3.x + nw / 2 - 30} y={n3.y + 14} w={60} h={38} />
          <DLabel x={n3.x + nw / 2} y={n3.y + 76} text="čvor 3 se pokreće…" tone="warn" size={13} />
          <DLabel x={n3.x + nw / 2} y={n3.y + 98} text="75 s (sim)" mono size={12} />
        </g>
      )}
      {step >= 3 && (
        <NodeFrame x={n3.x} y={n3.y} w={nw} h={nh} name="čvor 3" cpu={{ used: scaleDown ? 0 : 1500, total: 1930 }} highlight={step === 3}>
          {scaleDown ? (
            <g>
              <DLabel x={n3.x + nw / 2} y={n3.y + 58} text="prazan – ide prvi" tone="warn" size={13} />
              <DLabel x={n3.x + nw / 2} y={n3.y + 80} text="10 min → ukloni" mono size={12} />
            </g>
          ) : (
            podsOn(n3.x, n3.y, 3, 'c')
          )}
        </NodeFrame>
      )}
    </g>
  )
}

/** a phase label under its bar; near the right edge it switches to the short name, anchored to the bar's end, so it is never cut off */
function BarLabel({ cx, right, R, y, text, short, wide }: { cx: number; right: number; R: number; y: number; text: string; short: string; wide: boolean }) {
  const atEnd = cx + (text.length * (wide ? 7.8 : 7.2)) / 2 > R
  return <DLabel x={atEnd ? Math.min(R, right) : cx} y={y} anchor={atEnd ? 'end' : 'middle'} text={atEnd ? short : text} size={wide ? 13 : 12} mono />
}
