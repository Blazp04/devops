/**
 * Scene 2 „Matrjoška petlji”: the thermostat from lecture 10, a Kubernetes controller (objects in the API server →
 * Pods) and Argo CD (Git → objects in the cluster) are the same reconciliation loop; then the controller loop drawn
 * inside the cluster that Argo CD reconciles. Ghost/solid grammar: desired state is drawn dashed, live state solid.
 * Controllers and Argo CD talk only to the API server – only the API server talks to etcd. Two layouts by container
 * width; the drawing is a pure function of the step.
 */
import type { ReactNode } from 'react'
import { Arrow, CommitString, Cylinder, Diagram, LoopArrows, LoopMagnifier, PodShape, Rough, StepBadge, Stepper, stepColor, useWidth } from '../../../kit'
import { ClusterFrame, NotebookPage, T } from './parts'
import styles from '../styles.module.css'

const STEPS = [
  {
    title: 'Termostat: željeno i izmjereno',
    body: 'Iz desetog predavanja: termostat ne zna kako se grije, zna samo usporediti postavku (21 °C) s izmjerenim (19 °C) i ispraviti razliku. I tako u krug.',
  },
  {
    title: 'Kubernetes: API poslužitelj je postavka, Podovi su soba',
    body: 'Kontroler ReplicaSeta preko API poslužitelja čita željeno stanje (replicas: 4, zapisano u bazi etcd), broji Podove koji stvarno rade (3) i dodaje jedan. Ista petlja usklađivanja.',
  },
  {
    title: 'Argo CD: Git je postavka, klaster je soba',
    body: 'Argo CD čita ciljano stanje iz Gita (image: 2.0.1), uspoređuje ga sa stvarnim stanjem objekata u klasteru (1.4.0) i primjenjuje razliku. Opet ista petlja – samo razinu više.',
  },
  {
    title: 'Petlja u petlji',
    body: 'Argo CD usklađuje objekte u klasteru s Gitom (i on ih piše preko API poslužitelja), a unutar klastera kontroleri Kubernetesa usklađuju Podove s tim objektima. Ono što je za Argo CD „stvarno”, za kontroler je „željeno”.',
  },
]

