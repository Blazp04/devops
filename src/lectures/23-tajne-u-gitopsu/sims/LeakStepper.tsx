import { Arrow, Check, Cylinder, Diagram, Disk, Drawer, Envelope, MiniLaptop, Phone, Rough, Stepper, stepColor, StepBadge, SvgStamp } from '../../../kit'
import { leakScene } from '../lib/scenes'
import { Bead, Fit, Lines, Txt } from './Draw'

const W = { w: 720, h: 360, mono: 15, hand: 21 }
const N = { w: 400, h: 680, mono: 15, hand: 22 }
const WIDE_MIN = Math.ceil((W.w * 12) / (W.mono - 1))

interface Geo {
  w: number
  h: number
  mono: number
  hand: number
  gitY: number
  beadX: (i: number) => number
  env: [number, number]
  b64: [number, number]
  plain: [number, number]
  redis: [number, number]
  clones: [number, number][]
  phone: [number, number]
  /** „HEAD je čist, povijest nije” */
  clean: [number, number]
  /** the hand note under the clones */
  bottom: [number, number]
}

const GW: Geo = {
  ...W,
  gitY: 128,
  beadX: (i) => 60 + i * 92,
  env: [250, 34],
  b64: [300, 50],
  plain: [300, 82],
  redis: [640, 128],
  clones: [
    [70, 272],
    [214, 272],
    [370, 272],
    [526, 272],
  ],
  phone: [652, 262],
  clean: [0, 190],
  bottom: [270, 346],
}

const GN: Geo = {
  ...N,
  gitY: 136,
  beadX: (i) => 40 + i * 80,
  env: [252, 52],
  b64: [200, 218],
  plain: [200, 246],
  redis: [96, 560],
  clones: [
    [90, 330],
    [290, 330],
    [90, 444],
    [290, 444],
  ],
  phone: [300, 552],
  clean: [200, 278],
  bottom: [200, 662],
}

const CLONE_NAMES = ['Lanin klon', 'Ivin klon', 'CI predmemorija', 'sigurnosna kopija']

