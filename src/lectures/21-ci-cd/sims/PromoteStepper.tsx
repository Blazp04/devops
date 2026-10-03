import { motion, useReducedMotion } from 'motion/react'
import { Stepper, Diagram, DLabel, Rough, Arrow, Check, Cross, PodShape, SvgStamp, Drawer, useWidth } from '../../../kit'
import { ImageCard } from './Draw'
import { STORY } from '../story'

/** Scene 3 „Izgradite jednom, promovirajte više puta”: one digest dev → staging → prod; a rebuild is another artefact. */

const F = STORY.fix
const STEPS = [
  { title: 'Jedna izgradnja', body: `CI provjeri kod testovima, zatim jednom izgradi sliku za commit ${F.sha} i pošalje je u registar s dva taga: hash commita i ${F.tags[1]}. Digest je sažetak (sha256) sadržaja slike.` },
  { title: 'Staging dobiva isti digest', body: 'Staging ne gradi ništa: povlači točno tu sliku po digestu. E2E testovi provjeravaju baš taj artefakt.' },
  { title: 'Produkcija dobiva isti digest', body: 'Nakon ljudskih vrata produkcija pokreće isti digest. Ono što je testirano upravo je ono što radi – i to se može dokazati jednom usporedbom hasheva.' },
  { title: 'Ponovna izgradnja za produkciju', body: `Isti commit izgrađen ponovno daje drugi digest (${F.rebuildNote}; mogla bi doći i novija bazna slika iza istog taga). Taj artefakt nikad nije prošao testove.` },
  { title: 'Tag ili digest', body: 'Tag je pomična oznaka: latest danas pokazuje na jednu sliku, sutra na drugu. Hash commita i semantička verzija trebali bi stajati, ali ponovni push s istim tagom (kao u 4. koraku) i njih pomakne – zato registar s nepromjenjivim tagovima to zabrani; digest se ne može pomaknuti nikad.' },
]

type L = {
  W: number
  H: number
  reg: { x: number; y: number; w: number; h: number }
  cardA: { x: number; y: number; w: number }
  cardB: { x: number; y: number; w: number }
  envs: { x: number; y: number; w: number; h: number; title: string }[]
  pod: (i: number) => [number, number]
  dig: (i: number) => [number, number]
  hex: number
  txt: number
}

const WIDE: L = {
  W: 900,
  H: 400,
  reg: { x: 210, y: 10, w: 480, h: 160 },
  cardA: { x: 240, y: 64, w: 200 },
  cardB: { x: 465, y: 64, w: 200 },
  envs: [
    { x: 20, y: 236, w: 260, h: 150, title: 'CI · izgradnja' },
    { x: 320, y: 236, w: 260, h: 150, title: 'staging · e2e' },
    { x: 620, y: 236, w: 260, h: 150, title: 'produkcija' },
  ],
  pod: (i) => [80 + i * 300, 316],
  dig: (i) => [150 + i * 300, 372],
  hex: 12,
  txt: 16,
}

const NARROW: L = {
  W: 360,
  H: 640,
  reg: { x: 10, y: 10, w: 340, h: 270 },
  cardA: { x: 30, y: 66, w: 300 },
  cardB: { x: 30, y: 180, w: 300 },
  envs: [
    { x: 10, y: 320, w: 340, h: 92, title: 'CI · izgradnja' },
    { x: 10, y: 428, w: 340, h: 92, title: 'staging · e2e' },
    { x: 10, y: 536, w: 340, h: 92, title: 'produkcija' },
  ],
  pod: (i) => [52, 384 + i * 108],
  dig: (i) => [150, 392 + i * 108],
  hex: 12,
  txt: 14,
}

const cut = (d: string, n: number) => d.slice(0, 7 + n)

