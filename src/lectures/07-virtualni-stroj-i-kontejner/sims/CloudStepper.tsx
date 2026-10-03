/**
 * „Kontejneri u VM-ovima”: (1) in the cloud a Kubernetes node is usually a VM, containers run inside it;
 * (2) Docker Desktop on a Mac runs Linux containers in a hidden Linux VM; (3) an image is built for one CPU
 * architecture: amd64 on Apple silicon runs under emulation, on an arm64 node without emulation it fails.
 */
import { Arrow, Cloud, Cross, Lana, SpeechBubble, StepBadge, Stepper, TrayStack, stepColor, useWidth, type Pt } from '../../../kit'
import { Band, ContainerBox, ProgramCard, VmFrame } from './parts'

type B = { x: number; y: number; w: number; h: number }

interface Geo {
  W: number
  H: number
  note: Pt
  noteText: string[]
  // step 1
  cloud: B
  host: B
  hyper: B
  vms: [B, B]
  // step 2
  mac: B
  macBand: B
  progs: [B, B]
  linuxVm: B
  linuxKernel: B
  macBoxes: (j: number) => B
  dockerArrow: Pt[]
  lana: { x: number; y: number; s: number }
  bubble: { x: number; y: number; w: number; h: number; tx: number; ty: number }
  // step 3
  panels: [B, B]
  mono: number
  hand: number
}

const WIDE: Geo = {
  W: 720,
  H: 344,
  note: [26, 30],
  noteText: ['u oblaku su čvorovi obično VM-ovi', 'Docker na Macu radi u skrivenom Linux VM-u', 'slika mora odgovarati procesoru'],
  cloud: { x: 560, y: 4, w: 140, h: 56 },
  host: { x: 12, y: 70, w: 696, h: 268 },
  hyper: { x: 24, y: 284, w: 672, h: 42 },
  vms: [
    { x: 30, y: 104, w: 322, h: 170 },
    { x: 368, y: 104, w: 322, h: 170 },
  ],
  mac: { x: 12, y: 56, w: 560, h: 280 },
  macBand: { x: 24, y: 270, w: 536, h: 54 },
  progs: [
    { x: 34, y: 112, w: 132, h: 44 },
    { x: 34, y: 178, w: 132, h: 44 },
  ],
  linuxVm: { x: 196, y: 82, w: 362, h: 176 },
  linuxKernel: { x: 208, y: 206, w: 338, h: 40 },
  macBoxes: (j) => ({ x: 218 + j * 110, y: 122, w: 96, h: 60 }),
  dockerArrow: [
    [168, 134],
    [214, 150],
  ],
  lana: { x: 600, y: 180, s: 1 },
  bubble: { x: 584, y: 70, w: 128, h: 66, tx: 636, ty: 196 },
  panels: [
    { x: 12, y: 56, w: 340, h: 282 },
    { x: 368, y: 56, w: 340, h: 282 },
  ],
  mono: 14,
  hand: 21,
}

const NARROW: Geo = {
  W: 360,
  H: 600,
  note: [18, 30],
  noteText: ['u oblaku: čvorovi su VM-ovi', 'na Macu: skriveni Linux VM', 'slika mora odgovarati procesoru'],
  cloud: { x: 262, y: 40, w: 92, h: 40 },
  host: { x: 6, y: 92, w: 348, h: 500 },
  hyper: { x: 16, y: 542, w: 328, h: 40 },
  vms: [
    { x: 16, y: 124, w: 328, h: 196 },
    { x: 16, y: 334, w: 328, h: 196 },
  ],
  mac: { x: 6, y: 52, w: 348, h: 418 },
  macBand: { x: 16, y: 396, w: 328, h: 62 },
  progs: [
    { x: 18, y: 88, w: 150, h: 42 },
    { x: 192, y: 88, w: 150, h: 42 },
  ],
  linuxVm: { x: 16, y: 152, w: 328, h: 232 },
  linuxKernel: { x: 26, y: 328, w: 308, h: 42 },
  macBoxes: (j) => ({ x: 28 + j * 104, y: 210, w: 92, h: 58 }),
  dockerArrow: [
    [92, 132],
    [92, 168],
  ],
  lana: { x: 22, y: 476, s: 0.9 },
  bubble: { x: 118, y: 492, w: 168, h: 64, tx: 92, ty: 510 },
  panels: [
    { x: 6, y: 52, w: 348, h: 260 },
    { x: 6, y: 330, w: 348, h: 260 },
  ],
  mono: 15,
  hand: 21,
}

