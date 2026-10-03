/**
 * Scene 1 „Gurati ili povlačiti”: push (CI holds a cluster-admin key and applies through the firewall) vs pull
 * (Argo CD inside the cluster pulls from Git, only outbound traffic) – and why pull moves the keys instead of removing
 * them (whoever can merge to the config repo deploys; Argo CD itself has broad rights). Drawing is a pure function of
 * the step; two layouts by container width.
 */
import { Arrow, CommitString, Diagram, Drawer, Helm, LoopMagnifier, MiniLaptop, MiniPerson, PodShape, Rough, StepBadge, Stepper, stepColor, useWidth } from '../../../kit'
import { Firewall, FirewallH, KeyGlyph, NotebookPage, Padlock, T } from './parts'
import styles from '../styles.module.css'

const STEPS = [
  {
    title: 'Guranje: CI drži ključ klastera',
    body: 'Pipeline iz prošlog predavanja na kraju sam izvodi kubectl apply. Za to u tajnama CI-ja stoji kubeconfig s pravima administratora klastera – ključ koji otvara sve, i to izvana, kroz vatrozid.',
  },
  {
    title: 'Ključ je izvan klastera, a nitko ne uspoređuje',
    body: 'Tko dođe do tog ključa, mijenja produkciju. A ručni kubectl edit u 02:00 nitko ne primijeti: u klasteru nema nikoga tko bi stanje uspoređivao s Gitom.',
  },
  {
    title: 'Povlačenje: agent u klasteru čita Git',
    body: 'Argo CD radi unutar klastera i sam povlači željeno stanje iz Gita. CI više ne treba ključ klastera – samo sprema novi digest slike u config repozitorij. Argo CD sam izlazi prema Gitu; jedini ulazni promet je neobvezni webhook – obavijest „imam novi commit”, bez ikakvog ključa klastera.',
  },
  {
    title: 'Ključ se premjestio, nije nestao',
    body: 'Tko smije spremiti u granu main config repozitorija, postavlja u produkciju, a Argo CD u klasteru ima široka prava. Zato: zaštita grane, obvezan pregled, potpisani commitovi, AppProject koji ograničava što aplikacije smiju – i RBAC za sam Argo CD.',
  },
]

export function PushPullStepper() {
  return (
    <Stepper steps={STEPS} title="Gurati ili povlačiti" autoPlay={0} caption="Crvena strelica = put s ključem klastera izvana. Plava = commit u Git i povlačenje iz Gita.">
      {(step) => <PushPullDrawing step={step} />}
    </Stepper>
  )
}