function Scene({ step, l }: { step: number; l: L }) {
  const reduce = useReducedMotion()
  const wide = l.W > 500
  const A = cut(F.digest, l.hex)
  const B = cut(F.rebuiltDigest, l.hex)
  const laptop = cut(STORY.laptop.digest, l.hex)
  const reached = [step >= 0, step >= 1, step >= 2]
  const prodDigest = step === 3 ? B : A
  const fade = (on: boolean) => ({ initial: reduce ? false : { opacity: 0 }, animate: { opacity: on ? 1 : 0 }, transition: { duration: 0.35 } })
  const envTop = (i: number) => l.envs[i].y
  const envMid = (i: number) => l.envs[i].x + l.envs[i].w / 2
  return (
    <Diagram width={l.W} height={l.H} label={`Promocija slike, korak ${step + 1}: ${STEPS[step].title}. ${STEPS[step].body}`}>
      {/* registry */}
      <Rough shape={{ k: 'rect', ...l.reg }} seed={8101} strokeWidth={1.6} stroke="var(--ink-2)" dash="6 5" />
      {/* in step 5 the „latest se pomaknuo” note takes the title's place */}
      {step < 4 && <DLabel x={l.reg.x + 12} y={l.reg.y + 26} text="registar · registry.klopa.example" anchor="start" size={l.txt} tone="neutral" />}
      {step < 4 && <ImageCard x={l.cardA.x} y={l.cardA.y} w={l.cardA.w} digest={A} tags={`${F.sha}, ${F.tags[1]}`} stamp={step === 2 ? 'ISTI DIGEST' : undefined} seed={8110} />}
      {step === 3 && (
        <motion.g {...fade(true)}>
          <ImageCard x={l.cardB.x} y={l.cardB.y} w={l.cardB.w} digest={B} tags={`${F.tags[1]} (ponovno)`} stamp="DRUGI ARTEFAKT" stampTone="red" tone="var(--red)" seed={8120} />
        </motion.g>
      )}
      {/* tags vs digest (step 5) */}
      {step === 4 && (
        <motion.g {...fade(true)}>
          {(wide
            ? [
                { tag: 'latest', x: 250, y: 64, to: [560, 120] as [number, number], from: [560, 70] as [number, number], moving: true },
                { tag: F.sha, x: 250, y: 104, to: [460, 120] as [number, number] },
                { tag: F.tags[1], x: 250, y: 144, to: [460, 136] as [number, number] },
              ]
            : [
                { tag: 'latest', x: 30, y: 64, to: [250, 190] as [number, number], from: [250, 126] as [number, number], moving: true },
                { tag: F.sha, x: 30, y: 196, to: [150, 222] as [number, number] },
                { tag: F.tags[1], x: 30, y: 246, to: [150, 238] as [number, number] },
              ]
          ).map((t, i) => (
            <g key={t.tag}>
              <Rough shape={{ k: 'rect', x: t.x, y: t.y - 18, w: 96, h: 26 }} seed={8150 + i} stroke={t.moving ? 'var(--orange)' : 'var(--pen)'} strokeWidth={1.6} fillColor="var(--note-yellow)" fillStyle="solid" />
              <text x={t.x + 48} y={t.y} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 14.5, fontWeight: 600, fill: 'var(--note-ink)' }}>
                {t.tag}
              </text>
            </g>
          ))}
          {wide ? (
            <>
              <text x={470} y={86} className="k-svg-mono" style={{ fontSize: 14.5, fill: 'var(--ink-3)' }}>
                {laptop}
              </text>
              <text x={470} y={130} className="k-svg-mono" style={{ fontSize: 14.5, fontWeight: 600 }}>
                {A}
              </text>
              <Arrow pts={[[346, 58], [400, 58], [466, 80]]} stroke="var(--ink-3)" seed={8160} dash="4 4" head={7} />
              <Arrow pts={[[346, 60], [420, 96], [466, 124]]} stroke="var(--orange)" seed={8162} head={7} />
              <Arrow pts={[[346, 98], [466, 124]]} stroke="var(--pen)" seed={8164} head={7} />
              <Arrow pts={[[346, 140], [466, 130]]} stroke="var(--pen)" seed={8166} head={7} />
              <DLabel x={600} y={154} text="digest se ne miče" anchor="start" size={l.txt - 1} tone="blue" />
              <DLabel x={470} y={52} text="petak: laptop" anchor="start" size={l.txt - 1} tone="neutral" />
            </>
          ) : (
            <>
              <text x={150} y={110} className="k-svg-mono" style={{ fontSize: 14.5, fill: 'var(--ink-3)' }}>
                {laptop}
              </text>
              <text x={150} y={232} className="k-svg-mono" style={{ fontSize: 14.5, fontWeight: 600 }}>
                {A}
              </text>
              <Arrow pts={[[126, 58], [150, 92]]} stroke="var(--ink-3)" seed={8160} dash="4 4" head={7} />
              <Arrow pts={[[126, 66], [190, 150], [200, 214]]} stroke="var(--orange)" seed={8162} head={7} />
              <Arrow pts={[[126, 190], [146, 222]]} stroke="var(--pen)" seed={8164} head={7} />
              <Arrow pts={[[126, 240], [146, 232]]} stroke="var(--pen)" seed={8166} head={7} />
              <DLabel x={150} y={84} text="petak: laptop" anchor="start" size={l.txt - 1} tone="neutral" />
              <DLabel x={150} y={262} text="digest se ne miče" anchor="start" size={l.txt - 1} tone="blue" />
            </>
          )}
          <DLabel x={wide ? 250 : 30} y={36} text="latest se pomaknuo" anchor="start" size={l.txt - 1} tone="amber" />
        </motion.g>
      )}
      {/* environments */}
      {l.envs.map((e, i) => {
        const on = step === 4 || reached[i]
        const isProd = i === 2
        const bad = isProd && step === 3
        const dg = isProd ? prodDigest : A
        return (
          <g key={e.title}>
            <Rough shape={{ k: 'rect', x: e.x, y: e.y, w: e.w, h: e.h }} seed={8200 + i} strokeWidth={on ? 1.8 : 1.2} stroke={bad ? 'var(--red)' : on ? 'var(--ink)' : 'var(--ink-3)'} dash={on ? undefined : '5 5'} />
            <DLabel x={e.x + 12} y={e.y + 26} text={e.title} anchor="start" size={l.txt} bold tone={bad ? 'bad' : 'neutral'} />
            {i === 0 && <Drawer x={e.x + e.w - 46} y={e.y + 10} w={32} h={28} seed={8230} />}
            {on && (
              <>
                <PodShape x={l.pod(i)[0]} y={l.pod(i)[1]} size={wide ? 50 : 46} status="running" label={F.tags[1]} tone={bad ? 'rose' : 'green'} />
                <text x={l.dig(i)[0]} y={l.dig(i)[1]} textAnchor={wide ? 'middle' : 'start'} className="k-svg-mono" style={{ fontSize: 14.5, fontWeight: 600, fill: bad ? 'var(--red)' : 'var(--ink)' }}>
                  {dg}
                </text>
                {step < 4 && (bad ? <Cross x={e.x + e.w - 22} y={e.y + e.h - 26} size={9} seed={8240 + i} /> : <Check x={e.x + e.w - 22} y={e.y + e.h - 26} size={9} seed={8250 + i} />)}
              </>
            )}
            {bad && <SvgStamp x={e.x + e.w / 2 + (wide ? 30 : 60)} y={e.y + (wide ? 58 : 28)} text="NETESTIRANO" tone="red" size={14.5} rotate={-6} />}
          </g>
        )
      })}
      {/* arrows: build → registry, registry → environments */}
      {step < 4 && <Arrow pts={[[envMid(0) - 20, envTop(0) - 4], [wide ? l.cardA.x - 6 : 40, wide ? l.cardA.y + 70 : 300]]} stroke="var(--ink-2)" seed={8300} head={8} />}
      {step < 4 && wide && <DLabel x={150} y={204} text="izgradnja + push (1×)" anchor="middle" size={l.txt - 1} tone="neutral" />}
      {step >= 1 && step < 4 && <Arrow pts={wide ? [[400, 156], [envMid(1), envTop(1) - 4]] : [[330, 150], [345, 300], [330, 432]]} stroke="var(--pen)" seed={8310} dash="5 5" head={8} />}
      {step >= 2 && step < 4 && (
        <Arrow
          pts={wide ? (step === 3 ? [[600, 156], [envMid(2), envTop(2) - 4]] : [[430, 156], [envMid(2) - 40, envTop(2) - 4]]) : step === 3 ? [[340, 266], [352, 400], [338, 540]] : [[336, 150], [354, 330], [342, 540]]}
          stroke={step === 3 ? 'var(--red)' : 'var(--pen)'}
          seed={8320 + step}
          dash="5 5"
          head={8}
        />
      )}
      {step >= 1 && step < 3 && wide && <DLabel x={step === 1 ? 470 : 610} y={204} text="isti digest" anchor="middle" size={l.txt - 1} tone="blue" />}
    </Diagram>
  )
}

function SceneBox({ step }: { step: number }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const l = w !== null && w >= 750 ? WIDE : NARROW
  return (
    <div ref={ref}>
      {/* tall narrow drawing: capped so the drawing and the „Dalje” button fit one tablet screen */}
      <div style={l === NARROW ? { maxWidth: 400, margin: '0 auto' } : undefined}>
        <Scene step={step} l={l} />
      </div>
    </div>
  )
}

export function PromoteStepper() {
  return (
    <Stepper steps={STEPS} title="Izgradite jednom, promovirajte više puta" wide autoPlay={0} caption={`Digestovi su SHA-256 sažetci koje je izračunala simulacija (preset tvornica, seed 42): ${F.digest} je ispravak 2.0.1. Digest ponovne izgradnje ovisi o trenutku izgradnje, pa ćete u simulaciji vidjeti neki treći.`}>
      {(step) => <SceneBox step={step} />}
    </Stepper>
  )
}