const STEPS = [
  {
    title: 'U oblaku je čvor obično virtualni stroj',
    body: 'Kad u oblaku zakupite „poslužitelj”, dobijete VM na nečijem fizičkom računalu. Kubernetes u oblaku pokreće kontejnere unutar takvih VM-ova (čvorova). Dobivamo oboje: VM je čvrsta granica prema drugim korisnicima, a kontejneri unutra su gusti i brzi.',
  },
  {
    title: 'Docker na Macu: skriveni Linux VM',
    body: 'Linux kontejner je Linux proces – treba mu jezgra Linuxa. macOS ima drugu jezgru (XNU, dio sustava Darwin), pa Docker Desktop tiho pokreće mali Linux VM i kontejnere vrti u njemu. Naredba docker na Macu samo šalje upute u taj VM.',
  },
  {
    title: 'Slika za pogrešan procesor',
    body: 'Program preveden za procesore amd64 (Intel, AMD) ne radi izravno na arm64 (Apple silicon, mnogi poslužitelji u oblaku) – i obrnuto. Docker Desktop na Macu sliku amd64 pokrene uz emulaciju: sporije, ponekad uz greške. Čvor arm64 bez emulacije ne može je pokrenuti.',
  },
]

const NAMES = [
  ['api', 'web', 'worker'],
  ['postgres', 'redis', 'rabbitmq'],
]
const TINTS = ['var(--hl-blue-ink)', 'var(--hl-orange-ink)', 'var(--hl-green-ink)', 'var(--hl-lilac-ink)', 'var(--hl-pink-ink)', 'var(--hl-yellow-ink)']

function ArchPanel({ b, i, g }: { b: B; i: number; g: Geo }) {
  const mac = i === 0
  const narrow = g === NARROW
  const img = { x: b.x + 22, y: b.y + (narrow ? 70 : 84), w: narrow ? 112 : 120, h: 90 }
  const ct = { x: b.x + b.w - (narrow ? 130 : 136), y: img.y + 16, w: narrow ? 108 : 112, h: 60 }
  return (
    <g>
      <VmFrame x={b.x} y={b.y} w={b.w} h={b.h} label="" seed={8600 + i * 5} stroke={mac ? 'var(--ink)' : 'var(--red)'} />
      <text x={b.x + 14} y={b.y + 30} className="k-svg-hand" style={{ fontSize: g.hand }}>
        {mac ? 'Lanin Mac' : 'čvor u oblaku'}
      </text>
      <text x={b.x + b.w - 14} y={b.y + 29} textAnchor="end" className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--ink-2)', fontWeight: 600 }}>
        procesor: arm64
      </text>
      <TrayStack x={img.x} y={img.y} w={img.w} h={img.h} n={3} labels={['', '', 'klopa-api']} labelSize={g.mono - 1} seed={8610 + i} />
      <text x={img.x + img.w / 2} y={img.y + img.h + 24} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand - 1, fill: 'var(--ink-2)' }}>
        slika samo za amd64
      </text>
      <Arrow pts={[[img.x + img.w + 6, img.y + 46], [ct.x - 8, ct.y + 30]]} stroke={mac ? 'var(--orange)' : 'var(--red)'} seed={8620 + i} dash={mac ? '5 4' : undefined} />
      <ContainerBox {...ct} name="klopa-api" size={g.mono - 0.5} seed={8630 + i} tint={mac ? 'var(--hl-orange-ink)' : 'var(--ink-4)'} stroke={mac ? 'var(--ink)' : 'var(--red)'} dashed={!mac} />
      {mac ? (
        <g>
          <text x={ct.x + ct.w / 2} y={ct.y + ct.h + 26} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--orange)', fontWeight: 700 }}>
            ! emulacija
          </text>
          <text x={b.x + b.w / 2} y={b.y + b.h - 22} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand - 1, fill: 'var(--ink-2)' }}>
            radi, ali sporije – i ponekad pukne
          </text>
        </g>
      ) : (
        <g>
          {/* ✗ on the way from the image to the process: the CPU cannot run it (never over the box's name) */}
          <Cross x={(img.x + img.w + ct.x) / 2 - 1} y={(img.y + 46 + ct.y + 30) / 2 - 14} size={10} seed={8640} />
          <text x={ct.x + ct.w / 2} y={ct.y + ct.h + 26} textAnchor="middle" className="k-svg-mono" style={{ fontSize: g.mono, fill: 'var(--red)', fontWeight: 700 }}>
            exec format error
          </text>
          <text x={b.x + b.w / 2} y={b.y + b.h - 22} textAnchor="middle" className="k-svg-hand" style={{ fontSize: g.hand - 1, fill: 'var(--red)' }}>
            nema emulacije – kontejner ne kreće
          </text>
        </g>
      )}
    </g>
  )
}

