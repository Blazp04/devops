/**
 * „Cijena izolacije”: a kernel exploit from one container crosses into every container on the host (the kernel is
 * shared); the same attack inside a VM only reaches that VM's guest kernel and stops at the hypervisor.
 */
import { Check, Cross, Davor, SpeechBubble, StepBadge, Stepper, stepColor, useWidth, type Pt } from '../../../kit'
import { Band, ContainerBox, Crack, Face, ProgramCard, VmFrame } from './parts'

const APPS = ['api', 'worker', 'web', 'redis']
const ATT = 2
const TINT = ['var(--hl-blue-ink)', 'var(--hl-green-ink)', 'var(--hl-orange-ink)', 'var(--hl-pink-ink)']

interface Geo {
  W: number
  H: number
  frame: { x: number; y: number; w: number; h: number }
  kernel: { x: number; y: number; w: number; h: number }
  box: (i: number) => { x: number; y: number; w: number; h: number }
  vm: (i: number) => { x: number; y: number; w: number; h: number }
  davor: { x: number; y: number; s: number }
  bubble: { x: number; y: number; w: number; h: number; tx: number; ty: number }
  note: Pt
  mono: number
  hand: number
}

const WIDE: Geo = {
  W: 720,
  H: 336,
  frame: { x: 12, y: 46, w: 580, h: 282 },
  kernel: { x: 24, y: 262, w: 556, h: 50 },
  box: (i) => ({ x: 40 + i * 136, y: 120, w: 112, h: 62 }),
  vm: (i) => ({ x: 34 + i * 138, y: 64, w: 124, h: 182 }),
  davor: { x: 612, y: 196, s: 0.9 },
  bubble: { x: 598, y: 86, w: 116, h: 64, tx: 648, ty: 210 },
  note: [26, 30],
  mono: 14,
  hand: 21,
}

const NARROW: Geo = {
  W: 360,
  H: 520,
  frame: { x: 6, y: 46, w: 348, h: 332 },
  kernel: { x: 16, y: 314, w: 328, h: 50 },
  box: (i) => ({ x: 28 + (i % 2) * 168, y: 92 + Math.floor(i / 2) * 106, w: 136, h: 62 }),
  vm: (i) => ({ x: 16 + (i % 2) * 170, y: 58 + Math.floor(i / 2) * 124, w: 158, h: 114 }),
  davor: { x: 40, y: 392, s: 0.85 },
  bubble: { x: 126, y: 398, w: 150, h: 64, tx: 98, ty: 420 },
  note: [18, 30],
  mono: 15,
  hand: 21,
}

const STEPS = [
  {
    title: 'Četiri kontejnera, jedna jezgra',
    body: 'Na domaćinu rade četiri Klopina kontejnera. Napadač je kroz ranjivost u web-aplikaciji ušao u kontejner web. Zasad vidi samo ono što mu dopuštaju imenski prostori.',
  },
  {
    title: 'Napad na jezgru',
    body: 'Iz kontejnera napadač pokrene program koji iskorištava grešku u jezgri. Jezgra je ista za sve procese na domaćinu – pa i za njegov.',
  },
  {
    title: 'Pali su svi kontejneri',
    body: 'Tko kontrolira jezgru, kontrolira sve iznad nje: sve kontejnere, njihove datoteke i tajne. Imenski prostori i kontrolne grupe pravila su koja provodi upravo ta jezgra.',
  },
  {
    title: 'Isti napad u virtualnom stroju',
    body: 'U VM-u napadač pokori jezgru gosta – ali to je jezgra samo tog VM-a. Da bi došao do drugih, mora probiti hipervizor, a on napadaču nudi puno manje mjesta za napad i bolje je čuvan.',
  },
]

const NOTES = ['napadač je u jednom kontejneru', 'greška u zajedničkoj jezgri', 'jezgra pala → pali su svi', 'granica je hipervizor']