function PushPullDrawing({ step }: { step: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const wide = width !== null && width >= 640
  const pull = step >= 2
  const col = stepColor(step)
  const label = [
    'Model guranja: CI ima ključ klastera i izvodi kubectl apply kroz vatrozid u klaster.',
    'Ključ je izvan klastera: napadač s ključem i ručni kubectl edit u 02:00 mijenjaju klaster, a nitko ne uspoređuje s Gitom.',
    'Model povlačenja: Argo CD u klasteru povlači iz config repozitorija; CI samo sprema commit u Git i nema ključ klastera.',
    'Ključ se premjestio: config repozitorij zaključan (pregled, potpisi), Argo CD ima široka prava; AppProject ograničava što aplikacije smiju (samo Namespace klopa).',
  ][step]
  const pods = (xs: number[], y: number) => xs.map((x, i) => <PodShape key={i} x={x} y={y} size={30} status="running" tone="blue" />)
  if (wide) {
    return (
      <div ref={ref} className={styles.stepFig}>
        <Diagram width={720} height={310} label={label}>
          <T x={20} y={26} font="hand" size={20}>
            izvan klastera
          </T>
          <T x={450} y={26} font="hand" size={20}>
            klaster
          </T>
          <Firewall x={412} y1={40} y2={300} seed={2701} />
          <Rough shape={{ k: 'rect', x: 434, y: 36, w: 278, h: 266 }} seed={2702} stroke="var(--pen)" strokeWidth={1.7} />
          <Rough shape={{ k: 'rect', x: 438, y: 40, w: 270, h: 258 }} seed={2703} stroke="var(--pen)" strokeWidth={1.1} />
          <Helm x={692} y={56} r={11} seed={2704} />
          {/* outside: CI, the config repo, a laptop */}
          <Drawer x={28} y={48} w={92} h={56} seed={2705} />
          <T x={74} y={124} font="ui" size={15} weight={700} anchor="middle">
            CI
          </T>
          <NotebookPage x={20} y={190} w={190} h={104} seed={2706} />
          <T x={50} y={218} font="ui" size={14} weight={700}>
            config repozitorij
          </T>
          <CommitString x={52} y={256} w={130} n={3} r={6} seed={2707} />
          <MiniLaptop x={250} y={222} w={72} h={50} seed={2708} />
          {/* cluster: Pods, and Argo CD once we pull */}
          {pods([548, 600, 652], 246)}
          {pull && (
            <g>
              <LoopMagnifier cx={492} cy={108} r={26} seed={2709} />
              <T x={492} y={162} font="hand" size={20} anchor="middle" fill="var(--pen)">
                Argo CD
              </T>
            </g>
          )}
          {!pull && (
            <g>
              <KeyGlyph x={160} y={100} s={1.3} stroke="var(--red)" seed={2710} />
              <T x={160} y={130} size={13.5} anchor="middle" fill="var(--red)" weight={600}>
                cluster-admin
              </T>
              <Arrow pts={[[122, 74], [600, 74], [600, 214]]} stroke="var(--red)" strokeWidth={2} seed={2711} />
              <T x={210} y={64} size={13.5} fill="var(--red)" weight={600}>
                kubectl apply
              </T>
            </g>
          )}
          {step === 1 && (
            <g>
              <MiniPerson cx={300} cy={128} s={40} shirt="var(--hl-pink-ink)" hair="cap" seed={2712} />
              <KeyGlyph x={336} y={150} s={1} stroke="var(--red)" seed={2713} />
              <Arrow pts={[[350, 150], [548, 150], [548, 214]]} stroke="var(--red)" strokeWidth={1.8} dash="7 5" seed={2714} />
              <T x={286} y={292} size={13.5} anchor="middle" fill="var(--red)">
                02:00 kubectl edit
              </T>
              <Arrow pts={[[324, 250], [516, 250]]} stroke="var(--red)" strokeWidth={1.8} dash="7 5" seed={2715} />
              <T x={520} y={120} font="hand" size={20} anchor="middle" fill="var(--red)">
                nitko ne primijeti
              </T>
            </g>
          )}
          {pull && (
            <g>
              <KeyGlyph x={160} y={100} s={1.1} stroke="var(--ink-3)" seed={2716} crossed />
              <T x={160} y={130} size={13.5} anchor="middle" fill="var(--ink-2)">
                bez ključa klastera
              </T>
              <Arrow pts={[[74, 108], [74, 186]]} stroke="var(--pen)" strokeWidth={1.8} seed={2717} />
              <T x={84} y={156} size={13.5} fill="var(--pen)">
                commit
              </T>
              <Arrow pts={[[464, 118], [214, 232]]} stroke="var(--pen)" strokeWidth={1.9} seed={2718} />
              <T x={300} y={162} font="hand" size={20} fill="var(--pen)">
                povlači
              </T>
            </g>
          )}
          {step === 3 && (
            <g>
              <Padlock x={196} y={254} s={1.2} seed={2719} />
              <KeyGlyph x={552} y={102} s={1.1} stroke="var(--orange)" seed={2720} />
              <T x={576} y={107} size={13.5} fill="var(--orange)" weight={600}>
                široka prava
              </T>
              <Rough shape={{ k: 'rect', x: 516, y: 200, w: 172, h: 86 }} seed={2721} stroke="var(--green)" strokeWidth={1.4} dash="6 5" />
              <T x={602} y={196} size={13.5} anchor="middle" fill="var(--green)" weight={600}>
                AppProject: klopa
              </T>
              <T x={115} y={180} font="hand" size={20} anchor="middle" fill="var(--orange)">
                ključ je sada Git
              </T>
            </g>
          )}
          <StepBadge n={step + 1} x={380} y={40} color={col} />
        </Diagram>
      </div>
    )
  }
  return (
    <div ref={ref} className={styles.stepFig}>
      <div style={{ maxWidth: 460, margin: '0 auto' }}>
        <Diagram width={360} height={470} label={label}>
          <NotebookPage x={14} y={30} w={200} h={96} seed={2731} />
          <T x={40} y={58} font="ui" size={14} weight={700}>
            config repozitorij
          </T>
          <CommitString x={44} y={94} w={140} n={3} r={6} seed={2732} />
          <Drawer x={260} y={34} w={84} h={52} seed={2733} />
          <T x={302} y={106} font="ui" size={15} weight={700} anchor="middle">
            CI
          </T>
          <MiniLaptop x={20} y={160} w={70} h={46} seed={2734} />
          <FirewallH y={236} x1={6} x2={354} seed={2735} />
          <Rough shape={{ k: 'rect', x: 6, y: 252, w: 348, h: 210 }} seed={2736} stroke="var(--pen)" strokeWidth={1.7} />
          <Rough shape={{ k: 'rect', x: 10, y: 256, w: 340, h: 202 }} seed={2737} stroke="var(--pen)" strokeWidth={1.1} />
          <T x={24} y={282} font="hand" size={20}>
            klaster
          </T>
          <Helm x={334} y={272} r={10} seed={2738} />
          {pods([200, 250, 300], 416)}
          {pull && (
            <g>
              <LoopMagnifier cx={130} cy={330} r={24} seed={2739} />
              <T x={130} y={378} font="hand" size={20} anchor="middle" fill="var(--pen)">
                Argo CD
              </T>
            </g>
          )}
          {!pull && (
            <g>
              <KeyGlyph x={238} y={124} s={1.25} stroke="var(--red)" seed={2740} />
              <T x={238} y={152} size={14} anchor="middle" fill="var(--red)" weight={600}>
                cluster-admin
              </T>
              <Arrow pts={[[302, 90], [302, 392]]} stroke="var(--red)" strokeWidth={2} seed={2741} />
            </g>
          )}
          {step === 1 && (
            <g>
              <MiniPerson cx={176} cy={186} s={34} shirt="var(--hl-pink-ink)" hair="cap" seed={2742} />
              <Arrow pts={[[200, 214], [232, 392]]} stroke="var(--red)" strokeWidth={1.8} dash="7 5" seed={2743} />
              <T x={98} y={186} size={14} fill="var(--red)">
                02:00
              </T>
              <Arrow pts={[[84, 208], [110, 404], [176, 414]]} stroke="var(--red)" strokeWidth={1.8} dash="7 5" seed={2744} />
            </g>
          )}
          {pull && (
            <g>
              <KeyGlyph x={238} y={124} s={1.05} stroke="var(--ink-3)" seed={2745} crossed />
              <Arrow pts={[[262, 62], [218, 72]]} stroke="var(--pen)" strokeWidth={1.8} seed={2746} />
              <Arrow pts={[[130, 304], [130, 130]]} stroke="var(--pen)" strokeWidth={1.9} seed={2747} />
              <T x={142} y={196} font="hand" size={20} fill="var(--pen)">
                povlači
              </T>
            </g>
          )}
          {step === 3 && (
            <g>
              <Padlock x={196} y={52} s={1.1} seed={2748} />
              <KeyGlyph x={186} y={326} s={1} stroke="var(--orange)" seed={2749} />
              <T x={206} y={331} size={14} fill="var(--orange)" weight={600}>
                široka prava
              </T>
              <Rough shape={{ k: 'rect', x: 170, y: 380, w: 170, h: 70 }} seed={2750} stroke="var(--green)" strokeWidth={1.4} dash="6 5" />
              <T x={255} y={374} size={14} anchor="middle" fill="var(--green)" weight={600}>
                AppProject: klopa
              </T>
            </g>
          )}
          <StepBadge n={step + 1} x={330} y={140} color={col} />
        </Diagram>
      </div>
    </div>
  )
}
