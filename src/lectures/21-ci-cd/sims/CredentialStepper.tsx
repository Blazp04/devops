import { motion, useReducedMotion } from 'motion/react'
import { Stepper, Diagram, DLabel, Rough, Arrow, Check, Cross, Drawer, Helm, PodShape, Cloud, Person, Davor, LoopArrows, SpeechBubble, useWidth } from '../../../kit'
import type { Pt } from '../../../kit'
import { KeyDoodle, TokenTicket } from './Draw'

/** Scene 6 „Tajne i tko gura u klaster”: a long-lived key vs a per-job OIDC token, and the push model's blind spot. */

const STEPS = [
  {
    title: 'Trajni ključ u CI-ju',
    body: 'Davor je kubeconfig s pravima administratora klastera spremio kao tajnu i stavio ga u env: na vrhu workflowa, pa ga kao varijablu okruženja dobiva svaki posao – i lint i testovi, ne samo onaj koji postavlja. Ključ ne istječe.',
  },
  {
    title: 'Ključ procuri',
    body: 'Jedan paket u testovima je zlonamjeran i pročita varijable okruženja. Napadač s ključem ulazi u klaster u 02:00, za tjedan dana, za mjesec dana – sve dok ključ netko ne opozove i zamijeni.',
  },
  {
    title: 'OIDC token za jedan posao',
    body: 'Bez spremljenog ključa: posao za postavljanje zatraži od GitHuba potpisanu izjavu o identitetu (ID token: „ja sam klopa/klopa-api, grana main, okruženje production”). Oblak je provjeri prema pravilima povjerenja i izda kratkotrajni token.',
  },
  {
    title: 'Token procuri',
    body: 'Ukradeni token radi s bilo kojeg računala, ali samo do isteka (AWS STS: zadano 1 h, najmanje 15 min) i samo za ono što smije uloga (ovdje: postavljanje u Namespace klopa). Nitko ga ne mora rotirati. Lint i testovi token uopće nemaju – u njima nema što ukrasti.',
  },
  {
    title: 'Push model: tko još dira klaster?',
    body: 'Trajnog ključa više nema u postavkama, ali posao za postavljanje i dalje dobiva prava administratora klastera i sam gura u klaster naredbom kubectl apply: tko preuzme taj posao, ima sve. Kad netko u 02:00 ručno promijeni klaster, nitko to ne primijeti: razlika (drift) ostaje skrivena.',
  },
]

type Box = { x: number; y: number; w: number; h: number }
type L = {
  W: number
  H: number
  ci: Box
  jobs: number[]
  jobX: number
  noToken: number
  strip: number
  key: Pt
  keyText: Pt
  ticket: Box
  cloud: Box
  idArrow: Pt[]
  idLabel: Pt
  back: Pt[] | null
  cluster: Box
  clusterLabel: number
  pods: Pt[]
  times: Pt
  apply: Pt[]
  applyLabel: { at: Pt; anchor: 'start' | 'middle' | 'end' }
  thief: { x: number; y: number; s: number }
  thiefLabel: Pt
  thiefArrow: Pt[]
  loot: Pt
  davor: { x: number; y: number; s: number }
  bubble: Box & { tx: number; ty: number }
  edit: Pt[]
  loop: Pt
  loopLabel: Pt
  drift: { at: Pt; anchor: 'start' | 'middle' | 'end' }
  txt: number
  /** which Pod someone edited by hand in step 5 */
  manual: number
}

const JOBS = ['lint', 'testovi', 'izgradnja + push', 'postavljanje']