function Frame({ step, g }: { step: number; g: Geo }) {
  const narrow = g === NARROW
  // blue = the setting, red = the damage, green = the boundary that holds
  const color = [stepColor(0), 'var(--red)', 'var(--red)', 'var(--green)'][step]
  const vmStep = step === 3
  const kernelHit = !vmStep && step >= 1
  const allHit = !vmStep && step >= 2
  const att = g.box(ATT)
  const cracks: Pt[][] = []
  // the crack stops at the top of the kernel band (the red band says the rest), so it never runs through its label
  if (kernelHit) cracks.push([[att.x + att.w / 2, att.y + att.h], [att.x + att.w / 2, g.kernel.y + 2]])
  if (allHit) {
    // along the bottom edge of the kernel band, under its label
    cracks.push([[g.kernel.x + 10, g.kernel.y + g.kernel.h - 5], [g.kernel.x + g.kernel.w - 10, g.kernel.y + g.kernel.h - 5]])
    APPS.forEach((_, i) => {
      if (i === ATT) return
      const b = g.box(i)
      // phones: the top row's crack climbs beside the column, not through the box below it
      if (narrow && i < 2) cracks.push([[b.x - 10, g.kernel.y], [b.x - 10, b.y + b.h / 2], [b.x + 6, b.y + b.h / 2]])
      else cracks.push([[b.x + b.w / 2, g.kernel.y], [b.x + b.w / 2, b.y + b.h]])
    })
  }
  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={`Korak ${step + 1}: ${STEPS[step].title}.`} style={{ display: 'block', width: '100%', maxWidth: narrow ? 440 : undefined, margin: '0 auto', height: 'auto', overflow: 'visible' }}>
      <StepBadge n={step + 1} x={g.note[0]} y={g.note[1] - 6} color={color} />
      <text x={g.note[0] + 22} y={g.note[1]} className="k-svg-hand" style={{ fontSize: g.hand, fill: color }}>
        {NOTES[step]}
      </text>
      <VmFrame x={g.frame.x} y={g.frame.y} w={g.frame.w} h={g.frame.h} label="" seed={8300} />
      {!vmStep ? (
        <g>
          <Band {...g.kernel} label={kernelHit ? 'jezgra domaćina – napadnuta' : 'jezgra domaćina (jedna)'} size={16} hatch={kernelHit ? 'var(--red)' : 'var(--hl-blue-ink)'} stroke={kernelHit ? 'var(--red)' : 'var(--ink)'} ink={kernelHit ? 'var(--red)' : 'var(--ink)'} seed={8310} />
          {APPS.map((a, i) => {
            const b = g.box(i)
            const hit = i === ATT || allHit
            return (
              <g key={a}>
                <ContainerBox {...b} name={a} size={g.mono} seed={8320 + i * 3} tint={TINT[i]} stroke={hit ? 'var(--red)' : 'var(--ink)'} />
                <Face cx={b.x + b.w - 2} cy={b.y + 1} r={9} mood={allHit ? 'dead' : i === ATT ? 'panic' : 'calm'} seed={8330 + i} />
                {/* ✗ in the box's lower-left corner, clear of its name */}
                {allHit && <Cross x={b.x + 13} y={b.y + b.h - 12} size={8} seed={8340 + i} />}
              </g>
            )
          })}
          <text x={att.x + att.w / 2} y={att.y - 10} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand - 1, fill: 'var(--red)' }}>
            napadač
          </text>
        </g>
      ) : (
        <g>
          <Band x={g.kernel.x} y={g.kernel.y + 6} w={g.kernel.w} h={g.kernel.h - 6} label="hipervizor" size={16} hatch="var(--ink-3)" seed={8350} />
          {APPS.map((a, i) => {
            const v = g.vm(i)
            const hit = i === ATT
            const kh = narrow ? 34 : 40
            return (
              <g key={a}>
                <VmFrame {...v} label="VM" size={g.mono - 1} seed={8360 + i * 5} stroke={hit ? 'var(--red)' : 'var(--ink)'} />
                <ProgramCard x={v.x + 10} y={v.y + 24} w={v.w - 20} h={36} name={a} size={g.mono} seed={8370 + i} stroke={hit ? 'var(--red)' : 'var(--ink)'} />
                <Band x={v.x + 8} y={v.y + v.h - kh - 8} w={v.w - 16} h={kh} label="jezgra gosta" size={narrow ? 13.5 : 14} hatch={hit ? 'var(--red)' : 'var(--hl-blue-ink)'} stroke={hit ? 'var(--red)' : 'var(--ink)'} ink={hit ? 'var(--red)' : 'var(--ink)'} seed={8380 + i} />
                {hit && <Crack pts={[[v.x + v.w / 2, v.y + 60], [v.x + v.w / 2, v.y + v.h - kh - 6]]} seed={8390} />}
                {hit && <Check x={v.x + v.w / 2} y={g.kernel.y + 6 + (g.kernel.h - 6) / 2} size={11} seed={8395} />}
              </g>
            )
          })}
        </g>
      )}
      {cracks.map((c, i) => (
        <Crack key={`${step}-${i}`} pts={c} seed={8400 + i} delay={i * 0.25} />
      ))}
      {(step === 2 || step === 3) && (
        <g>
          <Davor x={g.davor.x} y={g.davor.y} scale={g.davor.s} mood={step === 2 ? 'open' : 'smile'} buzz={step === 2} />
          <SpeechBubble {...g.bubble} lines={step === 2 ? ['Svi?!'] : ['Samo jedan', 'VM. Uf.']} size={20} seed={step === 2 ? 8410 : 8411} />
        </g>
      )}
    </svg>
  )
}

export function IsolationStepper() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const g = w !== null && w < 700 ? NARROW : WIDE
  return (
    <div className="k-wide" ref={ref}>
      <Stepper title="Jedna greška u jezgri" steps={STEPS} caption="Napad na jezgru je zamišljen; stvarni napadi traže stvarnu ranjivost – ali kad je nađu, ovako se šire.">
        {(step) => <Frame step={step} g={g} />}
      </Stepper>
    </div>
  )
}