export function LoopsStepper() {
  return (
    <Stepper steps={STEPS} title="Matrjoška petlji" autoPlay={0} caption="Iscrtkano = željeno stanje, puna linija = stvarno stanje. Plave strelice u krug = petlja usklađivanja.">
      {(step) => <LoopsDrawing step={step} />}
    </Stepper>
  )
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** A card: dashed for the desired state, solid for the live one, with a small title. */
function Card({ b, desired, title, seed, children }: { b: Box; desired: boolean; title: string; seed: number; children?: ReactNode }) {
  return (
    <g>
      <Rough shape={{ k: 'rect', x: b.x, y: b.y, w: b.w, h: b.h }} seed={seed} strokeWidth={1.6} stroke={desired ? 'var(--ink-2)' : 'var(--ink)'} dash={desired ? '7 5' : undefined} fillColor="var(--paper)" fillStyle="solid" />
      <T x={b.x + b.w / 2} y={b.y - 8} font="hand" size={20} anchor="middle" fill={desired ? 'var(--ink-2)' : 'var(--ink)'}>
        {title}
      </T>
      {children}
    </g>
  )
}

function Thermo({ b, value, desired }: { b: Box; value: string; desired: boolean }) {
  return (
    <T x={b.x + b.w / 2} y={b.y + b.h / 2 + 10} size={28} anchor="middle" weight={700} fill={desired ? 'var(--ink-2)' : 'var(--red)'}>
      {value}
    </T>
  )
}

/** A loop with its name below it, or – with `left` – to its left (narrow layouts, where arrows run vertically). */
function DrawLoop({ cx, cy, r, title, argo, left }: { cx: number; cy: number; r: number; title: string; argo?: boolean; left?: boolean }) {
  return (
    <g>
      {argo ? <LoopMagnifier cx={cx} cy={cy} r={r} seed={2801} /> : <LoopArrows cx={cx} cy={cy} r={r} seed={2802} />}
      <T x={left ? cx - r - 12 : cx} y={left ? cy + 7 : cy + r + 26} font="hand" size={20} anchor={left ? 'end' : 'middle'} fill="var(--pen)">
        {title}
      </T>
    </g>
  )
}

function Pods({ x, y, step }: { x: number; y: number; step: number }) {
  return (
    <g>
      {[0, 1, 2].map((i) => (
        <PodShape key={i} x={x + i * 40} y={y} size={30} status="running" tone="blue" />
      ))}
      <PodShape x={x + 120} y={y} size={30} status={step === 1 ? 'creating' : 'running'} tone="blue" />
    </g>
  )
}

function LoopsDrawing({ step }: { step: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const wide = width !== null && width >= 640
  const col = stepColor(step)
  const label = [
    'Termostat: željeno 21 °C (iscrtkano), izmjereno 19 °C (puna linija), petlja između njih grije.',
    'Kubernetes: u API poslužitelju (etcd) replicas: 4 (iscrtkano), u klasteru 3 Poda i četvrti se stvara; petlja je kontroler ReplicaSeta.',
    'Argo CD: u Gitu image 2.0.1 (iscrtkano), u klasteru 1.4.0 (puna linija); petlja je Argo CD.',
    'Petlja u petlji: Argo CD usklađuje objekte u klasteru (API poslužitelj, etcd) s Gitom; unutar klastera kontroleri usklađuju Podove s tim objektima. Objekti su za Argo CD stvarno, a za kontroler željeno stanje.',
  ][step]
  if (wide) {
    const L: Box = { x: 40, y: 70, w: 190, h: 130 }
    const R: Box = { x: 490, y: 70, w: 190, h: 130 }
    return (
      <div ref={ref} className={styles.stepFig}>
        <Diagram width={720} height={290} label={label}>
          {step < 3 && (
            <g>
              <Card b={L} desired title={['postavka', 'željeno (API server)', 'ciljano (Git)'][step]} seed={2811}>
                {step === 0 && <Thermo b={L} value="21 °C" desired />}
                {step === 1 && (
                  <g>
                    <Cylinder x={L.x + 22} y={L.y + 26} w={56} h={66} seed={2812} />
                    <T x={L.x + 50} y={L.y + 116} size={13.5} anchor="middle" fill="var(--ink-2)">
                      API · etcd
                    </T>
                    <T x={L.x + 96} y={L.y + 66} size={14} weight={700}>
                      replicas: 4
                    </T>
                  </g>
                )}
                {step === 2 && (
                  <g>
                    <NotebookPage x={L.x + 14} y={L.y + 18} w={L.w - 28} h={L.h - 34} seed={2813} />
                    <CommitString x={L.x + 50} y={L.y + 50} w={110} n={3} r={5} seed={2814} />
                    <T x={L.x + 44} y={L.y + 86} size={14} weight={700}>
                      image: 2.0.1
                    </T>
                  </g>
                )}
              </Card>
              <Card b={R} desired={false} title={['izmjereno', 'stvarno (klaster)', 'stvarno (klaster)'][step]} seed={2815}>
                {step === 0 && <Thermo b={R} value="19 °C" desired={false} />}
                {step === 1 && <Pods x={R.x + 35} y={R.y + 70} step={step} />}
                {step === 2 && (
                  <g>
                    <Cylinder x={R.x + 22} y={R.y + 26} w={56} h={66} seed={2816} />
                    <T x={R.x + 50} y={R.y + 116} size={13.5} anchor="middle" fill="var(--ink-2)">
                      API · etcd
                    </T>
                    <T x={R.x + 92} y={R.y + 66} size={14} weight={700} fill="var(--red)">
                      image: 1.4.0
                    </T>
                  </g>
                )}
              </Card>
              <DrawLoop cx={360} cy={128} r={52} title={['termostat', 'kontroler ReplicaSeta', 'Argo CD'][step]} argo={step === 2} />
              <Arrow pts={[[236, 128], [300, 128]]} stroke="var(--ink-2)" strokeWidth={1.4} dash="5 5" seed={2817} />
              <Arrow pts={[[420, 128], [484, 128]]} stroke="var(--pen)" strokeWidth={1.8} seed={2818} />
              <T x={452} y={118} size={13.5} anchor="middle" fill="var(--pen)" weight={600}>
                {['grije', '+1 Pod', 'primijeni'][step]}
              </T>
              <T x={268} y={118} size={13.5} anchor="middle" fill="var(--ink-2)">
                čita
              </T>
              <T x={360} y={262} font="hand" size={20} anchor="middle" fill={col}>
                {['razlika 2 °C → grij', 'razlika 1 Pod → stvori ga', 'razlika u slici → primijeni Git'][step]}
              </T>
            </g>
          )}
          {step === 3 && (
            <g>
              {/* outer loop: Argo CD compares Git with the objects in the cluster */}
              <T x={76} y={80} font="hand" size={20} anchor="middle" fill="var(--ink-2)">
                Git (željeno)
              </T>
              <NotebookPage x={18} y={94} w={116} h={92} seed={2821} />
              <Rough shape={{ k: 'rect', x: 12, y: 88, w: 128, h: 104 }} seed={2822} stroke="var(--ink-2)" strokeWidth={1.3} dash="7 5" />
              <CommitString x={36} y={124} w={80} n={3} r={5} seed={2823} />
              <T x={76} y={164} size={13.5} anchor="middle" weight={700}>
                image: 2.0.1
              </T>
              <Arrow pts={[[142, 140], [158, 140]]} stroke="var(--ink-2)" strokeWidth={1.4} dash="5 5" seed={2826} />
              <DrawLoop cx={196} cy={140} r={32} title="Argo CD" argo />
              <ClusterFrame x={252} y={48} w={456} h={204} seed={2830} />
              <T x={264} y={40} font="hand" size={20}>
                klaster (stvarno za Argo CD)
              </T>
              <Arrow pts={[[232, 140], [284, 140]]} stroke="var(--pen)" strokeWidth={1.8} seed={2827} />
              {/* the shared ring: objects in the API server – live for Argo CD (solid), desired for the controllers (dashed) */}
              <Rough shape={{ k: 'rect', x: 288, y: 92, w: 106, h: 104 }} seed={2824} stroke="var(--ink)" strokeWidth={1.5} />
              <Rough shape={{ k: 'rect', x: 295, y: 99, w: 92, h: 90 }} seed={2825} stroke="var(--ink-2)" strokeWidth={1.2} dash="6 4" />
              <Cylinder x={315} y={106} w={52} h={58} seed={2828} />
              <T x={341} y={182} size={13.5} anchor="middle" weight={700}>
                API · etcd
              </T>
              <T x={341} y={224} font="hand" size={20} anchor="middle" fill="var(--ink)">
                za Argo CD stvarno,
              </T>
              <T x={341} y={244} font="hand" size={20} anchor="middle" fill="var(--ink-2)">
                za kontroler željeno
              </T>
              {/* inner loop: the controllers compare those objects with the Pods */}
              <Arrow pts={[[398, 140], [428, 140]]} stroke="var(--ink-2)" strokeWidth={1.4} dash="5 5" seed={2829} />
              <DrawLoop cx={468} cy={140} r={34} title="kontroleri" />
              <Arrow pts={[[508, 140], [540, 140]]} stroke="var(--pen)" strokeWidth={1.8} seed={2831} />
              <Pods x={560} y={140} step={step} />
              <T x={620} y={100} font="hand" size={20} anchor="middle">
                Podovi (stvarno)
              </T>
              <T x={480} y={280} font="hand" size={20} anchor="middle" fill={col}>
                petlja u petlji: Git → objekti → Podovi
              </T>
            </g>
          )}
          <StepBadge n={step + 1} x={30} y={30} color={col} />
        </Diagram>
      </div>
    )
  }
  // narrow: desired on top, loop in the middle, live below
  const top: Box = { x: 70, y: 52, w: 220, h: 110 }
  const bot: Box = { x: 70, y: 318, w: 220, h: 110 }
  return (
    <div ref={ref} className={styles.stepFig}>
      <div style={{ maxWidth: 460, margin: '0 auto' }}>
        <Diagram width={360} height={480} label={label}>
          {step < 3 && (
            <g>
              <Card b={top} desired title={['postavka', 'željeno (API server)', 'ciljano (Git)'][step]} seed={2831}>
                {step === 0 && <Thermo b={top} value="21 °C" desired />}
                {step === 1 && (
                  <g>
                    <Cylinder x={top.x + 22} y={top.y + 22} w={50} h={60} seed={2832} />
                    <T x={top.x + 92} y={top.y + 60} size={14} weight={700}>
                      replicas: 4
                    </T>
                  </g>
                )}
                {step === 2 && (
                  <g>
                    <CommitString x={top.x + 40} y={top.y + 40} w={130} n={3} r={5} seed={2833} />
                    <T x={top.x + 40} y={top.y + 84} size={14} weight={700}>
                      image: 2.0.1
                    </T>
                  </g>
                )}
              </Card>
              <DrawLoop cx={180} cy={232} r={42} title={['termostat', 'kontroler', 'Argo CD'][step]} argo={step === 2} left />
              <Arrow pts={[[180, 166], [180, 184]]} stroke="var(--ink-2)" strokeWidth={1.4} dash="4 4" seed={2834} />
              <Arrow pts={[[262, 250], [262, 312]]} stroke="var(--pen)" strokeWidth={1.8} seed={2835} />
              <T x={272} y={286} size={14} fill="var(--pen)" weight={600}>
                {['grije', '+1 Pod', 'primijeni'][step]}
              </T>
              <Card b={bot} desired={false} title={['izmjereno', 'stvarno (klaster)', 'stvarno (klaster)'][step]} seed={2836}>
                {step === 0 && <Thermo b={bot} value="19 °C" desired={false} />}
                {step === 1 && <Pods x={bot.x + 50} y={bot.y + 60} step={step} />}
                {step === 2 && (
                  <g>
                    <Cylinder x={bot.x + 22} y={bot.y + 22} w={50} h={60} seed={2837} />
                    <T x={bot.x + 92} y={bot.y + 60} size={14} weight={700} fill="var(--red)">
                      image: 1.4.0
                    </T>
                  </g>
                )}
              </Card>
              <T x={180} y={466} font="hand" size={20} anchor="middle" fill={col}>
                {['razlika 2 °C → grij', 'razlika 1 Pod → stvori ga', 'razlika → primijeni Git'][step]}
              </T>
            </g>
          )}
          {step === 3 && (
            <g>
              <Rough shape={{ k: 'rect', x: 52, y: 16, w: 160, h: 70 }} seed={2841} stroke="var(--ink-2)" strokeWidth={1.3} dash="7 5" fillColor="var(--paper)" fillStyle="solid" />
              <CommitString x={72} y={40} w={120} n={3} r={5} seed={2842} />
              <T x={132} y={72} size={14} anchor="middle" weight={700}>
                image: 2.0.1
              </T>
              <T x={222} y={56} font="hand" size={20}>
                Git (željeno)
              </T>
              <Arrow pts={[[132, 88], [132, 100]]} stroke="var(--ink-2)" strokeWidth={1.4} dash="4 4" seed={2845} />
              <LoopMagnifier cx={132} cy={128} r={26} seed={2801} />
              <T x={170} y={135} font="hand" size={20} fill="var(--pen)">
                Argo CD
              </T>
              <ClusterFrame x={14} y={176} w={332} h={296} seed={2843} />
              <T x={24} y={170} font="hand" size={20}>
                klaster
              </T>
              <Arrow pts={[[132, 158], [132, 196]]} stroke="var(--pen)" strokeWidth={1.8} seed={2846} />
              <Rough shape={{ k: 'rect', x: 92, y: 200, w: 80, h: 84 }} seed={2844} stroke="var(--ink)" strokeWidth={1.5} />
              <Rough shape={{ k: 'rect', x: 98, y: 206, w: 68, h: 72 }} seed={2847} stroke="var(--ink-2)" strokeWidth={1.2} dash="6 4" />
              <Cylinder x={109} y={214} w={46} h={56} seed={2848} />
              <T x={132} y={302} size={14} anchor="middle" weight={700}>
                API · etcd
              </T>
              <T x={184} y={232} font="hand" size={20}>
                Argo CD: stvarno
              </T>
              <T x={184} y={258} font="hand" size={20} fill="var(--ink-2)">
                kontroler: željeno
              </T>
              <Arrow pts={[[132, 308], [132, 318]]} stroke="var(--ink-2)" strokeWidth={1.4} dash="4 4" seed={2849} />
              <LoopArrows cx={132} cy={348} r={28} seed={2802} />
              <T x={172} y={355} font="hand" size={20} fill="var(--pen)">
                kontroleri
              </T>
              <Arrow pts={[[132, 380], [132, 404]]} stroke="var(--pen)" strokeWidth={1.8} seed={2850} />
              <Pods x={72} y={432} step={step} />
              <T x={222} y={438} font="hand" size={20}>
                Podovi
              </T>
            </g>
          )}
          <StepBadge n={step + 1} x={28} y={30} color={col} />
        </Diagram>
      </div>
    </div>
  )
}