const WIDE: L = {
  W: 900,
  H: 400,
  ci: { x: 20, y: 20, w: 360, h: 320 },
  jobs: [80, 128, 176, 224],
  jobX: 40,
  noToken: 210,
  strip: 252,
  key: [62, 306],
  keyText: [140, 304],
  ticket: { x: 250, y: 208, w: 80, h: 32 },
  cloud: { x: 650, y: 6, w: 220, h: 116 },
  idArrow: [
    [384, 210],
    [520, 112],
    [646, 70],
  ],
  idLabel: [600, 46],
  back: [
    [700, 124],
    [560, 196],
    [366, 228],
  ],
  cluster: { x: 640, y: 150, w: 240, h: 216 },
  clusterLabel: 15,
  pods: [
    [690, 322],
    [760, 322],
    [830, 322],
  ],
  times: [660, 222],
  apply: [
    [382, 236],
    [510, 242],
    [636, 254],
  ],
  applyLabel: { at: [510, 228], anchor: 'middle' },
  thief: { x: 430, y: 284, s: 0.8 },
  thiefLabel: [462, 278],
  thiefArrow: [
    [540, 326],
    [590, 334],
    [636, 326],
  ],
  loot: [500, 340],
  davor: { x: 576, y: 282, s: 0.65 },
  bubble: { x: 426, y: 262, w: 112, h: 56, tx: 600, ty: 300 },
  edit: [
    [626, 340],
    [645, 338],
    [662, 326],
  ],
  loop: [740, 64],
  loopLabel: [740, 132],
  drift: { at: [500, 392], anchor: 'middle' },
  txt: 16,
  manual: 0,
}

const NARROW: L = {
  W: 360,
  H: 650,
  ci: { x: 10, y: 10, w: 340, h: 280 },
  jobs: [64, 108, 152, 196],
  jobX: 22,
  noToken: 180,
  strip: 222,
  key: [40, 262],
  keyText: [118, 258],
  ticket: { x: 196, y: 180, w: 76, h: 30 },
  cloud: { x: 190, y: 300, w: 164, h: 100 },
  idArrow: [
    [340, 210],
    [350, 250],
    [330, 300],
  ],
  idLabel: [334, 252],
  back: null,
  cluster: { x: 10, y: 470, w: 340, h: 172 },
  clusterLabel: 13,
  pods: [
    [70, 610],
    [150, 610],
    [230, 610],
  ],
  times: [196, 520],
  apply: [
    [120, 292],
    [127, 380],
    [120, 466],
  ],
  applyLabel: { at: [130, 432], anchor: 'start' },
  thief: { x: 14, y: 372, s: 0.66 },
  thiefLabel: [40, 366],
  thiefArrow: [
    [44, 452],
    [48, 460],
    [44, 468],
  ],
  loot: [60, 420],
  davor: { x: 290, y: 368, s: 0.58 },
  bubble: { x: 165, y: 296, w: 190, h: 70, tx: 312, ty: 384 },
  edit: [
    [306, 440],
    [300, 520],
    [252, 582],
  ],
  loop: [56, 330],
  loopLabel: [56, 380],
  drift: { at: [24, 530], anchor: 'start' },
  txt: 14,
  manual: 2,
}

