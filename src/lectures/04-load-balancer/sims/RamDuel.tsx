import { useState } from 'react'
import { Play } from 'lucide-react'
import { Brain, Button, Plate, Rough, Segmented, ServerFace, fmt, useWidth, type ServerMood } from '../../../kit'
import { capacityOf } from '../../../engines/traffic'
import { DUEL_RAM, DUEL_VCPU, runDuel, type DuelLambda, type DuelResult } from './duel'
import { HandNote } from './Sketches'
import css from '../styles.module.css'

/* „4 GB ili 8 GB?” – after the prediction: two server cards (brains = cores, plates = radnici in RAM) get exactly the
   same traffic (seed 42, 5 min) on the E1 engine. Before the run the result is a red „?”, after it the cards show
   what the run measured: brains hatched by CPU, food on as many plates as were busy on average. */

const CARD_W = 310
const CARD_H = 306
const PER_ROW = 10

function moodOf(r: DuelResult | undefined): ServerMood {
  if (!r) return 'calm'
  if (r.errPct > 5) return 'panic'
  return r.cpu > 0.8 ? 'busy' : 'calm'
}

function DuelCard({ x, y, ramGB, r, seed }: { x: number; y: number; ramGB: number; r?: DuelResult; seed: number }) {
  const W = capacityOf(DUEL_VCPU, ramGB, 'api').W
  const busy = r ? Math.round(r.busy) : 0
  return (
    <g transform={`translate(${x} ${y})`}>
      <Rough shape={{ k: 'rect', x: 0, y: 0, w: CARD_W, h: CARD_H }} seed={seed} strokeWidth={2} fillColor="var(--paper)" fillStyle="solid" />
      <text x={16} y={34} className="k-svg-display" style={{ fontSize: 23 }}>
        {DUEL_VCPU} vCPU · {ramGB} GB
      </text>
      <g transform={`translate(${CARD_W - 32} 32)`}>
        <ServerFace mood={moodOf(r)} r={19} />
      </g>
      <text x={16} y={78} className="k-svg-hand" style={{ fontSize: 21, fill: 'var(--ink-2)' }}>
        CPU
      </text>
      {Array.from({ length: DUEL_VCPU }, (_, c) => (
        <Brain key={c} x={70 + c * 38} y={60} w={31} h={25} busy={r ? r.cpu : 0} seed={seed + 10 + c} />
      ))}
      <text x={16} y={114} className="k-svg-hand" style={{ fontSize: 21, fill: 'var(--ink-2)' }}>
        RAM
      </text>
      {Array.from({ length: W }, (_, k) => (
        <Plate key={k} cx={78 + (k % PER_ROW) * 23.5} cy={108 + Math.floor(k / PER_ROW) * 22} r={8.5} full={k < busy} />
      ))}
      {r && <HandNote x={16} y={188} lines={[`zauzeto u prosjeku: ${fmt.num(r.busy, 0)} od ${W}`]} size={20} color="var(--ink-2)" />}
      <Rough shape={{ k: 'line', x1: 14, y1: 204, x2: CARD_W - 14, y2: 205 }} seed={seed + 20} stroke="var(--ink-3)" strokeWidth={1.1} dash="5 5" />
      {r ? (
        <g>
          <text x={16} y={242} className="k-svg-mono" style={{ fontSize: 27, fontWeight: 700 }}>
            {fmt.num(r.okRps, 1)}/s
          </text>
          <HandNote x={118} y={240} lines={['obrađeno u sekundi']} size={20} color="var(--ink-2)" />
          <text x={16} y={268} className="k-svg-mono" style={{ fontSize: 14.5, fill: 'var(--ink-2)' }}>
            CPU {fmt.num(r.cpu * 100, 0)} % · greške {fmt.num(r.errPct, 1)} %
          </text>
        </g>
      ) : (
        <g>
          <text x={CARD_W / 2} y={256} textAnchor="middle" className="k-svg-hand" style={{ fontSize: 46, fill: 'var(--red)' }}>
            ?
          </text>
          <text x={16} y={268} className="k-svg-mono" style={{ fontSize: 14.5, fill: 'var(--ink-3)' }}>
            {W} radnika
          </text>
        </g>
      )}
      <text x={16} y={292} className="k-svg-mono" style={{ fontSize: 14.5, fill: 'var(--pen)' }}>
        kapacitet ≈ {fmt.num(capacityOf(DUEL_VCPU, ramGB, 'api').cap)}/s (procesor)
      </text>
    </g>
  )
}