function Frame({ step, g }: { step: number; g: Geo }) {
  const narrow = g === NARROW
  const color = stepColor(step)
  return (
    <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={`Korak ${step + 1}: ${STEPS[step].title}.`} style={{ display: 'block', width: '100%', maxWidth: narrow ? 440 : undefined, margin: '0 auto', height: 'auto', overflow: 'visible' }}>
      <StepBadge n={step + 1} x={g.note[0]} y={g.note[1] - 6} color={color} />
      <text x={g.note[0] + 22} y={g.note[1]} className="k-svg-hand" style={{ fontSize: g.hand, fill: color }}>
        {g.noteText[step]}
      </text>
      {step === 0 && (
        <g>
          <Cloud {...g.cloud} seed={8701} />
          <text x={g.cloud.x + g.cloud.w / 2} y={g.cloud.y + g.cloud.h * 0.68} textAnchor="middle" className="k-svg-hand" style={{ fontSize: narrow ? 18 : 19, fill: 'var(--ink-2)' }}>
            oblak
          </text>
          <VmFrame x={g.host.x} y={g.host.y} w={g.host.w} h={g.host.h} label="" seed={8702} />
          <text x={g.host.x + 12} y={g.host.y + 24} className="k-svg-hand" style={{ fontSize: g.hand - 1, fill: 'var(--ink-2)' }}>
            {narrow ? 'fizičko računalo pružatelja' : 'fizičko računalo u podatkovnom centru pružatelja'}
          </text>
          <Band {...g.hyper} label="hipervizor" size={16} hatch="var(--ink-3)" seed={8703} />
          {g.vms.map((v, n) => (
            <g key={n}>
              <VmFrame {...v} label="" seed={8710 + n * 3} />
              <text x={v.x + 10} y={v.y + 24} className="k-svg-hand" style={{ fontSize: g.hand - 1 }}>
                VM čvor {n + 1}
              </text>
              {NAMES[n].map((name, j) => {
                const bw = narrow ? 92 : 90
                const gap = (v.w - 3 * bw) / 4
                return <ContainerBox key={name} x={v.x + gap + j * (bw + gap)} y={v.y + 40} w={bw} h={58} name={name} size={g.mono - 0.5} seed={8720 + n * 10 + j} tint={TINTS[n * 3 + j]} />
              })}
              <Band x={v.x + 10} y={v.y + v.h - 50} w={v.w - 20} h={40} label="jezgra VM-a (Linux)" size={15} hatch="var(--hl-blue-ink)" seed={8730 + n} />
            </g>
          ))}
        </g>
      )}
      {step === 1 && (
        <g>
          <VmFrame x={g.mac.x} y={g.mac.y} w={g.mac.w} h={g.mac.h} label="" seed={8740} />
          <text x={g.mac.x + 12} y={g.mac.y + 24} className="k-svg-hand" style={{ fontSize: g.hand - 1, fill: 'var(--ink-2)' }}>
            Lanin Mac
          </text>
          <ProgramCard {...g.progs[0]} name="docker" size={g.mono} seed={8741} />
          <ProgramCard {...g.progs[1]} name="preglednik" size={g.mono} seed={8742} />
          <VmFrame x={g.linuxVm.x} y={g.linuxVm.y} w={g.linuxVm.w} h={g.linuxVm.h} label="" seed={8743} stroke="var(--pen)" dashed />
          <text x={g.linuxVm.x + 12} y={g.linuxVm.y + 26} className="k-svg-hand" style={{ fontSize: g.hand, fill: 'var(--pen)' }}>
            skriveni Linux VM
          </text>
          {['api', 'web', 'postgres'].map((n, j) => (
            <ContainerBox key={n} {...g.macBoxes(j)} name={n} size={g.mono - 0.5} seed={8750 + j} tint={TINTS[j === 2 ? 3 : j]} />
          ))}
          <Band {...g.linuxKernel} label="jezgra Linuxa" size={15} hatch="var(--hl-blue-ink)" seed={8760} />
          <Band {...g.macBand} label="macOS – jezgra XNU (Darwin)" sub={narrow ? '+ Virtualization framework' : '+ hipervizor (Apple Virtualization framework)'} size={16} subSize={g.mono - 1} hatch="var(--ink-3)" seed={8761} />
          <Arrow pts={g.dockerArrow} stroke="var(--pen)" seed={8762} dash="4 4" />
          <Lana x={g.lana.x} y={g.lana.y} scale={g.lana.s} mood="open" holding="laptop" />
          <SpeechBubble {...g.bubble} lines={['Ima VM?!']} size={20} seed={8770} />
        </g>
      )}
      {step === 2 && (
        <g>
          <ArchPanel b={g.panels[0]} i={0} g={g} />
          <ArchPanel b={g.panels[1]} i={1} g={g} />
        </g>
      )}
    </svg>
  )
}

export function CloudStepper() {
  const [ref, w] = useWidth<HTMLDivElement>()
  const g = w !== null && w < 700 ? NARROW : WIDE
  return (
    <div className="k-wide" ref={ref}>
      <Stepper title="Kontejneri žive u VM-ovima češće nego što mislite" steps={STEPS}>
        {(step) => <Frame step={step} g={g} />}
      </Stepper>
    </div>
  )
}