function Scene({ step, l }: { step: number; l: L }) {
  const reduce = useReducedMotion()
  const wide = l.W > 500
  const keyStep = step <= 1
  const tokenStep = step === 2 || step === 3
  const fade = { initial: reduce ? false : { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.4, delay: 0.2 } }
  const times =
    step === 1
      ? [
          { t: '02:00 ulazi', ok: true },
          { t: '+1 tjedan ulazi', ok: true },
          { t: '+1 mjesec ulazi', ok: true },
        ]
      : [
          { t: '10:05 ulazi', ok: true },
          { t: '10:40 ulazi', ok: true },
          { t: '11:06 istekao', ok: false },
        ]
  const small = l.txt - 1.5
  return (
    <Diagram width={l.W} height={l.H} label={`Vjerodajnice u CI-ju, korak ${step + 1}: ${STEPS[step].title}. ${STEPS[step].body}`}>
      {/* CI with its jobs and, at the bottom, its stored settings */}
      <Rough shape={{ k: 'rect', ...l.ci }} seed={8501} strokeWidth={1.7} stroke="var(--ink)" fillColor="var(--paper)" fillStyle="solid" />
      <DLabel x={l.ci.x + 14} y={l.ci.y + 26} text="CI · GitHub Actions" anchor="start" size={l.txt} bold tone="neutral" />
      {l.jobs.map((y, i) => {
        const compromised = (step === 1 && i === 1) || (step === 3 && i === 3)
        return (
          <g key={JOBS[i]}>
            <Drawer x={l.jobX} y={y - 18} w={36} h={30} seed={8510 + i} />
            <DLabel x={l.jobX + 46} y={y + 4} text={JOBS[i]} anchor="start" size={l.txt} tone={compromised ? 'bad' : 'neutral'} bold={i === 3} />
            {compromised && <Cross x={l.jobX + 18} y={y - 3} size={8} seed={8520 + i} />}
            {step === 0 && <Rough shape={{ k: 'line', x1: l.key[0], y1: l.key[1] - 12, x2: l.jobX + 36, y2: y - 2 }} seed={8530 + i} stroke="var(--orange)" strokeWidth={1.2} dash="3 4" />}
            {tokenStep && i < 2 && <DLabel x={l.noToken} y={y + 4} text={step === 3 && i === 1 ? 'nema što ukrasti' : 'bez tokena'} anchor="start" size={small} tone={step === 3 && i === 1 ? 'ok' : 'neutral'} />}
          </g>
        )
      })}
      <Rough shape={{ k: 'line', x1: l.ci.x + 8, y1: l.strip, x2: l.ci.x + l.ci.w - 8, y2: l.strip }} seed={8535} stroke="var(--ink-3)" strokeWidth={1.1} dash="5 5" />
      <DLabel x={l.ci.x + 14} y={l.strip + (wide ? 22 : 18)} text="postavke CI-ja" anchor="start" size={small} tone="neutral" />
      {keyStep ? (
        <g>
          <KeyDoodle x={l.key[0]} y={l.key[1]} s={wide ? 1 : 0.9} seed={8540} />
          <text x={l.keyText[0]} y={l.keyText[1]} className="k-svg-mono" style={{ fontSize: 14.5, fontWeight: 600 }}>
            PROD_KUBECONFIG
          </text>
          <DLabel x={l.keyText[0]} y={l.keyText[1] + 24} text="cluster-admin, ne istječe" anchor="start" size={small} tone="amber" />
        </g>
      ) : (
        <g>
          <DLabel x={l.ci.x + 14} y={l.strip + 48} text="nema spremljenog ključa" anchor="start" size={small} tone="ok" />
          {tokenStep && <DLabel x={l.ci.x + 14} y={l.strip + 72} text="token: 1 h, najmanje 15 min" anchor="start" size={small} tone="blue" />}
        </g>
      )}
      {/* OIDC: the cloud's trust policy and the per-job token */}
      {tokenStep && (
        <motion.g {...fade}>
          <Cloud x={l.cloud.x} y={l.cloud.y} w={l.cloud.w} h={l.cloud.h} seed={8550} />
          <DLabel x={l.cloud.x + l.cloud.w / 2} y={l.cloud.y + l.cloud.h * 0.44} text="pravila povjerenja" anchor="middle" size={l.txt - 1} tone="blue" bold />
          {['repo · grana', 'okruženje'].map((t, i) => (
            <text key={t} x={l.cloud.x + l.cloud.w / 2} y={l.cloud.y + l.cloud.h * 0.64 + i * 17} textAnchor="middle" className="k-svg-mono" style={{ fontSize: 14.5 }}>
              {t}
            </text>
          ))}
          <TokenTicket x={l.ticket.x} y={l.ticket.y} w={l.ticket.w} h={l.ticket.h} seed={8560} label="token" />
          <Arrow pts={l.idArrow} stroke="var(--pen)" seed={8570} head={8} />
          <DLabel x={l.idLabel[0]} y={l.idLabel[1]} text="ID token" anchor="end" size={l.txt - 1} tone="blue" />
          {l.back && <Arrow pts={l.back} stroke="var(--pen)" seed={8572} head={8} dash="5 4" />}
        </motion.g>
      )}
      {/* the cluster */}
      <Rough shape={{ k: 'rect', ...l.cluster }} seed={8580} strokeWidth={1.8} stroke="var(--pen)" multi fillColor="var(--paper)" fillStyle="solid" />
      <Helm x={l.cluster.x + 26} y={l.cluster.y + 26} r={13} />
      <DLabel x={l.cluster.x + 48} y={l.cluster.y + 32} text="produkcijski klaster" anchor="start" size={l.clusterLabel} bold tone="neutral" />
      {l.pods.map(([x, y], i) => (
        <PodShape key={i} x={x} y={y} size={wide ? 50 : 46} status="running" label={step === 4 && i === l.manual ? 'ručno' : '2.0.1'} tone={step === 4 && i === l.manual ? 'amber' : 'green'} />
      ))}
      {/* CI pushes into the cluster */}
      <Arrow pts={l.apply} stroke={step === 4 ? 'var(--orange)' : 'var(--ink-2)'} seed={8590} head={9} strokeWidth={step === 4 ? 2.2 : 1.6} />
      <text x={l.applyLabel.at[0]} y={l.applyLabel.at[1]} textAnchor={l.applyLabel.anchor} className="k-svg-mono" style={{ fontSize: 14.5, fontWeight: 600 }}>
        kubectl apply
      </text>
      {/* the attacker */}
      {(step === 1 || step === 3) && (
        <motion.g {...fade}>
          <Person x={l.thief.x} y={l.thief.y} scale={l.thief.s} hair="beanie" build="hoodie" shirt="var(--ink-3)" mood="grin" seed={8601} />
          <DLabel x={l.thiefLabel[0]} y={l.thiefLabel[1]} text="napadač" anchor="middle" size={small} tone="bad" bold />
          {step === 1 ? <KeyDoodle x={l.loot[0]} y={l.loot[1]} s={0.55} seed={8545} /> : <TokenTicket x={l.loot[0] - 8} y={l.loot[1] - 14} w={44} h={24} seed={8565} label="" />}
          <Arrow pts={l.thiefArrow} stroke="var(--red)" seed={8610} head={8} dash="6 4" />
          {times.map((t, i) => (
            <g key={t.t}>
              {t.ok ? <Cross x={l.times[0] + 8} y={l.times[1] + i * 24 - 6} size={6} seed={8620 + i} stroke="var(--red)" /> : <Check x={l.times[0] + 8} y={l.times[1] + i * 24 - 6} size={6} seed={8630 + i} stroke="var(--green)" />}
              <DLabel x={l.times[0] + 22} y={l.times[1] + i * 24} text={t.t} anchor="start" size={small} tone={t.ok ? 'bad' : 'ok'} />
            </g>
          ))}
        </motion.g>
      )}
      {/* push model: a manual change at 02:00 nobody notices */}
      {step === 4 && (
        <motion.g {...fade}>
          <Davor x={l.davor.x} y={l.davor.y} scale={l.davor.s} mood="flat" holding="laptop" />
          <SpeechBubble x={l.bubble.x} y={l.bubble.y} w={l.bubble.w} h={l.bubble.h} tx={l.bubble.tx} ty={l.bubble.ty} lines={['kubectl edit,', 'samo malo…']} size={wide ? 22 : 21} seed={8640} />
          <Arrow pts={l.edit} stroke="var(--orange)" seed={8645} head={8} dash="4 4" />
          <LoopArrows cx={l.loop[0]} cy={l.loop[1]} r={wide ? 34 : 24} stroke="var(--ink-3)" seed={8650} />
          <DLabel x={l.loopLabel[0]} y={l.loopLabel[1]} text="→ predavanje 22" anchor="middle" size={small} tone="blue" />
          <DLabel x={l.drift.at[0]} y={l.drift.at[1]} text="nitko ne vidi razliku" anchor={l.drift.anchor} size={l.txt - 1} tone="amber" />
        </motion.g>
      )}
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

export function CredentialStepper() {
  return (
    <Stepper steps={STEPS} title="Tajne i tko gura u klaster" wide autoPlay={0} caption="Trajni ključ vrijedi dok ga netko ne opozove; OIDC token izdan je za jedan posao i vrijedi samo do isteka. Ni jedno ni drugo ne vidi što se u klasteru mijenja mimo pipelinea.">
      {(step) => <SceneBox step={step} />}
    </Stepper>
  )
}
