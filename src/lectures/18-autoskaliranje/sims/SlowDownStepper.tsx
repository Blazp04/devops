/**
 * Scene 3 „Polako prema dolje”: the validated spike (seed 42) as a timeline. Up: one sync at a time, at most
 * +100 % or +4 Pods per 15 s. Down: every 15 s the formula's recommendation is written down; the HPA scales to the
 * HIGHEST recommendation of the last 300 s, so the drop comes all at once, 300 s after the load fell.
 * Every number and dot comes from the engine run in lib/story.ts.
 */
import { useState } from 'react'
import { Cross, DLabel, Diagram, Legend, Rough, StepBadge, Stepper, stepColor, useWidth } from '../../../kit'
import { spikeStory, STORY_END } from '../lib/story'
import styles from '../styles.module.css'

const WIDE_MIN = 680

const STEPS = [
  {
    title: 't = 60 s: nalet počinje',
    body: 'Promet skoči s 20 na 100 zahtjeva/s. Metrika je prosjek zadnjih 15 s, pa prva provjera vidi tek dio naleta: 60 % (cilj 50 %) → ⌈1,2 × 2⌉ = 3 Poda.',
  },
  {
    title: 't = 75 s: formula traži 8, smije 7',
    body: 'Dva spremna Poda su na 193 %. Treći se još pokreće, pa ga HPA pri povećanju računa kao 0 %: prosjek 128 %, ⌈2,56 × 3⌉ = 8. Ali povećanje je ograničeno na najviše +100 % ili +4 Poda u 15 s – veće od ta dva je 3 + 4 = 7.',
  },
  {
    title: 't = 90 s: 9 Podova i mir',
    body: 'Sljedeća provjera daje 9. Kad su svi spremni, iskorištenost je 55 % (točno 55,6 %, ali HPA računa u cijelim postocima): omjer 1,10 je unutar tolerancije od 10 %, pa HPA ostaje na 9 – sve do kraja naleta u t = 420 s.',
  },
  {
    title: 't = 435 s: promet je pao, a Podovi ostaju',
    body: 'Iskorištenost je 11 % i formula preporučuje 2. HPA pamti svaku preporuku iz zadnjih 300 s i bira najveću – a to je još uvijek 9. Prozor stabilizacije (300 s) čuva nas od klackalice.',
  },
  {
    title: 't = 720 s: 9 → 2 odjednom',
    body: 'Zadnja preporuka „9” ispala je iz prozora. Najveća u zadnjih 300 s sada je 2, a smanjivanje smije ići do 100 % u 15 s – pa 7 Podova odlazi u jednom potezu. Plaćali smo 5 minuta rezerve da ne bismo skakali gore-dolje.',
  },
]

const REVEAL = [62, 77, 180, 437, STORY_END]
const MARK = [60, 75, 90, 435, 720]
/** steps 1–3 happen within 30 s: they get a zoomed time axis (0–180 s), the way down the whole run */
const ZOOM_END = 180

export function SlowDownStepper() {
  const [story] = useState(spikeStory)
  return (
    <Stepper steps={STEPS} title="HPA kroz jedan nalet" autoPlay={0} caption="Simulacija „Preživite ručak”, seed 42: nalet 20 → 100 zahtjeva/s od t = 60 s do t = 420 s. Točke su preporuke formule svakih 15 s; koraci 1–3 prikazani su uvećano (prve 3 minute).">
      {(step) => <Timeline step={step} story={story} />}
    </Stepper>
  )
}