function Frame({ step, g }: { step: number; g: Geo }) {
  const sc = leakScene()
  const fr = sc.frames[step]
  const commits = fr.commits
  const leakI = commits.findIndex((c) => c.leak)
  const stale = step >= 4
  const headI = commits.length - 1
  const lastX = g.beadX(Math.max(4, commits.length - 1))
  const c1 = stepColor(1)
  const c2 = stepColor(2)
  const label = `Povijest Gita, korak ${step + 1}: ${commits.map((c) => c.short + (c.leak ? ' (Secret u base64)' : '')).join(', ')}. ${fr.exposedCurrent.length ? 'Važeći SMS ključ čitljiv je iz povijesti.' : 'Iz povijesti se čita samo opozvana vrijednost.'}`
  return (
    <Diagram width={g.w} height={g.h} label={label}>
      {/* the Git string */}
      <Txt x={14} y={g.gitY - 50} v="hand" size={g.hand} fill="var(--ink-2)" anchor="start">
        povijest Gita
      </Txt>
      <Rough shape={{ k: 'line', x1: g.beadX(0) - 24, y1: g.gitY, x2: lastX + 24, y2: g.gitY }} seed={2601} strokeWidth={1.6} />
      {commits.map((c, i) => {
        const x = g.beadX(i)
        const tone = c.leak ? (stale ? 'stale' : 'leak') : i === headI ? 'pen' : 'plain'
        return (
          <g key={c.short}>
            <Bead x={x} y={g.gitY} tone={tone} seed={2610 + i * 7} />
            <Txt x={x} y={g.gitY + 30} size={g.mono} fill={c.leak && !stale ? 'var(--red)' : 'var(--ink-2)'}>
              {c.short}
            </Txt>
          </g>
        )
      })}
      <Txt x={g.w === W.w ? g.beadX(headI) + 14 : g.beadX(headI)} y={g.w === W.w ? g.gitY - 14 : g.gitY + 54} v="hand" size={g.hand} fill="var(--pen)" anchor={g.w === W.w ? 'start' : 'middle'}>
        HEAD
      </Txt>

      {/* step 0: the manual Secret is not in Git */}
      {step === 0 && (
        <Lines x={g.w === W.w ? 420 : 200} y={g.w === W.w ? 220 : 250} lines={['lozinka baze: samo', 'kubectl apply s laptopa']} gap={g.hand + 2} v="hand" size={g.hand} fill="var(--red)" />
      )}

      {/* the leaked commit: an open envelope with base64 inside */}
      {leakI >= 0 && (
        <g>
          <Envelope x={g.env[0] - 30} y={g.env[1]} w={60} h={40} open seed={2630} />
          <Arrow pts={[[g.env[0], g.env[1] + 44], [g.beadX(leakI), g.gitY - 12]]} stroke={stale ? 'var(--ink-3)' : 'var(--red)'} strokeWidth={1.3} seed={2631} />
          <Txt x={g.b64[0]} y={g.b64[1]} size={g.mono} anchor={g.w === W.w ? 'start' : 'middle'} fill={stale ? 'var(--ink-3)' : 'var(--ink)'} strike={stale}>
            {`SMS_API_KEY: ${sc.base64}`}
          </Txt>
          {step >= 2 && (
            <Txt x={g.plain[0]} y={g.plain[1]} size={g.mono} anchor={g.w === W.w ? 'start' : 'middle'} fill={stale ? 'var(--ink-3)' : 'var(--red)'} strike={stale}>
              {`base64 -d → ${sc.value}`}
            </Txt>
          )}
          {step === 1 && <StepBadge n={2} x={g.env[0] + 46} y={g.env[1] + 4} color={c1} />}
        </g>
      )}

      {/* step 3: removal commit – HEAD is clean, history is not */}
      {step >= 3 && (
        <g>
          <Check x={g.beadX(headI) + 66} y={g.gitY - 26} size={8} />
          <Lines
            x={g.w === W.w ? g.beadX(headI) + 6 : g.clean[0]}
            y={g.w === W.w ? g.gitY + 62 : g.clean[1]}
            lines={g.w === W.w ? ['HEAD je čist,', 'povijest nije'] : ['HEAD je čist, povijest nije']}
            gap={g.hand}
            v="hand"
            size={g.hand}
            fill={c2}
          />
        </g>
      )}

      {/* Argo CD's cache */}
      {step >= 1 && (
        <g>
          <Cylinder x={g.redis[0] - 24} y={g.redis[1] - 26} w={48} h={50} seed={2640} />
          <Txt x={g.redis[0]} y={g.redis[1] + 46} v="display" size={g.mono} fill="var(--ink-2)">
            Redis (Argo CD)
          </Txt>
          <Txt x={g.redis[0]} y={g.redis[1] + 68} size={g.mono - 1} fill={fr.cache ? 'var(--red)' : 'var(--ink-3)'} strike={!fr.cache}>
            {fr.cache ? 'čitljiv manifest' : 'stara vrijednost'}
          </Txt>
        </g>
      )}

      {/* clones keep everything */}
      {step >= 2 &&
        g.clones.map(([x, y], i) => (
          <g key={i}>
            {i < 2 ? <MiniLaptop x={x - 30} y={y - 22} w={60} h={42} /> : i === 2 ? <Drawer x={x - 28} y={y - 22} w={56} h={42} /> : <Disk x={x - 26} y={y - 22} w={52} h={42} />}
            <Bead x={x + 34} y={y - 18} r={7} tone={stale ? 'stale' : 'leak'} seed={2650 + i * 5} />
            <Txt x={x} y={y + 42} v="display" size={g.mono} fill="var(--ink-2)">
              {CLONE_NAMES[i]}
            </Txt>
          </g>
        ))}
      {step >= 2 && step < 4 && (
        <Txt x={g.bottom[0]} y={g.bottom[1]} v="hand" size={g.hand} fill={step === 3 ? c2 : c1}>
          {step === 3 ? 'git push --force ne dira klonove' : 'svaki klon ima procurjeli commit'}
        </Txt>
      )}

      {/* step 4: rotation – the leaked value opens nothing any more */}
      {stale && (
        <g>
          <SvgStamp x={g.env[0] + (g.w === W.w ? 0 : 90)} y={g.env[1] + 20} text="OPOZVAN" size={15} />
          <Phone x={g.phone[0] - 30} y={g.phone[1] - 30} w={60} h={56} text="v2" textSize={13} />
          <Lines x={g.phone[0]} y={g.phone[1] + 50} lines={['novi ključ v2:', 'nikad u Git']} gap={g.hand} v="hand" size={g.hand} fill="var(--green)" />
        </g>
      )}
    </Diagram>
  )
}

/** Scene 1 „Dilema”: a Secret in base64 lands in Git; deleting it does not help, only rotation does (frames from E6). */
export function LeakStepper() {
  const sc = leakScene()
  return (
    <Stepper
      title="Procurjeli commit"
      steps={[
        { title: 'Sve što opisuje Klopu je u Gitu', body: 'Argo CD primjenjuje ono što je u Gitu. Lozinku baze Lana je primijenila ručno, pa je u Gitu nema – i zato je novi klaster nema.' },
        { title: 'Netko spremi Secret u Git', body: `Commit ${sc.leakShort} „Dodaj secret-sms.yaml”: SMS ključ u base64. Argo CD ga uredno primijeni i čitljiv manifest upiše u svoju predmemoriju.` },
        { title: 'Base64 nije šifra', body: 'Svatko s klonom repozitorija dekodira ga jednom naredbom. A klonovi su na laptopima, u CI-ju i u sigurnosnim kopijama.' },
        { title: 'Brisanje ne pomaže', body: `Commit ${sc.removalShort} uklanja datoteku. HEAD je čist, ali stari commit ostaje u povijesti. Čak i kad se povijest prepiše, klonovi ga i dalje imaju.` },
        { title: 'Pomaže samo rotacija', body: 'SMS-gateway izda novi ključ (v2), a stari opozove. Procurjela vrijednost i dalje se može pročitati, ali više ništa ne otvara.' },
      ]}
    >
      {(step) => <Fit wideMin={WIDE_MIN}>{(wide) => <Frame step={step} g={wide ? GW : GN} />}</Fit>}
    </Stepper>
  )
}