function verdict(lam: DuelLambda, r: DuelResult[] | undefined): string {
  if (!r) return 'Pritisnite gumb: oba poslužitelja dobiju točno iste zahtjeve (seed 42, 5 min prometa).'
  const [a, b] = r
  if (lam === 9)
    return `Isti promet, gotovo isti rezultat: ${fmt.num(a.okRps, 1)} i ${fmt.num(b.okRps, 1)} zahtjeva u sekundi${b.okRps < a.okRps ? ' (8 GB čak malo lošije)' : ''}, a procesor oba na ${fmt.num(a.cpu * 100, 0)}–${fmt.num(b.cpu * 100, 0)} %. Stiže 9 u sekundi, a strop obaju je 10 (dvije procesorske jezgre), pa dio zahtjeva u kratkim naletima ne završi u 5 s. Dodatni tanjuri s 8 GB uglavnom stoje prazni.`
  return `Pri preopterećenju 8 GB obradi čak manje (${fmt.num(b.okRps, 1)} prema ${fmt.num(a.okRps, 1)}/s): ${fmt.num(b.busy, 0)} radnika istodobno dijeli iste dvije jezgre, svaki zahtjev traje dulje i više njih ne završi u 5 s.`
}

export function RamDuel() {
  const [lam, setLam] = useState<DuelLambda>(9)
  const [res, setRes] = useState<Partial<Record<DuelLambda, DuelResult[]>>>({})
  const [ref, w] = useWidth<HTMLDivElement>()
  const narrow = w !== null && w < 580
  const r = res[lam]
  const vb = narrow ? { w: CARD_W + 20, h: CARD_H * 2 + 70 } : { w: CARD_W * 2 + 50, h: CARD_H + 40 }
  const pos = narrow
    ? [
        { x: 10, y: 10 },
        { x: 10, y: CARD_H + 60 },
      ]
    : [
        { x: 10, y: 30 },
        { x: CARD_W + 40, y: 30 },
      ]
  const label = r
    ? `Dva poslužitelja, isti promet od ${lam} zahtjeva u sekundi: ${r.map((x) => `${DUEL_VCPU} vCPU / ${x.ramGB} GB obradi ${fmt.num(x.okRps, 1)} u sekundi uz procesor na ${fmt.num(x.cpu * 100, 0)} %`).join('; ')}.`
    : `Dva poslužitelja, 2 vCPU / 4 GB i 2 vCPU / 8 GB, prije pokretanja: koliko će obraditi, još je upitnik.`
  return (
    <div ref={ref} className={css.duel}>
      <div className={css.duelControls}>
        <Segmented
          label="Promet (isti za oba)"
          size="sm"
          value={lam}
          onChange={setLam}
          options={[
            { value: 9, label: '9 zahtjeva/s' },
            { value: 12, label: '12 zahtjeva/s (previše)' },
          ]}
        />
        <Button variant="primary" icon={Play} onClick={() => setRes((x) => ({ ...x, [lam]: runDuel(lam) }))}>
          Pokreni oba (isti seed)
        </Button>
      </div>
      <svg className={`${css.drawing} ${narrow ? css.drawingNarrow : ''}`} viewBox={`0 0 ${vb.w} ${vb.h}`} style={narrow ? undefined : { maxWidth: 720 }} role="img" aria-label={label}>
        {DUEL_RAM.map((ram, i) => (
          <DuelCard key={ram} x={pos[i].x} y={pos[i].y} ramGB={ram} r={r?.[i]} seed={7300 + i * 40} />
        ))}
        {narrow ? (
          <HandNote x={vb.w / 2} y={CARD_H + 44} lines={['isti zahtjevi, isti seed']} size={20} color="var(--pen)" anchor="middle" />
        ) : (
          <HandNote x={vb.w / 2} y={20} lines={['isti zahtjevi, isti seed']} size={20} color="var(--pen)" anchor="middle" />
        )}
      </svg>
      <p className={css.small} aria-live="polite">
        {verdict(lam, r)}
      </p>
    </div>
  )
}