function Timeline({ step, story }: { step: number; story: ReturnType<typeof spikeStory> }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const wide = width !== null && width >= WIDE_MIN
  const W = wide ? 720 : 340
  const H = wide ? 300 : 330
  const L = wide ? 48 : 34
  const R = W - (wide ? 16 : 10)
  const T = wide ? 46 : 70
  const B = H - 40
  const tEnd = step <= 2 ? ZOOM_END : STORY_END
  const x = (t: number) => L + (t / tEnd) * (R - L)
  const y = (n: number) => B - (n / 11) * (B - T)
  const reveal = REVEAL[step]
  const markT = MARK[step]
  const col = stepColor(step)
  // replicas as a step line, offered traffic as „Podova potrebno pri cilju” (100 zahtjeva/s ÷ 10 = 10)
  const repPts: [number, number][] = []
  for (let t = 0; t <= reveal; t++) {
    const v = story.replicas[t] ?? 0
    if (t > 0) repPts.push([x(t), y(story.replicas[t - 1] ?? v)])
    repPts.push([x(t), y(v)])
  }
  const needPts: [number, number][] = []
  for (let t = 0; t <= reveal; t += 1) {
    const v = (story.rps[t] ?? 0) / 10
    if (t > 0 && (story.rps[t - 1] ?? 0) !== story.rps[t]) needPts.push([x(t), y((story.rps[t - 1] ?? 0) / 10)])
    needPts.push([x(t), y(v)])
  }
  const decisions = story.decisions.filter((d) => d.t <= reveal)
  const windowFrom = step === 3 ? 435 - 300 : step === 4 ? 420 : null
  const windowTo = step === 3 ? 435 : step === 4 ? 720 : null
  const d = story.decisions.find((q) => q.t === markT)
  const noteX = Math.min(R - 10, Math.max(L + 10, x(markT)))
  const anchor = x(markT) > (L + R) / 2 ? 'end' : 'start'
  const noteText = d ? `${d.current} → ${d.final}${d.raw !== d.final ? ` (formula: ${d.raw})` : ''}` : ''
  const label = `Graf broja replika kroz nalet do t = ${reveal} s; ${d ? `u t = ${markT} s: ${d.current} → ${d.final}` : ''}.`

  return (
    <div ref={ref} className={styles.stepFig}>
      <div className={wide ? undefined : styles.narrowFig}>
      <Diagram width={W} height={H} label={label}>
        {/* the stabilisation window */}
        {windowFrom !== null && windowTo !== null && (
          <g>
            <Rough shape={{ k: 'rect', x: x(windowFrom), y: T + 2, w: x(windowTo) - x(windowFrom), h: B - T - 2 }} seed={1901 + step} stroke="var(--pen)" strokeWidth={1.2} dash="6 5" fillColor="var(--hl-blue-ink)" hachureGap={9} fillWeight={0.6} />
            <DLabel x={(x(windowFrom) + x(windowTo)) / 2} y={B - 12} text={wide ? 'prozor stabilizacije: zadnjih 300 s' : 'prozor 300 s'} tone="blue" size={13} />
          </g>
        )}
        {/* axes */}
        <Rough shape={{ k: 'line', x1: L, y1: B, x2: R, y2: B }} seed={1910} strokeWidth={1.5} />
        <Rough shape={{ k: 'line', x1: L, y1: B, x2: L, y2: T - 4 }} seed={1911} strokeWidth={1.5} />
        {[0, 2, 4, 6, 8, 10].map((n) => (
          <DLabel key={n} x={L - 8} y={y(n) + 5} anchor="end" text={`${n}`} mono size={13} />
        ))}
        {(step <= 2 ? (wide ? [0, 30, 60, 90, 120, 150, 180] : [0, 60, 120, 180]) : wide ? [0, 60, 180, 300, 420, 540, 720] : [0, 180, 420, 720]).map((t) => (
          <DLabel key={t} x={x(t)} y={B + 22} text={`${t} s`} mono size={13} anchor={t === tEnd ? 'end' : 'middle'} />
        ))}
        <DLabel x={L + 4} y={T - (wide ? 28 : 52)} anchor="start" text="Podovi" size={13} />
        {/* offered load expressed in Pods at the target */}
        {needPts.length > 1 && <Rough shape={{ k: 'lin', pts: needPts }} seed={1912} stroke="var(--ink-3)" strokeWidth={1.4} dash="3 5" roughness={0.4} />}
        {repPts.length > 1 && <Rough shape={{ k: 'lin', pts: repPts }} seed={1913} stroke="var(--pen)" strokeWidth={2.4} roughness={0.5} />}
        {/* a recommendation the HPA followed = blue dot; one a rule held back = red ✗ at the formula's value */}
        {decisions.map((q) =>
          q.raw === q.final ? (
            <circle key={q.t} cx={x(q.t)} cy={y(Math.min(10.8, q.raw))} r={q.t === markT ? 4.5 : 2.6} className={styles.dotSame} />
          ) : (
            <Cross key={q.t} x={x(q.t)} y={y(Math.min(10.8, q.raw))} size={q.t === markT ? 5.5 : wide ? 4 : 2.8} />
          ),
        )}
        {d && (
          <g>
            {/* the circled number never sits on the dots: wide = beside them, away from the note; narrow = in the top band, before the note */}
            {wide ? (
              <StepBadge n={step + 1} x={x(markT) + (anchor === 'end' ? 26 : -26)} y={Math.max(T + 12, y(Math.min(10.8, Math.max(d.final, d.raw, d.current))) - 30)} color={col} />
            ) : (
              <StepBadge n={step + 1} x={R - noteText.length * 8.4 - 18} y={T - 35} color={col} />
            )}
            <DLabel
              x={wide ? noteX + (anchor === 'end' ? -20 : 20) : R}
              y={wide ? y(Math.max(d.final, d.current)) - (step === 0 ? 0 : 44) : T - 30}
              anchor={wide ? anchor : 'end'}
              mono
              bold
              size={14}
              text={noteText}
            />
          </g>
        )}
      </Diagram>
      </div>
      <Legend
        items={[
          { color: 'var(--pen)', label: 'replike (spec.replicas)', shape: 'line' },
          { color: 'var(--pen)', label: 'preporuka formule', shape: 'dot' },
          { color: 'var(--red)', label: 'preporuka koju je pravilo zadržalo', shape: 'cross' },
          { color: 'var(--ink-3)', label: 'promet ÷ 10 = Podova potrebno pri cilju', shape: 'dashed' },
        ]}
      />
    </div>
  )
}
